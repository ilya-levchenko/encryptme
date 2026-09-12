const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('encryptMe', {
  platform: 'desktop',
  capabilities: { wifiHost: true, wifiClient: false, qrScanner: false, bluetoothSync: false },
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
  scanWifiSyncQr: () => Promise.reject(new Error('QR_SCANNER_UNAVAILABLE')),
  connectWifiSync: () => Promise.reject(new Error('SYNC_CLIENT_UNAVAILABLE')),
  onWifiSyncUpdated: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('vault:wifi-sync-updated', listener);
    return () => ipcRenderer.removeListener('vault:wifi-sync-updated', listener);
  },
  startBluetoothSync: () => Promise.reject(new Error('BLE_UNAVAILABLE')),
  scanBluetoothPeers: () => Promise.resolve({ peers: [] }),
  connectBluetoothSync: () => Promise.reject(new Error('BLE_UNAVAILABLE')),
  stopBluetoothSync: () => Promise.resolve({ ok: true }),
  onBluetoothProgress: () => () => {},
  onBluetoothSyncUpdated: () => () => {},
  copyText: (text) => ipcRenderer.invoke('app:copy-text', text),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  setLanguage: (locale) => ipcRenderer.invoke('app:set-language', locale),
  onWindowAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('app:lock-before-window-action', listener);
    return () => ipcRenderer.removeListener('app:lock-before-window-action', listener);
  },
  completeWindowAction: (action) => ipcRenderer.invoke('app:complete-window-action', action)
});
