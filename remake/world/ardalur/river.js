// The water of Árdalurinn (chapter 4's flight): the river as one ribbon at its level from the Fen to above the falls, broken at the
// lip; the falling water as a plane in front of the cliff; the far pool as a disc. The whole river is one draw call, cheaper than a
// piece per section.
//
// The ribbon is five vertices across, each carrying what the game's water (world/props/water.js) draws from: aWater (its distance to
// the shore, negative inside, its depth, and its white water, 0 to 1) and aFlow (the way and the speed it runs, m/s). The river is
// lazy below the rapids (0.4 m/s), quickens through them to 2.5 m/s in the gorge, and runs on the upper reach above the falls at
// 0.8 m/s, faster again toward the lip. White water starts where the rapids begin (the route's RIVER[7]), grows toward the gorge,
// and is full in it and in the plunge pool; there is none in the lazy reach nor above the falls (the lip's foam is the falls').
import * as THREE from 'three';
import { RIVER, GORGE } from '../../chapters/kafli4-route.js';

const STEP = 3; // metres between the ribbon's rows
const ACROSS = [-1, -0.5, 0, 0.5, 1]; // the ribbon's vertices across the river, as shares of its half width
const DEPTH = 1.6; // m of water in the middle of the river (the bed: terrain.js)

/** Where the rapids begin (the route's RIVER[7]) and where they are full (the gorge), in metres up the river from where she joins it. */
export const RAPIDS = {
  from: RIVER.slice(2, 8).reduce((d, p, i, list) => (i ? d + Math.hypot(p[0] - list[i - 1][0], p[1] - list[i - 1][1]) : 0), 0),
  full: GORGE.from,
};
export const FLOW = { lazy: 0.4, rapids: 2.5, upper: 0.8, lip: 30 };

const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/** How fast the river runs (m/s) `d` metres up from where she joins it. */
export function flowAt(route, d) {
  const falls = route.river.falls;
  if (d >= falls) return FLOW.upper + (FLOW.rapids - FLOW.upper) * smooth((falls + FLOW.lip - d) / FLOW.lip); // the upper reach, toward the lip
  if (d <= RAPIDS.from) return FLOW.lazy;
  return FLOW.lazy + (FLOW.rapids - FLOW.lazy) * smooth((d - RAPIDS.from) / (RAPIDS.full - RAPIDS.from));
}

/** How white the river is (0 to 1) `d` metres up from where she joins it. */
export function whiteAt(route, d) {
  if (d <= RAPIDS.from || d >= route.river.falls) return 0;
  if (d < RAPIDS.full) return 0.7 * smooth((d - RAPIDS.from) / (RAPIDS.full - RAPIDS.from));
  return 0.7 + 0.3 * smooth((d - RAPIDS.full) / 100);
}

/** The river's surface: one mesh, its ribbon facing up, with the water's aWater and aFlow. */
export function createRiverSurface(route, material) {
  const river = route.river;
  const start = river.points[0].d;
  const end = river.length;
  const positions = [];
  const water = [];
  const flow = [];
  const indices = [];
  const n = ACROSS.length;
  const strip = (from, to) => {
    const first = positions.length / 3;
    const rows = Math.max(1, Math.ceil((to - from) / STEP));
    for (let r = 0; r <= rows; r++) {
      const d = Math.min(to, from + r * STEP);
      const at = river.at(d);
      // across the river, from its direction over 12 m: at a sharp corner of the polyline the inner edge would fold back on itself
      const ahead = river.at(Math.min(to, d + 6));
      const behind = river.at(Math.max(from, d - 6));
      const along = Math.hypot(ahead.x - behind.x, ahead.z - behind.z) || 1;
      const dx = (ahead.x - behind.x) / along;
      const dz = (ahead.z - behind.z) / along;
      const speed = flowAt(route, d);
      const white = whiteAt(route, d);
      for (const k of ACROSS) {
        positions.push(at.x - dz * at.half * k, at.level, at.z + dx * at.half * k);
        const inside = (1 - Math.abs(k)) * at.half; // metres to the nearer shore
        water.push(-inside, DEPTH * smooth(inside / at.half * 2), white);
        flow.push(-dx * speed, -dz * speed); // downstream
      }
      if (r > 0) {
        const a = first + (r - 1) * n;
        // facing up: seen from its back a double-sided face is lit from below
        for (let c = 0; c < n - 1; c++) indices.push(a + c + 1, a + n + c, a + c, a + c + 1, a + n + c + 1, a + n + c);
      }
    }
  };
  strip(start, river.falls - 0.01); // below the falls, up to the lip
  strip(river.falls, end); // above it
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aWater', new THREE.Float32BufferAttribute(water, 3));
  geometry.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  geometry.setIndex(indices);
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1; // every normal up
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Árdalur river';
  mesh.receiveShadow = true;
  if (material.isMeshLambertMaterial) material.side = THREE.DoubleSide;
  return mesh;
}

/** The falling water: a plane in front of the cliff from the lip to the plunge pool. */
export function createFallsSlot(falls, material) {
  const geometry = new THREE.PlaneGeometry(falls.width, falls.top - falls.base);
  geometry.rotateY(Math.PI / 2); // facing east, down the valley
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Árdalur falls (slot)';
  mesh.position.set(falls.face - 0.5, (falls.top + falls.base) / 2, falls.z);
  return mesh;
}

/** The far pool's surface (with the water's aWater and aFlow when drawn as water: a still pool, its shore fading in). */
export function createPoolSurface(pool, material) {
  const geometry = new THREE.CircleGeometry(pool.radius + 1, 40);
  geometry.rotateX(-Math.PI / 2);
  const { position } = geometry.attributes;
  const water = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const inside = pool.radius + 1 - Math.hypot(position.getX(i), position.getZ(i));
    water[i * 3] = -inside;
    water[i * 3 + 1] = DEPTH * smooth(inside / 6);
  }
  geometry.setAttribute('aWater', new THREE.BufferAttribute(water, 3));
  geometry.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Árdalur far pool';
  mesh.position.set(pool.center[0], pool.level, pool.center[1]);
  mesh.receiveShadow = true;
  return mesh;
}
