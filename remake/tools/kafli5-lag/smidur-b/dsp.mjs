// smidur-b's small DSP kit: seeded randomness, oscillators, filters, envelopes, an FDN reverb, a tempo echo. Plain Node, no packages.
export const SR = 44100;
export const TAU = Math.PI * 2;

/** A seeded random source (mulberry32) giving 0..1. */
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
/** A 32-bit hash of any strings/numbers, for seeding an event by what it is (so a repeated bar renders the same samples). */
export function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export const midiHz = m => 440 * 2 ** ((m - 69) / 12);
export const dbGain = db => 10 ** (db / 20);
export const gainDb = g => 20 * Math.log10(Math.max(g, 1e-12));

// ---------- oscillators (a per-sample frequency array or a constant), band-limited with polyBLEP ----------
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
/** Sawtooth: n samples, frequency f (number or Float32Array), start phase 0..1. */
export function saw(n, f, phase = 0) {
  const out = new Float32Array(n);
  let p = phase;
  const arr = typeof f !== 'number';
  for (let i = 0; i < n; i++) {
    const dt = (arr ? f[i] : f) / SR;
    out[i] = 2 * p - 1 - blep(p, dt);
    p += dt;
    if (p >= 1) p -= 1;
  }
  return out;
}
/** Pulse wave of duty d. */
export function pulse(n, f, d = 0.5, phase = 0) {
  const out = new Float32Array(n);
  let p = phase;
  const arr = typeof f !== 'number';
  for (let i = 0; i < n; i++) {
    const dt = (arr ? f[i] : f) / SR;
    let v = p < d ? 1 : -1;
    v += blep(p, dt);
    let q = p - d; if (q < 0) q += 1;
    v -= blep(q, dt);
    out[i] = v;
    p += dt;
    if (p >= 1) p -= 1;
  }
  return out;
}
/** Sine with a frequency array or constant. */
export function sine(n, f, phase = 0) {
  const out = new Float32Array(n);
  let p = phase * TAU;
  const arr = typeof f !== 'number';
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin(p);
    p += TAU * (arr ? f[i] : f) / SR;
  }
  return out;
}
/** A frequency array gliding exponentially from f0 to f1 with time constant tau (s). */
export function glide(n, f0, f1, tau) {
  const out = new Float32Array(n);
  const k = Math.exp(-1 / (tau * SR));
  let r = 1;
  for (let i = 0; i < n; i++) { out[i] = f1 + (f0 - f1) * r; r *= k; }
  return out;
}
/** Add vibrato (cents depth, rate Hz, fading in over `delay` s) to a frequency array, in place. */
export function vibrato(f, cents, rate, delay = 0.25, phase = 0) {
  for (let i = 0; i < f.length; i++) {
    const t = i / SR;
    const depth = cents * Math.min(1, Math.max(0, (t - delay * 0.5) / delay));
    f[i] *= 2 ** ((depth * Math.sin(TAU * (rate * t + phase))) / 1200);
  }
  return f;
}
export function constF(n, f) { return new Float32Array(n).fill(f); }

/** White noise, seeded. */
export function noise(n, seed) {
  const r = rng(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

// ---------- envelopes ----------
/** Attack (linear, s), then exponential decay to `sustain` with time constant `decay`, held until `hold` s, then release. */
export function adsr(n, { a = 0.005, d = 0.1, s = 0.7, hold = null, r = 0.1, curve = 1 }) {
  const out = new Float32Array(n);
  const A = Math.max(1, Math.round(a * SR));
  const H = hold == null ? n : Math.round(hold * SR);
  const kd = Math.exp(-1 / (Math.max(d, 1e-4) * SR));
  const kr = Math.exp(-1 / (Math.max(r, 1e-4) * SR));
  let v = 0, lvl = 1;
  for (let i = 0; i < n; i++) {
    if (i < A) v = curve === 1 ? i / A : Math.sin((Math.PI / 2) * (i / A));
    else if (i < H) { lvl = s + (lvl - s) * kd; v = lvl; }
    else { v *= kr; }
    out[i] = v;
  }
  return out;
}
/** Exponential decay envelope with a short linear attack. */
export function expEnv(n, a, tau) {
  const out = new Float32Array(n);
  const A = Math.max(1, Math.round(a * SR));
  const k = Math.exp(-1 / (tau * SR));
  let v = 1;
  for (let i = 0; i < n; i++) {
    if (i < A) out[i] = i / A;
    else { out[i] = v; v *= k; }
  }
  return out;
}
/** Multiply a in place by b (b may be shorter: the rest is zeroed). */
export function mul(a, b) {
  for (let i = 0; i < a.length; i++) a[i] *= i < b.length ? b[i] : 0;
  return a;
}
export function scale(a, g) { for (let i = 0; i < a.length; i++) a[i] *= g; return a; }
export function addInto(dst, src, at = 0, g = 1) {
  const n = Math.min(src.length, dst.length - at);
  for (let i = Math.max(0, -at); i < n; i++) dst[at + i] += src[i] * g;
  return dst;
}
/** A short fade at the end (and optionally start) so a cut never clicks. */
export function edgeFade(a, outS = 0.004, inS = 0) {
  const fo = Math.min(a.length, Math.round(outS * SR));
  for (let i = 0; i < fo; i++) a[a.length - 1 - i] *= i / fo;
  const fi = Math.min(a.length, Math.round(inS * SR));
  for (let i = 0; i < fi; i++) a[i] *= i / fi;
  return a;
}
export function softClip(a, drive = 1) {
  const norm = Math.tanh(drive);
  for (let i = 0; i < a.length; i++) a[i] = Math.tanh(a[i] * drive) / norm;
  return a;
}

// ---------- filters ----------
/** RBJ biquad coefficients. */
export function biquad(type, f, q = 0.707, gainDB = 0) {
  const w = TAU * Math.min(f, SR * 0.49) / SR;
  const cw = Math.cos(w), sw = Math.sin(w);
  const al = sw / (2 * q);
  const A = 10 ** (gainDB / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'peak': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: throw new Error(type);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
/** Run a biquad over a (in place). */
export function filt(a, c) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const { b0, b1, b2, a1, a2 } = c;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    a[i] = y;
  }
  return a;
}
export const lp = (a, f, q = 0.707) => filt(a, biquad('lp', f, q));
export const hp = (a, f, q = 0.707) => filt(a, biquad('hp', f, q));
export const bp = (a, f, q = 1) => filt(a, biquad('bp', f, q));
export const peak = (a, f, q, g) => filt(a, biquad('peak', f, q, g));
export const hshelf = (a, f, g, q = 0.707) => filt(a, biquad('highshelf', f, q, g));
export const lshelf = (a, f, g, q = 0.707) => filt(a, biquad('lowshelf', f, q, g));

/**
 * A TPT state-variable low-pass (12 dB/oct) whose cutoff follows `fc` (number, array or function of sample index), resonance `res` 0..1.
 * Returns the filtered array (in place).
 */
export function svfLP(a, fc, res = 0.2, mode = 'lp') {
  let ic1 = 0, ic2 = 0;
  const k = 2 - 2 * Math.min(0.98, res);
  const isArr = typeof fc !== 'number' && typeof fc !== 'function';
  for (let i = 0; i < a.length; i++) {
    const f = typeof fc === 'number' ? fc : isArr ? fc[i] : fc(i);
    const g = Math.tan(Math.PI * Math.min(f, SR * 0.45) / SR);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v0 = a[i];
    const v3 = v0 - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    a[i] = mode === 'lp' ? v2 : mode === 'bp' ? v1 : v0 - k * v1 - v2;
  }
  return a;
}
/** A one-pole low-pass (6 dB/oct), in place. */
export function onePoleLP(a, f) {
  const k = Math.exp(-TAU * f / SR);
  let y = 0;
  for (let i = 0; i < a.length; i++) { y = a[i] * (1 - k) + y * k; a[i] = y; }
  return a;
}

// ---------- modal resonator bank: decaying sines struck at once ----------
/** modes: [{ f, amp, tau, phase? }]; returns n samples. Optional pitch bend: f(t) = f * (1 + bend * exp(-t / bendTau)). */
export function modes(n, list, { bend = 0, bendTau = 0.03 } = {}) {
  const out = new Float32Array(n);
  for (const m of list) {
    const k = Math.exp(-1 / (m.tau * SR));
    let env = m.amp, p = (m.phase ?? 0) * TAU;
    const kb = Math.exp(-1 / (bendTau * SR));
    let b = bend;
    const lim = Math.min(n, Math.ceil(m.tau * SR * 9));
    for (let i = 0; i < lim; i++) {
      out[i] += env * Math.sin(p);
      p += TAU * m.f * (1 + b) / SR;
      b *= kb;
      env *= k;
    }
  }
  return out;
}

// ---------- stereo buses ----------
export class Bus {
  constructor(n) { this.L = new Float32Array(n); this.R = new Float32Array(n); this.n = n; }
  /** Add a mono buffer at sample `at`, gain g, pan -1..1 (equal power). */
  add(buf, at, g = 1, pan = 0) {
    const th = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
    const gl = g * Math.cos(th) * Math.SQRT2, gr = g * Math.sin(th) * Math.SQRT2;
    const n = Math.min(buf.length, this.n - at);
    for (let i = Math.max(0, -at); i < n; i++) { this.L[at + i] += buf[i] * gl; this.R[at + i] += buf[i] * gr; }
  }
  /** Add a stereo pair. */
  add2(l, r, at, g = 1) {
    const n = Math.min(l.length, this.n - at);
    for (let i = Math.max(0, -at); i < n; i++) { this.L[at + i] += l[i] * g; this.R[at + i] += r[i] * g; }
  }
  mix(other, g = 1) { for (let i = 0; i < this.n; i++) { this.L[i] += other.L[i] * g; this.R[i] += other.R[i] * g; } }
  peak() { let p = 0; for (let i = 0; i < this.n; i++) p = Math.max(p, Math.abs(this.L[i]), Math.abs(this.R[i])); return p; }
  scale(g) { scale(this.L, g); scale(this.R, g); return this; }
}

// ---------- reverb: an 8-line feedback delay network with input diffusion and damping ----------
/**
 * Reverb of a stereo bus's send (returns a new wet Bus). rt60 (s) at low frequencies, damp (Hz) where the tail darkens, pre (s)
 * pre-delay, size scales the delay lengths.
 */
export function fdnReverb(send, { rt60 = 2.2, damp = 4500, pre = 0.02, size = 1, hpf = 180, width = 1 } = {}) {
  const n = send.n;
  const out = new Bus(n);
  const base = [1031, 1327, 1523, 1801, 2053, 2309, 2617, 2903].map(d => Math.round(d * size));
  const N = 8;
  const lines = base.map(d => ({ buf: new Float32Array(d), idx: 0, len: d, lp: 0, g: 10 ** (-3 * d / (rt60 * SR)) }));
  const kd = Math.exp(-TAU * damp / SR);
  // input diffusion: 4 allpasses per side
  const apLens = [142, 107, 379, 277].map(d => Math.round(d * size));
  const mkAP = lens => lens.map(l => ({ buf: new Float32Array(l), idx: 0, len: l }));
  const apL = mkAP(apLens), apR = mkAP(apLens.map(l => l + 23));
  const preS = Math.round(pre * SR);
  // high-pass the send (one-pole) so the tail is not boomy
  const kh = Math.exp(-TAU * hpf / SR);
  let hl = 0, hr = 0, xl1 = 0, xr1 = 0;
  const ap = (st, x, g = 0.7) => {
    const d = st.buf[st.idx];
    const y = -g * x + d;
    st.buf[st.idx] = x + g * y;
    st.idx = (st.idx + 1) % st.len;
    return y;
  };
  const vals = new Float64Array(N);
  for (let i = 0; i < n; i++) {
    const j = i - preS;
    let xl = j >= 0 ? send.L[j] : 0, xr = j >= 0 ? send.R[j] : 0;
    // one-pole high-pass
    hl = kh * (hl + xl - xl1); xl1 = xl; xl = hl;
    hr = kh * (hr + xr - xr1); xr1 = xr; xr = hr;
    for (const s of apL) xl = ap(s, xl);
    for (const s of apR) xr = ap(s, xr);
    let sum = 0;
    for (let k = 0; k < N; k++) {
      const L = lines[k];
      let v = L.buf[L.idx];
      L.lp = v * (1 - kd) + L.lp * kd; // damping
      v = L.lp * L.g;
      vals[k] = v;
      sum += v;
    }
    const h = (2 / N) * sum;
    let ol = 0, or = 0;
    for (let k = 0; k < N; k++) {
      const L = lines[k];
      const fb = vals[k] - h; // Householder
      L.buf[L.idx] = fb + (k % 2 === 0 ? xl : xr) * (k < 4 ? 1 : -1);
      L.idx = L.idx + 1 === L.len ? 0 : L.idx + 1;
      if (k % 2 === 0) ol += vals[k] * (k % 4 === 0 ? 1 : -1); else or += vals[k] * (k % 4 === 1 ? 1 : -1);
    }
    const mid = (ol + or) * 0.5, side = (ol - or) * 0.5 * width;
    out.L[i] = (mid + side) * 0.35;
    out.R[i] = (mid - side) * 0.35;
  }
  return out;
}

/** A tempo echo (ping-pong) of a send: delay d (s), feedback fb, low-pass lpf on the repeats. */
export function pingPong(send, { d, fb = 0.35, lpf = 3500, mix = 1 }) {
  const n = send.n;
  const out = new Bus(n);
  const D = Math.round(d * SR);
  const bl = new Float32Array(D), br = new Float32Array(D);
  let idx = 0, yl = 0, yr = 0;
  const k = Math.exp(-TAU * lpf / SR);
  for (let i = 0; i < n; i++) {
    const dl = bl[idx], dr = br[idx];
    yl = dl * (1 - k) + yl * k; yr = dr * (1 - k) + yr * k;
    const inM = (send.L[i] + send.R[i]) * 0.5;
    bl[idx] = inM + yr * fb;
    br[idx] = yl * fb;
    idx = (idx + 1) % D;
    out.L[i] = dl * mix; out.R[i] = dr * mix;
  }
  return out;
}
