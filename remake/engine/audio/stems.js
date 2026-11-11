// A loop in layers: chapter 5's band under the choir (assets/audio/kafli5/song/song.json, written by tools/kafli5-song.mjs). The loop
// is a few bars of the song with a file a layer (drums, bass, music ...). Every layer plays all the time, in step to the sample, and
// each has a level of its own, so a layer joins by fading in, never by starting: as Egill finds a phrase of her song, the band finds
// a player.
//
// The layers are short, so they are decoded whole (four of 19 s are a few megabytes; the song itself is streamed: engine/audio/
// song.js) and looped by the sample between two points inside each file: a file is the loop's last bar, the loop, and its first bar,
// so a decoder that starts a few milliseconds off still loops on the same music.
//
// The loop belongs to the game clock, as the theme does (engine/audio/music.js): where it is in its bars is the clock's time folded
// into the loop's length, from song.json's beatOffset. So the beat is the same on every run, a tap can wait for "the next beat"
// without asking the speakers, and after a hold (the book is open, the tab is hidden) the layers start where the clock stood. The
// sound follows the clock: if the two come apart (a long frame the clock counted) the layers start again where the clock is.

const LEAD = 0.06; // s from asking to sounding: all the layers are scheduled on the same audio time, a moment ahead
const FADE = 0.04; // s the bus takes in and out around a start and a halt
const APART = 0.07; // s the sound may be off the clock before the layers start again
const SETTLE = 0.5; // s after a start before the two are compared

const fold = (value, length) => ((value % length) + length) % length;

/**
 * The loop of `song` (song.json: { bpm, beatOffset, loop: { layers: { id: file }, startSec, seconds } }, files read against `base`)
 * on `context` (an AudioContext, or null: a beat and nothing else) through `output`, following the game `clock` ({ time }).
 *
 * Returns { ready, play, layer, level, update, setPaused, stop, delayToBeat, beatAt, playing, position }. Every layer starts
 * silent: layer(id, level, seconds) brings one in. update() is called every frame, the game held or not.
 */
export function createStems({ context = null, output = null, clock, song, base, fetch = globalThis.fetch } = {}) {
  const beat = 60 / song.bpm;
  const offset = song.beatOffset ?? 0;
  const { layers, startSec, seconds } = song.loop;
  const ids = Object.keys(layers);
  const levels = Object.fromEntries(ids.map(id => [id, 0]));
  const phaseAt = time => fold(time - offset, seconds);
  /** Seconds from `from` (the clock's now) to the next point of the grid of `step` beats; nothing on a point. */
  const delayToBeat = (step = 1, from = clock.time) => {
    const grid = step * beat;
    const since = from - offset;
    const next = Math.ceil(since / grid - 1e-9) * grid;
    return Math.max(0, next - since);
  };
  const beatAt = (time = clock.time) => (time - offset) / beat;

  let playing = false; // the scene has started it and not stopped it
  let held = false; // the game holds its sound
  if (!context) {
    return {
      ready: Promise.resolve(false),
      play() { playing = true; },
      layer(id, level) { if (!(id in levels)) throw new TypeError(`stems: no layer "${id}"`); levels[id] = level; },
      level: id => levels[id],
      update() {},
      setPaused(value) { held = Boolean(value); },
      stop() { playing = false; },
      delayToBeat,
      beatAt,
      get playing() { return playing; },
      get position() { return phaseAt(clock.time); },
    };
  }

  const bus = context.createGain();
  bus.gain.value = 0;
  bus.connect(output ?? context.destination);
  const gains = Object.fromEntries(ids.map(id => {
    const gain = context.createGain();
    gain.layer = id;
    gain.gain.value = 0;
    gain.connect(bus);
    return [id, gain];
  }));
  const buffers = new Map();
  let loaded = false;
  const ready = Promise.all(ids.map(id => Promise.resolve()
    .then(() => fetch(new URL(layers[id], base).href))
    .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`))))
    .then(bytes => context.decodeAudioData(bytes))
    .then(buffer => { buffers.set(id, buffer); })
    .catch(() => {}))) // a layer that cannot be read is a layer less
    .then(() => { loaded = true; return buffers.size > 0; });

  let sources = [];
  let startedAt = 0; // the audio time the sources started on
  let startedPhase = 0; // and where in the loop

  function start() {
    if (!playing || held || !loaded || sources.length || context.state !== 'running') return;
    const when = context.currentTime + LEAD;
    const phase = phaseAt(clock.time + LEAD);
    for (const [id, buffer] of buffers) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = startSec;
      source.loopEnd = startSec + seconds;
      source.connect(gains[id]);
      source.start(when, startSec + phase);
      sources.push(source);
    }
    startedAt = when;
    startedPhase = phase;
    bus.gain.cancelScheduledValues(context.currentTime);
    bus.gain.setValueAtTime(0, when);
    bus.gain.linearRampToValueAtTime(1, when + FADE);
  }

  function halt(fade = FADE) {
    if (!sources.length) return;
    const now = context.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(0, now + fade);
    for (const source of sources) source.stop(now + fade + 0.01);
    sources = [];
  }

  return {
    ready,
    /** Starts the loop where the clock is in it. The layers stay as silent as they were. */
    play() {
      playing = true;
      start();
    },
    /** Brings layer `id` to `level` (0 to 1 and over) in `seconds`. */
    layer(id, level, fade = 0) {
      if (!(id in levels)) throw new TypeError(`stems: no layer "${id}"`);
      levels[id] = level;
      const now = context.currentTime;
      const param = gains[id].gain;
      const from = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(from, now);
      if (fade > 0) param.linearRampToValueAtTime(level, now + fade);
      else param.setValueAtTime(level, now);
    },
    level: id => levels[id],
    /** Each frame: starts what waits for its files, the context or the hold, and keeps the sound on the clock. */
    update() {
      if (!playing || held) return;
      if (!sources.length) { start(); return; }
      if (context.currentTime < startedAt + SETTLE) return;
      const heard = fold(startedPhase + (context.currentTime - startedAt), seconds);
      let apart = heard - phaseAt(clock.time);
      if (apart > seconds / 2) apart -= seconds;
      if (apart < -seconds / 2) apart += seconds;
      if (Math.abs(apart) > APART) halt(); // and the next frame starts them where the clock is
    },
    /** Held with the game: silent at once, and back where the clock is when let go. */
    setPaused(value) {
      held = Boolean(value);
      if (held) halt();
      else start();
    },
    /** Fades the loop out over `fade` seconds; it does not come back. */
    stop(fade = 1) {
      playing = false;
      halt(fade);
    },
    delayToBeat,
    beatAt,
    get playing() { return playing; },
    /** Seconds into the loop: the game clock's time folded into it. */
    get position() { return phaseAt(clock.time); },
  };
}
