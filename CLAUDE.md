# OnFleek Channel Strip — SSL-style mic processor for Windows (desktop app)

- **What:** Downloadable Windows desktop app. Takes a live mic (the "Virtual MIC" USB mic), runs it through
  filters → gate/expander → compressor → 4-band EQ → fader, and plays the result into a virtual cable so
  other Windows apps can pick the processed signal as their microphone.
- **Folder:** C:\Users\nojok\Docker\onfleek-channel-strip  (also reachable as C:\Docker\onfleek-channel-strip)
- **Version:** see `package.json` (shown in the app's top rail). Bump on every release + add a `CHANGELOG.md` line.
- **Download:** GitHub Releases on repo `nojokebeatz/onfleek-channel-strip` (installer + portable exe).
  The app checks that repo's latest release on launch and shows a "new version" bar.
- **Not a Docker/web app** — no port, no tunnel, no `onfleek ship`. Build locally, upload to GitHub Releases.

## Stack
- Electron (frameless window) + AudioWorklet DSP. No native code.
- `src/main.js` — window, permissions, state file (`%APPDATA%\onfleek-channel-strip\state.json`), IPC.
- `src/renderer/app.js` — knobs/toggles/fader/meters/presets/devices/update check.
- `src/renderer/worklet/strip-processor.js` — ALL the audio math (biquads, gate, comp, EQ).
- `test/dsp-test.js` — runs the worklet in plain Node and checks levels. `npm test` must say ALL PASS.

## Build + release
```
npm test                                   # DSP checks
npx electron . --screenshot=C:\Temp\cs.png # look at the UI without a mic
npm run dist                               # dist\OnFleek-Channel-Strip-Setup-<ver>.exe + -Portable-<ver>.exe
# release = tag v<ver> + upload Setup exe, Portable exe, latest.yml AND the .blockmap (electron-updater needs latest.yml)
```

## How the routing works (tell the user in plain words)
Windows has no built-in "fake microphone". The app plays its processed sound into **VB-CABLE** (free driver,
https://vb-audio.com/Cable/). In the app: MIC IN = Virtual MIC, SEND TO = "CABLE Input". In Zoom/Discord/OBS:
mic = "CABLE Output". The LISTEN button temporarily sends the output to the default speakers instead.

## VB-CABLE rule (license, read before touching)
The VB-CABLE readme says: copying the package AS IS is allowed, but "it is not allowed to integrate the
VB-CABLE package in another software installation procedure without Author agreement." So it is NEVER
bundled in our installer. The INSTALL CABLE button (`cable:install` in main.js) downloads the unmodified
zip from vb-audio.com at click time, unpacks it in %TEMP%, and opens THEIR setup elevated. No open-source
alternative exists that Microsoft has signed (unsigned kernel drivers will not load on Windows 10/11).

## Self-update (electron-updater, added 1.2.0)
`build.publish` points at the GitHub repo; electron-builder writes `resources/app-update.yml` into the
installed app and `dist/latest.yml` next to the exes. The installed (NSIS) app checks GitHub Releases on
launch + hourly, downloads in the background, and `quitAndInstall` on the RESTART TO UPDATE button.
Portable builds (`PORTABLE_EXECUTABLE_FILE` set) and dev runs use the plain GitHub API check + GET IT link.
⛔ A release WITHOUT `latest.yml` is invisible to installed apps. Upload Setup exe + blockmap + latest.yml.

## Renaming the virtual mic ("Virtual Mic Out", added 1.3.0)
Endpoint names live in `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture\<id>\Properties`,
value `{a45c254e-df1c-4efd-8020-67d146a850e0},2` (DeviceDesc; the Sound app's "rename" edits this).
`Set-ItemProperty` FAILS even as admin (the provider asks for full write rights). Opening the key through
.NET `Registry.LocalMachine.OpenSubKey(path, ReadWriteSubTree, SetValue|QueryValues)` works as a normal
user, no UAC. Verified 09-12 on this box (rename + revert of a stale "Line In"). `mic:rename` in main.js.

## Tray / hotkey (added 1.3.0)
Closing the window hides it (processing continues); Quit is in the tray menu. `Ctrl+Shift+M` is a global
shortcut for MUTE. BOOT = `app.setLoginItemSettings({openAtLogin, args:['--hidden']})`; `--hidden` starts
with the window not shown. Mute never persists across launches (reset to 0 on load).

## Traps
- Chromium hides device names until the mic permission is granted once — `unlockLabels()` does that.
- `AudioContext.setSinkId('')` = default output; `'default'` id must be mapped to `''`.
- Fit-to-window uses a ResizeObserver on `#strip` because the cable hint changes the panel height after boot.
- Compressor sidechain needs the peak follower (`compEnv`); reading raw samples under-reads GR by ~1 dB.
- electron-builder on Windows may fail extracting winCodeSign (symlink privilege). Fix = run the build
  through the elevation helper, or set `win.signAndEditExecutable=false` (loses the exe icon).
