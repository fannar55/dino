import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../../../dist/vendor/SkeletonUtils.js';

/**
 * The gifts the leaves hide, in pairs (rules.js `gifts`): the three small animals of level 1 and the four fossils of level 2 (the
 * snigilsteinn, pöddusteinn, laufsteinn and risaspor, flat scans that lie on their leaf and lean toward the camera). One table, keyed by the
 * id the rules hold in card.item (the world builds only the ones its level hides, `level.gifts`):
 *   word      the thing's name, as the basket says it
 *   name      its name as Mosi says it
 *   seek      what Mosi's bubble says when the first leaf of its pair is open ("Where is the other one?")
 *   caption   what it says when the pair is found
 *   voice     the voice line Mosi says then (voice-lines.js)
 *   make()    a Promise of { group, tilt, animate(seconds), dispose() } (tilt: how far it leans back toward the camera): one instance of the
 *             animal, standing on y = 0 and facing +X. A pair needs two, so the world calls make() twice.
 * The models are assets/memory/gifts/*.glb (each with a -source.json: author, licence, what was changed); GIFT_CREDITS has
 * what the ending card's "i" shows. Adding the frog is one more line here, one in GIFT_CREDITS and 'frog' in the rules' gifts.
 */
export const GIFT_ITEMS = Object.freeze({
  shrew: { word: 'snjáldurmús', name: 'Snjáldurmús', seek: 'Snjáldurmús! Hvar er hin?', caption: 'Snjáldurmús! Hún fer í körfuna.', voice: 'gift_shrew', make: () => makeStatic('shrew.glb', 'Snjáldurmús', { sway: .3, bob: .035, rate: 1.9 }) },
  hermitCrab: { word: 'kuðungakrabbi', name: 'Kuðungakrabbi', seek: 'Kuðungakrabbi! Hvar er hinn?', caption: 'Kuðungakrabbi! Hann fer í körfuna.', voice: 'gift_hermitCrab', make: () => makeStatic('hermit-crab.glb', 'Kuðungakrabbi', { sway: .26, bob: .03, rate: 1.5 }) },
  crab: { word: 'krabbi', name: 'Krabbi', seek: 'Krabbi! Hvar er hinn?', caption: 'Krabbi! Hann fer í körfuna.', voice: 'gift_crab', make: () => makeDancer('crab.glb', 'Krabbi', 'Dance') },
  // Level 2's fossils: slabs that lie flat with their face up (the processed models' +Y), so they are leant back toward the camera (a flat
  // butterfly's trick) and turn a little on their leaf; `shown` is the turn they start from.
  ammonite: { word: 'snigilsteinn', name: 'Snigilsteinn', seek: 'Snigilsteinn! Hvar er hinn?', caption: 'Snigilsteinn! Hann fer í körfuna.', voice: 'gift_ammonite', make: () => makeStatic('ammonite.glb', 'Snigilsteinn', { sway: .35, bob: .03, rate: 1.4, tilt: .95, shown: -.3 }) },
  trilobite: { word: 'pöddusteinn', name: 'Pöddusteinn', seek: 'Pöddusteinn! Hvar er hinn?', caption: 'Pöddusteinn! Hann fer í körfuna.', voice: 'gift_trilobite', make: () => makeStatic('trilobite.glb', 'Pöddusteinn', { sway: .3, bob: .03, rate: 1.6, tilt: .95, shown: -.2 }) },
  fern: { word: 'laufsteinn', name: 'Laufsteinn', seek: 'Laufsteinn! Hvar er hinn?', caption: 'Laufsteinn! Hann fer í körfuna.', voice: 'gift_fern', make: () => makeStatic('fern.glb', 'Laufsteinn', { sway: .2, bob: .03, rate: 1.3, tilt: 1.05, shown: -.1 }) },
  footprint: { word: 'risaspor', name: 'Risaspor', seek: 'Risaspor! Hvar er hitt?', caption: 'Risaspor! Það fer í körfuna.', voice: 'gift_footprint', make: () => makeStatic('footprint.glb', 'Risaspor', { sway: .3, bob: .03, rate: 1.5, tilt: 1.05, shown: .2 }) },
});

/** The licence rows of the gift models, as the ending card's "i" shows them (Líkan / Leyfi / Frá, as the book's card viewer does); a level shows its own gifts' rows. */
export const GIFT_CREDITS = Object.freeze([
  { id: 'shrew', title: 'Snjáldurmús', author: 'Robert_the_whale', license: 'CC BY 4.0', source: 'sketchfab.com/3d-models/shrew-fc1d0d7199e7480598f0accf469dad91' },
  { id: 'hermitCrab', title: 'Kuðungakrabbi', author: 'Citflo', license: 'CC BY 4.0', source: 'sketchfab.com/3d-models/little-hermit-crab-3fc91d811ae54de5b5fc5bb0e3db538a' },
  { id: 'crab', title: 'Krabbi', author: 'Bohdan Lvov', license: 'CC BY 4.0', source: 'sketchfab.com/3d-models/dancing-crab-uca-mjoebergi-280863886fee409ab3c8168f07caa89f' },
  { id: 'ammonite', title: 'Snigilsteinn (Ammonite fossil stylized)', author: 'Varvara', license: 'CC BY 4.0', source: 'sketchfab.com/3d-models/ammonite-fossil-stylized-a7068c98ff4a47eaa00b890cf6c5a255' },
  { id: 'trilobite', title: 'Pöddusteinn (Trilobite, Science Zone UK)', author: 'Thomas Flynn', license: 'CC BY 4.0', source: 'sketchfab.com/3d-models/trilobite-science-zone-uk-6681082381a9432f9bdee9aa2e18724d' },
  { id: 'fern', title: 'Laufsteinn (Fern: Crenulopteris acadica, PRI 42681)', author: 'Digital Atlas of Ancient Life', license: 'CC0 1.0', source: 'sketchfab.com/3d-models/fern-crenulopteris-acadica-pri-42681-467b1faa231b40a9936a4458a51a5fea' },
  { id: 'footprint', title: 'Risaspor (Dinosaur footprint Mount Morgan A1)', author: 'anthony.romilio', license: 'CC BY 4.0', source: 'sketchfab.com/3d-models/dinosaur-footprint-mount-morgan-a1-f81831f616ae47eab3a8a179efa0c4c9' },
].map(row => Object.freeze(row)));

/** One gift, ready to show (not yet in the scene). */
export function createGiftItem(id) {
  const entry = GIFT_ITEMS[id];
  if (!entry) throw new RangeError(`No art for the gift "${id}" (surprise-items.js).`);
  return entry.make();
}

// The file is read once; each instance is a clone of it (the maps and the geometry stay shared, so a pair costs no more memory).
const files = new Map();
const load = name => {
  if (!files.has(name)) files.set(name, new GLTFLoader().loadAsync(new URL(`../../assets/memory/gifts/${name}`, import.meta.url).href));
  return files.get(name);
};
const SHOWN = -.55; // the animal shows its face three-quarters to the camera (the world turns +X toward the camera's right)
let instances = 0;

function prepare(model) {
  model.traverse(object => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = true; object.frustumCulled = false; } });
}

// The shrew and the hermit crab: still models that bob and turn gently, as the berries did. The fossils are the same, leant back toward
// the camera (`tilt`, radians, as the butterfly's): the lean turns the slab about the ground point under it, so the slab is lifted by
// what the lean would sink of it (the lowest corner of its box after the lean), and each starts from its own turn (`shown`).
async function makeStatic(file, name, { sway, bob, rate, tilt = 0, shown = SHOWN }) {
  const model = (await load(file)).scene.clone(true), phase = (instances++ % 2) * 1.7;
  prepare(model);
  let lift = 0;
  if (tilt) {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), sin = Math.sin(tilt), cos = Math.cos(tilt);
    let lowest = Infinity;
    for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) lowest = Math.min(lowest, y * cos - z * sin);
    lift = Math.max(0, -lowest) / cos + .04;
  }
  const pose = new THREE.Group(); pose.add(model);
  const group = new THREE.Group(); group.name = name; group.add(pose);
  return {
    group, tilt,
    animate(seconds) { pose.rotation.y = shown + Math.sin((seconds + phase) * rate) * sway; pose.position.y = lift + Math.abs(Math.sin((seconds + phase) * rate * 1.6)) * bob; },
    dispose() { group.clear(); }, // the geometry and maps stay with the file, for the next game
  };
}

// The krabbi: a skin with its Dance clip. Each instance clones the skeleton and has its own mixer; the pair starts a little apart.
async function makeDancer(file, name, clipName) {
  const gltf = await load(file), model = cloneSkinned(gltf.scene), phase = (instances++ % 2) * .9;
  prepare(model);
  const clip = gltf.animations.find(value => value.name === clipName) ?? gltf.animations[0];
  const mixer = new THREE.AnimationMixer(model);
  if (clip) mixer.clipAction(clip).play();
  const pose = new THREE.Group(); pose.add(model);
  const group = new THREE.Group(); group.name = name; group.add(pose);
  return {
    group, tilt: 0,
    animate(seconds) { pose.rotation.y = SHOWN + Math.sin(seconds * .9 + phase) * .18; if (clip) mixer.setTime(seconds + phase); },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); group.clear(); },
  };
}

// The moth the owner picked (assets/critters/butterfly.glb, world/forest/butterflies.js): Body, WingL and WingR facing +X,
// the wings lying flat, each turned about X to flap. 0.36 m across; shown larger so a child sees it. It no longer hides under a
// leaf: the waiting friends chase it (idle-play.js).
const BUTTERFLY_URL = new URL('../../assets/critters/butterfly.glb', import.meta.url).href;
let butterflyFile = null;
export async function createButterflyItem() {
  butterflyFile ??= new GLTFLoader().loadAsync(BUTTERFLY_URL);
  const model = (await butterflyFile).scene.clone(true), wings = ['L', 'R'].map(side => model.getObjectByName(`Wing${side}`));
  model.traverse(object => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = true; } });
  const group = new THREE.Group(); group.name = 'Fiðrildi'; model.scale.setScalar(3.2); group.add(model);
  return {
    group, tilt: 1.05, // leant back toward the camera, so the flat wings face it
    animate(seconds) {
      const flap = .25 + 1.05 * (.5 + .5 * Math.sin(seconds * 15));
      if (wings[0]) wings[0].rotation.x = flap;
      if (wings[1]) wings[1].rotation.x = -flap;
    },
    dispose() { group.clear(); }, // the geometry and maps stay with the file, for the next game
  };
}
