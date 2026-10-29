import{studio}from'/pro/app.mjs';
import{portable,validateProject}from'/pro/document.mjs';
const bridge=window.privatePaintHost;
const targets=new Map();let serial=0,previous='',lastRevision='',connected=false;
const touches=new Map();
// Repaint the 2D canvas after it becomes visible in the offscreen compositor.
const applyView=studio.applyView.bind(studio);
studio.applyView=view=>{applyView(view);requestAnimationFrame(()=>studio.render());};
const visible=el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0&&!el.closest('[hidden]');
const key=el=>{if(!el.dataset.remoteControl)el.dataset.remoteControl='c'+(++serial);targets.set(el.dataset.remoteControl,el);return el.dataset.remoteControl;};
const label=el=>el.getAttribute('aria-label')||el.title||el.labels?.[0]?.textContent?.trim()||el.textContent?.trim()||el.id||'Edit value';
function descriptor(el){return{id:key(el),label:label(el).slice(0,100),type:el.tagName==='SELECT'?'select':el.type||'text',value:el.value||'',options:el.tagName==='SELECT'?[...el.options].map(o=>({value:o.value,label:o.textContent})):undefined};}
function controls(){
 const items=[...document.querySelectorAll('button,select,input:not([type=file]),textarea')].filter(el=>visible(el)&&!el.disabled).map(el=>({id:key(el),label:label(el).slice(0,100),kind:el.tagName==='SELECT'?'select':el.tagName==='INPUT'&&!['checkbox','button'].includes(el.type)||el.tagName==='TEXTAREA'?'field':'button',value:el.value,options:el.tagName==='SELECT'?[...el.options].map(o=>({value:o.value,label:o.textContent})):undefined})).filter(x=>x.label);
 const json=JSON.stringify(items);if(json!==previous){previous=json;bridge.emit('controls',{items});}
}
// Downloads are intercepted inside this isolated editor. Only a verified TGA leaves the host.
studio.download=async(blob,name)=>{
 if(/\.tga$/i.test(name)){bridge.emit('download',{name,bytes:new Uint8Array(await blob.arrayBuffer())});}
 else {bridge.emit('snapshot',{doc:portable(studio.doc),manual:true});studio.status('Cloud recovery copy requested');}
};
// All project/model access stays inside this process; there is no remote URL or script executor.
bridge.on('snapshot',request=>bridge.emit('snapshot',{doc:portable(studio.doc),manual:true,requestId:request?.requestId}));
bridge.on('seed',docs=>studio.run(async()=>{
 if(localStorage.getItem('private-host-imported-workspaces'))return;
 const car=studio.doc.profile;
 for(const doc of docs){validateProject(doc);const current=await studio.store.get(doc.profile);await studio.store.save(doc,current?.revision||0,'Imported original desktop workspace');}
 localStorage.setItem('private-host-imported-workspaces',new Date().toISOString());await studio.loadCar(car);
}));
bridge.on('restore',doc=>studio.run(async()=>{validateProject(doc);await studio.loadCar(doc.profile,doc);studio.status('Cloud recovery copy restored; prior workspace retained in Recovery.');}));
bridge.on('upload',data=>{const el=targets.get(data.id);if(!(el instanceof HTMLInputElement)||el.type!=='file')return;const dt=new DataTransfer();dt.items.add(new File([data.bytes],data.name,{type:data.mime||'application/octet-stream'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));});
document.addEventListener('click',e=>{
 const el=e.target.closest('input,select,textarea,a');if(!el)return;
 if(el.tagName==='A'){e.preventDefault();return;}
 if(el.type==='file'){e.preventDefault();e.stopImmediatePropagation();bridge.emit('upload-request',{id:key(el),accept:el.accept});return;}
 if(el.tagName==='SELECT'||el.tagName==='TEXTAREA'||el.tagName==='INPUT'&&!['checkbox','range','button','submit'].includes(el.type)){
  e.preventDefault();e.stopImmediatePropagation();bridge.emit('field',descriptor(el));
 }
},true);
bridge.on('command',m=>{
 if(m.type==='upload-cancel'){const el=targets.get(m.id);if(el instanceof HTMLInputElement&&el.type==='file')el.dispatchEvent(new Event('cancel'));return;}
 if(m.type==='resized'){setTimeout(()=>{studio.fitUV();studio.viewer.setCamera('perspective');studio.viewer.invalidate(12);},250);return;}
 if(m.type==='pointer'&&m.pointerType==='touch'){
  const x=m.x*(innerWidth-1),y=m.y*(innerHeight-1);
  if(m.phase==='down'){
   const hit=document.elementFromPoint(x,y),three=studio.viewer.renderer.domElement,uv=document.getElementById('uvViewport');
   const controller=hit===three?studio.touch3D:uv.contains(hit)?studio.touchUV:null;
   touches.set(m.pointerId,{controller,hit,x,y,lastY:y});
  }
  const t=touches.get(m.pointerId);if(!t)return;
  if(t.controller)t.controller.handle('pointer'+(m.phase==='cancel'?'cancel':m.phase),{pointerType:'touch',pointerId:m.pointerId,clientX:x,clientY:y,button:0,pressure:m.pressure||.5,shiftKey:!!m.shift,ctrlKey:!!m.ctrl,preventDefault(){},stopImmediatePropagation(){}});
  else if(m.phase==='up'&&Math.hypot(x-t.x,y-t.y)<12)t.hit?.closest('button,input,select,textarea,summary')?.click();
  else if(m.phase==='move'){
   if(t.hit instanceof HTMLInputElement&&t.hit.type==='range'){const r=t.hit.getBoundingClientRect();const min=Number(t.hit.min)||0,max=Number(t.hit.max)||100;t.hit.value=String(min+(max-min)*Math.max(0,Math.min(1,(x-r.left)/r.width)));t.hit.dispatchEvent(new Event('input',{bubbles:true}));t.hit.dispatchEvent(new Event('change',{bubbles:true}));}
   else {let scroll=t.hit;while(scroll&&scroll.scrollHeight<=scroll.clientHeight)scroll=scroll.parentElement;if(scroll)scroll.scrollTop+=t.lastY-y;}t.lastY=y;
  }
  if(m.phase==='up'||m.phase==='cancel')touches.delete(m.pointerId);return;
 }
 const el=targets.get(m.id);if(!el||!visible(el)||el.disabled)return;
 if(m.type==='field'){
  if(!['INPUT','SELECT','TEXTAREA'].includes(el.tagName)||['file','hidden','checkbox'].includes(el.type))return;
  if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===m.value))return;
  if(el.id==='customerId'&&!m.value)localStorage.removeItem('garage-pro-customer');
  el.value=m.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
 }else if(m.type==='control')el.click();controls();
});
bridge.on('connected',value=>{connected=value;previous='';if(!value){touches.clear();studio.touch3D.reset();studio.touchUV.reset();if(studio.stroke)studio.cancelTouch();for(const el of targets.values())if(el instanceof HTMLInputElement&&el.type==='file')el.dispatchEvent(new Event('cancel'));}controls();});
// Remove routes out of this editor and the obsolete LAN pairing flow in the streamed view.
for(const id of ['phone','phoneTransfer','phoneButton','exportPNG','downloadLegacy']){const el=document.getElementById(id);if(el)el.hidden=true;}
for(const el of document.querySelectorAll('button'))if(/Phone \/ transfer/.test(el.textContent))el.hidden=true;
const save=document.getElementById('save');if(save)save.textContent='Save cloud copy';
setInterval(()=>{
 if(connected)controls();
 const state=document.getElementById('saveStatus')?.textContent||'';
 const revision=`${studio.doc?.profile}/${studio.revision}/${state}`;
 if(revision!==lastRevision){lastRevision=revision;bridge.emit('save-state',{profile:studio.doc?.profile,title:studio.doc?.title,status:state});if(state.startsWith('Saved locally'))bridge.emit('snapshot',{doc:portable(studio.doc),localOnly:true});}
},600);
studio.applyView('three');
setTimeout(()=>studio.viewer.setCamera('perspective'),250);
bridge.emit('ready',{profile:studio.doc.profile});controls();
