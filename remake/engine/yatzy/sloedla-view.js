import * as THREE from 'three';
import { createActor } from '../actor.js';

// Slóeðla (Parasaurolophus) across the table of "Risaeðlu-Yatzy!": her own Tripo model, live, in a dedicated three.js view
// inside her window at the top of the table (yatzy.css: .yatzy-sloedla). She uses engine/actor.js so she breathes with her
// idle clip, blinks with her eyelids, and moves her jaw when speaking. On top of that the view gives her the game's moves:
//   talk({ mouth, duration })   her bill follows a line's mouth track
//   watch(x)                    her eyes follow the dice: x from 0 (the tray's left die) to 1 (its right die); null: the child
//   sweep()                     her eyes run along the tray while the dice tumble
//   lean(x)                     she leans in toward a die the child holds (x as for watch)
//   think(on)                   she tilts her crested head and looks down at the dice while choosing
//   nod()                       a quick friendly nod (a row lights up)
//   slump()                     a cute slump, eyes half shut, when a row is taken for nothing
//   call()                      her signature crest horn call ('call' clip), her crest glowing gold while she blows
//   hop()                       her 2.4 s happy rear-up ('happy' clip)
//   cheer(seconds)              the end of a game: she rears up and calls in turn, her crest glowing
//   crestPoint()                where her crest's tip is in her window, { x, y } from 0 to 1, for the notes the table floats from it
// Between the moves she is never still: while the child plays she watches the dice and glances up at the camera every few seconds,
// and before a roll she looks at the child and glances down at the tray now and then.
// With less motion (prefers-reduced-motion) she breathes, blinks and glows, but neither rears up, calls, leans, nods, slumps,
// follows the dice nor glances: every move of hers is the crest's fade.

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
const LEAN = { seconds: 1.1, neck: 11, turn: -7, head: 4 }; // degrees she leans forward and turns toward the tray, and lifts her head back
const NOD = { seconds: 0.8, angle: 11 }; // two dips of the head
const SLUMP = { seconds: 1.9, neck: 15, head: 11, roll: 8 }; // degrees her neck and head droop and her head rolls
const GLANCE = { every: [3.2, 6.5], hold: [1.0, 1.6] }; // seconds between glances, and how long one lasts
const GLOW = { colour: '#ffd256', rise: 0.22, fall: 0.6 }; // her crest's glow and how fast it comes and goes (seconds)

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
const bump = x => Math.sin(Math.PI * Math.min(1, Math.max(0, x))); // 0 → 1 → 0 over a move

/** A soft round glow (or, with `star`, a four-pointed twinkle) drawn once on a canvas, for her crest's sprites. */
function glowTexture(star = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d');
  const gradient = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, star ? 'rgba(255, 250, 225, 1)' : 'rgba(255, 228, 140, 1)');
  gradient.addColorStop(star ? 0.12 : 0.35, 'rgba(255, 210, 100, 0.7)');
  gradient.addColorStop(1, 'rgba(255, 190, 70, 0)');
  c.fillStyle = gradient;
  if (star) {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 9 : 62;
      const a = (i / 8) * Math.PI * 2;
      c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  } else {
    c.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Where her crest is, as she stands now: the vertices that follow her head bone most, and of them the one farthest up and back
 * (she faces +X, so back is -X); the bill, forward of the bone, never wins. Returns { base, tip } in world space, or null.
 */
function findCrest(model, head) {
  if (!head) return null;
  model.updateMatrixWorld(true);
  const base = head.getWorldPosition(new THREE.Vector3());
  const tip = new THREE.Vector3();
  const v = new THREE.Vector3();
  let best = -Infinity;
  model.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const bone = o.skeleton.bones.indexOf(head);
    const index = o.geometry.attributes.skinIndex;
    const weight = o.geometry.attributes.skinWeight;
    if (bone < 0 || !index || !weight) return;
    for (let i = 0; i < index.count; i += 2) {
      let top = 0;
      let which = -1;
      for (let k = 0; k < 4; k++) {
        const w = weight.getComponent(i, k);
        if (w > top) { top = w; which = index.getComponent(i, k); }
      }
      if (which !== bone) continue;
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      const score = (v.y - base.y) * 0.6 - (v.x - base.x) * 0.8;
      if (score > best) { best = score; tip.copy(v); }
    }
  });
  return best > -Infinity ? { base, tip } : null;
}

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

  // Where she looks: the child (just in front of the camera), or a point on the tray below her window, from its left die to its
  // right one, measured along the camera's own right and up so the dice she looks at are where the child sees them.
  const child = camera.position.clone().lerp(target, 0.35);
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  camera.matrixWorld.extractBasis(camRight, camUp, new THREE.Vector3());
  const trayPoint = (x, out = new THREE.Vector3()) => out.copy(child).addScaledVector(camUp, -radius * 0.85).addScaledVector(camRight, (x - 0.5) * radius * 1.5);
  const diceSpot = trayPoint(0.5);
  const gaze = trayPoint(0.5); // the point she follows on the tray; moved, never replaced, so following it is smooth and blinkless
  const lookChild = () => actor.lookAt(child, { weight: 0.55, maxAngle: 40, maxPitch: 20 });
  const lookTray = () => actor.lookAt(gaze, { weight: 0.5, maxAngle: 40, maxPitch: 20 });
  lookChild();

  const head = actor.model.getObjectByName('Head');
  const neck = actor.model.getObjectByName('Neck');
  const layerBones = [head, neck].filter(Boolean);
  const saved = layerBones.map(bone => bone.quaternion.clone());
  let layered = false;
  const forward = new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();

  // Her crest's glow: a gold aura just behind her crest, so her head hides its middle and it rims the crest, and a twinkle at the
  // crest's tip in front; two sprites, drawn only while lit.
  const crest = findCrest(actor.model, head);
  const sprite = (texture, colour, depthTest) => new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, color: colour, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest, toneMapped: false, opacity: 0,
  }));
  const halo = sprite(glowTexture(), GLOW.colour, true);
  const twinkle = sprite(glowTexture(true), '#fff3c4', false);
  halo.visible = twinkle.visible = false;
  const tipLocal = new THREE.Vector3();
  const midLocal = new THREE.Vector3();
  let crestLength = 1;
  if (crest && head) {
    const scale = head.getWorldScale(new THREE.Vector3()).x || 1;
    crestLength = crest.base.distanceTo(crest.tip);
    midLocal.copy(head.worldToLocal(crest.base.clone().lerp(crest.tip, 0.6)));
    halo.scale.setScalar(crestLength * 1.8);
    tipLocal.copy(head.worldToLocal(crest.tip.clone()));
    twinkle.position.copy(tipLocal);
    twinkle.scale.setScalar((crestLength * 0.5) / scale);
    halo.renderOrder = twinkle.renderOrder = 5;
    scene.add(halo);
    head.add(twinkle);
  }
  const away = new THREE.Vector3();
  let glow = 0; // 0 to 1, easing toward glowGoal
  let glowGoal = 0;
  let glowUntil = 0;

  let thinking = 0;
  let thinkGoal = 0;
  let clock = 0;
  const timers = [];
  const later = (seconds, fn) => timers.push({ at: clock + seconds, fn });
  let clipUntil = 0;
  let talking = null;
  let leanT = -1; // seconds into a lean, or -1
  let nodT = -1;
  let slumpT = -1;
  let sweepT = -1; // seconds into a sweep of her eyes along the tray
  let mode = 'child'; // what she rests her eyes on between moves: 'child' or 'tray'
  let glancing = false;
  let glanceIn = GLANCE.every[0];
  let cheerUntil = 0;
  let cheerNext = 0;
  let cheerCall = false;
  const between = ([a, b]) => a + Math.random() * (b - a);

  function rest(where = mode) {
    if (where === 'tray') lookTray();
    else lookChild();
  }

  /** Her crest glows for `seconds` (0: until told), fading in and out. */
  function light(seconds) {
    glowGoal = 1;
    glowUntil = seconds ? clock + seconds : 0;
  }

  function applyLayer(dt) {
    thinking += (thinkGoal - thinking) * (1 - Math.exp(-dt / THINK.ease));
    if (!head || clipUntil) return false;
    let any = false;
    if (thinking > 0.002) {
      const w = smooth(Math.min(1, thinking));
      if (neck) rotateBoneWorld(neck, q.setFromAxisAngle(up, rad(THINK.turn) * 0.5 * w));
      rotateBoneWorld(head, q.setFromAxisAngle(up, rad(THINK.turn) * 0.5 * w));
      rotateBoneWorld(head, q.setFromAxisAngle(forward, rad(THINK.tilt) * w));
      rotateBoneWorld(head, q.setFromAxisAngle(right, -rad(THINK.nod) * w));
      any = true;
    }
    if (leanT >= 0) {
      leanT += dt;
      const x = leanT / LEAN.seconds;
      const w = smooth(bump(x));
      if (neck) {
        rotateBoneWorld(neck, q.setFromAxisAngle(right, -rad(LEAN.neck) * w));
        rotateBoneWorld(neck, q.setFromAxisAngle(up, rad(LEAN.turn) * w));
      }
      rotateBoneWorld(head, q.setFromAxisAngle(right, rad(LEAN.head) * w));
      if (x >= 1) leanT = -1;
      any = true;
    }
    if (nodT >= 0) {
      nodT += dt;
      const x = nodT / NOD.seconds;
      const dip = Math.max(0, Math.sin(x * Math.PI * 4)) * bump(x); // two dips, easing in and out
      rotateBoneWorld(head, q.setFromAxisAngle(right, -rad(NOD.angle) * dip));
      if (x >= 1) nodT = -1;
      any = true;
    }
    if (slumpT >= 0) {
      const before = slumpT / SLUMP.seconds;
      slumpT += dt;
      const x = slumpT / SLUMP.seconds;
      const w = x < 0.2 ? smooth(x / 0.2) : x < 0.7 ? 1 : smooth(Math.max(0, 1 - (x - 0.7) / 0.3)); // droops, stays, comes back up
      if (neck) rotateBoneWorld(neck, q.setFromAxisAngle(right, -rad(SLUMP.neck) * w));
      rotateBoneWorld(head, q.setFromAxisAngle(right, -rad(SLUMP.head) * w));
      rotateBoneWorld(head, q.setFromAxisAngle(forward, rad(SLUMP.roll) * w));
      if (before < 0.7 && x >= 0.7) actor.openEyes({ duration: 0.4 });
      if (x >= 1) slumpT = -1;
      any = true;
    }
    return any;
  }

  /** Her life between the moves: glances up at the camera while she watches the dice, and down at the tray while she waits. */
  function idle(dt) {
    if (calm() || thinkGoal || clipUntil || leanT >= 0 || slumpT >= 0 || sweepT >= 0 || cheerUntil) return;
    glanceIn -= dt;
    if (glanceIn > 0) return;
    glancing = !glancing;
    if (glancing) {
      if (mode === 'tray') lookChild();
      else {
        trayPoint(0.2 + Math.random() * 0.6, gaze);
        lookTray();
      }
      glanceIn = between(GLANCE.hold);
    } else {
      rest();
      glanceIn = between(GLANCE.every);
    }
  }

  function update(dt) {
    clock += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at > clock) continue;
      const [{ fn }] = timers.splice(i, 1);
      fn();
    }
    if (cheerUntil && clock >= cheerNext) {
      if (clock >= cheerUntil) {
        cheerUntil = 0;
      } else {
        cheerCall = !cheerCall;
        actor.play(cheerCall ? 'call' : 'happy', { fade: 0.3 });
        if (cheerCall) light(2.6);
        clipUntil = Math.min(cheerUntil, clock + (cheerCall ? 2.8 : HOP_SECONDS));
        cheerNext = clipUntil;
      }
    }
    if (clipUntil && clock >= clipUntil) {
      clipUntil = 0;
      actor.play('idle', { fade: 0.45 });
    }
    if (sweepT >= 0) {
      sweepT += dt;
      const x = Math.min(1, sweepT / 0.7);
      trayPoint(0.1 + 0.8 * smooth(x), gaze);
      if (x >= 1) sweepT = -1;
    }
    idle(dt);
    if (glowUntil && clock >= glowUntil) {
      glowUntil = 0;
      glowGoal = 0;
    }
    glow += (glowGoal - glow) * (1 - Math.exp(-dt / (glowGoal > glow ? GLOW.rise : GLOW.fall)));
    halo.visible = twinkle.visible = Boolean(crest) && glow > 0.01;
    if (halo.visible) {
      const shimmer = 0.85 + 0.15 * Math.sin(clock * 9);
      halo.material.opacity = 0.95 * glow * shimmer;
      twinkle.material.opacity = 0.9 * glow;
      twinkle.material.rotation = clock * 1.6;
    }
    if (layered) layerBones.forEach((bone, i) => bone.quaternion.copy(saved[i]));
    actor.update(dt);
    layerBones.forEach((bone, i) => saved[i].copy(bone.quaternion));
    layered = applyLayer(dt);
    if (halo.visible) {
      head.localToWorld(halo.position.copy(midLocal));
      away.copy(halo.position).sub(camera.position).normalize();
      halo.position.addScaledVector(away, crestLength * 0.45); // just behind the crest, as the camera sees it
    }
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
  // Her crest's sprites are built now, behind the first frame, so her first call does not stall while their shader compiles.
  halo.visible = twinkle.visible = Boolean(crest);
  renderer.compile(scene, camera);
  halo.visible = twinkle.visible = false;
  renderer.render(scene, camera);

  const tipWorld = new THREE.Vector3();
  return {
    canvas,
    renderer,
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
    /** Her eyes follow the dice: x from 0 (the left die) to 1 (the right); null: back to the child. */
    watch(x) {
      mode = x == null ? 'child' : 'tray';
      glancing = false;
      glanceIn = between(GLANCE.every);
      if (calm()) return;
      if (x != null) trayPoint(Math.min(1, Math.max(0, x)), gaze);
      if (!thinkGoal) rest();
    },
    /** Her eyes run along the tray while the dice tumble. */
    sweep() {
      mode = 'tray';
      glancing = false;
      if (calm()) return;
      sweepT = 0;
      trayPoint(0.1, gaze);
      if (!thinkGoal) lookTray();
    },
    /** She leans in toward the die at x (0 to 1 across the tray). */
    lean(x = 0.5) {
      this.watch(x);
      if (calm() || clipUntil) return;
      leanT = 0;
    },
    think(on) {
      thinkGoal = on ? 1 : 0;
      glancing = false;
      if (on) {
        mode = 'tray';
        gaze.copy(diceSpot);
        actor.lookAt(gaze, { weight: 0.4, maxAngle: 40, maxPitch: 20 });
      } else {
        rest();
      }
    },
    /** A quick friendly nod. */
    nod() {
      if (calm() || clipUntil || slumpT >= 0) return;
      nodT = 0;
    },
    /** A cute slump, her eyes half shut, and back up. */
    slump() {
      if (calm() || clipUntil) return;
      leanT = nodT = -1;
      slumpT = 0;
      actor.closeEyes(0.5, { duration: 0.25 });
    },
    /** Slóeðla blows her crest horn ('call' clip), her crest glowing; with less motion only the crest glows. */
    call() {
      light(2.8);
      if (calm()) return;
      thinkGoal = 0;
      leanT = nodT = slumpT = -1;
      actor.play('call', { fade: 0.25 });
      clipUntil = clock + CALL_SECONDS;
    },
    /** Slóeðla rears up on her hind legs in joy ('happy' clip, 2.4 s). */
    hop() {
      if (calm()) return;
      leanT = nodT = slumpT = -1;
      actor.play('happy', { fade: 0.2 });
      clipUntil = clock + HOP_SECONDS;
    },
    /** End of a game: she rears up and calls in turn for `seconds`, her crest glowing with each call. */
    cheer(seconds = 5.0) {
      thinkGoal = 0;
      mode = 'child';
      lookChild();
      if (calm()) {
        light(Math.min(seconds, 3));
        return;
      }
      leanT = nodT = slumpT = -1;
      cheerUntil = clock + seconds;
      cheerNext = clock;
      cheerCall = false;
    },
    /** Where her crest's tip is in her window now, { x, y } from 0 (left, top) to 1, or null. */
    crestPoint() {
      if (!crest || !head) return null;
      tipWorld.copy(tipLocal);
      head.localToWorld(tipWorld).project(camera);
      return { x: (tipWorld.x + 1) / 2, y: (1 - tipWorld.y) / 2 };
    },
    rest() {
      thinkGoal = 0;
      timers.length = 0;
      leanT = nodT = slumpT = sweepT = -1;
      cheerUntil = 0;
      glowGoal = 0;
      glowUntil = 0;
      mode = 'child';
      glancing = false;
      if (clipUntil) {
        clipUntil = 0;
        actor.play('idle', { fade: 0.35 });
      }
      actor.openEyes({ duration: 0.3 });
      if (talking) actor.stopTalking(talking);
      lookChild();
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
