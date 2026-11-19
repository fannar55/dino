// The chapter's recorded calls, cut and moved to their tones. Each call is a recipe: which take, which part, its measured
// pitch there (measure-takes.mjs; sounds.json's hz is wrong for several), and how much of its glide to keep. The move is a
// resample by rate = target / own pitch, as the game's takeRate does; `flatten` also follows the take's pitch track so a
// glide lands on the tone (0 keeps the glide, 1 holds the tone).
import { join } from 'node:path';
import { decode } from './io.mjs';
import { track, median } from './pitch.mjs';
import { SR, secs, resample, resampleVar, biquad, fades, normalize } from './dsp.mjs';

const cache = new Map();
let HLJOD = null;
export function setHljod(dir) { HLJOD = dir; }
function load(file) {
  if (!cache.has(file)) cache.set(file, decode(join(HLJOD, file)).ch[0]);
  return cache.get(file);
}
const trackCache = new Map();
function pitchTrack(file, ref) {
  const key = `${file}@${ref}`;
  if (!trackCache.has(key)) {
    const x = load(file);
    const fr = track(x, SR, { size: 1024, hop: 128, fmin: ref / 1.9, fmax: ref * 1.9 });
    // keep clear frames near ref, median-smooth
    const raw = fr.map(f => (f.clarity > 0.5 && f.hz > ref / 1.6 && f.hz < ref * 1.6 ? f.hz : 0));
    const sm = raw.map((v, i) => {
      const w = raw.slice(Math.max(0, i - 3), i + 4).filter(Boolean);
      return w.length >= 3 ? median(w) : 0;
    });
    trackCache.set(key, { t: fr.map(f => f.t), hz: sm });
  }
  return trackCache.get(key);
}

/** The pitch the take has at source time t (s), from its track (0 where unclear). */
function pitchAt(tr, t) {
  const i = Math.max(0, Math.min(tr.t.length - 1, Math.round((t - tr.t[0]) / (128 / SR))));
  return tr.hz[i];
}

/**
 * Render one call. spec: { file, from, to, ref, flatten = 0 }; target Hz; opts: { dur (s, max out length), attack, release,
 * hp, lp }. Returns a Float32Array peak-normalised to 1.
 */
export function call(spec, target, opts = {}) {
  const x = load(spec.file);
  const a = secs(spec.from ?? 0), b = Math.min(x.length, secs(spec.to ?? x.length / SR));
  const seg = x.slice(a, b);
  const base = target / spec.ref;
  let y;
  if (spec.flatten) {
    const tr = pitchTrack(spec.file, spec.ref);
    const k = spec.flatten;
    // smooth the rate itself so it never steps
    let last = base;
    y = resampleVar(seg, t => {
      const p = pitchAt(tr, t + (spec.from ?? 0));
      const want = p ? base * (spec.ref / p) ** k : base;
      last += (want - last) * 0.02;
      return last;
    }, opts.dur ? secs(opts.dur) + secs(opts.release ?? 0.03) : Infinity);
  } else {
    y = resample(seg, base);
  }
  if (opts.dur) {
    const n = Math.min(y.length, secs(opts.dur));
    const rel = secs(opts.release ?? 0.03);
    const out = y.slice(0, Math.min(y.length, n + rel));
    for (let i = n; i < out.length; i++) out[i] *= Math.exp(-(i - n) / (rel / 3));
    y = out;
  }
  if (opts.hp) biquad(y, 'hp', opts.hp, 0.7);
  if (opts.lp) biquad(y, 'lp', opts.lp, 0.7);
  return fades(normalize(y), opts.attack ?? 0.004, opts.release ?? 0.03);
}

export function takeLength(file) { return load(file).length / SR; }
export function raw(file) { return load(file); }
