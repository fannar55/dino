import * as THREE from 'three';
import { createActor } from '../actor.js';
import { mouthFromText } from '../talk.js';

// Uggeðla across the table of "Veiddu": her own model, live, in a small three.js view of its own in her window at the top left of the
// table (veiddu.css: .veiddu-uggedla, her canvas is .veiddu-uggedla-view), apart from the book's renderer, as Kambeðla's view is in
// "Eitt!" (engine/eitt/kambedla-view.js, which this follows). She is an actor (engine/actor.js): she breathes with her idle clip, blinks
// with her eyelids and talks with her jaw. On top of that the view gives her the game's moves, each a call the table makes:
//   talk({ mouth, duration })   her mouth follows a line's mouth track (lines.json's entry for it); without a track, `duration`
//                               seconds of a gentle neutral talking
//   think(on)                   her head tilts and she looks down at her cards while she chooses
//   splash()                    she dips toward the water (her kink clip, once) when anyone fishes
//   happy()                     she is glad (her happy clip, once): she laid a pair
//   cheer()                     the end of a round: her happy clip, on and on, until her next move (think, splash, happy or rest)
//   rest()                      back to calm: no thinking, no dip, no cheer (a new round, or the game shut mid-move)
// Everything moves on the view's own clock, which runs only between start() and stop(): the table stops her while the game is shut.
// The canvas is transparent, so the window's own soft clearing (veiddu.css) is the sky and the meadow behind her.

const MODEL = new URL('../../assets/characters/spinosaurus.glb', import.meta.url).href;
const rad = THREE.MathUtils.degToRad;

// Where the camera looks from: az is degrees round her (0 in front of her, 90 at her right side), el degrees above the level, fov the
// lens. Only her front is framed (the head and snout, the neck, the arms and the sail: `from` is where the framed part starts, a share
// of her length from the tail and a share of her height from the ground), taking `fill` of the frame across and up, and `drop` is how
// far (a share of the frame's height) she sits lower than the middle: her cards lie over the window's lower edge, so her legs go behind
// them and her face, arms and sail have the window.
const SHOT = { az: 48, el: 9, fov: 24, from: [0.2, 0.24], fill: [0.97, 0.84], drop: -0.04 };
const LIGHT = {
  key: { az: -28, el: 54, i: 2.7, color: '#ffe2b5' },
  fill: { az: 70, el: 14, i: 0.6, color: '#c9d8e8' },
  hemi: { i: 1.0, sky: '#cfe3f2', ground: '#c9b98a' },
  env: 0.5,
};
const THINK = { tilt: 12, nod: 5, turn: -8, ease: 0.28 }; // degrees the head rolls, dips and turns toward her cards; seconds to get there
const LOOK = { weight: 0.55, maxAngle: 40, maxPitch: 20 }; // how she looks at the child
const NOD = { dip: 9, seconds: 0.7 }; // with less motion the splash is a nod: degrees the head dips, and how long it takes
const NEUTRAL_RATE = 3.6; // syllables a second in her neutral talking

/** A soft sky for the light her colours bounce in, as the book's renders have it (tools/bake/book-render.js). */
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

/** Points of her skin as she stands now, every `step`th vertex, in world space: what the camera frames. */
function posedPoints(model, step = 5) {
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

/** The part of her the shot frames: what lies in front of `from[0]` of her length and above `from[1]` of her height. */
function framedPoints(points, from) {
  const box = new THREE.Box3().setFromPoints(points);
  const x0 = box.min.x + from[0] * (box.max.x - box.min.x);
  const y0 = box.min.y + from[1] * (box.max.y - box.min.y);
  return points.filter(p => p.x >= x0 && p.y >= y0);
}

/** Puts the camera where the points take `fill` of the frame, `drop` below the middle, looking from the shot's azimuth and elevation. */
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
  target.addScaledVector(up, 2 * drop * Math.tan(rad(fov) / 2) * distance); // looking higher puts her lower in the frame
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.lookAt(target);
  camera.near = distance * 0.2;
  camera.far = distance * 4;
  camera.updateProjectionMatrix();
  return { target, distance };
}

// Turn a bone by a world-space rotation about its own pivot (as engine/actor.js does).
const parentQ = new THREE.Quaternion();
const localQ = new THREE.Quaternion();
function rotateBoneWorld(bone, q) {
  bone.parent.getWorldQuaternion(parentQ);
  localQ.copy(parentQ).invert().multiply(q).multiply(parentQ);
  bone.quaternion.premultiply(localQ);
  bone.updateMatrixWorld(true);
}

const smooth = x => x * x * (3 - 2 * x);

/**
 * Uggeðla's view in `container` (her window: a canvas fills it). Resolves once she is loaded and drawn, or rejects when there is no
 * WebGL or no model (the table keeps her picture then). `win` is the window, asked about less motion: with it she still breathes,
 * blinks, talks and thinks, but dips her head a little instead of her whole kink.
 */
export async function createUggedlaView(container, { win = globalThis.window } = {}) {
  const calm = () => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const canvas = document.createElement('canvas');
  canvas.className = 'veiddu-uggedla-view';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(SHOT.fov, 16 / 10, 0.5, 200);
  const world = { scene, heightAt: () => 0, resolvePoint: (spec, out) => out.copy(spec) };
  let actor;
  try {
    actor = await createActor(world, { name: 'uggedla-veiddu', url: MODEL, position: [0, 0, 0], heading: 0 });
  } catch (error) {
    renderer.dispose();
    throw error;
  }

  // The camera frames her as she stands in her idle clip, and the light is measured from it, as on the book's renders.
  actor.update(0);
  const points = posedPoints(actor.model);
  const { target, distance } = frame(camera, framedPoints(points, SHOT.from), SHOT);
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

  // She looks at the child (just in front of the camera) unless she is thinking over her cards, which lie below her window.
  const child = camera.position.clone().lerp(target, 0.35);
  const cards = target.clone().add(new THREE.Vector3(0, -distance * 0.32, 0)).lerp(camera.position, 0.15);
  actor.lookAt(child, LOOK);

  // The game's own layer over the actor's pose: the thinking tilt and the nod. The pose the actor left is saved before the layer goes
  // on and put back before the next update, so the layer never piles up on itself (a frame with no time passing, say).
  const head = actor.model.getObjectByName('Head');
  const neck = actor.model.getObjectByName('Neck');
  const layerBones = [head, neck].filter(Boolean);
  const saved = layerBones.map(bone => bone.quaternion.clone());
  let layered = false;
  const forward = new THREE.Vector3(1, 0, 0); // heading 0: she faces +X, her right side is +Z
  const right = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();

  let thinking = 0; // 0 to 1, easing toward `thinkGoal`
  let thinkGoal = 0;
  let nodT = -1; // seconds into a nod, or -1
  let clock = 0;
  let cheering = false;
  let oneShot = ''; // a one-shot clip (kink, happy) plays until `oneShotUntil` on the view's clock
  let oneShotUntil = 0;
  let talking = null;
  const seconds = name => actor.clips.get(name)?.duration ?? 2.4;

  function applyLayer(dt) {
    thinking += (thinkGoal - thinking) * (1 - Math.exp(-dt / THINK.ease));
    let any = false;
    if (head && thinking > 0.002) {
      const w = smooth(Math.min(1, thinking));
      if (neck) rotateBoneWorld(neck, q.setFromAxisAngle(up, rad(THINK.turn) * 0.5 * w));
      rotateBoneWorld(head, q.setFromAxisAngle(up, rad(THINK.turn) * 0.5 * w));
      rotateBoneWorld(head, q.setFromAxisAngle(forward, rad(THINK.tilt) * w));
      rotateBoneWorld(head, q.setFromAxisAngle(right, -rad(THINK.nod) * w));
      any = true;
    }
    if (nodT >= 0 && head) {
      nodT += dt;
      const x = Math.min(1, nodT / NOD.seconds);
      rotateBoneWorld(head, q.setFromAxisAngle(right, -rad(NOD.dip) * Math.sin(Math.PI * x) ** 2));
      if (x >= 1) nodT = -1;
      any = true;
    }
    return any;
  }

  /** Plays a clip once (it loops by itself, so she goes back to her rest at its end). */
  function playOnce(name) {
    if (oneShotUntil && oneShot === name) return; // she is at it already
    actor.play(name, { fade: 0.25 });
    oneShot = name;
    oneShotUntil = clock + seconds(name);
  }
  const resting = () => actor.play(cheering ? 'happy' : 'idle', { fade: 0.4 });

  function update(dt) {
    clock += dt;
    if (oneShotUntil && clock >= oneShotUntil) {
      oneShotUntil = 0;
      resting();
    }
    if (layered) layerBones.forEach((bone, i) => bone.quaternion.copy(saved[i]));
    actor.update(dt);
    layerBones.forEach((bone, i) => saved[i].copy(bone.quaternion));
    layered = applyLayer(dt);
  }

  // Her canvas follows her window's size, drawn at up to twice the CSS pixels.
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
    actor,
    /** Her life goes on (the game is open). */
    start() {
      if (frameId) return;
      last = 0;
      frameId = requestAnimationFrame(loop);
    },
    /** She holds still, and nothing is drawn (the game is shut). */
    stop() {
      cancelAnimationFrame(frameId);
      frameId = 0;
    },
    /** Her mouth follows a line: lines.json's { mouth, duration } for it; with no track, a gentle neutral talking for `duration` seconds. */
    talk({ mouth = null, duration = 1.2 } = {}) {
      if (talking) actor.stopTalking(talking);
      const track = mouth || mouthFromText('Ba '.repeat(Math.max(1, Math.round(duration * NEUTRAL_RATE))).trim(), duration);
      talking = actor.talk({ mouth: track, duration });
    },
    /** She thinks over her cards (true), or looks up at the child again (false). */
    think(on) {
      thinkGoal = on ? 1 : 0;
      actor.lookAt(on ? cards : child, on ? { ...LOOK, weight: 0.45 } : LOOK);
    },
    /** She dips toward the water: her kink clip, once (with less motion, a nod of the head). */
    splash() {
      cheering = false;
      if (calm()) nodT = 0;
      else playOnce('kink');
    },
    /** She is glad: her happy clip, once. */
    happy() {
      cheering = false;
      if (calm()) nodT = 0;
      else playOnce('happy');
    },
    /** She cheers (the end of a round): her happy clip, on and on, until her next move. */
    cheer() {
      thinkGoal = 0;
      actor.lookAt(child, LOOK);
      cheering = true;
      oneShotUntil = 0;
      if (calm()) nodT = 0;
      else actor.play('happy', { fade: 0.25 });
    },
    /** Back to rest: no thinking, no dip, no cheer (a new round, or the game shut mid-move). */
    rest() {
      thinkGoal = 0;
      nodT = -1;
      cheering = false;
      oneShotUntil = 0;
      actor.play('idle', { fade: 0.4 });
      if (talking) actor.stopTalking(talking);
      actor.lookAt(child, LOOK);
    },
    dispose() {
      this.stop();
      watcher?.disconnect();
      canvas.remove();
      renderer.dispose();
    },
  };
}
