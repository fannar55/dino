import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { GLTFExporter } from '../../vendor/addons/exporters/GLTFExporter.js';
import { rigQuadruped } from './quadruped-rig.js';
import { authorClips } from './quadruped-clips.js';

// Bakes a four-legged character for the remake from an unrigged Tripo export kept in parts
// (remake/tools/blender-decimate.py ... parts): quadruped-rig.js stands it up, rigs it, welds and
// weights one skin and marks the plate rows (plateRow), quadruped-clips.js authors idle, walk, kink,
// eat and happy, and this page gives it one matte material and exports one skinned mesh. Run it
// with bake-character.mjs.
//
// Query: src (parts GLB, relative to this page), out (file name for the upload), length (metres from
// nose to tail tip), yaw (degrees that turn the model's front to +X; Tripo faces +Z, so 90), name,
// tex (texture size), roughness, normal (normal map strength), and for the walk: stride (metres a
// cycle), cycle (seconds), duty, lag (quadruped-clips.js, WALK).

const params = new URLSearchParams(location.search);
const num = (key, fallback) => (params.has(key) ? Number(params.get(key)) : fallback);
const SRC = params.get('src') || '../../assets/characters/source/stegosaurus-parts.glb';
const OUT = params.get('out') || 'stegosaurus.glb';
const LENGTH = num('length', 7);
const YAW = num('yaw', 90);
const TEX = num('tex', 1024);
const ROUGHNESS = num('roughness', 0.62);
const NORMAL = num('normal', 0.5);
const NAME = params.get('name') || 'Kambeðla';
const status = text => { window.__bakeStatus = text; console.log('[bake]', text); };

try {
  status('loading');
  const gltf = await new GLTFLoader().loadAsync(SRC);
  gltf.scene.updateMatrixWorld(true);
  const sources = [];
  let material = null;
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    sources.push({ name: o.name, geometry: o.geometry.clone().applyMatrix4(o.matrixWorld) });
    material ??= o.material;
  });
  const rig = rigQuadruped(sources, { length: LENGTH, yaw: YAW, name: NAME });
  const walk = {};
  for (const key of ['stride', 'cycle', 'duty', 'lag']) if (params.has(key)) walk[key] = num(key);
  const { clips, report } = authorClips(rig, walk);

  // One matte material with the Tripo colour and normal maps (the metal/roughness map is dropped),
  // the normal map softened; single-sided when the welded skin is closed.
  const mat = new THREE.MeshStandardMaterial({
    name: `${NAME} skin`, map: material.map, normalMap: material.normalMap || null,
    roughness: ROUGHNESS, metalness: 0, side: rig.closed ? THREE.FrontSide : THREE.DoubleSide,
  });
  if (mat.normalMap) mat.normalScale.set(NORMAL, NORMAL);
  for (const t of [mat.map, mat.normalMap]) if (t) t.userData.mimeType = 'image/jpeg';
  rig.mesh.material = mat;
  if (!rig.closed) console.warn('[bake] the welded skin is not closed: double-sided', JSON.stringify(rig.report.skin));
  console.log('[bake] report', JSON.stringify({ ...rig.report, ...report, material: { roughness: ROUGHNESS, normalScale: NORMAL, side: rig.closed ? 'front' : 'double', tex: TEX } }));
  console.log(`[bake] ${rig.report.triangles} triangles, ${rig.names.length} bones, clips: ${clips.map(c => `${c.name} ${c.duration.toFixed(2)} s`).join(', ')}`);

  status('exporting');
  const glb = await new GLTFExporter().parseAsync(rig.group, { binary: true, animations: clips, maxTextureSize: TEX, onlyVisible: true });
  const res = await fetch(`/__bake-output?name=${encodeURIComponent(OUT)}`, { method: 'POST', body: glb });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  status('done');
} catch (error) {
  console.error(error);
  status(`error: ${error.message}`);
}
