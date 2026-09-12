// Runs the AudioWorklet DSP in plain Node and checks the numbers.
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'worklet', 'strip-processor.js'), 'utf8');
const SR = 48000;
let Proc = null;
class AudioWorkletProcessor { constructor() { this.port = { postMessage() {}, onmessage: null }; } }
new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', src)(AudioWorkletProcessor, (n, c) => { Proc = c; }, SR);

const FLAT = { trim: 0, filtersIn: 0, gateIn: 0, compIn: 0, eqIn: 0, bypass: 0, fader: 0, compMakeup: 0,
  hfGain: 0, hmfGain: 0, lmfGain: 0, lfGain: 0, limIn: 0, mute: 0, deIn: 0 };
const dB = (g) => 20 * Math.log10(g);

function run(params, freq, levelDb, seconds = 1.2) {
  const p = new Proc(); p.port.onmessage({ data: { type: 'params', p: Object.assign({}, FLAT, params) } });
  const amp = Math.pow(10, levelDb / 20); const N = Math.round(seconds * SR); let t = 0; let peak = 0;
  const inBuf = new Float32Array(128), outL = new Float32Array(128), outR = new Float32Array(128);
  for (let done = 0; done < N; done += 128) {
    for (let i = 0; i < 128; i++) inBuf[i] = amp * Math.sin(2 * Math.PI * freq * (t++) / SR);
    p.process([[inBuf]], [[outL, outR]]);
    if (done > N * 0.8) for (let i = 0; i < 128; i++) peak = Math.max(peak, Math.abs(outL[i]));
  }
  return dB(peak + 1e-12);
}

let fails = 0;
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol; if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${got.toFixed(2)} dB, want ${want} ±${tol}`);
}
check('flat passthrough 1k @ -6', run({}, 1000, -6), -6, 0.1);
check('master bypass ignores fader', run({ bypass: 1, fader: -20 }, 1000, -6), -6, 0.1);
check('fader -20', run({ fader: -20 }, 1000, -6), -26, 0.2);
check('trim +6', run({ trim: 6 }, 1000, -12), -6, 0.2);
check('HPF 200: 1k passes', run({ filtersIn: 1, hpf: 200, lpf: 20000 }, 1000, -6), -6, 0.5);
const hp50 = run({ filtersIn: 1, hpf: 200, lpf: 20000 }, 50, -6);
console.log(`${hp50 < -30 ? 'PASS' : 'FAIL'}  HPF 200 cuts 50 Hz hard: ${hp50.toFixed(1)} dB (want < -30)`); if (hp50 >= -30) fails++;
const lp = run({ filtersIn: 1, hpf: 20, lpf: 3000 }, 12000, -6);
console.log(`${lp < -25 ? 'PASS' : 'FAIL'}  LPF 3k cuts 12 kHz: ${lp.toFixed(1)} dB (want < -25)`); if (lp >= -25) fails++;
check('expander 1:4: -50 in, thr -45 (5 below) -> 15 dB down', run({ gateIn: 1, gateExp: 1, gateThresh: -45, gateRange: 40, gateAttack: 1, gateHold: 10, gateRelease: 50 }, 1000, -50), -65, 2);
check('expander 1:4: -60 in, thr -45, range 20 -> capped 20 dB down', run({ gateIn: 1, gateExp: 1, gateThresh: -45, gateRange: 20, gateAttack: 1, gateHold: 10, gateRelease: 50 }, 1000, -60), -80, 2);
const full = run({ gateIn: 1, gateExp: 0, gateThresh: -45, gateRange: 80, gateAttack: 1, gateHold: 10, gateRelease: 50 }, 1000, -60);
console.log(`${full < -100 ? 'PASS' : 'FAIL'}  hard gate at RANGE FULL is silent: ${full.toFixed(1)} dB (want < -100)`); if (full >= -100) fails++;
check('hard gate: -60 in, range 20 -> 20 dB down', run({ gateIn: 1, gateExp: 0, gateThresh: -45, gateRange: 20, gateAttack: 1, gateHold: 10, gateRelease: 50 }, 1000, -60), -80, 2);
check('gate open above threshold', run({ gateIn: 1, gateExp: 1, gateThresh: -45, gateRange: 20, gateAttack: 1, gateHold: 10, gateRelease: 50 }, 1000, -20), -20, 0.3);
check('comp 3:1 thr -18, -6 in -> 8 dB GR', run({ compIn: 1, compThresh: -18, compRatio: 3, compAttack: 10, compRelease: 100, compMakeup: 0, compMix: 100 }, 1000, -6), -14, 0.6);
check('comp makeup +8 restores', run({ compIn: 1, compThresh: -18, compRatio: 3, compAttack: 10, compRelease: 100, compMakeup: 8, compMix: 100 }, 1000, -6), -6, 0.6);
check('comp mix 0% = dry', run({ compIn: 1, compThresh: -18, compRatio: 3, compAttack: 10, compRelease: 100, compMakeup: 0, compMix: 0 }, 1000, -6), -6, 0.2);
check('comp below threshold untouched', run({ compIn: 1, compThresh: -18, compRatio: 3, compAttack: 10, compRelease: 100, compMakeup: 0, compMix: 100 }, 1000, -30), -30, 0.2);
check('EQ HMF +6 @ 1k', run({ eqIn: 1, hmfFreq: 1000, hmfGain: 6, hmfQ: 1 }, 1000, -12), -6, 0.3);
check('EQ LMF -6 @ 400', run({ eqIn: 1, lmfFreq: 400, lmfGain: -6, lmfQ: 1 }, 400, -12), -18, 0.3);
check('EQ HF shelf +6 @ 4k lifts 12k', run({ eqIn: 1, hfFreq: 4000, hfGain: 6, hfBell: 0 }, 12000, -12), -6, 0.5);
check('EQ LF shelf +6 @ 200 lifts 50', run({ eqIn: 1, lfFreq: 200, lfGain: 6, lfBell: 0 }, 50, -12), -6, 0.5);
check('EQ LF bell +6 @ 100 does NOT lift 1k', run({ eqIn: 1, lfFreq: 100, lfGain: 6, lfBell: 1 }, 1000, -12), -12, 0.3);
check('limiter holds +6 dBFS input at -1 dBFS', run({ limIn: 1 }, 1000, 6), -1, 0.3);
check('limiter leaves -6 alone', run({ limIn: 1 }, 1000, -6), -6, 0.1);
const mu = run({ mute: 1 }, 1000, -6);
console.log(`${mu < -80 ? 'PASS' : 'FAIL'}  mute silences: ${mu.toFixed(1)} dB (want < -80)`); if (mu >= -80) fails++;
check('de-esser pulls a 7 kHz hiss down ~12 dB', run({ deIn: 1, deFreq: 7000, deAmt: 80 }, 7000, -6), -18, 1.5);
check('de-esser leaves 1 kHz voice alone', run({ deIn: 1, deFreq: 7000, deAmt: 80 }, 1000, -6), -6, 0.5);
check('de-esser at AMOUNT 0 ignores quiet hiss', run({ deIn: 1, deFreq: 7000, deAmt: 0 }, 7000, -20), -20, 0.3);
{ // long silence must not leave the gate gain in denormal land, and the output must stay finite
  const p = new Proc(); p.port.onmessage({ data: { type: 'params', p: Object.assign({}, FLAT, { gateIn: 1, gateExp: 0, gateThresh: -45, gateRange: 80, eqIn: 1, compIn: 1, deIn: 1, limIn: 1 }) } });
  const z = new Float32Array(128), oL = new Float32Array(128), oR = new Float32Array(128); let bad = false;
  for (let i = 0; i < Math.round(3 * SR / 128); i++) { p.process([[z]], [[oL, oR]]); for (let k = 0; k < 128; k++) if (!Number.isFinite(oL[k])) bad = true; }
  const ok = !bad && p.gateGain === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  3 s of silence: gate gain floors to exactly 0 (got ${p.gateGain}) and output stays finite`); if (!ok) fails++;
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
