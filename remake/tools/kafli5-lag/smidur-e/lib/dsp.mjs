// Small DSP kit: seeded noise, band-limited oscillators, envelopes, filters, delays, an FDN reverb, chorus, saturation.
import { SR } from './io.mjs';

export const TAU = Math.PI * 2;

/** Seeded PRNG (mulberry32): returns () => [0, 1). */
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

export const mtof = m => 440 * 2 ** ((m - 69) / 12);
export const dbToGain = db => 10 ** (db / 20);
export const gainToDb = g => 20 * Math.log10(Math.max(g, 1e-12));

/** A stereo buffer of n samples. */
export function stereo(n) {
  return { L: new Float32Array(n), R: new Float32Array(n), n };
}

/** Equal-power pan gains for p in [-1, 1]. */
export function panGains(p) {
  const a = ((p + 1) / 2) * (Math.PI / 2);
  return [Math.cos(a), Math.sin(a)];
}

/** Add a mono signal into a stereo buffer at sample `at`, with gain and pan. */
export function addMono(dst, src, at, gain = 1, pan = 0) {
  const [gl, gr] = panGains(pan);
  const a = Math.round(at);
  for (let i = 0; i < src.length; i++) {
    const j = a + i;
    if (j < 0) continue;
    if (j >= dst.n) break;
    dst.L[j] += src[i] * gain * gl;
    dst.R[j] += src[i] * gain * gr;
  }
}
export function addStereo(dst, src, at = 0, gain = 1) {
  const a = Math.round(at);
  for (let i = 0; i < src.n; i++) {
    const j = a + i;
    if (j < 0) continue;
    if (j >= dst.n) break;
    dst.L[j] += src.L[i] * gain;
    dst.R[j] += src.R[i] * gain;
  }
}

// ---- oscillators (PolyBLEP) ----
function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}
/** Band-limited saw: advance phase by f/SR each call. */
export class Saw {
  constructor(phase = 0) {
    this.p = phase;
  }
  next(f) {
    const dt = f / SR;
    const v = 2 * this.p - 1 - blep(this.p, dt);
    this.p += dt;
    if (this.p >= 1) this.p -= 1;
    return v;
  }
}
export class Pulse {
  constructor(phase = 0) {
    this.p = phase;
  }
  next(f, w = 0.5) {
    const dt = f / SR;
    let v = this.p < w ? 1 : -1;
    v += blep(this.p, dt);
    let q = this.p - w;
    if (q < 0) q += 1;
    v -= blep(q, dt);
    this.p += dt;
    if (this.p >= 1) this.p -= 1;
    return v;
  }
}

// ---- filters ----
/** Zavalishin TPT state-variable filter; call set(fc, q) then tick(x) → { lp, bp, hp } in fields. */
export class SVF {
  constructor() {
    this.s1 = 0;
    this.s2 = 0;
    this.g = 0;
    this.k = 1;
    this.lp = 0;
    this.bp = 0;
    this.hp = 0;
  }
  set(fc, q = 0.707) {
    const f = Math.min(fc, SR * 0.49);
    this.g = Math.tan((Math.PI * f) / SR);
    this.k = 1 / q;
    this.a1 = 1 / (1 + this.g * (this.g + this.k));
  }
  tick(x) {
    const g = this.g;
    const hp = (x - (this.k + g) * this.s1 - this.s2) * this.a1;
    const v1 = g * hp;
    const bp = v1 + this.s1;
    this.s1 = bp + v1;
    const v2 = g * bp;
    const lp = v2 + this.s2;
    this.s2 = lp + v2;
    this.lp = lp;
    this.bp = bp;
    this.hp = hp;
    return lp;
  }
}

/** RBJ biquad, fixed coefficients. type: lp hp bp peak lowshelf highshelf. */
export class Biquad {
  constructor(type, f, q = 0.707, db = 0) {
    const w = (TAU * f) / SR;
    const cw = Math.cos(w), sw = Math.sin(w);
    const alpha = sw / (2 * q);
    const A = 10 ** (db / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') [b0, b1, b2, a0, a1, a2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + alpha, -2 * cw, 1 - alpha];
    else if (type === 'hp') [b0, b1, b2, a0, a1, a2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + alpha, -2 * cw, 1 - alpha];
    else if (type === 'bp') [b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cw, 1 - alpha];
    else if (type === 'peak') [b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cw, 1 - alpha * A, 1 + alpha / A, -2 * cw, 1 - alpha / A];
    else if (type === 'lowshelf') {
      const s = 2 * Math.sqrt(A) * alpha;
      [b0, b1, b2, a0, a1, a2] = [
        A * (A + 1 - (A - 1) * cw + s), 2 * A * (A - 1 - (A + 1) * cw), A * (A + 1 - (A - 1) * cw - s),
        A + 1 + (A - 1) * cw + s, -2 * (A - 1 + (A + 1) * cw), A + 1 + (A - 1) * cw - s,
      ];
    } else if (type === 'highshelf') {
      const s = 2 * Math.sqrt(A) * alpha;
      [b0, b1, b2, a0, a1, a2] = [
        A * (A + 1 + (A - 1) * cw + s), -2 * A * (A - 1 + (A + 1) * cw), A * (A + 1 + (A - 1) * cw - s),
        A + 1 - (A - 1) * cw + s, 2 * (A - 1 - (A + 1) * cw), A + 1 - (A - 1) * cw - s,
      ];
    } else throw new Error(type);
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  run(buf) {
    for (let i = 0; i < buf.length; i++) buf[i] = this.tick(buf[i]);
    return buf;
  }
}
/** Run a chain of fresh biquads (made by `make()`) over both channels. */
export function eqStereo(st, make) {
  for (const ch of [st.L, st.R]) for (const f of make()) f.run(ch);
  return st;
}

/** One-pole lowpass helper. */
export class OnePole {
  constructor(fc) {
    this.set(fc);
    this.y = 0;
  }
  set(fc) {
    this.a = Math.exp((-TAU * fc) / SR);
  }
  tick(x) {
    this.y = x + this.a * (this.y - x);
    return this.y;
  }
}

// ---- envelopes ----
/** ADSR value at time t (s) for a note held `hold` s. Exponential-ish segments. */
export function adsr(t, hold, a, d, s, r) {
  if (t < 0) return 0;
  let v;
  if (t < a) v = t / a;
  else if (t < a + d) v = s + (1 - s) * Math.exp((-5 * (t - a)) / d);
  else v = s + (1 - s) * Math.exp(-5);
  if (t > hold) {
    const at = adsr(hold, hold + 1, a, d, s, r);
    return at * Math.exp((-5 * (t - hold)) / r);
  }
  return v;
}

export const softclip = x => Math.tanh(x);

// ---- effects ----
/** Tempo-synced ping-pong delay, applied in place on a copy (returns the wet stereo signal). */
export function pingPong(src, delaySamples, feedback = 0.45, lpHz = 5000, hpHz = 200) {
  const out = stereo(src.n);
  const n = Math.round(delaySamples);
  const bufL = new Float32Array(n), bufR = new Float32Array(n);
  let idx = 0;
  const lpL = new OnePole(lpHz), lpR = new OnePole(lpHz);
  const hpL = new OnePole(hpHz), hpR = new OnePole(hpHz);
  for (let i = 0; i < src.n; i++) {
    const dl = bufL[idx], dr = bufR[idx];
    out.L[i] = dl;
    out.R[i] = dr;
    const inMono = (src.L[i] + src.R[i]) * 0.5;
    // cross-feedback: left feeds right, input enters left
    let fl = inMono + dr * feedback;
    let fr = dl * feedback;
    fl = lpL.tick(fl); fl -= hpL.tick(fl);
    fr = lpR.tick(fr); fr -= hpR.tick(fr);
    bufL[idx] = fl;
    bufR[idx] = fr;
    idx++;
    if (idx >= n) idx = 0;
  }
  return out;
}

/** Feedback-delay-network reverb (8 lines, Householder), returns the wet stereo signal. */
export function reverb(src, { decay = 1.8, damp = 6000, predelay = 0.02, size = 1, lowcut = 250, seed = 7 } = {}) {
  const lens = [1031, 1327, 1523, 1801, 2063, 2339, 2617, 2903].map(l => Math.round(l * size));
  const lines = lens.map(l => new Float32Array(l));
  const idx = new Array(8).fill(0);
  const lps = lens.map(() => new OnePole(damp));
  const gains = lens.map(l => 10 ** ((-3 * l) / (decay * SR)));
  const pre = Math.max(1, Math.round(predelay * SR));
  const preL = new Float32Array(pre), preR = new Float32Array(pre);
  let pi = 0;
  const out = stereo(src.n);
  const hpIn = new OnePole(lowcut);
  const r = rng(seed);
  const signs = lens.map(() => (r() < 0.5 ? -1 : 1));
  const v = new Float64Array(8);
  // input diffusers (allpasses)
  const ap = [142, 379, 107, 277].map(l => ({ buf: new Float32Array(l), i: 0, g: 0.6 }));
  for (let i = 0; i < src.n; i++) {
    let x = preL[pi] + preR[pi];
    preL[pi] = src.L[i];
    preR[pi] = src.R[i];
    pi = (pi + 1) % pre;
    x = x * 0.5;
    x -= hpIn.tick(x) * 0 + 0; // keep the dc path; lowcut applied below
    for (const a of ap) {
      const d = a.buf[a.i];
      const y = -a.g * x + d;
      a.buf[a.i] = x + a.g * y;
      a.i = (a.i + 1) % a.buf.length;
      x = y;
    }
    let sum = 0;
    for (let k = 0; k < 8; k++) {
      v[k] = lines[k][idx[k]];
      sum += v[k];
    }
    sum *= 2 / 8;
    let l = 0, rr = 0;
    for (let k = 0; k < 8; k++) {
      const fb = (v[k] - sum) * gains[k];
      const y = lps[k].tick(fb) + x * signs[k] * 0.35;
      lines[k][idx[k]] = y;
      idx[k]++;
      if (idx[k] >= lens[k]) idx[k] = 0;
      if (k % 2 === 0) l += v[k] * signs[k];
      else rr += v[k] * signs[k];
    }
    out.L[i] = l * 0.35;
    out.R[i] = rr * 0.35;
  }
  // low cut on the wet signal so the reverb never muddies the low end
  eqStereo(out, () => [new Biquad('hp', lowcut, 0.7)]);
  return out;
}

/** Ensemble chorus (three modulated taps per side), returns processed stereo (dry+wet mix). */
export function chorus(src, { depthMs = 3.5, cycles = [5, 7, 3], period = 7.68, mix = 0.5, baseMs = 9 } = {}) {
  const out = stereo(src.n);
  const max = Math.ceil(((baseMs + depthMs * 2) / 1000) * SR) + 4;
  const bl = new Float32Array(max), br = new Float32Array(max);
  let w = 0;
  const rates = cycles.map(c => c / period); // whole cycles per loop length, so the loop's seam stays clean
  const phases = [0, 2.1, 4.2];
  for (let i = 0; i < src.n; i++) {
    bl[w] = src.L[i];
    br[w] = src.R[i];
    let wl = 0, wr = 0;
    for (let k = 0; k < 3; k++) {
      const t = i / SR;
      const ml = ((baseMs + depthMs * Math.sin(TAU * rates[k] * t + phases[k])) / 1000) * SR;
      const mr = ((baseMs + depthMs * Math.sin(TAU * rates[k] * t + phases[k] + Math.PI / 2)) / 1000) * SR;
      wl += readFrac(bl, w, ml, max);
      wr += readFrac(br, w, mr, max);
    }
    out.L[i] = src.L[i] * (1 - mix) + (wl / 3) * mix * 1.2;
    out.R[i] = src.R[i] * (1 - mix) + (wr / 3) * mix * 1.2;
    w = (w + 1) % max;
  }
  return out;
}
function readFrac(buf, w, delay, max) {
  let p = w - delay;
  while (p < 0) p += max;
  const i0 = Math.floor(p);
  const fr = p - i0;
  const a = buf[i0 % max], b = buf[(i0 + 1) % max];
  return a + (b - a) * fr;
}

/** Sidechain gain curve: 1 everywhere, dipping by `depth` at each kick sample and recovering over `release` s. */
export function duckCurve(n, kickSamples, depth = 0.5, release = 0.2, attack = 0.004) {
  const g = new Float32Array(n).fill(1);
  const relN = Math.round(release * SR), atN = Math.max(1, Math.round(attack * SR));
  for (const k of kickSamples) {
    const s = Math.round(k);
    for (let i = -atN; i < relN; i++) {
      const j = s + i;
      if (j < 0 || j >= n) continue;
      let d;
      if (i < 0) d = depth * (1 - -i / atN) * 0.0; // no pre-duck (keeps the grid honest)
      else {
        const x = i / relN;
        d = depth * (0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, x))) ** 1.2;
      }
      const v = 1 - d;
      if (v < g[j]) g[j] = v;
    }
  }
  return g;
}
export function applyGain(st, g) {
  for (let i = 0; i < st.n; i++) {
    st.L[i] *= g[i];
    st.R[i] *= g[i];
  }
  return st;
}

/** Peak of a stereo buffer. */
export function peakOf(st) {
  let p = 0;
  for (let i = 0; i < st.n; i++) {
    const a = Math.abs(st.L[i]), b = Math.abs(st.R[i]);
    if (a > p) p = a;
    if (b > p) p = b;
  }
  return p;
}
