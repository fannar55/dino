// The chapter's recorded takes: decoded, measured on their steady part (never trusting sounds.json's hz), and resampled to a tone
// by rate = target / own pitch in the octave nearest their own (the game's takeRate rule), with a windowed-sinc resampler.
import { join } from 'node:path';
import { decode, SR } from './io.mjs';
import { steady } from './pitch.mjs';

/** Which takes sing in this song, and the YIN search range that suits each. */
export const TAKES = {
  grazers: [{ file: 'grazers-3.mp3', fmin: 80, fmax: 500 }, { file: 'grazers-2.mp3', fmin: 80, fmax: 500 }],
  turtles: [{ file: 'turtles-2.mp3', fmin: 120, fmax: 500 }],
  frogs: [{ file: 'frogs-1.mp3', fmin: 500, fmax: 3000 }, { file: 'frogs-3.mp3', fmin: 500, fmax: 3000 }, { file: 'frogs-5.mp3', fmin: 800, fmax: 3000 }],
  lizards: [{ file: 'lizards-1.mp3', fmin: 500, fmax: 3000 }], // lizards-2 is a chirp glide with ~17 ms of steady pitch
  flyers: [{ file: 'flyers-3.mp3', fmin: 600, fmax: 3000 }],
  horn: [{ file: 'horn-1.mp3', fmin: 150, fmax: 600 }],
};

const cache = new Map();

/** Load and measure one take: { file, x, hz, steadyFrom, steadyTo, onset, peak }. */
export function loadTake(dir, t) {
  if (cache.has(t.file)) return cache.get(t.file);
  const [x] = decode(join(dir, t.file));
  const s = steady(x, { fmin: t.fmin, fmax: t.fmax, hop: 256, win: 1024 });
  if (!s) throw new Error(`no steady pitch in ${t.file}`);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  let on = 0;
  while (on < x.length && Math.abs(x[on]) < peak * 0.12) on++;
  const take = { file: t.file, x, hz: s.hz, steadyFrom: s.from, steadyTo: s.to, clarity: s.clarity, onset: on, peak };
  cache.set(t.file, take);
  return take;
}

/** The game's rule: the rate that puts pitch `hz` on `tone` in the octave nearest its own. */
export function takeRate(hz, tone) {
  return (tone * 2 ** Math.round(Math.log2(hz / tone))) / hz;
}

// Kaiser-windowed sinc resampler.
function bessel0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 30; k++) {
    t *= (x / (2 * k)) ** 2;
    s += t;
  }
  return s;
}
const HALF = 24;
const BETA = 8;
const I0B = bessel0(BETA);
/** Resample x by `rate` (rate > 1 raises pitch and shortens). */
export function resample(x, rate) {
  const n = Math.floor(x.length / rate);
  const out = new Float32Array(n);
  const cut = Math.min(1, 1 / rate) * 0.97; // anti-alias when raising pitch
  const half = Math.ceil(HALF / cut);
  for (let i = 0; i < n; i++) {
    const p = i * rate;
    const c = Math.floor(p);
    let s = 0, wsum = 0;
    for (let k = c - half + 1; k <= c + half; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = p - k;
      const u = d / half;
      if (Math.abs(u) >= 1) continue;
      const w = bessel0(BETA * Math.sqrt(1 - u * u)) / I0B;
      const arg = Math.PI * d * cut;
      const sinc = arg === 0 ? 1 : Math.sin(arg) / arg;
      s += x[k] * sinc * cut * w;
      wsum += sinc * cut * w;
    }
    out[i] = s;
  }
  return out;
}

const shifted = new Map();
/** A take moved to `toneHz` (an exact octave of it is picked nearest the take's own pitch, then `octave` more). */
export function moved(take, toneHz, octave = 0) {
  const rate = takeRate(take.hz, toneHz) * 2 ** octave;
  const key = `${take.file}@${rate.toFixed(9)}`;
  if (!shifted.has(key)) {
    const y = resample(take.x, rate);
    shifted.set(key, {
      y,
      rate,
      hz: take.hz * rate,
      onset: take.onset / rate,
      steadyFrom: take.steadyFrom / rate,
      steadyTo: take.steadyTo / rate,
      file: take.file,
    });
  }
  return shifted.get(key);
}

export { SR };
