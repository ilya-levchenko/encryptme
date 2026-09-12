import { parseWifiSyncQrPayload, type WifiSyncQrConnection } from '../wifi-sync-qr';

export function parseWifiSyncQrScanResult(result: { ScanResult?: string }): WifiSyncQrConnection {
  if (!result.ScanResult?.trim()) throw new Error('QR_SCAN_CANCELLED');
  return parseWifiSyncQrPayload(result.ScanResult);
}

export function normalizeWifiSyncQrScanError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return /cancel/i.test(message) ? new Error('QR_SCAN_CANCELLED') : reason instanceof Error ? reason : new Error(message);
}

export async function scanWifiSyncQr(locale: 'ru' | 'en' = 'en'): Promise<WifiSyncQrConnection> {
  const {
    CapacitorBarcodeScanner,
    CapacitorBarcodeScannerCameraDirection,
    CapacitorBarcodeScannerScanOrientation,
    CapacitorBarcodeScannerTypeHint
  } = await import('@capacitor/barcode-scanner');
  try {
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
      scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
      scanInstructions: locale === 'ru' ? 'Наведите камеру на QR-код в EncryptMe на компьютере' : 'Point the camera at the EncryptMe QR code on your computer',
      scanButton: false,
      cancelButtonAccessibilityLabel: locale === 'ru' ? 'Отменить сканирование' : 'Cancel scanning',
      torchButtonOnAccessibilityLabel: locale === 'ru' ? 'Выключить фонарик' : 'Turn flashlight off',
      torchButtonOffAccessibilityLabel: locale === 'ru' ? 'Включить фонарик' : 'Turn flashlight on'
    });
    return parseWifiSyncQrScanResult(result);
  } catch (reason) {
    throw normalizeWifiSyncQrScanError(reason);
  }
}
