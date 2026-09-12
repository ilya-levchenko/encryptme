import { isSplitVault, openSplitVaultWithKey, updateSplitVault } from './vault.mjs';

const iso = value => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : '';
const tombstonesOf = data => data?.sync?.tombstones && typeof data.sync.tombstones === 'object' ? data.sync.tombstones : {};
const comparable = value => JSON.stringify(value || {});

export function createWifiSyncResponse(merged) {
  return { container: merged.container, stats: merged.stats };
}

export function mergeSplitVaults(localContainer, remoteContainer, key) {
  if (!isSplitVault(localContainer) || !isSplitVault(remoteContainer)) throw new Error('INVALID_SYNC_VAULT');
  if (localContainer.kdf !== remoteContainer.kdf || localContainer.salt !== remoteContainer.salt) throw new Error('SYNC_VAULT_MISMATCH');

  const localData = openSplitVaultWithKey(localContainer, key).data;
  let remoteData;
  try { remoteData = openSplitVaultWithKey(remoteContainer, key).data; }
  catch { throw new Error('SYNC_VAULT_MISMATCH'); }

  const localEntries = new Map(localData.entries.map(entry => [entry.id, entry]));
  const remoteEntries = new Map(remoteData.entries.map(entry => [entry.id, entry]));
  const localTombstones = tombstonesOf(localData);
  const remoteTombstones = tombstonesOf(remoteData);
  const ids = new Set([...localEntries.keys(), ...remoteEntries.keys(), ...Object.keys(localTombstones), ...Object.keys(remoteTombstones)]);
  const entries = [];
  const encryptedEntries = {};
  const tombstones = {};
  const stats = { received: 0, sent: 0, deleted: 0 };

  for (const id of ids) {
    const candidates = [];
    const localEntry = localEntries.get(id); const remoteEntry = remoteEntries.get(id);
    if (localEntry && localContainer.entries[id]) candidates.push({ kind: 'entry', source: 'local', at: iso(localEntry.updatedAt), value: localEntry, encrypted: localContainer.entries[id] });
    if (remoteEntry && remoteContainer.entries[id]) candidates.push({ kind: 'entry', source: 'remote', at: iso(remoteEntry.updatedAt), value: remoteEntry, encrypted: remoteContainer.entries[id] });
    if (iso(localTombstones[id])) candidates.push({ kind: 'deleted', source: 'local', at: localTombstones[id], value: { id, deletedAt: localTombstones[id] } });
    if (iso(remoteTombstones[id])) candidates.push({ kind: 'deleted', source: 'remote', at: remoteTombstones[id], value: { id, deletedAt: remoteTombstones[id] } });
    candidates.sort((a, b) => b.at.localeCompare(a.at) || Number(b.kind === 'deleted') - Number(a.kind === 'deleted') || comparable(b.value).localeCompare(comparable(a.value)));
    const winner = candidates[0];
    if (!winner) continue;
    if (winner.kind === 'deleted') {
      tombstones[id] = winner.at;
      if (localEntry || remoteEntry) stats.deleted += 1;
      continue;
    }
    entries.push(winner.value);
    encryptedEntries[id] = winner.encrypted;
    if (winner.source === 'remote' && comparable(localEntry) !== comparable(remoteEntry)) stats.received += 1;
    if (winner.source === 'local' && comparable(localEntry) !== comparable(remoteEntry)) stats.sent += 1;
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  const localWinsRoot = iso(localData.updatedAt).localeCompare(iso(remoteData.updatedAt)) >= 0;
  const root = localWinsRoot ? localData : remoteData;
  const data = { ...root, version: 2, entries, sync: { ...(root.sync || {}), tombstones } };
  const baseContainer = { ...localContainer, entries: encryptedEntries };
  return { ...updateSplitVault(baseContainer, key, data, data), stats };
}
