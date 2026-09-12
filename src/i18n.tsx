import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { enUS, ru as ruDate } from 'date-fns/locale';

export type Language = 'ru' | 'en';
export type LanguagePreference = 'system' | Language;
type Params = Record<string, string | number>;

export const DONATION_ADDRESS = 'TL7QuKcQWFcHKM9U98y9e4h9CpducJQTjg';
export const APP_VERSION = '1.6.0';
export const DONATION_URL = `https://tronscan.org/#/address/${DONATION_ADDRESS}`;
export const SOURCE_URL = 'https://github.com/ilya-levchenko/encryptme';
export const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`;
export const AUTHOR_EMAIL = 'ilya_encryptme@proton.me';
export const LANGUAGE_STORAGE_KEY = 'encryptme:language';

const en = {
  loading: 'Loading…', setupEyebrow: 'First launch · {step} of 2', setupTitleOne: 'A place only\nfor your thoughts.',
  setupLeadOne: 'EncryptMe keeps entries locally in an encrypted vault. There is no cloud account or password recovery.',
  profileName: 'Profile name', profileExample: 'For example, Alex', continue: 'Continue', restoreBackup: 'Restore encrypted backup',
  setupTitleTwo: 'Two keys.\nTwo truths.', setupLeadTwo: 'Your main password opens the diary. The decoy password opens a separate believable vault with no hint of other content.',
  mainPassword: 'Main password', decoyPassword: 'Decoy password', minimumTen: 'At least 10 characters', differentPassword: 'A different password',
  mainPasswordShort: 'The main password is too short', passwordsDiffer: 'The passwords must be different', securitySummary: 'AES‑256‑GCM · PBKDF2‑SHA‑256 · data stays on this device',
  back: 'Back', creating: 'Creating…', createVault: 'Create vault', setupError: 'Could not create the vault. Check the details and try again.',
  setupQuote: 'Writing means\nbeing alone\nwith yourself.', switchAccountEyebrow: 'Switch account', autoLockEyebrow: 'Auto-lock · {duration}',
  vaultProtected: 'Vault protected', encryptedDiary: 'Private encrypted diary', signInAgain: 'Sign in again.', vaultLocked: 'Vault locked.', welcomeBack: 'Welcome back.',
  switchAccountLead: 'Enter a profile name and password, or import another profile’s encrypted backup.', idleLead: 'No activity for {duration}. Enter your password to continue.',
  unlockLead: 'Enter your password to return to your entries.', welcomeLead: 'Open your vault and continue where you left off.', profile: 'Profile', yourName: 'Your name',
  password: 'Password', invalidCredentials: 'The profile name or password is incorrect', opening: 'Opening…', signIn: 'Sign in', unlock: 'Unlock', openDiary: 'Open diary',
  switchAccount: 'Switch account', importEncryptedBackup: 'Import encrypted backup', vaultTypeByPassword: 'The password alone determines which vault opens', localEncrypted: 'Local and encrypted',
  loginQuote: 'Silence becomes\nclearer when you\nwrite it down.', menu: 'Menu', settings: 'Settings', searchEntries: 'Search entries', dayEntries: 'Entries today',
  quietDay: 'Nothing here yet.', closeVault: 'Close vault', configureAutoLock: 'Configure auto-lock', lockNow: 'Lock now', newEntry: 'New entry',
  deleteConfirm: 'Delete this entry? This action cannot be undone.', settingsKicker: 'Preferences', settingsTitle: 'Settings', closeSettings: 'Close settings',
  language: 'Language', languageDescription: 'Use your device language or choose one for EncryptMe.', languageSystem: 'System', languageRussian: 'Русский', languageEnglish: 'English',
  protection: 'Protection', autoLock: 'Auto-lock', autoLockDescription: 'The vault locks after no keyboard, pointer, or touch activity.', autoLockGroup: 'Auto-lock timeout',
  settingEncrypted: 'The protection setting is stored inside the current encrypted vault.', duration30s: '30 seconds', duration1m: '1 minute', duration2m: '2 minutes', duration5m: '5 minutes',
  notifications: 'Notifications', notificationsDescription: 'Optional reminders are scheduled only on this device. No diary data is sent anywhere.', journalReminder: 'Writing reminder', journalReminderDescription: 'Remind me every 3 days while I have not opened EncryptMe.', donationReminder: 'Monthly support reminder', donationReminderDescription: 'Once a month, show an optional invitation to support development with USDT TRC20.', notificationPermissionDenied: 'Notifications are blocked in system settings.', notificationsUnsupported: 'Local notifications are not supported on this device.', notificationScheduleError: 'Could not update reminders. Try again.', reminderOn: 'Enabled', reminderOff: 'Disabled',
  backup: 'Backup', backupDescription: 'Both vaults and the profile in one file, additionally protected by the current password.', encrypting: 'Encrypting…', export: 'Export',
  exportHint: 'Save an .encryptme-backup file', import: 'Import', importHint: 'Replace data from a backup', backupSaved: 'Encrypted backup saved.',
  backupFallback: 'The selected folder is unavailable. The backup was saved in EncryptMe and opened for you.', backupWriteError: 'Could not write the file. Check free space and try another folder.',
  wifiSync: 'Wi‑Fi sync', wifiDescription: 'Only encrypted data from the open vault is transferred. Both devices must be on the same network.',
  starting: 'Starting…', allowConnection: 'Allow connection', allowFiveMinutes: 'Open a one-time session for 5 minutes', waitingPhone: 'Waiting for a phone', stop: 'Stop',
  scanInPhone: 'Scan in EncryptMe on your phone', computerAddress: 'Computer address', localAddressMissing: 'Local address not found', otherAddresses: 'Other addresses: {addresses}',
  oneTimeCode: 'One-time code', openingCamera: 'Opening camera…', scanQr: 'Scan QR code', syncStartsAutomatically: 'Sync starts automatically', orManually: 'or enter manually',
  addressFromComputer: 'Address from computer', digitsOfTwelve: '{count} of 12 digits', syncing: 'Synchronizing…', synchronize: 'Synchronize', connectWindows: 'Connect to EncryptMe on Windows',
  syncCodeWrong: 'The connection code is incorrect.', syncVaultMismatch: 'Different vaults are open. Import the same backup on both devices first.',
  syncTimeout: 'The other device did not respond. Check the connection and permissions.', syncAddressInvalid: 'Enter the address shown on the computer.', syncQrInvalid: 'This is not an EncryptMe connection QR code.',
  cameraPermission: 'Allow EncryptMe to use the camera in system settings.', syncFailed: 'Synchronization failed.', syncAddressRequired: 'Enter the address shown on the computer.',
  syncCodeRequired: 'Enter all 12 digits of the one-time code.', syncDoneChanged: 'Done: {count} changes synchronized.', syncAlreadySame: 'Done: both devices already have the same data.',
  syncHostChanged: 'Phone connected: {count} changes synchronized.', syncHostSame: 'Phone connected: data is already identical.', syncExpired: 'The connection expired. Create a new code.',
  account: 'Account', accountDescription: 'Close this vault and return to the full sign-in screen or import another backup.', switchAccountHint: 'Sign out and choose how to sign in',
  about: 'About', developedBy: 'Developed by', contact: 'Contact', sourceCode: 'Source code', license: 'MIT License', version: 'Version {version}',
  supportDevelopment: 'Support development', donationNetwork: 'USDT · TRC20 / TRON', donationWarning: 'Send only USDT using the TRON (TRC20) network.', copyAddress: 'Copy address', copied: 'Address copied', viewTronscan: 'View in TRONSCAN',
  done: 'Done', encryptedCopy: 'Encrypted backup', importData: 'Import data', closeImport: 'Close import', importInstructions: 'Enter the profile name and password used to create the backup, then choose the .encryptme-backup file.',
  importWarning: 'Import replaces both current vaults. EncryptMe automatically saves a local recovery copy first.', backupProfileName: 'Name from the backup', backupPassword: 'Backup password',
  importProfileMismatch: 'The profile name does not match the backup.', importPasswordInvalid: 'The password is incorrect or the file is damaged.', backupTooLarge: 'The backup file is too large.',
  importFailed: 'Could not import the file. Make sure it is an EncryptMe backup.', cancel: 'Cancel', checking: 'Checking…', chooseFile: 'Choose file', chooseDate: 'Choose date', selectedDayEntries: 'Entries for selected day',
  untitled: 'Untitled', add: 'Add', emptyEntry: 'Empty entry', results: 'Results', nothingFound: 'Nothing found.', saveError: 'Error', saved: 'Saved',
  emptyDateTitle: 'This day has no story yet.', emptyDateLead: 'Start with one thought — the rest will follow.', createEntry: 'Create entry', decryptingEntry: 'Decrypting entry…',
  noMood: 'No mood', calm: 'Calm', good: 'Good', inspired: 'Inspired', heavy: 'Heavy', modifiedAt: 'Edited {time}', entryTitle: 'Entry title', formatting: 'Formatting',
  undo: 'Undo', redo: 'Redo', bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough', bulletList: 'Bulleted list', numberedList: 'Numbered list', quote: 'Quote', spoiler: 'Hide selection',
  editorPlaceholder: 'What would you like to remember about this day?', words: '{count} {unit}', wordOne: 'word', wordMany: 'words', characters: '{count} characters', deleteEntry: 'Delete entry',
  bluetoothSync: 'Nearby sync', bluetoothDescription: 'Synchronize the open encrypted vault directly with another phone over Bluetooth.', bluetoothAdvertise: 'Allow nearby connection', bluetoothFind: 'Find nearby phone',
  bluetoothSearching: 'Searching nearby…', bluetoothWaiting: 'Visible as EncryptMe {code}', bluetoothPermission: 'Allow access to nearby Bluetooth devices in system settings.', bluetoothOff: 'Turn on Bluetooth to synchronize.',
  bluetoothNoPeers: 'No nearby EncryptMe devices found.', bluetoothProgress: 'Transferring… {progress}%', bluetoothCancel: 'Cancel transfer', bluetoothDifferentVault: 'The phones use different vault copies. Import the same encrypted backup first.'
} as const;

export type TranslationKey = keyof typeof en;

const ru: Record<TranslationKey, string> = {
  loading: 'Загрузка…', setupEyebrow: 'Первый запуск · {step} из 2', setupTitleOne: 'Место только\nдля ваших мыслей.', setupLeadOne: 'EncryptMe хранит записи локально в зашифрованном сейфе. Облака, аккаунта и восстановления пароля нет.',
  profileName: 'Имя профиля', profileExample: 'Например, Алекс', continue: 'Продолжить', restoreBackup: 'Восстановить резервную копию', setupTitleTwo: 'Два ключа.\nДве правды.',
  setupLeadTwo: 'Основной пароль открывает ваш дневник. Запасной — отдельный правдоподобный сейф без намёка на другое содержимое.', mainPassword: 'Основной пароль', decoyPassword: 'Запасной пароль',
  minimumTen: 'Минимум 10 символов', differentPassword: 'Другой пароль', mainPasswordShort: 'Основной пароль слишком короткий', passwordsDiffer: 'Пароли должны различаться', securitySummary: 'AES‑256‑GCM · PBKDF2‑SHA‑256 · данные остаются на устройстве',
  back: 'Назад', creating: 'Создаём…', createVault: 'Создать сейф', setupError: 'Не удалось создать сейф. Проверьте данные и попробуйте снова.', setupQuote: 'Записывать — значит\nоставаться наедине\nс собой.',
  switchAccountEyebrow: 'Смена аккаунта', autoLockEyebrow: 'Автоблокировка · {duration}', vaultProtected: 'Сейф защищён', encryptedDiary: 'Личный зашифрованный дневник', signInAgain: 'Войти заново.', vaultLocked: 'Сейф закрыт.', welcomeBack: 'С возвращением.',
  switchAccountLead: 'Введите имя и пароль или импортируйте зашифрованную копию другого профиля.', idleLead: 'Не было активности {duration}. Введите пароль, чтобы продолжить.', unlockLead: 'Введите пароль, чтобы вернуться к своим записям.', welcomeLead: 'Откройте свой сейф и продолжайте с того места, где остановились.',
  profile: 'Профиль', yourName: 'Ваше имя', password: 'Пароль', invalidCredentials: 'Имя или пароль не подошли', opening: 'Открываем…', signIn: 'Войти', unlock: 'Разблокировать', openDiary: 'Открыть дневник', switchAccount: 'Сменить аккаунт', importEncryptedBackup: 'Импортировать зашифрованную копию', vaultTypeByPassword: 'Тип сейфа определяется только паролем', localEncrypted: 'Локально и зашифровано', loginQuote: 'Тишина тоже\nстановится яснее,\nкогда её записать.',
  menu: 'Меню', settings: 'Настройки', searchEntries: 'Найти в записях', dayEntries: 'Записи дня', quietDay: 'В этот день пока тихо.', closeVault: 'Закрыть сейф', configureAutoLock: 'Настроить автоблокировку', lockNow: 'Заблокировать сейчас', newEntry: 'Новая запись', deleteConfirm: 'Удалить эту запись? Это действие нельзя отменить.',
  settingsKicker: 'Параметры', settingsTitle: 'Настройки', closeSettings: 'Закрыть настройки', language: 'Язык', languageDescription: 'Используйте язык устройства или выберите язык EncryptMe.', languageSystem: 'Как в системе', languageRussian: 'Русский', languageEnglish: 'English', protection: 'Защита', autoLock: 'Автоблокировка', autoLockDescription: 'Сейф закроется, если в приложении не было клавиатуры, мыши или касаний.', autoLockGroup: 'Время автоблокировки', settingEncrypted: 'Настройка защиты хранится внутри текущего зашифрованного сейфа.',
  duration30s: '30 секунд', duration1m: '1 минута', duration2m: '2 минуты', duration5m: '5 минут', notifications: 'Уведомления', notificationsDescription: 'Необязательные напоминания создаются только на этом устройстве. Данные дневника никуда не отправляются.', journalReminder: 'Напоминать о дневнике', journalReminderDescription: 'Напоминать каждые 3 дня, пока EncryptMe не открывался.', donationReminder: 'Ежемесячное напоминание о поддержке', donationReminderDescription: 'Раз в месяц показывать необязательное предложение добровольной поддержки разработки через USDT TRC20.', notificationPermissionDenied: 'Уведомления заблокированы в настройках системы.', notificationsUnsupported: 'Локальные уведомления не поддерживаются на этом устройстве.', notificationScheduleError: 'Не удалось обновить напоминания. Попробуйте ещё раз.', reminderOn: 'Включено', reminderOff: 'Выключено', backup: 'Резервная копия', backupDescription: 'Оба сейфа и профиль в одном файле, дополнительно защищённом текущим паролем.', encrypting: 'Шифруем…', export: 'Экспортировать', exportHint: 'Сохранить файл .encryptme-backup', import: 'Импортировать', importHint: 'Заменить данные из копии', backupSaved: 'Зашифрованная копия сохранена.', backupFallback: 'Выбранная папка недоступна. Копия сохранена в папке EncryptMe — она уже открыта.', backupWriteError: 'Не удалось записать файл. Проверьте свободное место и попробуйте другую папку.',
  wifiSync: 'Синхронизация по Wi‑Fi', wifiDescription: 'Передаются только зашифрованные данные открытого сейфа. Оба устройства должны быть в одной сети.', starting: 'Запускаем…', allowConnection: 'Разрешить подключение', allowFiveMinutes: 'Открыть одноразовый сеанс на 5 минут', waitingPhone: 'Ожидание телефона', stop: 'Остановить', scanInPhone: 'Сканируйте в EncryptMe на телефоне', computerAddress: 'Адрес компьютера', localAddressMissing: 'Локальный адрес не найден', otherAddresses: 'Другие адреса: {addresses}', oneTimeCode: 'Одноразовый код', openingCamera: 'Открываем камеру…', scanQr: 'Сканировать QR-код', syncStartsAutomatically: 'Синхронизация начнётся автоматически', orManually: 'или вручную', addressFromComputer: 'Адрес с компьютера', digitsOfTwelve: '{count} из 12 цифр', syncing: 'Синхронизируем…', synchronize: 'Синхронизировать', connectWindows: 'Подключиться к EncryptMe на Windows',
  syncCodeWrong: 'Код подключения не подошёл.', syncVaultMismatch: 'На устройствах открыты разные сейфы. Сначала импортируйте одну резервную копию.', syncTimeout: 'Другое устройство не отвечает. Проверьте подключение и разрешения.', syncAddressInvalid: 'Введите адрес, показанный на компьютере.', syncQrInvalid: 'Это не QR-код подключения EncryptMe.', cameraPermission: 'Разрешите EncryptMe доступ к камере в системных настройках.', syncFailed: 'Не удалось выполнить синхронизацию.', syncAddressRequired: 'Введите адрес, показанный на компьютере.', syncCodeRequired: 'Введите все 12 цифр одноразового кода.', syncDoneChanged: 'Готово: синхронизировано изменений — {count}.', syncAlreadySame: 'Готово: на устройствах уже одинаковые данные.', syncHostChanged: 'Телефон подключён: синхронизировано изменений — {count}.', syncHostSame: 'Телефон подключён: данные уже одинаковые.', syncExpired: 'Время подключения истекло. Создайте новый код.',
  account: 'Аккаунт', accountDescription: 'Закрыть текущий сейф и вернуться к полному экрану входа или импорту другой копии.', switchAccountHint: 'Выйти и выбрать способ входа', about: 'О приложении', developedBy: 'Разработчик', contact: 'Связаться', sourceCode: 'Исходный код', license: 'Лицензия MIT', version: 'Версия {version}', supportDevelopment: 'Поддержать разработку', donationNetwork: 'USDT · TRC20 / TRON', donationWarning: 'Отправляйте только USDT в сети TRON (TRC20).', copyAddress: 'Копировать адрес', copied: 'Адрес скопирован', viewTronscan: 'Открыть в TRONSCAN', done: 'Готово',
  encryptedCopy: 'Зашифрованная копия', importData: 'Импорт данных', closeImport: 'Закрыть импорт', importInstructions: 'Укажите имя профиля и пароль, которым была создана копия. Затем выберите файл .encryptme-backup.', importWarning: 'Импорт заменит оба текущих сейфа. Перед заменой EncryptMe автоматически сохранит локальную аварийную копию.', backupProfileName: 'Имя из резервной копии', backupPassword: 'Пароль резервной копии', importProfileMismatch: 'Имя профиля не совпадает с резервной копией.', importPasswordInvalid: 'Пароль не подошёл или файл повреждён.', backupTooLarge: 'Файл резервной копии слишком большой.', importFailed: 'Не удалось импортировать файл. Проверьте, что это копия EncryptMe.', cancel: 'Отмена', checking: 'Проверяем…', chooseFile: 'Выбрать файл', chooseDate: 'Выбор даты', selectedDayEntries: 'Записи выбранного дня',
  untitled: 'Без названия', add: 'Добавить', emptyEntry: 'Пустая запись', results: 'Результаты', nothingFound: 'Ничего не найдено.', saveError: 'Ошибка', saved: 'Сохранено', emptyDateTitle: 'У этого дня ещё нет истории.', emptyDateLead: 'Начните с одной мысли — остальное придёт само.', createEntry: 'Создать запись', decryptingEntry: 'Расшифровываем запись…', noMood: 'Без отметки', calm: 'Спокойно', good: 'Хорошо', inspired: 'Вдохновение', heavy: 'Тяжело', modifiedAt: 'Изменено {time}', entryTitle: 'Название записи', formatting: 'Форматирование', undo: 'Отменить', redo: 'Повторить', bold: 'Жирный', italic: 'Курсив', underline: 'Подчёркнутый', strike: 'Зачёркнутый', bulletList: 'Список', numberedList: 'Нумерованный список', quote: 'Цитата', spoiler: 'Скрыть выделенное', editorPlaceholder: 'Что хочется сохранить об этом дне?', words: '{count} {unit}', wordOne: 'слово', wordMany: 'слов', characters: '{count} знаков', deleteEntry: 'Удалить запись',
  bluetoothSync: 'Синхронизация рядом', bluetoothDescription: 'Синхронизируйте открытый зашифрованный сейф напрямую с другим телефоном по Bluetooth.', bluetoothAdvertise: 'Разрешить подключение рядом', bluetoothFind: 'Найти телефон рядом', bluetoothSearching: 'Ищем устройства…', bluetoothWaiting: 'Устройство видно как EncryptMe {code}', bluetoothPermission: 'Разрешите доступ к Bluetooth-устройствам поблизости в системных настройках.', bluetoothOff: 'Включите Bluetooth для синхронизации.', bluetoothNoPeers: 'Устройства EncryptMe рядом не найдены.', bluetoothProgress: 'Передаём данные… {progress}%', bluetoothCancel: 'Отменить передачу', bluetoothDifferentVault: 'На телефонах разные копии сейфа. Сначала импортируйте одну зашифрованную резервную копию.'
};

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, ru };

export function resolveLanguage(preference: LanguagePreference, systemLanguages: readonly string[] = navigator.languages): Language {
  if (preference !== 'system') return preference;
  return (systemLanguages[0] || navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export function readLanguagePreference(storage: Pick<Storage, 'getItem'> = localStorage): LanguagePreference {
  const value = storage.getItem(LANGUAGE_STORAGE_KEY);
  return value === 'ru' || value === 'en' || value === 'system' ? value : 'system';
}
export function writeLanguagePreference(preference: LanguagePreference, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(LANGUAGE_STORAGE_KEY, preference);
}
export function languageKeys(language: Language) { return Object.keys(dictionaries[language]).sort() as TranslationKey[]; }
export function translate(language: Language, key: TranslationKey, params: Params = {}) {
  return Object.entries(params).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), dictionaries[language][key]);
}

export function localizedWordUnit(language: Language, count: number) {
  if (language === 'en') return count === 1 ? translate('en', 'wordOne') : translate('en', 'wordMany');
  const mod10 = count % 10; const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'слово';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'слова';
  return 'слов';
}

type I18nValue = {
  language: Language;
  preference: LanguagePreference;
  setPreference(preference: LanguagePreference): void;
  t(key: TranslationKey, params?: Params): string;
  dateLocale: typeof ruDate;
  autoLockLabel(milliseconds: unknown): string;
  wordUnit(count: number): string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setStoredPreference] = useState<LanguagePreference>(() => readLanguagePreference());
  const [systemLanguages, setSystemLanguages] = useState<readonly string[]>(() => navigator.languages);
  const language = resolveLanguage(preference, systemLanguages);
  useEffect(() => {
    const update = () => setSystemLanguages([...navigator.languages]);
    window.addEventListener('languagechange', update);
    return () => window.removeEventListener('languagechange', update);
  }, []);
  useEffect(() => { document.documentElement.lang = language; void window.encryptMe?.setLanguage(language).catch(() => undefined); }, [language]);
  const setPreference = useCallback((value: LanguagePreference) => { writeLanguagePreference(value); setStoredPreference(value); }, []);
  const t = useCallback((key: TranslationKey, params?: Params) => translate(language, key, params), [language]);
  const value = useMemo<I18nValue>(() => ({
    language, preference, setPreference, t, dateLocale: language === 'ru' ? ruDate : enUS,
    autoLockLabel(milliseconds) {
      const normalized = Number(milliseconds);
      const key: TranslationKey = normalized === 30_000 ? 'duration30s' : normalized === 120_000 ? 'duration2m' : normalized === 300_000 ? 'duration5m' : 'duration1m';
      return t(key);
    },
    wordUnit(count) {
      return localizedWordUnit(language, count);
    }
  }), [language, preference, setPreference, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('I18nProvider is missing');
  return value;
}
