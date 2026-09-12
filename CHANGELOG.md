# Changelog

## 2.5.0 — 2026-09-12 — honest meters, static hunt, bigger lamps
- GATE marker is now exact. The old line sat half a step too high on the IN meter. The IN meter now shows
  an OPEN line (threshold), a CLOSE line 4 dB under it (the gate closes there, so words do not stutter),
  and a white pointer = the level the gate is actually listening to. The gate listens AFTER the HI PASS /
  LO PASS filters, so rumble that lifts the IN bars does not open it; the pointer shows that truth.
- COMP tick on the IN meter shows the compressor threshold. Scale numbers and peak-hold lines use the
  same exact dB-to-pixel map as the bars.
- Static hunt: gate gain is floored to exactly 0 when closed and the signal is re-seeded after the gate,
  so long silences cannot push the filters into slow "denormal" math (a known source of crackle). Any NaN
  is caught and zeroed. The app now counts audio-thread STALLS, clock SLIPS and hard CLIPS; they show on
  the LCD next to RUN and go to the log.
- REC button (OUTPUT header): records 10 s. Left = what goes into the strip, right = what the cable gets.
  Saved next to the log; SEND LOG uploads the newest one so Claude can listen to the static.
- All on/off buttons have a bigger lamp bar (twice as tall, brighter glow), status LEDs are larger, and
  GSAP animates presses and lamp changes.
- DSP tests: 26 checks, ALL PASS.

## 2.4.0 — 2026-09-12 — crackle hunt
- RATE row in SETUP: reads the sample rate of both cable sides. When they differ (a common VB-CABLE
  setup that makes random "8-bit" crackle) or are not 48000 Hz, FIX RATE sets both to 48000 Hz 16-bit.
- Cable engine now uses a roomier output buffer (fewer dropouts when the PC is busy). Headphone monitor
  stays snappy.
- Meter drawing is cheaper (no per-segment glow), so a weak PC has more room for the audio.
- Gate hysteresis widened to 6 dB so words do not stutter at the threshold.
- Device rates are written to the log at every start (SEND LOG shows them).

## 2.3.2 — 2026-09-12
- Save your own presets: SAVE button next to PRESET asks for a name and keeps the settings under
  "MY PRESETS" in the list. Same name = replace. DEL removes the selected one.
- A preset never carries the fader, PHONES level or MUTE, so loading one does not jump your volume.

## 2.3.1 — 2026-09-12
- RANGE now defaults to FULL, so a closed gate means silence. Untouched old settings (20 or 40 dB) are
  moved to FULL once, with a note on the screen. Turn RANGE down only if you want a softer gate.

## 2.3.0 — 2026-09-12
- Gate bites harder: EXP mode is now a steep 1:4 slope (5 dB under the line = 15 dB cut) instead of 1:2.
- RANGE goes to FULL (dead silent) instead of stopping at 60 dB. New-install default is 40 dB.
- Live "CUTTING n dB" readout under the gate lamps shows exactly how much is being removed right now.

## 2.2.5 — 2026-09-12
- GATE marker on the IN meter: a dashed line with an arrow at the gate threshold. Amber while the gate
  is open, red while it is closed. Moves with the THRESHOLD knob and LEARN.

## 2.2.4 — 2026-09-12
- Log file: every LCD message, device list, button result, PowerShell result, updater event and error
  goes to %APPDATA%\OnFleek Channel Strip\strip.log (rotates at 1 MB). Tray menu: "Show log file".
- SEND LOG button in the top rail: posts the log to windows.onfleek.live with your OnFleek PIN (asked
  once, saved on this PC only) so Claude can read it without you copying anything.

## 2.2.3 — 2026-09-12
- The name "Virtual Mic Out" only counts when it sits on the cable the app actually feeds (same maker).
  A leftover copy on another maker's device (for example Voicemeeter) is called out as a stray, and
  NAME IT renames it to "Unused Virtual Mic" before naming the right one.
- MAKE DEFAULT and the APPS check now match by maker too, so Windows cannot point at the wrong twin.
- MIC IN and HEADPHONES lists no longer offer any Voicemeeter or cable devices.

## 2.2.2 — 2026-09-12
- NAME IT and MAKE DEFAULT now understand coded device names ("@driver.inf,%key%;Name") that VB-Audio
  drivers store in Windows. NAME IT on a Voicemeeter or VB-CABLE device no longer says "not found".
- When a name really is missing, the LCD lists what Windows has and points to INSTALL CABLE.

## 2.2.1 — 2026-09-12
- SETUP rows now speak in full sentences and wrap instead of being cut off.
- Voicemeeter's cable no longer counts as "done": it only carries sound while Voicemeeter is open, so the
  row stays amber and INSTALL CABLE stays available for the simple VB-CABLE.
- ZOOM row is now APPS; TO ZOOM lamp is now TO APPS (Meet, Zoom, Webex all work the same way).

## 2.2.0 — 2026-09-12 — desktop layout
- New side-by-side layout: five columns (SETUP+OUTPUT, INPUT+GATE, COMPRESSOR+DE-ESSER, EQUALIZER,
  METERS+FADER) fill the whole window. No more black borders. Built for a PC screen, not phones.
- Every label, value and button is bigger. Knobs, meters and the EQ curve are larger too.
- Window opens at 1560 x 800 and only zooms down if you make it smaller than that.
- Spelling: EQUALIZER.

## 2.1.0 — 2026-09-12
- DE-ESSER section (after the compressor): FREQ + AMOUNT knobs, SSS lamp and dB readout. Tames sharp "s".
- SET LEVEL button: talk normally for 5 s and TRIM moves so your loudest bits land near -10 dBFS.
- NR button: Windows' own noise cleanup on the mic capture (fans, hum, hiss). Reopens the mic.
- Level verdict under the meters: LEVEL: GOOD / A BIT QUIET / TOO QUIET / A BIT HOT / TOO LOUD, plus a
  green target zone (-20 to -6 dBFS) drawn on the OUT meter.
- Mic safety: after MAKE DEFAULT, quitting the app hands the Windows default mic back to your real mic,
  and the next start takes it over again. Nothing goes silent while the app is closed.

## 2.0.0 — 2026-09-12 — the one-stop shop (Voicemeeter replacement)
- SETUP checklist with three lamps: CABLE installed, NAME (Windows calls it "Virtual Mic Out"),
  ZOOM (Windows default mic = Virtual Mic Out, so Zoom / Webex / Teams need no clicks). Each row has
  its own one-press button: INSTALL CABLE, NAME IT, MAKE DEFAULT.
- No more SEND TO dropdown. The app finds the cable by itself. Its mic side is never offered as MIC IN
  and the cable is never offered as HEADPHONES, so you cannot wire a loop.
- HEADPHONES: pick your headphones, press MON, turn the PHONES knob. A second engine feeds your ears
  with the same processing while the first feeds callers. Both at once, no extra delay.
- TO ZOOM lamp in the OUTPUT section shows the cable name and goes dark when muted or no cable.
- NAME IT now renames both sides of the cable ("Virtual Mic Out" for apps, "Virtual Mic Feed" in the
  speakers list) so the Windows sound panel reads plainly too.
- With no cable, the main engine is silent (never the speakers); meters still work.

## 1.3.1 — 2026-09-12
- UPDATE button in the top rail, always visible. Checks on every launch and once an hour; click it to check
  now. Reads CHECKING… / UP TO DATE / DOWNLOADING 42% / RESTART TO UPDATE (portable: GET vX.Y.Z).

## 1.3.0 — 2026-09-12
- NAME IT button: renames the cable's recording side to "Virtual Mic Out" so Zoom / Webex / Discord list
  that exact name. No admin prompt (opens the registry key asking for SetValue only).
- MUTE button + global hotkey Ctrl+Shift+M (works while any app has focus); tray menu shows the state.
- LEARN button: listen to 2 s of room noise and set the gate threshold 8 dB above it.
- LIM: 1 ms look-ahead safety limiter at -1 dBFS on the output, with a lamp when it works.
- Live EQ response curve (filters + 4 bands) drawn above the EQ knobs.
- Lives in the tray: X hides the window and keeps processing; tray menu = Show / Mute / Start with
  Windows / Quit. BOOT button = start with Windows, hidden. Auto-reconnect when the mic drops.

## 1.2.0 — 2026-09-12
- Fix: device dropdown lists were dark text on a dark box. Now light text, dark list.
- Self-update: the installed app downloads new versions from GitHub in the background and shows
  "RESTART TO UPDATE". The portable exe shows "GET IT" and opens the download page.
- Voicemeeter counts as a cable: SEND TO auto-picks "Voicemeeter Input" when VB-CABLE is absent, and
  the panel shows which mic to pick in other apps (CABLE Output / Voicemeeter Out B1).

## 1.1.0 — 2026-09-12
- INSTALL CABLE button: fetches the official VB-CABLE package from vb-audio.com, unpacks it and opens
  its setup (one admin "Yes", click "Install Driver", restart). The app then picks CABLE Input itself.
- VB-CABLE is NOT bundled: its license forbids folding it into another installer, and no open-source,
  Microsoft-signed cable exists to bundle instead.

## 1.0.0 — 2026-09-12
- First release. SSL-style vocal channel strip for a USB mic on Windows.
- Signal flow: mic → trim → high/low-pass filters → gate/expander → compressor → 4-band EQ → fader → output.
- Filters: 18 dB/oct high-pass (20–500 Hz), 12 dB/oct low-pass (3–20 kHz).
- Gate/expander: threshold, range, attack, hold, release, EXP (1:2) or hard gate, OPEN / REDUCE lamps.
- Compressor: threshold, ratio, attack, release, make-up, mix, 6 dB soft knee, gain-reduction meter + readout.
- EQ: HF shelf/bell, HMF bell with Q, LMF bell with Q, LF shelf/bell.
- Input/output peak meters with peak hold and CLIP lamps, main fader, section IN buttons, master BYPASS.
- Presets: Voice, Podcast, Broadcast, Streaming, Flat. Settings auto-save and restore.
- LISTEN button routes output to the default speakers/headphones for tuning.
- Detects VB-CABLE and points to the free download if missing. Checks GitHub for new versions.
