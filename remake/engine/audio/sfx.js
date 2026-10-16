// The sound effects: small sounds made on the spot with Web Audio, as in the old game (dist/audio.js: the tone, noise and bell
// helpers, the footfall and the forest's wind and birds are ported from it). Nothing is recorded. The bell sounds (the plate, the
// star and their kin) are tuned to the key of the theme (theme.json), so they sit in the music instead of against it.
//
// A sound plays only when the browser has let sound begin (the first touch), nothing holds the game (the book is open, the tab is
// hidden) and the effects are not muted (a capture's silent replay). The scene asks for one by name: s.sfx(name).
// The forest is a loop, laid once; the birds and rustles that come and go over it are scheduled by update(dt) on the game clock.

const MAX_SOUNDS = 48; // sources sounding at once: a child tapping fast cannot pile up more than this
const DEFAULT_KEY = [523.25, 587.33, 659.25, 783.99, 880]; // C major pentatonic, for a page with no theme.json
// The least time, in audio seconds, between two plays of the same sound, for the ones a child can tap again and again.
const GAPS = { frog: 0.45, snail: 0.4, beetle: 0.4, birds: 0.5, butterfly: 0.25, flower: 0.15 };

export function createSfx({ context = null, theme = null, output, random = Math.random } = {}) {
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

  /** Little rising chirps, as a bird makes them. */
  function chirps({ pitch = between(1350, 1850), count = 3, level, pan = between(-0.65, 0.65), delay = 0, bus }) {
    for (let i = 0; i < count; i++) tone({ frequency: pitch + i * 85, end: pitch * 1.26, duration: 0.11, level, delay: delay + i * 0.16, pan, bus });
  }

  // The forest: a bed of wind that swells and fades slowly, laid once, with birds and rustles on top of it.
  let forest = null;
  let forestWanted = false; // the scene asked for it: it is laid as soon as sound is allowed (the context wakes a moment after the touch)
  let callIn = 0; // game seconds until the next bird or rustle

  function startForest() {
    if (forest) return false;
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
    forest = { source, swell, fade, nodes: [filter, bed, depth, fade] };
    callIn = between(1.5, 3.5);
    return true;
  }

  function stopForest() {
    if (!forest) return;
    const { source, swell, fade, nodes } = forest;
    forest = null;
    const now = context.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setTargetAtTime(0, now, 0.2);
    source.stop(now + 1.2);
    swell.stop(now + 1.2);
    source.onended = () => {
      source.disconnect();
      swell.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  let stepSide = 0;
  const SOUNDS = {
    forest: startForest, // laid by play and update, which treat it apart from the one-shots; it is here so that the name is known
    // Mosi's footfall: a low thump and a puff of earth, from the left and the right in turn (the old game's footstep).
    step() {
      stepSide = 1 - stepSide;
      const pan = stepSide ? 0.13 : -0.13;
      tone({ frequency: between(105, 125), end: 65, duration: 0.11, level: 0.15, pan });
      noise({ duration: 0.18, level: 0.34, frequency: 850, end: 350, pan, attack: 0.008 });
    },
    // A ribbit: two throaty croaks, the second one rising.
    frog() {
      const pitch = between(0.95, 1.05);
      const pan = between(-0.3, 0.3);
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
    // Two birds, one answering the other.
    birds() {
      chirps({ pitch: between(1350, 1700), count: 3, level: 0.1, pan: -0.35 });
      chirps({ pitch: between(1750, 2100), count: 2, level: 0.08, pan: 0.4, delay: 0.5 });
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
  };

  const lastPlayed = new Map();
  const allowed = () => !muted && !paused && context.state === 'running';
  const applyLevel = () => master.gain.setTargetAtTime(muted || paused ? 0 : 1, context.currentTime, 0.015);

  return {
    /**
     * Plays the sound called `name`. Returns whether it did: not for an unknown name, a page the browser has not let sound begin, a
     * muted or held game, or a tap too soon after the last one. The forest is the exception that waits instead of being dropped:
     * asked for before sound is allowed, it is laid by update() as soon as it is.
     */
    play(name) {
      if (typeof name !== 'string' || !Object.hasOwn(SOUNDS, name)) return false;
      if (name === 'forest') {
        forestWanted = true;
        return allowed() && startForest();
      }
      if (!allowed() || sounding >= MAX_SOUNDS) return false;
      const now = context.currentTime;
      if (now - (lastPlayed.get(name) ?? -Infinity) < (GAPS[name] ?? 0)) return false;
      lastPlayed.set(name, now);
      SOUNDS[name]();
      return true;
    },
    /** Each frame, with the game clock's step: the forest's birds and rustles, every 4 to 8 seconds of game time. */
    update(dt) {
      if (!allowed()) return;
      if (forestWanted && !forest) startForest();
      if (!forest) return;
      callIn -= dt;
      if (callIn > 0) return;
      callIn = between(4.3, 7.6);
      if (random() > 0.4) {
        chirps({ level: 0.018, bus: ambience });
      } else {
        const pan = between(-0.7, 0.7);
        noise({ kind: 'brown', duration: 1.4, level: 0.032, frequency: 1600, end: 550, attack: 0.25, pan, bus: ambience });
        for (let i = 0; i < 3; i++) noise({ kind: 'white', type: 'bandpass', frequency: 3900, q: 5, duration: 0.08, level: 0.015, delay: 0.8 + i * 0.17, bus: ambience });
      }
    },
    /** Ends the forest's loop (the scene is over), or the wish for it; the effects that are playing finish by themselves. */
    stop() {
      forestWanted = false;
      stopForest();
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
