import { describe, expect, it } from 'vitest';
import { buildBluetoothEnvelope, openBluetoothEnvelope, fragmentUtf8, assembleUtf8Fragments } from './bluetooth-protocol';
import { encryptBlob, type SplitContainer } from './crypto';

describe('Bluetooth sync protocol', () => {
  it('encrypts and authenticates a split vault envelope', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const container: SplitContainer = { version: 2, kdf: 'pbkdf2-sha256-600000', salt: 'salt', index: await encryptBlob({ entries: [] }, key), entries: {} };
    const encoded = await buildBluetoothEnvelope(container, key);
    expect(encoded).not.toContain('"entries":{}');
    await expect(openBluetoothEnvelope(encoded, key, 'salt')).resolves.toEqual(container);
    await expect(openBluetoothEnvelope(encoded, key, 'other')).rejects.toThrow('SYNC_VAULT_MISMATCH');
  });

  it('round-trips UTF-8 fragments and detects missing or corrupt frames', async () => {
    const frames = await fragmentUtf8('Привет Bluetooth 👋'.repeat(50), 80, 'transfer-1');
    expect(frames.length).toBeGreaterThan(1);
    await expect(assembleUtf8Fragments([...frames].reverse())).resolves.toBe('Привет Bluetooth 👋'.repeat(50));
    await expect(assembleUtf8Fragments(frames.slice(1))).rejects.toThrow('BLE_FRAGMENT_MISSING');
    await expect(assembleUtf8Fragments([{ ...frames[0], body: 'AA==' }, ...frames.slice(1)])).rejects.toThrow('BLE_CHECKSUM');
  });
});
