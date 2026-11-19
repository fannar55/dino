// The chapter's recordings as instruments: each animal take (and her horn) moved onto a tone by resampling, as the game does
// (rate = tone / own pitch, in the octave nearest its own), segment by segment where a call has two pitches, so each part
// lands on the same tone; set on its beat by its measured onset. Pitches are the YIN medians of analyse-takes.mjs.
import { fileURLToPath } from 'node:url';
import { decode } from './io.mjs';
import { SR, resample, eq } from './dsp.mjs';
import { onsetOf } from './pitch.mjs';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
export const HLJOD = 'remake/assets/audio/kafli5/hljod/';

/** Each take: its group, its segments [from s, to s, own Hz] (null = no pitch, played as it is), and its licence. */
export const TAKES = {
  'grazers-3': { group: 'grazers', segs: [[0, 1.5, 182.3]], licence: 'CC0 1.0, "z-moo01.wav" by Zozzy (Freesound 59245)' },
  'grazers-2': { group: 'grazers', segs: [[0, 1.0, 181.0]], licence: 'ElevenLabs sound generation, made for this game' },
  'turtles-2': { group: 'turtles', segs: [[0, 0.405, 239], [0.405, 0.78, 274]], licence: 'ElevenLabs sound generation, made for this game' },
  'turtles-1': { group: 'turtles', segs: [[0, 0.23, 98.3], [0.23, 0.856, 78]], licence: 'ElevenLabs sound generation, made for this game' },
  'frogs-1': { group: 'frogs', segs: [[0, 0.6, 1145]], licence: 'ElevenLabs sound generation, made for this game' },
  'frogs-3': { group: 'frogs', segs: [[0, 0.088, 1086], [0.088, 0.165, 1158], [0.165, 0.245, 1188], [0.245, 0.319, 1245]], licence: 'ElevenLabs sound generation, made for this game' },
  'frogs-5': { group: 'frogs', segs: [[0, 0.42, 1916]], licence: 'CC0 1.0, "Frog.ogg" by egomassive (Freesound 536759)' },
  'lizards-2': { group: 'lizards', segs: [[0.09, 0.595, 2215]], licence: 'ElevenLabs sound generation, made for this game' },
  'flyers-1': { group: 'flyers', segs: [[0, 0.954, 2066]], licence: 'ElevenLabs sound generation, made for this game' },
  'flyers-3': { group: 'flyers', segs: [[0, 0.75, 1410]], licence: 'CC BY 4.0, "Curlew .wav" by Benboncan (Freesound 72892)' },
  'horn-1': { group: 'sloedla', segs: [[0, 2.75, 273.1]], licence: 'CC0 1.0, "Alpenhorn.aiff" by Danjocross (Freesound 507468)' },
};
/** The groups' tones, equal tempered, in the octave of middle C (rule 1 of the brief). */
export const TONE_HZ = { grazers: 349.228, turtles: 391.995, frogs: 440, lizards: 523.251, flyers: 587.33 };

const raw = new Map();
function source(name) {
  if (!raw.has(name)) raw.set(name, decode(`${ROOT}${HLJOD}${name}.mp3`)[0]);
  return raw.get(name);
}
/** The tone `toneHz` in the octave nearest `own` Hz (the game's takeRate). */
export function nearestOctave(own, toneHz) {
  return toneHz * 2 ** Math.round(Math.log2(own / toneHz));
}

const cache = new Map();
/**
 * Take `name` moved to `target` Hz (each segment resampled onto it, joined by 8 ms crossfades); with no `target`, onto its
 * group's tone in the octave nearest its own. Returns { x, onset (samples into x where the call is heard), hz, rates }.
 */
export function take(name, target = null) {
  const spec = TAKES[name];
  const key = `${name}@${target ?? 'tone'}`;
  if (cache.has(key)) return cache.get(key);
  const src = source(name);
  const hzOut = target ?? nearestOctave(spec.segs[0][2], TONE_HZ[spec.group]);
  const xf = Math.round(0.008 * SR);
  const parts = spec.segs.map(([a, b, own]) => {
    const s0 = Math.round(a * SR);
    const s1 = Math.min(src.length, Math.round(b * SR) + xf);
    const rate = hzOut / own;
    return { x: resample(src.subarray(s0, s1), rate), rate };
  });
  let total = 0;
  parts.forEach((p, i) => { total += p.x.length - (i < parts.length - 1 ? xf : 0); });
  const x = new Float32Array(total);
  let o = 0;
  parts.forEach((p, i) => {
    const first = i === 0;
    for (let k = 0; k < p.x.length && o + k < total; k++) {
      let g = 1;
      if (!first && k < xf) g = k / xf;
      if (i < parts.length - 1 && k >= p.x.length - xf) g = (p.x.length - k) / xf;
      x[o + k] += p.x[k] * g;
    }
    o += p.x.length - xf;
  });
  eq(x, [['hp', 60, 0.7], ['lp', 9000, 0.7]]);
  const onset = Math.round(onsetOf(x, 0.25) * SR);
  const out = { x, onset, hz: hzOut, rates: parts.map(p => p.rate) };
  cache.set(key, out);
  return out;
}

/** A call cut to `seconds` (a fade of `fade` s at its end), scaled by `gain`; the take's onset is returned with it. */
export function call(name, { target = null, seconds = null, fade = 0.06, gain = 1 } = {}) {
  const t = take(name, target);
  const n = seconds ? Math.min(t.x.length, t.onset + Math.round(seconds * SR)) : t.x.length;
  const x = new Float32Array(n);
  const f = Math.round(fade * SR);
  for (let i = 0; i < n; i++) {
    const g = seconds && i > n - f ? (n - i) / f : 1;
    x[i] = t.x[i] * g * gain;
  }
  return { x, onset: t.onset, hz: t.hz };
}
