import {studio} from '/pro/app.mjs';
import {portable} from '/pro/document.mjs';
const bridge=window.paintDesktop,$=id=>document.getElementById(id);
document.title='ASCRL Paint Studio';
document.querySelector('.brand span').innerHTML='ASCRL<small>PAINT STUDIO · DESKTOP</small>';
$('phone').hidden=true;$('downloadTGA').textContent='Save TGA…';$('save').textContent='Save project…';
// Desktop paint uses the full-resolution canvas regardless of the previous phone view.
studio.viewer.setQuality(localStorage.getItem('desktop-quality')||'high');$('quality').value=studio.viewer.quality;
$('quality').addEventListener('change',()=>localStorage.setItem('desktop-quality',$('quality').value));
studio.setTool('orbit');studio.applyView('three');
const workspaces=[];
for(const car of ['camaro','mustang','camry']){const record=await studio.store.get(car);if(record){await bridge.snapshot(portable(record.doc));workspaces.push({profile:car,revision:record.revision,updated:record.updated});}}
let lastSaved=studio.doc.profile+'/'+studio.revision;
const persist=studio.persist.bind(studio);
studio.persist=async()=>{
 await persist();
 if(studio.doc&&studio.dirty===studio.saved&&!studio.stroke){
  const revision=studio.doc.profile+'/'+studio.revision;
  if(revision!==lastSaved){await bridge.snapshot(portable(studio.doc));lastSaved=revision;}
 }
};
const report=()=>bridge.ready({profile:studio.doc.profile,graphics:studio.viewer.stats(),workspaces});
const loadCar=studio.loadCar.bind(studio);
studio.loadCar=async(...args)=>{await loadCar(...args);report();};
bridge.onAction(async action=>{
 try{
  if(action.type==='click'&&['open','save','export','recovery','help'].includes(action.id))$(action.id).click();
  if(action.type==='view'&&['three','split','uv'].includes(action.value))studio.applyView(action.value);
  if(action.type==='status')studio.status(action.text);
  if(action.type==='close'){
   if(studio.busy)throw Error('Finish the current operation before closing.');
   await studio.finishBrush();await studio.persist();
   if(studio.conflict||studio.dirty!==studio.saved)throw Error('Save a portable project before closing; local autosave has not completed.');
   await bridge.snapshot(portable(studio.doc));bridge.closeResult({ok:true});
  }
 }catch(e){studio.fail(e);if(action.type==='close')bridge.closeResult({ok:false,error:e.message});}
});
requestAnimationFrame(()=>{studio.viewer.setCamera('perspective');studio.viewer.invalidate(12);report();});
