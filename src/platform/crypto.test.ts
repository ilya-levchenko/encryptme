import { describe, expect, it } from 'vitest';
import { decryptContainer, encryptContainer, usernameDigest } from './crypto';
// The Electron implementation intentionally stays plain ESM for the main process.
// @ts-expect-error JavaScript module without a declaration file.
import { decryptVault, encryptVault, usernameDigest as nodeUsernameDigest } from '../../electron/vault.mjs';

const password = 'совместимый-пароль-123';
const payload = { version: 1, title: 'Одна копия для Windows и iOS', entries: [1, 2, 3] };

describe('cross-platform encryption', () => {
  it('opens an iOS/Web Crypto container in Electron', async () => {
    const encrypted = await encryptContainer(payload, password);
    const decrypted = await decryptVault(encrypted, password);
    expect(decrypted.data).toMatchObject(payload);
  });

  it('opens an Electron container on iOS/Web Crypto', async () => {
    const encrypted = await encryptVault(payload, password);
    const decrypted = await decryptContainer<typeof payload>(encrypted, password);
    expect(decrypted.data).toMatchObject(payload);
  });

  it('normalizes profile names identically', async () => {
    expect(await usernameDigest('  ИЛЬЯ  ')).toBe(nodeUsernameDigest('  ИЛЬЯ  '));
  });
});
