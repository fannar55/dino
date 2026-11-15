// Flugeðla with Egill in her saddle, for Samflug (chapters/samflug3d.js): her saddle, Egill riding her (engine/flier.js rideFlier),
// her pose each frame from the timeline (her body's middle at a place in the camera's frame, facing us turned by yaw, nose up by
// pitch, banked by bank, her neck stretched, her flight clip at a second), and Egill's wave (his left arm and head posed in code, as
// gramedla3d/cast.js poses his point; no new animation). Adapted from gramedla3d/cast.js, which places her by her beak.
import * as THREE from 'three';
import { rideFlier } from '../../engine/flier.js';
import { createFlierSaddle } from '../../engine/flier-saddle.js';
import { reachTwoBones } from '../../engine/ik.js';
import { rotateBoneWorld } from '../../engine/actor.js';
import { BODY_HEIGHT } from '../kafli4-route.js';
import { guardBones } from '../gramedla3d/pose.js';
import { createHaze } from '../gramedla3d/haze.js';

const rad = d => (d * Math.PI) / 180;
export const BODY_LOCAL = [0.06, BODY_HEIGHT, 0]; // her body's middle in her root's frame (kafli4-route.js)

export function createRider(world, { her, boy }) {
  const herRoot = { position: new THREE.Vector3(0, -50, 0), quaternion: new THREE.Quaternion() };
  her.control(() => { her.root.position.copy(herRoot.position); her.root.quaternion.copy(herRoot.quaternion); });
  const necks = ['Neck', 'Neck2', 'Neck3'].map(n => her.model.getObjectByName(n)).filter(Boolean);
  const neckGuard = guardBones(necks);
  const flier = { actor: her, root: herRoot, route: { waterAt: () => null }, heading: 90, bank: 0, t: 30, pose: { position: herRoot.position.clone(), quaternion: herRoot.quaternion } };
  const saddle = createFlierSaddle(her);
  saddle.show();
  let riding = null;
  const ready = saddle.loaded.then(() => { riding = rideFlier(boy, flier, { saddle }); });

  // her neck: `neck` degrees about her own right, shared by its three bones (negative lifts and straightens it toward us)
  let neckTurn = 0;
  const herRight = new THREE.Vector3(), nq = new THREE.Quaternion();
  her.setOverlay(() => {
    neckGuard.begin();
    if (neckTurn) {
      her.root.updateMatrixWorld(true);
      herRight.set(0, 0, 1).applyQuaternion(her.root.quaternion);
      for (const b of necks) rotateBoneWorld(b, nq.setFromAxisAngle(herRight, -rad(neckTurn) / necks.length));
    }
    neckGuard.end();
  });

  // Egill's wave: his left arm up beside his head toward us, the hand swinging; he leans out a little and looks at us
  const wave = { weight: 0, swing: 0, lean: 0 };
  (() => {
    const find = n => { let b = null; boy.model.traverse(o => { if (!b && o.isBone && o.name.endsWith(n)) b = o; }); return b; };
    const upper = find('LeftUpperArm'), lower = find('LeftLowerArm'), hand = find('LeftHand'), head = find('Head'), spine = find('Spine');
    const guard = guardBones([spine, upper, lower, hand, head].filter(Boolean));
    const shoulder = new THREE.Vector3(), target = new THREE.Vector3(), rest = new THREE.Vector3(), aim = new THREE.Vector3();
    const q = new THREE.Quaternion(), fwd = new THREE.Vector3();
    boy.setOverlay(() => {
      guard.begin();
      const w = wave.weight;
      if (w > 0 && upper) {
        boy.root.updateMatrixWorld(true);
        // toward us is the camera's way: her facing (her +X)
        fwd.set(1, 0, 0).applyQuaternion(herRoot.quaternion).setY(0).normalize();
        if (spine && wave.lean) { rotateBoneWorld(spine, q.setFromAxisAngle(fwd, -rad(wave.lean) * w)); boy.root.updateMatrixWorld(true); }
        upper.getWorldPosition(shoulder);
        hand.getWorldPosition(rest);
        // up, out to his left, a little toward us; the swing moves the hand side to side
        const side = new THREE.Vector3(0, 1, 0).cross(fwd).normalize(); // his left (her left) when she faces us
        aim.set(0, 1, 0).multiplyScalar(0.9).addScaledVector(side, 0.35 + 0.3 * wave.swing).addScaledVector(fwd, 0.25);
        target.copy(shoulder).add(aim.normalize().multiplyScalar(0.62));
        reachTwoBones(upper, lower, hand, target.lerpVectors(rest, target, w));
        if (head) rotateBoneWorld(head, q.setFromAxisAngle(side, rad(6) * w));
      }
      guard.end();
    });
  })();

  let action = null, haze = null;
  const e = new THREE.Euler(), qPitch = new THREE.Quaternion(), qBank = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0), body = new THREE.Vector3();
  /**
   * Her pose this frame: { body: a world point (her body's middle), yaw, pitch, bank (degrees), neck (degrees), clip, at (its
   * second), haze, seen, egill: { weight, swing, lean } }, or null (hidden).
   */
  function pose(spec) {
    if (!spec || !riding) {
      herRoot.position.set(0, -50, 0);
      her.root.visible = boy.root.visible = false;
      wave.weight = 0;
      neckTurn = 0;
      return;
    }
    her.root.visible = boy.root.visible = true;
    haze ??= createHaze(her.model, boy.model);
    haze.set(spec.haze ?? 0, spec.seen ?? 1);
    const clip = her.clips.get(spec.clip) ?? her.clips.get('fly');
    if (!action || action.getClip() !== clip) action = her.play(clip.name, { fade: 0, timeScale: 0 });
    action.time = spec.at % clip.duration;
    herRoot.quaternion.setFromEuler(e.set(0, -rad(90 + (spec.yaw ?? 0)), 0))
      .multiply(qPitch.setFromAxisAngle(Z, rad(spec.pitch ?? 0)))
      .multiply(qBank.setFromAxisAngle(X, rad(spec.bank ?? 0)));
    body.set(...BODY_LOCAL).applyQuaternion(herRoot.quaternion);
    herRoot.position.copy(spec.body).sub(body);
    her.root.position.copy(herRoot.position);
    her.root.quaternion.copy(herRoot.quaternion);
    neckTurn = spec.neck ?? 0;
    wave.weight = spec.egill?.weight ?? 0;
    wave.swing = spec.egill?.swing ?? 0;
    wave.lean = spec.egill?.lean ?? 0;
  }

  // her body mesh (the largest skinned mesh but the saddle) and his, for the measurements
  const largest = (model, not) => {
    let best = null;
    model.traverse(o => { if (o.isSkinnedMesh && o !== not && (!best || o.geometry.attributes.position.count > best.geometry.attributes.position.count)) best = o; });
    return best;
  };
  return { pose, ready, get riding() { return riding; }, herBody: () => largest(her.model, saddle.mesh), boyBody: () => largest(boy.model, null), herRoot, her, boy };
}
