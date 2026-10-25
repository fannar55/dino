// Chapter 1: Boð til kambeðlunnar (an invitation for Kambeðla). Scenes 1 to 10 of the approved script
// (docs/superpowers/specs/2026-10-15-kafli-1-bod-til-kambedlunnar.md): a morning in the clearing, Mosi meets
// Egill and tells him about the Star Festival, Egill floats up into a saddle on Mosi's back, they ride the path
// to Kambeðla's fern glade, Egill finds her three glow flowers, her plates light again and the first star flies
// into his explorer's journal. About six or seven minutes for a five-year-old, who can never fail it: every
// wait for the child has hints where the script gives them and ends by itself, and every optional tap leaves
// the story alone.
//
// Two places (engine/locations.js), in metres at real size (STYLE.md section 3): Mosi 8.5 m nose to tail,
// Kambeðla 7 m, Egill 1.1 m tall. Headings are degrees, 0 facing +X and 90 facing +Z. The morning sun comes
// from heading 135 (toward -X, +Z) at 32 degrees.
//   rjodur      the foundation clearing (radius 15 m), the path running through it west to east. Mosi comes in
//               along it from the west, Egill waits east of the middle, and they leave by it to the east.
//   burknalaut  the fern glade (radius 9 m) at the end of a path from the north-east. Kambeðla grazes in the
//               ferns on its south-west side, toward the sun, and Mosi stops on its north-east side facing her:
//               the cameras keep to the south-east side of the line between them, where the sun lights both
//               from the side, except the arrival and the star's, which look past Mosi into the sun.
// Actors are global (R10): Kambeðla is hidden while the chapter is in the clearing, and each place puts the
// actors where they stand. Cameras stay at a child's eye height except where the script lifts them (the
// opening over the clearing, the float, the ride); handheld sway is off whenever the child must tap or choose.
import * as THREE from 'three';
import { createSaddle, floatTo, floatDown, ride } from '../engine/riding.js';
import { holdWithHands } from '../engine/hand-hold.js';
import { addPlateGlow } from '../engine/plate-glow.js';
import { createGlowFlower } from '../world/props/glow-flower.js';
import { createCritters } from '../world/critters/critters.js';
import { butterflyLand } from '../world/forest/atmosphere.js';
import { pollenBurst } from '../world/props/pollen.js';
import { MOUTH_RATE } from '../engine/talk.js';
import { createFootprints } from '../world/props/footprints.js';
import { sparkleBurst } from '../world/props/sparkles.js';
import { WINK_SECONDS } from '../engine/sun-face.js';
import { tapOrWait } from '../engine/scene/tap-or-wait.js';

// ---------------------------------------------------------------------------------------------
// Rjóðrið, the clearing

const MOSI_ENTERS = [-24, 6.95]; // on the path in the forest west of the clearing, out of sight until scene 2
const MOSI_WALK_IN = [[-16, 4], [-9.9, 2.3], [-4.8, 1]];
const MOSI_STOP = [0.5, 0.1];
const EGILL_WAITS = { position: [7.9, 0, 2.3], heading: 209 };
// Scene 2: the camera cuts to Egill, who can then be tapped, once Mosi's middle is this many metres from his, and Egill calls up to
// Mosi by himself once Mosi's head is EGILL_CALLS metres from him along the ground, about 3.4 s before Mosi stops (his middle then
// 10.4 m away). So a child has about 5 s to make the call: 5.2 s in a capture's timeline, from 38.33 s to 43.53 s.
const EGILL_SEES = 16;
const EGILL_CALLS = 8;
// The forest lays the grass down and leans the ferns aside round a capsule under each actor, made for Mosi's size
// (world/forest/forest.js: the grass's footprint times the actor's footprintScale). Egill's is a boy's: 0.3 of it,
// about 0.3 m round him, so the grass stands up close to his feet and a fern leans from him only within a metre.
const EGILL_FOOTPRINT = 0.3;
// Egill walks up in front of Mosi's head, ahead and to his right (a point in Mosi's frame taken as he sets
// off), where the dialogue frames Mosi over his left shoulder and Mosi turns to face him.
const EGILL_SPOT = { actor: 'mosi', part: 'head', offset: [2.9, 0, 2.2], local: true };
// Before the saddle Mosi turns to go, this far to his left, which leaves Egill beside his right shoulder: at most
// 2.5 m along Mosi and more than 3 m out, where the float up keeps clear of the frill and the flank (riding.js).
const MOSI_TURNS_TO_GO = 74;
// The saddle on his back, glittering until the child taps it: a tap target round a point just above the seat, and a few glints
// there every GLITTER_EVERY seconds.
const SADDLE_TAP_UP = 0.15;
const SADDLE_TAP_RADIUS = 0.9;
const GLITTER_EVERY = 0.35;
const GLITTER_BEAT = 1.1; // seconds from one swell of the saddle to the next
// Seconds the choice in scene 4 waits for a child before Egill answers yes himself.
const CHOICE_IDLE = 25;
// The ride: out of the clearing along the path to the east and into the forest.
const RIDE = [[6.4, -1.6], [14.4, -4], [22.4, -6.4], [30, -9.25], [38, -12.25], [44.5, -14.6]];
const RIDE_SPEED = 1.05;
// Birds on the path at the forest's edge fly up as Mosi comes along (critters.js sends them up from any walking
// actor within 6 m). By the ride's path a beetle, a frog and a snail sit on the bare forest floor 1.55 m from its
// middle: half a metre beyond Mosi's feet, inside the ferns that line it, each in the foreground of a shot of the
// ride. The frog faces away from the path, so a tap hops it away from him.
const BIRDS = [[-13.4, 3.55, 200], [-12.6, 3.1, 160], [-11.7, 3.45, 230]];
const PATH_CRITTERS = [
  { name: 'beetle', kind: 'beetle', at: [20.44, -4.2], heading: 120 },
  { name: 'frog', kind: 'frog', at: [29.74, -7.5], heading: 70 },
  { name: 'snail', kind: 'snail', at: [40.54, -11.15], heading: 160 },
];
// A butterfly sits on the flowers nearest this spot as the camera comes down into the clearing.
const BUTTERFLY_FLOWERS = [8.4, 5.0];
// On the ride Mosi's feet press big prints into the soft soil of the path (world/props/footprints.js). His soles are
// about 0.8 m across, the front ones centred a little ahead of the ankle bone and the hind ones behind it (measured on
// the model).
const MOSI_FEET = [
  { bone: 'FrontFootL', size: 1.05, ahead: 0.13 }, { bone: 'FrontFootR', size: 1.05, ahead: 0.13 },
  { bone: 'BackFootL', size: 1.15, ahead: -0.35 }, { bone: 'BackFootR', size: 1.15, ahead: -0.35 },
];
// A few little birds sit on the path ahead, near the camera of the wide ride shot, and flutter up a few seconds into
// the ride, away from Mosi coming along the path through the light.
const RIDE_BIRDS = [[21.0, -5.8, 200], [21.7, -6.35, 160], [22.3, -6.0, 230]];
const RIDE_BIRDS_UP = { after: 4, from: [20.2, -5.6], reach: 3 };
// Seconds of quiet on the ride between the end of Mosi's two lines (their captions too) and the cut to the first critter.
const RIDE_QUIET = 0.3;

// ---------------------------------------------------------------------------------------------
// Burknalautin, the fern glade

// Mosi comes into the glade along its path from the north-east and stops facing Kambeðla across it.
const MOSI_ARRIVES = [[12.5, -8.9], [8, -6]];
const MOSI_GLADE = { position: [4.2, 0, -4.0], heading: 136.4 };
const KAMBEDLA_GLADE = { position: [-4.3, 0, 4.3], heading: -45 };
// Egill floats down beside Mosi's left shoulder, the side the cameras see: at most 1.5 m along him on his left
// and more than 3 m out, the float up's rule read backwards (riding.js: floatDown is floatTo reversed).
const EGILL_LANDS = { actor: 'mosi', part: 'feet', offset: [1.2, 0, -3.4], local: true };
// Then he walks up toward her and listens; for the search he steps aside and looks the other way, toward the
// trees on the glade's east side, with the morning sun behind him.
const EGILL_LISTENS = [1.0, 4.6];
const EGILL_SEARCHES = { position: [3.0, 0, 4.0], heading: 30 };
// The glow flowers' hiding places, in the order the hints come: beside the big stone at the south-east rim, under a big
// rim fern to the south, and up in the little tree to the east. Each is chosen when the glade is set up, from what its
// forest grew (hidingPlaces, below), so every quality preset hides them alike: the first of `kinds` that grows within
// 2 m of `near`, where the tablet's plan grows it. The little tree is a tree fern, or on a preset that grows none
// there the nearest cycad, so "Kíktu upp í litla tréð!" stays true. `at` is where a flower stands when the forest
// tells nothing (the tablet's place), as [x, height above the ground, z].
export const FLOWERS = [
  { name: 'stone', hint: 'k1_mosi_hint_stone', near: [8.97, 11.0], kinds: ['rock'], at: [9.55, 0, 10.23] },
  { name: 'ferns', hint: 'k1_mosi_hint_ferns', near: [3.44, 13.68], kinds: ['fern'], at: [3.36, 0, 13.14] },
  { name: 'tree', hint: 'k1_mosi_hint_tree', near: [12.95, -4.53], kinds: ['treeFern', 'cycad'], at: [12.74, 2.35, -4.39] },
];
const HIDE_REACH = 2; // metres from `near` that a hiding place may grow
// The tray in scene 9: a pocket for each flower Egill picked, as the script shows it and main.js builds it once behind the start
// button (chapter.warmUp).
const TRAY = FLOWERS.map((_, i) => ({ id: `flower-${i + 1}`, icon: 'glowFlower' }));

/**
 * Where each glow flower stands, from the plants the glade's forest grew (forest.js placementInfo: name, x, z, radius,
 * height, and for a plant with a trunk its top and thickness), as { name, hint, position, by }: `by` is the plant it
 * hides by. Each stands a little toward the search camera, so part of its glimmer clears what hides it: beside the
 * stone, at its left as the camera sees it; under the front fronds of the fern; on the little tree's trunk among the
 * fronds.
 */
export function hidingPlaces(placements = []) {
  const [cx, , cz] = BURKNALAUT_SHOTS.search.position;
  return FLOWERS.map(({ name, hint, near: [nx, nz], kinds, at }) => {
    let by = null;
    for (const kind of kinds) {
      const grown = placements.filter(p => p.name === kind && Math.hypot(p.x - nx, p.z - nz) <= HIDE_REACH);
      by = grown.sort((a, b) => Math.hypot(a.x - nx, a.z - nz) - Math.hypot(b.x - nx, b.z - nz))[0] ?? null;
      if (by) break;
    }
    if (!by) return { name, hint, position: at, by: null };
    const length = Math.hypot(cx - by.x, cz - by.z);
    const toward = [(cx - by.x) / length, (cz - by.z) / length];
    const side = [-toward[1], toward[0]];
    let along = 0;
    let across = 0;
    let up = 0;
    if (by.name === 'rock') {
      along = 0.23 * by.radius;
      across = 1.14 * by.radius;
    } else if (by.name === 'fern') {
      along = 0.41 * by.radius;
    } else {
      // On the trunk among the fronds: a tree fern's hang down its trunk, so a little below its top; a cycad's spring
      // from the top of its short trunk and rise, so a little way up into them.
      along = by.trunk + 0.08;
      up = by.name === 'treeFern' ? by.top - 0.23 : by.top + 0.3 * (by.height - by.top);
    }
    const position = [by.x + toward[0] * along + side[0] * across, up, by.z + toward[1] * along + side[1] * across];
    return { name, hint, position, by };
  });
}
// Where Egill stands to feed her: in front of her mouth as she bends down (the eat clip brings it 1.6 m ahead of
// her fore feet, a metre up).
const EGILL_FEEDS = { actor: 'kambedla', part: 'feet', offset: [3.25, 0, 0.15], local: true };
// A frog and a snail in the glade's grass, where the child can see them during the search: the frog on the shorter
// grass toward the middle, below and to the right of the search camera, and the snail out on the left of its first
// view.
const GLADE_CRITTERS = [
  { name: 'glade-frog', kind: 'frog', at: [1.6, 5.9], heading: 260 },
  { name: 'glade-snail', kind: 'snail', at: [6.47, 3.84], heading: 200 },
];

// ---------------------------------------------------------------------------------------------
// Points on the characters that move with a head, a hand or a mouth

/** A point on one of an actor's bones, in that bone's own frame, so it follows the bone however the head turns. */
export function onBone(actor, bone, [x, y, z]) {
  const node = actor.model.getObjectByName(bone);
  if (!node) throw new Error(`${actor.name} has no bone named ${bone}`);
  return out => {
    node.updateWorldMatrix(true, false);
    return node.localToWorld(out.set(x, y, z));
  };
}
// In the Head bone's frame, measured on the baked models against the eyes the face pass found (his idle pose turns
// his head to his left, so the world's axes do not show where the middle of his face is): the middle of Mosi's
// snout between his nostrils, the nose the child taps; a few centimetres in front of it, where the pollen of his
// sneeze comes out; the tip of his right brow horn (found for the butterfly that lands on it, Task 11); and just
// behind the tip of Kambeðla's snout, her mouth.
export const POINTS = {
  mosiNose: ['Head', [-0.267, 0.64, 0.208]],
  mosiSneeze: ['Head', [-0.312, 0.778, 0.285]],
  mosiHorn: ['Head', [0.358, 0.618, 0.647]],
  kambedlaMouth: ['Head', [0.82, -0.12, 0]],
  // Where Egill holds the flowers he picks, the foot of their stems: in front of him at his hands' height (his own
  // frame, from his feet), so the blooms are at his chest.
  egillHands: { actor: 'egill', part: 'feet', offset: [0.24, 0.5, 0], local: true },
  // Where the star rises from: just above the top of her middle plates.
  kambedlaPlates: { actor: 'kambedla', part: 'feet', offset: [-0.42, 3.85, 0], local: true },
};

// ---------------------------------------------------------------------------------------------
// Shots. Metres; vertical field of view in degrees. Each place keeps its own shots clear of plants
// (world/forest/plan.js), so every shot is listed with the place it is taken in.

const FACE = { actor: 'mosi', part: 'head', offset: [0, 0.75, 0] }; // above the head bone: horns and frill in
const KAMBEDLA_FACE = { actor: 'kambedla', part: 'head', offset: [0.3, 0.2, 0] };
// The tracking shot rides ahead of Mosi on his right (+Z) side as he walks in, at a child's eye height.
const TRACK = { offset: [8.4, 1.5, 11.4], lookOffset: [1.9, 0.5, 0] };
// Close on Egill in the saddle, a metre ahead of him and three out on Mosi's right (in Egill's own frame), clear of the
// frill: a stiff follow that looks a little ahead of him, so he stays in the middle of the frame while Mosi walks.
const RIDE_CLOSE = { offset: [0.98, 0.75, 3.01], local: true, look: 'head', lookOffset: [0.3, 0, -0.1], stiffness: 4, fov: 34 };

const RJODUR_SHOTS = {
  // Scene 1: over the clearing toward the sunrise, the smiling sun and the cloud shaped like Mosi, then
  // slowly down and in to a child's eye by Egill, who waits for Mosi, looking where he will come from.
  dawn: { position: [11.5, 6.8, -2.5], target: [-0.6, 12.85, 18.5], fov: 50 },
  waiting: { position: [12.6, 1.25, 6.4], target: [-11.15, 2.2, -4.17], fov: 46 },
  // Scene 2: Mosi comes in along the path; then Egill near, for the child to tap.
  track: {
    position: { actor: 'mosi', part: 'feet', offset: TRACK.offset }, target: { actor: 'mosi', offset: TRACK.lookOffset }, fov: 40,
  },
  egillWaves: { position: [9.5, 1.15, 6.5], target: [-0.5, 1.6, -4.6], fov: 44 },
  // Scene 3: over Egill's left shoulder, his head low right, Mosi's face clear of it (STYLE.md section 8).
  intro: {
    position: { actor: 'egill', part: 'feet', offset: [1.0, 1.3, 2.9] }, frame: { subject: FACE, screen: [0.38, 0.3] }, fov: 46,
  },
  // Scene 4: Mosi close; the choice over Egill's shoulder; low under Mosi's head, with the sun smiling up beside
  // it, so the camera has only to look up a little.
  face: { position: [7.6, 0.8, 4.4], frame: { subject: FACE, screen: [0.5, 0.42] }, fov: 38 },
  choice: {
    position: { actor: 'egill', part: 'feet', offset: [1.5, 1.35, 3.4] }, frame: { subject: FACE, screen: [0.4, 0.32] }, fov: 44,
  },
  sunLow: { position: [8.46, 0.6, -1.79], frame: { subject: FACE, screen: [0.56, 0.58] }, fov: 46 },
  // Scene 5: Mosi from his right side as he turns to go, the saddle pops on and Egill floats up; then up beside
  // the saddle over the clearing.
  mount: { position: [10.6, 1.3, 3.1], target: [3.8, 1.9, 0.2], fov: 46 },
  mountHigh: { position: [8.6, 4.4, 2.2], target: [1.6, 3.0, -0.6], fov: 44 },
  // Scene 6: the ride. Ahead in the forest looking back along the path through the light; Egill close in the
  // saddle (a follow); by the path at a child's eye height, looking down at the soft soil, the beetle near and Mosi's
  // big feet stepping past and pressing their prints into it; the frog; the snail as the two of them go on into the
  // forest. The forest floor rises to the east: these heights are from it.
  rideWide: { position: [27.6, 1.75, -6.6], target: [12, 2.3, -2.6], fov: 50 },
  // The ride close-up, where the follow begins (a shot in Egill's frame, so the forest's planner leaves it alone).
  rideClose: {
    position: { actor: 'egill', part: 'feet', offset: RIDE_CLOSE.offset, local: true }, target: 'egill.head', fov: RIDE_CLOSE.fov,
  },
  rideFeet: { position: [23.0, 1.1, -3.2], target: [16.5, 0.2, -4.9], fov: 52 },
  rideFrog: { position: [32.62, 1.08, -7.14], target: [24.5, 1.15, -7.4], fov: 50 },
  rideAway: { position: [38.7, 1.45, -8.25], target: [47, 2.7, -14.8], fov: 50 },
};

const BURKNALAUT_SHOTS = {
  // Scene 7: into the glade beside Mosi, the light shafts ahead and Kambeðla grazing in the ferns beyond; Egill
  // floats down; a low angle as she lifts her head out of the ferns; over Egill's shoulder to her; her grey
  // plates; Mosi.
  gladeArrive: { position: [11.5, 1.35, -1.5], target: [-4.3, 2.2, 4.3], fov: 52 },
  floatDown: { position: [9.4, 1.3, 1.4], target: [4.5, 1.8, -1.95], fov: 50 },
  kambedlaLow: { position: [0.6, 0.5, 7.2], target: [-4.6, 2.1, 4.2], fov: 50 },
  approach: { position: [5.0, 1.25, 3.4], target: [-3.0, 1.9, 3.0], fov: 48 },
  overEgill: { position: [1.98, 0.95, 5.64], frame: { subject: KAMBEDLA_FACE, screen: [0.38, 0.36] }, fov: 40 },
  plates: { position: [1.4, 1.4, 8.4], target: [-4.6, 2.8, 4.6], fov: 46 },
  mosiGlade: { position: [3.6, 1.3, 3.0], frame: { subject: FACE, screen: [0.56, 0.36] }, fov: 40 },
  // Scene 8: the search, from just behind Egill looking across the glade (the free look turns from here).
  search: { position: [1.94, 1.45, 3.04], target: [12.3, 1.0, 9.0], fov: 50 },
  // Scene 9: Egill and Kambeðla as she bends to his hands, her plates in view (the slow circle round her is an orbit).
  feeding: { position: [4.0, 1.3, 9.0], target: [-3.0, 1.6, 3.2], fov: 44 },
  // Scene 10: the two of them and Egill between; the star rising from her plates into the sun's sky.
  invite: { position: [7.6, 1.3, 7.8], target: [0, 1.8, 0.15], fov: 55 },
  star: { position: [3.86, 1.3, 0.5], target: [-4.85, 4.06, 4.56], fov: 50 },
};

// ---------------------------------------------------------------------------------------------
// The scenes, in turn. `c` holds the cast and what the scenes share.

function* story(s, c) {
  yield* morning(s, c);
  yield* mosiComes(s, c);
  yield* hello(s, c);
  yield* festival(s, c);
  yield* upOnBack(s, c);
  yield* onThePath(s, c);
  yield* kambedlaInTheFerns(s, c);
  yield* flowerSearch(s, c);
  yield* platesLight(s, c);
  yield* invitation(s, c);
}

// Seconds into the fade-in of scene 1 at which the sun, seen for the first time, waves hello with a grin: the picture is half there,
// and the hand is up and swinging before the camera starts down (the sun stays in the dawn shot's frame until about 7 s).
const SUN_WAVES = 1.2;
// Seconds after the star appears (scene 10) at which the sun hugs itself.
const SUN_HUGS = 0.2;

// 1. Morning in the forest: no words. Wide over the treetops toward the smiling sun, then slowly down and in.
function* morning(s, c) {
  mark(c, 1);
  const flowers = flowersNear(c.world, BUTTERFLY_FLOWERS);
  if (flowers) butterflyLand(c.world, flowers);
  // As the picture comes up the sun waves hello with a big grin (added after the test play of 17 October).
  s.after(SUN_WAVES, () => s.all(s.sun.wave(), s.sun.mouth('grin', 2.4)));
  yield s.fade(0, 2.5); // on the sunrise while the screen fades in: the smiling sun and the cloud
  yield s.camera.move('waiting', { duration: 15 });
  // The child may look round a little and tap a butterfly.
  yield s.camera.handheld(0, { duration: 0.4 });
  yield s.lookAround({ yaw: [-28, 28], pitch: [-8, 10] }, 5);
}

// 2. Mosi comes, humming the theme; Egill calls up to him with a hop and a wave, and Mosi sees him (the call was added after the
// test play of 17 October). The hum is over long before the call, as Mosi comes out of the trees, so nothing cuts it short.
function* mosiComes(s, c) {
  mark(c, 2);
  const { mosi, egill } = c;
  yield s.camera.cut('waiting');
  mosi.raw.root.visible = true;
  const walk = mosi.walkTo([...MOSI_WALK_IN, MOSI_STOP], { speed: 1.1 });
  yield s.wait(2.2);
  yield s.say('mosi', 'k1_mosi_hum');
  yield s.camera.cut('track');
  yield s.camera.follow('mosi', TRACK);
  const apart = () => mosi.raw.root.position.distanceTo(egill.raw.root.position);
  yield s.until(() => apart() < EGILL_SEES);
  // Egill near, looking up at Mosi as he comes up behind him, the handheld off for the tap. Egill calls once Mosi's head, the end of
  // him nearest Egill, is EGILL_CALLS metres from him, Mosi still walking; a child who taps Egill before that (about 5 s) makes
  // him call at once, and once (R12: the call never waits for a tap, it only comes sooner with one). The walk goes on whatever
  // ends the wait.
  yield egill.lookAt('mosi.head', { weight: 0.8, maxPitch: 40 });
  yield s.camera.cut('egillWaves');
  s.camera.handheld(0, { duration: 0.3 });
  const head = new THREE.Vector3();
  const near = () => mosi.raw.headPosition(head).setY(0).distanceTo(egill.raw.root.position.clone().setY(0)) < EGILL_CALLS;
  yield tapOrWait(s, 'egill', s.until(near));
  // The call, three things in a row: a hop, "Hey þú! Ég er hérna niðri!" once he has landed, breathing again as he calls (the hop
  // ends in idle's first pose), and a wave as his voice ends. Mosi hears him and looks down at him, stops at his place, and answers
  // once Egill's line is over.
  yield egill.play('hop', { fade: 0.12 });
  yield s.wait(egill.raw.clips.get('hop').duration);
  yield egill.play('idle', { fade: 0.15 });
  const call = s.say('egill', 'k1_egill_hey');
  yield mosi.lookAt('egill.head', { weight: 0.8 });
  yield s.wait(s.lineDuration('k1_egill_hey'));
  yield egill.play('waveLeft', { fade: 0.3 });
  yield s.all(call, walk);
  yield s.say('mosi', 'k1_mosi_waving');
}

// The "atsjú!" of "A… a… atsjú!": seconds into its recording, where the last burst of sound begins, read from its mouth track
// (assets/audio/lines.json; tests/kafli1.test.mjs reads it the same way), so a new take of the line moves the pollen with it.
// A line without a recording (no mouth track) sneezes ATSJU seconds in.
export function lastBurst(mouth) {
  const loud = [...(mouth ?? '')].map(level => parseInt(level, 16) > 0);
  let at = loud.lastIndexOf(true);
  if (at < 0) return null;
  while (at > 0 && loud[at - 1]) at--;
  return at / MOUTH_RATE;
}
const ATSJU = 1.5;
/** Seconds into the sneeze where the pollen flies: the last burst of its mouth track, or ATSJU without one. */
export const atsjuOf = mouth => lastBurst(mouth) ?? ATSJU;
// Seconds the nose still waits for its second tap once the giggle of the first is over.
const NOSE_AGAIN = 4;

// 3. Hello, Egill: he walks the last few steps and Mosi bends his head down to him.
function* hello(s, c) {
  mark(c, 3);
  const { world, mosi, egill } = c;
  yield egill.walkTo(EGILL_SPOT, { speed: 0.55 });
  yield s.camera.cut('intro');
  yield s.all(mosi.turnTo('egill'), s.camera.push({ distance: 0.4, duration: 4 }));
  s.camera.handheld(0.5, { duration: 1.5 });
  yield s.say('mosi', 'welcome');
  // The child may tap his nose: once it tickles, the second time he sneezes, and the pollen flies on the "atsjú!". The nose
  // waits 5 s for a first tap, and after the giggle at least NOSE_AGAIN more for the second, so a child who finds it late
  // still gets the whole joke.
  yield s.camera.handheld(0, { duration: 0.6 });
  s.target('nose', { point: onBone(mosi.raw, ...POINTS.mosiNose), radius: 0.45 });
  let until = s.time + 5;
  for (let taps = 0; taps < 2 && s.time < until;) {
    if ((yield s.race(s.tap('nose'), s.wait(until - s.time))) === undefined) break;
    taps++;
    if (taps === 2) s.after(atsjuOf(s.lineMouth('k1_mosi_sneeze')), () => pollenBurst(world, onBone(mosi.raw, ...POINTS.mosiSneeze)));
    yield s.say('mosi', taps === 1 ? 'k1_mosi_tickle' : 'k1_mosi_sneeze');
    until = Math.max(until, s.time + NOSE_AGAIN);
  }
  s.target('nose', null);
}

// 4. The Star Festival: Mosi tells of it and asks for help; the camera looks up to the sun, which winks.
function* festival(s, c) {
  mark(c, 4);
  const { world, mosi } = c;
  yield s.camera.cut('face');
  butterflyLand(world, onBone(mosi.raw, ...POINTS.mosiHorn)); // a butterfly comes to rest on his horn
  s.camera.handheld(0.5, { duration: 1.5 });
  yield mosi.lookAt('camera', { weight: 0.7 });
  s.camera.push({ distance: 0.6, duration: 8 });
  yield s.say('mosi', 'k1_mosi_festival');
  yield mosi.lookAt('egill.head', { weight: 0.85 });
  yield s.camera.cut('choice');
  yield s.say('mosi', 'k1_mosi_friends');
  yield s.say('mosi', 'k1_mosi_help');
  // The camera settles completely before the child chooses (STYLE.md section 8). The second answer asks what the
  // festival is; Mosi tells, and asks again. A child who does not choose hears Egill say yes after a while.
  yield s.camera.handheld(0, { duration: 0.8 });
  const ask = () => s.race(s.choose([
    { label: 'Já, gerum það!', value: 'yes' },
    { label: 'Hvað er stjörnuhátíð?', value: 'what' },
  ]), s.wait(CHOICE_IDLE));
  while ((yield ask()) === 'what') {
    yield s.say('egill', 'k1_egill_what');
    yield s.say('mosi', 'k1_mosi_explain');
  }
  yield s.say('egill', 'k1_egill_yes');
  // "The sun won't wait for us": low under his head the camera looks up to the sun, which winks, says "o" with its mouth as its eyes
  // open (added after the test play of 17 October) and smiles again while the camera still looks up, and back down.
  yield s.camera.cut('sunLow');
  const great = s.say('mosi', 'k1_mosi_great');
  yield s.camera.lookAt('sun', { screen: [0.5, 0.3], duration: 3 });
  s.sun.wink();
  s.after(WINK_SECONDS, () => s.sun.mouth('oh', 0.9));
  yield great;
  yield s.wait(0.6);
  yield s.camera.move('sunLow', { duration: 3 });
}

// 5. Up on his back: the saddle pops on and Egill floats up into it.
function* upOnBack(s, c) {
  mark(c, 5);
  const { mosi, egill } = c;
  // Mosi turns to go, which leaves Egill beside his right shoulder, and the saddle pops onto his back.
  yield mosi.lookAt(null);
  yield egill.lookAt('mosi.head', { weight: 0.7, maxPitch: 40 });
  yield s.camera.cut('mount');
  yield mosi.turnTo(mosi.raw.heading - MOSI_TURNS_TO_GO);
  // He watches Egill inside the caps the float puts on his looks (riding.js), so his head does not jump then.
  yield mosi.lookAt('egill.head', { weight: 0.6, maxAngle: 40, maxPitch: 30 });
  s.sfx('saddle');
  yield c.saddle.appear();
  // The saddle glitters, asking for a tap, from the moment it is on (the owner's play of 18 October), while Mosi says his spell.
  // A tap on the saddle (or on Egill) floats him up at once, with nothing in between, Mosi still talking if he is; a child who
  // does not tap sees him float up by himself 6 s after the spell. A capture's tap comes 2 s after the spell, as it always has.
  s.camera.handheld(0, { duration: 0.3 });
  const glitter = s.after(0, () => glitterSaddle(s, c));
  const hocus = s.say('mosi', 'k1_mosi_hocus');
  const spellSaid = () => s.until(() => hocus.done);
  if (s.seeking) yield spellSaid();
  s.target('saddle', { point: out => overSaddle(c, out), radius: SADDLE_TAP_RADIUS });
  s.target('egill', { point: 'egill', radius: 0.7 });
  try {
    yield s.race(s.tap(['saddle', 'egill']), (function* idle() {
      yield spellSaid();
      yield s.wait(6);
    })());
  } finally {
    s.target('saddle', null);
    s.target('egill', null);
    glitter.cancel();
  }
  s.sfx('float');
  yield egill.lookAt(null);
  const rising = s.camera.move('mountHigh', { duration: 6 });
  yield floatTo(egill.raw, c.saddle);
  ride(egill.raw, c.saddle); // until he floats down in the glade, which ends the ride
  yield rising;
  yield spellSaid();
  yield s.say('egill', 'k1_egill_wow');
  yield mosi.lookAt(null);
  yield s.say('mosi', 'k1_mosi_hold');
}

// 6. On the path: the ride to Kambeðla, past critters the child may tap.
function* onThePath(s, c) {
  mark(c, 6);
  const { mosi } = c;
  // A critter the child taps reacts and goes in the journal, and Mosi says something about it once he has
  // finished what he is saying. None of it is needed.
  const remarks = { beetle: 'k1_mosi_beetle', frog: 'k1_mosi_frog', snail: 'k1_mosi_snail' };
  const found = [];
  const { critters } = c.rjodur;
  const stops = PATH_CRITTERS.map(spot => {
    s.target(spot.name, critters.targets.find(t => t.name === spot.name));
    return s.onTap(spot.name, tap => {
      critters.react(spot.name);
      s.found(spot.kind, tap); // its picture flies from the tap into the book
      if (!found.includes(spot.kind)) found.push(spot.kind);
    });
  });
  const chatter = s.after(0, function* chat() {
    for (let said = 0; ; said++) {
      yield s.until(() => found.length > said);
      yield speak(s, c, remarks[found[said]]);
    }
  });
  // The shots follow Mosi along the path (each for a while at least), and his words go on across them.
  c.prints = createFootprints(c.world, { actor: mosi.raw, feet: MOSI_FEET }); // made as he stands: it knows his feet
  const walk = mosi.walkTo(RIDE, { speed: RIDE_SPEED });
  const [bx, bz] = RIDE_BIRDS_UP.from;
  s.after(RIDE_BIRDS_UP.after, function* birdsUp() {
    critters.scare([bx, c.world.heightAt(bx, bz), bz], RIDE_BIRDS_UP.reach);
  });
  const past = (x, seconds) => s.all(s.until(() => mosi.raw.root.position.x > x), s.wait(seconds));
  // A second into the ride Mosi names the visit and then tells Egill to look out for small animals, said as one. His voice is theirs
  // from the ride's first frame, the second's wait inside the claim, so a remark about a critter tapped at once, even in that second,
  // waits for both (the critter itself reacts and goes in the journal at the tap). He must be done before the camera shows the first
  // critter, the beetle in rideFeet: that cut comes as his front foot reaches the beetle, or once the two lines are over (their
  // captions too) and RIDE_QUIET more, whichever is later, so a take of any length fits (tests/kafli1.test.mjs checks it, and the
  // early tap).
  let rideLinesOver = null; // the scene time the two lines ended
  s.after(0, function* rideLines() {
    yield speak(s, c, 1, 'k1_mosi_visit', 'k1_mosi_critters');
    rideLinesOver = s.time;
  });
  // Ahead in the forest, looking back along the path through the light: Mosi comes, Egill on his back.
  yield s.camera.cut('rideWide');
  s.camera.handheld(0.4, { duration: 2 });
  yield past(10.5, 4);
  // Egill close, smiling in the saddle.
  yield s.camera.cut('rideClose');
  yield s.camera.follow('egill', RIDE_CLOSE);
  yield past(17.5, 4);
  yield s.until(() => rideLinesOver !== null && s.time >= rideLinesOver + RIDE_QUIET);
  // By the path, looking down at the soft soil: the beetle near, and Mosi's big feet stepping past and pressing their
  // prints into it.
  yield s.camera.cut('rideFeet');
  yield past(23.8, 2.6);
  // The frog, and Mosi coming past it.
  yield s.camera.cut('rideFrog');
  yield past(33.2, 2.6);
  // The snail, and the two of them going on into the forest; the glade fades in while he still walks.
  yield s.camera.cut('rideAway');
  yield past(42.6, 2.6);
  yield s.until(() => !c.talking);
  chatter.cancel();
  for (const stop of stops) stop();
  for (const spot of PATH_CRITTERS) s.target(spot.name, null);
  c.pathWalk = walk;
  yield* goTo(s, c, 'burknalaut', () => setUpGlade(s, c));
}

// 7. Kambeðla: into the glade with the light, Egill floats down, and she lifts her head out of the ferns.
function* kambedlaInTheFerns(s, c) {
  mark(c, 7);
  const { mosi, egill, kambedla } = c;
  s.camera.handheld(0.4, { duration: 2 });
  yield mosi.walkTo([...MOSI_ARRIVES.slice(1), [MOSI_GLADE.position[0], MOSI_GLADE.position[2]]], { speed: 1 });
  yield mosi.turnTo(MOSI_GLADE.heading);
  yield s.camera.cut('floatDown');
  s.sfx('float');
  yield floatDown(egill.raw, c.saddle, EGILL_LANDS, { heading: 157 });
  // Mosi calls her, and Egill sets off toward the ferns where she grazes.
  const closer = egill.walkTo(EGILL_LISTENS, { speed: 0.85 });
  yield s.say('mosi', 'k1_mosi_greet');
  // She lifts her head out of the ferns, her plates grey, and watches Egill come up to her.
  yield s.camera.cut('kambedlaLow');
  yield kambedla.play('idle', { fade: 1.2 });
  yield kambedla.lookAt('mosi.head', { weight: 0.6 });
  yield s.wait(2.8);
  yield s.camera.cut('approach');
  yield kambedla.lookAt('egill.head', { weight: 0.8, maxPitch: 40 });
  yield s.all(closer, s.wait(2.5));
  yield s.camera.cut('overEgill');
  yield egill.lookAt('kambedla.head', { weight: 0.8, maxPitch: 40 });
  yield s.say('kambedla', 'k1_kambedla_hello');
  yield s.camera.cut('plates');
  yield s.say('kambedla', 'k1_kambedla_lost');
  yield s.camera.cut('mosiGlade');
  yield mosi.lookAt('egill.head', { weight: 0.8 });
  yield s.say('mosi', 'k1_mosi_worry');
}

// The flowers in Egill's hands, from the search until he gives each to Kambeðla: a little posy, the first upright and
// the next two leaning out to either side, all a little forward (lean: radians about his forward axis, then his right).
// He holds it in both hands from the moment the first flower reaches him until the last has gone.
export const HELD = {
  size: 0.45, leans: [[0, 0, -0.12], [-0.34, 0, -0.12], [0.34, 0, -0.12]],
  // Where his wrists go to hold it, either side of the stems (engine/hand-hold.js): his hands reach in to them from
  // there, and his elbows stay out past his sides.
  grips: {
    left: { actor: 'egill', part: 'feet', offset: [0.16, 0.54, -0.08], local: true },
    right: { actor: 'egill', part: 'feet', offset: [0.16, 0.58, 0.08], local: true },
  },
};

// 8. The search: the child looks round the glade and finds the three glow flowers; Egill picks each.
function* flowerSearch(s, c) {
  mark(c, 8);
  const { mosi, egill, kambedla } = c;
  yield egill.walkTo([EGILL_SEARCHES.position[0], EGILL_SEARCHES.position[2]], { speed: 0.6 });
  yield egill.turnTo(EGILL_SEARCHES.heading);
  yield s.camera.cut('search');
  yield s.camera.handheld(0, { duration: 0.3 });
  yield mosi.lookAt('camera', { weight: 0.5 });
  yield kambedla.lookAt('camera', { weight: 0.5 });
  // The search begins as Mosi says what to do. A flower found flies into Egill's hands at once, and he keeps it there,
  // and the search goes on; Mosi counts each in turn, once he has finished what he was saying.
  const counts = ['k1_mosi_one', 'k1_mosi_two', 'k1_mosi_three'];
  let explaining = null;
  let counting = null;
  const searching = s.search({
    explore: { yaw: [-80, 80], pitch: [-14, 26] },
    targets: c.flowers.map(f => ({ name: f.name, point: f.flower.point, hint: f.hint, radius: 0.55 })),
    onFound: (name, index) => {
      s.sfx('flower');
      const turn = () => egill.raw.root.quaternion;
      const { flower } = c.flowers.find(f => f.name === name);
      const picked = flower.hold(POINTS.egillHands, { size: HELD.size, lean: HELD.leans[index], turn });
      if (index === 0) {
        s.after(0, function* takeHold() { // his hands go to the stems as the first flower reaches him
          yield picked;
          c.hands = holdWithHands(c.world, egill.raw, HELD.grips).grip(0.4);
        });
      }
      const before = [picked, counting, explaining].filter(Boolean);
      counting = s.after(0, function* count() {
        yield s.all(before);
        yield s.say('mosi', counts[index]);
      });
      return picked;
    },
  });
  explaining = s.say('mosi', 'k1_mosi_look');
  yield explaining;
  yield searching;
  yield counting;
}

// 9. The plates light: Egill gives her the flowers one by one, and with each a row of plates lights.
function* platesLight(s, c) {
  mark(c, 9);
  const { world, egill, kambedla } = c;
  yield s.camera.cut('feeding');
  s.camera.handheld(0.3, { duration: 1.5 });
  yield kambedla.lookAt('egill.head', { weight: 0.4 });
  yield egill.walkTo(EGILL_FEEDS, { speed: 0.9 });
  yield egill.turnTo('kambedla');
  yield egill.lookAt('kambedla.head', { weight: 0.8, maxPitch: 40 });
  const mouth = onBone(kambedla.raw, ...POINTS.kambedlaMouth);
  // The flowers in his hands are in the tray too, and the child may give any of them, in any order, from the moment the
  // tray shows: a drag listens for every flower still in it and listens again the moment one is given, while she eats.
  // Twelve seconds into a wait Mosi says it again, and after twenty Egill gives her the first one left himself.
  const items = c.flowers.map((held, i) => ({ id: TRAY[i].id, flower: held.flower }));
  s.tray.show(TRAY.slice(0, items.length));
  const given = [];
  const giving = s.after(0, function* give() {
    let left = items.map(item => item.id);
    while (left.length) {
      let nudge = null;
      const reminder = s.after(12, () => (nudge = s.say('mosi', 'k1_mosi_give')));
      const { id } = yield s.drag(left, mouth, { idle: 20 });
      if (!nudge) reminder.cancel();
      given.push({ id, nudge });
      left = left.filter(other => other !== id);
    }
  });
  yield s.camera.handheld(0, { duration: 0.6 });
  const mmm = ['k1_kambedla_mmm1', 'k1_kambedla_mmm2', 'k1_kambedla_mmm3'];
  for (let row = 0; row < items.length; row++) {
    const eat = bendDown(kambedla);
    if (row === 0) yield s.say('mosi', 'k1_mosi_give');
    // Bent down to his hands, she takes the flower given: it flies from his hands into her mouth, however it was given.
    yield s.all(s.until(() => given.length > row), s.wait(0.6));
    const { id, nudge } = given[row];
    if (nudge) yield nudge;
    if (row === items.length - 1) c.hands?.release(0.5); // the last flower leaves his hands, and they go back
    yield items.find(item => item.id === id).flower.pick(mouth);
    sparkleBurst(world, mouth, { count: 18, duration: 0.9, colour: '#d9b8f2', seed: `fed ${row}` });
    eat.setEffectiveTimeScale(1); // she nips, chews and comes back up
    s.sfx('plate');
    yield s.all(c.glow.setRow(row, 1), s.say('kambedla', mmm[row]));
    yield s.wait(0.8);
    yield kambedla.play('idle', { fade: 0.5 });
  }
  yield giving;
  s.tray.hide();
  // All her plates glow again: she hops for joy and the camera circles her slowly.
  yield kambedla.play('happy', { fade: 0.3 });
  const circling = s.camera.orbit({ around: 'kambedla', degrees: -60, duration: 13 });
  yield s.say('kambedla', 'k1_kambedla_glow');
  yield kambedla.play('idle', { fade: 0.6 });
  yield circling;
}

// 10. The invitation and the star.
function* invitation(s, c) {
  mark(c, 10);
  const { mosi, egill, kambedla } = c;
  yield s.camera.cut('invite');
  s.camera.handheld(0.4, { duration: 1.5 });
  yield mosi.lookAt('kambedla.head', { weight: 0.8 });
  yield s.say('mosi', 'k1_mosi_invite');
  yield kambedla.play('kink', { fade: 0.3 });
  yield s.say('kambedla', 'k1_kambedla_accept');
  yield kambedla.play('idle', { fade: 0.5 });
  // The first star rises from her plates and the sun hugs itself with a big grin and winks (the hug was added after the test play of
  // 17 October); the child taps the star into the journal.
  yield s.camera.cut('star');
  yield s.camera.handheld(0, { duration: 0.4 });
  const above = { actor: 'kambedla', part: 'feet', offset: [-0.42, 5.6, 0], local: true };
  yield mosi.lookAt(above, { weight: 0.7 });
  yield egill.lookAt(above, { weight: 0.8, maxPitch: 40 });
  s.sfx('star');
  const star = s.star('k1_kambedla', POINTS.kambedlaPlates);
  s.after(SUN_HUGS, () => s.sun.hug());
  yield s.wait(1.4);
  s.sun.wink();
  yield s.say('mosi', 'k1_mosi_star');
  yield star;
  s.sfx('journal');
  // Kambeðla asks the child to play her card game, "Eitt!" (part 3), which her star has just opened in the book.
  yield kambedla.lookAt('egill.head', { weight: 0.7 });
  yield s.say('kambedla', 'k1_kambedla_play');
  // Into the book, which opens over the glade on its games, where "Eitt!" waits, new, while Mosi wonders who is next.
  s.fade(0.45, 1.6);
  s.journal.open('games');
  yield s.say('mosi', 'k1_mosi_next');
}

// ---------------------------------------------------------------------------------------------
// Helpers

/** Note when a scene starts (world.chapterTimeline, for captures and probes). */
function mark(c, scene) {
  c.world.chapterTimeline?.push({ scene, at: c.s.time });
}

/** A point just above the saddle's seat, in the world (`out`), as Mosi stands now. */
function overSaddle(c, out = new THREE.Vector3()) {
  out.copy(c.saddle.update());
  out.y += SADDLE_TAP_UP;
  return out;
}

/**
 * The saddle glitters, asking for a tap: gold glints over it every GLITTER_EVERY seconds, and it swells a little and back, like a
 * heartbeat, until the task is cancelled (then it is its own size again).
 */
function* glitterSaddle(s, c) {
  const saddle = c.saddle.object;
  const size = saddle.scale.x;
  let over = false;
  let age = 0;
  c.world.effects.add({
    update(dt) {
      if (over) return false;
      age += dt;
      const beat = Math.max(0, Math.sin((age / GLITTER_BEAT) * Math.PI * 2));
      saddle.scale.setScalar(size * (1 + 0.14 * beat * beat));
      return true;
    },
  });
  const at = new THREE.Vector3();
  try {
    for (let i = 0; ; i++) {
      overSaddle(c, at);
      const k = i * 2.39996; // round the seat, a golden angle at a time, so no two in a row come up in one place
      at.x += Math.cos(k) * 0.35;
      at.z += Math.sin(k) * 0.35;
      at.y += 0.1;
      sparkleBurst(c.world, at.clone(), { count: 12, duration: 1.2, size: 0.34, spread: 0.75, seed: `saddle glitter ${i % 8}` });
      yield s.wait(GLITTER_EVERY);
    }
  } finally {
    over = true;
    saddle.scale.setScalar(size);
  }
}

/**
 * A line of Mosi's on the ride, or several one right after the other: the critters' remarks wait for the last of them
 * and it waits for them. (Said together they keep the one claim on his voice, so no remark gets in between.) A number
 * among the lines is a pause of that many seconds, inside the claim: his voice is held while he waits.
 */
function* speak(s, c, ...lines) {
  yield s.until(() => !c.talking);
  c.talking = true;
  try {
    for (const line of lines) yield typeof line === 'number' ? s.wait(line) : s.say('mosi', line);
  } finally {
    c.talking = false;
  }
}

/** Kambeðla bends down to a child's hands and waits there: the eat clip, held just before the nip. */
function bendDown(kambedla) {
  const action = kambedla.raw.play('eat', { fade: 0.5, once: true });
  action.time = 0.6;
  action.setEffectiveTimeScale(0);
  return action;
}

/** The flowers nearest a spot in the clearing: a point just over their heads (null when the forest has none). */
function flowersNear(world, [x, z]) {
  const list = world.forest?.info?.placementList?.filter(p => p.name === 'flowers') ?? [];
  if (!list.length) return null;
  const near = list.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a));
  return [near.x, world.heightAt(near.x, near.z) + 0.36 * near.scale, near.z];
}

/** Fade to another place, set it up while the screen is black, and fade in. */
function* goTo(s, c, name, setUp) {
  const going = s.goTo(name);
  yield s.until(() => c.world.location === name);
  setUp();
  yield going;
}

/**
 * Mosi's footfalls: a step sounds as each foot comes down (its bone drops back to its standing height). It runs as a
 * task of its own beside the story, so whatever goes wrong with a step can stop the steps but never the story.
 */
function* footfalls(s, c) {
  const { model } = c.mosi.raw;
  const feet = ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR']
    .map(name => model.getObjectByName(name))
    .filter(Boolean); // a foot the model does not have is left out
  const p = new THREE.Vector3();
  const lift = foot => foot.getWorldPosition(p).y - c.world.heightAt(p.x, p.z);
  const rest = feet.map(lift);
  const down = feet.map(() => true);
  for (;;) {
    feet.forEach((foot, i) => {
      const up = lift(foot) - rest[i];
      if (down[i] && up > 0.03) down[i] = false;
      else if (!down[i] && up < 0.008) {
        down[i] = true;
        s.sfx('step');
      }
    });
    yield;
  }
}

/** The clearing's critters and butterflies, ready to tap; `leave()` takes them away again. */
function setUpClearing(s, c) {
  const { world } = c;
  const ground = (x, z) => [x, world.heightAt(x, z), z];
  const critters = createCritters(world, {
    spots: PATH_CRITTERS.map(({ name, kind, at: [x, z], heading }) => ({ name, kind, position: ground(x, z), heading })),
    birds: [...BIRDS, ...RIDE_BIRDS].map(([x, z, heading], i) => ({
      name: `bird-${i + 1}`, position: ground(x, z), heading,
    })),
    onReact: (name, kind) => s.sfx(kind === 'bird' ? 'birds' : kind), // the birds Mosi's steps send up as well
  });
  // The birds and the butterflies can be tapped from the start; the critters by the path, on the ride (scene 6).
  const stops = [];
  for (const t of critters.targets.filter(target => target.name.startsWith('bird-'))) {
    s.target(t.name, t);
    stops.push(s.onTap(t.name, tap => { critters.react(t.name); s.found('birds', tap); }));
  }
  stops.push(...butterflyTaps(s, world));
  return {
    critters,
    leave() {
      for (const stop of stops) stop();
      for (const t of [...critters.targets, ...(world.forest.butterflies?.targets ?? [])]) s.target(t.name, null);
      critters.dispose();
    },
  };
}

/** The forest's butterflies, each a tap target: a tap sends it fluttering up, glittering, and into the journal. */
function butterflyTaps(s, world) {
  const butterflies = world.forest.butterflies;
  return (butterflies?.targets ?? []).map(t => {
    s.target(t.name, t);
    return s.onTap(t.name, tap => {
      butterflies.flutter(t.name);
      sparkleBurst(world, t.point.clone(), { count: 14, duration: 0.8, seed: t.name });
      s.sfx('butterfly');
      s.found('butterfly', tap);
    });
  });
}

/** The glade, set up while the screen is black: the actors, the flowers, the critters, the first shot. */
function setUpGlade(s, c) {
  const { world, mosi, kambedla } = c;
  c.rjodur.leave();
  c.prints.dispose(); // they lie on the clearing's path
  c.pathWalk.cancel(); // he stops walking the clearing's path
  mosi.place(MOSI_ARRIVES[0][0], MOSI_ARRIVES[0][1], 147); // along the path
  kambedla.place(KAMBEDLA_GLADE.position[0], KAMBEDLA_GLADE.position[2], KAMBEDLA_GLADE.heading);
  kambedla.raw.root.visible = true;
  bendDown(kambedla); // grazing, her head low in the ferns
  c.flowers = hidingPlaces(world.forest?.info?.placementList).map(({ name, position: [x, up, z], hint }) => ({
    name, hint, flower: createGlowFlower(world, { name, position: [x, world.heightAt(x, z) + up, z] }),
  }));
  const critters = createCritters(world, {
    spots: GLADE_CRITTERS.map(({ name, kind, at: [x, z], heading }) => ({
      name, kind, position: [x, world.heightAt(x, z), z], heading,
    })),
    birds: [],
    onReact: (name, kind) => s.sfx(kind),
  });
  // They react and go in the journal, and do not count for the search.
  for (const { name, kind } of GLADE_CRITTERS) {
    s.target(name, critters.targets.find(t => t.name === name));
    s.onTap(name, tap => { critters.react(name); s.found(kind, tap); });
  }
  butterflyTaps(s, world);
  s.camera.cut('gladeArrive');
}

// ---------------------------------------------------------------------------------------------

export const chapter = {
  id: 'kafli1',
  title: 'Boð til kambeðlunnar',
  next: 'kafli2', // when its script ends, the book shows an "Áfram" into chapter 2 (main.js)
  look: 'morning',
  start: 'rjodur',
  locations: {
    rjodur: {
      layout: {
        seed: 11,
        clearing: { center: [0, 0], radius: 15 },
        forestEdge: 21,
        path: [[-54, 16], [-32, 9.6], [-16, 4], [-4.8, 1], [6.4, -1.6], [22.4, -6.4], [48, -16]],
        leafShadows: true,
        glade: { shafts: 3 }, // no glade, only its light shafts: the script has sunbeams in the clearing too
        actors: {
          mosi: { position: [MOSI_STOP[0], 0, MOSI_STOP[1]], heading: 12 },
          egill: EGILL_WAITS,
        },
      },
      shots: RJODUR_SHOTS,
    },
    burknalaut: {
      layout: {
        seed: 7,
        clearing: { center: [0, 0], radius: 9 },
        forestEdge: 14,
        path: [[40, -30], [26, -19], [15, -10.5], [8, -6], [4.6, -4.2]],
        glade: { ferns: 3, shafts: 4 },
        leafShadows: true,
        actors: {
          mosi: MOSI_GLADE,
          egill: { position: [EGILL_LISTENS[0], 0, EGILL_LISTENS[1]], heading: 200 },
          kambedla: KAMBEDLA_GLADE,
        },
      },
      shots: BURKNALAUT_SHOTS,
      // The glade's views for the warm-up draw as the chapter comes here (main.js, engine/warm-up.js): the arrival with its four
      // shafts, the search with the flowers and critters, the feeding with Kambeðla close.
      warmUp: ['gladeArrive', 'search', 'feeding'],
    },
  },
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', position: [MOSI_ENTERS[0], 0, MOSI_ENTERS[1]], heading: -19 },
    egill: { url: '../assets/characters/egill.glb', ...EGILL_WAITS },
    kambedla: { url: '../assets/characters/stegosaurus.glb', position: [0, 0, -400], heading: 0 },
  },
  // Caption names; the colour is the dark tone of each character's main hue (STYLE.md section 3).
  cast: {
    mosi: { name: 'Mosi', colour: '#4f5433' },
    egill: { name: 'Egill', colour: '#355774' },
    kambedla: { name: 'Kambeðla', colour: '#5d4370' },
  },
  // Every line is the script's own words with its recording (remake/assets/audio/kafli1/lines-source.json and
  // lines.json). Scene 3's welcome is the game's existing recording. The humming's caption leaves out the voice
  // tag it was recorded with.
  lines: {
    k1_mosi_hum: { text: 'Mm, mm-mm-mm, mm-mm-mmm… mm-mm-mm, mmm.', audio: 'k1_mosi_hum' },
    k1_egill_hey: { text: 'Hey þú! Ég er hérna niðri!', audio: 'k1_egill_hey' },
    k1_mosi_waving: { text: 'Ó! Ég sé einhvern veifa!', audio: 'k1_mosi_waving' },
    welcome: { text: 'Halló, Egill! Velkominn heim til mín! Ég heiti Mosi. Eigum við að skoða okkur aðeins um saman?', audio: 'welcome' },
    k1_mosi_tickle: { text: 'Hí, hí, það kitlar!', audio: 'k1_mosi_tickle' },
    k1_mosi_sneeze: { text: 'A… a… atsjú!', audio: 'k1_mosi_sneeze' },
    k1_mosi_festival: { text: 'Veistu hvað, Egill? Í kvöld kvikna fyrstu stjörnur sumarsins. Þá höldum við Stjörnuhátíðina!', audio: 'k1_mosi_festival' },
    k1_mosi_friends: { text: 'Allir vinir mínir koma, og hver og einn kemur með eitthvað alveg sérstakt.', audio: 'k1_mosi_friends' },
    k1_mosi_help: { text: 'En við þurfum að bjóða þeim öllum áður en sólin sest. Viltu hjálpa mér?', audio: 'k1_mosi_help' },
    k1_egill_yes: { text: 'Já, gerum það!', audio: 'k1_egill_yes' },
    k1_egill_what: { text: 'Hvað er stjörnuhátíð?', audio: 'k1_egill_what' },
    k1_mosi_explain: { text: 'Það er stærsta veisla skógarins! Við syngjum og dönsum og horfum saman á stjörnurnar kvikna. Viltu hjálpa mér að bjóða vinunum?', audio: 'k1_mosi_explain' },
    k1_mosi_great: { text: 'Frábært! Sólin bíður ekki eftir okkur.', audio: 'k1_mosi_great' },
    k1_mosi_hocus: { text: 'Hókus pókus, hnakkur! Upp með þig, Egill!', audio: 'k1_mosi_hocus' },
    k1_egill_wow: { text: 'Vá! Ég sé yfir allt!', audio: 'k1_egill_wow' },
    k1_mosi_hold: { text: 'Haltu þér fast. Af stað!', audio: 'k1_mosi_hold' },
    k1_mosi_visit: { text: 'Fyrst heimsækjum við Kambeðlu vinkonu mína. Plöturnar á bakinu hennar lýsa eins og ljósker!', audio: 'k1_mosi_visit' },
    k1_mosi_critters: { text: 'Horfðu vel í kringum þig á leiðinni, Egill! Ef þú pikkar á smádýrin sem þú sérð, skrifum við um þau í Landkönnuðabókina þína.', audio: 'k1_mosi_critters' },
    k1_mosi_beetle: { text: 'Sjáðu, bjalla! Halló, litla vinkona!', audio: 'k1_mosi_beetle' },
    k1_mosi_frog: { text: 'Froskur! Hann hoppar hærra en ég!', audio: 'k1_mosi_frog' },
    k1_mosi_snail: { text: 'Snigill. Hann er ekkert að flýta sér.', audio: 'k1_mosi_snail' },
    k1_mosi_greet: { text: 'Kambeðla! Halló!', audio: 'k1_mosi_greet' },
    k1_kambedla_hello: { text: 'Ó, halló, Mosi… og halló, litli vinur.', audio: 'k1_kambedla_hello' },
    k1_kambedla_lost: { text: 'Ég finn ekki glóblómin mín. Án þeirra lýsa plöturnar mínar ekki.', audio: 'k1_kambedla_lost' },
    k1_mosi_worry: { text: 'Engar áhyggjur. Egill er besti leitarmaður skógarins!', audio: 'k1_mosi_worry' },
    k1_mosi_look: { text: 'Glóblómin glitra. Dragðu fingrinum til að líta í kringum þig!', audio: 'k1_mosi_look' },
    k1_mosi_hint_stone: { text: 'Ég sé eitthvað glitra við stóra steininn!', audio: 'k1_mosi_hint_stone' },
    k1_mosi_hint_ferns: { text: 'Hvað með undir burknunum?', audio: 'k1_mosi_hint_ferns' },
    k1_mosi_hint_tree: { text: 'Kíktu upp í litla tréð!', audio: 'k1_mosi_hint_tree' },
    k1_mosi_one: { text: 'Eitt!', audio: 'k1_mosi_one' },
    k1_mosi_two: { text: 'Tvö!', audio: 'k1_mosi_two' },
    k1_mosi_three: { text: 'Og þrjú! Þú fannst þau öll!', audio: 'k1_mosi_three' },
    k1_mosi_give: { text: 'Gefðu henni blómin!', audio: 'k1_mosi_give' },
    k1_kambedla_mmm1: { text: 'Mmm!', audio: 'k1_kambedla_mmm1' },
    k1_kambedla_mmm2: { text: 'Mmm!', audio: 'k1_kambedla_mmm2' },
    k1_kambedla_mmm3: { text: 'Mmm!', audio: 'k1_kambedla_mmm3' },
    k1_kambedla_glow: { text: 'Sjáið! Ég lýsi aftur!', audio: 'k1_kambedla_glow' },
    k1_mosi_invite: { text: 'Kambeðla, viltu koma á Stjörnuhátíðina í kvöld?', audio: 'k1_mosi_invite' },
    k1_kambedla_accept: { text: 'Já! Ég skal lýsa upp alla hátíðina!', audio: 'k1_kambedla_accept' },
    k1_mosi_star: { text: 'Sjáðu, Egill! Fyrsta stjarnan!', audio: 'k1_mosi_star' },
    // Recorded with the lines of her card game (assets/audio/eitt/lines-source.json), and read by the chapter's own voice.
    k1_kambedla_play: { text: 'Viltu spila við mig?', audio: 'k1_kambedla_play' },
    k1_mosi_next: { text: 'Ein komin. Hver ætli sé næst?', audio: 'k1_mosi_next' },
  },
  // The camera shows this shot while the start button waits: the sunrise over the clearing.
  startShot: 'dawn',
  // The glade is built once the start button shows, a slice at a time (main.js: prepareLater), and kept, hidden (engine/locations.js:
  // prepare), so the change of place in scene 6 is only its two fades. Two forests stay resident from then on, as they did from scene 7 before: 31.5 MB more geometry and 32 MB
  // more JS heap, the textures under 40 MB (measured 2026-10-17).
  prepare: ['burknalaut'],

  /**
   * What the chapter draws once where nobody sees a frame stall (engine/warm-up.js): behind the start button, and again under the
   * black as it comes to a place. The first draw of anything builds its shaders, which held the first play up for 0.2 to 0.6 s
   * wherever something showed for the first time. `objects` are drawn in every view whatever their state: the actors (their
   * eyelids as if shut, Mosi's saddle before it pops on, Kambeðla with her plate glow, out of sight in the clearing) and
   * throwaways of what comes later: a glow flower glimmering, one of each critter and a bird, a print of Mosi's feet, a sparkle
   * burst and a puff of pollen. `shots` are the views whose shadow passes draw what the story's do (the forest's casters as the
   * camera rises with the float, the ride's critters); a place adds its own (locations[name].warmUp). `tray` is the tray's
   * pockets, which main.js builds once. dispose() takes the throwaways away again. The mouths need nothing: a jaw only turns.
   */
  warmUp(world) {
    const mosi = world.actors.get('mosi');
    const ground = (x, z) => [x, world.heightAt(x, z), z];
    const flower = createGlowFlower(world, { name: 'warm-up', position: ground(0, 0) });
    const critters = createCritters(world, {
      spots: ['frog', 'snail', 'beetle'].map((kind, i) => ({ name: `warm-up-${kind}`, kind, position: ground(i, 1), heading: 0 })),
      birds: [{ name: 'warm-up-bird', position: ground(0, 2), heading: 0 }],
    });
    const prints = createFootprints(world, { actor: mosi, feet: MOSI_FEET });
    prints.mesh.count = 1; // one print: an instanced mesh with none draws nothing, and builds nothing
    const bursts = [
      sparkleBurst(world, new THREE.Vector3(...ground(0, 0)), { count: 4, seed: 'warm-up' }),
      pollenBurst(world, new THREE.Vector3(...ground(0, 0)), { count: 4, seed: 'warm-up' }),
    ];
    return {
      objects: [...[...world.actors.values()].map(actor => actor.root), flower.group, critters.group, prints.mesh],
      shots: ['dawn', 'egillWaves', 'mountHigh', 'rideFeet'],
      tray: TRAY,
      dispose() {
        flower.dispose();
        critters.dispose();
        prints.dispose();
        for (const burst of bursts) burst.cancel();
      },
    };
  },
  shots: {}, // every shot belongs to a place: chapter.locations[name].shots

  // The script: a generator that yields what it waits for (remake/engine/scene/scheduler.js).
  *script(s) {
    const mosi = s.actor('mosi');
    const egill = s.actor('egill');
    const kambedla = s.actor('kambedla');
    const world = mosi.raw.world;
    world.chapterTimeline = [];
    egill.raw.footprintScale = EGILL_FOOTPRINT;
    const c = { s, world, mosi, egill, kambedla, talking: false };
    // Mosi waits out of sight on the path until scene 2; Kambeðla is in her glade, not in the clearing.
    mosi.raw.root.visible = false;
    kambedla.raw.root.visible = false;
    c.saddle = createSaddle(mosi.raw); // hidden until it pops on in scene 5
    c.glow = world.effects.add(addPlateGlow(kambedla.raw)); // her plates are grey until the flowers light them
    c.rjodur = setUpClearing(s, c);
    yield s.camera.cut('dawn');
    yield s.ready(); // the start button; immediate in captures
    s.sfx('forest');
    const steps = s.after(0, () => footfalls(s, c));
    yield* story(s, c);
    steps.cancel();
  },
};
