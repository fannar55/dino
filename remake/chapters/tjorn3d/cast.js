// The pond's small players (chapters/tjorn3d.js): the fish, the frog and the butterfly. No new art: the Fen's fish
// (world/critters/models.js, as chapter 2's fishing draws it), the owner's frog (assets/critters/froskur.glb, the crowd's bake) and
// the hero butterfly's model (assets/critters/butterfly.glb), each drawn as large as a table needs (a 30 cm fish would be half a
// millimetre). Every one is a plain mesh of its own, so the page can read where each of its vertices is.
import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { createModel } from '../../world/critters/models.js';
import { crowdModelFrom } from '../../world/critters/crowd-models.js';
import { FROG_MODEL } from '../../world/critters/critters.js';
import { murky } from './murk.js';

const BUTTERFLY_MODEL = new URL('../../assets/critters/butterfly.glb', import.meta.url).href;
const FISH_LENGTH = 0.3; // the Fen's fish, metres
const FISH_MIDDLE = 0.044; // its middle over its origin, metres at its own size
const BUTTERFLY = { span: 0.36, feet: 0.0756 }; // metres, as the model's own notes say (its Body's extras, once it is here)
const rad = d => (d * Math.PI) / 180;

let loader = null;
const load = (world, url) => (world.loadModel ? world.loadModel(url) : (loader ??= new GLTFLoader()).loadAsync(url));

export function createCast(world, { fish: fishCount = 6 } = {}) {
  const group = new THREE.Group();
  group.name = 'Tjörn cast';
  world.scene.add(group);

  // ---- the fish: one geometry, one material (chapter 2's), a mesh each ----
  const fishModel = createModel('fish');
  const fishMaterial = murky(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }));
  fishMaterial.name = 'tjorn fish';
  const makeFish = name => {
    const mesh = new THREE.Mesh(fishModel.geometry, fishMaterial);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.updateMorphTargets();
    const holder = new THREE.Group();
    holder.name = name;
    holder.add(mesh);
    holder.visible = false;
    group.add(holder);
    const flex = mesh.morphTargetDictionary?.flex;
    return {
      group: holder, mesh,
      /** Its middle at `point` (world), nose along `heading` (degrees) tipped `pitch` degrees up, `length` metres long, its tail at `beat` (turns). */
      show(point, heading, length, { pitch = 0, beat = 0 } = {}) {
        holder.visible = true;
        const k = length / FISH_LENGTH;
        holder.scale.setScalar(k);
        holder.position.set(point.x, point.y - FISH_MIDDLE * k, point.z);
        holder.rotation.set(0, -rad(heading), rad(pitch), 'YXZ');
        if (flex !== undefined) mesh.morphTargetInfluences[flex] = 0.5 + 0.5 * Math.sin(2 * Math.PI * beat);
      },
      hide() { holder.visible = false; },
    };
  };
  const fish = Array.from({ length: fishCount }, (_, i) => makeFish(`Tjörn fish ${i + 1}`));
  const jumper = makeFish('Tjörn jumping fish');

  // ---- the frog: the owner's, as the crowds bake it (its rest pose: sitting) ----
  const frog = { group: new THREE.Group(), mesh: null, length: 0.1, loaded: false };
  frog.group.name = 'Tjörn frog';
  frog.group.visible = false;
  group.add(frog.group);
  const frogReady = load(world, FROG_MODEL).then(gltf => {
    const baked = crowdModelFrom(gltf);
    const geometry = baked.lods[0].geometry;
    geometry.computeBoundingBox();
    const material = murky(baked.material.map
      ? new THREE.MeshLambertMaterial({ map: baked.material.map, color: baked.material.color })
      : new THREE.MeshLambertMaterial({ vertexColors: true }));
    material.name = 'tjorn frog';
    frog.mesh = new THREE.Mesh(geometry, material);
    frog.mesh.name = 'Tjörn frog';
    frog.mesh.castShadow = false;
    frog.mesh.updateMorphTargets();
    frog.group.add(frog.mesh);
    // as it is drawn (its sitting pose is a morph of the bake): its length along its nose, its middle over the seat, its feet on it
    frog.group.scale.setScalar(1);
    frog.group.position.set(0, 0, 0);
    frog.group.rotation.set(0, 0, 0);
    const drawn = new THREE.Box3().setFromArray(verticesOf(frog.mesh));
    frog.length = drawn.max.x - drawn.min.x;
    frog.mesh.position.set(-(drawn.min.x + drawn.max.x) / 2, -drawn.min.y, -(drawn.min.z + drawn.max.z) / 2);
    frog.loaded = true;
  }).catch(error => { console.warn('[tjorn3d] the frog could not be loaded:', error?.message ?? error); }).then(() => { frog.settled = true; });
  /** The frog sitting at `point` (world, under its feet), facing `heading`, `length` metres long. */
  frog.show = (point, heading, length) => {
    frog.group.visible = true;
    frog.group.scale.setScalar(length / frog.length);
    frog.group.position.copy(point);
    frog.group.rotation.y = -rad(heading);
  };

  // ---- the butterfly: the hero's model, posed as world/forest/butterflies.js poses it ----
  const butterfly = { group: new THREE.Group(), wings: { L: null, R: null }, feet: BUTTERFLY.feet, span: BUTTERFLY.span, loaded: false };
  butterfly.group.name = 'Tjörn butterfly';
  butterfly.group.visible = false;
  group.add(butterfly.group);
  const butterflyReady = load(world, BUTTERFLY_MODEL).then(gltf => {
    const model = gltf.scene.clone(true);
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.material = murky(o.material.clone());
    });
    for (const side of ['L', 'R']) butterfly.wings[side] = model.getObjectByName(`Wing${side}`) ?? null;
    const body = model.getObjectByName('Body');
    butterfly.feet = body?.userData.feet ?? butterfly.feet;
    butterfly.span = body?.userData.span ?? butterfly.span;
    butterfly.group.add(model);
    butterfly.loaded = true;
  }).catch(error => { console.warn('[tjorn3d] the butterfly could not be loaded:', error?.message ?? error); }).then(() => { butterfly.settled = true; });
  /**
   * The butterfly standing with its feet at `point` (world), `up` the way its back faces there (a unit vector: the skin's own way
   * out where it sits on someone), its head toward `heading`, `span` metres across, its wings lifted by `flap` radians.
   */
  const upQ = new THREE.Quaternion(), yawQ = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), off = new THREE.Vector3();
  butterfly.show = (point, heading, span, flap, up = Y) => {
    const k = span / butterfly.span;
    butterfly.group.visible = true;
    butterfly.group.scale.setScalar(k);
    butterfly.group.quaternion.copy(upQ.setFromUnitVectors(Y, up)).multiply(yawQ.setFromAxisAngle(Y, -rad(heading)));
    butterfly.group.position.copy(point).add(off.copy(up).multiplyScalar(butterfly.feet * k));
    if (butterfly.wings.L) butterfly.wings.L.rotation.x = flap;
    if (butterfly.wings.R) butterfly.wings.R.rotation.x = -flap;
  };

  // the scene waits for the two where it waits for whatever loads (main.js: a capture's seek, the warm-up; engine/flier-saddle.js)
  const ready = Promise.all([frogReady, butterflyReady]);
  const loading = (world.loading ??= new Set());
  loading.add(ready);
  ready.then(() => loading.delete(ready));

  return {
    group, fish, jumper, frog, butterfly, ready,
    /** True once both models are here, or could not be had (the page then goes on without that one). */
    get settled() { return Boolean(frog.settled && butterfly.settled); },
  };
}

const p = new THREE.Vector3();
/** Every vertex of the meshes under `object` where it is drawn now, in the world: [x, y, z, ...] (morphs and skins followed). */
export function verticesOf(object, out = []) {
  object.updateWorldMatrix(true, true);
  object.traverse(o => {
    const at = o.isMesh && o.visible && o.geometry?.attributes.position;
    if (!at) return;
    for (let i = 0; i < at.count; i++) {
      o.getVertexPosition(i, p).applyMatrix4(o.matrixWorld);
      out.push(p.x, p.y, p.z);
    }
  });
  return out;
}
