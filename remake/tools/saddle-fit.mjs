#!/usr/bin/env node
// Fits Flugeðla's saddle to her back and binds it to her bones (chapter 4: Egill rides her on it). Step 2 of preparing the saddle:
// step 1 (remake/tools/blender-saddle.py) turns the owner's Tripo model to face +X with +Y up and its origin on the seat (where Egill
// sits), in metres, welds and decimates it and makes its maps small. This step:
//
//   node --import ./remake/tests/setup.mjs remake/tools/saddle-fit.mjs <prepped.glb> <out.glb>
//
// 1. Puts the saddle on her back in the bind pose, its frame level with her back as it is in carry's first pose (flier.js SEAT: the
//    seat on her Spine bone), so its seat sits on the top of her back, its underside `GAP` over her skin.
// 2. Lays what faces her skin onto it (the pad's underside, the inside of the girth): each such vertex goes to the closest point of her
//    skin, GAP out from it, and the rest of the saddle near it follows by a smooth field of those moves (FALLOFF), fading out toward
//    the seat, so the pad drapes over the wing roots either side of her back and the girth hugs her, while the seat and the handlebar
//    keep their shape. Then anything still within GAP / 2 of her skin, or inside it, is put GAP out from it.
// 3. Gives each vertex her skin's bone weights at its closest point; up toward the seat they blend into the weights at the seat (her
//    spine's), so the seat and the handlebar move as one with her back while the pad and the girth bend as her skin bends under them,
//    over her wing roots in the wing beats too.
// 4. Holds in her poses (holdInPoses): in each of the poses she is in with the saddle on (POSES), where her skin comes into the saddle
//    it is pushed out, and the weights and bind places are fitted to those poses; then counts what is still inside her in each.
// 5. Writes one mesh in her bind frame (her mesh's own, as GLTFLoader reads it) with JOINTS_0 and WEIGHTS_0 naming her bones by name
//    (extras.joints), the same material and maps, and in extras the places a rider uses (seat, grips, knees, ankles: bind-frame points
//    with their weights) and what the fit did. engine/flier-saddle.js binds it to her skeleton when it loads.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { skinSurface } from '../engine/skin-surface.js';
import { SEAT } from '../engine/flier.js';

const V3 = THREE.Vector3;
const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/** The fit's numbers: metres, in the saddle's frame (x ahead, y up, z her right; the origin on the seat). */
export const FIT = {
  gap: 0.006, // between her skin and the saddle's underside
  ahead: 0, // the saddle's origin this far ahead of the seat on her back (along her back, level)
  contact: 0.4, // a vertex that faces her skin and lies within this of it is laid onto it
  facing: 0.35, // ... facing it: the cosine between its normal and the way to her skin
  falloff: 0.07, // over which a laid vertex's move spreads into the saddle round it
  anchor: 0.08, // how firmly the rest of the saddle stays put where few laid vertices are near (the field's weight of staying)
  padTop: -0.05, // below this height the saddle follows her skin (the pad and the girth)
  underside: 0.3, // the pad's underside is the lowest of the saddle within this under its origin (the girth hangs lower)
  rigid: 0.02, // above this height it moves with her back at the seat alone (the seat, the cantle, the handlebar)
};

/** Where a rider's places are on the saddle, in its frame: set for the model in hand (blender-saddle.py's report). */
export const PLACES = {
  seat: [0, 0, 0],
  grips: { left: [0.25, 0.17, -0.1], right: [0.25, 0.17, 0.1] },
  knees: { left: [0.2, 0.05, -0.32], right: [0.2, 0.05, 0.32] },
  ankles: { left: [-0.05, -0.12, -0.36], right: [-0.05, -0.12, 0.36] },
};

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
 * pose); `frame`: backFrame(). Returns { positions, normals (bind frame), weights: Array of Map(bone -> w), place(p), report }, where
 * place(p) takes a point of the saddle's frame to the bind frame as the fit moved the saddle round it.
 */
export function fitSaddle(saddle, skin, frame, { fit = FIT } = {}) {
  const n = saddle.positions.length / 3;
  const P = i => new V3(saddle.positions[3 * i], saddle.positions[3 * i + 1], saddle.positions[3 * i + 2]);
  const N = i => new V3(saddle.normals[3 * i], saddle.normals[3 * i + 1], saddle.normals[3 * i + 2]);
  const toBind = (p, out = new V3()) => out.copy(frame.seat)
    .addScaledVector(frame.ahead, p.x + fit.ahead).addScaledVector(frame.up, p.y).addScaledVector(frame.right, p.z);
  const dirToBind = (d, out = new V3()) => out.set(0, 0, 0).addScaledVector(frame.ahead, d.x).addScaledVector(frame.up, d.y).addScaledVector(frame.right, d.z);

  // 1. On her back: the underside below the seat on the top of her back, GAP over it.
  let bottom = Infinity;
  for (let i = 0; i < n; i++) {
    const p = P(i);
    if (Math.abs(p.x) < 0.06 && Math.abs(p.z) < 0.06 && p.y > -fit.underside) bottom = Math.min(bottom, p.y);
  }
  if (!Number.isFinite(bottom)) throw new Error('the saddle has nothing under its origin: is its origin on the seat?');
  const under = skin.closest(toBind(new V3(0, bottom, 0)));
  const raise = fit.gap - under.distance; // to her skin, and GAP over it
  const placed = Array.from({ length: n }, (_, i) => toBind(P(i)).addScaledVector(frame.up, raise));
  const height = Array.from({ length: n }, (_, i) => P(i).y);

  // 2. What faces her skin, laid onto it.
  const moves = new Array(n).fill(null);
  const near = new Array(n);
  const normal = new V3();
  const toward = new V3();
  let laid = 0;
  for (let i = 0; i < n; i++) {
    const c = skin.closest(placed[i]);
    near[i] = c;
    if (!c || height[i] > fit.padTop) continue;
    dirToBind(N(i), normal).normalize();
    toward.subVectors(c.point, placed[i]);
    const facing = toward.lengthSq() > 1e-12 ? normal.dot(toward.normalize()) : 1;
    if (c.distance < fit.gap || (facing > fit.facing && c.distance < fit.contact)) {
      moves[i] = c.point.clone().addScaledVector(c.normal, fit.gap).sub(placed[i]);
      laid++;
    }
  }
  // the field: each vertex moves by its laid neighbours' moves, weighted by closeness, against a weight of staying; fading out
  // toward the seat
  const cell = fit.falloff * 2;
  const grid = new Map();
  const key = p => `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`;
  for (let i = 0; i < n; i++) if (moves[i]) {
    const k = key(placed[i]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const moved = placed.map(p => p.clone());
  const sum = new V3();
  for (let i = 0; i < n; i++) {
    if (moves[i]) { moved[i].add(moves[i]); continue; }
    const p = placed[i];
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
    sum.set(0, 0, 0);
    let total = 0;
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy - 2; y <= cy + 2; y++) for (let z = cz - 2; z <= cz + 2; z++) {
      for (const j of grid.get(`${x},${y},${z}`) ?? []) {
        const g = Math.exp(-(placed[j].distanceToSquared(p)) / (fit.falloff * fit.falloff));
        sum.addScaledVector(moves[j], g);
        total += g;
      }
    }
    const fade = 1 - smooth((height[i] - fit.padTop) / (fit.rigid - fit.padTop));
    if (total > 0) moved[i].addScaledVector(sum, fade / (total + fit.anchor));
  }
  // anything left within GAP / 2 of her skin, or inside it, out to GAP
  let pushed = 0;
  const contact = new Uint8Array(n); // what lies on her skin: laid onto it, or put out to it
  for (let i = 0; i < n; i++) if (moves[i]) contact[i] = 1;
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
  function place(local) {
    const p = toBind(new V3(...local)).addScaledVector(frame.up, raise);
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
    sum.set(0, 0, 0);
    let total = 0;
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy - 2; y <= cy + 2; y++) for (let z = cz - 2; z <= cz + 2; z++) {
      for (const j of grid.get(`${x},${y},${z}`) ?? []) {
        const g = Math.exp(-(placed[j].distanceToSquared(p)) / (fit.falloff * fit.falloff));
        sum.addScaledVector(moves[j], g);
        total += g;
      }
    }
    const fade = 1 - smooth((local[1] - fit.padTop) / (fit.rigid - fit.padTop));
    if (total > 0) p.addScaledVector(sum, fade / (total + fit.anchor));
    return { point: p, weights: weightsNear(result, p) };
  }

  result.report = { vertices: n, laid, pushed, raise: Number(raise.toFixed(4)), bottom: Number(bottom.toFixed(4)) };
  return result;
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

/** Puts `scene` (a copy of her, `mesh` its body) in each pose in turn and calls visit(label, matrices): each bone's world matrix by its inverse bind. */
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
      visit(`${name} ${k}`, bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, boneInverses[i])));
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
  // each vertex's neighbours by bind distance, for spreading the pushes
  const cell = hold.spread * 2.5;
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
        const g = Math.exp(-positions[j].distanceToSquared(p) / (hold.spread * hold.spread));
        if (g > 0.01 && j !== i) { js.push(j); gs.push(g); }
      }
    }
    from[i + 1] = js.length;
  }
  const near = { j: Int32Array.from(js), g: Float32Array.from(gs) };

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

/** How the fit holds in her poses: for each, the saddle's vertices inside her skin, the deepest (metres, below zero), and what lies on her skin but has lifted more than 2 cm off it. */
export function checkInPoses(fitted, skin, posing, { part = null } = {}) {
  const out = [];
  const q = new V3();
  posing((label, matrices) => {
    skin.pose();
    let inside = 0, worst = 0, lifted = 0;
    const parts = {};
    for (let i = 0; i < fitted.positions.length; i++) {
      skinnedAt(fitted.positions[i], fitted.weights[i], matrices, q);
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
    meshes: [{ name: 'Hnakkur', primitives: [primitive] }],
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
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: node --import ./remake/tests/setup.mjs remake/tools/saddle-fit.mjs <prepped.glb> <out.glb>');
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
  const fitted = fitSaddle(saddle, skin, frame);
  const posing = visit => eachPose(gltf, scene, mesh, visit);
  const rows = rows => rows.map(r => `${r.label} ${r.inside} (${(r.worst * 100).toFixed(1)} cm)`).join(', ');
  console.log(`[saddle-fit] laid on her back; inside her in her poses: ${rows(checkInPoses(fitted, skin, posing))}`);
  holdInPoses(fitted, skin, posing);
  const held = checkInPoses(fitted, skin, posing);
  console.log(`[saddle-fit] held in her poses; inside her: ${rows(held)}`);
  const bones = mesh.skeleton.bones.map(b => b.name);
  const used = [...new Set(fitted.weights.flatMap(w => [...w.keys()]))].sort((a, b) => a - b);
  const joints = used.map(i => bones[i]);
  const named = w => Object.fromEntries([...w].map(([bone, x]) => [bones[bone], Number(x.toFixed(4))]));
  const placeOf = local => { const { point, weights } = fitted.place(local); return { local, bind: point.toArray().map(x => Number(x.toFixed(5))), weights: named(weights) }; };
  const places = {
    seat: placeOf(PLACES.seat),
    grips: { left: placeOf(PLACES.grips.left), right: placeOf(PLACES.grips.right) },
    knees: { left: placeOf(PLACES.knees.left), right: placeOf(PLACES.knees.right) },
    ankles: { left: placeOf(PLACES.ankles.left), right: placeOf(PLACES.ankles.right) },
  };
  const extras = {
    frame: { seat: frame.seat.toArray(), ahead: frame.ahead.toArray(), up: frame.up.toArray(), right: frame.right.toArray() },
    fit: { ...FIT, ...fitted.report, hold: HOLD, seconds: (Date.now() - t0) / 1000 },
    poses: held.map(({ label, inside, worst, lifted }) => ({ label, inside, worst: Number(worst.toFixed(4)), lifted })),
    places,
    source: path.basename(input),
  };
  writeFitted(output, saddle, fitted, { joints, slot: new Map(used.map((bone, k) => [bone, k])), extras }); // JOINTS_0 indexes extras.joints
  console.log(`[saddle-fit] ${fitted.report.vertices} vertices, ${saddle.index.length / 3} triangles; laid ${fitted.report.laid}, pushed out ${fitted.report.pushed}; raised ${fitted.report.raise} m; joints ${joints.join(' ')}`);
  console.log(`[saddle-fit] wrote ${output} (${fs.statSync(output).size} bytes) in ${extras.fit.seconds} s`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
