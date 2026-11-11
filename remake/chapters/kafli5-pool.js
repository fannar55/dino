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

// The music video's shots (scene 6, the set: chapters/kafli5-video.js cuts between them). Every one stands over the water and
// looks out at the banks or along the pool, a metre or more over the surface, and none looks toward the afternoon sun (it stands
// at 215 degrees: the camera's way is never within 35 degrees of it, so the choir is shot from the north-east, looking south-west
// and west). `seen(at, heading, away, over, lift, fov)`: the camera looks the way `heading` at `at` from `away` metres, `over` m
// over the water, at a point `lift` m over the water.
const seen = (at, heading, away, over, lift, fov) => {
  const h = (heading * Math.PI) / 180;
  return { position: [at[0] - away * Math.cos(h), LEVEL + over, at[1] - away * Math.sin(h)], target: [at[0], LEVEL + lift, at[1]], fov };
};
const SET_SHOTS = {
  // each group in its part: all of it, and close
  set_grazers: seen(CHOIR.grazers.at, 138, 17, 1.4, 2.4, 46),
  set_grazers_close: seen(CHOIR.grazers.at, 124, 10.5, 1.0, 2.8, 42), // low, looking up at them: they are big
  set_turtles: seen(CHOIR.turtles.at, 160, 8, 1.5, 1.7, 38), // they sit on top of their stone, 1.7 m over the water
  set_turtles_close: seen(CHOIR.turtles.at, 148, 4.6, 2.1, 2.0, 32),
  set_frogs: seen(CHOIR.frogs.at, 160, 8.5, 1.3, 0.5, 40),
  set_frogs_mid: seen(CHOIR.frogs.at, 160, 5.8, 1.15, 0.45, 36),
  set_frogs_close: seen(CHOIR.frogs.at, 160, 3.8, 1.0, 0.4, 32),
  set_lizards: seen(CHOIR.lizards.at, 170, 8, 1.2, 1.0, 40),
  set_lizards_close: seen(CHOIR.lizards.at, 158, 4.6, 1.0, 0.9, 32),
  // the flyers stand by her reed, north-west: from the pool they are under the sun and from the north the reed is in the way, so
  // they are seen from the south, from the water's edge in front of the lizards' place
  set_flyers: seen(CHOIR.flyers.at, 262, 7.8, 1.5, 1.4, 40),
  set_flyers_close: seen(CHOIR.flyers.at, 256, 4.8, 1.6, 1.3, 32),
  // her, out in the pool: close from the north-east (the choir's banks behind her), and low from the east with the sky over her
  set_her_close: seen(WADE.at, 140, 9, 1.5, 1.7, 34), // she wades deep: her head is a metre and a half over the water, three when she blows her horn
  set_her_low: seen(WADE.at, 112, 13, 1.0, 2.4, 44),
  // her horn in the dusk: from the pool's middle, low, her dark reed and the trees behind her and the air over her crest in frame
  // (the notes of her horn rise eight metres there: kafli5-show.js), the low sun just off the frame's left
  set_her_reed: seen(WADE.at, 252, 11, 1.0, 3.8, 46),
  // the lizards' run along the water's edge, from their place (204 degrees) past the frogs (181) and back: from the water west of her
  set_lizards_run: { position: up(around(211.3, 16.4), LEVEL + 1.3), target: up(around(192, 27.5), LEVEL + 0.9), fov: 44 },
  // the beetles' log on the bank between the turtles and the frogs (173 degrees, 29.6 m: kafli5-dances.js), from the water's edge
  set_beetles: seen(around(173, 29.6), 173, 4.4, 1.1, 0.9, 46),
  // the whole dance floor: low over the water from the north-east, wide; and lower still, from the pool's middle
  set_low_wide: { position: up(around(335, 15), LEVEL + 1.2), target: up(around(188, 24), LEVEL + 1.7), fov: 56 },
  set_water_low: { position: up(around(285, 9), LEVEL + 1.0), target: up(around(176, 26), LEVEL + 1.9), fov: 50 },
  // the sky over the pool, for the flyers: from the north bank's shallows, looking up
  set_sky: { position: up(around(300, 21), LEVEL + 1.2), target: up(around(170, 3), LEVEL + 10), fov: 50 },
  // the audience: Egill close, and Flugeðla at her decks in the shallows
  set_egill_close: { position: up(around(47, 21), LEVEL + 1.1), target: up(around(47.5, 25.6), LEVEL + 0.65), fov: 34 }, // he stands ankle-deep: his face is 0.8 m over the water
  set_flugedla: { position: up(around(60, 15), LEVEL + 1.7), target: up(FAR_POOL.landing, LEVEL + 2.3), fov: 36 },
};

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
  ...SET_SHOTS,
};
/** The set's shots of a group: all of it (every seat in frame) and close (its middle). */
export const GROUP_SHOTS = Object.fromEntries(Object.keys(CHOIR).map(group => [group, { all: `set_${group}`, close: `set_${group}_close` }]));
/** Who each shot is for: in its frame while the camera holds it (kafli5.test.mjs). The choir's groups are checked by CHOIR. */
export const SHOWS = {
  pool_open: ['flugedla', 'egill', 'mosi'],
  reed_close: ['sloedla'],
  bank_talk: ['egill', 'mosi'],
  choir_wide: ['sloedla'],
  sloedla_out: ['sloedla'],
  west_listen: ['egill', 'mosi'],
  // the set's shots: a group's shots show the group (tests/kafli5-pool.test.mjs checks its seats), the rest whom they name
  ...Object.fromEntries(Object.keys(SET_SHOTS).map(name => [name, []])),
  set_her_close: ['sloedla'],
  set_her_low: ['sloedla'],
  set_her_reed: ['sloedla'],
  set_egill_close: ['egill'],
  set_flugedla: ['flugedla'],
};
