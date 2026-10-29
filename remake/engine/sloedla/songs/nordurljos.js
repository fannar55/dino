// "Norðurljós": a shimmering dance track under the northern lights, G major, 124 a minute, about two minutes. Written as data for the
// game to play itself (song.js says how to read it). Airy pads and soft plucks in the verses, a build in the bridge (the kick goes
// away, comes back in halves, then a snare roll), and a big happy drop of a chorus: four-on-the-floor kick, claps, open hats on the
// offbeats and a pumping offbeat bass. Slóeðla (a) sings the hook on her horn in long notes (B, A, G ... E, G ...), Kambeðla (b)
// rings sparkling arpeggios on her plates, Þórseðla (c) booms the big drum on the drops. Star layers (tier) come in on a run of hits:
// shaker and shimmering plucks, then bells, then a choir.
//
// The '!' notes are the child's, never closer than two beats (a calm section thins them to four): in the verse Þórseðla on the first
// beat, Slóeðla on the third, Slóeðla again at the start of the next line and Kambeðla answering at the end of each four bars; in the
// chorus three taps then a breath (a hook note, a friend, a friend) with a mark on the first beat of nearly every bar. The last
// chorus is sung twice and goes up a whole step (to A major) if the child is playing well.

const FOUR = 'x...x...x...x...';
const BACKBEAT = '....x.......x...';
const OFFBEAT = '..x...x...x...x.';
const SOFTOFF = '..o...o...o...o.';
const SIXTEENTHS = 'oooooooooooooooo';
const NONE = '................';

const REST = '. . . . . . . .'; // a bar of eighths with nothing in it
const REST16 = '. . . . . . . . . . . . . . . .';
const bars = (...list) => list.join(' | '); // a line from its bars
const times = (bar, n) => Array(n).fill(bar).join(' | '); // the same bar n times

const chorus = {
  bars: 8,
  chords: 'vi IV I V vi IV V I',
  parts: [
    { inst: 'crash', steps: 'x' + '.'.repeat(63), when: '!calm' },
    { inst: 'kick', steps: FOUR },
    { inst: 'clap', steps: BACKBEAT, when: '!calm' },
    { inst: 'snare', steps: NONE, last: '..x...x...x.xxxx', vel: 0.7 },
    { inst: 'ohat', steps: OFFBEAT, when: '!calm' },
    { inst: 'hat', steps: '.o.o.o.o.o.o.o.o', vel: 0.8, when: 'big' },
    // the pump: the bass plays between the kicks
    { inst: 'bass', line: '. R . R . R . 8', when: '!calm' },
    { inst: 'bass', line: 'R _ _ R _ _ R _', when: 'calm' },
    { inst: 'pad', vel: 0.9 },
    { inst: 'pluck', line: '1 . . 3 . . 2 .', vel: 0.7 },
    { inst: 'pluck', unit: 16, line: '1 3 2 3 4 3 2 3 1 3 2 3 4 5 4 3', tier: 1, vel: 0.45 },
    { inst: 'shaker', steps: SIXTEENTHS, tier: 2 },
    { inst: 'bell', line: '3 . 2 . 1 . 2 .', tier: 2, vel: 0.7 },
    { inst: 'choir', tier: 3 },
    { inst: 'choir', when: 'big', vel: 0.6 },
    // Slóeðla: the hook in long notes, B A G ... E G, again, then up through E G B and home to G (F-sharp leads to it)
    { role: 'a', notes: bars('9! _ _ _ 8 7 _ _', '5 _ _ _ 7 _ _ _', '9! _ _ _ 8 7 _ _', '6! _ _ _ 8 _ _ _', '5! _ 7 _ 9 _ _ _', '9 _ _ _ 7 _ 5 _', '8! _ _ _ 6 _ _ _', '7 _ _ _ _ _ . .') },
    // Kambeðla: sparkling arpeggios of each bar's chord, her friends' marks on the first beats and thirds
    { role: 'b', notes: bars('5 7 9 7 5 7 9 7', '3! 5 7 5 3 5 7 5', '2 4 7 4 2! 4 7 9', '4 6 8 6 4 6 8 6', '5 7 9 7 5 7 9 7', '3! 5 7 5 3 5 7 5', '4 6 8 6 4! 6 8 9', '2 4 7 9 7 4 2 .') },
    // Þórseðla: a boom on each bar's first beat, the child's on the third beat of the first and fifth bars and on the very last bar
    { role: 'c', notes: bars('5 . . . 5! . . .', '3 . . . . . 3 .', '0 . . . 0 . . .', '4 . . . . . 4 4', '5 . . . 5! . . .', '3 . . . . . 3 .', '4 . . . 4 . . .', '0! . . . . . 0 0') },
  ],
};

export default {
  id: 'nordurljos',
  name: 'Norðurljós',
  bpm: 124,
  root: 'G',
  scale: 'major',
  voices: { a: 'supersaw', b: 'glass', c: 'boom' }, // a shimmering dance track (voices.js)
  form: ['intro', 'vers', 'vidlag', 'vers', 'vidlag', 'bru', 'lokavidlag', 'endir'],
  sections: {
    // Four bars of shimmer: pad and plucks, the plates, then a soft kick and the bass in the second half
    intro: {
      bars: 4,
      chords: 'I IV I V',
      fixed: true,
      parts: [
        { inst: 'kick', steps: NONE.repeat(2) + 'o...o...o...o...'.repeat(2) },
        { inst: 'hat', steps: NONE.repeat(2) + SOFTOFF.repeat(2), vel: 0.8 },
        { inst: 'bass', line: bars(REST, REST, 'R _ _ R _ _ R _', 'R _ _ R _ _ R _'), vel: 0.8 },
        { inst: 'pad', vel: 0.8 },
        { inst: 'pluck', unit: 16, line: '1 2 3 4 3 2 1 2 1 2 3 4 3 2 1 2', vel: 0.35 },
        { role: 'a', notes: bars(REST, REST, REST, '6! _ _ _ 8 _ . .') },
        { role: 'b', notes: bars('7 . 9 . 7 . 4 .', '5 . 7 . 5 . 3 .', '4 . 7 . 9 . 7 .', '4 . 6 . 8! . 6 .') },
        { role: 'c', notes: bars(REST, REST, '0! . . . . . . .', '4 . . . . . 4 .') },
      ],
    },
    // Airy: a heartbeat of a kick, a syncopated bass, soft plucks; a big verse fills it out a little
    vers: {
      bars: 8,
      chords: 'I iii vi IV I iii IV V',
      parts: [
        { inst: 'kick', steps: 'x.......x.......', when: 'normal' },
        { inst: 'kick', steps: FOUR, vel: 0.8, when: 'big' },
        { inst: 'kick', steps: 'x...............', vel: 0.8, when: 'calm' },
        { inst: 'hat', steps: SOFTOFF, when: '!calm' },
        { inst: 'clap', steps: '........x.......', vel: 0.6, when: 'big' },
        { inst: 'bass', line: 'R _ _ R _ _ R _', vel: 0.8 },
        { inst: 'pad', vel: 0.75 },
        { inst: 'pluck', line: '1 . 2 . 3 . 2 .', vel: 0.5 },
        { inst: 'pluck', unit: 16, line: '1 2 3 4 3 2 3 2 1 2 3 4 3 2 3 2', vel: 0.3, when: 'big' },
        { inst: 'shaker', steps: SIXTEENTHS, tier: 1, vel: 0.8 },
        { inst: 'bell', line: '3 . . 2 . . 1 .', tier: 2, vel: 0.6 },
        { inst: 'choir', tier: 3, vel: 0.6 },
        // Slóeðla: two lines of four bars, each starting on the third beat; the second climbs to B and falls towards the chorus
        { role: 'a', notes: bars('. . . . 4! _ 2 _', '4 _ _ _ . . 2 4', '5! _ _ _ 4 _ 2 _', '3 _ _ _ . . . .', '. . . . 4! _ 7 _', '6 _ _ _ 4 _ 6 _', '9! _ _ _ 7 _ 5 _', '6 _ _ _ 8 _ _ _') },
        // Kambeðla: little sparkles at the end of each bar and an answer at the end of each line
        { role: 'b', notes: bars('. . . . . . 4 7', '. . . . . . 4 6', '. . . . . . 7 9', '5! . 7 . 5 . 3 .', '. . . . . . 4 7', '. . . . . . 6 9', '. . . . . . 7 9', '6! . 8 . 6 . 4 .') },
        // Þórseðla: the child's boom on the first beat of the first and fifth bars
        { role: 'c', notes: bars('0! . . . . . . .', '. . . . 2 . 2 .', '5 . . . . . 5 .', '3 . . . . . . .', '0! . . . . . . .', '. . . . 2 . 2 .', '3 . . . . . 3 .', '4 . . . . . 4 4') },
      ],
    },
    vidlag: chorus,
    // The build: pad and bells, the horn climbing in long notes, then the kick returns, the claps, the plucks and a snare roll
    bru: {
      bars: 8,
      chords: 'IV I IV I vi IV V V',
      parts: [
        { inst: 'kick', steps: NONE.repeat(4) + 'x.......x.......'.repeat(2) + FOUR + NONE },
        { inst: 'clap', steps: NONE.repeat(6) + BACKBEAT + NONE, when: '!calm' },
        { inst: 'hat', steps: NONE.repeat(4) + SOFTOFF.repeat(4), when: '!calm' },
        { inst: 'snare', steps: NONE.repeat(6) + '....x.......x.x.' + NONE, last: 'o.o.o.o.oxoxxxxx', vel: 0.8 },
        { inst: 'bass', line: bars(times('R _ _ _ _ _ _ _', 4), times('R _ _ R _ _ R _', 2), '. R . R . R . R', 'R _ _ _ _ _ _ _'), vel: 0.8 },
        { inst: 'pad', vel: 0.9 },
        { inst: 'bell', line: '1 2 3 2 1 2 3 2', vel: 0.45 },
        { inst: 'pluck', unit: 16, line: bars(times(REST16, 4), times('1 2 3 4 3 2 3 2 1 2 3 4 5 4 3 2', 4)), vel: 0.4 },
        { inst: 'shaker', steps: SIXTEENTHS, tier: 1, vel: 0.8 },
        { inst: 'choir', tier: 2, vel: 0.8 },
        { inst: 'choir', when: 'big', vel: 0.5 },
        // Slóeðla: one long note a bar or two, higher each time, then her friends build it up with her
        { role: 'a', notes: bars('5! _ _ _ _ _ _ _', '6 _ _ _ _ _ _ _', '7! _ _ _ _ _ _ _', '8 _ _ _ _ _ . .', '7 _ _ _ 9 _ _ _', '9! _ _ _ 8 _ 7 _', '8! _ _ _ 9 _ _ _', '9 _ _ _ _ _ _ _') },
        { role: 'b', notes: bars(REST, '. . . . . . 7 9', '. . . . . . 5 7', '4! . 7 . 9 . 7 .', '5 . 7 . 9 . 7 .', '3 5 7 5 3! 5 7 5', '4 6 8 6 4 6 8 9', '6! 8 9 8 6 8 9 8') },
        { role: 'c', notes: bars('3 . . . . . . .', '0 . . . . . . .', '3 . . . . . . .', '0 . . . . . . .', '5! . . . . . . .', '3 . . . 3 . 3 .', '4 . 4 . 4! . 4 .', '4 4 4 4 5 5 5 5') },
      ],
    },
    // The last chorus: sung twice, with bells added the second time, and a step up (A major) if the child is playing well
    lokavidlag: {
      ...chorus,
      bars: 16,
      lift: 2,
      parts: [
        ...chorus.parts,
        { inst: 'bell', line: bars(times(REST, 8), times('3 . 2 . 1 . 2 .', 8)), vel: 0.6, when: '!calm' },
      ],
    },
    // The ending: the hook once more, the drums thinning out, a last boom and a crash under the held note
    endir: {
      bars: 4,
      chords: 'vi IV V I',
      fixed: true,
      parts: [
        { inst: 'kick', steps: FOUR.repeat(2) + 'x.......x.......' + 'x...............' },
        { inst: 'clap', steps: BACKBEAT.repeat(2) + NONE.repeat(2) },
        { inst: 'ohat', steps: OFFBEAT.repeat(2) + NONE.repeat(2) },
        { inst: 'bass', line: bars(times('. R . R . R . 8', 2), 'R _ _ _ R _ _ _', 'R _ _ _ _ _ _ _') },
        { inst: 'pad' },
        { inst: 'choir', tier: 1 },
        { inst: 'bell', line: bars(REST, REST, '1 2 3 4 3 2 3 4', '4 . . . . . . .'), vel: 0.6, tier: 2 },
        { inst: 'crash', steps: NONE.repeat(3) + 'x...............' },
        { role: 'a', notes: bars('9! _ _ _ 8 7 _ _', '5 _ _ _ 7 _ _ _', '8! _ _ _ 6 _ _ _', '7 _ _ _ _ _ _ _') },
        { role: 'b', notes: bars(REST, '3! 5 7 5 3 5 7 9', '4 6 8 9 8 6 4 6', '7 . . . . . . .') },
        { role: 'c', notes: bars('5 . . . . . 5 .', '3 . . . . . 3 .', '4 . 4 . 4 . 4 4', '0! . . . . . . .') },
      ],
    },
  },
};
