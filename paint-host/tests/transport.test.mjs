import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function harness(){
 const handlers=new Map(),messages=[],peers=[];
 const track={},media={getVideoTracks:()=>[track]},canvas={captureStream:()=>media,getContext:()=>({})};
 class Peer{
  constructor(configuration){peers.push(this);this.configuration=configuration;this.connectionState='new';this.iceConnectionState='new';this.iceGatheringState='complete';this.localDescription={toJSON:()=>({type:'answer',sdp:'v=0'})};}
  close(){this.closed=true;this.connectionState='closed';this.onconnectionstatechange?.();}
  async setRemoteDescription(){if(this.pending)await this.pending;}
  async createAnswer(){return{type:'answer',sdp:'v=0'};}
  async setLocalDescription(){}
  addTrack(){return{getParameters:()=>({encodings:[{}]}),setParameters:async()=>{if(this.unsupportedBitrate)throw Error('Not supported');}};}
  addEventListener(){} removeEventListener(){}
  async getStats(){return new Map([
   ['l',{type:'local-candidate',address:'192.168.1.22'}],['r',{type:'remote-candidate',address:'198.51.100.11'}],
   ['p',{type:'candidate-pair',state:'failed',requestsSent:7,responsesReceived:0}],
  ]);}
 }
 const context=vm.createContext({document:{getElementById:()=>canvas},window:{paintTransport:{on:(name,fn)=>handlers.set(name,fn),send:(name,data)=>messages.push({name,data})}},RTCPeerConnection:Peer,setTimeout,clearTimeout,ArrayBuffer,Uint8Array,Blob});
 vm.runInContext(readFileSync(new URL('../transport.js',import.meta.url),'utf8'),context);
 return{handlers,messages,peers};
}
const offer=id=>({id,offer:{type:'offer',sdp:'v=0'}});

test('renderer uses the supplied validated relay configuration',async()=>{
 const h=harness(),rtc={iceTransportPolicy:'relay',iceServers:[{urls:'turns:turn.cloudflare.com:443?transport=tcp',username:'temporary-test-user',credential:'temporary-test-credential'}]};
 await h.handlers.get('offer')({...offer('relay-session'),rtc});
 assert.deepEqual(h.peers[0].configuration,rtc);
 assert.ok(h.messages.some(m=>m.name==='answer'));
 h.handlers.get('close')();
});
test('an old failed handshake cannot close a newer phone connection',async()=>{
 const h=harness();let reject,enter;const entered=new Promise(resolve=>{enter=resolve;});
 const pending=h.handlers.get('offer')(offer('old'));
 // Pause the old operation after setRemoteDescription but before createAnswer.
 h.peers[0].createAnswer=()=>new Promise((_r,j)=>{reject=j;enter();});
 await entered;
 await h.handlers.get('offer')(offer('new'));
 reject(Error('Old peer was closed'));
 await pending;
 assert.equal(h.peers[1].closed,undefined);
 assert.equal(h.messages.filter(m=>m.name==='answer').at(-1).data.id,'new');
});
test('late channel close from an old peer cannot disconnect the replacement',async()=>{
 const h=harness();await h.handlers.get('offer')(offer('old'));
 const oldChannel={close(){this.onclose?.();}};h.peers[0].ondatachannel({channel:oldChannel});
 const lateClose=oldChannel.onclose;
 await h.handlers.get('offer')(offer('new'));
 const currentChannel={close(){}};h.peers[1].ondatachannel({channel:currentChannel});currentChannel.onopen();
 const before=h.messages.length;lateClose();
 assert.equal(h.messages.length,before);
 assert.deepEqual(h.messages.at(-1),{name:'connected',data:true});
});
test('network diagnostics distinguish unanswered ICE checks without exposing candidate addresses',async()=>{
 const h=harness();await h.handlers.get('offer')(offer('session'));
 await Promise.resolve();
 const d=h.messages.find(m=>m.name==='diagnostic').data;
 assert.equal(d.requests,7);assert.equal(d.responses,0);assert.equal(d.failed,1);
 const serialized=JSON.stringify(d);assert.ok(!serialized.includes('192.168'));assert.ok(!serialized.includes('198.51.100'));assert.ok(!serialized.includes('sdp'));
});
test('unsupported bitrate tuning does not abort an otherwise valid answer',async()=>{
 const h=harness();const pending=h.handlers.get('offer')(offer('session'));h.peers[0].unsupportedBitrate=true;await pending;
 assert.ok(h.messages.some(m=>m.name==='answer'));assert.equal(h.peers[0].closed,undefined);
});
