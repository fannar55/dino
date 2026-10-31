import * as THREE from 'three';
import { simplify } from '../simplify.js';

/** Light, shadow-only skins for the six babies (their own buffers, positions and skin weights only). Visible skins,
 * eyelids and the skeletons remain the engine's originals. */
export function createMemoryShadowLods(actors, light) {
  const cache = new Map(), stats = [];
  const texel = (light.shadow.camera.right - light.shadow.camera.left) / light.shadow.mapSize.x;
  for (const actor of actors) {
    actor.root.updateMatrixWorld(true);
    actor.model.traverse(mesh => {
      if (!mesh.isSkinnedMesh || !mesh.castShadow || !mesh.name.endsWith(' shadow')) return;
      const source = mesh.geometry, scale = mesh.matrixWorld.getMaxScaleOnAxis();
      if (!cache.has(source)) {
        // A shadow needs neither UVs nor normals, so the vertices a seam split (they share a place) are joined again first:
        // the simplifier never moves a seam vertex, which left most of this skin untouched.
        const position = source.attributes.position, skinIndex = source.attributes.skinIndex, skinWeight = source.attributes.skinWeight;
        const joined = new Map(), welds = new Int32Array(position.count), at = [];
        for (let i = 0; i < position.count; i++) {
          const key = `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
          if (!joined.has(key)) { joined.set(key, at.length); at.push(i); }
          welds[i] = joined.get(key);
        }
        const positions = new Float32Array(at.length * 3), indices = new Int32Array(at.length * 4), weights = new Float32Array(at.length * 4);
        at.forEach((i, w) => {
          positions[w * 3] = position.getX(i); positions[w * 3 + 1] = position.getY(i); positions[w * 3 + 2] = position.getZ(i);
          for (let k = 0; k < 4; k++) { indices[w * 4 + k] = skinIndex.getComponent(i, k); weights[w * 4 + k] = skinWeight.getComponent(i, k); }
        });
        const index = Uint32Array.from(source.index.array, corner => welds[corner]);
        // Include the engine quarter mesh's existing error in the allowance.
        // At tablet resolution both passes together stay below 1.5 sun texels (under 5 cm on the ground).
        const priorError = source.userData.lod?.error ?? 0;
        const allowance = Math.max(0, texel * 1.5 / scale - priorError);
        const [result] = simplify(positions, index, { levels: [{ ratio: .2, maxError: allowance }], skin: { indices, weights } });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(indices), 4));
        geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
        geometry.setIndex(new THREE.BufferAttribute(at.length < 65536 ? Uint16Array.from(result.corners) : result.corners, 1));
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
