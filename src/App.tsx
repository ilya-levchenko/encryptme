import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bold, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock3, Italic,
  Download, List, ListOrdered, LockKeyhole, LogOut, Menu, MoonStar, Plus, Quote,
  Redo2, Search, Settings2, ShieldCheck, Sparkles, Strikethrough, Trash2, Underline, Undo2, Upload, X, EyeOff
} from 'lucide-react';
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay,
  isSameMonth, isToday, parseISO, startOfMonth, startOfWeek, subMonths
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { AUTO_LOCK_OPTIONS, getAutoLockLabel, hasBeenIdle, IDLE_TIMEOUT_MS, normalizeAutoLockMs } from './idle';

type Screen = 'loading' | 'setup' | 'login' | 'diary';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type LockReason = 'idle' | 'manual' | null;
const moods: { id: DiaryEntry['mood']; label: string; dot: string }[] = [
  { id: 'none', label: 'Без отметки', dot: 'transparent' }, { id: 'calm', label: 'Спокойно', dot: '#91a79a' },
  { id: 'good', label: 'Хорошо', dot: '#d7aa68' }, { id: 'bright', label: 'Вдохновение', dot: '#d48061' },
  { id: 'heavy', label: 'Тяжело', dot: '#7f83a6' }
];

const todayKey = () => format(new Date(), 'yyyy-MM-dd');
const uid = () => crypto.randomUUID();
const emptyData = (): VaultData => ({ version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), entries: [], settings: { autoLockMs: IDLE_TIMEOUT_MS } });
const plainText = (html = '') => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  doc.body.querySelectorAll('p,div,li,blockquote').forEach(node => node.append(' '));
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};
const countWords = (html = '') => {
  const text = plainText(html);
  if (!text) return 0;
  if ('Segmenter' in Intl) return [...new Intl.Segmenter('ru', { granularity: 'word' }).segment(text)].filter(part => part.isWordLike).length;
  return (text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || []).length;
};
const sanitize = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'DIV', 'SPAN']);
  [...doc.body.querySelectorAll('*')].forEach(el => {
    const isSpoiler = el.tagName === 'SPAN' && el.getAttribute('data-spoiler') === 'true';
    if (!allowed.has(el.tagName) || (el.tagName === 'SPAN' && !isSpoiler)) el.replaceWith(...Array.from(el.childNodes));
    else [...el.attributes].forEach(a => { if (!(isSpoiler && a.name === 'data-spoiler')) el.removeAttribute(a.name); });
  });
  return doc.body.innerHTML;
};

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [sessionId, setSessionId] = useState('');
  const [data, setData] = useState<VaultData>(emptyData);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [knownUsername, setKnownUsername] = useState('');
  const [lockReason, setLockReason] = useState<LockReason>(null);
  const [lastAutoLockMs, setLastAutoLockMs] = useState(IDLE_TIMEOUT_MS);
  const [importOpen, setImportOpen] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const latestData = useRef(data);
  const locking = useRef(false);

  useEffect(() => { window.encryptMe.status().then(s => setScreen(s.initialized ? 'login' : 'setup')).catch(() => setScreen('setup')); }, []);
  useEffect(() => { latestData.current = data; }, [data]);

  useEffect(() => {
    if (screen !== 'diary' || !sessionId || !activeId) return;
    const entry = latestData.current.entries.find(item => item.id === activeId);
    if (!entry || typeof entry.content === 'string') return;
    let cancelled = false;
    window.encryptMe.loadEntry({ sessionId, id: activeId }).then(({ content }) => {
      if (cancelled) return;
      setData(current => {
        const next = { ...current, entries: current.entries.map(item => item.id === activeId ? { ...item, content } : item) };
        latestData.current = next;
        return next;
      });
    }).catch(() => { if (!cancelled) setSaveState('error'); });
    return () => { cancelled = true; };
  }, [screen, sessionId, activeId]);

  const queueSave = useCallback((next: VaultData) => {
    latestData.current = next; setData(next); setSaveState('saving'); setLastAutoLockMs(normalizeAutoLockMs(next.settings?.autoLockMs));
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try { await window.encryptMe.save({ sessionId, data: latestData.current }); setSaveState('saved'); }
      catch { setSaveState('error'); }
    }, 550);
  }, [sessionId]);

  const unlock = (result: { sessionId: string; data: VaultData }, username: string) => {
    locking.current = false; setKnownUsername(username.trim()); setLockReason(null);
    setSessionId(result.sessionId); setData(result.data); setLastAutoLockMs(normalizeAutoLockMs(result.data.settings?.autoLockMs)); setSelectedDate(todayKey());
    const today = result.data.entries.filter(e => e.date === todayKey()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setActiveId(today[0]?.id || null); setSaveState('idle'); setScreen('diary');
  };

  const lock = useCallback(async (reason: Exclude<LockReason, null> = 'manual') => {
    if (locking.current) return;
    locking.current = true;
    window.clearTimeout(saveTimer.current);
    try { await window.encryptMe.save({ sessionId, data: latestData.current }); } catch { /* lock regardless */ }
    await window.encryptMe.lock(); setSessionId(''); setData(emptyData()); setActiveId(null); setLockReason(reason); setScreen('login');
  }, [sessionId]);

  const exportBackup = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    setSaveState('saving');
    await window.encryptMe.save({ sessionId, data: latestData.current });
    setSaveState('saved');
    return window.encryptMe.exportBackup({ sessionId });
  }, [sessionId]);

  const finishImport = (username: string) => {
    setKnownUsername(username.trim()); setLockReason(null); setSessionId(''); setData(emptyData()); setActiveId(null); setScreen('login'); setImportOpen(false);
  };

  useEffect(() => {
    if (screen !== 'diary') return;
    const autoLockMs = normalizeAutoLockMs(data.settings?.autoLockMs);
    let lastActivity = Date.now();
    const markActive = () => { lastActivity = Date.now(); };
    const checkIdle = () => { if (hasBeenIdle(lastActivity, Date.now(), autoLockMs)) void lock('idle'); };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart'];
    events.forEach(event => window.addEventListener(event, markActive, { passive: true }));
    document.addEventListener('visibilitychange', checkIdle);
    const interval = window.setInterval(checkIdle, 1000);
    return () => {
      events.forEach(event => window.removeEventListener(event, markActive));
      document.removeEventListener('visibilitychange', checkIdle);
      window.clearInterval(interval);
    };
  }, [screen, lock, data.settings?.autoLockMs]);

  useEffect(() => window.encryptMe.onWindowAction(async action => {
    try {
      if (screen === 'diary') await lock('manual');
      else await window.encryptMe.lock();
    } finally {
      await window.encryptMe.completeWindowAction(action).catch(() => {});
    }
  }), [screen, lock]);

  const importDialog = <AnimatePresence>{importOpen && <BackupImport onClose={() => setImportOpen(false)} onImported={finishImport} />}</AnimatePresence>;
  if (screen === 'loading') return <Loading />;
  if (screen === 'setup') return <><Setup onDone={() => setScreen('login')} onImport={() => setImportOpen(true)} />{importDialog}</>;
  if (screen === 'login') return <><Login onUnlock={unlock} initialUsername={knownUsername} lockReason={lockReason} idleTimeoutMs={lastAutoLockMs} onImport={() => setImportOpen(true)} />{importDialog}</>;
  return <><Diary data={data} selectedDate={selectedDate} activeId={activeId} saveState={saveState}
    onDate={date => { setSelectedDate(date); const entries = data.entries.filter(e => e.date === date).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); setActiveId(entries[0]?.id || null); }}
    onActive={setActiveId} onChange={queueSave} onLock={() => void lock('manual')} onExport={exportBackup}
    onImport={() => void lock('manual').then(() => setImportOpen(true))} />{importDialog}</>;
}

function Brand() { return <div className="brand"><span className="brand-mark"><MoonStar size={17} /></span><span>EncryptMe</span></div>; }

function Loading() {
  return <main className="auth-shell"><div className="ambient" /><motion.div className="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Brand /><span className="loader" /></motion.div></main>;
}

function Setup({ onDone, onImport }: { onDone: () => void; onImport: () => void }) {
  const [step, setStep] = useState(0); const [username, setUsername] = useState('');
  const [realPassword, setRealPassword] = useState(''); const [decoyPassword, setDecoyPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const valid = username.trim().length >= 2 && realPassword.length >= 10 && decoyPassword.length >= 10 && realPassword !== decoyPassword;
  const submit = async () => {
    if (!valid) return; setBusy(true); setError('');
      try { await window.encryptMe.initialize({ username, realPassword, decoyPassword }); onDone(); }
    catch { setError('Не удалось создать сейф. Проверьте данные и попробуйте снова.'); setBusy(false); }
  };
  return <main className="auth-shell"><div className="ambient" /><motion.section className="auth-panel setup-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
    <Brand /><div className="eyebrow">Первый запуск · {step + 1} из 2</div>
    {step === 0 ? <>
      <h1>Место только<br />для ваших мыслей.</h1>
      <p className="lead">EncryptMe хранит записи локально в зашифрованном сейфе. Облака, аккаунта и восстановления пароля нет.</p>
      <label>Имя профиля<input autoFocus value={username} onChange={e => setUsername(e.target.value)} placeholder="Например, Алекс" autoComplete="username" /></label>
      <button className="primary" disabled={username.trim().length < 2} onClick={() => setStep(1)}>Продолжить <ChevronRight size={18} /></button>
      <button className="restore-link" onClick={onImport}><Upload size={15}/> Восстановить резервную копию</button>
    </> : <>
      <h1>Два ключа.<br />Две правды.</h1>
      <p className="lead">Основной пароль открывает ваш дневник. Запасной — отдельный правдоподобный сейф без намёка на другое содержимое.</p>
      <div className="password-grid">
        <label>Основной пароль<input autoFocus type="password" value={realPassword} onChange={e => setRealPassword(e.target.value)} placeholder="Минимум 10 символов" autoComplete="new-password" /></label>
        <label>Запасной пароль<input type="password" value={decoyPassword} onChange={e => setDecoyPassword(e.target.value)} placeholder="Другой пароль" autoComplete="new-password" /></label>
      </div>
      {realPassword && realPassword.length < 10 && <div className="hint bad">Основной пароль слишком короткий</div>}
      {decoyPassword && realPassword === decoyPassword && <div className="hint bad">Пароли должны различаться</div>}
      <div className="secure-note"><ShieldCheck size={18} /><span>AES‑256‑GCM · ключ выводится через scrypt · данные остаются на устройстве</span></div>
      {error && <div className="form-error">{error}</div>}
      <div className="button-row"><button className="ghost" onClick={() => setStep(0)}>Назад</button><button className="primary" disabled={!valid || busy} onClick={submit}>{busy ? 'Создаём…' : 'Создать сейф'} <Sparkles size={17} /></button></div>
    </>}
  </motion.section><aside className="auth-quote"><span>«</span><p>Записывать — значит<br />оставаться наедине<br />с собой.</p></aside></main>;
}

function Login({ onUnlock, onImport, initialUsername = '', lockReason = null, idleTimeoutMs = IDLE_TIMEOUT_MS }: { onUnlock: (v: { sessionId: string; data: VaultData }, username: string) => void; onImport: () => void; initialUsername?: string; lockReason?: LockReason; idleTimeoutMs?: number }) {
  const [username, setUsername] = useState(initialUsername); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const passwordOnly = Boolean(lockReason && initialUsername);
  useEffect(() => { if (initialUsername) setUsername(initialUsername); }, [initialUsername]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!username || !password) return; setBusy(true); setError('');
    try { onUnlock(await window.encryptMe.unlock({ username, password }), username); }
    catch { setError('Имя или пароль не подошли'); setBusy(false); }
  };
  return <main className="auth-shell"><div className="ambient" /><motion.form className="auth-panel login-panel" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
    <Brand /><div className="eyebrow">{lockReason === 'idle' ? `Автоблокировка · ${getAutoLockLabel(idleTimeoutMs)}` : lockReason ? 'Сейф защищён' : 'Личный зашифрованный дневник'}</div><h1>{lockReason ? 'Сейф закрыт.' : 'С возвращением.'}</h1><p className="lead">{lockReason === 'idle' ? `Не было активности ${getAutoLockLabel(idleTimeoutMs)}. Введите пароль, чтобы продолжить.` : lockReason ? 'Введите пароль, чтобы вернуться к своим записям.' : 'Откройте свой сейф и продолжайте с того места, где остановились.'}</p>
    {passwordOnly ? <div className="locked-profile"><LockKeyhole size={19}/><div><span>Профиль</span><strong>{username}</strong></div></div> : <label>Имя профиля<input autoFocus value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="Ваше имя" /></label>}
    <label>Пароль<input autoFocus={passwordOnly} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••••••" /></label>
    <AnimatePresence>{error && <motion.div className="form-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }}>{error}</motion.div>}</AnimatePresence>
    <button className="primary wide" disabled={!username || !password || busy}>{busy ? 'Открываем…' : lockReason ? 'Разблокировать' : 'Открыть дневник'} <LockKeyhole size={17} /></button>
    <button className="restore-link" type="button" onClick={onImport}><Upload size={15}/> Импортировать зашифрованную копию</button>
    <div className="privacy"><ShieldCheck size={15} /> {lockReason ? 'Тип сейфа определяется только паролем' : 'Локально и зашифровано'}</div>
  </motion.form><aside className="auth-quote"><span>«</span><p>Тишина тоже<br />становится яснее,<br />когда её записать.</p></aside></main>;
}

type DiaryProps = {
  data: VaultData; selectedDate: string; activeId: string | null; saveState: SaveState;
  onDate(date: string): void; onActive(id: string): void; onChange(data: VaultData): void; onLock(): void;
  onExport(): Promise<{ canceled: boolean; fileName?: string; fallback?: boolean }>; onImport(): void;
};

function Diary({ data, selectedDate, activeId, saveState, onDate, onActive, onChange, onLock, onExport, onImport }: DiaryProps) {
  const [month, setMonth] = useState(parseISO(selectedDate)); const [search, setSearch] = useState(''); const [mobileNav, setMobileNav] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false);
  const [backupState, setBackupState] = useState<'idle' | 'exporting' | 'done' | 'fallback' | 'error'>('idle');
  const autoLockMs = normalizeAutoLockMs(data.settings?.autoLockMs);
  const dayEntries = useMemo(() => data.entries.filter(e => e.date === selectedDate).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), [data.entries, selectedDate]);
  const active = data.entries.find(e => e.id === activeId) || null;
  const filtered = useMemo(() => search.trim() ? data.entries.filter(e => `${e.title} ${plainText(e.content)}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) : [], [data.entries, search]);
  const create = () => {
    const now = new Date().toISOString(); const entry: DiaryEntry = { id: uid(), date: selectedDate, title: '', content: '<p><br></p>', mood: 'none', createdAt: now, updatedAt: now };
    onChange({ ...data, entries: [...data.entries, entry] }); onActive(entry.id); setMobileNav(false);
  };
  const update = (patch: Partial<DiaryEntry>) => {
    if (!active) return; onChange({ ...data, entries: data.entries.map(e => e.id === active.id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e) });
  };
  const remove = () => {
    if (!active || !confirm('Удалить эту запись? Это действие нельзя отменить.')) return;
    const rest = data.entries.filter(e => e.id !== active.id); onChange({ ...data, entries: rest }); onActive(rest.find(e => e.date === selectedDate)?.id || '');
  };
  const updateAutoLock = (value: number) => onChange({ ...data, settings: { ...data.settings, autoLockMs: normalizeAutoLockMs(value) } });
  const handleExport = async () => {
    setBackupState('exporting');
    try { const result = await onExport(); setBackupState(result.canceled ? 'idle' : result.fallback ? 'fallback' : 'done'); }
    catch { setBackupState('error'); }
  };
  return <main className="app-shell">
    <header className="mobile-header"><div className="mobile-header-actions"><button onClick={() => setMobileNav(true)} aria-label="Меню"><Menu /></button><button onClick={() => setSettingsOpen(true)} aria-label="Настройки"><Settings2 /></button></div><Brand /><SaveIndicator state={saveState} /></header>
    <AnimatePresence>{mobileNav && <motion.div className="mobile-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setMobileNav(false)} />}</AnimatePresence>
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <div className="sidebar-top"><Brand /><button className="icon-button mobile-close" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти в записях" /></div>
      {search ? <SearchResults entries={filtered} onPick={e => { onDate(e.date); onActive(e.id); setSearch(''); setMobileNav(false); }} /> : <>
        <Calendar month={month} selected={selectedDate} entries={data.entries} onMonth={setMonth} onDate={date => { onDate(date); setMobileNav(false); }} />
        <div className="sidebar-section-title"><span>Записи дня</span><span>{dayEntries.length}</span></div>
        <div className="entry-list">
          {dayEntries.map(entry => <EntryRow key={entry.id} entry={entry} active={entry.id === activeId} onClick={() => { onActive(entry.id); setMobileNav(false); }} />)}
          {!dayEntries.length && <div className="empty-day">В этот день пока тихо.</div>}
        </div>
      </>}
      <div className="sidebar-footer"><button onClick={onLock}><LogOut size={17} /> Закрыть сейф</button><button className="auto-lock-status" onClick={() => setSettingsOpen(true)} title="Настроить автоблокировку"><LockKeyhole size={13}/> {getAutoLockLabel(autoLockMs)}</button></div>
    </aside>
    <section className="workspace">
      <div className="workspace-bar"><div><CalendarDays size={16}/><span>{format(parseISO(selectedDate), 'd MMMM yyyy', { locale: ru })}</span></div><SaveIndicator state={saveState} /><button className="workspace-icon" onClick={() => setSettingsOpen(true)} title="Настройки" aria-label="Настройки"><Settings2 size={17}/></button><button className="workspace-icon lock-now" onClick={onLock} title="Заблокировать сейчас" aria-label="Заблокировать сейчас"><LockKeyhole size={17}/></button><button className="new-entry" onClick={create}><Plus size={17}/> Новая запись</button></div>
      <DateCarousel selected={selectedDate} entries={data.entries} onDate={onDate} />
      <MobileDayEntries entries={dayEntries} activeId={activeId} onPick={onActive} onCreate={create} />
      <AnimatePresence mode="wait">{active ? (typeof active.content === 'string' ? <Editor key={active.id} entry={active} onUpdate={update} onDelete={remove} /> : <EntryLoading key={`loading-${active.id}`} />) : <EmptyEditor date={selectedDate} onCreate={create} />}</AnimatePresence>
    </section>
    <AnimatePresence>{settingsOpen && <motion.div className="settings-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={() => setSettingsOpen(false)}>
      <motion.section className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" initial={{opacity:0,y:18,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:10,scale:.985}} transition={{duration:.2}} onMouseDown={e => e.stopPropagation()}>
        <div className="settings-heading"><div className="settings-symbol"><Settings2 size={19}/></div><div><span>Настройки защиты</span><h2 id="settings-title">Автоблокировка</h2></div><button onClick={() => setSettingsOpen(false)} aria-label="Закрыть настройки"><X size={18}/></button></div>
        <p>Сейф закроется, если в приложении не было клавиатуры, мыши или касаний.</p>
        <div className="lock-options" role="radiogroup" aria-label="Время автоблокировки">{AUTO_LOCK_OPTIONS.map(option => <button key={option.value} role="radio" aria-checked={autoLockMs === option.value} className={autoLockMs === option.value ? 'selected' : ''} onClick={() => updateAutoLock(option.value)}><span>{option.label}</span><i/></button>)}</div>
        <div className="settings-note"><ShieldCheck size={15}/><span>Настройка хранится внутри текущего зашифрованного сейфа.</span></div>
        <div className="settings-divider" />
        <div className="settings-subheading"><span>Резервная копия</span><p>Оба сейфа и профиль в одном файле, дополнительно защищённом текущим паролем.</p></div>
        <div className="backup-actions">
          <button onClick={handleExport} disabled={backupState === 'exporting'}><Download size={18}/><span><strong>{backupState === 'exporting' ? 'Шифруем…' : 'Экспортировать'}</strong><small>Сохранить файл .encryptme-backup</small></span></button>
          <button onClick={onImport}><Upload size={18}/><span><strong>Импортировать</strong><small>Заменить данные из копии</small></span></button>
        </div>
        {backupState === 'done' && <div className="backup-message success">Зашифрованная копия сохранена.</div>}
        {backupState === 'fallback' && <div className="backup-message warning">Выбранная папка недоступна. Копия сохранена в папке EncryptMe — она уже открыта.</div>}
        {backupState === 'error' && <div className="backup-message error">Не удалось записать файл. Проверьте свободное место и попробуйте другую папку.</div>}
        <button className="primary settings-done" onClick={() => setSettingsOpen(false)}>Готово</button>
      </motion.section>
    </motion.div>}</AnimatePresence>
  </main>;
}

function BackupImport({ onClose, onImported }: { onClose(): void; onImported(username: string): void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (username.trim().length < 2 || !password) return;
    setBusy(true); setError('');
    try {
      const result = await window.encryptMe.importBackup({ username, password });
      if (result.canceled) { setBusy(false); return; }
      onImported(username);
    } catch (reason) {
      const message = String(reason);
      if (message.includes('BACKUP_PROFILE_MISMATCH')) setError('Имя профиля не совпадает с резервной копией.');
      else if (message.includes('INVALID_BACKUP_PASSWORD')) setError('Пароль не подошёл или файл повреждён.');
      else if (message.includes('BACKUP_TOO_LARGE')) setError('Файл резервной копии слишком большой.');
      else setError('Не удалось импортировать файл. Проверьте, что это копия EncryptMe.');
      setBusy(false);
    }
  };
  return <motion.div className="settings-backdrop backup-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={() => !busy && onClose()}>
    <motion.form className="settings-sheet import-sheet" role="dialog" aria-modal="true" aria-labelledby="import-title" initial={{opacity:0,y:18,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:10,scale:.985}} transition={{duration:.2}} onMouseDown={event => event.stopPropagation()} onSubmit={submit}>
      <div className="settings-heading"><div className="settings-symbol"><Upload size={19}/></div><div><span>Зашифрованная копия</span><h2 id="import-title">Импорт данных</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Закрыть импорт"><X size={18}/></button></div>
      <p>Укажите имя профиля и пароль, которым была создана копия. Затем выберите файл <strong>.encryptme-backup</strong>.</p>
      <div className="import-warning"><ShieldCheck size={17}/><span>Импорт заменит оба текущих сейфа. Перед заменой EncryptMe автоматически сохранит локальную аварийную копию.</span></div>
      <label>Имя профиля<input autoFocus value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" placeholder="Имя из резервной копии" /></label>
      <label>Пароль резервной копии<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" placeholder="••••••••••••" /></label>
      <AnimatePresence>{error && <motion.div className="form-error" initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0}}>{error}</motion.div>}</AnimatePresence>
      <div className="button-row"><button className="ghost" type="button" onClick={onClose} disabled={busy}>Отмена</button><button className="primary" disabled={busy || username.trim().length < 2 || !password}>{busy ? 'Проверяем…' : 'Выбрать файл'} <Upload size={16}/></button></div>
    </motion.form>
  </motion.div>;
}

function Calendar({ month, selected, entries, onMonth, onDate }: { month: Date; selected: string; entries: DiaryEntry[]; onMonth(d: Date): void; onDate(s: string): void }) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const filled = new Set(entries.map(e => e.date));
  return <div className="calendar"><div className="calendar-head"><strong>{format(month, 'LLLL yyyy', { locale: ru })}</strong><div><button onClick={() => onMonth(subMonths(month,1))}><ChevronLeft size={17}/></button><button onClick={() => onMonth(addMonths(month,1))}><ChevronRight size={17}/></button></div></div>
    <div className="weekdays">{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => <span key={d}>{d}</span>)}</div>
    <div className="days">{days.map(day => { const key = format(day, 'yyyy-MM-dd'); return <button key={key} className={`${!isSameMonth(day,month)?'muted ':''}${isSameDay(day,parseISO(selected))?'selected ':''}${isToday(day)?'today':''}`} onClick={() => { onDate(key); if (!isSameMonth(day,month)) onMonth(day); }}><span>{format(day,'d')}</span>{filled.has(key) && <i/>}</button>; })}</div>
  </div>;
}

function DateCarousel({ selected, entries, onDate }: { selected: string; entries: DiaryEntry[]; onDate(date: string): void }) {
  const carouselRef = useRef<HTMLElement>(null);
  const selectedDay = parseISO(selected);
  const dates = Array.from({ length: 9 }, (_, index) => addDays(selectedDay, index - 4));
  const filled = new Set(entries.map(entry => entry.date));
  useEffect(() => { carouselRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }, [selected]);
  return <nav ref={carouselRef} className="date-carousel" aria-label="Выбор даты">
    {dates.map(day => {
      const key = format(day, 'yyyy-MM-dd');
      return <button key={key} className={key === selected ? 'selected' : ''} onClick={() => onDate(key)} aria-current={key === selected ? 'date' : undefined}>
        <span>{format(day, 'EEEEE', { locale: ru })}</span><strong>{format(day, 'd')}</strong>{filled.has(key) && <i/>}
      </button>;
    })}
  </nav>;
}

function MobileDayEntries({ entries, activeId, onPick, onCreate }: { entries: DiaryEntry[]; activeId: string | null; onPick(id: string): void; onCreate(): void }) {
  return <section className="mobile-day-entries" aria-label="Записи выбранного дня">
    <div className="mobile-day-label"><span>Записи дня</span><b>{entries.length}</b></div>
    <div className="mobile-entry-chips">
      {entries.map(entry => <button key={entry.id} className={entry.id === activeId ? 'active' : ''} onClick={() => onPick(entry.id)}>{entry.title || 'Без названия'}</button>)}
      <button className="mobile-add-entry" onClick={onCreate}><Plus size={14}/> Добавить</button>
    </div>
  </section>;
}

function EntryRow({ entry, active, onClick }: { entry: DiaryEntry; active: boolean; onClick(): void }) {
  const mood = moods.find(m => m.id === entry.mood)!;
  return <button className={`entry-row ${active ? 'active' : ''}`} onClick={onClick}><i style={{background:mood.dot}}/><div><strong>{entry.title || 'Без названия'}</strong><span>{plainText(entry.content).slice(0, 62) || 'Пустая запись'}</span></div><time>{format(parseISO(entry.updatedAt), 'HH:mm')}</time></button>;
}

function SearchResults({ entries, onPick }: { entries: DiaryEntry[]; onPick(e: DiaryEntry): void }) {
  return <div className="results"><div className="sidebar-section-title"><span>Результаты</span><span>{entries.length}</span></div>{entries.map(e => <button key={e.id} onClick={() => onPick(e)}><strong>{e.title || 'Без названия'}</strong><span>{format(parseISO(e.date),'d MMM yyyy',{locale:ru})} · {plainText(e.content).slice(0,55)}</span></button>)}{!entries.length && <div className="empty-day">Ничего не найдено.</div>}</div>;
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text = state === 'saving' ? 'Сохраняем…' : state === 'error' ? 'Ошибка сохранения' : state === 'saved' ? 'Сохранено' : 'Все изменения локально';
  return <div className={`save-state ${state}`}><span/>{text}</div>;
}

function EmptyEditor({ date, onCreate }: { date: string; onCreate(): void }) {
  return <motion.div className="empty-editor" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><div className="empty-orbit"><BookOpen size={28}/></div><span>{format(parseISO(date),'EEEE, d MMMM',{locale:ru})}</span><h2>У этого дня ещё нет истории.</h2><p>Начните с одной мысли — остальное придёт само.</p><button className="primary" onClick={onCreate}><Plus size={17}/> Создать запись</button></motion.div>;
}

function EntryLoading() {
  return <motion.div className="entry-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><span className="loader"/><p>Расшифровываем запись…</p></motion.div>;
}

function Editor({ entry, onUpdate, onDelete }: { entry: DiaryEntry; onUpdate(p: Partial<DiaryEntry>): void; onDelete(): void }) {
  const initialContent = entry.content || '<p><br></p>';
  const editorRef = useRef<HTMLDivElement>(null); const [moodOpen, setMoodOpen] = useState(false); const contentRef = useRef(initialContent);
  const historyRef = useRef<string[]>([initialContent]); const historyIndex = useRef(0);
  useEffect(() => {
    const html = entry.content || '<p><br></p>';
    if (editorRef.current && editorRef.current.innerHTML !== html) editorRef.current.innerHTML = html;
    contentRef.current = html; historyRef.current = [html]; historyIndex.current = 0;
  }, [entry.id]);
  const commit = () => {
    if (!editorRef.current) return;
    const html = sanitize(editorRef.current.innerHTML);
    if (html === contentRef.current) return;
    const history = historyRef.current.slice(0, historyIndex.current + 1);
    history.push(html);
    if (history.length > 100) history.shift();
    historyRef.current = history; historyIndex.current = history.length - 1; contentRef.current = html;
    onUpdate({ content: html });
  };
  const travelHistory = (direction: -1 | 1) => {
    const index = historyIndex.current + direction;
    if (index < 0 || index >= historyRef.current.length || !editorRef.current) return;
    const html = historyRef.current[index]; historyIndex.current = index; contentRef.current = html; editorRef.current.innerHTML = html; editorRef.current.focus(); onUpdate({ content: html });
  };
  const command = (cmd: string, value?: string) => { editorRef.current?.focus(); document.execCommand(cmd, false, value); commit(); };
  const toggleSpoiler = () => {
    const editor = editorRef.current; const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const origin = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
    const existing = origin?.closest<HTMLElement>('[data-spoiler="true"]');
    if (existing && editor.contains(existing)) {
      existing.replaceWith(...Array.from(existing.childNodes));
    } else {
      const fragment = range.extractContents();
      fragment.querySelectorAll?.('[data-spoiler="true"]').forEach(spoiler => spoiler.replaceWith(...Array.from(spoiler.childNodes)));
      const spoiler = document.createElement('span');
      spoiler.setAttribute('data-spoiler', 'true'); spoiler.append(fragment); range.insertNode(spoiler);
      range.setStartAfter(spoiler); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
    }
    commit();
  };
  const wordCount = countWords(entry.content);
  return <motion.article className="editor" initial={{opacity:0, y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:.22}}>
    <div className="editor-meta"><button className="mood-button" onClick={() => setMoodOpen(!moodOpen)}><i style={{background:moods.find(m=>m.id===entry.mood)?.dot}}/>{moods.find(m=>m.id===entry.mood)?.label}<ChevronRight size={14}/></button>
      <AnimatePresence>{moodOpen && <motion.div className="mood-menu" initial={{opacity:0,y:-5}} animate={{opacity:1,y:0}} exit={{opacity:0}}>{moods.map(m => <button key={m.id} onClick={() => {onUpdate({mood:m.id});setMoodOpen(false)}}><i style={{background:m.dot}}/>{m.label}</button>)}</motion.div>}</AnimatePresence>
      <span><Clock3 size={14}/> Изменено {format(parseISO(entry.updatedAt),'HH:mm')}</span></div>
    <input className="title-input" value={entry.title} onChange={e => onUpdate({title:e.target.value.slice(0,140)})} placeholder="Название записи" />
    <div className="toolbar" role="toolbar" aria-label="Форматирование">
      <Tool icon={<Undo2/>} label="Отменить" onClick={() => travelHistory(-1)}/><Tool icon={<Redo2/>} label="Повторить" onClick={() => travelHistory(1)}/><span className="tool-sep"/>
      <Tool icon={<Bold/>} label="Жирный" onClick={() => command('bold')}/><Tool icon={<Italic/>} label="Курсив" onClick={() => command('italic')}/><Tool icon={<Underline/>} label="Подчёркнутый" onClick={() => command('underline')}/><Tool icon={<Strikethrough/>} label="Зачёркнутый" onClick={() => command('strikeThrough')}/><span className="tool-sep"/>
      <Tool icon={<List/>} label="Список" onClick={() => command('insertUnorderedList')}/><Tool icon={<ListOrdered/>} label="Нумерованный список" onClick={() => command('insertOrderedList')}/><Tool icon={<Quote/>} label="Цитата" onClick={() => command('formatBlock','blockquote')}/><span className="tool-sep"/>
      <Tool icon={<EyeOff/>} label="Скрыть выделенное" onClick={toggleSpoiler}/>
    </div>
    <div ref={editorRef} className="content-editor" contentEditable suppressContentEditableWarning data-placeholder="Что хочется сохранить об этом дне?" onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); travelHistory(event.shiftKey ? 1 : -1); } }} onClick={e => { const spoiler = (e.target as HTMLElement).closest<HTMLElement>('[data-spoiler="true"]'); if (spoiler && e.currentTarget.contains(spoiler)) spoiler.classList.toggle('revealed'); }} onInput={commit} />
    <footer className="editor-footer"><span>{wordCount} {wordCount === 1 ? 'слово' : wordCount > 1 && wordCount < 5 ? 'слова' : 'слов'}</span><span>{plainText(entry.content).length} знаков</span><button className="delete-entry" onClick={onDelete} title="Удалить запись" aria-label="Удалить запись"><Trash2 size={18}/><span>Удалить запись</span></button></footer>
  </motion.article>;
}

function Tool({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick(): void }) { return <button className="tool" title={label} aria-label={label} onMouseDown={e=>e.preventDefault()} onClick={onClick}>{icon}</button>; }
