import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createClock } from '../engine/clock.js';
import { createEffects } from '../engine/effects.js';
import { createFootprints, printLevel, PRINT_SECONDS } from '../world/props/footprints.js';

// Footprints (world/props/footprints.js): the prints Mosi's feet press into the path in scene 6. They are checked on a
// world as main.js makes one (a scene, the game clock, world.effects) with a stand-in walker whose foot bones a test lifts
// and sets down, on ground that rises to the east.

function stage({ slope = 0 } = {}) {
  const world = { scene: new THREE.Scene(), clock: createClock(), effects: createEffects(), heightAt: x => slope * x };
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const feet = {};
  for (const [name, x, z] of [['FrontFootL', 2.3, -0.9], ['FrontFootR', 2.3, 0.9], ['BackFootL', 0, -0.9], ['BackFootR', 0, 0.9]]) {
    const bone = new THREE.Object3D();
    bone.name = name;
    bone.position.set(x, 0.18 + slope * x, z);
    model.add(bone);
    feet[name] = bone;
  }
  world.scene.add(root);
  const walker = { name: 'mosi', root, model };
  return { world, walker, feet };
}
const FEET = [
  { bone: 'FrontFootL', size: 1, ahead: 0.13 }, { bone: 'FrontFootR', size: 1, ahead: 0.13 },
  { bone: 'BackFootL', size: 1.1, ahead: -0.35 }, { bone: 'BackFootR', size: 1.1, ahead: -0.35 },
];
const frame = (world, dt = 1 / 30) => {
  world.clock.step(dt);
  world.effects.update(dt);
};
/** A foot lifts 20 cm and comes down again, a few frames each way. */
function stepWith(world, bone) {
  const rest = bone.position.y;
  for (let i = 1; i <= 4; i++) {
    bone.position.y = rest + 0.05 * i;
    frame(world);
  }
  for (let i = 3; i >= 0; i--) {
    bone.position.y = rest + 0.05 * i;
    frame(world);
  }
}

test('a foot that comes down presses a print under it, turned the way the walker faces, ahead of the bone as asked', () => {
  const { world, walker, feet } = stage();
  walker.root.rotation.y = -Math.PI / 2; // facing +Z (heading 90)
  walker.root.updateMatrixWorld(true);
  const prints = createFootprints(world, { actor: walker, feet: FEET });
  for (let i = 0; i < 10; i++) frame(world);
  assert.equal(prints.mesh.count, 0, 'standing still presses nothing');
  stepWith(world, feet.BackFootL);
  assert.equal(prints.mesh.count, 1, 'one step, one print');
  assert.equal(prints.prints.length, 1);
  const bone = feet.BackFootL.getWorldPosition(new THREE.Vector3());
  const [print] = prints.prints;
  assert.ok(Math.abs(print.x - bone.x) < 1e-6 && Math.abs(print.z - (bone.z - 0.35)) < 1e-6, 'behind the ankle, the way he faces being +Z');
  const matrix = new THREE.Matrix4();
  prints.mesh.getMatrixAt(0, matrix);
  const toes = new THREE.Vector3(1, 0, 0).transformDirection(matrix);
  assert.ok(toes.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-6, 'its toes point the way he walks');
  const scale = new THREE.Vector3().setFromMatrixScale(matrix);
  assert.ok(Math.abs(scale.x - 1.1) < 1e-6 && Math.abs(scale.z - 1.1) < 1e-6, 'at the size asked for that foot');
  stepWith(world, feet.FrontFootR);
  assert.equal(prints.mesh.count, 2);
});

test('a print lies on the slope it is pressed into, just above the ground', () => {
  const { world, walker, feet } = stage({ slope: 0.2 });
  const prints = createFootprints(world, { actor: walker, feet: FEET });
  stepWith(world, feet.FrontFootL);
  const matrix = new THREE.Matrix4();
  prints.mesh.getMatrixAt(0, matrix);
  const at = new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.ok(at.y - world.heightAt(at.x) > 0 && at.y - world.heightAt(at.x) < 0.03, `${(at.y - world.heightAt(at.x)).toFixed(3)} m above the ground`);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
  const slope = new THREE.Vector3(-0.2, 1, 0).normalize();
  assert.ok(up.distanceTo(slope) < 1e-3, 'tilted with the ground');
});

test('a print is pressed in quickly, lies a while and fades away', () => {
  assert.equal(printLevel(-1), 0, 'not before its foot comes down');
  assert.ok(printLevel(0.05) > 0 && printLevel(0.05) < 1, 'darkening as the foot comes down');
  assert.equal(printLevel(1), 1);
  assert.equal(printLevel(13), 1, 'it lies as it was a good while');
  assert.ok(printLevel(15) > 0 && printLevel(15) < 1, 'and then fades');
  assert.equal(printLevel(PRINT_SECONDS + 0.01), 0, 'until it is gone');
  const { world, walker, feet } = stage();
  const prints = createFootprints(world, { actor: walker, feet: FEET });
  stepWith(world, feet.BackFootR);
  assert.equal(prints.prints.length, 1);
  for (let t = 0; t < PRINT_SECONDS + 0.5; t += 1 / 30) frame(world);
  assert.equal(prints.prints.length, 0, 'a print that has faded is no longer listed');
  assert.ok(Math.abs(prints.mesh.material.uniforms.uTime.value - world.clock.time) < 1e-9, 'the shader ages them on the game clock');
});

test('at most `max` prints at a time: the oldest makes way', () => {
  const { world, walker, feet } = stage();
  const prints = createFootprints(world, { actor: walker, feet: FEET, max: 4 });
  for (let i = 0; i < 6; i++) stepWith(world, feet.FrontFootL);
  assert.equal(prints.mesh.count, 4);
  assert.equal(prints.prints.length, 4);
  const born = prints.prints.map(p => p.born);
  assert.deepEqual([...born].sort((a, b) => a - b), born, 'the newest four, in order');
});

test('all the prints are one draw call, about 150 triangles a print, and dispose takes them away', () => {
  const { world, walker } = stage();
  const prints = createFootprints(world, { actor: walker, feet: FEET });
  const meshes = [];
  world.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 1, 'one mesh');
  assert.ok(meshes[0].isInstancedMesh, 'an instance a print');
  assert.equal(meshes[0].castShadow, false, 'pressed into the ground, it casts nothing');
  const triangles = prints.mesh.geometry.index.count / 3;
  assert.ok(triangles <= 160, `${triangles} triangles a print`);
  assert.ok(prints.mesh.material.blending === THREE.MultiplyBlending && prints.mesh.material.premultipliedAlpha, 'it darkens the soil as it is lit');
  const freed = [];
  prints.mesh.addEventListener('dispose', () => freed.push('instances'));
  prints.mesh.geometry.addEventListener('dispose', () => freed.push('geometry'));
  prints.mesh.material.addEventListener('dispose', () => freed.push('material'));
  prints.dispose();
  world.effects.update(1 / 30);
  assert.equal(world.effects.size, 0, 'the effect stopped');
  assert.equal(prints.mesh.parent, null, 'out of the scene');
  assert.deepEqual(freed.sort(), ['geometry', 'instances', 'material'], 'and its GPU buffers are freed, the instance matrices too (each place change makes new prints)');
  prints.dispose();
  assert.equal(freed.length, 3, 'once');
});

test('footprints need a walker with the bones they follow, and a game clock', () => {
  const { world, walker } = stage();
  assert.throws(() => createFootprints(world, { actor: null, feet: FEET }), /actor/);
  assert.throws(() => createFootprints(world, { actor: walker, feet: [] }), /feet/);
  assert.throws(() => createFootprints(world, { actor: walker, feet: [{ bone: 'Tail' }] }), /Tail/);
  assert.throws(() => createFootprints({ scene: world.scene, effects: world.effects }, { actor: walker, feet: FEET }), /clock/);
});
