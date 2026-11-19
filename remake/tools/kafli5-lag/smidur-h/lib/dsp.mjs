// Small DSP kit: seeded randomness, RBJ biquads, envelopes, modal resonators, a windowed-sinc resampler (fixed and
// time-varying rate), soft clipping and an FDN reverb. Everything is deterministic: the same call gives the same samples.
export const SR = 44100;
const TAU = Math.PI * 2;

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
/** A 32-bit hash of a string (FNV-1a), for seeds named by what they are for. */
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export const secs = n => Math.round(n * SR);

/** RBJ biquad, processed in place over a Float32Array. */
export function biquad(x, type, f, q = 0.707, gainDb = 0) {
  f = Math.min(f, SR * 0.45);
  const w = (TAU * f) / SR, cw = Math.cos(w), sw = Math.sin(w), alpha = sw / (2 * q), A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'ls': { const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
      a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s; break; }
    case 'hs': { const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
      a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s; break; }
    default: throw new Error(`biquad ${type}`);
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}
/** One-pole lowpass in place. */
export function onepole(x, f) {
  const a = Math.exp((-TAU * f) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; x[i] = y; }
  return x;
}

export function white(n, r) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  return x;
}
/** Multiply by an attack-decay envelope: linear attack `a` s, exponential decay with time constant `d` s. */
export function adEnv(x, a, d, delay = 0) {
  const na = Math.max(1, secs(a)), nd = secs(delay);
  for (let i = 0; i < x.length; i++) {
    let e;
    if (i < nd) e = 0;
    else if (i < nd + na) e = (i - nd) / na;
    else e = Math.exp(-(i - nd - na) / SR / d);
    x[i] *= e;
  }
  return x;
}
/** Fade the last `t` seconds to zero (raised cosine) and the first `t0` up. */
export function fades(x, t0 = 0.002, t = 0.01) {
  const n0 = Math.min(x.length, secs(t0)), n1 = Math.min(x.length, secs(t));
  for (let i = 0; i < n0; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n0);
  for (let i = 0; i < n1; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n1);
  return x;
}
export function peak(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; }
  return p;
}
export function normalize(x, to = 1) {
  const p = peak(x);
  if (p > 0) for (let i = 0; i < x.length; i++) x[i] *= to / p;
  return x;
}
export function scale(x, g) { for (let i = 0; i < x.length; i++) x[i] *= g; return x; }
export function addInto(dst, src, at = 0, g = 1) {
  const n = Math.min(src.length, dst.length - at);
  for (let i = Math.max(0, -at); i < n; i++) dst[at + i] += src[i] * g;
}
export function softclip(x, drive = 1) {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k;
  return x;
}

/**
 * Modal synthesis: a bank of decaying sines struck by an excitation. modes: [{ f, a, d }] (Hz, amplitude, decay s).
 * The excitation is a raised-cosine pulse of `hard` ms (smaller is a harder mallet), applied as a short convolution.
 */
export function modal(n, modes, { hard = 0.6, phase = 0 } = {}) {
  const x = new Float32Array(n);
  for (const m of modes) {
    if (m.f >= SR * 0.45) continue;
    const w = (TAU * m.f) / SR, k = Math.exp(-1 / (SR * m.d));
    // damped sine by recursion: y[i] = 2 r cos w y[i-1] - r^2 y[i-2]
    let y1 = Math.sin(phase) * m.a, y2 = Math.sin(phase - w) * m.a / k;
    const c = 2 * k * Math.cos(w), kk = k * k;
    // pulse smoothing of the attack: brighter modes are damped by a harder/softer mallet
    const soft = hard > 0 ? 1 / (1 + (m.f * hard / 1000) ** 2) : 1;
    for (let i = 0; i < n; i++) {
      const y = c * y1 - kk * y2;
      x[i] += y1 * soft;
      y2 = y1; y1 = y;
    }
  }
  // mallet: smooth the very start
  const na = Math.max(1, Math.round((hard / 1000) * SR));
  for (let i = 0; i < Math.min(na, n); i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / na);
  return x;
}

/** A struck resonator fed by a signal: two-pole bandpass ringing at f with decay d. In place: returns new array. */
export function resonate(x, f, d, gain = 1) {
  const w = (TAU * f) / SR, r = Math.exp(-1 / (SR * d));
  const c = 2 * r * Math.cos(w), rr = r * r, out = new Float32Array(x.length);
  let y1 = 0, y2 = 0;
  const norm = (1 - rr) * gain;
  for (let i = 0; i < x.length; i++) {
    const y = norm * x[i] + c * y1 - rr * y2;
    out[i] = y; y2 = y1; y1 = y;
  }
  return out;
}

// --- resampling -----------------------------------------------------------------------------------------------------
const W = 16;
function kernel(t, c) {
  // windowed sinc (Blackman), cutoff c (1 = Nyquist)
  if (Math.abs(t) >= W / c) return 0;
  const a = Math.PI * t * c;
  const s = t === 0 ? 1 : Math.sin(a) / a;
  const u = t / (W / c);
  const win = 0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u);
  return c * s * win;
}
/** Read x at fractional position p with cutoff c. */
function readAt(x, p, c) {
  const i0 = Math.floor(p), span = Math.ceil(W / c);
  let s = 0;
  for (let k = i0 - span + 1; k <= i0 + span; k++) {
    if (k < 0 || k >= x.length) continue;
    s += x[k] * kernel(p - k, c);
  }
  return s;
}
/** Resample x by a constant rate (2 = an octave up, half the length). */
export function resample(x, rate) {
  const n = Math.floor(x.length / rate);
  const out = new Float32Array(n), c = Math.min(1, 1 / rate) * 0.95;
  for (let i = 0; i < n; i++) out[i] = readAt(x, i * rate, c);
  return out;
}
/** Resample with a rate that changes over the source: rateAt(sourceSeconds) → rate. */
export function resampleVar(x, rateAt, maxOut = Infinity) {
  const out = [];
  let p = 0;
  while (p < x.length - 1 && out.length < maxOut) {
    const r = rateAt(p / SR);
    out.push(readAt(x, p, Math.min(1, 1 / r) * 0.95));
    p += r;
  }
  return Float32Array.from(out);
}

// --- effects --------------------------------------------------------------------------------------------------------
/**
 * Feedback delay network reverb (8 lines, Householder mix, damped), linear and time-invariant, stereo out from mono-summed
 * stereo in. Returns [L, R] wet only. rt60 in s, damp: lowpass Hz in the loop, pre: predelay s.
 */
export function fdnReverb(inL, inR, { rt60 = 1.4, damp = 5000, pre = 0.012, hp = 180 } = {}) {
  const n = inL.length;
  const lens = [1031, 1327, 1523, 1777, 1949, 2213, 2467, 2731].map(l => Math.round(l * 1.15));
  const N = lens.length;
  const bufs = lens.map(l => new Float32Array(l));
  const idx = new Array(N).fill(0);
  const g = lens.map(l => 10 ** ((-3 * l) / SR / rt60));
  const a = Math.exp((-TAU * damp) / SR);
  const lp = new Float64Array(N);
  const L = new Float32Array(n), R = new Float32Array(n);
  const preN = secs(pre);
  const fb = new Float64Array(N);
  // input high-pass so the low end stays dry
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = 0.5 * (inL[i] + inR[i]);
  biquad(src, 'hp', hp, 0.7);
  for (let i = 0; i < n; i++) {
    const x = i >= preN ? src[i - preN] : 0;
    let sum = 0;
    for (let j = 0; j < N; j++) { fb[j] = bufs[j][idx[j]]; sum += fb[j]; }
    const h = (2 / N) * sum;
    let l = 0, r = 0;
    for (let j = 0; j < N; j++) {
      const v = fb[j];
      if (j & 1) r += v; else l += v;
      let y = (v - h) * g[j] + x * (j % 3 === 0 ? 0.5 : 0.35);
      lp[j] = (1 - a) * y + a * lp[j];
      bufs[j][idx[j]] = lp[j];
      idx[j] = (idx[j] + 1) % lens[j];
    }
    L[i] = l * 0.35; R[i] = r * 0.35;
  }
  return [L, R];
}

/** Tempo-synced echo: wet only, ping-pong between channels. */
export function echo(inL, inR, { time, feedback = 0.35, lp = 4000, hp = 300 } = {}) {
  const n = inL.length, d = secs(time);
  const L = new Float32Array(n), R = new Float32Array(n);
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = 0.5 * (inL[i] + inR[i]);
  biquad(src, 'hp', hp, 0.7); biquad(src, 'lp', lp, 0.7);
  for (let i = 0; i < n; i++) {
    const fromL = i >= d ? L[i - d] : 0, fromR = i >= d ? R[i - d] : 0;
    L[i] = (i >= d ? src[i - d] : 0) + fromR * feedback;
    R[i] = fromL * feedback;
  }
  return [L, R];
}
