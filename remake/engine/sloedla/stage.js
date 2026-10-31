// The menu's stage of Slóeðla's song game in 3D: Egill, Kambeðla, Slóeðla and Þórseðla, the owner's Tripo models
// (assets/characters/*.glb) with their own moves, drawn with three.js on a transparent canvas over the evening Fen. Its rules
// (who stands where, how each answers the picks, the dance on the beat) are stage-motion.js's; the flat stage (stage-flat.js)
// has the same face with the game's pictures. The page loads this with a dynamic import, so the game and the tests never import
// three.js; null when there is no WebGL. The friends drop in one at a time as their models come; if one cannot be loaded the
// stage gives up (onLost) and the page shows the pictures instead.

import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { CAST, CAMERA, bounce, castLayout, clipTime, loopBeats, outOf, reactions } from './stage-motion.js';

const MAX_RATIO = 1.5; // the canvas's pixels per CSS pixel, at most (a tablet's battery)
const DIM = 0.3; // the colour of a friend out of the round (as a sleeping friend in the game)
const CROSSFADE = 0.3; // s from one move to the next (0.25 into the dance)
const DROP = { height: 0.6, time: 0.4, land: 0.2, squash: 0.12 }; // a friend's arrival: from 0.6 up, then a squash on landing
const CHEER_GAP = 0.12; // s between the friends' cheers
const FLOOD = { intensity: 75, height: 7.5, ahead: 4, angle: 18, beat: 0.5 }; // each friend's floodlight from above and in front
// (candela; off while she is out, brighter on the beat as her beam of light is)

/** A soft round shadow, dark in the middle (a texture of its own, no page canvas needed). */
function shadowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      data[(y * size + x) * 4 + 3] = Math.round(140 * Math.max(0, 1 - r) ** 1.2);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

/**
 * The stage on `canvas` (a canvas filling the stage's box); `asset(path)` the address of a file in assets/; `onLost()` once if a
 * model cannot be loaded (the stage has then cleared its canvas and stopped). Resolves to the Stage
 * { setChoice({ lanes, level }), cheer(), frame(dt, beats, bpm), feet(), resize() } as soon as the renderer is up, or null
 * without WebGL.
 */
export async function createStage({ canvas, asset, win = globalThis, onLost = () => {}, reduced = false }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#9fb2ff', '#2a1f4a', 1.4));
  const key = new THREE.DirectionalLight('#ffe6b8', 2.2);
  key.position.set(-3, 6, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#8fe0ff', 1.4);
  rim.position.set(4, 3, -4);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(CAMERA.wide.fov, 1, 0.1, 100);
  const shade = shadowTexture();

  let width = 1, height = 1;
  let choice = null; // the last { lanes, level }
  let out = outOf({ lanes: 3, level: 'barn' });
  let lost = false;
  let clock = 0;
  const friends = {}; // id -> the friend on the stage, once her model is in
  const cheers = []; // { at, id } cheers still to come

  function lose() {
    if (lost) return;
    lost = true;
    for (const friend of Object.values(friends)) friend.mixer.stopAllAction();
    renderer.clear();
    scene.traverse(node => {
      node.geometry?.dispose();
      for (const material of [].concat(node.material ?? [])) material.dispose();
    });
    shade.dispose();
    renderer.dispose();
    onLost();
  }

  const restOf = friend => (friend.out ? friend.conf.away : friend.conf.rest);
  function play(friend, name, { once = false } = {}) {
    const clip = friend.clips[name] ?? friend.clips[friend.conf.rest];
    if (!clip) return;
    const action = friend.mixer.clipAction(clip);
    action.reset();
    action.timeScale = 1;
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    if (friend.current && friend.current !== action) friend.current.crossFadeTo(action, CROSSFADE, false);
    action.play();
    friend.current = action;
    friend.dancing = null;
    friend.once = once ? action : null;
  }
  // the dance: her move held at the place the beat says (the action stands still, its time set each frame)
  function dance(friend, beats, bpm) {
    const clip = friend.clips[friend.conf.dance] ?? friend.clips[friend.conf.rest];
    if (!clip) return;
    if (!friend.dancing) {
      const action = friend.mixer.clipAction(clip);
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.timeScale = 0;
      if (friend.current && friend.current !== action) friend.current.crossFadeTo(action, 0.25, false);
      action.play();
      friend.current = action;
      friend.dancing = action;
      friend.once = null;
    }
    friend.dancing.time = clipTime(beats, loopBeats(clip.duration, bpm), clip.duration);
  }

  function place(friend, layout) {
    const spot = layout[friend.id];
    friend.x = spot.x;
    friend.z = spot.z;
    friend.holder.position.x = spot.x;
    friend.holder.position.z = spot.z;
    friend.shadow.position.set(spot.x, 0.01, spot.z);
    friend.flood.position.set(spot.x, FLOOD.height, spot.z + FLOOD.ahead);
  }

  function arrive(id, gltf) {
    if (lost) return;
    const conf = CAST[id];
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const scale = conf.height / Math.max(0.001, box.max.y - box.min.y);
    model.position.y -= box.min.y;
    const holder = new THREE.Group();
    holder.add(model);
    holder.scale.setScalar(scale);
    holder.rotation.y = THREE.MathUtils.degToRad(-conf.heading);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shade, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(conf.height * 1.3, conf.height * 0.7, 1);
    const flood = new THREE.SpotLight('#fff1d6', 0, 0, THREE.MathUtils.degToRad(FLOOD.angle), 0.55, 2);
    flood.target = holder;
    scene.add(holder, shadow, flood);
    const materials = [];
    model.traverse(node => {
      if (!node.isMesh) return;
      for (const material of [].concat(node.material ?? [])) if (material.color) materials.push({ material, base: material.color.clone() });
    });
    const mixer = new THREE.AnimationMixer(model);
    mixer.timeScale = 0.9 + Math.random() * 0.2;
    const friend = {
      id, conf, holder, shadow, flood, mixer, materials, scale, x: 0, z: 0,
      clips: Object.fromEntries(gltf.animations.map(clip => [clip.name, clip])),
      out: out[id], dim: out[id] ? DIM : 1, shownDim: -1, age: reduced ? DROP.time + DROP.land : 0,
      current: null, dancing: null, once: null,
    };
    mixer.addEventListener('finished', event => {
      if (event.action === friend.once && friend.current === event.action) play(friend, restOf(friend));
    });
    place(friend, castLayout(height > width));
    friends[id] = friend;
    play(friend, restOf(friend));
  }

  const loader = new GLTFLoader();
  for (const [id, conf] of Object.entries(CAST)) {
    loader.loadAsync(asset(`characters/${conf.file}.glb`)).then(gltf => arrive(id, gltf), lose);
  }

  function resize() {
    if (lost) return;
    width = Math.max(1, canvas.clientWidth || win.innerWidth || 1);
    height = Math.max(1, canvas.clientHeight || win.innerHeight || 1);
    const portrait = height > width;
    const view = portrait ? CAMERA.tall : CAMERA.wide;
    renderer.setPixelRatio(Math.min(MAX_RATIO, win.devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = view.fov;
    camera.position.set(...view.position);
    camera.lookAt(...view.look);
    camera.updateProjectionMatrix();
    const layout = castLayout(portrait);
    for (const friend of Object.values(friends)) place(friend, layout);
  }
  resize();

  const at = new THREE.Vector3();
  return {
    /** The child's choice: who is out of the round, and how each answers the change (nothing the first time). */
    setChoice({ lanes, level }) {
      const next = { lanes, level };
      const list = reactions(choice, next);
      choice = next;
      out = outOf(next);
      for (const { id, clip, once, out: away } of list) {
        const friend = friends[id];
        if (!friend) continue;
        friend.out = away;
        play(friend, clip, { once });
      }
      for (const friend of Object.values(friends)) {
        if (friend.out === out[friend.id]) continue;
        friend.out = out[friend.id];
        play(friend, restOf(friend));
      }
    },
    /** The friends in the round cheer, one after another. */
    cheer() {
      const order = ['egill', 'b', 'a', 'c'].filter(id => !out[id]);
      order.forEach((id, i) => cheers.push({ at: clock + i * CHEER_GAP, id }));
    },
    /** One frame, `dt` s on: with `beats` (the preview's, and its `bpm`) those in the round dance; else they rest. */
    frame(dt, beats = null, bpm = null) {
      if (lost) return;
      clock += dt;
      for (let i = cheers.length - 1; i >= 0; i--) {
        if (cheers[i].at > clock) continue;
        const friend = friends[cheers[i].id];
        cheers.splice(i, 1);
        if (friend && !friend.out) play(friend, friend.conf.cheer, { once: true });
      }
      const dancing = beats !== null && bpm > 0;
      const up = dancing ? bounce(beats) : 0;
      for (const friend of Object.values(friends)) {
        if (dancing && !friend.out) dance(friend, beats, bpm);
        else if (friend.dancing) play(friend, restOf(friend));
        friend.mixer.update(dt);
        // arriving: a fall from above, a squash as she lands
        friend.age += dt;
        const fall = Math.min(1, friend.age / DROP.time);
        friend.holder.position.y = DROP.height * (1 - fall * fall);
        const landed = friend.age - DROP.time;
        const squash = landed >= 0 && landed < DROP.land ? DROP.squash * Math.sin((landed / DROP.land) * Math.PI) : 0;
        const hop = friend.out ? 0 : up;
        const wide = friend.scale * (1 - 0.025 * hop + squash * 0.5);
        friend.holder.scale.set(wide, friend.scale * (1 + 0.05 * hop - squash), wide);
        friend.shadow.material.opacity = 1 - 0.6 * (1 - fall);
        // out of the round: dark, as a sleeping friend in the game
        const target = friend.out ? DIM : 1;
        friend.dim += (target - friend.dim) * Math.min(1, dt * 4);
        if (Math.abs(friend.dim - friend.shownDim) > 0.002) {
          for (const { material, base } of friend.materials) material.color.copy(base).multiplyScalar(friend.dim);
          friend.shownDim = friend.dim;
        }
        // her floodlight: on while she is in the round (it fades as she darkens), a flash on the beat
        friend.flood.intensity = FLOOD.intensity * ((friend.dim - DIM) / (1 - DIM)) * (1 + FLOOD.beat * hop);
      }
      renderer.render(scene, camera);
    },
    /** Each friend's feet, in CSS pixels of the stage's box (for her beam of light), and whether she is out. */
    feet() {
      return Object.values(friends).map(friend => {
        at.set(friend.x, 0, friend.z).project(camera);
        return { id: friend.id, x: ((at.x + 1) / 2) * width, y: ((1 - at.y) / 2) * height, out: friend.out };
      });
    },
    resize,
  };
}
