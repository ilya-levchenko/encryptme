const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('encryptMe', {
  platform: 'desktop',
  status: () => ipcRenderer.invoke('vault:status'),
  initialize: (input) => ipcRenderer.invoke('vault:initialize', input),
  unlock: (input) => ipcRenderer.invoke('vault:unlock', input),
  loadEntry: (input) => ipcRenderer.invoke('vault:load-entry', input),
  save: (input) => ipcRenderer.invoke('vault:save', input),
  lock: () => ipcRenderer.invoke('vault:lock'),
  exportBackup: (input) => ipcRenderer.invoke('vault:export', input),
  importBackup: (input) => ipcRenderer.invoke('vault:import', input),
  startWifiSync: (input) => ipcRenderer.invoke('wifi-sync:start', input),
  stopWifiSync: () => ipcRenderer.invoke('wifi-sync:stop'),
  connectWifiSync: () => Promise.reject(new Error('SYNC_CLIENT_UNAVAILABLE')),
  onWifiSyncUpdated: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('vault:wifi-sync-updated', listener);
    return () => ipcRenderer.removeListener('vault:wifi-sync-updated', listener);
  },
  onWindowAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('app:lock-before-window-action', listener);
    return () => ipcRenderer.removeListener('app:lock-before-window-action', listener);
  },
  completeWindowAction: (action) => ipcRenderer.invoke('app:complete-window-action', action)
});
