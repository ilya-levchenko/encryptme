import { describe, expect, test, vi } from 'vitest';
import { createReminderService } from './reminders.mjs';
import { readFile } from 'node:fs/promises';

const content = {
  title: 'EncryptMe',
  journalBodies: ['Take a quiet minute for yourself today.'],
  donationBodies: ['Support development with USDT TRC20.']
};

function setup(saved = null, supported = true) {
  let state = saved;
  const timers = [];
  const notifications = [];
  const startup = [];
  const service = createReminderService({
    readState: async () => state,
    writeState: async value => { state = structuredClone(value); },
    isSupported: () => supported,
    notify: value => { notifications.push(value); },
    setLoginStartup: value => startup.push(value),
    now: () => new Date('2026-09-12T10:00:00Z'),
    random: () => 0,
    setTimer: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimer: () => undefined
  });
  return { service, get state() { return state; }, timers, notifications, startup };
}

describe('desktop reminder service', () => {
  test('defaults to disabled and reports unsupported platforms', async () => {
    const { service } = setup(null, false);
    expect(await service.getSettings()).toMatchObject({ journalEnabled: false, donationEnabled: true, permission: 'unsupported' });
  });

  test('enables the monthly donation schedule by default on desktop', async () => {
    const fixture = setup();
    await fixture.service.start();
    expect(await fixture.service.getSettings()).toMatchObject({ donationEnabled: true, permission: 'granted' });
    expect(fixture.startup.at(-1)).toBe(true);
  });

  test('an unsupported desktop preserves reminder preferences without enabling startup', async () => {
    const fixture = setup(null, false);
    const result = await fixture.service.setSettings({ journalEnabled: false, donationEnabled: true, locale: 'en', content });
    expect(result).toMatchObject({ donationEnabled: true, permission: 'unsupported' });
    expect(fixture.startup.at(-1)).toBe(false);
  });

  test('enables both schedules and hidden startup', async () => {
    const fixture = setup();
    const result = await fixture.service.setSettings({ journalEnabled: true, donationEnabled: true, locale: 'en', content });
    expect(result).toMatchObject({ journalEnabled: true, donationEnabled: true, permission: 'granted' });
    expect(fixture.startup.at(-1)).toBe(true);
    expect(fixture.timers).toHaveLength(2);
    expect(Math.max(...fixture.timers.map(timer => timer.delay))).toBeLessThanOrEqual(2_147_000_000);
  });

  test('foreground resets only the journal due time', async () => {
    const fixture = setup();
    const enabled = await fixture.service.setSettings({ journalEnabled: true, donationEnabled: true, locale: 'en', content });
    const foreground = await fixture.service.markForeground({ locale: 'en', content });
    expect(foreground.lastForegroundAt).toBe('2026-09-12T10:00:00.000Z');
    expect(foreground.donationNextAt).toBe(enabled.donationNextAt);
  });

  test('a due timer emits one notification and routes its click', async () => {
    const routes = [];
    const fixture = setup({
      journalEnabled: true,
      donationEnabled: false,
      lastForegroundAt: '2026-09-01T10:00:00.000Z',
      journalNextAt: '2026-09-12T09:00:00.000Z',
      donationNextAt: null,
      locale: 'en',
      content
    });
    fixture.service.onAction(route => routes.push(route));
    await fixture.service.start();
    await fixture.timers[0].callback();
    expect(fixture.notifications).toHaveLength(1);
    expect(fixture.notifications[0]).toMatchObject({ title: 'EncryptMe', route: 'journal' });
    fixture.notifications[0].onClick();
    expect(routes).toEqual(['journal']);
  });

  test('rejects invalid message payloads', async () => {
    const { service } = setup();
    await expect(service.setSettings({ journalEnabled: true, donationEnabled: false, locale: 'en', content: { ...content, journalBodies: [] } })).rejects.toThrow('INVALID_REMINDER_CONTENT');
  });

  test('desktop bridge exposes reminder IPC without renderer Node access', async () => {
    const [main, preload] = await Promise.all([readFile(new URL('./main.mjs', import.meta.url), 'utf8'), readFile(new URL('./preload.cjs', import.meta.url), 'utf8')]);
    expect(main).toContain("ipcMain.handle('reminders:get'");
    expect(main).toContain("ipcMain.handle('reminders:set'");
    expect(main).toContain("ipcMain.handle('reminders:foreground'");
    expect(main).toContain("if (!mainWindow?.isVisible()) return reminderService.getSettings()");
    expect(preload).toContain("getReminderSettings: () => ipcRenderer.invoke('reminders:get')");
    expect(preload).toContain("ipcRenderer.on('app:reminder-action'");
  });
});
