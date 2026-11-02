// The far land of chapter 4's flight (spec 5F: "Víð mynd yfir allt landið"): everything round Árdalurinn that she sees from high over
// the falls and as she glides down, from the cut at the crest of E to the end of the flight. Without it the valley's land ends 160 m
// from her path (terrain.js: CORRIDOR) and the sections far from her are not drawn (index.js), so from up there the land would stop.
//
//   const far = createFarLand(world, route, { terrain })   // the real valley makes one (index.js: place.farLand)
//   far.show(on)                  the flight turns it on (and off when it ends)
//   far.update(t, camera)         every frame (the place's update, with world.flightTime), with the flight's time (-1 before it):
//                                 shown from FAR.from to FAR.to; Grameðla's walk and roar,
//                                 Kambeðla's blink, the mist's colour; while shown the camera sees FAR_PLANE m (it sees 1,200 m)
//   far.prefetch() / load() / ready()   Grameðla's model (world/props/far-friends.js), made where nobody sees the long frame
//   far.gramedla                  { shadow (her model's root, once made), at(t) -> { x, y, z, heading, height }, roar(), scale }
//   far.kambedla                  { glow, level(t) }
//   far.heightAt(x, z)            the far land's own surface (its triangles), mistAt(point) how deep in the mist a point is
//   far.peaks, far.ground, far.group, far.dispose()
//
// - The ground: one mesh, a polar grid round CENTRE (where F and G fly) whose cells grow with the distance (18 m near her, about
//   75 m at 1.3 km): the same few pixels everywhere, 7,800 vertices. Its heights are the valley's own ground (terrain.js), levelled
//   off far from the river, with low hills, the forest's crowns seen from afar and the mountains on top. In the valley's corridor it
//   lies 2 m under the lowest ground near each vertex (the river's bed too), so where a section of the valley is drawn its ground
//   covers it, and where one is not the far land stands in for it.
// - Its colours, in its vertices, are the painted map's (assets/book/map.webp): the forest's greens west and south, the Fen's gold
//   east of the rapids, the lily ponds blue where the map has them, the mountains' blue-grey rock over green slopes, and in the
//   corridor the valley's own ground paint (look.js), a little greener for its trees.
// - The mountains: a range of pointed peaks (PEAKS) on a ridge round the west and north, 0.8 to 2 km from the falls, as the map's
//   misty mountains behind the falls. Mist lies at their feet and in their saddles: big soft cards that turn to face the camera
//   (MIST), one mesh.
// - Grameðla (spec 5F: "Í þokunni sést skuggi hennar"): her model at ten times her size, dark, walking slowly south along a saddle
//   of the western range, a shape in the mist between two cards. At her own size, 1.3 km off, she would be four pixels tall.
// - Kambeðla's plates (spec 5F: "plötur Kambeðlu blikka í fjarska"): a lilac glow in a glade to the north-east, which blinks four
//   times as the land answers her call; at 450 m Kambeðla herself would be a speck under the trees.
import * as THREE from 'three';
import { BEATS, FALLS } from '../../chapters/kafli4-route.js';
import { CORRIDOR, createRouteIndex } from './terrain.js';
import { groundPaint } from './look.js';
import { createFarFriends } from '../props/far-friends.js';

/** The flight's seconds while the far land shows: from the cut at the crest of E to the end of the flight. */
export const FAR = { from: 116, to: BEATS.END };
export const FAR_PLANE = 6000; // metres the camera sees while it shows
const CENTRE = [-1250, 90]; // the grid's middle: over F and G
const GRID = { radius: 4800, near: 18, grow: 0.056, segments: 112 };
const SINK = 2; // metres under the lowest valley ground near a vertex, in the corridor
// The mountains' peaks: [x, z, height over the range's foot, radius]
const PEAKS = [
  [-2500, 760, 360, 420], // south of Grameðla's ridge
  [-2600, -60, 430, 450], // north of it
  [-3300, 350, 520, 600], // far behind it, in the mist
  [-2250, -560, 380, 420],
  [-1850, -980, 400, 450],
  [-1300, -1250, 420, 480],
  [-700, -1350, 330, 420],
  [-2150, 1150, 300, 420],
];
const RANGE = { from: 800, full: 1100, height: 90, bearing: -147.5, half: 77.5, fade: 20 }; // the range's foot round the falls
// Ridges between peaks: [x1, z1, x2, z2, height over the range's foot, half width]. Grameðla walks along the first one's crest.
const RIDGES = [[-2600, -60, -2500, 760, 110, 170]];
// The painted map's colours (sRGB, picked from its forest, Fen, ponds, mountains and mist)
const MAP = {
  forest: ['#4f6f30', '#6b8a3b', '#8a9a45'], fen: ['#b8923f', '#cfa64e'], water: '#5f97a3', glade: '#8a9a48',
  rock: ['#808fa0', '#9fadbc', '#c0c8d0'],
};
const PONDS = [[312, 525, 70], [323, 950, 90], [-560, 760, 55]]; // [x, z, radius]: the map's lily ponds, east and south
/** Where Kambeðla's plates glow: a glade 600 m north-east of the orbit round them at 138 to 141 s, right of her in its view. */
const KAMBEDLA = { x: -832, z: -192, glade: 140, above: 8, colour: '#ab85c1', blinks: [138.2, 138.9, 139.6, 140.3], width: 0.2, window: [137.5, 141.5], size: 22 };
// The river above the valley's (route.river ends 330 m above the falls): [x, z, level, half width], on into the mountains' foot.
const UPPER = [[-1680, 80, 51.5, 11], [-1850, 58, 52.5, 11], [-2050, 66, 54, 10], [-2250, 50, 56, 9]];
// The haze the far land fades into with distance (aerial perspective): none to 250 m, half by about 1.4 km, at most 80 %.
const HAZE = { from: 250, scale: 1600, most: 0.8, sky: '#c3d3e2', blue: 0.35 };
/** Grameðla: where she walks (along the ridge's crest, south), how fast, at what size, and how dark. */
const GRAMEDLA = { from: [-2578, 120], heading: 83, speed: 3, scale: 10, height: 5.22, tint: '#2b2d36', walk: 0.45 };
const VISTA = [-1408, 116]; // where the vista over the falls looks from, as she speaks of Grameðla (flight-camera.js)
// The mist's cards: [x, z, width, height, opacity]; each stands on the ground there, a third of it under the ground. Two more are
// Grameðla's (createFarLand): bright mist behind her, and a thin veil in front of her, on the line from the vista.
const MIST = [
  [-2300, 720, 600, 160, 0.7],
  [-2380, -170, 500, 150, 0.7],
  [-2000, -680, 550, 160, 0.7],
  [-1450, -980, 600, 150, 0.65],
  [-850, -1080, 500, 140, 0.6],
  [-2600, 980, 500, 140, 0.6],
  [-3100, -500, 700, 200, 0.75],
];

const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
const linear = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mixRGB = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const angleBetween = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return Math.abs(d); };
/** A cell's own random number: 0 to 1. */
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
/** Where (x, z) is from the river above the valley's: { dist, level, half }, or null well away from it. */
function upperRiver(x, z) {
  let best = null;
  for (let i = 0; i < UPPER.length - 1; i++) {
    const [ax, az, al, ah] = UPPER[i];
    const [bx, bz, bl, bh] = UPPER[i + 1];
    const ex = bx - ax, ez = bz - az;
    const k = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    const dist = Math.hypot(x - ax - ex * k, z - az - ez * k);
    if (!best || dist < best.dist) best = { dist, level: al + (bl - al) * k, half: ah + (bh - ah) * k };
  }
  return best && best.dist < best.half + 130 ? best : null;
}
/** Low, smooth noise: 0 to 1. */
const wave = (x, z, f, s) => 0.5 + 0.25 * Math.sin(x * f + s) * Math.sin(z * f * 1.13 - s * 0.7) + 0.25 * Math.sin((x * 0.71 - z * 0.69) * f * 1.9 + s * 2.3);

/** The mountains over the ground at (x, z): the ridge round the falls and its peaks, broken a little. */
function mountainsAt(x, z) {
  const away = Math.hypot(x - FALLS.x, z - FALLS.z);
  const bearing = THREE.MathUtils.radToDeg(Math.atan2(z - FALLS.z, x - FALLS.x));
  const arc = 1 - smooth((angleBetween(bearing, RANGE.bearing) - RANGE.half) / RANGE.fade);
  const ridge = RANGE.height * smooth((away - RANGE.from) / (RANGE.full - RANGE.from)) * arc;
  let peak = 0;
  for (const [px, pz, h, r] of PEAKS) {
    const k = Math.max(0, 1 - Math.hypot(x - px, z - pz) / r);
    peak = Math.max(peak, h * k ** 1.8);
  }
  for (const [x1, z1, x2, z2, h, w] of RIDGES) {
    const ex = x2 - x1, ez = z2 - z1;
    const s = Math.max(0, Math.min(1, ((x - x1) * ex + (z - z1) * ez) / (ex * ex + ez * ez)));
    const k = Math.max(0, 1 - Math.hypot(x - x1 - ex * s, z - z1 - ez * s) / w);
    peak = Math.max(peak, h * k ** 1.3);
  }
  const rough = 1 - Math.abs(Math.sin(x * 0.0061 + z * 0.0047 + 1.1)) * 0.5 - Math.abs(Math.sin(x * 0.013 - z * 0.011 + 0.4)) * 0.25;
  return (ridge + peak) * (0.82 + 0.18 * rough);
}

/** The far land for the route, on the valley's `terrain` (terrain.js: createTerrain). */
export function createFarLand(world, route, { terrain, seed = 4 } = {}) {
  const index = createRouteIndex(route);
  const paint = groundPaint(terrain, route);
  const { river, pool } = route;
  const near = {};

  // The polar grid: its rings' radii, and the vertex at ring i (0: the middle), segment j.
  const rings = [0];
  while (rings.at(-1) < GRID.radius) rings.push(Math.min(GRID.radius, rings.at(-1) + Math.max(GRID.near, GRID.grow * rings.at(-1))));
  const S = GRID.segments;
  const vertex = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * S + (((j % S) + S) % S));
  const count = 1 + (rings.length - 1) * S;
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const cell = new Float32Array(count); // the size of the cells round each vertex
  for (let i = 0; i < rings.length; i++) {
    for (let j = 0; j < (i === 0 ? 1 : S); j++) {
      const v = vertex(i, j);
      const a = (j / S) * Math.PI * 2;
      positions[v * 3] = CENTRE[0] + Math.cos(a) * rings[i];
      positions[v * 3 + 2] = CENTRE[1] + Math.sin(a) * rings[i];
      cell[v] = Math.max(rings[Math.min(i + 1, rings.length - 1)] - rings[i], (rings[i] * Math.PI * 2) / S, GRID.near);
    }
  }

  /** The lowest of the valley's ground round (x, z) within `reach` (its river's bed and the far pool's included). */
  function lowest(x, z, reach) {
    let low = Infinity;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) low = Math.min(low, terrain.heightAt(x + (a * reach) / 2, z + (b * reach) / 2));
    const n = river.nearest(x, z);
    const r = river.at(n.d);
    if (n.dist - r.half < reach) for (const d of [n.d - reach, n.d, n.d + reach]) low = Math.min(low, river.at(d).level - 1.6);
    if (Math.hypot(x - pool.center[0], z - pool.center[1]) < pool.radius + reach) low = Math.min(low, pool.level - 1.6);
    return low;
  }

  const forestColour = MAP.forest.map(linear);
  const fenColour = MAP.fen.map(linear);
  const water = linear(MAP.water);
  const gladeColour = linear(MAP.glade);
  const rock = MAP.rock.map(linear);
  const mountain = new Float32Array(count);
  const fromPaths = new Float32Array(count);
  // her path's bounds, so a vertex far from it is not searched for its nearest point (most of them)
  const bounds = new THREE.Box2();
  for (const p of index.points) bounds.expandByPoint(new THREE.Vector2(p.x, p.z));
  const reach = CORRIDOR + 400;
  const at = new THREE.Vector2();
  for (let v = 0; v < count; v++) {
    const x = positions[v * 3];
    const z = positions[v * 3 + 2];
    const fromPath = bounds.distanceToPoint(at.set(x, z)) > reach ? Infinity : (index.nearest(x, z, reach, near), near.dist);
    fromPaths[v] = fromPath;
    const w = terrain.where(x, z);
    let y;
    let colour;
    if (fromPath < CORRIDOR + 25) {
      // the valley: under its own ground
      y = lowest(x, z, Math.max(12, cell[v] * 1.5)) - SINK;
      const [r, g, b] = paint(x, z, y, 1);
      colour = mixRGB([r, g, b], forestColour[1], 0.25 * (1 - w.fen));
    } else {
      const rim = smooth((fromPath - CORRIDOR) / 150); // 0 at the corridor's edge, 1 well out
      // the valley's own ground at the corridor's edge; further out its sides level off, and the step of the falls (the valley's
      // nearest river level jumps 40 m there) becomes a long slope down from the upper land to the lower
      const lower = w.level < 30 ? w.level : 10;
      const upper = w.level < 30 ? 50.4 : w.level;
      const level = lerp(upper, lower, smooth((x - FALLS.x + 300) / 600));
      const e = Math.min(w.e, 250);
      const far = level + 0.35 + 0.04 * e + 6 * smooth((e - 40) / 140);
      const base = lerp(terrain.heightAt(x, z), far, smooth((fromPath - CORRIDOR) / 200));
      const hills = rim * (14 * (wave(x, z, 0.0042, seed) - 0.5) + 6 * (wave(x, z, 0.011, seed * 3) - 0.5));
      const m = mountainsAt(x, z);
      mountain[v] = m;
      // the map: the Fen's gold east of the rapids and round the snag, the forest elsewhere; its ponds; Kambeðla's glade
      const fen = Math.max(w.fen, smooth((x + 650) / 250)) * (1 - smooth(m / 40));
      const pond = PONDS.reduce((most, [px, pz, r]) => Math.max(most, 1 - smooth((Math.hypot(x - px, z - pz) - r) / 12)), 0);
      const glade = 1 - smooth((Math.hypot(x - KAMBEDLA.x, z - KAMBEDLA.z) - KAMBEDLA.glade) / 30);
      const n = Math.min(1, Math.max(0, wave(x, z, 0.017, seed * 5) + (hash(x, z) - 0.5) * 0.5));
      // the river on above the valley's, into the mountains' foot: open meadow along it (no crowns: they made a deep, dark trough of
      // it from the vista), water, and its banks sloping down to it
      const up = upperRiver(x, z);
      const open = up ? 1 - smooth((up.dist - up.half) / 70) : 0;
      const canopy = rim * (1 - fen) * (1 - pond) * (1 - glade) * (1 - open) * (0.6 + 0.4 * n) * (1 - smooth((m - 120) / 120));
      y = base + hills + m + canopy * (13 + 6 * hash(z, x)) - pond * 4;
      const bank = up ? 1 - smooth((up.dist - up.half) / 120) : 0; // a broad, shallow valley: steep banks made a dark trough of it
      if (bank > 0) y = lerp(y, up.level - 0.6, bank);
      const green = n < 0.5 ? mixRGB(forestColour[0], forestColour[1], n * 2) : mixRGB(forestColour[1], forestColour[2], n * 2 - 1);
      const [pr, pg, pb] = paint(x, z, y, 1);
      colour = mixRGB([pr, pg, pb], green, rim * (1 - glade * 0.6));
      colour = mixRGB(colour, gladeColour, glade * rim);
      colour = mixRGB(colour, mixRGB(fenColour[0], fenColour[1], n), fen * rim);
      // the mountains' rock: from 60 m up their sides, lighter toward the tops
      const stone = smooth((m - 60) / 140);
      colour = mixRGB(colour, mixRGB(rock[0], m > 280 ? rock[2] : rock[1], smooth((m - 120) / 200)), stone);
      colour = mixRGB(colour, water, Math.max(pond, up ? 1 - smooth((up.dist - up.half + 2) / 18) : 0));
    }
    positions[v * 3 + 1] = y;
    colours[v * 3] = colour[0];
    colours[v * 3 + 1] = colour[1];
    colours[v * 3 + 2] = colour[2];
  }

  // The triangles, facing up, a column of cells at a time round the middle (column j: the bearings from segment j to j + 1, measured
  // from +x toward +z): its triangle of the middle's fan, then two a cell outward. The index holds them twice over, so that the
  // columns a view looks over are one run of it however they wrap round (slice(), below).
  const triangles = [];
  for (let j = 0; j < S; j++) {
    triangles.push(0, vertex(1, j + 1), vertex(1, j));
    for (let i = 1; i < rings.length - 1; i++) {
      const a = vertex(i, j), b = vertex(i, j + 1), c = vertex(i + 1, j), d = vertex(i + 1, j + 1);
      triangles.push(a, b, c, b, d, c);
    }
  }
  const column = triangles.length / S; // indices a column
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  geometry.setIndex(triangles.concat(triangles));
  geometry.setDrawRange(0, triangles.length);
  // bare rock where the land stands steep (the escarpment the falls drop over, the mountains' sides)
  const normal = geometry.attributes.normal;
  for (let v = 0; v < count; v++) {
    const steep = smooth((0.8 - normal.getY(v)) / 0.25) * (fromPaths[v] < CORRIDOR + 25 ? 0 : 1);
    if (steep <= 0) continue;
    const c = mixRGB([colours[v * 3], colours[v * 3 + 1], colours[v * 3 + 2]], rock[mountain[v] > 200 ? 1 : 0], steep * 0.8);
    colours.set(c, v * 3);
  }
  geometry.computeBoundingSphere();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.name = 'far-land';
  // far off, the land fades toward the haze's colour (a little bluer than the haze), so the mountains stand back
  const haze = { value: new THREE.Vector3(0.85, 0.88, 0.9) };
  material.onBeforeCompile = shader => {
    shader.uniforms.uHaze = haze;
    shader.fragmentShader = `uniform vec3 uHaze;
${shader.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
	#ifdef USE_FOG
		float hazeAway = max(length(vFogWorld - cameraPosition) - ${HAZE.from.toFixed(1)}, 0.0);
		gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, (1.0 - exp(-hazeAway / ${HAZE.scale.toFixed(1)})) * ${HAZE.most.toFixed(2)});
	#endif`)}`;
  };
  material.customProgramCacheKey = () => 'far-land-haze';
  const hazeSky = new THREE.Color();
  new THREE.Color(HAZE.sky).getRGB(hazeSky, THREE.SRGBColorSpace); // as the haze's colour: display values
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'Far land';
  ground.castShadow = false;
  ground.receiveShadow = false;

  // Only the slice of the land the view looks over is drawn (from G's start the land behind her was a quarter of the frame's
  // triangles for nothing). The view's frustum seen from above is the hull of its eight corners, out to its far plane. Unless that
  // hull holds the grid's middle, it lies within a wedge less than half round it: the columns from its corners' first bearing to
  // their last, and one more each side. A wedge of half round or more, and the middle inside: all of it.
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  const bearings = new Float64Array(8);
  function slice(camera) {
    camera.updateMatrixWorld();
    for (let k = 0; k < 8; k++) {
      const c = corners[k].set(k & 1 ? 1 : -1, k & 2 ? 1 : -1, k & 4 ? 1 : -1).unproject(camera);
      bearings[k] = Math.atan2(c.z - CENTRE[1], c.x - CENTRE[0]);
    }
    bearings.sort();
    // the widest gap between neighbouring bearings is the side of the middle the view does not look over
    let gap = bearings[0] + Math.PI * 2 - bearings[7];
    let from = bearings[0];
    for (let k = 0; k < 7; k++) if (bearings[k + 1] - bearings[k] > gap) { gap = bearings[k + 1] - bearings[k]; from = bearings[k + 1]; }
    if (gap <= Math.PI) { geometry.setDrawRange(0, triangles.length); return; }
    const u0 = (from / (Math.PI * 2)) * S; // in segments
    const u1 = u0 + ((Math.PI * 2 - gap) / (Math.PI * 2)) * S;
    const j0 = Math.floor(u0) - 1;
    const n = Math.ceil(u1) + 1 - j0;
    if (n >= S) geometry.setDrawRange(0, triangles.length);
    else geometry.setDrawRange((((j0 % S) + S) % S) * column, n * column);
  }

  /** The far land's surface at (x, z): the height its triangles draw there. */
  function heightAt(x, z) {
    const dx = x - CENTRE[0];
    const dz = z - CENTRE[1];
    const r = Math.min(Math.hypot(dx, dz), GRID.radius - 1e-6);
    let lo = 0;
    let hi = rings.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rings[mid] <= r) lo = mid; else hi = mid; }
    const a = ((Math.atan2(dz, dx) / (Math.PI * 2)) * S + S) % S;
    const j = Math.floor(a);
    const p = (v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    const tris = lo === 0
      ? [[vertex(0, 0), vertex(1, j + 1), vertex(1, j)]]
      : [[vertex(lo, j), vertex(lo, j + 1), vertex(lo + 1, j)], [vertex(lo, j + 1), vertex(lo + 1, j + 1), vertex(lo + 1, j)]];
    let best = null;
    let bestOut = Infinity;
    const px = CENTRE[0] + (dx / (Math.hypot(dx, dz) || 1)) * r;
    const pz = CENTRE[1] + (dz / (Math.hypot(dx, dz) || 1)) * r;
    for (const [i0, i1, i2] of tris) {
      const [A, B, C] = [p(i0), p(i1), p(i2)];
      const det = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
      const l1 = ((B[2] - C[2]) * (px - C[0]) + (C[0] - B[0]) * (pz - C[2])) / det;
      const l2 = ((C[2] - A[2]) * (px - C[0]) + (A[0] - C[0]) * (pz - C[2])) / det;
      const l3 = 1 - l1 - l2;
      const out = Math.max(0, -l1, -l2, -l3);
      if (out < bestOut) { bestOut = out; best = l1 * A[1] + l2 * B[1] + l3 * C[1]; }
    }
    return best;
  }

  const gramedlaAt = t => {
    const s = (Math.min(FAR.to, Math.max(FAR.from, t)) - FAR.from) * GRAMEDLA.speed;
    const h = THREE.MathUtils.degToRad(GRAMEDLA.heading);
    const x = GRAMEDLA.from[0] + Math.cos(h) * s;
    const z = GRAMEDLA.from[1] + Math.sin(h) * s;
    return { x, z, y: heightAt(x, z), heading: GRAMEDLA.heading, height: GRAMEDLA.height * GRAMEDLA.scale };
  };
  // The mist: soft cards that turn about the vertical to face the camera, one mesh; two of them Grameðla's, centred on her as she
  // walks past the middle of F.
  const cards = MIST.map(([x, z, width, height, opacity], k) => ({ x, z, width, height, opacity, y: heightAt(x, z) + height * 0.17, seed: k * 1.37 + seed }));
  const her = gramedlaAt(BEATS.F + 3);
  const toVista = new THREE.Vector2(VISTA[0] - her.x, VISTA[1] - her.z).normalize();
  cards.push(
    { x: her.x - toVista.x * 150, z: her.z - toVista.y * 150, width: 560, height: 240, opacity: 0.85, y: her.y + her.height * 0.6, seed: 11.3 },
    { x: her.x + toVista.x * 90, z: her.z + toVista.y * 90, width: 300, height: 110, opacity: 0.4, y: her.y + her.height * 0.4, seed: 12.9 },
  );
  const mist = mistMesh(cards);

  // Kambeðla's plates: a few soft lilac lights along her back, in her glade.
  const kambedlaY = heightAt(KAMBEDLA.x, KAMBEDLA.z) + KAMBEDLA.above;
  const glow = glowPoints(KAMBEDLA, kambedlaY);

  const group = new THREE.Group();
  group.name = 'Far land (group)';
  group.visible = false;
  group.add(ground, mist.mesh, glow.points);

  // Grameðla: her model's light level (world/props/far-friends.js), on the far land, made when the chapter says (load()).
  const friends = createFarFriends(world, {
    friends: {
      gramedla: {
        position: [GRAMEDLA.from[0], 0, GRAMEDLA.from[1]], heading: GRAMEDLA.heading, clip: 'walk', find: false, heightAt,
        tint: base => { const dark = base.clone(); dark.color.set(GRAMEDLA.tint); dark.roughness = 1; return dark; },
      },
    },
    defer: true,
  });
  let made = null;
  const setUp = () => {
    const actor = friends.actorOf('gramedla');
    if (actor && !made) {
      made = actor;
      actor.root.scale.setScalar(GRAMEDLA.scale);
      actor.play('walk', { fade: 0, timeScale: GRAMEDLA.walk });
    }
  };
  let roarAt = null;

  const level = t => {
    if (t < KAMBEDLA.window[0] || t > KAMBEDLA.window[1]) return 0;
    return Math.max(...KAMBEDLA.blinks.map(b => Math.exp(-(((t - b) / KAMBEDLA.width) ** 2))));
  };

  let shown = false;
  let showing = false;
  let ownFar = null; // the camera's own far plane, while it sees further
  let last = null;
  const fogColour = new THREE.Color();
  function update(t, camera) {
    const on = shown && t >= FAR.from && t < FAR.to;
    group.visible = on;
    if (on !== showing) friends.show(on);
    showing = on;
    if (camera) {
      if (on && camera.far < FAR_PLANE) { ownFar = camera.far; camera.far = FAR_PLANE; camera.updateProjectionMatrix(); }
      if (!on && ownFar !== null) { camera.far = ownFar; ownFar = null; camera.updateProjectionMatrix(); }
    }
    const dt = last === null ? 0 : Math.min(0.1, Math.max(0, t - last));
    last = t;
    if (!on) return;
    if (camera) slice(camera);
    else geometry.setDrawRange(0, triangles.length);
    glow.uniforms.uLevel.value = level(t);
    if (world.scene?.fog) {
      world.scene.fog.color.getRGB(fogColour, THREE.SRGBColorSpace);
      mist.uniforms.uColour.value.set(fogColour.r, fogColour.g, fogColour.b);
      haze.value.set(lerp(fogColour.r, hazeSky.r, HAZE.blue), lerp(fogColour.g, hazeSky.g, HAZE.blue), lerp(fogColour.b, hazeSky.b, HAZE.blue));
    }
    const pixels = world.renderer?.domElement?.height ?? 800;
    if (camera) glow.uniforms.uPixel.value = pixels / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const actor = friends.actorOf('gramedla');
    if (actor) {
      setUp();
      const p = gramedlaAt(t);
      actor.place(p.x, p.z, p.heading);
      if (roarAt !== null && t - roarAt > (actor.clips.get('roar')?.duration ?? 3) / GRAMEDLA.walk) {
        roarAt = null;
        actor.play('walk', { fade: 0.6, timeScale: GRAMEDLA.walk });
      }
    }
    if (camera) friends.update(dt, camera, pixels);
  }

  return {
    group, ground, peaks: PEAKS.map(([x, z]) => ({ x, z })), heightAt, update,
    show(on = true) { shown = Boolean(on); },
    get shown() { return shown; },
    prefetch: () => friends.prefetch(),
    load: () => friends.load().then(setUp),
    ready: () => friends.ready().then(setUp),
    /** How deep in the mist `point` is: 0 out of it, 1 or more inside a card. */
    mistAt(point) {
      let sum = 0;
      for (const c of cards) {
        const across = Math.hypot(point.x - c.x, point.z - c.z) / (c.width / 2);
        const up = Math.abs(point.y - c.y) / (c.height / 2);
        sum += c.opacity * (1 - smooth(across)) * (1 - smooth(up));
      }
      return sum;
    },
    gramedla: {
      get shadow() { return friends.actorOf('gramedla')?.root ?? null; },
      at: gramedlaAt,
      scale: GRAMEDLA.scale,
      /** She roars (her roar clip, slowed as her walk is), far off; the chapter plays the sound. */
      roar() {
        const actor = friends.actorOf('gramedla');
        roarAt = last ?? 0;
        actor?.play('roar', { fade: 0.3, timeScale: GRAMEDLA.walk, once: true });
      },
    },
    kambedla: { glow: glow.points, level },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      mist.dispose();
      glow.dispose();
      friends.dispose();
    },
  };
}

const MIST_VERTEX = /* glsl */`
attribute vec3 aCentre;
attribute vec2 aCorner;
attribute vec4 aCard; // width, height, opacity, seed
varying vec2 vUv;
varying float vOpacity;
varying float vSeed;
void main() {
  vec3 toCamera = cameraPosition - aCentre;
  toCamera.y = 0.0;
  vec3 facing = normalize(toCamera + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(facing.z, 0.0, -facing.x);
  vec3 p = aCentre + right * aCorner.x * aCard.x * 0.5 + vec3(0.0, aCorner.y * aCard.y * 0.5, 0.0);
  vUv = aCorner;
  vOpacity = aCard.z;
  vSeed = aCard.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const MIST_FRAGMENT = /* glsl */`
uniform vec3 uColour;
uniform vec3 uLit;
varying vec2 vUv;
varying float vOpacity;
varying float vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 q = vUv;
  float n = noise(q * vec2(2.6, 1.8) + vSeed * 7.0) * 0.6 + noise(q * vec2(6.5, 4.5) + vSeed * 3.0) * 0.4;
  float edge = 1.0 - smoothstep(0.3, 1.0, length(q * vec2(1.0, 1.2)) + (n - 0.5) * 0.55);
  float alpha = vOpacity * edge * (0.5 + 0.5 * n);
  vec3 colour = mix(uColour, uLit, clamp(smoothstep(-0.7, 0.9, q.y) * 0.55 + (n - 0.5) * 0.3, 0.0, 1.0));
  gl_FragColor = vec4(colour, alpha);
}`;

/** The mist's cards as one mesh of quads, each turned to the camera in its vertex shader. */
function mistMesh(cards) {
  const centres = [], corners = [], data = [], index = [];
  cards.forEach((c, k) => {
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      centres.push(c.x, c.y, c.z);
      corners.push(cx, cy);
      data.push(c.width, c.height, c.opacity, c.seed);
    }
    index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(centres, 3)); // three needs one; the shader places the corners
  geometry.setAttribute('aCentre', new THREE.Float32BufferAttribute(centres, 3));
  geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute(corners, 2));
  geometry.setAttribute('aCard', new THREE.Float32BufferAttribute(data, 4));
  geometry.setIndex(index);
  const box = new THREE.Box3();
  for (const c of cards) box.expandByPoint(new THREE.Vector3(c.x - c.width / 2, c.y - c.height / 2, c.z - c.width / 2)).expandByPoint(new THREE.Vector3(c.x + c.width / 2, c.y + c.height / 2, c.z + c.width / 2));
  geometry.boundingBox = box;
  geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const uniforms = { uColour: { value: new THREE.Vector3(0.87, 0.9, 0.87) }, uLit: { value: new THREE.Vector3(1, 0.98, 0.94) } };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: MIST_VERTEX, fragmentShader: MIST_FRAGMENT, transparent: true, depthWrite: false, fog: false,
  });
  material.name = 'far-mist';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Far mist';
  mesh.renderOrder = 3;
  return { mesh, uniforms, dispose() { geometry.dispose(); material.dispose(); } };
}

const GLOW_VERTEX = /* glsl */`
uniform float uSize;
uniform float uPixel;
uniform float uLevel;
attribute float aSize;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * aSize * uPixel / max(1.0, -mvPosition.z) * step(0.01, uLevel);
  gl_Position = projectionMatrix * mvPosition;
}`;

const GLOW_FRAGMENT = /* glsl */`
uniform vec3 uColour;
uniform float uLevel;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float halo = exp(-d * d * 5.0) * 1.4;
  float core = exp(-d * d * 60.0) * 0.6;
  gl_FragColor = vec4((uColour * halo + vec3(core)) * uLevel, 1.0);
}`;

/** Kambeðla's plates as a few points along her back (additive, so they only light what is behind them). */
function glowPoints(spot, y) {
  const positions = [];
  const sizes = [];
  for (let k = 0; k < 5; k++) {
    positions.push(spot.x + (k - 2) * 1.4, y + 0.8 * Math.sin((k / 4) * Math.PI), spot.z + (k - 2) * 0.4);
    sizes.push(0.7 + 0.3 * Math.sin((k / 4) * Math.PI));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += spot.size;
  const colour = spot.colour.match(/[0-9a-f]{2}/gi).map(h => parseInt(h, 16) / 255);
  const uniforms = { uColour: { value: new THREE.Vector3(...colour) }, uLevel: { value: 0 }, uSize: { value: spot.size }, uPixel: { value: 900 } };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  });
  material.name = 'far-kambedla-glow';
  const points = new THREE.Points(geometry, material);
  points.name = 'Kambeðla\'s plates (far)';
  points.renderOrder = 4;
  return { points, uniforms, dispose() { geometry.dispose(); material.dispose(); } };
}
