// Chapter 2's Þórseðla (remake/chapters/kafli2.js, scenes 3 to 7): her life in the Fen and the pieces of her part that the
// chapter's scenes call (the third task of the plan), with their constants and helpers:
//   thorsedlaLife(s, c)  she lives: idle, a nod or a bite every 7 to 12 s, eyes on the nearer of Egill and Mosi while her head is down
//   headDown(s, c)       her head comes down out of the conifers to Egill's eyes and holds there
//   liftUp(s, c)         he floats onto the back of her head and she lifts him to nine metres; Mosi comes round to catch him later
//   slideDown(s, c)      she bends her neck and he slides down it into the saddle on Mosi
//   tailSwish(s, c)      her tail swishes from side to side; tapOnHer(s, c): that, and leaves falling from her mouth (a tap on her)
// `c` is the chapter's shared state (its cast as s.actor wrappers, world, saddle, ring); each piece leaves `c.phase` saying where it
// has got to, for captures and probes. Engine pieces: engine/riding.js (createSeat, ride, floatTo) and engine/neck-ride.js.
import * as THREE from 'three';
import { createSeat, ride, floatTo } from '../engine/riding.js';
import { slideDown as slideDownHerNeck, legsOut, waterDrops, eyesOf, eyeHeightIn, clipTimeForEyes } from '../engine/neck-ride.js';
import { seededRandom } from '../engine/random.js';
import { sparkleBurst } from '../world/props/sparkles.js';
import { FEN } from '../world/forest/config.js';

/**
 * Where Egill's head is at the top of the lift, on the back of her head (measured: kafli2.test holds it to 0.25 m), and where the
 * lookout's far friends are seen from. The layout's `lookout` is the origin of the sight lines tall plants keep out of, 1.5 m from
 * it: its 14 m wide corridors hold the true lines (moving it would re-deal a third of the Fen's plants).
 */
export const LOOKOUT_HEAD = [3.56, 9.75, -9.0];
// The cameras that follow Egill (director.follow, which may rise above 7.5 m, as the lookout's must). Her face comes down over his
// right shoulder from 2.8 m behind him, low (0.95 m above his feet), between the trunks of her two conifers (2.1 and 2.3 m from
// him): it looks out under their crowns, not up into them, tilted up LOOK_UP degrees at most, so that her face comes down into the
// frame as a face, and the sun shows over Mosi's head to wink (STYLE.md 8: 35 degrees up or down at most).
export const HEAD_DOWN_CAMERA = { offset: [-2.8, 0.95, 0.7], local: true, fov: 50 };
// Up with him on his right, 3 m back and 3 m out, as fast as he rises (up to 2.4 m/s: the camera moves with him, not past anything):
// the north conifer, ahead of him on his left, stays behind him and below his head, so that he rises against the sky with her face
// in profile below him. From SWING.from of the rise, his head above the treetop by then, it swings round behind him to his left
// (swingRound) and begins to look down past him at Mosi coming round below (liftLook); at the top it looks all the way down
// (theLookout: LOOKOUT_CAMERA).
export const LIFT_CAMERA = { offset: [-3.0, 1.3, 3.0], local: true, look: 'head', stiffness: 2.0, fov: 44, maxSpeed: 2.4 };
// At the top, behind him on his left, 5.5 m out and 2.2 m above his feet, where Mosi on the bank below is seen past her head and
// neck: with a look LOOK_DOWN degrees down and a wide lens (12 degrees wider in the follow's 1.5 s: 8 degrees a second, STYLE.md 8),
// Egill sits in the top fifth of the frame and Mosi, 44 degrees down, whole far below him, above the caption. (Nearer Egill, Mosi
// would read smaller but lie 50 degrees down, under the caption: he waits 4.8 m out from her neck.)
export const LOOKOUT_CAMERA = { ...LIFT_CAMERA, offset: [-4.76, 2.2, -2.75], fov: 56 };

// Þórseðla's part (scenes 3 to 7), as pieces the scenes call: her life, her head coming down to Egill's eyes, the lookout on the
// back of her head and the slide down her neck. Each piece leaves `c.phase` saying where it has got to, for captures and probes.

// Mosi comes round from his hummock, while she lifts Egill, to the bank beside her withers (dry, clear of her by 1.4 m), facing
// west, with his saddle 5.8 m from them, to catch Egill at the end of the slide.
const MOSI_CATCHES = [4.6, -4.2];
// Her eyes come down to his: this far above the ground he stands on (his own eyes are 0.92 m up). Her root stands 0.74 m lower,
// on the bed of her pool, so lowerHead is held where her eyes get there (about 3.2 s in, her look at him on it) and does not play
// to its end (0.95 m above her feet: holdAtEyes).
const EYES_UP = 1.0;
const HOLD_SETTLE = 1.2; // seconds her look at him settles in before the scene goes on (holdAtEyes keeps her eyes at his after)
// Seconds into her head coming down that the sun winks, over Mosi's head behind Egill's shoulder: from 3.3 to 3.85 s in, the sun and
// its hands are clear of Mosi and in the frame. Before that his horn and head, turning up to follow hers, are in front of the sun or
// of its resting hand; after it the camera, tilting down with her face, has taken the sun out of the top of the frame (kafli2.test
// holds the whole wink on the screen with nobody in front).
const WINK_AT = 3.35;
// The seat on the back of her head (riding.js: createSeat), level however her head and neck turn: 0.15 m behind her Head bone,
// his root 0.65 m above it, which keeps the lowest of him 1 to 3 cm over her skin with his legs out (neck-ride.js: legsOut) from
// the bank to the top (kafli2.test asserts none of him inside her). His hands rest on his thighs.
const SEAT = { bone: 'Head', offset: [0, 0.65, -0.15], grips: { left: [-0.12, 0.45, 0.08], right: [0.12, 0.45, 0.08] } };
const FLOAT = 2.2; // seconds he floats up onto it
const LEGS_OUT = 0.9; // how far his legs go out on her head (1: straight): bent a little at the knee, so the near one is no kick (0.85 sinks a heel)
const LOOK_UP = 14;
const LOOK_DOWN = 32; // the lookout's look down at Mosi (STYLE.md 8: 35 at most)
// Where in the rise the lift camera swings round from his right (LIFT_CAMERA) to his left (LOOKOUT_CAMERA) and begins to look down
// past him at Mosi coming round below, and how far that look goes before the top (liftLook: half of the way to downToMosi, so he
// stays in the frame); at the top it looks all the way down and he says how small Mosi is (theLookout).
const SWING = { from: 0.65, to: 1, most: 0.5 };
// Her life: a nod or a bite every 7 to 12 s, the first 2.5 s after she is seen; the nod (kink) is 2.8 s, its lowest 0.95 s in,
// where her mouth closes on the twigs.
const LIFE = { first: 2.5, gap: [7, 12], nod: 2.8, bite: 0.95, chew: 1.4 };
// Her chew as she bites is as loud as near her head the camera is: whole within 8 m of it, gone 25 m off (a wide shot of the Fen).
const CHEW_HEARD = [8, 25];
const LEAVES = { count: 6, rest: 2.5, shrink: 0.6, colours: [FEN.canopyMid, FEN.canopySun, FEN.hangingMoss] };
const TAIL_BONES = ['Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7']; // the ones her tail swishes with (tailSwish)
// For the slide she bends her neck down again, liftUp backwards to 5.3 s, so it slopes from her head to her withers like a slide.
const BEND = { to: 5.3, rate: 0.7 };
const SLIDE_WAIT = 5;
const HER_LOOK = { weight: 1, maxAngle: 20, maxPitch: 20 }; // a small aim: her look turns the base of her 6 m neck as well as her head
const EGILL_HEAD = { actor: 'egill', part: 'head' };
export const MOSI_HEAD = { actor: 'mosi', part: 'head' };
const EGILL_EYES = { actor: 'egill', part: 'head', offset: [0.07, 0.03, 0], local: true }; // his eyes, in front of his head bone
const HER_HEAD = { actor: 'thorsedla', part: 'head' };
const UP = new THREE.Vector3(0, 1, 0);
const smooth = t => t * t * (3 - 2 * t);
const smoothstep01 = t => smooth(Math.max(0, Math.min(1, t)));

/**
 * Þórseðla alive, from when the Fen is reached: she breathes and her tail sways (idle); every 7 to 12 s she nods or bites the
 * conifer she faces (kink, six of its leaves falling from her mouth and a chew); and while her head is down she looks at whichever
 * of Egill and Mosi is nearer. A piece that needs her head holds her (c.life.hold(), c.life.free()). `c.life.log` keeps each nod
 * and bite ({ kind, at, afterHold }). Returns c.life.
 */
export function thorsedlaLife(s, c) {
  if (c.life) return c.life;
  const life = {
    log: [], held: 0, headDown: false,
    hold() { life.held++; },
    free() { life.held = Math.max(0, life.held - 1); },
  };
  c.life = life;
  s.after(0, () => living(s, c));
  s.after(0, () => watching(s, c));
  return life;
}

function* living(s, c) {
  const { life } = c;
  const her = c.thorsedla.raw;
  const random = seededRandom('thorsedla life');
  let last = s.time;
  let afterHold = false;
  for (let n = 0; ; n++) {
    const gap = n === 0 ? LIFE.first : LIFE.gap[0] + (LIFE.gap[1] - LIFE.gap[0]) * random();
    yield s.until(() => life.held > 0 || s.time - last >= gap);
    if (life.held > 0) {
      yield s.until(() => life.held === 0);
      last = s.time;
      afterHold = true;
      continue;
    }
    const kind = n % 3 === 1 ? 'kink' : 'bite'; // two bites to a nod
    last = s.time;
    life.log.push({ kind, at: s.time, afterHold });
    afterHold = false;
    her.play('kink', { once: true, fade: 0.5 });
    if (kind === 'bite') {
      yield s.wait(LIFE.bite);
      if (life.held) continue;
      leafFall(c, mouthOf(her));
      her.talk({ text: 'namm namm namm', duration: LIFE.chew });
      const heard = 1 - smoothstep01((her.headPosition(new THREE.Vector3()).distanceTo(c.world.camera.position) - CHEW_HEARD[0]) / (CHEW_HEARD[1] - CHEW_HEARD[0]));
      if (heard > 0.02) s.sfx('chew', { level: heard });
      yield s.wait(LIFE.nod - LIFE.bite);
    } else {
      yield s.wait(LIFE.nod);
    }
    if (!life.held) her.play('idle', { fade: 0.8 });
  }
}

function* watching(s, c) {
  const her = c.thorsedla.raw;
  const head = new THREE.Vector3();
  let looking = null;
  for (;;) {
    let want = null;
    if (c.life.headDown) {
      her.headPosition(head);
      want = head.distanceTo(c.egill.raw.root.position) <= head.distanceTo(c.mosi.raw.root.position) ? eyesMeet(c, EGILL_EYES) : eyesMeet(c, MOSI_HEAD);
    }
    if (want !== looking) {
      looking = want;
      her.lookAt(want, HER_LOOK);
    }
    yield s.wait(0.5);
  }
}

/**
 * Her head comes down (scene 4's end): lowerHead, slowly out of her conifers, until her eyes are level with Egill's, and there it
 * holds; rings spread round her fore feet as her weight comes forward, the camera over his shoulder looks up into the face coming
 * down, the sun winks, and she looks him in the eye. She is held (c.life) until the slide is over.
 */
export function* headDown(s, c) {
  const { thorsedla: her, egill } = c;
  thorsedlaLife(s, c);
  c.phase = 'head coming down';
  c.life.hold();
  c.life.headDown = false;
  yield her.lookAt(null);
  yield egill.lookAt(HER_HEAD, { weight: 0.85, maxAngle: 40, maxPitch: 40 });
  s.camera.follow('egill', { ...HEAD_DOWN_CAMERA, look: faceInView(c) });
  s.sfx('sniff'); // she stops biting and smells the berries
  const lowering = her.raw.play('lowerHead', { fade: 0.8 });
  s.after(0.6, () => ringAtFoot(c, 'FrontFootL'));
  s.after(1.1, () => ringAtFoot(c, 'FrontFootR'));
  s.after(WINK_AT, () => s.sun.wink());
  s.after(2.6, () => her.lookAt(eyesMeet(c, EGILL_EYES), HER_LOOK));
  yield* holdAtEyes(s, c, lowering);
  c.life.headDown = true;
  c.phase = 'head down';
}

/**
 * lowerHead plays until her eyes reach Egill's (EYES_UP over his ground), then holds there until he floats up (c.headHold false):
 * her look at him turns the base of her neck a little and settles slowly, so the clip is moved on or back to keep her eyes at his,
 * except while she speaks (her talk nods her head, which it would undo).
 */
function* holdAtEyes(s, c, action) {
  const her = c.thorsedla.raw;
  const egill = c.egill.raw;
  const eyes = eyesOf(her);
  const at = new THREE.Vector3();
  const goal = () => c.world.heightAt(egill.root.position.x, egill.root.position.z) + EYES_UP;
  const end = action.getClip().duration - 1e-4;
  yield s.until(() => eyes(at).y <= goal() || action.time >= end);
  action.setEffectiveTimeScale(0);
  c.held = action.time;
  c.headHold = true;
  s.sfx('breathHuge'); // her face at his eyes: a big, warm breath
  // Her eyes as she is drawn, her look laid over the clip: where they are too high the clip moves on a little, too low it moves back.
  c.world.effects.add({
    label: 'her eyes held at his',
    update() {
      if (!c.headHold) return false;
      if (!her.talking) {
        const off = eyes(at).y - goal();
        action.time = THREE.MathUtils.clamp(action.time + THREE.MathUtils.clamp(off * 0.25, -0.02, 0.02), 0, end);
        c.held = action.time;
      }
      return true;
    },
  });
  yield s.wait(HOLD_SETTLE);
}

/**
 * The lift (scene 6): the back of her head glitters for a tap; a tap there or on Egill floats him up onto the seat on it (or he
 * floats up by himself after 6 s), sitting and his legs going out in front of him on the way, and he rides there; she lifts him
 * slowly to her full height (liftUp, from the point of its own where her head is as high as it is held), water dripping off her
 * neck, the camera rising with him and turning down toward Mosi, who comes round meanwhile to catch him after the slide. Leaves him
 * at the top, c.phase 'lookout', and where his head is there in c.lookout.
 */
export function* liftUp(s, c) {
  const { world, thorsedla: her, egill } = c;
  thorsedlaLife(s, c);
  c.seat ??= createSeat(her.raw, SEAT);
  const glitter = s.after(0, () => glitterSeat(s, c));
  s.target('seat', { point: out => out.copy(c.seat.update()).addScaledVector(UP, 0.45), radius: 0.6 });
  s.target('egill', { point: 'egill', radius: 0.7 });
  try {
    yield s.race(s.tap(['seat', 'egill']), s.wait(6));
  } finally {
    s.target('seat', null);
    s.target('egill', null);
    glitter.cancel();
  }
  c.phase = 'floating up';
  c.headHold = false; // her head stays where it is held now
  c.life.headDown = false; // she stops looking at him: he is coming onto her head
  yield her.lookAt(null, HER_LOOK); // (with the same limits, so her look fades as it was)
  yield egill.lookAt(null);
  // The camera over his shoulder stays where it is and watches him float up onto the back of her head (it followed him standing),
  // looking between his head and her eyes, so that neither leaves the frame.
  s.camera.lookAt(betweenHimAndHer(c), { duration: 1 });
  s.sfx('float');
  c.legs = legsOut(egill.raw);
  // Halfway up he sits, his legs going out in front of him, so that he comes down onto her head as he will sit on it (the float
  // itself would sit him only for its last 0.6 s, his legs hanging into her skull till then).
  s.after(FLOAT * 0.4, () => {
    egill.raw.play('sit', { fade: 0.5 });
    c.legs?.to(LEGS_OUT, { duration: 0.5 });
  });
  yield floatTo(egill.raw, c.seat, { duration: FLOAT });
  c.riding = ride(egill.raw, c.seat);
  c.phase = 'lifting';
  const held = c.held ?? her.raw.clips.get('lowerHead').duration;
  const lift = her.raw.play('liftUp', { fade: 0.6 });
  lift.time = clipTimeForEyes(her.raw, 'liftUp', eyeHeightIn(her.raw, 'lowerHead', held));
  const rising = lift.getClip().duration - lift.time;
  c.lift = { action: lift, from: lift.time, rising };
  s.sfx('liftTone', { seconds: rising }); // a tone rising two octaves all the way up
  s.camera.cut('fen_lift');
  s.camera.follow('egill', { ...LIFT_CAMERA, offset: swingRound(c), look: liftLook(c) });
  c.mosiComing = c.mosi.walkTo([[MOSI_CATCHES[0] + 1.5, MOSI_CATCHES[1]], MOSI_CATCHES], { speed: 0.9 }); // arriving facing west
  const drops = waterDrops(world, { seconds: rising, seed: 'her neck drips', ring: c.ring });
  const dripping = s.after(0.3, () => dripFromNeck(s, c, drops));
  yield s.until(() => lift.time >= lift.getClip().duration - 1e-3);
  dripping.cancel();
  c.lookout = egill.raw.headPosition(new THREE.Vector3()); // where he looks out from: LOOKOUT_HEAD
  c.phase = 'lookout';
  s.sfx('windHigh'); // the wind nine metres up
}

/**
 * The slide (scene 7): Mosi comes round to the bank beside her withers to catch Egill and she bends her neck down like a slide; a
 * tap on Egill sends him (or by himself after 5 s): "Vúúú!", down her neck and into the saddle (neck-ride.js: slideDown). Then her
 * head goes back up into her conifers and her life goes on.
 */
export function* slideDown(s, c) {
  const { thorsedla: her, egill, mosi } = c;
  thorsedlaLife(s, c);
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.7, maxAngle: 40, maxPitch: 30 });
  const coming = c.mosiComing ?? mosi.walkTo([[MOSI_CATCHES[0] + 1.5, MOSI_CATCHES[1]], MOSI_CATCHES], { speed: 0.9 });
  yield s.camera.cut('fen_slide');
  yield s.all(coming, bendNeck(s, c));
  s.target('egill', { point: 'egill', radius: 0.8 });
  try {
    yield s.race(s.tap('egill'), s.wait(SLIDE_WAIT));
  } finally {
    s.target('egill', null);
  }
  c.phase = 'sliding';
  s.say('egill', 'k2_egill_wuuu');
  s.sfx('slide');
  c.slide = slideDownHerNeck(egill.raw, her.raw, c.saddle, { duration: 3.2, legs: c.legs, ring: c.ring });
  s.after(0, function* landing() { // the bump into the saddle as he lands in it, with its little bounce
    yield s.until(() => c.slide.phase === 'bounce' || c.slide.done);
    s.sfx('landSaddle');
  });
  yield c.slide;
  c.riding = c.slide.riding;
  c.legs = null;
  c.phase = 'in the saddle';
  yield mosi.lookAt(null);
  her.raw.play('idle', { fade: 2.5 });
  c.life.free();
}

/** She bends her neck back down partway: liftUp backwards to BEND.to, where it holds. */
function* bendNeck(s, c) {
  const her = c.thorsedla.raw;
  const lift = her.mixer.existingAction(her.clips.get('liftUp'));
  if (!lift) return;
  lift.paused = false; // a clip played once and held at its end is paused (three.js: clampWhenFinished)
  lift.setEffectiveTimeScale(-BEND.rate);
  yield s.until(() => lift.time <= BEND.to);
  lift.setEffectiveTimeScale(0);
}

/** The back of her head glitters while it waits for a tap, as chapter 1's saddle does: gold glints round the seat every 1.4 s. */
function* glitterSeat(s, c) {
  const at = new THREE.Vector3();
  for (let i = 0; ; i++) {
    at.copy(c.seat.update()).addScaledVector(UP, 0.4);
    const k = i * 2.39996; // a golden angle at a time round the seat
    at.x += Math.cos(k) * 0.3;
    at.z += Math.sin(k) * 0.3;
    sparkleBurst(c.world, at.clone(), { count: 12, duration: 1.2, size: 0.32, spread: 0.7, seed: `seat glitter ${i % 8}` });
    yield s.wait(1.4);
  }
}

/** Water drips off the underside of her neck as she lifts it: a drop every 0.3 s from one of its joints, a ring where it lands in water. */
function* dripFromNeck(s, c, drops) {
  const her = c.thorsedla.raw;
  const joints = ['Neck2', 'Neck3', 'Neck4', 'Neck5'].map(name => her.model.getObjectByName(name));
  const random = seededRandom('neck drips');
  const at = new THREE.Vector3();
  for (;;) {
    const joint = joints[Math.floor(random() * joints.length)];
    joint.getWorldPosition(at);
    at.y -= 0.45; // the bones run low in her neck: its underside is just under them
    at.z += (random() - 0.5) * 0.6;
    drops.drip(at);
    yield s.wait(0.3);
  }
}

/** Six of the conifer's leaves fall from her mouth, fluttering and turning, and lie on the water or the ground a while. */
function leafFall(c, from, seed = c.life.log.length) {
  const { world } = c;
  const mesh = new THREE.InstancedMesh(leafShape(), leafMaterial(), LEAVES.count);
  mesh.name = 'Þórseðla leaves';
  mesh.frustumCulled = false; // they fall out of any bounds taken at the start
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const random = seededRandom(`leaves ${seed}`);
  const tint = new THREE.Color();
  const leaves = Array.from({ length: LEAVES.count }, (_, i) => {
    const start = from.clone().add(new THREE.Vector3((random() - 0.5) * 0.7, (random() - 0.5) * 0.3, (random() - 0.5) * 0.7));
    const surface = world.forest?.water?.surfaceAt?.(start.x, start.z) ?? null;
    mesh.setColorAt(i, tint.set(LEAVES.colours[i % LEAVES.colours.length]).offsetHSL(0, 0, (random() - 0.5) * 0.08));
    return {
      start, at: start.clone(), speed: 0.75 + 0.35 * random(), sway: 0.25 + 0.25 * random(), rate: 1.3 + 0.6 * random(),
      phase: random() * Math.PI * 2, axis: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(),
      spin: 2 + 2 * random(), yaw: random() * Math.PI * 2, wet: surface !== null,
      floor: (surface ?? world.heightAt(start.x, start.z)) + 0.01, landed: -1,
    };
  });
  world.scene.add(mesh);
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const size = new THREE.Vector3();
  let t = 0;
  let rings = 0;
  world.effects.add({
    label: 'Þórseðla leaves',
    update(dt) {
      t += dt;
      let showing = 0;
      leaves.forEach((leaf, i) => {
        let scale = 1;
        if (leaf.landed < 0) {
          leaf.at.y -= leaf.speed * dt;
          const sway = leaf.sway * Math.sin(leaf.rate * t + leaf.phase);
          leaf.at.x = leaf.start.x + sway;
          leaf.at.z = leaf.start.z + 0.5 * sway;
          turn.setFromAxisAngle(leaf.axis, leaf.spin * t);
          if (leaf.at.y <= leaf.floor) {
            leaf.at.y = leaf.floor;
            leaf.landed = t;
            if (leaf.wet && rings++ < 2) c.ring([leaf.at.x, leaf.floor, leaf.at.z], 0.2);
          }
        } else {
          turn.setFromAxisAngle(UP, leaf.yaw).multiply(flat); // lying flat where it fell
          scale = 1 - Math.min(1, Math.max(0, (t - leaf.landed - LEAVES.rest) / LEAVES.shrink));
        }
        if (scale > 0) showing++;
        mesh.setMatrixAt(i, matrix.compose(leaf.at, turn, size.setScalar(Math.max(1e-4, scale))));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (showing) return true;
      mesh.removeFromParent();
      mesh.dispose(); // its instance buffers: the shape and the material are shared
      return false;
    },
  });
}

// A sprig of the swamp conifer's flat needles, 22 cm long: a pointed leaf in its own XY plane, and one plain material (each leaf's
// colour is its instance's), both shared by every falling leaf and drawn once in the chapter's warm-up (chapter.warmUp: leafWarm).
let sprig = null;
let sprigMaterial = null;
function leafShape() {
  if (sprig) return sprig;
  const rim = [[-0.11, 0], [-0.05, 0.035], [0.04, 0.04], [0.11, 0], [0.04, -0.04], [-0.05, -0.035]];
  sprig = new THREE.BufferGeometry();
  sprig.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, ...rim.flatMap(([x, y]) => [x, y, 0])], 3));
  sprig.setIndex(rim.flatMap((_, i) => [0, 1 + i, 1 + ((i + 1) % rim.length)]));
  sprig.computeVertexNormals();
  return sprig;
}
function leafMaterial() {
  sprigMaterial ??= new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  return sprigMaterial;
}
/** One leaf, out of sight, for the warm-up to draw so that the first bite builds no shader mid-scene. dispose() takes it away. */
export function leafWarm(world) {
  const mesh = new THREE.InstancedMesh(leafShape(), leafMaterial(), 1);
  mesh.name = 'Þórseðla leaves (warm-up)';
  mesh.setColorAt(0, new THREE.Color(LEAVES.colours[0]));
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.visible = false;
  world.scene.add(mesh);
  return { object: mesh, dispose() { mesh.removeFromParent(); mesh.dispose(); } };
}

/**
 * Her tail swishes from side to side, twice, laid over her clip as engine/hand-hold.js lays a hold over one: each frame the clip's
 * own turn goes back to every bone the mixer left as the swish set it, then the swish turns the tail about the vertical, more
 * toward its tip. A task (yield it to wait, or let it run).
 */
export function* tailSwish(s, c, { seconds = 2.4, reach = 0.1 } = {}) {
  if (c.swishing) return;
  c.swishing = true;
  (c.swishLog ??= []).push(s.time);
  const her = c.thorsedla.raw;
  const bones = TAIL_BONES.map(name => her.model.getObjectByName(name)).filter(Boolean);
  const own = bones.map(() => new THREE.Quaternion());
  const set = bones.map(() => null);
  const parent = new THREE.Quaternion(), turn = new THREE.Quaternion(), local = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  let t = 0;
  let over = false;
  c.world.effects.add({
    label: 'her tail swishes',
    update(dt) {
      for (let i = 0; i < bones.length; i++) {
        if (set[i] && bones[i].quaternion.equals(set[i])) bones[i].quaternion.copy(own[i]);
        set[i] = null;
      }
      if (over) return false;
      t += dt;
      const k = Math.sin(Math.PI * Math.min(1, t / seconds)) * Math.sin((Math.PI * 2 * t * 2) / seconds);
      her.root.updateMatrixWorld(true);
      bones.forEach((bone, i) => {
        own[i].copy(bone.quaternion);
        bone.parent.getWorldQuaternion(parent);
        turn.setFromAxisAngle(UP, reach * k * (0.6 + 0.4 * i));
        local.copy(parent).invert().multiply(turn).multiply(parent);
        bone.quaternion.premultiply(local);
        bone.updateMatrixWorld(true);
        set[i] = bone.quaternion.clone();
      });
      if (t >= seconds) over = true;
      return true;
    },
  });
  try {
    yield s.wait(seconds);
  } finally {
    c.swishing = false;
  }
}

/**
 * A tap on her while her head is up in the trees (scene 3): her tail swishes and a few leaves fall from her mouth, nothing more;
 * a tap while the tail still swishes is part of that one. Starts its own task: an onTap handler's return is not waited on.
 */
export function tapOnHer(s, c) {
  if (c.swishing || c.tapping) return;
  c.tapping = true;
  c.taps = (c.taps ?? 0) + 1;
  s.after(0, function* swish() {
    c.tapping = false;
    yield* tailSwish(s, c);
  });
  leafFall(c, mouthOf(c.thorsedla.raw), `tap ${c.taps}`);
}

/** Where her mouth closes on the twigs: in front of and under her Head bone, toward the tip of her snout. */
export function mouthOf(her) {
  const head = her.model.getObjectByName('Head');
  head.updateWorldMatrix(true, false);
  return head.localToWorld(new THREE.Vector3(1.0, -0.15, 0));
}

/** A ring on the water round one of her feet. */
function ringAtFoot(c, name) {
  const foot = c.thorsedla.raw.model.getObjectByName(name);
  if (!foot) return;
  const at = foot.getWorldPosition(new THREE.Vector3());
  c.ring([at.x, at.y, at.z], 0.6);
}

/**
 * What she looks at to look someone in the eye: her look aims her head from its bone, which is 0.45 m under her eyes, so the point
 * is theirs less that, and her eyes look level into theirs instead of her head rising until its bone is as high as their eyes. One
 * point spec for each, kept, so that looking at the same one again is no new glance.
 */
function eyesMeet(c, spec) {
  c.looks ??= new Map();
  if (c.looks.has(spec)) return c.looks.get(spec);
  const eyes = eyesOf(c.thorsedla.raw);
  const head = new THREE.Vector3();
  const mine = new THREE.Vector3();
  const look = out => {
    c.world.resolvePoint(spec, out);
    eyes(mine);
    return out.sub(mine).add(c.thorsedla.raw.headPosition(head));
  };
  c.looks.set(spec, look);
  return look;
}

/** Her eyes, as a point for the camera over Egill's shoulder to look at, but never more than LOOK_UP degrees up from it. */
export function faceInView(c) {
  const eyes = eyesOf(c.thorsedla.raw);
  const camera = c.world.camera.position;
  return out => {
    eyes(out);
    const level = Math.hypot(out.x - camera.x, out.z - camera.z);
    out.y = Math.min(out.y, camera.y + level * Math.tan(THREE.MathUtils.degToRad(LOOK_UP)));
    return out;
  };
}

/** Between Egill's head and her eyes: what the shoulder camera watches as he floats up onto her head. */
function betweenHimAndHer(c) {
  const eyes = eyesOf(c.thorsedla.raw);
  const head = new THREE.Vector3();
  return out => eyes(out).lerp(c.egill.raw.headPosition(head), 0.5);
}

/** How far through the swing of the lift camera the rise is (0 before SWING.from, 1 at SWING.to), eased. */
function swung(c) {
  const { action, from, rising } = c.lift;
  return smooth(Math.min(1, Math.max(0, ((action.time - from) / rising - SWING.from) / (SWING.to - SWING.from))));
}

/** The lift camera's offset: LIFT_CAMERA's on his right, swinging round behind him to LOOKOUT_CAMERA's on his left as he nears the top. */
function swingRound(c) {
  const [bx, by, bz] = LIFT_CAMERA.offset, [ax, ay, az] = LOOKOUT_CAMERA.offset;
  const from = Math.atan2(bz, -bx), to = Math.atan2(az, -ax), near = Math.hypot(bx, bz), far = Math.hypot(ax, az);
  return () => {
    const k = swung(c), a = from + (to - from) * k, reach = near + (far - near) * k;
    return [-reach * Math.cos(a), by + (ay - by) * k, reach * Math.sin(a)];
  };
}

/** The lift camera's look: Egill's head, turning down toward Mosi below (downToMosi) as the camera swings round. */
function liftLook(c) {
  const down = downToMosi(c);
  const head = new THREE.Vector3();
  const mosi = new THREE.Vector3();
  return out => {
    const k = SWING.most * swung(c);
    c.egill.raw.headPosition(head);
    return k > 0 ? out.copy(head).lerp(down(mosi), k) : out.copy(head);
  };
}

/**
 * A point between Egill's head and Mosi below, for the camera at the top to look at: halfway, which is further down than LOOK_DOWN
 * degrees from the camera, so the look is LOOK_DOWN degrees down.
 */
export function downToMosi(c) {
  const head = new THREE.Vector3();
  const mosi = new THREE.Vector3();
  const camera = c.world.camera.position;
  return out => {
    c.egill.raw.headPosition(head);
    c.mosi.raw.centre(mosi);
    out.lerpVectors(head, mosi, 0.5);
    const level = Math.hypot(out.x - camera.x, out.z - camera.z);
    out.y = Math.max(out.y, camera.y - level * Math.tan(THREE.MathUtils.degToRad(LOOK_DOWN)));
    return out;
  };
}
