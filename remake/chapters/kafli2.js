// Chapter 2: Boð til Þórseðlu (an invitation for Þórseðla). Scenes 1 to 8 of the approved script
// (docs/superpowers/specs/2026-10-21-kafli-2-bod-til-thorsedlu-design.md): from Kambeðla's fern glade Mosi and Egill ride out of
// the forest and down into the Fen, count Þórseðla's ten water-filled footprints, lure her nine-metre head down with five red
// berries, invite her to the Star Festival, ride her neck up to look out over the Fen and find three far friends for the book's
// map, slide down her neck into the saddle, and win the second star. Seven to nine minutes for a six-year-old, who can never fail
// it: every wait for the child has hints where the script gives them and ends by itself.
//
// The chapter's skeleton (the plan's first task) gives its places, actors, cast, lines and look, and the eight scenes in their
// order; the trail and the Fen have their own ground, plants, water, mist and shots (the second task: world/forest/ grows them as
// the Fen biome). Þórseðla is alive in the Fen, and the pieces of her part are here (the third task): thorsedlaLife, headDown,
// liftUp and slideDown, wired into scenes 3 to 7 so that the chapter plays through by itself; the footprints and the berries (the
// fourth task) and the far friends, the map and the star (the fifth) come into those scenes around them.
//
// Three places (engine/locations.js), in metres at real size (STYLE.md section 3): Mosi 8.5 m nose to tail, Kambeðla 7 m,
// Þórseðla 22 m with her head 8.3 to 9 m up, Egill 1.1 m tall. Headings are degrees, 0 facing +X and 90 facing +Z. The late
// morning sun (engine/looks.js: lateMorning) comes from heading 150 at 26 degrees, a little lower than chapter 1's.
//   burknalaut  Kambeðla's fern glade, chapter 1's own (its layout and its shots, so it grows as the child left it), where chapter 1
//               ended: Mosi on its north-east side facing her across it, Egill in the saddle on his back, her plates alight.
//   fenjaslod   the trail out of the forest and down into the Fen, with Þórseðla's ten footprints in the mud.
//   fen         the Fen: pools, a slow channel, hummocks and swamp trees, Þórseðla standing in the shallow water.
// Actors are global: Þórseðla is hidden until the Fen, and each place puts the actors where they stand.
import * as THREE from 'three';
import { chapter as kafli1 } from './kafli1.js';
import { createSaddle, createSeat, ride, floatTo } from '../engine/riding.js';
import { slideDown as slideDownHerNeck, legsOut, waterDrops, ringsFor, eyesOf, eyeHeightIn, clipTimeForEyes } from '../engine/neck-ride.js';
import { addPlateGlow } from '../engine/plate-glow.js';
import { seededRandom } from '../engine/random.js';
import { sparkleBurst } from '../world/props/sparkles.js';
import { FEN } from '../world/forest/config.js';

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

const FEN_SHOTS = {
  // Scene 3: the trail ends on Mosi's hummock; the camera rises over him and pans right across the Fen, the pools glittering
  // toward the sun, and ends with Þórseðla far right, in the water at her real size (a move from the first to the second).
  fen_reveal: { position: [13, 1.6, 9.5], target: [-14, 1.5, 15.5], fov: 46 },
  fen_reveal_end: { position: [6, 3.8, 13], target: [-3.6, 2.6, -9], fov: 44 },
  // From below: her feet in the water like trunks, her head up in the swamp conifers.
  fen_thorsedla_low: { position: [-2.5, 0.45, 0.2], target: [1.5, 3.4, -9.5], fov: 56 },
  // Scene 5: her head down by Egill, Mosi beside them, the pool p4 behind Mosi.
  fen_two_shot: { position: [0, 1.4, 1.5], target: [5, 1.3, -8], fov: 46 },
  // Scene 4: over Egill's right shoulder, from behind him on the hummock between her two conifers, looking up to where her face
  // comes down to him: where the camera that follows him then (HEAD_DOWN_CAMERA) stands, so that it takes over without a move.
  fen_head_down: { position: [10.6, 1.36, -9.35], target: [5.7, 2.6, -9.05], fov: 46 },
  // Scene 6: as the lift begins, where the camera that rides up with Egill on her head (LIFT_CAMERA) stands then, at his left.
  fen_lift: { position: { actor: 'egill', part: 'feet', offset: [-3.0, 1.3, -3.0], local: true }, target: 'egill.head', fov: 40 },
  // Scene 4: the berry hummocks east of Mosi.
  fen_berries: { position: [13, 1.45, -14.5], target: [16.5, 0.6, -4], fov: 50 },
  // Scene 6: Egill by her lowered head, about to climb on.
  fen_lift_start: { position: [1.5, 1.35, -1.5], target: [4.6, 1.4, -8.6], fov: 40 },
  // Scene 7: from the south-east, her neck bent down like a slide from her head to her withers, and Mosi on the bank beside them
  // (MOSI_CATCHES), where the slide ends in his saddle; then nearer, the two of them as Egill lands.
  fen_slide: { position: [13, 2.2, 5], target: [2.8, 4.3, -6.6], fov: 44 },
  fen_slide_end: { position: [9, 1.8, 3], target: [3.2, 2.7, -4.6], fov: 46 },
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
  yield s.camera.cut('fen_head_down');
  yield s.wait(1.5);
  yield* headDown(s, c);
  yield s.say('thorsedla', 'k2_thorsedla_who');
  yield s.say('egill', 'k2_egill_name');
  yield s.say('thorsedla', 'k2_thorsedla_thanks');
}

// 5. The invitation: she will come, and asks Egill up.
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
  // (The fifth task: the three friends, found from up here.) For now he looks about from the top: down past her head at Mosi,
  // small on his hummock.
  yield c.egill.lookAt(MOSI_HEAD, { weight: 0.9, maxAngle: 50, maxPitch: 45 });
  s.camera.follow('egill', { ...LIFT_CAMERA, look: downToMosi(c), fov: 50 });
  yield s.wait(6);
  yield c.egill.lookAt(null);
}

// 7. The slide down her neck into the saddle.
function* theSlide(s, c) {
  mark(c, 7);
  yield* slideDown(s, c);
  yield s.camera.cut('fen_slide_end');
  yield s.say('mosi', 'k2_mosi_oof');
  yield s.say('thorsedla', 'k2_thorsedla_comeback');
}

// ---------------------------------------------------------------------------------------------
// Þórseðla's part (scenes 3 to 7), as pieces the scenes call: her life, her head coming down to Egill's eyes, the lookout on the
// back of her head and the slide down her neck. Each piece leaves `c.phase` saying where it has got to, for captures and probes.

// Egill meets her face on the hummock under her two conifers, a step in front of where it comes down; Mosi stands on his hummock
// and, for the slide, on the bank beside her withers (dry, clear of her by 1.4 m), with his saddle 5.8 m from them.
const EGILL_MEETS = { at: [7.8, -9.0], heading: 180 };
const MOSI_CATCHES = { at: [4.6, -4.2], heading: 180 };
// Her eyes come down to his: this far above the ground he stands on (his own eyes are 0.92 m up). Her root stands 0.74 m lower,
// on the bed of her pool, so lowerHead is held where her eyes get there (3.5 s in) and does not play to its end (0.95 m above her
// feet: holdAtEyes).
const EYES_UP = 1.0;
const HOLD_SETTLE = 1.2; // seconds her look at him has to settle, the clip moved on or back meanwhile to keep her eyes at his
// The seat on the back of her head (riding.js: createSeat), level however her head and neck turn: 0.15 m behind her Head bone,
// his root 0.65 m above it, which keeps the lowest of him 1 to 3 cm over her skin with his legs out (neck-ride.js: legsOut) from
// the bank to the top (kafli2.test asserts none of him inside her). His hands rest on his thighs.
const SEAT = { bone: 'Head', offset: [0, 0.65, -0.15], grips: { left: [-0.12, 0.45, 0.08], right: [0.12, 0.45, 0.08] } };
const FLOAT = 2.2; // seconds he floats up onto it
// The cameras that follow Egill (director.follow, which may rise above 7.5 m, as the lookout's must). Her face comes down over his
// right shoulder from 2.8 m behind him, between the trunks of her two conifers (one stands at each of his sides, 1.4 and 2.3 m
// from him), tilted up LOOK_UP degrees at most: so the camera looks out under their crowns, not up into them, her face comes down
// into the frame, and the sun shows over Mosi's head to wink. At the top it looks down past him at Mosi, LOOK_DOWN degrees at
// most (STYLE.md 8: 35).
const HEAD_DOWN_CAMERA = { offset: [-2.8, 1.1, 0.35], local: true, fov: 46 };
// Up with him at his left (the brief's side), 3 m further back, clear of the crown of the conifer north of her lowered head, and
// as fast as he rises (up to 2 m/s: the camera moves with him, not past anything), so that he stays in the middle of the frame.
const LIFT_CAMERA = { offset: [-3.0, 1.3, -3.0], local: true, look: 'head', stiffness: 2.0, fov: 40, maxSpeed: 2.4 };
const LOOK_UP = 14;
const LOOK_DOWN = 32;
// Her life: a nod or a bite every 7 to 12 s, the first 2.5 s after she is seen; the nod (kink) is 2.8 s, its lowest 0.95 s in,
// where her mouth closes on the twigs.
const LIFE = { first: 2.5, gap: [7, 12], nod: 2.8, bite: 0.95, chew: 1.4 };
const LEAVES = { count: 6, rest: 2.5, shrink: 0.6, colours: [FEN.canopyMid, FEN.canopySun, FEN.hangingMoss] };
// For the slide she bends her neck down again, liftUp backwards to 5.3 s, so it slopes from her head to her withers like a slide.
const BEND = { to: 5.3, rate: 0.7 };
const CHOICE_WAIT = 25;
const SLIDE_WAIT = 5;
const HER_LOOK = { weight: 1, maxAngle: 20, maxPitch: 20 }; // a small aim: her look turns the base of her 6 m neck as well as her head
const EGILL_HEAD = { actor: 'egill', part: 'head' };
const MOSI_HEAD = { actor: 'mosi', part: 'head' };
const EGILL_EYES = { actor: 'egill', part: 'head', offset: [0.07, 0.03, 0], local: true }; // his eyes, in front of his head bone
const HER_HEAD = { actor: 'thorsedla', part: 'head' };
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Þórseðla alive, from when the Fen is reached: she breathes and her tail sways (idle); every 7 to 12 s she nods or bites the
 * conifer she faces (kink, six of its leaves falling from her mouth and a chew); and while her head is down she looks at whichever
 * of Egill and Mosi is nearer. A piece that needs her head holds her (c.life.hold(), c.life.free()). `c.life.log` keeps each nod
 * and bite ({ kind, at, afterHold }). Returns c.life.
 */
function thorsedlaLife(s, c) {
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
function* headDown(s, c) {
  const { thorsedla: her, egill } = c;
  c.phase = 'head coming down';
  c.life.hold();
  c.life.headDown = false;
  yield her.lookAt(null);
  yield egill.lookAt(HER_HEAD, { weight: 0.85, maxAngle: 40, maxPitch: 40 });
  s.camera.follow('egill', { ...HEAD_DOWN_CAMERA, look: faceInView(c) });
  const lowering = her.raw.play('lowerHead', { fade: 0.8 });
  s.after(0.6, () => ringAtFoot(c, 'FrontFootL'));
  s.after(1.1, () => ringAtFoot(c, 'FrontFootR'));
  s.after(2.5, () => s.sun.wink());
  s.after(2.6, () => her.lookAt(eyesMeet(c, EGILL_EYES), HER_LOOK));
  yield* holdAtEyes(s, c, lowering);
  c.life.headDown = true;
  c.phase = 'head down';
}

/** lowerHead plays until her eyes reach Egill's (EYES_UP over his ground), then holds; while her look settles it keeps them there. */
function* holdAtEyes(s, c, action) {
  const her = c.thorsedla.raw;
  const egill = c.egill.raw;
  const eyes = eyesOf(her);
  const at = new THREE.Vector3();
  const goal = () => c.world.heightAt(egill.root.position.x, egill.root.position.z) + EYES_UP;
  const end = action.getClip().duration - 1e-4;
  yield s.until(() => eyes(at).y <= goal() || action.time >= end);
  action.setEffectiveTimeScale(0);
  // Her eyes as she is drawn, her look laid over the clip: where they are too high the clip moves on a little, too low it moves back.
  let left = HOLD_SETTLE;
  c.world.effects.add({
    label: 'her eyes held at his',
    update(dt) {
      left -= dt;
      const off = eyes(at).y - goal();
      action.time = THREE.MathUtils.clamp(action.time + THREE.MathUtils.clamp(off * 0.25, -0.02, 0.02), 0, end);
      return left > 0;
    },
  });
  yield s.wait(HOLD_SETTLE);
  c.held = action.time;
}

/**
 * The lift (scene 6): the back of her head glitters for a tap; a tap there or on Egill floats him up onto the seat on it (or he
 * floats up by himself after 6 s), his legs going out in front of him as he lands, and he rides there; she lifts him slowly to her
 * full height (liftUp, from the point of its own where her head is as high as it is held), water dripping off her neck, the camera
 * rising with him, and on the way up he sees how small Mosi is. Leaves him at the top, c.phase 'lookout'.
 */
function* liftUp(s, c) {
  const { world, thorsedla: her, egill } = c;
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
  c.life.headDown = false; // she stops looking at him: he is coming onto her head
  yield her.lookAt(null);
  yield egill.lookAt(null);
  s.sfx('float');
  c.legs = legsOut(egill.raw);
  s.after(FLOAT - 0.75, () => { c.legs?.to(1, { duration: 0.6 }); });
  yield floatTo(egill.raw, c.seat, { duration: FLOAT });
  c.riding = ride(egill.raw, c.seat);
  c.phase = 'lifting';
  const held = c.held ?? her.raw.clips.get('lowerHead').duration;
  const lift = her.raw.play('liftUp', { fade: 0.6 });
  lift.time = clipTimeForEyes(her.raw, 'liftUp', eyeHeightIn(her.raw, 'lowerHead', held));
  const rising = lift.getClip().duration - lift.time;
  c.lift = { action: lift, rising };
  s.camera.cut('fen_lift');
  s.camera.follow('egill', LIFT_CAMERA);
  const drops = waterDrops(world, { seconds: rising, seed: 'her neck drips', ring: c.ring });
  const dripping = s.after(0.3, () => dripFromNeck(s, c, drops));
  s.after(rising * 0.45, () => s.say('egill', 'k2_egill_tiny'));
  yield s.until(() => lift.time >= lift.getClip().duration - 1e-3);
  dripping.cancel();
  c.phase = 'lookout';
}

/**
 * The slide (scene 7): Mosi comes round to the bank beside her withers to catch Egill and she bends her neck down like a slide; a
 * tap on Egill sends him (or by himself after 5 s): "Vúúú!", down her neck and into the saddle (neck-ride.js: slideDown). Then her
 * head goes back up into her conifers and her life goes on.
 */
function* slideDown(s, c) {
  const { thorsedla: her, egill, mosi } = c;
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.7, maxAngle: 40, maxPitch: 30 });
  const coming = mosi.walkTo([[MOSI_CATCHES.at[0] + 1.5, MOSI_CATCHES.at[1]], MOSI_CATCHES.at], { speed: 0.9 });
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
  c.slide = slideDownHerNeck(egill.raw, her.raw, c.saddle, { duration: 3.2, legs: c.legs, ring: c.ring });
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
function leafFall(c, from) {
  const { world } = c;
  leafShape ??= sprigGeometry();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(leafShape, material, LEAVES.count);
  mesh.name = 'Þórseðla leaves';
  mesh.frustumCulled = false; // they fall out of any bounds taken at the start
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const random = seededRandom(`leaves ${c.life.log.length}`);
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
      material.dispose();
      mesh.dispose();
      return false;
    },
  });
}

// A sprig of the swamp conifer's flat needles, 22 cm long: a pointed leaf in its own XY plane, one shape for every falling leaf.
let leafShape = null;
function sprigGeometry() {
  const rim = [[-0.11, 0], [-0.05, 0.035], [0.04, 0.04], [0.11, 0], [0.04, -0.04], [-0.05, -0.035]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, ...rim.flatMap(([x, y]) => [x, y, 0])], 3));
  geometry.setIndex(rim.flatMap((_, i) => [0, 1 + i, 1 + ((i + 1) % rim.length)]));
  geometry.computeVertexNormals();
  return geometry;
}

/** Where her mouth closes on the twigs: in front of and under her Head bone, toward the tip of her snout. */
function mouthOf(her) {
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
function faceInView(c) {
  const eyes = eyesOf(c.thorsedla.raw);
  const camera = c.world.camera.position;
  return out => {
    eyes(out);
    const level = Math.hypot(out.x - camera.x, out.z - camera.z);
    out.y = Math.min(out.y, camera.y + level * Math.tan(THREE.MathUtils.degToRad(LOOK_UP)));
    return out;
  };
}

/** A point beyond Egill's head toward Mosi below, for the camera at the top to look at, never more than LOOK_DOWN degrees down. */
function downToMosi(c) {
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
  egill.place(EGILL_MEETS.at[0], EGILL_MEETS.at[1], EGILL_MEETS.heading);
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
        // the two conifers whose tops she bites (their crowns from 3 or 4 m up): the north one 8.8 m tall, its top level with her head
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
        farFriends: { sloedla: [-70, -38], flugedla: [-52, -88], uggedla: [78, 40] },
        lookout: [5, 9.4, -9], // where Egill looks out from on her head, nine metres up
        actors: {
          mosi: MOSI_FEN,
          egill: { position: [5.8, 0, -8.4], heading: 180 }, // on the bank where her head comes down to him
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
   * black as it comes to a place. For now the actors, Þórseðla among them while she waits out of sight, from the start shot.
   */
  warmUp(world) {
    return {
      objects: [...world.actors.values()].map(actor => actor.root),
      shots: ['glade_leaving'],
      dispose() {},
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
