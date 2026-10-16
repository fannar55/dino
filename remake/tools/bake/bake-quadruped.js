import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { GLTFExporter } from '../../vendor/addons/exporters/GLTFExporter.js';
import { rigQuadruped } from './quadruped-rig.js';
import { authorClips } from './quadruped-clips.js';
import { authorSauropodClips } from './sauropod-clips.js';
import { rigWinged } from './winged-rig.js';
import { authorWingedClips } from './winged-clips.js';
import { findEyes, readPixels } from './eyes.js';
import { giveHeadTexels } from './atlas.js';
import { softenBrows } from './brow.js';

// Bakes a four-legged character for the remake from an unrigged Tripo export kept in parts
// (remake/tools/blender-decimate.py ... parts): quadruped-rig.js stands it up, rigs it, welds and
// weights one skin and marks the plate rows (plateRow), quadruped-clips.js authors idle, walk, kink,
// eat and happy, and this page gives it one matte material and exports one skinned mesh. A sauropod
// (`kind=sauropod`: a raised neck of several bones, a long tail) is rigged along its neck's centre
// line and gets sauropod-clips.js instead: idle, walk, kink, lowerHead, liftUp and happy, the head
// lowered until the eyes (found here as the face pass finds them) are at a child's eye height. A
// pterosaur (`kind=pterosaur`: two legs and two wings, Flugeðla) is rigged by winged-rig.js instead,
// scaled to its wingspan, and gets winged-clips.js: idle, walk, takeOff, fly, glide, land, kink, happy
// and carry. Run it with bake-character.mjs.
//
// Query: src (parts GLB, relative to this page), out (file name for the upload), length (metres from
// nose to tail tip), yaw (degrees that turn the model's front to +X; Tripo faces +Z, so 90), name,
// tex (texture size), roughness, normal (normal map strength), kind (quadruped, sauropod or pterosaur),
// span (a pterosaur's wingspan in metres, instead of length), neck, tail, spine (bones in each chain),
// atlas (for a small head: the share of the texture's side the rest keeps, the head's islands taking the
// column that frees up; atlas.js), brow (how much to soften stern brow ridges, 1 the full change;
// brow.js), greet (a sauropod's eye height with the head lowered, metres), and for the walk: stride
// (metres a cycle), cycle (seconds), duty, lag (quadruped-clips.js, WALK).

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
const SAUROPOD = params.get('kind') === 'sauropod';
const WINGED = params.get('kind') === 'pterosaur';
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
  const options = WINGED ? { span: num('span', 7.5), yaw: YAW, name: NAME } : { length: LENGTH, yaw: YAW, name: NAME, curve: SAUROPOD };
  for (const key of ['neck', 'tail', 'spine']) if (params.has(key)) options[key] = num(key);
  const rig = WINGED ? rigWinged(sources, options) : rigQuadruped(sources, options);

  // A small head can take more of the texture (atlas.js): the rest of the atlas keeps `atlas` of its
  // side, the head's islands fill the band that frees up.
  let maps = { map: material.map, normalMap: material.normalMap || null };
  if (params.has('atlas')) {
    const head = rig.parts.find(p => p.kind === 'head');
    maps = giveHeadTexels({ geometry: rig.mesh.geometry, head: [head.start, head.count], maps, size: TEX, body: num('atlas') });
    rig.report.atlas = maps.report;
  }
  // One matte material with the Tripo colour and normal maps (the metal/roughness map is dropped),
  // the normal map softened; single-sided when the welded skin is closed.
  const mat = new THREE.MeshStandardMaterial({
    name: `${NAME} skin`, map: maps.map, normalMap: maps.normalMap,
    roughness: ROUGHNESS, metalness: 0, side: rig.closed ? THREE.FrontSide : THREE.DoubleSide,
  });
  if (mat.normalMap) mat.normalScale.set(NORMAL, NORMAL);
  for (const t of [mat.map, mat.normalMap]) if (t) t.userData.mimeType = 'image/jpeg';
  rig.mesh.material = mat;

  // The eyes, as the face pass finds them: a sauropod lowers its head to them, and `brow` softens the
  // brow ridges over them (brow.js).
  const eyes = SAUROPOD || params.has('brow') ? findEyes({ mesh: rig.mesh, pixels: readPixels(mat.map.image) }).eyes : null;
  if (params.has('brow')) rig.report.brow = softenBrows(rig.mesh, eyes, { strength: num('brow') });

  const walk = {};
  for (const key of ['stride', 'cycle', 'duty', 'lag']) if (params.has(key)) walk[key] = num(key);
  let authored;
  if (WINGED) authored = authorWingedClips(rig, walk);
  else if (SAUROPOD) {
    const between = new THREE.Vector3(...eyes[0].centre).add(new THREE.Vector3(...eyes[1].centre)).multiplyScalar(0.5);
    authored = authorSauropodClips(rig, { ...walk, eyes: between.toArray(), greet: num('greet', 0.95) });
  } else authored = authorClips(rig, walk);
  const { clips, report } = authored;

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
