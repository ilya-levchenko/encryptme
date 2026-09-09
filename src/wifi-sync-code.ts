export const WIFI_SYNC_CODE_LENGTH = 12;

export function wifiSyncCodeDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, WIFI_SYNC_CODE_LENGTH);
}

export function formatWifiSyncCode(value: string) {
  return wifiSyncCodeDigits(value).replace(/(\d{4})(?=\d)/g, '$1-');
}

export function isCompleteWifiSyncCode(value: string) {
  return wifiSyncCodeDigits(value).length === WIFI_SYNC_CODE_LENGTH;
}
