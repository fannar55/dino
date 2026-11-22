// A big animal's lean after her clips (Grameðla's: chapters/gramedla3d/pose.js, kafli 6): her spine, chest and neck bend down by
// shares of one angle and her head turns on top, laid over the pose her clip gave her this frame. Nothing is drawn: only her own
// bones are turned.
//
//   const lean = createLean(actor, { shares = LEAN, snoutLocal })
//   lean.set({ theta, turn, roll, pitch })   each frame after the clips: down by theta (radians, the head kept level), the head
//                                            tipped down by pitch, turned about the upright by turn (+ to her left) and tilted
//                                            about its own length by roll
//   lean.snout(out)                          the snout tip in the world now
//   lean.pose                                what set() last laid: { theta, turn, roll, pitch }
//   lean.release()                           puts her bones back as the clip had them and stops laying the lean
//   lean.bend(theta), lean.pitchHead(a), lean.turnHead(a), lean.rollHead(a)   the steps of set(), for a pose that aims the head
//                                            itself (the show's lean at the lens); they turn from the bones as they are now
import * as THREE from 'three';
import { rotateBoneWorld } from '../actor.js';
import { bodyMesh } from '../clip-probe.js';

// spine, chest and neck bend down by these shares of one angle
export const LEAN = { Spine: 0.22, Chest: 0.3, Neck: 0.48 };
const SNOUT_MID = 0.12; // m: the snout tip is the forward-most upper-jaw vertex within this of the head's middle

/**
 * For bones a pose turns after the clips: the mixer leaves a bone alone when its value has not changed since it last set it, so a
 * turn laid on it would be laid on again the next frame. begin() puts back what the bone was before the last turn where the mixer
 * has not set it since (it is still what the turn left); end() remembers what the turn left; release() puts back what the bone was
 * before the last turn (where the mixer has not set it since) and forgets it.
 */
export function guardBones(bones) {
  const before = bones.map(b => b.quaternion.clone());
  const after = bones.map(b => b.quaternion.clone());
  let armed = false;
  return {
    begin() {
      bones.forEach((b, i) => {
        if (armed && b.quaternion.equals(after[i])) b.quaternion.copy(before[i]);
        before[i].copy(b.quaternion);
      });
    },
    end() {
      bones.forEach((b, i) => after[i].copy(b.quaternion));
      armed = true;
    },
    release() {
      if (armed) bones.forEach((b, i) => { if (b.quaternion.equals(after[i])) b.quaternion.copy(before[i]); });
      armed = false;
    },
  };
}

/**
 * The snout tip in the Head bone's frame: the forward-most vertex carried mostly by the Head (not the Jaw) within SNOUT_MID of the
 * head's middle, read from the pose she is in now.
 */
export function findSnoutLocal(actor) {
  const head = actor.model.getObjectByName('Head');
  const body = bodyMesh(actor);
  actor.root.updateMatrixWorld(true);
  body.skeleton.update();
  const list = body.skeleton.bones;
  const at = list.indexOf(head);
  const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
  const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(actor.root.quaternion).setY(0).normalize();
  const side = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.quaternion);
  const upper = [];
  for (let i = 0; i < si.count; i++) {
    let top = 0, w = -1;
    for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); top = si.getComponent(i, k); }
    if (top === at) upper.push(body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld));
  }
  if (!upper.length) throw new Error(`findSnoutLocal: no vertex of ${actor.name ?? 'the model'} is carried mostly by its Head`);
  let lo = Infinity, hi = -Infinity;
  for (const u of upper) { const d = u.dot(side); if (d < lo) lo = d; if (d > hi) hi = d; }
  const mid = (lo + hi) / 2;
  let tip = null, best = -Infinity;
  for (const u of upper) if (Math.abs(u.dot(side) - mid) < SNOUT_MID && u.dot(facing) > best) { best = u.dot(facing); tip = u; }
  return head.worldToLocal(tip.clone());
}

export function createLean(actor, { shares = LEAN, snoutLocal = null } = {}) {
  // the head is turned back up by the whole of theta, so the shares must make up one angle
  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 1e-9) throw new Error(`createLean: the shares add up to ${total}, not 1`);
  const bone = name => actor.model.getObjectByName(name);
  const bones = Object.fromEntries([...Object.keys(shares), 'Head'].map(n => [n, bone(n)]));
  const guard = guardBones(Object.values(bones));
  const tip = snoutLocal ? snoutLocal.clone() : findSnoutLocal(actor);
  const q = new THREE.Quaternion();
  const right = new THREE.Vector3(), hp = new THREE.Vector3(), fw = new THREE.Vector3(), sp = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const last = { theta: 0, turn: 0, roll: 0, pitch: 0 };
  /** Her right side now (the axis her lean and her head's tip turn about). */
  const aside = () => right.set(0, 0, 1).applyQuaternion(actor.root.quaternion);

  const snout = (out = new THREE.Vector3()) => out.copy(tip).applyMatrix4(bones.Head.matrixWorld);
  /** Spine, chest and neck down by their shares of theta about her right side; the head turned back up by theta, so it stands as it did. */
  function bend(theta) {
    actor.root.updateMatrixWorld(true);
    aside();
    for (const [name, share] of Object.entries(shares)) rotateBoneWorld(bones[name], q.setFromAxisAngle(right, -theta * share));
    rotateBoneWorld(bones.Head, q.setFromAxisAngle(right, theta));
  }
  /** The head tipped about her right side (+ lifts the snout, as the show's pitch). */
  const pitchHead = a => rotateBoneWorld(bones.Head, q.setFromAxisAngle(aside(), a));
  /** The head turned about the upright (+ to her left, seen from above). */
  const turnHead = a => rotateBoneWorld(bones.Head, q.setFromAxisAngle(UP, a));
  /** The head tilted about its own length, head to snout. */
  function rollHead(a) {
    bones.Head.getWorldPosition(hp);
    fw.copy(snout(sp)).sub(hp).normalize();
    rotateBoneWorld(bones.Head, q.setFromAxisAngle(fw, a));
  }

  function set({ theta = 0, turn = 0, roll = 0, pitch = 0 } = {}) {
    Object.assign(last, { theta, turn, roll, pitch });
    guard.begin();
    bend(theta);
    if (pitch) pitchHead(pitch);
    if (turn) turnHead(turn);
    if (roll) rollHead(roll);
    guard.end();
  }
  function release() {
    guard.release();
    actor.root.updateMatrixWorld(true);
  }

  return { set, snout, release, bend, pitchHead, turnHead, rollHead, bones, right, snoutLocal: tip, get pose() { return { ...last }; } };
}
