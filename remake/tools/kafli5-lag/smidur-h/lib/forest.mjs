// The forest's own instruments, all synthesized: feet on earth, hands, sticks, stones, hollow logs, water, leaves, mouths and
// the wind in hollow reeds. Each takes params and a seeded random source and returns a mono Float32Array (peak about 1), or
// [L, R] for the wide ones.
import { SR, secs, rng, biquad, white, adEnv, modal, resonate, softclip, normalize, fades, onepole, addInto } from './dsp.mjs';
const TAU = Math.PI * 2;

/** A foot stamping on packed earth by a pond (the kick): a low thump with a woody mid knock that tablets can hear. */
export function stomp({ size = 1, seed = 1, bright = 1 } = {}) {
  const r = rng(seed), n = secs(0.45);
  const x = new Float32Array(n);
  // body: falling sine
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = (52 + 75 * Math.exp(-t / 0.022)) / Math.sqrt(size);
    ph += (TAU * f) / SR;
    x[i] = Math.sin(ph) * Math.exp(-t / (0.085 * size)) * 0.55;
  }
  // thud of the sole: low noise
  const thud = adEnv(biquad(white(n, r), 'lp', 380, 0.8), 0.002, 0.035);
  addInto(x, thud, 0, 1.6);
  // the ground and the boards: mid modes for small speakers
  const knock = modal(n, [
    { f: 165 / size ** 0.3, a: 0.55, d: 0.1 }, { f: 245 + r() * 10, a: 0.45, d: 0.07 }, { f: 330 + r() * 20, a: 0.4, d: 0.05 }, { f: 610 + r() * 40, a: 0.2, d: 0.03 },
  ], { hard: 1.2 });
  addInto(x, knock, 0, 1.25 * bright);
  // a little grit of dirt
  const grit = adEnv(biquad(white(n, r), 'bp', 2500, 0.9), 0.001, 0.012);
  addInto(x, grit, 0, 0.08 * bright);
  softclip(x, 1.4);
  return fades(normalize(x, 1), 0.0005, 0.05);
}

/** Many hands clapping together: `hands` clappers spread in time and across the stereo field. [L, R]. */
export function clap({ hands = 3, seed = 1, tone = 1, tail = 0.07 } = {}) {
  const r = rng(seed), n = secs(0.35);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let h = 0; h < hands; h++) {
    const off = h === 0 ? 0 : secs(r() * 0.012);
    const fc = (1050 + r() * 650) * tone;
    const one = new Float32Array(n);
    // three quick slaps then the ring of the palms
    const taps = [0, secs(0.006 + r() * 0.004), secs(0.013 + r() * 0.005)];
    for (const [k, at] of taps.entries()) {
      const b = adEnv(white(secs(0.03), r), 0.0004, 0.0035 + k * 0.0005);
      addInto(one, b, at, 0.7 + 0.15 * k);
    }
    const ring = adEnv(white(n, r), 0.0005, tail * (0.8 + r() * 0.4), (taps[2] + 20) / SR);
    addInto(one, ring, 0, 0.55);
    biquad(one, 'bp', fc, 1.1);
    const body = adEnv(biquad(white(n, r), 'lp', 600, 0.7), 0.0005, 0.012, taps[2] / SR);
    addInto(one, body, 0, 0.6);
    const pan = hands === 1 ? 0 : (h / (hands - 1)) * 1.2 - 0.6 + (r() - 0.5) * 0.2;
    const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
    addInto(L, one, off, gl); addInto(R, one, off, gr);
  }
  const p = Math.max(...[L, R].map(a => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
  for (const a of [L, R]) { for (let i = 0; i < n; i++) a[i] /= p; fades(a, 0.0003, 0.04); }
  return [L, R];
}

/** A finger snap. */
export function snap({ seed = 1 } = {}) {
  const r = rng(seed), n = secs(0.12);
  const x = adEnv(biquad(white(n, r), 'bp', 2300 + r() * 400, 2.5), 0.0003, 0.018);
  const click = adEnv(biquad(white(n, r), 'hp', 4000, 0.7), 0.0001, 0.002);
  addInto(x, click, 0, 0.8);
  return fades(normalize(x), 0.0002, 0.02);
}

/** Hands on thighs (patsch): a soft fleshy slap with a low body. */
export function patsch({ seed = 1 } = {}) {
  const r = rng(seed), n = secs(0.18);
  const x = adEnv(biquad(white(n, r), 'lp', 1700, 0.7), 0.0005, 0.022);
  const body = modal(n, [{ f: 210 + r() * 20, a: 0.6, d: 0.045 }, { f: 480 + r() * 30, a: 0.3, d: 0.025 }], { hard: 1.5 });
  addInto(x, body, 0, 0.9);
  return fades(normalize(x), 0.0003, 0.03);
}

/** A thump on the chest. */
export function chest({ seed = 1 } = {}) {
  const r = rng(seed), n = secs(0.25);
  const x = modal(n, [{ f: 105, a: 1, d: 0.07 }, { f: 240, a: 0.4, d: 0.04 }, { f: 520, a: 0.15, d: 0.02 }], { hard: 2 });
  addInto(x, adEnv(biquad(white(n, r), 'lp', 900, 0.7), 0.001, 0.02), 0, 0.4);
  return fades(normalize(x), 0.0005, 0.04);
}

/** Two dry sticks knocked together. */
export function stick({ seed = 1, pitch = 1 } = {}) {
  const r = rng(seed), n = secs(0.09);
  const j = () => 1 + (r() - 0.5) * 0.04;
  const x = modal(n, [
    { f: 2380 * pitch * j(), a: 1, d: 0.022 }, { f: 3420 * pitch * j(), a: 0.6, d: 0.016 },
    { f: 5150 * pitch * j(), a: 0.35, d: 0.011 }, { f: 1290 * pitch * j(), a: 0.3, d: 0.02 },
  ], { hard: 0.08 });
  addInto(x, adEnv(white(secs(0.01), r), 0.0001, 0.0012), 0, 0.5);
  return fades(normalize(x), 0.0001, 0.015);
}

/** Two pond stones clacked together: brighter and drier than sticks, with a pebbly click. */
export function stones({ seed = 1, pitch = 1 } = {}) {
  const r = rng(seed), n = secs(0.07);
  const x = modal(n, [
    { f: 3100 * pitch, a: 1, d: 0.008 }, { f: 4720 * pitch, a: 0.8, d: 0.006 }, { f: 6900 * pitch, a: 0.5, d: 0.004 },
    { f: 1150 * pitch, a: 0.4, d: 0.012 },
  ], { hard: 0.05 });
  addInto(x, adEnv(biquad(white(secs(0.02), r), 'hp', 3000, 0.7), 0.0001, 0.0015), 0, 0.6);
  return fades(normalize(x), 0.0001, 0.01);
}

/**
 * A hollow log struck with a soft mallet: the forest's xylophone. Partials of a log bar with an air cavity that sustains the
 * fundamental. `f` is the note.
 */
export function logMarimba({ f, seed = 1, dur = 0.8, hard = 0.7 } = {}) {
  const r = rng(seed), n = secs(dur + 0.3);
  const lowK = Math.min(1, f / 300);
  const x = modal(n, [
    { f, a: 1, d: 0.42 + 0.25 * (1 - lowK) },
    { f: f * 2.0, a: 0.12, d: 0.15 },
    { f: f * 3.93, a: 0.28 * lowK + 0.1, d: 0.07 },
    { f: f * 9.2, a: 0.06, d: 0.02 },
  ], { hard });
  // the knock of wood on wood
  const knock = adEnv(biquad(white(secs(0.03), r), 'bp', Math.min(5000, f * 4), 1.2), 0.0002, 0.004);
  addInto(x, knock, 0, 0.25);
  // gentle release after dur
  const nr = secs(dur);
  for (let i = nr; i < n; i++) x[i] *= Math.exp(-(i - nr) / SR / 0.08);
  return fades(normalize(x), 0.0005, 0.02);
}

/**
 * A turtle-shell / hollow-log drum: a woody tom with a short pitch drop, tuned to `f`. Lower mode set than the marimba,
 * with the slap of a palm.
 */
export function shell({ f, seed = 1, dur = 0.5 } = {}) {
  const r = rng(seed), n = secs(dur);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, ff = f * (1 + 0.18 * Math.exp(-t / 0.015));
    ph += (TAU * ff) / SR;
    x[i] = Math.sin(ph) * Math.exp(-t / 0.16);
  }
  const ring = modal(n, [{ f: f * 1.58, a: 0.35, d: 0.08 }, { f: f * 2.37, a: 0.25, d: 0.05 }, { f: f * 3.6, a: 0.15, d: 0.03 }], { hard: 0.6 });
  addInto(x, ring, 0, 1);
  addInto(x, adEnv(biquad(white(n, r), 'bp', 1400, 0.9), 0.0003, 0.008), 0, 0.5);
  softclip(x, 1.2);
  return fades(normalize(x), 0.0004, 0.05);
}

/**
 * The bass: a big hollow log, struck and let ring, its fundamental held by the log's air. Harmonics 2-4 and a little
 * saturation put it in the mids, so a tablet can follow the line even without the low fundamental.
 */
export function logBass({ f, dur = 0.5, seed = 1, punch = 1 } = {}) {
  const r = rng(seed), n = secs(dur + 0.25);
  const x = new Float32Array(n);
  const nd = secs(dur);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ff = f * (1 + 0.05 * punch * Math.exp(-t / 0.03));
    ph += (TAU * ff) / SR;
    const a = Math.min(1, t / 0.004) * (0.55 + 0.45 * Math.exp(-t / 0.25)) * (i < nd ? 1 : Math.exp(-(i - nd) / SR / 0.06));
    const h2 = 0.55 * Math.exp(-t / 0.35), h3 = 0.28 * Math.exp(-t / 0.18), h4 = 0.14 * Math.exp(-t / 0.1);
    x[i] = a * (Math.sin(ph) + h2 * Math.sin(2 * ph + 0.3) + h3 * Math.sin(3 * ph + 0.7) + h4 * Math.sin(4 * ph + 1.1));
  }
  // the knock of the mallet on the log
  addInto(x, adEnv(biquad(white(secs(0.04), r), 'bp', 750, 1.0), 0.0003, 0.008), 0, 0.35 * punch);
  softclip(x, 1.8);
  biquad(x, 'lp', 2600, 0.7);
  return fades(normalize(x), 0.001, 0.03);
}

/** A water drop into the pond, tuned: a short rising "plip" that settles on `f`, with the tick of the surface. */
export function drop({ f, seed = 1, size = 1, dur = 0.22 } = {}) {
  const r = rng(seed), n = secs(dur + 0.05);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ff = f * (0.72 + 0.28 * (1 - Math.exp(-t / (0.008 * size))));
    ph += (TAU * ff) / SR;
    x[i] = Math.sin(ph) * Math.min(1, t / 0.0015) * Math.exp(-t / (0.05 + 0.04 * size));
  }
  addInto(x, adEnv(biquad(white(secs(0.01), r), 'hp', 2500, 0.7), 0.0001, 0.0012), 0, 0.15);
  return fades(normalize(x), 0.0002, 0.03);
}

/** A splash: a hand or a foot in the shallows. Soft onset (never a crack), bubbles after. */
export function splash({ seed = 1, size = 1 } = {}) {
  const r = rng(seed), n = secs(0.9 * size);
  const x = new Float32Array(n);
  const wash = adEnv(biquad(white(n, r), 'bp', 1800, 0.6), 0.012, 0.12 * size);
  addInto(x, wash, 0, 0.7);
  const low = adEnv(biquad(white(n, r), 'lp', 500, 0.8), 0.008, 0.06 * size);
  addInto(x, low, 0, 0.6);
  for (let k = 0; k < 18 * size; k++) {
    const d = drop({ f: 700 + r() * 2600, seed: Math.floor(r() * 1e9), size: 0.5 + r(), dur: 0.08 });
    addInto(x, d, secs(0.02 + r() * 0.5 * size), 0.12 + r() * 0.15);
  }
  return fades(normalize(x), 0.004, 0.08);
}

/** Leaves shaken in a hand: a grainy rustle, `dur` seconds. bright moves the band up. */
export function leaves({ seed = 1, dur = 0.08, bright = 1, attack = 0.002 } = {}) {
  const r = rng(seed), n = secs(dur + 0.03);
  const x = new Float32Array(n);
  // sparse crackles (each leaf) plus a little hiss
  for (let i = 0; i < n; i++) {
    if (r() < 0.12) x[i] = (r() * 2 - 1) * (0.5 + r());
    x[i] += (r() * 2 - 1) * 0.15;
  }
  biquad(x, 'hp', 2800 * bright, 0.7);
  biquad(x, 'peak', 6500 * bright, 1.2, 4);
  const na = secs(attack), nd = secs(dur);
  for (let i = 0; i < n; i++) {
    const e = i < na ? i / na : i < nd ? Math.exp(-(i - na) / SR / (dur * 0.45)) : Math.exp(-(nd - na) / SR / (dur * 0.45)) * Math.exp(-(i - nd) / SR / 0.01);
    x[i] *= e;
  }
  return fades(normalize(x), 0.0003, 0.02);
}
/** A long rustle that swells (wind through the trees, or a branch swept): rises over `dur`, then dies fast. */
export function rustle({ seed = 1, dur = 2, bright = 1 } = {}) {
  const r = rng(seed), n = secs(dur + 0.3);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { if (r() < 0.06) x[i] = (r() * 2 - 1) * (0.4 + r()); x[i] += (r() * 2 - 1) * 0.25; }
  biquad(x, 'hp', 1500 * bright, 0.7); biquad(x, 'lp', 9000, 0.7);
  const nd = secs(dur);
  for (let i = 0; i < n; i++) {
    const t = i / nd;
    x[i] *= i < nd ? t * t : Math.exp(-(i - nd) / SR / 0.06);
  }
  return fades(normalize(x), 0.01, 0.05);
}

// --- mouths -------------------------------------------------------------------------------------------------------------
/** Beatbox "b": a burst of the lips with a low thump. */
export function bbKick({ seed = 1 } = {}) {
  const r = rng(seed), n = secs(0.2);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += (TAU * (60 + 70 * Math.exp(-t / 0.015))) / SR; x[i] = Math.sin(ph) * Math.exp(-t / 0.06); }
  addInto(x, adEnv(biquad(white(n, r), 'lp', 1100, 0.8), 0.0005, 0.012), 0, 0.9);
  addInto(x, modal(n, [{ f: 190, a: 0.4, d: 0.03 }, { f: 420, a: 0.2, d: 0.02 }]), 0, 0.6);
  softclip(x, 1.5);
  return fades(normalize(x), 0.0003, 0.03);
}
/** Beatbox snare: a "pf-k" of breath and tongue. */
export function bbSnare({ seed = 1 } = {}) {
  const r = rng(seed), n = secs(0.2);
  const x = adEnv(biquad(white(n, r), 'bp', 1900, 0.7), 0.001, 0.035);
  const k = adEnv(biquad(white(n, r), 'bp', 4200, 1.5), 0.0005, 0.02);
  addInto(x, k, 0, 0.6);
  addInto(x, modal(n, [{ f: 260, a: 0.4, d: 0.02 }]), 0, 0.4);
  return fades(normalize(x), 0.0005, 0.04);
}
/** Beatbox "ts" (hat): closed or open. */
export function bbHat({ seed = 1, open = false } = {}) {
  const r = rng(seed), n = secs(open ? 0.2 : 0.07);
  const x = adEnv(white(n, r), 0.002, open ? 0.06 : 0.016);
  biquad(x, 'hp', 5200, 0.7); biquad(x, 'peak', 8200, 2, 6);
  return fades(normalize(x), 0.0005, 0.02);
}
/** A cheek pop tuned to `f`: a hollow "plok" whose pitch drops onto the note. */
export function lipPop({ f, seed = 1 } = {}) {
  const r = rng(seed), n = secs(0.18);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, ff = f * (1 + 0.5 * Math.exp(-t / 0.008));
    ph += (TAU * ff) / SR;
    x[i] = Math.sin(ph) * Math.min(1, t / 0.001) * Math.exp(-t / 0.035) + (0.25 * Math.sin(2 * ph)) * Math.exp(-t / 0.015);
  }
  addInto(x, adEnv(biquad(white(secs(0.01), r), 'bp', 1500, 1), 0.0001, 0.002), 0, 0.3);
  return fades(normalize(x), 0.0002, 0.03);
}
/** A tongue click "tok". */
export function tongue({ f = 1700, seed = 1 } = {}) {
  const n = secs(0.05);
  const x = modal(n, [{ f, a: 1, d: 0.009 }, { f: f * 2.3, a: 0.3, d: 0.004 }], { hard: 0.1 });
  return fades(normalize(x), 0.0001, 0.01);
}

// --- wind -------------------------------------------------------------------------------------------------------------
/**
 * Wind in hollow reeds: one breathy pipe note at `f`, `dur` seconds, a slow swell, a chiff of air at the start, a little
 * vibrato that starts late. The pad is a few of these.
 */
export function reed({ f, dur = 2, seed = 1, attack = 0.25, release = 0.45, breath = 0.07, bright = 1 } = {}) {
  const r = rng(seed), n = secs(dur + release + 0.02);
  const x = new Float32Array(n);
  const nd = secs(dur);
  const vph = r() * TAU;
  let ph = r() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = 1 + 0.0028 * Math.min(1, Math.max(0, (t - 0.35) / 0.5)) * Math.sin(TAU * 4.6 * t + vph);
    ph += (TAU * f * vib) / SR;
    const env = (i < nd ? Math.min(1, (t / attack) ** 1.5) : Math.exp(-(i - nd) / SR / (release / 3))) * (0.92 + 0.08 * Math.sin(TAU * 0.7 * t + vph));
    x[i] = env * (Math.sin(ph) + 0.22 * bright * Math.sin(2 * ph + 0.4) + 0.1 * bright * Math.sin(3 * ph + 1.2) + 0.04 * bright * Math.sin(4 * ph));
  }
  // breath: noise around the 2nd harmonic, following the envelope
  const air = white(n, r);
  biquad(air, 'bp', Math.min(8000, f * 2), 2.5);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = i < nd ? Math.min(1, t / attack) : Math.exp(-(i - nd) / SR / (release / 3));
    x[i] += air[i] * env * breath * 6;
  }
  // chiff
  const ch = adEnv(biquad(white(secs(0.08), r), 'bp', Math.min(9000, f * 3), 1.5), 0.005, 0.02);
  addInto(x, ch, 0, 0.18 * bright);
  return fades(x, 0.004, 0.02);
}

/** A blade-of-grass whistle with a glide from f0 to f1 over `glide` s. */
export function whistle({ f0, f1 = f0, dur = 0.6, glide = 0.1, seed = 1, vib = 0.006 } = {}) {
  const r = rng(seed), n = secs(dur + 0.12);
  const x = new Float32Array(n);
  const nd = secs(dur);
  let ph = 0;
  const vph = r() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const g = Math.min(1, t / Math.max(0.001, glide));
    const sm = g * g * (3 - 2 * g);
    const f = f0 * (f1 / f0) ** sm * (1 + vib * Math.min(1, t / 0.25) * Math.sin(TAU * 5.5 * t + vph));
    ph += (TAU * f) / SR;
    const env = (i < nd ? Math.min(1, t / 0.03) : Math.exp(-(i - nd) / SR / 0.03));
    x[i] = env * (Math.sin(ph) + 0.08 * Math.sin(2 * ph) + 0.03 * Math.sin(3 * ph));
  }
  const air = biquad(white(n, r), 'bp', Math.min(9000, f1 * 1.0), 3);
  for (let i = 0; i < n; i++) x[i] += air[i] * 0.06 * (i < nd ? 1 : 0);
  return fades(normalize(x), 0.002, 0.03);
}

/** The pond itself: a quiet bed of lapping water and a breath of wind in the leaves, `dur` s, stereo. */
export function pond({ dur, seed = 1 } = {}) {
  const r = rng(seed), n = secs(dur);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const out of [L, R]) {
    const w = white(n, r);
    biquad(w, 'bp', 450, 0.6);
    onepole(w, 900);
    // slow lapping: amplitude waves
    const p1 = r() * TAU, p2 = r() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      out[i] = w[i] * (0.5 + 0.3 * Math.sin(TAU * 0.23 * t + p1) + 0.2 * Math.sin(TAU * 0.61 * t + p2));
    }
    const air = biquad(white(n, r), 'hp', 3500, 0.7);
    for (let i = 0; i < n; i++) out[i] += air[i] * 0.05;
    // a few tiny bubbles
    for (let k = 0; k < dur * 2.5; k++) {
      const d = drop({ f: 900 + r() * 1800, seed: Math.floor(r() * 1e9), size: 0.4, dur: 0.06 });
      addInto(out, d, Math.floor(r() * (n - d.length)), 0.06 + r() * 0.05);
    }
  }
  return [L, R];
}
