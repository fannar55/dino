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
//   lod.add(actor, { tint, levels })           tint(material, hook, key) -> her own material; levels: LEVEL_PX's like
// The pieces (pieces.js) use it too, with lower switch sizes (PIECE_PX): a piece close up keeps its painted face.
//   lod.update(camera, heightPx)
//   lod.ready()                                resolves when every level is in place
//   lod.info()                                 { name: level } for the lab

const COARSE = [3200, 1400];
const LEVEL_PX = [2200, 1100, 520, 170]; // the bind diagonal's pixels: the full skin above the first, then one level below each
export const PIECE_PX = [1400, 700, 240, 90]; // a piece's: textured down to about 240 px, then the light levels
const levelCache = new WeakMap();
const sunHooks = new WeakMap();

function attachSunCasters(sun, casters) {
  if (!sun?.castShadow) return () => {};
  let hook = sunHooks.get(sun);
  if (!hook) {
    const before = sun.shadow.updateMatrices;
    const sets = new Set();
    const wrapped = function thorsedlaShadowPass(l, viewport) {
      before.call(this, l, viewport);
      if (l === sun) {
        for (const set of sets) for (const c of set) c.visible = c.userData.owner.visible;
      }
    };
    sun.shadow.updateMatrices = wrapped;
    hook = { before, wrapped, sets };
    sunHooks.set(sun, hook);
  }
  hook.sets.add(casters);
  return () => {
    hook.sets.delete(casters);
    if (hook.sets.size === 0) {
      if (sun.shadow.updateMatrices === hook.wrapped) sun.shadow.updateMatrices = hook.before;
      sunHooks.delete(sun);
    }
  };
}

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

/** Read sRGB pixels from a GPU-compressed texture (KTX2) via a one-shot 256x256 render target readback. */
function readCompressedPixels(renderer, map, size) {
  if (!renderer?.render || !renderer?.readRenderTargetPixels) return null;
  const rt = new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'uniform sampler2D uMap;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec3 c = texture2D(uMap, vUv).rgb;',
      '  vec3 srgb = mix(c * 12.92, pow(max(c, 0.0), vec3(1.0 / 2.4)) * 1.055 - 0.055, step(vec3(0.0031308), c));',
      '  gl_FragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);',
      '}',
    ].join('\n'),
    depthTest: false,
    depthWrite: false,
  });
  quadScene.add(new THREE.Mesh(quadGeo, quadMat));
  const prevTarget = renderer.getRenderTarget();
  const pixels = new Uint8Array(size * size * 4);
  try {
    renderer.setRenderTarget(rt);
    renderer.render(quadScene, quadCam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
  } catch {
    return null;
  } finally {
    renderer.setRenderTarget(prevTarget);
    quadGeo.dispose();
    quadMat.dispose();
    rt.dispose();
  }
  return pixels;
}

/** The colour map's colour under each vertex (linear), read from a small copy of its image; null without a readable map. */
function colourFromMap(g, map, renderer) {
  if (!map || typeof document === 'undefined') return null;
  const size = 256;
  let pixels = null;
  let fromRenderTarget = false;
  if (map.isCompressedTexture) {
    pixels = readCompressedPixels(renderer, map, size);
    fromRenderTarget = true; // readRenderTargetPixels row 0 is PlaneGeometry uv.y=0, matching GPU texture2D(map, uv) directly
  } else if (map.image) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    try { c.drawImage(map.image, 0, 0, size, size); } catch { return null; }
    pixels = c.getImageData(0, 0, size, size).data;
  }
  if (!pixels) return null;
  const uv = g.attributes.uv, out = new Float32Array(uv.count * 3), colour = new THREE.Color();
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    let v = uv.getY(i);
    if (!fromRenderTarget && map.flipY) v = 1 - v;
    const x = Math.min(size - 1, Math.max(0, Math.floor(u * size))), y = Math.min(size - 1, Math.max(0, Math.floor(v * size)));
    const k = (y * size + x) * 4;
    colour.setRGB(pixels[k] / 255, pixels[k + 1] / 255, pixels[k + 2] / 255, THREE.SRGBColorSpace);
    out.set([colour.r, colour.g, colour.b], i * 3);
  }
  return new THREE.BufferAttribute(out, 3);
}

function levelsOf(geometry, map, renderer) {
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
  const colours = colourFromMap(welded.g, map, renderer);
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

export function createThorsedlaLod(sun, renderer = null) {
  const entries = [];
  const casters = new Set();
  const casterMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  casterMaterial.shadowSide = THREE.FrontSide;
  const coarseBase = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
  const detachSun = attachSunCasters(sun, casters);
  const pending = [];
  let disposed = false;

  function setLevel(e, level) {
    if (disposed || !e.levels || level === e.level) return;
    e.level = level;
    e.mesh.geometry = e.levels[level];
    e.mesh.material = level >= 3 && e.coarse ? e.coarse : e.material;
  }

  const camPos = new THREE.Vector3(), centre = new THREE.Vector3(), frustum = new THREE.Frustum(), vp = new THREE.Matrix4(), sphere = new THREE.Sphere();
  return {
    add(actor, { tint = m => m, levels: px = LEVEL_PX } = {}) {
      if (disposed) return Promise.resolve();
      const mesh = skinOf(actor.model);
      const e = { actor, mesh, baseGeometry: mesh.geometry, material: mesh.material, coarse: null, levels: null, level: 0, px, diagonal: actor.size.length() };
      entries.push(e);
      const ready = levelsOf(mesh.geometry, mesh.material.map, renderer).then(levels => {
        if (disposed) return;
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
      if (disposed) return;
      camera.updateMatrixWorld();
      camPos.setFromMatrixPosition(camera.matrixWorld);
      frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const pxPerUnit = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      for (const e of entries) {
        if (!e.levels) continue;
        e.actor.centre(centre);
        const k = e.actor.root.scale.x;
        const inView = frustum.intersectsSphere(sphere.set(centre, (e.diagonal / 2) * k * 1.4));
        const px = inView ? (e.diagonal * k * pxPerUnit) / Math.max(0.1, camPos.distanceTo(centre)) : 0;
        let level = 0;
        while (level < e.px.length && px < e.px[level]) level++;
        setLevel(e, level);
      }
    },
    ready: () => Promise.all(pending),
    info: () => Object.fromEntries(entries.map(e => [e.actor.name, e.level])),
    dispose() {
      if (disposed) return;
      disposed = true;
      detachSun();
      for (const c of casters) c.removeFromParent();
      casters.clear();
      const coarseDisposed = new Set();
      for (const e of entries) {
        e.mesh.geometry = e.levels?.[0] ?? e.baseGeometry;
        e.mesh.material = e.material;
        if (e.coarse && e.coarse !== coarseBase && !coarseDisposed.has(e.coarse)) {
          coarseDisposed.add(e.coarse);
          e.coarse.dispose();
        }
      }
      entries.length = 0;
      casterMaterial.dispose();
      coarseBase.dispose();
    },
  };
}
