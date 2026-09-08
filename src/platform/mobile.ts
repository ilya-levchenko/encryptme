import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { decryptBlob, decryptContainer, deriveKey, encryptBlob, encryptContainer, fromBase64, isEncryptedContainer, isSplitContainer, isVaultContainer, secureEqual, type EncryptedContainer, type SplitContainer, toBase64, usernameDigest } from './crypto';
import { vaultStorage } from './storage';

type Profile = { version: 1; usernameHash: string; slots: ['a', 'b'] };
type Session = { id: string; slot: 'a' | 'b'; password: string; key: CryptoKey; container: SplitContainer; data: VaultData };
type VaultContainer = EncryptedContainer | SplitContainer;
type BackupPayload = { format: 'encryptme-backup-payload'; version: 1; exportedAt: string; profile: Profile; vaults: Record<'a' | 'b', VaultContainer> };
type BackupDocument = { format: 'encryptme-backup'; version: 1; encrypted: EncryptedContainer };

const profilePath = 'vault/profile.json';
const vaultPath = (slot: 'a' | 'b') => `vault/vault-${slot}.encryptme`;
const windowActions = new Set<(action: 'hide' | 'quit') => void>();
let session: Session | null = null;
let saveChain: Promise<void> = Promise.resolve();

const today = () => new Date().toISOString().slice(0, 10);
const shiftedDay = (offset: number) => { const value = new Date(); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10); };
const blankVault = (decoy = false): VaultData => {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    settings: { autoLockMs: 60_000 },
    entries: decoy ? [
      { id: crypto.randomUUID(), date: today(), title: 'Планы на неделю', content: '<p>Разобрать фотографии, купить продукты и выбрать фильм на выходные.</p>', mood: 'calm', createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), date: shiftedDay(-2), title: 'Небольшая прогулка', content: '<p>Вечером было тихо. Прошёлся по привычному маршруту и взял кофе по дороге домой.</p>', mood: 'good', createdAt: now, updatedAt: now }
    ] : []
  };
};

const withoutContent = ({ content: _content, ...entry }: DiaryEntry) => entry;

async function createSplitVault(data: VaultData, password: string, existingSalt?: Uint8Array) {
  const salt = existingSalt || crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const entries = Object.fromEntries(await Promise.all(data.entries.map(async entry => [entry.id, await encryptBlob({ content: entry.content || '' }, key)] as const)));
  const indexData: VaultData = { ...data, version: 2, updatedAt: new Date().toISOString(), entries: data.entries.map(withoutContent) };
  const container: SplitContainer = { version: 2, kdf: 'scrypt-32768-8-1', salt: toBase64(salt), index: await encryptBlob(indexData, key), entries };
  return { container, key, data: indexData };
}

async function openSplitVault(container: SplitContainer, password: string) {
  const key = await deriveKey(password, fromBase64(container.salt));
  const data = await decryptBlob<VaultData>(container.index, key);
  if (!Array.isArray(data.entries)) throw new Error('INVALID_VAULT');
  return { key, data: { ...data, entries: data.entries.map(withoutContent) } };
}

async function updateSplitVault(active: Session, snapshot: VaultData) {
  const previous = new Map(active.data.entries.map(entry => [entry.id, entry]));
  const entries: SplitContainer['entries'] = {};
  for (const entry of snapshot.entries) {
    const old = previous.get(entry.id);
    if (typeof entry.content === 'string' && (!old || entry.content !== old.content || !active.container.entries[entry.id])) {
      entries[entry.id] = await encryptBlob({ content: entry.content }, active.key);
    } else if (active.container.entries[entry.id]) entries[entry.id] = active.container.entries[entry.id];
    else throw new Error('ENTRY_CONTENT_MISSING');
  }
  const data: VaultData = { ...snapshot, version: 2, updatedAt: new Date().toISOString(), entries: snapshot.entries.map(withoutContent) };
  return { container: { ...active.container, index: await encryptBlob(data, active.key), entries }, data };
}

function assertSession(sessionId: string) {
  if (!session || session.id !== sessionId) throw new Error('LOCKED');
  return session;
}

function validProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<Profile>;
  return profile.version === 1 && /^[a-f0-9]{64}$/i.test(profile.usernameHash || '')
    && Array.isArray(profile.slots) && profile.slots.length === 2 && profile.slots.includes('a') && profile.slots.includes('b');
}

function validPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<BackupPayload>;
  return payload.format === 'encryptme-backup-payload' && payload.version === 1 && typeof payload.exportedAt === 'string' && validProfile(payload.profile)
    && Boolean(payload.vaults) && isVaultContainer(payload.vaults?.a) && isVaultContainer(payload.vaults?.b);
}

async function chooseBackupFile() {
  return new Promise<File | null>(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.encryptme-backup,application/json';
    input.style.display = 'none';
    let settled = false;
    const finish = (file: File | null) => { if (settled) return; settled = true; input.remove(); resolve(file); };
    input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true });
    window.addEventListener('focus', () => window.setTimeout(() => finish(input.files?.[0] || null), 400), { once: true });
    document.body.append(input);
    input.click();
  });
}

async function exportDocument(backupDocument: BackupDocument) {
  const fileName = `EncryptMe-backup-${today()}.encryptme-backup`;
  const contents = JSON.stringify(backupDocument);
  if (Capacitor.isNativePlatform()) {
    const path = `exports/${fileName}`;
    const result = await Filesystem.writeFile({ path, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true, data: contents });
    await Share.share({ title: 'Резервная копия EncryptMe', text: 'Зашифрованная резервная копия', url: result.uri, dialogTitle: 'Сохранить или отправить копию' });
  } else {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return fileName;
}

async function initializeLifecycle() {
  if (!Capacitor.isNativePlatform()) return;
  await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) windowActions.forEach(callback => callback('hide'));
  });
}

export function createMobileBridge(): Window['encryptMe'] {
  void initializeLifecycle();
  return {
    async status() { return { initialized: await vaultStorage.exists(profilePath) }; },

    async initialize(input) {
      if (await vaultStorage.exists(profilePath)) throw new Error('ALREADY_INITIALIZED');
      const username = String(input.username || '').trim();
      const realPassword = String(input.realPassword || '');
      const decoyPassword = String(input.decoyPassword || '');
      if (username.length < 2 || realPassword.length < 10 || decoyPassword.length < 10 || realPassword === decoyPassword) throw new Error('INVALID_SETUP');
      const slots: ['a' | 'b', 'a' | 'b'] = crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? ['a', 'b'] : ['b', 'a'];
      const [real, decoy] = await Promise.all([createSplitVault(blankVault(), realPassword), createSplitVault(blankVault(true), decoyPassword)]);
      await Promise.all([vaultStorage.write(vaultPath(slots[0]), real.container), vaultStorage.write(vaultPath(slots[1]), decoy.container)]);
      await vaultStorage.write<Profile>(profilePath, { version: 1, usernameHash: await usernameDigest(username), slots: ['a', 'b'] });
      return { ok: true };
    },

    async unlock(input) {
      const profile = await vaultStorage.read<Profile>(profilePath);
      const usernameOk = secureEqual(await usernameDigest(String(input.username || '')), profile.usernameHash);
      const attempts = await Promise.all(profile.slots.map(async slot => {
        let stored: VaultContainer;
        try { stored = await vaultStorage.read<VaultContainer>(vaultPath(slot)); }
        catch { return null; }
        if (isSplitContainer(stored)) {
          try { return { slot, container: stored, ...(await openSplitVault(stored, String(input.password || ''))) }; }
          catch { return null; }
        }
        let legacy;
        try { legacy = await decryptContainer<VaultData>(stored, String(input.password || '')); }
        catch { return null; }
        const migrated = await createSplitVault(legacy.data, String(input.password || ''), legacy.salt);
        await vaultStorage.write(vaultPath(slot), migrated.container);
        return { slot, container: migrated.container, key: migrated.key, data: migrated.data };
      }));
      const match = usernameOk ? attempts.find(Boolean) : null;
      if (!match) { await new Promise(resolve => window.setTimeout(resolve, 350)); throw new Error('INVALID_CREDENTIALS'); }
      session = { id: crypto.randomUUID(), slot: match.slot, password: String(input.password), key: match.key, container: match.container, data: match.data };
      return { sessionId: session.id, data: session.data };
    },

    async loadEntry(input) {
      const active = assertSession(input.sessionId);
      if (!active.data.entries.some(entry => entry.id === input.id)) throw new Error('ENTRY_NOT_FOUND');
      const value = await decryptBlob<{ content: string }>(active.container.entries[input.id], active.key);
      active.data = { ...active.data, entries: active.data.entries.map(entry => entry.id === input.id ? { ...entry, content: value.content || '' } : entry) };
      return { id: input.id, content: value.content || '' };
    },

    async save(input) {
      const active = assertSession(input.sessionId);
      const snapshot = structuredClone(input.data);
      const operation = saveChain.then(async () => {
        if (session !== active) throw new Error('LOCKED');
        const updated = await updateSplitVault(active, snapshot);
        await vaultStorage.write(vaultPath(active.slot), updated.container);
        active.container = updated.container;
        active.data = { ...snapshot, version: updated.data.version, updatedAt: updated.data.updatedAt };
        return { savedAt: new Date().toISOString() };
      });
      saveChain = operation.then(() => undefined, () => undefined);
      return operation;
    },

    async lock() {
      await saveChain;
      if (session) session.password = '\0'.repeat(session.password.length);
      session = null;
      return { ok: true };
    },

    async exportBackup(input) {
      const active = assertSession(input.sessionId);
      const payload: BackupPayload = {
        format: 'encryptme-backup-payload', version: 1, exportedAt: new Date().toISOString(),
        profile: await vaultStorage.read<Profile>(profilePath),
        vaults: { a: await vaultStorage.read(vaultPath('a')), b: await vaultStorage.read(vaultPath('b')) }
      };
      const backup: BackupDocument = { format: 'encryptme-backup', version: 1, encrypted: await encryptContainer(payload, active.password) };
      const fileName = await exportDocument(backup);
      return { canceled: false, fileName, exportedAt: new Date().toISOString(), fallback: false };
    },

    async importBackup(input) {
      if (session) throw new Error('VAULT_OPEN');
      const file = await chooseBackupFile();
      if (!file) return { canceled: true };
      if (file.size > 64 * 1024 * 1024) throw new Error('BACKUP_TOO_LARGE');
      const backup = JSON.parse(await file.text()) as Partial<BackupDocument>;
      if (backup.format !== 'encryptme-backup' || backup.version !== 1 || !isEncryptedContainer(backup.encrypted)) throw new Error('INVALID_BACKUP');
      let payload: BackupPayload;
      try { payload = (await decryptContainer<BackupPayload>(backup.encrypted, String(input.password || ''))).data; }
      catch { throw new Error('INVALID_BACKUP_PASSWORD'); }
      if (!validPayload(payload)) throw new Error('INVALID_BACKUP');
      if (!secureEqual(await usernameDigest(String(input.username || '')), payload.profile.usernameHash)) throw new Error('BACKUP_PROFILE_MISMATCH');
      const recoveryCreated = await vaultStorage.exists(profilePath);
      if (recoveryCreated) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await Promise.all([
          vaultStorage.write(`recovery/${stamp}/profile.json`, await vaultStorage.read(profilePath)),
          vaultStorage.write(`recovery/${stamp}/vault-a.encryptme`, await vaultStorage.read(vaultPath('a'))),
          vaultStorage.write(`recovery/${stamp}/vault-b.encryptme`, await vaultStorage.read(vaultPath('b')))
        ]);
      }
      await Promise.all([vaultStorage.write(vaultPath('a'), payload.vaults.a), vaultStorage.write(vaultPath('b'), payload.vaults.b)]);
      await vaultStorage.write(profilePath, payload.profile);
      return { canceled: false, importedAt: new Date().toISOString(), recoveryCreated };
    },

    onWindowAction(callback) { windowActions.add(callback); return () => windowActions.delete(callback); },
    async completeWindowAction() { return { ok: true }; }
  };
}
