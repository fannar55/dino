// "Hoppsasa!": a Caribbean carnival (calypso and soca) at the Star Festival, F major, 126 a minute, about two minutes. Written as
// data for the game to play itself (song.js says how to read it); Smiður B's entry in the song contest. Slóeðla (a) sings the hook
// on a steel pan, Kambeðla (b) answers on a marimba, Þórseðla (c) booms the bass on a big golden sousaphone (their instruments are
// the song's own: smidur-b-instruments.js). The band: a soca kick, claps and open hats (Þórseðla's), an offbeat "chank" of
// plucked chords like a calypso guitar (Kambeðla's), bells and a choir (Slóeðla's), the pad; star layers (tier) come with a run of
// hits: a shaker, bells, a choir. There is no band bass: the sousaphone is the bass.
//
// The hook is the song's name in the tresillo rhythm (3+3+2): HOPP . . sa . . sa . , climbing like stairs (sol-mi-sol, la-fa-la,
// ti-sol-ti) to a big HOPP on the high do, and back. The verse puts each friend in the spotlight in turn (Slóeðla, Kambeðla,
// Þórseðla, then all three); the bridge is a game of copycat (hermikráka): Slóeðla plays a little tune and Kambeðla copies it,
// Kambeðla plays one and Þórseðla copies it deep down, Þórseðla plays one and Slóeðla copies it high up, then all three shout
// HOPP-sa-sa and a marimba run takes them up a whole step (to G) into the last chorus, if the child is playing well.
//
// The '!' notes are the child's, only on the first and third beats of a bar, never closer than two beats, and the last of each
// section four beats or more before the next one's first (so a calm section, which thins them to four beats, stays so across the
// seam). Each is a tone of its bar's chord:
//   intro   Þórseðla wakes on the third bar (BOMP), Kambeðla two beats later, Slóeðla on the fourth (HOPP-sa-sa)
//   verse   a relay: the friend in the spotlight taps three times, the next one takes the baton on the third beat
//   chorus  Slóeðla's HOPP on every first beat; Þórseðla's BOMP (odd bars) and Kambeðla's answer (even bars) on the thirds
//   bridge  two taps a bar, the leader's then the copier's
//   ending  HOPP-sa-sa twice, the long HOPP, and the last big BOMP with a crash

import { INSTRUMENTS } from './smidur-b-instruments.js';

const L = (...bars) => bars.join(' | '); // a line from its bars
const times = (bar, n) => Array(n).fill(bar);

const REST = '. . . . . . . .'; // a bar of eighths with nothing in it
const NONE = '................'; // a bar of sixteenths with no drum in it
const FOUR = 'x...x...x...x...'; // soca: the kick on every beat
const HALF = 'x.......x.......';
const BACKBEAT = '....x.......x...';
const OFFBEAT = '..x...x...x...x.'; // the open hat's "tss" between the kicks
const EIGHTHS = 'x.x.x.x.x.x.x.x.';
const SHAKE = 'xooxooxoxooxooxo'; // a shaker in sixteenths, leaning on the tresillo

// Kambeðla's chank: the bar's chord plucked short on every offbeat, below the tune (three parts, one a chord tone each)
const chank = (vel, extra = {}) => ['1', '2', '3'].map(n => ({ inst: 'pluck', line: `. ${n} . ${n} . ${n} . ${n}`, octave: -1, vel, ...extra }));

/** `line` with the child's marks ('!') kept only in the bars numbered in `bars` (from 0). */
const marksOnly = (line, bars) => line.split('|').map((bar, i) => (bars.includes(i) ? bar : bar.replace(/!/g, ''))).join('|');

// The chorus's three parts. Slóeðla: HOPP-sa-sa, up the stairs to the high HOPP, again, then sa-sa-sa-sa and HOPP.
const HOOK = L('4! _ _ 2 _ _ 4 _', '5! _ _ 3 _ _ 5 _', '6! _ _ 4 _ _ 6 _', '7! _ _ _ _ _ . .', '4! _ _ 2 _ _ 4 _', '5! _ _ 3 _ _ 5 _', '4! _ 6 _ 8 _ 6 _', '7! _ _ _ _ _ . .');
// Kambeðla: little answers on the third beat of the even bars; the child's are those under the held HOPPs
const ANSWERS = L(REST, '. . . . 3 5 7 5', REST, '. . . . 7! 9 7 4', REST, '. . . . 3 5 7 5', REST, '. . . . 7! 9 11 9');
// Þórseðla: the habanera (BOMP . . ba BOMP . pah .) on the chord's root and fifth, the child's BOMP on the third beat of the odd bars
const HABANERA = L('0 . . 4 0! . 4 .', '3 . . 0 3 . 0 .', '4 . . 1 4! . 1 .', '0 . . 4 0 . 4 .', '0 . . 4 0! . 4 .', '3 . . 0 3 . 0 .', '4 . . 1 4! . 1 .', '0 . . 4 0 . 4 .');

// The chorus: I IV V I, I IV V I (F B-flat C F)
const chorus = {
  bars: 8,
  chords: 'I IV V I I IV V I',
  parts: [
    { inst: 'crash', steps: 'x' + '.'.repeat(127), when: '!calm' },
    { inst: 'kick', steps: FOUR, vel: 0.85, when: '!calm' },
    { inst: 'kick', steps: HALF, when: 'calm' },
    { inst: 'clap', steps: BACKBEAT, when: '!calm' },
    { inst: 'snare', steps: NONE, last: '........o.o.x.xx', vel: 0.6 },
    { inst: 'ohat', steps: OFFBEAT, vel: 0.9, when: '!calm' },
    { inst: 'hat', steps: EIGHTHS, vel: 0.35, when: 'calm' },
    { inst: 'hat', steps: '.x.x.x.x.x.x.x.x', vel: 0.4, when: 'big' },
    ...chank(0.55, { when: '!calm' }),
    ...chank(0.36, { when: 'calm' }),
    { inst: 'pad', vel: 0.6 },
    { inst: 'shaker', steps: SHAKE, tier: 1, vel: 0.9 },
    { inst: 'bell', line: '. . 3 . . 2 . .', tier: 2, vel: 0.45 },
    { inst: 'choir', tier: 3, vel: 0.9 },
    { inst: 'choir', when: 'big', vel: 0.5 },
    { role: 'a', octave: 1, notes: HOOK, when: '!calm' },
    { role: 'b', notes: ANSWERS, when: '!calm' },
    { role: 'c', notes: HABANERA, when: '!calm' },
    // calm: one note a bar on its first beat, shared so that every friend still gets some (a c b a, a c b a)
    { role: 'a', octave: 1, notes: marksOnly(HOOK, [0, 3, 4, 7]), when: 'calm' },
    { role: 'b', notes: L(REST, '. . . . 3 5 7 5', '6! . . . . . . .', '. . . . 7 9 7 4', REST, '. . . . 3 5 7 5', '4! . . . . . . .', '. . . . 7 9 11 9'), when: 'calm' },
    { role: 'c', notes: L('0 . . 4 0 . 4 .', '3! . . 0 3 . 0 .', '4 . . 1 4 . 1 .', '0 . . 4 0 . 4 .', '0 . . 4 0 . 4 .', '3! . . 0 3 . 0 .', '4 . . 1 4 . 1 .', '0 . . 4 0 . 4 .'), when: 'calm' },
  ],
};

// The hook on the bells an octave over the steel pan (the last chorus's second time)
const BELL_HOOK = L('3 . . 2 . . 3 .', '2 . . 1 . . 2 .', '2 . . 1 . . 2 .', '4 _ _ _ _ _ . .', '3 . . 2 . . 3 .', '2 . . 1 . . 2 .', '1 . 2 . 3 . 2 .', '4 _ _ _ _ _ . .');

export default {
  id: 'smidur-b',
  name: 'Hoppsasa!',
  bpm: 126,
  root: 'F',
  scale: 'major',
  voices: { a: 'stalpanna', b: 'marimba', c: 'sousafonn' }, // a carnival band (smidur-b-instruments.js)
  instruments: INSTRUMENTS,
  form: ['intro', 'vers', 'vidlag', 'vers', 'vidlag', 'bru', 'lokavidlag', 'endir'],
  sections: {
    // The festival heard through the trees (everyone asleep, muffled), then the friends wake one by one
    intro: {
      bars: 4,
      chords: 'I I IV V',
      fixed: true,
      parts: [
        { inst: 'kick', steps: L('o...o...o...o...', 'o...o...o...o...', FOUR, FOUR) },
        { inst: 'ohat', steps: OFFBEAT, vel: 0.8 },
        ...chank(0.45),
        { inst: 'pad', vel: 0.7 },
        { role: 'a', octave: 1, notes: L(REST, REST, REST, '4! _ _ 6 _ _ 8 _') },
        { role: 'b', notes: L('. . 4 . . 2 . .', '. . 4 . . 2 . .', '. . . . 3! 5 7 5', REST) },
        { role: 'c', notes: L('0 . . 4 0 . 4 .', '0 . . 4 0 . 4 .', '3! . . 0 3 . 0 .', '4 . . 1 4 . 2 1') },
      ],
    },
    // The friends in the spotlight in turn: Slóeðla (I), Kambeðla (IV), Þórseðla (V), then all three; the tuba walks down into
    // the chorus. Chords: F F Bb Bb C C F C.
    vers: {
      bars: 8,
      chords: 'I I IV IV V V I V',
      parts: [
        { inst: 'kick', steps: 'x.....x.x.......', when: '!calm' },
        { inst: 'kick', steps: 'x...............', when: 'calm' },
        { inst: 'snare', steps: '....o.......o...', vel: 0.7, when: '!calm' },
        { inst: 'hat', steps: EIGHTHS, vel: 0.45 },
        { inst: 'ohat', steps: OFFBEAT, vel: 0.6, when: 'big' },
        { inst: 'snare', steps: NONE, last: '............o.xx', vel: 0.6 },
        ...chank(0.4),
        { inst: 'pad', vel: 0.65 },
        { inst: 'shaker', steps: SHAKE, tier: 1, vel: 0.8 },
        { inst: 'bell', line: '. . . . . 3 . 2', tier: 2, vel: 0.4 },
        { inst: 'choir', tier: 3, vel: 0.6 },
        // Slóeðla: up the stairs and down (C A C F, F C A), a "my turn" on the sixth bar, and all together
        { role: 'a', octave: 1, notes: L('4! _ 2 _ 4! _ 7 _', '7! _ 4 _ 2 _ . .', REST, REST, REST, '. . . . 4 _ 6 _', '7! _ 4 _ 2 _ 4 _', '6 _ _ _ _ _ . .') },
        // Kambeðla: a "my turn" on the second bar, then the same climb on B-flat (F D F B-flat, B-flat F D)
        { role: 'b', notes: L(REST, '. . . . 2 4 7 4', '7! _ 5 _ 7! _ 10 _', '10! _ 7 _ 5 _ . .', REST, REST, '. . . . 4! 5 4 2', REST) },
        // Þórseðla: the habanera under the others, her own tune on C (oom-pah up, and down), and a walk down C A G into the
        // chorus's F
        { role: 'c', notes: L('0 . . 4 0 . 4 .', '0 . . 4 0 . 4 .', '3 . . 0 3 . 0 .', '3 . . 0 3 . 0 .', '4! _ 1 _ 4! _ 8 _', '8! _ 4 _ 1 _ . .', '0 . . 4 0 . 4 .', '4! . . . 4 . 2 1') },
      ],
    },
    vidlag: chorus,
    // Hermikráka (copycat): leader and copier two bars on each chord, then all three, a snare roll and a marimba run up.
    // Chords: Dm Dm B-flat B-flat Gm Gm C C.
    bru: {
      bars: 8,
      chords: 'vi vi IV IV ii ii V V',
      parts: [
        { inst: 'kick', steps: L(...times(HALF, 6), FOUR, FOUR) },
        { inst: 'clap', steps: L(...times(NONE, 6), BACKBEAT, BACKBEAT), when: '!calm' },
        { inst: 'hat', steps: L(...times(EIGHTHS, 6), NONE, NONE), vel: 0.35 },
        { inst: 'ohat', steps: L(...times(NONE, 6), OFFBEAT, OFFBEAT), vel: 0.8, when: '!calm' },
        { inst: 'snare', steps: L(...times(NONE, 6), '....o.......o.o.', NONE), last: 'x.x.x.x.xxxxxxxx', vel: 0.7 },
        ...chank(0.36),
        { inst: 'pad', vel: 0.85 },
        { inst: 'shaker', steps: SHAKE, tier: 1, vel: 0.8 },
        { inst: 'bell', line: '1 . . . 3 . . .', tier: 2, vel: 0.4 },
        { inst: 'choir', tier: 3, vel: 0.8 },
        { inst: 'choir', when: 'big', vel: 0.45 },
        // The leader plays alone (the child listens); the child taps the copy. Slóeðla leads (D F A F), later copies Þórseðla's
        // tune high up (G D G D), and shouts HOPP-sa-sa on C
        { role: 'a', octave: 1, notes: L('5 _ 7 _ 9 _ 7 _', REST, REST, REST, REST, '1! _ 5 _ 8! _ 5 _', '4! _ _ 6 _ _ 8 _', REST) },
        // Kambeðla copies her, then leads (F . . D B-flat), and at the end runs up the scale into the last chorus
        { role: 'b', notes: L(REST, '5! _ 7 _ 9! _ 7 _', '7 _ _ 5 3 _ . .', REST, REST, REST, REST, '4! 5 6 7 8 9 10 11') },
        // Þórseðla booms the roots, copies Kambeðla's tune deep down, then leads her own (G D G D), and the habanera on C
        { role: 'c', vel: 0.9, notes: L('-2 _ _ _ . . . .', '-2 _ _ _ . . . .', '3 _ _ _ . . . .', '7! _ _ 5 3! _ . .', '1 . 5 . 8 . 5 .', '1 _ _ _ . . . .', '4 . . 1 4! . 1 .', '4 . . . 4 . 4 4') },
      ],
    },
    // The last chorus: twice, the second time with the bells singing the hook an octave up; a whole step up (G) when big
    lokavidlag: {
      ...chorus,
      bars: 16,
      lift: 2,
      parts: [
        ...chorus.parts,
        { inst: 'bell', line: L(...times(REST, 8), BELL_HOOK), vel: 0.5, when: '!calm' },
      ],
    },
    // The ending: HOPP-sa-sa on B-flat and C, the long rolled HOPP on F, and the last BOMP with everyone and a crash
    endir: {
      bars: 4,
      chords: 'IV V I I',
      fixed: true,
      pulse: 0,
      parts: [
        { inst: 'kick', steps: L(FOUR, FOUR, FOUR, 'x...............') },
        { inst: 'clap', steps: L(BACKBEAT, BACKBEAT, BACKBEAT, NONE) },
        { inst: 'ohat', steps: L(OFFBEAT, OFFBEAT, OFFBEAT, NONE), vel: 0.9 },
        { inst: 'snare', steps: L(NONE, NONE, '........x.x.xxxx', NONE), vel: 0.7 },
        { inst: 'crash', steps: L(NONE, NONE, NONE, 'x...............'), vel: 1.1 },
        ...['1', '2', '3'].map(n => ({ inst: 'pluck', line: L(...times(`. ${n} . ${n} . ${n} . ${n}`, 3), `${n} . . . . . . .`), octave: -1, vel: 0.55 })),
        { inst: 'pad' },
        { inst: 'choir', tier: 1 },
        { inst: 'bell', line: L(REST, REST, '1 2 3 4 3 2 3 4', '4 . . . . . . .'), tier: 2, vel: 0.5 },
        { role: 'a', octave: 1, notes: L('5! _ _ 3 _ _ 5 _', '6! _ _ 4 _ _ 6 _', '7! _ _ _ _ _ _ _', '7 _ _ _ _ _ _ _') },
        { role: 'b', notes: L(REST, '. . . . 4! 6 8 6', '. . . . 7! 9 11 9', '7 . . . . . . .') },
        { role: 'c', notes: L('3 . . 0 3! . 0 .', '4 . . 1 4 . 1 .', '0 . . 4 0 . 2 4', '0! _ _ _ . . . .') },
      ],
    },
  },
};
