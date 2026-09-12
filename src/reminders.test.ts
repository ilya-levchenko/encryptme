import { describe, expect, test } from 'vitest';
import { addCalendarMonth, advanceMissedDue, nextJournalDue, reminderContent, validateReminderContent } from './reminders';

describe('local reminders', () => {
  test('journal reminder is due 72 hours after foreground', () => {
    expect(nextJournalDue(new Date('2026-09-12T10:00:00Z')).toISOString()).toBe('2026-09-15T10:00:00.000Z');
  });

  test('calendar month clamps to the last valid day', () => {
    expect(addCalendarMonth(new Date('2028-01-31T19:00:00Z')).toISOString()).toBe('2028-02-29T19:00:00.000Z');
  });

  test('missed intervals advance without a burst', () => {
    expect(advanceMissedDue(new Date('2026-09-01T10:00:00Z'), new Date('2026-09-12T10:01:00Z'), 72 * 60 * 60 * 1000).toISOString()).toBe('2026-09-13T10:00:00.000Z');
  });

  test.each(['ru', 'en'] as const)('%s has private message variants', language => {
    const content = reminderContent(language);
    expect(content.journalBodies.length).toBeGreaterThanOrEqual(6);
    expect(content.donationBodies.length).toBeGreaterThanOrEqual(6);
    expect(validateReminderContent(content)).toEqual(content);
    expect(JSON.stringify(content)).not.toMatch(/TL7Qu|password|парол|запис[ьи]:/i);
  });

  test('rejects unsafe renderer-supplied content shapes', () => {
    expect(() => validateReminderContent({ title: '', journalBodies: ['Write'], donationBodies: ['Support'] })).toThrow('INVALID_REMINDER_CONTENT');
    expect(() => validateReminderContent({ title: 'EncryptMe', journalBodies: [], donationBodies: ['Support'] })).toThrow('INVALID_REMINDER_CONTENT');
    expect(() => validateReminderContent({ title: 'EncryptMe', journalBodies: ['x'.repeat(241)], donationBodies: ['Support'] })).toThrow('INVALID_REMINDER_CONTENT');
  });
});
