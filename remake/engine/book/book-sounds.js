// The book's sound effects (spec section 3.5): small, bright sounds made on the spot with the game's own tools (engine/audio/sfx.js:
// tone, noise and bell), and tuned like the chapter's plate and star: every note is a note of the theme's key (theme.json) or an
// octave of one, so they sit in the music. The book plays them through its own instance of the effects (book-audio.js).

export const BOOK_SFX = ['open', 'close', 'turn', 'tap', 'tile', 'zoomIn', 'zoomOut', 'wiggle', 'newAnimal', 'celebrate', 'info'];

/** The least time, in audio seconds, between two of the same, for the sounds a child can tap again and again. */
export const BOOK_GAPS = { tap: 0.06, turn: 0.18, wiggle: 0.35, tile: 0.12, info: 0.2 };

/** One sound per name in BOOK_SFX, for createSfx's `sounds`. */
export function bookSounds({ tone, noise, bell, key }) {
  return {
    // The book opens: a soft paper whoosh, and a bell rising up the key.
    open() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 600, end: 2400, q: 0.8, duration: 0.45, level: 0.09, attack: 0.16 });
      [0, 2, 4].forEach((n, i) => bell(key[n], { delay: 0.1 + i * 0.09, level: 0.045, duration: i === 2 ? 0.8 : 0.5 }));
    },
    // It closes: the whoosh falls, and so does the bell.
    close() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 2400, end: 600, q: 0.8, duration: 0.4, level: 0.09, attack: 0.08 });
      [4, 2, 0].forEach((n, i) => bell(key[n], { delay: 0.06 + i * 0.09, level: 0.045, duration: i === 2 ? 0.8 : 0.5 }));
    },
    // A page turns: the rustle of paper, two quick crackles over a soft swish.
    turn() {
      noise({ kind: 'warm', type: 'lowpass', frequency: 1800, end: 700, duration: 0.32, level: 0.07, attack: 0.05 });
      noise({ kind: 'white', type: 'bandpass', frequency: 3400, end: 1900, q: 1.3, duration: 0.11, level: 0.06, attack: 0.008 });
      noise({ kind: 'white', type: 'bandpass', frequency: 2700, end: 1500, q: 1.3, duration: 0.1, level: 0.05, attack: 0.008, delay: 0.09 });
    },
    // A tap on a button, a ribbon or an arrow: a short wooden tick on a note of the key.
    tap() {
      tone({ frequency: key[4], duration: 0.06, level: 0.09, type: 'triangle', attack: 0.002, body: 0 });
      tone({ frequency: key[4] * 2, duration: 0.03, level: 0.03, attack: 0.002, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 2600, q: 2, duration: 0.03, level: 0.04, attack: 0.002 });
    },
    // A tile opens its card: a pop up the key, and a little bell after it.
    tile() {
      tone({ frequency: key[0], end: key[0] * 2, duration: 0.12, level: 0.09, attack: 0.005, body: 0 });
      noise({ kind: 'white', type: 'bandpass', frequency: 1800, end: 3000, q: 1.5, duration: 0.05, level: 0.05, attack: 0.003 });
      bell(key[2] * 2, { delay: 0.08, level: 0.04, duration: 0.35 });
    },
    // A picture zooms in: a whoosh that rises, an octave rising quietly under it.
    zoomIn() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 400, end: 3000, q: 0.9, duration: 0.42, level: 0.1, attack: 0.18 });
      tone({ frequency: key[0] / 2, end: key[0], duration: 0.4, level: 0.025, attack: 0.15 });
    },
    // And out again: the whoosh falls.
    zoomOut() {
      noise({ kind: 'warm', type: 'bandpass', frequency: 3000, end: 400, q: 0.9, duration: 0.38, level: 0.1, attack: 0.06 });
      tone({ frequency: key[0], end: key[0] / 2, duration: 0.36, level: 0.025, attack: 0.04 });
    },
    // A silhouette wiggles: a little wobble between two notes of the key, dying away.
    wiggle() {
      for (let i = 0; i < 4; i++) {
        const [from, to] = i % 2 ? [key[2] * 2, key[1] * 2] : [key[1] * 2, key[2] * 2];
        tone({ frequency: from, end: to, duration: 0.075, level: 0.06 - i * 0.01, delay: i * 0.07, type: 'triangle', attack: 0.004 });
      }
    },
    // A new animal comes into the book: three bright bells.
    newAnimal() {
      [0, 2, 4].forEach((n, i) => bell(key[n] * 2, { delay: i * 0.12, level: 0.055, duration: i === 2 ? 0.9 : 0.5 }));
    },
    // The last page of a card: a quick arpeggio up the key, and a shimmer over it.
    celebrate() {
      [...key, key[0] * 2].forEach((hz, i) => bell(hz, { delay: i * 0.07, level: 0.045, duration: i === 5 ? 1 : 0.45 }));
      [1, 3, 4].forEach((n, i) => tone({ frequency: key[n] * 4, duration: 0.14, level: 0.02, delay: 0.3 + i * 0.08 }));
      noise({ kind: 'white', type: 'bandpass', frequency: 5000, end: 8000, q: 1.5, duration: 0.8, level: 0.02, attack: 0.3, delay: 0.15 });
    },
    // The ⓘ window opens: one soft bell.
    info() {
      bell(key[3], { level: 0.05, duration: 0.9 });
    },
  };
}
