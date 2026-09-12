/// <reference types="vite/client" />

type DiaryEntry = {
  id: string;
  date: string;
  title: string;
  content?: string;
  mood: 'calm' | 'good' | 'bright' | 'heavy' | 'none';
  createdAt: string;
  updatedAt: string;
};

type VaultData = { version: number; createdAt: string; updatedAt: string; entries: DiaryEntry[]; settings?: { autoLockMs: number }; sync?: { tombstones?: Record<string, string> } };

type WifiSyncStats = { received: number; sent: number; deleted: number };
type BluetoothPeer = { id: string; alias: string; rssi: number };
type BluetoothProgress = { phase: 'waiting' | 'connecting' | 'sending' | 'receiving' | 'complete' | 'error'; completed: number; total: number; error?: string };

interface Window {
  encryptMe: {
    platform: 'desktop' | 'ios' | 'android' | 'web';
    capabilities: { wifiHost: boolean; wifiClient: boolean; qrScanner: boolean; bluetoothSync: boolean };
    status(): Promise<{ initialized: boolean }>;
    initialize(input: { username: string; realPassword: string; decoyPassword: string; locale?: 'ru' | 'en' }): Promise<{ ok: boolean }>;
    unlock(input: { username: string; password: string }): Promise<{ sessionId: string; data: VaultData }>;
    loadEntry(input: { sessionId: string; id: string }): Promise<{ id: string; content: string }>;
    save(input: { sessionId: string; data: VaultData }): Promise<{ savedAt: string }>;
    lock(): Promise<{ ok: boolean }>;
    exportBackup(input: { sessionId: string; locale?: 'ru' | 'en' }): Promise<{ canceled: boolean; fileName?: string; exportedAt?: string; fallback?: boolean }>;
    importBackup(input: { username: string; password: string; locale?: 'ru' | 'en' }): Promise<{ canceled: boolean; importedAt?: string; recoveryCreated?: boolean }>;
    startWifiSync(input: { sessionId: string }): Promise<{ addresses: string[]; code: string; expiresAt: string }>;
    stopWifiSync(): Promise<{ ok: boolean }>;
    scanWifiSyncQr(input?: { locale?: 'ru' | 'en' }): Promise<{ address: string; code: string }>;
    connectWifiSync(input: { sessionId: string; address: string; code: string }): Promise<{ data: VaultData; stats: WifiSyncStats }>;
    onWifiSyncUpdated(callback: (update: { sessionId: string; data: VaultData; stats: WifiSyncStats }) => void): () => void;
    startBluetoothSync(input: { sessionId: string }): Promise<{ alias: string; expiresAt: string }>;
    scanBluetoothPeers(): Promise<{ peers: BluetoothPeer[] }>;
    connectBluetoothSync(input: { sessionId: string; deviceId: string }): Promise<{ data: VaultData; stats: WifiSyncStats }>;
    stopBluetoothSync(): Promise<{ ok: boolean }>;
    onBluetoothProgress(callback: (progress: BluetoothProgress) => void): () => void;
    onBluetoothSyncUpdated(callback: (update: { sessionId: string; data: VaultData; stats: WifiSyncStats }) => void): () => void;
    copyText(text: string): Promise<{ ok: boolean }>;
    openExternal(url: string): Promise<{ ok: boolean }>;
    setLanguage(locale: 'ru' | 'en'): Promise<{ ok: boolean }>;
    onWindowAction(callback: (action: 'hide' | 'quit') => void): () => void;
    completeWindowAction(action: 'hide' | 'quit'): Promise<{ ok: boolean }>;
  };
}
