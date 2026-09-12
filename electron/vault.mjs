import { randomBytes, scrypt as scryptCallback, pbkdf2 as pbkdf2Callback, createCipheriv, createDecipheriv, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

const scrypt = promisify(scryptCallback);
const pbkdf2 = promisify(pbkdf2Callback);
const LEGACY_VERSION = 1;
export const SPLIT_VERSION = 2;
export const SCRYPT_KDF = 'scrypt-32768-8-1';
export const FAST_KDF = 'pbkdf2-sha256-600000';

export const blankVault = (kind = 'real', locale = 'ru') => ({
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  settings: { autoLockMs: 60_000 },
  entries: kind === 'decoy' ? (locale === 'en' ? [
    { id: cryptoId(), date: today(), title: 'Plans for the week', content: '<p>Sort through photos, buy groceries, and choose a movie for the weekend.</p>', mood: 'calm', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: cryptoId(), date: shiftDay(-2), title: 'A short walk', content: '<p>It was quiet in the evening. I walked my usual route and picked up coffee on the way home.</p>', mood: 'good', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ] : [
    { id: cryptoId(), date: today(), title: 'Планы на неделю', content: '<p>Разобрать фотографии, купить продукты и выбрать фильм на выходные.</p>', mood: 'calm', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: cryptoId(), date: shiftDay(-2), title: 'Небольшая прогулка', content: '<p>Вечером было тихо. Прошёлся по привычному маршруту и взял кофе по дороге домой.</p>', mood: 'good', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ]) : []
});

function cryptoId() { return randomBytes(16).toString('hex'); }
function today() { return new Date().toISOString().slice(0, 10); }
function shiftDay(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

export function usernameDigest(username) {
  return createHash('sha256').update(username.trim().toLocaleLowerCase('ru')).digest('hex');
}

export async function deriveVaultKey(password, salt, kdf = SCRYPT_KDF) {
  if (kdf === FAST_KDF) return Buffer.from(await pbkdf2(password, salt, 600_000, 32, 'sha256'));
  if (kdf !== SCRYPT_KDF) throw new Error('UNSUPPORTED_KDF');
  return Buffer.from(await scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
}

function encryptWithKey(data, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(data), 'utf8')), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

function decryptWithKey(container, key) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(container.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(container.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(container.ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

export async function encryptVault(data, password, existingSalt) {
  const salt = existingSalt || randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveVaultKey(password, salt, SCRYPT_KDF);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify({ ...data, updatedAt: new Date().toISOString() }), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { version: LEGACY_VERSION, kdf: SCRYPT_KDF, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  } finally { key.fill(0); }
}

export async function decryptVault(container, password) {
  if (!container || container.version !== LEGACY_VERSION) throw new Error('UNSUPPORTED_VAULT');
  const salt = Buffer.from(container.salt, 'base64');
  const key = await deriveVaultKey(password, salt, SCRYPT_KDF);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(container.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(container.tag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(container.ciphertext, 'base64')), decipher.final()]);
    return { data: JSON.parse(plaintext.toString('utf8')), salt };
  } finally { key.fill(0); }
}

const withoutContent = ({ content: _content, ...entry }) => entry;

export function isSplitVault(container) {
  return Boolean(container) && container.version === SPLIT_VERSION && (container.kdf === SCRYPT_KDF || container.kdf === FAST_KDF)
    && typeof container.salt === 'string' && container.index && typeof container.entries === 'object';
}

export async function createSplitVault(data, password, existingSalt, kdf = FAST_KDF) {
  const salt = existingSalt || randomBytes(16);
  const key = await deriveVaultKey(password, salt, kdf);
  try {
    const now = new Date().toISOString();
    const entries = Object.fromEntries(data.entries.map(entry => [entry.id, encryptWithKey({ content: entry.content || '' }, key)]));
    const indexData = { ...data, version: SPLIT_VERSION, updatedAt: now, entries: data.entries.map(withoutContent) };
    return { container: { version: SPLIT_VERSION, kdf, salt: salt.toString('base64'), index: encryptWithKey(indexData, key), entries }, key: Buffer.from(key), data: indexData };
  } finally { key.fill(0); }
}

export async function openSplitVault(container, password) {
  if (!isSplitVault(container)) throw new Error('UNSUPPORTED_VAULT');
  const salt = Buffer.from(container.salt, 'base64');
  const key = await deriveVaultKey(password, salt, container.kdf);
  try {
    return { ...(openSplitVaultWithKey(container, key)), salt, key: Buffer.from(key) };
  } catch (error) {
    key.fill(0);
    throw error;
  }
}

export function openSplitVaultWithKey(container, key) {
  if (!isSplitVault(container)) throw new Error('UNSUPPORTED_VAULT');
  const data = decryptWithKey(container.index, key);
  if (!data || !Array.isArray(data.entries)) throw new Error('INVALID_VAULT');
  return { data: { ...data, entries: data.entries.map(withoutContent) } };
}

export function rekeySplitVault(container, oldKey, newKey, newSalt, newKdf = FAST_KDF) {
  if (!isSplitVault(container)) throw new Error('UNSUPPORTED_VAULT');
  const entries = Object.fromEntries(Object.entries(container.entries).map(([id, encrypted]) => [id, encryptWithKey(decryptWithKey(encrypted, oldKey), newKey)]));
  const index = encryptWithKey(decryptWithKey(container.index, oldKey), newKey);
  return { ...container, kdf: newKdf, salt: Buffer.from(newSalt).toString('base64'), index, entries };
}

export function loadSplitEntry(container, key, id) {
  const encrypted = container.entries?.[id];
  if (!encrypted) throw new Error('ENTRY_NOT_FOUND');
  const value = decryptWithKey(encrypted, key);
  return typeof value?.content === 'string' ? value.content : '';
}

export function updateSplitVault(container, key, data, previousData) {
  if (!isSplitVault(container)) throw new Error('UNSUPPORTED_VAULT');
  const previous = new Map((previousData?.entries || []).map(entry => [entry.id, entry]));
  const entries = {};
  for (const entry of data.entries) {
    const old = previous.get(entry.id);
    const hasContent = typeof entry.content === 'string';
    if (hasContent && (!old || entry.content !== old.content || !container.entries[entry.id])) {
      entries[entry.id] = encryptWithKey({ content: entry.content }, key);
    } else if (container.entries[entry.id]) {
      entries[entry.id] = container.entries[entry.id];
    } else {
      throw new Error('ENTRY_CONTENT_MISSING');
    }
  }
  const now = new Date().toISOString();
  const indexData = { ...data, version: SPLIT_VERSION, updatedAt: now, entries: data.entries.map(withoutContent) };
  return { container: { ...container, index: encryptWithKey(indexData, key), entries }, data: indexData };
}

export async function writeAtomic(file, payload) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomBytes(5).toString('hex')}.tmp`;
  await writeFile(temp, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
  await rename(temp, file);
}

export async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }

export async function safeCompareHex(a, b) {
  const left = Buffer.from(String(a), 'hex'); const right = Buffer.from(String(b), 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
