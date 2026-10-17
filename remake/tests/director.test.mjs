import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDirector } from '../engine/camera/director.js';
import { createPointResolver } from '../engine/points.js';

function makeWorld(aspect = 1.6) {
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
  const root = new THREE.Object3D();
  const actor = {
    root,
    centre: (out = new THREE.Vector3()) => out.copy(root.position).add(new THREE.Vector3(0, 1, 0)),
    headPosition: (out = new THREE.Vector3()) => out.copy(root.position).add(new THREE.Vector3(1.5, 1.4, 0)),
  };
  const world = { camera, heightAt: () => 0, actors: new Map([['mosi', actor]]) };
  world.resolvePoint = createPointResolver(world);
  return { world, camera, actor };
}

function director(aspect, shots = {}) {
  const env = makeWorld(aspect);
  env.director = createDirector({ camera: env.camera, world: env.world, shots, lint: false });
  return env;
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const nearVec = (v, [x, y, z], eps = 1e-6) => near(v.x, x, eps) && near(v.y, y, eps) && near(v.z, z, eps);

function screenOf(point, camera) {
  const p = point.clone().project(camera);
  return [(p.x + 1) / 2, (1 - p.y) / 2];
}

function aimOf(camera) {
  return camera.getWorldDirection(new THREE.Vector3());
}

test('cut puts the camera exactly on a named shot', () => {
  const { director: d, camera } = director(1.6, { a: { position: [5, 2, 5], target: [0, 1, 0], fov: 38 } });
  d.cut('a');
  assert.ok(nearVec(camera.position, [5, 2, 5]));
  assert.equal(camera.fov, 38);
  const want = new THREE.Vector3(-5, -1, -5).normalize();
  assert.ok(aimOf(camera).distanceTo(want) < 1e-6);
});

test('the authored 16:10 frame stays fully visible on narrower screens', () => {
  const { director: d, camera } = director(4 / 3);
  d.cut({ position: [0, 1, 5], target: [0, 1, 0], fov: 40 });
  const halfWidth = f => Math.atan(Math.tan(THREE.MathUtils.degToRad(f) / 2));
  const authored = Math.atan(Math.tan(THREE.MathUtils.degToRad(40) / 2) * 1.6);
  const actual = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (4 / 3));
  assert.ok(camera.fov > 40, `fov ${camera.fov}`);
  assert.ok(near(authored, actual), `${authored} vs ${actual} (${halfWidth(camera.fov)})`);
  camera.aspect = 16 / 9;
  d.update(0);
  assert.equal(camera.fov, 40, 'a wider screen keeps the authored lens and sees more at the sides');
});

test('frame places the subject at the requested screen position on every aspect', () => {
  for (const aspect of [1.6, 4 / 3, 16 / 9]) {
    const { director: d, camera, actor } = director(aspect);
    actor.root.position.set(1, 0, -2);
    d.cut({ position: [6, 1.2, 4], frame: { subject: 'mosi.head', screen: [0.33, 0.4] }, fov: 40 });
    const [u, v] = screenOf(actor.headPosition(), camera);
    assert.ok(near(u, 0.33, 2e-3) && near(v, 0.4, 2e-3), `aspect ${aspect.toFixed(2)}: ${u.toFixed(4)}, ${v.toFixed(4)}`);
  }
});

test('a move eases from start to end and then finishes its handle', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1, 10], target: [0, 1, 0], fov: 40 });
  const handle = d.move({ position: [4, 1, 10], target: [0, 1, 0], fov: 40 }, { duration: 4 });
  d.update(1);
  assert.ok(camera.position.x > 0 && camera.position.x < 1, 'slow start');
  d.update(1);
  assert.ok(near(camera.position.x, 2, 1e-9), 'halfway at half time');
  assert.equal(handle.done, false);
  d.update(2);
  assert.equal(handle.done, true);
  assert.ok(nearVec(camera.position, [4, 1, 10]));
  assert.equal(d.mode, 'hold');
});

test('moves that break the STYLE.md speed rules are reported, gentle ones are not', () => {
  const { director: d } = director();
  d.cut({ position: [0, 1, 10], target: [0, 1, 0], fov: 40 });
  d.move({ position: [1, 1, 10], target: [0, 1, 0], fov: 40 }, { duration: 6 });
  d.update(6);
  assert.equal(d.warnings.length, 0);
  d.move({ position: [12, 1, 10], target: [0, 1, 0], fov: 40 }, { duration: 2 });
  assert.match(d.warnings.at(-1).message, /too fast: dolly/);
  d.move({ position: [12, 1, 10], target: [0, 1, 0], fov: 20 }, { duration: 1 });
  assert.match(d.warnings.at(-1).message, /zoom/);
});

test('a move without a duration takes long enough to respect the speed limits', () => {
  const { director: d } = director();
  d.cut({ position: [0, 1, 10], target: [0, 1, 0], fov: 40 });
  d.move({ position: [8, 1, 10], target: [0, 1, 0], fov: 40 });
  assert.equal(d.warnings.length, 0);
});

test('cuts closer than 2.5 s apart are reported unless the check is off', () => {
  const { director: d } = director(1.6, { a: { position: [0, 1, 5], target: [0, 1, 0] }, b: { position: [5, 1, 0], target: [0, 1, 0] } });
  d.cut('a', { check: false });
  d.cut('a');
  assert.equal(d.warnings.length, 0);
  d.update(1);
  d.cut('b');
  assert.match(d.warnings.at(-1).message, /after the previous cut/);
  d.update(3);
  d.cut('a');
  assert.equal(d.warnings.length, 1);
});

test('cancelling a move holds the camera where it is', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1, 10], target: [0, 1, 0] });
  const handle = d.move({ position: [4, 1, 10], target: [0, 1, 0] }, { duration: 4 });
  d.update(1);
  const where = camera.position.clone();
  handle.cancel();
  d.update(1);
  assert.ok(camera.position.distanceTo(where) < 1e-9);
  assert.equal(d.mode, 'still');
});

test('a held shot keeps tracking a moving actor', () => {
  const { director: d, camera, actor } = director();
  d.cut({ position: [5, 2, 5], target: 'mosi' });
  actor.root.position.set(3, 0, -1);
  d.update(0.1);
  const want = new THREE.Vector3(3, 1, -1).sub(camera.position).normalize();
  assert.ok(aimOf(camera).distanceTo(want) < 1e-6);
});

test('follow settles at its offset without ever outrunning its speed cap', () => {
  const { director: d, camera, actor } = director();
  actor.root.position.set(2, 0, 0);
  d.cut({ position: [10, 3, 10], target: [0, 1, 0] });
  d.follow('mosi', { offset: [0, 1.4, 6], maxSpeed: 2 });
  let previous = camera.position.clone();
  let fastest = 0;
  for (let i = 0; i < 600; i++) {
    d.update(1 / 30);
    fastest = Math.max(fastest, camera.position.distanceTo(previous) * 30);
    previous = camera.position.clone();
  }
  assert.ok(nearVec(camera.position, [2, 1.4, 6], 1e-3), camera.position.toArray().join(', '));
  assert.ok(fastest <= 2 + 1e-6, `fastest ${fastest}`);
});

test('orbit circles the subject at a constant radius and ends at the requested angle', () => {
  const { director: d, camera } = director();
  d.cut({ position: [6, 1, 0], target: 'mosi' });
  const handle = d.orbit({ around: 'mosi', degrees: 90, duration: 15 }); // peak 9.4 deg/s, inside the 10 deg/s rule
  for (let i = 0; i < 150; i++) {
    d.update(0.1);
    const radius = Math.hypot(camera.position.x, camera.position.z);
    assert.ok(near(radius, 6, 1e-9), `radius ${radius}`);
  }
  assert.equal(handle.done, true);
  assert.ok(nearVec(camera.position, [0, 1, 6], 1e-9));
  assert.equal(d.warnings.length, 0);
});

test('push dollies along the view toward the target', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1, 10], target: [0, 1, 0] });
  d.push({ distance: 2, duration: 2 });
  d.update(2);
  assert.ok(nearVec(camera.position, [0, 1, 8]));
});

test('handheld breathing stays inside the style guide limits', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1, 10], target: [0, 1, 0] });
  d.handheld(1, { duration: 0.01 });
  const still = new THREE.Vector3(0, 0, -1);
  let maxAngle = 0;
  let maxShift = 0;
  for (let i = 0; i < 600; i++) {
    d.update(1 / 30);
    maxAngle = Math.max(maxAngle, THREE.MathUtils.radToDeg(aimOf(camera).angleTo(still)));
    maxShift = Math.max(maxShift, camera.position.distanceTo(new THREE.Vector3(0, 1, 10)));
  }
  assert.ok(maxAngle > 0.01 && maxAngle <= 0.25, `angle ${maxAngle}`);
  assert.ok(maxShift <= 0.015, `shift ${maxShift}`);
});

test('a near half-turn pan stays level instead of swinging over the top', () => {
  for (const lift of [0.17, -0.26]) {
    const { director: d, camera } = director();
    d.cut({ position: [0, 1.2, 0], target: [10, 1.2, 0] });
    const handle = d.lookAt([-10, 1.2 + lift, 0.01], { duration: 20 });
    let steepest = 0;
    let previous = aimOf(camera);
    let fastest = 0;
    while (!handle.done) {
      d.update(1 / 30);
      const now = aimOf(camera);
      steepest = Math.max(steepest, Math.abs(THREE.MathUtils.radToDeg(Math.asin(now.y))));
      fastest = Math.max(fastest, THREE.MathUtils.radToDeg(now.angleTo(previous)) * 30);
      previous = now;
    }
    assert.ok(steepest < 2, `lift ${lift}: pitch reached ${steepest.toFixed(1)} degrees`);
    assert.ok(fastest < 20, `lift ${lift}: turned ${fastest.toFixed(0)} deg/s at the worst frame`);
  }
});

test('zoom during a move builds on where the move is going', () => {
  const { director: d, camera } = director(1.6, { a: { position: [0, 1.2, 10], target: [0, 1, 0], fov: 40 }, b: { position: [4, 1.2, 7], target: [0, 1, 0], fov: 40 } });
  d.cut('a');
  d.move('b', { duration: 6 });
  d.update(3);
  d.zoom(30, { duration: 4 });
  d.update(4);
  assert.ok(nearVec(camera.position, [4, 1.2, 7], 1e-6), camera.position.toArray().join(', '));
  assert.equal(camera.fov, 30);
});

test('a cut that interrupts a move keeps tracking its actor through a later zoom', () => {
  const { director: d, camera, actor } = director();
  d.cut({ position: [0, 1.2, 10], target: [0, 1, 0] });
  d.move({ position: [3, 1.2, 9], target: [0, 1, 0] }, { duration: 6 });
  d.update(1);
  d.cut({ position: [5, 1.5, 5], target: 'mosi' }, { check: false });
  d.zoom(30, { duration: 2 });
  d.update(2);
  actor.root.position.set(-3, 0, 2);
  d.update(0.5);
  const want = new THREE.Vector3(-3, 1, 2).sub(camera.position).normalize();
  assert.ok(aimOf(camera).angleTo(want) < 1e-6);
});

test('frame is exact for a subject far above or below the camera', () => {
  for (const [height, screen] of [[3.2, [0.3, 0.3]], [-1.4, [0.62, 0.55]]]) {
    const { director: d, camera, actor } = director();
    actor.root.position.set(0, height - 1.4, 0);
    d.cut({ position: [2.6, 0.4, 0.8], frame: { subject: 'mosi.head', screen }, fov: 44 });
    const [u, v] = screenOf(actor.headPosition(), camera);
    assert.ok(near(u, screen[0], 1e-4) && near(v, screen[1], 1e-4), `${u.toFixed(4)}, ${v.toFixed(4)} for ${screen}`);
  }
});

test('an orbit that changes its radius too fast is reported, and follow stays inside the dolly rule', () => {
  const { director: d, camera, actor } = director();
  d.cut({ position: [8, 1.2, 0], target: 'mosi' });
  d.orbit({ around: 'mosi', degrees: 10, duration: 1.5, radius: 2, height: 2.5 });
  assert.match(d.warnings.at(-1).message, /orbit is too fast/);
  d.cut({ position: [20, 1.4, 20], target: 'mosi' }, { check: false });
  d.follow('mosi', { offset: [0, 1.4, 6] });
  let previous = camera.position.clone();
  let fastest = 0;
  for (let i = 0; i < 300; i++) {
    actor.root.position.x += 0.02;
    d.update(1 / 30);
    fastest = Math.max(fastest, camera.position.distanceTo(previous) * 30);
    previous = camera.position.clone();
  }
  assert.ok(fastest <= 1.2 + 1e-6, `follow moved at ${fastest.toFixed(2)} m/s`);
});

test('a broken shot throws before it replaces the current one, and a lost actor stops the mode quietly', () => {
  const { world, camera, director: d } = director();
  d.cut({ position: [0, 1.2, 10], target: [0, 1, 0] });
  assert.throws(() => d.cut({ position: [4, 1.2, 4], target: 'egill' }), /No actor named "egill"/);
  assert.equal(d.mode, 'hold');
  d.update(0.1);
  assert.ok(nearVec(camera.position, [0, 1.2, 10]));
  d.cut({ position: [4, 1.4, 4], target: 'mosi' }, { check: false });
  world.actors.delete('mosi');
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    d.update(0.1);
    d.update(0.1);
  } finally {
    console.error = original;
  }
  assert.equal(d.mode, 'still');
  assert.equal(errors.length, 1);
});

test('handheld returns a handle that finishes when its fade does', () => {
  const { director: d } = director();
  d.cut({ position: [0, 1, 10], target: [0, 1, 0] });
  const handle = d.handheld(0.6, { duration: 1 });
  d.update(0.5);
  assert.equal(handle.done, false);
  d.update(0.6);
  assert.equal(handle.done, true);
  assert.ok(near(d.handheldLevel, 0.6));
});

test('shots that break the static rules are reported', () => {
  const { director: d } = director();
  d.cut({ position: [0, 12, 0.5], target: [0, 0, 0] });
  assert.match(d.warnings.map(w => w.message).join(' | '), /m up .* \| .*degrees down/);
  d.cut({ position: [0, 1.2, 8], frame: { subject: 'mosi', screen: [0.5, 0.85] }, fov: 40 }, { check: false });
  assert.match(d.warnings.at(-1).message, /frames its subject at v 0.85/);
  d.move({ position: [1, 1.2, 8], target: [0, 1, 0] }, { duration: 4, ease: 'linear' });
  assert.match(d.warnings.map(w => w.message).join(' | '), /is linear/);
});
