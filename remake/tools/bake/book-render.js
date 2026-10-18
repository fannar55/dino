import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';

// The book's pictures of Mosi and Kambeðla, rendered from the game's own models on a clear background, softly lit,
// at a three-quarter view (for the cards' first pages and Mosi's fourth, assets/book/images/). Run it with
// bake-character.mjs, which saves what the page uploads:
//
//   node remake/tools/bake/bake-character.mjs --page book-render --out remake/assets/book/images/mosi-render.webp --query "who=mosi"
//   node remake/tools/bake/bake-character.mjs --page book-render --out remake/assets/book/images/mosi-render-thumb.webp --query "who=mosi&width=320"
//
// The pictures on the cards of "Eitt!" (assets/eitt/) come from here too: the four colours' dinosaurs and two of the action
// cards' tricks, all on a clear background:
//
//   node remake/tools/bake/bake-character.mjs --page book-render --out remake/assets/eitt/trex.webp --query "who=trex&width=512"
//
// Query: who (mosi, kambedla or both for the book; trex, brontosaurus, parasaurolophus, pteranodon (Flugeðla flying a circle)
// or stegosaurus-tail (Kambeðla mid tail-swish) for the cards), width (the picture's width in px, 1024; the height is three
// quarters of it, and a smaller width is the same picture made smaller: the thumbnail), quality (WebP, 0.9), preview (1: show
// the picture over the card's paper instead of uploading it, for capture.mjs; bg=<css colour> changes the paper). Any other key
// is a setting, by its path, of the shot (SHOTS below) or of the light (LOOK below), as in camera.az=40 camera.el=6
// camera.fov=22 camera.fill=0.92,0.88, actors.0.heading=0 actors.0.time=1 (seconds into the clip) actors.0.turn=34 (degrees the
// head turns, + toward heading 90) actors.0.nod=3 (degrees the head dips) actors.0.x, actors.0.y and actors.0.z (metres),
// actors.0.bank and actors.0.pitch (degrees the whole body rolls about its length and tips its nose up), actors.0.swish
// (degrees the tail swings sideways, spread along its bones, + toward heading 90) and actors.0.lift (degrees it rises),
// key.az=-28 (from the camera's) key.el=54 key.i=2.7 key.color=#ffe2b5, fill.*, hemi.*, env.i=0.5, shadow=0.24 (the ground
// shadow's opacity, 0 for none), blur=10 and exposure=1. A shot may carry its own light in `look`.
// Headings are degrees, 0 facing +X and 90 facing +Z, as in the game.
//
// The picture is drawn at twice its size on a transparent canvas and brought down to size in halves, so its edges are smooth.
// Colour is the game's pipeline: sRGB out, the Khronos neutral tone map, so the painted Tripo colours stay as they are.

const params = new URLSearchParams(location.search);
const WHO = params.get('who') || 'mosi';
const WIDTH = Number(params.get('width') || 1024);
const FULL = [1024, 768]; // the picture is 4:3
const QUALITY = Number(params.get('quality') || 0.9);
const SUPERSAMPLE = 2;
const status = text => { window.__bakeStatus = text; console.log('[book-render]', text); };
const rad = THREE.MathUtils.degToRad;

const MODELS = Object.fromEntries(['mosi', 'stegosaurus', 'trex', 'brontosaurus', 'parasaurolophus', 'pteranodon']
  .map(name => [name, `../../assets/characters/${name}.glb`]));

// The shots. A camera's az is world degrees (0 in front of a character that faces +X, 90 on its +Z side), el is how far
// above the level it looks from, fill is how much of the frame the characters take. The key light's az is measured from the camera's.
const SHOTS = {
  mosi: {
    camera: { az: 40, el: 6, fov: 22, fill: [0.92, 0.88] },
    actors: [{ model: 'mosi', x: 0, z: 0, heading: 0, clip: 'idle', time: 1.0, turn: 34, nod: 0 }],
  },
  kambedla: {
    camera: { az: 40, el: 6, fov: 22, fill: [0.92, 0.88] },
    actors: [{ model: 'stegosaurus', x: 0, z: 0, heading: 0, clip: 'idle', time: 1.0, turn: 34, nod: 3 }],
  },
  both: {
    camera: { az: 90, el: 6, fov: 22, fill: [0.94, 0.9] },
    actors: [
      { model: 'stegosaurus', x: -1.6, z: 1.2, heading: 56, clip: 'idle', time: 1.0, turn: 14, nod: 2 },
      { model: 'mosi', x: 2.5, z: -0.6, heading: 124, clip: 'idle', time: 1.0, turn: -14, nod: 0 },
    ],
  },
  // The cards of "Eitt!": red is Grameðla, yellow Þórseðla, green Mosi (the shot above) and blue Slóeðla; skip is Kambeðla's
  // tail swish and reverse Flugeðla flying a circle.
  trex: {
    camera: { az: 40, el: 6, fov: 22, fill: [0.92, 0.88] },
    actors: [{ model: 'trex', x: 0, z: 0, heading: 0, clip: 'idle', time: 1.0, turn: 34, nod: 0 }],
  },
  brontosaurus: {
    camera: { az: 40, el: 6, fov: 22, fill: [0.92, 0.88] },
    actors: [{ model: 'brontosaurus', x: 0, z: 0, heading: 0, clip: 'idle', time: 1.0, turn: 50, nod: 4 }],
  },
  parasaurolophus: {
    camera: { az: 40, el: 6, fov: 22, fill: [0.92, 0.88] },
    actors: [{ model: 'parasaurolophus', x: 0, z: 0, heading: 0, clip: 'idle', time: 1.0, turn: 34, nod: 0 }],
  },
  pteranodon: {
    camera: { az: 50, el: 12, fov: 22, fill: [0.92, 0.88] },
    actors: [{ model: 'pteranodon', x: 0, z: 0, heading: 0, clip: 'fly', time: 0.25, turn: 30, nod: 0, bank: 22 }],
    look: { shadow: 0 },
  },
  'stegosaurus-tail': {
    camera: { az: 100, el: 30, fov: 22, fill: [0.92, 0.88] },
    actors: [{ model: 'stegosaurus', x: 0, z: 0, heading: 0, clip: 'idle', time: 1.0, turn: 60, nod: 2, swish: -90, lift: 40 }],
  },
};
const LOOK = {
  exposure: 1,
  key: { az: -28, el: 54, i: 2.7, color: '#ffe2b5' },
  fill: { az: 70, el: 14, i: 0.6, color: '#c9d8e8' },
  hemi: { i: 1.0, sky: '#cfe3f2', ground: '#c9b98a' },
  env: { i: 0.5 },
  shadow: 0.24,
  blur: 10,
};

/** Sets obj.a.b.0.c to value, from the path 'a.b.0.c'; numbers and lists of numbers are read as such. */
function setPath(obj, path, raw) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((o, k) => o[k], obj);
  const values = raw.split(',').map(Number);
  parent[last] = raw.includes(',') ? values : (Number.isNaN(values[0]) ? raw : values[0]);
}

const shot = structuredClone(SHOTS[WHO]);
const look = { ...structuredClone(LOOK), ...structuredClone(shot.look ?? {}) };
const aspect = FULL[0] / FULL[1];
for (const [key, value] of params) {
  if (['who', 'width', 'quality', 'preview', 'bg'].includes(key)) continue;
  if (['key', 'fill', 'hemi', 'env'].includes(key.split('.')[0])) setPath(look, key, value);
  else if (['exposure', 'shadow', 'blur'].includes(key)) look[key] = Number(value);
  else setPath(shot, key, value);
}

const loader = new GLTFLoader();
const Y = new THREE.Vector3(0, 1, 0);
const parentQ = new THREE.Quaternion();
const localQ = new THREE.Quaternion();
const boneNamed = (model, name) => model.getObjectByName(name) ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

// Turn a bone by a world-space rotation about its own pivot (as engine/actor.js does).
function rotateBoneWorld(bone, q) {
  bone.parent.getWorldQuaternion(parentQ);
  localQ.copy(parentQ).invert().multiply(q).multiply(parentQ);
  bone.quaternion.premultiply(localQ);
  bone.updateMatrixWorld(true);
}

/** One character standing at (x, z) with a heading, in `clip` at `time`, its head turned and dipped a little. */
async function stand(spec) {
  const gltf = await loader.loadAsync(MODELS[spec.model]);
  const model = gltf.scene;
  const root = new THREE.Group();
  root.add(model);
  root.position.set(spec.x, spec.y ?? 0, spec.z);
  // A roll about the body's length (its +X), then a nose-up pitch, then the heading: for one flying.
  root.rotation.set(rad(spec.bank ?? 0), -rad(spec.heading), rad(spec.pitch ?? 0), 'YZX');
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    o.material.shadowSide = THREE.FrontSide; // as the game does, so creases keep their shadows
  });
  root.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(model);
  const clip = gltf.animations.find(c => c.name === spec.clip) ?? gltf.animations[0];
  mixer.clipAction(clip).play();
  mixer.setTime(spec.time);
  root.updateMatrixWorld(true);
  // The head and neck turn together toward `turn` degrees of heading, and the head dips by `nod`.
  const neck = boneNamed(model, 'Neck');
  const head = boneNamed(model, 'Head');
  if (spec.turn) {
    rotateBoneWorld(neck, new THREE.Quaternion().setFromAxisAngle(Y, -rad(spec.turn) * 0.4));
    rotateBoneWorld(head, new THREE.Quaternion().setFromAxisAngle(Y, -rad(spec.turn) * 0.6));
  }
  if (spec.nod) {
    const forward = new THREE.Vector3(Math.cos(rad(spec.heading + spec.turn)), 0, Math.sin(rad(spec.heading + spec.turn)));
    rotateBoneWorld(head, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(Y, forward).normalize(), rad(spec.nod)));
  }
  // A swish: the tail swings `swish` degrees sideways and rises `lift`, a share at each of its bones, so it curves as it goes.
  const tail = [];
  model.traverse(o => { if (o.isBone && /^Tail\d+$/.test(o.name)) tail.push(o); });
  tail.sort((a, b) => Number(a.name.slice(4)) - Number(b.name.slice(4)));
  if (tail.length && (spec.swish || spec.lift)) {
    const side = new THREE.Vector3(-Math.sin(rad(spec.heading)), 0, Math.cos(rad(spec.heading))); // the body's +Z, heading 90
    for (const bone of tail) {
      rotateBoneWorld(bone, new THREE.Quaternion().setFromAxisAngle(Y, rad(spec.swish ?? 0) / tail.length)
        .multiply(new THREE.Quaternion().setFromAxisAngle(side, -rad(spec.lift ?? 0) / tail.length)));
    }
  }
  root.updateMatrixWorld(true);
  return { root, model };
}

/** Every vertex of the characters as they stand, in world space, as a flat list of numbers. */
function posedPoints(actors) {
  const out = [];
  const v = new THREE.Vector3();
  for (const { model } of actors) {
    model.traverse(o => {
      if (!o.isSkinnedMesh) return;
      const count = o.geometry.attributes.position.count;
      for (let i = 0; i < count; i++) {
        o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
        out.push(v.x, v.y, v.z);
      }
    });
  }
  return out;
}

/** Puts the camera where the characters take `fill` of the frame, centred, looking from azimuth and elevation (degrees). */
function frame(camera, points, { az, el, fov, fill }) {
  const dir = new THREE.Vector3(Math.cos(rad(el)) * Math.cos(rad(az)), Math.sin(rad(el)), Math.cos(rad(el)) * Math.sin(rad(az)));
  const box = new THREE.Box3().setFromArray(points);
  const target = box.getCenter(new THREE.Vector3());
  let distance = (box.getSize(new THREE.Vector3()).length() / 2 / Math.sin(rad(fov) / 2)) * 1.1;
  camera.fov = fov;
  camera.aspect = aspect;
  camera.near = 0.5;
  camera.far = distance * 6;
  const p = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  for (let round = 0; round < 14; round++) {
    camera.position.copy(target).addScaledVector(dir, distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < points.length; i += 3) {
      p.set(points[i], points[i + 1], points[i + 2]).project(camera);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const halfHeight = Math.tan(rad(fov) / 2) * distance;
    camera.matrixWorld.extractBasis(right, up, p);
    target.addScaledVector(right, ((x0 + x1) / 2) * halfHeight * aspect).addScaledVector(up, ((y0 + y1) / 2) * halfHeight);
    distance *= Math.max((x1 - x0) / 2 / fill[0], (y1 - y0) / 2 / fill[1]);
  }
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.lookAt(target);
  camera.near = distance * 0.2;
  camera.far = distance * 4;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { target, distance };
}

/** A soft sky for the light the colours bounce in: pale blue above, warm cream at the horizon and ground, two big soft boxes. */
function skyLight(renderer) {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: 'varying vec3 p; void main() { p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 p; void main() {
      vec3 top = vec3(0.62, 0.78, 0.95), horizon = vec3(1.0, 0.96, 0.86), ground = vec3(0.82, 0.74, 0.58);
      vec3 c = p.y > 0.0 ? mix(horizon, top, pow(p.y, 0.6)) : mix(horizon, ground, pow(-p.y, 0.5));
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  scene.add(sky);
  for (const [x, y, z, w, h] of [[-18, 24, 14, 22, 12], [20, 10, -12, 14, 10]]) {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 5), side: THREE.DoubleSide }));
    box.position.set(x, y, z);
    box.lookAt(0, 0, 0);
    scene.add(box);
  }
  const env = new THREE.PMREMGenerator(renderer).fromScene(scene, 0.04).texture;
  return env;
}

/** The finished canvas at `width` px across, brought down from its drawn size in halves. */
function resize(source, width) {
  const height = Math.round((width * FULL[1]) / FULL[0]);
  let canvas = source;
  while (canvas.width / 2 >= width) {
    const half = document.createElement('canvas');
    half.width = canvas.width / 2;
    half.height = canvas.height / 2;
    const c = half.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(canvas, 0, 0, half.width, half.height);
    canvas = half;
  }
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const c = out.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(canvas, 0, 0, width, height);
  return out;
}

try {
  status('loading');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(FULL[0] * SUPERSAMPLE, FULL[1] * SUPERSAMPLE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = look.exposure;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  document.body.append(renderer.domElement);

  const scene = new THREE.Scene();
  const actors = [];
  for (const spec of shot.actors) {
    const actor = await stand(spec);
    actors.push(actor);
    scene.add(actor.root);
  }
  const points = posedPoints(actors);
  const camera = new THREE.PerspectiveCamera();
  // The frame holds the characters and the ground their shadows fall on (each vertex carried along the key's light to the ground).
  const toLight = new THREE.Vector3(
    Math.cos(rad(look.key.el)) * Math.cos(rad(shot.camera.az + look.key.az)), Math.sin(rad(look.key.el)),
    Math.cos(rad(look.key.el)) * Math.sin(rad(shot.camera.az + look.key.az)),
  );
  const shadows = [];
  if (look.shadow > 0) {
    for (let i = 0; i < points.length; i += 3) {
      if (points[i + 1] > 0.05) shadows.push(points[i] - toLight.x * (points[i + 1] / toLight.y), 0, points[i + 2] - toLight.z * (points[i + 1] / toLight.y));
    }
  }
  const { target, distance } = frame(camera, points.concat(shadows), shot.camera);

  // Light, all measured from the camera: a warm key from above and to its right, a cool fill from the left, the sky all round.
  const at = (az, el, d = 1) => new THREE.Vector3(
    Math.cos(rad(el)) * Math.cos(rad(shot.camera.az + az)), Math.sin(rad(el)), Math.cos(rad(el)) * Math.sin(rad(shot.camera.az + az)),
  ).multiplyScalar(d).add(target);
  const radius = new THREE.Box3().setFromArray(points).getSize(new THREE.Vector3()).length() / 2;
  const key = new THREE.DirectionalLight(look.key.color, look.key.i);
  key.position.copy(at(look.key.az, look.key.el, radius * 3));
  key.target.position.copy(target);
  key.castShadow = look.shadow > 0;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -radius * 1.2; key.shadow.camera.right = radius * 1.2;
  key.shadow.camera.top = radius * 1.2; key.shadow.camera.bottom = -radius * 1.2;
  key.shadow.camera.near = radius * 0.5; key.shadow.camera.far = radius * 6;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = look.blur;
  key.shadow.blurSamples = 25;
  const fill = new THREE.DirectionalLight(look.fill.color, look.fill.i);
  fill.position.copy(at(look.fill.az, look.fill.el, radius * 3));
  fill.target.position.copy(target);
  scene.add(key, key.target, fill, fill.target, new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.i));
  scene.environment = skyLight(renderer);
  scene.environmentIntensity = look.env.i;

  // A soft contact shadow on the ground, in the shade colour of the style guide (never black), and nothing else of the ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(radius * 8, radius * 8), new THREE.ShadowMaterial({ color: '#2c4a47', opacity: look.shadow }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  renderer.render(scene, camera);
  const full = renderer.domElement;
  const picture = resize(full, WIDTH);
  const blob = await new Promise(resolve => picture.toBlob(resolve, 'image/webp', QUALITY));
  window.__demoStats = { who: WHO, width: picture.width, height: picture.height, bytes: blob.size, distance, triangles: renderer.info.render.triangles };
  console.log('[book-render]', JSON.stringify(window.__demoStats));
  if (params.get('preview') === '1') {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    if (params.get('bg')) document.getElementById('stage').style.background = params.get('bg');
    document.getElementById('stage').append(img);
    window.__demoReady = true;
    status('done');
  } else {
    const res = await fetch('/__bake-output', { method: 'POST', body: blob });
    if (!res.ok) throw new Error(`the upload failed: ${res.status}`);
    status('done');
  }
} catch (error) {
  console.error(error);
  status(`error: ${error.message}`);
}
