import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createActor, updateActors } from '../engine/actor.js';
import { createEffects } from '../engine/effects.js';
import { createPointResolver } from '../engine/points.js';
import { holdWithHands } from '../engine/hand-hold.js';
import { loadGlb } from './glb.mjs';

// Hands that hold something (engine/hand-hold.js): Egill's two hands on the posy he carries in chapter 1, laid over his own
// pose after the actors update, as main.js runs a frame (the actors, then world.effects). On the real model, read without
// textures.

const egillGltf = loadGlb(new URL('../assets/characters/egill.glb', import.meta.url));

// Where his wrists go: either side of the stems of a posy held in front of him (his own frame, from his feet), the hands
// reaching in to the stems from there.
const GRIPS = {
  left: { actor: 'egill', part: 'feet', offset: [0.16, 0.54, -0.08], local: true },
  right: { actor: 'egill', part: 'feet', offset: [0.16, 0.58, 0.08], local: true },
};

async function stage({ twin = false } = {}) {
  const world = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), heightAt: () => 0, actors: new Map(), effects: createEffects() };
  world.resolvePoint = createPointResolver(world);
  const egill = await createActor(world, { name: 'egill', gltf: await egillGltf, position: [0, 0, 0], heading: 0 });
  world.actors.set('egill', egill);
  // The same boy beside him, never holding anything: what his own pose is, frame by frame.
  const other = twin ? await createActor(world, { name: 'twin', gltf: await egillGltf, position: [0, 0, 0], heading: 0 }) : null;
  if (other) world.actors.set('twin', other);
  const frame = (dt = 1 / 30) => {
    updateActors(world.actors.values(), dt);
    world.effects.update(dt);
  };
  return { world, egill, other, frame };
}
const wrist = (actor, side) => actor.model.getObjectByName(`${side}Hand`).getWorldPosition(new THREE.Vector3());
const apart = (world, egill) => ['Left', 'Right'].map(side => wrist(egill, side).distanceTo(world.resolvePoint(GRIPS[side.toLowerCase()], new THREE.Vector3())));
const cm = metres => `${(metres * 100).toFixed(1)} cm`;

test('grip brings both hands to the stems over a moment, and they stay there as he walks and turns', async () => {
  const { world, egill, frame } = await stage();
  for (let i = 0; i < 10; i++) frame();
  const hold = holdWithHands(world, egill, GRIPS);
  hold.grip(0.4);
  const first = apart(world, egill);
  frame();
  assert.ok(Math.max(...apart(world, egill)) > 0.05, 'not at once: the hands go to the stems over the blend');
  for (let i = 0; i < 15; i++) frame();
  for (const [i, d] of apart(world, egill).entries()) assert.ok(d < 0.01, `${['left', 'right'][i]} hand on the stems: ${cm(d)} (from ${cm(first[i])})`);
  let worst = 0;
  egill.walkTo([[1.6, 0.9], [2.4, -0.6]], { speed: 0.9 });
  for (let i = 0; i < 150; i++) {
    frame();
    worst = Math.max(worst, ...apart(world, egill));
  }
  egill.turnTo(200);
  for (let i = 0; i < 60; i++) {
    frame();
    worst = Math.max(worst, ...apart(world, egill));
  }
  assert.ok(worst < 0.02, `walking and turning, his hands stay within ${cm(worst)} of the stems`);
  assert.equal(hold.weight, 1);
});

test('the arms stay clear of his body: elbows out past his sides, wrists in front of his chest', async () => {
  const { world, egill, frame } = await stage();
  const hold = holdWithHands(world, egill, GRIPS);
  hold.grip(0.4);
  for (let i = 0; i < 20; i++) frame();
  egill.root.updateMatrixWorld(true);
  const toLocal = point => egill.root.worldToLocal(point.clone());
  const chest = toLocal(egill.model.getObjectByName('Chest').getWorldPosition(new THREE.Vector3()));
  for (const side of ['Left', 'Right']) {
    const sign = side === 'Left' ? -1 : 1;
    const elbow = toLocal(egill.model.getObjectByName(`${side}LowerArm`).getWorldPosition(new THREE.Vector3()));
    const hand = toLocal(wrist(egill, side));
    // his body is 0.112 m from its middle to its side at his elbows' height (the skin weighted to his trunk)
    assert.ok(sign * elbow.z > 0.13, `${side} elbow out past his side: ${(sign * elbow.z).toFixed(3)} m from his middle`);
    assert.ok(hand.x > chest.x + 0.08, `${side} wrist in front of his chest`);
  }
});

test('release takes his hands back to his own pose as smoothly, and the hold is over', async () => {
  const { world, egill, other, frame } = await stage({ twin: true });
  for (let i = 0; i < 10; i++) frame();
  const hold = holdWithHands(world, egill, GRIPS);
  hold.grip(0.4);
  for (let i = 0; i < 20; i++) frame();
  const effects = world.effects.size;
  hold.release(0.5);
  let step = 0;
  let before = ['Left', 'Right'].map(side => wrist(egill, side));
  for (let i = 0; i < 20; i++) {
    frame();
    const now = ['Left', 'Right'].map(side => wrist(egill, side));
    step = Math.max(step, ...now.map((p, k) => p.distanceTo(before[k])));
    before = now;
  }
  assert.ok(step < 0.03, `no snap: a wrist moves at most ${cm(step)} in a frame`);
  assert.equal(hold.weight, 0);
  assert.equal(world.effects.size, effects - 1, 'the hold has left world.effects');
  for (let i = 0; i < 5; i++) frame();
  for (const side of ['Left', 'Right']) {
    const off = wrist(egill, side).distanceTo(wrist(other, side));
    assert.ok(off < 0.002, `${side} hand back in his own pose, ${cm(off)} from where it is on a boy who held nothing`);
  }
});

test('a clip that holds an arm still gets its own pose back each frame, not the turn the hold gave it', async () => {
  const { world, egill, other, frame } = await stage({ twin: true });
  egill.mixer.timeScale = 0; // the clips hold still: the mixer has nothing new to write
  other.mixer.timeScale = 0;
  for (let i = 0; i < 5; i++) frame();
  const hold = holdWithHands(world, egill, GRIPS);
  hold.grip(0.2);
  for (let i = 0; i < 15; i++) frame();
  for (const [i, d] of apart(world, egill).entries()) assert.ok(d < 0.01, `${['left', 'right'][i]} hand on the stems: ${cm(d)}`);
  hold.release(0.2);
  for (let i = 0; i < 15; i++) frame();
  for (const side of ['Left', 'Right']) {
    const off = wrist(egill, side).distanceTo(wrist(other, side));
    assert.ok(off < 0.002, `${side} hand back where the still clip has it: ${cm(off)} off`);
  }
});

test('a hold needs world.effects, a hand that is there and a point it can find', async () => {
  const { world, egill } = await stage();
  assert.throws(() => holdWithHands({ resolvePoint: world.resolvePoint }, egill, GRIPS), /effects/);
  assert.throws(() => holdWithHands(world, egill, {}), /hand/);
  assert.throws(() => holdWithHands(world, egill, { left: { actor: 'nobody', part: 'feet' } }), /nobody/);
  const handless = { name: 'stone', model: new THREE.Group(), root: new THREE.Group() };
  assert.throws(() => holdWithHands(world, handless, GRIPS), /stone has no left arm/);
});

test('a grip or a release over no time gives no NaN on a frame where the clock stands still, and is done by the next', async () => {
  const { world, egill, frame } = await stage();
  frame();
  const hold = holdWithHands(world, egill, GRIPS);
  hold.grip(0);
  frame(0); // a frozen frame: the game held, or a capture
  assert.ok(Number.isFinite(hold.weight), `weight ${hold.weight}`);
  for (const d of apart(world, egill)) assert.ok(Number.isFinite(d), 'the arms are where they were, not nowhere');
  frame();
  assert.equal(hold.weight, 1, 'at once, on the next frame with time in it');
  assert.ok(Math.max(...apart(world, egill)) < 0.01);
  hold.release(0);
  frame(0);
  assert.ok(Number.isFinite(hold.weight), `weight ${hold.weight}`);
  frame();
  assert.equal(hold.weight, 0);
  assert.equal(hold.over, true);
  for (const bone of ['LeftUpperArm', 'LeftLowerArm', 'RightUpperArm', 'RightLowerArm']) {
    const q = egill.model.getObjectByName(bone).quaternion;
    assert.ok([q.x, q.y, q.z, q.w].every(Number.isFinite), `${bone} is a real turn`);
  }
});
