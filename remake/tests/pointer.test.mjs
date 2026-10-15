import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pickTarget, createPointer } from '../engine/input/pointer.js';
import { createScene } from '../engine/scene/scene.js';
import { createPointResolver } from '../engine/points.js';
import { DONE } from '../engine/handle.js';

const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const sphere = (name, x, y, z, radius, enabled = true) => ({ name, centre: vec(x, y, z), radius, enabled });
const ahead = () => new THREE.Ray(vec(0, 0, 0), vec(0, 0, -1)); // from the origin, straight down -z
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('pickTarget returns the nearest hit along the ray', () => {
  const targets = [sphere('far', 0, 0, -20, 2), sphere('near', 0, 0, -5, 1), sphere('middle', 0, 0, -10, 1)];
  assert.equal(pickTarget(ahead(), targets), 'near', 'the first sphere the ray meets, wherever it sits in the list');

  // Nearest along the ray, not nearest to its line: a sphere grazed in front beats a smaller one dead ahead behind it.
  assert.equal(pickTarget(ahead(), [sphere('behind', 0, 0, -10, 0.5), sphere('grazed', 0.9, 0, -6, 1)]), 'grazed');

  // The ray meets the big sphere's near side before the small one's, though its centre is farther.
  assert.equal(pickTarget(ahead(), [sphere('small', 0, 0, -6, 0.5), sphere('big', 0, 0, -9, 4)]), 'big');

  // A sphere the ray starts inside is met at once.
  assert.equal(pickTarget(ahead(), [sphere('front', 0, 0, -3, 1), sphere('inside', 0, 0, 0.5, 1)]), 'inside');
});

test('pickTarget ignores disabled and missed targets', () => {
  assert.equal(pickTarget(ahead(), []), null);
  assert.equal(pickTarget(ahead(), [sphere('off', 0, 0, -5, 1, false)]), null, 'a disabled target is not hit');
  assert.equal(pickTarget(ahead(), [sphere('off', 0, 0, -5, 1, false), sphere('on', 0, 0, -9, 1)]), 'on', 'and does not hide the one behind it');
  assert.equal(pickTarget(ahead(), [sphere('aside', 3, 0, -5, 1)]), null, 'the ray passes beside it');
  assert.equal(pickTarget(ahead(), [sphere('behind', 0, 0, 5, 1)]), null, 'a target behind the origin is not hit');
});

test('pickTarget widens targets that look smaller than the minimum angle', () => {
  const minAngle = 0.02; // seen from the origin: a target is reached out to 20 * tan(0.02) = 0.4 m from its centre at 20 m
  const speck = sphere('speck', 0.3, 0, -20, 0.05);
  assert.equal(pickTarget(ahead(), [speck]), null, 'a 5 cm target 0.3 m off the ray is missed as it is');
  assert.equal(pickTarget(ahead(), [speck], { minAngle }), 'speck', 'but a finger-sized angle reaches it');
  assert.equal(pickTarget(ahead(), [sphere('wide', 0.5, 0, -20, 0.05)], { minAngle }), null, 'and only so far: 0.5 m is outside 0.4 m');

  // A big target is hit as it always was.
  assert.equal(pickTarget(ahead(), [sphere('big', 1.5, 0, -3, 2)], { minAngle }), 'big');
});

test('pickTarget prefers a target the ray really hits over one it only reaches through the widening', () => {
  const minAngle = 0.02;
  // A near target's halo is grazed while a far target is hit squarely.
  const grazed = sphere('grazed', 0.07, 0, -5, 0.05); // 7 cm off a 5 cm target 5 m away: inside its 10 cm halo, outside the target
  const squarely = sphere('squarely', 0.02, 0, -20, 0.05); // 2 cm off a 5 cm target 20 m away: on it
  assert.equal(pickTarget(ahead(), [grazed, squarely], { minAngle }), 'squarely');
  assert.equal(pickTarget(ahead(), [squarely, grazed], { minAngle }), 'squarely', 'whatever the order');
  assert.equal(pickTarget(ahead(), [grazed], { minAngle }), 'grazed', 'the halo counts when nothing is really hit');

  // Among the targets really hit, the nearest still wins.
  assert.equal(pickTarget(ahead(), [sphere('behind', 0, 0, -9, 1), sphere('front', 0, 0, -4, 1)], { minAngle }), 'front');

  // A real hit wins even where a halo is angularly closer to the ray: the ray is 0.5 m from the middle of a
  // big target 20 m away (0.025 rad) and 3 cm from the middle of a 1 cm speck 5 m away (0.006 rad).
  assert.equal(pickTarget(ahead(), [sphere('speck', 0.03, 0, -5, 0.01), sphere('big', 0.5, 0, -20, 1)], { minAngle }), 'big');
});

test('pickTarget takes the angularly closest target when it only reaches them through the widening', () => {
  const minAngle = 0.02;
  const nearby = sphere('nearby', 0.09, 0, -5, 0.05); // 0.09 m off at 5 m: 0.018 rad from the ray, inside its 0.1 m halo
  const distant = sphere('distant', 0.2, 0, -20, 0.05); // 0.2 m off at 20 m: 0.010 rad, inside its 0.4 m halo
  assert.equal(pickTarget(ahead(), [nearby, distant], { minAngle }), 'distant', 'closer in angle, though farther along the ray');
  assert.equal(pickTarget(ahead(), [distant, nearby], { minAngle }), 'distant', 'whatever the order');

  // Not simply the farthest: a nearer target that the ray runs closer to wins.
  assert.equal(pickTarget(ahead(), [distant, sphere('closer', 0.02, 0, -5, 0.01)], { minAngle }), 'closer');
});

/**
 * A pointer event as the canvas receives it: a plain Event with the fields the pointer reads. It also
 * carries a time, as real ones do, though a press is a tap however long it is held: the tests that
 * hold a press say how long by it.
 */
function pointerEvent(type, { id = 1, x = 0, y = 0, time = 0, button = 0 } = {}) {
  const event = new Event(type);
  Object.defineProperties(event, {
    pointerId: { value: id },
    clientX: { value: x },
    clientY: { value: y },
    timeStamp: { value: time },
    button: { value: button },
  });
  return event;
}

/**
 * A real pointer on a fake canvas (an EventTarget that knows its rectangle) and a real camera 10 m
 * from the origin, looking at it: 40 degrees tall, so the view is 7.3 m high and 11.6 m wide at the
 * origin. The canvas does not start at 0, 0: a position that is not made canvas-relative lands in the
 * wrong place.
 */
function pointerRig({ width = 800, height = 500 } = {}) {
  const rect = { left: 10, top: 20, width, height };
  const canvas = Object.assign(new EventTarget(), { getBoundingClientRect: () => rect });
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1200);
  camera.position.set(0, 1.6, 10);
  camera.lookAt(0, 1.6, 0);
  camera.updateMatrixWorld();
  const world = { camera, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const pointer = createPointer({ canvas, camera, world });

  /** One pointer event, at client pixels, `time` in ms. */
  const send = (type, x, y, time, id = 1) => canvas.dispatchEvent(pointerEvent(type, { id, x, y, time }));
  /** Where a world point is on screen, in client pixels. */
  function screenOf(point) {
    const p = vec(...point).project(camera);
    return { x: rect.left + ((p.x + 1) / 2) * width, y: rect.top + ((1 - p.y) / 2) * height };
  }
  let clock = 0; // every tapOn starts a second after the last
  /** A quick tap (press and release 80 ms apart) where the world point is on screen now, plus an offset in pixels. */
  function tapOn(point, { dx = 0, dy = 0 } = {}) {
    const { x, y } = screenOf(point);
    clock += 1000;
    send('pointerdown', x + dx, y + dy, clock);
    send('pointerup', x + dx, y + dy, clock + 80);
  }
  return { rect, canvas, camera, world, pointer, send, screenOf, tapOn };
}

/** Everything a pointer says, in order. */
function watch(pointer) {
  const taps = [];
  const drags = [];
  pointer.on('tap', event => taps.push(event));
  pointer.on('drag', event => drags.push(event));
  return { taps, drags };
}

const EGILL = [0, 1.6, 0]; // the middle of the view
const MOSI = [4, 1.6, 0]; // to its right
const CRITTER = [-4, 1.6, 0]; // and to its left

test('a quick press and release taps the target pressed, in canvas pixels', () => {
  const { pointer, tapOn } = pointerRig();
  const { taps, drags } = watch(pointer);
  pointer.addTarget('egill', { point: EGILL, radius: 1 });
  tapOn(EGILL);
  assert.equal(taps.length, 1);
  assert.equal(taps[0].name, 'egill');
  assert.ok(near(taps[0].x, 400) && near(taps[0].y, 250), `the middle of the canvas, not of the page: ${taps[0].x}, ${taps[0].y}`);

  tapOn(MOSI);
  assert.equal(taps[1].name, null, 'a tap on nothing is still a tap, without a name');
  assert.equal(drags.length, 0);
});

test('a press that moves 12 px or more is a drag, and its events add up to the finger\'s travel', () => {
  const { pointer, send } = pointerRig();
  const { taps, drags } = watch(pointer);
  send('pointerdown', 100, 100, 0);
  send('pointermove', 111, 100, 20);
  assert.deepEqual(drags, [], '11 px is still a press');
  send('pointermove', 112, 100, 40);
  send('pointermove', 130, 110, 60);
  send('pointermove', 130, 110, 70); // no movement: nothing to say
  send('pointerup', 130, 110, 90);
  assert.deepEqual(drags, [
    { phase: 'start', dx: 12, dy: 0, x: 102, y: 80 }, // canvas pixels: the canvas starts at 10, 20
    { phase: 'move', dx: 18, dy: 10, x: 120, y: 90 },
    { phase: 'end', dx: 0, dy: 0, x: 120, y: 90 },
  ]);
  assert.deepEqual(taps, [], 'a drag is not a tap');

  // Distance, not each axis: 8 px across and 8 down is 11.3 px, 9 and 9 is 12.7.
  drags.length = 0;
  send('pointerdown', 200, 200, 1000);
  send('pointermove', 208, 208, 1020);
  assert.deepEqual(drags, []);
  send('pointermove', 209, 209, 1040);
  assert.deepEqual(drags.map(d => d.phase), ['start']);
  send('pointerup', 209, 209, 1060);

  // A release far from the press with no move between is a drag as well, not a tap.
  drags.length = 0;
  send('pointerdown', 100, 100, 2000);
  send('pointerup', 160, 100, 2050);
  assert.deepEqual(drags.map(d => [d.phase, d.dx]), [['start', 60], ['end', 0]]);
  assert.deepEqual(taps, []);
});

test('a press is a tap however long it is held, and a drag once it moves 12 px', () => {
  const { pointer, send, screenOf } = pointerRig();
  const { taps, drags } = watch(pointer);
  pointer.addTarget('egill', { point: EGILL, radius: 1 });
  const { x, y } = screenOf(EGILL);
  send('pointerdown', x, y, 0);
  send('pointerup', x, y, 2000);
  assert.deepEqual(taps.map(t => t.name), ['egill'], 'held still for 2 s: a tap');

  send('pointerdown', x, y, 5000);
  send('pointermove', x + 6, y + 6, 7000);
  send('pointerup', x + 6, y + 6, 12000);
  assert.deepEqual(taps.map(t => t.name), ['egill', 'egill'], 'held for 7 s with a wobble of 8 px: still a tap');
  assert.deepEqual(drags, []);

  send('pointerdown', 100, 100, 20000);
  send('pointermove', 112, 100, 25000);
  send('pointerup', 112, 100, 25100);
  assert.deepEqual(drags.map(d => d.phase), ['start', 'end'], 'but 12 px or more is a drag, however long the press has been');
  assert.equal(taps.length, 2);
});

test('only the first finger is followed; a second one is ignored until the first lifts', () => {
  const { pointer, send } = pointerRig();
  const { taps, drags } = watch(pointer);
  send('pointerdown', 100, 100, 0, 1);
  send('pointerdown', 300, 300, 10, 2); // a second finger lands...
  send('pointerdown', 500, 300, 15, 3); // ...and a third
  send('pointerdown', 300, 400, 18, 4); // ...and a fourth
  send('pointermove', 340, 300, 20, 2); // the second drags: nothing
  send('pointerup', 500, 300, 30, 3); // the third lifts while the first is down: that is not the first's release
  send('pointercancel', 0, 0, 40, 2); // the second is cancelled: nor is that
  send('pointerup', 100, 100, 60, 1); // the first lifts: a tap where it landed
  send('pointermove', 360, 400, 70, 4); // the fourth is still down, and still ignored
  send('pointerup', 360, 400, 80, 4);
  assert.deepEqual(drags, []);
  assert.deepEqual(taps.map(t => [t.x, t.y]), [[90, 80]]);

  send('pointerdown', 300, 300, 1000, 3); // a new finger is followed again
  send('pointerup', 300, 300, 1050, 3);
  assert.deepEqual(taps.map(t => [t.x, t.y]), [[90, 80], [290, 280]]);
});

test('a cancelled touch ends its drag, is never a tap, and leaves the pointer ready', () => {
  const { pointer, send, tapOn } = pointerRig();
  const { taps, drags } = watch(pointer);
  send('pointerdown', 100, 100, 0);
  send('pointermove', 150, 100, 40);
  send('pointercancel', 0, 0, 60); // browsers do not promise coordinates here
  assert.deepEqual(drags.map(d => [d.phase, d.x, d.y]), [['start', 140, 80], ['end', 140, 80]]);
  send('pointerup', 150, 100, 80); // nothing is following it any more
  assert.equal(drags.length, 2);

  send('pointerdown', 100, 100, 1000);
  send('pointercancel', 100, 100, 1020);
  send('pointerup', 100, 100, 1040);
  assert.deepEqual(taps, [], 'a press that was cancelled never taps');

  tapOn(EGILL);
  assert.equal(taps.length, 1, 'the next touch works');
});

test('a tap finds a moving target where it is now, and the press is what is picked', () => {
  const { pointer, world, tapOn, screenOf, send } = pointerRig();
  const { taps } = watch(pointer);
  const egill = vec(-3, 1, 0);
  const butterfly = vec(3, 3, 0);
  world.actors.set('egill', { centre: out => out.copy(egill) });
  pointer.addTarget('egill', { point: 'egill', radius: 0.8 }); // follows an actor
  pointer.addTarget('butterfly', { point: out => out.copy(butterfly), radius: 0.4 }); // and a function
  tapOn([-3, 1, 0]);
  tapOn([3, 3, 0]);

  egill.set(2, 1, 0);
  butterfly.set(-2, 3, 0);
  tapOn([-3, 1, 0]); // where they were: nothing
  tapOn([3, 3, 0]);
  tapOn([2, 1, 0]);
  tapOn([-2, 3, 0]);
  assert.deepEqual(taps.map(t => t.name), ['egill', 'butterfly', null, null, 'egill', 'butterfly']);

  // Pressed on it, and it moves on before the finger lifts: it is still the one tapped.
  const { x, y } = screenOf([2, 1, 0]);
  send('pointerdown', x, y, 9000);
  egill.set(-3, 1, 0);
  send('pointerup', x, y, 9080);
  assert.equal(taps.at(-1).name, 'egill');
});

test('a target is at least 44 px wide on screen, however small or far', () => {
  const { pointer, tapOn } = pointerRig();
  const { taps } = watch(pointer);
  pointer.addTarget('speck', { point: [0, 1.6, -10], radius: 0.05 }); // 5 cm, 20 m from the camera: under 2 px
  tapOn([0, 1.6, -10]);
  tapOn([0, 1.6, -10], { dx: 21 });
  tapOn([0, 1.6, -10], { dx: -21 });
  tapOn([0, 1.6, -10], { dy: 21 });
  tapOn([0, 1.6, -10], { dx: 23 });
  tapOn([0, 1.6, -10], { dy: -23 });
  assert.deepEqual(taps.map(t => t.name), ['speck', 'speck', 'speck', 'speck', null, null], '22 px each way of its middle, and no further');
});

test('between two small targets a tap takes the one the finger is closest to, and one hit squarely wins', () => {
  const { pointer, tapOn } = pointerRig();
  const { taps } = watch(pointer);
  // 2 cm targets, 20 px apart on screen: one 5 m from the camera, 15 px right of the middle of the view, the
  // other 20 m away and 5 px left of it. Each is inside the other's 44 px area.
  const NEAR = [0.109, 1.6, 5];
  const FAR = [-0.146, 1.6, -10];
  pointer.addTarget('near', { point: NEAR, radius: 0.02 });
  pointer.addTarget('far', { point: FAR, radius: 0.02 });
  tapOn([0, 1.6, 0]); // the middle: 5 px from far, 15 px from near, and on neither
  tapOn([0, 1.6, 0], { dx: 10 }); // 5 px from near, 15 px from far
  tapOn(FAR); // squarely on far, with near's area under the finger too
  tapOn(NEAR);
  assert.deepEqual(taps.map(t => t.name), ['far', 'near', 'far', 'near']);
});

test('targets can be switched off, replaced and removed', () => {
  const { pointer, tapOn } = pointerRig();
  const { taps } = watch(pointer);
  pointer.addTarget('a', { point: EGILL, radius: 1 });
  pointer.setEnabled('a', false);
  tapOn(EGILL);
  pointer.setEnabled('a', true);
  tapOn(EGILL);
  pointer.addTarget('a', { point: MOSI, radius: 1 }); // replaced: the old place is empty
  tapOn(EGILL);
  tapOn(MOSI);
  pointer.setEnabled('a', false);
  pointer.addTarget('a', { point: MOSI, radius: 1 }); // adding it again switches it back on
  tapOn(MOSI);
  pointer.removeTarget('a');
  pointer.removeTarget('a'); // nothing there: fine
  tapOn(MOSI);
  assert.deepEqual(taps.map(t => t.name), [null, 'a', null, 'a', 'a', null]);

  assert.throws(() => pointer.setEnabled('nowhere', true), /nowhere/);
  assert.throws(() => pointer.addTarget('b', { point: EGILL }), /radius/);
  assert.throws(() => pointer.addTarget('b', { point: EGILL, radius: 0 }), /radius/);
  assert.throws(() => pointer.addTarget('b', { radius: 1 }), /point/);

  // A target that is off is not looked up, so its point may be something that is not there yet.
  pointer.addTarget('later', { point: 'nobody', radius: 1 });
  pointer.setEnabled('later', false);
  assert.doesNotThrow(() => tapOn(EGILL));
});

test('a target taken away or switched off while it is pressed is not tapped', () => {
  const { pointer, send, screenOf } = pointerRig();
  const { taps } = watch(pointer);
  const { x, y } = screenOf(EGILL);
  pointer.addTarget('a', { point: EGILL, radius: 1 });
  send('pointerdown', x, y, 0);
  pointer.removeTarget('a');
  send('pointerup', x, y, 50);
  pointer.addTarget('a', { point: EGILL, radius: 1 });
  send('pointerdown', x, y, 1000);
  pointer.setEnabled('a', false);
  send('pointerup', x, y, 1050);
  assert.deepEqual(taps.map(t => t.name), [null, null]);
});

test('a listener that throws does not stop the others or jam the pointer', () => {
  const { pointer, tapOn } = pointerRig();
  const reported = [];
  const consoleError = console.error;
  console.error = (...args) => reported.push(args);
  try {
    const heard = [];
    pointer.on('tap', () => { throw new Error('boom'); });
    pointer.on('tap', event => heard.push(event.name));
    pointer.addTarget('a', { point: EGILL, radius: 1 });
    tapOn(EGILL);
    tapOn(EGILL);
    assert.deepEqual(heard, ['a', 'a']);
    assert.equal(reported.length, 2);
    assert.match(String(reported[0][1]), /boom/);
  } finally {
    console.error = consoleError;
  }
});

test('on() gives back the way to stop listening, and refuses events it does not have', () => {
  const { pointer, tapOn } = pointerRig();
  const heard = [];
  const stop = pointer.on('tap', () => heard.push('tap'));
  tapOn(EGILL);
  stop();
  stop(); // twice is fine
  tapOn(EGILL);
  assert.deepEqual(heard, ['tap']);
  assert.throws(() => pointer.on('click', () => {}), /click/);
  assert.throws(() => pointer.on('toString', () => {}), /toString/);
});

test('the pointer asks to keep the finger that lands, and copes when it cannot', () => {
  const { canvas, pointer, send } = pointerRig();
  const { taps } = watch(pointer);
  const kept = [];
  canvas.setPointerCapture = id => kept.push(id);
  send('pointerdown', 100, 100, 0, 7);
  send('pointerup', 100, 100, 50, 7);
  assert.deepEqual(kept, [7]);

  canvas.setPointerCapture = () => { throw new DOMException('no such pointer', 'NotFoundError'); };
  send('pointerdown', 100, 100, 1000, 8);
  send('pointerup', 100, 100, 1050, 8);
  assert.equal(taps.length, 2);
});

test('a right or middle button is not a tap', () => {
  const { canvas, pointer } = pointerRig();
  const { taps } = watch(pointer);
  canvas.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 100, time: 0, button: 2 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { x: 100, y: 100, time: 50, button: 2 }));
  assert.deepEqual(taps, []);
});

/** The same, with a scene over the pointer. */
function rig(options) {
  const base = pointerRig(options);
  const stage = createScene({
    world: base.world,
    director: { stop() {}, handheld() {} },
    ui: { reset() {} },
    voice: { stop() {} },
    pointer: base.pointer,
  });
  return { ...base, stage, s: stage.s };
}

const frames = (stage, count, dt = 0.1) => {
  for (let i = 0; i < count; i++) stage.update(dt);
};

test('one tap resolves one waiting tap even when two taps arrive in one frame', () => {
  const { stage, s, tapOn } = rig();
  s.target('egill', { point: EGILL, radius: 1 });
  const heard = [];
  s.onTap('egill', event => heard.push(event.name));
  const got = [];
  stage.start(function* script() {
    got.push(yield s.tap(['egill']));
    got.push(yield s.tap(['egill']));
  });
  frames(stage, 1); // the script reaches its first wait

  tapOn(EGILL);
  tapOn(EGILL); // the same frame: the scene has not stepped
  assert.deepEqual(heard, ['egill', 'egill'], 'background handlers hear both taps');
  frames(stage, 3);
  assert.deepEqual(got, ['egill'], 'the first wait took one tap; the second was not kept for the next wait');

  tapOn(EGILL);
  frames(stage, 1);
  assert.deepEqual(got, ['egill', 'egill'], 'the next wait takes the next tap');
  assert.deepEqual(heard, ['egill', 'egill', 'egill']);
});

test('two taps in one frame fill two waits, one each, and a wait never takes a second', () => {
  const { stage, s, tapOn } = rig();
  s.target('egill', { point: EGILL, radius: 1 });
  s.target('mosi', { point: MOSI, radius: 1 });
  const got = [];
  stage.start(function* first() { got.push(['first', yield s.tap(['egill', 'mosi'])]); });
  stage.start(function* second() { got.push(['second', yield s.tap(['egill', 'mosi'])]); });
  frames(stage, 1);

  tapOn(EGILL);
  tapOn(MOSI);
  frames(stage, 2);
  assert.deepEqual(got, [['first', 'egill'], ['second', 'mosi']], 'the wait that began first takes the first tap; the second tap does not take it over');
});

test('waits that began earlier are served first', () => {
  const { stage, s, tapOn } = rig();
  s.target('egill', { point: EGILL, radius: 1 });
  const got = [];
  stage.start(function* first() { got.push(['first', yield s.tap(['egill'])]); });
  stage.start(function* second() { got.push(['second', yield s.tap(['egill'])]); });
  frames(stage, 1);
  tapOn(EGILL);
  frames(stage, 2);
  assert.deepEqual(got, [['first', 'egill']], 'one tap, one wait');
  tapOn(EGILL);
  frames(stage, 2);
  assert.deepEqual(got, [['first', 'egill'], ['second', 'egill']]);
});

test('a tap wait that loses a race to a timer does not take a later tap', () => {
  const { stage, s, tapOn } = rig();
  s.target('egill', { point: EGILL, radius: 1 });
  const log = [];
  stage.start(function* script() {
    log.push(['tapped', yield s.race(s.tap(['egill']), s.wait(5))]);
    log.push(['idle', yield s.race(s.tap(['egill']), s.wait(1))]);
    log.push(['later', yield s.tap(['egill'])]);
  });
  frames(stage, 1);
  tapOn(EGILL);
  frames(stage, 2);
  assert.deepEqual(log, [['tapped', 'egill']], 'a tap beats the timer');

  frames(stage, 11); // a second of nobody tapping: the timer wins
  assert.deepEqual(log, [['tapped', 'egill'], ['idle', undefined]]);
  tapOn(EGILL);
  frames(stage, 2);
  assert.deepEqual(log.at(-1), ['later', 'egill'], 'the wait that lost has gone; the tap belongs to the wait that is there');
});

test('a wait for several targets resolves with the one tapped and ignores the rest', () => {
  const { stage, s, tapOn } = rig();
  s.target('egill', { point: EGILL, radius: 1 });
  s.target('mosi', { point: MOSI, radius: 1 });
  s.target('critter', { point: CRITTER, radius: 1 });
  const got = [];
  stage.start(function* script() {
    got.push(yield s.tap('mosi')); // one name will do
    got.push(yield s.tap(['egill', 'mosi']));
  });
  frames(stage, 1);
  tapOn(CRITTER); // a target nobody waits for
  tapOn(EGILL); // not the one asked for
  tapOn([0, 3.5, 0]); // nothing at all
  frames(stage, 2);
  assert.deepEqual(got, []);
  tapOn(MOSI);
  frames(stage, 2);
  assert.deepEqual(got, ['mosi']);
  tapOn(EGILL);
  frames(stage, 2);
  assert.deepEqual(got, ['mosi', 'egill']);
});

test('onTap hears every tap on its target, with or without a wait, until it is stopped', () => {
  const { s, tapOn } = rig();
  s.target('egill', { point: EGILL, radius: 1 });
  s.target('mosi', { point: MOSI, radius: 1 });
  const heard = [];
  const stopA = s.onTap('egill', event => { heard.push(['a', event.name]); stopA(); }); // stops itself in the middle of a tap
  s.onTap('egill', event => heard.push(['b', event.name]));
  s.onTap('egill', event => heard.push(['c', Math.round(event.x), Math.round(event.y)]));
  tapOn(MOSI);
  assert.deepEqual(heard, [], 'another target');
  tapOn(EGILL);
  assert.deepEqual(heard, [['a', 'egill'], ['b', 'egill'], ['c', 400, 250]], 'all three, though the first stopped itself');
  heard.length = 0;
  tapOn(EGILL);
  assert.deepEqual(heard, [['b', 'egill'], ['c', 400, 250]]);
  stopA(); // twice is fine
});

test('s.target adds, replaces and removes a target', () => {
  const { pointer, s, tapOn } = rig();
  const { taps } = watch(pointer);
  assert.equal(s.target('flower', { point: EGILL, radius: 1 }), DONE);
  tapOn(EGILL);
  s.target('flower', { point: MOSI, radius: 1 }); // moved: the old place is empty
  tapOn(EGILL);
  tapOn(MOSI);
  assert.equal(s.target('flower', null), DONE);
  tapOn(MOSI);
  assert.equal(s.target('flower', null), DONE, 'removing what is not there is fine');
  assert.deepEqual(taps.map(t => t.name), ['flower', null, 'flower', null]);
  assert.throws(() => s.target('bad', { point: EGILL }), /radius/);
});

test('without a pointer, s.target, s.tap and s.onTap say so', () => {
  const { s } = createScene({ world: {}, director: {}, ui: {}, voice: {} });
  assert.throws(() => s.target('a', { point: EGILL, radius: 1 }), /pointer/);
  assert.throws(() => s.tap(['a']), /pointer/);
  assert.throws(() => s.onTap('a', () => {}), /pointer/);
});

test('a tap wait needs at least one name', () => {
  const { s } = rig();
  assert.throws(() => s.tap([]), /at least one/);
});

test('stop takes the scene\'s targets and tap handlers away, and ends its waits', () => {
  const { pointer, stage, s, tapOn } = rig();
  const { taps } = watch(pointer);
  pointer.addTarget('kept', { point: MOSI, radius: 1 }); // not the scene's: stop leaves it
  s.target('egill', { point: EGILL, radius: 1 });
  const heard = [];
  s.onTap('egill', event => heard.push(event.name));
  s.onTap('kept', event => heard.push(event.name));
  let ended = false;
  stage.start(function* script() {
    try { yield s.tap(['egill']); } finally { ended = true; }
  });
  frames(stage, 1);
  tapOn(EGILL);
  tapOn(MOSI);
  assert.deepEqual(heard, ['egill', 'kept']);

  stage.stop();
  assert.equal(ended, true);
  tapOn(EGILL);
  tapOn(MOSI);
  assert.deepEqual(heard, ['egill', 'kept'], 'no handler is left, even for a target that is');
  assert.deepEqual(taps.map(t => t.name), ['egill', 'kept', null, 'kept'], 'the scene\'s target is gone, the other one is not');
});

test('tap auto-resolves with its auto option after 2 s while seeking', () => {
  const { stage, s, tapOn } = rig();
  s.target('egill', { point: EGILL, radius: 1 });
  stage.seeking = true;
  const got = [];
  stage.start(function* script() {
    got.push([yield s.tap(['egill', 'mosi'], { auto: 'mosi' }), s.time]);
    got.push([yield s.tap(['egill', 'mosi']), s.time]);
    got.push([yield s.tap('mosi'), s.time]);
  });
  frames(stage, 5);
  tapOn(EGILL); // a real tap does not end the wait: a seek must land on the same frame every time
  frames(stage, 14);
  assert.deepEqual(got, [], 'still waiting at 1.9 s');
  frames(stage, 1);
  assert.deepEqual(got, [['mosi', 2]], 'the auto option, at exactly 2 s');
  frames(stage, 20);
  assert.deepEqual(got[1], ['egill', 4], 'without an auto option, the first name');
  frames(stage, 20);
  assert.deepEqual(got[2], ['mosi', 6], 'and a single name is that name');
});
