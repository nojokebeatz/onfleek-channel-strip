# Changelog

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
