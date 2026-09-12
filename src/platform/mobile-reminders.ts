import {
  addCalendarMonth,
  defaultReminderSettings,
  DONATION_NOTIFICATION_ID,
  JOURNAL_NOTIFICATION_ID,
  nextJournalDue,
  pickReminderBody,
  validateReminderContent,
  type ReminderContent,
  type ReminderPermission,
  type ReminderRoute,
  type ReminderSettings
} from '../reminders';
import type { Language } from '../i18n';

const STORAGE_KEY = 'encryptme:reminders';
const OWNED_IDS = [JOURNAL_NOTIFICATION_ID, DONATION_NOTIFICATION_ID];

type PermissionResult = { display: string };
type NotificationAdapter = {
  checkPermissions(): Promise<PermissionResult>;
  requestPermissions(): Promise<PermissionResult>;
  schedule(value: { notifications: Array<Record<string, unknown>> }): Promise<unknown>;
  cancel(value: { notifications: Array<{ id: number }> }): Promise<void>;
  removeDeliveredNotificationsById?(value: { ids: number[] }): Promise<void>;
  createChannel?(value: Record<string, unknown>): Promise<void>;
  addListener(name: 'localNotificationActionPerformed', listener: (value: { notification: { extra?: { route?: string } } }) => void): Promise<{ remove(): Promise<void> }>;
};
type StorageAdapter = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type ControllerDependencies = {
  notifications: NotificationAdapter;
  storage: StorageAdapter;
  platform: 'ios' | 'android';
  now?: () => Date;
  random?: () => number;
};
type SettingsInput = { journalEnabled: boolean; donationEnabled: boolean; locale: Language; content: ReminderContent };
type ForegroundInput = { locale: Language; content: ReminderContent };
export type ReminderSettingsResult = ReminderSettings & { permission: ReminderPermission };

function permissionOf(value: string): ReminderPermission {
  if (value === 'granted') return 'granted';
  if (value === 'denied') return 'denied';
  return 'prompt';
}

function validSettings(value: unknown, now: Date): ReminderSettings {
  if (!value || typeof value !== 'object') return defaultReminderSettings(now);
  const candidate = value as Partial<ReminderSettings>;
  if (typeof candidate.journalEnabled !== 'boolean' || typeof candidate.donationEnabled !== 'boolean'
    || !candidate.lastForegroundAt || Number.isNaN(Date.parse(candidate.lastForegroundAt))
    || (candidate.donationNextAt !== null && (typeof candidate.donationNextAt !== 'string' || Number.isNaN(Date.parse(candidate.donationNextAt))))
    || (candidate.locale !== 'ru' && candidate.locale !== 'en')) return defaultReminderSettings(now);
  return candidate as ReminderSettings;
}

export function createMobileReminderController({ notifications, storage, platform, now = () => new Date(), random = Math.random }: ControllerDependencies) {
  const listeners = new Set<(route: ReminderRoute) => void>();
  let pendingRoute: ReminderRoute | null = null;
  let initialized = false;

  const read = () => {
    try { return validSettings(JSON.parse(storage.getItem(STORAGE_KEY) || 'null'), now()); }
    catch { return defaultReminderSettings(now()); }
  };
  const write = (settings: ReminderSettings) => storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  const permission = async () => permissionOf((await notifications.checkPermissions()).display);
  const cancel = async (...ids: number[]) => notifications.cancel({ notifications: ids.map(id => ({ id })) });

  async function initialize() {
    if (initialized) return;
    initialized = true;
    await notifications.addListener('localNotificationActionPerformed', value => {
      const route = value.notification.extra?.route;
      if (route !== 'journal' && route !== 'donation') return;
      if (listeners.size) listeners.forEach(listener => listener(route));
      else pendingRoute = route;
    });
  }

  async function createAndroidChannel() {
    if (platform !== 'android' || !notifications.createChannel) return;
    await notifications.createChannel({ id: 'encryptme_reminders', name: 'EncryptMe reminders', description: 'Private local reminders from EncryptMe', importance: 3, visibility: 0, vibration: true });
  }

  async function scheduleJournal(settings: ReminderSettings, content: ReminderContent) {
    await cancel(JOURNAL_NOTIFICATION_ID);
    if (!settings.journalEnabled) return;
    await notifications.schedule({ notifications: [{
      id: JOURNAL_NOTIFICATION_ID,
      title: content.title,
      body: pickReminderBody(content.journalBodies, random),
      channelId: 'encryptme_reminders',
      autoCancel: true,
      isExactNotification: false,
      extra: { route: 'journal' },
      schedule: { at: nextJournalDue(new Date(settings.lastForegroundAt)), repeats: true, allowWhileIdle: true }
    }] });
  }

  async function scheduleDonation(settings: ReminderSettings, content: ReminderContent) {
    await cancel(DONATION_NOTIFICATION_ID);
    if (!settings.donationEnabled) return;
    await notifications.schedule({ notifications: [{
      id: DONATION_NOTIFICATION_ID,
      title: content.title,
      body: pickReminderBody(content.donationBodies, random),
      channelId: 'encryptme_reminders',
      autoCancel: true,
      isExactNotification: false,
      extra: { route: 'donation' },
      schedule: { every: 'month', allowWhileIdle: true }
    }] });
  }

  async function getSettings(): Promise<ReminderSettingsResult> {
    await initialize();
    return { ...read(), permission: await permission() };
  }

  async function setSettings(input: SettingsInput): Promise<ReminderSettingsResult> {
    await initialize();
    if (input.locale !== 'ru' && input.locale !== 'en') throw new Error('INVALID_REMINDER_LOCALE');
    const content = validateReminderContent(input.content);
    const previous = read();
    let currentPermission = await permission();
    if ((input.journalEnabled || input.donationEnabled) && currentPermission !== 'granted') {
      currentPermission = permissionOf((await notifications.requestPermissions()).display);
      if (currentPermission !== 'granted') {
        const deniedSettings = { ...previous, journalEnabled: false, donationEnabled: false, donationNextAt: null, locale: input.locale };
        await cancel(...OWNED_IDS).catch(() => undefined);
        write(deniedSettings);
        return { ...deniedSettings, permission: currentPermission };
      }
    }
    const currentNow = now();
    const settings: ReminderSettings = {
      ...previous,
      journalEnabled: Boolean(input.journalEnabled),
      donationEnabled: Boolean(input.donationEnabled),
      donationNextAt: input.donationEnabled ? previous.donationNextAt || addCalendarMonth(currentNow).toISOString() : null,
      locale: input.locale
    };
    try {
      await createAndroidChannel();
      await cancel(...OWNED_IDS);
      await scheduleJournal(settings, content);
      await scheduleDonation(settings, content);
      write(settings);
      return { ...settings, permission: currentPermission };
    } catch (error) {
      await cancel(...OWNED_IDS).catch(() => undefined);
      write(previous);
      throw error;
    }
  }

  async function markForeground(input: ForegroundInput): Promise<ReminderSettingsResult> {
    await initialize();
    const content = validateReminderContent(input.content);
    const settings = read();
    settings.lastForegroundAt = now().toISOString();
    settings.locale = input.locale === 'ru' ? 'ru' : 'en';
    await notifications.removeDeliveredNotificationsById?.({ ids: OWNED_IDS }).catch(() => undefined);
    if (settings.journalEnabled) await scheduleJournal(settings, content);
    write(settings);
    return { ...settings, permission: await permission() };
  }

  function onAction(callback: (route: ReminderRoute) => void) {
    listeners.add(callback);
    if (pendingRoute) { const route = pendingRoute; pendingRoute = null; callback(route); }
    return () => listeners.delete(callback);
  }

  return { initialize, getSettings, setSettings, markForeground, onAction };
}
