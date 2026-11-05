// The land of Árdalurinn (chapter 4's flight), shaped by the river (chapters/kafli4-route.js): a bed under the water, low banks,
// valley sides that rise gently away from it, the gorge's walls (30 to 45 m) with a rim on top that falls away again behind it, the
// cliff of the falls (the river's level steps 40 m at the lip, and the land with it, right across the valley), the Fen flat and low
// round the white snag, and the far pool's basin. heightAt(x, z) is the ground anywhere; a section's ground is a mesh on a 2.5 m
// grid of the cells within 160 m of the route whose nearest route point is in that section, so the sections meet without seams.
import * as THREE from 'three';
import { FRESH } from '../forest/slices.js';

export const GRID = 2.5;
export const CORRIDOR = 160;
export const GREY = { ground: '#9a9a9a', water: '#7d8a94', rock: '#b0b0b0', plant: '#8e948b', falls: '#b9c3ca', snag: '#d9d7cf', mark: '#c8b48e', far: '#a3a8ad' };

const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
// The Fen round the snag (chapter 3's place), and how far out it blends into the valley.
const FEN = { center: [-30, 70], radius: 150, blend: 90 };
/** How much (x, z) is the Fen's: 1 round the snag, 0 out in the valley. */
export const fenShare = (x, z) => 1 - smooth((Math.hypot(x - FEN.center[0], z - FEN.center[1]) - FEN.radius) / FEN.blend);

/** The ground of the valley: heightAt(x, z), and where things are (river distance, edge distance, gorge share) for the banks. */
export function createTerrain(route, { seed = 4 } = {}) {
  const river = route.river;
  const { gorge, pool } = route;
  const fallsD = river.falls;
  const valley = (e, level) => level + 0.35 + 0.04 * e + 6 * smooth((e - 40) / 140);
  const wallAt = d => lerp(gorge.wall[0], gorge.wall[1], smooth((d - gorge.from) / (gorge.to - gorge.from)));
  // The gorge's share at river distance d: its walls rise over 30 m below GORGE.from and go on round the plunge pool to the lip.
  const gorgeAt = d => (d >= fallsD ? 0 : smooth((d - (gorge.from - 30)) / 30));
  const s1 = seed * 1.7;
  const bumps = (x, z) => 0.3 * Math.sin(x * 0.13 + s1) * Math.sin(z * 0.11 - s1) + 0.15 * Math.sin(x * 0.37 + z * 0.29 + s1 * 2);

  /** Where (x, z) is: { d (along the river), e (from the water's edge: negative in the water), level, half, gorge, fen, pool }. */
  function where(x, z) {
    const n = river.nearest(x, z);
    const r = river.at(n.d);
    const fen = fenShare(x, z);
    const toPool = Math.hypot(x - pool.center[0], z - pool.center[1]);
    return { d: n.d, side: n.side, e: n.dist - r.half, level: r.level, half: r.half, gorge: gorgeAt(n.d), fen, toPool };
  }

  function heightAt(x, z) {
    const w = where(x, z);
    const { e, level } = w;
    let y;
    if (e < 0) {
      y = level - 0.8 - 0.8 * smooth(-e / w.half); // the bed
    } else {
      y = valley(e, level);
      if (w.gorge > 0) {
        const wall = e2 => level + wallAt(w.d) * smooth((e2 - 1.5) / 7) + 0.03 * Math.max(0, e2 - 10);
        const top = e <= 30 ? wall(e) : lerp(wall(30), valley(e, level), smooth((e - 30) / 50));
        y = lerp(y, top, w.gorge);
      }
      if (w.fen > 0) y = lerp(y, Math.max(0.3, level + 0.3), w.fen);
      y += bumps(x, z) * smooth((e - 3) / 10) * (1 - w.gorge * smooth((30 - e) / 10));
    }
    // the far pool's basin
    if (w.toPool < pool.radius + 50) {
      const basin = w.toPool < pool.radius ? pool.level - 1.2 * smooth((pool.radius - w.toPool) / 6) - 0.2 : pool.level + 0.4 * smooth((w.toPool - pool.radius) / 4);
      y = lerp(basin, y, smooth((w.toPool - pool.radius) / 50));
    }
    return y;
  }

  return { heightAt, where, fallsD, gorgeAt };
}

/**
 * The route's samples, one a metre, and the nearest of them to a point seen from above (within `max`): a spatial hash of 40 m cells,
 * searched ring by ring.
 */
export function createRouteIndex(route) {
  const count = Math.ceil(route.length);
  const points = route.curve.getSpacedPoints(count);
  const CELL = 40;
  const key = (i, j) => (i + 2048) * 4096 + (j + 2048);
  const buckets = new Map();
  points.forEach((p, k) => {
    const id = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(k);
  });
  /** The index of the sample nearest (x, z) within `max` metres, or -1; `out.dist` is its distance. */
  function nearest(x, z, max = Infinity, out = {}) {
    const ci = Math.floor(x / CELL);
    const cj = Math.floor(z / CELL);
    let best = -1;
    let bestD = max * max;
    const rings = Number.isFinite(max) ? Math.ceil(max / CELL) + 1 : 64;
    for (let r = 0; r <= rings; r++) {
      if (best >= 0 && (r - 1) * CELL > Math.sqrt(bestD)) break;
      for (let i = -r; i <= r; i++) {
        for (let j = -r; j <= r; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
          const list = buckets.get(key(ci + i, cj + j));
          if (!list) continue;
          for (const k of list) {
            const dx = points[k].x - x;
            const dz = points[k].z - z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD) { bestD = d2; best = k; }
          }
        }
      }
    }
    out.dist = best >= 0 ? Math.sqrt(bestD) : Infinity;
    return best;
  }
  return { points, count, nearest };
}

/**
 * The steps that build one section's ground (a generator for the build queue): the cells it owns, their heights, and a mesh with
 * normals taken across the grid (so they match the next section's at the seam). With `paint(x, z, y, ny)` -> [r, g, b, rock] (the
 * real look, look.js: groundPaint) each vertex gets its colour and its share of bare rock (aRock). Returns { mesh, cells, bounds }.
 */
export function* groundSteps(terrain, index, { from, to }, material, paint = null) {
  const { points } = index;
  const i0 = Math.floor(from * index.count);
  const i1 = Math.min(index.count + 1, Math.ceil(to * index.count) + (to >= 1 ? 1 : 0));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = i0; k < Math.min(i1, points.length); k++) {
    minX = Math.min(minX, points[k].x); maxX = Math.max(maxX, points[k].x);
    minZ = Math.min(minZ, points[k].z); maxZ = Math.max(maxZ, points[k].z);
  }
  const gx0 = Math.floor((minX - CORRIDOR) / GRID);
  const gz0 = Math.floor((minZ - CORRIDOR) / GRID);
  const W = Math.ceil((maxX + CORRIDOR) / GRID) - gx0 + 1; // vertices across
  const H = Math.ceil((maxZ + CORRIDOR) / GRID) - gz0 + 1;
  const own = new Uint8Array((W - 1) * (H - 1));
  const out = {};
  let cells = 0;
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const k = index.nearest((gx0 + i + 0.5) * GRID, (gz0 + j + 0.5) * GRID, CORRIDOR, out);
      if (k >= i0 && k < i1) { own[j * (W - 1) + i] = 1; cells++; }
    }
    if (j % 2 === 1) yield 'cells';
  }
  // Heights at every corner of an owned cell and the corners round them (for the normals).
  const heights = new Float32Array(W * H).fill(NaN);
  const needed = new Uint8Array(W * H);
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      if (!own[j * (W - 1) + i]) continue;
      for (let b = -1; b <= 2; b++) for (let a = -1; a <= 2; a++) {
        const vi = i + a;
        const vj = j + b;
        if (vi >= 0 && vj >= 0 && vi < W && vj < H) needed[vj * W + vi] = 1;
      }
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) if (needed[j * W + i]) heights[j * W + i] = terrain.heightAt((gx0 + i) * GRID, (gz0 + j) * GRID);
    if (j % 2 === 1) yield 'heights';
  }
  yield FRESH;
  // The mesh: the corners of the owned cells.
  const vertexOf = new Int32Array(W * H).fill(-1);
  const positions = [];
  const normals = [];
  const colours = [];
  const rocks = [];
  const at = (i, j) => heights[j * W + i];
  const indices = [];
  const corner = (i, j) => {
    const id = j * W + i;
    if (vertexOf[id] >= 0) return vertexOf[id];
    const h = at(i, j);
    const hl = i > 0 && !Number.isNaN(at(i - 1, j)) ? at(i - 1, j) : h;
    const hr = i < W - 1 && !Number.isNaN(at(i + 1, j)) ? at(i + 1, j) : h;
    const hd = j > 0 && !Number.isNaN(at(i, j - 1)) ? at(i, j - 1) : h;
    const hu = j < H - 1 && !Number.isNaN(at(i, j + 1)) ? at(i, j + 1) : h;
    const n = new THREE.Vector3(hl - hr, 2 * GRID, hd - hu).normalize();
    vertexOf[id] = positions.length / 3;
    positions.push((gx0 + i) * GRID, h, (gz0 + j) * GRID);
    normals.push(n.x, n.y, n.z);
    if (paint) {
      const [r, g, b, rock] = paint((gx0 + i) * GRID, (gz0 + j) * GRID, h, n.y);
      colours.push(r, g, b);
      rocks.push(rock);
    }
    return vertexOf[id];
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      if (!own[j * (W - 1) + i]) continue;
      const a = corner(i, j);
      const b = corner(i + 1, j);
      const c = corner(i, j + 1);
      const d = corner(i + 1, j + 1);
      indices.push(a, c, b, b, c, d);
    }
    if (paint && j % 3 === 2) yield 'paint'; // painting a vertex asks where it is: a few rows a step
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (paint) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute('aRock', new THREE.Float32BufferAttribute(rocks, 1));
  }
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Árdalur ground ${i0}`;
  mesh.receiveShadow = true;
  return { mesh, cells, own, grid: { gx0, gz0, W, H }, samples: [i0, i1] };
}
