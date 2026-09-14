import { describe, expect, it } from 'vitest';
import { findActiveEntryForDate } from './diary-date';

const entry = (id: string, date: string): DiaryEntry => ({
  id,
  date,
  title: id,
  content: '<p>Entry</p>',
  mood: 'none',
  createdAt: `${date}T12:00:00.000Z`,
  updatedAt: `${date}T12:00:00.000Z`
});

describe('diary date selection', () => {
  it('does not display an active entry under a different calendar day', () => {
    const entries = [entry('yesterday', '2026-09-13'), entry('today', '2026-09-14')];

    expect(findActiveEntryForDate(entries, 'yesterday', '2026-09-14')).toBeNull();
  });
});
