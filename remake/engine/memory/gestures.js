import * as THREE from 'three';

/**
 * The friends' shared gesture library: whole-body moves laid over whatever clip is playing (idle,
 * walk), so they read at game size, where a baby is about a hundred pixels tall.
 *
 * GESTURES[name] = { duration, apply(rig, t, energy) }. t runs 0..1 over `duration` seconds of game
 * time; energy is 1, or .3 in reduced motion. rig = { pose, head, neck, jaw, body, shoulders, tail,
 * legs, lids, rotateInRoot, offsetInRoot, length, crossed(at) }:
 *   pose          the group that holds the model under the actor's root (whole-body lift and tilt),
 *   rotateInRoot  (bone, axis, angle) about the actor's own axes (X forward, Y up, Z its right side),
 *   offsetInRoot  (bone, x, y, z) metres in the actor's own frame,
 *   body          the bone the torso hangs from (legs hang from the rig root, so lowering it crouches),
 *   crossed(at)   true on the one frame t passes `at` (for blinks and one-off events).
 * The pose is reset every frame before apply, and the bones are restored to the clip's pose, so a
 * gesture only says where things are at time t.
 */
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp01 = t => Math.min(1, Math.max(0, t));
const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
/** 0 → 1 → 0 between a and b. */
export const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(Math.PI * (t - a) / (b - a)));
/** 0 → 1 between a and b, then held. */
export const ramp = (t, a, b) => smooth((t - a) / (b - a));
/** A jump arc between a and b: 0 on the ground, 1 at the top. */
const arc = (t, a, b) => { const u = clamp01((t - a) / (b - a)); return t <= a || t >= b ? 0 : 4 * u * (1 - u); };
const wave = (t, cycles, phase = 0) => Math.sin(Math.PI * 2 * (cycles * t + phase));

// Head turns go through the neck too, so a long neck sweeps the head instead of twisting it alone.
function turnHead(rig, axis, angle) {
  if (rig.neck && rig.neck !== rig.head) { rig.rotateInRoot(rig.neck, axis, angle * .45); rig.rotateInRoot(rig.head, axis, angle * .55); }
  else rig.rotateInRoot(rig.head, axis, angle);
}
function crouch(rig, depth) { if (depth) rig.offsetInRoot(rig.body, 0, -depth); }
function tuckLegs(rig, lift) { if (lift > 1e-4) for (const pair of rig.legs) rig.offsetInRoot(pair.leg, 0, lift); }
function openJaw(rig, amount) { if (rig.jaw && amount > 1e-4) rig.rotateInRoot(rig.jaw, Z, -amount); }

export const GESTURES = Object.freeze({
  // Out from under the leaf: a spring up, a wet-dog shake that throws the leaf off, then a call.
  peek: { duration: 1.2, apply(rig, t, energy) {
    const L = rig.length;
    crouch(rig, .05 * L * energy * bump(t, 0, .1) + .035 * L * energy * bump(t, .34, .46));
    rig.pose.position.y += .17 * L * energy * arc(t, .07, .38);
    rig.pose.rotation.z += energy * (.26 * bump(t, .04, .34) - .07 * bump(t, .32, .46));
    tuckLegs(rig, .035 * L * energy * arc(t, .1, .35));
    const shake = bump(t, .44, .8);
    rig.pose.rotation.x += .3 * energy * shake * wave(t, 5.5);
    rig.pose.rotation.y += .16 * energy * shake * wave(t, 5.5, .25);
    rig.rotateInRoot(rig.head, X, -.4 * energy * shake * wave(t, 5.5));
    rig.rotateInRoot(rig.tail, Y, .55 * energy * shake * wave(t, 5.5, .25));
    turnHead(rig, Z, .18 * energy * bump(t, .74, 1));
    openJaw(rig, .32 * bump(t, .76, .98));
    if (rig.crossed(.8)) rig.lids?.blink.blink();
  } },
  // One leaf is open and the friend waits: tilts the head, looks one way, then the other.
  wonder: { duration: 2.1, apply(rig, t, energy) {
    rig.rotateInRoot(rig.head, X, energy * (.42 * bump(t, .02, .48) - .34 * bump(t, .52, .98)));
    turnHead(rig, Y, .5 * energy * Math.sin(Math.PI * 2 * t) * bump(t, 0, 1));
    rig.pose.rotation.y += .26 * energy * Math.sin(Math.PI * 2 * t) * bump(t, 0, 1);
    turnHead(rig, Z, .12 * energy * bump(t, .3, .7));
    rig.pose.rotation.x += .045 * energy * Math.sin(Math.PI * 2 * t);
    rig.rotateInRoot(rig.tail, Y, .3 * energy * wave(t, 1.5) * bump(t, 0, 1));
    if (rig.crossed(.5)) rig.lids?.blink.blink();
  } },
  // Not my friend: shakes the head hard, then ducks down giggling before the leaf closes.
  oops: { duration: 1.4, apply(rig, t, energy) {
    const L = rig.length, shake = bump(t, 0, .46), duck = ramp(t, .42, .6) * (1 - ramp(t, .9, 1));
    turnHead(rig, Y, .62 * energy * shake * wave(t, 6.5));
    rig.pose.rotation.y += .22 * energy * shake * wave(t, 6.5);
    rig.rotateInRoot(rig.head, X, .14 * energy * shake * wave(t, 3.6));
    crouch(rig, .11 * L * energy * duck);
    rig.pose.rotation.z += -.16 * energy * duck;
    turnHead(rig, Z, -.26 * energy * duck);
    const giggle = bump(t, .5, .98);
    rig.pose.rotation.x += .1 * energy * giggle * wave(t, 9);
    rig.offsetInRoot(rig.body, 0, .012 * L * energy * giggle * wave(t, 9, .25));
    rig.rotateInRoot(rig.tail, Y, .45 * energy * giggle * wave(t, 6));
    if (rig.crossed(.5)) rig.lids?.blink.rest(.62, .12);
    if (rig.crossed(.94)) rig.lids?.blink.rest(0, .2);
  } },
  // A happy jump with the legs tucked, nose up on the way up, a small squash on landing.
  hop: { duration: .62, apply(rig, t, energy) {
    const L = rig.length;
    crouch(rig, .05 * L * energy * (bump(t, 0, .2) + bump(t, .78, 1)));
    rig.pose.position.y += .19 * L * energy * arc(t, .14, .82);
    tuckLegs(rig, .045 * L * energy * arc(t, .2, .76));
    rig.pose.rotation.z += energy * (.2 * bump(t, .12, .55) - .1 * bump(t, .5, .86));
    rig.rotateInRoot(rig.tail, Z, .25 * energy * arc(t, .14, .82));
    openJaw(rig, .2 * bump(t, .2, .7));
  } },
  // Nose to nose: lean in, rub, eyes shut, tail wagging.
  nuzzle: { duration: 1.3, apply(rig, t, energy) {
    const L = rig.length, lean = ramp(t, 0, .18) * (1 - ramp(t, .86, 1));
    rig.offsetInRoot(rig.shoulders ?? rig.body, .03 * L * lean, -.012 * L * lean);
    turnHead(rig, Z, -.14 * lean);
    turnHead(rig, Y, .2 * energy * lean * wave(t, 2.5));
    rig.rotateInRoot(rig.head, X, .16 * energy * lean * wave(t, 2.5, .25));
    rig.pose.rotation.x += .05 * energy * lean * wave(t, 2.5);
    rig.rotateInRoot(rig.tail, Y, .6 * energy * lean * wave(t, 4));
    if (rig.crossed(.22)) rig.lids?.blink.rest(.9, .12);
    if (rig.crossed(.84)) rig.lids?.blink.rest(0, .18);
  } },
  // Two bounces with the head thrown up and a call: "we did it!"
  cheer: { duration: 1.35, apply(rig, t, energy) {
    const L = rig.length;
    crouch(rig, .045 * L * energy * (bump(t, 0, .12) + bump(t, .44, .56) + bump(t, .9, 1)));
    rig.pose.position.y += L * energy * (.16 * arc(t, .08, .48) + .13 * arc(t, .52, .9));
    tuckLegs(rig, .04 * L * energy * (arc(t, .12, .44) + arc(t, .56, .86)));
    rig.pose.rotation.z += .22 * energy * (bump(t, .06, .46) + bump(t, .5, .88));
    turnHead(rig, Z, .3 * energy * bump(t, .05, .95));
    openJaw(rig, .34 * bump(t, .1, .7));
    rig.rotateInRoot(rig.tail, Y, .6 * energy * wave(t, 4) * bump(t, 0, 1));
  } },
  // Arrived home: a small settling sink.
  settle: { duration: .7, apply(rig, t, energy) { crouch(rig, .012 * rig.length * energy * bump(t, 0, 1)); } },
  // "Hver getur þetta?": the whole group bounces on the spot, nose up, tail going, every one of them keen.
  eager: { duration: 1.3, apply(rig, t, energy) {
    const L = rig.length;
    crouch(rig, .03 * L * energy * (bump(t, 0, .1) + bump(t, .3, .4) + bump(t, .6, .7) + bump(t, .9, 1)));
    rig.pose.position.y += .075 * L * energy * (arc(t, .08, .32) + arc(t, .38, .62) + arc(t, .68, .92));
    tuckLegs(rig, .02 * L * energy * (arc(t, .1, .3) + arc(t, .4, .6) + arc(t, .7, .9)));
    rig.pose.rotation.z += .1 * energy * bump(t, .05, .95);
    turnHead(rig, Z, .2 * energy * bump(t, .05, .95));
    turnHead(rig, Y, .28 * energy * wave(t, 1.5) * bump(t, 0, 1));
    openJaw(rig, .24 * bump(t, .15, .85));
    rig.rotateInRoot(rig.tail, Y, .55 * energy * wave(t, 5) * bump(t, 0, 1));
  } },
  // The wrong friend at an obstacle, the Þríhyrna way: a big jump up at it, a miss, and down on its bottom.
  'fail-triceratops': { duration: 1.9, apply(rig, t, energy) {
    const L = rig.length, sit = ramp(t, .5, .6) * (1 - ramp(t, 1.42, 1.72));
    crouch(rig, .07 * L * energy * bump(t, 0, .14) + .06 * L * energy * bump(t, .56, .7) + .04 * L * energy * bump(t, 1.7, 1.9));
    rig.pose.position.y += .34 * L * energy * arc(t, .12, .56) - .035 * L * energy * sit;
    rig.pose.rotation.z += energy * (.34 * bump(t, .1, .5) + .5 * sit);
    tuckLegs(rig, .05 * L * energy * arc(t, .14, .52));
    openJaw(rig, .36 * bump(t, .14, .5) + .18 * bump(t, .7, 1.3));
    // Sat down, dazed: a slow wobble of the head and a blink.
    const dazed = bump(t, .62, 1.5);
    turnHead(rig, Y, .3 * energy * dazed * wave(t, 2.6));
    turnHead(rig, Z, -.12 * energy * dazed);
    rig.pose.rotation.x += .08 * energy * dazed * wave(t, 1.3);
    rig.rotateInRoot(rig.tail, Y, .4 * energy * dazed * wave(t, 3));
    if (rig.crossed(.6)) rig.lids?.blink.rest(.5, .08);
    if (rig.crossed(1.3)) rig.lids?.blink.rest(0, .2);
  } },
  // The Kambeðla way: she squeezes under, her plates catch, she wriggles, and rolls over onto her side.
  'fail-stegosaurus': { duration: 2.1, apply(rig, t, energy) {
    const L = rig.length, duck = ramp(t, 0, .12) * (1 - ramp(t, .72, .8)), stuck = bump(t, .12, .74), roll = ramp(t, .72, .9) * (1 - ramp(t, 1.52, 1.86));
    crouch(rig, .1 * L * energy * duck);
    rig.pose.rotation.z += -.12 * energy * duck;
    rig.pose.rotation.x += .1 * energy * stuck * wave(t, 6) + 1.2 * energy * roll;
    rig.pose.position.y += .09 * L * energy * roll + .04 * L * energy * bump(t, .86, 1);
    for (const pair of rig.legs) rig.offsetInRoot(pair.leg, .025 * L * energy * (stuck + roll) * wave(t, 7, pair.front ? 0 : .5), .02 * L * energy * roll * Math.abs(wave(t, 7)));
    rig.rotateInRoot(rig.tail, Y, .5 * energy * (stuck + .6 * roll) * wave(t, 4.5));
    turnHead(rig, Y, .3 * energy * stuck * wave(t, 3.5));
    openJaw(rig, .28 * bump(t, .2, .7) + .2 * bump(t, .9, 1.5));
    if (rig.crossed(.9)) rig.lids?.blink.rest(.6, .1);
    if (rig.crossed(1.5)) rig.lids?.blink.rest(0, .2);
  } },
  // The Þórseðla way: she tries, her long neck goes round and round, and she sways, dizzy (the stars are fx).
  'fail-brontosaurus': { duration: 2, apply(rig, t, energy) {
    const L = rig.length, dizzy = bump(t, .08, .86), circle = Math.PI * 2 * 2.2 * t;
    turnHead(rig, Y, .45 * energy * dizzy * Math.sin(circle));
    turnHead(rig, Z, .22 * energy * dizzy * Math.cos(circle));
    rig.pose.rotation.x += .14 * energy * dizzy * Math.sin(circle * .5);
    rig.pose.rotation.y += .08 * energy * dizzy * Math.cos(circle * .5);
    crouch(rig, .02 * L * energy * dizzy * (1 + Math.sin(circle)));
    // Shakes it off at the end.
    turnHead(rig, Y, .4 * energy * bump(t, .86, 1) * wave(t, 6));
    rig.rotateInRoot(rig.tail, Y, .3 * energy * dizzy * Math.sin(circle * .7));
    if (rig.crossed(.1)) rig.lids?.blink.rest(.55, .15);
    if (rig.crossed(.86)) rig.lids?.blink.rest(0, .1);
  } },
  // Working hard on a tap: squats a little, trembles with the effort, squeezes the eyes, pushes up.
  strain: { duration: .7, apply(rig, t, energy) {
    const L = rig.length, effort = bump(t, 0, 1);
    crouch(rig, .025 * L * energy * effort);
    rig.offsetInRoot(rig.body, .004 * L * energy * effort * wave(t, 9), 0, .005 * L * energy * effort * wave(t, 11, .3));
    rig.pose.rotation.x += .03 * energy * effort * wave(t, 12);
    rig.rotateInRoot(rig.tail, Z, .2 * energy * effort);
    if (rig.crossed(.05)) rig.lids?.blink.rest(.7, .06);
    if (rig.crossed(.8)) rig.lids?.blink.rest(0, .15);
  } },
});
export const FAIL_GESTURES = Object.freeze({ triceratops: 'fail-triceratops', stegosaurus: 'fail-stegosaurus', brontosaurus: 'fail-brontosaurus' });

/** The older gesture names the adventure and the world still use. */
export const GESTURE_ALIASES = Object.freeze({ reveal: 'peek', greet: 'hop', mismatch: 'oops', nuzzle: 'nuzzle', delight: 'cheer', settle: 'settle' });
