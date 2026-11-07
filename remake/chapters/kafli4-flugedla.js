// Flugeðla's life at the white snag (chapter 4, spec 4 and 9): on its very top with her wings spread and still, for there is no wind
// (scene 2); her wings stir in each gust Egill makes and she lifts off the top on the big one (scene 3); then she flies, round the
// tree, down beside Mosi and up again with Egill on her back (scenes 4 and 5), held by a root of the scenes' own.
//
//   const perched = perch(c, { near: SNAG, heading });   // c: the chapter's state (c.world, c.flugedla); near: the snag's [x, z]
//   perched.top           where her feet are: the top of the snag
//   perched.wingTips()    the ends of her two wings ([left, right], world), as a test reads how spread they are
//   perched.stir(amount)  a gust in her wings: they lift and settle, swinging, over a second and a half (1 a gust's, 2 the big one's)
//   perched.lift(m, s)    she rises `m` metres off the top over `s` seconds, the wind under her wings (and 0 brings her down again)
//   perched.lifted        how far off the top she is now
//   perched.release()     gives her back to her clips, in the pose she has (her wings spread, as the clip 'spread' holds them)
//
//   const held = holdHer(c);                 // her root from now on: where she is, held there till a path moves it
//   yield* flyPath(s, c, held, { points, seconds, clips, face });   // she flies `points` (where her feet would be), banking
//   watchHer(c, label, { position });        // a camera that stands and turns to follow her (the director's drive)
//
// Her pose is the model's own (pteranodon-source.json: Tripo's, baked as the bind pose): standing upright on her two feet with both
// wings spread to the sides. No clip holds it (idle folds the wings), so the perch puts the skeleton back in it after the clips every
// frame; her look and her mouth go on over it, so she turns her head to whoever speaks and speaks her lines.
import * as THREE from 'three';
import { BODY_HEIGHT } from './kafli4-route.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const X = new V3(1, 0, 0);
const Z = new V3(0, 0, 1);
const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const clamp = THREE.MathUtils.clamp;

// A gust in her wings: each wing turns up about its shoulder by a swing that dies away (degrees at amount 1, swings a second, seconds)
export const STIR = { degrees: 7, rate: 2.2, fade: 0.55, last: 1.6 };

/**
 * The top of the dead snag that stands at `near` ([x, z], within 1.5 m) in the place in view, as its forest grew it
 * (world/forest/forest.js: info.placementList): its broken top, which leans aside of its foot.
 */
export function snagTop(world, [x, z]) {
  const snags = (world.forest?.info?.placementList ?? []).filter(p => p.name === 'deadSnag');
  const snag = snags.find(p => Math.hypot(p.x - x, p.z - z) < 1.5);
  if (!snag) throw new Error(`No dead snag at ${x}, ${z} in ${world.location ?? 'this place'}`);
  const [tx, tz] = snag.tip ?? [snag.x, snag.z];
  return new THREE.Vector3(tx, snag.y + snag.top, tz);
}

/**
 * Flugeðla on the top of the snag at `near`, facing `heading` (degrees: 0 faces +X, 90 +Z), her wings spread and still. Returns
 * { top, wingTips(), release() }.
 */
export function perch(c, { near, heading }) {
  const her = c.flugedla.raw;
  const top = snagTop(c.world, near);
  const facing = new THREE.Quaternion().setFromAxisAngle(UP, -rad(heading));
  const skeletons = [];
  her.model.traverse(o => { if (o.isSkinnedMesh && !skeletons.includes(o.skeleton)) skeletons.push(o.skeleton); });
  const tipBones = ['LeftFinger3', 'RightFinger3'].map(name => her.model.getObjectByName(name));
  const shoulders = ['LeftUpperArm', 'RightUpperArm'].map(name => her.model.getObjectByName(name));
  const stirs = []; // the gusts in her wings: { amount, age }
  const rise = { from: 0, to: 0, seconds: 1, age: 1, now: 0 }; // her lift off the top
  her.root.visible = true;
  her.root.position.copy(top);
  her.root.quaternion.copy(facing);
  // Each wing lifts about the line across its shoulder (from the shoulder to the tip, crossed with up, turns the tip up): measured
  // once in her own pose, in her own frame.
  her.root.updateMatrixWorld(true);
  for (const skeleton of skeletons) skeleton.pose();
  her.root.updateMatrixWorld(true);
  if (!her.clips.has('spread')) her.clips.set('spread', spreadClip(skeletons));
  const axes = shoulders.map((shoulder, i) => {
    const from = shoulder.getWorldPosition(new THREE.Vector3());
    const out = tipBones[i].getWorldPosition(new THREE.Vector3()).sub(from);
    return out.cross(UP).normalize().applyQuaternion(facing.clone().invert()); // in her frame
  });
  const axis = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  her.control(dt => {
    rise.age += dt;
    const k = Math.min(1, rise.age / rise.seconds);
    rise.now = rise.from + (rise.to - rise.from) * k * k * (3 - 2 * k);
    her.root.position.copy(top);
    her.root.position.y += rise.now;
    her.root.quaternion.copy(facing);
  }, dt => {
    for (const skeleton of skeletons) skeleton.pose(); // her own pose, the wings spread, over whatever clip plays
    let swing = 0;
    for (let i = stirs.length - 1; i >= 0; i--) {
      const stir = stirs[i];
      stir.age += dt;
      if (stir.age >= STIR.last) stirs.splice(i, 1);
      else swing += stir.amount * Math.sin(stir.age * STIR.rate * Math.PI * 2) * Math.exp(-stir.age / STIR.fade) * (1 - stir.age / STIR.last);
    }
    if (swing === 0) return;
    her.root.updateMatrixWorld(true);
    shoulders.forEach((shoulder, i) => {
      if (!shoulder) return;
      axis.copy(axes[i]).applyQuaternion(her.root.quaternion);
      shoulder.parent.getWorldQuaternion(parentQ);
      turn.setFromAxisAngle(axis, rad(STIR.degrees) * Math.abs(swing) * (swing > 0 ? 1 : 0.4)); // up more than down
      if (swing < 0) turn.invert();
      shoulder.quaternion.premultiply(parentQ.clone().invert().multiply(turn).multiply(parentQ));
      shoulder.updateMatrixWorld(true);
    });
  });
  return {
    top,
    wingTips() {
      her.root.updateMatrixWorld(true);
      return tipBones.map(bone => bone.getWorldPosition(new THREE.Vector3()));
    },
    stir(amount = 1) {
      stirs.push({ amount, age: 0 });
    },
    lift(metres, seconds = 1) {
      Object.assign(rise, { from: rise.now, to: metres, seconds: Math.max(1e-3, seconds), age: 0 });
    },
    get lifted() { return rise.now; },
    release() {
      her.play('spread', { fade: 0 }); // the clips take her on from the pose she has, wings spread
      her.control(null);
    },
  };
}

/** Her own pose, the bind pose, as a clip that holds it: so a clip after the perch fades in from her spread wings, not from idle's. */
function spreadClip(skeletons) {
  const tracks = [];
  for (const skeleton of skeletons) {
    for (const bone of skeleton.bones) {
      if (tracks.some(track => track.name === `${bone.name}.quaternion`)) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, [0], bone.quaternion.toArray()));
      tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, [0], bone.position.toArray()));
    }
  }
  return new THREE.AnimationClip('spread', 1, tracks);
}

// ---------------------------------------------------------------------------------------------
// Off the top: the root the scenes hold her by, a flight along a path, and a camera that follows her.

// Her hips over her root in the fly and glide clips (engine/flier.js): a path is flown by her body, and her root hangs under it.
const HIPS = new V3(0.06, BODY_HEIGHT, 0);

/** How she flies a path: banked into its turns as the flier banks her (engine/flier.js: FLIGHT), and tipped with its climbs. */
export const FLY = {
  bank: 30, // degrees at most
  pitch: 22, // degrees up or down at most
  pitchShare: 0.6, // of the path's own slope
  edge: 0.18, // of the way at each end over which the bank and the pitch come and go (she starts and ends level)
  g: 9.81,
};

/**
 * Her root from now on, held where the scenes put it: the circle, the glide down, her sitting by Mosi and the flight back up all
 * move this one root, which her controller copies each frame (her clips play on). It is a flier's root as engine/flier.js has
 * one, so Egill rides on it: rideFlier(egill, { actor: her, root: held.root }).
 */
export function holdHer(c) {
  const her = c.flugedla.raw;
  const root = { position: her.root.position.clone(), quaternion: her.root.quaternion.clone() };
  her.control(() => {
    her.root.position.copy(root.position);
    her.root.quaternion.copy(root.quaternion);
  });
  return {
    root,
    /** Her feet at `position`, level, facing `heading` (degrees). */
    place(position, heading) {
      root.position.copy(position);
      root.quaternion.setFromAxisAngle(UP, -rad(heading));
    },
    /** Which way she faces (degrees). */
    get heading() {
      const ahead = X.clone().applyQuaternion(root.quaternion);
      return deg(Math.atan2(ahead.z, ahead.x));
    },
  };
}

/**
 * She flies along `points` ([x, y, z]: where her feet would be, were she level; the first is where they are now) in `seconds`,
 * easing off and easing in at the end, facing along the way, banked into its turns and tipped with its climbs, and turned to `face`
 * (degrees) over the last `turn` of the way when it is given (she lands and turns on the spot). She sets off facing the way she
 * faced, and turns to the way over its first `turnIn`. `clips`: [share of the time, clip, fade] as she goes (glide, fly, takeOff,
 * land). With `speed` (m/s) she comes onto the way already flying at it, from a flight, and only slows, to rest at its end: the way
 * then takes landingTime(points, speed) seconds, not `seconds`. A generator: yield* it. Each frame's place is in c.flying while she
 * flies.
 */
export function* flyPath(s, c, held, { points, seconds, clips = [], face = null, turn = 0.2, turnIn = 0.2, speed: from = 0 }) {
  const her = c.flugedla.raw;
  const curve = pathCurve(points);
  const length = curve.getLength();
  if (from > 0) seconds = (2 * length) / from;
  const step = 1.5 / length; // of the way: 1.5 m
  const at = new V3(), a = new V3(), b = new V3(), body = new V3();
  const q = new THREE.Quaternion(), r = new THREE.Quaternion();
  const along = k => {
    curve.getPointAt(clamp(k - step, 0, 1), a);
    curve.getPointAt(clamp(k + step, 0, 1), b);
    return Math.atan2(b.z - a.z, b.x - a.x);
  };
  const begun = new Set();
  const start = s.time;
  const facing = rad(held.heading); // the way she faces as she sets off
  // The turns at the start and the end, each kept on its side as the way's own heading goes round (the circle's does), or the
  // shorter way round would change sides partway and turn her in a jump.
  const near = (x, to) => x + 2 * Math.PI * Math.round((to - x) / (2 * Math.PI));
  let turnFrom = null, turnTo = null;
  const flying = (c.flying = { k: 0, heading: 0, bank: 0, pitch: 0, speed: 0 });
  try {
    for (;;) {
      const u = Math.min(1, (s.time - start) / seconds);
      clips.forEach(([share, name, fade = 0.6], i) => {
        if (u >= share && !begun.has(i)) {
          begun.add(i);
          her.play(name, { fade });
        }
      });
      // eased off and in; or, coming from a flight, slowing evenly from `from` to rest
      const k = from > 0 ? 1 - (1 - u) * (1 - u) : u * u * (3 - 2 * u);
      const speed = from > 0 ? from * (1 - u) : (length * 6 * u * (1 - u)) / seconds; // m/s along the way
      // a turn's bank (as the flier's: the turn's rate at this speed against gravity) and a climb's pitch, both easing in and out
      const rate = wrap(along(k + step) - along(k - step)) / (2 * step * length); // radians a metre
      let heading = along(k);
      const climb = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
      const edge = smooth(Math.min(u, 1 - u) / FLY.edge);
      const bank = clamp(deg(Math.atan((speed * speed * rate) / FLY.g)), -FLY.bank, FLY.bank) * edge;
      const pitch = clamp(deg(climb) * FLY.pitchShare, -FLY.pitch, FLY.pitch) * edge;
      if (turnIn > 0 && u < turnIn) {
        turnFrom = near(wrap(heading - facing), turnFrom ?? wrap(heading - facing));
        heading = facing + turnFrom * smooth(u / turnIn);
      }
      if (face !== null && u > 1 - turn) {
        turnTo = near(wrap(rad(face) - heading), turnTo ?? wrap(rad(face) - heading));
        heading += turnTo * smooth((u - (1 - turn)) / turn);
      }
      heading = wrap(heading);
      curve.getPointAt(k, at);
      q.setFromAxisAngle(UP, -heading).multiply(r.setFromAxisAngle(Z, rad(pitch))).multiply(r.setFromAxisAngle(X, rad(bank)));
      body.copy(HIPS).applyQuaternion(r.setFromAxisAngle(UP, -heading)).add(at); // her body over the point, as it is when she is level
      held.root.quaternion.copy(q);
      held.root.position.copy(HIPS).applyQuaternion(q).negate().add(body); // her root under it, turned with her
      Object.assign(flying, { k, heading: deg(heading), bank, pitch, speed });
      if (u >= 1) break;
      yield;
    }
  } finally {
    if (c.flying === flying) c.flying = null;
  }
}

/** The way flyPath flies through `points` ([x, y, z] each): a centripetal Catmull–Rom curve. */
export function pathCurve(points) {
  return new THREE.CatmullRomCurve3(points.map(p => new V3(...p)), false, 'centripetal');
}

/**
 * Coming onto `points` at `speed` (flyPath's speed): the seconds the way takes, and when (seconds from its start) her feet first come
 * down to `level` on it, or null if they never do.
 */
export function landingTime(points, speed, level) {
  const curve = pathCurve(points);
  const seconds = (2 * curve.getLength()) / speed;
  const at = new V3();
  let k = null;
  for (let i = 0; i <= 400 && k === null; i++) if (curve.getPointAt(i / 400, at).y <= level) k = i / 400;
  return { seconds, touch: k === null ? null : seconds * (1 - Math.sqrt(1 - k)) };
}

/**
 * A camera that stands at `position` and turns to follow her body (a little behind it, `lag` seconds, as a hand on a tripod would),
 * from where the camera looked (or `from`): for her flights, whose way no still shot holds. Its lens goes to `fov` over `zoom`
 * seconds from the one it has. The director's drive; returns its handle.
 */
export function watchHer(c, label, { position, fov = 50, lag = 0.45, from = null, zoom = 0 }) {
  const her = c.flugedla.raw;
  const at = new V3(...position);
  const goal = new V3();
  const aim = new V3();
  let started = false;
  let lens = null; // { from, age }
  return c.world.director.drive(label, (rig, dt) => {
    goal.copy(HIPS).applyQuaternion(her.root.quaternion).add(her.root.position);
    if (!started) {
      started = true;
      aim.copy(from ? new V3(...from) : rig.target);
      lens = { from: rig.fov, age: 0 };
    }
    aim.lerp(goal, 1 - Math.exp(-dt / lag));
    lens.age += dt;
    rig.position.copy(at);
    rig.target.copy(aim);
    rig.fov = zoom > 0 ? lens.from + (fov - lens.from) * smooth(lens.age / zoom) : fov;
    if ('roll' in rig) rig.roll = 0;
  });
}

/**
 * Her wingbeats as they happen: a function that, called every frame, says true once in each loop of her `fly` clip, as its
 * downstroke begins (FLAP.at of the loop: the clip starts with the wings up, takeOff's last pose), and false otherwise; nothing while
 * another clip has most of her pose (gliding, landing, idle). For a flap sound that follows the wings (the juice review's item 6).
 */
export const FLAP = { clip: 'fly', at: 0.04, weight: 0.5 };
export function wingFlaps(her) {
  let last = null; // the loop's share at the last call, while fly leads
  return () => {
    const clip = her.clips?.get?.(FLAP.clip);
    const action = clip ? her.mixer?.existingAction?.(clip) : null;
    if (!action || !action.isRunning() || action.getEffectiveWeight() < FLAP.weight || !(clip.duration > 0)) {
      last = null;
      return false;
    }
    const now = (((action.time % clip.duration) + clip.duration) % clip.duration) / clip.duration;
    const was = last ?? 0;
    last = now;
    return (was < FLAP.at && now >= FLAP.at) || (now < was && now >= FLAP.at); // crossed it, or looped past it in one frame
  };
}

const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
const smooth = x => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};
