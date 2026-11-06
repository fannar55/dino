// The land of Árdalurinn (chapter 4's flight), shaped by the river (chapters/kafli4-route.js): a bed under the water, low banks,
// valley sides that rise gently away from it, the gorge's walls (30 to 45 m) with a rim on top that falls away again behind it, the
// cliff of the falls (the river's level steps 40 m at the lip, and the land with it, right across the valley), the Fen flat and low
// round the white snag, and the far pool's basin. Above the falls (route.land: chapters/kafli4-route.js) soft hills roll, two ponds
// sit in basins a little under their lowest rim, and two streams cut their beds from a hill's flank down into the upper river, their
// water falling all the way (waters: what river.js draws and banks.js keeps clear). heightAt(x, z) is the ground anywhere; a
// section's ground is a mesh on a 2.5 m grid of the cells within 160 m of the route whose nearest route point is in that section, so
// the sections meet without seams.
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

// the bed's banks (m) beyond the water, its depth, the water under the ground, and how far out to each side the ground must be over it
const STREAM = { bank: 2.5, depth: 0.45, under: 0.15, side: 3 };
const POND = { shore: 8, under: 0.35, rings: [0, 2, 4, 8] }; // the basin's shore (m), its water under the lowest rim, the rims tried

/**
 * A stream: its path ([[x, z], ...]) from its spring to its mouth, `half` its water's half width, its water's level from `ground`
 * (the land without it): the lowest the ground has been so far along it and 3 m out to each side (not the river's bed), a little
 * under, so it never runs uphill nor over its banks, and never under the river's level at its mouth. pointAt(m) is
 * [x, z, side] m metres down it (side the unit vector to its right), levelAt(m) its water there, nearest(x, z) { dist, m }, and
 * cut(x, z, y) the ground y with its bed cut in.
 */
function createStream({ half, path }, ground, where) {
  const segments = [];
  let length = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const len = Math.hypot(bx - ax, bz - az);
    segments.push({ ax, az, dx: (bx - ax) / len, dz: (bz - az) / len, len, from: length });
    length += len;
  }
  const reach = half + STREAM.bank;
  const box = {
    x0: Math.min(...path.map(p => p[0])) - reach, x1: Math.max(...path.map(p => p[0])) + reach,
    z0: Math.min(...path.map(p => p[1])) - reach, z1: Math.max(...path.map(p => p[1])) + reach,
  };
  function pointAt(m) {
    const k = Math.min(length, Math.max(0, m));
    const seg = segments.findLast(g => g.from <= k) ?? segments[0];
    const t = Math.min(seg.len, k - seg.from);
    return [seg.ax + seg.dx * t, seg.az + seg.dz * t, [-seg.dz, seg.dx]];
  }
  const steps = Math.ceil(length);
  const levels = new Float32Array(steps + 1);
  let low = Infinity;
  const side = half + STREAM.side;
  const mouth = where(...path.at(-1)).level + 0.05; // it runs into the river, never under it
  for (let k = 0; k <= steps; k++) {
    const [x, z, [sx, sz]] = pointAt(Math.min(length, k));
    low = Math.min(low, ground(x, z) - STREAM.under);
    for (const k2 of [side, -side]) if (where(x + sx * k2, z + sz * k2).e > 1) low = Math.min(low, ground(x + sx * k2, z + sz * k2) - STREAM.under);
    levels[k] = Math.max(low, mouth);
  }
  function levelAt(m) {
    const k = Math.min(length, Math.max(0, m));
    const i = Math.min(steps - 1, Math.floor(k));
    return levels[i] + (levels[i + 1] - levels[i]) * Math.min(1, k - i);
  }
  function nearest(x, z) {
    let dist = Infinity, at = 0;
    for (const g of segments) {
      const t = Math.min(g.len, Math.max(0, (x - g.ax) * g.dx + (z - g.az) * g.dz));
      const d = Math.hypot(x - g.ax - g.dx * t, z - g.az - g.dz * t);
      if (d < dist) { dist = d; at = g.from + t; }
    }
    return { dist, m: at };
  }
  function cut(x, z, y) {
    if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1) return y;
    const n = nearest(x, z);
    if (n.dist >= reach) return y;
    const level = levelAt(n.m);
    const bed = n.dist < half ? level - STREAM.depth * (1 - smooth(n.dist / half)) : lerp(level, y, smooth((n.dist - half) / STREAM.bank));
    return Math.min(y, bed);
  }
  return { half, path, length, pointAt, levelAt, nearest, cut };
}

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

  // the land above the falls: its hills (faded out toward the river's edge), its ponds and its streams (createStream)
  const land = route.land ?? {};
  const hills = land.hills ?? [];
  function hillsAt(x, z) {
    let y = 0;
    for (const [hx, hz, height, radius] of hills) {
      if (Math.abs(x - hx) >= radius || Math.abs(z - hz) >= radius) continue;
      const d = Math.hypot(x - hx, z - hz);
      if (d < radius) y += height * smooth(1 - d / radius);
    }
    return y;
  }

  /** The valley's ground with its hills, before the ponds and the streams. */
  function rolling(x, z) {
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
      if (hills.length) y += hillsAt(x, z) * smooth((e - 6) / 20);
    }
    // the far pool's basin
    if (w.toPool < pool.radius + 50) {
      const basin = w.toPool < pool.radius ? pool.level - 1.2 * smooth((pool.radius - w.toPool) / 6) - 0.2 : pool.level + 0.4 * smooth((w.toPool - pool.radius) / 4);
      y = lerp(basin, y, smooth((w.toPool - pool.radius) / 50));
    }
    return y;
  }

  // a pond's water lies a little under the lowest of its rims; its basin goes a metre under that, its shore rises to the land
  const ponds = (land.ponds ?? []).map(([x, z, radius]) => {
    let rim = Infinity;
    for (const out of POND.rings) {
      for (let k = 0; k < 24; k++) {
        const a = (k * Math.PI) / 12;
        rim = Math.min(rim, rolling(x + (radius + out) * Math.cos(a), z + (radius + out) * Math.sin(a)));
      }
    }
    return { x, z, radius, level: rim - POND.under };
  });
  function dry(x, z) {
    let y = rolling(x, z);
    for (const p of ponds) {
      const reach = p.radius + POND.shore;
      if (Math.abs(x - p.x) >= reach || Math.abs(z - p.z) >= reach) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d >= reach) continue;
      const shore = p.level + 0.12;
      y = d >= p.radius ? lerp(shore, y, smooth((d - p.radius) / POND.shore))
        : shore - 0.27 * smooth(p.radius - d) - 0.9 * smooth((p.radius - d) / 4);
    }
    return y;
  }
  const streams = (land.streams ?? []).map(stream => createStream(stream, dry, where));

  function heightAt(x, z) {
    let y = dry(x, z);
    for (const s of streams) y = s.cut(x, z, y);
    return y;
  }

  return { heightAt, where, fallsD, gorgeAt, waters: { streams, ponds } };
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
 * The ground's surface at (x, z) as groundSteps draws it: heightAt at the corners of its GRID cell, the cell cut in two from its
 * (i + 1, j) corner to its (i, j + 1) corner. On the gorge's steep walls it is up to a metre or two off heightAt.
 */
export function groundDrawnAt(heightAt, x, z) {
  const i = Math.floor(x / GRID), j = Math.floor(z / GRID);
  const u = x / GRID - i, v = z / GRID - j;
  const a = heightAt(i * GRID, j * GRID), b = heightAt((i + 1) * GRID, j * GRID);
  const c = heightAt(i * GRID, (j + 1) * GRID), d = heightAt((i + 1) * GRID, (j + 1) * GRID);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
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
