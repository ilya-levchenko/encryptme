import { describe, expect, test } from 'vitest';
import { reminderSettingsView } from './reminder-settings';

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

  test.each(['denied', 'unsupported'] as const)('%s disables unavailable reminders', permission => {
    expect(reminderSettingsView({ ...base, permission })).toMatchObject({ journalEnabled: false, donationEnabled: false, disabled: true, message: permission });
  });
});
