// OnFleek Channel Strip — Electron main process
const { app, BrowserWindow, ipcMain, shell, session, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setAppUserModelId('live.onfleek.channelstrip');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null, tray = null, quitting = false, muted = false;
const startHidden = process.argv.includes('--hidden');
const statePath = () => path.join(app.getPath('userData'), 'state.json');

function createWindow() {
  win = new BrowserWindow({
    width: 600, height: 1060, minWidth: 340, minHeight: 600, show: !startHidden,
    frame: false, backgroundColor: '#121315', title: 'OnFleek Channel Strip',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } }); // X = hide to tray, keep processing
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
  createTray();
  globalShortcut.register('CommandOrControl+Shift+M', () => win && win.webContents.send('hotkey', 'mute'));
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

/* ---------- tray + start with Windows ---------- */
function showWin() { if (win) { win.show(); win.focus(); } }
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Show Channel Strip', click: showWin },
    { label: 'Mute mic   (Ctrl+Shift+M)', type: 'checkbox', checked: muted, click: () => win && win.webContents.send('hotkey', 'mute') },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (item) => setAutostart(item.checked) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]);
}
function createTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img); tray.setToolTip('OnFleek Channel Strip'); tray.setContextMenu(trayMenu());
    tray.on('click', showWin);
  } catch (e) { tray = null; }
}
function setAutostart(on) {
  app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] });
  if (tray) tray.setContextMenu(trayMenu());
}
ipcMain.handle('autostart:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('autostart:set', (e, on) => { setAutostart(on); return true; });
ipcMain.handle('mute:state', (e, m) => {
  muted = !!m;
  if (tray) { tray.setContextMenu(trayMenu()); tray.setToolTip(muted ? 'OnFleek Channel Strip — MUTED' : 'OnFleek Channel Strip'); }
});

/* ---------- rename the virtual mic (e.g. "CABLE Output" -> "Virtual Mic Out") ----------
   Windows keeps endpoint names in HKLM\...\MMDevices\Audio\Capture\<id>\Properties. Users may SET values
   there (that is how the Settings app renames), but only if the key is opened asking for SetValue alone,
   so this goes through .NET Registry with minimal rights. No admin prompt. */
const runPSOut = (args) => new Promise((resolve, reject) => {
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true });
  let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  p.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error((err || out).trim() || ('exit ' + code))));
});
ipcMain.handle('mic:rename', async (e, from, to, flow) => {
  const esc = s => String(s).replace(/'/g, "''").replace(/[\r\n]/g, '');
  const branch = flow === 'render' ? 'Render' : 'Capture';   // Capture = mic side, Render = speaker side
  const script = `
$desc='{a45c254e-df1c-4efd-8020-67d146a850e0},2'; $fn='{a45c254e-df1c-4efd-8020-67d146a850e0},14'; $adap='{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
$root='SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\${branch}'
$rights=[System.Security.AccessControl.RegistryRights]::SetValue -bor [System.Security.AccessControl.RegistryRights]::QueryValues
$cap=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($root); $n=0
foreach ($k in $cap.GetSubKeyNames()) {
  $r=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey("$root\\$k\\Properties"); if (-not $r) { continue }
  $d=[string]$r.GetValue($desc); $f=[string]$r.GetValue($fn); $a=[string]$r.GetValue($adap); $r.Close()
  if ($d -eq '${esc(from)}' -or $f -like '${esc(from)} (*') {
    $w=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey("$root\\$k\\Properties",[Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree,$rights)
    $w.SetValue($desc,'${esc(to)}',[Microsoft.Win32.RegistryValueKind]::String)
    if ($f) { $full = if ($a) { '${esc(to)} (' + $a + ')' } else { '${esc(to)}' }; $w.SetValue($fn,$full,[Microsoft.Win32.RegistryValueKind]::String) }
    $w.Close(); $n++
  }
}
"RENAMED $n"`;
  const file = path.join(app.getPath('temp'), 'onfleek-rename-mic.ps1');
  fs.writeFileSync(file, script, 'utf8');
  return await runPSOut(['-File', file]);
});

/* ---------- Windows default microphone (so Zoom / Webex / Teams need no clicks) ----------
   src/ps/audio-default.ps1 talks to the same COM interface the Sound control panel uses.
   'get' -> {console, multimedia, communications} short names; 'set <name>' -> all three roles. */
// The script ships inside app.asar, which powershell.exe cannot read, so copy it out once per version.
const defaultsScript = () => {
  const dst = path.join(app.getPath('userData'), 'audio-default.ps1');
  try {
    const body = fs.readFileSync(path.join(__dirname, 'ps', 'audio-default.ps1'), 'utf8');
    if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== body) fs.writeFileSync(dst, body, 'utf8');
  } catch (e) { /* fall through; the run will report the error */ }
  return dst;
};
const getDefaults = async () => {
  try { const out = await runPSOut(['-File', defaultsScript(), 'get']); return JSON.parse(out.trim().split(/\r?\n/).pop()); }
  catch (e) { return { error: String(e.message || e).slice(0, 120) }; }
};
ipcMain.handle('audio:defaults', getDefaults);
// Dev helper: --selftest runs the packaged PowerShell path and prints the result, then quits.
if (process.argv.includes('--selftest')) app.whenReady().then(async () => { process.stdout.write('SELFTEST ' + JSON.stringify(await getDefaults()) + '\n'); app.exit(0); });
// Mic safety: on Quit, hand Windows' default mic back to the real mic so nothing goes silent without us.
let defaultMemo = { prev: '', want: '' }, restoredOnQuit = false;
ipcMain.handle('audio:remember', (e, prev, want) => { defaultMemo = { prev: String(prev || ''), want: String(want || '') }; });
app.on('before-quit', (e) => {
  if (restoredOnQuit || !defaultMemo.prev || !defaultMemo.want) return;
  restoredOnQuit = true; e.preventDefault();
  runPSOut(['-File', defaultsScript(), 'set', defaultMemo.prev]).catch(() => {}).finally(() => app.quit());
});
ipcMain.handle('audio:setDefault', async (e, name) => {
  try { return await runPSOut(['-File', defaultsScript(), 'set', String(name)]); }
  catch (e) { return 'FAILED ' + String(e.message || e).slice(0, 120); }
});

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
    updater.on('checking-for-update', () => tell('checking', {}));
    updater.on('update-not-available', (i) => tell('none', { version: i && i.version }));
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
