// Flugeðla og fiðrildið's players (chapters/flugedla3d.js): Flugeðla with no saddle and no rider, posed each frame where the page
// says (her body's middle or her beak tip at a place in the camera's frame, turned to the camera's heading), her neck stretched and
// her wings tucked or swept in code (no new art: the tuck is her own standing clip's wing pose, laid over her flight); the pale hero
// butterfly (butterfly.glb, posed directly here, bigger than the trial's); the leaves off a trunk; and the white of the cloud, a
// sheet at the screen plane in front of everything behind it.
import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { rotateBoneWorld } from '../../engine/actor.js';
import { BODY_HEIGHT } from '../kafli4-route.js';
import { guardBones } from '../gramedla3d/pose.js';
import { createHaze } from '../gramedla3d/haze.js';

const rad = d => (d * Math.PI) / 180;
export const BODY_LOCAL = [0.06, BODY_HEIGHT, 0]; // her body's middle in her root's frame (kafli4-route.js)
export const BUTTERFLY_SPAN = 0.56; // m tip to tip with its wings flat (chosen on the key frames: 5 % of the frame's width or more wherever it leads, 2 to 3.9 % out)
const BUTTERFLY_MODEL = new URL('../../assets/critters/butterfly.glb', import.meta.url).href;
// the wing chain, each side: the bones the tuck lays her standing pose over, and the sweep turns back
const WING = ['UpperArm', 'Forearm', 'Wrist', 'Finger1', 'Finger2', 'Finger3'];

let loader = null;
const loadModel = (world, url) => (world.loadModel ? world.loadModel(url) : (loader ??= new GLTFLoader()).loadAsync(url));

export function createCast(world, { her, at }) {
  const scene = world.scene;
  // ---- Flugeðla ----
  const herRoot = { position: new THREE.Vector3(0, -50, 0), quaternion: new THREE.Quaternion() };
  her.control(() => { her.root.position.copy(herRoot.position); her.root.quaternion.copy(herRoot.quaternion); });
  const bone = n => her.model.getObjectByName(n);
  const necks = ['Neck', 'Neck2', 'Neck3'].map(bone).filter(Boolean);
  const wings = { L: WING.map(n => bone('Left' + n)).filter(Boolean), R: WING.map(n => bone('Right' + n)).filter(Boolean) };
  const guard = guardBones([...necks, ...wings.L, ...wings.R]);
  const head = bone('Head');
  // the tuck: each wing bone's rotation in her standing clip (its first key), where her wings are folded at her sides
  const folded = new Map();
  const idle = her.clips.get('idle');
  if (idle) for (const track of idle.tracks) {
    const [name, prop] = track.name.split('.');
    if (prop === 'quaternion' && [...wings.L, ...wings.R].some(b => b.name === name)) folded.set(name, new THREE.Quaternion().fromArray(track.values, 0));
  }
  // her body mesh (her largest skinned mesh) and her beak tip (its forward-most vertex skinned to the head, in the head's frame)
  const herBody = () => {
    let best = null;
    her.model.traverse(o => { if (o.isSkinnedMesh && (!best || o.geometry.attributes.position.count > best.geometry.attributes.position.count)) best = o; });
    return best;
  };
  let beakLocal = null;
  function findBeak() {
    her.root.updateMatrixWorld(true);
    const mesh = herBody();
    mesh.skeleton.update();
    const list = mesh.skeleton.bones;
    const ofHead = new Set();
    head.traverse(o => { const j = list.indexOf(o); if (j >= 0) ofHead.add(j); });
    const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(her.root.quaternion);
    let best = -Infinity, tip = null;
    const p = new THREE.Vector3();
    for (let i = 0; i < si.count; i++) {
      let top = 0, w = -1;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); top = si.getComponent(i, k); }
      if (!ofHead.has(top)) continue;
      mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld);
      if (p.dot(fwd) > best) { best = p.dot(fwd); tip = p.clone(); }
    }
    return head.worldToLocal(tip);
  }
  const beak = (out = new THREE.Vector3()) => out.copy(beakLocal).applyMatrix4(head.matrixWorld);

  const now = { neck: 0, tuck: 0, sweep: 0, beak: null };
  const right = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Quaternion(), dv = new THREE.Vector3();
  her.setOverlay(() => {
    guard.begin();
    her.root.updateMatrixWorld(true);
    if (now.neck) {
      right.set(0, 0, 1).applyQuaternion(her.root.quaternion);
      for (const b of necks) rotateBoneWorld(b, q.setFromAxisAngle(right, -rad(now.neck) / necks.length));
    }
    if (now.tuck > 0) for (const b of [...wings.L, ...wings.R]) { const f = folded.get(b.name); if (f) b.quaternion.slerp(f, now.tuck); }
    if (now.sweep) {
      // each wing turned back about her own up: the left one way, the right the other
      her.root.updateMatrixWorld(true);
      up.set(0, 1, 0).applyQuaternion(her.root.quaternion);
      if (wings.L[0]) rotateBoneWorld(wings.L[0], q.setFromAxisAngle(up, rad(now.sweep)));
      if (wings.R[0]) rotateBoneWorld(wings.R[0], q.setFromAxisAngle(up, -rad(now.sweep)));
    }
    guard.end();
    if (now.beak && beakLocal) {
      her.root.updateMatrixWorld(true);
      dv.copy(now.beak).sub(beak());
      if (dv.lengthSq() > 1e-10) {
        herRoot.position.add(dv);
        her.root.position.copy(herRoot.position);
        her.root.updateMatrixWorld(true);
      }
    }
  });

  let action = null, haze = null;
  const e = new THREE.Euler(), qPitch = new THREE.Quaternion(), qBank = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0), body = new THREE.Vector3(), want = new THREE.Vector3();
  /**
   * Her pose this frame, or null (hidden): { body: [u, v, k] or beak: [u, v, k] (in the camera's frame), yaw (degrees: 0 facing the
   * camera, + turned to her left, our right), pitch (nose up), bank (her right wing down), neck (degrees: + stretched forward and
   * down), clip, at (its second), tuck (0-1), sweep (degrees back), haze }; `heading` is the camera's (degrees).
   */
  function poseHer(spec, heading) {
    if (!spec) { herRoot.position.set(0, -50, 0); her.root.visible = false; now.beak = null; return; }
    her.root.visible = true;
    haze ??= createHaze(her.model);
    haze.set(spec.haze ?? 0, 1);
    const clip = her.clips.get(spec.clip ?? 'fly') ?? her.clips.get('fly');
    if (!action || action.getClip() !== clip) action = her.play(clip.name, { fade: 0, timeScale: 0 });
    action.time = (spec.at ?? 0) % clip.duration;
    herRoot.quaternion.setFromEuler(e.set(0, -rad(90 + (spec.yaw ?? 0) + heading), 0))
      .multiply(qPitch.setFromAxisAngle(Z, rad(spec.pitch ?? 0)))
      .multiply(qBank.setFromAxisAngle(X, rad(spec.bank ?? 0)));
    her.root.quaternion.copy(herRoot.quaternion);
    now.neck = spec.neck ?? 0;
    now.tuck = spec.tuck ?? 0;
    now.sweep = spec.sweep ?? 0;
    if (spec.beak) {
      if (!beakLocal) { her.root.position.set(0, 3, -10); her.mixer.update(0); beakLocal = findBeak(); }
      now.beak = at(...spec.beak, want);
      // a first guess for the root (the overlay moves her so the beak tip lands exactly, after her clip, neck and wings)
      body.set(...BODY_LOCAL).applyQuaternion(herRoot.quaternion);
      herRoot.position.copy(want).sub(body).addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(herRoot.quaternion), -2.2);
    } else {
      now.beak = null;
      body.set(...BODY_LOCAL).applyQuaternion(herRoot.quaternion);
      // spec.world: her body's middle at a world point (the fast trial, fjor-play.js), else at [u, v, k] in the camera's frame
      herRoot.position.copy(spec.world ?? at(...spec.body, want)).sub(body);
    }
    her.root.position.copy(herRoot.position);
  }

  // ---- the butterfly: the hero's model, its own copy, posed here (its wings turn about its body's axis by `flap`) ----
  const bfly = new THREE.Group();
  bfly.name = 'flugedla3d butterfly';
  bfly.visible = false;
  scene.add(bfly);
  const bwings = { L: null, R: null };
  let span = 0;
  const butterflyReady = loadModel(world, BUTTERFLY_MODEL).then(gltf => {
    const model = gltf.scene.clone(true);
    model.traverse(o => {
      if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; }
      if (o.name === 'WingL') bwings.L = o;
      if (o.name === 'WingR') bwings.R = o;
    });
    const box = new THREE.Box3().setFromObject(model);
    span = Math.max(box.max.z - box.min.z, box.max.x - box.min.x);
    model.scale.setScalar(BUTTERFLY_SPAN / span);
    bfly.add(model);
  }).catch(error => console.warn('[flugedla3d] no butterfly:', error?.message ?? error));
  const bp = new THREE.Quaternion();
  /** The butterfly: { at: [u, v, k] } or { on: 'beak', lift }, yaw (degrees: 0 facing the camera), pitch (nose up), flap (radians). */
  function poseButterfly(spec, heading) {
    if (!spec) { bfly.visible = false; return; }
    bfly.visible = true;
    if (spec.on === 'beak' && beakLocal) beak(bfly.position).add(new THREE.Vector3(0, spec.lift ?? 0.07, 0));
    else at(...spec.at, bfly.position);
    bfly.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rad(90 + (spec.yaw ?? 0) + heading)).multiply(bp.setFromAxisAngle(Z, rad(spec.pitch ?? 0)));
    const flap = spec.flap ?? 0.5;
    if (bwings.L) bwings.L.rotation.x = flap;
    if (bwings.R) bwings.R.rotation.x = -flap;
  }

  // ---- the leaves: flat flecks in the forest's leaf colours, at world points ----
  const leafShape = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0);
    s.quadraticCurveTo(-0.1, 0.32, 0.5, 0);
    s.quadraticCurveTo(-0.1, -0.32, -0.5, 0);
    return new THREE.ShapeGeometry(s, 4);
  })();
  const LEAF_COLOURS = ['#8fbf4e', '#c9c24a', '#e8a33a', '#a8c95a', '#7fae45'].map(c => new THREE.Color(c));
  const leaves = new THREE.InstancedMesh(leafShape, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), 80);
  leaves.count = 0;
  leaves.frustumCulled = false;
  scene.add(leaves);
  const m4 = new THREE.Matrix4(), lq = new THREE.Quaternion(), ls = new THREE.Vector3(), le = new THREE.Euler();
  /** Leaves at world points: [[x, y, z, size, spin], ...] or null. */
  function poseLeaves(points) {
    leaves.count = points ? Math.min(80, points.length) : 0;
    for (let i = 0; i < leaves.count; i++) {
      const [x, y, z, size, spin] = points[i];
      lq.setFromEuler(le.set(spin * 1.3, spin * 2.1, spin * 0.7));
      leaves.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), lq, ls.setScalar(size)));
      leaves.setColorAt(i, LEAF_COLOURS[i % LEAF_COLOURS.length]);
    }
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  }

  // ---- the white: a sheet at the screen plane, drawn after everything behind it and behind everything in front of it ----
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#f4f7f8', transparent: true, opacity: 0, depthWrite: false, fog: false }));
  sheet.renderOrder = 50;
  sheet.frustumCulled = false;
  scene.add(sheet);
  /** How white (0-1), the sheet D in front of the camera's place, covering the whole picture there. */
  function poseWhite(level, D, heading, camPos, tanHalfV) {
    sheet.visible = level > 0.001;
    sheet.material.opacity = level;
    const psi = rad(heading);
    sheet.position.set(camPos.x + Math.sin(psi) * D, camPos.y, camPos.z - Math.cos(psi) * D);
    sheet.rotation.set(0, -psi, 0);
    const h = 2 * D * tanHalfV * 1.6; // taller than any screen's picture there
    sheet.scale.set(h * 2.4, h, 1);
  }

  return { poseHer, poseButterfly, poseLeaves, poseWhite, herBody, beak: () => (beakLocal && her.root.visible ? beak() : null), butterflyReady, butterfly: bfly, get butterflySpan() { return span; }, her, herRoot, leaves, sheet };
}
