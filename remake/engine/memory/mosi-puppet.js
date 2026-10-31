import * as THREE from 'three';
import { bump } from './gestures.js';

/**
 * Mosi's reactions in the memory game, laid over his clips on his own bones (the shared actor.js is
 * left as the other games use it). His rig has the baby triceratops' bone names (root, Body,
 * Shoulders, Neck, Head, Jaw, Tail1, FrontLeg.L ...), x forward, y up, z his right side.
 *
 *   const puppet = createMosiPuppet(mosi);   // takes mosi.control() for the pose hook
 *   puppet.gesture('laugh');                 // 'laugh' | 'clap' | 'shake-head' | 'cheer'
 *   puppet.update(dt);                       // on the game clock, before mosi.update(dt)
 *
 * The clip pose is restored before his mixer runs and the gesture is added after it, so nothing piles
 * up, and a paused frame (dt <= 0) leaves him exactly as he was.
 */
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const arc = (t, a, b) => { if (t <= a || t >= b) return 0; const u = (t - a) / (b - a); return 4 * u * (1 - u); };
const wave = (t, cycles, phase = 0) => Math.sin(Math.PI * 2 * (cycles * t + phase));

function turnHead(rig, axis, angle) {
  if (rig.neck) { rig.rotateInRoot(rig.neck, axis, angle * .4); rig.rotateInRoot(rig.head, axis, angle * .6); }
  else rig.rotateInRoot(rig.head, axis, angle);
}

export const MOSI_GESTURES = Object.freeze({
  // Head back, bobbing, beak chattering, the whole body shaking with it.
  laugh: { duration: 1.5, apply(rig, t, energy) {
    const L = rig.length, on = bump(t, 0, 1);
    turnHead(rig, Z, energy * on * (.26 + .1 * wave(t, 5)));
    if (rig.jaw) rig.rotateInRoot(rig.jaw, Z, -(.12 + .14 * Math.abs(wave(t, 5))) * on);
    rig.offsetInRoot(rig.body, 0, .012 * L * energy * on * wave(t, 7.5));
    rig.lift += .006 * L * energy * on * Math.abs(wave(t, 3.75));
    rig.rotateInRoot(rig.tail, Y, .3 * energy * on * wave(t, 3));
    if (rig.crossed(.08)) rig.lids?.blink.rest(.6, .12);
    if (rig.crossed(.9)) rig.lids?.blink.rest(0, .2);
  } },
  // Claps with his front feet: left, right, left, right, rocking back so the front comes up.
  clap: { duration: 1.4, apply(rig, t, energy) {
    const L = rig.length, [left, right] = rig.front;
    const stampL = arc(t, .04, .26) + arc(t, .5, .72), stampR = arc(t, .27, .49) + arc(t, .73, .95);
    if (left) rig.offsetInRoot(left.leg, .035 * L * energy * stampL, .07 * L * energy * stampL);
    if (right) rig.offsetInRoot(right.leg, .035 * L * energy * stampR, .07 * L * energy * stampR);
    rig.pitch += .1 * energy * bump(t, 0, 1);
    turnHead(rig, Z, .16 * energy * bump(t, 0, 1));
    rig.rotateInRoot(rig.body, X, .06 * energy * (stampL - stampR));
    if (rig.jaw) rig.rotateInRoot(rig.jaw, Z, -.16 * bump(t, .1, .9));
  } },
  // "No, not that one": three shakes of the head, smiling.
  'shake-head': { duration: 1.15, apply(rig, t, energy) {
    const on = bump(t, 0, 1);
    turnHead(rig, Y, .72 * energy * on * wave(t, 3));
    rig.rotateInRoot(rig.head, X, .14 * energy * on * wave(t, 3, .25));
    rig.rotateInRoot(rig.body, Y, .08 * energy * on * wave(t, 3));
    if (rig.jaw) rig.rotateInRoot(rig.jaw, Z, -.08 * on);
  } },
  // Rears up with a hop, head high, beak open, tail swinging.
  cheer: { duration: 1.6, apply(rig, t, energy) {
    const L = rig.length, up = bump(t, .02, .98);
    rig.pitch += .2 * energy * up;
    rig.lift += .05 * L * energy * (arc(t, .1, .45) + .8 * arc(t, .5, .85));
    turnHead(rig, Z, .32 * energy * up);
    if (rig.jaw) rig.rotateInRoot(rig.jaw, Z, -.3 * bump(t, .1, .8));
    rig.rotateInRoot(rig.tail, Y, .5 * energy * up * wave(t, 3));
    for (const pair of rig.front) rig.offsetInRoot(pair.leg, .02 * L * energy * up, .04 * L * energy * up);
    if (rig.crossed(.45)) rig.lids?.blink.blink();
  } },
});

export function createMosiPuppet(mosi) {
  const { root, model } = mosi;
  const find = name => model.getObjectByName(name) || model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
  const rigRoot = find('root'), head = find('Head'), neck = find('Neck'), jaw = find('Jaw'), body = find('Body'), tail = find('Tail1');
  const front = ['FrontLeg.L', 'FrontLeg.R'].map(name => ({ leg: find(name) })).filter(pair => pair.leg);
  const bones = [...new Set([rigRoot, head, neck, jaw, body, tail, ...front.map(pair => pair.leg)].filter(Boolean))];
  const base = new Map(bones.map(bone => [bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone() }]));
  const rootQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), offsetQ = new THREE.Quaternion(), delta = new THREE.Vector3(), at = new THREE.Vector3();
  let gesture = null, from = 0, applied = false, reduced = false, disposed = false;
  root.updateMatrixWorld(true);
  const length = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x / Math.max(1e-6, root.scale.x);

  function rotateInRoot(bone, axis, angle) {
    if (!bone || Math.abs(angle) < 1e-8) return;
    root.getWorldQuaternion(rootQ); bone.parent.getWorldQuaternion(parentQ);
    offsetQ.setFromAxisAngle(axis.clone().applyQuaternion(rootQ), angle);
    offsetQ.premultiply(parentQ.clone().invert()).multiply(parentQ);
    bone.quaternion.premultiply(offsetQ); bone.updateMatrixWorld(true);
  }
  function offsetInRoot(bone, x, y, z = 0) {
    if (!bone) return;
    delta.copy(root.localToWorld(at.set(x, y, z))).sub(root.getWorldPosition(at));
    bone.position.copy(bone.parent.worldToLocal(bone.getWorldPosition(at).add(delta))); bone.updateMatrixWorld(true);
  }
  const rig = { head, neck, jaw, body, tail, front, lids: mosi.eyelids, length, rotateInRoot, offsetInRoot, lift: 0, pitch: 0, crossed: value => from < value && gesture && gesture.t >= value };

  function restore() { for (const [bone, pose] of base) { bone.position.copy(pose.position); bone.quaternion.copy(pose.quaternion); } applied = false; }
  function capture() { for (const [bone, pose] of base) { pose.position.copy(bone.position); pose.quaternion.copy(bone.quaternion); } }
  // drive runs first in Mosi's update (before his clips), pose right after them.
  mosi.control(dt => { if (dt > 0 && applied) restore(); }, dt => {
    if (!(dt > 0) || disposed) return;
    capture();
    if (!gesture) return;
    rig.lift = 0; rig.pitch = 0;
    MOSI_GESTURES[gesture.name].apply(rig, gesture.t, reduced ? .3 : 1);
    // Whole-body lift and rear-up go through the rig root, so the feet come along.
    rotateInRoot(rigRoot, Z, rig.pitch); offsetInRoot(rigRoot, 0, rig.lift);
    applied = true;
    if (gesture.t >= 1) gesture = null;
  });

  return {
    gesture(name) {
      if (disposed || !MOSI_GESTURES[name]) return false;
      gesture = { name, t: 0, duration: MOSI_GESTURES[name].duration }; from = 0; return true;
    },
    update(dt) {
      if (!gesture || !(dt > 0)) return;
      from = gesture.t; gesture.t = Math.min(1, gesture.t + dt / gesture.duration);
    },
    cancel() { gesture = null; mosi.eyelids?.blink.rest(0, .2); },
    setReducedMotion(value) { reduced = Boolean(value); },
    get current() { return gesture?.name ?? null; },
    dispose() { disposed = true; gesture = null; mosi.control(null); },
  };
}
