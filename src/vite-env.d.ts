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

interface Window {
  encryptMe: {
    platform: 'desktop' | 'mobile' | 'web';
    status(): Promise<{ initialized: boolean }>;
    initialize(input: { username: string; realPassword: string; decoyPassword: string }): Promise<{ ok: boolean }>;
    unlock(input: { username: string; password: string }): Promise<{ sessionId: string; data: VaultData }>;
    loadEntry(input: { sessionId: string; id: string }): Promise<{ id: string; content: string }>;
    save(input: { sessionId: string; data: VaultData }): Promise<{ savedAt: string }>;
    lock(): Promise<{ ok: boolean }>;
    exportBackup(input: { sessionId: string }): Promise<{ canceled: boolean; fileName?: string; exportedAt?: string; fallback?: boolean }>;
    importBackup(input: { username: string; password: string }): Promise<{ canceled: boolean; importedAt?: string; recoveryCreated?: boolean }>;
    startWifiSync(input: { sessionId: string }): Promise<{ addresses: string[]; code: string; expiresAt: string }>;
    stopWifiSync(): Promise<{ ok: boolean }>;
    scanWifiSyncQr(): Promise<{ address: string; code: string }>;
    connectWifiSync(input: { sessionId: string; address: string; code: string }): Promise<{ data: VaultData; stats: WifiSyncStats }>;
    onWifiSyncUpdated(callback: (update: { sessionId: string; data: VaultData; stats: WifiSyncStats }) => void): () => void;
    onWindowAction(callback: (action: 'hide' | 'quit') => void): () => void;
    completeWindowAction(action: 'hide' | 'quit'): Promise<{ ok: boolean }>;
  };
}
