import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { Handle } from './handle.js';
import { createFooting, stopCost } from './footing.js';

// A character in a scene: a rigged GLB with its clips, standing on the ground. Clips cross-fade;
// walking follows a smooth path at a speed matched to the walk cycle, and footing (footing.js) keeps
// a planted foot where it is, so walks, curves, stops and turns on the spot do not drag the feet; the
// head can turn toward a point on top of whatever clip plays. Everything advances in update(dt) on
// the game clock, so scenes pause and seek exactly.
//
// Headings are degrees: 0 faces +X and 90 faces +Z (models are authored facing +X).

const loader = new GLTFLoader();
const cache = new Map();
const FORWARD = new THREE.Vector3(1, 0, 0);
const FEET = ['FrontFoot.L', 'FrontFoot.R', 'BackFoot.L', 'BackFoot.R'];
const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const clamp = THREE.MathUtils.clamp;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

function loadTemplate(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

// GLTFLoader strips reserved characters from node names ('FrontFoot.L' becomes 'FrontFootL').
const findBone = (model, name) => model.getObjectByName(name) ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

// Turn a bone by a world-space rotation about its own pivot.
const parentQ = new THREE.Quaternion();
const localQ = new THREE.Quaternion();
function rotateBoneWorld(bone, q) {
  bone.parent.getWorldQuaternion(parentQ);
  localQ.copy(parentQ).invert().multiply(q).multiply(parentQ);
  bone.quaternion.premultiply(localQ);
  bone.updateMatrixWorld(true);
}

// How fast the body must move for the walk clip's feet to stay planted, and the point of the cycle
// to arrive at. During stance a foot sweeps backward relative to the body, so speed = backward
// travel / stance time, averaged over the feet. The arrival phase is the one that leaves footing
// the least stepping when the walk stops (`rest`: each foot's bind-pose spot in the model's frame).
// The sampled feet (`feet`: per foot, samples + 1 points over the cycle) let footing follow the
// clip's own steps while the clip is still cross-fading in.
function measureGait(model, clip, feet, rest) {
  if (!clip || !feet.length) return null;
  const probe = new THREE.AnimationMixer(model);
  probe.clipAction(clip).play();
  const samples = 120;
  const tracks = feet.map(() => []);
  const p = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  for (let i = 0; i <= samples; i++) {
    probe.setTime((i / samples) * clip.duration);
    model.updateMatrixWorld(true);
    inverse.copy(model.matrixWorld).invert();
    feet.forEach((foot, k) => tracks[k].push(foot.getWorldPosition(p).applyMatrix4(inverse).clone()));
  }
  probe.stopAllAction();
  probe.uncacheRoot(model);
  const dt = clip.duration / samples;
  let sum = 0;
  for (const track of tracks) {
    let back = 0;
    let stance = 0;
    for (let i = 1; i <= samples; i++) {
      const dx = track[i].x - track[i - 1].x;
      if (dx < 0) { back -= dx; stance += dt; }
    }
    sum += stance > 0 ? back / stance : 0;
  }
  const naturalSpeed = sum / tracks.length;
  let stopPhase = 0;
  let least = Infinity;
  for (let i = 0; i < samples; i++) {
    const cost = stopCost(tracks.map((track, k) => ({ ahead: track[i].x - rest[k].x, down: track[i].y - rest[k].y < 0.003 })));
    if (cost < least - 1e-9) { least = cost; stopPhase = i / samples; }
  }
  const duty = tracks.reduce((sum, track, k) => sum + track.slice(1).filter(p => p.y - rest[k].y < 0.003).length / samples, 0) / tracks.length;
  return naturalSpeed > 0.01 ? { naturalSpeed, cycle: clip.duration, stopPhase, duty, feet: tracks } : null;
}

/** Load (or reuse) a character. `gltf` may be passed in instead of `url` (tests, preloaded assets). */
export async function createActor(world, { name, url, gltf: given, position = [0, 0, 0], heading = 0 }) {
  const gltf = given ?? await loadTemplate(url);
  const model = cloneSkinned(gltf.scene);
  const root = new THREE.Group();
  root.name = `Actor ${name}`;
  root.add(model);
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
  });

  // Bind-pose size in metres, for framing and the body-centre point.
  const bounds = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse(o => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  const centreLocal = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  // The head's forward axis in its own frame, read from the bind pose (model facing +X).
  const neck = findBone(model, 'Neck');
  const head = findBone(model, 'Head');
  const headForward = head ? FORWARD.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert()) : null;

  // The feet and their bind-pose spots; the legs swing from the height of the body's centre.
  const feet = FEET.map(n => findBone(model, n)).filter(Boolean);
  const restFeet = feet.map(foot => model.worldToLocal(foot.getWorldPosition(new THREE.Vector3())));
  const footing = createFooting({
    root,
    legs: feet.length === FEET.length ? feet.map(foot => ({ foot, girdle: foot.name.startsWith('Front') ? 0 : 1 })) : [],
    pivotHeight: centreLocal.y,
  });
  const legBones = new Set(feet.flatMap(foot => [foot.name, foot.parent.name]));
  const movesLegs = clip => clip.tracks.some(track => legBones.has(track.name.slice(0, track.name.lastIndexOf('.'))));

  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map(gltf.animations.map(c => [c.name, c]));
  let current = null;
  let gait; // measured the first time the actor walks

  function play(clipName, { fade = 0.4, timeScale = 1 } = {}) {
    const clip = clips.get(clipName);
    if (!clip) return null;
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    if (current && current !== action) {
      action.reset().play();
      current.crossFadeTo(action, fade, false);
    } else if (!current) {
      action.reset().play();
    }
    current = action;
    return action;
  }

  // The walk clip's own foot k (model frame) where `action` is now in the cycle.
  function gaitFoot(action, k, out) {
    const track = gait.feet[k];
    const u = ((((action.time / gait.cycle) % 1) + 1) % 1) * (track.length - 1);
    const i = Math.min(track.length - 2, Math.floor(u));
    return out.lerpVectors(track[i], track[i + 1], u - i);
  }

  const getHeading = () => deg(-root.rotation.y);
  const setHeading = h => { root.rotation.y = -rad(h); };

  function place(x, z, headingDeg = getHeading()) {
    root.position.set(x, world.heightAt(x, z), z);
    setHeading(headingDeg);
    root.updateMatrixWorld(true);
    footing.reset();
  }

  // Turn toward a heading at most `rate` deg/s, settling softly; returns the radians still to go.
  function turnToward(targetDeg, dt, rate) {
    const now = rad(getHeading());
    const delta = wrap(rad(targetDeg) - now);
    const step = Math.sign(delta) * Math.min(Math.abs(delta), rad(rate) * dt, Math.abs(delta) * (1 - Math.exp(-dt * 5)));
    setHeading(deg(now + step));
    return Math.abs(delta - step);
  }

  // Walking and turning share the legs: starting one ends the other without a detour through idle.
  let walk = null;
  let turn = null;
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();

  // The walk is over: footing steps the feet from here (the planted ones stay where they are, the
  // lifted ones come down), and the body settles from the walk's last pose into the arrival clip.
  function arrive(w) {
    footing.stand();
    footing.aim(null);
    w.action?.setEffectiveTimeScale(0);
    play(w.arrive, { fade: w.fade });
  }

  function endWalk(settle) {
    if (!walk) return;
    const w = walk;
    walk = null;
    w.handle.onCancel = null;
    if (!w.handle.done) w.handle.cancel();
    if (settle) arrive(w);
  }

  function endTurn(settle) {
    if (!turn) return;
    const t = turn;
    turn = null;
    t.handle.onCancel = null;
    if (!t.handle.done) t.handle.cancel();
    if (settle) footing.aim(null);
  }

  /** Walk through [x, z] points along a smooth curve; the handle finishes on arrival. */
  function walkTo(points, { speed = 0.7, arrive: arriveClip = 'idle', fade = 0.5, turnRate = 70 } = {}) {
    const list = Array.isArray(points[0]) ? points : [points];
    const pts = [new THREE.Vector3(root.position.x, 0, root.position.z)];
    for (const [x, z] of list) {
      const p = new THREE.Vector3(x, 0, z);
      if (p.distanceTo(pts[pts.length - 1]) > 0.05) pts.push(p);
    }
    endTurn(false);
    const handle = new Handle(`${name} walk`);
    if (pts.length < 2) {
      // Already there: settle any walk in progress instead of leaving the clip looping.
      if (walk) endWalk(true);
      return handle.finish();
    }
    endWalk(false);
    handle.onCancel = () => { if (walk?.handle === handle) { const w = walk; walk = null; arrive(w); } };
    const curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : new THREE.LineCurve3(pts[0], pts[1]);
    const length = curve.getLength();
    if (gait === undefined) gait = measureGait(model, clips.get('walk'), feet, restFeet);
    const baseScale = gait ? clamp(speed / gait.naturalSpeed, 0.5, 3) : 1;
    const walking = current?.getClip() === clips.get('walk');
    const action = play('walk', { fade, timeScale: baseScale });
    if (action && gait && !walking) {
      // The clip advances in step with the distance walked, so starting it at the right point of
      // the cycle makes the walk end where the feet stand well (gait.stopPhase).
      const cycles = (baseScale / speed) * length / gait.cycle;
      action.time = ((((gait.stopPhase - cycles) % 1) + 1) % 1) * gait.cycle;
    }
    footing.walk(action && gait ? {
      foot: (k, out) => gaitFoot(action, k, out),
      stance: () => (gait.duty * gait.cycle) / Math.max(0.05, action.getEffectiveTimeScale()),
    } : null);
    walk = { curve, length, s: 0, t: 0, speed, baseScale, handle, arrive: arriveClip, fade, turnRate, action };
    return handle;
  }

  function updateWalk(dt) {
    const w = walk;
    if (!w) return;
    w.t += dt;
    const remaining = w.length - w.s;
    // Ease into the first steps and settle over the last metre, keeping the clip and ground in step.
    const factor = Math.min(1, 0.35 + (0.65 * w.t) / 0.7) * Math.min(1, 0.4 + 0.6 * remaining);
    w.action?.setEffectiveTimeScale(w.baseScale * factor);
    w.s = Math.min(w.length, w.s + w.speed * factor * dt);
    if (w.s >= w.length - 1e-4) {
      // Arriving this frame: hand the feet to footing before the body covers its last millimetres.
      walk = null;
      arrive(w);
      w.handle.finish();
    }
    const u = w.length > 0 ? w.s / w.length : 1;
    w.curve.getPointAt(u, point);
    w.curve.getTangentAt(Math.min(u, 0.999), tangent);
    turnToward(deg(Math.atan2(tangent.z, tangent.x)), dt, w.turnRate);
    root.position.set(point.x, world.heightAt(point.x, point.z), point.z);
  }

  function headingTo(spec) {
    const p = world.resolvePoint(Array.isArray(spec) && spec.length === 2 ? [spec[0], 0, spec[1]] : spec, new THREE.Vector3());
    return deg(Math.atan2(p.z - root.position.z, p.x - root.position.x));
  }

  /**
   * Turn on the spot toward a heading (degrees) or a point, stepping around with planted feet
   * (footing.js). Ends a walk. The handle finishes when he faces the goal; the last feet may still
   * be stepping into place.
   */
  function turnTo(target, { rate = 25, fade = 0.4 } = {}) {
    const goal = typeof target === 'number' ? target : headingTo(target);
    const walked = walk?.action;
    endWalk(false);
    endTurn(false);
    const handle = new Handle(`${name} turn`);
    handle.onCancel = () => { if (turn?.handle === handle) { turn = null; footing.aim(null); } };
    footing.stand();
    footing.aim(goal);
    walked?.setEffectiveTimeScale(0); // the body settles from where the walk stopped
    play('idle', { fade });
    turn = { goal, rate, handle, speed: 0 };
    return handle;
  }

  // The body turns at up to `rate` deg/s, settling softly, and no faster than the planted feet allow:
  // a foot that has fallen far behind holds the turn until it has stepped.
  function updateTurn(dt) {
    const t = turn;
    if (!t) return;
    const heading = getHeading();
    const left = deg(wrap(rad(t.goal - heading)));
    const want = Math.sign(left) * Math.min(t.rate, Math.abs(left) * 5);
    const allowed = want * footing.slack(heading, heading + t.speed * 0.3);
    t.speed += (allowed - t.speed) * (1 - Math.exp(-dt / 0.12));
    let step = t.speed * dt;
    step *= footing.slack(heading, heading + step);
    if (Math.abs(step) > Math.abs(left)) step = left;
    setHeading(heading + step);
    if (Math.abs(left - step) < 1) {
      turn = null;
      footing.aim(null);
      t.handle.finish();
    }
  }

  // Looking ------------------------------------------------------------------------------------
  // The look is laid over the animated pose each frame. The pose the mixer produced is saved and
  // restored first, because the mixer leaves a bone alone when its value has not changed (a paused
  // or frozen frame), and the look would otherwise pile up on itself.
  const lookBones = [neck, head].filter(Boolean);
  const animatedPose = lookBones.map(b => b.quaternion.clone());
  let lookApplied = false;
  const look = { spec: null, goal: 0, weight: 0, maxYaw: 55, maxPitch: 30, point: new THREE.Vector3(), smooth: new THREE.Vector3(), primed: false };
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const qc = new THREE.Quaternion();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();

  /** Turn the head toward a point spec (null to look ahead again). Neck and head share the turn. */
  function lookAt(spec, { weight = 1, maxAngle = 55, maxPitch = 30 } = {}) {
    look.spec = spec ?? null;
    look.goal = spec ? weight : 0;
    look.maxYaw = maxAngle;
    look.maxPitch = maxPitch;
  }

  function applyLook(dt) {
    look.weight += (look.goal - look.weight) * (1 - Math.exp(-dt / 0.4));
    if (!head || look.weight < 0.002) return false;
    if (look.spec) {
      try {
        world.resolvePoint(look.spec, look.point);
      } catch (error) {
        console.error(`[actor ${name}] look target dropped:`, error);
        look.spec = null;
        look.goal = 0;
      }
    }
    if (!look.primed) { look.smooth.copy(look.point); look.primed = true; }
    look.smooth.lerp(look.point, 1 - Math.exp(-dt / 0.25));
    root.updateMatrixWorld(true);
    // The wanted direction in the actor's own frame, limited in turn and tilt: a target behind
    // turns the head to its limit sideways instead of tipping it over.
    const headPos = head.getWorldPosition(v1);
    const local = v2.copy(look.smooth).sub(headPos).applyQuaternion(qa.copy(root.quaternion).invert());
    const yaw = clamp(Math.atan2(local.z, local.x), -rad(look.maxYaw), rad(look.maxYaw));
    const pitch = clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -rad(look.maxPitch), rad(look.maxPitch));
    const want = v2.set(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)).applyQuaternion(root.quaternion);
    const have = v3.copy(headForward).applyQuaternion(head.getWorldQuaternion(qa));
    qb.setFromUnitVectors(have, want);
    qc.identity().slerp(qb, look.weight);
    if (neck) rotateBoneWorld(neck, qa.identity().slerp(qc, 0.4));
    rotateBoneWorld(head, qa.identity().slerp(qc, 0.6));
    return true;
  }

  // --------------------------------------------------------------------------------------------
  place(position[0], position[2], heading);
  play('idle', { fade: 0 });
  world.scene.add(root);

  return {
    name, root, model, mixer, clips, size,
    get heading() { return getHeading(); },
    get walking() { return Boolean(walk); },
    get turning() { return Boolean(turn); },
    get gait() { return gait; },
    /** True while a foot is stepping into place (after a stop or a turn). */
    get stepping() { return footing.busy; },
    /** Play a clip; one that moves the legs gets them as it is (footing stops planting the feet). */
    play(clipName, options = {}) {
      const action = play(clipName, options);
      if (action && movesLegs(action.getClip())) footing.free(options.fade ?? 0.4);
      return action;
    },
    place, walkTo, turnTo, lookAt,
    /** Body centre in world space (from the bind-pose bounds). */
    centre(out = new THREE.Vector3()) {
      root.updateMatrixWorld();
      return out.copy(centreLocal).applyMatrix4(root.matrixWorld);
    },
    /** World position of the head bone (or a point above the body). */
    headPosition(out = new THREE.Vector3()) {
      if (head) return head.getWorldPosition(out);
      return this.centre(out).add(new THREE.Vector3(0, size.y * 0.4, 0));
    },
    update(dt) {
      if (lookApplied) lookBones.forEach((bone, i) => bone.quaternion.copy(animatedPose[i]));
      footing.restore();
      updateWalk(dt);
      updateTurn(dt);
      mixer.update(dt);
      footing.update(dt);
      lookBones.forEach((bone, i) => animatedPose[i].copy(bone.quaternion));
      lookApplied = applyLook(dt);
    },
    /** Stop walking, turning and looking; settle into idle. */
    stop() {
      if (walk) endWalk(true);
      if (turn) endTurn(true);
      lookAt(null);
    },
    dispose() { mixer.stopAllAction(); world.scene.remove(root); },
  };
}
