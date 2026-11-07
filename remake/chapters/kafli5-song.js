// Slóeðla's song as data (docs/superpowers/specs/2026-11-07-kafli-5-bod-til-sloedlu-design.md, section 5): the five groups of the
// choir each sing one tone of the song's major pentatonic, low to high (degrees 1, 2, 3, 5 and 6: do re mi sol la), and her song is
// 14 notes of them in four phrases of 2, 3, 4 and 5 notes, ending on do.
//
// The melody is chunk 1's draft (the owner hears it in the chunk's video): sol mi / re mi do / la sol mi sol / la sol mi re do, a
// call and its answer, a climb and the way home. The tempo and the key are placeholders until Task 7 measures her song's backing;
// the tones are tuned just (the ratios 1, 9/8, 5/4, 3/2, 5/3 over the root), so the five sing clean together.
//
// Pure data and small pure helpers; the choir (kafli5-choir.js) and the sounds (engine/audio/choir-sounds.js) read it.
import { beatAt } from '../engine/beat.js';

/** The choir's groups, low to high. */
export const GROUPS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];
/** Each group's degree of the major pentatonic. */
export const TONES = { grazers: 1, turtles: 2, frogs: 3, lizards: 5, flyers: 6 };
const RATIO = { 1: 1, 2: 9 / 8, 3: 5 / 4, 5: 3 / 2, 6: 5 / 3 };

/** Her song: four phrases of group ids, 2, 3, 4 and 5 notes. No note is the one before it. */
export const MELODY = [
  ['lizards', 'frogs'], // sol mi
  ['turtles', 'frogs', 'grazers'], // re mi do
  ['flyers', 'lizards', 'frogs', 'lizards'], // la sol mi sol
  ['flyers', 'lizards', 'frogs', 'turtles', 'grazers'], // la sol mi re do
];

/** Beats a minute and where beat 0 falls (s), until Task 7 measures the song. */
export const TEMPO = { bpm: 84, offset: 0 };
/** The song's key: its root's name and the tuning of the A over middle C. */
export const KEY = { root: 'F', a4: 440 };
/** The stem layers that join after phrases 1 to 4 (Task 7 names the real stems). */
export const PHRASE_LAYERS = [['pad'], ['bass'], ['beat'], ['lead']];

// Semitones from A to each note in the octave of middle C (C4 to B4), sharps and flats too.
const FROM_A = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
function rootHz({ root, a4 }) {
  const name = String(root).trim();
  const letter = name[0]?.toUpperCase();
  if (!Object.hasOwn(FROM_A, letter)) throw new TypeError(`kafli5-song: no key "${root}"`);
  const shift = [...name.slice(1)].reduce((sum, mark) => sum + (mark === '#' ? 1 : mark === 'b' ? -1 : 0), 0);
  return a4 * 2 ** ((FROM_A[letter] + shift) / 12);
}

/** The pitch (Hz) of `group`'s tone in `key`, `octave` octaves up (or down) from the octave of middle C, where a child sings. */
export function toneHz(group, key = KEY, octave = 0) {
  if (!Object.hasOwn(TONES, group)) throw new TypeError(`kafli5-song: no group "${group}"`);
  return rootHz(key) * RATIO[TONES[group]] * 2 ** octave;
}

/** The time (s) of the first beat of `tempo` at or after `time`: a tap in the free play sings there. */
export function nextBeat(time, tempo = TEMPO) {
  const grid = { bpm: tempo.bpm, beatOffset: tempo.offset ?? 0 };
  const { index, phase } = beatAt(time, grid);
  const beat = 60 / tempo.bpm;
  const on = grid.beatOffset + index * beat;
  // a hair over a beat (the clock's sums) is that beat
  return phase < 1e-9 || time - on < 1e-9 ? on : on + beat;
}
