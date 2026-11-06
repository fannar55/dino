// Baked crowd models: an animal from the owner's Tripo model, made by remake/tools/prep-crowd.mjs, for the crowds
// (world/critters/crowd.js). Its file holds two meshes, `near` and `far` (the same animal with fewer triangles), each with every
// clip frozen into morph targets `<clip>.<k>`, k = 0 ... frames - 1 evenly over the clip; the scene's extras say
// { clips: { <clip>: { frames, seconds } }, length, height, pivot } and the near mesh's extras how far it is drawn (`until`).
//
//   const model = await loadCrowdModel(url)  -> { lods: [{ geometry, until: 30 }, { geometry }], material, clips, height, pivot }
//   crowds.reserve('smaedla', 30, model)     -> near critters from lods[0] within `until` metres, far ones from lods[1]
//   crowds.place('smaedla', at, heading, scale, { morphs: clipPose(model, 'run', time, phase) })
//
// A pose is a pure function of the time, so a seek or a capture lands on the same pose as playing.
import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';

/** Loads a baked crowd GLB (see above). */
export async function loadCrowdModel(url, loader = new GLTFLoader()) {
  return crowdModelFrom(await loader.loadAsync(url));
}

/**
 * The crowd model in a loaded GLB (`{ scene }`, as the GLTFLoader gives it). Each level's geometry is in metres in the model's own
 * space (the node's scale, which unpacks a quantized file, is baked in), with plain float attributes and its frames named.
 */
export function crowdModelFrom(gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const near = root.getObjectByName('near') ?? meshes[0];
  const far = root.getObjectByName('far') ?? meshes.find(m => m !== near);
  if (!near) throw new Error('[crowd-models] the file has no mesh');
  const info = root.userData ?? {};
  const until = near.userData?.until ?? 30;
  const lods = [{ geometry: inMetres(near), until }];
  if (far) lods.push({ geometry: inMetres(far) });
  return {
    lods,
    material: near.material,
    clips: info.clips ?? {},
    length: info.length,
    height: info.height,
    pivot: info.pivot ?? 0,
  };
}

/** A mesh's geometry with its world matrix applied, as floats, its morph attributes named from the mesh's dictionary. */
function inMetres(mesh) {
  const source = mesh.geometry;
  const matrix = mesh.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const delta = new THREE.Matrix3().setFromMatrix4(matrix); // morph deltas are vectors: no translation
  const geometry = new THREE.BufferGeometry();
  const floats = attribute => {
    const out = new THREE.Float32BufferAttribute(new Float32Array(attribute.count * attribute.itemSize), attribute.itemSize);
    for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) out.setComponent(i, c, attribute.getComponent(i, c));
    return out;
  };
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const copy = floats(attribute);
    if (name === 'position') copy.applyMatrix4(matrix);
    else if (name === 'normal') { copy.applyNormalMatrix(normalMatrix); copy.normalized = false; }
    geometry.setAttribute(name, copy);
  }
  if (source.index) geometry.setIndex(source.index.clone());
  const names = [];
  for (const [name, i] of Object.entries(mesh.morphTargetDictionary ?? {})) names[i] = name;
  for (const [name, list] of Object.entries(source.morphAttributes)) {
    geometry.morphAttributes[name] = list.map((attribute, i) => {
      const copy = floats(attribute);
      if (name === 'position') copy.applyMatrix3(delta);
      else if (name === 'normal') copy.applyMatrix3(normalMatrix);
      copy.name = names[i] ?? attribute.name ?? `${i}`;
      return copy;
    });
  }
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.name = mesh.name;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The pose of `clip` at `time` seconds (the game clock), `phase` (0 to 1) along the clip for this critter: the two frames round
 * (time / seconds + phase) mod 1, blended linearly, weights summing to 1. Every clip loops.
 */
export function clipPose(model, clip, time, phase = 0) {
  const { frames, seconds } = model.clips[clip];
  if (frames < 2) return { [`${clip}.0`]: 1 };
  let u = (time / seconds + phase) % 1;
  if (u < 0) u += 1;
  const at = u * frames;
  const k = Math.floor(at) % frames;
  const w = at - Math.floor(at);
  const next = (k + 1) % frames;
  return { [`${clip}.${k}`]: 1 - w, [`${clip}.${next}`]: w };
}
