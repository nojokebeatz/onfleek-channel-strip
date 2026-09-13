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

## 2.0.0 = Voicemeeter replacement (owner: one mic, no PC sound, hates A1/B1/VAIO labels)
- `src/ps/audio-default.ps1` = IPolicyConfig COM (CLSID 870af99c-…) + IMMDeviceEnumerator via Add-Type.
  `get` prints JSON of the three default-capture roles; `set <DeviceDesc>` sets all three. Verified on this
  box: the call goes through (unplugged endpoint returns 0x80070490 cleanly). Needs an ACTIVE endpoint.
- Two engines: `ctx` (mic → worklet → cable sink, or `{type:'none'}` when no cable) and `monCtx`
  (mic → worklet → GainNode(PHONES) → headphones sink). Params are posted to both. Meters from `ctx` only.
- `cableOut()` finds the cable playback device by label; SEND TO dropdown is gone. Cable mic side is
  filtered out of MIC IN, cable filtered out of HEADPHONES.
- NAME IT renames Capture "CABLE Output"→"Virtual Mic Out" AND Render "CABLE Input"→"Virtual Mic Feed"
  (`mic:rename` takes a flow arg). `CABLE_RX` must keep matching "virtual mic feed".

## 2.1.0 notes
- De-esser = bandpass detector at deFreq (Q 2.5) → gain-reduction (max 12 dB) subtracted as `x -= k*bp(x)`.
  `deThr = -10 - deAmt*0.5` dBFS. Meter field `de`.
- Verdict (`updateVerdict`) tracks speech peaks only while the gate is open and out > -40 dBFS.
- Mic safety: renderer calls `rememberDefault(prev, want)`; main's `before-quit` runs the PS script
  `set <prev>` then quits (guarded by `restoredOnQuit`). Boot re-applies `want` if `state.wantDefault`.
- NR = `noiseSuppression: !!state.nr` in `micConstraints()`; toggling restarts both engines.

## Layout (2.2.0): desktop, five columns, PC only
`#strip` fills the window (flex column: rail-top, updateBar, `.plate` = five `.col`). Natural size
`NAT_W x NAT_H` = 1560 x 760; `fit()` zooms DOWN only (never up) and sets the strip's logical size to
w/scale x h/scale so it always fills the viewport. Column min-widths must sum to <= NAT_W
(330 + 312 + 312 + 356 + 230 = 1540). Meter canvas draws in 150x270 space zoomed by `MK` onto 190x340.

## Log + SEND LOG (2.2.4)
- `%APPDATA%\OnFleek Channel Strip\strip.log` — `logLine(src,msg)` in main.js; renderer `log()` via IPC.
  Every `lcd()` call, device lists, NAME IT / MAKE DEFAULT results, every PowerShell run + output.
- SEND LOG posts to `https://windows.onfleek.live/api/upload-image?name=channel-strip-log&ext=txt` with
  header `X-Window-Pin` (his admin PIN, saved in state.json as `logPin`). ⛔ Uploads land INSIDE the
  container volume, not the host folder: read with
  `docker exec onfleek-windows sh -c 'ls -t /state/uploads | grep channel-strip-log | head -1'` then
  `docker exec onfleek-windows cat /state/uploads/<name>`.

## Crackle / "8-bit sound" hunt (2.4.0)
- `audio-default.ps1 formats` lists every ACTIVE endpoint's stored format (registry value
  `{f19f064d-082c-4e27-bc73-6882a1bb8e4c},0`, a PROPVARIANT blob; `ParseFmt` scans for the WAVEFORMATEX
  pattern so the header layout does not matter). `setformat <name> <adapter> <Render|Capture> <rate>` calls
  IPolicyConfig::SetDeviceFormat with a PCM 16-bit stereo WAVEFORMATEXTENSIBLE.
- RATE row: cable feed vs mic side must match (48000 preferred). FIX RATE sets both, then restarts the engine.
- Main engine latencyHint 'playback'; monitor engine 'interactive'. Meters no longer use shadowBlur.

## Honest meters + static hunt (2.5.0)
- `dbToY(d)` in app.js is THE dB-to-pixel map for the IN/OUT columns (segment bottom edge = the level
  where it lights). Markers, peak-hold and scale labels all use it. Old `segY` put markers half a segment high.
- Gate hysteresis = `HYST` in the worklet and `GATE_HYST` in app.js (4 dB) - keep them equal. IN column
  shows OPEN (threshold), CLOSE (threshold - HYST), COMP tick, and a white pointer = `meter.gateLvl`, the
  detector level the gate really compares. The detector sits AFTER the HP/LP filters, so IN bars and the
  pointer can legitimately differ (rumble).
- Health: worklet reports `clips` (limiter hard clamps), `nans`, and `t` (Date.now per block); app.js
  counts STALLS (>200 ms between reports), CLOCK SLIPS (ctx.currentTime vs performance.now > 30 ms/s)
  and CLIPS, shows them after RUN on the LCD and logs each one.
- REC (OUTPUT header): worklet `rec` message -> 10 s Float32 capture (L = post-trim input, R = final
  output) -> `wavStereo16` -> IPC `rec:save` -> `%APPDATA%\OnFleek Channel Strip\capture-<iso>.wav`
  (keeps 3). SEND LOG also uploads the newest capture (< 2 h old) as `channel-strip-capture-*.wav`.
- Lamps: `setupLamps()` prepends `<i class="lamp">` to every `.tog`; GSAP (`vendor/gsap.min.js`, CSP-safe
  local copy) animates lamp/LED/press via a MutationObserver on `class`. Use `gsap.fromTo`, never `from`.

- 2.5.1: IN-meter lines are draggable (`lineAt`/`yToDb` in app.js, pointer events on `#meters`); the
  canvas draws in 150x270 logical units, so pointer coords scale by `150 / rect.width` and `270 / rect.height`.
  `yToDb` round-trips every whole dB against `dbToY` (checked).

- 2.6.0: REC = 15 s take (raw, pre-trim) kept in `take` (renderer) and pushed to the MONITOR worklet
  (`take` / `play` messages); PLAY substitutes the take for the mic input in the monitor engine ONLY, so the
  cable keeps the live mic. `startMon` re-sends the take. Version label click -> `changelog:get` IPC reads
  CHANGELOG.md (now in the packaged `files`); `--shotlog` flag opens the box for screenshots.

- 2.7.0: undo ring `hist` (snap() in changed(), 400 ms merge); A/B slot `ab`; LOCK = `state.locked` checked in knob
  set/toggle click/fader move; settings code = `CS1:` + base64(JSON of presetOnly(params)); SHARE box `#shareBox`;
  key handler ignores inputs/selects. OUTPUT column is tight: the cable hint + tool row only fit with the compact
  paddings (.hint / .masters / .bigbtns) - screenshot before adding rows there.

- 2.7.1: `fillPresetList()` runs inside `renderAll()` (buildPresets ran BEFORE loadState, so MY PRESETS
  looked empty after every restart). main.js `state:load` merges `presets.json` + falls back to
  `state.json.bak`; `state:save` rescues on-disk presets unless the renderer passes `presetDelete: 1`.

- 2.8.0: window bounds in userData `window.json` (validated against displays); `win:zoom` resizes the window and
  `fit()` scales UP as well as down; `deListen` is stripped from the MAIN engine's params in sendParams (monitor
  only) and is NOT_IN_PRESET; `compAuto` computes compMakeup in `autoMakeup()` before every send (dragging MAKE
  UP switches AUTO off); worklet meter carries `rmsIn/rmsOut`; verdict = 1.5 s average RMS vs RMS_LO/HI (-30/-16);
  `state.fast` -> latencyHint interactive; tray icon dataURL from a renderer canvas (`tray:icon`).

- 2.8.2: meter canvas is 205 px wide with `MPAD` (12 logical px) translated in as a left gutter for the sideways
  GATE / COMP names; `lineAt` subtracts MPAD; clearRect starts at -MPAD.

- 2.9.0: COMPACT = `#compact` div OUTSIDE `#strip` (must stay after `#strip` and before the scripts); `setCompact()`
  hides #strip (`#strip[hidden]{display:none}` is needed because #strip is display:flex), `win:compact` IPC
  shrinks the window to 620x150 always-on-top and restores `bigBounds`; `fit()` is a no-op while compact;
  `rememberBounds` ignores small bounds. `--shotcompact` flag for screenshots.

- 2.9.1: `drawCurveOn(gE, W, H)` draws the EQ curve into any canvas (main 330x80, compact `#cEq` 600x110);
  `makeEqEditable(canvas, W, H)` = dot drag (freq/gain), wheel (Q), dblclick (gain 0); `eqHot/eqDrag` drive the
  bigger dot + readout. Compact window is 620x290 now. Canvas DPR setup must come AFTER `const DPR`.

- 2.10.1: save box has `#nameSelect` (Replace: <name> -> saves immediately on change). Screenshot helper:
  `npx electron . --click=<elementId> --screenshot=x.png` clicks that element 300 ms after boot.

- 2.11.0: skins = `src/renderer/modern.css`, every rule scoped to `body.modern`; `state.skin` ('classic'|'modern'),
  `applySkin()` in boot, SKIN button / K key. Keep the classic font in the modern skin (a wider font overflows
  the section headers); modern cards steal ~9 px per column, so `.sec` padding is 8 px and `.sec-btns` gap 4 px
  there. `--shotmodern` flag for screenshots.

- ⛔ 2.11.1 SAFETY: `mic:rename` (main.js) and `setformat` (audio-default.ps1) now require, for the RENDER
  (speaker) branch ONLY, that the device's OWN CURRENT name already starts with "Cable" before any write -
  a real speaker can never match. `mic:rename` also `break`s after the first match now (it used to loop
  every subkey). Root cause of the 09-13 "cleared my speakers" report was never confirmed (no log was
  captured) - this is defense in depth, not a proven fix. If it recurs, get SEND LOG first.

- 2.12.0 SPEAKER GUARD: `audio-default.ps1` modes `outget` / `outlist` / `outset <id>` (Render default, role
  0/1/2; outset REFUSES ids whose name+adapter match cable|voicemeeter|virtual mic|vb-audio and inactive ids).
  app.js `speakerGuard(reason)` runs at boot, on devicechange, every 5 min, and from the SOUND row's PUT BACK:
  real default -> remembered in `state.speakerId/Name`; cable default -> restore remembered or first real.
  `mic:rename` now REFUSES flow 'render' outright; NAME IT no longer renames "CABLE Input". Policy from the
  owner (09-13): the app must NEVER touch a person's speakers; keep SETUP simple (mic in, name the output).

## Traps
- Chromium hides device names until the mic permission is granted once — `unlockLabels()` does that.
- `AudioContext.setSinkId('')` = default output; `'default'` id must be mapped to `''`.
- Fit-to-window uses a ResizeObserver on `#strip` because the cable hint changes the panel height after boot.
- Compressor sidechain needs the peak follower (`compEnv`); reading raw samples under-reads GR by ~1 dB.
- electron-builder on Windows may fail extracting winCodeSign (symlink privilege). Fix = run the build
  through the elevation helper, or set `win.signAndEditExecutable=false` (loses the exe icon).
