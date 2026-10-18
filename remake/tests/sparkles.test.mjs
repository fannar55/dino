import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEffects } from '../engine/effects.js';
import { sparkleBurst, sparkleTrail } from '../world/props/sparkles.js';

const stage = () => ({ scene: new THREE.Scene(), effects: createEffects(), resolvePoint: (spec, out) => out.fromArray(spec) });
const step = (world, seconds, dt = 1 / 30) => { for (let t = 0; t < seconds - 1e-9; t += dt) world.effects.update(dt); };

test('a sparkle burst draws in one call, ends after its duration and removes itself', () => {
  const world = stage();
  const burst = sparkleBurst(world, new THREE.Vector3(1, 3, 0), { duration: 1 });
  const sets = world.scene.children.filter(o => o.isPoints);
  assert.equal(sets.length, 1, 'one THREE.Points: one draw call');
  assert.equal(sets[0].geometry.attributes.position.count, 24);
  step(world, 0.5);
  assert.equal(burst.done, false);
  assert.equal(world.scene.children.length, 1);
  step(world, 0.5 + 1 / 30);
  assert.equal(burst.done, true);
  assert.equal(world.scene.children.length, 0, 'it took itself out of the scene');
  assert.equal(world.effects.size, 0);
});

test('a sparkle burst moves only with the game clock and can be cut short', () => {
  const world = stage();
  const burst = sparkleBurst(world, [0, 2, 0], { duration: 1, count: 12 });
  step(world, 0.4);
  const uniforms = world.scene.children[0].material.uniforms;
  const age = uniforms.uTime.value;
  for (let i = 0; i < 30; i++) world.effects.update(0); // paused frames
  assert.equal(uniforms.uTime.value, age);
  burst.cancel();
  assert.equal(world.scene.children.length, 0);
  world.effects.update(1 / 30);
  assert.equal(world.effects.size, 0);
});

test('a sparkle trail leaves its glints where the thing it follows was', () => {
  const world = stage();
  const at = new THREE.Vector3(0, 1, 0);
  const trail = sparkleTrail(world, () => at, { duration: 1, count: 10, life: 0.5 });
  const placed = [];
  for (let i = 0; i < 60 && !trail.done; i++) {
    at.x += 0.1; // it moves 3 m a second
    world.effects.update(1 / 30);
    const position = world.scene.children[0]?.geometry.attributes.position;
    if (position) placed.push(position.getX(0), position.getX(9));
  }
  assert.equal(trail.done, true);
  assert.equal(world.scene.children.length, 0);
  const first = placed[0];
  const last = placed[placed.length - 1];
  assert.ok(last - first > 2, `the first and last glints were born ${(last - first).toFixed(2)} m apart`);
});
