const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
function desktopHandler(root,port,hookFile){
 return async(req,res)=>{
  try{
   if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   const raw=req.url.split('?')[0],decoded=decodeURIComponent(raw);
   if(decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').includes('..')){res.writeHead(404);res.end();return;}
   const relative=decoded==='/'?'index.html':decoded.slice(1);
   const target=decoded==='/desktop-hook.mjs'?hookFile:path.resolve(root,relative);
   if(target!==hookFile&&!target.startsWith(path.resolve(root)+path.sep)){res.writeHead(404);res.end();return;}
   let body=await fs.readFile(target);
   if(decoded==='/')body=Buffer.from(body.toString().replace('</body>','<script type="module" src="/desktop-hook.mjs"></script></body>'));
   const scripts=path.extname(target)==='.html'?[...body.toString().matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].filter(m=>m[1]).map(m=>"'sha256-"+createHash('sha256').update(m[1]).digest('base64')+"'").join(' '):'';
   res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' ${scripts}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`);
   res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(req.method==='HEAD'?undefined:body);
  }catch(e){res.writeHead(e.code==='ENOENT'||e.code==='EISDIR'||e instanceof URIError?404:500);res.end();}
 };
}
async function saveArtwork(folder,doc,validate){
 validate(doc);const text=JSON.stringify(doc);
 if(Buffer.byteLength(text)>100*1024*1024)throw Error('Project exceeds the 100 MB recovery-copy limit. Use Save project to keep a portable copy.');
 const hash=createHash('sha256').update(text).digest('hex'),name=doc.profile+'-'+hash+'.garage.json';
 await fs.mkdir(folder,{recursive:true});
 const file=path.join(folder,name),temporary=path.join(folder,'.'+name+'.tmp');
 try{await fs.access(file);}catch{
  await fs.writeFile(temporary,text);await fs.rename(temporary,file);
 }
 return{name,hash};
}
module.exports={desktopHandler,saveArtwork};
