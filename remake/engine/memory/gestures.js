import * as THREE from 'three';

/**
 * The friends' shared gesture library: whole-body moves laid over whatever clip is playing (idle,
 * walk), so they read at game size, where a baby is about a hundred pixels tall.
 *
 * GESTURES[name] = { duration, apply(rig, t, energy) }. t runs 0..1 over `duration` seconds of game
 * time; energy is 1, or .3 in reduced motion. rig = { pose, head, neck, jaw, body, shoulders, tail,
 * legs, lids, rotateInRoot, offsetInRoot, length, species, crossed(at) } (and wings: the two upper-arm bones of a winged friend, none
 * for the others):
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

// The shove and the stumble of two friends side by side. `side` is +1 for the other friend on the right-hand side (the +Z of the actor).
const nudge = side => ({ duration: 1.1, apply(rig, t, energy) {
  const L = rig.length, wind = bump(t, 0, .3), shove = bump(t, .26, .64), settle = bump(t, .6, 1);
  rig.pose.rotation.y += -side * energy * (.32 * shove - .14 * wind);
  rig.pose.position.z += side * .11 * L * energy * (shove - .35 * wind);
  turnHead(rig, Y, -side * energy * (.75 * shove - .25 * wind));
  turnHead(rig, Z, .14 * energy * shove);
  crouch(rig, .02 * L * energy * wind);
  rig.rotateInRoot(rig.tail, Y, .5 * energy * (shove + settle) * wave(t, 4));
  if (rig.crossed(.3)) rig.lids?.blink.rest(.5, .06);
  if (rig.crossed(.7)) rig.lids?.blink.rest(0, .15);
} });
const jolt = side => ({ duration: 1.2, apply(rig, t, energy) {
  const L = rig.length, push = bump(t, 0, .4), look = bump(t, .4, 1);
  rig.pose.position.z += -side * .09 * L * energy * push;
  rig.pose.position.y += .1 * L * energy * arc(t, .02, .4);
  rig.pose.rotation.x += -side * .16 * energy * push;
  tuckLegs(rig, .03 * L * energy * arc(t, .04, .38));
  turnHead(rig, Y, -side * .55 * energy * look);
  openJaw(rig, .24 * bump(t, .1, .9));
  rig.rotateInRoot(rig.tail, Y, .45 * energy * (push + look) * wave(t, 5));
} });

// The Þórseðla's pull on the slab: how high her head is (0 standing, 1 the neck right up) at the start, at the top of the stretch and when the pull is over, for each of the three taps.
const PULL = [{ from: 0, top: .95, to: .7 }, { from: .7, top: .7, to: .42 }, { from: .42, top: .42, to: 0 }];
function pullGesture(index) {
  const { from, top, to } = PULL[index], last = index === 2, duration = last ? 1.9 : 4.2;
  return { duration, apply(rig, t, energy) {
    const L = rig.length, seconds = t * duration;
    // the head's height: the first pull stretches up from standing (.45 s) and then pulls down to `to`; the others pull on from where the one before ended; after the pull it stays (the last lets go)
    let level;
    if (index === 0) level = seconds < .45 ? top * smooth(seconds / .45) : top + (to - top) * smooth((seconds - .5) / .6);
    else level = from + (to - from) * smooth((seconds - .1) / .85);
    if (last && seconds > 1.2) level *= 1 - smooth((seconds - 1.2) / .6);
    const effort = bump(seconds, .35, 1.1);
    turnHead(rig, Z, energy * .78 * level);
    rig.pose.rotation.z += .08 * energy * level;
    crouch(rig, .035 * L * energy * effort);
    rig.offsetInRoot(rig.body, .005 * L * energy * effort * Math.sin(seconds * 47), 0, .005 * L * energy * effort * Math.sin(seconds * 39 + 1));
    openJaw(rig, seconds < .55 ? .3 * energy : .06 * energy);
    rig.rotateInRoot(rig.tail, Y, .3 * energy * effort * Math.sin(seconds * 9));
    if (rig.crossed(.05 / duration)) rig.lids?.blink.rest(.6, .06);
    if (last && rig.crossed(1.4 / duration)) rig.lids?.blink.rest(0, .15);
  } };
}

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
  // The Flugeðla way: she pecks at the stone, three quick taps ("tikk, tikk, tikk"), and it does not even wobble. She looks at it, tilts her
  // head, and gives a small shrug with both wings.
  'fail-pteranodon': { duration: 2.2, apply(rig, t, energy) {
    const L = rig.length, tap = a => bump(t, a, a + .1), pecks = tap(.1) + tap(.24) + tap(.38), cock = bump(t, .5, .98), shrug = bump(t, .62, .9);
    turnHead(rig, Z, -.62 * energy * pecks + .16 * energy * bump(t, 0, .1));
    rig.pose.rotation.z += -.07 * energy * pecks;
    crouch(rig, .02 * L * energy * pecks);
    openJaw(rig, .1 * pecks);
    turnHead(rig, Z, -.14 * energy * cock);
    rig.rotateInRoot(rig.head, X, .5 * energy * cock);
    turnHead(rig, Y, .3 * energy * cock * wave(t, 1.5));
    rig.wings?.forEach((wing, side) => rig.rotateInRoot(wing, X, (side ? -1 : 1) * .5 * energy * shrug));
    rig.rotateInRoot(rig.tail, Y, .3 * energy * bump(t, .1, .5) * wave(t, 3));
    if (rig.crossed(.55)) rig.lids?.blink.rest(.55, .1);
    if (rig.crossed(.92)) rig.lids?.blink.rest(0, .15);
  } },
  // ---- Level 2, the tunnel and the rockfall (Task 4) ----
  // The Kambeðla lights a step of her plates: she stretches up on her legs, throws her head up and shivers her plates (the glow itself is the plate glow, tunnel.js).
  glow: { duration: 1, apply(rig, t, energy) {
    const L = rig.length, lit = bump(t, .08, .92), shiver = bump(t, .2, .8);
    crouch(rig, -.03 * L * energy * lit);
    turnHead(rig, Z, .38 * energy * lit);
    rig.pose.rotation.z += .08 * energy * lit;
    rig.pose.rotation.x += .09 * energy * shiver * wave(t, 5);
    rig.pose.rotation.y += .05 * energy * shiver * wave(t, 4, .25);
    openJaw(rig, .16 * bump(t, .2, .7));
    rig.rotateInRoot(rig.tail, Y, .5 * energy * shiver * wave(t, 4));
    if (rig.crossed(.2)) rig.lids?.blink.rest(.6, .1);
    if (rig.crossed(.8)) rig.lids?.blink.rest(0, .15);
  } },
  // The Þríhyrna's headbutt: she rears back, lowers the horns and drives them in (the mover moves her root: back, in, and out again), then shakes her head.
  charge: { duration: .95, apply(rig, t, energy) {
    const L = rig.length, wind = bump(t, 0, .34), drive = bump(t, .3, .66), shake = bump(t, .56, .95);
    crouch(rig, .07 * L * energy * wind + .035 * L * energy * drive);
    rig.pose.rotation.z += energy * (.16 * wind - .2 * drive);
    turnHead(rig, Z, energy * (.16 * wind - .5 * drive));
    rig.pose.position.y += .03 * L * energy * arc(t, .32, .6);
    turnHead(rig, Y, .34 * energy * shake * wave(t, 6.5));
    rig.rotateInRoot(rig.tail, Y, .4 * energy * (wind + shake) * wave(t, 4));
    openJaw(rig, .2 * bump(t, .1, .35));
    if (rig.crossed(.3)) rig.lids?.blink.rest(.75, .06);
    if (rig.crossed(.85)) rig.lids?.blink.rest(0, .15);
  } },
  // Tunnel, the Þríhyrna: into the dark (the mover walks her in) until she runs into something: dúnk, the head back, stars, a dazed wobble, and out again backwards.
  'fail-tunnel-triceratops': { duration: 3, apply(rig, t, energy) {
    const L = rig.length, bonk = bump(t, .33, .45), dazed = bump(t, .36, .64);
    rig.pose.rotation.z += energy * (-.1 * bump(t, .1, .34) + .3 * bonk);
    crouch(rig, .05 * L * energy * bonk);
    rig.pose.position.x += -.05 * L * energy * bonk;
    turnHead(rig, Z, energy * (.1 * bump(t, .1, .34) + .42 * bonk));
    turnHead(rig, Y, .36 * energy * dazed * wave(t, 3.2));
    rig.pose.rotation.x += .07 * energy * dazed * wave(t, 2.4);
    rig.rotateInRoot(rig.tail, Y, .45 * energy * dazed * wave(t, 3.4));
    openJaw(rig, .24 * bump(t, .34, .5));
    if (rig.crossed(.35)) rig.lids?.blink.rest(.65, .06);
    if (rig.crossed(.66)) rig.lids?.blink.rest(0, .2);
  } },
  // Tunnel, the Þórseðla: she walks in and stretches her neck up to see, and the low roof catches her head: bonk, a squashed head, stars, a sway and a duck back out.
  'fail-tunnel-brontosaurus': { duration: 3.2, apply(rig, t, energy) {
    const L = rig.length, reach = ramp(t, .12, .38) * (1 - ramp(t, .4, .46)), bonk = bump(t, .38, .52), sway = bump(t, .42, .78);
    turnHead(rig, Z, energy * (.7 * reach - .55 * bonk));
    rig.pose.rotation.z += .1 * energy * reach;
    crouch(rig, .04 * L * energy * bonk);
    turnHead(rig, Y, .5 * energy * sway * wave(t, 2.6));
    rig.pose.rotation.x += .06 * energy * sway * wave(t, 1.8);
    rig.pose.rotation.y += .07 * energy * sway * wave(t, 1.8, .25);
    rig.rotateInRoot(rig.tail, Y, .3 * energy * sway * wave(t, 2.5));
    if (rig.crossed(.4)) rig.lids?.blink.rest(.7, .06);
    if (rig.crossed(.8)) rig.lids?.blink.rest(0, .2);
  } },
  // Tunnel, the Flugeðla: she has flown in and run into the dark; this is the way out: head over tail in a roll, then a hard shake of the head when she is out.
  'fail-tunnel-pteranodon': { duration: 2.4, apply(rig, t, energy) {
    const roll = ramp(t, .04, .5), shake = bump(t, .55, .95);
    rig.pose.rotation.x += (energy < 1 ? .5 : Math.PI * 2) * roll;
    rig.pose.rotation.z += .25 * energy * bump(t, .05, .45);
    turnHead(rig, Y, .6 * energy * shake * wave(t, 6.5));
    rig.rotateInRoot(rig.head, X, .16 * energy * shake * wave(t, 3.4));
    rig.wings?.forEach((wing, side) => rig.rotateInRoot(wing, X, (side ? -1 : 1) * .5 * energy * bump(t, .05, .5)));
    openJaw(rig, .14 * bump(t, .05, .4));
    if (rig.crossed(.6)) rig.lids?.blink.rest(.6, .08);
    if (rig.crossed(.95)) rig.lids?.blink.rest(0, .15);
  } },
  // Rocks, the Kambeðla: she swishes her tail at the pile (it is a big swing), a pebble drops on her head (the event is the mover's), she looks up, cross-eyed, and shakes it off.
  'fail-rocks-stegosaurus': { duration: 2.6, apply(rig, t, energy) {
    const swing = bump(t, .04, .4), hit = bump(t, .42, .52), dazed = bump(t, .46, .85);
    rig.rotateInRoot(rig.tail, Y, 1.0 * energy * swing * wave(t, 2.2));
    rig.pose.rotation.y += .24 * energy * swing * wave(t, 2.2);
    rig.pose.position.z += .04 * rig.length * energy * swing * wave(t, 2.2, .2);
    crouch(rig, .06 * rig.length * energy * hit);
    turnHead(rig, Z, energy * (-.4 * hit + .3 * bump(t, .55, .8)));
    turnHead(rig, Y, .5 * energy * dazed * wave(t, 4));
    openJaw(rig, .2 * bump(t, .44, .7));
    if (rig.crossed(.44)) rig.lids?.blink.rest(.8, .05);
    if (rig.crossed(.86)) rig.lids?.blink.rest(0, .2);
  } },
  // Rocks, the Þórseðla: she nudges the pile with her nose, twice; nothing moves; she looks at it and shrugs her shoulders and her neck.
  'fail-rocks-brontosaurus': { duration: 2.8, apply(rig, t, energy) {
    const push = bump(t, .08, .26) + bump(t, .3, .48), shrug = bump(t, .6, .92);
    turnHead(rig, Z, energy * (-.3 * push + .2 * bump(t, .5, .62)));
    rig.pose.position.x += .06 * rig.length * energy * push;
    rig.pose.rotation.z += -.06 * energy * push;
    turnHead(rig, Y, .45 * energy * shrug * wave(t, 2.2));
    crouch(rig, -.025 * rig.length * energy * shrug);
    rig.rotateInRoot(rig.shoulders ?? rig.body, Z, .12 * energy * shrug);
    rig.rotateInRoot(rig.tail, Y, .35 * energy * shrug * wave(t, 2));
    if (rig.crossed(.64)) rig.lids?.blink.rest(.6, .1);
    if (rig.crossed(.94)) rig.lids?.blink.rest(0, .2);
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
  // ---- Level 2, the high ledge (Task 5) ----
  // The Þórseðla pulls the slab down, one tap at a time (`pull-1`, `pull-2`, `pull-3`): she stretches her long neck up over the slab's edge, takes hold with her jaws and pulls: the
  // lower the slab comes, the lower her head. Each starts where the one before ended (the first from standing, the last lets go and stands again); a pull that is not the last holds
  // the head where the slab is until the next tap.
  'pull-1': pullGesture(0), 'pull-2': pullGesture(1), 'pull-3': pullGesture(2),
  // The wrong friends at the ledge and the cliff (Task 5; the mover moves their roots, the stars and the sounds are its events).
  // The Kambeðla at the ledge: she rears up on her hind legs to see over it, her front legs paw the air, she wobbles... and sits down hard on her plates.
  'fail-ledge-stegosaurus': { duration: 2.7, apply(rig, t, energy) {
    const L = rig.length, rear = ramp(t, .1, .38) * (1 - ramp(t, .74, .84)), wobble = bump(t, .38, .76), sit = bump(t, .8, 1);
    rig.pose.rotation.z += energy * (.85 * rear + .1 * wobble * wave(t, 3));
    rig.pose.rotation.x += .16 * energy * wobble * wave(t, 4.5);
    rig.pose.position.y += .22 * L * energy * rear;
    for (const pair of rig.legs) if (pair.front) rig.offsetInRoot(pair.leg, .03 * L * energy * (rear + wobble) * wave(t, 6, pair.front ? 0 : .5), .03 * L * energy * wobble * Math.abs(wave(t, 6)));
    turnHead(rig, Z, .3 * energy * rear); turnHead(rig, Y, .4 * energy * wobble * wave(t, 2.2));
    openJaw(rig, .2 * bump(t, .2, .75));
    crouch(rig, .07 * L * energy * sit);
    rig.rotateInRoot(rig.tail, Y, .5 * energy * (wobble + sit) * wave(t, 3.5));
    if (rig.crossed(.4)) rig.lids?.blink.rest(.5, .08);
    if (rig.crossed(.95)) rig.lids?.blink.rest(0, .2);
  } },
  // The Þórseðla at the cliff throws the rope up: her neck scoops down and whips up (the mover lets the rope go), she watches it go up, it comes down on her head: bonk, her head
  // squashed, stars, a dizzy sway.
  'fail-cliff-brontosaurus': { duration: 3.1, apply(rig, t, energy) {
    const scoop = bump(t, .02, .22), whip = bump(t, .2, .36), watch = ramp(t, .34, .5) * (1 - ramp(t, .7, .74)), bonk = bump(t, .72, .84), sway = bump(t, .8, 1);
    turnHead(rig, Z, energy * (-.55 * scoop + 1.05 * whip + .85 * watch - .9 * bonk));
    turnHead(rig, Y, .35 * energy * sway * wave(t, 3));
    rig.pose.rotation.z += energy * (.12 * whip + .06 * watch);
    crouch(rig, .05 * rig.length * energy * (scoop + bonk));
    rig.pose.rotation.x += .08 * energy * sway * wave(t, 2.2);
    rig.rotateInRoot(rig.tail, Y, .35 * energy * sway * wave(t, 2.6));
    openJaw(rig, .3 * bump(t, .2, .4));
    if (rig.crossed(.74)) rig.lids?.blink.rest(.75, .05);
    if (rig.crossed(1)) rig.lids?.blink.rest(0, .2);
  } },
  // The Þríhyrna at the cliff hops up the path with the rope in her beak, and a hop too far: she loses her footing and tumbles over and over, back down (the mover moves her root).
  'fail-cliff-triceratops': { duration: 3.2, apply(rig, t, energy) {
    const L = rig.length, hop = arc(t, .02, .2) + arc(t, .2, .38) + arc(t, .38, .56), tumble = ramp(t, .6, .84), dazed = bump(t, .86, 1);
    rig.pose.position.y += .22 * L * energy * hop;
    rig.pose.rotation.z += .2 * energy * hop;
    tuckLegs(rig, .04 * L * energy * hop);
    rig.pose.rotation.x += (energy < 1 ? .6 : Math.PI * 2) * tumble * (1 - ramp(t, .84, .86));
    turnHead(rig, Y, .4 * energy * dazed * wave(t, 3)); rig.rotateInRoot(rig.tail, Y, .4 * energy * (dazed + hop) * wave(t, 3.4));
    openJaw(rig, .1 * (1 - tumble));
  } },
  // The Kambeðla at the cliff walks up the path, her legs working harder and harder, the gravel goes from under her feet, and she slides back down it on her belly, paws scrabbling.
  'fail-cliff-stegosaurus': { duration: 3.2, apply(rig, t, energy) {
    const L = rig.length, climb = bump(t, 0, .55), slip = ramp(t, .5, .62) * (1 - ramp(t, .86, .95)), dazed = bump(t, .88, 1);
    rig.pose.rotation.z += energy * (.22 * climb + .3 * slip);
    crouch(rig, .05 * L * energy * (climb + slip));
    for (const pair of rig.legs) rig.offsetInRoot(pair.leg, .035 * L * energy * (climb + slip) * wave(t, 7 + 4 * slip, pair.front ? 0 : .5), .03 * L * energy * (climb + 2 * slip) * Math.abs(wave(t, 7 + 4 * slip)));
    rig.pose.rotation.x += .1 * energy * slip * wave(t, 5);
    rig.rotateInRoot(rig.tail, Y, .5 * energy * (slip + dazed) * wave(t, 4));
    turnHead(rig, Y, .4 * energy * dazed * wave(t, 3)); openJaw(rig, .2 * slip);
    if (rig.crossed(.9)) rig.lids?.blink.rest(.6, .1);
    if (rig.crossed(1)) rig.lids?.blink.rest(0, .2);
  } },
  // The Flugeðla at the ledge: she has flown up to the slab and caught its edge (the mover holds her there): she hangs, feet kicking, wings flapping, and the slab does not move.
  'fail-ledge-pteranodon': { duration: 3, apply(rig, t, energy) {
    const kick = bump(t, .05, .85), flap = Math.abs(wave(t, 4.5));
    rig.pose.rotation.z += energy * (-.5 * ramp(t, .05, .2) * (1 - ramp(t, .85, .95)));
    for (const pair of rig.legs) rig.offsetInRoot(pair.leg, .03 * rig.length * energy * kick * wave(t, 5, pair.front ? 0 : .5), .04 * rig.length * energy * kick * Math.abs(wave(t, 5)));
    rig.wings?.forEach((wing, side) => rig.rotateInRoot(wing, X, (side ? -1 : 1) * .55 * energy * kick * flap));
    openJaw(rig, .1 * kick);
    rig.rotateInRoot(rig.tail, Y, .3 * energy * kick * wave(t, 3));
    if (rig.crossed(.3)) rig.lids?.blink.rest(.6, .1);
    if (rig.crossed(.92)) rig.lids?.blink.rest(0, .2);
  } },
  // Eating off the ground or a bush: the head goes down and stays down for a few bites, the jaw working, a small bob of the
  // body, the tail swaying. The Þórseðla's long neck has further to go.
  nibble: { duration: 2.6, apply(rig, t, energy) {
    const L = rig.length, long = rig.species === 'brontosaurus' ? 1.55 : 1, meal = ramp(t, 0, .13) * (1 - ramp(t, .88, 1));
    const bites = meal * (.78 + .22 * wave(t, 3)), chew = .5 + .5 * wave(t, 8);
    turnHead(rig, Z, -.5 * long * energy * bites);
    openJaw(rig, .22 * chew * meal);
    crouch(rig, .02 * L * energy * (bites + .5 * meal * Math.abs(wave(t, 3))));
    rig.pose.rotation.z += -.05 * energy * meal;
    rig.rotateInRoot(rig.tail, Y, .3 * energy * meal * wave(t, 2));
    if (rig.crossed(.5)) rig.lids?.blink.blink();
  } },
  // A big yawn: the head goes back, the jaw opens wide, the eyes shut, the whole body stretches, then a small shake.
  yawn: { duration: 2.8, apply(rig, t, energy) {
    const L = rig.length, wide = bump(t, .14, .78), stretch = ramp(t, .1, .4) * (1 - ramp(t, .72, .94));
    turnHead(rig, Z, .5 * energy * stretch);
    openJaw(rig, .62 * wide);
    rig.pose.rotation.z += .1 * energy * stretch;
    crouch(rig, -.012 * L * energy * stretch);
    rig.rotateInRoot(rig.tail, Y, .25 * energy * stretch * wave(t, 1.5));
    turnHead(rig, Y, .28 * energy * bump(t, .84, 1) * wave(t, 5));
    if (rig.crossed(.14)) rig.lids?.blink.rest(.95, .25);
    if (rig.crossed(.8)) rig.lids?.blink.rest(0, .3);
  } },
  // Scratching an itch with a back foot: the body leans away, the foot kicks quickly, the head turns to look at it.
  scratch: { duration: 2.4, apply(rig, t, energy) {
    const L = rig.length, on = bump(t, 0, 1), foot = rig.legs.find(pair => !pair.front && /\.L$/.test(pair.leg.name)) ?? rig.legs.find(pair => !pair.front);
    rig.pose.rotation.x += .09 * energy * on;
    rig.pose.rotation.z += -.04 * energy * on;
    if (foot) rig.offsetInRoot(foot.leg, .07 * L * energy * on * wave(t, 8), .14 * L * energy * on);
    turnHead(rig, Y, .5 * energy * on);
    turnHead(rig, Z, -.12 * energy * on);
    openJaw(rig, .12 * bump(t, .3, .8));
    rig.rotateInRoot(rig.tail, Y, .3 * energy * on * wave(t, 3));
    if (rig.crossed(.8)) rig.lids?.blink.blink();
  } },
  // Sniffing at something low: the nose goes down and stays there, bobbing in quick small sniffs.
  sniff: { duration: 2.6, apply(rig, t, energy) {
    const long = rig.species === 'brontosaurus' ? 1.45 : 1, near = ramp(t, .06, .26) * (1 - ramp(t, .8, .97));
    turnHead(rig, Z, (-.42 * long - .07 * wave(t, 6)) * energy * near);
    turnHead(rig, Y, .1 * energy * near * wave(t, 9));
    crouch(rig, .015 * rig.length * energy * near);
    rig.rotateInRoot(rig.tail, Y, .35 * energy * near * wave(t, 2.5));
    if (rig.crossed(.9)) rig.lids?.blink.blink();
  } },
  // A friendly shove for the friend beside it (`side` 1: that friend is on its right): a wind-up away, then the head and the
  // shoulder swing in, and back. The other one reacts with `jolt`.
  'nudge-right': nudge(1), 'nudge-left': nudge(-1),
  // Pushed by a friend (`side` 1: the one who pushed is on its right): knocked a step away with a small hop, then a look back.
  'jolt-right': jolt(1), 'jolt-left': jolt(-1),
});
export const FAIL_GESTURES = Object.freeze({ triceratops: 'fail-triceratops', stegosaurus: 'fail-stegosaurus', brontosaurus: 'fail-brontosaurus', pteranodon: 'fail-pteranodon' });
/** A wrong friend's go at an obstacle of level 2, by 'obstacle:species' (the pteranodon's peck at the rocks is the one her own failure already is). */
export const FAIL_TRIES = Object.freeze({
  'tunnel:triceratops': 'fail-tunnel-triceratops', 'tunnel:brontosaurus': 'fail-tunnel-brontosaurus', 'tunnel:pteranodon': 'fail-tunnel-pteranodon',
  'rocks:stegosaurus': 'fail-rocks-stegosaurus', 'rocks:brontosaurus': 'fail-rocks-brontosaurus', 'rocks:pteranodon': 'fail-pteranodon',
  // the high ledge and the cliff (Task 5): the Þríhyrna's is her own failure (a big jump, a miss, down on her bottom)
  'ledge:triceratops': 'fail-triceratops', 'ledge:stegosaurus': 'fail-ledge-stegosaurus', 'ledge:pteranodon': 'fail-ledge-pteranodon',
  'cliff:brontosaurus': 'fail-cliff-brontosaurus', 'cliff:triceratops': 'fail-cliff-triceratops', 'cliff:stegosaurus': 'fail-cliff-stegosaurus',
});

/** The older gesture names the adventure and the world still use. */
export const GESTURE_ALIASES = Object.freeze({ reveal: 'peek', greet: 'hop', mismatch: 'oops', nuzzle: 'nuzzle', delight: 'cheer', settle: 'settle' });
