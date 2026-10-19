// The sound effects of "Risaeðlu-Yatzy!", built with the game's WebAudio tools (engine/audio/sfx.js: tone, noise and bell) in
// the theme's major pentatonic key (theme.json `key`), just like "Eitt!" (engine/eitt/eitt-sounds.js) and "Háls og hali"
// (engine/hals/hals-sounds.js).
//
// Highlights:
// - hold1..hold5 climb the pentatonic scale (do-re-mi-sol-la) as dice are tucked into the moss nest.
// - crestCall is Slóeðla's signature resonant Parasaurolophus horn call through her crest, followed by golden magic bells.
// - yatzy is a full dino-trumpet fanfare with firework crackles and cascading chimes.

export const YATZY_SFX = [
  'roll',
  'land',
  'hold1',
  'hold2',
  'hold3',
  'hold4',
  'hold5',
  'unhold',
  'pair',
  'combo',
  'crestCall',
  'eggSpark',
  'eggReady',
  'score',
  'yatzy',
  'fanfare',
  'tap',
  'wiggle',
];

export const YATZY_GAPS = {
  roll: 0.25,
  land: 0.12,
  hold1: 0.03,
  hold2: 0.03,
  hold3: 0.03,
  hold4: 0.03,
  hold5: 0.03,
  unhold: 0.03,
  pair: 0.15,
  combo: 0.2,
  crestCall: 0.5,
  eggSpark: 0.08,
  eggReady: 0.2,
  score: 0.12,
  yatzy: 0.5,
  fanfare: 0.5,
  tap: 0.04,
  wiggle: 0.25,
};

export function yatzySounds({ tone, noise, bell, key }) {
  const scale = [...key, key[0] * 2, key[1] * 2, key[2] * 2];

  /** Slóeðla's warm, resonant crest horn note. */
  const crestHorn = (hz, delay, duration, level = 1) => {
    tone({ frequency: hz / 2, end: (hz / 2) * 1.015, duration, level: 0.075 * level, type: 'sawtooth', attack: 0.06, delay, body: 0.75, sustain: 0.85 });
    tone({ frequency: hz, end: hz * 1.01, duration, level: 0.05 * level, type: 'triangle', attack: 0.05, delay, body: 0.75, sustain: 0.85 });
    tone({ frequency: (hz * 3) / 4, duration: duration * 0.9, level: 0.035 * level, type: 'sine', attack: 0.08, delay: delay + 0.02, body: 0.7, sustain: 0.8 });
  };

  /** Rising nest hold bell (1..5). */
  const holdStep = n => () => {
    const hz = scale[Math.min(scale.length - 1, n - 1)] * 2;
    tone({ frequency: hz / 2, end: hz, duration: 0.09, level: 0.07, type: 'triangle', attack: 0.003, body: 0.2 });
    bell(hz, { level: 0.055, duration: 0.42, delay: 0.01 });
    if (n === 5) {
      bell(hz * 1.5, { level: 0.04, duration: 0.55, delay: 0.06 });
    }
  };

  return {
    // Five wooden dinosaur dice rattling and tumbling across the slab.
    roll() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 520, end: 980, q: 0.8, duration: 0.52, level: 0.055, attack: 0.05 });
      let at = 0;
      for (let i = 0; i < 11; i++) {
        noise({
          kind: 'white',
          type: 'bandpass',
          frequency: 1650 + (i % 4) * 380,
          q: 2.8,
          duration: 0.026,
          level: 0.065 + (i % 2) * 0.025,
          attack: 0.001,
          delay: at,
        });
        tone({
          frequency: key[(i * 2) % 5],
          duration: 0.032,
          level: 0.028,
          type: 'triangle',
          attack: 0.001,
          body: 0,
          delay: at,
        });
        at += 0.048 - i * 0.0022;
      }
    },

    // Dice settle on the table: soft wooden knocks and a bright chime.
    land() {
      tone({ frequency: key[0] / 2, end: key[0] / 3, duration: 0.1, level: 0.11, type: 'triangle', attack: 0.002, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 1450, q: 2, duration: 0.045, level: 0.075, attack: 0.001 });
      bell(key[2] * 2, { delay: 0.03, level: 0.04, duration: 0.45 });
    },

    hold1: holdStep(1),
    hold2: holdStep(2),
    hold3: holdStep(3),
    hold4: holdStep(4),
    hold5: holdStep(5),

    // Taking a die back out of the moss nest.
    unhold() {
      tone({ frequency: key[3] * 2, end: key[1], duration: 0.085, level: 0.065, type: 'sine', attack: 0.003, body: 0 });
      noise({ kind: 'warm', duration: 0.05, level: 0.04, frequency: 900, end: 400, attack: 0.002 });
    },

    // A pair or two pairs landed: two cheerful marimba-like notes.
    pair() {
      bell(key[0] * 2, { level: 0.045, duration: 0.35 });
      bell(key[2] * 2, { delay: 0.09, level: 0.05, duration: 0.45 });
    },

    // 3-of-a-kind, 4-of-a-kind, Fullt hreiður, or Fótsporaröð: rising arpeggio + sparkle!
    combo() {
      [0, 2, 4, 5].forEach((n, i) => {
        bell(scale[n] * 2, { delay: i * 0.07, level: 0.05, duration: 0.55 });
      });
      crestHorn(key[2], 0.08, 0.38, 0.7);
      noise({ kind: 'white', type: 'bandpass', frequency: 5200, end: 8800, q: 1.5, duration: 0.55, level: 0.02, attack: 0.15, delay: 0.1 });
    },

    // Slóeðla's Golden Egg Horn Call: deep resonant crest call + magical swirling bells!
    crestCall() {
      crestHorn(key[0], 0, 0.28, 1.0);
      crestHorn(key[2], 0.22, 0.28, 1.05);
      crestHorn(key[4], 0.44, 0.65, 1.15);
      [0, 2, 4, 5, 6, 7].forEach((n, i) => {
        bell(scale[n % scale.length] * 2, { delay: 0.35 + i * 0.075, level: 0.048, duration: 0.65 });
      });
      noise({ kind: 'white', type: 'bandpass', frequency: 4500, end: 9200, q: 1.4, duration: 0.85, level: 0.025, attack: 0.2, delay: 0.3 });
    },

    // A spark flies into the Golden Egg.
    eggSpark() {
      bell(key[4] * 2, { level: 0.04, duration: 0.38 });
      bell(key[0] * 4, { delay: 0.06, level: 0.035, duration: 0.42 });
    },

    // The Golden Egg reaches 3/3 charge and wakes up!
    eggReady() {
      [key[0], key[2], key[4], key[0] * 2].forEach((hz, i) => {
        bell(hz * 2, { delay: i * 0.065, level: 0.048, duration: 0.55 });
      });
    },

    // Locking a score into a category box on the scorecard.
    score() {
      tone({ frequency: key[0] / 2, end: key[0], duration: 0.11, level: 0.09, type: 'triangle', attack: 0.003, body: 0.2 });
      bell(key[2] * 2, { delay: 0.04, level: 0.05, duration: 0.45 });
      bell(key[4] * 2, { delay: 0.11, level: 0.055, duration: 0.6 });
    },

    // RISAEÐLU-YATZY! (5 of a kind!): Slóeðla's horn fanfare, fireworks and cascading bells!
    yatzy() {
      [
        [key[0], 0, 0.16],
        [key[2], 0.15, 0.16],
        [key[4], 0.3, 0.18],
        [key[0] * 2, 0.48, 0.85],
      ].forEach(([hz, delay, duration]) => crestHorn(hz, delay, duration, 1.2));
      [0, 1, 2, 3, 4, 5, 6, 7].forEach((n, i) => {
        bell(scale[n] * 2, { delay: 0.42 + i * 0.065, level: 0.05, duration: i === 7 ? 1.1 : 0.6 });
      });
      // Firework crackles
      for (let i = 0; i < 6; i++) {
        noise({
          kind: 'white',
          type: 'bandpass',
          frequency: 3200 + i * 520,
          q: 3.5,
          duration: 0.035,
          level: 0.035,
          attack: 0.001,
          delay: 0.5 + i * 0.08,
        });
      }
    },

    // End of game celebration fanfare.
    fanfare() {
      [
        [key[0], 0, 0.15],
        [key[2], 0.15, 0.15],
        [key[4], 0.3, 0.15],
        [key[0] * 2, 0.48, 0.95],
      ].forEach(([hz, delay, duration]) => crestHorn(hz, delay, duration, 1.1));
      [...key, key[0] * 2].forEach((hz, i) => bell(hz * 2, { delay: 0.55 + i * 0.07, level: 0.045, duration: i === 5 ? 1 : 0.5 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 5000, end: 8000, q: 1.5, duration: 1, level: 0.02, attack: 0.3, delay: 0.5 });
    },

    // Button tap.
    tap() {
      tone({ frequency: key[4], duration: 0.06, level: 0.09, type: 'triangle', attack: 0.002, body: 0 });
      tone({ frequency: key[4] * 2, duration: 0.03, level: 0.03, attack: 0.002, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 2600, q: 2, duration: 0.03, level: 0.04, attack: 0.002 });
    },

    // Unavailable action wiggle.
    wiggle() {
      for (let i = 0; i < 4; i++) {
        const [from, to] = i % 2 ? [key[2] * 2, key[1] * 2] : [key[1] * 2, key[2] * 2];
        tone({ frequency: from, end: to, duration: 0.075, level: 0.055 - i * 0.01, delay: i * 0.07, type: 'triangle', attack: 0.004 });
      }
    },
  };
}
