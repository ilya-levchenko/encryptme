/// <reference types="vite/client" />

type DiaryEntry = {
  id: string;
  date: string;
  title: string;
  content: string;
  mood: 'calm' | 'good' | 'bright' | 'heavy' | 'none';
  createdAt: string;
  updatedAt: string;
};

type VaultData = { version: number; createdAt: string; updatedAt: string; entries: DiaryEntry[]; settings?: { autoLockMs: number } };

interface Window {
  encryptMe: {
    status(): Promise<{ initialized: boolean }>;
    initialize(input: { username: string; realPassword: string; decoyPassword: string }): Promise<{ ok: boolean }>;
    unlock(input: { username: string; password: string }): Promise<{ sessionId: string; data: VaultData }>;
    save(input: { sessionId: string; data: VaultData }): Promise<{ savedAt: string }>;
    lock(): Promise<{ ok: boolean }>;
    exportBackup(input: { sessionId: string }): Promise<{ canceled: boolean; fileName?: string; exportedAt?: string; fallback?: boolean }>;
    importBackup(input: { username: string; password: string }): Promise<{ canceled: boolean; importedAt?: string; recoveryCreated?: boolean }>;
    onWindowAction(callback: (action: 'hide' | 'quit') => void): () => void;
    completeWindowAction(action: 'hide' | 'quit'): Promise<{ ok: boolean }>;
  };
}
