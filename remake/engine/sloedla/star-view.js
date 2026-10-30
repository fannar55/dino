// The stars of Slóeðla's song game in 3D: one model (assets/sloedla/stjarna/stjarna.glb, the owner's own from Tripo3D) drawn with
// three.js on a transparent canvas over the game's canvas, in our own materials (shining gold, or dark glass for a star not
// won yet), so it looks the same whatever the model's own colours. The game hands it, each frame, the stars to show as states
// from star-motion.js with an id each ({ id, x, y, size, spin, tilt, gold, flash, shine, glass }, x and y in CSS pixels).
// It draws only while there are stars to show; with none it clears once and rests. The page loads it with a dynamic import,
// so the game and the tests never import three.js; null (no WebGL, or no model) and the game draws its flat stars.

import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';

const GOLD = new THREE.Color('#ffc93a');
const GLASS = new THREE.Color('#3a3f7a');
const GOLD_SPEC = new THREE.Color('#fff6c8');
const GLASS_SPEC = new THREE.Color('#c9d8ff');
const GLOW = new THREE.Color('#ff9a00');
const MAX_RATIO = 1.5; // the canvas's pixels per CSS pixel, at most (a tablet's battery)

/**
 * The 3D stars on `canvas`, from the model at `url`, turned by `facing` (degrees about x, y, z) so its face looks at the viewer.
 * Resolves to { draw(stars), resize(width, height), clear() }, or null when there is no WebGL or the model cannot be loaded.
 */
export async function createStarView({ canvas, url, facing = [0, 0, 0], win = globalThis }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  let model;
  try {
    model = (await new GLTFLoader().loadAsync(url)).scene;
  } catch {
    renderer.dispose();
    return null;
  }
  // the model's meshes, centred, scaled so the star is 1 across its widest half (a size is a radius in CSS pixels), turned to face us
  const box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  const half = Math.max(...box.getSize(new THREE.Vector3()).toArray()) / 2 || 1;
  model.position.sub(centre);
  const shape = new THREE.Group();
  shape.add(model);
  shape.scale.setScalar(1 / half);
  shape.rotation.set(...facing.map(d => THREE.MathUtils.degToRad(d)));

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e0', '#3a3f7a', 1.1));
  const key = new THREE.DirectionalLight('#ffffff', 1.8);
  key.position.set(-1, 1.2, 1.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#ffd9a0', 0.7);
  rim.position.set(1.2, -0.4, -1);
  scene.add(rim);
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  camera.position.z = 1000;

  const stars = new Map(); // id -> { holder, material }
  function starOf(id) {
    let star = stars.get(id);
    if (!star) {
      const material = new THREE.MeshPhongMaterial({ color: GOLD, specular: GOLD_SPEC, shininess: 70, emissive: GLOW, emissiveIntensity: 0 });
      const copy = shape.clone(true);
      copy.traverse(node => { if (node.isMesh) node.material = material; });
      const holder = new THREE.Group();
      holder.add(copy);
      scene.add(holder);
      star = { holder, material };
      stars.set(id, star);
    }
    return star;
  }

  let width = 1, height = 1, drawn = false;
  function resize(w, h) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    renderer.setPixelRatio(Math.min(MAX_RATIO, win.devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    camera.left = 0;
    camera.right = width;
    camera.top = 0;
    camera.bottom = -height;
    camera.updateProjectionMatrix();
    drawn = true; // draw again at the new size
  }
  resize(canvas.clientWidth || win.innerWidth || 1, canvas.clientHeight || win.innerHeight || 1);

  return {
    /** Draws `list` (star states with ids); with none, clears once and then does nothing. */
    draw(list) {
      if (!list.length) {
        if (!drawn) return;
        for (const star of stars.values()) star.holder.visible = false;
        renderer.render(scene, camera);
        drawn = false;
        return;
      }
      const shown = new Set();
      for (const state of list) {
        const { holder, material } = starOf(state.id);
        shown.add(state.id);
        holder.visible = true;
        holder.position.set(state.x, -state.y, 0);
        holder.scale.setScalar(Math.max(0.001, state.size));
        holder.rotation.set(0, state.spin, -state.tilt);
        const gold = state.glass ? 0 : state.gold;
        material.color.copy(GLASS).lerp(GOLD, gold);
        material.specular.copy(GLASS_SPEC).lerp(GOLD_SPEC, gold);
        material.shininess = 70 + 60 * (state.shine ?? 0);
        material.emissiveIntensity = 0.9 * (state.flash ?? 0) + 0.45 * (state.shine ?? 0) + 0.12 * gold;
        material.transparent = gold < 1;
        material.opacity = 0.55 + 0.45 * gold;
        material.depthWrite = gold >= 1;
      }
      for (const [id, star] of stars) if (!shown.has(id)) star.holder.visible = false;
      renderer.render(scene, camera);
      drawn = true;
    },
    resize,
    clear() {
      for (const star of stars.values()) star.holder.visible = false;
      renderer.render(scene, camera);
      drawn = false;
    },
  };
}
