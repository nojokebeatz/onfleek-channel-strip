# Changelog

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
