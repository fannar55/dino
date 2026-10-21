import { createAudioContext, createOutput } from '../audio/output.js';
import { createSfx } from '../audio/sfx.js';
import { DUCK_DB } from '../audio/music.js';

// The sound of "Litla Yatzy við Mosa": the cup, the dice on the felt, the held dice, the cards, Mosi's turns, the rounds, the end
// and the buttons, built as the sibling games' are ("Eitt!": engine/eitt/eitt-sounds.js, "Háls og hali": engine/hals/hals-sounds.js).
//
// Every effect is made on the spot with the game's own tools (engine/audio/sfx.js: tone, noise and bell), and every pitched note is
// a note of the theme's key (theme.json `key`, a major pentatonic: do re mi sol la) or an octave of one; a glide runs from one note
// of the key to another. Nothing is recorded. The effects go through their own gain, which dips by DUCK_DB while Mosi speaks (as
// the book's do under its narrator), so his voice always sits on top, and then through the page's limiter (engine/audio/output.js).
//
// The game asks for what happened (cue), not for a sound: cue('impact', { die, strength, at }) from the dice, cue('hold', { count })
// from a tap, cue('score', { points, player }) when a card is chosen. This file decides what that sounds like. Some sounds take a
// detail (how many dice are in the cup, which card, how many points): it is handed to the sound in `args` as it plays.
//
// "Yatzy við Mosa" (yatzy-mosi.html) keeps its own small foley (engine/yatzy-mosi/audio.js); this has the same API (unlock, cue,
// mute, pause, cancel, getStats, dispose) and adds duck(speaking).

export const JUNIOR_SFX = [
  // The cup and the dice.
  'pickup', 'gather', 'rattle', 'pour', 'clack', 'knock', 'rimRoll', 'cupDown', 'calmRoll',
  // Holding dice, and what a roll came to.
  'hold', 'unhold', 'rollGood', 'rollGreat', 'rollBad',
  // The cards.
  'shimmer', 'sparkle', 'choose', 'stamp', 'oh', 'swoosh', 'tally', 'land',
  // Turns.
  'drum', 'yourTurn', 'think', 'tada', 'aww',
  // Rounds and the end.
  'pip', 'fanfare', 'confetti', 'warm', 'draw',
  // The page.
  'tap', 'bubble', 'open', 'close', 'pause', 'resume',
];

/**
 * The least time, in audio seconds, between two of the same: nothing machine-guns, however fast a child taps. A die's clack and
 * knock have none: the dice send each landing once a roll (engine/yatzy-mosi/dice.js), and two dice can land in the same frame.
 */
export const JUNIOR_GAPS = {
  pickup: 0.4, gather: 0.4, rattle: 0.035, pour: 0.5, clack: 0, knock: 0, rimRoll: 0.08, cupDown: 0.4, calmRoll: 0.3,
  hold: 0.05, unhold: 0.05, rollGood: 0.5, rollGreat: 0.5, rollBad: 0.5,
  shimmer: 0.5, sparkle: 0.4, choose: 0.3, stamp: 0.3, oh: 0.4, swoosh: 0.4, tally: 0.3, land: 0.2,
  drum: 0.6, yourTurn: 0.6, think: 0.5, tada: 0.6, aww: 0.6,
  pip: 0.3, fanfare: 1, confetti: 1, warm: 1, draw: 1,
  tap: 0.05, bubble: 0.3, open: 0.2, close: 0.2, pause: 0.3, resume: 0.3,
};

const DIP_SECONDS = 0.08; // how quickly the effects dip under Mosi's voice and come back (a time constant), as the book's do
const WELL = 12; // points: Mosi "scores well" (a ta-da) from here (a pair of sixes, two good pairs, three fours, a run, Yatzy)
const RIM = 1.0; // m a die travels from the cup's mouth to where it lies: from here it rolls a little further on its way
const LOG = 300; // the sounds remembered for a QA run (getStats().log)
const DIE_NOTE = [0, 2, 4, 1, 3]; // each die's own note of the key: do, mi, la, re, sol

/**
 * One sound per name in JUNIOR_SFX, for createSfx's `sounds`. `args()` is the detail of the sound being played ({} when there is
 * none): `delay` (s) puts any of them later, and the rest is told at each sound.
 */
export function juniorSounds({ tone, noise, bell, key }, args = () => ({})) {
  const scale = [...key, ...key.map(hz => hz * 2), key[0] * 4]; // the key climbing two octaves and a step
  const at = () => args().delay ?? 0;
  const pan = () => Math.max(-0.8, Math.min(0.8, args().pan ?? 0));
  const dieNote = die => key[DIE_NOTE[((die ?? 0) % 5 + 5) % 5]];
  const random = (low, high) => low + Math.random() * (high - low);

  /** A die against the cup's wall or another die: a dry little click with a woody note of the key under it. */
  const click = (d, level, p, note = key[Math.floor(random(0, 5))]) => {
    noise({ kind: 'white', type: 'bandpass', frequency: random(1700, 2900), q: 3, duration: 0.024, level, attack: 0.001, delay: d, pan: p });
    tone({ frequency: note, duration: 0.03, level: level * 0.35, type: 'triangle', attack: 0.001, body: 0, delay: d, pan: p });
  };
  /** The cup's hollow wooden body answering: a low round knock on the root. */
  const cupBody = (d, level, p) => {
    tone({ frequency: key[0] / 2, end: key[3] / 4, duration: 0.07, level, type: 'triangle', attack: 0.002, body: 0, delay: d, pan: p });
  };
  /** The rattle of `count` dice in a shaken cup, one shake: each die knocks once, somewhere in the shake. */
  const shake = (d, count, strength, p) => {
    cupBody(d, 0.03 * strength, p);
    for (let i = 0; i < count; i++) click(d + random(0, 0.075), (0.035 + 0.035 * strength) * random(0.7, 1), p + random(-0.1, 0.1), dieNote(i) * 2);
  };
  /** The dice slide over the cup's lip and out: a rising, then falling, wooden slither. */
  const pourOut = (d, p) => {
    noise({ kind: 'warm', type: 'bandpass', frequency: 500, end: 1700, q: 0.9, duration: 0.34, level: 0.1, attack: 0.09, delay: d, pan: p });
    for (let i = 0; i < 3; i++) click(d + 0.05 + i * 0.07, 0.045, p);
  };
  /** A die meets the felt: a muffled thud with its own note, brighter the harder it lands. */
  const thud = (d, die, strength, p) => {
    const s = Math.max(0.05, Math.min(1, strength));
    noise({ kind: 'warm', type: 'lowpass', frequency: 700 + 1600 * s, end: 300, q: 0.7, duration: 0.07, level: 0.05 + 0.13 * s, attack: 0.002, delay: d, pan: p });
    tone({ frequency: dieNote(die), end: dieNote(die) / 2, duration: 0.06, level: 0.02 + 0.05 * s, type: 'triangle', attack: 0.002, body: 0, delay: d, pan: p });
    if (s > 0.35) noise({ kind: 'white', type: 'bandpass', frequency: 2300, q: 2.5, duration: 0.02, level: 0.05 * s, attack: 0.001, delay: d, pan: p });
  };
  /** The die comes to rest: one soft knock on its own note, an octave down, with a breath of felt. */
  const rest = (d, die, p) => {
    tone({ frequency: dieNote(die) / 2, duration: 0.11, level: 0.07, type: 'triangle', attack: 0.003, body: 0, delay: d, pan: p });
    tone({ frequency: dieNote(die) / 4, duration: 0.09, level: 0.05, type: 'sine', attack: 0.003, body: 0, delay: d, pan: p });
    noise({ kind: 'warm', type: 'lowpass', frequency: 600, end: 250, duration: 0.08, level: 0.05, attack: 0.003, delay: d, pan: p });
  };
  /** A toy horn's note (as "Eitt!"'s and "Háls og hali"'s): a soft saw an octave down, a hollow square on it and a round triangle. */
  const horn = (hz, d, duration, level = 1, p = 0) => {
    tone({ frequency: hz / 2, duration, level: 0.055 * level, type: 'sawtooth', attack: 0.02, delay: d, body: 0.6, sustain: 0.8, pan: p });
    tone({ frequency: hz, duration, level: 0.03 * level, type: 'square', attack: 0.02, delay: d, body: 0.6, sustain: 0.7, pan: p });
    tone({ frequency: hz / 4, duration, level: 0.055 * level, type: 'triangle', attack: 0.02, delay: d, body: 0.6, sustain: 0.8, pan: p });
  };
  /** A glitter of tiny high bells round one place, and a shimmer of air. */
  const glitter = (d, p, level = 1) => {
    [4, 1, 3, 0, 2].forEach((n, i) => bell(key[n] * 4, { delay: d + i * 0.055, level: 0.03 * level, duration: 0.4, pan: p + ((i % 3) - 1) * 0.15 }));
    noise({ kind: 'white', type: 'bandpass', frequency: 6000, end: 9000, q: 1.5, duration: 0.5, level: 0.018 * level, attack: 0.12, delay: d, pan: p });
  };
  /** The rubber stamp comes down on a card: a soft low thump and a papery slap. */
  const stampDown = d => {
    tone({ frequency: key[0] / 4, end: key[0] / 8, duration: 0.12, level: 0.13, type: 'sine', attack: 0.003, body: 0, delay: d });
    noise({ kind: 'white', type: 'bandpass', frequency: 1500, end: 900, q: 1.1, duration: 0.06, level: 0.1, attack: 0.002, delay: d });
    noise({ kind: 'warm', type: 'lowpass', frequency: 900, end: 300, duration: 0.1, level: 0.08, attack: 0.002, delay: d });
  };
  /** A soft wooden tick of a clock, on a note of the key. */
  const tick = (d, hz, level = 0.05, p = 0) => {
    tone({ frequency: hz, duration: 0.03, level, type: 'triangle', attack: 0.001, body: 0, delay: d, pan: p });
    noise({ kind: 'white', type: 'bandpass', frequency: 3200, q: 3, duration: 0.018, level: level * 0.6, attack: 0.001, delay: d, pan: p });
  };
  let thinking = 0; // tick, tock, tick...

  return {
    // The cup is picked up: a hollow wooden knock and a soft lift of air.
    pickup() {
      const d = at();
      cupBody(d, 0.07, -0.4);
      noise({ kind: 'warm', type: 'bandpass', frequency: 380, end: 1100, q: 0.9, duration: 0.28, level: 0.05, attack: 0.08, delay: d + 0.04, pan: -0.4 });
      bell(key[0] * 2, { delay: d + 0.06, level: 0.025, duration: 0.3, pan: -0.4 });
    },
    // The cup sweeps the loose dice up off the felt: a short slither, and two or three clicks as they drop in.
    gather() {
      const d = at(), p = pan();
      noise({ kind: 'warm', type: 'bandpass', frequency: 900, end: 1800, q: 0.8, duration: 0.2, level: 0.09, attack: 0.05, delay: d, pan: p });
      for (let i = 0; i < Math.max(1, Math.min(3, args().count ?? 3)); i++) click(d + 0.2 + i * 0.06, 0.05, p);
    },
    // One shake of the cup (the dice send six, one after another): as many clicks as dice in it (args.count), so one die rattles
    // thinly and five rattle thick.
    rattle() {
      shake(at(), Math.max(1, Math.min(5, args().count ?? 5)), args().strength ?? 0.6, pan());
    },
    // The dice pour out over the lip.
    pour() {
      pourOut(at(), pan());
    },
    // A die lands, or bounces (args.die, args.strength): its own muffled note on the felt.
    clack() {
      thud(at(), args().die, args().strength ?? 0.5, pan());
    },
    // A die comes to rest (args.die): one soft knock on its own note.
    knock() {
      rest(at(), args().die, pan());
    },
    // A die that flew far (args.die) rolls a little further: a few slowing taps of its corners and a soft rumble under them.
    rimRoll() {
      const d = at(), p = pan();
      noise({ kind: 'warm', type: 'lowpass', frequency: 900, end: 350, duration: 0.3, level: 0.05, attack: 0.02, delay: d, pan: p });
      let t = 0;
      for (let i = 0; i < 5; i++) {
        tone({ frequency: dieNote(args().die) * 2, duration: 0.025, level: 0.032 - i * 0.004, type: 'triangle', attack: 0.001, body: 0, delay: d + t, pan: p });
        noise({ kind: 'white', type: 'bandpass', frequency: 1900, q: 3, duration: 0.018, level: 0.042 - i * 0.006, attack: 0.001, delay: d + t, pan: p });
        t += 0.04 + i * 0.012;
      }
    },
    // The cup is set back down: a hollow wooden thunk.
    cupDown() {
      const d = at(), p = pan();
      tone({ frequency: key[0] / 4, end: key[0] / 8, duration: 0.12, level: 0.09, type: 'triangle', attack: 0.003, body: 0, delay: d, pan: p });
      cupBody(d + 0.01, 0.05, p);
      noise({ kind: 'warm', type: 'lowpass', frequency: 800, end: 260, duration: 0.1, level: 0.06, attack: 0.003, delay: d, pan: p });
    },
    // A roll when the tablet asks for less motion (the dice fade to where they lie in 0.45 s, and send nothing): the same sounds,
    // closer together, so the roll sounds as it always does (args.count dice).
    calmRoll() {
      const d = at(), count = Math.max(1, Math.min(5, args().count ?? 5));
      shake(d + 0.03, count, 0.6, -0.4);
      shake(d + 0.12, count, 0.7, -0.35);
      pourOut(d + 0.18, -0.3);
      for (let i = 0; i < count; i++) {
        thud(d + 0.24 + i * 0.035, i, 0.6, (i - 2) * 0.15);
        rest(d + 0.42 + i * 0.022, i, (i - 2) * 0.15);
      }
    },

    // A die is held (args.count held now, 1 to 5): a warm click and a bell climbing the key, do re mi sol la, one step for each.
    // args.run plays the climb up to it (Mosi keeping several at once).
    hold() {
      const d = at(), count = Math.max(1, Math.min(5, args().count ?? 1)), level = args().strength ?? 1, p = pan();
      const from = args().run ? 1 : count;
      for (let n = from; n <= count; n++) {
        const t = d + (n - from) * 0.09, hz = scale[n - 1] * 2;
        tone({ frequency: key[0], duration: 0.04, level: 0.05 * level, type: 'triangle', attack: 0.002, body: 0, delay: t, pan: p });
        tone({ frequency: hz / 2, end: hz, duration: 0.08, level: 0.05 * level, type: 'triangle', attack: 0.003, body: 0.2, delay: t, pan: p });
        bell(hz, { level: 0.05 * level, duration: 0.42, delay: t + 0.01, pan: p });
      }
      if (count === 5) glitter(d + (count - from) * 0.09 + 0.08, p, 0.8); // all five kept
    },
    // A die let go (args.count still held): a softer note, falling a step down the key.
    unhold() {
      const d = at(), count = Math.max(0, Math.min(4, args().count ?? 0)), p = pan();
      tone({ frequency: scale[count + 1] * 2, end: scale[count] * 2, duration: 0.12, level: 0.04, type: 'sine', attack: 0.003, body: 0.2, delay: d, pan: p });
      noise({ kind: 'warm', duration: 0.05, level: 0.03, frequency: 900, end: 400, attack: 0.002, delay: d, pan: p });
    },
    // The roll has a card to score on: two little bells up.
    rollGood() {
      const d = at();
      bell(key[0] * 2, { delay: d, level: 0.035, duration: 0.3 });
      bell(key[2] * 2, { delay: d + 0.09, level: 0.04, duration: 0.45 });
    },
    // Yatzy on the felt: bells running up two octaves of the key and a glitter on top.
    rollGreat() {
      const d = at();
      scale.slice(0, 10).forEach((hz, i) => bell(hz, { delay: d + i * 0.05, level: 0.03 + i * 0.002, duration: 0.5, pan: (i / 9 - 0.5) * 0.8 }));
      glitter(d + 0.5, 0, 1.2);
    },
    // Nothing scores yet: a soft, curious "hm?" of two notes, the second one up.
    rollBad() {
      const d = at();
      tone({ frequency: key[2] / 2, duration: 0.14, level: 0.04, type: 'triangle', attack: 0.01, body: 0.4, delay: d });
      tone({ frequency: key[1] / 2, end: key[3] / 2, duration: 0.2, level: 0.035, type: 'triangle', attack: 0.01, body: 0.4, delay: d + 0.15 });
    },

    // Cards can be chosen now (args.cards, their places 0 to 4 along the row; args.values, what each gives): a soft bell for each,
    // left to right, where it lies, brighter on a card that scores.
    shimmer() {
      const d = at(), cards = args().cards ?? [0, 1, 2, 3, 4], values = args().values ?? [];
      cards.forEach((card, i) => {
        const p = (card - 2) * 0.25, bright = (values[card] ?? 0) > 0;
        bell(key[card % 5] * 2, { delay: d + i * 0.06, level: bright ? 0.035 : 0.022, duration: 0.5, pan: p });
        if (bright) bell(key[card % 5] * 4, { delay: d + i * 0.06 + 0.02, level: 0.015, duration: 0.3, pan: p });
      });
      noise({ kind: 'white', type: 'bandpass', frequency: 5000, end: 7500, q: 1.4, duration: 0.45, level: 0.012, attack: 0.15, delay: d });
    },
    // The best card (args.card) sparkles: a bright glitter where it lies.
    sparkle() {
      glitter(at(), ((args().card ?? 2) - 2) * 0.25, 1.1);
    },
    // A card is chosen and scores (args.player: 0 the child, 1 Mosi): the stamp, and a chime of the key's root, third and fifth.
    choose() {
      const d = at();
      stampDown(d);
      [key[0], key[2], key[4]].forEach((hz, i) => bell(hz * 2, { delay: d + 0.06 + i * 0.03, level: 0.045, duration: 1 }));
    },
    // A card is used for nothing: the stamp alone.
    stamp() {
      stampDown(at());
    },
    // The child used a card for 0: a soft, friendly "oh", one round low bell (no fail states, nothing sad).
    oh() {
      const d = at();
      bell(key[2], { delay: d, level: 0.04, duration: 0.5 });
      bell(key[0], { delay: d + 0.14, level: 0.045, duration: 0.7 });
    },
    // The score flies up to its player's total: a whoosh rising and falling (0.72 s, the flight's).
    swoosh() {
      const d = at(), p = args().player ? 0.3 : -0.3;
      noise({ kind: 'warm', type: 'bandpass', frequency: 500, end: 2800, q: 1.1, duration: 0.36, level: 0.11, attack: 0.15, delay: d, pan: p * 0.3 });
      noise({ kind: 'warm', type: 'bandpass', frequency: 2800, end: 900, q: 1.1, duration: 0.36, level: 0.09, attack: 0.05, delay: d + 0.34, pan: p });
    },
    // Tally ticks climbing the key as the score counts up (args.points): more ticks for more points, 2 to 10.
    tally() {
      const d = at(), points = args().points ?? 5, count = Math.max(2, Math.min(10, Math.round(points / 3))), p = args().player ? 0.25 : -0.25;
      for (let i = 0; i < count; i++) tick(d + (i * 0.6) / count, scale[i] * 2, 0.04 + i * 0.003, p);
    },
    // The score lands on the total: a round pop and a tiny bell.
    land() {
      const d = at(), p = args().player ? 0.3 : -0.3;
      tone({ frequency: key[4] * 2, end: key[4], duration: 0.09, level: 0.08, attack: 0.003, body: 0, delay: d, pan: p });
      noise({ kind: 'white', type: 'bandpass', frequency: 3200, q: 2.5, duration: 0.03, level: 0.05, attack: 0.001, delay: d, pan: p });
      bell(key[0] * 4, { delay: d + 0.05, level: 0.03, duration: 0.35, pan: p });
    },

    // Mosi's turn begins: a soft two-beat drum, bum-bum.
    drum() {
      const d = at();
      for (const [t, hz, level] of [[0, key[0] / 4, 0.09], [0.2, key[3] / 8, 0.08]]) {
        tone({ frequency: hz, end: hz / 2, duration: 0.2, level, type: 'sine', attack: 0.004, body: 0, delay: d + t, pan: 0.15 });
        tone({ frequency: hz * 2, end: hz, duration: 0.08, level: level * 0.3, type: 'triangle', attack: 0.003, body: 0, delay: d + t, pan: 0.15 });
        noise({ kind: 'brown', type: 'lowpass', frequency: 500, end: 150, duration: 0.16, level: 0.13, attack: 0.004, delay: d + t, pan: 0.15 });
      }
    },
    // The child's turn begins: two soft notes up.
    yourTurn() {
      const d = at();
      bell(key[2] * 2, { delay: d, level: 0.04, duration: 0.4, pan: -0.2 });
      bell(key[4] * 2, { delay: d + 0.12, level: 0.045, duration: 0.6, pan: -0.2 });
    },
    // Mosi is thinking: tick, tock, as a little clock does, while he decides.
    think() {
      thinking = 1 - thinking;
      tick(at(), thinking ? key[4] * 2 : key[2] * 2, 0.035, 0.15);
    },
    // Mosi scored well: a gentle ta-da on the toy horn, short then long.
    tada() {
      const d = at();
      horn(key[3], d, 0.12, 0.7, 0.15);
      horn(key[0] * 2, d + 0.14, 0.5, 0.75, 0.15);
      bell(key[0] * 4, { delay: d + 0.16, level: 0.03, duration: 0.5, pan: 0.15 });
    },
    // Mosi got nothing: a short, soft "aww", falling.
    aww() {
      const d = at();
      tone({ frequency: key[3], end: key[1], duration: 0.42, level: 0.045, type: 'triangle', attack: 0.04, body: 0.5, sustain: 0.7, delay: d, pan: 0.15 });
      tone({ frequency: key[3] / 2, end: key[1] / 2, duration: 0.42, level: 0.035, type: 'sine', attack: 0.04, body: 0.5, sustain: 0.7, delay: d, pan: 0.15 });
    },

    // A round is full: its pip pops gold.
    pip() {
      const d = at();
      tone({ frequency: key[0] * 2, end: key[2] * 2, duration: 0.07, level: 0.07, attack: 0.003, body: 0, delay: d, pan: -0.4 });
      bell(key[4] * 2, { delay: d + 0.05, level: 0.04, duration: 0.45, pan: -0.4 });
    },
    // The child wins: a short, bright fanfare up the key on the toy horn, its last note held, and bells tumbling over it.
    fanfare() {
      const d = at();
      [[key[0], 0, 0.12], [key[2], 0.13, 0.12], [key[3], 0.26, 0.12], [key[0] * 2, 0.4, 0.85]].forEach(([hz, t, duration]) => horn(hz, d + t, duration, 1));
      [...key, key[0] * 2].forEach((hz, i) => bell(hz * 2, { delay: d + 0.45 + i * 0.07, level: 0.04, duration: i === 5 ? 1 : 0.5, pan: (i - 2.5) * 0.2 }));
    },
    // Confetti under the fanfare: a rustle of paper, many tiny crinkles drifting down from every side.
    confetti() {
      const d = at();
      noise({ kind: 'white', type: 'highpass', frequency: 3000, end: 5000, q: 0.5, duration: 1.6, level: 0.02, attack: 0.25, delay: d + 0.3 });
      for (let i = 0; i < 22; i++) {
        noise({ kind: 'white', type: 'bandpass', frequency: random(3500, 7500), q: 4, duration: 0.02, level: random(0.015, 0.035), attack: 0.002, delay: d + 0.35 + random(0, 1.4), pan: random(-0.7, 0.7) });
      }
    },
    // Mosi wins: a warm, friendly tone, a soft chord swelling under bells that come home to the root (a good game, all the same).
    warm() {
      const d = at();
      [key[0], key[2], key[4]].forEach((hz, i) => tone({ frequency: hz / 2, duration: 1.8, level: 0.03, type: 'triangle', attack: 0.35, body: 0.6, sustain: 0.8, delay: d + i * 0.05 }));
      tone({ frequency: key[0] / 4, duration: 1.8, level: 0.04, type: 'sine', attack: 0.3, body: 0.6, sustain: 0.8, delay: d });
      [key[4], key[2], key[3], key[0] * 2].forEach((hz, i) => bell(hz, { delay: d + 0.25 + i * 0.22, level: 0.04, duration: i === 3 ? 1.2 : 0.6 }));
    },
    // A draw: the same warmth, and a bell from each side, the child's and Mosi's, climbing to meet on one note.
    draw() {
      const d = at();
      [key[0], key[2], key[4]].forEach((hz, i) => tone({ frequency: hz / 2, duration: 1.8, level: 0.03, type: 'triangle', attack: 0.35, body: 0.6, sustain: 0.8, delay: d + i * 0.05 }));
      [key[0], key[1]].forEach((hz, i) => bell(hz * 2, { delay: d + 0.2 + i * 0.2, level: 0.035, duration: 0.5, pan: -0.5 }));
      [key[4], key[3]].forEach((hz, i) => bell(hz, { delay: d + 0.3 + i * 0.2, level: 0.035, duration: 0.5, pan: 0.5 }));
      bell(key[2] * 2, { delay: d + 0.75, level: 0.045, duration: 1.2, pan: -0.15 });
      bell(key[2] * 2, { delay: d + 0.75, level: 0.045, duration: 1.2, pan: 0.15 });
    },

    // A button: a short wooden tick on a note of the key (the book's tap).
    tap() {
      const d = at();
      tone({ frequency: key[4], duration: 0.06, level: 0.09, type: 'triangle', attack: 0.002, body: 0, delay: d });
      tone({ frequency: key[4] * 2, duration: 0.03, level: 0.03, attack: 0.002, body: 0, delay: d });
      noise({ kind: 'white', type: 'bandpass', frequency: 2600, q: 2, duration: 0.03, level: 0.04, attack: 0.002, delay: d });
    },
    // Mosi's bubble pops in: a round bloop rising.
    bubble() {
      const d = at();
      tone({ frequency: key[2], end: key[4] * 2, duration: 0.11, level: 0.045, attack: 0.004, body: 0, delay: d, pan: 0.1 });
      tone({ frequency: key[2] * 2, end: key[4] * 4, duration: 0.06, level: 0.012, attack: 0.004, body: 0, delay: d, pan: 0.1 });
    },
    // A dialog opens: a soft paper whoosh and two bells up.
    open() {
      const d = at();
      noise({ kind: 'warm', type: 'bandpass', frequency: 600, end: 2000, q: 0.9, duration: 0.22, level: 0.05, attack: 0.08, delay: d });
      bell(key[2] * 2, { delay: d + 0.08, level: 0.035, duration: 0.35 });
      bell(key[4] * 2, { delay: d + 0.15, level: 0.035, duration: 0.45 });
    },
    // A dialog closes: the whoosh the other way and one soft bell down.
    close() {
      const d = at();
      noise({ kind: 'warm', type: 'bandpass', frequency: 1800, end: 600, q: 0.9, duration: 0.2, level: 0.045, attack: 0.04, delay: d });
      bell(key[2] * 2, { delay: d + 0.06, level: 0.03, duration: 0.35 });
    },
    // The game waits: two soft bells falling, sol to do, and a hush.
    pause() {
      const d = at();
      noise({ kind: 'warm', type: 'lowpass', frequency: 1400, end: 400, duration: 0.35, level: 0.04, attack: 0.08, delay: d });
      bell(key[3] * 2, { delay: d, level: 0.04, duration: 0.4 });
      bell(key[0] * 2, { delay: d + 0.16, level: 0.04, duration: 0.6 });
    },
    // On we go: the same two bells rising, do to sol, and a little sparkle.
    resume() {
      const d = at();
      bell(key[0] * 2, { delay: d, level: 0.04, duration: 0.35 });
      bell(key[3] * 2, { delay: d + 0.13, level: 0.045, duration: 0.5 });
      bell(key[0] * 4, { delay: d + 0.24, level: 0.025, duration: 0.4 });
    },
  };
}

/**
 * The game's sound: `createJuniorAudio()`, made silent and woken by the first touch (unlock). `theme` is theme.json, read from
 * assets/audio/theme.json when not given.
 */
export function createJuniorAudio({ theme: givenTheme } = {}) {
  let context = null, output = null, duck = null, bus = null, sfx = null, theme = givenTheme, tuned = false, disposed = false;
  let muted = false, paused = false, held = false, played = 0, waiting = [];
  const log = [];
  // The dice of the roll going on: how many went into the cup, where each left it, and how often each has landed.
  const roll = { count: 5, from: [], hits: [] };
  // The cards as last seen: what each gives (-1: not to be chosen now) and the glowing one. They shimmer once a roll (the cards go
  // dark while the camera moves after a hold, and are not new when they come back), and a glowing card sparkles once a roll.
  let cards = null, pick = -1, rolls = 0, shimmered = -1, sparkled = '';
  let scored = false; // a card was chosen in this task (a calm score's pop comes first: its sound waits for the flight's length)
  let args = {};

  if (theme === undefined) {
    theme = null;
    if (typeof fetch === 'function') {
      fetch(new URL('../../assets/audio/theme.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).then(value => {
        theme = value;
        if (sfx && !tuned && !disposed) cancel(); // woken before the key was read: retuned, so every note is in the theme's key
      }, () => {});
    }
  }

  /** A fresh set of effects on a fresh gain, so cancel() can silence everything in flight, delayed notes and all. */
  function build() {
    bus = context.createGain();
    bus.connect(duck);
    sfx = createSfx({ context, theme, output: bus, sounds: tools => juniorSounds(tools, () => args), gaps: JUNIOR_GAPS });
    tuned = Array.isArray(theme?.key);
    sfx.muted = muted;
    sfx.setPaused(held);
  }
  function initialize() {
    if (disposed) return false;
    if (!context) {
      context = createAudioContext();
      if (!context) return false;
      output = createOutput(context);
      duck = context.createGain();
      duck.gain.value = 1;
      duck.connect(output);
      build();
    }
    return true;
  }

  /** Plays `name` with its detail; a sound asked for while the context is still waking (the first touch) plays when it is up. */
  function play(name, detail = {}) {
    if (!sfx || muted || held || disposed) return false;
    if (context.state !== 'running') {
      waiting.push({ name, detail, at: performance.now() });
      context.resume?.().then(() => {
        const due = waiting.filter(entry => performance.now() - entry.at < 400);
        waiting = [];
        for (const entry of due) play(entry.name, entry.detail);
      }, () => {});
      return false;
    }
    args = detail;
    const done = sfx.play(name);
    args = {};
    if (done) {
      played++;
      log.push({ t: Math.round(context.currentTime * 1000) / 1000, name, ...(detail.die !== undefined ? { die: detail.die } : {}), ...(detail.count !== undefined ? { count: detail.count } : {}), ...(detail.points !== undefined ? { points: detail.points } : {}) });
      if (log.length > LOG) log.shift();
    }
    return done;
  }

  const distance = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 0);

  /** What the game tells: an event, and its detail. Returns whether something sounded. */
  function cue(kind, options = {}) {
    if (!sfx || muted || held || disposed) return false;
    const { strength = 1, pan = 0, die, at } = options;
    switch (kind) {
      // The cup and the dice (engine/yatzy-mosi/dice.js onEvent, and the roll itself).
      case 'roll':
        rolls++;
        roll.count = Math.max(1, Math.min(5, options.count ?? 5));
        roll.from = [];
        roll.hits = [];
        if (!options.reduced) return play('pickup');
        play('pickup');
        return play('calmRoll', { count: roll.count }); // the calm roll sends no events of its own: its sounds come from here
      case 'sweep': return play('gather', { pan, count: roll.count });
      case 'rattle': return play('rattle', { pan, strength, count: roll.count });
      case 'release':
        if (die === undefined) return play('unhold', { count: options.count ?? 0 }); // "Yatzy við Mosa"'s name for letting a die go
        roll.from[die] = at;
        return play('pour', { pan });
      case 'impact': {
        if (die === undefined) return play('clack', { pan, strength });
        roll.hits[die] = (roll.hits[die] ?? 0) + 1;
        const sounded = play('clack', { pan, strength, die });
        // Its last bounce, far from the cup: it rolls on a little to where it lies.
        if (roll.hits[die] === 3 && distance(roll.from[die], at) >= RIM) play('rimRoll', { pan, die });
        return sounded;
      }
      case 'settle': return play('knock', { pan, die });
      case 'cup': return play('cupDown', { pan });
      // Holding.
      case 'hold':
        if (options.count === 0) return false; // Mosi let them all go
        return play('hold', { count: options.count ?? (options.index ?? 0) + 1, run: options.run, strength: Math.min(1, strength) });
      case 'unhold': return play('unhold', { count: options.count ?? 0 });
      // What a roll came to (no player: the roll; with a player: a card was used).
      case 'good': return play('rollGood');
      case 'great': return play('rollGreat');
      case 'near': return play('rollGood');
      case 'bad':
        if (options.player === undefined) return play('rollBad');
      // falls through: a card used for 0
      case 'score': {
        const points = options.points ?? (kind === 'bad' ? 0 : 1), player = options.player ?? 0;
        scored = true;
        queueMicrotask(() => { scored = false; });
        let sounded;
        if (points > 0) {
          sounded = play('choose', { player, points });
          if (player === 1 && points >= WELL) play('tada', { delay: 0.32 });
        } else {
          sounded = play('stamp', { player });
          play(player === 1 ? 'aww' : 'oh', { delay: 0.18 });
        }
        play('swoosh', { player, delay: 0.05 });
        play('tally', { player, points: Math.max(points, 2), delay: 0.1 });
        if (player === 1) play('pip', { delay: 1.05 }); // Mosi's card fills the round (the child always starts)
        return sounded;
      }
      case 'land': {
        // With less motion the score does not fly: the total pops at once, just before the card's own cue. Its pop then keeps the
        // flight's time (0.72 s), so the sounds come as they always do: stamp, swoosh and ticks, pop.
        const player = options.player ?? 0;
        if (scored) return play('land', { player });
        queueMicrotask(() => play('land', scored ? { player, delay: 0.72 } : { player }));
        return true;
      }
      // The cards: the game shows them (renderUI) and says what each gives now, -1 for one not to be chosen.
      case 'cards': {
        const values = options.values ?? [], before = cards ?? values.map(() => -1);
        cards = values;
        const opened = values.flatMap((value, i) => (value >= 0 && !(before[i] >= 0) ? [i] : []));
        let sounded = false;
        if (opened.length && shimmered !== rolls) {
          shimmered = rolls;
          sounded = play('shimmer', { cards: opened, values });
          const best = opened.reduce((a, i) => (values[i] > (values[a] ?? 0) ? i : a), -1);
          if (best >= 0) play('sparkle', { card: best, delay: 0.06 * opened.length + 0.12 });
        }
        const glowing = options.pick ?? -1;
        if (glowing >= 0 && glowing !== pick && sparkled !== `${rolls}:${glowing}`) {
          sparkled = `${rolls}:${glowing}`;
          sounded = play('sparkle', { card: glowing }) || sounded;
        }
        pick = glowing;
        return sounded;
      }
      // Turns.
      case 'turn': return play(options.player === 1 ? 'drum' : 'yourTurn');
      case 'think': return play('think');
      // The end.
      case 'win': {
        const winner = options.winner ?? 'you';
        if (winner === 'mosi') return play('warm');
        if (winner === 'tie') return play('draw');
        play('confetti');
        return play('fanfare');
      }
      // The page.
      case 'tap': return play('tap');
      case 'bubble': return play('bubble');
      case 'dialog':
        if (options.id === 'win-dialog') return false; // the fanfare is its sound
        return play(options.id === 'pause-dialog' ? 'pause' : 'open');
      case 'dialogClose': return play(options.id === 'pause-dialog' ? 'resume' : 'close');
      default:
        return JUNIOR_SFX.includes(kind) ? play(kind, options) : false;
    }
  }

  /** Silences what is sounding and what is still to come, at once; the next sound plays as usual. */
  function cancel() {
    waiting = [];
    if (!sfx) return;
    const old = bus, oldSfx = sfx;
    old.gain.setTargetAtTime(0, context.currentTime, 0.008);
    setTimeout(() => { oldSfx.stop(); old.disconnect(); }, 120);
    build();
  }

  /** Hidden (the tab is away): silent, the clock asleep. A dialog over the board is not: its own sounds play. */
  function hold(value) {
    held = value;
    sfx?.setPaused(held);
    if (!context || disposed) return;
    if (held) context.suspend?.().catch(() => {});
    else if (!muted) context.resume?.().catch(() => {});
  }

  return {
    unlock() {
      if (initialize() && !held && !muted) context.resume?.().catch(() => {});
    },
    cue,
    /** Mosi speaks: the effects dip under him, and come back when he stops. */
    duck(speaking) {
      if (!duck) return;
      duck.gain.setTargetAtTime(speaking ? 10 ** (DUCK_DB / 20) : 1, context.currentTime, DIP_SECONDS);
    },
    mute(value) {
      if (disposed) return;
      muted = Boolean(value);
      if (muted) cancel();
      if (sfx) sfx.muted = muted;
      if (!muted && context && !held) context.resume?.().catch(() => {});
    },
    pause(value) {
      if (disposed) return;
      paused = Boolean(value);
      hold(paused && typeof document !== 'undefined' && document.hidden === true);
    },
    cancel,
    getStats: () => ({ played, muted, paused, held, state: context?.state || 'uninitialized', key: theme?.key ?? null, log: log.slice() }),
    dispose() {
      if (disposed) return;
      disposed = true;
      waiting = [];
      sfx?.stop();
      context?.close?.().catch(() => {});
      output?.disconnect();
    },
  };
}
