import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createScene } from '../engine/scene/scene.js';
import { createPointResolver } from '../engine/points.js';
import { createTray, createStageUI, DRAG_LIFT } from '../engine/scene/ui.js';
import { DONE } from '../engine/handle.js';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';

// ---------------------------------------------------------------------------------------------
// s.drag: the scene over a fake tray

/** A tray that remembers what the scene asked of it, and lets a test let go of an item. */
function fakeTray() {
  const listeners = [];
  const log = [];
  return {
    log,
    listeners,
    show: items => log.push(['show', items.map(item => item.id)]),
    hide: () => log.push(['hide']),
    remove: id => log.push(['remove', id]),
    putBack: id => log.push(['putBack', id]),
    onDrop(fn) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    /** The finger lets go of an item at a canvas pixel. */
    drop: (id, x, y) => [...listeners].forEach(fn => fn({ id, x, y })),
    calls: name => log.filter(([call]) => call === name),
  };
}

const MOUTH = [0, 1.6, 0]; // straight ahead of the camera: the middle of the 800 x 500 canvas
const MIDDLE = { x: 400, y: 250 };

/** The scene over the fake tray, with a camera 10 m from the origin looking at it. */
function dragRig() {
  const camera = new THREE.PerspectiveCamera(40, 800 / 500, 0.1, 1200);
  camera.position.set(0, 1.6, 10);
  camera.lookAt(0, 1.6, 0);
  camera.updateMatrixWorld();
  const world = {
    camera, actors: new Map(),
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }) } },
  };
  world.resolvePoint = createPointResolver(world);
  const tray = fakeTray();
  let resets = 0;
  const stage = createScene({
    world, director: { stop() {}, handheld() {} }, ui: { tray, reset: () => { resets++; tray.hide(); } }, voice: { stop() {} },
  });
  const step = (seconds, dt = 0.1) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) stage.update(dt);
  };
  /** Where a world point is in canvas pixels. */
  const screenOf = point => {
    const p = new THREE.Vector3(...point).project(camera);
    return { x: ((p.x + 1) / 2) * 800, y: ((1 - p.y) / 2) * 500 };
  };
  return { world, tray, stage, s: stage.s, step, screenOf, resets: () => resets };
}

/** Run a drag from a script and keep what it came to. */
function runDrag({ stage, s }, ...args) {
  const outcome = { value: undefined, done: false, at: null };
  stage.start(function* script() {
    outcome.value = yield s.drag(...args);
    outcome.done = true;
    outcome.at = s.time;
  });
  return outcome;
}

test('a drop outside the radius returns the item and a drop inside resolves', () => {
  const rig = dragRig();
  const { tray, step } = rig;
  const outcome = runDrag(rig, 'flower1', MOUTH);
  step(0.5);
  assert.equal(tray.listeners.length, 1, 'the scene listens for drops while it waits');

  tray.drop('flower1', MIDDLE.x + 91, MIDDLE.y); // 91 px from the mouth: the default radius is 90
  assert.deepEqual(tray.calls('putBack'), [['putBack', 'flower1']], 'the item goes back to the tray');
  assert.deepEqual(tray.calls('remove'), []);
  step(0.5);
  assert.equal(outcome.done, false, 'and the drag goes on waiting');

  tray.drop('flower1', MIDDLE.x - 60, MIDDLE.y + 70); // 92 px away along a diagonal: still out
  assert.equal(tray.calls('putBack').length, 2);

  tray.drop('flower1', MIDDLE.x + 89, MIDDLE.y); // inside
  assert.deepEqual(tray.calls('remove'), [['remove', 'flower1']], 'the item is taken from the tray at once');
  assert.equal(tray.calls('putBack').length, 2, 'and not put back');
  step(0.1);
  assert.equal(outcome.done, true);
  assert.equal(outcome.value, 'dropped');
  assert.equal(tray.listeners.length, 0, 'the scene stops listening');
});

test('a drop right on the target counts, and the radius is each call\'s own', () => {
  const rig = dragRig();
  const first = runDrag(rig, 'a', MOUTH);
  const second = runDrag(rig, 'b', MOUTH, { radius: 40 });
  rig.step(0.2);
  rig.tray.drop('a', MIDDLE.x, MIDDLE.y);
  rig.tray.drop('b', MIDDLE.x + 41, MIDDLE.y); // outside its smaller radius
  rig.tray.drop('b', MIDDLE.x + 30, MIDDLE.y - 20); // 36 px: inside
  rig.step(0.2);
  assert.equal(first.value, 'dropped');
  assert.equal(second.value, 'dropped');
  assert.deepEqual(rig.tray.calls('putBack'), [['putBack', 'b']], 'the radius is the call\'s own');
});

test('a drop outside the canvas is a miss, even within the radius of the target', () => {
  // A target 12 px inside a corner of the canvas, so the finger can be let go within 90 px of it and off the canvas.
  const corners = [
    { ndc: [-0.97, 0.97], outside: [[-5, 7], [12, -3]] }, // left of the canvas, above it
    { ndc: [0.97, -0.97], outside: [[803, 492], [788, 503]] }, // right of it, below it
  ];
  for (const { ndc, outside } of corners) {
    const rig = dragRig();
    const target = new THREE.Vector3(ndc[0], ndc[1], 0.5).unproject(rig.world.camera);
    const at = rig.screenOf(target.toArray());
    assert.ok(at.x > 0 && at.x < 800 && at.y > 0 && at.y < 500, 'the target itself is on the canvas');
    const outcome = runDrag(rig, 'flower1', target);
    rig.step(0.2);
    for (const [x, y] of outside) rig.tray.drop('flower1', x, y);
    assert.equal(rig.tray.calls('putBack').length, 2, 'each of them went back to the tray');
    assert.equal(outcome.done, false);
    rig.tray.drop('flower1', at.x, at.y);
    rig.step(0.1);
    assert.equal(outcome.value, 'dropped');
  }
});

test('a target behind the camera cannot be hit', () => {
  const rig = dragRig();
  const outcome = runDrag(rig, 'flower1', [0, 1.6, 20]); // behind the camera, which looks at -z from z = 10
  rig.step(0.2);
  rig.tray.drop('flower1', MIDDLE.x, MIDDLE.y); // where the mirrored point would land
  assert.deepEqual(rig.tray.calls('putBack'), [['putBack', 'flower1']]);
  assert.equal(outcome.done, false);
});

test('the drop is judged where the target is when the finger lets go', () => {
  const rig = dragRig();
  const mouth = new THREE.Vector3(...MOUTH);
  rig.world.actors.set('kambedla', { centre: out => out.copy(mouth) });
  const outcome = runDrag(rig, 'flower1', 'kambedla'); // the spec follows the actor
  rig.step(0.2);
  mouth.set(3, 1.6, 0); // she lifts her head and turns away
  const now = rig.screenOf([3, 1.6, 0]);
  rig.tray.drop('flower1', MIDDLE.x, MIDDLE.y); // where the mouth was
  assert.equal(rig.tray.calls('putBack').length, 1);
  rig.tray.drop('flower1', now.x + 10, now.y);
  rig.step(0.1);
  assert.equal(outcome.value, 'dropped');
});

test('a drag only hears its own item', () => {
  const rig = dragRig();
  const a = runDrag(rig, 'a', MOUTH);
  const b = runDrag(rig, 'b', MOUTH);
  rig.step(0.2);
  rig.tray.drop('b', MIDDLE.x, MIDDLE.y);
  rig.step(0.2);
  assert.equal(b.value, 'dropped');
  assert.equal(a.done, false, 'the other flower is still waiting');
  assert.deepEqual(rig.tray.calls('remove'), [['remove', 'b']]);
  assert.deepEqual(rig.tray.calls('putBack'), []);
  rig.tray.drop('b', MIDDLE.x, MIDDLE.y); // the one that is done is not heard again
  assert.deepEqual(rig.tray.calls('remove'), [['remove', 'b']]);
});

test('a second drop in the same frame does not take the item twice', () => {
  const rig = dragRig();
  const outcome = runDrag(rig, 'a', MOUTH);
  rig.step(0.2);
  rig.tray.drop('a', MIDDLE.x, MIDDLE.y);
  rig.tray.drop('a', MIDDLE.x, MIDDLE.y); // the scene has not stepped yet
  rig.tray.drop('a', 0, 0);
  rig.step(0.2);
  assert.equal(outcome.value, 'dropped');
  assert.deepEqual(rig.tray.log.filter(([call]) => call === 'remove' || call === 'putBack'), [['remove', 'a']]);
});

test('drag auto-resolves after 2 s while seeking', () => {
  const rig = dragRig();
  rig.stage.seeking = true;
  const outcome = runDrag(rig, 'flower1', MOUTH);
  rig.step(1.9);
  assert.equal(outcome.done, false, 'still waiting at 1.9 s');
  rig.tray.drop('flower1', 5, 5); // a real drop does not decide a capture
  rig.step(0.1);
  assert.equal(outcome.done, true);
  assert.equal(outcome.value, 'dropped');
  assert.equal(outcome.at, 2, 'at exactly 2 s');
  assert.deepEqual(rig.tray.calls('remove'), [['remove', 'flower1']], 'the flower is out of the tray, as if it were given');
  assert.deepEqual(rig.tray.calls('putBack'), []);
  assert.equal(rig.tray.listeners.length, 0);
});

test('a child who does not drop the item is helped after the idle time: it leaves the tray', () => {
  const rig = dragRig();
  const outcome = runDrag(rig, 'flower1', MOUTH);
  rig.step(19.8);
  assert.equal(outcome.done, false, 'not before 20 s');
  assert.deepEqual(rig.tray.calls('remove'), []);
  rig.step(0.4);
  assert.equal(outcome.value, 'idle');
  assert.ok(Math.abs(outcome.at - 20) < 1e-6, `at 20 s: ${outcome.at}`);
  assert.deepEqual(rig.tray.calls('remove'), [['remove', 'flower1']]);
  assert.equal(rig.tray.listeners.length, 0);

  const short = runDrag(rig, 'flower2', MOUTH, { idle: 5 });
  rig.step(4.8);
  assert.equal(short.done, false);
  rig.step(0.4);
  assert.equal(short.value, 'idle');

  const late = runDrag(rig, 'flower3', MOUTH);
  rig.step(19.5);
  rig.tray.drop('flower3', MIDDLE.x, MIDDLE.y);
  rig.step(0.2);
  assert.equal(late.value, 'dropped', 'a hit just before the end is a hit');
});

test('misses do not extend the idle time: it runs from the start of the drag', () => {
  const rig = dragRig();
  const outcome = runDrag(rig, 'flower1', MOUTH);
  rig.step(5);
  rig.tray.drop('flower1', 0, 0);
  rig.step(10);
  rig.tray.drop('flower1', 0, 0);
  rig.step(4.8);
  assert.equal(outcome.done, false, 'at 19.8 s the child may still hit');
  rig.step(0.4);
  assert.equal(outcome.value, 'idle', 'and at 20 s the flower is given');
  assert.equal(rig.tray.calls('putBack').length, 2);
});

test('a drag that is cancelled leaves no listener behind', () => {
  const rig = dragRig();
  const { s, tray, stage, step } = rig;
  const log = [];
  stage.start(function* script() {
    log.push(yield s.race(s.drag('flower1', MOUTH), s.wait(3)));
  });
  step(2.9);
  assert.equal(tray.listeners.length, 1);
  step(0.2);
  assert.deepEqual(log, [undefined], 'the timer won');
  assert.equal(tray.listeners.length, 0, 'the drag that lost is not listening any more');
  tray.drop('flower1', MIDDLE.x, MIDDLE.y);
  assert.deepEqual(tray.calls('remove'), [], 'a drop nobody waits for is not taken');

  const again = runDrag(rig, 'flower2', MOUTH);
  step(1);
  assert.equal(tray.listeners.length, 1);
  stage.stop();
  assert.equal(tray.listeners.length, 0, 'stop takes it away too');
  assert.equal(again.done, false);
  assert.equal(rig.resets(), 1);
  assert.equal(tray.calls('hide').length, 1, 'and puts the tray away');
});

test('a drag over a list of items hears any of them, and says which one was dropped', () => {
  const rig = dragRig();
  const outcome = runDrag(rig, ['flower1', 'flower2', 'flower3'], MOUTH);
  rig.step(0.2);
  assert.equal(rig.tray.listeners.length, 1, 'one listener for all three');
  rig.tray.drop('other', MIDDLE.x, MIDDLE.y); // not one of them: not heard
  rig.tray.drop('flower2', MIDDLE.x + 120, MIDDLE.y); // one of them, missed: home it goes
  assert.deepEqual(rig.tray.log.filter(([call]) => call === 'remove' || call === 'putBack'), [['putBack', 'flower2']]);
  rig.tray.drop('flower3', MIDDLE.x, MIDDLE.y); // the last pocket, on the mouth
  rig.tray.drop('flower1', MIDDLE.x, MIDDLE.y); // in the same frame: the drag is settled, so it is not taken
  rig.step(0.1);
  assert.deepEqual(outcome.value, { id: 'flower3', how: 'dropped' });
  assert.deepEqual(rig.tray.calls('remove'), [['remove', 'flower3']], 'only the one dropped leaves the tray');
  assert.equal(rig.tray.listeners.length, 0);
});

test('a list drag that waits in vain gives the first item still on the list, which leaves the tray', () => {
  const rig = dragRig();
  const outcome = runDrag(rig, ['flower2', 'flower3'], MOUTH, { idle: 20 });
  rig.step(19.8);
  assert.equal(outcome.done, false);
  rig.step(0.4);
  assert.deepEqual(outcome.value, { id: 'flower2', how: 'idle' });
  assert.deepEqual(rig.tray.calls('remove'), [['remove', 'flower2']]);
});

test('a list drag while seeking takes the first item after 2 s', () => {
  const rig = dragRig();
  rig.stage.seeking = true;
  const outcome = runDrag(rig, ['flower3', 'flower1'], MOUTH);
  rig.step(1.9);
  assert.equal(outcome.done, false);
  rig.step(0.1);
  assert.deepEqual(outcome.value, { id: 'flower3', how: 'dropped' });
  assert.deepEqual(rig.tray.calls('remove'), [['remove', 'flower3']]);
});

test('s.tray shows and hides the tray for a script', () => {
  const { s, tray } = dragRig();
  assert.equal(s.tray.show([{ id: 'flower1', icon: 'glowFlower' }, { id: 'flower2', icon: 'glowFlower' }]), DONE);
  assert.deepEqual(tray.calls('show'), [['show', ['flower1', 'flower2']]]);
  assert.equal(s.tray.hide(), DONE);
  assert.equal(tray.calls('hide').length, 1);
});

test('s.drag and s.tray say so when the scene has no tray or no camera, and refuse what makes no sense', () => {
  const bare = createScene({ world: {}, director: {}, ui: {}, voice: {} });
  assert.throws(() => bare.s.drag('a', MOUTH), /tray/);
  assert.throws(() => bare.s.tray.show([]), /tray/);
  assert.throws(() => bare.s.tray.hide(), /tray/);

  const noCamera = createScene({ world: {}, director: {}, ui: { tray: fakeTray() }, voice: {} });
  assert.throws(() => noCamera.s.drag('a', MOUTH), /camera/);

  const { s } = dragRig();
  assert.throws(() => s.drag('', MOUTH), TypeError);
  assert.throws(() => s.drag([], MOUTH), TypeError);
  assert.throws(() => s.drag(['a', ''], MOUTH), TypeError);
  assert.throws(() => s.drag(['a', 'a'], MOUTH), /twice/);
  assert.throws(() => s.drag('a', null), /point/);
  assert.throws(() => s.drag('a', MOUTH, { radius: 0 }), /radius/);
  assert.throws(() => s.drag('a', MOUTH, { idle: -1 }), /idle/);
  assert.throws(() => s.drag('a', MOUTH, { idle: Infinity }), /idle/);
});

// ---------------------------------------------------------------------------------------------
// The tray itself, on a fake page

/**
 * A tray of two flowers whose places in the layout the test chooses, over a canvas that starts at 10, 20.
 * A finger goes down on an item (a.press) and then moves and lets go anywhere on the page: those events
 * go to the document, as they do when the browser does not keep the pointer on the item.
 */
function trayRig() {
  const doc = new FakeDocument(['tray', 'view']);
  doc.getElementById('view').rect = { left: 10, top: 20, width: 800, height: 500 };
  const tray = createTray(doc);
  const drops = [];
  tray.onDrop(drop => drops.push(drop));
  tray.show([{ id: 'a', icon: 'glowFlower' }, { id: 'b', icon: 'glowFlower' }]);
  const element = doc.getElementById('tray');
  element.children[0].rect = { left: 20, top: 200, width: 88, height: 88 }; // a's pocket, centred on 64, 244
  element.children[1].rect = { left: 20, top: 300, width: 88, height: 88 };
  const items = element.findAll(e => e.classList.contains('tray-item'));
  const [a, b] = items;
  a.press = (x = 70, y = 250, options) => a.dispatchEvent(pointerEvent('pointerdown', { x, y, ...options }));
  b.press = (x = 70, y = 350, options) => b.dispatchEvent(pointerEvent('pointerdown', { x, y, ...options }));
  const move = (x, y, options) => doc.dispatchEvent(pointerEvent('pointermove', { x, y, ...options }));
  const lift = (x, y, options) => doc.dispatchEvent(pointerEvent('pointerup', { x, y, ...options }));
  const cancel = options => doc.dispatchEvent(pointerEvent('pointercancel', { ...options }));
  return { doc, tray, element, drops, a, b, items, move, lift, cancel };
}

test('the tray shows its items, and hides', () => {
  const { tray, element, items } = trayRig();
  assert.equal(element.hidden, false);
  assert.equal(element.children.length, 2, 'a pocket for each');
  assert.equal(items.length, 2);
  assert.match(items[0].innerHTML, /<svg/, 'the icon is drawn');

  tray.hide();
  assert.equal(element.hidden, true);
  tray.show([{ id: 'c', icon: '<svg viewBox="0 0 1 1"></svg>' }]);
  assert.equal(element.hidden, false);
  assert.equal(element.children.length, 1, 'show replaces what was there');
  assert.equal(element.findAll(e => e.classList.contains('tray-item'))[0].innerHTML, '<svg viewBox="0 0 1 1"></svg>', 'markup works as an icon');

  assert.throws(() => tray.show([{ id: 'x', icon: 'glowFlower' }, { id: 'x', icon: 'glowFlower' }]), /different ids/);
  assert.throws(() => tray.show([{ id: 'x', icon: 'unicorn' }]), /unicorn/);
  assert.equal(element.children.length, 1, 'a refused show changes nothing');
});

test('a tray prepared ahead of time stays put away, and shows the same pockets later without building them again', () => {
  const doc = new FakeDocument(['tray', 'view']);
  doc.getElementById('view').rect = { left: 10, top: 20, width: 800, height: 500 };
  const tray = createTray(doc);
  const element = doc.getElementById('tray');
  element.hidden = true; // as index.html has it
  const flowers = [{ id: 'flower-1', icon: 'glowFlower' }, { id: 'flower-2', icon: 'glowFlower' }];
  tray.prepare(flowers);
  assert.equal(element.hidden, true, 'prepared, it stays hidden');
  assert.equal(element.children.length, 2, 'with its pockets built');
  const pockets = [...element.children];
  const drops = [];
  tray.onDrop(drop => { drops.push(drop); tray.remove(drop.id); });
  tray.show(flowers.map(item => ({ ...item })));
  assert.equal(element.hidden, false);
  assert.deepEqual([...element.children], pockets, 'the same pockets: nothing is built as it shows');
  const [first] = element.findAll(e => e.classList.contains('tray-item'));
  pockets[0].rect = { left: 20, top: 200, width: 88, height: 88 };
  first.dispatchEvent(pointerEvent('pointerdown', { x: 70, y: 250 }));
  doc.dispatchEvent(pointerEvent('pointerup', { x: 300, y: 250 }));
  assert.equal(drops.length, 1, 'and they carry as ever');
  assert.equal(first.classList.contains('gone'), true);
  tray.hide();
  tray.show(flowers);
  assert.deepEqual([...element.children], pockets, 'shown again, the same pockets...');
  assert.equal(first.classList.contains('gone'), false, '...full again');
  tray.show([{ id: 'other', icon: 'glowFlower' }]);
  assert.equal(element.children.length, 1, 'other items get pockets of their own');
  assert.throws(() => tray.prepare([{ id: 'x', icon: 'unicorn' }]), /unicorn/);
});

test('the tray carries an item under the finger and says where it was let go, in canvas pixels', () => {
  const { doc, a, drops, move, lift } = trayRig();
  const down = pointerEvent('pointerdown', { x: 70, y: 250 });
  a.dispatchEvent(down);
  assert.equal(down.defaultPrevented, true, 'the browser does not start a drag of its own');
  assert.deepEqual([...a.captured], [1], 'the item asks to keep the finger, wherever it goes');
  assert.equal(a.classList.contains('dragging'), true);
  assert.equal(doc.listenerCount('pointermove'), 1, 'and the page listens while it is carried');

  move(270, 150);
  assert.equal(a.style['--dx'], '200px');
  assert.equal(a.style['--dy'], `${-100 - DRAG_LIFT}px`, 'it floats above the finger, which would hide it');
  assert.deepEqual(drops, []);

  lift(270, 150);
  assert.deepEqual(drops, [{ id: 'a', x: 64 + 200 - 10, y: 244 - 100 - DRAG_LIFT - 20 }], 'where the flower is, from the canvas corner');
  assert.equal(a.captured.size, 0);
  assert.equal(doc.listenerCount('pointermove'), 0, 'afterwards it listens to nothing');
  assert.equal(doc.listenerCount('pointerup'), 0);
  assert.equal(doc.listenerCount('pointercancel'), 0);
});

test('an item nobody takes goes back to its pocket', () => {
  const { a, drops, move, lift } = trayRig();
  a.press();
  move(400, 400);
  lift(400, 400);
  assert.equal(drops.length, 1);
  assert.equal(a.classList.contains('dragging'), false);
  assert.equal(a.classList.contains('gone'), false);
  assert.equal(a.style['--dx'], undefined);
  assert.equal(a.style['--dy'], undefined);

  a.press(); // and it can be picked up again
  assert.equal(a.classList.contains('dragging'), true);
});

test('a listener can put an item back or take it away', () => {
  const { tray, a, b, drops, move, lift } = trayRig();
  const stop = tray.onDrop(({ id, x }) => (x > 300 ? tray.remove(id) : tray.putBack(id)));
  const carry = (x, y) => {
    a.press();
    move(x, y);
    lift(x, y);
  };
  carry(100, 250);
  assert.equal(a.classList.contains('gone'), false, 'put back');
  assert.equal(a.classList.contains('dragging'), false);

  carry(500, 250);
  assert.equal(a.classList.contains('gone'), true, 'taken');
  assert.equal(a.classList.contains('dragging'), false);
  assert.equal(a.style['--dx'], '430px', 'it goes where it was let go, not home');

  a.press();
  assert.equal(a.classList.contains('dragging'), false, 'an item that is gone cannot be picked up');
  assert.equal(drops.length, 2);

  b.press();
  assert.equal(b.classList.contains('dragging'), true, 'the other one is still there');

  stop();
  tray.putBack('nothing');
  tray.remove('nothing'); // not there: fine
});

test('a cancelled touch sends the item home without a drop', () => {
  const { doc, a, drops, move, lift, cancel } = trayRig();
  a.press();
  move(300, 250);
  cancel(); // browsers do not promise coordinates here
  assert.deepEqual(drops, []);
  assert.equal(a.classList.contains('dragging'), false);
  assert.equal(a.captured.size, 0);
  assert.equal(doc.listenerCount('pointermove'), 0);
  lift(300, 250); // nothing follows it any more
  assert.deepEqual(drops, []);
});

test('only the first finger carries an item, and only the main button', () => {
  const { a, b, drops, move, lift } = trayRig();
  a.press(70, 250, { id: 1 });
  b.press(70, 350, { id: 2 });
  assert.equal(b.classList.contains('dragging'), false, 'a second finger waits for the first');
  move(500, 500, { id: 2 });
  assert.equal(a.style['--dx'], '0px', 'and cannot move the first one\'s item');
  lift(500, 500, { id: 2 });
  assert.deepEqual(drops, []);
  lift(70, 250, { id: 1 });
  assert.equal(drops.length, 1);

  b.press(70, 350, { id: 3, button: 2 });
  assert.equal(b.classList.contains('dragging'), false, 'a right button does not carry');
});

test('a press that ended without the tray hearing does not leave it stuck', () => {
  const { doc, a, b, drops, lift } = trayRig();
  a.press(70, 250, { id: 1 });
  // The button is let go outside the page and no pointerup comes. The same pointer goes down again.
  b.press(70, 350, { id: 1 });
  assert.equal(a.classList.contains('dragging'), false, 'the first item is home again');
  assert.equal(b.classList.contains('dragging'), true, 'and the new press carries');
  assert.equal(doc.listenerCount('pointermove'), 1, 'one gesture, one set of listeners');
  lift(70, 350, { id: 1 });
  assert.deepEqual(drops.map(drop => drop.id), ['b']);
});

test('taking away or hiding an item that is being carried ends the carrying with no drop', () => {
  const { doc, tray, a, b, drops, move, lift } = trayRig();
  a.press();
  tray.remove('a');
  move(300, 250);
  lift(300, 250);
  assert.deepEqual(drops, []);
  assert.equal(a.captured.size, 0);
  assert.equal(doc.listenerCount('pointerup'), 0);

  b.press();
  assert.equal(b.classList.contains('dragging'), true, 'the finger is free for the next item');
  tray.hide();
  lift(300, 350);
  assert.deepEqual(drops, []);
  assert.equal(b.classList.contains('dragging'), false);
  assert.equal(doc.listenerCount('pointerup'), 0);
});

test('onDrop gives back the way to stop listening, and a listener that throws does not stop the others', () => {
  const { tray, a, drops, lift } = trayRig();
  const heard = [];
  const stop = tray.onDrop(drop => heard.push(drop.id));
  const reported = [];
  const consoleError = console.error;
  console.error = (...args) => reported.push(args);
  try {
    tray.onDrop(() => { throw new Error('boom'); });
    tray.onDrop(drop => heard.push(`after ${drop.id}`));
    const carry = () => {
      a.press();
      lift(70, 250);
    };
    carry();
    assert.deepEqual(heard, ['a', 'after a']);
    assert.equal(reported.length, 1);
    assert.match(String(reported[0][1]), /boom/);

    stop();
    stop(); // twice is fine
    carry();
    assert.deepEqual(heard, ['a', 'after a', 'after a']);
    assert.equal(drops.length, 2);
  } finally {
    console.error = consoleError;
  }
});

test('what sits over the world passes taps through, except buttons and the things to carry (R18)', () => {
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  /** The declarations of the rule whose selector is exactly `selector`. */
  const rule = selector => {
    const found = new RegExp(`^${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm').exec(css); // rules start their line
    assert.ok(found, `${selector} has a rule`);
    return found[1];
  };
  assert.match(rule('.caption'), /pointer-events:\s*none/, 'a tap on the caption reaches the world behind it');
  assert.match(rule('.choices'), /pointer-events:\s*none/, 'so does one beside the choices');
  assert.match(rule('.choices button'), /pointer-events:\s*auto/, 'but the buttons take theirs');
  assert.match(rule('.tray'), /pointer-events:\s*none/);
  assert.match(rule('.tray-item'), /pointer-events:\s*auto/);
  assert.match(rule('.journal-flights'), /pointer-events:\s*none/);
  assert.match(rule('[hidden]'), /display:\s*none\s*!important/, 'a rule that sets display cannot show what the page hid');
});

test('the interface keeps STYLE.md section 10: choices 64 px high on one line, captions 24 px, and the last caption reads clearly over the book', () => {
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const rule = selector => {
    const found = new RegExp(`^${selector.replace(/[.[\]#]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm').exec(css);
    assert.ok(found, `${selector} has a rule`);
    return found[1];
  };
  const px = (declarations, property) => {
    const value = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`).exec(declarations)?.[1]?.trim();
    assert.ok(value, `${property} is set`);
    const clamp = /^clamp\(\s*([\d.]+)px/.exec(value); // its smallest
    return Number(clamp ? clamp[1] : /^([\d.]+)px$/.exec(value)?.[1]);
  };
  assert.ok(px(rule('.choices button'), 'min-height') >= 64, 'a choice is a 64 px touch target');
  assert.match(rule('.choices button'), /white-space:\s*nowrap/, 'and its words stay on one line');
  assert.doesNotMatch(rule('.choices'), /left:\s*50%/, 'the row is not held to half the screen (it wrapped at 820 px)');
  assert.match(rule('.choices'), /justify-content:\s*center/);
  assert.ok(px(rule('.caption-text'), 'font-size') >= 24, 'captions at least 24 px');
  // The scene fades to 0.45 and opens the book under Mosi's last line: the caption stands over both, so it is not dimmed.
  const zOf = selector => Number(/z-index:\s*(-?\d+)/.exec(rule(selector))?.[1] ?? 0);
  assert.ok(zOf('.caption') > zOf('.fade') && zOf('.caption') > zOf('.journal-page'), 'the caption is above the fade and the open book');
  assert.match(rule('.caption'), /pointer-events:\s*none/, 'and still lets taps through');
});

test('putting the stage UI away puts the tray away', () => {
  const doc = new FakeDocument(['caption', 'choices', 'fade', 'tray', 'view']);
  for (const name of ['caption-speaker', 'caption-text']) {
    const part = doc.createElement('span');
    part.className = name;
    doc.getElementById('caption').append(part);
  }
  const original = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ opacity: '0' });
  try {
    const ui = createStageUI(doc);
    ui.tray.show([{ id: 'a', icon: 'glowFlower' }]);
    assert.equal(doc.getElementById('tray').hidden, false);
    ui.reset();
    assert.equal(doc.getElementById('tray').hidden, true);
  } finally {
    if (original) globalThis.getComputedStyle = original;
    else delete globalThis.getComputedStyle;
  }
});
