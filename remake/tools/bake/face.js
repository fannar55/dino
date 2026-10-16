import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { findEyes, readPixels, patchGlbNodeExtras } from './eyes.js';

// The face pass: finds a baked character's painted eyes (eyes.js) and writes them into the GLB as
// extras on its skinned mesh (`face.eyes`), where the engine builds the eyelids from them
// (engine/eyelids.js). The GLB's geometry and textures are kept byte for byte. Run it after every
// bake, with bake-character.mjs:
//
//   node remake/tools/bake/bake-character.mjs --page face --out remake/assets/characters/trex.glb
//     --query "src=../../assets/characters/trex.glb&out=trex.glb"
//
// Query: src (GLB, relative to this page), out (file name for the upload), eyes (optional hints,
// colour-map pixels near each pupil: "x,y;x,y"), margin (how much the outline grows), touch (dark
// blobs close together merge only when their texels come within this many texels' spacing of each
// other: Slóeðla 4, so the crease under her brow stays apart from the pupil), preview (1: show what
// was found instead of exporting: the head with each eye's outline, the candidates).

const params = new URLSearchParams(location.search);
const SRC = params.get('src');
const OUT = params.get('out') || SRC.split('/').pop();
const HINTS = params.get('eyes') ? params.get('eyes').split(';').map(s => s.split(',').map(Number)) : null;
const MARGIN = Number(params.get('margin') || 0.14);
const TOUCH = Number(params.get('touch') || 0);
const status = text => { window.__bakeStatus = text; console.log('[face]', text); };

function preview(gltf, mesh, found) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ece8e0');
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x8a8070, 2.2));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.4);
  sun.position.set(6, 10, 9);
  scene.add(sun, gltf.scene);
  mesh.frustumCulled = false;
  // Each eye's outline (the lid's reach) and its frame, drawn in the mesh's space on top of it.
  const overlay = new THREE.Group();
  mesh.parent.add(overlay);
  overlay.matrixAutoUpdate = false;
  overlay.matrix.copy(mesh.matrix);
  const line = (points, colour) => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: colour, depthTest: false }));
    l.renderOrder = 10;
    overlay.add(l);
  };
  for (const eye of found.eyes) {
    const [c, r, d, n] = [eye.centre, eye.right, eye.down, eye.normal].map(a => new THREE.Vector3(...a));
    const lift = n.clone().multiplyScalar(0.02 * eye.halfWidth);
    const outline = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const u = Math.cos(a), s = Math.sin(a);
      outline.push(c.clone().add(lift).addScaledVector(r, u * eye.halfWidth).addScaledVector(d, s * (s < 0 ? eye.top : eye.bottom)));
    }
    line(outline, 0xff00ff);
    line([c.clone(), c.clone().addScaledVector(d, eye.bottom * 1.6)], 0x00c040);
    line([c.clone(), c.clone().addScaledVector(n, eye.halfWidth)], 0x2060ff);
  }
  gltf.scene.updateMatrixWorld(true);
  const head = mesh.skeleton.bones.find(b => b.name === 'Head');
  const eyesWorld = found.eyes.map(e => new THREE.Vector3(...e.centre).applyMatrix4(mesh.matrixWorld));
  const focus = eyesWorld[0].clone().add(eyesWorld[1]).multiplyScalar(0.5);
  const span = eyesWorld[0].distanceTo(eyesWorld[1]);
  const forward = focus.clone().sub(head.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
  const view = params.get('view') ? new THREE.Vector3(...params.get('view').split(',').map(Number)).normalize() : forward.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 500);
  camera.position.copy(focus).addScaledVector(view, Number(params.get('dist') || span * 4));
  camera.lookAt(focus);
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
  window.__demoReady = true;
}

try {
  status('loading');
  const bytes = await (await fetch(SRC)).arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(bytes.slice(0), new URL(SRC, location.href).href.replace(/[^/]*$/, ''));
  gltf.scene.updateMatrixWorld(true);
  let mesh = null;
  gltf.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  if (!mesh) throw new Error('no skinned mesh');
  status('finding the eyes');
  const found = findEyes({ mesh, pixels: readPixels(mesh.material.map.image), hints: HINTS, margin: MARGIN, touch: TOUCH });
  window.__bakeReport = found;
  console.log('[face]', JSON.stringify(found));
  if (params.get('preview') === '1') {
    preview(gltf, mesh, found);
  } else {
    status('exporting');
    const eyes = found.eyes.map(({ texels, pupil, ...eye }) => eye);
    // Whatever else the face holds (the mouth pass's `mouth`) stays.
    const out = patchGlbNodeExtras(bytes, mesh.userData.name ?? mesh.name, { face: { ...mesh.userData.face, eyes } });
    const res = await fetch(`/__bake-output?name=${encodeURIComponent(OUT)}`, { method: 'POST', body: out });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  }
  status('done');
} catch (error) {
  console.error(error);
  status(`error: ${error.message}`);
}
