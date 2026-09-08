import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, cp, mkdir, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { blankVault, decryptVault, encryptVault, readJson, safeCompareHex, usernameDigest, writeAtomic } from './vault.mjs';
import { createEncryptedBackup, openEncryptedBackup, writeEncryptedBackupFile } from './backup.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devUrl = process.env.VITE_DEV_SERVER_URL || (app.isPackaged ? null : 'http://localhost:5173');
let mainWindow;
let tray;
let session = null;
let saveChain = Promise.resolve();
let isQuitting = false;
let pendingWindowAction = null;
let windowActionTimer = null;
let trayHintShown = false;
const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

const storeDir = () => path.join(app.getPath('userData'), 'vault');
const legacyStoreDirs = () => {
  const appData = app.getPath('appData');
  return [
    path.join(appData, 'endiar', 'vault'),
    path.join(appData, 'Endiar', 'vault')
  ];
};
const configFile = () => path.join(storeDir(), 'profile.json');
const vaultFile = (slot, ext = 'encryptme') => path.join(storeDir(), `vault-${slot}.${ext}`);
const readVault = async (slot) => {
  const candidates = ['encryptme', 'endiar'];
  for (const ext of candidates) {
    try {
      const path = vaultFile(slot, ext);
      const container = await readJson(path);
      return { ext, container };
    } catch {}
  }
  return null;
};

async function exists(file) { try { await access(file); return true; } catch { return false; } }
function assertObject(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_DATA'); }
function clearSession() {
  if (session) session.password = '\0'.repeat(session.password.length);
  session = null;
}

function showWindow() {
  if (pendingWindowAction) return;
  if (!mainWindow || mainWindow.isDestroyed()) { void createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function completeWindowAction(action) {
  if (action !== pendingWindowAction) return { ok: false };
  if (windowActionTimer) clearTimeout(windowActionTimer);
  windowActionTimer = null;
  pendingWindowAction = null;
  await saveChain.catch(() => {});
  clearSession();
  if (action === 'quit') {
    isQuitting = true;
    app.quit();
  } else {
    mainWindow?.hide();
    if (tray && !trayHintShown) {
      tray.displayBalloon({ title: 'EncryptMe заблокирован', content: 'Приложение продолжает работать в системном трее.', respectQuietTime: true });
      trayHintShown = true;
    }
  }
  return { ok: true };
}

function requestWindowAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (action === 'quit') { isQuitting = true; app.quit(); }
    return;
  }
  if (pendingWindowAction === action || (pendingWindowAction === 'quit' && action === 'hide')) return;
  pendingWindowAction = action;
  if (windowActionTimer) clearTimeout(windowActionTimer);
  mainWindow.webContents.send('app:lock-before-window-action', action);
  windowActionTimer = setTimeout(() => { void completeWindowAction(action); }, 3000);
  if (action === 'hide') mainWindow.hide();
}

function createTray() {
  const iconPath = path.join(app.getAppPath(), 'build', 'icon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('EncryptMe — зашифрованный дневник');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть EncryptMe', click: showWindow },
    { label: 'Заблокировать и скрыть', click: () => requestWindowAction('hide') },
    { type: 'separator' },
    { label: 'Выход', click: () => requestWindowAction('quit') }
  ]));
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}
async function migrateLegacyStoreDir() {
  const currentDir = storeDir();
  if (await exists(currentDir)) return;
  for (const legacyDir of legacyStoreDirs()) {
    if (await exists(legacyDir)) {
      await cp(legacyDir, currentDir, { recursive: true });
      return;
    }
  }
  await mkdir(currentDir, { recursive: true });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 680,
    backgroundColor: '#08111f', titleBarStyle: 'hiddenInset', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('close', event => {
    if (isQuitting) return;
    event.preventDefault();
    requestWindowAction('hide');
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  if (devUrl) await mainWindow.loadURL(devUrl); else await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('vault:status', async () => ({ initialized: await exists(configFile()) }));

ipcMain.handle('vault:initialize', async (_event, input) => {
  if (await exists(configFile())) throw new Error('ALREADY_INITIALIZED');
  const username = String(input?.username || '').trim();
  const realPassword = String(input?.realPassword || '');
  const decoyPassword = String(input?.decoyPassword || '');
  if (username.length < 2 || realPassword.length < 10 || decoyPassword.length < 10 || realPassword === decoyPassword) throw new Error('INVALID_SETUP');
  const slots = randomBytes(1)[0] % 2 ? ['a', 'b'] : ['b', 'a'];
  const [real, decoy] = await Promise.all([encryptVault(blankVault('real'), realPassword), encryptVault(blankVault('decoy'), decoyPassword)]);
  await Promise.all([writeAtomic(vaultFile(slots[0]), real), writeAtomic(vaultFile(slots[1]), decoy)]);
  await writeAtomic(configFile(), { version: 1, usernameHash: usernameDigest(username), slots: ['a', 'b'] });
  return { ok: true };
});

ipcMain.handle('vault:unlock', async (_event, input) => {
  const username = String(input?.username || '').trim(); const password = String(input?.password || '');
  if (!await exists(configFile())) throw new Error('NOT_INITIALIZED');
  const config = await readJson(configFile());
  const usernameOk = await safeCompareHex(usernameDigest(username), config.usernameHash);
  const attempts = await Promise.all(config.slots.map(async slot => {
    try {
      const loaded = await readVault(slot);
      if (!loaded) return null;
      const result = await decryptVault(loaded.container, password);
      return { slot, ext: loaded.ext, ...result };
    } catch { return null; }
  }));
  const match = usernameOk ? attempts.find(Boolean) : null;
  if (!match) { await new Promise(resolve => setTimeout(resolve, 350)); throw new Error('INVALID_CREDENTIALS'); }
  session = { id: randomBytes(24).toString('hex'), slot: match.slot, fileExt: match.ext, password, salt: match.salt, data: match.data };
  return { sessionId: session.id, data: session.data };
});

ipcMain.handle('vault:save', async (_event, input) => {
  if (!session || input?.sessionId !== session.id) throw new Error('LOCKED');
  assertObject(input.data);
  const snapshot = structuredClone(input.data);
  saveChain = saveChain.then(async () => {
    if (!session || input.sessionId !== session.id) throw new Error('LOCKED');
    const encrypted = await encryptVault(snapshot, session.password, session.salt);
    await writeAtomic(vaultFile(session.slot, session.fileExt), encrypted);
    session.data = snapshot;
    return { savedAt: new Date().toISOString() };
  });
  return saveChain;
});

ipcMain.handle('vault:lock', async () => {
  await saveChain.catch(() => {});
  clearSession();
  return { ok: true };
});

ipcMain.handle('app:complete-window-action', async (_event, action) => {
  if (action !== 'hide' && action !== 'quit') throw new Error('INVALID_WINDOW_ACTION');
  return completeWindowAction(action);
});

ipcMain.handle('vault:export', async (_event, input) => {
  if (!session || input?.sessionId !== session.id) throw new Error('LOCKED');
  await saveChain;
  const [profile, loadedA, loadedB] = await Promise.all([readJson(configFile()), readVault('a'), readVault('b')]);
  if (!loadedA || !loadedB) throw new Error('INCOMPLETE_VAULT');
  const backup = await createEncryptedBackup({ profile, vaults: { a: loadedA.container, b: loadedB.container } }, session.password);
  const date = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Экспорт зашифрованной копии',
    defaultPath: `EncryptMe-backup-${date}.encryptme-backup`,
    filters: [{ name: 'Зашифрованная копия EncryptMe', extensions: ['encryptme-backup'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const destination = result.filePath.toLowerCase().endsWith('.encryptme-backup') ? result.filePath : `${result.filePath}.encryptme-backup`;
  try {
    await writeEncryptedBackupFile(destination, backup);
    return { canceled: false, fileName: path.basename(destination), exportedAt: new Date().toISOString(), fallback: false };
  } catch (exportError) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fallback = path.join(app.getPath('userData'), 'backups', `EncryptMe-backup-${stamp}.encryptme-backup`);
    try {
      await writeAtomic(fallback, backup);
      shell.showItemInFolder(fallback);
      return { canceled: false, fileName: path.basename(fallback), exportedAt: new Date().toISOString(), fallback: true };
    } catch {
      console.error('Backup export failed', { exportCode: exportError?.code });
      throw new Error('BACKUP_WRITE_FAILED');
    }
  }
});

ipcMain.handle('vault:import', async (_event, input) => {
  if (session) throw new Error('VAULT_OPEN');
  const username = String(input?.username || '').trim();
  const password = String(input?.password || '');
  if (username.length < 2 || !password) throw new Error('INVALID_IMPORT_INPUT');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Импорт зашифрованной копии',
    properties: ['openFile'],
    filters: [{ name: 'Зашифрованная копия EncryptMe', extensions: ['encryptme-backup'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const source = result.filePaths[0];
  if ((await stat(source)).size > MAX_BACKUP_BYTES) throw new Error('BACKUP_TOO_LARGE');
  const payload = await openEncryptedBackup(await readJson(source), password, username);

  let recoveryCreated = false;
  if (await exists(configFile())) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recoveryDir = path.join(app.getPath('userData'), 'recovery', `before-import-${stamp}`);
    await mkdir(path.dirname(recoveryDir), { recursive: true });
    await cp(storeDir(), recoveryDir, { recursive: true });
    recoveryCreated = true;
  }

  await Promise.all([
    writeAtomic(vaultFile('a'), payload.vaults.a),
    writeAtomic(vaultFile('b'), payload.vaults.b)
  ]);
  await writeAtomic(configFile(), payload.profile);
  return { canceled: false, importedAt: new Date().toISOString(), recoveryCreated };
});

app.whenReady().then(async () => {
  await migrateLegacyStoreDir();
  await createWindow();
  createTray();
});
app.on('before-quit', () => { isQuitting = true; if (windowActionTimer) clearTimeout(windowActionTimer); clearSession(); });
app.on('window-all-closed', () => { clearSession(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); else showWindow(); });
