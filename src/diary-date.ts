export function findActiveEntryForDate(entries: DiaryEntry[], activeId: string | null, date: string) {
  return entries.find(entry => entry.id === activeId && entry.date === date) || null;
}
