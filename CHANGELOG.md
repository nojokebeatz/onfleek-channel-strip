# Changelog

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
