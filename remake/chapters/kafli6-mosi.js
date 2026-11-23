// Mosi in chapter 6 (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md): what he does that his two clips (idle,
// walk) do not, made in code as his dance in chapter 5 is: his hop from stone to stone over the ford, and his little roar in the cloud
// (his head and neck up, his beak open; its sound, sfx.js mosiRoar, is the chapter's: kafli6.js plays it with this motion).
//
//   const hop = hopTo(s, c, { at: [x, z], y, heading }, { seconds, height, ring })   -> Handle, done as he lands; he then stands there
//   standOn(mosi.raw, { at: [x, z], y, heading })    he stands on a top that is not the ground (a stone), until let go
//   letGo(mosi.raw)                                  his feet are the ground's again
//   const roar = smallRoar(s, c, { seconds })        -> Handle, done when his head is down again (neck, head and jaw: SMALL_ROAR)
//   pointWithHead(c, point, { seconds })             -> Handle: he looks at point and jabs his head toward it twice (the call's help)
//   const dip = dipHead(c); ... dip.up()             his head lowered while she sniffs Egill (DIP); up() -> Handle, done when up
//   const run = runBeside(s, c, points, { speed, pant })   -> Handle, done as he stops: his walk along `points` beside her up to the
//                                                    top (scene 7) as fast as his feet keep up; with `pant` he then puffs (puffs)
//   puffs(c, { seconds })                            -> Handle: his neck and head bob as he gets his breath back, where he stands
//   const off = feetOnTheGround(c)                   Mosi and Grameðla stand on the ground the eye sees (actor.followGround) until off()
//
// Each runs on the actor's own update (the game clock), so the book's pause holds it.
import * as THREE from 'three';
import { Handle } from '../engine/handle.js';
import { rotateBoneWorld } from '../engine/actor.js';

const rad = THREE.MathUtils.degToRad;
const smooth = k => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };
/**
 * His hop: a big stride of his walk with a bob laid over it. `seconds` a hop, how high the bob lifts him (m), the share of the hop
 * he takes to get going and to stop (his speed is even between: no frame jumps), his nose up as he goes and down as he lands
 * (degrees), and the dip as he lands (m, s): Egill bounces in the saddle with it.
 */
export const HOP = { seconds: 1.1, height: 0.35, ramp: 0.12, pitch: 1.5, dip: 0.07, settle: 0.3 };
const WALK_SCALE = 1.8; // his walk's speed in a hop when his gait is not measured yet

/** How far through the way he is at `k` of the hop: speeding up over `ramp`, even, slowing over the last `ramp`. */
export function hopEase(k, ramp = HOP.ramp) {
  const v = 1 / (1 - ramp);
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  if (k < ramp) return (v * k * k) / (2 * ramp);
  if (k > 1 - ramp) return 1 - (v * (1 - k) ** 2) / (2 * ramp);
  return v * (k - ramp / 2);
}

/**
 * Mosi hops to `point` ({ at: [x, z], y: the top under his feet or null for the ground, heading }): his walk plays, his root goes
 * there evenly, turning to `heading`, and a bob lifts him (actor.setOverlay) and dips him as he lands, with Egill riding along. As he
 * lands the water rings at `ring` ([x, z], where his front feet come down; null: none), and he settles into his idle unless `settle`
 * is false (another hop or stride follows at once: his walk goes on, never cut off and started again). A Handle, done as he lands; he
 * then stands there.
 */
export function hopTo(s, c, point, { seconds = HOP.seconds, height = HOP.height, ring = null, settle = true } = {}) {
  const actor = c.mosi.raw;
  const world = c.world;
  const handle = new Handle(`${actor.name} hops`);
  const from = actor.root.position.clone();
  const y = point.y ?? world.heightAt(point.at[0], point.at[1]);
  const end = new THREE.Vector3(point.at[0], y, point.at[1]);
  const fromHeading = actor.heading;
  const heading = point.heading ?? fromHeading;
  const turn = ((((heading - fromHeading) % 360) + 540) % 360) - 180;
  const speed = from.distanceTo(end) / seconds;
  const gait = actor.gait;
  actor.play('walk', { fade: 0.25, timeScale: gait ? THREE.MathUtils.clamp(speed / gait.naturalSpeed, 0.5, 3) : WALK_SCALE });
  let t = 0;
  let landed = false;
  actor.control(dt => {
    t += dt;
    const k = Math.min(1, t / seconds);
    actor.root.position.lerpVectors(from, end, hopEase(k));
    actor.root.rotation.y = -rad(fromHeading + turn * smooth(k));
    if (k >= 1 && !landed) {
      landed = true;
      if (settle) actor.play('idle', { fade: 0.35 });
      if (ring) world.forest?.rippleAt?.(ring[0], ring[1], 0.8);
      c.log?.({ type: 'land', at: [point.at[0], point.at[1]], ring });
      handle.finish();
      standOn(actor, { at: point.at, y, heading });
    }
  });
  let u = 0;
  const off = lay(actor, dt => {
    u += dt;
    const k = u / seconds;
    const model = actor.model;
    if (k < 1) {
      model.position.y = height * Math.sin(Math.PI * k);
      model.rotation.z = rad(HOP.pitch) * Math.sin(2 * Math.PI * k);
    } else {
      const d = (u - seconds) / HOP.settle;
      model.position.y = d < 1 ? -HOP.dip * Math.sin(Math.PI * d) : 0;
      model.rotation.z = 0;
      if (d >= 1) off();
    }
  });
  return handle;
}

/** He stands at `at` with his feet at `y` (a stone's top), facing `heading`, until letGo. */
export function standOn(actor, { at, y, heading = actor.heading }) {
  actor.control(() => {
    actor.root.position.set(at[0], y, at[1]);
    actor.root.rotation.y = -rad(heading);
  });
}

/** His feet are his own again: on the ground where he stands. */
export function letGo(actor) {
  if (!actor.controlled) return;
  const { x, z } = actor.root.position;
  const heading = actor.heading;
  actor.control(null);
  actor.place(x, z, heading);
}

/**
 * His little roar (scene 5): his neck and head go up and his beak opens wide on one envelope (degrees at the peak), a thin quiver
 * in his head while he holds it (degrees, per second), and down again. His motion only: kafli6.js plays its sound (sfx.js mosiRoar).
 */
export const SMALL_ROAR = { seconds: 1.8, neck: 28, head: 22, jaw: 24, rise: 0.35, fall: 0.45, quiver: 1.2, rate: 9 };
/** His head points at a thing (the help that names a way): he looks at it and jabs his head toward it twice (degrees down, s). */
export const POINT = { seconds: 2.6, jab: 9, jabs: 2, first: 0.5, each: 0.45 };

// who lays Mosi's overlay now (a roar, a point): one that ends clears it only while it is still its own; one laid over another ends
// that one (`displaced`: its Handle finished, so a script waiting on it goes on)
const overlays = new WeakMap();
function lay(actor, fn, displaced = null) {
  const token = { displaced };
  overlays.get(actor)?.displaced?.();
  overlays.set(actor, token);
  actor.setOverlay(fn);
  return () => {
    if (overlays.get(actor) !== token) return;
    overlays.delete(actor);
    actor.setOverlay(null);
  };
}

/**
 * His little roar: his neck and head go up, his beak opens and he holds it, quivering a little, and comes down again; laid over his
 * idle with setOverlay (the actor puts his neck, head and jaw back as his clip has them every frame, so nothing is left turned). A
 * Handle, done when his head is down.
 */
export function smallRoar(s, c, { seconds = SMALL_ROAR.seconds } = {}) {
  const actor = c.mosi.raw;
  const handle = new Handle(`${actor.name} roars a little`);
  const jaw = actor.model.getObjectByName('Jaw');
  const q = new THREE.Quaternion();
  const right = new THREE.Vector3();
  const { rise, fall } = SMALL_ROAR;
  let t = 0;
  const done = lay(actor, (dt, bones) => {
    t += dt;
    const up = t < rise ? smooth(t / rise) : t > seconds - fall ? smooth((seconds - t) / fall) : 1;
    const quiver = SMALL_ROAR.quiver * Math.sin(2 * Math.PI * SMALL_ROAR.rate * t) * smooth((t - rise) / 0.2) * up;
    bones.pitchNeck(SMALL_ROAR.neck * up);
    bones.pitchHead(SMALL_ROAR.head * up + quiver);
    if (jaw) {
      right.set(0, 0, 1).applyQuaternion(actor.root.quaternion);
      actor.model.updateMatrixWorld(true);
      rotateBoneWorld(jaw, q.setFromAxisAngle(right, -rad(SMALL_ROAR.jaw * up)));
    }
    if (t >= seconds) {
      done();
      handle.finish();
    }
  }, () => handle.finish());
  return handle;
}

/** His head lowered in greeting while she sniffs Egill (degrees down, s to go down and to come up): his frill out of her way. */
export const DIP = { neck: 18, head: 14, down: 1.4, up: 1.2 };
/**
 * Mosi lowers his head and holds it there until `up()` (a Handle, done when it is up again). On his overlay, as his little roar.
 */
export function dipHead(c) {
  const actor = c.mosi.raw;
  const handle = new Handle(`${actor.name} lifts his head`);
  let t = 0, rising = null;
  const done = lay(actor, (dt, bones) => {
    t += dt;
    const down = rising === null ? smooth(t / DIP.down) : smooth(1 - (t - rising) / DIP.up) * smooth(rising / DIP.down);
    bones.pitchNeck(-DIP.neck * down);
    bones.pitchHead(-DIP.head * down);
    if (rising !== null && t - rising >= DIP.up) { done(); handle.finish(); }
  }, () => handle.finish());
  return {
    up() { if (rising === null) rising = t; return handle; },
  };
}

/**
 * Mosi points with his head at `point` (a point spec): he looks at it and jabs his head toward it twice, then looks ahead again
 * after POINT.seconds. A Handle, done then. On the game clock (world.effects), so the book's pause holds it.
 */
export function pointWithHead(c, point, { seconds = POINT.seconds } = {}) {
  const actor = c.mosi.raw;
  const handle = new Handle(`${actor.name} points with his head`);
  c.mosi.lookAt(point, { weight: 0.9, maxAngle: 80, maxPitch: 40 });
  let t = 0;
  const done = lay(actor, (dt, bones) => {
    t += dt;
    let jab = 0;
    for (let k = 0; k < POINT.jabs; k++) {
      const u = (t - POINT.first - k * POINT.each) / (POINT.each * 0.8);
      if (u > 0 && u < 1) jab = Math.sin(Math.PI * u) ** 2;
    }
    bones.pitchNeck(-POINT.jab * 0.4 * jab);
    bones.pitchHead(-POINT.jab * 0.6 * jab);
    if (t >= POINT.first + POINT.jabs * POINT.each) done();
  });
  let u = 0;
  const effects = c.world.effects;
  const end = () => { done(); c.mosi.lookAt(null); handle.finish(); };
  if (!effects) { end(); return handle; }
  effects.add({
    label: 'Mosi points',
    update: dt => {
      if (handle.done) return false;
      u += dt;
      if (u < seconds) return true;
      end();
      return false;
    },
  });
  return handle;
}

/**
 * Running beside her up the last slope (scene 7): his walk at `speed` m/s, as fast as his feet keep to the ground (his walk's own pace
 * is 1.23 m/s; at 1.8 times it, 2.2 m/s, a planted foot slides under 3 cm in a frame, and more above it). And once he stands on the top, puffing: his neck and head bob `rate`
 * times a second (degrees at the most), fading out over the last `fade` of `seconds`.
 */
export const BESIDE = { speed: 2.2, turnRate: 60 };
export const PANT = { seconds: 9, rate: 1.6, neck: 4, head: 3, fade: 2.5 };

export function runBeside(s, c, points, { speed = BESIDE.speed, pant = false } = {}) {
  const actor = c.mosi.raw;
  const going = actor.walkTo(points, { speed, turnRate: BESIDE.turnRate });
  if (!pant) return going;
  const handle = new Handle(`${actor.name} runs beside her`);
  s.after(0, function* thenPuff() {
    yield going;
    handle.finish();
    puffs(c);
  });
  return handle;
}

/**
 * Mosi and Grameðla stand on the ground the eye sees the whole chapter (actor.followGround): a stage's mesh where it gives one
 * (world/fjall seenAt: on a steep slope its triangles lie off its rounded heights), else the place's heightAt. Mosi's body pitches
 * and rolls with the slope under his four feet, so his front feet do not dig into a slope he walks up; each foot stands on the ground
 * under it. Returns off(): their feet as every other chapter has them.
 */
export function feetOnTheGround(c) {
  const world = c.world;
  const ground = (x, z) => world.forest?.seenAt?.(x, z) ?? world.heightAt(x, z);
  const actors = [c.mosi.raw, c.gramedla.raw];
  for (const actor of actors) actor.followGround(ground);
  return () => { for (const actor of actors) actor.followGround(null); };
}

/** He puffs where he stands: his neck and head bob, fading out over PANT.seconds (on his overlay, as his little roar). A Handle. */
export function puffs(c, { seconds = PANT.seconds } = {}) {
  const actor = c.mosi.raw;
  const handle = new Handle(`${actor.name} puffs`);
  let t = 0;
  const done = lay(actor, (dt, bones) => {
    t += dt;
    const left = smooth((seconds - t) / PANT.fade) * smooth(t / 0.4);
    const beat = Math.sin(2 * Math.PI * PANT.rate * t);
    bones.pitchNeck(PANT.neck * beat * left);
    bones.pitchHead(-PANT.head * 0.5 * beat * left);
    if (t >= seconds || actor.walking) { done(); handle.finish(); }
  }, () => handle.finish());
  return handle;
}
