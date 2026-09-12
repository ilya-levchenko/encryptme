export const IDLE_TIMEOUT_MS = 60_000;

export const AUTO_LOCK_OPTIONS = [
  { value: 30_000 },
  { value: 60_000 },
  { value: 120_000 },
  { value: 300_000 }
] as const;

export function normalizeAutoLockMs(value: unknown) {
  return AUTO_LOCK_OPTIONS.some(option => option.value === value) ? value as number : IDLE_TIMEOUT_MS;
}

export function hasBeenIdle(lastActivity: number, now = Date.now(), timeout = IDLE_TIMEOUT_MS) {
  return now - lastActivity >= timeout;
}
