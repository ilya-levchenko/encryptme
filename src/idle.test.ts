import { describe, expect, it } from 'vitest';
import { AUTO_LOCK_OPTIONS, hasBeenIdle, IDLE_TIMEOUT_MS, normalizeAutoLockMs } from './idle';

describe('inactivity lock', () => {
  it('stays unlocked before one minute', () => {
    expect(hasBeenIdle(1_000, 1_000 + IDLE_TIMEOUT_MS - 1)).toBe(false);
  });

  it('locks exactly after one minute', () => {
    expect(hasBeenIdle(1_000, 1_000 + IDLE_TIMEOUT_MS)).toBe(true);
  });

  it('supports a deterministic timeout for testing', () => {
    expect(hasBeenIdle(100, 601, 500)).toBe(true);
  });

  it('offers the four supported lock intervals', () => {
    expect(AUTO_LOCK_OPTIONS.map(option => option.value)).toEqual([30_000, 60_000, 120_000, 300_000]);
  });

  it('falls back safely when an old vault has no setting', () => {
    expect(normalizeAutoLockMs(undefined)).toBe(IDLE_TIMEOUT_MS);
    expect(normalizeAutoLockMs(120_000)).toBe(120_000);
  });
});
