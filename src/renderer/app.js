/* OnFleek Channel Strip — front panel logic */
(() => {
const $ = (s, r = document) => r.querySelector(s);
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
  gateRange:   { min: 0, max: 60, def: 20, fmt: v => '-' + v.toFixed(0) + ' dB' },
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
  lfGain:      { min: -15, max: 15, def: 1, fmt: dbs, center: true }
};
const TOG = { filtersIn: 1, gateIn: 1, gateExp: 1, compIn: 1, eqIn: 1, hfBell: 0, lfBell: 0, bypass: 0 };

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
const state = { params: DEFAULT_PARAMS(), inputId: '', outputId: '', preset: 'Voice – Natural' };
let ctx = null, node = null, stream = null, running = false, listen = false, version = '0.0.0';
const meter = { inPk: 0, outPk: 0, gr: 0, gateRed: 0, gateOpen: false };

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
  const set = (v, fromUser) => { state.params[id] = v; renderKnob(id); if (fromUser) changed(); };
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
  btn.addEventListener('click', () => { state.params[id] = state.params[id] ? 0 : 1; renderToggle(id); changed(); });
}
function renderToggle(id) { togEls[id] && togEls[id].classList.toggle('on', !!state.params[id]); }

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
const TRACK_TOP = 10, TRACK_H = 310;
function buildFader() {
  const scale = $('#fscale');
  [[10, '+10'], [5, '+5'], [0, '0'], [-5, '5'], [-10, '10'], [-20, '20'], [-30, '30'], [-40, '40'], [-60, '60'], [-90, '∞']].forEach(([d, t]) => {
    const s = document.createElement('span'); s.textContent = t; s.style.top = ((1 - faderDbToPos(d)) * TRACK_H) + 'px'; if (d === 0) s.className = 'zero'; scale.appendChild(s);
  });
  const cap = $('#fcap'), fader = $('#fader');
  let dragging = false, lastY = 0;
  cap.addEventListener('pointerdown', e => { dragging = true; lastY = e.clientY; cap.setPointerCapture(e.pointerId); e.preventDefault(); });
  cap.addEventListener('pointermove', e => {
    if (!dragging) return;
    const s = currentScale(); const dy = (lastY - e.clientY) / s; lastY = e.clientY;
    const p = clamp(faderDbToPos(state.params.fader) + dy / TRACK_H * (e.shiftKey ? 0.2 : 1), 0, 1);
    state.params.fader = faderPosToDb(p); renderFader(); changed();
  });
  const end = () => { dragging = false; };
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
function renderAll() { for (const id in knobEls) renderKnob(id); for (const id in togEls) renderToggle(id); renderFader(); $('#selPreset').value = state.preset in PRESETS ? state.preset : ''; }
let sendPending = false, saveTimer = 0;
function changed(keepPreset) {
  if (!keepPreset && state.preset !== '') { state.preset = ''; $('#selPreset').value = ''; }
  if (!sendPending) { sendPending = true; requestAnimationFrame(() => { sendPending = false; sendParams(); }); }
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 400);
}
function sendParams() { if (node) node.port.postMessage({ type: 'params', p: state.params }); }
function save() { window.cs.saveState(state).catch(() => {}); }

/* ---------- presets ---------- */
function buildPresets() {
  const sel = $('#selPreset');
  sel.innerHTML = Object.keys(PRESETS).map(n => `<option value="${n}">${n}</option>`).join('') + '<option value="">Custom</option>';
  sel.addEventListener('change', () => {
    if (!sel.value) return;
    state.params = Object.assign(DEFAULT_PARAMS(), PRESETS[sel.value]); state.preset = sel.value; renderAll(); changed(true);
  });
}

/* ---------- audio engine ---------- */
const lcd = (t, err) => { const e = $('#lcd'); e.textContent = t; e.classList.toggle('err', !!err); };
// Playback devices that feed a virtual mic: VB-CABLE, or Voicemeeter's virtual inputs.
const CABLE_RX = /cable input|voicemeeter (aux |vaio3 )?input/i;
function otherAppsMic(label) {
  label = label || '';
  if (/cable input/i.test(label)) return 'CABLE Output';
  if (/voicemeeter aux input/i.test(label)) return 'Voicemeeter Out B2';
  if (/voicemeeter vaio3 input/i.test(label)) return 'Voicemeeter Out B3';
  if (/voicemeeter input/i.test(label)) return 'Voicemeeter Out B1';
  return '';
}
function renderMicHint() {
  const sel = $('#selOut'); const label = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
  const m = otherAppsMic(label);
  $('#micHint').textContent = m ? `IN ZOOM / DISCORD / OBS PICK MIC: ${m}` : '';
}
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
  state.inputId = fill($('#selIn'), ins, state.inputId, d => /virtual mic|virtual usb/i.test(d.label));
  state.outputId = fill($('#selOut'), outs, state.outputId, d => CABLE_RX.test(d.label));
  const cable = outs.some(d => CABLE_RX.test(d.label));
  $('#ledCable').classList.toggle('on', cable);
  $('#cableHint').hidden = cable;
  renderMicHint();
  return { ins, outs };
}
async function unlockLabels() { // first getUserMedia grants device labels
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch {}
}
async function applySink() {
  if (!ctx || !ctx.setSinkId) return;
  const id = listen ? '' : (state.outputId === 'default' ? '' : state.outputId);
  try { await ctx.setSinkId(id); } catch (e) { lcd('OUTPUT DEVICE FAILED', true); }
}
async function start() {
  if (running) return;
  try {
    lcd('STARTING…');
    ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule('worklet/strip-processor.js');
    const constraints = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } };
    if (state.inputId && state.inputId !== 'default') constraints.audio.deviceId = { exact: state.inputId };
    try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
    catch (e) { delete constraints.audio.deviceId; stream = await navigator.mediaDevices.getUserMedia(constraints); lcd('SAVED MIC MISSING · USING DEFAULT', true); }
    const src = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, 'strip-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    node.port.onmessage = e => { if (e.data.type === 'meter') Object.assign(meter, e.data); };
    src.connect(node).connect(ctx.destination);
    sendParams();
    await applySink();
    await ctx.resume();
    running = true;
    $('#btnPower').classList.add('on'); $('.led', $('#btnPower')).classList.add('on');
    const lat = Math.round(((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000);
    lcd(`RUN · ${(ctx.sampleRate / 1000).toFixed(1)} kHz · ${lat} ms`);
  } catch (e) {
    lcd('MIC ERROR: ' + (e.message || e.name), true); await stop();
  }
}
async function stop() {
  running = false;
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (ctx) { try { await ctx.close(); } catch {} ctx = null; node = null; }
  $('#btnPower').classList.remove('on'); $('.led', $('#btnPower')).classList.remove('on');
  Object.assign(meter, { inPk: 0, outPk: 0, gr: 0, gateRed: 0, gateOpen: false });
  if (!$('#lcd').classList.contains('err')) lcd('STANDBY');
}
async function restart() { await stop(); await start(); }

/* ---------- meters ---------- */
const cv = $('#meters'), g = cv.getContext('2d');
const DPR = Math.min(2, window.devicePixelRatio || 1);
cv.width = 150 * DPR; cv.height = 270 * DPR; g.scale(DPR, DPR);
const disp = { in: -90, out: -90, gr: 0, inHold: -90, outHold: -90, inHoldT: 0, outHoldT: 0, clipIn: 0, clipOut: 0 };
const SEGS = 30;
function segDb(k) { // segment k (0 = bottom) lights at this dB
  if (k < 10) return -60 + k * 3; if (k < 20) return -30 + (k - 10) * 1.8; return -12 + (k - 20) * 1.2;
}
function segColor(d, lit) {
  if (d >= -6) return lit ? '#ff4a3c' : '#3a1512';
  if (d >= -18) return lit ? '#ffc23a' : '#3a3012';
  return lit ? '#4cff6a' : '#123a1a';
}
function drawColumn(x, level, hold, label) {
  const top = 26, h = 220, sh = h / SEGS;
  g.fillStyle = '#0b0c0d'; g.fillRect(x - 4, top - 4, 30, h + 8);
  for (let k = 0; k < SEGS; k++) {
    const d = segDb(k), lit = level >= d, y = top + h - (k + 1) * sh + 1;
    g.fillStyle = segColor(d, lit);
    if (lit) { g.shadowColor = g.fillStyle; g.shadowBlur = 5; } else g.shadowBlur = 0;
    g.fillRect(x, y, 22, sh - 2);
  }
  g.shadowBlur = 0;
  // peak hold marker
  if (hold > -60) {
    let k = 0; for (let i = 0; i < SEGS; i++) if (hold >= segDb(i)) k = i;
    const y = top + h - (k + 1) * sh + 1; g.fillStyle = '#ffffff'; g.fillRect(x, y, 22, 1.5);
  }
  g.fillStyle = '#c9c7bc'; g.font = '700 9px Bahnschrift, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.fillText(label, x + 11, 16);
}
function drawGR(x, gr) {
  const top = 26, h = 220, N = 20, sh = h / N;
  g.fillStyle = '#0b0c0d'; g.fillRect(x - 4, top - 4, 30, h + 8);
  for (let k = 0; k < N; k++) {
    const lit = gr >= k + 0.5, y = top + k * sh + 1;
    g.fillStyle = lit ? '#ffb02e' : '#3a2a10';
    if (lit) { g.shadowColor = '#ffb02e'; g.shadowBlur = 5; } else g.shadowBlur = 0;
    g.fillRect(x, y, 22, sh - 2);
  }
  g.shadowBlur = 0;
  g.fillStyle = '#c9c7bc'; g.font = '700 9px Bahnschrift, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.fillText('GR', x + 11, 16);
}
function drawScale() {
  g.fillStyle = '#8f8d84'; g.font = '600 7px Bahnschrift, "Arial Narrow", sans-serif'; g.textAlign = 'center';
  const top = 26, h = 220;
  [0, -6, -12, -18, -30, -40, -60].forEach(d => {
    let k = 0; for (let i = 0; i < SEGS; i++) if (d >= segDb(i)) k = i;
    const y = top + h - (k + 0.5) * (h / SEGS) + 2.5; g.fillText(d === 0 ? '0' : String(-d), 47, y); g.fillText(d === 0 ? '0' : String(-d), 105, y);
  });
  g.textAlign = 'left';
  [0, 5, 10, 15, 20].forEach(d => { g.fillText(String(d), 87, top + d * (h / 20) + 5); });
  g.font = '600 6.5px Bahnschrift, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#6b6a64';
  g.fillText('dBFS', 47, 262); g.fillText('dB', 91, 262); g.fillText('dBFS', 105, 262);
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
  g.clearRect(0, 0, 150, 270);
  drawColumn(18, disp.in, disp.inHold, 'IN'); drawGR(60, disp.gr); drawColumn(114, disp.out, disp.outHold, 'OUT'); drawScale();
  $('#grReadout').textContent = disp.gr.toFixed(1);
  const gateOn = running && state.params.gateIn && !state.params.bypass;
  $('#ledGateOpen').classList.toggle('on', gateOn && meter.gateOpen);
  $('#ledGateRed').classList.toggle('on', gateOn && meter.gateRed > 0.5);
  requestAnimationFrame(loop);
}

/* ---------- scale to fit window ---------- */
const strip = $('#strip');
let scaleNow = 1;
const currentScale = () => scaleNow;
function fit() {
  const w = window.innerWidth, h = window.innerHeight, natH = strip.offsetHeight, natW = 560;
  scaleNow = Math.min(w / natW, h / natH);
  strip.style.transform = `translateX(-50%) scale(${scaleNow})`;
}

/* ---------- updates ---------- */
const REPO = 'nojokebeatz/onfleek-channel-strip';
function cmpVer(a, b) { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); } return 0; }
function showUpdateBar(text, btnText, onClick) {
  $('#updateText').textContent = text; const b = $('#updateBtn');
  b.textContent = btnText; b.hidden = !onClick; b.onclick = onClick || null;
  $('#updateBar').hidden = false; fit();
}
async function checkUpdateManual() { // portable / dev: look at GitHub, offer the download page
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return; const j = await r.json(); const latest = (j.tag_name || '').replace(/^v/, '');
    if (latest && cmpVer(latest, version) > 0) showUpdateBar(`NEW VERSION ${latest} IS READY`, 'GET IT', () => window.cs.openExternal(j.html_url));
  } catch {}
}
async function setupUpdates() {
  const mode = await window.cs.updateMode();
  if (mode !== 'auto') { checkUpdateManual(); setInterval(checkUpdateManual, 3600 * 1000); return; }
  window.cs.onUpdateEvent(d => {
    if (d.type === 'available') showUpdateBar(`NEW VERSION ${d.version} · DOWNLOADING…`, '', null);
    else if (d.type === 'progress') showUpdateBar(`NEW VERSION · DOWNLOADING ${d.percent}%`, '', null);
    else if (d.type === 'downloaded') showUpdateBar(`VERSION ${d.version} IS READY`, 'RESTART TO UPDATE', () => window.cs.updateInstall());
    else if (d.type === 'error') console.warn('updater:', d.message);
  });
  window.cs.updateCheck(); setInterval(() => window.cs.updateCheck(), 3600 * 1000);
}

/* ---------- boot ---------- */
async function boot() {
  version = await window.cs.version(); $('#verLabel').textContent = 'v' + version;
  $$('[data-knob]').forEach(buildKnob); $$('[data-tog]').forEach(buildToggle); buildFader(); buildPresets();
  const saved = await window.cs.loadState();
  if (saved && saved.params) { state.params = Object.assign(DEFAULT_PARAMS(), saved.params); state.inputId = saved.inputId || ''; state.outputId = saved.outputId || ''; state.preset = saved.preset ?? 'Voice – Natural'; }
  renderAll();
  $('#btnMin').onclick = () => window.cs.minimize(); $('#btnClose').onclick = () => window.cs.close();
  $('#cableLink').onclick = e => { e.preventDefault(); window.cs.openExternal('https://vb-audio.com/Cable/'); };
  window.cs.onCableProgress(s => lcd({ download: 'DOWNLOADING VB-CABLE…', extract: 'UNPACKING…', launch: 'OPENING VB-CABLE SETUP · CLICK YES' }[s] || s));
  $('#btnCable').onclick = async () => {
    const b = $('#btnCable'); b.disabled = true;
    try {
      await window.cs.installCable();
      lcd('IN VB-CABLE: CLICK "INSTALL DRIVER", THEN RESTART PC');
      $('#cableHintText').textContent = 'VB-CABLE setup is open. Click “Install Driver”, then restart the PC. When you come back, this app picks CABLE Input by itself.';
      let tries = 0; const poll = setInterval(async () => {
        const { outs } = await refreshDevices();
        const c = outs.find(d => CABLE_RX.test(d.label));
        if (c) { clearInterval(poll); state.outputId = c.deviceId; $('#selOut').value = c.deviceId; save(); applySink(); renderMicHint(); lcd('CABLE FOUND · SEND TO = CABLE INPUT'); }
        else if (++tries > 60) clearInterval(poll);
      }, 5000);
    } catch (e) { lcd('CABLE INSTALL FAILED: ' + (e.message || e), true); b.disabled = false; }
  };
  $('#btnPower').onclick = () => running ? stop() : start();
  $('#btnListen').onclick = () => { listen = !listen; $('#btnListen').classList.toggle('on', listen); applySink(); };
  $('#selIn').onchange = () => { state.inputId = $('#selIn').value; save(); if (running) restart(); };
  $('#selOut').onchange = () => { state.outputId = $('#selOut').value; save(); applySink(); renderMicHint(); };
  navigator.mediaDevices.addEventListener('devicechange', () => refreshDevices());
  window.addEventListener('resize', fit); new ResizeObserver(fit).observe(strip); fit();
  requestAnimationFrame(loop);
  await unlockLabels(); await refreshDevices();
  await start();
  setupUpdates();
}
boot();
})();
