// How the stars of Slóeðla's song game move, as pure maths (no page, no three.js): the three stars on the bar at the top (glass
// until reached, then a jump, a quick turn and gold), the stars flying up into the bar, and the end screen's stars (each won
// one flies from the bar to its place, turns twice, lands with a bounce and a flash, then sways and now and then shines; the
// ones not won stand as glass and shiver). game.js turns each into a state for star-view.js (3D) or for its own flat stars:
// { x, y, size, spin, tilt, gold, flash, shine, glass } (spin, tilt in radians; gold, flash, shine 0..1).

import { STAR_SHARES } from './chart.js';

/**
 * The end screen's timings, s: the first star's launch, between launches (five do not drag: 0.45), a flight, a bounce, all five
 * turning together, the count.
 */
export const END = { first: 0.6, gap: 0.45, flight: 0.6, settle: 0.5, together: 0.8, count: 1.0, rest: 0.4 };
const ARC = [0.78, 0.9, 1, 0.9, 0.78]; // the end's five stars' sizes against the middle one's
const LIFT = [0, 0.28, 0.42, 0.28, 0]; // and how much higher each stands, in the middle one's sizes

/**
 * The places of the end's five stars on a screen `w` × `h` (`portrait` when it is upright): a gentle arc, the middle star the
 * biggest and highest, the sides even, every star inside the screen and none over the next. [{ x, y, size }], size a radius.
 */
export function endSpots({ w, h, portrait }) {
  const cy = portrait ? h * 0.33 : h * 0.31;
  const half = ARC[4] + 1.05 * (ARC[3] + ARC[4]) + 1.05 * (ARC[2] + ARC[3]); // half the row, in the middle one's sizes
  const size = Math.min(Math.min(w, h) * (portrait ? 0.12 : 0.11), (w * 0.47) / half);
  const xs = [w / 2];
  for (let i = 3; i < 5; i++) xs[i - 2] = xs[i - 3] + 1.05 * size * (ARC[i - 1] + ARC[i]);
  return ARC.map((share, i) => ({ x: i < 2 ? w - xs[2 - i] : xs[i - 2], y: cy - LIFT[i] * size, size: size * share }));
}

const easeOut = k => 1 - (1 - k) * (1 - k);
const easeInOut = k => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));
const clamp01 = k => Math.min(1, Math.max(0, k));

/**
 * Where on the bar (0 to 1) the gold reaches for a share played (chart.js shareOf): the stars stand evenly, a sixth of the bar
 * apart, and the gold runs evenly from one to the next (five stars by their shares would crowd: four and five are 12 % apart).
 */
export function barPlace(share, shares = STAR_SHARES) {
  const from = [0, ...shares, 1];
  const s = clamp01(share);
  let i = 0;
  while (i < from.length - 2 && s >= from[i + 1]) i++;
  return (i + (s - from[i]) / (from[i + 1] - from[i])) / (from.length - 1);
}

// A star that has landed is alive, as Mario's star is (the owner, 2026-10-30): its size beats like a heart (a double beat each
// second), now and then it turns a few times quickly, and between those it looks about a little. `life` is s since it came to
// life, `seed` keeps the stars apart; on the bar it is quieter (a smaller beat, its turns further apart).
export const LIFE = {
  end: { beat: 1, burstEvery: 3.6, burst: 0.7, turns: 3, look: 0.3 },
  bar: { beat: 0.45, burstEvery: 7, burst: 0.6, turns: 2, look: 0.2 },
};
const BEAT_EVERY = 1.0; // s
/** The heartbeat's lift of the size, 0..~0.09: a strong beat and a softer one after it, each second. */
function heartbeat(life) {
  const p = ((life % BEAT_EVERY) + BEAT_EVERY) % BEAT_EVERY;
  const bump = (centre, width) => Math.exp(-((p - centre) ** 2) / (2 * width * width));
  return 0.09 * bump(0.08, 0.045) + 0.055 * bump(0.28, 0.045);
}
/** How alive a star is `life` s in: { grow (times its size), spin (radians added) }. */
function alive(life, seed, kind) {
  if (life <= 0) return { grow: 1, spin: 0 };
  const u = life - seed * 1.3; // each star bursts in its own time
  let turned = 0;
  if (u > 0) {
    const n = Math.floor(u / kind.burstEvery), p = u - n * kind.burstEvery;
    turned = 2 * Math.PI * kind.turns * (n + easeInOut(clamp01(p / kind.burst)));
  }
  return {
    grow: 1 + kind.beat * heartbeat(life) * clamp01(life / 0.5),
    spin: turned + kind.look * Math.sin(1.1 * life),
  };
}

/** When things happen on the end screen with `stars` won (s after it began). */
export function endTimes(stars) {
  const launches = Array.from({ length: stars }, (_, i) => END.first + i * END.gap);
  const lands = launches.map(at => at + END.flight);
  const together = stars === ARC.length ? lands[stars - 1] + 0.2 : null; // all five turn together
  const countFrom = together !== null ? together + END.together : stars ? lands[stars - 1] + END.settle : END.first;
  const countTo = countFrom + END.count;
  return { launches, lands, together, countFrom, countTo, done: countTo + END.rest };
}

/** How far the dinosaur pads have sunk away at `t` (0..1): not before the count is over, gone when the buttons come. */
export function padSink(t, times) {
  return easeOut(clamp01((t - times.countTo) / (times.done - times.countTo)));
}

/** End star `i` at time `t` (s after the end began): won (`earned`) it flies from `from` (its star on the bar) to `to`. */
export function endStar({ t, i, earned, from, to, size, times }) {
  if (!earned) {
    return {
      x: to.x + 2 * Math.sin(t * 23 + i), y: to.y + 1.5 * Math.sin(t * 19 + i * 2), size: size * 0.9,
      spin: 0.3 * Math.sin(t * 0.8 + i), tilt: 0.05 * Math.sin(t * 1.3 + i), gold: 0, flash: 0, shine: 0, glass: true, shown: true,
    };
  }
  const launch = times.launches[i], land = times.lands[i];
  if (t < launch) return { x: from.x, y: from.y, size: size * 0.4, spin: 0, tilt: 0, gold: 1, flash: 0, shine: 0, glass: false, shown: false };
  if (t < land) {
    const e = easeOut((t - launch) / END.flight);
    const c = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - size * 2 };
    const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, d = e * e;
    return {
      x: a * from.x + b * c.x + d * to.x, y: a * from.y + b * c.y + d * to.y, size: size * (0.4 + 0.6 * e),
      spin: 4 * Math.PI * e, tilt: 0, gold: 1, flash: 0, shine: 0, glass: false, shown: true,
    };
  }
  const s = t - land;
  const turn = times.together !== null && t >= times.together ? 2 * Math.PI * easeOut(clamp01((t - times.together) / END.together)) : 0;
  const p = s - 1 - i * 1.3; // the gloss: 0.4 s every 4 s, from a second after landing, each star a little after the last
  const phase = p >= 0 ? p % 4 : -1;
  const life = alive(s - 1, i, LIFE.end); // alive from a second after landing, when the bounce has settled
  return {
    x: to.x, y: to.y, size: size * (1 + 0.3 * Math.exp(-6 * s) * Math.cos(18 * s)) * life.grow,
    spin: 4 * Math.PI + turn + life.spin, tilt: 0.1 * Math.sin(1.6 * t + i), gold: 1, flash: Math.max(0, 1 - s / 0.35),
    shine: phase >= 0 && phase < 0.4 ? Math.sin((Math.PI * phase) / 0.4) : 0, glass: false, shown: true,
  };
}

/**
 * A star on the bar at (x, y) at time `t`: glass until `litAt` (when it was reached), then a jump, a quick turn, gold.
 * Its face is always to the front at rest (the owner, 2026-10-30: a star that moves ends on its face, never on its side):
 * the glass one only looks about a little, and every turn is a whole one.
 */
export function barStar({ t, x, y, size, litAt }) {
  if (t < litAt) return { x, y, size, spin: 0.25 * Math.sin(0.7 * t + x / 97), tilt: 0, gold: 0, flash: 0, shine: 0, glass: true };
  const s = t - litAt;
  if (s < 0.5) {
    return {
      x, y: y - size * 0.9 * Math.sin((Math.PI * s) / 0.5), size: size * (1 + 0.25 * Math.sin((Math.PI * s) / 0.5)),
      spin: 2 * Math.PI * easeOut(s / 0.5), tilt: 0, gold: 1, flash: Math.max(0, 1 - s / 0.35), shine: 0, glass: false,
    };
  }
  const life = alive(s - 0.5, x / 97, LIFE.bar); // each bar star in its own time (its place on the bar)
  return {
    x, y: y + 2 * Math.sin(2.2 * t), size: size * life.grow, spin: 2 * Math.PI + life.spin,
    tilt: 0.08 * Math.sin(1.3 * t), gold: 1, flash: 0, shine: 0, glass: false,
  };
}

/** A star won, flying up into the bar: `k` 0..1 of the way from `from` to `to`, a little out to the side on a page `width` wide. */
export function flyer({ k, from, to, width }) {
  const e = easeOut(clamp01(k));
  return {
    x: from.x + (to.x - from.x) * e + Math.sin(k * Math.PI) * (from.x < width / 2 ? -1 : 1) * width * 0.08,
    y: from.y + (to.y - from.y) * e,
    scale: 1.6 - k * 0.6,
  };
}

/** The number shown counting up to `total`: 0 until `from`, `total` from `to`, whole numbers rising in between. */
export function countUp(t, from, to, total) {
  if (t <= from) return 0;
  if (t >= to) return total;
  return Math.floor(total * easeOut((t - from) / (to - from)));
}

/** A new record: more stars or more points than the song's records before ({ stars, points }, best.js). */
export const isNewBest = ({ stars = 0, points = 0 }, before = { stars: 0, points: 0 }) =>
  (stars > 0 || points > 0) && (stars > (before?.stars ?? 0) || points > (before?.points ?? 0));
