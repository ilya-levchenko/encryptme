import { describe, expect, it } from 'vitest';
import { normalizeWifiSyncQrScanError, parseWifiSyncQrScanResult } from './qr-scanner';

describe('native Wi-Fi QR scan result', () => {
  it('returns validated connection details from the scanner result', () => {
    const result = parseWifiSyncQrScanResult({
      ScanResult: 'encryptme://wifi-sync?v=1&address=http%3A%2F%2F192.168.0.104%3A58450&code=123456789012'
    });

    expect(result).toEqual({ address: 'http://192.168.0.104:58450', code: '1234-5678-9012' });
  });

  it('treats an empty scanner result as cancellation', () => {
    expect(() => parseWifiSyncQrScanResult({ ScanResult: '' })).toThrow('QR_SCAN_CANCELLED');
  });

  it('normalizes the native iOS cancellation error', () => {
    expect(normalizeWifiSyncQrScanError(new Error('Couldn’t scan because the process was cancelled.')).message).toBe('QR_SCAN_CANCELLED');
  });
});
