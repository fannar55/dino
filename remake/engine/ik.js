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
