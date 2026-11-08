// smidur-d's sound kit: the plain DSP the parade march is made of (oscillators, filters, resampling, pitch, reverb, files).
// Everything is mono Float32Array at SR unless it says otherwise; nothing here reads the clock or Math.random.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const SR = 44100;
export const TAU = Math.PI * 2;

/** MIDI note to Hz, equal temperament, A4 = 440. */
export const hz = m => 440 * 2 ** ((m - 69) / 12);

/** A small seeded PRNG (mulberry32) giving floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A stable 32-bit hash of anything JSON can say (seeds for one event, so equal bars give equal samples). */
export function hash(...parts) {
  const s = JSON.stringify(parts);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------- files
/** Decode any audio file to mono float PCM at SR (ffmpeg). */
export function decode(path) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
}
/** Decode to stereo float PCM: [L, R]. */
export function decodeStereo(path) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  const x = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const n = x.length / 2;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = x[2 * i]; R[i] = x[2 * i + 1]; }
  return [L, R];
}
/** Write a 32-bit float stereo WAV. */
export function writeWav(path, [L, R]) {
  const n = L.length;
  const data = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) { data.writeFloatLE(L[i], i * 8); data.writeFloatLE(R[i], i * 8 + 4); }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(3, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 8, 28); head.writeUInt16LE(8, 32); head.writeUInt16LE(32, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([head, data]));
}
/** Encode a WAV to 44.1 kHz stereo 192 kbps MP3 (ffmpeg's libmp3lame). */
export function mp3(wav, out) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ar', String(SR), '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', out]);
}
/** Integrated loudness (LUFS) and true peak (dBTP) of a file (ffmpeg ebur128). */
export function loudness(path) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return parseEbur(r.stderr);
}
export function parseEbur(text) {
  const sum = text.slice(text.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s*(-?[\d.]+) LUFS/.exec(sum)?.[1]);
  const tp = Number(/Peak:\s*(-?[\d.]+|-inf) dBFS/.exec(sum.slice(sum.indexOf('True peak')))?.[1]);
  const lra = Number(/LRA:\s*(-?[\d.]+) LU/.exec(sum)?.[1]);
  return { lufs, truePeak: tp, lra };
}

// ---------------------------------------------------------------- oscillators
const TABLE = 2048;
const tables = new Map();
/** A one-cycle wavetable from harmonic amplitudes amps[n-1] (n = 1, 2, ...), normalised to peak 1. */
export function table(amps, key) {
  if (key && tables.has(key)) return tables.get(key);
  const t = new Float32Array(TABLE + 1);
  for (let n = 1; n <= amps.length; n++) {
    const a = amps[n - 1];
    if (!a) continue;
    for (let i = 0; i < TABLE; i++) t[i] += a * Math.sin((TAU * n * i) / TABLE);
  }
  let peak = 0;
  for (let i = 0; i < TABLE; i++) peak = Math.max(peak, Math.abs(t[i]));
  for (let i = 0; i < TABLE; i++) t[i] /= peak || 1;
  t[TABLE] = t[0];
  if (key) tables.set(key, t);
  return t;
}
/** Read a wavetable at a frequency that may change per sample (freq: number or Float32Array), from phase `phase` (cycles). */
export function osc(tab, freq, n, phase = 0) {
  const out = new Float32Array(n);
  let p = phase - Math.floor(phase);
  const fixed = typeof freq === 'number';
  for (let i = 0; i < n; i++) {
    const x = p * TABLE;
    const j = x | 0;
    out[i] = tab[j] + (tab[j + 1] - tab[j]) * (x - j);
    p += (fixed ? freq : freq[i]) / SR;
    if (p >= 1) p -= 1;
  }
  return out;
}

// ---------------------------------------------------------------- filters
/** A TPT state-variable filter, cutoff (Hz) a number or a per-sample array, mode 'lp' | 'bp' | 'hp'. In place. */
export function svf(x, cutoff, q = 0.707, mode = 'lp') {
  const k = 1 / q;
  let ic1 = 0;
  let ic2 = 0;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  const fixed = typeof cutoff === 'number';
  for (let i = 0; i < x.length; i++) {
    if (fixed ? i === 0 : (i & 15) === 0) {
      const fc = Math.min(Math.max(fixed ? cutoff : cutoff[i], 10), SR * 0.45);
      const g = Math.tan((Math.PI * fc) / SR);
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    const v0 = x[i];
    const v3 = v0 - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    x[i] = mode === 'lp' ? v2 : mode === 'bp' ? v1 : v0 - k * v1 - v2;
  }
  return x;
}
/** RBJ biquad coefficients. */
export function biquad(type, f, q = 0.707, gainDb = 0) {
  const w = (TAU * f) / SR;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const alpha = sw / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'bp') { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'peak') { b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; }
  else if (type === 'hs' || type === 'ls') {
    const s = type === 'hs' ? 1 : -1;
    const sq = 2 * Math.sqrt(A) * alpha;
    b0 = A * ((A + 1) + s * (A - 1) * cw + sq); b1 = -2 * s * A * ((A - 1) + s * (A + 1) * cw); b2 = A * ((A + 1) + s * (A - 1) * cw - sq);
    a0 = (A + 1) - s * (A - 1) * cw + sq; a1 = 2 * s * ((A - 1) - s * (A + 1) * cw); a2 = (A + 1) - s * (A - 1) * cw - sq;
  } else throw new Error(`biquad ${type}`);
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
/** Run biquad(s) over x in place. */
export function filt(x, ...coefs) {
  for (const [b0, b1, b2, a1, a2] of coefs) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = y;
      x[i] = y;
    }
  }
  return x;
}
/** A one-pole lowpass in place (smooths noise). */
export function onePole(x, f) {
  const a = Math.exp((-TAU * f) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; x[i] = y; }
  return x;
}

// ---------------------------------------------------------------- noise and envelopes
export function noise(n, seed) {
  const r = rng(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}
/** Multiply x in place by a linear-attack, exponential-ish shape: attack (s), hold until `end` (s), release (s). */
export function shape(x, attack, end, release, curve = 3) {
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    let g;
    if (t < attack) g = t / attack;
    else if (t < end) g = 1;
    else g = Math.max(0, 1 - (t - end) / release) ** curve;
    x[i] *= g;
  }
  return x;
}
/** Exponential decay to -60 dB in t60 seconds, applied in place. */
export function decay(x, t60, attack = 0.001) {
  const k = Math.log(1000) / t60;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] *= Math.exp(-k * t) * (t < attack ? t / attack : 1);
  }
  return x;
}

// ---------------------------------------------------------------- resampling and pitch
const SINC_HALF = 16;
/**
 * Play x at `rate` (2 = an octave up and half as long), windowed-sinc interpolation, lowpassed below the new Nyquist when it goes up.
 */
export function resample(x, rate) {
  const n = Math.floor(x.length / rate);
  const out = new Float32Array(n);
  const fc = Math.min(1, 1 / rate) * 0.96;
  for (let i = 0; i < n; i++) {
    const p = i * rate;
    const j = Math.floor(p);
    let s = 0;
    for (let k = j - SINC_HALF + 1; k <= j + SINC_HALF; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = p - k;
      const a = Math.PI * fc * d;
      const sinc = d === 0 ? 1 : Math.sin(a) / a;
      const w = 0.42 + 0.5 * Math.cos((Math.PI * d) / SINC_HALF) + 0.08 * Math.cos((2 * Math.PI * d) / SINC_HALF);
      s += x[k] * sinc * w;
    }
    out[i] = s * fc;
  }
  return out;
}
/** YIN pitch of one frame of x from `start` (Hz, or null if unvoiced). */
export function yin(x, start, fmin = 60, fmax = 3000, size = 2048, thresh = 0.15) {
  const tmin = Math.floor(SR / fmax);
  const tmax = Math.min(Math.ceil(SR / fmin), size - 1);
  if (start + size + tmax > x.length) return null;
  const d = new Float64Array(tmax + 1);
  for (let t = 1; t <= tmax; t++) {
    let s = 0;
    for (let i = 0; i < size; i++) { const v = x[start + i] - x[start + i + t]; s += v * v; }
    d[t] = s;
  }
  let run = 0;
  const cm = new Float64Array(tmax + 1);
  cm[0] = 1;
  for (let t = 1; t <= tmax; t++) { run += d[t]; cm[t] = run > 0 ? (d[t] * t) / run : 1; }
  let tau = -1;
  for (let t = tmin; t <= tmax; t++) {
    if (cm[t] < thresh) { while (t + 1 <= tmax && cm[t + 1] < cm[t]) t++; tau = t; break; }
  }
  if (tau < 0) return null;
  const a = cm[tau - 1] ?? cm[tau];
  const b = cm[tau];
  const c = cm[tau + 1] ?? cm[tau];
  const den = a - 2 * b + c;
  const shift = den ? (0.5 * (a - c)) / den : 0;
  return SR / (tau + shift);
}
/** The median YIN pitch over the loud frames of x (Hz) and how many frames were voiced. */
export function pitchOf(x, fmin = 60, fmax = 3000) {
  const size = Math.min(2048, Math.max(512, Math.floor(SR / fmin) * 2));
  const hop = 512;
  let peak = 0;
  const rms = [];
  for (let s = 0; s + size * 2 < x.length; s += hop) {
    let e = 0;
    for (let i = 0; i < size; i++) e += x[s + i] ** 2;
    rms.push([s, Math.sqrt(e / size)]);
    peak = Math.max(peak, Math.sqrt(e / size));
  }
  const found = [];
  for (const [s, r] of rms) {
    if (r < peak * 0.3) continue;
    const f = yin(x, s, fmin, fmax, size);
    if (f) found.push(f);
  }
  if (!found.length) return { hz: null, frames: 0, of: rms.length };
  found.sort((a, b) => a - b);
  const q = p => found[Math.min(found.length - 1, Math.floor(found.length * p))];
  return { hz: q(0.5), q1: q(0.25), q3: q(0.75), frames: found.length, of: rms.filter(([, r]) => r >= peak * 0.3).length };
}
/** Cents from f to the nearest octave of target. */
export function centsOff(f, target) {
  const c = 1200 * Math.log2(f / target);
  return c - 1200 * Math.round(c / 1200);
}
/** The first sample where a 5 ms envelope of x passes `frac` of its maximum: where the sound is heard to start. */
export function onsetOf(x, frac = 0.2) {
  const w = 220;
  let max = 0;
  const env = [];
  for (let i = 0; i + w <= x.length; i += 55) {
    let s = 0;
    for (let j = 0; j < w; j++) s = Math.max(s, Math.abs(x[i + j]));
    env.push(s);
    max = Math.max(max, s);
  }
  const k = env.findIndex(e => e >= max * frac);
  if (k < 0) return 0;
  // the first sample in that window that passes it
  for (let i = k * 55; i < k * 55 + w && i < x.length; i++) if (Math.abs(x[i]) >= max * frac) return i;
  return k * 55;
}

// ---------------------------------------------------------------- reverb
/** A Freeverb-style stereo reverb (8 damped combs + 4 allpasses a side), returning the wet [L, R] for a mono or stereo send. */
export function reverb([inL, inR], { room = 0.8, damp = 0.35, width = 1, pre = 0.012 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  const spread = 23;
  const n = inL.length;
  const preN = Math.round(pre * SR);
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let side = 0; side < 2; side++) {
    const input = side === 0 ? inL : inR ?? inL;
    const o = out[side];
    const cb = combs.map(d => ({ buf: new Float32Array(d + side * spread), i: 0, store: 0 }));
    const ab = alls.map(d => ({ buf: new Float32Array(d + side * spread), i: 0 }));
    for (let t = 0; t < n; t++) {
      const x = (t >= preN ? input[t - preN] : 0) * 0.015;
      let s = 0;
      for (const c of cb) {
        const y = c.buf[c.i];
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * room;
        if (++c.i >= c.buf.length) c.i = 0;
        s += y;
      }
      for (const a of ab) {
        const b = a.buf[a.i];
        a.buf[a.i] = s + b * 0.5;
        s = b - s;
        if (++a.i >= a.buf.length) a.i = 0;
      }
      o[t] = s;
    }
  }
  if (width < 1) {
    for (let t = 0; t < n; t++) {
      const m = (out[0][t] + out[1][t]) / 2;
      out[0][t] = m + (out[0][t] - m) * width;
      out[1][t] = m + (out[1][t] - m) * width;
    }
  }
  return out;
}
