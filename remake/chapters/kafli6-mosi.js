// Mosi in chapter 6 (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md): what he does that his two clips (idle,
// walk) do not, made in code as his dance in chapter 5 is: his hop from stone to stone over the ford, and his little roar in the cloud
// (his head and neck up, his beak open; its sound is picked by ear in chunk 4, so for now it is his motion alone).
//
//   const hop = hopTo(s, c, { at: [x, z], y, heading }, { seconds, height, ring })   -> Handle, done as he lands; he then stands there
//   standOn(mosi.raw, { at: [x, z], y, heading })    he stands on a top that is not the ground (a stone), until let go
//   letGo(mosi.raw)                                  his feet are the ground's again
//   const roar = smallRoar(s, c, { seconds })        -> Handle, done when his head is down again (neck, head and jaw: SMALL_ROAR)
//   pointWithHead(c, point)                          -> Handle: he looks at point and jabs his head toward it twice (the call's help)
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
  actor.setOverlay(dt => {
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
      if (d >= 1) actor.setOverlay(null);
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
 * in his head while he holds it (degrees, per second), and down again. Its sound is chunk 4's: for now his motion alone.
 */
export const SMALL_ROAR = { seconds: 1.8, neck: 28, head: 22, jaw: 24, rise: 0.35, fall: 0.45, quiver: 1.2, rate: 9 };
/** His head points at a thing (the help that names a way): he looks at it and jabs his head toward it twice (degrees down, s). */
export const POINT = { seconds: 2.6, jab: 9, jabs: 2, first: 0.5, each: 0.45 };

// who lays Mosi's overlay now (a roar, a point): one that ends clears it only while it is still its own
const overlays = new WeakMap();
function lay(actor, fn) {
  const token = {};
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
  });
  return handle;
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
