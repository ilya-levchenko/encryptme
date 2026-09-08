import { describe, expect, it } from 'vitest';
import { blankVault, decryptVault, encryptVault, usernameDigest } from './vault.mjs';

describe('encrypted vault', () => {
  it('round-trips data without leaking plaintext', async () => {
    const vault = blankVault('real');
    vault.entries.push({ id: '1', date: '2026-08-13', title: 'Секретная запись', content: '<p>Только для меня</p>', mood: 'calm', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const encrypted = await encryptVault(vault, 'correct horse battery staple');
    expect(JSON.stringify(encrypted)).not.toContain('Секретная запись');
    expect((await decryptVault(encrypted, 'correct horse battery staple')).data.entries[0].title).toBe('Секретная запись');
  });

  it('rejects a wrong password', async () => {
    const encrypted = await encryptVault(blankVault('real'), 'correct horse battery staple');
    await expect(decryptVault(encrypted, 'a completely wrong password')).rejects.toThrow();
  });

  it('normalizes profile names before hashing', () => {
    expect(usernameDigest('  Алекс ')).toBe(usernameDigest('алекс'));
  });

  it('creates a plausible independent decoy vault', () => {
    const decoy = blankVault('decoy');
    expect(decoy.entries.length).toBeGreaterThan(0);
    expect(decoy.entries.every(entry => entry.title && entry.content)).toBe(true);
  });
});
