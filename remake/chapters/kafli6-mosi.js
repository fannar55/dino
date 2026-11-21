// Mosi in chapter 6 (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md): what he does that his two clips (idle,
// walk) do not, made in code as his dance in chapter 5 is: his hop from stone to stone over the ford, and his little roar in the cloud
// (his head and neck up, his beak open; its sound is picked by ear in chunk 4, so for now it is his motion alone).
//
//   const hop = hopTo(s, c, { at: [x, z], y, heading }, { seconds, height, ring })   -> Handle, done as he lands; he then stands there
//   standOn(mosi.raw, { at: [x, z], y, heading })    he stands on a top that is not the ground (a stone), until let go
//   letGo(mosi.raw)                                  his feet are the ground's again
//   const roar = smallRoar(mosi.raw, { seconds })    -> Handle, done when his head is down again
//
// Each runs on the actor's own update (the game clock), so the book's pause holds it.
import * as THREE from 'three';
import { Handle } from '../engine/handle.js';

const rad = THREE.MathUtils.degToRad;
const smooth = k => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };
/**
 * His hop: a big stride of his walk with a bob laid over it. `seconds` a hop, how high the bob lifts him (m), the share of the hop
 * he takes to get going and to stop (his speed is even between: no frame jumps), his nose up as he goes and down as he lands
 * (degrees), and the dip as he lands (m, s): Egill bounces in the saddle with it.
 */
export const HOP = { seconds: 1.1, height: 0.35, ramp: 0.15, pitch: 3, dip: 0.07, settle: 0.3 };
/** His little roar: neck and head raised (degrees, up), how long it takes to rise and to come down (s). */
export const ROAR = { neck: 28, head: 18, rise: 0.35, fall: 0.45 };
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
 * lands the water rings at `ring` ([x, z], where his front feet come down; null: none). A Handle, done as he lands; he then stands there.
 */
export function hopTo(s, c, point, { seconds = HOP.seconds, height = HOP.height, ring = null } = {}) {
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
      actor.play('idle', { fade: 0.35 });
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
 * His little roar: his neck and head go up, his beak opens with a thin call (the mouth follows a made-up line of text: his talk),
 * he holds it, and comes down again. A Handle, done when his head is down.
 */
export function smallRoar(actor, { seconds = 1.8 } = {}) {
  const handle = new Handle(`${actor.name} roars a little`);
  let t = 0;
  const token = actor.talk({ duration: Math.max(0.4, seconds - ROAR.rise - ROAR.fall), text: 'Grrraaaa' });
  actor.setOverlay((dt, bones) => {
    t += dt;
    const up = t < ROAR.rise ? smooth(t / ROAR.rise) : t > seconds - ROAR.fall ? smooth((seconds - t) / ROAR.fall) : 1;
    bones.pitchNeck(ROAR.neck * up);
    bones.pitchHead(ROAR.head * up);
    if (t >= seconds) {
      actor.setOverlay(null);
      actor.stopTalking(token);
      handle.finish();
    }
  });
  return handle;
}
