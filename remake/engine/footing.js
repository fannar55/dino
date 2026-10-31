import * as THREE from 'three';
import { twoBoneLeg } from './ik.js';

// Footing: where a character's feet are. A foot that is down stays where it is in the world while
// the body moves over it, and the leg reaches it from the pose the clips give. Who decides when a
// foot steps depends on what the character is doing:
// - walking, the walk clip does: a foot stays where it was set down until the clip lifts it, then
//   joins the clip's swing in the air from where it really stood. So the body can turn over its
//   planted feet on a curve, and a walk can start from any stance, without dragging a foot;
// - standing, turning on the spot and stopping, footing does: a foot out of place takes a short
//   step, straight up, over in an arc with the heel peeled, and straight down, as in the walk clip;
// - a clip played for its own sake gets the legs as it is (blended in).
//
// Two kinds of leg:
// - a pivot leg, as the quadruped bake tool rigs them (lab/gfx-demo/tools/bake/bake-mosi.js): one
//   rigid bone whose child carries the foot. It swings from a pivot on its axis at the height of the
//   body's centre and slides along the axis, so the foot lands exactly where it is put;
// - a jointed leg, as the biped bake tool rigs them (remake/tools/bake/bake-biped.js): thigh, shin
//   and foot, reached by two-bone IK (ik.js, the same the bake tool authors the walk with). The hips
//   sink as far as the legs need to reach their feet, and the heel peels about the toe.

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const smooth = s => s * s * (3 - 2 * s);
const yawOf = headingDeg => -THREE.MathUtils.degToRad(headingDeg); // the root's rotation.y
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Distances in metres and times in seconds, for legs `size` metres long (how far each leg's top
// joint, hip or shoulder, stands above its foot in the bind pose, on average). Footing scales them to
// each actor's own legs: lengths in proportion and times by the square root, as a leg swings like a
// pendulum, so a bigger animal steps further and slower.

// Tuned on Mosi as he is today (4 m long, his feet 0.8 m apart).
export const QUADRUPED = {
  size: 0.6424261422805829, // Mosi's legs today
  lift: 0.003, // a foot this far above the ground is in the air
  slack: 0.08, // a standing foot this far to the side of its rest spot, or behind it, steps
  ahead: 0.36, // ...but it may stand this far ahead of it
  lead: 0.2, // while turning, a foot steps this far past its rest spot, along the turn
  lag: 0.14, // ...and steps again when it is this far behind it
  ease: 0.22, // a planted foot this far from its rest spot slows the turn down
  reach: 0.34, // ...and this far holds it up
  carry: 0.1, // a foot in the air when footing takes over travels on at most this far
  gap: 0.12, // shortest time between two lift-offs
  catchUp: 0.12, // walking, a planted foot this far behind where the clip has it down steps up first
  strideReach: 0.6, // walking, how far a planted foot may be from its rest spot (the clip itself reaches 0.53)
  turnLead: 0.12, // on a curve, a step lands at most this far round the turn from the clip's spot
  arc: [0.03, 0.12, 0.1], // a step of d metres lifts the foot clamp(a + b d, a, c)
  stepTime: [0.3, 0.45, 0.35, 0.65], // ...and takes clamp(a + b d, c, d) seconds
  airTime: [0.2, 0.5, 1.5, 0.6], // a lifted foot coming down: clamp(a + b d + c air, a, d) seconds
  joinTime: [0.15, 0.6, 0.45], // a lifted foot joining the clip from d metres away: clamp(a + b d, a, c)
  peel: [0.4, 0.5], // a step peels the heel up to a radians, full at steps of b metres
  join: [0.005, 0.01], // a lifted foot this close to the clip's (across, up) joins it at once
  near: 0.05, // a foot this close to the middle turns with the body instead of stepping round
};

// Tuned on Egill (1.1 m, legs 0.3 m, feet 0.2 m apart): shorter steps, quicker, and a turn steps
// sooner, since his feet stand close to the middle.
export const BIPED = {
  size: 0.2971121788787352, // Egill's legs
  lift: 0.002,
  slack: 0.03,
  ahead: 0.08,
  lead: 0.03,
  lag: 0.03,
  ease: 0.045,
  reach: 0.075,
  carry: 0.03,
  gap: 0.08,
  catchUp: 0.04,
  strideReach: 0.2, // the clip itself reaches 0.13
  turnLead: 0.04,
  arc: [0.012, 0.12, 0.035],
  stepTime: [0.22, 0.8, 0.25, 0.45],
  airTime: [0.15, 0.5, 1.5, 0.4],
  joinTime: [0.1, 0.6, 0.3],
  peel: [0.35, 0.15],
  legReach: 0.995, // a jointed leg reaches at most this share of its straight length (the knee never locks)
};

// The tuning for legs `size` metres long (left out: as tuned). `pace` is the time scale.
function tuned(tuning, size) {
  const T = { ...QUADRUPED, ...tuning };
  const s = size === undefined ? 1 : size / T.size;
  if (s === 1) return { ...T, pace: 1 };
  const r = Math.sqrt(s);
  const m = x => x * s; // metres
  const t = x => x * r; // seconds
  const v = x => x / r; // seconds per metre
  return {
    ...T,
    size: T.size * s,
    pace: r,
    lift: m(T.lift), slack: m(T.slack), ahead: m(T.ahead), lead: m(T.lead), lag: m(T.lag), ease: m(T.ease),
    reach: m(T.reach), carry: m(T.carry), gap: t(T.gap), catchUp: m(T.catchUp), strideReach: m(T.strideReach),
    turnLead: m(T.turnLead), near: m(T.near),
    arc: [m(T.arc[0]), T.arc[1], m(T.arc[2])],
    stepTime: [t(T.stepTime[0]), v(T.stepTime[1]), t(T.stepTime[2]), t(T.stepTime[3])],
    airTime: [t(T.airTime[0]), v(T.airTime[1]), v(T.airTime[2]), t(T.airTime[3])],
    joinTime: [t(T.joinTime[0]), v(T.joinTime[1]), t(T.joinTime[2])],
    peel: [T.peel[0], m(T.peel[1])],
    join: [m(T.join[0]), m(T.join[1])],
  };
}

/** How much stepping a stop leaves to do, for feet [{ ahead, down }] as the walk ends: one for each
 *  foot that must still step, plus a little for how far out of place each foot stands. `tuning`:
 *  an actor's own (footing.tuning). */
export function stopCost(feet, tuning) {
  const { slack: SLACK, ahead: AHEAD, carry: CARRY } = tuned(tuning);
  let cost = 0;
  for (const { ahead, down } of feet) {
    // Where the foot ends up when footing takes it over: a planted foot stays, a lifted one comes
    // down on its rest spot or, when it is already past it, a little further on.
    const at = down ? ahead : clamp(ahead + CARRY, 0, AHEAD);
    cost += (at < -SLACK || at > AHEAD ? 1 : 0) + 0.1 * Math.abs(at);
  }
  return cost;
}

/**
 * legs: [{ foot, girdle, jointed, toe }]: the foot bones (a pivot leg is its foot's parent; a
 * jointed leg is the foot's parent and grandparent, shin and thigh), the pair each belongs to
 * (footing never has both feet of a pair in the air at once) and, for a jointed leg, the toe's
 * ground contact in the foot's frame (a peeling heel turns about it). pivotHeight: the height of the
 * pivot legs' swing pivots in the root's frame. tuning: QUADRUPED (the default) or BIPED, or
 * overrides of it, scaled to these legs. Create it in the bind pose, with the root at the origin.
 */
export function createFooting({ root, legs: specs, pivotHeight, tuning, rootFrame = false }) {
  root.updateMatrixWorld(true);
  const height = bone => root.worldToLocal(bone.getWorldPosition(new THREE.Vector3())).y;
  const size = specs.length
    ? specs.reduce((sum, { foot, jointed }) => sum + (height(jointed ? foot.parent.parent : foot.parent) - height(foot)), 0) / specs.length
    : undefined;
  const T = tuned(tuning, size);
  const LIFT = T.lift;
  const SLACK = T.slack;
  const AHEAD = T.ahead;
  const LEAD = T.lead;
  const LAG = T.lag;
  const EASE = T.ease;
  const REACH = T.reach;
  const CARRY = T.carry;
  const GAP = T.gap;
  const CATCH = T.catchUp;
  const STRIDE_REACH = T.strideReach;
  const TURN_LEAD = T.turnLead;
  // A step of d metres: its arc height and how long it takes (airTime: a foot coming down from `air`
  // metres up); and how long a lifted foot takes to join the clip from d metres away.
  const lift = d => clamp(T.arc[0] + T.arc[1] * d, T.arc[0], T.arc[2]);
  const stepTime = d => clamp(T.stepTime[0] + T.stepTime[1] * d, T.stepTime[2], T.stepTime[3]);
  const airTime = (d, air) => clamp(T.airTime[0] + T.airTime[1] * d + T.airTime[2] * air, T.airTime[0], T.airTime[3]);
  const joinTime = d => clamp(T.joinTime[0] + T.joinTime[1] * d, T.joinTime[0], T.joinTime[2]);
  // Where a foot `ahead` metres in front of its rest spot (negative: behind) ends up when footing
  // takes it over: a planted foot stays, a lifted one comes down on its rest spot or, when it is
  // already past it, a little further on.
  const landing = (ahead, down) => (down ? ahead : clamp(ahead + CARRY, 0, AHEAD));

  const rootQ = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const legs = specs.map(({ foot, girdle, jointed = false, toe = null }) => {
    const leg = foot.parent;
    const parent = jointed ? leg.parent.parent : leg.parent; // what the leg hangs from
    const home = root.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
    // The foot's rest turn: in the parent's frame for a pivot leg, in the root's frame for a jointed one.
    const restFoot = jointed
      ? rootQ.clone().multiply(foot.getWorldQuaternion(new THREE.Quaternion()))
      : leg.quaternion.clone().multiply(foot.quaternion);
    const L = {
      jointed, leg, foot, parent, girdle, restFoot,
      home, // the foot's rest spot in the root's frame
      radius: Math.hypot(home.x, home.z),
      parentQ: jointed ? new THREE.Quaternion() : rootQ.clone().multiply(parent.getWorldQuaternion(new THREE.Quaternion())), // in the root's frame
      peelAxis: new THREE.Vector3(0, 0, 1).applyQuaternion(restFoot.clone().invert()), // across the foot
      toe: jointed && toe ? toe.clone() : null,
      // 'down' (planted at `at`, turned `turn`), 'step' (footing's own step), 'join' (blending into
      // the clip's foot) or 'clip' (the clip's foot as it is).
      state: 'down',
      at: new THREE.Vector3(),
      turn: new THREE.Quaternion(),
      step: null,
      join: null,
      airTime: 0, // walking: seconds since the foot left the ground
      need: false,
      pos: new THREE.Vector3(), // where the foot was put last frame, and how it was turned (world)
      rot: new THREE.Quaternion(),
      animated: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), foot: new THREE.Quaternion(), thigh: new THREE.Quaternion() },
      clip: new THREE.Vector3(), // the clips' foot this frame (world), its turn, and whether it is up
      clipTurn: new THREE.Quaternion(),
      clipUp: false,
      ground: 0,
    };
    if (jointed) {
      L.thigh = leg.parent;
      L.ik = twoBoneLeg(leg.position.clone(), foot.position.clone()); // in the leg's own units
      L.unit = parent.getWorldScale(new THREE.Vector3()).x; // metres to one of them
    } else {
      L.pivotY = parent.worldToLocal(root.localToWorld(new THREE.Vector3(home.x, pivotHeight, home.z))).y;
      L.reach = foot.position.clone(); // the foot in the leg's frame
    }
    return L;
  });
  // Jointed legs hang from the hips, which sink when a leg could not reach its foot otherwise.
  const hips = legs.find(L => L.jointed)?.parent ?? null;
  const hipsUnit = hips ? hips.parent.getWorldScale(new THREE.Vector3()).x : 1;
  const hipsAnimated = new THREE.Vector3();
  let sink = 0; // metres the hips are lowered this frame

  let mode = 'stand'; // 'walk' (the walk clip times the steps), 'stand' (footing does) or 'free'
  let walkClip = null; // walking: { foot(index, out): the clip's own foot (root frame), stance(): seconds down }
  let yawRate = 0; // how fast the root turns (radians a second, smoothed)
  let lastYaw = null;
  let fade = 0.4; // how long a 'free' clip takes to get the legs
  let aim = null; // standing: the heading (degrees) the feet step toward; null: the current one
  let time = 0;
  let lastLift = -Infinity;
  let applied = false;

  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const v4 = new THREE.Vector3();
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const q3 = new THREE.Quaternion();

  /** Where a leg's foot rests when the root faces `yaw` (world). */
  const homeAt = (L, yaw, out) => {
    if (!rootFrame) return out.copy(L.home).applyAxisAngle(UP, yaw).add(root.position);
    // Scaled babies crossing inclined bridges keep rest feet in the complete
    // root frame. Rotating the world offset preserves the standing-turn API.
    root.localToWorld(out.copy(L.home));
    return out.sub(root.position).applyAxisAngle(UP, yaw - root.rotation.y).add(root.position);
  };
  const surfaceY = (L, point) => {
    if (!rootFrame) return L.ground;
    const home = homeAt(L, root.rotation.y, new THREE.Vector3());
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion);
    return home.y + (normal.x * (home.x - point.x) + normal.z * (home.z - point.z)) / Math.max(.25, normal.y);
  };
  /** How a resting foot is turned when the root faces `yaw` (world). */
  const restTurn = (L, yaw, out) => out.setFromAxisAngle(UP, yaw).multiply(L.parentQ).multiply(L.restFoot);
  const forward = (yaw, out) => out.set(Math.cos(yaw), 0, -Math.sin(yaw));

  // Read the pose the clips gave a leg this frame, and where that puts its foot.
  function readClip(L) {
    const a = L.animated;
    if (L.jointed) {
      a.thigh.copy(L.thigh.quaternion);
      a.quaternion.copy(L.leg.quaternion);
      a.foot.copy(L.foot.quaternion);
      L.foot.getWorldPosition(L.clip);
      L.foot.getWorldQuaternion(L.clipTurn);
    } else {
      a.position.copy(L.leg.position);
      a.quaternion.copy(L.leg.quaternion);
      a.foot.copy(L.foot.quaternion);
      L.parent.localToWorld(L.clip.copy(L.reach).applyQuaternion(a.quaternion).add(a.position));
      L.parent.getWorldQuaternion(L.clipTurn).multiply(a.quaternion).multiply(a.foot);
    }
    L.ground = homeAt(L, root.rotation.y, v1).y;
    L.clipUp = L.clip.y - L.ground > LIFT;
  }

  function plant(L, position, turn) {
    L.state = 'down';
    L.at.copy(position).setY(surfaceY(L, position));
    L.turn.copy(turn);
    L.step = null;
    L.join = null;
  }

  // Follow the clip's foot from where the foot is now: at once if it is already there, else over a
  // short blend in the air (`arc`: lift it at least this high on the way; 0 slides it, for 'free').
  function joinClip(L, from, turn, arc) {
    const d = Math.hypot(L.clip.x - from.x, L.clip.z - from.z);
    L.step = null;
    L.airTime = 0;
    if (d < T.join[0] && Math.abs(L.clip.y - from.y) < T.join[1]) {
      L.state = 'clip';
      L.join = null;
      return;
    }
    L.state = 'join';
    L.join = { from: from.clone(), turnFrom: turn.clone(), t: 0, duration: arc ? joinTime(d) : fade, arc: arc ? lift(d) : 0 };
  }

  // The yaw a step aims at while turning: toward the goal, but at most LEAD past the rest spot.
  function aimYaw(L, yaw) {
    if (aim === null) return yaw;
    const most = L.radius > T.near ? LEAD / L.radius : Math.PI;
    return yaw + clamp(wrap(yawOf(aim) - yaw), -most, most);
  }

  // Where a step lands: the aimed rest spot, or `ahead` metres past it (a foot that was in the air).
  function stepTarget(L, s, yaw) {
    const ay = aimYaw(L, yaw);
    homeAt(L, ay, s.to).addScaledVector(forward(ay, v3), s.ahead);
    restTurn(L, ay, s.turnTo);
  }

  function startStep(L, from, turnFrom, air = 0, ahead = 0) {
    const s = {
      from: from.clone(), to: new THREE.Vector3(), turnFrom: turnFrom.clone(), turnTo: new THREE.Quaternion(),
      air, ahead, t: 0,
    };
    stepTarget(L, s, root.rotation.y);
    const d = Math.hypot(s.to.x - from.x, s.to.z - from.z);
    s.height = Math.max(0, lift(d) - air);
    s.peel = air > 0 ? 0 : T.peel[0] * Math.min(1, d / T.peel[1]);
    s.duration = air > 0 ? airTime(d, air) : stepTime(d);
    L.state = 'step';
    L.step = s;
    L.join = null;
    lastLift = time;
  }

  // A foot in the air when footing starts stepping comes down on its rest spot, never turning back.
  function comeDown(L) {
    const air = L.pos.y - L.ground;
    if (air < LIFT) { plant(L, L.pos, L.rot); return; }
    const ay = aimYaw(L, root.rotation.y);
    const ahead = v2.copy(L.pos).sub(homeAt(L, ay, v1)).dot(forward(ay, v3));
    startStep(L, L.pos, L.rot, air, landing(ahead, false));
  }

  // Standing: lift the foot that is furthest out of place, if one must step and its pair-mate is down.
  // Turning, a foot steps when it falls LAG behind its rest spot along the turn (or strays sideways);
  // otherwise when it is more than SLACK aside or behind its rest spot, or more than AHEAD in front.
  function pickStep() {
    const yaw = root.rotation.y;
    const left = aim === null ? 0 : wrap(yawOf(aim) - yaw);
    const turning = Math.abs(left) > 0.01;
    let best = null;
    let bestScore = -Infinity;
    for (const L of legs) {
      L.need = false;
      if (L.state !== 'down') continue;
      const home = homeAt(L, yaw, v1);
      const off = v2.copy(L.at).sub(home).setY(0);
      let along;
      let across;
      if (turning && L.radius > T.near) {
        // Unit direction the rest spot moves in as the root turns toward the goal.
        const dir = v3.set(home.z - root.position.z, 0, root.position.x - home.x).divideScalar(L.radius).multiplyScalar(Math.sign(left));
        along = off.dot(dir);
        across = Math.sqrt(Math.max(0, off.lengthSq() - along * along));
        L.need = along < -LAG || across > SLACK;
      } else {
        along = off.dot(forward(yaw, v3));
        across = Math.sqrt(Math.max(0, off.lengthSq() - along * along));
        L.need = across > SLACK || along < -SLACK || along > AHEAD;
      }
      if (!L.need || legs.some(o => o !== L && o.girdle === L.girdle && o.state !== 'down')) continue;
      const score = Math.max(across, -along, along - AHEAD);
      if (score > bestScore) { best = L; bestScore = score; }
    }
    if (best && time - lastLift >= GAP) startStep(best, best.at, best.turn);
  }

  function standFrame(dt) {
    const yaw = root.rotation.y;
    for (const L of legs) {
      const s = L.step;
      if (L.state !== 'step') continue;
      // The landing spot follows the turn until the foot starts down, so it sets down straight.
      if (s.t < 0.5 * s.duration) stepTarget(L, s, yaw);
      s.t += dt;
      if (s.t >= s.duration) plant(L, s.to, s.turnTo);
    }
    if (dt > 0) pickStep(); // a frozen frame starts nothing
  }

  // Walking, a planted foot far behind where the clip has it down (a walk that starts from a stance
  // the clip does not have) steps up first, and its pair-mate stays down until it lands. A foot ahead
  // of the clip's spot just waits: the leg stands straighter until the clip lifts it.
  const behind = L => L.state === 'down' && !L.clipUp && v1.subVectors(L.clip, L.at).dot(forward(root.rotation.y, v2)) > CATCH;

  function clipFrame(dt) {
    for (const L of legs) {
      if (L.state !== 'down') L.airTime += dt;
      if (L.state === 'down' && mode === 'free') joinClip(L, L.at, L.turn, false);
      if (L.state === 'down' && mode === 'walk') {
        const mate = legs.find(o => o !== L && o.girdle === L.girdle);
        const mateFree = !mate || (mate.state === 'down' && !behind(mate));
        if ((L.clipUp && mateFree) || (behind(L) && (!mate || mate.state === 'down'))) joinClip(L, L.at, L.turn, true);
        else {
          // On a bend tighter than the stride can follow, the body turns away from a planted foot
          // faster than the clip re-places it: the foot slips toward the clip's, just enough to
          // stay within the leg's reach.
          const over = v1.subVectors(L.at, homeAt(L, root.rotation.y, v2)).setY(0).length() - STRIDE_REACH;
          const toClip = v1.subVectors(L.clip, L.at).setY(0);
          const slip = over * (1 - Math.exp(-dt / (0.1 * T.pace))); // eased, so a foot is never snapped across
          if (over > 0 && toClip.lengthSq() > 0) L.at.addScaledVector(toClip, Math.min(1, slip / toClip.length()));
        }
      }
      if (L.state === 'join') {
        L.join.t += dt;
        if (L.join.t >= L.join.duration) { L.state = 'clip'; L.join = null; }
      }
      if (L.state === 'clip' && !L.clipUp && mode === 'walk') plant(L, L.clip, L.clipTurn);
    }
  }

  // The foot's place and turn this frame (world).
  function footPose(L, position, turn) {
    if (L.state === 'down') {
      if (rootFrame) L.at.y = surfaceY(L, L.at);
      position.copy(L.at);
      turn.copy(L.turn);
    } else if (L.state === 'clip') {
      position.copy(L.clip);
      turn.copy(L.clipTurn);
    } else if (L.state === 'join') {
      const j = L.join;
      const k = Math.min(1, j.t / j.duration);
      const e = smooth(k);
      position.lerpVectors(j.from, L.clip, e);
      position.y = Math.max(position.y, surfaceY(L, position) + j.arc * Math.sin(Math.PI * k));
      turn.slerpQuaternions(j.turnFrom, L.clipTurn, e);
    } else {
      const s = L.step;
      const k = Math.min(1, s.t / s.duration);
      const e = smooth(k);
      // The foot is over its spot a fifth of the step before it lands, so it comes straight down (a
      // foot coming down from the air without an arc would glide in along the ground otherwise).
      position.lerpVectors(s.from, s.to, smooth(Math.min(1, k / 0.8)));
      position.y = THREE.MathUtils.lerp(s.from.y - s.air, s.to.y, e) + s.air * (1 - e) + s.height * Math.sin(Math.PI * k);
      turn.slerpQuaternions(s.turnFrom, s.turnTo, e);
      const peel = s.peel * Math.sin(Math.PI * Math.min(1, k / 0.75)) ** 2;
      if (peel && L.toe) {
        // The heel peels up about the toe, which keeps its place.
        position.add(v1.copy(L.toe).applyQuaternion(turn));
        turn.multiply(q3.setFromAxisAngle(L.peelAxis, -peel));
        position.sub(v1.copy(L.toe).applyQuaternion(turn));
      } else if (peel) turn.multiply(q3.setFromAxisAngle(L.peelAxis, -peel));
    }
  }

  // Jointed legs: how far the hips must sink for every leg to reach its foot (the legs reach at most
  // `legReach` of their straight length, and the hips sink at most a third of it). They sink at once
  // when they must, and rise back gently.
  function crouch(dt) {
    let need = 0;
    for (const L of legs) {
      if (!L.jointed) continue;
      const hip = L.thigh.getWorldPosition(v1);
      const above = hip.y - L.pos.y;
      const length = L.ik.length * L.unit;
      const most = T.legReach * length;
      const across = v2.subVectors(L.pos, hip).setY(0).lengthSq();
      need = Math.max(need, Math.min(length / 3, above - Math.sqrt(Math.max(0, most * most - across))));
    }
    sink = need >= sink ? need : need + (sink - need) * Math.exp(-dt / (0.2 * T.pace));
    if (sink <= 1e-6) { sink = 0; return; }
    hips.position.add(v1.set(0, -sink / hipsUnit, 0).applyQuaternion(hips.parent.getWorldQuaternion(q1).invert()));
    hips.updateMatrixWorld(true);
  }

  // Bend the leg from the pose the clips gave it so that its foot is at `position`, turned to `turn`
  // (world). With the foot where the clip has it, this is the clip's pose exactly.
  function poseLeg(L, position, turn) {
    const a = L.animated;
    if (L.jointed) {
      // In the hips' frame: the knee bends as far as the distance asks, in the plane the clip bends
      // it in, turned half as far about the vertical as the foot is turned from the clip's (a foot
      // left behind in a turn twists the whole leg a little, not just the ankle).
      const hipsQ = L.parent.getWorldQuaternion(q1);
      const toAnkle = L.parent.worldToLocal(v1.copy(position)).sub(L.thigh.position);
      const hinge = v3.set(0, 0, 1).applyQuaternion(a.thigh);
      const twist = wrap(yawOfTurn(turn) - yawOfTurn(L.clipTurn));
      if (twist) hinge.applyAxisAngle(v2.copy(UP).applyQuaternion(q2.copy(hipsQ).invert()), 0.5 * twist);
      L.ik.reach(toAnkle, hinge, L.thigh.quaternion, L.leg.quaternion);
      L.foot.quaternion.copy(hipsQ).multiply(L.thigh.quaternion).multiply(L.leg.quaternion).invert().multiply(turn);
      return;
    }
    // A pivot leg turns about the point of its axis at pivot height and slides along the axis.
    const target = L.parent.worldToLocal(v1.copy(position));
    const along = v2.copy(L.reach).applyQuaternion(a.quaternion).normalize(); // down the leg
    const foot = v3.copy(L.reach).applyQuaternion(a.quaternion).add(a.position);
    const pivot = foot.addScaledVector(along, -(L.pivotY - foot.y) / Math.max(0.2, -along.y));
    const legQ = q1.setFromUnitVectors(along, pivot.subVectors(target, pivot).normalize()).multiply(a.quaternion);
    L.leg.quaternion.copy(legQ);
    L.leg.position.copy(target).sub(v2.copy(L.reach).applyQuaternion(legQ));
    L.foot.quaternion.copy(legQ).invert().multiply(L.parent.getWorldQuaternion(q2).invert()).multiply(turn);
  }

  // The heading (radians about the vertical) a foot turned `q` points along.
  function yawOfTurn(q) {
    const f = v4.set(1, 0, 0).applyQuaternion(q);
    return Math.atan2(-f.z, f.x);
  }

  const footing = {
    /** The tuning, scaled to these legs. */
    get tuning() { return T; },
    /** True while a foot is stepping into place or still has to (standing). */
    get busy() { return mode === 'stand' && legs.some(L => L.state !== 'down' || L.need); },
    /**
     * The walk clip times the steps from now on; feet that are down stay until it lifts them.
     * `clip.foot(index, out)` gives the clip's own foot for each leg in the root's frame (unblended,
     * so a step the clip takes while it is still cross-fading in is taken too) and `clip.stance()`
     * how long a foot stays down at the current pace; without them the blended pose is used.
     */
    walk(clip = null) {
      walkClip = clip;
      if (mode === 'walk') return;
      mode = 'walk';
      for (const L of legs) if (L.state === 'step') joinClip(L, L.pos, L.rot, true);
    },
    /** Footing steps the feet from now on (a stop, a turn on the spot); lifted feet come down. */
    stand() {
      if (mode === 'stand') return;
      mode = 'stand';
      for (const L of legs) if (L.state === 'join' || L.state === 'clip') comeDown(L);
    },
    /** A clip played for its own sake: the legs blend into it over `seconds` and then follow it. */
    free(seconds = 0.4) {
      mode = 'free';
      fade = Math.max(seconds, 1e-3);
      for (const L of legs) if (L.state !== 'clip') joinClip(L, L.pos, L.rot, false);
    },
    /** Start over from the pose the clips give now (the character was put somewhere else). */
    reset() {
      footing.restore();
      root.updateMatrixWorld(true);
      sink = 0;
      for (const L of legs) {
        readClip(L);
        L.pos.copy(L.clip);
        L.rot.copy(L.clipTurn);
        if (L.clipUp && mode !== 'stand') { L.state = 'clip'; L.step = null; L.join = null; } else plant(L, L.clip, L.clipTurn);
      }
    },
    /** Standing, step toward the stance at this heading (degrees), or at the current heading (null). */
    aim(heading) { aim = heading ?? null; },
    /** The share (0 to 1) of a turn from one heading to another that the planted feet allow. */
    slack(fromDeg, toDeg) {
      let share = 1;
      if (mode !== 'stand') return share;
      for (const L of legs) {
        if (L.state !== 'down') continue;
        const before = homeAt(L, yawOf(fromDeg), v1).setY(L.at.y).distanceTo(L.at);
        const after = homeAt(L, yawOf(toDeg), v1).setY(L.at.y).distanceTo(L.at);
        if (after > before && after > EASE) share = Math.min(share, clamp((REACH - after) / (REACH - EASE), 0, 1));
      }
      return share;
    },
    /** Put the clips' leg pose back before the mixer runs (it skips values that did not change). */
    restore() {
      if (!applied) return;
      for (const L of legs) {
        if (L.jointed) L.thigh.quaternion.copy(L.animated.thigh);
        else L.leg.position.copy(L.animated.position);
        L.leg.quaternion.copy(L.animated.quaternion);
        L.foot.quaternion.copy(L.animated.foot);
      }
      if (hips) hips.position.copy(hipsAnimated);
      applied = false;
    },
    /** Step and pose the legs; call after the mixer. */
    update(dt) {
      if (!legs.length) return;
      root.updateMatrixWorld(true);
      if (hips) hipsAnimated.copy(hips.position);
      const yaw = root.rotation.y;
      if (dt > 0) {
        if (lastYaw !== null) yawRate += (wrap(yaw - lastYaw) / dt - yawRate) * (1 - Math.exp(-dt / 0.2));
        lastYaw = yaw;
      }
      // Turning on a curve, the body turns over a planted foot all through its stance, so a lifted
      // foot comes down that much further round the turn, by half a stance's turn: the foot then
      // stands centred on its path instead of drifting all to one side.
      const lead = mode === 'walk' && walkClip ? (yawRate * walkClip.stance()) / 2 : 0;
      legs.forEach((L, k) => {
        readClip(L);
        if (mode !== 'walk' || !walkClip) return;
        walkClip.foot(k, v1);
        L.clipUp = v1.y - L.home.y > LIFT;
        root.localToWorld(L.clip.copy(v1));
        if (L.state === 'join' || L.state === 'clip') {
          const most = L.radius > T.near ? TURN_LEAD / L.radius : 0;
          const turn = clamp(lead, -most, most) * smooth(Math.min(1, L.airTime / (0.4 * T.pace)));
          L.clip.sub(root.position).applyAxisAngle(UP, turn).add(root.position);
        }
      });
      time += dt;
      if (mode === 'stand') standFrame(dt);
      else clipFrame(dt);
      for (const L of legs) footPose(L, L.pos, L.rot);
      if (hips) crouch(dt);
      for (const L of legs) poseLeg(L, L.pos, L.rot);
      applied = true;
    },
  };
  footing.reset();
  return footing;
}
