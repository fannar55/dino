// A winged actor on a route (chapters/kafli4-route.js): Flugeðla flying chapter 4 with Egill on her back.
//
//   const flier = createFlier(flugedla, route, { world });
//   flier.update(t)           // t: the flight's own time in seconds, on the game clock; every frame, before the actors update
//   const riding = rideFlier(egill, flier);
//
// Where she is comes from the route's schedule alone: her body (her hips) is at route.pointAt(route.progressAt(t)), so a pause, a
// seek or a slow frame never moves the big moments. On top of that come three things Egill may do, each eased and each forgotten
// when the time jumps (a seek): a steer moves her up to a lane's half width aside, a skim lowers her over the water, and a burst
// („Hraðar!“) flies her ahead of the schedule for 2.5 s and lets the borrowed distance go again in the 4 s after it, so she is back
// on the schedule before the falls.
//
// Her turn: heading along the route seen from above, a climb pitch from its slope, and a bank from how fast the heading turns at her
// speed (a coordinated turn, tan(bank) = v * turn rate / g, averaged over a second and a half so it eases in), plus a lean into her
// own sideways move; at most 30 degrees, halved under reduced motion. The model faces +X; the bank is about her own X (her right
// wing, +Z, goes down in a right turn), the pitch about her Z.
import * as THREE from 'three';
import { carryRider, handsOn, legsOn, SIT_DEPTH } from './riding.js';
import { BEATS, FASTER_LAST, LEAP, BODY_HEIGHT } from '../chapters/kafli4-route.js';

const V3 = THREE.Vector3;
const G = 9.81;
const deg = THREE.MathUtils.radToDeg;
const rad = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const smooth = x => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };

/** The flier's numbers (spec section 6). */
export const FLIGHT = {
  bank: 30, // degrees she banks at most
  pitch: 35, // degrees she tips up or down at most
  pitchShare: 0.8, // of the route's own slope
  bankWindow: 0.75, // seconds either side over which the turn's bank is averaged
  lean: 4, // degrees of bank per m/s of sideways move
  spring: 4.5, // 1/s: a steer or a skim is back within 1.5 s (critically damped)
  skim: 1.3, // her body over the water when she skims, at the 7.5 m size: her lowest skin 0.6 m over it in glide (0.7 m under her hips)
  burst: { factor: 1.6, seconds: 2.5, rest: 3, payBack: 4 },
  climbing: 1.5, // m/s up: she beats her wings (fly) instead of gliding
  turning: 12, // degrees of a turn's bank from which she beats her wings through it (spec 8: wingbeats in the turns)
  clipHold: 1.5, // seconds a clip plays at least before the next
  fade: 0.6,
  seek: 0.75, // a step in time bigger than this (or back) is a seek
};
// Her hips over her root in the fly and glide clips, at the 7.5 m size (tests/pteranodon.test.mjs; the bake's report).
const HIPS = new V3(0.06, BODY_HEIGHT, 0);
const Y = new V3(0, 1, 0);
const X = new V3(1, 0, 0);
const Z = new V3(0, 0, 1);

/**
 * Fly `actor` along `route`. Options: `world` (gets world.flightU), `reduced` (reduced motion: half the bank). Returns
 *   update(t)     put her where the flight is at time t
 *   u             progress along the route (0..1), with any borrowed burst distance
 *   steer(x)      x in -1..1 (right positive): up to the lane's half width aside while she is in a lane; 0 brings her back
 *   skim(on)      down to just over the water (where there is water, in a lane), or back up
 *   burst()       „Hraðar!“: true if she goes, false while one lasts, in the 3 s after it, before B and after FASTER_LAST
 *   extra         metres she is ahead of the schedule
 *   bank, pitch, heading   degrees; turnBank: the part of the bank that is the route's turn
 *   speed         m/s along the route
 *   clip          the clip she plays now (idle, takeOff, fly, glide, land)
 *   offset, lift  metres aside (right positive) and up (negative: down) from the route
 *   pose          { position (her body), quaternion }; root: { position, quaternion } where her root goes
 *   land()        play `land` and hold it; stop(): give her back
 */
export function createFlier(actor, route, { world = null, reduced = false } = {}) {
  const scale = actor.scale ?? 1;
  const hips = HIPS.clone().multiplyScalar(scale);
  const lanes = route.lanes ?? [];
  const takeOff = actor.clips.get('takeOff')?.duration ?? 3.2;

  const pose = { position: new V3(), quaternion: new THREE.Quaternion() };
  const root = { position: new V3(), quaternion: new THREE.Quaternion() };
  const state = {
    t: null, u: 0, s: 0,
    offset: 0, offsetV: 0, steer: 0,
    lift: 0, liftV: 0, skim: false,
    extra: 0, burstUntil: -Infinity, payFrom: null, payAmount: 0,
    bank: 0, turnBank: 0, pitch: 0, heading: 0, speed: 0,
    clip: null, clipSince: -Infinity, wanted: null, wantedSince: 0, landing: false,
  };

  const p = new V3();
  const a = new V3();
  const b = new V3();
  const side = new V3();
  const q = new THREE.Quaternion();

  const headingAt = s => headingAlong(route, s, state.heading, a, b);
  // The route's slope (radians, up positive) `s` metres along it.
  function slopeAt(s) {
    route.pointAt(clamp((s - 3) / route.length, 0, 1), a);
    route.pointAt(clamp((s + 3) / route.length, 0, 1), b);
    return Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
  }
  const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
  // The bank of the route's turn at flight time t (degrees), a pure function of t: averaged over FLIGHT.bankWindow either side.
  function turnBankAt(t) {
    if (t <= LEAP) return 0;
    const n = 6;
    const h = 0.25;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const tt = clamp(t + (i / n - 0.5) * 2 * FLIGHT.bankWindow, LEAP, BEATS.END);
      const rate = wrap(headingAt(route.distanceAt(tt + h)) - headingAt(route.distanceAt(tt - h))) / (2 * h);
      sum += deg(Math.atan(route.speedAt(tt) * rate / G));
    }
    return sum / (n + 1);
  }
  const laneAt = u => lanes.find(lane => u >= lane.from && u <= lane.to) ?? null;

  // A critically damped spring toward `target`, exact for any step: returns [x, v].
  function spring(x, v, target, dt) {
    const w = FLIGHT.spring;
    const e = Math.exp(-w * dt);
    const d = x - target;
    const c = v + w * d;
    return [target + (d + c * dt) * e, (v - w * c * dt) * e];
  }

  function reset() {
    state.offset = 0; state.offsetV = 0; state.steer = 0;
    state.lift = 0; state.liftV = 0; state.skim = false;
    state.extra = 0; state.burstUntil = -Infinity; state.payFrom = null; state.payAmount = 0;
  }

  function play(name) {
    if (state.clip === name) return;
    actor.play(name, { fade: state.clip ? FLIGHT.fade : 0 });
    state.clip = name;
    state.clipSince = state.t;
  }
  function chooseClip(t, climb) {
    if (state.landing) return;
    if (t < LEAP) return play('idle');
    if (t < LEAP + takeOff) return play('takeOff');
    const want = climb > FLIGHT.climbing || t < state.burstUntil || Math.abs(state.turnBank) > FLIGHT.turning ? 'fly' : 'glide';
    if (want !== state.wanted) { state.wanted = want; state.wantedSince = t; }
    const fresh = state.clipSince === -Infinity || state.clip === 'takeOff' || state.clip === 'idle';
    if (want !== state.clip && (fresh || (t - state.clipSince >= FLIGHT.clipHold && t - state.wantedSince >= 0.4))) play(want);
  }

  function update(time) {
    const t = clamp(time, 0, BEATS.END);
    const dt = state.t === null ? 0 : t - state.t;
    if (dt < 0 || dt > FLIGHT.seek) { reset(); state.clipSince = -Infinity; }
    const step = dt < 0 || dt > FLIGHT.seek ? 0 : dt;
    state.t = t;

    // The borrowed distance: it grows while a burst lasts (easing in and out, so her speed never jumps) and goes again over
    // FLIGHT.burst.payBack seconds after it.
    const base = route.distanceAt(t);
    if (t < state.burstUntil) {
      const since = t - (state.burstUntil - FLIGHT.burst.seconds);
      const ease = Math.min(smooth(since / 0.3), smooth((state.burstUntil - t) / 0.5));
      state.extra += (FLIGHT.burst.factor - 1) * route.speedAt(t) * ease * step;
    } else if (state.payFrom === null && state.extra > 0) {
      state.payFrom = state.burstUntil; // the burst is over: pay it back from its end
      state.payAmount = state.extra;
    }
    if (state.payFrom !== null) {
      const k = (t - state.payFrom) / FLIGHT.burst.payBack;
      state.extra = k >= 1 ? 0 : state.payAmount * (1 - smooth(k));
      if (k >= 1) state.payFrom = null;
    }
    const s = clamp(base + state.extra, 0, route.length);
    state.speed = step > 0 ? (s - state.s) / step : route.speedAt(t);
    state.s = s;
    state.u = s / route.length;
    if (world) world.flightU = state.u;

    // Aside and down: a steer only in a lane, a skim only in a lane over water.
    const lane = laneAt(state.u);
    const aside = lane ? clamp(state.steer, -1, 1) * lane.half : 0;
    [state.offset, state.offsetV] = spring(state.offset, state.offsetV, aside, step);
    if (lane) state.offset = clamp(state.offset, -lane.half, lane.half);
    route.pointAt(state.u, p);
    const level = state.skim && lane ? route.riverLevelAt(s, 2) : null;
    const down = level === null ? 0 : Math.min(0, level + FLIGHT.skim * scale - p.y);
    [state.lift, state.liftV] = spring(state.lift, state.liftV, down, step);

    // Her turn.
    state.heading = headingAt(Math.max(s, 6));
    state.pitch = clamp(deg(slopeAt(s)) * FLIGHT.pitchShare, -FLIGHT.pitch, FLIGHT.pitch) * smooth((t - LEAP) / 1.5);
    state.turnBank = turnBankAt(t);
    const lean = clamp(state.offsetV * FLIGHT.lean, -FLIGHT.bank, FLIGHT.bank);
    const share = reduced ? 0.5 : 1;
    state.bank = t < LEAP ? 0 : clamp((state.turnBank + lean) * share, -FLIGHT.bank * share, FLIGHT.bank * share);
    if (Object.is(state.bank, -0)) state.bank = 0;

    // Her body on the route, aside and down; her root under it, turned.
    side.set(-Math.sin(state.heading), 0, Math.cos(state.heading));
    pose.position.copy(p).addScaledVector(side, state.offset).addScaledVector(Y, state.lift);
    pose.quaternion.setFromAxisAngle(Y, -state.heading)
      .multiply(q.setFromAxisAngle(Z, rad(state.pitch)))
      .multiply(q.setFromAxisAngle(X, rad(state.bank)));
    root.quaternion.copy(pose.quaternion);
    root.position.copy(hips).applyQuaternion(root.quaternion).negate().add(pose.position);
    if (world) world.flightPoint = pose.position; // her body, where the valley's plants bend away from (world/ardalur: her downwash)
    // On the snag her feet are on its top, whatever her size; the difference goes as she leaps.
    const perched = 1 - smooth((t - LEAP) / 1.5);
    if (perched > 0) root.position.y += (route.tree[1] - (route.pointAt(0, a).y - hips.y)) * perched;

    const climb = (route.pointAt(route.distanceAt(Math.min(BEATS.END, t + 0.5)) / route.length, a).y
      - route.pointAt(route.distanceAt(Math.max(0, t - 0.5)) / route.length, b).y);
    chooseClip(t, climb);
    return api;
  }

  actor.control(() => {
    actor.root.position.copy(root.position);
    actor.root.quaternion.copy(root.quaternion);
  });

  const api = {
    actor, route, pose, root,
    get u() { return state.u; },
    get t() { return state.t; },
    get extra() { return state.extra; },
    get bank() { return state.bank; },
    get turnBank() { return state.turnBank; },
    get pitch() { return state.pitch; },
    get heading() { return deg(state.heading); },
    get speed() { return state.speed; },
    get offset() { return state.offset; },
    get lift() { return state.lift; },
    get bursting() { return state.t !== null && state.t < state.burstUntil; },
    /** The clip she plays now: idle, takeOff, fly, glide or land (the flight's sound beats her wings as she does). */
    get clip() { return state.clip; },
    update,
    steer(x) { state.steer = clamp(Number(x) || 0, -1, 1); },
    skim(on) { state.skim = Boolean(on); },
    /** True when she can burst now (the „Hraðar!“ button shows only then). */
    canBurst() {
      const t = state.t ?? 0;
      return t >= BEATS.B && t <= FASTER_LAST && t >= state.burstUntil + FLIGHT.burst.rest;
    },
    burst() {
      if (!api.canBurst()) return false;
      if (state.payFrom !== null) { state.payFrom = null; } // what is still borrowed is carried into this burst
      state.burstUntil = state.t + FLIGHT.burst.seconds;
      return true;
    },
    land() { state.landing = true; actor.play('land', { fade: FLIGHT.fade }); state.clip = 'land'; },
    stop() {
      actor.control(null);
      if (world && world.flightU === state.u) world.flightU = null;
      if (world && world.flightPoint === pose.position) world.flightPoint = null;
    },
  };
  return api;
}

// The heading (radians, from +X toward +Z) of the route seen from above `s` metres along it, from points a few metres either side;
// `fallback` where it goes straight up or down.
function headingAlong(route, s, fallback = 0, a = new V3(), b = new V3()) {
  for (let span = 3; span < 60; span *= 2) {
    route.pointAt(clamp((s - span) / route.length, 0, 1), a);
    route.pointAt(clamp((s + span) / route.length, 0, 1), b);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.hypot(dx, dz) > 0.5) return Math.atan2(dz, dx);
  }
  return fallback;
}

/**
 * The way she faces on the snag before she leaps (degrees, 0 facing +X and 90 facing +Z), as the flier turns her there: so a scene
 * before the flight can sit her that way (chapter 4 cuts into the flight under a close-up of Egill on her back, kafli4.js).
 */
export function perchedHeading(route) {
  return deg(headingAlong(route, 6));
}

// The seat on her back -------------------------------------------------------------------------------
// The top of her back between the wings, as the bake finds it in carry (pteranodon-source.json `seat`): on the Spine bone at `local`,
// in metres in that bone's frame. Egill's root goes SIT_DEPTH under it (neck-ride.js sits him on her skin the same way), turned as
// her back is: the bone's turn now against its turn in carry's first pose, where her back is level, on top of her root's turn. So he
// banks and pitches with her, and sways with her back in the clips.
export const SEAT = { bone: 'Spine', local: [-0.056, 0.198, 0.009] };
// His hands on her neck ahead of him: [ahead, up, across (his right)] in metres from his root, in the seat's frame.
const HANDS = { left: [0.3, 0.5, -0.1], right: [0.3, 0.5, 0.1] };
// His legs astride her back, likewise: each knee bends toward `knee`, ahead and out over her side, and the ankle reaches for `ankle`, down
// her side. Her back is wider than his legs are long (0.7 m against 0.4), so they go out more than down, as a small boy's on a pony.
const LEGS = {
  left: { knee: [0.25, 0.36, -0.3], ankle: [0.08, 0.17, -0.34] },
  right: { knee: [0.25, 0.36, 0.3], ankle: [0.08, 0.17, 0.34] },
};
const LEAN = 12; // degrees his spine leans forward to the grips
// On her saddle (engine/flier-saddle.js) his seat, knees and ankles are its places, and each wrist goes this far from its grip on the
// handlebar, [ahead, up, across] in the seat's frame: a little behind and over it, his hand round the bar.
const WRIST = [-0.04, 0.03, 0];

/**
 * Seat `rider` on the flier's back for the flight: he plays `sit`, and his root follows the seat each frame, turned with her back;
 * his hands go to her neck. `settle`: seconds he takes to settle into the seat from where he is (riding.js floatTo leaves him
 * upright under it, and her back is tipped); 0 puts him there at once. `saddle` (engine/flier-saddle.js): while it is on her and
 * shown, he sits on it, his hands on its handlebar and his legs down its sides. Returns { stop(), seatLocal, frame(out) } (frame:
 * her back's turn now); stop() gives him back where he is.
 */
export function rideFlier(rider, flier, { bone: boneName = SEAT.bone, offset = SEAT.local, settle = 0, saddle = null } = {}) {
  const host = flier.actor;
  const bone = host.model.getObjectByName(boneName);
  if (!bone) throw new Error(`${host.name} has no bone named "${boneName}"`);
  const seatLocal = new V3(...offset);
  const level = levelTurn(host, bone);
  const rootNow = new THREE.Matrix4();
  const rootThen = new THREE.Matrix4();
  const inBody = new THREE.Matrix4();
  const one = new V3(1, 1, 1);
  const seat = new V3();
  const turn = new THREE.Quaternion();
  const boneTurn = new THREE.Quaternion();
  const rootTurn = new THREE.Quaternion();
  const grips = { left: new V3(), right: new V3() };
  const hands = handsOn(rider, grips);
  const knees = { left: new V3(), right: new V3() };
  const ankles = { left: new V3(), right: new V3() };
  const legs = legsOn(rider, ankles, knees, { lean: LEAN });
  const move = new THREE.Matrix4(); // her root as it was, to where the flier has put it this frame
  const wrist = new V3();
  let t = 0;
  const fromTurn = rider.root.quaternion.clone();
  const from = rider.root.position.clone();
  let off = null;

  // Her back's turn and the seat in the world, with her root where the flier has put it this frame (whether or not she has updated
  // yet: the bone's place in her body is read from her last pose).
  function frame(out) {
    host.root.updateMatrixWorld(true);
    rootThen.copy(host.root.matrixWorld).invert();
    inBody.multiplyMatrices(rootThen, bone.matrixWorld);
    rootNow.compose(flier.root.position, flier.root.quaternion, one);
    seat.copy(seatLocal).applyMatrix4(inBody).applyMatrix4(rootNow);
    bone.getWorldQuaternion(boneTurn);
    host.root.getWorldQuaternion(rootTurn);
    return out.copy(flier.root.quaternion).multiply(rootTurn.invert().multiply(boneTurn)).multiply(level);
  }
  const place = (local, out) => out.set(local[0], local[1], local[2]).applyQuaternion(rider.root.quaternion).add(rider.root.position);
  const controller = {
    drive(dt) {
      t += dt;
      hands.restore();
      legs.restore();
      frame(turn);
      const on = saddle?.ready && saddle.shown ? saddle.update(move.multiplyMatrices(rootNow, rootThen)) : null;
      const k = settle > 0 ? smooth(t / settle) : 1;
      rider.root.position.copy(on ? on.seat : seat).addScaledVector(Y.clone().applyQuaternion(turn), -SIT_DEPTH);
      off ??= from.clone().sub(rider.root.position);
      rider.root.position.addScaledVector(off, 1 - k);
      rider.root.quaternion.slerpQuaternions(fromTurn, turn, k);
      if (on) {
        wrist.set(WRIST[0], WRIST[1], WRIST[2]).applyQuaternion(turn);
        for (const side of ['left', 'right']) {
          grips[side].copy(on.grips[side]).add(wrist);
          knees[side].copy(on.knees[side]);
          ankles[side].copy(on.ankles[side]);
        }
        return;
      }
      place(HANDS.left, grips.left);
      place(HANDS.right, grips.right);
      for (const side of ['left', 'right']) {
        place(LEGS[side].knee, knees[side]);
        place(LEGS[side].ankle, ankles[side]);
      }
    },
    pose() {
      const k = smooth(t / 0.4);
      legs.apply(k); // first: the spine's lean moves his shoulders, which the hands reach from
      hands.apply(k);
    },
    end() { hands.restore(); legs.restore(); },
  };
  const carried = carryRider(rider, controller);
  rider.play('sit', { fade: 0.3 });
  controller.drive(0);
  return {
    seatLocal: seatLocal.toArray(),
    frame(out = new THREE.Quaternion()) { return out.copy(frame(turn)); },
    stop: () => carried.release(),
  };
}

// The inverse of the bone's turn in her body in carry's first pose (her back level), read by posing her there for a moment with a
// mixer of its own and putting every bone back after.
function levelTurn(host, bone) {
  const clip = host.clips.get('carry');
  const saved = [];
  host.model.traverse(o => { if (o.isBone) saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  const probe = new THREE.AnimationMixer(host.model);
  if (clip) {
    probe.clipAction(clip).play();
    probe.setTime(0);
  }
  host.root.updateMatrixWorld(true);
  const rootTurn = host.root.getWorldQuaternion(new THREE.Quaternion());
  const out = rootTurn.invert().multiply(bone.getWorldQuaternion(new THREE.Quaternion())).invert();
  probe.stopAllAction();
  probe.uncacheRoot(host.model);
  for (const [o, position, quaternion, scale] of saved) { o.position.copy(position); o.quaternion.copy(quaternion); o.scale.copy(scale); }
  host.root.updateMatrixWorld(true);
  return out;
}
