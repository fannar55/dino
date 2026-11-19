import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tableEyes, placeEye, onTable, parallaxAt, outlineBox, centreOnTable, marginsOf, cmPerPixel, DOWN } from '../engine/table3d.js';
import { createGler, eyeFrusta } from '../engine/gler.js';

// The table picture (engine/table3d.js, chapters/bord3d.js): a phantogram's geometry must be right by construction, since nobody
// who builds it can see depth. These tests draw points through the two eye cameras as the renderer does (projection · view) and
// read where they land on the screen.

// A 10.5 inch 16:10 tablet lying on the table, seen from 45 cm at 45 degrees, eyes 5.8 cm apart (cm).
const TABLET = { W: 22.61, Hs: 14.13, R: 45, a: 45, ipd: 5.8 };
const near = 0.25, far = 1200;
const close = (a, b, eps, message) => assert.ok(Math.abs(a - b) <= eps, `${message ?? ''} ${a} is not ${b} (within ${eps})`);

/** The two eye cameras for a screen whose centre is at `origin` in the world, one real cm `scale` virtual units. */
function cameras(scale = 1, origin = [0, 0, 0], screen = TABLET) {
  const eyes = tableEyes({ ...screen, near, far, scale });
  const left = placeEye(new THREE.PerspectiveCamera(), eyes.left, origin);
  const right = placeEye(new THREE.PerspectiveCamera(), eyes.right, origin);
  return { eyes, left, right };
}
/** Where a world point lands on the screen through a camera: [x, z] in the table's frame, real cm (x right, z toward the viewer). */
function drawn(camera, point, screen = TABLET) {
  const ndc = new THREE.Vector3(...point).project(camera);
  return [ndc.x * screen.W / 2, -ndc.y * screen.Hs / 2];
}

test('the eyes stand where the viewer\'s eyes are, and look straight down with the screen\'s top away from the viewer', () => {
  const { eyes, left, right } = cameras();
  const h = 45 * Math.SQRT1_2;
  close(eyes.height, h, 1e-9);
  assert.deepEqual([left.position.x, right.position.x], [-2.9, 2.9]);
  for (const eye of [left, right]) {
    close(eye.position.y, h, 1e-9);
    close(eye.position.z, h, 1e-9);
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(eye.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(eye.quaternion);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(eye.quaternion);
    close(look.distanceTo(new THREE.Vector3(0, -1, 0)), 0, 1e-12, 'looks down');
    close(up.distanceTo(new THREE.Vector3(0, 0, -1)), 0, 1e-12, 'up is away from the viewer');
    close(side.distanceTo(new THREE.Vector3(1, 0, 0)), 0, 1e-12, 'right is the viewer\'s right');
  }
  close(new THREE.Vector3(0, 0, -1).applyQuaternion(DOWN).y, -1, 1e-12);
});

test('the screen\'s four corners land on the four corners of each eye\'s picture', () => {
  const { left, right } = cameras();
  const { W, Hs } = TABLET;
  // [the corner on the table, where it is in the picture (x right, y up: the screen's top is its far edge)]
  const corners = [
    [[-W / 2, 0, -Hs / 2], [-1, 1]], [[W / 2, 0, -Hs / 2], [1, 1]],
    [[-W / 2, 0, Hs / 2], [-1, -1]], [[W / 2, 0, Hs / 2], [1, -1]],
  ];
  for (const eye of [left, right]) {
    for (const [corner, [x, y]] of corners) {
      const ndc = new THREE.Vector3(...corner).project(eye);
      close(ndc.x, x, 1e-9, `corner ${corner}: x`);
      close(ndc.y, y, 1e-9, `corner ${corner}: y`);
      assert.ok(ndc.z > -1 && ndc.z < 1, 'between near and far');
    }
  }
});

test('a point on the screen\'s plane is drawn where it is, in both eyes: no parallax', () => {
  const { left, right } = cameras();
  for (const [x, z] of [[0, 0], [3.3, -5], [-9, 6.2], [11.3, 7.06], [-40, -80]]) {
    const l = drawn(left, [x, 0, z]), r = drawn(right, [x, 0, z]);
    close(l[0], x, 1e-9); close(l[1], z, 1e-9);
    close(r[0], x, 1e-9); close(r[1], z, 1e-9);
  }
});

test('a point h above the screen has ipd·h/(ey − h) of parallax, crossed: it stands out of the screen', () => {
  const { eyes, left, right } = cameras();
  const { ipd } = TABLET;
  for (const h of [0.5, 4, 6, 8, 10]) {
    for (const [x, z] of [[0, 0], [4, -3], [-7, 5]]) {
      const l = drawn(left, [x, h, z]), r = drawn(right, [x, h, z]);
      const want = (ipd * h) / (eyes.height - h);
      close(l[0] - r[0], want, 1e-9, `h ${h}`); // crossed: the left eye's picture lies to the right of the right eye's
      assert.ok(l[0] > r[0]);
      close(l[1], r[1], 1e-9, 'and none up or down');
      close(parallaxAt(h, eyes.height, ipd), want, 1e-12);
      // both pictures are where the ray from that eye through the point meets the table
      close(onTable({ x: -ipd / 2, y: eyes.height, z: eyes.height }, x, h, z)[0], l[0], 1e-9);
      close(onTable({ x: ipd / 2, y: eyes.height, z: eyes.height }, x, h, z)[1], r[1], 1e-9);
      // and the two rays meet again at the point: the viewer sees it h above the screen
      const t = eyes.height / (eyes.height - h);
      close(l[0], -ipd / 2 + (x + ipd / 2) * t, 1e-9);
    }
  }
  // a point under the screen goes the other way (uncrossed)
  assert.ok(drawn(left, [0, -2, 0])[0] < drawn(right, [0, -2, 0])[0]);
});

test('the world is scaled to the table: the picture of a scaled world, moved anywhere, is the same picture', () => {
  const one = cameras();
  const scale = 4.2 / 6; // Mosi's 4.2 m as 6 cm
  const origin = [3, 0, -7];
  const big = cameras(scale, origin);
  for (const p of [[0, 0, 0], [5, 6, -2], [-8, 2.5, 4], [11.3, 0, 7.06]]) {
    const q = p.map((c, i) => origin[i] + c * scale);
    for (const side of ['left', 'right']) {
      const a = drawn(one[side], p), b = drawn(big[side], q);
      close(a[0], b[0], 1e-9); close(a[1], b[1], 1e-9);
    }
  }
  close(big.eyes.left.y, one.eyes.height * scale, 1e-12);
});

test('another screen, another seat: the corners and the parallax hold', () => {
  const screen = { W: 21.3, Hs: 16, R: 38, a: 52, ipd: 6.3 };
  const { eyes, left, right } = cameras(0.5, [0, 0, 0], screen);
  for (const eye of [left, right]) {
    const ndc = new THREE.Vector3(screen.W / 2 * 0.5, 0, screen.Hs / 2 * 0.5).project(eye);
    close(ndc.x, 1, 1e-9); close(ndc.y, -1, 1e-9);
  }
  const h = 5;
  const l = drawn(left, [1 * 0.5, h * 0.5, 2 * 0.5], screen), r = drawn(right, [1 * 0.5, h * 0.5, 2 * 0.5], screen);
  close(l[0] - r[0], (6.3 * h) / (eyes.height - h), 1e-9);
});

test('the figure\'s picture is centred on the screen and its margins are counted', () => {
  const eyes = tableEyes({ ...TABLET, near, far });
  // a box 4 wide, 6 tall and 5 deep standing off to one side
  const cloud = [];
  for (const x of [5, 9]) for (const y of [0, 6]) for (const z of [-1, 4]) cloud.push(x, y, z);
  const clouds = [new Float32Array(cloud)];
  const pair = [eyes.left, eyes.right];
  const at = centreOnTable(clouds, pair, [0, 0]);
  const box = outlineBox(clouds, pair, at);
  close(box.x0 + box.x1, 0, 1e-5);
  close(box.z0 + box.z1, 0, 1e-5);
  close(box.top, 6, 1e-6);
  // the box agrees with the cameras: its far, left corner drawn through the left eye
  const { left } = cameras(1, [at[0], 0, at[1]]);
  const corner = drawn(left, [5, 6, -1]);
  assert.ok(corner[0] >= box.x0 - 1e-5 && corner[1] >= box.z0 - 1e-5);
  close(Math.min(...[[5, 6, -1], [5, 0, -1]].map(p => drawn(left, p)[1])), box.z0, 1e-5);
  const m = marginsOf(box, TABLET.W, TABLET.Hs);
  close(m.left, m.right, 1e-6);
  close(m.top, m.bottom, 1e-6);
  close(m.left, (TABLET.W - (box.x1 - box.x0)) / 2 / TABLET.W, 1e-6);
  // a figure too tall for the screen is cut: a negative margin, said, not hidden
  const tall = [new Float32Array([0, 0, 0, 0, 12, 0])];
  const cut = marginsOf(outlineBox(tall, pair, centreOnTable(tall, pair)), TABLET.W, TABLET.Hs);
  assert.ok(cut.top < 0 && cut.bottom < 0);
});

test('centimetres are centimetres: a 10.5 inch screen of 1280 x 800 CSS pixels', () => {
  const cm = cmPerPixel(10.5, 1280, 800);
  close(Math.hypot(1280 * cm, 800 * cm), 10.5 * 2.54, 1e-9);
  close(1280 * cm, 22.61, 0.01);
  close(800 * cm, 14.13, 0.01);
});

test('the glasses\' own eyes are as they were while no chapter places them, and again once it lets go', () => {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.25, 1200);
  camera.position.set(1, 2, 9);
  camera.lookAt(0, 1.5, 0);
  const renderer = {
    getDrawingBufferSize: v => v.set(1280, 800), getRenderTarget: () => null, setRenderTarget() {}, render() {},
    shadowMap: { autoUpdate: true, needsUpdate: false },
  };
  const gler = createGler({
    renderer, display: null, scene: new THREE.Scene(), camera, director: { rig: { target: new THREE.Vector3(0, 1.5, 0) } },
    q: { antialias: false }, params: new URLSearchParams('styrkur=0.02&ut=1'), doc: {}, panel: false,
  });
  const snapshot = () => gler.eyes.map(e => [...e.position.toArray(), ...e.quaternion.toArray(), ...e.projectionMatrix.elements]);
  gler.draw();
  const own = snapshot();
  // its own pair: beside the camera, looking the same way, the off-axis frusta of eyeFrusta
  const f = eyeFrusta(camera, gler.plane, 0.02);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  [f.left, f.right].forEach((fr, i) => {
    close(gler.eyes[i].position.distanceTo(camera.position.clone().addScaledVector(right, fr.x)), 0, 1e-12);
    assert.deepEqual(gler.eyes[i].quaternion.toArray(), camera.quaternion.toArray());
    assert.deepEqual(gler.eyes[i].projectionMatrix.elements, new THREE.Matrix4().makePerspective(fr.l, fr.r, fr.t, fr.b, camera.near, camera.far).elements);
  });

  // a chapter's own: called at every draw with the two eyes and the director's camera, and the eyes stay as it leaves them
  const table = tableEyes({ ...TABLET, near, far });
  const calls = [];
  gler.setEyes((eyes, centre) => {
    calls.push([eyes, centre]);
    placeEye(eyes[0], table.left);
    placeEye(eyes[1], table.right);
  });
  gler.draw();
  gler.draw();
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], gler.eyes);
  assert.equal(calls[0][1], camera);
  assert.deepEqual(gler.eyes[0].position.toArray(), [table.left.x, table.left.y, table.left.z]);
  assert.deepEqual(gler.eyes[1].quaternion.toArray(), DOWN.toArray());
  assert.notDeepEqual(snapshot(), own);

  // and let go: the pair beside the camera again, to the last digit
  gler.setEyes(null);
  gler.draw();
  assert.deepEqual(snapshot(), own);
  assert.equal(calls.length, 2);
});
