import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chapter } from '../chapters/kafli2.js';
import { PRESETS } from '../engine/quality.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { createWind } from '../engine/wind.js';
import { createForest } from '../world/forest/forest.js';
import { runSync, runSliced } from '../world/forest/slices.js';

// A forest built a slice at a time (world/forest/slices.js), as main.js builds a chapter's later places while the start button waits
// and the first scenes play: the same place as one built at once, its steps short enough to leave a frame room to draw.

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

test('runSync and runSliced drive the same steps to the same end; the sliced one waits between slices', async () => {
  function* steps() {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      const until = performance.now() + 0.2;
      while (performance.now() < until); // a little work
      sum += i;
      yield;
    }
    return sum;
  }
  assert.equal(runSync(steps()), 1225);
  let waits = 0;
  const slices = [];
  const value = await runSliced(steps(), { budget: () => 1, wait: () => { waits++; return Promise.resolve(); }, onSlice: ms => slices.push(ms) });
  assert.equal(value, 1225);
  assert.ok(waits >= 5 && slices.length === waits + 1, `${waits} waits, ${slices.length} slices`);
  // a budget read before each slice: a bigger one (the screen black) runs it in fewer
  let big = 0;
  await runSliced(steps(), { budget: () => 1000, wait: () => { big++; return Promise.resolve(); } });
  assert.equal(big, 0, 'all in one slice');
});

test('the trail and the Fen built in slices are the places built at once, and no step of the build holds a frame long', async () => {
  for (const name of ['fenjaslod', 'fen']) {
    const whole = await createForest(nodeWorld(), layoutOf(name));
    const slices = [];
    let waits = 0;
    const sliced = await createForest(nodeWorld(), layoutOf(name), {
      slice: { budget: () => 4, wait: () => { waits++; return Promise.resolve(); }, onSlice: ms => slices.push(ms) },
    });
    assert.deepEqual(sliced.info.placementList, whole.info.placementList, `${name}: the same plants in the same places`);
    for (const key of ['grassBlades', 'grassTriangles', 'farTriangles', 'groundTriangles', 'waterTriangles', 'mossCards', 'mistCards']) {
      assert.equal(sliced.info[key], whole.info[key], `${name}: ${key}`);
    }
    assert.deepEqual(sliced.info.meshes, whole.info.meshes, `${name}: the same plant meshes`);
    const ground = forest => forest.group.getObjectByName('Forest ground').geometry.attributes.position.array;
    assert.deepEqual(ground(sliced), ground(whole), `${name}: the same ground`);
    assert.ok(waits > 60, `${name}: built over ${waits} frames`);
    // each slice is the budget and at most one step more: a step is a plant tried (its model built the first time), a row of the
    // ground or the grass, a bucket's plant merged; generous for a busy machine (the browser's frames are measured in the report).
    // A step that is long is long in every build; a pause of the machine's own (the collector, the other tests) is not, so the
    // place is built in slices once more and the shorter of the two longest slices is what counts.
    const again = [];
    const twice = await createForest(nodeWorld(), layoutOf(name), { slice: { budget: () => 4, wait: () => Promise.resolve(), onSlice: ms => again.push(ms) } });
    const longest = Math.min(Math.max(...slices.slice(1)), Math.max(...again.slice(1))); // the first runs the code cold
    assert.ok(longest < 60, `${name}: its longest slice took ${longest.toFixed(1)} ms`);
    whole.dispose();
    sliced.dispose();
    twice.dispose();
  }
});
