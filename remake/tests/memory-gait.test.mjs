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
test('all four real rigs plant feet while moving forwards/backwards on flat and inclined ground', async () => {
  const actors = await createBabyActors({ scene: new THREE.Scene(), length: 2.6, instancesPerSpecies: 1, loader });
  try {
    for (const actor of actors) for (const direction of [1, -1]) for (const grade of [0, .18]) {
      // The winged friend walks on two legs at about half the quadrupeds' pace, so her feet are down for fewer samples.
      const speed = actor.species === 'pteranodon' ? 1.6 : 2.9, plants = actor.species === 'pteranodon' ? 250 : 400;
      actor.root.scale.setScalar(actor.species === 'brontosaurus' ? 1.2 : 1);
      actor.root.position.set(0, 0, 0); actor.root.rotation.set(0, 0, Math.atan(grade));
      actor.reveal(); for (let i = 0; i < 60; i++) actor.update(1 / 60);
      actor.walk(true);
      const feet = []; actor.model.traverse(bone => { if (bone.isBone && /Foot/.test(bone.name)) feet.push(bone); });
      const samples = [];
      for (let frame = 0; frame < 360; frame++) {
        actor.root.position.x += direction * speed / 60; actor.root.position.y = grade * actor.root.position.x;
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
      assert.ok(slips.length > plants, `${label}: feet repeatedly plant`);
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

// The winged friend's flight helpers run on the game clock: a path from where she stands (taking off first), a hover at its end, a landing
// on a point, and the same walk afterwards. A friend with no wings refuses.
test('the Flugeðla takes off, flies a path, lands on a point and walks again, on the game clock', async () => {
  const actors = await createBabyActors({ scene: new THREE.Scene(), length: 2.6, instancesPerSpecies: 1, species: ['pteranodon', 'triceratops'], loader });
  const [bird, walker] = actors;
  try {
    const hips = bird.model.getObjectByName('Hips'), rise = () => { bird.root.updateMatrixWorld(true); return hips.getWorldPosition(new THREE.Vector3()).y - bird.root.position.y; };
    bird.reveal(); for (let i = 0; i < 160; i++) bird.update(1 / 60);
    const standing = rise();
    assert.equal(walker.fly([[1, 0, 0]]), false, 'a friend without wings does not fly');
    assert.equal(bird.fly([]), false, 'a path needs a point');
    const end = new THREE.Vector3(7, .8, 2), seen = new Set(); let arrived = 0, landed = 0, peak = 0;
    assert.equal(bird.fly([[2, .2, 0], [4.5, .5, 1.5], end.toArray()], { speed: 2.4, onDone: () => { arrived++; } }), true);
    assert.equal(bird.land([8, .8, 2], { yaw: 0, onDone: () => { landed++; } }), true);
    bird.carry(true); assert.equal(bird.getFlight().carrying, true); bird.carry(false);
    let held = false;
    for (let frame = 0; frame < 60 * 30 && bird.getFlight(); frame++) {
      bird.update(1 / 60); const flight = bird.getFlight(); if (!flight) break;
      seen.add(flight.phase); peak = Math.max(peak, rise());
      if (!held && flight.phase === 'cruise') {
        held = true; const place = bird.root.position.toArray().join(), moment = rise();
        bird.update(0); assert.equal(bird.root.position.toArray().join(), place, 'a paused frame holds her in the air'); assert.equal(rise(), moment);
      }
    }
    assert.deepEqual([...seen], ['takeoff', 'cruise', 'landing'], 'the phases she passed');
    assert.ok(peak > 1.8 * standing, `flying height ${peak.toFixed(2)} against standing ${standing.toFixed(2)}`);
    assert.deepEqual([arrived, landed], [1, 1], 'each callback once');
    assert.equal(bird.getFlight(), null); assert.equal(bird.getDebugState().motion, 'idle');
    assert.ok(bird.root.position.distanceTo(new THREE.Vector3(8, .8, 2)) < 1e-6, 'she stands on the landing point');
    for (let i = 0; i < 90; i++) bird.update(1 / 60);
    assert.ok(Math.abs(rise() - standing) < .03, 'back on her feet');
    // Hovering at the end of a path (no landing asked for) and a restart that cancels the flight.
    bird.fly([[10, .8, 2]], { glide: true }); for (let i = 0; i < 60 * 8; i++) bird.update(1 / 60);
    assert.equal(bird.getFlight().phase, 'hover');
    bird.conceal(); assert.equal(bird.getFlight(), null); bird.reveal();
    bird.walk(true); for (let i = 0; i < 30; i++) bird.update(1 / 60); assert.equal(bird.getDebugState().motion, 'walk');
  } finally { actors.forEach(actor => actor.dispose()); }
});
