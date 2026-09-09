import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, cp, mkdir, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { blankVault, createSplitVault, decryptVault, deriveVaultKey, FAST_KDF, isSplitVault, loadSplitEntry, openSplitVault, openSplitVaultWithKey, readJson, rekeySplitVault, safeCompareHex, SCRYPT_KDF, updateSplitVault, usernameDigest, writeAtomic } from './vault.mjs';
import { createEncryptedBackup, openEncryptedBackup, writeEncryptedBackupFile } from './backup.mjs';
import { mergeSplitVaults } from './wifi-sync.mjs';

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
let wifiSync = null;
const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const WIFI_SYNC_TTL_MS = 5 * 60 * 1000;

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
function stopWifiSync() {
  if (!wifiSync) return;
  clearTimeout(wifiSync.timer);
  wifiSync.server.close();
  wifiSync = null;
}
function clearSession() {
  stopWifiSync();
  if (session) session.password = '\0'.repeat(session.password.length);
  if (session?.key) session.key.fill(0);
  session = null;
}

function localWifiAddresses(port) {
  const addresses = new Set();
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const info of interfaces || []) {
      if (info.family === 'IPv4' && !info.internal) addresses.add(`http://${info.address}:${port}`);
    }
  }
  const rank = address => address.includes('://192.168.') ? 0 : address.includes('://10.') ? 1 : /^http:\/\/172\.(1[6-9]|2\d|3[01])\./.test(address) ? 2 : 3;
  return [...addresses].filter(address => !address.includes('://169.254.')).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BACKUP_BYTES) { reject(new Error('SYNC_TOO_LARGE')); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('INVALID_SYNC_REQUEST')); }
    });
    request.on('error', reject);
  });
}

async function startWifiSyncHost(sessionId) {
  if (!session || session.id !== sessionId) throw new Error('LOCKED');
  await saveChain;
  stopWifiSync();
  const code = randomBytes(6).toString('hex').toUpperCase();
  const hostSessionId = session.id;
  let failures = 0;
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'content-type');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return; }
    if (request.method !== 'POST' || request.url !== '/sync') { response.statusCode = 404; response.end(JSON.stringify({ error: 'NOT_FOUND' })); return; }
    try {
      if (!wifiSync || wifiSync.server !== server || !session || session.id !== hostSessionId) throw new Error('SYNC_EXPIRED');
      const body = await readRequestJson(request);
      const supplied = String(body?.code || '').replace(/[^A-F0-9]/gi, '').toUpperCase();
      if (supplied !== code) {
        failures += 1;
        if (failures >= 8) setImmediate(stopWifiSync);
        throw new Error('INVALID_SYNC_CODE');
      }
      if (!isSplitVault(body?.container)) throw new Error('INVALID_SYNC_VAULT');
      await saveChain;
      if (!session || session.id !== hostSessionId) throw new Error('SYNC_EXPIRED');
      const merged = mergeSplitVaults(session.container, body.container, session.key);
      await writeAtomic(vaultFile(session.slot, session.fileExt), merged.container);
      session.container = merged.container;
      session.data = merged.data;
      mainWindow?.webContents.send('vault:wifi-sync-updated', { sessionId: session.id, data: merged.data, stats: merged.stats });
      response.statusCode = 200;
      response.end(JSON.stringify({ container: merged.container, data: merged.data, stats: merged.stats }));
      setImmediate(stopWifiSync);
    } catch (error) {
      response.statusCode = error?.message === 'INVALID_SYNC_CODE' ? 401 : error?.message === 'SYNC_VAULT_MISMATCH' ? 409 : 400;
      response.end(JSON.stringify({ error: error?.message || 'SYNC_FAILED' }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => { server.off('error', reject); resolve(); });
  });
  const port = server.address().port;
  const expiresAt = new Date(Date.now() + WIFI_SYNC_TTL_MS).toISOString();
  wifiSync = { server, code, sessionId: hostSessionId, timer: setTimeout(stopWifiSync, WIFI_SYNC_TTL_MS) };
  return { addresses: localWifiAddresses(port), code: `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`, expiresAt };
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
  const sharedSalt = randomBytes(16);
  const [real, decoy] = await Promise.all([createSplitVault(blankVault('real'), realPassword, sharedSalt), createSplitVault(blankVault('decoy'), decoyPassword, sharedSalt)]);
  real.key.fill(0); decoy.key.fill(0);
  await Promise.all([writeAtomic(vaultFile(slots[0]), real.container), writeAtomic(vaultFile(slots[1]), decoy.container)]);
  await writeAtomic(configFile(), { version: 1, usernameHash: usernameDigest(username), slots: ['a', 'b'], kdfSalt: sharedSalt.toString('base64'), kdf: FAST_KDF });
  return { ok: true };
});

ipcMain.handle('vault:unlock', async (_event, input) => {
  const username = String(input?.username || '').trim(); const password = String(input?.password || '');
  if (!await exists(configFile())) throw new Error('NOT_INITIALIZED');
  const config = await readJson(configFile());
  const usernameOk = await safeCompareHex(usernameDigest(username), config.usernameHash);
  const loadedSlots = (await Promise.all(config.slots.map(async slot => ({ slot, loaded: await readVault(slot) })))).filter(item => item.loaded);
  let sharedKey = null;
  let sharedKdf = config.kdf || SCRYPT_KDF;
  let match = null;

  if (config.kdfSalt) {
    sharedKdf = config.kdf || loadedSlots.find(item => isSplitVault(item.loaded.container) && item.loaded.container.salt === config.kdfSalt)?.loaded.container.kdf || SCRYPT_KDF;
    sharedKey = await deriveVaultKey(password, Buffer.from(config.kdfSalt, 'base64'), sharedKdf);
    for (const { slot, loaded } of loadedSlots) {
      if (!isSplitVault(loaded.container) || loaded.container.salt !== config.kdfSalt || loaded.container.kdf !== sharedKdf) continue;
      try { match = { slot, ext: loaded.ext, container: loaded.container, ...openSplitVaultWithKey(loaded.container, sharedKey), salt: Buffer.from(config.kdfSalt, 'base64'), key: sharedKey }; break; }
      catch { /* this password belongs to another slot */ }
    }
  }

  if (!match) {
    for (const { slot, loaded } of loadedSlots) {
      if (isSplitVault(loaded.container) && loaded.container.salt === config.kdfSalt && loaded.container.kdf === sharedKdf) continue;
      if (isSplitVault(loaded.container)) {
        try { match = { slot, ext: loaded.ext, container: loaded.container, ...(await openSplitVault(loaded.container, password)) }; break; }
        catch { continue; }
      }
      let legacy;
      try { legacy = await decryptVault(loaded.container, password); }
      catch { continue; }
      const migrated = await createSplitVault(legacy.data, password, legacy.salt);
      await writeAtomic(vaultFile(slot, loaded.ext), migrated.container);
      match = { slot, ext: loaded.ext, container: migrated.container, data: migrated.data, salt: legacy.salt, key: migrated.key };
      break;
    }
  }

  if (!usernameOk && match?.key && match.key !== sharedKey) match.key.fill(0);
  if (!usernameOk) match = null;
  if (!match) { sharedKey?.fill(0); await new Promise(resolve => setTimeout(resolve, 350)); throw new Error('INVALID_CREDENTIALS'); }

  const targetSalt = Buffer.from(config.kdfSalt || match.container.salt, 'base64');
  if (match.container.salt !== targetSalt.toString('base64') || match.container.kdf !== FAST_KDF) {
    const targetKey = sharedKdf === FAST_KDF && sharedKey ? sharedKey : await deriveVaultKey(password, targetSalt, FAST_KDF);
    const rekeyed = rekeySplitVault(match.container, match.key, targetKey, targetSalt, FAST_KDF);
    await writeAtomic(vaultFile(match.slot, match.ext), rekeyed);
    if (match.key !== targetKey) match.key.fill(0);
    if (sharedKey && sharedKey !== targetKey) sharedKey.fill(0);
    match.key = targetKey; match.salt = targetSalt; match.container = rekeyed;
  }
  if (config.kdfSalt !== targetSalt.toString('base64') || config.kdf !== FAST_KDF) {
    config.kdfSalt = targetSalt.toString('base64'); config.kdf = FAST_KDF;
    await writeAtomic(configFile(), config);
  }
  session = { id: randomBytes(24).toString('hex'), slot: match.slot, fileExt: match.ext, password, salt: match.salt, key: match.key, container: match.container, data: match.data };
  return { sessionId: session.id, data: session.data };
});

ipcMain.handle('vault:load-entry', async (_event, input) => {
  if (!session || input?.sessionId !== session.id) throw new Error('LOCKED');
  const id = String(input?.id || '');
  const metadata = session.data.entries.find(entry => entry.id === id);
  if (!metadata) throw new Error('ENTRY_NOT_FOUND');
  const content = loadSplitEntry(session.container, session.key, id);
  session.data = { ...session.data, entries: session.data.entries.map(entry => entry.id === id ? { ...entry, content } : entry) };
  return { id, content };
});

ipcMain.handle('vault:save', async (_event, input) => {
  if (!session || input?.sessionId !== session.id) throw new Error('LOCKED');
  assertObject(input.data);
  const snapshot = structuredClone(input.data);
  saveChain = saveChain.then(async () => {
    if (!session || input.sessionId !== session.id) throw new Error('LOCKED');
    const updated = updateSplitVault(session.container, session.key, snapshot, session.data);
    await writeAtomic(vaultFile(session.slot, session.fileExt), updated.container);
    session.container = updated.container;
    session.data = { ...snapshot, version: updated.data.version, updatedAt: updated.data.updatedAt };
    return { savedAt: new Date().toISOString() };
  });
  return saveChain;
});

ipcMain.handle('vault:lock', async () => {
  await saveChain.catch(() => {});
  clearSession();
  return { ok: true };
});

ipcMain.handle('wifi-sync:start', async (_event, input) => startWifiSyncHost(String(input?.sessionId || '')));
ipcMain.handle('wifi-sync:stop', async () => { stopWifiSync(); return { ok: true }; });

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
