import * as THREE from 'three';
import { createActor } from '../actor.js';

// Slóeðla (Parasaurolophus) across the table of "Risaeðlu-Yatzy!": her own Tripo model, live, in a dedicated three.js view
// inside her window at the top of the table (yatzy.css: .yatzy-sloedla). She uses engine/actor.js so she breathes with her
// idle clip, blinks with her eyelids, and moves her jaw when speaking. On top of that the view gives her the game's moves:
//   talk({ mouth, duration })   her bill follows a line's mouth track
//   think(on)                   she tilts her crested head and looks down at the dice while choosing
//   call()                      her signature 5.0 s crest horn call ('call' clip: deep breath, head rises, blows through crest!)
//   hop()                       her 2.4 s happy rear-up ('happy' clip)
//   nod()                       her 2.4 s friendly nod ('kink' clip)
//   cheer()                     end of a game: alternates happy and call

const MODEL = new URL('../../assets/characters/parasaurolophus.glb', import.meta.url).href;
const rad = THREE.MathUtils.degToRad;

const SHOT = { az: 38, el: 8, fov: 26, fill: [1.0, 1.0], drop: 0.08 };
const LIGHT = {
  key: { az: -28, el: 54, i: 2.7, color: '#ffe2b5' },
  fill: { az: 70, el: 14, i: 0.65, color: '#c9d8e8' },
  hemi: { i: 1.0, sky: '#cfe3f2', ground: '#c9b98a' },
  env: 0.5,
};
const THINK = { tilt: 12, nod: 8, turn: -10, ease: 0.28 };
const HOP_SECONDS = 2.4;
const CALL_SECONDS = 5.0;
const NOD_SECONDS = 2.4;

function skyLight(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main() { p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 p; void main() {
      vec3 top = vec3(0.62, 0.78, 0.95), horizon = vec3(1.0, 0.96, 0.86), ground = vec3(0.82, 0.74, 0.58);
      vec3 c = p.y > 0.0 ? mix(horizon, top, pow(p.y, 0.6)) : mix(horizon, ground, pow(-p.y, 0.5));
      gl_FragColor = vec4(c, 1.0); }`,
  })));
  for (const [x, y, z, w, h] of [[-18, 24, 14, 22, 12], [20, 10, -12, 14, 10]]) {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 5), side: THREE.DoubleSide }));
    box.position.set(x, y, z);
    box.lookAt(0, 0, 0);
    scene.add(box);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const env = generator.fromScene(scene, 0.04).texture;
  generator.dispose();
  return env;
}

function groundShadow(length, width) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d');
  const gradient = c.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(44, 74, 71, 0.5)');
  gradient.addColorStop(0.55, 'rgba(44, 74, 71, 0.22)');
  gradient.addColorStop(1, 'rgba(44, 74, 71, 0)');
  c.fillStyle = gradient;
  c.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, width), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  mesh.renderOrder = -1;
  return mesh;
}

function posedPoints(model, step = 7) {
  const out = [];
  const v = new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const count = o.geometry.attributes.position.count;
    for (let i = 0; i < count; i += step) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      out.push(v.clone());
    }
  });
  return out;
}

function frame(camera, points, { az, el, fov, fill, drop = 0 }) {
  const dir = new THREE.Vector3(Math.cos(rad(el)) * Math.cos(rad(az)), Math.sin(rad(el)), Math.cos(rad(el)) * Math.sin(rad(az)));
  const box = new THREE.Box3().setFromPoints(points);
  const target = box.getCenter(new THREE.Vector3());
  let distance = (box.getSize(new THREE.Vector3()).length() / 2 / Math.sin(rad(fov) / 2)) * 1.1;
  camera.fov = fov;
  const p = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  for (let round = 0; round < 12; round++) {
    camera.position.copy(target).addScaledVector(dir, distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const point of points) {
      p.copy(point).project(camera);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const halfHeight = Math.tan(rad(fov) / 2) * distance;
    camera.matrixWorld.extractBasis(right, up, p);
    target.addScaledVector(right, ((x0 + x1) / 2) * halfHeight * camera.aspect).addScaledVector(up, ((y0 + y1) / 2) * halfHeight);
    distance *= Math.max((x1 - x0) / 2 / fill[0], (y1 - y0) / 2 / fill[1]);
  }
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.matrixWorld.extractBasis(right, up, p);
  target.addScaledVector(up, 2 * drop * Math.tan(rad(fov) / 2) * distance);
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.lookAt(target);
  camera.near = distance * 0.2;
  camera.far = distance * 4;
  camera.updateProjectionMatrix();
  return target;
}

const parentQ = new THREE.Quaternion();
const localQ = new THREE.Quaternion();
function rotateBoneWorld(bone, q) {
  bone.parent.getWorldQuaternion(parentQ);
  localQ.copy(parentQ).invert().multiply(q).multiply(parentQ);
  bone.quaternion.premultiply(localQ);
  bone.updateMatrixWorld(true);
}

const smooth = x => x * x * (3 - 2 * x);

export async function createSloedlaView(container, { win = globalThis.window } = {}) {
  const calm = () => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const canvas = document.createElement('canvas');
  canvas.className = 'yatzy-sloedla-view';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(SHOT.fov, 16 / 10, 0.5, 100);
  const world = { scene, heightAt: () => 0, resolvePoint: (spec, out) => out.copy(spec) };
  let actor;
  try {
    actor = await createActor(world, { name: 'sloedla-yatzy', url: MODEL, position: [0, 0, 0], heading: 0 });
  } catch (error) {
    renderer.dispose();
    throw error;
  }

  actor.update(0);
  const points = posedPoints(actor.model);
  const target = frame(camera, points, SHOT);
  const radius = new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).length() / 2;
  const at = (az, el, d) => new THREE.Vector3(
    Math.cos(rad(el)) * Math.cos(rad(SHOT.az + az)), Math.sin(rad(el)), Math.cos(rad(el)) * Math.sin(rad(SHOT.az + az)),
  ).multiplyScalar(d).add(target);
  const key = new THREE.DirectionalLight(LIGHT.key.color, LIGHT.key.i);
  key.position.copy(at(LIGHT.key.az, LIGHT.key.el, radius * 3));
  key.target.position.copy(target);
  const fill = new THREE.DirectionalLight(LIGHT.fill.color, LIGHT.fill.i);
  fill.position.copy(at(LIGHT.fill.az, LIGHT.fill.el, radius * 3));
  fill.target.position.copy(target);
  scene.add(key, key.target, fill, fill.target, new THREE.HemisphereLight(LIGHT.hemi.sky, LIGHT.hemi.ground, LIGHT.hemi.i));
  scene.environment = skyLight(renderer);
  scene.environmentIntensity = LIGHT.env;
  scene.add(groundShadow(actor.size.x * 1.15, actor.size.z * 1.9));

  const child = camera.position.clone().lerp(target, 0.35);
  const diceSpot = target.clone().add(new THREE.Vector3(3.0, -1.6, 1.1));
  actor.lookAt(child, { weight: 0.55, maxAngle: 40, maxPitch: 20 });

  const head = actor.model.getObjectByName('Head');
  const neck = actor.model.getObjectByName('Neck');
  const layerBones = [head, neck].filter(Boolean);
  const saved = layerBones.map(bone => bone.quaternion.clone());
  let layered = false;
  const forward = new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();

  let thinking = 0;
  let thinkGoal = 0;
  let clock = 0;
  const timers = [];
  const later = (seconds, fn) => timers.push({ at: clock + seconds, fn });
  let clipUntil = 0;
  let talking = null;

  function applyLayer(dt) {
    thinking += (thinkGoal - thinking) * (1 - Math.exp(-dt / THINK.ease));
    if (head && thinking > 0.002 && !clipUntil) {
      const w = smooth(Math.min(1, thinking));
      if (neck) rotateBoneWorld(neck, q.setFromAxisAngle(up, rad(THINK.turn) * 0.5 * w));
      rotateBoneWorld(head, q.setFromAxisAngle(up, rad(THINK.turn) * 0.5 * w));
      rotateBoneWorld(head, q.setFromAxisAngle(forward, rad(THINK.tilt) * w));
      rotateBoneWorld(head, q.setFromAxisAngle(right, -rad(THINK.nod) * w));
      return true;
    }
    return false;
  }

  function update(dt) {
    clock += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at > clock) continue;
      const [{ fn }] = timers.splice(i, 1);
      fn();
    }
    if (clipUntil && clock >= clipUntil) {
      clipUntil = 0;
      actor.play('idle', { fade: 0.45 });
    }
    if (layered) layerBones.forEach((bone, i) => bone.quaternion.copy(saved[i]));
    actor.update(dt);
    layerBones.forEach((bone, i) => saved[i].copy(bone.quaternion));
    layered = applyLayer(dt);
  }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(2, win?.devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  watcher?.observe(container);
  container.append(canvas);
  resize();

  let frameId = 0;
  let last = 0;
  function loop(now) {
    frameId = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    update(dt);
    renderer.render(scene, camera);
  }
  update(0);
  renderer.render(scene, camera);

  return {
    canvas,
    start() {
      if (frameId) return;
      last = 0;
      frameId = requestAnimationFrame(loop);
    },
    stop() {
      cancelAnimationFrame(frameId);
      frameId = 0;
    },
    talk(line) {
      if (!line?.mouth) return;
      if (talking) actor.stopTalking(talking);
      talking = actor.talk({ mouth: line.mouth, duration: line.duration });
    },
    think(on) {
      thinkGoal = on ? 1 : 0;
      actor.lookAt(on ? diceSpot : child, { weight: on ? 0.4 : 0.55, maxAngle: 40, maxPitch: 20 });
    },
    /** Slóeðla blows her crest horn ('call' clip, 5.0 s). */
    call() {
      if (calm()) return;
      thinkGoal = 0;
      actor.play('call', { fade: 0.25 });
      clipUntil = clock + CALL_SECONDS;
    },
    /** Slóeðla rears up on her hind legs in joy ('happy' clip, 2.4 s). */
    hop() {
      if (calm()) return;
      actor.play('happy', { fade: 0.2 });
      clipUntil = clock + HOP_SECONDS;
    },
    /** A friendly double nod ('kink' clip, 2.4 s). */
    nod() {
      if (calm()) return;
      actor.play('kink', { fade: 0.2 });
      clipUntil = clock + NOD_SECONDS;
    },
    /** End-of-game celebration: rears up and blows her crest horn! */
    cheer(seconds = 5.0) {
      thinkGoal = 0;
      actor.lookAt(child, { weight: 0.55, maxAngle: 40, maxPitch: 20 });
      if (calm()) return;
      actor.play('call', { fade: 0.25 });
      clipUntil = clock + seconds;
    },
    rest() {
      thinkGoal = 0;
      timers.length = 0;
      if (clipUntil) {
        clipUntil = 0;
        actor.play('idle', { fade: 0.35 });
      }
      if (talking) actor.stopTalking(talking);
      actor.lookAt(child, { weight: 0.55, maxAngle: 40, maxPitch: 20 });
    },
    later,
    dispose() {
      this.stop();
      watcher?.disconnect();
      canvas.remove();
      renderer.dispose();
    },
  };
}
