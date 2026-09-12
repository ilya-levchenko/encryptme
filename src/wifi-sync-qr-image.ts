export async function createWifiSyncQrDataUrl(payload: string) {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 224,
    color: { dark: '#08111fff', light: '#f4f8ffff' }
  });
}
