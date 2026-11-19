import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwipe, SWIPE } from '../engine/input/swipe.js';

// The up stroke (engine/input/swipe.js): chapter 4's wind task asks the child to stroke up the screen for a gust, anywhere on it, and
// a tap counts too (spec 4.3). Fed here by a stand-in for the pointer (engine/input/pointer.js), whose drags and taps it listens to.

function fakePointer() {
  const listeners = { tap: [], drag: [] };
  return {
    listeners,
    on(event, fn) {
      listeners[event].push(fn);
      return () => listeners[event].splice(listeners[event].indexOf(fn), 1);
    },
    tap(x = 10, y = 20) { for (const fn of [...listeners.tap]) fn({ name: null, x, y }); },
    /** A drag from (x, y) by (dx, dy) in `steps` moves, as the pointer reports one: start, moves, end. */
    drag(x, y, dx, dy, steps = 4) {
      const fns = () => [...listeners.drag];
      let px = x, py = y;
      for (let i = 1; i <= steps; i++) {
        const nx = x + (dx * i) / steps, ny = y + (dy * i) / steps;
        for (const fn of fns()) fn({ dx: nx - px, dy: ny - py, phase: i === 1 ? 'start' : 'move', x: nx, y: ny });
        px = nx;
        py = ny;
      }
      for (const fn of fns()) fn({ dx: 0, dy: 0, phase: 'end', x: px, y: py });
    },
  };
}

test('an up stroke of a fifth of the height is a swipe; a shorter or downward one is not', () => {
  const pointer = fakePointer();
  const swipe = createSwipe(pointer, { height: 800 });
  const heard = [];
  swipe.on(event => heard.push(event));
  pointer.drag(400, 600, 0, -160); // a fifth of 800, straight up
  assert.equal(heard.length, 1);
  assert.equal(heard[0].kind, 'up');
  assert.deepEqual([heard[0].x0, heard[0].y0], [400, 600], 'where it started');
  assert.ok(heard[0].y <= 600 - SWIPE.share * 800, 'and where the finger was when it counted');
  pointer.drag(400, 600, 0, -150); // short of a fifth
  pointer.drag(400, 200, 0, 400); // down
  pointer.drag(100, 400, 500, 0); // to the side
  pointer.drag(100, 600, 400, -200); // more to the side than up
  assert.equal(heard.length, 1, `only the first: ${JSON.stringify(heard.slice(1))}`);
  pointer.drag(300, 700, 150, -300); // slanting, but more up than across
  assert.equal(heard.length, 2);
  assert.equal(heard[1].kind, 'up');
});

test('a stroke counts once, as soon as it is long enough, however far it goes on', () => {
  const pointer = fakePointer();
  const heights = [800];
  const swipe = createSwipe(pointer, { height: () => heights[0] });
  const heard = [];
  swipe.on(event => heard.push(event));
  pointer.drag(400, 790, 0, -780, 10);
  assert.equal(heard.length, 1, 'one gust for one stroke');
  // a tablet turned upright is taller: its fifth is more
  heights[0] = 1280;
  pointer.drag(400, 900, 0, -200);
  assert.equal(heard.length, 1, '200 px is short of a fifth of 1280');
  pointer.drag(400, 900, 0, -260);
  assert.equal(heard.length, 2);
});

test('a tap is reported as kind tap', () => {
  const pointer = fakePointer();
  const swipe = createSwipe(pointer, { height: 800 });
  const heard = [];
  const off = swipe.on(event => heard.push(event));
  pointer.tap(120, 340);
  assert.deepEqual(heard, [{ kind: 'tap', x: 120, y: 340 }]);
  off();
  pointer.tap();
  pointer.drag(400, 600, 0, -300);
  assert.equal(heard.length, 1, 'nothing once it stops listening');
});

test('dispose lets go of the pointer', () => {
  const pointer = fakePointer();
  const swipe = createSwipe(pointer, { height: 800 });
  swipe.on(() => assert.fail('disposed'));
  swipe.dispose();
  assert.equal(pointer.listeners.tap.length + pointer.listeners.drag.length, 0);
  pointer.tap();
  pointer.drag(400, 600, 0, -300);
});
