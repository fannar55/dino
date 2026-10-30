// "Fönkhopp": a funky hip-hop beat for kids, a song of the new kind (v2/format.js) that is half recording, half composed. The
// recording is an ElevenLabs Music track (tools/sloedla-music.mjs preset fonk, 2026-10-30) of only drums and bass, split into
// stems; the tune on top is written here and played on an instrument of the song's own.
//   Þórseðla (c)  the drums (the recording): a boom-bap breakbeat, alone in the first two bars
//   Kambeðla (b)  the bass (the recording): E, swinging up to A or G in each bar's second half
//   Slóeðla (a)   a whistle (composed): a loose line in the verses, a catchy hook (E E G E B | D B A) in the hooks
//   the song      star layers: an answer an octave down in the gaps of the tune (1), a short bright stab on beat four (2)
// The recording stays on E minor throughout (one chord, the bass moving under it), so the tune keeps to E minor's pentatonic
// notes (E G A B D). It is tuned to the recording (key.cents, theme-tempo's measure). The stems' notes for the child are read
// by tools/sloedla-stem-chart.mjs (fonk.chart.js) around the tune's '!' notes.
//
// 95 bpm (measured, steady to 0.8 ms), E minor; the first beat is 0.0254 s into the stems.
//   intro 2 (drums) | vers 8 | krokur 4 | vers 8 | krokur 4 | bru 4 (breakdown) | krokur 4 | endir 2

import chart from './fonk.chart.js';

const L = (...bars) => bars.join(' | ');
const REST = '. . . . . . . .';

/** How loud the whistle plays: a note by itself, one the child taps (the loudest), a stray tap. */
const LEVELS = {
  flauta: { play: 0.11, tapped: 0.26, soft: 0.04 },
  stunga: { play: 0.045 },
};

const INSTRUMENTS = {
  // Slóeðla's whistle: a sine sliding up into its note with a breathy chiff, a little triangle under it, a vibrato on a held
  // note; tapped, it starts at once with a bright pip an octave up that a tablet's speaker carries
  flauta: ({ context, outlet, release, puff }) =>
    function flauta({ freq, at, dur = 0.3, vel = 1, soft = false, tapped = false, into }) {
      if (!(freq > 0)) return;
      const level = (soft ? LEVELS.flauta.soft : tapped ? LEVELS.flauta.tapped : LEVELS.flauta.play) * vel;
      const off = at + (soft ? 0.15 : Math.max(0.1, dur * 0.95));
      const end = off + 0.08;
      const { volume, nodes } = outlet(0, into, 0.2);
      const g = volume.gain;
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(level, at + (tapped ? 0.006 : 0.03));
      g.linearRampToValueAtTime(level * 0.85, at + 0.12);
      g.setValueAtTime(level * 0.85, off);
      g.linearRampToValueAtTime(0, end);
      const sine = context.createOscillator();
      sine.type = 'sine';
      sine.frequency.setValueAtTime(freq * (tapped ? 1 : 0.985), at);
      sine.frequency.linearRampToValueAtTime(freq, at + 0.04);
      sine.connect(volume);
      const under = context.createGain();
      under.gain.value = 0.25;
      under.connect(volume);
      const tri = context.createOscillator();
      tri.type = 'triangle';
      tri.frequency.setValueAtTime(freq, at);
      tri.connect(under);
      for (const source of [sine, tri]) { source.start(at); source.stop(end + 0.02); }
      if (off - at > 0.3) {
        const lfo = context.createOscillator();
        const depth = context.createGain();
        lfo.frequency.value = 5.5;
        depth.gain.setValueAtTime(0, at);
        depth.gain.linearRampToValueAtTime(freq * 0.004, at + 0.3);
        lfo.connect(depth);
        depth.connect(sine.frequency);
        lfo.start(at);
        lfo.stop(end + 0.02);
        release(lfo, [depth]);
      }
      puff({ at, length: tapped ? 0.06 : 0.09, level: level * (tapped ? 0.45 : 0.25), frequency: freq * 2, q: 2, attack: 0.003, dest: into });
      if (tapped) {
        const pip = context.createGain();
        pip.gain.setValueAtTime(0.4, at);
        pip.gain.linearRampToValueAtTime(0, at + 0.08);
        pip.connect(volume);
        const high = context.createOscillator();
        high.frequency.setValueAtTime(freq * 2, at);
        high.connect(pip);
        high.start(at);
        high.stop(at + 0.1);
        release(high, [pip]);
      }
      release(tri, [under]);
      release(sine, nodes);
    },

  // star layer 2: a short bright stab, three saws (a root, its fifth, its octave) through a low-pass
  stunga: ({ context, outlet, release, random }) =>
    function stunga({ freq, at, vel = 1, into }) {
      if (!(freq > 0)) return;
      const end = at + 0.18;
      const { volume, nodes } = outlet((random() - 0.5) * 0.6, into, 0.25);
      volume.gain.setValueAtTime(0, at);
      volume.gain.linearRampToValueAtTime(LEVELS.stunga.play * vel, at + 0.003);
      volume.gain.exponentialRampToValueAtTime(0.0001, end);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
      filter.connect(volume);
      const saws = [1, 1.498, 2].map(ratio => {
        const saw = context.createOscillator();
        saw.type = 'sawtooth';
        saw.frequency.setValueAtTime(freq * ratio, at);
        saw.connect(filter);
        saw.start(at);
        saw.stop(end + 0.02);
        return saw;
      });
      saws.slice(1).forEach(saw => release(saw, []));
      release(saws[0], [filter, ...nodes]);
    },
};

// Slóeðla's tune, in 8ths, E minor (0 E, 2 G, 3 A, 4 B, 6 D, 7 the next E, 9 G, 10 A)
const TUNE = {
  vers: L('4! _ . 2 4 _ . .', '. . 3 _ 2 _ 0 .', '7! _ . 6 4 _ . .', '. . 3 _ 4 _ . .', '4! _ . 2 4 _ 6 _', '7 _ 6 _ 4 _ . .', '3! _ . 2 0 _ . .', '. . -1 _ 0 _ . .'),
  'vers/big': L('4! _ . 2 4 _ . .', '. 4 3 _ 2 _ 0 2', '7! _ . 6 4 _ . .', '. 4 3 _ 4 _ 6 _', '4! _ . 2 4 _ 6 _', '7 _ 6 _ 4 _ 2 4', '3! _ . 2 0 _ . .', '. 2 -1 _ 0 _ 2 3'),
  'vers/calm': L('4! _ _ _ _ _ . .', REST, '7! _ _ _ _ _ . .', REST, '4! _ _ _ 6 _ _ _', REST, '3! _ _ _ _ _ . .', REST),
  krokur: L('7! _ 7 _ 9 _ 7 4', '6 _ 4 _ 3! _ _ _', '7! _ 7 _ 9 _ 10 9', '7 _ 6 _ 4! _ _ _'),
  'krokur/big': L('7! 7 9 7 10 9 7 4', '6 _ 4 6 3! _ 4 _', '7! 7 9 7 11 _ 10 9', '10 _ 9 _ 7! _ _ _'),
  'krokur/calm': L('7! _ _ _ 4 _ _ _', '6 _ _ _ 3! _ _ _', '7! _ _ _ 9 _ _ _', '7 _ _ _ 4! _ _ _'),
  bru: L(REST, '4 _ _ _ 3 _ 2 _', REST, '0 _ _ _ _ _ . .'),
  endir: L('4 _ 2 _ 0 _ _ _', REST),
};

// star layer 1: an answer an octave down, in the gaps at the ends of bars
const ANSWER = {
  vers: L(REST, '. . . . . . . 4', REST, '. . . . . . 6 7', REST, '. . . . . . . 4', REST, '. . . . . . 2 0'),
  krokur: L(REST, '. . . . . . 4 6', REST, '. . . . . . 2 0'),
};
// star layer 2: a stab on beat four, on the bass's A then G
const STAB = L('. . . . . . 3 .', '. . . . . . 2 .');

export default {
  version: 2,
  id: 'fonk',
  name: 'Fönkhopp',
  tempo: { bpm: 95, offset: 0.0254 },
  key: { root: 'E', scale: 'minor', cents: 5.4 },
  sections: [
    { name: 'intro', bars: 2, fixed: true },
    { name: 'vers', bars: 8 },
    { name: 'krokur', bars: 4 },
    { name: 'vers', bars: 8 },
    { name: 'krokur', bars: 4 },
    { name: 'bru', bars: 4 },
    { name: 'krokur', bars: 4 },
    { name: 'endir', bars: 2, fixed: true },
  ],
  instruments: INSTRUMENTS,
  layers: [
    { id: 'trommur', owner: 'c', stem: 'drums.mp3' },
    { id: 'bassi', owner: 'b', stem: 'bass.mp3' },
    { id: 'lag', owner: 'a', part: { instrument: 'flauta', octave: 1, sections: TUNE } },
    { id: 'svar', owner: null, tier: 1, gain: 0.6, part: { instrument: 'flauta', octave: 0, sections: ANSWER } },
    { id: 'stunga', owner: null, tier: 2, part: { instrument: 'stunga', octave: 1, sections: { vers: STAB, krokur: STAB } } },
  ],
  chart,
};
