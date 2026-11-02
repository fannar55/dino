// Chapter 4's flight route (docs/superpowers/specs/2026-11-01-kafli-4-bod-til-flugedlu-design.md, sections 3 and 5): where Flugeðla flies
// with Egill on her back, and when. Árdalurinn, the river valley, has its own coordinates, in metres at real size: the white snag stands
// at the origin with its top 10.5 m up, north is -Z and east +X, as in the Fen. From the snag she leaps toward the south-south-west, glides
// over the Fen and joins the river, flies west up it, low over the water, through the gorge, up the 40 m waterfall at its end, turns
// in a wide arc over the land above it and glides east and down to the far pool, which lies north of the river below the gorge.
//
//   const route = createRoute();
//   route.pointAt(route.progressAt(t))   where her body (her hips) is t seconds into the flight
//
// The curve is a centripetal Catmull–Rom through the hand-placed points of POINTS (her body's path, not her feet's: the flier puts her
// root under it, engine/flier.js). The schedule says when she is where: KEYS pins named points to times, and between them the distance
// flown follows a cubic Hermite in time with the speed given at each key, so the big moments (the beats of the spec, A to G) come on
// their second whatever the curve's exact length, and the speed changes smoothly. Everything is a pure function of the flight's own
// time, so the game clock can pause it, seek it and test it.
import * as THREE from 'three';

/** When each beat begins, in seconds from the flight's start (spec section 5), and when the flight ends over the far pool. */
export const BEATS = { A: 0, B: 15, C: 35, D: 80, E: 105, F: 125, G: 150, END: 170 };
/** The last second a „Hraðar!“ burst may start (engine/flier.js): the time it borrows is paid back before the falls (E). */
export const FASTER_LAST = 98;
/** When she leaps off the snag: the close-up of Egill holding on comes first (spec 5A), she sits still till then. */
export const LEAP = 3.5;
/** The white snag: its foot at the origin, its top (where she perches) 10.5 m up. */
export const TREE = [0, 10.5, 0];
/** How high her body (hips) rides over her feet when she flies, at the 7.5 m size (pteranodon.glb's fly and glide clips). */
export const BODY_HEIGHT = 2.6;

// ---------------------------------------------------------------------------------------------
// The river, downstream (east, near the Fen) to upstream (west, above the falls): [x, z, water level, half width]. The levels climb
// gently through the lazy reach and faster through the rapids and the gorge; the falls drop 40 m from their lip to the plunge pool.
export const RIVER = [
  [60, 196, 0, 13],
  [-20, 178, 0, 13],
  [-110, 160, 0.2, 12], // where she joins it, coming over the Fen
  [-210, 176, 0.5, 12],
  [-310, 160, 0.9, 11],
  [-410, 136, 1.3, 11],
  [-510, 146, 1.8, 10],
  [-610, 170, 2.4, 9], // the rapids begin
  [-710, 165, 3.1, 9],
  [-810, 141, 3.9, 8],
  [-900, 136, 4.7, 8],
  [-990, 150, 5.6, 7], // the gorge begins
  [-1090, 165, 6.6, 7],
  [-1190, 150, 7.6, 7],
  [-1280, 131, 8.6, 8],
  [-1322, 127, 10, 16], // the plunge pool at the foot of the falls
  [-1347, 126, 50, 9], // the lip of the falls
  [-1430, 122, 50.4, 9],
  [-1530, 104, 50.8, 10],
  [-1680, 80, 51.5, 11],
];
/** The falls: the cliff's face stands at `face` (x), the water falls from `top` to `base` over `width` metres. */
export const FALLS = { x: -1345, z: 126, face: -1345, top: 50, base: 10, width: 16 };
/** Where the gorge's walls rise and end, as distances along the river from where she joins it (RIVER[2]). */
export const GORGE = { from: 890, to: 1225, wall: [30, 45] };
/** The far pool, north of the river below the gorge, where she lands (scene 7) and chapter 5 begins. */
export const POOL = { center: [-952, 70], radius: 26, level: 5.4 };

// ---------------------------------------------------------------------------------------------
// The far pool as a place: scene 7 (kafli4.js) lands her there, and chapter 5 begins there. Its spots are [x, z], each a way round the
// pool's middle (degrees from +X toward +Z) and a distance from it. The early afternoon sun (heading 215) shines from the north-west,
// so they gather on the south-east bank and look across the pool, the sun on their faces, to the reed the horn comes from; each shot
// has the sun behind it. Its shallows are 0.2 to 1.2 m deep (world/ardalur/terrain.js: the basin), a ring of reed grows round it, and
// two beds of reed of its own (world/ardalur/river.js: poolPlants): the one Mosi comes out of, and the far one Slóeðla blows from.
const around = (angle, distance) => [
  POOL.center[0] + distance * Math.cos((angle * Math.PI) / 180),
  POOL.center[1] + distance * Math.sin((angle * Math.PI) / 180),
];
const up = ([x, z], y) => [x, y, z];
const POOL_SPOTS = {
  landing: around(62, 23.5), // her feet in the shallows, in 0.65 m of water
  bank: around(50, 27.2), // where Egill floats down to, on the bank 6.5 m from her
  mosi: around(45, 30), // where Mosi stops, by Egill, to look across the pool
  reed: around(46.4, 35.4), // the reed behind them he comes out of, out of breath, walking straight on to his spot
  farReed: around(240, 31), // the reed across the pool, where the horn sounds (Slóeðla, unseen)
};
export const FAR_POOL = {
  center: [...POOL.center], radius: POOL.radius, level: POOL.level,
  ...POOL_SPOTS,
  facing: 5, // the way she faces in the shallows (degrees): along the bank, toward Egill's spot
  // the beds of reed: `count` plants within `radius` of `at`, a tall horsetail in every `tallEvery` (3 if not given); Mosi's has his way
  // out of it (`lane`: from, to, half its width) clear. The far one is thick and tall: something could hide in it.
  reeds: [
    { at: around(47, 36.2), radius: 4.2, count: 16, lane: { from: around(46.6, 39.6), to: POOL_SPOTS.mosi, wide: 1.8 } },
    { at: POOL_SPOTS.farReed, radius: 7, count: 64, tallEvery: 2 },
  ],
  // where no other plant grows: Mosi's way out (from behind the reed to his spot), Egill's spot, and where the cameras stand
  keep: [
    { from: around(46.6, 39.6), to: POOL_SPOTS.mosi, r: 2.4 },
    { at: POOL_SPOTS.bank, r: 2.2 },
    { at: around(130, 30), r: 3.5 },
    { at: around(44.6, 16.5), r: 2 },
  ],
  // The glide in (scene 7): a camera on the north-west bank turns to follow her as she comes in over the water, left to right
  glide: { position: up(around(130, 30), 7.4), fov: 40 },
  shots: {
    // She stands in the shallows at the right, Egill floats down onto the bank in the middle, and Mosi comes out of the reed behind
    // him: from low over the water, 11 m out from the pool's middle.
    pool_bank: { position: up(around(52, 11.4), 7.0), target: up(around(49, 27.2), 6.5), fov: 46 },
    // The reed across the pool, where the horn comes from: from over the water on the pool's west side, the sun off to the right.
    pool_reed: { position: up(around(186.3, 18.1), 6.9), target: up(POOL_SPOTS.farReed, 6.8), fov: 36 },
    // Egill and Mosi, from in front of them over the shallows, as they look across the pool past us: the horn, and their lines. Far
    // enough out that Mosi's head, reaching toward us, stays in the picture.
    pool_horn: { position: up(around(44.6, 16.5), 6.8), target: up(around(46.8, 26.6), 7.4), fov: 44 },
  },
};

// ---------------------------------------------------------------------------------------------
// Her path: [name, x, y, z]. A name marks a point the schedule (KEYS) pins to a time, or that a shot or a test refers to.
const body = (x, level, alt, z) => [x, level + alt, z];
export const POINTS = [
  // A: perched on the snag, facing south-south-west; the leap, the moment's fall, the wings out, the glide over the Fen
  ['perch', 0, TREE[1] + BODY_HEIGHT, 0],
  [null, -1.6, 12.6, 3.2],
  ['fall', -5, 10.2, 10.5],
  [null, -10.5, 7.6, 21],
  [null, -18, 6.4, 36],
  [null, -28, 5.8, 56],
  [null, -40, 5.2, 80],
  // B: low over the Fen's reeds, curving west onto the river, levelling just over the water
  ['B', -54, 4.2, 104],
  [null, -72, 3.4, 128],
  ['onRiver', ...body(-104, 0.2, 2.6, 156)],
  [null, ...body(-160, 0.35, 2.5, 170)],
  [null, ...body(-210, 0.5, 2.5, 175)],
  [null, ...body(-260, 0.7, 2.5, 169)],
  ['C', ...body(-310, 0.9, 2.5, 160)],
  // C: up the river, past the animals on the banks
  [null, ...body(-360, 1.1, 2.5, 148)],
  [null, ...body(-410, 1.3, 2.5, 137)],
  [null, ...body(-460, 1.55, 2.5, 140)],
  [null, ...body(-510, 1.8, 2.5, 146)],
  [null, ...body(-560, 2.1, 2.5, 158)],
  [null, ...body(-610, 2.4, 2.5, 169)],
  [null, ...body(-660, 2.75, 2.6, 168)],
  [null, ...body(-710, 3.1, 2.6, 165)],
  [null, ...body(-760, 3.5, 2.7, 153)],
  [null, ...body(-810, 3.9, 2.8, 141)],
  [null, ...body(-855, 4.3, 2.8, 138)],
  [null, ...body(-900, 4.7, 2.9, 137)],
  [null, ...body(-945, 5.15, 3.3, 142)],
  ['D', ...body(-990, 5.6, 4.0, 150)],
  // D: the gorge, its walls rising on both sides, 4 to 6 m over the rapids
  [null, ...body(-1040, 6.1, 4.6, 158)],
  [null, ...body(-1090, 6.6, 5.0, 165)],
  [null, ...body(-1140, 7.1, 5.0, 159)],
  [null, ...body(-1190, 7.6, 5.0, 150)],
  [null, ...body(-1235, 8.1, 5.0, 140)],
  ['E', ...body(-1270, 8.5, 5.0, 132)],
  // E: across the plunge pool, straight at the falls, up along the falling water 3 m clear of it, over the lip and out of the spray
  [null, -1296, 14.6, 128.5],
  ['climb', -1318, 16, 127],
  [null, -1332, 22, 126.5],
  [null, -1338.5, 32, 126.2],
  [null, -1340.5, 43, 126],
  ['lip', -1342, 54.5, 126],
  [null, -1350, 61, 125.6],
  ['burst', -1366, 65.5, 124.8],
  [null, -1388, 69, 124],
  [null, -1414, 72, 123],
  ['F', -1440, 74, 122],
  // F: an arc to the right (30 m round) over the land above the falls, from heading west round through north to east, then east
  [null, -1461, 74.6, 113.2],
  [null, -1470, 75, 92],
  [null, -1461, 75, 70.8],
  [null, -1440, 74.6, 62],
  [null, -1412, 74.2, 59],
  [null, -1380, 73.8, 57.5],
  [null, -1346, 73.4, 57],
  [null, -1310, 73, 57],
  [null, -1272, 72.6, 57.5],
  ['G', -1236, 72, 58],
  // G: east, gliding down past the gorge's north rim to the far pool
  [null, -1196, 64.5, 59.5],
  [null, -1154, 54, 61.5],
  [null, -1112, 42.5, 63.5],
  [null, -1072, 31, 65.5],
  [null, -1036, 21, 67.5],
  [null, -1004, 13.5, 69],
  [null, -980, 9.6, 70],
  ['end', -962, POOL.level + 3.0, 70],
];

// The schedule: [time, point name, speed in m/s there]. Speeds follow the plan: 14 in B, 16 in C, 14 in D, about 10 for the climb
// in E, slower in the arc of F, 10 to 16 in G (it glides fast while it is high and slows over the pool).
export const KEYS = [
  [0, 'perch', 0],
  [LEAP, 'perch', 6],
  [5.2, 'fall', 9.5],
  [BEATS.B, 'B', 13.5],
  [20.4, 'onRiver', 14],
  [BEATS.C, 'C', 15.2],
  [BEATS.D, 'D', 12.8],
  [BEATS.E, 'E', 11],
  [109.6, 'climb', 8],
  [115.6, 'lip', 7.5],
  [119.0, 'burst', 9],
  [BEATS.F, 'F', 11.5],
  [BEATS.G, 'G', 13.5],
  [BEATS.END, 'end', 9],
];

/** The animal groups along C, in the order she meets them (spec 5C), each on its bank: [kind, river distance, side (+1 north), out]. */
const GROUPS = [
  ['frogs', 'frogs', 300, 1, 2], // on the lilies
  ['snails', 'snails', 420, -1, 3], // on a log
  ['dragonflies', 'dragonflies', 545, 1, -3], // over the water
  ['turtle', 'turtle', 690, -1, 1.5], // on a stone
  ['lizards', 'lizards', 805, 1, 3], // drinking at the edge
];

// ---------------------------------------------------------------------------------------------

const V3 = THREE.Vector3;
const lerp = (a, b, k) => a + (b - a) * k;

/** The river as a polyline with its distances (from where she joins it, RIVER[2]): { points, at(d), nearest(x, z) }. */
function makeRiver() {
  const pts = RIVER.map(([x, z, level, half]) => ({ x, z, level, half }));
  let d = 0;
  pts.forEach((p, i) => {
    if (i > 0) d += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    p.d = d;
  });
  const zero = pts[2].d;
  for (const p of pts) p.d -= zero;
  const falls = pts.findIndex(p => p.level >= FALLS.top - 1e-6);
  /** Where the river is `d` metres up from where she joins it: { x, z, level, half, dir: [dx, dz] }. */
  function at(d) {
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1].d < d) i++;
    const a = pts[i];
    const b = pts[i + 1];
    const k = Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d || 1)));
    // the falls are a step, not a slope: below the lip the pool's level, above it the upper river's
    const level = i + 1 === falls ? (k < 1 ? a.level : b.level) : lerp(a.level, b.level, k);
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), level, half: lerp(a.half, b.half, k), dir: [(b.x - a.x) / len, (b.z - a.z) / len], d };
  }
  /** The river's point nearest (x, z): its distance along the river, and how far off to the side (+ north of it, to its right going upstream). */
  function nearest(x, z) {
    let best = { dist: Infinity, d: 0, side: 0 };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len2 = ex * ex + ez * ez || 1;
      const k = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / len2));
      const px = a.x + ex * k;
      const pz = a.z + ez * k;
      const dist = Math.hypot(x - px, z - pz);
      if (dist < best.dist) {
        const len = Math.sqrt(len2);
        // going upstream (west) the right hand is north; seen from above with east to the right and south down, a point on the right
        // of the way upstream has a positive cross product
        const cross = (ex * (z - a.z) - ez * (x - a.x)) / len;
        best = { dist, d: a.d + k * len, side: Math.sign(cross) || 1, along: k };
      }
    }
    return best;
  }
  return { points: pts, at, nearest, length: pts.at(-1).d, falls: pts[falls].d };
}

/**
 * The flight's route. `wingspan` is her size (7.5 m or the 10 m the owner may pick): her body rides higher over her feet at the larger
 * size, which the flier takes care of; the path of her body is the same.
 */
export function createRoute({ wingspan = 7.5 } = {}) {
  const river = makeRiver();
  const controls = POINTS.map(([, x, y, z]) => new V3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(controls, false, 'centripetal');
  // Arc lengths at each control point: lengths at t = i / (n - 1) of the curve's own (not arc-length) parameter.
  const PER = 40;
  const divisions = (controls.length - 1) * PER;
  curve.arcLengthDivisions = divisions;
  const lengths = curve.getLengths(divisions);
  const length = lengths[divisions];
  const named = new Map(POINTS.map(([name], i) => [name, i]).filter(([name]) => name));
  const sOf = name => {
    if (!named.has(name)) throw new Error(`No route point named "${name}"`);
    return lengths[named.get(name) * PER];
  };

  // The schedule: distance flown at each key, and a cubic Hermite in time between keys.
  const keys = KEYS.map(([t, name, v]) => ({ t, s: sOf(name), v }));
  function distanceAt(t) {
    if (t <= keys[0].t) return keys[0].s;
    if (t >= keys.at(-1).t) return keys.at(-1).s;
    let i = 0;
    while (keys[i + 1].t < t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const h = b.t - a.t;
    const x = (t - a.t) / h;
    const x2 = x * x;
    const x3 = x2 * x;
    return (2 * x3 - 3 * x2 + 1) * a.s + (x3 - 2 * x2 + x) * h * a.v + (-2 * x3 + 3 * x2) * b.s + (x3 - x2) * h * b.v;
  }
  /** Her speed along the route at flight time t (m/s), from the schedule. */
  function speedAt(t) {
    const e = 1e-3;
    return (distanceAt(Math.min(BEATS.END, t + e)) - distanceAt(Math.max(0, t - e))) / (Math.min(BEATS.END, t + e) - Math.max(0, t - e));
  }
  const progressAt = t => Math.min(1, Math.max(0, distanceAt(t) / length));
  const pointAt = (u, out = new V3()) => out.copy(curve.getPointAt(Math.min(1, Math.max(0, u))));
  const tangentAt = (u, out = new V3()) => out.copy(curve.getTangentAt(Math.min(1, Math.max(0, u))));
  const uOf = name => sOf(name) / length;

  // Samples for nearestU and riverLevelAt: every metre or so along the curve.
  const SAMPLES = Math.ceil(length);
  const samples = curve.getSpacedPoints(SAMPLES);
  /** The progress (0..1) of the route point nearest `point` (a Vector3, or [x, y, z]). */
  function nearestU(point) {
    const p = Array.isArray(point) ? new V3(...point) : point;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = samples[i].distanceToSquared(p);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best / SAMPLES;
  }
  /**
   * The water under the route `s` metres along it: the river's level where the route is over it (within its half width plus `margin`),
   * the far pool's over the pool, else null (over the Fen, the land, the climb up the falls).
   */
  function riverLevelAt(s, margin = 0) {
    const p = pointAt(s / length);
    return waterAt(p.x, p.z, margin);
  }
  function waterAt(x, z, margin = 0) {
    if (Math.hypot(x - POOL.center[0], z - POOL.center[1]) < POOL.radius + margin) return POOL.level;
    const near = river.nearest(x, z);
    const here = river.at(near.d);
    if (near.dist > here.half + margin) return null;
    return here.level;
  }
  /** Which beat flight time t is in: 'A' .. 'G'. */
  function beatAt(t) {
    let beat = 'A';
    for (const [name, at] of Object.entries(BEATS)) if (name !== 'END' && t >= at) beat = name;
    return beat;
  }

  // Steering lanes (spec 6): where a finger may move her up to 4 m aside, as progress: B and C, and the first half of D.
  const lanes = [{ from: progressAt(BEATS.B + 1), to: progressAt((BEATS.D + BEATS.E) / 2 - 0.5), half: 4 }];
  // The animal groups on the banks of C.
  const groups = GROUPS.map(([id, kind, d, side, out]) => {
    const r = river.at(d);
    const nx = -r.dir[1] * side; // across the river, toward `side`
    const nz = r.dir[0] * side;
    const off = r.half + out;
    const at = [r.x + nx * off, r.level + (kind === 'dragonflies' ? 1.2 : 0.1), r.z + nz * off];
    return { id, kind, at, u: nearestU(at), side };
  });
  // Mosi's two cameos (spec 5C and 5D): running along the bank in the shallows, and up on the gorge's north rim.
  const bank = (() => {
    const d0 = 585;
    const path = [0, 8, 16, 24, 32].map(k => {
      const r = river.at(d0 + k);
      const off = r.half - 1.5; // in the shallows on the south side, splashing
      return [r.x + r.dir[1] * off, r.z - r.dir[0] * off];
    });
    const r = river.at(d0);
    return { at: [path[0][0], r.level, path[0][1]], path };
  })();
  const rim = (() => {
    const d0 = 1100;
    const r = river.at(d0);
    const off = r.half + 16; // on the north rim, back from the edge
    const path = [0, 6, 12, 18].map(k => {
      const q = river.at(d0 - k); // he runs downstream: back toward the pool, the shorter way
      return [q.x - q.dir[1] * off, q.z + q.dir[0] * off];
    });
    return { at: [path[0][0], r.level + GORGE.wall[0] + 4, path[0][1]], path };
  })();

  return {
    curve, length, wingspan, river, falls: FALLS, gorge: GORGE,
    keys, lengths, controls, named: Object.fromEntries([...named].map(([name, i]) => [name, { index: i, s: lengths[i * PER], u: lengths[i * PER] / length }])),
    distanceAt, speedAt, progressAt, pointAt, tangentAt, nearestU, riverLevelAt, waterAt, beatAt, uOf,
    lanes, groups, cameos: { bank, rim },
    tree: [...TREE],
    // the far pool, with what grows in it and round it (world/ardalur/river.js: poolPlants)
    pool: { center: [...POOL.center], radius: POOL.radius, level: POOL.level, reeds: FAR_POOL.reeds, keep: FAR_POOL.keep },
  };
}
