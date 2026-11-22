// Grameðla in chapter 6 (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md, scenes 5 and 6, section 3): her life.
// She is big and glad, never a threat. In the call she is a dark shape in the golden glow, nearer each round; then she steps out of
// the cloud, two heavy steps, her own colours coming as she comes, and stops over them; she tilts her head and blinks, bows slowly to
// sniff Egill (her breath blows his hair), roars yes so the cloud blows away, and nods. Made in code on her three clips (idle, walk,
// roar) with her lean laid over them every frame (engine/pose/lean.js), as "Grameðla kemur!" poses her (chapters/gramedla3d).
//
//   const her = gramedlaLife(s, c)        c.gramedla is her actor; c.egill, c.mosi, c.world; hooks c.footfall, c.sfx (optional)
//   her.hide()                            gone at once
//   her.shape(round, direction, stand)    round 0: nothing (the glow alone); 1: a dark shape at herAt (CALL.her[1] m), a step and a
//                                         thud; 2: the shape fills the glow (CALL.her[2] m), a step, a thud and the pebbles hop
//   her.fadeOut()                         the shape melts back into the white (the glow has gone: Mosi walks toward it)
//   yield* her.stepOut()                  out of the cloud to STEP_OUT.stop ahead of Mosi (c.meet.stand), a thud and a tremble a step
//   yield* her.tilt()                     her head TILT.roll degrees to one side, two blinks, and back
//   yield* her.bowAndSniff({ laugh })     the lean eased so her snout comes SNIFF.near m from Egill's head, two breaths that blow his
//                                         hair, `laugh` (a generator function: Egill's line) and up again
//   yield* her.roarYes({ blow, roared })  a breath in (the lean back), her roar (`roared()` as it starts); `blow()` (the cloud's
//                                         blowAway, a Handle) ROAR.blow s into it
//   her.nod()                             two dips and a snort, a Handle
//   her.points()                          { root, head, snout, heading } in the world now (Vector3s, degrees)
//   yield* her.headDown()                 her head down on the ground before them, slowly: an invitation (kafli6-seat.js HEAD_DOWN:
//                                         her lean, her head tipped and her hips forward, her feet where they are)
//   yield* her.rise()                     up again, her head level (Egill on it)
//   her.trampUp(points, { speed, clip })  her stride (STRIDE.speed m/s) along `points` ([x, z]), a Handle; with clip 'walk' her walk
//   her.lean, her.hips                    her lean (createLean) and hips (kafli6-seat.js createHips)
//   her.seen / her.tint                   how much of her is drawn (0 to 1) and how dark the cloud's tint is (1: all tint)
//   her.place, face, walk, idle, roar, show, shown, dispose   as chunk 1's placeholder had them (scene 7 walks her with them)
//
// Everything runs on the game clock (her overlay, the scene's waits), so the book's pause holds it.
import * as THREE from 'three';
import { Handle } from '../engine/handle.js';
import { createLean } from '../engine/pose/lean.js';
import { sparkleBurst } from '../world/props/sparkles.js';
import { CALL, herAt } from './kafli6-route.js';
import { HEAD_DOWN, createHips, headDownPose } from './kafli6-seat.js';

/**
 * How fast she walks (m/s); her roar clip's pace (a little slow: she is big, and at its own pace her snout moves 0.19 m a frame) and
 * how long it holds before she goes back to standing (s).
 */
export const HER = { walk: 1.1, roarPace: 0.75, roar: 3.4 };
/** Her stride up to the top (m/s: the clip's own pace, trex.glb `stride`, 4.2 m in 1.9 s), and a footfall every `footfall` s. */
export const STRIDE = { speed: 2.2, footfall: 0.95 };
/**
 * Her shape in the call: the tint's colour and the cloud's white it is laid over (createTint), how much of the tint is seen by round,
 * how far to Mosi's right of straight ahead she stands when she answers from ahead (degrees: shapePlace), how long she takes to come
 * out of the white, stays, and melts back into it (s), the step she takes toward them after her roar (m, m/s) and when its foot comes
 * down (s into it).
 */
export const SHAPE = { colour: '#3a3632', white: '#f4eee2', seen: [0, 0.35, 0.7], ahead: 11, fadeIn: 1.2, hold: 0.8, fadeOut: 1.6, step: 1.5, stepSpeed: 0.85, footfall: 1.1 };
/**
 * Stepping out (scene 6): she comes out of the white `from` m behind where she stops, as the shape first (seen, s), and walks to
 * `stop` m ahead of Mosi's root in two heavy steps (her walk clip at this speed: its feet come down `footfalls` s in), her own
 * colours coming over them. There her bow reaches Egill with her feet planted; her snout is never nearer than `clear` m to his head
 * before it (measured: kafli6.test.mjs).
 */
export const STEP_OUT = { stop: 7.4, clear: 1.75, thin: 3, from: 3.4, speed: 1.3, seen: 0.7, fadeIn: 0.9, footfalls: [1.2, 2.3] };
/** Her head tilt: degrees about its own length, the time over to it and back (s), how long she holds it, her two blinks (s in). */
export const TILT = { roll: 12, ease: 0.7, hold: 1.4, blinks: [0.45, 1.25] };
/**
 * The sniff: her snout comes `near` m from Egill's head over `seconds` (the lean and her head tipped, found by search), two breaths
 * `breaths` s apart; at each his head tips back `hair` degrees and a puff of sparkles passes him; up again over `rise` s.
 */
export const SNIFF = { near: 1.1, over: 0.35, seconds: 3.2, breaths: 2, between: 1.5, hair: 6, hairSeconds: 0.9, rise: 1.8 };
/** Her roar of yes: the breath in (her lean back, radians, s), the blow this long into her roar (s). */
export const ROAR = { back: 0.15, breathIn: 1, blow: 1.1 };
/** Her nod: two dips of the lean (radians down, her head tipped, s each), the snort with the second. */
export const NOD = { theta: 0.13, pitch: -0.12, seconds: 0.6, gap: 0.62 };
// standing tall in the call and when she steps out: her lean a little back, her head a little up (proud and glad, not looming)
const TALL = { theta: -0.3, pitch: 0.35 };

const rad = THREE.MathUtils.degToRad;
const smooth = k => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };
const way = heading => [Math.cos(rad(heading)), Math.sin(rad(heading))];
const headingTo = ([x0, z0], [x1, z1]) => THREE.MathUtils.radToDeg(Math.atan2(z1 - z0, x1 - x0));

/**
 * Her model out of the engine's fog and darkened toward `colour` in the white (createHaze's way, chapters/gramedla3d/haze.js): as `tint`
 * goes to 1 her albedo goes down and her emissive goes to the shape's colour, which is `colour` laid over the cloud's `white` by
 * `seen` (0: all white, she is not there; 1: all `colour`). She stays opaque: her skin's texture has alpha, which would show through
 * a faint (transparent) shape as her stripes. No shadow while she is mostly tint. Out of the fog the whole chapter (set once, so no
 * shader is built again mid-scene: in the cloud she is a shape, after the roar the air is all but clear). Her skin's material is shared
 * by every model from the same file, so she gets her own copies first; dispose() gives the shared ones back.
 */
export function createTint(model, { colour = SHAPE.colour, white = SHAPE.white } = {}) {
  const shade = new THREE.Color(colour);
  const behind = new THREE.Color(white);
  const meshes = [];
  const tinted = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    const shared = o.material;
    const own = [].concat(shared).map(m => {
      if (!m?.color) return m;
      const lid = m.customProgramCacheKey?.() === 'eyelids';
      const copy = lid ? m : m.clone();
      if (!lid) {
        copy.onBeforeCompile = m.onBeforeCompile;
        copy.customProgramCacheKey = m.customProgramCacheKey;
      }
      tinted.push({ m: copy, own: !lid, colour: copy.color.clone(), emissive: copy.emissive?.clone() ?? null, fog: copy.fog, env: copy.envMapIntensity ?? null, rough: copy.roughness ?? null });
      if (copy.fog) { copy.fog = false; copy.needsUpdate = true; }
      return copy;
    });
    o.material = Array.isArray(shared) ? own : own[0];
    meshes.push({ o, shared, cast: o.castShadow });
  });
  const shapeColour = new THREE.Color();
  let now = { tint: -1, seen: -1 };
  return {
    set(tint = 0, seen = 1) {
      if (Math.abs(tint - now.tint) < 1e-4 && Math.abs(seen - now.seen) < 1e-4) return;
      now = { tint, seen };
      shapeColour.copy(behind).lerp(shade, seen);
      for (const h of tinted) {
        h.m.color.copy(h.colour).multiplyScalar(1 - tint);
        if (h.emissive) h.m.emissive.copy(h.emissive).lerp(shapeColour, tint);
        // no sheen on a shape: her albedo alone going dark leaves the sky's reflection on her skin
        if (h.env !== null) h.m.envMapIntensity = h.env * (1 - tint);
        if (h.rough !== null) h.m.roughness = h.rough + (1 - h.rough) * tint;
      }
      for (const { o, cast } of meshes) o.castShadow = cast && tint < 0.5;
    },
    dispose() {
      for (const { o, shared, cast } of meshes) { o.material = shared; o.castShadow = cast; }
      for (const h of tinted) {
        if (h.own) h.m.dispose();
        else {
        h.m.color.copy(h.colour);
        h.m.emissive?.copy(h.emissive);
        if (h.env !== null) h.m.envMapIntensity = h.env;
        if (h.rough !== null) h.m.roughness = h.rough;
        h.m.fog = h.fog;
        h.m.needsUpdate = true;
      }
      }
    },
  };
}

/**
 * Where her shape stands in round `round` answering from `direction`, Mosi at `stand`: herAt (kafli6-route.js), but straight ahead
 * she stands SHAPE.ahead degrees to his right of his line, or the call's camera (behind him on his line) sees her behind his back.
 */
export function shapePlace(stand, direction, round) {
  if (direction !== 'ahead') return herAt(stand, direction, round);
  const [dx, dz] = way(stand.heading + SHAPE.ahead);
  return [stand.x + dx * CALL.her[round], stand.z + dz * CALL.her[round]];
}

export function gramedlaLife(s, c) {
  const actor = c.gramedla.raw;
  const world = actor.world;
  const lean = createLean(actor);
  const hips = createHips(actor);
  const tint = createTint(actor.model);
  // what she is now: her lean, how much of her is drawn, how dark, hidden
  const now = { theta: 0, turn: 0, roll: 0, pitch: 0, hips: 0, seen: 1, tint: 0 };
  const tweens = new Map(); // key -> { from, to, t0, seconds, handle }
  const bumps = []; // { key, amount, t0, seconds } added on top: dips, breaths
  let clock = 0;
  let hidden = true;
  let roaring = null;
  let shapeAt = null; // the round and way her shape stands in now
  let stepping = null; // her step in the call, waiting for her roar to end

  function value(key) {
    const tw = tweens.get(key);
    if (!tw) return now[key];
    const k = tw.seconds > 0 ? (clock - tw.t0) / tw.seconds : 1;
    now[key] = tw.from + (tw.to - tw.from) * smooth(k);
    if (k >= 1) { tweens.delete(key); tw.handle.finish(); }
    return now[key];
  }
  /** Ease `key` to `to` over `seconds` from where it is (a Handle, done when it is there). */
  function ease(key, to, seconds) {
    tweens.get(key)?.handle.finish();
    const handle = new Handle(`Grameðla ${key}`);
    if (!(seconds > 0)) { tweens.delete(key); now[key] = to; handle.finish(); return handle; }
    tweens.set(key, { from: value(key), to, t0: clock, seconds, handle });
    return handle;
  }
  const easeAll = (pose, seconds) => Object.entries(pose).map(([key, to]) => ease(key, to, seconds));
  /** A dip laid on top of `key`: up by `amount` and back over `seconds`, from `delay` s on. */
  function bump(key, amount, seconds, delay = 0) { bumps.push({ key, amount, t0: clock + delay, seconds }); }
  function bumped(key) {
    let sum = 0;
    for (const b of bumps) {
      if (b.key !== key) continue;
      const u = (clock - b.t0) / b.seconds;
      if (u > 0 && u < 1) sum += b.amount * Math.sin(Math.PI * u) ** 2;
    }
    return sum;
  }

  // every frame after her clips: the lean and the tint (her overlay: the actor runs it after the mixer and her feet)
  actor.setOverlay(dt => {
    clock += dt;
    for (let i = bumps.length - 1; i >= 0; i--) if (clock > bumps[i].t0 + bumps[i].seconds) bumps.splice(i, 1);
    const seen = value('seen');
    actor.root.visible = !hidden && seen > 0.003;
    tint.set(value('tint'), seen);
    hips.set(value('hips')); // before the lean: her pitch turns her head back up by as much
    lean.set({ theta: value('theta') + bumped('theta'), turn: value('turn'), roll: value('roll'), pitch: value('pitch') + bumped('pitch') });
  });

  const wait = seconds => s.wait(seconds);
  const sfx = (name, detail) => (c.sfx ? c.sfx(name, detail) : s.sfx?.(name, detail));
  const footfall = detail => c.footfall?.(detail);
  const hold = (x, z) => actor.place(x, z, actor.heading);
  const note = (what, detail) => c.log?.({ type: 'her', what, ...detail });

  // what she has scheduled on the game clock (her step in the call and its thud, stepping out's thuds): a newer shape, hide(),
  // stepOut() and dispose() take it back, so none of it comes after she has gone or moved on
  const later = new Set();
  function after(seconds, fn) {
    const task = s.after(seconds, () => { later.delete(task); return fn(); });
    later.add(task);
    return task;
  }
  function takeBack() {
    for (const task of later) task.cancel?.();
    later.clear();
  }

  /** A step toward `to` ([x, z]) on her walk, and the foot's thud `at` s in. */
  function step(to, { speed, at, detail }) {
    const going = actor.walkTo([to], { speed, turnRate: 30 });
    after(at, () => { footfall(detail); return null; });
    return going;
  }

  function hide() {
    takeBack();
    roaring?.finish();
    for (const tw of tweens.values()) tw.handle.finish();
    tweens.clear();
    bumps.length = 0;
    now.seen = 0;
    hidden = true;
    shapeAt = null;
    actor.root.visible = false;
  }

  function show() {
    hidden = false;
    if (now.seen <= 0.003) { ease('seen', 1, 0); }
    actor.root.visible = true;
  }

  function roar() {
    roaring?.finish();
    const handle = new Handle('Grameðla roars');
    roaring = handle;
    actor.play('roar', { fade: 0.3, once: true, timeScale: HER.roarPace });
    let t = 0;
    const effects = world.effects;
    if (!effects) { handle.finish(); return handle; }
    effects.add({
      label: 'her roar',
      update: dt => {
        if (handle.done) return false;
        t += dt;
        if (t < HER.roar) return true;
        actor.play('idle', { fade: 0.6 });
        handle.finish();
        return false;
      },
    });
    return handle;
  }

  /**
   * Her shape in the call's round `round` (0 to 2) from `direction`, Mosi at `stand`: in the first round only the glow; then she stands
   * at herAt facing him, out of the fog and dark, comes out of the white, roars, and takes a step toward them with a thud (in the last
   * round the pebbles hop too). Asked again in the same round (she answers again), she roars where she stands.
   */
  function shape(round, direction, stand) {
    if (round <= 0) { if (!hidden) fadeOut(); return; }
    const again = shapeAt && shapeAt.round === round && shapeAt.direction === direction;
    if (!again) {
      takeBack();
      const [x, z] = shapePlace(stand, direction, round);
      for (const tw of tweens.values()) tw.handle.finish();
      tweens.clear();
      bumps.length = 0;
      actor.place(x, z, headingTo([x, z], [stand.x, stand.z]));
      actor.play('idle', { fade: 0 });
      Object.assign(now, { theta: TALL.theta, turn: 0, roll: 0, pitch: TALL.pitch, seen: 0, tint: 1 });
      hidden = false;
      shapeAt = { round, direction, stand };
      ease('seen', SHAPE.seen[round], SHAPE.fadeIn);
    } else if (now.seen < SHAPE.seen[round]) ease('seen', SHAPE.seen[round], SHAPE.fadeIn * 0.5);
    roar();
    // her step toward them comes as her roar ends: answering again before it has, the step waits for the newer roar
    if (again && !(stepping && later.has(stepping))) return;
    if (stepping) { stepping.cancel?.(); later.delete(stepping); }
    stepping = after(HER.roar, () => {
      if (shapeAt?.round !== round) return null;
      const [fx, fz] = way(actor.heading);
      const { x, z } = actor.root.position;
      step([x + fx * SHAPE.step, z + fz * SHAPE.step], { speed: SHAPE.stepSpeed, at: SHAPE.footfall, detail: { round, direction, near: round === 2 } });
      return null;
    });
  }

  /**
   * The shape melts back into the white: once she is all there (a quick child may send Mosi her way before she is) and SHAPE.hold
   * later. A Handle, done when she is gone; a newer shape or step out takes over from it.
   */
  function fadeOut() {
    const handle = new Handle('Grameðla melts into the white');
    const from = shapeAt;
    const tw = tweens.get('seen');
    const left = tw && tw.to > 0 ? Math.max(0, tw.t0 + tw.seconds - clock) : 0;
    s.after(left + SHAPE.hold, () => {
      if (shapeAt !== from) { handle.finish(); return null; }
      shapeAt = null;
      return ease('seen', 0, SHAPE.fadeOut);
    });
    s.after(left + SHAPE.hold + SHAPE.fadeOut, () => { handle.finish(); return null; });
    return handle;
  }

  /** Out of the cloud: from the white behind where she stops, two heavy steps, her colours coming; she stops over them. */
  function* stepOut() {
    const { stand } = c.meet;
    const [fx, fz] = way(stand.heading);
    const at = d => [stand.x + fx * d, stand.z + fz * d];
    const from = at(STEP_OUT.stop + STEP_OUT.from);
    takeBack();
    roaring?.finish();
    for (const tw of tweens.values()) tw.handle.finish();
    tweens.clear();
    actor.place(from[0], from[1], stand.heading + 180);
    actor.play('idle', { fade: 0 });
    Object.assign(now, { theta: TALL.theta, turn: 0, roll: 0, pitch: TALL.pitch, seen: 0, tint: 1 });
    hidden = false;
    shapeAt = null;
    note('stepOut');
    yield ease('seen', STEP_OUT.seen, STEP_OUT.fadeIn);
    const walking = actor.walkTo([at(STEP_OUT.stop)], { speed: STEP_OUT.speed, turnRate: 20 });
    const seconds = STEP_OUT.from / STEP_OUT.speed;
    ease('seen', 1, seconds * 0.55);
    ease('tint', 0, seconds);
    STEP_OUT.footfalls.forEach((t, k) => after(t, () => { footfall({ step: k, near: true, tremble: true }); return null; }));
    yield walking;
    yield s.until(() => !actor.walking && !actor.turning); // her walk settles into her idle by itself
    note('stopped');
  }

  /** Her head to one side and two blinks: a big friend wondering at her guests. */
  function* tilt() {
    ease('roll', rad(TILT.roll), TILT.ease);
    for (const t of TILT.blinks) s.after(t, () => { actor.blink(); return null; });
    yield wait(TILT.ease + TILT.hold);
    yield ease('roll', 0, TILT.ease);
  }

  /**
   * The lean (theta) and her head's tip (pitch) and turn that bring her snout `near` m from `point`, in front of it (between it and
   * her) and not under it, her feet where they are: a search over her pose this frame.
   */
  function sniffPose(point, near = SNIFF.near) {
    const p = new THREE.Vector3();
    const head = new THREE.Vector3();
    const bent = new THREE.Vector3(), q = new THREE.Quaternion();
    let best = null;
    // her head's tip only turns her head about its own place (lean.pitchHead), so for each lean her snout at every tip is the
    // snout of the lean alone turned about her right side round her head: one skeleton pose for each lean, not one for each tip
    const tryPose = pose => {
      p.copy(bent).sub(head).applyQuaternion(q.setFromAxisAngle(lean.right, pose.pitch)).add(head);
      const d = p.distanceTo(point);
      // her snout over his head (at his hair, over Mosi's frill): under it, it reads as going for Mosi, not sniffing Egill
      const under = point.y + SNIFF.over - p.y;
      const score = Math.abs(d - near) + Math.max(0, under) * 3 + Math.abs(pose.theta) * 0.05;
      if (!best || score < best.score) best = { ...pose, score, d };
    };
    for (let theta = -0.1; theta <= 1.2; theta += 0.05) {
      lean.set({ theta, pitch: 0, turn: 0, roll: 0 });
      actor.root.updateMatrixWorld(true);
      lean.bones.Head.getWorldPosition(head);
      lean.snout(bent);
      for (let pitch = -0.7; pitch <= 0.4; pitch += 0.05) tryPose({ theta, pitch, turn: 0, roll: 0 });
    }
    // turned about the upright so the snout points at him from the side too
    lean.set(best);
    actor.root.updateMatrixWorld(true);
    actor.headPosition(head);
    lean.snout(p);
    const yaw = Math.atan2(-(point.z - head.z), point.x - head.x) - Math.atan2(-(p.z - head.z), p.x - head.x);
    best.turn = THREE.MathUtils.clamp(Math.atan2(Math.sin(yaw), Math.cos(yaw)), -0.4, 0.4);
    lean.set({ theta: now.theta, turn: now.turn, roll: now.roll, pitch: now.pitch });
    return best;
  }

  /** She bows slowly to Egill and sniffs him twice (his hair blows); `laugh` runs while she is down; then she rises. */
  function* bowAndSniff({ laugh = null } = {}) {
    const egill = c.egill.raw;
    const target = egill.headPosition(new THREE.Vector3());
    const pose = sniffPose(target);
    note('bow', { pose });
    yield s.all(...easeAll({ theta: pose.theta, pitch: pose.pitch, turn: pose.turn, roll: 0 }, SNIFF.seconds));
    for (let k = 0; k < SNIFF.breaths; k++) {
      sfx('gramedlaExhale', { level: 0.55 + 0.1 * k });
      bump('theta', -0.025, 0.7); // the breath out lifts her a hair
      blowHair(egill, k);
      yield wait(SNIFF.between);
    }
    if (laugh) yield* laugh();
    note('rise');
    yield s.all(...easeAll({ ...TALL, turn: 0 }, SNIFF.rise));
    note('up');
  }

  /** Her breath on Egill: his head tips back and a puff of sparkles passes him, from her nostrils on past him. */
  function blowHair(egill, k) {
    const from = lean.snout(new THREE.Vector3());
    const to = egill.headPosition(new THREE.Vector3());
    const mid = from.clone().lerp(to, 0.7);
    sparkleBurst(world, mid, { count: 16, duration: 1, colour: '#fff6e4', size: 0.1, spread: 0.55, seed: `her breath ${k}` });
    sparkleBurst(world, to.clone().addScaledVector(to.clone().sub(from).setY(0).normalize(), 0.5), { count: 10, duration: 0.9, colour: '#fff6e4', size: 0.08, spread: 0.4, seed: `her breath past ${k}` });
    let t = 0;
    egill.setOverlay((dt, bones) => {
      t += dt;
      const u = t / SNIFF.hairSeconds;
      bones.pitchHead(SNIFF.hair * Math.sin(Math.PI * Math.min(1, u)) ** 2);
      if (u >= 1) egill.setOverlay(null);
    });
  }

  /** The breath in (her lean back), her roar of joy; `blow()` ROAR.blow s into it. Done when the roar and the blow are. */
  function* roarYes({ blow = null, roared: onRoar = null } = {}) {
    note('breathIn');
    yield s.all(...easeAll({ theta: TALL.theta - ROAR.back, pitch: TALL.pitch, turn: 0, roll: 0 }, ROAR.breathIn));
    const roared = roar();
    onRoar?.();
    sfx('gramedlaRoar', { level: 1 });
    ease('theta', TALL.theta, HER.roar);
    let blown = null, blew = false;
    s.after(ROAR.blow, () => { blown = blow?.() ?? null; blew = true; return null; });
    // done when the roar is and the blow has been (and the Handle it gave back, if it gave one, is done)
    yield s.until(() => roared.done && (blow === null || (blew && (blown === null || blown.done))));
  }

  /** Two dips of her lean and a snort: yes. A Handle, done when her head is up again. */
  function nod() {
    const handle = new Handle('Grameðla nods');
    note('nod');
    for (let k = 0; k < 2; k++) {
      bump('theta', NOD.theta, NOD.seconds, k * NOD.gap);
      bump('pitch', NOD.pitch, NOD.seconds, k * NOD.gap);
    }
    s.after(NOD.gap + NOD.seconds * 0.4, () => { sfx('gramedlaExhale', { level: 0.6 }); return null; });
    s.after(NOD.gap + NOD.seconds, () => { handle.finish(); return null; });
    return handle;
  }

  /** Her head down on the ground before them (scene 7), slowly: an invitation; a soft breath as her chin comes to rest. */
  function* headDown() {
    const down = headDownPose(actor, lean, hips);
    note('headDown', { down });
    yield s.all(...easeAll({ theta: down.theta, pitch: down.pitch, hips: down.hips, turn: 0, roll: 0 }, HEAD_DOWN.seconds));
    sfx('gramedlaExhale', { level: 0.45 });
    note('headIsDown');
  }

  /** Up again with Egill on her head, her head level all the way. */
  function* rise() {
    note('rising');
    yield s.all(...easeAll({ theta: 0, pitch: 0, hips: 0, turn: 0, roll: 0 }, HEAD_DOWN.rise));
    note('risen');
  }

  /** Her stride along `points` ([x, z]), or with `clip` 'walk' her walk: a Handle, done as she stops. */
  function trampUp(points, { speed = STRIDE.speed, clip = 'stride' } = {}) {
    return actor.walkTo(points, { speed, turnRate: 30, clip });
  }

  function points() {
    actor.root.updateMatrixWorld(true);
    return { root: actor.root.position.clone(), head: actor.headPosition(new THREE.Vector3()), snout: lean.snout(new THREE.Vector3()), heading: actor.heading };
  }

  return {
    hide, show, shape, fadeOut, stepOut, tilt, bowAndSniff, roarYes, nod, headDown, rise, trampUp, points, lean, hips, roar, hold,
    get shown() { return actor.root.visible; },
    get seen() { return hidden ? 0 : now.seen; },
    get tint() { return now.tint; },
    place([x, z], heading) { actor.place(x, z, heading); },
    face(heading) { return actor.turnTo(heading, { rate: 35 }); },
    walk(points, { speed = HER.walk } = {}) { return actor.walkTo(points, { speed, turnRate: 30 }); },
    idle() { actor.play('idle', { fade: 0.6 }); },
    dispose() { takeBack(); roaring?.finish(); actor.setOverlay(null); hips.release(); lean.release(); tint.dispose(); },
  };
}
