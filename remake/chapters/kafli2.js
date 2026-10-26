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
import { createBasket } from '../world/props/basket.js';
import { createMudPrints } from '../world/props/mud-prints.js'; // (the warm-up's throwaways)
import { createCritters } from '../world/critters/critters.js';
import { createBerryBushes } from '../world/props/berries.js';
import {
  TRAIL_PATH, TRAIL_PRINTS, TRAIL_BARE, PRINT_SIZE, RIDE_POINTS, TRAIL_ON, RIDE_CAMERA, PRINT_ANIMALS, mosiAt, printsLow, printShot,
  printFollow, arriveOnTheTrail, countPrints,
} from './kafli2-trail.js';
import { BERRY_BUSHES, FEN_CRITTERS, fenAnimals, berryBushes, pickBerries, holdUpBasket, eatFromBasket } from './kafli2-fen.js';
import { farFriends, haze, hazeUp, lookDown, findFriends } from './kafli2-lookout.js';
import { ringsFor } from '../engine/neck-ride.js';
import { addPlateGlow } from '../engine/plate-glow.js';
import {
  thorsedlaLife, headDown, liftUp, slideDown, leafWarm, faceInView, tailSwish, tapOnHer, LOOKOUT_HEAD, HEAD_DOWN_CAMERA, LIFT_CAMERA, MOSI_HEAD,
} from './kafli2-thorsedla.js';

export { LOOKOUT_HEAD }; // where Egill's head is at the top of the lift (kafli2-thorsedla.js)
export { EGILL_PICKS }; // where Egill stands for the berry search (the tests look from behind him, as fen_pick does)

// ---------------------------------------------------------------------------------------------
// Burknalautin, the fern glade: chapter 1's

const GLADE = kafli1.locations.burknalaut;
const MOSI_GLADE = GLADE.layout.actors.mosi; // facing Kambeðla across the glade, as chapter 1 ends
const KAMBEDLA_GLADE = GLADE.layout.actors.kambedla;
// Where an actor waits who is in none of the places yet: far outside every forest, and hidden.
const OFF_STAGE = [0, 0, -400];
// Egill's footprint in the grass and the ferns is a boy's, as in chapter 1 (world/forest/forest.js: footprintScale).
const EGILL_FOOTPRINT = 0.3;
// Seconds the black at the start waits at most for the far friends' files (7.3 MB: on a slow connection they come later, and the
// Fen makes the friends under its own black: arriveInTheFen).
const FAR_WAIT = 4;

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

const TRAIL_DIR = [0.83, 0.55]; // the way down the trail, toward the Fen (unit)
// Seconds into the ride down the trail when the forest's wind cross-fades to the Fen's water (engine/audio/sfx.js): Mosi is 4.4 m on,
// where the forest begins to turn into fen (the layout's blend), and the water is all there by the first print.
const FEN_SOUNDS_IN = 4;
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

// The far friends' places, out in the open Fen where the lookout on her head sees them (and the planner keeps the sight lines to
// them clear of tall plants, from `lookout`): Slóeðla in the far pool p5, Flugeðla on the white snag, Uggeðla in the reed by the
// channel. Uggeðla's line from Egill's head passes through the south-east conifer's crown: the search sees her from its camera
// instead (kafli2-lookout.js), as moving her would re-deal 75 to 127 of the Fen's plants.
const FEN_FAR = { sloedla: [-70, -38], flugedla: [-52, -88], uggedla: [78, 40] };

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
  // Scene 3: Egill on the bank calling up to her: low in front of him, his face turned up past us to where her head is, the sky
  // behind him (a shot on him, which the planter skips).
  fen_call: {
    position: { actor: 'egill', part: 'feet', offset: [1.75, 0.55, 0.3], local: true },
    target: { actor: 'egill', part: 'feet', offset: [0, 1.12, 0.02], local: true }, fov: 38,
  },
  // Scene 4: the berry search, from behind Egill on the bank, over the berry hummocks (the free look turns from here).
  fen_pick: {
    position: { actor: 'egill', part: 'feet', offset: [-2.2, 1.7, -1.8], local: true },
    target: { actor: 'egill', part: 'feet', offset: [5.5, 0.2, 0.2], local: true }, fov: 50,
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
  // Kept for the planting (Task 2 planned the Fen round it: changing it re-deals plants), unused: from here Mosi shows his back and
  // her head is in the south-east conifer's crown. The star is seen from fen_star_rise.
  fen_star: { position: [14, 1.3, 4], target: [2, 4.2, -6], fov: 52 },
  // Scene 8: from the south, low across the bank with the sun behind us: Mosi in profile with Egill in the saddle, Þórseðla behind
  // them in her pool, her neck rising into her conifers, where the star rises. Points on her (she does not move), as fen_slide is,
  // so the planter leaves the Fen as Task 2 planned it.
  fen_star_rise: {
    position: { actor: 'thorsedla', part: 'feet', offset: [2.5, 2.0, 18.5], local: true },
    target: { actor: 'thorsedla', part: 'feet', offset: [6, 5.2, 2.5], local: true }, fov: 50,
  },
  // Scene 8, once the star has landed: the sun's hug. From the north side of her pool, 4 m up over the channel, looking south-west
  // straight at the late morning sun's heading (150) and up 13 degrees (it is 26 up), on a 40-degree lens: her back and her tail's
  // curve a band along the bottom of the frame, the west groves' crowns beyond, and the sun's face in the upper third. Points on her,
  // as fen_star_rise is.
  fen_sun_hug: {
    position: { actor: 'thorsedla', part: 'feet', offset: [8, 4.66, -9], local: true },
    target: { actor: 'thorsedla', part: 'feet', offset: [-8.88, 9.16, 0.74], local: true }, fov: 40,
  },
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
  s.after(FEN_SOUNDS_IN, () => s.sfx('fen')); // the forest's wind gives way to the Fen's water as the trees turn to fen
  yield s.wait(7);
  yield ride;
  // all ten down the trail ahead, into the mist
  yield mosi.turnTo(first.heading, { rate: 40 });
  yield s.camera.cut(printsLow(c));
  yield egill.lookAt(c.prints.targets[2].point, { weight: 0.6, maxPitch: 40 });
  yield mosi.lookAt(c.prints.targets[0].point, { weight: 0.8, maxPitch: 40 });
  yield* say(s, c, 'mosi', 'k2_mosi_prints');
  yield s.camera.cut(printShot(c, 0));
  c.focus = 0; // the print the camera looks at, as it follows Mosi from print to print
  s.camera.follow('mosi', printFollow(c));
  yield egill.lookAt(c.prints.targets[0].point, { weight: 0.7, maxPitch: 45 });
  yield* say(s, c, 'mosi', 'k2_mosi_count');
  yield* countPrints(s, c);
  yield mosi.lookAt(null);
  yield egill.lookAt(null);
  yield* say(s, c, 'mosi', 'k2_mosi_tenprints');
  // and on down the trail, toward the Fen (a walk the Fen stops under its black: arriveInTheFen)
  c.trailWalk = mosi.walkTo(TRAIL_ON, { speed: 1.2 });
  s.camera.follow('mosi', RIDE_CAMERA);
  yield s.wait(3);
}

// 3. The Fen: the new world opens, and Þórseðla stands in it at her real size, too high up to hear them.
function* theFen(s, c) {
  mark(c, 3);
  const { mosi, egill } = c;
  yield* goTo(s, c, 'fen', () => arriveInTheFen(s, c));
  thorsedlaLife(s, c);
  // The trail ends on Mosi's hummock: the camera rises over the Fen and pans across it, the pools glittering, the early bird
  // flying up out of the reed, to Þórseðla in the water at her real size; a tap on her swishes her tail.
  const herTap = s.onTap('thorsedla', () => { tapOnHer(s, c); });
  s.target('thorsedla', { point: HER_MIDDLE, radius: 2.6 });
  const arriving = mosi.walkTo(FEN_ARRIVAL, { speed: 1.45 });
  const reveal = s.camera.move('fen_reveal_end', { duration: REVEAL_SECONDS });
  s.after(3.2, () => { s.sfx('earlyBird'); return c.fenCritters.critters.react('fen-bird'); }); // it calls as it flies up
  yield s.all(reveal, arriving);
  yield mosi.turnTo(MOSI_FEN.heading, { rate: 30 });
  yield mosi.lookAt(HER_HEAD, { weight: 0.8, maxPitch: 45 });
  yield* say(s, c, 'mosi', 'k2_mosi_there');
  // the Fen goes onto the book's map, its marker flying in from the middle of the view over it: found now, and done with her star
  s.place('fen');
  s.sfx('mapMark');
  // Egill floats down to the bank and calls up to her. Nothing happens: her tail swishes, and she bites the treetop again.
  yield floatDown(egill.raw, c.saddle, [EGILL_CALLS.position[0], EGILL_CALLS.position[2]], { duration: 2.2, heading: EGILL_CALLS.heading });
  c.riding = null;
  yield s.camera.cut('fen_call');
  yield egill.lookAt(HER_HEAD, { weight: 0.9, maxAngle: 60, maxPitch: 55 });
  yield egill.play('wave', { fade: 0.3 });
  yield* say(s, c, 'egill', 'k2_egill_hello');
  yield egill.play('idle', { fade: 0.5 });
  yield s.until(() => !c.swishing); // a tap's swish still going: it ends first, so hers is the whole beat and the shot its length
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
  yield* pickBerries(s, c);
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
  c.raisedBy = yield* holdUpBasket(s, c);
  yield egill.lookAt(HER_HEAD, { weight: 0.8, maxPitch: 45 });
  yield c.basket.raise(egill.raw, { duration: 0.9 });
  // Task 3's: her head comes down out of the trees to his eyes, over his shoulder.
  yield* headDown(s, c);
  c.headDownAt = s.time;
  yield* eatFromBasket(s, c);
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
  c.fenCritters.quiet();
}

// 6. The lookout: up her neck to nine metres (Task 3's lift), where he sees how small Mosi is down there and the child finds the
// three friends far away, each going onto the book's map (kafli2-lookout.js).
function* theLookout(s, c) {
  mark(c, 6);
  yield c.farFriends.ready(); // made behind the start button or under the Fen's black: long since there
  hazeUp(c); // the air thickens as he rises: the Fen far below reads far below
  yield* liftUp(s, c);
  yield* lookDown(s, c);
  yield* findFriends(s, c);
}

// 7. The slide down her neck into the saddle.
function* theSlide(s, c) {
  mark(c, 7);
  haze(c, 1, 3); // the lookout's haze eases off again for the ground
  yield* slideDown(s, c);
  // he is down: the far friends are not seen again, and let go of what they hold (their light levels and material)
  c.farFriends.dispose();
  // and Mosi turns toward her head as she speaks, so that he looks up at her star as it rises (scene 8: STAR_TURN)
  c.mosi.turnTo(STAR_TURN, { rate: 30 });
  yield* say(s, c, 'mosi', 'k2_mosi_oof');
  yield* say(s, c, 'thorsedla', 'k2_thorsedla_comeback');
}

/**
 * Fade to another place, set it up while the screen is black, and fade in (as chapter 1 does). What the setting up returns, a
 * promise or nothing, holds the black until it settles (s.goTo's hold): the far friends' models, if they are made there. (The
 * script resumes before s.goTo's own task in the frame the place is there, as a task that starts another always does, so the
 * hold is asked after the setting up.)
 */
function* goTo(s, c, name, setUp) {
  let holding = null;
  const going = s.goTo(name, { hold: () => holding });
  yield s.until(() => c.world.location === name);
  holding = setUp() ?? null;
  yield going;
}

/**
 * In the Fen, under the black: the trail's prints stay on the trail; Þórseðla stands in her pool; Mosi, with Egill on his back, at
 * the end of the trail where it comes into the Fen; the Fen's animals (a tap on one: it reacts and goes in the book), the berry
 * bushes and Egill's basket, ready for him. The far friends' models are made here, under the black, if they were not behind the
 * start button (the child started before main.js came to them): the promise returned holds the black until they are, and drawn once.
 */
function arriveInTheFen(s, c) {
  const { world, kambedla, thorsedla, mosi } = c;
  c.prints?.dispose();
  c.printCritters?.dispose();
  c.prints = c.printCritters = null;
  kambedla.raw.root.visible = false;
  thorsedla.raw.root.visible = true;
  thorsedla.place(THORSEDLA.position[0], THORSEDLA.position[2], THORSEDLA.heading);
  // his walk on down the trail ends here (it went on in the Fen and took him from the trail's end to wherever it led, out in the reed)
  c.trailWalk?.cancel();
  mosi.place(FEN_ENTRY.position[0], FEN_ENTRY.position[2], FEN_ENTRY.heading);
  c.fenCritters = fenAnimals(s, c);
  c.berries = berryBushes(world);
  c.basket = createBasket(world);
  c.farFriends.show(true); // out in the Fen, seen only from her head
  s.sfx('fen'); // the Fen's own bed of water, frogs and drips (laid on the trail already: asked again, it stays as it is)
  s.camera.cut('fen_reveal');
  // (a capture, seeking, holds nothing here, as it never did: its frames stay where they were, and the lookout waits for them)
  const far = c.farFriends;
  return far.isReady || s.seeking ? null : far.load().then(() => world.warmObjects?.([far.group])); // main.js: one draw with them, under the black
}

/** The far friends made under the start's black if their files come within FAR_WAIT s; else the Fen makes them (arriveInTheFen). */
function* farFriendsInTime(s, far) {
  const fetched = yield s.race(far.prefetch().then(() => true), s.wait(FAR_WAIT));
  if (fetched === true) yield far.load();
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

// 8. The second star, and the book: the star rises from her head into the sky, the child taps it into the book, the sun hugs itself
// and winks in a shot of its own, and the book opens on its stars, two of them alight now, and turns to the map, where the friends
// found today are.
// The star rises from just over her head (the brief's 1 m under it, on her neck, put a gold star on her gold skin) and goes up 2.4 m
// into the sky (engine/scene/star-sprite.js), where it waits for the tap.
const STAR_FROM = { actor: 'thorsedla', part: 'head', offset: [0, 0.3, 0] };
const TO_THE_MAP = 1.2; // seconds the book shows its stars before it turns to the map
// Mosi's heading as the star rises (he came round to catch Egill facing west, 180): turned north toward her head, so the star is
// 33 degrees aside of his head (the saddle lets his look go 40 aside and 30 up, engine/riding.js); from the south he reads three
// quarters from behind, looking up with Egill.
const STAR_TURN = -98;
const SUN_WINKS = 1.4; // seconds into the sun's hug, in its own shot, that it winks
const HUG_HOLD = 2.8; // seconds the sun's shot holds before the fade into the book (its hug is 2.4 s)
function* theStar(s, c) {
  mark(c, 8);
  const { mosi, egill } = c;
  yield s.camera.cut('fen_star_rise');
  const above = { actor: 'thorsedla', part: 'head', offset: [0, 1.2, 0] };
  // Mosi has turned toward her head (from the slide's end on), three quarters from behind us, so his look (which the saddle keeps
  // within 40 degrees aside and 30 up, engine/riding.js) reaches the star as it rises
  mosi.turnTo(STAR_TURN, { rate: 35 });
  yield mosi.lookAt(above, { weight: 0.8, maxAngle: 60, maxPitch: 45 });
  yield egill.lookAt(above, { weight: 0.85, maxAngle: 60, maxPitch: 50 });
  s.sfx('star');
  const star = s.star('k2_thorsedla', STAR_FROM); // it waits in this shot for the child's tap (8 s at most), and flies into the book
  yield s.wait(1.4);
  yield* say(s, c, 'mosi', 'k2_mosi_second');
  yield star;
  s.sfx('journal');
  // The sun, seen over her back from the far side of her pool (her conifers hide it from every shot with her head in it), hugs itself
  // with a big grin and winks.
  yield s.camera.cut('fen_sun_hug');
  s.sun.hug();
  s.after(SUN_WINKS, () => s.sun.wink());
  yield s.wait(HUG_HOLD);
  // Into the book, which opens over the Fen on its stars and turns to the map, while Mosi says where they stand.
  s.fade(0.45, 1.6);
  s.journal.open('stars');
  s.after(TO_THE_MAP, () => s.journal.open('map'));
  yield* say(s, c, 'mosi', 'k2_mosi_two');
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
  next: null, // the last chapter so far: its script ends in the book (main.js shows no hand-over)
  look: 'lateMorning',
  // Its own song, "Dino Trail" (assets/audio/kafli2/theme.json, read by main.js as the page loads: engine/audio/theme.js); its effects
  // are tuned to its key (B-flat pentatonic for now: the owner picks B-flat or E-flat as do), and the forest dances on every second of its 133.3
  // beats a minute (theme.json danceBeats)
  theme: 'kafli2/theme.json',
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
        keepOut: TRAIL_BARE, // but it keeps its grass and plants out of them
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
        farFriends: FEN_FAR,
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
  // The trail and the Fen are built once the start button shows, a slice at a time, and kept, hidden (engine/locations.js:
  // prepare; main.js): the trail first, which the script's first fade from black waits for, then the Fen; a change of place to
  // either waits for its build.
  prepare: ['fenjaslod', 'fen'],
  // Made after the start button shows (main.js), not before it: the far friends' model files are fetched as it shows, and the
  // models made (three parses and their light levels: long frames) once the places are, if the button still waits; else the
  // script makes them under its first black (and, should that ever not have, the Fen under its own: arriveInTheFen).
  later: {
    fetch: world => world.chapterState?.farFriends?.prefetch(),
    make: world => world.chapterState?.farFriends?.load(),
  },
  // The first animal the chapter puts in the book (the dragonfly over the trail's third print): main.js shows its card's drawing once
  // where nobody sees a frame stall, so its flight into the book is not the first drawing with the hand-drawn filter.
  firstFind: 'dragonfly',

  /**
   * What the chapter draws once where nobody sees a frame stall (engine/warm-up.js): behind the start button, and again under the
   * black as it comes to a place. `place` is the place it is drawn for (main.js), and each place brings what shows there first, so
   * each black waits for its own: the glade, where the chapter starts, only the actors (Þórseðla among them while she waits out of
   * sight), so the start button waits for no more than the glade shows; the trail a print with its water, its digit up and a splash,
   * and its animals; the Fen its animals, one of the leaves Þórseðla bites off, its berry bushes (a bunch each, one in the air), the basket
   * with a berry in it, and the far friends once their models are there (their first frame from her head is no stall). No place
   * (null): all of it.
   */
  warmUp(world, { place = null } = {}) {
    const actors = [...world.actors.values()].map(actor => actor.root);
    const shots = ['glade_leaving'];
    if (place === 'burknalaut') return { objects: actors, shots, dispose() {} };
    const trail = place === null || place === 'fenjaslod', fen = place === null || place === 'fen';
    const ground = (x, z) => [x, world.heightAt(x, z), z];
    const objects = [...actors], throwaways = [];
    const keep = (made, object) => { objects.push(object); throwaways.push(made); };
    const kinds = [...(trail ? PRINT_ANIMALS : []), ...(fen ? FEN_CRITTERS : [])].map(animal => animal.kind);
    if (trail) {
      const prints = createMudPrints(world, { prints: [{ position: [0, 0.5], heading: 0 }], size: PRINT_SIZE });
      prints.count(0);
      prints.splash(0);
      keep(prints, prints.group);
    }
    const critters = createCritters(world, {
      spots: kinds.map((kind, i) => ({ name: `warm-up-${kind}`, kind, position: ground(i * 0.6 - 2, 1.5), heading: 0 })),
    });
    keep(critters, critters.group);
    if (fen) {
      const leaf = leafWarm(world);
      keep(leaf, leaf.object);
      // as many bushes as the Fen has: their shader is one a number of bushes (its shake per bush), so this draws the Fen's own
      const berries = createBerryBushes(world, { bushes: BERRY_BUSHES.map(({ kind }, i) => ({ position: ground(2 + i, 2), kind, count: 1 })) });
      berries.pick('berry_0_0', ground(2, 3));
      keep(berries, berries.group);
      const basket = createBasket(world);
      basket.group.visible = true;
      basket.add('red');
      keep(basket, basket.group);
      const far = world.chapterState?.farFriends;
      if (far?.isReady) objects.push(far.group);
    }
    return {
      objects, shots,
      dispose() {
        for (const made of throwaways) made.dispose();
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
    c.say = (speaker, id, options) => say(s, c, speaker, id, options); // for the trail's and the Fen's pieces
    world.chapterState = c; // what the scenes share, for captures and probes
    // The three friends far out in the Fen (kafli2-lookout.js): set up now, their models made later (chapter.later).
    c.farFriends = farFriends(s, c, FEN_FAR);
    // As chapter 1 ended: Egill in the saddle on Mosi's back and Kambeðla's plates all alight. Þórseðla is in the Fen, not here.
    thorsedla.raw.root.visible = false;
    c.saddle = createSaddle(mosi.raw);
    c.saddle.object.visible = true;
    c.riding = ride(egill.raw, c.saddle, { settle: 0 });
    c.glow = world.effects.add(addPlateGlow(kambedla.raw));
    c.glow.setAll(1, { duration: 0 });
    yield s.camera.cut('glade_leaving');
    yield s.ready(); // the start button; immediate in captures
    // What main.js readies once the start button shows, for a child who tapped before it got there: the trail, built (it is drawn
    // as the scene comes there, under that black), and the far friends, made (three models parsed: long frames, here where none
    // shows). The black holds for them, its star breathing (main.js). A capture (seeking) waits for
    // neither, so its frames stay where they were: it builds the trail as it goes there, and the friends' models are made meanwhile.
    const far = c.farFriends;
    if (s.seeking) far.load();
    else {
      // a trail whose build failed: main.js has said so, and the change of place to it builds it again (locations.js drops it)
      const trail = s.prepare('fenjaslod').catch(() => {});
      yield s.all(trail, ...(far.isReady ? [] : [farFriendsInTime(s, far)]));
    }
    s.sfx('forest');
    yield s.fade(0, 0.8); // the scene opens from black (main.js): the glade comes up out of it
    yield* story(s, c);
  },
};
