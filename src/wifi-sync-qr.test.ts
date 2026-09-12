import { describe, expect, it } from 'vitest';
import { createWifiSyncQrPayload, parseWifiSyncQrPayload } from './wifi-sync-qr';

describe('Wi-Fi sync QR payload', () => {
  it('round-trips the private host address and one-time code', () => {
    const payload = createWifiSyncQrPayload('http://192.168.0.104:58450', '1234-5678-9012');

    expect(payload).toBe('encryptme://wifi-sync?v=1&address=http%3A%2F%2F192.168.0.104%3A58450&code=123456789012');
    expect(parseWifiSyncQrPayload(payload)).toEqual({
      address: 'http://192.168.0.104:58450',
      code: '1234-5678-9012'
    });
  });

  it('rejects a QR code that points outside the private network', () => {
    const payload = 'encryptme://wifi-sync?v=1&address=https%3A%2F%2Fevil.example&code=123456789012';

    expect(() => parseWifiSyncQrPayload(payload)).toThrow('INVALID_SYNC_QR');
  });

  it('rejects malformed and incomplete pairing data', () => {
    expect(() => parseWifiSyncQrPayload('https://example.com')).toThrow('INVALID_SYNC_QR');
    expect(() => createWifiSyncQrPayload('http://192.168.0.104:58450', '1234')).toThrow('INVALID_SYNC_QR');
    expect(() => parseWifiSyncQrPayload('encryptme://wifi-sync?v=1&address=http%3A%2F%2F192.168.0.104%3A58450&code=1234567890123')).toThrow('INVALID_SYNC_QR');
  });
});
