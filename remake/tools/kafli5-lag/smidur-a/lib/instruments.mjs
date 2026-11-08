// The storybook orchestra, every instrument synthesized: string sections (detuned saw ensembles, slow bows, delayed vibrato,
// tremolo, staccato), Karplus-Strong pizzicato and harp, brass whose filter blooms with the breath, additive woodwinds with
// breath noise, and modal percussion (timpani, gran cassa, field snare, cymbals, triangle, glockenspiel, woodblock,
// tambourine, shaker). Each takes a note { f, dur, vel, seed, bright, ... } and returns a mono buffer that starts at its onset.
import { SR, TAU, rng, addSaw, addSine, svf, eq, env, ks, noise, onePole } from './dsp.mjs';

const len = s => Math.max(1, Math.round(s * SR));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulEnv(x, e) {
  for (let i = 0; i < x.length; i++) x[i] *= e[i];
  return x;
}
/** A short linear fade-in (declick) of `ms`. */
function fadeIn(x, ms = 1.5) {
  const m = Math.min(x.length, Math.round((ms / 1000) * SR));
  for (let i = 0; i < m; i++) x[i] *= i / m;
  return x;
}
/** A short fade-out at the end. */
function fadeOut(x, ms = 8) {
  const m = Math.min(x.length, Math.round((ms / 1000) * SR));
  for (let i = 0; i < m; i++) x[x.length - 1 - i] *= i / m;
  return x;
}

// ---------------------------------------------------------------- strings
const SECTION = {
  vln: { cut: 2700, cutVel: 2000, body: [['hp', 170, 0.7], ['peak', 520, 1, 2], ['peak', 2900, 1.2, 2.5], ['lp', 6800, 0.7]] },
  vla: { cut: 2600, cutVel: 1800, body: [['hp', 110, 0.7], ['peak', 380, 1, 2], ['peak', 1700, 1.1, 2], ['lp', 6500, 0.7]] },
  vc: { cut: 1900, cutVel: 1500, body: [['hp', 55, 0.7], ['peak', 230, 1, 3], ['peak', 1100, 1, 2], ['lp', 5500, 0.7]] },
  cb: { cut: 1100, cutVel: 900, body: [['hp', 32, 0.7], ['peak', 120, 1, 3], ['peak', 600, 1, 2.5], ['lp', 3800, 0.7]] },
};
/**
 * A string section playing one note: `voices` saws, each detuned a few cents, with its own vibrato rate and phase that sets in
 * after `vibDelay`, a bowed rise (`attack`), an optional `swell` (a level function of t), `tremolo` (bow strokes a second, each
 * player at his own rate), and a lowpass that opens with the level and with `bright`. `bite` sharpens the onset (staccato).
 */
export function strings({ f, dur, vel = 0.7, seed, bright = 1, section = 'vln', voices = 6, detune = 9, attack = 0.22,
  release = 0.45, vib = 5.3, vibDepth = 14, vibDelay = 0.28, tremolo = 0, swell = null, bite = 0 }) {
  const r = rng(seed);
  const S = SECTION[section];
  const n = len(dur + release + 0.05);
  const out = new Float32Array(n);
  const tmp = tremolo ? new Float32Array(n) : null;
  for (let v = 0; v < voices; v++) {
    const k = 2 ** (((r() * 2 - 1) * detune) / 1200);
    const rate = vib * (0.85 + 0.3 * r());
    const ph0 = r() * TAU;
    const delay = vibDelay * (0.7 + 0.6 * r());
    const depth = (vibDepth * (0.6 + 0.8 * r()) * Math.LN2) / 1200;
    const fv = f * k;
    const fn = vibDepth > 0
      ? i => { const t = i / SR; const ramp = clamp((t - delay) / 0.45, 0, 1); return fv * (1 + depth * ramp * Math.sin(TAU * rate * t + ph0)); }
      : fv;
    if (!tremolo) addSaw(out, fn, { phase: r() });
    else {
      tmp.fill(0);
      addSaw(tmp, fn, { phase: r() });
      const tr = tremolo * (0.85 + 0.3 * r());
      const tp = r() * TAU;
      for (let i = 0; i < n; i++) out[i] += tmp[i] * (0.45 + 0.55 * Math.abs(Math.sin((Math.PI * tr * i) / SR + tp)));
    }
  }
  const e = env(n, { a: attack, hold: dur, r: release, level: swell });
  const base = (S.cut + S.cutVel * vel) * bright;
  const biteN = 0.06 * SR;
  svf(out, i => base * (0.5 + 0.5 * e[i]) * (1 + bite * Math.exp(-i / biteN)), 1.25);
  eq(out, S.body);
  const g = (vel * 0.33) / Math.sqrt(voices);
  for (let i = 0; i < n; i++) out[i] *= e[i] * g;
  return fadeOut(out);
}

// ---------------------------------------------------------------- plucked
/** Section pizzicato: three players' Karplus-Strong strings a few ms apart, the low ones ringing longer, through a body. */
export function pizz({ f, vel = 0.7, seed, bright = 1, t60 = null, players = 3, dur = null }) {
  const r = rng(seed);
  const T = t60 ?? clamp(0.32 + 70 / f, 0.3, 1.3);
  const n = len(T + 0.05);
  const out = new Float32Array(n);
  for (let s = 0; s < players; s++) {
    const det = 2 ** (((r() * 2 - 1) * 6) / 1200);
    const off = s === 0 ? 0 : Math.round(r() * 0.009 * SR);
    const x = ks(f * det, T, { t60: T, S: 0.5, pluck: (1400 + 2600 * vel) * bright, r, position: 0.15 + 0.12 * r() });
    for (let i = 0; i + off < n && i < x.length; i++) out[i + off] += x[i] / players;
  }
  eq(out, [['hp', clamp(f * 0.6, 35, 400), 0.7], ['peak', 280, 1, 3], ['peak', 1300, 1, 2], ['lp', 5200, 0.7]]);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.75;
  if (dur) { // damped early
    const m = Math.min(n, len(dur));
    const tau = 0.04 * SR;
    for (let i = m; i < n; i++) out[i] *= Math.exp(-(i - m) / tau);
  }
  return fadeOut(fadeIn(out, 0.8));
}

/** A concert harp string: a bright, long Karplus-Strong string with a warm sine under it. */
export function harp({ f, vel = 0.7, seed, bright = 1 }) {
  const r = rng(seed);
  const T = clamp(4.2 - 0.75 * Math.log2(f / 110), 0.9, 4.2);
  const n = len(T + 0.05);
  const out = ks(f, T + 0.05, { t60: T, S: 0.22, pluck: 3200 * bright, r, position: 0.28 });
  addSine(out, f, 0.35, T * 1.1, 0);
  eq(out, [['hp', 55, 0.7], ['peak', 250, 1, 2], ['lp', 6200, 0.7]]);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.55;
  return fadeOut(fadeIn(out, 1));
}

// ---------------------------------------------------------------- brass
const BRASS = {
  horn: { cut0: 260, cutEnv: 1500, bloom: 0.15, a: 0.06, r: 0.3, voices: 3, det: 5, scoop: -28, drive: 1.3, vib: 4.8, vibDepth: 7,
    body: [['hp', 60, 0.7], ['peak', 420, 1, 3], ['lp', 3600, 0.7]] },
  trumpet: { cut0: 480, cutEnv: 2700, bloom: 0.08, a: 0.03, r: 0.18, voices: 2, det: 4, scoop: -18, drive: 1.7, vib: 5.4, vibDepth: 9,
    body: [['hp', 180, 0.7], ['peak', 1300, 1, 2.5], ['lp', 5800, 0.7]] },
  trombone: { cut0: 280, cutEnv: 1900, bloom: 0.11, a: 0.045, r: 0.22, voices: 2, det: 4, scoop: -22, drive: 1.5, vib: 4.6, vibDepth: 6,
    body: [['hp', 60, 0.7], ['peak', 520, 1, 2.5], ['lp', 4800, 0.7]] },
  tuba: { cut0: 170, cutEnv: 1000, bloom: 0.1, a: 0.045, r: 0.2, voices: 1, det: 0, scoop: -14, drive: 1.4, vib: 4.2, vibDepth: 5,
    body: [['hp', 35, 0.7], ['peak', 240, 1, 3], ['peak', 720, 1, 3], ['lp', 3000, 0.7]] },
};
/**
 * A brass section note: saws that scoop up into the pitch, their lowpass blooming open a breath after the attack and closing
 * with the release, a little drive so a louder note is brighter, delayed vibrato on long notes, a lip buzz at the start.
 */
export function brass({ f, dur, vel = 0.7, seed, bright = 1, kind = 'horn', swell = null, accent = 0 }) {
  const P = BRASS[kind];
  const r = rng(seed);
  const n = len(dur + P.r + 0.05);
  const out = new Float32Array(n);
  const scoopN = 0.05 * SR;
  for (let v = 0; v < P.voices; v++) {
    const k = 2 ** (((r() * 2 - 1) * P.det) / 1200);
    const rate = P.vib * (0.9 + 0.2 * r());
    const ph0 = r() * TAU;
    const depth = (P.vibDepth * Math.LN2) / 1200;
    const sc = (P.scoop * (0.7 + 0.6 * r()) * Math.LN2) / 1200;
    addSaw(out, i => {
      const t = i / SR;
      const vibAmt = dur > 0.6 ? clamp((t - 0.35) / 0.4, 0, 1) : 0;
      return f * k * (1 + sc * Math.exp(-i / scoopN) + depth * vibAmt * Math.sin(TAU * rate * t + ph0));
    }, { phase: r() });
  }
  const e = env(n, { a: P.a, hold: dur, r: P.r, level: swell });
  const bloomN = P.bloom * SR;
  const key = (f / 220) ** 0.35;
  const accN = 0.08 * SR;
  svf(out, i => (P.cut0 * key + P.cutEnv * vel * (1 - Math.exp(-i / bloomN)) * e[i] * (1 + accent * Math.exp(-i / accN))) * bright, 1.1);
  const td = Math.tanh(P.drive);
  for (let i = 0; i < n; i++) out[i] = Math.tanh((P.drive * out[i] * e[i]) / Math.sqrt(P.voices)) / td;
  // lip buzz
  const buzz = noise(len(0.03), r);
  svf(buzz, f * 3, 0.6, 'bp');
  for (let i = 0; i < buzz.length && i < n; i++) out[i] += buzz[i] * 0.08 * vel * (1 - i / buzz.length);
  eq(out, P.body);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.32;
  return fadeOut(fadeIn(out, 2));
}

// ---------------------------------------------------------------- woodwinds
const WIND = {
  flute: { amps: [1, 0.4, 0.15, 0.08, 0.04, 0.02], a: 0.05, r: 0.12, vib: 5, vibDepth: 16, vibDelay: 0.22, breath: 0.07, band: 2.2,
    chiff: 0.12, body: [['hp', 200, 0.7], ['lp', 7200, 0.7]], level: 0.32 },
  piccolo: { amps: [1, 0.18, 0.05], a: 0.035, r: 0.1, vib: 5.6, vibDepth: 13, vibDelay: 0.2, breath: 0.05, band: 1.8, chiff: 0.1,
    body: [['hp', 400, 0.7], ['lp', 7600, 0.7]], level: 0.24 },
  clarinet: { amps: [1, 0.04, 0.55, 0.05, 0.33, 0.04, 0.2, 0.03, 0.12, 0.02, 0.07, 0.01, 0.04], a: 0.03, r: 0.08, vib: 4.5,
    vibDepth: 3, vibDelay: 0.3, breath: 0.025, band: 3, chiff: 0.05, body: [['hp', 120, 0.7], ['peak', 1500, 1, 1.5], ['lp', 6000, 0.7]],
    level: 0.3 },
  oboe: { formants: [[1100, 260, 1], [2800, 500, 0.45]], tilt: 0.5, maxH: 18, a: 0.04, r: 0.09, vib: 5.2, vibDepth: 10, vibDelay: 0.25,
    breath: 0.02, band: 3, chiff: 0.04, body: [['hp', 220, 0.7], ['lp', 6800, 0.7]], level: 0.26 },
  bassoon: { formants: [[470, 170, 1], [1150, 300, 0.65]], tilt: 0.55, maxH: 30, a: 0.035, r: 0.1, vib: 4.8, vibDepth: 6,
    vibDelay: 0.3, breath: 0.02, band: 4, chiff: 0.04, body: [['hp', 50, 0.7], ['peak', 480, 1, 2], ['lp', 4000, 0.7]], level: 0.36 },
};
function windAmps(P, f) {
  if (P.amps) return P.amps;
  const amps = [];
  for (let h = 1; h <= P.maxH && h * f < 6500; h++) {
    const x = h * f;
    let g = 0.25;
    for (const [c, w, a] of P.formants) g += a * Math.exp(-(((x - c) / w) ** 2));
    amps.push(g / h ** P.tilt);
  }
  const m = Math.max(...amps);
  return amps.map(a => a / m);
}
/** A woodwind: additive partials on one breathing phase (vibrato after a moment), band-passed breath and an onset chiff. */
export function wind({ f, dur, vel = 0.7, seed, bright = 1, kind = 'flute', trill = 0, trillRate = 13 }) {
  const P = WIND[kind];
  const r = rng(seed);
  const n = len(dur + P.r + 0.04);
  const amps = windAmps(P, f).map((a, h) => ((h + 1) * f < 7500 ? a * bright ** h : 0));
  const out = new Float32Array(n);
  const rate = P.vib * (0.9 + 0.2 * r());
  const ph0 = r() * TAU;
  const depth = (P.vibDepth * Math.LN2) / 1200;
  const delay = P.vibDelay;
  const trillK = trill ? 2 ** (trill / 12) - 1 : 0;
  let phase = r();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let fi = f * (1 + depth * clamp((t - delay) / 0.4, 0, 1) * Math.sin(TAU * rate * t + ph0));
    if (trill && Math.sin(TAU * trillRate * t) > 0) fi *= 1 + trillK;
    phase += fi / SR;
    if (phase > 1) phase -= 1;
    const p = TAU * phase;
    let s = 0;
    for (let h = 0; h < amps.length; h++) if (amps[h]) s += amps[h] * Math.sin((h + 1) * p);
    out[i] = s;
  }
  const e = env(n, { a: P.a, hold: dur, r: P.r });
  mulEnv(out, e);
  const br = noise(n, r);
  svf(br, Math.min(7000, f * P.band), 0.7, 'bp');
  for (let i = 0; i < n; i++) out[i] += br[i] * P.breath * e[i] * (0.6 + 0.4 * vel);
  const ch = noise(len(0.03), r);
  svf(ch, 2500, 1, 'bp');
  for (let i = 0; i < ch.length && i < n; i++) out[i] += ch[i] * P.chiff * vel * (1 - i / ch.length);
  eq(out, P.body);
  for (let i = 0; i < n; i++) out[i] *= vel * P.level;
  return fadeOut(fadeIn(out, 2));
}

// ---------------------------------------------------------------- percussion
function modal(n, modes, base, scaleT = 1) {
  const out = new Float32Array(n);
  for (const [ratio, amp, t60] of modes) if (base * ratio < 9000) addSine(out, base * ratio, amp, t60 * scaleT, 0);
  return out;
}
/** Timpani: the near-harmonic membrane modes (1, 1.5, 2, 2.44, 2.9 of the principal) over a felt thud and a short strike. */
export function timpani({ f, vel = 0.7, seed, bright = 1 }) {
  const r = rng(seed);
  const n = len(3.2);
  const out = modal(n, [[1, 1, 2.6], [1.504, 0.5, 1.5], [1.742, 0.25, 0.9], [2.0, 0.26, 1.1], [2.245, 0.13, 0.75], [2.494, 0.09, 0.6],
    [2.8, 0.06, 0.45], [2.98, 0.04, 0.35]], f, 0.55 + 0.45 * vel);
  const th = noise(len(0.12), r);
  onePole(th, 220); onePole(th, 220);
  for (let i = 0; i < th.length; i++) out[i] += th[i] * 2.2 * Math.exp(-i / (0.035 * SR));
  const st = noise(len(0.02), r);
  svf(st, 1800 * bright, 1, 'bp');
  for (let i = 0; i < st.length; i++) out[i] += st[i] * 0.25 * vel * (1 - i / st.length);
  eq(out, [['hp', 40, 0.7], ['lp', 5000, 0.7]]);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.42;
  return fadeOut(fadeIn(out, 1.5));
}
/** Gran cassa: a big felt-beaten drum, its low modes and a soft thud; low, never a click. */
export function granCassa({ vel = 0.7, seed }) {
  const r = rng(seed);
  const n = len(1.6);
  const out = modal(n, [[1, 1, 1.4], [1.58, 0.45, 0.7], [2.14, 0.3, 0.45], [2.85, 0.16, 0.3], [3.8, 0.08, 0.2]], 50, 0.6 + 0.4 * vel);
  const th = noise(len(0.1), r);
  onePole(th, 300); onePole(th, 300);
  for (let i = 0; i < th.length; i++) out[i] += th[i] * 2.5 * Math.exp(-i / (0.025 * SR));
  eq(out, [['hp', 28, 0.7], ['peak', 90, 1, 2], ['lp', 2500, 0.7]]);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.6;
  return fadeOut(fadeIn(out, 3));
}
/** A field snare: shell modes and the snare wires (band-passed noise), tamed over 8 kHz. */
export function snare({ vel = 0.7, seed, bright = 1 }) {
  const r = rng(seed);
  const n = len(0.5);
  const out = modal(n, [[1, 0.6, 0.16], [1.8, 0.35, 0.1], [2.46, 0.18, 0.07]], 186);
  const w = noise(n, r);
  svf(w, 3600 * bright, 1.1, 'bp');
  const t60 = 0.18 + 0.12 * vel;
  for (let i = 0; i < n; i++) out[i] += w[i] * 1.3 * (0.4 + 0.6 * vel) * Math.exp((-6.9 * i) / (t60 * SR));
  eq(out, [['hp', 120, 0.7], ['peak', 220, 1, 2], ['lp', 7500, 0.7]]);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.45;
  return fadeOut(fadeIn(out, 0.6));
}
/** A pair of crash cymbals, soft-edged: inharmonic partials and filtered noise, nothing harsh over 8 kHz. */
export function cymbal({ vel = 0.6, seed, t60 = 2.4 }) {
  const r = rng(seed);
  const n = len(t60 + 0.2);
  const out = new Float32Array(n);
  for (let k = 0; k < 36; k++) {
    const fr = 380 * 2 ** (r() * 4.1);
    addSine(out, fr, (0.5 + r()) / Math.sqrt(fr / 380), t60 * (0.45 + 0.6 * r()), r() * TAU);
  }
  const w = noise(n, r);
  eq(w, [['hp', 2600, 0.7], ['lp', 7600, 0.7]]);
  for (let i = 0; i < n; i++) out[i] = out[i] * 0.06 + w[i] * 0.9 * Math.exp((-6.9 * i) / (t60 * 0.8 * SR));
  const a = len(0.008);
  for (let i = 0; i < a; i++) out[i] *= i / a;
  eq(out, [['hp', 300, 0.7], ['lp', 7800, 0.7], ['highshelf', 6000, 0.7, -4]]);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.22;
  return fadeOut(out);
}
/** A suspended cymbal rolled with soft mallets, swelling over `dur` s (to its peak at the end), then let ring a moment. */
export function cymbalSwell({ dur, vel = 0.6, seed }) {
  const r = rng(seed);
  const n = len(dur + 1.2);
  const w = noise(n, r);
  const m = len(dur);
  svf(w, i => 2200 + 3800 * Math.min(1, i / m), 0.9, 'bp');
  const out = new Float32Array(n);
  for (let k = 0; k < 20; k++) addSine(out, 500 * 2 ** (r() * 3.5), 0.02, 0, r() * TAU);
  for (let i = 0; i < n; i++) {
    const g = i < m ? (i / m) ** 2.4 : Math.exp((-6.9 * (i - m)) / (1.1 * SR));
    out[i] = (out[i] + w[i]) * g;
  }
  eq(out, [['hp', 600, 0.7], ['lp', 7600, 0.7]]);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.35;
  return fadeOut(out);
}
/** A triangle: its bright inharmonic partials ringing, kept under 8 kHz. */
export function triangle({ vel = 0.5 }) {
  const n = len(2.6);
  const out = modal(n, [[1, 0.5, 2.4], [2.02, 1, 2.1], [3.03, 0.6, 1.7], [4.08, 0.4, 1.4], [5.15, 0.25, 1.1]], 1290);
  eq(out, [['lp', 7600, 0.7]]);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.05;
  return fadeOut(fadeIn(out, 0.5));
}
/** Glockenspiel (or, softer, a celesta): bar modes 1, 2.76, 5.4 and a little mallet click. */
export function glock({ f, vel = 0.6, seed, soft = false }) {
  const r = rng(seed);
  const n = len(soft ? 1.6 : 2.0);
  const out = modal(n, soft ? [[1, 1, 1.4], [3.0, 0.08, 0.3], [4.0, 0.06, 0.25]] : [[1, 1, 1.7], [2.76, 0.2, 0.5], [5.4, 0.06, 0.25]], f);
  const cl = noise(len(0.006), r);
  svf(cl, 3000, 1, 'bp');
  for (let i = 0; i < cl.length; i++) out[i] += cl[i] * 0.15;
  eq(out, [['hp', 300, 0.7], ['lp', 7800, 0.7]]);
  for (let i = 0; i < n; i++) out[i] *= vel * (soft ? 0.16 : 0.13);
  return fadeOut(fadeIn(out, 0.4));
}
/** A woodblock: two hollow modes and a click. */
export function woodblock({ vel = 0.6, seed, f = 880 }) {
  const r = rng(seed);
  const n = len(0.25);
  const out = modal(n, [[1, 1, 0.07], [2.31, 0.35, 0.04]], f);
  const cl = noise(len(0.004), r);
  svf(cl, f * 2, 1, 'bp');
  for (let i = 0; i < cl.length; i++) out[i] += cl[i] * 0.3;
  eq(out, [['hp', 300, 0.7], ['lp', 6000, 0.7]]);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.3;
  return fadeOut(fadeIn(out, 0.3));
}
/** A tambourine: jingles (narrow bands of noise) and a touch of the head; tamed. */
export function tambourine({ vel = 0.5, seed }) {
  const r = rng(seed);
  const n = len(0.35);
  const out = new Float32Array(n);
  for (const [c, g] of [[4700, 1], [6100, 0.8], [7300, 0.5]]) {
    const w = noise(n, r);
    svf(w, c, 0.25, 'bp');
    for (let i = 0; i < n; i++) out[i] += w[i] * g;
  }
  const t = len(0.16);
  for (let i = 0; i < n; i++) {
    const shake = i < len(0.012) ? i / len(0.012) : 1;
    out[i] *= shake * Math.exp((-6.9 * i) / t);
  }
  addSine(out, 230, 0.15, 0.06, 0);
  eq(out, [['hp', 180, 0.7], ['lp', 7800, 0.7], ['highshelf', 6500, 0.7, -3]]);
  for (let i = 0; i < n; i++) out[i] *= vel * 0.22;
  return fadeOut(out);
}
/** A shaker: a soft swish of band-passed noise. */
export function shaker({ vel = 0.5, seed }) {
  const r = rng(seed);
  const n = len(0.14);
  const w = noise(n, r);
  svf(w, 4200, 0.9, 'bp');
  const a = len(0.018);
  for (let i = 0; i < n; i++) w[i] *= (i < a ? i / a : Math.exp((-6.9 * (i - a)) / len(0.09))) * vel * 0.2;
  eq(w, [['lp', 7600, 0.7]]);
  return fadeOut(w);
}

export const INSTRUMENTS = { strings, pizz, harp, brass, wind, timpani, granCassa, snare, cymbal, cymbalSwell, triangle, glock,
  woodblock, tambourine, shaker };
