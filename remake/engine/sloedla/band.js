// The band behind the dinosaurs in Slóeðla's song game: drums, bass, chords and sparkle, made on the spot with Web Audio (no
// samples), so a song written as data (song.js) plays in any key and tempo, changes key for a big last chorus, and lets layers
// come and go as the child plays. The dinosaurs' own instruments (Slóeðla's horn, Kambeðla's plates, Þórseðla's drum) are in
// sounds.js; they play the parts the child taps.
//
// Every voice is scheduled at a context time (`at`) into a destination node (`into`): the conductor (conductor.js) routes each
// layer through a gain of its own (a streak layer, the mood filter of a calm section) and schedules a little ahead of the clock.

/** A room for the band: a convolver with a made-up hall (stereo noise dying away over `seconds`). */
export function createReverb(context, { seconds = 2.2, random = Math.random } = {}) {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = context.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (random() * 2 - 1) * (1 - i / length) ** 3.2;
  }
  const convolver = context.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

/**
 * The band on `context`. `output` takes the dry sound, `room` (optional) the reverb send. Returns { play(name, { at, freq, dur,
 * vel, into, notes }) } where `name` is one of BAND (below) and `into` the node a voice goes to (its layer); a chord voice takes
 * `notes`, a list of frequencies.
 */
export function createBand(context, { output, room = null, random = Math.random } = {}) {
  let noise = null;
  function noiseBuffer() {
    if (!noise) {
      noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    }
    return noise;
  }

  /** The end of a voice: its level envelope, a pan, the dry path and a share sent to the room. Returns the gain to feed. */
  function strip({ at, into, pan = 0, send = 0 }) {
    const volume = context.createGain();
    volume.gain.value = 0;
    let last = volume;
    const nodes = [volume];
    if (pan && context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      volume.connect(panner);
      last = panner;
      nodes.push(panner);
    }
    last.connect(into ?? output);
    if (send > 0 && room) {
      const wet = context.createGain();
      wet.gain.value = send;
      last.connect(wet);
      wet.connect(room);
      nodes.push(wet);
    }
    return { volume, nodes };
  }

  function free(source, nodes) {
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  function env(param, at, { level, attack = 0.005, decay = 0.1, sustain = 0, release = 0.05, dur = 0.1 }) {
    param.setValueAtTime(0, at);
    param.linearRampToValueAtTime(level, at + attack);
    const hold = Math.max(0.0001, level * sustain);
    param.exponentialRampToValueAtTime(hold, at + attack + decay);
    if (sustain > 0) param.setValueAtTime(hold, at + Math.max(attack + decay, dur));
    param.exponentialRampToValueAtTime(0.0001, at + Math.max(attack + decay, dur) + release);
    return at + Math.max(attack + decay, dur) + release;
  }

  function osc({ type = 'sine', freq, at, end, glide = 0, glideTo = null, detune = 0, into }) {
    const source = context.createOscillator();
    source.type = type;
    source.detune.value = detune;
    source.frequency.setValueAtTime(freq, at);
    if (glideTo) source.frequency.exponentialRampToValueAtTime(glideTo, at + glide);
    source.connect(into);
    source.start(at);
    source.stop(end + 0.02);
    return source;
  }

  function hiss({ at, end, type = 'highpass', freq = 6000, q = 0.7, into, sweepTo = null }) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer();
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, at);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, end);
    filter.Q.value = q;
    source.connect(filter);
    filter.connect(into);
    source.start(at, random() * 1.2);
    source.stop(end + 0.02);
    return { source, filter };
  }

  const VOICES = {
    // a round, punchy kick: a sine falling fast from 140 Hz, a click at the front
    kick({ at, vel = 1, into }) {
      const { volume, nodes } = strip({ at, into });
      const end = env(volume.gain, at, { level: 0.55 * vel, attack: 0.002, decay: 0.32, release: 0.04 });
      const s = osc({ freq: 150, glideTo: 42, glide: 0.12, at, end, into: volume });
      const click = strip({ at, into });
      const clickEnd = env(click.volume.gain, at, { level: 0.08 * vel, attack: 0.001, decay: 0.015, release: 0.005 });
      const c = hiss({ at, end: clickEnd, type: 'bandpass', freq: 3000, q: 0.8, into: click.volume });
      free(s, nodes);
      free(c.source, [c.filter, ...click.nodes]);
    },
    // a snare: a tight tone and a burst of noise, a little room
    snare({ at, vel = 1, into }) {
      const body = strip({ at, into, send: 0.12 });
      const end = env(body.volume.gain, at, { level: 0.16 * vel, attack: 0.002, decay: 0.09, release: 0.03 });
      const s = osc({ type: 'triangle', freq: 220, glideTo: 170, glide: 0.08, at, end, into: body.volume });
      const snap = strip({ at, into, send: 0.15 });
      const snapEnd = env(snap.volume.gain, at, { level: 0.22 * vel, attack: 0.001, decay: 0.16, release: 0.04 });
      const n = hiss({ at, end: snapEnd, type: 'bandpass', freq: 2400, q: 0.6, into: snap.volume });
      free(s, body.nodes);
      free(n.source, [n.filter, ...snap.nodes]);
    },
    // hands clapping: three quick bursts and a tail
    clap({ at, vel = 1, into }) {
      const { volume, nodes } = strip({ at, into, send: 0.2, pan: 0.05 });
      volume.gain.setValueAtTime(0, at);
      for (const [k, d] of [[0, 1], [0.012, 0.8], [0.024, 1]]) {
        volume.gain.linearRampToValueAtTime(0.2 * vel * d, at + k + 0.001);
        volume.gain.exponentialRampToValueAtTime(0.02 * vel, at + k + 0.01);
      }
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      const n = hiss({ at, end: at + 0.2, type: 'bandpass', freq: 1500, q: 1.2, into: volume });
      free(n.source, [n.filter, ...nodes]);
    },
    // a closed hi-hat, or an open one (open: true)
    hat({ at, vel = 1, into, open = false }) {
      const { volume, nodes } = strip({ at, into, pan: 0.2, send: open ? 0.1 : 0 });
      const end = env(volume.gain, at, { level: (open ? 0.07 : 0.06) * vel, attack: 0.001, decay: open ? 0.28 : 0.035, release: 0.02 });
      const n = hiss({ at, end, freq: 7500, into: volume });
      free(n.source, [n.filter, ...nodes]);
    },
    ohat(o) { VOICES.hat({ ...o, open: true }); },
    // a shaker: soft swishes of high noise
    shaker({ at, vel = 1, into }) {
      const { volume, nodes } = strip({ at, into, pan: -0.25 });
      const end = env(volume.gain, at, { level: 0.035 * vel, attack: 0.015, decay: 0.05, release: 0.02 });
      const n = hiss({ at, end, type: 'bandpass', freq: 5500, q: 1.5, into: volume });
      free(n.source, [n.filter, ...nodes]);
    },
    // a bass: a saw and a square an octave down, through a low-pass that plucks open and closes
    bass({ at, freq, dur = 0.2, vel = 1, into }) {
      const { volume, nodes } = strip({ at, into });
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 4;
      filter.frequency.setValueAtTime(freq * 9, at);
      filter.frequency.exponentialRampToValueAtTime(freq * 2.5, at + 0.12);
      filter.connect(volume);
      const end = env(volume.gain, at, { level: 0.2 * vel, attack: 0.004, decay: 0.08, sustain: 0.7, release: 0.05, dur: Math.max(0.06, dur - 0.03) });
      const a = osc({ type: 'sawtooth', freq, at, end, into: filter });
      const b = osc({ type: 'square', freq: freq / 2, at, end, into: filter });
      free(a, [b, filter, ...nodes]);
    },
    // a warm pad: four detuned saws on each note of the chord, slow to swell, a lot of room
    pad({ at, notes = [], dur = 2, vel = 1, into }) {
      const { volume, nodes } = strip({ at, into, send: 0.45 });
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      filter.Q.value = 0.5;
      filter.connect(volume);
      const end = env(volume.gain, at, { level: 0.045 * vel, attack: Math.min(0.35, dur * 0.3), decay: 0.2, sustain: 0.85, release: 0.4, dur });
      const sources = [];
      for (const f of notes) for (const d of [-9, 9]) sources.push(osc({ type: 'sawtooth', freq: f, detune: d, at, end, into: filter }));
      if (!sources.length) return;
      free(sources[0], [...sources.slice(1), filter, ...nodes]);
    },
    // a bright pluck for the keys: a triangle and a square two octaves soft, fading fast
    pluck({ at, freq, dur = 0.2, vel = 1, into }) {
      const { volume, nodes } = strip({ at, into, pan: -0.15, send: 0.25 });
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 8, at);
      filter.frequency.exponentialRampToValueAtTime(freq * 2, at + 0.25);
      filter.connect(volume);
      const end = env(volume.gain, at, { level: 0.06 * vel, attack: 0.003, decay: 0.25, sustain: 0.2, release: 0.1, dur: Math.min(dur, 0.4) });
      const a = osc({ type: 'triangle', freq, at, end, into: filter });
      const b = osc({ type: 'square', freq, detune: 7, at, end, into: filter });
      free(a, [b, filter, ...nodes]);
    },
    // a glockenspiel bell: the sparkle on top
    bell({ at, freq, dur = 0.5, vel = 1, into }) {
      const { volume, nodes } = strip({ at, into, pan: 0.3, send: 0.35 });
      const end = env(volume.gain, at, { level: 0.05 * vel, attack: 0.002, decay: 0.5, release: 0.3, dur: Math.max(0.3, dur) });
      const a = osc({ freq, at, end, into: volume });
      const b = osc({ freq: freq * 2.76, at, end: at + 0.25, into: volume });
      free(a, [b, ...nodes]);
    },
    // a choir's "aah": saws through two vowel formants, for the star-power layer
    choir({ at, notes = [], dur = 2, vel = 1, into }) {
      const { volume, nodes } = strip({ at, into, send: 0.6 });
      const f1 = context.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 750;
      f1.Q.value = 3;
      const f2 = context.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 1150;
      f2.Q.value = 4;
      f1.connect(volume);
      f2.connect(volume);
      const end = env(volume.gain, at, { level: 0.09 * vel, attack: Math.min(0.4, dur * 0.3), decay: 0.2, sustain: 0.8, release: 0.5, dur });
      const sources = [];
      const vibrato = context.createOscillator();
      vibrato.frequency.value = 5;
      const depth = context.createGain();
      depth.gain.value = 6;
      vibrato.connect(depth);
      for (const f of notes) for (const d of [-6, 6]) {
        const s = osc({ type: 'sawtooth', freq: f, detune: d, at, end, into: f1 });
        s.connect(f2);
        depth.connect(s.detune);
        sources.push(s);
      }
      vibrato.start(at);
      vibrato.stop(end + 0.02);
      if (!sources.length) return;
      free(sources[0], [...sources.slice(1), vibrato, depth, f1, f2, ...nodes]);
    },
    // a whoosh rising into a big section
    riser({ at, dur = 2, vel = 1, into }) {
      const { volume, nodes } = strip({ at, into, send: 0.3 });
      volume.gain.setValueAtTime(0.0001, at);
      volume.gain.exponentialRampToValueAtTime(0.05 * vel, at + dur);
      volume.gain.linearRampToValueAtTime(0, at + dur + 0.05);
      const n = hiss({ at, end: at + dur + 0.05, type: 'bandpass', freq: 400, sweepTo: 6000, q: 1.2, into: volume });
      free(n.source, [n.filter, ...nodes]);
    },
    // a crash cymbal on the first beat of a big section
    crash({ at, vel = 1, into }) {
      const { volume, nodes } = strip({ at, into, pan: -0.2, send: 0.3 });
      const end = env(volume.gain, at, { level: 0.08 * vel, attack: 0.002, decay: 1.4, release: 0.3 });
      const n = hiss({ at, end, freq: 4500, q: 0.5, into: volume });
      free(n.source, [n.filter, ...nodes]);
    },
  };

  return {
    names: Object.keys(VOICES),
    play(name, options) {
      VOICES[name]?.(options);
    },
  };
}
