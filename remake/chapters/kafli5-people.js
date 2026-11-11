// The people in the music video (chapter 5, scene 6): what Egill, Mosi, Flugeðla and Slóeðla do in each part of the set. kafli5.js
// makes one of these as the set starts and gives it every frame of the set; everything here is a pure function of the dance beat
// (kafli5-video.js), so the rewind spools it back and Stoppdans freezes it.
//
// The dances themselves are numbers (kafli5-people-score.js: what each of the four does at each beat; the storyboard is
// qa/remake/kafli5/myndband/index.html). Here they are laid on the actors:
//   Egill     his idle, hop and wave clips, each at the time the score gives it (never run by the mixer), his root's bounce and
//             twist, and his arms reached to where the score has his hands (up, clapping, cupped at his mouth)
//   Mosi      he has an idle and a walk only, so all of it is made here: his root sways and rears about his hind feet, his feet
//             are kept on the ground or lifted, his head nods, his tail swings
//   Flugeðla  her clips at the score's times (her take-off, flight and landing along the score's flights), her wings opened to
//             her own spread pose and lifted about her shoulders, her bow
//   Slóeðla   stays under her own life (kafli5-sloedla.js): the score is handed to her.dance, which lays it on gently
// Each of the first three is taken with actor.control for the set and given back as found when it is over (dispose).
import * as THREE from 'three';
import { egillAt, mosiAt, flugedlaAt, sloedlaAt } from './kafli5-people-score.js';
import { BODY_HEIGHT } from './kafli4-route.js';

const V3 = THREE.Vector3;
const Q = THREE.Quaternion;
const rad = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const UP = new V3(0, 1, 0);
const AHEAD = new V3(1, 0, 0); // a model faces +X
const RIGHT = new V3(0, 0, 1); // and its right side is +Z
const HER_HEAD = { actor: 'sloedla', part: 'head' }; // whom they looked at when the set began (kafli5.js theWholeSong)

/** Where Egill's hands go, in his own frame ([ahead, up, to that hand's side], m): his arms are 0.27 m long. */
export const HANDS = {
  up: [0.02, 1.2, 0.3], // up and apart, a V over his head
  pump: [0.17, 0.82, 0.13], // a fist in front of his shoulder
  open: [0.16, 0.7, 0.21], // apart in front of him, between two claps
  clap: [0.2, 0.68, 0.012], // together
};
/** His hands cupped at his mouth: from his head bone, in his own frame ([ahead, up, to that hand's side], m). */
export const CUP = [0.115, 0.015, 0.075];
const SHRUG = 0.035; // m his shoulders come up as his hands go up (his arms are short: his hands just clear his head)
const ELBOW = [-0.25, -0.55, 0.8]; // the way his elbows point as his arms bend (his own frame: back, down and out)
/** Mosi's hind feet from his root, along him (m): he rears about them. */
const HIND = -0.05;
// Flugeðla's hips over her root as she flies (engine/flier.js): a flight's way is flown by her body, and her root hangs under it.
const HIPS = new V3(0.06, BODY_HEIGHT, 0);
const WING = ['UpperArm', 'Forearm', 'Wrist', 'Claws', 'Finger1', 'Finger2', 'Finger3'];
const NECK = [['Neck', 0.2], ['Neck2', 0.25], ['Neck3', 0.25], ['Head', 0.3]]; // her bow, shared down her neck

const parentQ = new Q();
const localQ = new Q();
/** Turn `bone` by `q`, a turn in the world's frame, about its own joint. */
function turnBone(bone, q) {
  bone.parent.getWorldQuaternion(parentQ);
  localQ.copy(parentQ).invert().multiply(q).multiply(parentQ);
  bone.quaternion.premultiply(localQ);
  bone.updateMatrixWorld(true);
}

/**
 * The bones a dance lays a pose on: `hold()` right after the clips keeps what the clips gave them, `restore()` before the next
 * frame's clips puts that back (the mixer leaves a bone alone while its clip's value stands still, and a pose would pile up).
 */
function overlay(bones) {
  const kept = bones.filter(Boolean).map(bone => ({ bone, q: new Q(), p: new V3(), held: false }));
  return {
    hold() {
      for (const k of kept) {
        k.q.copy(k.bone.quaternion);
        k.p.copy(k.bone.position);
        k.held = true;
      }
    },
    restore() {
      for (const k of kept) {
        if (!k.held) continue;
        k.bone.quaternion.copy(k.q);
        k.bone.position.copy(k.p);
        k.held = false;
      }
    },
  };
}

/** Runs `measure()` with `actor` in its own pose (the model's bind pose) at the origin, facing +X, and puts it back as it was. */
function inOwnPose(actor, measure) {
  const { root, model } = actor;
  const was = { position: root.position.clone(), quaternion: root.quaternion.clone(), bones: [] };
  const skeletons = [];
  model.traverse(o => { if (o.isSkinnedMesh && !skeletons.includes(o.skeleton)) skeletons.push(o.skeleton); });
  for (const skeleton of skeletons) for (const bone of skeleton.bones) was.bones.push([bone, bone.position.clone(), bone.quaternion.clone(), bone.scale.clone()]);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  for (const skeleton of skeletons) skeleton.pose();
  root.updateMatrixWorld(true);
  try {
    return measure();
  } finally {
    for (const [bone, p, q, s] of was.bones) {
      bone.position.copy(p);
      bone.quaternion.copy(q);
      bone.scale.copy(s);
    }
    root.position.copy(was.position);
    root.quaternion.copy(was.quaternion);
    root.updateMatrixWorld(true);
  }
}

/**
 * An actor's clips, held for a dance: each is shown at the weight and the time the score gives it and never run by the mixer.
 * `rest` is the clip the actor was in (it has the weight the others leave); `release()` gives the mixer back as it was found.
 */
function holdClips(actor, names) {
  const { mixer, clips } = actor;
  const actions = new Map();
  let rest = null;
  for (const name of names) {
    const clip = clips.get(name);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    // the clip the actor is in: the running one that is not fading out
    const fading = action._weightInterpolant;
    const going = action.isRunning() && (fading ? fading.sampleValues[1] : action.getEffectiveWeight()) > 0.5;
    actions.set(name, action);
    if (going && !rest) rest = { name, action, scale: action.timeScale || 1, offset: null };
  }
  rest ??= actions.has('idle') ? { name: 'idle', action: actions.get('idle'), scale: 1, offset: null } : null;
  for (const [name, action] of actions) {
    if (name !== rest?.name) {
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.play();
    }
    action.stopFading();
    action.stopWarping();
    action.enabled = true;
    action.timeScale = 0;
    action.weight = name === rest?.name ? 1 : 0;
  }
  return {
    rest: rest?.name ?? null,
    has: name => actions.has(name),
    /** `name` at `weight` (0..1), `time` s into it. */
    show(name, weight, time) {
      const action = actions.get(name);
      if (!action) return;
      action.weight = clamp(weight, 0, 1);
      const length = action.getClip().duration;
      action.time = clamp(time, 0, length);
    },
    /** A looping clip `seconds` into it, from where it was when the dance began. */
    loop(name, weight, seconds) {
      const action = actions.get(name);
      if (!action) return;
      const length = action.getClip().duration;
      if (name === rest?.name) {
        rest.offset ??= action.time - seconds;
        seconds += rest.offset;
      }
      action.weight = clamp(weight, 0, 1);
      action.time = ((seconds % length) + length) % length;
    },
    release() {
      for (const [name, action] of actions) {
        if (name === rest?.name) {
          action.weight = 1;
          action.timeScale = rest.scale;
          if (name !== 'idle') action.time = 0; // a clip starts as the idle stands: no pose leaps as the scene fades on from it
        } else action.stop();
      }
    },
  };
}

const want = new V3();
const have = new V3();
const turnQ = new Q();
const partQ = new Q();
const rootInverse = new Q();
/** Turns `neck` and `head` so the head faces `point` ([x, y, z]) as far as `weight` (0..1), within `yaw` and `pitch` degrees of ahead. */
function faceTo({ root, neck, head, forward }, point, weight, yaw = 70, pitch = 35) {
  if (!head || weight < 0.002) return;
  head.getWorldPosition(have);
  rootInverse.copy(root.quaternion).invert();
  want.set(point[0], point[1], point[2]).sub(have).applyQuaternion(rootInverse);
  const aside = clamp(Math.atan2(want.z, want.x), -rad(yaw), rad(yaw));
  const upward = clamp(Math.atan2(want.y, Math.hypot(want.x, want.z)), -rad(pitch), rad(pitch));
  want.set(Math.cos(upward) * Math.cos(aside), Math.sin(upward), Math.cos(upward) * Math.sin(aside)).applyQuaternion(root.quaternion);
  have.copy(forward).applyQuaternion(head.getWorldQuaternion(partQ));
  turnQ.setFromUnitVectors(have, want);
  partQ.identity().slerp(turnQ, weight);
  if (neck) turnBone(neck, turnQ.identity().slerp(partQ, 0.4));
  turnBone(head, turnQ.identity().slerp(partQ, 0.6));
}
/** The way `head` faces in its own frame when the model, in its own pose, faces +X. */
const forwardOf = head => (head ? AHEAD.clone().applyQuaternion(head.getWorldQuaternion(new Q()).invert()) : AHEAD.clone());

const S = new V3();
const E = new V3();
const H = new V3();
const along = new V3();
const lower = new V3();
const bend = new V3();
const armQ = new Q();
/** Bends an arm (`upper`, `lower`, `hand` bones) so its hand is at `goal` (world), the elbow pointing the way `pole` (world) does. */
function reach(arm, goal, pole) {
  arm.upper.getWorldPosition(S);
  arm.lower.getWorldPosition(E);
  arm.hand.getWorldPosition(H);
  const [l1, l2] = [S.distanceTo(E), E.distanceTo(H)];
  const far = clamp(S.distanceTo(goal), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  // the forearm straight on from the upper arm, then bent at the elbow as far as the reach asks, away from the pole
  along.copy(E).sub(S).normalize();
  lower.copy(H).sub(E).normalize();
  turnBone(arm.lower, armQ.setFromUnitVectors(lower, along));
  const inside = Math.acos(clamp((l1 * l1 + l2 * l2 - far * far) / (2 * l1 * l2), -1, 1));
  bend.copy(pole).cross(along);
  if (bend.lengthSq() > 1e-8) turnBone(arm.lower, armQ.setFromAxisAngle(bend.normalize(), Math.PI - inside));
  // and the whole arm turned so the hand is on the line to the goal
  arm.hand.getWorldPosition(H);
  H.sub(S).normalize();
  along.copy(goal).sub(S).normalize();
  turnBone(arm.upper, armQ.setFromUnitVectors(H, along));
}

// ---------------------------------------------------------------------------------------------

/**
 * Where a dancer stood when its dance took it, and `back()`, which stands it there again. The dances write a whole turn on the
 * root (its quaternion: a heading, a rear, a roll), and three reads that back into the root's angles; past a quarter turn the
 * heading comes back as half turns about the two other axes. A heading alone does not undo those (actor.place sets one angle), and
 * the engine's feet read that one angle: Mosi's legs then stood one way and his body another when he turned to the roar (the
 * owner's report of 2026-11-11). So the root's own angles are kept and given back.
 */
function homeOf(actor) {
  const { root } = actor;
  const home = {
    position: root.position.clone(),
    heading: actor.heading,
    rotation: root.rotation.clone(),
    back() {
      root.rotation.copy(home.rotation);
      actor.place(home.position.x, home.position.z, home.heading);
    },
  };
  return home;
}

function egillRig(c, clock, options) {
  const actor = c.egill?.raw;
  if (!actor?.control || !actor.model) return null;
  const { root, model } = actor;
  const bone = name => model.getObjectByName(name);
  const home = homeOf(actor);
  const head = bone('Head');
  const neck = bone('Neck');
  const spine = bone('Spine');
  const arms = [['Right', 1], ['Left', -1]].map(([side, sign]) => ({ key: side.toLowerCase(), sign, upper: bone(`${side}UpperArm`), lower: bone(`${side}LowerArm`), hand: bone(`${side}Hand`) }))
    .filter(arm => arm.upper && arm.lower && arm.hand);
  const forward = inOwnPose(actor, () => forwardOf(head));
  const layer = overlay([spine, neck, head, ...arms.flatMap(arm => [arm.upper, arm.lower])]);
  const clips = holdClips(actor, ['idle', 'hop', 'wave']);
  const q = new Q();
  const goal = new V3();
  const to = new V3();
  const pole = new V3();
  const side = new V3();
  let p = null;
  actor.lookAt(null);
  actor.control(() => {
    layer.restore();
    p = egillAt(clock(), options);
    root.position.set(home.position.x, home.position.y + p.lift, home.position.z);
    root.quaternion.setFromAxisAngle(UP, -rad(home.heading + p.yaw + p.spin)).multiply(q.setFromAxisAngle(AHEAD, rad(p.roll)));
    const wave = p.wave.weight * (1 - p.hop.weight);
    clips.show('hop', p.hop.weight, p.hop.time);
    clips.show('wave', wave, p.wave.time);
    clips.loop(clips.rest, Math.max(0, 1 - p.hop.weight - wave), p.clock);
  }, () => {
    layer.hold();
    if (!p) return;
    root.updateMatrixWorld(true);
    // he leans into a shout from his waist
    if (spine && p.lean) turnBone(spine, q.setFromAxisAngle(side.copy(RIGHT).applyQuaternion(root.quaternion), -rad(p.lean)));
    faceTo({ root, neck, head, forward }, p.look, p.looking, 70, 40);
    for (const arm of arms) {
      const poses = p.arms[arm.key];
      let sum = 0;
      if (poses.up > 0) {
        arm.upper.getWorldPosition(to).y += SHRUG * poses.up;
        arm.upper.position.copy(arm.upper.parent.worldToLocal(to));
        arm.upper.updateMatrixWorld(true);
      }
      arm.hand.getWorldPosition(H);
      goal.set(0, 0, 0);
      for (const [name, weight] of Object.entries(poses)) {
        if (weight <= 0) continue;
        if (name === 'cup') head.getWorldPosition(to).add(pole.set(CUP[0], CUP[1], CUP[2] * arm.sign).applyQuaternion(root.quaternion));
        else if (HANDS[name]) root.localToWorld(to.set(HANDS[name][0], HANDS[name][1], HANDS[name][2] * arm.sign));
        else continue;
        goal.addScaledVector(to.sub(H), weight);
        sum += weight;
      }
      if (sum < 0.002) continue;
      goal.multiplyScalar(1 / Math.max(1, sum)).add(arm.hand.getWorldPosition(H));
      reach(arm, goal, pole.set(ELBOW[0], ELBOW[1], ELBOW[2] * arm.sign).applyQuaternion(root.quaternion));
    }
  });
  return {
    name: 'egill',
    release() {
      layer.restore();
      clips.release();
      actor.control(null);
      home.back();
      actor.lookAt(HER_HEAD, { weight: 0.8, maxAngle: 80, maxPitch: 35 });
    },
  };
}

function mosiRig(c, clock, options) {
  const actor = c.mosi?.raw;
  if (!actor?.control || !actor.model) return null;
  const { root, model } = actor;
  const bone = name => model.getObjectByName(name);
  const home = homeOf(actor);
  const head = bone('Head');
  const neck = bone('Neck');
  const tail = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5'].map(bone).filter(Boolean);
  const feet = [['fl', 'FrontFootL', true], ['fr', 'FrontFootR', true], ['bl', 'BackFootL', false], ['br', 'BackFootR', false]]
    .map(([key, name, front]) => ({ key, front, bone: bone(name) })).filter(foot => foot.bone);
  // in his own pose: the way his head faces, and how high each foot's bone is over his ground
  const forward = inOwnPose(actor, () => {
    for (const foot of feet) foot.rest = foot.bone.getWorldPosition(new V3()).y;
    return forwardOf(head);
  });
  const layer = overlay([neck, head, ...tail, ...feet.map(foot => foot.bone)]);
  const clips = holdClips(actor, ['idle']);
  const yawQ = new Q();
  const q = new Q();
  const pivot = new V3();
  const turned = new V3();
  const side = new V3();
  const at = new V3();
  let p = null;
  actor.lookAt(null);
  actor.control(() => {
    layer.restore();
    p = mosiAt(clock(), options);
    // his body sways to his right and his left, and rears about his hind feet
    yawQ.setFromAxisAngle(UP, -rad(home.heading + p.yaw));
    root.quaternion.copy(yawQ).multiply(q.setFromAxisAngle(RIGHT, rad(p.rear))).multiply(q.setFromAxisAngle(AHEAD, rad(p.roll)));
    side.copy(RIGHT).applyQuaternion(yawQ);
    pivot.set(HIND, 0, 0).applyQuaternion(yawQ);
    turned.set(HIND, 0, 0).applyQuaternion(root.quaternion);
    root.position.copy(home.position).addScaledVector(side, p.side).add(pivot).sub(turned);
    root.position.y += p.lift;
    clips.loop(clips.rest, 1, p.clock);
  }, () => {
    layer.hold();
    if (!p) return;
    root.updateMatrixWorld(true);
    // his feet stay on his ground as his body sways and sinks over them (his forefeet come up with a rear), or are lifted
    const rearing = clamp(p.rear / 3, 0, 1);
    for (const foot of feet) {
      foot.bone.getWorldPosition(at);
      const planted = home.position.y + foot.rest + p.feet[foot.key];
      at.y = foot.front ? planted + (at.y + p.feet[foot.key] - planted) * rearing : planted;
      foot.bone.position.copy(foot.bone.parent.worldToLocal(at));
      foot.bone.updateMatrixWorld(true);
    }
    faceTo({ root, neck, head, forward }, p.look, p.looking, 55, 25);
    if (p.nod) {
      side.copy(RIGHT).applyQuaternion(root.quaternion);
      if (neck) turnBone(neck, q.setFromAxisAngle(side, rad(p.nod * 0.4)));
      if (head) turnBone(head, q.setFromAxisAngle(side, rad(p.nod * 0.6)));
    }
    if (p.tail) for (const link of tail) turnBone(link, q.setFromAxisAngle(UP, -rad(p.tail / tail.length)));
  });
  return {
    name: 'mosi',
    release() {
      layer.restore();
      clips.release();
      actor.control(null);
      home.back();
      actor.lookAt(HER_HEAD, { weight: 0.8, maxAngle: 80, maxPitch: 35 });
    },
  };
}

function flugedlaRig(c, clock, options) {
  const actor = c.flugedla?.raw;
  if (!actor?.control || !actor.model) return null;
  const { root, model } = actor;
  const bone = name => model.getObjectByName(name);
  const home = homeOf(actor);
  const head = bone('Head');
  const neck = bone('Neck3');
  const chain = NECK.map(([name, share]) => ({ bone: bone(name), share })).filter(link => link.bone);
  const wings = ['Left', 'Right'].map(side => ({
    key: side.toLowerCase(), shoulder: bone(`${side}UpperArm`), tip: bone(`${side}Finger3`), axis: new V3(),
    bones: WING.map(name => bone(`${side}${name}`)).filter(Boolean).map(b => ({ bone: b, spread: new Q() })),
  })).filter(wing => wing.shoulder && wing.tip);
  // in her own pose her wings are spread: each wing bone's turn there, and the line each wing lifts about (across its shoulder)
  const forward = inOwnPose(actor, () => {
    for (const wing of wings) {
      for (const b of wing.bones) b.spread.copy(b.bone.quaternion);
      wing.axis.copy(wing.tip.getWorldPosition(new V3())).sub(wing.shoulder.getWorldPosition(new V3())).cross(UP).normalize();
    }
    return forwardOf(head);
  });
  const layer = overlay([...chain.map(link => link.bone), ...wings.flatMap(wing => wing.bones.map(b => b.bone))]);
  const clips = holdClips(actor, ['idle', 'happy', 'takeOff', 'fly', 'land']);
  const yawQ = new Q();
  const q = new Q();
  const body = new V3();
  const hips = new V3();
  const axis = new V3();
  let p = null;
  let blinked = false;
  const sink = home.position.y - flugedlaAt({ beat: 0, setBeat: 0 }, options).at[1]; // her ground where she stands, against the score's
  actor.lookAt(null);
  actor.control(() => {
    layer.restore();
    p = flugedlaAt(clock(), options);
    // her body is on the flight's way (or over her feet), turned, tipped and banked about itself; her root hangs under it
    yawQ.setFromAxisAngle(UP, -rad(p.heading));
    root.quaternion.copy(yawQ).multiply(q.setFromAxisAngle(RIGHT, rad(p.pitch - 0.35 * p.bow))).multiply(q.setFromAxisAngle(AHEAD, rad(p.bank)));
    body.copy(HIPS).applyQuaternion(yawQ).add(hips.set(p.at[0], p.at[1] + sink + p.lift, p.at[2]));
    root.position.copy(body).sub(hips.copy(HIPS).applyQuaternion(root.quaternion));
    if (p.air < 1e-6 && Math.abs(p.bow) < 1e-6) root.position.set(p.at[0], p.at[1] + sink + p.lift, p.at[2]); // on her feet: exactly where she stands
    const { takeOff, fly, land, happy } = p.clips;
    clips.show('takeOff', takeOff.weight, takeOff.time);
    clips.show('land', land.weight, land.time);
    clips.show('fly', fly.weight, fly.time);
    // on her feet: her happy clip, a bar long on the dance beat, over her idle
    const flying = Math.min(1, takeOff.weight + land.weight + fly.weight);
    const glad = happy.weight * (1 - flying);
    clips.show('happy', glad, happy.time);
    clips.loop('idle', Math.max(0, 1 - flying - glad), p.clock);
  }, () => {
    layer.hold();
    if (!p) return;
    root.updateMatrixWorld(true);
    for (const wing of wings) {
      const spread = p.spread[wing.key];
      if (spread > 0) {
        for (const b of wing.bones) b.bone.quaternion.slerp(b.spread, spread);
        wing.shoulder.updateMatrixWorld(true);
      }
      const lifted = p.raise[wing.key];
      if (lifted) turnBone(wing.shoulder, q.setFromAxisAngle(axis.copy(wing.axis).applyQuaternion(root.quaternion), rad(lifted)));
    }
    faceTo({ root, neck, head, forward }, p.look, p.looking * (1 - p.air), 70, 30);
    if (p.bow) {
      axis.copy(RIGHT).applyQuaternion(root.quaternion);
      for (const link of chain) turnBone(link.bone, q.setFromAxisAngle(axis, -rad(p.bow * link.share)));
    }
    if (p.blink && !blinked) actor.blink?.();
    blinked = p.blink;
  });
  return {
    name: 'flugedla',
    release() {
      layer.restore();
      clips.release();
      actor.control(null);
      home.back();
      actor.lookAt(HER_HEAD, { weight: 0.6, maxAngle: 80, maxPitch: 35 });
    },
  };
}

/**
 * The people's dances for the chapter's state `c` (c.mosi, c.egill, c.flugedla, c.sloedla: the scene's actors; c.her: Slóeðla's
 * life, kafli5-sloedla.js; c.reduced: less motion asked for).
 * Returns { update({ beat, setBeat, frozen, rewinding, section }), cue(event), dispose() }:
 *   update   every frame of the set: `beat` is the dance beat, `setBeat` the set's own, `section` the set's part now
 *   cue      every event of the set as it comes (kafli5.js onSet: the camera's cuts, sections, her lines, calls and the other cues)
 *   dispose  the set is over: everyone as they stood, given back to the scene
 */
export function createPeople(c) {
  const now = { beat: 0, setBeat: 0 };
  const clock = () => now;
  const options = { reduced: Boolean(c.reduced) };
  let live = true;
  const rigs = [egillRig, mosiRig, flugedlaRig].map(rig => rig(c, clock, options)).filter(Boolean);
  c.her?.dance?.(() => sloedlaAt(now, options));
  return {
    rigs: rigs.map(rig => rig.name),
    update(video) {
      now.beat = video.beat;
      now.setBeat = video.setBeat;
    },
    cue() {},
    dispose() {
      if (!live) return;
      live = false;
      for (const rig of rigs) rig.release();
      c.her?.dance?.(null);
    },
  };
}
