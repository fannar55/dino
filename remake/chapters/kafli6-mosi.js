// Mosi in chapter 6 (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md): what he does that his two clips (idle,
// walk) do not, made in code as his dance in chapter 5 is. Chunk 1: his hop from stone to stone over the ford, and his little roar
// in the cloud (his head and neck up, his beak open; its sound is picked by ear in chunk 4, so for now it is his motion alone).
//
//   const hop = hopTo(mosi.raw, { to: [x, z], y, heading, seconds, height })   -> Handle, done as he lands; he then stands there
//   standOn(mosi.raw, { at: [x, z], y, heading })    he stands on a top that is not the ground (a stone), until let go
//   letGo(mosi.raw)                                  his feet are the ground's again
//   const roar = smallRoar(mosi.raw, { seconds })    -> Handle, done when his head is down again
//
// Each runs on the actor's own update (the game clock), so the book's pause holds it.
import * as THREE from 'three';
import { Handle } from '../engine/handle.js';

const rad = THREE.MathUtils.degToRad;
const smooth = k => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };
/** His hop: how high over the straight way he rises, and how long it takes. */
export const HOP = { height: 0.9, seconds: 0.9 };
/** His little roar: neck and head raised (degrees, up), how long it takes to rise and to come down (s). */
export const ROAR = { neck: 28, head: 18, rise: 0.35, fall: 0.45 };

/** He hops from where he stands to `to` ([x, z]) with his feet at `y`, facing `heading` (degrees); returns a Handle, done on landing. */
export function hopTo(actor, { to, y, heading = actor.heading, seconds = HOP.seconds, height = HOP.height }) {
  const handle = new Handle(`${actor.name} hops`);
  const from = actor.root.position.clone();
  const end = new THREE.Vector3(to[0], y, to[1]);
  const fromHeading = actor.heading;
  const turn = ((((heading - fromHeading) % 360) + 540) % 360) - 180;
  let t = 0;
  actor.control(dt => {
    t += dt;
    const k = Math.min(1, t / seconds);
    const e = smooth(k);
    actor.root.position.lerpVectors(from, end, e);
    actor.root.position.y += Math.sin(Math.PI * k) * height;
    actor.root.rotation.y = -rad(fromHeading + turn * e);
    if (k >= 1 && !handle.done) {
      handle.finish();
      standOn(actor, { at: to, y, heading });
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
