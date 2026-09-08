import { scrypt } from 'scrypt-js';

export type EncryptedContainer = {
  version: 1;
  kdf: 'scrypt-32768-8-1';
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(value: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array) {
  const raw = await scrypt(encoder.encode(password), salt, 32768, 8, 1, 32);
  try {
    return await crypto.subtle.importKey('raw', new Uint8Array(raw).buffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}

export async function encryptContainer<T extends object>(data: T, password: string, existingSalt?: Uint8Array): Promise<EncryptedContainer> {
  const salt = existingSalt ? new Uint8Array(existingSalt) : crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = encoder.encode(JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plaintext));
  const tagOffset = encrypted.length - 16;
  return {
    version: 1,
    kdf: 'scrypt-32768-8-1',
    salt: toBase64(salt),
    iv: toBase64(iv),
    tag: toBase64(encrypted.subarray(tagOffset)),
    ciphertext: toBase64(encrypted.subarray(0, tagOffset))
  };
}

export async function decryptContainer<T>(container: EncryptedContainer, password: string): Promise<{ data: T; salt: Uint8Array }> {
  if (!isEncryptedContainer(container)) throw new Error('UNSUPPORTED_VAULT');
  const salt = fromBase64(container.salt);
  const iv = fromBase64(container.iv);
  const ciphertext = fromBase64(container.ciphertext);
  const tag = fromBase64(container.tag);
  const encrypted = new Uint8Array(ciphertext.length + tag.length);
  encrypted.set(ciphertext);
  encrypted.set(tag, ciphertext.length);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, encrypted);
  return { data: JSON.parse(decoder.decode(plaintext)) as T, salt };
}

export async function usernameDigest(username: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(username.trim().toLocaleLowerCase('ru')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function isEncryptedContainer(value: unknown): value is EncryptedContainer {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EncryptedContainer>;
  return candidate.version === 1
    && candidate.kdf === 'scrypt-32768-8-1'
    && [candidate.salt, candidate.iv, candidate.tag, candidate.ciphertext].every(item => typeof item === 'string' && item.length > 0);
}
