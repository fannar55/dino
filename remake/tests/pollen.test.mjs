import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEffects } from '../engine/effects.js';
import { Handle } from '../engine/handle.js';
import { pollenBurst } from '../world/props/pollen.js';
import { sparkleBurst } from '../world/props/sparkles.js';

const stage = () => ({ scene: new THREE.Scene(), effects: createEffects(), resolvePoint: (spec, out) => out.fromArray(spec) });
const step = (world, seconds, dt = 1 / 30) => { for (let t = 0; t < seconds - 1e-9; t += dt) world.effects.update(dt); };
const pointsOf = world => world.scene.children.filter(o => o.isPoints);

test('a pollen burst ends after 1.5 s on the clock and removes itself', () => {
  const world = stage();
  const burst = pollenBurst(world, new THREE.Vector3(1, 1.4, 0));
  assert.ok(burst instanceof Handle, 'anything that animates on the game clock returns a Handle');
  const sets = pointsOf(world);
  assert.equal(sets.length, 1, 'one THREE.Points: one draw call');
  assert.equal(sets[0].geometry.attributes.position.count, 40, 'forty specks unless asked for another number');
  step(world, 1.45);
  assert.equal(burst.done, false, 'still in the air a moment before 1.5 s');
  assert.equal(world.scene.children.length, 1);
  step(world, 0.05 + 1 / 30);
  assert.equal(burst.done, true, 'gone by 1.5 s');
  assert.equal(world.scene.children.length, 0, 'it took itself out of the scene');
  assert.equal(world.effects.size, 0);
});

test('a pollen burst moves only with the game clock and can be cut short', () => {
  const world = stage();
  const burst = pollenBurst(world, [0, 1.4, 0], { count: 12 });
  step(world, 0.6);
  const uniforms = pointsOf(world)[0].material.uniforms;
  const age = uniforms.uTime.value;
  assert.ok(Math.abs(age - 0.6) < 1e-6, `the burst is ${age} s old after 0.6 s of the clock`);
  for (let i = 0; i < 30; i++) world.effects.update(0); // paused frames
  assert.equal(uniforms.uTime.value, age);
  burst.cancel();
  assert.equal(world.scene.children.length, 0);
  world.effects.update(1 / 30);
  assert.equal(world.effects.size, 0);
});

test('every speck leaves from the point, one after another in the first moments, and has gone by the end', () => {
  const world = stage();
  const at = new THREE.Vector3(2.5, 1.7, -0.5);
  pollenBurst(world, at, { count: 25, duration: 1.5 });
  const { geometry, material } = pointsOf(world)[0];
  const { position, birth } = geometry.attributes;
  assert.equal(position.count, 25);
  for (let i = 0; i < position.count; i++) {
    assert.deepEqual([position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e4) / 1e4), [2.5, 1.7, -0.5]);
    if (i > 0) assert.ok(birth.getX(i) > birth.getX(i - 1), 'they come out in turn, not all in one frame');
    assert.ok(birth.getX(i) + material.uniforms.uLife.value <= 1.5 + 1e-6, `speck ${i} is gone after ${birth.getX(i) + material.uniforms.uLife.value} s`);
  }
  assert.equal(birth.getX(0), 0);
  assert.ok(birth.getX(24) < 0.4, 'a puff, not a stream');
});

test('pollen is the sparkles\' machinery with another look: warm yellow, larger, softer, swirling up and drifting', () => {
  const world = stage();
  sparkleBurst(world, [0, 1, 0]);
  pollenBurst(world, [0, 1, 0]);
  const [glints, pollen] = pointsOf(world);
  assert.equal(pointsOf(world).length, 2);
  // the same shaders, not a copy of them
  assert.equal(pollen.material.vertexShader, glints.material.vertexShader);
  assert.equal(pollen.material.fragmentShader, glints.material.fragmentShader);

  const a = glints.material.uniforms, b = pollen.material.uniforms;
  // warm yellow: red over green over blue, and not the sparkles' gold-white
  assert.ok(b.uColour.value.r > b.uColour.value.g && b.uColour.value.g > b.uColour.value.b * 2, `yellow: ${b.uColour.value.getHexString()}`);
  assert.notEqual(b.uColour.value.getHex(), a.uColour.value.getHex());
  assert.ok(b.uSize.value > a.uSize.value, `specks ${b.uSize.value} m across against a sparkle's ${a.uSize.value}`);
  assert.ok(b.uFalloff.value < a.uFalloff.value, 'a softer edge');
  assert.equal(b.uStar.value, 0, 'no four-pointed star on a speck of dust');
  assert.equal(b.uTwinkle.value, 0, 'and no twinkle');
  assert.ok(b.uSwirl.value > 0 && b.uRise.value > 0, 'they swirl and rise');
  assert.ok(Math.hypot(b.uDrift.value.x, b.uDrift.value.y) > 0, 'and drift on');
  assert.equal(pollen.material.blending, THREE.NormalBlending, 'dust darkens what is behind it a little, a glint only adds light');
  assert.equal(glints.material.blending, THREE.AdditiveBlending);
  assert.equal(pollen.material.transparent, true);
  assert.equal(pollen.material.depthWrite, false);
});

test('the sparkles keep the look they had: the new settings are off for them', () => {
  const world = stage();
  sparkleBurst(world, [0, 1, 0], { duration: 1 });
  const u = pointsOf(world)[0].material.uniforms;
  assert.deepEqual([u.uSwirl.value, u.uRise.value, u.uDrift.value.x, u.uDrift.value.y, u.uRim.value], [0, 0, 0, 0, 0], 'they neither swirl, rise, drift nor fade at the rim');
  assert.deepEqual([u.uStar.value, u.uTwinkle.value, u.uGlow.value, u.uFalloff.value], [1, 1, 0.85, 5], 'the star, the twinkle and the glow of before');
});

test('a pollen burst takes a point spec and sets down the same specks every time', () => {
  const run = () => {
    const world = stage();
    pollenBurst(world, [1, 2, 3]);
    const g = pointsOf(world)[0].geometry;
    return [...g.attributes.seed.array, ...g.attributes.birth.array];
  };
  assert.deepEqual(run(), run());
  const world = stage();
  assert.throws(() => pollenBurst({ scene: world.scene }, [0, 0, 0]), /world\.effects/, 'no clock, no burst, and it says why');
});
