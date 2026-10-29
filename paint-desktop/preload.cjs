const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('paintDesktop',{
 snapshot:doc=>ipcRenderer.invoke('desktop-snapshot',doc),
 ready:info=>ipcRenderer.send('desktop-ready',info),
 closeResult:result=>ipcRenderer.send('desktop-close-result',result),
 onAction:fn=>ipcRenderer.on('desktop-action',(_event,action)=>fn(action)),
});
