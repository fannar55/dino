// "Lúðrapartí": the song contest's second ElevenLabs entry (2026-10-29), a joyful brass band street party with ska guitar, a tuba-ish
// bass, cowbell and tambourine, made with ElevenLabs Music (assets/audio/sloedla/el-ludrar.mp3, tools/sloedla-music.mjs preset
// `ludrar`; 116.001 a minute, steady within 0.9 ms). F major was asked for; the model played in C. The bass stem (the side notes'
// bass-roots.mjs) gives the chords two bars at a time: E D G C in the verses and the first choruses, D A G C in the second verse
// and the last chorus, E A G C in the bridge, G C in the intro. So the song is in C, its sections carry those chords (the bed
// plays them), and every part is C major's pentatonic (C D E G A: steps 0 1 2 4 5), chosen bar by bar to sit on the chord.
// Stems, each a dinosaur's: the drums Þórseðla's; the bass and the ska guitar Kambeðla's; "other" (the horns) Slóeðla's, her
// crest being a horn; the quiet piano is the skeleton's. No key change (the recording cannot change key).

const STAR1 = { inst: 'shaker', steps: 'oooooooooooooooo', tier: 1 };
const STAR2 = { inst: 'bell', line: '1 2 3 2 1 2 3 2', tier: 2, vel: 0.7 };
const STAR3 = { inst: 'choir', tier: 3, vel: 0.8 };
const BED = { inst: 'pad', vel: 0.4 }; // the skeleton's bed: the bar's chord, held

const EDGC = 'iii iii ii ii/V V V I I'; // the verses and the first choruses
const DAGC = 'ii ii vi vi/V V V I I'; // the second verse and the last chorus
const EAGC = 'iii iii vi vi/V V V I I'; // the bridge

const chorusOver = (chords, a, b, c) => ({ bars: 8, chords, parts: [BED, STAR1, STAR2, STAR3, { inst: 'choir', when: 'big', vel: 0.5 }, { role: 'a', notes: a }, { role: 'b', notes: b }, { role: 'c', notes: c }] });

export default {
  id: 'keppni-el2',
  name: 'Lúðrapartí',
  bpm: 116.001,
  root: 'C',
  scale: 'major',
  voices: { a: 'brass', b: 'organ', c: 'rocktom' },
  backing: {
    beatOffset: 0.0288,
    gain: 0.55,
    stems: [
      { src: 'audio/sloedla/el-ludrar-drums.mp3', gate: 'c' },
      { src: 'audio/sloedla/el-ludrar-bass.mp3', gate: 'b' },
      { src: 'audio/sloedla/el-ludrar-guitar.mp3', gate: 'b', gain: 1.3 },
      { src: 'audio/sloedla/el-ludrar-other.mp3', gate: 'a' },
      { src: 'audio/sloedla/el-ludrar-piano.mp3', gain: 1.5 },
    ],
  },
  form: ['intro', 'vers', 'vidlag', 'vers2', 'vidlag', 'bru', 'lokavidlag', 'endir'],
  sections: {
    intro: {
      bars: 4,
      chords: 'V V I I',
      fixed: true,
      parts: [
        BED,
        { role: 'a', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | 4! _ _ _ 2 _ . .' },
        { role: 'b', notes: '4 . 5 . 8 . 5 . | 4 . 5 . 8 . 5 . | . . . . 7! . 5 . | . . . . . . . .' },
        { role: 'c', notes: '. . . . . . . . | . . . . . . . . | 0! . . . . . . . | . . . . . . . .' },
      ],
    },
    vers: {
      bars: 8,
      chords: EDGC,
      parts: [
        BED, STAR1, STAR2, STAR3,
        { role: 'a', notes: '. . . . 2! _ 4 2 | 4! _ _ _ . . . . | . . . . 5! _ 4 1 | 1 _ . . . . . . | . . . . 4! _ 5 8 | 8! _ 5 _ 4 _ . . | . . . . 7! _ 5 4 | 2 _ _ _ . . . .' },
        { role: 'b', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | 1! . 2 . 4! . 5 . | . . . . . . . . | . . . . . . . . | . . . . . . . . | 0! . 2 . 4 . . .' },
        { role: 'c', notes: '2! . . . . . . . | . . . . 2 . 2 . | 1! . . . . . . . | . . . . 4 . . . | 4! . . . . . . . | . . . . 4 . 4 . | 0! . . . . . . . | 0 . . . 0 . 0 0' },
      ],
    },
    vidlag: chorusOver(EDGC,
      '9! _ _ 8 4 _ . . | 4! _ _ 2 4 _ . . | 5! _ 4 _ 1 _ 4 _ | 1! _ _ _ 4 _ . . | 8! _ _ 5 4 _ . . | 9! _ _ 8 5 _ . . | 7! _ 9 _ 8 _ 7 _ | 7! _ _ _ _ _ . .',
      '. . . . 2! 4 5 4 | . . . . . . . . | . . . . 1! 2 5 2 | . . . . . . . . | . . . . 4! 5 8 5 | . . . . . . . . | . . . . 0! 2 4 2 | . . . . . . . .',
      '2 . . . . . . . | 2 . . . 2! . 2 . | 1 . . . . . . . | 1 . . . 4! . 4 4 | 4 . . . . . . . | 4 . . . 4! . 4 . | 0 . . . . . . . | 0 . . . . . . .'),
    vers2: {
      bars: 8,
      chords: DAGC,
      parts: [
        BED, STAR1, STAR2, STAR3,
        { role: 'a', notes: '. . . . 1! _ 2 1 | 5! _ _ _ . . . . | . . . . 5! _ 7 5 | 2 _ . . . . . . | . . . . 4! _ 5 8 | 8! _ 5 _ 4 _ . . | . . . . 7! _ 5 4 | 2 _ _ _ . . . .' },
        { role: 'b', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | 5! . 7 . 4! . 5 . | . . . . . . . . | . . . . . . . . | . . . . . . . . | 0! . 2 . 4 . . .' },
        { role: 'c', notes: '1! . . . . . . . | . . . . 1 . 1 . | 5! . . . . . . . | . . . . 4 . . . | 4! . . . . . . . | . . . . 4 . 4 . | 0! . . . . . . . | 0 . . . 0 . 0 0' },
      ],
    },
    bru: {
      bars: 8,
      chords: EAGC,
      parts: [
        BED, STAR1, STAR2, STAR3,
        { role: 'a', notes: '2! _ _ _ _ _ _ _ | 4! _ _ _ _ _ . . | 5! _ _ _ 7 _ . . | 5! _ _ _ _ _ _ _ | . . . . . . . . | 8! _ 5 _ . . . . | . . . . . . . . | 7! _ _ _ 9 _ 7 _' },
        { role: 'b', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | 4! 5 8 5 4 5 8 5 | . . . . . . . . | 0! 2 4 2 0 2 4 2 | . . . . . . . .' },
        { role: 'c', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . 4! . . . | . . . . 4! . . . | . . . . 0! . 0 . | 0 . 0 . 0! 1 2 4' },
      ],
    },
    lokavidlag: chorusOver(DAGC,
      '8! _ _ 5 4 _ . . | 5! _ _ 4 1 _ . . | 5! _ 7 _ 9 _ 7 _ | 5! _ _ _ 4 _ . . | 8! _ _ 5 4 _ . . | 9! _ _ 8 5 _ . . | 7! _ 9 _ 8 _ 7 _ | 7! _ _ _ _ _ . .',
      '. . . . 1! 2 5 2 | . . . . . . . . | . . . . 5! 7 9 7 | . . . . . . . . | . . . . 4! 5 8 5 | . . . . . . . . | . . . . 0! 2 4 2 | . . . . . . . .',
      '1 . . . . . . . | 1 . . . 1! . 1 . | 5 . . . . . . . | 5 . . . 4! . 4 4 | 4 . . . . . . . | 4 . . . 4! . 4 . | 0 . . . . . . . | 0 . . . . . . .'),
    endir: {
      bars: 4,
      chords: 'iii iii ii ii/V',
      fixed: true,
      parts: [
        BED, STAR3,
        { role: 'a', notes: '9! _ _ _ 8 _ 4 _ | 4! _ _ _ . . . . | 5! _ _ _ _ _ _ _ | _ _ _ _ _ _ . .' },
        { role: 'b', notes: '. . . . . . . . | . . . . 2! 4 9 . | . . . . . . . . | . . . . . . . .' },
        { role: 'c', notes: '2 . . . . . . . | 2 . . . . . . . | 1 . . . 1! . . . | 4! . . . . . . .' },
      ],
    },
  },
};
