// The DSP core of the orchestra: seeded randomness, filters (RBJ biquads, a time-varying TPT state-variable filter), a
// band-limited saw, Karplus-Strong strings, a feedback-delay-network hall, resampling and the mixer's pan law.
import { SR } from './io.mjs';

export { SR };
export const TAU = Math.PI * 2;

/** mulberry32: a seeded generator of floats in [0, 1). */
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

/** FNV-1a over the parts' text: a seed that depends only on what a note is. */
export function seedOf(...parts) {
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Equal temperament, A4 = 440: MIDI note to Hz. */
export const mtof = m => 440 * 2 ** ((m - 69) / 12);
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'F4', 'Bb2', 'C#5' to MIDI. */
export function midi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`no note ${name}`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const hz = name => mtof(midi(name));

// ---- biquads (RBJ cookbook) ----
export function biquad(type, f, q = 0.707, gainDb = 0) {
  const w = (TAU * Math.min(f, SR * 0.49)) / SR;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const alpha = sw / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: throw new Error(type);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Runs biquad `c` over `x` in place (transposed direct form II). */
export function filt(x, c) {
  let z1 = 0;
  let z2 = 0;
  const { b0, b1, b2, a1, a2 } = c;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    x[i] = y;
  }
  return x;
}
/** Applies a chain of [type, f, q, gain] biquads in place. */
export function eq(x, chain) {
  for (const [type, f, q, g] of chain) filt(x, biquad(type, f, q, g));
  return x;
}

/**
 * A TPT state-variable lowpass (or 'bp', 'hp') over `x` in place, its cutoff `cut` a number or a per-sample function of the
 * sample index, refreshed every 16 samples. `res` is the damping k (2 = no resonance, 0.7 resonant).
 */
export function svf(x, cut, k = 1.414, mode = 'lp') {
  let ic1 = 0;
  let ic2 = 0;
  let g = 0;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  const fixed = typeof cut === 'number';
  const set = f => {
    g = Math.tan((Math.PI * Math.min(Math.max(f, 20), SR * 0.45)) / SR);
    a1 = 1 / (1 + g * (g + k));
    a2 = g * a1;
    a3 = g * a2;
  };
  if (fixed) set(cut);
  for (let i = 0; i < x.length; i++) {
    if (!fixed && (i & 15) === 0) set(cut(i));
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

/** A one-pole lowpass in place. */
export function onePole(x, f) {
  const a = Math.exp((-TAU * f) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; x[i] = y; }
  return x;
}

// ---- oscillators ----
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
/**
 * Adds a band-limited saw to `out` (from index 0), its frequency freq(i) Hz read every 16 samples, starting at `phase`,
 * scaled by `amp`. `pulse` (0..1) makes it a pulse of that width instead.
 */
export function addSaw(out, freq, { phase = 0, amp = 1, pulse = 0 } = {}) {
  let ph = phase;
  let dt = 0;
  const fixed = typeof freq === 'number';
  if (fixed) dt = freq / SR;
  for (let i = 0; i < out.length; i++) {
    if (!fixed && (i & 15) === 0) dt = freq(i) / SR;
    let v;
    if (pulse) {
      let p2 = ph + pulse;
      if (p2 >= 1) p2 -= 1;
      v = (2 * ph - 1 - blep(ph, dt)) - (2 * p2 - 1 - blep(p2, dt));
    } else v = 2 * ph - 1 - blep(ph, dt);
    out[i] += amp * v;
    ph += dt;
    if (ph >= 1) ph -= 1;
  }
}

/** Adds a sine partial to `out`: freq(i) or fixed Hz, amplitude envelope env(t seconds) (or a decay T60), starting phase. */
export function addSine(out, f, amp, t60 = 0, phase = 0, from = 0) {
  const w = (TAU * f) / SR;
  const decay = t60 > 0 ? Math.exp(Math.log(0.001) / (t60 * SR)) : 1;
  // recursive rotation
  let c = Math.cos(phase);
  let s = Math.sin(phase);
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  let a = amp;
  for (let i = from; i < out.length; i++) {
    out[i] += a * s;
    const c2 = c * cw - s * sw;
    s = s * cw + c * sw;
    c = c2;
    a *= decay;
    if (a < 1e-6 * amp && t60 > 0) break;
  }
}

/** White noise from seeded `r`. */
export function noise(n, r) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  return x;
}

// ---- envelopes ----
/**
 * An amplitude envelope of `n` samples: a smooth rise over `a` s (sin^2), held to `hold` s (the note's length), then an
 * exponential fall whose time constant makes it -60 dB after `r` s. `curve` shapes the hold (a function of t, the level).
 */
export function env(n, { a = 0.01, hold, r = 0.2, level = null }) {
  const e = new Float32Array(n);
  const tau = r / 6.9;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v;
    if (t < hold) {
      v = t < a ? Math.sin((Math.PI / 2) * (t / a)) ** 2 : 1;
      if (level) v *= level(t);
      last = v;
    } else v = last * Math.exp(-(t - hold) / tau);
    e[i] = v;
  }
  return e;
}

// ---- Karplus-Strong ----
/**
 * A plucked string at `f` Hz, `seconds` long: a delay loop tuned by a first-order allpass, the loss filter a two-tap average
 * weighted `S` (0.5 dull .. 0.1 bright), decaying to -60 dB in `t60` s. The excitation is noise lowpassed at `pluck` Hz.
 */
export function ks(f, seconds, { t60 = 1, S = 0.5, pluck = 4000, r, position = 0 }) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const total = SR / f;
  let L = Math.floor(total - S - 0.2);
  if (L < 2) L = 2;
  const d = total - S - L;
  const C = (1 - d) / (1 + d);
  const loss = 10 ** (-3 / (t60 * f));
  const buf = new Float32Array(L);
  // excitation: lowpassed noise, mean removed, optional pluck-position comb
  const ex = noise(L, r);
  onePole(ex, pluck);
  onePole(ex, pluck * 1.5);
  let mean = 0;
  for (const v of ex) mean += v;
  mean /= L;
  let peak = 0;
  for (let i = 0; i < L; i++) { ex[i] -= mean; peak = Math.max(peak, Math.abs(ex[i])); }
  const p = Math.round(position * L);
  for (let i = 0; i < L; i++) buf[i] = (ex[i] - (p ? ex[(i + p) % L] : 0)) / (peak || 1);
  let idx = 0;
  let prev = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[idx];
    const lp = ((1 - S) * v + S * prev) * loss;
    prev = v;
    const y = C * lp + apIn - C * apOut;
    apIn = lp;
    apOut = y;
    buf[idx] = y;
    out[i] = v;
    idx++;
    if (idx >= L) idx = 0;
  }
  return out;
}

// ---- resampling ----
/** Resamples `x` by `rate` (out[i] = x[i * rate]) with 4-point cubic interpolation; lowpasses first when the rate is over 1. */
export function resample(x, rate) {
  let src = x;
  if (rate > 1.02) {
    src = Float32Array.from(x);
    const fc = (0.45 * SR) / rate;
    eq(src, [['lp', fc, 0.6], ['lp', fc, 1.3]]);
  }
  const n = Math.floor((src.length - 3) / rate);
  const out = new Float32Array(Math.max(0, n));
  for (let i = 0; i < n; i++) {
    const p = i * rate;
    const k = Math.floor(p);
    const t = p - k;
    const y0 = src[k - 1] ?? src[k];
    const y1 = src[k];
    const y2 = src[k + 1];
    const y3 = src[k + 2];
    const c1 = 0.5 * (y2 - y0);
    const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    out[i] = ((c3 * t + c2) * t + c1) * t + y1;
  }
  return out;
}

// ---- mixing ----
/** Adds mono `x` into stereo [L, R] at sample `at`, gain `g`, pan -1..1 (constant power). */
export function addTo(stereo, x, at, g = 1, pan = 0) {
  const [L, R] = stereo;
  const ang = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  const gl = g * Math.cos(ang) * Math.SQRT2;
  const gr = g * Math.sin(ang) * Math.SQRT2;
  const from = Math.max(0, -at);
  const to = Math.min(x.length, L.length - at);
  for (let i = from; i < to; i++) {
    L[at + i] += gl * x[i];
    R[at + i] += gr * x[i];
  }
}

// ---- the hall ----
/**
 * A stereo hall: highpassed and lowpassed send, predelay, four series allpass diffusers, then an 8-line feedback delay network
 * (Householder mixing, a one-pole damping in each line) decaying to -60 dB in `rt60` s. Returns the wet [L, R] only.
 */
export function hall([L, R], { rt60 = 2.0, predelay = 0.022, damp = 5200, low = 180, high = 7500, size = 1 } = {}) {
  const n = L.length;
  const send = new Float32Array(n);
  for (let i = 0; i < n; i++) send[i] = 0.5 * (L[i] + R[i]);
  eq(send, [['hp', low, 0.7], ['lp', high, 0.7]]);
  // predelay
  const pd = Math.round(predelay * SR);
  const x = new Float32Array(n);
  for (let i = pd; i < n; i++) x[i] = send[i - pd];
  // diffusers
  for (const [len, g] of [[142, 0.6], [107, 0.6], [379, 0.55], [277, 0.55]]) {
    const b = new Float32Array(len);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const d = b[j];
      const v = x[i] + g * d;
      b[j] = v;
      x[i] = d - g * v;
      j = j + 1 === len ? 0 : j + 1;
    }
  }
  const lens = [1423, 1597, 1777, 1949, 2129, 2293, 2477, 2659].map(v => Math.round(v * size));
  const N = lens.length;
  const lines = lens.map(len => new Float32Array(len));
  const pos = new Int32Array(N);
  const gains = lens.map(len => 10 ** ((-3 * len) / (SR * rt60)));
  const da = Math.exp((-TAU * damp) / SR);
  const lp = new Float64Array(N);
  const outs = new Float64Array(N);
  const wl = new Float32Array(n);
  const wr = new Float32Array(n);
  const sign = [1, -1, 1, -1, 1, -1, 1, -1];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < N; k++) {
      const v = lines[k][pos[k]];
      lp[k] = (1 - da) * v + da * lp[k];
      outs[k] = lp[k] * gains[k];
      sum += outs[k];
    }
    const h = (2 / N) * sum;
    const inp = x[i];
    let l = 0;
    let r = 0;
    for (let k = 0; k < N; k++) {
      const fb = outs[k] - h;
      lines[k][pos[k]] = fb + inp * sign[k] * 0.35;
      pos[k] = pos[k] + 1 === lens[k] ? 0 : pos[k] + 1;
      if (k & 1) r += outs[k]; else l += outs[k];
    }
    wl[i] = l * 0.5;
    wr[i] = r * 0.5;
  }
  return [wl, wr];
}

/** Peak |x| over a channel list. */
export function peakOf(chans) {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > p) p = v; }
  return p;
}
