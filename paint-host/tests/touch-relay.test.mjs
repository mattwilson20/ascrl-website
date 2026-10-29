import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {TouchRelay} from '../touch-relay.mjs';

const point=(phase,x,y,id=1)=>({phase,x:x/1000,y:y/1000,pointerId:id,pressure:.5});
test('a layer label tap selects its delegated row; cancellation cannot click it',()=>{
 let clicks=0;
 const layer={click:()=>clicks++},label={closest:selector=>selector.includes('.layer')?layer:null};
 const relay=new TouchRelay({hitTest:()=>label,controllerFor:()=>null});
 relay.handle(point('down',100,100),1001,1001);relay.handle(point('up',100,100),1001,1001);
 assert.equal(clicks,1);
 relay.handle(point('down',100,100),1001,1001);relay.handle(point('cancel',100,100),1001,1001);
 assert.equal(clicks,1);assert.equal(relay.points.size,0);
});
test('horizontal options scroll and returning to the start does not activate a control',()=>{
 let clicks=0;
 const bar={scrollWidth:800,clientWidth:300,scrollHeight:44,clientHeight:44,scrollLeft:0,scrollTop:0,style:{overflowX:'auto',overflowY:'hidden'}};
 const button={parentElement:bar,style:{},closest:()=>({click:()=>clicks++})};
 const relay=new TouchRelay({hitTest:()=>button,controllerFor:()=>null,style:el=>el.style});
 for(const p of [point('down',200,20),point('move',100,20),point('move',200,20),point('up',200,20)])relay.handle(p,1001,1001);
 assert.equal(bar.scrollLeft,0);assert.equal(clicks,0);
 relay.handle(point('down',200,20),1001,1001);relay.handle(point('move',100,20),1001,1001);
 assert.equal(bar.scrollLeft,100);
});
test('inspector scroll finds the actual scrollable ancestor',()=>{
 const panel={scrollWidth:300,clientWidth:300,scrollHeight:900,clientHeight:400,scrollTop:0,style:{overflowY:'auto'}};
 const child={parentElement:panel,style:{overflowY:'visible'},scrollHeight:600,clientHeight:200};
 const relay=new TouchRelay({hitTest:()=>child,controllerFor:()=>null,style:el=>el.style});
 relay.handle(point('down',100,300),1001,1001);relay.handle(point('move',100,200),1001,1001);
 assert.equal(panel.scrollTop,100);
});
test('second finger stays with the first canvas and resize cancels its gesture',()=>{
 const events=[],controller={handle:(type,e)=>events.push([type,e.pointerId]),reset:()=>events.push(['cancel'])};
 const relay=new TouchRelay({hitTest:x=>x<500?'canvas':'toolbar',controllerFor:hit=>hit==='canvas'?controller:null});
 relay.handle(point('down',100,300,1),1001,1001);relay.handle(point('down',700,300,2),1001,1001);
 relay.handle(point('move',750,300,2),1001,1001);relay.cancel();
 assert.deepEqual(events,[['pointerdown',1],['pointerdown',2],['pointermove',2],['cancel']]);
 assert.equal(relay.points.size,0);
});
const configPath=resolve('host-config.json');
test('integration: relay paints, cancels a stroke on pinch, and orbits using the installed editor', {skip:!existsSync(configPath)}, async()=>{
 const config=JSON.parse(readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
 const {TouchController}=await import(pathToFileURL(resolve(config.studioDirectory,'dist/pro/touch.mjs')).href);
 const edits=[],nav=[];let cancels=0,orbit=false;
 const controller=new TouchController({addEventListener(){},setPointerCapture(){}},{edit:phase=>edits.push(phase),navigate:g=>nav.push(g),cancel:()=>cancels++,orbit:()=>orbit});
 const relay=new TouchRelay({hitTest:()=>null,controllerFor:()=>controller});
 const send=(phase,x,y,id=1)=>relay.handle(point(phase,x,y,id),1001,1001);
 send('down',100,100);send('move',120,100);send('up',140,100);
 assert.deepEqual(edits,['start','move','end']);
 send('down',100,100);send('move',120,100);send('down',200,100,2);send('move',240,100,2);
 assert.equal(cancels,1);assert.equal(nav.at(-1).kind,'pinch');assert.ok(nav.at(-1).scale>1);
 relay.cancel();assert.equal(controller.points.size,0);
 orbit=true;send('down',100,100);send('move',130,120);send('up',130,120);
 assert.equal(nav.at(-1).kind,'orbit');assert.equal(edits.filter(x=>x==='end').length,1);
});
