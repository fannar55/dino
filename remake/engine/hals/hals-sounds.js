// The sound of "Háls og hali" (spec sections 4 and 6): the board's effects, built as "Eitt!"'s are (engine/eitt/eitt-sounds.js).
//
// Every effect is made on the spot with the game's own tools (engine/audio/sfx.js: tone, noise and bell), and every note is a note
// of the theme's key (theme.json `key`, a major pentatonic) or an octave of one, so the board sits in the music. The game plays
// them through its own instance of the effects (createSfx with `sounds: halsSounds`), outside the chapter's hold, so they sound
// while the chapter stands still behind the game. The music is "Eitt!"'s loop (createEittMusic) with the game's own track,
// assets/audio/hals/music.mp3, which the owner has still to pick: without the file the game is simply quiet under its effects.
//
// The steps are counted: step1 to step6 climb the key, one for each hop of a roll, so a child hears the count go up.

export const HALS_SFX = ['roll', 'land', 'step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'stairs', 'neck', 'whoosh', 'splash',
  'twinkle', 'squelch', 'chime', 'fanfare', 'boom', 'card', 'turn', 'tap', 'wiggle'];

/** The least time, in audio seconds, between two of the same, for the sounds that come in quick runs or from a child's taps. */
export const HALS_GAPS = { roll: 0.4, land: 0.2, stairs: 0.05, tap: 0.05, wiggle: 0.3, card: 0.2, turn: 0.3, boom: 0.05, twinkle: 0.15 };

/** One sound per name in HALS_SFX, for createSfx's `sounds`. */
export function halsSounds({ tone, noise, bell, key }) {
  const octave = [...key, key[0] * 2, key[1] * 2]; // the key climbing on past the root
  /** A soft footfall on a mossy block: a low round thump, a puff of earth and a little note of the count on top. */
  const step = n => () => {
    tone({ frequency: key[0] / 4, end: key[0] / 8, duration: 0.1, level: 0.11, type: 'sine', attack: 0.004, body: 0 });
    noise({ kind: 'warm', duration: 0.12, level: 0.12, frequency: 700, end: 260, attack: 0.006 });
    bell(octave[n - 1], { level: 0.045, duration: 0.32, delay: 0.01 });
  };
  /** A toy horn's note (as "Eitt!"'s): a soft saw an octave down, a hollow square on the note and a round triangle under both. */
  const horn = (hz, delay, duration, level = 1) => {
    tone({ frequency: hz / 2, duration, level: 0.06 * level, type: 'sawtooth', attack: 0.02, delay, body: 0.6, sustain: 0.8 });
    tone({ frequency: hz, duration, level: 0.035 * level, type: 'square', attack: 0.02, delay, body: 0.6, sustain: 0.7 });
    tone({ frequency: hz / 4, duration, level: 0.06 * level, type: 'triangle', attack: 0.02, delay, body: 0.6, sustain: 0.8 });
  };
  return {
    // The die rattles in a cupped hand and tumbles: quick wooden clacks, closer and closer, over a soft rumble.
    roll() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 500, end: 900, q: 0.8, duration: 0.62, level: 0.05, attack: 0.08 });
      let at = 0;
      for (let i = 0; i < 9; i++) {
        noise({ kind: 'white', type: 'bandpass', frequency: 1700 + (i % 3) * 420, q: 3, duration: 0.03, level: 0.07 + (i % 2) * 0.03, attack: 0.001, delay: at });
        tone({ frequency: key[(i * 2) % 5], duration: 0.035, level: 0.025, type: 'triangle', attack: 0.001, body: 0, delay: at });
        at += 0.09 - i * 0.006;
      }
    },
    // It lands: a wooden knock on the root and a bright bell over it.
    land() {
      tone({ frequency: key[0] / 2, end: key[0] / 3, duration: 0.12, level: 0.12, type: 'triangle', attack: 0.002, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 1500, q: 2, duration: 0.05, level: 0.08, attack: 0.001 });
      bell(key[4] * 2, { delay: 0.05, level: 0.05, duration: 0.6 });
    },
    step1: step(1), step2: step(2), step3: step(3), step4: step(4), step5: step(5), step6: step(6),
    // A little hop up the stairs at a tier's end: a light tap.
    stairs() {
      tone({ frequency: key[2], duration: 0.05, level: 0.035, type: 'triangle', attack: 0.002, body: 0 });
      noise({ kind: 'warm', duration: 0.06, level: 0.05, frequency: 1200, end: 600, attack: 0.003 });
    },
    // Up the neck: a warm chord that swells and rises an octave as the piece is lifted (2.8 s, the lift's), bells rolling up it.
    neck() {
      const lift = 2.8;
      [key[0], key[2], key[4]].forEach((hz, i) => {
        tone({ frequency: hz / 2, end: hz, duration: lift, level: 0.035, type: 'triangle', attack: 0.5, body: 0.85, sustain: 0.9, delay: i * 0.04 });
      });
      tone({ frequency: key[0] / 4, end: key[0] / 2, duration: lift, level: 0.04, type: 'sine', attack: 0.4, body: 0.85, sustain: 0.9 });
      [0, 1, 2, 3, 4, 5, 6].forEach((n, i) => bell(octave[n], { delay: 0.3 + i * 0.36, level: 0.035 + i * 0.004, duration: 0.7 }));
      bell(key[0] * 4, { delay: lift - 0.1, level: 0.05, duration: 1.1 });
    },
    // Down the tail: a whoosh of air falling in pitch, and a sliding whistle down the key.
    whoosh() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 2800, end: 380, q: 1.1, duration: 1.5, level: 0.13, attack: 0.18 });
      noise({ kind: 'white', type: 'bandpass', frequency: 6000, end: 1800, q: 1.4, duration: 1.2, level: 0.03, attack: 0.2 });
      tone({ frequency: key[4] * 2, end: key[0] / 2, duration: 1.4, level: 0.035, type: 'sine', attack: 0.1, body: 0.7, sustain: 0.8 });
    },
    // The bottom of the tail: a splash of leaves and dust, and a few bubbly blips.
    splash() {
      noise({ kind: 'warm', duration: 0.45, level: 0.2, frequency: 2600, end: 300, attack: 0.004 });
      noise({ kind: 'white', type: 'bandpass', frequency: 3500, end: 1500, q: 1, duration: 0.3, level: 0.06, attack: 0.002 });
      [4, 2, 3, 1].forEach((n, i) => tone({ frequency: key[n] * 2, end: key[n] * 3, duration: 0.07, level: 0.035, delay: 0.08 + i * 0.07, attack: 0.003, body: 0 }));
    },
    // Fireflies: tiny high bells glittering round the key, with a shimmer of air.
    twinkle() {
      [4, 1, 3, 0, 2, 4, 3].forEach((n, i) => bell(key[n] * 4, { delay: i * 0.085, level: 0.03, duration: 0.45, pan: ((i % 3) - 1) * 0.4 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 6500, end: 9000, q: 1.5, duration: 0.9, level: 0.018, attack: 0.25 });
    },
    // Mud: a low squelch, a wobbling gurgle that sinks, and a soft plop.
    squelch() {
      noise({ kind: 'brown', type: 'lowpass', frequency: 700, end: 180, q: 3, duration: 0.5, level: 0.32, attack: 0.03 });
      tone({ frequency: key[0] / 2, end: key[0] / 5, duration: 0.42, level: 0.07, type: 'triangle', attack: 0.02, body: 0.4 });
      tone({ frequency: key[2] / 2, end: key[1] / 4, duration: 0.25, level: 0.05, type: 'sine', attack: 0.01, delay: 0.32 });
    },
    // A fossil: a bright chord of bells, the key's root, third and fifth together, and a sparkle running up after it.
    chime() {
      [key[0], key[2], key[4]].forEach(hz => bell(hz * 2, { level: 0.05, duration: 1.3 }));
      [0, 1, 2, 3, 4].forEach((n, i) => bell(key[n] * 4, { delay: 0.25 + i * 0.06, level: 0.03, duration: 0.5 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 5000, end: 9000, q: 1.5, duration: 0.8, level: 0.02, attack: 0.2, delay: 0.2 });
    },
    // A win: a little fanfare up the key on the toy horn, its last note held, and bells over it (as "Eitt!"'s).
    fanfare() {
      [[key[0], 0, 0.15], [key[2], 0.15, 0.15], [key[4], 0.3, 0.15], [key[0] * 2, 0.48, 0.95]].forEach(([hz, delay, duration]) => horn(hz, delay, duration, 1.1));
      [...key, key[0] * 2].forEach((hz, i) => bell(hz * 2, { delay: 0.55 + i * 0.07, level: 0.04, duration: i === 5 ? 1 : 0.5 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 5000, end: 8000, q: 1.5, duration: 1, level: 0.02, attack: 0.3, delay: 0.5 });
    },
    // A firework over the top square: a soft thump, then a crackle of little sparks.
    boom() {
      tone({ frequency: key[0] / 4, end: key[0] / 8, duration: 0.3, level: 0.1, type: 'sine', attack: 0.004, body: 0 });
      noise({ kind: 'brown', duration: 0.35, level: 0.16, frequency: 900, end: 200, attack: 0.004 });
      for (let i = 0; i < 6; i++) noise({ kind: 'white', type: 'bandpass', frequency: 3000 + i * 500, q: 4, duration: 0.03, level: 0.035, attack: 0.001, delay: 0.25 + i * 0.07 + (i % 2) * 0.03 });
    },
    // An event card pops up: a round bloop rising.
    card() {
      tone({ frequency: key[2], end: key[4] * 2, duration: 0.14, level: 0.07, attack: 0.004, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 3000, q: 2, duration: 0.04, level: 0.04, attack: 0.001 });
    },
    // A new player's turn: two soft notes up.
    turn() {
      bell(key[2] * 2, { level: 0.04, duration: 0.4 });
      bell(key[4] * 2, { level: 0.045, duration: 0.6, delay: 0.12 });
    },
    // A button: a short wooden tick on a note of the key (the book's and "Eitt!"'s tap).
    tap() {
      tone({ frequency: key[4], duration: 0.06, level: 0.09, type: 'triangle', attack: 0.002, body: 0 });
      tone({ frequency: key[4] * 2, duration: 0.03, level: 0.03, attack: 0.002, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 2600, q: 2, duration: 0.03, level: 0.04, attack: 0.002 });
    },
    // Not now (a tap while a piece moves): a little wobble between two notes of the key.
    wiggle() {
      for (let i = 0; i < 4; i++) {
        const [from, to] = i % 2 ? [key[2] * 2, key[1] * 2] : [key[1] * 2, key[2] * 2];
        tone({ frequency: from, end: to, duration: 0.075, level: 0.05 - i * 0.01, delay: i * 0.07, type: 'triangle', attack: 0.004 });
      }
    },
  };
}
