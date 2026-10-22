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
// footprints and the berries (the fourth task) and the far friends, the map and the star (the fifth) come into those scenes around
// them. This file keeps the places, the lines and the scenes.
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
import { createSaddle, ride } from '../engine/riding.js';
import { ringsFor } from '../engine/neck-ride.js';
import { addPlateGlow } from '../engine/plate-glow.js';
import {
  thorsedlaLife, headDown, liftUp, slideDown, leafWarm, downToMosi, LOOKOUT_HEAD, HEAD_DOWN_CAMERA, LIFT_CAMERA, LOOKOUT_CAMERA,
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
  // Scene 4: the berry hummocks east of Mosi.
  fen_berries: { position: [13, 1.45, -14.5], target: [16.5, 0.6, -4], fov: 50 },
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

// 1. Leaving the glade: Kambeðla waves them off, her plates blinking goodbye.
function* leaving(s, c) {
  mark(c, 1);
  yield s.wait(0.1);
}

// 2. The footprints in the mud: the child counts Þórseðla's ten prints along the trail.
function* footprints(s, c) {
  mark(c, 2);
  yield s.wait(0.1);
}

// 3. The Fen: the new world opens, and Þórseðla stands in it at her real size, too high to hear them.
function* theFen(s, c) {
  mark(c, 3);
  yield s.wait(0.5); // (the trail before it is the fourth task's)
  yield* goTo(s, c, 'fen', () => arriveInTheFen(s, c));
  thorsedlaLife(s, c);
  // (The fourth task: the trail ends on Mosi's hummock and the camera rises over the Fen to her.) Her feet in the water like
  // trunks and her head up in her conifers, biting; Egill calls up to her, and nothing happens; she bites again.
  yield s.wait(3);
  yield s.say('egill', 'k2_egill_hello');
  yield s.until(() => c.life.log.length >= 2);
  yield s.wait(2.5);
}

// 4. The lure: five red berries for her, held up high, and her head comes down to Egill's eyes.
function* theLure(s, c) {
  mark(c, 4);
  // (The fourth task: the berries, picked into the basket and held up high.) For now a moment, and her head comes down.
  yield s.camera.cut('fen_shoulder');
  yield s.wait(1.5);
  yield* headDown(s, c);
  yield s.say('thorsedla', 'k2_thorsedla_who');
  yield s.say('egill', 'k2_egill_name');
  yield s.say('thorsedla', 'k2_thorsedla_thanks');
}

// 5. The invitation: she will come, and asks Egill up.
const CHOICE_WAIT = 25; // seconds before a child who does not answer says yes
function* theInvitation(s, c) {
  mark(c, 5);
  // (The fourth task: Mosi's invitation and her yes.) "Egill… do you want to see what I see from up here?" The child answers; "Is
  // it high?" brings her "Very high. But I'll hold you." and the question again. A child who does not answer says yes after 25 s.
  yield s.say('thorsedla', 'k2_thorsedla_see');
  for (;;) {
    const answer = yield s.race(s.choose([{ label: 'Já!', value: 'yes' }, { label: 'Er það hátt?', value: 'high' }]), s.wait(CHOICE_WAIT));
    if (answer !== 'high') break;
    yield s.say('egill', 'k2_egill_high');
    yield s.say('thorsedla', 'k2_thorsedla_high');
  }
  yield s.say('egill', 'k2_egill_yes');
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

/** In the Fen, under the black: Kambeðla stays in her glade, Þórseðla stands in her pool and Mosi on his hummock. */
function arriveInTheFen(s, c) {
  const { kambedla, thorsedla, mosi, egill } = c;
  kambedla.raw.root.visible = false;
  thorsedla.raw.root.visible = true;
  thorsedla.place(THORSEDLA.position[0], THORSEDLA.position[2], THORSEDLA.heading);
  mosi.place(MOSI_FEN.position[0], MOSI_FEN.position[2], MOSI_FEN.heading);
  // (The fourth task: Egill floats down from the saddle and goes berrying.) For now he waits on the hummock under her conifers.
  c.riding?.stop();
  c.riding = null;
  egill.place(EGILL_FEN.position[0], EGILL_FEN.position[2], EGILL_FEN.heading);
  egill.play('idle', { fade: 0 });
  s.camera.cut('fen_thorsedla_low');
}

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
    return {
      objects: [...[...world.actors.values()].map(actor => actor.root), leaf.object],
      shots: ['glade_leaving'],
      dispose() { leaf.dispose(); },
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
    const c = { s, world, mosi, egill, kambedla, thorsedla, talking: false, phase: 'glade' };
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
