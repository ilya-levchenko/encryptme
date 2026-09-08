import { decryptVault, encryptVault, safeCompareHex, usernameDigest, writeAtomic } from './vault.mjs';
import { writeFile } from 'node:fs/promises';

export const BACKUP_FORMAT = 'encryptme-backup';
export const BACKUP_VERSION = 1;
const PAYLOAD_FORMAT = 'encryptme-backup-payload';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEncryptedContainer(value) {
  return isRecord(value)
    && value.version === 1
    && value.kdf === 'scrypt-32768-8-1'
    && ['salt', 'iv', 'tag', 'ciphertext'].every(key => typeof value[key] === 'string' && value[key].length > 0);
}

function isVaultContainer(value) {
  return isEncryptedContainer(value) || (isRecord(value)
    && value.version === 2
    && (value.kdf === 'scrypt-32768-8-1' || value.kdf === 'pbkdf2-sha256-600000')
    && typeof value.salt === 'string'
    && isRecord(value.index)
    && isRecord(value.entries));
}

function isProfile(value) {
  return isRecord(value)
    && value.version === 1
    && /^[a-f0-9]{64}$/i.test(String(value.usernameHash || ''))
    && Array.isArray(value.slots)
    && value.slots.length === 2
    && value.slots.includes('a')
    && value.slots.includes('b');
}

function validatePayload(payload) {
  if (!isRecord(payload)
    || payload.format !== PAYLOAD_FORMAT
    || payload.version !== BACKUP_VERSION
    || typeof payload.exportedAt !== 'string'
    || !isProfile(payload.profile)
    || !isRecord(payload.vaults)
    || !isVaultContainer(payload.vaults.a)
    || !isVaultContainer(payload.vaults.b)) {
    throw new Error('INVALID_BACKUP');
  }
  return payload;
}

export async function createEncryptedBackup({ profile, vaults }, password) {
  const payload = validatePayload({
    format: PAYLOAD_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    vaults
  });
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    encrypted: await encryptVault(payload, password)
  };
}

export async function openEncryptedBackup(document, password, username) {
  if (!isRecord(document)
    || document.format !== BACKUP_FORMAT
    || document.version !== BACKUP_VERSION
    || !isEncryptedContainer(document.encrypted)) {
    throw new Error('INVALID_BACKUP');
  }

  let payload;
  try {
    payload = validatePayload((await decryptVault(document.encrypted, password)).data);
  } catch (error) {
    if (error?.message === 'INVALID_BACKUP') throw error;
    throw new Error('INVALID_BACKUP_PASSWORD');
  }

  const usernameOk = await safeCompareHex(usernameDigest(String(username || '')), payload.profile.usernameHash);
  if (!usernameOk) throw new Error('BACKUP_PROFILE_MISMATCH');
  return payload;
}

const DIRECT_WRITE_RETRY_CODES = new Set(['EACCES', 'EBUSY', 'EEXIST', 'EPERM']);

export async function writeEncryptedBackupFile(destination, backup, io = {}) {
  const atomicWriter = io.atomicWriter || writeAtomic;
  const directWriter = io.directWriter || writeFile;
  try {
    await atomicWriter(destination, backup);
  } catch (error) {
    if (!DIRECT_WRITE_RETRY_CODES.has(error?.code)) throw error;
    await directWriter(destination, JSON.stringify(backup), { encoding: 'utf8', mode: 0o600 });
  }
}
