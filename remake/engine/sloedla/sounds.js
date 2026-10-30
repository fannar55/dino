// The dinosaurs' instruments in Slóeðla's song game, made on the spot with Web Audio as the game's effects are (engine/audio/sfx.js,
// fen-sounds.js). Each plays the part the child taps (song.js: the lead, the riff, the beat), at whatever pitch the song asks:
//
//   Slóeðla   (role a) her crest is a horn: a warm, brassy "bwaa" that slides up into its note and sings with a little vibrato
//   Kambeðla  (role b) her plates rung like a wooden xylophone: a round knock with a ring
//   Þórseðla  (role c) the thunder lizard's big drum: a deep boom with a rumble after it
//
// The conductor (conductor.js) schedules a part's notes a little ahead into the role's gate (`into`), which it shuts when the child
// misses a note and opens when she hits one, so a missed note leaves a hole in the song, as in Guitar Hero. A tap that is not a hit
// still plays a soft note (`soft`), straight away, so tapping is always music. The end's stars ring with bells.
//
// These three are the first instruments; a song may give the dinosaurs others that suit it (voices.js), each keeping her place in
// the band. How loud each plays (a note of her phrase, a note the child taps, a stray tap) is voices.js VOICE_LEVELS.

import { VOICES_DEFAULT, levelOf, createVoices } from './voices.js';

/** The key's notes from its root up: step 0 is do, 5 the next do, and on (negative steps go down). Pentatonic `key` (5 notes). */
export function scaleOf(key) {
  return step => key[((step % 5) + 5) % 5] * 2 ** Math.floor(step / 5);
}

/**
 * The instruments on `context`, out through `output` unless a note names its own node (`into`). `room` is the reverb send, if any;
 * `voices` the song's instruments by role ({ a: 'piano', ... }, voices.js), the first ones where it names none; `instruments` a song's
 * own instruments ({ name: tools => play }: tools are { context, outlet, release, tone, puff, levelOf, random }, play takes
 * { freq, at, dur, vel, soft, tapped, into } like the others).
 * Returns { note(role, { freq, at, dur, vel, into, soft, tapped }), oops(role, ...), sparkle(freq), star(n, freq), voices }.
 */
export function createSongSounds({ context, output, room = null, random = Math.random, voices = null, instruments = null }) {
  const bus = context.createGain();
  bus.gain.value = 1;
  bus.connect(output ?? context.destination);

  let noise = null;
  function noiseBuffer() {
    if (!noise) {
      noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    }
    return noise;
  }

  function release(source, nodes) {
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  /** The gain at the end of a voice, panned, into `dest`, with a share sent to the room. */
  function outlet(pan, dest, send = 0) {
    const volume = context.createGain();
    volume.gain.value = 0;
    const nodes = [volume];
    let last = volume;
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      volume.connect(panner);
      last = panner;
      nodes.push(panner);
    }
    last.connect(dest ?? bus);
    if (send > 0 && room) {
      const wet = context.createGain();
      wet.gain.value = send;
      last.connect(wet);
      wet.connect(room);
      nodes.push(wet);
    }
    return { volume, nodes };
  }

  /** An oscillator note: up to `level` in `attack`, down to `hold` of it by `decay`, out to silence at `length`. */
  function tone({ frequency, type = 'sine', at, length, level, attack = 0.01, decay = length * 0.4, hold = 0.5, pan = 0, scoop = 1, bend = 0.06, dest, send = 0 }) {
    const source = context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(frequency * scoop, at);
    if (scoop !== 1) source.frequency.exponentialRampToValueAtTime(frequency, at + bend);
    const { volume, nodes } = outlet(pan, dest, send);
    const g = volume.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(level, at + attack);
    g.exponentialRampToValueAtTime(Math.max(0.0001, level * hold), at + Math.max(attack + 0.01, decay));
    g.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(volume);
    release(source, nodes);
    source.start(at);
    source.stop(at + length + 0.02);
  }

  /** A puff of noise through a filter sweeping from `frequency` to `end`. */
  function puff({ at, length, level, frequency, end = frequency, q = 0.8, type = 'bandpass', pan = 0, attack = 0.005, dest }) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer();
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, end), at + length);
    const { volume, nodes } = outlet(pan, dest);
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(level, at + attack);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter);
    filter.connect(volume);
    release(source, [filter, ...nodes]);
    source.start(at, random() * 1.5);
    source.stop(at + length + 0.02);
  }

  function bell(frequency, at, level = 0.05, length = 0.6, pan = 0) {
    tone({ frequency, at, length, level, attack: 0.004, decay: length * 0.3, hold: 0.45, pan, send: 0.3 });
    tone({ frequency: frequency * 2, at, length: length * 0.35, level: level * 0.2, attack: 0.003, decay: length * 0.1, hold: 0.3, pan });
  }

  // Slóeðla's horn: a saw and a triangle a hair apart through a low-pass that opens as she blows and settles, sliding up into the
  // note, with a breath at its start and a vibrato that comes in as it holds. A note the child taps is blown hard: it starts at
  // once, bright, with a blat an octave up that a small speaker carries.
  function horn({ freq: f, at, dur = 0.5, vel = 1, soft = false, tapped = false, into }) {
    const length = soft ? 0.32 : Math.max(0.22, dur);
    const level = levelOf('horn', { soft, tapped }) * vel;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(f * (tapped ? 5 : 1.6), at);
    filter.frequency.exponentialRampToValueAtTime(f * (soft ? 3.5 : tapped ? 10 : 7), at + (tapped ? 0.03 : 0.07));
    filter.frequency.exponentialRampToValueAtTime(f * (tapped ? 4.5 : 3.4), at + 0.3);
    const { volume, nodes } = outlet(-0.02, into, 0.25);
    const g = volume.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(level, at + (tapped ? 0.006 : 0.03));
    g.linearRampToValueAtTime(level * 0.72, at + Math.min(0.18, length * 0.5));
    g.setValueAtTime(level * 0.72, at + length * 0.8);
    g.exponentialRampToValueAtTime(0.0001, at + length + 0.08);
    filter.connect(volume);
    const vibrato = context.createOscillator();
    vibrato.frequency.value = 5.6;
    const depth = context.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(f * 0.012, at + Math.min(0.35, length));
    vibrato.connect(depth);
    const sources = [];
    for (const [type, detune, share] of [['sawtooth', 0, 0.55], ['triangle', 6, 1]]) {
      const source = context.createOscillator();
      source.type = type;
      source.detune.value = detune;
      source.frequency.setValueAtTime(f * 0.93, at);
      source.frequency.exponentialRampToValueAtTime(f, at + (tapped ? 0.035 : 0.07));
      depth.connect(source.frequency);
      const mix = context.createGain();
      mix.gain.value = share;
      source.connect(mix);
      mix.connect(filter);
      sources.push(source);
      nodes.push(mix);
    }
    release(sources[0], [sources[1], filter, depth, vibrato, ...nodes]);
    for (const source of [...sources, vibrato]) {
      source.start(at);
      source.stop(at + length + 0.1);
    }
    if (!soft) puff({ at, length: 0.07, level: (tapped ? 0.08 : 0.035) * vel, frequency: f * (tapped ? 7 : 5), end: f * 3, q: 1.2, dest: into });
    if (tapped) tone({ frequency: f * 2, type: 'square', at, length: 0.18, level: level * 0.28, attack: 0.004, decay: 0.06, hold: 0.25, pan: -0.02, dest: into });
  }

  // Kambeðla's plates: a wooden xylophone, a sine with its fourth partial knocking quickly over it and a click of the mallet. A note
  // the child taps is struck hard: the knock and the click louder, the octave ringing more.
  function plates({ freq: f, at, dur = 0.4, vel = 1, soft = false, tapped = false, into }) {
    const level = levelOf('plates', { soft, tapped }) * vel;
    const ring = soft ? 0.35 : Math.min(1.1, Math.max(0.5, dur * 1.5));
    tone({ frequency: f, at, length: ring, level, attack: 0.003, decay: 0.12, hold: 0.35, pan: -0.25, dest: into, send: 0.2 });
    tone({ frequency: f * 4, at, length: 0.09, level: level * (tapped ? 0.55 : 0.35), attack: 0.002, decay: 0.03, hold: 0.3, pan: -0.25, dest: into });
    tone({ frequency: f * 2, at, length: 0.3, level: level * (tapped ? 0.5 : 0.15), attack: 0.002, decay: 0.08, hold: 0.3, pan: -0.25, dest: into });
    puff({ at, length: tapped ? 0.03 : 0.025, level: level * (tapped ? 0.9 : 0.4), frequency: 3200, q: 1.5, pan: -0.25, attack: 0.001, dest: into });
  }

  // Þórseðla's drum: a boom falling from high onto its note, its octave for small speakers, a slap of skin and a rumble of thunder.
  // A note the child taps is hit hard: a crack of the beater and a knock two octaves up, which a tablet's speaker can play (the boom
  // itself is too low for it).
  function drum({ freq: f, at, vel = 1, soft = false, tapped = false, into }) {
    const level = levelOf('drum', { soft, tapped }) * vel;
    tone({ frequency: f, at, length: soft ? 0.3 : 0.7, level, attack: 0.004, decay: 0.16, hold: 0.4, scoop: 2.2, bend: 0.11, pan: 0.25, dest: into, send: 0.15 });
    tone({ frequency: f * 2, at, length: 0.28, level: level * (tapped ? 0.6 : 0.35), attack: 0.004, decay: 0.08, hold: 0.3, scoop: 1.6, bend: 0.08, pan: 0.25, dest: into });
    puff({ at, length: 0.12, level: level * 0.45, frequency: 900, end: 300, type: 'lowpass', q: 0.7, pan: 0.25, attack: 0.002, dest: into });
    if (tapped) {
      tone({ frequency: f * 4, type: 'triangle', at, length: 0.14, level: level * 0.5, attack: 0.002, decay: 0.04, hold: 0.25, scoop: 1.5, bend: 0.04, pan: 0.25, dest: into });
      puff({ at, length: 0.025, level: level * 0.5, frequency: 2500, q: 1.1, pan: 0.25, attack: 0.001, dest: into });
    }
    if (!soft) puff({ at: at + 0.04, length: 0.8, level: 0.05 * vel, frequency: 260, end: 120, type: 'lowpass', q: 0.5, pan: 0.25, attack: 0.08, dest: into });
  }

  // a song may bring instruments of its own (song.instruments: { name: tools => play }), made with the same parts
  const own = Object.fromEntries(Object.entries(instruments ?? {}).map(([name, make]) => [name, make({ context, outlet, release, tone, puff, levelOf, random })]));
  const INSTRUMENTS = { horn, plates, drum, ...createVoices({ context, outlet, release, tone, puff }), ...own };
  const kit = { ...VOICES_DEFAULT };
  for (const role of Object.keys(kit)) if (INSTRUMENTS[voices?.[role]]) kit[role] = voices[role];

  return {
    /** The instrument each role plays on, by name. */
    voices: kit,
    /**
     * `role`'s instrument plays a note: `freq` Hz at context time `at` (now by default) for `dur` s, into `into` (the bus).
     * `tapped`: the child tapped it (struck hard); `soft`: a tap at no note.
     */
    note(role, { freq, at = context.currentTime, dur, vel = 1, into, soft = false, tapped = false }) {
      if (!(freq > 0)) return;
      (INSTRUMENTS[kit[role]] ?? horn)({ freq, at: Math.max(at, context.currentTime), dur, vel, into, soft, tapped: tapped && !soft });
    },
    /**
     * The instrument called `instrument` (a song's own, or one of these) plays a note, for the songs of the new kind (v2/player.js):
     * its options as they are, `step` too (the scale step, which a drum kit of a song's own reads as which drum), `at` not before
     * now. An instrument nobody knows plays nothing.
     */
    play(instrument, { freq, step, at = context.currentTime, dur, vel = 1, into, soft = false, tapped = false } = {}) {
      const make = INSTRUMENTS[instrument];
      if (!make) return;
      make({ freq, step, at: Math.max(at, context.currentTime), dur, vel, into, soft, tapped: tapped && !soft });
    },
    /**
     * A missed note: a soft "bloop" in her own voice that slides down two semitones, 0.3 s, never a buzzer (the gentle form of
     * Guitar Hero's wrong-note sound). `freq` is the note she missed.
     */
    oops(role, { freq = 233, into } = {}) {
      if (!(freq > 0)) return;
      const at = context.currentTime + 0.005;
      const down = freq * 0.891; // two semitones under
      if (role === 'c') {
        tone({ frequency: down, type: 'sine', at, length: 0.32, level: 0.16, attack: 0.006, decay: 0.12, hold: 0.3, scoop: 1.12, bend: 0.22, pan: 0.25, dest: into });
        puff({ at, length: 0.1, level: 0.05, frequency: 500, end: 200, type: 'lowpass', q: 0.6, pan: 0.25, dest: into });
      } else {
        const pan = role === 'b' ? -0.25 : 0;
        tone({ frequency: down, type: 'triangle', at, length: 0.34, level: 0.075, attack: 0.012, decay: 0.15, hold: 0.4, scoop: 1.12, bend: 0.25, pan, dest: into });
        tone({ frequency: down / 2, type: 'sine', at, length: 0.3, level: 0.04, attack: 0.012, decay: 0.12, hold: 0.4, scoop: 1.12, bend: 0.25, pan, dest: into });
      }
    },
    /** A hit right on the beat: a glint of two high bells, on `freq`'s octaves. */
    sparkle(freq = 880) {
      const now = context.currentTime;
      bell(freq * 2, now + 0.02, 0.022, 0.35);
      bell(freq * 3, now + 0.07, 0.016, 0.35);
    },
    /** The `n`th star (1 to 3) of the round's end, on the song's root `freq`: a bell a little higher each time, a chord for the third. */
    star(n = 1, freq = 466) {
      const now = context.currentTime;
      const ratio = [1, 1.25, 1.5][Math.max(0, Math.min(2, n - 1))];
      bell(freq * 2 * ratio, now, 0.08, 1.2);
      bell(freq * 4 * ratio, now + 0.05, 0.03, 0.8);
      if (n === 3) [1, 1.25, 1.5, 2].forEach((r, i) => bell(freq * 2 * r, now + 0.25 + i * 0.07, 0.04, 1.4));
    },
  };
}
