// "Risakarnival" (the giants' carnival): a carnival steel band at the Star Festival, calypso in the verses and soca in the choruses,
// F major, 126 a minute, about two minutes. Written as data for the game to play itself (song.js says how to read it). Every
// dinosaur plays percussion of her own (smidur-c-instruments.js), so the three never sound alike: Slóeðla (a) sings the tune on a
// steel pan (her long notes rolled), Kambeðla (b) answers on a marimba an octave under her, always running up ("bi-di-bi-DING"),
// and Þórseðla (c) plays a carnival drum: a big surdo BOOM on the low notes, timbales ("ta-ta") on the high ones.
//
// The band: Þórseðla's kit (a calypso kick on one and three in the verses, four on the floor with claps and open hats in the
// choruses), Kambeðla's tresillo bass (boom . . boom . . boom .) and off-beat strum, Slóeðla's glockenspiel; the pad and the pulse
// are nobody's. Star layers (tier): a soca shaker, then bells, then a choir.
//
// The '!' notes are the child's, never closer than two beats, always on a first or a third beat:
//   intro   the dinosaurs wake one by one: Þórseðla's BOOM, Kambeðla's run, Slóeðla's first note, a drum fill
//   verse   Slóeðla at the start of every line, each line answered by a friend (Kambeðla, Þórseðla, Kambeðla, Þórseðla's fill)
//   chorus  every two bars the same three: Slóeðla's call (sol . mi sol . mi la ti), Þórseðla's BOOM as the pan lands on its
//           high note, Kambeðla's answer two beats later
//   bridge  night in the forest (long rolled notes, marimba arpeggios, glockenspiel stars), then Þórseðla drums it back up,
//           six booms in a row, a roll, and the band stops dead before the last chorus
//   ending  the call once more, the stabs (Ri-sa-KAR), and the last BOOM
// A calm section thins them to four beats apart. The last chorus is sung twice and goes up a whole step (G) if played well.

import { stalpanna, marimba, karnivaltromma } from './smidur-c-instruments.js';

const L = (...bars) => bars.join(' | '); // a line from its bars
const times = (bar, n) => Array(n).fill(bar).join(' | ');
const REST = '. . . . . . . .';
const REST16 = '. . . . . . . . . . . . . . . .';
const NONE = '................';
const FOUR = 'x...x...x...x...';
const HALF = 'x.......x.......';
const BACKBEAT = '....x.......x...';
const OFFBEAT = '..x...x...x...x.';
const SHAKE = 'ooxoooxoooxoooxo'; // a soca shaker, leaning on the off-beats
const TRESILLO = 'R . . R . . 5 .'; // calypso's bass: boom . . boom . . boom .

// Scale steps in F (a's register, and b's an octave down): 0 F3, 2 A3, 4 C4, 7 F4, 9 A4, 11 C5, 12 D5, 13 E5, 14 F5.
// Þórseðla's: 0 F2, 3 B-flat2, 4 C3, 5 D3 (surdo); 14 F4, 16 A4 (timbales).

// The chorus, three times (the last twice over). Chords: F B-flat Gm C, F B-flat C F.
const chorus = {
  bars: 8,
  chords: 'I IV ii V I IV V I',
  parts: [
    { inst: 'crash', steps: 'x' + '.'.repeat(127), gate: 'c', vel: 0.8, when: '!calm' },
    { inst: 'kick', steps: FOUR },
    { inst: 'snare', steps: BACKBEAT, vel: 0.55, last: '....x.......x.xx' },
    { inst: 'clap', steps: BACKBEAT, when: '!calm' },
    { inst: 'ohat', steps: OFFBEAT, vel: 0.8, when: '!calm' },
    { inst: 'hat', steps: '.x.x.x.x.x.x.x.x', vel: 0.45, when: 'big' },
    { inst: 'bass', line: TRESILLO },
    { inst: 'pad', vel: 0.7 },
    // the strum: the chord's third and fifth together on every off-beat, an octave down, under the pan
    { inst: 'pluck', line: '. 2 . 2 . 2 . 2', octave: -1, vel: 0.55 },
    { inst: 'pluck', line: '. 3 . 3 . 3 . 3', octave: -1, vel: 0.5 },
    { inst: 'shaker', steps: SHAKE, tier: 1 },
    { inst: 'bell', line: L(REST, '. . 3 . 2 . 4 .'), tier: 2, vel: 0.7 },
    { inst: 'choir', tier: 3 },
    { inst: 'bell', line: L('4 . . . . . . .', REST), tier: 3, vel: 0.6 },
    { inst: 'choir', when: 'big', vel: 0.5 },
    // Slóeðla: the call, sol . mi sol . mi la ti, landing on a rolled high do; then la . sol la . sol fa mi down to re; again; and
    // the last call a third higher, ti . sol ti . sol la ti, home to do
    { role: 'a', notes: L('11! _ 9 11 _ 9 12 13', '14 _ _ _ _ _ . .', '12! _ 11 12 _ 11 10 9', '8 _ _ _ _ _ . .', '11! _ 9 11 _ 9 12 13', '14 _ _ _ _ _ . .', '13! _ 11 13 _ 11 12 13', '14 _ _ _ _ _ . .') },
    // Kambeðla: the answer, up the bar's chord on its third beat
    { role: 'b', octave: -1, notes: L(REST, '. . . . 3! 5 7 10', REST, '. . . . 4! 6 8 11', REST, '. . . . 3! 5 7 10', REST, '. . . . 0! 2 4 7') },
    // Þórseðla: timbales (ta-ta) into a BOOM on the first beat of every second bar; a longer roll into the last one
    { role: 'c', notes: L('. . . . . . 14 14', '3! . . . . . . .', '. . . . . . 14 14', '4! . . . . . . .', '. . . . . . 14 14', '3! . . . . . . .', '. . . . 14 16 14 16', '0! . . . . . 0 0') },
  ],
};

export default {
  id: 'smidur-c',
  name: 'Risakarnival',
  bpm: 126,
  root: 'F',
  scale: 'major',
  voices: { a: 'stalpanna', b: 'marimba', c: 'karnivaltromma' }, // a carnival steel band (smidur-c-instruments.js)
  instruments: { stalpanna, marimba, karnivaltromma },
  form: ['intro', 'vers', 'vidlag', 'vers', 'vidlag', 'bru', 'lokavidlag', 'endir'],
  sections: {
    // Four bars: the band plays from the start, but asleep (muffled) until each dinosaur's first note wakes her part. F Dm B-flat C.
    intro: {
      bars: 4,
      chords: 'I vi IV V',
      fixed: true,
      parts: [
        { inst: 'kick', steps: HALF },
        { inst: 'hat', steps: OFFBEAT, vel: 0.6 },
        { inst: 'snare', steps: L(NONE, NONE, NONE, '............x.xx'), vel: 0.6 },
        { inst: 'bass', line: TRESILLO, vel: 0.9 },
        { inst: 'pad', vel: 0.8 },
        { inst: 'bell', line: L('4 . . 3 . . 2 .', REST), vel: 0.5 },
        { role: 'a', notes: L(REST, REST, REST, '11! _ _ _ 8 _ 6 _') },
        { role: 'b', octave: -1, notes: L('. 2 . 4 . 2 . 4', '. 2 . 5 . 2 . 5', '. . . . 3! 5 7 10', '. 4 . 6 . 4 . 6') },
        { role: 'c', notes: L('0 . . . . . . .', '5 . . . . . . .', '3! . . . . . 14 14', '4 . . . 4! 14 16 16') },
      ],
    },
    // The verse: light calypso. F Dm B-flat C, twice. The pan sings a simple tune in quarter notes (do do mi sol, la sol-mi ...),
    // the marimba bubbles on the off-beats, Þórseðla booms on the first beats.
    vers: {
      bars: 8,
      chords: 'I vi IV V',
      parts: [
        { inst: 'kick', steps: HALF, when: '!big' },
        { inst: 'kick', steps: FOUR, vel: 0.85, when: 'big' },
        { inst: 'snare', steps: '....o.......o...', vel: 0.6, when: '!calm', last: '....o.......x.xx' },
        { inst: 'clap', steps: BACKBEAT, vel: 0.6, when: 'big' },
        { inst: 'hat', steps: OFFBEAT, vel: 0.6, when: '!calm' },
        { inst: 'bass', line: TRESILLO },
        { inst: 'pad', vel: 0.75 },
        { inst: 'pluck', line: '. 2 . 3 . 2 . 3', octave: -1, vel: 0.45, when: 'big' },
        { inst: 'shaker', steps: SHAKE, tier: 1, vel: 0.85 },
        { inst: 'bell', line: '. . 3 . . . 2 .', tier: 2, vel: 0.55 },
        { inst: 'choir', tier: 3, vel: 0.6 },
        // Slóeðla: four lines, each starting on a first beat; the third climbs a fourth higher, the last leaves room for the fill
        { role: 'a', notes: L('7! _ 7 _ 9 _ 11 _', '12 _ 11 9 _ _ . .', '10! _ 10 _ 12 _ 14 _', '13 _ 12 11 _ _ . .', '7! _ 7 _ 9 _ 11 _', '12 _ 11 9 _ _ . .', '10! _ 12 _ 14 _ 12 _', '13 _ _ _ . . . .') },
        // Kambeðla: off-beat bubbles, and her answer up the D minor chord at the end of the first and third lines
        { role: 'b', octave: -1, notes: L('. 2 . 4 . 2 . 4', '. 2 . . 5! 7 9 12', '. 3 . 5 . 3 . 5', '. 4 . 6 . 4 . 6', '. 2 . 4 . 2 . 4', '. 2 . . 5! 7 9 12', '. 3 . 5 . 3 . 5', '. 4 . 6 . . . .') },
        // Þórseðla: a boom on every first beat, hers on the third beat of the first bar, a BOOM ta-ta answering the second line,
        // and a BOOM under the last note with a timbale fill into the chorus
        { role: 'c', vel: 0.8, notes: L('0 . . . 0! . . .', '5 . . . . . . .', '3 . . . . . . .', '4 . . . 4! . 14 14', '0 . . . 0 . . .', '5 . . . . . . .', '3 . . . . . . .', '4! . . . 14 16 14 16') },
      ],
    },
    vidlag: chorus,
    // The bridge: night in the forest (D minor, B-flat), no kick, the pan's long rolled notes, the marimba's arpeggios and the
    // glockenspiel's stars; then F and C, and Þórseðla drums it back up: half notes, quarters, eighths, a roll, and a stop.
    bru: {
      bars: 8,
      chords: 'vi vi IV IV I I V V',
      parts: [
        { inst: 'kick', steps: L(NONE, NONE, NONE, NONE, HALF, FOUR, FOUR, 'x...x...........') },
        { inst: 'snare', steps: L(NONE, NONE, NONE, NONE, NONE, NONE, 'x.x.x.x.x.x.x.x.', 'xxxxxxxx........'), vel: 0.65 },
        { inst: 'hat', steps: L(NONE, NONE, NONE, NONE, OFFBEAT, OFFBEAT, '.x.x.x.x.x.x.x.x', 'x.x.x.x.........'), vel: 0.55 },
        { inst: 'shaker', steps: L('o.o.o.o.o.o.o.o.', 'o.o.o.o.o.o.o.o.', 'o.o.o.o.o.o.o.o.', 'o.o.o.o.o.o.o.o.', SHAKE, SHAKE, SHAKE, 'oooooooo........'), vel: 0.8 },
        { inst: 'bass', line: L(times('R _ _ _ _ _ _ _', 4), TRESILLO, TRESILLO, 'R R R R R R R R', 'R R R R . . . .'), vel: 0.85 },
        { inst: 'pad', vel: 0.85 },
        { inst: 'bell', line: L('4 . . 3 . . 2 .', '. . 3 . . . . .', '4 . . 3 . . 2 .', '. . 1 . . . . .', REST, REST, REST, REST), vel: 0.55 },
        { inst: 'riser', line: L(REST, REST, REST, REST, REST, REST, '1 _ _ _ _ _ _ _', '_ _ _ _ . . . .'), vel: 0.6 },
        { inst: 'pluck', unit: 16, line: L(times(REST16, 4), times('1 2 3 2 1 2 3 2 1 2 3 2 1 2 3 2', 3), REST16), tier: 1, vel: 0.35 },
        { inst: 'choir', tier: 2, vel: 0.8 },
        { inst: 'choir', when: 'big', vel: 0.5 },
        // Slóeðla: one long rolled note a bar or two, climbing (A, B-flat, C ... E, G)
        { role: 'a', notes: L('9! _ _ _ _ _ _ _', '12 _ _ _ 9 _ 12 _', '10! _ _ _ _ _ _ _', '12 _ _ _ 14 _ 12 _', '11! _ _ _ _ _ _ _', '9 _ _ _ 11 _ 14 _', '13 _ _ _ _ _ _ _', '15 _ _ _ . . . .') },
        // Kambeðla: arpeggios, hers at the start of the second and fourth bars, then running all through the build
        { role: 'b', octave: -1, notes: L(REST, '5! 7 9 12 9 7 5 7', REST, '3! 5 7 10 7 5 3 5', '0 2 4 7 4 2 0 2', '0 2 4 7 9 7 4 2', '4 6 8 11 8 6 4 6', '4 6 8 11 . . . .') },
        // Þórseðla: a soft heartbeat in the night, then the build, hers every two beats from the fifth bar's third beat
        { role: 'c', unit: 16, notes: L(
          '5 . . . . . . . . . . . . . . .',
          '5 . . . . . . . . . . . 5 . . .',
          '3 . . . . . . . . . . . . . . .',
          '3 . . . . . . . . . . . 3 . . .',
          '0 . . . . . . . 0! . . . . . . .',
          '0! . . . 0 . . . 0! . . . 0 . . .',
          '4! . 16 . 4 . 16 . 4! . 16 . 4 . 16 16',
          '4! . 14 14 16 16 14 14 . . . . . . . .') },
      ],
    },
    // The last chorus: twice, the bells answering the second time, a whole step up if the child is playing well
    lokavidlag: {
      ...chorus,
      bars: 16,
      lift: 2,
      parts: [
        ...chorus.parts,
        { inst: 'bell', line: L(times(REST, 8), times('. . 3 . 2 . 4 .', 8)), vel: 0.6, when: '!calm' },
      ],
    },
    // The ending: the call once more, the stabs (Ri-sa-KAR), and the last BOOM with a crash. F B-flat C F.
    endir: {
      bars: 4,
      chords: 'I IV V I',
      fixed: true,
      parts: [
        { inst: 'kick', steps: L(FOUR, FOUR, 'x..x..x.........', 'x...............') },
        { inst: 'snare', steps: L(BACKBEAT, BACKBEAT, 'x..x..x.........', NONE), vel: 0.7 },
        { inst: 'clap', steps: L(BACKBEAT, BACKBEAT, NONE, NONE) },
        { inst: 'ohat', steps: L(OFFBEAT, OFFBEAT, NONE, NONE), vel: 0.8 },
        { inst: 'crash', steps: L(NONE, NONE, NONE, 'x...............') },
        { inst: 'bass', line: L(TRESILLO, TRESILLO, 'R . . R . . R .', 'R _ _ _ _ _ _ _') },
        { inst: 'pad', vel: 0.9 },
        { inst: 'choir', tier: 1 },
        { inst: 'bell', line: L(REST, REST, REST, '1 2 3 4 . . . .'), tier: 2, vel: 0.6 },
        { role: 'a', notes: L('11! _ 9 11 _ 9 12 13', '14 _ _ _ _ _ _ _', '11! . . 11 . . 13 .', '14 _ _ _ _ _ _ _') },
        { role: 'b', octave: -1, notes: L(REST, '. . . . 3! 5 7 10', '4 . . 4 . . 6 .', '0 2 4 7 . . . .') },
        { role: 'c', notes: L('. . . . . . 14 14', '3! . . . . . . .', '4 . . 4 . . 4 .', '0! . . . . . . .') },
      ],
    },
  },
};
