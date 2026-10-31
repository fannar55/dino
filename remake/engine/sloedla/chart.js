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
// end. createScore counts: each note played gives points by how close it was (POINTS, the word over her dinosaur: 100 right on,
// 80, 60, 40 further off; twice that while Stjörnukraftur burns), and starsFor turns the base points into zero to five stars (the
// owner, 2026-10-31: show in points what was done, a perfect tap gives more, but not too hard). Fullt hús is every note played;
// fullkominn leikur, above it, every note at least "Frábært!" and no stray. A run of hits (the streak) makes the glitter and the
// audience grow (tierOf), a miss lets it go back to nothing, quietly. Tapping everywhere all the time is not a way round it: a tap
// with no note near (a stray) breaks the run too, and past a fair few, strays cost the stars half a perfect note each.

// The window a tap plays a note in. A six-year-old's taps scatter about 180 ms either way of the beat (Bonacina 2019: SD about
// 180 ms at ages 5 to 8, clapping at 0.9 Hz) and young children tap late more often than early, so ±0.2 s caught only about three
// taps in four; the child's window runs from 250 ms early to 350 ms late, and within 150 ms is "right on" (it sparkles more). The
// grown-ups' is tighter. The research behind it: qa/rannsokn/reports/Hvernig tónlistarleikir eru gerðir.md (the worktree's qa/).
export const HIT_WINDOW = 0.2; // s: the plain symmetric window (createJudge's default)
export const GREAT_WINDOW = 0.08;
export const NEAR_WINDOW = 0.5; // s: a tap this close to a waiting note is early or late, never a stray
export const POINTS = { perfect: 100, great: 80, fine: 60, ok: 40 }; // a note played, by its word (text.js gradeOf)
// the share of the most base points there are (every note 100), less the strays' cost, for one to five stars; held by the
// simulated children in tests/sloedla.test.mjs (85 % at 150 ms three stars, all at 150 ms four, all at 100 ms five)
export const STAR_SHARES = [0.15, 0.35, 0.55, 0.73, 0.85]; // four at 0.73: the 85 % children reach up to 0.70, the all-notes 0.76
export const STRAY_SPARE = 0.25; // strays up to this share of the notes cost nothing
export const STRAY_COST = 50; // the points each stray past the spare ones costs the stars (never the number shown)
export const STREAK_TIERS = [3, 8, 16]; // a run this long raises the glitter and the band a tier (Fever after three, as Patapon's remake)
export const RECENTRE = { taps: 8, most: 0.12 }; // the window follows the median of the last 8 hits' errors, at most 120 ms
// s a guest's note waits past its window before the big screen calls it missed: her tap is stamped with the shared clock on her
// phone, but reaches the big screen a trip later (a relay over the net can take 100–200 ms)
export const REMOTE_GRACE = 0.3;

/**
 * The levels: a note on every `every` beats at most, falling `fall` seconds from the top of the lane to the dinosaur; a tap from
 * `early` s before a note to `late` s after it plays it, within `great` it is right on. The word over her dinosaur (text.js
 * gradeOf) says "Fullkomið!" within `perfect`, "Frábært!" within `great`, "Fínt!" within `fine` and "OK!" further off. The star
 * meter (game.js) is full after `meter` hits (a quarter more than it was: the owner, 2026-10-31, a little harder to reach).
 */
export const LEVELS = {
  barn: { every: 2, fall: 2.3, early: 0.25, late: 0.35, perfect: 0.07, great: 0.15, fine: 0.24, meter: 15 },
  fullordinn: { every: 1, fall: 1.6, early: 0.15, late: 0.2, perfect: 0.035, great: 0.07, fine: 0.12, meter: 30 },
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
 *
 * In a band (fjölspil) each lane may have its own player and level: `windowOf(lane)` gives that lane's { early, late, great,
 * grace } (a missing key is the judge's own). `grace` s more are waited past a note's window before it is missed (a guest's
 * tap comes a trip late: REMOTE_GRACE); Infinity means the lane is judged elsewhere and only settle(i, 'hit' | 'missed') resolves
 * its notes. settle returns the state the note had; it also gives a note already judged here the word that counts.
 */
export function createJudge(notes, { window = HIT_WINDOW, early = window, late = window, great = GREAT_WINDOW, near = NEAR_WINDOW, windowOf = null } = {}) {
  // `notes` may grow while the round plays (a song decided a section at a time: conductor.js), always later notes at its end. A
  // tap from `early` s before a note to `late` s after it plays it (the child's window is wider late than early).
  const states = [];
  let first = 0; // every note before this one is hit or missed
  let resolved = 0;
  const own = { early, late, great, grace: 0 };
  const rulesOf = lane => (windowOf ? { ...own, ...windowOf(lane) } : own);
  return {
    tap(lane, time) {
      const rules = rulesOf(lane);
      const reach = Math.max(near, rules.early, rules.late);
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
      if (offset < -rules.early || offset > rules.late) return { kind: 'near', index: best, note, offset };
      states[best] = 'hit';
      resolved++;
      return { kind: 'hit', index: best, note, offset, great: gap <= rules.great };
    },
    sweep(time) {
      // a waiting note with grace (or judged elsewhere) holds `first`; the notes after it are still swept
      const gone = [];
      for (let i = first; i < notes.length && notes[i].t < time; i++) {
        if (states[i]) continue;
        const rules = rulesOf(notes[i].lane);
        if (notes[i].t + rules.late + (rules.grace ?? 0) >= time) continue;
        states[i] = 'missed';
        resolved++;
        gone.push(i);
      }
      while (first < notes.length && states[first]) first++;
      return gone;
    },
    settle(index, state) {
      const had = states[index] ?? 'waiting';
      if (had === 'waiting') resolved++;
      states[index] = state;
      while (first < notes.length && states[first]) first++;
      return had;
    },
    state: i => states[i] ?? 'waiting',
    left: () => notes.length - resolved,
  };
}

/**
 * A count for a round of `total` notes; count(score, result) adds a tap's result (createJudge) or a miss ({ kind: 'miss' }).
 * `points` are the base points (POINTS), `bonus` what Stjörnukraftur added, `belowGreat` the notes played "Fínt!" or "OK!".
 */
export function createScore(total) {
  return { total, hits: 0, great: 0, misses: 0, strays: 0, streak: 0, best: 0, offsets: [], points: 0, bonus: 0, belowGreat: 0 };
}

/**
 * Adds one result to `score` and returns the streak tier it crossed into (a number), or 0 when it crossed none. A hit carries its
 * `grade` (a key of POINTS; none counts as 'ok') and `double` (Stjörnukraftur burned: its points come again as bonus).
 */
export function count(score, result) {
  const before = tierOf(score.streak);
  if (result.kind === 'hit') {
    const grade = POINTS[result.grade] ? result.grade : 'ok';
    score.hits++;
    if (result.great) score.great++;
    score.points += POINTS[grade];
    if (result.double) score.bonus += POINTS[grade];
    if (grade === 'fine' || grade === 'ok') score.belowGreat++;
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

/** Fullkominn leikur: every note played, each at least "Frábært!", and no stray that counted. Always five stars. */
export const perfectGame = ({ hits, total, belowGreat = 0, strays = 0 }) => total > 0 && hits >= total && belowGreat === 0 && strays === 0;

/** The number shown: the base points and what Stjörnukraftur added. It never goes down. */
export const pointsOf = ({ points = 0, bonus = 0 }) => points + bonus;

/**
 * The share of the round's best that was played, 0 to 1: the base points, less STRAY_COST for each stray past the spare ones,
 * over 100 a note (Stjörnukraftur's bonus is not in it).
 */
export function shareOf({ points = 0, strays = 0, total }) {
  if (!(total > 0)) return 0;
  const spare = Math.ceil(total * STRAY_SPARE);
  const earned = points - Math.max(0, strays - spare) * STRAY_COST;
  return Math.max(0, Math.min(1, earned / (POINTS.perfect * total)));
}

/** Stars for a round, 0 to 5 (STAR_SHARES); a perfect game always has five. */
export function starsFor(score) {
  if (perfectGame(score)) return STAR_SHARES.length;
  const share = shareOf(score);
  return STAR_SHARES.filter(least => share >= least).length;
}

/** The glitter tier of a run of `streak` hits: 0 below STREAK_TIERS[0], up to 3. */
export function tierOf(streak) {
  return STREAK_TIERS.filter(least => streak >= least).length;
}
