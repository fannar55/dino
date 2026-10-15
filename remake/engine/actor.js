import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { Handle } from './handle.js';
import { createFooting, stopCost, QUADRUPED, BIPED } from './footing.js';
import { createEyelids } from './eyelids.js';
import { createTalk } from './talk.js';

// A character in a scene: a rigged GLB with its clips, standing on the ground. Clips cross-fade;
// walking follows a smooth path at a speed matched to the walk cycle, and footing (footing.js) keeps
// a planted foot where it is, so walks, curves, stops and turns on the spot do not drag the feet, on
// four legs or two; the head can turn toward a point on top of whatever clip plays, the eyelids
// (eyelids.js) blink on their own and close as a scene asks, and while the character speaks a line its
// jaw and head move with the voice (talk.js). Everything advances in update(dt) on the game clock, so
// scenes pause and seek exactly.
//
// Headings are degrees: 0 faces +X and 90 faces +Z (models are authored facing +X).

const loader = new GLTFLoader();
const cache = new Map();
const FORWARD = new THREE.Vector3(1, 0, 0);
const FEET = ['FrontFoot.L', 'FrontFoot.R', 'BackFoot.L', 'BackFoot.R'];
// Bipeds baked by remake/tools/bake/bake-biped.js (thigh, shin and foot on each side).
const BIPED_FEET = ['LeftFoot', 'RightFoot'];
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

// The front of a foot's sole, in the foot's own frame: the furthest-forward point (+X) of the
// vertices the foot bone carries alone that touch the ground in the bind pose. Null if it has none.
function toeOf(model, foot) {
  let mesh = null;
  model.traverse(o => { if (o.isSkinnedMesh && o.skeleton.bones.includes(foot)) mesh = o; });
  if (!mesh) return null;
  const bone = mesh.skeleton.bones.indexOf(foot);
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const p = new THREE.Vector3();
  let toe = null;
  for (let i = 0; i < position.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === bone) w += skinWeight.getComponent(i, k);
    if (w < 0.999) continue;
    p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    if (p.y < 0.004 && (!toe || p.x > toe.x)) toe = p.clone();
  }
  return toe && foot.worldToLocal(toe.setZ(foot.getWorldPosition(p).z).setY(0));
}

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
// to arrive at. During stance a foot is down and sweeps backward relative to the body, so speed =
// backward travel / stance time, averaged over the feet (a heel peeling up about the toe is not
// stance: the ankle lifts). The arrival phase is the one that leaves footing the least stepping when
// the walk stops (`rest`: each foot's bind-pose spot in the root's frame). The sampled feet (`feet`:
// per foot, samples + 1 points over the cycle) let footing follow the clip's own steps while the
// clip is still cross-fading in. Everything is in the root's frame, in metres, so a model scaled to
// another size walks at its own speed; `tuning` is its footing's (scaled to its legs).
function measureGait(model, root, clip, feet, rest, tuning) {
  if (!clip || !feet.length) return null;
  const probe = new THREE.AnimationMixer(model);
  probe.clipAction(clip).play();
  const samples = 120;
  const tracks = feet.map(() => []);
  const p = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  for (let i = 0; i <= samples; i++) {
    probe.setTime((i / samples) * clip.duration);
    root.updateMatrixWorld(true);
    inverse.copy(root.matrixWorld).invert();
    feet.forEach((foot, k) => tracks[k].push(foot.getWorldPosition(p).applyMatrix4(inverse).clone()));
  }
  probe.stopAllAction();
  probe.uncacheRoot(model);
  const dt = clip.duration / samples;
  const lift = tuning.lift;
  const flat = lift / 4; // the speed is read where the foot is right down, before a heel starts up
  let sum = 0;
  tracks.forEach((track, k) => {
    let back = 0;
    let stance = 0;
    for (let i = 1; i <= samples; i++) {
      const dx = track[i].x - track[i - 1].x;
      if (dx < 0 && track[i].y - rest[k].y < flat && track[i - 1].y - rest[k].y < flat) { back -= dx; stance += dt; }
    }
    sum += stance > 0 ? back / stance : 0;
  });
  const naturalSpeed = sum / tracks.length;
  let stopPhase = 0;
  let least = Infinity;
  for (let i = 0; i < samples; i++) {
    const cost = stopCost(tracks.map((track, k) => ({ ahead: track[i].x - rest[k].x, down: track[i].y - rest[k].y < lift })), tuning);
    if (cost < least - 1e-9) { least = cost; stopPhase = i / samples; }
  }
  const duty = tracks.reduce((sum, track, k) => sum + track.slice(1).filter(p => p.y - rest[k].y < lift).length / samples, 0) / tracks.length;
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
    // Single-sided skins would cast shadows with their back faces, letting light leak into creases.
    o.material.shadowSide = THREE.FrontSide;
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
  const jaw = findBone(model, 'Jaw');
  const headForward = head ? FORWARD.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert()) : null;

  // The feet and their bind-pose spots. A quadruped's legs swing from the height of the body's
  // centre; a biped's bend at the knee (thigh, shin, foot), and its heels peel up about the toes.
  const quadFeet = FEET.map(n => findBone(model, n)).filter(Boolean);
  const quadruped = quadFeet.length === FEET.length;
  const feet = quadruped ? quadFeet : BIPED_FEET.map(n => findBone(model, n)).filter(Boolean);
  const biped = !quadruped && feet.length === BIPED_FEET.length;
  const restFeet = feet.map(foot => root.worldToLocal(foot.getWorldPosition(new THREE.Vector3())));
  const tuning = quadruped ? QUADRUPED : BIPED;
  let legs = [];
  if (quadruped) legs = feet.map(foot => ({ foot, girdle: foot.name.startsWith('Front') ? 0 : 1 }));
  else if (biped) legs = feet.map(foot => ({ foot, girdle: 0, jointed: true, toe: toeOf(model, foot) }));
  const footing = createFooting({ root, legs, pivotHeight: centreLocal.y, tuning });
  // A clip moves the legs when it turns or moves a leg bone away from its rest pose (a biped's clips
  // key every bone, most of them leaving the legs at rest).
  const legBones = new Map(legs.flatMap(({ foot, jointed }) => (jointed ? [foot, foot.parent, foot.parent.parent] : [foot, foot.parent]))
    .map(bone => [bone.name, { quaternion: bone.quaternion.clone(), position: bone.position.clone() }]));
  const movesLegs = clip => clip.tracks.some(track => {
    const dot = track.name.lastIndexOf('.');
    const rest = legBones.get(track.name.slice(0, dot))?.[track.name.slice(dot + 1)];
    if (!rest) return false;
    const values = track.values;
    for (let i = 0; i < values.length; i += values.length / track.times.length) {
      if (rest.isQuaternion && Math.abs(rest.x * values[i] + rest.y * values[i + 1] + rest.z * values[i + 2] + rest.w * values[i + 3]) < 1 - 1e-6) return true;
      if (rest.isVector3 && Math.hypot(values[i] - rest.x, values[i + 1] - rest.y, values[i + 2] - rest.z) > 1e-5) return true;
    }
    return false;
  });

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

  /**
   * Walk through points along a smooth curve; the handle finishes on arrival. A point is [x, z] or a
   * point spec (points.js: [x, y, z], 'mosi.head', { actor, part, offset, local }), taken where it is
   * when the walk starts.
   */
  function walkTo(points, { speed = 0.7, arrive: arriveClip = 'idle', fade = 0.5, turnRate = 70 } = {}) {
    const list = Array.isArray(points) && points.length && typeof points[0] !== 'number' ? points : [points];
    const pts = [new THREE.Vector3(root.position.x, 0, root.position.z)];
    for (const spec of list) {
      const p = Array.isArray(spec) && spec.length === 2 ? new THREE.Vector3(spec[0], 0, spec[1]) : world.resolvePoint(spec, new THREE.Vector3()).setY(0);
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
    if (gait === undefined) gait = measureGait(model, root, clips.get('walk'), feet, restFeet, footing.tuning);
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
  // The look and the talking are laid over the animated pose each frame. The pose the mixer produced
  // is saved and restored first, because the mixer leaves a bone alone when its value has not changed
  // (a paused or frozen frame), and the layers would otherwise pile up on themselves.
  const layerBones = [neck, head, jaw].filter(Boolean);
  const animatedPose = layerBones.map(b => b.quaternion.clone());
  let layered = false;
  const look = { spec: null, goal: 0, weight: 0, maxYaw: 55, maxPitch: 30, point: new THREE.Vector3(), smooth: new THREE.Vector3(), primed: false };
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const qc = new THREE.Quaternion();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();

  /** Turn the head toward a point spec (null to look ahead again). Neck and head share the turn. */
  function lookAt(spec, { weight = 1, maxAngle = 55, maxPitch = 30 } = {}) {
    // A new thing to look at comes with a blink, as a glance does.
    if ((spec ?? null) !== look.spec) lids?.blink.blink();
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

  // Talking ------------------------------------------------------------------------------------
  // While a line plays the jaw opens with the voice and the head dips and tilts a little (talk.js).
  // Turns are about the character's own axes in the world (x forward, z its right side), so they work
  // whatever the bones' rest frames are; turning down about the right side opens a jaw.
  let faceData = null;
  model.traverse(o => { if (!faceData && o.isSkinnedMesh && o.userData.face) faceData = o.userData.face; });
  // A jaw the mouth pass cut (Mosi's beak) says how far it opens when the character talks.
  const talk = createTalk(faceData?.mouth?.talk ? { jaw: faceData.mouth.talk } : {});
  function applyTalk(dt) {
    const pose = talk.update(dt);
    if (!pose) return false;
    const right = v1.set(0, 0, 1).applyQuaternion(root.quaternion);
    const forward = v2.set(1, 0, 0).applyQuaternion(root.quaternion);
    if (head) {
      rotateBoneWorld(head, qa.setFromAxisAngle(right, -pose.nod));
      rotateBoneWorld(head, qa.setFromAxisAngle(forward, pose.tilt));
    }
    if (jaw) rotateBoneWorld(jaw, qa.setFromAxisAngle(right, -pose.jaw));
    return true;
  }

  // Eyelids ------------------------------------------------------------------------------------
  // Shells over the painted eyes, skinned by the same bones, with their own blink (eyelids.js). The
  // blink's random numbers are seeded by the actor's name, so a scene blinks the same every time.
  const lids = createEyelids(model, { seed: name });

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
    /** The eyelids (null for a model without eyes): `shut` is how shut they are now. */
    get eyelids() { return lids; },
    /** Blink now. */
    blink() { lids?.blink.blink(); },
    /** Rest the eyes at `level`: 0 open, 0.5 sleepy, 1 shut; blinks go on unless they are shut. */
    closeEyes(level = 1, { duration = 0.3 } = {}) { lids?.blink.rest(level, duration); },
    openEyes({ duration = 0.3 } = {}) { lids?.blink.rest(0, duration); },
    /**
     * Speak a line: the mouth follows `mouth` (its track in lines.json) or, without one, the text over
     * `duration` seconds. Returns a token for stopTalking, which ends only that line.
     */
    talk(line) { return talk.say(line); },
    stopTalking(token) { talk.stop(token); },
    get talking() { return talk.speaking; },
    /** How open the mouth is now (0 to 1). */
    get mouthOpen() { return talk.open; },
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
      if (layered) layerBones.forEach((bone, i) => bone.quaternion.copy(animatedPose[i]));
      footing.restore();
      updateWalk(dt);
      updateTurn(dt);
      mixer.update(dt);
      footing.update(dt);
      layerBones.forEach((bone, i) => animatedPose[i].copy(bone.quaternion));
      const looked = applyLook(dt);
      const talked = applyTalk(dt);
      layered = looked || talked;
      lids?.update(dt);
    },
    /** Stop walking, turning, looking and talking, open the eyes; settle into idle. */
    stop() {
      if (walk) endWalk(true);
      if (turn) endTurn(true);
      lookAt(null);
      talk.stop();
      lids?.blink.rest(0);
    },
    dispose() { mixer.stopAllAction(); lids?.dispose(); world.scene.remove(root); },
  };
}
