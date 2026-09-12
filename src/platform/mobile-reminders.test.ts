import { describe, expect, test, vi } from 'vitest';
import { reminderContent } from '../reminders';
import { createMobileReminderController } from './mobile-reminders';

function setup(permission: 'prompt' | 'granted' | 'denied' = 'granted', platform: 'ios' | 'android' = 'android') {
  const values = new Map<string, string>();
  const scheduled: Array<{ notifications: Array<Record<string, unknown>> }> = [];
  const canceled: number[][] = [];
  let actionListener: ((value: { notification: { extra?: { route?: string } } }) => void) | undefined;
  const notifications = {
    checkPermissions: vi.fn(async () => ({ display: permission })),
    requestPermissions: vi.fn(async () => ({ display: permission === 'prompt' ? 'granted' : permission })),
    schedule: vi.fn(async (value: { notifications: Array<Record<string, unknown>> }) => { scheduled.push(value); return { notifications: [] }; }),
    cancel: vi.fn(async (value: { notifications: Array<{ id: number }> }) => { canceled.push(value.notifications.map(item => item.id)); }),
    removeDeliveredNotificationsById: vi.fn(async () => undefined),
    createChannel: vi.fn(async () => undefined),
    addListener: vi.fn(async (_name: string, listener: typeof actionListener) => { actionListener = listener; return { remove: async () => undefined }; })
  };
  const controller = createMobileReminderController({
    notifications,
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    platform,
    now: () => new Date('2026-09-12T10:00:00Z'),
    random: () => 0
  });
  return { controller, notifications, scheduled, canceled, values, fire: (route: string) => actionListener?.({ notification: { extra: { route } } }) };
}

describe('mobile reminder controller', () => {
  test('defaults to disabled without asking permission', async () => {
    const { controller, notifications } = setup('prompt');
    expect(await controller.getSettings()).toMatchObject({ journalEnabled: false, donationEnabled: true, permission: 'prompt' });
    expect(notifications.requestPermissions).not.toHaveBeenCalled();
  });

  test('iOS donation consent defaults off', async () => {
    const { controller } = setup('prompt', 'ios');
    expect(await controller.getSettings()).toMatchObject({ donationEnabled: false, permission: 'prompt' });
  });

  test('first settings activation asks permission even with reminders off', async () => {
    const { controller, notifications } = setup('prompt', 'ios');
    await controller.setSettings({ journalEnabled: false, donationEnabled: false, locale: 'en', content: reminderContent('en') });
    expect(notifications.requestPermissions).toHaveBeenCalledOnce();
  });

  test('permission denial preserves requested preferences without scheduling', async () => {
    const { controller, scheduled } = setup('denied');
    expect(await controller.setSettings({ journalEnabled: true, donationEnabled: true, locale: 'en', content: reminderContent('en') })).toMatchObject({ journalEnabled: true, donationEnabled: true, donationNextAt: null, permission: 'denied' });
    expect(scheduled).toHaveLength(0);
  });

  test('permission denial persists disabled switches and the requested locale', async () => {
    const { controller, values } = setup('denied');
    await controller.setSettings({ journalEnabled: true, donationEnabled: true, locale: 'ru', content: reminderContent('ru') });
    expect(JSON.parse(values.get('encryptme:reminders') || '{}')).toMatchObject({ journalEnabled: true, donationEnabled: true, donationNextAt: null, locale: 'ru' });
  });

  test('foreground does not schedule while system permission is denied', async () => {
    const { controller, scheduled } = setup('denied');
    await controller.setSettings({ journalEnabled: true, donationEnabled: true, locale: 'en', content: reminderContent('en') });
    await controller.markForeground({ locale: 'en', content: reminderContent('en') });
    expect(scheduled).toHaveLength(0);
  });

  test('enables inexact journal and monthly donation schedules', async () => {
    const { controller, scheduled } = setup();
    const result = await controller.setSettings({ journalEnabled: true, donationEnabled: true, locale: 'en', content: reminderContent('en') });
    expect(result).toMatchObject({ journalEnabled: true, donationEnabled: true, permission: 'granted' });
    const all = scheduled.flatMap(item => item.notifications);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ id: 16001, isExactNotification: false, extra: { route: 'journal' }, schedule: { repeats: true, allowWhileIdle: true } });
    expect(all[1]).toMatchObject({ id: 16002, isExactNotification: false, extra: { route: 'donation' }, schedule: { every: 'month', allowWhileIdle: true } });
  });

  test('foreground resets journal without resetting monthly due date', async () => {
    const { controller } = setup();
    const enabled = await controller.setSettings({ journalEnabled: true, donationEnabled: true, locale: 'en', content: reminderContent('en') });
    const foreground = await controller.markForeground({ locale: 'en', content: reminderContent('en') });
    expect(foreground.lastForegroundAt).toBe('2026-09-12T10:00:00.000Z');
    expect(foreground.donationNextAt).toBe(enabled.donationNextAt);
  });

  test('queues a valid activation route until a listener registers', async () => {
    const { controller, fire } = setup();
    await controller.initialize();
    fire('donation');
    const routes: string[] = [];
    const remove = controller.onAction(route => routes.push(route));
    expect(routes).toEqual(['donation']);
    fire('unknown');
    expect(routes).toEqual(['donation']);
    remove();
  });
});
