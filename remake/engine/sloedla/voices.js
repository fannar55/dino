// The instruments each song gives the dinosaurs in Slóeðla's song game. Every dinosaur keeps her place in the band (Slóeðla the
// tune, Kambeðla the riff, Þórseðla the beat), but what she plays it on suits the song, as each song in Amplitude has its own
// instruments: a song names them (`voices: { a, b, c }`), and one that names none gets the first ones, horn, plates and drum
// (sounds.js). All are made on the spot with Web Audio, so they play in any key.
//
//   Stjörnudans (disco)        synthbrass, discopluck, syndrum (the falling "pew" drum of disco)
//   Norðurljós (shimmering)    supersaw (a wide, airy lead), glass (an FM bell), boom (an 808: a deep boom with a click)
//   Þrumutaktur (rock funk)    brass (a horn section's stab with a fall), clav (a clavinet's quack), rocktom (a floor tom in a hall)
//   Ljósahús (house)           piano (a house piano), organ (a house organ stab), housekick (a 909-style kick)
//
// A note the child taps (`tapped`) is struck hard: louder (VOICE_LEVELS), a sharp start and overtones a tablet's speaker can play.
// A tap at no note (`soft`) is a quiet one.

/** The instruments a song that names none plays on. */
export const VOICES_DEFAULT = { a: 'horn', b: 'plates', c: 'drum' };

/**
 * How loud each instrument plays: a note of her phrase that plays by itself (`play`), a note the child taps (`tapped`, which must be
 * the loudest thing heard as she taps it, on a tablet's speaker too) and a tap at no note (`soft`).
 */
export const VOICE_LEVELS = {
  horn: { play: 0.13, tapped: 0.3, soft: 0.05 },
  plates: { play: 0.16, tapped: 0.42, soft: 0.05 },
  drum: { play: 0.34, tapped: 0.42, soft: 0.12 },
  synthbrass: { play: 0.24, tapped: 0.55, soft: 0.1 },
  discopluck: { play: 0.18, tapped: 0.48, soft: 0.072 },
  syndrum: { play: 0.22, tapped: 0.3, soft: 0.087 },
  supersaw: { play: 0.26, tapped: 0.52, soft: 0.11 },
  glass: { play: 0.12, tapped: 0.34, soft: 0.044 },
  boom: { play: 0.35, tapped: 0.46, soft: 0.12 },
  brass: { play: 0.28, tapped: 0.62, soft: 0.12 },
  clav: { play: 0.33, tapped: 0.75, soft: 0.14 },
  rocktom: { play: 0.38, tapped: 0.51, soft: 0.14 },
  piano: { play: 0.3, tapped: 0.57, soft: 0.12 },
  organ: { play: 0.093, tapped: 0.26, soft: 0.04 },
  housekick: { play: 0.43, tapped: 0.58, soft: 0.14 },
};

/** The level instrument `name` plays a note at, for a note that is `soft`, `tapped` or neither. */
export function levelOf(name, { soft = false, tapped = false } = {}) {
  const levels = VOICE_LEVELS[name] ?? VOICE_LEVELS.horn;
  return soft ? levels.soft : tapped ? levels.tapped : levels.play;
}

/**
 * The instruments beyond the first three, made with sounds.js's own parts: `outlet(pan, dest, send)`, `release(source, nodes)`,
 * `tone({...})` and `puff({...})`. Returns { name: play({ freq, at, dur, vel, soft, tapped, into }) }.
 */
export function createVoices({ context, outlet, release, tone, puff }) {
  /**
   * Oscillators (`oscs`: { type | wave, ratio, detune, gain }) on `freq`, through a filter that may sweep (from, to a peak by
   * `peakAt`, settling by `settleAt`), with a level that rises in `attack`, falls to `hold` of it by `decay` and dies at `length`.
   * A held instrument (`tail`, s) stays at `hold` until its last `tail` s; a struck one dies away all the way from there.
   * `scoop` slides each into its note from that ratio over `bend` s; `fall` drops it a little over its last `fall` s.
   */
  function stack({ freq, at, length, level, attack = 0.005, decay = 0.1, hold = 0.5, tail = 0, oscs, filter = null, pan = 0, dest, send = 0, scoop = 1, bend = 0.04, fall = 0 }) {
    const { volume, nodes } = outlet(pan, dest, send);
    const g = volume.gain;
    const held = Math.max(0.0001, level * hold);
    const stop = at + Math.max(length, attack + decay + tail + 0.01);
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(level, at + attack);
    g.exponentialRampToValueAtTime(held, at + attack + decay);
    if (tail > 0) g.setValueAtTime(held, stop - tail);
    g.exponentialRampToValueAtTime(0.0001, stop);
    let head = volume;
    if (filter) {
      const f = context.createBiquadFilter();
      f.type = filter.type ?? 'lowpass';
      f.Q.value = filter.q ?? 0.8;
      f.frequency.setValueAtTime(Math.min(filter.from, 20000), at);
      if (filter.peak) f.frequency.exponentialRampToValueAtTime(Math.min(filter.peak, 20000), at + (filter.peakAt ?? 0.03));
      if (filter.settle) f.frequency.exponentialRampToValueAtTime(Math.min(filter.settle, 20000), at + (filter.settleAt ?? 0.3));
      f.connect(volume);
      head = f;
      nodes.push(f);
    }
    const end = stop;
    const sources = [];
    for (const { type = 'sawtooth', wave = null, ratio = 1, detune = 0, gain = 1 } of oscs) {
      const source = context.createOscillator();
      if (wave) source.setPeriodicWave(wave);
      else source.type = type;
      source.detune.value = detune;
      const note = freq * ratio;
      source.frequency.setValueAtTime(note * scoop, at);
      if (scoop !== 1) source.frequency.exponentialRampToValueAtTime(note, at + bend);
      if (fall > 0 && end - fall > at + bend) {
        source.frequency.setValueAtTime(note, end - fall);
        source.frequency.exponentialRampToValueAtTime(note * 0.9, end);
      }
      const share = context.createGain();
      share.gain.value = gain;
      source.connect(share);
      share.connect(head);
      sources.push(source);
      nodes.push(share);
    }
    release(sources[0], [...sources.slice(1), ...nodes]);
    for (const source of sources) {
      source.start(at);
      source.stop(end + 0.02);
    }
  }

  // a clavinet's string: a narrow pulse (its Fourier series), made once
  let pulseWave = null;
  function pulse() {
    if (!pulseWave) {
      const n = 32;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.18);
      pulseWave = context.createPeriodicWave(real, imag);
    }
    return pulseWave;
  }

  return {
    // Stjörnudans: a disco synth brass, two saws a little apart and a square under them, its filter opening with a "bwah"
    synthbrass({ freq: f, at, dur = 0.4, vel = 1, soft, tapped, into }) {
      const level = levelOf('synthbrass', { soft, tapped }) * vel;
      const length = soft ? 0.3 : Math.max(0.28, dur) + 0.12;
      stack({
        freq: f, at, length, level, attack: tapped ? 0.005 : 0.02, decay: 0.2, hold: 0.6, tail: 0.1, scoop: 0.97, bend: 0.04, pan: -0.02, dest: into, send: 0.25,
        oscs: [{ detune: -9, gain: 0.55 }, { detune: 9, gain: 0.55 }, { type: 'square', ratio: 0.5, gain: 0.2 }],
        filter: { from: f * 2, peak: f * (tapped ? 12 : soft ? 5 : 8), peakAt: tapped ? 0.025 : 0.05, settle: f * 4, settleAt: 0.35, q: 2 },
      });
      if (tapped) {
        stack({ freq: f * 2, at, length: 0.12, level: level * 0.3, attack: 0.003, decay: 0.05, hold: 0.3, oscs: [{}], filter: { from: f * 16, settle: f * 6, settleAt: 0.1 }, dest: into });
        puff({ at, length: 0.04, level: level * 0.25, frequency: f * 8, end: f * 4, q: 1.2, dest: into });
      }
    },
    // Stjörnudans: a plucky disco synth, a square and a saw through a ringing filter that snaps shut, and its octave glinting
    discopluck({ freq: f, at, dur = 0.4, vel = 1, soft, tapped, into }) {
      const level = levelOf('discopluck', { soft, tapped }) * vel;
      const length = soft ? 0.3 : Math.min(0.9, Math.max(0.35, dur * 1.2));
      stack({
        freq: f, at, length, level, attack: 0.002, decay: 0.12, hold: 0.25, pan: -0.25, dest: into, send: 0.3,
        oscs: [{ type: 'square', gain: 0.6 }, { detune: 7, gain: 0.5 }],
        filter: { from: f * (tapped ? 18 : 12), settle: f * 2, settleAt: 0.2, q: 5 },
      });
      stack({ freq: f * 2, at, length: length * 0.6, level: level * 0.25, attack: 0.002, decay: 0.08, hold: 0.3, oscs: [{ type: 'triangle' }], pan: -0.25, dest: into });
      if (tapped) puff({ at, length: 0.02, level: level * 0.5, frequency: 4000, q: 1.2, pan: -0.25, attack: 0.001, dest: into });
    },
    // Stjörnudans: disco's syndrum, a tone that falls a long way ("pew"), with a hiss after it and a weight under it
    syndrum({ freq: f, at, vel = 1, soft, tapped, into }) {
      const level = levelOf('syndrum', { soft, tapped }) * vel;
      const length = soft ? 0.25 : 0.55;
      stack({ freq: f * 2, at, length, level, attack: 0.002, decay: 0.12, hold: 0.35, scoop: 2.2, bend: 0.3, pan: 0.25, dest: into, send: 0.25, oscs: [{ type: 'sine' }, { type: 'triangle', gain: 0.35 }] });
      tone({ frequency: f, at, length: 0.4, level: level * 0.6, attack: 0.003, decay: 0.1, hold: 0.4, scoop: 1.8, bend: 0.08, pan: 0.25, dest: into });
      puff({ at, length: 0.2, level: level * 0.15, frequency: 1500, end: 600, q: 0.8, pan: 0.25, dest: into });
      if (tapped) puff({ at, length: 0.03, level: level * 0.4, frequency: 3000, type: 'highpass', q: 0.7, pan: 0.25, attack: 0.001, dest: into });
    },

    // Norðurljós: a wide, airy lead, five saws a little apart and an octave over them, slow to open unless tapped
    supersaw({ freq: f, at, dur = 0.5, vel = 1, soft, tapped, into }) {
      const level = levelOf('supersaw', { soft, tapped }) * vel;
      const length = soft ? 0.35 : Math.max(0.35, dur) + 0.25;
      stack({
        freq: f, at, length, level, attack: tapped ? 0.006 : 0.035, decay: 0.3, hold: 0.7, tail: 0.22, dest: into, send: 0.45,
        oscs: [-20, -10, 0, 10, 20].map(detune => ({ detune, gain: 0.32 })).concat([{ ratio: 2, detune: 4, gain: 0.12 }]),
        filter: { from: f * 3, peak: f * (tapped ? 10 : 6), peakAt: tapped ? 0.03 : 0.08, settle: f * 5, settleAt: 0.4, q: 0.9 },
      });
      if (tapped) stack({ freq: f * 2, at, length: 0.1, level: level * 0.3, attack: 0.002, decay: 0.04, hold: 0.3, oscs: [{ type: 'square' }], filter: { from: f * 12, settle: f * 4, settleAt: 0.08 }, dest: into });
    },
    // Norðurljós: a glass bell, a sine rung by another three and a half times as fast (FM), the ring settling as it dies
    glass({ freq: f, at, dur = 0.4, vel = 1, soft, tapped, into }) {
      const level = levelOf('glass', { soft, tapped }) * vel;
      const length = soft ? 0.4 : Math.min(1.4, Math.max(0.7, dur * 2));
      const { volume, nodes } = outlet(-0.25, into, 0.35);
      const g = volume.gain;
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(level, at + 0.002);
      g.exponentialRampToValueAtTime(level * 0.3, at + 0.25);
      g.exponentialRampToValueAtTime(0.0001, at + length);
      const carrier = context.createOscillator();
      carrier.frequency.setValueAtTime(f, at);
      const modulator = context.createOscillator();
      modulator.frequency.setValueAtTime(f * 3.5, at);
      const depth = context.createGain();
      depth.gain.setValueAtTime(f * (tapped ? 5 : soft ? 1.5 : 3), at);
      depth.gain.exponentialRampToValueAtTime(f * 0.3, at + 0.5);
      modulator.connect(depth);
      depth.connect(carrier.frequency);
      carrier.connect(volume);
      release(carrier, [modulator, depth, ...nodes]);
      for (const source of [carrier, modulator]) {
        source.start(at);
        source.stop(at + length + 0.02);
      }
      tone({ frequency: f * 2, at, length: length * 0.4, level: level * 0.25, attack: 0.002, decay: 0.1, hold: 0.3, pan: -0.25, dest: into });
      if (tapped) puff({ at, length: 0.015, level: level * 0.4, frequency: 5000, q: 1, pan: -0.25, attack: 0.001, dest: into });
    },
    // Norðurljós: an 808, a deep boom that drops onto its note in a blink, a click on top and its octave for small speakers
    boom({ freq: f, at, vel = 1, soft, tapped, into }) {
      const level = levelOf('boom', { soft, tapped }) * vel;
      stack({ freq: f, at, length: soft ? 0.35 : 0.85, level, attack: 0.002, decay: 0.2, hold: 0.45, scoop: 3, bend: 0.05, pan: 0.2, dest: into, send: 0.1, oscs: [{ type: 'sine' }] });
      tone({ frequency: f * 2, type: 'triangle', at, length: 0.2, level: level * 0.35, attack: 0.002, decay: 0.05, hold: 0.3, scoop: 2, bend: 0.04, pan: 0.2, dest: into });
      puff({ at, length: 0.015, level: level * (tapped ? 0.6 : 0.3), frequency: 3500, q: 0.9, pan: 0.2, attack: 0.001, dest: into });
      if (tapped) tone({ frequency: f * 4, type: 'triangle', at, length: 0.08, level: level * 0.35, attack: 0.001, decay: 0.03, hold: 0.3, scoop: 1.5, bend: 0.03, pan: 0.2, dest: into });
    },

    // Þrumutaktur: a funk horn section's stab, three saws (one an octave up) blaring open, and a fall off the end
    brass({ freq: f, at, dur = 0.3, vel = 1, soft, tapped, into }) {
      const level = levelOf('brass', { soft, tapped }) * vel;
      const length = soft ? 0.25 : Math.max(0.2, Math.min(dur, 0.5)) + 0.1;
      stack({
        freq: f, at, length, level, attack: tapped ? 0.004 : 0.012, decay: 0.08, hold: 0.7, tail: 0.09, scoop: 0.95, bend: 0.03, fall: soft ? 0 : 0.09, pan: -0.05, dest: into, send: 0.2,
        oscs: [{ gain: 0.5 }, { detune: 12, gain: 0.45 }, { ratio: 2, detune: -6, gain: 0.25 }],
        filter: { from: f * 1.5, peak: f * (tapped ? 12 : 9), peakAt: 0.03, settle: f * 3.5, settleAt: 0.25, q: 1.4 },
      });
      if (tapped) puff({ at, length: 0.035, level: level * 0.3, frequency: f * 6, end: f * 3, q: 1.5, dest: into });
    },
    // Þrumutaktur: a clavinet, a thin pulse of a string through a ringing low-pass that quacks shut
    clav({ freq: f, at, dur = 0.3, vel = 1, soft, tapped, into }) {
      const level = levelOf('clav', { soft, tapped }) * vel;
      const length = soft ? 0.18 : Math.min(0.4, Math.max(0.16, dur));
      stack({
        freq: f, at, length, level, attack: 0.001, decay: 0.06, hold: 0.35, pan: -0.25, dest: into, send: 0.1,
        oscs: [{ wave: pulse() }],
        filter: { from: f * (tapped ? 12 : 8), settle: f * 2.5, settleAt: 0.15, q: 4 },
      });
      if (tapped) puff({ at, length: 0.015, level: level * 0.4, frequency: 3000, q: 1.2, pan: -0.25, attack: 0.001, dest: into });
    },
    // Þrumutaktur: a floor tom in a hall, a fifth over its note, the skin's slap, the low weight and the stick
    rocktom({ freq: f, at, vel = 1, soft, tapped, into }) {
      const level = levelOf('rocktom', { soft, tapped }) * vel;
      stack({ freq: f * 1.5, at, length: soft ? 0.3 : 0.65, level, attack: 0.002, decay: 0.15, hold: 0.35, scoop: 1.5, bend: 0.12, pan: 0.25, dest: into, send: 0.35, oscs: [{ type: 'sine' }, { type: 'triangle', ratio: 1.5, gain: 0.25 }] });
      puff({ at, length: 0.18, level: level * 0.4, frequency: 2000, end: 400, type: 'lowpass', q: 0.7, pan: 0.25, attack: 0.002, dest: into });
      if (!soft) tone({ frequency: f, at, length: 0.5, level: level * 0.5, attack: 0.003, decay: 0.12, hold: 0.4, scoop: 1.6, bend: 0.1, pan: 0.25, dest: into });
      if (tapped) puff({ at, length: 0.012, level: level * 0.6, frequency: 4500, type: 'highpass', q: 0.7, pan: 0.25, attack: 0.001, dest: into });
    },

    // Ljósahús: a house piano, its partials a hair stretched and dying faster the higher they are, the note and its octave, a hammer
    piano({ freq: f, at, dur = 0.4, vel = 1, soft, tapped, into }) {
      const level = levelOf('piano', { soft, tapped }) * vel;
      const length = soft ? 0.4 : Math.min(1.2, Math.max(0.5, dur * 1.5));
      const bright = tapped ? 1.5 : 1;
      for (const [root, share] of [[f, 1], [f * 2, 0.5]]) {
        for (const [n, gain, life] of [[1, 1, 1], [2, 0.5, 0.6], [3, 0.25 * bright, 0.4], [4, 0.15 * bright, 0.25], [5, 0.08 * bright, 0.15]]) {
          tone({ frequency: root * n * (1 + 0.0008 * n * n), at, length: Math.max(0.08, length * life), level: level * share * gain * 0.6, attack: 0.002, decay: 0.08 * life + 0.02, hold: 0.35, pan: -0.02, dest: into, send: n === 1 ? 0.2 : 0 });
        }
      }
      puff({ at, length: 0.015, level: level * (tapped ? 0.5 : 0.3), frequency: 2500, q: 0.8, pan: -0.02, attack: 0.001, dest: into });
    },
    // Ljósahús: a house organ stab, drawbar sines (the sub, the note, its octave, twelfth, fifteenth and more), a key click
    organ({ freq: f, at, dur = 0.3, vel = 1, soft, tapped, into }) {
      const level = levelOf('organ', { soft, tapped }) * vel;
      const length = soft ? 0.22 : Math.min(0.45, Math.max(0.2, dur)) + 0.06;
      stack({
        freq: f, at, length, level, attack: 0.003, decay: 0.12, hold: 0.45, tail: 0.06, pan: -0.25, dest: into, send: 0.2,
        oscs: [[0.5, 0.45], [1, 1], [2, 0.7], [3, 0.4], [4, 0.3], [6, 0.12]].map(([ratio, gain]) => ({ type: 'sine', ratio, gain })),
      });
      puff({ at, length: 0.008, level: level * 0.4, frequency: 2000, q: 0.7, pan: -0.25, attack: 0.0005, dest: into });
      if (tapped) tone({ frequency: f * 3, at, length: 0.12, level: level * 0.4, attack: 0.002, decay: 0.04, hold: 0.3, pan: -0.25, dest: into });
    },
    // Ljósahús: a 909-style kick, a sine dropping onto its note, a click on top and a body an octave up for small speakers
    housekick({ freq: f, at, vel = 1, soft, tapped, into }) {
      const level = levelOf('housekick', { soft, tapped }) * vel;
      stack({ freq: f, at, length: soft ? 0.25 : 0.45, level, attack: 0.001, decay: 0.12, hold: 0.35, scoop: 3.2, bend: 0.045, dest: into, oscs: [{ type: 'sine' }] });
      tone({ frequency: f * 2, type: 'triangle', at, length: 0.12, level: level * 0.35, attack: 0.002, decay: 0.04, hold: 0.3, scoop: 2.5, bend: 0.03, dest: into });
      puff({ at, length: 0.012, level: level * (tapped ? 0.7 : 0.35), frequency: 3000, q: 0.8, attack: 0.0005, dest: into });
      if (tapped) puff({ at, length: 0.08, level: level * 0.25, frequency: 1600, q: 1.4, attack: 0.002, dest: into });
    },
  };
}
