import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
function harness(){
 let clock=1_000_000,respond=async()=>({ok:true,status:200,json:async()=>({session:{id:'current',expires_at:new Date(clock+7200000).toISOString()}})});
 const events=[],writes=[],requests=[];
 class Clock extends Date{static now(){return clock;}}
 const win={isDestroyed:()=>false,webContents:{send:(name,data)=>events.push({name,data})}};
 const app={getPath:()=>'/test',setPath(){},requestSingleInstanceLock:()=>true,commandLine:{appendSwitch(){}},whenReady:()=>({then(){}}),on(){}};
 const fs={mkdirSync(){},readFileSync:()=>JSON.stringify({studioDirectory:'/studio',supabaseUrl:'https://test.supabase.co',publishableKey:'test'}),writeFileSync:(name,data)=>writes.push({name,data}),appendFileSync(){},existsSync:()=>false};
 const replacements={electron:{app},'node:fs':fs,'node:fs/promises':{mkdir:async()=>{},writeFile:async(name,data)=>writes.push({name,data})},'node:child_process':{execFileSync:()=> 'a'.repeat(64)},'./protocol.cjs':{},'./connection-check.cjs':{},'./relay-config.cjs':{relayConfiguration:()=>null}};
 const context=vm.createContext({require:name=>replacements[name]||require(name),__dirname:'/host',process:{env:{LOCALAPPDATA:'/local'},pid:1,on(){}},Buffer,URL,Date:Clock,AbortSignal,setTimeout,clearTimeout,win,fetch:async(_url,options)=>{requests.push(JSON.parse(options.body));return respond();}});
 const source=readFileSync(new URL('../main.cjs',import.meta.url),'utf8');
 vm.runInContext(`(function(){${source}\neditor=win;transport=win;validatedProject=()=>{};active={id:'current',expires_at:new Date(Date.now()+7200000).toISOString()};connected=true;lastPollSuccess=Date.now();globalThis.host={poll,saveSnapshot,state:()=>({active,connected,dirty,backupBusy}),change:()=>{artworkRevision++;dirty=true;}};})()`,context);
 return{host:context.host,events,writes,requests,advance:ms=>{clock+=ms;},respond:fn=>{respond=fn;}};
}
const timeout=()=>{const e=Error('Timed out');e.name='TimeoutError';throw e;};

test('one temporary service timeout preserves the stream; an extended outage closes it',async()=>{
 const h=harness();h.respond(timeout);h.advance(15000);await h.host.poll();
 assert.equal(h.host.state().connected,true);
 assert.equal(h.events.some(e=>e.name==='transport-close'),false);
 h.advance(30000);await h.host.poll();
 assert.equal(h.host.state().connected,false);
 assert.ok(h.events.some(e=>e.name==='transport-close'));
});

test('authorization denial and an explicit closed session never receive outage grace',async()=>{
 for(const response of [{ok:false,status:403,json:async()=>({message:'Host not authorized'})},{ok:true,status:200,json:async()=>({session:null})}]){
  const h=harness();h.respond(async()=>response);await h.host.poll();assert.equal(h.host.state().connected,false);
 }
});

test('failed cloud saves keep local copies and wait five minutes before the next automatic attempt',async()=>{
 const h=harness();await h.host.poll();
 assert.equal(h.events.filter(e=>e.name==='editor-snapshot').length,1);
 h.respond(async()=>({ok:false,status:500,json:async()=>({message:'Cloud unavailable'})}));
 assert.equal(await h.host.saveSnapshot({profile:'camaro',layers:[]}),true);
 assert.ok(h.writes.some(w=>w.name.endsWith('.garage.json')));
 assert.equal(h.host.state().dirty,true);
 h.respond(async()=>({ok:true,status:200,json:async()=>({session:{id:'current'}})}));
 for(let i=0;i<59;i++){h.advance(5000);await h.host.poll();}
 assert.equal(h.events.filter(e=>e.name==='editor-snapshot').length,1);
 h.advance(6000);await h.host.poll();
 assert.equal(h.events.filter(e=>e.name==='editor-snapshot').length,2);
});

test('edits made during a cloud upload stay dirty after that older upload succeeds',async()=>{
 const h=harness();h.respond(async()=>{h.host.change();return{ok:true,status:200,json:async()=>({id:'saved'})};});
 await h.host.saveSnapshot({profile:'camaro',layers:[]});assert.equal(h.host.state().dirty,true);
});
