import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// Only the selected, optimized models are hosted with the game. Source archives
// and untouched originals remain outside the public directory.
const baseUrl = new URL('./assets/environment/', import.meta.url);
let assetPromise;

export function preloadEnvironmentAssets() {
  return assetPromise ??= loadAssets();
}

async function loadAssets() {
  const result = { models: new Map(), groundColor: null, groundNormal: null, failed: [] };
  const loader = new GLTFLoader();
  const sharedTextures = new Map();
  let manifest;
  try {
    const response = await fetch(new URL('manifest.json', baseUrl));
    if (!response.ok) throw new Error('Environment manifest unavailable');
    manifest = await response.json();
  } catch {
    result.failed.push('manifest');
    return result;
  }
  await Promise.all(manifest.models.map(async entry => {
    try {
      const gltf = await loader.loadAsync(new URL(entry.file, baseUrl).href);
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const normalization = new THREE.Matrix4().makeScale(1 / size.y, 1 / size.y, 1 / size.y);
      normalization.multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
      const parts = [];
      gltf.scene.traverse(object => {
        if (!object.isMesh) return;
        const geometry = object.geometry.clone();
        geometry.applyMatrix4(normalization.clone().multiply(object.matrixWorld));
        const materials = (Array.isArray(object.material) ? object.material : [object.material]).map(source => {
          const material = source.clone();
          material.roughness = .9; material.metalness = 0;
          if (/Leaves|Grass/.test(material.name)) {
            material.emissive = new THREE.Color('#477c32');
            material.emissiveIntensity = .11;
          }
          for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap']) {
            const texture = material[key];
            if (!texture?.name) continue;
            const identity = `${texture.name}:${texture.colorSpace}`;
            if (sharedTextures.has(identity)) material[key] = sharedTextures.get(identity);
            else sharedTextures.set(identity, texture);
          }
          // Alpha-tested leaves retain depth ordering, avoiding translucent forest layers.
          if (material.transparent || material.alphaTest > 0) {
            material.transparent = false; material.alphaTest = .43;
            material.side = THREE.DoubleSide; material.depthWrite = true;
            material.alphaToCoverage = true;
          }
          if (material.map) material.map.anisotropy = 2;
          return material;
        });
        parts.push({ geometry, material: materials.length === 1 ? materials[0] : materials });
      });
      result.models.set(entry.id, { ...entry, parts, sourceHeight: size.y });
    } catch {
      result.failed.push(entry.id);
    }
  }));
  // Seeded placement must not depend on which cached/network model finishes
  // first. Keep the same species/shape order in the browser and offline QA.
  result.models = new Map(manifest.models
    .filter(entry => result.models.has(entry.id))
    .map(entry => [entry.id, result.models.get(entry.id)]));
  const textures = new THREE.TextureLoader();
  await Promise.all([
    ['groundColor', 'forest-ground-color.webp', true],
    ['groundNormal', 'forest-ground-normal.webp', false],
  ].map(async ([key, file, color]) => {
    try {
      const texture = await textures.loadAsync(new URL(file, baseUrl).href);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(39, 23); texture.anisotropy = 4;
      if (color) texture.colorSpace = THREE.SRGBColorSpace;
      result[key] = texture;
    } catch { result.failed.push(file); }
  }));
  return result;
}

/** Place one coherent family of imported nature models in streamed route sections. */
export function populateEnvironment(scene, assets, { rng, groundHeight, lakeShape, pathZ, isClearing, streamedBatches, windUniform }) {
  const batches = new Map(), dummy = new THREE.Object3D();
  const byKind = kind => [...assets.models.values()].filter(model => model.kind === kind);
  const trees = byKind('tree'), plants = byKind('plant'), rocks = byKind('rock'), logs = byKind('log');
  const bushes = byKind('bush'), grasses = byKind('grass'), mushrooms = byKind('mushroom');
  function place(model, x, z, height, rotation = rng() * Math.PI * 2, shade = 1) {
    if (!model) return;
    const section = Math.floor(x / 18), key = `${model.id}:${section}`;
    if (!batches.has(key)) batches.set(key, { model, section, transforms: [] });
    batches.get(key).transforms.push({ x, y: groundHeight(x, z) - .035, z, height, rotation, shade });
  }
  // Tall trunks frame the route. The entire foreground camera corridor remains open.
  for (let i = 0; i < 114; i++) {
    const x = -28 + rng() * 139, z = -9 - rng() * 40;
    if (lakeShape(x, z) < 1.27) continue;
    const height = 10 + rng() * 11;
    place(trees[i % trees.length], x, z, height, undefined, .88 + rng() * .2);
  }
  // A second, sparse line closes gaps in the forest horizon without many draw calls.
  for (let i = 0; i < 22; i++) {
    const x = -24 + i * 6, z = -47 - rng() * 8;
    place(trees[i % trees.length], x, z, 17 + rng() * 7, undefined, .86);
  }
  // Frame the opening shot with trunks instead of exposing a flat horizon gap.
  place(trees[1], -16, -20, 18, 1.7, .96);
  place(trees[0], -25, -32, 22, .4, .93);
  place(trees[2], -11, -36, 20, 2.1, .92);
  for (let i = 0; i < 300; i++) {
    const x = -23 + rng() * 130, z = -25 + rng() * 41;
    if (Math.abs(z - pathZ(x)) < 3 || lakeShape(x, z) < 1.05) continue;
    const inClearing = isClearing(x, z);
    if (inClearing && rng() < .82) continue;
    const height = inClearing ? .25 + rng() * .23 : z > 7 ? .35 + rng() * .36 : .45 + rng() * 1.05;
    place(plants[i % plants.length], x, z, height, undefined, .88 + rng() * .2);
  }
  for (let i = 0; i < 74; i++) {
    let x = -20 + rng() * 120, z = -23 + rng() * 36;
    if (Math.abs(z - pathZ(x)) < 3 || isClearing(x, z) || lakeShape(x, z) < .97) continue;
    // This one seeded boulder covered Mosi when the sky camera tilted upward.
    // Keep the rock, but place it at the eastern treeline behind the characters.
    if (Math.abs(x - 79.66146) < .001 && Math.abs(z - 7.45822) < .001) { x = 88; z = -6; }
    place(rocks[i % rocks.length], x, z, .45 + rng() * 1.1, undefined, .85 + rng() * .23);
  }
  for (let i = 0; i < 43; i++) {
    const x = -23 + rng() * 130, z = -12 - rng() * 20;
    if (lakeShape(x, z) < 1.17) continue;
    place(bushes[0], x, z, 1.5 + rng() * 1.6, undefined, .88 + rng() * .13);
  }
  // Close vegetation provides a readable sense of motion while Mosi walks.
  for (let i = 0; i < 280; i++) {
    const x = -23 + rng() * 130, side = i % 2 ? 1 : -1;
    const z = pathZ(x) + side * (3.1 + rng() * 2.2);
    if (lakeShape(x, z) < 1.05 || (isClearing(x, z) && rng() < .67)) continue;
    place(grasses[0], x, z, .24 + rng() * .23, undefined, .84 + rng() * .23);
    if (i % 13 === 0) place(mushrooms[0], x + .3, z, .17 + rng() * .17);
  }
  // Shore rocks and ferns make the lake edge visibly meet the water.
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2, x = 64 + Math.cos(a) * 17.7, z = -10 + Math.sin(a) * 11.5;
    if (z > -1 && x > 49 && x < 76) continue;
    place(rocks[i % rocks.length], x, z, .5 + rng() * .65, a);
    place(plants[i % plants.length], x + .5, z + .2, .7 + rng() * .5);
  }
  for (const [x, z, height, angle] of [[-6, -7, .8, .7], [21, -8, 1.1, 1.4], [34, 11, .75, .2], [76, 6, .8, 1.8]]) {
    place(logs[0], x, z, height, angle);
  }
  const windMaterials = new Set();
  for (const { model, section, transforms } of batches.values()) {
    for (const part of model.parts) {
      const instanced = new THREE.InstancedMesh(part.geometry, part.material, transforms.length);
      for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        dummy.position.set(t.x, t.y, t.z); dummy.rotation.set(0, t.rotation, 0); dummy.scale.setScalar(t.height); dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix); instanced.setColorAt(i, new THREE.Color().setScalar(t.shade));
      }
      instanced.castShadow = model.kind === 'tree' || model.kind === 'rock';
      instanced.receiveShadow = true; instanced.computeBoundingSphere();
      instanced.name = `environment:${model.id}:${section}`;
      scene.add(instanced); streamedBatches.push({ object: instanced, x: section * 18 + 9 });
      if (['tree', 'plant', 'bush', 'grass'].includes(model.kind)) {
        for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
          if (windMaterials.has(material)) continue;
          windMaterials.add(material);
          material.onBeforeCompile = shader => {
            shader.uniforms.uNatureWind = windUniform;
            shader.vertexShader = 'uniform float uNatureWind;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
              #ifdef USE_INSTANCING
              float phase=instanceMatrix[3].x*.19+instanceMatrix[3].z*.21;
              float bend=position.y*position.y;
              transformed.x+=sin(uNatureWind*.72+phase)*bend*.016;
              transformed.z+=sin(uNatureWind*.55+phase*.7)*bend*.011;
              #endif`);
          };
          material.customProgramCacheKey = () => 'nature-wind-v1';
        }
      }
    }
  }
  return { selectedModels: assets.models.size, placedInstances: [...batches.values()].reduce((sum, batch) => sum + batch.transforms.length, 0), batches: batches.size };
}
