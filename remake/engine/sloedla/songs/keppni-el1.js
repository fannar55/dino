// "Risaeðlurokk": the song contest's first ElevenLabs entry (2026-10-29), happy kids' pop-rock played by a real-sounding band, made
// with ElevenLabs Music (assets/audio/sloedla/el-rokk.mp3, tools/sloedla-music.mjs preset `rokk`; its json has the plan and the
// measured grid: 127.998 a minute, steady within 1.1 ms). Split into stems that the dinosaurs own: the drums Þórseðla's, the bass
// Kambeðla's, the guitars Slóeðla's (the piano, "other" and vocal stems came back silent). The bass stem says the harmony is G and
// D, two bars each, all through (tools: the side notes' bass-roots.mjs), so the song is in G and every part is G major's
// pentatonic (G A B D E: steps 0 1 2 4 5), with G kept off the strong beats of the D bars. Bars as planned: intro 4, verse 8,
// chorus 8, verse, chorus, bridge 8, last chorus 8, outro 4. No key change (the recording cannot change key).
//
// Slóeðla plays her tune on a crunchy electric guitar of the song's own (`instruments.rafgitar`), to sit with the guitars she owns;
// Kambeðla rings glass bells (the track's glockenspiel), Þórseðla hits a floor tom.

const STAR1 = { inst: 'shaker', steps: 'oooooooooooooooo', tier: 1 };
const STAR2 = { inst: 'bell', line: '1 2 3 2 1 2 3 2', tier: 2, vel: 0.7 };
const STAR3 = { inst: 'choir', tier: 3, vel: 0.8 };
const BED = { inst: 'pad', vel: 0.4 }; // the skeleton's bed: the bar's chord, held

const SONG_CHORDS = 'I I V V'; // G G D D, as the bass plays it

const chorus = {
  bars: 8,
  chords: SONG_CHORDS,
  parts: [
    BED, STAR1, STAR2, STAR3,
    { inst: 'choir', when: 'big', vel: 0.5 },
    { role: 'a', notes: '9! _ _ 7 5 _ . . | 7! _ _ 5 4 _ . . | 8! _ 5 _ 4 _ 5 _ | 4! _ _ _ 1 _ . . | 9! _ _ 7 5 _ . . | 7! _ _ 9 7 _ . . | 8! _ 9 _ 8 _ 5 _ | 4! _ _ _ _ _ . .' },
    { role: 'b', notes: '. . . . 0! 2 4 2 | . . . . . . . . | . . . . 4! 5 8 5 | . . . . . . . . | . . . . 2! 4 7 4 | . . . . . . . . | . . . . 1! 2 4 5 | . . . . . . . .' },
    { role: 'c', notes: '0 . . . . . . . | 0 . . . 0! . 0 . | 4 . . . . . . . | 4 . . . 4! . 4 4 | 0 . . . . . . . | 0 . . . 0! . 0 . | 4 . . . . . . . | 4 . . . . . . .' },
  ],
};

// a crunchy electric guitar: two saws a little apart and a square an octave up, driven into a soft clipper, with the low mud and
// the fizz filtered off; struck harder when tapped (more drive, a pick's click)
function rafgitar({ context, outlet, release, puff }) {
  let curve = null;
  const clipper = () => {
    if (!curve) {
      curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 3.2);
      }
    }
    return curve;
  };
  return function play({ freq: f, at, dur = 0.4, vel = 1, soft = false, tapped = false, into }) {
    const level = (soft ? 0.045 : tapped ? 0.26 : 0.115) * vel; // set against the horn's (voices.js), measured offline
    const length = soft ? 0.25 : Math.max(0.3, dur) + 0.15;
    const end = at + length;
    const { volume, nodes } = outlet(-0.05, into, 0.2);
    const g = volume.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(level, at + 0.004);
    g.exponentialRampToValueAtTime(level * 0.6, at + 0.16);
    g.setValueAtTime(level * 0.6, Math.max(at + 0.17, end - 0.09));
    g.exponentialRampToValueAtTime(0.0001, end);
    const pre = context.createGain();
    pre.gain.value = tapped ? 3.2 : 2.2;
    const drive = context.createWaveShaper();
    drive.curve = clipper();
    drive.oversample = '2x';
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = Math.min(5600, f * 14);
    low.Q.value = 0.7;
    const high = context.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 120;
    pre.connect(drive);
    drive.connect(low);
    low.connect(high);
    high.connect(volume);
    const sources = [];
    for (const [type, ratio, detune, share] of [['sawtooth', 1, -7, 0.5], ['sawtooth', 1, 7, 0.5], ['square', 2, 0, 0.22]]) {
      const source = context.createOscillator();
      source.type = type;
      source.detune.value = detune;
      source.frequency.setValueAtTime(f * ratio * 0.985, at);
      source.frequency.exponentialRampToValueAtTime(f * ratio, at + 0.03);
      const mix = context.createGain();
      mix.gain.value = share;
      source.connect(mix);
      mix.connect(pre);
      sources.push(source);
      nodes.push(mix);
    }
    release(sources[0], [...sources.slice(1), pre, drive, low, high, ...nodes]);
    for (const source of sources) {
      source.start(at);
      source.stop(end + 0.02);
    }
    if (tapped) puff({ at, length: 0.02, level: level * 0.5, frequency: 3500, q: 1, pan: -0.05, attack: 0.001, dest: into });
  };
}

export default {
  id: 'keppni-el1',
  name: 'Risaeðlurokk',
  bpm: 127.998,
  root: 'G',
  scale: 'major',
  voices: { a: 'rafgitar', b: 'glass', c: 'rocktom' },
  instruments: { rafgitar },
  backing: {
    beatOffset: 0.028,
    gain: 0.6,
    stems: [
      { src: 'audio/sloedla/el-rokk-drums.mp3', gate: 'c' },
      { src: 'audio/sloedla/el-rokk-bass.mp3', gate: 'b' },
      { src: 'audio/sloedla/el-rokk-guitar.mp3', gate: 'a', gain: 1.4 },
    ],
  },
  form: ['intro', 'vers', 'vidlag', 'vers', 'vidlag', 'bru', 'lokavidlag', 'endir'],
  sections: {
    intro: {
      bars: 4,
      chords: 'I',
      fixed: true,
      parts: [
        BED,
        { role: 'a', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | 4! _ _ _ 2 _ . .' },
        { role: 'b', notes: '0 . 2 . 4 . 2 . | 0 . 2 . 4 . 2 . | . . . . 7! . 4 . | . . . . . . . .' },
        { role: 'c', notes: '. . . . . . . . | . . . . . . . . | 0! . . . . . . . | . . . . . . . .' },
      ],
    },
    vers: {
      bars: 8,
      chords: SONG_CHORDS,
      parts: [
        BED, STAR1, STAR2, STAR3,
        { role: 'a', notes: '. . . . 2! _ 4 5 | 4! _ _ _ . . . . | . . . . 5! _ 4 1 | 2 _ . . . . . . | . . . . 7! _ 5 4 | 5! _ 4 _ 2 _ . . | . . . . 4! _ 5 8 | 8 _ _ _ . . . .' },
        { role: 'b', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | 4! . 5 . 8! . 5 . | . . . . . . . . | . . . . . . . . | . . . . . . . . | 1! . 2 . 4 . . .' },
        { role: 'c', notes: '0! . . . . . . . | . . . . 0 . 0 . | 4! . . . . . . . | . . . . 4 . . . | 0! . . . . . . . | . . . . 0 . 0 . | 4! . . . . . . . | 4 . . . 4 . 4 4' },
      ],
    },
    vidlag: chorus,
    bru: {
      bars: 8,
      chords: SONG_CHORDS,
      parts: [
        BED, STAR1, STAR2, STAR3,
        { role: 'a', notes: '2! _ _ _ _ _ _ _ | 4! _ _ _ _ _ . . | 5! _ _ _ 4 _ . . | 1! _ _ _ _ _ _ _ | . . . . . . . . | 7! _ 5 _ . . . . | . . . . . . . . | 8! _ _ _ 9 _ 8 _' },
        { role: 'b', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | 0! 2 4 2 0 2 4 2 | . . . . . . . . | 4! 5 8 5 4 5 8 5 | . . . . . . . .' },
        { role: 'c', notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . 0! . . . | . . . . 0! . . . | . . . . 4! . 4 . | 4 . 4 . 4! 4 4 4' },
      ],
    },
    lokavidlag: chorus,
    endir: {
      bars: 4,
      chords: SONG_CHORDS,
      fixed: true,
      parts: [
        BED, STAR3,
        { role: 'a', notes: '7! _ _ _ 5 _ 4 _ | 2! _ _ _ . . . . | 4! _ _ _ _ _ _ _ | _ _ _ _ _ _ . .' },
        { role: 'b', notes: '. . . . . . . . | . . . . 0! 2 4 . | . . . . . . . . | . . . . . . . .' },
        { role: 'c', notes: '0 . . . . . . . | 0 . . . . . . . | 4 . . . 4! . . . | 4! . . . . . . .' },
      ],
    },
  },
};
