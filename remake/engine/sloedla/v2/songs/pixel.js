// "Pixlaferð": an 8-bit adventure, the first song of the new kind (v2/format.js), composed with a band of its own. Every sound in
// it is made here, as an old game console made them: square and pulse waves, a triangle bass, noise drums. Nothing is shared
// with another song.
//
//   Slóeðla (a)   the tune on a square wave, a two-bar call and its answer
//   Kambeðla (b)  16th arpeggios on a thin pulse (12.5 %), the chords climbing
//   Þórseðla (c)  the drums: one kit that reads the step as which drum (0 kick, 1 snare, 2 hat, 3 open hat, 4 crash)
//   the song      a triangle bass; star layers on a run: an echo of the tune (1), a sparkle arpeggio (2), a noise sweep (3)
//
// 140 bpm, A minor. It starts with its own sound: Kambeðla's arpeggio alone, climbing, with a snare fill into the first A.
//   byrjun 2 | A 8 (Am F C G) | B 8 (F G Em Am F G Am Am) | A 8 | brot 4 (the breakdown: drums and a sparse arpeggio)
//   | B 8 (up a whole step when it plays big) | endir 2
// The child's notes ('!') take turns on strong beats, never closer than two beats, with rests between: in A per four bars
// Slóeðla, Þórseðla, Kambeðla, -, Slóeðla, Þórseðla, Kambeðla, -; in B Slóeðla, Kambeðla, Þórseðla, Slóeðla, Kambeðla,
// Þórseðla, Slóeðla, -; in the breakdown Þórseðla on every bar with Kambeðla between.

const L = (...bars) => bars.join(' | ');
const REST = '. . . . . . . .';
const REST16 = `${REST} ${REST}`;

// ---------------------------------------------------------------------------------------------
// The band

/** How loud each plays: a note that plays by itself, one the child taps (the loudest), a stray tap. */
const LEVELS = {
  ferningur: { play: 0.075, tapped: 0.17, soft: 0.03 },
  pulsi: { play: 0.11, tapped: 0.38, soft: 0.04 },
  tromma: { play: 0.32, tapped: 0.7, soft: 0.12 },
  thrihyrningur: { play: 0.24, tapped: 0.24, soft: 0.1 },
  bergmal: { play: 0.03, tapped: 0.03, soft: 0.03 },
  glimmer: { play: 0.03, tapped: 0.03, soft: 0.03 },
  sveipur: { play: 0.06, tapped: 0.06, soft: 0.06 },
};
const levelOf = (name, { soft = false, tapped = false } = {}) => (soft ? LEVELS[name].soft : tapped ? LEVELS[name].tapped : LEVELS[name].play);

/** A pulse wave `width` wide (0.5 a square), as a console's pulse channel makes it, kept for each context. */
const waves = new WeakMap();
function pulseWave(context, width) {
  if (!waves.has(context)) waves.set(context, new Map());
  const kept = waves.get(context);
  if (!kept.has(width)) {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * width);
    kept.set(width, context.createPeriodicWave(real, imag));
  }
  return kept.get(width);
}

/** An oscillator on `freq` (a pulse `width` wide, or `type`) from `at` to `end` into `dest`. */
function osc(context, { freq, at, end, dest, width = null, type = 'square' }) {
  const source = context.createOscillator();
  if (width !== null) source.setPeriodicWave(pulseWave(context, width));
  else source.type = type;
  source.frequency.setValueAtTime(freq, at);
  source.connect(dest);
  source.start(at);
  source.stop(end + 0.02);
  return source;
}

/** A low-pass at `frequency` into `dest`. */
function lowpass(context, frequency, dest) {
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = frequency;
  filter.Q.value = 0.5;
  filter.connect(dest);
  return filter;
}

/** A chip envelope on `gain`: on at once, a step down to `hold` of `level` after `step` s, held to `off`, gone by `end`. */
function chip(gain, { at, level, hold = 0.75, step = 0.05, off, end }) {
  gain.setValueAtTime(0, at);
  gain.linearRampToValueAtTime(level, at + 0.003);
  gain.setValueAtTime(level, at + Math.min(step, off - at));
  gain.linearRampToValueAtTime(level * hold, at + Math.min(step + 0.02, off - at + 0.001));
  gain.setValueAtTime(level * hold, off);
  gain.linearRampToValueAtTime(0, end);
}

const INSTRUMENTS = {
  // Slóeðla's square lead: a square through a soft low-pass, a little vibrato on a held note; tapped, brighter, with a short
  // blip an octave up at its start that a tablet's speaker carries
  ferningur: ({ context, outlet, release }) =>
    function ferningur({ freq, at, dur = 0.2, vel = 1, soft = false, tapped = false, into }) {
      if (!(freq > 0)) return;
      const level = levelOf('ferningur', { soft, tapped }) * vel;
      const off = at + (soft ? 0.12 : Math.max(0.08, dur * 0.9));
      const end = off + 0.04;
      const { volume, nodes } = outlet(0, into, 0.12);
      chip(volume.gain, { at, level, hold: 0.8, off, end });
      const filter = lowpass(context, tapped ? 7000 : 4200, volume);
      const source = osc(context, { freq, at, end, dest: filter });
      if (off - at > 0.3) {
        const lfo = context.createOscillator();
        const depth = context.createGain();
        lfo.frequency.value = 6;
        depth.gain.setValueAtTime(0, at);
        depth.gain.linearRampToValueAtTime(freq * 0.006, at + 0.3);
        lfo.connect(depth);
        depth.connect(source.frequency);
        lfo.start(at);
        lfo.stop(end + 0.02);
        release(lfo, [depth]);
      }
      if (tapped) {
        const blip = context.createGain();
        blip.gain.setValueAtTime(0.5, at);
        blip.gain.linearRampToValueAtTime(0, at + 0.07);
        blip.connect(filter);
        release(osc(context, { freq: freq * 2, at, end: at + 0.07, dest: blip, width: 0.25 }), [blip]);
      }
      release(source, [filter, ...nodes]);
    },

  // Kambeðla's thin pulse: a plucked 12.5 % pulse, short; tapped, louder and wider (25 %), with an octave blip
  pulsi: ({ context, outlet, release }) =>
    function pulsi({ freq, at, dur = 0.1, vel = 1, soft = false, tapped = false, into }) {
      if (!(freq > 0)) return;
      const level = levelOf('pulsi', { soft, tapped }) * vel;
      const off = at + Math.min(Math.max(0.05, dur * 0.85), tapped ? 0.22 : 0.14);
      const end = off + 0.05;
      const { volume, nodes } = outlet(-0.25, into, 0.15);
      chip(volume.gain, { at, level, hold: 0.45, step: 0.025, off, end });
      const source = osc(context, { freq, at, end, dest: volume, width: tapped ? 0.25 : 0.125 });
      if (tapped) {
        const blip = context.createGain();
        blip.gain.setValueAtTime(0.6, at);
        blip.gain.linearRampToValueAtTime(0, at + 0.06);
        blip.connect(volume);
        release(osc(context, { freq: freq * 2, at, end: at + 0.06, dest: blip, width: 0.125 }), [blip]);
      }
      release(source, nodes);
    },

  // Þórseðla's console drums: the step says which drum. A kick is a triangle dropping fast; a snare and the hats are noise; a
  // tapped kick has a click and a crack on top, so a small speaker plays it
  tromma: ({ context, outlet, release, puff }) =>
    function tromma({ step = 0, at, vel = 1, soft = false, tapped = false, into }) {
      const level = levelOf('tromma', { soft, tapped }) * vel;
      const pan = 0.25;
      if (step === 0) {
        const { volume, nodes } = outlet(pan, into);
        volume.gain.setValueAtTime(0, at);
        volume.gain.linearRampToValueAtTime(level, at + 0.002);
        volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
        const source = context.createOscillator();
        source.type = 'triangle';
        source.frequency.setValueAtTime(170, at);
        source.frequency.exponentialRampToValueAtTime(45, at + 0.12);
        source.connect(volume);
        source.start(at);
        source.stop(at + 0.22);
        release(source, nodes);
        if (tapped) {
          const { volume: click, nodes: more } = outlet(pan, into);
          click.gain.setValueAtTime(level * 0.5, at);
          click.gain.linearRampToValueAtTime(0, at + 0.015);
          release(osc(context, { freq: 1200, at, end: at + 0.015, dest: click }), more);
          puff({ at, length: 0.05, level: level * 0.7, frequency: 3000, q: 0.9, pan, attack: 0.001, dest: into });
        }
      } else if (step === 1) {
        puff({ at, length: soft ? 0.06 : 0.13, level: level * 0.7, frequency: 1900, end: 1100, q: 0.6, pan, attack: 0.001, dest: into });
        const { volume, nodes } = outlet(pan, into);
        volume.gain.setValueAtTime(level * 0.35, at);
        volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
        const source = context.createOscillator();
        source.type = 'triangle';
        source.frequency.setValueAtTime(230, at);
        source.frequency.exponentialRampToValueAtTime(150, at + 0.06);
        source.connect(volume);
        source.start(at);
        source.stop(at + 0.08);
        release(source, nodes);
        if (tapped) puff({ at, length: 0.03, level: level * 0.4, frequency: 4500, q: 1, pan, attack: 0.001, dest: into });
      } else if (step === 2) {
        puff({ at, length: 0.035, level: level * 0.28, frequency: 7500, type: 'highpass', q: 0.7, pan, attack: 0.001, dest: into });
      } else if (step === 3) {
        puff({ at, length: 0.17, level: level * 0.26, frequency: 6500, type: 'highpass', q: 0.7, pan, attack: 0.001, dest: into });
      } else {
        puff({ at, length: 0.9, level: level * 0.4, frequency: 5000, end: 3000, type: 'highpass', q: 0.5, pan, attack: 0.002, dest: into });
      }
    },

  // the song's own triangle bass, held as written, with a quiet octave above so a small speaker hints at it
  thrihyrningur: ({ context, outlet, release }) =>
    function thrihyrningur({ freq, at, dur = 0.2, vel = 1, into }) {
      if (!(freq > 0)) return;
      const level = LEVELS.thrihyrningur.play * vel;
      const off = at + Math.max(0.07, dur * 0.92);
      const end = off + 0.02;
      const { volume, nodes } = outlet(0, into);
      chip(volume.gain, { at, level, hold: 1, off, end });
      const source = osc(context, { freq, at, end, dest: volume, type: 'triangle' });
      const upper = context.createGain();
      upper.gain.value = 0.12;
      const filter = lowpass(context, 1400, upper);
      upper.connect(volume);
      release(osc(context, { freq: freq * 2, at, end, dest: filter, width: 0.5 }), [filter, upper]);
      release(source, nodes);
    },

  // star layer 1: the tune's echo, an octave up, quiet and soft, wandering left and right
  bergmal: ({ context, outlet, release, random }) =>
    function bergmal({ freq, at, dur = 0.2, vel = 1, into }) {
      if (!(freq > 0)) return;
      const off = at + Math.max(0.06, Math.min(dur * 0.8, 0.5));
      const end = off + 0.08;
      const { volume, nodes } = outlet(random() < 0.5 ? -0.45 : 0.45, into, 0.35);
      chip(volume.gain, { at, level: LEVELS.bergmal.play * vel, hold: 0.6, off, end });
      const filter = lowpass(context, 3000, volume);
      release(osc(context, { freq, at, end, dest: filter, width: 0.25 }), [filter, ...nodes]);
    },

  // star layer 2: sparkle pings high up
  glimmer: ({ context, outlet, release, random }) =>
    function glimmer({ freq, at, vel = 1, into }) {
      if (!(freq > 0)) return;
      const off = at + 0.04;
      const end = off + 0.06;
      const { volume, nodes } = outlet((random() - 0.5) * 1, into, 0.4);
      chip(volume.gain, { at, level: LEVELS.glimmer.play * vel, hold: 0.4, step: 0.015, off, end });
      release(osc(context, { freq, at, end, dest: volume, width: 0.25 }), nodes);
    },

  // star layer 3: a noise sweep rising into the next bar
  sveipur: ({ puff }) =>
    function sveipur({ at, dur = 1.7, vel = 1, into }) {
      puff({ at, length: dur, level: LEVELS.sveipur.play * vel, frequency: 300, end: 9000, type: 'lowpass', q: 2.5, attack: dur * 0.9, dest: into });
    },
};

// ---------------------------------------------------------------------------------------------
// The parts

// chord tones by scale step in A minor (0 A, 2 C, 4 E, 7 the next A; negative below)
const CHORDS = { Am: [0, 2, 4, 7], F: [-2, 0, 2, 5], C: [2, 4, 6, 9], G: [-1, 1, 3, 6], Em: [-3, -1, 1, 4] };
const A_CHORDS = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'];
const B_CHORDS = ['F', 'G', 'Em', 'Am', 'F', 'G', 'Am', 'Am'];
const BROT_CHORDS = ['Am', 'Am', 'F', 'G'];

/** `slots` as a bar, with a mark ('!') on the note at `marks` (slot numbers). */
const marked = (slots, marks = []) => slots.map((s, i) => (marks.includes(i) && s !== '.' && s !== '_' ? `${s}!` : String(s))).join(' ');

// Kambeðla's arpeggio, a bar of 16ths: up the chord four times; big, two octaves up and down; calm, every other 16th
function arp(chord, how = 'normal', marks = []) {
  const [r, t, f, o] = CHORDS[chord];
  const slots = how === 'big' ? [r, t, f, o, t + 7, f + 7, o + 7, f + 7, t + 7, o, f, t, r, t, f, o]
    : how === 'calm' ? [r, '.', f, '.', o, '.', f, '.', r, '.', f, '.', o, '.', f, '.']
      : [r, t, f, o, r, t, f, o, r, t, f, o, r, t, f, o];
  return marked(slots, marks);
}
// her marks: beat 0 is 16th slot 0, beat 2 slot 8
const arpLine = (chords, how, marks) => L(...chords.map((c, i) => arp(c, how, marks[i] ?? [])));
const A_ARP_MARKS = [[], [0], [], [0], [], [0], [], [0]];
const B_ARP_MARKS = [[8], [], [0], [], [8], [], [0], []];
const BROT_ARP_MARKS = [[8], [], [8], []];

// the bass: root, root, octave, in a console's bounce; big, busier; calm, held
function bass(chord, how = 'normal') {
  const r = CHORDS[chord][0];
  if (how === 'calm') return `${r} _ _ _ ${r} _ _ _`;
  if (how === 'big') return `${r} ${r} ${r + 7} ${r} ${r} ${r + 7} ${r} ${r + 7}`;
  return `${r} . ${r} ${r + 7} ${r} . ${r} ${r + 7}`;
}
const bassLine = (chords, how) => L(...chords.map(c => bass(c, how)));

// the drums: kick on one and three, snare on two and four, hats between; marks on a kick (slot 0: beat 0, slot 4: beat 2)
function drums(how = 'normal', marks = [], { crash = false, fill = false } = {}) {
  const hat = how === 'big' ? 3 : 2;
  let slots = how === 'calm' ? [0, '.', 1, '.', 0, '.', 1, '.'] : [0, hat, 1, hat, 0, hat, 1, hat];
  if (fill) slots = [0, hat, 1, hat, 1, 1, 1, 1];
  if (crash) slots[0] = 4;
  return marked(slots, marks);
}
const drumLine = (how, marks, extras = {}) => L(...marks.map((m, i) => drums(how, m, extras[i] ?? {})));
const A_DRUM_MARKS = [[4], [], [4], [], [4], [], [4], []];
const A_DRUM_EXTRAS = { 0: { crash: true }, 7: { fill: true } };
const B_DRUM_MARKS = [[], [0], [4], [], [], [0], [4], []];
const B_DRUM_EXTRAS = { 0: { crash: true }, 4: { crash: true }, 7: { fill: true } };

// Slóeðla's tune, in 8ths: A is the call (E . E A E C | A C A F ...), B the answer, up high
const TUNE = {
  A: L('4! _ . 4 7 _ 4 2', '0 _ 2 _ 0 . -2 .', '2! _ . 2 4 _ 6 4', '3 _ 1 _ -1 _ . .', '4! _ . 4 7 _ 4 2', '0 _ 2 _ 5 _ 4 2', '2! _ 4 _ 6 _ 4 _', '3 _ _ _ 1 _ -1 .'),
  'A/big': L('4! 4 . 4 7 9 7 4', '5 4 2 4 0 2 -2 0', '2! 2 . 2 4 6 9 6', '8 _ 6 _ 3 _ 1 -1', '4! 4 . 4 7 9 7 4', '0 2 5 4 5 7 9 7', '9! _ 7 _ 6 _ 4 _', '8 _ _ 6 3 _ 1 .'),
  'A/calm': L('4! _ _ _ 2 _ _ _', '0 _ _ _ _ _ . .', '2! _ _ _ 4 _ _ _', '3 _ _ _ -1 _ . .', '4! _ _ _ 2 _ _ _', '0 _ _ _ _ _ . .', '2! _ _ _ 4 _ _ _', '3 _ _ _ -1 _ . .'),
  B: L('5! _ 4 5 7 _ 5 4', '3 _ 1 _ 3! _ 4 _', '4 _ 6 _ 8 _ 6 _', '7! _ _ _ 4 _ 2 _', '5! _ 4 5 7 _ 5 4', '3 _ 1 _ 3! _ 6 _', '7 _ 9 _ 7 _ 4 _', '7! _ _ _ _ _ . .'),
  'B/big': L('5! 5 4 5 7 9 7 5', '6 _ 3 _ 3! 1 3 4', '4 6 8 6 11 _ 8 6', '7! _ 9 _ 7 _ 4 _', '5! 5 4 5 7 9 7 5', '6 _ 3 _ 3! 4 6 8', '9 _ 11 _ 9 _ 7 _', '7! _ _ _ 14 _ . .'),
  'B/calm': L('5! _ _ _ 4 _ _ _', '3 _ _ _ 3! _ _ _', '4 _ _ _ 6 _ _ _', '7! _ _ _ _ _ . .', '5! _ _ _ 4 _ _ _', '3 _ _ _ 3! _ _ _', '7 _ _ _ 4 _ _ _', '7! _ _ _ _ _ . .'),
  byrjun: L(REST, '. . . . 2 _ 3 _'),
  brot: L(REST, REST, REST, '4 _ 2 _ 0 _ -1 _'),
  endir: L('7 _ 4 _ 7 _ _ _', REST),
};

/** A tune one 8th later, its marks gone: the echo. */
const echo = line => {
  const slots = line.replace(/\|/g, ' ').replace(/!/g, '').trim().split(/\s+/);
  return ['.', ...slots.slice(0, -1)].join(' ');
};

// the sparkle: the chord an octave up, every other 16th
const sparkle = chords => L(...chords.map(c => {
  const [r, t, f] = CHORDS[c];
  return [r + 7, '.', t + 7, '.', f + 7, '.', r + 14, '.', f + 7, '.', t + 7, '.', r + 7, '.', f, '.'].join(' ');
}));
// the sweep: a bar long, into every fourth bar
const SWEEP = L(REST, REST, REST, '0 _ _ _ _ _ _ _');

export default {
  version: 2,
  id: 'pixel',
  name: 'Pixlaferð',
  tempo: { bpm: 140, offset: 0 },
  key: { root: 'A', scale: 'minor' },
  sections: [
    { name: 'byrjun', bars: 2, fixed: true },
    { name: 'A', bars: 8 },
    { name: 'B', bars: 8 },
    { name: 'A', bars: 8 },
    { name: 'brot', bars: 4 },
    { name: 'B', bars: 8, lift: 2 },
    { name: 'endir', bars: 2, fixed: true },
  ],
  instruments: INSTRUMENTS,
  layers: [
    { id: 'lag', owner: 'a', part: { instrument: 'ferningur', octave: 1, sections: TUNE } },
    {
      id: 'arpeggio', owner: 'b', part: {
        instrument: 'pulsi', unit: 16, octave: 0, sections: {
          byrjun: L('0 2 4 7 2 4 7 9 4 7 9 11 7 9 11 14', '14 _ _ _ 11 _ 9 _ 7 _ 4 _ 2 _ 0 _'),
          A: arpLine(A_CHORDS, 'normal', A_ARP_MARKS),
          'A/big': arpLine(A_CHORDS, 'big', A_ARP_MARKS),
          'A/calm': arpLine(A_CHORDS, 'calm', A_ARP_MARKS),
          B: arpLine(B_CHORDS, 'normal', B_ARP_MARKS),
          'B/big': arpLine(B_CHORDS, 'big', B_ARP_MARKS),
          'B/calm': arpLine(B_CHORDS, 'calm', B_ARP_MARKS),
          brot: arpLine(BROT_CHORDS, 'calm', BROT_ARP_MARKS),
          endir: L('14 11 9 7 4 2 0 -3 0 _ _ _ _ _ _ _', REST16),
        },
      },
    },
    {
      id: 'trommur', owner: 'c', part: {
        instrument: 'tromma', sections: {
          byrjun: L(REST, '. . . . . . 1 1'),
          A: drumLine('normal', A_DRUM_MARKS, A_DRUM_EXTRAS),
          'A/big': drumLine('big', A_DRUM_MARKS, A_DRUM_EXTRAS),
          'A/calm': drumLine('calm', A_DRUM_MARKS, { 0: { crash: true } }),
          B: drumLine('normal', B_DRUM_MARKS, B_DRUM_EXTRAS),
          'B/big': drumLine('big', B_DRUM_MARKS, B_DRUM_EXTRAS),
          'B/calm': drumLine('calm', B_DRUM_MARKS, { 0: { crash: true } }),
          brot: L('0! . . . 0 . . .', '0! . . . 0 . 0 .', '0! . 2 . 0 . 2 .', '0! . 1 1 1 1 1 1'),
          endir: L('4 . . . . . . .', REST),
        },
      },
    },
    {
      id: 'bassi', owner: null, part: {
        instrument: 'thrihyrningur', octave: -1, sections: {
          byrjun: L('0 _ _ _ _ _ _ _', '0 _ _ _ 0 _ 7 _'),
          A: bassLine(A_CHORDS, 'normal'),
          'A/big': bassLine(A_CHORDS, 'big'),
          'A/calm': bassLine(A_CHORDS, 'calm'),
          B: bassLine(B_CHORDS, 'normal'),
          'B/big': bassLine(B_CHORDS, 'big'),
          'B/calm': bassLine(B_CHORDS, 'calm'),
          brot: L(REST, REST, bass('F', 'calm'), bass('G', 'normal')),
          endir: L('0 _ _ _ _ _ _ _', REST),
        },
      },
    },
    { id: 'bergmal', owner: null, tier: 1, part: { instrument: 'bergmal', octave: 2, sections: { A: echo(TUNE.A), B: echo(TUNE.B) } } },
    { id: 'glimmer', owner: null, tier: 2, part: { instrument: 'glimmer', unit: 16, octave: 1, sections: { A: sparkle(A_CHORDS), B: sparkle(B_CHORDS) } } },
    { id: 'sveipur', owner: null, tier: 3, part: { instrument: 'sveipur', sections: { A: SWEEP, B: SWEEP } } },
  ],
};
