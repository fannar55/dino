// The instruments of "Hopp og hí!" (smidur-a.js), a calypso steel band: Slóeðla plays a steel pan, Kambeðla a ukulele and Þórseðla
// the surdo, the big drum of the carnival. Made on the spot with Web Audio from sounds.js's own parts (`outlet`, `release`, `tone`,
// `puff`, `random`: createSongSounds gives them to a song's instruments), so they play in any key, the last chorus's lift too.
//
//   stalpanna  a steel pan: a sine rung by another at its own pitch (FM 1:1) whose depth falls, a bright "ping" mellowing into a
//              round ring; its octave a hair sharp, the shimmer of a pan; a tok of the rubber stick. A long note is rolled, as a
//              pannist does (a quick tremolo on a held ring).
//   ukulele    a plucked nylon string: Karplus-Strong (a burst of noise round a delay line that loses a little each pass), worked
//              out once into a buffer per pitch and kept; two strings a hair apart, as a strum spreads.
//   surdo      a big drum: a skin that drops onto its note, its second mode (1.59 times), a felt beater's thump, and for a small
//              speaker its octave; a tap knocks the rim too.
//
// A note the child taps (`tapped`) is struck hard: louder (LEVELS), a sharp start and overtones a tablet's speaker can play. A tap
// at no note (`soft`) is a quiet one. The lanes are panned as they sit: Kambeðla left, Slóeðla in the middle, Þórseðla right.

/** How loud each plays: a note of her phrase that plays by itself, a note the child taps (the loudest), a stray tap. */
export const LEVELS = {
  stalpanna: { play: 0.2, tapped: 0.48, soft: 0.06 },
  ukulele: { play: 0.34, tapped: 1.05, soft: 0.1 },
  surdo: { play: 0.34, tapped: 0.52, soft: 0.12 },
};

const levelOf = (name, { soft = false, tapped = false } = {}) => (soft ? LEVELS[name].soft : tapped ? LEVELS[name].tapped : LEVELS[name].play);

/** A sine (or `type`) on `freq` from `at` to `end` into `dest`, sliding into its note from `scoop` times it over `bend` s. */
function sine(context, { freq, at, end, dest, type = 'sine', scoop = 1, bend = 0.05 }) {
  const source = context.createOscillator();
  source.type = type;
  source.frequency.setValueAtTime(freq * scoop, at);
  if (scoop !== 1) source.frequency.exponentialRampToValueAtTime(freq, at + bend);
  source.connect(dest);
  source.start(at);
  source.stop(end + 0.02);
  return source;
}

/** A gain that rises to `level` in `attack`, falls to `hold` of it by `decay`, keeps it to `sustain` (s from `at`) and dies by `end`. */
function envelope(context, { at, level, attack = 0.002, decay = 0.1, hold = 0.4, sustain = 0, end }) {
  const gain = context.createGain();
  const g = gain.gain;
  const held = Math.max(0.0001, level * hold);
  g.setValueAtTime(0, at);
  g.linearRampToValueAtTime(level, at + attack);
  g.exponentialRampToValueAtTime(held, at + attack + decay);
  if (sustain > attack + decay) g.setValueAtTime(held, at + sustain);
  g.exponentialRampToValueAtTime(0.0001, end);
  return gain;
}

export const INSTRUMENTS = {
  // Slóeðla's steel pan
  stalpanna: ({ context, outlet, release, puff }) =>
    function stalpanna({ freq: f, at, dur = 0.4, vel = 1, soft = false, tapped = false, into }) {
      const level = levelOf('stalpanna', { soft, tapped }) * vel;
      const roll = !soft && dur >= 0.7; // a long note is rolled
      const end = at + (soft ? 0.45 : roll ? dur + 0.4 : Math.min(1.25, Math.max(0.75, dur * 1.4 + 0.35)));
      const { volume, nodes } = outlet(0.05, into, 0.3);
      volume.gain.setValueAtTime(1, at);
      // the roll: a tremolo of about twelve strikes a second on the held ring, coming in after the first strike
      let head = volume;
      const sources = [];
      if (roll) {
        const trem = context.createGain();
        trem.gain.setValueAtTime(0.78, at);
        const lfo = context.createOscillator();
        lfo.frequency.value = 11.5;
        const depth = context.createGain();
        depth.gain.setValueAtTime(0, at);
        depth.gain.setValueAtTime(0, at + 0.1);
        depth.gain.linearRampToValueAtTime(0.22, at + 0.22);
        lfo.connect(depth);
        depth.connect(trem.gain);
        trem.connect(volume);
        head = trem;
        nodes.push(trem, depth);
        sources.push(lfo);
        lfo.start(at);
        lfo.stop(end + 0.02);
      }
      const hold = roll ? 0.5 : 0.38;
      const sustain = roll ? dur : 0;
      // the note: a carrier rung by a modulator at its own pitch, the ring's brightness falling as it sounds
      const body = envelope(context, { at, level, attack: tapped ? 0.0015 : 0.003, decay: 0.16, hold, sustain, end });
      body.connect(head);
      const carrier = sine(context, { freq: f, at, end, dest: body });
      const modulator = context.createOscillator();
      modulator.frequency.setValueAtTime(f, at);
      const index = context.createGain();
      const bright = tapped ? 2.3 : soft ? 0.7 : 1.5;
      index.gain.setValueAtTime(f * bright, at);
      index.gain.exponentialRampToValueAtTime(f * (roll ? 0.55 : 0.32), at + 0.3);
      modulator.connect(index);
      index.connect(carrier.frequency);
      modulator.start(at);
      modulator.stop(end + 0.02);
      sources.push(carrier, modulator);
      nodes.push(body, index);
      // the octave, a hair sharp (the pan's shimmer), and a twelfth that dies fast
      const octave = envelope(context, { at, level: level * 0.42, attack: 0.002, decay: 0.12, hold: roll ? 0.55 : 0.35, sustain, end: at + (end - at) * 0.75 });
      octave.connect(head);
      sources.push(sine(context, { freq: f * 2.004, at, end, dest: octave }));
      const twelfth = envelope(context, { at, level: level * (tapped ? 0.28 : 0.14), attack: 0.002, decay: 0.05, hold: 0.25, end: at + 0.22 });
      twelfth.connect(head);
      sources.push(sine(context, { freq: f * 2.998, at, end: at + 0.22, dest: twelfth }));
      nodes.push(octave, twelfth);
      // a tapped note: a ping two octaves up that a tablet carries
      if (tapped) {
        const ping = envelope(context, { at, level: level * 0.22, attack: 0.001, decay: 0.04, hold: 0.3, end: at + 0.12 });
        ping.connect(head);
        sources.push(sine(context, { freq: f * 4.01, at, end: at + 0.12, dest: ping }));
        nodes.push(ping);
      }
      release(sources[0], [...sources.slice(1), ...nodes]);
      // the rubber-tipped stick on the steel
      if (!soft) puff({ at, length: tapped ? 0.025 : 0.018, level: level * (tapped ? 0.35 : 0.18), frequency: Math.min(6000, f * 5), q: 1.4, pan: 0.05, attack: 0.001, dest: into });
    },

  // Kambeðla's ukulele
  ukulele: ({ context, outlet, release, puff, random }) => {
    const strings = new Map();
    /** A plucked string near `f`, worked out once (`bright`: 0 dark .. 2 bright); played at `rate` to be in tune. */
    function string(f, bright) {
      const sampleRate = context.sampleRate;
      const n = Math.max(4, Math.round(sampleRate / f - 0.5)); // the loop is n + 0.5 samples with the two-point average
      const tuned = sampleRate / (n + 0.5);
      const key = `${n}:${bright}`;
      let buffer = strings.get(key);
      if (!buffer) {
        const length = Math.floor(sampleRate * 1.3);
        buffer = context.createBuffer(1, length, sampleRate);
        const y = buffer.getChannelData(0);
        // the pluck: a burst of noise, darker for a softer touch (a one-pole low-pass), without its mean
        const smooth = [0.18, 0.45, 0.8][bright];
        let lp = 0;
        let mean = 0;
        for (let i = 0; i < n; i++) {
          lp += smooth * (random() * 2 - 1 - lp);
          y[i] = lp;
          mean += lp;
        }
        mean /= n;
        for (let i = 0; i < n; i++) y[i] -= mean;
        // each pass round the loop loses a little: the note dies about 60 dB in `ring` s (nylon, short)
        const ring = 0.9;
        const loss = Math.pow(0.001, 1 / (tuned * ring));
        for (let i = n; i < length; i++) y[i] = loss * 0.5 * (y[i - n] + y[i - n - 1 >= 0 ? i - n - 1 : i - n]);
        let peak = 0;
        for (let i = 0; i < Math.min(length, n * 6); i++) peak = Math.max(peak, Math.abs(y[i]));
        if (peak > 0) for (let i = 0; i < length; i++) y[i] /= peak;
        strings.set(key, buffer);
      }
      return { buffer, rate: f / tuned };
    }
    return function ukulele({ freq: f, at, dur = 0.3, vel = 1, soft = false, tapped = false, into }) {
      const level = levelOf('ukulele', { soft, tapped }) * vel;
      const length = soft ? 0.3 : Math.min(1.1, Math.max(0.3, dur + 0.22)); // the hand damps it after its note
      const { volume, nodes } = outlet(-0.3, into, 0.22);
      const g = volume.gain;
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(level, at + 0.0015); // the nail leaves the string: a blink, not a click
      g.setValueAtTime(level, at + length - 0.06);
      g.exponentialRampToValueAtTime(0.0001, at + length);
      // the body: a little warmth under the string, and the edge of a nylon string
      const body = context.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 420;
      body.Q.value = 1;
      body.gain.value = 3;
      const edge = context.createBiquadFilter();
      edge.type = 'lowpass';
      edge.frequency.value = Math.min(16000, f * (tapped ? 14 : soft ? 4 : 8));
      edge.Q.value = 0.6;
      body.connect(edge);
      edge.connect(volume);
      nodes.push(body, edge);
      const bright = tapped ? 2 : soft ? 0 : 1;
      const sources = [];
      // two strings a hair apart (a strum spreads); a tapped note is strummed hard across the octave under and over them
      const plucks = [[f, 0, 1], [f * 1.003, 0.011, 0.5]];
      if (tapped) plucks.push([f / 2, 0.006, 0.4], [f * 2, 0.018, 0.3]);
      for (const [pitch, delay, share] of plucks) {
        const { buffer, rate } = string(pitch, bright);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        const mix = context.createGain();
        mix.gain.value = share;
        source.connect(mix);
        mix.connect(body);
        nodes.push(mix);
        source.start(at + delay);
        source.stop(at + length + 0.02);
        sources.push(source);
      }
      release(sources[0], [...sources.slice(1), ...nodes]);
      if (tapped) puff({ at, length: 0.012, level: level * 0.3, frequency: 2800, q: 1.2, pan: -0.3, attack: 0.001, dest: into });
    };
  },

  // Þórseðla's surdo
  surdo: ({ tone, puff }) =>
    function surdo({ freq: f, at, vel = 1, soft = false, tapped = false, into }) {
      const level = levelOf('surdo', { soft, tapped }) * vel;
      const pan = 0.3;
      // the skin, stretched by the blow, drops onto its note and booms
      tone({ frequency: f, at, length: soft ? 0.35 : 0.95, level, attack: 0.003, decay: 0.14, hold: 0.45, scoop: 1.45, bend: 0.07, pan, dest: into, send: 0.18 });
      // its second mode, short
      tone({ frequency: f * 1.59, at, length: 0.28, level: level * 0.22, attack: 0.003, decay: 0.07, hold: 0.3, scoop: 1.3, bend: 0.05, pan, dest: into });
      // its octave, for a small speaker
      tone({ frequency: f * 2, type: 'triangle', at, length: 0.26, level: level * (tapped ? 0.75 : 0.3), attack: 0.003, decay: 0.07, hold: 0.3, scoop: 1.35, bend: 0.05, pan, dest: into });
      // the felt beater's thump
      puff({ at, length: 0.09, level: level * 0.5, frequency: 900, end: 180, type: 'lowpass', q: 0.7, pan, attack: 0.002, dest: into });
      if (tapped) {
        // the stick hits the skin and the rim with it, as the lead surdo does on a big beat: a knock two octaves up, a ring of the
        // metal rim (not on the note's partials), and a slap, which a tablet's speaker plays (the boom itself is too low for it)
        tone({ frequency: f * 4, type: 'triangle', at, length: 0.16, level: level * 0.85, attack: 0.001, decay: 0.045, hold: 0.3, scoop: 1.4, bend: 0.03, pan, dest: into });
        tone({ frequency: f * 6.3, at, length: 0.1, level: level * 0.22, attack: 0.001, decay: 0.03, hold: 0.25, pan, dest: into });
        puff({ at, length: 0.045, level: level * 0.95, frequency: 2100, end: 1400, q: 1.1, pan, attack: 0.001, dest: into });
      }
    },
};
