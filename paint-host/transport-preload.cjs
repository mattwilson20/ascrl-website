const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('paintTransport',{
 on:(name,fn)=>{if(['offer','frame','control','file','close'].includes(name))ipcRenderer.on('transport-'+name,(_e,data)=>fn(data));},
 send:(name,data)=>{if(['ready','answer','message','connected','error','diagnostic'].includes(name))ipcRenderer.send('transport-'+name,data);}
});
