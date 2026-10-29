const canvas=document.getElementById('screen'),ctx=canvas.getContext('2d',{alpha:false});
const media=canvas.captureStream(30),track=media.getVideoTracks()[0];track.contentHint='detail';
let peer=null,channel=null,id=null,busy=false,last=null,diagnosticTimer=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function close(){clearTimeout(diagnosticTimer);diagnosticTimer=null;const oldChannel=channel,oldPeer=peer;peer=null;channel=null;id=null;oldChannel?.close();oldPeer?.close();window.paintTransport.send('connected',false);}
async function diagnostic(p,active,stage){
 if(peer!==p||id!==active)return;
 try{
  const stats=await p.getStats(),counts={local:0,remote:0,pairs:0,succeeded:0,failed:0,requests:0,responses:0,received:0,replied:0};
  for(const s of stats.values()){
   if(s.type==='local-candidate')counts.local++;
   if(s.type==='remote-candidate')counts.remote++;
   if(s.type==='candidate-pair'){counts.pairs++;if(s.state==='succeeded')counts.succeeded++;if(s.state==='failed')counts.failed++;counts.requests+=s.requestsSent||0;counts.responses+=s.responsesReceived||0;counts.received+=s.requestsReceived||0;counts.replied+=s.responsesSent||0;}
  }
  // No SDP, candidate IPs, credentials or artwork in diagnostic logs.
  if(peer===p&&id===active)window.paintTransport.send('diagnostic',{id:active,stage,ice:p.iceConnectionState,connection:p.connectionState,...counts});
 }catch{}
}
async function draw(data){last=data;if(busy)return;busy=true;while(last){const f=last;last=null;try{const bitmap=await createImageBitmap(new Blob([f.bytes],{type:'image/jpeg'}));if(canvas.width!==bitmap.width||canvas.height!==bitmap.height){canvas.width=bitmap.width;canvas.height=bitmap.height;}ctx.drawImage(bitmap,0,0);bitmap.close();}catch{}}busy=false;}
window.paintTransport.on('frame',draw);
window.paintTransport.on('close',close);
window.paintTransport.on('offer',async offer=>{
 close();id=offer.id;const active=id;
 try{
  const p=new RTCPeerConnection(offer.rtc||{iceServers:[{urls:'stun:stun.l.google.com:19302'}]});peer=p;
  const current=()=>peer===p&&id===active;
  p.ondatachannel=e=>{if(!current())return;const c=e.channel;channel=c;c.binaryType='arraybuffer';c.onmessage=e=>{if(!current()||channel!==c)return;if(typeof e.data==='string'){if(e.data.length<=100000)try{window.paintTransport.send('message',JSON.parse(e.data));}catch{}}else if(e.data instanceof ArrayBuffer&&e.data.byteLength<=16384)window.paintTransport.send('message',{type:'upload-chunk',bytes:new Uint8Array(e.data)});};c.onopen=()=>{if(current()&&channel===c)window.paintTransport.send('connected',true);};c.onclose=()=>{if(current()&&channel===c)window.paintTransport.send('connected',false);};};
  p.onconnectionstatechange=()=>{if(!current())return;void diagnostic(p,active,'connection');if(p.connectionState==='failed')window.paintTransport.send('error','Stream connection failed.');};
  p.oniceconnectionstatechange=()=>{if(current())void diagnostic(p,active,'ice');};
  p.onicecandidateerror=e=>{if(current())void diagnostic(p,active,'candidate-error-'+e.errorCode);};
  await p.setRemoteDescription(offer.offer);if(!current())return;const sender=p.addTrack(track,media);
  await p.setLocalDescription(await p.createAnswer());
  if(!current())return;
  await new Promise(resolve=>{const timer=setTimeout(done,7000);function done(){clearTimeout(timer);p.removeEventListener('icegatheringstatechange',check);resolve();}function check(){if(p.iceGatheringState==='complete')done();}p.addEventListener('icegatheringstatechange',check);check();});
  if(!current())return;
  const parameters=sender.getParameters();if(parameters.encodings?.length){parameters.encodings[0].maxBitrate=6000000;parameters.encodings[0].maxFramerate=24;try{await sender.setParameters(parameters);}catch{if(current())void diagnostic(p,active,'default-bitrate');}}
  if(current()){window.paintTransport.send('answer',{id:active,answer:p.localDescription.toJSON()});void diagnostic(p,active,'answered');diagnosticTimer=setTimeout(()=>{if(current())void diagnostic(p,active,'handshake-check');},5000);}
 }catch(e){if(id===active){window.paintTransport.send('error',e.message);close();}}
});
window.paintTransport.on('control',data=>{if(channel?.readyState==='open')channel.send(JSON.stringify(data));});
let files=Promise.resolve();
window.paintTransport.on('file',file=>{files=files.then(async()=>{const c=channel;if(c?.readyState!=='open')return;c.send(JSON.stringify({type:'file-start',name:file.name,size:file.bytes.length,hash:file.hash}));for(let i=0;i<file.bytes.length;i+=16384){while(c.bufferedAmount>262144){if(c.readyState!=='open')return;await wait(25);}if(c.readyState!=='open')return;c.send(file.bytes.slice(i,i+16384));}c.send(JSON.stringify({type:'file-end'}));}).catch(()=>{});});
window.paintTransport.send('ready');
