import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { twoBoneLeg, reachTwoBones } from '../engine/ik.js';

const mm = metres => `${(metres * 1000).toFixed(2)} mm`;

// An arm hanging from a turned chest: shoulder, elbow (bent) and wrist, every bone with its own turn.
function arm() {
  const chest = new THREE.Bone();
  chest.position.set(1, 2, 3);
  chest.rotation.set(0.3, -0.5, 0.2);
  const upper = new THREE.Bone();
  upper.position.set(0, 0.1, 0.12);
  upper.rotation.set(0.1, 0.2, -0.3);
  const lower = new THREE.Bone();
  lower.position.set(0.02, -0.14, 0.03);
  lower.rotation.z = 0.6;
  const hand = new THREE.Bone();
  hand.position.set(0.03, -0.12, 0.01);
  chest.add(upper);
  upper.add(lower);
  lower.add(hand);
  chest.updateMatrixWorld(true);
  const at = bone => bone.getWorldPosition(new THREE.Vector3());
  return { chest, upper, lower, hand, at };
}

// How far the middle joint stands out from the line from the top of the chain to a point, and which way.
function bendOf({ upper, lower, at }, point) {
  const line = point.clone().sub(at(upper)).normalize();
  const out = at(lower).sub(at(upper));
  return out.addScaledVector(line, -out.dot(line));
}

test('reachTwoBones lands the end of the chain on a point it can reach, the elbow bent the way it was', () => {
  const chain = arm();
  const { upper, lower, hand, at } = chain;
  const lengths = [at(upper).distanceTo(at(lower)), at(lower).distanceTo(at(hand))];
  const target = at(upper).add(new THREE.Vector3(0.12, -0.1, 0.1));
  const before = bendOf(chain, target);
  reachTwoBones(upper, lower, hand, target);
  assert.ok(at(hand).distanceTo(target) < 1e-6, `the hand is ${mm(at(hand).distanceTo(target))} from the target`);
  assert.ok(Math.abs(at(upper).distanceTo(at(lower)) - lengths[0]) < 1e-9, 'the bones keep their lengths');
  assert.ok(Math.abs(at(lower).distanceTo(at(hand)) - lengths[1]) < 1e-9);
  assert.ok(bendOf(chain, target).dot(before) > 0, 'the elbow still bends out the same way');
});

test('reachTwoBones leaves a chain that already reaches the point as it is', () => {
  const { upper, lower, hand, at } = arm();
  const turns = [upper.quaternion.clone(), lower.quaternion.clone()];
  reachTwoBones(upper, lower, hand, at(hand));
  assert.ok(upper.quaternion.angleTo(turns[0]) < 1e-6 && lower.quaternion.angleTo(turns[1]) < 1e-6);
});

test('reachTwoBones stretches toward a point out of reach without going past the bones\' length', () => {
  const { upper, lower, hand, at } = arm();
  const reach = at(upper).distanceTo(at(lower)) + at(lower).distanceTo(at(hand));
  const target = at(upper).add(new THREE.Vector3(1, -1, 0.5));
  reachTwoBones(upper, lower, hand, target);
  const toHand = at(hand).sub(at(upper));
  assert.ok(Math.abs(toHand.length() - 0.999 * reach) < 1e-6, `the arm reaches ${toHand.length().toFixed(4)} of ${reach.toFixed(4)} m`);
  assert.ok(toHand.normalize().angleTo(target.clone().sub(at(upper)).normalize()) < 1e-6, 'straight toward the point');
});

test('twoBoneLeg still bends the knee back and puts the ankle where it is asked', () => {
  // Egill's left thigh and shin (bake-biped.js): the knee in the thigh's frame, the ankle in the shin's.
  const knee = new THREE.Vector3(-0.001, -0.157, -0.009);
  const ankle = new THREE.Vector3(-0.017, -0.141, -0.011);
  const leg = twoBoneLeg(knee, ankle);
  const thighTurn = new THREE.Quaternion();
  const shinTurn = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  for (const toAnkle of [new THREE.Vector3(0.05, -0.27, -0.02), new THREE.Vector3(-0.08, -0.22, 0.01), new THREE.Vector3(0.12, -0.18, 0)]) {
    leg.reach(toAnkle, Z, thighTurn, shinTurn);
    const reached = ankle.clone().applyQuaternion(shinTurn).add(knee).applyQuaternion(thighTurn);
    assert.ok(reached.distanceTo(toAnkle) < 1e-6, `the ankle is ${mm(reached.distanceTo(toAnkle))} from where it was asked`);
    const kneeAngle = 2 * Math.atan2(new THREE.Vector3(shinTurn.x, shinTurn.y, shinTurn.z).dot(Z), shinTurn.w);
    assert.ok(kneeAngle < 0, `the knee bends the foot back (${kneeAngle.toFixed(3)} rad about the thigh's Z)`);
  }
});
