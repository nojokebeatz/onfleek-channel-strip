const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cs', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (s) => ipcRenderer.invoke('state:save', s),
  version: () => ipcRenderer.invoke('app:version'),
  openExternal: (u) => ipcRenderer.invoke('shell:open', u),
  minimize: () => ipcRenderer.invoke('win:minimize'),
  close: () => ipcRenderer.invoke('win:close')
});
