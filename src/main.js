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
ipcMain.handle('shell:open', (e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('win:minimize', () => win && win.minimize());
ipcMain.handle('win:close', () => win && win.close());
