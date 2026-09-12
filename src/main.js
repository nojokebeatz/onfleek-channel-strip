// OnFleek Channel Strip — Electron main process
const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setAppUserModelId('live.onfleek.channelstrip');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
const statePath = () => path.join(app.getPath('userData'), 'state.json');

function createWindow() {
  win = new BrowserWindow({
    width: 600, height: 1010, minWidth: 340, minHeight: 600,
    frame: false, backgroundColor: '#121315', title: 'OnFleek Channel Strip',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Dev helper: --screenshot=<file.png> captures the UI and quits.
  const shot = process.argv.find(a => a.startsWith('--screenshot='));
  if (shot) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(shot.slice('--screenshot='.length), img.toPNG());
      app.quit();
    }, 3000));
  }
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  const ALLOWED = new Set(['media', 'audioCapture', 'speaker-selection']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(ALLOWED.has(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => ALLOWED.has(perm));
  createWindow();
});

app.on('window-all-closed', () => app.quit());

ipcMain.handle('state:load', () => {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { return null; }
});
ipcMain.handle('state:save', (e, state) => {
  const p = statePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p + '.tmp', JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(p + '.tmp', p);
  return true;
});
ipcMain.handle('app:version', () => app.getVersion());

// Self-update: installed (NSIS) builds download the new Setup from GitHub Releases in the background
// and install on "RESTART TO UPDATE". Portable builds and dev runs report 'manual' so the panel falls
// back to the plain GitHub check + download link.
const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE;
let updater = null;
if (app.isPackaged && !isPortable) {
  try {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = true; updater.autoInstallOnAppQuit = true; updater.allowPrerelease = false;
    const tell = (type, data) => win && !win.isDestroyed() && win.webContents.send('update:event', { type, ...data });
    updater.on('update-available', (i) => tell('available', { version: i.version }));
    updater.on('download-progress', (p) => tell('progress', { percent: Math.round(p.percent) }));
    updater.on('update-downloaded', (i) => tell('downloaded', { version: i.version }));
    updater.on('error', (e) => tell('error', { message: String(e && e.message || e).slice(0, 120) }));
  } catch (e) { updater = null; }
}
ipcMain.handle('update:mode', () => updater ? 'auto' : 'manual');
ipcMain.handle('update:check', async () => { if (!updater) return false; try { await updater.checkForUpdates(); } catch (e) { /* reported via 'error' */ } return true; });
ipcMain.handle('update:install', () => { if (updater) setImmediate(() => updater.quitAndInstall(false, true)); });
ipcMain.handle('shell:open', (e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
// VB-CABLE helper. License allows copying the package AS IS but forbids folding it into another
// installer, so we fetch the unmodified zip from vb-audio.com at click time and open THEIR setup.
const { spawn } = require('child_process');
const runPS = (cmd) => new Promise((resolve, reject) => {
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { windowsHide: true });
  let err = ''; p.stderr.on('data', d => err += d);
  p.on('close', code => code === 0 ? resolve() : reject(new Error(err.trim() || ('exit ' + code))));
});
const CABLE_URL = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip';
ipcMain.handle('cable:install', async () => {
  const progress = (s) => win && win.webContents.send('cable:progress', s);
  const dir = path.join(app.getPath('temp'), 'onfleek-vbcable');
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'VBCABLE_Driver_Pack45.zip');
  progress('download');
  const res = await fetch(CABLE_URL);
  if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  progress('extract');
  await runPS(`Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`);
  const setup = path.join(dir, 'VBCABLE_Setup_x64.exe');
  if (!fs.existsSync(setup)) throw new Error('setup exe missing after unzip');
  progress('launch');
  await runPS(`Start-Process -FilePath '${setup}' -WorkingDirectory '${dir}' -Verb RunAs`);
  return { ok: true };
});
ipcMain.handle('win:minimize', () => win && win.minimize());
ipcMain.handle('win:close', () => win && win.close());
