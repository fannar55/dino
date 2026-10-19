import * as THREE from 'three';
import { simplify } from '../simplify.js';

// Lighter levels for the board's Þórseðlas (after the valley prototype's, which they replace). Six of them stand in every view
// of the board, at 300 to 900 px, so character-lod.js's half and quarter (19,600 and 9,800 triangles, a quarter casting the sun's
// shadow) would cost the whole budget alone. Here, as there, the skin gets the half and the quarter over its own vertices, and two
// light levels over a copy of the skin with its seams welded (3,200 and 1,400 triangles), which can go much further down: a welded
// vertex cannot keep both sides' texture coordinates, so the light levels carry the texture's colour in their vertices instead,
// and draw with a material of their own without the map. The lightest casts the shadow.
//
//   const lod = createThorsedlaLod(light)      light: the scene's sun
//   lod.add(actor, { tint })                   tint(material, hook, key) -> the Þórseðla's own material
//   lod.update(camera, heightPx)
//   lod.ready()                                resolves when every level is in place
//   lod.info()                                 { name: level } for the lab

const COARSE = [3200, 1400];
const LEVEL_PX = [2200, 1100, 520, 170]; // the bind diagonal's pixels: the full skin above the first, then one level below each
const DIAGONAL = 24.1; // the model's bind diagonal (m)
const levelCache = new Map();

function simplifyInWorker(positions, index, options) {
  if (typeof Worker === 'undefined') return Promise.resolve(simplify(positions, index, options));
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('../simplify-worker.js', import.meta.url), { type: 'module' });
    } catch {
      resolve(simplify(positions, index, options));
      return;
    }
    worker.onmessage = ({ data }) => { worker.terminate(); data.error ? reject(new Error(data.error)) : resolve(data.levels); };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message || 'simplify worker failed')); };
    worker.postMessage({ id: 1, positions, index, options }, [positions.buffer]);
  });
}

function skinArrays(geometry, count = geometry.attributes.position.count, pick = i => i) {
  const { skinIndex, skinWeight } = geometry.attributes;
  const indices = new Int32Array(count * 4), weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) for (let c = 0; c < 4; c++) { indices[i * 4 + c] = skinIndex.getComponent(pick(i), c); weights[i * 4 + c] = skinWeight.getComponent(pick(i), c); }
  return { indices, weights };
}

/** The skin with its seams welded: one vertex for each place. */
function weldedSkin(geometry) {
  const position = geometry.attributes.position;
  const keyOf = i => `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
  const firstOf = new Map(), map = new Uint32Array(position.count), originals = [];
  for (let i = 0; i < position.count; i++) {
    const key = keyOf(i);
    if (!firstOf.has(key)) { firstOf.set(key, originals.length); originals.push(i); }
    map[i] = firstOf.get(key);
  }
  const g = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize;
    const source = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
    const out = new source.constructor(originals.length * size);
    const raw = attribute.isInterleavedBufferAttribute
      ? (o, c) => attribute.data.array[o * attribute.data.stride + attribute.offset + c]
      : (o, c) => attribute.array[o * size + c];
    originals.forEach((o, i) => { for (let c = 0; c < size; c++) out[i * size + c] = raw(o, c); });
    g.setAttribute(name, new THREE.BufferAttribute(out, size, attribute.normalized));
  }
  return { g, index: Uint32Array.from(geometry.index.array, i => map[i]), originals };
}

/** The colour map's colour under each vertex (linear), read from a small copy of its image; null without a readable map. */
function colourFromMap(g, map) {
  const image = map?.image;
  if (!image || typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  try { c.drawImage(image, 0, 0, size, size); } catch { return null; }
  const pixels = c.getImageData(0, 0, size, size).data;
  const uv = g.attributes.uv, out = new Float32Array(uv.count * 3), colour = new THREE.Color();
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    let v = uv.getY(i);
    if (map.flipY) v = 1 - v;
    const x = Math.min(size - 1, Math.max(0, Math.floor(u * size))), y = Math.min(size - 1, Math.max(0, Math.floor(v * size)));
    const k = (y * size + x) * 4;
    colour.setRGB(pixels[k] / 255, pixels[k + 1] / 255, pixels[k + 2] / 255, THREE.SRGBColorSpace);
    out.set([colour.r, colour.g, colour.b], i * 3);
  }
  return new THREE.BufferAttribute(out, 3);
}

function levelsOf(geometry, map) {
  if (levelCache.has(geometry)) return levelCache.get(geometry);
  const position = geometry.attributes.position;
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) { positions[i * 3] = position.getX(i); positions[i * 3 + 1] = position.getY(i); positions[i * 3 + 2] = position.getZ(i); }
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const diagonal = geometry.boundingBox.getSize(new THREE.Vector3()).length();
  const triangles = geometry.index.count / 3;
  const indexed = (from, corners, count) => {
    const g = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(from.attributes)) g.setAttribute(name, attribute);
    g.setIndex(new THREE.BufferAttribute(count < 65536 ? Uint16Array.from(corners) : corners, 1));
    g.boundingBox = geometry.boundingBox;
    g.boundingSphere = geometry.boundingSphere;
    return g;
  };
  const fine = simplifyInWorker(positions, Uint32Array.from(geometry.index.array), {
    levels: [{ ratio: 0.5, maxError: 0.001 * diagonal }, { ratio: 0.25, maxError: 0.0025 * diagonal }],
    skin: skinArrays(geometry),
  }).then(levels => levels.map(({ corners }) => indexed(geometry, corners, position.count)));
  const welded = weldedSkin(geometry);
  const colours = colourFromMap(welded.g, map);
  if (colours) welded.g.setAttribute('color', colours);
  const wp = welded.g.attributes.position;
  const coarse = simplifyInWorker(Float32Array.from(wp.array), welded.index, {
    levels: COARSE.map(t => ({ ratio: t / triangles, maxError: Infinity })),
    skin: skinArrays(geometry, welded.originals.length, i => welded.originals[i]),
  }).then(levels => levels.map(({ corners }) => indexed(welded.g, corners, wp.count)));
  const promise = Promise.all([fine, coarse]).then(([a, b]) => [geometry, ...a, ...b]);
  levelCache.set(geometry, promise);
  return promise;
}

const skinOf = model => { let mesh = null; model.traverse(o => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; }); return mesh; };

export function createThorsedlaLod(sun) {
  const entries = [];
  const casters = new Set();
  const casterMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  casterMaterial.shadowSide = THREE.FrontSide;
  const coarseBase = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
  if (sun?.castShadow) {
    const before = sun.shadow.updateMatrices;
    sun.shadow.updateMatrices = function thorsedlaShadowPass(l, viewport) {
      before.call(this, l, viewport);
      if (l === sun) for (const c of casters) c.visible = c.userData.owner.visible;
    };
  }
  const pending = [];

  function setLevel(e, level) {
    if (!e.levels || level === e.level) return;
    e.level = level;
    e.mesh.geometry = e.levels[level];
    e.mesh.material = level >= 3 && e.coarse ? e.coarse : e.material;
  }

  const camPos = new THREE.Vector3(), centre = new THREE.Vector3(), frustum = new THREE.Frustum(), vp = new THREE.Matrix4(), sphere = new THREE.Sphere();
  return {
    add(actor, { tint = m => m } = {}) {
      const mesh = skinOf(actor.model);
      const e = { actor, mesh, material: mesh.material, coarse: null, levels: null, level: 0 };
      entries.push(e);
      const ready = levelsOf(mesh.geometry, mesh.material.map).then(levels => {
        if (levels[levels.length - 1].attributes.color) e.coarse = tint(coarseBase, '#include <color_fragment>', 'thorsedla-tint-coarse');
        e.levels = levels;
        if (sun?.castShadow) {
          const caster = new THREE.SkinnedMesh(levels[levels.length - 1], casterMaterial);
          caster.name = `${actor.name} shadow`;
          caster.bindMode = mesh.bindMode;
          caster.bind(mesh.skeleton, mesh.bindMatrix);
          caster.castShadow = true;
          caster.receiveShadow = false;
          caster.frustumCulled = false;
          caster.visible = false;
          caster.userData.owner = actor.root;
          caster.onAfterShadow = () => { caster.visible = false; };
          mesh.add(caster);
          casters.add(caster);
          mesh.castShadow = false;
        }
        setLevel(e, levels.length - 1);
      }).catch(error => console.warn('[thorsedla-lod] a Þórseðla keeps her full skin:', error.message));
      pending.push(ready);
      return ready;
    },
    update(camera, height) {
      camera.updateMatrixWorld();
      camPos.setFromMatrixPosition(camera.matrixWorld);
      frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const pxPerUnit = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      for (const e of entries) {
        if (!e.levels) continue;
        e.actor.centre(centre);
        const k = e.actor.root.scale.x;
        const inView = frustum.intersectsSphere(sphere.set(centre, (DIAGONAL / 2) * k * 1.4));
        const px = inView ? (DIAGONAL * k * pxPerUnit) / Math.max(0.1, camPos.distanceTo(centre)) : 0;
        let level = 0;
        while (level < LEVEL_PX.length && px < LEVEL_PX[level]) level++;
        setLevel(e, level);
      }
    },
    ready: () => Promise.all(pending),
    info: () => Object.fromEntries(entries.map(e => [e.actor.name, e.level])),
  };
}
