/* OnFleek Channel Strip — front panel logic */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const log = (m) => { try { window.cs.log(m); } catch {} };
window.addEventListener('error', e => log('JS ERROR ' + (e.message || '') + ' @' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', e => log('JS REJECTION ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dB = (g) => 20 * Math.log10(Math.max(g, 1e-6));

/* ---------- parameter specs ---------- */
const hz = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' kHz' : Math.round(v) + ' Hz';
const ms = v => v >= 1000 ? (v / 1000).toFixed(2) + ' s' : (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ms';
const dbs = v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
const P = {
  trim:        { min: -20, max: 20, def: 0, fmt: dbs, center: true },
  hpf:         { min: 20, max: 500, def: 80, log: true, fmt: hz },
  lpf:         { min: 3000, max: 20000, def: 18000, log: true, fmt: hz },
  gateThresh:  { min: -70, max: 0, def: -45, fmt: v => v.toFixed(0) + ' dB' },
  gateRange:   { min: 0, max: 80, def: 80, fmt: v => v >= 79 ? 'FULL' : '-' + v.toFixed(0) + ' dB' },
  gateAttack:  { min: 0.1, max: 100, def: 1, log: true, fmt: ms },
  gateHold:    { min: 1, max: 500, def: 50, log: true, fmt: ms },
  gateRelease: { min: 10, max: 3000, def: 150, log: true, fmt: ms },
  compThresh:  { min: -60, max: 0, def: -18, fmt: v => v.toFixed(0) + ' dB' },
  compRatio:   { min: 1, max: 20, def: 3, log: true, fmt: v => v.toFixed(1) + ' : 1' },
  compAttack:  { min: 0.1, max: 100, def: 10, log: true, fmt: ms },
  compRelease: { min: 20, max: 4000, def: 150, log: true, fmt: ms },
  compMakeup:  { min: 0, max: 24, def: 4, fmt: v => '+' + v.toFixed(1) + ' dB' },
  compMix:     { min: 0, max: 100, def: 100, fmt: v => v.toFixed(0) + ' %' },
  hfFreq:      { min: 1500, max: 20000, def: 12000, log: true, fmt: hz },
  hfGain:      { min: -15, max: 15, def: 1.5, fmt: dbs, center: true },
  hmfFreq:     { min: 600, max: 7000, def: 3000, log: true, fmt: hz },
  hmfGain:     { min: -15, max: 15, def: 1.5, fmt: dbs, center: true },
  hmfQ:        { min: 0.4, max: 4, def: 1, log: true, fmt: v => 'Q ' + v.toFixed(2) },
  lmfFreq:     { min: 200, max: 2000, def: 300, log: true, fmt: hz },
  lmfGain:     { min: -15, max: 15, def: -1.5, fmt: dbs, center: true },
  lmfQ:        { min: 0.4, max: 4, def: 1, log: true, fmt: v => 'Q ' + v.toFixed(2) },
  lfFreq:      { min: 30, max: 450, def: 100, log: true, fmt: hz },
  lfGain:      { min: -15, max: 15, def: 1, fmt: dbs, center: true },
  phones:      { min: -40, max: 6, def: 0, fmt: v => v <= -39.5 ? '-∞ dB' : dbs(v), center: true },
  deFreq:      { min: 2500, max: 12000, def: 6500, log: true, fmt: hz },
  deAmt:       { min: 0, max: 100, def: 40, fmt: v => v.toFixed(0) + ' %' }
};
const TOG = { filtersIn: 1, gateIn: 1, gateExp: 1, compIn: 1, eqIn: 1, hfBell: 0, lfBell: 0, bypass: 0, mute: 0, limIn: 1, deIn: 1, deListen: 0, compAuto: 0 };

const DEFAULT_PARAMS = () => {
  const o = {}; for (const k in P) o[k] = P[k].def; Object.assign(o, TOG); o.fader = 0; return o;
};
const PRESETS = {
  'Voice – Natural': {},
  'Podcast – Warm': { hpf: 70, gateThresh: -50, gateRange: 15, compThresh: -20, compRatio: 2.5, compAttack: 15, compRelease: 200, compMakeup: 5,
    lfFreq: 110, lfGain: 2, lmfFreq: 350, lmfGain: -2, lmfQ: 1.2, hmfFreq: 3000, hmfGain: 2, hmfQ: 0.9, hfFreq: 10000, hfGain: 1 },
  'Broadcast – Punchy': { hpf: 90, gateThresh: -45, gateRange: 25, compThresh: -24, compRatio: 4, compAttack: 5, compRelease: 120, compMakeup: 8,
    lfFreq: 90, lfGain: 1, lmfFreq: 400, lmfGain: -3, lmfQ: 1.4, hmfFreq: 3500, hmfGain: 3, hmfQ: 0.8, hfFreq: 12000, hfGain: 2.5 },
  'Streaming – Tight Gate': { hpf: 100, gateExp: 0, gateThresh: -38, gateRange: 40, gateAttack: 0.5, gateHold: 80, gateRelease: 100,
    compThresh: -20, compRatio: 3, compAttack: 8, compRelease: 150, compMakeup: 6, lmfFreq: 300, lmfGain: -2, hmfFreq: 4000, hmfGain: 2, hfFreq: 12000, hfGain: 2 },
  'Flat (all out)': { filtersIn: 0, gateIn: 0, compIn: 0, eqIn: 0, hpf: 20, lpf: 20000, hfGain: 0, hmfGain: 0, lmfGain: 0, lfGain: 0, compMakeup: 0, trim: 0, fader: 0 }
};

/* ---------- state ---------- */
const state = { params: DEFAULT_PARAMS(), inputId: '', outputId: '', phonesId: '', mon: 0, nr: 0, wantDefault: 0, prevDefaultMic: '', logPin: '', rangeMigrated: 0, userPresets: {}, preset: 'Voice – Natural', fast: 0, locked: false, compact: 0 };
let ctx = null, node = null, stream = null, running = false, version = '0.0.0';
let monCtx = null, monNode = null, monStream = null, monGain = null, lastOuts = [], setupTimer = 0, defaults = null, prevDefault = '';
let learning = false, runLcd = 'STANDBY', reconnectTimer = 0, lastIns = [], formats = null;
const meter = { inPk: 0, outPk: 0, gr: 0, gateRed: 0, gateOpen: false, lim: 0, de: 0, gateLvl: -120, clips: 0, nans: 0, t: 0 };
const GATE_HYST = 4;   // must match HYST in the worklet
// Health counters: audio-thread stalls, clock slips, hard clips. Shown on the LCD, written to the log.
const health = { hiccups: 0, clips: 0, nans: 0, lastT: 0, wall: 0, ct: 0 };
const healthText = () => (health.hiccups ? ` · ${health.hiccups} STALLS` : '') + (health.clips ? ` · ${health.clips} CLIPS` : '');
let leveling = false, recTimer = 0, take = null, playing = false;
const ab = { other: null, slot: 'A' };
const SHARE_URL = 'https://github.com/nojokebeatz/onfleek-channel-strip/releases/latest';
const presetOnly = (p) => { const o = Object.assign({}, p); NOT_IN_PRESET.forEach(k => delete o[k]); return o; };
/* V4: boot animation. Sections rise in, knob caps sweep from the left stop to their setting. */
function bootAnimation() {
  if (!window.gsap) return;
  gsap.fromTo('.sec', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.05, ease: 'power2.out', clearProps: 'transform,opacity' });
  $$('.knob .cap').forEach((cap, i) => {
    const target = cap.style.getPropertyValue('--rot') || '0deg';
    gsap.fromTo(cap, { '--rot': '-150deg' }, { '--rot': target, duration: 0.7, delay: 0.15 + i * 0.02, ease: 'power3.out' });
  });
}
const REC_SECS = 15;
function wavStereo16(l, r, sr) {
  const n = l.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
  const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
  let o = 44; for (let i = 0; i < n; i++) { v.setInt16(o, Math.max(-1, Math.min(1, l[i])) * 32767, true); v.setInt16(o + 2, Math.max(-1, Math.min(1, r[i])) * 32767, true); o += 4; }
  return buf;
}
async function finishRecording(d) {
  clearInterval(recTimer); $('#btnRec').classList.remove('on');
  take = d.inBuf; $('#btnPlay').disabled = false;
  if (monNode) monNode.port.postMessage({ type: 'take', buf: take.slice() });
  try { const name = await window.cs.saveCapture(new Uint8Array(wavStereo16(d.inBuf, d.outBuf, d.sr))); log('capture saved ' + name + ' sr=' + d.sr); flashLcd('RECORDED · PRESS PLAY TO HEAR IT · SEND LOG SENDS IT TO CLAUDE', 6000); }
  catch (e) { lcd('CAPTURE FAILED: ' + (e.message || e), true); }
}
/* ---------- COMPACT mode ---------- */
const cCv = $('#cMeters'), cG = cCv.getContext('2d');
async function setCompact(on) {
  state.compact = !!on; save();
  $('#strip').hidden = state.compact; $('#compact').hidden = !state.compact;
  await window.cs.compact(state.compact);
  if (!state.compact) { fit(); renderAll(); } else { syncCompact(); }
  log('compact ' + (state.compact ? 'on' : 'off'));
}
function syncCompact() {
  if (!state.compact) return;
  $('#cMute').classList.toggle('on', !!state.params.mute); $('#cBypass').classList.toggle('on', !!state.params.bypass);
  $('#cMon').classList.toggle('on', !!state.mon); $('#cLock').classList.toggle('on', !!state.locked);
  const cp = $('#cPreset'); if (cp.innerHTML !== $('#selPreset').innerHTML) cp.innerHTML = $('#selPreset').innerHTML; cp.value = $('#selPreset').value;
  $('#cLcd').textContent = $('#lcd').textContent; $('#cLcd').className = 'c-lcd lcdsmall ' + ($('#lcd').classList.contains('err') ? 'loud' : '');
}
function drawCompactMeters() {
  const W = cCv.width, H = cCv.height, pad = 46, barW = W - pad - 8;
  cG.clearRect(0, 0, W, H); cG.font = '800 11px Bahnschrift, "Arial Narrow", sans-serif'; cG.textAlign = 'left';
  const rows = [['IN', disp.in, disp.inHold, false], ['OUT', disp.out, disp.outHold, true]];
  rows.forEach(([name, lvl, hold, target], i) => {
    const y = 6 + i * 26, h = 18;
    cG.fillStyle = '#c9c7bc'; cG.fillText(name, 4, y + 14);
    cG.fillStyle = '#151618'; cG.fillRect(pad, y, barW, h);
    if (target) { const x1 = pad + barW * (TARGET_LO + 60) / 60, x2 = pad + barW * (TARGET_HI + 60) / 60; cG.fillStyle = 'rgba(76,255,106,.12)'; cG.fillRect(x1, y, x2 - x1, h); }
    const segs = 40, sw = barW / segs;
    for (let k = 0; k < segs; k++) { const d = -60 + k * 1.5, lit = lvl >= d; cG.fillStyle = segColor(d, lit); cG.fillRect(pad + k * sw + 1, y + 2, sw - 2, h - 4); }
    if (hold > -60) { const x = pad + barW * clamp((hold + 60) / 60, 0, 1); cG.fillStyle = '#fff'; cG.fillRect(x - 1, y, 2, h); }
    if (name === 'IN' && state.params.gateIn && !state.params.bypass) { const x = pad + barW * clamp((state.params.gateThresh + 60) / 60, 0, 1); cG.fillStyle = meter.gateOpen && running ? '#ffb02e' : '#ff5a4e'; cG.fillRect(x - 1, y - 2, 2, h + 4); }
  });
  cG.fillStyle = '#8f8d84'; cG.font = '600 9px Bahnschrift, "Arial Narrow", sans-serif'; cG.textAlign = 'center';
  [-60, -40, -30, -18, -12, -6, 0].forEach(d => cG.fillText(d === 0 ? '0' : String(-d), pad + barW * (d + 60) / 60, H - 1));
}
/* ---------- lamps: every on/off button gets a real lamp element; GSAP animates state changes ---------- */
function setupLamps() {
  $$('.tog').forEach(b => { if (!$('.lamp', b)) { const l = document.createElement('i'); l.className = 'lamp'; b.prepend(l); } if (b.dataset.lamp) b.style.setProperty('--lamp', b.dataset.lamp); b._on = b.classList.contains('on'); });
  if (!window.gsap) return;
  const lampColor = (b) => (b.dataset.lamp || getComputedStyle(b).getPropertyValue('--lamp') || '#ffb02e').trim();
  const animateToggle = (b, on) => {
    const lamp = $('.lamp', b), c = lampColor(b);
    gsap.killTweensOf(b); gsap.to(b, { y: on ? 1 : 0, duration: 0.12, ease: 'power2.out' });
    if (!lamp) return; gsap.killTweensOf(lamp);
    if (on) {
      gsap.fromTo(lamp, { scaleX: 1, scaleY: 1 }, { scaleX: 1.25, scaleY: 1.9, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out' });
      gsap.fromTo(lamp, { boxShadow: `0 0 2px ${c}` }, { boxShadow: `0 0 16px ${c}, 0 0 4px rgba(255,255,255,.8)`, duration: 0.45, ease: 'power2.out', clearProps: 'boxShadow' });
    } else {
      gsap.fromTo(lamp, { boxShadow: `0 0 12px ${c}` }, { boxShadow: '0 0 0px rgba(0,0,0,0)', duration: 0.35, ease: 'power2.out', clearProps: 'boxShadow' });
    }
  };
  const animateLed = (led, on) => { gsap.killTweensOf(led); if (on) gsap.fromTo(led, { scale: 1 }, { scale: 1.7, duration: 0.11, yoyo: true, repeat: 1, ease: 'power2.out' }); else gsap.fromTo(led, { scale: 1.15 }, { scale: 1, duration: 0.18, ease: 'power2.out' }); };
  const obs = new MutationObserver(muts => muts.forEach(m => {
    const el = m.target, on = el.classList.contains('on');
    if (el._on === on) return; el._on = on;
    if (el.classList.contains('tog')) animateToggle(el, on); else animateLed(el, on);
  }));
  $$('.tog, .led').forEach(el => { el._on = el.classList.contains('on'); obs.observe(el, { attributes: true, attributeFilter: ['class'] }); });
  // press feel on click, before the state flips
  $$('.tog').forEach(b => b.addEventListener('pointerdown', () => gsap.fromTo(b, { scale: 0.96 }, { scale: 1, duration: 0.22, ease: 'back.out(3)' })));
}

const toNorm = (spec, v) => spec.log ? Math.log(v / spec.min) / Math.log(spec.max / spec.min) : (v - spec.min) / (spec.max - spec.min);
const fromNorm = (spec, n) => { n = clamp(n, 0, 1); return spec.log ? spec.min * Math.pow(spec.max / spec.min, n) : spec.min + (spec.max - spec.min) * n; };

/* ---------- knobs ---------- */
function ticksSVG(spec) {
  let s = '<svg viewBox="0 0 66 66">';
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (-150 + i * 30) * Math.PI / 180, big = i === 0 || i === N - 1 || (spec.center && i === 5);
    const r1 = big ? 26 : 28, r2 = 31.5;
    s += `<line x1="${33 + Math.sin(a) * r1}" y1="${33 - Math.cos(a) * r1}" x2="${33 + Math.sin(a) * r2}" y2="${33 - Math.cos(a) * r2}" stroke="${big ? '#dedbd0' : '#8b8980'}" stroke-width="${big ? 1.6 : 1}" stroke-linecap="round"/>`;
  }
  return s + '</svg>';
}
const knobEls = {};
function buildKnob(el) {
  const id = el.dataset.knob, spec = P[id];
  el.innerHTML = `<div class="ring">${ticksSVG(spec)}</div><div class="body"><div class="cap"><div class="ptr"></div></div></div><div class="lbl">${el.dataset.label}</div><div class="val"></div>`;
  const body = $('.body', el), cap = $('.cap', el), val = $('.val', el);
  knobEls[id] = { el, cap, val, spec };
  const set = (v, fromUser) => { if (fromUser && state.locked) { flashLcd('PANEL LOCKED', 800); return; } if (fromUser && id === 'compMakeup' && state.params.compAuto) { state.params.compAuto = 0; renderToggle('compAuto'); } state.params[id] = v; renderKnob(id); if (fromUser) changed(id === 'phones'); };
  let lastY = 0, dragging = false;
  body.addEventListener('pointerdown', e => { dragging = true; lastY = e.clientY; body.setPointerCapture(e.pointerId); el.classList.add('active'); e.preventDefault(); });
  body.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = lastY - e.clientY; lastY = e.clientY;
    const n = toNorm(spec, state.params[id]) + dy / currentScale() / 180 * (e.shiftKey ? 0.15 : 1);
    set(fromNorm(spec, n), true);
  });
  const end = e => { dragging = false; el.classList.remove('active'); };
  body.addEventListener('pointerup', end); body.addEventListener('pointercancel', end);
  body.addEventListener('dblclick', () => set(spec.def, true));
  val.title = 'Double-click to type a number'; val.style.cursor = 'text';
  val.addEventListener('dblclick', () => { // type the exact number
    if (state.locked || $('input', val)) return;
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'typein'; inp.value = String(state.params[id]);
    val.textContent = ''; val.appendChild(inp); inp.focus(); inp.select();
    const done = (apply) => { const v = parseFloat(inp.value.replace(',', '.')); if (apply && !isNaN(v)) set(clamp(v, spec.min, spec.max), true); else renderKnob(id); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); e.stopPropagation(); });
    inp.addEventListener('blur', () => { if (inp.isConnected) done(true); });
  });
  el.addEventListener('wheel', e => { e.preventDefault(); const n = toNorm(spec, state.params[id]) - Math.sign(e.deltaY) * (e.shiftKey ? 0.004 : 0.02); set(fromNorm(spec, n), true); }, { passive: false });
}
function renderKnob(id) {
  const k = knobEls[id]; if (!k) return;
  const n = toNorm(k.spec, state.params[id]);
  k.cap.style.setProperty('--rot', (-150 + 300 * n).toFixed(2) + 'deg');
  k.val.textContent = k.spec.fmt(state.params[id]);
}

/* ---------- toggles ---------- */
const togEls = {};
function buildToggle(btn) {
  const id = btn.dataset.tog; togEls[id] = btn;
  if (btn.dataset.lamp) btn.style.setProperty('--lamp', btn.dataset.lamp);
  btn.addEventListener('click', () => { if (state.locked && id !== 'mute') { flashLcd('PANEL LOCKED', 800); return; } state.params[id] = state.params[id] ? 0 : 1; renderToggle(id); changed(id === 'mute'); });
}
const SEC_OF = { filtersIn: '.sec-input', gateIn: '.sec-gate', compIn: '.sec-comp', deIn: '.sec-de', eqIn: '.sec-eq' };
function renderToggle(id) {
  togEls[id] && togEls[id].classList.toggle('on', !!state.params[id]);
  if (SEC_OF[id]) $(SEC_OF[id]).classList.toggle('off', !state.params[id]);
  if (id === 'bypass') $$('.sec-input,.sec-gate,.sec-comp,.sec-de,.sec-eq').forEach(e => e.classList.toggle('byp', !!state.params.bypass));
  if (id === 'mute') { window.cs.muteState(!!state.params.mute); if (window.cs.onTrayMute) window.cs.onTrayMute(!!state.params.mute); if (lastOuts) renderSetup(); }
}

/* ---------- fader ---------- */
const FADER_ANCHORS = [[0, -90], [0.08, -60], [0.16, -40], [0.26, -30], [0.38, -20], [0.5, -10], [0.62, -5], [0.75, 0], [1, 10]];
function faderPosToDb(p) {
  for (let i = 1; i < FADER_ANCHORS.length; i++) { const [p0, d0] = FADER_ANCHORS[i - 1], [p1, d1] = FADER_ANCHORS[i]; if (p <= p1) return d0 + (d1 - d0) * (p - p0) / (p1 - p0); }
  return 10;
}
function faderDbToPos(d) {
  for (let i = 1; i < FADER_ANCHORS.length; i++) { const [p0, d0] = FADER_ANCHORS[i - 1], [p1, d1] = FADER_ANCHORS[i]; if (d <= d1) return p0 + (p1 - p0) * (d - d0) / (d1 - d0); }
  return 1;
}
const TRACK_TOP = 10, TRACK_H = 230;
function buildFader() {
  const scale = $('#fscale');
  [[10, '+10'], [5, '+5'], [0, '0'], [-5, '5'], [-10, '10'], [-20, '20'], [-30, '30'], [-40, '40'], [-60, '60'], [-90, '∞']].forEach(([d, t]) => {
    const s = document.createElement('span'); s.textContent = t; s.style.top = ((1 - faderDbToPos(d)) * TRACK_H) + 'px'; if (d === 0) s.className = 'zero'; scale.appendChild(s);
  });
  const cap = $('#fcap'), fader = $('#fader');
  const det = document.createElement('i'); det.className = 'detent'; det.style.top = (TRACK_TOP + (1 - faderDbToPos(0)) * TRACK_H) + 'px'; fader.appendChild(det);
  let dragging = false, lastY = 0;
  cap.addEventListener('pointerdown', e => { dragging = true; lastY = e.clientY; cap.setPointerCapture(e.pointerId); cap.classList.add('active'); e.preventDefault(); });
  cap.addEventListener('pointermove', e => {
    if (!dragging) return;
    const s = currentScale(); const dy = (lastY - e.clientY) / s; lastY = e.clientY;
    if (state.locked) return;
    const p = clamp(faderDbToPos(state.params.fader) + dy / TRACK_H * (e.shiftKey ? 0.2 : 1), 0, 1);
    state.params.fader = faderPosToDb(p); renderFader(); changed();
  });
  const end = () => { dragging = false; cap.classList.remove('active'); };
  cap.addEventListener('pointerup', end); cap.addEventListener('pointercancel', end);
  cap.addEventListener('dblclick', () => { state.params.fader = 0; renderFader(); changed(); });
  fader.addEventListener('wheel', e => { e.preventDefault(); const p = clamp(faderDbToPos(state.params.fader) - Math.sign(e.deltaY) * (e.shiftKey ? 0.004 : 0.02), 0, 1); state.params.fader = faderPosToDb(p); renderFader(); changed(); }, { passive: false });
}
function renderFader() {
  const d = state.params.fader;
  $('#fcap').style.top = (TRACK_TOP + (1 - faderDbToPos(d)) * TRACK_H) + 'px';
  $('#faderVal').textContent = d <= -89 ? '-∞ dB' : (d > 0 ? '+' : '') + d.toFixed(1) + ' dB';
}

/* ---------- render all / change plumbing ---------- */
function renderAll() { fillPresetList(); for (const id in knobEls) renderKnob(id); for (const id in togEls) renderToggle(id); renderFader(); $('#selPreset').value = presetValid(state.preset) ? state.preset : ''; $('#btnDelPreset').hidden = !isUserPreset(state.preset); drawCurve(); }
let sendPending = false, saveTimer = 0;
/* ---------- undo / redo (Ctrl+Z / Ctrl+Y): every settings change is a snapshot ---------- */
const hist = { past: [], future: [], last: '', t: 0 };
function snap() {
  const now = JSON.stringify(state.params);
  if (now === hist.last) return;
  // knob drags fire many times a second: merge changes closer than 400 ms into one undo step
  if (hist.last && (Date.now() - hist.t > 400 || !hist.past.length)) { hist.past.push(hist.last); if (hist.past.length > 60) hist.past.shift(); hist.future.length = 0; }
  hist.last = now; hist.t = Date.now();
}
function restore(json) { state.params = Object.assign(DEFAULT_PARAMS(), JSON.parse(json)); hist.last = json; renderAll(); changed(true); }
function undo() { if (!hist.past.length) return flashLcd('NOTHING TO UNDO', 1200); hist.future.push(hist.last); restore(hist.past.pop()); flashLcd('UNDO', 1000); }
function redo() { if (!hist.future.length) return flashLcd('NOTHING TO REDO', 1200); hist.past.push(hist.last); restore(hist.future.pop()); flashLcd('REDO', 1000); }
function changed(keepPreset) {
  snap();
  if (!keepPreset && state.preset !== '') { state.preset = ''; $('#selPreset').value = ''; $('#btnDelPreset').hidden = true; }
  if (!sendPending) { sendPending = true; requestAnimationFrame(() => { sendPending = false; sendParams(); drawCurve(); }); }
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 400);
}
function autoMakeup() { // AUTO: lift by about half of what the compressor takes off a loud word
  const p = state.params; if (!p.compAuto || !p.compIn) return;
  const v = clamp(Math.round(-p.compThresh * (1 - 1 / p.compRatio) * 0.5), P.compMakeup.min, P.compMakeup.max);
  if (v !== p.compMakeup) { p.compMakeup = v; renderKnob('compMakeup'); }
}
function sendParams() {
  autoMakeup();
  if (node) node.port.postMessage({ type: 'params', p: Object.assign({}, state.params, { deListen: 0 }) });   // callers never get LISTEN
  if (monNode) monNode.port.postMessage({ type: 'params', p: state.params });
  if (monGain) monGain.gain.setTargetAtTime(phonesGain(), monCtx.currentTime, 0.01);
}
function save() { window.cs.saveState(state).catch(() => {}); }

/* ---------- presets ---------- */
// Presets: factory ones from PRESETS, plus your own saved under "MY PRESETS" (select value "u:<name>").
const NOT_IN_PRESET = ['phones', 'mute', 'fader', 'deListen'];   // per-session things a preset should not drag along
const isUserPreset = (v) => typeof v === 'string' && v.startsWith('u:');
const presetValid = (v) => (v in PRESETS) || (isUserPreset(v) && state.userPresets && (v.slice(2) in state.userPresets));
function presetParams(v) { return v in PRESETS ? PRESETS[v] : (state.userPresets[v.slice(2)] || {}); }
function fillPresetList() {
  const sel = $('#selPreset'); const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const mine = Object.keys(state.userPresets || {}).sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<optgroup label="BUILT IN">' + Object.keys(PRESETS).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') + '</optgroup>'
    + (mine.length ? '<optgroup label="MY PRESETS">' + mine.map(n => `<option value="u:${esc(n)}">${esc(n)}</option>`).join('') + '</optgroup>' : '')
    + '<option value="">Custom (unsaved)</option>';
  sel.value = presetValid(state.preset) ? state.preset : '';
  $('#btnDelPreset').hidden = !isUserPreset(sel.value);
}
function buildPresets() {
  const sel = $('#selPreset');
  fillPresetList();
  sel.addEventListener('change', () => {
    $('#btnDelPreset').hidden = !isUserPreset(sel.value);
    if (!sel.value) { state.preset = ''; save(); return; }
    const keep = {}; NOT_IN_PRESET.forEach(k => keep[k] = state.params[k]);
    state.params = Object.assign(DEFAULT_PARAMS(), presetParams(sel.value), keep); state.preset = sel.value; renderAll(); changed(true);
    log('preset loaded: ' + sel.value);
  });
  // SAVE: name it, keep it. Same name = replace.
  const nameBox = $('#nameBox'), nameInput = $('#nameInput');
  const savePreset = () => {
    const name = nameInput.value.trim().slice(0, 32); nameBox.hidden = true; if (!name) return;
    const snap = {}; for (const k in state.params) if (!NOT_IN_PRESET.includes(k)) snap[k] = state.params[k];
    const replaced = !!state.userPresets[name];
    state.userPresets[name] = snap; state.preset = 'u:' + name; fillPresetList(); save();
    flashLcd(`PRESET \u201c${name.toUpperCase()}\u201d ${replaced ? 'REPLACED' : 'SAVED'}`, 3000); log('preset saved: ' + name);
  };
  $('#btnSavePreset').onclick = () => { nameInput.value = isUserPreset(state.preset) ? state.preset.slice(2) : ''; nameBox.hidden = false; setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50); };
  $('#nameOk').onclick = savePreset; $('#nameCancel').onclick = () => { nameBox.hidden = true; };
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') nameBox.hidden = true; });
  $('#btnDelPreset').onclick = () => {
    if (!isUserPreset(state.preset)) return;
    const name = state.preset.slice(2); delete state.userPresets[name]; state.preset = ''; fillPresetList(); window.cs.saveState(Object.assign({}, state, { presetDelete: 1 })).catch(() => {});
    flashLcd(`PRESET \u201c${name.toUpperCase()}\u201d DELETED`, 3000); log('preset deleted: ' + name);
  };
}

/* ---------- audio engine ---------- */
const lcd = (t, err, quiet) => { const e = $('#lcd'); e.textContent = t; e.classList.toggle('err', !!err); if (!quiet) log((err ? 'LCD ERR: ' : 'LCD: ') + t); };
// The cable: a playback device whose sound comes back out as a microphone. VB-CABLE, or Voicemeeter's.
const CABLE_RX = /cable input|virtual mic feed|voicemeeter (aux |vaio3 )?input/i;
const MIC_NAME = 'Virtual Mic Out', FEED_NAME = 'Virtual Mic Feed';
function otherAppsMic(label) { // the mic-side name Windows gives the cable before we rename it
  label = label || '';
  if (/cable input|virtual mic feed/i.test(label)) return 'CABLE Output';
  if (/voicemeeter aux input/i.test(label)) return 'Voicemeeter Out B2';
  if (/voicemeeter vaio3 input/i.test(label)) return 'Voicemeeter Out B3';
  if (/voicemeeter input/i.test(label)) return 'Voicemeeter Out B1';
  return '';
}
const cableOut = () => lastOuts.find(d => /cable input|virtual mic feed/i.test(d.label)) || lastOuts.find(d => CABLE_RX.test(d.label));
// Which maker a device belongs to, read from the "(...)" at the end of its Windows name.
const adapterOf = (label) => { const m = String(label || '').match(/\(([^()]*)\)\s*$/); return m ? m[1].trim() : ''; };
const family = (label) => { const a = adapterOf(label); return /virtual cable/i.test(a) ? 'VB-CABLE' : /voicemeeter/i.test(a) ? 'Voicemeeter' : a; };
const familyKey = (label) => { const f = family(label); return f === 'VB-CABLE' ? 'Virtual Cable' : f; };   // substring the helper scripts match on the adapter name
const isMicName = (d) => (d.label || '').toLowerCase().startsWith(MIC_NAME.toLowerCase());
// The name only counts when it sits on the SAME cable we feed. A leftover "Virtual Mic Out" on another maker is a stray.
const micSideRenamed = () => { const cab = cableOut(); return !!cab && lastIns.some(d => isMicName(d) && family(d.label) === family(cab.label)); };
const strayMics = () => { const cab = cableOut(); return lastIns.filter(d => isMicName(d) && (!cab || family(d.label) !== family(cab.label))); };
function setCheck(id, ok, text) {
  const el = $('#' + id); el.classList.toggle('ok', !!ok); el.classList.remove('busy');
  $('.led', el).className = 'led ' + (ok ? 'green on' : 'amber on');
  $('.ck-text', el).textContent = text;
}
function renderSetup() {
  const cab = cableOut();
  // 1. CABLE
  const vm = !!cab && /voicemeeter/i.test(cab.label);
  if (cab && !vm) setCheck('ckCable', true, 'VB-CABLE installed. This is the pretend mic that carries your cleaned-up voice.');
  else if (vm) setCheck('ckCable', false, 'Using Voicemeeter’s cable for now. It only carries sound while Voicemeeter is open. Press INSTALL CABLE for the simple one that always works.');
  else setCheck('ckCable', false, 'No pretend mic yet. Press INSTALL CABLE (one time, then restart the PC).');
  $('#cableHint').hidden = !!cab;
  // 2. NAME
  const from = cab ? otherAppsMic(cab.label) : '';
  const renamed = micSideRenamed();
  if (!cab) setCheck('ckName', false, 'Waiting for the cable (row above).');
  else if (renamed) setCheck('ckName', true, `Apps now see it as “${MIC_NAME}”.`);
  else if (strayMics().length) setCheck('ckName', false, `A different device (${family(strayMics()[0].label)}) is wearing the name "${MIC_NAME}". Press NAME IT to move the name onto the ${family(cab.label)} cable.`);
  else setCheck('ckName', false, `Apps see it as "${from}". Press NAME IT to call it "${MIC_NAME}".`);
  $('#btnName').dataset.from = from; $('#btnName').disabled = !cab;
  // 3. ZOOM (Windows default mic)
  const want = renamed ? MIC_NAME : from;
  if (!cab) setCheck('ckDefault', false, 'Waiting for the cable (top row).');
  else if (!defaults) setCheck('ckDefault', false, 'Checking Windows…');
  else if (defaults.error) setCheck('ckDefault', false, 'Could not read the Windows default mic');
  else {
    const all = [defaults.console, defaults.multimedia, defaults.communications];
    const cabFam = family(cab.label);
    const fams = [defaults.consoleAdapter, defaults.multimediaAdapter, defaults.communicationsAdapter].map(a => family('(' + (a || '') + ')'));
    const isUs = want && all.every(n => (n || '') === want) && (!renamed || fams.every(f => f === cabFam));
    if (isUs) setCheck('ckDefault', true, `Windows default mic = “${want}”. Meet / Zoom / Webex use it on their own.`);
    else {
      const cur = defaults.communications || defaults.console || 'none';
      const curFam = family('(' + (defaults.communicationsAdapter || defaults.consoleAdapter || '') + ')');
      if (cur === want && curFam !== cabFam) setCheck('ckDefault', false, `Windows points at a different "${want}" (${curFam}), not the ${cabFam} one. Press MAKE DEFAULT to fix.`);
      else setCheck('ckDefault', false, `Windows default mic is still "${cur}". Press MAKE DEFAULT so Meet / Zoom pick the strip by themselves.`);
    }
  }
  $('#btnDefault').disabled = !cab;
  // 4. RATE: both sides of the cable must run at the same sample rate, or the cable crackles ("8-bit" blips)
  renderFormatRow(cab);
  // TO ZOOM lamp + name in the OUTPUT section
  $('#ledZoom').classList.toggle('on', !!cab && running && !state.params.mute);
  $('#zoomText').textContent = cab ? (renamed ? MIC_NAME : from) : 'NO CABLE \u00b7 SEE SETUP';
}
const CABLE_RATE = 48000;
function cableFormats(cab) {
  if (!cab || !Array.isArray(formats)) return null;
  const fam = family(cab.label);
  const side = (flow) => formats.find(f => f.flow === flow && family('(' + (f.adapter || '') + ')') === fam);
  return { feed: side('Render'), mic: side('Capture') };
}
function renderFormatRow(cab) {
  const el = $('#ckFormat'); if (!el) return;
  if (!cab) { setCheck('ckFormat', false, 'Waiting for the cable (top row).'); $('#btnFormat').disabled = true; return; }
  if (!Array.isArray(formats)) { setCheck('ckFormat', false, formats && formats.error ? 'Could not read the cable\u2019s rates.' : 'Checking rates\u2026'); $('#btnFormat').disabled = true; return; }
  const cf = cableFormats(cab);
  const feed = cf.feed && cf.feed.rate ? cf.feed : null, mic = cf.mic && cf.mic.rate ? cf.mic : null;
  const appRate = ctx ? ctx.sampleRate : 0;
  $('#btnFormat').disabled = false;
  if (!feed || !mic) { setCheck('ckFormat', false, `Windows has not written a rate for the cable yet (feed ${feed ? feed.rate : '?'} / mic ${mic ? mic.rate : '?'}). Press FIX RATE to set both to ${CABLE_RATE} Hz.`); return; }
  const same = feed.rate === mic.rate && feed.bits === mic.bits;
  if (same && feed.rate === CABLE_RATE) { setCheck('ckFormat', true, `Cable runs at ${feed.rate} Hz, ${feed.bits}-bit on both sides. App engine: ${appRate || '?'} Hz.`); return; }
  if (same) { setCheck('ckFormat', false, `Cable runs at ${feed.rate} Hz on both sides. ${CABLE_RATE} Hz is the safest for Meet / Zoom. Press FIX RATE.`); return; }
  setCheck('ckFormat', false, `The two cable sides do not match (feed ${feed.rate} Hz ${feed.bits}-bit, mic ${mic.rate} Hz ${mic.bits}-bit). That makes crackle. Press FIX RATE to set both to ${CABLE_RATE} Hz.`);
}
async function refreshFormats() { formats = await window.cs.audioFormats(); log('formats: ' + JSON.stringify(formats)); renderSetup(); }
async function refreshDefaults() { defaults = await window.cs.audioDefaults(); log('windows default mic: ' + JSON.stringify(defaults)); renderSetup(); }
async function refreshDevices() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  const ins = devs.filter(d => d.kind === 'audioinput' && d.deviceId !== 'communications');
  const outs = devs.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'communications');
  const fill = (sel, list, cur, autoPick) => {
    sel.innerHTML = list.map(d => `<option value="${d.deviceId}">${(d.label || 'Audio device').replace(/</g, '&lt;')}</option>`).join('');
    let pick = list.find(d => d.deviceId === cur) || list.find(autoPick) || list.find(d => d.deviceId === 'default') || list[0];
    if (pick) sel.value = pick.deviceId;
    return pick ? pick.deviceId : '';
  };
  lastIns = ins; lastOuts = outs;
  log('mics: ' + ins.map(d => d.label || '?').join(' | '));
  log('outputs: ' + outs.map(d => d.label || '?').join(' | '));
  // MIC IN: never offer the cable's own mic side as an input (that would be a loop)
  const realIns = ins.filter(d => !/cable output|virtual mic|voicemeeter/i.test(d.label || ''));
  state.inputId = fill($('#selIn'), realIns.length ? realIns : ins, state.inputId, d => /virtual mic in|virtual usb/i.test(d.label));
  // HEADPHONES: never offer the cable as headphones
  const phones = outs.filter(d => !CABLE_RX.test(d.label || '') && !/voicemeeter|virtual cable/i.test(d.label || ''));
  state.phonesId = fill($('#selPhones'), phones.length ? phones : outs, state.phonesId, d => d.deviceId === 'default');
  // TO ZOOM: found by itself
  const cab = cableOut(); state.outputId = cab ? cab.deviceId : '';
  const lab = (sel) => sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '(none)';
  log(`picked: mic=${lab($('#selIn'))} | phones=${lab($('#selPhones'))} | cable=${cab ? cab.label : '(none)'} | renamed=${micSideRenamed()} strays=${strayMics().map(d => d.label).join(',') || 'none'}`);
  renderSetup();
  return { ins, outs };
}
async function unlockLabels() { // first getUserMedia grants device labels
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch {}
}
async function applySink() {
  if (!ctx || !ctx.setSinkId) return;
  // Main engine goes ONLY to the cable. No cable = silent output (meters still run), never the speakers.
  try { await ctx.setSinkId(state.outputId ? state.outputId : { type: 'none' }); } catch (e) { lcd('CABLE OUTPUT FAILED', true); }
  await applyMonSink();
}
async function applyMonSink() {
  if (!monCtx || !monCtx.setSinkId) return;
  const id = !state.phonesId || state.phonesId === 'default' ? '' : state.phonesId;
  try { await monCtx.setSinkId(id); } catch (e) { flashLcd('HEADPHONES DEVICE FAILED'); }
}
function micConstraints() {
  const c = { audio: { echoCancellation: false, noiseSuppression: !!state.nr, autoGainControl: false, channelCount: 1 } };
  if (state.inputId && state.inputId !== 'default') c.audio.deviceId = { exact: state.inputId };
  return c;
}
const phonesGain = () => state.params.phones <= -39.5 ? 0 : Math.pow(10, state.params.phones / 20);
/* Headphone monitor: a second little engine with the same settings, aimed at your headphones, so you can
   hear yourself while callers hear you. Two engines = no extra delay for either path. */
async function startMon() {
  if (monCtx || !running) return;
  try {
    monCtx = new AudioContext({ latencyHint: 'interactive' });
    await monCtx.audioWorklet.addModule('worklet/strip-processor.js');
    monStream = await navigator.mediaDevices.getUserMedia(micConstraints());
    const src = monCtx.createMediaStreamSource(monStream);
    monNode = new AudioWorkletNode(monCtx, 'strip-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    monGain = monCtx.createGain(); monGain.gain.value = phonesGain();
    src.connect(monNode).connect(monGain).connect(monCtx.destination);
    sendParams(); await applyMonSink(); await monCtx.resume();
    if (take) monNode.port.postMessage({ type: 'take', buf: take.slice() });
    if (playing) monNode.port.postMessage({ type: 'play', on: true });
    $('#monText').textContent = 'MON ON';
  } catch (e) { flashLcd('MONITOR FAILED: ' + (e.message || e.name)); await stopMon(); state.mon = 0; $('#btnMon').classList.remove('on'); }
}
async function setPlay(on) {
  playing = on && !!take; $('#btnPlay').classList.toggle('on', playing);
  if (playing && !state.mon) { state.mon = 1; $('#btnMon').classList.add('on'); save(); await startMon(); }
  if (monNode) monNode.port.postMessage({ type: 'play', on: playing });
  if (playing) { lcd('PLAYING YOUR TAKE · TURN KNOBS TO COMPARE', false, true); log('play take on'); } else { flashLcd('PLAY OFF · BACK TO LIVE MIC'); log('play take off'); }
}
async function stopMon() {
  if (monStream) { monStream.getTracks().forEach(t => t.stop()); monStream = null; }
  if (monCtx) { try { await monCtx.close(); } catch {} monCtx = null; monNode = null; monGain = null; }
  $('#monText').textContent = 'MON OFF';
}
async function start() {
  if (running) return;
  try {
    lcd('STARTING…');
    ctx = new AudioContext({ latencyHint: state.fast ? 'interactive' : 'playback' });   // SAFE = roomier buffer to the cable = fewer dropouts
    await ctx.audioWorklet.addModule('worklet/strip-processor.js');
    const constraints = micConstraints();
    try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
    catch (e) { delete constraints.audio.deviceId; stream = await navigator.mediaDevices.getUserMedia(constraints); lcd('SAVED MIC MISSING · USING DEFAULT', true); }
    const track = stream.getAudioTracks()[0];
    if (track) track.addEventListener('ended', () => { if (running) { lcd('MIC LOST · RECONNECTING…', true); scheduleReconnect(); } });
    const src = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, 'strip-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    node.port.onmessage = e => {
      const d = e.data;
      if (d.type === 'meter') {
        Object.assign(meter, d);
        if (d.clips) health.clips += d.clips;
        if (d.nans) { health.nans += d.nans; log('NaN in audio path: ' + d.nans); }
        // the worklet stamps each report with its own clock; a gap far longer than the report interval = the audio thread stalled
        if (health.lastT && d.t - health.lastT > 200) { health.hiccups++; log(`AUDIO THREAD STALL ${d.t - health.lastT} ms (total ${health.hiccups})`); }
        health.lastT = d.t;
      } else if (d.type === 'recDone') finishRecording(d);
    };
    src.connect(node).connect(ctx.destination);
    sendParams();
    await applySink();
    await ctx.resume();
    running = true; health.hiccups = 0; health.clips = 0; health.nans = 0; health.lastT = 0; health.wall = 0;
    $('#btnPower').classList.add('on'); $('.led', $('#btnPower')).classList.add('on');
    const lat = Math.round(((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000);
    runLcd = `RUN · ${(ctx.sampleRate / 1000).toFixed(1)} kHz · ${lat} ms`; lcd(runLcd); drawCurve();
    log(`engine up: sink=${state.outputId ? 'cable' : 'none'} track=${stream.getAudioTracks()[0] && stream.getAudioTracks()[0].label} nr=${state.nr}`);
    if (state.mon) await startMon();
    renderSetup();
  } catch (e) {
    log('start failed: ' + (e && (e.stack || e.message || e.name))); lcd('MIC ERROR: ' + (e.message || e.name), true); await stop();
  }
}
async function stop() {
  running = false; await stopMon();
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (ctx) { try { await ctx.close(); } catch {} ctx = null; node = null; }
  $('#btnPower').classList.remove('on'); $('.led', $('#btnPower')).classList.remove('on');
  Object.assign(meter, { inPk: 0, outPk: 0, gr: 0, gateRed: 0, gateOpen: false, lim: 0 });
  if (!$('#lcd').classList.contains('err')) lcd('STANDBY');
}
async function restart() { await stop(); await start(); }
function scheduleReconnect() { // mic unplugged / device vanished: keep trying every 3 s until it is back
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(async () => {
    await stop(); await refreshDevices(); await start();
    if (!running) { lcd('MIC MISSING · RETRYING…', true); scheduleReconnect(); }
  }, 3000);
}
function flashLcd(text, ms = 3000) { lcd(text); setTimeout(() => { if (running && !learning) lcd(runLcd); }, ms); }

/* ---------- meters ---------- */
const cv = $('#meters'), g = cv.getContext('2d');
const DPR = Math.min(2, window.devicePixelRatio || 1);
const MK = 340 / 270;   // meter zoom: the drawing code thinks in 150x270, the canvas is 190x340
const MPAD = 12;   // left gutter (logical px) for the sideways GATE / COMP names
cv.width = Math.round(205 * DPR); cv.height = Math.round(340 * DPR); g.scale(DPR * MK, DPR * MK); g.translate(MPAD, 0);
const disp = { in: -90, out: -90, gr: 0, inHold: -90, outHold: -90, inHoldT: 0, outHoldT: 0, clipIn: 0, clipOut: 0, de: 0, gateCut: 0 };
const SEGS = 30;
function segDb(k) { // segment k (0 = bottom) lights at this dB
  if (k < 10) return -60 + k * 3; if (k < 20) return -30 + (k - 10) * 1.8; return -12 + (k - 20) * 1.2;
}
function segColor(d, lit) {
  if (d >= -6) return lit ? '#ff4a3c' : '#3a1512';
  if (d >= -18) return lit ? '#ffc23a' : '#3a3012';
  return lit ? '#4cff6a' : '#123a1a';
}
const TARGET_LO = -20, TARGET_HI = -6;   // where speech peaks should land for Zoom / Webex
const MT = 26, MH = 220, SH = MH / SEGS;
let mHover = null, mDrag = null;   // which IN-meter line the mouse is over / pulling
function yToDb(y) { // inverse of dbToY, whole dB
  const k = clamp(Math.floor((MT + MH - y) / SH), 0, SEGS - 1);
  const lo = segDb(k), hi = k + 1 < SEGS ? segDb(k + 1) : 0, f = (MT + MH - k * SH - y) / SH;
  return Math.round(clamp(lo + f * (hi - lo), -60, 0));
}
function lineAt(e) { // which threshold line is under the pointer (IN column only)
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * (162 / r.width) - MPAD, y = (e.clientY - r.top) * (270 / r.height);
  if (x < 0 || x > 52) return null;
  const pp = state.params, cands = [];
  if (pp.gateIn && !pp.bypass) cands.push(['gateThresh', Math.abs(y - dbToY(pp.gateThresh))]);
  if (pp.compIn && !pp.bypass) cands.push(['compThresh', Math.abs(y - dbToY(pp.compThresh))]);
  cands.sort((a, b) => a[1] - b[1]);
  return cands.length && cands[0][1] < 7 ? cands[0][0] : null;
}
cv.addEventListener('pointermove', e => {
  if (mDrag) {
    const r = cv.getBoundingClientRect(), y = (e.clientY - r.top) * (270 / r.height), spec = P[mDrag];
    const v = clamp(yToDb(y), spec.min, spec.max);
    if (v !== state.params[mDrag]) { state.params[mDrag] = v; renderKnob(mDrag); changed(); }
    return;
  }
  mHover = lineAt(e); cv.style.cursor = mHover ? 'ns-resize' : '';
});
cv.addEventListener('pointerdown', e => {
  const id = lineAt(e); if (!id) return;
  mDrag = id; cv.setPointerCapture(e.pointerId); e.preventDefault();
  const k = knobEls[id]; if (k && window.gsap) { k.el.classList.add('active'); gsap.fromTo(k.el, { scale: 1 }, { scale: 1.08, duration: 0.15, ease: 'power2.out' }); }
});
const endDrag = () => { if (!mDrag) return; const k = knobEls[mDrag]; if (k) { k.el.classList.remove('active'); if (window.gsap) gsap.to(k.el, { scale: 1, duration: 0.2 }); } mDrag = null; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag); cv.addEventListener('pointerleave', () => { if (!mDrag) { mHover = null; cv.style.cursor = ''; } });
// Continuous dB -> pixel. y(d) is the exact edge where a segment starts to light for level d, so a marker at
// THRESHOLD sits precisely where the bars cross it (the old code drew markers half a segment too high).
function dbToY(d) {
  d = clamp(d, -60, 0); let k = 0; for (let i = 0; i < SEGS; i++) if (d >= segDb(i)) k = i;
  const lo = segDb(k), hi = k + 1 < SEGS ? segDb(k + 1) : 0, f = hi > lo ? (d - lo) / (hi - lo) : 0;
  return MT + MH - k * SH - f * SH;
}
function drawMark(x, m) {
  if (m.band) { const ya = dbToY(m.band[1]), yb = dbToY(m.band[0]); g.fillStyle = m.bandColor || 'rgba(255,176,46,.10)'; g.fillRect(x - 4, ya, 30, yb - ya); }
  if (m.db === undefined) return;
  const yy = Math.round(dbToY(m.db)) + .5;
  g.strokeStyle = m.color; g.lineWidth = m.width || 2; g.setLineDash(m.dash || []); g.beginPath(); g.moveTo(x - 4, yy); g.lineTo(x + 26, yy); g.stroke(); g.setLineDash([]);
  if (m.arrow !== false) {
    g.fillStyle = m.color; g.beginPath();
    if (m.side === 'right') { g.moveTo(x + 26, yy); g.lineTo(x + 31, yy - 4); g.lineTo(x + 31, yy + 4); }
    else { g.moveTo(x - 4, yy); g.lineTo(x - 9, yy - 4); g.lineTo(x - 9, yy + 4); }
    g.closePath(); g.fill();
  }
  if (m.label) { // name runs sideways in the gutter beside the arrow, so it never covers the bars
    const cx = x - 11.5, cy = m.labelY !== undefined ? m.labelY : yy;
    g.save(); g.translate(cx, cy); g.rotate(-Math.PI / 2);
    g.font = '800 7px Bahnschrift, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(m.label).width + 4;
    g.fillStyle = m.hot ? m.color : 'rgba(0,0,0,.85)'; g.fillRect(-w / 2, -4.5, w, 9);
    g.fillStyle = m.hot ? '#000' : m.color; g.fillText(m.label, 0, 0.5);
    g.restore(); g.textBaseline = 'alphabetic';
  }
  if (m.value) { // while dragging: the number sits above the column, out of the way
    g.font = '800 8px Bahnschrift, "Arial Narrow", sans-serif'; g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,.85)'; g.fillRect(x - 6, MT - 15, 34, 11);
    g.fillStyle = m.color; g.fillText(m.value, x + 11, MT - 6);
  }
}
function drawPointer(x, db, color) { // what the gate detector sees right now: a small pointer on the column's right edge
  const yy = Math.round(dbToY(db)) + .5;
  g.fillStyle = color; g.beginPath(); g.moveTo(x + 22, yy); g.lineTo(x + 30, yy - 4.5); g.lineTo(x + 30, yy + 4.5); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1; g.stroke();
}
function drawColumn(x, level, hold, label, target, marks, pointerDb, pointerColor) {
  g.fillStyle = '#0b0c0d'; g.fillRect(x - 4, MT - 4, 30, MH + 8);
  if (target) { // green bracket = the good zone
    const y1 = dbToY(TARGET_HI), y2 = dbToY(TARGET_LO);
    g.fillStyle = 'rgba(76,255,106,.10)'; g.fillRect(x - 4, y1, 30, y2 - y1);
    g.strokeStyle = 'rgba(76,255,106,.55)'; g.lineWidth = 1; g.beginPath();
    g.moveTo(x - 3.5, y1 + .5); g.lineTo(x - 3.5, y2 - .5); g.moveTo(x + 25.5, y1 + .5); g.lineTo(x + 25.5, y2 - .5); g.stroke();
  }
  if (marks) marks.forEach(m => { if (m.band) drawMark(x, { band: m.band, bandColor: m.bandColor }); });
  for (let k = 0; k < SEGS; k++) {
    const d = segDb(k), lit = level >= d, y = MT + MH - (k + 1) * SH + 1;
    g.fillStyle = segColor(d, lit);
    g.fillRect(x, y, 22, SH - 2);
  }
  if (hold > -60) { const y = Math.round(dbToY(hold)); g.fillStyle = '#ffffff'; g.fillRect(x, y - 1, 22, 1.5); }   // peak hold
  if (marks) marks.forEach(m => { if (m.db !== undefined) drawMark(x, m); });
  if (pointerDb !== undefined && pointerDb > -70) drawPointer(x, pointerDb, pointerColor || '#ffffff');
  g.fillStyle = '#c9c7bc'; g.font = '700 9px Bahnschrift, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.fillText(label, x + 11, 16);
}
function drawGR(x, gr) {
  const top = 26, h = 220, N = 20, sh = h / N;
  g.fillStyle = '#0b0c0d'; g.fillRect(x - 4, top - 4, 30, h + 8);
  for (let k = 0; k < N; k++) {
    const lit = gr >= k + 0.5, y = top + k * sh + 1;
    g.fillStyle = lit ? '#ffb02e' : '#3a2a10';
    g.fillRect(x, y, 22, sh - 2);
  }
  g.fillStyle = '#c9c7bc'; g.font = '700 9px Bahnschrift, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.fillText('GR', x + 11, 16);
}
function drawScale() {
  g.fillStyle = '#8f8d84'; g.font = '600 7px Bahnschrift, "Arial Narrow", sans-serif'; g.textAlign = 'center';
  const top = 26, h = 220;
  [0, -6, -12, -18, -30, -40, -60].forEach(d => {
    const y = Math.round(dbToY(d)) + 2.5; g.fillText(d === 0 ? '0' : String(-d), 47, y); g.fillText(d === 0 ? '0' : String(-d), 105, y);
  });
  g.textAlign = 'left';
  [0, 5, 10, 15, 20].forEach(d => { g.fillText(String(d), 87, top + d * (h / 20) + 5); });
  g.font = '600 6.5px Bahnschrift, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#6b6a64';
  g.fillText('dBFS', 47, 262); g.fillText('dB', 91, 262); g.fillText('dBFS', 105, 262);
}
/* Level verdict: watch the loudest bits of the last few seconds of speech and say GOOD / TOO QUIET / TOO LOUD. */
const verdict = { peak: -90, talkT: 0, lastText: '', avg: -60, quietT: 0, warned: false };
const RMS_LO = -30, RMS_HI = -16;   // average speech loudness that lands well on Zoom / Meet (dBFS RMS)
function updateVerdict(outDb, dt) {
  const el = $('#verdictText');
  const talking = running && !state.params.mute && meter.gateOpen && outDb > -40;
  const rmsDb = dB(meter.rmsOut || 0);
  if (talking) { verdict.talkT = 3; if (outDb > verdict.peak) verdict.peak = outDb; else verdict.peak -= 2 * dt; verdict.avg += (rmsDb - verdict.avg) * Math.min(1, dt / 1.5); }
  else { verdict.talkT -= dt; }
  // Silence watchdog: a mic that is plugged in but sends nothing for 30 s is usually a USB / mute-switch problem
  if (running && dB(meter.inPk) < -70) { verdict.quietT += dt; if (verdict.quietT > 30 && !verdict.warned) { verdict.warned = true; flashLcd('NO SOUND FROM MIC FOR 30 s \u00b7 CHECK USB OR MUTE SWITCH', 6000); log('silence watchdog: no input for 30 s'); } }
  else { verdict.quietT = 0; verdict.warned = false; }
  let text = 'LEVEL: —', cls = '';
  if (!running) { text = 'LEVEL: —'; }
  else if (verdict.talkT <= 0) { text = 'LEVEL: TALK TO CHECK'; verdict.peak = -90; verdict.avg = -60; }
  else if (disp.clipOut > 0 || verdict.peak > -2) { text = 'TOO LOUD \u00b7 LOWER FADER'; cls = 'loud'; }
  else if (verdict.avg > RMS_HI + 2) { text = 'A BIT HOT \u00b7 LOWER FADER'; cls = 'loud'; }
  else if (verdict.avg < RMS_LO - 4) { text = 'TOO QUIET \u00b7 RAISE TRIM'; cls = 'quiet'; }
  else if (verdict.avg < RMS_LO) { text = 'A BIT QUIET'; cls = 'quiet'; }
  else { text = 'LEVEL: GOOD \u00b7 AVG ' + verdict.avg.toFixed(0) + ' dB'; cls = 'good'; }
  if (text !== verdict.lastText) { verdict.lastText = text; el.textContent = text; el.className = 'lcdsmall ' + cls; }
}
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  const inDb = dB(meter.inPk), outDb = dB(meter.outPk);
  const FALL = 40; // dB per second
  disp.in = Math.max(inDb, disp.in - FALL * dt); disp.out = Math.max(outDb, disp.out - FALL * dt);
  if (inDb >= disp.inHold) { disp.inHold = inDb; disp.inHoldT = 1.2; } else { disp.inHoldT -= dt; if (disp.inHoldT < 0) disp.inHold -= 30 * dt; }
  if (outDb >= disp.outHold) { disp.outHold = outDb; disp.outHoldT = 1.2; } else { disp.outHoldT -= dt; if (disp.outHoldT < 0) disp.outHold -= 30 * dt; }
  disp.gr += (meter.gr - disp.gr) * (meter.gr > disp.gr ? 0.6 : 0.15);
  if (meter.inPk >= 0.99) disp.clipIn = 2; else disp.clipIn -= dt;
  if (meter.outPk >= 0.99) disp.clipOut = 2; else disp.clipOut -= dt;
  $('#clipIn').classList.toggle('on', disp.clipIn > 0); $('#clipOut').classList.toggle('on', disp.clipOut > 0);
  g.clearRect(-MPAD, 0, 163, 270);
  // IN column markers: the gate's OPEN line, its CLOSE line (hysteresis), the compressor threshold, and a white
  // pointer showing the level the gate detector actually sees right now. Everything is drawn from the same numbers
  // the audio engine uses, so what you see is what it does.
  const pp = state.params, inMarks = [];
  // Two draggable lines: GATE (amber = open, red = closed) with a faint band under it where the gate lets go,
  // and COMP (cream). Grab a line and slide it; the matching knob turns with it.
  const gOn = pp.gateIn && !pp.bypass, compOn = pp.compIn && !pp.bypass;
  let gy = gOn ? dbToY(pp.gateThresh) : -99, cy = compOn ? dbToY(pp.compThresh) : -99, gLabelY = gy, cLabelY = cy;
  if (gOn && compOn && Math.abs(gy - cy) < 24) { // labels would overlap: push them apart
    const mid = (gy + cy) / 2; if (gy >= cy) { gLabelY = mid + 12; cLabelY = mid - 12; } else { gLabelY = mid - 12; cLabelY = mid + 12; }
  }
  if (gOn) {
    const T = pp.gateThresh, open = meter.gateOpen && running;
    inMarks.push({ band: [T - GATE_HYST, T], bandColor: open ? 'rgba(255,176,46,.12)' : 'rgba(255,90,78,.12)' });
    inMarks.push({ db: T, color: open ? '#ffb02e' : '#ff5a4e', label: 'GATE', labelY: clamp(gLabelY, MT + 12, MT + MH - 12), width: 2, hot: mHover === 'gateThresh' || mDrag === 'gateThresh', value: mDrag === 'gateThresh' ? T + ' dB' : '' });
  }
  if (compOn) inMarks.push({ db: pp.compThresh, color: '#e4dfd0', label: 'COMP', labelY: clamp(cLabelY, MT + 12, MT + MH - 12), width: 1, dash: [3, 2], hot: mHover === 'compThresh' || mDrag === 'compThresh', value: mDrag === 'compThresh' ? pp.compThresh + ' dB' : '' });
  const gateOnNow = running && pp.gateIn && !pp.bypass;
  drawColumn(18, disp.in, disp.inHold, 'IN', false, inMarks, gateOnNow ? meter.gateLvl : undefined, meter.gateOpen ? '#ffffff' : '#ff8a80');
  drawGR(60, disp.gr); drawColumn(114, disp.out, disp.outHold, 'OUT', true); drawScale();
  if (state.compact) { drawCompactMeters(); if ((t / 250 | 0) % 2 === 0) syncCompact(); }
  $('#grReadout').textContent = disp.gr.toFixed(1);
  if ((t / 100 | 0) % 2 === 0) $('#peaks').textContent = running ? `PEAK  IN ${disp.inHold <= -60 ? '\u2212\u221e' : disp.inHold.toFixed(1)}  \u00b7  OUT ${disp.outHold <= -60 ? '\u2212\u221e' : disp.outHold.toFixed(1)}  dBFS` : 'PEAK  IN \u2014  \u00b7  OUT \u2014';
  const gateOn = running && state.params.gateIn && !state.params.bypass;
  $('#ledGateOpen').classList.toggle('on', gateOn && meter.gateOpen);
  $('#ledGateRed').classList.toggle('on', gateOn && meter.gateRed > 0.5);
  disp.gateCut += (meter.gateRed - disp.gateCut) * 0.3;
  $('#gateCut').textContent = gateOn && disp.gateCut > 0.4 ? ('CUTTING ' + (disp.gateCut >= 79 ? 'ALL' : Math.round(disp.gateCut) + ' dB')) : (gateOn ? 'OPEN · CUTTING 0 dB' : 'GATE OFF');
  $('#ledLim').classList.toggle('on', running && !!state.params.limIn && !state.params.bypass && meter.lim > 0.3);
  disp.de += (meter.de - disp.de) * (meter.de > disp.de ? 0.6 : 0.15);
  $('#ledDe').classList.toggle('on', running && !!state.params.deIn && !state.params.bypass && meter.de > 1);
  $('#deReadout').textContent = disp.de.toFixed(1);
  updateVerdict(outDb, dt);
  requestAnimationFrame(loop);
}

/* ---------- EQ response curve ---------- */
const cvE = $('#eqCurve'), gE = cvE.getContext('2d');
const EQW = 330, EQH = 80;
cvE.width = EQW * DPR; cvE.height = EQH * DPR; gE.scale(DPR, DPR);
function coefs(type, f, Q, g, sr) { // same RBJ math as the worklet, normalised by a0
  const A = Math.pow(10, g / 40), w = 2 * Math.PI * f / sr, c = Math.cos(w), s = Math.sin(w); let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass') { const a = s / (2 * Q); b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'highpass') { const a = s / (2 * Q); b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'peaking') { const a = s / (2 * Q); b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; }
  else {
    const a = (s / 2) * Math.sqrt((A + 1 / A) * (1 / Q - 1) + 2), r = 2 * Math.sqrt(A) * a;
    if (type === 'lowshelf') { b0 = A * ((A + 1) - (A - 1) * c + r); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - r); a0 = (A + 1) + (A - 1) * c + r; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - r; }
    else { b0 = A * ((A + 1) + (A - 1) * c + r); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - r); a0 = (A + 1) - (A - 1) * c + r; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - r; }
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function magDb(c, w) {
  const cw = Math.cos(w), c2 = Math.cos(2 * w), sw = Math.sin(w), s2 = Math.sin(2 * w);
  const nr = c[0] + c[1] * cw + c[2] * c2, ni = -(c[1] * sw + c[2] * s2), dr = 1 + c[3] * cw + c[4] * c2, di = -(c[3] * sw + c[4] * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di) + 1e-20);
}
function onePoleHpDb(f, w, sr) {
  const k = Math.exp(-2 * Math.PI * f / sr), cw = Math.cos(w), sw = Math.sin(w);
  return 20 * Math.log10(k * Math.hypot(1 - cw, sw) / Math.hypot(1 - k * cw, k * sw) + 1e-20);
}
const fx = (f, W) => W * Math.log(f / 20) / Math.log(1000);
function drawCurve() {
  const p = state.params, sr = ctx ? ctx.sampleRate : 48000, W = EQW, H = EQH, RANGE = 18;
  const active = !p.bypass && (p.eqIn || p.filtersIn), stages = [];
  if (!p.bypass && p.filtersIn) { stages.push(coefs('highpass', p.hpf, 1.0, 0, sr)); stages.push(coefs('lowpass', p.lpf, 0.7071, 0, sr)); }
  if (!p.bypass && p.eqIn) {
    stages.push(coefs(p.lfBell ? 'peaking' : 'lowshelf', p.lfFreq, p.lfBell ? 0.8 : 0.7071, p.lfGain, sr));
    stages.push(coefs('peaking', p.lmfFreq, p.lmfQ, p.lmfGain, sr)); stages.push(coefs('peaking', p.hmfFreq, p.hmfQ, p.hmfGain, sr));
    stages.push(coefs(p.hfBell ? 'peaking' : 'highshelf', p.hfFreq, p.hfBell ? 0.8 : 0.7071, p.hfGain, sr));
  }
  gE.clearRect(0, 0, W, H);
  gE.strokeStyle = 'rgba(255,255,255,.07)'; gE.lineWidth = 1; gE.beginPath();
  [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(f => { const x = Math.round(fx(f, W)) + .5; gE.moveTo(x, 0); gE.lineTo(x, H); });
  [-12, -6, 6, 12].forEach(d => { const y = Math.round(H / 2 - d * (H / 2) / RANGE) + .5; gE.moveTo(0, y); gE.lineTo(W, y); });
  gE.stroke();
  gE.strokeStyle = 'rgba(255,255,255,.2)'; gE.beginPath(); gE.moveTo(0, H / 2 + .5); gE.lineTo(W, H / 2 + .5); gE.stroke();
  gE.fillStyle = 'rgba(255,255,255,.35)'; gE.font = '600 9px Bahnschrift, "Arial Narrow", sans-serif'; gE.textAlign = 'left';
  [['100', 100], ['1k', 1000], ['10k', 10000]].forEach(([t, f]) => gE.fillText(t, fx(f, W) + 2, H - 2));
  gE.textAlign = 'right'; gE.fillText('+12', W - 3, 11); gE.fillText('-12', W - 3, H - 12);
  gE.beginPath();
  for (let x = 0; x <= W; x++) {
    const f = 20 * Math.pow(1000, x / W), w = 2 * Math.PI * f / sr; let d = 0;
    for (const c of stages) d += magDb(c, w);
    if (!p.bypass && p.filtersIn) d += onePoleHpDb(p.hpf, w, sr);
    const y = clamp(H / 2 - d * (H / 2) / RANGE, 1, H - 1);
    x === 0 ? gE.moveTo(x, y) : gE.lineTo(x, y);
  }
  gE.lineWidth = 1.5; gE.strokeStyle = active ? '#ffb02e' : 'rgba(255,255,255,.25)';
  gE.shadowColor = active ? 'rgba(255,176,46,.7)' : 'transparent'; gE.shadowBlur = active ? 5 : 0; gE.stroke(); gE.shadowBlur = 0;
  if (active) { gE.lineTo(W, H / 2); gE.lineTo(0, H / 2); gE.closePath(); gE.fillStyle = 'rgba(255,176,46,.10)'; gE.fill(); }
  if (!p.bypass && p.eqIn) { // a dot per band, in the band's knob colour, so you can see which knob made which bump
    [['lf', '#c8783c'], ['lmf', '#3f78ff'], ['hmf', '#4cff6a'], ['hf', '#ff5a4e']].forEach(([b, c]) => {
      const x = fx(p[b + 'Freq'], W), y = clamp(H / 2 - p[b + 'Gain'] * (H / 2) / RANGE, 4, H - 4);
      gE.beginPath(); gE.arc(x, y, 3.5, 0, Math.PI * 2); gE.fillStyle = c; gE.fill(); gE.strokeStyle = 'rgba(0,0,0,.8)'; gE.lineWidth = 1; gE.stroke();
    });
  }
}

/* ---------- scale to fit window ---------- */
const strip = $('#strip');
let scaleNow = 1;
const currentScale = () => scaleNow;
const NAT_W = 1560, NAT_H = 760;   // the layout is designed for this size; smaller windows zoom it down
function fit() {
  if (state.compact) return;
  const w = window.innerWidth, h = window.innerHeight;
  scaleNow = Math.min(w / NAT_W, h / NAT_H);   // bigger window = bigger panel and text, smaller window = zoom down
  strip.style.width = (w / scaleNow) + 'px'; strip.style.height = (h / scaleNow) + 'px';
  strip.style.transform = Math.abs(scaleNow - 1) > 0.002 ? `scale(${scaleNow})` : 'none';
}

/* ---------- updates ---------- */
const REPO = 'nojokebeatz/onfleek-channel-strip';
function cmpVer(a, b) { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); } return 0; }
function showUpdateBar(text, btnText, onClick) {
  $('#updateText').textContent = text; const b = $('#updateBtn');
  b.textContent = btnText; b.hidden = !onClick; b.onclick = onClick || null;
  $('#updateBar').hidden = false; fit();
}
// The UPDATE button in the top rail: one control that shows the state and does the right thing.
//   idle       -> "UPDATE"            click = check now
//   checking   -> "CHECKING…"         (amber blink)
//   current    -> "UP TO DATE"        (green lamp, goes back to UPDATE after a few seconds)
//   downloading-> "DOWNLOADING 42%"   (amber blink)
//   ready      -> "RESTART TO UPDATE" click = install (installed build) / "GET vX.Y.Z" click = download page (portable)
const upd = { mode: 'manual', state: 'idle', action: null, timer: 0 };
function setUpd(state, text, lamp, action) {
  upd.state = state; upd.action = action || null;
  const b = $('#btnUpdate'), led = $('#ledUpd');
  $('#btnUpdateText').textContent = text;
  b.classList.toggle('ready', state === 'ready'); b.classList.toggle('busy', state === 'checking' || state === 'downloading');
  led.className = 'led ' + (lamp || 'green') + (lamp ? ' on' : '');
  b.title = { idle: 'Check for a new version', checking: 'Looking for a new version…', current: 'You have the newest version',
              downloading: 'Downloading the new version in the background', ready: action ? 'Click to update' : '', error: 'Could not reach the update server. Click to try again' }[state] || '';
  clearTimeout(upd.timer);
  if (state === 'current' || state === 'error') upd.timer = setTimeout(() => { if (upd.state === state) setUpd('idle', 'UPDATE', '', null); }, state === 'current' ? 6000 : 10000);
}
async function checkUpdateManual() { // portable / dev: look at GitHub, offer the download page
  setUpd('checking', 'CHECKING…', 'amber', null);
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); const latest = (j.tag_name || '').replace(/^v/, '');
    if (latest && cmpVer(latest, version) > 0) {
      const go = () => window.cs.openExternal(j.html_url);
      setUpd('ready', `GET v${latest}`, 'amber', go);
      showUpdateBar(`NEW VERSION ${latest} IS READY`, 'GET IT', go);
    } else setUpd('current', 'UP TO DATE', 'green', null);
  } catch (e) { setUpd('error', 'NO SIGNAL', 'red', null); }
}
function checkUpdateNow() {
  if (upd.state === 'checking' || upd.state === 'downloading') return;
  if (upd.state === 'ready' && upd.action) return upd.action();
  if (upd.mode === 'auto') { setUpd('checking', 'CHECKING…', 'amber', null); window.cs.updateCheck(); }
  else checkUpdateManual();
}
async function setupUpdates() {
  upd.mode = await window.cs.updateMode();
  $('#btnUpdate').onclick = checkUpdateNow;
  if (upd.mode !== 'auto') { checkUpdateManual(); setInterval(checkUpdateManual, 3600 * 1000); return; }
  window.cs.onUpdateEvent(d => {
    if (d.type === 'checking') setUpd('checking', 'CHECKING…', 'amber', null);
    else if (d.type === 'none') setUpd('current', 'UP TO DATE', 'green', null);
    else if (d.type === 'available') { setUpd('downloading', `DOWNLOADING v${d.version}`, 'amber', null); showUpdateBar(`NEW VERSION ${d.version} · DOWNLOADING…`, '', null); }
    else if (d.type === 'progress') { setUpd('downloading', `DOWNLOADING ${d.percent}%`, 'amber', null); showUpdateBar(`NEW VERSION · DOWNLOADING ${d.percent}%`, '', null); }
    else if (d.type === 'downloaded') { const go = () => window.cs.updateInstall(); setUpd('ready', 'RESTART TO UPDATE', 'amber', go); showUpdateBar(`VERSION ${d.version} IS READY`, 'RESTART TO UPDATE', go); }
    else if (d.type === 'error') { console.warn('updater:', d.message); if (upd.state !== 'ready') setUpd('error', 'NO SIGNAL', 'red', null); }
  });
  checkUpdateNow(); setInterval(() => { if (upd.state === 'idle' || upd.state === 'current' || upd.state === 'error') checkUpdateNow(); }, 3600 * 1000);
}

/* ---------- boot ---------- */
async function boot() {
  version = await window.cs.version(); $('#verLabel').textContent = 'v' + version;
  $$('[data-knob]').forEach(buildKnob); $$('[data-tog]').forEach(buildToggle); buildFader(); buildPresets();
  const saved = await window.cs.loadState();
  if (saved && !saved.params && saved.userPresets) state.userPresets = saved.userPresets;
  if (saved && saved.params) { state.params = Object.assign(DEFAULT_PARAMS(), saved.params); state.inputId = saved.inputId || ''; state.phonesId = saved.phonesId || ''; state.mon = saved.mon ? 1 : 0; state.nr = saved.nr ? 1 : 0; state.logPin = saved.logPin || ''; state.userPresets = (saved.userPresets && typeof saved.userPresets === 'object') ? saved.userPresets : {}; state.wantDefault = saved.wantDefault ? 1 : 0; state.fast = saved.fast ? 1 : 0; state.compact = saved.compact ? 1 : 0; state.prevDefaultMic = saved.prevDefaultMic || ''; state.preset = saved.preset ?? 'Voice – Natural'; }
  state.params.mute = 0; // never start muted
  // One-time fix-up: older versions shipped RANGE at 20 or 40 dB, which let a quiet copy of everything
  // through a closed gate. Move untouched values to FULL (dead silent) and say so once.
  let rangeNote = '';
  if (saved && !saved.rangeMigrated && (state.params.gateRange === 20 || state.params.gateRange === 40)) { state.params.gateRange = 80; rangeNote = 'GATE RANGE MOVED TO FULL · CLOSED GATE = SILENCE'; }
  state.rangeMigrated = 1;
  renderAll();
  // MUTE from the tray or the global Ctrl+Shift+M
  window.cs.onHotkey(k => { if (k === 'update') { $('#btnUpdate').click(); return; } if (k === 'mute') { state.params.mute = state.params.mute ? 0 : 1; renderToggle('mute'); changed(true); flashLcd(state.params.mute ? 'MIC MUTED' : 'MIC LIVE', 1500); } });
  // LEARN: 2 s of room noise -> gate threshold 8 dB above it
  $('#btnLearn').onclick = () => {
    if (!running || learning) return;
    learning = true; let maxPk = 0, left = 2.0; $('#btnLearn').classList.add('on');
    const t = setInterval(() => {
      maxPk = Math.max(maxPk, meter.inPk); left -= 0.1; lcd(`LEARNING NOISE · STAY QUIET ${Math.max(0, left).toFixed(1)} s`);
      if (left <= 0) {
        clearInterval(t); learning = false; $('#btnLearn').classList.remove('on');
        const th = clamp(Math.round(dB(maxPk) + 8), -70, -6);
        state.params.gateThresh = th; renderKnob('gateThresh'); changed();
        flashLcd(`GATE THRESHOLD SET TO ${th} dB`, 3000);
      }
    }, 100);
  };
  // NAME IT: rename the cable's recording side to "Virtual Mic Out" so Zoom / Webex show that name
  $('#btnName').onclick = async () => {
    const b = $('#btnName'), from = b.dataset.from; if (!from) return;
    $('#ckName').classList.add('busy'); lcd(`RENAMING \u201c${from}\u201d \u2192 \u201c${MIC_NAME}\u201d\u2026`);
    try {
      const cab = cableOut(); const key = cab ? familyKey(cab.label) : '';
      for (const st of strayMics()) { try { await window.cs.renameMic(MIC_NAME, 'Unused Virtual Mic', 'capture', familyKey(st.label)); } catch {} }
      const r = await window.cs.renameMic(from, MIC_NAME, 'capture', key); log('NAME IT ' + from + ' -> ' + MIC_NAME + ' [' + key + ']: ' + r);
      const feedFrom = cab ? (cab.label || '').replace(/\s*\(.*$/, '') : '';
      if (cab && /^cable input$/i.test(feedFrom)) { try { await window.cs.renameMic(feedFrom, FEED_NAME, 'render', key); } catch {} }
      const ok = /RENAMED [1-9]/.test(r);
      await refreshDevices(); await refreshDefaults();
      if (ok) flashLcd(`DONE \u00b7 WINDOWS NOW CALLS IT \u201c${MIC_NAME.toUpperCase()}\u201d`, 4000);
      else { const seen = (String(r).match(/SEEN: (.*)/) || [])[1] || ''; lcd(`WINDOWS HAS NO \u201c${from}\u201d \u00b7 IT LISTS: ${seen || 'nothing'} \u00b7 USE INSTALL CABLE`, true); }
    } catch (e) { lcd('RENAME FAILED: ' + (e.message || e).toString().slice(0, 60), true); }
    renderSetup();
  };
  // SET LEVEL: talk normally for 5 s, then TRIM moves so your loudest bits land near -10 dBFS
  $('#btnLevel').onclick = () => {
    if (!running || leveling || learning) return;
    leveling = true; let maxPk = 0, left = 5.0; $('#btnLevel').classList.add('on');
    const t = setInterval(() => {
      maxPk = Math.max(maxPk, meter.inPk); left -= 0.1; lcd(`SETTING LEVEL · TALK NORMALLY ${Math.max(0, left).toFixed(1)} s`);
      if (left <= 0) {
        clearInterval(t); leveling = false; $('#btnLevel').classList.remove('on');
        if (maxPk < 0.002) { flashLcd('HEARD NOTHING · IS THE MIC ON?', 3000); return; }
        const trim = clamp(Math.round(state.params.trim + (-10 - dB(maxPk))), P.trim.min, P.trim.max);
        state.params.trim = trim; renderKnob('trim'); changed(true);
        flashLcd(`TRIM SET TO ${trim > 0 ? '+' : ''}${trim} dB`, 3000);
      }
    }, 100);
  };
  // NR: Windows' own noise cleanup on the mic (needs the mic reopened)
  $('#btnNr').classList.toggle('on', !!state.nr);
  $('#btnNr').onclick = async () => { state.nr = state.nr ? 0 : 1; $('#btnNr').classList.toggle('on', !!state.nr); save(); if (running) { await restart(); flashLcd(state.nr ? 'NOISE CLEANUP ON' : 'NOISE CLEANUP OFF', 2000); } };
  // BOOT: start with Windows, hidden in the tray
  $('#btnBoot').classList.toggle('on', !!(await window.cs.getAutostart()));
  $('#btnBoot').onclick = async () => {
    const on = !$('#btnBoot').classList.contains('on'); await window.cs.setAutostart(on);
    $('#btnBoot').classList.toggle('on', on); flashLcd(on ? 'STARTS WITH WINDOWS · LIVES IN THE TRAY' : 'AUTO START OFF', 2500);
  };
  $('#btnMin').onclick = () => window.cs.minimize(); $('#btnClose').onclick = () => window.cs.close();
  setupLamps();
  bootAnimation();
  // COMPACT view wiring
  $('#btnCompact').onclick = () => setCompact(true); $('#cExpand').onclick = () => setCompact(false);
  $('#cMin').onclick = () => window.cs.minimize(); $('#cClose').onclick = () => window.cs.close();
  $('#cMute').onclick = () => togEls.mute.click(); $('#cBypass').onclick = () => togEls.bypass.click();
  $('#cMon').onclick = () => $('#btnMon').click(); $('#cLock').onclick = () => $('#btnLock').click();
  $('#cPreset').onchange = () => { const sp = $('#selPreset'); sp.value = $('#cPreset').value; sp.dispatchEvent(new Event('change')); };
  if (state.compact || location.hash === '#shotcompact') setCompact(true);
  // Double-click a section name: that section goes back to the current preset's settings
  $$('.sec-title').forEach(t => { t.title = 'Double-click to reset this section to the preset'; t.style.cursor = 'pointer'; t.addEventListener('dblclick', () => {
    if (state.locked) return;
    const sec = t.closest('.sec'), base = Object.assign(DEFAULT_PARAMS(), presetParams(state.preset || 'Voice \u2013 Natural'));
    let n = 0;
    $$('[data-knob]', sec).forEach(k => { const id = k.dataset.knob; if (state.params[id] !== base[id]) { state.params[id] = base[id]; n++; } });
    $$('[data-tog]', sec).forEach(b => { const id = b.dataset.tog; if (NOT_IN_PRESET.includes(id)) return; if (state.params[id] !== base[id]) { state.params[id] = base[id]; n++; } });
    renderAll(); changed(true); flashLcd(t.textContent.trim() + ' RESET (' + n + ' CHANGE' + (n === 1 ? '' : 'S') + ')', 2000);
  }); });
  // Ctrl + / Ctrl - / Ctrl 0 : bigger, smaller, normal size
  window.addEventListener('keydown', e => {
    if (!e.ctrlKey) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); window.cs.zoom(1.1); }
    else if (e.key === '-') { e.preventDefault(); window.cs.zoom(1 / 1.1); }
    else if (e.key === '0') { e.preventDefault(); window.cs.zoom(0); }
  });
  window.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); window.cs.zoom(e.deltaY < 0 ? 1.05 : 1 / 1.05); } }, { passive: false });
  // 11: click a CLIP light to clear it; click the PEAK readout to reset the peak-hold lines
  $('#clipIn').parentElement.onclick = () => { disp.clipIn = 0; }; $('#clipOut').parentElement.onclick = () => { disp.clipOut = 0; };
  $('#peaks').style.cursor = 'pointer'; $('#peaks').title = 'Click to reset the peak-hold lines';
  $('#peaks').onclick = () => { disp.inHold = -90; disp.outHold = -90; disp.clipIn = 0; disp.clipOut = 0; };
  // 8: FAST / SAFE buffer
  $('#btnFast').classList.toggle('on', !!state.fast);
  $('#btnFast').onclick = async () => { state.fast = state.fast ? 0 : 1; $('#btnFast').classList.toggle('on', !!state.fast); save(); flashLcd(state.fast ? 'FAST BUFFER \u00b7 LESS DELAY, MORE CRACKLE RISK' : 'SAFE BUFFER \u00b7 FEWER DROPOUTS', 3000); log('buffer mode ' + (state.fast ? 'fast' : 'safe')); if (running) { await stop(); await start(); } };
  // 10: red tray icon while muted
  const trayMuted = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#ff3b30'; x.beginPath(); x.arc(16, 16, 15, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 20px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('M', 16, 17); return c.toDataURL(); })();
  window.cs.onTrayMute = (m) => window.cs.trayIcon(m ? trayMuted : '');
  // A/B: two settings slots. Press A/B to jump between them and hear the difference (works great with PLAY).
  $('#btnAB').onclick = () => {
    const cur = JSON.stringify(state.params);
    if (!ab.other) { ab.other = cur; ab.slot = 'B'; flashLcd('SLOT B = COPY OF A \u00b7 CHANGE SOMETHING, THEN PRESS A/B', 3500); }
    else { const to = ab.other; ab.other = cur; ab.slot = ab.slot === 'A' ? 'B' : 'A'; restore(to); flashLcd('NOW HEARING ' + ab.slot, 1500); }
    $('#btnAB').lastChild.textContent = 'A/B \u00b7 ' + ab.slot; $('#btnAB').classList.toggle('on', ab.slot === 'B');
  };
  // LOCK: no knob, button or fader moves until you unlock (for during a call)
  $('#btnLock').onclick = () => { state.locked = !state.locked; $('#btnLock').classList.toggle('on', state.locked); $('#strip').classList.toggle('locked', state.locked); flashLcd(state.locked ? 'PANEL LOCKED \u00b7 PRESS LOCK AGAIN TO UNLOCK' : 'PANEL UNLOCKED', 2500); };
  // SHARE: the download link for friends + settings as a code
  $('#btnShare').onclick = () => { $('#shareBox').hidden = false; $('#shareCopied').textContent = ''; };
  $('#shareClose').onclick = () => { $('#shareBox').hidden = true; };
  $('#shareCopy').onclick = async () => { try { await navigator.clipboard.writeText(SHARE_URL); $('#shareCopied').textContent = 'COPIED \u00b7 PASTE IT IN A TEXT OR EMAIL'; } catch { $('#shareCopied').textContent = 'COULD NOT COPY \u00b7 SELECT THE LINK AND PRESS CTRL+C'; } };
  $('#shareCodeCopy').onclick = async () => {
    const code = 'CS1:' + btoa(unescape(encodeURIComponent(JSON.stringify(presetOnly(state.params)))));
    try { await navigator.clipboard.writeText(code); $('#shareCopied').textContent = 'SETTINGS CODE COPIED \u00b7 A FRIEND LOADS IT WITH PASTE CODE'; } catch { $('#shareCopied').textContent = 'COULD NOT COPY'; }
  };
  $('#shareCodePaste').onclick = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (!t.startsWith('CS1:')) { $('#shareCopied').textContent = 'THAT IS NOT A SETTINGS CODE'; return; }
      const obj = JSON.parse(decodeURIComponent(escape(atob(t.slice(4)))));
      state.params = Object.assign(DEFAULT_PARAMS(), obj, { fader: state.params.fader, phones: state.params.phones, mute: state.params.mute });
      renderAll(); changed(); $('#shareCopied').textContent = 'SETTINGS LOADED FROM THE CODE'; log('settings code pasted');
    } catch (e) { $('#shareCopied').textContent = 'COULD NOT READ THAT CODE'; }
  };
  // Keyboard: M mute, B bypass, R record, P play, L lock, Ctrl+Z undo, Ctrl+Y redo, Ctrl+S save preset, Esc closes boxes
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (e.ctrlKey && k === 's') { e.preventDefault(); $('#btnSavePreset').click(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (k === 'm') togEls.mute.click(); else if (k === 'b') togEls.bypass.click(); else if (k === 'r') $('#btnRec').click();
    else if (k === 'p') $('#btnPlay').click(); else if (k === 'l') $('#btnLock').click(); else if (k === 'c') setCompact(!state.compact);
    else if (k === 'escape') { $('#shareBox').hidden = true; $('#logBox').hidden = true; }
  });
  // REC: 10 s of what goes INTO the strip (left) and what the cable GETS (right), as a WAV Claude can listen to
  $('#btnRec').onclick = () => {
    if (!running || !node || $('#btnRec').classList.contains('on')) return;
    if (playing) setPlay(false);
    $('#btnRec').classList.add('on'); node.port.postMessage({ type: 'rec', seconds: REC_SECS });
    let left = REC_SECS; lcd(`RECORDING ${left} s · TALK NORMALLY`); log('REC start');
    clearInterval(recTimer); recTimer = setInterval(() => { left--; if (left > 0) lcd(`RECORDING ${left} s · TALK NORMALLY`, false, true); else clearInterval(recTimer); }, 1000);
  };
  // PLAY: loop the take through the strip into your headphones, so you can turn knobs and compare
  $('#btnPlay').onclick = () => { if (take) setPlay(!playing); };
  $('#verLabel').onclick = async () => {
    // tidy the markdown: drop the title, join wrapped lines, headings in bold
    const raw = (await window.cs.changelog()).replace(/^# Changelog\s*/, '').replace(/\n {2,}/g, ' ');
    $('#logText').innerHTML = raw.split('\n').map(l => l.startsWith('## ') ? '<b>' + l.slice(3).replace(/</g, '&lt;') + '</b>' : l.replace(/</g, '&lt;')).join('\n');
    $('#logBox').hidden = false;
  };
  if (location.hash === '#shotlog') $('#verLabel').onclick();
  $('#logClose').onclick = () => { $('#logBox').hidden = true; };
  // Health ticker: audio clock vs wall clock once a second; counts on the LCD while running
  setInterval(() => {
    if (!ctx || !running) { health.wall = 0; return; }
    const now = performance.now(), ct = ctx.currentTime;
    if (health.wall) { const off = (ct - health.ct) - (now - health.wall) / 1000; if (Math.abs(off) > 0.03) { health.hiccups++; log(`AUDIO CLOCK SLIP ${Math.round(off * 1000)} ms (total ${health.hiccups})`); } }
    health.wall = now; health.ct = ct;
    if (!learning && !leveling && $('#lcd').textContent.startsWith('RUN')) lcd(runLcd + healthText(), false, true);
  }, 1000);
  // SEND LOG: ask for the OnFleek PIN once, then post the log file to windows.onfleek.live
  const sendLog = async (pin) => {
    lcd('SENDING LOG\u2026');
    try { const name = await window.cs.sendLog(pin); state.logPin = pin; save(); flashLcd('LOG SENT \u00b7 TELL CLAUDE TO READ ' + name, 6000); }
    catch (e) { const m = String(e.message || e); if (/bad pin|401/i.test(m)) { state.logPin = ''; save(); lcd('WRONG PIN \u00b7 PRESS SEND LOG AGAIN', true); } else lcd('LOG NOT SENT: ' + m.slice(0, 60), true); }
  };
  $('#btnLog').onclick = () => { if (state.logPin) sendLog(state.logPin); else { $('#pinInput').value = ''; $('#pinBox').hidden = false; setTimeout(() => $('#pinInput').focus(), 50); } };
  $('#pinCancel').onclick = () => { $('#pinBox').hidden = true; };
  $('#pinOk').onclick = () => { const pin = $('#pinInput').value.trim(); $('#pinBox').hidden = true; if (pin) sendLog(pin); };
  $('#pinInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#pinOk').click(); if (e.key === 'Escape') $('#pinCancel').click(); });
  $('#cableLink').onclick = e => { e.preventDefault(); window.cs.openExternal('https://vb-audio.com/Cable/'); };
  window.cs.onCableProgress(s => lcd({ download: 'DOWNLOADING VB-CABLE…', extract: 'UNPACKING…', launch: 'OPENING VB-CABLE SETUP · CLICK YES' }[s] || s));
  $('#btnCable').onclick = async () => {
    const b = $('#btnCable'); b.disabled = true; $('#ckCable').classList.add('busy');
    try {
      await window.cs.installCable();
      lcd('IN VB-CABLE: CLICK "INSTALL DRIVER", THEN RESTART PC');
      $('#cableHintText').textContent = 'VB-CABLE setup is open. Click “Install Driver”, then restart the PC. When you come back, this app finds the cable by itself.';
      let tries = 0; const poll = setInterval(async () => {
        const { outs } = await refreshDevices();
        const c = cableOut();
        if (c) { clearInterval(poll); state.outputId = c.deviceId; save(); applySink(); renderSetup(); flashLcd('CABLE FOUND · NOW PRESS NAME IT', 4000); }
        else if (++tries > 60) clearInterval(poll);
      }, 5000);
    } catch (e) { lcd('CABLE INSTALL FAILED: ' + (e.message || e), true); b.disabled = false; }
  };
  $('#btnPower').onclick = () => running ? stop() : start();
  $('#selIn').onchange = () => { state.inputId = $('#selIn').value; save(); if (running) restart(); };
  $('#selPhones').onchange = () => { state.phonesId = $('#selPhones').value; save(); applyMonSink(); };
  $('#btnMon').classList.toggle('on', !!state.mon);
  $('#btnMon').onclick = async () => { state.mon = state.mon ? 0 : 1; $('#btnMon').classList.toggle('on', !!state.mon); save(); if (state.mon) await startMon(); else await stopMon(); };
  $('#btnDefault').onclick = async () => {
    const cab = cableOut(); if (!cab) return;
    const want = micSideRenamed() ? MIC_NAME : otherAppsMic(cab.label);
    $('#ckDefault').classList.add('busy'); lcd(`TELLING WINDOWS: DEFAULT MIC = \u201c${want}\u201d\u2026`);
    const before = defaults && defaults.communications || '';
    const r = await window.cs.audioSetDefault(want, familyKey(cab.label)); log('MAKE DEFAULT ' + want + ' [' + familyKey(cab.label) + ']: ' + r);
    await refreshDefaults();
    if (/^SET /.test(r)) {
      // Remember: your real mic comes back when this app quits, and the strip takes over again on start.
      if (before && before !== want) state.prevDefaultMic = before;
      state.wantDefault = 1; save(); window.cs.rememberDefault(state.prevDefaultMic, want);
      flashLcd('DONE · MEET / ZOOM / WEBEX NOW USE THE STRIP BY DEFAULT', 4000);
    }
    else lcd(/NOTFOUND/.test(r) ? `WINDOWS CANNOT SEE \u201c${want}\u201d YET \u00b7 RESTART THE PC` : 'COULD NOT SET DEFAULT: ' + String(r).slice(0, 50), true);
  };
  navigator.mediaDevices.addEventListener('devicechange', () => { refreshDevices(); clearTimeout(setupTimer); setupTimer = setTimeout(() => { refreshDefaults(); refreshFormats(); }, 1500); });
  window.addEventListener('resize', fit); fit();
  requestAnimationFrame(loop);
  await unlockLabels(); await refreshDevices();
  await start();
  if (rangeNote) { save(); flashLcd(rangeNote, 6000); log(rangeNote); }
  await refreshDefaults();
  refreshFormats();
  $('#btnFormat').onclick = async () => {
    const cab = cableOut(); if (!cab) return;
    const key = familyKey(cab.label), feedName = (cab.label || '').replace(/\s*\(.*$/, '');
    const micName = micSideRenamed() ? MIC_NAME : otherAppsMic(cab.label);
    $('#ckFormat').classList.add('busy'); lcd(`SETTING BOTH CABLE SIDES TO ${CABLE_RATE} Hz\u2026`);
    const r1 = await window.cs.audioSetFormat(feedName, key, 'Render', CABLE_RATE); log('setformat feed: ' + r1);
    const r2 = await window.cs.audioSetFormat(micName, key, 'Capture', CABLE_RATE); log('setformat mic: ' + r2);
    const ok1 = /^SETFORMAT/.test(r1), ok2 = /^SETFORMAT/.test(r2);
    await refreshFormats();
    if (ok1 && ok2) { flashLcd(`CABLE SET TO ${CABLE_RATE} Hz ON BOTH SIDES \u00b7 RESTARTING ENGINE`, 4000); await restart(); }
    else lcd(`COULD NOT SET RATE (${ok1 ? 'feed ok' : 'feed: ' + String(r1).slice(0, 30)} / ${ok2 ? 'mic ok' : 'mic: ' + String(r2).slice(0, 30)}) \u00b7 SET IT IN WINDOWS SOUND SETTINGS`, true);
  };
  // Take over again if you asked for that before (the app hands the old mic back on quit).
  if (state.wantDefault && cableOut() && defaults && !defaults.error) {
    const want = micSideRenamed() ? MIC_NAME : otherAppsMic(cableOut().label);
    const all = [defaults.console, defaults.multimedia, defaults.communications];
    window.cs.rememberDefault(state.prevDefaultMic, want);
    const fams = [defaults.consoleAdapter, defaults.multimediaAdapter, defaults.communicationsAdapter].map(a => family('(' + (a || '') + ')'));
    if (!all.every(n => (n || '') === want) || !fams.every(f => f === family(cableOut().label))) { const r = await window.cs.audioSetDefault(want, familyKey(cableOut().label)); if (/^SET /.test(r)) await refreshDefaults(); }
  }
  setupUpdates();
}
boot();
})();
