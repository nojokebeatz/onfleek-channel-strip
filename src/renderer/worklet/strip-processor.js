// OnFleek Channel Strip — DSP. Runs on the audio thread (AudioWorklet).
// Signal flow: mic -> trim -> filters -> gate/expander -> compressor -> EQ -> fader -> out
const DB = (g) => 20 * Math.log10(g);
const LIN = (db) => Math.pow(10, db / 20);
const TC = (ms, sr) => 1 - Math.exp(-1 / (Math.max(0.01, ms) * 0.001 * sr));
const HYST = 4;   // gate opens at THRESHOLD, closes HYST dB below it (the panel draws both lines)

class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  reset() { this.z1 = 0; this.z2 = 0; }
  set(b0, b1, b2, a0, a1, a2) { this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0; }
  process(x) { // transposed direct form II
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  lowpass(f, Q, sr) { const w = 2 * Math.PI * f / sr, c = Math.cos(w), a = Math.sin(w) / (2 * Q); this.set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + a, -2 * c, 1 - a); }
  highpass(f, Q, sr) { const w = 2 * Math.PI * f / sr, c = Math.cos(w), a = Math.sin(w) / (2 * Q); this.set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + a, -2 * c, 1 - a); }
  bandpass(f, Q, sr) { const w = 2 * Math.PI * f / sr, c = Math.cos(w), a = Math.sin(w) / (2 * Q); this.set(a, 0, -a, 1 + a, -2 * c, 1 - a); }
  peaking(f, Q, gdb, sr) {
    const A = Math.pow(10, gdb / 40), w = 2 * Math.PI * f / sr, c = Math.cos(w), a = Math.sin(w) / (2 * Q);
    this.set(1 + a * A, -2 * c, 1 - a * A, 1 + a / A, -2 * c, 1 - a / A);
  }
  lowshelf(f, Q, gdb, sr) {
    const A = Math.pow(10, gdb / 40), w = 2 * Math.PI * f / sr, c = Math.cos(w), s = Math.sin(w);
    const a = (s / 2) * Math.sqrt((A + 1 / A) * (1 / Q - 1) + 2), r = 2 * Math.sqrt(A) * a;
    this.set(A * ((A + 1) - (A - 1) * c + r), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - r),
             (A + 1) + (A - 1) * c + r, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - r);
  }
  highshelf(f, Q, gdb, sr) {
    const A = Math.pow(10, gdb / 40), w = 2 * Math.PI * f / sr, c = Math.cos(w), s = Math.sin(w);
    const a = (s / 2) * Math.sqrt((A + 1 / A) * (1 / Q - 1) + 2), r = 2 * Math.sqrt(A) * a;
    this.set(A * ((A + 1) + (A - 1) * c + r), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - r),
             (A + 1) - (A - 1) * c + r, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - r);
  }
}

class OnePoleHP { // 6 dB/oct high-pass; cascaded with a Q=1 biquad it gives the SSL-style 18 dB/oct slope
  constructor() { this.k = 0; this.x1 = 0; this.y1 = 0; }
  set(f, sr) { this.k = Math.exp(-2 * Math.PI * f / sr); }
  reset() { this.x1 = 0; this.y1 = 0; }
  process(x) { const y = this.k * (this.y1 + x - this.x1); this.x1 = x; this.y1 = y; return y; }
}

const DEFAULTS = {
  trim: 0, filtersIn: 1, hpf: 80, lpf: 18000,
  gateIn: 1, gateExp: 1, gateThresh: -45, gateRange: 80, gateAttack: 1, gateHold: 50, gateRelease: 150,
  compIn: 1, compThresh: -18, compRatio: 3, compAttack: 10, compRelease: 150, compMakeup: 4, compMix: 100,
  eqIn: 1, hfFreq: 12000, hfGain: 1.5, hfBell: 0, hmfFreq: 3000, hmfGain: 1.5, hmfQ: 1,
  lmfFreq: 300, lmfGain: -1.5, lmfQ: 1, lfFreq: 100, lfGain: 1, lfBell: 0,
  fader: 0, bypass: 0, mute: 0, limIn: 1,
  deIn: 1, deFreq: 6500, deAmt: 40
};

class StripProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = Object.assign({}, DEFAULTS);
    this.hp1 = new OnePoleHP(); this.hp2 = new Biquad(); this.lp = new Biquad();
    this.eqLF = new Biquad(); this.eqLMF = new Biquad(); this.eqHMF = new Biquad(); this.eqHF = new Biquad();
    this.gateEnv = 0; this.gateGain = 1; this.gateOpen = false; this.holdCount = 0;
    this.compGr = 0; this.compEnv = 0;
    this.trimG = 1; this.makeupG = 1; this.faderG = 1; this.mixW = 1;
    this.muteG = 1; this.limG = 1; this.limRedMax = 0; this.dl = new Float32Array(256); this.dlPos = 0;
    this.deBp = new Biquad(); this.deEnv = 0; this.deGr = 0; this.deRedMax = 0;
    this.dn = 1e-18;
    this.pkIn = 0; this.pkOut = 0; this.grMax = 0; this.gateRedMax = 0; this.count = 0;
    this.gateLvlMax = -120; this.clipCount = 0; this.nanCount = 0;
    this.recIn = null; this.recOut = null; this.recPos = 0; this.take = null; this.playing = false; this.playPos = 0;
    this.port.onmessage = (e) => {
      if (e.data.type === 'params') { Object.assign(this.p, e.data.p); this.update(); }
      else if (e.data.type === 'take') { this.take = e.data.buf; this.playPos = 0; }
      else if (e.data.type === 'play') { this.playing = !!e.data.on && !!this.take; this.playPos = 0; }
      else if (e.data.type === 'rec') { const n = Math.round(Math.min(30, e.data.seconds || 10) * sampleRate); this.recIn = new Float32Array(n); this.recOut = new Float32Array(n); this.recPos = 0; }
    };
    this.update();
  }
  update() {
    const p = this.p, sr = sampleRate;
    this.hp1.set(p.hpf, sr); this.hp2.highpass(p.hpf, 1.0, sr); this.lp.lowpass(p.lpf, 0.7071, sr);
    if (p.lfBell) this.eqLF.peaking(p.lfFreq, 0.8, p.lfGain, sr); else this.eqLF.lowshelf(p.lfFreq, 0.7071, p.lfGain, sr);
    this.eqLMF.peaking(p.lmfFreq, p.lmfQ, p.lmfGain, sr);
    this.eqHMF.peaking(p.hmfFreq, p.hmfQ, p.hmfGain, sr);
    if (p.hfBell) this.eqHF.peaking(p.hfFreq, 0.8, p.hfGain, sr); else this.eqHF.highshelf(p.hfFreq, 0.7071, p.hfGain, sr);
    this.gAtk = TC(p.gateAttack, sr); this.gRel = TC(p.gateRelease, sr);
    this.holdSamples = Math.round(p.gateHold * 0.001 * sr);
    this.gEnvAtk = TC(0.05, sr); this.gEnvRel = TC(25, sr);
    this.gateRatio = p.gateExp ? 4 : 1000;           // expander 1:4 (steep), or a hard gate
    this.cAtk = TC(p.compAttack, sr); this.cRel = TC(p.compRelease, sr);
    this.cEnvAtk = TC(0.02, sr); this.cEnvRel = TC(8, sr);   // sidechain peak follower
    this.trimT = LIN(p.trim); this.makeupT = LIN(p.compMakeup);
    this.faderT = p.fader <= -89 ? 0 : LIN(p.fader);
    this.mixT = p.compMix / 100;
    this.sm = TC(8, sr); // gain-change smoothing (anti-zipper)
    this.muteT = p.mute ? 0 : 1;
    // De-esser: listen to a narrow band around deFreq; when it pokes above the threshold, pull that band down.
    this.deBp.bandpass(p.deFreq, 2.5, sr);
    this.deThr = -10 - p.deAmt * 0.5;               // AMOUNT 0 % = -10 dBFS (barely), 100 % = -60 dBFS (always)
    this.deEnvAtk = TC(0.3, sr); this.deEnvRel = TC(30, sr); this.deAtk = TC(0.5, sr); this.deRel = TC(60, sr);
    this.limN = Math.min(255, Math.max(1, Math.round(0.001 * sr)));   // 1 ms look-ahead
    this.limAtk = TC(0.15, sr); this.limRel = TC(80, sr); this.limCeil = LIN(-1);
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const n = out[0] ? out[0].length : 128;
    const p = this.p, sm = this.sm;
    for (let i = 0; i < n; i++) {
      let x = 0;
      if (inp.length === 1) x = inp[0][i]; else if (inp.length > 1) x = 0.5 * (inp[0][i] + inp[1][i]);
      if (this.playing) { x = this.take[this.playPos]; this.playPos = (this.playPos + 1) % this.take.length; }   // PLAY: the saved take instead of the mic
      this.dn = -this.dn; x += this.dn;
      const raw = x;
      this.trimG += (this.trimT - this.trimG) * sm; x *= this.trimG;
      const xin = x;
      const ax = Math.abs(x); if (ax > this.pkIn) this.pkIn = ax;
      if (!p.bypass) {
        if (p.filtersIn) { x = this.hp2.process(this.hp1.process(x)); x = this.lp.process(x); }
        if (p.gateIn) {
          const a = Math.abs(x);
          this.gateEnv += (a > this.gateEnv ? this.gEnvAtk : this.gEnvRel) * (a - this.gateEnv);
          const lvl = DB(this.gateEnv + 1e-9); if (lvl > this.gateLvlMax) this.gateLvlMax = lvl;
          const thr = this.gateOpen ? p.gateThresh - HYST : p.gateThresh; // hysteresis: opens at T, closes at T - HYST
          let red = 0;
          if (lvl >= thr) { this.gateOpen = true; this.holdCount = this.holdSamples; }
          else if (this.holdCount > 0) { this.holdCount--; }
          else { this.gateOpen = false; red = Math.min(p.gateRange, (thr - lvl) * (this.gateRatio - 1)); }
          const target = red >= 79 ? 0 : LIN(-red);   // RANGE at FULL = dead silent
          this.gateGain += (target > this.gateGain ? this.gAtk : this.gRel) * (target - this.gateGain);
          if (target === 0 && this.gateGain < 1e-6) this.gateGain = 0;   // floor: never let the gain crawl into denormal land
          x *= this.gateGain; x += this.dn;                                // keep the filters after the gate out of denormals too
          const gr = -DB(this.gateGain + 1e-9); if (gr > this.gateRedMax) this.gateRedMax = gr;
        } else { this.gateGain = 1; this.gateOpen = true; }
        if (p.compIn) {
          const dry = x;
          const ca = Math.abs(x);
          this.compEnv += (ca > this.compEnv ? this.cEnvAtk : this.cEnvRel) * (ca - this.compEnv);
          const over = DB(this.compEnv + 1e-9) - p.compThresh, W = 6, R = p.compRatio;
          let gr;
          if (over <= -W / 2) gr = 0;
          else if (over < W / 2) { const t = over + W / 2; gr = (1 - 1 / R) * t * t / (2 * W); }
          else gr = over * (1 - 1 / R);
          this.compGr += (gr > this.compGr ? this.cAtk : this.cRel) * (gr - this.compGr);
          this.makeupG += (this.makeupT - this.makeupG) * sm; this.mixW += (this.mixT - this.mixW) * sm;
          const wet = x * LIN(-this.compGr) * this.makeupG;
          x = dry * (1 - this.mixW) + wet * this.mixW;
          if (this.compGr > this.grMax) this.grMax = this.compGr;
        } else { this.compGr += (0 - this.compGr) * this.cRel; }
        if (p.deIn) {
          const bp = this.deBp.process(x), a = Math.abs(bp);
          this.deEnv += (a > this.deEnv ? this.deEnvAtk : this.deEnvRel) * (a - this.deEnv);
          const over = DB(this.deEnv + 1e-9) - this.deThr;
          const want = over > 0 ? Math.min(12, over * 0.75) : 0;
          this.deGr += (want > this.deGr ? this.deAtk : this.deRel) * (want - this.deGr);
          x -= (1 - LIN(-this.deGr)) * bp;
          if (this.deGr > this.deRedMax) this.deRedMax = this.deGr;
        } else { this.deGr = 0; }
        if (p.eqIn) { x = this.eqLF.process(x); x = this.eqLMF.process(x); x = this.eqHMF.process(x); x = this.eqHF.process(x); }
        this.faderG += (this.faderT - this.faderG) * sm; x *= this.faderG;
        if (p.limIn) { // 1 ms look-ahead brick-wall limiter, ceiling -1 dBFS
          const ax2 = Math.abs(x), need = ax2 > this.limCeil ? this.limCeil / ax2 : 1;
          this.limG += (need < this.limG ? this.limAtk : this.limRel) * (need - this.limG);
          const buf = this.dl, rd = (this.dlPos - this.limN) & 255;
          const delayed = buf[rd]; buf[this.dlPos] = x; this.dlPos = (this.dlPos + 1) & 255;
          x = delayed * this.limG;
          if (x > this.limCeil) { x = this.limCeil; this.clipCount++; } else if (x < -this.limCeil) { x = -this.limCeil; this.clipCount++; }
          const lr = -DB(this.limG + 1e-9); if (lr > this.limRedMax) this.limRedMax = lr;
        } else { this.limG = 1; }
      } else { x = raw; }
      this.muteG += (this.muteT - this.muteG) * sm; x *= this.muteG;
      if (x !== x) { x = 0; this.nanCount++; }
      if (this.recIn) {
        if (this.recPos < this.recIn.length) { this.recIn[this.recPos] = raw; this.recOut[this.recPos] = x; this.recPos++; }
        else { const a = this.recIn, b = this.recOut; this.recIn = this.recOut = null; this.port.postMessage({ type: 'recDone', inBuf: a, outBuf: b, sr: sampleRate }, [a.buffer, b.buffer]); }
      }
      const ao = Math.abs(x); if (ao > this.pkOut) this.pkOut = ao;
      for (let c = 0; c < out.length; c++) out[c][i] = x;
    }
    this.count += n;
    if (this.count >= 1024) {
      this.port.postMessage({ type: 'meter', inPk: this.pkIn, outPk: this.pkOut, gr: this.grMax, gateRed: this.gateRedMax, gateOpen: this.gateOpen, lim: this.limRedMax, de: this.deRedMax,
        gateLvl: this.gateLvlMax, clips: this.clipCount, nans: this.nanCount, t: Date.now(), frames: this.count });
      this.count = 0; this.pkIn = this.pkOut = this.grMax = this.gateRedMax = this.limRedMax = this.deRedMax = 0; this.gateLvlMax = -120; this.clipCount = 0; this.nanCount = 0;
    }
    return true;
  }
}
registerProcessor('strip-processor', StripProcessor);
