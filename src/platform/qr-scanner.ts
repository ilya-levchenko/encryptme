import { parseWifiSyncQrPayload, type WifiSyncQrConnection } from '../wifi-sync-qr';

export function parseWifiSyncQrScanResult(result: { ScanResult?: string }): WifiSyncQrConnection {
  if (!result.ScanResult?.trim()) throw new Error('QR_SCAN_CANCELLED');
  return parseWifiSyncQrPayload(result.ScanResult);
}

export function normalizeWifiSyncQrScanError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return /cancel/i.test(message) ? new Error('QR_SCAN_CANCELLED') : reason instanceof Error ? reason : new Error(message);
}

export async function scanWifiSyncQr(): Promise<WifiSyncQrConnection> {
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
      scanInstructions: 'Наведите камеру на QR-код в EncryptMe на компьютере',
      scanButton: false,
      cancelButtonAccessibilityLabel: 'Отменить сканирование',
      torchButtonOnAccessibilityLabel: 'Выключить фонарик',
      torchButtonOffAccessibilityLabel: 'Включить фонарик'
    });
    return parseWifiSyncQrScanResult(result);
  } catch (reason) {
    throw normalizeWifiSyncQrScanError(reason);
  }
}
