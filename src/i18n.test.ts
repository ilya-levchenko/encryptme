import { describe, expect, it } from 'vitest';
import {
  DONATION_ADDRESS,
  localizedWordUnit,
  languageKeys,
  readLanguagePreference,
  resolveLanguage,
  translate,
  writeLanguagePreference
} from './i18n';

describe('interface localization', () => {
  it('uses Russian only when the system language is Russian', () => {
    expect(resolveLanguage('system', ['ru-RU'])).toBe('ru');
    expect(resolveLanguage('system', ['en-US', 'ru-RU'])).toBe('en');
    expect(resolveLanguage('system', ['de-DE'])).toBe('en');
  });

  it('manual language selection overrides the system language', () => {
    expect(resolveLanguage('en', ['ru-RU'])).toBe('en');
    expect(resolveLanguage('ru', ['en-US'])).toBe('ru');
  });

  it('persists only supported language preferences', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    };
    writeLanguagePreference('en', storage);
    expect(readLanguagePreference(storage)).toBe('en');
    values.set('encryptme:language', 'broken');
    expect(readLanguagePreference(storage)).toBe('system');
  });

  it('has an English and Russian value for every public copy key', () => {
    expect(languageKeys('ru')).toEqual(languageKeys('en'));
    for (const key of languageKeys('en')) {
      expect(translate('en', key).trim()).not.toBe('');
      expect(translate('ru', key).trim()).not.toBe('');
    }
  });

  it('interpolates values without modifying unrelated copy', () => {
    expect(translate('en', 'syncDoneChanged', { count: 3 })).toBe('Done: 3 changes synchronized.');
    expect(translate('ru', 'syncDoneChanged', { count: 3 })).toBe('Готово: синхронизировано изменений — 3.');
  });

  it('keeps the configured TRON address exact', () => {
    expect(DONATION_ADDRESS).toBe('TL7QuKcQWFcHKM9U98y9e4h9CpducJQTjg');
    expect(DONATION_ADDRESS).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  });

  it('explains that reminders are local and donation prompts are optional', () => {
    expect(translate('en', 'notificationsDescription')).toContain('only on this device');
    expect(translate('ru', 'notificationsDescription')).toContain('только на этом устройстве');
    expect(translate('en', 'donationReminderDescription')).toContain('optional');
    expect(translate('ru', 'donationReminderDescription')).toContain('добровольной');
  });

  it('explains the fixed donation-reminder policy outside iOS', () => {
    expect(translate('en', 'donationReminderAlwaysOn').toLowerCase()).toContain('enabled by default');
    expect(translate('ru', 'donationReminderAlwaysOn')).toContain('включено по умолчанию');
  });

  it('uses correct English and Russian word forms', () => {
    expect([1, 2, 5, 11, 21].map(count => localizedWordUnit('ru', count))).toEqual(['слово', 'слова', 'слов', 'слов', 'слово']);
    expect([1, 2].map(count => localizedWordUnit('en', count))).toEqual(['word', 'words']);
  });
});
