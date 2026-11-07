// The choir's tones at the far pool (chapter 5, chapters/kafli5.js): each group of animals sings its one tone of Slóeðla's song
// (chapters/kafli5-song.js), and she answers on her horn. Chunk 1's are made on the spot with Web Audio; chunk 3 puts the owner's
// picked recordings over an instrument layer in their place.
//
// A sung note is a soft marimba-like note at the group's tone (a sine and its fourth partial, struck and ringing out), with a short
// colour of the animal on top, in the tone's octaves so it stays in the key: a low bowed swell for the grazers, a hollow knock for
// the turtles, a croak-shaped double blip for the frogs, a double chirp for the small lizards and a high whistle for the small
// flyers. Her true horn is chapter 4's horn (engine/audio/sfx.js sloedlaHorn: a sawtooth and the hollow an octave under it through
// her crest) at a group's tone an octave down, scooping up into the note and holding it, with no wobble; her false horn is chapter
// 4's own, played by an sfx instance of its own so stop() can silence it.
//
// Everything passes `master`, which the game's hold silences (setPaused: the book open, the tab hidden). A sound is made only while
// the page's sound runs (after the first touch), as the game's effects are; with no audio context (a capture) nothing is.
import { createSfx } from './sfx.js';
import { KEY, toneHz } from '../../chapters/kafli5-song.js';

const LEVEL = 0.22; // a sung note's peak gain into the master
const HORN = { level: 0.16, seconds: 1.4, octave: -1 };
// Each group's colour over its marimba note: how long the note rings (s), and the colour's own sources.
const RING = { grazers: 1.1, turtles: 0.6, frogs: 0.8, lizards: 0.8, flyers: 0.9 };

export function createChoirSounds({ context = null, output = null, key = KEY, random = Math.random } = {}) {
  if (!context) {
    return { sing: () => false, horn: () => false, falseHorn: () => false, stop() {}, setPaused() {}, get now() { return 0; } };
  }
  let paused = false;
  const master = context.createGain();
  master.gain.value = 1;
  master.connect(output ?? context.destination);
  const live = new Set(); // the sources started and not yet ended
  const buses = new Set(); // the false horns' own outlets
  const ok = () => !paused && context.state === 'running';

  let white = null;
  const noiseBuffer = () => {
    if (!white) {
      white = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = white.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    }
    return white;
  };

  /** A sound's outlet: its level, then its side, into the master. */
  function outlet(level, pan) {
    const voice = context.createGain();
    voice.gain.value = level;
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      voice.connect(panner);
      panner.connect(master);
      return [voice, [voice, panner]];
    }
    voice.connect(master);
    return [voice, [voice]];
  }
  /** A gain that rises to `peak` in `attack` s from `at`, holds `hold` s and dies away over `decay` s. */
  function envelope(at, { attack = 0.005, hold = 0, decay, peak = 1 }) {
    const gain = context.createGain();
    const g = gain.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(peak, at + attack);
    if (hold) g.setValueAtTime(peak, at + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, at + attack + hold + decay);
    return gain;
  }
  /** Starts `source` at `at` and stops it at `end`, and lets go of it and `nodes` when it ends. */
  function run(source, at, end, nodes) {
    live.add(source);
    source.onended = () => {
      live.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
    source.start(at);
    source.stop(end);
  }
  function play(at, level, pan, parts, seconds) {
    const [voice, out] = outlet(level, pan);
    const end = at + seconds + 0.05;
    const nodes = [...out];
    const sources = [];
    for (const part of parts) {
      const { source, chain } = part(at);
      for (const node of chain) nodes.push(node);
      chain[chain.length - 1].connect(voice);
      sources.push(source);
    }
    sources.forEach((source, i) => run(source, at, end, i === 0 ? nodes : []));
    return true;
  }
  // The parts of a sound: each makes its source and the chain from it to the sound's outlet (the last node of the chain).
  // An oscillator of `type` at `hz` (gliding up from `from` × hz over `glide` s), through `filter` and its envelope `env`.
  const tone = (type, hz, env, { from = 1, glide = 0, filter = null } = {}) => at => {
    const source = context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(hz * from, at);
    if (glide) source.frequency.linearRampToValueAtTime(hz, at + glide);
    const chain = [];
    if (filter) {
      const f = context.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.frequency;
      f.Q.value = filter.q ?? 1;
      source.connect(f);
      chain.push(f);
    }
    const gain = env(at);
    (chain[0] ?? source).connect(gain);
    chain.push(gain);
    return { source, chain };
  };
  const knock = (hz, peak) => at => {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer();
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = hz;
    band.Q.value = 6;
    const gain = envelope(at, { attack: 0.002, decay: 0.07, peak });
    source.connect(band);
    band.connect(gain);
    return { source, chain: [band, gain] };
  };
  /** A gain with two quick bumps (a croak's or a chirp's two syllables), each `bump` s long. */
  const twice = (bump, peak) => at => {
    const gain = context.createGain();
    const g = gain.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(peak, at + 0.008);
    g.exponentialRampToValueAtTime(peak * 0.08, at + bump);
    g.linearRampToValueAtTime(peak, at + bump + 0.02);
    g.exponentialRampToValueAtTime(0.0001, at + bump * 2.6);
    return gain;
  };

  function partsOf(group, f) {
    const ring = RING[group];
    const marimba = [
      tone('sine', f, at => envelope(at, { attack: 0.004, decay: ring })),
      tone('sine', f * 4, at => envelope(at, { attack: 0.002, decay: 0.22, peak: 0.18 })),
    ];
    const colour = {
      grazers: [tone('sawtooth', f / 2, at => envelope(at, { attack: 0.18, hold: 0.2, decay: 0.7, peak: 0.42 }), { filter: { type: 'lowpass', frequency: f * 2.5, q: 0.7 } })],
      turtles: [knock(f * 2, 0.7), tone('sine', f / 2, at => envelope(at, { attack: 0.003, decay: 0.14, peak: 0.5 }))],
      frogs: [tone('square', f, twice(0.07, 0.32), { from: 0.85, glide: 0.05, filter: { type: 'bandpass', frequency: f * 2, q: 2.5 } })],
      lizards: [tone('sine', f * 2, twice(0.06, 0.3), { from: 0.9, glide: 0.035 })],
      flyers: [tone('sine', f * 2, at => envelope(at, { attack: 0.04, hold: 0.15, decay: 0.4, peak: 0.4 }), { from: 0.97, glide: 0.08 })],
    }[group];
    return [[...marimba, ...colour], Math.max(ring, 1.1)];
  }

  return {
    /** `group` sings its tone at audio time `at` (now), `level` its peak gain, from the side `pan` says. Whether it did. */
    sing(group, { at = context.currentTime, level = LEVEL, pan = 0 } = {}) {
      if (!ok()) return false;
      const [parts, seconds] = partsOf(group, toneHz(group, key));
      return play(at, level, pan, parts, seconds);
    },
    /** Her horn at `group`'s tone, an octave down: true, held, no wobble. */
    horn(group, { at = context.currentTime, level = HORN.level, pan = 0, seconds = HORN.seconds, octave = HORN.octave } = {}) {
      if (!ok()) return false;
      const f = toneHz(group, key, octave);
      const crest = at => {
        const filter = context.createBiquadFilter(); // her crest: a ringing lowpass that opens with her breath
        filter.type = 'lowpass';
        filter.Q.value = 3;
        filter.frequency.setValueAtTime(380, at);
        filter.frequency.linearRampToValueAtTime(900, at + 0.25);
        filter.frequency.linearRampToValueAtTime(700, at + seconds * 0.6);
        filter.frequency.linearRampToValueAtTime(320, at + seconds);
        return filter;
      };
      const [voice, out] = outlet(level, pan);
      const swell = context.createGain(); // up in 0.15 s, a little down, and away at the end
      const g = swell.gain;
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(1, at + 0.15);
      g.linearRampToValueAtTime(0.85, at + seconds * 0.7);
      g.exponentialRampToValueAtTime(0.0001, at + seconds);
      const filter = crest(at);
      filter.connect(swell);
      swell.connect(voice);
      const end = at + seconds + 0.05;
      [['sawtooth', 1, 1], ['sine', 0.5, 0.7]].forEach(([type, share, gain], i) => {
        const source = context.createOscillator();
        source.type = type;
        source.frequency.setValueAtTime(f * share * 0.94, at);
        source.frequency.linearRampToValueAtTime(f * share, at + 0.12);
        const mix = context.createGain();
        mix.gain.value = gain;
        source.connect(mix);
        mix.connect(filter);
        run(source, at, end, i === 0 ? [mix, filter, swell, ...out] : [mix]);
      });
      return true;
    },
    /** Her false horn, as chapter 4 has it (sfx.js sloedlaHorn), now. */
    falseHorn({ pan = 0, level } = {}) {
      if (!ok()) return false;
      const bus = context.createGain();
      bus.gain.value = 1;
      bus.connect(master);
      buses.add(bus);
      return createSfx({ context, output: bus }).play('sloedlaHorn', level === undefined ? { pan } : { pan, level });
    },
    /** Silences every sound now, the ones waiting for their time too. */
    stop() {
      const now = context.currentTime;
      for (const source of [...live]) {
        try {
          source.stop(now);
        } catch {
          // already stopped
        }
      }
      for (const bus of buses) {
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(0, now);
      }
      buses.clear();
    },
    /** Held with the game clock: silent while the book is open or the tab hidden, and back after. */
    setPaused(value) {
      paused = Boolean(value);
      master.gain.setTargetAtTime(paused ? 0 : 1, context.currentTime, 0.015);
    },
    /** The audio clock's time now: a sound for later is asked for at now + its delay. */
    get now() {
      return context.currentTime;
    },
  };
}
