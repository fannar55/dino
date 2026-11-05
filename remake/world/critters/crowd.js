// Crowds: any number of critters of a kind drawn in one draw call (one THREE.InstancedMesh a kind), each with its own place,
// heading, size, pose (morph weights) and wing beat. Each frame the caller places what lives near: begin(camera), place(...) for
// each critter, end(). A critter farther than `seen` metres from the camera is not drawn, so the cost is what is near.
import * as THREE from 'three';
import { createModel } from './models.js';
import { birdMaterial } from './critters.js';

const DEG = Math.PI / 180;

export function createCrowds(world, { parent = world.scene, seen = 160 } = {}) {
  const group = new THREE.Group();
  group.name = 'Crowds';
  parent?.add?.(group);
  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  ground.name = 'crowds';
  const kinds = new Map(); // kind -> { model, material, capacity, mesh, holder, flight, height, n }
  const meshes = [];
  const drawn = []; // the last frame's critters, pooled: { kind, position, height }
  let built = false;
  let placedCount = 0;
  let eye = null;
  const eyeAt = new THREE.Vector3();

  function reserve(kind, count, { model = null, material = null } = {}) {
    if (built) throw new Error(`[crowds] reserve "${kind}" before the first begin()`);
    const k = kinds.get(kind);
    if (k) { k.capacity += count; return; }
    kinds.set(kind, { model: model ?? createModel(kind), material, capacity: count });
  }

  function build() {
    built = true;
    for (const [kind, k] of kinds) {
      const { model } = k;
      const geometry = model.geometry;
      if (model.wings) {
        k.flight = new THREE.InstancedBufferAttribute(new Float32Array(k.capacity * 2), 2);
        k.flight.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('aFlight', k.flight);
      }
      k.material ??= model.wings ? birdMaterial(kind) : ground;
      k.ownMaterial = k.material !== ground;
      const mesh = new THREE.InstancedMesh(geometry, k.material, k.capacity);
      mesh.name = kind;
      mesh.frustumCulled = false; // critters move: `count` keeps the cost to what is near
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (model.morphs.length) {
        k.holder = { morphTargetInfluences: new Float32Array(model.morphs.length) };
        mesh.setMorphAt(0, k.holder); // makes the morph texture, one row a critter, sized by the mesh's count (the capacity now)
      }
      geometry.computeBoundingBox();
      k.height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
      mesh.count = 0;
      k.mesh = mesh;
      k.n = 0;
      meshes.push(mesh);
      group.add(mesh);
    }
  }

  function begin(camera) {
    if (!built) build();
    for (const k of kinds.values()) k.n = 0;
    placedCount = 0;
    eye = camera ? camera.getWorldPosition(eyeAt) : null;
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
    if (eye && eye.distanceToSquared(position) > seen * seen) return -1;
    if (k.n >= k.capacity) {
      if (!warned.has(kind)) { warned.add(kind); console.warn(`[crowds] more ${kind} placed than the ${k.capacity} reserved`); }
      return -1;
    }
    const i = k.n++;
    // T(position)·R(heading)·S(scale) · T(0, pivot, 0)·R_z(pitch)·S(squash)
    along.compose(position, turn.setFromAxisAngle(up, -heading * DEG), size.setScalar(scale));
    own.makeRotationZ(pose.pitch ?? 0).setPosition(0, k.model.pivot, 0);
    if (pose.squash) own.scale(squashBy.fromArray(pose.squash));
    k.mesh.setMatrixAt(i, along.multiply(own));
    if (k.holder) {
      const weights = k.holder.morphTargetInfluences;
      weights.fill(0);
      if (pose.morphs) for (const name in pose.morphs) {
        const m = k.model.morphs.indexOf(name);
        if (m >= 0) weights[m] = pose.morphs[name];
      }
      k.mesh.setMorphAt(i, k.holder);
    }
    if (k.flight) k.flight.setXY(i, pose.wings?.[0] ?? 0, pose.wings?.[1] ?? 0);
    const record = drawn[placedCount] ??= { kind: '', position: new THREE.Vector3(), height: 0 };
    record.kind = kind;
    record.position.copy(position);
    record.height = pose.height ?? k.height * scale;
    placedCount++;
    return i;
  }

  function end() {
    for (const k of kinds.values()) {
      k.mesh.count = k.n;
      if (!k.n) continue;
      k.mesh.instanceMatrix.needsUpdate = true;
      if (k.mesh.morphTexture) k.mesh.morphTexture.needsUpdate = true;
      if (k.flight) k.flight.needsUpdate = true;
    }
  }

  const placed = () => drawn.slice(0, placedCount);
  const triangles = () => { let t = 0; for (const k of kinds.values()) t += (k.mesh?.count ?? 0) * k.model.triangles; return t; };
  const calls = () => meshes.filter(m => m.count > 0).length;

  function dispose() {
    group.removeFromParent();
    for (const k of kinds.values()) {
      k.mesh?.morphTexture?.dispose();
      k.mesh?.dispose();
      k.model.geometry.dispose();
      if (k.ownMaterial) k.material.dispose();
    }
    ground.dispose();
  }

  return { reserve, begin, place, end, placed, triangles, calls, group, meshes, dispose };
}
