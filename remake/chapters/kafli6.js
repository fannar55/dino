// Chapter 6: Boð til Grameðlu (an invitation for Grameðla), docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md.
// The friends say goodbye at the far pool where chapter 5 ends, and Mosi and Egill go alone on the longest way: over the river above
// the falls on stepping stones Egill picks, up the mountain's slope, into the cloud on its side along six giant prints Egill finds,
// and, where the prints end and all is white, Mosi calls and Grameðla answers, three times, nearer each time, until she steps out of
// the cloud, big and glad. She takes the invitation with a roar that blows the cloud away, the sixth star rises, and she carries Egill
// on her head up out of the clouds onto the wide top, where the festival will be.
//
// Four places (kafli6-route.js has them as data, and every shot): `ardalur`, Árdalurinn round the far pool (kafli5-place.js buildPool)
// and the ford above the falls, built with it; `hlid`, the slope (world/fjall createSlope); `sky`, the belt of cloud with the prints
// and the cloud (createBelt, world/fjall/cloud.js); `toppur`, the top (createTop). The light is a look per place, eased between
// (engine/light-blend.js, engine/looks.js lowSun, redGold, inCloud, sunset). The three tasks are state machines on the game clock
// (kafli6-stones.js, kafli6-prints.js, kafli6-call.js, their help in kafli6-help.js): here their events become hops, stones that
// rock, numbers, roars and light in the fog. Mosi's hop and little roar are kafli6-mosi.js, her life kafli6-gramedla.js.
//
// Chunk 1 (the plan's Task 6): every scene, shot and wait, in grey. The stones are flat discs, the stages bare ground, the prints
// chapter 2's mud print made big, and Grameðla her three clips (no lean, no seat: Egill floats to a point over her head). The lines
// have no recordings yet: each is its caption, held as long as a child reads it (engine/scene/scene.js lineDuration).
//   1 the pool as chapter 5 leaves it; Slóeðla's and Flugeðla's goodbyes, Flugeðla flies east; Egill into the saddle; the map draws f
//   2 the ford: five steps of stones, the look down the falls at the third; over
//   3 the slope: the ride up, the turn on the ledge to the whole forest, and up to the clouds
//   4 the belt of cloud: into the first print, six counted, the cloud thicker with each; the ground thuds at the sixth
//   5 the call, three rounds: Mosi roars a little, she answers from a side, the fog glows gold there, Egill shows the way
//   6 she steps out, the invitation, her roar blows the cloud away, the gift and the sixth star
//   7 Egill onto her head, the march up, out of the clouds onto the top; the book
import { FAR_POOL } from './kafli4-route.js';
import { SPOTS, WADE, WEST, headingTo } from './kafli5-pool.js';
import { COURAGE, sloedlaLife } from './kafli5-sloedla.js';
import { STEPS as REED_STEPS } from './kafli5-pool.js';
import { buildPool } from './kafli5-place.js';
import {
  ROUTE, FORD, STEPS, STONE, FALLS_LOOK, stepShot, crossing, SLOPE, PRINTS, PRINT_SIZE, PRINT_TAP, mosiAt, CLOUD_BY_PRINT, printShot, CALL,
  callStand, directionPoint, herAt, callShot, meetShot, TOP, SHOTS, SHOWS, ARDALUR_VIEWS, ARDALUR_KEEP,
} from './kafli6-route.js';
import { createStones } from './kafli6-stones.js';
import { createPrints } from './kafli6-prints.js';
import { createCall, thirdOf, ANSWER } from './kafli6-call.js';
import { DIRECTIONS } from './kafli6-help.js';
import { hopTo, letGo, smallRoar } from './kafli6-mosi.js';
import { gramedlaLife } from './kafli6-gramedla.js';
import { holdHer, flyPath } from './kafli4-flugedla.js';
import { egillTaps } from './kafli2-trail.js';
import { lineQueue } from './kafli4-flight-play.js';
import { createShowSounds } from './gramedla3d/sounds.js';
import { demoAsked, startDemoChild } from './kafli6-demo.js';
import { createSlope, createBelt, createTop } from '../world/fjall/index.js';
import { createSteppingStones } from '../world/props/stepping-stones.js';
import { createCritters } from '../world/critters/critters.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { splash } from '../world/props/splash.js';
import { LOOKS } from '../engine/looks.js';
import { easeLight, lightTo } from '../engine/light-blend.js';
import { mapMoment } from '../engine/scene/map-moment-scene.js';
import { createSaddle, createSeat, floatTo, ride } from '../engine/riding.js';

export const WORDS = {
  k6_sloedla_follow: 'Við komum á eftir ykkur. Sjáumst uppi á fjalli!', k6_flugedla_call: 'Ég kalla á allan skóginn. Flýtið ykkur, sólin er að lækka!',
  k6_mosi_come: 'Komdu, Egill. Lengsta ferðin bíður.',
  k6_mosi_map: 'Þarna uppi á fjallinu, í skýjunum, býr Grameðla. Og þar er Stjörnuhátíðin haldin, næst stjörnunum.',
  k6_egill_hers: 'Á fjallinu hennar?', k6_mosi_why: 'Já. Þess vegna verðum við að bjóða henni!',
  k6_mosi_river: 'Áin er breið hérna. En sjáðu steinana! Hvaða steinn er næstur, Egill?',
  k6_mosi_wobble: 'Úps, sá vaggar!', k6_mosi_flat: 'Þessi stóri, flati!',
  k6_egill_flew: 'Þarna flugum við upp með Flugeðlu!', k6_mosi_across: 'Við komumst yfir! Vel valið, Egill.',
  k6_egill_glade: 'Sjáðu, Mosi! Þarna er rjóðrið þar sem við hittumst!', k6_mosi_thorsedla: 'Og þarna er Þórseðla. Hún er lögð af stað.', k6_mosi_clouds: 'Og þarna uppi… eru skýin.',
  k6_mosi_print: 'Egill… þetta er spor. Ég kemst ofan í það!', k6_egill_huge: 'Hún er RISASTÓR!',
  k6_mosi_six: 'Sex spor. Og hún er sjötti vinurinn!', k6_mosi_end: 'Sporin enda hér. Ég sé ekkert. Ég kalla á hana. Hjálpaðu mér, Egill!',
  k6_mosi_listen: 'Hlustum aftur!', k6_egill_gramedla: 'Grameðla!', k6_egill_hi: 'Hæ, Grameðla!',
  k6_mosi_invite: 'Halló, Grameðla! Stjörnuhátíðin er í kvöld, hér á fjallinu þínu. Viltu halda hana með okkur?',
  k6_mosi_yes: 'Hún segir já!', k6_mosi_gift: 'Öskrið þitt verður merkið, Grameðla. Þegar þú öskrar kvikna stjörnurnar!',
  k6_mosi_star: 'Sjötta stjarnan! Nú eru allir komnir!', k6_mosi_wait: 'Bíddu… eftir… mér!',
  k6_egill_above: 'Við erum ofan við skýin!', k6_mosi_room: 'Hér… er nóg pláss… fyrir alla!',
};
// Mosi counts the prints with chapter 2's own takes (the plan's ruling): "Eitt!" to "Sex!"
const COUNTS = { k2_mosi_1: 'Eitt!', k2_mosi_2: 'Tvö!', k2_mosi_3: 'Þrjú!', k2_mosi_4: 'Fjögur!', k2_mosi_5: 'Fimm!', k2_mosi_6: 'Sex!' };

const EGILL_HEAD = { actor: 'egill', part: 'head' };
const HER_HEAD = { actor: 'gramedla', part: 'head' };
const STAR_FROM = { actor: 'gramedla', part: 'head', offset: [0, 1.8, 0] }; // the star rises over her head
const MIN_SHOT = 2.55; // s: a cut waits this long after the one before (the director's rule, engine/camera/director.js LIMITS.minShot)
// Scene 1: Flugeðla lifts off and flies east, out of the pool's shot, in FLIGHT s (then she is gone: she calls the forest)
const FLIGHT = { seconds: 6, way: [[0, 0, 0], [7, 4, -2], [26, 14, -6], [62, 28, -12]] };
const FLOAT = 2.6; // s Egill takes to float into the saddle
// Scene 2: how long they look down the falls, at its lip (where they look); when a frog that hops off its stone lands in the water
// (world/critters/critters.js HOP: crouch and leap; from its second hop on it turns round first)
const FALLS_HOLD = 4;
const LIP = ROUTE.river.at(ROUTE.river.falls);
const FALLS_LIP = [LIP.x, LIP.level, LIP.z];
const FROG_LANDS = { first: 0.72, later: 1.12 };
const FROG_SCALE = 1.7; // the ford's frogs a little larger than life, so a child sees one on each wobbly stone from the step's shot
const UP_BANK = { seconds: 2.4, height: 0.08 }; // his stride up the south bank after the last hop (ACROSS_ON m)
// Scene 3: how fast Mosi goes up the path (m/s), and the waits on the ledge
const RIDE = { speed: 2.1, turn: 1.2 };
// Scene 4: he steps into the first print from STEP_IN m back; his walk from print to print (m/s)
const STEP_IN = 4;
const PRINT_WALK = 1.7;
// Scene 5: her roar by round (level, as sfx.js gramedlaRoar: far, nearer, by them), from where (pan), the glow's strength by round
// and when strong (the help's "she roars again, the glow stronger"); a walk's speed; how far the swirl of a wrong third is from Mosi
const ROAR_LEVEL = [0.25, 0.55, 1.0];
const ROAR_PAN = { left: -0.7, ahead: 0, right: 0.7 };
const GLOW = [0.55, 0.8, 1];
const STRONG = 1.3;
const CALL_WALK = 1.3;
const SWIRL_AT = 9;
const WAY_TAP = 7; // m: the radius of each way's tap target, round its glow
// Scene 6: she stops HER_STOP m ahead of him (kafli6-route.js meetOf), after two steps from STEP_OUT m further back; her roar's
// blow comes BLOW_AT s into it; after the blow a thin haze stays (fog density), so the belt's far edge never shows
const HER_STOP = 9;
const STEP_OUT = 4.5;
const BLOW_AT = 1.1;
const AFTER_HAZE = 0.012;
const AFTER_ROAR = { ...LOOKS.sunset, name: 'sunset haze', fog: { ...LOOKS.sunset.fog, density: AFTER_HAZE } };
// Scene 7: a tap on her head or Egill, or this long, and he floats up; how far she marches on the belt and on the top
const HEAD_WAIT = 6;
const MARCH = 12;
const TOP_WALK = 7;
const TO_THE_MAP = 1.2; // s the book shows its dinosaurs (Grameðla nodding) before it turns to the map, as chapter 5's

// ---------------------------------------------------------------------------------------------

function* story(s, c) {
  yield* farewell(s, c);
  yield* theFord(s, c);
  yield* theSlope(s, c);
  yield* thePrints(s, c);
  yield* theCall(s, c);
  yield* sheComes(s, c);
  yield* upToTheTop(s, c);
}

// 1. The pool as chapter 5 leaves it, everyone turned west after her roar. The friends say goodbye: they come after with the whole
// forest. Flugeðla flies east, Egill floats into the saddle, and the map draws the way up the mountain into the clouds.
function* farewell(s, c) {
  mark(c, 1);
  const { mosi, egill, flugedla, sloedla } = c;
  sound(s, c, 'fen');
  yield s.wait(2.4); // the pool as chapter 5 left it, looking west
  cut(s, c, 'pool_saddle');
  for (const who of [mosi, egill]) yield who.lookAt({ actor: 'sloedla', part: 'head' }, { weight: 0.7, maxAngle: 80, maxPitch: 35 });
  yield sloedla.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 35 });
  yield s.wait(0.8);
  yield* say(s, c, 'sloedla', 'k6_sloedla_follow');
  yield flugedla.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 45 });
  for (const who of [mosi, egill]) yield who.lookAt({ actor: 'flugedla', part: 'head' }, { weight: 0.7, maxAngle: 80, maxPitch: 35 });
  yield* say(s, c, 'flugedla', 'k6_flugedla_call');
  yield* flyAway(s, c);
  // Egill into the saddle
  for (const who of [mosi, egill]) yield who.lookAt(null);
  yield egill.lookAt({ actor: 'mosi', part: 'head' }, { weight: 0.7, maxPitch: 30 });
  c.saddle.show();
  sound(s, c, 'saddle');
  yield s.wait(0.6);
  sound(s, c, 'float');
  yield floatTo(egill.raw, c.saddle, { duration: FLOAT });
  c.riding = ride(egill.raw, c.saddle, { settle: 0 });
  yield egill.lookAt(null);
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 35 });
  yield* say(s, c, 'mosi', 'k6_mosi_come');
  // the map: piece f up the mountain into the clouds, and why they go there
  const speak = function* (speaker, id) {
    yield* say(s, c, speaker, id);
    if (id !== 'k6_mosi_map') return;
    yield* say(s, c, 'egill', 'k6_egill_hers');
    yield* say(s, c, 'mosi', 'k6_mosi_why');
  };
  yield* mapMoment(s, c, { pieces: ['f'], line: 'k6_mosi_map', speak });
  yield mosi.lookAt(null);
  yield s.wait(0.6);
}

/** Flugeðla lifts off the shallows and flies away east (kafli4-flugedla.js flyPath), and is gone. */
function* flyAway(s, c) {
  const her = c.flugedla.raw;
  const held = holdHer(c);
  const p = her.root.position;
  const points = FLIGHT.way.map(([dx, dy, dz]) => [p.x + dx, p.y + dy, p.z + dz]);
  c.log({ type: 'flugedlaFlies' });
  yield* flyPath(s, c, held, { points, seconds: FLIGHT.seconds, clips: [[0, 'takeOff', 0.3], [0.22, 'fly', 0.5]], landing: null });
  her.root.visible = false;
}

// 2. The ford above the falls (task 1, kafli6-stones.js): five steps of stones, the child picks the next one and Mosi hops onto it.
// At the third they look down the falls. Over on the south bank.
function* theFord(s, c) {
  const { mosi, world } = c;
  yield s.fade(1, 0.6);
  mark(c, 2);
  c.sloedla.raw.root.visible = false; // from here never more than three big characters
  c.flugedla.raw.root.visible = false;
  const start = crossing(0);
  mosi.place(start.at[0], start.at[1], start.heading);
  // the valley's own rocks (world/forest/species.js), the right ones broad, flat and dry, the wrong ones small, round and wet
  const real = Boolean(world.forest?.waterfall);
  c.stones = createSteppingStones(world, {
    steps: STEPS, level: FORD.level, sizes: STONE, heightAt: world.heightAt, library: real ? stoneLibrary() : null, grey: !real,
  });
  const wrongs = STEPS.flatMap(step => step.stones.filter(stone => !stone.right));
  // a frog on each small, wobbly stone, facing the water it will hop into (away from the step's right stone)
  const frogs = wrongs.map(stone => {
    const [ax, az] = c.stones.away(stone.id);
    return { name: `frog-${stone.id}`, kind: 'frog', position: c.stones.frogSpot(stone.id), heading: Math.atan2(az, ax) * (180 / Math.PI), scale: FROG_SCALE };
  });
  // the frogs stand on their stones' tops, and on the water off them
  const frogGround = (x, z) => {
    let top = -Infinity;
    for (const stone of wrongs) top = Math.max(top, c.stones.surfaceAt(stone.id, x, z));
    return Number.isFinite(top) ? top : Math.max(world.heightAt(x, z), FORD.level);
  };
  c.frogs = createCritters(world, { spots: frogs, heightAt: frogGround });
  c.frogs.group?.traverse?.(o => { if (o.isMesh) o.castShadow = false; }); // 8 shadow draws for 20 cm frogs: not worth it
  c.frogIn = new Map(); // frog -> in the water (it hops in, and back up at the next wobble)
  sound(s, c, 'forest');
  cut(s, c, 'ford_arrive', { check: false });
  yield s.wait(0.2);
  yield s.fade(0, 0.6);
  yield s.wait(0.8);
  yield* say(s, c, 'mosi', 'k6_mosi_river');
  yield* stonesTask(s, c);
  // the last hop, his front feet onto the south bank at its height; then he strides up it (the bank is a step over the river bed,
  // which his own walk would follow: the stride keeps him level with the bank until he stands on it)
  sound(s, c, 'step', { level: 0.7 });
  yield hopTo(s, c, { ...crossing(STEPS.length + 1), y: world.heightAt(...FORD.to) }, { settle: false });
  sound(s, c, 'step', { level: 0.9 });
  const up = hopTo(s, c, crossing(STEPS.length + 2), { seconds: UP_BANK.seconds, height: UP_BANK.height });
  soundWhile(s, c, 'step', 0.6, () => !up.done, { level: 0.6 });
  cut(s, c, 'ford_across');
  yield up;
  letGo(mosi.raw);
  yield s.wait(0.3);
  yield* say(s, c, 'mosi', 'k6_mosi_across');
  yield s.wait(1.2);
}

/** The species library the ford's stones are made from: the valley's own rocks, made once. */
let library = null;
const stoneLibrary = () => (library ??= createSpeciesLibrary(4));

function* stonesTask(s, c) {
  const task = createStones({ steps: STEPS });
  c.stoneTask = task;
  const offs = STEPS.flatMap(step => step.stones.map(stone => s.onTap(stone.id, () => {
    const { counted } = task.tap(stone.id, s.time);
    c.log({ type: 'tap', task: 'stones', id: stone.id, counted });
  })));
  try {
    task.start(s.time);
    while (!task.state().done) {
      task.update(s.time);
      for (const event of task.events()) onStone(s, c, event);
      yield;
    }
    for (const event of task.events()) onStone(s, c, event);
  } finally {
    for (const off of offs) off();
    unaim(s, c);
  }
}

/** One of the stones' events, as the child sees it. */
function onStone(s, c, event) {
  c.task('stones', event);
  const { mosi, egill, world, stones } = c;
  const stepOf = k => STEPS[k].stones;
  switch (event.type) {
    case 'want': {
      unaim(s, c);
      for (const stone of stepOf(event.step)) aim(s, c, stone.id, c.stones.targets.find(t => t.name === stone.id).point, STONE[stone.right ? 'right' : 'wrong'].tap);
      wait(s, c, 'stones', stepOf(event.step).map(stone => stone.id));
      cutSoon(s, c, { ...stepShot(event.step), label: `step_${event.step}` });
      break;
    }
    case 'hop': {
      unaim(s, c);
      const stone = stepOf(event.step).find(x => x.id === event.stone);
      s.after(0, function* hop() {
        sound(s, c, 'step', { level: 0.7 });
        // his front feet come down on the stone: the water rings round it and Egill bounces in the saddle
        yield hopTo(s, c, crossing(event.step + 1), { ring: stone.at, settle: event.step < STEPS.length - 1 }); // from the last, on at once
        sound(s, c, 'step', { level: 1 });
        sound(s, c, 'splash', { level: 0.35 });
        if (event.step === FALLS_LOOK) {
          // halfway: they stop and look down the falls, where they flew up with Flugeðla
          yield s.wait(0.4);
          cut(s, c, 'falls_look');
          for (const who of [mosi, egill]) yield who.lookAt(FALLS_LIP, { weight: 0.8, maxAngle: 90, maxPitch: 30 });
          yield* say(s, c, 'egill', 'k6_egill_flew');
          yield s.wait(FALLS_HOLD);
          for (const who of [mosi, egill]) yield who.lookAt(null);
        }
        c.stoneTask.landed(s.time);
      });
      break;
    }
    case 'wobble': {
      // the small stone wobbles, its frog hops into the water with a splash and a ring, and Mosi laughs: never a no
      stones.wobble(event.stone);
      frogHops(s, c, event.stone);
      sound(s, c, 'splash', { level: 0.5 });
      c.lines.say('mosi', 'k6_mosi_wobble', { ifQuiet: true });
      break;
    }
    case 'help': {
      const point = c.stones.targets.find(t => t.name === event.stone).point;
      if (event.level === 'hint') stones.glitter(event.stone);
      else if (event.level === 'name') {
        stones.glitter(event.stone);
        c.lines.say('mosi', 'k6_mosi_flat');
        pointWithHead(s, c, point);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * The frog on a wobbly stone hops off it into the water, with a splash and a ring where it lands (or, in the water already, back up
 * onto its stone). A tap while it is in the air changes nothing.
 */
function frogHops(s, c, stoneId) {
  const name = `frog-${stoneId}`;
  const was = c.frogIn.get(name) ?? { inWater: false, hop: null, hops: 0 };
  if (was.hop && !was.hop.done) return;
  const hop = c.frogs.react(name);
  const into = !was.inWater;
  c.frogIn.set(name, { inWater: into, hop, hops: was.hops + 1 });
  sound(s, c, 'frog');
  const target = c.frogs.targets.find(t => t.name === name);
  s.after(was.hops ? FROG_LANDS.later : FROG_LANDS.first, () => {
    const at = target.point;
    c.world.forest?.rippleAt?.(at.x, at.z, into ? 0.5 : 0.3);
    if (into) splash(c.world, new c.world.THREE.Vector3(at.x, FORD.level, at.z), { size: 0.45, seed: `frog ${stoneId} ${Math.round(s.time * 10)}` });
    c.log({ type: 'frog', id: name, into, ring: [at.x, at.z] });
    return null;
  });
}

// 3. The slope: the ride up the path; on the ledge Mosi turns to the whole forest in the low sun; then to the mountain, whose path
// goes up into white cloud.
function* theSlope(s, c) {
  mark(c, 3);
  const { mosi, egill, world } = c;
  yield s.goTo('hlid', {
    hold: () => {
      c.stones?.dispose();
      c.frogs?.dispose();
      c.stones = c.frogs = null;
      mosi.place(SLOPE.from.at[0], SLOPE.from.at[1], headingTo(SLOPE.from.at, SLOPE.ride.at));
      lightTo(world, LOOKS.lowSun);
      return null;
    },
  });
  s.releaseLocation('ardalur');
  easeLight(world, LOOKS.redGold, 4);
  sound(s, c, 'forest', { calls: false });
  cut(s, c, 'slope_ride');
  const up = mosi.walkTo([SLOPE.ride.at, SLOPE.ledge.at], { speed: RIDE.speed, turnRate: 60 });
  soundWhile(s, c, 'step', 0.55, () => !up.done, { level: 0.5 });
  yield up;
  // he turns on the ledge: behind them, the whole forest
  yield mosi.turnTo(0, { rate: 70 });
  cut(s, c, 'view_east');
  yield egill.lookAt([-1500, 120, 100], { weight: 0.8, maxAngle: 80, maxPitch: 30 });
  yield s.wait(RIDE.turn);
  yield* say(s, c, 'egill', 'k6_egill_glade');
  yield mosi.lookAt([-1700, 140, 160], { weight: 0.6, maxAngle: 70, maxPitch: 30 });
  yield* say(s, c, 'mosi', 'k6_mosi_thorsedla');
  yield s.wait(0.8);
  // and to the mountain: the path goes up into the clouds
  for (const who of [mosi, egill]) yield who.lookAt(null);
  yield mosi.turnTo(150, { rate: 70 });
  cut(s, c, 'clouds_up');
  yield mosi.lookAt([-2458, 268, 160], { weight: 0.7, maxAngle: 70, maxPitch: 35 });
  yield egill.lookAt([-2458, 268, 160], { weight: 0.8, maxAngle: 70, maxPitch: 35 });
  yield s.wait(1);
  yield* say(s, c, 'mosi', 'k6_mosi_clouds');
  yield s.wait(1.4);
  for (const who of [mosi, egill]) yield who.lookAt(null);
}

// 4. The belt of cloud (task 2, kafli6-prints.js): Mosi steps into a print so big he fits in it. The child finds the next print and
// they count to six; the cloud thickens with each. At the sixth the ground thuds.
function* thePrints(s, c) {
  mark(c, 4);
  const { mosi, egill, world } = c;
  const first = mosiAt(0);
  const [fx, fz] = way(first.heading);
  yield s.goTo('sky', {
    hold: () => {
      c.belt = world.forest;
      c.cloud = c.belt.cloud;
      c.prints = c.belt.prints;
      setCloud(c, CLOUD_BY_PRINT[0], 0);
      mosi.place(first.x - fx * STEP_IN, first.z - fz * STEP_IN, first.heading);
      lightTo(world, LOOKS.inCloud);
      hideSky(c); // inside the cloud the sky's own sun and Mosi cloud (they take no fog) are not seen
      return null;
    },
  });
  s.releaseLocation('hlid');
  world.music?.setLevel?.(0, 3); // no music in the cloud: only the quiet, the steps and the roars
  sound(s, c, 'forest', { calls: false, level: 0, seconds: 3 });
  cut(s, c, { ...printShot(0, groundAt(c, PRINTS[0].position)), label: 'print_first' });
  const into = mosi.walkTo([[first.x, first.z]], { speed: 1.1, turnRate: 40 });
  soundWhile(s, c, 'step', 0.6, () => !into.done, { level: 0.6 });
  yield into;
  yield mosi.lookAt(c.prints.targets[0].point, { weight: 0.9, maxPitch: 50 });
  yield s.wait(0.8);
  yield* say(s, c, 'mosi', 'k6_mosi_print');
  yield egill.lookAt(c.prints.targets[0].point, { weight: 0.8, maxPitch: 50 });
  yield* say(s, c, 'egill', 'k6_egill_huge');
  yield mosi.lookAt(null);
  yield egill.lookAt(null);
  yield* printsTask(s, c);
  yield s.until(() => !mosi.raw.walking);
  yield s.wait(0.6);
  yield* say(s, c, 'mosi', 'k6_mosi_six');
}

function* printsTask(s, c) {
  const task = createPrints({ count: PRINTS.length });
  c.printTask = task;
  const offs = PRINTS.map((_, k) => s.onTap(`print${k + 1}`, () => {
    const { counted } = task.tap(k, s.time);
    c.log({ type: 'tap', task: 'prints', index: k, counted });
  }));
  offs.push(s.onTap(null, event => {
    const where = groundUnder(c, event);
    task.tap(null, s.time, where);
    c.log({ type: 'tap', task: 'prints', index: null, counted: false });
  }));
  try {
    task.start(s.time);
    while (!task.state().done) {
      task.update(s.time);
      for (const event of task.events()) onPrint(s, c, event);
      yield;
    }
    for (const event of task.events()) onPrint(s, c, event);
  } finally {
    for (const off of offs) off();
    unaim(s, c);
  }
}

/** One of the prints' events, as the child sees it. */
function onPrint(s, c, event) {
  c.task('prints', event);
  const { mosi, prints, cloud } = c;
  switch (event.type) {
    case 'want': {
      unaim(s, c);
      const target = prints.targets[event.index];
      aim(s, c, target.name, target.point, PRINT_TAP);
      wait(s, c, 'prints', [target.name]);
      if (event.index > 0) cutSoon(s, c, { ...printShot(event.index, groundAt(c, PRINTS[event.index].position)), label: `print_${event.index}` });
      break;
    }
    case 'count': {
      const k = event.index;
      const target = prints.targets[k];
      unaim(s, c);
      if (event.by === 'egill') s.after(0, () => egillTaps(s, c, k)); // he finds it himself: he points, a trail of sparkles
      cloud.liftAt(target.point);
      prints.splash(k);
      prints.count(k);
      sound(s, c, 'countTone', { index: k + 1 });
      sound(s, c, 'splash', { level: 0.6 });
      c.lines.say('mosi', `k2_mosi_${k + 1}`);
      s.after(0.5, () => { prints.done(k); return null; });
      setCloud(c, CLOUD_BY_PRINT[k + 1]);
      // he walks on to the next, his front feet in its heel (at the sixth: on to the rock where they end)
      const next = mosiAt(k + 1);
      const on = mosi.walkTo([[next.x, next.z]], { speed: PRINT_WALK, turnRate: 50 });
      soundWhile(s, c, 'step', 0.6, () => !on.done, { level: 0.6 });
      if (k === PRINTS.length - 1) s.after(1.2, () => { thud(s, c); return null; });
      break;
    }
    case 'swirl':
      cloud.swirlAt(event.where ?? ahead(c, 8));
      break;
    case 'help':
      if (event.level === 'hint') prints.glimmer(event.index);
      break;
    default:
      break;
  }
}

/** The ground thuds (her step, near): pebbles hop, the camera shakes a moment (not with less motion), a deep thump. */
function thud(s, c) {
  const shake = !c.reduced;
  if (shake) {
    s.camera.handheld(0.6, { duration: 0.4 });
    s.after(0.6, () => s.camera.handheld(0, { duration: 0.8 }));
  }
  c.showSounds.play({ sound: 'thump', db: -4, cutoff: 600, rate: 0.85 });
  sound(s, c, 'step', { level: 1.6 });
  c.log({ type: 'thud', handheld: shake });
}

// 5. The call (task 3, kafli6-call.js): where the prints end all is white. Egill taps Mosi and he calls with his little roar; she
// answers from a side, heard that side and lighting the fog gold there; the child taps that way and Mosi walks there. Three rounds,
// nearer each time; at the third Egill calls with them.
function* theCall(s, c) {
  mark(c, 5);
  const { mosi } = c;
  yield s.until(() => !mosi.raw.walking);
  const stand = callStand(0, []);
  mosi.turnTo(stand.heading, { rate: 40 });
  cutSoon(s, c, { ...callShot(stand, groundAt(c, [stand.x, stand.z])), label: 'call_0' });
  yield s.wait(1);
  yield mosi.lookAt(EGILL_HEAD, { weight: 0.6, maxAngle: 70, maxPitch: 35 });
  yield* say(s, c, 'mosi', 'k6_mosi_end');
  yield mosi.lookAt(null);
  yield* callTask(s, c);
}

function* callTask(s, c) {
  const task = createCall();
  c.callTask = task;
  const offs = [s.onTap('mosi', () => c.log({ type: 'tap', task: 'call', on: 'mosi', counted: task.tapMosi(s.time).counted }))];
  for (const direction of DIRECTIONS) {
    offs.push(s.onTap(`dir-${direction}`, () => c.log({ type: 'tap', task: 'call', on: direction, counted: task.tapDirection(direction, s.time).counted })));
  }
  // a tap on no target is a third of the screen: left, ahead or right
  offs.push(s.onTap(null, event => {
    if (task.state().phase !== 'listen') return;
    const direction = thirdOf(event.x, screenWidth(c));
    c.log({ type: 'tap', task: 'call', on: direction, third: true, counted: task.tapDirection(direction, s.time).counted });
  }));
  try {
    task.start(s.time);
    while (task.state().phase !== 'done') {
      task.update(s.time);
      for (const event of task.events()) onCall(s, c, event);
      yield;
    }
    for (const event of task.events()) onCall(s, c, event);
  } finally {
    for (const off of offs) off();
    unaim(s, c);
    c.cloud.glow(null);
  }
}

/** Where Mosi stands in round `round` of the call (the ways she answered before it). */
const standIn = (c, round) => callStand(round, c.callTask.directions);

/** One of the call's events, as the child sees and hears it. */
function onCall(s, c, event) {
  c.task('call', event);
  const { mosi, cloud } = c;
  const stand = standIn(c, event.round ?? c.callTask.state().round);
  switch (event.type) {
    case 'ask':
      unaim(s, c);
      if (event.round > 0) cutSoon(s, c, { ...callShot(stand, groundAt(c, [stand.x, stand.z])), label: `call_${event.round}` });
      aim(s, c, 'mosi', 'mosi', 2.6);
      wait(s, c, 'call', ['mosi']);
      mosi.lookAt(EGILL_HEAD, { weight: 0.5, maxAngle: 70, maxPitch: 35 });
      break;
    case 'call':
      unaim(s, c);
      mosi.lookAt(null);
      smallRoar(mosi.raw, { seconds: ANSWER.mosi });
      c.log({ type: 'mosiRoar', round: event.round, by: event.by });
      break;
    case 'answer': {
      const { round, direction, strong } = event;
      const level = Math.min(1.2, ROAR_LEVEL[round] * (strong ? STRONG : 1));
      sound(s, c, 'gramedlaRoar', { level, pan: ROAR_PAN[direction] });
      c.log({ type: 'herRoar', round, direction, again: event.again, strong });
      cloud.glow(glowAt(c, stand, direction), Math.min(1, GLOW[round] * (strong ? STRONG : 1)));
      herAnswers(s, c, stand, round, direction);
      if (round === 2 && !event.again) s.after(1.4, () => say(s, c, 'egill', 'k6_egill_gramedla'));
      if (!event.again) {
        for (const d of DIRECTIONS) aim(s, c, `dir-${d}`, glowAt(c, stand, d), WAY_TAP);
        wait(s, c, 'call', DIRECTIONS.map(d => `dir-${d}`));
      }
      break;
    }
    case 'swirl': {
      const [x, , z] = pointToward(stand, event.direction, SWIRL_AT);
      cloud.swirlAt([x, z]);
      break;
    }
    case 'again':
      c.lines.say('mosi', 'k6_mosi_listen', { ifQuiet: true });
      break;
    case 'help':
      if (event.level === 'name') pointWithHead(s, c, glowAt(c, stand, event.direction));
      break;
    case 'walk': {
      unaim(s, c);
      cloud.glow(null);
      const to = standIn(c, event.round + 1);
      s.after(0, function* walk() {
        const going = mosi.walkTo([[to.x, to.z]], { speed: CALL_WALK, turnRate: 45 });
        soundWhile(s, c, 'step', 0.62, () => !going.done, { level: 0.6 });
        yield going;
        yield mosi.turnTo(to.heading, { rate: 45 });
        c.callTask.arrived(s.time);
      });
      break;
    }
    default:
      break;
  }
}

/**
 * She answers: her roar clip, and from the second round her shape in the glow (in the first she is too far off to be seen); her
 * thumps as she comes nearer. In the last round she stands where she will step out from (scene 6).
 */
function herAnswers(s, c, stand, round, direction) {
  if (round === 0) return;
  const her = c.her;
  if (round === 1) {
    const [x, z] = herAt(stand, direction, round);
    her.place([x, z], headingTo([x, z], [stand.x, stand.z]));
  } else {
    const meet = callStand(3, c.callTask.directions);
    const at = forward(meet, HER_STOP + STEP_OUT);
    her.place(at, meet.heading + 180);
  }
  her.show();
  her.roar();
  for (const [k, t] of [0.9, 2.2].entries()) {
    s.after(t + ANSWER.roar, () => { c.showSounds.play({ sound: 'thump', db: round === 1 ? -16 : -8, cutoff: round === 1 ? 300 : 500, rate: 0.85 + 0.04 * k, pan: ROAR_PAN[direction] }); return null; });
  }
}

// 6. She steps out of the cloud, two heavy steps, and stops over them. Egill laughs, Mosi asks her; her roar of joy blows the cloud
// away in a ring and the sunset comes through. "Hún segir já!" The gift, and the sixth star over her head.
function* sheComes(s, c) {
  mark(c, 6);
  const { mosi, egill, world, her } = c;
  yield s.until(() => !mosi.raw.walking);
  const stand = callStand(3, c.callTask.directions);
  const ground = groundAt(c, [stand.x, stand.z]);
  c.meet = { stand, ground };
  const shot = name => ({ ...meetShot(name, stand, ground), label: name });
  cut(s, c, shot('she_comes'));
  her.show();
  const out = her.walk([forward(stand, HER_STOP)]);
  for (const t of [0.9, 3.0]) s.after(t, () => { thump(c, -3); return null; });
  for (const who of [mosi, egill]) yield who.lookAt(HER_HEAD, { weight: 0.8, maxAngle: 80, maxPitch: 45 });
  yield out;
  her.face(stand.heading + 180);
  her.idle();
  yield s.wait(1.4);
  cut(s, c, shot('sniff_close'));
  yield s.wait(0.6);
  sound(s, c, 'gramedlaExhale', { level: 0.7 });
  yield s.wait(1);
  yield* say(s, c, 'egill', 'k6_egill_hi');
  cut(s, c, shot('roar_wide'));
  yield* say(s, c, 'mosi', 'k6_mosi_invite');
  yield s.wait(0.8);
  // her roar of joy: the cloud blows away in a ring, the sunset comes through, the music is back
  her.roar();
  sound(s, c, 'gramedlaRoar', { level: 1 });
  c.log({ type: 'herRoar', scene: 6 });
  let blown = null;
  s.after(BLOW_AT, () => {
    const at = c.gramedla.raw.root.position;
    blown = c.cloud.blowAway({ from: [at.x, at.z] });
    c.log({ type: 'blow' });
    easeLight(world, LOOKS.sunset, 3);
    world.music?.setLevel?.(1, 2);
    sound(s, c, 'forest', { calls: false, level: 1, seconds: 2 });
    return null;
  });
  yield s.until(() => blown?.done);
  showSky(c); // the cloud is gone: the sun and the Mosi cloud are back in the sky
  easeLight(world, AFTER_ROAR, 1.5); // a thin haze stays: the cloud lies round them still, below the top
  yield s.wait(0.6);
  yield* say(s, c, 'mosi', 'k6_mosi_yes');
  yield* say(s, c, 'mosi', 'k6_mosi_gift');
  sound(s, c, 'gramedlaExhale', { level: 0.6 }); // she snorts: yes
  yield s.wait(0.8);
  cut(s, c, shot('star_up'));
  sound(s, c, 'star');
  const star = s.star('k6_gramedla', STAR_FROM);
  yield s.wait(1.4);
  yield* say(s, c, 'mosi', 'k6_mosi_star');
  yield star;
  sound(s, c, 'journal');
  yield s.wait(0.8);
}

// 7. She lays her head down; a tap on it or on Egill (or 6 s) and Egill floats up onto it. She marches up the last slope, Mosi
// running beside her, out of the last of the cloud onto the wide top in the sunset. The chapter ends in the book.
function* upToTheTop(s, c) {
  mark(c, 7);
  const { mosi, egill, world, her } = c;
  const { stand, ground } = c.meet;
  const shot = name => ({ ...meetShot(name, stand, ground), label: name });
  cut(s, c, shot('head_down'));
  let tapped = null;
  const offs = ['gramedla-head', 'egill'].map(name => s.onTap(name, () => { tapped ??= name; }));
  aim(s, c, 'gramedla-head', HER_HEAD, 2.2);
  aim(s, c, 'egill', EGILL_HEAD, 1);
  const from = s.time;
  try {
    yield s.until(() => tapped !== null || s.time - from >= HEAD_WAIT);
  } finally {
    for (const off of offs) off();
    unaim(s, c);
  }
  c.log({ type: 'onHerHead', tapped });
  sound(s, c, 'float');
  const seat = createSeat(c.gramedla.raw, { bone: 'Head', offset: [0, 0.7, -0.2] });
  yield floatTo(egill.raw, seat, { duration: FLOAT });
  c.riding = ride(egill.raw, seat, { settle: 0 });
  c.saddle.hide();
  yield her.face(stand.heading);
  cut(s, c, shot('on_her_head'));
  yield s.wait(2.8);
  // the march up the last slope, Mosi running beside her
  cut(s, c, shot('climb_side'));
  const march = her.walk([forward(stand, HER_STOP + MARCH)]);
  const beside = mosi.walkTo([forward(stand, HER_STOP + MARCH, 5)], { speed: 1.25, turnRate: 50 });
  soundWhile(s, c, 'step', 0.5, () => !beside.done, { level: 0.6 });
  for (const t of [0.6, 2.4, 4.2, 6.0]) s.after(t, () => { thump(c, -6); return null; });
  yield s.wait(1.6);
  yield* say(s, c, 'mosi', 'k6_mosi_wait');
  yield s.all(march, beside);
  yield s.goTo('toppur', {
    hold: () => {
      her.place(TOP.her.at, TOP.her.heading);
      mosi.place(TOP.mosi.at[0], TOP.mosi.at[1], TOP.mosi.heading);
      lightTo(world, LOOKS.sunset);
      return null;
    },
  });
  s.releaseLocation('sky');
  cut(s, c, 'above_clouds');
  const [hx, hz] = way(TOP.her.heading);
  const into = her.walk([[TOP.her.at[0] + hx * TOP_WALK, TOP.her.at[1] + hz * TOP_WALK]]);
  const by = mosi.walkTo([[TOP.mosi.at[0] + hx * TOP_WALK, TOP.mosi.at[1] + hz * TOP_WALK]], { speed: 1.1, turnRate: 40 });
  for (const t of [0.6, 2.4, 4.2]) s.after(t, () => { thump(c, -8); return null; });
  yield s.wait(1.2);
  yield* say(s, c, 'egill', 'k6_egill_above');
  yield s.all(into, by);
  cut(s, c, 'top_wide');
  yield s.wait(0.8);
  yield* say(s, c, 'mosi', 'k6_mosi_room');
  yield s.wait(2.4);
  mark(c, 'end');
  s.fade(0.45, 1.6);
  s.journal.open('dinosaurs', { nod: 'gramedla' });
  s.after(TO_THE_MAP, () => s.journal.open('map'));
  yield s.wait(TO_THE_MAP + 0.4);
}

// ---------------------------------------------------------------------------------------------

const way = heading => [Math.cos((heading * Math.PI) / 180), Math.sin((heading * Math.PI) / 180)];
/** [x, z] `distance` m ahead of `stand` on its heading, and `right` m to its right. */
function forward(stand, distance, right = 0) {
  const [fx, fz] = way(stand.heading);
  return [stand.x + fx * distance - fz * right, stand.z + fz * distance + fx * right];
}
const TURN = { left: -CALL.angle, ahead: 0, right: CALL.angle };
/** [x, y, z] `distance` m from `stand` the way `direction` is from his heading, 1.5 m over the ground. */
function pointToward(stand, direction, distance) {
  const [dx, dz] = way(stand.heading + TURN[direction]);
  return [stand.x + dx * distance, 0, stand.z + dz * distance];
}
/** The ground under [x, z] in the place in view. */
const groundAt = (c, [x, z]) => c.world.heightAt(x, z);
/** A point `distance` m ahead of Mosi on the ground. */
function ahead(c, distance) {
  const { x, z } = c.mosi.raw.root.position;
  const [fx, fz] = way(c.mosi.raw.heading);
  return [x + fx * distance, z + fz * distance];
}

/**
 * Where the fog glows when she answers from `direction`: the route's point (directionPoint). On a tablet held upright the director
 * keeps the shot's width (engine/camera/director.js fits the fov), so the gold stays in its third of the screen there too.
 */
function glowAt(c, stand, direction) {
  return directionPoint(stand, direction, groundAt(c, [stand.x, stand.z]));
}

/** Where a tap on no target lands on the ground ([x, z]), near Mosi: a ray from the camera through it. */
function groundUnder(c, { x, y }) {
  const { world } = c;
  const box = world.renderer?.domElement?.getBoundingClientRect?.() ?? { width: 1280, height: 800 };
  const ray = new world.THREE.Raycaster();
  ray.setFromCamera(new world.THREE.Vector2((x / box.width) * 2 - 1, 1 - (y / box.height) * 2), world.camera);
  const plane = new world.THREE.Plane(new world.THREE.Vector3(0, 1, 0), -c.mosi.raw.root.position.y);
  const hit = ray.ray.intersectPlane(plane, new world.THREE.Vector3());
  if (!hit || hit.distanceTo(world.camera.position) > 40) return ahead(c, 8);
  return [hit.x, hit.z];
}
const screenWidth = c => c.world.renderer?.domElement?.getBoundingClientRect?.().width ?? 1280;

/** Mosi points with his head at `point` for a moment (the help that names a thing). */
function pointWithHead(s, c, point) {
  c.mosi.lookAt(point, { weight: 0.9, maxAngle: 80, maxPitch: 40 });
  s.after(2.6, () => c.mosi.lookAt(null));
}

// The sky's own decorations (engine/sun-face.js, added by main.js): the smiling sun with its overlay and nightcap, and the cloud
// shaped like Mosi. They take no fog, so inside the cloud they would show through the white.
const SKY_DECOR = ['SunFace', 'SunHandsAndMouth', 'SunNightcap', 'MosiCloud'];
/** Hide the sky's decorations, remembering how each was. */
function hideSky(c) {
  if (c.skyHidden) return;
  c.skyHidden = new Map();
  for (const name of SKY_DECOR) {
    const object = c.world.scene.getObjectByName(name);
    if (!object) continue;
    c.skyHidden.set(object, object.visible);
    object.visible = false;
  }
  c.log({ type: 'sky', hidden: true, count: c.skyHidden.size });
}
/** Put them back as they were (also when the chapter ends or is left: setUp's close). */
function showSky(c) {
  if (!c.skyHidden) return;
  for (const [object, visible] of c.skyHidden) object.visible = visible;
  c.skyHidden = null;
  c.log({ type: 'sky', hidden: false });
}

/** The cloud's level, noted for the tests. */
function setCloud(c, level, seconds) {
  c.cloud.setLevel(level, seconds);
  c.log({ type: 'cloudLevel', level });
}

/** Her footfall, near or far (dB). */
function thump(c, db) {
  c.showSounds.play({ sound: 'thump', db, cutoff: 700, rate: 0.9 });
}

/** A cut that keeps the director's rule: it waits until MIN_SHOT after the last one (a newer one waiting takes its place). */
function cutSoon(s, c, shot) {
  const token = {};
  c.cutToken = token;
  const due = (c.lastCut ?? -Infinity) + MIN_SHOT - s.time;
  if (due <= 0) return cut(s, c, shot);
  s.after(due, () => { if (c.cutToken === token) cut(s, c, shot); return null; });
  return null;
}
function cut(s, c, shot, options = {}) {
  c.cutToken = null;
  if (options.check !== false) c.lastCut = s.time;
  return s.camera.cut(shot, options);
}

/** Less motion: the page's ask (prefers-reduced-motion), ?reduced=1, or what a test's world says. */
function reducedMotion(world) {
  if (typeof world.reduced === 'boolean') return world.reduced;
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  return params.get('reduced') === '1' || Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** A line, one voice at a time: `c.saying` counts the lines under way. */
function* say(s, c, speaker, id, options) {
  c.saying = (c.saying ?? 0) + 1;
  try {
    yield s.say(speaker, id, options);
  } finally {
    c.saying--;
  }
}

/** A sound effect, noted in the chapter's log. */
function sound(s, c, name, detail) {
  c.log({ type: 'sound', name, ...(detail ?? {}) });
  s.sfx(name, detail);
}
/** The sound `name` every `every` s while `going()`. */
function soundWhile(s, c, name, every, going, detail) {
  s.after(0, function* sounding() {
    while (going() && !c.ended) {
      sound(s, c, name, detail);
      yield s.wait(every);
    }
  });
}

/** A tap target (`point` null: none), kept in `c.aims` by name for the videos' child (kafli6-demo.js) and the tests. */
function aim(s, c, name, point, radius) {
  s.target(name, point ? { point, radius } : null);
  if (point) c.aims[name] = point;
  else delete c.aims[name];
}
/** Every target off, and nothing waits. */
function unaim(s, c) {
  for (const name of Object.keys(c.aims)) aim(s, c, name, null);
  c.waiting = null;
}
/** A task waits for one of `names` from now (the tests look that each is on the screen). */
function wait(s, c, task, names) {
  c.waiting = { task, names, since: s.time };
}

/** Note when a scene starts (world.chapterTimeline, for captures and probes). */
function mark(c, scene) {
  c.scene = scene;
  c.world.chapterTimeline?.push({ scene, at: c.s.time });
}

// ---------------------------------------------------------------------------------------------

export { SHOWS };

export const chapter = {
  id: 'kafli6',
  title: 'Boð til Grameðlu',
  next: null, // the festival, once it is made
  look: 'lowSun',
  theme: 'kafli2/theme.json', // Mosi's travelling theme, at the ford and on the slope; none in the cloud, and back, bigger, after the roar
  start: 'ardalur',
  locations: {
    // Árdalurinn round the far pool, as chapter 5 leaves it, and the ford above the falls, with chapter 6's lines of sight kept clear
    ardalur: { build: world => buildPool(world, { at: [FORD.centre], views: ARDALUR_VIEWS, keep: ARDALUR_KEEP }), shots: SHOTS.ardalur },
    hlid: { build: world => createSlope(world, { grey: true }), shots: SHOTS.hlid },
    sky: { build: world => createBelt(world, { grey: true, prints: PRINTS, printSize: PRINT_SIZE, reduced: reducedMotion(world) }), shots: SHOTS.sky },
    toppur: { build: world => createTop(world, { grey: true }), shots: SHOTS.toppur },
  },
  prepare: ['hlid', 'sky', 'toppur'],
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', position: [SPOTS.mosi[0], 0, SPOTS.mosi[1]], heading: headingTo(SPOTS.mosi, WEST) },
    egill: { url: '../assets/characters/egill.glb', position: [SPOTS.egill[0], 0, SPOTS.egill[1]], heading: headingTo(SPOTS.egill, WEST) },
    sloedla: { url: '../assets/characters/parasaurolophus.glb', position: [REED_STEPS[0].at[0], 0, REED_STEPS[0].at[1]], heading: REED_STEPS[0].heading },
    flugedla: { url: '../assets/characters/pteranodon.glb', position: [FAR_POOL.landing[0], 0, FAR_POOL.landing[1]], heading: FAR_POOL.facing },
    gramedla: { url: '../assets/characters/trex.glb', position: [0, 0, 0], heading: 0 },
  },
  // Caption names in chapter 5's colours; Grameðla speaks no line (she roars, snorts and nods: Mosi says what she means)
  cast: {
    mosi: { name: 'Mosi', colour: '#4f5433' },
    egill: { name: 'Egill', colour: '#355774' },
    sloedla: { name: 'Slóeðla', colour: '#4b6fa4' },
    flugedla: { name: 'Flugeðla', colour: '#955055' },
  },
  lines: Object.fromEntries(Object.entries({ ...WORDS, ...COUNTS }).map(([id, text]) => [id, { text, audio: id }])),
  startShot: 'pool_west',

  warmUp(world) {
    const objects = [...world.actors.values()].map(actor => actor.root);
    return { objects, shots: ['pool_west', 'pool_saddle', 'ford_arrive'], dispose() {} };
  },
  shots: {}, // every shot belongs to its place: chapter.locations.<place>.shots

  *script(s) {
    const c = setUp(s);
    const { mosi, egill, flugedla, world } = c;
    // As chapter 5 ended: Egill and Mosi at the water across from the reed, Flugeðla in the shallows, Slóeðla out in the pool, all
    // turned west after Grameðla's roar; she herself is far off, hidden
    world.forest?.life?.arrive?.();
    mosi.place(SPOTS.mosi[0], SPOTS.mosi[1], headingTo(SPOTS.mosi, WEST));
    egill.place(SPOTS.egill[0], SPOTS.egill[1], headingTo(SPOTS.egill, WEST));
    flugedla.place(FAR_POOL.landing[0], FAR_POOL.landing[1], headingTo(FAR_POOL.landing, WEST));
    poolAsLeft(c);
    c.her.hide();
    c.saddle.hide();
    const close = c.run();
    try {
      yield s.camera.cut('pool_west', { check: false });
      yield s.ready(); // the start button; immediate in captures
      if (demoAsked()) startDemoChild(s, c); // a child's hands for the owner's videos (?kafli6=pikk)
      yield s.fade(0, 0.8);
      yield* story(s, c);
    } finally {
      close();
    }
  },
};

/** Slóeðla out in the pool as chapter 5 leaves her (her life, kafli5-sloedla.js, run on behind the black until she stands still), turned west. */
function poolAsLeft(c) {
  const life = c.sloedlaLife;
  life.courage = COURAGE[REED_STEPS.length];
  life.wade();
  const settle = () => {
    for (let t = 0, still = 0; t < 90 && still < 6; t += 0.1) {
      c.sloedla.raw.update(0.1);
      still = life.moving ? 0 : still + 0.1;
    }
  };
  settle();
  life.face(headingTo(WADE.at, WEST));
  settle();
  life.idle();
}

/** The scenes' shared state `c` (world.chapterState: for captures, probes and tests). `c.run()` starts what runs every frame. */
function setUp(s) {
  const mosi = s.actor('mosi');
  const egill = s.actor('egill');
  const sloedla = s.actor('sloedla');
  const flugedla = s.actor('flugedla');
  const gramedla = s.actor('gramedla');
  const world = mosi.raw.world;
  world.chapterTimeline = [];
  const c = { s, world, mosi, egill, sloedla, flugedla, gramedla, saying: 0, aims: {}, waiting: null, steps: STEPS, taskLog: [], chapterLog: [] };
  c.log = entry => c.chapterLog.push({ ...entry, at: s.time, scene: c.scene });
  c.task = (task, event) => c.taskLog.push({ task, ...event, at: event.time ?? s.time });
  c.reduced = reducedMotion(world);
  c.lines = lineQueue(s); // the help's lines, the counts and "Úps": one at a time
  c.her = gramedlaLife(gramedla);
  c.sloedlaLife = sloedlaLife(sloedla);
  c.saddle = createSaddle(mosi.raw);
  // her footfalls and far thumps, the recordings "Grameðla kemur!" plays (chapters/gramedla3d/sounds.js), held with the game
  c.showSounds = createShowSounds({ context: world.sound?.context ?? null, output: world.sound?.output ?? null });
  world.chapterState = c;
  c.run = () => {
    const release = s.seeking ? null : world.sound?.hold?.(c.showSounds);
    return () => {
      c.ended = true;
      showSky(c); // the sky as the engine had it, however the chapter ends or is left
      release?.();
      c.showSounds.stop();
      world.music?.setLevel?.(1, 1);
    };
  };
  return c;
}
