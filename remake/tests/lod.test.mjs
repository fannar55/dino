import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { simplify } from '../engine/simplify.js';
import { prepareCharacter, releaseCharacter, updateCharacterLods, whenReady } from '../engine/character-lod.js';
import { depthShadowChunk } from '../engine/shadows.js';

// The real Mosi, read without textures (no DOM in Node).
function loadMosi() {
  const glb = fs.readFileSync(new URL('../assets/characters/mosi.glb', import.meta.url));
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) {
    delete material.normalTexture;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const rest = glb.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + text.length + rest.length, 8);
  header.writeUInt32LE(text.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([header, text, rest]);
  return new Promise((resolve, reject) => new GLTFLoader().parse(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength), '', resolve, reject));
}
const gltfPromise = loadMosi();
async function mosiSkin() {
  const gltf = await gltfPromise;
  let mesh = null;
  gltf.scene.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const g = mesh.geometry;
  const p = g.attributes.position;
  const positions = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { positions[i * 3] = p.getX(i); positions[i * 3 + 1] = p.getY(i); positions[i * 3 + 2] = p.getZ(i); }
  g.computeBoundingBox();
  return { gltf, mesh, positions, index: g.index.array, diagonal: g.boundingBox.getSize(new THREE.Vector3()).length() };
}

// Edges of a triangle list on vertices welded by position: each directed edge's count.
function edges(corners, positions) {
  const ids = new Map();
  const weld = i => {
    const key = `${positions[i * 3]},${positions[i * 3 + 1]},${positions[i * 3 + 2]}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    return ids.get(key);
  };
  const directed = new Map();
  for (let t = 0; t < corners.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const key = `${weld(corners[t + k])}>${weld(corners[t + (k + 1) % 3])}`;
      directed.set(key, (directed.get(key) || 0) + 1);
    }
  }
  return { directed, weld };
}

test('simplified levels of the real Mosi keep his skin closed, consistently wound and within the error', async () => {
  const { positions, index, diagonal } = await mosiSkin();
  const levels = simplify(positions, index, { levels: [{ ratio: 0.5, maxError: 0.001 * diagonal }, { ratio: 0.25, maxError: 0.0025 * diagonal }] });
  const source = index.length / 3;
  assert.equal(levels.length, 2);
  for (const [i, level] of levels.entries()) {
    const want = [0.5, 0.25][i];
    assert.ok(level.triangles <= Math.ceil(source * want) + 2, `level ${i}: ${level.triangles} triangles for ${want} of ${source}`);
    assert.ok(level.triangles >= source * want * 0.9, `level ${i} stopped early at ${level.triangles}`);
    assert.ok(level.error <= [0.001, 0.0025][i] * diagonal + 1e-9, `level ${i}: error ${level.error}`);
    const { directed } = edges(level.corners, positions);
    for (const [key, n] of directed) {
      const [a, b] = key.split('>');
      assert.equal(n, 1, `edge ${key} used ${n} times one way`);
      assert.equal(directed.get(`${b}>${a}`), 1, `edge ${key} has no partner the other way (open or mis-wound)`);
    }
  }
});

test('simplification never moves a vertex that sits on a seam, and every corner is an original vertex', async () => {
  const { positions, index } = await mosiSkin();
  const [level] = simplify(positions, index, { levels: [{ ratio: 0.25, maxError: Infinity }] });
  const count = positions.length / 3;
  for (const c of level.corners) assert.ok(c >= 0 && c < count);
  // positions shared by more than one vertex (UV or normal seams) all survive
  const byPosition = new Map();
  for (let i = 0; i < count; i++) {
    const key = `${positions[i * 3]},${positions[i * 3 + 1]},${positions[i * 3 + 2]}`;
    byPosition.set(key, (byPosition.get(key) || 0) + 1);
  }
  const kept = new Set();
  for (const c of level.corners) kept.add(`${positions[c * 3]},${positions[c * 3 + 1]},${positions[c * 3 + 2]}`);
  for (const [key, n] of byPosition) if (n > 1) assert.ok(kept.has(key), `seam vertex at ${key} was removed`);
});

test('a character gets half and quarter levels by its size on screen, with some slack against flicker', async () => {
  const gltf = await gltfPromise;
  const model = gltf.scene.clone(true);
  const root = new THREE.Group();
  root.add(model);
  root.updateMatrixWorld(true);
  await prepareCharacter(model, null);
  await whenReady();
  let mesh = null;
  model.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const full = mesh.geometry.index.count;
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const centre = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
  const at = (d, look = centre) => {
    camera.position.set(centre.x + d, centre.y, centre.z);
    camera.lookAt(look);
    updateCharacterLods(camera, 800);
    return mesh.geometry.index.count / full;
  };
  // the bind-pose diagonal on screen: 700 px and 200 px are the switches (8 % slack each way)
  const diagonal = mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length() * mesh.matrixWorld.getMaxScaleOnAxis();
  const distanceFor = px => (diagonal * 800) / (2 * Math.tan((40 * Math.PI) / 360) * px);
  const near = (x, want, why) => assert.ok(Math.abs(x - want) < 0.02, `${why}: ${x.toFixed(3)} of the triangles`);
  near(at(distanceFor(1200)), 1, 'full when big');
  near(at(distanceFor(600)), 0.5, 'half below 700 px');
  near(at(distanceFor(150)), 0.25, 'quarter below 200 px');
  near(at(distanceFor(205)), 0.25, 'stays at the quarter just above 200 px');
  near(at(distanceFor(230)), 0.5, 'back to the half past 216 px');
  near(at(distanceFor(760)), 1, 'full again past 756 px');
  // out of view it draws the quarter, whatever its size; back in view, its size counts again
  near(at(distanceFor(1200), new THREE.Vector3(centre.x + distanceFor(1200), centre.y, centre.z + 50)), 0.25, 'quarter out of view');
  near(at(distanceFor(1200)), 1, 'full back in view');
  // the levels draw with the full mesh's own vertex buffers
  at(distanceFor(150));
  assert.equal(mesh.geometry.attributes.position, (await gltfPromise).scene.getObjectByName(mesh.name).geometry.attributes.position);
  // once its actor is gone, the mesh is left alone
  releaseCharacter(model);
  near(at(distanceFor(1200)), 0.25, 'left alone after release');
});

test('a character casts its sun shadow with its quarter level, only in the shadow pass', async () => {
  const gltf = await gltfPromise;
  const model = gltf.scene.clone(true);
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  let mesh = null;
  model.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  mesh.castShadow = true;
  await prepareCharacter(model, sun);
  const caster = mesh.children.find(o => o.isSkinnedMesh);
  assert.ok(caster, 'a caster bound to the skin');
  assert.equal(caster.skeleton, mesh.skeleton);
  assert.equal(mesh.castShadow, false);
  assert.equal(caster.castShadow, true);
  assert.ok(caster.geometry.index.count < mesh.geometry.index.count * 0.3);
  assert.equal(caster.visible, false, 'hidden while the main render list is built');
  sun.shadow.updateMatrices(sun);
  assert.equal(caster.visible, true, 'shown when the sun shadow pass starts');
  caster.onAfterShadow();
  assert.equal(caster.visible, false, 'hidden again once drawn');
});

test('the sun shadow map is read as a depth texture with four hardware compares', () => {
  const chunk = depthShadowChunk();
  assert.ok(chunk, 'three\'s shadow chunk still has the declaration and anchor this patches');
  assert.match(chunk, /uniform sampler2DShadow directionalShadowMap\[ NUM_DIR_LIGHT_SHADOWS \];/);
  assert.match(chunk, /float getShadow\( sampler2DShadow shadowMap/);
  assert.equal((chunk.match(/texture\( shadowMap, vec3\(/g) || []).length, 4);
  assert.equal(depthShadowChunk('a changed chunk'), null);
});
