// "Lag Slóeðlu": chapter 5's song (chapters/kafli5.js, "Boð til Slóeðlu") as a song of the new kind (v2/format.js), half recording,
// half composed. The recording is the record DJ Flugeðla's set in the chapter is built on: "Djamm skógarins", an ElevenLabs Music
// track (tools/sloedla-music.mjs preset djamm, 2026-11-09; the owner's pick of the party tracks), a live disco-funk band, split
// into stems. The tune on top is hers: the one the animals' choir finds for her in the chapter (chapters/kafli5-song.js MELODY:
// sol mi | re mi do | la sol mi sol | la sol mi re do), which she plays here on her horn.
//   Þórseðla (c)  the drums (the recording): four on the floor
//   Kambeðla (b)  the bass (the recording): slapped, a bar a chord
//   Slóeðla (a)   her horn (composed): her tune whole in the three "lagid" sections and alone over the breakdown ("ludur"), and
//                 between them calls made of its phrases, one for each part of the record (the big animals low, the hopping ones
//                 short, the flying ones high)
//   the song      the rest of the band (the recording's guitar, keys, brass and strings, mixed into band.mp3)
// The record goes round A, E, F sharp minor and D, a bar each, and her tune keeps to A major's pentatonic notes (A B C# E F#), so
// every note of hers sits on every chord. It is tuned to the recording (key.cents, theme-tempo's measure), and its rhythm is the
// set's (tools/kafli5-lag/djamm-1/lib/score.mjs TUNE_AT: a phrase every two bars). The stems' notes for the child are read by
// tools/sloedla-stem-chart.mjs (sloedla.chart.js) around the tune's '!' notes. A recording cannot change key or size, so no section
// has a bigger or a calmer line, and the song has no star layers: a run is heard in the claps, the crowd and the DJ.
//
// 125 bpm (the drums measured 125.001, steady to 0.3 ms), A major; the first beat is 0.0518 s into the stems. The whole record:
//   intro 4 (the band's way in) | velkomin 4 | upphitun 8 | dansgolf 8 | lagid 8 | stor 8 | hopp 8 | flug 8 | ludur 8 (the
//   breakdown: her horn over a quiet band) | uppbygging 8 | drop 4 | lagid 8 | klapp 4 | lagid 8 | endir 4

import chart from './sloedla.chart.js';

const L = (...bars) => bars.join(' | ');
const REST = '. . . . . . . .';

/** How loud her horn plays: a note by itself, one the child taps (the loudest), a stray tap. */
const LEVELS = { play: 0.075, tapped: 0.18, soft: 0.03 };

const INSTRUMENTS = {
  // Slóeðla's horn, as chapter 4 made it (engine/audio/sfx.js sloedlaHorn) but true: a sawtooth and the hollow an octave under it
  // through her crest, a ringing low-pass that opens with her breath. It scoops up into its note and holds it with no wobble (in
  // the chapter the wobble is what is wrong with her horn before she finds her song). Tapped, it starts at once and her crest
  // opens wider, with a bright pip two octaves up that a tablet's speaker carries.
  ludur: ({ context, outlet, release, puff }) =>
    function ludur({ freq, at, dur = 0.4, vel = 1, soft = false, tapped = false, into }) {
      if (!(freq > 0)) return;
      const level = (soft ? LEVELS.soft : tapped ? LEVELS.tapped : LEVELS.play) * vel;
      const off = at + (soft ? 0.18 : Math.max(0.16, dur * 0.94));
      const end = off + 0.12;
      const { volume, nodes } = outlet(-0.1, into, 0.3);
      const g = volume.gain;
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(level, at + (tapped ? 0.012 : 0.05));
      g.linearRampToValueAtTime(level * 0.82, at + 0.22);
      g.setValueAtTime(level * 0.82, off);
      g.linearRampToValueAtTime(0, end);
      const crest = context.createBiquadFilter();
      crest.type = 'lowpass';
      crest.Q.value = 3;
      const open = tapped ? 2400 : 1500;
      crest.frequency.setValueAtTime(tapped ? 900 : 420, at);
      crest.frequency.linearRampToValueAtTime(open, at + (tapped ? 0.04 : 0.14));
      crest.frequency.linearRampToValueAtTime(open * 0.7, off);
      crest.frequency.linearRampToValueAtTime(380, end);
      crest.connect(volume);
      const voices = [['sawtooth', 1, 1], ['sine', 0.5, 0.6]].map(([type, share, gain]) => {
        const voice = context.createOscillator();
        voice.type = type;
        voice.frequency.setValueAtTime(freq * share * (tapped ? 1 : 0.955), at);
        voice.frequency.linearRampToValueAtTime(freq * share, at + 0.09);
        const mix = context.createGain();
        mix.gain.value = gain;
        voice.connect(mix);
        mix.connect(crest);
        voice.start(at);
        voice.stop(end + 0.02);
        return { voice, mix };
      });
      // her breath at the start of the note
      puff({ at, length: tapped ? 0.07 : 0.12, level: level * (tapped ? 0.4 : 0.22), frequency: freq * 3, q: 1.5, attack: 0.004, dest: into });
      if (tapped) {
        const pip = context.createGain();
        pip.gain.setValueAtTime(0.3, at);
        pip.gain.linearRampToValueAtTime(0, at + 0.09);
        pip.connect(volume);
        const high = context.createOscillator();
        high.frequency.setValueAtTime(freq * 4, at);
        high.connect(pip);
        high.start(at);
        high.stop(at + 0.11);
        release(high, [pip]);
      }
      release(voices[1].voice, [voices[1].mix]);
      release(voices[0].voice, [voices[0].mix, crest, ...nodes]);
    },
};

// Her tune, in 8ths, A major (0 A do, 1 B re, 2 C# mi, 4 E sol, 5 F# la, 7 the next A): a phrase every two bars, each a note longer
// than the last, as the choir found it. The first note of every phrase is the child's.
const TUNE = L(
  '4! _ _ 2 _ _ _ _', '_ _ _ _ _ . . .',
  '1! _ _ 2 _ _ 0 _', '_ _ _ _ _ _ _ .',
  '5! _ _ 4 _ _ 2 _', '4 _ _ _ _ _ _ .',
  '5! _ _ 4 _ _ 2 1', '0 _ _ _ _ _ _ _',
);
// Between the tunes she calls with its phrases, and the line goes round to fill its section.
const HORN = {
  // her first call as the band says hello: the tune's first two notes, and again
  velkomin: L('4! _ _ 2 _ _ _ _', '_ _ . . . . . .'),
  // the first half of her tune, with room to breathe
  upphitun: L('4! _ _ 2 _ _ _ _', '_ _ . . . . . .', '1! _ _ 2 _ _ 0 _', '_ _ _ . . . . .'),
  // and the second half
  dansgolf: L('5! _ _ 4 _ _ 2 _', '4! _ _ _ . . . .', '5! _ _ 4 _ _ 2 1', '0! _ _ _ . . . .'),
  lagid: TUNE,
  // the big animals (the grazers' do and the turtles' re): low and long
  stor: L('0! _ _ _ 1 _ 0 _', '_ _ . . . . . .', '0! _ _ _ 1 _ 2 _', '_ _ . . . . . .'),
  // the hopping animals (the frogs' mi and the small lizards' sol): short notes that bounce
  hopp: L('2! . 2 . 4 _ . .', '2! . 2 . 4 _ 2 _', '4! . 4 . 2 _ . .', '4! . 2 . 0 _ . .'),
  // the flying animals (la, and up to the next do): high and held
  flug: L('5! _ _ _ 4 _ 5 _', '_ _ _ _ . . . .', '5! _ 7 _ 5 _ 4 _', '_ _ _ _ . . . .'),
  // the breakdown is hers: the whole tune over a quiet band
  ludur: TUNE,
  // the build: up her five notes, slowly and then twice as fast, and she holds the top
  uppbygging: L('0! _ _ _ 1 _ _ _', '2! _ _ _ 4 _ _ _', '5! _ _ _ 4 _ _ _', '5! _ _ _ 7 _ _ _', '0! _ 1 _ 2 _ 4 _', '5! _ 4 _ 5 _ 7 _', '7! _ _ _ _ _ _ _', '_ _ _ _ . . . .'),
  // the drop: the tune's last phrase, home to do, twice
  drop: L('5! _ _ 4 _ _ 2 1', '0! _ _ _ . . . .'),
  // the last note, held as the band goes
  endir: L('0! _ _ _ _ _ _ _', '_ _ _ _ . . . .', REST, REST),
};

export default {
  version: 2,
  id: 'sloedla',
  name: 'Lag Slóeðlu',
  tempo: { bpm: 125, offset: 0.0518 },
  key: { root: 'A', scale: 'major', cents: 2.6 },
  gain: 0.84, // the record is 1.5 dB louder than Rokkhopp's and Fönkhopp's (-12.1 against -13.7 and -13.6 LUFS)
  sections: [
    { name: 'intro', bars: 4, fixed: true },
    { name: 'velkomin', bars: 4 },
    { name: 'upphitun', bars: 8 },
    { name: 'dansgolf', bars: 8 },
    { name: 'lagid', bars: 8 },
    { name: 'stor', bars: 8 },
    { name: 'hopp', bars: 8 },
    { name: 'flug', bars: 8 },
    { name: 'ludur', bars: 8 },
    { name: 'uppbygging', bars: 8 },
    { name: 'drop', bars: 4 },
    { name: 'lagid', bars: 8 },
    { name: 'klapp', bars: 4 },
    { name: 'lagid', bars: 8 },
    { name: 'endir', bars: 4, fixed: true },
  ],
  instruments: INSTRUMENTS,
  layers: [
    { id: 'ludur', owner: 'a', part: { instrument: 'ludur', octave: 0, sections: HORN } },
    { id: 'bassi', owner: 'b', stem: 'bass.mp3' },
    { id: 'trommur', owner: 'c', stem: 'drums.mp3' },
    { id: 'sveit', owner: null, stem: 'band.mp3' },
  ],
  chart,
};
