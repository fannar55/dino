// Inspect real exported skin poses with the same Three.js loader as the game.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
const bytes = await readFile(new URL('../dist/assets/pteranodon/pteranodon.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
assert.ok(bytes.length < 3 * 1024 * 1024, 'The asset exceeds the 3 MB budget');
assert.equal(json.images?.length || 0, 0, 'The original asset should need no textures');
assert.ok(json.skins?.length > 0, 'The asset must be skinned');
assert.ok(json.materials.some(m => m.name.includes('membrane') && m.doubleSided), 'The thin membrane needs a double-sided material');
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const mixer = new THREE.AnimationMixer(asset.scene);
const meshes = [];
asset.scene.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
const triangles = meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0);
assert.ok(triangles <= 25000, 'The asset exceeds its 25,000 triangle budget');
assert.ok(asset.scene.getObjectByName('Head')?.isBone, 'The facial head bone must be retained');
const report = { bytes: bytes.length, triangles, primitives: meshes.length, clips: {} };
for (const name of ['idle', 'fly', 'glide', 'landing']) {
  const clip = asset.animations.find(a => a.name === name);
  assert.ok(clip, `Missing ${name} clip`);
  mixer.stopAllAction();
  mixer.clipAction(clip).play();
  const samples = [];
  const position = new THREE.Vector3();
  for (let sample = 0; sample <= 24; sample++) {
    mixer.setTime(clip.duration * sample / 24);
    asset.scene.updateMatrixWorld(true);
    for (const mesh of meshes) mesh.skeleton.update();
    const box = new THREE.Box3().setFromObject(asset.scene, true);
    const min = box.min.toArray(), max = box.max.toArray();
    assert.ok([...min, ...max].every(Number.isFinite), `${name} has non-finite skin positions`);
    assert.ok(box.getSize(new THREE.Vector3()).length() < 9, `${name} stretches outside the expected body scale`);
    // Every vertex is evaluated, including the membrane (not just bone tracks).
    for (const mesh of meshes) {
      const count = mesh.geometry.getAttribute('position').count;
      for (let i = 0; i < count; i++) {
        mesh.getVertexPosition(i, position);
        assert.ok(Number.isFinite(position.lengthSq()), `${name} has an invalid skinned vertex`);
      }
    }
    samples.push({ seconds: Number((clip.duration * sample / 24).toFixed(3)), min, max });
  }
  const first = samples[0];
  assert.ok(samples.some(s => [...s.min, ...s.max].some((v, i) => Math.abs(v - [...first.min, ...first.max][i]) > .001)), `${name} does not actually move the skin`);
  report.clips[name] = { duration: clip.duration, samples };
}
await writeFile(new URL('../qa/pteranodon-skin-check.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, clips: Object.fromEntries(Object.entries(report.clips).map(([k,v]) => [k, {duration:v.duration,minY:Math.min(...v.samples.map(s=>s.min[1])),maxSpan:Math.max(...v.samples.map(s=>s.max[2]-s.min[2]))}])) }, null, 2));
