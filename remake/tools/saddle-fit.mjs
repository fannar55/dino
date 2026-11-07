#!/usr/bin/env node
// Fits Flugeðla's saddle to her back and binds it to her bones (chapter 4: Egill rides her on it). Step 2 of preparing the saddle:
// step 1 (remake/tools/blender-saddle.py) turns the owner's Tripo model to face +X with +Y up and its origin on the seat (where Egill
// sits), in metres, welds and decimates it and makes its maps small. This step:
//
//   node --import ./remake/tests/setup.mjs remake/tools/saddle-fit.mjs <prepped.glb> <out.glb>
//
// 1. Puts the saddle on her back in the bind pose, its frame level with her back as it is in carry's first pose (flier.js SEAT: the
//    seat on her Spine bone), so its seat sits on the top of her back, its underside `GAP` over her skin.
// 2. Lays the pad over her back as a cloth over a broad back: the owner's pad bends down either side as over a barrel, and her back is
//    nearly flat a metre across, so its arch is unrolled onto her back's top (padArch, backSurface): each point goes as far across her
//    back from the middle as it was round the arch, and as far over her skin as it was over the arch's underside, so the pad keeps its
//    size and its thickness. Up toward the seat this fades out, so the seat, the cantle and the handlebar keep their shape. Then
//    anything still within GAP / 2 of her skin, or inside it, is put GAP out from it.
// 3. Gives each vertex her skin's bone weights at its closest point; up toward the seat they blend into the weights at the seat (her
//    spine's), so the seat and the handlebar move as one with her back while the pad and the girth bend as her skin bends under them,
//    over her wing roots in the wing beats too.
// 4. Holds in her poses (holdInPoses): in each of the poses she is in with the saddle on (POSES), where her skin comes into the saddle
//    it is pushed out, and the weights and bind places are fitted to those poses; then counts what is still inside her in each.
// 5. Corrects what no weights can hold (correctInPoses): where her wing roots swing up over her back (wings up, wings folded), a
//    morph target for that pose pushes the pad out, on as much as her upper arms are turned as in it (engine/flier-saddle.js
//    correctionsAt); then counts again.
// 6. Writes one mesh in her bind frame (her mesh's own, as GLTFLoader reads it) with JOINTS_0 and WEIGHTS_0 naming her bones by name
//    (extras.joints), the same material and maps, the corrections as sparse morph targets (their drivers in extras.corrections), and
//    in extras the places a rider uses (seat, grips, knees, ankles: bind-frame points with their weights) and what the fit did.
//    engine/flier-saddle.js binds it to her skeleton when it loads.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { skinSurface } from '../engine/skin-surface.js';
import { SEAT } from '../engine/flier.js';
import { correctionsAt } from '../engine/flier-saddle.js';

const V3 = THREE.Vector3;
const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/** The fit's numbers: metres, in the saddle's frame (x ahead, y up, z her right; the origin on the seat). */
export const FIT = {
  gap: 0.006, // between her skin and the saddle's underside
  ahead: -0.16, // the saddle's origin this far ahead of the seat on her back (along her back, level): back, so his head is clear of
  //              her crest as she glides (it reaches back over him; on the seat itself his hair is 5 cm into it, 12 cm back 2 cm)
  arch: 0.4, // the pad's arch is measured round a point this far under its underside below the seat (padArch)
  bend: 0.3, // the tightest the pad bends over her back (backSurface: it bridges grooves narrower than this bends round)
  spread: 'footprint', // how far across her back the pad's arch is laid: 'footprint' as wide as it is seen from above, or a share of its length round
  contact: 0.012, // what is within this over the pad's underside lies on her skin (holdInPoses lays it back on where it lifts)
  padTop: -0.05, // below this height the saddle is the pad, laid over her back
  underside: 0.3, // the pad's underside is the lowest of the saddle within this under its origin
  rigid: 0.02, // above this height it moves with her back at the seat alone (the seat, the cantle, the handlebar)
};

/** Where a rider's places are on the saddle, in its frame: set for the model in hand (blender-saddle.py's report). */
export const PLACES = {
  seat: [0, 0, 0],
  grips: { left: [0.23, 0.17, -0.15], right: [0.23, 0.17, 0.17] }, // the middle of the bar's wrapped grips (v1's bar sits 2.5 cm right)
  // his knees bend toward these and his feet go to these, over her back: [ahead, above her skin, across]. Her back is a metre wide and
  // nearly flat, so he kneels astride it, his knees out to the sides and his feet back on the pad behind them.
  knees: { left: [0.1, 0.12, -0.45], right: [0.1, 0.12, 0.45] },
  ankles: { left: [-0.22, 0.1, -0.24], right: [-0.22, 0.1, 0.24] },
};

/** A fitted saddle's places for a rider (extras.places, as engine/flier-saddle.js reads them): bind points and the weights there. */
export function placesOf(fitted, names, places = PLACES) {
  const named = w => Object.fromEntries([...w].map(([bone, x]) => [names[bone], Number(x.toFixed(4))]));
  const one = (local, over) => {
    const { point, weights } = fitted.place(local, { over });
    return { local, ...(over ? { over: true } : {}), bind: point.toArray().map(x => Number(x.toFixed(5))), weights: named(weights) };
  };
  const out = { seat: one(places.seat, false) };
  for (const part of ['grips', 'knees', 'ankles']) {
    const over = part !== 'grips';
    out[part] = { left: one(places[part].left, over), right: one(places[part].right, over) };
  }
  return out;
}

/**
 * Her frame for the saddle, in her bind pose: the seat (SEAT on its bone, bind frame) and her back's axes there as they are when her
 * back is level (carry's first pose): ahead, up, right.
 */
export function backFrame(gltf, mesh) {
  const bones = mesh.skeleton.bones;
  const index = bones.findIndex(b => b.name === SEAT.bone);
  const seat = new V3(...SEAT.local).applyMatrix4(mesh.skeleton.boneInverses[index].clone().invert());
  // the bone's turn in carry's first pose, read on a copy with a mixer of its own
  const scene = cloneSkinned(gltf.scene);
  const mixer = new THREE.AnimationMixer(scene);
  const carry = gltf.animations.find(c => c.name === 'carry');
  if (carry) { mixer.clipAction(carry).play(); mixer.setTime(0); }
  scene.updateMatrixWorld(true);
  const back = scene.getObjectByName(SEAT.bone).getWorldQuaternion(new THREE.Quaternion()).invert();
  return { seat, ahead: new V3(1, 0, 0).applyQuaternion(back), up: new V3(0, 1, 0).applyQuaternion(back), right: new V3(0, 0, 1).applyQuaternion(back) };
}

/**
 * The fit. `saddle`: { positions (Float32Array, saddle frame, metres), normals, index }; `skin`: skinSurface of her mesh (bind
 * pose); `frame`: backFrame(). Returns { positions, normals (bind frame), weights: Array of Map(bone -> w), contact, place(p), report },
 * where place(p) takes a point of the saddle's frame to the bind frame as the fit moved the saddle round it.
 */
export function fitSaddle(saddle, skin, frame, { fit = FIT } = {}) {
  const n = saddle.positions.length / 3;
  const P = i => new V3(saddle.positions[3 * i], saddle.positions[3 * i + 1], saddle.positions[3 * i + 2]);
  // her frame round the seat (x ahead, y up, z right; metres from the seat point) to the bind frame; the saddle's frame into hers
  const herToBind = p => frame.seat.clone().addScaledVector(frame.ahead, p.x).addScaledVector(frame.up, p.y).addScaledVector(frame.right, p.z);
  const toHer = p => new V3(p.x + fit.ahead, p.y, p.z);

  // 1. On her back: the underside below the seat on the top of her back, GAP over it.
  let bottom = Infinity;
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = P(i);
    if (Math.abs(p.x) < 0.06 && Math.abs(p.z) < 0.06 && p.y > -fit.underside) bottom = Math.min(bottom, p.y);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
  }
  if (!Number.isFinite(bottom)) throw new Error('the saddle has nothing under its origin: is its origin on the seat?');
  const under = skin.closest(herToBind(toHer(new V3(0, bottom, 0))));
  const raise = fit.gap - under.distance; // to her skin, and GAP over it
  const placed = Array.from({ length: n }, (_, i) => herToBind(toHer(P(i))).addScaledVector(frame.up, raise));
  const height = Array.from({ length: n }, (_, i) => P(i).y);

  // 2. The pad laid over her back: its arch unrolled across onto her back's top (as smoothed by backSurface), each point as far along
  //    her back from the middle as it was round the pad's arch, and as far over it as it was over the arch's underside.
  const back = backSurface(skin.mesh, frame, { x: [x0 + fit.ahead - 0.06, x1 + fit.ahead + 0.06], bend: fit.bend });
  const arch = padArch(saddle, { below: fit.padTop, centre: bottom - fit.arch });
  // laid flat, the arch would reach further out than the pad does seen from above (onto her wing roots, which lift as she beats):
  // fit.spread 'footprint' keeps it to that width
  let spread = fit.spread;
  if (spread === 'footprint') {
    let wide = 0, round = 0;
    for (let i = 0; i < n; i++) if (height[i] < fit.padTop) {
      wide = Math.max(wide, Math.abs(saddle.positions[3 * i + 2]));
      round = Math.max(round, Math.abs(arch.at(height[i], saddle.positions[3 * i + 2]).s));
    }
    spread = round > 0 ? Math.min(1, wide / round) : 1;
  }
  const lay = local => {
    const { s, d } = arch.at(local.y, local.z);
    const x = local.x + fit.ahead;
    const z = back.across(x, s * spread);
    return new V3(x, back.height(x, z), z).addScaledVector(back.normal(x, z), fit.gap + Math.max(0, d));
  };
  // a point over her back: [ahead, above her skin, across] in the saddle's frame (for a rider's knees and feet on the pad)
  const overBack = ([ahead, above, across]) => {
    const x = ahead + fit.ahead;
    return new V3(x, back.height(x, across), across).addScaledVector(back.normal(x, across), above);
  };
  const onBack = y => 1 - smooth((y - fit.padTop) / (fit.rigid - fit.padTop)); // how much a point at this height lies on her back
  let laid = 0;
  const moved = placed.map((p, i) => {
    const k = onBack(height[i]);
    if (k <= 0) return p.clone();
    laid++;
    return p.clone().lerp(herToBind(lay(P(i))), k);
  });
  const contact = new Uint8Array(n); // what lies on her skin: the pad's underside, and what was put out to her skin
  for (let i = 0; i < n; i++) if (height[i] < fit.padTop && arch.at(height[i], P(i).z).d < fit.contact) contact[i] = 1;
  // anything left within GAP / 2 of her skin, or inside it, out to GAP
  let pushed = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const c = skin.closest(moved[i]);
      if (c && c.distance < fit.gap / 2) {
        moved[i].copy(c.point).addScaledVector(c.normal, fit.gap);
        contact[i] = 1;
        pushed++;
      }
    }
  }

  // 3. Weights: her skin's at the closest point, blending into the seat's toward the top.
  const seatWeights = skin.closest(frame.seat).weights;
  const weights = [];
  for (let i = 0; i < n; i++) {
    const c = skin.closest(moved[i]);
    const k = smooth((height[i] - fit.padTop) / (fit.rigid - fit.padTop));
    weights.push(blend(c.weights, seatWeights, k));
  }

  // normals from the new shape, shared by vertices at one place (so UV seams do not show)
  const normals = smoothNormals(moved, saddle.index);

  // a point of the saddle's frame to the bind frame, moved as the saddle round it was; its weights the saddle's round it (as they are
  // when it is asked: after holdInPoses, those)
  const result = { positions: moved, normals, weights, contact, index: saddle.index, place, report: null };
  // place(local): a point of the saddle's frame; place(local, { over: true }): [ahead, above her skin, across] over her back
  function place(local, { over = false } = {}) {
    let at;
    if (over) at = herToBind(overBack(local));
    else {
      const p = new V3(...local);
      at = herToBind(toHer(p)).addScaledVector(frame.up, raise);
      const k = onBack(p.y);
      if (k > 0) at.lerp(herToBind(lay(p)), k);
    }
    return { point: at, weights: weightsNear(result, at) };
  }

  result.report = { vertices: n, laid, pushed, spread: Number(spread.toFixed(3)), raise: Number(raise.toFixed(4)), bottom: Number(bottom.toFixed(4)) };
  return result;
}

/**
 * Her back's top as a pad would lie on it, in her frame round the seat (x ahead, y up, z right; metres from the seat point, her bind
 * pose): the top of her skin over a grid (every `dx` along, `dz` across), smoothed from above as a sheet that bends no tighter than
 * `bend` metres would rest on it (it bridges the grooves at her wing roots). height(x, z), normal(x, z), and across(x, s): where an arc
 * length s across her back from the middle (signed: negative to her left) ends.
 */
export function backSurface(mesh, frame, { x: [x0, x1], z: [z0, z1] = [-1, 1], bend = FIT.bend, dx = 0.02, dz = 0.01 } = {}) {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const L = new Float32Array(position.count * 3);
  const v = new V3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix).sub(frame.seat);
    L[3 * i] = v.dot(frame.ahead); L[3 * i + 1] = v.dot(frame.up); L[3 * i + 2] = v.dot(frame.right);
  }
  const nx = Math.round((x1 - x0) / dx) + 1, nz = Math.round((z1 - z0) / dz) + 1;
  const at = (ix, iz) => ix * nz + iz;
  // her skin's top over each grid point: the highest of the triangles over it (each triangle over the points its shadow covers)
  const raw = new Float32Array(nx * nz).fill(-Infinity);
  for (let f = 0; f < index.count; f += 3) {
    const [a, b, c] = [index.getX(f), index.getX(f + 1), index.getX(f + 2)];
    const ax = L[3 * a], ay = L[3 * a + 1], az = L[3 * a + 2];
    const bx = L[3 * b], by = L[3 * b + 1], bz = L[3 * b + 2];
    const cx = L[3 * c], cy = L[3 * c + 1], cz = L[3 * c + 2];
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-10) continue;
    const ix0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / dx)), ix1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / dx));
    const iz0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - z0) / dz)), iz1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) / dz));
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const x = x0 + ix * dx, z = z0 + iz * dz;
      const wb = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / area;
      const wc = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / area;
      if (wb < -1e-9 || wc < -1e-9 || wb + wc > 1 + 1e-9) continue;
      const y = ay + wb * (by - ay) + wc * (cy - ay);
      if (y > raw[at(ix, iz)]) raw[at(ix, iz)] = y;
    }
  }
  // where she is not under the grid (past her sides), her nearest top across, level
  for (let ix = 0; ix < nx; ix++) {
    const found = [];
    for (let iz = 0; iz < nz; iz++) if (raw[at(ix, iz)] > -Infinity) found.push(iz);
    if (!found.length) continue;
    for (let iz = 0; iz < found[0]; iz++) raw[at(ix, iz)] = raw[at(ix, found[0])];
    for (let iz = found.at(-1) + 1; iz < nz; iz++) raw[at(ix, iz)] = raw[at(ix, found.at(-1))];
  }
  // the sheet from above: at each point the highest of her top round it less how far a sheet of that bend falls over the distance
  const reach = Math.sqrt(2 * bend * 0.02); // past this it has fallen 2 cm: lower than any groove it bridges matters
  const wx = Math.ceil(reach / dx), wz = Math.ceil(reach / dz);
  const top = new Float32Array(nx * nz);
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    let best = -Infinity;
    for (let jx = Math.max(0, ix - wx); jx <= Math.min(nx - 1, ix + wx); jx++) for (let jz = Math.max(0, iz - wz); jz <= Math.min(nz - 1, iz + wz); jz++) {
      const h = raw[at(jx, jz)];
      if (h === -Infinity) continue;
      const ddx = (jx - ix) * dx, ddz = (jz - iz) * dz;
      best = Math.max(best, h - (ddx * ddx + ddz * ddz) / (2 * bend));
    }
    top[at(ix, iz)] = best === -Infinity ? 0 : best;
  }
  // arc lengths across each row from the middle
  const middle = Math.round(-z0 / dz);
  const arc = new Float32Array(nx * nz);
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = middle + 1; iz < nz; iz++) arc[at(ix, iz)] = arc[at(ix, iz - 1)] + Math.hypot(dz, top[at(ix, iz)] - top[at(ix, iz - 1)]);
    for (let iz = middle - 1; iz >= 0; iz--) arc[at(ix, iz)] = arc[at(ix, iz + 1)] - Math.hypot(dz, top[at(ix, iz)] - top[at(ix, iz + 1)]);
  }
  const clampX = x => Math.min(nx - 1, Math.max(0, (x - x0) / dx));
  const clampZ = z => Math.min(nz - 1, Math.max(0, (z - z0) / dz));
  const bilinear = (grid, x, z) => {
    const fx = clampX(x), fz = clampZ(z);
    const ix = Math.min(nx - 2, Math.floor(fx)), iz = Math.min(nz - 2, Math.floor(fz));
    const tx = fx - ix, tz = fz - iz;
    return (grid[at(ix, iz)] * (1 - tz) + grid[at(ix, iz + 1)] * tz) * (1 - tx) + (grid[at(ix + 1, iz)] * (1 - tz) + grid[at(ix + 1, iz + 1)] * tz) * tx;
  };
  const rowAcross = (ix, s) => { // the z at arc length s along row ix (past its ends, on along the level)
    let lo = 0, hi = nz - 1;
    if (s <= arc[at(ix, lo)]) return z0 + (s - arc[at(ix, lo)]);
    if (s >= arc[at(ix, hi)]) return z0 + hi * dz + (s - arc[at(ix, hi)]);
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[at(ix, mid)] <= s) lo = mid; else hi = mid; }
    const t = (s - arc[at(ix, lo)]) / (arc[at(ix, hi)] - arc[at(ix, lo)]);
    return z0 + (lo + t) * dz;
  };
  return {
    height: (x, z) => bilinear(top, x, z),
    normal(x, z) {
      const hx = (bilinear(top, x + dx, z) - bilinear(top, x - dx, z)) / (2 * dx);
      const hz = (bilinear(top, x, z + dz) - bilinear(top, x, z - dz)) / (2 * dz);
      return new V3(-hx, 1, -hz).normalize();
    },
    across(x, s) {
      const fx = clampX(x);
      const ix = Math.min(nx - 2, Math.floor(fx)), t = fx - ix;
      return rowAcross(ix, s) * (1 - t) + rowAcross(ix + 1, s) * t;
    },
  };
}

/**
 * The pad's arch across (the owner's pad bends down either side, as over a barrel): a point of the saddle's frame as how far round the
 * arch from its middle it is (s, signed: negative to the left) and how far over the arch's underside (d), both measured round `centre`
 * (metres up from the seat, under the middle of the pad). The underside is the innermost of the vertices lower than `below` (the pad)
 * at each angle round the centre.
 */
export function padArch(saddle, { below, centre }) {
  const BINS = 181; // one a degree, straight up in the middle
  const step = Math.PI / 180;
  const binOf = theta => Math.min(BINS - 1, Math.max(0, theta / step + 90));
  const inner = new Float64Array(BINS).fill(Infinity);
  const { positions } = saddle;
  for (let i = 0; i < positions.length / 3; i++) {
    const y = positions[3 * i + 1], z = positions[3 * i + 2];
    if (y >= below) continue;
    const b = Math.round(binOf(Math.atan2(z, y - centre)));
    inner[b] = Math.min(inner[b], Math.hypot(z, y - centre));
  }
  // bins with nothing in them from their neighbours (level past the ends); then the innermost of each bin's few round it, smoothed
  const filled = Array.from(inner);
  const known = filled.map((r, b) => (Number.isFinite(r) ? b : -1)).filter(b => b >= 0);
  if (!known.length) throw new Error('the saddle has no pad under its seat');
  for (let b = 0; b < BINS; b++) {
    if (Number.isFinite(filled[b])) continue;
    const after = known.find(k => k > b), before = known.findLast(k => k < b);
    filled[b] = before === undefined ? inner[after] : after === undefined ? inner[before] : inner[before] + (inner[after] - inner[before]) * (b - before) / (after - before);
  }
  const low = filled.map((_, b) => Math.min(...filled.slice(Math.max(0, b - 2), b + 3)));
  const r = low.map((_, b) => { const near = low.slice(Math.max(0, b - 1), b + 2); return near.reduce((s, x) => s + x, 0) / near.length; });
  // arc length round it from the middle
  const S = new Float64Array(BINS);
  const mid = 90;
  for (let b = mid + 1; b < BINS; b++) S[b] = S[b - 1] + Math.hypot((r[b] + r[b - 1]) / 2 * step, r[b] - r[b - 1]);
  for (let b = mid - 1; b >= 0; b--) S[b] = S[b + 1] - Math.hypot((r[b] + r[b + 1]) / 2 * step, r[b] - r[b + 1]);
  const lerp = (table, f) => { const b = Math.min(BINS - 2, Math.floor(f)); const t = f - b; return table[b] * (1 - t) + table[b + 1] * t; };
  return {
    at(y, z) {
      const f = binOf(Math.atan2(z, y - centre));
      return { s: lerp(S, f), d: Math.hypot(z, y - centre) - lerp(r, f) };
    },
  };
}

/** The weights at a point by the saddle's: its vertices' within a few centimetres, the nearer the more (four bones at most). */
function weightsNear(fitted, p, reach = 0.05) {
  const sum = new Map();
  let nearest = 0;
  fitted.positions.forEach((q, i) => {
    if (q.distanceToSquared(p) < fitted.positions[nearest].distanceToSquared(p)) nearest = i;
    const g = Math.exp(-q.distanceToSquared(p) / (reach * reach));
    if (g < 1e-3) return;
    for (const [bone, w] of fitted.weights[i]) sum.set(bone, (sum.get(bone) ?? 0) + w * g);
  });
  return blend(sum.size ? sum : fitted.weights[nearest], new Map(), 0);
}

// --- in her poses -----------------------------------------------------------------------------------------------------------------

/** Her poses while the saddle is on her (scenes 5-7 and flug): the clips flier.js and the chapters play then, at these fractions. */
export const POSES = [
  ['idle', [0, 0.25, 0.5, 0.75]],
  ['takeOff', [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9]],
  ['fly', [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]],
  ['glide', [0, 0.25, 0.5, 0.75]],
  ['land', [0, 0.2, 0.4, 0.6, 0.8, 0.97]],
];

/**
 * Puts `scene` (a copy of her, `mesh` its body) in each pose in turn and calls visit(label, matrices, bones): each bone's world matrix
 * by its inverse bind, and her bones posed (their turns drive the saddle's corrections).
 */
export function eachPose(gltf, scene, mesh, visit, poses = POSES) {
  const mixer = new THREE.AnimationMixer(scene);
  const { bones, boneInverses } = mesh.skeleton;
  for (const [name, at] of poses) {
    const clip = gltf.animations.find(c => c.name === name);
    if (!clip) continue;
    for (const k of at) {
      mixer.stopAllAction();
      mixer.clipAction(clip).play();
      mixer.setTime(k * clip.duration);
      scene.updateMatrixWorld(true);
      visit(`${name} ${k}`, bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, boneInverses[i])), bones);
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
}

/** A saddle vertex skinned: its bind position moved by its weights' bone matrices (her bindMatrix is the identity). */
export function skinnedAt(p, weights, matrices, out = new V3()) {
  out.set(0, 0, 0);
  for (const [bone, w] of weights) out.addScaledVector(scratch.copy(p).applyMatrix4(matrices[bone]), w);
  return out;
}
const scratch = new V3();

/** holdInPoses's numbers: rounds; the spread of a push (m); the field's weight of staying; how far off her skin what lies on it is
 * laid back; how near the first fit's weights and bind places stay (least-squares weights, each per pose). */
export const HOLD = { rounds: 4, spread: 0.04, anchor: 0.08, lift: 0.06, stay: 2e-4, rest: 0.2 };

/**
 * Makes the fit hold in her poses. In each pose the saddle, skinned with its weights, is pushed out where her skin comes into it, and
 * what lies on her skin (the pad's underside, the girth's inside) is laid back on it where it lifts off; each push spreads smoothly
 * into the saddle round it (HOLD.spread). Then each vertex's weights, over the bones it already has and those of the skin it met, are
 * fitted to where all the poses want it (least squares, four bones at most, kept near the first fit's by HOLD.stay), and its bind
 * place with them (kept near the first fit's by HOLD.rest). A few rounds. `posing(visit)` puts her mesh in each pose (eachPose).
 * Changes fitted.weights, positions and normals; returns each round's worst depth inside her.
 */
export function holdInPoses(fitted, skin, posing, { fit = FIT, hold = HOLD } = {}) {
  const { positions, contact } = fitted;
  const n = positions.length;
  const start = fitted.weights.map(w => new Map(w));
  const firstPlace = positions.map(p => p.clone());
  const near = neighbours(positions, hold.spread); // for spreading the pushes
  const { from } = near;

  const worst = [];
  const q = new V3();
  for (let round = 0; round < hold.rounds; round++) {
    const candidates = positions.map((_, i) => new Set([...start[i].keys(), ...fitted.weights[i].keys()]));
    const poses = [];
    let deepest = 0;
    posing((label, matrices) => {
      skin.pose();
      const at = new Float32Array(3 * n);
      const push = new Float32Array(3 * n);
      const pushed = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        skinnedAt(positions[i], fitted.weights[i], matrices, q);
        at[3 * i] = q.x; at[3 * i + 1] = q.y; at[3 * i + 2] = q.z;
        const c = skin.closest(q, { reach: 0.3 });
        if (!c) continue;
        deepest = Math.min(deepest, c.distance);
        if (c.distance < hold.lift) for (const [bone, w] of c.weights) if (w > 0.1) candidates[i].add(bone);
        const off = contact[i] ? c.distance < hold.lift : c.distance < fit.gap;
        if (off && Math.abs(c.distance - fit.gap) > 1e-3) {
          const d = fit.gap - c.distance;
          push[3 * i] = c.normal.x * d; push[3 * i + 1] = c.normal.y * d; push[3 * i + 2] = c.normal.z * d;
          pushed[i] = 1;
        }
      }
      const target = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) {
        let x = 0, y = 0, z = 0, total = 0;
        if (pushed[i]) { x = push[3 * i]; y = push[3 * i + 1]; z = push[3 * i + 2]; } else {
          for (let k = from[i]; k < from[i + 1]; k++) {
            const j = near.j[k];
            if (!pushed[j]) continue;
            const g = near.g[k];
            x += push[3 * j] * g; y += push[3 * j + 1] * g; z += push[3 * j + 2] * g;
            total += g;
          }
          const s = total > 0 ? 1 / (total + hold.anchor) : 0;
          x *= s; y *= s; z *= s;
        }
        target[3 * i] = at[3 * i] + x; target[3 * i + 1] = at[3 * i + 1] + y; target[3 * i + 2] = at[3 * i + 2] + z;
      }
      poses.push({ label, matrices, target });
    });
    skin.unpose();
    worst.push(deepest);
    fitted.weights = positions.map((p, i) => fitWeights(p, [...candidates[i]], poses, i, start[i], hold.stay));
    // and each vertex's place in the bind pose, so that with those weights it comes nearest where the poses want it (kept near the
    // first fit's place by HOLD.rest: the saddle keeps its shape)
    if (hold.rest > 0) for (let i = 0; i < n; i++) restAt(positions[i], firstPlace[i], fitted.weights[i], poses, i, hold.rest);
  }
  if (hold.rest > 0) fitted.normals = smoothNormals(positions, fitted.index);
  return worst;
}

/** Each vertex's neighbours by bind distance with a Gaussian weight of `spread` (m): those of i are j[from[i]..from[i+1]), g likewise. */
function neighbours(positions, spread) {
  const n = positions.length;
  const cell = spread * 2.5;
  const grid = new Map();
  const key = (x, y, z) => ((x + 2048) * 4096 + (y + 2048)) * 4096 + (z + 2048);
  positions.forEach((p, i) => {
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const from = new Int32Array(n + 1);
  const js = [], gs = [];
  for (let i = 0; i < n; i++) {
    const p = positions[i];
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
      for (const j of grid.get(key(x, y, z)) ?? []) {
        const g = Math.exp(-positions[j].distanceToSquared(p) / (spread * spread));
        if (g > 0.01 && j !== i) { js.push(j); gs.push(g); }
      }
    }
    from[i + 1] = js.length;
  }
  return { from, j: Int32Array.from(js), g: Float32Array.from(gs) };
}

/**
 * correctInPoses's numbers: the bones whose turns say how much of each correction is on (null: the bones the saddle hangs on, whose
 * turns are what bends it and the skin under it; her hips turn 46 degrees between standing and flying, so her upper arms alone would
 * take a take-off pose for a wing beat's); a vertex nearer her skin than `touch` (m: under the fit's gap, so the pad lying on her
 * is left as it lies) is pushed out to `clear` from it; a pose whose deepest is above `inside` needs nothing; poses whose turns are
 * within `merge` (radians, the most of any of those bones) of each other share a key; a key fades out as her turns go `radius` from
 * its own; the spread of a push (m) and the field's weight of staying; the clips whose keys push along her skin's normal (standing:
 * her folded arm over the pad's edge), the others pushing up from her back; the least slope a push up counts the skin it is in as
 * having (the dot of their normals: a push up as far as clears it, so skin facing aside or down is cleared in a few rounds, not
 * none); the most a vertex is pushed in a round (m); rounds; moves under `least` (m) are left out.
 */
export const CORRECT = { drivers: null, touch: 0.005, clear: 0.012, inside: -0.003, merge: 0.05, radius: 1, spread: 0.06, anchor: 0.05, along: ['idle'], facing: 0.3, most: 0.06, rounds: 24, least: 0.001 };

/** Where vertex i of a fitted saddle is in the bind frame with its corrections on as much as `on` says. */
export function correctedAt(fitted, i, on, out = new V3()) {
  out.copy(fitted.positions[i]);
  (fitted.corrections ?? []).forEach((c, k) => {
    if (on[k] > 0) out.set(out.x + c.deltas[3 * i] * on[k], out.y + c.deltas[3 * i + 1] * on[k], out.z + c.deltas[3 * i + 2] * on[k]);
  });
  return out;
}

/** How much of each of a fitted saddle's corrections is on with her bones posed as `bones` (eachPose's third argument). */
export function correctionsOn(fitted, bones) {
  if (!fitted.corrections?.length) return [];
  const byName = new Map(bones.map(b => [b.name, b]));
  return correctionsAt(fitted.corrections, fitted.clean ?? [], name => byName.get(name).quaternion);
}

/**
 * Corrections for the poses where her skin still comes into the saddle after the hold. Some of it cannot be held by bone weights:
 * where her wings are up (the top of a wing beat) or folded, the skin of her wing roots swings up over her back, over the pad, and
 * down again as the wing comes the other way, while the pad has to stay on her back; no blend of her bones does both. Each of her
 * poses (merged where the bones the saddle hangs on are turned within CORRECT.merge of another's) is a key: in each round, in each
 * pose, the saddle with the corrections so far (engine/flier-saddle.js correctionsAt: exactly a key's own in its pose, a blend of
 * the nearest between) is pushed out where she comes into it, each push spread smoothly into the pad round it, and the push goes
 * into its key's correction in the bind frame: a morph target. The keys that never need one are the clean poses, which hold the
 * blend near them at none. Sets fitted.corrections: [{ label, at: { bone: quaternion }, radius, deltas }] and fitted.clean.
 */
export function correctInPoses(fitted, skin, posing, { up, correct = CORRECT } = {}) {
  const { positions, weights } = fitted;
  const n = positions.length;
  const near = neighbours(positions, correct.spread);
  const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
  // the keys: her poses, merged; by the turns of the bones the saddle hangs on (or those asked for)
  const keys = [];
  let drivers = correct.drivers;
  posing((label, matrices, bones) => {
    drivers ??= [...new Set(weights.flatMap(w => [...w.keys()]))].sort((a, b) => a - b).map(i => bones[i].name);
    const byName = new Map(bones.map(b => [b.name, b]));
    const at = Object.fromEntries(drivers.map(name => [name, byName.get(name).quaternion.toArray()]));
    if (!keys.some(k => Math.max(...drivers.map(name => angle(at[name], k.at[name]))) < correct.merge)) keys.push({ label, at, radius: correct.radius, deltas: null });
  });
  const split = () => {
    fitted.corrections = keys.filter(k => k.deltas);
    fitted.clean = keys.filter(k => !k.deltas).map(({ label, at, radius }) => ({ label, at, radius }));
  };
  split();
  const p = new V3(), q = new V3(), d = new V3();
  const sum = new THREE.Matrix4(), turn = new THREE.Matrix3();
  const push = new Float32Array(3 * n), spread = new Float32Array(3 * n), total = new Float32Array(n);
  const pushed = new Uint8Array(n);
  for (let round = 0; round < correct.rounds; round++) {
    let added = 0, worst = 0;
    posing((label, matrices, bones) => {
      const byName = new Map(bones.map(b => [b.name, b]));
      const turns = Object.fromEntries(drivers.map(name => [name, byName.get(name).quaternion.toArray()]));
      const shares = correctionsAt(keys, [], name => byName.get(name).quaternion); // every key's share here
      const on = fitted.corrections.map(c => shares[keys.indexOf(c)]);
      // its key: the nearest by those bones' turns (every pose is within merge of one)
      let k = 0, best = Infinity;
      keys.forEach((key, j) => {
        const far = Math.max(...drivers.map(name => angle(turns[name], key.at[name])));
        if (far < best) { best = far; k = j; }
      });
      const key = keys[k];
      const alongSkin = correct.along.includes(key.label.split(' ')[0]);
      skin.pose();
      push.fill(0);
      pushed.fill(0);
      const moved = [];
      let deepest = Infinity;
      for (let i = 0; i < n; i++) {
        skinnedAt(correctedAt(fitted, i, on, p), weights[i], matrices, q);
        const c = skin.closest(q, { reach: 0.3 });
        if (!c) continue;
        deepest = Math.min(deepest, c.distance);
        if (c.distance >= correct.touch) continue;
        let move;
        if (alongSkin) {
          // standing, her folded arm lies over the pad's edge: out of it along her skin's normal, down under the arm
          d.copy(c.normal);
          move = Math.min(correct.most, correct.clear - c.distance);
        } else {
          // flying, her wing root swells up under the pad as her wing comes up: pushed up from her back as her back is turned there
          // in this pose, as far as clears the slope of the skin it is in (her skin's own normal flips from side to side where a
          // wing root folds, so pushes along it would go back and forth)
          sum.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
          for (const [bone, w] of weights[i]) for (let e = 0; e < 16; e++) sum.elements[e] += matrices[bone].elements[e] * w;
          d.copy(up).applyMatrix3(turn.setFromMatrix4(sum)).normalize();
          move = Math.min(correct.most, (correct.clear - c.distance) / Math.max(c.normal.dot(d), correct.facing));
        }
        push[3 * i] = d.x * move; push[3 * i + 1] = d.y * move; push[3 * i + 2] = d.z * move;
        pushed[i] = 1;
        moved.push(i);
      }
      worst = Math.min(worst, deepest);
      if (deepest > correct.inside || !moved.length) return;
      if (!key.deltas) { key.deltas = new Float32Array(3 * n); split(); }
      const scale = 1 / Math.max(shares[k], 0.25);
      // each push spread into the pad round it, kept near none there by `anchor` (a pushed vertex takes its own push); what a push
      // falls short by, the next round makes up
      spread.fill(0);
      total.fill(0);
      for (const j of moved) {
        for (let m = near.from[j]; m < near.from[j + 1]; m++) {
          const i = near.j[m];
          if (pushed[i]) continue;
          const g = near.g[m];
          spread[3 * i] += push[3 * j] * g; spread[3 * i + 1] += push[3 * j + 1] * g; spread[3 * i + 2] += push[3 * j + 2] * g;
          total[i] += g;
        }
      }
      for (let i = 0; i < n; i++) {
        if (pushed[i]) { spread[3 * i] = push[3 * i]; spread[3 * i + 1] = push[3 * i + 1]; spread[3 * i + 2] = push[3 * i + 2]; total[i] = 1; }
        if (total[i] === 0) continue;
        const s = 1 / (total[i] + (pushed[i] ? 0 : correct.anchor));
        const x = spread[3 * i] * s, y = spread[3 * i + 1] * s, z = spread[3 * i + 2] * s;
        // into the bind frame: by the inverse of the vertex's blended bone turn in this pose
        sum.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        for (const [bone, w] of weights[i]) for (let e = 0; e < 16; e++) sum.elements[e] += matrices[bone].elements[e] * w;
        turn.setFromMatrix4(sum).invert();
        d.set(x, y, z).applyMatrix3(turn).multiplyScalar(scale);
        key.deltas[3 * i] += d.x; key.deltas[3 * i + 1] += d.y; key.deltas[3 * i + 2] += d.z;
      }
      added++;
    });
    skin.unpose();
    if (process.env.SADDLE_DEBUG) console.log(`[saddle-fit] correction round ${round}: ${added} poses pushed, deepest ${(worst * 100).toFixed(1)} cm`);
    if (!added) break;
  }
  // what moves less than CORRECT.least is left out (the spread's far tails: nothing to see, and the file stays small)
  for (const c of fitted.corrections) {
    for (let i = 0; i < n; i++) if (Math.hypot(c.deltas[3 * i], c.deltas[3 * i + 1], c.deltas[3 * i + 2]) < correct.least) c.deltas.fill(0, 3 * i, 3 * i + 3);
  }
  return fitted.corrections;
}

/** Moves bind position p to where, skinned by `weights`, it best meets the poses' targets: least squares, kept near `home` by rest. */
function restAt(p, home, weights, poses, i, rest) {
  const A = new THREE.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
  const b = new V3();
  const R = new THREE.Matrix3(), RT = new THREE.Matrix3(), RTR = new THREE.Matrix3();
  const T = new V3(), t = new V3(), sum = new THREE.Matrix4();
  for (const pose of poses) {
    sum.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (const [bone, w] of weights) for (let k = 0; k < 16; k++) sum.elements[k] += pose.matrices[bone].elements[k] * w;
    R.setFromMatrix4(sum);
    T.setFromMatrixPosition(sum);
    RT.copy(R).transpose();
    RTR.multiplyMatrices(RT, R);
    for (let k = 0; k < 9; k++) A.elements[k] += RTR.elements[k];
    t.set(pose.target[3 * i], pose.target[3 * i + 1], pose.target[3 * i + 2]).sub(T).applyMatrix3(RT);
    b.add(t);
  }
  const k = rest * poses.length;
  A.elements[0] += k; A.elements[4] += k; A.elements[8] += k;
  b.addScaledVector(home, k);
  p.copy(b.applyMatrix3(A.invert()));
}

/**
 * One vertex's weights over `bones` that put it nearest where the poses want it (sum to one, none below zero, four at most), kept
 * near `start` by `stay`. Least squares on the simplex (accelerated projected gradient), from the start weights' place in each pose.
 */
function fitWeights(p, bones, poses, i, start, stay) {
  if (bones.length === 1) return new Map([[bones[0], 1]]);
  const solve = list => {
    const m = list.length;
    const H = Array.from({ length: m }, () => new Float64Array(m));
    const g = new Float64Array(m);
    const ref = new V3(), col = list.map(() => new V3()), t = new V3();
    for (const pose of poses) {
      skinnedAt(p, start, pose.matrices, ref);
      list.forEach((bone, b) => col[b].copy(p).applyMatrix4(pose.matrices[bone]).sub(ref));
      t.set(pose.target[3 * i], pose.target[3 * i + 1], pose.target[3 * i + 2]).sub(ref);
      for (let a = 0; a < m; a++) {
        g[a] += col[a].dot(t);
        for (let b = 0; b < m; b++) H[a][b] += col[a].dot(col[b]);
      }
    }
    const w0 = list.map(bone => start.get(bone) ?? 0);
    for (let a = 0; a < m; a++) { H[a][a] += stay; g[a] += stay * w0[a]; }
    let L = 0;
    for (let a = 0; a < m; a++) L = Math.max(L, H[a].reduce((s, h) => s + Math.abs(h), 0));
    let w = simplex(w0.map(x => x + 1e-6)), y = w.slice(), k = 1;
    for (let it = 0; it < 300; it++) {
      const step = y.map((v, a) => v - (H[a].reduce((s, h, b) => s + h * y[b], 0) - g[a]) / L);
      const next = simplex(step);
      const kNext = (1 + Math.sqrt(1 + 4 * k * k)) / 2;
      y = next.map((v, a) => v + ((k - 1) / kNext) * (v - w[a]));
      w = next; k = kNext;
    }
    return w;
  };
  let w = solve(bones);
  let list = bones;
  if (bones.length > 4) {
    list = bones.map((bone, b) => [bone, w[b]]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([bone]) => bone);
    w = solve(list);
  }
  return blend(new Map(list.map((bone, b) => [bone, w[b]])), new Map(), 0);
}

/** The point of the simplex (all >= 0, sum 1) nearest v. */
function simplex(v) {
  const u = [...v].sort((a, b) => b - a);
  let sum = 0, theta = 0;
  for (let j = 0; j < u.length; j++) {
    sum += u[j];
    const t = (sum - 1) / (j + 1);
    if (u[j] - t > 0) theta = t;
  }
  return v.map(x => Math.max(0, x - theta));
}

/**
 * How the fit holds in her poses: for each, the saddle's vertices inside her skin (with its corrections on as her bones say, when it
 * has them), the deepest (metres, below zero), and what lies on her skin but has lifted more than 2 cm off it.
 */
export function checkInPoses(fitted, skin, posing, { part = null } = {}) {
  const out = [];
  const q = new V3(), p = new V3();
  posing((label, matrices, bones) => {
    skin.pose();
    const on = correctionsOn(fitted, bones ?? []);
    let inside = 0, worst = 0, lifted = 0;
    const parts = {};
    for (let i = 0; i < fitted.positions.length; i++) {
      skinnedAt(correctedAt(fitted, i, on, p), fitted.weights[i], matrices, q);
      const c = skin.closest(q, { reach: 0.3 });
      if (!c) continue;
      if (c.distance < 0) {
        inside++;
        worst = Math.min(worst, c.distance);
        if (part) { const k = part(i); parts[k] = Math.min(parts[k] ?? 0, c.distance); }
      }
      if (fitted.contact[i] && c.distance > 0.02) lifted++;
    }
    out.push({ label, inside, worst, lifted, parts });
  });
  skin.unpose();
  return out;
}

/** Two weight maps blended (k of the second), cut to the four largest and normalized. */
export function blend(a, b, k) {
  const all = new Map();
  for (const [bone, w] of a) all.set(bone, (all.get(bone) ?? 0) + w * (1 - k));
  for (const [bone, w] of b) all.set(bone, (all.get(bone) ?? 0) + w * k);
  const top = [...all].sort((x, y) => y[1] - x[1]).slice(0, 4).filter(([, w]) => w > 1e-4);
  const total = top.reduce((s, [, w]) => s + w, 0);
  return new Map(top.map(([bone, w]) => [bone, w / total]));
}

/** Vertex normals from the faces round each place (vertices at one place, a UV seam's, share one normal). */
export function smoothNormals(positions, index) {
  const keyOf = p => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
  const at = new Map();
  const a = new V3(), b = new V3(), face = new V3();
  for (let f = 0; f < index.length; f += 3) {
    const [i, j, k] = [index[f], index[f + 1], index[f + 2]];
    face.crossVectors(a.subVectors(positions[j], positions[i]), b.subVectors(positions[k], positions[i])); // area-weighted
    for (const v of [i, j, k]) {
      const key = keyOf(positions[v]);
      if (!at.has(key)) at.set(key, new V3());
      at.get(key).add(face);
    }
  }
  return positions.map(p => at.get(keyOf(p))?.clone().normalize() ?? new V3(0, 1, 0));
}

// --- GLB in and out ---------------------------------------------------------------------------------------------------------------
const SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COUNTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NORMALIZE = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

/** A GLB's JSON and binary chunk. */
export function readGlb(file) {
  const glb = fs.readFileSync(file);
  if (glb.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${file} is not a GLB`);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength + 8;
  return { json, bin: glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLength)) };
}

function readAccessor({ json, bin }, index) {
  const a = json.accessors[index];
  const view = json.bufferViews[a.bufferView];
  const n = COUNTS[a.type], size = SIZES[a.componentType];
  const stride = view.byteStride || n * size;
  const start = (view.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float64Array(a.count * n);
  const scale = a.normalized ? NORMALIZE[a.componentType] : 1;
  for (let i = 0; i < a.count; i++) {
    const element = new TYPED[a.componentType](bin.buffer, bin.byteOffset + start + i * stride, n);
    for (let k = 0; k < n; k++) out[i * n + k] = a.normalized ? Math.max(-1, element[k] / scale) : element[k];
  }
  return out;
}

/** The prepped saddle: its one mesh's primitives merged, with each node's transform applied (metres, the saddle's frame). */
export function readSaddle(file) {
  const glb = readGlb(file);
  const { json } = glb;
  const positions = [], normals = [], uvs = [], index = [];
  let material = null;
  const matrixOf = node => {
    const m = new THREE.Matrix4();
    if (node.matrix) return m.fromArray(node.matrix);
    return m.compose(new V3(...(node.translation ?? [0, 0, 0])), new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new V3(...(node.scale ?? [1, 1, 1])));
  };
  const visit = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const world = parent.clone().multiply(matrixOf(node));
    if (node.mesh != null) {
      const turn = new THREE.Matrix3().getNormalMatrix(world);
      for (const p of json.meshes[node.mesh].primitives) {
        if (material !== null && p.material !== material) throw new Error('the saddle should have one material (blender-saddle.py merges it)');
        material = p.material;
        const base = positions.length / 3;
        const pos = readAccessor(glb, p.attributes.POSITION);
        const nor = p.attributes.NORMAL != null ? readAccessor(glb, p.attributes.NORMAL) : null;
        const uv = p.attributes.TEXCOORD_0 != null ? readAccessor(glb, p.attributes.TEXCOORD_0) : null;
        const v = new V3();
        for (let i = 0; i < pos.length / 3; i++) {
          v.set(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]).applyMatrix4(world);
          positions.push(v.x, v.y, v.z);
          if (nor) { v.set(nor[3 * i], nor[3 * i + 1], nor[3 * i + 2]).applyMatrix3(turn).normalize(); normals.push(v.x, v.y, v.z); } else normals.push(0, 1, 0);
          if (uv) uvs.push(uv[2 * i], uv[2 * i + 1]); else uvs.push(0, 0);
        }
        const idx = p.indices != null ? readAccessor(glb, p.indices) : Array.from({ length: pos.length / 3 }, (_, i) => i);
        for (const i of idx) index.push(base + i);
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of json.scenes[json.scene ?? 0].nodes) visit(root, new THREE.Matrix4());
  return { glb, positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), index, material };
}

/** Writes the fitted saddle: one node, one mesh, her bones named in extras.joints; the prepped file's material, textures and images. */
export function writeFitted(file, saddle, fitted, { joints, slot, extras }) {
  const { json: src, bin: srcBin } = saddle.glb;
  const chunks = [];
  const views = [];
  let offset = 0;
  const addView = (bytes, extra = {}) => {
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes, Buffer.alloc(pad));
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...extra });
    offset += bytes.length + pad;
    return views.length - 1;
  };
  const accessors = [];
  const addAccessor = (Typed, values, type, componentType, { target = 34962, normalized = false, bounds = false } = {}) => {
    const array = Typed.from(values);
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const accessor = { bufferView: addView(Buffer.from(bytes), { target }), componentType, count: values.length / COUNTS[type], type };
    if (normalized) accessor.normalized = true;
    if (bounds) {
      const n = COUNTS[type];
      accessor.min = Array.from({ length: n }, (_, k) => Math.min(...array.filter((_, i) => i % n === k)));
      accessor.max = Array.from({ length: n }, (_, k) => Math.max(...array.filter((_, i) => i % n === k)));
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };
  // images as they were
  const images = (src.images ?? []).map(image => {
    if (image.bufferView == null) return image;
    const view = src.bufferViews[image.bufferView];
    const bytes = srcBin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    return { ...image, bufferView: addView(Buffer.from(bytes)) };
  });
  const n = fitted.positions.length;
  const pos = fitted.positions.flatMap(p => [p.x, p.y, p.z]);
  const nor = fitted.normals.flatMap(p => [p.x, p.y, p.z]);
  const jointsOut = [];
  const weightsOut = [];
  for (const w of fitted.weights) {
    const list = [...w];
    for (let k = 0; k < 4; k++) {
      jointsOut.push(list[k] ? slot.get(list[k][0]) ?? -1 : 0);
      weightsOut.push(list[k] ? list[k][1] : 0);
    }
  }
  if (jointsOut.some(j => j < 0)) throw new Error('a weight names a bone that is not in the joints list');
  const wide = n > 65535;
  const primitive = {
    attributes: {
      POSITION: addAccessor(Float32Array, pos, 'VEC3', 5126, { bounds: true }),
      NORMAL: addAccessor(Float32Array, nor, 'VEC3', 5126),
      TEXCOORD_0: addAccessor(Float32Array, Array.from(saddle.uvs), 'VEC2', 5126),
      JOINTS_0: addAccessor(Uint8Array, jointsOut, 'VEC4', 5121),
      WEIGHTS_0: addAccessor(Float32Array, weightsOut, 'VEC4', 5126),
    },
    indices: addAccessor(wide ? Uint32Array : Uint16Array, saddle.index, 'SCALAR', wide ? 5125 : 5123, { target: 34963 }),
    material: 0,
  };
  // the corrections as morph targets, sparse: only the vertices each moves
  const corrections = fitted.corrections ?? [];
  if (corrections.length) {
    primitive.targets = corrections.map(({ deltas }) => {
      const moved = [];
      for (let i = 0; i < n; i++) if (Math.hypot(deltas[3 * i], deltas[3 * i + 1], deltas[3 * i + 2]) > 1e-5) moved.push(i);
      const values = Float32Array.from(moved.flatMap(i => [deltas[3 * i], deltas[3 * i + 1], deltas[3 * i + 2]]));
      const indices = (wide ? Uint32Array : Uint16Array).from(moved);
      const min = [0, 1, 2].map(k => Math.min(0, ...moved.map(i => deltas[3 * i + k])));
      const max = [0, 1, 2].map(k => Math.max(0, ...moved.map(i => deltas[3 * i + k])));
      accessors.push({
        componentType: 5126, count: n, type: 'VEC3', min, max,
        sparse: {
          count: moved.length,
          indices: { bufferView: addView(Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength)), componentType: wide ? 5125 : 5123 },
          values: { bufferView: addView(Buffer.from(values.buffer, values.byteOffset, values.byteLength)) },
        },
      });
      return { POSITION: accessors.length - 1 };
    });
  }
  const material = src.materials?.[saddle.material ?? 0] ?? { pbrMetallicRoughness: { baseColorFactor: [0.44, 0.33, 0.25, 1], metallicFactor: 0, roughnessFactor: 0.8 } };
  // the maps' extensions as they were (Blender writes WebP maps: EXT_texture_webp); the vertices are written plain, so not quantization
  const extensions = list => (list ?? []).filter(name => name !== 'KHR_mesh_quantization');
  const used = extensions(src.extensionsUsed);
  const required = extensions(src.extensionsRequired);
  const json = {
    asset: { version: '2.0', generator: 'remake/tools/saddle-fit.mjs' },
    ...(used.length ? { extensionsUsed: used } : {}),
    ...(required.length ? { extensionsRequired: required } : {}),
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Hnakkur', mesh: 0, extras: { joints, ...extras } }],
    meshes: [{ name: 'Hnakkur', primitives: [primitive], ...(corrections.length ? { extras: { targetNames: corrections.map(c => c.label) } } : {}) }],
    materials: [material],
    ...(src.textures ? { textures: src.textures } : {}),
    ...(src.samplers ? { samplers: src.samplers } : {}),
    ...(images.length ? { images } : {}),
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const binary = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + binary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(text.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([header, jsonHeader, text, binHeader, binary]));
}

// --- the command ------------------------------------------------------------------------------------------------------------------
async function main() {
  const [input, output] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  // --name=value overrides a number of FIT (to try one before it goes in)
  const fit = { ...FIT };
  for (const a of process.argv.slice(2).filter(a => a.startsWith('--'))) {
    const [name, value] = a.slice(2).split('=');
    if (!(name in FIT)) throw new Error(`no such fit setting: ${name}`);
    fit[name] = Number.isNaN(Number(value)) ? value : Number(value);
  }
  if (!input || !output) {
    console.error('usage: node --import ./remake/tests/setup.mjs remake/tools/saddle-fit.mjs <prepped.glb> <out.glb> [--<FIT setting>=<value>]');
    process.exit(1);
  }
  const { loadCharacter, skinnedMeshOf } = await import('../tests/characters.mjs');
  const gltf = await loadCharacter('flugedla');
  const scene = cloneSkinned(gltf.scene);
  scene.updateMatrixWorld(true);
  const mesh = skinnedMeshOf(scene);
  const frame = backFrame(gltf, mesh);
  const skin = skinSurface(mesh, { around: frame.seat, near: 1.4 });
  const saddle = readSaddle(input);
  const t0 = Date.now();
  const fitted = fitSaddle(saddle, skin, frame, { fit });
  const posing = visit => eachPose(gltf, scene, mesh, visit);
  const rows = rows => rows.map(r => `${r.label} ${r.inside} (${(r.worst * 100).toFixed(1)} cm)`).join(', ');
  console.log(`[saddle-fit] laid on her back; inside her in her poses: ${rows(checkInPoses(fitted, skin, posing))}`);
  holdInPoses(fitted, skin, posing, { fit });
  console.log(`[saddle-fit] held in her poses; inside her: ${rows(checkInPoses(fitted, skin, posing))}`);
  correctInPoses(fitted, skin, posing, { up: frame.up });
  const held = checkInPoses(fitted, skin, posing);
  console.log(`[saddle-fit] ${fitted.corrections.length} corrections (${fitted.corrections.map(c => c.label).join(', ')}), ${fitted.clean.length} clean poses; inside her: ${rows(held)}`);
  const bones = mesh.skeleton.bones.map(b => b.name);
  const used = [...new Set(fitted.weights.flatMap(w => [...w.keys()]))].sort((a, b) => a - b);
  const joints = used.map(i => bones[i]);
  const places = placesOf(fitted, bones);
  const key = ({ label, at, radius }) => ({ label, radius, at: Object.fromEntries(Object.entries(at).map(([name, q]) => [name, q.map(x => Number(x.toFixed(6)))])) });
  const extras = {
    frame: { seat: frame.seat.toArray(), ahead: frame.ahead.toArray(), up: frame.up.toArray(), right: frame.right.toArray() },
    fit: { ...fit, ...fitted.report, hold: HOLD, seconds: (Date.now() - t0) / 1000 },
    poses: held.map(({ label, inside, worst, lifted }) => ({ label, inside, worst: Number(worst.toFixed(4)), lifted })),
    places,
    // the morph targets' drivers, in their order: her bones' turns in the pose each is for, and how far from them it fades out; and
    // likewise the poses that need none (engine/flier-saddle.js correctionsAt)
    corrections: fitted.corrections.map(key),
    clean: fitted.clean.map(key),
    correct: CORRECT,
    source: path.basename(input),
  };
  writeFitted(output, saddle, fitted, { joints, slot: new Map(used.map((bone, k) => [bone, k])), extras }); // JOINTS_0 indexes extras.joints
  console.log(`[saddle-fit] ${fitted.report.vertices} vertices, ${saddle.index.length / 3} triangles; laid ${fitted.report.laid}, pushed out ${fitted.report.pushed}; raised ${fitted.report.raise} m; joints ${joints.join(' ')}`);
  console.log(`[saddle-fit] wrote ${output} (${fs.statSync(output).size} bytes) in ${extras.fit.seconds} s`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
