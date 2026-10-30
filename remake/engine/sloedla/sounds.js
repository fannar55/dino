// The sounds a round of Slóeðla's song game makes on the spot with Web Audio, as the game's effects are (engine/audio/sfx.js,
// fen-sounds.js): a song's own instruments (v2 songs bring them, each made from the parts here: an outlet, a tone, a puff of noise),
// a missed note's soft bloop, a hit's glint and the end's stars, rung with bells.
//
// The player (v2/player.js) schedules a part's notes a little ahead into the dinosaur's chain (`into`), which closes when the child
// misses a note and opens when she hits one, so a missed note leaves a hole in the song, as in Guitar Hero. A tap that is not a hit
// still plays a soft note (`soft`), straight away, so tapping is always music.

/**
 * The sounds on `context`, out through `output` unless a note names its own node (`into`). `room` is the reverb send, if any;
 * `instruments` a song's own instruments ({ name: tools => play }: tools are { context, outlet, release, tone, puff, random }, play
 * takes { freq, step, at, dur, vel, soft, tapped, into }).
 * Returns { play(instrument, ...), oops(role, ...), sparkle(freq), star(n, freq) }.
 */
export function createSongSounds({ context, output, room = null, random = Math.random, instruments = null }) {
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

  // the song's own instruments (song.instruments: { name: tools => play }), made with the parts above
  const INSTRUMENTS = Object.fromEntries(Object.entries(instruments ?? {}).map(([name, make]) => [name, make({ context, outlet, release, tone, puff, random })]));

  return {
    /**
     * The instrument called `instrument` (one of the song's own) plays a note: its options as they are, `step` too (the scale
     * step, which a drum kit of a song's own reads as which drum), `at` not before now. `tapped`: the child tapped it (struck hard);
     * `soft`: a tap at no note. An instrument nobody knows plays nothing.
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
