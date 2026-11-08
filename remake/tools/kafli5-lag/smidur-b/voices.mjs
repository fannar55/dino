// The recorded voices of smidur-b's song: each group's animal takes put on its tone (the game's takeRate: the octave nearest the
// take's own pitch), cut to their steady, singing part and chopped into short dancing pieces; Slóeðla's horn (the alphorn take,
// the game's setRate: F3..D4); the marimba note doubling the tune (setRate: F4..D5); the didgeridoo as a low F drone.
// The take's own pitch is measured here (YIN over its steady part), not read from sounds.json: several of those values sit on a
// glide or a sub-harmonic and would land 30 to 290 cents off (see the notes).
import { join } from 'node:path';
import { SR, rng, edgeFade, lp, hp, scale, addInto, mul } from './dsp.mjs';
import { HLJOD, TONE, decode, takeRate, setRate, resample, onsetOf, pitchOf } from './samples.mjs';

/**
 * The takes used, per group: the file, the part of it kept (s), where its pitch is steady (s) and the YIN range there.
 * `hit` is where a short chop starts (a steady point, so a chop is on pitch from its first sample).
 */
export const TAKES = {
  grazers: {
    moo: { file: 'grazers-3.mp3', seg: [0.0, 1.42], steady: [0.25, 0.95], range: [120, 400], hit: 0.26 },
  },
  turtles: {
    sing: { file: 'turtles-2.mp3', seg: [0.0, 0.37], steady: [0.03, 0.35], range: [150, 400], hit: 0.03 },
    groan: { file: 'turtles-1.mp3', seg: [0.235, 0.75], steady: [0.26, 0.7], range: [50, 200], hit: 0.0 },
  },
  frogs: {
    ribbit: { file: 'frogs-5.mp3', seg: [0.0, 0.42], steady: [0.11, 0.36], range: [1300, 3000], hit: 0.03 },
    croak: { file: 'frogs-1.mp3', seg: [0.0, 0.6], steady: [0.08, 0.56], range: [800, 1600], hit: 0.0 },
    peep: { file: 'frogs-2.mp3', seg: [0.0, 0.447], steady: [0.04, 0.42], range: [1600, 3000], hit: 0.04 },
  },
  lizards: {
    sing: { file: 'lizards-2.mp3', seg: [0.0, 0.595], steady: [0.0, 0.56], range: [1700, 3000], hit: 0.0 },
    chirp: { file: 'lizards-3.mp3', seg: [0.0, 0.27], steady: null, range: null, hit: 0.0 }, // played as it is, as the game does
  },
  flyers: {
    trill: { file: 'flyers-1.mp3', seg: [0.0, 0.954], steady: [0.08, 0.76], range: [1500, 3000], hit: 0.08 },
    curlew: { file: 'flyers-3.mp3', seg: [0.28, 0.75], steady: [0.52, 0.7], range: [1000, 2000], hit: 0.5 },
  },
};
/** Where each group stands in the stereo picture (the camera moves between them). */
export const PAN = { grazers: -0.35, turtles: -0.15, frogs: 0.12, lizards: 0.3, flyers: 0.42 };

/**
 * Where a sound is heard to start: the first point (after its -30 dB onset) where a 5 ms envelope comes within 9 dB of its peak
 * in the first 250 ms. A call is placed so that this point, not its quiet lead-in, lands on the beat.
 */
export function attackOf(x, from = 0) {
  const W = Math.round(0.005 * SR), H = 44;
  const env = [];
  const lim = Math.min(x.length - W, from + Math.round(0.25 * SR));
  for (let i = from; i < lim; i += H) { let s = 0; for (let k = i; k < i + W; k++) s += x[k] * x[k]; env.push(10 * Math.log10(s / W + 1e-14)); }
  const pk = Math.max(...env);
  const k = env.findIndex(v => v >= pk - 9);
  return from + Math.max(0, k) * H + Math.round(W / 2);
}

const raw = new Map();
function file(name) {
  if (!raw.has(name)) raw.set(name, decode(join(HLJOD, name)));
  return raw.get(name);
}

const prepared = new Map();
/** A take, cut, measured and put on its group's tone: { buf, rate, ownHz, onset (samples), hitAt (samples in buf) }. */
export function take(group, id) {
  const key = `${group}:${id}`;
  if (prepared.has(key)) return prepared.get(key);
  const t = TAKES[group][id];
  const x = file(t.file);
  let ownHz = null;
  if (t.steady) {
    const p = pitchOf(x, { from: Math.round(t.steady[0] * SR), to: Math.round(t.steady[1] * SR), hop: 256, len: 1024, fmin: t.range[0], fmax: t.range[1], apMax: 0.3 });
    ownHz = p.hz;
  }
  const rate = ownHz ? takeRate(ownHz, TONE[group]) : 1;
  const cut = x.slice(Math.round(t.seg[0] * SR), Math.round(t.seg[1] * SR));
  const buf = resample(cut, rate);
  // tame the air over 8 kHz and the rumble under the voice
  lp(buf, 8000);
  lp(buf, 9000);
  hp(buf, group === 'turtles' ? 60 : group === 'grazers' ? 80 : 300);
  let pk = 0;
  for (const v of buf) pk = Math.max(pk, Math.abs(v));
  scale(buf, 0.7 / pk);
  const onset = onsetOf(buf, -30);
  const hitAt = Math.round(((t.hit - t.seg[0]) * SR) / rate);
  const attack = attackOf(buf, onset);
  const out = { group, id, file: t.file, buf, rate, ownHz, onset, attack, hitAt: Math.max(onset, hitAt) };
  prepared.set(key, out);
  return out;
}

/**
 * One animal call to place on the grid: the full call from its onset (so its sound starts on the beat), or a chop (`from: 'hit'`)
 * from its steady point, cut at `seconds` with a short release, never longer than the take. v scales it.
 */
export function call(group, id, { from = 'start', seconds = null, v = 1, fadeIn = 0.004 } = {}) {
  const t = take(group, id);
  const start = from === 'hit' ? t.hitAt : Math.max(0, t.onset - Math.round(0.002 * SR));
  const avail = t.buf.length - start;
  const n = seconds ? Math.min(avail, Math.round(seconds * SR)) : avail;
  const out = t.buf.slice(start, start + n);
  edgeFade(out, Math.min(0.04, n / SR / 4), from === 'hit' ? fadeIn : 0.001);
  scale(out, v);
  out.pre = from === 'hit' ? 0 : Math.max(0, t.attack - start); // samples it sounds before its beat
  return out;
}

// ---------- her horn ----------
let hornRaw = null;
const hornCache = new Map();
const HORN_HZ_JSON = 273.02;
/** Her horn (the alphorn take) at group's tone in the horn's octave (F3..D4), held `seconds`, released over `rel`. */
export function horn(group, seconds, { v = 1, rel = 0.35 } = {}) {
  if (!hornRaw) {
    const x = file('horn-1.mp3');
    const p = pitchOf(x, { from: Math.round(0.4 * SR), to: Math.round(2.4 * SR), hop: 512, len: 2048, fmin: 150, fmax: 500 });
    hornRaw = { x, hz: p.hz ?? HORN_HZ_JSON };
  }
  const rate = setRate(hornRaw.hz, group);
  if (!hornCache.has(group)) hornCache.set(group, resample(hornRaw.x, rate));
  const y = hornCache.get(group);
  const on = onsetOf(y, -30);
  const pre = Math.min(Math.round(0.09 * SR), attackOf(y, on) - on);
  const want = Math.round((seconds + rel) * SR) + pre;
  const n = Math.min(y.length - on, want);
  const out = y.slice(on, on + n);
  const R = Math.min(n, Math.round(rel * SR));
  for (let i = 0; i < R; i++) out[n - R + i] *= Math.cos((Math.PI / 2) * (i / R));
  lp(out, 7000);
  hp(out, 70);
  let pk = 0;
  for (const v of out) pk = Math.max(pk, Math.abs(v));
  scale(out, (0.7 / pk) * v);
  out.pre = pre;
  return out;
}
export function hornHz() { horn('frogs', 0.5); return hornRaw.hz; }

// ---------- the marimba note (the game's instrument under every animal) ----------
let marRaw = null;
const marCache = new Map();
/** The marimba at group's tone (F4..D5) and an optional octave shift, cut at `seconds` with a gentle release. */
export function marimba(group, { seconds = 1.2, v = 1, octave = 0 } = {}) {
  if (!marRaw) {
    const x = file('marimba.mp3');
    const p = pitchOf(x, { from: Math.round(0.05 * SR), to: Math.round(1.2 * SR), hop: 512, len: 2048, fmin: 300, fmax: 800 });
    marRaw = { x, hz: p.hz ?? 525.46 };
  }
  const rate = setRate(marRaw.hz, group) * 2 ** octave;
  const ck = group + ':' + octave;
  if (!marCache.has(ck)) marCache.set(ck, resample(marRaw.x, rate));
  const y = marCache.get(ck);
  const on = onsetOf(y, -30);
  const n = Math.min(y.length - on, Math.round(seconds * SR));
  const out = y.slice(Math.max(0, on - 40), Math.max(0, on - 40) + n);
  edgeFade(out, Math.min(0.15, n / SR / 3));
  lp(out, 7500);
  let pk = 0;
  for (const v of out) pk = Math.max(pk, Math.abs(v));
  return scale(out, (0.7 / pk) * v);
}
export function marimbaHz() { marimba('frogs'); return marRaw.hz; }

// ---------- the didgeridoo: a low F drone, held by overlapping grains of its steady part ----------
let didRaw = null;
export function drone(seconds, seed, { v = 1 } = {}) {
  if (!didRaw) {
    const x = file('horn-2.mp3');
    const p = pitchOf(x, { from: Math.round(0.3 * SR), to: Math.round(2.6 * SR), hop: 1024, len: 4096, fmin: 40, fmax: 200 });
    const hz = p.hz ?? 69.27;
    const rate = takeRate(hz, TONE.grazers); // F2, the octave of F nearest its own
    didRaw = { y: resample(x, rate), hz, rate };
  }
  const { y } = didRaw;
  const r = rng(seed);
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const G = Math.round(0.8 * SR), H = G / 2;
  const lo = Math.round(0.15 * SR), hi = y.length - G - Math.round(0.15 * SR);
  for (let s = 0; s < n; s += H) {
    const from = lo + Math.floor(r() * (hi - lo));
    for (let i = 0; i < G && s + i < n; i++) out[s + i] += y[from + i] * Math.sin((Math.PI * i) / G);
  }
  // fade in and out over a beat, it is a drone and not a hit
  edgeFade(out, 0.5, 0.6);
  lp(out, 2500);
  hp(out, 50);
  let pk = 0;
  for (const v of out) pk = Math.max(pk, Math.abs(v));
  return scale(out, (0.7 / pk) * v);
}
export function droneInfo() { drone(1, 1); return { hz: didRaw.hz, rate: didRaw.rate }; }
