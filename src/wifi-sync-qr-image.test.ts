import { describe, expect, it } from 'vitest';
import { createWifiSyncQrDataUrl } from './wifi-sync-qr-image';

describe('Wi-Fi pairing QR image', () => {
  it('renders the pairing payload as a local PNG data URL', async () => {
    const image = await createWifiSyncQrDataUrl('encryptme://wifi-sync?v=1&address=http%3A%2F%2F192.168.0.104%3A58450&code=123456789012');

    expect(image.startsWith('data:image/png;base64,')).toBe(true);
    expect(image.length).toBeGreaterThan(500);
  });
});
