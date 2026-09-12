import { formatWifiSyncCode } from './wifi-sync-code';

export type WifiSyncQrConnection = { address: string; code: string };

function requireWifiSyncCode(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 12) throw new Error('INVALID_SYNC_QR');
  return digits;
}

function normalizePrivateHostAddress(value: string) {
  try {
    const url = new URL(value.trim());
    const octets = url.hostname.split('.').map(Number);
    const privateHost = octets.length === 4 && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255)
      && (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
    if (url.protocol !== 'http:' || !url.port || url.username || url.password || !privateHost) throw new Error('INVALID_SYNC_QR');
    return url.origin;
  } catch {
    throw new Error('INVALID_SYNC_QR');
  }
}

export function createWifiSyncQrPayload(address: string, code: string) {
  const normalizedAddress = normalizePrivateHostAddress(address);
  const digits = requireWifiSyncCode(code);
  return `encryptme://wifi-sync?v=1&address=${encodeURIComponent(normalizedAddress)}&code=${digits}`;
}

export function parseWifiSyncQrPayload(payload: string): WifiSyncQrConnection {
  try {
    const url = new URL(payload.trim());
    if (url.protocol !== 'encryptme:' || url.hostname !== 'wifi-sync' || url.searchParams.get('v') !== '1') throw new Error('INVALID_SYNC_QR');
    const address = normalizePrivateHostAddress(url.searchParams.get('address') || '');
    const digits = requireWifiSyncCode(url.searchParams.get('code') || '');
    return { address, code: formatWifiSyncCode(digits) };
  } catch {
    throw new Error('INVALID_SYNC_QR');
  }
}
