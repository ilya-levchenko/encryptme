import type { Language } from './i18n';

export type ReminderRoute = 'journal' | 'donation';
export type ReminderPermission = 'prompt' | 'granted' | 'denied' | 'unsupported';
export type ReminderSettings = {
  journalEnabled: boolean;
  donationEnabled: boolean;
  lastForegroundAt: string;
  donationNextAt: string | null;
  locale: Language;
};
export type ReminderContent = {
  title: string;
  journalBodies: string[];
  donationBodies: string[];
};

export const JOURNAL_INTERVAL_MS = 72 * 60 * 60 * 1000;
export const JOURNAL_NOTIFICATION_ID = 16_001;
export const DONATION_NOTIFICATION_ID = 16_002;

const contentByLanguage: Record<Language, ReminderContent> = {
  en: {
    title: 'EncryptMe',
    journalBodies: [
      'Take a quiet minute for yourself today.',
      'A few honest words can make the day clearer.',
      'Pause for a moment and capture what matters.',
      'Your private space is ready when you are.',
      'How have the last few days felt?',
      'One small reflection is enough to begin.'
    ],
    donationBodies: [
      'If EncryptMe is useful to you, you can support its development with USDT on TRC20.',
      'Help keep EncryptMe independent with an optional USDT TRC20 donation.',
      'Want to support future EncryptMe updates? The donation details are in the app.',
      'Your optional support helps EncryptMe keep improving.',
      'Support independent development from the About section, if you would like to.',
      'You can help fund future EncryptMe work with a voluntary USDT TRC20 donation.'
    ]
  },
  ru: {
    title: 'EncryptMe',
    journalBodies: [
      'Найдите сегодня тихую минуту для себя.',
      'Несколько честных слов могут сделать день яснее.',
      'Остановитесь на минуту и сохраните то, что важно.',
      'Ваше личное пространство готово, когда будете готовы вы.',
      'Какими для вас были последние несколько дней?',
      'Чтобы начать, достаточно одной небольшой мысли.'
    ],
    donationBodies: [
      'Если EncryptMe вам полезен, поддержите разработку добровольным переводом USDT в сети TRC20.',
      'Помогите EncryptMe оставаться независимым с помощью необязательного доната USDT TRC20.',
      'Хотите поддержать будущие обновления EncryptMe? Реквизиты находятся в приложении.',
      'Добровольная поддержка помогает EncryptMe становиться лучше.',
      'При желании вы можете поддержать независимую разработку в разделе «О приложении».',
      'Поддержать будущую работу над EncryptMe можно добровольным переводом USDT TRC20.'
    ]
  }
};

export function defaultReminderSettings(now = new Date(), locale: Language = 'en'): ReminderSettings {
  return { journalEnabled: false, donationEnabled: false, lastForegroundAt: now.toISOString(), donationNextAt: null, locale };
}

function validString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 240;
}

export function validateReminderContent(value: unknown): ReminderContent {
  if (!value || typeof value !== 'object') throw new Error('INVALID_REMINDER_CONTENT');
  const content = value as Partial<ReminderContent>;
  const validList = (list: unknown): list is string[] => Array.isArray(list) && list.length >= 1 && list.length <= 12 && list.every(validString);
  if (!validString(content.title) || !validList(content.journalBodies) || !validList(content.donationBodies)) throw new Error('INVALID_REMINDER_CONTENT');
  return { title: content.title, journalBodies: [...content.journalBodies], donationBodies: [...content.donationBodies] };
}

export function reminderContent(language: Language): ReminderContent {
  const content = contentByLanguage[language] || contentByLanguage.en;
  return { title: content.title, journalBodies: [...content.journalBodies], donationBodies: [...content.donationBodies] };
}

export function nextJournalDue(foregroundAt: Date): Date {
  return new Date(foregroundAt.getTime() + JOURNAL_INTERVAL_MS);
}

export function addCalendarMonth(value: Date): Date {
  const result = new Date(value.getTime());
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

export function advanceMissedDue(due: Date, now: Date, intervalMs: number): Date {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('INVALID_REMINDER_INTERVAL');
  if (due.getTime() > now.getTime()) return new Date(due.getTime());
  const skipped = Math.floor((now.getTime() - due.getTime()) / intervalMs) + 1;
  return new Date(due.getTime() + skipped * intervalMs);
}

export function pickReminderBody(bodies: readonly string[], random = Math.random): string {
  if (!bodies.length) throw new Error('INVALID_REMINDER_CONTENT');
  return bodies[Math.min(bodies.length - 1, Math.floor(Math.max(0, Math.min(0.999999999, random())) * bodies.length))];
}
