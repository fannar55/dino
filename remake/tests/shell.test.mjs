import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pushOut, fitCapsules, closestOnSegment, createShell, SOFT } from '../engine/shell.js';
import { loadCharacter } from './characters.mjs';

// The shells of Fiðrildadansinn (engine/shell.js): a butterfly drawn into an animal is kept out of it, statelessly, smoothly through
// the middle, and never brought nearer the viewer.

const CAP = { a: [-1, 1, 0], b: [1, 1, 0], r: 0.5 }; // a capsule lying across the view, its axis 1 m up
const FORWARD = [0, 0, -1]; // the camera looks along -Z
const MARGIN = 0.2;
const R = CAP.r + MARGIN;
const dist = p => Math.hypot(...p.map((x, i) => x - closestOnSegment(p, CAP.a, CAP.b)[i]));
const options = { margin: MARGIN, forward: FORWARD };

test('a point inside a capsule is put outside it by the margin, wherever it was drawn in it', () => {
  for (const p of [[0, 1, 0], [0.3, 1.2, 0.1], [-0.9, 0.8, -0.2], [1.2, 1, 0], [0, 0.6, 0.3], [0.5, 1.4, -0.4]]) {
    const out = pushOut(p, [CAP], options);
    assert.ok(dist(out) >= R - 1e-6, `${p} came to ${out.map(x => x.toFixed(3))}, ${dist(out).toFixed(3)} from the axis`);
  }
});

test('the soft zone bends a flight early: a point just outside is moved a little outward, one past the zone not at all', () => {
  const O = R + SOFT;
  const near = [0, 1 + R * 1.1, 0]; // above the axis, inside the soft zone
  const out = pushOut(near, [CAP], options);
  assert.ok(dist(out) > dist(near) + 1e-4, 'moved out');
  assert.ok(dist(out) < O + 1e-6, 'but not past the zone');
  const past = [0, 1 + O + 0.01, 0];
  assert.deepEqual(pushOut(past, [CAP], options), past, 'past the zone it is left where it was drawn');
  // and the zone's edge is met smoothly: just inside and just outside it differ by about as much as the points do
  const inEdge = pushOut([0, 1 + O - 1e-3, 0], [CAP], options);
  assert.ok(Math.abs(inEdge[1] - (1 + O - 1e-3)) < 2e-3);
});

test('a flight drawn straight through the middle of a capsule goes over it without a jump, whichever way it crosses the axis', () => {
  const paths = [
    [[0, -0.6, 0], [0, 2.6, 0]], // up through the axis, across the view
    [[0, 2.6, 0], [0, -0.6, 0]], // and down
    [[0, 1, 2], [0, 1, -2]], // straight away from the camera through the axis
    [[0, 1, -2], [0, 1, 2]], // and toward it
    [[0.3, 2.4, 1.3], [-0.3, -0.1, -1.3]], // slanting down and away through it, from above in front
    [[-2, 1.3, 0.4], [2, 0.8, -0.4]], // along the axis, in at one end and out at the other
    [[0.4, 1.05, 0], [0.4, 0.95, 0]], // a short way across the axis itself
  ];
  for (const [from, to] of paths) {
    const n = 800;
    let last = null, worst = 0;
    for (let i = 0; i <= n; i++) {
      const p = from.map((x, k) => x + (to[k] - x) * (i / n));
      const out = pushOut(p, [CAP], options);
      assert.ok(dist(out) >= R - 1e-6, 'outside all the way');
      if (last) worst = Math.max(worst, Math.hypot(...out.map((x, k) => x - last[k])));
      last = out;
    }
    const step = Math.hypot(...to.map((x, k) => x - from[k])) / n;
    assert.ok(worst < 40 * step, `${from} -> ${to}: the largest move between neighbouring points is ${worst.toFixed(4)} m for steps of ${step.toFixed(4)} m`);
  }
});

test('a push never brings a point nearer the camera', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const caps = [CAP, { a: [0.5, 0.4, -0.6], b: [0.5, 1.8, -0.8], r: 0.3 }];
  for (let i = 0; i < 3000; i++) {
    const p = [random() * 4 - 2, random() * 3 - 0.5, random() * 3 - 1.5];
    const out = pushOut(p, caps, options);
    const toward = -((out[0] - p[0]) * FORWARD[0] + (out[1] - p[1]) * FORWARD[1] + (out[2] - p[2]) * FORWARD[2]);
    assert.ok(toward < 1e-9, `${p} moved ${toward} m toward the camera`);
  }
});

test('the push is stateless: the same drawn point gives the same place, whatever came before', () => {
  const p = [0.2, 1.1, 0.05];
  const first = pushOut(p, [CAP], options);
  for (let i = 0; i < 50; i++) pushOut([Math.sin(i), 1 + Math.cos(i), 0.1 * i], [CAP], options);
  assert.deepEqual(pushOut(p, [CAP], options), first);
});

test('capsules are fitted from the vertices: a cylinder of points along one bone gives a capsule along it, as wide as it', () => {
  const pts = [];
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 20; j++) {
      const a = (j / 20) * 2 * Math.PI, x = -1 + (2 * i) / 19;
      pts.push([x, 0.3 * Math.cos(a), 0.3 * Math.sin(a)]);
    }
  }
  pts.push([0.05, 0.02, 0], [0.1, -0.01, 0.01]); // and two on a little bone of its own, which goes to its parent
  const caps = fitCapsules({
    count: pts.length,
    dominant: i => (i < 400 ? 0 : 1),
    parent: j => (j === 1 ? 0 : -1),
    local: i => pts[i],
  });
  assert.equal(caps.length, 1, 'the little bone was merged into its parent');
  const [c] = caps;
  assert.ok(Math.abs(c.r - 0.3) < 0.02, `radius ${c.r}`);
  assert.ok(Math.abs(c.a[1]) < 0.05 && Math.abs(c.b[1]) < 0.05 && Math.abs(Math.abs(c.a[0] - c.b[0]) - (2 - 2 * 0.3)) < 0.2, `along the cylinder: ${c.a} - ${c.b}`);
});

test('the shells of Mosi and Þórseðla hold their bodies: nearly every vertex is inside a capsule, and none far outside', async () => {
  for (const name of ['mosi', 'thorsedla']) {
    const gltf = await loadCharacter(name);
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const shell = createShell(THREE, { model, root: model });
    shell.update();
    let body = shell.body;
    const v = new THREE.Vector3();
    const pos = body.geometry.attributes.position;
    let inside = 0, worst = 0;
    for (let i = 0; i < pos.count; i += 3) {
      body.getVertexPosition(i, v).applyMatrix4(body.matrixWorld);
      const p = v.toArray();
      let out = Infinity;
      for (const c of shell.capsules) out = Math.min(out, Math.hypot(...p.map((x, k) => x - closestOnSegment(p, c.a, c.b)[k])) - c.r);
      if (out <= 0.01) inside++;
      worst = Math.max(worst, out);
    }
    const share = inside / Math.ceil(pos.count / 3);
    assert.ok(share > 0.85, `${name}: ${(share * 100).toFixed(1)} % of the vertices inside`);
    console.log(`${name}: ${shell.capsules.length} capsules, ${(share * 100).toFixed(1)} % of the vertices inside, the farthest ${worst.toFixed(3)} m out`);
    assert.ok(worst < 0.5, `${name}: the farthest vertex is ${worst.toFixed(3)} m outside`);
    assert.ok(shell.capsules.length >= 6 && shell.capsules.length <= 160, `${name}: ${shell.capsules.length} capsules`);
  }
});

test('the seam is where the design puts it: a flight drawn up into a lying capsule from straight below is the one that jumps', () => {
  // up through the axis from below: smooth while it goes over the top, but it must leave below the body or above it, so somewhere
  // under the axis (at the shell's own surface) it is torn between the two
  let last = null, worst = 0, at = null;
  for (let i = 0; i <= 800; i++) {
    const y = -0.6 + (2.6 * i) / 800;
    const out = pushOut([0, y, 0], [CAP], options);
    if (last) { const j = Math.hypot(...out.map((x, k) => x - last[k])); if (j > worst) { worst = j; at = y; } }
    last = out;
  }
  assert.ok(at < 1 - 0.5 * R && at > 1 - 1.2 * R, `the jump is under the axis near the shell (at y ${at.toFixed(3)})`);
});
