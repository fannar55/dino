// Chapter 6's places (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md, sections 2, 4 and 5): where everyone
// stands, the stones of the ford, the giant's prints, the call's stands and glows, and the shots. Pure data and small pure helpers;
// kafli6.js stages it. Metres at real size, north -Z and east +X, headings in degrees (0 faces +X, 90 faces +Z). The sun stands at
// heading 215, 10 degrees up, in every place (engine/looks.js lowSun and the looks blended from it): no shot looks within 35 degrees
// of it (STYLE.md 5).
//
//   ardalur   Árdalurinn in chapter 4's frame: the far pool as chapter 5 leaves it (kafli5-place.js buildPool) and the ford, 45 m
//             above the lip of the falls (FORD), built with it (createArdalur's `at`: both spots). Mosi crosses from the north bank
//             to the south on five steps of stones, the falls on his left, 45 m downstream.
//   hlid      the slope, at real coordinates on the far land's western ridge (world/fjall createSlope: FJALL.ridge [-2578, 120]): the
//             path climbs west to a ledge east of the ridge (SLOPE.ledge), with the whole forest below it in the east.
//   sky       the belt of cloud, a stage of its own round [0, 0] (world/fjall createBelt: ground 0 to 3 m, its cloud 60 m round):
//             the prints along BELT_PATH, then the call's three walks, then where she meets them (MEET).
//   toppur    the top, a stage of its own (world/fjall createTop: 45 m round, ground 0 to 3 m, the sea of cloud at -7 m).
//
// The belt and the top have no real heights yet (the stages are grey in chunk 1): their shots stand on BELT_GROUND, and the shots
// made for a stand (printShot, callShot, meetShot) take the ground under it.
import { FAR_POOL } from './kafli4-route.js';
import { SHOTS as POOL_SHOTS, SPOTS, WADE, around } from './kafli5-pool.js';
import { ROUTE } from './kafli5-place.js';

export { ROUTE };
const deg = Math.PI / 180;
const way = heading => [Math.cos(heading * deg), Math.sin(heading * deg)];
const headingTo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / deg;
const up = ([x, z], y) => [x, y, z];

// ---------------------------------------------------------------------------------------------
// The ford (scene 2). 45 m above the lip, well clear of the quick water there (world/ardalur/river.js FLOW.lip: the last 30 m),
// where the upper river is 18 m wide and 1.6 m deep in its middle. `from` and `to` are dry, 1.8 m past the water's edge.
const river = ROUTE.river;
const here = river.at(river.falls + 45);
const NORTH = [-here.dir[1], here.dir[0]]; // the right of the way upstream (river.nearest's side +1)
const ACROSS = [-NORTH[0], -NORTH[1]]; // the way over, from the north bank to the south
const UP = here.dir; // upstream, west
const BANK = 10.8; // m from the river's middle to where Mosi stands on either bank
const centre = [here.x, here.z];
/** [x, z] `across` m over from FORD.from and `along` m upstream (west) of the line across. */
const fordPoint = (across, along = 0) => [
  centre[0] + NORTH[0] * (BANK - across) + UP[0] * along,
  centre[1] + NORTH[1] * (BANK - across) + UP[1] * along,
];
export const FORD = { d: here.d, centre, from: fordPoint(0), to: fordPoint(2 * BANK), level: here.level, half: here.half };
const LEVEL = FORD.level;
const OVER = headingTo(FORD.from, FORD.to); // the way he crosses: south, a little west (92.8 degrees)

/** The stones (m): the right one big, flat and dry, the others small and rocking; how far each stands out of the water; their tap circles. */
export const STONE = { right: { across: 3, up: 0.35, tap: 1.6 }, wrong: { across: 1.4, up: 0.25, tap: 1.0 } };
/** After landing on this step (its index) they stop and look down the falls. */
export const FALLS_LOOK = 2;
// The right stones in a row over the river, 3.6 m on from the last and a little up or down the river by turns; each step's stones
// as [along, across] from its right one (along: upstream). Each step's shot looks back north at Mosi, so the stones are listed
// upstream first: left to right as it sees them. The right one stands among the others in a different place each step.
const ROW = [-0.5, -0.5, 0, 0.5, 0.5];
const LAYOUT = [
  [[5.8, -0.6], [2.9, -0.2], [0, 0]],
  [[0, 0], [-3, -0.3]],
  [[3, -0.4], [0, 0], [-3, -0.2]],
  [[3, -0.3], [0, 0]],
  [[0, 0], [-2.9, -0.3], [-5.8, -0.7]],
];
export const STEPS = LAYOUT.map((stones, step) => ({
  stones: stones.map(([along, across], k) => ({
    id: `stone-${step}-${k}`,
    at: fordPoint(3.6 * (step + 1) + across, ROW[step] + along),
    right: along === 0 && across === 0,
  })),
}));
const rightOf = step => STEPS[step].stones.find(s => s.right).at;
/** Where Mosi stands before step `k`: on the north bank, or on the last right stone (with its top under his feet). */
const standBefore = k => (k === 0 ? { at: FORD.from } : { at: rightOf(k - 1), y: LEVEL + STONE.right.up });

/**
 * The camera for step `k`: over the water on the far side of the step's stones, looking back north at them and at Mosi beyond with
 * Egill on his back, the falls off to the right; the stones low in the middle of the frame, all of them, upright too.
 */
export function stepShot(k) {
  const stones = STEPS[k].stones;
  const mid = [stones.reduce((s, x) => s + x.at[0], 0) / stones.length, stones.reduce((s, x) => s + x.at[1], 0) / stones.length];
  const at = (back, y) => [mid[0] + ACROSS[0] * back, y, mid[1] + ACROSS[1] * back];
  return { position: at(10, LEVEL + 3.6), target: at(-2, LEVEL + 1), fov: 50 };
}

// ---------------------------------------------------------------------------------------------
// The slope (scene 3), on world/fjall's slope stage (createSlope: its shelf round [-2398, 120], 237.5 m up; heights measured on its
// heightAt 2026-11-21, the cameras' too). The land falls steeply east of the shelf and rises west of it, so the path comes up from
// the south onto the shelf, where he turns: the whole forest lies in the east, and the mountain rises in the west.
export const SLOPE = {
  from: { at: [-2392, 160], ground: 231.5 }, // where the ride begins, below the shelf
  ride: { at: [-2390, 144], heading: -80.5, ground: 235.6 }, // on the way up, below the ledge
  ledge: { at: [-2386, 124], ground: 237.5 }, // the ledge: he turns there, to the east and back to the mountain
};

// ---------------------------------------------------------------------------------------------
// The belt of cloud (scene 4): her prints, 5 m long, a pace of 9 m, along a path that rises gently through the cloud. Its way is
// about heading 35, straight away from the sun, so the shots along it and the call's (which turn up to 80 degrees off it) all keep
// the sun behind them.
export const BELT_GROUND = 1.5; // m: the stage's ground where it is not known (world/fjall: 0 to 3 m)
export const BELT_PATH = [[-34, -22], [-17, -12], [0, 0], [16, 12]];
export const PRINT_SIZE = 5; // world/props/mud-prints.js size: 5 m long, 3.4 m wide (the owner may pick 11 from stills)
export const PRINT_PACE = 9; // m along the path from one print to the next
export const PRINT_TAP = 2.2; // m round a print's middle: its tap circle
const PRINT_FROM = 6; // m along the path to the first print
const PRINT_GAUGE = 1; // m from the path's middle to a print's: she walks on two feet, left and right
const PRINT_TURN = 6; // degrees a print's toes turn in
const MOSI_BACK = 3.8; // m from a print's middle back to Mosi's root: his front feet (2.3 m ahead of it) 1 m inside its heel
/** Where a path is `s` metres along it, and its way there (unit); past its end, on along its last leg. */
function pathAt(path, s) {
  let i = 0;
  for (; i < path.length - 2; i++) {
    const leg = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    if (s <= leg) break;
    s -= leg;
  }
  const [ax, az] = path[i], [bx, bz] = path[i + 1];
  const leg = Math.hypot(bx - ax, bz - az);
  return { x: ax + ((bx - ax) * s) / leg, z: az + ((bz - az) * s) / leg, dx: (bx - ax) / leg, dz: (bz - az) / leg };
}
/** Print `k` (six; a seventh would lie on the rock where they end): her right foot first, on the right of the way. */
function printAt(k) {
  const p = pathAt(BELT_PATH, PRINT_FROM + PRINT_PACE * k);
  const right = k % 2 === 0 ? 1 : -1;
  const heading = Math.atan2(p.dz, p.dx) / deg - right * PRINT_TURN;
  return { position: [p.x - p.dz * PRINT_GAUGE * right, p.z + p.dx * PRINT_GAUGE * right], heading, foot: right > 0 ? 'right' : 'left' };
}
export const PRINTS = Array.from({ length: 6 }, (_, k) => printAt(k));
/** Where Mosi stands at print `k` (0 to 6): his front feet in it near its heel, on its line; at 6, a pace past the sixth, on the rock. */
export function mosiAt(k) {
  const { position: [x, z] } = printAt(k);
  const p = pathAt(BELT_PATH, PRINT_FROM + PRINT_PACE * k);
  return { x: x - p.dx * MOSI_BACK, z: z - p.dz * MOSI_BACK, heading: Math.atan2(p.dz, p.dx) / deg };
}
/** The cloud's level (world/fjall createCloud setLevel) before any print and after each: thicker with every print. */
export const CLOUD_BY_PRINT = [0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1];
/**
 * The camera for print `k`: beside the path on its left, a little ahead and up, looking down at the print and back at Mosi with his
 * front feet in its heel and his head over it.
 */
export function printShot(k, ground = BELT_GROUND) {
  const { position: [x, z] } = PRINTS[k];
  const p = pathAt(BELT_PATH, PRINT_FROM + PRINT_PACE * k);
  const at = (along, left, y) => [x + p.dx * along + p.dz * left, ground + y, z + p.dz * along - p.dx * left];
  return { position: at(2.5, 8.5, 5.6), target: at(-1.2, 0, 0.6), fov: 54 };
}

// ---------------------------------------------------------------------------------------------
// The call (scene 5). Each round he calls, she answers from one of three ways (`angle` degrees left of his heading, straight on, or
// right), the fog glows gold that way `glow` m from him, and he walks `reach` m toward it and faces that way. She is `her` m from
// him in each round, nearer each time.
export const CALL = { reach: 7, glow: 22, angle: 40, her: [60, 30, 12] };
const TURN = { left: -CALL.angle, ahead: 0, right: CALL.angle };
const GLOW_UP = 9; // m over his ground: the glow stands over him in the fog, clear of his and Egill's heads
/** Where he stands for round `round` (0 to 3: 3 is where the third walk leaves him), after walking the ways in `walked` (ahead if missing). */
export function callStand(round, walked) {
  const at = mosiAt(6);
  let { x, z, heading } = at;
  for (let i = 0; i < round; i++) {
    heading += TURN[walked[i] ?? 'ahead'];
    const [dx, dz] = way(heading);
    x += dx * CALL.reach;
    z += dz * CALL.reach;
  }
  return round === 0 ? at : { x, z, heading };
}
/** The point `distance` m from `stand` the way `direction` is from his heading. */
const toward = (stand, direction, distance) => {
  const [dx, dz] = way(stand.heading + TURN[direction]);
  return [stand.x + dx * distance, stand.z + dz * distance];
};
/** Where the fog glows when she answers from `direction`: [x, y, z], `glow` m from him, over him. */
export function directionPoint(stand, direction, ground = BELT_GROUND) {
  return up(toward(stand, direction, CALL.glow), ground + GLOW_UP);
}
/** Where she stands when she answers from `direction` in round `round`: [x, z]. */
export function herAt(stand, direction, round) {
  return toward(stand, direction, CALL.her[round]);
}
/** The call's camera: still, 9 m behind Mosi, 3.2 m up, on his heading; the three ways a third of the frame each. */
export function callShot(stand, ground = BELT_GROUND) {
  const [dx, dz] = way(stand.heading);
  return {
    position: [stand.x - dx * 9, ground + 3.2, stand.z - dz * 9],
    target: [stand.x + dx * 14, ground + 4.5, stand.z + dz * 14],
    fov: 54,
  };
}

// ---------------------------------------------------------------------------------------------
// The meeting (scenes 6 and 7, on the belt): where the third walk leaves him (callStand(3, walked)), she steps out of the fog and
// stops over them, her root HER_STOP m ahead of his, facing him: her snout over his. Its shots are made in his frame there, all
// looking along his heading or within 50 degrees of it (the sun is behind them however the call went); SHOTS.sky has them for the
// walk straight on (MEET_STAND), and the chapter cuts meetShot(name, stand) for the stand the call brought him to.
const HER_STOP = 9;
/** Each meeting shot: position and target as [ahead, right, up] m from Mosi's root, in his frame; the lens. */
export const MEET = {
  // she comes out of the fog: from low behind him on his right, her whole height over him
  she_comes: { position: [-8, 4, 2.2], target: [8, 0, 3.6], fov: 50 },
  // she sniffs at Egill: close over Mosi's right shoulder, his face and her snout
  sniff_close: { position: [-2.5, 3.6, 4.4], target: [3.5, 0, 4.2], fov: 44 },
  // her roar blows the cloud away: wide and low from behind him on his left
  roar_wide: { position: [-11, -5, 2], target: [9, 0, 4.4], fov: 52 },
  // the star rises over her head: from low behind him, looking up
  star_up: { position: [-6, 2, 2], target: [8, 0, 7.5], fov: 50 },
  // she lays her head down on the ground before them
  head_down: { position: [-5, 5, 3.4], target: [5, 0, 1.6], fov: 48 },
  // from her head when she has turned the way he faced and risen: behind Egill, the way ahead under them
  on_her_head: { position: [HER_STOP - 0.5, 0, 7], target: [HER_STOP + 30, 0, 4], fov: 50 },
  // she marches on up, Mosi running on her right: from low beside them, behind
  climb_side: { position: [1, -4, 2.5], target: [12, 2.5, 3.5], fov: 50 },
};
/** Who stands where in each meeting shot, Mosi at `stand`: { who: { at, heading } | { on } }. */
export function meetOf(stand, ground = BELT_GROUND) {
  const [fx, fz] = way(stand.heading);
  const ahead = (a, right = 0) => [stand.x + fx * a - fz * right, stand.z + fz * a + fx * right];
  const mosi = { at: [stand.x, stand.z], heading: stand.heading, y: ground };
  const her = { at: ahead(HER_STOP), heading: stand.heading + 180, y: ground };
  const facing = { mosi, gramedla: her, egill: { on: 'mosi' } };
  const turned = { ...her, heading: stand.heading };
  return {
    she_comes: facing, sniff_close: facing, roar_wide: facing, star_up: facing, head_down: facing,
    on_her_head: { mosi, gramedla: turned, egill: { on: 'gramedla' } },
    climb_side: { mosi: { at: ahead(HER_STOP, 5), heading: stand.heading, y: ground }, gramedla: turned, egill: { on: 'gramedla' } },
  };
}
/** Meeting shot `name` for Mosi at `stand` on `ground`. */
export function meetShot(name, stand, ground = BELT_GROUND) {
  const [fx, fz] = way(stand.heading);
  const at = ([a, right, y]) => [stand.x + fx * a - fz * right, ground + y, stand.z + fz * a + fx * right];
  const { position, target, fov } = MEET[name];
  return { position: at(position), target: at(target), fov };
}
export const MEET_STAND = callStand(3, []);

// ---------------------------------------------------------------------------------------------
// The top (scene 7, its end): she comes up over its south-west edge with Egill on her head and walks in toward its middle, Mosi
// on her right.
export const TOP = { her: { at: [-22, 30], heading: -54 }, mosi: { at: [-18, 33.5], heading: -54 } };

// ---------------------------------------------------------------------------------------------
/** The shots of each place: a position and a target in metres ([x, y, z]) and a lens. */
export const SHOTS = {
  ardalur: {
    // Scene 1: the pool as chapter 5 leaves it, everyone turned to the west (kafli5-pool.js west_listen)
    pool_west: { ...POOL_SHOTS.west_listen },
    // Scene 1: the farewell and Egill into the saddle: from the north-east bank, across the pool, Slóeðla out in it on the right,
    // and Mosi, Egill and Flugeðla on its south-east bank on the left
    pool_saddle: { position: [-920.64, FAR_POOL.level + 3.4, 49.28], target: [-945, FAR_POOL.level + 2, 78.3], fov: 54 },
    // Scene 2: he comes to the ford: from over the water upstream, looking down the river at him on the north bank, the stones in
    // front of him and the lip of the falls beyond
    ford_arrive: { position: up(fordPoint(6, 7), LEVEL + 2.6), target: up(fordPoint(-0.5, -1), LEVEL + 2.4), fov: 50 },
    // Scene 2: on the middle stone they look down the falls: from upstream of them, over the lip and down the gorge
    falls_look: { position: up(fordPoint(3.6 * (FALLS_LOOK + 1) + 2.5, 7), LEVEL + 3.4), target: up([river.at(river.falls - 60).x, river.at(river.falls - 60).z], LEVEL - 12), fov: 50 },
    // Scene 2: over: from the south bank upstream of him, looking back over the river
    ford_across: { position: up(fordPoint(2 * BANK + 7, 5), LEVEL + 3.2), target: up(fordPoint(2 * BANK - 1, -1), LEVEL + 2.4), fov: 50 },
  },
  hlid: {
    // the ride up: from beside the path, below it on his left, looking up at him on the slope
    slope_ride: { position: [-2404, 232.7, 164], target: up(SLOPE.ride.at, SLOPE.ride.ground + 2.4), fov: 50 },
    // the view east: behind them on the ledge, over their shoulders to the whole forest in the low sun
    view_east: { position: [-2396, 241.3, 129], target: [-1500, 120, 100], fov: 50 },
    // the clouds over them: from the shelf's east end, a little below them, looking up past them to the mountain and its cloud
    clouds_up: { position: [-2368, 236.6, 120], target: [-2458, 268, 160], fov: 52 },
  },
  sky: {
    // he steps into the first print and looks down: close and low beside it, his front feet in its heel and his head over it
    print_first: printShot(0),
    ...Object.fromEntries(Object.keys(MEET).map(name => [name, meetShot(name, MEET_STAND)])),
  },
  toppur: {
    // up out of the last cloud: from on the top ahead of her, looking back at her and the sea of cloud behind her
    above_clouds: { position: [-11, 4.6, 16], target: [-24, 3.4, 33], fov: 50 },
    // the top, wide and green under the big sky: from its far side, looking across at them
    top_wide: { position: [24, 5, -14], target: [-16, 3, 26], fov: 50 },
  },
};

/** Who each shot is for: in its frame while the camera holds it (tests/kafli6-route.test.mjs). */
export const SHOWS = {
  pool_west: ['egill', 'mosi'],
  pool_saddle: ['egill', 'mosi', 'flugedla', 'sloedla'],
  ford_arrive: ['mosi', 'egill'],
  falls_look: ['mosi', 'egill'],
  ford_across: ['mosi', 'egill'],
  slope_ride: ['mosi', 'egill'],
  view_east: ['mosi', 'egill'],
  clouds_up: ['mosi', 'egill'],
  print_first: ['mosi', 'egill'],
  she_comes: ['mosi', 'gramedla'],
  sniff_close: ['egill', 'gramedla'],
  roar_wide: ['gramedla', 'mosi'],
  star_up: ['gramedla'],
  head_down: ['gramedla', 'mosi'],
  on_her_head: ['egill'],
  climb_side: ['gramedla', 'mosi'],
  above_clouds: ['gramedla', 'egill'],
  top_wide: ['gramedla', 'mosi'],
};

/**
 * Where everyone stands while each shot holds: { who: { at: [x, z], heading, y } } (y: what is under his feet, when not the
 * ground or the water), or { on: 'mosi' | 'gramedla' } for Egill riding.
 */
const riding = { egill: { on: 'mosi' } };
const atLedge = heading => ({ mosi: { at: SLOPE.ledge.at, heading }, ...riding });
const firstPrint = mosiAt(0);
export const STANDS = {
  pool_west: { egill: { at: SPOTS.egill }, mosi: { at: SPOTS.mosi } },
  pool_saddle: { egill: { at: SPOTS.egill }, mosi: { at: SPOTS.mosi }, flugedla: { at: SPOTS.flugedla }, sloedla: { at: WADE.at } },
  ford_arrive: { mosi: { at: FORD.from, heading: OVER }, ...riding },
  falls_look: { mosi: { at: rightOf(FALLS_LOOK), heading: OVER, y: LEVEL + STONE.right.up }, ...riding },
  ford_across: { mosi: { at: FORD.to, heading: OVER }, ...riding },
  slope_ride: { mosi: SLOPE.ride, ...riding },
  view_east: atLedge(0),
  clouds_up: atLedge(150),
  print_first: { mosi: { at: [firstPrint.x, firstPrint.z], heading: firstPrint.heading }, ...riding },
  ...meetOf(MEET_STAND),
  above_clouds: { gramedla: TOP.her, mosi: TOP.mosi, egill: { on: 'gramedla' } },
  top_wide: { gramedla: TOP.her, mosi: TOP.mosi, egill: { on: 'gramedla' } },
};

// ---------------------------------------------------------------------------------------------
// Chapter 6's own lines of sight in Árdalurinn, kept clear of plants as chapter 5's are (kafli5-place.js buildPool's `views`), and
// its ground where nothing grows: where he stands on either bank of the ford, and the cameras on the banks.
const seenFrom = (shot, name) => ({ shot: name, position: shot.position, looks: [shot.target] });
const stoneLooks = k => STEPS[k].stones.map(s => up(s.at, LEVEL + 0.4));
export const ARDALUR_VIEWS = [
  { shot: 'pool_saddle', position: SHOTS.ardalur.pool_saddle.position, looks: [up(SPOTS.egill, FAR_POOL.level + 1.5), up(SPOTS.mosi, FAR_POOL.level + 3.5), up(WADE.at, FAR_POOL.level + 3)] },
  ...['ford_arrive', 'falls_look', 'ford_across'].map(name => {
    const shot = SHOTS.ardalur[name];
    const mosi = STANDS[name].mosi;
    return { ...seenFrom(shot, name), looks: [shot.target, up(mosi.at, (mosi.y ?? LEVEL + 0.5) + 3)] };
  }),
  ...STEPS.map((_, k) => ({ shot: `step_${k}`, position: stepShot(k).position, looks: [...stoneLooks(k), up(standBefore(k).at, LEVEL + 3.5)] })),
];
export const ARDALUR_KEEP = [
  { x: FORD.from[0], z: FORD.from[1], r: 3.5 },
  { x: FORD.to[0], z: FORD.to[1], r: 3.5 },
  ...['pool_saddle', 'ford_across'].map(name => ({ x: SHOTS.ardalur[name].position[0], z: SHOTS.ardalur[name].position[2], r: 2.5 })),
];
