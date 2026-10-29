// "Hopp og hí!": a calypso carnival at the Star Festival, F major, 120 a minute, 64 bars (2 min 8 s). Smiður A's song for the song
// contest, written as data for the game to play itself (song.js says how to read it). The three friends are a little steel band:
// Slóeðla (a) sings the tune on a steel pan, Kambeðla (b) answers on a ukulele and strums the off-beat "chk" of calypso, Þórseðla
// (c) booms the surdo, the big drum of the carnival (their instruments: smidur-a-instruments.js). The band is soca: a
// four-on-the-floor kick, claps on two and four, open hats on the "and", a shaker, and a bass in the tresillo (3 + 3 + 2:
// "dum . . dum . . dum ."), with star layers (tier) on a run of hits: shaker and a picked arpeggio, glockenspiel cascades, a choir.
//
// The '!' notes are the child's: on a first or a third beat, never closer than two beats, in the key (nearly all chord tones):
//   intro  a roll call: Þórseðla's boom brings the drums, Kambeðla's strum the bass, Slóeðla's pan teases the hook
//   verse  call and answer: Slóeðla sings a bar, her friends answer in the next (a uke lick, a boom-boom), taking turns
//   chorus the hook (A A C A F, D D F D B-flat, C . . A . . F, E . . G . . C), Slóeðla on the first beats, a friend on the thirds
//   bridge "who is that?": two bars each alone (Þórseðla's surdo solo, Kambeðla's uke solo, Slóeðla's pan solo), then all three
//   end    the hook's last line, a long rolled F, and one last BOOM
// A calm section keeps the first beats, four beats apart: the parts are laid so that it is still a, b, a, c in the verse and
// still the roll call in the bridge. The last chorus is sung twice and goes up a whole step (G major) if the child is playing well.

import { INSTRUMENTS } from './smidur-a-instruments.js';

const L = (...bars) => bars.join(' | '); // a line from its bars
const times = (bar, n) => Array(n).fill(bar).join(' | ');
const REST = '. . . . . . . .';

const NONE = '................';
const FOUR = 'x...x...x...x...';
const HALF = 'x.......x.......';
const BACKBEAT = '....x.......x...';
const OFFBEAT = '..x...x...x...x.';
const SOFTOFF = '..o...o...o...o.';
const GHOSTS = '.......o.......o'; // the snare's little "a" before three and before one
const SHAKE = 'ooxoooxoooxoooxo'; // soft sixteenths, a lean on the "and"
const LEAD_IN = '....x.......x.xx';

// The chorus. Chords F Bb F C, F Bb C F.
const chorus = {
  bars: 8,
  chords: 'I IV I V I IV V I',
  parts: [
    { inst: 'kick', steps: FOUR, vel: 0.9, when: '!calm' },
    { inst: 'kick', steps: HALF, when: 'calm' },
    { inst: 'clap', steps: BACKBEAT, when: '!calm' },
    { inst: 'snare', steps: GHOSTS, vel: 0.6, last: '....x..o..x.xxxx' },
    { inst: 'ohat', steps: OFFBEAT, vel: 0.9, when: '!calm' },
    { inst: 'hat', steps: 'o.o.o.o.o.o.o.o.', vel: 0.7, when: 'big' },
    { inst: 'shaker', steps: SHAKE, when: 'big' },
    // the bass in the tresillo, up the octave at the end of the bar
    { inst: 'bass', vel: 0.85, line: 'R _ _ 5 _ _ 8 _', when: '!calm' },
    { inst: 'bass', vel: 0.85, line: 'R _ _ _ R _ _ _', when: 'calm' },
    { inst: 'pad', vel: 0.85 },
    // the star layers: a shaker and a marimba-ish pluck in the tresillo under it all; then a glockenspiel sings the hook with
    // Slóeðla, two octaves up (the hook is all chord tones: third, third, fifth, third, root); then the choir
    { inst: 'shaker', steps: SHAKE, tier: 1 },
    { inst: 'pluck', line: '1 _ _ 3 _ _ 2 _', octave: -1, tier: 1, vel: 0.55 },
    { inst: 'bell', line: L('2 _ 2 3 2 _ 1 _', '2 _ 2 3 2 _ 1 _', '3 _ _ 2 _ _ 1 _', '2 _ _ 3 _ _ 4 _', '2 _ 2 3 2 _ 1 _', '2 _ 2 3 2 _ 1 _', '2 _ 2 3 2 _ 1 _', '4 _ _ _ _ _ . .'), tier: 2, vel: 0.5 },
    { inst: 'choir', tier: 3 },
    { inst: 'choir', when: 'big', vel: 0.55 },
    // Slóeðla: the hook, a step up each line (A, then D), down and up in the tresillo, and home to a high F that she rolls
    { role: 'a', octave: 1, notes: L('2! _ 2 4 2 _ 0 _', '5! _ 5 7 5 _ 3 _', '4! _ _ 2 _ _ 0 _', '-1 _ _ 1 _ _ 4 _', '2! _ 2 4 2 _ 0 _', '5 _ 5 7 5 _ 3 _', '6! _ 6 8 6 _ 4 _', '7! _ _ _ _ _ . .') },
    // Kambeðla: the off-beat "chk" of calypso on her uke, and a lick of her own on her taps (the third beats of the even bars, the
    // first of the sixth). A calm chorus keeps only the first beats: hers is the sixth bar's
    { role: 'b', notes: L('. 4 . 2 . 4 . 2', '. 5 . 3 7! _ 5 3', '. 4 . 2 . 4 . 2', '. 4 . 1 6! _ 4 1', '. 4 . 2 . 4 . 2', '5! _ . 3 . 5 . 3', '. 4 . 1 . 4 . 1', '. 4 . 2 7! _ 4 2') },
    // Þórseðla: the surdo, "BOOM . . bm BOOM" on F, the tresillo on the others, her taps on the third beats of the odd bars and the
    // first of the fourth; a fill into the next section
    { role: 'c', notes: L('0 . . 0 0! . . .', '3 . . 3 . . 3 .', '0 . . 0 . . 0 .', '4! . . 4 . . 4 .', '0 . . 0 0! . . .', '3 . . 3 . . 3 .', '4 . . 4 4! . . .', '0 . . 0 . . 4 4') },
  ],
};

export default {
  id: 'smidur-a',
  name: 'Hopp og hí!',
  bpm: 120,
  root: 'F',
  scale: 'major',
  voices: { a: 'stalpanna', b: 'ukulele', c: 'surdo' }, // a calypso steel band (smidur-a-instruments.js)
  instruments: INSTRUMENTS,
  form: ['intro', 'vers', 'vidlag', 'vers', 'vidlag', 'bru', 'lokavidlag', 'endir'],
  sections: {
    // Bare at first (the pad, the pulse, the friends asleep), then the roll call: boom, strum, ping. Chords F Bb C F.
    intro: {
      bars: 4,
      chords: 'I IV V I',
      fixed: true,
      parts: [
        { inst: 'kick', steps: L(HALF, HALF, FOUR, FOUR), vel: 0.8 },
        { inst: 'clap', steps: L(NONE, NONE, BACKBEAT, BACKBEAT) },
        { inst: 'ohat', steps: L(NONE, NONE, OFFBEAT, OFFBEAT), vel: 0.8 },
        { inst: 'snare', steps: L(NONE, NONE, NONE, '..........o.x.xx'), vel: 0.6 },
        { inst: 'bass', vel: 0.85, line: L(REST, REST, 'R _ _ 5 _ _ 8 _', 'R _ _ 5 _ _ 8 _') },
        { inst: 'pluck', line: L(REST, REST, '. 2 . 3 . 2 . 3', '. 2 . 3 . 2 . 3'), vel: 0.6 },
        { inst: 'pad', vel: 0.8 },
        { inst: 'bell', line: L(REST, REST, REST, '3 . . 2 . . 1 .'), vel: 0.6 },
        // Slóeðla last: the hook's first bar, a teaser
        { role: 'a', octave: 1, notes: L(REST, REST, REST, '2! _ 2 4 2 _ 0 _') },
        // Kambeðla: asleep, a little picking; then her strum on the third beat of the C bar
        { role: 'b', notes: L('0 . 2 . 4 . 2 .', '3 . 5 . 7 . 5 .', '. . . . 4! 6 8 6', '. 4 . 2 . 4 . 2') },
        // Þórseðla: asleep, a slow boom; then the first beat of the C bar wakes the drums
        { role: 'c', notes: L('0 . . . . . . .', '3 . . . . . 3 3', '4! . . 4 4 . . .', '0 . . 0 . . 4 4') },
      ],
    },
    // Call and answer. Chords F Dm Bb C, twice.
    vers: {
      bars: 8,
      chords: 'I vi IV V',
      parts: [
        { inst: 'kick', steps: FOUR, vel: 0.75, when: '!calm' },
        { inst: 'kick', steps: HALF, vel: 0.8, when: 'calm' },
        { inst: 'clap', steps: BACKBEAT, vel: 0.7, when: '!calm' },
        { inst: 'hat', steps: OFFBEAT, vel: 0.8 },
        { inst: 'ohat', steps: OFFBEAT, vel: 0.7, when: 'big' },
        { inst: 'snare', steps: NONE, last: LEAD_IN, vel: 0.6, when: '!calm' },
        { inst: 'bass', vel: 0.85, line: 'R _ _ R _ _ 5 _' },
        { inst: 'pad', vel: 0.7 },
        // the off-beat "chk" (Kambeðla's)
        { inst: 'pluck', line: '. 2 . 3 . 2 . 3', vel: 0.55, when: '!calm' },
        { inst: 'shaker', steps: SHAKE, tier: 1, vel: 0.8 },
        { inst: 'bell', line: '. . 3 . . . 2 .', tier: 2, vel: 0.55 },
        { inst: 'choir', tier: 3, vel: 0.55 },
        { inst: 'pluck', line: '1 . 3 . 4 . 3 .', when: 'big', vel: 0.35 },
        // Slóeðla: a one-bar call in the odd bars, syncopated (C . A C . A F .; D . B-flat D . B-flat F .), the last rising to G
        { role: 'a', octave: 1, notes: L('4! _ 2 4 _ 2 0 _', REST, '5! _ 3 5 _ 3 0 _', REST, '4! _ 2 4 _ 2 0 _', REST, '5! _ 3 5 _ 7 8 _', REST) },
        // Kambeðla: a uke lick answering her, at the start of the Dm bars and at the end of the C bars (a run up into the chorus)
        { role: 'b', notes: L(REST, '5! 7 5 2 . . . .', REST, '. . . . 4! 6 8 6', REST, '9! 7 5 7 . . . .', REST, '. . . . 4! 6 8 9') },
        // Þórseðla: a soft tresillo under the calls, her boom-boom answering at the end of the Dm bars and at the start of the C bars
        { role: 'c', notes: L('0 . . 0 . . 0 .', '-2 . . . -2! . -2 .', '3 . . 3 . . 3 .', '4! . . 4 4 . . .', '0 . . 0 . . 0 .', '-2 . . . -2! . -2 .', '3 . . 3 . . 3 .', '4! . . 4 4 . 4 4') },
      ],
    },
    vidlag: chorus,
    // "Who is that?": each friend alone for two bars (Þórseðla's surdo on Dm, Kambeðla's uke on B-flat, Slóeðla's pan on F),
    // then all three on C with a snare roll into the last chorus. Each solo's band is her own: the drums, then the bass and the
    // chk, then the bells.
    bru: {
      bars: 8,
      chords: 'vi vi IV IV I I V V',
      parts: [
        { inst: 'kick', steps: L(FOUR, FOUR, HALF, HALF, NONE, NONE, FOUR, FOUR), when: '!calm' },
        { inst: 'kick', steps: L(HALF, HALF, HALF, HALF, NONE, NONE, HALF, HALF), when: 'calm' },
        { inst: 'clap', steps: L(BACKBEAT, BACKBEAT, NONE, NONE, NONE, NONE, BACKBEAT, NONE), when: '!calm' },
        { inst: 'ohat', steps: L(OFFBEAT, OFFBEAT, NONE, NONE, NONE, NONE, OFFBEAT, OFFBEAT), vel: 0.8 },
        { inst: 'hat', steps: L(NONE, NONE, SOFTOFF, SOFTOFF, SOFTOFF, SOFTOFF, NONE, NONE) },
        { inst: 'snare', steps: L(NONE, NONE, NONE, NONE, NONE, NONE, '....x.......x.x.', 'x.x.x.x.xxxxxxxx'), vel: 0.75 },
        { inst: 'bass', vel: 0.85, line: L(REST, REST, 'R _ _ R _ _ 5 _', 'R _ _ R _ _ 5 _', REST, REST, 'R _ _ 5 _ _ 8 _', 'R _ R _ R R R R') },
        { inst: 'pluck', line: L(REST, REST, '. 2 . 3 . 2 . 3', '. 2 . 3 . 2 . 3', REST, REST, '. 2 . 3 . 2 . 3', '. 2 . 3 . 2 . 3'), vel: 0.55 },
        { inst: 'bell', line: L(REST, REST, REST, REST, '1 . 2 . 3 . 4 .', '3 . 4 . 5 . 6 .', REST, REST), vel: 0.45 },
        { inst: 'pad', vel: 0.85 },
        { inst: 'shaker', steps: SHAKE, tier: 1, vel: 0.8 },
        { inst: 'choir', tier: 2, vel: 0.7 },
        { inst: 'choir', when: 'big', vel: 0.5 },
        // Þórseðla's solo (BOOM . . bm BOOM . bm . | BOOM . bm bm BOOM bm BOOM .), then her boom on the first beat of the last bar
        { role: 'c', notes: L('-2! . . 2 -2! . 2 .', '-2! . 2 2 -2 2 -2 .', REST, REST, REST, REST, '4 . . 4 4 . . .', '4! . 4 . 4 4 4 4') },
        // Kambeðla's solo on B-flat (F . D B-flat D . F . | B-flat . A F D . F .), then her answer in the C bar
        { role: 'b', notes: L(REST, REST, '7! _ 5 3 5! _ 7 _', '10! _ 8 7 5 _ 3 _', REST, REST, '. 4 . 1 6! _ 4 1', '. 4 . 6 . 8 . 8') },
        // Slóeðla's solo on F (a run down the chord and up again), then the hook's line on C and a long G to lead in
        { role: 'a', octave: 1, notes: L(REST, REST, REST, REST, '7! 9 7 4 2! 4 2 0', '2! _ 4 _ 7 _ 9 _', '6! _ 6 8 6 _ 4 _', '8 _ _ _ _ _ . .') },
      ],
    },
    // The last chorus, twice, the bells joining the second time; a whole step up (G major) if the child is playing well
    lokavidlag: {
      ...chorus,
      bars: 16,
      lift: 2,
      parts: [
        ...chorus.parts,
        { inst: 'bell', line: L(times(REST, 8), times('3 . . 2 . . 1 .', 8)), vel: 0.55, when: '!calm' },
        { inst: 'shaker', steps: NONE.repeat(8) + SHAKE.repeat(8), vel: 0.8, when: 'normal' },
      ],
    },
    // The end: the hook's last line, a long rolled F, and one last BOOM under a crash. Chords B-flat C F F.
    endir: {
      bars: 4,
      chords: 'IV V I I',
      fixed: true,
      parts: [
        { inst: 'kick', steps: L(FOUR, FOUR, FOUR, 'x...............') },
        { inst: 'clap', steps: L(BACKBEAT, BACKBEAT, BACKBEAT, NONE) },
        { inst: 'ohat', steps: L(OFFBEAT, OFFBEAT, OFFBEAT, NONE), vel: 0.8 },
        { inst: 'snare', steps: L(GHOSTS, GHOSTS, '....x.......xxxx', NONE), vel: 0.7 },
        { inst: 'crash', steps: L(NONE, NONE, NONE, 'x...............') },
        { inst: 'bass', vel: 0.85, line: L('R _ _ 5 _ _ 8 _', 'R _ _ 5 _ _ 8 _', 'R _ _ 5 _ _ 8 _', 'R _ _ _ _ _ _ _') },
        { inst: 'pad' },
        { inst: 'choir', tier: 1 },
        { inst: 'bell', line: L(REST, REST, '1 2 3 4 3 4 5 6', '4 . . . . . . .'), tier: 2, vel: 0.55 },
        { role: 'a', octave: 1, notes: L('5! _ 5 7 5 _ 3 _', '6! _ 6 8 6 _ 4 _', '7! _ _ _ _ _ _ _', '_ _ _ _ . . . .') },
        { role: 'b', notes: L('. 5 . 3 . 5 . 3', '. 4 . 1 6! _ 4 1', '. 4 . 2 7! _ 4 2', '7 . . . . . . .') },
        { role: 'c', notes: L('3 . . 3 3! . . .', '4 . . 4 . . 4 .', '0 . . 0 . . 4 4', '0! . . . . . . .') },
      ],
    },
  },
};
