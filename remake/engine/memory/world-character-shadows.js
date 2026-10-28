import * as THREE from 'three';
import { simplify } from '../simplify.js';

/** Local index buffers for the six babies' shadow-only skins. Visible skins,
 * eyelids and every skeleton/skin-weight buffer remain the engine's originals. */
export function createMemoryShadowLods(actors, light) {
  const cache = new Map(), stats = [];
  const texel = (light.shadow.camera.right - light.shadow.camera.left) / light.shadow.mapSize.x;
  for (const actor of actors) {
    actor.root.updateMatrixWorld(true);
    actor.model.traverse(mesh => {
      if (!mesh.isSkinnedMesh || !mesh.castShadow || !mesh.name.endsWith(' shadow')) return;
      const source = mesh.geometry, scale = mesh.matrixWorld.getMaxScaleOnAxis();
      if (!cache.has(source)) {
        const position = source.attributes.position, skinIndex = source.attributes.skinIndex, skinWeight = source.attributes.skinWeight;
        const positions = new Float32Array(position.count * 3), indices = new Int32Array(position.count * 4), weights = new Float32Array(position.count * 4);
        for (let i = 0; i < position.count; i++) {
          positions[i * 3] = position.getX(i); positions[i * 3 + 1] = position.getY(i); positions[i * 3 + 2] = position.getZ(i);
          for (let k = 0; k < 4; k++) { indices[i * 4 + k] = skinIndex.getComponent(i, k); weights[i * 4 + k] = skinWeight.getComponent(i, k); }
        }
        // Include the engine quarter mesh's existing error in the allowance.
        // At tablet resolution both passes together stay below 0.7 sun texel.
        const priorError = source.userData.lod?.error ?? 0;
        const allowance = Math.max(0, texel * .7 / scale - priorError);
        const [result] = simplify(positions, Uint32Array.from(source.index.array), { levels: [{ ratio: .3, maxError: allowance }], skin: { indices, weights } });
        const geometry = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
        geometry.setIndex(new THREE.BufferAttribute(position.count < 65536 ? Uint16Array.from(result.corners) : result.corners, 1));
        geometry.boundingBox = source.boundingBox; geometry.boundingSphere = source.boundingSphere;
        geometry.userData.memoryShadow = { sourceTriangles: source.index.count / 3, triangles: result.triangles, worldError: (priorError + result.error) * scale, texel };
        cache.set(source, geometry);
      }
      mesh.geometry = cache.get(source);
      stats.push({ species: actor.species, ...mesh.geometry.userData.memoryShadow });
    });
  }
  return { stats, dispose() { for (const geometry of cache.values()) geometry.dispose(); cache.clear(); } };
}
