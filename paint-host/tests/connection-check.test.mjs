import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {privateIPv4,checkHandler}=createRequire(import.meta.url)('../connection-check.cjs');
const origin='https://racecontrol.ascrl.online',address='192.168.1.186';
function request(overrides={}){
 const result={headers:{},body:null};
 checkHandler(address,origin)({method:'GET',url:'/connection-check',headers:{host:address+':4198',origin},...overrides},{
  setHeader:(key,value)=>{result.headers[key]=value;},
  writeHead:(status,headers={})=>{result.status=status;Object.assign(result.headers,headers);},
  end:body=>{result.body=body;},
 });return result;
}
test('connection check is empty and restricted to the league origin and exact private host',()=>{
 const r=request();assert.equal(r.status,204);assert.equal(r.body,undefined);assert.equal(r.headers['Access-Control-Allow-Origin'],origin);
 assert.equal(request({headers:{host:address+':4198',origin:'https://other.example'}}).status,403);
 assert.equal(request({headers:{host:'other.example:4198',origin}}).status,403);
 assert.equal(request({headers:{host:address+':4198'}}).status,403);
 assert.equal(request({method:'POST'}).status,405);
});
test('connection listener never serves model files, artwork or editor routes',()=>{
 for(const url of ['/','/assets/mapped/camaro.glb','/../host-config.json','/connection-check?file=camaro.glb']){
  const r=request({url});assert.equal(r.status,404);assert.equal(r.body,undefined);
 }
});
test('listener only selects private IPv4 interfaces, never public or loopback addresses',()=>{
 for(const value of ['192.168.1.186','10.0.0.1','172.16.1.1','172.31.255.254'])assert.equal(privateIPv4(value),true);
 for(const value of ['127.0.0.1','0.0.0.0','172.32.1.1','8.8.8.8','192.168.1.999','192.168.1.01','192.168.1.1/evil','::1'])assert.equal(privateIPv4(value),false);
});
