// The key of a song in Slóeðla's song game: its do as a frequency, and the notes of its scale (v2/format.js: a song's key is
// { root, scale }; root a note name in octave 3, 'Bb' is B-flat3, 233 Hz; scale 'major' (default), 'minor', 'dorian' or
// 'mixolydian').

const NAMES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/** The frequency of note name `root` in octave 3 (A4 = 440 Hz). */
export function rootHz(root = 'C') {
  const semis = NAMES[root];
  if (semis === undefined) throw new TypeError(`key.js: no note called ${root}`);
  return 440 * 2 ** ((semis - 9 - 12) / 12); // C4 is 9 semitones under A4, and octave 3 one more down
}

/** A function from scale step (0 do, negative below) to Hz, for `key` ({ root, scale }), `transpose` semitones up. */
export function pitchOf(key, transpose = 0) {
  const base = rootHz(key.root);
  const steps = SCALES[key.scale ?? 'major'];
  return (step, octave = 0) => {
    const n = Math.floor(step / 7);
    const i = ((step % 7) + 7) % 7;
    return base * 2 ** ((steps[i] + 12 * (n + octave) + transpose) / 12);
  };
}
