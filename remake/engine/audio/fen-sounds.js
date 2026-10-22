// Chapter 2's sounds (remake/chapters/kafli2*.js): the footprints in the mud, the berries, Þórseðla's head, the lookout, the slide
// and the Fen's own animals. The game's sound effects (engine/audio/sfx.js) carry them as their own, and the Fen's bed of water,
// frogs and drips is laid there beside the forest's wind.
//
// Every one is made on the spot with sfx.js's tools (tone, noise, bell, and hum for wings), as the Litla Yatzy sounds are
// (engine/yatzy-junior/sounds.js), and every pitched note is a note of the theme's key (theme.json `key`, a major pentatonic:
// do re mi sol la) or an octave of one; a glide runs from one note of the key to another. They are for a six-year-old: soft and
// round (sines and triangles, never a square or a saw), nothing like a buzzer, and a tap on the wrong print only splashes. The
// count is the chapter's learning beat: countTone climbs the key one step for each number, one to ten, so ten prints are a scale
// climbed, and each berry pops a step higher too.
//
// A sound that needs a detail is given it as s.sfx(name, detail): countTone and berryPop { index } (the count, from 1), liftTone
// { seconds } (how long the lift is).

/** The names, in the order the chapter meets them, and the Fen's animals'. */
export const FEN_SFX = [
  'splash', 'ripple', 'countTone', 'berryPop', 'sniff', 'breathHuge', 'chew', 'liftTone', 'windHigh', 'slide', 'landSaddle', 'mapMark',
  'dragonfly', 'turtle', 'fish', 'earlyBird',
];

/** The least time, in audio seconds, between two of the same: a child tapping fast piles nothing up. */
export const FEN_GAPS = {
  splash: 0.12, ripple: 0.2, countTone: 0.05, berryPop: 0.1, sniff: 1, breathHuge: 2, chew: 0.8, liftTone: 4, windHigh: 3, slide: 2,
  landSaddle: 1, mapMark: 0.3, dragonfly: 0.4, turtle: 0.4, fish: 0.5, earlyBird: 0.6,
};

const LIFT_SECONDS = 8; // Þórseðla's liftUp clip, when the lift does not say

/**
 * One sound per name in FEN_SFX, made with sfx.js's tools: `tone`, `noise`, `bell`, `hum`, the theme's `key` and `between(low, high)`
 * (the effects' random). Each takes its detail ({} when there is none).
 */
export function fenSounds({ tone, noise, bell, hum, key, between }) {
  /** The key's notes climbing from its root, do re mi sol la and on an octave up: n 0 is do. */
  const scale = n => key[((n % 5) + 5) % 5] * 2 ** Math.floor(n / 5);
  /** A count from 1 to `most` (anything else is 1). */
  const count = (index, most) => Math.max(1, Math.min(most, Math.round(Number(index)) || 1));
  const pick = list => list[Math.floor(between(0, list.length - 1e-9))];

  /** A drop of water: a tiny plink gliding up an octave, from one note of the key to the same an octave higher. */
  const droplet = (hz, delay, level, pan) => {
    tone({ frequency: hz, end: hz * 2, duration: 0.05, level, delay, pan, attack: 0.004, body: 0 });
    tone({ frequency: hz * 2, duration: 0.16, level: level * 0.35, delay: delay + 0.04, pan, attack: 0.004, body: 0 });
  };

  return {
    // A print splashed (any tap on one, the wrong one too): a soft, low "plosh" of mud water, a round note falling from sol to do
    // under it, and three drops falling back. Gentle: a splash, never a buzzer.
    splash() {
      const pan = between(-0.15, 0.15);
      noise({ type: 'bandpass', frequency: 900, end: 320, q: 0.9, duration: 0.3, level: 0.12, attack: 0.006, pan });
      tone({ frequency: key[3] / 2, end: key[0] / 2, duration: 0.14, level: 0.07, pan, attack: 0.004 });
      [4, 2, 3].forEach((n, i) => droplet(key[n] * 2, 0.07 + i * 0.06 + between(0, 0.02), 0.02, pan + (i - 1) * 0.15));
    },
    // The rings spreading on the print's water as its number rises: three quiet bells falling la, sol, mi an octave up, over a
    // breath of water.
    ripple() {
      noise({ kind: 'white', type: 'bandpass', frequency: 2400, end: 1100, q: 2, duration: 0.7, level: 0.014, attack: 0.15 });
      [4, 3, 2].forEach((n, i) => bell(key[n] * 2, { delay: 0.12 + i * 0.11, level: 0.022 - i * 0.004, duration: 0.6, pan: (i - 1) * 0.2 }));
    },
    // The count, one to ten (detail.index): one step up the key for each number from its root, do re mi sol la and on up an octave,
    // so the ten prints are a scale climbed (two octaves at most); a toy-glockenspiel bell with a round note an octave under it and a
    // grace note a step below, so each sounds like a step up. Ten ends on la and rings do and mi under it: done.
    countTone({ index } = {}) {
      const n = count(index, 10) - 1;
      const hz = scale(n);
      if (n > 0) tone({ frequency: scale(n - 1), duration: 0.07, level: 0.02, attack: 0.003, body: 0 });
      bell(hz, { delay: 0.05, level: 0.075, duration: 0.95 });
      tone({ frequency: hz / 2, duration: 0.6, level: 0.03, delay: 0.05, attack: 0.01 });
      if (n === 9) [0, 2].forEach((m, i) => bell(scale(5 + m), { delay: 0.3 + i * 0.08, level: 0.035, duration: 1.2 }));
    },
    // A red bunch picked (detail.index, the berry's count, 1 to 5): a pop like a cork, a little rising "plip", and a bell a step
    // higher for each berry, as the count climbs.
    berryPop({ index } = {}) {
      const n = count(index, 5) - 1;
      noise({ kind: 'white', type: 'bandpass', frequency: 1800, end: 3200, q: 1.4, duration: 0.05, level: 0.11, attack: 0.002 });
      tone({ frequency: key[2], end: key[2] * 2, duration: 0.06, level: 0.07, attack: 0.003, body: 0 });
      bell(scale(5 + n), { delay: 0.1, level: 0.05, duration: 0.6 });
    },
    // Þórseðla smells the berries: three sniffs of a big nose, the last the longest, deep and airy.
    sniff() {
      [[0, 0.13], [0.22, 0.13], [0.44, 0.3]].forEach(([at, length], i) => {
        noise({ kind: 'warm', type: 'bandpass', frequency: 560 + i * 60, end: 1150, q: 1.1, duration: length, level: 0.12, attack: 0.03, delay: at });
      });
    },
    // Her face at his eyes: a long, warm breath out of a 22 m animal, low and slow, with a hum of her chest under it.
    breathHuge() {
      noise({ kind: 'brown', type: 'lowpass', frequency: 520, end: 210, duration: 2.3, level: 0.2, attack: 0.55 });
      noise({ kind: 'warm', type: 'bandpass', frequency: 900, end: 380, q: 0.7, duration: 1.9, level: 0.035, attack: 0.5, delay: 0.1 });
      tone({ frequency: key[0] / 4, duration: 1.9, level: 0.025, type: 'triangle', attack: 0.6, body: 0.6, sustain: 0.8 });
    },
    // She chews leaves or berries: four soft munches, a muffled crunch and a low thump of her jaw in each.
    chew() {
      for (let i = 0; i < 4; i++) {
        const at = i * 0.3 + between(0, 0.04);
        noise({ kind: 'warm', type: 'lowpass', frequency: 1100, end: 380, duration: 0.1, level: 0.09, attack: 0.006, delay: at });
        noise({ kind: 'white', type: 'bandpass', frequency: 2600, q: 2, duration: 0.03, level: 0.022, attack: 0.002, delay: at + 0.01 });
        tone({ frequency: key[0] / 4, end: key[0] / 8, duration: 0.08, level: 0.05, type: 'triangle', attack: 0.004, body: 0, delay: at });
      }
    },
    // The lift (detail.seconds, the length of her liftUp from where it starts, 8 s by default): a soft note rising two octaves from
    // do the whole way up, slow to swell, and a bell for each note of the key climbed on the way, the last one at the top.
    liftTone({ seconds = LIFT_SECONDS } = {}) {
      const length = Math.max(2, Math.min(LIFT_SECONDS + 1, Number(seconds) || LIFT_SECONDS));
      tone({ frequency: key[0] / 2, end: key[0] * 2, duration: length, level: 0.028, attack: length * 0.25, body: 0.85, sustain: 0.9 });
      tone({ frequency: key[0], end: key[0] * 4, duration: length, level: 0.008, attack: length * 0.4, body: 0.85, sustain: 0.9 });
      for (let i = 0; i <= 5; i++) bell(scale(i), { delay: (length * (i + 0.5)) / 6.5, level: 0.03 + i * 0.004, duration: i === 5 ? 1.6 : 1, pan: (i - 2.5) * 0.1 });
    },
    // Nine metres up: a long, soft gust that swells and falls away, with a thin whistle of air in it.
    windHigh() {
      noise({ kind: 'brown', type: 'lowpass', frequency: 420, end: 1300, duration: 2.6, level: 0.26, attack: 1.2 });
      noise({ kind: 'brown', type: 'lowpass', frequency: 1300, end: 380, duration: 2.6, level: 0.22, attack: 0.3, delay: 2.2 });
      noise({ kind: 'white', type: 'bandpass', frequency: 1500, end: 1800, q: 9, duration: 3.6, level: 0.02, attack: 1.4, delay: 0.6, pan: -0.3 });
    },
    // Down her neck: "Vúúú!" a slide whistle falling from la an octave up to do, a rush of air with it, and glints at the start.
    slide() {
      tone({ frequency: key[4] * 2, end: key[0], duration: 1.9, level: 0.035, attack: 0.08, body: 0.7, sustain: 0.8 });
      noise({ kind: 'warm', type: 'bandpass', frequency: 1700, end: 480, q: 1.4, duration: 1.95, level: 0.08, attack: 0.25 });
      [4, 3].forEach((n, i) => bell(key[n] * 4, { delay: i * 0.06, level: 0.02, duration: 0.35 }));
    },
    // Into the saddle: a soft bump on leather and a little happy bounce, do then mi.
    landSaddle() {
      tone({ frequency: key[0] / 4, end: key[0] / 8, duration: 0.13, level: 0.12, type: 'triangle', attack: 0.003, body: 0 });
      noise({ kind: 'warm', type: 'lowpass', frequency: 750, end: 260, duration: 0.12, level: 0.08, attack: 0.003 });
      bell(key[0] * 2, { delay: 0.09, level: 0.045, duration: 0.4 });
      bell(key[2] * 2, { delay: 0.19, level: 0.04, duration: 0.55 });
    },
    // A place goes onto the book's map (its marker flies there in 1.2 s, engine/scene/journal.js): a papery swish as it flies, and
    // as it lands a soft wooden tick and two bells, mi and la.
    mapMark() {
      noise({ kind: 'white', type: 'bandpass', frequency: 1100, end: 3200, q: 1.2, duration: 1.1, level: 0.024, attack: 0.45 });
      tone({ frequency: key[3], duration: 0.035, level: 0.05, type: 'triangle', attack: 0.001, body: 0, delay: 1.15 });
      bell(key[2] * 2, { delay: 1.16, level: 0.05, duration: 0.6 });
      bell(key[4] * 2, { delay: 1.28, level: 0.045, duration: 0.8 });
    },
    // The dragonfly darts off: a soft whirr of its wings going by.
    dragonfly() {
      hum({ frequency: key[0] / 2, end: key[3] / 2, duration: 0.9, level: 0.05, from: -0.2, to: 0.5 });
      noise({ kind: 'white', type: 'bandpass', frequency: 3000, end: 2200, q: 1.5, duration: 0.6, level: 0.02, attack: 0.08 });
    },
    // The turtle draws in its head: a hollow little "bloop" falling, and a soft knock of its shell.
    turtle() {
      tone({ frequency: key[2] / 2, end: key[0] / 4, duration: 0.2, level: 0.09, attack: 0.01 });
      tone({ frequency: key[0] / 4, duration: 0.06, level: 0.06, type: 'triangle', attack: 0.002, body: 0, delay: 0.2 });
      noise({ kind: 'warm', type: 'lowpass', frequency: 600, end: 250, duration: 0.08, level: 0.05, attack: 0.003, delay: 0.2 });
    },
    // The fish jumps: a plip as it leaves the water (a quarter of a second in) and a splash as it falls back (0.95 s), as it does.
    fish() {
      droplet(key[3] * 2, 0.25, 0.04, 0);
      noise({ type: 'bandpass', frequency: 1200, end: 450, q: 1, duration: 0.22, level: 0.09, attack: 0.005, delay: 0.95 });
      tone({ frequency: key[2] / 2, end: key[0] / 2, duration: 0.1, level: 0.05, attack: 0.004, delay: 0.95 });
      [2, 4].forEach((n, i) => droplet(key[n] * 2, 1.02 + i * 0.07, 0.018, (i - 0.5) * 0.3));
    },
    // The early bird flies up: two notes of a call, la falling to mi, a short sol after, and a flutter of wings.
    earlyBird() {
      const pan = between(-0.3, 0.3);
      tone({ frequency: key[4] * 2, end: key[2] * 2, duration: 0.22, level: 0.05, pan, attack: 0.02 });
      tone({ frequency: key[3] * 2, duration: 0.12, level: 0.04, pan, attack: 0.01, delay: 0.3 });
      for (let i = 0; i < 4; i++) noise({ kind: 'warm', type: 'bandpass', frequency: 1400, q: 1, duration: 0.07, level: 0.035, attack: 0.01, delay: 0.05 + i * 0.09, pan });
    },
  };
}

/**
 * One of the small sounds of the Fen's bed, chosen at random (sfx.js lays the bed and calls this every 1.2 to 3.4 s of game time):
 * a frog (and sometimes another answering), a drop, bubbles rising from the mud, a dragonfly's hum going by, the reed rustling,
 * or the early bird calling, all quiet, on the ambience bus, in the key.
 */
export function fenCall({ tone, noise, hum, key, between }, bus) {
  const pan = between(-0.7, 0.7);
  const roll = between(0, 1);
  const low = n => key[((n % 5) + 5) % 5] / 4; // a frog's notes, two octaves down
  if (roll < 0.34) {
    // a frog: two throaty croaks, the second gliding up a step; sometimes a second frog answers a step higher, further off
    const n = Math.floor(between(0, 3.999));
    for (const [at, from, to] of [[0, n, n], [0.15, n, n + 1]]) {
      tone({ frequency: low(from), end: low(to) * (to > 4 ? 2 : 1), duration: 0.11, level: 0.022, delay: at, pan, type: 'triangle', attack: 0.015, bus });
    }
    if (between(0, 1) < 0.4) {
      const m = n + 1;
      tone({ frequency: low(m), end: low(m + 1) * (m + 1 > 4 ? 2 : 1), duration: 0.12, level: 0.014, delay: 0.7, pan: -pan, type: 'triangle', attack: 0.015, bus });
    }
  } else if (roll < 0.58) {
    // a drop from the hanging moss into a pool
    const hz = key[Math.floor(between(0, 4.999))] * 2;
    tone({ frequency: hz, end: hz * 2, duration: 0.05, level: 0.02, pan, attack: 0.004, body: 0, bus });
    tone({ frequency: hz * 2, duration: 0.2, level: 0.007, delay: 0.04, pan, attack: 0.004, body: 0, bus });
  } else if (roll < 0.74) {
    // bubbles rising out of the mud and popping: two to four blips, each a step up
    const many = 2 + Math.floor(between(0, 2.999));
    const n = Math.floor(between(0, 2.999));
    for (let i = 0; i < many; i++) {
      const hz = key[(n + i) % 5] * (n + i > 4 ? 1 : 0.5);
      tone({ frequency: hz, end: hz * 2, duration: 0.05, level: 0.016, delay: i * 0.08, pan, attack: 0.004, body: 0, bus });
    }
  } else if (roll < 0.87) {
    // a dragonfly goes by: its wings' hum crossing from one side to the other
    hum({ frequency: key[0] / 4, end: key[3] / 4, duration: 1.4, level: 0.018, from: pan, to: -pan, bus });
  } else if (roll < 0.95) {
    // the reed rustles
    noise({ kind: 'brown', duration: 1.3, level: 0.03, frequency: 1500, end: 520, attack: 0.25, pan, bus });
    for (let i = 0; i < 2; i++) noise({ kind: 'white', type: 'bandpass', frequency: 3600, q: 5, duration: 0.08, level: 0.012, delay: 0.7 + i * 0.2, pan, bus });
  } else {
    // the early bird calls from far over the Fen: la falling to mi
    tone({ frequency: key[4] * 2, end: key[2] * 2, duration: 0.24, level: 0.012, pan, attack: 0.03, bus });
    tone({ frequency: key[3] * 2, duration: 0.12, level: 0.009, delay: 0.34, pan, attack: 0.02, bus });
  }
}
