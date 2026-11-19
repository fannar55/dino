// The forest on the horizon of the lush valley (banks.js LUSH.belt; chapter 4's flight): beyond the corridor of land the sections
// draw (terrain.js CORRIDOR, 160 m from her path), the valley's sides go on as forest, so the edge of the world is trees, not haze
// over nothing. Each section builds its own piece, of the land whose nearest point of her path is in that section, from `inner` to
// `outer` m from the path and below the falls (above them the far land stands in, from the crest of E: far-land.js):
//
//   - a strip of ground on a `cell` m grid, at the valley's own heights `sink` m under them (so it slips under the corridor's edge)
//     and in the valley's own paint (look.js groundPaint), one mesh, in the ground's material;
//   - on it the valley's own trees as their cards (world/forest/cards.js: each the picture of its own coarse model), always cards,
//     one a `spacing` m square at `chance`, less in a glade of the groves (`glade` of it where groveAt is 0), the Fen's swamp conifers
//     and broadleaves in the Fen and the valley's broadleaves, araucarias and tree ferns elsewhere; never in water, on a steep, or on a
//     still shot's line of sight (banks.js inView, the flight's and a chapter's views). One mesh, a range a card, culled as the plants
//     are (world/forest/batch.js cullBatches: the frustum, the haze), drawn after them.
//
//   beltSteps({ terrain, index, route, samples, seed, paint, groundMaterial, atlas, cardMaterial, inView, belt })
//     -> { group, ground, cards, trees }   (a generator for the build queue; group null when the section has no belt)
import * as THREE from 'three';
import { CORRIDOR } from './terrain.js';
import { FOREST } from '../forest/config.js';
import { groveAt } from './banks.js';

const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const SCALE = { broadleaf: [0.9, 1.2], araucaria: [0.75, 1.0], treeFern: [0.9, 1.4], swampConifer: [0.9, 1.15] };
const STEEP = 0.75; // rise over run past which no tree stands (banks.js: the same)

/** A seeded random number generator (mulberry32), as banks.js has it. */
function seeded(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when (x, z), whose nearest sample of her path is `k` at `dist` m, is this section's belt land. */
function beltLand(terrain, route, belt, samples, k, dist, x, z, inner) {
  if (k < samples[0] || k >= samples[1] || dist < inner || dist > belt.outer) return false;
  return terrain.where(x, z).d <= route.river.falls; // below the falls (above them the far land stands in)
}

export function* beltSteps({ terrain, index, route, samples, seed, paint, groundMaterial, atlas, cardMaterial, inView = () => false, belt, grove = 4 }) {
  const { points } = index;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = samples[0]; k < Math.min(samples[1], points.length); k++) {
    minX = Math.min(minX, points[k].x); maxX = Math.max(maxX, points[k].x);
    minZ = Math.min(minZ, points[k].z); maxZ = Math.max(maxZ, points[k].z);
  }
  const C = belt.cell;
  const reach = belt.outer + C;
  const gx0 = Math.floor((minX - reach) / C), gz0 = Math.floor((minZ - reach) / C);
  const W = Math.ceil((maxX + reach) / C) - gx0 + 1, H = Math.ceil((maxZ + reach) / C) - gz0 + 1;
  const out = {};
  // the cells: those whose middle is this section's belt land, from a little inside the corridor's edge (the strip slips under it)
  const own = new Uint8Array((W - 1) * (H - 1));
  let cells = 0;
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const x = (gx0 + i + 0.5) * C, z = (gz0 + j + 0.5) * C;
      const k = index.nearest(x, z, reach + C, out);
      if (k >= 0 && beltLand(terrain, route, belt, samples, k, out.dist, x, z, CORRIDOR - C)) { own[j * (W - 1) + i] = 1; cells++; }
    }
    if (j % 4 === 3) yield 'belt';
  }
  if (!cells) return { group: null, ground: null, cards: null, trees: 0 };

  // the ground strip
  const vertexOf = new Int32Array(W * H).fill(-1);
  const positions = [], normals = [], colours = [], rocks = [], indices = [];
  const height = (x, z) => terrain.heightAt(x, z) - belt.sink;
  const corner = (i, j) => {
    const id = j * W + i;
    if (vertexOf[id] >= 0) return vertexOf[id];
    const x = (gx0 + i) * C, z = (gz0 + j) * C;
    const y = height(x, z);
    const n = new THREE.Vector3(height(x - C, z) - height(x + C, z), 2 * C, height(x, z - C) - height(x, z + C)).normalize();
    vertexOf[id] = positions.length / 3;
    positions.push(x, y, z);
    normals.push(n.x, n.y, n.z);
    const [r, g, b, rock] = paint(x, z, y + belt.sink, n.y);
    colours.push(r, g, b);
    rocks.push(rock);
    return vertexOf[id];
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      if (!own[j * (W - 1) + i]) continue;
      const a = corner(i, j), b = corner(i + 1, j), c = corner(i, j + 1), d = corner(i + 1, j + 1);
      indices.push(a, c, b, b, c, d);
    }
    if (j % 4 === 3) yield 'belt';
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('aRock', new THREE.Float32BufferAttribute(rocks, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const ground = new THREE.Mesh(geometry, groundMaterial);
  ground.name = `Árdalur belt ground ${samples[0]}`;
  ground.receiveShadow = true;
  ground.renderOrder = 4; // after the plants, as the section's own ground
  ground.userData = { belt: true, triangles: indices.length / 3 };

  // the trees, on a grid of the whole valley's (so two sections' pieces meet without a seam), each spot jittered in its square
  const rng = seeded(seed);
  const S = belt.spacing;
  const trees = [];
  for (let sj = Math.floor((gz0 * C) / S); sj <= Math.ceil(((gz0 + H) * C) / S); sj++) {
    for (let si = Math.floor((gx0 * C) / S); si <= Math.ceil(((gx0 + W) * C) / S); si++) {
      const roll = rng(), jx = rng(), jz = rng(), pick = rng(), size = rng(), turn = rng(), variant = rng();
      const x = (si + jx) * S, z = (sj + jz) * S;
      const k = index.nearest(x, z, reach + C, out);
      if (k < 0 || !beltLand(terrain, route, belt, samples, k, out.dist, x, z, belt.inner)) continue;
      // its edge toward the river is ragged: in a glade of the groves it begins up to `ragged` m further out
      const g = groveAt(x, z, grove);
      if (out.dist < belt.inner + belt.ragged * (1 - smooth(g / 0.6))) continue;
      if (roll >= belt.chance * (belt.glade + (1 - belt.glade) * smooth(g / 0.5))) continue;
      const w = terrain.where(x, z);
      if (w.e < 2 || w.toPool < route.pool.radius + 5) continue;
      const slope = Math.hypot(terrain.heightAt(x + 1, z) - terrain.heightAt(x - 1, z), terrain.heightAt(x, z + 1) - terrain.heightAt(x, z - 1)) / 2;
      if (slope > STEEP) continue;
      const mix = w.fen > 0.5 ? belt.fen : belt.mix;
      let r = pick * mix.reduce((sum, [, weight]) => sum + weight, 0);
      let name = mix.at(-1)[0];
      for (const [kind, weight] of mix) if ((r -= weight) < 0) { name = kind; break; }
      const card = atlas.card(name, Math.floor(variant * FOREST.trees.variants[name]));
      if (!card) continue;
      const [lo, hi] = SCALE[name];
      const scale = lo + size * (hi - lo);
      const y = height(x, z);
      if (inView(x, y, z, (card.width * scale) / 2, card.height * scale)) continue;
      trees.push({ name, x, y, z, scale, rot: turn * Math.PI * 2, card });
    }
    if (sj % 8 === 7) yield 'belt';
  }
  // the cards, near the river first (her side of the forest, drawn before what it hides)
  const n = trees.length * 4;
  const centre = new Float32Array(n * 3), cornerAt = new Float32Array(n * 2), sizes = new Float32Array(n * 2), uv = new Float32Array(n * 2);
  const IndexArray = n > 65535 ? Uint32Array : Uint16Array;
  const master = new IndexArray(trees.length * 6);
  const ranges = [];
  const box = new THREE.Box3();
  let biggest = 0;
  trees.sort((a, b) => terrain.where(a.x, a.z).e - terrain.where(b.x, b.z).e);
  trees.forEach((p, t) => {
    const { uv: [u0, v0, u1, v1], width, height: tall, bottom } = p.card;
    const w = width * p.scale, h = tall * p.scale, y = p.y + bottom * p.scale;
    const flip = Math.sin(p.rot) < 0;
    [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]].forEach(([cx, cy], q) => {
      const v = t * 4 + q;
      centre.set([p.x, y, p.z], v * 3);
      cornerAt.set([cx, cy], v * 2);
      sizes.set([w, h], v * 2);
      uv.set([(cx < 0) !== flip ? u0 : u1, cy ? v1 : v0], v * 2);
    });
    const b = t * 4;
    master.set([b, b + 1, b + 2, b, b + 2, b + 3], t * 6);
    const sphere = new THREE.Sphere(new THREE.Vector3(p.x, y + h / 2, p.z), Math.hypot(w, h) / 2);
    // a plain range: drawn whenever in view (never swapped for a mesh, whatever the camera's distance)
    ranges.push({ start: t * 6, count: 6, sphere, cull: Infinity, minD: 0, maxD: Infinity, ref: sphere.center, name: p.name, lod: 3, crown: null, plant: null, li: -1 });
    box.expandByPoint(sphere.center);
    biggest = Math.max(biggest, sphere.radius);
  });
  yield 'belt';
  let cards = null;
  if (trees.length) {
    const g = new THREE.BufferGeometry();
    const at = new THREE.BufferAttribute(centre, 3);
    g.setAttribute('position', at);
    g.setAttribute('aCentre', at);
    g.setAttribute('aCorner', new THREE.BufferAttribute(cornerAt, 2));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 2));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const dynamic = new THREE.BufferAttribute(new IndexArray(master.length), 1);
    dynamic.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(dynamic);
    g.setDrawRange(0, 0);
    g.boundingBox = box.expandByScalar(biggest);
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    cards = new THREE.Mesh(g, cardMaterial);
    cards.name = `Árdalur belt cards ${samples[0]}`;
    cards.castShadow = false;
    cards.receiveShadow = false;
    cards.renderOrder = 3;
    cards.visible = false; // until the first cull
    cards.userData = {
      band: 'far', sector: 0, kind: 'card', cards: true, belt: true, triangles: trees.length * 2, caster: false,
      cull: { master, ranges, signature: -1, submitted: 0 }, hidden: false,
    };
  }
  const group = new THREE.Group();
  group.name = 'Árdalur belt';
  group.add(ground);
  if (cards) group.add(cards);
  return { group, ground, cards, trees: trees.length, placements: trees };
}
