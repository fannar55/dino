// The sounds of Slóeðla's song game: each friend's instrument, the audience's cheer and the stars, made on the spot with Web Audio
// as the game's effects are (engine/audio/sfx.js, fen-sounds.js), and every pitched note a note of the song's key (its json `key`,
// a major pentatonic, root first: do re mi sol la) or an octave of one, so whatever the child taps sits in the song.
//
//   Slóeðla   her crest is a horn: a warm, brassy "bwaa" that slides up into its note and sings with a little vibrato
//   Kambeðla  her plates rung like a wooden xylophone: a round knock with a ring
//   Þórseðla  the thunder lizard's big drum: a deep boom with a rumble after it
//
// They are built here rather than through createSfx's own sounds (its tone has no vibrato or filter sweep, which a horn needs);
// they play through one bus into the page's output, which the music shares. A tap plays at once (at the context's current time).

/** The key's notes from its root up: step 0 is do, 5 the next do, and on (negative steps go down). */
export function scaleOf(key) {
  return step => key[((step % 5) + 5) % 5] * 2 ** Math.floor(step / 5);
}

/**
 * The sounds on `context` (an AudioContext), in the song's `key`, out through `output`. `random` jitters the audience.
 * Returns { play(role, step, { soft }), cheer(tier), sparkle(), star(n), stop() }.
 */
export function createSongSounds({ context, key, output, random = Math.random }) {
  const scale = scaleOf(key);
  const bus = context.createGain();
  bus.gain.value = 0.9;
  bus.connect(output ?? context.destination);
  const between = (low, high) => low + random() * (high - low);

  let noise = null; // two seconds of white noise, made once
  function noiseBuffer() {
    if (!noise) {
      noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    }
    return noise;
  }

  /** Lets a source's nodes go when it ends. */
  function release(source, nodes) {
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  /** The gain and pan at the end of a voice's chain. */
  function outlet(level, pan) {
    const volume = context.createGain();
    volume.gain.value = 0;
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      volume.connect(panner);
      panner.connect(bus);
      return { volume, nodes: [volume, panner] };
    }
    volume.connect(bus);
    return { volume, nodes: [volume] };
  }

  /** An oscillator note: up to `level` in `attack`, down to `hold` of it by `decay`, and out to silence at `length`. */
  function note({ frequency, type = 'sine', at, length, level, attack = 0.01, decay = length * 0.4, hold = 0.5, pan = 0, scoop = 1, bend = 0.06, into = null }) {
    const source = context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(frequency * scoop, at);
    if (scoop !== 1) source.frequency.exponentialRampToValueAtTime(frequency, at + bend);
    const { volume, nodes } = outlet(level, pan);
    const g = volume.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(level, at + attack);
    g.exponentialRampToValueAtTime(Math.max(0.0001, level * hold), at + Math.max(attack + 0.01, decay));
    g.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(into ?? volume);
    if (into) into.connect(volume);
    release(source, into ? [into, ...nodes] : nodes);
    source.start(at);
    source.stop(at + length + 0.02);
    return source;
  }

  /** A puff of noise through a filter sweeping from `frequency` to `end`. */
  function puff({ at, length, level, frequency, end = frequency, q = 0.8, type = 'bandpass', pan = 0, attack = 0.005 }) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer();
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, end), at + length);
    const { volume, nodes } = outlet(level, pan);
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(level, at + attack);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter);
    filter.connect(volume);
    release(source, [filter, ...nodes]);
    source.start(at, random() * 1.5);
    source.stop(at + length + 0.02);
  }

  /** A little bell (the game's toy glockenspiel: a round body and a quick overtone an octave up). */
  function bell(frequency, at, level = 0.05, length = 0.6, pan = 0) {
    note({ frequency, at, length, level, attack: 0.004, decay: length * 0.3, hold: 0.45, pan });
    note({ frequency: frequency * 2, at, length: length * 0.35, level: level * 0.2, attack: 0.003, decay: length * 0.1, hold: 0.3, pan });
  }

  // Slóeðla's horn: a saw and a triangle a hair apart through a low-pass filter that opens as she blows and settles, sliding up
  // into the note, with a breath at its start and a vibrato that comes in as it holds. Her steps sound an octave under the key's
  // bells (do is B-flat3), where a horn is warm.
  function horn(step, { soft = false, at = context.currentTime } = {}) {
    const f = scale(step) / 2;
    const length = soft ? 0.32 : 0.62;
    const level = soft ? 0.05 : 0.13;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(f * 1.6, at);
    filter.frequency.exponentialRampToValueAtTime(f * (soft ? 3.5 : 7), at + 0.07);
    filter.frequency.exponentialRampToValueAtTime(f * 3.2, at + 0.3);
    const { volume, nodes } = outlet(level, -0.02);
    const g = volume.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(level, at + 0.035);
    g.linearRampToValueAtTime(level * 0.7, at + 0.18);
    g.setValueAtTime(level * 0.7, at + length * 0.7);
    g.exponentialRampToValueAtTime(0.0001, at + length);
    filter.connect(volume);
    const vibrato = context.createOscillator();
    vibrato.frequency.value = 5.6;
    const depth = context.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(f * 0.012, at + 0.3);
    vibrato.connect(depth);
    const sources = [];
    for (const [type, detune, share] of [['sawtooth', 0, 0.55], ['triangle', 6, 1]]) {
      const source = context.createOscillator();
      source.type = type;
      source.detune.value = detune;
      source.frequency.setValueAtTime(f * 0.93, at);
      source.frequency.exponentialRampToValueAtTime(f, at + 0.075);
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
      source.stop(at + length + 0.02);
    }
    if (!soft) puff({ at, length: 0.07, level: 0.035, frequency: f * 5, end: f * 3, q: 1.2 });
  }

  // Kambeðla's plates: a wooden xylophone, a sine with its fourth partial knocking quickly over it and a click of the mallet.
  function plates(step, { soft = false, at = context.currentTime } = {}) {
    const f = scale(step) / 2; // her steps are high (5 and up), so this is the key's own register and above
    const level = soft ? 0.05 : 0.16;
    note({ frequency: f, at, length: soft ? 0.35 : 0.75, level, attack: 0.003, decay: 0.12, hold: 0.35, pan: -0.25 });
    note({ frequency: f * 4, at, length: 0.09, level: level * 0.35, attack: 0.002, decay: 0.03, hold: 0.3, pan: -0.25 });
    note({ frequency: f * 2, at, length: 0.3, level: level * 0.15, attack: 0.002, decay: 0.08, hold: 0.3, pan: -0.25 });
    puff({ at, length: 0.025, level: level * 0.4, frequency: 3200, q: 1.5, pan: -0.25, attack: 0.001 });
  }

  // Þórseðla's drum: a boom falling from high onto its note (do or sol two octaves down, low enough to be big and high enough for
  // a tablet's speakers to carry), its octave for the small speakers, a slap of skin and a low rumble of thunder after.
  function drum(step, { soft = false, at = context.currentTime } = {}) {
    const f = scale(step) / 4;
    const level = soft ? 0.12 : 0.34;
    note({ frequency: f, at, length: soft ? 0.3 : 0.7, level, attack: 0.004, decay: 0.16, hold: 0.4, scoop: 2.2, bend: 0.11, pan: 0.25 });
    note({ frequency: f * 2, at, length: 0.28, level: level * 0.35, attack: 0.004, decay: 0.08, hold: 0.3, scoop: 1.6, bend: 0.08, pan: 0.25 });
    puff({ at, length: 0.12, level: level * 0.45, frequency: 900, end: 300, type: 'lowpass', q: 0.7, pan: 0.25, attack: 0.002 });
    if (!soft) puff({ at: at + 0.04, length: 0.8, level: 0.05, frequency: 260, end: 120, type: 'lowpass', q: 0.5, pan: 0.25, attack: 0.08 });
  }

  const INSTRUMENTS = { a: horn, b: plates, c: drum };

  return {
    /**
     * `role`'s instrument plays `step` (chart.js: a Slóeðla, b Kambeðla, c Þórseðla); `soft` for a tap with no note. Now, or at
     * context time `on` if that is still to come, but no more than `within` seconds from now (an early tap waits for its beat).
     */
    play(role, step, { soft = false, on = null, within = 0 } = {}) {
      if (context.state !== 'running') return;
      const now = context.currentTime;
      const at = Number.isFinite(on) ? Math.max(now, Math.min(on, now + within)) : now;
      (INSTRUMENTS[role] ?? horn)(step, { soft, at });
    },
    /** The audience cheers, more of them the higher the `tier` (1 to 3): frogs croak, birds chirp, and at the top bells ring. */
    cheer(tier = 1) {
      if (context.state !== 'running') return;
      const now = context.currentTime;
      const many = 2 + tier * 2;
      for (let i = 0; i < many; i++) {
        const at = now + between(0, 0.5);
        const pan = between(-0.8, 0.8);
        if (i % 2 === 0) {
          // a frog: two croaks, the second a step up
          const n = Math.floor(between(0, 4));
          note({ frequency: scale(n) / 4, type: 'triangle', at, length: 0.1, level: 0.05, attack: 0.012, pan });
          note({ frequency: scale(n + 1) / 4, type: 'triangle', at: at + 0.13, length: 0.12, level: 0.05, attack: 0.012, pan });
        } else {
          // a bird: three quick chirps sliding up
          for (let k = 0; k < 3; k++) {
            const hz = scale(5 + Math.floor(between(0, 5))) * 2;
            note({ frequency: hz, at: at + k * 0.09, length: 0.08, level: 0.025, attack: 0.008, scoop: 0.85, bend: 0.05, pan });
          }
        }
      }
      if (tier >= 2) for (let i = 0; i < 6; i++) puff({ at: now + between(0, 0.6), length: 0.06, level: 0.03, frequency: between(1500, 3000), q: 2, pan: between(-0.9, 0.9) });
      if (tier >= 3) [5, 7, 9, 10].forEach((n, i) => bell(scale(n), now + 0.1 + i * 0.08, 0.04, 0.7, (i - 1.5) * 0.3));
    },
    /** A hit right on the beat: a glint of two high bells. */
    sparkle(step = 5) {
      if (context.state !== 'running') return;
      const now = context.currentTime;
      bell(scale(step + 5), now + 0.02, 0.025, 0.35);
      bell(scale(step + 7), now + 0.07, 0.02, 0.35);
    },
    /** The `n`th star (1 to 3) of the round's end: a bell a little higher each time, and a chord for the third. */
    star(n = 1) {
      if (context.state !== 'running') return;
      const now = context.currentTime;
      const top = [5, 7, 9][Math.max(0, Math.min(2, n - 1))];
      bell(scale(top), now, 0.08, 1.2);
      bell(scale(top + 5), now + 0.05, 0.03, 0.8);
      if (n === 3) [0, 2, 4].forEach((s, i) => bell(scale(5 + s), now + 0.25 + i * 0.07, 0.04, 1.4));
    },
    stop() {
      bus.disconnect();
    },
  };
}
