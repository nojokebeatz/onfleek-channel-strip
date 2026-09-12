const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cs', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (s) => ipcRenderer.invoke('state:save', s),
  version: () => ipcRenderer.invoke('app:version'),
  openExternal: (u) => ipcRenderer.invoke('shell:open', u),
  updateMode: () => ipcRenderer.invoke('update:mode'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdateEvent: (cb) => ipcRenderer.on('update:event', (e, d) => cb(d)),
  installCable: () => ipcRenderer.invoke('cable:install'),
  onCableProgress: (cb) => ipcRenderer.on('cable:progress', (e, s) => cb(s)),
  minimize: () => ipcRenderer.invoke('win:minimize'),
  close: () => ipcRenderer.invoke('win:close')
});
