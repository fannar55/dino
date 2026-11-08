// The song's own instruments, each a function that returns one mono note (Float32Array) at SR.
import { SR } from './io.mjs';
import { rng, Saw, Pulse, SVF, Biquad, TAU } from './dsp.mjs';

const N = s => Math.max(1, Math.round(s * SR));
const noiseOf = (n, seed) => {
  const r = rng(seed);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = r() * 2 - 1;
  return y;
};

// ---------------- drums ----------------
/** House kick: a pitch-swept sine, a second-harmonic knock for small speakers, a soft filtered click. `tone` 0..1 mutes the top. */
export function kick({ vel = 1, tone = 1, seed = 1 } = {}) {
  const n = N(0.46);
  const y = new Float32Array(n);
  const click = new Biquad('bp', 2600, 0.7).run(noiseOf(N(0.008), seed));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 49 + 125 * Math.exp(-t / 0.018) + 22 * Math.exp(-t / 0.09);
    ph += (TAU * f) / SR;
    const tail = t > 0.36 ? Math.max(0, 1 - (t - 0.36) / 0.1) : 1;
    const amp = Math.min(1, t / 0.002) * Math.exp(-t / 0.17) * tail;
    let v = Math.sin(ph) * amp;
    v += Math.sin(2 * ph + 0.4) * Math.exp(-t / 0.055) * 0.32 * tone; // knock (~100-300 Hz)
    if (i < click.length) v += click[i] * (1 - i / click.length) * 0.5 * tone;
    y[i] = (Math.tanh(1.6 * v) / Math.tanh(1.6)) * vel;
  }
  return y;
}

/** Clap: three quick noise bursts and a short room tail, band-passed around 1.2 kHz. */
export function clap({ vel = 1, seed = 2 } = {}) {
  const n = N(0.32);
  const x = noiseOf(n, seed);
  const bp = new Biquad('bp', 1250, 0.9);
  const hp = new Biquad('hp', 450, 0.7);
  const y = new Float32Array(n);
  const bursts = [0, 0.0095, 0.019];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let e = 0;
    for (const b of bursts) if (t >= b) e = Math.max(e, Math.exp(-(t - b) / 0.0035));
    if (t >= 0.026) e = Math.max(e, 0.75 * Math.exp(-(t - 0.026) / 0.075));
    y[i] = hp.tick(bp.tick(x[i])) * e * vel * 2.2;
  }
  return y;
}

const HAT_F = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0].map(f => f * 1.55);
/** 808-style metal hat: six square waves, band-passed high. `open` lengthens it. */
export function hat({ vel = 1, open = false, seed = 3 } = {}) {
  const n = N(open ? 0.5 : 0.11);
  const osc = HAT_F.map((f, k) => new Pulse((k * 0.173) % 1));
  const nz = noiseOf(n, seed);
  const bp = new Biquad('bp', 9500, 0.9);
  const hp1 = new Biquad('hp', 7000, 0.7);
  const hp2 = new Biquad('hp', 7000, 0.7);
  const y = new Float32Array(n);
  const tau = open ? 0.15 : 0.022;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (let k = 0; k < 6; k++) s += osc[k].next(HAT_F[k]);
    s = s / 6 + nz[i] * 0.25;
    const e = Math.min(1, t / 0.0008) * Math.exp(-t / tau) * (open && t > 0.4 ? 1 - (t - 0.4) / 0.1 : 1);
    y[i] = hp2.tick(hp1.tick(bp.tick(s))) * e * vel * 1.6;
  }
  return y;
}

/** Shaker: a soft swell of high noise. */
export function shaker({ vel = 1, seed = 4 } = {}) {
  const n = N(0.09);
  const x = noiseOf(n, seed);
  const bp = new Biquad('bp', 6800, 1.2);
  const hp = new Biquad('hp', 4500, 0.7);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / 0.028);
    y[i] = hp.tick(bp.tick(x[i])) * e * vel * 1.4;
  }
  return y;
}

/** Tuned conga / tom: a sine that drops onto its pitch, with a slap of noise. */
export function drumTone(f, { vel = 1, decay = 0.17, slap = 0.25, bend = 0.45, seed = 5 } = {}) {
  const n = N(decay * 4.5);
  const nz = new Biquad('bp', 2200, 0.8).run(noiseOf(N(0.02), seed));
  const y = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fr = f * (1 + bend * Math.exp(-t / 0.012));
    ph += (TAU * fr) / SR;
    let v = Math.sin(ph) + 0.18 * Math.sin(2 * ph) * Math.exp(-t / 0.04);
    v *= Math.min(1, t / 0.001) * Math.exp(-t / decay);
    if (i < nz.length) v += nz[i] * (1 - i / nz.length) * slap;
    y[i] = Math.tanh(1.3 * v) * vel;
  }
  return y;
}

/** 808-style cowbell on two tones (a fifth). */
export function cowbell({ vel = 1, f1 = 587.33, f2 = 880 } = {}) {
  const n = N(0.35);
  const a = new Pulse(0), b = new Pulse(0.3);
  const bp = new Biquad('bp', 2400, 1.1);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const s = a.next(f1) * 0.6 + b.next(f2) * 0.4;
    const e = 0.7 * Math.exp(-t / 0.012) + 0.3 * Math.exp(-t / 0.09);
    y[i] = bp.tick(s) * e * vel * 2.2;
  }
  return y;
}

/** Snare for the roll: a short body tone and a brush of noise. */
export function snare({ vel = 1, seed = 6 } = {}) {
  const n = N(0.22);
  const x = noiseOf(n, seed);
  const hp = new Biquad('hp', 1800, 0.7);
  const bp = new Biquad('bp', 4200, 0.6);
  const y = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (190 + 60 * Math.exp(-t / 0.01))) / SR;
    const body = Math.sin(ph) * Math.exp(-t / 0.045) * 0.5;
    const nz = bp.tick(hp.tick(x[i])) * Math.exp(-t / 0.07) * 1.3;
    y[i] = (body + nz) * Math.min(1, t / 0.0015) * vel;
  }
  return y;
}

/** A soft cymbal wash: either a gentle crash (decaying, slow 30 ms onset) or a reverse swell that ends at its last sample. */
export function cymbal({ vel = 1, seconds = 2, reverse = false, seed = 8 } = {}) {
  const n = N(seconds);
  const x = noiseOf(n, seed);
  const osc = HAT_F.map(() => new Pulse(0));
  const hp = new Biquad('hp', 5200, 0.6);
  const bp = new Biquad('peak', 8800, 1.2, 5);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let m = 0;
    for (let k = 0; k < 6; k++) m += osc[k].next(HAT_F[k] * 1.13);
    const s = hp.tick(bp.tick(x[i] * 0.7 + (m / 6) * 0.5));
    let e;
    if (reverse) {
      const u = t / seconds;
      e = u ** 2.4 * (u > 0.985 ? (1 - u) / 0.015 : 1);
    } else e = Math.min(1, t / 0.03) * Math.exp(-t / (seconds * 0.32));
    y[i] = s * e * vel;
  }
  return y;
}

/** Riser: noise through a resonant band-pass sweeping up, swelling to its end. */
export function riser({ vel = 1, seconds = 7.68, from = 300, to = 7000, seed = 9 } = {}) {
  const n = N(seconds);
  const x = noiseOf(n, seed);
  const f = new SVF();
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (i % 32 === 0) f.set(from * (to / from) ** u, 3.5);
    f.tick(x[i]);
    const e = u ** 1.8 * (u > 0.97 ? (1 - u) / 0.03 : 1);
    y[i] = f.bp * e * vel;
  }
  return y;
}

// ---------------- bass ----------------
/** Disco bass: two detuned saws and a sine sub through an enveloped low-pass, driven for mid-range harmonics (tablets). */
export function bass(f, seconds, { vel = 1, bright = 1, glideFrom = 0 } = {}) {
  const rel = 0.05;
  const n = N(seconds + rel + 0.005);
  const a = new Saw(0.1), b = new Saw(0.6);
  let ph = 0;
  const flt = new SVF();
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fr = glideFrom ? f * (glideFrom / f) ** Math.exp(-t / 0.03) : f;
    ph += (TAU * fr) / SR;
    if (i % 16 === 0) flt.set(Math.min(9000, (170 + 2300 * bright * vel * Math.exp(-t / 0.085) + 420 * bright) * (fr / 98) ** 0.5), 1.3);
    const s = a.next(fr * 1.004) * 0.5 + b.next(fr * 0.996) * 0.5;
    const lp = flt.tick(s);
    let v = lp * 1.0 + Math.sin(ph) * 0.55;
    const att = Math.min(1, t / 0.003);
    const env = att * (0.78 + 0.22 * Math.exp(-t / 0.12)) * (t > seconds ? Math.exp(-(t - seconds) / (rel / 4)) : 1);
    v = Math.tanh(2.0 * v * env) * 0.62;
    y[i] = v * vel;
  }
  return y;
}

// ---------------- harmony ----------------
/**
 * String-machine voice: five detuned saws (unfiltered, the pad bus filters them), stereo spread. Returns { L, R }.
 */
export function stringVoice(f, seconds, { attack = 0.08, release = 0.35, vel = 1, seed = 10 } = {}) {
  const n = N(seconds + release * 3);
  const r = rng(seed);
  const det = [-15, -7, 0, 7, 15];
  const oscs = det.map(() => new Saw(r()));
  const pans = [-0.8, -0.35, 0, 0.35, 0.8];
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let e = Math.min(1, t / attack);
    e = e * e * (3 - 2 * e);
    if (t > seconds) e *= Math.exp(-(t - seconds) / release);
    let l = 0, rr = 0;
    for (let k = 0; k < 5; k++) {
      const v = oscs[k].next(f * 2 ** (det[k] / 1200));
      const p = (pans[k] + 1) / 2;
      l += v * (1 - p);
      rr += v * p;
    }
    L[i] = l * e * vel * 0.22;
    R[i] = rr * e * vel * 0.22;
  }
  return { L, R };
}

/** FM electric piano (Rhodes-like): bell-ish tine on attack, warm body after. */
export function epiano(f, seconds, { vel = 1 } = {}) {
  const rel = 0.12;
  const n = N(seconds + rel * 4);
  const y = new Float32Array(n);
  let pc = 0, pm = 0, pt = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    pm += (TAU * f) / SR;
    pc += (TAU * f) / SR;
    pt += (TAU * f * 7.02) / SR;
    const idx = (1.6 * vel + 0.4) * Math.exp(-t / 0.22) + 0.35;
    let v = Math.sin(pc + idx * Math.sin(pm));
    v += Math.sin(pt) * 0.12 * vel * Math.exp(-t / 0.02);
    let e = Math.min(1, t / 0.002) * (0.55 * Math.exp(-t / 0.35) + 0.45 * Math.exp(-t / 2.2));
    if (t > seconds) e *= Math.exp(-(t - seconds) / rel);
    y[i] = v * e * vel;
  }
  return y;
}

// ---------------- leads ----------------
/** FM bell (fireflies): a 1:4 pair with a falling index and a touch of inharmonic shimmer. */
export function bell(f, { vel = 1, decay = 0.5, bright = 1 } = {}) {
  const n = N(decay * 5);
  const y = new Float32Array(n);
  let pc = 0, pm = 0, ps = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    pc += (TAU * f) / SR;
    pm += (TAU * f * 4) / SR;
    ps += (TAU * f * 2.756) / SR;
    const idx = 1.6 * bright * Math.exp(-t / 0.06);
    let v = Math.sin(pc + idx * Math.sin(pm));
    v += Math.sin(ps) * 0.18 * Math.exp(-t / (decay * 0.3));
    y[i] = v * Math.min(1, t / 0.0015) * Math.exp(-t / decay) * vel;
  }
  return y;
}

const VOWELS = {
  u: [320, 800, 2300],
  o: [480, 880, 2500],
  a: [760, 1200, 2600],
  e: [520, 1850, 2600],
  i: [300, 2300, 3100],
};
/**
 * The robot (talk-box) voice: detuned saws and a pulse through three formant band-passes that move from one vowel to another,
 * with a scoop into the note and a late vibrato. `vowels` = [from, to].
 */
export function robot(f, seconds, { vel = 1, vowels = ['u', 'a'], morph = 0.12, scoop = 45, vib = 18, rel = 0.09, glideFrom = 0 } = {}) {
  const n = N(seconds + rel * 4);
  const s1 = new Saw(0), s2 = new Saw(0.5), p = new Pulse(0.25);
  const fs = [new SVF(), new SVF(), new SVF()];
  const air = new Biquad('hp', 3200, 0.7);
  const A = VOWELS[vowels[0]], B = VOWELS[vowels[1]];
  const gains = [1, 0.7, 0.35];
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let cents = -scoop * Math.exp(-t / 0.035);
    if (t > 0.16) cents += vib * Math.sin(TAU * 5.6 * (t - 0.16)) * Math.min(1, (t - 0.16) / 0.2);
    let fr = f * 2 ** (cents / 1200);
    if (glideFrom) fr *= (glideFrom / f) ** Math.exp(-t / 0.05);
    const src = s1.next(fr * 1.003) * 0.4 + s2.next(fr * 0.997) * 0.4 + p.next(fr, 0.3) * 0.3;
    const u = Math.min(1, t / morph);
    const m = u * u * (3 - 2 * u);
    if (i % 8 === 0) for (let k = 0; k < 3; k++) {
      const fc = (A[k] + (B[k] - A[k]) * m) * 1.12;
      fs[k].set(fc, fc / [90, 110, 160][k]);
    }
    let v = 0;
    for (let k = 0; k < 3; k++) {
      fs[k].tick(src);
      v += fs[k].bp * fs[k].k * gains[k]; // unity-peak band-pass: each formant lifts its harmonics, never past 1
    }
    v = v * 2.2 + air.tick(src) * 0.05;
    let e = Math.min(1, t / 0.012);
    if (t > seconds) e *= Math.exp(-(t - seconds) / rel);
    y[i] = Math.tanh(v * 1.4) * e * vel * 0.8;
  }
  return y;
}
