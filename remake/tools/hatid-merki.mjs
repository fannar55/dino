// The festival's constellations as drawings of the friends (Task 10b, the owner's word of 2026-11-26): each friend's outline and a
// few inner lines traced from her own model by an algorithm, never drawn by eye (the chunk's ruling 3's written exception), each
// point bound to the bones of her skin so the drawing still moves with her, with stars at the drawing's key places. Run it again to
// bake remake/engine/constellation-figures.js (committed; the game traces nothing at run time):
//
//   node --import ./remake/tests/setup.mjs remake/tools/hatid-merki.mjs [--write] [--preview <dir>] [--only <key,...>]
//
//   --write    writes remake/engine/constellation-figures.js
//   --preview  writes <dir>/<key>.ppm: the traced drawing over her silhouette (a quick look without the browser)
//
// How it traces a friend (CHOICES below says the pose and the view, each chosen by looking at the drawings):
//   1. She is held in her pose (a clip at a time) and every triangle of her skin (body and eyelids) is skinned on the CPU and
//      seen from the view (from her right side, turned `turn` degrees toward her front, lifted `tilt` over it, the picture turned
//      `roll` degrees on the screen): an orthographic picture in metres, as engine/constellations.js shows it.
//   2. The triangles are filled into a mask RES pixels across, keeping each pixel's nearest triangle, its depth and how thick she
//      is there (nearest minus furthest surface).
//   3. The outline: the biggest piece of the mask is closed over small cracks, its pixel edge walked round (inside on the right),
//      smoothed (a Gaussian along the curve) and thinned to 80-200 points by Douglas-Peucker, no segment longer than 1/60 of it.
//   4. Inner lines: pixels where the nearest surface jumps toward the lens (a near leg over the body, a near arm, a wing over the
//      body) and where a thin part meets a thick one (a sail, a plate, a wing on the body), away from the outline, thinned to a
//      line, followed into chains; the longest few of each friend are kept (CHOICES inner), smoothed and thinned as the outline.
//   5. Each point is bound to her bones: the triangle under it, the point on it, its skin weights blended, the two strongest bones
//      kept; its place in each bone's frame (the point lies on the drawing exactly in the baked pose).
//   6. Stars: her own star is the eye (the eyelids mesh's near half, its middle) rigid to the Head bone; the others are the
//      outline's sharpest outward corners and furthest points, the sharpest first, kept apart, 8 to 14 in all, in three sizes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { loadCharacter, emptyWorld } from '../tests/characters.mjs';
import { createActor } from '../engine/actor.js';
import { bodyMesh } from '../engine/clip-probe.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'remake/engine/constellation-figures.js');

/**
 * Each friend's pose and view, chosen by looking at the drawings (the report says why each). `inner`: how many inner lines at most
 * and the shortest kept (a share of her length across); `stars`: how many beside her own (7 to 13).
 */
export const CHOICES = {
  thorsedla: { clip: 'idle', time: 0, turn: 18, tilt: 10, roll: 0, inner: { most: 4, least: 0.07 }, stars: 11 },
  sloedla: { clip: 'idle', time: 0, turn: 18, tilt: 10, roll: 0, inner: { most: 4, least: 0.07 }, stars: 11 },
  kambedla: { clip: 'idle', time: 0, turn: 18, tilt: 10, roll: 0, inner: { most: 6, least: 0.05 }, stars: 12 },
  uggedla: { clip: 'idle', time: 0, turn: 18, tilt: 10, roll: 0, inner: { most: 5, least: 0.06 }, stars: 12 },
  gramedla: { clip: 'roar', time: 1.2, turn: 18, tilt: 10, roll: 0, inner: { most: 5, least: 0.06 }, stars: 11 },
  flugedla: { clip: 'fly', time: 1.015, turn: 0, tilt: 70, roll: 0, inner: { most: 4, least: 0.07 }, stars: 11 },
};
const RES = 900; // mask pixels across her longest side
const SMOOTH = 2.2; // the outline's Gaussian, in pixel edges
const POINTS = [110, 190]; // the outline's points
const MAX_SEGMENT = 1 / 60; // of the outline's length

const rad = THREE.MathUtils.degToRad;

/** The view's screen right, screen up and toward the lens in her root's frame (facing 1: seen from her right side). The twin of
 * engine/constellations.js viewBasis (that module needs the data this tool writes); the test 'the drawing is hers' holds them to
 * each other. */
export function viewBasis({ turn = 0, tilt = 0, roll = 0 }) {
  const cy = Math.cos(rad(turn)), sy = Math.sin(rad(turn)), ct = Math.cos(rad(tilt)), st = Math.sin(rad(tilt));
  const r0 = new THREE.Vector3(cy, 0, -sy);
  const u0 = new THREE.Vector3(-sy * st, ct, -cy * st);
  const d = new THREE.Vector3(sy * ct, st, cy * ct);
  const cr = Math.cos(rad(roll)), sr = Math.sin(rad(roll));
  const right = r0.clone().multiplyScalar(cr).addScaledVector(u0, -sr);
  const up = r0.clone().multiplyScalar(sr).addScaledVector(u0, cr);
  return { right, up, toward: d };
}

function holdPose(actor, clip, time) {
  const action = actor.play(clip, { fade: 0, timeScale: 0 });
  action.time = time;
  actor.mixer.update(0);
  actor.root.updateMatrixWorld(true);
}

/** Every skinned mesh of her model, its vertices skinned now in her root's frame, its skin and its triangles. */
function skinnedNow(actor) {
  const toRoot = new THREE.Matrix4().copy(actor.root.matrixWorld).invert();
  const meshes = [];
  actor.model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  const v = new THREE.Vector3();
  return meshes.map(mesh => {
    mesh.skeleton.update();
    const pos = mesh.geometry.attributes.position;
    const at = new Float64Array(pos.count * 3);
    const m = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(m);
      at[3 * i] = v.x; at[3 * i + 1] = v.y; at[3 * i + 2] = v.z;
    }
    const index = mesh.geometry.index ? mesh.geometry.index.array : Uint32Array.from({ length: pos.count }, (_, i) => i);
    return { mesh, at, index, skinIndex: mesh.geometry.attributes.skinIndex, skinWeight: mesh.geometry.attributes.skinWeight, eyelids: /eyelid/i.test(mesh.name) };
  });
}

/** The picture: each mesh's vertices seen from the view, the raster of the nearest triangles, depths and thickness. */
function rasterise(parts, basis) {
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const p of parts) {
    p.sx = new Float64Array(p.at.length / 3); p.sy = new Float64Array(p.at.length / 3); p.sd = new Float64Array(p.at.length / 3);
    for (let i = 0; i < p.sx.length; i++) {
      const x = p.at[3 * i], y = p.at[3 * i + 1], z = p.at[3 * i + 2];
      p.sx[i] = x * basis.right.x + y * basis.right.y + z * basis.right.z;
      p.sy[i] = x * basis.up.x + y * basis.up.y + z * basis.up.z;
      p.sd[i] = x * basis.toward.x + y * basis.toward.y + z * basis.toward.z;
      lo = [Math.min(lo[0], p.sx[i]), Math.min(lo[1], p.sy[i])];
      hi = [Math.max(hi[0], p.sx[i]), Math.max(hi[1], p.sy[i])];
    }
  }
  const pad = 6;
  const k = (RES - 2 * pad) / Math.max(hi[0] - lo[0], hi[1] - lo[1]); // pixels a metre
  const W = Math.ceil((hi[0] - lo[0]) * k) + 2 * pad, H = Math.ceil((hi[1] - lo[1]) * k) + 2 * pad;
  const toPx = (x, y) => [(x - lo[0]) * k + pad, (hi[1] - y) * k + pad];
  const fromPx = (px, py) => [(px - pad) / k + lo[0], hi[1] - (py - pad) / k];
  const front = new Float32Array(W * H).fill(-Infinity);
  const back = new Float32Array(W * H).fill(Infinity);
  const tri = new Int32Array(W * H).fill(-1);
  const tris = []; // [part, a, b, c]
  parts.forEach((p, pi) => {
    for (let t = 0; t < p.index.length; t += 3) {
      const a = p.index[t], b = p.index[t + 1], c = p.index[t + 2];
      const id = tris.length;
      tris.push([pi, a, b, c]);
      const [ax, ay] = toPx(p.sx[a], p.sy[a]), [bx, by] = toPx(p.sx[b], p.sy[b]), [cx, cy] = toPx(p.sx[c], p.sy[c]);
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
          const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const d = w0 * p.sd[a] + w1 * p.sd[b] + w2 * p.sd[c];
          const i = y * W + x;
          if (d > front[i]) { front[i] = d; tri[i] = id; }
          if (d < back[i]) back[i] = d;
        }
      }
    }
  });
  return { W, H, k, toPx, fromPx, front, back, tri, tris };
}

/** The biggest 8-connected piece of the mask, closed over cracks (one pixel) and with small holes filled. */
function mainPiece({ W, H, tri }) {
  let mask = Uint8Array.from(tri, t => (t >= 0 ? 1 : 0));
  const at = (m, x, y) => (x >= 0 && y >= 0 && x < W && y < H ? m[y * W + x] : 0);
  const grow = (m, on) => {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let any = on ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const v = at(m, x + dx, y + dy);
        if (on) any |= v; else any &= v;
      }
      out[y * W + x] = any;
    }
    return out;
  };
  mask = grow(grow(mask, true), false);
  const pieces = (m, value, eight) => {
    const label = new Int32Array(W * H).fill(-1);
    const sizes = [];
    const stack = [];
    for (let s = 0; s < W * H; s++) {
      if (m[s] !== value || label[s] >= 0) continue;
      const id = sizes.length;
      let n = 0;
      label[s] = id; stack.push(s);
      while (stack.length) {
        const i = stack.pop(); n++;
        const x = i % W, y = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!eight && dx && dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (m[j] === value && label[j] < 0) { label[j] = id; stack.push(j); }
        }
      }
      sizes.push(n);
    }
    return { label, sizes };
  };
  const solid = pieces(mask, 1, true);
  const biggest = solid.sizes.indexOf(Math.max(...solid.sizes));
  const piece = Uint8Array.from(solid.label, l => (l === biggest ? 1 : 0));
  const total = solid.sizes[biggest];
  const holes = pieces(piece, 0, false);
  const outside = holes.label[0];
  for (let i = 0; i < W * H; i++) {
    const l = holes.label[i];
    if (l >= 0 && l !== outside && holes.sizes[l] < total * 0.004) piece[i] = 1;
  }
  return piece;
}

/** The piece's outer edge walked round along pixel edges, inside on the right (image y down): corners [x, y]. */
function walkEdge(piece, W, H) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && piece[y * W + x] === 1;
  let s = 0;
  while (!piece[s]) s++;
  const sx = s % W, sy = (s / W) | 0;
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  // the edge from corner (x, y) along d: its right pixel and its left pixel
  const sides = (x, y, d) => {
    const [dx, dy] = DIR[d];
    const mx = x + dx / 2, my = y + dy / 2;
    const rx = -dy, ry = dx; // right of the way, y down
    return [inside(Math.floor(mx + rx / 2), Math.floor(my + ry / 2)), inside(Math.floor(mx - rx / 2), Math.floor(my - ry / 2))];
  };
  const out = [];
  let x = sx, y = sy, d = 0;
  for (let guard = 0; guard < 4 * W * H; guard++) {
    out.push([x, y]);
    x += DIR[d][0]; y += DIR[d][1];
    if (x === sx && y === sy) break;
    for (const turn of [3, 0, 1, 2]) {
      const nd = (d + turn) % 4;
      const [r, l] = sides(x, y, nd);
      if (r && !l) { d = nd; break; }
    }
  }
  return out;
}

/** A closed (or open) curve smoothed by a Gaussian of `sigma` points. */
function smooth(curve, sigma, closed) {
  const n = curve.length;
  const r = Math.ceil(3 * sigma);
  const w = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  return curve.map((_, i) => {
    let x = 0, y = 0, s = 0;
    for (let j = -r; j <= r; j++) {
      let k = i + j;
      if (closed) k = ((k % n) + n) % n;
      else if (k < 0 || k >= n) continue;
      x += curve[k][0] * w[j + r]; y += curve[k][1] * w[j + r]; s += w[j + r];
    }
    return [x / s, y / s];
  });
}

/** Douglas-Peucker on curve[a..b] (indices, b > a), into `keep`. */
function simplify(curve, a, b, tol, keep) {
  const [ax, ay] = curve[a], [bx, by] = curve[b];
  const len = Math.hypot(bx - ax, by - ay) || 1e-9;
  let far = -1, most = -1;
  for (let i = a + 1; i < b; i++) {
    const d = Math.abs((bx - ax) * (ay - curve[i][1]) - (ax - curve[i][0]) * (by - ay)) / len;
    if (d > most) { most = d; far = i; }
  }
  if (most > tol) { keep.add(far); simplify(curve, a, far, tol, keep); simplify(curve, far, b, tol, keep); }
}
/** Indices of `curve` to keep: Douglas-Peucker at a tolerance found so the count falls in `range`, plus `must`, no gap longer than `maxLen`. */
function thin(curve, closed, range, maxLen, must = []) {
  const n = curve.length;
  const run = tol => {
    const keep = new Set([0, n - 1, ...must]);
    if (closed) { const half = Math.floor(n / 2); keep.add(half); simplify(curve, 0, half, tol, keep); simplify(curve, half, n - 1, tol, keep); }
    else simplify(curve, 0, n - 1, tol, keep);
    const list = [...keep].sort((p, q) => p - q);
    // no gap longer than maxLen along the curve
    const out = [];
    for (let i = 0; i < list.length; i++) {
      out.push(list[i]);
      const next = i + 1 < list.length ? list[i + 1] : closed ? list[0] + n : null;
      if (next === null) break;
      let along = 0;
      let last = list[i];
      for (let j = list[i] + 1; j < next; j++) {
        along += Math.hypot(curve[j % n][0] - curve[(j - 1) % n][0], curve[j % n][1] - curve[(j - 1) % n][1]);
        if (along > maxLen) { out.push(j % n); along = 0; last = j; }
      }
    }
    return [...new Set(out)].sort((p, q) => p - q);
  };
  let lo = 0.05, hi = 40;
  let best = run(1);
  for (let k = 0; k < 30; k++) {
    const mid = Math.sqrt(lo * hi);
    const got = run(mid);
    best = got;
    if (got.length > range[1]) lo = mid; else if (got.length < range[0]) hi = mid; else break;
  }
  return best;
}

/** Edge pixels inside the piece: a jump of the nearest surface toward the lens, and a thin part against a thick one. */
function innerEdges(ras, piece, length) {
  const { W, H, front, back } = ras;
  const jump = 0.035 * length;
  const thinBelow = 0.045 * length;
  const edge = new Uint8Array(W * H);
  const thick = i => front[i] - back[i];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!piece[i] || ras.tri[i] < 0) continue;
    for (const j of [i + 1, i - 1, i + W, i - W]) {
      if (!piece[j] || ras.tri[j] < 0) continue;
      if (front[i] - front[j] > jump) edge[i] = 1; // i is in front: the near part's edge
      if (thick(i) < thinBelow && thick(j) >= thinBelow) edge[i] ||= 2; // where a thin part meets a thick one
    }
  }
  // away from the outline (it is drawn already)
  const near = 3;
  const out = new Uint8Array(W * H);
  for (let y = near; y < H - near; y++) for (let x = near; x < W - near; x++) {
    const i = y * W + x;
    if (!edge[i]) continue;
    let clear = true;
    for (let dy = -near; dy <= near && clear; dy++) for (let dx = -near; dx <= near; dx++) if (!piece[i + dy * W + dx]) { clear = false; break; }
    if (clear) out[i] = edge[i];
  }
  return out;
}

/** Each pixel's distance in pixels to the nearest pixel outside the piece (a two-pass chamfer, 3-4). */
function distanceInside(piece, W, H) {
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = piece[i] ? 1e9 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
  }
  for (let i = 0; i < W * H; i++) d[i] /= 3;
  return d;
}

/** Zhang-Suen thinning of a binary image in place. */
function thinPixels(img, W, H) {
  let changed = true;
  const p = (x, y) => (img[y * W + x] ? 1 : 0);
  while (changed) {
    changed = false;
    for (const pass of [0, 1]) {
      const del = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (!p(x, y)) continue;
        const n = [p(x, y - 1), p(x + 1, y - 1), p(x + 1, y), p(x + 1, y + 1), p(x, y + 1), p(x - 1, y + 1), p(x - 1, y), p(x - 1, y - 1)];
        const b = n.reduce((s, v) => s + v, 0);
        if (b < 2 || b > 6) continue;
        let a = 0;
        for (let k = 0; k < 8; k++) if (!n[k] && n[(k + 1) % 8]) a++;
        if (a !== 1) continue;
        if (pass === 0 && (n[0] * n[2] * n[4] || n[2] * n[4] * n[6])) continue;
        if (pass === 1 && (n[0] * n[2] * n[6] || n[0] * n[4] * n[6])) continue;
        del.push(y * W + x);
      }
      for (const i of del) img[i] = 0;
      if (del.length) changed = true;
    }
  }
}

/** The thinned edge pixels followed into chains (broken at forks), each a list of [x, y] pixel centres. */
function chains(img, W, H) {
  const nb = i => {
    const x = i % W, y = (i / W) | 0, out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const j = (y + dy) * W + x + dx;
      if (img[j]) out.push(j);
    }
    return out;
  };
  const used = new Uint8Array(W * H);
  const out = [];
  const follow = s => {
    const list = [s];
    used[s] = 1;
    let cur = s;
    for (;;) {
      const next = nb(cur).filter(j => !used[j]);
      if (next.length !== 1 && list.length > 1) { if (next.length) { /* a fork: stop */ } break; }
      if (!next.length) break;
      cur = next[0];
      used[cur] = 1;
      list.push(cur);
      if (nb(cur).length > 2) break;
    }
    return list.map(i => [(i % W) + 0.5, ((i / W) | 0) + 0.5]);
  };
  for (let i = 0; i < W * H; i++) if (img[i] && !used[i] && nb(i).length === 1) out.push(follow(i));
  for (let i = 0; i < W * H; i++) if (img[i] && !used[i]) out.push(follow(i));
  return out;
}

const pathLength = (c, closed) => {
  let s = 0;
  for (let i = 1; i < c.length; i++) s += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
  if (closed) s += Math.hypot(c[0][0] - c.at(-1)[0], c[0][1] - c.at(-1)[1]);
  return s;
};

/** A point of the picture (pixels) bound to her bones: [bones, weights, at in each bone's frame]. */
function binder(actor, parts, ras, basis) {
  const toRoot = new THREE.Matrix4().copy(actor.root.matrixWorld).invert();
  const body = bodyMesh(actor);
  const bones = body.skeleton.bones;
  const boneToRoot = bones.map(b => new THREE.Matrix4().multiplyMatrices(toRoot, b.matrixWorld));
  const rootToBone = boneToRoot.map(m => m.clone().invert());
  const { W, H, tri, tris, front, fromPx, toPx } = ras;
  return ([px, py]) => {
    // the nearest covered pixel; among its neighbours the one nearest the lens
    let best = -1;
    for (let r = 0; r < 12 && best < 0; r++) {
      let bd = -Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = Math.floor(px) + dx, y = Math.floor(py) + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (tri[i] >= 0 && front[i] > bd) { bd = front[i]; best = i; }
      }
    }
    if (best < 0) throw new Error('hatid-merki: a point with no skin under it');
    const [pi, a, b, c] = tris[tri[best]];
    const p = parts[pi];
    const [ax, ay] = toPx(p.sx[a], p.sy[a]), [bx, by] = toPx(p.sx[b], p.sy[b]), [cx, cy] = toPx(p.sx[c], p.sy[c]);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    let w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
    let w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
    let w2 = 1 - w0 - w1;
    [w0, w1, w2] = [w0, w1, w2].map(w => Math.max(0, w));
    const s = w0 + w1 + w2;
    [w0, w1, w2] = [w0 / s, w1 / s, w2 / s];
    const P = new THREE.Vector3();
    const weights = new Map();
    [[a, w0], [b, w1], [c, w2]].forEach(([vi, w]) => {
      P.x += w * p.at[3 * vi]; P.y += w * p.at[3 * vi + 1]; P.z += w * p.at[3 * vi + 2];
      for (let k = 0; k < 4; k++) {
        const bw = p.skinWeight.getComponent(vi, k);
        if (!bw) continue;
        const bone = p.mesh.skeleton.bones[p.skinIndex.getComponent(vi, k)];
        const bi = bones.indexOf(bone);
        weights.set(bi, (weights.get(bi) ?? 0) + w * bw);
      }
    });
    // onto the drawn point exactly, in the view's plane
    const [tx, ty] = fromPx(px, py);
    const sx = P.dot(basis.right), sy = P.dot(basis.up);
    P.addScaledVector(basis.right, tx - sx).addScaledVector(basis.up, ty - sy);
    const top = [...weights.entries()].sort((q, r) => r[1] - q[1]).slice(0, 2);
    if (top.length > 1 && top[1][1] < 0.12 * top[0][1]) top.length = 1;
    const sum = top.reduce((q, [, w]) => q + w, 0);
    return top.map(([bi, w]) => ({ bone: bones[bi].name, weight: w / sum, at: P.clone().applyMatrix4(rootToBone[bi]) }));
  };
}

/** Her drawing traced as CHOICES[key] says. */
export async function traceFigure(key, choice = CHOICES[key]) {
  const world = emptyWorld();
  const actor = await createActor(world, { name: key, gltf: await loadCharacter(key) });
  actor.update(0);
  holdPose(actor, choice.clip, choice.time);
  const basis = viewBasis(choice);
  const parts = skinnedNow(actor);
  const ras = rasterise(parts, basis);
  const { W, H, k } = ras;
  const piece = mainPiece(ras);

  // the outline
  const corners = walkEdge(piece, W, H);
  const curve = smooth(corners, SMOOTH, true);
  const perimeter = pathLength(curve, true);
  const box = [0, 1].map(a => Math.max(...curve.map(p => p[a])) - Math.min(...curve.map(p => p[a])));
  const wide = Math.max(...box); // pixels: her longest side as seen (across for the walkers, wing to wing for Flugeðla)
  const length = wide / k; // metres

  // the stars' places on the outline: sharp outward corners and furthest points
  const n = curve.length;
  const win = Math.max(4, Math.round(n * 0.012));
  const inside = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); return xi >= 0 && yi >= 0 && xi < W && yi < H && piece[yi * W + xi] === 1; };
  let cx = 0, cy = 0;
  for (const [x, y] of curve) { cx += x; cy += y; }
  cx /= n; cy /= n;
  const far = curve.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const farMost = Math.max(...far);
  const sharp = curve.map((p, i) => {
    const a = curve[(i - win + n) % n], b = curve[(i + win) % n];
    const ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1];
    const angle = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1))));
    const outward = !inside((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) ? 0 : 1; // the chord inside her: a point sticking out
    return outward * (Math.PI - angle);
  });
  const candidates = [];
  for (let i = 0; i < n; i++) {
    let peak = true;
    for (let j = -win; j <= win && peak; j++) if (j && sharp[(i + j + n) % n] > sharp[i]) peak = false;
    const extreme = far[i] / farMost;
    const isExtreme = far.every((f, j) => Math.abs(((j - i + n + n / 2) % n) - n / 2) > win * 2 || f <= far[i]);
    if ((peak && sharp[i] > 0.75) || (isExtreme && extreme > 0.6)) candidates.push({ i, score: sharp[i] + (isExtreme ? 1.2 * extreme : 0.4 * extreme) });
  }
  candidates.sort((p, q) => q.score - p.score);

  // the eye: the eyelids' near half, its middle
  const lids = parts.find(p => p.eyelids);
  const eye = new THREE.Vector3();
  let count = 0;
  for (let i = 0; i < lids.at.length / 3; i++) {
    if (lids.at[3 * i + 2] <= 0) continue; // her right side: toward the lens (facing 1)
    eye.x += lids.at[3 * i]; eye.y += lids.at[3 * i + 1]; eye.z += lids.at[3 * i + 2]; count++;
  }
  eye.divideScalar(count);
  const eyePx = ras.toPx(eye.dot(basis.right), eye.dot(basis.up));

  const apart = 0.075 * wide;
  const picked = [];
  for (const c of candidates) {
    if (picked.length >= choice.stars) break;
    const [x, y] = curve[c.i];
    if (Math.hypot(x - eyePx[0], y - eyePx[1]) < apart * 0.8) continue;
    if (picked.some(p => Math.hypot(curve[p.i][0] - x, curve[p.i][1] - y) < apart)) continue;
    picked.push(c);
  }
  // then her highest point (a back, a sail, a neck's top), then the outline's points furthest from every star so far, until there are
  // as many as she has (the drawing sparkles all over, not only at its tips)
  const clearOf = i => Math.min(Math.hypot(curve[i][0] - eyePx[0], curve[i][1] - eyePx[1]),
    ...picked.map(p => Math.hypot(curve[p.i][0] - curve[i][0], curve[p.i][1] - curve[i][1])));
  const highest = curve.reduce((b, p, i) => (p[1] < curve[b][1] ? i : b), 0);
  if (picked.length < choice.stars && clearOf(highest) >= apart) picked.push({ i: highest, score: 0 });
  while (picked.length < choice.stars) {
    let best = -1, most = -1;
    for (let i = 0; i < n; i++) { const d = clearOf(i); if (d > most) { most = d; best = i; } }
    if (most < apart * 0.8) break;
    picked.push({ i: best, score: -1 });
  }

  // the outline thinned, the stars' corners kept as points
  const outlineIdx = thin(curve, true, POINTS, perimeter * MAX_SEGMENT, picked.map(p => p.i));

  // inner lines
  const edges = innerEdges(ras, piece, length);
  const rawEdges = edges.slice();
  thinPixels(edges, W, H);
  // a thin part's edge only where it lies away from the outline (a thin tail's or neck's own taper would draw the outline twice)
  const dist = distanceInside(piece, W, H);
  const away = 0.02 * wide;
  const runs = [];
  for (const c of chains(edges, W, H)) {
    let run = [];
    for (const p of c) {
      const i = Math.floor(p[1]) * W + Math.floor(p[0]);
      if (dist[i] >= (edges[i] === 2 ? away : 4)) run.push(p);
      else { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
  }
  const found = runs
    .map(c => smooth(c, 1.5, false))
    .map(c => ({ c, len: pathLength(c, false) }))
    .filter(c => c.len >= choice.inner.least * wide)
    .sort((p, q) => q.len - p.len)
    .slice(0, choice.inner.most);
  const inner = found.map(({ c, len }) => thin(c, false, [Math.max(3, Math.round(len / (perimeter * MAX_SEGMENT)) + 2), 40], perimeter * MAX_SEGMENT).map(i => c[i]))
    .map(c => (Math.hypot(c[0][0] - eyePx[0], c[0][1] - eyePx[1]) <= Math.hypot(c.at(-1)[0] - eyePx[0], c.at(-1)[1] - eyePx[1]) ? c : c.reverse()));

  // bind every point
  const bind = binder(actor, parts, ras, basis);
  const outline = outlineIdx.map(i => curve[i]);
  const bound = [...outline, ...inner.flat()].map(p => bind(p));
  const head = actor.model.getObjectByName('Head');
  const headToRoot = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(actor.root.matrixWorld).invert(), head.matrixWorld);
  const eyeAt = eye.clone().applyMatrix4(headToRoot.clone().invert());

  // the stars: her own (the eye), then the picked, the first four the middle size
  const starOf = c => outlineIdx.indexOf(c.i);
  const start = outline.reduce((b, p, i) => (Math.hypot(p[0] - eyePx[0], p[1] - eyePx[1]) < Math.hypot(outline[b][0] - eyePx[0], outline[b][1] - eyePx[1]) ? i : b), 0);
  const stars = picked.map((c, r) => ({ point: starOf(c), size: r < 4 ? 1 : 2 }));
  // name each star by the bone that carries it most
  stars.forEach(s => { s.name = bound[s.point][0].bone; });
  const names = new Map();
  stars.forEach(s => { const m = (names.get(s.name) ?? 0) + 1; names.set(s.name, m); if (m > 1) s.name += `_${m}`; });

  const metres = ([x, y]) => ras.fromPx(x, y);
  const eyeFlat = metres(eyePx);
  actor.dispose?.();
  return {
    key, choice, basis, length,
    outline: outline.map(metres), inner: inner.map(c => c.map(metres)), eyeFlat,
    bound, eyeAt, stars, start,
    debug: { piece, W, H, edges, rawEdges, ras },
  };
}

const r3 = x => Math.round(x * 1000) / 1000;
/** The figure as the data module holds it. */
function packed(f) {
  const bones = [];
  const boneIx = name => { let i = bones.indexOf(name); if (i < 0) { i = bones.length; bones.push(name); } return i; };
  boneIx('Head');
  const points = [];
  for (const b of f.bound) {
    const [p, q] = b;
    points.push(boneIx(p.bone), q ? boneIx(q.bone) : -1, r3(p.weight), r3(p.at.x), r3(p.at.y), r3(p.at.z),
      q ? r3(q.at.x) : 0, q ? r3(q.at.y) : 0, q ? r3(q.at.z) : 0);
  }
  const { clip, time, turn, tilt, roll } = f.choice;
  let next = f.outline.length;
  const inner = f.inner.map(c => { const r = [next, c.length]; next += c.length; return r; });
  return {
    pose: { clip, time }, view: { turn, tilt, roll },
    length: r3(f.length), eye: [r3(f.eyeAt.x), r3(f.eyeAt.y), r3(f.eyeAt.z)], home: f.eyeFlat.map(r3),
    bones, outline: f.outline.length, inner, start: f.start,
    stars: f.stars.map(s => [s.point, s.size, s.name]),
    points,
  };
}

function writeModule(figures) {
  const head = `// Generated by remake/tools/hatid-merki.mjs (Task 10b): the festival's constellations as drawings of the friends, traced from
// each model's own silhouette in her telling pose, never drawn by eye. Do not edit by hand: run the tool again.
//
// A figure: pose (the clip and time she was traced in), view (turn, tilt, roll: engine/constellations.js), length (metres along her
// outline's longest side as seen), eye (her own star, in the Head bone's frame), home (the eye's place in the picture in metres, right and up),
// bones (names), outline (the first N points, a closed curve in order), inner ([first, count] runs of points after it), start (the
// outline point the drawing grows from), stars ([point, size 1 middle | 2 small, name]; her own is the eye, size 0), points (nine
// numbers a point: bone a, bone b or -1, a's weight, at in a's frame xyz, at in b's frame xyz).
`;
  const body = Object.entries(figures).map(([key, f]) => `  ${key}: ${JSON.stringify(f)},`).join('\n');
  fs.writeFileSync(OUT, `${head}export const FIGURES = {\n${body}\n};\n`);
}

/** A check picture: the mask faint, the outline (orange), the inner lines (blue), the stars (yellow middle, orange small), the eye
 * (red) and where the drawing starts (green). */
function preview(f, file) {
  const { W, H, piece, ras } = f.debug;
  const img = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const v = piece[i] ? 40 : 8;
    img[3 * i] = v; img[3 * i + 1] = f.debug.rawEdges[i] ? 110 : v; img[3 * i + 2] = v + 10;
  }
  const put = (x, y, c, r = 0) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xi = Math.round(x + dx), yi = Math.round(y + dy);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
      const i = 3 * (yi * W + xi);
      img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2];
    }
  };
  const line = (a, b, c) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2) + 1;
    for (let t = 0; t <= n; t++) put(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n, c, 1);
  };
  const o = f.outline.map(([x, y]) => ras.toPx(x, y));
  for (let i = 0; i < o.length; i++) line(o[i], o[(i + 1) % o.length], [255, 200, 120]);
  for (const c of f.inner) { const q = c.map(([x, y]) => ras.toPx(x, y)); for (let i = 1; i < q.length; i++) line(q[i - 1], q[i], [120, 200, 255]); }
  for (const p of o) put(p[0], p[1], [255, 255, 255], 0);
  for (const s of f.stars) put(o[s.point][0], o[s.point][1], s.size === 1 ? [255, 255, 0] : [255, 140, 0], s.size === 1 ? 5 : 3);
  put(...ras.toPx(...f.eyeFlat), [255, 60, 60], 6);
  put(o[f.start][0], o[f.start][1], [0, 255, 0], 4);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), Buffer.from(img)]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : Object.keys(CHOICES);
  const dir = args.includes('--preview') ? args[args.indexOf('--preview') + 1] : null;
  const figures = {};
  for (const key of only) {
    const t0 = Date.now();
    const f = await traceFigure(key);
    figures[key] = packed(f);
    console.log(`${key}: outline ${f.outline.length}, inner ${f.inner.map(c => c.length).join('+') || 0}, stars ${f.stars.length + 1} (${f.stars.map(s => s.name).join(' ')}), length ${f.length.toFixed(2)} m, ${Date.now() - t0} ms`);
    if (dir) { fs.mkdirSync(dir, { recursive: true }); preview(f, path.join(dir, `${key}.ppm`)); }
  }
  if (args.includes('--write')) {
    if (only.length !== Object.keys(CHOICES).length) throw new Error('--write needs all six (no --only)');
    writeModule(figures);
    console.log(`-> ${path.relative(ROOT, OUT)}`);
  }
}
