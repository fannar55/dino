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
// With the owner's picked recordings (Task 6: loadChoirRecordings, the list in assets/audio/kafli5/hljod/sounds.json, mastered by
// tools/kafli5-sounds.mjs) a sung note is the group's animal take, moved to its tone (to the octave of the tone nearest its own pitch,
// so no take moves more than half an octave; a take with little pitch plays as it is), over the picked instrument's note at the exact
// tone; her horn is the picked horn take at the tone, and her false horn the picked false one. One instrument take and one horn take
// serve all five tones, each in one octave, so the five stay low to high. A part whose file has not come (or never will) is made as
// above in its place: the marimba for the instrument, the colour for the animal, chapter 4's horns for hers.
//
// Everything passes `master`, which the game's hold silences (setPaused: the book open, the tab hidden). A sound is made only while
// the page's sound runs (after the first touch), as the game's effects are; with no audio context (a capture) nothing is.
import { createSfx } from './sfx.js';
import { KEY, toneHz } from '../../chapters/kafli5-song.js';

const LEVEL = 0.22; // a sung note's peak gain into the master
const HORN = { level: 0.16, seconds: 1.4, octave: -1 };
const FALSE_LEVEL = 0.18; // a recorded false horn's peak
// Each group's colour over its marimba note: how long the note rings (s), and the colour's own sources.
const RING = { grazers: 1.1, turtles: 0.6, frogs: 0.8, lizards: 0.8, flyers: 0.9 };
const INSTRUMENT_SECONDS = 2.0; // an instrument note is cut (faded) after this
const PEAK = 10 ** (-3 / 20); // a mastered file's peak (tools/kafli5-sounds.mjs SHOT_PEAK, -3 dBFS)
/** Where the chapter's recordings are. */
export const HLJOD = new URL('../../assets/audio/kafli5/hljod/', import.meta.url).href;

/** The rate that puts a take of pitch `hz` on `tone` in the octave nearest its own, never over half an octave; 1 with no pitch. */
export function takeRate(hz, tone) {
  if (!(hz > 0) || !(tone > 0)) return 1;
  return (tone * 2 ** Math.round(Math.log2(hz / tone))) / hz;
}
/** The rate that puts one take of pitch `hz`, serving all five tones, on `group`'s: in the octave nearest the take, set on mi. */
export function setRate(hz, group, key = KEY) {
  if (!(hz > 0)) return 1;
  return toneHz(group, key, Math.round(Math.log2(hz / toneHz('frogs', key)))) / hz;
}

const stores = new WeakMap();
/**
 * The picked recordings for the page's audio context, fetched and decoded in the background (the next call for the same context
 * gives the same store, unless `sounds` is handed in): { sounds (the list: files and levels), get(file) → its AudioBuffer once
 * decoded, ready → a promise that settles (true) when every file has come or failed }. A file that cannot be had is never there, and
 * its part stays made; a list that cannot be had leaves everything made. No context, no store.
 */
export function loadChoirRecordings(context, { fetch = globalThis.fetch, base = HLJOD, sounds = null } = {}) {
  if (!context) return null;
  if (!sounds && stores.has(context)) return stores.get(context);
  const buffers = new Map();
  const store = { sounds: { files: {}, levels: {} }, get: file => buffers.get(file), ready: null };
  const list = sounds
    ? Promise.resolve(sounds)
    : Promise.resolve()
      .then(() => fetch(new URL('sounds.json', base).href))
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(`${response.status}`))));
  store.ready = list
    .then(data => {
      store.sounds = { files: data?.files ?? {}, levels: data?.levels ?? {}, madeToo: data?.madeToo ?? {} };
      return Promise.all(Object.keys(store.sounds.files).map(file => Promise.resolve()
        .then(() => fetch(new URL(file, base).href))
        .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`))))
        .then(bytes => context.decodeAudioData(bytes))
        .then(buffer => { buffers.set(file, buffer); })
        .catch(() => {})));
    })
    .catch(() => {})
    .then(() => true);
  if (!sounds) stores.set(context, store);
  return store;
}

export function createChoirSounds({ context = null, output = null, key = KEY, random = Math.random, recordings = null } = {}) {
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
    return { marimba, colour, seconds: Math.max(ring, 1.1) };
  }

  // The recordings: the takes of `role` (of `group`) that have come, one picked so the same is not heard twice running. A file may
  // serve more than one role (`roles`: her horn's takes are her false horn too); where the list says the made sound of a role is one
  // of the picks (`madeToo`), it takes its turn with them (a pick of { made: true }).
  const lastTake = new Map();
  function pick(role, group = null) {
    const files = recordings?.sounds?.files ?? {};
    const ready = Object.entries(files)
      .filter(([file, entry]) => (entry.roles ?? [entry.role]).includes(role) && (group === null || entry.group === group) && recordings.get(file))
      .map(([file, entry]) => ({ file, entry, buffer: recordings.get(file) }));
    if (!ready.length) return null;
    if (recordings.sounds.madeToo?.[role]) ready.push({ file: 'made', made: true });
    const which = `${role}:${group}`;
    const fresh = ready.length > 1 ? ready.filter(take => take.file !== lastTake.get(which)) : ready;
    const take = fresh[Math.floor(random() * fresh.length) % fresh.length];
    lastTake.set(which, take.file);
    return take.made ? null : take; // the made sound's turn: the caller makes it, as with no recording
  }
  const levelOf = role => recordings?.sounds?.levels?.[role] ?? 1;
  /** Plays `take` at `at` at `rate`, its peak at `level`, cut and faded at `seconds` when it is longer; `bend` may move its pitch. */
  function recorded(take, at, { rate = 1, level, pan = 0, seconds = null, bend = null }) {
    const source = context.createBufferSource();
    source.buffer = take.buffer;
    source.playbackRate.value = rate;
    const [voice, out] = outlet(level / PEAK, pan);
    const fade = context.createGain();
    source.connect(fade);
    fade.connect(voice);
    const length = take.buffer.duration / rate;
    const end = at + (seconds ? Math.min(seconds, length) : length);
    if (seconds && seconds < length) {
      fade.gain.setValueAtTime(1, Math.max(at, end - 0.12));
      fade.gain.linearRampToValueAtTime(0.0001, end);
    }
    run(source, at, end + 0.02, [fade, ...out]);
    bend?.(source, at, end);
    return true;
  }

  return {
    /** `group` sings its tone at audio time `at` (now), `level` its peak gain, from the side `pan` says. Whether it did. */
    sing(group, { at = context.currentTime, level = LEVEL, pan = 0 } = {}) {
      if (!ok()) return false;
      const tone = toneHz(group, key);
      const { marimba, colour, seconds } = partsOf(group, tone);
      const take = pick('animal', group);
      const instrument = pick('instrument');
      // the made parts in the place of what has not come, at the picks' levels (1 each with no recordings)
      if (!instrument) play(at, level * levelOf('instrument'), pan, marimba, seconds);
      if (!take) play(at, level * levelOf('animal'), pan, colour, seconds);
      if (take) recorded(take, at, { rate: take.entry.clear ? takeRate(take.entry.hz, tone) : 1, level: level * levelOf('animal'), pan });
      if (instrument) recorded(instrument, at, { rate: setRate(instrument.entry.hz, group, key), level: level * levelOf('instrument'), pan, seconds: INSTRUMENT_SECONDS });
      return true;
    },
    /** Her horn at `group`'s tone (made: an octave down): true, held, no wobble. */
    horn(group, { at = context.currentTime, level = HORN.level, pan = 0, seconds = HORN.seconds, octave = HORN.octave } = {}) {
      if (!ok()) return false;
      const blown = pick('horn');
      if (blown) return recorded(blown, at, { rate: setRate(blown.entry.hz, group, key), level: level * levelOf('horn'), pan, seconds });
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
    /**
     * Her false horn, now: the picked recording (a false take as it is, or her true horn's take made false: a quarter tone flat,
     * sliding down between re and mi and wobbling), or chapter 4's (sfx.js sloedlaHorn).
     */
    falseHorn({ pan = 0, level } = {}) {
      if (!ok()) return false;
      const wrong = pick('hornFalse');
      if (wrong) {
        const peak = (level ?? FALSE_LEVEL) * levelOf('hornFalse');
        if (!wrong.entry.wobble) return recorded(wrong, context.currentTime, { level: peak, pan });
        return recorded(wrong, context.currentTime, {
          rate: setRate(wrong.entry.hz, 'frogs', key),
          level: peak,
          pan,
          seconds: 1.8,
          bend: (source, at, end) => {
            // between the key's notes all the way: mi less 50, 90 and 140 cents never comes within 30 of re or mi
            source.detune.setValueAtTime(-50, at);
            source.detune.linearRampToValueAtTime(-90, at + (end - at) * 0.55);
            source.detune.linearRampToValueAtTime(-140, end);
            const wobble = context.createOscillator();
            wobble.frequency.value = 5.5;
            const depth = context.createGain();
            depth.gain.value = 30;
            wobble.connect(depth);
            depth.connect(source.detune);
            run(wobble, at, end, [depth]);
          },
        });
      }
      const bus = context.createGain();
      bus.gain.value = 1;
      bus.connect(master);
      buses.add(bus);
      // from the song's mi, low: its slip (126 cents down) holds between re and mi, 74 cents over the one and 126 under the other
      const note = toneHz('frogs', key, -2);
      return createSfx({ context, output: bus }).play('sloedlaHorn', level === undefined ? { pan, note } : { pan, level, note });
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
