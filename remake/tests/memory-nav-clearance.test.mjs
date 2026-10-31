import test from 'node:test';
import assert from 'node:assert/strict';
import './setup.mjs';
const THREE = await import('three');
const { boxClearance, objectBox } = await import('../engine/memory/memory-clearance.js');
const { hasBoxClearance } = await import('../engine/memory/world-nav-clearance.js');

test('navigation SAT preserves signed-audit decisions at contact margins', () => {
  const a = objectBox('a', [0, 0, 0], [1, .35, .6]);
  for (const margin of [-.015, 0, .045, .07]) for (const gap of [-.25, -.015, 0, .025, .045, .07, .2]) {
    const b = objectBox('b', [1.5 + gap, 0, 0], [.5, .3, .4]);
    assert.equal(hasBoxClearance(a, b, margin), boxClearance(a, b) >= margin, `gap ${gap}, margin ${margin}`);
  }
});

test('navigation SAT agrees for rotated body, thin bark and near-parallel boxes', () => {
  let seed = 613;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const make = () => {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 3, random() * 3, random() * 3));
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map(v => v.applyQuaternion(rotation).toArray());
    return { center: [random() * 4 - 2, random() * 2 - 1, random() * 4 - 2], half: [.02 + random() * 2, .01 + random() * .7, .02 + random()], axes };
  };
  for (let i = 0; i < 3000; i++) {
    const a = make(), b = make();
    if (i % 3 === 0) b.axes = a.axes.map(axis => [...axis]);
    for (const margin of [-.015, .045, .07]) assert.equal(hasBoxClearance(a, b, margin), boxClearance(a, b) >= margin, `pose ${i}, margin ${margin}`);
  }
});
