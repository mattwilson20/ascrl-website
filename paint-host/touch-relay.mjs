// Remote touch input uses the editor's existing gesture controller; UI taps
// and scrolling are handled here because synthetic pointer events do not
// trigger the browser's native touch scrolling/click generation.
export class TouchRelay {
 constructor({hitTest,controllerFor,style=el=>getComputedStyle(el),event=()=>new Event('input',{bubbles:true})}) {
  Object.assign(this,{hitTest,controllerFor,style,event});this.points=new Map();
 }
 cancel(){
  for(const controller of new Set([...this.points.values()].map(p=>p.controller).filter(Boolean)))controller.reset();
  this.points.clear();
 }
 handle(m,width,height){
  const x=m.x*(width-1),y=m.y*(height-1),id=m.pointerId;
  if(m.phase==='down'){
   const hit=this.hitTest(x,y);
   // A second finger belongs to the first canvas even if it crosses its edge.
   const active=[...this.points.values()].find(p=>p.controller)?.controller;
   this.points.set(id,{controller:active||this.controllerFor(hit),hit,x,y,lastX:x,lastY:y,moved:false});
  }
  const p=this.points.get(id);if(!p)return;
  if(p.controller){
   p.controller.handle('pointer'+m.phase,{pointerType:'touch',pointerId:id,clientX:x,clientY:y,button:0,pressure:m.pressure??.5,shiftKey:!!m.shift,ctrlKey:!!m.ctrl,preventDefault(){},stopImmediatePropagation(){}});
  }else if(m.phase==='move'){
   if(Math.hypot(x-p.x,y-p.y)>=8)p.moved=true;
   if(p.hit?.tagName==='INPUT'&&p.hit.type==='range'){
    const el=p.hit,r=el.getBoundingClientRect(),min=Number(el.min)||0,max=el.max===''?100:Number(el.max);
    el.value=String(min+(max-min)*Math.max(0,Math.min(1,(x-r.left)/r.width)));
    el.dispatchEvent(this.event('input'));el.dispatchEvent(this.event('change'));p.moved=true;
   }else if(p.moved){
    const dx=p.lastX-x,dy=p.lastY-y;
    let el=p.hit;
    while(el){
     const css=this.style(el),sx=/auto|scroll/.test(css.overflowX)&&el.scrollWidth>el.clientWidth,sy=/auto|scroll/.test(css.overflowY)&&el.scrollHeight>el.clientHeight;
     if((Math.abs(dx)>Math.abs(dy)&&sx)||sy){if(sx)el.scrollLeft+=dx;if(sy)el.scrollTop+=dy;break;}
     el=el.parentElement;
    }
   }
  }else if(m.phase==='up'&&!p.moved&&Math.hypot(x-p.x,y-p.y)<12){
   // Layer rows and labels intentionally delegate their click handlers.
   p.hit?.closest('button,input,select,textarea,summary,label,.layer,[role="button"]')?.click();
  }
  p.lastX=x;p.lastY=y;
  if(m.phase==='up'||m.phase==='cancel')this.points.delete(id);
 }
}
