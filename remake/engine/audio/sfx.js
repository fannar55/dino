// The sound effects: small sounds made on the spot with Web Audio, as in the old game (dist/audio.js: the tone, noise and bell
// helpers, the footfall and the forest's wind and birds are ported from it). Nothing is recorded. The bell sounds (the plate, the
// star and their kin) are tuned to the key of the theme (theme.json), so they sit in the music instead of against it.
//
// A sound plays only when the browser has let sound begin (the first touch), nothing holds the game (the book is open, the tab is
// hidden) and the effects are not muted (a capture's silent replay). The scene asks for one by name: s.sfx(name), or with a detail
// for the sounds that take one, s.sfx(name, detail) (chapter 2's counting tone takes its number: engine/audio/fen-sounds.js).
// A bed is a loop, laid once: the forest's wind, or the Fen's water (chapter 2), which takes over from the forest with a slow
// cross-fade, and the forest from it; the small sounds that come and go over each (the forest's birds and rustles, the Fen's
// frogs, drips, bubbles and dragonflies) are scheduled by update(dt) on the game clock.
// A second instance can carry more sounds, made with the same tools in the same key: the book's (engine/book/book-sounds.js), whose
// instance is outside the game's hold, so it sounds while the game stands still behind the child's book.

import { FEN_GAPS, fenCall, fenSounds } from './fen-sounds.js';

const MAX_SOUNDS = 48; // sources sounding at once: a child tapping fast cannot pile up more than this
// Recorded sounds, by name, beside the made ones: Grameðla's roar and breath, far off from chapter 2's lookout. Both from
// tunetank.com, free for non-commercial use with credit (the owner, 2026-10-27): "Sound Effect: Dinosaur creature moan" and
// "Sound Effect: T-rex exhale", download from https://tunetank.com (assets/audio/kafli2/CREDITS.md). `level` is the gain into the
// effects' master; a play's detail may scale it: s.sfx('gramedlaRoar', { level: 0.25 }), further off (chapter 4's flight), and put
// it to a side: { pan: -0.6 }. Chapter 4's (assets/audio/kafli4/CREDITS.md, the owner's picks of 2026-11-02) have takes (`urls`):
// one of them each time, not the one played last; until they have decoded, the made sound `instead` plays in their place.
const kafli4 = file => new URL(`../../assets/audio/kafli4/hljod/${file}`, import.meta.url).href;
export const SAMPLES = {
  gramedlaRoar: { url: new URL('../../assets/audio/kafli2/gramedla-roar.mp3', import.meta.url).href, level: 1.3 },
  gramedlaExhale: { url: new URL('../../assets/audio/kafli2/gramedla-exhale.mp3', import.meta.url).href, level: 1.0 },
  skim: { urls: [kafli4('skim-1.mp3'), kafli4('skim-2.mp3')], level: 0.55, instead: 'splash' }, // her feet on the river
  turtleCall: { urls: [kafli4('turtle-1.mp3'), kafli4('turtle-2.mp3')], level: 0.5, instead: 'turtle' }, // the turtle answering her
  lizards: { urls: ['smalldino-1.mp3', 'smalldino-2.mp3', 'smalldino-3.mp3', 'smalldino-4.mp3'].map(kafli4), level: 0.45 }, // the small ones
  // the owner's picks of 2026-11-07: the herd answering her big call, and the gorge's flyers (as they leave their nests, and answering)
  grazers: { urls: ['grazer-1.mp3', 'grazer-2.mp3', 'grazer-3.mp3', 'grazer-4.mp3'].map(kafli4), level: 0.5 },
  flyers: { urls: ['flyer-1.mp3', 'flyer-2.mp3'].map(kafli4), level: 0.4 },
};
const SAMPLE_VARY = 0.06; // a recorded sample plays up to 6 % higher or lower each time (a play's detail.rate sets it instead)
const DEFAULT_KEY = [523.25, 587.33, 659.25, 783.99, 880]; // C major pentatonic, for a page with no theme.json
// The least time, in audio seconds, between two plays of the same sound, for the ones a child can tap again and again.
const GAPS = { frog: 0.45, snail: 0.4, beetle: 0.4, birds: 0.5, butterfly: 0.25, flower: 0.15 };
const BEDS = ['forest', 'fen'];
const CROSS_FADE = 0.8; // the time constant (s) of a bed fading out as the other comes in: about three seconds
// Slóeðla's horn (the horn sound): its note (D3, Hz), how long it lasts, where it slips to (of the note: flatter than a semitone, short
// of a whole tone) and sinks to, its peak gain, and its echo off the far bank ([seconds, gain]).
const HORN = { note: 146.83, seconds: 2.8, wrong: 0.93, sinks: 0.84, level: 0.14, echo: [0.32, 0.25] };
const FEN_IN = 2.5; // seconds the Fen's water takes to come in

/**
 * `sounds({ tone, noise, bell, key })`, when given, returns more sounds by name, which play as the game's own do, each at least
 * `gaps[name]` audio seconds after the last of its name.
 */
export function createSfx({ context = null, theme = null, output, random = Math.random, sounds = null, gaps = {}, recorded = false } = {}) {
  let muted = false;
  let paused = false;

  if (!context) {
    // No Web Audio, or a capture, which is silent by design: the same object, doing nothing.
    return {
      play: () => false,
      update() {},
      stop() {},
      setPaused() {},
      get muted() { return muted; },
      set muted(value) { muted = Boolean(value); },
    };
  }

  const key = Array.isArray(theme?.key) && theme.key.length >= 5 && theme.key.every(hz => hz > 0) ? theme.key : DEFAULT_KEY;
  const between = (low, high) => low + random() * (high - low);

  const master = context.createGain(); // everything passes this, which mutes and holds the effects
  master.gain.value = 1;
  master.connect(output ?? context.destination);
  const ambience = context.createGain(); // the forest sits a little lower than the effects
  ambience.gain.value = 0.8;
  ambience.connect(master);

  const noises = new Map();
  /** Three seconds of noise: 'white', 'brown' (the wind) or 'warm' (a bit of both, for rustles that carry on a tablet's speakers). */
  function noiseBuffer(kind) {
    if (!noises.has(kind)) {
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        const white = random() * 2 - 1;
        brown = (brown + 0.02 * white) / 1.02;
        data[i] = kind === 'white' ? white : kind === 'warm' ? white * 0.55 + brown * 1.575 : brown * 3.5;
      }
      noises.set(kind, buffer);
    }
    return noises.get(kind);
  }

  let sounding = 0; // sources playing now
  /** Lets go of a source's nodes when it ends, so nothing piles up in the graph. */
  function track(source, nodes) {
    sounding++;
    source.onended = () => {
      sounding--;
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  function outlet(volume, pan, bus) {
    if (!context.createStereoPanner) {
      volume.connect(bus);
      return [];
    }
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    volume.connect(panner);
    panner.connect(bus);
    return [panner];
  }

  /** Up to `level` in `attack` s, down to `sustain` of it a third of the way through, and to silence at the end. */
  function envelope(param, at, duration, level, attack = 0.012, body = 0.36, sustain = 0.48) {
    param.setValueAtTime(0, at);
    param.linearRampToValueAtTime(level, at + Math.min(attack, duration * 0.3));
    if (body) param.linearRampToValueAtTime(level * sustain, at + duration * Math.max(0.31, body));
    param.exponentialRampToValueAtTime(0.0001, at + duration);
  }

  /** One note, its pitch gliding from `frequency` to `end` (Hz). `level` is its peak gain. */
  function tone({ frequency, end = frequency, duration = 0.3, level = 0.05, delay = 0, pan = 0, type = 'sine', attack, body, sustain, bus = master }) {
    const at = context.currentTime + delay;
    const source = context.createOscillator();
    const volume = context.createGain();
    source.type = type;
    source.frequency.setValueAtTime(frequency, at);
    source.frequency.exponentialRampToValueAtTime(Math.max(30, end), at + duration);
    envelope(volume.gain, at, duration, level, attack, body, sustain);
    source.connect(volume);
    track(source, [volume, ...outlet(volume, pan, bus)]);
    source.start(at);
    source.stop(at + duration + 0.015);
  }

  /** A puff of noise through a filter that sweeps from `frequency` to `end` (Hz). */
  function noise({ duration = 0.35, level = 0.05, frequency = 900, end = frequency, q = 0.7, type = 'lowpass', kind = 'warm', delay = 0, pan = 0, attack = 0.04, bus = master }) {
    const at = context.currentTime + delay;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const volume = context.createGain();
    source.buffer = noiseBuffer(kind);
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, end), at + duration);
    envelope(volume.gain, at, duration, level, attack, 0.42, 0.6);
    source.connect(filter);
    filter.connect(volume);
    track(source, [filter, volume, ...outlet(volume, pan, bus)]);
    source.start(at, between(0, Math.max(0, 3 - duration - 0.1)));
    source.stop(at + duration + 0.02);
  }

  /** A toy glockenspiel: a round body and a quiet, quick overtone an octave up. */
  function bell(frequency, { delay = 0, level = 0.06, pan = 0, duration = 0.52 } = {}) {
    tone({ frequency, duration, level, delay, pan });
    tone({ frequency: frequency * 2, duration: duration * 0.36, level: level * 0.19, delay, pan });
  }

  /**
   * Wings going by: a soft note whose loudness flutters at a wingbeat (the key's root four octaves down, about 33 a second, so even
   * the flutter is in the key), panned from `from` to `to`. The dragonflies' (fen-sounds.js).
   */
  function hum({ frequency, end = frequency, duration = 1.2, level = 0.02, from = -0.5, to = 0.5, delay = 0, type = 'triangle', bus = master }) {
    const at = context.currentTime + delay;
    const source = context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(frequency, at);
    source.frequency.exponentialRampToValueAtTime(Math.max(30, end), at + duration);
    const flutter = context.createGain(); // half open, and the wings open and close it the other half
    flutter.gain.setValueAtTime(0.5, at);
    const wings = context.createOscillator();
    wings.frequency.setValueAtTime(key[0] / 16, at);
    const depth = context.createGain();
    depth.gain.setValueAtTime(0.5, at);
    const volume = context.createGain();
    envelope(volume.gain, at, duration, level, duration * 0.3, 0.6, 0.85);
    wings.connect(depth);
    depth.connect(flutter.gain);
    source.connect(flutter);
    flutter.connect(volume);
    const out = [];
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(from, at);
      panner.pan.linearRampToValueAtTime(to, at + duration);
      volume.connect(panner);
      panner.connect(bus);
      out.push(panner);
    } else volume.connect(bus);
    track(source, [flutter, depth, wings, volume, ...out]);
    source.start(at);
    wings.start(at);
    source.stop(at + duration + 0.015);
    wings.stop(at + duration + 0.015);
  }

  /** Little rising chirps, as a bird makes them. */
  function chirps({ pitch = between(1350, 1850), count = 3, level, pan = between(-0.65, 0.65), delay = 0, bus }) {
    for (let i = 0; i < count; i++) tone({ frequency: pitch + i * 85, end: pitch * 1.26, duration: 0.11, level, delay: delay + i * 0.16, pan, bus });
  }

  // The beds: the forest's wind or the Fen's water, one at a time, each laid once, with its small sounds on top of it.
  let bed = null; // the one laid: { name, sources, fade, nodes }
  let wanted = null; // the one the scene asked for: it is laid as soon as sound is allowed (the context wakes a moment after the touch)
  let callIn = 0; // game seconds until the next small sound over the bed
  let calls = true; // whether the bed has its small sounds: play('fen', { calls: false }) is the water alone (chapter 5's choir)

  /** Lays the bed called `name`, fading out the other one if it is laid. Whether it laid it (not when it was laid already). */
  function startBed(name) {
    if (bed?.name === name) return false;
    if (bed) fadeOut(bed, CROSS_FADE);
    bed = name === 'fen' ? layFen() : layForest();
    callIn = name === 'fen' ? between(1.2, 2.4) : between(1.5, 3.5);
    return true;
  }

  /** A bed fades out (over about 4.6 time constants) and lets go of its nodes. */
  function fadeOut(old, tau) {
    if (bed === old) bed = null;
    const now = context.currentTime;
    // from where it is now, also halfway through its own fade in (cancelScheduledValues alone would drop it to the start of that)
    if (old.fade.gain.cancelAndHoldAtTime) old.fade.gain.cancelAndHoldAtTime(now);
    else {
      const level = old.fade.gain.value; // where it is now, read before the cancel
      old.fade.gain.cancelScheduledValues(now);
      old.fade.gain.setValueAtTime(level, now);
    }
    old.fade.gain.setTargetAtTime(0, now, tau);
    const [first, ...rest] = old.sources;
    for (const source of old.sources) source.stop(now + tau * 6);
    first.onended = () => {
      for (const source of old.sources) source.disconnect();
      for (const node of old.nodes) node.disconnect();
    };
    for (const source of rest) source.onended = null;
  }

  // The forest: a bed of wind that swells and fades slowly, with birds and rustles on top of it.
  function layForest() {
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer('brown');
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 750;
    filter.Q.value = 0.35;
    const bed = context.createGain();
    bed.gain.value = 0.018;
    const swell = context.createOscillator(); // the wind comes and goes about every nine seconds
    swell.frequency.value = 0.11;
    const depth = context.createGain();
    depth.gain.value = 0.006;
    const fade = context.createGain();
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + 1.2);
    swell.connect(depth);
    depth.connect(bed.gain);
    source.connect(filter);
    filter.connect(bed);
    bed.connect(fade);
    fade.connect(ambience);
    source.start(now);
    swell.start(now);
    return { name: 'forest', sources: [source, swell], fade, nodes: [filter, bed, depth, fade] };
  }

  // The Fen (chapter 2): water lapping at the hummocks, a slow swell under a thin hiss of reed, coming in over FEN_IN seconds,
  // with frogs, drips, bubbles, a dragonfly going by and the early bird calling on top of it (fen-sounds.js: fenCall).
  function layFen() {
    const now = context.currentTime;
    const fade = context.createGain();
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FEN_IN);
    fade.connect(ambience);
    const sources = [], nodes = [fade];
    // the water: brown noise through a low filter, its level lapping about every four seconds
    const water = context.createBufferSource();
    water.buffer = noiseBuffer('brown');
    water.loop = true;
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 600;
    low.Q.value = 0.5;
    const lap = context.createGain();
    lap.gain.value = 0.016;
    const lapping = context.createOscillator();
    lapping.frequency.value = 0.24;
    const lapDepth = context.createGain();
    lapDepth.gain.value = 0.007;
    lapping.connect(lapDepth);
    lapDepth.connect(lap.gain);
    water.connect(low);
    low.connect(lap);
    lap.connect(fade);
    // the reed: a thin, high hiss, swelling slowly
    const reed = context.createBufferSource();
    reed.buffer = noiseBuffer('white');
    reed.loop = true;
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3400;
    band.Q.value = 0.7;
    const hiss = context.createGain();
    hiss.gain.value = 0.0028;
    band.connect(hiss);
    reed.connect(band);
    hiss.connect(fade);
    for (const source of [water, lapping, reed]) source.start(now);
    sources.push(water, lapping, reed);
    nodes.push(low, lap, lapDepth, band, hiss);
    return { name: 'fen', sources, fade, nodes };
  }

  let stepSide = 0;
  const SOUNDS = {
    // the beds, laid by play and update, which treat them apart from the one-shots; they are here so that the names are known
    forest: () => startBed('forest'),
    fen: () => startBed('fen'),
    // Mosi's footfall: a low thump and a puff of earth, from the left and the right in turn (the old game's footstep). `level`
    // scales it: chapter 1 plays his steps softly while he trots in from far down the path, and full once he is near.
    step({ level = 1 } = {}) {
      stepSide = 1 - stepSide;
      const pan = stepSide ? 0.13 : -0.13;
      tone({ frequency: between(105, 125), end: 65, duration: 0.11, level: 0.15 * level, pan });
      noise({ duration: 0.18, level: 0.34 * level, frequency: 850, end: 350, pan, attack: 0.008 });
    },
    // A call heard (chapter 4: Egill taps a group of animals and she calls it): two soft, high bells of the key, mi and la an octave
    // up, close together, from where the group is (`pan`). Quiet: her call and their answer come after it.
    callChime({ pan = 0 } = {}) {
      bell(key[2] * 2, { level: 0.03, pan, duration: 0.5 });
      bell(key[4] * 2, { level: 0.026, pan, delay: 0.09, duration: 0.6 });
    },
    // A breath blown out (chapter 4's wind: Mosi and Egill blow along with a gust): a soft, long "fff" of warm noise, swelling and
    // falling, from a little to one side (`pan`). No note in it.
    blow({ pan = 0, level = 1 } = {}) {
      noise({ kind: 'warm', type: 'bandpass', frequency: 1300, end: 700, q: 0.6, duration: 0.9, level: 0.045 * level, attack: 0.18, pan });
      noise({ kind: 'white', type: 'highpass', frequency: 3200, end: 2600, q: 0.5, duration: 0.7, level: 0.012 * level, attack: 0.12, pan });
    },
    // A ribbit: two throaty croaks, the second one rising; near the middle, or at `pan` (chapter 4's answers from all sides).
    frog({ pan: side } = {}) {
      const pitch = between(0.95, 1.05);
      const pan = Number.isFinite(side) ? side : between(-0.3, 0.3);
      for (const [at, from, to, length] of [[0, 190, 140, 0.1], [0.14, 150, 235, 0.13]]) {
        tone({ frequency: from * pitch, end: to * pitch, duration: length, level: 0.11, delay: at, pan, type: 'triangle', attack: 0.015 });
        tone({ frequency: from * pitch * 2, end: to * pitch * 2, duration: length, level: 0.045, delay: at, pan, type: 'triangle', attack: 0.015 });
        noise({ type: 'bandpass', frequency: 700 * pitch, end: 500, q: 1.5, duration: length, level: 0.05, delay: at, pan, attack: 0.02 });
      }
    },
    // A squishy bloop as the stalks draw in, and a tiny blip behind it.
    snail() {
      const pan = between(-0.3, 0.3);
      tone({ frequency: 640, end: 260, duration: 0.17, level: 0.09, pan });
      noise({ frequency: 800, end: 300, duration: 0.14, level: 0.1, pan, attack: 0.02 });
      tone({ frequency: 360, end: 540, duration: 0.1, level: 0.06, delay: 0.19, pan });
    },
    // A buzz of wings: a run of tiny saw-toothed bursts under a rasp of air.
    beetle() {
      const pan = between(-0.4, 0.4);
      for (let i = 0; i < 6; i++) tone({ frequency: between(135, 150), end: 120, duration: 0.04, level: 0.1, delay: i * 0.045, pan, type: 'sawtooth', attack: 0.005 });
      noise({ type: 'bandpass', frequency: 2600, end: 1900, q: 1.5, duration: 0.3, level: 0.12, pan, attack: 0.03 });
    },
    // Two birds, one answering the other: one on each side, or both at `pan`.
    birds({ pan } = {}) {
      const side = Number.isFinite(pan);
      chirps({ pitch: between(1350, 1700), count: 3, level: 0.1, pan: side ? pan : -0.35 });
      chirps({ pitch: between(1750, 2100), count: 2, level: 0.08, pan: side ? pan * 0.8 : 0.4, delay: 0.5 });
    },
    // A flutter of tiny high pings and a breath of air.
    butterfly() {
      const pan = between(-0.4, 0.4);
      for (let i = 0; i < 5; i++) tone({ frequency: key[(i * 2 + 1) % 5] * 4, duration: 0.09, level: 0.06, delay: i * 0.055, pan });
      noise({ kind: 'white', type: 'bandpass', frequency: 4500, end: 3000, q: 1, duration: 0.3, level: 0.05, attack: 0.1, pan });
    },
    // A glimmer picked up: four bright bells climbing the key.
    flower() {
      [0, 1, 2, 4].forEach((n, i) => bell(key[n] * 2, { delay: i * 0.07, level: 0.07, duration: 0.5 }));
    },
    // A row of plates lights: a glow swells under a little chord that rolls upward.
    plate() {
      tone({ frequency: key[0], duration: 1.3, level: 0.05, attack: 0.25, body: 0.5, sustain: 0.6 });
      tone({ frequency: key[0] * 2, duration: 1.2, level: 0.03, attack: 0.3, body: 0.5, sustain: 0.6 });
      [2, 3, 4].forEach((n, i) => bell(key[n], { delay: 0.25 + i * 0.12, level: 0.07, duration: 0.9 }));
    },
    // The star rises: one bell for each note of the key, climbing, a high one to finish, and a glitter of air.
    star() {
      const notes = [...key, key[0] * 2];
      notes.forEach((hz, i) => bell(hz, { delay: i * 0.15, level: 0.055 + i * 0.005, duration: i === notes.length - 1 ? 1.4 : 0.6 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 3000, end: 6000, q: 1.2, duration: 0.9, level: 0.02, attack: 0.3 });
    },
    // The star lands in the book: a soft thump, a warm bell and a small sparkle after it.
    journal() {
      tone({ frequency: key[0] / 4, end: key[0] / 8, duration: 0.14, level: 0.12, type: 'triangle' });
      bell(key[2], { delay: 0.06, level: 0.08, duration: 1.1 });
      bell(key[4], { delay: 0.2, level: 0.05, duration: 0.8 });
      bell(key[3] * 2, { delay: 0.32, level: 0.035, duration: 0.6 });
    },
    // The saddle appears with a pop and a sparkle of high notes.
    saddle() {
      noise({ kind: 'white', type: 'bandpass', frequency: 1400, end: 3200, q: 1.2, duration: 0.08, level: 0.14, attack: 0.004 });
      tone({ frequency: key[2], end: key[2] / 2, duration: 0.07, level: 0.1 });
      [1, 2, 3, 4].forEach((n, i) => tone({ frequency: key[n] * 4, duration: 0.12, level: 0.04, delay: 0.05 + i * 0.05 }));
    },
    // Egill floats up: a soft chime climbing the key, slowly, with a shimmer rising an octave under it.
    float() {
      [0, 1, 2, 3, 4].forEach((n, i) => bell(key[n], { delay: i * 0.32, level: 0.045, duration: 1.1, pan: (i - 2) * 0.12 }));
      tone({ frequency: key[0] * 2, end: key[0] * 4, duration: 1.8, level: 0.025, attack: 0.5, body: 0.6, sustain: 0.8 });
      bell(key[0] * 2, { delay: 1.7, level: 0.05, duration: 1.2 });
    },
    // Slóeðla's horn from the reed across the far pool (chapter 4's end; chapter 5 begins with it): she cannot remember her song, and
    // the one long note through her hollow crest will not hold. It comes in from a little under, holds, slips flat (less than a whole
    // tone: false, not another note) with a wobble that widens, and sinks away. Low and dull, far off, from the side `pan` says.
    sloedlaHorn({ pan = 0, level = HORN.level, note = HORN.note } = {}) {
      const at = context.currentTime + 0.02;
      const f = note; // chapter 5 names a note of its song's key, so the slip lands between two of its tones (choir-sounds.js)
      const end = at + HORN.seconds;
      const volume = context.createGain();
      const g = volume.gain;
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(level, at + 0.18);
      g.linearRampToValueAtTime(level * 0.9, at + 1.0);
      g.linearRampToValueAtTime(level * 0.75, at + 2.0);
      g.exponentialRampToValueAtTime(0.0001, end);
      const crest = context.createBiquadFilter(); // her crest: a closed, ringing lowpass that opens with her breath and closes as it sinks
      crest.type = 'lowpass';
      crest.Q.value = 3;
      crest.frequency.setValueAtTime(380, at);
      crest.frequency.linearRampToValueAtTime(900, at + 0.25);
      crest.frequency.linearRampToValueAtTime(700, at + 1.6);
      crest.frequency.linearRampToValueAtTime(300, end);
      crest.connect(volume);
      const wobble = context.createOscillator();
      wobble.frequency.setValueAtTime(5.2, at);
      const depth = context.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(0, at + 0.5);
      depth.gain.linearRampToValueAtTime(f * 0.012, at + 1.0);
      depth.gain.linearRampToValueAtTime(f * 0.03, at + 1.8);
      wobble.connect(depth);
      // the note, and the hollow an octave under it
      const voices = [['sawtooth', 1, 1], ['sine', 0.5, 0.7]].map(([type, share, gain]) => {
        const voice = context.createOscillator();
        voice.type = type;
        const hz = voice.frequency;
        hz.setValueAtTime(f * share * 0.94, at);
        hz.linearRampToValueAtTime(f * share, at + 0.12);
        hz.setValueAtTime(f * share, at + 0.9);
        hz.linearRampToValueAtTime(f * share * HORN.wrong, at + 1.6);
        hz.setValueAtTime(f * share * HORN.wrong, at + 2.1);
        hz.linearRampToValueAtTime(f * share * HORN.sinks, end);
        depth.connect(hz);
        const mix = context.createGain();
        mix.gain.value = gain;
        voice.connect(mix);
        mix.connect(crest);
        return [voice, mix];
      });
      const out = [crest, volume, ...outlet(volume, pan, master)];
      // and an echo off the far bank, when the page can make one
      if (context.createDelay) {
        const delay = context.createDelay(1);
        delay.delayTime.value = HORN.echo[0];
        const back = context.createGain();
        back.gain.value = HORN.echo[1];
        volume.connect(delay);
        delay.connect(back);
        out.push(delay, back, ...outlet(back, pan * 0.5, master));
      }
      track(wobble, [depth]);
      voices.forEach(([voice, mix], i) => track(voice, i === 0 ? [mix, ...out] : [mix]));
      for (const source of [wobble, ...voices.map(([voice]) => voice)]) {
        source.start(at);
        source.stop(end + HORN.echo[0] + 0.2); // with the echo's tail
      }
      // her breath into the crest as the note begins
      noise({ kind: 'white', type: 'bandpass', frequency: 1100, end: 700, q: 1, duration: 0.45, level: level * 0.25, attack: 0.05, pan });
    },
    // The map is laid out over the game (the map in the journey, engine/book/map-moment.js, which asks the journal's audio for it as
    // the map slides up in 0.6 s): a soft paper unroll, a band of noise that swells and climbs for half a second, and the last rustle
    // of the edge settling. Quiet, and with no note in it: it comes under Mosi's line.
    mapOpen() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 450, end: 1700, q: 0.8, duration: 0.5, level: 0.05, attack: 0.28 });
      noise({ kind: 'white', type: 'bandpass', frequency: 2800, end: 2000, q: 1.4, duration: 0.12, level: 0.018, attack: 0.01, delay: 0.38 });
    },
    // A pen draws a piece of the trail (asked for as each piece begins, which takes 2 s): a faint scratch under a run of short, light
    // ticks, a hair higher or lower each time, drifting across the speakers as the line goes on. Always ten ticks, over 1.8 s.
    mapPen() {
      noise({ kind: 'white', type: 'bandpass', frequency: 3600, end: 2400, q: 1, duration: 2.4, level: 0.012, attack: 0.1 });
      for (let i = 0; i < 13; i++) {
        noise({
          kind: 'white', type: 'bandpass', frequency: between(2800, 4200), end: between(1900, 2600), q: 1.8, duration: 0.05 + (i % 3) * 0.01,
          level: 0.04 + (i % 3) * 0.006, delay: 0.02 + i * 0.18 + between(0, 0.04), pan: -0.25 + i * 0.042, attack: 0.004,
        });
      }
    },
  };

  // An instance's own sounds (`sounds`) may not take a name of the ones above. Chapter 2's (engine/audio/fen-sounds.js) are the
  // game's as well, but give way to an instance's own of the same name: Háls og hali's table has a splash of its own, and never plays
  // the Fen's.
  const own = sounds?.({ tone, noise, bell, key }) ?? {};
  for (const name of Object.keys(own)) {
    if (Object.hasOwn(SOUNDS, name)) throw new TypeError(`createSfx: "${name}" is one of the game's own sounds`);
  }
  const fen = Object.entries(fenSounds({ tone, noise, bell, hum, key, between })).filter(([name]) => !Object.hasOwn(own, name));
  Object.assign(SOUNDS, Object.fromEntries(fen), own);
  // The recorded ones, for the chapter's page only (`recorded`: main.js; the games make effects of their own and have no use for
  // them): each file fetched and decoded once, in the background, as the effects are made, and played through the master like the
  // rest, so it mutes and holds with them. One asked for before its file has decoded is not played.
  const buffers = new Map(); // url → its decoded buffer
  const lastTake = new Map(); // name → the url it played last
  for (const [name, sample] of recorded ? Object.entries(SAMPLES) : []) {
    if (Object.hasOwn(SOUNDS, name)) continue;
    const urls = sample.urls ?? [sample.url];
    SOUNDS[name] = (detail = {}) => {
      const ready = urls.filter(url => buffers.has(url));
      const fresh = ready.length > 1 ? ready.filter(url => url !== lastTake.get(name)) : ready;
      if (!fresh.length) {
        if (sample.instead) SOUNDS[sample.instead](detail);
        return;
      }
      const url = fresh[Math.floor(random() * fresh.length) % fresh.length];
      lastTake.set(name, url);
      const source = context.createBufferSource();
      source.buffer = buffers.get(url);
      // a little higher or lower each time (as the flight's one-shots vary), so the same take never sounds the same twice
      source.playbackRate.value = Number.isFinite(detail.rate) && detail.rate > 0 ? detail.rate : between(1 - SAMPLE_VARY, 1 + SAMPLE_VARY);
      const volume = context.createGain();
      volume.gain.value = sample.level * (Number.isFinite(detail.level) ? detail.level : 1);
      source.connect(volume);
      track(source, [volume, ...outlet(volume, Number.isFinite(detail.pan) ? detail.pan : 0, master)]);
      source.start(context.currentTime);
    };
    for (const url of urls) {
      Promise.resolve()
        .then(() => globalThis.fetch(url))
        .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`))))
        .then(bytes => context.decodeAudioData(bytes))
        .then(buffer => buffers.set(url, buffer))
        .catch(() => {}); // a sound that cannot be had is simply not heard (or its made one is, in its place)
    }
  }
  const least = { ...GAPS, ...Object.fromEntries(fen.map(([name]) => [name, FEN_GAPS[name] ?? 0])), ...gaps };

  const lastPlayed = new Map();
  const allowed = () => !muted && !paused && context.state === 'running';
  const applyLevel = () => master.gain.setTargetAtTime(muted || paused ? 0 : 1, context.currentTime, 0.015);

  return {
    /**
     * Plays the sound called `name`, handing it `detail` (a sound that takes one: chapter 2's counting tone its number). Returns
     * whether it did: not for an unknown name, a page the browser has not let sound begin, a muted or held game, or a tap too soon
     * after the last one. A bed (the forest, the Fen) is the exception that waits instead of being dropped: asked for before sound
     * is allowed, it is laid by update() as soon as it is, and the last one asked for is the one laid.
     */
    play(name, detail) {
      if (typeof name !== 'string' || !Object.hasOwn(SOUNDS, name)) return false;
      if (BEDS.includes(name)) {
        wanted = name;
        calls = detail?.calls !== false;
        return allowed() && startBed(name);
      }
      if (!allowed() || sounding >= MAX_SOUNDS) return false;
      const now = context.currentTime;
      if (now - (lastPlayed.get(name) ?? -Infinity) < (least[name] ?? 0)) return false;
      lastPlayed.set(name, now);
      SOUNDS[name](detail ?? {});
      return true;
    },
    /**
     * Each frame, with the game clock's step: the small sounds over the bed, the forest's birds and rustles every 4 to 8 seconds of
     * game time, the Fen's frogs, drips, bubbles and dragonflies every 1.2 to 3.4.
     */
    update(dt) {
      if (!allowed()) return;
      if (wanted && bed?.name !== wanted) startBed(wanted);
      if (!bed || !calls) return;
      callIn -= dt;
      if (callIn > 0) return;
      if (bed.name === 'fen') {
        callIn = between(1.2, 3.4);
        fenCall({ tone, noise, hum, key, between }, ambience);
        return;
      }
      callIn = between(4.3, 7.6);
      if (random() > 0.4) {
        chirps({ level: 0.018, bus: ambience });
      } else {
        const pan = between(-0.7, 0.7);
        noise({ kind: 'brown', duration: 1.4, level: 0.032, frequency: 1600, end: 550, attack: 0.25, pan, bus: ambience });
        for (let i = 0; i < 3; i++) noise({ kind: 'white', type: 'bandpass', frequency: 3900, q: 5, duration: 0.08, level: 0.015, delay: 0.8 + i * 0.17, bus: ambience });
      }
    },
    /** Ends the bed's loop (the scene is over), or the wish for one; the effects that are playing finish by themselves. */
    stop() {
      wanted = null;
      if (bed) fadeOut(bed, 0.2);
    },
    /** Held with the game clock: silent while the book is open or the tab is hidden, and back after. */
    setPaused(value) {
      paused = Boolean(value);
      applyLevel();
    },
    get muted() { return muted; },
    set muted(value) {
      muted = Boolean(value);
      applyLevel();
    },
  };
}
