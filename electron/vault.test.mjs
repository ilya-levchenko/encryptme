import { describe, expect, it } from 'vitest';
import { blankVault, createSplitVault, decryptVault, deriveVaultKey, encryptVault, FAST_KDF, loadSplitEntry, openSplitVault, openSplitVaultWithKey, rekeySplitVault, updateSplitVault, usernameDigest } from './vault.mjs';

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

  it('localizes newly-created decoy samples', () => {
    expect(blankVault('real', 'en').entries).toHaveLength(0);
    expect(blankVault('decoy', 'en').entries[0].title).toBe('Plans for the week');
    expect(blankVault('decoy', 'ru').entries[0].title).toBe('Планы на неделю');
  });

  it('opens only the encrypted index and decrypts an entry on demand', async () => {
    const source = blankVault('real');
    source.entries.push({ id: 'entry-1', date: '2026-09-09', title: 'Ленивая запись', content: '<p>Содержимое по выбору</p>', mood: 'calm', createdAt: source.createdAt, updatedAt: source.updatedAt });
    const created = await createSplitVault(source, 'correct horse battery staple');
    const opened = await openSplitVault(created.container, 'correct horse battery staple');

    expect(opened.data.entries[0].content).toBeUndefined();
    expect(JSON.stringify(created.container)).not.toContain('Содержимое по выбору');
    expect(loadSplitEntry(created.container, opened.key, 'entry-1')).toBe('<p>Содержимое по выбору</p>');
    created.key.fill(0); opened.key.fill(0);
  });

  it('re-encrypts only a changed entry', async () => {
    const source = blankVault('decoy');
    const created = await createSplitVault(source, 'correct horse battery staple');
    const opened = await openSplitVault(created.container, 'correct horse battery staple');
    const [first, second] = opened.data.entries;
    const firstContent = loadSplitEntry(created.container, opened.key, first.id);
    const snapshot = { ...opened.data, entries: [{ ...first, content: `${firstContent}<p>Изменено</p>` }, second] };
    const updated = updateSplitVault(created.container, opened.key, snapshot, { ...opened.data, entries: [{ ...first, content: firstContent }, second] });

    expect(updated.container.entries[first.id]).not.toEqual(created.container.entries[first.id]);
    expect(updated.container.entries[second.id]).toEqual(created.container.entries[second.id]);
    created.key.fill(0); opened.key.fill(0);
  });

  it('preserves legacy diary contents during v1 to v2 migration', async () => {
    const source = blankVault('decoy');
    const legacy = await encryptVault(source, 'correct horse battery staple');
    const decrypted = await decryptVault(legacy, 'correct horse battery staple');
    const migrated = await createSplitVault(decrypted.data, 'correct horse battery staple', decrypted.salt);
    const opened = await openSplitVault(migrated.container, 'correct horse battery staple');

    expect(opened.data.entries.map(entry => entry.title)).toEqual(source.entries.map(entry => entry.title));
    expect(loadSplitEntry(migrated.container, opened.key, source.entries[0].id)).toBe(source.entries[0].content);
    migrated.key.fill(0); opened.key.fill(0);
  });

  it('rekeys a split vault to the shared salt without changing its contents', async () => {
    const source = blankVault('decoy');
    const created = await createSplitVault(source, 'correct horse battery staple');
    const sharedSalt = Buffer.alloc(16, 7);
    const sharedKey = await deriveVaultKey('correct horse battery staple', sharedSalt, FAST_KDF);
    const rekeyed = rekeySplitVault(created.container, created.key, sharedKey, sharedSalt);
    const opened = openSplitVaultWithKey(rekeyed, sharedKey);

    expect(rekeyed.salt).toBe(sharedSalt.toString('base64'));
    expect(opened.data.entries.map(entry => entry.title)).toEqual(source.entries.map(entry => entry.title));
    expect(loadSplitEntry(rekeyed, sharedKey, source.entries[0].id)).toBe(source.entries[0].content);
    created.key.fill(0); sharedKey.fill(0);
  });
});
