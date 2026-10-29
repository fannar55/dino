import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { GROVE_BERRY } from './build-props.js';

/**
 * What a surprise leaf can hide: one table, keyed by the id the rules hold in card.item (rules.js, `surprises`).
 *   word      the thing's name, as the basket says it
 *   caption   what Mosi's speech bubble says when it is found
 *   make()    a Promise of { group, tilt, animate(seconds), dispose() } (tilt: how far it leans back toward the camera): the thing itself, about a metre across, from existing art only
 * Adding the frog is one more line here, and 'frog' in the rules' surprises.
 */
export const SURPRISE_ITEMS = Object.freeze({
  berries: { word: 'ber', caption: 'Ber! Þau fara í körfuna.', make: makeBerries },
  butterfly: { word: 'fiðrildi', caption: 'Fiðrildi! Það fer í körfuna.', make: makeButterfly },
});

/** The item for a surprise id, ready to show (not yet in the scene). */
export function createSurpriseItem(id) {
  const entry = SURPRISE_ITEMS[id];
  if (!entry) throw new RangeError(`No art for the surprise "${id}" (surprise-items.js).`);
  return entry.make();
}

// A bunch of the grove's berries: six faceted balls in the grove's two reds, one mesh and one draw call.
const BUNCH = [[0, 0, 0], [.2, .06, .08], [-.19, .05, .1], [.04, -.18, .09], [.1, .08, -.17], [-.1, -.05, -.15]];
async function makeBerries() {
  const parts = BUNCH.map(([x, y, z], i) => {
    const part = new THREE.IcosahedronGeometry(GROVE_BERRY.radius * (1.05 + (i % 3) * .14), 0);
    part.translate(x, y, z); part.deleteAttribute('uv');
    const colour = new THREE.Color(GROVE_BERRY.reds[i % 3 ? 0 : 1]), values = new Float32Array(part.attributes.position.count * 3);
    for (let v = 0; v < values.length; v += 3) colour.toArray(values, v);
    part.setAttribute('color', new THREE.BufferAttribute(values, 3));
    return part;
  });
  const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.scale.setScalar(1.6);
  const group = new THREE.Group(); group.name = 'Ber'; group.add(mesh);
  return { group, tilt: 0, animate(seconds) { mesh.rotation.y = seconds * 1.1; mesh.rotation.z = Math.sin(seconds * 2) * .08; }, dispose() { geometry.dispose(); material.dispose(); } };
}

// The moth the owner picked (assets/critters/butterfly.glb, world/forest/butterflies.js): Body, WingL and WingR facing +X,
// the wings lying flat, each turned about X to flap. 0.36 m across; shown larger so a child sees it from the glade.
const BUTTERFLY_URL = new URL('../../assets/critters/butterfly.glb', import.meta.url).href;
let butterflyFile = null;
async function makeButterfly() {
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
