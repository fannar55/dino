// Chapter 2: Boð til Uggeðlu (an invitation for Uggeðla). Since the split of 31 October 2026 the old chapter 2 is two chapters
// (docs/superpowers/specs/2026-10-31-kafli-2-bod-til-uggedlu-design.md): this one is the way to Uggeðla, the Fen part is chapter 3
// (kafli3.js). Scenes 1 and 2 of the old chapter are kept as they were (docs/superpowers/specs/2026-10-21-kafli-2-bod-til-thorsedlu-
// design.md): from Kambeðla's fern glade Mosi and Egill ride out of the forest and down the Fenjaslóð, and count Þórseðla's ten
// water-filled footprints in the mud, one to ten. The trail leads on to Síkið, a channel flooded over its end, where Uggeðla lies
// hidden in the reed. The scenes there (the sail, the fishing, her star and the ferry) are built in the next tasks of the plan; until
// then the chapter ends in Síkið: Mosi walks down the path to the water and the picture fades to black and the script ends.
//
// Three places (engine/locations.js), in metres at real size (STYLE.md section 3): Mosi 8.5 m nose to tail, Kambeðla 7 m, Uggeðla
// 14 m, Egill 1.1 m tall. Headings are degrees, 0 facing +X and 90 facing +Z. The late morning sun (engine/looks.js: lateMorning)
// comes from heading 150 at 26 degrees, a little lower than chapter 1's.
//   burknalaut  Kambeðla's fern glade, chapter 1's own (its layout and its shots, so it grows as the child left it), where chapter 1
//               ended: Mosi on its north-east side facing her across it, Egill in the saddle on his back, her plates alight.
//   fenjaslod   the trail out of the forest and down into the Fen, with Þórseðla's ten footprints in the mud.
//   siki        the flooded channel in the Fen's look: the path goes under the water, Uggeðla's reed bed across it, the channel 50 m to
//               the hummocks, and Þórseðla far off beyond them, her head over the trees. Uggeðla and Þórseðla are chapter actors, made
//               with the others before the start button and hidden until the scene comes there.
// The trail's pieces are in kafli2-trail.js (the prints and the counting), Síkið's in kafli2-siki.js. The Fen the channel leads to is
// chapter 3's.
import { chapter as kafli1 } from './kafli1.js';
import { createSaddle, ride } from '../engine/riding.js';
import { createMudPrints } from '../world/props/mud-prints.js'; // (the warm-up's throwaways)
import { createCritters } from '../world/critters/critters.js';
import {
  TRAIL_PATH, TRAIL_PRINTS, TRAIL_BARE, PRINT_SIZE, RIDE_POINTS, TRAIL_ON, RIDE_CAMERA, PRINT_ANIMALS, mosiAt, printsLow, printShot,
  printFollow, arriveOnTheTrail, countPrints,
} from './kafli2-trail.js';
import { SIKI_LAYOUT, SIKI_SHOTS, SIKI_WALK, MOSI_BANK, UGGEDLA_REED, THORSEDLA_FAR, arriveInSiki } from './kafli2-siki.js';
import { createBerryBushes } from '../world/props/berries.js'; // (the warm-up's throwaways)
import { addPlateGlow } from '../engine/plate-glow.js';
import { mapMoment } from '../engine/scene/map-moment-scene.js';
import { ringsFor } from '../engine/neck-ride.js';

// ---------------------------------------------------------------------------------------------
// Burknalautin, the fern glade: chapter 1's

const GLADE = kafli1.locations.burknalaut;
const MOSI_GLADE = GLADE.layout.actors.mosi; // facing Kambeðla across the glade, as chapter 1 ends
const KAMBEDLA_GLADE = GLADE.layout.actors.kambedla;
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
// The lines: every line the script says, each read from its own recording in the kafli2 set
// (remake/assets/audio/kafli2/lines-source.json and lines.json), with the words it is recorded with.

const WORDS = {
  // 1. Leaving the glade
  k2_mosi_next: 'Næst er það Þórseðla, stærsti vinur minn. Hún er svo há að hún bítur trjátoppana!',
  k2_egill_bigger: 'Stærri en þú?',
  k2_mosi_muchbigger: 'Miklu stærri. Þú sérð!',
  k2_mosi_map_trail: 'Nú förum við út úr skóginum, niður Fenjaslóðina og alla leið að Feninu, til Þórseðlu.',
  k2_kambedla_bye: 'Góða ferð!',
  // 2. The footprints in the mud, counted one to ten
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
  yield* intoSiki(s, c);
}

// The way into Síkið: on down the trail the picture fades to black and comes up on the path at the channel, and Mosi walks down it to
// the water. The chapter ends here for now (the sail, the fishing, Uggeðla's star and the ferry come in the next tasks): the picture
// holds on him at the flooded path, fades to black, and the script ends.
function* intoSiki(s, c) {
  yield* goTo(s, c, 'siki', () => arriveInSiki(s, c));
  yield c.mosi.walkTo(SIKI_WALK.slice(1), { speed: 1.2 });
  yield c.mosi.turnTo(MOSI_BANK.heading, { rate: 40 });
  yield s.camera.cut('siki_flooded');
  yield s.wait(3);
  yield s.fade(1, 0.8);
}

// 1. Leaving the glade: Mosi says who is next, the map slides up over the game and draws the way ahead (the trail, and across the Fen to
// Þórseðla's pool) while he says where they are going, Kambeðla's plates blink goodbye (a tap on her: "Góða ferð!"), and they go.
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
  // The map slides up (nothing is cut: Mosi and Egill keep their looks, and Kambeðla can still be tapped behind it), draws the Fenjaslóð
  // and the way across the Fen while Mosi says where they are going, and slides away. His line goes through the chapter's own say, so
  // `c.saying` counts it and her goodbye waits for it.
  yield* mapMoment(s, c, { pieces: ['b', 'c'], line: 'k2_mosi_map_trail', speak: (speaker, id) => say(s, c, speaker, id) });
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
  // and on down the trail, toward the Fen (the walk goes on while the chapter's picture fades out)
  c.trailWalk = mosi.walkTo(TRAIL_ON, { speed: 1.2 });
  s.camera.follow('mosi', RIDE_CAMERA);
  yield s.wait(3);
}

/**
 * Fade to another place, set it up while the screen is black, and fade in (as chapter 1 does). What the setting up returns, a
 * promise or nothing, holds the black until it settles (s.goTo's hold). (The
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

/** A line, one voice at a time: `c.saying` counts the lines under way, so a goodbye or a remark can wait for quiet. */
function* say(s, c, speaker, id, options) {
  c.saying = (c.saying ?? 0) + 1;
  try {
    yield s.say(speaker, id, options);
  } finally {
    c.saying--;
  }
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
  title: 'Boð til Uggeðlu',
  next: 'kafli3', // Boð til Þórseðlu: the Fen, from the hummocks (kafli3.js)
  look: 'lateMorning',
  // Its own song, "Dino Trail" (assets/audio/kafli2/theme.json, read by main.js as the page loads: engine/audio/theme.js); its effects
  // are tuned to its key (B-flat pentatonic for now: the owner picks B-flat or E-flat as do), and the forest dances on every second of its 133.3
  // beats a minute (theme.json danceBeats). Chapter 3 plays the same song.
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
    siki: {
      layout: SIKI_LAYOUT,
      shots: SIKI_SHOTS,
      warmUp: ['siki_arrive', 'siki_sail', 'siki_hummocks'],
    },
  },
  // The order they are made in is the order they are updated in (main.js's updateActors puts those that something else moves after the
  // rest, in this order): Uggeðla, who is moved by her rig (kafli2-uggedla.js), comes before Egill, who rides her in the ferry, so that
  // he sits where she is in the same frame.
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', ...MOSI_GLADE },
    // Síkið's two, hidden until the scene comes there (the script hides them as it starts): where Síkið has them
    uggedla: { url: '../assets/characters/spinosaurus.glb', ...UGGEDLA_REED },
    thorsedla: { url: '../assets/characters/brontosaurus.glb', ...THORSEDLA_FAR },
    egill: { url: '../assets/characters/egill.glb', ...MOSI_GLADE }, // on Mosi's back: the script seats him in the saddle
    kambedla: { url: '../assets/characters/stegosaurus.glb', ...KAMBEDLA_GLADE },
  },
  // Caption names; the colour is the dark tone of each character's main hue (STYLE.md section 3).
  cast: {
    mosi: { name: 'Mosi', colour: '#4f5433' },
    egill: { name: 'Egill', colour: '#355774' },
    kambedla: { name: 'Kambeðla', colour: '#5d4370' },
  },
  lines: Object.fromEntries(Object.entries(WORDS).map(([id, text]) => [id, { text, audio: id }])),
  // The camera shows this shot while the start button waits: the glade as chapter 1 left it.
  startShot: 'glade_leaving',
  // The trail and then Síkið are built once the start button shows, a slice at a time, and kept, hidden (engine/locations.js: prepare;
  // main.js): the script's first fade from black waits for the trail, and the change of place to either waits for its build.
  prepare: ['fenjaslod', 'siki'],
  // The first animal the chapter puts in the book (the dragonfly over the trail's third print): main.js shows its card's drawing once
  // where nobody sees a frame stall, so its flight into the book is not the first drawing with the hand-drawn filter.
  firstFind: 'dragonfly',

  /**
   * What the chapter draws once where nobody sees a frame stall (engine/warm-up.js): behind the start button, and again under the
   * black as it comes to a place. `place` is the place it is drawn for (main.js), and each place brings what shows there first, so
   * each black waits for its own: the glade, where the chapter starts, only the actors, so the start button waits for no more than
   * the glade shows; the trail a print with its water, its digit up and a splash, and its animals; Síkið a berry bush with a bunch
   * picked (the hummocks' bushes). No place (null): all of it.
   */
  warmUp(world, { place = null } = {}) {
    const actors = [...world.actors.values()].map(actor => actor.root);
    const shots = ['glade_leaving'];
    if (place === 'burknalaut') return { objects: actors, shots, dispose() {} };
    const ground = (x, z) => [x, world.heightAt(x, z), z];
    const objects = [...actors], throwaways = [];
    const keep = (made, object) => { objects.push(object); throwaways.push(made); };
    if (place !== 'siki') {
      const prints = createMudPrints(world, { prints: [{ position: [0, 0.5], heading: 0 }], size: PRINT_SIZE });
      prints.count(0);
      prints.splash(0);
      keep(prints, prints.group);
      const critters = createCritters(world, {
        spots: PRINT_ANIMALS.map(({ kind }, i) => ({ name: `warm-up-${kind}`, kind, position: ground(i * 0.6 - 2, 1.5), heading: 0 })),
      });
      keep(critters, critters.group);
    }
    if (place === null || place === 'siki') {
      // the fish she holds in her jaws (hidden until she has one): its material is drawn here, not for the first time as she lifts her head
      const held = world.chapterState?.uggedlaRig?.fish.group;
      if (held) objects.push(held);
      // a red and a blue bush, as many as Síkið has (their shader is one a number of bushes: the Fen's warm-up does the same)
      const berries = createBerryBushes(world, { bushes: [{ kind: 'red', count: 1 }, { kind: 'red', count: 1 }, { kind: 'blue', count: 1 }].map((b, i) => ({ ...b, position: ground(2 + i, 2) })) });
      keep(berries, berries.group);
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
    const uggedla = s.actor('uggedla');
    const thorsedla = s.actor('thorsedla');
    const world = mosi.raw.world;
    world.chapterTimeline = [];
    uggedla.raw.root.visible = thorsedla.raw.root.visible = false; // they wait for Síkið (arriveInSiki)
    egill.raw.footprintScale = EGILL_FOOTPRINT;
    const c = { s, world, mosi, egill, kambedla, uggedla, thorsedla, talking: false, saying: 0, printLog: [] };
    c.say = (speaker, id, options) => say(s, c, speaker, id, options); // for the trail's pieces
    c.ring = ringsFor(world, { most: 3 }); // the script's rings on the water (Þórseðla's falling leaves, in Síkið)
    world.chapterState = c; // what the scenes share, for captures and probes
    // As chapter 1 ended: Egill in the saddle on Mosi's back and Kambeðla's plates all alight.
    c.saddle = createSaddle(mosi.raw);
    c.saddle.object.visible = true;
    c.riding = ride(egill.raw, c.saddle, { settle: 0 });
    c.glow = world.effects.add(addPlateGlow(kambedla.raw));
    c.glow.setAll(1, { duration: 0 });
    yield s.camera.cut('glade_leaving');
    yield s.ready(); // the start button; immediate in captures
    // What main.js readies once the start button shows, for a child who tapped before it got there: the trail, built (it is drawn
    // as the scene comes there, under that black). The black holds for it, its star breathing (main.js). A capture (seeking) waits
    // for nothing, so its frames stay where they were: it builds the trail as it goes there.
    if (!s.seeking) {
      // a trail whose build failed: main.js has said so, and the change of place to it builds it again (locations.js drops it)
      yield s.prepare('fenjaslod').catch(() => {});
    }
    s.sfx('forest');
    yield s.fade(0, 0.8); // the scene opens from black (main.js): the glade comes up out of it
    yield* story(s, c);
  },
};
