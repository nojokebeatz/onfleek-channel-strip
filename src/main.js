// OnFleek Channel Strip — Electron main process
const { app, BrowserWindow, ipcMain, shell, session, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

/* ---------- log file: %APPDATA%\OnFleek Channel Strip\strip.log (rotates at 1 MB) ---------- */
const logPath = () => path.join(app.getPath('userData'), 'strip.log');
function logLine(src, msg) {
  try {
    const p = logPath();
    try { if (fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024) fs.renameSync(p, p + '.1'); } catch {}
    fs.appendFileSync(p, `${new Date().toISOString()} [${src}] ${String(msg).replace(/\r?\n/g, ' / ').slice(0, 4000)}\n`, 'utf8');
  } catch {}
}
process.on('uncaughtException', (e) => logLine('main', 'UNCAUGHT ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => logLine('main', 'UNHANDLED ' + (e && e.stack || e)));

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setAppUserModelId('live.onfleek.channelstrip');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null, tray = null, quitting = false, muted = false;
const startHidden = process.argv.includes('--hidden');
const statePath = () => path.join(app.getPath('userData'), 'state.json');

const boundsPath = () => path.join(app.getPath('userData'), 'window.json');
function savedBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(boundsPath(), 'utf8'));
    const { screen } = require('electron');
    const ok = screen.getAllDisplays().some(d => b.x >= d.bounds.x - 50 && b.y >= d.bounds.y - 50 && b.x < d.bounds.x + d.bounds.width && b.y < d.bounds.y + d.bounds.height);
    return ok && b.width >= 1000 && b.height >= 560 ? b : null;
  } catch { return null; }
}
let boundsTimer = 0;
function rememberBounds() { clearTimeout(boundsTimer); boundsTimer = setTimeout(() => { try { if (win && !win.isMinimized()) { const b = win.getBounds(); if (b.width >= 1000 && b.height >= 560) fs.writeFileSync(boundsPath(), JSON.stringify(b)); } } catch {} }, 500); }
function createWindow() {
  const b = savedBounds() || {};
  win = new BrowserWindow({
    width: b.width || 1560, height: b.height || 800, x: b.x, y: b.y, minWidth: 1000, minHeight: 560, show: !startHidden,
    frame: false, backgroundColor: '#121315', title: 'OnFleek Channel Strip',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.on('resize', rememberBounds); win.on('move', rememberBounds);
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } }); // X = hide to tray, keep processing
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), process.argv.includes('--shotlog') ? { hash: 'shotlog' } : process.argv.includes('--shotcompact') ? { hash: 'shotcompact' } : {});

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
  logLine('main', `start v${app.getVersion()} electron ${process.versions.electron} win ${os.release()} args ${process.argv.slice(1).join(' ')}`);
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
    { label: 'Show log file', click: () => shell.showItemInFolder(logPath()) },
    { label: 'Open settings folder', click: () => shell.openPath(app.getPath('userData')) },
    { label: 'Check for update', click: () => { showWin(); win && win.webContents.send('hotkey', 'update'); } },
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
  const shown = args.map(a => path.basename(String(a))).join(' ');
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true });
  let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  p.on('close', code => {
    logLine('ps', `${shown} -> exit ${code}: ${(out || '').trim()} ${(err || '').trim()}`);
    code === 0 ? resolve(out.trim()) : reject(new Error((err || out).trim() || ('exit ' + code)));
  });
});
ipcMain.handle('mic:rename', async (e, from, to, flow, adapter) => {
  const esc = s => String(s).replace(/'/g, "''").replace(/[\r\n]/g, '');
  const branch = flow === 'render' ? 'Render' : 'Capture';   // Capture = mic side, Render = speaker side
  const script = `
$desc='{a45c254e-df1c-4efd-8020-67d146a850e0},2'; $fn='{a45c254e-df1c-4efd-8020-67d146a850e0},14'; $adap='{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
$root='SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\${branch}'
$rights=[System.Security.AccessControl.RegistryRights]::SetValue -bor [System.Security.AccessControl.RegistryRights]::QueryValues
function Plain([string]$s) { if (-not $s) { return '' }; if ($s.StartsWith('@')) { $i=$s.LastIndexOf(';'); if ($i -ge 0) { $s=$s.Substring($i+1) } }; return $s.Trim() }
$cap=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($root); $n=0; $seen=@()
foreach ($k in $cap.GetSubKeyNames()) {
  $r=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey("$root\\$k\\Properties"); if (-not $r) { continue }
  $d=Plain([string]$r.GetValue($desc)); $f=Plain([string]$r.GetValue($fn)); $a=Plain([string]$r.GetValue($adap)); $r.Close()
  $st=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey("$root\\$k"); $state=0; if ($st) { $state=[int]$st.GetValue('DeviceState',0); $st.Close() }
  if ($state -eq 1 -and $d) { $seen += $d }
  $adOk = ('${esc(adapter || '')}' -eq '') -or ($a -like '*${esc(adapter || '')}*')
  if ($adOk -and ($d -eq '${esc(from)}' -or $f -like '${esc(from)} (*' -or $d -like '${esc(from)} (*')) {
    $w=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey("$root\\$k\\Properties",[Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree,$rights)
    $w.SetValue($desc,'${esc(to)}',[Microsoft.Win32.RegistryValueKind]::String)
    if ($f) { $full = if ($a) { '${esc(to)} (' + $a + ')' } else { '${esc(to)}' }; $w.SetValue($fn,$full,[Microsoft.Win32.RegistryValueKind]::String) }
    $w.Close(); $n++
  }
}
"RENAMED $n"
"SEEN: " + ($seen -join ' | ')`;
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
  logLine('main', `quit (restore default mic: ${defaultMemo.prev ? 'yes -> ' + defaultMemo.prev : 'no'})`);
  if (restoredOnQuit || !defaultMemo.prev || !defaultMemo.want) return;
  restoredOnQuit = true; e.preventDefault();
  runPSOut(['-File', defaultsScript(), 'set', defaultMemo.prev]).catch(() => {}).finally(() => app.quit());
});
ipcMain.handle('audio:formats', async () => {
  try { const out = await runPSOut(['-File', defaultsScript(), 'formats']); return JSON.parse(out.trim().split(/\r?\n/).pop()); }
  catch (e) { return { error: String(e.message || e).slice(0, 120) }; }
});
ipcMain.handle('audio:setFormat', async (e, name, adapter, flow, rate) => {
  try { return await runPSOut(['-File', defaultsScript(), 'setformat', String(name), String(adapter || ''), String(flow || 'Capture'), String(rate || 48000)]); }
  catch (e) { return 'FAILED ' + String(e.message || e).slice(0, 120); }
});
ipcMain.handle('audio:setDefault', async (e, name, adapter) => {
  try { return await runPSOut(['-File', defaultsScript(), 'set', String(name), String(adapter || '')]); }
  catch (e) { return 'FAILED ' + String(e.message || e).slice(0, 120); }
});

// Settings live in state.json. Your saved presets ALSO live in presets.json, and every save keeps a .bak,
// so a bad write or a broken update can never take "MY PRESETS" with it.
const presetsPath = () => path.join(app.getPath('userData'), 'presets.json');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, obj) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(obj, null, 2), 'utf8'); fs.renameSync(f + '.tmp', f); };
ipcMain.handle('state:load', () => {
  const p = statePath();
  let st = readJson(p);
  if (!st) { st = readJson(p + '.bak'); logLine('main', 'state.json unreadable' + (st ? ' - using state.json.bak' : ' and no .bak')); }
  const extra = readJson(presetsPath()) || {};
  st = st || {};
  st.userPresets = Object.assign({}, extra, (st.userPresets && typeof st.userPresets === 'object') ? st.userPresets : {});
  logLine('main', 'state loaded: ' + Object.keys(st.userPresets).length + ' user preset(s) [' + Object.keys(st.userPresets).join(', ') + ']');
  return st.params ? st : (Object.keys(st.userPresets).length ? st : null);
});
ipcMain.handle('state:save', (e, state) => {
  const p = statePath();
  const onDisk = readJson(p) || {};
  const mine = (state.userPresets && typeof state.userPresets === 'object') ? state.userPresets : {};
  // never let a save DROP presets that are still on disk unless the app deleted them on purpose
  if (!state.presetDelete) {
    const disk = (onDisk.userPresets && typeof onDisk.userPresets === 'object') ? onDisk.userPresets : {};
    for (const k in disk) if (!(k in mine)) { mine[k] = disk[k]; logLine('main', 'preset rescued from disk: ' + k); }
    state.userPresets = mine;
  }
  delete state.presetDelete;
  try { if (fs.existsSync(p)) fs.copyFileSync(p, p + '.bak'); } catch {}
  writeJson(p, state);
  writeJson(presetsPath(), state.userPresets || {});
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
    updater.on('error', (e) => { logLine('update', 'error ' + (e && e.message || e)); tell('error', { message: String(e && e.message || e).slice(0, 120) }); });
    updater.on('update-available', (i) => logLine('update', 'available ' + i.version));
    updater.on('update-downloaded', (i) => logLine('update', 'downloaded ' + i.version));
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
ipcMain.handle('log:write', (e, msg) => logLine('ui', msg));
ipcMain.handle('log:path', () => logPath());
ipcMain.handle('changelog:get', () => { try { return fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'); } catch (e) { return 'No changelog found: ' + e.message; } });
// REC: the renderer hands over a finished WAV; keep the last three in userData.
ipcMain.handle('rec:save', (e, buf) => {
  const dir = app.getPath('userData'), name = 'capture-' + new Date().toISOString().replace(/[:.]/g, '-') + '.wav';
  fs.writeFileSync(path.join(dir, name), Buffer.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf));
  try { fs.readdirSync(dir).filter(f => /^capture-.*\.wav$/.test(f)).sort().reverse().slice(3).forEach(f => fs.unlinkSync(path.join(dir, f))); } catch {}
  logLine('main', 'capture saved ' + name);
  return name;
});
// SEND LOG: post the log to windows.onfleek.live's upload door (same PIN the chat page uses) so the
// file lands on the server where Claude can read it. Nothing else leaves the PC.
ipcMain.handle('log:send', async (e, pin) => {
  let body = ''; try { body = fs.readFileSync(logPath(), 'utf8'); } catch { body = '(no log yet)'; }
  if (body.length > 400000) body = '...(older lines trimmed)...\n' + body.slice(-400000);
  const head = `OnFleek Channel Strip v${app.getVersion()} · sent ${new Date().toISOString()} · ${os.hostname()} · Windows ${os.release()}\n\n`;
  const res = await fetch('https://windows.onfleek.live/api/upload-image?name=channel-strip-log&ext=txt', {
    method: 'POST', headers: { 'X-Window-Pin': String(pin || ''), 'Content-Type': 'text/plain' }, body: head + body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { logLine('main', 'log send failed ' + res.status + ' ' + (j.error || '')); throw new Error(j.error || ('HTTP ' + res.status)); }
  logLine('main', 'log sent as ' + j.name);
  // also send the newest recording, if there is a fresh one (last 2 h)
  let extra = '';
  try {
    const dir = app.getPath('userData');
    const caps = fs.readdirSync(dir).filter(f => /^capture-.*\.wav$/.test(f)).map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    if (caps.length && Date.now() - caps[0].t < 2 * 3600 * 1000) {
      const r2 = await fetch('https://windows.onfleek.live/api/upload-image?name=channel-strip-capture&ext=wav', {
        method: 'POST', headers: { 'X-Window-Pin': String(pin || ''), 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(path.join(dir, caps[0].f)) });
      const j2 = await r2.json().catch(() => ({}));
      if (r2.ok) { extra = ' + ' + j2.name; logLine('main', 'capture sent as ' + j2.name); } else logLine('main', 'capture send failed ' + r2.status);
    }
  } catch (e2) { logLine('main', 'capture send failed ' + (e2.message || e2)); }
  return j.name + extra;
});
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
// Ctrl + / Ctrl - / Ctrl 0 : make the whole panel bigger or smaller by resizing the window (the panel scales to fit)
ipcMain.handle('win:zoom', (e, f) => {
  if (!win) return; const b = win.getBounds();
  if (f === 0) { win.setSize(1560, 800); return; }
  const w = Math.round(Math.max(1000, b.width * f)), h = Math.round(Math.max(560, b.height * f));
  win.setSize(w, h);
});
// COMPACT: shrink the window to a little strip (and remember the big size to come back to)
let bigBounds = null;
ipcMain.handle('win:compact', (e, on) => {
  if (!win) return;
  if (on) {
    bigBounds = win.getBounds(); win.setMinimumSize(420, 150); win.setSize(620, 150); win.setAlwaysOnTop(true, 'floating');
  } else {
    win.setAlwaysOnTop(false); win.setMinimumSize(1000, 560);
    const b = bigBounds || savedBounds() || { width: 1560, height: 800 }; win.setSize(b.width, b.height);
    if (b.x !== undefined) win.setPosition(b.x, b.y);
  }
  return true;
});
ipcMain.handle('tray:icon', (e, dataUrl) => { try { if (tray) tray.setImage(dataUrl ? nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 }) : nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 16, height: 16 })); } catch {} });
ipcMain.handle('win:close', () => win && win.close());
