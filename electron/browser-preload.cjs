const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('browserUI',{command:(action,value)=>ipcRenderer.invoke('browser-ui',action,value),onState:callback=>ipcRenderer.on('browser-state',(_event,state)=>callback(state))});
