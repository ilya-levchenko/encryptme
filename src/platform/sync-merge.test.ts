import { describe, expect, it } from 'vitest';
import { encryptBlob, type SplitContainer } from './crypto';
import { mergeSplitContainers } from './sync-merge';

async function fixture(entries: DiaryEntry[], tombstones: Record<string, string> = {}) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const salt = btoa('same-vault-salt');
  const index = await encryptBlob({ version: 2, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', entries: entries.map(({ content: _content, ...entry }) => entry), settings: { autoLockMs: 60_000 }, sync: { tombstones } }, key);
  const encryptedEntries = Object.fromEntries(await Promise.all(entries.map(async entry => [entry.id, await encryptBlob({ content: entry.content }, key)])));
  return { key, container: { version: 2, kdf: 'pbkdf2-sha256-600000', salt, index, entries: encryptedEntries } satisfies SplitContainer };
}

describe('transport-independent vault merge', () => {
  it('selects the newest encrypted entry without decrypting its content', async () => {
    const oldEntry = { id: 'note', date: '2026-09-12', title: 'old', content: 'old content', mood: 'none' as const, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-09-12T10:00:00.000Z' };
    const local = await fixture([oldEntry]);
    const newer = { ...oldEntry, title: 'new', content: 'new content', updatedAt: '2026-09-12T11:00:00.000Z' };
    const remoteIndex = await encryptBlob({ version: 2, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-09-12T11:00:00.000Z', entries: [{ ...newer, content: undefined }].map(({ content: _content, ...entry }) => entry), settings: { autoLockMs: 60_000 }, sync: { tombstones: {} } }, local.key);
    const remoteContent = await encryptBlob({ content: newer.content }, local.key);
    const remote = { ...local.container, index: remoteIndex, entries: { note: remoteContent } };
    const merged = await mergeSplitContainers(local.container, remote, local.key);
    expect(merged.data.entries[0].title).toBe('new');
    expect(merged.container.entries.note).toEqual(remoteContent);
    expect(merged.stats.received).toBe(1);
  });

  it('lets a newer tombstone win and rejects another vault', async () => {
    const entry = { id: 'note', date: '2026-09-12', title: 'note', content: 'secret', mood: 'none' as const, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-09-12T10:00:00.000Z' };
    const local = await fixture([entry]);
    const deletedIndex = await encryptBlob({ version: 2, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-09-12T12:00:00.000Z', entries: [], settings: { autoLockMs: 60_000 }, sync: { tombstones: { note: '2026-09-12T12:00:00.000Z' } } }, local.key);
    const merged = await mergeSplitContainers(local.container, { ...local.container, index: deletedIndex, entries: {} }, local.key);
    expect(merged.data.entries).toHaveLength(0);
    expect(merged.data.sync?.tombstones?.note).toBe('2026-09-12T12:00:00.000Z');
    await expect(mergeSplitContainers(local.container, { ...local.container, salt: 'different' }, local.key)).rejects.toThrow('SYNC_VAULT_MISMATCH');
  });
});
