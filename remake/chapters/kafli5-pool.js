// Chapter 5's place (docs/superpowers/specs/2026-11-07-kafli-5-bod-til-sloedlu-design.md, section 3): the far pool where chapter 4
// ends (chapters/kafli4-route.js FAR_POOL), in Árdalurinn's own frame: metres at real size, north -Z and east +X, headings in degrees
// (0 faces +X, 90 faces +Z). Every spot is given as a way round the pool's middle (degrees from +X toward +Z) and a distance from it,
// as FAR_POOL's are. The golden afternoon sun (engine/looks.js goldenAfternoon) stands where chapter 4's did, heading 215, lower.
//
//   Egill and Mosi stand on the south-east bank, where chapter 4 left them, across the pool from the far reed. Flugeðla stands in the
//   shallows by them (FAR_POOL.landing). Slóeðla hides in the far reed (FAR_POOL.farReed, north-north-west of the middle), her crest
//   over it. The five groups of the choir stand in a bow round the pool's south and west banks, from Egill's side to her reed, low to
//   high: the grazers nearest Egill, then the turtles on their stone, the frogs on lily pads in the shallows, the small lizards and the
//   small flyers nearest the reed. The choir's shot (choir_wide) looks across the pool from over its north-east shallows, south-west:
//   all five groups and the reed at once, the grazers at the left and the flyers at the right, the sun 60 to 70 degrees off its axis
//   (STYLE.md 5: 35 to 150), so their edges catch the light.
//
// Pure data and small pure helpers; kafli5.js stages it.
import { FAR_POOL } from './kafli4-route.js';

/** [x, z] `distance` metres from the far pool's middle, `angle` degrees round from +X toward +Z. */
export const around = (angle, distance) => [
  FAR_POOL.center[0] + distance * Math.cos((angle * Math.PI) / 180),
  FAR_POOL.center[1] + distance * Math.sin((angle * Math.PI) / 180),
];
/** The way (degrees) from [x, z] `a` to [x, z] `b`. */
export const headingTo = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const up = ([x, z], y) => [x, y, z];
const LEVEL = FAR_POOL.level; // the pool's water (5.4 m)

/**
 * The choir: where each group stands and sings, low to high, and how wide its tap circle is (metres round `at`). `on` is what it
 * stands on: the bank, a stone (the turtles) or lily pads in the shallows (the frogs). Each faces the pool's middle.
 */
const facing = at => headingTo(at, FAR_POOL.center);
const spot = (angle, distance, radius, on = 'bank') => {
  const at = around(angle, distance);
  return { at, heading: facing(at), radius, on, angle, distance };
};
export const CHOIR = {
  grazers: spot(141, 32, 4.6),
  turtles: spot(162, 28.5, 4, 'stone'),
  frogs: spot(184, 24, 4, 'lilies'),
  lizards: spot(205, 28.5, 4),
  flyers: spot(221, 31, 3.8),
};
export { GROUPS } from './kafli5-song.js'; // low to high, as the song has them

// Where each member of a group sits at its spot, [side, back] in metres: to the group's right as it faces the pool's middle, and back
// away from the water. The grazers are 7.5 m long, so three stand side by side; the frogs each sit on a lily pad, in a bow; the
// turtles share one stone (ROCK); the rest of those that came (world/ardalur/life.js arrivals) stay where chapter 4 left them.
const SEATS = {
  grazers: [[0, 0], [3.4, 2.4], [-3.4, 2.4]],
  turtles: [[0, 0.1], [-0.75, -0.2], [0.75, -0.15]],
  frogs: [[0, 0], [1.7, 0.5], [-1.7, 0.5], [3.2, 1.3], [-3.2, 1.3]],
  lizards: [[0, 0], [1.6, 0], [-1.6, 0], [0.8, 1.8], [-0.8, 1.8], [2.4, 1.8]],
  flyers: [[0, 0], [1.8, 0.3], [-1.8, 0.3], [0, 1.9]],
};
/** The seats of `group`'s members: [{ at: [x, z], heading }], each facing the pool's middle, a little each its own way. */
export function seatsOf(group) {
  const { at, heading } = CHOIR[group];
  const h = (heading * Math.PI) / 180;
  const [fx, fz] = [Math.cos(h), Math.sin(h)];
  const [rx, rz] = [-fz, fx];
  return SEATS[group].map(([side, back], k) => ({
    at: [at[0] + rx * side - fx * back, at[1] + rz * side - fz * back],
    heading: heading + 9 * Math.sin(k * 2.3 + 0.7),
  }));
}
/** The turtles' stone, on the bank at their spot (a 'rock' of the plants' library). */
export const ROCK = { at: [...CHOIR.turtles.at], variant: 1, scale: 2.6 };
/** What life.js puts at the pool for chapter 5 at build (createArdalur's `choir`): the frogs on their pads and the turtles on their stone. */
export const POOL_LIFE = { frogs: seatsOf('frogs'), turtles: seatsOf('turtles'), rock: ROCK, level: LEVEL };

/**
 * Her four steps out of the reed, one after each phrase (spec 3): deep in it with only her crest over it, her head out of it, her neck
 * and shoulders at its edge, and her whole body in the shallows. Each faces Egill's bank and is nearer it than the last.
 */
export const SPOTS = {
  egill: around(47.5, 25.6), // down from the bank to the water's edge, 6.5 m from Flugeðla, looking across the pool to the reed
  mosi: around(38, 27.5),
  flugedla: [...FAR_POOL.landing], // in the shallows, where she landed
  reed: [...FAR_POOL.farReed], // her reed's middle
};
const toEgill = at => headingTo(at, SPOTS.egill);
const step = (angle, distance, show) => {
  const at = around(angle, distance);
  return { at, heading: toEgill(at), show };
};
export const STEPS = [
  step(238, 32.5, 'crest'),
  step(236, 28, 'head'),
  step(233, 23.5, 'neck'),
  step(228, 17.5, 'whole'),
];
/** Where she wades to for the whole song (scene 6): out in the pool, nearer Egill, in front of the choir. */
export const WADE = { at: around(222, 12), heading: toEgill(around(222, 12)) };

/** Grameðla's ridge, far in the west beyond the falls (world/ardalur/far-land.js GRAMEDLA.from): where the roar comes from (scene 7). */
export const WEST = [-2578, 120];

/**
 * The shots, each a position and a target in metres ([x, y, z]) and a lens. Heights are over the ground under them (the pool's bed
 * under the water is 1.4 m under its surface).
 */
export const SHOTS = {
  // Scene 1: the pool as chapter 4 left it, from low over the water: Flugeðla in the shallows, Egill and Mosi on the bank by her
  // (chapter 4's pool_bank, a little wider).
  pool_open: { position: up(around(54, 10.5), LEVEL + 1.7), target: up(around(52, 26), LEVEL + 1.4), fov: 50 },
  // Scene 2: the far reed close, from over the water in front of it: her crest over the reed (the sun off to the right).
  reed_close: { position: up(around(215, 14), LEVEL + 1.8), target: up(around(238, 30), LEVEL + 2.6), fov: 44 },
  // Scenes 2 and 7: Egill and Mosi at the water's edge, from in front of them over the shallows, the reed behind the camera.
  bank_talk: { position: up(around(46, 15.5), LEVEL + 1.6), target: up(around(43, 26.6), LEVEL + 1.9), fov: 46 },
  // Scenes 3 to 6: the choir. From over the north-east shallows, looking south-west across the pool: the five groups in their bow and
  // the reed at once, at 16:10 and on a tablet held upright (the lens widens upright: the director keeps the 16:10 frame's width).
  choir_wide: { position: up(around(330, 22), LEVEL + 5.2), target: up(around(195, 20), LEVEL + 1), fov: 50 },
  // Scene 6: her out in the pool where she wades (WADE), close, from low over the water west of her: she fills a quarter of the
  // frame's height and her reed is behind her on the left (the sun 80 degrees off the axis). Flugeðla beats the time out of it, in the
  // shallows by Egill's bank.
  sloedla_out: { position: up(around(159, 17), LEVEL + 2.2), target: up(WADE.at, LEVEL + 2.4), fov: 46 },
  // Scene 7: they turn to the west, where the roar comes from: from in front of them, west of them, looking back east at their faces.
  west_listen: { position: up(around(66, 14), LEVEL + 1.8), target: up(around(42, 26.6), LEVEL + 2.2), fov: 46 },
};
/** Who each shot is for: in its frame while the camera holds it (kafli5.test.mjs). The choir's groups are checked by CHOIR. */
export const SHOWS = {
  pool_open: ['flugedla', 'egill', 'mosi'],
  reed_close: ['sloedla'],
  bank_talk: ['egill', 'mosi'],
  choir_wide: ['sloedla'],
  sloedla_out: ['sloedla'],
  west_listen: ['egill', 'mosi'],
};
