// Crowds (world/critters/crowd.js): any number of critters of a kind in one draw call, each with its own place, heading, size,
// pose and wings, and none drawn that is too far from the camera to be seen.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrowds } from '../world/critters/crowd.js';
import { createModel } from '../world/critters/models.js';

const world = () => ({ scene: new THREE.Scene() });
const camera = () => {
  const c = new THREE.PerspectiveCamera(50, 1.6, 0.1, 2000);
  c.position.set(0, 0, 0);
  c.updateMatrixWorld();
  return c;
};
const meshOf = (crowds, kind) => crowds.meshes.find(m => m.name === kind);
const frogTriangles = createModel('frog').triangles;

test('one kind is one draw call however many critters', () => {
  const crowds = createCrowds(world());
  crowds.reserve('frog', 40);
  crowds.begin(camera());
  for (let i = 0; i < 40; i++) crowds.place('frog', new THREE.Vector3(i * 0.5, 0, 5), 0, 1);
  crowds.end();
  assert.equal(crowds.calls(), 1);
  assert.equal(crowds.group.children.length, 1);
  assert.equal(meshOf(crowds, 'frog').count, 40);
  crowds.dispose();
});

test('a critter beyond seen is not drawn', () => {
  const crowds = createCrowds(world(), { seen: 160 });
  crowds.reserve('frog', 2);
  crowds.begin(camera());
  assert.ok(crowds.place('frog', new THREE.Vector3(100, 0, 0), 0, 1) >= 0, 'at 100 m');
  assert.equal(crowds.place('frog', new THREE.Vector3(200, 0, 0), 0, 1), -1, 'at 200 m');
  crowds.end();
  assert.equal(meshOf(crowds, 'frog').count, 1);
  assert.equal(crowds.placed().length, 1);
  crowds.dispose();
});

test('each critter has its own pose', () => {
  const crowds = createCrowds(world());
  crowds.reserve('frog', 2);
  crowds.begin(camera());
  crowds.place('frog', new THREE.Vector3(1, 0, 5), 0, 1, { morphs: { leap: 0 } });
  crowds.place('frog', new THREE.Vector3(2, 0, 5), 0, 1, { morphs: { leap: 1 } });
  crowds.end();
  const mesh = meshOf(crowds, 'frog');
  const leap = mesh.geometry.morphAttributes.position.findIndex(a => a.name === 'leap');
  const row = mesh.geometry.morphAttributes.position.length + 1; // the base influence, then each morph's
  const data = mesh.morphTexture.source.data.data;
  assert.equal(data[0 * row + 1 + leap], 0, 'the first frog sits');
  assert.equal(data[1 * row + 1 + leap], 1, 'the second leaps');
  assert.ok(mesh.morphTexture.version > 0, 'end() flags the poses for upload');
  crowds.dispose();
});

test('winged critters beat their own wings', () => {
  const crowds = createCrowds(world());
  crowds.reserve('dragonfly', 2);
  crowds.begin(camera());
  crowds.place('dragonfly', new THREE.Vector3(1, 1, 5), 0, 1, { wings: [0.3, 1] });
  crowds.place('dragonfly', new THREE.Vector3(2, 1, 5), 0, 1, { wings: [-0.2, 1] });
  crowds.end();
  const flight = meshOf(crowds, 'dragonfly').geometry.getAttribute('aFlight');
  assert.ok(flight?.isInstancedBufferAttribute, 'one wing beat a critter');
  assert.ok(Math.abs(flight.getX(0) - 0.3) < 1e-6 && flight.getY(0) === 1);
  assert.ok(Math.abs(flight.getX(1) + 0.2) < 1e-6);
  crowds.dispose();
});

test('the matrix puts the model\'s foot on the given point', () => {
  const crowds = createCrowds(world());
  crowds.reserve('frog', 1);
  crowds.begin(camera());
  crowds.place('frog', new THREE.Vector3(5, 2, 3), 90, 3);
  crowds.end();
  const mesh = meshOf(crowds, 'frog');
  mesh.geometry.computeBoundingBox();
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(0, m);
  const box = mesh.geometry.boundingBox.clone().applyMatrix4(m);
  assert.ok(Math.abs(box.min.y - 2) < 0.02, `its feet on y = 2 (${box.min.y.toFixed(3)})`);
  assert.ok(box.min.x < 5 && box.max.x > 5 && box.min.z < 3 && box.max.z > 3, 'standing on (5, 3)');
  // heading 90 faces +Z: the frog is longer along z than across
  const size = box.getSize(new THREE.Vector3());
  const plain = createModel('frog').geometry;
  plain.computeBoundingBox();
  const own = plain.boundingBox.getSize(new THREE.Vector3());
  if (Math.abs(own.x - own.z) > 0.01) assert.ok(Math.abs(size.z - own.x * 3) < 0.02, `turned to face +Z (${size.z.toFixed(3)} against ${(own.x * 3).toFixed(3)})`);
  const [placed] = crowds.placed();
  assert.equal(placed.kind, 'frog');
  assert.ok(placed.position.distanceTo(new THREE.Vector3(5, 2, 3)) < 1e-9);
  assert.ok(Math.abs(placed.height - own.y * 3) < 1e-6, `its height is the model's at its scale (${placed.height})`);
  crowds.dispose();
});

test('triangles counts what is drawn', () => {
  const crowds = createCrowds(world());
  crowds.reserve('frog', 20);
  crowds.begin(camera());
  for (let i = 0; i < 10; i++) crowds.place('frog', new THREE.Vector3(i, 0, 5), 0, 1);
  crowds.end();
  assert.equal(crowds.triangles(), 10 * frogTriangles);
  // a kind with nothing placed this frame costs nothing
  crowds.begin(camera());
  crowds.end();
  assert.equal(crowds.triangles(), 0);
  assert.equal(crowds.calls(), 0);
  crowds.dispose();
});

test('the crowds are in the scene until disposed', () => {
  const w = world();
  const crowds = createCrowds(w);
  crowds.reserve('frog', 1);
  crowds.begin(null);
  crowds.place('frog', new THREE.Vector3(0, 0, 500), 0, 1);
  crowds.end();
  assert.equal(meshOf(crowds, 'frog').count, 1, 'with no camera nothing is too far');
  assert.ok(w.scene.children.includes(crowds.group));
  crowds.dispose();
  assert.ok(!w.scene.children.includes(crowds.group));
});
