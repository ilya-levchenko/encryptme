const JOURNAL_INTERVAL_MS = 72 * 60 * 60 * 1000;
const MAX_TIMER_MS = 2_147_000_000;

const addCalendarMonth = value => {
  const result = new Date(value.getTime());
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
};

const validString = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 240;
export function validateReminderContent(value) {
  const validList = list => Array.isArray(list) && list.length >= 1 && list.length <= 12 && list.every(validString);
  if (!value || typeof value !== 'object' || !validString(value.title) || !validList(value.journalBodies) || !validList(value.donationBodies)) throw new Error('INVALID_REMINDER_CONTENT');
  return { title: value.title, journalBodies: [...value.journalBodies], donationBodies: [...value.donationBodies] };
}

const pick = (items, random) => items[Math.min(items.length - 1, Math.floor(Math.max(0, Math.min(.999999999, random())) * items.length))];
const defaults = now => ({ journalEnabled: false, donationEnabled: false, lastForegroundAt: now.toISOString(), journalNextAt: null, donationNextAt: null, locale: 'en', content: null });
const validDate = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const normalizeState = (value, now) => {
  if (!value || typeof value !== 'object' || typeof value.journalEnabled !== 'boolean' || typeof value.donationEnabled !== 'boolean'
    || !validDate(value.lastForegroundAt) || (value.journalNextAt !== null && !validDate(value.journalNextAt))
    || (value.donationNextAt !== null && !validDate(value.donationNextAt)) || !['ru', 'en'].includes(value.locale)) return defaults(now);
  try { return { ...value, content: value.content ? validateReminderContent(value.content) : null }; }
  catch { return defaults(now); }
};
const publicState = (state, permission) => ({
  journalEnabled: state.journalEnabled,
  donationEnabled: state.donationEnabled,
  lastForegroundAt: state.lastForegroundAt,
  donationNextAt: state.donationNextAt,
  locale: state.locale,
  permission
});

export function createReminderService({ readState, writeState, isSupported, notify, setLoginStartup, now = () => new Date(), random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const timers = new Map();
  const actionListeners = new Set();
  let state = null;

  async function load() {
    if (!state) state = normalizeState(await readState().catch(() => null), now());
    return state;
  }
  const permission = () => isSupported() ? 'granted' : 'unsupported';
  const clear = route => { const timer = timers.get(route); if (timer) clearTimer(timer); timers.delete(route); };
  const persist = async () => { await writeState(state); };

  function scheduleRoute(route) {
    clear(route);
    const dueText = route === 'journal' ? state.journalNextAt : state.donationNextAt;
    if (!(route === 'journal' ? state.journalEnabled : state.donationEnabled) || !dueText || !state.content) return;
    const delay = Math.max(0, Date.parse(dueText) - now().getTime());
    const timer = setTimer(() => handleTimer(route), Math.min(delay, MAX_TIMER_MS));
    timer?.unref?.();
    timers.set(route, timer);
  }

  async function handleTimer(route) {
    timers.delete(route);
    await load();
    const dueText = route === 'journal' ? state.journalNextAt : state.donationNextAt;
    if (!dueText || Date.parse(dueText) > now().getTime()) { scheduleRoute(route); return; }
    const content = state.content;
    if (!content) return;
    const bodies = route === 'journal' ? content.journalBodies : content.donationBodies;
    notify({ title: content.title, body: pick(bodies, random), route, onClick: () => actionListeners.forEach(listener => listener(route)) });
    if (route === 'journal') {
      let next = new Date(dueText);
      do { next = new Date(next.getTime() + JOURNAL_INTERVAL_MS); } while (next.getTime() <= now().getTime());
      state.journalNextAt = next.toISOString();
    } else {
      let next = new Date(dueText);
      do { next = addCalendarMonth(next); } while (next.getTime() <= now().getTime());
      state.donationNextAt = next.toISOString();
    }
    await persist();
    scheduleRoute(route);
  }

  async function start() {
    await load();
    setLoginStartup(Boolean(state.journalEnabled || state.donationEnabled));
    scheduleRoute('journal');
    scheduleRoute('donation');
  }

  async function getSettings() {
    await load();
    return publicState(state, permission());
  }

  async function setSettings(input) {
    await load();
    if (!['ru', 'en'].includes(input?.locale)) throw new Error('INVALID_REMINDER_LOCALE');
    const content = validateReminderContent(input.content);
    if (!isSupported()) {
      state = { ...state, journalEnabled: false, donationEnabled: false, locale: input.locale, content };
      await persist(); setLoginStartup(false); clear('journal'); clear('donation');
      return publicState(state, 'unsupported');
    }
    const currentNow = now();
    const wasJournalEnabled = state.journalEnabled;
    const wasDonationEnabled = state.donationEnabled;
    state = {
      ...state,
      journalEnabled: Boolean(input.journalEnabled),
      donationEnabled: Boolean(input.donationEnabled),
      journalNextAt: input.journalEnabled ? (wasJournalEnabled && state.journalNextAt ? state.journalNextAt : new Date(currentNow.getTime() + JOURNAL_INTERVAL_MS).toISOString()) : null,
      donationNextAt: input.donationEnabled ? (wasDonationEnabled && state.donationNextAt ? state.donationNextAt : addCalendarMonth(currentNow).toISOString()) : null,
      locale: input.locale,
      content
    };
    await persist();
    setLoginStartup(Boolean(state.journalEnabled || state.donationEnabled));
    scheduleRoute('journal'); scheduleRoute('donation');
    return publicState(state, 'granted');
  }

  async function markForeground(input) {
    await load();
    const content = validateReminderContent(input.content);
    const currentNow = now();
    state = {
      ...state,
      lastForegroundAt: currentNow.toISOString(),
      journalNextAt: state.journalEnabled ? new Date(currentNow.getTime() + JOURNAL_INTERVAL_MS).toISOString() : null,
      locale: input.locale === 'ru' ? 'ru' : 'en',
      content
    };
    await persist();
    scheduleRoute('journal');
    return publicState(state, permission());
  }

  function onAction(callback) { actionListeners.add(callback); return () => actionListeners.delete(callback); }
  function stop() { clear('journal'); clear('donation'); }

  return { start, stop, getSettings, setSettings, markForeground, onAction };
}
