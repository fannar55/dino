// Turntable sounds, all modelled in code: the record's crackle (it is on the record, so it moves with every move of the decks),
// the needle's drop and lift, scratch strokes over any short sound (her "Djamm!", the animals' calls), and two new animals:
// the beetles (bjöllur, clicking along) and the dragonflies (drekaflugur, whose wing buzz swoops like a scratch).
import { SR } from './io.mjs';
import { rng, Biquad, OnePole, SVF, TAU, mtof, Pulse, Saw } from './dsp.mjs';
import { SPB } from './score.mjs';
import { readAt } from './deck.mjs';

const N = s => Math.max(1, Math.round(s * SR));

// ---------------------------------------------------------------- crackle on the record
/**
 * Crackle for the whole record (source time), stereo. The record turns once a bar (4 beats = 1.92 s, about 31 rpm), so its
 * dust pops come back once a turn: the pattern repeats every bar, which keeps any loop seamless. Plus a soft hiss.
 */
export function recordCrackle(n, { seed = 77, pops = 9, hiss = 0.006 } = {}) {
  const L = new Float32Array(n), R = new Float32Array(n);
  const turn = 4 * SPB;
  const r = rng(seed);
  const pattern = [];
  for (let k = 0; k < pops; k++) pattern.push({ at: Math.floor(r() * turn), amp: 0.25 + 0.75 * r() ** 2, pan: r() * 2 - 1, len: 8 + Math.floor(r() * 40), sign: r() < 0.5 ? -1 : 1 });
  // one pop: a bipolar spike ringing briefly through a 3 kHz band
  const shapes = pattern.map(p => {
    const y = new Float32Array(p.len + 120);
    const bp = new Biquad('bp', 2400 + 2600 * r(), 1.1);
    for (let i = 0; i < y.length; i++) {
      const x = i < p.len ? (i === 0 ? p.sign : -p.sign * 0.6 * Math.exp(-i / 6)) : 0;
      y[i] = bp.tick(x) * p.amp;
    }
    return y;
  });
  for (let t0 = 0; t0 < n; t0 += turn)
    pattern.forEach((p, k) => {
      const y = shapes[k];
      const gl = Math.cos(((p.pan + 1) / 4) * Math.PI), gr = Math.sin(((p.pan + 1) / 4) * Math.PI);
      for (let i = 0; i < y.length; i++) {
        const j = t0 + p.at + i;
        if (j >= n) break;
        L[j] += y[i] * gl * 0.5;
        R[j] += y[i] * gr * 0.5;
      }
    });
  // hiss, also periodic with the turn
  const hz = new Float32Array(turn);
  const rn = rng(seed + 1);
  const hp = new Biquad('hp', 3500, 0.7), lp = new OnePole(9000);
  for (let i = 0; i < turn; i++) hz[i] = lp.tick(hp.tick(rn() * 2 - 1));
  for (let i = 0; i < n; i++) {
    L[i] += hz[i % turn] * hiss;
    R[i] += hz[(i + (turn >> 1)) % turn] * hiss;
  }
  return { L, R, n };
}

/** The needle dropping onto the record: a soft thump, a scrape and a few pops (mono). */
export function needleDrop({ seed = 5 } = {}) {
  const n = N(0.35);
  const y = new Float32Array(n);
  const r = rng(seed);
  const bp = new Biquad('bp', 1800, 0.8);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (70 + 50 * Math.exp(-t / 0.01))) / SR;
    const thump = Math.sin(ph) * Math.exp(-t / 0.04) * 0.8;
    const scrape = bp.tick(r() * 2 - 1) * Math.exp(-t / 0.05) * 0.35;
    y[i] = (thump + scrape) * Math.min(1, t / 0.0015);
  }
  for (const [at, a] of [[0.004, 0.6], [0.06, 0.3], [0.13, 0.25], [0.21, 0.2]]) {
    const j = Math.round(at * SR);
    for (let k = 0; k < 30; k++) y[j + k] += (k === 0 ? a : -a * 0.6 * Math.exp(-k / 5));
  }
  return y;
}

/** The needle lifting off at the end: a small click and a short scrape. */
export function needleLift({ seed = 6 } = {}) {
  const n = N(0.18);
  const y = new Float32Array(n);
  const r = rng(seed);
  const bp = new Biquad('bp', 2600, 1);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y[i] = bp.tick(r() * 2 - 1) * Math.exp(-t / 0.03) * 0.35 * Math.min(1, t / 0.002);
  }
  for (let k = 0; k < 40; k++) y[k + 20] += k === 0 ? 0.4 : -0.25 * Math.exp(-k / 6);
  return y;
}

// ---------------------------------------------------------------- scratches
/**
 * Scratch strokes over a short sound `x` (mono) at its own rate. A stroke moves the record from p0 to p1 (seconds in x) over
 * [t0, t1] (beats, relative to the pattern start) along a half-cosine (the hand speeds up and slows down); the crossfader gate
 * `fader(u)` (0..1) opens and closes it. The stylus level follows the record's speed (slow is quiet), a low-pass follows it
 * too (slow is dark), and the record's own crackle speeds up and slows down with the hand.
 * Returns { y, at0 } with y starting at the earliest stroke.
 */
export function scratch(x, strokes, { seed = 9, crackle = 0.015, levelPow = 0.6, maxLevel = 1.25 } = {}) {
  const t0 = Math.min(...strokes.map(s => s.t0)), t1 = Math.max(...strokes.map(s => s.t1));
  const a0 = Math.round(t0 * SPB);
  const n = Math.round(t1 * SPB) - a0 + N(0.02);
  const y = new Float32Array(n);
  const r = rng(seed);
  const lp = new OnePole(8000);
  let lastLp = 8000;
  for (const s of strokes) {
    const a = Math.round(s.t0 * SPB) - a0, b = Math.round(s.t1 * SPB) - a0, len = b - a;
    const P0 = s.p0 * SR, P1 = s.p1 * SR;
    const shape = s.shape ?? 'cos';
    for (let i = 0; i < len; i++) {
      const u = i / len;
      let p, v;
      if (shape === 'cos') {
        p = P0 + (P1 - P0) * (1 - Math.cos(Math.PI * u)) / 2;
        v = ((P1 - P0) * (Math.PI / 2) * Math.sin(Math.PI * u)) / len;
      } else if (shape === 'lin') {
        p = P0 + (P1 - P0) * u;
        v = (P1 - P0) / len;
      } else if (shape === 'scribble') {
        // a tense hand: small fast wobbles on a slow drag
        const w = Math.sin(TAU * (s.hz ?? 22) * (i / SR));
        p = P0 + (P1 - P0) * u + w * 0.012 * SR;
        v = (P1 - P0) / len + (0.012 * SR * TAU * (s.hz ?? 22) * Math.cos(TAU * (s.hz ?? 22) * (i / SR))) / SR;
      }
      const sp = Math.abs(v);
      const f = s.fader ? s.fader(u) : 1;
      if (f <= 0 || sp < 0.01) {
        continue;
      }
      const lev = Math.min(maxLevel, sp ** levelPow) * f * (s.gain ?? 1);
      const fc = 900 + 9000 * Math.min(1, sp);
      if (Math.abs(fc - lastLp) > 50) {
        lp.set(fc);
        lastLp = fc;
      }
      let val = readAt(x, p, v) * lev;
      if (crackle && r() < 0.0009 * sp) val += (r() < 0.5 ? -1 : 1) * crackle * (0.5 + r());
      y[a + i] += lp.tick(val);
    }
  }
  return { y, at0: a0 };
}

// fader gates (u = 0..1 over a stroke); 1 ms-ish ramps are added by the edge widths
const ramp = (u, a, b) => Math.max(0, Math.min(1, (u - a) / (b - a)));
export const FADER = {
  open: () => 1,
  chirpOut: u => 1 - ramp(u, 0.55, 0.62), // forward: closes before the end
  chirpIn: u => ramp(u, 0.38, 0.45), // back: opens after the start
  flare: u => (Math.abs(u - 0.5) < 0.06 ? 0 : 1), // one click off in the middle
  flare2: u => (Math.abs(u - 0.33) < 0.05 || Math.abs(u - 0.66) < 0.05 ? 0 : 1),
  transformer: k => u => ((u * k) % 1 < 0.55 ? 1 : 0),
};

/** Stroke helpers in beats from a pattern start: forward then back over `len` beats from `at`. */
export function baby(at, len, p0, p1, gain = 1) {
  return [
    { t0: at, t1: at + len / 2, p0, p1, gain },
    { t0: at + len / 2, t1: at + len, p0: p1, p1: p0, gain: gain * 0.85 },
  ];
}
export function chirp(at, len, p0, p1, gain = 1) {
  return [
    { t0: at, t1: at + len / 2, p0, p1, fader: FADER.chirpOut, gain },
    { t0: at + len / 2, t1: at + len, p0: p1, p1: p0, fader: FADER.chirpIn, gain: gain * 0.85 },
  ];
}
export function transformer(at, len, p0, p1, cuts = 4, gain = 1) {
  return [
    { t0: at, t1: at + len / 2, p0, p1, fader: FADER.transformer(cuts), gain, shape: 'lin' },
    { t0: at + len / 2, t1: at + len, p0: p1, p1: p0, fader: FADER.transformer(cuts), gain: gain * 0.85, shape: 'lin' },
  ];
}
export function flare(at, len, p0, p1, gain = 1) {
  return [
    { t0: at, t1: at + len / 2, p0, p1, fader: FADER.flare, gain },
    { t0: at + len / 2, t1: at + len, p0: p1, p1: p0, fader: FADER.flare, gain: gain * 0.85 },
  ];
}
/** Just the forward stroke ("stab"), the fader cutting it at its end. */
export function stab(at, len, p0, p1, gain = 1) {
  return [{ t0: at, t1: at + len, p0, p1, fader: FADER.chirpOut, gain }];
}

// ---------------------------------------------------------------- new animals
/** Beetle click (bjalla): a tiny hard tick through two shell resonances. `tone` 0..1 tilts it brighter. */
export function beetleClick({ vel = 1, tone = 0.5, seed = 3 } = {}) {
  const n = N(0.06);
  const r = rng(seed);
  const f1 = 2300 + 900 * tone, f2 = 4300 + 1400 * tone;
  const b1 = new Biquad('bp', f1, 9), b2 = new Biquad('bp', f2, 7);
  const hp = new Biquad('hp', 900, 0.7);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ex = i < 40 ? (r() * 2 - 1) * (1 - i / 40) : 0;
    const v = b1.tick(ex) * 6 + b2.tick(ex) * 4;
    y[i] = hp.tick(v) * Math.exp(-t / 0.012) * vel;
  }
  // a second, softer tick 9 ms on: a click beetle's "tik-ik"
  const j = Math.round(0.009 * SR);
  for (let i = n - 1 - j; i >= 0; i--) y[i + j] += y[i] * 0.35;
  let pk = 0;
  for (const v of y) pk = Math.max(pk, Math.abs(v));
  for (let i = 0; i < n; i++) y[i] *= vel / pk; // peak = vel
  return y;
}

/**
 * Dragonfly (drekafluga) buzz: a reedy tone fluttering at its wing beat (~32 Hz), that swoops into its note from `from`
 * semitones away (a scratch-like zip) and holds it. Its note is E (the flyers' la), here E5.
 */
export function dragonfly(seconds, { midi = 76, from = -7, swoop = 0.08, vel = 1, seed = 4 } = {}) {
  const n = N(seconds + 0.05);
  const y = new Float32Array(n);
  const r = rng(seed);
  const p = new Pulse(r()), s = new Saw(r());
  const bp = new SVF(), hp = new Biquad('hp', 300, 0.7);
  const f = mtof(midi);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const semi = from * (1 - Math.min(1, t / swoop)) ** 3; // lands exactly on its note after `swoop` s
    const fr = f * 2 ** (semi / 12);
    ph += (TAU * 32) / SR;
    const flutter = 0.55 + 0.45 * Math.sin(ph) ** 2;
    if (i % 16 === 0) bp.set(fr * 2.2, 2.2);
    const src = p.next(fr, 0.3) * 0.6 + s.next(fr * 1.004) * 0.4;
    bp.tick(src);
    const v = bp.bp * 1.3 + src * 0.25;
    const env = Math.min(1, t / 0.012) * (t > seconds ? Math.exp(-(t - seconds) / 0.012) : 1);
    y[i] = hp.tick(Math.tanh(v * 1.2)) * flutter * env * vel * 0.5;
  }
  return y;
}
