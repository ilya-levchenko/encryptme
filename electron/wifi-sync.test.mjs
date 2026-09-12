import { describe, expect, it } from 'vitest';
import { blankVault, createSplitVault, loadSplitEntry, updateSplitVault } from './vault.mjs';
import { createWifiSyncResponse, mergeSplitVaults } from './wifi-sync.mjs';

const entry = (id, title, updatedAt, content = title) => ({ id, date: '2026-09-09', title, content, mood: 'none', createdAt: updatedAt, updatedAt });

describe('Wi-Fi vault merge', () => {
  it('merges independently encrypted entries and keeps the newest revision', async () => {
    const initial = { ...blankVault('real'), entries: [entry('shared', 'Старая', '2026-09-09T10:00:00.000Z', 'old')] };
    const created = await createSplitVault(initial, 'correct horse battery staple');
    const local = updateSplitVault(created.container, created.key, { ...created.data, entries: [entry('shared', 'Windows', '2026-09-09T11:00:00.000Z', 'desktop'), entry('local', 'Локальная', '2026-09-09T11:01:00.000Z', 'local')] }, created.data);
    const remote = updateSplitVault(created.container, created.key, { ...created.data, entries: [entry('shared', 'iPhone', '2026-09-09T12:00:00.000Z', 'mobile'), entry('remote', 'Мобильная', '2026-09-09T12:01:00.000Z', 'remote')] }, created.data);
    const merged = mergeSplitVaults(local.container, remote.container, created.key);
    expect(merged.data.entries.map(item => item.id)).toEqual(['local', 'remote', 'shared']);
    expect(merged.data.entries.find(item => item.id === 'shared')?.title).toBe('iPhone');
    expect(loadSplitEntry(merged.container, created.key, 'shared')).toBe('mobile');
    expect(merged.stats.received).toBeGreaterThan(0);
    created.key.fill(0);
  });

  it('propagates deletion tombstones without resurrecting an older entry', async () => {
    const initial = { ...blankVault('real'), entries: [entry('gone', 'Удалить', '2026-09-09T10:00:00.000Z')] };
    const created = await createSplitVault(initial, 'correct horse battery staple');
    const remote = updateSplitVault(created.container, created.key, { ...created.data, entries: [], sync: { tombstones: { gone: '2026-09-09T13:00:00.000Z' } } }, created.data);
    const merged = mergeSplitVaults(created.container, remote.container, created.key);
    expect(merged.data.entries).toHaveLength(0);
    expect(merged.data.sync.tombstones.gone).toBe('2026-09-09T13:00:00.000Z');
    expect(merged.container.entries.gone).toBeUndefined();
    created.key.fill(0);
  });

  it('rejects a different vault even when its password happens to match', async () => {
    const local = await createSplitVault(blankVault('real'), 'correct horse battery staple');
    const remote = await createSplitVault(blankVault('real'), 'correct horse battery staple');
    expect(() => mergeSplitVaults(local.container, remote.container, local.key)).toThrow('SYNC_VAULT_MISMATCH');
    local.key.fill(0); remote.key.fill(0);
  });

  it('never includes decrypted diary data in the network response', () => {
    const response = createWifiSyncResponse({
      container: { format: 'encryptme-vault-split' },
      data: { entries: [{ title: 'Секретный текст' }] },
      stats: { received: 1, sent: 0, deleted: 0 }
    });

    expect(response).toEqual({
      container: { format: 'encryptme-vault-split' },
      stats: { received: 1, sent: 0, deleted: 0 }
    });
    expect(JSON.stringify(response)).not.toContain('Секретный текст');
  });
});
