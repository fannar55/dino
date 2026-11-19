// The water of Árdalurinn (chapter 4's flight): the river as one ribbon at its level from the Fen to above the falls, broken at the
// lip; the falling water as a plane in front of the cliff; the far pool as a disc, and its own beds of reed (poolPlants). The whole
// river is one draw call, cheaper than a piece per section.
//
// The ribbon is five vertices across, each carrying what the game's water (world/props/water.js) draws from: aWater (its distance to
// the shore, negative inside, its depth, and its white water, 0 to 1) and aFlow (the way and the speed it runs, m/s). The river is
// lazy below the rapids (0.4 m/s), quickens through them to 2.5 m/s in the gorge, and runs on the upper reach above the falls at
// 0.8 m/s, faster again toward the lip. White water starts where the rapids begin (the route's RIVER[7]), grows toward the gorge,
// and is full in it and in the plunge pool; there is none in the lazy reach nor above the falls (the lip's foam is the falls').
//
// Above the falls the land's streams and ponds (terrain.js: waters) are one more mesh (createLandWaters), with their own lilies and
// reed (landPlants), and nothing else grows in them.
import * as THREE from 'three';
import { RIVER, GORGE } from '../../chapters/kafli4-route.js';
import { FOREST } from '../forest/config.js';

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

/**
 * The far pool's own plants (route.pool, chapters/kafli4-route.js: FAR_POOL): its beds of reed, set out the same way each time, as
 * props for the banks to grow (banks.js: plantSteps), and where no other plant may grow (`keep`: a way to walk, a spot to stand on, a
 * camera's place; and each bed), as the banks' `clear`. A bed's `lane` ({ from, to, wide }) is a way through it with no reed in it.
 * Returns { props, clear }.
 */
export function poolPlants(pool, heightAt) {
  const props = [];
  const clear = [];
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  (pool.reeds ?? []).forEach((bed, b) => {
    for (let i = 0; i < bed.count; i++) {
      const k = (i + 0.5) / bed.count;
      const angle = i * GOLDEN + b;
      const r = bed.radius * Math.sqrt(k) + 0.35 * Math.sin(i * 12.9898 + b * 78.233); // a sunflower's spiral, a little uneven
      const x = bed.at[0] + r * Math.cos(angle);
      const z = bed.at[1] + r * Math.sin(angle);
      if (bed.lane && fromSegment(x, z, bed.lane.from, bed.lane.to) < bed.lane.wide) continue;
      const every = bed.tallEvery ?? 3;
      const tall = i % every === every - 1; // a tall horsetail in every `every`, the rest reed
      const name = tall ? 'horsetailTall' : 'horsetailReed';
      const variant = i % FOREST.trees.variants[name];
      props.push({ name, variant, x, y: heightAt(x, z), z, rot: (angle * 3.1) % (2 * Math.PI), scale: 0.95 + 0.3 * ((i * 7) % 5) / 4 });
    }
    clear.push({ x: bed.at[0], z: bed.at[1], r: bed.radius + 0.5 });
  });
  for (const spot of pool.keep ?? []) {
    if (spot.at) {
      clear.push({ x: spot.at[0], z: spot.at[1], r: spot.r });
      continue;
    }
    const length = Math.hypot(spot.to[0] - spot.from[0], spot.to[1] - spot.from[1]);
    const steps = Math.max(1, Math.ceil(length / spot.r));
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      clear.push({ x: spot.from[0] + (spot.to[0] - spot.from[0]) * k, z: spot.from[1] + (spot.to[1] - spot.from[1]) * k, r: spot.r });
    }
  }
  return { props, clear };
}

/** How far (x, z) is from the segment from `a` to `b` ([x, z] each), seen from above. */
function fromSegment(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k);
}

const LAND = { lilies: 6, reed: { count: 14, radius: 3.5, at: 225 }, stream: 0.6, step: 1.5 }; // the ponds' plants (reed: degrees round), a stream's speed (m/s)

/**
 * The plants of the land's ponds (terrain.waters): lilies on each pond's water and a bed of reed at its rim (as poolPlants grows the
 * far pool's), and where nothing else may grow: each pond's water and each stream's (circles along it). Returns { props, clear }.
 */
export function landPlants(waters, heightAt) {
  const props = [];
  const clear = [];
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  waters.ponds.forEach((pond, p) => {
    for (let i = 0; i < LAND.lilies; i++) {
      const a = i * GOLDEN + p;
      const r = pond.radius * 0.72 * Math.sqrt((i + 0.5) / LAND.lilies);
      props.push({ name: 'waterLily', variant: (i + p) % FOREST.trees.variants.waterLily, x: pond.x + r * Math.cos(a), y: pond.level + 0.012, z: pond.z + r * Math.sin(a), rot: a * 2.3, scale: 1.6 });
    }
    const a = (LAND.reed.at * Math.PI) / 180;
    const bed = { at: [pond.x + (pond.radius + 1) * Math.cos(a), pond.z + (pond.radius + 1) * Math.sin(a)], radius: LAND.reed.radius, count: LAND.reed.count };
    const reed = poolPlants({ reeds: [bed] }, heightAt);
    props.push(...reed.props.map(r => ({ ...r, y: Math.max(r.y, pond.level) })));
    clear.push(...reed.clear, { x: pond.x, z: pond.z, r: pond.radius });
  });
  for (const stream of waters.streams) {
    for (let m = 0; m <= stream.length; m += LAND.step) {
      const [x, z] = stream.pointAt(m);
      clear.push({ x, z, r: stream.half + 0.4 });
    }
  }
  return { props, clear };
}

/**
 * The land's streams and ponds as one mesh (one draw call), with the water's aWater and aFlow: each stream a ribbon at its level,
 * running down it at LAND.stream m/s, a little wider than its water so its edge tucks under the banks; each pond a disc as the far
 * pool's. Null if there are none.
 */
export function createLandWaters(waters, material) {
  const positions = [];
  const water = [];
  const flow = [];
  const indices = [];
  const n = ACROSS.length;
  for (const stream of waters.streams) {
    const first = positions.length / 3;
    const rows = Math.max(1, Math.ceil(stream.length / LAND.step));
    for (let r = 0; r <= rows; r++) {
      const m = Math.min(stream.length, r * LAND.step);
      const [x, z, [sx, sz]] = stream.pointAt(m);
      const level = stream.levelAt(m);
      const wide = stream.half + 0.15;
      for (const a of ACROSS) {
        positions.push(x + sx * a * wide, level, z + sz * a * wide);
        water.push(-wide * (1 - Math.abs(a)), 0.45 * (1 - Math.abs(a)), 0);
        flow.push(sz * LAND.stream, -sx * LAND.stream); // down the stream (its side is the way down turned to the right)
      }
      if (r > 0) {
        const a0 = first + (r - 1) * n;
        const b0 = first + r * n;
        for (let k = 0; k < n - 1; k++) indices.push(a0 + k, b0 + k, a0 + k + 1, a0 + k + 1, b0 + k, b0 + k + 1);
      }
    }
  }
  const SIDES = 32;
  for (const pond of waters.ponds) {
    const centre = positions.length / 3;
    const edge = pond.radius + 1;
    positions.push(pond.x, pond.level, pond.z);
    water.push(-edge, DEPTH, 0);
    flow.push(0, 0);
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      positions.push(pond.x + edge * Math.cos(a), pond.level, pond.z + edge * Math.sin(a));
      water.push(0, 0, 0);
      flow.push(0, 0);
      indices.push(centre, centre + 1 + ((k + 1) % SIDES), centre + 1 + k);
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geometry.setAttribute('aWater', new THREE.Float32BufferAttribute(water, 3));
  geometry.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Árdalur upper waters';
  mesh.receiveShadow = true;
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
