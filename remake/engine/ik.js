import * as THREE from 'three';

// Two-bone legs as the biped bake tool rigs them (remake/tools/bake/bake-biped.js): thigh, shin and
// foot with identity rest rotations, the knee a hinge about the thigh's own Z axis. The walk the
// bake tool authors (biped-clips.js) and the footing that plants the feet in a scene (footing.js)
// both reach the feet with it, so a foot put where the clip has it gets the clip's own pose back.

const Z = new THREE.Vector3(0, 0, 1);
const clamp = THREE.MathUtils.clamp;
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const e3 = new THREE.Vector3();
const m1 = new THREE.Matrix4();
const m2 = new THREE.Matrix4();

function basis(a, b, out) {
  e1.copy(a).normalize();
  e2.copy(b).addScaledVector(e1, -b.dot(e1)).normalize();
  return out.makeBasis(e1, e2, e3.crossVectors(e1, e2));
}

/** The rotation that takes direction a to a2 and turns the plane of (a, b) onto the plane of (a2, b2). */
export function alignFrames(a, b, a2, b2, out = new THREE.Quaternion()) {
  basis(a, b, m2).transpose();
  return out.setFromRotationMatrix(basis(a2, b2, m1).multiply(m2));
}

/** A leg from the knee's place in the thigh's frame and the ankle's place in the shin's frame. */
export function twoBoneLeg(knee, ankle) {
  // |knee + Rz(k) ankle|^2 = base + 2 c cos(k - straight) is the hip-to-ankle distance squared at
  // knee angle k (radians about the thigh's Z axis; a negative angle bends the foot back).
  const base = knee.lengthSq() + ankle.lengthSq() + 2 * knee.z * ankle.z;
  const a = knee.x * ankle.x + knee.y * ankle.y;
  const b = knee.y * ankle.x - knee.x * ankle.y;
  const c = Math.hypot(a, b);
  const straight = Math.atan2(b, a);
  const length = Math.sqrt(base + 2 * c); // hip to ankle, straight
  return {
    length,
    /**
     * Bend the leg so the ankle is `toAnkle` from the hip (a vector in the frame the thigh turn is
     * wanted in), the knee bending in the plane across `hinge`: writes the thigh's turn in that frame
     * and the shin's turn in the thigh's frame. A target out of reach leaves the leg straight.
     */
    reach(toAnkle, hinge, thighTurn, shinTurn) {
      const d = clamp(toAnkle.length(), 0.2 * length, 0.9999 * length);
      shinTurn.setFromAxisAngle(Z, straight - Math.acos(clamp((d * d - base) / (2 * c), -1, 1)));
      const leg = v1.copy(ankle).applyQuaternion(shinTurn).add(knee); // hip to ankle, thigh's frame
      return alignFrames(leg, Z, v2.copy(toAnkle), hinge, thighTurn);
    },
  };
}

// Two bones turned in world space ----------------------------------------------------------------
// For a limb that does not bend the way twoBoneLeg's knee does (an elbow bends the other way) or
// whose bones have rest turns of their own: each bone turns by the smallest rotation about its own
// pivot, and the middle joint bends out on the side it is bent to already (riding.js lays a rider's
// hands on a saddle's grip with it, after his clips have posed his arms).
const p0 = new THREE.Vector3();
const p1 = new THREE.Vector3();
const p2 = new THREE.Vector3();
const toward = new THREE.Vector3();
const bend = new THREE.Vector3();
const placed = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const turn = new THREE.Quaternion();
const parentTurn = new THREE.Quaternion();
const localTurn = new THREE.Quaternion();

/** Turn a bone by a world-space rotation about its own pivot; its world matrix and its children's follow. */
function turnWorld(bone, q) {
  bone.parent.getWorldQuaternion(parentTurn);
  localTurn.copy(parentTurn).invert().multiply(q).multiply(parentTurn);
  bone.quaternion.premultiply(localTurn);
  bone.updateMatrixWorld(true);
}

/**
 * Reach `target` (a world point) with the end of a two-bone chain: `upper` and then `lower` turn so
 * that `end` (a child of `lower`) lands on it, the middle joint bending out the way it bends now. A
 * target out of reach, or too near, leaves `end` as close as the bones allow, on the line toward it.
 * The chain's world matrices must be current; they stay so.
 */
export function reachTwoBones(upper, lower, end, target) {
  upper.getWorldPosition(p0);
  lower.getWorldPosition(p1);
  end.getWorldPosition(p2);
  const a = p0.distanceTo(p1);
  const b = p1.distanceTo(p2);
  toward.subVectors(target, p0);
  if (toward.lengthSq() < 1e-12 || a < 1e-9 || b < 1e-9) return;
  const d = clamp(toward.length(), Math.abs(a - b) + 1e-4, 0.999 * (a + b));
  toward.normalize();
  // The way the middle joint points out from the line to the target; for a straight chain, any way.
  bend.subVectors(p1, p0);
  bend.addScaledVector(toward, -bend.dot(toward));
  if (bend.lengthSq() < 1e-12) bend.set(1, 0, 0).cross(toward);
  if (bend.lengthSq() < 1e-12) bend.set(0, 0, 1).cross(toward);
  bend.normalize();
  const cos = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  placed.copy(p0).addScaledVector(toward, a * cos).addScaledVector(bend, a * Math.sqrt(1 - cos * cos));
  turnWorld(upper, turn.setFromUnitVectors(from.subVectors(p1, p0).normalize(), to.subVectors(placed, p0).normalize()));
  end.getWorldPosition(p2);
  turnWorld(lower, turn.setFromUnitVectors(from.subVectors(p2, placed).normalize(), to.copy(p0).addScaledVector(toward, d).sub(placed).normalize()));
}
