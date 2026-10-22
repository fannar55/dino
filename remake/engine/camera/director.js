import * as THREE from 'three';
import { Handle } from '../handle.js';

// The camera director. Shots are data; moves between them are eased over game-clock time, so
// pausing the game pauses the camera and captures can seek to an exact frame. Every call returns a
// handle with a `done` flag that the scene system waits on. STYLE.md section 8 sets the rules, and
// the director warns (console and `warnings`) when a shot or a move breaks them.
//
// Shot spec: { position, target, fov } or { position, frame: { subject, screen: [u, v] }, fov }
//   position, target and subject are point specs (engine/points.js), so a shot can follow an actor.
//   `frame` puts the subject at screen position u (0 left, 1 right), v (0 top, 1 bottom), and the
//   composition then holds on any screen shape. Shots are authored for 16:10: a narrower screen
//   widens the lens so the whole authored frame stays visible; a wider screen sees more at the sides.
//
// Free look hands the camera to the child for a while: `explore` sets limits around the current view,
// `look` turns the view within them and `hint` pans it to a point. It follows a finger, not a script,
// so it is eased and capped (LOOK) instead of linted as an authored move.

const AUTHORED_ASPECT = 16 / 10;
export const LIMITS = {
  dolly: 1.2, pan: 15, orbit: 10, zoom: 8, // peak speeds: m/s and deg/s
  minShot: 2.5, minMove: 1.5, // seconds
  lens: [24, 60], maxHeight: 7.5, maxDown: 35, safeV: [0.08, 0.7],
};

export const EASE = {
  linear: t => t,
  inOut: t => 0.5 - 0.5 * Math.cos(Math.PI * t),
  in: t => 1 - Math.cos((Math.PI / 2) * t),
  out: t => Math.sin((Math.PI / 2) * t),
  smooth: t => t * t * (3 - 2 * t),
};
// Peak speed of each curve relative to a linear move over the same time.
const PEAK = { linear: 1, inOut: Math.PI / 2, in: Math.PI / 2, out: Math.PI / 2, smooth: 1.5 };
// Free look: the view never turns faster than maxSpeed (deg/s) and follows the finger on a critically
// damped spring of this stiffness (1/s), so it answers at once and comes to rest softly.
const LOOK = { maxSpeed: 60, stiffness: 14 };

const UP = new THREE.Vector3(0, 1, 0);
const deg = THREE.MathUtils.radToDeg;
const rad = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
// Fraction of a timed move done; frame times summed in floating point may land a hair short of the end.
const progress = (elapsed, duration) => (duration <= 0 || elapsed >= duration - 1e-6 ? 1 : elapsed / duration);

// A view as yaw (from +X toward +Z), pitch and distance. Moves blend these separately, so a pan
// stays level instead of swinging over the top the way a shortest-arc rotation would.
function aim(position, target) {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const dz = target.z - position.z;
  const distance = Math.hypot(dx, dy, dz) || 1e-6;
  return { yaw: Math.atan2(dz, dx), pitch: Math.asin(clamp(dy / distance, -1, 1)), distance };
}
function direction(yaw, pitch, out) {
  const c = Math.cos(pitch);
  return out.set(c * Math.cos(yaw), Math.sin(pitch), c * Math.sin(yaw));
}
// How far the view turns between two aims, in degrees, the way a viewer sees it.
function turnDegrees(a, b) {
  const dyaw = wrapPi(b.yaw - a.yaw) * Math.cos((a.pitch + b.pitch) / 2);
  return deg(Math.hypot(dyaw, b.pitch - a.pitch));
}
// An explore limit: [min, max] degrees either side of the view it starts from (0 lies inside), as radians.
function limitRange(name, range) {
  if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] > 0 || range[1] < 0) {
    throw new TypeError(`explore needs ${name}: [min, max] degrees around the current view, with min <= 0 <= max (got ${JSON.stringify(range)})`);
  }
  return [rad(range[0]), rad(range[1])];
}

// The optional handheld feel: slow sums of sines at unrelated rates (about 0.35 Hz), each in [-1, 1].
function wobble(t, k) {
  const w = 2 * Math.PI * 0.35;
  return 0.5 * Math.sin(t * w + k * 1.7) + 0.3 * Math.sin(t * w * 2.31 + k * 4.1) + 0.2 * Math.sin(t * w * 3.73 + k * 2.3);
}
// Amplitudes chosen so the combined offsets stay inside STYLE.md: 0.25 degrees and 1.5 cm.
const HAND = { yaw: 0.2, pitch: 0.14, x: 0.012, y: 0.008 };
// Radius of the sun's shadow focus in the played scene (metres).
export const SHADOW_RADIUS = 14;

export function createDirector({ camera, world, shots = {}, lint = true }) {
  const resolve = world.resolvePoint;
  const rig = { position: camera.position.clone(), target: new THREE.Vector3(0, 1, 0), fov: camera.fov };
  const warnings = [];
  let mode = null; // { kind, label, step(mode) -> finished, handle, continuous, elapsed, dt, then, free }
  let held = null; // the shot being held, or the one a move is heading to: push and zoom build on it
  let time = 0;
  let lastCut = -Infinity;
  const hand = { level: 0, from: 0, to: 0, t: 1, duration: 1, handle: null };
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();

  function warn(message) {
    warnings.push({ time: Number(time.toFixed(2)), message });
    if (lint) console.warn(`[director] ${message}`);
  }

  function spec(shot) {
    if (typeof shot !== 'string') return shot;
    const found = shots[shot];
    if (!found) throw new Error(`No shot named "${shot}"`);
    return { ...found, label: shot };
  }

  // The lens actually used on this screen: the authored 16:10 frame always stays visible.
  function effectiveFov(fov) {
    const aspect = camera.aspect || AUTHORED_ASPECT;
    if (aspect >= AUTHORED_ASPECT) return fov;
    const halfWidth = Math.atan(Math.tan(rad(fov) / 2) * AUTHORED_ASPECT);
    return deg(2 * Math.atan(Math.tan(halfWidth) / aspect));
  }

  // Aim so that `subject` lands exactly at screen position [u, v] seen from `position` with `fov`:
  // find the tilt that gives the subject's ray the right height, then the turn that lines it up.
  function compose(position, subject, [u, v], fov, out) {
    const tanV = Math.tan(rad(effectiveFov(fov)) / 2);
    const tanH = tanV * (camera.aspect || AUTHORED_ASPECT);
    const s = va.set((u - 0.5) * 2 * tanH, (0.5 - v) * 2 * tanV, -1).normalize(); // camera space
    const d = vb.copy(subject).sub(position);
    const distance = d.length() || 1;
    d.divideScalar(distance);
    // Tilting by p about the camera's right axis gives the ray a height of A cos p + B sin p.
    const A = s.y;
    const B = -s.z;
    const R = Math.hypot(A, B);
    const phi = Math.atan2(B, A);
    const swing = Math.acos(clamp(d.y / R, -1, 1));
    const guess = Math.asin(clamp(d.y, -1, 1)) - Math.asin(clamp(s.y, -1, 1));
    const p1 = phi + swing;
    const p2 = phi - swing;
    const pitch = Math.abs(wrapPi(p1 - guess)) < Math.abs(wrapPi(p2 - guess)) ? p1 : p2;
    const tx = s.x;
    const tz = s.y * Math.sin(pitch) + s.z * Math.cos(pitch);
    const yaw = Math.atan2(d.x, d.z) - Math.atan2(tx, tz);
    // The camera's forward axis (0, 0, -1) through the same tilt and turn.
    const c = Math.cos(pitch);
    return out.set(-c * Math.sin(yaw), Math.sin(pitch), -c * Math.cos(yaw)).multiplyScalar(distance).add(position);
  }

  // Evaluate a shot spec into position, target and fov; missing parts keep the current rig's.
  function evaluate(s, position, target) {
    if (s.position) resolve(s.position, position);
    else position.copy(rig.position);
    const fov = s.fov ?? rig.fov;
    if (s.frame) compose(position, resolve(s.frame.subject, vc), s.frame.screen ?? [0.5, 0.5], fov, target);
    else if (s.target) resolve(s.target, target);
    else target.copy(rig.target);
    return fov;
  }

  // Static rules for where a shot ends up: lens, height, no top-down, faces clear of the UI.
  function lintShot(label, s, position, target, fov) {
    const [minLens, maxLens] = LIMITS.lens;
    if (fov < minLens || fov > maxLens) warn(`shot "${label}" uses a ${fov.toFixed(0)} degree lens (keep it between ${minLens} and ${maxLens})`);
    const height = position.y - world.heightAt(position.x, position.z);
    if (height > LIMITS.maxHeight) warn(`shot "${label}" puts the camera ${height.toFixed(1)} m up (wide shots stay under ${LIMITS.maxHeight} m)`);
    if (height < 0.2) warn(`shot "${label}" puts the camera ${height.toFixed(2)} m above the ground`);
    const down = -deg(aim(position, target).pitch);
    if (down > LIMITS.maxDown) warn(`shot "${label}" looks ${down.toFixed(0)} degrees down (no top-down views)`);
    const v = s.frame?.screen?.[1];
    const [top, bottom] = LIMITS.safeV;
    if (v !== undefined && (v < top || v > bottom)) warn(`shot "${label}" frames its subject at v ${v} (keep it between ${top} and ${bottom}, clear of the star counter and captions)`);
  }

  function lintMove(label, from, to, duration, ease) {
    if (ease === 'linear') warn(`move "${label}" is linear; camera moves ease in and out`);
    const peak = PEAK[ease] ?? 1.6;
    const dolly = (from.position.distanceTo(to.position) / duration) * peak;
    const pan = (turnDegrees(aim(from.position, from.target), aim(to.position, to.target)) / duration) * peak;
    const zoom = (Math.abs(to.fov - from.fov) / duration) * peak;
    const over = [];
    if (dolly > LIMITS.dolly * 1.05) over.push(`dolly ${dolly.toFixed(2)} m/s (max ${LIMITS.dolly})`);
    if (pan > LIMITS.pan * 1.05) over.push(`pan ${pan.toFixed(1)} deg/s (max ${LIMITS.pan})`);
    if (zoom > LIMITS.zoom * 1.05) over.push(`zoom ${zoom.toFixed(1)} deg/s (max ${LIMITS.zoom})`);
    if (over.length) warn(`move "${label}" is too fast: ${over.join(', ')}`);
  }

  // The shortest comfortable duration for a move, from the STYLE.md speed limits.
  function autoDuration(from, to, ease) {
    const peak = PEAK[ease] ?? 1.6;
    const margin = 0.85;
    return Math.max(
      LIMITS.minMove,
      (from.position.distanceTo(to.position) * peak) / (LIMITS.dolly * margin),
      (turnDegrees(aim(from.position, from.target), aim(to.position, to.target)) * peak) / (LIMITS.pan * margin),
      (Math.abs(to.fov - from.fov) * peak) / (LIMITS.zoom * margin),
    );
  }

  const snapshot = () => ({ position: rig.position.clone(), target: rig.target.clone(), fov: rig.fov });

  function holdHere() {
    endHint();
    held = null;
    mode = null;
  }

  // A hint is a pan inside the explore mode, so it ends with that mode and nothing is left waiting on it.
  function endHint() {
    const pan = mode?.free?.hint;
    if (!pan) return;
    mode.free.hint = null;
    pan.handle.onCancel = null;
    pan.handle.cancel();
  }

  // Start a mode. A mode being replaced is cancelled quietly; a mode cancelled from outside (by
  // the scene) makes the camera hold where it is. A continuous mode never ends by itself, so its
  // handle is done at once and there is nothing to wait for; `open` keeps it open instead, for a
  // mode its owner cancels (explore).
  function begin(kind, label, step, { continuous = false, open = false } = {}) {
    if (mode && !mode.handle.done) {
      endHint();
      const old = mode.handle;
      old.onCancel = null;
      old.cancel();
    }
    const handle = new Handle(label, () => { if (mode?.handle === handle) holdHere(); });
    mode = { kind, label, step, handle, continuous, elapsed: 0, dt: 0, then: null, free: null };
    if (continuous && !open) handle.finish();
    return handle;
  }

  // Hold a shot. Live parts (an actor, the camera) are re-evaluated every frame, so it keeps tracking.
  function holdShot(s, label) {
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    const handle = begin('hold', label, () => {
      rig.fov = evaluate(s, p, t);
      rig.position.copy(p);
      rig.target.copy(t);
      return false;
    }, { continuous: true });
    held = s;
    return handle;
  }

  /** Jump to a shot. `check: false` skips the shot-length rule (the framing shown before a scene starts). */
  function cut(shot, { check = true } = {}) {
    const s = spec(shot);
    const label = s.label || 'cut';
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    const fov = evaluate(s, p, t); // a broken shot throws here, before anything changes
    lintShot(label, s, p, t, fov);
    if (check && Number.isFinite(lastCut) && time - lastCut < LIMITS.minShot) {
      warn(`cut to "${label}" ${(time - lastCut).toFixed(1)} s after the previous cut (min ${LIMITS.minShot} s)`);
    }
    if (check) lastCut = time;
    const handle = holdShot(s, label);
    rig.position.copy(p);
    rig.target.copy(t);
    rig.fov = fov;
    apply();
    return handle;
  }

  function move(shot, { duration, ease = 'inOut' } = {}) {
    const s = { ...spec(shot) };
    const label = s.label || 'move';
    // A move that leaves out the position or the aim keeps the ones the camera has now.
    if (!s.position) s.position = rig.position.toArray();
    if (!s.target && !s.frame) s.target = rig.target.toArray();
    const from = snapshot();
    const to = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 0 };
    to.fov = evaluate(s, to.position, to.target);
    lintShot(label, s, to.position, to.target, to.fov);
    const d = duration ?? autoDuration(from, to, ease);
    lintMove(label, from, to, d, ease);
    const curve = EASE[ease] ?? EASE.inOut;
    const start = aim(from.position, from.target);
    const dir = new THREE.Vector3();
    const handle = begin('move', label, m => {
      const t = progress(m.elapsed, d);
      to.fov = evaluate(s, to.position, to.target); // keep tracking a moving subject to the end
      const e = curve(t);
      const end = aim(to.position, to.target);
      rig.position.lerpVectors(from.position, to.position, e);
      const yaw = start.yaw + wrapPi(end.yaw - start.yaw) * e;
      const pitch = start.pitch + (end.pitch - start.pitch) * e;
      const distance = start.distance + (end.distance - start.distance) * e;
      rig.target.copy(rig.position).addScaledVector(direction(yaw, pitch, dir), distance);
      rig.fov = from.fov + (to.fov - from.fov) * e;
      return t >= 1;
    });
    held = s; // a push or zoom during the move builds on where it is going
    mode.then = () => holdShot(s, label);
    return handle;
  }

  /** Circle around a point (or actor) by `degrees`; positive turns from +X toward +Z. */
  function orbit({ around, degrees = 40, duration, radius, height, fov, ease = 'inOut' } = {}) {
    const centreSpec = around ?? rig.target.clone();
    const centre = resolve(centreSpec, new THREE.Vector3());
    const rel = rig.position.clone().sub(centre);
    const r0 = Math.hypot(rel.x, rel.z);
    const r1 = radius ?? r0;
    const h0 = rel.y;
    const h1 = height ?? h0;
    const a0 = Math.atan2(rel.z, rel.x);
    const look = rig.target.clone().sub(centre); // keep aiming at the same point relative to the centre
    const f0 = rig.fov;
    const f1 = fov ?? f0;
    const peak = PEAK[ease] ?? 1.6;
    const turn = rad(Math.abs(degrees));
    const d = duration ?? Math.max(
      LIMITS.minMove,
      (Math.abs(degrees) * peak) / (LIMITS.orbit * 0.85),
      (Math.max(r0, r1) * turn * peak) / (LIMITS.dolly * 0.85),
    );
    const over = [];
    const angular = (Math.abs(degrees) / d) * peak;
    const arc = ((Math.max(r0, r1) * turn + Math.hypot(r1 - r0, h1 - h0)) / d) * peak;
    const zoom = (Math.abs(f1 - f0) / d) * peak;
    if (angular > LIMITS.orbit * 1.05) over.push(`${angular.toFixed(1)} deg/s (max ${LIMITS.orbit})`);
    if (arc > LIMITS.dolly * 1.05) over.push(`camera ${arc.toFixed(2)} m/s (max ${LIMITS.dolly})`);
    if (zoom > LIMITS.zoom * 1.05) over.push(`zoom ${zoom.toFixed(1)} deg/s (max ${LIMITS.zoom})`);
    if (over.length) warn(`orbit is too fast: ${over.join(', ')}`);
    if (ease === 'linear') warn('orbit is linear; camera moves ease in and out');
    const curve = EASE[ease] ?? EASE.inOut;
    held = null;
    return begin('orbit', `orbit ${degrees} deg`, m => {
      const t = progress(m.elapsed, d);
      const e = curve(t);
      resolve(centreSpec, centre);
      const a = a0 + rad(degrees) * e;
      const r = r0 + (r1 - r0) * e;
      rig.position.set(centre.x + Math.cos(a) * r, centre.y + h0 + (h1 - h0) * e, centre.z + Math.sin(a) * r);
      rig.target.copy(centre).add(look);
      rig.fov = f0 + (f1 - f0) * e;
      return t >= 1;
    });
  }

  /** Dolly along the view toward what the camera looks at (a soft push in, or out with a negative distance). */
  function push({ distance = 1.2, duration, fov, ease = 'inOut' } = {}) {
    const dir = rig.target.clone().sub(rig.position);
    const len = dir.length();
    dir.normalize();
    const travel = Math.min(distance, Math.max(0, len - 0.4));
    const position = rig.position.clone().addScaledVector(dir, travel).toArray();
    const aimSpec = held?.frame ? { frame: held.frame } : { target: held?.target ?? rig.target.toArray() };
    return move({ position, ...aimSpec, fov: fov ?? held?.fov ?? rig.fov, label: 'push' }, { duration, ease });
  }

  /** Pan from where the camera stands to a new point, optionally framed at a screen position. */
  function lookAt(target, { duration, ease = 'inOut', screen } = {}) {
    const position = rig.position.toArray();
    const aimSpec = screen ? { frame: { subject: target, screen } } : { target };
    return move({ position, ...aimSpec, fov: rig.fov, label: 'look' }, { duration, ease });
  }

  /** Change the lens and keep everything else of the held shot (or the shot a move is heading to). */
  function zoom(fov, { duration, ease = 'inOut' } = {}) {
    const base = held ?? { position: rig.position.toArray(), target: rig.target.toArray() };
    return move({ ...base, fov, label: 'zoom' }, { duration, ease });
  }

  // Critically damped spring with a speed cap, so a follow starts and stops gently.
  function spring(x, v, goal, w, dt, maxSpeed) {
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      va.copy(goal).sub(x).multiplyScalar(w * w).addScaledVector(v, -2 * w);
      v.addScaledVector(va, h);
      if (v.length() > maxSpeed) v.setLength(maxSpeed);
      x.addScaledVector(v, h);
    }
  }

  /**
   * Keep the camera at an offset from a moving actor (world offset, or local to its heading).
   * The camera never moves faster than the dolly rule; a local offset swings with the actor's turns,
   * so prefer world offsets while it turns quickly.
   */
  function follow(subject, { offset = [0, 1.4, 6], local = false, look = 'centre', lookOffset = [0, 0, 0], fov, stiffness = 1.6, maxSpeed = LIMITS.dolly } = {}) {
    const name = typeof subject === 'string' ? subject.split('.')[0] : subject.actor;
    const posSpec = { actor: name, part: 'feet', offset, local };
    // 'head' or 'centre' of the one followed, or any point spec: another actor's head, say (chapter 2: her face coming down to him);
    // lookOffset (metres, in the world) is added to either.
    const lift = new THREE.Vector3().fromArray(lookOffset);
    const lookSpec = typeof look === 'string' ? { actor: name, part: look === 'head' ? 'head' : 'centre', offset: lookOffset }
      : lift.lengthSq() > 0 ? out => resolve(look, out).add(lift) : look;
    const goalP = resolve(posSpec, new THREE.Vector3()); // a missing actor throws here, not every frame
    const goalT = resolve(lookSpec, new THREE.Vector3());
    const velP = new THREE.Vector3();
    const velT = new THREE.Vector3();
    const f0 = rig.fov;
    const f1 = fov ?? f0;
    held = null;
    return begin('follow', `follow ${name}`, m => {
      resolve(posSpec, goalP);
      resolve(lookSpec, goalT);
      spring(rig.position, velP, goalP, stiffness, m.dt, maxSpeed);
      spring(rig.target, velT, goalT, stiffness * 1.6, m.dt, maxSpeed * 2);
      rig.fov = f0 + (f1 - f0) * EASE.inOut(Math.min(1, m.elapsed / 1.5));
      return false;
    }, { continuous: true });
  }

  /**
   * Hand the camera to the child's finger. It stays where it is, and look(dx, dy) turns the view within
   * `yaw` and `pitch`: [min, max] degrees either side of the view it has now. `speed` is degrees per
   * pixel. The handle stays open until it is cancelled, which holds the view where it is.
   */
  function explore({ yaw, pitch, speed = 0.15 } = {}) {
    const limit = { yaw: limitRange('yaw', yaw), pitch: limitRange('pitch', pitch) };
    const base = aim(rig.position, rig.target);
    // The view as (yaw, pitch, 0) radians off the base view: where it is, where the finger has asked
    // it to go, how fast it moves, and the pan of a hint, which takes it over from the finger for a while.
    const free = { base, limit, speed, pos: new THREE.Vector3(), goal: new THREE.Vector3(), vel: new THREE.Vector3(), hint: null };
    const dir = new THREE.Vector3();
    held = null;
    const handle = begin('explore', 'explore', m => {
      const pan = free.hint;
      if (pan) {
        pan.elapsed += m.dt;
        const t = progress(pan.elapsed, pan.duration);
        free.pos.lerpVectors(pan.from, pan.to, EASE.inOut(t));
        if (t >= 1) {
          free.hint = null;
          free.goal.copy(free.pos);
          free.vel.set(0, 0, 0);
          pan.handle.finish();
        }
      } else {
        spring(free.pos, free.vel, free.goal, LOOK.stiffness, m.dt, rad(LOOK.maxSpeed));
      }
      rig.target.copy(rig.position).addScaledVector(direction(base.yaw + free.pos.x, base.pitch + free.pos.y, dir), base.distance);
      return false;
    }, { continuous: true, open: true });
    mode.free = free;
    return handle;
  }

  const exploring = () => (mode?.kind === 'explore' ? mode.free : null);

  /**
   * The child's finger moved (dx, dy) pixels while exploring: the world follows it, so a finger moving
   * right turns the view left, and one moving down tilts it up. It takes the camera back from a hint.
   * It does nothing when the camera is not exploring.
   */
  function look(dx = 0, dy = 0) {
    const free = exploring();
    if (!free) return;
    free.hint?.handle.cancel();
    free.goal.x = clamp(free.goal.x - rad(dx * free.speed), ...free.limit.yaw);
    free.goal.y = clamp(free.goal.y + rad(dy * free.speed), ...free.limit.pitch);
  }

  // At least `duration` seconds, and long enough for the pan to `target` to keep the pan speed limit.
  const panDuration = (target, duration) => Math.max(duration, autoDuration(snapshot(), { position: rig.position, target, fov: rig.fov }, 'inOut'));

  /**
   * Pan the view to a point, to show the child where to look. While exploring the pan stays within
   * the explore limits and gives way to look(). It takes `duration` seconds, or longer when the style
   * guide's pan speed needs it, so a hint never makes the director warn. Outside explore it is an
   * ordinary look-at with that duration.
   */
  function hint(point, { duration = 2 } = {}) {
    const free = exploring();
    const there = resolve(point, vc);
    if (!free) return lookAt(point, { duration: panDuration(there, duration) });
    const goal = aim(rig.position, there);
    const to = new THREE.Vector3(
      clamp(wrapPi(goal.yaw - free.base.yaw), ...free.limit.yaw),
      clamp(goal.pitch - free.base.pitch, ...free.limit.pitch),
      0,
    );
    const end = direction(free.base.yaw + to.x, free.base.pitch + to.y, new THREE.Vector3()).multiplyScalar(free.base.distance).add(rig.position);
    free.hint?.handle.cancel(); // a hint under way gives way to the new one
    const pan = { from: free.pos.clone(), to, duration: panDuration(end, duration), elapsed: 0, handle: null };
    pan.handle = new Handle('hint', () => {
      if (free.hint !== pan) return;
      free.hint = null;
      free.goal.copy(free.pos); // cancelled: the view stays where it is
      free.vel.set(0, 0, 0);
    });
    free.hint = pan;
    return pan.handle;
  }

  /** Fade the handheld feel in or out (0 off, 1 the style guide's maximum); the handle waits for the fade. */
  function handheld(level = 1, { duration = 1 } = {}) {
    hand.handle?.finish(); // a newer fade takes over
    hand.from = hand.level;
    hand.to = clamp(level, 0, 1);
    hand.t = 0;
    hand.duration = Math.max(0.001, duration);
    hand.handle = new Handle(`handheld ${hand.to}`);
    return hand.handle;
  }

  function stop() {
    if (mode && !mode.handle.done) mode.handle.cancel();
    else holdHere();
  }

  function apply() {
    camera.position.copy(rig.position);
    camera.up.copy(UP);
    camera.lookAt(rig.target);
    if (hand.level > 0.001) {
      const k = hand.level;
      camera.rotateY(rad(HAND.yaw) * k * wobble(time, 0));
      camera.rotateX(rad(HAND.pitch) * k * wobble(time, 1));
      camera.translateX(HAND.x * k * wobble(time, 2));
      camera.translateY(HAND.y * k * wobble(time, 3));
    }
    const fov = effectiveFov(rig.fov);
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }

  function update(dt) {
    time += dt;
    if (mode) {
      mode.elapsed += dt;
      mode.dt = dt;
      let finished = false;
      try {
        finished = mode.step(mode);
      } catch (error) {
        // A shot that can no longer be evaluated (an actor removed, say) must not stop the game.
        console.error(`[director] camera ${mode.kind} "${mode.label}" stopped:`, error);
        warnings.push({ time: Number(time.toFixed(2)), message: `camera ${mode.kind} "${mode.label}" stopped: ${error.message}` });
        const broken = mode.handle;
        holdHere();
        broken.onCancel = null;
        broken.cancel();
      }
      if (finished && mode && !mode.continuous) {
        const { handle, then } = mode;
        mode = null;
        handle.finish();
        then?.();
      }
    }
    if (hand.t < 1) {
      hand.t = Math.min(1, hand.t + dt / hand.duration);
      hand.level = hand.from + (hand.to - hand.from) * EASE.inOut(hand.t);
      if (hand.t >= 1) hand.handle?.finish();
    }
    apply();
  }

  /**
   * Where the sun's shadow map should look: the ground under the point the camera aims at (at most
   * 16 m out). The size stays constant, because a changing size changes the shadow texel size mid-move.
   */
  function focusOf(position, target, out) {
    const dir = va.copy(target).sub(position);
    const distance = dir.length();
    dir.normalize();
    out.centre.copy(position).addScaledVector(dir, Math.min(distance, 16));
    out.centre.y = world.heightAt(out.centre.x, out.centre.z);
    out.radius = SHADOW_RADIUS;
    return out;
  }
  function shadowFocus(out = { centre: new THREE.Vector3(), radius: SHADOW_RADIUS }) {
    return focusOf(rig.position, rig.target, out);
  }

  /**
   * Where a shot would put the camera, without going there or changing anything: { position, target, fov, focus }, the fov
   * the lens the camera would use on this screen and focus the shadow's, as shadowFocus would have it. The warm-up draws
   * from these (engine/warm-up.js).
   */
  function poseOf(shot) {
    const s = spec(shot);
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();
    const fov = effectiveFov(evaluate(s, position, target));
    return { position, target, fov, focus: focusOf(position, target, { centre: new THREE.Vector3(), radius: SHADOW_RADIUS }) };
  }

  return {
    rig,
    warnings,
    get time() { return time; },
    get mode() { return mode?.kind ?? 'still'; },
    get busy() { return Boolean(mode && !mode.continuous); },
    get handheldLevel() { return hand.level; },
    cut, move, orbit, push, lookAt, zoom, follow, explore, look, hint, handheld, stop, update, apply,
    shadowFocus, effectiveFov, poseOf,
  };
}
