import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { Handle } from './handle.js';
import { sparkleBurst } from '../world/props/sparkles.js';

// Flugeðla's saddle (chapter 4 from scene 5, and the flug review chapter): Egill rides her on it, hands on its handlebar. The owner's
// Tripo model, made small by tools/blender-saddle.py and fitted to her back and bound to her bones by tools/saddle-fit.mjs, so it
// bends with her back and over her wing roots as she flies, as her skin does. The same saddle, fitted to Mosi's back
// (saddle-fit.mjs --host=mosi), is his (riding.js createSaddle builds on this).
//
//   const saddle = createFlierSaddle(her)   // her actor; the model loads (world.loadModel in the tests, three's loader on the page)
//   await saddle.loaded                      // true once it is on her (hidden); false where there is no model
//   saddle.show()                            // on her at once (flug: she is wearing it from the start)
//   yield saddle.appear()                    // or it pops on with a burst of sparkles, as Mosi's does in chapter 1
//   saddle.update(move)                      // its places in the world as she is posed now: { seat, grips, knees, ankles }
//
// It is a skinned mesh on her own skeleton (her bones, by the names in the file: extras.joints), next to her body in her model, so
// it is drawn with her, hidden with her, and drawn by the chapter's warm-up with her actor. Its places (where Egill's seat, hands,
// knees and ankles go) are bind-frame points with the saddle's weights there (extras.places), skinned the same way each time they
// are asked for. The pop grows it from the seat in the shader (a skinned mesh's own scale does not move its vertices). Where her
// wing roots swing up over her back (wings up or folded) no blend of her bones keeps the pad out of her, so the fit adds corrections:
// morph targets, each on as much as her upper arms are turned as in the pose it is for (correctionsAt), set each time it is drawn.

export const SADDLE_MODEL = new URL('../assets/characters/pteranodon-saddle.glb', import.meta.url).href;
const models = new Map(); // the page's loads by address: each saddle is a mesh of its own on a copy of the file's geometry
/** Grows from nothing past its size and settles back (riding.js: Mosi's saddle, the journal's star). */
const popIn = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const clamp01 = t => Math.min(1, Math.max(0, t));
const V3 = THREE.Vector3;
const SIDES = ['left', 'right'];

/**
 * How much of each of the saddle's corrections is on (its morph targets: tools/saddle-fit.mjs correctInPoses) as her bones are
 * turned now (`turnOf(name)`: a bone's turn in its parent, a Quaternion). Each correction is for one of her poses, and so is each
 * of the `clean` poses, which need none (extras.corrections, extras.clean: [{ at: { bone: quaternion }, radius }]). How far she is
 * from a pose is the most any of its bones is turned from its turn there; each pose counts by one over that squared, fading to
 * nothing at `radius` radians, and the counts are shared out (divided by their sum). So in one of the poses the saddle has exactly
 * that pose's correction (none in a clean pose), between poses a blend of the nearest, and none far from all of them. Into `out`.
 */
export function correctionsAt(corrections, clean, turnOf, out = []) {
  const count = c => {
    let far = 0;
    for (const name in c.at) {
      const q = turnOf(name), key = c.at[name];
      const dot = Math.abs(q.x * key[0] + q.y * key[1] + q.z * key[2] + q.w * key[3]);
      far = Math.max(far, 2 * Math.acos(Math.min(1, dot)));
    }
    const x = clamp01(1 - far / c.radius);
    return (x * x * (3 - 2 * x)) / (far * far + 1e-8);
  };
  out.length = corrections.length;
  let sum = 0;
  corrections.forEach((c, k) => { out[k] = count(c); sum += out[k]; });
  for (const c of clean) sum += count(c);
  for (let k = 0; k < out.length; k++) out[k] = sum > 0 ? out[k] / sum : 0;
  return out;
}

/** The body: the skinned mesh with the most vertices (not an eyelid or a shadow caster). */
function bodyOf(host) {
  let body = null;
  host.model.traverse(o => {
    if (o.isSkinnedMesh && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o;
  });
  if (!body) throw new Error(`${host.name} has no skin to put a saddle on`);
  return body;
}

/**
 * `url`: the fitted saddle's file (hers by default; riding.js gives Mosi's). `places`: its places as the file has them (extras.places),
 * to use until the file has loaded, so a rider can be seated on it from the first frame (riding.js: Mosi's, all on his Body bone).
 */
export function createFlierSaddle(host, { url = SADDLE_MODEL, places: early = null } = {}) {
  const body = bodyOf(host);
  const { bones, boneInverses } = body.skeleton;
  const world = host.world;
  let mesh = null;
  let spots = null; // name -> { bind, weights: [[bone, w]] }
  let shown = false;
  let disposed = false;
  let corrections = [];
  let clean = [];
  let correct = () => {};
  const uniforms = { popScale: { value: 1 }, popCentre: { value: new V3() } };
  const places = { seat: new V3(), grips: { left: new V3(), right: new V3() }, knees: { left: new V3(), right: new V3() }, ankles: { left: new V3(), right: new V3() } };
  // the file's places (bind frame, saddle-fit's) as points in her mesh's own frame with her bones' indices
  const spotsOf = (fitted, unbind) => {
    const spot = ({ bind, weights }) => ({
      bind: new V3(...bind).applyMatrix4(unbind),
      weights: Object.entries(weights).map(([name, w]) => [bones.findIndex(bone => bone.name === name), w]).filter(([b]) => b >= 0),
    });
    const out = { seat: spot(fitted.seat) };
    for (const side of SIDES) for (const part of ['grips', 'knees', 'ankles']) out[`${part}.${side}`] = spot(fitted[part][side]);
    return out;
  };
  if (early) {
    spots = spotsOf(early, body.bindMatrix.clone().invert());
    uniforms.popCentre.value.copy(spots.seat.bind);
  }

  const load = () => {
    if (world?.loadModel) return world.loadModel(url);
    if (typeof document === 'undefined') return null;
    if (!models.has(url)) models.set(url, new GLTFLoader().loadAsync(url));
    return models.get(url);
  };
  const loaded = Promise.resolve().then(load).then(gltf => { // a load that throws at once fails as one that fails later
    if (!gltf || disposed) return false;
    let source = null;
    gltf.scene.traverse(o => { if (o.isMesh && !source) source = o; });
    if (!source?.geometry.attributes.skinIndex) throw new Error(`${url} has no fitted saddle in it (tools/saddle-fit.mjs)`);
    const { joints, places: fitted } = source.userData;
    const slot = joints.map(name => {
      const index = bones.findIndex(bone => bone.name === name);
      if (index < 0) throw new Error(`${host.name} has no bone "${name}" for the saddle`);
      return index;
    });
    // her bones' places in her skeleton, for the file's joints; and the bind frame (saddle-fit's) into her mesh's own
    const geometry = source.geometry.clone();
    const skinIndex = geometry.attributes.skinIndex;
    for (let i = 0; i < skinIndex.count; i++) for (let k = 0; k < 4; k++) skinIndex.setComponent(i, k, slot[skinIndex.getComponent(i, k)]);
    // (her bindMatrix's own inverse: in the attached bind mode three keeps bindMatrixInverse as the inverse of her world matrix)
    const unbind = body.bindMatrix.clone().invert();
    geometry.applyMatrix4(unbind);
    const turn = new THREE.Matrix3().setFromMatrix4(unbind); // the corrections are moves (relative morph targets): turned only
    for (const target of geometry.morphAttributes.position ?? []) target.applyMatrix3(turn);
    spots = spotsOf(fitted, unbind);
    uniforms.popCentre.value.copy(spots.seat.bind);
    const material = source.material.clone();
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `uniform float popScale;\nuniform vec3 popCentre;\n${shader.vertexShader}`
        .replace('#include <skinning_vertex>', 'transformed = popCentre + (transformed - popCentre) * popScale;\n#include <skinning_vertex>');
    };
    material.customProgramCacheKey = () => 'flier-saddle';
    mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = `${host.name} saddle`;
    mesh.bind(body.skeleton, body.bindMatrix);
    mesh.bindMode = body.bindMode;
    mesh.castShadow = false; // a shadow would cost the shadow pass a draw call for a sliver on her back (as Mosi's)
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // as her body: its bounds are the bind pose's, not where she is
    mesh.visible = shown;
    // its corrections, on as her upper arms say each time it is drawn (where her wing roots swing up over her back)
    corrections = source.userData.corrections ?? [];
    clean = source.userData.clean ?? [];
    if (corrections.length && mesh.morphTargetInfluences?.length === corrections.length) {
      const named = new Map(bones.map(bone => [bone.name, bone]));
      const turnOf = name => named.get(name).quaternion;
      for (const c of [...corrections, ...clean]) for (const name in c.at) if (!named.has(name)) throw new Error(`${host.name} has no bone "${name}" for the saddle's corrections`);
      correct = () => correctionsAt(corrections, clean, turnOf, mesh.morphTargetInfluences);
      mesh.onBeforeRender = correct;
    }
    body.parent.add(mesh);
    return true;
  }).catch(error => {
    console.warn(`[flier-saddle] ${host.name}'s saddle has no model, so she flies without it:`, error?.message ?? error);
    return false;
  });

  const skinned = new THREE.Matrix4();
  const tmp = new V3();
  /** A place in the world as her bones are now, then moved by `move` (a Matrix4) if given. */
  function at({ bind, weights }, out, move) {
    out.set(0, 0, 0);
    for (const [b, w] of weights) {
      skinned.multiplyMatrices(bones[b].matrixWorld, boneInverses[b]).multiply(body.bindMatrix);
      out.addScaledVector(tmp.copy(bind).applyMatrix4(skinned), w);
    }
    return move ? out.applyMatrix4(move) : out;
  }

  return {
    host,
    loaded,
    get mesh() { return mesh; },
    /** Its corrections' drivers (extras.corrections), in the order of its morph targets, and the poses that need none (extras.clean). */
    get corrections() { return corrections; },
    get clean() { return clean; },
    /** Sets its corrections as her bones are turned now (done each time it is drawn). */
    correct() { correct(); },
    /** On her and seen (or popping on). */
    get shown() { return shown; },
    /** Its places can be had: the model is on her (or its places were given). */
    get ready() { return Boolean(spots); },
    /** Its size, from its seat: 1 is as fitted (chapter 1's glitter swells Mosi's a little and back). */
    get size() { return uniforms.popScale.value; },
    set size(k) { uniforms.popScale.value = Math.max(1e-4, k); },
    places,
    /**
     * Its places in the world as her bones are now (her last pose: her model's world matrices must be current), each moved by `move`
     * if given (rideFlier: from her root as it was to where the flier has put it this frame). Null until the model is on her.
     */
    update(move = null) {
      if (!spots) return null;
      at(spots.seat, places.seat, move);
      for (const side of SIDES) {
        at(spots[`grips.${side}`], places.grips[side], move);
        at(spots[`knees.${side}`], places.knees[side], move);
        at(spots[`ankles.${side}`], places.ankles[side], move);
      }
      return places;
    },
    show() {
      shown = true;
      uniforms.popScale.value = 1;
      if (mesh) mesh.visible = true;
    },
    hide() {
      shown = false;
      if (mesh) mesh.visible = false;
    },
    /** It pops onto her back with a burst of sparkles over the seat. Returns a Handle that finishes when it has settled. */
    appear({ duration = 0.8 } = {}) {
      if (!world?.effects) throw new Error('the saddle\'s appear needs her world.effects (engine/effects.js), which main.js updates');
      const handle = new Handle(`${host.name} saddle appears`);
      shown = true;
      if (!mesh) { handle.finish(); return handle; } // no model: nothing to see
      host.model.updateMatrixWorld(true);
      const burst = at(spots.seat, new V3()).add(new V3(0, 0.12, 0));
      mesh.visible = true;
      uniforms.popScale.value = 1e-4;
      let t = 0;
      world.effects.add({
        update(dt) {
          if (handle.done) return false;
          t += dt;
          const k = clamp01(t / duration);
          uniforms.popScale.value = Math.max(1e-4, popIn(k));
          if (k < 1) return true;
          uniforms.popScale.value = 1;
          handle.finish();
          return false;
        },
      });
      handle.onCancel = () => { uniforms.popScale.value = 1; };
      sparkleBurst(world, burst, { duration, seed: `${host.name} saddle` });
      return handle;
    },
    dispose() {
      disposed = true;
      if (!mesh) return;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh = null;
    },
  };
}
