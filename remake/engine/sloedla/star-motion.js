// How the stars of Slóeðla's song game move, as pure maths (no page, no three.js): the three stars on the bar at the top (glass
// until reached, then a jump, a quick turn and gold), the stars flying up into the bar, and the end screen's stars (each won
// one flies from the bar to its place, turns twice, lands with a bounce and a flash, then sways and now and then shines; the
// ones not won stand as glass and shiver). game.js turns each into a state for star-view.js (3D) or for its own flat stars:
// { x, y, size, spin, tilt, gold, flash, shine, glass } (spin, tilt in radians; gold, flash, shine 0..1).

/** The end screen's timings, s: the first star's launch, between launches, a flight, a bounce, three turning together, the count. */
export const END = { first: 0.6, gap: 0.7, flight: 0.6, settle: 0.5, together: 0.8, count: 1.0, rest: 0.4 };

const easeOut = k => 1 - (1 - k) * (1 - k);
const clamp01 = k => Math.min(1, Math.max(0, k));

/** When things happen on the end screen with `stars` won (s after it began). */
export function endTimes(stars) {
  const launches = Array.from({ length: stars }, (_, i) => END.first + i * END.gap);
  const lands = launches.map(at => at + END.flight);
  const together = stars === 3 ? lands[2] + 0.2 : null;
  const countFrom = together !== null ? together + END.together : stars ? lands[stars - 1] + END.settle : END.first;
  const countTo = countFrom + END.count;
  return { launches, lands, together, countFrom, countTo, done: countTo + END.rest };
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
  return {
    x: to.x, y: to.y, size: size * (1 + 0.3 * Math.exp(-6 * s) * Math.cos(18 * s)),
    spin: 4 * Math.PI + turn, tilt: 0.1 * Math.sin(1.6 * t + i), gold: 1, flash: Math.max(0, 1 - s / 0.35),
    shine: phase >= 0 && phase < 0.4 ? Math.sin((Math.PI * phase) / 0.4) : 0, glass: false, shown: true,
  };
}

/** A star on the bar at (x, y) at time `t`: glass until `litAt` (when it was reached), then a jump, a quick turn, gold. */
export function barStar({ t, x, y, size, litAt }) {
  if (t < litAt) return { x, y, size, spin: 0.6 * t, tilt: 0, gold: 0, flash: 0, shine: 0, glass: true };
  const s = t - litAt;
  const base = 0.6 * litAt;
  if (s < 0.5) {
    return {
      x, y: y - size * 0.9 * Math.sin((Math.PI * s) / 0.5), size: size * (1 + 0.25 * Math.sin((Math.PI * s) / 0.5)),
      spin: base + 2 * Math.PI * easeOut(s / 0.5), tilt: 0, gold: 1, flash: Math.max(0, 1 - s / 0.35), shine: 0, glass: false,
    };
  }
  return {
    x, y: y + 2 * Math.sin(2.2 * t), size, spin: base + 2 * Math.PI + 0.5 * Math.sin(1.2 * t),
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

/** More stars than the song's best before: a new best. */
export const isNewBest = (stars, before) => stars > 0 && stars > before;
