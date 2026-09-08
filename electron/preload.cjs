const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('encryptMe', {
  status: () => ipcRenderer.invoke('vault:status'),
  initialize: (input) => ipcRenderer.invoke('vault:initialize', input),
  unlock: (input) => ipcRenderer.invoke('vault:unlock', input),
  loadEntry: (input) => ipcRenderer.invoke('vault:load-entry', input),
  save: (input) => ipcRenderer.invoke('vault:save', input),
  lock: () => ipcRenderer.invoke('vault:lock'),
  exportBackup: (input) => ipcRenderer.invoke('vault:export', input),
  importBackup: (input) => ipcRenderer.invoke('vault:import', input),
  onWindowAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('app:lock-before-window-action', listener);
    return () => ipcRenderer.removeListener('app:lock-before-window-action', listener);
  },
  completeWindowAction: (action) => ipcRenderer.invoke('app:complete-window-action', action)
});
