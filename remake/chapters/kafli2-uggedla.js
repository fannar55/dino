// Chapter 2's Uggeðla alive (remake/chapters/kafli2.js, scenes 3, 4 and 6; docs/superpowers/specs/2026-10-31-kafli-2-bod-til-uggedlu-design.md,
// sections 2 and 4): the movements the scenes ask of her. She is the Spinosaurus of the owner's model (14 m, a coral sail 7.3 m up), glad and
// teasing, and she lives in the water of Síkið. Each movement is a generator for the scheduler (`yield*`), or a plain call:
//   lieLow(c)                         she lies in the water at her reed, only her sail over the reed, her neck laid down and
//                                     her head tucked in on the bank's side (arriveInSiki calls it, and shows her)
//   uggedlaLife(s, c)                 she breathes, blinks, her sail sways, her head looks about, rings and bubbles come by her
//                                     (arriveInSiki starts it; it leaves the water alone while she swims, strikes or splashes)
//   riseSail(s, c, { seconds = 4 })   the sail rises out of the reed, rustling (her root comes up from SINK.low to SINK.sail)
//   headUpWithFish(s, c)              she turns toward Mosi (as far as 65 degrees), lifts her head with a fish in her jaws, tosses it back
//                                     and swallows it; her head stays up (about 7 s)
//   catchFish(s, c, fish)             her head darts to `fish.point`, the jaw opens a little (JAW_MAX = 9 degrees, the limit is 12) and
//                                     snaps shut on it, she tosses her head back, the fish goes down her throat, her head comes back;
//                                     resolves when she is as she was (a second or two; a fish far off makes her lunge, up to 6.5 m, and
//                                     swim back). `fish` is what the fishing game hands in: { point: THREE.Vector3, size: number,
//                                     caught(): void }. point is the fish's middle in the air (read every frame, so a fish that still
//                                     moves is followed), size its length in metres (1.5 a big fish, 0.6 a small one: the fish she holds is
//                                     the Fen's fish, 0.3 m, drawn at size / 0.3), and caught() is called once, in the frame the jaws shut
//                                     on it: it is hers from then, whoever drew it hides it (hers appears where it was and goes to her snout)
//   swimAlong(s, c, points, { speed, sink, sinkAtEnd, then })
//                                     she swims low along the points ([x, z], from where she is), the sail up, the tail sweeping, rings
//                                     in the water; speed in m/s (SWIM_SPEED = 1.1; her wade clip's own matched speed is 0.52 and the
//                                     clip is played faster); resolves when she has stopped at the last point
//   tailSplash(s, c, target)          one tail stroke that throws a splash at `target` (an actor of the scene, or a point spec): the tail
//                                     curls to the side the target is on and comes down in the water, drops fly to it. It reaches best
//                                     when the target is level with her hips, 3 to 5 m off her side
//   createBackSeat(uggedla)           the seat on her back, in front of her sail, with Egill's hands on its front edge: what riding.js's
//                                     ride, floatTo and floatDown take. Making it has her lower her neck for him (1.6 s; floatTo takes
//                                     2.2), and his legs go out in front of him as he lands (neck-ride.js legsOut, as on Þórseðla's head)
// `c` is the chapter's shared state (kafli2.js): c.uggedla (the scene's actor), c.world, c.mosi, c.egill, c.ring (the script's rings on the
// water). The movements keep to themselves: each leaves her as the next expects her (lying, sail risen, head up, ...), and a catch lifts a
// head that is still laid down. SINK, SEAT and LYING are exported for tuning.
//
// How she is moved. She is an actor that something else moves (actor.control, as a rider is by riding.js), so s.actor('uggedla').walkTo and
// the like do nothing while she is under this rig; place() is taken as where she is. The rig puts her root each frame (where she is, her
// way, how far under the water's surface: a swim is measured from the surface, not from the bed), and after her clips have posed her it
// lays the moves over them, bone by bone: her neck down and round for lying low, the roll of the sail's shiver (the whole body: the sail
// follows the back, so it never folds), her tail for swimming and splashing (not its first three bones: the sail rides them), and the
// strike, which turns her neck and head, never her chest, until the tip of her snout is on the fish. Her baked clips stay under it all:
// idle (breathing), wade (swimming low: the neck bent down, the snout low over the water, the tail sweeping) and the rest; no clip was
// added (the runtime moves read right in captures), so spinosaurus.glb is as it was. Sizes are metres, angles degrees. Headings are as
// everywhere: 0 faces +X, 90 faces +Z; the model faces +X, Y up, Z to its right, and a bone turned about Z by a negative angle puts its
// nose down (a tail points the other way: its end goes down for a positive one).
//
// A controlled actor is updated after the free ones, in the order the chapter makes the actors: kafli2.js lists her before Egill, or he
// would sit where she was a frame ago.
import * as THREE from 'three';
import { createSeat } from '../engine/riding.js';
import { ringsFor, legsOut } from '../engine/neck-ride.js';
import { seededRandom } from '../engine/random.js';
import { createModel } from '../world/critters/models.js';
import { glints, run } from '../world/props/sparkles.js';

const V3 = THREE.Vector3;
const Q = THREE.Quaternion;
const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const clamp = THREE.MathUtils.clamp;
const smooth = t => { const k = clamp(t, 0, 1); return k * k * (3 - 2 * k); };
const smoother = t => { const k = clamp(t, 0, 1); return k * k * k * (k * (k * 6 - 15) + 10); };
const wrap180 = a => ((((a + 180) % 360) + 360) % 360) - 180;
const findBone = (model, name) => model.getObjectByName(name) ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

// ---------------------------------------------------------------------------------------------
// The numbers

/**
 * How far her root is under the water's surface: lying low in the reed, the sail risen, her head up, swimming. Lying low is 3.25: her back
 * is then 1.7 m over the water and only the top of her sail (4 m) is over the reed (the tests hold that every bit of her but the sail is
 * behind two clumps of it from the cameras of the arrival, the sail, the star and the tall screen).
 */
export const SINK = { low: 3.25, sail: 1.0, up: 0.9, swim: 1.4 };
/** The speed she swims at when a scene does not say, m/s; her wade clip's own matched speed is WADE_SPEED. */
export const SWIM_SPEED = 1.1;
export const WADE_SPEED = 0.52;
/** The jaw opens at most this many degrees (her bake notes: at 10 degrees and more four tiny triangles turn over at her left mouth corner; 12 is the limit). */
export const JAW_MAX = 9;
/** The fish she holds when her head first comes up is a big fish's size (kafli2-fishing.js: FISH_SIZES.big). */
export const BIG_FISH = 1.5;

const BONES = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'Jaw', 'Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6'];
const TAIL = BONES.filter(name => name.startsWith('Tail'));
// The tip of her snout in her Head bone's frame (measured on the model: the furthest vertex forward that the head carries alone), and
// where a fish lies in her jaws (its nose just inside her mouth, its length out along her snout, so that it shows its side) and where it
// goes down her throat.
const SNOUT = new V3(2.79, -0.633, 0.026);
const MOUTH = new V3(2.5, -0.7, 0); // where its nose is
const THROAT = new V3(1.55, -0.45, 0);
/** Where the middle of a fish `size` metres long is in her jaws. */
const inJaws = (size, out = new V3()) => out.set(MOUTH.x + size / 2, MOUTH.y, MOUTH.z);
const FISH_LENGTH = 0.3; // the Fen's fish, in metres; it is drawn at size / FISH_LENGTH
// Lying low (with the tuck at 0): the neck laid down and swung round to her right, to the bank's side, with the head resting on the ground
// by her shoulder, so that her back hides it from the channel (the reed in front of her head is thin: the water there is deep). Pitch about
// the bone's Z (negative: down), yaw about the vertical (negative: to her right).
export const LYING = { neck: { pitch: -58, yaw: -80 }, head: { pitch: 38, yaw: -35 } };
// The strike: the joints that reach for the fish (not her chest: her sail rides it), how far each may turn from where it was (degrees), and how
// the turn about the vertical is shared between them
const REACH_JOINTS = [{ name: 'Head', limit: 70, share: 0.45 }, { name: 'Neck', limit: 85, share: 0.55 }];
// The seat on her back, on her Chest bone (in a frame kept level): [across, up, ahead], and where his wrists go, from there
export const SEAT = { offset: [0, 0.62, 1.1], grips: { left: [-0.2, 0.65, -0.3], right: [0.2, 0.65, -0.3] }, legs: 0.5 };
const CARRY_PACE = 0.3; // her wade clip's time scale while she wades in place with him on her
const REACH = 5.2; // how far along the water the tip of her snout reaches from her root without her moving, for a fish a metre or two up
const MAX_LUNGE = 6.5; // the most she moves her whole body toward a fish
const LUNGE_SPEED = 4.5; // m/s at the quickest of the lunge
const MAX_TURN = 80; // degrees she turns toward a fish at most

// ---------------------------------------------------------------------------------------------
// The rig

/** Her rig, made the first time anything asks for it (lieLow): c.uggedlaRig. */
const rigs = new WeakMap(); // actor -> rig
function rigOf(c) {
  const actor = c.uggedla.raw;
  if (!rigs.has(actor)) rigs.set(actor, makeRig(c));
  return (c.uggedlaRig = rigs.get(actor));
}

const turnQ = new Q();
const turnE = new THREE.Euler();
/** Turns a bone by `pitch` about Z (negative: nose down), `yaw` about Y (positive: to the left) and `roll` about X, in its parent's frame. */
function turn(bone, pitch = 0, yaw = 0, roll = 0) {
  if (!pitch && !yaw && !roll) return;
  bone.quaternion.premultiply(turnQ.setFromEuler(turnE.set(rad(roll), rad(yaw), rad(pitch), 'YXZ')));
}

const parentQ = new Q();
const localQ = new Q();
/** Turns a bone by a rotation in the world's frame, about its own pivot (as actor.js does for the look). */
function turnInWorld(bone, q) {
  bone.parent.getWorldQuaternion(parentQ);
  localQ.copy(parentQ).invert().multiply(q).multiply(parentQ);
  bone.quaternion.premultiply(localQ);
  bone.updateMatrixWorld(true);
}

function makeRig(c) {
  const actor = c.uggedla.raw;
  const { world } = c;
  const bones = Object.fromEntries(BONES.map(name => {
    const bone = findBone(actor.model, name);
    if (!bone) throw new Error(`Uggeðla has no bone "${name}"`);
    return [name, bone];
  }));
  const clipPose = new Map(BONES.map(name => [name, new Q()]));
  const rig = {
    c, actor, world, bones, t: 0,
    busy: 0, // movements under way that the idle life leaves alone
    // What the moves are made of, each moved by a tween: how far under the water her root is, how much her head is up (0: lying low),
    // the sail's shiver, her way turned from the station's (degrees), how far she has lunged along rig.lunge, the jaw's opening
    // (degrees), the strike's weight, the head thrown back, how much she swims with her tail, how far her tail curls to its side.
    v: { sink: SINK.low, tuck: 0, shiver: 0, yaw: 0, lunge: 0, jaw: 0, strike: 0, toss: 0, swim: 0, curl: 0, life: 1 },
    tweens: [],
    station: { x: actor.root.position.x, z: actor.root.position.z, heading: actor.heading }, // where she is, before the lunge and the turn
    lunge: new V3(), // the lunge's whole way, from the station (horizontal)
    placed: { x: NaN, z: NaN, heading: NaN }, // what the rig put last, to tell a place() from outside
    target: null, // the point the strike reaches for (a Vector3, followed live)
    tip: new V3(), error: Infinity, // the tip of her snout now, and how far it is from the strike's target
    side: 1, curlTotal: 0, beat: 0, // the tail's curl: +1 to her right, its total turn; the swim's beat
    mover: null, // the swim, while she swims
    carrying: false, // Egill rides her (createBackSeat): her neck is down, on her wade clip, whatever she does
    fish: null,
  };

  // Tweens -------------------------------------------------------------------------------------
  const tween = (key, to, seconds, ease = smooth) => {
    const item = { key, from: rig.v[key], to, seconds: Math.max(1e-6, seconds), t: 0, ease, done: false };
    rig.tweens = rig.tweens.filter(other => other.key !== key);
    rig.tweens.push(item);
    return item;
  };
  /** `key` follows fn(u) for u from 0 to 1 over `seconds` (a bump, say), then stays at fn(1). */
  const animate = (key, fn, seconds) => {
    const item = { key, fn, seconds: Math.max(1e-6, seconds), t: 0, done: false };
    rig.tweens = rig.tweens.filter(other => other.key !== key);
    rig.tweens.push(item);
    return item;
  };
  function stepTweens(dt) {
    for (const item of rig.tweens) {
      item.t += dt;
      const u = clamp(item.t / item.seconds, 0, 1);
      rig.v[item.key] = item.fn ? item.fn(u) : item.from + (item.to - item.from) * item.ease(u);
      if (u >= 1) item.done = true;
    }
    rig.tweens = rig.tweens.filter(item => !item.done);
  }

  // The water she is in -------------------------------------------------------------------------
  /** The height her root is measured from: the water's surface where she is in water, else the ground. */
  const baseAt = (x, z) => world.forest?.water?.surfaceAt?.(x, z) ?? world.heightAt(x, z);
  rig.baseAt = baseAt;

  /** The turn and the lunge so far become where she is: a swim starts from here. */
  function commit() {
    rig.station.x += rig.lunge.x * rig.v.lunge;
    rig.station.z += rig.lunge.z * rig.v.lunge;
    rig.station.heading += rig.v.yaw;
    rig.v.lunge = 0;
    rig.v.yaw = 0;
  }

  // Before the clips ----------------------------------------------------------------------------
  function drive(dt) {
    // the bones go back to what the clips last gave them (the mixer leaves a bone alone when its value does not change)
    for (const name of BONES) bones[name].quaternion.copy(clipPose.get(name));
    rig.t += dt;
    stepTweens(dt);
    const root = actor.root;
    // someone put her somewhere else (place): that is where she is
    if (Math.hypot(root.position.x - rig.placed.x, root.position.z - rig.placed.z) > 1e-3 || Math.abs(wrap180(actor.heading - rig.placed.heading)) > 1e-2) {
      Object.assign(rig.station, { x: root.position.x, z: root.position.z, heading: actor.heading });
      rig.v.lunge = 0;
      rig.v.yaw = 0;
    }
    rig.mover?.step(dt);
    const x = rig.station.x + rig.lunge.x * rig.v.lunge;
    const z = rig.station.z + rig.lunge.z * rig.v.lunge;
    const heading = rig.station.heading + rig.v.yaw;
    const bob = rig.v.swim * 0.04 * Math.sin(rig.beat * 0.5);
    root.position.set(x, baseAt(x, z) - rig.v.sink + bob, z);
    root.rotation.y = -rad(heading);
    rig.placed = { x, z, heading: actor.heading }; // as the actor reads it back
  }

  // After the clips -----------------------------------------------------------------------------
  function pose() {
    for (const name of BONES) clipPose.get(name).copy(bones[name].quaternion);
    const { v } = rig;
    const t = rig.t;
    const lying = 1 - v.tuck;
    // lying low: the neck folded down, the head level again
    turn(bones.Neck, LYING.neck.pitch * lying, LYING.neck.yaw * lying);
    turn(bones.Head, LYING.head.pitch * lying, LYING.head.yaw * lying);
    // the sail sways a little with her breathing (a roll of her whole body), and shivers when it rises
    const sway = v.life * 1.1 * Math.sin(rad(360 * 0.19 * t)) + 0.5 * Math.sin(rad(360 * 0.43 * t + 1.3));
    const shiver = v.shiver * 1.3 * Math.sin(rad(360 * 7.3 * t));
    turn(bones.Hips, 0, 0, sway + shiver); // the sail follows the back below it, so the whole body rolls and the sail never folds
    // a slow look about, when she lies at ease
    turn(bones.Head, v.life * 2.2 * Math.sin(rad(360 * 0.071 * t + 0.4)), v.life * 3.5 * Math.sin(rad(360 * 0.053 * t)));
    // the tail: swimming (a wave down it), and curling to a side for the splash
    if (v.swim > 0 || v.curl !== 0) {
      TAIL.forEach((name, i) => {
        // her sail rides the tail's first three bones: they bend a little, the rest of the tail does the moving
        const wave = v.swim * [0.5, 1, 2, 5.5, 8.5, 11][i] * Math.sin(rig.beat - rad(46 * i));
        const curl = v.curl * rig.side * rig.curlTotal * [0, 0.06, 0.1, 0.26, 0.29, 0.29][i];
        // the tail points backward, so a turn about Z the other way than the neck's puts its end down: in the stroke it comes down to the
        // water (and rises a little as it winds back)
        const dip = [0, 1, 2, 17, 22, 22][i] * Math.max(0, v.curl) - [0, 0.5, 1, 2, 3, 3][i] * Math.max(0, -v.curl);
        turn(bones[name], v.swim * 1.2 + dip, wave + curl);
      });
      // she tips her whole body back a little in the stroke, so that the end of her tail comes down to the water (the sail goes with it, whole)
      turn(bones.Hips, 7 * v.curl, v.swim * 1.4 * Math.sin(rig.beat + rad(40)));
    }
    // the head thrown back after a catch
    turn(bones.Neck, 30 * v.toss);
    turn(bones.Head, 14 * v.toss);
    // the jaw
    turn(bones.Jaw, -Math.min(JAW_MAX, Math.max(0, v.jaw)));
    actor.root.updateMatrixWorld(true);
    // the strike: neck and head reach until the tip of her snout is on the target
    if (v.strike > 1e-4 && rig.target) {
      solveStrike(rig, rig.target, v.strike);
      actor.root.updateMatrixWorld(true);
    }
    tipOf(rig, rig.tip);
    rig.error = rig.target ? rig.tip.distanceTo(rig.target) : Infinity;
  }

  Object.assign(rig, { tween, animate, commit, drive, pose });
  actor.control(drive, pose);
  rig.fish = makeHeldFish(rig);
  return rig;
}

/** The tip of her snout in the world, as she is posed now (her matrices are up to date). */
function tipOf(rig, out) {
  return rig.bones.Head.localToWorld(out.copy(SNOUT));
}

const tipNow = new V3();
const joint = new V3();
const aim = new Q();
const spin = new Q();
const wanted = new V3();
const held = new Q();
const UP = new V3(0, 1, 0);
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Turns neck and head until the tip of her snout is on `target`, `weight` of the way from the pose she has (0) to the pose that
 * reaches it (1): first about the vertical, so that the target is in the vertical plane of her neck, then in that plane, joint by joint
 * from the head down (cyclic coordinate descent), each joint within its limit from where it was.
 */
function solveStrike(rig, target, weight) {
  const { bones } = rig;
  const joints = REACH_JOINTS.map(j => ({ ...j, bone: bones[j.name], before: bones[j.name].quaternion.clone() }));
  const within = j => {
    const turned = j.before.angleTo(j.bone.quaternion);
    if (turned > rad(j.limit)) {
      const solved = held.copy(j.bone.quaternion);
      j.bone.quaternion.copy(j.before).slerp(solved, rad(j.limit) / turned);
      j.bone.updateMatrixWorld(true);
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    bones.Chest.getWorldPosition(joint);
    tipOf(rig, tipNow);
    const away = wrapPi(Math.atan2(target.z - joint.z, target.x - joint.x) - Math.atan2(tipNow.z - joint.z, tipNow.x - joint.x));
    for (const j of joints) {
      turnInWorld(j.bone, spin.setFromAxisAngle(UP, -away * j.share));
      within(j);
    }
  }
  for (let pass = 0; pass < 6; pass++) {
    for (const j of joints) {
      j.bone.getWorldPosition(joint);
      tipOf(rig, tipNow);
      aim.setFromUnitVectors(tipNow.sub(joint).normalize(), wanted.copy(target).sub(joint).normalize());
      const angle = 2 * Math.acos(clamp(aim.w, -1, 1));
      if (angle > rad(50)) aim.slerp(spin.identity(), 1 - rad(50) / angle);
      turnInWorld(j.bone, aim);
      within(j);
    }
  }
  if (weight < 1) {
    for (const j of joints) {
      const solved = held.copy(j.bone.quaternion);
      j.bone.quaternion.copy(j.before).slerp(solved, weight);
    }
  }
  for (const j of joints) j.bone.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------------------------
// The fish she holds: the Fen's fish (world/critters/models.js), 0.3 m long, drawn at the size of the fish; it hangs on her Head bone, so it
// follows her snout through every move, and is hidden when she has swallowed it.

function makeHeldFish(rig) {
  const model = createModel('fish');
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  material.name = 'uggedla fish';
  const mesh = new THREE.Mesh(model.geometry, material);
  mesh.name = 'fish';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const group = new THREE.Group();
  group.name = 'Uggeðla fish';
  group.visible = false;
  group.add(mesh);
  rig.bones.Head.add(group);
  const flex = mesh.morphTargetDictionary?.flex;
  const held = {
    group,
    /** The fish in her jaws, crosswise at the tip of her snout, `size` metres long, alive. */
    hold(size) {
      group.visible = true;
      group.scale.setScalar(size / FISH_LENGTH);
      inJaws(size, group.position);
      group.rotation.set(0, Math.PI, 0); // nose in, tail out along her snout, its back up
      held.size = size;
    },
    /** It wriggles: its tail flexes and flaps up and down, `rate` beats a second. */
    wriggle(rate = 3, amount = 1) {
      const beat = Math.sin(rad(360 * rate * rig.t));
      if (flex !== undefined) mesh.morphTargetInfluences[flex] = amount * (0.5 + 0.5 * beat);
      group.rotation.z = 0.22 * amount * beat;
    },
    hide() { group.visible = false; },
    size: 1,
  };
  return held;
}

// ---------------------------------------------------------------------------------------------
// Water: rings and bubbles

/** A ring on the water at (x, z); the script's own (c.ring) keeps few alive at once. */
function ringAt(c, x, z, strength = 0.5) {
  c.ring ??= ringsFor(c.world, { most: 3 });
  return c.ring([x, 0, z], strength);
}

// ---------------------------------------------------------------------------------------------
// The movements

/** Where she is now: her root's x and z. */
const herPlace = rig => ({ x: rig.actor.root.position.x, z: rig.actor.root.position.z });

/**
 * She lies low in the water at her reed (arriveInSiki): her root SINK.low under the water, her neck laid down and her head tucked in on
 * the bank's side (LYING), so that nothing of her but the top of her sail shows over the reed. She breathes on her idle
 * clip. Shown, if she was hidden.
 */
export function lieLow(c) {
  const rig = rigOf(c);
  const { actor } = rig;
  actor.root.visible = true;
  actor.lookAt(null);
  actor.play('idle', { fade: 0 });
  rig.tweens.length = 0;
  Object.assign(rig.v, { sink: SINK.low, tuck: 0, shiver: 0, yaw: 0, lunge: 0, jaw: 0, strike: 0, toss: 0, swim: 0, curl: 0, life: 1 });
  rig.mover = null;
  rig.carrying = false;
  rig.fish.hide();
  Object.assign(rig.station, { x: actor.root.position.x, z: actor.root.position.z, heading: actor.heading });
  rig.placed = { x: NaN, z: NaN, heading: NaN };
  return rig;
}

/** The sail rises out of the reed, rustling: her root comes up from under the water over `seconds`, the sail trembling. */
export function* riseSail(s, c, { seconds = 4 } = {}) {
  const rig = rigOf(c);
  rig.busy++;
  try {
    rig.tween('sink', SINK.sail, seconds, smoother);
    rig.animate('shiver', u => Math.pow(Math.sin(Math.PI * u), 0.6), seconds);
    const { x, z } = herPlace(rig);
    s.after(0.2, () => { ringAt(c, x, z, 0.5); });
    s.after(seconds * 0.5, () => { ringAt(c, x, z, 0.4); });
    yield s.wait(seconds);
  } finally {
    rig.busy--;
  }
}

/**
 * She turns toward Mosi, lifts her head out of the water and the reed with a fish in her jaws, wriggling, tosses her head back and
 * swallows it, and looks up pleased.
 */
export function* headUpWithFish(s, c) {
  const rig = rigOf(c);
  rig.busy++;
  try {
    rig.commit();
    const { fish } = rig;
    // she turns her sail toward them: to face Mosi, as far as 65 degrees
    const her = herPlace(rig);
    const mosi = c.mosi.raw.root.position;
    const toward = deg(Math.atan2(mosi.z - her.z, mosi.x - her.x));
    const turned = clamp(wrap180(toward - rig.station.heading), -65, 65);
    fish.hold(BIG_FISH);
    rig.tween('yaw', turned, 2.0, smoother);
    rig.tween('sink', SINK.up, 1.8, smoother);
    yield s.wait(0.5);
    const head = new V3();
    rig.tween('tuck', 1, 1.6, smoother);
    s.after(0.9, () => {
      s.sfx('splash');
      rig.actor.headPosition(head);
      ringAt(c, head.x, head.z, 0.7);
    });
    for (const until = s.time + 2.3; s.time < until;) {
      fish.wriggle(3.2);
      yield;
    }
    // the swallow: the head thrown back, the fish down her throat as the jaws gulp
    rig.tween('toss', 1, 0.5, smooth);
    yield s.wait(0.45);
    rig.animate('jaw', u => 9 * Math.sin(Math.PI * u), 0.45);
    const group = fish.group;
    const held = inJaws(fish.size);
    for (const began = s.time; s.time - began < 0.45;) {
      const k = smooth((s.time - began) / 0.4);
      group.position.lerpVectors(held, THROAT, k);
      group.scale.setScalar((fish.size / FISH_LENGTH) * (1 - k));
      fish.wriggle(5);
      yield;
    }
    fish.hide();
    rig.tween('toss', 0, 0.8, smoother);
    yield s.wait(0.9);
  } finally {
    rig.busy--;
  }
}

/**
 * Her head darts to `fish.point` in the air: she turns toward it and lunges if it is further than her neck reaches, her snout opens a
 * little (JAW_MAX at most) and snaps shut on it; `fish.caught()` is called then. She tosses her head back, the fish goes down her throat,
 * and her head comes back; resolves then (her body has swum back to where she lay by then).
 */
export function* catchFish(s, c, fish) {
  const rig = rigOf(c);
  rig.busy++;
  try {
    rig.commit();
    rig.actor.lookAt(null);
    // a head that is still laid down (she has not lifted it yet) comes up first
    if (rig.v.tuck < 0.99) {
      rig.tween('tuck', 1, 0.9, smoother);
      rig.tween('sink', Math.min(rig.v.sink, SINK.up), 0.9, smoother);
      yield s.wait(0.9);
    }
    const point = fish.point;
    rig.target = point;
    // the way to the fish: turn toward it, and lunge the rest of the way if it is beyond her reach
    const root = rig.actor.root.position;
    const dx = point.x - root.x, dz = point.z - root.z;
    const far = Math.hypot(dx, dz);
    const turned = clamp(wrap180(deg(Math.atan2(dz, dx)) - rig.station.heading), -MAX_TURN, MAX_TURN);
    const lunge = clamp(far - REACH, 0, MAX_LUNGE);
    rig.lunge.set(dx / far, 0, dz / far).multiplyScalar(lunge);
    const surge = lunge > 0.05 ? 0.35 + lunge / LUNGE_SPEED : 0.3;
    const reach = surge + 0.12;
    rig.tween('yaw', turned, Math.max(0.3, surge), smooth);
    if (lunge > 0.05) {
      rig.tween('lunge', 1, surge, smooth);
      for (const at of [0.25, 0.5, 0.75]) s.after(surge * at, () => { const p = herPlace(rig); ringAt(c, p.x, p.z, 0.55); });
    }
    rig.tween('strike', 1, reach, smoother);
    s.after(reach - 0.3, () => rig.tween('jaw', JAW_MAX - 0.5, 0.28, smooth));
    yield s.until(() => rig.v.strike >= 0.999 && (lunge <= 0.05 || rig.v.lunge >= 0.999));
    // on the fish, or as near as she can get; then the jaws snap shut
    for (const until = s.time + 0.5; s.time < until && rig.error > 0.06;) yield;
    rig.tween('jaw', 0, 0.09, smooth);
    yield s.wait(0.1);
    // the fish is hers: the one she holds appears where the other was, and slides to her snout
    const held = rig.fish;
    const head = rig.bones.Head;
    head.updateWorldMatrix(true, false);
    const from = head.worldToLocal(point.clone());
    held.hold(fish.size ?? 1);
    fish.caught();
    // the head thrown back with the fish across her snout, then the fish goes down her throat
    rig.tween('toss', 1, 0.45, smooth);
    rig.tween('strike', 0, 0.6, smoother);
    s.after(0.72, () => { rig.animate('jaw', u => 8 * Math.sin(Math.PI * u), 0.3); });
    const back = Math.max(0.9, lunge / 3.2);
    rig.tween('lunge', 0, back, smoother);
    rig.tween('yaw', 0, back, smoother);
    const group = held.group;
    const size = (fish.size ?? 1) / FISH_LENGTH;
    const held0 = inJaws(fish.size ?? 1);
    for (const began = s.time; s.time - began < 0.9;) {
      const t = s.time - began;
      if (t < 0.12) group.position.lerpVectors(from, held0, smooth(t / 0.12));
      else if (t < 0.5) group.position.copy(held0);
      else {
        const k = smooth((t - 0.5) / 0.35);
        group.position.lerpVectors(held0, THROAT, k);
        group.scale.setScalar(size * (1 - k));
      }
      held.wriggle(5);
      yield;
    }
    held.hide();
    rig.tween('toss', 0, 0.6, smoother);
    rig.target = null;
    yield s.until(() => rig.v.toss <= 0.001 && rig.v.strike <= 0.001 && rig.v.lunge <= 0.001 && Math.abs(rig.v.yaw) < 0.1);
  } finally {
    rig.busy--;
  }
}

/**
 * The seat on her back for Egill: in front of her sail, on the base of her neck (her Chest bone), his hands on the sail's front edge.
 * Her neck rises steeply when she stands at ease, with no room for a rider on it, so making the seat has her lower her neck and take her
 * wade posture (the neck laid forward, the head low over the water) and sink to her swimming depth, in 1.6 s; floatTo takes 2.2 s, and he
 * lands as she is ready. She keeps that posture, wading in place or swimming, until a swim says otherwise (swimAlong's `then`).
 */
export function createBackSeat(uggedla) {
  const rig = rigs.get(uggedla.raw);
  if (!rig) throw new Error('createBackSeat: she is not lying low yet (lieLow makes her)');
  rig.carrying = true;
  rig.actor.lookAt(null);
  rig.actor.play('wade', { fade: 1.2, timeScale: CARRY_PACE });
  rig.tween('sink', SINK.swim, 1.6, smoother);
  rig.tween('tuck', 1, 1.2, smoother);
  rig.tween('toss', 0, 0.8, smoother);
  // He sits on her neck's broad top with his legs out in front of him (neck-ride.js: legsOut), as on Þórseðla's head, from the moment he
  // is at the seat until he leaves it: the seat watches where he is.
  const seat = createSeat(uggedla.raw, { bone: 'Chest', offset: SEAT.offset, grips: SEAT.grips });
  const egill = rig.c.egill?.raw;
  if (egill) {
    const legs = legsOut(egill);
    let seated = false;
    const update = seat.update;
    seat.update = () => {
      const at = update();
      const near = egill.controlled && egill.root.position.distanceTo(at) < 0.2;
      if (near !== seated) {
        seated = near;
        legs.to(near ? 1 : 0, { duration: SEAT.legs });
      }
      return at;
    };
    seat.legs = legs;
  }
  return seat;
}

/**
 * She swims low along the points ([x, z]; from where she is) at `speed` m/s: her root `sink` metres under the water, the sail up, her
 * wade clip paddling under her, the tail sweeping from side to side and rings spreading from her. Resolves when she has stopped at the
 * last point: at ease on her idle clip, or, with Egill on her back (createBackSeat) or `then: 'wade'`, treading water on her wade clip, her
 * neck as it was; `then: 'idle'` has her stand at ease anyway (only when nobody rides her). `sinkAtEnd` sinks her to that depth then.
 */
export function* swimAlong(s, c, points, { speed = SWIM_SPEED, sink = SINK.swim, sinkAtEnd = null, then = null } = {}) {
  const rig = rigOf(c);
  rig.busy++;
  try {
    rig.commit();
    rig.actor.lookAt(null);
    const list = [new V3(rig.station.x, 0, rig.station.z)];
    for (const [x, z] of points) if (list[list.length - 1].distanceTo(new V3(x, 0, z)) > 0.05) list.push(new V3(x, 0, z));
    if (list.length < 2) return;
    const curve = list.length > 2 ? new THREE.CatmullRomCurve3(list, false, 'centripetal') : new THREE.LineCurve3(list[0], list[1]);
    const length = curve.getLength();
    const action = rig.actor.play('wade', { fade: 0.6, timeScale: clamp(speed / WADE_SPEED, 0.5, 3) });
    const base = clamp(speed / WADE_SPEED, 0.5, 3);
    const point = new V3();
    const tangent = new V3();
    const mover = {
      at: 0, t: 0, done: false,
      step(dt) {
        mover.t += dt;
        const left = length - mover.at;
        const factor = Math.min(1, 0.05 + 0.95 * smooth(mover.t / 1.6)) * Math.min(1, 0.25 + 0.75 * smooth(left / 2));
        mover.at = Math.min(length, mover.at + speed * factor * dt);
        action?.setEffectiveTimeScale(base * Math.max(0.25, factor));
        curve.getPointAt(mover.at / length, point);
        curve.getTangentAt(Math.min(mover.at / length, 0.999), tangent);
        rig.station.x = point.x;
        rig.station.z = point.z;
        const want = deg(Math.atan2(tangent.z, tangent.x));
        const delta = wrap180(want - rig.station.heading);
        rig.station.heading += clamp(delta * (1 - Math.exp(-dt * 2.2)), -40 * dt, 40 * dt);
        rig.beat += dt * 2 * Math.PI * 0.42 * (speed / SWIM_SPEED) * Math.max(0.3, factor);
        if (mover.at >= length - 0.12) mover.done = true;
      },
    };
    rig.mover = mover;
    rig.tween('sink', sink, 1.5, smoother);
    rig.tween('swim', 1, 1.5, smooth);
    let ringed = 0;
    while (!mover.done) {
      if (mover.at - ringed > 2.4) {
        ringed = mover.at;
        const bow = new V3();
        rig.bones.Head.getWorldPosition(bow);
        ringAt(c, bow.x, bow.z, 0.45);
        s.after(0.5, () => { const tail = rig.bones.Tail4.getWorldPosition(new V3()); ringAt(c, tail.x, tail.z, 0.4); });
      }
      yield;
    }
    rig.mover = null;
    if (then === 'wade' || (then === null && rig.carrying)) rig.actor.play('wade', { fade: 0.9, timeScale: CARRY_PACE }); // treads water, the neck as it was
    else {
      rig.carrying = false;
      rig.actor.play('idle', { fade: 0.9 });
    }
    rig.tween('swim', 0, 1.2, smooth);
    if (sinkAtEnd !== null) rig.tween('sink', sinkAtEnd, 1.5, smoother);
    yield s.wait(1.0);
  } finally {
    rig.mover = null;
    rig.busy--;
  }
}

/**
 * One tail stroke that throws a splash at `target` (an actor of the scene, or a point spec): the tail winds back, sweeps round toward it
 * through the water, and a spray of drops flies to it as it lands.
 */
export function* tailSplash(s, c, target) {
  const rig = rigOf(c);
  rig.busy++;
  try {
    const aimed = new V3();
    const where = () => (target?.raw ? target.raw.centre(aimed) : c.world.resolvePoint(target, aimed));
    where();
    const root = rig.actor.root;
    const local = root.worldToLocal(aimed.clone());
    rig.side = local.z >= 0 ? 1 : -1;
    rig.curlTotal = 150;
    rig.tween('curl', -0.25, 0.55, smooth); // winds back, away from him
    yield s.wait(0.6);
    rig.tween('curl', 1, 0.42, t => 1 - Math.pow(1 - clamp(t, 0, 1), 2)); // fast, then it hangs
    yield s.wait(0.22);
    const tip = rig.bones.Tail6.getWorldPosition(new V3());
    tip.y = rig.baseAt(tip.x, tip.z); // the splash rises from the water under the end of her tail
    where();
    s.sfx('splash');
    spray(c.world, tip, aimed.clone(), { seed: 'tail splash' });
    ringAt(c, tip.x, tip.z, 1.1);
    s.after(0.25, () => { ringAt(c, aimed.x, aimed.z, 0.8); });
    yield s.wait(0.5);
    rig.tween('curl', 0, 0.9, smoother);
    yield s.wait(1.0);
  } finally {
    rig.busy--;
  }
}

// The spray: drops of water thrown from `from` to land on `to`, small, pale and glinting like the drops off a wet neck (neck-ride.js).
const SPRAY_LOOK = { glow: 1, falloff: 3.2, star: 0, twinkle: 0, rim: 1, vary: 1, core: '#ffffff', blending: THREE.AdditiveBlending };
function spray(world, from, to, { count = 110, seed = 'spray', seconds = 1.2 } = {}) {
  const set = glints(world, { count, life: 1.6, spread: 0, fall: 0, size: 0.6, colour: '#eefbfd', seed, look: SPRAY_LOOK });
  set.birth.fill(1e6);
  const random = seededRandom(`${seed} ways`);
  // the first quarter go straight up where the tail struck the water; the rest fly to the target and land on it
  const drops = Array.from({ length: count }, (_, i) => {
    const start = from.clone().add(new V3((random() - 0.5) * 0.8, random() * 0.3, (random() - 0.5) * 0.8));
    if (i < count / 4) return { p: start, v: new V3((random() - 0.5) * 1.6, 3 + 3 * random(), (random() - 0.5) * 1.6), born: (i / count) * 0.2, live: false, done: false };
    const flight = 0.8 + 0.5 * random();
    const goal = to.clone().add(new V3((random() - 0.5) * 1.6, (random() - 0.2) * 2.2, (random() - 0.5) * 1.6));
    const v = goal.clone().sub(start).divideScalar(flight);
    v.y += 0.5 * 9.8 * flight;
    return { p: start, v, born: (i / count) * 0.35, live: false, done: false };
  });
  let last = 0;
  return run(world, set, seconds + 1.8, 'tail splash', now => {
    const dt = now - last;
    last = now;
    let moved = false;
    drops.forEach((drop, i) => {
      if (drop.done) return;
      if (!drop.live) {
        if (now < drop.born) return;
        drop.live = true;
        set.birth[i] = now;
        set.points.geometry.attributes.birth.needsUpdate = true;
      }
      drop.v.y -= 9.8 * dt;
      drop.p.addScaledVector(drop.v, dt);
      set.position.set([drop.p.x, drop.p.y, drop.p.z], i * 3);
      moved = true;
      if (drop.v.y < 0 && drop.p.y < (world.forest?.water?.surfaceAt?.(drop.p.x, drop.p.z) ?? world.heightAt(drop.p.x, drop.p.z))) {
        drop.done = true;
        set.birth[i] = 1e6;
        set.points.geometry.attributes.birth.needsUpdate = true;
      }
    });
    if (moved) set.points.geometry.attributes.position.needsUpdate = true;
  });
}

/**
 * She lives in the water: every few seconds a ring spreads by her and now and then bubbles come up by her snout; her sail sways and her
 * head looks about slowly (the rig's pose), and she blinks (the actor's eyelids). It goes on until the chapter ends; while she swims,
 * strikes or splashes it leaves the water to the move.
 */
export function uggedlaLife(s, c) {
  const rig = rigOf(c);
  if (rig.life) return rig.life;
  rig.life = { stopped: false, stop() { rig.life.stopped = true; } };
  s.after(0, () => living(s, c, rig));
  return rig.life;
}

function* living(s, c, rig) {
  const random = seededRandom('uggedla rings');
  let bubbles = 3 + 3 * random();
  while (!rig.life.stopped) {
    const wait = 1.8 + 2.4 * random();
    yield s.wait(wait);
    bubbles -= wait;
    if (rig.busy) continue;
    const root = rig.actor.root.position;
    const heading = rad(rig.actor.heading);
    // a ring by her belly or by her head, in the water she lies in
    const along = (random() - 0.35) * 7;
    const across = (random() - 0.5) * 3;
    const x = root.x + Math.cos(heading) * along - Math.sin(heading) * across;
    const z = root.z + Math.sin(heading) * along + Math.cos(heading) * across;
    ringAt(c, x, z, 0.25 + 0.2 * random());
    if (bubbles <= 0) {
      bubbles = 7 + 5 * random();
      const snout = tipOf(rig, new V3());
      c.world.forest?.water?.bubblesAt?.([snout.x, 0, snout.z]);
    }
  }
}
