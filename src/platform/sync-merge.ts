import { decryptBlob, encryptBlob, isSplitContainer, type EncryptedBlob, type SplitContainer } from './crypto';

export type SyncStats = { received: number; sent: number; deleted: number };

const validIso = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : '';
const comparable = (value: unknown) => JSON.stringify(value || {});
const tombstonesOf = (data: VaultData) => data.sync?.tombstones && typeof data.sync.tombstones === 'object' ? data.sync.tombstones : {};

type Candidate = {
  kind: 'entry' | 'deleted';
  source: 'local' | 'remote';
  at: string;
  value: DiaryEntry | { id: string; deletedAt: string };
  encrypted?: EncryptedBlob;
};

export async function mergeSplitContainers(localContainer: SplitContainer, remoteContainer: SplitContainer, key: CryptoKey) {
  if (!isSplitContainer(localContainer) || !isSplitContainer(remoteContainer)) throw new Error('INVALID_SYNC_VAULT');
  if (localContainer.kdf !== remoteContainer.kdf || localContainer.salt !== remoteContainer.salt) throw new Error('SYNC_VAULT_MISMATCH');

  let localData: VaultData;
  let remoteData: VaultData;
  try {
    [localData, remoteData] = await Promise.all([
      decryptBlob<VaultData>(localContainer.index, key),
      decryptBlob<VaultData>(remoteContainer.index, key)
    ]);
  } catch {
    throw new Error('SYNC_VAULT_MISMATCH');
  }
  if (!Array.isArray(localData.entries) || !Array.isArray(remoteData.entries)) throw new Error('INVALID_SYNC_VAULT');

  const localEntries = new Map(localData.entries.map(entry => [entry.id, entry]));
  const remoteEntries = new Map(remoteData.entries.map(entry => [entry.id, entry]));
  const localTombstones = tombstonesOf(localData);
  const remoteTombstones = tombstonesOf(remoteData);
  const ids = new Set([...localEntries.keys(), ...remoteEntries.keys(), ...Object.keys(localTombstones), ...Object.keys(remoteTombstones)]);
  const entries: DiaryEntry[] = [];
  const encryptedEntries: Record<string, EncryptedBlob> = {};
  const tombstones: Record<string, string> = {};
  const stats: SyncStats = { received: 0, sent: 0, deleted: 0 };

  for (const id of ids) {
    const candidates: Candidate[] = [];
    const localEntry = localEntries.get(id);
    const remoteEntry = remoteEntries.get(id);
    if (localEntry && localContainer.entries[id]) candidates.push({ kind: 'entry', source: 'local', at: validIso(localEntry.updatedAt), value: localEntry, encrypted: localContainer.entries[id] });
    if (remoteEntry && remoteContainer.entries[id]) candidates.push({ kind: 'entry', source: 'remote', at: validIso(remoteEntry.updatedAt), value: remoteEntry, encrypted: remoteContainer.entries[id] });
    if (validIso(localTombstones[id])) candidates.push({ kind: 'deleted', source: 'local', at: localTombstones[id], value: { id, deletedAt: localTombstones[id] } });
    if (validIso(remoteTombstones[id])) candidates.push({ kind: 'deleted', source: 'remote', at: remoteTombstones[id], value: { id, deletedAt: remoteTombstones[id] } });
    candidates.sort((a, b) => b.at.localeCompare(a.at) || Number(b.kind === 'deleted') - Number(a.kind === 'deleted') || comparable(b.value).localeCompare(comparable(a.value)));
    const winner = candidates[0];
    if (!winner) continue;
    if (winner.kind === 'deleted') {
      tombstones[id] = winner.at;
      if (localEntry || remoteEntry) stats.deleted += 1;
      continue;
    }
    entries.push(winner.value as DiaryEntry);
    encryptedEntries[id] = winner.encrypted!;
    if (winner.source === 'remote' && comparable(localEntry) !== comparable(remoteEntry)) stats.received += 1;
    if (winner.source === 'local' && comparable(localEntry) !== comparable(remoteEntry)) stats.sent += 1;
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  const root = validIso(localData.updatedAt).localeCompare(validIso(remoteData.updatedAt)) >= 0 ? localData : remoteData;
  const data: VaultData = { ...root, version: 2, updatedAt: new Date().toISOString(), entries, sync: { ...(root.sync || {}), tombstones } };
  const index = await encryptBlob(data, key);
  return { container: { ...localContainer, index, entries: encryptedEntries }, data, stats };
}
