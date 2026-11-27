// Egill's hands, shared by chapter 5's music show (kafli5-people.js) and Stjörnuhátíðin's dance (hatid-dance.js): where his hands go
// in his own frame, how his shoulders shrug as they go up, the way his elbows point, the two-bone reach that bends an arm to a hand
// goal (no bone is ever made longer), and the laying of { up, pump, open, clap, cup } weights on his two arms. The owner approved
// these moves in chapter 5's show (live since 2026-11-20) and asked for them in the festival (2026-11-27). Also the facts of his
// hop clip in egill.glb. Nothing here knows either chapter.
import * as THREE from 'three';

const V3 = THREE.Vector3;
const Q = THREE.Quaternion;
const clamp = THREE.MathUtils.clamp;

/** Where Egill's hands go, in his own frame ([ahead, up, to that hand's side], m): his arms are 0.27 m long. */
export const HANDS = {
  up: [0.02, 1.2, 0.3], // up and apart, a V over his head
  pump: [0.17, 0.82, 0.13], // a fist in front of his shoulder
  open: [0.16, 0.7, 0.21], // apart in front of him, between two claps
  clap: [0.2, 0.68, 0.012], // together
};
/** His hands cupped at his mouth: from his head bone, in his own frame ([ahead, up, to that hand's side], m). */
export const CUP = [0.115, 0.015, 0.075];
export const SHRUG = 0.035; // m his shoulders come up as his hands go up (his arms are short: his hands just clear his head)
export const ELBOW = [-0.25, -0.55, 0.8]; // the way his elbows point as his arms bend (his own frame: back, down and out)
export const HAND_NAMES = ['up', 'pump', 'open', 'clap'];
/** His hop clip (egill.glb, 1.15 s): he leaves the ground `off` s into it and is down `down` s into it. */
export const HOP_CLIP = { seconds: 1.15, off: 0.42, down: 0.94, rate: 0.85 };

const parentQ = new Q();
const localQ = new Q();
/** Turn `bone` by `q`, a turn in the world's frame, about its own joint without recursing untouched subtrees. */
export function turnBone(bone, q) {
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(parentQ);
  localQ.copy(parentQ).invert().multiply(q).multiply(parentQ);
  bone.quaternion.premultiply(localQ);
  bone.updateWorldMatrix(false, false);
}

const S = new V3();
const E = new V3();
const H = new V3();
const along = new V3();
const lower = new V3();
const bend = new V3();
const armQ = new Q();
/** Bends an arm (`upper`, `lower`, `hand` bones) so its hand is at `goal` (world), the elbow pointing the way `pole` (world) does. */
export function reach(arm, goal, pole) {
  arm.upper.getWorldPosition(S);
  arm.lower.getWorldPosition(E);
  arm.hand.getWorldPosition(H);
  const [l1, l2] = [S.distanceTo(E), E.distanceTo(H)];
  const far = clamp(S.distanceTo(goal), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  // the forearm straight on from the upper arm, then bent at the elbow as far as the reach asks, away from the pole
  along.copy(E).sub(S).normalize();
  lower.copy(H).sub(E).normalize();
  turnBone(arm.lower, armQ.setFromUnitVectors(lower, along));
  const inside = Math.acos(clamp((l1 * l1 + l2 * l2 - far * far) / (2 * l1 * l2), -1, 1));
  bend.copy(pole).cross(along);
  if (bend.lengthSq() > 1e-8) turnBone(arm.lower, armQ.setFromAxisAngle(bend.normalize(), Math.PI - inside));
  // and the whole arm turned so the hand is on the line to the goal
  arm.hand.getWorldPosition(H);
  H.sub(S).normalize();
  along.copy(goal).sub(S).normalize();
  turnBone(arm.upper, armQ.setFromUnitVectors(H, along));
}

/** His two arms on his model, right then left: { key, sign (+1 right, -1 left: the side's way in his frame), upper, lower, hand }. */
export function egillArms(model) {
  const bone = name => model.getObjectByName(name);
  return [['Right', 1], ['Left', -1]].map(([side, sign]) => ({ key: side.toLowerCase(), sign, upper: bone(`${side}UpperArm`), lower: bone(`${side}LowerArm`), hand: bone(`${side}Hand`) }))
    .filter(arm => arm.upper && arm.lower && arm.hand);
}

const goal = new V3();
const to = new V3();
const pole = new V3();
const at = new V3();
/**
 * Lays his hand poses on his arms. `frame` is his own frame in the world: `matrix` (its matrixWorld: his feet's middle at its origin,
 * facing +X) and `quaternion` (its turn in the world); `head` his head bone (for the cup). `weights` is { right: { up, pump, open,
 * clap, cup }, left: {...} }: how far each hand is on its way to that pose (0..1), the hand where the clip has it for the rest. His
 * shoulders shrug as his hands go up; each hand's goal is the weights' blend (shared out when they add to more than 1), reached with
 * the two-bone reach and the elbow pole. Each bone keeps its length.
 */
export function layHands({ matrix, quaternion, head }, arms, weights) {
  for (const arm of arms) {
    const poses = weights[arm.key];
    if (!poses) continue;
    let sum = 0;
    if (poses.up > 0) {
      arm.upper.getWorldPosition(to).y += SHRUG * poses.up;
      arm.upper.position.copy(arm.upper.parent.worldToLocal(to));
      arm.upper.updateWorldMatrix(false, false);
    }
    arm.hand.getWorldPosition(at);
    goal.set(0, 0, 0);
    for (let i = 0; i < HAND_NAMES.length; i++) {
      const name = HAND_NAMES[i];
      const weight = poses[name];
      if (!(weight > 0)) continue;
      const h = HANDS[name];
      to.set(h[0], h[1], h[2] * arm.sign).applyMatrix4(matrix);
      goal.addScaledVector(to.sub(at), weight);
      sum += weight;
    }
    if (poses.cup > 0 && head) {
      head.getWorldPosition(to).add(pole.set(CUP[0], CUP[1], CUP[2] * arm.sign).applyQuaternion(quaternion));
      goal.addScaledVector(to.sub(at), poses.cup);
      sum += poses.cup;
    }
    if (sum < 0.002) continue;
    goal.multiplyScalar(1 / Math.max(1, sum)).add(arm.hand.getWorldPosition(at));
    reach(arm, goal, pole.set(ELBOW[0], ELBOW[1], ELBOW[2] * arm.sign).applyQuaternion(quaternion));
  }
}
