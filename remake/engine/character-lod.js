import * as THREE from 'three';
import { simplify } from './simplify.js';
import { FEATHER } from './eyelids.js';

// Characters at lower detail: distance LODs and low-poly shadow casters.
//
// At real sizes the wide shots hold three big characters far from the camera: in the wide lineup
// Grameðla (39k triangles) and Mosi (24k) are about 450 and 380 px across and Egill (20k) about
// 80 px, and their sun shadows drew all of it again. That frame was 349k triangles; the shot budget
// is 250k, shadow pass included (STYLE.md section 11).
//
// Every skinned mesh of 4000 triangles or more gets two simpler index buffers over its own vertex
// buffers (engine/simplify.js with its seams kept, so UVs, normals and skin weights stay exact):
// half the triangles, within 0.1 % of its size, and a quarter, within 0.25 %. updateCharacterLods()
// picks one by the size on screen (the bind-pose bounding box's diagonal): the half below 700 px,
// the quarter below 200 px, which keeps the difference at about a pixel or less (on average a tenth
// of one); a character out of view (by its bind-pose sphere, half as big again for the poses) draws
// the quarter. The quarter also casts the sun shadow, bound to the same skeleton (within 2 to 3 cm
// on Grameðla, under a shadow texel), and only takes part in the shadow pass; the full skin still
// receives shadows.
//
// The skin under each eyelid keeps every triangle at every level: the lid shells are cut from the full
// skin there (eyelids.js), so a shut lid sits on the same skin whatever level draws.
//
// The simplification runs once per model in a worker; until it is done the full mesh draws and
// casts. whenReady() resolves once every mesh asked for so far has its levels (captures wait).
// The LOD geometries share the source geometry's attributes: dispose only the source.

const LEVELS = [
  { ratio: 0.5, maxError: 0.001, below: 700 }, // fraction kept, error (of the diagonal), used below this many px
  { ratio: 0.25, maxError: 0.0025, below: 200 },
];
const HYSTERESIS = 0.08; // a level changes 8 % past its threshold, so it does not flicker
const MIN_TRIANGLES = 4000;
const REACH = 1.5; // animated poses reach past the bind-pose bounding sphere

let worker; // undefined until first asked for, null where module workers are not available
let nextJob = 1;
const jobs = new Map();
const pending = new Set();

function startWorker() {
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./simplify-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
      const job = jobs.get(data.id);
      jobs.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.levels);
    };
    w.onerror = event => {
      for (const job of jobs.values()) job.reject(new Error(event.message || 'simplify worker failed'));
      jobs.clear();
    };
    return w;
  } catch {
    return null;
  }
}

function simplifyAsync(positions, index, options) {
  if (worker === undefined) worker = startWorker();
  if (!worker) return Promise.resolve().then(() => simplify(positions, index, options)); // on this thread
  const id = nextJob++;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    worker.postMessage({ id, positions, index, options }, [positions.buffer]);
  });
}

/**
 * The vertices of the skin triangles each eyelid shell is cut from: the same box round the eye as
 * buildLidGeometry in eyelids.js (its outline grown by the feather, and as deep), or null without eyes.
 */
function eyelidVertices(geometry, eyes) {
  if (!eyes?.length) return null;
  const position = geometry.attributes.position;
  const index = geometry.index.array;
  const keep = new Uint8Array(position.count);
  const p = new THREE.Vector3();
  for (const eye of eyes) {
    const centre = new THREE.Vector3().fromArray(eye.centre);
    const right = new THREE.Vector3().fromArray(eye.right);
    const down = new THREE.Vector3().fromArray(eye.down);
    const facing = new THREE.Vector3().fromArray(eye.normal);
    const grow = 1.1 * (1 + FEATHER);
    const reachU = grow * eye.halfWidth, reachTop = grow * eye.top, reachBottom = grow * eye.bottom;
    const depth = 0.8 * grow * Math.max(eye.halfWidth, eye.top, eye.bottom);
    for (let t = 0; t < index.length; t += 3) {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, w0 = Infinity, w1 = -Infinity;
      for (let j = 0; j < 3; j++) {
        p.fromBufferAttribute(position, index[t + j]).sub(centre);
        const u = p.dot(right), v = p.dot(down), w = p.dot(facing);
        u0 = Math.min(u0, u); u1 = Math.max(u1, u);
        v0 = Math.min(v0, v); v1 = Math.max(v1, v);
        w0 = Math.min(w0, w); w1 = Math.max(w1, w);
      }
      if (u1 < -reachU || u0 > reachU || v1 < -reachTop || v0 > reachBottom || w1 < -depth || w0 > depth) continue;
      keep[index[t]] = 1; keep[index[t + 1]] = 1; keep[index[t + 2]] = 1;
    }
  }
  return keep;
}

// one set of levels per source geometry (actors of the same model share their geometry)
const levelsOf = new WeakMap();

/** [full, half, quarter] geometries for a skinned geometry; the simpler ones share its attributes. */
function lodGeometries(geometry, eyes) {
  if (levelsOf.has(geometry)) return levelsOf.get(geometry);
  const position = geometry.attributes.position;
  const skinIndex = geometry.attributes.skinIndex, skinWeight = geometry.attributes.skinWeight;
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i); positions[i * 3 + 1] = position.getY(i); positions[i * 3 + 2] = position.getZ(i);
  }
  const indices = new Int32Array(position.count * 4), weights = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i++) for (let k = 0; k < 4; k++) {
    indices[i * 4 + k] = skinIndex.getComponent(i, k);
    weights[i * 4 + k] = skinWeight.getComponent(i, k);
  }
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const diagonal = geometry.boundingBox.getSize(new THREE.Vector3()).length();
  const options = { levels: LEVELS.map(l => ({ ratio: l.ratio, maxError: l.maxError * diagonal })), skin: { indices, weights }, keep: eyelidVertices(geometry, eyes) };
  const promise = simplifyAsync(positions, Uint32Array.from(geometry.index.array), options).then(levels => [
    geometry,
    ...levels.map(({ corners, triangles, error }) => {
      const g = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) g.setAttribute(name, attribute);
      g.setIndex(new THREE.BufferAttribute(position.count < 65536 ? Uint16Array.from(corners) : corners, 1));
      g.boundingBox = geometry.boundingBox;
      g.boundingSphere = geometry.boundingSphere;
      g.userData.lod = { triangles, sourceTriangles: geometry.index.count / 3, error };
      return g;
    }),
  ]);
  levelsOf.set(geometry, promise);
  return promise;
}

// The shadow casters only take part in the sun's shadow pass. three builds the main render list
// before it draws the shadow map, so a caster stays hidden while the list is built, is shown when
// the sun's shadow pass starts (the light's updateMatrices runs then) and hides itself right after
// it was drawn (the forest's casters work the same way, world/forest/forest.js).
const castersOf = new WeakMap(); // light -> Set of casters
const casterMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
casterMaterial.shadowSide = THREE.FrontSide; // as the characters' own skins (actor.js)

const shown = object => { for (let o = object.parent; o; o = o.parent) if (!o.visible) return false; return true; };
function shadowOnly(light, object) {
  let set = castersOf.get(light);
  if (!set) {
    set = new Set();
    castersOf.set(light, set);
    const shadow = light.shadow;
    const before = shadow.updateMatrices;
    shadow.updateMatrices = function characterShadowPass(l, viewport) {
      before.call(this, l, viewport);
      if (l === light) for (const o of set) o.visible = shown(o);
    };
  }
  object.visible = false;
  object.onAfterShadow = () => { object.visible = false; };
  set.add(object);
  return set;
}

const entries = new Set(); // meshes with levels: { mesh, geometries, centre, diagonal, level, caster }

/**
 * Give the large skinned meshes under `model` their levels and a shadow caster for `light`. Returns
 * a promise that settles when they are in place.
 */
export function prepareCharacter(model, light) {
  const meshes = [];
  model.traverse(o => {
    if (o.isSkinnedMesh && !o.geometry.groups.length && (o.geometry.index?.count ?? 0) / 3 >= MIN_TRIANGLES) meshes.push(o);
  });
  const done = Promise.all(meshes.map(mesh => lodGeometries(mesh.geometry, mesh.userData.face?.eyes).then(geometries => {
    const quarter = geometries[geometries.length - 1];
    const entry = {
      mesh, geometries, level: 0, caster: null, casters: null,
      centre: mesh.geometry.boundingSphere.center.clone(),
      radius: mesh.geometry.boundingSphere.radius,
      diagonal: mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length(),
    };
    entries.add(entry);
    if (light?.castShadow && mesh.castShadow) {
      const caster = new THREE.SkinnedMesh(quarter, casterMaterial);
      caster.name = `${mesh.name} shadow`;
      caster.bindMode = mesh.bindMode;
      caster.bind(mesh.skeleton, mesh.bindMatrix);
      caster.castShadow = true;
      caster.receiveShadow = false;
      caster.frustumCulled = false;
      mesh.add(caster); // same world matrix as the skin, so the same skinning
      entry.caster = caster;
      entry.casters = shadowOnly(light, caster);
      mesh.castShadow = false;
    }
  }).catch(error => {
    console.warn(`[character-lod] ${mesh.name}: keeps its full mesh (${error.message})`);
  })));
  pending.add(done);
  done.finally(() => pending.delete(done));
  return done;
}

const camPos = new THREE.Vector3(), centre = new THREE.Vector3();
const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), sphere = new THREE.Sphere();
/** Pick each character mesh's level by its size on screen (`height`: the view's height in px). */
export function updateCharacterLods(camera, height) {
  if (!entries.size) return;
  camera.updateMatrixWorld();
  camPos.setFromMatrixPosition(camera.matrixWorld);
  frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const pxPerUnit = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  for (const e of entries) {
    const { mesh } = e;
    centre.copy(e.centre).applyMatrix4(mesh.matrixWorld);
    const scale = mesh.matrixWorld.getMaxScaleOnAxis();
    const inView = frustum.intersectsSphere(sphere.set(centre, e.radius * scale * REACH));
    const px = inView ? (e.diagonal * scale * pxPerUnit) / Math.max(0.1, camPos.distanceTo(centre)) : 0;
    let level = e.level;
    while (level < LEVELS.length && px < LEVELS[level].below * (1 - HYSTERESIS)) level++;
    while (level > 0 && px > LEVELS[level - 1].below * (1 + HYSTERESIS)) level--;
    if (level !== e.level) { e.level = level; mesh.geometry = e.geometries[level]; }
  }
}

/** Forget the meshes under `model` (its actor is gone). */
export function releaseCharacter(model) {
  for (const e of entries) {
    let o = e.mesh;
    while (o && o !== model) o = o.parent;
    if (o !== model) continue;
    entries.delete(e);
    e.casters?.delete(e.caster);
  }
}

/** Resolves when every character asked for so far has its levels. */
export function whenReady() {
  return Promise.all([...pending]);
}
