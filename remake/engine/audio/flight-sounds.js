// The flight's own sound (chapter 4): the airflow whose loudness and brightness follow her speed and lean with her bank, the river,
// the rapids and the falls under it, the gorge's echo, and one-shot whooshes, wingbeats and gusts. Recorded (spec 8, Task 16): the
// owner's picks in assets/audio/kafli4/hljod (CREDITS.md there), fetched and decoded once for the page (loadFlightRecordings). Until a
// loop's recordings have decoded, and with none at all (a test, Node), it is made from filtered noise as sfx.js makes its wind, and
// gives way to the recordings as they come.
//
//   const sounds = createFlightSounds({ context, output, recordings: loadFlightRecordings(context) });
//   sounds.start();              // the loops fade in over 1.5 s
//   sounds.setSpeed(v);          // m/s along the route: the airflow's gain (0.3 at 8 m/s, 1 at 18) and its filter follow
//   sounds.burst(seconds);       // a „Hraðar!“ burst: the airflow 1.4 times louder for its time
//   sounds.setPan(p);            // -1..1: the airflow leans to one side in a bank, at most 0.6
//   sounds.water(level); sounds.rapids(level); sounds.falls(level, pan);   // 0..1: the river under her, its white water, the falls
//                                                                          // ahead (pan -1..1: where they are across the speakers)
//   sounds.gorge(level);         // 0..1: between the gorge's walls, everything echoes
//   sounds.duck(on);             // while a line plays: the loops dip about 8 dB, and come back after it
//   sounds.whoosh(side); sounds.wingbeat(); sounds.flap(); sounds.gust({ rate });   // flap: one beat; rate: the gust's pitch
//   sounds.setPaused(on);        // held with the game (engine/audio/hold.js): silent at once, and back; pause() and resume() too
//   sounds.stop();               // fades out over 1 s and lets go of its loops
//
// With no audio context (a capture, a review shot, Node without one) it is the same object, doing nothing.
import { loopOf } from '../eitt/eitt-sounds.js';

const HLJOD = new URL('../../assets/audio/kafli4/hljod/', import.meta.url).href;

export const FLIGHT_SOUND = {
  bed: 0.2, // the made airflow's gain into the output at full speed
  slow: 8, // m/s: the airflow at `quiet` of its gain
  fast: 18, // m/s: the airflow at its full gain
  quiet: 0.3,
  cutoff: [420, 1700], // Hz of the made airflow's low-pass at `slow` and at `fast`
  follow: 0.25, // s: the time constant the airflow follows her speed and bank with
  water: 0.07, // the made river's gain at level 1
  rapids: 0.09,
  falls: 0.3,
  burst: 1.4, // the airflow in a burst, times its gain at her speed
  pan: 0.6, // the furthest the airflow leans to a side
  fallsPan: 0.7, // and the falls' roar
  fadeIn: 1.5,
  fadeOut: 1,
  swap: 0.6, // s: a made loop fades out as its recording comes in
  // the recordings (levelled by tools/kafli4-sounds.mjs: loops to -24 LUFS, one-shots to a -3 dB peak): each loop's gain at full
  // level, the airflow's filter, and each one-shot's gain
  recorded: { bed: 0.45, water: 0.7, rapids: 0.9, falls: 1.4, cutoff: [2600, 16000], wingbeat: 0.5, whoosh: 0.35, gust: 0.42 },
  duck: 0.4, // the loops' gain while a line plays (about -8 dB), so every word is heard over the wind and the water
  // the gorge: a few echoes off its walls, duller each time, of everything sent to it
  echo: { send: 0.35, taps: [[0.13, 0.5], [0.24, 0.32], [0.39, 0.18]], cutoff: 2200 },
};

/** Each loop's recorded layers: [file, its gain in the loop]. */
export const FLIGHT_LOOPS = {
  bed: [['airflow.mp3', 1], ['flutter.mp3', 0.9]], // the wind past her ears, and the air on her wings (a paraglider's)
  water: [['river-a.mp3', 0.75], ['river-b.mp3', 0.75]],
  rapids: [['rapids.mp3', 1]],
  falls: [['falls.mp3', 1]],
};
/** Each one-shot's recorded takes: one of them each time, never the same one twice running. */
export const FLIGHT_SHOTS = {
  wingbeat: ['wing-1.mp3', 'wing-2.mp3', 'wing-3.mp3'],
  whoosh: ['whoosh-1.mp3', 'whoosh-2.mp3', 'whoosh-3.mp3'],
  gust: ['gust-1.mp3', 'gust-2.mp3', 'gust-3.mp3'],
};
const FILES = [...new Set([...Object.values(FLIGHT_LOOPS).flat().map(([file]) => file), ...Object.values(FLIGHT_SHOTS).flat()])];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const stores = new WeakMap();

/**
 * The flight's recordings for the page's audio context, fetched and decoded once (the next call gives the same store), in the
 * background: { get(file) → its AudioBuffer once decoded, ready → a promise that settles (true) when every file has come or failed }.
 * A file that cannot be had is never there, and the loop or one-shot it belongs to stays made. No context, no store.
 */
export function loadFlightRecordings(context, { fetch = globalThis.fetch, base = HLJOD } = {}) {
  if (!context) return null;
  if (stores.has(context)) return stores.get(context);
  const buffers = new Map();
  const ready = Promise.all(FILES.map(file => Promise.resolve()
    .then(() => fetch(new URL(file, base).href))
    .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`))))
    .then(bytes => context.decodeAudioData(bytes))
    .then(buffer => { buffers.set(file, buffer); })
    .catch(() => {}))).then(() => true);
  const store = { get: file => buffers.get(file), ready };
  stores.set(context, store);
  return store;
}

/**
 * Options: `context` (an AudioContext, or null for silence), `output` (where it plays: the page's output; the context's destination
 * by default), `recordings` (a store from loadFlightRecordings, or null: all made), `noise(kind)` (an AudioBuffer of 'brown' or
 * 'white' noise; made here by default) and `random` (for the noise, the takes and where a loop starts).
 */
export function createFlightSounds({ context = null, output = null, recordings = null, noise = null, random = Math.random } = {}) {
  let paused = false;
  if (!context) {
    const idle = () => {};
    return {
      start: idle, setSpeed: idle, setPan: idle, burst: idle, whoosh: idle, wingbeat: idle, flap: idle, gust: idle,
      water: idle, rapids: idle, falls: idle, gorge: idle, duck: idle, pause: idle, resume: idle, stop: idle,
      setPaused(value) { paused = Boolean(value); },
      get playing() { return false; },
      get level() { return 0; },
      get bed() { return null; },
      get echo() { return 0; },
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

  // Everything goes through `master`, which the hold silences. The gorge's echo is fed by `echoIn` (0 out of the gorge): a few taps
  // of delay, each duller and quieter, into the master. No tap feeds back, so it dies away by itself.
  const master = context.createGain();
  master.gain.value = 1;
  master.connect(output ?? context.destination);
  const echoIn = context.createGain();
  echoIn.gain.value = 0;
  // the loops come in through `under`, which dips while a line plays (duck); the one-shots go round it
  const under = context.createGain();
  under.gain.value = 1;
  under.connect(master);
  under.connect(echoIn);
  let ducking = false;
  if (context.createDelay) {
    const dull = context.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = FLIGHT_SOUND.echo.cutoff;
    dull.Q.value = 0.5;
    echoIn.connect(dull);
    for (const [seconds, gain] of FLIGHT_SOUND.echo.taps) {
      const delay = context.createDelay(1);
      delay.delayTime.value = seconds;
      const tap = context.createGain();
      tap.gain.value = gain;
      dull.connect(delay);
      delay.connect(tap);
      tap.connect(master);
    }
  }

  const toward = (param, value, tau = FLIGHT_SOUND.follow) => param.setTargetAtTime(value, context.currentTime, tau);
  const has = layers => recordings && layers.every(([file]) => recordings.get(file));

  // ---- The loops -------------------------------------------------------------------------------------------------------------------
  // Each loop is a channel: its layers (a made one of noise through a filter, or its recorded ones), each at its own gain, into
  // `volume`, which its level drives (the airflow: through its filter before, and its boost and its pan after), into the fade. A
  // channel's layers change once, from made to recorded, as its recordings come; its volume stays.
  let live = null; // { fade, channels, nodes, pan, speed } while it plays

  function madeLayer(channel, kind, type, frequency, q, level) {
    const source = context.createBufferSource();
    source.buffer = noiseOf(kind);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.value = level;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(channel.input);
    source.start(context.currentTime, random() * 2);
    return { source, nodes: [filter, gain], gain };
  }

  function recordedLayer(channel, file, level, at) {
    const buffer = recordings.get(file);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const span = loopOf(buffer); // from its first sound to its last: the encoder's padding at either end is no gap in the loop
    if (span.end - span.start > 0.5) {
      source.loopStart = span.start;
      source.loopEnd = span.end;
    }
    const gain = context.createGain();
    gain.gain.setValueAtTime(at > 0 ? 0 : level, context.currentTime);
    if (at > 0) gain.gain.linearRampToValueAtTime(level, context.currentTime + at);
    source.connect(gain);
    gain.connect(channel.input);
    const from = span.start + random() * Math.max(0, span.end - span.start - 0.1); // the layers do not all begin at their starts
    source.start(context.currentTime, from);
    return { source, nodes: [gain], gain };
  }

  /** The loop `name` as recordings now, fading the made one out over `swap` s (0: at once, as it starts). */
  function record(channel, swap) {
    if (channel.recorded || !has(FLIGHT_LOOPS[channel.name])) return;
    const now = context.currentTime;
    for (const layer of channel.layers) {
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
      layer.gain.gain.linearRampToValueAtTime(0, now + swap);
      layer.source.stop(now + swap + 0.05);
      const { source, nodes } = layer;
      source.onended = () => {
        source.disconnect();
        for (const node of nodes) node.disconnect();
      };
    }
    const gain = FLIGHT_SOUND.recorded[channel.name];
    channel.layers = FLIGHT_LOOPS[channel.name].map(([file, level]) => recordedLayer(channel, file, gain * level, swap));
    channel.recorded = true;
    if (live && channel.name === 'bed') speedTo(live.speed, true); // its filter to the recording's range
  }

  // the made loops: noise, its filter (the airflow's is its channel's, which follows her speed) and its gain at full level
  const MADE = {
    bed: ['brown', 'lowpass', 20000, 0.5, FLIGHT_SOUND.bed],
    water: ['white', 'bandpass', 520, 0.6, FLIGHT_SOUND.water],
    rapids: ['white', 'bandpass', 900, 0.5, FLIGHT_SOUND.rapids],
    falls: ['brown', 'lowpass', 300, 0.4, FLIGHT_SOUND.falls],
  };

  function start() {
    if (live) return;
    const now = context.currentTime;
    const pan = context.createStereoPanner ? context.createStereoPanner() : null;
    const fade = context.createGain();
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FLIGHT_SOUND.fadeIn);
    fade.connect(under);
    const nodes = [fade, pan].filter(Boolean);
    const channels = {};
    for (const name of Object.keys(FLIGHT_LOOPS)) {
      const input = context.createGain(); // where its layers meet
      const filter = name === 'bed' ? context.createBiquadFilter() : null; // the airflow brightens with her speed
      const volume = context.createGain(); // its level: her speed for the airflow, the river under her for the water
      volume.gain.value = name === 'bed' ? FLIGHT_SOUND.quiet : 0;
      const boost = name === 'bed' ? context.createGain() : null; // a burst
      // the falls' roar comes from where they are (the juice review's item 10): a panner of its own after its volume
      const side = name === 'falls' && context.createStereoPanner ? context.createStereoPanner() : null;
      const chain = [input, filter, volume, boost, side].filter(Boolean);
      for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
      if (name === 'bed' && pan) {
        boost.connect(pan);
        pan.connect(fade);
      } else chain.at(-1).connect(fade);
      nodes.push(...chain);
      const channel = { name, input, filter, volume, boost, side, recorded: false, layers: [] };
      if (has(FLIGHT_LOOPS[name])) record(channel, 0);
      else channel.layers = [madeLayer(channel, ...MADE[name])];
      if (filter) {
        filter.type = 'lowpass';
        filter.Q.value = 0.5;
        filter.frequency.value = (channel.recorded ? FLIGHT_SOUND.recorded.cutoff : FLIGHT_SOUND.cutoff)[0];
      }
      channels[name] = channel;
    }
    live = { fade, channels, nodes, pan, speed: 0 };
    // recordings already here took their place above; the ones still coming take it as they come
    if (recordings && Object.values(channels).some(channel => !channel.recorded)) {
      const waiting = live;
      recordings.ready.then(() => {
        if (live !== waiting) return;
        for (const channel of Object.values(channels)) record(channel, FLIGHT_SOUND.swap);
      });
    }
  }

  // ---- What the flight drives ------------------------------------------------------------------------------------------------------
  function speedTo(v, now = false) {
    const bed = live.channels.bed;
    const speed = Math.max(0, Number(v) || 0);
    live.speed = speed;
    const k = clamp((speed - FLIGHT_SOUND.slow) / (FLIGHT_SOUND.fast - FLIGHT_SOUND.slow), 0, 1);
    const gain = speed < FLIGHT_SOUND.slow ? FLIGHT_SOUND.quiet * (speed / FLIGHT_SOUND.slow) : FLIGHT_SOUND.quiet + (1 - FLIGHT_SOUND.quiet) * k;
    const [low, high] = bed.recorded ? FLIGHT_SOUND.recorded.cutoff : FLIGHT_SOUND.cutoff;
    toward(bed.volume.gain, gain);
    toward(bed.filter.frequency, low * (high / low) ** k, now ? 0.05 : FLIGHT_SOUND.follow);
  }

  function setSpeed(v) {
    if (live) speedTo(v);
  }

  function setPan(p) {
    if (live?.pan) toward(live.pan.pan, clamp(Number(p) || 0, -FLIGHT_SOUND.pan, FLIGHT_SOUND.pan));
  }

  function burst(seconds = 2.5) {
    if (!live) return;
    const boost = live.channels.bed.boost.gain;
    const now = context.currentTime;
    boost.cancelScheduledValues(now);
    boost.setTargetAtTime(FLIGHT_SOUND.burst, now, 0.15);
    boost.setTargetAtTime(1, now + seconds, 0.3);
  }

  const level = (name, value) => {
    if (live) toward(live.channels[name].volume.gain, clamp(Number(value) || 0, 0, 1), 0.5);
  };

  // ---- The one-shots ---------------------------------------------------------------------------------------------------------------
  const last = new Map(); // kind → the take it played last

  /** One of `kind`'s recorded takes, not the one it played last; null while none has decoded. */
  function take(kind) {
    if (!recordings) return null;
    const ready = FLIGHT_SHOTS[kind].filter(file => recordings.get(file));
    const fresh = ready.length > 1 ? ready.filter(file => file !== last.get(kind)) : ready;
    if (!fresh.length) return null;
    const file = fresh[Math.floor(random() * fresh.length) % fresh.length];
    last.set(kind, file);
    return recordings.get(file);
  }

  /** Into the master (and the gorge's echo), on its side. */
  function outlet(volume, pan) {
    const nodes = [];
    let end = volume;
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      volume.connect(panner);
      nodes.push(panner);
      end = panner;
    }
    end.connect(master);
    end.connect(echoIn);
    return nodes;
  }

  /** A recorded take of `kind`; false when there is none to play. */
  function shot(kind, { pan = 0, delay = 0, rate = 1 } = {}) {
    const buffer = take(kind);
    if (!buffer) return false;
    const at = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const volume = context.createGain();
    volume.gain.value = FLIGHT_SOUND.recorded[kind];
    source.connect(volume);
    const nodes = [volume, ...outlet(volume, pan)];
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
    source.start(at);
    return true;
  }

  /** A puff of noise through a filter that sweeps from `frequency` to `end` (Hz): the made one-shots. */
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
    const nodes = [filter, volume, ...outlet(volume, pan)];
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
    source.start(at, random() * 2);
    source.stop(at + duration + 0.02);
  }

  const vary = () => 0.94 + random() * 0.12; // a take a little higher or lower each time

  function stop() {
    if (!live) return;
    const { fade, channels, nodes } = live;
    live = null;
    const now = context.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(0, now + FLIGHT_SOUND.fadeOut);
    const layers = Object.values(channels).flatMap(channel => channel.layers);
    layers[0].source.onended = () => {
      for (const layer of layers) {
        layer.source.disconnect();
        for (const node of layer.nodes) node.disconnect();
      }
      for (const node of nodes) node.disconnect();
    };
    for (const layer of layers) layer.source.stop(now + FLIGHT_SOUND.fadeOut + 0.05);
  }

  function setPaused(value) {
    paused = Boolean(value);
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(paused ? 0 : 1, now + (paused ? 0.05 : 0.3));
  }

  return {
    start, setSpeed, setPan, burst, stop, setPaused,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    /** As something passes close on one side (-1 left, 1 right): trees, rocks, a bank, a camera she shoots past. */
    whoosh(side = 0) {
      if (paused) return;
      const pan = 0.7 * clamp(Number(side) || 0, -1, 1);
      if (!shot('whoosh', { pan, rate: vary() })) puff({ frequency: 1500, end: 340, q: 0.9, duration: 0.75, level: 0.09, attack: 0.25, pan });
    },
    /** Two beats of her wings: at the take-off, in a turn, in „Hraðar!“. */
    wingbeat() {
      if (paused) return;
      for (const delay of [0, 0.4]) {
        if (!shot('wingbeat', { delay, rate: vary() })) puff({ kind: 'brown', type: 'lowpass', frequency: 300, end: 110, q: 0.7, duration: 0.22, level: 0.16, attack: 0.02, delay });
      }
    },
    /** One beat of her wings, as a loop of her fly clip begins its downstroke (chapters/kafli4-flugedla.js wingFlaps). */
    flap() {
      if (paused) return;
      if (!shot('wingbeat', { rate: vary() })) puff({ kind: 'brown', type: 'lowpass', frequency: 300, end: 110, q: 0.7, duration: 0.22, level: 0.16, attack: 0.02 });
    },
    /**
     * A gust (the wind task), a little higher or lower each time; `rate` sets its pitch (the wind's six gusts climb a little:
     * chapters/kafli4-wind.js).
     */
    gust({ rate = null } = {}) {
      if (paused) return;
      const pitch = Number.isFinite(rate) && rate > 0 ? rate : vary();
      if (!shot('gust', { pan: (random() - 0.5) * 0.6, rate: pitch })) puff({ kind: 'brown', type: 'lowpass', frequency: 950 * pitch, end: 300 * pitch, q: 0.5, duration: 1.6, level: 0.1, attack: 0.5 });
    },
    water: value => level('water', value),
    rapids: value => level('rapids', value),
    falls(value, pan = null) {
      level('falls', value);
      const side = live?.channels.falls.side;
      if (side && Number.isFinite(pan)) toward(side.pan, clamp(pan, -FLIGHT_SOUND.fallsPan, FLIGHT_SOUND.fallsPan), 0.3);
    },
    gorge(value) { toward(echoIn.gain, FLIGHT_SOUND.echo.send * clamp(Number(value) || 0, 0, 1), 0.6); },
    /** While a line plays (on), the loops dip to `duck` of their gain, quickly; after it they come back, slowly. */
    duck(on) {
      if (Boolean(on) === ducking) return; // asked every few frames: only a change is scheduled
      ducking = Boolean(on);
      toward(under.gain, ducking ? FLIGHT_SOUND.duck : 1, ducking ? 0.1 : 0.5);
    },
    /** The loops' dip now: 1, or `duck` under a line. */
    get dip() { return under.gain.value; },
    /** Whether the loops are playing (started and not stopped). */
    get playing() { return Boolean(live); },
    /** The hold's level now: 1 while it may sound, 0 held. */
    get level() { return master.gain.value; },
    /** The airflow now, for a test: its gain for her speed (and a burst), its filter's cutoff, and whether it is the recording. */
    get bed() {
      if (!live) return null;
      const bed = live.channels.bed;
      return { gain: bed.volume.gain.value * bed.boost.gain.value, cutoff: bed.filter.frequency.value, recorded: bed.recorded };
    },
    /** The gorge's echo send now. */
    get echo() { return echoIn.gain.value; },
  };
}
