// Chapter 2: Boð til Þórseðlu (an invitation for Þórseðla). Scenes 1 to 8 of the approved script
// (docs/superpowers/specs/2026-10-21-kafli-2-bod-til-thorsedlu-design.md): from Kambeðla's fern glade Mosi and Egill ride out of
// the forest and down into the Fen, count Þórseðla's ten water-filled footprints, lure her nine-metre head down with five red
// berries, invite her to the Star Festival, ride her neck up to look out over the Fen and find three far friends for the book's
// map, slide down her neck into the saddle, and win the second star. Seven to nine minutes for a six-year-old, who can never fail
// it: every wait for the child has hints where the script gives them and ends by itself.
//
// The chapter's skeleton (the plan's first task) gives its places, actors, cast, lines and look, and the eight scenes in their
// order; the trail and the Fen have their own ground, plants, water, mist and shots (the second task: world/forest/ grows them as
// the Fen biome). Þórseðla is alive in the Fen, and the pieces of her part (the third task) are in kafli2-thorsedla.js:
// thorsedlaLife, headDown, liftUp and slideDown, wired into scenes 3 to 7 here so that the chapter plays through by itself; the
// footprints, the Fen's animals, the berries and the basket (the fourth task: world/props/mud-prints.js, berries.js, basket.js and
// world/critters/) are scenes 1 to 5 here, and the far friends, the map and the star (the fifth) come into scenes 6 to 8. This file
// keeps the places, the lines and the scenes.
//
// Three places (engine/locations.js), in metres at real size (STYLE.md section 3): Mosi 8.5 m nose to tail, Kambeðla 7 m,
// Þórseðla 22 m with her head 8.3 to 9 m up, Egill 1.1 m tall. Headings are degrees, 0 facing +X and 90 facing +Z. The late
// morning sun (engine/looks.js: lateMorning) comes from heading 150 at 26 degrees, a little lower than chapter 1's.
//   burknalaut  Kambeðla's fern glade, chapter 1's own (its layout and its shots, so it grows as the child left it), where chapter 1
//               ended: Mosi on its north-east side facing her across it, Egill in the saddle on his back, her plates alight.
//   fenjaslod   the trail out of the forest and down into the Fen, with Þórseðla's ten footprints in the mud.
//   fen         the Fen: pools, a slow channel, hummocks and swamp trees, Þórseðla standing in the shallow water.
// Actors are global: Þórseðla is hidden until the Fen, and each place puts the actors where they stand.
import { chapter as kafli1 } from './kafli1.js';
import * as THREE from 'three';
import { createSaddle, ride, floatDown } from '../engine/riding.js';
import { holdWithHands } from '../engine/hand-hold.js';
import { createCritters } from '../world/critters/critters.js';
import { createMudPrints } from '../world/props/mud-prints.js';
import { createBerryBushes } from '../world/props/berries.js';
import { createBasket } from '../world/props/basket.js';
import { sparkleTrail } from '../world/props/sparkles.js';
import { ringsFor } from '../engine/neck-ride.js';
import { addPlateGlow } from '../engine/plate-glow.js';
import {
  thorsedlaLife, headDown, liftUp, slideDown, leafWarm, downToMosi, mouthOf, faceInView, LOOKOUT_HEAD, HEAD_DOWN_CAMERA, LIFT_CAMERA, LOOKOUT_CAMERA,
  MOSI_HEAD,
} from './kafli2-thorsedla.js';

export { LOOKOUT_HEAD }; // where Egill's head is at the top of the lift (kafli2-thorsedla.js)

// ---------------------------------------------------------------------------------------------
// Burknalautin, the fern glade: chapter 1's

const GLADE = kafli1.locations.burknalaut;
const MOSI_GLADE = GLADE.layout.actors.mosi; // facing Kambeðla across the glade, as chapter 1 ends
const KAMBEDLA_GLADE = GLADE.layout.actors.kambedla;
// Where an actor waits who is in none of the places yet: far outside every forest, and hidden.
const OFF_STAGE = [0, 0, -400];
// Egill's footprint in the grass and the ferns is a boy's, as in chapter 1 (world/forest/forest.js: footprintScale).
const EGILL_FOOTPRINT = 0.3;

// Scene 1: out of the glade the way they came, up the path to the north-east (chapter 1's), and a tap on Kambeðla's middle.
const GLADE_EXIT = [[6.6, -6.2], [10.5, -8.7], [15, -10.5]];
const KAMBEDLA_TAP = 'kambedla';

const GLADE_SHOTS = {
  // Scene 1: the two of them and Kambeðla across the glade, her plates alight, Egill in the saddle on Mosi's back; from the side
  // the sun lights them both from, as chapter 1's invitation is.
  glade_leaving: { position: [7.8, 1.4, 7.4], target: [0.2, 2.2, 0.0], fov: 54 },
};

// ---------------------------------------------------------------------------------------------
// Fenjaslóðin, the trail: out of the forest and down into the Fen. North is -Z, east +X; the late morning sun stands in the
// west-south-west. The path runs from the glade's side in the north-west down to the Fen in the south-east; from its middle on
// the forest turns into fen over ten metres (world/forest/biome.js: blend), so the walk reads as one walk, not a cut, and the
// ground falls gently toward the Fen. Low mist lies over the fen half. Task 4 lays Þórseðla's ten prints in the mud of the path.

const TRAIL_PATH = [[-46, -30], [-26, -17], [-12, -8], [0, 0], [12, 7], [26, 14], [46, 24]];
const TRAIL_DIR = [0.83, 0.55]; // the way down the trail, toward the Fen (unit)
const TRAIL_DROP = 0.05; // m the ground falls each metre down the trail

/** Where a path is halfway along it, and the points `width` metres before and after that along it: the blend's ends. */
function blendAcross(path, width) {
  const legs = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  let left = legs.reduce((a, b) => a + b, 0) / 2;
  let i = 0;
  while (left > legs[i]) left -= legs[i++];
  const [ax, az] = path[i], [bx, bz] = path[i + 1];
  const dx = (bx - ax) / legs[i], dz = (bz - az) / legs[i];
  const mx = ax + dx * left, mz = az + dz * left;
  return { from: [mx - (dx * width) / 2, mz - (dz * width) / 2], to: [mx + (dx * width) / 2, mz + (dz * width) / 2] };
}

// Þórseðla's ten footprints down the fen half of the trail, the way she walked to the Fen: a 22 m sauropod's walk scaled down to
// read on a tablet (her real stride, one foot to the same foot again, is about 4 m; here it is 4.6), her hind feet in turn, left
// and right, PRINT_PACE m along the path apart and PRINT_GAUGE m either side of its middle, each toe turned a little out, as a
// sauropod's were. The first is 4 m past the middle of the blend, where the trail is all fen; the ten end 21 m on, in the mist.
const PRINT_FROM = 57.5; // m along the path to the first print
const PRINT_PACE = 2.3; // m along the path from one print to the next
const PRINT_GAUGE = 0.3; // m from the middle of the path to the middle of a print
const PRINT_TURN = 8; // degrees a print's toes turn out
/** Where a path is `s` metres along it, and its way there (unit). */
function pathAt(path, s) {
  let i = 0;
  for (; i < path.length - 2; i++) {
    const leg = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    if (s <= leg) break;
    s -= leg;
  }
  const [ax, az] = path[i], [bx, bz] = path[i + 1];
  const leg = Math.hypot(bx - ax, bz - az);
  return { x: ax + ((bx - ax) * s) / leg, z: az + ((bz - az) * s) / leg, dx: (bx - ax) / leg, dz: (bz - az) / leg };
}
/** The prints: the first is her right foot's, on the south-west side of the path (the camera's), and so on in turn. */
function printsAlong(path) {
  return Array.from({ length: 10 }, (_, k) => {
    const p = pathAt(path, PRINT_FROM + PRINT_PACE * k);
    const right = k % 2 === 0 ? 1 : -1; // her right foot on the right of the way down: (-dz, dx)
    const heading = (Math.atan2(p.dz, p.dx) * 180) / Math.PI + right * PRINT_TURN;
    return { position: [p.x - p.dz * PRINT_GAUGE * right, p.z + p.dx * PRINT_GAUGE * right], heading };
  });
}
const TRAIL_PRINTS = printsAlong(TRAIL_PATH);

// Scene 2. Mosi rides Egill down from the forest half (RIDE_FROM m along the path) to the first print, then waits beside each print
// in turn on its north-east side (the left of the way down), his head over it: MOSI_BACK m back along the path from it and MOSI_SIDE
// m out, clear of the path, so his feet are never in her prints. The camera stands across the path from him, low, with the print
// near it and Mosi with Egill on his back beyond (printShot: PRINT_SHOT, metres along the path from the print, out from its middle
// and up from the ground).
const RIDE_FROM = 44;
const MOSI_BACK = 3.2;
const MOSI_SIDE = 1.9;
const RIDE_POINTS = [49, 52].map((s, i) => {
  const p = pathAt(TRAIL_PATH, s);
  const out = [0.6, 1.4][i];
  return [p.x + p.dz * out, p.z - p.dx * out];
});
const TRAIL_ON = [82, 88].map(s => { const p = pathAt(TRAIL_PATH, s); return [p.x + p.dz * MOSI_SIDE, p.z - p.dx * MOSI_SIDE]; });
// The ride's camera: behind Mosi on his right, a little above Egill, looking past Mosi's head down the trail.
const RIDE_CAMERA = { offset: [-6.2, 3.0, 2.8], local: true, look: 'head', lookOffset: [1.6, -1.0, 1.1], stiffness: 1.4, fov: 50 };
const PRINT_SHOT = { along: 3.6, out: 3.2, up: 1.6, aimAlong: -1.2, aimIn: 1.4, aimUp: 0.85, fov: 56 };
// The ten ahead, as Mosi says what they are: from beside the path behind the first, a little high, down the trail into the mist.
const PRINTS_AHEAD = { along: -7, out: 2.7, up: 2.8, aimAlong: 8, aimIn: 0.5, aimUp: 0, fov: 44 };
const PRINT_ON = 1.0; // s after a count before Mosi and the camera go on to the next: the number is up first
// Seconds the child may be idle before the hint, and before Egill taps the print himself; the quick ones once he has.
const PRINT_WAIT = { hint: 8, help: 16, quickHint: 4, quickHelp: 8 };
const NOD_DIP = { x: 0, y: -0.6, z: 0 };
// The animals that live in four of her prints (critters.js), each where it lives in its print (metres along it from its middle and
// to its right; on its floor, in the water, on its water) and which way it faces from the print's own way: a frog in the third,
// which hops out onto the middle of the path; a diving beetle swimming round in the sixth; a water strider on the ninth's water,
// which shoots off toward the toes; and a salamander in the tenth, which crawls out over the toes and back.
const PRINT_ANIMALS = [
  { print: 2, kind: 'frog', name: 'print-frog', along: -0.02, across: 0.12, on: 'floor', turn: -90 },
  { print: 5, kind: 'waterBeetle', name: 'print-beetle', along: -0.05, across: 0, on: 'water', turn: 0 },
  { print: 8, kind: 'waterStrider', name: 'print-strider', along: -0.1, across: 0, on: 'water', turn: 0 },
  { print: 9, kind: 'salamander', name: 'print-salamander', along: -0.12, across: 0.02, on: 'floor', turn: 0 },
];
const ANIMAL_SIZE = 1.5; // the animals in her prints are drawn this much larger than life, so a child sees them from the camera

const TRAIL_SHOTS = {
  trail_wide: { position: [-18.5, 2.85, -11.5], target: [5, 1.1, 4], fov: 50 },
  trail_follow: { position: [8.5, 1.2, 6.5], target: [-3, 1.6, -1], fov: 46 },
  print_close: { position: [2.2, 0.68, 3.9], target: [7.5, -0.34, 4.8], fov: 50 },
  trail_fog: { position: [6, 1.1, 1.5], target: [18, 0.2, 13], fov: 48 },
  trail_portrait: { position: [6.5, 0.95, 6.8], target: [-1, 2.4, -1], fov: 36 },
  trail_end: { position: [24, 0.35, 9], target: [4, 1.6, 1.5], fov: 48 },
};

// ---------------------------------------------------------------------------------------------
// Fenið, the Fen: open water and golden reed with groves of swamp conifers, at real size. Þórseðla stands in the shallow pool p1
// facing east, toward the two swamp conifers she bites the tops of; when her head comes down (lowerHead) it reaches the bank
// where Egill holds up the berries. Mosi stands on a dry hummock south of her head, with the pool p4 behind him, and the berry
// hummocks are east of him. The channel winds from the north-west out to the far treeline in the south-east, north of her
// pool. The three far friends (Task 5) are only places here, out in the open fen where the lookout on her head sees them.

// Þórseðla: where she stands (her root, between her four feet) and points along her 22 m from her tail to where her head comes down.
const THORSEDLA = { position: [-2, 0, -9], heading: 0 };
const MOSI_FEN = { position: [8, 0, -3.5], heading: -125 }; // on his dry hummock, facing her head
// Egill meets her face on the hummock under her two conifers, a step in front of where it comes down (her lowered head reaches x
// 6.0 to 7.3 m, along her middle): the planner and the mist keep this spot clear, and the scenes bring him here before headDown.
const EGILL_FEN = { position: [7.8, 0, -9.0], heading: 180 };
const alongHer = metres => {
  const h = (THORSEDLA.heading * Math.PI) / 180;
  return { position: [THORSEDLA.position[0] + Math.cos(h) * metres, 0, THORSEDLA.position[2] + Math.sin(h) * metres] };
};

const FEN_WATER = {
  pools: [
    { center: [-3.5, -9], radius: 7, depth: 0.6 }, // p1: Þórseðla's pool, deep enough to cover her feet past the ankles
    { center: [-15, 7], radius: 6, depth: 0.35 }, // p2: south-west, toward the sun
    { center: [-27, -9], radius: 5.5, depth: 0.35 }, // p3: west
    { center: [10, 9], radius: 4.5, depth: 0.35 }, // p4: behind Mosi, seen past him from the north-west
    { center: [-70, -38], radius: 7, depth: 0.35 }, // p5: far out, where Slóeðla wades (Task 5)
  ],
  channel: {
    line: [[-150, -105], [-95, -70], [-58, -48], [-34, -30], [-16, -20], [-8, -15.5], [4, -17], [22, -14], [32, 2], [44, 22], [66, 42], [100, 62], [150, 96]],
    width: 4, depth: 0.5,
  },
};

// The marsh berry bushes (world/props/berries.js), on the berry hummocks east of Egill's, clear of the Fen's plants and its water:
// the big red one and the one nearer the water on the south hummock, a red one on the north hummock among the reed, and the
// blue one (the birds') between them, where the child sees it first. `facing` is the side their berries hang on: toward where the
// child looks from, behind Egill on the bank (EGILL_PICKS).
const BERRY_BUSHES = [
  { position: [16.5, -10.2], kind: 'red', count: 2, facing: 175 },
  { position: [18.3, -12.3], kind: 'red', count: 2, facing: 165 },
  { position: [16.4, -5.4], kind: 'red', count: 1, facing: 200 },
  { position: [15.0, -7.8], kind: 'blue', count: 3, facing: 185 },
];

// Scenes 3 to 5. Mosi comes into the Fen from the trail's end (FEN_ENTRY) along its path to his hummock while the camera rises over
// the Fen (REVEAL_SECONDS: the move needs 12 s at the director's limits). Egill floats down to the bank on Mosi's right to call
// up to her (EGILL_CALLS, facing her head), goes to the berry hummocks (EGILL_PICKS, facing the bushes), and then to where her face
// comes down (EGILL_FEN), always on dry ground.
const FEN_ENTRY = { position: [21, 0, 10], heading: -136.6 };
const FEN_ARRIVAL = [[16, 5.4], [12, 1.5], [9.4, -1.8], [MOSI_FEN.position[0], MOSI_FEN.position[2]]];
const REVEAL_SECONDS = 12.5;
const EGILL_CALLS = { position: [11.2, 0, -4.6], heading: -130 };
const EGILL_PICKS = { position: [12.4, 0, -8.4], heading: 0 };
const EGILL_PICKS_WAY = [[11.6, -6.6], [EGILL_PICKS.position[0], EGILL_PICKS.position[2]]];
const EGILL_FEN_WAY = [[10.4, -8.7], [EGILL_FEN.position[0], EGILL_FEN.position[2]]];
const HER_HEAD = { actor: 'thorsedla', part: 'head' };
const HER_MIDDLE = 'thorsedla';
const EGILL_HEAD = 'egill.head';
const TAIL_BONES = ['Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7'];
// The child drags the basket up to over Egill's head, or taps him (scene 4).
const OVER_EGILL = { actor: 'egill', part: 'head', offset: [0.15, 0.45, 0], local: true };
// The berry search: the free look's limits round the view behind Egill (fen_pick), and Mosi's three hints, one after another.
const PICK_LOOK = { yaw: [-45, 45], pitch: [-12, 16] };
const BERRY_HINTS = ['k2_mosi_hint_berry1', 'k2_mosi_hint_berry2', 'k2_mosi_hint_berry3'];
// The Fen's own animals (critters.js), where the child sees them: the early bird in the reed on the west shore of p4, where the
// camera's rise over the Fen starts, and flies up as it pans; and by the berry hummocks a dragonfly hanging in the air, a turtle on
// the bank of the channel, and a fish in the channel. `up` is metres above the ground, or the water (`water`).
const FEN_CRITTERS = [
  { name: 'fen-bird', kind: 'earlyBird', at: [5.4, 8.0], up: 0, heading: 150 },
  { name: 'fen-dragonfly', kind: 'dragonfly', at: [14.4, -11.4], up: 0.9, heading: 200 },
  { name: 'fen-turtle', kind: 'turtle', at: [17.0, -13.4], up: 0, heading: -100 },
  { name: 'fen-fish', kind: 'fish', at: [16.5, -15.4], up: 0, water: true, heading: 10 },
];

const FEN_SHOTS = {
  // Scene 3: the trail ends on Mosi's hummock; the camera rises over him and pans right across the Fen, the pools glittering
  // toward the sun, and ends with Þórseðla far right, in the water at her real size (a move from the first to the second).
  fen_reveal: { position: [13, 1.6, 9.5], target: [-14, 1.5, 15.5], fov: 46 },
  fen_reveal_end: { position: [6, 3.8, 13], target: [-3.6, 2.6, -9], fov: 44 },
  // From below: her feet in the water like trunks, her head up in the swamp conifers.
  fen_thorsedla_low: { position: [-2.5, 0.45, 0.2], target: [1.5, 3.4, -9.5], fov: 56 },
  // Scene 5: her head down by Egill, Mosi beside them, the pool p4 behind Mosi.
  fen_two_shot: { position: [0, 1.4, 1.5], target: [5, 1.3, -8], fov: 46 },
  // Kept for the planting (Task 2 planned the Fen round it: changing it re-deals plants), unused; use fen_shoulder.
  fen_head_down: { position: [7.8, 1.25, -8.2], target: [3.6, 1.6, -9.2], fov: 40 },
  // Scene 4, as her head comes down: over Egill's right shoulder, from behind him on the hummock between her two conifers, looking up
  // to where her face comes down: where the camera that follows him then (HEAD_DOWN_CAMERA) stands, wherever he stands, so that it
  // takes over without a move.
  fen_shoulder: {
    position: { actor: 'egill', part: 'feet', offset: HEAD_DOWN_CAMERA.offset, local: true },
    target: { actor: 'egill', part: 'feet', offset: [2.2, 2.2, 0], local: true }, fov: HEAD_DOWN_CAMERA.fov,
  },
  // Scene 6: as the lift begins, where the camera that rides up with Egill on her head (LIFT_CAMERA) stands then, at his right.
  fen_lift: { position: { actor: 'egill', part: 'feet', offset: LIFT_CAMERA.offset, local: true }, target: 'egill.head', fov: LIFT_CAMERA.fov },
  // Scene 4: the berry hummocks east of Mosi (kept for the planting; the search looks from behind Egill: fen_pick).
  fen_berries: { position: [13, 1.45, -14.5], target: [16.5, 0.6, -4], fov: 50 },
  // Scene 3: Egill on the bank calling up to her, in profile from his right, Mosi behind him (a shot on him, as the planter skips).
  fen_call: {
    position: { actor: 'egill', part: 'feet', offset: [0.4, 0.95, 2.7], local: true },
    target: { actor: 'egill', part: 'feet', offset: [0.5, 1.45, -0.6], local: true }, fov: 44,
  },
  // Scene 4: the berry search, from behind Egill on the bank, over the berry hummocks (the free look turns from here).
  fen_pick: {
    position: { actor: 'egill', part: 'feet', offset: [-2.5, 1.5, -1.0], local: true },
    target: { actor: 'egill', part: 'feet', offset: [5.5, 0.1, 0.4], local: true }, fov: 50,
  },
  // Scene 6: Egill by her lowered head, about to climb on.
  fen_lift_start: { position: [1.5, 1.35, -1.5], target: [4.6, 1.4, -8.6], fov: 40 },
  // Scene 7: the slide ends in the saddle on Mosi, by his hummock.
  fen_slide_end: { position: [5, 3.2, 6], target: [7.6, 2.6, -3.5], fov: 46 },
  // Scene 7: from the south-east, (13, 2.2, 5) to (3.4, 4.1, -6.2), her neck bent down like a slide from her head to her withers and
  // Mosi on the bank beside them (MOSI_CATCHES), where the slide ends in his saddle: one shot from the top of the slide to Egill in
  // the saddle. Put as points on her (she does not move), as the shots on Egill are: a still shot of its own would re-deal some 70
  // of the Fen's plants (plan.js protects still shots' sight lines), and the static shots above are kept as Task 2 planned them for
  // the same reason (the head coming down and the slide use the cameras here instead).
  fen_slide: {
    position: { actor: 'thorsedla', part: 'feet', offset: [15, 2.86, 14], local: true },
    target: { actor: 'thorsedla', part: 'feet', offset: [5.4, 4.76, 2.8], local: true }, fov: 32,
  },
  // Scene 8: the two of them with Egill between, the pools glittering behind.
  fen_star: { position: [14, 1.3, 4], target: [2, 4.2, -6], fov: 52 },
  // Low across the west shore of her pool: reed, lilies and the water's edge near, her legs in the water behind.
  fen_shore: { position: [-16, 1.2, -16], target: [-4, 1.6, -8.5], fov: 50 },
  // For a tall screen: her neck rising into the conifers, Mosi and Egill small below.
  fen_portrait: { position: [0.5, 1.0, 2.5], target: [5, 3.6, -8.5], fov: 32 },
};

// ---------------------------------------------------------------------------------------------
// The lines: every line the script says, each read from its own recording in the kafli2 set
// (remake/assets/audio/kafli2/lines-source.json and lines.json), with the words it is recorded with.

const WORDS = {
  // 1. Leaving the glade
  k2_mosi_next: 'Næst er það Þórseðla, stærsti vinur minn. Hún er svo há að hún bítur trjátoppana!',
  k2_egill_bigger: 'Stærri en þú?',
  k2_mosi_muchbigger: 'Miklu stærri. Þú sérð!',
  k2_kambedla_bye: 'Góða ferð!',
  // 2. The footprints in the mud, counted one to ten (the berries in scene 4 count with the first five)
  k2_mosi_prints: 'Sjáðu! Fótspor Þórseðlu. Þau eru risastór!',
  k2_mosi_count: 'Teljum þau!',
  k2_mosi_1: 'Eitt!',
  k2_mosi_2: 'Tvö!',
  k2_mosi_3: 'Þrjú!',
  k2_mosi_4: 'Fjögur!',
  k2_mosi_5: 'Fimm!',
  k2_mosi_6: 'Sex!',
  k2_mosi_7: 'Sjö!',
  k2_mosi_8: 'Átta!',
  k2_mosi_9: 'Níu!',
  k2_mosi_10: 'Tíu!',
  k2_mosi_tenprints: 'Tíu fótspor! Hún hlýtur að vera rétt hjá.',
  k2_mosi_hint_print: 'Hvað með næsta spor? Pikkaðu á það!',
  k2_mosi_nextprint: 'Næsta er þarna!',
  // 3. The Fen
  k2_mosi_there: 'Þarna er hún! Þórseðla! Halló!',
  k2_egill_hello: 'Halló! Hérna niðri!',
  k2_mosi_canthear: 'Hún heyrir ekki svona langt niður. En ég veit hvað hún elskar…',
  // 4. The lure
  k2_mosi_berries: 'Rauðu berin! Tíndu fimm handa henni.',
  k2_mosi_blue: 'Nei, bláu berin eru fyrir fuglana. Þau rauðu!',
  k2_mosi_hint_berry1: 'Ég sé rauð ber við stóra runnann!',
  k2_mosi_hint_berry2: 'Kíktu nær vatninu!',
  k2_mosi_hint_berry3: 'Þarna, undir laufinu!',
  k2_mosi_raise: 'Réttu þau upp, Egill! Hátt!',
  k2_thorsedla_mmm: 'Mmm… rauðber!',
  k2_thorsedla_who: 'Ó! Mosi! Og hver ert þú, litli vinur?',
  k2_egill_name: 'Ég heiti Egill!',
  k2_thorsedla_thanks: 'Egill. Takk fyrir berin.',
  // 5. The invitation, and the choice
  k2_mosi_invite: 'Þórseðla, viltu koma á Stjörnuhátíðina í kvöld?',
  k2_thorsedla_accept: 'Stjörnuhátíð! Já, ég kem. Ég er hæst af öllum, svo ég sé fyrstu stjörnuna á undan ykkur og segi ykkur frá henni.',
  k2_thorsedla_see: 'Egill… viltu sjá hvað ég sé héðan að ofan?',
  k2_egill_yes: 'Já!',
  k2_egill_high: 'Er það hátt?',
  k2_thorsedla_high: 'Mjög hátt. En ég held á þér.',
  // 6. The lookout: the friends far away, a hint for each (in the order Slóeðla, Flugeðla, Uggeðla) and a line as each is found
  k2_egill_tiny: 'Vá… Mosi er pínulítill!',
  k2_mosi_notsmall: 'Ég er ekki lítill, ég er langt í burtu!',
  k2_thorsedla_look: 'Horfðu vel, Egill. Sérðu vinina okkar?',
  k2_mosi_hint_far1: 'Ég sé eitthvað glitra úti í tjörninni!',
  k2_mosi_hint_far2: 'Kíktu á gamla hvíta tréð!',
  k2_mosi_hint_far3: 'Hvað glitrar þarna í sefinu?',
  k2_mosi_found_sloedla: 'Slóeðla! Hún er að vaða í tjörninni!',
  k2_mosi_found_flugedla: 'Flugeðla! Uppi á gamla trénu!',
  k2_mosi_found_uggedla: 'Uggeðla! Hún liggur í sefinu, sjáðu seglið!',
  k2_thorsedla_now: 'Nú veistu hvar þau eru. Við skrifum það í bókina.',
  // 7. The slide, into the saddle with an "úff" from Mosi
  k2_egill_wuuu: 'Vúúú!',
  k2_mosi_oof: 'Úff!',
  k2_thorsedla_comeback: 'Komdu aftur hvenær sem þú vilt, Egill.',
  // 8. The star
  k2_mosi_second: 'Sjáðu, Egill! Önnur stjarnan!',
  k2_mosi_two: 'Tvær komnar. Og nú vitum við hvert við förum næst!',
  // The book's map: a tap on the marker of a place found or done, and Mosi says its name and one sentence (an empty slot is silent)
  k2_mosi_map_fen: 'Fenið! Þar eru tjarnir, sef og froskar.',
  k2_mosi_map_kambedla: 'Kambeðla! Plöturnar hennar lýsa eins og ljósker.',
  k2_mosi_map_thorsedla: 'Þórseðla! Hún er hæst af öllum vinum mínum.',
  k2_mosi_map_sloedla: 'Slóeðla! Henni finnst gott að vaða í vatninu.',
  k2_mosi_map_flugedla: 'Flugeðla! Hún situr hátt uppi á gamla trénu.',
  k2_mosi_map_uggedla: 'Uggeðla! Hún felur sig í sefinu, en seglið sést alltaf.',
};

// ---------------------------------------------------------------------------------------------
// The scenes, in turn. `c` holds the cast and what the scenes share.

function* story(s, c) {
  yield* leaving(s, c);
  yield* footprints(s, c);
  yield* theFen(s, c);
  yield* theLure(s, c);
  yield* theInvitation(s, c);
  yield* theLookout(s, c);
  yield* theSlide(s, c);
  yield* theStar(s, c);
}

// 1. Leaving the glade: Mosi says who is next, Kambeðla's plates blink goodbye (a tap on her: "Góða ferð!"), and they go.
function* leaving(s, c) {
  mark(c, 1);
  const { mosi, egill, kambedla } = c;
  s.target('kambedla', { point: KAMBEDLA_TAP, radius: 1.6 });
  let bye = null;
  const unhear = s.onTap('kambedla', () => { bye ??= s.after(0, () => goodbye(s, c)); });
  yield mosi.lookAt('kambedla.head', { weight: 0.7 });
  yield egill.lookAt('kambedla.head', { weight: 0.7, maxPitch: 40 });
  yield kambedla.lookAt('mosi.head', { weight: 0.6 });
  yield* say(s, c, 'mosi', 'k2_mosi_next');
  yield egill.lookAt('mosi.head', { weight: 0.6, maxPitch: 30 });
  yield* say(s, c, 'egill', 'k2_egill_bigger');
  yield* say(s, c, 'mosi', 'k2_mosi_muchbigger');
  // They go: Mosi turns to the path out of the glade, her plates blink goodbye, and the camera pans after them.
  yield mosi.lookAt(null);
  yield egill.lookAt(null);
  const going = mosi.walkTo(GLADE_EXIT, { speed: 1.0, turnRate: 55 });
  s.after(0.4, () => blinkGoodbye(s, c));
  yield s.wait(1.2);
  s.camera.lookAt('mosi.head', { duration: 6 });
  yield s.wait(5.5);
  s.target('kambedla', null);
  unhear();
  if (bye) yield bye; // her goodbye is said before the fade
  c.leavingWalk = going;
}

/** Kambeðla's goodbye, from a tap on her: her plates blink and she says it, when no one else is speaking. */
function* goodbye(s, c) {
  s.after(0, () => blinkGoodbye(s, c));
  yield s.until(() => !c.saying);
  yield* say(s, c, 'kambedla', 'k2_kambedla_bye');
}

/** Her plates blink twice, all at once: goodbye. */
function* blinkGoodbye(s, c) {
  for (let i = 0; i < 2; i++) {
    yield c.glow.setAll(0.15, { duration: 0.22 });
    yield c.glow.setAll(1, { duration: 0.3 });
    yield s.wait(0.15);
  }
}

// 2. The footprints in the mud: down out of the forest into the mist, and the child counts Þórseðla's ten prints, one to ten.
function* footprints(s, c) {
  mark(c, 2);
  const { mosi, egill } = c;
  yield* goTo(s, c, 'fenjaslod', () => arriveOnTheTrail(s, c));
  // The ride down: the forest turns to fen, the prints come into view in the mud ahead, and Mosi stops by the first.
  const first = mosiAt(0);
  const ride = mosi.walkTo([...RIDE_POINTS, [first.x, first.z]], { speed: 1.1 });
  s.camera.follow('mosi', RIDE_CAMERA);
  yield s.wait(7);
  yield ride;
  // all ten down the trail ahead, into the mist
  yield s.camera.cut(shotAlong(c, 'prints ahead', 0, PRINTS_AHEAD));
  yield mosi.lookAt(c.prints.targets[0].point, { weight: 0.8, maxPitch: 40 });
  yield* say(s, c, 'mosi', 'k2_mosi_prints');
  yield mosi.turnTo(first.heading, { rate: 40 });
  yield s.camera.cut(printShot(c, 0));
  c.focus = 0; // the print the camera looks at, as it follows Mosi from print to print
  s.camera.follow('mosi', printFollow(c));
  yield egill.lookAt(c.prints.targets[0].point, { weight: 0.7, maxPitch: 45 });
  yield* say(s, c, 'mosi', 'k2_mosi_count');
  // Every print is a target from now on; the next to count glimmers. A tap on the next splashes, its number rises out of the water
  // and Mosi says it; a tap on another splashes and Mosi nods to the right one.
  const names = c.prints.targets.map(t => t.name);
  for (const t of c.prints.targets) s.target(t.name, t);
  const unhear = names.map(name => s.onTap(name, tap => { c.lastTap = tap; }));
  let quick = false;
  let walking = null;
  for (let k = 0; k < names.length; k++) {
    c.prints.glimmer(k);
    c.lastTap = null;
    const by = yield* waitForPrint(s, c, k, quick);
    quick = by === 'egill';
    c.prints.glimmer(null);
    const counting = countPrint(s, c, k, by);
    if (k < names.length - 1) {
      // on to the next once the number is up: Mosi to his place beside it, the camera following him and turning to it
      const next = mosiAt(k + 1);
      walking = s.after(PRINT_ON, () => { c.focus = k + 1; return mosi.walkTo([next.x, next.z], { speed: 0.95 }); });
      s.after(PRINT_ON + 0.3, () => mosi.lookAt(c.prints.targets[k + 1].point, { weight: 0.8, maxPitch: 40 }));
      s.after(PRINT_ON + 0.5, () => egill.lookAt(c.prints.targets[k + 1].point, { weight: 0.7, maxPitch: 45 }));
    }
    yield counting;
  }
  for (const name of names) s.target(name, null);
  for (const stop of unhear) stop();
  if (walking) yield walking;
  yield mosi.lookAt(null);
  yield egill.lookAt(null);
  yield* say(s, c, 'mosi', 'k2_mosi_tenprints');
  // and on down the trail, toward the Fen
  mosi.walkTo(TRAIL_ON, { speed: 1.2 });
  s.camera.follow('mosi', RIDE_CAMERA);
  yield s.wait(3);
}

/** Where Mosi waits by print k: back along the path from it and out on its north-east side, facing down the trail. */
function mosiAt(k) {
  const p = pathAt(TRAIL_PATH, PRINT_FROM + PRINT_PACE * k - MOSI_BACK);
  return { x: p.x + p.dz * MOSI_SIDE, z: p.z - p.dx * MOSI_SIDE, heading: (Math.atan2(p.dz, p.dx) * 180) / Math.PI };
}

/**
 * The camera for print k: a little way on down the trail and across the path from Mosi, low, looking back up it: the print near
 * and big in the lower middle, Mosi beyond it beside the path looking down at it, his face toward us, Egill on his back, and the
 * prints counted already behind them in the mud.
 */
function printShot(c, k) {
  return shotAlong(c, `print ${k + 1}`, k, PRINT_SHOT);
}

/**
 * The same camera as it follows Mosi from print to print (director.follow: smooth, never faster than the style guide's dolly): where
 * print 1's shot stands, in Mosi's own frame as he waits there, and looking where the shot of the print it is on (c.focus) looks.
 */
function printFollow(c) {
  const shot = printShot(c, 0), at = mosiAt(0);
  const h = THREE.MathUtils.degToRad(at.heading);
  const dx = shot.position[0] - at.x, dz = shot.position[2] - at.z;
  const offset = [dx * Math.cos(h) + dz * Math.sin(h), shot.position[1] - c.world.heightAt(at.x, at.z), -dx * Math.sin(h) + dz * Math.cos(h)];
  return { offset, local: true, look: out => out.fromArray(printShot(c, c.focus).target), fov: PRINT_SHOT.fov, stiffness: 1.5 };
}

/** A shot set along the trail from print k (S: metres along the path from it, out from its middle, up from the ground). */
function shotAlong(c, label, k, S) {
  const at = pathAt(TRAIL_PATH, PRINT_FROM + PRINT_PACE * k + S.along);
  const aim = pathAt(TRAIL_PATH, PRINT_FROM + PRINT_PACE * k + S.aimAlong);
  const x = at.x - at.dz * S.out, z = at.z + at.dx * S.out; // across the path from Mosi (its south-west side)
  const tx = aim.x + aim.dz * S.aimIn, tz = aim.z - aim.dx * S.aimIn; // toward Mosi's side
  const ground = c.world.heightAt;
  return { label, position: [x, ground(x, z) + S.up, z], target: [tx, ground(tx, tz) + S.aimUp, tz], fov: S.fov };
}

/**
 * Waits for print k to be counted: a tap on it (the child's), or after a while Egill's. A tap on another print splashes it, and
 * Mosi says the next is there and nods to it. Idle PRINT_WAIT.hint s: the hint; PRINT_WAIT.help s: Egill taps it himself, and the
 * next waits only the quick times, until the child taps again. Resolves 'child' or 'egill'.
 */
function* waitForPrint(s, c, k, quick) {
  const names = c.prints.targets.map(t => t.name);
  const next = names[k];
  const wait = quick ? { hint: PRINT_WAIT.quickHint, help: PRINT_WAIT.quickHelp } : PRINT_WAIT;
  let since = s.time;
  let hinted = false;
  let telling = null;
  for (;;) {
    const left = (hinted ? wait.help : wait.hint) - (s.time - since);
    const tapped = yield s.race(s.tap(names, { auto: next }), s.wait(Math.max(0, left)));
    if (tapped === next) return 'child';
    if (tapped !== undefined) {
      const wrong = names.indexOf(tapped);
      splashPrint(s, c, wrong, 'child');
      nod(s, c, k);
      if (!telling || telling.done) telling = s.after(0, () => say(s, c, 'mosi', 'k2_mosi_nextprint'));
      since = s.time;
      hinted = false;
      continue;
    }
    if (!hinted) {
      hinted = true;
      nod(s, c, k);
      if (!c.saying) s.after(0, () => say(s, c, 'mosi', 'k2_mosi_hint_print'));
      continue;
    }
    yield* egillTaps(s, c, k);
    return 'egill';
  }
}

/** A print splashes (a tap on it), and the animal in it reacts and is found. */
function splashPrint(s, c, k, by) {
  c.printLog.push({ what: 'splash', index: k, at: s.time, by });
  c.prints.splash(k);
  const animal = PRINT_ANIMALS.find(a => a.print === k);
  if (animal) {
    c.printCritters.react(animal.name);
    s.found(animal.kind, by === 'child' ? c.lastTap : null);
  }
}

/** Print k is counted: a splash, its number rising out of the water as Mosi says it, and its water still and gold. A task. */
function countPrint(s, c, k, by) {
  splashPrint(s, c, k, by);
  c.printLog.push({ what: 'count', index: k, at: s.time, by });
  c.prints.count(k);
  s.after(0.5, () => { c.prints.done(k); });
  return s.all(say(s, c, 'mosi', `k2_mosi_${k + 1}`, { hold: 0.35 }), s.wait(1.2));
}

/** Mosi nods toward the next print: his look dips to it and comes back up. */
function nod(s, c, k) {
  const at = c.prints.targets[k].point;
  const low = out => out.copy(at).add(NOD_DIP);
  c.mosi.lookAt(low, { weight: 0.9, maxPitch: 45 });
  s.after(0.45, () => c.mosi.lookAt(at, { weight: 0.8, maxPitch: 40 }));
}

/** Egill taps print k himself: he points at it from the saddle, and glints fly from his hand to it. */
function* egillTaps(s, c, k) {
  const { world, egill } = c;
  const at = c.prints.targets[k].point;
  yield egill.lookAt(at, { weight: 0.85, maxPitch: 50 });
  const shoulder = egill.raw.model.getObjectByName('RightUpperArm');
  const from = new THREE.Vector3();
  const reach = out => {
    shoulder.getWorldPosition(from);
    return out.copy(at).sub(from).normalize().multiplyScalar(0.25).add(from);
  };
  const hand = egill.raw.model.getObjectByName('RightHand');
  const pointing = holdWithHands(world, egill.raw, { right: reach }).grip(0.3);
  yield s.wait(0.35);
  const start = hand.getWorldPosition(new THREE.Vector3());
  let u = 0;
  const glint = new THREE.Vector3();
  sparkleTrail(world, () => { u = Math.min(1, u + 1 / 12); return glint.lerpVectors(start, at, u); }, { duration: 0.4, count: 12, seed: `egill taps ${k}` });
  yield s.wait(0.4);
  s.after(0.5, () => { pointing.release(0.35); });
  s.after(0.9, () => egill.lookAt(null));
}

// 3. The Fen: the new world opens, and Þórseðla stands in it at her real size, too high up to hear them.
function* theFen(s, c) {
  mark(c, 3);
  const { mosi, egill } = c;
  yield* goTo(s, c, 'fen', () => arriveInTheFen(s, c));
  thorsedlaLife(s, c);
  // The trail ends on Mosi's hummock: the camera rises over the Fen and pans across it, the pools glittering, the early bird
  // flying up out of the reed, to Þórseðla in the water at her real size; a tap on her swishes her tail.
  const herTap = s.onTap('thorsedla', () => { tailSwish(s, c); });
  s.target('thorsedla', { point: HER_MIDDLE, radius: 2.6 });
  const arriving = mosi.walkTo(FEN_ARRIVAL, { speed: 1.45 });
  const reveal = s.camera.move('fen_reveal_end', { duration: REVEAL_SECONDS });
  s.after(3.2, () => c.fenCritters.critters.react('fen-bird'));
  yield s.all(reveal, arriving);
  yield mosi.turnTo(MOSI_FEN.heading, { rate: 30 });
  yield mosi.lookAt(HER_HEAD, { weight: 0.8, maxPitch: 45 });
  yield* say(s, c, 'mosi', 'k2_mosi_there');
  // Egill floats down to the bank and calls up to her. Nothing happens: her tail swishes, and she bites the treetop again.
  yield floatDown(egill.raw, c.saddle, [EGILL_CALLS.position[0], EGILL_CALLS.position[2]], { duration: 2.2, heading: EGILL_CALLS.heading });
  c.riding = null;
  yield s.camera.cut('fen_call');
  yield egill.lookAt(HER_HEAD, { weight: 0.9, maxAngle: 60, maxPitch: 55 });
  yield egill.play('wave', { fade: 0.3 });
  yield* say(s, c, 'egill', 'k2_egill_hello');
  yield egill.play('idle', { fade: 0.5 });
  yield s.camera.cut('fen_thorsedla_low');
  yield* tailSwish(s, c);
  yield s.wait(0.6);
  yield s.camera.cut('fen_call');
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.7, maxPitch: 35 });
  yield egill.lookAt(MOSI_HEAD, { weight: 0.7, maxPitch: 45 });
  yield* say(s, c, 'mosi', 'k2_mosi_canthear');
  herTap();
  s.target('thorsedla', null);
}

// 4. The lure: five red berries for her, held up high, and her head comes down to Egill's eyes.
function* theLure(s, c) {
  mark(c, 4);
  const { mosi, egill } = c;
  // The basket comes into Egill's hands, and he goes to the berry bushes on the hummocks.
  c.basket.hold(egill.raw);
  yield egill.lookAt(null);
  const goingOver = egill.walkTo(EGILL_PICKS_WAY, { speed: 0.85 });
  yield* say(s, c, 'mosi', 'k2_mosi_berries');
  yield goingOver;
  yield egill.turnTo(EGILL_PICKS.heading, { rate: 60 });
  yield s.camera.cut('fen_pick');
  yield mosi.lookAt(null);
  // The search: the child looks round the hummocks and taps the red berries; each flies into the basket and Mosi counts it. A blue
  // one: "those are the birds'". Hints at 12, 24 and 36 s; at 48 s Egill picks it himself, and the next sooner.
  c.berries.glimmer(true);
  const blue = c.berries.targets.filter(t => t.kind === 'blue');
  for (const t of blue) s.target(t.name, t);
  let telling = null;
  const unhear = blue.map(t => s.onTap(t.name, () => {
    c.berries.shake(bushOf(t.name));
    if (!telling || telling.done) telling = s.after(0, function* birds() { yield s.until(() => !c.saying); yield* say(s, c, 'mosi', 'k2_mosi_blue'); });
  }));
  let counting = null;
  const red = c.berries.targets.filter(t => t.kind === 'red');
  yield s.search({
    explore: PICK_LOOK,
    targets: red.map(t => ({ name: t.name, point: t.point, radius: t.radius, hint: BERRY_HINTS })),
    quick: { hintAfter: 6, helpAfter: 1 },
    onFound: (name, index, how) => {
      const by = how === 'tapped' ? 'child' : 'egill';
      c.picks.push({ name, by, kind: 'red', at: s.time });
      if (by === 'egill') s.after(0, () => egill.lookAt(c.berries.berry(name).point, { weight: 0.8, maxPitch: 40 }));
      c.berries.shake(bushOf(name));
      const flight = c.berries.pick(name, c.basket.point);
      const before = counting;
      counting = s.after(0, function* count() {
        yield flight;
        yield c.basket.add('red');
        if (before) yield before;
        yield s.until(() => !c.saying);
        yield* say(s, c, 'mosi', `k2_mosi_${index + 1}`, { hold: 0.3 });
      });
      return flight;
    },
  });
  if (counting) yield counting;
  c.berries.glimmer(false);
  for (const t of blue) s.target(t.name, null);
  for (const stop of unhear) stop();
  if (telling && !telling.done) yield telling;
  yield egill.lookAt(null);
  // Five: "Hold them up, Egill! High!" He goes to her two conifers, where her face comes down, and the child drags the basket up
  // (or taps him); after 6 s he holds it up himself.
  yield s.camera.cut('fen_two_shot');
  const toHer = egill.walkTo(EGILL_FEN_WAY, { speed: 0.9 });
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.6, maxPitch: 35 });
  yield* say(s, c, 'mosi', 'k2_mosi_raise');
  yield toHer;
  yield egill.turnTo(EGILL_FEN.heading, { rate: 60 });
  yield mosi.lookAt(HER_HEAD, { weight: 0.7, maxPitch: 45 });
  yield s.camera.cut('fen_shoulder');
  s.tray.show([{ id: 'basket', icon: 'basket' }]);
  const how = yield* tapOrWait(s, 'egill', s.drag('basket', OVER_EGILL, { radius: 170, idle: 6 }));
  s.tray.hide();
  c.raisedBy = how === 'egill' ? 'tap' : how === 'dropped' ? 'drag' : 'idle';
  yield egill.lookAt(HER_HEAD, { weight: 0.8, maxPitch: 45 });
  yield c.basket.raise(egill.raw, { duration: 0.9 });
  // Task 3's: her head comes down out of the trees to his eyes, over his shoulder.
  yield* headDown(s, c);
  c.headDownAt = s.time;
  // She eats the berries out of the basket, chewing: "Mmm… rauðber!"
  const her = c.thorsedla.raw;
  her.talk({ text: 'namm namm namm', duration: 1.6 });
  yield c.basket.empty(out => out.copy(mouthOf(her)));
  yield* say(s, c, 'thorsedla', 'k2_thorsedla_mmm');
  c.basket.lower();
  yield* say(s, c, 'thorsedla', 'k2_thorsedla_who');
  yield* say(s, c, 'egill', 'k2_egill_name');
  yield* say(s, c, 'thorsedla', 'k2_thorsedla_thanks');
}

// 5. The invitation: she will come, and asks Egill up.
const CHOICE_WAIT = 25; // seconds before a child who does not answer says yes
function* theInvitation(s, c) {
  mark(c, 5);
  const { mosi } = c;
  // Her head down by Egill, Mosi beside them: the invitation, and her yes.
  yield s.camera.cut('fen_two_shot');
  yield mosi.lookAt(HER_HEAD, { weight: 0.8, maxPitch: 40 });
  yield* say(s, c, 'mosi', 'k2_mosi_invite');
  yield* say(s, c, 'thorsedla', 'k2_thorsedla_accept');
  // "Egill… do you want to see what I see from up here?", over his shoulder again. The child answers; "Is it high?" brings her
  // "Very high. But I'll hold you." and the question again. A child who does not answer says yes after 25 s.
  yield s.camera.cut('fen_shoulder');
  s.camera.follow('egill', { ...HEAD_DOWN_CAMERA, look: faceInView(c) }); // as her head came down, so the lift goes on from here
  yield* say(s, c, 'thorsedla', 'k2_thorsedla_see');
  for (;;) {
    const answer = yield s.race(s.choose([{ label: 'Já!', value: 'yes' }, { label: 'Er það hátt?', value: 'high' }]), s.wait(CHOICE_WAIT));
    if (answer !== 'high') break;
    yield* say(s, c, 'egill', 'k2_egill_high');
    yield* say(s, c, 'thorsedla', 'k2_thorsedla_high');
  }
  yield* say(s, c, 'egill', 'k2_egill_yes');
  c.basket.putDown(); // on the bank: his hands are free for her head
}

// 6. The lookout: up her neck to nine metres, where the child finds the three friends far away.
function* theLookout(s, c) {
  mark(c, 6);
  yield* liftUp(s, c);
  // (The fifth task: the three friends, found from up here; it rewrites this scene and carries the line and the look down with it.)
  // For now he looks down a while at Mosi, small below, who has come round to the bank beside her withers to catch him at the end
  // of the slide; the camera looks down past him, 32 degrees (kafli2-thorsedla.js: LOOK_DOWN), with a wide lens. "Vá… Mosi er
  // pínulítill!" once the camera has turned down past him to Mosi, so that the child sees what he sees.
  yield c.egill.lookAt(MOSI_HEAD, { weight: 0.9, maxAngle: 60, maxPitch: 50 });
  s.camera.follow('egill', { ...LOOKOUT_CAMERA, look: downToMosi(c) });
  yield s.wait(1.4);
  yield s.say('egill', 'k2_egill_tiny');
  yield s.wait(3.5);
  yield c.egill.lookAt(null);
  s.camera.follow('egill', LOOKOUT_CAMERA);
}

// 7. The slide down her neck into the saddle.
function* theSlide(s, c) {
  mark(c, 7);
  yield* slideDown(s, c);
  yield s.say('mosi', 'k2_mosi_oof');
  yield s.say('thorsedla', 'k2_thorsedla_comeback');
}

/** Fade to another place, set it up while the screen is black, and fade in (as chapter 1 does). */
function* goTo(s, c, name, setUp) {
  const going = s.goTo(name);
  yield s.until(() => c.world.location === name);
  setUp();
  yield going;
}

/** On the trail, under the black: Kambeðla stays in her glade; Mosi with Egill on his back at the top of the trail, in the forest;
 * Þórseðla's prints in the mud below, and the animals in four of them. */
function arriveOnTheTrail(s, c) {
  const { world, kambedla, mosi } = c;
  kambedla.raw.root.visible = false;
  c.leavingWalk?.cancel();
  const start = pathAt(TRAIL_PATH, RIDE_FROM);
  mosi.place(start.x, start.z, (Math.atan2(start.dz, start.dx) * 180) / Math.PI);
  c.prints = createMudPrints(world, { prints: TRAIL_PRINTS, heightAt: world.heightAt });
  const animals = PRINT_ANIMALS.map(({ print, kind, name, along, across, on, turn }) => ({
    name, kind, position: c.prints.pointIn(print, along, across, on), heading: TRAIL_PRINTS[print].heading + turn, scale: ANIMAL_SIZE,
  }));
  c.printCritters = createCritters(world, { spots: animals, heightAt: c.prints.groundAt, ripple: (point, strength) => c.prints.rippleAt(point, strength) });
  s.camera.cut({ label: 'trail ride', position: { actor: 'mosi', part: 'feet', offset: RIDE_CAMERA.offset, local: true }, target: 'mosi.head', fov: RIDE_CAMERA.fov });
}

/**
 * In the Fen, under the black: the trail's prints stay on the trail; Þórseðla stands in her pool; Mosi, with Egill on his back, at
 * the end of the trail where it comes into the Fen; the Fen's animals (a tap on one: it reacts and goes in the book), the berry
 * bushes and Egill's basket, ready for him.
 */
function arriveInTheFen(s, c) {
  const { world, kambedla, thorsedla, mosi } = c;
  c.prints?.dispose();
  c.printCritters?.dispose();
  c.prints = c.printCritters = null;
  kambedla.raw.root.visible = false;
  thorsedla.raw.root.visible = true;
  thorsedla.place(THORSEDLA.position[0], THORSEDLA.position[2], THORSEDLA.heading);
  mosi.place(FEN_ENTRY.position[0], FEN_ENTRY.position[2], FEN_ENTRY.heading);
  const ground = (x, z) => world.heightAt(x, z);
  const spots = FEN_CRITTERS.map(({ name, kind, at: [x, z], up, water, heading }) => ({
    name, kind, heading, position: [x, (water ? world.forest?.water?.level ?? ground(x, z) : ground(x, z)) + up, z],
  }));
  const critters = createCritters(world, { spots, ripple: (point, strength) => c.ring(point, strength) });
  for (const t of critters.targets) {
    const { kind } = FEN_CRITTERS.find(f => f.name === t.name);
    s.target(t.name, t);
    s.onTap(t.name, tap => {
      critters.react(t.name);
      s.sfx(kind);
      s.found(kind, tap);
    });
  }
  c.fenCritters = { critters, spots: FEN_CRITTERS };
  c.berries = createBerryBushes(world, { bushes: BERRY_BUSHES.map(b => ({ ...b, position: [b.position[0], ground(...b.position), b.position[1]] })) });
  c.basket = createBasket(world);
  s.camera.cut('fen_reveal');
}

/**
 * Her tail swishes from side to side, twice, laid over her clip as engine/hand-hold.js lays a hold over one: each frame the clip's
 * own turn goes back to every bone the mixer left as the swish set it, then the swish turns the tail about the vertical, more
 * toward its tip. A task (yield it to wait, or let it run).
 */
function* tailSwish(s, c, { seconds = 2.4, reach = 0.1 } = {}) {
  if (c.swishing) return;
  c.swishing = true;
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

/** A required tap on an actor that also ends by itself when `idle` is done: a wait for the child with no hints (kafli1's). */
function* tapOrWait(s, name, idle) {
  s.target(name, { point: name, radius: 0.7 });
  try {
    return yield s.race(s.tap(name), idle);
  } finally {
    s.target(name, null);
  }
}

/** A line, one voice at a time: `c.saying` counts the lines under way, so a goodbye or a remark can wait for quiet. */
function* say(s, c, speaker, id, options) {
  c.saying = (c.saying ?? 0) + 1;
  try {
    yield s.say(speaker, id, options);
  } finally {
    c.saying--;
  }
}

/** The bush a berry hangs on, from its name (berry_<bush>_<i>). */
const bushOf = name => Number(name.split('_')[1]);

// 8. The second star, and the book.
function* theStar(s, c) {
  mark(c, 8);
  yield s.wait(0.1);
}

// ---------------------------------------------------------------------------------------------
// Helpers

/** Note when a scene starts (world.chapterTimeline, for captures and probes). */
function mark(c, scene) {
  c.world.chapterTimeline?.push({ scene, at: c.s.time });
}

// ---------------------------------------------------------------------------------------------

export const chapter = {
  id: 'kafli2',
  title: 'Boð til Þórseðlu',
  look: 'lateMorning',
  start: 'burknalaut',
  locations: {
    burknalaut: {
      layout: GLADE.layout,
      shots: { ...GLADE.shots, ...GLADE_SHOTS },
      warmUp: ['glade_leaving'],
    },
    fenjaslod: {
      layout: {
        seed: 11,
        clearing: { center: [0, 0], radius: 14 },
        forestEdge: 20,
        path: TRAIL_PATH,
        biome: 'fen',
        blend: blendAcross(TRAIL_PATH, 10), // forest before the path's middle, fen after it
        lift: (x, z) => -TRAIL_DROP * Math.max(-60, Math.min(60, x * TRAIL_DIR[0] + z * TRAIL_DIR[1])), // down toward the Fen
        mist: [{ center: [17, 10], radius: 14, height: 1.0 }],
        leafShadows: true,
        actors: { mosi: { position: [0, 0, 0], heading: 34 } },
        prints: TRAIL_PRINTS, // Þórseðla's ten footprints (world/props/mud-prints.js): not the forest's, it reads no `prints`
      },
      shots: TRAIL_SHOTS,
      warmUp: ['trail_wide', 'trail_fog'],
    },
    fen: {
      layout: {
        seed: 12,
        clearing: { center: [0, 0], radius: 24 },
        forestEdge: 30,
        path: [[56, 40], [34, 22], [20, 9], [12, 1.5], [8.5, -1.5]], // the trail comes in from the south-east to Mosi's hummock
        biome: 'fen',
        water: FEN_WATER,
        hummocks: [
          { center: [8.5, -3], radius: 5, height: 0.4 }, // Mosi's
          { center: [8.4, -8.8], radius: 3.5, height: 0.25 }, // under her two conifers, where Egill stands
          { center: [15, -3.5], radius: 4, height: 0.3 }, // berries
          { center: [16, -11], radius: 3.5, height: 0.3 }, // berries
        ],
        // the two conifers whose tops she bites (their crowns from 3 or 4 m up): the north one 8.5 m tall, its top level with her head
        // as she stands and below Egill on it at the top of her lift, and her head's way down to him and up again with him on it just
        // clear of its crown (her snout brushes it); the south-east one 11.5 m; a white snag 10.5 m tall for Flugeðla to perch on;
        // reed round where Uggeðla lies, on her side away from the channel
        plants: [
          { name: 'swampConifer', position: [7.6, -11.1], scale: 0.72, variant: 7 },
          { name: 'swampConifer', position: [9.0, -7.0], scale: 0.9, variant: 3 },
          { name: 'deadSnag', position: [-52, -88], scale: 1.5, variant: 2 },
          ...[[72, 33], [78, 31], [84, 34], [88, 41], [69, 39], [82, 45]].map((position, k) => ({ name: 'horsetailReed', position, variant: k % 4, scale: 1.15 })),
          // reed on p1's west shore and round p2 and p4, and lilies in p1, all clear of her and of the shots across her pool
          ...[[-11.2, -5.6], [-11.3, -12.8], [-8.3, 6], [-14, 0.2], [-9.5, 3], [14.5, 10], [9, 13.8]].map((position, k) => ({ name: 'horsetailReed', position, variant: (k + 1) % 4, scale: 1.1 })),
          ...[[-7.5, -6.3], [-7, -12], [-5.5, -14.2], [-6.5, -3.8]].map((position, k) => ({ name: 'waterLily', position, variant: k % 6, scale: 1.1 })),
        ],
        mist: [{ center: [-6, -2], radius: 26, height: 1.2 }],
        // no moss hangs between Egill and where her face comes down to him (x 6.0 to 7.3): the north conifer's lowest strands hung
        // there, a bright beard across her shoulder and beside her eye over his shoulder
        mossClear: [{ center: [EGILL_FEN.position[0] - 0.8, EGILL_FEN.position[2]], radius: 1.8 }],
        farFriends: { sloedla: [-70, -38], flugedla: [-52, -88], uggedla: [78, 40] },
        berries: BERRY_BUSHES, // the berry bushes (world/props/berries.js): not the forest's, it reads no `berries`
        lookout: [5, 9.4, -9], // where the sight lines to the far friends start, that tall plants keep out of (Egill's head: LOOKOUT_HEAD)
        actors: {
          mosi: MOSI_FEN,
          egill: EGILL_FEN, // on the hummock where her face comes down to him
          thorsedla: THORSEDLA,
          thorsedla_tail: alongHer(-9.5),
          thorsedla_neck: alongHer(3),
          thorsedla_head: alongHer(6),
        },
      },
      shots: FEN_SHOTS,
      warmUp: ['fen_reveal_end', 'fen_thorsedla_low', 'fen_two_shot'],
    },
  },
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', ...MOSI_GLADE },
    egill: { url: '../assets/characters/egill.glb', ...MOSI_GLADE }, // on Mosi's back: the script seats him in the saddle
    kambedla: { url: '../assets/characters/stegosaurus.glb', ...KAMBEDLA_GLADE },
    thorsedla: { url: '../assets/characters/brontosaurus.glb', position: OFF_STAGE, heading: 0 },
  },
  // Caption names; the colour is the dark tone of each character's main hue (STYLE.md section 3).
  cast: {
    mosi: { name: 'Mosi', colour: '#4f5433' },
    egill: { name: 'Egill', colour: '#355774' },
    kambedla: { name: 'Kambeðla', colour: '#5d4370' },
    thorsedla: { name: 'Þórseðla', colour: '#89682e' },
  },
  lines: Object.fromEntries(Object.entries(WORDS).map(([id, text]) => [id, { text, audio: id }])),
  // The camera shows this shot while the start button waits: the glade as chapter 1 left it.
  startShot: 'glade_leaving',
  // The trail and the Fen are built behind the start button and kept, hidden (engine/locations.js: prepare).
  prepare: ['fenjaslod', 'fen'],

  /**
   * What the chapter draws once where nobody sees a frame stall (engine/warm-up.js): behind the start button, and again under the
   * black as it comes to a place. For now the actors, Þórseðla among them while she waits out of sight, and one of the leaves
   * she bites off, from the start shot.
   */
  warmUp(world) {
    const leaf = leafWarm(world);
    const ground = (x, z) => [x, world.heightAt(x, z), z];
    // a print with its water, its digit up and a splash; one of each of the Fen's animals; a bush of each berry, one in the air; the
    // basket with a berry in it
    const prints = createMudPrints(world, { prints: [{ position: [0, 0.5], heading: 0 }] });
    prints.count(0);
    prints.splash(0);
    const critters = createCritters(world, {
      spots: ['frog', 'dragonfly', 'waterBeetle', 'salamander', 'turtle', 'earlyBird', 'fish', 'waterStrider'].map((kind, i) => ({ name: `warm-up-${kind}`, kind, position: ground(i * 0.6 - 2, 1.5), heading: 0 })),
    });
    const berries = createBerryBushes(world, { bushes: [{ position: ground(2, 2), kind: 'red', count: 1 }, { position: ground(3, 2), kind: 'blue', count: 1 }] });
    berries.pick('berry_0_0', ground(2, 3));
    const basket = createBasket(world);
    basket.group.visible = true;
    basket.add('red');
    return {
      objects: [...[...world.actors.values()].map(actor => actor.root), leaf.object, prints.group, critters.group, berries.group, basket.group],
      shots: ['glade_leaving'],
      dispose() {
        leaf.dispose();
        prints.dispose();
        critters.dispose();
        berries.dispose();
        basket.dispose();
      },
    };
  },
  shots: {}, // every shot belongs to a place: chapter.locations[name].shots

  // The script: a generator that yields what it waits for (remake/engine/scene/scheduler.js).
  *script(s) {
    const mosi = s.actor('mosi');
    const egill = s.actor('egill');
    const kambedla = s.actor('kambedla');
    const thorsedla = s.actor('thorsedla');
    const world = mosi.raw.world;
    world.chapterTimeline = [];
    egill.raw.footprintScale = EGILL_FOOTPRINT;
    const c = { s, world, mosi, egill, kambedla, thorsedla, talking: false, saying: 0, phase: 'glade', printLog: [], picks: [] };
    // The script's rings on the Fen's water (leaves, drops, her feet) keep to three at once: the water keeps six for the script.
    c.ring = ringsFor(world, { most: 3 });
    world.chapterState = c; // what the scenes share, for captures and probes
    // As chapter 1 ended: Egill in the saddle on Mosi's back and Kambeðla's plates all alight. Þórseðla is in the Fen, not here.
    thorsedla.raw.root.visible = false;
    c.saddle = createSaddle(mosi.raw);
    c.saddle.object.visible = true;
    c.riding = ride(egill.raw, c.saddle, { settle: 0 });
    c.glow = world.effects.add(addPlateGlow(kambedla.raw));
    c.glow.setAll(1, { duration: 0 });
    yield s.camera.cut('glade_leaving');
    yield s.ready(); // the start button; immediate in captures
    s.sfx('forest');
    yield s.fade(0, 0.8); // the scene opens from black (main.js): the glade comes up out of it
    yield* story(s, c);
  },
};
