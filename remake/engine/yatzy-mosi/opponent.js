import * as THREE from 'three';
import { createActor } from '../actor.js';

const MODEL = new URL('../../assets/characters/mosi.glb', import.meta.url).href;
const SCALE = .52;
const SEAT_ANGLE = THREE.MathUtils.degToRad(29);
// The Tripo face is authored about 25° to one side of the skeleton's +X
// forward. The scene actor tracks that skeletal axis; this gentle corrective
// turn brings the actual eyes/beak back toward the child at the table.
const FACE_YAW = THREE.MathUtils.degToRad(-24);
const clamp = THREE.MathUtils.clamp;
const rad = THREE.MathUtils.degToRad;
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const envelope = (age, duration) => age >= 0 && age < duration ? Math.sin(Math.PI * age / duration) ** 2 : 0;
const pulse = (age, start, duration) => envelope(age - start, duration);
const REACTION_LENGTH = Object.freeze({ anticipate: 1.3, good: 2.1, great: 2.8, bad: 2.5, near: 2.1, win: 3.6 });
const GESTURE_KEYS = ['nod', 'tilt', 'yaw', 'jaw', 'bodyPitch', 'bodyRoll', 'bodyLift', 'pawL', 'pawR', 'lid', 'tail'];
const boneNamed = (model, name) => model.getObjectByName(name) ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

/**
 * The remake's actual Mosi, sharing the table scene and game clock. `gltf` is an
 * optional already loaded asset, useful to preload or test without DOM textures.
 * The cup moves independently. `rolling` makes Mosi watch the supplied world
 * target while his forelegs stay planted; only a celebration after the throw
 * deliberately lifts a paw, always along its real fixed-length limb arc.
 */
export async function createMosiOpponent(world, { tableY = 1.4, farZ = -1.9, gltf } = {}) {
  if (!world?.scene || !world?.camera || typeof world.resolvePoint !== 'function' || typeof world.heightAt !== 'function') {
    throw new TypeError('Mosi needs the shared table scene, camera and point/height resolvers');
  }
  if (!Number.isFinite(tableY) || !Number.isFinite(farZ)) throw new TypeError('Table dimensions must be finite');
  const actor = await createActor(world, { name: 'mosi-yatzy', url: MODEL, gltf, heading: 90 });
  const group = actor.root;
  group.name = 'Mosi · seated Yatzy opponent';
  group.scale.setScalar(SCALE);
  group.position.set(0, tableY - .97, farZ - 1.5);
  group.rotation.set(0, -Math.PI / 2, 0);
  const seatPosition = group.position.clone(), seatQuaternion = group.quaternion.clone();
  const bones = [];
  actor.model.traverse(node => { if (node.isBone) bones.push(node); });
  const body = boneNamed(actor.model, 'Body'), head = boneNamed(actor.model, 'Head'), neck = boneNamed(actor.model, 'Neck'), jaw = boneNamed(actor.model, 'Jaw');
  const front = ['L', 'R'].map(side => ({ side, leg: boneNamed(actor.model, `FrontLeg.${side}`), foot: boneNamed(actor.model, `FrontFoot.${side}`) }));
  const back = ['L', 'R'].map(side => ({ side, leg: boneNamed(actor.model, `BackLeg.${side}`), foot: boneNamed(actor.model, `BackFoot.${side}`) }));
  if (!body || !head || !neck || !jaw || [...front, ...back].some(limb => !limb.leg || !limb.foot)) {
    actor.dispose();
    throw new Error('The remake Mosi skeleton is missing a required seated-pose joint');
  }
  const tail = bones.filter(bone => /^Tail\d+$/.test(bone.name));
  const rest = new Map(bones.map(bone => [bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }]));
  // The actor also layers head look/talk. Restore our pre-seat mixer result
  // before its next sample, including when an unchanged mixer track is skipped.
  const animated = bones.map(bone => ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }));
  const q = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), localQ = new THREE.Quaternion();
  const seatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), SEAT_ANGLE);
  const seatOffset = new THREE.Vector3(.06, -.14, 0), down = new THREE.Vector3(0, -1, 0), modelRight = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3(-1, 0, 0), forward = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0);
  const scratch = new THREE.Vector3(), localTarget = new THREE.Vector3(), direction = new THREE.Vector3();
  const lookPoint = new THREE.Vector3(), dicePoint = new THREE.Vector3(0, tableY + .20, -.15);
  const lookOptions = { weight: .62, maxAngle: 28, maxPitch: 24 };
  const handPoint = new THREE.Vector3();
  const pawShoulder = new THREE.Vector3(), pawScale = new THREE.Vector3();
  const bodyRest = rest.get(body);
  const idle = actor.play('idle', { fade: 0, timeScale: .86 });
  let clock = 0, thinking = 0, rolling = 0, disposed = false, reduced = false, lastThinking = false, lastRolling = false;
  let reactionKind = null, reactionAge = 10, reactionDuration = 1.4, reactionWeight = 0;
  let nod = 0, tilt = 0, jawOpen = 0;
  const gesture = Object.fromEntries(GESTURE_KEYS.map(key => [key, 0]));
  const previousGesture = { ...gesture }, immediateEyes = { duration: 0 };
  let reactionBlink = false, lidLevel = 0;
  let watchingRoll = false, watchTilt = 0, watchNod = 0;
  const skeletons = new Set();
  let triangles = 0;
  actor.model.traverse(node => {
    if (node.isSkinnedMesh) skeletons.add(node.skeleton);
    if (node.isMesh && !node.name.includes('eyelids')) triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
  });

  group.updateMatrixWorld(true);
  for (const limb of [...front, ...back]) {
    limb.pivot = rest.get(limb.leg).position.clone().sub(bodyRest.position).applyQuaternion(seatQ).add(bodyRest.position).add(seatOffset);
    limb.length = rest.get(limb.foot).position.length();
    limb.anchor = new THREE.Vector3();
  }
  for (const limb of front) {
    limb.leg.parent.localToWorld(scratch.copy(limb.pivot));
    const scale = limb.leg.parent.getWorldScale(new THREE.Vector3()).y;
    // In the baked model the ankle is .0849 above its sole (before root scale).
    const ankleY = tableY + .08492460942115948 * scale + .008;
    const dy = clamp((ankleY - scratch.y) / (limb.length * scale), -.98, .98);
    direction.set(Math.sqrt(1 - dy * dy), dy, 0);
    limb.anchor.copy(limb.pivot).addScaledVector(direction, limb.length);
    limb.leg.parent.localToWorld(limb.anchor);
  }
  const hand = front.find(limb => limb.side === 'R');

  function rotateWorld(bone, axis, angle) {
    bone.parent.getWorldQuaternion(parentQ);
    localQ.copy(parentQ).invert().multiply(q.setFromAxisAngle(axis, angle)).multiply(parentQ);
    bone.quaternion.premultiply(localQ);
    bone.updateMatrixWorld(true);
  }
  function restoreAnimated() {
    for (const item of animated) {
      item.bone.position.copy(item.position); item.bone.quaternion.copy(item.quaternion); item.bone.scale.copy(item.scale);
    }
  }
  function saveAnimated() {
    for (const item of animated) {
      item.position.copy(item.bone.position); item.quaternion.copy(item.bone.quaternion); item.scale.copy(item.bone.scale);
    }
  }
  function drive() {
    restoreAnimated();
    group.position.copy(seatPosition); group.quaternion.copy(seatQuaternion); group.scale.setScalar(SCALE);
  }
  function placeForeleg(limb, point) {
    limb.leg.position.copy(limb.pivot);
    limb.leg.parent.worldToLocal(localTarget.copy(point));
    direction.copy(localTarget).sub(limb.pivot);
    // Keep a usable planted ray even for a coincident target. A pose never
    // changes the real limb length or invents an elbow in this baked model.
    if (direction.lengthSq() < 1e-12) {
      limb.leg.parent.worldToLocal(localTarget.copy(limb.anchor));
      direction.copy(localTarget).sub(limb.pivot);
    }
    direction.normalize();
    limb.leg.quaternion.setFromUnitVectors(down, direction);
    limb.foot.quaternion.copy(limb.leg.quaternion).invert().multiply(rest.get(limb.foot).quaternion);
    limb.leg.updateMatrixWorld(true);
  }
  function sampleReaction() {
    for (const key of GESTURE_KEYS) gesture[key] = 0;
    if (reduced || !reactionKind) return;
    const t = reactionAge;
    if (reactionKind === 'anticipate') {
      gesture.nod = rad(-4.8) * pulse(t, .04, .95); gesture.tilt = rad(-2) * pulse(t, .12, .8);
      gesture.jaw = rad(1.5) * pulse(t, .12, .55); gesture.bodyPitch = rad(-1.4) * pulse(t, .04, 1.05);
      gesture.bodyLift = .012 * pulse(t, .1, .7); gesture.tail = .3 * pulse(t, .1, 1);
    } else if (reactionKind === 'good') {
      // A decisive double nod, followed by a small satisfied lift.
      gesture.nod = rad(-5) * pulse(t, .06, .36) + rad(4) * pulse(t, .31, .38) - rad(3.4) * pulse(t, .68, .32) + rad(2.2) * pulse(t, .92, .52);
      gesture.tilt = rad(2.5) * pulse(t, .1, 1.45); gesture.jaw = rad(4.8) * pulse(t, .2, .95);
      gesture.bodyPitch = rad(1.7) * pulse(t, .15, 1.3); gesture.bodyLift = .02 * pulse(t, .14, 1.35);
      gesture.tail = 1.6 * pulse(t, .12, 1.6);
    } else if (reactionKind === 'great' || reactionKind === 'win') {
      const s = reactionKind === 'win' ? t * .82 : t;
      gesture.nod = rad(9) * pulse(s, .08, 1.1) - rad(3) * pulse(s, 1.15, .45) + rad(4) * pulse(s, 1.55, .55);
      gesture.tilt = rad(-3.5) * pulse(s, .2, .85) + rad(4) * pulse(s, 1.05, .8);
      gesture.yaw = rad(-3) * pulse(s, .4, 1) + rad(2) * pulse(s, 1.4, .7);
      gesture.jaw = rad(6.5) * pulse(s, .12, 1.3) + rad(3) * pulse(s, 1.5, .5);
      gesture.bodyPitch = rad(2.8) * pulse(s, .1, 1.45); gesture.bodyRoll = rad(1.1) * pulse(s, .65, .9);
      gesture.bodyLift = .04 * pulse(s, .08, 1.5); gesture.tail = 2.6 * pulse(s, .12, 2.15);
      gesture.pawL = .10 * pulse(s, .45, .56) + .055 * pulse(s, 1.43, .48);
      gesture.pawR = .13 * pulse(s, .78, .62);
      if (reactionKind === 'win') {
        gesture.nod += rad(3) * pulse(t, 2.55, .55); gesture.bodyLift += .022 * pulse(t, 2.15, .65);
        gesture.pawL += .10 * pulse(t, 2.15, .52); gesture.pawR += .10 * pulse(t, 2.4, .52);
      }
    } else if (reactionKind === 'bad') {
      // A little deflated sigh, a slow head shake, then a hopeful recovery.
      gesture.nod = rad(-8) * pulse(t, .06, 1.65) + rad(2) * pulse(t, 1.65, .58);
      gesture.tilt = rad(-6.5) * pulse(t, .3, 1.45);
      gesture.yaw = rad(-4) * Math.sin((t - .6) * 9) * pulse(t, .6, .95);
      gesture.jaw = rad(1.6) * pulse(t, .1, .5); gesture.lid = .24 * pulse(t, .18, 1.35);
      gesture.bodyPitch = rad(-2.3) * pulse(t, .1, 1.75); gesture.bodyLift = -.018 * pulse(t, .3, 1.25);
      gesture.tail = .35 * pulse(t, 1.6, .6);
    } else if (reactionKind === 'near') {
      gesture.nod = rad(-2) * pulse(t, .08, .52) + rad(4) * pulse(t, 1.02, .58);
      gesture.tilt = rad(8) * pulse(t, .2, 1.15); gesture.yaw = rad(7) * pulse(t, .12, .85) - rad(3) * pulse(t, .95, .68);
      gesture.jaw = rad(2.2) * pulse(t, .38, .65); gesture.lid = .1 * pulse(t, .5, .45);
      gesture.bodyPitch = rad(-1) * pulse(t, .12, 1.3); gesture.tail = .9 * pulse(t, .9, .9);
    }
    // A result can interrupt anticipation. Blend from the visible pose rather
    // than snapping back to neutral before the new gesture begins.
    const blend = THREE.MathUtils.smoothstep(t, 0, .14);
    for (const key of GESTURE_KEYS) gesture[key] = previousGesture[key] * (1 - blend) + gesture[key] * blend;
    if (watchingRoll) gesture.pawL = gesture.pawR = 0;
  }
  function liftPaw(limb, amount) {
    if (amount <= .000001) return;
    limb.leg.getWorldPosition(pawShoulder); limb.leg.getWorldScale(pawScale);
    const length = limb.length * pawScale.y;
    scratch.copy(limb.anchor); scratch.y += amount;
    const dx = scratch.x - pawShoulder.x, dy = scratch.y - pawShoulder.y;
    scratch.z = pawShoulder.z + Math.sqrt(Math.max(0, length * length - dx * dx - dy * dy));
    placeForeleg(limb, scratch);
  }
  function pose() {
    saveAnimated();
    body.position.add(seatOffset);
    rotateWorld(body, right, SEAT_ANGLE);
    body.position.y += gesture.bodyLift;
    if (gesture.bodyPitch) rotateWorld(body, right, gesture.bodyPitch);
    if (gesture.bodyRoll) rotateWorld(body, forward, gesture.bodyRoll);
    if (rolling && !reduced) rotateWorld(body, right, -rad(.65) * rolling);
    for (const limb of front) {
      placeForeleg(limb, limb.anchor);
    }
    for (const limb of back) {
      limb.leg.position.copy(limb.pivot);
      limb.leg.quaternion.copy(rest.get(limb.leg).quaternion).premultiply(q.setFromAxisAngle(modelRight, rad(62)));
      limb.foot.quaternion.copy(limb.leg.quaternion).invert().multiply(rest.get(limb.foot).quaternion);
    }
    const life = reduced ? 0 : 1;
    nod = (gesture.nod - thinking * rad(1.7) + watchNod) * life;
    tilt = (thinking * rad(5.2) + gesture.tilt + watchTilt) * life;
    jawOpen = gesture.jaw * life;
    if (gesture.tail && life) for (let i = 0; i < tail.length; i++) {
      rotateWorld(tail[i], up, Math.sin(reactionAge * 6.4 - i * .45) * rad(gesture.tail));
    }
  }
  function finishPose() {
    rotateWorld(neck, up, FACE_YAW * .25);
    rotateWorld(head, up, FACE_YAW * .75);
    if (nod) { rotateWorld(neck, right, nod * .35); rotateWorld(head, right, nod * .65); }
    if (tilt) rotateWorld(head, forward, tilt);
    if (gesture.yaw) rotateWorld(head, up, gesture.yaw);
    if (jawOpen) rotateWorld(jaw, right, -jawOpen);
    group.updateMatrixWorld(true);
    liftPaw(front[0], gesture.pawL); liftPaw(front[1], gesture.pawR);
  }
  actor.control(drive, pose);
  actor.lookYawLimit = 30; actor.lookUpLimit = 18;
  lookPoint.copy(world.camera.position);
  actor.lookAt(lookPoint, lookOptions);
  actor.update(0);
  finishPose();
  world.actors?.set(actor.name, actor);

  function update(dt, time, { thinking: wantThinking = false, rolling: wantRolling = false, target = null, reducedMotion = false } = {}) {
    if (disposed) return;
    const delta = clamp(finite(dt), 0, .1);
    if (!delta) return; // The host owns pause; zero-dt frames are exact no-ops.
    clock += delta; reduced = !!reducedMotion;
    thinking += ((wantThinking ? 1 : 0) - thinking) * (1 - Math.exp(-delta / .28));
    rolling += ((wantRolling ? 1 : 0) - rolling) * (1 - Math.exp(-delta / .20));
    watchingRoll = Boolean(wantRolling);
    reactionAge += delta;
    if (reduced || reactionAge >= reactionDuration) reactionKind = null;
    reactionWeight = reactionKind ? envelope(reactionAge, reactionDuration) : 0;
    sampleReaction();
    if (Math.abs(gesture.lid - lidLevel) > .00001) {
      lidLevel = gesture.lid; actor.closeEyes(lidLevel, immediateEyes);
    }
    if (reactionKind && !reactionBlink && reactionAge > (reactionKind === 'bad' ? 1.55 : reactionKind === 'near' ? .95 : 1.05)) {
      reactionBlink = true; actor.blink();
    }
    if (!reduced && (wantThinking !== lastThinking || wantRolling && !lastRolling)) actor.blink();
    lastThinking = !!wantThinking; lastRolling = !!wantRolling;
    if (target && Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z)) lookPoint.copy(target);
    else if (wantThinking || wantRolling) lookPoint.copy(dicePoint);
    else lookPoint.copy(world.camera.position);
    // The actor smooths the actual gaze. This slower, bounded head response
    // follows the cup's position instead of mirroring every high-frequency shake.
    if (reduced) watchTilt = watchNod = 0;
    else {
      const gazeBlend = 1 - Math.exp(-delta / .24);
      watchTilt += ((watchingRoll ? -rad(1.4) * clamp(lookPoint.x / 1.8, -1, 1) : 0) - watchTilt) * gazeBlend;
      watchNod += ((watchingRoll ? rad(.65) * clamp(lookPoint.y - tableY - .25, -.7, .7) : 0) - watchNod) * gazeBlend;
    }
    lookOptions.weight = (wantThinking || wantRolling ? .76 : .62) * (1 - .35 * reactionWeight);
    actor.lookAt(lookPoint, lookOptions);
    idle?.setEffectiveTimeScale(reduced ? 0 : .86);
    actor.update(delta);
    finishPose();
  }
  function react(kind = 'happy') {
    if (disposed || reduced) return false;
    const next = ['oops', 'bad', 'poor', 'miss'].includes(kind) ? 'bad' : ['win', 'yatzy'].includes(kind) ? 'win' : Object.hasOwn(REACTION_LENGTH, kind) ? kind : 'good';
    if (reactionKind === next && reactionAge < .55) return false;
    for (const key of GESTURE_KEYS) previousGesture[key] = gesture[key];
    reactionKind = next; reactionAge = 0; reactionDuration = REACTION_LENGTH[next]; reactionBlink = false;
    actor.blink();
    return true;
  }
  function reset() {
    if (disposed) return;
    clock = thinking = rolling = reactionWeight = nod = tilt = jawOpen = watchTilt = watchNod = 0;
    watchingRoll = false;
    for (const key of GESTURE_KEYS) gesture[key] = previousGesture[key] = 0;
    reactionBlink = false; lidLevel = 0;
    reactionKind = null; reactionAge = 10; lastThinking = lastRolling = false;
    actor.stop();
    actor.openEyes(immediateEyes);
    for (const bone of bones) {
      const bind = rest.get(bone); bone.position.copy(bind.position); bone.quaternion.copy(bind.quaternion); bone.scale.copy(bind.scale);
    }
    idle?.reset().play(); idle?.setEffectiveTimeScale(reduced ? 0 : .86);
    actor.mixer.setTime(0); saveAnimated();
    lookPoint.copy(world.camera.position); actor.lookAt(lookPoint, lookOptions);
    actor.update(0); finishPose();
  }
  function getHandTarget(out = new THREE.Vector3()) {
    if (disposed) return out.copy(handPoint);
    hand.foot.getWorldPosition(handPoint);
    return out.copy(handPoint);
  }
  function getDebugState() {
    return { disposed, source: MODEL, triangles, bones: bones.length, time: clock, thinking, rolling, reducedMotion: reduced,
      reaction: reactionKind, reactionWeight, nod, tilt, jawOpen,
      expression: { ...gesture },
      position: group.position.toArray(), head: actor.headPosition(scratch).toArray(), hand: getHandTarget(scratch).toArray(),
      watch: { rolling: watchingRoll, target: lookPoint.toArray(), tilt: watchTilt, nod: watchNod },
      paws: front.map(limb => limb.foot.getWorldPosition(new THREE.Vector3()).toArray()),
      clips: [...actor.clips.keys()], controlled: actor.controlled };
  }
  function dispose() {
    if (disposed) return;
    getHandTarget(handPoint); disposed = true; reactionKind = null; reactionWeight = 0; watchingRoll = false;
    if (world.actors?.get(actor.name) === actor) world.actors.delete(actor.name);
    actor.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
    // Source geometry, materials and textures belong to actor.js's shared cache.
  }
  return { actor, group, update, react, reset, dispose, getHandTarget, getDebugState };
}
