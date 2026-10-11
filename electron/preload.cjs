const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openHtmlPreview: (content,chatId) => ipcRenderer.invoke('html-preview-open', content,chatId),
  writeClipboard: text => ipcRenderer.invoke('clipboard-write-text', text),
  onBrowserPaneExpand: callback => {const listener=(_event,expanded)=>callback(expanded);ipcRenderer.on('browser-pane-expand',listener);return ()=>ipcRenderer.removeListener('browser-pane-expand',listener);},
  onBrowserPaneClose: callback => {const listener=()=>callback();ipcRenderer.on('browser-pane-close',listener);return ()=>ipcRenderer.removeListener('browser-pane-close',listener);},
  onBrowserPaneOpen: callback => {const listener=(_event,chatId)=>callback(chatId);ipcRenderer.on('browser-pane-open',listener);return ()=>ipcRenderer.removeListener('browser-pane-open',listener);},
  setBrowserChat: chatId => ipcRenderer.invoke('browser-chat',chatId),
  setBrowserFeatures: features => ipcRenderer.invoke('browser-features',features),
  onBrowserFiles: callback => {const listener=()=>callback();ipcRenderer.on('browser-files-open',listener);return ()=>ipcRenderer.removeListener('browser-files-open',listener);},
  openBrowserUrl: url => ipcRenderer.invoke('browser-open-url',url),
  setBrowserBounds: (bounds,paneOpen) => ipcRenderer.invoke('browser-bounds',bounds,paneOpen),
  beginBrowserResize: width => ipcRenderer.invoke('browser-resize-start',width),
  finishBrowserResize: () => ipcRenderer.invoke('browser-resize-finish'),
  openBrowser: () => ipcRenderer.invoke('browser-open'),
  selectProjectDirectory: () => ipcRenderer.invoke('project-select-directory'),
  openProjectDirectory: (directory) => ipcRenderer.invoke('project-open-directory', directory),
  minimize: () => ipcRenderer.send('window-minimize'),
  restart: () => ipcRenderer.send('app-restart'),
  maximize: () => ipcRenderer.send('window-maximize'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChanged: callback => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on('window-maximized-changed', listener);
    return () => ipcRenderer.removeListener('window-maximized-changed', listener);
  },
  close: () => ipcRenderer.send('window-close'),
  runtime: { apiBase: `http://127.0.0.1:${process.argv.find(arg => arg.startsWith('--ohmyt-runtime-port='))?.split('=')[1]}/api`, token: process.argv.find(arg => arg.startsWith('--ohmyt-runtime-token='))?.split('=')[1] },
  isElectron: true
});
