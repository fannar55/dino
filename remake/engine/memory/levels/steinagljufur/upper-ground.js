/**
 * The ground of the upper gorge, beyond the tunnel (levels/steinagljufur.js steps `through`, `reach`, `fly` and `climb`), in its own frame, as plain numbers (no three.js, so a test
 * or a tool can read it): x runs forward along the gorge, z to the right of someone who looks along it (the side of the hillside: the open side, where the cameras stand and the ground falls away, is -z), y is up.
 *
 *   the exit floor     the floor at y = 0 in front of the exit of the tunnel (x -18 to 3): the group comes out of the tunnel here
 *   the high ledge     a step up (LEDGE.height, too high to walk up): the terrace at y = 1.9 from x = 3
 *   the steep path     the way up the cliff, three bends, from the terrace (x 9) to the rim (x 26): CLIMB.length metres, 7 metres up
 *   the clifftop       the rim: a wide flat (y 8.9) with the tree at its near edge and the dead trunk at its far edge, on the lip of the gap
 *   the gap            a sheer cleft across the clifftop (Task 6), from the open side to the foot of the hillside, 3.2 metres across: the trunk falls over it
 *   Sólarsyllan        the broad ledge beyond the gap, level with the rim (Task 7 stands all nine on it)
 *
 * The ground is the highest of many "mesas": a capsule along a segment (a flat top at the heights of its ends, `hw` metres either side of the segment) whose sides fall away at
 * `slope` metres of height to the metre of distance, down to the level of the plain (0). The ledge, the path and the clifftop are mesas; the hillside beside them is the same with a
 * high top and steep sides. Everything about the shape is told here; upper.js stands the models on it and builds its mesh.
 */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const LEDGE = Object.freeze({ x: 3.0, height: 1.9 });
/** The path up the cliff, from where it leaves the terrace to the rim: [x, z, y]. The group walks it, the rope runs along its left side. */
export const CLIMB = Object.freeze([[9.5, -1.4, 1.9], [13.2, -.4, 3.2], [16.4, 2.2, 4.7], [18.6, 5.6, 6.2], [21.8, 7.6, 7.5], [25.2, 8.3, 8.9]]);
/** The rim: the flat top of the cliff (y), and its middle line from where the path comes up to where Task 6's gap will be. */
export const RIM = Object.freeze({ y: 8.9, from: [31.4, 7.4], to: [38, 6.2], hw: 6.2 });
/** Task 6's gap: its two lips (x), how steeply its walls fall (metres of height to the metre: a sheer face) and its floor. Its back is the hillside's face going on down. */
export const GAP = Object.freeze({ near: 41.3, far: 44.5, steep: 14, floor: 0 });
/** Sólarsyllan: the broad ledge beyond the gap, at the rim's height; its middle line, and how far it reaches either side of it (its flat runs from the gap to the end wall). */
export const SUN = Object.freeze({ y: 8.9, from: [46, 6.5], to: [55, 6.5], hw: 6.2 });
/** The tree stands on the rim at the near edge: a little flat of its own where the path ends (the rim's round end must not reach back over the path). */
export const TREE_AT = Object.freeze([23.4, 12.1]);
const PATH_HW = 2.25;

const lengths = points => points.map((p, i) => i ? Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0);
export const CLIMB_LENGTH = lengths(CLIMB).reduce((a, b) => a + b, 0);

// A mesa: [ax, az, bx, bz, ya, yb, hw, slope]
const MESAS = [];
const mesa = (a, b, ya, yb, hw, slope) => MESAS.push([a[0], a[1], b[0], b[1], ya, yb, hw, slope]);
// the terrace (the ledge's top): its front edge, x = LEDGE.x, runs straight across the gorge
mesa([LEDGE.x + 3.6, -7.5], [LEDGE.x + 3.6, 6], LEDGE.height, LEDGE.height, 3.6, 3.2);
// the steep path is not a mesa of its own for each leg (the round end of one would stand at the other's height): it is one ground, the nearest leg's (pathHeight below), its sides
// falling to the plain, the hillside rising on its right (+z)
const PATH_SLOPE = 1.15;
// the clifftop, and the flat round the tree
mesa(RIM.from, RIM.to, RIM.y, RIM.y, RIM.hw, 1.1);
// (the rim runs on at its full width to the gap's lip, and Sólarsyllan beyond it: the gap is cut through both, groundAt below)
mesa(RIM.to, [GAP.near + 1.5, 6.4], RIM.y, RIM.y, RIM.hw, 1.1);
mesa(SUN.from, SUN.to, SUN.y, SUN.y, SUN.hw, 1.1);
mesa(TREE_AT, TREE_AT, RIM.y, RIM.y, 3, 1.1);
// the hillside beside the whole way (+z): a long wall whose foot meets the path's edge all the way up (wall.centre is where its centre line runs), as high as the rim plus
// 3.3 metres. The path is cut into its foot.
export const WALL = Object.freeze({ top: 12.2, hw: 7, slope: 2.3, centre: Object.freeze([[-46, 16.6], [1.5, 16.6], [4.2, 21], [9.2, 21], [11.4, 13.4], [13.2, 12.75], [16.4, 14.7], [18.6, 17.5], [21.8, 18.9], [24, 24.8], [40, 24.8], [70, 24.8]]) });
const WALL_FROM = MESAS.length;
for (let i = 1; i < WALL.centre.length; i++) mesa(WALL.centre[i - 1], WALL.centre[i], WALL.top, WALL.top, WALL.hw, WALL.slope);
const WALL_TO = MESAS.length;
/** The path is cut into the hillside: from the edge of the way the bank rises this many metres to the metre (the wall's own foot, cut straight down at the way's edge, was a sheer face of several metres). */
const BANK = 1.4;
// the end wall beyond Sólarsyllan (it stood beyond the rim until Task 6 cut the gap there)
export const END_X = SUN.to[0] + 11;
mesa([END_X, RIM.to[1] - 11], [END_X, RIM.to[1] + 13], RIM.y + 3.6, RIM.y + 3.6, 4, 2.4);
export const MESA_COUNT = MESAS.length;
/** (for tests and tools) the mesas: [ax, az, bx, bz, ya, yb, hw, slope]. */
export const MESA_LIST = Object.freeze(MESAS.map(m => Object.freeze([...m])));

/** The path's ground at (x, z): { d: how far the point is from the path's middle line, top: the height of the nearest leg of CLIMB at its nearest point (the ramp is exact along the way) }.
 * Where two legs meet at a bend their heights are blended over the last BEND_BLEND metres of distance: on a bend's inside the two nearest points lie apart along the way,
 * and taking the nearest leg's alone made a step of up to 15 cm across the path there, which the friends' toes walked into (veggir). For the blend a leg's height runs on
 * past its ends (along its own slope), except at the path's two ends. */
const BEND_BLEND = .6;
function pathInfo(x, z) {
  let best = Infinity, sum = 0, weight = 0;
  const legs = [];
  for (let i = 1; i < CLIMB.length; i++) {
    const [ax, az, ya] = CLIMB[i - 1], [bx, bz, yb] = CLIMB[i], dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz, along = ((x - ax) * dx + (z - az) * dz) / len2, t = clamp(along, 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    legs.push([d, lerp(ya, yb, clamp(along, i === 1 ? 0 : -Infinity, i === CLIMB.length - 1 ? 1 : Infinity))]); if (d < best) best = d;
  }
  for (const [d, y] of legs) { const w = Math.max(0, 1 - (d - best) / BEND_BLEND); sum += w * y; weight += w; }
  return { d: best, top: sum / weight };
}

/** The height of the ground at (x, z) of the upper gorge. */
export function groundAt(x, z) {
  // The way the friends walk is the ground exactly (a path cut into the hillside: where the hillside's wall would stand on it, the path cuts the wall), and so is the flat round the tree.
  const path = pathInfo(x, z); if (path.d <= PATH_HW + .3) return path.top;
  const treeD = Math.hypot(x - TREE_AT[0], z - TREE_AT[1]); if (treeD <= 3.2) return RIM.y;
  let height = Math.max(0, path.top - PATH_SLOPE * (path.d - PATH_HW));
  const bank = path.top + BANK * Math.max(0, path.d - (PATH_HW + .3));
  for (const [k, [ax, az, bx, bz, ya, yb, hw, slope]] of MESAS.entries()) {
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz, t = len2 ? clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1) : 0;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t)), top = lerp(ya, yb, t);
    // (a flat top, a short round-off at the edge, then the straight side)
    const out = d - hw, mesaY = out <= 0 ? top : top - slope * out, y = k >= WALL_FROM && k < WALL_TO ? Math.min(mesaY, bank) : mesaY;
    if (y > height) height = y;
  }
  // (the flat round the tree meets the ground about it over a metre and a half, not in a step)
  if (treeD < 4.8) { const t = clamp((treeD - 3.2) / 1.6, 0, 1); height = lerp(RIM.y, height, t * t * (3 - 2 * t)); }
  // the gap: from either lip its walls fall GAP.steep metres to the metre, down to its floor; at its back the hillside's face goes on down to the floor
  const inside = Math.min(x - GAP.near, GAP.far - x);
  if (inside > 0) {
    const back = Math.max(GAP.floor, WALL.top - WALL.slope * (WALL.centre.at(-1)[1] - WALL.hw - z));
    height = Math.min(height, Math.max(back, RIM.y - GAP.steep * inside));
  }
  return height;
}

/** The lines of the grid upper.js lays over groundAt (and the tests read the ground as it is drawn by): 0.9 m cells, finer across the ledge's riser and the gap's lips (their faces are steep). */
export function gridLines() {
  const xs = [], zs = [];
  const lip = x => (x > GAP.near - .7 && x < GAP.near + 1) || (x > GAP.far - 1 && x < GAP.far + .7);
  for (let x = -40; x <= 74; x += x > 2 && x < 4.4 ? .1 : x > 1.4 && x < 5 ? .3 : lip(x) ? .15 : .9) xs.push(+x.toFixed(2));
  for (let z = -16; z <= 31; z += .9) zs.push(+z.toFixed(2));
  return { xs, zs };
}

/** The middle line of the way the group walks from the terrace's edge to the rim, as [x, z, y] points at every `step` metres (the path's own bends). */
export function wayPoints(step = 1) {
  const out = [], list = CLIMB;
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) { const t = k / n; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]); }
  }
  return out;
}

/** Where on the path (0 at the terrace's end, 1 at the rim) the path point nearest (x, z) lies, and how far to its right (z positive: toward the hillside) the point is. */
export function alongPath(x, z) {
  const list = CLIMB, total = CLIMB_LENGTH; let best = { s: 0, d: Infinity, side: 0 }, walked = 0;
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (len * len), 0, 1);
    const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { s: (walked + len * t) / total, d, side: ((x - px) * -dz + (z - pz) * dx) / len * -1 };
    walked += len;
  }
  return best;
}
