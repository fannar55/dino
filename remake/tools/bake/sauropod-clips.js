import * as THREE from 'three';
import { TAU, Y, Z, q, turn, bump, ease, spline, WALK, walkSettings, createSampler, createGait } from './quadruped-clips.js';

// Clips for a long-necked four-legged character (a sauropod, Þórseðla) rigged by quadruped-rig.js
// with a raised neck of several bones and a long tail (`curve`). Rest rotations are identity, so every
// bone turns about the character's own axes: X forward, Y up, Z its right side. Angles are in radians.
//
//   idle       6.0 s   breathing slowly, the long neck swaying and looking about, the tail swinging
//   walk       (SAUROPOD_WALK) a slow, heavy four-beat walk on planted feet, the neck steady
//   kink       2.8 s   a friendly nod: the chin lifts a little, the head dips twice, the second time
//                      less, and comes back up
//   lowerHead  4.5 s   once: her head comes down in front of her to a child's eye height, the face
//                      turned a little down toward him, and stays there
//   liftUp     8.0 s   once: from that lowered head the neck rises slowly to its full height, higher
//                      than she stands at rest, the head level all the way, and stays there
//   happy      2.4 s   a happy little rear: she rocks back, her front feet leave the ground, comes down
//                      with a soft stamp and wiggles her neck and tail
//
// The neck is posed by where its stretches point (`neckPose`): each stretch from one neck joint to the
// next turns from where it points at rest, and the head turns on top of the last one. The lowered and
// the raised neck are such shapes (LOWERED, RAISED); lowerHead is solved so that the eyes (the face
// pass's, given as `eyes`) come down to `greet` metres, a child's eye height.
//
// lowerHead and liftUp do not loop: they carry `once` in their userData (extras in the GLB), and the
// actor plays such a clip once and holds its last pose (engine/actor.js). liftUp starts from exactly
// the pose lowerHead ends in. Every clip keys every bone of the spine, neck and tail chains; only the
// walk and happy key the legs, so footing keeps the feet where they stand in the others.

const rad = THREE.MathUtils.degToRad;

/** The walk: slower and heavier than WALK, three feet down most of the time, a short heel peel. */
export const SAUROPOD_WALK = {
  ...WALK,
  duty: 0.62,
  arc: 0.03,
  lift: 0.006,
  peel: 0.14,
  blur: 0.05,
  // A slow walk for legs whose pivots stand h metres above the ground: a stride of 0.9 h at a
  // Froude number of 0.025, about 1 m/s on a 22 m sauropod.
  defaults: h => {
    const stride = 0.9 * h;
    return { stride, cycle: stride / Math.sqrt(0.025 * 9.81 * h) };
  },
};

// Where the neck's stretches point (degrees up from level, the body at rest), from the chest to the
// head, and the head's pitch: lowered in front of her (the neck coming down in one curve, the face
// tipped a little down), and raised to its full height (the head level).
export const LOWERED = { neck: [0, -20, -40, -48, -38, -20], head: -10 };
export const RAISED = { neck: [17, 56, 64, 67, 66, 60], head: 0 };

export function authorSauropodClips(rig, options = {}) {
  const { bones, joints, H, chains } = rig;
  const { greet = 0.95, eyes = null, ...walkOptions } = options;
  const walk = walkSettings(rig, SAUROPOD_WALK, walkOptions);
  const { sample, rest, reset } = createSampler(rig);

  // --- the neck ------------------------------------------------------------------------------------------
  const neckBones = chains.neck.slice(0, -1); // Neck .. NeckN
  const owners = ['Chest', ...neckBones]; // each holds the stretch from its joint to the next
  const ends = [...neckBones, 'Head'];
  const restAngle = owners.map((n, i) => Math.atan2(joints[ends[i]].y - joints[n].y, joints[ends[i]].x - joints[n].x));
  const toTurns = shape => shape.neck.map((a, i) => rad(a) - restAngle[i]);
  const lowered = toTurns(LOWERED), raised = toTurns(RAISED);
  /**
   * Pose the chest, neck and head so that the stretches turn by `turns` (radians, pitch, from rest)
   * and the head by `head` (its pitch from level), on top of the pitch the spine already gives the
   * chest (`under`); `yaw` adds a turn about the vertical to each bone (chest first, head last).
   */
  function neckPose(turns, head, under = 0, yaw = null) {
    owners.forEach((n, i) => {
      bones[n].quaternion.copy(turn(yaw?.[i] ?? 0, 0, turns[i] - (i ? turns[i - 1] : under)));
    });
    bones.Head.quaternion.copy(turn(yaw?.[owners.length] ?? 0, 0, head - turns.at(-1)));
  }
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  // The eyes' midpoint in the bind pose (the face pass finds them; without them, a point in front of
  // the head's joint), carried by the head.
  const eyePoint = eyes ? new THREE.Vector3(...eyes) : joints.Head.clone().add(new THREE.Vector3(0.05 * H, 0.03 * H, 0));
  const eyeLocal = eyePoint.clone().sub(joints.Head); // in the Head bone's frame (identity rest rotations)
  const eyesNow = () => { bones.root.updateMatrixWorld(true); return bones.Head.localToWorld(eyeLocal.clone()); };
  // How far the lowered shape is taken so the eyes come down to `greet` (bisection; deeper is lower).
  let depth = 1;
  {
    const heightAt = d => { reset(); neckPose(lowered.map(t => d * t), rad(LOWERED.head)); return eyesNow().y; };
    let lo = 0.3, hi = 1.6;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (heightAt(mid) > greet) lo = mid; else hi = mid; }
    depth = (lo + hi) / 2;
    reset();
  }
  const low = lowered.map(t => depth * t);

  // The tail sways in a wave running back from the hips, more toward the tip.
  const tail = chains.tail;
  const sway = (u, amplitude, wave) => tail.forEach((n, i) => {
    const k = i / (tail.length - 1);
    bones[n].quaternion.premultiply(q(Y, amplitude * (0.45 + 0.55 * k) * Math.sin(TAU * u - wave * k)));
  });

  // --- idle --------------------------------------------------------------------------------------------
  // A slow breath, the neck drifting a little to one side and back in a wave from its base, the head
  // looking about on top, and the tail swinging.
  const idle = u => {
    const breath = Math.sin(TAU * u);
    bones.Hips.position.y += 0.0025 * H * breath;
    bones.Spine.quaternion.copy(turn(0, 0, 0.003 * breath));
    const lift = 0.012 * Math.sin(TAU * u + 0.5);
    const turns = owners.map((_, i) => (i ? lift * (0.4 + 0.12 * i) : -0.004 * Math.sin(TAU * u + 0.3)));
    const yaw = owners.map((_, i) => (i ? 0.016 * Math.sin(TAU * u + 0.8 - 0.3 * i) : 0));
    yaw.push(0.03 * Math.sin(TAU * u + 2.2));
    neckPose(turns, 0.015 * Math.sin(TAU * u + 1.6) + 0.006 * Math.sin(2 * TAU * u), 0.003 * breath, yaw);
    bones.Head.quaternion.multiply(q(new THREE.Vector3(1, 0, 0), 0.012 * Math.sin(2 * TAU * u)));
    sway(u, 0.022, 2.2);
  };

  // --- walk --------------------------------------------------------------------------------------------
  // As the quadruped walk: the hips and shoulders ride their legs and turn a little with them, the body
  // rolls over the side whose feet are down. The neck takes out the pitch and the turn along its length,
  // so the head travels steadily; the tail swings behind.
  const { cycle, lag } = walk;
  const gait = createGait(rig, walk, rest);
  const walkPose = u => {
    const { hind, pitch } = gait.girdles(u);
    const roll = -0.012 * Math.cos(TAU * (u - (lag + walk.duty) / 2));
    const hipsYaw = -0.016 * Math.cos(TAU * u);
    const chestYaw = -0.016 * Math.cos(TAU * (u - lag));
    bones.Hips.position.y += hind - pitch * (gait.pivotX(false) - joints.Hips.x);
    bones.Hips.quaternion.copy(turn(hipsYaw, roll, pitch));
    bones.Spine.quaternion.copy(turn((chestYaw - hipsYaw) / 2, -roll / 2, 0));
    // The chest keeps the body's pitch; the neck's stretches take it out toward the head.
    const bob = 0.006 * Math.sin(2 * TAU * (u - lag) + 0.6);
    const turns = owners.map((_, i) => pitch * (1 - 0.85 * i / (owners.length - 1)) + bob * (i / owners.length));
    const yaw = owners.map((_, i) => (i ? -0.25 * chestYaw : (chestYaw - hipsYaw) / 2));
    yaw.push(0);
    neckPose(turns, -0.008 * Math.sin(2 * TAU * (u - lag) + 0.9), pitch, yaw);
    sway(u, 0.03, 2.4);
    bones.Tail1.quaternion.premultiply(q(Z, -0.5 * pitch));
    bones.root.updateMatrixWorld(true);
    gait.plantFeet(u);
  };

  // --- kink: a friendly nod ----------------------------------------------------------------------------
  // The chin lifts a little, then the head nods twice, the second time less, the top of the neck
  // giving with it, and back to rest; the tail wags.
  const kink = u => {
    const lift = rad(5) * bump(u, 0, 0.22);
    const nod = rad(24) * bump(u, 0.14, 0.5) + rad(15) * bump(u, 0.46, 0.8);
    const wag = bump(u, 0.1, 0.95);
    bones.Hips.position.y += 0.002 * H * Math.sin(TAU * u);
    const turns = owners.map((_, i) => (i >= owners.length - 2 ? 0.25 * lift - 0.18 * nod * (i - owners.length + 3) / 2 : 0));
    neckPose(turns, lift - 0.75 * nod);
    bones.Head.quaternion.premultiply(q(new THREE.Vector3(1, 0, 0), 0.05 * bump(u, 0.05, 0.9)));
    sway(u, 0.02, 2.2);
    tail.forEach((n, i) => bones[n].quaternion.premultiply(q(Y, 0.035 * wag * (0.5 + 0.5 * i / (tail.length - 1)) * Math.sin(2 * TAU * u - 3 * i / (tail.length - 1)))));
  };

  // --- lowerHead: the head comes down to a child -------------------------------------------------------
  // A small lift first, then the neck curves down in front of her, slowly, and the head settles at a
  // child's eye height with the face tipped a little down toward him. The tail rises a little as the
  // head goes down. Played once; the last pose holds.
  const down = u => ease(u, 0.08, 1) - 0.04 * bump(u, 0, 0.2);
  const lowerHead = u => {
    const d = down(u);
    neckPose(low.map(t => d * t), d * rad(LOWERED.head));
    bones.Tail1.quaternion.copy(turn(0, 0, 0.03 * d));
  };

  // --- liftUp: up into the treetops --------------------------------------------------------------------
  // From the lowered head the neck rises slowly to its full height, higher than at rest; the head stays
  // level all the way up (a child on it stays on), and the tail settles. Played once; the last pose holds.
  const liftUp = u => {
    const d = spline([[0, 0, 0], [0.5, 0.52, 1.5], [1, 1, 0]], u);
    neckPose(mix(low, raised, d), rad(LOWERED.head) * (1 - Math.min(1, d / 0.25)));
    bones.Tail1.quaternion.copy(turn(0, 0, 0.03 * (1 - d) - 0.02 * d));
  };

  // --- happy: a happy little rear ----------------------------------------------------------------------
  // She rocks back on her hind legs so her front feet leave the ground (by about 5 % of her height),
  // the neck swinging up; she comes down with a soft stamp, the front feet one after the other, and
  // wiggles her neck and tail. The clip keys the legs, so footing hands them to it while it plays.
  const rear = u => rad(6.5) * spline([[0, 0, 0], [0.12, -0.08, 0], [0.38, 1, 0], [0.52, 0.12, -2.5], [0.6, -0.06, 0], [0.7, 0, 0], [1, 0, 0]], u);
  const span = gait.span;
  const happy = u => {
    const pitch = rear(u);
    const joy = ease(u, 0.05, 0.35) * (1 - ease(u, 0.85, 1));
    const wiggle = Math.sin((TAU * 2 * (u - 0.58)) / 0.42) * bump(u, 0.58, 1);
    bones.Hips.quaternion.copy(turn(0.02 * wiggle, 0.02 * wiggle, pitch));
    bones.Spine.quaternion.copy(turn(-0.01 * wiggle, 0, 0));
    const turns = owners.map((_, i) => (i ? -0.5 * pitch + rad(5) * joy * (i / owners.length) : 0));
    const yaw = owners.map((_, i) => (i ? 0.05 * wiggle : 0));
    yaw.push(-0.08 * wiggle);
    neckPose(turns, rad(5) * joy - 0.6 * pitch, pitch, yaw);
    bones.Head.quaternion.multiply(q(new THREE.Vector3(1, 0, 0), 0.08 * Math.sin(TAU * 2 * u) * joy));
    sway(u, 0.09 * joy, 2.6);
    bones.Tail1.quaternion.premultiply(q(Z, -0.6 * pitch));
    bones.root.updateMatrixWorld(true);
    // The hind feet stay where they stand; the front feet hang from the risen shoulders, a little
    // forward, toes down, and land a moment apart.
    for (const l of rig.legs) {
      if (!l.front) { gait.reachFoot(l, l.rest.clone(), 0); continue; }
      const late = l.side === 'R' ? 0.035 : 0;
      const up = Math.max(0, span * Math.sin(rear(u - late)) - 0.004 * H);
      const target = l.rest.clone().add(new THREE.Vector3(0.25 * up, up, 0));
      gait.reachFoot(l, target, -0.6 * up / H);
    }
  };

  const once = clip => { clip.userData.once = true; return clip; };
  const clips = [
    sample('idle', 6.0, idle, 180),
    sample('walk', cycle, walkPose, walk.keys, true),
    sample('kink', 2.8, kink, 84),
    once(sample('lowerHead', 4.5, lowerHead, 90)),
    once(sample('liftUp', 8.0, liftUp, 120)),
    sample('happy', 2.4, happy, 72, true),
  ];
  // Where the eyes come down to, and how high the head's joint goes.
  const at = (clip, u) => { reset(); clip(u); const e = eyesNow(); const h = bones.Head.getWorldPosition(new THREE.Vector3()); reset(); return { eyes: e, head: h }; };
  const r2 = v => +v.toFixed(2);
  const lowPose = at(lowerHead, 1), high = at(liftUp, 1);
  const report = {
    walk: gait.report(),
    lowerHead: { depth: +depth.toFixed(3), eyes: lowPose.eyes.toArray().map(r2), head: lowPose.head.toArray().map(r2) },
    liftUp: { eyes: high.eyes.toArray().map(r2), head: high.head.toArray().map(r2) },
  };
  return { clips, report, walk };
}
