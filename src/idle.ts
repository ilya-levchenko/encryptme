export const IDLE_TIMEOUT_MS = 60_000;

export const AUTO_LOCK_OPTIONS = [
  { value: 30_000, label: '30 секунд' },
  { value: 60_000, label: '1 минута' },
  { value: 120_000, label: '2 минуты' },
  { value: 300_000, label: '5 минут' }
] as const;

export function normalizeAutoLockMs(value: unknown) {
  return AUTO_LOCK_OPTIONS.some(option => option.value === value) ? value as number : IDLE_TIMEOUT_MS;
}

export function getAutoLockLabel(value: unknown) {
  const normalized = normalizeAutoLockMs(value);
  return AUTO_LOCK_OPTIONS.find(option => option.value === normalized)!.label;
}

export function hasBeenIdle(lastActivity: number, now = Date.now(), timeout = IDLE_TIMEOUT_MS) {
  return now - lastActivity >= timeout;
}
