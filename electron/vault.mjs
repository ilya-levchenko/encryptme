import { randomBytes, scrypt as scryptCallback, createCipheriv, createDecipheriv, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

const scrypt = promisify(scryptCallback);
const VERSION = 1;

export const blankVault = (kind = 'real') => ({
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  settings: { autoLockMs: 60_000 },
  entries: kind === 'decoy' ? [
    { id: cryptoId(), date: today(), title: 'Планы на неделю', content: '<p>Разобрать фотографии, купить продукты и выбрать фильм на выходные.</p>', mood: 'calm', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: cryptoId(), date: shiftDay(-2), title: 'Небольшая прогулка', content: '<p>Вечером было тихо. Прошёлся по привычному маршруту и взял кофе по дороге домой.</p>', mood: 'good', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ] : []
});

function cryptoId() { return randomBytes(16).toString('hex'); }
function today() { return new Date().toISOString().slice(0, 10); }
function shiftDay(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

export function usernameDigest(username) {
  return createHash('sha256').update(username.trim().toLocaleLowerCase('ru')).digest('hex');
}

async function derive(password, salt) {
  return Buffer.from(await scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
}

export async function encryptVault(data, password, existingSalt) {
  const salt = existingSalt || randomBytes(16);
  const iv = randomBytes(12);
  const key = await derive(password, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify({ ...data, updatedAt: new Date().toISOString() }), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { version: VERSION, kdf: 'scrypt-32768-8-1', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  } finally { key.fill(0); }
}

export async function decryptVault(container, password) {
  if (!container || container.version !== VERSION) throw new Error('UNSUPPORTED_VAULT');
  const salt = Buffer.from(container.salt, 'base64');
  const key = await derive(password, salt);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(container.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(container.tag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(container.ciphertext, 'base64')), decipher.final()]);
    return { data: JSON.parse(plaintext.toString('utf8')), salt };
  } finally { key.fill(0); }
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
