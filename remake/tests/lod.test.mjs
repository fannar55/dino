import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
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
// Directed edges used more than once (two sheets pinched, or wound against each other) and edges with no
// partner the other way (open, or mis-wound).
function defects(corners, positions) {
  const { directed } = edges(corners, positions);
  let doubled = 0, open = 0;
  for (const [key, n] of directed) {
    if (n > 1) doubled++;
    const [a, b] = key.split('>');
    if (!directed.has(`${b}>${a}`)) open++;
  }
  return { doubled, open };
}

test('simplified levels of the real Mosi add no open or pinched edges and stay within the error', async () => {
  const { positions, index, diagonal } = await mosiSkin();
  const levels = simplify(positions, index, { levels: [{ ratio: 0.5, maxError: 0.001 * diagonal }, { ratio: 0.25, maxError: 0.0025 * diagonal }] });
  const source = index.length / 3;
  // his skin as baked (the mouth pass's pocket meets it along the lips, so it is not one closed surface)
  const before = defects(index, positions);
  assert.equal(levels.length, 2);
  for (const [i, level] of levels.entries()) {
    const want = [0.5, 0.25][i];
    assert.ok(level.triangles <= Math.ceil(source * want) + 2, `level ${i}: ${level.triangles} triangles for ${want} of ${source}`);
    assert.ok(level.triangles >= source * want * 0.9, `level ${i} stopped early at ${level.triangles}`);
    assert.ok(level.error <= [0.001, 0.0025][i] * diagonal + 1e-9, `level ${i}: error ${level.error}`);
    const after = defects(level.corners, positions);
    assert.ok(after.doubled <= before.doubled, `level ${i}: ${after.doubled} pinched or doubled edges (the skin had ${before.doubled})`);
    assert.ok(after.open <= before.open, `level ${i}: ${after.open} open edges (the skin had ${before.open})`);
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

test('every level keeps the skin triangles each eyelid is cut from', async () => {
  const gltf = await gltfPromise;
  const model = gltf.scene.clone(true);
  let mesh = null;
  model.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const eyes = mesh.userData.face?.eyes;
  assert.ok(eyes?.length, 'Mosi carries his eyes (face pass)');
  const full = mesh.geometry;
  // the triangles over each eye, as buildLidGeometry in eyelids.js takes them (its box round the eye)
  const position = full.attributes.position, index = full.index.array;
  // a triangle's corners from its smallest one, so the same triangle gives the same key
  const key = (a, b, c) => { const m = Math.min(a, b, c); return m === a ? `${a},${b},${c}` : m === b ? `${b},${c},${a}` : `${c},${a},${b}`; };
  const lid = new Set();
  const p = new THREE.Vector3();
  for (const eye of eyes) {
    const centre = new THREE.Vector3().fromArray(eye.centre), right = new THREE.Vector3().fromArray(eye.right);
    const down = new THREE.Vector3().fromArray(eye.down), facing = new THREE.Vector3().fromArray(eye.normal);
    const grow = 1.1 * 1.3, depth = 0.8 * grow * Math.max(eye.halfWidth, eye.top, eye.bottom);
    for (let t = 0; t < index.length; t += 3) {
      const u = [], v = [], w = [];
      for (let j = 0; j < 3; j++) { p.fromBufferAttribute(position, index[t + j]).sub(centre); u.push(p.dot(right)); v.push(p.dot(down)); w.push(p.dot(facing)); }
      if (Math.max(...u) < -grow * eye.halfWidth || Math.min(...u) > grow * eye.halfWidth) continue;
      if (Math.max(...v) < -grow * eye.top || Math.min(...v) > grow * eye.bottom || Math.max(...w) < -depth || Math.min(...w) > depth) continue;
      lid.add(key(index[t], index[t + 1], index[t + 2]));
    }
  }
  assert.ok(lid.size > 100, `${lid.size} triangles under the lids`);
  await prepareCharacter(model, null);
  await whenReady();
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  camera.position.set(500, 1, 0);
  camera.lookAt(0, 1, 0);
  updateCharacterLods(camera, 800); // far away: the quarter level
  const quarter = mesh.geometry.index.array;
  assert.ok(quarter.length < index.length * 0.3);
  const kept = new Set();
  for (let t = 0; t < quarter.length; t += 3) kept.add(key(quarter[t], quarter[t + 1], quarter[t + 2]));
  const missing = [...lid].filter(k => !kept.has(k));
  assert.equal(missing.length, 0, `${missing.length} of the ${lid.size} triangles under the lids changed`);
  releaseCharacter(model);
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
  const caster = mesh.parent.children.find(o => o.isSkinnedMesh && o !== mesh);
  assert.ok(caster, 'a caster bound to the skin, beside it');
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

test('a character out of the frame is not drawn: its posed bones bound it, so it is drawn as soon as any of it is in, and its shadow still casts', async () => {
  const gltf = await gltfPromise;
  const model = cloneSkinned(gltf.scene);
  const root = new THREE.Group();
  root.add(model);
  root.position.set(3, 0, -2);
  root.rotation.y = 0.7;
  root.updateMatrixWorld(true);
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  let mesh = null;
  model.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  mesh.castShadow = true;
  mesh.frustumCulled = false; // as actor.js has every character's meshes
  await prepareCharacter(model, sun);
  await whenReady();
  const caster = mesh.parent.children.find(o => o.isSkinnedMesh && o !== mesh);
  assert.ok(caster && caster.parent !== mesh && caster.frustumCulled === false, 'its shadow caster stands beside the skin, never culled');
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const frustum = new THREE.Frustum();
  const view = () => {
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return frustum;
  };
  // every third vertex of the skin as it is posed now, in the world
  const posed = () => {
    root.updateMatrixWorld(true);
    mesh.skeleton.update(); // as the renderer does before it draws
    const out = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < mesh.geometry.attributes.position.count; i += 3) out.push(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).clone());
    return out;
  };
  const centre = new THREE.Box3().setFromPoints(posed()).getCenter(new THREE.Vector3());
  camera.position.set(centre.x + 14, centre.y + 1, centre.z);
  // the camera turns from the character to beside it and away: while any vertex is in the frame it is drawn; once none is, it is
  // not, a few degrees on and not the 50 % more of the bind pose's sphere; and its shadow caster is in the shadow pass throughout
  const sweep = () => {
    const points = posed();
    let drawnOut = 0, culled = 0, hiddenWhileIn = 0, casting = 0;
    for (let yaw = 0; yaw <= 90; yaw += 0.5) {
      const a = THREE.MathUtils.degToRad(yaw);
      camera.lookAt(camera.position.x - Math.cos(a), camera.position.y, camera.position.z + Math.sin(a));
      updateCharacterLods(camera, 800);
      const f = view();
      const anyIn = points.some(p => f.containsPoint(p));
      if (anyIn && !mesh.visible) hiddenWhileIn++;
      if (!anyIn && mesh.visible) drawnOut++;
      if (!mesh.visible) culled++;
      sun.shadow.updateMatrices(sun);
      if (caster.visible) casting++;
      caster.onAfterShadow();
    }
    return { drawnOut, culled, hiddenWhileIn, casting };
  };
  const still = sweep();
  assert.equal(still.hiddenWhileIn, 0, 'never hidden while any of it shows');
  assert.ok(still.culled > 40, `hidden through ${still.culled / 2} of the 90 degrees`);
  assert.ok(still.drawnOut <= 20, `drawn though out of the frame for at most 10 degrees (${still.drawnOut / 2})`);
  assert.equal(still.casting, 181, 'it casts its shadow all the while');
  // a pose that swings the tail, the neck and the head far round: the bones' spheres go with them
  for (const name of ['Tail1', 'Tail2', 'Neck', 'Head']) model.getObjectByName(name)?.rotateY(0.9);
  model.getObjectByName('Body')?.rotateZ(0.5);
  const swung = sweep();
  assert.equal(swung.hiddenWhileIn, 0, 'posed: never hidden while any of it shows');
  assert.ok(swung.culled > 30 && swung.drawnOut <= 24, `posed: hidden through ${swung.culled / 2} degrees, drawn out of the frame through ${swung.drawnOut / 2}`);
  // once its actor is gone the skin is shown again and left alone, and its caster goes with it
  releaseCharacter(model);
  assert.equal(mesh.visible, true);
  assert.equal(caster.parent, null);
});
