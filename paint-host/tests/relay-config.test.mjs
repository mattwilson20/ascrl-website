import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {relayConfiguration}=createRequire(import.meta.url)('../relay-config.cjs');
const relay={iceTransportPolicy:'relay',iceServers:[{urls:'turns:turn.cloudflare.com:443?transport=tcp',username:'test-ephemeral-user',credential:'test-ephemeral-password'}]};
test('private renderer only accepts the approved TLS relay endpoint',()=>{
 assert.deepEqual(relayConfiguration(relay),relay);
 assert.equal(relayConfiguration({...relay,iceTransportPolicy:'all'}),null);
 for(const urls of ['turn:127.0.0.1:1234','turns:other.example:443?transport=tcp','turns:turn.cloudflare.com.evil.test:443?transport=tcp'])
  assert.equal(relayConfiguration({...relay,iceServers:[{...relay.iceServers[0],urls}]}),null);
 assert.equal(relayConfiguration({...relay,iceServers:[...relay.iceServers,...relay.iceServers]}),null);
 assert.equal(relayConfiguration({}),null);
});
