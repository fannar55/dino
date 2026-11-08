// smidur-c's folk band, every instrument synthesized here: a bowed fiddle (a waveguide string driven by a friction bow, with
// real vibrato and bow pressure), a tin whistle (a breathy sine with cuts, taps, rolls, slides and trills), plucked strings by
// tuned Karplus-Strong (guitar, harp, double bass), a bodhrán (a modal frame drum and its tipper), foot stomps, hand claps, a
// reed drone and an orchestral string section. Each returns a mono Float32Array that starts at its note's onset.
import { SR, TAU, rng, biquad, makeBiquad, yin, medianPitch } from './dsp.mjs';

const exp = Math.exp;

// ---------------------------------------------------------------- the fiddle: a waveguide bowed string
// Two delay lines (bow to bridge, bow to nut) meet at the bow; the bow's friction (a table of the velocity difference, steeper
// with less pressure) decides how much the string sticks or slips (Smith's / STK's bowed string), the bridge end reflects through
// a lossy lowpass, and the bridge's motion goes out through a violin body (a cascade of resonant sections).
const BODY = [
  [1.0, 1.5667, 0.3133, -0.5509, -0.3925],
  [1.0, -1.9537, 0.9542, -1.6357, 0.8697],
  [1.0, -1.6683, 0.8852, -1.7674, 0.8735],
  [1.0, -1.8585, 0.9653, -1.8498, 0.9516],
  [1.0, -1.9299, 0.9621, -1.9354, 0.9590],
  [1.0, -1.9800, 0.9888, -1.9867, 0.9923],
];
class FracDelay {
  constructor(max) { this.buf = new Float64Array(max + 4); this.n = this.buf.length; this.w = 0; this.d = 10; this.last = 0; }
  tick(x) {
    this.buf[this.w] = x;
    let r = this.w - this.d; while (r < 0) r += this.n;
    const i = Math.floor(r), f = r - i, j = (i + 1) % this.n;
    // linear interpolation reading `d` samples back
    this.last = this.buf[i] * (1 - f) + this.buf[j] * f;
    this.w = (this.w + 1) % this.n;
    return this.last;
  }
}
const calib = new Map();
/** The loop's extra delay (samples) at `f`, measured once: the model plays a steady note and its period is read. */
function fiddleOffset(f) {
  const key = Math.round(f * 100);
  if (calib.has(key)) return calib.get(key);
  let off = 4.0;
  for (let it = 0; it < 3; it++) {
    const y = fiddleRaw([{ t: 0, d: 0.7, f, v: 0.7 }], { offsets: off, vibCents: 0, noise: 0, seed: 1 });
    const p = medianPitch(y, Math.round(0.3 * SR), Math.round(0.65 * SR), f * 0.7, f * 1.4, 0.6);
    if (!(p.hz > 0)) break;
    // the period the model plays is (SR/f - off) + c; c = measured period - (SR/f - off)
    const c = SR / p.hz - (SR / f - off);
    off = c;
  }
  calib.set(key, off);
  return off;
}
function fiddleRaw(notes, { pressure = 0.55, vibCents = 16, vibRate = 5.7, beta = 0.127, seed = 1, noise = 0.012, offsets = null, brightness = 1 } = {}) {
  const r = rng(seed);
  const end = Math.max(...notes.map(n => n.t + n.d)) + 0.5;
  const len = Math.ceil(end * SR);
  const out = new Float32Array(len);
  const fmin = Math.min(...notes.map(n => n.f));
  const neck = new FracDelay(Math.ceil(SR / fmin) + 8), bridge = new FracDelay(Math.ceil(SR / fmin) + 8);
  const body = BODY.map(c => ({ c, x1: 0, x2: 0, y1: 0, y2: 0 }));
  const pole = 0.75 - 0.2 * 22050 / SR; let sf = 0;
  const offs = notes.map(n => (typeof offsets === 'number' ? offsets : fiddleOffset(n.f)));
  // per-sample control: which note, the bow's velocity and pressure, the vibrato
  let ni = -1, vel = 0, vibPh = r() * TAU, base = SR / notes[0].f - offs[0];
  const vibJ = 1 + (r() - 0.5) * 0.08;
  let bn = 0; // bow noise state
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    while (ni + 1 < notes.length && t >= notes[ni + 1].t) {
      ni++;
      const n = notes[ni];
      base = SR / n.f - offs[ni];
      if (!n.slur) vel *= 0.35; // a bow change: the bow slows as it turns
    }
    const n = notes[Math.max(0, ni)];
    const on = ni >= 0 && t < n.t + n.d;
    const amp = n.v ?? 0.7;
    const target = on ? 0.03 + 0.2 * amp : 0;
    const atk = n.spic ? 0.006 : 0.028;
    const k = on ? 1 - exp(-1 / (atk * SR)) : 1 - exp(-1 / (0.03 * SR));
    // spiccato: the bow bounces off, so the stroke is short whatever the note's length
    const spicOff = n.spic && t > n.t + Math.min(n.d, 0.11);
    vel += ((spicOff ? 0 : target) - vel) * k;
    const bowDown = vel > 0.002;
    // vibrato: a fiddler's, delayed into the note and growing
    const into = t - n.t;
    const vc = n.vib ?? vibCents;
    const vdepth = vc * Math.min(1, Math.max(0, (into - 0.14) / 0.25)) * (n.d > 0.3 ? 1 : 0.25);
    vibPh += TAU * vibRate * vibJ / SR;
    const cents = vdepth * Math.sin(vibPh);
    const L = base * 2 ** (-cents / 1200);
    bridge.d = L * beta; neck.d = L * (1 - beta);
    const bp = n.press ?? pressure;
    const slope = 5 - 4 * bp;
    // the string
    const bridgeOut = bridge.last; sf = (1 - pole) * 0.95 * bridgeOut + pole * sf;
    const bridgeRefl = -sf;
    const nutRefl = -neck.last;
    const stringVel = bridgeRefl + nutRefl;
    const bowV = vel * (1 + (bowDown ? noise * (r() - 0.5) : 0));
    const dv = bowV - stringVel;
    let nv = 0;
    if (bowDown) {
      let s = (dv + 0.001) * slope; s = Math.abs(s) + 0.75; let tab = s ** -4;
      if (tab > 1) tab = 1; if (tab < 0.01) tab = 0.01;
      nv = dv * tab;
    }
    neck.tick(bridgeRefl + nv);
    bridge.tick(nutRefl + nv);
    // the body
    let y = bridge.last;
    for (const s of body) {
      const [b0, b1, b2, a1, a2] = s.c;
      const o = b0 * y + b1 * s.x1 + b2 * s.x2 - a1 * s.y1 - a2 * s.y2;
      s.x2 = s.x1; s.x1 = y; s.y2 = s.y1; s.y1 = o; y = o;
    }
    // a breath of bow hair on the string
    bn = bn * 0.6 + (r() - 0.5) * 0.4;
    out[i] = 0.1248 * y + bn * vel * 0.02 * brightness;
  }
  return out;
}
/** A fiddle phrase: notes [{ t, d (s), f (Hz), v, slur, spic, vib (cents), press }] → mono, with its EQ. */
export function fiddle(notes, opts = {}) {
  const y = fiddleRaw(notes, opts);
  biquad(y, 'hp', opts.cello ? 60 : 170, 0.7);
  if (opts.cello) { biquad(y, 'peak', 220, 0.9, 4); biquad(y, 'lp', 3200, 0.7); }
  biquad(y, 'peak', 2800, 1.2, opts.cello ? -2 : 1.5);
  biquad(y, 'lp', opts.cello ? 4500 : 7200, 0.7);
  biquad(y, 'hs', 6000, 0.7, -6);
  return y;
}

// ---------------------------------------------------------------- the tin whistle
// A near-sine with a little second and third harmonic, its breath (noise tuned to the note, and a hiss), a tongued chiff at each
// attack, and the Irish ornaments: a cut (a flick to a note above), a tap (below), a roll (cut, note, tap, note), a slide up into
// the note, a trill.
export function whistle(notes, { seed = 1, breath = 0.07, vibCents = 9, level = 1, bright = 1 } = {}) {
  const r = rng(seed);
  const end = Math.max(...notes.map(n => n.t + n.d)) + 0.3;
  const len = Math.ceil(end * SR);
  const freq = new Float64Array(len), amp = new Float64Array(len), chiff = new Float32Array(len);
  for (let ni = 0; ni < notes.length; ni++) {
    const n = notes[ni];
    const i0 = Math.round(n.t * SR), i1 = Math.min(len, Math.round((n.t + n.d) * SR));
    const up = n.up ?? n.f * 2 ** (3 / 12), down = n.down ?? n.f * 2 ** (-2 / 12);
    const prevF = ni > 0 ? notes[ni - 1].f : n.f;
    const vib = n.vib ?? vibCents;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SR; let f = n.f;
      switch (n.orn) {
        case 'cut': if (t < 0.03) f = up; break;
        case 'tap': if (t > 0.05 && t < 0.075) f = down; break;
        case 'roll': if ((t > 0.07 && t < 0.095)) f = up; else if (t > 0.165 && t < 0.19) f = down; break;
        case 'slide': if (t < 0.07) f = n.f * 2 ** (-(1 - t / 0.07) * 2 / 12); break;
        case 'trill': if (t > 0.04 && t < n.d - 0.08 && Math.floor(t * 22) % 2 === 1) f = up; break;
        default: break;
      }
      const vd = vib * Math.min(1, Math.max(0, (t - 0.25) / 0.3));
      f *= 2 ** (vd * Math.sin(TAU * 5.2 * t + ni) / 1200);
      freq[i] = f;
      // tongued notes start with a short swell; slurred ones carry on
      const a = n.slur ? 1 : Math.min(1, t / 0.012);
      const rel = Math.min(1, (n.d - t) / 0.03);
      amp[i] = (n.v ?? 0.8) * a * Math.max(0, rel);
    }
    if (!n.slur) for (let k = 0; k < 0.02 * SR && i0 + k < len; k++) chiff[i0 + k] = (r() - 0.5) * exp(-k / (0.004 * SR));
    // fill short gaps between slurred notes
    if (ni > 0 && n.slur) {
      const prevEnd = Math.round((notes[ni - 1].t + notes[ni - 1].d) * SR);
      for (let i = Math.max(0, prevEnd - 1400); i < i0; i++) { amp[i] = Math.max(amp[i], (n.v ?? 0.8)); if (!freq[i]) freq[i] = prevF; }
    }
  }
  // smooth the amplitude a hair (no clicks) and the breath
  const out = new Float32Array(len);
  let ph = 0, a = 0, lastF = notes[0].f;
  const bpN = makeBiquad('bp', notes[0].f, 9);
  const hiss = makeBiquad('bp', 4200, 0.7);
  let flutter = 0;
  for (let i = 0; i < len; i++) {
    const f = freq[i] || lastF; lastF = f;
    if (i % 64 === 0) bpN.set('bp', f, 9);
    a += (amp[i] - a) * 0.006;
    flutter += ((r() - 0.5) * 0.05 - flutter) * 0.002;
    ph += TAU * f / SR; if (ph > TAU) ph -= TAU;
    const tone = Math.sin(ph) + 0.10 * Math.sin(2 * ph + 0.3) + 0.035 * Math.sin(3 * ph + 1.1) * bright;
    const nz = r() - 0.5;
    const b = bpN.tick(nz) * 2.2 * breath + hiss.tick(nz) * 0.35 * breath * bright;
    out[i] = level * (a * (1 + flutter) * (tone + b) + chiff[i] * 0.18 * bright);
  }
  biquad(out, 'hp', 300, 0.7);
  biquad(out, 'hs', 5000, 0.7, -8);
  biquad(out, 'lp', 9000, 0.7);
  return out;
}

// ---------------------------------------------------------------- plucked strings: tuned Karplus-Strong
// A delay of one period, a one-zero loss filter (brightness) and a first-order allpass for the fractional part, so the loop's
// whole delay is exactly SR/f and the note is in tune; the pluck is a burst of noise, lowpassed and combed at the pick position.
export function pluck({ f, dur = 2, v = 0.8, t60 = 1.5, bright = 0.5, pick = 0.2, seed = 1, damp = null, dampT60 = 0.07, soft = 0.5 }) {
  const r = rng(seed);
  const D = SR / f;
  let S = 0.5 - 0.42 * bright; // loss filter: 0.5 is the plain average
  let N = Math.floor(D - S - 0.1);
  const frac = D - S - N; const c = (1 - frac) / (1 + frac);
  const len = Math.ceil(dur * SR);
  const out = new Float32Array(len);
  const buf = new Float64Array(N);
  // the excitation, written straight into the loop
  const exc = new Float64Array(N);
  let lp = 0; const ka = 1 - soft * 0.85;
  for (let i = 0; i < N; i++) { lp += ((r() * 2 - 1) - lp) * ka; exc[i] = lp; }
  const pk = Math.max(1, Math.round(pick * N));
  let mean = 0;
  for (let i = 0; i < N; i++) { buf[i] = exc[i] - (i >= pk ? exc[i - pk] : 0); mean += buf[i]; }
  mean /= N; let peak = 0;
  for (let i = 0; i < N; i++) { buf[i] -= mean; peak = Math.max(peak, Math.abs(buf[i])); }
  for (let i = 0; i < N; i++) buf[i] *= v / (peak || 1);
  let g = 0.001 ** (1 / (f * t60));
  let p = 0, prev = 0, ax = 0, ay = 0;
  const dampAt = damp == null ? Infinity : Math.round(damp * SR);
  for (let i = 0; i < len; i++) {
    if (i === dampAt) { g = 0.001 ** (1 / (f * dampT60)); }
    const o = buf[p];
    const l = (1 - S) * o + S * prev; prev = o;
    const a = c * l + ax - c * ay; ax = l; ay = a;
    buf[p] = g * a; p = (p + 1) % N;
    out[i] = o;
  }
  return out;
}

/** A guitar strum: `notes` (Hz, low to high), down or up, the strings `spread` s apart, each string damped at `damp` (s). */
export function strum(notes, { v = 0.7, down = true, spread = 0.012, dur = 1.5, damp = null, seed = 1, bright = 0.55, t60 = 1.6 } = {}) {
  const order = down ? notes : [...notes].reverse();
  const len = Math.ceil((dur + spread * notes.length + 0.2) * SR);
  const out = new Float32Array(len);
  const r = rng(seed);
  order.forEach((f, k) => {
    const at = Math.round(k * spread * SR);
    const y = pluck({ f, dur: dur + 0.2, v: v * (0.85 + 0.3 * r()) * (down ? 1 : 0.8), t60: t60 * (f < 150 ? 1.3 : 1), bright, pick: 0.13 + r() * 0.06, seed: seed * 31 + k, damp: damp == null ? null : damp - k * spread, soft: 0.35 });
    for (let i = 0; i < y.length && at + i < len; i++) out[at + i] += y[i];
  });
  // the guitar's body
  biquad(out, 'hp', 75, 0.7);
  biquad(out, 'peak', 110, 1.2, 3);
  biquad(out, 'peak', 240, 1.0, 2);
  biquad(out, 'peak', 2600, 1.0, -2);
  biquad(out, 'lp', 6500, 0.7);
  return out;
}

/** A harp string: plucked nearer its middle, a long ring, a round attack. */
export function harp({ f, v = 0.7, dur = null, seed = 1, damp = null }) {
  const t60 = f < 200 ? 4 : f < 500 ? 3 : f < 1000 ? 2.2 : 1.5;
  const y = pluck({ f, dur: dur ?? Math.min(4.5, t60 * 0.9), v, t60, bright: 0.62, pick: 0.31, seed, soft: 0.6, damp, dampT60: 0.25 });
  biquad(y, 'hp', 90, 0.7);
  biquad(y, 'peak', 450, 0.8, 2);
  biquad(y, 'lp', 7000, 0.7);
  return y;
}

/** A plucked double bass, with harmonics up in the mids (a tablet has no low bass) and a sine under it for real speakers. */
export function bass({ f, d, v = 0.8, seed = 1 }) {
  const dur = d + 0.25;
  const y = pluck({ f, dur, v, t60: 1.4, bright: 0.38, pick: 0.22, seed, damp: d, dampT60: 0.06, soft: 0.45 });
  const n = y.length;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += TAU * f / SR;
    const env = Math.min(1, t / 0.006) * exp(-t / 0.9) * (t < d ? 1 : exp(-(t - d) / 0.05));
    y[i] = Math.tanh(1.6 * y[i]) * 0.8 + 0.55 * v * env * Math.sin(ph);
  }
  biquad(y, 'hp', 35, 0.7);
  biquad(y, 'peak', 700, 1.0, 3); // the growl a small speaker can play
  biquad(y, 'lp', 3500, 0.7);
  return y;
}

// ---------------------------------------------------------------- the bodhrán, stomps, claps
const MODES = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501, 3.6];
/** One bodhrán stroke: tone 0 (open, the bass) .. 1 (the hand pressing the skin, high and short); down or up stroke. */
export function bodhran({ v = 1, tone = 0, up = false, seed = 1, edge = 0.3 }) {
  const r = rng(seed);
  const len = Math.round(0.7 * SR);
  const out = new Float32Array(len);
  const f0 = 72 * (1 + tone * 1.7) * (1 + (r() - 0.5) * 0.01);
  const t0 = 0.30 * (1 - 0.65 * tone);
  for (let k = 0; k < MODES.length; k++) {
    const a = (k === 0 ? 1 : (0.55 * (edge + 0.3)) / (1 + 0.35 * k)) * (0.8 + 0.4 * r()) * (up && k === 0 ? 0.6 : 1);
    const tk = t0 / (1 + 0.7 * k);
    const fk = f0 * MODES[k]; let ph = r() * 0.3;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const bend = 1 + 0.07 * exp(-t / 0.025);
      ph += TAU * fk * bend / SR;
      out[i] += a * exp(-t / tk) * Math.sin(ph);
    }
  }
  // the tipper on the skin: a soft click and a slap
  const click = new Float32Array(len), slap = new Float32Array(len);
  for (let i = 0; i < 0.03 * SR; i++) {
    const nz = r() * 2 - 1;
    click[i] = nz * exp(-i / (0.0025 * SR));
    slap[i] = nz * exp(-i / (0.012 * SR));
  }
  biquad(click, 'bp', 2400, 0.9); biquad(slap, 'bp', 650 * (1 + tone * 0.6), 1.2);
  for (let i = 0; i < len; i++) {
    const att = Math.min(1, i / (0.0015 * SR));
    out[i] = v * att * (out[i] * 0.55 + click[i] * 0.55 + slap[i] * 0.5 * (1 + tone));
  }
  biquad(out, 'lp', 7000, 0.7);
  return out;
}
/** A foot stomp on a wooden floor: a thump, the boards, a knock. Round, never a crack. */
export function stomp({ v = 1, seed = 1 }) {
  const r = rng(seed);
  const len = Math.round(0.5 * SR);
  const out = new Float32Array(len);
  let p1 = 0, p2 = 0;
  const knock = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    p1 += TAU * (48 + 50 * exp(-t / 0.03)) / SR;
    p2 += TAU * 142 / SR;
    knock[i] = (r() * 2 - 1) * exp(-t / 0.03);
    out[i] = Math.sin(p1) * exp(-t / 0.13) * 0.9 + Math.sin(p2) * exp(-t / 0.06) * 0.35;
  }
  biquad(knock, 'bp', 380, 1.3);
  const k2 = Float32Array.from(knock); biquad(k2, 'bp', 1100, 2);
  for (let i = 0; i < len; i++) {
    const att = Math.min(1, i / (0.003 * SR));
    out[i] = v * att * (out[i] + knock[i] * 1.2 + k2[i] * 0.4);
  }
  biquad(out, 'lp', 5000, 0.7);
  return out;
}
/** Hand claps, `people` of them a few ms apart, the first on the onset. */
export function clap({ v = 1, people = 4, seed = 1 }) {
  const r = rng(seed);
  const len = Math.round(0.25 * SR);
  const out = new Float32Array(len);
  for (let p = 0; p < people; p++) {
    const off = p === 0 ? 0 : Math.round((0.002 + r() * 0.011) * SR);
    const g = p === 0 ? 1 : 0.6 + r() * 0.4;
    const bursts = [0, 0.006 + r() * 0.003, 0.013 + r() * 0.004];
    const tail = 0.035 + r() * 0.03;
    const tmp = new Float32Array(len);
    for (let i = 0; i + off < len; i++) {
      const t = i / SR; let e = 0;
      for (const b of bursts) if (t >= b) e = Math.max(e, exp(-(t - b) / 0.0022));
      if (t >= bursts[2]) e = Math.max(e, 0.6 * exp(-(t - bursts[2]) / tail));
      tmp[i + off] = (r() * 2 - 1) * e * g;
    }
    biquad(tmp, 'bp', 1100 + r() * 700, 1.1);
    for (let i = 0; i < len; i++) out[i] += tmp[i];
  }
  biquad(out, 'hp', 500, 0.7);
  biquad(out, 'lp', 6500, 0.7);
  for (let i = 0; i < len; i++) out[i] *= v * Math.min(1, i / 30);
  return out;
}

// ---------------------------------------------------------------- the drone and the strings
/** A one-period table of a reedy tone at f (partials under `top` Hz): odd partials stronger, like a pipe's drone. */
function reedTable(f, top = 4500, size = 4096) {
  const tab = new Float32Array(size + 1);
  for (let k = 1; k * f < top; k++) {
    const a = (k % 2 ? 1 : 0.45) / k ** 0.9;
    for (let i = 0; i <= size; i++) tab[i] += a * Math.sin(TAU * k * i / size);
  }
  let m = 0; for (const v of tab) m = Math.max(m, Math.abs(v));
  for (let i = 0; i <= size; i++) tab[i] /= m;
  return tab;
}
/** A drone of pipes on `freqs` for `dur` s, swelling in over `attack` and out over `release`, breathing slowly. */
export function drone(freqs, { dur, attack = 2, release = 1.5, seed = 1, levels = null }) {
  const r = rng(seed);
  const len = Math.ceil(dur * SR);
  const out = new Float32Array(len);
  freqs.forEach((f, k) => {
    const tab = reedTable(f); const size = tab.length - 1;
    let ph = r();
    const lvl = levels ? levels[k] : 1 / (1 + k * 0.5);
    const br = 0.07 + r() * 0.05, bp0 = r() * TAU;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      ph += f * (1 + 0.0006 * Math.sin(TAU * 0.13 * t + bp0)) / SR; ph -= Math.floor(ph);
      const x = ph * size, j = Math.floor(x), fr = x - j;
      const s = tab[j] * (1 - fr) + tab[j + 1] * fr;
      const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release) * (1 + 0.1 * Math.sin(TAU * br * t + bp0));
      out[i] += lvl * s * Math.max(0, env);
    }
  });
  biquad(out, 'peak', 850, 1.2, 4);
  biquad(out, 'peak', 2100, 1.5, 2);
  biquad(out, 'lp', 3200, 0.6);
  return out;
}

/** A band-limited sawtooth step (PolyBLEP). */
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
/**
 * The string section on `freqs` for `dur` s: each note five players a few cents apart, each with their own vibrato; the level
 * follows `shape` ([[time s, level], ...], straight lines between); the tone opens as it swells.
 */
export function strings(freqs, { dur, shape = null, seed = 1, players = 5, bright = 1, tremolo = 0 }) {
  const r = rng(seed);
  const len = Math.ceil(dur * SR);
  const out = new Float32Array(len);
  const pts = shape ?? [[0, 0], [Math.min(0.6, dur / 3), 1], [dur - 0.4, 1], [dur, 0]];
  const env = new Float32Array(len);
  for (let i = 0, s = 0; i < len; i++) {
    const t = i / SR;
    while (s + 1 < pts.length - 1 && t > pts[s + 1][0]) s++;
    const [ta, va] = pts[s], [tb, vb] = pts[Math.min(s + 1, pts.length - 1)];
    env[i] = tb > ta ? va + (vb - va) * Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : vb;
  }
  for (const f of freqs) {
    for (let p = 0; p < players; p++) {
      const det = 2 ** (((p - (players - 1) / 2) * 3.2 + (r() - 0.5) * 3) / 1200);
      const vr = 4.8 + r() * 1.4, vph = r() * TAU, vd = 7 + r() * 6;
      let ph = r();
      const tr = tremolo ? 7.0 + r() * 0.6 : 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const ff = f * det * 2 ** (vd * Math.min(1, t / 0.6) * Math.sin(TAU * vr * t + vph) / 1200);
        const dt = ff / SR;
        ph += dt; if (ph >= 1) ph -= 1;
        let s = 2 * ph - 1 - blep(ph, dt);
        if (tremolo) s *= 1 - tremolo * (0.5 + 0.5 * Math.sin(TAU * tr * t + vph));
        out[i] += s * env[i] / Math.sqrt(players * freqs.length);
      }
    }
  }
  // the section's tone: dark when soft, open when loud
  let ic1 = 0, ic2 = 0;
  for (let i = 0; i < len; i++) {
    if (i % 32 === 0) {
      var fc = (900 + 3200 * env[i]) * bright; var g = Math.tan(Math.PI * Math.min(fc, 12000) / SR); var k = 1.2;
      var a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    }
    const v3 = out[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; out[i] = v2;
  }
  biquad(out, 'hp', 120, 0.7);
  biquad(out, 'peak', 1200, 0.8, 1.5);
  biquad(out, 'hs', 5000, 0.7, -6);
  return out;
}

/** A soft rising wind under the build: noise through a band that climbs from `from` to `to` Hz over `dur` s, growing. */
export function riser({ dur, from = 300, to = 4500, seed = 1, v = 1 }) {
  const r = rng(seed);
  const len = Math.ceil(dur * SR);
  const out = new Float32Array(len);
  const bp = makeBiquad('bp', from, 1.4);
  for (let i = 0; i < len; i++) {
    const x = i / len;
    if (i % 64 === 0) bp.set('bp', from * (to / from) ** x, 1.4);
    out[i] = bp.tick(r() * 2 - 1) * v * x * x * Math.min(1, (len - i) / (0.05 * SR));
  }
  return out;
}
export { yin };
