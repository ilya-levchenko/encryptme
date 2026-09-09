import { describe, expect, it } from 'vitest';
import { formatWifiSyncCode, isCompleteWifiSyncCode, wifiSyncCodeDigits } from './wifi-sync-code';

describe('Wi-Fi sync code input', () => {
  it('formats a pasted numeric code for the iOS field', () => {
    expect(formatWifiSyncCode('1234 5678–9012')).toBe('1234-5678-9012');
  });

  it('limits input to twelve digits', () => {
    expect(wifiSyncCodeDigits('123456789012999')).toBe('123456789012');
  });

  it('recognizes a complete code independently of separators', () => {
    expect(isCompleteWifiSyncCode('1234-5678-9012')).toBe(true);
    expect(isCompleteWifiSyncCode('1234-5678-901')).toBe(false);
  });
});
