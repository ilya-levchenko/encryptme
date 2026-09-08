import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

export interface VaultStorage {
  exists(path: string): Promise<boolean>;
  read<T>(path: string): Promise<T>;
  write<T>(path: string, value: T): Promise<void>;
}

class NativeVaultStorage implements VaultStorage {
  async exists(path: string) {
    try {
      await Filesystem.stat({ path, directory: Directory.Library });
      return true;
    } catch {
      return false;
    }
  }

  async read<T>(path: string) {
    const result = await Filesystem.readFile({ path, directory: Directory.Library, encoding: Encoding.UTF8 });
    return JSON.parse(String(result.data)) as T;
  }

  async write<T>(path: string, value: T) {
    await Filesystem.writeFile({ path, directory: Directory.Library, encoding: Encoding.UTF8, recursive: true, data: JSON.stringify(value) });
  }
}

class BrowserVaultStorage implements VaultStorage {
  private key(path: string) { return `encryptme:${path}`; }

  async exists(path: string) { return localStorage.getItem(this.key(path)) !== null; }

  async read<T>(path: string) {
    const value = localStorage.getItem(this.key(path));
    if (value === null) throw new Error('FILE_NOT_FOUND');
    return JSON.parse(value) as T;
  }

  async write<T>(path: string, value: T) { localStorage.setItem(this.key(path), JSON.stringify(value)); }
}

export const vaultStorage: VaultStorage = Capacitor.isNativePlatform() ? new NativeVaultStorage() : new BrowserVaultStorage();
