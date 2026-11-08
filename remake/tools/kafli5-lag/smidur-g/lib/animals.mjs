// The chapter's recordings as the song's singers: each animal take cut to its call, its pitch measured on the loud voiced part,
// moved onto its group's tone by the game's rule (the octave nearest its own pitch) and, where it glides, partly flattened by a
// pitch-following resample so it lands on the tone; her horn played note by note from the alphorn's steady part; the marimba
// moved to each tune note.
import path from 'node:path';
import { decodeMono, pitchTrack, takeRate, SR } from './takes.mjs';

/** Each take: the cut (s), how much of its glide to flatten (0 none .. 1 flat), and its loudness trim (dB). */
export const TAKES = {
  'grazers-3': { cut: [0.08, 1.45], flatten: 0.55 },
  'grazers-2': { cut: [0.0, 1.05], flatten: 0.3, trim: -1 },
  'turtles-2': { cut: [0.0, 0.42], flatten: 0.6 },
  'turtles-1': { cut: [0.22, 0.76], flatten: 0.5, trim: 2 },
  'frogs-5': { cut: [0.0, 0.42], flatten: 0.5 },
  'frogs-1': { cut: [0.0, 0.6], flatten: 0.6 },
  'frogs-2': { cut: [0.0, 0.45], flatten: 0.5, trim: -2 },
  'frogs-3': { cut: [0.0, 0.32], flatten: 0.7 },
  'lizards-1': { cut: [0.0, 0.6], flatten: 0.85 },
  'lizards-2': { cut: [0.0, 0.42], flatten: 0.75, trim: -1 },
  'lizards-3': { cut: [0.0, 0.27], flatten: 0.7 },
  'flyers-3': { cut: [0.08, 0.74], flatten: 0.6 },
  'flyers-1': { cut: [0.0, 0.8], flatten: 0.7, trim: -2 },
  'flyers-2': { cut: [0.06, 0.8], flatten: 0.6, trim: -1 },
};
/** The take each group sings its tune notes with (the clearest pitch). */
export const MAIN = { grazers: 'grazers-3', turtles: 'turtles-2', frogs: 'frogs-5', lizards: 'lizards-2', flyers: 'flyers-3' };

const medianBy = (items, value, weight) => {
  const s = [...items].sort((a, b) => value(a) - value(b));
  const total = s.reduce((t, x) => t + weight(x), 0);
  let acc = 0;
  for (const x of s) { acc += weight(x); if (acc >= total / 2) return value(x); }
  return value(s[s.length - 1]);
};

/** The loudness-weighted median pitch of the clean voiced frames: what the ear takes as the call's pitch. */
export function centrePitch(x, { fmin = 150, fmax = 3400 } = {}) {
  const fr = pitchTrack(x, { fmin, fmax, size: 1024, hop: 128 });
  const peak = Math.max(...fr.map(f => f.rms), 1e-9);
  const ok = fr.filter(f => f.hz > 0 && f.ap < 0.3 && f.rms > peak * 0.2);
  if (ok.length < 4) return { hz: null, frames: fr };
  return { hz: medianBy(ok, f => f.hz, f => f.rms * f.rms), frames: fr, voiced: ok.length / fr.length };
}

/** Resample following the input position: rateAtIn(pos in input samples) gives the read rate there. */
function resampleFollow(x, rateAtIn, maxOut = Infinity) {
  const out = [];
  let pos = 0;
  const half = 10;
  while (pos < x.length - 1 && out.length < maxOut) {
    const rate = rateAtIn(pos);
    const cutoff = Math.min(1, 1 / rate) * 0.94;
    const base = Math.floor(pos);
    let s = 0;
    let w = 0;
    for (let k = base - half + 1; k <= base + half; k++) {
      if (k < 0 || k >= x.length) continue;
      const t = pos - k;
      const arg = Math.PI * t * cutoff;
      const c = (t === 0 ? 1 : Math.sin(arg) / arg) * (0.5 + 0.5 * Math.cos((Math.PI * t) / half));
      s += x[k] * c;
      w += c;
    }
    out.push(w ? s / w : 0);
    pos += rate;
  }
  return Float32Array.from(out);
}

const rmsOf = x => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));

export function loadSingers(hljod) {
  const cache = new Map();
  const raw = new Map();
  const get = file => {
    if (!raw.has(file)) raw.set(file, decodeMono(path.join(hljod, file)));
    return raw.get(file);
  };
  const info = {};

  /** One take moved onto `toneHz`'s pitch class: a mono call, its measured pitch before and after, its rate. */
  function take(name, toneHz) {
    const key = `${name}@${toneHz.toFixed(2)}`;
    if (cache.has(key)) return cache.get(key);
    const cfg = TAKES[name];
    const all = get(`${name}.mp3`);
    const x = all.slice(Math.round(cfg.cut[0] * SR), Math.round(cfg.cut[1] * SR));
    const low = /grazers|turtles/.test(name);
    const fmin = low ? 55 : 300;
    const c = centrePitch(x, { fmin, fmax: 3400 });
    const ref = c.hz;
    const R0 = takeRate(ref, toneHz);
    // the take's pitch curve (held through unvoiced frames, smoothed), as deviation from its centre
    const hop = 128;
    const frames = pitchTrack(x, { fmin, fmax: 3400, size: 1024, hop });
    const peak = Math.max(...frames.map(f => f.rms), 1e-9);
    const dev = new Float64Array(frames.length).fill(1);
    let last = 1;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (f.hz > 0 && f.ap < 0.35 && f.rms > peak * 0.05) {
        let d = f.hz / ref;
        // octave slips of the tracker: fold back near the centre
        while (d > 1.6) d /= 2;
        while (d < 0.62) d *= 2;
        last = d;
      }
      dev[i] = last;
    }
    // smooth the curve (about 25 ms)
    const sm = new Float64Array(dev.length);
    for (let i = 0; i < dev.length; i++) {
      let s = 0; let n = 0;
      for (let j = i - 4; j <= i + 4; j++) if (j >= 0 && j < dev.length) { s += Math.log(dev[j]); n++; }
      sm[i] = Math.exp(s / n);
    }
    const a = cfg.flatten;
    const rateAtIn = pos => {
      const fi = (pos - 512) / hop;
      const i0 = Math.max(0, Math.min(sm.length - 1, Math.floor(fi)));
      const i1 = Math.min(sm.length - 1, i0 + 1);
      const fr = Math.max(0, Math.min(1, fi - i0));
      const d = sm.length ? sm[i0] * (1 - fr) + sm[i1] * fr : 1;
      return R0 * d ** -a;
    };
    let y = resampleFollow(x, rateAtIn);
    // edges
    const fi = Math.round(0.004 * SR);
    const fo = Math.round(0.03 * SR);
    for (let i = 0; i < fi && i < y.length; i++) y[i] *= i / fi;
    for (let i = 0; i < fo && i < y.length; i++) y[y.length - 1 - i] *= i / fo;
    // loudness: the loud part's RMS to -18 dBFS, then the take's trim
    const r = rmsOf(y.filter((v, i) => i % 4 === 0 && Math.abs(v) > 0.02)) || rmsOf(y);
    const g = (10 ** (-18 / 20) / Math.max(r, 1e-6)) * 10 ** ((cfg.trim ?? 0) / 20);
    for (let i = 0; i < y.length; i++) y[i] *= g;
    const after = centrePitch(y, { fmin: Math.max(55, fmin * R0 * 0.6), fmax: 3800 });
    const target = toneHz * 2 ** Math.round(Math.log2(ref / toneHz));
    const res = {
      y, ref, rate: R0, target, after: after.hz,
      cents: after.hz ? 1200 * Math.log2(after.hz / target) : null,
    };
    info[key] = { take: name, tone: toneHz, own: ref, rate: R0, target, landed: after.hz, cents: res.cents };
    cache.set(key, res);
    return res;
  }

  // her horn: the alphorn's steady part, note by note
  const hornRaw = get('horn-1.mp3');
  const hornPitch = centrePitch(hornRaw.slice(Math.round(0.2 * SR), Math.round(2.6 * SR)), { fmin: 100, fmax: 900 }).hz;
  /**
   * A horn note at `hz` held `dur` s: read from the steady part, the pitch following `cents(t)` (scoops, vibrato, doits),
   * a soft start (or the take's own swell for a long note), a short release.
   */
  function horn(hz, dur, { cents = () => 0, soft = false } = {}) {
    const R = hz / hornPitch;
    const startIn = soft ? 0.1 : 0.15;
    const x = hornRaw.subarray(Math.round(startIn * SR));
    const rel = 0.07;
    const n = Math.round((dur + rel) * SR);
    let outPos = 0;
    const y = resampleFollow(x, () => R * 2 ** (cents(outPos++ / SR) / 1200), n);
    const fin = Math.round((soft ? 0.03 : 0.012) * SR);
    for (let i = 0; i < y.length; i++) {
      const t = i / SR;
      let e = Math.min(1, i / fin);
      if (t > dur) e *= Math.max(0, 1 - (t - dur) / rel) ** 1.5;
      y[i] *= e;
    }
    return y;
  }

  // the marimba under the tune
  const mar = get('marimba.mp3');
  const marPitch = centrePitch(mar.slice(0, Math.round(0.6 * SR)), { fmin: 200, fmax: 1200 }).hz;
  function marimba(hz, dur) {
    const R = hz / marPitch;
    const n = Math.round((dur + 0.35) * SR);
    const y = resampleFollow(mar, () => R, n);
    for (let i = 0; i < y.length; i++) {
      const t = i / SR;
      if (t > dur) y[i] *= Math.max(0, 1 - (t - dur) / 0.35);
    }
    return y;
  }

  return { take, horn, marimba, info, hornPitch: () => hornPitch, marimbaPitch: () => marPitch };
}
