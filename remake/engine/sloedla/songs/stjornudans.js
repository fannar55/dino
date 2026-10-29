// "Stjörnudans": disco-flavoured synth pop for the Star Festival, B-flat major, 116 a minute, about two minutes. Written as data for
// the game to play itself (song.js says how to read it). Slóeðla (a) sings the tune on her horn, Kambeðla (b) rings the hook on her
// plates, Þórseðla (c) booms the big drum; the band is a four-on-the-floor kick, claps, hats, an octave bass and a pad, with star
// layers (tier) that come in on a run of hits. The '!' notes are the child's: never closer than two beats, so a six-year-old can
// follow: in the verse Þórseðla on the first beat, Slóeðla on the third, Kambeðla answering at the end of each line; in the chorus
// Slóeðla on every first beat and her friends on the thirds. The last chorus goes up a whole step if the child is playing well.

const FOUR = 'x...x...x...x...';
const BACKBEAT = '....x.......x...';
const OFFBEAT = '..x...x...x...x.';
const SIXTEENTHS = 'oooooooooooooooo';

const chorus = {
  bars: 8,
  chords: 'IV V vi I',
  parts: [
    { inst: 'kick', steps: FOUR },
    { inst: 'clap', steps: BACKBEAT, when: '!calm' },
    { inst: 'snare', steps: BACKBEAT, vel: 0.7, last: '....x...x.x.xxxx' },
    { inst: 'ohat', steps: OFFBEAT, when: '!calm' },
    { inst: 'hat', steps: 'x.x.x.x.x.x.x.x.', vel: 0.6, when: 'big' },
    { inst: 'bass', line: 'R 8 R 8 R 8 R 8' },
    { inst: 'pad', vel: 0.9 },
    { inst: 'pluck', line: '1 2 3 2 1 2 3 2', tier: 1, vel: 0.8 },
    { inst: 'shaker', steps: SIXTEENTHS, tier: 2 },
    { inst: 'bell', line: '. . 3 . . . 2 .', tier: 2, vel: 0.8 },
    { inst: 'choir', tier: 3 },
    { inst: 'choir', when: 'big', vel: 0.6 },
    // Slóeðla: the hook, a step up each line, home to B-flat at the end
    { role: 'a', notes: '5! _ _ 4 3 _ . . | 6! _ _ 5 4 _ . . | 7! _ 6 _ 5 _ 4 _ | 9! _ _ _ 7 _ . . | 5! _ _ 4 3 _ . . | 6! _ _ 5 4 _ . . | 7! _ 6 _ 7 _ 9 _ | 7! _ _ _ _ _ . .' },
    // Kambeðla: a broken chord on the third beat of the odd bars
    { role: 'b', notes: '. . . . 3! 5 7 5 | . . . . . . . . | . . . . 5! 7 9 7 | . . . . . . . . | . . . . 3! 5 7 5 | . . . . . . . . | . . . . 5! 7 9 7 | . . . . . . . .' },
    // Þórseðla: a boom on every first beat, and the child's on the third of the even bars
    { role: 'c', notes: '3 . . . . . . . | 4 . . . 4! . 4 . | 5 . . . . . . . | 0 . . . 0! . 0 0 | 3 . . . . . . . | 4 . . . 4! . 4 . | 5 . . . . . . . | 0 . . . . . . .' },
  ],
};

export default {
  id: 'stjornudans',
  name: 'Stjörnudans',
  bpm: 116,
  root: 'Bb',
  scale: 'major',
  voices: { a: 'synthbrass', b: 'discopluck', c: 'syndrum' }, // disco (voices.js)
  form: ['intro', 'vers', 'vidlag', 'vers', 'vidlag', 'bru', 'lokavidlag', 'endir'],
  sections: {
    intro: {
      bars: 4,
      chords: 'I IV vi V',
      fixed: true,
      parts: [
        { inst: 'kick', steps: 'o...o...o...o...' },
        { inst: 'hat', steps: OFFBEAT, vel: 0.8 },
        { inst: 'bass', line: 'R _ _ _ . . R .' },
        { inst: 'pad', vel: 0.8 },
        { inst: 'pluck', line: '1 2 3 4 3 2 1 2', vel: 0.7 },
        { role: 'a', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | 1! _ _ _ . . . .' },
        { role: 'b', notes: '0 . 2 . 4 . 2 . | 3 . 5 . 7 . 5 . | 5 . 7 . 9 . 7 . | . . . . 4! . 6 .' },
        { role: 'c', notes: '. . . . . . . . | . . . . . . . . | 5! . . . . . . . | 4 . . . . . . .' },
      ],
    },
    vers: {
      bars: 8,
      chords: 'I vi IV V',
      parts: [
        { inst: 'kick', steps: FOUR, when: '!calm' },
        { inst: 'kick', steps: 'x.......x.......', when: 'calm' },
        { inst: 'clap', steps: BACKBEAT, when: '!calm' },
        { inst: 'hat', steps: OFFBEAT },
        { inst: 'ohat', steps: OFFBEAT, when: 'big' },
        { inst: 'bass', line: 'R . . R . . R .' },
        { inst: 'pad', vel: 0.7 },
        { inst: 'pluck', line: '1 . 3 . 4 . 3 .', tier: 1, vel: 0.8 },
        { inst: 'shaker', steps: SIXTEENTHS, tier: 2 },
        { inst: 'bell', line: '4 . 3 . 2 . 3 .', tier: 3, vel: 0.6 },
        { inst: 'pluck', line: '1 2 3 2 1 2 3 2', when: 'big', vel: 0.6 },
        // Slóeðla: a line in two halves, each starting on the third beat (D C B-flat ... D; E-flat D C ... C; F D F ... G F D; E-flat F G ... F)
        { role: 'a', notes: '. . . . 2! _ 1 0 | 2! _ _ _ . . . . | . . . . 3! _ 2 1 | 1 _ . . . . . . | . . . . 4! _ 2 4 | 5! _ 4 _ 2 _ . . | . . . . 3! _ 4 5 | 4 _ _ _ . . . .' },
        // Kambeðla: a little answer at the end of each half
        { role: 'b', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | 4! . 2 . 4! . 6 . | . . . . . . . . | . . . . . . . . | . . . . . . . . | 4! . 6 . 7 . . .' },
        // Þórseðla: the child's boom on the first beat of each odd bar, with an echo of it in the even ones
        { role: 'c', notes: '0! . . . . . . . | . . . . 0 . 0 . | 3! . . . . . . . | . . . . 4 . . . | 0! . . . . . . . | . . . . 5 . 5 . | 3! . . . . . . . | 4 . . . 4 . 4 4' },
      ],
    },
    vidlag: chorus,
    bru: {
      bars: 8,
      chords: 'vi IV I V',
      parts: [
        { inst: 'kick', steps: 'x.......x.......' },
        { inst: 'clap', steps: '........x.......', when: '!calm' },
        { inst: 'hat', steps: OFFBEAT, vel: 0.7 },
        { inst: 'snare', steps: '................', last: '..x.x.x.xxxxxxxx', vel: 0.8 },
        { inst: 'bass', line: 'R _ _ _ R _ _ _' },
        { inst: 'pad' },
        { inst: 'bell', line: '1 2 3 4 3 2 1 2', vel: 0.5 },
        { inst: 'choir', tier: 2, vel: 0.8 },
        { inst: 'shaker', steps: SIXTEENTHS, tier: 1 },
        // Slóeðla: long notes over the bridge, then her friends build it up
        { role: 'a', notes: '2! _ _ _ _ _ _ _ | 3! _ _ _ _ _ . . | 4! _ _ _ 2 _ . . | 1! _ _ _ _ _ _ _ | . . . . . . . . | 5! _ 4 _ . . . . | . . . . . . . . | 6! _ _ _ 4 _ 6 _' },
        { role: 'b', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | 5! 7 9 7 5 7 9 7 | . . . . . . . . | 0! 2 4 2 0 2 4 2 | . . . . . . . .' },
        { role: 'c', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . 5! . . . | . . . . 3! . . . | . . . . 0! . 0 . | 4 . 4 . 4! 4 4 4' },
      ],
    },
    lokavidlag: { ...chorus, lift: 2 },
    endir: {
      bars: 4,
      chords: 'IV V I I',
      fixed: true,
      parts: [
        { inst: 'kick', steps: FOUR, last: 'x...............' },
        { inst: 'clap', steps: BACKBEAT, last: '................' },
        { inst: 'ohat', steps: OFFBEAT, last: '................' },
        { inst: 'bass', line: 'R _ _ _ R _ _ _' },
        { inst: 'pad' },
        { inst: 'choir', tier: 1 },
        { inst: 'crash', steps: '................', last: 'x...............' },
        { role: 'a', notes: '5! _ _ _ 4 _ 3 _ | 6! _ _ _ . . . . | 7! _ _ _ _ _ _ _ | _ _ _ _ _ _ . .' },
        { role: 'b', notes: '. . . . . . . . | . . . . 4! 6 8 . | . . . . . . . . | . . . . . . . .' },
        { role: 'c', notes: '3 . . . . . . . | 4 . . . . . . . | 0 . . . 0! . . . | 0! . . . . . . .' },
      ],
    },
  },
};
