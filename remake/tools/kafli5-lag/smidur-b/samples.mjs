// The chapter's recordings for smidur-b: decoded with ffmpeg, put on a tone the way the game does (choir-sounds.js takeRate /
// setRate: resample by rate = target / own pitch, to the octave nearest its own), measured with YIN.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SR } from './dsp.mjs';

export const HLJOD = 'remake/assets/audio/kafli5/hljod';
export const SOUNDS = JSON.parse(readFileSync(join(HLJOD, 'sounds.json'), 'utf8'));

/** F major's tones of the five groups (ET, A4 = 440), the octave of middle C. */
export const TONE = {
  grazers: 440 * 2 ** (-4 / 12), // F4 349.23
  turtles: 440 * 2 ** (-2 / 12), // G4 392.00
  frogs: 440, // A4
  lizards: 440 * 2 ** (3 / 12), // C5 523.25
  flyers: 440 * 2 ** (5 / 12), // D5 587.33
};

/** Decode any audio file to mono Float32 at 44.1 kHz. */
export function decode(path) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg decode ${path}: ${r.stderr}`);
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

/** The game's rule: a take of pitch hz onto tone, in the octave nearest its own. */
export function takeRate(hz, tone) {
  if (!(hz > 0) || !(tone > 0)) return 1;
  return (tone * 2 ** Math.round(Math.log2(hz / tone))) / hz;
}
/** The game's rule for one take serving all five tones: the octave nearest the take, set on mi (frogs). */
export function setRate(hz, group) {
  if (!(hz > 0)) return 1;
  const oct = Math.round(Math.log2(hz / TONE.frogs));
  return (TONE[group] * 2 ** oct) / hz;
}

/**
 * Resample (play at `rate`: >1 higher and shorter) with a windowed-sinc kernel, low-passed under the new Nyquist when going up.
 */
export function resample(x, rate) {
  if (Math.abs(rate - 1) < 1e-9) return Float32Array.from(x);
  const n = Math.floor((x.length - 1) / rate);
  const out = new Float32Array(n);
  const cut = Math.min(1, 1 / rate) * 0.94; // fraction of the source Nyquist kept
  const half = 16; // taps each side (in source samples, scaled by 1/cut)
  const span = Math.ceil(half / cut);
  for (let i = 0; i < n; i++) {
    const pos = i * rate;
    const c = Math.floor(pos);
    let s = 0, w = 0;
    for (let k = c - span + 1; k <= c + span; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = pos - k;
      const t = d * cut;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const win = 0.5 + 0.5 * Math.cos((Math.PI * d) / (span + 1));
      const g = sinc * win;
      s += x[k] * g;
      w += g;
    }
    out[i] = w ? s / w : 0;
  }
  return out;
}

/** The first sample at or over `db` under the take's own peak (where the call is heard to start). */
export function onsetOf(x, db = -30) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  const th = p * 10 ** (db / 20);
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= th) return i;
  return 0;
}

/** YIN pitch (Hz) of x[from..from+len], or null; with the aperiodicity found. */
export function yin(x, from = 0, len = 2048, fmin = 50, fmax = 4000, thresh = 0.15) {
  const W = Math.min(len, Math.floor((x.length - from) / 2));
  if (W < 64) return { hz: null, ap: 1 };
  const tmin = Math.max(2, Math.floor(SR / fmax)), tmax = Math.min(W - 1, Math.ceil(SR / fmin));
  const d = new Float64Array(tmax + 1);
  for (let t = 1; t <= tmax; t++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = x[from + i] - x[from + i + t]; s += v * v; }
    d[t] = s;
  }
  const cm = new Float64Array(tmax + 1);
  cm[0] = 1;
  let run = 0;
  for (let t = 1; t <= tmax; t++) { run += d[t]; cm[t] = run > 0 ? (d[t] * t) / run : 1; }
  let tau = -1;
  for (let t = tmin; t <= tmax; t++) {
    if (cm[t] < thresh) { while (t + 1 <= tmax && cm[t + 1] < cm[t]) t++; tau = t; break; }
  }
  if (tau < 0) {
    let best = tmin;
    for (let t = tmin; t <= tmax; t++) if (cm[t] < cm[best]) best = t;
    tau = best;
  }
  const ap = cm[tau];
  // parabolic refinement
  let tf = tau;
  if (tau > 1 && tau < tmax) {
    const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1];
    const den = a - 2 * b + c;
    if (den) tf = tau + (0.5 * (a - c)) / den;
  }
  return { hz: SR / tf, ap };
}

/** The median YIN pitch over the voiced frames of x (ap under `apMax`), with the share voiced. */
export function pitchOf(x, { from = 0, to = x.length, hop = 512, len = 2048, fmin = 50, fmax = 4000, apMax = 0.2 } = {}) {
  const hs = [];
  let frames = 0;
  for (let i = from; i + 2 * len < to; i += hop) {
    let e = 0;
    for (let k = 0; k < len; k++) e += x[i + k] * x[i + k];
    if (e / len < 1e-6) continue;
    frames++;
    const r = yin(x, i, len, fmin, fmax);
    if (r.hz && r.ap < apMax) hs.push(r.hz);
  }
  hs.sort((a, b) => a - b);
  return { hz: hs.length ? hs[Math.floor(hs.length / 2)] : null, voiced: frames ? hs.length / frames : 0, n: hs.length };
}

/** Cents of a from b. */
export const cents = (a, b) => 1200 * Math.log2(a / b);
