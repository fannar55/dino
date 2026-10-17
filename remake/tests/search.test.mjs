import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { searchFlow } from '../engine/scene/search.js';
import { createScene } from '../engine/scene/scene.js';
import { createDirector } from '../engine/camera/director.js';
import { createPointer } from '../engine/input/pointer.js';
import { createPointResolver } from '../engine/points.js';
import { Handle } from '../engine/handle.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Three flowers, each with the line Mosi says to hint at it.
const FLOWERS = [
  { name: 'stone', point: [-4, 0.4, -3], hint: 'hint.stone' },
  { name: 'ferns', point: [3, 0.3, -5], hint: 'hint.ferns' },
  { name: 'tree', point: [1, 2.2, -8], hint: 'hint.tree' },
];
const LINES = {
  'hint.stone': { text: 'I see something glitter by the big stone!' },
  'hint.ferns': { text: 'What about under the ferns?' },
  'hint.tree': { text: 'Look up in the little tree!' },
};
const EXPLORE = { yaw: [-60, 60], pitch: [-15, 15] };

/** A pointer that remembers what the scene asked of it, and lets a test tap and drag like a finger. */
function fakePointer() {
  const targets = new Map();
  const listeners = { tap: [], drag: [] };
  const emit = (event, payload) => [...listeners[event]].forEach(fn => fn(payload));
  return {
    targets,
    listeners,
    addTarget: (name, spec) => targets.set(name, spec),
    removeTarget: name => targets.delete(name),
    on(event, fn) {
      listeners[event].push(fn);
      return () => {
        const i = listeners[event].indexOf(fn);
        if (i >= 0) listeners[event].splice(i, 1);
      };
    },
    /** A tap on a target; a target that is not there is not hit, as with the real pointer. */
    tap: name => emit('tap', { name: targets.has(name) ? name : null, x: 0, y: 0 }),
    drag: (dx, dy) => emit('drag', { dx, dy, phase: 'move', x: 0, y: 0 }),
  };
}

/** A director that records what the search asks of it. Its handles are real ones. */
function fakeDirector(clock) {
  const calls = { explore: [], look: [], hint: [] };
  return {
    calls,
    explore(options) {
      const handle = new Handle('explore');
      calls.explore.push({ options, handle });
      return handle;
    },
    look: (dx, dy) => calls.look.push([dx, dy]),
    hint(point) {
      const handle = new Handle('hint');
      calls.hint.push({ point, handle, time: clock() });
      return handle;
    },
    stop() {},
    handheld() {},
  };
}

/**
 * A scene over the fake pointer and director. `search(options)` runs searchFlow on the three flowers,
 * recording every find in `found` and every line said in `said`; `run(seconds)` steps the scene in
 * tenths of a second.
 */
function rig() {
  const pointer = fakePointer();
  const captions = [];
  const ui = {
    caption: (who, text) => {
      captions.push({ who, text, cleared: false });
      return captions.length;
    },
    clearCaption: id => { captions[id - 1].cleared = true; },
    reset() {},
  };
  let stage = null;
  const director = fakeDirector(() => stage.s.time);
  stage = createScene({ world: { actors: new Map(), chapter: { lines: LINES } }, director, ui, voice: { stop() {} }, pointer });

  const said = [];
  const s = Object.create(stage.s); // the real scene API, with s.say recorded
  s.say = (speaker, line, options) => {
    said.push({ time: stage.s.time, speaker, line });
    return stage.s.say(speaker, line, options);
  };
  const found = [];
  const search = ({ onFound, ...options } = {}) => stage.start(() => searchFlow({ s, director }, {
    targets: FLOWERS,
    onFound(name, index) {
      found.push({ name, index, time: stage.s.time });
      return onFound?.(name, index);
    },
    ...options,
  }));
  const run = (seconds, dt = 0.1) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) stage.update(dt);
  };
  return { stage, pointer, director, captions, said, found, search, run };
}

test('search completes when all targets are tapped in any order', () => {
  const { pointer, director, found, said, search, run } = rig();
  const task = search();
  run(1);
  assert.deepEqual([...pointer.targets.keys()], ['stone', 'ferns', 'tree'], 'every flower can be tapped');

  pointer.tap('tree');
  run(0.5);
  pointer.tap('stone');
  pointer.tap('tree'); // found already: nothing is there to tap any more
  run(0.5);
  assert.equal(task.done, false, 'one still to find');
  assert.deepEqual([...pointer.targets.keys()], ['ferns'], 'a found flower is taken off the pointer');

  pointer.tap('ferns');
  run(0.5);
  assert.equal(task.done, true);
  assert.deepEqual(found.map(f => [f.name, f.index]), [['tree', 0], ['stone', 1], ['ferns', 2]], 'onFound hears the order they were found in');
  assert.equal(pointer.targets.size, 0);
  assert.equal(director.calls.hint.length, 0, 'a child who finds them all needs no hint');
  assert.equal(said.length, 0);
});

test('a hint pans to the next unfound target after 12 s idle and repeats every 12 s', () => {
  const { director, said, pointer, found, search, run } = rig();
  search();
  run(11.8);
  assert.equal(director.calls.hint.length, 0, 'not before 12 s');
  run(0.4);
  assert.equal(director.calls.hint.length, 1);
  assert.deepEqual(director.calls.hint[0].point, FLOWERS[0].point, 'the first flower on the list');
  assert.deepEqual(said, [{ time: 12, speaker: 'mosi', line: 'hint.stone' }], 'and Mosi says its line');

  run(12);
  assert.equal(director.calls.hint.length, 2);
  assert.equal(director.calls.hint[1].time, 24, 'again 12 s later, the flower is still not found');
  assert.deepEqual(director.calls.hint[1].point, FLOWERS[0].point);
  assert.deepEqual(said.map(l => l.line), ['hint.stone', 'hint.stone']);

  // The child finds another flower: the hints go on to the first one still unfound, 12 s after the find.
  pointer.tap('ferns');
  run(0.2);
  const at = found[0].time;
  run(11.8);
  assert.equal(director.calls.hint.length, 2, 'the idle time starts again at a find');
  run(0.4);
  assert.equal(director.calls.hint.length, 3);
  assert.ok(near(director.calls.hint[2].time, at + 12));
  assert.deepEqual(director.calls.hint[2].point, FLOWERS[0].point);

  // Now the stone: the hints turn to the tree.
  pointer.tap('stone');
  run(12.4);
  assert.deepEqual(director.calls.hint[3].point, FLOWERS[2].point);
  assert.equal(said.at(-1).line, 'hint.tree');
});

test('an idle child: after three hints the target counts as found and the search ends', () => {
  const { director, said, pointer, found, search, run } = rig();
  const task = search();
  run(47.9);
  assert.deepEqual(director.calls.hint.map(h => h.time), [12, 24, 36]);
  assert.deepEqual(found, [], 'three hints, nothing found yet');
  run(0.2);
  assert.deepEqual(found, [{ name: 'stone', index: 0, time: 48 }], 'the next hint time finds it instead of hinting again');
  assert.equal(director.calls.hint.length, 3);
  assert.equal(pointer.targets.has('stone'), false, 'and it is taken off the pointer, as a tap would');

  run(96);
  assert.equal(task.done, true, 'the search always ends');
  assert.deepEqual(found.map(f => [f.name, f.index, f.time]), [['stone', 0, 48], ['ferns', 1, 96], ['tree', 2, 144]]);
  assert.deepEqual(director.calls.hint.map(h => h.point), [
    ...Array(3).fill(FLOWERS[0].point), ...Array(3).fill(FLOWERS[1].point), ...Array(3).fill(FLOWERS[2].point),
  ]);
  assert.deepEqual(director.calls.hint.map(h => h.time), [12, 24, 36, 60, 72, 84, 108, 120, 132]);
  assert.equal(said.length, 9);
  assert.equal(pointer.targets.size, 0);
});

test('seeking finds one target every 3 s', () => {
  const { stage, director, said, pointer, found, search, run } = rig();
  stage.seeking = true;
  const task = search();
  run(2.9);
  assert.deepEqual(found, []);
  pointer.tap('tree'); // a seek has no player: a tap changes nothing
  run(0.2);
  assert.deepEqual(found.map(f => [f.name, f.index, f.time]), [['stone', 0, 3]], 'the first on the list, at 3 s');
  run(2.8);
  assert.equal(found.length, 1);
  run(0.2);
  assert.deepEqual(found.map(f => f.time), [3, 6]);
  run(3);
  assert.deepEqual(found.map(f => [f.name, f.time]), [['stone', 3], ['ferns', 6], ['tree', 9]]);
  assert.equal(task.done, true);
  assert.equal(director.calls.hint.length, 0, 'no hints while seeking');
  assert.equal(said.length, 0);
  assert.equal(pointer.targets.size, 0);
});

test('hint counts belong to the target, and a find starts the idle time again', () => {
  const { director, found, pointer, search, run } = rig();
  search();
  run(24.1);
  assert.equal(director.calls.hint.length, 2, 'two hints for the stone');
  pointer.tap('ferns');
  run(0.1);
  const at = found[0].time;
  run(11.8);
  assert.equal(director.calls.hint.length, 2);
  run(0.4);
  assert.equal(director.calls.hint.length, 3, 'the third hint for the stone, though the ferns were found in between');
  run(12);
  assert.equal(director.calls.hint.length, 3, 'a fourth time it is found instead');
  assert.deepEqual(found.map(f => f.name), ['ferns', 'stone']);
  assert.ok(near(found[1].time, at + 24));
});

test('a flower tapped during a hint is found once, and the hint stops', () => {
  const { director, captions, pointer, found, search, run } = rig();
  search();
  run(12.5);
  const hint = director.calls.hint[0];
  assert.equal(captions.length, 1, 'Mosi is giving his hint');
  assert.equal(captions[0].cleared, false);
  assert.equal(hint.handle.cancelled, false);

  pointer.tap('ferns'); // not the one he is hinting at
  pointer.tap('ferns'); // a double tap
  run(0.3);
  assert.deepEqual(found.map(f => f.name), ['ferns'], 'found, and only once');
  assert.equal(hint.handle.cancelled, true, 'the pan stops: the next thing the child sees is the flower being picked');
  assert.equal(captions[0].cleared, true, 'and so does the line');

  pointer.tap('stone'); // the flower he hinted at
  run(0.3);
  assert.deepEqual(found.map(f => f.name), ['ferns', 'stone']);
});

test('a new hint takes over from the one before', () => {
  const { director, captions, search, run } = rig();
  search({ hintAfter: 2 }); // a hint line takes about 4 s to say: the second hint comes while it is still being said
  run(2.5);
  const first = director.calls.hint[0];
  assert.equal(captions[0].cleared, false);
  run(2);
  assert.equal(director.calls.hint.length, 2);
  assert.equal(first.handle.cancelled, true, 'one hint at a time');
  assert.equal(captions[0].cleared, true);
  assert.equal(captions[1].cleared, false);
});

test('the search waits for what onFound returns before it takes taps again', () => {
  const { stage, director, pointer, found, search, run } = rig();
  search({ onFound: () => stage.s.wait(3) }); // Egill picks the flower and Mosi counts
  run(1);
  pointer.tap('stone');
  run(0.2);
  pointer.tap('ferns'); // while the first is being picked
  run(2);
  assert.deepEqual(found.map(f => f.name), ['stone'], 'that tap is not kept for later');
  assert.equal(pointer.targets.has('ferns'), true);

  run(1.5);
  pointer.tap('ferns');
  run(0.2);
  assert.deepEqual(found.map(f => f.name), ['stone', 'ferns']);

  // The idle time counts from the end of onFound: 3 s of picking, then 12 s of quiet.
  run(14.8);
  assert.equal(director.calls.hint.length, 0);
  run(0.4);
  assert.equal(director.calls.hint.length, 1);
  assert.ok(near(director.calls.hint[0].time, found[1].time + 3 + 12));
});

test('onFound can return a generator to wait for, but a number is not a wait', () => {
  const first = rig();
  first.search({ onFound: () => (function* picking() { yield first.stage.s.wait(2); })() });
  first.run(1);
  first.pointer.tap('stone');
  first.run(0.2);
  first.pointer.tap('ferns');
  first.run(1);
  assert.equal(first.found.length, 1, 'the generator keeps the search busy for 2 s');

  const second = rig();
  const seen = [];
  second.search({ onFound: name => seen.push(name) }); // an arrow function that happens to return push()'s count
  second.run(1);
  second.pointer.tap('stone');
  second.run(0.2);
  second.pointer.tap('ferns');
  second.run(0.2);
  assert.deepEqual(seen, ['stone', 'ferns'], 'no wait for a number');
});

test('each target is a tap target of 0.5 m unless it says otherwise', () => {
  const { pointer, search, run } = rig();
  search({ targets: [{ ...FLOWERS[0], radius: 0.8 }, FLOWERS[1]] });
  run(0.1);
  assert.deepEqual(pointer.targets.get('stone'), { point: FLOWERS[0].point, radius: 0.8 });
  assert.deepEqual(pointer.targets.get('ferns'), { point: FLOWERS[1].point, radius: 0.5 });
});

test('hintAfter, helpAfter and speaker are the knobs of the hint', () => {
  const { director, said, found, search, run } = rig();
  search({ hintAfter: 5, helpAfter: 1, speaker: 'egill', targets: FLOWERS.slice(0, 1) });
  run(4.8);
  assert.equal(director.calls.hint.length, 0);
  run(0.4);
  assert.deepEqual(said, [{ time: 5, speaker: 'egill', line: 'hint.stone' }]);
  run(4.8);
  assert.deepEqual(found.map(f => [f.name, f.time]), [['stone', 10]], 'one hint, then it is found');
  assert.equal(director.calls.hint.length, 1);
});

test('a search needs a hint line for each target and a different name for each', () => {
  const { stage, director } = rig();
  const flow = targets => searchFlow({ s: stage.s, director }, { targets });
  assert.throws(() => flow([FLOWERS[0], { ...FLOWERS[1], name: 'stone' }]).next(), /stone/);
  assert.throws(() => flow([{ name: 'bare', point: [0, 0, 0] }]).next(), /bare.*hint/);
});

test('s.search turns the camera free, wires drags to look, and undoes both when the search ends', () => {
  const { stage, pointer, director, run } = rig();
  const explore = { yaw: [-50, 50], pitch: [-10, 15], speed: 0.2 };
  const task = stage.s.search({ explore, targets: FLOWERS.slice(0, 2) });
  run(0.1);
  assert.equal(director.calls.explore.length, 1);
  assert.deepEqual(director.calls.explore[0].options, explore);
  assert.equal(pointer.listeners.drag.length, 1);

  pointer.drag(12, -3);
  pointer.drag(0, 5);
  assert.deepEqual(director.calls.look, [[12, -3], [0, 5]], 'what the finger moves is what the camera is told');

  pointer.tap('stone');
  pointer.tap('ferns');
  run(0.2);
  pointer.tap('ferns');
  run(0.2);
  assert.equal(task.done, true);
  assert.equal(director.calls.explore[0].handle.cancelled, true, 'free look is over, and the view stays where it is');
  assert.equal(pointer.listeners.drag.length, 0);
  assert.equal(pointer.targets.size, 0);
  pointer.drag(40, 40);
  assert.equal(director.calls.look.length, 2, 'later drags are not for the camera');
});

test('a search that is cancelled puts everything back: free look, drags, targets and the hint under way', () => {
  for (const [how, end] of [['cancelled', ({ task }) => task.cancel()], ['stopped with the scene', ({ stage }) => stage.stop()]]) {
    const { stage, pointer, director, captions, run } = rig();
    const task = stage.s.search({ explore: EXPLORE, targets: FLOWERS });
    run(12.5);
    const hint = director.calls.hint[0];
    assert.equal(captions[0].cleared, false, `${how}: Mosi is in the middle of a hint`);

    end({ task, stage });
    assert.equal(director.calls.explore[0].handle.cancelled, true, how);
    assert.equal(hint.handle.cancelled, true, how);
    assert.equal(captions[0].cleared, true, how);
    assert.equal(pointer.listeners.drag.length, 0, how);
    assert.equal(pointer.targets.size, 0, how);
    run(30);
    assert.equal(director.calls.hint.length, 1, `${how}: no more hints`);
  }
});

test('without a pointer, s.search says so', () => {
  const { s } = createScene({ world: {}, director: {}, ui: {}, voice: {} });
  assert.throws(() => s.search({ explore: EXPLORE, targets: FLOWERS }), /pointer/);
});

// The real director, pointer and scene together: an 800 x 500 canvas and a camera 10 m from the
// flowers, looking straight at them.
function realRig() {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { camera, heightAt: () => 0, actors: new Map(), chapter: { lines: LINES } };
  world.resolvePoint = createPointResolver(world);
  const director = createDirector({ camera, world, lint: false });
  director.cut({ position: [0, 1.4, 10], target: [0, 1.4, 0], fov: 40 }, { check: false });
  const rect = { left: 0, top: 0, width: 800, height: 500 };
  const canvas = Object.assign(new EventTarget(), { getBoundingClientRect: () => rect });
  const pointer = createPointer({ canvas, camera, world });
  const captions = [];
  const ui = {
    caption: (who, text) => {
      captions.push({ text, cleared: false });
      return captions.length;
    },
    clearCaption: id => { captions[id - 1].cleared = true; },
    reset() {},
  };
  const stage = createScene({ world, director, ui, voice: { stop() {} }, pointer });

  const frame = dt => {
    stage.update(dt);
    director.update(dt);
  };
  const run = seconds => {
    for (let i = 0; i < Math.round(seconds * 30); i++) frame(1 / 30);
  };
  const finger = (type, x, y) => {
    const event = new Event(type);
    Object.defineProperties(event, { pointerId: { value: 1 }, clientX: { value: x }, clientY: { value: y }, button: { value: 0 } });
    canvas.dispatchEvent(event);
  };
  const screenOf = point => {
    const p = new THREE.Vector3(...point).project(camera);
    return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
  };
  const tapOn = point => {
    const { x, y } = screenOf(point);
    finger('pointerdown', x, y);
    finger('pointerup', x, y);
  };
  /** Drag from the middle of the canvas by (dx, dy) pixels, about 10 px a frame. */
  const drag = (dx, dy = 0) => {
    const steps = Math.ceil(Math.hypot(dx, dy) / 10);
    finger('pointerdown', 400, 250);
    for (let i = 1; i <= steps; i++) {
      finger('pointermove', 400 + (dx * i) / steps, 250 + (dy * i) / steps);
      frame(1 / 30);
    }
    finger('pointerup', 400 + dx, 250 + dy);
  };
  /** Degrees the camera has turned to the right of straight ahead. */
  const turned = () => {
    const f = camera.getWorldDirection(new THREE.Vector3());
    return THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z));
  };
  return { director, stage, captions, run, drag, tapOn, screenOf, turned };
}

const NEAR = { name: 'near', point: [3, 1, 0], hint: 'hint.stone' }; // 17 degrees to the right: in view
const FAR = { name: 'far', point: [-9, 1, 0], hint: 'hint.ferns' }; // 42 degrees to the left: out of view

test('the child drags to look around, and taps what they find', () => {
  const { director, stage, run, drag, tapOn, screenOf, turned } = realRig();
  const found = [];
  const task = stage.s.search({ explore: EXPLORE, targets: [NEAR, FAR], onFound: name => { found.push(name); } });
  run(0.5);
  assert.equal(director.mode, 'explore');
  assert.ok(screenOf(FAR.point).x < 0, 'the far flower is out of view');

  tapOn(NEAR.point);
  run(0.2);
  assert.deepEqual(found, ['near']);

  drag(300); // the world follows the finger: 300 px at 0.15 degrees each turns the view 45 degrees to the left
  run(1);
  assert.ok(near(turned(), -45, 0.01), `turned ${turned()} degrees`);
  const { x } = screenOf(FAR.point);
  assert.ok(x > 0 && x < 800, `the far flower is on screen now, at x ${x.toFixed(0)}`);

  tapOn(FAR.point);
  run(0.2);
  assert.deepEqual(found, ['near', 'far']);
  assert.equal(task.done, true);
  assert.equal(director.mode, 'still', 'free look has ended and the camera holds');
  assert.equal(director.warnings.length, 0);
});

test('an idle child is shown the way: the hint pans to the flower, and a tap finds it', () => {
  const { director, stage, captions, run, tapOn, screenOf } = realRig();
  const found = [];
  stage.s.search({ explore: EXPLORE, targets: [FAR], onFound: name => { found.push(name); } });
  run(11.9);
  assert.ok(screenOf(FAR.point).x < 0);
  run(0.3);
  assert.equal(captions.length, 1, 'Mosi starts his hint');
  assert.equal(director.mode, 'explore', 'and the child still has free look');

  run(7); // the pan takes about 5 s: 42 degrees at the style guide's pan speed
  const { x, y } = screenOf(FAR.point);
  assert.ok(near(x, 400, 0.01) && near(y, 250, 0.01), `the flower is in the middle of the screen: ${x.toFixed(2)}, ${y.toFixed(2)}`);
  assert.equal(director.warnings.length, 0, 'a hint never breaks the camera rules');

  tapOn(FAR.point);
  run(0.2);
  assert.deepEqual(found, ['far']);
});

test('a drag during a hint hands the camera back to the child, and the next hint pans again', () => {
  const { director, stage, captions, run, drag, screenOf, turned } = realRig();
  stage.s.search({ explore: EXPLORE, targets: [FAR] });
  run(13); // a second into the pan
  const before = turned();
  assert.ok(before < -1 && before > -10, `on its way: ${before}`);
  assert.equal(captions[0].cleared, false);

  drag(-20); // the finger moves away from the flower: the view turns the other way, by 3 degrees
  assert.equal(captions[0].cleared, false, 'Mosi finishes his sentence, only the pan gives way');
  run(2);
  // The pan went on for the one frame before the finger had moved the 12 px that make it a drag.
  assert.ok(near(turned(), before + 3, 0.5), `turned ${turned()}, was ${before}`);
  assert.ok(screenOf(FAR.point).x < 0, 'the pan did not go on to the flower');
  assert.equal(director.mode, 'explore');

  run(2.5); // 17 s: Mosi's line has ended by itself
  assert.equal(captions[0].cleared, true);
  run(13); // 30 s: the hint at 24 s has panned from here
  const { x } = screenOf(FAR.point);
  assert.ok(near(x, 400, 0.01), `the next hint found the flower: x ${x.toFixed(2)}`);
  assert.equal(director.warnings.length, 0);
});

// Free look without a search (spec scene 1: the child may drag to look around a little): s.lookAround hands the camera to the
// finger within the limits for a number of seconds, the same wiring as s.search, and puts it back when the time is up.
test('s.lookAround turns the camera free for its seconds, wires drags to look, then holds the view', () => {
  const { stage, pointer, director, run } = rig();
  const explore = { yaw: [-30, 30], pitch: [-8, 12], speed: 0.15 };
  let ended = null;
  stage.start(function* script() {
    yield stage.s.lookAround(explore, 6);
    ended = stage.s.time;
  });
  run(0.1);
  assert.equal(director.calls.explore.length, 1, 'the camera is the finger\'s');
  assert.deepEqual(director.calls.explore[0].options, explore);
  pointer.drag(20, -4);
  assert.deepEqual(director.calls.look, [[20, -4]], 'what the finger moves is what the camera is told');
  run(5.8);
  assert.equal(ended, null);
  assert.equal(director.calls.explore[0].handle.cancelled, false);
  run(0.2);
  assert.ok(ended !== null && near(ended, 6, 1e-6), `it ends by itself at 6 s, not ${ended}`);
  assert.equal(director.calls.explore[0].handle.cancelled, true, 'free look is over, and the view stays where the child left it');
  assert.equal(pointer.listeners.drag.length, 0);
  pointer.drag(40, 40);
  assert.equal(director.calls.look.length, 1, 'later drags are not for the camera');
});

test('s.lookAround cut short, by a race or the scene stopping, puts the camera and the finger back', () => {
  for (const [how, end] of [['raced', null], ['stopped with the scene', ({ stage }) => stage.stop()]]) {
    const { stage, pointer, director, run } = rig();
    const task = how === 'raced'
      ? stage.start(function* script() { yield stage.s.race(stage.s.lookAround(EXPLORE, 30), stage.s.wait(2)); })
      : stage.s.lookAround(EXPLORE, 30);
    run(1);
    assert.equal(pointer.listeners.drag.length, 1, how);
    if (end) end({ stage });
    else run(1.1);
    assert.equal(director.calls.explore[0].handle.cancelled, true, how);
    assert.equal(pointer.listeners.drag.length, 0, how);
    if (how === 'raced') assert.equal(task.done, true);
  }
});

test('s.lookAround while seeking only waits its seconds, and needs a pointer and a time', () => {
  const { stage, director, run } = rig();
  stage.seeking = true;
  let ended = null;
  stage.start(function* script() {
    yield stage.s.lookAround(EXPLORE, 4);
    ended = stage.s.time;
  });
  run(4.1);
  assert.ok(near(ended, 4, 1e-6), `a capture's timeline stays fixed: ${ended}`);
  assert.equal(director.calls.explore[0].handle.cancelled, true);
  const { s } = createScene({ world: {}, director: {}, ui: {}, voice: {} });
  assert.throws(() => s.lookAround(EXPLORE, 4), /pointer/);
  assert.throws(() => stage.s.lookAround(EXPLORE, -1), TypeError);
  assert.throws(() => stage.s.lookAround(EXPLORE), TypeError);
});

test('with the real director, a drag in s.lookAround turns the view and the limits hold it', () => {
  const { director, stage, run, drag, turned } = realRig();
  stage.s.lookAround({ yaw: [-20, 20], pitch: [-5, 5] }, 10);
  run(0.5);
  drag(-100); // the finger moves left 100 px: the view turns right, 15 degrees at 0.15 a pixel
  run(1);
  assert.ok(near(turned(), 15, 0.5), `turned ${turned().toFixed(2)} degrees`);
  drag(-400); // far beyond the limit
  run(1.5);
  assert.ok(near(turned(), 20, 0.05), `held at the 20 degree limit: ${turned().toFixed(2)}`);
  assert.equal(director.mode, 'explore');
  run(8);
  assert.equal(director.mode, 'still', 'and when the time is up the camera holds where it was left');
  assert.ok(near(turned(), 20, 0.05));
});
