// Slóeðla's song game (chapter 3's gift: she leads the song at the Star Festival), stage 0: the sheet and the rules, pure (no
// page, no sound), so the big screen and, later, each phone of a Fjölspil round play by the same ones.
//
// The sheet is made from the song's beat grid (its json: bpm, beatOffset, written by tools/theme-tempo.mjs) by makeChart and
// saved as JSON by tools/sloedla-chart.mjs. A note is { t, beat, role, step }: `t` the song time it is to be played at (s, on the
// file's own clock), `beat` its beat on the grid, `role` whose it is and `step` the note of the key it sounds (0 is do, 1 re, 2 mi,
// 3 sol, 4 la, 5 the next do and on up), which each instrument plays in its own register (sounds.js). The roles:
//   a  Slóeðla, the lead, whose crest is a horn: she opens the song alone and has most of it
//   b  Kambeðla, her plates rung like a xylophone
//   c  Þórseðla, the big drum
// The page seats the roles in its lanes (laneOf): with three lanes b a c from left to right, with two Slóeðla and Þórseðla, who
// then plays Kambeðla's notes too. In a Fjölspil round each phone will take a role.
//
// The child taps a lane when its note reaches the dinosaur. createJudge says which note a tap plays (the nearest waiting one in the
// lane, within HIT_WINDOW) and which notes went by unplayed; a note missed just goes. Nobody loses: the song always plays to its
// end. createScore counts, and starsFor turns the count into one to three stars, so playing well is worth it: a run of hits
// (the streak) makes the glitter and the audience grow (tierOf), a miss lets it go back to nothing, quietly. Tapping everywhere all
// the time is not a way round it: a tap with no note near (a stray) breaks the run too, and past a fair few, strays cost half a
// note each.

import { seededRandom } from '../random.js';

// The window a tap plays a note in. A six-year-old's taps scatter about 180 ms either way of the beat (Bonacina 2019: SD about
// 180 ms at ages 5 to 8, clapping at 0.9 Hz) and young children tap late more often than early, so ±0.2 s caught only about three
// taps in four; the child's window runs from 250 ms early to 350 ms late, and within 150 ms is "right on" (it sparkles more). The
// grown-ups' is tighter. The research behind it: qa/rannsokn/reports/Hvernig tónlistarleikir eru gerðir.md (the worktree's qa/).
export const HIT_WINDOW = 0.2; // s: the old symmetric window (makeChart's sheet and the first tests)
export const GREAT_WINDOW = 0.08;
export const NEAR_WINDOW = 0.5; // s: a tap this close to a waiting note is early or late, never a stray
export const STAR_SHARES = [0.25, 0.5, 0.8]; // the share of the notes played (less the strays' cost) for one, two and three stars
export const STRAY_SPARE = 0.25; // strays up to this share of the notes cost nothing
export const STREAK_TIERS = [3, 8, 16]; // a run this long raises the glitter and the band a tier (Fever after three, as Patapon's remake)
export const RECENTRE = { taps: 8, most: 0.12 }; // the window follows the median of the last 8 hits' errors, at most 120 ms

/**
 * The levels: a note on every `every` beats at most, falling `fall` seconds from the top of the lane to the dinosaur; a tap from
 * `early` s before a note to `late` s after it plays it, within `great` it is right on. The word over her dinosaur (text.js
 * gradeOf) says "Fullkomið!" within `perfect`, "Frábært!" within `great`, "Fínt!" within `fine` and "OK!" further off.
 */
export const LEVELS = {
  barn: { every: 2, fall: 2.3, early: 0.25, late: 0.35, perfect: 0.07, great: 0.15, fine: 0.24 },
  fullordinn: { every: 1, fall: 1.6, early: 0.15, late: 0.2, perfect: 0.035, great: 0.07, fine: 0.12 },
};

// The sheet is phrases of four bars (16 beats). At the child's level a phrase has eight places, one on every second beat (the
// strong ones), each a role or a rest ('.'). Slóeðla opens alone, slowly, then her friends come in, and all three end it.
const OPENING = ['a...a...a...a...', 'a.a.a...a.a.a...'].map(halve); // she sings alone first: once a bar, then a little more
const MOTIFS = [
  'b.b.a.a.', 'c.c.a.a.', 'bba.cca.', 'a.b.a.c.', 'bac.bac.', 'cab.cab.', 'aab.aac.', 'a.ab.ac.', 'bbaa.cc.', 'ab.ac.a.',
];
const FINALE = 'bbaaccaa';
// Slóeðla's tunes, one a phrase, her notes taking its steps in turn; Kambeðla rings a broken chord high up; Þórseðla beats do and sol.
const TUNES = [[0, 2, 4, 2], [4, 3, 2, 0], [2, 3, 4, 5], [5, 4, 2, 3], [0, 2, 3, 4], [3, 4, 5, 4], [2, 1, 0, 2], [4, 5, 7, 5]];
const PLATES = [5, 7, 9, 7, 6, 8];
const DRUM = [0, 3];

function halve(pattern) {
  return [...pattern].filter((_, i) => i % 2 === 0).join('');
}

/**
 * The notes of a song: `bpm` and `beatOffset` its grid (beat 0 a strong beat), notes from beat `from` while a phrase still fits
 * before beat `to`, at `level` (LEVELS), the same every time for the same `seed`. Returns the notes, sorted by time.
 */
export function makeChart({ bpm, beatOffset = 0, from = 8, to, level = 'barn', seed = 'sloedla' }) {
  if (!(bpm > 0) || !Number.isFinite(to)) throw new TypeError('makeChart needs the song\'s bpm and the beat to end before (to)');
  const { every } = LEVELS[level] ?? LEVELS.barn;
  const random = seededRandom(`${seed}:${level}`);
  const beatTime = beat => beatOffset + (beat * 60) / bpm;
  const phrases = Math.floor((to - from) / 16);
  const notes = [];
  const counts = { a: 0, b: 0, c: 0 };
  let lastMotif = -1;
  for (let p = 0; p < phrases; p++) {
    let pattern;
    if (p < OPENING.length) pattern = OPENING[p];
    else if (p === phrases - 1) pattern = FINALE;
    else {
      let pick;
      do pick = Math.floor(random() * MOTIFS.length); while (pick === lastMotif);
      lastMotif = pick;
      pattern = MOTIFS[pick];
    }
    const tune = TUNES[p % TUNES.length];
    let sung = 0;
    const roles = [...pattern];
    // the grown-ups' level: every beat may have a note; the child's notes stay, and a friend's answer comes between some of them
    const slots = every === 1 ? 16 : 8;
    for (let s = 0; s < slots; s++) {
      let role;
      if (every === 1) {
        if (s % 2 === 0) role = roles[s / 2];
        else {
          const before = roles[(s - 1) / 2], after = roles[(s + 1) / 2] ?? '.';
          role = random() < (before === '.' || after === '.' ? 0.6 : 0.4) ? answer(before, after, random) : '.';
        }
      } else role = roles[s];
      if (role === '.') continue;
      const beat = from + p * 16 + s * every;
      let step;
      if (role === 'a') step = tune[sung++ % tune.length];
      else if (role === 'b') step = PLATES[counts.b % PLATES.length];
      else step = DRUM[counts.c % DRUM.length];
      counts[role]++;
      notes.push({ t: round(beatTime(beat)), beat, role, step });
    }
  }
  return notes;
}

/** A note between two others at the grown-ups' level: someone other than who plays the one after. */
function answer(before, after, random) {
  const others = ['a', 'b', 'c'].filter(role => role !== after && role !== before);
  return others[Math.floor(random() * others.length)] ?? 'a';
}

const round = t => Math.round(t * 10000) / 10000;

/** The lane a role plays in, with `lanes` lanes (2 or 3): b a c from the left, or a and c (who takes b's notes too). */
export function laneOf(role, lanes = 3) {
  if (lanes === 2) return role === 'a' ? 0 : 1;
  return role === 'b' ? 0 : role === 'a' ? 1 : 2;
}

/**
 * The judge for `notes` (sorted by time), each with a `lane`. tap(lane, time) says what a tap at song time `time` did:
 *   { kind: 'hit', index, note, offset, great }  the nearest waiting note of the lane within HIT_WINDOW is played
 *   { kind: 'near', index, note, offset }        a waiting note is near (early or late): nothing happens
 *   { kind: 'stray' }                            no note near
 * (`offset` is the tap's time less the note's: negative early.) sweep(time) lets the notes go that can no longer be played and
 * returns their indices. state(i) is 'waiting', 'hit' or 'missed'; left() how many are still waiting.
 */
export function createJudge(notes, { window = HIT_WINDOW, early = window, late = window, great = GREAT_WINDOW, near = NEAR_WINDOW } = {}) {
  // `notes` may grow while the round plays (a song decided a section at a time: conductor.js), always later notes at its end. A
  // tap from `early` s before a note to `late` s after it plays it (the child's window is wider late than early).
  const states = [];
  let first = 0; // every note before this one is hit or missed
  let resolved = 0;
  const reach = Math.max(near, early, late);
  return {
    tap(lane, time) {
      let best = -1;
      let gap = Infinity;
      for (let i = first; i < notes.length && notes[i].t <= time + reach; i++) {
        if (states[i] || notes[i].lane !== lane) continue;
        const d = Math.abs(time - notes[i].t);
        if (d < gap) { gap = d; best = i; }
      }
      if (best < 0 || gap > reach) return { kind: 'stray' };
      const note = notes[best];
      const offset = time - note.t;
      if (offset < -early || offset > late) return { kind: 'near', index: best, note, offset };
      states[best] = 'hit';
      resolved++;
      return { kind: 'hit', index: best, note, offset, great: gap <= great };
    },
    sweep(time) {
      const gone = [];
      while (first < notes.length && notes[first].t + late < time) {
        if (!states[first]) {
          states[first] = 'missed';
          resolved++;
          gone.push(first);
        }
        first++;
      }
      return gone;
    },
    state: i => states[i] ?? 'waiting',
    left: () => notes.length - resolved,
  };
}

/** A count for a round of `total` notes; count(score, result) adds a tap's result (createJudge) or a miss ({ kind: 'miss' }). */
export function createScore(total) {
  return { total, hits: 0, great: 0, misses: 0, strays: 0, streak: 0, best: 0, offsets: [] };
}

/** Adds one result to `score` and returns the streak tier it crossed into (a number), or 0 when it crossed none. */
export function count(score, result) {
  const before = tierOf(score.streak);
  if (result.kind === 'hit') {
    score.hits++;
    if (result.great) score.great++;
    score.streak++;
    score.best = Math.max(score.best, score.streak);
    score.offsets.push(result.offset);
  } else if (result.kind === 'miss') {
    score.misses++;
    score.streak = 0;
  } else if (result.kind === 'stray') {
    score.strays++;
    score.streak = 0;
  }
  const after = tierOf(score.streak);
  return after > before ? after : 0;
}

/** The share of the round played, 0 to 1: hits, less half a note for each stray past the spare ones, over all the notes. */
export function shareOf({ hits, strays, total }) {
  if (!(total > 0)) return 0;
  const spare = Math.ceil(total * STRAY_SPARE);
  const points = hits - Math.max(0, strays - spare) * 0.5;
  return Math.max(0, Math.min(1, points / total));
}

/** Stars for a round, 0 to 3 (STAR_SHARES). */
export function starsFor(score) {
  const share = shareOf(score);
  return STAR_SHARES.filter(least => share >= least).length;
}

/** The glitter tier of a run of `streak` hits: 0 below STREAK_TIERS[0], up to 3. */
export function tierOf(streak) {
  return STREAK_TIERS.filter(least => streak >= least).length;
}
