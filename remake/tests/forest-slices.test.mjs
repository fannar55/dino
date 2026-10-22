import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chapter } from '../chapters/kafli2.js';
import { PRESETS } from '../engine/quality.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { createWind } from '../engine/wind.js';
import { createForest } from '../world/forest/forest.js';
import { runSync, runSliced, FRESH } from '../world/forest/slices.js';

// A forest built a slice at a time (world/forest/slices.js), as main.js builds a chapter's later places while the start button waits
// and the first scenes play: the same place as one built at once, a slice ending as its budget runs out. No test here reads a real
// clock: runSliced is given one (`now`) that moves a set number of milliseconds each time it is read, once as a slice begins, once
// after each step and once as it ends. So a budget of B ms on a clock of m ms a read is a budget of ceil(B / m) steps, whatever the
// machine is doing.

function nodeWorld() {
  const look = pickLook(chapter.look);
  const sun = { castShadow: true, target: { position: new THREE.Vector3() }, shadow: { updateMatrices() {} } };
  return {
    THREE, renderer: { getDrawingBufferSize: v => v.set(1280, 800) }, scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200), clock: null, q: PRESETS.tablet, params: new URLSearchParams(''), look,
    lighting: { direction: sunDirection(look), sun, focusRadius: 10 }, wind: createWind(), chapter, heightAt: () => 0, actors: new Map(),
  };
}
const layoutOf = name => ({ ...chapter.locations[name].layout, shots: chapter.locations[name].shots });

/** A clock that moves `ms` each time it is read. */
const steppingClock = (ms = 1) => { let t = 0; return () => (t += ms); };

/** `n` steps of work, each logged as it is done; returns their sum, as a build returns what it made. */
function* units(n, log) {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += i;
    log.push('x');
    yield;
  }
  return sum;
}

/** Slices as the steps ran: 'xxx|xxx|x|' (a '|' where a slice ended). */
async function sliced(steps, log, options) {
  return runSliced(steps, { wait: () => Promise.resolve(), onSlice: () => log.push('|'), ...options });
}

test('runSliced runs as many steps a slice as its budget allows on its clock, waits between slices, and ends where runSync does', async () => {
  assert.equal(runSync(units(10, [])), 45);
  // a budget of 3 ms on a clock of 1 ms a read: 3 steps a slice
  let log = [];
  let waits = 0;
  assert.equal(await runSliced(units(10, log), { budget: () => 3, now: steppingClock(1), wait: () => { waits++; return Promise.resolve(); }, onSlice: () => log.push('|') }), 45);
  assert.equal(log.join(''), 'xxx|xxx|xxx|x|');
  assert.equal(waits, 3, 'a wait between each two slices, none after the last');
  // in milliseconds: 7 ms on a clock of 2 ms a read is 4 steps (2, 4 and 6 ms are under 7)
  log = [];
  await sliced(units(10, log), log, { budget: () => 7, now: steppingClock(2) });
  assert.equal(log.join(''), 'xxxx|xxxx|xx|');
  // the budget is read before each slice: any sequence of budgets, each slice its own; none under a step (0 is 1)
  log = [];
  const budgets = [1, 5, 0, 2];
  await sliced(units(10, log), log, { budget: () => budgets.shift() ?? 100, now: steppingClock(1) });
  assert.equal(log.join(''), 'x|xxxxx|x|xx|x|');
  // what a slice took, as onSlice hears it: a read after each step and one that ends it (the last slice's last call to the steps
  // finds them done, and no read follows it)
  const heard = [];
  await runSliced(units(7, []), { budget: () => 3, now: steppingClock(1), wait: () => Promise.resolve(), onSlice: ms => heard.push(ms) });
  assert.deepEqual(heard, [4, 4, 2]);
});

test('a step that yields FRESH ends its slice unless it is the slice\'s first step, so the long step after it begins a slice of its own', async () => {
  const log = [];
  function* withLong() {
    yield FRESH; // the slice's first step: it goes on
    for (let i = 0; i < 6; i++) { log.push('short'); yield; }
    yield FRESH;
    log.push('long'); // the long step, the first of its slice
    yield; // (a FRESH it yielded itself would be its slice's first step: no end)
    yield FRESH;
    log.push('long'); // and another
    return 'made';
  }
  assert.equal(await sliced(withLong(), log, { budget: () => 1000, now: steppingClock(1) }), 'made');
  assert.equal(log.join(' '), 'short short short short short short | long | long |');
  log.length = 0;
  assert.equal(runSync(withLong()), 'made');
  assert.equal(log.join(' '), 'short short short short short short long long', 'runSync takes no notice');
});

test('the trail and the Fen built in slices, under any budgets, are the places built at once; a slice never runs past its budget in steps', async () => {
  for (const name of ['fenjaslod', 'fen']) {
    const whole = await createForest(nodeWorld(), layoutOf(name));
    const same = forest => {
      assert.deepEqual(forest.info.placementList, whole.info.placementList, `${name}: the same plants in the same places`);
      for (const key of ['grassBlades', 'grassTriangles', 'farTriangles', 'groundTriangles', 'waterTriangles', 'mossCards', 'mistCards']) {
        assert.equal(forest.info[key], whole.info[key], `${name}: ${key}`);
      }
      assert.deepEqual(forest.info.meshes, whole.info.meshes, `${name}: the same plant meshes`);
      const ground = f => f.group.getObjectByName('Forest ground').geometry.attributes.position.array;
      assert.deepEqual(ground(forest), ground(whole), `${name}: the same ground`);
    };
    // budgets that change from slice to slice, in steps (a clock of 1 ms a read): each slice runs its budget of steps (fewer only
    // where a long step begins a slice of its own, FRESH, and at the end), never more
    const cycle = [1, 3, 8, 2, 13, 5];
    const given = [], heard = [];
    let k = 0;
    const varied = await createForest(nodeWorld(), layoutOf(name), { slice: {
      now: steppingClock(1), wait: () => Promise.resolve(), onSlice: ms => heard.push(ms),
      budget: () => { const b = cycle[k++ % cycle.length]; given.push(b); return b; },
    } });
    same(varied);
    assert.equal(heard.length, given.length);
    const ran = heard.map(ms => ms - 1); // the steps of each slice (the last slice's are one more: its last call finds the end)
    ran.forEach((steps, i) => assert.ok(steps <= given[i], `${name}: slice ${i} ran ${steps} steps on a budget of ${given[i]}`));
    const full = ran.filter((steps, i) => steps === given[i]).length;
    assert.ok(full >= ran.length - 10, `${name}: ${ran.length - full} of ${ran.length} slices ran short of their budget`);
    // and it yields after each piece of work: a build is many steps, each slice of one step on a budget of one
    const steps = ran.reduce((a, b) => a + b, 0);
    assert.ok(steps > 1000, `${name}: ${steps} steps`);
    assert.ok(ran.every((n, i) => given[i] !== 1 || n <= 1), `${name}: a budget of one step is a slice of one`);
    whole.dispose();
    varied.dispose();
  }
});
