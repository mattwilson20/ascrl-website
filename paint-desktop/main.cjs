const {app,BrowserWindow,ipcMain,Menu,dialog,shell}=require('electron');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const {desktopHandler,saveArtwork}=require('./server.cjs');
const runtime=path.join(process.env.LOCALAPPDATA||app.getPath('userData'),'ASCRL Paint Studio');
fs.mkdirSync(runtime,{recursive:true});app.setPath('userData',path.join(runtime,'browser-profile'));
app.setName('ASCRL Paint Studio');app.setAppUserModelId('online.ascrl.paintstudio');
if(!app.requestSingleInstanceLock()){app.quit();return;}
const port=4197,origin=`http://127.0.0.1:${port}`,site=path.join(__dirname,'site');
let win,server,validate,closing=false,closeTimer,writeQueue=Promise.resolve();
const status=data=>fs.writeFileSync(path.join(runtime,'status.json'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,...data},null,2));
const log=message=>fs.appendFileSync(path.join(runtime,'desktop.log'),new Date().toISOString()+' '+String(message).slice(0,600)+'\n');
const valid=event=>win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===origin+'/';
const send=action=>win?.webContents.send('desktop-action',action);
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.whenReady().then(async()=>{
 validate=(await import(pathToFileURL(path.join(site,'pro/document.mjs')).href)).validateProject;
 server=http.createServer(desktopHandler(site,port,path.join(__dirname,'desktop-hook.mjs')));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 win=new BrowserWindow({title:'ASCRL Paint Studio',show:false,width:1440,height:960,minWidth:1000,minHeight:650,backgroundColor:'#111a22',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'persist:private-paint-editor'}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(e,url)=>{if(url!==origin+'/')e.preventDefault();});
 win.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
 win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(origin+'/')&&!details.url.startsWith('blob:')&&!details.url.startsWith('data:')}));
 const exports=path.join(app.getPath('documents'),'ASCRL Paint Studio','Exports');await fsp.mkdir(exports,{recursive:true});
 win.webContents.session.on('will-download',(_event,item)=>{
  item.setSaveDialogOptions({title:'Save paint or project',defaultPath:path.join(exports,path.basename(item.getFilename())),filters:[{name:'Paint and project files',extensions:['tga','garage.json','png','json']}]});
  item.once('done',(_e,state)=>{if(state==='completed')send({type:'status',text:'Saved '+item.getSavePath()});else if(state!=='cancelled')send({type:'status',text:'The file could not be saved. Try Save project or Export TGA again.'});});
 });
 win.webContents.on('render-process-gone',(_event,detail)=>{status({state:'error',reason:detail.reason});dialog.showErrorBox('Paint Studio stopped','Your saved projects remain on this PC. Reopen Paint Studio to recover them.');});
 win.webContents.on('console-message',details=>{if(['warning','error'].includes(details.level))log(details.message);});
 win.on('close',e=>{
  if(closing)return;e.preventDefault();if(closeTimer)return;
  send({type:'close'});
  closeTimer=setTimeout(()=>{closeTimer=null;dialog.showMessageBox(win,{type:'warning',message:'The current project is still saving.',detail:'The app remains open to protect your work. Finish the current operation, then close it again.',buttons:['Keep open']});},30000);
 });
 ipcMain.handle('desktop-snapshot',(event,doc)=>{
  if(!valid(event))throw Error('Invalid editor request.');
  const next=writeQueue.then(()=>saveArtwork(path.join(runtime,'artwork'),doc,validate));writeQueue=next.catch(()=>{});return next;
 });
 ipcMain.on('desktop-ready',(event,data)=>{if(valid(event)&&data&&['camaro','mustang','camry'].includes(data.profile)){
  status({state:'ready',profile:data.profile,graphics:data.graphics,workspaces:data.workspaces,offline:true});
 }});
 ipcMain.on('desktop-close-result',async(event,result)=>{
  if(!valid(event)||!closeTimer)return;clearTimeout(closeTimer);closeTimer=null;
  if(result?.ok){await writeQueue;closing=true;win.close();}
  else dialog.showMessageBox(win,{type:'error',message:'The project could not finish saving.',detail:String(result?.error||'Use Save project before closing.').slice(0,400),buttons:['Keep open']});
 });
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'File',submenu:[{label:'Open project…',accelerator:'CmdOrCtrl+O',click:()=>send({type:'click',id:'open'})},{label:'Save project as…',click:()=>send({type:'click',id:'save'})},{label:'Export TGA…',accelerator:'CmdOrCtrl+E',click:()=>send({type:'click',id:'export'})},{label:'Project recovery',click:()=>send({type:'click',id:'recovery'})},{type:'separator'},{label:'Open local recovery folder',click:()=>shell.openPath(path.join(runtime,'artwork'))},{label:'Open export folder',click:()=>shell.openPath(exports)},{type:'separator'},{label:'Exit',click:()=>win.close()}]},
  {label:'View',submenu:[{role:'togglefullscreen'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{label:'3D body',click:()=>send({type:'view',value:'three'})},{label:'Split body and UV',click:()=>send({type:'view',value:'split'})},{label:'UV template',click:()=>send({type:'view',value:'uv'})}]},
  {label:'Help',submenu:[{label:'Painting guide',click:()=>send({type:'click',id:'help'})},{label:'About Paint Studio',click:()=>dialog.showMessageBox(win,{type:'info',message:'ASCRL Paint Studio 0.2',detail:'Desktop rendering · local autosave and recovery · original car geometry and paint UVs. No website, login, video stream or cloud relay required.',buttons:['OK']})}]},
 ]));
 win.once('ready-to-show',()=>{win.maximize();win.show();});await win.loadURL(origin+'/');
 log('Started standalone editor. Direct GPU rendering; no signaling or video stream.');
}).catch(e=>{log(e.stack||e.message);status({state:'error',error:e.message});dialog.showErrorBox('Paint Studio could not start',e.code==='EADDRINUSE'?'The old Paint Studio Host is using the editor port. Close that host and reopen this app.':e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{server?.close();status({state:'stopped'});});
