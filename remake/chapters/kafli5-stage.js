// The dance floor of chapter 5's music video (scene 6: kafli5-dances.js): what the far pool has besides the choir's seats
// (kafli5-pool.js) so the animals can dance. In the pool's own frame: metres, degrees round its middle from +X toward +Z, headings
// in degrees (0 faces +X, 90 faces +Z).
//
//   LOG          the beetles' log on the bank between the turtles' stone and the frogs' pads, lying along the shore
//   BEETLES      six of the game's beetle on it, facing the water (they drum in the percussion break)
//   DRAGONFLIES  three of the Fen's dragonfly over the shallows by the log (they dart to Slóeðla before her horn)
//   RUN          the small lizards' lane along the water's edge, from their seats toward the log
//   PARADE       the carnival's lanes: the grazers' behind the turtles' stone, the lizards' toward the reed
//   EIGHT        the flyers' figure of eight over the pool
//   stageLife()  what world/ardalur/life.js makes of it at build: the log (a prop), the beetles' and the dragonflies' spots, and
//                where nothing tall may grow (the lanes)
//
// Pure data and small pure helpers.
import { FAR_POOL } from './kafli4-route.js';
import { CHOIR, around } from './kafli5-pool.js';

const DEG = Math.PI / 180;
const LEVEL = FAR_POOL.level;

/** The log: its middle, the way its length lies (degrees: along the shore), the forest's `log` (5 to 6 m long, 0.9 m thick). */
export const LOG = { angle: 173, distance: 29.6, at: around(173, 29.6), heading: 173 + 90, variant: 0, scale: 1 };
/** The beetles: how far along the log each sits from its middle (m, toward growing angle), drawn `scale` times life (0.8 m long). */
export const BEETLES = { along: [-2, -1.2, -0.4, 0.4, 1.2, 2], scale: 4, seen: 32 };
/** The dragonflies: where each hovers ([angle, distance]) and how high over the water; drawn within `seen` m of the camera. */
export const DRAGONFLIES = { spots: [[176, 24.6], [171.5, 25.3], [180, 24.9]], up: [1.2, 1.5, 1.0], seen: 48 };

/**
 * The lizards' lane: a ring `distance` m from the pool's middle (the water's edge is at 26), `zig` m to each side of it every
 * `every` m. `s` metres along it from the lizards' spot, toward the log (shrinking angle): [x, z].
 */
export const RUN = { distance: 27.4, zig: 0.7, every: 4.6, from: -5.2, to: 11.2 };
export function runPoint(s, zig = RUN.zig) {
  const angle = CHOIR.lizards.angle - (s / RUN.distance) / DEG;
  return around(angle, RUN.distance + zig * Math.sin((2 * Math.PI * s) / RUN.every));
}

/**
 * The parade's lanes, each a ring `distance` m out, `s` metres along it from the group's spot toward the reed (growing angle):
 * the grazers pass behind the turtles' stone, the lizards go along the water's edge past the flyers' empty place.
 */
export const PARADE = {
  grazers: { distance: 34.6, out: 11 },
  lizards: { distance: 27.6, out: 7.5 },
};
export function paradePoint(group, s) {
  const { distance } = PARADE[group];
  return around(CHOIR[group].angle + (s / distance) / DEG, distance);
}

/**
 * The flyers' figure of eight: its crossing over the pool's middle, its long axis from `axis` + 180 to `axis` degrees, `reach` m
 * to each tip and half as wide; `high` m over the water at the far tip, `low` at the near one (the dive, at `axis`), halfway between at the crossing.
 */
export const EIGHT = { axis: 310, reach: 12, high: 9, low: 2.2 };
/** The eight at `theta` (radians; a round is 2 pi; the dive's tip is at pi / 2, the high tip at 3 pi / 2): [x, y, z]. */
export function eightPoint(theta, { reach = EIGHT.reach } = {}) {
  const a = EIGHT.axis * DEG;
  const along = reach * Math.sin(theta);
  const across = (reach / 2) * Math.sin(2 * theta);
  // across is toward `axis` - 90 degrees: the flyers' own side of the pool
  const x = FAR_POOL.center[0] + along * Math.cos(a) + across * Math.cos(a - Math.PI / 2);
  const z = FAR_POOL.center[1] + along * Math.sin(a) + across * Math.sin(a - Math.PI / 2);
  const y = LEVEL + (EIGHT.high + EIGHT.low) / 2 - ((EIGHT.high - EIGHT.low) / 2) * Math.sin(theta);
  return [x, y, z];
}

/** What life.js builds for the dance floor (createLife's `choir.stage`; this by default when the choir is there). */
export function stageLife() {
  const axis = [Math.cos(LOG.heading * DEG), Math.sin(LOG.heading * DEG)];
  const facing = (Math.atan2(FAR_POOL.center[1] - LOG.at[1], FAR_POOL.center[0] - LOG.at[0])) / DEG;
  const clear = [{ x: LOG.at[0], z: LOG.at[1], r: 3.4, over: 0.3 }];
  for (let s = RUN.from - 1; s <= RUN.to + 1; s += 2) {
    const [x, z] = runPoint(s, 0);
    clear.push({ x, z, r: 1.7, over: 0.25 });
  }
  for (let s = -5; s <= PARADE.grazers.out + 9; s += 2.5) {
    const [x, z] = paradePoint('grazers', s);
    clear.push({ x, z, r: 2.6, over: 0.5 });
  }
  for (let s = 0; s <= PARADE.lizards.out + 1; s += 2) {
    const [x, z] = paradePoint('lizards', s);
    clear.push({ x, z, r: 1.6, over: 0.25 });
  }
  return {
    log: { at: [...LOG.at], rot: LOG.heading * DEG, variant: LOG.variant, scale: LOG.scale, axis },
    beetles: BEETLES.along.map((a, k) => ({
      along: a, at: [LOG.at[0] + axis[0] * a, LOG.at[1] + axis[1] * a], heading: facing + 14 * Math.sin(k * 2.1 + 0.5),
    })),
    beetleScale: BEETLES.scale,
    beetlesSeen: BEETLES.seen,
    dragonflies: DRAGONFLIES.spots.map(([angle, distance], k) => ({ at: around(angle, distance), up: DRAGONFLIES.up[k], heading: facing + 180 + 40 * Math.sin(k * 1.9) })),
    dragonfliesSeen: DRAGONFLIES.seen,
    clear,
  };
}
