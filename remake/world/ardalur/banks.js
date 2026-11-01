// What grows on the banks of Árdalurinn, in grey (chapter 4's flight): cones for the plants at the real heights of the species they
// stand in for (world/forest/species.js), boxes for the rocks, scattered over a section's own cells by what the ground is there (the
// Fen, the water's edge, the valley sides, the gorge's rim, the land above the falls). Nothing grows on the walls or in the water,
// nothing near enough the route to be flown into, and nothing on Mosi's two cameo paths. Two draw calls a section. The real plants
// come in chunk 2 (Task 7).
import * as THREE from 'three';
import { GRID } from './terrain.js';

// The stand-ins: [species, height range in metres, radius as a share of the height].
const PLANTS = {
  reed: ['horsetailReed', [1.4, 2.0], 0.12],
  horsetail: ['horsetailTall', [2.2, 3.2], 0.12],
  cycad: ['cycad', [1.8, 2.8], 0.4],
  bush: ['bush', [1.2, 2.0], 0.6],
  treeFern: ['treeFern', [4, 6], 0.35],
  broadleaf: ['broadleaf', [10, 14], 0.32],
  araucaria: ['araucaria', [14, 19], 0.18],
  swampConifer: ['swampConifer', [11, 15], 0.2],
};
// What grows where: [plant, chance per 10 m by 10 m].
const ZONES = {
  fen: [['reed', 1.2], ['horsetail', 0.4], ['swampConifer', 0.05], ['bush', 0.15]],
  edge: [['reed', 1.6], ['horsetail', 0.6], ['rock', 0.25]],
  valley: [['broadleaf', 0.14], ['araucaria', 0.08], ['treeFern', 0.22], ['cycad', 0.25], ['bush', 0.4], ['rock', 0.12]],
  rim: [['bush', 0.5], ['cycad', 0.2], ['araucaria', 0.05], ['rock', 0.3]],
};
const CLEAR = 12; // metres about the route seen from above inside which nothing may stand taller than her path less 3 m

/** A seeded random number generator (mulberry32). */
export function seeded(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The steps that plant one section's ground (a generator for the build queue): returns a group with the cones and the boxes. */
export function* bankSteps({ terrain, index, route, ground, seed, materials }) {
  const { own, grid: { gx0, gz0, W } } = ground;
  const rng = seeded(seed);
  const cones = [];
  const boxes = [];
  const cameoPaths = [route.cameos.bank.path, route.cameos.rim.path];
  const nearCameo = (x, z) => cameoPaths.some(path => path.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7));
  const near = {};
  const CELL = 10; // metres: one roll of the dice per 10 m square, at its own spot in it
  const per = Math.round(CELL / GRID);
  const cellsAcross = W - 1;
  const rows = own.length / cellsAcross;
  for (let j = 0; j < rows; j += per) {
    for (let i = 0; i < cellsAcross; i += per) {
      if (!own[j * cellsAcross + i]) continue;
      const x = (gx0 + i) * GRID + rng() * CELL;
      const z = (gz0 + j) * GRID + rng() * CELL;
      const w = terrain.where(x, z);
      let zone = null;
      if (w.e < 0.5) continue; // the water
      if (w.fen > 0.6) zone = 'fen';
      else if (w.e < 6 && w.gorge < 0.5) zone = 'edge';
      else if (w.gorge > 0.5 && w.e < 9) continue; // the walls
      else if (w.gorge > 0.5 && w.e < 32) zone = 'rim';
      else zone = 'valley';
      if (w.toPool < route.pool.radius + 2) continue;
      if (nearCameo(x, z)) continue;
      for (const [kind, chance] of ZONES[zone]) {
        if (rng() > chance) continue;
        const px = x + (rng() - 0.5) * 4;
        const pz = z + (rng() - 0.5) * 4;
        const y = terrain.heightAt(px, pz);
        if (kind === 'rock') {
          const size = 0.6 + rng() * 1.6;
          boxes.push([px, y + size * 0.3, pz, size * (1 + rng()), size, size * (0.8 + rng() * 0.6), rng() * Math.PI]);
          continue;
        }
        const [, [lo, hi], share] = PLANTS[kind];
        const height = lo + rng() * (hi - lo);
        const k = index.nearest(px, pz, CLEAR, near);
        if (k >= 0 && y + height > index.points[k].y - 3) continue; // she could fly into it
        cones.push([px, y, pz, height * share, height]);
      }
    }
    yield 'banks';
  }
  const group = new THREE.Group();
  group.name = 'Árdalur banks';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  if (cones.length) {
    const geometry = new THREE.ConeGeometry(1, 1, 7, 1, true);
    geometry.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, materials.plant, cones.length);
    cones.forEach(([x, y, z, r, h], i) => mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q.identity(), s.set(r, h, r))));
    mesh.name = 'Árdalur plants (grey)';
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  if (boxes.length) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, materials.rock, boxes.length);
    const up = new THREE.Vector3(0, 1, 0);
    boxes.forEach(([x, y, z, sx, sy, sz, turn], i) => mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q.setFromAxisAngle(up, turn), s.set(sx, sy, sz))));
    mesh.name = 'Árdalur rocks (grey)';
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return { group, plants: cones.length, rocks: boxes.length };
}
