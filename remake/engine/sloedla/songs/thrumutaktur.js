// "Þrumutaktur" (Thunder Beat): Þórseðla's song, a stomping arena-rock funk groove in E dorian, 104 a minute, about two minutes
// ten. Written as data for the game to play itself (song.js says how to read it). The band is a stomp-stomp-clap kick and claps,
// a strutting octave bass, a pad and, as the child plays well, plucks, shaker, bells and a choir (tier). Þórseðla (c) booms the big
// drum on the strong beats and fills the ends of lines; Slóeðla (a) shouts a short hook on a horn section (a leap up to the root, then
// G and back: "Þrum-ur-takt-ur!"); Kambeðla (b) plays a funky clavinet riff, three sixteenths apart, that answers the horns.
//
// The '!' notes are the child's, never closer than two beats and always on a first or a third beat, so a six-year-old can follow:
//   intro   Þórseðla on the third bar, Slóeðla on the last
//   verse   a boom, then Slóeðla lands on the next bar's first beat and Kambeðla answers two beats later (boom, horns, clavinet)
//   chorus  two a bar: booms on the first beats, the hook on the third beats, the clavinet answering at the ends of the lines
//   bridge  long notes, one every four beats, and a short run of three at the end that builds into the last chorus
//   ending  boom, horns, clavinet, and the last boom
// When a section comes calm only the first-beat notes are left (four beats apart). The last chorus goes up a whole step (F-sharp
// dorian) if the child is playing well.

const L = (...bars) => bars.join(' | ');

const REST = '................';
const BACKBEAT = '....x.......x...'; // clap on the 2nd and 4th beats
const CLAP3 = '........x.......'; // the clap of stomp-stomp-clap
const STOMP = 'x...x...........'; // stomp, stomp
const OFFBEAT = '..x...x...x...x.';
const EIGHTHS = 'x.x.x.x.x.x.x.x.';
const SHAKE = 'xoooxoooxoooxooo';
const VERSE_KICK = 'x.......x.....x.';
const CHORUS_KICK = 'x.....x.x.....x.';

// The chorus, played three times (the last a step higher when it is big). Chords: Em G D A, Em G D A-Bm.
const chorus = {
  bars: 8,
  chords: 'i iii vii iv i iii vii iv/v',
  parts: [
    { inst: 'kick', steps: CHORUS_KICK },
    { inst: 'clap', steps: BACKBEAT, when: '!calm' },
    { inst: 'snare', steps: BACKBEAT, vel: 0.7, last: '....x...o.o.xxxx' },
    { inst: 'ohat', steps: OFFBEAT, when: '!calm' },
    { inst: 'hat', steps: EIGHTHS, vel: 0.5, when: 'big' },
    { inst: 'crash', steps: L('x...............', REST, REST, REST), vel: 0.6, when: '!calm' },
    // the bass locks with the kick, jumps the octave and picks up into the next bar
    { inst: 'bass', line: L('R . . R 8 . . 7', 'R . . R 8 . . 5', 'R . . R 8 . . 5', 'R . . R 8 . . 7', 'R . . R 8 . . 7', 'R . . R 8 . . 5', 'R . . R 8 . . 5', 'R . . R R . 5 7') },
    { inst: 'pad', vel: 0.85 },
    { inst: 'pluck', line: '1 . 3 2 1 . 3 2', tier: 1, vel: 0.8 },
    { inst: 'shaker', steps: SHAKE, tier: 2 },
    { inst: 'bell', line: '. . 3 . . . 2 .', tier: 2, vel: 0.8 },
    { inst: 'choir', tier: 3 },
    { inst: 'choir', when: 'big', vel: 0.6 },
    { inst: 'pluck', line: '. 1 . 1 . 3 . 3', when: 'big', vel: 0.5 },
    // Slóeðla: the hook. A leap up to the root, a shout on the third beat (E, F-sharp, D, E...), a step up to G and home; the
    // even bars answer with a falling triad; the seventh bar shouts on the first beat; the last holds E, then D and B home
    { role: 'a', notes: L('. . . 4 7! _ 9 7', '6 _ 4 _ 2 _ . .', '. . . 3 6! _ 8 6', '. . . 5 7! _ 9 7', '. . . 4 7! _ 9 7', '6 _ 4 _ 2 _ 4 .', '8! _ _ 8 . 6 . 8', '7 _ _ _ 6 _ 4 .') },
    // Kambeðla: a figure every three sixteenths (so it swings against the beat), her notes on the third beats of the G bars and on
    // the first beats of the A bars; the last bar runs up the A chord and then the B minor
    { role: 'b', unit: 16, notes: L(
      '. . 0 . . 2 . . 4 . . 2 . . 0 .',
      '. . 2 . . 6 . . 4! . . 6 . . 9 .',
      '. . 1 . . 3 . . 6 . . 3 . . 1 .',
      '5! . . 7 . . 5 . . 3 . . 5 . . .',
      '. . 0 . . 2 . . 4 . . 2 . . 0 .',
      '. . 2 . . 6 . . 4! . . 6 . . 9 .',
      '. . 1 . . 3 . . 6 . . 8 . . 6 .',
      '5! . . 7 . . 9 . . 4 . . 6 . . 8') },
    // Þórseðla: a boom on every first beat (E, G, A, A: the key's low notes), the third beat too, and a fill at the end of each line
    { role: 'c', unit: 16, vel: 0.9, notes: L(
      '0! . . . . . . . 0 . . . 0 . . .',
      '2! . . . . . . . 2 . . . . . 2 .',
      '3! . . . . . . . 3 . . . . . 3 .',
      '3 . . . . . 3 . 3 . . . 3 . 4 5',
      '0! . . . . . . . 0 . . . 0 . . .',
      '2! . . . . . . . 2 . . . . . 2 .',
      '3 . . . . . . . 3! . . . . . 3 .',
      '3 . . . . . 3 . 4 . . . 4 . 4 4') },
  ],
};

export default {
  id: 'thrumutaktur',
  name: 'Þrumutaktur',
  bpm: 104,
  root: 'E',
  scale: 'dorian',
  voices: { a: 'brass', b: 'clav', c: 'rocktom' }, // rock funk (voices.js)
  form: ['intro', 'vers', 'vidlag', 'vers', 'vidlag', 'bru', 'lokavidlag', 'endir'],
  sections: {
    // Four bars: stomp-stomp-clap alone with a crash, then the groove arrives. Chords: Em Em A Bm.
    intro: {
      bars: 4,
      chords: 'i i iv v',
      fixed: true,
      parts: [
        { inst: 'crash', steps: L('x...............', REST, REST, REST), vel: 0.8 },
        { inst: 'kick', steps: L(STOMP, STOMP, 'x...x...x.......', 'x...x...x...x...') },
        { inst: 'clap', steps: L(CLAP3, CLAP3, BACKBEAT, '....x...........') },
        { inst: 'snare', steps: L(REST, REST, REST, '........o.o.xxxx') },
        { inst: 'hat', steps: L(REST, REST, EIGHTHS, EIGHTHS), vel: 0.6 },
        { inst: 'bass', line: L('. . . . . . . .', 'R _ _ _ . . 5 .', 'R . . R 8 . . 7', 'R . . R 8 . . 7') },
        { inst: 'pad', vel: 0.6 },
        { inst: 'pluck', line: L('. . . . . . . .', '. . . . . . . .', '1 . 3 . 5 . 3 .', '1 . 3 . 5 . 3 2'), vel: 0.6 },
        // Slóeðla's first shout is on the last bar, Þórseðla's first boom on the third
        { role: 'a', notes: L('. . . . . . . .', '. . . . . . . .', '. . . . . . . .', '7! _ _ _ 6 _ 4 .') },
        { role: 'b', notes: L('. . . . . . . .', '. . . . . . . .', '. . 3 . 5 . 7 .', '. . 4 . 6 . 8 .') },
        { role: 'c', notes: L('0 . . . 0 . . .', '0 . . . 0 . . .', '3! . . . 3 . . .', '4 . . . 4 . 4 4') },
      ],
    },
    // The verse: a funk strut, sparse. Chords: Em Em A A, Em Em D Bm.
    vers: {
      bars: 8,
      chords: 'i i iv iv i i vii v',
      parts: [
        { inst: 'kick', steps: VERSE_KICK, when: '!calm' },
        { inst: 'kick', steps: 'x.......x.......', when: 'calm' },
        { inst: 'clap', steps: BACKBEAT, when: '!calm' },
        { inst: 'hat', steps: EIGHTHS, vel: 0.5 },
        { inst: 'ohat', steps: '..............x.', when: 'big' },
        { inst: 'bass', line: L('R . R . R . . 7', 'R . . R R . 5 .', 'R . R . R . . 7', 'R . . R R . 5 .', 'R . R . R . . 7', 'R . . R R . 5 .', 'R . R . R . . 5', 'R . R . R . 5 7') },
        { inst: 'pad', vel: 0.6 },
        { inst: 'pluck', line: '1 . 3 . 5 . 3 .', tier: 1, vel: 0.8 },
        { inst: 'shaker', steps: SHAKE, tier: 2 },
        { inst: 'bell', line: '3 . . . 2 . . .', tier: 3, vel: 0.6 },
        { inst: 'pluck', line: '1 2 3 2 1 2 3 2', when: 'big', vel: 0.5 },
        // Slóeðla: a climb on the second half of the odd bars up to a held note on the first beat of the even bars
        { role: 'a', notes: L('. . . . 0 2 4 5', '7! _ _ 4 . 5 4 2', '. . . . 3 4 5 7', '7! _ _ 5 . 3 5 3', '. . . . 0 2 4 5', '7! _ _ 9 7 4 . 2', '. . . . 1 3 5 6', '7! _ 6 _ 4 _ . .') },
        // Kambeðla: soft taps on the odd bars and an answering lick on the third beat of the even ones
        { role: 'b', notes: L('. . 0 . . . 0 .', '. . . . 4! 7 4 2', '. . 3 . . . 3 .', '. . . . 5! 7 5 3', '. . 0 . . . 0 .', '. . . . 4! 7 9 7', '. . 1 . . . 1 .', '. . . . . . 4 6') },
        // Þórseðla: the child's boom on the first beat of the odd bars, a second boom in the even ones, a fill into the chorus
        { role: 'c', notes: L('0! . . . . . 0 .', '0 . . . 0 . . .', '3! . . . . . 3 .', '3 . . . 3 . . .', '0! . . . . . 0 .', '0 . . . 0 . . 0', '3! . . . . . 3 .', '4 . . . 4 . 4 4') },
      ],
    },
    vidlag: chorus,
    // The bridge: the groove drops to stomp-stomp-clap and long notes, then builds with a snare roll. Chords: F#m F#m A A, F#m F#m Bm Bm.
    bru: {
      bars: 8,
      chords: 'ii ii iv iv ii ii v v',
      parts: [
        { inst: 'kick', steps: L(STOMP, STOMP, STOMP, STOMP, 'x...x...x.......', 'x...x...x.......', 'x...x...x...x...', 'x...x...x...x...') },
        { inst: 'clap', steps: L(CLAP3, CLAP3, CLAP3, CLAP3, BACKBEAT, BACKBEAT, BACKBEAT, REST), when: '!calm' },
        { inst: 'hat', steps: OFFBEAT, vel: 0.5 },
        { inst: 'snare', steps: L(REST, REST, REST, REST, REST, REST, '....x...x...x...', 'x.x.x.x.xxxxxxxx'), vel: 0.8 },
        { inst: 'bass', line: 'R _ _ _ R _ 5 .' },
        { inst: 'pad', vel: 0.9 },
        { inst: 'bell', line: '1 . 2 . 3 . 2 .', tier: 1, vel: 0.5 },
        { inst: 'shaker', steps: SHAKE, tier: 1 },
        { inst: 'choir', tier: 2, vel: 0.8 },
        { inst: 'pluck', line: '1 3 5 3 1 3 5 3', tier: 3, vel: 0.6 },
        // Slóeðla: long notes, one every four beats, a rise at the end
        { role: 'a', notes: L('5! _ _ _ _ _ 4 _', '3 _ _ _ 1 _ . .', '. . . . . . . .', '7! _ _ _ _ _ 5 _', '3 _ _ _ . . . .', '. . . . 5 _ 6 _', '6! _ _ _ 8 _ 6 _', '4 _ _ _ . . 6 7') },
        // Kambeðla: arpeggios, A, F-sharp minor, B minor, one marked note at the start of the 3rd, 6th and 8th bars
        { role: 'b', notes: L('. . . . . . . .', '. . . . . . . .', '3! 5 7 5 3 5 7 5', '3 5 7 5 3 5 7 9', '. . . . . . . .', '1! 3 5 3 1 3 5 3', '. . . . 4 6 8 6', '4! 6 8 6 4 6 8 9') },
        // Þórseðla: stomp, stomp on the first and second beats, the child's on the 2nd and 5th bars and the third beat of the 7th
        { role: 'c', notes: L('1 . . . 1 . . .', '1! . . . 1 . . .', '3 . . . 3 . . .', '3 . . . 3 . . .', '1! . . . 1 . . .', '1 . . . 1 . . .', '4 . . . 4! . . .', '4 . 4 . 4 . 4 4') },
      ],
    },
    lokavidlag: { ...chorus, lift: 2 },
    // The ending: the groove once more, then one last boom. Chords: A D Em Em.
    endir: {
      bars: 4,
      chords: 'iv vii i i',
      fixed: true,
      parts: [
        { inst: 'kick', steps: L(CHORUS_KICK, CHORUS_KICK, CHORUS_KICK, 'x...............') },
        { inst: 'clap', steps: L(BACKBEAT, BACKBEAT, BACKBEAT, REST) },
        { inst: 'snare', steps: L(REST, REST, '....x.......xxxx', REST), vel: 0.8 },
        { inst: 'ohat', steps: L(OFFBEAT, OFFBEAT, OFFBEAT, REST), vel: 0.8 },
        { inst: 'crash', steps: L('x...............', REST, REST, 'x...............') },
        { inst: 'bass', line: L('R . . R 8 . . 7', 'R . . R 8 . . 5', 'R . . R 8 . . 7', 'R _ _ _ _ _ _ _') },
        { inst: 'pad', vel: 0.9 },
        { inst: 'choir', tier: 1 },
        // boom, horn, plates, and the last boom; the horn and the plates ring on under it
        { role: 'a', notes: L('7 _ _ _ 5 _ 7 _', '8! _ _ 8 . 6 . 8', '7 _ 9 _ 7 _ 4 _', '7 _ _ _ _ _ _ _') },
        { role: 'b', notes: L('. . 3 . 5 . 7 .', '. . 1 . 3 . 6 .', '4! 7 9 7 4 7 9 7', '7 _ _ _ . . . .') },
        { role: 'c', notes: L('3! . . . 3 . 3 .', '3 . . . 3 . 3 3', '0 . . . 0 . 0 0', '0! _ _ _ _ _ _ _') },
      ],
    },
  },
};
