export type ReminderSettingsView = {
  journalEnabled: boolean;
  donationEnabled: boolean;
  disabled: boolean;
  message: 'denied' | 'unsupported' | null;
};

type ReminderPlatform = Window['encryptMe']['platform'];
type ReminderStartupInput = Pick<ReminderSettings, 'journalEnabled' | 'donationEnabled' | 'locale'>;

export function donationConsentRequired(platform: ReminderPlatform): boolean {
  return platform === 'ios';
}

export function reminderStartupUpdate(platform: ReminderPlatform, current: ReminderSettingsResult, locale: ReminderSettings['locale']): ReminderStartupInput | null {
  const donationEnabled = donationConsentRequired(platform) ? current.donationEnabled : true;
  const needsSchedule = current.permission === 'granted' && donationEnabled && !current.donationNextAt;
  const needsUpdate = current.permission === 'prompt' || current.locale !== locale || current.donationEnabled !== donationEnabled || needsSchedule;
  return needsUpdate ? { journalEnabled: current.journalEnabled, donationEnabled, locale } : null;
}

export function reminderSettingsView(result: ReminderSettingsResult): ReminderSettingsView {
  if (result.permission === 'unsupported') return { journalEnabled: result.journalEnabled, donationEnabled: result.donationEnabled, disabled: true, message: result.permission };
  return { journalEnabled: result.journalEnabled, donationEnabled: result.donationEnabled, disabled: false, message: result.permission === 'denied' ? 'denied' : null };
}
