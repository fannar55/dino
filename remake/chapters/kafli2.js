// Chapter 2: Boð til Þórseðlu (an invitation for Þórseðla). Scenes 1 to 8 of the approved script
// (docs/superpowers/specs/2026-10-21-kafli-2-bod-til-thorsedlu-design.md): from Kambeðla's fern glade Mosi and Egill ride out of
// the forest and down into the Fen, count Þórseðla's ten water-filled footprints, lure her nine-metre head down with five red
// berries, invite her to the Star Festival, ride her neck up to look out over the Fen and find three far friends for the book's
// map, slide down her neck into the saddle, and win the second star. Seven to nine minutes for a six-year-old, who can never fail
// it: every wait for the child has hints where the script gives them and ends by itself.
//
// This is the chapter's skeleton (the plan's first task): its places, actors, cast, lines and look, and the eight scenes in their
// order, each of which only marks its start. The trail and the Fen are stubs, a flat clearing with six shots each, until their own
// layouts come (the plan's second task); the scenes come after that.
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
import { addPlateGlow } from '../engine/plate-glow.js';

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
const TRAIL_DROP = 0.032; // m the ground falls each metre down the trail

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
  trail_wide: { position: [-15, 2.1, -4], target: [6, 1.4, 6.5], fov: 50 },
  trail_follow: { position: [8, 1.5, -3.5], target: [-3, 2.0, -0.5], fov: 46 },
  print_close: { position: [2.2, 0.9, 3.9], target: [7.5, 0.1, 4.8], fov: 50 },
  trail_fog: { position: [6, 1.4, 1.5], target: [18, 1.3, 13], fov: 48 },
  trail_portrait: { position: [5.5, 1.3, 5.5], target: [-1, 2.6, -1], fov: 36 },
  trail_end: { position: [18, 1.6, 9.5], target: [34, 1.0, 18], fov: 50 },
};

// ---------------------------------------------------------------------------------------------
// Fenið, the Fen: open water and golden reed with groves of swamp conifers, at real size. Þórseðla stands in the shallow pool p1
// facing east, toward the two swamp conifers she bites the tops of; when her head comes down (lowerHead) it reaches the bank
// where Egill holds up the berries. Mosi stands on a dry hummock south of her head, with the pool p4 behind him, and the berry
// hummocks are east of him. The channel winds from the north-west out to the far treeline in the south-east, north of her
// pool. The three far friends (Task 5) are only places here, out in the open fen where the lookout on her head sees them.

// Þórseðla: where she stands (her root, between her four feet) and points along her 22 m from her tail to where her head comes down.
const THORSEDLA = { position: [-2, 0, -9], heading: 0 };
const alongHer = metres => {
  const h = (THORSEDLA.heading * Math.PI) / 180;
  return { position: [THORSEDLA.position[0] + Math.cos(h) * metres, 0, THORSEDLA.position[2] + Math.sin(h) * metres] };
};

const FEN_WATER = {
  pools: [
    { center: [-3.5, -9], radius: 6.5, depth: 0.3 }, // p1: Þórseðla's shallow pool
    { center: [-15, 7], radius: 6, depth: 0.35 }, // p2: south-west, toward the sun
    { center: [-27, -9], radius: 5.5, depth: 0.35 }, // p3: west
    { center: [10, 9], radius: 4.5, depth: 0.35 }, // p4: behind Mosi, seen past him from the north-west
    { center: [-70, -38], radius: 7, depth: 0.35 }, // p5: far out, where Slóeðla wades (Task 5)
  ],
  channel: {
    line: [[-150, -105], [-95, -70], [-58, -48], [-34, -30], [-14, -24], [6, -22], [22, -14], [32, 2], [44, 22], [66, 42], [100, 62], [150, 96]],
    width: 4, depth: 0.5,
  },
};

const FEN_SHOTS = {
  // Scene 3: the trail ends on Mosi's hummock; the camera rises over him and pans right across the Fen, the pools glittering
  // toward the sun, and ends with Þórseðla far right, in the water at her real size (a move from the first to the second).
  fen_reveal: { position: [12, 1.6, 4], target: [-14, 1.5, 10], fov: 46 },
  fen_reveal_end: { position: [7.5, 5.8, 10.5], target: [-3, 3, -8.5], fov: 50 },
  // From below: her feet in the water like trunks, her head up in the swamp conifers.
  fen_thorsedla_low: { position: [-1, 0.45, -1], target: [3, 3.3, -9.5], fov: 56 },
  // Scene 5: her head down by Egill, Mosi beside them, the pool p4 behind Mosi.
  fen_two_shot: { position: [3.5, 1.4, 2.5], target: [5.2, 1.6, -7], fov: 46 },
  // Scene 4: over Egill's shoulder, her face coming down to him.
  fen_head_down: { position: [7.8, 1.25, -8.2], target: [3.6, 1.6, -9.2], fov: 40 },
  // Scene 4: the berry hummocks east of Mosi.
  fen_berries: { position: [9.5, 1.45, 3.0], target: [15, 0.6, -3.5], fov: 50 },
  // Scene 6: Egill by her lowered head, about to climb on; scene 7: the slide ends in the saddle on Mosi.
  fen_lift_start: { position: [10.5, 1.4, -3.5], target: [4.5, 1.6, -9], fov: 46 },
  fen_slide_end: { position: [12, 1.5, -6.5], target: [6.5, 2.3, -2.5], fov: 46 },
  // Scene 8: the two of them with Egill between, the pools glittering behind.
  fen_star: { position: [13.5, 1.3, -14], target: [1.5, 4.2, -5], fov: 52 },
  // For a tall screen: her neck rising into the conifers, Mosi and Egill small below.
  fen_portrait: { position: [13, 1.2, 2], target: [4.5, 4.6, -9], fov: 36 },
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
  yield s.wait(0.1);
}

// 4. The lure: five red berries for her, held up high, and her head comes down to Egill's eyes.
function* theLure(s, c) {
  mark(c, 4);
  yield s.wait(0.1);
}

// 5. The invitation: she will come, and asks Egill up.
function* theInvitation(s, c) {
  mark(c, 5);
  yield s.wait(0.1);
}

// 6. The lookout: up her neck to nine metres, where the child finds the three friends far away.
function* theLookout(s, c) {
  mark(c, 6);
  yield s.wait(0.1);
}

// 7. The slide down her neck into the saddle.
function* theSlide(s, c) {
  mark(c, 7);
  yield s.wait(0.1);
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
        // the two conifers whose tops she bites (about 11 m tall, their crowns from 4 m up); a white snag 10.5 m tall for Flugeðla
        // to perch on; reed round where Uggeðla lies, on her side away from the channel
        plants: [
          { name: 'swampConifer', position: [7.6, -10.4], scale: 0.98, variant: 5 },
          { name: 'swampConifer', position: [9.0, -7.0], scale: 0.9, variant: 3 },
          { name: 'deadSnag', position: [-52, -88], scale: 1.5, variant: 2 },
          ...[[72, 33], [78, 31], [84, 34], [88, 41], [69, 39], [82, 45]].map((position, k) => ({ name: 'horsetailReed', position, variant: k % 4, scale: 1.15 })),
        ],
        mist: [{ center: [-6, -2], radius: 26, height: 1.2 }],
        farFriends: { sloedla: [-70, -38], flugedla: [-52, -88], uggedla: [78, 40] },
        lookout: [5, 9.4, -9], // where Egill looks out from on her head, nine metres up
        actors: {
          mosi: { position: [8, 0, -3.5], heading: -125 },
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
    const c = { s, world, mosi, egill, kambedla, thorsedla, talking: false };
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
