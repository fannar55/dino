// The flight camera (engine/camera/flight-camera.js): bound shots ride with Flugeðla and lean a third of her bank (never past 8
// degrees), fixed shots stand still and turn to keep her in view, and the flight's own rules are linted into director.warnings. Every
// named shot frames her and Egill whole, on a 16:10 screen and on an upright tablet, with the camera never inside her.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chapterWorld } from './chapter-harness.mjs';
import { updateActors } from '../engine/actor.js';
import { createDirector } from '../engine/camera/director.js';
import { createFlier, rideFlier } from '../engine/flier.js';
import { createFlightCamera, FLIGHT_RULES } from '../engine/camera/flight-camera.js';
import { createRoute, BEATS } from '../chapters/kafli4-route.js';
import { createTerrain } from '../world/ardalur/terrain.js';

const deg = THREE.MathUtils.radToDeg;
const world = await chapterWorld({
  look: 'lateMorning',
  actors: { flugedla: { url: '../assets/characters/pteranodon.glb' }, egill: { url: '../assets/characters/egill.glb' } },
});
const flugedla = world.actors.get('flugedla');
const egill = world.actors.get('egill');
const route = createRoute();
world.heightAt = createTerrain(route).heightAt; // the valley's ground, for the camera's floor and the fixed shots
const DT = 1 / 30;

function setUp({ reduced = false } = {}) {
  world.camera.aspect = 1.6;
  world.camera.updateProjectionMatrix();
  const director = createDirector({ camera: world.camera, world, lint: false });
  const flier = createFlier(flugedla, route, { world, reduced });
  const riding = rideFlier(egill, flier);
  const camera = createFlightCamera(director, flier, { world, egill, reduced });
  let t = 0;
  const to = (time, each = () => {}) => {
    for (; t <= time + 1e-9; t += DT) {
      flier.update(t);
      updateActors(world.actors.values(), DT);
      director.update(DT);
      each(t);
    }
  };
  const at = time => { t = time; flier.update(t); updateActors(world.actors.values(), DT); };
  const done = () => { riding.stop(); flier.stop(); };
  return { director, flier, camera, to, at, done, flight: () => director.warnings.filter(w => w.message.startsWith('flight:')) };
}

test('roll follows a third of her bank and never exceeds 8 degrees', () => {
  const { director, flier, camera, to, at, done, flight } = setUp();
  at(6);
  camera.shot('chase');
  let most = 0;
  let checked = 0;
  to(BEATS.END - 1, t => {
    assert.ok(Math.abs(camera.roll) <= FLIGHT_RULES.roll + 1e-9, `t=${t.toFixed(1)}: roll ${camera.roll}`);
    if (Math.abs(flier.bank) < 3 * FLIGHT_RULES.roll - 1) {
      assert.ok(Math.abs(camera.roll - flier.bank / 3) < 0.6, `t=${t.toFixed(1)}: roll ${camera.roll.toFixed(2)} for a bank of ${flier.bank.toFixed(1)}`);
    }
    most = Math.max(most, Math.abs(camera.roll));
    if (Math.abs(camera.roll) > 2) {
      // the camera itself leans: its right side goes down as she banks right
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(world.camera.quaternion);
      assert.equal(Math.sign(right.y), -Math.sign(camera.roll), `t=${t.toFixed(1)}`);
      checked++;
    }
  });
  assert.ok(most > 5 && checked > 10, `it leans (at most ${most.toFixed(1)} degrees)`);
  assert.deepEqual(flight(), [], 'a chase that rides with her keeps the rules');
  assert.equal(director.mode, 'drive');
  done();
});

test('a shot shorter than 2.5 s warns, a quick one of 1.5 s does not, the fourth quick one does', () => {
  const { camera, to, at, done, flight } = setUp();
  at(80);
  camera.shot('chase');
  to(82);
  camera.shot('face');
  assert.equal(flight().length, 1);
  assert.match(flight()[0].message, /shot "chase" lasted 2\.0\d s \(min 2\.5 s\)/);
  to(85);
  for (let i = 0; i < 3; i++) {
    camera.shot(i % 2 ? 'face' : 'chase', { quick: true });
    to(85 + 1.55 * (i + 1));
  }
  camera.shot('side');
  assert.equal(flight().length, 1, 'three quick shots of 1.5 s are allowed');
  to(92.5);
  camera.shot('chase', { quick: true });
  assert.equal(flight().length, 2);
  assert.match(flight()[1].message, /quick shot number 4/);
  done();
});

test('a fixed shot panning faster than 40 deg/s warns', () => {
  const calm = setUp();
  calm.at(24);
  calm.camera.shot('waterLevel'); // 11 m off her path, 4.5 s ahead of her
  calm.to(27.5);
  calm.camera.shot('chase');
  assert.deepEqual(calm.flight(), [], 'a fixed shot placed well keeps the rules');
  calm.done();

  const close = setUp();
  close.at(24);
  close.camera.shot('waterLevel', { across: 1.5, lead: 2 }); // right in her way: she shoots past it
  close.to(28);
  assert.ok(close.flight().some(w => /fixed shot "waterLevel" pans \d+\.\d deg\/s \(max 40\)/.test(w.message)), JSON.stringify(close.flight()));
  close.done();
});

test('the orbit circles slowly, and under reduced motion it is the vista instead', () => {
  const { director, camera, to, at, done, flight } = setUp();
  at(132);
  camera.shot('orbit');
  const from = director.rig.position.clone().sub(route.pointAt(route.progressAt(132)));
  to(148.2);
  camera.stop();
  assert.deepEqual(flight(), [], 'within 1.2 m/s and 15 deg/s of her');
  done();

  const calm = setUp({ reduced: true });
  calm.at(132);
  calm.camera.shot('orbit');
  const start = calm.director.rig.position.clone();
  calm.to(136);
  assert.ok(calm.director.rig.position.distanceTo(start) < 1e-9, 'a fixed camera');
  calm.done();
  assert.ok(from.length() > 5);
});

// When each shot is used in the flight (spec 5, chapters/kafli4-flight.js), and when to look.
const WHEN = {
  chase: [20, 40], face: [83, 86], side: [47, 50], orbit: [134, 141],
  belowTakeOff: [3, 5.5], waterLevel: [25, 27.5], bankShadow: [63, 66], mosiBank: [57.5, 60],
  gorgeHigh: [90.5, 93], mosiRim: [95.5, 97], fallsSide: [110, 113], vista: [125, 128],
};

test('every named shot frames her and Egill at 16:10 and at an upright 0.625, and is never inside her', () => {
  const head = flugedla.model.getObjectByName('Head');
  const neck = flugedla.model.getObjectByName('Neck');
  const hips = flugedla.model.getObjectByName('Hips');
  const { camera, director, to, at, done } = setUp();
  assert.deepEqual([...camera.shots].sort(), Object.keys(WHEN).sort());
  for (const [name, [start, look]] of Object.entries(WHEN)) {
    at(start);
    camera.shot(name);
    to(look);
    for (const aspect of [1.6, 0.625]) {
      world.camera.aspect = aspect;
      world.camera.updateProjectionMatrix();
      director.apply();
      world.scene.updateMatrixWorld(true);
      const where = p => { const q = p.clone().project(world.camera); return { x: q.x, v: (1 - q.y) / 2, z: q.z }; };
      const egillHead = where(egill.headPosition(new THREE.Vector3()));
      const herHead = where(head.getWorldPosition(new THREE.Vector3()));
      const body = where(flugedla.root.localToWorld(new THREE.Vector3(0.06, 2.6, 0)));
      for (const [who, p] of [['Egill\'s head', egillHead], ['her head', herHead], ['her body', body]]) {
        assert.ok(p.z < 1 && Math.abs(p.x) < 0.95 && p.v > 0.08 && p.v < 0.97, `${name} at ${aspect}: ${who} at x ${p.x.toFixed(2)}, v ${p.v.toFixed(2)}`);
      }
      for (const [who, p] of [['Egill\'s head', egillHead], ['her head', herHead]]) assert.ok(p.v < 0.7, `${name} at ${aspect}: ${who} in the bottom 30 % (v ${p.v.toFixed(2)})`);
    }
    world.camera.aspect = 1.6;
    world.camera.updateProjectionMatrix();
    const cam = world.camera.position;
    for (const [who, bone, least] of [['her head', head, 1.0], ['her neck', neck, 1.0], ['her body', hips, 1.5]]) {
      const d = cam.distanceTo(bone.getWorldPosition(new THREE.Vector3()));
      assert.ok(d > least, `${name}: the camera ${d.toFixed(2)} m from ${who}`);
    }
    assert.ok(cam.distanceTo(egill.headPosition(new THREE.Vector3())) > 0.8, `${name}: the camera in Egill's face`);
    assert.ok(cam.y > (world.heightAt?.(cam.x, cam.z) ?? -Infinity), `${name}: under the ground`);
  }
  done();
});
