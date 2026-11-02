// The crowd clapping along in Slóeðla's song game (during Stjörnukraftur, on every beat), made of real hand claps from Freesound
// (assets/audio/sloedla/klapp/, klapp.json and KREDIT.md say whose): groups of 4, 8 and 16 people clapping once (gregswinford,
// CC BY 4.0) and a 50-member gospel choir (bastianpusch, CC0), four or more takes of each.
//
// How a crowd is made to sound like people (the research: side notes sloedla-lag-klapp-taekni.md): a clap is a few milliseconds,
// so the crowd is built from groups layered with a little spread in time (a bell curve, about 6 ms, as people never clap at once),
// each group placed left or right and a hair apart in pitch, never the same take twice in a row; the crowd grows by adding people,
// not by turning it up: a few at first, then more as it goes on, and at the end the choir at the back of the hall (later, and
// duller, as far-off people are).

/** The takes of each group. */
export const CLAP_SETS = Object.freeze({ hopur4: [1, 2, 3, 4], hopur8: [1, 2, 3, 4], hopur16: [1, 2, 3, 4], kor: [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] });
const PEOPLE = { hopur4: 4, hopur8: 8, hopur16: 16, kor: 50 };
const SPREAD = 0.006; // s: the bell curve of a group's timing round the beat
const FAR_LAG = 0.015; // s: the people at the back are heard a little later
const FAR_CUTOFF = 4500; // Hz: and duller

/**
 * The groups clapping `beats` beats after the crowd began to clap along: four people for two bars, then eight (and the four),
 * then sixteen (and eight), then the whole hall: two sixteens, eight, and the choir at the back. Each: { set, gain, far }.
 */
export function clapLayersOf(beats) {
  // the gains are measured so the crowd grows about 8 dB from four people to the whole hall (more would leave the four unheard)
  if (beats < 8) return [{ set: 'hopur4', gain: 1.3 }];
  if (beats < 16) return [{ set: 'hopur8', gain: 1.35 }, { set: 'hopur4', gain: 0.75 }];
  if (beats < 24) return [{ set: 'hopur16', gain: 1.06 }, { set: 'hopur8', gain: 0.74 }];
  return [{ set: 'hopur16', gain: 1 }, { set: 'hopur16', gain: 0.75 }, { set: 'hopur8', gain: 0.55 }, { set: 'kor', gain: 0.6, far: true }];
}

/** How many people clap `beats` beats in. */
export const peopleOf = beats => clapLayersOf(beats).reduce((n, layer) => n + PEOPLE[layer.set], 0);

/**
 * The clapping crowd on `context`, into `output` (the crowd's bus: its level and its share of the room). `beat(when, beats)` claps
 * once at context time `when`, the crowd as it is `beats` beats in. load() fetches and decodes the claps one at a time.
 */
export function createClaps({ context, output, src, random = Math.random, level = 1 }) {
  const bus = context.createGain();
  bus.gain.value = level;
  bus.connect(output);
  const far = context.createBiquadFilter();
  far.type = 'lowpass';
  far.frequency.value = FAR_CUTOFF;
  far.connect(bus);
  const buffers = {}; // `${set}-${take}` -> AudioBuffer
  const last = {}; // set -> the take played last
  let queue = Promise.resolve();
  function load() {
    for (const [set, takes] of Object.entries(CLAP_SETS)) {
      for (const take of takes) {
        queue = queue.then(async () => {
          try {
            const bytes = await fetch(src(`${set}-${take}`)).then(r => r.arrayBuffer());
            buffers[`${set}-${take}`] = await context.decodeAudioData(bytes);
          } catch { /* that take stays quiet */ }
        });
      }
    }
    return queue;
  }
  // a bell curve from three dice
  const bell = () => (random() + random() + random() - 1.5) / 0.5;
  function beat(when, beats) {
    const used = {};
    let played = 0;
    for (const layer of clapLayersOf(beats)) {
      const ready = CLAP_SETS[layer.set].filter(take => buffers[`${layer.set}-${take}`] && take !== last[layer.set] && !(used[layer.set] ?? []).includes(take));
      if (!ready.length) continue;
      const take = ready[Math.floor(random() * ready.length)];
      last[layer.set] = take;
      (used[layer.set] ??= []).push(take);
      const source = context.createBufferSource();
      source.buffer = buffers[`${layer.set}-${take}`];
      source.playbackRate.value = 0.98 + random() * 0.04;
      const gain = context.createGain();
      gain.gain.value = layer.gain;
      source.connect(gain);
      let tail = gain;
      if (context.createStereoPanner) {
        const pan = context.createStereoPanner();
        pan.pan.value = (random() - 0.5) * (layer.far ? 0.9 : 0.7);
        gain.connect(pan);
        tail = pan;
      }
      tail.connect(layer.far ? far : bus);
      const offset = Math.max(-0.006, Math.min(0.014, bell() * SPREAD)) + (layer.far ? FAR_LAG : 0);
      source.start(Math.max(context.currentTime, when + offset));
      source.onended = () => { source.disconnect(); gain.disconnect(); if (tail !== gain) tail.disconnect(); };
      played++;
    }
    return played;
  }
  return { load, beat, bus };
}
