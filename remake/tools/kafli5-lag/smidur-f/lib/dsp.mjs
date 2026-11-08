// Small DSP kit: seeded randomness, filters, saturation, a band-limited variable-rate resampler and the reverbs.
import { SR } from './io.mjs';

// ---------- seeded randomness: every random choice is keyed, so a repeated bar is the same bar ----------
function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
/** A PRNG (mulberry32) seeded from any key: rng() → [0, 1). */
export function rngFor(key) {
  let a = hashString(String(key)) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** One random number in [lo, hi) for a key. */
export const rand = (key, lo = 0, hi = 1) => lo + (hi - lo) * rngFor(key)();

// ---------- filters ----------
/** RBJ biquad; returns a stateful process(x) function. type: lp hp bp peak lowshelf highshelf notch ap */
export function biquad(type, f, q = 0.707, gainDb = 0) {
  const w = (2 * Math.PI * Math.min(f, SR * 0.49)) / SR;
  const cw = Math.cos(w), sw = Math.sin(w);
  const alpha = sw / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'ap': b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
      a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
      a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s; break;
    }
    default: throw new Error('biquad type ' + type);
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
/** Filter a whole buffer in place with a chain of process functions. */
export function run(buf, ...procs) {
  for (const p of procs) for (let i = 0; i < buf.length; i++) buf[i] = p(buf[i]);
  return buf;
}
/** A state-variable lowpass whose cutoff may change every sample: process(x, f). */
export function svf(q = 0.7) {
  let ic1 = 0, ic2 = 0;
  const k = 1 / q;
  return (x, f) => {
    const g = Math.tan((Math.PI * Math.min(f, SR * 0.45)) / SR);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return v2; // lowpass (v1 is bandpass)
  };
}
export const onePoleLP = f => {
  const a = Math.exp((-2 * Math.PI * f) / SR);
  let y = 0;
  return x => (y = (1 - a) * x + a * y);
};

// ---------- small shapes ----------
export const softClip = x => Math.tanh(x);
export const dbToGain = db => 10 ** (db / 20);
export const midiHz = m => 440 * 2 ** ((m - 69) / 12);
/** Linear fade-in/out of `a` and `r` seconds over a buffer, in place. */
export function fade(buf, a = 0.002, r = 0.01) {
  const na = Math.max(1, Math.round(a * SR)), nr = Math.max(1, Math.round(r * SR));
  for (let i = 0; i < na && i < buf.length; i++) buf[i] *= i / na;
  for (let i = 0; i < nr && i < buf.length; i++) buf[buf.length - 1 - i] *= i / nr;
  return buf;
}

// ---------- band-limited resampling with a rate that may move (pitch correction) ----------
const TAPS = 16;
const PHASES = 256;
function kernelTable(cut) {
  // windowed sinc (Blackman) at cutoff `cut` (fraction of the input's Nyquist), TAPS taps, PHASES fractional phases
  const t = new Float32Array((PHASES + 1) * TAPS);
  for (let p = 0; p <= PHASES; p++) {
    const frac = p / PHASES;
    let sum = 0;
    for (let k = 0; k < TAPS; k++) {
      const x = k - (TAPS / 2 - 1) - frac; // distance from the read point
      const s = x === 0 ? 1 : Math.sin(Math.PI * cut * x) / (Math.PI * cut * x);
      const wpos = (k - frac + 1) / TAPS; // 0..1 across the window
      const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * wpos) + 0.08 * Math.cos(4 * Math.PI * wpos);
      t[p * TAPS + k] = s * w * cut;
      sum += t[p * TAPS + k];
    }
    for (let k = 0; k < TAPS; k++) t[p * TAPS + k] /= sum;
  }
  return t;
}
const tables = new Map();
function tableFor(maxRate) {
  const cut = Math.min(1, 0.97 / Math.max(1, maxRate));
  const key = Math.round(cut * 100);
  if (!tables.has(key)) tables.set(key, kernelTable(key / 100));
  return tables.get(key);
}
/**
 * Read `src` at a moving rate: rateAt(pos) gives the rate (input samples per output sample) at input position pos.
 * Starts at input `from` and stops at input `to` (or the end). Returns a new Float32Array.
 */
export function resample(src, rateAt, { from = 0, to = src.length, maxRate = 2 } = {}) {
  const table = tableFor(maxRate);
  const out = [];
  let pos = from;
  const half = TAPS / 2 - 1;
  while (pos < to - 1) {
    const i = Math.floor(pos);
    const frac = pos - i;
    const p = Math.round(frac * PHASES);
    let s = 0;
    const base = p * TAPS;
    for (let k = 0; k < TAPS; k++) {
      const j = i - half + k;
      if (j >= 0 && j < src.length) s += src[j] * table[base + k];
    }
    out.push(s);
    pos += rateAt(pos);
  }
  return Float32Array.from(out);
}

// ---------- reverbs ----------
/**
 * A stereo FDN hall/room: 8 lines, Householder mixing, damping per line. Input mono or stereo; returns [L, R] wet.
 */
export function fdnReverb(inL, inR, { t60 = 1.8, damp = 6000, pre = 0.015, size = 1, width = 1 } = {}) {
  const n = inL.length;
  const base = [1031, 1327, 1523, 1777, 1949, 2207, 2459, 2711].map(v => Math.round(v * size));
  const lines = base.map(l => new Float32Array(l));
  const idx = new Array(8).fill(0);
  const g = base.map(l => 10 ** ((-3 * l) / (t60 * SR)));
  const lp = base.map(() => onePoleLP(damp));
  const preN = Math.round(pre * SR);
  const preBuf = new Float32Array(preN + 1);
  let pi = 0;
  const L = new Float32Array(n), R = new Float32Array(n);
  const o = new Float64Array(8);
  for (let t = 0; t < n; t++) {
    const x = (inL[t] + (inR ? inR[t] : inL[t])) * 0.5;
    preBuf[pi] = x;
    pi = (pi + 1) % (preN + 1);
    const xin = preBuf[pi];
    let sum = 0;
    for (let k = 0; k < 8; k++) {
      o[k] = lines[k][idx[k]];
      sum += o[k];
    }
    sum *= 2 / 8;
    let l = 0, r = 0;
    for (let k = 0; k < 8; k++) {
      const fb = lp[k]((o[k] - sum) * g[k]);
      lines[k][idx[k]] = fb + xin * (k % 2 ? 0.35 : -0.35);
      idx[k] = (idx[k] + 1) % lines[k].length;
      if (k % 2) l += o[k]; else r += o[k];
      if (k < 4) l += o[k] * 0.3 * (1 - width); else r += o[k] * 0.3 * (1 - width);
    }
    L[t] = l * 0.5;
    R[t] = r * 0.5;
  }
  return [L, R];
}

/** A spring tank: dispersive allpasses in a damped feedback loop (the twang guitar's "boing"). Mono in, mono out (wet). */
export function springReverb(input, { decay = 0.82, delay = 0.033, tone = 3500, chirp = 0.62, stages = 10 } = {}) {
  const n = input.length;
  const dN = Math.round(delay * SR);
  const loop = new Float32Array(dN);
  let li = 0;
  const ap = new Array(stages).fill(0).map(() => ({ x1: 0, y1: 0 }));
  const lp = onePoleLP(tone);
  const hp = biquad('hp', 180, 0.7);
  const out = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    let v = input[t] + loop[li] * decay;
    for (const s of ap) {
      // first-order allpass, coefficient chirp
      const y = -chirp * v + s.x1 + chirp * s.y1;
      s.x1 = v;
      s.y1 = y;
      v = y;
    }
    v = lp(v);
    loop[li] = v;
    li = (li + 1) % dN;
    out[t] = hp(v);
  }
  return out;
}

/** Modulated delay chorus/vibrato on a mono buffer; returns [L, R]. */
export function chorus(input, { rate = 0.8, depth = 0.0025, base = 0.012, mix = 0.5 } = {}) {
  const n = input.length;
  const L = new Float32Array(n), R = new Float32Array(n);
  const max = Math.ceil((base + depth) * SR) + 4;
  for (let t = 0; t < n; t++) {
    const ph = (2 * Math.PI * rate * t) / SR;
    for (const [out, off] of [[L, 0], [R, Math.PI / 2]]) {
      const d = (base + depth * Math.sin(ph + off)) * SR;
      const p = t - d;
      const i = Math.floor(p);
      const f = p - i;
      const a = i >= 0 && i < n ? input[i] : 0;
      const b = i + 1 >= 0 && i + 1 < n ? input[i + 1] : 0;
      out[t] = input[t] * (1 - mix) + (a + (b - a) * f) * mix;
    }
  }
  void max;
  return [L, R];
}
