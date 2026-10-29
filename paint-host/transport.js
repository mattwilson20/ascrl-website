const canvas=document.getElementById('screen'),ctx=canvas.getContext('2d',{alpha:false});
const media=canvas.captureStream(30),track=media.getVideoTracks()[0];track.contentHint='detail';
let peer=null,channel=null,id=null,busy=false,last=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function close(){channel?.close();peer?.close();peer=null;channel=null;id=null;window.paintTransport.send('connected',false);}
async function draw(data){last=data;if(busy)return;busy=true;while(last){const f=last;last=null;try{const bitmap=await createImageBitmap(new Blob([f.bytes],{type:'image/jpeg'}));if(canvas.width!==bitmap.width||canvas.height!==bitmap.height){canvas.width=bitmap.width;canvas.height=bitmap.height;}ctx.drawImage(bitmap,0,0);bitmap.close();}catch{}}busy=false;}
window.paintTransport.on('frame',draw);
window.paintTransport.on('close',close);
window.paintTransport.on('offer',async offer=>{
 close();id=offer.id;const active=id;
 try{
  const p=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});peer=p;
  p.ondatachannel=e=>{channel=e.channel;channel.binaryType='arraybuffer';channel.onmessage=e=>{if(typeof e.data==='string'){if(e.data.length<=100000)try{window.paintTransport.send('message',JSON.parse(e.data));}catch{}}else if(e.data instanceof ArrayBuffer&&e.data.byteLength<=16384)window.paintTransport.send('message',{type:'upload-chunk',bytes:new Uint8Array(e.data)});};channel.onopen=()=>window.paintTransport.send('connected',true);channel.onclose=()=>window.paintTransport.send('connected',false);};
  p.onconnectionstatechange=()=>{if(p.connectionState==='failed')window.paintTransport.send('error','Stream connection failed.');};
  await p.setRemoteDescription(offer.offer);p.addTrack(track,media);
  await p.setLocalDescription(await p.createAnswer());
  await new Promise(resolve=>{const timer=setTimeout(done,7000);function done(){clearTimeout(timer);p.removeEventListener('icegatheringstatechange',check);resolve();}function check(){if(p.iceGatheringState==='complete')done();}p.addEventListener('icegatheringstatechange',check);check();});
  if(id===active)window.paintTransport.send('answer',{id:active,answer:p.localDescription.toJSON()});
 }catch(e){window.paintTransport.send('error',e.message);close();}
});
window.paintTransport.on('control',data=>{if(channel?.readyState==='open')channel.send(JSON.stringify(data));});
let files=Promise.resolve();
window.paintTransport.on('file',file=>{files=files.then(async()=>{const c=channel;if(c?.readyState!=='open')return;c.send(JSON.stringify({type:'file-start',name:file.name,size:file.bytes.length,hash:file.hash}));for(let i=0;i<file.bytes.length;i+=16384){while(c.bufferedAmount>262144){if(c.readyState!=='open')return;await wait(25);}if(c.readyState!=='open')return;c.send(file.bytes.slice(i,i+16384));}c.send(JSON.stringify({type:'file-end'}));}).catch(()=>{});});
window.paintTransport.send('ready');
