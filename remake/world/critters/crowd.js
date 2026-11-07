// Crowds: any number of critters of a kind drawn in one draw call (one THREE.InstancedMesh a kind), each with its own place,
// heading, size, pose (morph weights) and wing beat. Each frame the caller places what lives near: begin(camera), place(...) for
// each critter, end(). A critter farther than `seen` metres from the camera is not drawn, so the cost is what is near.
// A baked model (world/critters/crowd-models.js) has two levels of detail: `reserve(kind, n, model)` draws a critter within
// `lods[0].until` metres of the camera from the fine level and one beyond it from the coarse one, one draw call a level.
// ready(): the meshes now, once every kind is reserved, so a warm-up drawn before the first frame builds their shaders (begin()
// makes them otherwise; main.js warms what a place has before the start button shows).
import * as THREE from 'three';
import { createModel } from './models.js';
import { birdMaterial } from './critters.js';

const DEG = Math.PI / 180;
const trianglesOf = geometry => (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;

/**
 * A baked model's levels as the crowd keeps a kind's model: the frames' names (the same in every level), pivot, triangles, and
 * its height standing at rest (three's bounding box would take in every frame).
 */
function bakedModel(kind, lods, pivot, height) {
  const namesOf = geometry => (geometry.morphAttributes.position ?? []).map(a => a.name);
  const morphs = namesOf(lods[0].geometry);
  for (const level of lods) {
    if (namesOf(level.geometry).join() !== morphs.join()) throw new Error(`[crowds] the levels of "${kind}" have different frames`);
  }
  const levels = lods.map(({ geometry, until = Infinity }) => ({ geometry, until, triangles: trianglesOf(geometry) }));
  const rest = new THREE.Box3().setFromBufferAttribute(lods[0].geometry.getAttribute('position'));
  height ??= rest.max.y - rest.min.y;
  return { geometry: lods[0].geometry, morphs, pivot, height, triangles: levels[0].triangles, wings: 0, levels };
}

// `inView`: a critter the camera's view cannot show, nor its shadow (SHADOW_REACH times its height past the view's edge), is not
// drawn either (the far pool's horn shot drew 19 behind and beside the camera).
const SHADOW_REACH = 3;
// The sun's shadow pass draws only the critters whose bounds touch its box (the shadow camera's frustum, where the sun stands this
// frame: main.js focuses it before the place's update), the rest of the drawn ones only in the main pass: each level keeps those that
// cast first in its instances, and its count is theirs while the shadow pass draws it. Every critter cast before, the 28 m box or not.
// A critter's bounds for this: its model's rest sphere, grown by CAST_GROW and CAST_MARGIN for its frames and wings.
const CAST_GROW = 1.25;
const CAST_MARGIN = 0.5; // m
// A critter's level changes LOD_HYSTERESIS past its distance (a critter that is its own pose object keeps its level), so one at the
// switch does not flicker between the two (engine/character-lod.js has the same 8 %).
const LOD_HYSTERESIS = 0.08;
export function createCrowds(world, { parent = world.scene, seen = 160, inView = false } = {}) {
  const group = new THREE.Group();
  group.name = 'Crowds';
  parent?.add?.(group);
  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  ground.name = 'crowds';
  const kinds = new Map(); // kind -> { model, material, capacity, levels: [{ mesh, until, triangles, n }], holder, flight, height }
  const meshes = [];
  const drawn = []; // the last frame's critters, pooled: { kind, position, height }
  let built = false;
  let placedCount = 0;
  let eye = null;
  const eyeAt = new THREE.Vector3();
  const view = new THREE.Frustum();
  const viewMatrix = new THREE.Matrix4();
  const bounds = new THREE.Sphere();
  let culling = false;
  // the sun's shadow box this frame, or null (no sun that casts: every critter casts, as before)
  const shadowView = new THREE.Frustum();
  const shadowEye = new THREE.OrthographicCamera();
  const shadowMatrix = new THREE.Matrix4();
  const lookAt = new THREE.Vector3();
  let shadowing = false;
  const levelOf = new WeakMap(); // a pose object -> the level it was drawn at last (hysteresis)

  // `seen`: how far this kind is drawn, if not as far as the crowd's own (a large animal on open land reads from farther)
  function reserve(kind, count, { model = null, material = null, lods = null, pivot = 0, height, seen: reach = null } = {}) {
    if (built) throw new Error(`[crowds] reserve "${kind}" before the first begin()`);
    const k = kinds.get(kind);
    if (k) { k.capacity += count; return; }
    kinds.set(kind, { model: model ?? (lods ? bakedModel(kind, lods, pivot, height) : createModel(kind)), material, capacity: count, reach });
  }

  function build() {
    built = true;
    for (const [kind, k] of kinds) {
      const { model } = k;
      if (model.wings) {
        k.flight = new THREE.InstancedBufferAttribute(new Float32Array(k.capacity * 2), 2);
        k.flight.setUsage(THREE.DynamicDrawUsage);
        model.geometry.setAttribute('aFlight', k.flight);
      }
      k.material ??= model.wings ? birdMaterial(kind) : ground;
      k.ownMaterial = k.material !== ground;
      if (model.morphs.length) k.holder = { morphTargetInfluences: new Float32Array(model.morphs.length) };
      const levels = model.levels ?? [{ geometry: model.geometry, until: Infinity, triangles: model.triangles }];
      k.levels = levels.map(({ geometry, until, triangles }, level) => {
        const mesh = new THREE.InstancedMesh(geometry, k.material, k.capacity);
        mesh.name = level ? `${kind} far` : kind;
        mesh.userData = { kind, level };
        mesh.frustumCulled = false; // critters move: `count` keeps the cost to what is near
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // makes the morph texture, one row a critter, sized by the mesh's count (the capacity now)
        if (k.holder) mesh.setMorphAt(0, k.holder);
        mesh.count = 0;
        const entry = { mesh, until, triangles, n: 0, casting: 0, still: 0 };
        // the shadow pass draws the first `casting` instances, the main pass all `n`
        mesh.onBeforeShadow = () => { mesh.count = entry.casting; };
        mesh.onAfterShadow = () => { mesh.count = entry.n; };
        meshes.push(mesh);
        group.add(mesh);
        return entry;
      });
      model.geometry.computeBoundingBox();
      k.height = model.height ?? model.geometry.boundingBox.max.y - model.geometry.boundingBox.min.y;
      model.geometry.computeBoundingSphere();
      const sphere = model.geometry.boundingSphere;
      // its middle straight above its foot (the heading turns the rest round it), its reach round that
      k.castCentre = new THREE.Vector3(0, sphere.center.y + (model.pivot ?? 0), 0);
      k.castRadius = (sphere.radius + Math.hypot(sphere.center.x, sphere.center.z)) * CAST_GROW;
    }
  }

  /** Make the meshes now (every kind reserved), not at the first begin(): a warm-up before the first frame draws them. */
  function ready() {
    if (!built) build();
  }

  function begin(camera) {
    if (!built) build();
    for (const k of kinds.values()) for (const level of k.levels) { level.n = 0; level.casting = 0; level.still = 0; }
    placedCount = 0;
    eye = camera ? camera.getWorldPosition(eyeAt) : null;
    culling = Boolean(inView && camera?.isCamera);
    if (culling) view.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    shadowing = shadowBox();
  }

  // The sun's shadow camera as three's shadow pass will set it (DirectionalLightShadow.updateMatrices): at the light, looking at
  // its target, with the box lighting.focus() gave it. False when there is no sun that casts.
  function shadowBox() {
    const sun = world.lighting?.sun;
    if (!sun?.castShadow || !sun.shadow?.camera?.isOrthographicCamera || world.renderer?.shadowMap?.enabled === false) return false;
    const box = sun.shadow.camera;
    shadowEye.position.setFromMatrixPosition(sun.matrixWorld);
    shadowEye.lookAt(lookAt.setFromMatrixPosition(sun.target.matrixWorld));
    shadowEye.updateMatrixWorld();
    shadowView.setFromProjectionMatrix(shadowMatrix.multiplyMatrices(box.projectionMatrix, shadowEye.matrixWorldInverse));
    return true;
  }

  const along = new THREE.Matrix4();
  const own = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const size = new THREE.Vector3();
  const squashBy = new THREE.Vector3();
  const warned = new Set();

  function place(kind, position, heading, scale, pose = {}) {
    const k = kinds.get(kind);
    if (!k) throw new Error(`[crowds] "${kind}" was not reserved`);
    const far = eye ? eye.distanceToSquared(position) : 0;
    const reach = k.reach ?? seen;
    if (far > reach * reach) return -1;
    if (culling) {
      const height = pose.height ?? k.height * scale;
      bounds.center.set(position.x, position.y + height / 2, position.z);
      bounds.radius = height * SHADOW_REACH + 1;
      if (!view.intersectsSphere(bounds)) return -1;
    }
    const l = levelFor(k, Math.sqrt(far), pose);
    const level = k.levels[l];
    if (level.n >= k.capacity) {
      if (!warned.has(kind)) { warned.add(kind); console.warn(`[crowds] more ${kind} placed than the ${k.capacity} reserved`); }
      return -1;
    }
    // those that cast from the front of the level's instances, the others from its back (end() closes the gap)
    let casts = true;
    if (shadowing) {
      bounds.center.copy(k.castCentre).multiplyScalar(scale).add(position);
      bounds.radius = k.castRadius * scale + CAST_MARGIN;
      casts = shadowView.intersectsSphere(bounds);
    }
    const i = casts ? level.casting++ : k.capacity - 1 - level.still++;
    level.n++;
    // T(position)·R(heading)·S(scale) · T(0, pivot, 0)·R_z(pitch)·S(squash)
    along.compose(position, turn.setFromAxisAngle(up, -heading * DEG), size.setScalar(scale));
    own.makeRotationZ(pose.pitch ?? 0).setPosition(0, k.model.pivot, 0);
    if (pose.squash) own.scale(squashBy.fromArray(pose.squash));
    level.mesh.setMatrixAt(i, along.multiply(own));
    if (k.holder) {
      const weights = k.holder.morphTargetInfluences;
      weights.fill(0);
      if (pose.morphs) for (const name in pose.morphs) {
        const m = k.model.morphs.indexOf(name);
        if (m >= 0) weights[m] = pose.morphs[name];
      }
      level.mesh.setMorphAt(i, k.holder);
    }
    if (k.flight) k.flight.setXY(i, pose.wings?.[0] ?? 0, pose.wings?.[1] ?? 0);
    const record = drawn[placedCount] ??= { kind: '', position: new THREE.Vector3(), height: 0 };
    record.kind = kind;
    record.position.copy(position);
    record.height = pose.height ?? k.height * scale;
    placedCount++;
    return i;
  }

  // The level a critter `d` metres away is drawn at: the first whose `until` it is within, but a critter that was drawn at a level
  // last frame (its pose object says who it is) keeps it until it is LOD_HYSTERESIS past the switch.
  function levelFor(k, d, pose) {
    const levels = k.levels;
    let l = 0;
    while (l < levels.length - 1 && d > levels[l].until) l++;
    if (levels.length < 2 || !pose || typeof pose !== 'object') return l;
    const was = levelOf.get(pose);
    if (was !== undefined && was !== l && was < levels.length) {
      if (was < l && d <= levels[was].until * (1 + LOD_HYSTERESIS)) l = was; // going away: the finer one a little longer
      else if (was > l && d > levels[l].until * (1 - LOD_HYSTERESIS)) l = was; // coming near: the coarser one a little longer
    }
    levelOf.set(pose, l);
    return l;
  }

  function end() {
    for (const k of kinds.values()) {
      for (const level of k.levels) {
        const { mesh, n, casting, still } = level;
        // close the gap: those that only show (written from the back) come right after those that cast
        if (still && casting + still < k.capacity) {
          const from = k.capacity - still;
          mesh.instanceMatrix.array.copyWithin(casting * 16, from * 16, k.capacity * 16);
          if (mesh.morphTexture) {
            const rows = mesh.morphTexture.source.data.data;
            const len = rows.length / k.capacity;
            rows.copyWithin(casting * len, from * len, k.capacity * len);
          }
          if (k.flight) k.flight.array.copyWithin(casting * 2, from * 2, k.capacity * 2);
        }
        mesh.count = n;
        mesh.castShadow = casting > 0;
        if (!n) continue;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.morphTexture) mesh.morphTexture.needsUpdate = true;
        if (k.flight) k.flight.needsUpdate = true;
      }
    }
  }

  const placed = () => drawn.slice(0, placedCount);
  const triangles = () => {
    let t = 0;
    for (const k of kinds.values()) for (const level of k.levels ?? []) t += level.mesh.count * level.triangles;
    return t;
  };
  const calls = () => meshes.filter(m => m.count > 0).length;

  function dispose() {
    group.removeFromParent();
    for (const k of kinds.values()) {
      for (const { mesh } of k.levels ?? []) {
        mesh.morphTexture?.dispose();
        mesh.dispose();
        mesh.geometry.dispose();
      }
      if (!k.levels) k.model.geometry.dispose();
      if (k.ownMaterial) k.material.dispose();
    }
    ground.dispose();
  }

  return { reserve, ready, begin, place, end, placed, triangles, calls, group, meshes, dispose };
}
