export type ReminderSettingsView = {
  journalEnabled: boolean;
  donationEnabled: boolean;
  disabled: boolean;
  message: 'denied' | 'unsupported' | null;
};

export function reminderSettingsView(result: ReminderSettingsResult): ReminderSettingsView {
  if (result.permission === 'denied' || result.permission === 'unsupported') {
    return { journalEnabled: false, donationEnabled: false, disabled: true, message: result.permission };
  }
  return { journalEnabled: result.journalEnabled, donationEnabled: result.donationEnabled, disabled: false, message: null };
}
