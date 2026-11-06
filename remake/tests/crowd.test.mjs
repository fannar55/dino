// Crowds (world/critters/crowd.js): any number of critters of a kind in one draw call, each with its own place, heading, size,
// pose and wings, and none drawn that is too far from the camera to be seen.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrowds } from '../world/critters/crowd.js';
import { createModel } from '../world/critters/models.js';
import { clipPose, crowdModelFrom } from '../world/critters/crowd-models.js';
import { loadGlb } from './glb.mjs';

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

// ---- baked crowd models (world/critters/crowd-models.js): clips frozen into morph targets <clip>.<k>, two levels of detail ----

/** A synthetic baked model: a box (12 triangles) or a tetrahedron (4) with morphs run.0 ... run.7, each frame lifted k cm. */
function bakedGeometry(coarse) {
  const geometry = coarse
    ? new THREE.TetrahedronGeometry(0.2)
    : new THREE.BoxGeometry(0.4, 0.2, 0.1).toNonIndexed();
  const count = geometry.getAttribute('position').count;
  geometry.morphAttributes.position = Array.from({ length: 8 }, (_, k) => {
    const delta = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) delta[i * 3 + 1] = k * 0.01;
    return Object.assign(new THREE.Float32BufferAttribute(delta, 3), { name: `run.${k}` });
  });
  geometry.morphTargetsRelative = true;
  return geometry;
}
const bakedModel = () => ({
  lods: [{ geometry: bakedGeometry(false), until: 30 }, { geometry: bakedGeometry(true) }],
  material: new THREE.MeshStandardMaterial(),
  clips: { run: { frames: 8, seconds: 2 } },
  height: 0.2,
  pivot: 0,
});
const rounded = weights => Object.fromEntries(Object.entries(weights).filter(([, w]) => w > 0).map(([k, w]) => [k, +w.toFixed(9)]));

test('clipPose blends the two frames round the time', () => {
  const model = bakedModel();
  // 3.5 frames into the 2 s clip: halfway from run.3 to run.4
  assert.deepEqual(rounded(clipPose(model, 'run', 3.5 / 8 * 2)), { 'run.3': 0.5, 'run.4': 0.5 });
  // the phase moves a critter along its own clip
  assert.deepEqual(rounded(clipPose(model, 'run', 0, 3.5 / 8)), { 'run.3': 0.5, 'run.4': 0.5 });
  // past the last frame it wraps round to the first
  assert.deepEqual(rounded(clipPose(model, 'run', 7.5 / 8 * 2)), { 'run.7': 0.5, 'run.0': 0.5 });
  assert.deepEqual(rounded(clipPose(model, 'run', 2 + 7.75 / 8 * 2)), { 'run.7': 0.25, 'run.0': 0.75 });
  // a time before the clip's start runs it backwards, still round
  assert.deepEqual(rounded(clipPose(model, 'run', -0.25 / 8 * 2)), { 'run.7': 0.25, 'run.0': 0.75 });
  for (const t of [0, 0.3, 1.1, 5.55, -3.2]) {
    const sum = Object.values(clipPose(model, 'run', t, 0.37)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `the weights at ${t} s add up to 1 (${sum})`);
  }
});

test('a crowd with two levels draws near critters fine and far ones coarse', () => {
  const model = bakedModel();
  const crowds = createCrowds(world());
  crowds.reserve('lizard', 4, model);
  crowds.begin(camera());
  const pose = { morphs: clipPose(model, 'run', 3.5 / 8 * 2) };
  assert.ok(crowds.place('lizard', new THREE.Vector3(10, 0, 0), 0, 1, pose) >= 0, 'at 10 m');
  assert.ok(crowds.place('lizard', new THREE.Vector3(60, 0, 0), 0, 1, pose) >= 0, 'at 60 m');
  crowds.end();
  assert.equal(crowds.calls(), 2, 'one call a level');
  const [fine, coarse] = crowds.meshes.filter(m => m.userData.kind === 'lizard').sort((a, b) => a.userData.level - b.userData.level);
  assert.equal(fine.geometry, model.lods[0].geometry);
  assert.equal(coarse.geometry, model.lods[1].geometry);
  assert.equal(fine.count, 1, 'the one at 10 m is drawn fine');
  assert.equal(coarse.count, 1, 'the one at 60 m is drawn coarse');
  assert.equal(fine.material, model.material);
  assert.equal(coarse.material, model.material);
  assert.equal(crowds.triangles(), 12 + 4);
  // both levels pose their critter: run.3 and run.4 at half each
  for (const mesh of [fine, coarse]) {
    const row = mesh.geometry.morphAttributes.position.length + 1;
    const data = mesh.morphTexture.source.data.data;
    assert.equal(row, 9);
    assert.deepEqual([data[1 + 3], data[1 + 4], data[1 + 5]], [0.5, 0.5, 0], `${mesh.name}: its critter's pose`);
  }
  assert.ok(Math.abs(crowds.placed()[0].height - 0.2) < 1e-9, 'the height is the model\'s');
  // all come near: all fine, one call
  crowds.begin(camera());
  for (let i = 0; i < 4; i++) crowds.place('lizard', new THREE.Vector3(5 + i, 0, 0), 0, 1);
  crowds.end();
  assert.equal(fine.count, 4);
  assert.equal(coarse.count, 0);
  assert.equal(crowds.calls(), 1);
  crowds.dispose();
});

test('a baked crowd GLB\'s scene becomes levels in metres with named frames', () => {
  // As the GLTFLoader gives a quantized file: 16-bit positions and frames, the node scaling them back to metres.
  const scene = new THREE.Group();
  scene.userData = { clips: { run: { frames: 2, seconds: 0.5 } }, length: 0.8, height: 0.4, pivot: 0 };
  const material = new THREE.MeshStandardMaterial();
  const level = (name, scale, until) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Int16Array([0, 0, 0, 32767, 0, 0, 0, 32767, 0]), 3, true));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127]), 3, true));
    geometry.morphAttributes.position = [0, 1].map(k => new THREE.BufferAttribute(new Int16Array([0, 16384 * k, 0, 0, 0, 0, 0, 0, 0]), 3, true));
    geometry.morphTargetsRelative = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.scale.setScalar(scale);
    mesh.morphTargetDictionary = { 'run.0': 0, 'run.1': 1 };
    if (until) mesh.userData.until = until;
    scene.add(mesh);
  };
  level('far', 0.5);
  level('near', 0.8, 30);
  const model = crowdModelFrom({ scene });
  assert.equal(model.lods.length, 2);
  const [fine, coarse] = model.lods;
  assert.equal(fine.until, 30);
  assert.ok(Math.abs(fine.geometry.getAttribute('position').getX(1) - 0.8) < 1e-4, 'positions in metres');
  assert.ok(Math.abs(coarse.geometry.getAttribute('position').getX(1) - 0.5) < 1e-4, 'the coarse level is its own');
  assert.ok(Math.abs(fine.geometry.getAttribute('normal').getZ(0) - 1) < 1e-6);
  const frames = fine.geometry.morphAttributes.position;
  assert.deepEqual(frames.map(a => a.name), ['run.0', 'run.1']);
  assert.ok(Math.abs(frames[1].getY(0) - 0.4) < 1e-3, `the frames too (${frames[1].getY(0)})`);
  assert.ok(fine.geometry.morphTargetsRelative);
  assert.equal(model.material, material);
  assert.deepEqual(model.clips, { run: { frames: 2, seconds: 0.5 } });
  assert.equal(model.height, 0.4);
  assert.equal(model.pivot, 0);
});

test('the small lizard is the owner\'s model baked within the budget', async () => {
  const model = crowdModelFrom(await loadGlb(new URL('../assets/critters/smaedla.glb', import.meta.url)));
  const triangles = g => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  assert.ok(triangles(model.lods[0].geometry) <= 800, `near ${triangles(model.lods[0].geometry)} triangles`);
  assert.ok(triangles(model.lods[1].geometry) <= 250, `far ${triangles(model.lods[1].geometry)} triangles`);
  assert.equal(model.lods[0].until, 30);
  for (const clip of ['run', 'idle', 'drink', 'look']) assert.equal(model.clips[clip]?.frames, 8, `${clip} has 8 frames`);
  assert.ok(Math.abs(model.clips.run.seconds - 0.45) < 0.05 && Math.abs(model.clips.idle.seconds - 3) < 0.5);
  for (const { geometry } of model.lods) {
    const frames = geometry.morphAttributes.position;
    const names = frames.map(a => a.name);
    for (const [clip, { frames: n }] of Object.entries(model.clips)) {
      for (let k = 0; k < n; k++) assert.ok(names.includes(`${clip}.${k}`), `${clip}.${k}`);
      // each frame differs from the next: the clip moves
      for (let k = 0; k < n; k++) {
        const a = frames[names.indexOf(`${clip}.${k}`)], b = frames[names.indexOf(`${clip}.${(k + 1) % n}`)];
        let most = 0;
        for (let i = 0; i < a.count; i++) most = Math.max(most, Math.hypot(a.getX(i) - b.getX(i), a.getY(i) - b.getY(i), a.getZ(i) - b.getZ(i)));
        assert.ok(most > 0.002, `${clip}.${k} and the next differ (${most.toFixed(4)} m)`);
      }
    }
  }
  const box = new THREE.Box3().setFromBufferAttribute(model.lods[0].geometry.getAttribute('position'));
  assert.ok(Math.abs(box.max.x - box.min.x - 0.8) < 0.01, `0.8 m nose to tail (${(box.max.x - box.min.x).toFixed(3)})`);
  assert.ok(Math.abs(box.min.y) < 0.005, `feet on y = 0 (${box.min.y.toFixed(4)})`);
  assert.ok(Math.abs(model.height - (box.max.y - box.min.y)) < 0.005);
});

test('the grazer is the owner\'s model baked within the budget, walking, trotting and grazing', async () => {
  const model = crowdModelFrom(await loadGlb(new URL('../assets/critters/grasbitur.glb', import.meta.url)));
  const triangles = g => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  assert.ok(triangles(model.lods[0].geometry) <= 1500, `near ${triangles(model.lods[0].geometry)} triangles`);
  assert.ok(triangles(model.lods[1].geometry) <= 400, `far ${triangles(model.lods[1].geometry)} triangles`);
  assert.equal(model.lods[0].until, 30);
  for (const clip of ['walk', 'trot', 'graze', 'look']) assert.equal(model.clips[clip]?.frames, 8, `${clip} has 8 frames`);
  // the game moves a walking or trotting grazer on at its clip's stride a cycle, the trot the quicker
  const speed = clip => model.clips[clip].stride / model.clips[clip].seconds;
  assert.ok(speed('walk') > 0.3 && speed('trot') > 1.5 * speed('walk'), `walk ${speed('walk')} m/s, trot ${speed('trot')} m/s`);
  for (const { geometry } of model.lods) {
    const frames = geometry.morphAttributes.position;
    const names = frames.map(a => a.name);
    for (const [clip, { frames: n }] of Object.entries(model.clips)) {
      for (let k = 0; k < n; k++) assert.ok(names.includes(`${clip}.${k}`), `${clip}.${k}`);
      for (let k = 0; k < n; k++) {
        const a = frames[names.indexOf(`${clip}.${k}`)], b = frames[names.indexOf(`${clip}.${(k + 1) % n}`)];
        let most = 0;
        for (let i = 0; i < a.count; i++) most = Math.max(most, Math.hypot(a.getX(i) - b.getX(i), a.getY(i) - b.getY(i), a.getZ(i) - b.getZ(i)));
        assert.ok(most > 0.005, `${clip}.${k} and the next differ (${most.toFixed(4)} m)`);
      }
    }
  }
  const box = new THREE.Box3().setFromBufferAttribute(model.lods[0].geometry.getAttribute('position'));
  assert.ok(Math.abs(box.max.x - box.min.x - 2.5) < 0.03, `2.5 m beak to tail (${(box.max.x - box.min.x).toFixed(3)})`);
  assert.ok(Math.abs(box.min.y) < 0.01, `feet on y = 0 (${box.min.y.toFixed(4)})`);
  assert.ok(Math.abs(model.height - (box.max.y - box.min.y)) < 0.01);
});
