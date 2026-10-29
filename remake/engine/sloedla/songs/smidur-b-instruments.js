// The instruments of "Hoppsasa!" (smidur-b.js), a Caribbean carnival band made on the spot with Web Audio, as the game's own
// instruments are (voices.js): each is `tools => play`, `tools` being sounds.js's parts ({ context, outlet, release, tone, puff }),
// and play takes { freq, at, dur, vel, soft, tapped, into } like the others.
//
//   Slóeðla   (a) stalpanna  a steel pan: the note, its octave and its twelfth, each dying at its own speed, and a tick of the stick;
//                            a long note is rolled (a tremolo), as a panman rolls a held note with both sticks
//   Kambeðla  (b) marimba    warm wood: the note, the partial two octaves up that a marimba bar is tuned to, a soft mallet thock
//   Þórseðla  (c) sousafonn  a sousaphone's "BOMP": a saw, a square and a sine under them, sliding up into the note through a filter
//                            that opens as the lips buzz; a tapped note blats an octave up, so a tablet's small speaker hears it
//
// A note the child taps (`tapped`) is struck hard (LEVELS.tapped, a sharper, brighter start); a tap at no note (`soft`) is quiet.

/** How loud each plays: a note of her phrase that plays by itself, a note the child taps, a stray tap. */
export const LEVELS = {
  stalpanna: { play: 0.26, tapped: 0.56, soft: 0.08 },
  marimba: { play: 0.26, tapped: 0.5, soft: 0.09 },
  sousafonn: { play: 0.3, tapped: 0.62, soft: 0.11 },
};

const levelOf = (name, { soft = false, tapped = false }) => (soft ? LEVELS[name].soft : tapped ? LEVELS[name].tapped : LEVELS[name].play);

/** A sine (or `type`) at `freq` from `at` to `end` into `into`, through a gain that starts at `share` and dies to `floor` of it by `life`. */
function partial(context, { freq, at, end, share, life, floor = 0.01, type = 'sine', detune = 0, into, nodes, sources }) {
  const source = context.createOscillator();
  source.type = type;
  source.frequency.setValueAtTime(freq, at);
  source.detune.value = detune;
  const gain = context.createGain();
  gain.gain.setValueAtTime(share, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, share * floor), at + Math.max(0.01, life));
  source.connect(gain);
  gain.connect(into);
  source.start(at);
  source.stop(end + 0.02);
  sources.push(source);
  nodes.push(gain);
  return source;
}

export const INSTRUMENTS = {
  stalpanna({ context, outlet, release, puff }) {
    return function stalpanna({ freq: f, at, dur = 0.4, vel = 1, soft = false, tapped = false, into }) {
      const level = levelOf('stalpanna', { soft, tapped }) * vel;
      const roll = !soft && dur >= 0.9; // two beats or more: rolled
      const end = at + (soft ? 0.45 : roll ? dur + 0.35 : Math.min(1.4, Math.max(0.6, dur * 1.3 + 0.25)));
      const { volume, nodes } = outlet(-0.05, into, 0.32);
      const sources = [];
      const g = volume.gain;
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(level, at + (tapped ? 0.002 : 0.004));
      if (roll) {
        g.exponentialRampToValueAtTime(level * 0.55, at + 0.16);
        g.setValueAtTime(level * 0.55, at + dur - 0.05);
        g.exponentialRampToValueAtTime(0.0001, end);
      } else {
        g.exponentialRampToValueAtTime(level * 0.4, at + 0.16);
        g.exponentialRampToValueAtTime(0.0001, end);
      }
      let head = volume;
      if (roll) {
        // the roll: the note's level wobbles a dozen times a second once it is held
        const tremolo = context.createGain();
        tremolo.gain.value = 1;
        const lfo = context.createOscillator();
        lfo.frequency.value = 12.5;
        const depth = context.createGain();
        depth.gain.setValueAtTime(0, at);
        depth.gain.setValueAtTime(0, at + 0.12);
        depth.gain.linearRampToValueAtTime(0.42, at + 0.3);
        lfo.connect(depth);
        depth.connect(tremolo.gain);
        tremolo.connect(volume);
        lfo.start(at);
        lfo.stop(end + 0.02);
        sources.push(lfo);
        nodes.push(tremolo, depth);
        head = tremolo;
      }
      const bright = tapped ? 1.6 : soft ? 0.6 : 1;
      partial(context, { freq: f, at, end, share: 0.62, life: end - at, floor: 1, into: head, nodes, sources });
      partial(context, { freq: f * 2, at, end, share: 0.36 * bright, life: roll ? dur : 0.55, floor: roll ? 0.5 : 0.05, detune: 4, into: head, nodes, sources });
      partial(context, { freq: f * 3, at, end, share: 0.13 * bright, life: 0.28, floor: 0.02, into: head, nodes, sources });
      partial(context, { freq: f * 4, at, end, share: 0.05 * bright, life: 0.12, floor: 0.02, into: head, nodes, sources });
      release(sources[0], [...sources.slice(1), ...nodes]); // every source stops at `end`
      puff({ at, length: 0.014, level: level * (tapped ? 0.45 : 0.16), frequency: 4200, q: 1.3, pan: -0.05, attack: 0.001, dest: into });
    };
  },

  marimba({ tone, puff }) {
    return function marimba({ freq: f, at, dur = 0.4, vel = 1, soft = false, tapped = false, into }) {
      const level = levelOf('marimba', { soft, tapped }) * vel;
      const ring = soft ? 0.35 : Math.min(1.0, Math.max(0.5, dur * 1.4));
      const pan = -0.28;
      tone({ frequency: f, at, length: ring, level, attack: 0.003, decay: 0.1, hold: 0.5, pan, dest: into, send: 0.22 });
      tone({ frequency: f * 4, at, length: 0.1, level: level * (tapped ? 0.5 : 0.28), attack: 0.002, decay: 0.035, hold: 0.25, pan, dest: into });
      tone({ frequency: f * 10, at, length: 0.035, level: level * 0.06, attack: 0.001, decay: 0.012, hold: 0.2, pan, dest: into });
      if (tapped) tone({ frequency: f * 2, at, length: 0.22, level: level * 0.3, attack: 0.002, decay: 0.06, hold: 0.3, pan, dest: into });
      puff({ at, length: tapped ? 0.03 : 0.022, level: level * (tapped ? 0.7 : 0.35), frequency: 1600, end: 700, q: 1.1, pan, attack: 0.001, dest: into });
    };
  },

  sousafonn({ context, outlet, release, tone, puff }) {
    return function sousafonn({ freq: f, at, dur = 0.3, vel = 1, soft = false, tapped = false, into }) {
      const level = levelOf('sousafonn', { soft, tapped }) * vel;
      const length = soft ? 0.22 : Math.min(0.9, Math.max(0.2, dur * 0.85)) + 0.05;
      const attack = tapped ? 0.006 : 0.018;
      const pan = 0.22;
      const { volume, nodes } = outlet(pan, into, 0.15);
      const g = volume.gain;
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(level, at + attack);
      g.exponentialRampToValueAtTime(level * 0.62, at + attack + 0.12);
      g.setValueAtTime(level * 0.62, Math.max(at + attack + 0.12, at + length - 0.06));
      g.exponentialRampToValueAtTime(0.0001, at + Math.max(attack + 0.18, length + 0.06));
      const end = at + Math.max(attack + 0.18, length + 0.06);
      // the lips: a low-pass that opens with the buzz and settles
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 1.6;
      filter.frequency.setValueAtTime(f * 1.3, at);
      filter.frequency.exponentialRampToValueAtTime(f * (tapped ? 11 : soft ? 4 : 7), at + (tapped ? 0.03 : 0.05));
      filter.frequency.exponentialRampToValueAtTime(f * (tapped ? 4.5 : 3.4), at + 0.25);
      filter.connect(volume);
      nodes.push(filter);
      const sources = [];
      for (const [type, share, detune] of [['sawtooth', 0.55, 0], ['square', 0.18, -6], ['sine', 0.3, 0]]) {
        const source = context.createOscillator();
        source.type = type;
        source.detune.value = detune;
        source.frequency.setValueAtTime(f * 0.92, at); // the "bw-" of BOMP: up into the note
        source.frequency.exponentialRampToValueAtTime(f, at + 0.05);
        const gain = context.createGain();
        gain.gain.value = share;
        source.connect(gain);
        gain.connect(filter);
        source.start(at);
        source.stop(end + 0.02);
        sources.push(source);
        nodes.push(gain);
      }
      release(sources[0], [...sources.slice(1), ...nodes]);
      puff({ at, length: 0.035, level: level * (tapped ? 0.35 : 0.15), frequency: f * 8, end: f * 4, q: 1.4, pan, attack: 0.002, dest: into });
      if (tapped) tone({ frequency: f * 2, type: 'square', at, length: 0.13, level: level * 0.22, attack: 0.003, decay: 0.05, hold: 0.3, pan, dest: into });
    };
  },
};
