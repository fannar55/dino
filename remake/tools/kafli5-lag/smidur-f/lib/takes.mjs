// The chapter's recordings: which takes this song uses, each one's own pitch measured on its steady part, and a call made from a
// take: moved to its group's tone in the octave nearest its own (rate = target / own), gliding takes partly flattened, its heard
// attack found so the call can be put on its beat.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, SR } from './io.mjs';
import { track } from './pitch.mjs';
import { resample } from './dsp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const HLJOD = join(here, '../../../../assets/audio/kafli5/hljod');
export const HLJOD_REL = 'remake/assets/audio/kafli5/hljod';

/** The song's key: G major. Pitch classes as MIDI numbers of the tones in octave 4. */
export const KEY_NAME = 'G major';
export const TONE_MIDI = { grazers: 67, turtles: 69, frogs: 71, lizards: 74, flyers: 76 }; // G4 A4 B4 D5 E5
export const GROUPS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];
export const toneHz = (group, octave = 0) => 440 * 2 ** ((TONE_MIDI[group] + 12 * octave - 69) / 12);

/**
 * The takes in use. win: the steady stretch the own pitch is measured on (s); use: the part of the file played (s);
 * flat: how much of the take's own pitch movement is flattened (0 none, 1 all); licence for song.json.
 */
export const TAKES = {
  'grazers-3': { group: 'grazers', win: [0.27, 0.76], use: [0.15, 1.5], flat: 0.85, licence: 'CC0 1.0' },
  'grazers-2': { group: 'grazers', win: [0.5, 0.68], use: [0.0, 1.0], flat: 0.5, licence: 'ElevenLabs sound generation, made for this game' },
  'turtles-2': { group: 'turtles', win: [0.05, 0.37], use: [0.02, 0.76], flat: 0.95, licence: 'ElevenLabs sound generation, made for this game' },
  'frogs-5': { group: 'frogs', win: [0.13, 0.23], use: [0.0, 0.42], flat: 0.4, licence: 'CC0 1.0' },
  'frogs-1': { group: 'frogs', win: [0.08, 0.4], use: [0.0, 0.6], flat: 0.5, licence: 'ElevenLabs sound generation, made for this game' },
  'frogs-2': { group: 'frogs', win: [0.16, 0.4], use: [0.0, 0.45], flat: 0.4, licence: 'ElevenLabs sound generation, made for this game' },
  'lizards-2': { group: 'lizards', win: [0.09, 0.42], use: [0.0, 0.59], flat: 0.85, licence: 'ElevenLabs sound generation, made for this game' },
  'lizards-3': { group: 'lizards', win: [0.03, 0.06], use: [0.0, 0.27], flat: 0, licence: 'CC0 1.0', noClear: true },
  'flyers-3': { group: 'flyers', win: [0.5, 0.7], use: [0.3, 0.75], flat: 0.55, licence: 'CC BY 4.0 (Benboncan)' },
  'flyers-2': { group: 'flyers', win: [0.08, 0.45], use: [0.05, 1.15], flat: 0.7, licence: 'CC BY 4.0 (Benboncan)' },
  marimba: { win: [0.02, 0.58], use: [0, 2.5], flat: 0, licence: 'CC0 1.0' },
  'horn-1': { win: [0.1, 2.7], use: [0.0, 2.75], flat: 0.5, licence: 'CC0 1.0' },
  'horn-2': { win: [0.05, 2.95], use: [0.0, 3.0], flat: 0, licence: 'CC0 1.0' },
};

const cents = (a, b) => 1200 * Math.log2(a / b);
const median = a => {
  const s = [...a].sort((p, q) => p - q);
  return s.length ? s[s.length >> 1] : 0;
};

/** Load and measure one take: { name, x, own, frames (smoothed pitch per hop), hop, spec } */
function loadTake(name) {
  const spec = TAKES[name];
  const [x] = decode(join(HLJOD, name + '.mp3'));
  const hop = 256, size = 2048;
  const fr = track(x, { size, hop, fmin: 50, fmax: 3500 });
  const peak = Math.max(...fr.map(f => f.rms));
  const inWin = fr.filter(f => f.t >= spec.win[0] && f.t <= spec.win[1] && f.clarity >= 0.7 && f.rms >= peak * 0.1);
  // fold octave slips in the window toward the window's rough median, then take the median
  const rough = median(inWin.map(f => f.hz));
  const folded = inWin.map(f => f.hz * 2 ** Math.round(-Math.log2(f.hz / rough)));
  const own = median(folded);
  // the pitch curve used for flattening: clear frames folded near own, gaps held, median-smoothed
  const curve = new Float64Array(fr.length);
  let last = own;
  for (let i = 0; i < fr.length; i++) {
    const f = fr[i];
    if (f.clarity >= 0.75 && f.rms >= peak * 0.08) {
      const hz = f.hz * 2 ** Math.round(-Math.log2(f.hz / own));
      if (Math.abs(cents(hz, own)) < 500) last = hz;
    }
    curve[i] = last;
  }
  const smooth = Float64Array.from(curve, (_, i) => median(Array.from(curve.slice(Math.max(0, i - 3), i + 4))));
  return { name, x, own, smooth, hop, size, spec, spread: Math.max(...folded.map(h => Math.abs(cents(h, own)))) };
}

const cache = new Map();
export function take(name) {
  if (!cache.has(name)) cache.set(name, loadTake(name));
  return cache.get(name);
}

/** The heard attack (s) of a buffer: on a 5 ms RMS envelope (2.5 ms hop), the first point reaching 30% of its peak RMS
 * (the same rule the render's check uses on the stem, there measured from the floor left by earlier sounds). */
export function heardOnset(buf) {
  const hop = Math.round(0.0025 * SR), w = Math.round(0.005 * SR);
  const env = [];
  for (let s = 0; s + w <= buf.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + w; i++) e += buf[i] * buf[i];
    env.push(Math.sqrt(e / w));
  }
  const peak = Math.max(...env);
  const k = env.findIndex(v => v >= 0.3 * peak);
  return (Math.max(0, k) * hop) / SR;
}

/** The target pitch for a take moved to `group`'s tone in the octave nearest its own pitch. */
export function targetFor(own, group) {
  const t = toneHz(group);
  return t * 2 ** Math.round(Math.log2(own / t));
}

const callCache = new Map();
/**
 * A call: take `name` sung on `group`'s tone (its own group's unless given; the horn and marimba take any), octave nearest
 * its own unless `octave` (relative shift in octaves) is given. Optional `seconds` cuts it with a fade. Returns
 * { buf, onset (s, heard attack in buf), target, own, rate }.
 */
export function call(name, { group = null, octave = 0, seconds = 0, fadeOut = 0.05 } = {}) {
  const key = `${name}|${group}|${octave}|${seconds}|${fadeOut}`;
  if (callCache.has(key)) return callCache.get(key);
  const tk = take(name);
  const g = group ?? tk.spec.group;
  const target = targetFor(tk.own, g) * 2 ** octave;
  const r0 = target / tk.own;
  const a = tk.spec.flat;
  const from = Math.round(tk.spec.use[0] * SR);
  const to = Math.min(tk.x.length, Math.round(tk.spec.use[1] * SR));
  const rateAt = pos => {
    if (!a) return r0;
    const fi = Math.min(tk.smooth.length - 1, Math.max(0, Math.round((pos - tk.size / 2) / tk.hop)));
    return r0 * (tk.smooth[fi] / tk.own) ** -a;
  };
  let buf = resample(tk.x, rateAt, { from, to, maxRate: r0 * 1.3 });
  // a soft start (2 ms) and end
  const na = Math.round(0.002 * SR);
  for (let i = 0; i < na && i < buf.length; i++) buf[i] *= i / na;
  if (seconds > 0 && buf.length > seconds * SR) {
    const n = Math.round(seconds * SR), nf = Math.round(fadeOut * SR);
    const cut = buf.slice(0, n);
    for (let i = 0; i < nf && i < n; i++) cut[n - 1 - i] *= (i / nf) ** 1.5;
    buf = cut;
  } else {
    const nf = Math.round(0.012 * SR);
    for (let i = 0; i < nf && i < buf.length; i++) buf[buf.length - 1 - i] *= i / nf;
  }
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < buf.length; i++) buf[i] /= peak;
  const out = { buf, onset: heardOnset(buf), target, own: tk.own, rate: r0, name, group: g };
  callCache.set(key, out);
  return out;
}
