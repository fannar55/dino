// Chapter 4: Boð til Flugeðlu (an invitation for Flugeðla), docs/superpowers/specs/2026-11-01-kafli-4-bod-til-flugedlu-design.md.
// Þórseðla says goodbye at her pool and the map draws the way on across the Fen; Mosi, with Egill in the saddle, walks to the white
// snag, where Flugeðla sits on the very top with her wings spread and cannot take off, for there is no wind. Egill makes the wind
// (scene 3), she takes the invitation and the fourth star (4), takes Egill on her back (5) and flies him up the river and the falls
// (6, chapters/kafli4-flight.js), and lands at the far pool (7), where Mosi comes running and a horn sounds, false, from the reed
// across the pool: Slóeðla, whom chapter 5 meets there. The chapter ends as chapter 1 does: Flugeðla asks Egill to play, and the book
// opens on its games, where her game waits.
//
// The juice review of 2026-11-07 (its sections 1 and 2) added lines where nobody spoke (Egill's and Þórseðla's goodbye, the white tree
// seen, Egill on the circle and on her back, his thanks, the animals that came, Mosi's „Fjórar komnar“ and her ask to play), her
// flights at the tree heard (kafli4-flugedla.js flyPath), and at the far pool a splash you can see, the lens closing in a little,
// her happy hop, the animals that came hopping and calling, and the Fen's bed back.
//
// Two places (engine/locations.js), in metres at real size (STYLE.md section 3): Mosi 8.5 m nose to tail, Þórseðla 22 m, Flugeðla
// 7.5 m from wingtip to wingtip, Egill 1.1 m tall. Headings are degrees, 0 facing +X and 90 facing +Z. The early afternoon sun
// (engine/looks.js: earlyAfternoon) stands at heading 215, 22 degrees up.
//   fen       chapter 3's Fen as the child left it (its layout: the same seed, water and plants), where Þórseðla stands in her pool.
//             The chapter starts here. Its new shots are points on Þórseðla, as chapter 3's later shots are, and it is planted for
//             chapter 3's sun, so the planner grows the very same plants (a fixed shot would make it keep its view clear, and another
//             sun its light's way into the clearing, and either would deal them again).
//   hvitatre  the white tree: a patch of the same fen round the white snag, out where it stands in the Fen, built as a place of its
//             own. Chapter 3's Fen grows its plants 100 m out from its middle and its grass 33 m out, and the snag stands 102 m out
//             (where the lookout on Þórseðla's head sees it): on a bare plain at Mosi's height. This patch has the Fen's seed, so
//             its plants are the Fen's own kinds and shapes, and the snag is the very same (deadSnag, variant 2, 1.5 times).
//   ardalur   Árdalurinn, the flight's valley (world/ardalur), its snag at the origin. The picture cuts to it with no black, under
//             the close-up of Egill on her back on the white tree (the flight's first shot), drawn once under the white tree's black.
// Actors are global: each is where the chapter's script puts it.
import { chapter as kafli3 } from './kafli3.js';
import { thorsedlaLife, leafWarm } from './kafli3-thorsedla.js';
import { perch, holdHer, flyPath, watchHer, landingTime } from './kafli4-flugedla.js';
import { theWind } from './kafli4-wind.js';
import { lineQueue, panOf } from './kafli4-flight-play.js';
import { theFlight, TAKE_OFF_FACE, FLIGHT_WORDS, createFlightSong } from './kafli4-flight.js';
import { createRoute, FAR_POOL, BODY_HEIGHT } from './kafli4-route.js';
import { splash as splashOf, splashWarm } from '../world/props/splash.js';
import { createArdalur } from '../world/ardalur/index.js';
import { loadCritters } from '../world/ardalur/animals.js';
import { createFlier, rideFlier, perchedHeading, SEAT } from '../engine/flier.js';
import { createFlierSaddle } from '../engine/flier-saddle.js';
import { createFlightCamera } from '../engine/camera/flight-camera.js';
import { createFlightSounds, loadFlightRecordings } from '../engine/audio/flight-sounds.js';
import { createSaddle, ride, floatTo, floatDown, SIT_DEPTH } from '../engine/riding.js';
import { ringsFor } from '../engine/neck-ride.js';
import { mapMoment } from '../engine/scene/map-moment-scene.js';

const rad = degrees => (degrees * Math.PI) / 180;

// ---------------------------------------------------------------------------------------------
// The Fen, chapter 3's (kafli3.js): Þórseðla in her pool p1 facing east, Mosi on his dry hummock south-east of her head.

const FEN = kafli3.locations.fen;
const THORSEDLA = FEN.layout.actors.thorsedla; // [-2, 0, -9], heading 0
const MOSI_FEN = FEN.layout.actors.mosi; // [8, 0, -3.5], facing her head
// A point on Þórseðla, who does not move from her pool: its offset from her root (on the pool's bed) in her own frame, which, as she
// faces +X, is the world's. The Fen's new shots are set on her this way.
const onHer = ([x, y, z]) => ({ actor: 'thorsedla', part: 'feet', offset: [x - THORSEDLA.position[0], y, z - THORSEDLA.position[2]], local: true });

// Scene 1's way out of the Fen: east of her two conifers, north over the channel (Mosi wades it), toward the white snag far off
// (chapter 3's FEN_FAR.flugedla, 102 m north-west). The picture fades to the white tree on the way.
const FEN_WAY = [[11.6, -5.6], [13, -12], [12.2, -19], [8.5, -26]];
const FEN_SHOTS = {
  // Scene 1: the pond as they leave. From the bank north of her pool, low, with the sun from the side: Þórseðla at the left, her
  // neck reaching across to Mosi with Egill in the saddle at the right, her two conifers behind them, nothing in front.
  fen_farewell: { position: onHer([-3, 2.4, 8]), target: onHer([4, 4, -6]), fov: 46 },
  // Scene 1: the walk across the Fen. From the hummock behind them, looking north along their way: they go off into the open Fen,
  // past her neck, toward the white snag on the far side.
  fen_crossing: { position: onHer([12.5, 1.9, 3.5]), target: onHer([9, 3.2, -24]), fov: 46 },
};

const FEN_WARM = ['fen_farewell', 'fen_crossing']; // the Fen's views the warm-up draws from, besides the start shot

// ---------------------------------------------------------------------------------------------
// The white tree (hvitatre). Its own frame: the snag a little north-east of the middle, Mosi coming in from the south-west along the
// way the sun shines (so the shots that look at her from where he stands have the sun behind them), and the open fen round it.

export const SNAG = [9, 6.3]; // the white snag's foot
const SNAG_HEADING = 215; // she faces back the way Mosi comes, into the sun
const MOSI_TREE = { position: [0, 0, 0], heading: 35 }; // where he stops, looking up at her
const TREE_IN = [[-12, -8.4], [-6, -4.2], [MOSI_TREE.position[0], MOSI_TREE.position[2]]]; // his way in, from the south-west
const TREE_START = { position: [-17.5, 0, -12.3], heading: 35 }; // where the picture comes up on him
const BOARD = { position: [3.4, -4.4], heading: 35, fov: 38 }; // scene 5: where she sits low for Egill, at Mosi's left, facing as he
// does; fov: the lens from tre_above's place that holds the two of them as Egill floats across

const HVITATRE_LAYOUT = {
  seed: FEN.layout.seed, // the Fen's: its kinds of plants and their shapes, and its snag
  clearing: { center: [2, 1.4], radius: 18 },
  forestEdge: 26,
  path: [[-40, -28], [-24, -16.8], [-12, -8.4], [0, 0]],
  biome: 'fen',
  tall: 0.625, // its shots are kept clear for a tablet held upright too (world/forest/plan.js)
  water: {
    pools: [
      { center: [-7, 13], radius: 6.5, depth: 0.35 }, // west of Mosi: the sky in it from the shot from above
      { center: [21, -5], radius: 5, depth: 0.35 }, // east, past the tree
      { center: [17, 19], radius: 5.5, depth: 0.35 }, // behind the tree, north-east
    ],
  },
  hummocks: [
    { center: [0, 0], radius: 5.5, height: 0.3 }, // Mosi's
    { center: SNAG, radius: 3, height: 0.35 }, // the snag's
  ],
  plants: [
    { name: 'deadSnag', position: SNAG, scale: 1.5, variant: 2, rot: 0 }, // the white snag: chapter 3's (kafli3.js FEN layout)
    // swamp conifers at the clearing's rim, framing it
    { name: 'swampConifer', position: [27, 6], scale: 0.95, variant: 3 },
    { name: 'swampConifer', position: [-14, 22], scale: 0.85, variant: 1 },
    { name: 'swampConifer', position: [12, -20], scale: 0.8, variant: 5 },
    // reed round the pools and lilies in them
    ...[[-12.6, 10], [-11.5, 16.4], [-3, 18.6], [-1.6, 9.5], [24.6, -2], [17.4, -8.6], [12.8, 18.4], [20.6, 23.2], [22.2, 15]]
      .map((position, k) => ({ name: 'horsetailReed', position, variant: k % 4, scale: 1.1 })),
    ...[[-8, 12], [-5.5, 14.5], [20, -5.8], [16.5, 18], [18.6, 20.4]].map((position, k) => ({ name: 'waterLily', position, variant: k % 6, scale: 1.1 })),
  ],
  mist: [{ center: [6, 4], radius: 26, height: 1.1 }],
  // no tall plant within 10 m of the snag, nor within 7 m of the line from Mosi to it: she has the air round it, and he the view up
  // to her (the planner's sight lines to a far friend, world/forest/plan.js)
  lookout: [0, 3, 0],
  farFriends: { flugedla: SNAG },
  actors: {
    mosi: MOSI_TREE,
    egill: MOSI_TREE, // in the saddle on his back
    flugedla: { position: [SNAG[0], 0, SNAG[1]], heading: SNAG_HEADING },
  },
};

const TREE_SHOTS = {
  // Scene 2: they come in from the south-west, the white tree ahead with her on its top; from on the path behind them and to the left,
  // so the picture comes up on them (it is cut to under the black) and they walk on into it towards the tree.
  tre_arrive: { position: [-24, 2.1, -12.5], target: [8, 4.6, 4], fov: 50 },
  // The tree from the ground: from in front of her (she faces the way they came), near its foot, looking up its white trunk at her
  // on the top, the wings spread wide against the sky.
  tre_ground: { position: [2.1, 1.1, 5.1], target: [9, 11.4, 6.3], fov: 56 },
  // The tree from above: from 7 m up behind Mosi (as high as the director lets a camera go), the sun at our back, looking a little
  // down over him and Egill, below in the frame, to her on the top, above.
  tre_above: { position: [-10.5, 7.0, -9.5], target: [4.5, 6.0, 2.9], fov: 52 },
  // At her height: from 7 m up, 16 m off, almost level with her on the top, the open fen behind her.
  tre_her: { position: [-1.5, 7.0, -7.5], target: [9, 11.8, 6.3], fov: 40 },
  // Mosi and Egill looking up at her, from low in front of them.
  tre_talk: { position: [7.5, 1.4, -6], target: [0.8, 3.0, 0.4], fov: 48 },
  // Scene 3, the wind: held still while the child strokes. From low on Mosi's right, ahead of him: his face and Egill at the right,
  // looking and blowing up at her, she on the top of the white trunk at the upper left, the sky behind her for the leaves to fly in.
  tre_wind: { position: [5.5, 2.4, -7.5], target: [5, 6.2, 3], fov: 58 },
};
// Scene 5 is set in tre_above: she comes down beside Mosi, below in its frame, Egill floats across onto her back, and she flies up
// to the top, above in it (a shot of its own would make the planner deal the patch's plants again, and scenes 2 and 3 with them).
// Who each of the chapter's new shots is for: they must be in the frame while the camera holds it (kafli4.test.mjs)
export const SHOWS = {
  fen_farewell: ['mosi', 'egill', 'thorsedla'],
  fen_crossing: ['mosi'],
  tre_arrive: ['mosi', 'flugedla'],
  tre_ground: ['flugedla'],
  tre_above: ['mosi', 'flugedla'],
  tre_her: ['flugedla'],
  tre_talk: ['mosi', 'egill'],
  tre_wind: ['mosi', 'egill', 'flugedla'],
  pool_bank: ['flugedla', 'egill'], // Mosi comes into it from the reed
  pool_reed: [], // the reed the horn comes from: nobody to see
  pool_horn: ['egill', 'mosi'],
};

// ---------------------------------------------------------------------------------------------
// The lines: captions timed by their words until they are recorded (the plan's Task 15).

const WORDS = {
  // 1. Goodbye at Þórseðla's pool
  k4_mosi_next: 'Næst er það Flugeðla! Hann á heima uppi á hvíta trénu.',
  k4_egill_fly: 'Getur hann flogið?',
  k4_mosi_higher: 'Hærra en skýin!',
  k4_mosi_map_tree: 'Yfir Fenið, að hvíta trénu.',
  // 2. At the white tree
  k4_mosi_invite: 'Halló, Flugeðla! Viltu koma á Stjörnuhátíðina í kvöld?',
  k4_flugedla_calm: 'Hátíð! Ég skal kalla á allan skóginn! En það er logn… og án vinds kemst ég ekki á loft.',
  k4_egill_wind: 'Við getum búið til vind!',
  // (the juice review of 2026-11-07, its section 1: the goodbye said, and the white tree seen as they come)
  k4_egill_bye: 'Bless, Þórseðla!',
  k4_thorsedla_bye: 'Sjáumst á hátíðinni, Egill!',
  k4_egill_tree: 'Sjáðu! Hvíta tréð!',
  k4_mosi_sits: 'Þarna situr Flugeðla, efst á trénu.',
  // 3. The wind (Mosi's "Svona! Fúúú!" is the plan's own)
  k4_mosi_swipe: 'Strjúktu upp, Egill!',
  k4_mosi_blow: 'Svona! Fúúú!',
  k4_flugedla_more: 'Meira! Ég finn hann!',
  k4_flugedla_now: 'Nú!',
  k4_mosi_swipe2: 'Strjúktu fingrinum upp skjáinn!', // the juice review's: the hint said another way, and her cheers, and Egill's blow
  k4_flugedla_breeze: 'Ó! Smá vindur!',
  k4_flugedla_almost: 'Næstum því!',
  k4_egill_blow: 'Fúúú!',
  // 4. The invitation taken, and the star
  k4_flugedla_thanks: 'Takk! Ég kem á hátíðina og kalla á alla!',
  k4_mosi_star: 'Fjórða stjarnan!',
  k4_egill_circle: 'Sjáðu, Mosi! Flugeðla flýgur!', // the juice review's: as she circles the tree
  // 5. On her back
  k4_flugedla_comealong: 'Viltu koma með, Egill? Sestu á bakið á mér.',
  k4_egill_yes: 'Já!',
  k4_mosi_run: 'Fljúgið þið, ég hleyp!',
  k4_egill_up: 'Ég er kominn upp!', // the juice review's: on her back
  // 7. At the far pool (chunk 8, Task 17), recorded with the rest now
  k4_mosi_arrived: 'Ég… er… kominn!',
  k4_egill_what: 'Hvað var þetta?',
  k4_mosi_horn: 'Lúðurinn hennar Slóeðlu… en lagið var eitthvað skrítið.',
  // the juice review's: his thanks, the animals that came, and the ending as chapters 1 to 3 end
  k4_egill_thanks: 'Takk fyrir flugið, Flugeðla!',
  k4_flugedla_came: 'Sjáðu! Dýrin komu öll með okkur!',
  k4_mosi_four: 'Fjórar komnar. Og nú vitum við hvert við förum næst!',
  k4_flugedla_play: 'Viltu spila við mig, Egill?',
};

// ---------------------------------------------------------------------------------------------
// The scenes, in turn. `c` holds the cast and what the scenes share.

const HER_HEAD = { actor: 'thorsedla', part: 'head' };
const EGILL_HEAD = { actor: 'egill', part: 'head' };
const MOSI_HEAD = { actor: 'mosi', part: 'head' };
const FLUGEDLA_HEAD = { actor: 'flugedla', part: 'head' };
const HER_LOOK = { weight: 1, maxAngle: 20, maxPitch: 20 }; // Þórseðla's look turns the base of her neck too: a small aim (kafli3-thorsedla.js)

function* story(s, c) {
  yield* goodbyeAtThePool(s, c);
  yield* atTheWhiteTree(s, c);
  yield* makeTheWind(s, c);
  yield* roundTheTree(s, c);
  yield* onHerBack(s, c);
  yield* upAndAway(s, c);
  yield* atTheFarPool(s, c);
}

// 1. Goodbye at Þórseðla's pool: who is next, the map draws the way on across the Fen, her head comes down to them in goodbye (a tap
// on her: a nod), and they go.
function* goodbyeAtThePool(s, c) {
  mark(c, 1);
  const { mosi, egill } = c;
  thorsedlaLife(s, c); // she nods and bites her conifer as in chapter 3
  s.target('thorsedla', { point: 'thorsedla', radius: 2.6 });
  const unhear = s.onTap('thorsedla', () => { c.bye ??= s.after(0, () => goodbye(s, c, 'tap')); });
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.6, maxPitch: 35 });
  yield egill.lookAt(MOSI_HEAD, { weight: 0.6, maxPitch: 30 });
  yield* say(s, c, 'mosi', 'k4_mosi_next');
  yield* say(s, c, 'egill', 'k4_egill_fly');
  yield* say(s, c, 'mosi', 'k4_mosi_higher');
  // The map slides up over the game and draws piece d, from her pool to Flugeðla's circle, while Mosi says where they are going.
  yield* mapMoment(s, c, { pieces: ['d'], line: 'k4_mosi_map_tree', speak: (speaker, id) => say(s, c, speaker, id) });
  // Her head comes down to them: goodbye. A goodbye from a tap still going ends first.
  if (c.bye) yield c.bye;
  yield s.camera.cut('fen_farewell');
  yield mosi.lookAt(HER_HEAD, { weight: 0.8, maxPitch: 45 });
  yield egill.lookAt(HER_HEAD, { weight: 0.9, maxPitch: 50 });
  c.bye = s.after(0, () => goodbye(s, c, 'leaving'));
  // Egill says goodbye as her head comes down, and she answers (the juice review)
  yield s.wait(0.6);
  yield* say(s, c, 'egill', 'k4_egill_bye');
  yield* say(s, c, 'thorsedla', 'k4_thorsedla_bye');
  yield c.bye;
  unhear();
  s.target('thorsedla', null);
  // and they go, north out of the Fen toward the white snag, while the picture fades to it
  yield mosi.lookAt(null);
  yield egill.lookAt(null);
  yield s.camera.cut('fen_crossing');
  c.fenWalk = mosi.walkTo(FEN_WAY, { speed: 1.25, turnRate: 50 });
  yield s.wait(7.5);
}

/**
 * Þórseðla's goodbye: from a tap, a friendly nod (kink); as they go, her head comes down part of the way to them, holds a moment
 * and goes up again. She looks at Egill meanwhile, and her own nods and bites wait (c.life).
 */
const BOW_EYES = 4.6; // m over her ground her eyes come down to as they go: a little over Egill's in the saddle
const BOW_HOLD = 1.6; // seconds her head holds down there
function* goodbye(s, c, by) {
  const her = c.thorsedla.raw;
  c.goodbyes.push({ by, at: s.time });
  c.life.hold();
  her.lookAt(EGILL_HEAD, HER_LOOK);
  try {
    if (by === 'tap') {
      her.play('kink', { once: true, fade: 0.4 });
      yield s.wait(2.8);
    } else {
      const lowering = her.play('lowerHead', { fade: 0.8 });
      const ground = c.world.heightAt(her.root.position.x, her.root.position.z);
      const eyes = () => her.headPosition(c.point).y - ground;
      const from = s.time;
      yield s.until(() => eyes() <= BOW_EYES || s.time - from >= 4.5);
      if (lowering) lowering.paused = true; // and holds there
      yield s.wait(BOW_HOLD);
    }
    her.play('idle', { fade: 1.8 });
    her.lookAt(null);
    yield s.wait(1.8);
  } finally {
    c.life.free();
    c.bye = null;
  }
}

// 2. At the white tree: she sits on its very top, her wings spread and still: there is no wind. Mosi invites her; she would call the
// whole forest, but she cannot take off without wind; Egill can make wind.
function* atTheWhiteTree(s, c) {
  yield* goTo(s, c, 'hvitatre', () => arriveAtTheTree(s, c));
  mark(c, 2);
  const { mosi, egill, flugedla } = c;
  // they come in from the south-west, the white tree ahead, and stop below it (tre_arrive: cut to under the black)
  const coming = mosi.walkTo(TREE_IN, { speed: 1.3 });
  yield s.wait(3);
  yield mosi.lookAt(FLUGEDLA_HEAD, { weight: 0.6, maxPitch: 45 });
  yield egill.lookAt(FLUGEDLA_HEAD, { weight: 0.7, maxPitch: 45 });
  yield* say(s, c, 'egill', 'k4_egill_tree'); // as they come (the juice review)
  yield coming;
  yield mosi.turnTo(MOSI_TREE.heading, { rate: 30 });
  // the tree from the ground: she sits on the top, the wings spread, and nothing stirs
  yield s.camera.cut('tre_ground');
  yield s.wait(0.6);
  yield* say(s, c, 'mosi', 'k4_mosi_sits');
  yield s.wait(0.6);
  yield s.camera.cut('tre_above');
  yield mosi.lookAt(FLUGEDLA_HEAD, { weight: 0.85, maxPitch: 50 });
  yield egill.lookAt(FLUGEDLA_HEAD, { weight: 0.9, maxPitch: 55 });
  yield* say(s, c, 'mosi', 'k4_mosi_invite');
  yield s.camera.cut('tre_her');
  // her place on the book's map, which her tile shows by: chapter 3's lookout marks it, but an old chapter 2 save comes here without
  // chapter 3 (save.js defaultChapter); when it is there already nothing flies
  s.place('flugedla');
  yield flugedla.lookAt(MOSI_HEAD, { weight: 0.8, maxAngle: 60, maxPitch: 50 });
  yield* say(s, c, 'flugedla', 'k4_flugedla_calm');
  yield s.camera.cut('tre_talk');
  yield flugedla.lookAt(EGILL_HEAD, { weight: 0.8, maxAngle: 60, maxPitch: 55 });
  yield egill.lookAt(FLUGEDLA_HEAD, { weight: 0.9, maxPitch: 55 });
  yield* say(s, c, 'egill', 'k4_egill_wind');
  yield s.wait(1.5);
}

// 3. The wind: the child strokes up the screen for each gust, Mosi and Egill blow along, and six gusts lift her (kafli4-wind.js). The
// camera holds still from behind them, so the child's hands have a still picture to aim at.
function* makeTheWind(s, c) {
  mark(c, 3);
  const { mosi, egill, flugedla } = c;
  yield s.camera.cut('tre_wind');
  yield mosi.lookAt(FLUGEDLA_HEAD, { weight: 0.85, maxPitch: 50 });
  yield egill.lookAt(FLUGEDLA_HEAD, { weight: 0.9, maxPitch: 55 });
  yield flugedla.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 60, maxPitch: 55 });
  const release = s.seeking ? null : c.world.sound?.hold?.(c.sounds);
  try {
    yield* theWind(s, c);
  } finally {
    release?.();
  }
}

// 4. The invitation taken: off the top on the wind, she glides once round the white tree and sits on it again, and thanks them. The
// fourth star rises from her and waits for the child's tap.
function* roundTheTree(s, c) {
  mark(c, 4);
  const { mosi, egill, flugedla } = c;
  s.after(0, () => windUp(s, c));
  yield flugedla.lookAt(null);
  c.perch.release();
  c.held = holdHer(c);
  // low behind Mosi's right the camera follows her round: Mosi and Egill in front of it, looking up after her, the sky round the tree
  const [x, over, z] = CIRCLE.camera;
  watchHer(c, 'tre_circle', { position: [x, c.world.heightAt(x, z) + over, z], fov: CIRCLE.fov, lag: 0.5, from: c.perch.top.toArray() });
  yield mosi.lookAt(FLUGEDLA_HEAD, { weight: 0.8, maxAngle: 70, maxPitch: 50 });
  yield egill.lookAt(FLUGEDLA_HEAD, { weight: 0.9, maxAngle: 80, maxPitch: 55 });
  s.after(CIRCLE_LINE, () => say(s, c, 'egill', 'k4_egill_circle')); // as she circles (the juice review)
  yield* flyPath(s, c, c.held, { points: circlePoints(c), ...CIRCLE, face: SNAG_HEADING });
  flugedla.raw.play('idle', { fade: 0.8 });
  yield s.wait(0.4);
  yield s.camera.cut('tre_her');
  yield flugedla.lookAt(MOSI_HEAD, { weight: 0.8, maxAngle: 60, maxPitch: 50 });
  yield* say(s, c, 'flugedla', 'k4_flugedla_thanks');
  // the star rises from her, as in the chapters before (it waits in this shot for the child's tap, and flies into the book)
  yield s.camera.cut('tre_above');
  s.sfx('star');
  const star = s.star('k4_flugedla', STAR_FROM);
  yield s.wait(1.4);
  yield* say(s, c, 'mosi', 'k4_mosi_star');
  yield star;
  s.sfx('journal');
  yield s.wait(0.8);
}

// 5. On her back: she asks Egill along, comes down and sits low beside Mosi, a saddle pops onto her back between her wings with a
// burst of sparkles (engine/flier-saddle.js, as Mosi's in chapter 1), and Egill floats from Mosi's saddle onto hers (engine/riding.js:
// floatTo). Mosi will run. She flies up to the top again with him.
function* onHerBack(s, c) {
  mark(c, 5);
  const { mosi, egill, flugedla, world } = c;
  yield s.camera.cut('tre_her');
  yield flugedla.lookAt(EGILL_HEAD, { weight: 0.8, maxAngle: 60, maxPitch: 55 });
  yield* say(s, c, 'flugedla', 'k4_flugedla_comealong');
  yield s.camera.cut('tre_talk');
  yield* say(s, c, 'egill', 'k4_egill_yes');
  // down from the top, round over them, and onto the ground at Mosi's left
  yield flugedla.lookAt(null);
  const board = new world.THREE.Vector3(BOARD.position[0], 0, BOARD.position[1]);
  board.y = world.heightAt(board.x, board.z);
  // from above behind Mosi the camera follows her down, and comes back to the shot as she lands
  watchHer(c, 'tre_down', { position: TREE_SHOTS.tre_above.position, fov: TREE_SHOTS.tre_above.fov });
  yield* flyPath(s, c, c.held, { points: downPoints(c, board), ...DOWN, face: BOARD.heading });
  flugedla.raw.play('idle', { fade: 0.8 });
  // and closes in on her and Mosi side by side as she settles, her back seen from above (the pan and the lens within the rules)
  const middle = [BOARD.position[0] / 2, world.heightAt(BOARD.position[0] / 2, BOARD.position[1] / 2) + 2.2, BOARD.position[1] / 2];
  yield s.camera.move({ position: TREE_SHOTS.tre_above.position, target: middle, fov: BOARD.fov, label: 'tre_board' }, { duration: 3 });
  // Egill floats across onto her back, and sits there as on a flier (engine/flier.js: rideFlier), her root the scenes' own
  yield mosi.lookAt(FLUGEDLA_HEAD, { weight: 0.7, maxAngle: 70, maxPitch: 40 });
  yield flugedla.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 45 });
  yield egill.lookAt(null);
  s.sfx('saddle');
  yield c.herSaddle.appear();
  s.sfx('float');
  c.boarding = s.time; // from here he is on her, or on his way
  yield floatTo(egill.raw, backSeat(c), { duration: FLOAT });
  c.ridden = { actor: flugedla.raw, get root() { return c.flier?.root ?? c.held.root; } }; // the flight's root once it flies
  c.riding = rideFlier(egill.raw, c.ridden, { settle: SETTLE, saddle: c.herSaddle }); // from upright under the seat onto her tipped back
  yield flugedla.lookAt(null);
  yield* say(s, c, 'egill', 'k4_egill_up'); // on her back (the juice review)
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.8, maxAngle: 70, maxPitch: 45 });
  yield* say(s, c, 'mosi', 'k4_mosi_run');
  // up to the top again with him, and round on it to face the way she will leap
  watchHer(c, 'tre_up', { position: TREE_SHOTS.tre_above.position, fov: TREE_SHOTS.tre_above.fov, zoom: 2.5 });
  yield mosi.lookAt(FLUGEDLA_HEAD, { weight: 0.85, maxAngle: 70, maxPitch: 50 });
  yield* flyPath(s, c, c.held, { points: upPoints(c, board), ...UP, face: c.leapHeading });
  flugedla.raw.play('idle', { fade: 0.6 });
  yield s.wait(0.5);
}

// 6. The flight: close in front of Egill on her back, the flight's own first shot (kafli4-flight.js, beat A) as she turns her head to
// him, and under it the place changes to Árdalurinn with no black (s.goTo with fade 0: a place already built is changed to within
// the frame, engine/locations.js). She sits on its snag as she sits here, facing the same way, so the shot goes on round them
// unbroken and only what is behind them changes. Then the flight (kafli4-flight.js), to the far pool.
function* upAndAway(s, c) {
  const { world, mosi, egill, flugedla } = c;
  const closeUp = createFlightCamera(world.director, perchedFlier(c), { world, egill: egill.raw, reduced: c.reduced });
  closeUp.shot('face', TAKE_OFF_FACE);
  yield flugedla.lookAt(EGILL_HEAD, { weight: 0.7, maxAngle: 70, maxPitch: 40 });
  yield s.wait(1.6);
  mark(c, 6);
  void closeUp; // not stopped: the flight's camera takes the shot on as its own, one shot of 1.6 s here and 3 s there
  s.goTo('ardalur', { fade: 0 });
  yield s.until(() => world.location === 'ardalur');
  // in the same frame: the flier takes her over on the valley's snag, and Egill rides on it as he did on her here
  mosi.raw.stop();
  const flier = (c.flier = createFlier(flugedla.raw, ROUTE, { world, reduced: c.reduced }));
  flier.update(0);
  const camera = createFlightCamera(world.director, flier, { world, egill: egill.raw, reduced: c.reduced });
  const f = { s, world, flugedla, egill, mosi, route: ROUTE, flier, riding: c.riding, camera, sounds: c.sounds, song: c.song, reduced: c.reduced, flight: null, doc: c.doc };
  f.beds = true; // the forest's bed from C, the Fen's again at the far pool (the review flight has none)
  f.say = c.lines.say;
  Object.defineProperty(f, 'speaking', { get: () => c.lines.speaking });
  f.mark = scene => {
    f.flight.beat = scene;
    world.chapterTimeline.push({ scene, at: s.time });
  };
  c.flight = f;
  s.after(LOOK_BACK, () => { flugedla.lookAt(null); return null; }); // her head forward again before she leaps (kafli4-route.js: LEAP)
  yield* theFlight(s, f); // and over the far pool, gliding low over the water, scene 7 takes her on in the same frame
}

// 7. The far pool (spec 4.7, kafli4-route.js: FAR_POOL): from the bank a camera turns to follow her as she glides in low over the
// water from the flight, slowing, and lands in the shallows with a splash; Egill floats down onto the bank, and Mosi comes out of the
// reed, out of breath. Then, from the reed across the pool, a horn, false and sad; they look, Egill asks, and Mosi knows it. The
// chapter ends as chapter 3 ends: into the book, open on the dinosaurs, Flugeðla's tile new and nodding, and then the map.
function* atTheFarPool(s, c) {
  mark(c, 7);
  const { world, mosi, egill, flugedla } = c;
  const her = flugedla.raw;
  // the animals that came to the festival stand idle on the far pool's bank, beyond Egill and Mosi (world/ardalur/life.js arrivals)
  world.forest?.life?.arrive?.();
  s.sfx('fen'); // the Fen's bed again, by the far pool's reed
  // the flier gives her back where the flight left her, at its speed, and the scenes' root takes her on: Egill rides on it
  const speed = c.flier.speed;
  c.flier.stop();
  c.flier = null;
  c.held = holdHer(c);
  mosi.raw.stop();
  mosi.raw.root.visible = false; // in the reed, out of sight till the bank's shot
  const body = c.held.root.position.clone().setY(c.held.root.position.y + BODY_HEIGHT);
  c.poolView = watchHer(c, 'pool_glide', { ...FAR_POOL.glide, from: body.toArray(), lag: 0.35 });
  c.landing = { touchAt: null, floatAt: null, downAt: null };
  yield* landInThePool(s, c, speed);
  // she hops for joy in the shallows (her clip 'happy', 2.4 s), then stands
  her.play('happy', { once: true, fade: 0.25 });
  s.after(HAPPY, () => { her.play('idle', { fade: 0.8 }); return null; });
  // she stands in the shallows, close now, and Egill on her back laughs at the splash
  yield s.wait(0.3);
  yield s.camera.cut('pool_bank');
  yield flugedla.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 45 });
  yield* say(s, c, 'egill', 'k4_egill_laugh2');
  yield s.wait(1.6);
  // Egill floats down onto the bank by her, and looks up at her; then Mosi comes out of the reed, out of breath
  c.riding.stop();
  s.sfx('float');
  c.landing.floatAt = s.time;
  const [bx, bz] = FAR_POOL.bank;
  yield floatDown(egill.raw, backSeat(c), FAR_POOL.bank, { duration: FLOAT_DOWN, heading: headingTo([bx, bz], FAR_POOL.mosi) });
  c.landing.downAt = s.time;
  yield egill.lookAt(FLUGEDLA_HEAD, { weight: 0.8, maxAngle: 70, maxPitch: 50 });
  yield* say(s, c, 'egill', 'k4_egill_thanks'); // the juice review
  yield s.wait(WHERE_IS_MOSI);
  const reed = FAR_POOL.reed;
  mosi.place(reed[0], reed[1], headingTo(reed, FAR_POOL.mosi));
  mosi.raw.root.visible = true;
  const out = mosi.walkTo([FAR_POOL.mosi], { speed: TIRED, turnRate: 40 });
  yield mosi.lookAt(LOW_AHEAD, { weight: 0.5, maxPitch: 30 }); // his head low: out of breath
  yield s.wait(0.5);
  yield egill.lookAt(MOSI_HEAD, { weight: 0.7, maxPitch: 30 });
  yield s.wait(OUT_OF_THE_REED);
  yield* say(s, c, 'mosi', 'k4_mosi_arrived');
  yield out;
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 35 });
  // she sees those that came, standing on the bank beyond them (the juice review)
  yield flugedla.lookAt(MOSI_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 35 });
  yield* say(s, c, 'flugedla', 'k4_flugedla_came');
  yield s.wait(BREATH);
  // the horn, from the reed across the pool, in the quiet: the flight's song has all but ended (what is left of it goes), the picture
  // goes to the reed, and they all turn to look
  c.song?.stop(1.2);
  yield s.wait(1.6);
  yield s.camera.cut('pool_reed');
  const from = new world.THREE.Vector3(FAR_POOL.farReed[0], world.heightAt(...FAR_POOL.farReed) + 1.4, FAR_POOL.farReed[1]);
  s.sfx('sloedlaHorn', { pan: panOf(world, from) });
  c.horn = { at: s.time, from: [...FAR_POOL.farReed] };
  const way = headingTo(FAR_POOL.mosi, FAR_POOL.farReed);
  mosi.turnTo(way, { rate: 35 });
  egill.turnTo(headingTo(FAR_POOL.bank, FAR_POOL.farReed), { rate: 60 });
  yield mosi.lookAt(from, { weight: 0.8, maxAngle: 60, maxPitch: 30 });
  yield egill.lookAt(from, { weight: 0.85, maxAngle: 60, maxPitch: 30 });
  yield flugedla.lookAt(from, { weight: 0.7, maxAngle: 70, maxPitch: 30 });
  yield s.wait(HORN_HOLD);
  yield s.camera.cut('pool_horn');
  yield s.wait(1.2);
  yield* say(s, c, 'egill', 'k4_egill_what');
  yield egill.lookAt(MOSI_HEAD, { weight: 0.7, maxPitch: 30 });
  yield* say(s, c, 'mosi', 'k4_mosi_horn');
  yield s.wait(1.2);
  // once more the far reed, still now, as the chapter's theme comes back (out since the take-off): where chapter 5 begins, and Mosi
  // says where they stand, as chapters 2 and 3 end
  yield s.camera.cut('pool_reed');
  world.music?.setLevel?.(1, 3);
  yield s.wait(LAST_LOOK.before);
  yield* say(s, c, 'mosi', 'k4_mosi_four');
  yield s.wait(LAST_LOOK.after);
  // she asks Egill to play her game, as Kambeðla does at the end of chapter 1 (its star has opened it in the book)
  yield s.camera.cut('pool_bank');
  yield flugedla.lookAt(EGILL_HEAD, { weight: 0.8, maxAngle: 70, maxPitch: 50 });
  yield egill.lookAt(FLUGEDLA_HEAD, { weight: 0.8, maxAngle: 70, maxPitch: 50 });
  yield* say(s, c, 'flugedla', 'k4_flugedla_play');
  // into the book, as chapter 1 ends: open on its games, where her game waits, new
  mark(c, 'end');
  s.fade(0.45, 1.6);
  s.journal.open('games');
  yield s.wait(BOOK_HOLD);
}
const FLOAT_DOWN = 2.6; // seconds Egill floats from her back onto the bank
const WHERE_IS_MOSI = 1.8; // seconds Egill stands on the bank, looking up at her, before Mosi comes out of the reed
const OUT_OF_THE_REED = 1.2; // seconds Mosi walks before he says he is here
const TIRED = 1.1; // m/s: Mosi walks out of the reed, out of breath (he walks at 1.3)
const LOW_AHEAD = { actor: 'mosi', part: 'feet', offset: [7, 0.3, 0], local: true }; // where he looks as he gets his breath: the ground ahead
const BREATH = 2.4; // seconds Mosi gets his breath before the horn
const HORN_HOLD = 4; // seconds the far reed's shot holds: the horn is 2.8 s and its echo
const LAST_LOOK = { before: 0.8, after: 0.6 }; // seconds the last shot of the far reed holds before and after Mosi's „Fjórar komnar“
const BOOK_HOLD = 1.6; // seconds the chapter waits once the book opens on its games
const HAPPY = 2.2; // seconds into her happy hop (the clip is 2.4 s) that she goes back to standing

/**
 * Her glide in, from where the flight left her, at its speed, slowing on over the water and round onto the shallows, and down onto the
 * pool's bed: the land clip begins so that its feet come down (2.1 s into it) as hers touch the water, and they touch with a splash.
 */
function* landInThePool(s, c, speed) {
  const { world } = c;
  const from = c.held.root.position;
  const [lx, lz] = FAR_POOL.landing;
  const level = FAR_POOL.level;
  const points = [
    from.toArray(), [from.x + 9, level + 0.3, from.z + 3.5], [lx - 6.5, level + 0.2, lz - 9], [lx - 2.2, level + 0.05, lz - 3.2],
    [lx, world.heightAt(lx, lz), lz],
  ];
  const { seconds, touch } = landingTime(points, speed, level);
  const land = Math.max(0.05, (touch - LAND_TOUCH) / seconds);
  let gliding = true;
  function* splash() {
    while (gliding && c.held.root.position.y > level) yield;
    if (!gliding) return;
    const at = c.held.root.position.clone();
    c.landing.touchAt = s.time;
    s.sfx('skim');
    for (const [delay, strength] of SPLASH) s.after(delay, () => { world.forest?.rippleAt?.(at.x, at.z, strength); return null; });
    // seen (the juice review): the splash, a second smaller one as her body settles, and the lens closing in a little (not under
    // reduced motion); those that came on the bank hop for joy and call
    if (world.effects && world.scene && !s.seeking) {
      splashOf(world, new world.THREE.Vector3(at.x, level, at.z), { size: 1, seed: 'far pool' });
      s.after(0.35, () => { splashOf(world, new world.THREE.Vector3(at.x, level, at.z), { size: 0.6, seed: 'far pool 2' }); return null; });
    }
    if (!c.reduced) c.poolView?.pushIn?.(POOL_PUSH.degrees, POOL_PUSH.seconds);
    world.forest?.life?.cheer?.(s.time + 0.3);
    if (!s.seeking) for (const [after, name, pan] of CHEERS) s.after(after, () => { s.sfx(name, { pan }); return null; });
  }
  const watching = s.after(0, splash);
  yield* flyPath(s, c, c.held, { points, speed, clips: [[0, 'glide', 0.6], [land, 'land', 0.5]], face: FAR_POOL.facing, turn: 0.3, turnIn: 0.1, landing: 'water' });
  gliding = false;
  void watching;
}
const LAND_TOUCH = 2.1; // seconds into her land clip that its feet come down (pteranodon-source.json)
const SPLASH = [[0, 1], [0.25, 0.7], [0.6, 0.45]]; // the rings in the water as she comes down: [seconds after the touch, strength]
const POOL_PUSH = { degrees: 2.5, seconds: 1.2 }; // the lens closes in as she touches the water
// those that came, calling as they hop: [seconds after the touch, sound, pan]
const CHEERS = [[0.5, 'lizards', -0.35], [0.85, 'grazers', 0.3], [1.2, 'flyers', 0.5], [1.6, 'lizards', 0.15]];

/** The way (degrees, 0 facing +X and 90 facing +Z) from [x, z] `a` to [x, z] `b`. */
const headingTo = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

const FLOAT = 2.6; // seconds Egill floats onto her back
const SETTLE = 0.4; // seconds he then takes to settle into her seat, as his hands take to reach her neck
const CIRCLE_LINE = 3; // seconds into her circle round the tree that Egill says so
const LOOK_BACK = 2.6; // seconds into the flight her head turns forward again from Egill (she leaps at 3.5)
const STAR_FROM = { actor: 'flugedla', part: 'head', offset: [0, 0.8, 0] }; // the star rises from over her head

// Her flights round the white tree, in metres over its top: the circle once round it (spec 4.4), down to Mosi's side and up again.
// Each takes her from where she is to her feet's place at the end; the clips as she goes ([share of the time, clip, fade]).
const CIRCLE = {
  radius: 9.5, // wide of the tree: nothing tall within 9 m of it (kafli4.test.mjs)
  above: 2.4, // the circle's height over the top
  seconds: 13,
  clips: [[0, 'glide', 0.8], [0.06, 'fly', 0.6], [0.3, 'glide', 0.8], [0.76, 'land', 0.5]],
  turn: 0.22, // she turns to face Mosi again over the last of it, as she lands
  camera: [-2, 1.6, -9], // where the camera stands to follow her (x, metres over the ground, z): clear sky round the tree from there
  fov: 56,
};
const DOWN = { seconds: 7.5, clips: [[0, 'takeOff', 0.3], [0.32, 'glide', 0.8], [0.6, 'land', 0.5]], turn: 0.3 };
const UP = { seconds: 8, clips: [[0, 'takeOff', 0.3], [0.3, 'fly', 0.6], [0.52, 'glide', 0.8], [0.62, 'land', 0.5]], turn: 0.3 };

/**
 * Once round the tree: out over Mosi the way she faces, round the tree counterclockwise (seen from above: from +X toward +Z) at
 * CIRCLE.radius, a little over its top, and in again from the far side of where she left, on to the top (her feet on it).
 */
function circlePoints(c) {
  const top = c.perch.top;
  const from = c.held.root.position;
  const round = (angle, radius, over) => [top.x + radius * Math.cos(rad(angle)), top.y + over, top.z + radius * Math.sin(rad(angle))];
  const points = [from.toArray(), round(SNAG_HEADING, 3.5, 1.4)];
  for (let angle = SNAG_HEADING + 40; angle <= SNAG_HEADING + 360; angle += 45) points.push(round(angle, CIRCLE.radius, CIRCLE.above + 0.5 * Math.sin(rad(angle - SNAG_HEADING))));
  points.push(round(SNAG_HEADING + 385, 4.5, 1.2), top.toArray());
  return points;
}

/** From the top out east, away from the camera behind Mosi, round south of them, and in onto the ground at Mosi's left, facing as he does. */
function downPoints(c, board) {
  const top = c.perch.top;
  const ground = c.world.heightAt.bind(c.world);
  const at = (x, z, over) => [x, ground(x, z) + over, z];
  return [top.toArray(), at(14, 1, 8), at(12, -7, 5.5), at(5, -10.5, 3.2), at(0.2, -8.2, 1.6), board.toArray()];
}

/** From her place by Mosi up beside the tree and round onto its top from the south-east, along the way she will leap. */
function upPoints(c, board) {
  const top = c.perch.top;
  const ground = c.world.heightAt.bind(c.world);
  const at = (x, z, over) => [x, ground(x, z) + over, z];
  const away = rad(c.leapHeading); // she comes onto the top along this heading
  const before = (metres, over) => [top.x - metres * Math.cos(away), top.y + over, top.z - metres * Math.sin(away)];
  return [board.toArray(), at(6.6, -3.0, 2.2), at(11.8, -2.6, 6.4), before(5.5, 1.6), top.toArray()];
}

/**
 * Where Egill floats to on her back: her saddle's seat (engine/flier-saddle.js) once it is on her, else the seat on her Spine bone
 * (engine/flier.js: SEAT); his root as far under it as he sits.
 */
function backSeat(c) {
  const her = c.flugedla.raw;
  const bone = her.model.getObjectByName(SEAT.bone);
  const seat = new c.world.THREE.Vector3();
  return {
    host: her,
    update() {
      her.root.updateMatrixWorld(true);
      const on = c.herSaddle?.ready && c.herSaddle.shown ? c.herSaddle.update() : null;
      if (on) seat.copy(on.seat);
      else bone.localToWorld(seat.set(...SEAT.local));
      seat.y -= SIT_DEPTH;
      return seat;
    },
  };
}

/** What the flight camera needs of a flier for the close-up on the white tree: her heading on it (Egill's head is the shot's origin). */
function perchedFlier(c) {
  return {
    route: { waterAt: () => null },
    heading: c.leapHeading,
    bank: 0,
    t: 0,
    pose: { position: c.held.root.position },
  };
}

/** The wind up, now that she flies on it: from the big gust back to the forest's own over 3 s, and the clouds slower. */
function* windUp(s, c) {
  const strength = c.world.wind?.uniforms?.uWindStrength;
  const sky = c.world.sky;
  const from = { wind: strength?.value ?? 1, clouds: sky?.cloudSpeed ?? 1 };
  const start = s.time;
  for (;;) {
    const k = Math.min(1, (s.time - start) / WIND_UP.seconds);
    const e = k * k * (3 - 2 * k);
    if (strength) strength.value = from.wind + (1 - from.wind) * e;
    sky?.setCloudSpeed?.(from.clouds + (WIND_UP.clouds - from.clouds) * e);
    if (k >= 1) return;
    yield;
  }
}
const WIND_UP = { seconds: 3, clouds: 4 };

/**
 * At the white tree, under the black: Þórseðla stays behind (her life holds, hidden), Mosi stands where the picture comes up on him
 * with Egill in the saddle, Flugeðla sits on the top of the snag, and there is no wind.
 */
function arriveAtTheTree(s, c) {
  const { world, mosi, thorsedla } = c;
  c.life.hold();
  thorsedla.raw.root.visible = false;
  mosi.raw.stop();
  mosi.place(TREE_START.position[0], TREE_START.position[2], TREE_START.heading);
  c.perch = perch(c, { near: SNAG, heading: SNAG_HEADING });
  if (world.wind) world.wind.uniforms.uWindStrength.value = CALM; // logn: the reed and the grass stand still
  s.camera.cut('tre_arrive'); // the picture comes up on them, not on the Fen's last view of this place
  c.leapHeading = perchedHeading(ROUTE); // she sits on the top this way before the cut into the flight
  return readyTheValley(s, c);
}

/**
 * Árdalurinn, under the white tree's black: built, Grameðla's model made for its far land, and the whole of it drawn once, so the cut
 * into it later, in view, is no long frame (main.js draws a place as it comes there only under a black). In play all of that is done
 * before the start button shows (readyFirst) and this is quick; a capture or ?play=1 has no button, and it is done here.
 */
async function readyTheValley(s, c) {
  const { world } = c;
  const valley = await s.prepare('ardalur');
  const far = valley.farLand ?? null;
  if (far) {
    far.prefetch();
    if (s.seeking) far.load(); // a capture goes on at once and has her long before she is seen (chapters/flug.js)
    else await far.load();
  }
  const parts = [valley.group, valley.waterfall?.group, far?.group, valley.animals?.group, far?.gramedla?.shadow];
  world.warmObjects?.(parts.filter(Boolean));
  return valley;
}
const CALM = 0.08; // the wind's strength at the white tree before Egill makes some (engine/wind.js: 1 is the forest's)
const ROUTE = createRoute({ wingspan: 7.5 }); // the flight's way through Árdalurinn (kafli4-route.js), at her size

/** Less motion: the page's ask (prefers-reduced-motion), ?reduced=1, or what a test's world says. */
function reducedMotion(world) {
  if (typeof world.reduced === 'boolean') return world.reduced;
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  return params.get('reduced') === '1' || Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/**
 * Fade to another place, set it up while the screen is black, and fade in (as chapter 2 does). What the setting up returns, a
 * promise or nothing, holds the black until it settles (s.goTo's hold).
 */
function* goTo(s, c, name, setUp) {
  let holding = null;
  const going = s.goTo(name, { hold: () => holding });
  yield s.until(() => c.world.location === name);
  holding = setUp() ?? null;
  yield going;
}

/** A line, one voice at a time: `c.saying` counts the lines under way, so a goodbye can wait for quiet. */
function* say(s, c, speaker, id, options) {
  c.saying = (c.saying ?? 0) + 1;
  try {
    yield s.say(speaker, id, options);
    c.lastSaid = id;
  } finally {
    c.saying--;
  }
}

/** Note when a scene starts (world.chapterTimeline, for captures and probes). */
function mark(c, scene) {
  c.world.chapterTimeline?.push({ scene, at: c.s.time });
}

// ---------------------------------------------------------------------------------------------

export const chapter = {
  id: 'kafli4',
  title: 'Boð til Flugeðlu',
  next: null, // the last chapter so far
  look: 'earlyAfternoon',
  // Chapter 2's song, out from the take-off till the last look at the far reed: the flight has its own (kafli4-flight.js SONG)
  theme: 'kafli2/theme.json',
  start: 'fen',
  locations: {
    // chapter 3's layout, planted for chapter 3's late morning sun: the planner keeps the sun's way into a clearing clear of big crowns,
    // and this chapter's sun stands elsewhere (world/forest/plan.js: plantedFor)
    fen: { layout: { ...FEN.layout, plantedFor: kafli3.look }, shots: { ...FEN.shots, ...FEN_SHOTS }, warmUp: FEN_WARM },
    hvitatre: { layout: HVITATRE_LAYOUT, shots: TREE_SHOTS, warmUp: ['tre_arrive', 'tre_ground', 'tre_wind', 'tre_above'] },
    // the flight's valley in its real look; its shots are the flight camera's (engine/camera/flight-camera.js), and the far pool's for
    // scene 7 (kafli4-route.js: FAR_POOL). Readied before the start button shows (readyFirst, below): its far land's models loaded,
    // so that they are drawn then too. Its other sections are still built a slice a frame as she flies (all of them here would double
    // the wait for the start button).
    ardalur: {
      // the owner's small lizard first (world/ardalur/animals.js: loadCritters), so C's lizards are his from their first frame
      build: async world => createArdalur(world, { grey: false, route: ROUTE, critters: await loadCritters(world) }), shots: FAR_POOL.shots, warmUp: [],
      async ready(world, valley) {
        valley.farLand?.prefetch();
        await valley.farLand?.load();
      },
    },
  },
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', ...MOSI_FEN }, // on his hummock, Egill on his back: the script seats him in the saddle
    egill: { url: '../assets/characters/egill.glb', ...MOSI_FEN },
    thorsedla: { url: '../assets/characters/brontosaurus.glb', ...THORSEDLA },
    flugedla: { url: '../assets/characters/pteranodon.glb', position: [SNAG[0], 0, SNAG[1]], heading: SNAG_HEADING }, // hidden in the Fen
  },
  // Caption names; the colour is the dark tone of each character's main hue (STYLE.md section 3).
  cast: {
    mosi: { name: 'Mosi', colour: '#4f5433' },
    egill: { name: 'Egill', colour: '#355774' },
    thorsedla: { name: 'Þórseðla', colour: '#89682e' },
    flugedla: { name: 'Flugeðla', colour: '#955055' },
  },
  // the scenes' lines and the flight's (kafli4-flight.js; the review chapter flug.js has only those)
  lines: Object.fromEntries(Object.entries({ ...WORDS, ...FLIGHT_WORDS }).map(([id, text]) => [id, { text, audio: id }])),
  // The camera shows this shot while the start button waits: chapter 3's last view of them, from the south across her pool.
  startShot: 'fen_star_rise',
  // The white tree is built once the start button shows, a slice at a time, and kept, hidden (engine/locations.js: prepare; main.js).
  prepare: ['hvitatre'],
  // Árdalurinn is built and drawn before the button shows (main.js getReady): the scene cuts to it in view, with no black to hide its
  // first draw, and a quick tap would leave its build and its shaders (some 2-4 s on the laptop) to the white tree's black.
  readyFirst: ['ardalur'],

  /**
   * What the chapter draws once where nobody sees a frame stall (engine/warm-up.js): the actors, Flugeðla among them, and one of the
   * leaves Þórseðla bites off; behind the start button from the Fen's views (`place` 'fen'), and under the white tree's black from its
   * own (the place's warmUp, main.js).
   */
  warmUp(world, { place = null } = {}) {
    if (place === 'ardalur') return { objects: [], shots: [], dispose() {} }; // its own meshes (main.js), drawn under the tree's black too
    const objects = [...world.actors.values()].map(actor => actor.root);
    const leaf = leafWarm(world);
    objects.push(leaf.object);
    const drops = world.effects ? splashWarm(world) : null; // the splash's lit program (world/props/splash.js), for the far pool
    if (drops) objects.push(drops.object);
    const shots = place === 'hvitatre' ? [] : ['fen_star_rise', ...FEN_WARM];
    return { objects, shots, dispose() { leaf.dispose(); drops?.dispose(); } };
  },
  shots: {}, // every shot belongs to a place: chapter.locations[name].shots

  // The script: a generator that yields what it waits for (remake/engine/scene/scheduler.js).
  *script(s) {
    const mosi = s.actor('mosi');
    const egill = s.actor('egill');
    const thorsedla = s.actor('thorsedla');
    const flugedla = s.actor('flugedla');
    const world = mosi.raw.world;
    world.chapterTimeline = [];
    const c = { s, world, mosi, egill, thorsedla, flugedla, saying: 0, goodbyes: [], bye: null, lastSaid: null, point: new world.THREE.Vector3() };
    c.reduced = reducedMotion(world); // the flight as a tablet that asks for less motion sees it (chapters/flug.js)
    c.say = (speaker, id, options) => say(s, c, speaker, id, options);
    c.lines = lineQueue(s); // the voices that come as the child plays, one at a time (the wind's help and cheers)
    // the gusts, and the flight's wind and water: the recordings are fetched now, in the background, for the page
    const context = world.sound?.context ?? null;
    c.sounds = createFlightSounds({ context, output: world.sound?.output ?? null, recordings: loadFlightRecordings(context) });
    c.song = createFlightSong(world); // the flight's own song, made now so its file is there by the take-off
    c.doc = world.page ?? globalThis.document ?? null; // the page the wind's hint goes on
    c.ring = ringsFor(world, { most: 3 }); // the rings of her falling leaves on the water
    world.chapterState = c; // what the scenes share, for captures and probes
    // As chapter 3 ended: Egill in the saddle on Mosi, on his hummock by Þórseðla's head; Flugeðla is at the white tree.
    flugedla.raw.root.visible = false;
    c.herSaddle = createFlierSaddle(flugedla.raw); // on her model, hidden till it pops on in scene 5 (the warm-ups draw it with her)
    thorsedla.place(THORSEDLA.position[0], THORSEDLA.position[2], THORSEDLA.heading);
    mosi.place(MOSI_FEN.position[0], MOSI_FEN.position[2], MOSI_FEN.heading);
    c.saddle = createSaddle(mosi.raw);
    c.saddle.show();
    c.riding = ride(egill.raw, c.saddle, { settle: 0 });
    yield s.camera.cut('fen_star_rise');
    yield s.ready(); // the start button; immediate in captures
    s.sfx('fen');
    yield s.fade(0, 0.8); // the scene opens from black (main.js)
    yield* story(s, c);
  },
};
