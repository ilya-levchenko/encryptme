import { describe, expect, test } from 'vitest';
import { donationConsentRequired, reminderSettingsView, reminderStartupUpdate } from './reminder-settings';

const base: ReminderSettingsResult = {
  journalEnabled: true,
  donationEnabled: true,
  lastForegroundAt: '2026-09-12T10:00:00.000Z',
  donationNextAt: '2026-10-12T10:00:00.000Z',
  locale: 'en',
  permission: 'granted'
};

describe('reminder settings view state', () => {
  test('uses the bridge result when permission is granted', () => {
    expect(reminderSettingsView(base)).toMatchObject({ journalEnabled: true, donationEnabled: true, disabled: false, message: null });
  });

  test('permission denial preserves consent and still allows an in-app opt-out', () => {
    expect(reminderSettingsView({ ...base, permission: 'denied' })).toMatchObject({ journalEnabled: true, donationEnabled: true, disabled: false, message: 'denied' });
  });

  test('unsupported platforms disable reminder controls', () => {
    expect(reminderSettingsView({ ...base, permission: 'unsupported' })).toMatchObject({ journalEnabled: true, donationEnabled: true, disabled: true, message: 'unsupported' });
  });

  test('only iOS exposes explicit donation consent', () => {
    expect(donationConsentRequired('ios')).toBe(true);
    expect(donationConsentRequired('android')).toBe(false);
    expect(donationConsentRequired('desktop')).toBe(false);
  });

  test('startup enables donations outside iOS but preserves the iOS choice', () => {
    expect(reminderStartupUpdate('android', { ...base, donationEnabled: false, donationNextAt: null }, 'ru')).toMatchObject({ donationEnabled: true, locale: 'ru' });
    expect(reminderStartupUpdate('desktop', { ...base, donationEnabled: false, donationNextAt: null }, 'en')).toMatchObject({ donationEnabled: true });
    expect(reminderStartupUpdate('ios', { ...base, donationEnabled: false, donationNextAt: null }, 'en')).toBeNull();
  });

  test('first launch requests permission even with iOS donation consent off', () => {
    expect(reminderStartupUpdate('ios', { ...base, journalEnabled: false, donationEnabled: false, donationNextAt: null, permission: 'prompt' }, 'en')).toMatchObject({ journalEnabled: false, donationEnabled: false });
  });
});
