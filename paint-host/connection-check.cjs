const http=require('node:http');
const {networkInterfaces}=require('node:os');
const PORT=4198;
function privateIPv4(value){
 const parts=String(value).split('.');
 if(parts.length!==4||parts.some(p=>!/^\d{1,3}$/.test(p)||Number(p)>255||String(Number(p))!==p))return false;
 const [a,b]=parts.map(Number);
 return a===10||a===172&&b>=16&&b<=31||a===192&&b===168;
}
// This separate listener is only a permission/connectivity check. It has no
// connection to the editor, filesystem, credentials, artwork or model server.
function checkHandler(address,origin,onSuccess=()=>{}){
 return(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Vary','Origin');
  if(req.headers.host!==`${address}:${PORT}`||req.headers.origin!==origin){res.writeHead(403);res.end();return;}
  if(req.url!=='/connection-check'){res.writeHead(404);res.end();return;}
  if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return;}
  res.writeHead(204,{'Access-Control-Allow-Origin':origin});res.end();onSuccess();
 };
}
async function startConnectionChecks(origin,log){
 const addresses=[...new Set(Object.values(networkInterfaces()).flat().filter(n=>n&&!n.internal&&n.family==='IPv4'&&privateIPv4(n.address)).map(n=>n.address))].slice(0,8);
 const servers=[];
 for(const address of addresses){
  const server=http.createServer(checkHandler(address,origin,()=>log('Local connection permission check received.')));
  server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;server.maxHeadersCount=30;
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,address,resolve);});servers.push(server);}
  catch{server.close();log('Local connection check unavailable on one interface.');}
 }
 return servers;
}
module.exports={privateIPv4,checkHandler,startConnectionChecks};
