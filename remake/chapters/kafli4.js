// Chapter 4: Boð til Flugeðlu (an invitation for Flugeðla), docs/superpowers/specs/2026-11-01-kafli-4-bod-til-flugedlu-design.md.
// Þórseðla says goodbye at her pool and the map draws the way on across the Fen; Mosi, with Egill in the saddle, walks to the white
// snag, where Flugeðla sits on the very top with her wings spread and cannot take off, for there is no wind. Egill makes the wind
// (scene 3), she takes the invitation and the fourth star (4), takes Egill on her back (5) and flies him up the river and the falls
// (6, chapters/kafli4-flight.js), and lands at the far pool (7). So far: scenes 1 to 3 (the plan's Tasks 12 and 13); the script ends
// once the wind has lifted her off the top.
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
// Actors are global: each is where the chapter's script puts it.
import { chapter as kafli3 } from './kafli3.js';
import { thorsedlaLife, leafWarm } from './kafli3-thorsedla.js';
import { perch } from './kafli4-flugedla.js';
import { theWind } from './kafli4-wind.js';
import { lineQueue } from './kafli4-flight-play.js';
import { createFlightSounds } from '../engine/audio/flight-sounds.js';
import { createSaddle, ride } from '../engine/riding.js';
import { ringsFor } from '../engine/neck-ride.js';
import { mapMoment } from '../engine/scene/map-moment-scene.js';

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
};

// ---------------------------------------------------------------------------------------------
// The lines: captions timed by their words until they are recorded (the plan's Task 15).

const WORDS = {
  // 1. Goodbye at Þórseðla's pool
  k4_mosi_next: 'Næst er það Flugeðla! Hún á heima uppi á hvíta trénu.',
  k4_egill_fly: 'Getur hún flogið?',
  k4_mosi_higher: 'Hærra en skýin!',
  k4_mosi_map_tree: 'Yfir Fenið, að hvíta trénu.',
  // 2. At the white tree
  k4_mosi_invite: 'Halló, Flugeðla! Viltu koma á Stjörnuhátíðina í kvöld?',
  k4_flugedla_calm: 'Hátíð! Ég skal kalla á allan skóginn! En það er logn… og án vinds kemst ég ekki á loft.',
  k4_egill_wind: 'Við getum búið til vind!',
  // 3. The wind (Mosi's "Svona! Fúúú!" is the plan's own)
  k4_mosi_swipe: 'Strjúktu upp, Egill!',
  k4_mosi_blow: 'Svona! Fúúú!',
  k4_flugedla_more: 'Meira! Ég finn hann!',
  k4_flugedla_now: 'Nú!',
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
  yield coming;
  yield mosi.turnTo(MOSI_TREE.heading, { rate: 30 });
  // the tree from the ground: she sits on the top, the wings spread, and nothing stirs
  yield s.camera.cut('tre_ground');
  yield s.wait(3.5);
  yield s.camera.cut('tre_above');
  yield mosi.lookAt(FLUGEDLA_HEAD, { weight: 0.85, maxPitch: 50 });
  yield egill.lookAt(FLUGEDLA_HEAD, { weight: 0.9, maxPitch: 55 });
  yield* say(s, c, 'mosi', 'k4_mosi_invite');
  yield s.camera.cut('tre_her');
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
  return null;
}
const CALM = 0.08; // the wind's strength at the white tree before Egill makes some (engine/wind.js: 1 is the forest's)

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
  // Chapter 2's song until the owner's flight theme (spec 8)
  theme: 'kafli2/theme.json',
  start: 'fen',
  locations: {
    // chapter 3's layout, planted for chapter 3's late morning sun: the planner keeps the sun's way into a clearing clear of big crowns,
    // and this chapter's sun stands elsewhere (world/forest/plan.js: plantedFor)
    fen: { layout: { ...FEN.layout, plantedFor: kafli3.look }, shots: { ...FEN.shots, ...FEN_SHOTS }, warmUp: FEN_WARM },
    hvitatre: { layout: HVITATRE_LAYOUT, shots: TREE_SHOTS, warmUp: ['tre_arrive', 'tre_ground', 'tre_wind'] },
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
  lines: Object.fromEntries(Object.entries(WORDS).map(([id, text]) => [id, { text, audio: id }])),
  // The camera shows this shot while the start button waits: chapter 3's last view of them, from the south across her pool.
  startShot: 'fen_star_rise',
  // The white tree is built once the start button shows, a slice at a time, and kept, hidden (engine/locations.js: prepare; main.js).
  prepare: ['hvitatre'],

  /**
   * What the chapter draws once where nobody sees a frame stall (engine/warm-up.js): the actors, Flugeðla among them, and one of the
   * leaves Þórseðla bites off; behind the start button from the Fen's views (`place` 'fen'), and under the white tree's black from its
   * own (the place's warmUp, main.js).
   */
  warmUp(world, { place = null } = {}) {
    const objects = [...world.actors.values()].map(actor => actor.root);
    const leaf = leafWarm(world);
    objects.push(leaf.object);
    const shots = place === 'hvitatre' ? [] : ['fen_star_rise', ...FEN_WARM];
    return { objects, shots, dispose() { leaf.dispose(); } };
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
    c.say = (speaker, id, options) => say(s, c, speaker, id, options);
    c.lines = lineQueue(s); // the voices that come as the child plays, one at a time (the wind's help and cheers)
    c.sounds = createFlightSounds({ context: world.sound?.context ?? null, output: world.sound?.output ?? null }); // the gusts
    c.doc = world.page ?? globalThis.document ?? null; // the page the wind's hint goes on
    c.ring = ringsFor(world, { most: 3 }); // the rings of her falling leaves on the water
    world.chapterState = c; // what the scenes share, for captures and probes
    // As chapter 3 ended: Egill in the saddle on Mosi, on his hummock by Þórseðla's head; Flugeðla is at the white tree.
    flugedla.raw.root.visible = false;
    thorsedla.place(THORSEDLA.position[0], THORSEDLA.position[2], THORSEDLA.heading);
    mosi.place(MOSI_FEN.position[0], MOSI_FEN.position[2], MOSI_FEN.heading);
    c.saddle = createSaddle(mosi.raw);
    c.saddle.object.visible = true;
    c.riding = ride(egill.raw, c.saddle, { settle: 0 });
    yield s.camera.cut('fen_star_rise');
    yield s.ready(); // the start button; immediate in captures
    s.sfx('fen');
    yield s.fade(0, 0.8); // the scene opens from black (main.js)
    yield* story(s, c);
  },
};
