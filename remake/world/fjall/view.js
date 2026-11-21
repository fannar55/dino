// The forest seen from the slope (chapter 6, scene 3: the view east): the valley's own trees as their cards over the far land, so
// the land 0.4 to 3.3 km below the ledge reads as forest and not as a painted map. In chapter 4 the valley's sections and their belt
// (world/ardalur/belt.js) stood there; chapter 6 lets the valley go before the slope, so the slope plants its own, as the belt does:
// each tree the picture of its own coarse model (world/forest/cards.js createCardAtlas), lit as the tree is (createCardMaterial),
// fading into the far land's haze as the land does. One mesh, always drawn (two triangles a tree).
//
//   const trees = viewForest(world, { far, terrain, route, haze, library, from, seed })
//     trees.mesh, trees.count, trees.dispose()
//
// Where they stand: the far land's forest (not the Fen's gold, a glade, a pond or the mountains), never in the river, the pool or
// on a steep; within VIEW.bearing degrees of east from `from`. On the far land's canopy (its surface stands 13 to 19 m over the
// forest floor there) a tree's foot is sunk under it, so only its crown rises over it; in the valley's corridor (the far land there
// 2 m under the valley's own ground) it stands on the ground.
import * as THREE from 'three';
import { createCardAtlas, createCardMaterial } from '../forest/cards.js';
import { seeded } from './ground.js';

const VIEW = { near: 150, far: 4200, farthest: 3200, bearing: 62, spacing: 17, chance: 0.9, thin: 2000, sky: 0.55 }; // thin: past it half the trees, each bigger
const KINDS = [['broadleaf', 4, 0.55, [1.3, 1.7]], ['araucaria', 2, 0.25, [1.1, 1.45]], ['swampConifer', 2, 0.2, [1.2, 1.55]]];
const CANOPY_SINK = 15; // m a foot goes under the far land's canopy
const STEEP = 0.7;
const GLADE = { x: -832, z: -192, r: 125 }; // Kambeðla's glade (far-land.js KAMBEDLA): open meadow round her
const PONDS = [[-560, 760, 70]];
const FEN_FROM = -560; // x past which the far land is painted the Fen's gold (far-land.js: smooth((x + 650) / 250)), with no canopy
const FEN = { x: -60, z: 90, r: 240 }; // the Fen itself (spec: Fenið, round Þórseðla's snag), kept open: gold reed, no trees
const MOUNTAIN = 135; // m up past which the far land is the mountains' foot and sides
const UPPER = { x: -1600, z: 65, half: 40 }; // the river above the valley's, west of x, into the mountains (far-land.js UPPER)
// far-land.js UPPER's line: along it the far land is open meadow (no crowns over its floor) out to OPEN m, where trees stand on it
const UPPER_LINE = [[-2250, 50], [-2050, 66], [-1850, 58], [-1680, 80]];
const OPEN = 75;
const fromLine = (line, x, z) => {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], ex = bx - ax, ez = bz - az;
    const k = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - ax - ex * k, z - az - ez * k));
  }
  return best;
};

export function viewForest(world, { far, terrain, route, haze, library, from, seed = 4, leafTone = 1, river = null }) {
  const entries = KINDS.flatMap(([name, variants]) => Array.from({ length: variants }, (_, variant) => ({ name, variant, model: library.get(name, variant, 2, {}) })));
  const atlas = createCardAtlas(world.renderer ?? null, entries, { leafTone });
  const material = createCardMaterial(atlas, { coverage: Boolean(world.q?.antialias), haze });
  material.fog = false; // as the far land under them (slope.js): the far haze only, not the height fog lying white on the valley floor
  const rng = seeded(seed * 71 + 5);
  const trees = [];
  const east = 0, half = THREE.MathUtils.degToRad(VIEW.bearing);
  const S = VIEW.spacing;
  const x0 = from[0] + VIEW.near * 0.5, x1 = from[0] + VIEW.far, z0 = from[1] - VIEW.far * Math.sin(half), z1 = from[1] + VIEW.far * Math.sin(half);
  for (let z = z0; z < z1; z += S) {
    for (let x = x0; x < x1; x += S) {
      const roll = rng(), jx = rng(), jz = rng(), pick = rng(), size = rng(), turn = rng(), variant = rng();
      if (roll > VIEW.chance) continue;
      const px = x + jx * S, pz = z + jz * S;
      const dx = px - from[0], dz = pz - from[1], d = Math.hypot(dx, dz);
      if (d < VIEW.near || d > VIEW.far || Math.abs(Math.atan2(dz, dx) - east) > half) continue;
      if (Math.hypot(px - FEN.x, pz - FEN.z) < FEN.r * (0.85 + 0.3 * jz)) continue;
      const far2 = d > VIEW.thin, far3 = d > VIEW.farthest;
      if ((far2 && variant < 0.5) || (far3 && variant < 0.75)) continue;
      if (Math.hypot(px - GLADE.x, pz - GLADE.z) < GLADE.r * (0.85 + 0.3 * jz)) continue;
      if (PONDS.some(([qx, qz, r]) => Math.hypot(px - qx, pz - qz) < r)) continue;
      const upper = fromLine(UPPER_LINE, px, pz);
      if (river ? upper < 11 * river.widen + river.more + 8 : px < UPPER.x && Math.abs(pz - UPPER.z) < UPPER.half) continue;
      const land = far.heightAt(px, pz);
      if (land > MOUNTAIN) continue;
      const w = terrain.where(px, pz);
      if (w.e < (river ? 8 * river.widen + river.more : 6) || w.toPool < route.pool.radius + (river ? river.poolMore + 8 : 10)) continue;
      const valley = terrain.heightAt(px, pz);
      const corridor = Math.abs(land - (valley - 2)) < 1.5;
      const bare = px > FEN_FROM || (river && upper < OPEN); // the far land's gold there, and the meadow along the upper river, have no canopy over their floor
      const ground = corridor ? valley : land;
      const steep = Math.hypot(far.heightAt(px + 6, pz) - far.heightAt(px - 6, pz), far.heightAt(px, pz + 6) - far.heightAt(px, pz - 6)) / 12;
      if (steep > STEEP) continue;
      let r = pick, kind = KINDS[0];
      for (const k of KINDS) { if ((r -= k[2]) <= 0) { kind = k; break; } }
      const [name, variants, , [lo, hi]] = kind;
      const card = atlas.card(name, Math.floor(variant * variants));
      if (!card) continue;
      const scale = (lo + size * (hi - lo)) * (far3 ? 1.75 : far2 ? 1.3 : 1);
      trees.push({ x: px, z: pz, y: corridor || bare ? ground - 0.5 : ground - CANOPY_SINK * (0.85 + 0.3 * size), scale, rot: turn * Math.PI * 2, card });
    }
  }
  // far ones first: the near ones draw over them (the cards are cut out, so this only saves overdraw)
  trees.sort((a, b) => Math.hypot(b.x - from[0], b.z - from[1]) - Math.hypot(a.x - from[0], a.z - from[1]));
  const n = trees.length * 4;
  const centre = new Float32Array(n * 3), corner = new Float32Array(n * 2), sizes = new Float32Array(n * 2), uv = new Float32Array(n * 2), lit = new Float32Array(n * 3);
  const index = new (n > 65535 ? Uint32Array : Uint16Array)(trees.length * 6);
  trees.forEach((p, t) => {
    const { uv: [u0, v0, u1, v1], width, height, bottom } = p.card;
    const w = width * p.scale, h = height * p.scale, y = p.y + bottom * p.scale;
    const flip = Math.sin(p.rot) < 0;
    [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]].forEach(([cx, cy], q) => {
      const v = t * 4 + q;
      centre.set([p.x, y, p.z], v * 3);
      corner.set([cx, cy], v * 2);
      sizes.set([w, h], v * 2);
      uv.set([(cx < 0) !== flip ? u0 : u1, cy ? v1 : v0], v * 2);
      lit.set([0, VIEW.sky, flip ? -1 : 1], v * 3);
    });
    const b = t * 4;
    index.set([b, b + 1, b + 2, b, b + 2, b + 3], t * 6);
  });
  const geometry = new THREE.BufferGeometry();
  const at = new THREE.BufferAttribute(centre, 3);
  geometry.setAttribute('position', at);
  geometry.setAttribute('aCentre', at);
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 2));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('aCard', new THREE.BufferAttribute(lit, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 40;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Slope view: far trees';
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.renderOrder = 6;
  return {
    mesh, count: trees.length, placements: trees,
    dispose() { geometry.dispose(); material.dispose(); atlas.dispose(); },
  };
}
