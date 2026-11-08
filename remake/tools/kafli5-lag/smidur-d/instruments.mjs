// smidur-d's band: every instrument of the parade, synthesized. Each returns one note as a mono Float32Array at SR, starting at its
// attack (the renderer puts sample 0 on the beat). Velocity v is 0..1. Seeds come from the caller, so equal bars sound equal.
import { SR, TAU, table, osc, svf, filt, biquad, noise, decay, rng, onePole } from './dsp.mjs';

const N = s => Math.max(1, Math.round(s * SR));
const gauss = (x, mu, w) => Math.exp(-(((x - mu) / w) ** 2));
const sawAmps = (f, limit, tilt) => Array.from({ length: Math.max(1, Math.floor(limit / f)) }, (_, i) => 1 / (i + 1) ** tilt);

/** Pitch curve: a scoop up into the note (cents, decaying in `scoopT` s) and a delayed vibrato. */
function pitchCurve(f, n, { scoop = 0, scoopT = 0.035, vib = 0, vibRate = 5.2, vibDelay = 0.25, det = 0, phase = 0 }) {
  const fr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let c = det + scoop * Math.exp(-t / scoopT);
    if (vib && t > vibDelay) c += vib * Math.min(1, (t - vibDelay) / 0.3) * Math.sin(TAU * vibRate * (t - vibDelay) + phase);
    fr[i] = f * 2 ** (c / 1200);
  }
  return fr;
}
/** Attack, a little overshoot that settles, hold to `dur`, then a release. */
function ampEnv(x, dur, { attack = 0.02, release = 0.08, bloom = 0.2, bloomT = 0.06, v = 1 }) {
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    let g = t < attack ? t / attack : 1 + bloom * Math.exp(-(t - attack) / bloomT);
    if (t > dur) g *= Math.max(0, 1 - (t - dur) / release) ** 2;
    x[i] *= g * v;
  }
  return x;
}

// ---------------------------------------------------------------- brass
/**
 * A brass voice: a band-limited saw through a lowpass that opens on the attack (the "blat") and with the velocity, a scoop into the
 * pitch, an overshoot. Used for the tuba, the trumpets and the soft "pah" horns.
 */
export function brass(f, dur, v, o = {}) {
  const { tilt = 1, base = 3, burst = 5, burstT = 0.1, max = 6000, q = 0.9, scoop = -30, attack = 0.02, release = 0.08, vib = 0, voices = 1,
    detune = 6, seed = 1, limit = 7500, bloom = 0.2 } = o;
  const n = N(dur + release + 0.01);
  const tab = table(sawAmps(f, limit, tilt), `saw:${tilt}:${f.toFixed(2)}:${limit}`);
  const out = new Float32Array(n);
  const r = rng(seed);
  for (let k = 0; k < voices; k++) {
    const det = voices > 1 ? (k - (voices - 1) / 2) * detune : 0;
    const x = osc(tab, pitchCurve(f, n, { scoop: scoop * (0.8 + 0.4 * r()), vib, det, phase: r() * TAU }), n, r());
    const cut = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const close = t > dur ? Math.exp(-(t - dur) / 0.04) : 1;
      cut[i] = Math.min(max, f * (base + burst * Math.exp(-t / burstT)) * (0.55 + 0.45 * v) * (0.3 + 0.7 * close));
    }
    svf(x, cut, q);
    for (let i = 0; i < n; i++) out[i] += x[i] / voices;
  }
  return ampEnv(out, dur, { attack, release, bloom, v });
}
export const tuba = (f, dur, v, seed) =>
  brass(f, dur, v, { tilt: 1, base: 4.5, burst: 7, burstT: 0.09, max: 2400, q: 1.15, scoop: -40, attack: 0.025, release: 0.09, seed, limit: 4000, bloom: 0.3 });
export const trumpet = (f, dur, v, seed, long = dur > 0.6) =>
  brass(f, dur, v, { tilt: 0.85, base: 2.6, burst: 5, burstT: 0.08, max: 6500, q: 0.85, scoop: -22, attack: 0.014, release: 0.07, vib: long ? 9 : 0, voices: 2, detune: 7, seed });
export const pah = (f, dur, v, seed) =>
  brass(f, dur, v, { tilt: 1.15, base: 2.2, burst: 3.2, burstT: 0.05, max: 2600, q: 0.7, scoop: -12, attack: 0.01, release: 0.06, seed, limit: 5000, bloom: 0.1 });

// ---------------------------------------------------------------- reeds and flutes
/** A reed: a wavetable of the instrument's harmonics (per pitch, so formants stay put), a soft breath, a lowpass that opens. */
function reed(amps, key, f, dur, v, { attack = 0.03, release = 0.07, base = 5, burst = 3, max = 5000, breath = 0.02, seed = 1, vib = 0, vibRate = 5.5, scoop = -10 }) {
  const n = N(dur + release + 0.01);
  const tab = table(amps, key);
  const r = rng(seed);
  const x = osc(tab, pitchCurve(f, n, { scoop, scoopT: 0.03, vib, vibRate, vibDelay: 0.18, phase: r() * TAU }), n, r());
  const cut = new Float32Array(n);
  for (let i = 0; i < n; i++) cut[i] = Math.min(max, f * (base + burst * Math.exp(-(i / SR) / 0.08)) * (0.6 + 0.4 * v));
  svf(x, cut, 0.75);
  if (breath) {
    const b = svf(noise(n, seed ^ 0x5eed), Math.min(f * 2.2, 7000), 3, 'bp');
    for (let i = 0; i < n; i++) x[i] += b[i] * breath;
  }
  return ampEnv(x, dur, { attack, release, bloom: 0.08, v });
}
export function clarinet(f, dur, v, seed) {
  const amps = Array.from({ length: Math.floor(6000 / f) }, (_, i) => ((i + 1) % 2 ? 1 / (i + 1) : (f > 600 ? 0.25 : 0.1) / (i + 1)));
  return reed(amps, `cl:${f.toFixed(2)}`, f, dur, v, { attack: 0.025, release: 0.06, base: 4, burst: 3, max: 5200, breath: 0.03, seed });
}
export function bassoon(f, dur, v, seed) {
  const amps = Array.from({ length: Math.floor(5000 / f) }, (_, i) => {
    const fn = f * (i + 1);
    return (0.2 + gauss(fn, 480, 200) + 0.6 * gauss(fn, 1150, 300) + 0.25 * gauss(fn, 2100, 400)) / (i + 1) ** 0.45;
  });
  return reed(amps, `bn:${f.toFixed(2)}`, f, dur, v, { attack: 0.03, release: 0.07, base: 8, burst: 6, max: 4200, breath: 0.015, seed, scoop: -18 });
}
export function piccolo(f, dur, v, seed) {
  return reed([1, 0.22, 0.07, 0.025], 'picc', f, dur, v, { attack: 0.035, release: 0.08, base: 6, burst: 2, max: 7000, breath: 0.06, seed, vib: dur > 0.4 ? 14 : 0, scoop: -15 });
}

// ---------------------------------------------------------------- strings
/** A soft string-section pad note: three detuned saws, gentle vibrato, slow bow. `cut` (Hz) sets how bright. */
export function strings(f, dur, v, { attack = 0.35, release = 0.7, cut = 2000, seed = 1 } = {}) {
  const n = N(dur + release + 0.01);
  const tab = table(sawAmps(f, 6000, 1.1), `str:${f.toFixed(2)}`);
  const r = rng(seed);
  const out = new Float32Array(n);
  for (const det of [-8, 0, 7]) {
    const x = osc(tab, pitchCurve(f, n, { det, vib: 5, vibRate: 4.6 + r() * 0.6, vibDelay: 0, phase: r() * TAU }), n, r());
    for (let i = 0; i < n; i++) out[i] += x[i] / 3;
  }
  svf(out, Math.min(cut, f * 14), 0.6);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let g = t < attack ? Math.sin((Math.PI / 2) * (t / attack)) ** 2 : 1;
    if (t > dur) g *= Math.max(0, 1 - (t - dur) / release) ** 2;
    out[i] *= g * v;
  }
  return out;
}
/** A pizzicato string: Karplus-Strong with a fractional (allpass) delay so it stays in tune, a short ring and a small body. */
export function pizz(f, v, { t60 = 0.45, bright = 0.55, seed = 1 } = {}) {
  const n = N(t60 + 0.05);
  const period = SR / f;
  const L = Math.floor(period - 0.5);
  const d = period - 0.5 - L;
  const c = (1 - d) / (1 + d);
  const g = 10 ** ((-3 * period) / (t60 * SR));
  const exc = noise(L + 1, seed);
  onePole(exc, 800 + 5000 * bright);
  const y = new Float32Array(n);
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < n; i++) {
    const a = i - L >= 0 ? y[i - L] : 0;
    const b = i - L - 1 >= 0 ? y[i - L - 1] : 0;
    const avg = 0.5 * (a + b);
    const ap = c * avg + apIn - c * apOut;
    apIn = avg;
    apOut = ap;
    y[i] = (i <= L ? exc[i] : 0) + g * ap;
  }
  filt(y, biquad('peak', 280, 1, 3), biquad('lp', 4200, 0.7));
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(y[i]));
  for (let i = 0; i < n; i++) y[i] *= (v / (peak || 1)) * Math.min(1, i / 40);
  return y;
}

// ---------------------------------------------------------------- mallets
/** A glockenspiel bar: the metal bar's inharmonic modes, each its own decay; modes over 8 kHz left out. Soft mallet (2 ms). */
export function glock(f, v, { t60 = 1.3 } = {}) {
  const modes = [[1, 1, 1], [2.756, 0.32, 0.4], [5.404, 0.12, 0.18], [8.933, 0.05, 0.1]];
  const n = N(t60);
  const out = new Float32Array(n);
  for (const [ratio, amp, life] of modes) {
    const fm = f * ratio;
    if (fm > 8000) continue;
    const k = Math.log(1000) / (t60 * life);
    for (let i = 0; i < n; i++) out[i] += amp * Math.sin((TAU * fm * i) / SR) * Math.exp((-k * i) / SR);
  }
  for (let i = 0; i < n; i++) out[i] *= v * Math.min(1, i / 88);
  return out;
}

// ---------------------------------------------------------------- drums
/** The marching bass drum: a felt beater on a big skin, its pitch falling, a second mode, and a "boom" a tablet can hear. */
export function bassDrum(v, seed) {
  const n = N(0.7);
  const out = new Float32Array(n);
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 56 + 70 * Math.exp(-t / 0.028);
    p1 += f / SR;
    p2 += (f * 1.58) / SR;
    out[i] = Math.sin(TAU * p1) * Math.exp(-t / 0.22) + 0.35 * Math.sin(TAU * p2) * Math.exp(-t / 0.09);
  }
  const thud = svf(noise(n, seed), 420, 0.8);
  const boom = svf(noise(n, seed + 1), 190, 2.5, 'bp');
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] += thud[i] * 0.9 * Math.exp(-t / 0.012) + boom[i] * 1.6 * Math.exp(-t / 0.07);
    out[i] *= v * Math.min(1, i / 60);
  }
  return out;
}
/** The snare: wires (filtered noise, brighter when hit harder, tamed under 8 kHz) and the shell's two tones. */
export function snare(v, seed, { life = 0.17 } = {}) {
  const n = N(life * 1.6 + 0.02);
  const wires = noise(n, seed);
  filt(wires, biquad('hp', 1100, 0.7), biquad('lp', 4800 + 2600 * v, 0.6), biquad('lp', 8000, 0.7));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const shell = 0.55 * Math.sin(TAU * 186 * t) * Math.exp(-t / 0.035) + 0.25 * Math.sin(TAU * 331 * t) * Math.exp(-t / 0.022);
    out[i] = (wires[i] * 0.9 * Math.exp(-t / (life * 0.36)) + shell) * v * Math.min(1, i / 30);
  }
  return out;
}
/** A rim tap: a small wooden click. */
export function rim(v, seed) {
  const n = N(0.06);
  const x = svf(noise(n, seed), 1900, 5, 'bp');
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] = (x[i] * 2.2 + 0.4 * Math.sin(TAU * 1650 * t)) * Math.exp(-t / 0.012) * v * Math.min(1, i / 20);
  }
  return x;
}
/** A marching cymbal: metallic partials and noise, high-passed, tamed at 8 kHz, a soft 5 ms swell so it never startles. */
export function cymbal(v, seed, { t60 = 1.1 } = {}) {
  const n = N(t60 + 0.05);
  const partials = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0].map(f => f * 1.71);
  const x = new Float32Array(n);
  for (const f of partials) {
    let p = 0;
    for (let i = 0; i < n; i++) {
      p += f / SR;
      x[i] += (p - Math.floor(p) < 0.5 ? 1 : -1) * 0.12;
    }
  }
  const z = noise(n, seed);
  for (let i = 0; i < n; i++) x[i] += z[i] * 0.6;
  filt(x, biquad('hp', 3200, 0.7), biquad('lp', 7600, 0.7), biquad('lp', 8200, 0.7));
  const k = Math.log(1000) / t60;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] *= v * Math.exp(-k * t) * Math.min(1, t / 0.005) * (1 - 0.5 * Math.exp(-t / 0.03));
  }
  return x;
}
/** The riser's sweep: noise through a band that climbs and a level that grows, ending on the drop. */
export function sweep(dur, v, seed) {
  const n = N(dur);
  const x = noise(n, seed);
  const cut = new Float32Array(n);
  for (let i = 0; i < n; i++) cut[i] = 300 * 2 ** (4.3 * (i / n));
  svf(x, cut, 1.6, 'bp');
  filt(x, biquad('lp', 7500, 0.7));
  for (let i = 0; i < n; i++) {
    const u = i / n;
    x[i] *= v * u * u * Math.min(1, (n - i) / 600);
  }
  return x;
}
export { decay };
