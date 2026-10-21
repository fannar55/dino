// The sound of "Risaeðlu-Yatzy!": the table's effects, built as "Eitt!"'s and "Háls og hali"'s are (engine/eitt/eitt-sounds.js,
// engine/hals/hals-sounds.js).
//
// Every effect is made on the spot with the game's own tools (engine/audio/sfx.js: tone, noise and bell), and every note is a note
// of the theme's key (theme.json `key`, a major pentatonic) or an octave of one, so the table sits in the music. A glide may pass
// between two notes of the key on its way, as a horn's or a whistle's does, but it starts and ends on them.
//
// The table plays them through its own instance of the effects (createSfx with `sounds: yatzySounds`), outside the chapter's hold.
// What the child hears, in order:
//   shake, roll            the cup rattles, and the dice pour out onto the slab
//   settle1 … settle5      each die lands in turn, a wooden knock with a little bell that climbs the key, left to right
//   hold1 … hold5          a die tucked into the moss nest: do, re, mi, sol, la, one note up for each die held; unhold takes one out
//   shimmer                rows on the sheet light up because the dice score there
//   stamp, tick1 … tick6   a row is chosen: a rubber stamp, and the total counting up in ticks that climb the key
//   pair, combo            a pair, or three or four of a kind, a full nest or a run on the dice
//   eggSpark, eggReady     a spark flies into the Golden Egg (a rising sparkle), and the egg is full and wakes up
//   eggCrack, crestCall    the egg cracks open in a burst, and Slóeðla blows her crest: a warm, low horn call with bells after it
//   magic                  the egg's magic turns a die
//   drum, think            Slóeðla's turn begins (two soft drums), and her tick-tock while she thinks
//   yatzy, fanfare         five of a kind (a bright short fanfare), and the child's win (the longer one)
//   warm                   the game ends with Slóeðla ahead: a warm chord that comes home, never a sad one
//   zero, badge            a row taken for nothing (a cute slump), and a new Yatzy badge in the book
//   tap, wiggle, dialog    a button, a tap that cannot do anything now, and the end-of-game card opening
// The gaps keep a run from machine-gunning: a sound asked for again sooner than its gap is dropped.

export const YATZY_SFX = [
  'shake', 'roll',
  'settle1', 'settle2', 'settle3', 'settle4', 'settle5',
  'hold1', 'hold2', 'hold3', 'hold4', 'hold5', 'unhold',
  'shimmer', 'stamp',
  'tick1', 'tick2', 'tick3', 'tick4', 'tick5', 'tick6',
  'pair', 'combo',
  'eggSpark', 'eggReady', 'eggCrack', 'crestCall', 'magic',
  'drum', 'think',
  'yatzy', 'fanfare', 'warm', 'zero', 'badge',
  'tap', 'wiggle', 'dialog',
];

/** The least time, in audio seconds, between two of the same. */
export const YATZY_GAPS = {
  shake: 0.3, roll: 0.3,
  settle1: 0.03, settle2: 0.03, settle3: 0.03, settle4: 0.03, settle5: 0.03,
  hold1: 0.03, hold2: 0.03, hold3: 0.03, hold4: 0.03, hold5: 0.03, unhold: 0.05,
  shimmer: 0.6, stamp: 0.2,
  tick1: 0.03, tick2: 0.03, tick3: 0.03, tick4: 0.03, tick5: 0.03, tick6: 0.03,
  pair: 0.2, combo: 0.3,
  eggSpark: 0.12, eggReady: 0.6, eggCrack: 0.6, crestCall: 1.2, magic: 0.3,
  drum: 0.6, think: 0.45,
  yatzy: 0.9, fanfare: 1.2, warm: 1.2, zero: 0.5, badge: 0.5,
  tap: 0.04, wiggle: 0.25, dialog: 0.4,
};

/** One sound per name in YATZY_SFX, for createSfx's `sounds`. */
export function yatzySounds({ tone, noise, bell, key }) {
  const scale = [...key, key[0] * 2, key[1] * 2, key[2] * 2]; // the key climbing on past the root

  /** Slóeðla's crest: a warm, hollow horn. A soft saw an octave down, a round triangle on the note, a sine an octave up for air. */
  const crest = (hz, delay, duration, { level = 1, scoop = 1 } = {}) => {
    const from = hz * scoop; // a call scoops up into its note, as breath through a long crest does
    tone({ frequency: from / 2, end: hz / 2, duration, level: 0.07 * level, type: 'sawtooth', attack: 0.08, delay, body: 0.8, sustain: 0.85 });
    tone({ frequency: from, end: hz, duration, level: 0.05 * level, type: 'triangle', attack: 0.07, delay, body: 0.8, sustain: 0.85 });
    tone({ frequency: from * 2, end: hz * 2, duration: duration * 0.85, level: 0.014 * level, type: 'sine', attack: 0.1, delay: delay + 0.02, body: 0.7, sustain: 0.7 });
  };

  /** A toy horn's note (as "Eitt!"'s), for the fanfares: brighter than her crest. */
  const horn = (hz, delay, duration, level = 1) => {
    tone({ frequency: hz / 2, duration, level: 0.055 * level, type: 'sawtooth', attack: 0.02, delay, body: 0.6, sustain: 0.8 });
    tone({ frequency: hz, duration, level: 0.032 * level, type: 'square', attack: 0.02, delay, body: 0.6, sustain: 0.7 });
    tone({ frequency: hz / 4, duration, level: 0.055 * level, type: 'triangle', attack: 0.02, delay, body: 0.6, sustain: 0.8 });
  };

  /** One die lands: a wooden knock, a click and a small bell, the nth note of the key, from left to right across the tray. */
  const settle = n => () => {
    const pan = (n - 3) * 0.14;
    tone({ frequency: key[(n - 1) % 5] / 2, end: key[(n - 1) % 5] / 2.6, duration: 0.07, level: 0.09, type: 'triangle', attack: 0.002, body: 0, pan });
    noise({ kind: 'white', type: 'bandpass', frequency: 1900 + n * 120, q: 2.6, duration: 0.03, level: 0.06, attack: 0.001, pan });
    bell(scale[n - 1] * 2, { level: 0.022, duration: 0.3, delay: 0.012, pan });
  };

  /** Tucked into the moss nest: a swoop up to the nth note of the key, a bell on it and a soft puff of moss. */
  const hold = n => () => {
    const hz = scale[n - 1] * 2;
    tone({ frequency: hz / 2, end: hz, duration: 0.09, level: 0.065, type: 'triangle', attack: 0.003, body: 0.2 });
    bell(hz, { level: 0.05, duration: 0.42, delay: 0.01 });
    noise({ kind: 'warm', duration: 0.09, level: 0.05, frequency: 900, end: 300, attack: 0.004 });
    if (n === 5) bell(hz * 2, { level: 0.03, duration: 0.55, delay: 0.07 }); // the nest is full
  };

  /** The total counts up: a short tick that climbs the key, tick by tick. */
  const tick = n => () => {
    tone({ frequency: scale[n - 1] * 2, duration: 0.04, level: 0.038, type: 'triangle', attack: 0.002, body: 0 });
    noise({ kind: 'white', type: 'bandpass', frequency: 4200, q: 3, duration: 0.015, level: 0.02, attack: 0.001 });
  };

  return {
    // The cup rattles in Slóeðla's hands: three shakes, each a clatter of dice against a hollow wooden cup.
    shake() {
      for (let s = 0; s < 3; s++) {
        const at = s * 0.11;
        noise({ kind: 'warm', type: 'bandpass', frequency: 520, q: 2.2, duration: 0.09, level: 0.07, attack: 0.01, delay: at });
        for (let c = 0; c < 3; c++) {
          noise({ kind: 'white', type: 'bandpass', frequency: 1500 + ((s + c) % 3) * 450, q: 4, duration: 0.02, level: 0.05, attack: 0.001, delay: at + c * 0.022 });
        }
        tone({ frequency: key[(s * 2) % 5], duration: 0.03, level: 0.02, type: 'triangle', attack: 0.001, body: 0, delay: at + 0.01 });
      }
    },
    // The dice pour out and tumble across the slab: a swish, then quick wooden clacks, farther apart as they slow.
    roll() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 600, end: 1500, q: 0.9, duration: 0.22, level: 0.06, attack: 0.05 });
      let at = 0.08;
      for (let i = 0; i < 8; i++) {
        noise({ kind: 'white', type: 'bandpass', frequency: 1650 + (i % 4) * 380, q: 2.8, duration: 0.026, level: 0.06 + (i % 2) * 0.02, attack: 0.001, delay: at, pan: ((i % 5) - 2) * 0.12 });
        tone({ frequency: key[(i * 2) % 5], duration: 0.03, level: 0.022, type: 'triangle', attack: 0.001, body: 0, delay: at });
        at += 0.035 + i * 0.006;
      }
    },
    settle1: settle(1), settle2: settle(2), settle3: settle(3), settle4: settle(4), settle5: settle(5),
    hold1: hold(1), hold2: hold(2), hold3: hold(3), hold4: hold(4), hold5: hold(5),
    // A die taken back out of the nest: a little slide down and a puff.
    unhold() {
      tone({ frequency: key[3] * 2, end: key[1], duration: 0.09, level: 0.055, type: 'sine', attack: 0.003, body: 0 });
      noise({ kind: 'warm', duration: 0.06, level: 0.035, frequency: 900, end: 400, attack: 0.002 });
    },
    // Rows on the sheet light up: soft glass bells running up the key, and a breath of air.
    shimmer() {
      [0, 1, 2, 3, 4].forEach((n, i) => bell(key[n] * 4, { delay: i * 0.045, level: 0.018, duration: 0.42, pan: (i - 2) * 0.2 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 6000, end: 9000, q: 1.6, duration: 0.5, level: 0.012, attack: 0.15 });
    },
    // A row is chosen: a rubber stamp comes down (a soft thump and a papery slap), and a bright note pops off it.
    stamp() {
      tone({ frequency: key[0] / 4, end: key[0] / 8, duration: 0.12, level: 0.13, type: 'sine', attack: 0.003, body: 0 });
      noise({ kind: 'brown', type: 'lowpass', frequency: 700, end: 200, duration: 0.11, level: 0.14, attack: 0.002 });
      noise({ kind: 'white', type: 'bandpass', frequency: 2400, end: 1400, q: 1.1, duration: 0.05, level: 0.06, attack: 0.001 });
      bell(key[4] * 2, { delay: 0.06, level: 0.04, duration: 0.45 });
    },
    tick1: tick(1), tick2: tick(2), tick3: tick(3), tick4: tick(4), tick5: tick(5), tick6: tick(6),
    // A pair or two pairs: two cheerful bells.
    pair() {
      bell(key[0] * 2, { level: 0.042, duration: 0.35 });
      bell(key[2] * 2, { delay: 0.09, level: 0.048, duration: 0.45 });
    },
    // Three or four of a kind, a full nest or a run: an arpeggio up the key, a short note on her crest and a sparkle.
    combo() {
      [0, 2, 4, 5].forEach((n, i) => bell(scale[n] * 2, { delay: i * 0.07, level: 0.045, duration: 0.55 }));
      crest(key[2], 0.08, 0.34, { level: 0.6 });
      noise({ kind: 'white', type: 'bandpass', frequency: 5200, end: 8800, q: 1.5, duration: 0.5, level: 0.016, attack: 0.15, delay: 0.1 });
    },
    // A spark flies into the Golden Egg: a whistle rising, and two little bells as it lands.
    eggSpark() {
      tone({ frequency: key[2] * 2, end: key[0] * 4, duration: 0.32, level: 0.022, type: 'sine', attack: 0.04, body: 0.6, sustain: 0.8 });
      noise({ kind: 'white', type: 'bandpass', frequency: 3500, end: 8000, q: 1.8, duration: 0.3, level: 0.014, attack: 0.1 });
      bell(key[4] * 2, { delay: 0.28, level: 0.04, duration: 0.38 });
      bell(key[0] * 4, { delay: 0.34, level: 0.032, duration: 0.42 });
    },
    // The egg is full and wakes: a warm glow swelling under a chord of bells that rolls up, and air rising with it.
    eggReady() {
      tone({ frequency: key[0], end: key[0] * 2, duration: 0.9, level: 0.026, type: 'sine', attack: 0.3, body: 0.6, sustain: 0.8 });
      [key[0], key[2], key[4], key[0] * 2].forEach((hz, i) => bell(hz * 2, { delay: 0.12 + i * 0.07, level: 0.042, duration: 0.6 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 3000, end: 8000, q: 1.4, duration: 0.8, level: 0.014, attack: 0.3 });
    },
    // The egg cracks: three sharp cracks of shell and a knock, then a bright burst with a chord of bells in it.
    eggCrack() {
      for (let i = 0; i < 3; i++) {
        noise({ kind: 'white', type: 'bandpass', frequency: 3200 + i * 900, q: 2.2, duration: 0.025, level: 0.08, attack: 0.001, delay: i * 0.075 });
      }
      tone({ frequency: key[0] / 2, end: key[0] / 3, duration: 0.08, level: 0.07, type: 'triangle', attack: 0.002, body: 0, delay: 0.15 });
      noise({ kind: 'white', type: 'bandpass', frequency: 2000, end: 9000, q: 1, duration: 0.42, level: 0.045, attack: 0.02, delay: 0.24 });
      [key[0], key[2], key[4]].forEach((hz, i) => bell(hz * 4, { delay: 0.26 + i * 0.03, level: 0.035, duration: 0.8 }));
    },
    // Slóeðla's call through her crest: a deep breath, a low warm hoot that scoops up into its note, a longer one up the key,
    // and golden bells after it. (She has no recorded call; the encyclopedia's lines tell of her sound but are not one.)
    crestCall() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 400, end: 700, q: 1.2, duration: 0.3, level: 0.05, attack: 0.15 }); // the breath in
      crest(key[0] / 2, 0.22, 0.42, { level: 1.1, scoop: key[4] / 2 / key[0] }); // up from the la below into the do
      crest(key[2] / 2, 0.6, 0.95, { level: 1.15, scoop: key[1] / key[2] }); // re up into mi, held
      noise({ kind: 'warm', type: 'bandpass', frequency: key[2], q: 6, duration: 0.9, level: 0.025, attack: 0.2, delay: 0.62 }); // breath in the crest
      [0, 2, 4, 5, 7].forEach((n, i) => bell(scale[n] * 2, { delay: 0.9 + i * 0.08, level: 0.038, duration: 0.65 }));
    },
    // The egg's magic turns a die: a sparkly whoosh up and a chime.
    magic() {
      noise({ kind: 'white', type: 'bandpass', frequency: 1500, end: 7000, q: 1.2, duration: 0.35, level: 0.035, attack: 0.08 });
      [1, 3, 4].forEach((n, i) => bell(key[n] * 2, { delay: 0.18 + i * 0.05, level: 0.04, duration: 0.5 }));
      bell(key[0] * 4, { delay: 0.36, level: 0.035, duration: 0.7 });
    },
    // Slóeðla's turn: two soft drums, "ba-dum", and a bell.
    drum() {
      tone({ frequency: key[0] / 4, end: key[0] / 6, duration: 0.2, level: 0.13, type: 'sine', attack: 0.003, body: 0 });
      noise({ kind: 'warm', type: 'lowpass', frequency: 600, end: 200, duration: 0.12, level: 0.08, attack: 0.002 });
      tone({ frequency: key[3] / 4, end: key[3] / 6, duration: 0.24, level: 0.13, type: 'sine', attack: 0.003, body: 0, delay: 0.17 });
      noise({ kind: 'warm', type: 'lowpass', frequency: 700, end: 200, duration: 0.12, level: 0.08, attack: 0.002, delay: 0.17 });
      bell(key[2] * 2, { delay: 0.32, level: 0.03, duration: 0.45 });
    },
    // She thinks: a soft wooden tick and tock.
    think() {
      tone({ frequency: key[3], duration: 0.04, level: 0.03, type: 'triangle', attack: 0.002, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 1600, q: 3, duration: 0.02, level: 0.025, attack: 0.001 });
      tone({ frequency: key[1], duration: 0.04, level: 0.026, type: 'triangle', attack: 0.002, body: 0, delay: 0.26 });
      noise({ kind: 'white', type: 'bandpass', frequency: 1300, q: 3, duration: 0.02, level: 0.022, attack: 0.001, delay: 0.26 });
    },
    // RISAEÐLU-YATZY! Five of a kind: a bright, short fanfare on the horn up the key, bells tumbling down over it and a crackle.
    yatzy() {
      [[key[0], 0, 0.12], [key[2], 0.12, 0.12], [key[4], 0.24, 0.12], [key[0] * 2, 0.38, 0.6]].forEach(([hz, delay, duration]) => horn(hz, delay, duration, 1.1));
      [7, 6, 5, 4, 3, 2].forEach((n, i) => bell(scale[n] * 2, { delay: 0.4 + i * 0.06, level: 0.04, duration: i === 5 ? 0.9 : 0.45 }));
      for (let i = 0; i < 5; i++) noise({ kind: 'white', type: 'bandpass', frequency: 3200 + i * 600, q: 3.5, duration: 0.03, level: 0.03, attack: 0.001, delay: 0.5 + i * 0.07 });
    },
    // The child wins: the fanfare up the key, its last note held, bells over it and air.
    fanfare() {
      [[key[0], 0, 0.15], [key[2], 0.15, 0.15], [key[4], 0.3, 0.15], [key[0] * 2, 0.48, 0.95]].forEach(([hz, delay, duration]) => horn(hz, delay, duration, 1.1));
      [...key, key[0] * 2].forEach((hz, i) => bell(hz * 2, { delay: 0.55 + i * 0.07, level: 0.04, duration: i === 5 ? 1 : 0.5 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 5000, end: 8000, q: 1.5, duration: 1, level: 0.018, attack: 0.3, delay: 0.5 });
    },
    // Slóeðla ahead at the end: a warm chord swelling softly, bells stepping down and then up home again. Kind, not sad.
    warm() {
      [key[0] / 2, key[2] / 2, key[4] / 2].forEach((hz, i) => tone({ frequency: hz, duration: 1.5, level: 0.03, type: 'triangle', attack: 0.3, body: 0.7, sustain: 0.8, delay: i * 0.05 }));
      tone({ frequency: key[0] / 4, duration: 1.5, level: 0.035, type: 'sine', attack: 0.3, body: 0.7, sustain: 0.8 });
      [[key[4], 0.2], [key[2], 0.42], [key[1], 0.64], [key[2], 0.9], [key[0] * 2, 1.12]].forEach(([hz, delay], i) => bell(hz * 2, { delay, level: 0.035, duration: i === 4 ? 1 : 0.5 }));
    },
    // A row taken for nothing: a cartoon "bwoop" sliding down, and a little bell to say it is all right.
    zero() {
      tone({ frequency: key[2], end: key[0] / 2, duration: 0.32, level: 0.05, type: 'triangle', attack: 0.01, body: 0.4 });
      tone({ frequency: key[2] * 2, end: key[0], duration: 0.28, level: 0.015, type: 'sine', attack: 0.01, body: 0.4 });
      bell(key[0] * 2, { delay: 0.4, level: 0.03, duration: 0.5 });
    },
    // A new Yatzy badge for the book: glittering bells and a shimmer.
    badge() {
      [4, 2, 0, 3, 4].forEach((n, i) => bell(key[n] * 4, { delay: i * 0.06, level: 0.03, duration: 0.45, pan: ((i % 3) - 1) * 0.3 }));
      bell(key[0] * 2, { delay: 0.32, level: 0.04, duration: 0.9 });
      noise({ kind: 'white', type: 'bandpass', frequency: 6000, end: 9500, q: 1.5, duration: 0.7, level: 0.014, attack: 0.2 });
    },
    // A button: a short wooden tick on a note of the key (the book's and "Eitt!"'s tap).
    tap() {
      tone({ frequency: key[4], duration: 0.06, level: 0.09, type: 'triangle', attack: 0.002, body: 0 });
      tone({ frequency: key[4] * 2, duration: 0.03, level: 0.03, attack: 0.002, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 2600, q: 2, duration: 0.03, level: 0.04, attack: 0.002 });
    },
    // Not now: a little wobble between two notes of the key, dying away (the book's wiggle).
    wiggle() {
      for (let i = 0; i < 4; i++) {
        const [from, to] = i % 2 ? [key[2] * 2, key[1] * 2] : [key[1] * 2, key[2] * 2];
        tone({ frequency: from, end: to, duration: 0.075, level: 0.05 - i * 0.01, delay: i * 0.07, type: 'triangle', attack: 0.004 });
      }
    },
    // The end-of-game card opens: a papery whoosh up and a round bloop rising to a bell.
    dialog() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 400, end: 1800, q: 0.9, duration: 0.22, level: 0.07, attack: 0.06 });
      tone({ frequency: key[2], end: key[4] * 2, duration: 0.16, level: 0.06, attack: 0.004, body: 0, delay: 0.1 });
      bell(key[4] * 2, { delay: 0.22, level: 0.035, duration: 0.5 });
    },
  };
}
