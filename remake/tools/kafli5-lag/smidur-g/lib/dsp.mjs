// Signal tools for the song: seeded randomness, filters, a stereo bus, a reverb, a limiter, loudness (BS.1770) and WAV files.
import { writeFileSync } from 'node:fs';

export const SR = 44100;
export const TAU = Math.PI * 2;

/** A seeded generator in [0, 1) (mulberry32). */
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
/** A seed from a string, so every note's randomness is its own and stays put when others change. */
export function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const midiHz = m => 440 * 2 ** ((m - 69) / 12);
export const dbGain = db => 10 ** (db / 20);

// ---------------------------------------------------------------- filters

/** RBJ biquad coefficients. */
export function biquad(type, f, q = 0.707, gainDb = 0) {
  const w = (TAU * Math.min(f, SR * 0.49)) / SR;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const alpha = sw / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
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
    default: throw new Error(type);
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
/** Runs a biquad over x in place (direct form II transposed). */
export function filt(x, c) {
  const [b0, b1, b2, a1, a2] = c;
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    x[i] = y;
  }
  return x;
}
export const lp = (x, f, q) => filt(x, biquad('lp', f, q));
export const hp = (x, f, q) => filt(x, biquad('hp', f, q));
export const bp = (x, f, q) => filt(x, biquad('bp', f, q));
export const peak = (x, f, q, db) => filt(x, biquad('peak', f, q, db));
export const lowshelf = (x, f, db) => filt(x, biquad('lowshelf', f, 0.707, db));
export const highshelf = (x, f, db) => filt(x, biquad('highshelf', f, 0.707, db));

/** A state-variable filter (TPT) whose cutoff follows fc(i); mode 'lp' | 'bp' | 'hp'. In place. */
export function svf(x, fc, q, mode = 'lp') {
  let ic1 = 0;
  let ic2 = 0;
  const k = 1 / q;
  for (let i = 0; i < x.length; i++) {
    const f = Math.min(typeof fc === 'function' ? fc(i) : fc[i], SR * 0.45);
    const g = Math.tan((Math.PI * f) / SR);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    x[i] = mode === 'lp' ? v2 : mode === 'bp' ? v1 : x[i] - k * v1 - v2;
  }
  return x;
}

/** One-pole lowpass smoothing, in place. */
export function smooth(x, f) {
  const a = Math.exp((-TAU * f) / SR);
  let y = x[0] ?? 0;
  for (let i = 0; i < x.length; i++) {
    y = a * y + (1 - a) * x[i];
    x[i] = y;
  }
  return x;
}

// ---------------------------------------------------------------- a stereo bus

export class Bus {
  constructor(length) {
    this.L = new Float32Array(length);
    this.R = new Float32Array(length);
    this.length = length;
  }
  /** Adds mono x at sample `at` with `gain`, equal-power `pan` (-1 left .. 1 right). */
  add(x, at, gain = 1, pan = 0) {
    const p = (Math.max(-1, Math.min(1, pan)) + 1) * (Math.PI / 4);
    const gl = Math.cos(p) * gain * Math.SQRT2;
    const gr = Math.sin(p) * gain * Math.SQRT2;
    const start = Math.max(0, at);
    const end = Math.min(this.length, at + x.length);
    for (let i = start; i < end; i++) {
      const v = x[i - at];
      this.L[i] += v * gl;
      this.R[i] += v * gr;
    }
  }
  /** Adds a stereo pair. */
  add2(l, r, at, gain = 1) {
    const end = Math.min(this.length, at + l.length);
    for (let i = Math.max(0, at); i < end; i++) {
      this.L[i] += l[i - at] * gain;
      this.R[i] += r[i - at] * gain;
    }
  }
  mix(other, gain = 1) {
    for (let i = 0; i < this.length; i++) {
      this.L[i] += other.L[i] * gain;
      this.R[i] += other.R[i] * gain;
    }
  }
  scale(g) {
    for (let i = 0; i < this.length; i++) { this.L[i] *= g; this.R[i] *= g; }
  }
  peak() {
    let p = 0;
    for (let i = 0; i < this.length; i++) p = Math.max(p, Math.abs(this.L[i]), Math.abs(this.R[i]));
    return p;
  }
}

// ---------------------------------------------------------------- reverb

/**
 * A stereo feedback-delay-network reverb (8 lines, Householder mix, damped), with a few early reflections. Returns a wet Bus.
 * `size` scales the delay lengths, `decay` is the RT60 in seconds, `damp` the loop's lowpass (Hz), `pre` the predelay (s).
 */
export function reverb(input, { size = 1, decay = 1.6, damp = 6000, pre = 0.018, hpf = 180 } = {}) {
  const N = input.length;
  const out = new Bus(N);
  const base = [1031, 1327, 1523, 1801, 2063, 2333, 2593, 2843].map(d => Math.round(d * size));
  const lines = base.map(d => ({ buf: new Float32Array(d), i: 0, d, lp: 0, g: 10 ** ((-3 * d) / SR / decay) }));
  const dampA = Math.exp((-TAU * damp) / SR);
  const preN = Math.round(pre * SR);
  // input filtered (no mud into the tail)
  const inL = Float32Array.from(input.L);
  const inR = Float32Array.from(input.R);
  hp(inL, hpf); hp(inR, hpf);
  // early reflections: taps (s, gain, side)
  const er = [[0.007, 0.32, -1], [0.011, 0.28, 1], [0.017, 0.24, -0.6], [0.023, 0.22, 0.7], [0.031, 0.18, -0.2], [0.041, 0.14, 0.4]];
  for (const [t, g, side] of er) {
    const d = Math.round(t * SR) + preN;
    const gl = g * (side <= 0 ? 1 : 0.55);
    const gr = g * (side >= 0 ? 1 : 0.55);
    for (let i = d; i < N; i++) {
      out.L[i] += inL[i - d] * gl * 0.6 + inR[i - d] * gl * 0.4;
      out.R[i] += inR[i - d] * gr * 0.6 + inL[i - d] * gr * 0.4;
    }
  }
  const x = new Float64Array(8);
  for (let n = 0; n < N; n++) {
    const src = n - preN;
    const l = src >= 0 ? inL[src] : 0;
    const r = src >= 0 ? inR[src] : 0;
    let sum = 0;
    for (let k = 0; k < 8; k++) {
      const line = lines[k];
      let v = line.buf[line.i];
      line.lp = v * (1 - dampA) + line.lp * dampA;
      x[k] = line.lp * line.g;
      sum += x[k];
    }
    const h = (2 / 8) * sum;
    let ol = 0;
    let or = 0;
    for (let k = 0; k < 8; k++) {
      const y = x[k] - h;
      const line = lines[k];
      line.buf[line.i] = y + (k % 2 === 0 ? l : r) * 0.35;
      line.i = (line.i + 1) % line.d;
      if (k % 2 === 0) ol += y * (k % 4 === 0 ? 1 : -1);
      else or += y * (k % 4 === 1 ? 1 : -1);
    }
    out.L[n] += ol * 0.5;
    out.R[n] += or * 0.5;
  }
  return out;
}

// ---------------------------------------------------------------- dynamics

/** A gentle stereo-linked compressor (RMS detector), in place. */
export function compress(bus, { threshold = -18, ratio = 2, attack = 0.02, release = 0.25, makeup = 0 } = {}) {
  const aA = Math.exp(-1 / (attack * SR));
  const aR = Math.exp(-1 / (release * SR));
  const rmsA = Math.exp(-1 / (0.01 * SR));
  let env = 0;
  let gainDb = 0;
  const mk = dbGain(makeup);
  for (let i = 0; i < bus.length; i++) {
    const p = (bus.L[i] * bus.L[i] + bus.R[i] * bus.R[i]) / 2;
    env = rmsA * env + (1 - rmsA) * p;
    const lev = 10 * Math.log10(env + 1e-12);
    const over = lev - threshold;
    const target = over > 0 ? -over * (1 - 1 / ratio) : 0;
    gainDb = target < gainDb ? aA * gainDb + (1 - aA) * target : aR * gainDb + (1 - aR) * target;
    const g = dbGain(gainDb) * mk;
    bus.L[i] *= g;
    bus.R[i] *= g;
  }
}

/** The peak over 4x oversampling (an estimate of the true peak), per channel arrays. */
export function truePeak(L, R) {
  // 4x polyphase windowed-sinc interpolation, 12 taps a side
  const taps = 12;
  const phases = [0.25, 0.5, 0.75].map(f => {
    const c = [];
    for (let k = -taps + 1; k <= taps; k++) {
      const t = k - f;
      const s = Math.sin(Math.PI * t) / (Math.PI * t);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * t) / taps);
      c.push(s * w);
    }
    return c;
  });
  let p = 0;
  for (const x of [L, R]) {
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]);
      if (a > p) p = a;
    }
    for (let i = taps; i < x.length - taps; i++) {
      if (Math.abs(x[i]) < p * 0.7) continue; // only near the peaks
      for (const c of phases) {
        let s = 0;
        for (let k = 0; k < c.length; k++) s += x[i + k - taps + 1] * c[k];
        // c's tap k sits at offset (k - taps + 1) - f from the point between i and i+1
        const a = Math.abs(s);
        if (a > p) p = a;
      }
    }
  }
  return p;
}

/**
 * A lookahead brickwall limiter on the 4x-oversampled peak, stereo-linked, in place: the gain never lets a sample (or the points
 * between samples) pass `ceiling` (linear). Attack is the lookahead (ms), release in seconds.
 */
export function limit(bus, ceiling, { lookahead = 3, release = 0.12 } = {}) {
  const N = bus.length;
  const la = Math.round((lookahead / 1000) * SR);
  // the needed gain at each sample, from the local true-ish peak (max of sample and midpoint interpolations)
  const need = new Float32Array(N);
  const L = bus.L;
  const R = bus.R;
  for (let i = 0; i < N; i++) {
    let a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (i > 1 && i < N - 2) {
      // cubic midpoint estimate of the inter-sample peaks
      const ml = (-L[i - 1] + 9 * L[i] + 9 * L[i + 1] - L[i + 2]) / 16;
      const mr = (-R[i - 1] + 9 * R[i] + 9 * R[i + 1] - R[i + 2]) / 16;
      a = Math.max(a, Math.abs(ml), Math.abs(mr));
    }
    need[i] = a > ceiling ? ceiling / a : 1;
  }
  // minimum over the window ahead, then smooth with an attack ramp and a release
  const gmin = new Float32Array(N);
  // sliding minimum (deque)
  const dq = new Int32Array(N);
  let h = 0;
  let t = 0;
  for (let i = N - 1; i >= 0; i--) {
    while (t > h && need[dq[t - 1]] >= need[i]) t--;
    dq[t++] = i;
    while (dq[h] > i + la) h++;
    gmin[i] = need[dq[h]];
  }
  // the window minimum averaged over the lookahead behind: a smooth ramp that still meets every peak (each average is of values
  // at or under the need at i), then a slow release upwards
  const rel = Math.exp(-1 / (release * SR));
  let g = 1;
  let acc = 0;
  for (let i = 0; i < N; i++) {
    acc += gmin[i];
    if (i >= la) acc -= gmin[i - la];
    const avg = i >= la - 1 ? acc / la : Math.min(1, (acc + (la - 1 - i)) / la);
    const target = Math.min(avg, need[i]);
    g = target < g ? target : rel * g + (1 - rel) * target;
    L[i] *= g;
    R[i] *= g;
  }
}

// ---------------------------------------------------------------- loudness (ITU-R BS.1770-4)

function kWeight(x) {
  const y = Float32Array.from(x);
  // the standard's two stages, at 44.1 kHz (shelf +4 dB at ~1.7 kHz, then the RLB highpass)
  filt(y, biquad('highshelf', 1681.97, 0.7071752, 3.99984385));
  filt(y, biquad('hp', 38.13547, 0.5003270));
  return y;
}
/** Integrated loudness (LUFS) of a stereo pair. */
export function lufs(L, R) {
  const kl = kWeight(L);
  const kr = kWeight(R);
  const block = Math.round(0.4 * SR);
  const hop = Math.round(0.1 * SR);
  const ms = [];
  for (let s = 0; s + block <= kl.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + block; i++) e += kl[i] * kl[i] + kr[i] * kr[i];
    ms.push(e / block);
  }
  const lk = z => -0.691 + 10 * Math.log10(z + 1e-15);
  const abs = ms.filter(z => lk(z) > -70);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const rel = lk(mean(abs)) - 10;
  const gated = abs.filter(z => lk(z) > rel);
  return lk(mean(gated));
}

// ---------------------------------------------------------------- files

/** Writes a 32-bit float stereo WAV. */
export function writeWav(file, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // float
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 8, 28);
  buf.writeUInt16LE(8, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 8, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    buf.writeFloatLE(L[i], o);
    buf.writeFloatLE(R[i], o + 4);
    o += 8;
  }
  writeFileSync(file, buf);
}
