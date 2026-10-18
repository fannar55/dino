import * as THREE from 'three';
import { createActor } from '../actor.js';
import { addPlateGlow } from '../plate-glow.js';

// Kambeðla across the table of "Eitt!" (spec section 6): her own model, live, in a small three.js view of its own in her window at
// the top of the table (eitt.css: .eitt-kambedla), apart from the chapter's renderer. She is the chapter's own actor
// (engine/actor.js), so she breathes with her idle clip, blinks with her eyelids and talks with her jaw from a line's mouth track
// (lines.json), and her plates glow through the chapter's patch (engine/plate-glow.js). On top of that the view gives her the
// game's moves, each a call the table makes:
//   talk({ mouth, duration })   her mouth follows a line (lines.json's entry for it)
//   think(on)                   her head tilts and she looks down at her cards while she chooses
//   glow(colour, { hold })      her plates light in a card colour ('red' … 'blue', or any CSS colour), then fade
//   swish()                     a swish of her tail (she plays a skip)
//   hop()                       a happy hop (the child played well)
//   cheer()                     the end of a round: she hops on and on, her plates glowing in every colour in turn
// Everything moves on the view's own clock, which runs only between start() and stop(): the table stops her while the game is shut.
// The canvas is transparent, so the window's own soft clearing (eitt.css) is the sky and the meadow behind her.

const MODEL = new URL('../../assets/characters/stegosaurus.glb', import.meta.url).href;
const rad = THREE.MathUtils.degToRad;

/** The colours her plates glow in for each card colour: eitt.css's card colours, a little brighter, so they read by day. */
export const PLATE_COLOURS = Object.freeze({ red: '#ff4433', yellow: '#ffc93a', green: '#62d94e', blue: '#4d9dff' });
const RESTING = '#ab85c1'; // the chapter's lilac, her own glow
const GLOW_STRENGTH = 1.6; // the glow is added to the plates' own lilac: strong enough that the card colour wins over it

// Where the camera looks from: az is degrees round her (0 in front of her, 90 at her right side), el degrees above the level, fill
// how much of the frame she takes, and drop how far (a share of the frame's height) she sits lower than the middle: her cards
// stand in front of the window's lower edge, so her feet go behind them and her face and plates have the window.
const SHOT = { az: 36, el: 8, fov: 26, fill: [1.02, 1.02], drop: 0.11 };
const LIGHT = {
  key: { az: -28, el: 54, i: 2.7, color: '#ffe2b5' },
  fill: { az: 70, el: 14, i: 0.6, color: '#c9d8e8' },
  hemi: { i: 1.0, sky: '#cfe3f2', ground: '#c9b98a' },
  env: 0.5,
};
const THINK = { tilt: 13, nod: 7, turn: -10, ease: 0.28 }; // degrees the head rolls, dips and turns toward her cards; seconds to get there
const SWISH = { swing: 84, lift: 30, seconds: 1.0 }; // degrees the tail swings and rises, spread along its bones
const HOP_SECONDS = 1.5; // the length of her happy clip

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

/** A soft round shadow on the ground under her, in the style guide's shade colour (never black). */
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

/** Points of her skin as she stands now, every `step`th vertex, in world space: what the camera frames. */
function posedPoints(model, step = 7) {
  const out = [];
  const v = new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse(o => {
    if (!o.isSkinnedMesh || !o.geometry.attributes._platerow) return;
    const count = o.geometry.attributes.position.count;
    for (let i = 0; i < count; i += step) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      out.push(v.clone());
    }
  });
  return out;
}

/** Puts the camera where she takes `fill` of the frame, `drop` below the middle, looking from the shot's azimuth and elevation. */
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
  return target;
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
 * Kambeðla's view in `container` (her window: a canvas fills it). Resolves once she is loaded and drawn, or rejects when there is no
 * WebGL or no model (the table keeps her picture then). `win` is the window, asked about less motion: with it she still breathes,
 * blinks, talks and glows, but neither hops nor swishes.
 */
export async function createKambedlaView(container, { win = globalThis.window } = {}) {
  const calm = () => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const canvas = document.createElement('canvas');
  canvas.className = 'eitt-kambedla-view';
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
    actor = await createActor(world, { name: 'kambedla-eitt', url: MODEL, position: [0, 0, 0], heading: 0 });
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  const glow = addPlateGlow(actor, { colour: RESTING, dull: 0 }); // her plates keep their own colour until they glow

  // The camera frames her as she stands in her idle clip, and the light is measured from it, as on the book's renders.
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

  // She looks at the child (just in front of the camera) unless she is thinking over her cards.
  const child = camera.position.clone().lerp(target, 0.35);
  const cards = target.clone().add(new THREE.Vector3(3.2, -1.6, 1.2)); // low in front of her, where her cards would lie
  actor.lookAt(child, { weight: 0.55, maxAngle: 40, maxPitch: 20 });

  // The game's own layer over the actor's pose: the thinking tilt and the tail swish. The pose the actor left is saved before the
  // layer goes on and put back before the next update, so the layer never piles up on itself (a frame with no time passing, say).
  const head = actor.model.getObjectByName('Head');
  const neck = actor.model.getObjectByName('Neck');
  const tail = [];
  actor.model.traverse(o => { if (o.isBone && /^Tail\d+$/.test(o.name)) tail.push(o); });
  tail.sort((a, b) => Number(a.name.slice(4)) - Number(b.name.slice(4)));
  const layerBones = [head, neck, ...tail].filter(Boolean);
  const saved = layerBones.map(bone => bone.quaternion.clone());
  let layered = false;
  const forward = new THREE.Vector3(1, 0, 0); // heading 0: she faces +X, her right side is +Z
  const right = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();

  let thinking = 0; // 0 to 1, easing toward `thinkGoal`
  let thinkGoal = 0;
  let swishT = -1; // seconds into a swish, or -1
  let clock = 0;
  const timers = []; // { at, fn }: things to do later on the view's clock
  const later = (seconds, fn) => timers.push({ at: clock + seconds, fn });
  let hopUntil = 0; // the happy clip plays until this time on the view's clock
  let glowUntil = 0; // the plates fade at this time
  let rainbow = null; // { until, next, i } while she cheers
  let talking = null;

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
    if (swishT >= 0 && tail.length) {
      swishT += dt;
      const x = Math.min(1, swishT / SWISH.seconds);
      const swing = rad(SWISH.swing) * Math.sin(2 * Math.PI * x) * Math.sin(Math.PI * x);
      const lift = rad(SWISH.lift) * Math.sin(Math.PI * x);
      for (const bone of tail) {
        rotateBoneWorld(bone, q.setFromAxisAngle(up, swing / tail.length));
        rotateBoneWorld(bone, q.setFromAxisAngle(right, -lift / tail.length));
      }
      if (x >= 1) swishT = -1;
      any = true;
    }
    return any;
  }

  function update(dt) {
    clock += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at > clock) continue;
      const [{ fn }] = timers.splice(i, 1);
      fn();
    }
    if (hopUntil && clock >= hopUntil) {
      hopUntil = 0;
      actor.play('idle', { fade: 0.5 });
    }
    if (rainbow && clock >= rainbow.next) {
      if (clock >= rainbow.until) {
        rainbow = null;
        glow.setAll(0, { duration: 1 });
      } else {
        glow.colour.set(Object.values(PLATE_COLOURS)[rainbow.i++ % 4]).multiplyScalar(GLOW_STRENGTH);
        rainbow.next = clock + 0.42;
      }
    }
    if (glowUntil && clock >= glowUntil && !rainbow) {
      glowUntil = 0;
      glow.setAll(0, { duration: 0.9 });
    }
    if (layered) layerBones.forEach((bone, i) => bone.quaternion.copy(saved[i]));
    actor.update(dt);
    glow.update(dt);
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
    /** Her mouth follows a line: lines.json's { mouth, duration } for it. Without a mouth track she stays quiet. */
    talk(line) {
      if (!line?.mouth) return;
      if (talking) actor.stopTalking(talking);
      talking = actor.talk({ mouth: line.mouth, duration: line.duration });
    },
    /** She thinks over her cards (true), or looks up at the child again (false). */
    think(on) {
      thinkGoal = on ? 1 : 0;
      actor.lookAt(on ? cards : child, { weight: on ? 0.4 : 0.55, maxAngle: 40, maxPitch: 20 });
    },
    /** Her plates light in `colour` (a card colour's name, or any CSS colour) for `hold` seconds, then fade. */
    glow(colour, { hold = 1.8 } = {}) {
      rainbow = null;
      glow.colour.set(PLATE_COLOURS[colour] ?? colour).multiplyScalar(GLOW_STRENGTH);
      glow.setAll(1, { duration: 0.3 });
      glowUntil = clock + hold;
    },
    /** A swish of her tail. */
    swish() {
      if (!calm()) swishT = 0;
    },
    /** A happy hop. */
    hop() {
      if (calm()) return this.glow(RESTING, { hold: 1 });
      actor.play('happy', { fade: 0.2 });
      hopUntil = clock + HOP_SECONDS;
    },
    /** She cheers at the end of a round: hopping for `seconds`, her plates glowing in every colour in turn. */
    cheer(seconds = 4.5) {
      thinkGoal = 0;
      actor.lookAt(child, { weight: 0.55, maxAngle: 40, maxPitch: 20 });
      glow.setAll(1, { duration: 0.3 });
      rainbow = { until: clock + seconds, next: clock, i: 0 };
      if (calm()) return;
      actor.play('happy', { fade: 0.2 });
      hopUntil = clock + seconds;
    },
    /** Back to rest: no thinking, no glow, no hop (a new round, or the game shut mid-move). */
    rest() {
      thinkGoal = 0;
      rainbow = null;
      glowUntil = 0;
      swishT = -1;
      timers.length = 0;
      glow.setAll(0, { duration: 0.3 });
      if (hopUntil) {
        hopUntil = 0;
        actor.play('idle', { fade: 0.4 });
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
