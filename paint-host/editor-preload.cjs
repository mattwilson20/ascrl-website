const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('privatePaintHost',{
 emit:(name,data)=>{if(['controls','field','upload-request','status','snapshot','download','ready','save-state'].includes(name))ipcRenderer.send('editor-'+name,data);},
 on:(name,fn)=>{if(['command','snapshot','restore','upload','connected','seed'].includes(name))ipcRenderer.on('editor-'+name,(_e,data)=>fn(data));}
});
