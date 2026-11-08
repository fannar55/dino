// The chapter's recorded animals and her horn, put on their tones: each take is cut, its pitch measured over the part that is
// used (YIN median), moved to the octave of its tone nearest its own pitch (as the game's takeRate does, but on the measured
// pitch of the cut), and its onset found so the call lands exactly on its beat.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SR, decodeMono, resample, medianPitch, cents } from './dsp.mjs';

export const HLJOD = fileURLToPath(new URL('../../../assets/audio/kafli5/hljod/', import.meta.url));
const SOUNDS = JSON.parse(readFileSync(HLJOD + 'sounds.json', 'utf8')).files;
/** Each group's tone (F major pentatonic, equal temperament) in the octave of middle C. */
export const TONE = { grazers: 349.228, turtles: 391.995, frogs: 440, lizards: 523.251, flyers: 587.330 };

// The takes used, and the part of each (s). Short ones serve quick notes, long ones held notes.
export const TAKES = {
  grazers: { short: { file: 'grazers-3.mp3', cut: [0.12, 1.0] }, long: { file: 'grazers-3.mp3', cut: [0.07, 1.5] } },
  turtles: { short: { file: 'turtles-2.mp3', cut: [0.02, 0.44] }, long: { file: 'turtles-2.mp3', cut: [0.02, 0.44] } },
  frogs: { short: { file: 'frogs-5.mp3', cut: [0, 0.42] }, long: { file: 'frogs-1.mp3', cut: [0, 0.6] } },
  lizards: { short: { file: 'lizards-1.mp3', cut: [0, 0.36] }, long: { file: 'lizards-1.mp3', cut: [0, 0.36] } },
  flyers: { short: { file: 'flyers-2.mp3', cut: [0.05, 0.5] }, long: { file: 'flyers-1.mp3', cut: [0, 0.85] } },
};
export const HORN = { file: 'horn-1.mp3', cut: [0.05, 2.75] };

const cache = new Map();
function raw(file) {
  if (!cache.has(file)) cache.set(file, decodeMono(HLJOD + file));
  return cache.get(file);
}
function cutOf(file, [a, b]) {
  const x = raw(file);
  const y = x.slice(Math.round(a * SR), Math.min(x.length, Math.round(b * SR)));
  // 4 ms in, 25 ms out, so a cut never clicks
  const fi = Math.round(0.004 * SR), fo = Math.round(0.025 * SR);
  for (let i = 0; i < fi && i < y.length; i++) y[i] *= i / fi;
  for (let i = 0; i < fo && i < y.length; i++) y[y.length - 1 - i] *= i / fo;
  return y;
}
/** The first sample where the 10 ms envelope reaches a quarter of its peak: where the ear hears the call begin. */
export function onsetOf(y) {
  const w = 441; const env = [];
  for (let i = 0; i + w <= y.length; i += 110) { let s = 0; for (let j = 0; j < w; j++) s += y[i + j] * y[i + j]; env.push([i, Math.sqrt(s / w)]); }
  let pk = 0; for (const [, v] of env) pk = Math.max(pk, v);
  const hit = env.find(([, v]) => v >= pk * 0.25);
  return hit ? Math.round(hit[0] + w / 2) : 0;
}
const prepared = new Map();
/**
 * A take put on a pitch: `target` Hz (its octave is chosen nearest the take's own pitch unless `exact`). Returns
 * { y (mono), onset (samples), rate, own (Hz measured), hz (its new pitch) }.
 */
export function onTone(take, target, { exact = false, heard = null } = {}) {
  const key = `${take.file}|${take.cut}|${target}|${exact}|${heard}`;
  if (prepared.has(key)) return prepared.get(key);
  const listed = SOUNDS[take.file]?.hz;
  const y0 = cutOf(take.file, take.cut);
  // the pitch of the part that is heard: a short note hears only the start of a gliding call
  const o0 = onsetOf(y0);
  const to = heard ? Math.min(y0.length, o0 + Math.round(heard * SR)) : y0.length;
  let p = medianPitch(y0, o0, to, listed / 1.8, listed * 1.8, 0.6);
  if (!p.hz) p = medianPitch(y0, 0, y0.length, listed / 1.8, listed * 1.8, 0.6);
  const own = p.hz || listed;
  const t = exact ? target : target * 2 ** Math.round(Math.log2(own / target));
  const rate = t / own;
  const y = resample(y0, rate);
  let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v));
  for (let i = 0; i < y.length; i++) y[i] /= pk || 1;
  const out = { y, onset: onsetOf(y), rate, own, hz: t, file: take.file };
  prepared.set(key, out);
  return out;
}
/** A group's call on its tone: `long` picks its held take; `heard` (s) is how much of it the note lets through. */
export function call(group, { long = false, heard = null } = {}) {
  return onTone(TAKES[group][long ? 'long' : 'short'], TONE[group], { heard: heard == null ? null : Math.round(heard * 20) / 20 });
}
/** Her horn on `target` Hz exactly (the alphorn take, rate = target / its pitch). */
export function horn(target) {
  return onTone(HORN, target, { exact: true });
}
/** A recording's licence, as sounds.json names it. */
export function licence(file) {
  const s = SOUNDS[file]?.source ?? {};
  // a CC BY recording names its title, author and page, as the credit asks
  return /BY/.test(s.licence ?? '') ? `${s.licence}: "${s.name}" by ${s.author}, ${s.page}` : (s.licence ?? 'unknown');
}
/** Measures a rendered call: its median pitch against `target` (cents, octave-free). */
export function pitchCheck(y, target, from = 0, to = y.length) {
  const p = medianPitch(y, from, to, 60, 4000, 0.6);
  if (!p.hz) return { hz: 0, cents: NaN };
  const c = cents(p.hz, target); const oct = Math.round(c / 1200);
  return { hz: p.hz, cents: c - oct * 1200, octave: oct, frames: p.frames };
}
