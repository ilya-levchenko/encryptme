import { decryptBlob, encryptBlob, fromBase64, isSplitContainer, toBase64, type EncryptedBlob, type SplitContainer } from './crypto';

export const BLUETOOTH_SERVICE_UUID = '65f00001-5f96-4c2b-a1aa-7d5b9e178501';
export const BLUETOOTH_CHARACTERISTIC_UUID = '65f00002-5f96-4c2b-a1aa-7d5b9e178501';

type ProtectedEnvelope = { format: 'encryptme-ble'; version: 1; vaultSalt: string; digest: string; container: SplitContainer };
export type BluetoothFrame = { transferId: string; sequence: number; total: number; digest: string; body: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function sha256(data: Uint8Array) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data.slice().buffer as ArrayBuffer));
  return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildBluetoothEnvelope(container: SplitContainer, key: CryptoKey) {
  if (!isSplitContainer(container)) throw new Error('INVALID_SYNC_VAULT');
  const serialized = JSON.stringify(container);
  const value: ProtectedEnvelope = {
    format: 'encryptme-ble',
    version: 1,
    vaultSalt: container.salt,
    digest: await sha256(encoder.encode(serialized)),
    container
  };
  return JSON.stringify(await encryptBlob(value, key));
}

export async function openBluetoothEnvelope(encoded: string, key: CryptoKey, expectedSalt: string) {
  let protectedBlob: EncryptedBlob;
  let value: ProtectedEnvelope;
  try {
    protectedBlob = JSON.parse(encoded) as EncryptedBlob;
    value = await decryptBlob<ProtectedEnvelope>(protectedBlob, key);
  } catch {
    throw new Error('SYNC_VAULT_MISMATCH');
  }
  if (value.format !== 'encryptme-ble' || value.version !== 1 || value.vaultSalt !== expectedSalt || !isSplitContainer(value.container)) throw new Error('SYNC_VAULT_MISMATCH');
  const digest = await sha256(encoder.encode(JSON.stringify(value.container)));
  if (digest !== value.digest) throw new Error('BLE_CHECKSUM');
  return value.container;
}

export async function fragmentUtf8(payload: string, maximumBytes = 160, transferId: string = crypto.randomUUID()) {
  if (maximumBytes < 32) throw new Error('BLE_MTU_TOO_SMALL');
  const bytes = encoder.encode(payload);
  const digest = await sha256(bytes);
  const frames: BluetoothFrame[] = [];
  for (let offset = 0, sequence = 0; offset < bytes.length || (bytes.length === 0 && sequence === 0); offset += maximumBytes, sequence += 1) {
    frames.push({ transferId, sequence, total: Math.max(1, Math.ceil(bytes.length / maximumBytes)), digest, body: toBase64(bytes.slice(offset, offset + maximumBytes)) });
  }
  return frames;
}

export async function assembleUtf8Fragments(frames: BluetoothFrame[]) {
  if (!frames.length) throw new Error('BLE_FRAGMENT_MISSING');
  const ordered = [...frames].sort((a, b) => a.sequence - b.sequence);
  const first = ordered[0];
  if (ordered.length !== first.total || ordered.some((frame, index) => frame.transferId !== first.transferId || frame.total !== first.total || frame.digest !== first.digest || frame.sequence !== index)) throw new Error('BLE_FRAGMENT_MISSING');
  const chunks = ordered.map(frame => fromBase64(frame.body));
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (await sha256(bytes) !== first.digest) throw new Error('BLE_CHECKSUM');
  return decoder.decode(bytes);
}
