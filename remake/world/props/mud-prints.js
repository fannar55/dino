import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { BLOBS } from './footprints.js';
import { createWaterMaterial, RIPPLE_SLOTS } from './water.js';
import { glints, run, sparkleBurst, needEffects } from './sparkles.js';
import { FEN } from '../forest/config.js';

// Þórseðla's ten footprints in the mud of the trail (chapter 2, scene 2: the child counts them, one to ten). Each is her hind foot
// pressed into dark, wet mud: the pad and three toes of footprints.js's BLOBS, 1.0 m long and 0.7 m wide, its mud pushed up round
// it into a lip 6 to 8 cm high, light where it catches the sun, dark down the inner wall, that goes on down under the ground 30 cm
// out (so it never floats on the path, whatever the ground does); and just ahead of it the crescent of her front foot, shallower,
// as real sauropod trackways have. Water stands in the hind print 2 cm below the lowest of its lip, flat however the trail slopes,
// drawn with the Fen's own water material (water.js, its print variant): clear enough that the dark mud floor shows through it
// looking down, the sky by a fresnel looking along it, its shore drawn per pixel from the print's shape. All ten are two meshes,
// two draw calls: the mud and the water.
//
//   const prints = createMudPrints(world, { prints: layout.prints, heightAt });   // [{ position: [x, z], heading }]
//   for (const t of prints.targets) s.target(t.name, t);  // print1 .. print10: { name, point, radius: 0.6 }
//   prints.glimmer(0);       // the next to count glimmers: its water swells with light, glints rise off its rim, a soft ring
//   prints.splash(4);        // a tap: a ring in its water and a splash of drops; returns a Handle
//   prints.count(4);         // the number: a big cream digit (here 5) with a dark edge rises out of the water for 1.6 s
//   prints.done(4);          // counted: its water goes still and warm gold
//
// The digits are built in code as rounded strokes (Nunito's black weight, the game's face: round ends, an even, heavy stroke),
// each a tube with an inverted hull for its edge, so the number reads against mud, reed, mist or sky; it turns to face the
// camera as it rises. Everything runs on the game clock (world.effects and world.clock.time), so a capture lands on the same
// frame. heightAt is the place's ground (the trail's lift and all).

const SIZE = 1.3; // BLOBS at this scale: the print is 1.0 m long and 0.7 m wide, as a 22 m sauropod's hind foot is
const WATER_UP = 0.015; // m the water stands over the highest ground inside the print
const RIM_UP = 0.02; // m the lowest of the rim's crest stands over the water (it rises higher where the ground falls away)
const CREST_UP = 0.06; // m the crest stands over the ground at least: the mud the foot pushed up round it
const FLOOR_UP = 0.008; // m the floor of the print lies over the ground (under the water)
const WALL = 0.07; // m inside the edge over which the inner wall rises from the floor to the water line
const CREST = 0.05; // m outside the edge where the rim is highest
const SKIRT = 0.3; // m outside the edge where the mud has gone under the ground
const SINK = 0.025; // and how far under it goes there
const CELL = 0.065; // m: the grid each print's mud is drawn on (its water's shore is drawn per pixel, in the shader)
const WATER_FADE = 0.025; // m over which the water fades out at its edge
// The front foot's print (the manus) just ahead of each hind print, as in real sauropod trackways: a crescent, convex forward,
// shallower, with no water in it. Two ellipses in the print's frame ([x, z, rx, rz], metres): the crescent is the outer less the inner.
const MANUS = { outer: [0.84, 0, 0.16, 0.26], inner: [0.73, 0, 0.12, 0.2], floor: 0.012, edge: 0.03, crest: 0.045, wall: 0.04, skirt: 0.22 };
// dark wet mud on the floor and the inner wall (FEN.mud, darker), a lighter lip where the pushed-up crest catches the light, and the
// trail's damp path at the edge, where it goes under the ground
const MUD = { floor: '#2e241b', wall: '#3b2e22', lip: '#9a7a52', outer: '#80654a' };
const BED = '#1c1510'; // the water's own colour over its floor: the mud's, darker under the water
const DIGIT = {
  height: 0.74, // m from the bottom of its edge to the top
  stroke: 0.105, // the stroke's radius, in a digit one unit tall (from its baseline to its top, along the middle of the stroke)
  edge: 0.035, // the dark edge round it, in the same units
  depth: 0.8, // the stroke is a little flatter front to back than across
  sides: 10,
  fill: '#fff4dc',
  line: '#4a2f17',
  life: 1.6, // s from the water to gone
  rise: 0.62, // m its bottom rises out of the water
};
const GLIMMER = { every: 0.9, ring: 1.6 }; // s between the glints off the next print's rim, and between its soft rings

const smooth = t => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const easeOutBack = x => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

/** A blob's signed distance (m, negative inside) at (u, v): an ellipse at (x, z) with radii rx, rz, to first order. */
function ellipseDistance(u, v, x, z, rx, rz) {
  const a = u - x, b = v - z;
  const k = Math.hypot(a / rx, b / rz);
  const g = Math.hypot(a / (rx * rx), b / (rz * rz));
  return g < 1e-6 ? -Math.min(rx, rz) : ((k - 1) * k) / g;
}
/** The pad and the three toes, scaled: what the water shader's shoreline is drawn from too (uBlobs). */
const PES = BLOBS.map(b => ({ x: b.x * SIZE, z: b.z * SIZE, rx: b.rx * SIZE, rz: b.rz * SIZE }));
/** The hind print's signed distance (m, negative inside) at (u, v) in its own frame: u the way it points, v to its right. */
function printDistance(u, v) {
  let d = Infinity;
  for (const b of PES) d = Math.min(d, ellipseDistance(u, v, b.x, b.z, b.rx, b.rz));
  return d;
}
/** The front foot's crescent: the outer ellipse less the inner. */
function manusDistance(u, v) {
  return Math.max(ellipseDistance(u, v, ...MANUS.outer), -ellipseDistance(u, v, ...MANUS.inner));
}
const lerp = THREE.MathUtils.lerp;
/** The hind print's mud at distance d from its edge, over ground `ground`, its water at `level`: floor, inner wall, lip, skirt. */
function pesHeight(d, ground, level) {
  if (d <= -WALL) return ground + FLOOR_UP;
  if (d <= 0) return lerp(ground + FLOOR_UP, level + 0.004, smooth((d + WALL) / WALL));
  const crest = Math.max(level + RIM_UP, ground + CREST_UP);
  if (d <= CREST) return lerp(level + 0.004, crest, smooth(d / CREST));
  if (d >= SKIRT) return ground - SINK;
  return lerp(crest, ground - SINK, smooth((d - CREST) / (SKIRT - CREST)));
}
/** The front foot's crescent, shallower and dry. */
function manusHeight(d, ground) {
  const M = MANUS;
  if (d <= -M.wall) return ground + M.floor;
  if (d <= 0) return lerp(ground + M.floor, ground + M.edge, smooth((d + M.wall) / M.wall));
  if (d <= M.wall) return lerp(ground + M.edge, ground + M.crest, smooth(d / M.wall));
  if (d >= M.skirt) return ground - SINK;
  return lerp(ground + M.crest, ground - SINK, smooth((d - M.wall) / (M.skirt - M.wall)));
}
/** The mud of one print (both feet) at (u, v): inside a print its floor and wall, outside the higher of their lips and skirts. */
function mudAt(u, v, ground, level) {
  const dp = printDistance(u, v), dm = manusDistance(u, v);
  if (dp < 0) return { h: pesHeight(dp, ground, level), dp, dm };
  if (dm < 0) return { h: manusHeight(dm, ground), dp, dm };
  return { h: Math.max(pesHeight(dp, ground, level), manusHeight(dm, ground)), dp, dm };
}
const covered = (dp, dm) => dp < SKIRT || dm < MANUS.skirt; // mud there, above the ground or under it

const EXTENT = (() => {
  const xs = PES.flatMap(b => [b.x - b.rx, b.x + b.rx]);
  const zs = PES.flatMap(b => [b.z - b.rz, b.z + b.rz]);
  const pad = SKIRT + 0.05;
  const front = MANUS.outer[0] + MANUS.outer[2] + MANUS.skirt + 0.05;
  const side = Math.max(...zs.map(Math.abs), MANUS.outer[3]) + pad;
  return { x0: Math.min(...xs) - pad, x1: Math.max(Math.max(...xs) + pad, front), z0: -side, z1: side };
})();
// The water's quad over the hind print (the shader keeps only what is inside the print's shape), in the print's frame.
const POOL = (() => {
  const xs = PES.flatMap(b => [b.x - b.rx, b.x + b.rx]);
  const zs = PES.flatMap(b => [b.z - b.rz, b.z + b.rz]);
  return { x0: Math.min(...xs) - 0.02, x1: Math.max(...xs) + 0.02, z0: Math.min(...zs) - 0.02, z1: Math.max(...zs) + 0.02 };
})();
const PAD = [PES[0].x, PES[0].z]; // the middle of the pad: where a tap aims and a digit rises

// ---- the digits ------------------------------------------------------------------------------------------------

/** Points along a line, an arc of an ellipse (degrees, from a0 to a1) or a cubic Bézier, in a digit's unit frame. */
const line = (x0, y0, x1, y1) => {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.06));
  return Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
};
const arc = (cx, cy, rx, ry, a0, a1) => {
  const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / 9));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / n);
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
};
const bezier = (p0, p1, p2, p3, n = 14) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
});
const loop = (cx, cy, rx, ry) => ({ points: arc(cx, cy, rx, ry, 90, 450).slice(0, -1), closed: true });
const open = (...parts) => ({ points: parts.flat().filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-6), closed: false });

// Each digit's strokes, along the middle of the stroke, one unit from the baseline to the top: Nunito's shapes, roughly.
const STROKES = {
  0: [loop(0.3, 0.5, 0.25, 0.43)],
  1: [open(line(0.08, 0.78, 0.33, 1)), open(line(0.33, 1, 0.33, 0))],
  2: [open(arc(0.3, 0.71, 0.25, 0.25, 165, -38), bezier([0.497, 0.556], [0.38, 0.4], [0.12, 0.18], [0.06, 0])), open(line(0.06, 0, 0.6, 0))],
  3: [open(arc(0.28, 0.765, 0.24, 0.235, 150, -90)), open(arc(0.28, 0.27, 0.27, 0.26, 90, -150))],
  4: [open(line(0.44, 1, 0.04, 0.32)), open(line(0.04, 0.32, 0.62, 0.32)), open(line(0.44, 1, 0.44, 0))],
  5: [open(line(0.56, 1, 0.14, 1)), open(line(0.14, 1, 0.12, 0.58)), open(arc(0.31, 0.33, 0.27, 0.3, 128, -140))],
  6: [loop(0.31, 0.3, 0.26, 0.28), open(bezier([0.53, 0.96], [0.22, 1.04], [0.05, 0.72], [0.05, 0.3]))],
  7: [open(line(0.04, 1, 0.58, 1)), open(bezier([0.58, 1], [0.44, 0.7], [0.3, 0.36], [0.24, 0]))],
  8: [loop(0.3, 0.765, 0.21, 0.215), loop(0.3, 0.27, 0.26, 0.27)],
  9: [loop(0.29, 0.7, 0.26, 0.28), open(bezier([0.55, 0.7], [0.55, 0.3], [0.4, 0.04], [0.15, 0]))],
};

/** A tube along a stroke in the digit's plane (z out of it), with round ends where it is open; `inside` builds its edge: wider, turned inside out. */
function tube(out, { points, closed }, offsetX, radius, colour, inside) {
  const { depth, sides } = DIGIT;
  const n = points.length;
  const ring = (i, scale = 1, shift = 0) => {
    const p = points[i];
    const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let tx = next[0] - prev[0], ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    const nx = -ty, ny = tx;
    return Array.from({ length: sides }, (_, j) => {
      const a = (j / sides) * Math.PI * 2, c = Math.cos(a) * scale, s = Math.sin(a) * scale;
      const normal = new THREE.Vector3(nx * Math.cos(a) * (1 - Math.abs(shift)) + tx * shift, ny * Math.cos(a) * (1 - Math.abs(shift)) + ty * shift, (Math.sin(a) / depth) * (1 - Math.abs(shift))).normalize();
      return {
        p: new THREE.Vector3(p[0] + offsetX + nx * c * radius + tx * shift * radius, p[1] + ny * c * radius + ty * shift * radius, s * radius * depth),
        n: normal,
      };
    });
  };
  const tri = (a, b, c) => {
    const list = inside ? [a, b, c] : [a, c, b]; // the bands run along the stroke wound inward: the fill turns them out, the edge leaves them in
    for (const v of list) {
      out.position.push(v.p.x, v.p.y, v.p.z);
      const k = inside ? -1 : 1;
      out.normal.push(v.n.x * k, v.n.y * k, v.n.z * k);
      out.color.push(colour.r, colour.g, colour.b);
    }
  };
  const band = (r0, r1) => {
    for (let j = 0; j < sides; j++) {
      const j1 = (j + 1) % sides;
      tri(r0[j], r1[j], r1[j1]);
      tri(r0[j], r1[j1], r0[j1]);
    }
  };
  const rings = points.map((_, i) => ring(i));
  for (let i = 0; i + 1 < n; i++) band(rings[i], rings[i + 1]);
  if (closed) band(rings[n - 1], rings[0]);
  else {
    // round ends: three rings shrinking toward a point, out along the stroke
    for (const [end, way] of [[0, -1], [n - 1, 1]]) {
      let last = rings[end];
      for (let k = 1; k <= 3; k++) {
        const phi = (k / 4) * (Math.PI / 2);
        const next = ring(end, Math.cos(phi), way * Math.sin(phi));
        if (way > 0) band(last, next); else band(next, last);
        last = next;
      }
      const tip = ring(end, 0.0001, way)[0];
      for (let j = 0; j < sides; j++) {
        const j1 = (j + 1) % sides;
        if (way > 0) tri(last[j], tip, last[j1]); else tri(tip, last[j], last[j1]);
      }
    }
  }
}

const digitGeometries = new Map();
/** The geometry of a number (1 to 10) as it rises: its bottom on y = 0, centred on x and z, DIGIT.height tall, edge and all. */
export function digitGeometry(number) {
  if (digitGeometries.has(number)) return digitGeometries.get(number);
  const glyphs = String(number).split('');
  const out = { position: [], normal: [], color: [] };
  const fill = new THREE.Color(DIGIT.fill), dark = new THREE.Color(DIGIT.line);
  let x = 0;
  for (const glyph of glyphs) {
    for (const stroke of STROKES[glyph]) {
      tube(out, stroke, x, DIGIT.stroke, fill, false);
      tube(out, stroke, x, DIGIT.stroke + DIGIT.edge, dark, true);
    }
    x += 0.6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(out.color, 3));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const scale = DIGIT.height / (box.max.y - box.min.y);
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, 0);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  digitGeometries.set(number, geometry);
  return geometry;
}

// ---- the prints ------------------------------------------------------------------------------------------------

/**
 * Þórseðla's prints in the mud at `prints` ([{ position: [x, z], heading }], degrees: 0 points +X, 90 +Z), on the ground of
 * `heightAt`. Returns
 *   group          the mud and the water (and a digit while one rises), in world.scene
 *   targets        [{ name: 'print1'..'printN', point, radius: 0.6 }]: the middle of each pad, over its water
 *   splash(i)      a ring in print i's water and a splash of drops; a Handle, done when the drops are down
 *   count(i)       the number i + 1 rises out of print i's water and is gone 1.6 s later; a Handle, done then
 *   done(i)        print i's water goes still and warm gold
 *   glimmer(i)     print i is the next to count: it glimmers (null: none does)
 *   levelOf(i), rimOf(i), floorOf(i)   heights: its water, its rim, its floor at the middle of its pad
 *   pointIn(i, along, across, on)      a point in print i's frame (metres along it and to its right) on 'floor', 'water' or 'rim'
 *   groundAt(x, z) the ground with the prints in it (for a frog that hops out of one, a salamander that crawls out)
 *   rippleAt(point, strength)          a ring on the prints' water (an animal in a print touching it)
 *   update(t)      pose everything for game time t (the registered effect does it every frame)
 *   dispose()
 */
export function createMudPrints(world, { prints, heightAt = world.heightAt, seed = 12 } = {}) {
  if (!Array.isArray(prints) || !prints.length) throw new TypeError('createMudPrints takes `prints`: [{ position: [x, z], heading }]');
  needEffects(world, 'createMudPrints');
  const group = new THREE.Group();
  group.name = 'Þórseðla prints';
  const frames = prints.map(({ position: [x, z], heading = 0 }) => {
    const a = THREE.MathUtils.degToRad(heading);
    return { x, z, ax: Math.cos(a), az: Math.sin(a) }; // its way (ax, az); its right is (-az, ax)
  });
  const toWorld = (f, u, v) => [f.x + f.ax * u - f.az * v, f.z + f.az * u + f.ax * v];

  // ---- the mud: a grid a print, its heights from the distance to each foot's edge ----
  const pos = [], col = [], edge = [], index = [];
  const levels = [], rims = [], floors = [];
  const water = { pos: [], data: [], flow: [], state: [], owner: [], local: [], index: [] };
  const nu = Math.ceil((EXTENT.x1 - EXTENT.x0) / CELL), nv = Math.ceil((EXTENT.z1 - EXTENT.z0) / CELL);
  const C = Object.fromEntries(Object.entries(MUD).map(([k, v]) => [k, new THREE.Color(v)]));
  const tint = new THREE.Color();
  /** The colour of the mud at a grid point: dark on the floors and walls, light on the lips, the path's at the edge. */
  function mudColour(g, level) {
    const d = g.dp < 0 || g.dp < g.dm ? g.dp : g.dm;
    const skirt = d === g.dp ? SKIRT : MANUS.skirt;
    const wall = d === g.dp ? WALL : MANUS.wall;
    if (d <= 0) return tint.copy(C.floor).lerp(C.wall, smooth((d + wall) / wall));
    if (d <= CREST) return tint.copy(C.wall).lerp(C.lip, smooth(d / CREST));
    return tint.copy(C.lip).lerp(C.outer, smooth((d - CREST) / (skirt - CREST)));
  }
  frames.forEach((f, k) => {
    const grid = [];
    let highest = -Infinity;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = EXTENT.x0 + ((EXTENT.x1 - EXTENT.x0) * i) / nu, v = EXTENT.z0 + ((EXTENT.z1 - EXTENT.z0) * j) / nv;
        const [x, z] = toWorld(f, u, v);
        const ground = heightAt(x, z);
        const dp = printDistance(u, v);
        if (dp < 0) highest = Math.max(highest, ground);
        grid.push({ u, v, x, z, ground, dp });
      }
    }
    const level = highest + WATER_UP;
    levels.push(level);
    rims.push(level + RIM_UP);
    const at = (i, j) => grid[j * (nu + 1) + i];
    const base = pos.length / 3;
    for (const g of grid) {
      const m = mudAt(g.u, g.v, g.ground, level);
      g.h = m.h;
      g.dm = m.dm;
      pos.push(g.x, m.h, g.z);
      const c = mudColour(g, level);
      col.push(c.r, c.g, c.b);
      edge.push(covered(g.dp, g.dm) ? 0 : 1);
    }
    floors.push(heightAt(...toWorld(f, ...PAD)) + FLOOR_UP);
    // a cell is drawn where any corner has mud on it (above the ground or under it)
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const corners = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
        const a = base + j * (nu + 1) + i, b = a + 1, c = a + (nu + 1), d = c + 1;
        if (corners.some(g => covered(g.dp, g.dm))) index.push(a, c, b, b, c, d);
      }
    }
    // the water: one quad over the hind print, flat at its level; the shader draws its shore from the print's shape
    const wbase = water.pos.length / 3;
    for (const [u, v] of [[POOL.x0, POOL.z0], [POOL.x1, POOL.z0], [POOL.x0, POOL.z1], [POOL.x1, POOL.z1]]) {
      const [x, z] = toWorld(f, u, v);
      water.pos.push(x, level, z);
      water.data.push(-1, 0.15, 0);
      water.flow.push(0, 0);
      water.state.push(0, 0);
      water.owner.push(k);
      water.local.push(u, v);
    }
    water.index.push(wbase, wbase + 2, wbase + 1, wbase + 1, wbase + 2, wbase + 3);
  });
  const mudGeometry = new THREE.BufferGeometry();
  mudGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  mudGeometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  mudGeometry.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  mudGeometry.setIndex(index);
  mudGeometry.computeVertexNormals();
  mudGeometry.computeBoundingSphere();
  // wet, dark and a little glossy (STYLE.md: nothing shines but eyes and water; wet mud has a soft sheen), on top of the ground
  const mudMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  mudMaterial.name = 'mud prints';
  const mud = new THREE.Mesh(mudGeometry, mudMaterial);
  mud.name = 'Mud prints';
  mud.receiveShadow = true;
  mud.castShadow = false;
  group.add(mud);

  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(water.pos, 3));
  waterGeometry.setAttribute('aWater', new THREE.Float32BufferAttribute(water.data, 3));
  waterGeometry.setAttribute('aFlow', new THREE.Float32BufferAttribute(water.flow, 2));
  waterGeometry.setAttribute('aState', new THREE.Float32BufferAttribute(water.state, 2));
  waterGeometry.setAttribute('aPrint', new THREE.Float32BufferAttribute(water.owner, 1));
  waterGeometry.setAttribute('aLocal', new THREE.Float32BufferAttribute(water.local, 2));
  waterGeometry.setIndex(water.index);
  waterGeometry.computeBoundingSphere();
  const surface = createWaterMaterial(world, { seed, fade: WATER_FADE, prints: true, bed: BED });
  surface.uniforms.uBlobs.value.forEach((v, i) => v.set(PES[i].x, PES[i].z, PES[i].rx, PES[i].rz));
  const waterMesh = new THREE.Mesh(waterGeometry, surface.material);
  waterMesh.name = 'Print water';
  waterMesh.renderOrder = 8;
  group.add(waterMesh);
  const ripples = surface.uniforms.uRipples.value;
  let slot = 0;

  // ---- what each print is doing ----
  const pointOf = k => {
    const [x, z] = toWorld(frames[k], ...PAD);
    return new THREE.Vector3(x, levels[k], z);
  };
  const targets = frames.map((_, k) => {
    const point = pointOf(k);
    point.y += 0.05;
    return { name: `print${k + 1}`, point, radius: 0.6 };
  });
  const state = frames.map(() => ({ done: 0, doneGoal: 0, glimmer: 0, glimmerGoal: 0 }));
  let next = null;
  let nextGlint = 0, nextRing = 0;
  let now = 0;
  let disposed = false;
  const live = new Set(); // the handles under way, cancelled at dispose

  function ring(k, strength = 1, at = now) {
    const p = pointOf(k);
    rippleAt(p, strength, at);
  }
  /** A ring on the prints' water at a point (a Vector3, [x, y, z] or { x, z }): an animal in a print touching it. */
  function rippleAt(point, strength = 1, at = now) {
    const [x, z] = Array.isArray(point) ? [point[0], point[2]] : [point.x, point.z];
    ripples[slot].set(x, z, at, strength);
    slot = (slot + 1) % RIPPLE_SLOTS;
    return new Handle('print ripple').finish();
  }
  /** The ground with the prints pressed into it: the mud of a print where there is one (its floor under the water), else heightAt. */
  function groundAt(x, z) {
    const ground = heightAt(x, z);
    for (let k = 0; k < frames.length; k++) {
      const f = frames[k];
      const dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz > 1.6 * 1.6) continue;
      const u = dx * f.ax + dz * f.az, v = -dx * f.az + dz * f.ax;
      const m = mudAt(u, v, ground, levels[k]);
      if (covered(m.dp, m.dm)) return Math.max(ground, m.h);
    }
    return ground;
  }

  function splash(k) {
    const at = pointOf(k);
    ring(k, 1.3);
    ring(k, 0.6, now + 0.18);
    const drops = glints(world, {
      count: 16, life: 0.7, spread: 0.5, fall: 0.85, size: 0.085, colour: '#e3f1ec', seed: `print splash ${k}`,
      look: { glow: 0.8, falloff: 2.2, star: 0, twinkle: 0, rim: 1, vary: 1, core: '#ffffff', blending: THREE.NormalBlending, floor: 0.5, span: 0.5 },
    });
    drops.points.name = 'Print splash';
    for (let i = 0; i < 16; i++) {
      drops.position.set([at.x, at.y + 0.01, at.z], i * 3);
      drops.birth[i] = (i / 16) * 0.08;
    }
    const handle = run(world, drops, 0.8, 'print splash');
    return keep(handle);
  }

  let digit = null; // { mesh, number, start, handle, from }
  const digitMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, fog: false });
  digitMaterial.name = 'print digit';
  function count(k) {
    if (digit) endDigit();
    const mesh = new THREE.Mesh(digitGeometry(k + 1), digitMaterial);
    mesh.name = 'Print digit';
    mesh.castShadow = false;
    mesh.renderOrder = 9;
    group.add(mesh);
    const handle = new Handle(`print ${k + 1} counted`, () => endDigit());
    digit = { mesh, number: k + 1, start: now, handle, from: pointOf(k), popped: false };
    poseDigit();
    return keep(handle);
  }
  function endDigit() {
    if (!digit) return;
    digit.mesh.removeFromParent();
    const { handle } = digit;
    digit = null;
    if (!handle.done) handle.finish();
  }
  const look = new THREE.Vector3();
  function poseDigit() {
    const { mesh, start, from } = digit;
    const t = now - start;
    if (t >= DIGIT.life) { endDigit(); return; }
    const pop = Math.min(1, t / 0.35);
    const rise = smooth((t - 0.1) / 1.1);
    const shrink = smooth((t - 1.25) / (DIGIT.life - 1.25));
    const size = (t < 0.35 ? 0.2 + 0.8 * easeOutBack(pop) : 1) * (1 - shrink);
    mesh.visible = size > 0.01;
    mesh.scale.setScalar(Math.max(0.0001, size));
    mesh.position.set(from.x, from.y - 0.12 * (1 - pop) + DIGIT.rise * rise + 0.06 * shrink, from.z);
    // it turns to face the camera, about the vertical, and nods a little as it comes up
    const camera = world.camera;
    const yaw = camera ? Math.atan2(look.copy(camera.position).sub(mesh.position).x, look.z) : 0;
    mesh.rotation.set(0, yaw, 0.1 * Math.sin(t * 7) * (1 - rise));
    if (!digit.popped && t >= 1.28) {
      digit.popped = true;
      keep(sparkleBurst(world, mesh.position.clone().setY(mesh.position.y + DIGIT.height * 0.5), { count: 14, duration: 0.9, size: 0.22, spread: 0.55, seed: `digit ${digit.number}` }));
    }
  }

  function keep(handle) {
    live.add(handle);
    return handle;
  }

  function done(k) { state[k].doneGoal = 1; state[k].glimmerGoal = 0; }
  function glimmer(k) {
    next = k;
    state.forEach((s, i) => { s.glimmerGoal = i === k ? 1 : 0; });
    nextGlint = now + 0.2;
    nextRing = now + 0.4;
  }

  const stateAttr = waterGeometry.attributes.aState;
  function update(t) {
    if (disposed) return;
    const dt = Math.max(0, t - now);
    now = t;
    surface.uniforms.uTime.value = t;
    if (world.lighting?.direction) surface.uniforms.uSunDir.value.copy(world.lighting.direction);
    let changed = false;
    for (const s of state) {
      const done1 = s.done + Math.sign(s.doneGoal - s.done) * Math.min(Math.abs(s.doneGoal - s.done), dt / 0.6);
      const glim1 = s.glimmer + Math.sign(s.glimmerGoal - s.glimmer) * Math.min(Math.abs(s.glimmerGoal - s.glimmer), dt / 0.3);
      if (done1 !== s.done || glim1 !== s.glimmer) { s.done = done1; s.glimmer = glim1; changed = true; }
    }
    if (changed) {
      for (let i = 0; i < stateAttr.count; i++) {
        const s = state[water.owner[i]];
        stateAttr.setXY(i, s.done, s.glimmer);
      }
      stateAttr.needsUpdate = true;
    }
    // the next print asks to be tapped: glints rise off its rim, a soft ring now and then
    if (next !== null && state[next].glimmerGoal > 0) {
      if (now >= nextGlint) {
        nextGlint = now + GLIMMER.every;
        const turn = (now * 2.39996) % (Math.PI * 2);
        const [x, z] = toWorld(frames[next], PAD[0] + Math.cos(turn) * 0.3, Math.sin(turn) * 0.24);
        keep(sparkleBurst(world, new THREE.Vector3(x, rims[next] + 0.05, z), { count: 9, duration: 1.2, size: 0.2, spread: 0.36, seed: `print glimmer ${Math.floor(now * 10) % 9}` }));
      }
      if (now >= nextRing) {
        nextRing = now + GLIMMER.ring;
        ring(next, 0.5);
      }
    }
    if (digit) poseDigit();
    for (const handle of live) if (handle.done) live.delete(handle);
  }

  function pointIn(k, along, across, on = 'floor') {
    const [x, z] = toWorld(frames[k], along, across);
    const y = on === 'water' ? levels[k] : on === 'rim' ? rims[k] : heightAt(x, z) + FLOOR_UP;
    return [x, y, z];
  }

  world.scene.add(group);
  world.effects.add({
    update() {
      if (disposed) return false;
      update(world.clock?.time ?? now);
      return true;
    },
  });

  return {
    group, targets, splash, count, done, glimmer, update, pointIn, groundAt, rippleAt,
    levelOf: k => levels[k],
    rimOf: k => rims[k],
    floorOf: k => floors[k],
    get next() { return next; },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (digit) endDigit();
      for (const handle of live) if (!handle.done) handle.cancel(); // a splash or a glint takes itself out of the scene
      group.removeFromParent();
      mudGeometry.dispose(); mudMaterial.dispose();
      waterGeometry.dispose(); surface.dispose();
      digitMaterial.dispose();
    },
  };
}
