import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './setup.mjs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { createBabyActors } from '../engine/memory/baby-actors.js';

globalThis.self = globalThis;
const gltf = new GLTFLoader();
gltf.register(() => ({ name: 'SKIP_IMAGES', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
const loader = { async loadAsync(url) {
  const bytes = await readFile(new URL(url));
  return gltf.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
} };

// Measure actual rig feet in world space. Reading an animation clock alone
// would miss the sliding and stretched legs that prompted this regression.
test('all three real rigs plant feet while moving forwards/backwards on flat and inclined ground', async () => {
  const actors = await createBabyActors({ scene: new THREE.Scene(), length: 2.6, instancesPerSpecies: 1, loader });
  try {
    for (const actor of actors) for (const direction of [1, -1]) for (const grade of [0, .18]) {
      actor.root.scale.setScalar(actor.species === 'brontosaurus' ? 1.2 : 1);
      actor.root.position.set(0, 0, 0); actor.root.rotation.set(0, 0, Math.atan(grade));
      actor.reveal(); for (let i = 0; i < 60; i++) actor.update(1 / 60);
      actor.walk(true);
      const feet = []; actor.model.traverse(bone => { if (bone.isBone && /Foot/.test(bone.name)) feet.push(bone); });
      const samples = [];
      for (let frame = 0; frame < 360; frame++) {
        actor.root.position.x += direction * 2.9 / 60; actor.root.position.y = grade * actor.root.position.x;
        actor.update(1 / 60); actor.root.updateMatrixWorld(true);
        samples.push(feet.map(foot => { const p = foot.getWorldPosition(new THREE.Vector3()); return { p, height: p.y - grade * p.x }; }));
      }
      const slips = [], lifts = [];
      for (let k = 0; k < feet.length; k++) {
        const floor = Math.min(...samples.slice(60).map(frame => frame[k].height));
        for (let frame = 61; frame < samples.length; frame++) {
          const before = samples[frame - 1][k], after = samples[frame][k]; lifts.push(after.height - floor);
          if (before.height - floor < .012 && after.height - floor < .012) slips.push(before.p.distanceTo(after.p) * 60);
        }
      }
      slips.sort((a, b) => a - b);
      const label = `${actor.species}, direction ${direction}, grade ${grade}`;
      assert.ok(slips.length > 400, `${label}: feet repeatedly plant`);
      assert.ok(slips[Math.floor(slips.length / 2)] < .05, `${label}: planted feet stay in world space`);
      assert.ok(Math.max(...lifts) < .13, `${label}: incline does not stretch feet off the ground`);
      const frozen = feet.map(foot => foot.getWorldPosition(new THREE.Vector3()).toArray());
      actor.update(0);
      assert.deepEqual(feet.map(foot => foot.getWorldPosition(new THREE.Vector3()).toArray()), frozen, `${label}: pause preserves feet`);
      actor.update(1 / 60);
      assert.equal(actor.getDebugState().gait.rate, 0, `${label}: walking stops when translation stops`);
    }
  } finally { actors.forEach(actor => actor.dispose()); }
});
