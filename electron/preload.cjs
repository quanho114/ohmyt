const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  runtime: { apiBase: `http://127.0.0.1:${process.argv.find(arg => arg.startsWith('--ohmyt-runtime-port='))?.split('=')[1]}/api`, token: process.argv.find(arg => arg.startsWith('--ohmyt-runtime-token='))?.split('=')[1] },
  isElectron: true
});
