const URL='turns:turn.cloudflare.com:443?transport=tcp';
function relayConfiguration(value){
 if(!value||value.iceTransportPolicy!=='relay'||!Array.isArray(value.iceServers)||value.iceServers.length!==1)return null;
 const s=value.iceServers[0];
 if(s?.urls!==URL||![s.username,s.credential].every(v=>typeof v==='string'&&/^[!-~]{16,1024}$/.test(v)))return null;
 return{iceTransportPolicy:'relay',iceServers:[{urls:URL,username:s.username,credential:s.credential}]};
}
module.exports={relayConfiguration};
