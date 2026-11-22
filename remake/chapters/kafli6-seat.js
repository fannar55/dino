// Egill's seat on Grameðla's head (chapter 6, scene 7) and how she lays her head down for him. He sits astride behind her brow, on
// the crest of her skull, his soles flat on its broad top and his hands on her, as he sits on Þórseðla's head in chapter 3
// (kafli3-thorsedla.js SEAT): places on her skin in her Head bone's frame (riding.js createSeat `skin`), measured on her posed mesh
// by .tools/gramedla-haus/places.mjs (a ray straight down onto her skin as she stands, plus a gap) and looked at on the look-check
// page (gramedla-haus.js). Her lean (engine/pose/lean.js) keeps her head level as she bows, so the seat stays level from the ground
// to the top of her rise and through her stride.
//
//   const hips = createHips(actor)               her hips pitched forward about her thighs' heads, the thighs turned back as much
//   hips.set(angle)                              each frame after her clips, before her lean (radians; her feet stay where they are)
//   const down = headDownPose(actor, lean, hips, { ground })   her lean (and hips, if it does not reach) with her head down on the
//                                                ground: { theta, pitch, hips, low, snout, seat }
//   lowestOfHead(actor)                          { low, snout }: the lowest of her head now, and of its front (the jaw's underside)
//
// Units are metres; angles radians unless they say degrees.
import * as THREE from 'three';
import { rotateBoneWorld } from '../engine/actor.js';
import { bodyMesh } from '../engine/clip-probe.js';
import { guardBones } from '../engine/pose/lean.js';

// The seat on her head (createSeat): his seat 1 cm over her skin, his knees 12 cm and his soles flat 12.5 cm over it (his ankles),
// his wrists 15 cm over it 16 cm ahead of his seat; her skull's top is a little lower on her left than on her right.
export const HEAD_SEAT = {
  bone: 'Head', lean: 12, flatFeet: true,
  skin: {
    seat: [0.62, 1.4621, 0],
    grips: { left: [0.78, 1.5339, -0.17], right: [0.78, 1.6071, 0.17] },
    knees: { left: [0.76, 1.4974, -0.2], right: [0.76, 1.5631, 0.2] },
    ankles: { left: [0.82, 1.464, -0.26], right: [0.82, 1.5248, 0.26] },
  },
};

/**
 * Her head down on the ground for him: the lowest of her head `ground` m over the ground, her head tipped down `pitch` (so her jaw's
 * underside and her throat lie on the ground together); her lean at most `most`, then her hips forward at most `hips` degrees; the
 * bow takes `seconds`, the rise `rise`.
 */
export const HEAD_DOWN = { ground: 0.2, pitch: -0.32, most: 1.5, hips: 25, seconds: 4.2, rise: 3.4 };

const HEAD_BONES = ['Head', 'Jaw'];
const FRONT = 1.6; // m ahead of her Head bone (in its frame): the front of her head, her jaws, ahead of her eyes

const found = new WeakMap();
/** Her head's vertices (those the Head or Jaw carries most), and the lowest of them in the world now. */
function headVertices(actor) {
  if (found.has(actor)) return found.get(actor);
  const body = bodyMesh(actor);
  const bones = body.skeleton.bones;
  const ids = new Set(HEAD_BONES.map(n => bones.indexOf(actor.model.getObjectByName(n))).filter(i => i >= 0));
  const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
  const head = actor.model.getObjectByName('Head');
  actor.root.updateMatrixWorld(true);
  body.skeleton.update();
  const all = [], front = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < si.count; i++) {
    let top = 0, w = -1;
    for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); top = si.getComponent(i, k); }
    if (!ids.has(top)) continue;
    all.push(i);
    body.getVertexPosition(i, v).applyMatrix4(body.matrixWorld);
    if (head.worldToLocal(v).x > FRONT) front.push(i);
  }
  found.set(actor, { body, all, front });
  return found.get(actor);
}

/** { low, snout }: the lowest point of her head in the world now (y), and of its front (her jaw's underside). */
export function lowestOfHead(actor) {
  const { body, all, front } = headVertices(actor);
  actor.root.updateMatrixWorld(true);
  body.skeleton.update();
  const v = new THREE.Vector3();
  const lowest = list => {
    let low = Infinity;
    for (const i of list) low = Math.min(low, body.getVertexPosition(i, v).applyMatrix4(body.matrixWorld).y);
    return low;
  };
  return { low: lowest(all), snout: lowest(front) };
}

/**
 * Her hips pitched forward by `angle` about the line through her thighs' heads, the thighs turned back by as much: her legs stand as
 * they stood, so her feet do not move. Her Head is not turned back here: her lean's pitch does that (headDownPose adds it).
 */
export function createHips(actor) {
  const hips = actor.model.getObjectByName('Hips');
  const thighs = ['LeftThigh', 'RightThigh'].map(n => actor.model.getObjectByName(n));
  const guard = guardBones([hips, ...thighs]);
  const place = { before: hips.position.clone(), after: hips.position.clone(), armed: false };
  const q = new THREE.Quaternion();
  const right = new THREE.Vector3(), pivot = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  let angle = 0;
  function set(next = 0) {
    angle = next;
    guard.begin();
    if (place.armed && hips.position.equals(place.after)) hips.position.copy(place.before);
    place.before.copy(hips.position);
    if (angle) {
      actor.root.updateMatrixWorld(true);
      right.set(0, 0, 1).applyQuaternion(actor.root.quaternion);
      pivot.copy(thighs[0].getWorldPosition(a)).add(thighs[1].getWorldPosition(b)).multiplyScalar(0.5);
      q.setFromAxisAngle(right, -angle);
      // turn the hips about the pivot: their place swings round it, then they turn
      hips.getWorldPosition(p).sub(pivot).applyQuaternion(q).add(pivot);
      hips.parent.worldToLocal(p);
      hips.position.copy(p);
      hips.updateMatrixWorld(true);
      rotateBoneWorld(hips, q);
      q.setFromAxisAngle(right, angle);
      for (const thigh of thighs) rotateBoneWorld(thigh, q);
    }
    guard.end();
    place.after.copy(hips.position);
    place.armed = true;
  }
  function release() {
    guard.release();
    if (place.armed && hips.position.equals(place.after)) hips.position.copy(place.before);
    place.armed = false;
    actor.root.updateMatrixWorld(true);
  }
  return { set, release, get angle() { return angle; } };
}

/**
 * Her head down on the ground (HEAD_DOWN), from the pose her clip gives her now: her head tipped `pitch`, her lean found by bisection
 * so the lowest of her head is `ground` m over the ground under her; if her lean at `most` does not reach, her hips forward by
 * bisection too, up to `hips` degrees. Leaves her lean and hips as they were. Returns { theta, pitch, hips, low, snout, seat }: the
 * lean, the head's tip (with the hips' turned back), the hips (radians), her head's lowest and her jaw's underside over the ground
 * there, and how high the seat's skin point (HEAD_SEAT) stands over it.
 */
export function headDownPose(actor, lean, hips, { ground = HEAD_DOWN.ground, pitch = HEAD_DOWN.pitch, most = HEAD_DOWN.most, hipsMost = THREE.MathUtils.degToRad(HEAD_DOWN.hips) } = {}) {
  const { x, z } = actor.root.position;
  const floor = actor.world?.heightAt?.(x, z) ?? actor.root.position.y;
  const head = actor.model.getObjectByName('Head');
  const before = { hips: hips.angle };
  const lay = (theta, h) => {
    hips.set(h);
    lean.set({ theta, pitch: pitch + h });
    actor.root.updateMatrixWorld(true);
    return lowestOfHead(actor).low - floor;
  };
  const bisect = (f, lo, hi) => {
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > ground) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  let theta = most, h = 0;
  if (lay(0, 0) <= ground) theta = 0;
  else if (lay(most, 0) <= ground) theta = bisect(t => lay(t, 0), 0, most);
  else h = lay(most, hipsMost) <= ground ? bisect(a => lay(most, a), 0, hipsMost) : hipsMost;
  lay(theta, h);
  const { low, snout } = lowestOfHead(actor);
  const seat = new THREE.Vector3(...HEAD_SEAT.skin.seat).applyMatrix4(head.matrixWorld).y - floor;
  hips.set(before.hips);
  lean.set({});
  actor.root.updateMatrixWorld(true);
  return { theta, pitch: pitch + h, hips: h, low: low - floor, snout: snout - floor, seat };
}
