import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDirector, LIMITS } from '../engine/camera/director.js';
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

// Free look. Angles are the director's own: yaw from +x toward +z, pitch up.
const deg = THREE.MathUtils.radToDeg;
const rad = THREE.MathUtils.degToRad;

/** How far the camera has turned from the direction `base`, in degrees. */
function turnedFrom(base, camera) {
  const now = aimOf(camera);
  const yaw = Math.atan2(now.z, now.x) - Math.atan2(base.z, base.x);
  return { yaw: deg(Math.atan2(Math.sin(yaw), Math.cos(yaw))), pitch: deg(Math.asin(now.y) - Math.asin(base.y)) };
}

/** `seconds` of frames at 30 fps. */
function run(d, seconds) {
  for (let i = 0; i < Math.round(seconds * 30); i++) d.update(1 / 30);
}

test('explore clamps yaw and pitch to its limits', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.5, 0], target: [10, 0.5, 4] }); // neither level nor square to an axis: the limits are around this view
  const start = aimOf(camera);
  const reach = d.rig.target.distanceTo(d.rig.position);
  const handle = d.explore({ yaw: [-30, 20], pitch: [-10, 15] });
  assert.equal(d.mode, 'explore');
  assert.equal(handle.done, false);

  // Drag hard each way and let the view settle. It stays inside the limits all the way, not only at the end.
  const drag = (dx, dy) => {
    d.look(dx, dy);
    let turn;
    for (let i = 0; i < 90; i++) {
      d.update(1 / 30);
      turn = turnedFrom(start, camera);
      assert.ok(turn.yaw >= -30 - 1e-6 && turn.yaw <= 20 + 1e-6 && turn.pitch >= -10 - 1e-6 && turn.pitch <= 15 + 1e-6, JSON.stringify(turn));
    }
    return turn;
  };
  let turn = drag(-100000, 0); // the finger far to the left: the view turns toward +z
  assert.ok(near(turn.yaw, 20, 1e-3), `yaw ${turn.yaw}`);
  turn = drag(100000, 0);
  assert.ok(near(turn.yaw, -30, 1e-3), `yaw ${turn.yaw}`);
  turn = drag(0, 100000); // the finger far down: the view tilts up
  assert.ok(near(turn.pitch, 15, 1e-3), `pitch ${turn.pitch}`);
  turn = drag(0, -100000);
  assert.ok(near(turn.pitch, -10, 1e-3), `pitch ${turn.pitch}`);
  turn = drag(-100000, 100000); // into a corner
  assert.ok(near(turn.yaw, 20, 1e-3) && near(turn.pitch, 15, 1e-3), JSON.stringify(turn));
  assert.ok(nearVec(camera.position, [0, 1.5, 0]), 'the camera only turns');
  assert.ok(near(d.rig.target.distanceTo(d.rig.position), reach, 1e-9), 'and what it aims at stays as far, so the sun\'s shadow focus does not drift');
});

test('look moves the world with the finger, a speed in degrees per pixel', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0], fov: 40 });
  d.explore({ yaw: [-60, 60], pitch: [-30, 30], speed: 0.2 });
  const ahead = new THREE.Vector3(0, 1.4, 0); // dead centre to begin with
  assert.ok(near(screenOf(ahead, camera)[0], 0.5, 1e-9));

  d.look(75, 0); // 75 px to the right is 15 degrees: the view turns left and the world slides right
  run(d, 2);
  const tanV = Math.tan(rad(20));
  const tanH = tanV * 1.6;
  const [u, v] = screenOf(ahead, camera);
  assert.ok(near(u, (Math.tan(rad(15)) / tanH + 1) / 2, 1e-6) && near(v, 0.5, 1e-6), `${u}, ${v}`);

  d.look(-75, 75); // back, and 75 px down: the view tilts up and the world slides down
  run(d, 2);
  const [u2, v2] = screenOf(ahead, camera);
  assert.ok(near(u2, 0.5, 1e-6) && near(v2, (1 + Math.tan(rad(15)) / tanV) / 2, 1e-6), `${u2}, ${v2}`);
});

test('look eases the view and never turns it faster than 60 degrees a second', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  d.explore({ yaw: [-170, 170], pitch: [-30, 30] });
  d.look(-1e6, 0); // as far as it will go
  let previous = aimOf(camera);
  let fastest = 0;
  for (let i = 0; i < 300; i++) {
    d.update(1 / 60);
    const now = aimOf(camera);
    fastest = Math.max(fastest, deg(now.angleTo(previous)) * 60);
    previous = now;
  }
  assert.ok(fastest <= 60 + 1e-6 && fastest > 59, `fastest ${fastest} deg/s`);
  assert.ok(near(deg(Math.atan2(previous.x, -previous.z)), 170, 1e-3), 'and it gets there');

  // A short drag does not stop dead: after its fastest frame the view only ever slows, and it takes a while to rest.
  const short = director();
  short.director.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  short.director.explore({ yaw: [-60, 60], pitch: [-30, 30] });
  short.director.look(-100, 0);
  const steps = [];
  let last = aimOf(short.camera);
  for (let i = 0; i < 90; i++) {
    short.director.update(1 / 60);
    const now = aimOf(short.camera);
    steps.push(now.angleTo(last));
    last = now;
  }
  const peak = Math.max(...steps);
  for (let i = steps.indexOf(peak) + 1; i < steps.length; i++) assert.ok(steps[i] <= steps[i - 1] + 1e-9, `frame ${i} speeds up again`);
  assert.ok(steps.filter(step => step > peak * 0.05).length > 12, 'it comes to rest softly');
});

test('cancelling explore holds the view where it is, and look then does nothing', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  const handle = d.explore({ yaw: [-60, 60], pitch: [-20, 20] });
  assert.equal(d.busy, false, 'the child has the camera: no move is under way');
  d.look(-200, 0);
  d.update(0.1);
  const held = aimOf(camera);
  handle.cancel();
  assert.equal(handle.cancelled, true);
  assert.equal(d.mode, 'still');
  d.look(-200, 0);
  run(d, 1);
  assert.ok(aimOf(camera).angleTo(held) < 1e-9, 'the view stays, though it was still easing');

  // stop() holds it as well, and a new explore takes the view it finds as its middle.
  const again = d.explore({ yaw: [-10, 10], pitch: [-10, 10] });
  d.look(-100000, 0);
  run(d, 2);
  assert.ok(near(turnedFrom(held, camera).yaw, 10, 1e-3));
  const edge = aimOf(camera);
  d.stop();
  assert.equal(again.cancelled, true);
  assert.equal(d.mode, 'still');
  run(d, 1);
  assert.ok(aimOf(camera).angleTo(edge) < 1e-9);
});

test('another move or shot takes the camera from explore and ends its handle', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  const handle = d.explore({ yaw: [-60, 60], pitch: [-20, 20] });
  const pan = d.hint([5, 1.4, 0]);
  d.move({ position: [2, 1.4, 10], target: [0, 1.4, 0] }, { duration: 4 });
  assert.equal(d.mode, 'move');
  assert.equal(handle.cancelled, true, 'explore is over');
  assert.equal(pan.cancelled, true, 'and so is the pan inside it, which no script is left waiting for');
  d.look(-100000, 0);
  run(d, 5);
  assert.equal(d.mode, 'hold', 'look does not bring explore back');
  assert.ok(nearVec(camera.position, [2, 1.4, 10]));
  assert.ok(aimOf(camera).distanceTo(new THREE.Vector3(-2, 0, -10).normalize()) < 1e-6, 'and the move went where it was going');
});

test('a hint pans to the point inside the explore limits, slowly enough for the style guide', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  d.explore({ yaw: [-60, 60], pitch: [-20, 20] });
  const flower = new THREE.Vector3(4, 0.3, 0); // 22 degrees to the right and a little below
  const pan = d.hint(flower.toArray()); // asks for 2 s; the pan limit needs about 2.8
  let previous = aimOf(camera);
  let fastest = 0;
  const step = () => {
    d.update(1 / 30);
    const now = aimOf(camera);
    fastest = Math.max(fastest, deg(now.angleTo(previous)) * 30);
    previous = now;
  };
  for (let i = 0; i < 63; i++) step(); // 2.1 s
  assert.equal(pan.done, false, 'the style guide sets a minimum, not the 2 s asked for');
  for (let i = 0; i < 27; i++) step(); // 3 s
  assert.equal(pan.done, true);
  assert.ok(fastest <= LIMITS.pan && fastest > 10, `peak ${fastest} deg/s`);
  const [u, v] = screenOf(flower, camera);
  assert.ok(near(u, 0.5, 1e-6) && near(v, 0.5, 1e-6), `the flower is in the middle of the view: ${u}, ${v}`);
  assert.equal(d.warnings.length, 0, 'a hint never breaks the camera rules');
  assert.equal(d.mode, 'explore', 'the child can look around again from here');
  d.look(0, 0);
  run(d, 1);
  assert.ok(near(screenOf(flower, camera)[0], 0.5, 1e-6), 'and the view stays where the hint left it');
});

test('a hint can be slower than the style guide needs, never faster, and goes only as far as the limits allow', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  d.explore({ yaw: [-30, 30], pitch: [-5, 5] });
  const slow = d.hint([2, 1.4, 0], { duration: 6 });
  run(d, 5.9);
  assert.equal(slow.done, false);
  run(d, 0.2);
  assert.equal(slow.done, true);

  // Far to the right and well below: the view goes to the corner of what the child may see.
  const far = d.hint([40, -6, 10]);
  while (!far.done) d.update(1 / 30);
  const turn = turnedFrom(new THREE.Vector3(0, 0, -1), camera);
  assert.ok(near(turn.yaw, 30, 1e-6) && near(turn.pitch, -5, 1e-6), JSON.stringify(turn));
  assert.equal(d.warnings.length, 0);
});

test('a hint takes the short way round, and reads the pitch off the view exploring began with', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 0], target: [-10, 0.4, 0] }); // facing -x, where yaw wraps from +180 to -180, and a little down
  d.explore({ yaw: [-60, 60], pitch: [-10, 10] });
  const flower = new THREE.Vector3(-10, 0.9, -3); // 17 degrees to the right of the view, 3 degrees higher than it
  const pan = d.hint(flower.toArray());
  while (!pan.done) d.update(1 / 30);
  const [u, v] = screenOf(flower, camera);
  assert.ok(near(u, 0.5, 1e-6) && near(v, 0.5, 1e-6), `${u}, ${v}`);
  assert.ok(d.time < 4, `took ${d.time} s: not the long way round`);
});

test('zoom while exploring starts from the view the child chose', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0], fov: 40 });
  d.explore({ yaw: [-60, 60], pitch: [-20, 20] });
  d.look(-200, 0); // 30 degrees to the right
  run(d, 2);
  const looking = aimOf(camera);
  d.zoom(30, { duration: 2 });
  run(d, 2.5);
  assert.ok(aimOf(camera).angleTo(looking) < 1e-6, 'it did not swing back to the shot explore began with');
  assert.equal(camera.fov, 30);
});

test('a look during a hint takes the camera back from it', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  d.explore({ yaw: [-60, 60], pitch: [-20, 20] });
  const flower = new THREE.Vector3(4, 0.3, 0);
  const pan = d.hint(flower.toArray());
  run(d, 1);
  const onTheWay = aimOf(camera);
  d.look(-10, 0); // the finger moves: the pan gives way at once
  assert.equal(pan.cancelled, true);
  run(d, 0.2);
  d.look(10, 0); // and back to where the view was
  run(d, 3);
  assert.ok(aimOf(camera).angleTo(onTheWay) < rad(0.01), 'the view has not gone on to the flower');
  assert.ok(screenOf(flower, camera)[0] > 0.6, 'which is still well off to the right');
  assert.equal(d.warnings.length, 0);

  // Cancelling the pan from outside holds the view too, and exploring goes on. The view was on the
  // move when this hint began: nothing of that motion is left to carry it on.
  d.look(-100, 0);
  run(d, 0.1);
  const second = d.hint(flower.toArray());
  run(d, 1);
  const here = aimOf(camera);
  second.cancel();
  for (let i = 0; i < 60; i++) {
    d.update(1 / 30);
    assert.ok(aimOf(camera).angleTo(here) < 1e-9, `the view drifted on at frame ${i}`);
  }
  assert.equal(d.mode, 'explore');
  d.look(-100, 0);
  run(d, 1);
  assert.ok(aimOf(camera).angleTo(here) > rad(10), 'the child can still look around');
});

test('a hint takes over from a view that is still moving, and the view stays where the hint ends', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  d.explore({ yaw: [-60, 60], pitch: [-20, 20] });
  const flower = new THREE.Vector3(4, 0.3, 0);
  d.look(-200, 0); // 30 degrees to the right, and the view is on its way there
  run(d, 0.1);
  const moving = aimOf(camera);
  const pan = d.hint(flower.toArray());
  d.update(1 / 30);
  assert.ok(deg(aimOf(camera).angleTo(moving)) < 1, 'the pan starts from where the view is, not from where it was going');
  while (!pan.done) d.update(1 / 30);
  const ended = aimOf(camera);
  for (let i = 0; i < 60; i++) {
    d.update(1 / 30);
    assert.ok(aimOf(camera).angleTo(ended) < 1e-9, `the view drifted on at frame ${i}`);
  }
  const [u, v] = screenOf(flower, camera);
  assert.ok(near(u, 0.5, 1e-6) && near(v, 0.5, 1e-6), `${u}, ${v}`);
  assert.equal(d.warnings.length, 0);
});

test('a second hint takes over from the first, which ends', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  d.explore({ yaw: [-60, 60], pitch: [-20, 20] });
  const first = d.hint([4, 0.3, 0]);
  run(d, 1);
  const second = d.hint([-4, 0.3, 0]);
  assert.equal(first.cancelled, true);
  assert.equal(second.done, false);
  while (!second.done) d.update(1 / 30);
  const [u, v] = screenOf(new THREE.Vector3(-4, 0.3, 0), camera);
  assert.ok(near(u, 0.5, 1e-6) && near(v, 0.5, 1e-6), `${u}, ${v}`);
  assert.equal(d.warnings.length, 0);
});

test('cancelling explore or stopping the camera ends a hint under way and holds the view', () => {
  for (const [how, end] of [['cancelling explore', (handle) => handle.cancel()], ['stop', (handle, d) => d.stop()]]) {
    const { director: d, camera } = director();
    d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
    const handle = d.explore({ yaw: [-60, 60], pitch: [-20, 20] });
    const pan = d.hint([4, 0.3, 0]);
    run(d, 1);
    const here = aimOf(camera);
    end(handle, d);
    assert.equal(pan.cancelled, true, how);
    assert.equal(d.mode, 'still', how);
    run(d, 3);
    assert.ok(aimOf(camera).angleTo(here) < 1e-9, `${how}: the view is held where the pan had got to`);
  }
});

test('a hint without explore is a plain pan, still slow enough', () => {
  const { director: d, camera } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  const flower = new THREE.Vector3(-8, 0.3, -2); // about 34 degrees to the left
  const pan = d.hint(flower.toArray());
  while (!pan.done) d.update(1 / 30);
  assert.ok(d.time > 4, `took ${d.time} s`);
  const [u, v] = screenOf(flower, camera);
  assert.ok(near(u, 0.5, 1e-6) && near(v, 0.5, 1e-6));
  assert.equal(d.warnings.length, 0);
});

test('explore needs limits around the view: a pair of degrees for yaw and for pitch, each with 0 inside', () => {
  const { director: d } = director();
  d.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0] });
  assert.throws(() => d.explore(), /yaw/);
  assert.throws(() => d.explore({ yaw: [-10, 10] }), /pitch/);
  assert.throws(() => d.explore({ yaw: [10, 20], pitch: [-5, 5] }), /yaw/);
  assert.throws(() => d.explore({ yaw: [-10, 10], pitch: [-5, -1] }), /pitch/);
  assert.throws(() => d.explore({ yaw: [-10, NaN], pitch: [-5, 5] }), /yaw/);
  assert.throws(() => d.explore({ yaw: [-10, 10, 20], pitch: [-5, 5] }), /yaw/);
  assert.equal(d.mode, 'hold', 'a refused explore changes nothing');
  assert.doesNotThrow(() => d.explore({ yaw: [0, 0], pitch: [0, 0] }));
});

test("poseOf says where a shot would put the camera, and the shadow's focus there, without going there", () => {
  const { director: d, camera, actor } = director(4 / 3, {
    a: { position: [5, 2, 5], target: [0, 1, 0], fov: 38 },
    face: { position: [0, 1.4, 6], frame: { subject: 'mosi', screen: [0.5, 0.5] }, fov: 40 },
    far: { position: [0, 1, 40], target: [0, 1, 0], fov: 40 },
  });
  d.cut('a');
  const moving = d.move('far', { duration: 10 });
  d.update(1);
  const before = { position: camera.position.clone(), mode: d.mode, rig: d.rig.position.clone() };
  const pose = d.poseOf('a');
  assert.ok(nearVec(pose.position, [5, 2, 5]));
  assert.ok(nearVec(pose.target, [0, 1, 0]));
  assert.equal(pose.fov, d.effectiveFov(38), 'the lens the camera would use on this screen (4:3 widens it)');
  assert.ok(pose.fov > 38);
  const to = new THREE.Vector3(-5, -1, -5);
  const distance = to.length();
  assert.ok(nearVec(pose.focus.centre, [5 - 5 * Math.min(distance, 16) / distance, 0, 5 - 5 * Math.min(distance, 16) / distance]), 'the focus: the ground under where it aims, as shadowFocus has it');
  assert.ok(pose.focus.radius > 0);
  actor.root.position.set(2, 0, 0);
  assert.ok(d.poseOf('face').target.distanceTo(new THREE.Vector3(2, 1, 0)) < 1e-6, 'a framed shot is composed on its subject, where it is now');
  assert.ok(camera.position.equals(before.position) && d.rig.position.equals(before.rig), 'the camera and the rig stay where they were');
  assert.equal(d.mode, before.mode, 'and the move goes on');
  assert.equal(moving.done, false);
  const far = d.poseOf('far');
  assert.ok(near(far.focus.centre.z, 40 - 16), 'at most 16 m out');
  assert.throws(() => d.poseOf('nowhere'), /nowhere/);
});

test('follow can look at a point of its own, another actor\'s head, while it keeps to the one it follows', () => {
  const { director: d, camera, actor, world } = director();
  const root = new THREE.Object3D();
  root.position.set(-4, 0, 0);
  world.actors.set('thorsedla', { root, centre: out => out.copy(root.position), headPosition: out => out.copy(root.position).add(new THREE.Vector3(0, 3, 0)) });
  actor.root.position.set(2, 0, 0);
  d.cut({ position: [2, 1.4, 6], target: [2, 1, 0] });
  d.follow('mosi', { offset: [0, 1.4, 6], look: { actor: 'thorsedla', part: 'head' } });
  for (let i = 0; i < 900; i++) d.update(1 / 30);
  assert.ok(nearVec(camera.position, [2, 1.4, 6], 1e-3), `the camera keeps to Mosi: ${camera.position.toArray().map(v => v.toFixed(3))}`);
  const toHead = new THREE.Vector3(-4, 3, 0).sub(camera.position).normalize();
  assert.ok(aimOf(camera).angleTo(toHead) < 1e-3, 'and looks at her head');
});

test('follow adds lookOffset to a point it looks at, as it does to the head or centre of the one it follows', () => {
  const { director: d, camera, actor, world } = director();
  const root = new THREE.Object3D();
  root.position.set(-4, 0, 0);
  world.actors.set('thorsedla', { root, centre: out => out.copy(root.position), headPosition: out => out.copy(root.position).add(new THREE.Vector3(0, 3, 0)) });
  actor.root.position.set(2, 0, 0);
  d.cut({ position: [2, 1.4, 6], target: [2, 1, 0] });
  d.follow('mosi', { offset: [0, 1.4, 6], look: { actor: 'thorsedla', part: 'head' }, lookOffset: [0, -1.5, 2] });
  for (let i = 0; i < 900; i++) d.update(1 / 30);
  assert.ok(nearVec(d.rig.target, [-4, 1.5, 2], 1e-3), `it looks at her head plus the offset: ${d.rig.target.toArray().map(v => v.toFixed(3))}`);
  const toPoint = new THREE.Vector3(-4, 1.5, 2).sub(camera.position).normalize();
  assert.ok(aimOf(camera).angleTo(toPoint) < 1e-3, 'and the camera aims there');
});

test('follow reads an offset given as a function every frame, and settles where it says now', () => {
  const { director: d, camera, actor } = director();
  actor.root.position.set(2, 0, 0);
  let offset = [0, 1.4, 6];
  d.cut({ position: [2, 1.4, 6], target: [2, 1, 0] });
  d.follow('mosi', { offset: () => offset, maxSpeed: 2 });
  for (let i = 0; i < 300; i++) d.update(1 / 30);
  assert.ok(nearVec(camera.position, [2, 1.4, 6], 1e-3), 'at the offset it gave first');
  offset = [-6, 1.4, 0];
  let previous = camera.position.clone();
  let fastest = 0;
  for (let i = 0; i < 900; i++) {
    d.update(1 / 30);
    fastest = Math.max(fastest, camera.position.distanceTo(previous) * 30);
    previous = camera.position.clone();
  }
  assert.ok(nearVec(camera.position, [-4, 1.4, 0], 1e-3), `and then at the one it gives now: ${camera.position.toArray().map(v => v.toFixed(3))}`);
  assert.ok(fastest <= 2 + 1e-6, `never faster than its cap on the way: ${fastest.toFixed(2)} m/s`);
});
