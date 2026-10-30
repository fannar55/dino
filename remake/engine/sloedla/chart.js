// Slóeðla's song game (chapter 3's gift: she leads the song at the Star Festival): the rules, pure (no page, no sound), so the
// big screen and, later, each phone of a Fjölspil round play by the same ones. A song's notes for the child come from the song
// itself (v2/chart.js); each is { t, role, ... }: `t` the song time it is to be played at (s) and `role` whose it is:
//   a  Slóeðla
//   b  Kambeðla
//   c  Þórseðla
// The page seats the roles in its lanes (laneOf): with three lanes b a c from left to right, with two Slóeðla and Þórseðla, who
// then plays Kambeðla's notes too. In a Fjölspil round each phone will take a role.
//
// The child taps a lane when its note reaches the dinosaur. createJudge says which note a tap plays (the nearest waiting one in the
// lane, within HIT_WINDOW) and which notes went by unplayed; a note missed just goes. Nobody loses: the song always plays to its
// end. createScore counts, and starsFor turns the count into one to three stars, so playing well is worth it: a run of hits
// (the streak) makes the glitter and the audience grow (tierOf), a miss lets it go back to nothing, quietly. Tapping everywhere all
// the time is not a way round it: a tap with no note near (a stray) breaks the run too, and past a fair few, strays cost half a
// note each.

// The window a tap plays a note in. A six-year-old's taps scatter about 180 ms either way of the beat (Bonacina 2019: SD about
// 180 ms at ages 5 to 8, clapping at 0.9 Hz) and young children tap late more often than early, so ±0.2 s caught only about three
// taps in four; the child's window runs from 250 ms early to 350 ms late, and within 150 ms is "right on" (it sparkles more). The
// grown-ups' is tighter. The research behind it: qa/rannsokn/reports/Hvernig tónlistarleikir eru gerðir.md (the worktree's qa/).
export const HIT_WINDOW = 0.2; // s: the plain symmetric window (createJudge's default)
export const GREAT_WINDOW = 0.08;
export const NEAR_WINDOW = 0.5; // s: a tap this close to a waiting note is early or late, never a stray
export const STAR_SHARES = [0.25, 0.5, 0.8]; // the share of the notes played (less the strays' cost) for one, two and three stars
export const STRAY_SPARE = 0.25; // strays up to this share of the notes cost nothing
export const STREAK_TIERS = [3, 8, 16]; // a run this long raises the glitter and the band a tier (Fever after three, as Patapon's remake)
export const RECENTRE = { taps: 8, most: 0.12 }; // the window follows the median of the last 8 hits' errors, at most 120 ms

/**
 * The levels: a note on every `every` beats at most, falling `fall` seconds from the top of the lane to the dinosaur; a tap from
 * `early` s before a note to `late` s after it plays it, within `great` it is right on. The word over her dinosaur (text.js
 * gradeOf) says "Fullkomið!" within `perfect`, "Frábært!" within `great`, "Fínt!" within `fine` and "OK!" further off. The star
 * meter (game.js) is full after `meter` hits.
 */
export const LEVELS = {
  barn: { every: 2, fall: 2.3, early: 0.25, late: 0.35, perfect: 0.07, great: 0.15, fine: 0.24, meter: 12 },
  fullordinn: { every: 1, fall: 1.6, early: 0.15, late: 0.2, perfect: 0.035, great: 0.07, fine: 0.12, meter: 24 },
};

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

/**
 * Fullt hús: every note of the round played, as the end screen counts them ("95 af 95"). A stray tap breaks the run but does
 * not take it away (the owner, 2026-10-31: the screen said 95 of 95 and the DJ "Næstum fullt hús!").
 */
export const fullHouse = ({ hits, total }) => total > 0 && hits >= total;

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
