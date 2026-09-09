import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { decryptBlob, decryptContainer, deriveKey, encryptBlob, encryptContainer, FAST_KDF, fromBase64, isEncryptedContainer, isSplitContainer, isVaultContainer, SCRYPT_KDF, secureEqual, type EncryptedContainer, type SplitContainer, toBase64, type VaultKdf, usernameDigest } from './crypto';
import { vaultStorage } from './storage';

type Profile = { version: 1; usernameHash: string; slots: ['a', 'b']; kdfSalt?: string; kdf?: VaultKdf };
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

async function createSplitVault(data: VaultData, password: string, existingSalt?: Uint8Array, kdf: VaultKdf = FAST_KDF) {
  const salt = existingSalt || crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, kdf);
  const entries = Object.fromEntries(await Promise.all(data.entries.map(async entry => [entry.id, await encryptBlob({ content: entry.content || '' }, key)] as const)));
  const indexData: VaultData = { ...data, version: 2, updatedAt: new Date().toISOString(), entries: data.entries.map(withoutContent) };
  const container: SplitContainer = { version: 2, kdf, salt: toBase64(salt), index: await encryptBlob(indexData, key), entries };
  return { container, key, data: indexData };
}

async function openSplitVault(container: SplitContainer, password: string) {
  const key = await deriveKey(password, fromBase64(container.salt), container.kdf);
  return { key, data: await openSplitVaultWithKey(container, key) };
}

async function openSplitVaultWithKey(container: SplitContainer, key: CryptoKey) {
  const data = await decryptBlob<VaultData>(container.index, key);
  if (!Array.isArray(data.entries)) throw new Error('INVALID_VAULT');
  return { ...data, entries: data.entries.map(withoutContent) };
}

async function rekeySplitVault(container: SplitContainer, oldKey: CryptoKey, newKey: CryptoKey, newSalt: Uint8Array, newKdf: VaultKdf = FAST_KDF) {
  const entries = Object.fromEntries(await Promise.all(Object.entries(container.entries).map(async ([id, encrypted]) => [id, await encryptBlob(await decryptBlob(encrypted, oldKey), newKey)] as const)));
  const index = await encryptBlob(await decryptBlob(container.index, oldKey), newKey);
  return { ...container, kdf: newKdf, salt: toBase64(newSalt), index, entries };
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

function normalizeWifiAddress(value: string) {
  const raw = value.trim().replace(/\/+$/, '');
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('INVALID_SYNC_ADDRESS');
  return url.origin;
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
    const native = Capacitor.isNativePlatform();
    // iOS Files greys out custom extensions when WKWebView cannot map the HTML
    // accept filter to a registered system content type. Native builds validate
    // the selected document below instead of filtering it in the picker.
    if (!native) input.accept = '.encryptme-backup,application/json';
    input.style.display = 'none';
    let settled = false;
    const finish = (file: File | null) => { if (settled) return; settled = true; input.remove(); resolve(file); };
    input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    if (!native) window.addEventListener('focus', () => window.setTimeout(() => finish(input.files?.[0] || null), 400), { once: true });
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
    platform: Capacitor.isNativePlatform() ? 'mobile' : 'web',
    async status() { return { initialized: await vaultStorage.exists(profilePath) }; },

    async initialize(input) {
      if (await vaultStorage.exists(profilePath)) throw new Error('ALREADY_INITIALIZED');
      const username = String(input.username || '').trim();
      const realPassword = String(input.realPassword || '');
      const decoyPassword = String(input.decoyPassword || '');
      if (username.length < 2 || realPassword.length < 10 || decoyPassword.length < 10 || realPassword === decoyPassword) throw new Error('INVALID_SETUP');
      const slots: ['a' | 'b', 'a' | 'b'] = crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? ['a', 'b'] : ['b', 'a'];
      const sharedSalt = crypto.getRandomValues(new Uint8Array(16));
      const [real, decoy] = await Promise.all([createSplitVault(blankVault(), realPassword, sharedSalt), createSplitVault(blankVault(true), decoyPassword, sharedSalt)]);
      await Promise.all([vaultStorage.write(vaultPath(slots[0]), real.container), vaultStorage.write(vaultPath(slots[1]), decoy.container)]);
      await vaultStorage.write<Profile>(profilePath, { version: 1, usernameHash: await usernameDigest(username), slots: ['a', 'b'], kdfSalt: toBase64(sharedSalt), kdf: FAST_KDF });
      return { ok: true };
    },

    async unlock(input) {
      const profile = await vaultStorage.read<Profile>(profilePath);
      const usernameOk = secureEqual(await usernameDigest(String(input.username || '')), profile.usernameHash);
      const password = String(input.password || '');
      const loadedSlots = (await Promise.all(profile.slots.map(async slot => {
        try { return { slot, stored: await vaultStorage.read<VaultContainer>(vaultPath(slot)) }; }
        catch { return null; }
      }))).filter((item): item is { slot: 'a' | 'b'; stored: VaultContainer } => Boolean(item));
      let sharedKey: CryptoKey | null = null;
      let sharedKdf: VaultKdf = profile.kdf || SCRYPT_KDF;
      let match: { slot: 'a' | 'b'; container: SplitContainer; key: CryptoKey; data: VaultData } | null = null;

      if (profile.kdfSalt) {
        sharedKdf = profile.kdf || loadedSlots.find(item => isSplitContainer(item.stored) && item.stored.salt === profile.kdfSalt)?.stored.kdf || SCRYPT_KDF;
        sharedKey = await deriveKey(password, fromBase64(profile.kdfSalt), sharedKdf);
        for (const { slot, stored } of loadedSlots) {
          if (!isSplitContainer(stored) || stored.salt !== profile.kdfSalt || stored.kdf !== sharedKdf) continue;
          try { match = { slot, container: stored, key: sharedKey, data: await openSplitVaultWithKey(stored, sharedKey) }; break; }
          catch { /* this password belongs to another slot */ }
        }
      }

      if (!match) {
        for (const { slot, stored } of loadedSlots) {
          if (isSplitContainer(stored) && stored.salt === profile.kdfSalt && stored.kdf === sharedKdf) continue;
          if (isSplitContainer(stored)) {
            try { match = { slot, container: stored, ...(await openSplitVault(stored, password)) }; break; }
            catch { continue; }
          }
          let legacy;
          try { legacy = await decryptContainer<VaultData>(stored, password); }
          catch { continue; }
          const migrated = await createSplitVault(legacy.data, password, legacy.salt);
          await vaultStorage.write(vaultPath(slot), migrated.container);
          match = { slot, container: migrated.container, key: migrated.key, data: migrated.data };
          break;
        }
      }

      if (!usernameOk) match = null;
      if (!match) { await new Promise(resolve => window.setTimeout(resolve, 350)); throw new Error('INVALID_CREDENTIALS'); }

      const targetSalt = fromBase64(profile.kdfSalt || match.container.salt);
      if (match.container.salt !== toBase64(targetSalt) || match.container.kdf !== FAST_KDF) {
        const targetKey = sharedKdf === FAST_KDF && sharedKey ? sharedKey : await deriveKey(password, targetSalt, FAST_KDF);
        const rekeyed = await rekeySplitVault(match.container, match.key, targetKey, targetSalt, FAST_KDF);
        await vaultStorage.write(vaultPath(match.slot), rekeyed);
        match = { ...match, key: targetKey, container: rekeyed };
      }
      if (profile.kdfSalt !== toBase64(targetSalt) || profile.kdf !== FAST_KDF) {
        profile.kdfSalt = toBase64(targetSalt); profile.kdf = FAST_KDF;
        await vaultStorage.write(profilePath, profile);
      }
      session = { id: crypto.randomUUID(), slot: match.slot, password, key: match.key, container: match.container, data: match.data };
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

    async startWifiSync() { throw new Error('SYNC_HOST_UNAVAILABLE'); },
    async stopWifiSync() { return { ok: true }; },
    async connectWifiSync(input) {
      const active = assertSession(input.sessionId);
      await saveChain;
      const address = normalizeWifiAddress(String(input.address || ''));
      const code = String(input.code || '').replace(/\D/g, '');
      if (code.length !== 12) throw new Error('INVALID_SYNC_CODE');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(`${address}/sync`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ code, container: active.container })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(result.error || 'SYNC_FAILED'));
        if (!isSplitContainer(result.container)) throw new Error('INVALID_SYNC_RESPONSE');
        if (result.container.kdf !== active.container.kdf || result.container.salt !== active.container.salt) throw new Error('SYNC_VAULT_MISMATCH');
        const data = await openSplitVaultWithKey(result.container, active.key);
        await vaultStorage.write(vaultPath(active.slot), result.container);
        active.container = result.container;
        active.data = data;
        return { data, stats: result.stats || { received: 0, sent: 0, deleted: 0 } };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error('SYNC_TIMEOUT');
        throw error;
      } finally { window.clearTimeout(timeout); }
    },
    onWifiSyncUpdated() { return () => {}; },

    onWindowAction(callback) { windowActions.add(callback); return () => windowActions.delete(callback); },
    async completeWindowAction() { return { ok: true }; }
  };
}
