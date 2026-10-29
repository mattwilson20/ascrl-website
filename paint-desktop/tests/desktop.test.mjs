import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const {desktopHandler,saveArtwork}=createRequire(import.meta.url)('../server.cjs');
test('desktop resources reject traversal, foreign hosts and network writes',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'paint-desktop-test-'));
 try{
  await writeFile(path.join(folder,'index.html'),'<body><script type="importmap">{}</script></body>');
  const handler=desktopHandler(folder,4197,path.join(folder,'hook.mjs'));
  const call=async(url,headers={host:'127.0.0.1:4197'},method='GET')=>{const result={status:200,headers:{}};await handler({url,headers,method},{writeHead:status=>result.status=status,setHeader:(k,v)=>result.headers[k]=v,end:body=>result.body=body?.toString()});return result;};
  const home=await call('/');assert.equal(home.status,200);assert.match(home.body,/desktop-hook/);assert.match(home.headers['Content-Security-Policy'],/sha256-/);
  for(const url of ['/../secret','/%2e%2e/secret','/a%5csecret','/api/phone','/api/paint-studio'])assert.equal((await call(url)).status,404);
  assert.equal((await call('/',{host:'other.example'})).status,403);
  assert.equal((await call('/',{host:'127.0.0.1:4197'},'POST')).status,405);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('portable recovery copies are validated, complete and deduplicated',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'paint-desktop-artwork-test-'));
 try{
  const doc={profile:'camaro',title:'Keep this',layers:[]},validate=d=>{if(d.profile!=='camaro')throw Error('Invalid');};
  const first=await saveArtwork(folder,doc,validate);await saveArtwork(folder,doc,validate);
  assert.deepEqual(JSON.parse(await readFile(path.join(folder,first.name),'utf8')),doc);
  assert.equal((await readdir(folder)).length,1);
  await assert.rejects(()=>saveArtwork(folder,{profile:'../../escape'},validate));
  assert.equal((await readdir(folder)).length,1);
 }finally{await rm(folder,{recursive:true,force:true});}
});
