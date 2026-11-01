// The flight's own sound (chapter 4): a wind bed whose loudness and brightness follow her speed and lean with her bank, the river and
// the falls under it, and one-shot whooshes, wingbeats and gusts. Synthesized for now, from filtered noise as sfx.js makes its wind
// (spec 8 wants real recordings: they come in with the owner's yes, Task 16, behind the same calls).
//
//   const sounds = createFlightSounds({ context, output });
//   sounds.start();              // the bed fades in over 1.5 s
//   sounds.setSpeed(v);          // m/s along the route: the bed's gain (0.3 at 8 m/s, 1 at 18) and its filter follow
//   sounds.setPan(p);            // -1..1: the bed leans to one side in a bank
//   sounds.water(level); sounds.falls(level);   // 0..1: the river under her, the falls ahead
//   sounds.whoosh(side); sounds.wingbeat(); sounds.gust();
//   sounds.setPaused(on);        // held with the game (engine/audio/hold.js): silent at once, and back; pause() and resume() too
//   sounds.stop();               // fades out over 1 s and lets go of its nodes
//
// With no audio context (a capture, a review shot, Node without one) it is the same object, doing nothing.

export const FLIGHT_SOUND = {
  bed: 0.2, // the bed's gain into the output at full speed
  slow: 8, // m/s: the bed at `quiet` of its gain
  fast: 18, // m/s: the bed at its full gain
  quiet: 0.3,
  cutoff: [420, 1700], // Hz of its low-pass at `slow` and at `fast`
  follow: 0.25, // s: the time constant the bed follows her speed and bank with
  water: 0.07, // the river's gain at level 1
  falls: 0.3, // the falls' gain at level 1
  fadeIn: 1.5,
  fadeOut: 1,
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * Options: `context` (an AudioContext, or null for silence), `output` (where it plays: the page's output; the context's destination
 * by default), `noise(kind)` (an AudioBuffer of 'brown' or 'white' noise; made here by default) and `random` (for the noise).
 */
export function createFlightSounds({ context = null, output = null, noise = null, random = Math.random } = {}) {
  let paused = false;
  if (!context) {
    const idle = () => {};
    return {
      start: idle, setSpeed: idle, setPan: idle, whoosh: idle, wingbeat: idle, gust: idle, water: idle, falls: idle,
      pause: idle, resume: idle, stop: idle,
      setPaused(value) { paused = Boolean(value); },
      get playing() { return false; },
      get level() { return 0; },
      get bed() { return null; },
    };
  }

  const buffers = new Map();
  const noiseOf = kind => {
    if (noise) return noise(kind);
    if (!buffers.has(kind)) {
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        const white = random() * 2 - 1;
        brown = (brown + 0.02 * white) / 1.02;
        data[i] = kind === 'white' ? white : brown * 3.5;
      }
      buffers.set(kind, buffer);
    }
    return buffers.get(kind);
  };

  // Everything goes through `master`, which the hold silences; `fade` brings the flight in and out.
  const master = context.createGain();
  master.gain.value = 1;
  master.connect(output ?? context.destination);
  let live = null; // { fade, sources, speed, filter, pan, water, falls } while it plays

  function loop(kind, filterType, frequency, q, gain, into) {
    const source = context.createBufferSource();
    source.buffer = noiseOf(kind);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const volume = context.createGain();
    volume.gain.value = gain;
    source.connect(filter);
    filter.connect(volume);
    volume.connect(into);
    return { source, filter, volume };
  }

  function start() {
    if (live) return;
    const now = context.currentTime;
    const fade = context.createGain();
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FLIGHT_SOUND.fadeIn);
    fade.connect(master);
    const pan = context.createStereoPanner ? context.createStereoPanner() : null;
    const bedOut = context.createGain();
    bedOut.gain.value = FLIGHT_SOUND.bed;
    if (pan) {
      bedOut.connect(pan);
      pan.connect(fade);
    } else bedOut.connect(fade);
    const bed = loop('brown', 'lowpass', FLIGHT_SOUND.cutoff[0], 0.5, FLIGHT_SOUND.quiet, bedOut);
    const water = loop('white', 'bandpass', 520, 0.6, 0, fade);
    const falls = loop('brown', 'lowpass', 300, 0.4, 0, fade);
    const sources = [bed.source, water.source, falls.source];
    for (const source of sources) source.start(now);
    live = { fade, sources, nodes: [fade, bedOut, pan, bed.filter, bed.volume, water.filter, water.volume, falls.filter, falls.volume].filter(Boolean), bed, pan, water, falls };
  }

  const toward = (param, value, tau = FLIGHT_SOUND.follow) => param.setTargetAtTime(value, context.currentTime, tau);

  function setSpeed(v) {
    if (!live) return;
    const speed = Math.max(0, Number(v) || 0);
    const k = clamp((speed - FLIGHT_SOUND.slow) / (FLIGHT_SOUND.fast - FLIGHT_SOUND.slow), 0, 1);
    const gain = speed < FLIGHT_SOUND.slow ? FLIGHT_SOUND.quiet * (speed / FLIGHT_SOUND.slow) : FLIGHT_SOUND.quiet + (1 - FLIGHT_SOUND.quiet) * k;
    const [low, high] = FLIGHT_SOUND.cutoff;
    toward(live.bed.volume.gain, gain);
    toward(live.bed.filter.frequency, low * (high / low) ** k);
  }

  function setPan(p) {
    if (live?.pan) toward(live.pan.pan, clamp(Number(p) || 0, -1, 1));
  }

  /** A puff of noise through a filter that sweeps from `frequency` to `end` (Hz). */
  function puff({ kind = 'white', type = 'bandpass', frequency, end, q = 0.8, duration, level, attack = 0.05, delay = 0, pan = 0 }) {
    const at = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseOf(kind);
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, end), at + duration);
    const volume = context.createGain();
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(level, at + Math.min(attack, duration * 0.4));
    volume.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(volume);
    const nodes = [filter, volume];
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      volume.connect(panner);
      panner.connect(master);
      nodes.push(panner);
    } else volume.connect(master);
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
    source.start(at, random() * 2);
    source.stop(at + duration + 0.02);
  }

  function stop() {
    if (!live) return;
    const { fade, sources, nodes } = live;
    live = null;
    const now = context.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(0, now + FLIGHT_SOUND.fadeOut);
    sources[0].onended = () => {
      for (const source of sources) source.disconnect();
      for (const node of nodes) node.disconnect();
    };
    for (const source of sources) source.stop(now + FLIGHT_SOUND.fadeOut + 0.05);
  }

  function setPaused(value) {
    paused = Boolean(value);
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(paused ? 0 : 1, now + (paused ? 0.05 : 0.3));
  }

  return {
    start, setSpeed, setPan, stop, setPaused,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    /** As something passes close on one side (-1 left, 1 right): trees, rocks, a bank, a camera she shoots past. */
    whoosh(side = 0) { if (!paused) puff({ frequency: 1500, end: 340, q: 0.9, duration: 0.75, level: 0.09, attack: 0.25, pan: 0.7 * clamp(side, -1, 1) }); },
    /** Two beats of her wings: at the take-off, in a turn, in „Hraðar!“. */
    wingbeat() {
      if (paused) return;
      for (const delay of [0, 0.34]) puff({ kind: 'brown', type: 'lowpass', frequency: 300, end: 110, q: 0.7, duration: 0.22, level: 0.16, attack: 0.02, delay });
    },
    /** A gust (the wind task). */
    gust() { if (!paused) puff({ kind: 'brown', type: 'lowpass', frequency: 950, end: 300, q: 0.5, duration: 1.6, level: 0.1, attack: 0.5 }); },
    water(level) { if (live) toward(live.water.volume.gain, FLIGHT_SOUND.water * clamp(Number(level) || 0, 0, 1), 0.5); },
    falls(level) { if (live) toward(live.falls.volume.gain, FLIGHT_SOUND.falls * clamp(Number(level) || 0, 0, 1), 0.5); },
    /** Whether the bed is playing (started and not stopped). */
    get playing() { return Boolean(live); },
    /** The hold's level now: 1 while it may sound, 0 held. */
    get level() { return master.gain.value; },
    /** The bed now, for a test: its gain for her speed and its filter's cutoff. */
    get bed() { return live ? { gain: live.bed.volume.gain.value, cutoff: live.bed.filter.frequency.value } : null; },
  };
}
