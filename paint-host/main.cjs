const {app,BrowserWindow,ipcMain,Tray,Menu,nativeImage}=require('electron');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url'),{createHash,randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {validMessage,validTGA,editorMessage}=require('./protocol.cjs');
const {startConnectionChecks}=require('./connection-check.cjs');
const {relayConfiguration}=require('./relay-config.cjs');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'host-config.json'),'utf8').replace(/^\uFEFF/,''));
const root=path.resolve(config.studioDirectory),runtime=path.join(process.env.LOCALAPPDATA||app.getPath('userData'),'ASCRL Paint Host');
fs.mkdirSync(runtime,{recursive:true});app.setPath('userData',path.join(runtime,'browser-profile'));
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
if(!app.requestSingleInstanceLock()){app.quit();return;}
let editor,transport,server,tray,active=null,connected=false,upload=null,lastFrame=null,polling=false,backupBusy=false;
let connectionChecks=[];
let lastInput=Date.now(),lastBackup=0,lastBackupAttempt=0,lastPollSuccess=0,artworkRevision=0,dirty=true,frameAt=0,pendingFrame=null,frameTimer=null,validatedProject,declinedSession=null;
let backupQueue=Promise.resolve();const snapshotRequests=new Map();
const runtimeFile=path.join(runtime,'status.json');
const status=(state,extra={})=>{try{fs.writeFileSync(runtimeFile,JSON.stringify({state,at:new Date().toISOString(),pid:process.pid,connected,session:active?.id||null,...extra},null,2));}catch{};};
function log(message){fs.appendFileSync(path.join(runtime,'host.log'),new Date().toISOString()+' '+String(message).slice(0,400)+'\n');}
process.on('uncaughtException',e=>{log('ERROR '+e.message);status('error',{error:e.message});});
process.on('unhandledRejection',e=>log('REJECTION '+e?.message));
// The host credential never reaches a browser, source bundle, URL, or log.
const keyPath=path.join(runtime,'credential.bin');
const keyScript="Add-Type -AssemblyName System.Security; $p=Join-Path $env:LOCALAPPDATA 'ASCRL Paint Host/credential.bin'; [Console]::Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($p),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))";
const token=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',keyScript],{windowsHide:true,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid workstation credential.');
if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.supabaseUrl))throw Error('Invalid backend URL.');
async function rpc(action,payload={}){
 const r=await fetch(config.supabaseUrl+'/rest/v1/rpc/rc_paint_host',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_token:token,p_action:action,p_payload:payload}),signal:AbortSignal.timeout(action==='backup'?60000:15000)});
 let result;try{result=await r.json();}catch{const e=Error('Private host service returned an invalid response.');e.status=r.status;throw e;}
 if(!r.ok){const e=Error(result.message||'Private host service unavailable.');e.status=r.status;throw e;}return result;
}
function temporaryServiceError(e){return e?.status===429||e?.status>=500||['TimeoutError','AbortError','TypeError'].includes(e?.name);}
function control(data){if(transport&&!transport.isDestroyed())transport.webContents.send('transport-control',data);}
function closeStream(){
 connected=false;active=null;upload=null;
 if(transport&&!transport.isDestroyed())transport.webContents.send('transport-close');
 if(editor&&!editor.isDestroyed())editor.webContents.send('editor-connected',false);
 status('ready');
}
function validSender(e,win){return win&&!win.isDestroyed()&&e.sender.id===win.webContents.id;}
function snapshot(doc,localOnly=false){
 const pending=backupQueue.then(()=>saveSnapshot(doc,localOnly));backupQueue=pending.catch(()=>false);return pending;
}
async function saveSnapshot(doc,localOnly=false){
 backupBusy=true;let saved=false;const revision=artworkRevision;
 try{
  validatedProject(doc);
  const serialized=JSON.stringify(doc);if(Buffer.byteLength(serialized)>50*1024*1024)throw Error('This project exceeds the 50 MB cloud-copy limit. Local saves remain intact.');
  const folder=path.join(runtime,'artwork');await fsp.mkdir(folder,{recursive:true});
  const hash=createHash('sha256').update(serialized).digest('hex');const target=path.join(folder,doc.profile+'-'+hash+'.garage.json');
  if(!fs.existsSync(target))await fsp.writeFile(target,serialized,{flag:'wx'});
  saved=true;if(localOnly)return true;
  lastBackupAttempt=Date.now();
  const result=await rpc('backup',{doc});lastBackup=Date.now();if(revision===artworkRevision)dirty=false;control({type:'backup-complete',...result});status(connected?'connected':'ready',{lastBackup:new Date(lastBackup).toISOString()});
 }catch(e){control({type:'status',text:(saved?'Saved on this PC. Cloud copy unavailable: ':'Artwork copy failed: ')+e.message});log('Cloud copy failed: '+e.message);}finally{backupBusy=false;}
 return saved;
}
function preserveCurrent(){
 return new Promise((resolve,reject)=>{const requestId=randomUUID();const timer=setTimeout(()=>{snapshotRequests.delete(requestId);reject(Error('Current artwork could not be preserved. Restore was cancelled.'));},65000);snapshotRequests.set(requestId,ok=>{clearTimeout(timer);ok?resolve():reject(Error('Current artwork could not be preserved. Restore was cancelled.'));});editor.webContents.send('editor-snapshot',{requestId});});
}
function declineStream(){
 declinedSession=active?.id||null;closeStream();
}
function input(m){
 if(!connected||!active)return;
 if(m.type==='upload-chunk'){
  if(!upload||!m.bytes||m.bytes.byteLength>16384||upload.received+m.bytes.byteLength>upload.size){upload=null;return;}
  upload.chunks.push(Buffer.from(m.bytes));upload.received+=m.bytes.byteLength;return;
 }
 if(!validMessage(m))return;lastInput=Date.now();
 if(m.type==='resize'){editor.setContentSize(m.width,m.height);editor.webContents.send('editor-command',{type:'resized'});editor.webContents.invalidate();return;}
 if(m.type==='field'||m.type==='control'||m.type==='upload-cancel'||m.type==='cancel-pointers'||m.type==='pointer'&&m.pointerType==='touch'){editor.webContents.send('editor-command',m);return;}
 if(m.type==='upload-start'){upload={...m,chunks:[],received:0,started:Date.now()};return;}
 if(m.type==='upload-end'){
  const f=upload;upload=null;if(!f||f.size!==f.received||Date.now()-f.started>300000)return;
  editor.webContents.send('editor-upload',{id:f.id,name:path.basename(f.name),mime:f.mime,bytes:Buffer.concat(f.chunks)});return;
 }
 if(m.type==='backup'){editor.webContents.send('editor-snapshot');return;}
 if(m.type==='restore'){void (async()=>{try{await preserveCurrent();const result=await rpc('restore',{id:m.id});validatedProject(result.doc);editor.webContents.send('editor-restore',result.doc);}catch(e){control({type:'status',text:e.message});}})();return;}
 const size=editor.getContentSize(),x=Math.round((m.x||0)*(size[0]-1)),y=Math.round((m.y||0)*(size[1]-1));
 const modifiers=[...(m.ctrl?['control']:[]),...(m.shift?['shift']:[]),...(m.alt?['alt']:[])];
 try{
  if(m.type==='pointer'){
   // Native mouse events preserve HTML focus, drag, pointer capture and the existing brush path.
   const button=['left','middle','right'][Math.max(0,m.button)]||'left';
   if(m.phase==='move'&&m.buttons&1)modifiers.push('leftButtonDown');
   if(m.phase==='move'&&m.buttons&2)modifiers.push('rightButtonDown');
   editor.webContents.sendInputEvent({type:m.phase==='down'?'mouseDown':m.phase==='move'?'mouseMove':'mouseUp',x,y,button,clickCount:1,modifiers});
  }else if(m.type==='wheel')editor.webContents.sendInputEvent({type:'mouseWheel',x,y,deltaX:-Math.max(-1000,Math.min(1000,m.deltaX)),deltaY:-Math.max(-1000,Math.min(1000,m.deltaY)),canScroll:true});
  else if(m.type==='key'){
   if(m.ctrl&&['r','l','w','t','o','p'].includes(m.key.toLowerCase()))return;
   const mapping={ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down',Escape:'Escape',Enter:'Enter',' ':'Space'};
   editor.webContents.sendInputEvent({type:m.phase==='down'?'keyDown':'keyUp',keyCode:mapping[m.key]||m.key,modifiers});
   if(m.phase==='down'&&m.key.length===1&&!m.ctrl&&!m.alt)editor.webContents.sendInputEvent({type:'char',keyCode:m.key,modifiers});
  }
 }catch(e){log('Input: '+e.message);}
}
async function poll(){
 if(polling)return;polling=true;
 try{
  const result=await rpc('poll');lastPollSuccess=Date.now();const next=result.session;
  if(!next){if(active)closeStream();status('ready');}
  else if(next.id!==active?.id&&next.id!==declinedSession){
   const rtc=relayConfiguration(next.offer?.relay);
   if(next.offer?.relay&&!rtc)throw Error('Unsupported relay configuration.');
   closeStream();active=next;lastInput=Date.now();transport.webContents.send('transport-offer',{...next,rtc});status('connecting');
  }
  if(connected&&Date.now()-lastInput>1800000){control({type:'status',text:'Session ended after 30 minutes without input.'});declineStream();}
  // Reserve the attempt before asking the renderer, including after a failed upload.
  // Local autosaves do not reset this timer; a failed cloud copy must not retry every poll.
  if(connected&&dirty&&!backupBusy&&Date.now()-Math.max(lastBackup,lastBackupAttempt)>300000){lastBackupAttempt=Date.now();editor.webContents.send('editor-snapshot');}
  if(upload&&Date.now()-upload.started>300000){editor.webContents.send('editor-command',{type:'upload-cancel',id:upload.id});upload=null;}
 }catch(e){
  // A brief service outage need not destroy an already authorized stream. Never
  // extend the session lease, ignore an authorization failure, or wait indefinitely.
  if(active&&temporaryServiceError(e)&&Date.now()-lastPollSuccess<45000&&Date.parse(active.expires_at)>Date.now())status(connected?'connected':'connecting',{service:'retrying',error:e.message});
  else{closeStream();status('offline',{error:e.message});}
  log('Host: '+e.message);
 }finally{polling=false;}
}
app.whenReady().then(async()=>{
 connectionChecks=await startConnectionChecks('https://racecontrol.ascrl.online',log);
 const {createStudioHandler}=await import(pathToFileURL(path.join(root,'phone-server.mjs')).href);
 const docModule=await import(pathToFileURL(path.join(root,'dist/pro/document.mjs')).href);validatedProject=docModule.validateProject;
 let handler;
 server=http.createServer(async(req,res)=>{
  if(['/private-editor-hook.mjs','/private-touch-relay.mjs'].includes(req.url)){
   if(req.headers.host!==`127.0.0.1:${server.address().port}`){res.writeHead(403);res.end();return;}
   res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');res.end(await fsp.readFile(path.join(__dirname,req.url==='/private-editor-hook.mjs'?'editor-hook.mjs':'touch-relay.mjs')));return;
  }
  // Add a host-only bridge to the local editor document without changing its original files.
  if(req.url==='/'&&req.headers.host===`127.0.0.1:${server.address().port}`){let html=await fsp.readFile(path.join(root,'dist/index.html'),'utf8');html=html.replace('</body>','<script type="module" src="/private-editor-hook.mjs"></script></body>');const hashes=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].filter(m=>m[1]).map(m=>"'sha256-"+createHash('sha256').update(m[1]).digest('base64')+"'").join(' ');res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' ${hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`);res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');res.end(html);return;}
  handler(req,res);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4197,'127.0.0.1',resolve);});const port=server.address().port,origin=`http://127.0.0.1:${port}`;
 // A fixed loopback origin and persistent partition preserve IndexedDB across restarts.
 handler=createStudioHandler({root:path.join(root,'dist'),vault:path.join(root,'shared-projects'),port,addresses:()=>[]});
 editor=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,preload:path.join(__dirname,'editor-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,partition:'persist:private-paint-editor'}});
 transport=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{preload:path.join(__dirname,'transport-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 editor.webContents.setFrameRate(24);
 editor.webContents.setWindowOpenHandler(()=>({action:'deny'}));transport.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 editor.webContents.on('will-navigate',(event,url)=>{if(url!==origin+'/')event.preventDefault();});transport.webContents.on('will-navigate',event=>event.preventDefault());
 editor.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
 editor.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!(details.url.startsWith(origin+'/')||details.url.startsWith('blob:')||details.url.startsWith('data:'))}));
 editor.webContents.session.on('will-download',(event)=>event.preventDefault());
 editor.webContents.on('console-message',(_e,level,message)=>{if(Number(level)>=2)log('Editor: '+message);});
 editor.webContents.on('render-process-gone',(_e,d)=>{status('error',{error:'Editor process stopped: '+d.reason});closeStream();});
 editor.webContents.on('paint',(_e,_dirty,image)=>{
  // Coalesce, but never discard the last frame of an otherwise idle editor.
  // Dropping a frame here can leave the remote image behind the actual controls.
  pendingFrame=image;if(frameTimer)return;
  frameTimer=setTimeout(()=>{frameTimer=null;const latest=pendingFrame;pendingFrame=null;if(!latest)return;frameAt=Date.now();lastFrame={bytes:latest.toJPEG(90)};if(transport&&!transport.isDestroyed())transport.webContents.send('transport-frame',lastFrame);},Math.max(0,42-(Date.now()-frameAt)));
 });
 ipcMain.on('transport-ready',e=>{if(validSender(e,transport)){if(lastFrame)transport.webContents.send('transport-frame',lastFrame);void poll();}});
 ipcMain.on('transport-answer',(e,data)=>{if(validSender(e,transport)&&data?.id===active?.id){const answering=active;void rpc('answer',data).catch(err=>{log(err.message);if(active===answering)closeStream();});}});
 ipcMain.on('transport-message',(e,data)=>{if(validSender(e,transport))input(data);});
 ipcMain.on('transport-connected',(e,data)=>{if(!validSender(e,transport))return;connected=!!data;editor.webContents.send('editor-connected',connected);editor.webContents.invalidate();status(connected?'connected':'ready');});
 ipcMain.on('transport-error',(e,message)=>{if(validSender(e,transport))log('Stream: '+message);});
 ipcMain.on('transport-diagnostic',(e,data)=>{if(validSender(e,transport)&&data?.id===active?.id)log('Connection: '+JSON.stringify(data));});
 for(const type of ['controls','field','upload-request','status'])ipcMain.on('editor-'+type,(e,data)=>{if(validSender(e,editor))control(editorMessage(type,data));});
 ipcMain.on('editor-save-state',(e,data)=>{if(validSender(e,editor)){artworkRevision++;dirty=true;control({type:'status',profile:data.profile,text:`${data.title||data.profile} · ${data.status}`});}});
 ipcMain.on('editor-snapshot',async(e,data)=>{if(validSender(e,editor)&&data?.doc){const saved=await snapshot(data.doc,!!data.localOnly);const done=snapshotRequests.get(data.requestId);if(done){snapshotRequests.delete(data.requestId);done(saved);}}});
 ipcMain.on('editor-download',async(e,data)=>{
  if(!validSender(e,editor)||!connected)return;const bytes=Buffer.from(data.bytes||[]);
  if(!validTGA(data.name,bytes)){control({type:'status',text:'Only a valid 2048 × 2048 TGA can be exported.'});return;}
  const folder=path.join(runtime,'exports');await fsp.mkdir(folder,{recursive:true});await fsp.writeFile(path.join(folder,randomUUID()+'-'+data.name),bytes,{flag:'wx'});
  transport.webContents.send('transport-file',{name:data.name,bytes,hash:createHash('sha256').update(bytes).digest('hex')});
 });
 ipcMain.on('editor-ready',async e=>{
  if(!validSender(e,editor))return;editor.webContents.focus();
  const copies=path.join(root,'shared-projects');const latest=new Map();
  for(const name of await fsp.readdir(copies)){if(!name.endsWith('.meta.json'))continue;try{const meta=JSON.parse(await fsp.readFile(path.join(copies,name),'utf8'));if(meta.source==='PC'&&['camaro','mustang','camry'].includes(meta.profile)&&(!latest.has(meta.profile)||latest.get(meta.profile).updated<meta.updated))latest.set(meta.profile,meta);}catch{}}
  const docs=[];for(const meta of latest.values()){if(!/^[a-f0-9-]{36}$/.test(meta.id))continue;try{const doc=JSON.parse(await fsp.readFile(path.join(copies,meta.id+'.garage.json'),'utf8'));validatedProject(doc);docs.push(doc);}catch{}}
  if(docs.length)editor.webContents.send('editor-seed',docs);
  status('ready',{port});
 });
 const icon=nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64'));
 tray=new Tray(icon);tray.setToolTip('ASCRL Paint Studio Host — private access');tray.setContextMenu(Menu.buildFromTemplate([{label:'ASCRL Paint Studio Host',enabled:false},{label:'Disconnect stream',click:declineStream},{label:'Quit host',click:()=>app.quit()}]));
 await transport.loadFile(path.join(__dirname,'transport.html'));await editor.loadURL(origin+'/');
 setInterval(poll,5000);log('Started private host. Models remain on this PC.');
});
app.on('before-quit',()=>{closeStream();status('stopped');server?.close();for(const check of connectionChecks)check.close();});
app.on('window-all-closed',()=>{});
