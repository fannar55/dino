// Chapter 2's Síkið (remake/chapters/kafli2.js, scenes 3 to 7): the channel the Fenjaslóð has flooded under, in the Fen's look, wet,
// golden and clear (STYLE.md 4; docs/superpowers/specs/2026-10-31-kafli-2-bod-til-uggedlu-design.md, section 3). It is a place of its own,
// built apart from the trail and the Fen so that neither re-deals a plant of the other. This file is its data and its arrival:
//   SIKI_LAYOUT, SIKI_SHOTS   the place (engine/locations.js) and the camera shots set in it
//   SIKI_PATH, SIKI_WALK      the path as it comes to the water, and Mosi's walk down it to MOSI_BANK
//   MOSI_BANK, UGGEDLA_REED, FISHING_SPOTS, FERRY_LINE, MOSI_WADE_LINE, HUMMOCK, UGGEDLA_DROP, THORSEDLA_FAR   the named points the scenes use
//   arriveInSiki(s, c)        under the black: the trail let go of, Mosi at the path's start, Uggeðla lying low, Þórseðla far off and alive
//   berriesAtTheHummocks(world)   the berry bushes behind the hummocks (a picture: nothing to pick here)
// `c` is the chapter's shared state (kafli2.js).
//
// Metres, +Y up, north is -Z, headings in degrees (0 faces +X, 90 faces +Z). The late morning sun (engine/looks.js: lateMorning) stands
// in the west-south-west, heading 150. The numbers are written in the path's own frame, `ahead(a, b)`: a metres along the path as it
// comes to the water (heading 35, south-east) from MOSI_BANK, and b metres to the left of it (north-east); `ahead` gives the world
// [x, z], so MOSI_BANK is its origin. Points are { position: [x, 0, z], heading } (y is the ground: actors stand on it), lines are
// [x, z].
//
// The brief's starting geometry (the path from the north-west to (0, 0) heading 35; the channel across it, south-west to north-east,
// then east for about 50 m to the hummocks near (45, 25); her reed across the channel about 10 m from Mosi; Þórseðla 90 to 110 m beyond
// the hummocks) is kept in its shape. What capture changed, and why:
//   - the water's edge is 4.5 m from Mosi's middle, not 1.5: his nose is 4.4 m ahead of it, so he stops with it at the water;
//   - her reed is 13.7 m from Mosi, not 10: it is the far bank's edge across a channel of 8 m, where the bank is straight for her 14 m;
//     on the bend further on, her head would have lain in open water, with no reed in front of it to hide it;
//   - the channel ends in a round pool 11 m across (it ended in a rounded point 8 m wide, and she looked to be in a puddle), and the
//     Fen's low ground at the water's edge is raised to stand 0.1 m over it (liftBanks), or the edge showed as a step with the water
//     hanging over bare mud;
//   - the clearing is 34 m in radius round (17.3, 8.7), not the Fen's 24 round the origin: the grass grows only within 38 m of the
//     clearing's middle (grass.js), and the place is 70 m long; the path is 14 m long before the water (the walk is 12 s);
//   - the reed is a wall of clumps a metre apart, the rows toward the channel 3 to 4.9 m tall (85 clumps: a denser wall cost 60k
//     triangles, over the tablet's 250k in the sail, fishing and star shots), where the Fen's own reed (a clump a metre or more apart,
//     1.5 to 2.2 m tall) left her in plain sight; and one mist, not two: each card is additive over the water, most of a wide shot;
//   - Þórseðla is 84 m beyond the hummocks, not 90 to 110: at 107 m through the look's haze she was a pale ghost; her trees are lower
//     than her head (4.5 to 6.5 m, and the 8.5 m one she bites), so that from the ferry her neck and head stand out over them;
//   - the ferry's shots are in Mosi's frame, not Uggeðla's: she sinks into the water as she swims (her root goes under the bed), he
//     stands on it, so a camera placed from his feet is where it was put whatever her pose, and the shots look at her wherever she is.
import * as THREE from 'three';
import { seededRandom } from '../engine/random.js';
import { waterShape } from '../world/props/water.js';
import { createBerryBushes } from '../world/props/berries.js';
import { thorsedlaLife } from './kafli3-thorsedla.js';

// ---------------------------------------------------------------------------------------------
// The frame

const rad = THREE.MathUtils.degToRad;
const PATH_HEADING = 35;
const AHEAD = [Math.cos(rad(PATH_HEADING)), Math.sin(rad(PATH_HEADING))]; // down the path to the water
const LEFT = [AHEAD[1], -AHEAD[0]]; // and to its left: north-east, the way the channel goes first
const round = v => Math.round(v * 10) / 10;
/** The world [x, z] of the point `a` m along the path from MOSI_BANK and `b` m to its left. */
const ahead = (a, b) => [round(a * AHEAD[0] + b * LEFT[0]), round(a * AHEAD[1] + b * LEFT[1])];
/** The same as a camera position or target: [x, y, z] with y the height in metres. */
const eye = (a, b, height) => { const [x, z] = ahead(a, b); return [x, height, z]; };
/** A named place: { position: [x, 0, z], heading }. */
const spot = (a, b, heading) => { const [x, z] = ahead(a, b); return { position: [x, 0, z], heading }; };

// ---------------------------------------------------------------------------------------------
// The path and the water

// The path comes in from the north-west (the trail's way on) and is flooded: its last 4.9 m lie under the channel, from the water's edge
// 4.5 m past MOSI_BANK to its end just past the channel's middle. A little crooked, as a trodden path is.
export const SIKI_PATH = [[-14, -1.0], [-8, 0.8], [-4, 0.6], [0, 0], [4.8, 0], [9.4, 0]].map(([a, b]) => ahead(a, b));
export const SIKI_WALK = SIKI_PATH.slice(0, 4); // from where Síkið begins to MOSI_BANK: Mosi's walk

// The channel comes up from the south-west along the front of the bank, passes the end of the path and turns east, then south-east,
// to the hummocks. 8 m wide (it breathes between 6.5 and 9.5 m along its length) and 1.25 m deep in the middle (world/props/water.js:
// the bed rises to each edge over 2.5 times the depth), so a swimmer 14 m long keeps her belly in the water with her sail up, and Mosi
// wades its shallow edge (water 0.3 to 0.6 m deep) a metre and a bit inside the bank.
const CHANNEL = [[9.2, -44], [9.2, -22], [9.2, -9], [9.2, 0], [9.2, 7], [12.4, 13], [20, 17], [30, 16], [40, 11], [48, 4]].map(([a, b]) => ahead(a, b));
// and a round pool 11 m across at its end, as deep as the channel, where she stops, so that all of her fits in it.
const SIKI_WATER = { pools: [{ center: [41.4, 25.2], radius: 5.5, depth: 1.25 }], channel: { line: CHANNEL, width: 8, depth: 1.25 } };
const SHAPE = waterShape(SIKI_WATER);
/** How deep the water is at [x, z] on the ground the forest digs (0 on dry ground). */
const depthAt = ([x, z]) => (SHAPE.signedAt(x, z) < 0 ? Math.max(0, SHAPE.level - SHAPE.bedAt(x, z)) : 0);

// ---------------------------------------------------------------------------------------------
// The points the scenes use

/** Mosi stops on the bank where the path goes under, his nose at the water, facing the way he came down. */
export const MOSI_BANK = spot(0, 0, PATH_HEADING);
// Uggeðla lies low across the channel, on the far bank's edge where the bank is straight (a 14 m body), her head to the north-east (the
// way the ferry will go), in the shallows and the reed that hides all of her but her sail (the reed bed below). Her root is the
// middle of her 14 m.
export const UGGEDLA_REED = spot(13.4, -2.0, PATH_HEADING - 90);
// The fish jump in the channel's deep water round her head (6 m from her middle, to the north-east): six spots in the open water 3 to
// 7 m off it, spread across the channel's width so that, seen from the near bank, a child sees them one after the other across the
// picture and none behind another.
export const FISHING_SPOTS = [[11.2, 1.4], [9.0, 3.4], [11.4, 6.6], [8.4, 7.2], [10.4, 10.0], [7.0, 2.0]].map(([a, b]) => ahead(a, b));
// The ferry: her line along the middle of the channel from the crossing, a metre toward the far bank so that Mosi, wading the shallow
// edge on the near side, has the room, to the pool at the hummocks; and his line beside it. (Derived from the channel's own centre line
// and depth by tests/kafli2.test.mjs's rules: 1.13 m deep or more for her, 0.4 to 0.45 m for him.)
export const FERRY_LINE = [[8.3, 5.9], [10.3, 2.7], [12.3, 0.2], [14.8, -1.5], [17.8, -2.5], [20.6, -2.7], [23.7, -2.3], [26.5, -1.2], [29.1, 0.6], [31.5, 3], [33.6, 5.5], [35.4, 8.3], [36.9, 11.2], [38.2, 14.2], [39.3, 17.9], [40.1, 21.8], [40.6, 24.5]];
export const MOSI_WADE_LINE = [[4.6, 3.4], [6.6, 0.3], [9.6, -2.7], [13.1, -4.7], [17.2, -5.9], [20.7, -6.1], [24.6, -5.7], [28.3, -4.2], [31.2, -2], [34, 0.7], [36.5, 3.5], [38.8, 6.3], [40.8, 9.4], [42.3, 12.7], [43.4, 16.9], [43.6, 18.4], [43.8, 19.9], [44, 21.4], [44.7, 21.8], [45.7, 22.5], [45.8, 23.4], [45.2, 24.8], [45.1, 26.2], [44.8, 27.6]];
/** Mosi's stop at the end of the channel, on the dry moss hummock, where he comes up out of the water. */
export const HUMMOCK = { position: [49.2, 0, 27.6], heading: 215 };
/** Where she stops in the pool at the end, beside the hummock. */
export const UGGEDLA_DROP = { position: [40.2, 0, 23.6], heading: 80 };
/** Þórseðla, far off beyond the hummocks in the way the ferry goes, among low swamp conifers, biting the top of the one she faces. */
export const THORSEDLA_FAR = { position: [66, 0, 110], heading: -15 };

// ---------------------------------------------------------------------------------------------
// The plants the layout places itself (world/forest/plan.js: growFen places these first, and where it says); the Fen's own passes fill
// in the rest of the place round them (reed beds along the water, groves of swamp conifers, moss hummocks, ferns, lilies on the water).

const round2 = v => Math.round(v * 100) / 100;
const alongHer = metres => {
  const h = rad(THORSEDLA_FAR.heading);
  return { position: [round(THORSEDLA_FAR.position[0] + Math.cos(h) * metres), 0, round(THORSEDLA_FAR.position[2] + Math.sin(h) * metres)] };
};

/**
 * The reed bed she lies in: dense golden horsetail reed over the ellipse round her middle, 21 m along her and 12 across, where the
 * water is not deeper than 0.75 m: a clump every metre, 3 to 4.9 m tall (scale 2 to 2.25), in the rows toward the channel, and
 * 2.3 to 4 m tall, 2 m apart behind her; and a few tall horsetails (3 to 5 m) behind it. From the near bank, a camera at a child's
 * height sees reed to the tops of her back and her sail standing out of it.
 */
function reedBed() {
  const random = seededRandom('siki reed bed');
  const [hx, hz] = [UGGEDLA_REED.position[0], UGGEDLA_REED.position[2]];
  const h = rad(UGGEDLA_REED.heading);
  const along = [Math.cos(h), Math.sin(h)], across = [-Math.sin(h), Math.cos(h)];
  const plants = [];
  // the rows toward the channel are the wall she is hidden behind: close together and a head taller than the rest (scale 2 to
  // 2.25: 3 to 4.9 m); the rest, behind her where nobody looks, stand twice as far apart
  for (let u0 = -10.5; u0 <= 10.5; u0 += 1.0) {
    for (let v0 = -6; v0 <= 6; v0 += v0 < 0.8 ? 1.0 : 2.4) {
      const u = u0 + (random() - 0.5) * 0.4, v = v0 + (random() - 0.5) * 0.4;
      if ((u / 10.5) ** 2 + (v / 6) ** 2 > 1) continue;
      const p = [round2(hx + along[0] * u + across[0] * v), round2(hz + along[1] * u + across[1] * v)];
      if (depthAt(p) > 0.75) continue;
      const wall = v < 0.8;
      plants.push({ name: 'horsetailReed', position: p, variant: plants.length % 4, scale: round2(wall ? 2.0 + random() * 0.25 : 1.5 + random() * 0.3) });
    }
  }
  for (let tries = 0, tall = 0; tries < 300 && tall < 6; tries++) {
    const u = (random() * 2 - 1) * 9, v = 2.2 + random() * 3.6;
    const p = [round2(hx + along[0] * u + across[0] * v), round2(hz + along[1] * u + across[1] * v)];
    if (depthAt(p) > 0 || SHAPE.signedAt(...p) < 0.5) continue;
    tall++;
    plants.push({ name: 'horsetailTall', position: p, variant: tall % 4, scale: round2(1.15 + random() * 0.3) });
  }
  return plants;
}

/** Water lilies in the shallows along the near bank, where the child stands: 0.2 to 0.8 m of water. */
function lilies() {
  const random = seededRandom('siki lilies');
  const plants = [];
  for (let b = -10; b <= 12; b += 2.6) {
    for (let tries = 0; tries < 12; tries++) {
      const p = ahead(5.2 + random() * 3.2, b + (random() - 0.5) * 2);
      const depth = depthAt(p);
      if (depth < 0.2 || depth > 0.8) continue;
      plants.push({ name: 'waterLily', position: p, variant: plants.length % 6, scale: round2(1.0 + random() * 0.3) });
      break;
    }
  }
  return plants;
}

/**
 * Þórseðla's trees: the one she bites (8.5 m, level with her head, in front of her and a little to her left, as in the Fen), and a
 * low ring of swamp conifers between her and the channel, 4.5 to 6.5 m tall, so that her body is hidden from the ferry and her
 * head and neck stand out over the tops (her head is 8.3 to 9 m up).
 */
function herTrees() {
  const random = seededRandom('siki thorsedla trees');
  const h = rad(THORSEDLA_FAR.heading);
  const [x, z] = [THORSEDLA_FAR.position[0], THORSEDLA_FAR.position[2]];
  const local = (ahead_, left) => [round2(x + Math.cos(h) * ahead_ - Math.sin(h) * left), round2(z + Math.sin(h) * ahead_ + Math.cos(h) * left)];
  const plants = [{ name: 'swampConifer', position: local(9.6, -2.1), scale: 0.72, variant: 7 }];
  // toward the ferry: the way she is seen from the channel (south-west to north is where the camera comes from)
  const to = rad(bearing([x, z], [41, 24]));
  for (let k = 0; k < 16; k++) {
    const d = 10 + random() * 24, side = (random() - 0.5) * 40;
    const p = [round2(x + Math.cos(to) * d - Math.sin(to) * side), round2(z + Math.sin(to) * d + Math.cos(to) * side)];
    if (plants.some(q => Math.hypot(q.position[0] - p[0], q.position[1] - p[1]) < 3.6)) continue;
    plants.push({ name: 'swampConifer', position: p, scale: round2(0.36 + random() * 0.18), variant: Math.floor(random() * 12) });
  }
  return plants;
}
function bearing([x, z], [tx, tz]) { return (Math.atan2(tz - z, tx - x) * 180) / Math.PI; }

/** The moss hummocks at the end of the channel (dry mounds with moss on them). */
function mossAtTheEnd() {
  const random = seededRandom('siki moss');
  const plants = [];
  for (let k = 0; k < 9; k++) {
    const a = random() * Math.PI * 2, d = 1.2 + random() * 5.2;
    const p = [round2(HUMMOCK.position[0] + 1 + Math.cos(a) * d), round2(HUMMOCK.position[2] - 1 + Math.sin(a) * d)];
    if (SHAPE.signedAt(...p) < 1 || Math.hypot(p[0] - HUMMOCK.position[0], p[1] - HUMMOCK.position[2]) < 2.4) continue;
    plants.push({ name: 'mossHummock', position: p, variant: k % 4, scale: round2(0.9 + random() * 0.5) });
  }
  return plants;
}

// ---------------------------------------------------------------------------------------------
// The layout

// The Fen's ground comes down to the water's edge only where it stands higher than the water; where its low swell would leave it
// lower, the edge shows as a step with the water hanging over bare mud. So within 2.5 m of the water the ground is raised, if it must
// be, to stand 0.1 m over it (the forest's own easing then lays the bank down to the water's edge); beyond 4.5 m it is untouched.
// The clearing's middle is further than that from the water, so the heights are still counted from it.
const BANK = 0.1;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function liftBanks(x, z, natural) {
  const s = SHAPE.signedAt(x, z);
  if (s >= 4.5) return 0;
  return Math.max(0, SHAPE.level + BANK - natural) * (1 - smoothstep(2.5, 4.5, s));
}

export const SIKI_LAYOUT = {
  seed: 13,
  // The clearing's middle is on the dry land inside the channel's bend, 37 m from the path's start and 29 m from the pool at the end:
  // the ground is finest within 40 m of it and the grass grows only within 38 m of it (grass.js), full as far as the clearing's
  // radius, so the clearing reaches 34 m: the whole way from the path's start to the hummocks has its grass.
  clearing: { center: [17.3, 8.7], radius: 34 },
  forestEdge: 40,
  path: SIKI_PATH,
  biome: 'fen',
  water: SIKI_WATER,
  lift: liftBanks,
  // the dry moss mounds at the end of the channel, where Mosi comes up out of the water
  hummocks: [
    { center: [49.5, 27.5], radius: 6.5, height: 0.45 },
    { center: [56, 34], radius: 5, height: 0.35 },
  ],
  plants: [...reedBed(), ...lilies(), ...herTrees(), ...mossAtTheEnd()],
  mist: [{ center: ahead(10, 4), radius: 24, height: 1.1 }], // one, as the Fen has: each card is additive over the water, and the water is most of a wide shot
  // Þórseðla is seen from the last stretch of the ferry's way only: tall plants keep out of the corridor from there to her
  farFriends: { thorsedla: [THORSEDLA_FAR.position[0], THORSEDLA_FAR.position[2]] },
  lookout: [33.8, 4, 4.1],
  actors: {
    mosi: MOSI_BANK,
    egill: MOSI_BANK, // in the saddle on his back
    uggedla: UGGEDLA_REED,
    thorsedla: THORSEDLA_FAR,
    thorsedla_tail: alongHer(-9.5),
    thorsedla_neck: alongHer(3),
    thorsedla_head: alongHer(6),
  },
};

// ---------------------------------------------------------------------------------------------
// The shots

export const SIKI_SHOTS = {
  // The arrival: from far behind the path's start, a little up, the whole way down it to the water and the reed beyond; Mosi walks away.
  siki_arrive: { position: eye(-24, 3.0, 2.6), target: eye(6, 1.0, 1.7), fov: 48 },
  // Mosi and Egill at the water, the path gone under it: from the channel in front of them, low over the water, looking back at
  // Mosi's face with the flooded path running under us to his feet.
  siki_flooded: { position: eye(10.5, -1.2, 1.6), target: eye(2.5, 0.0, 1.2), fov: 48 },
  // Over Mosi's right shoulder, across the channel to the reed bed, wide enough for her whole sail.
  siki_sail: { position: eye(-9, -7.5, 2.3), target: eye(14, 1.5, 3.6), fov: 48 },
  // Still and wide: the whole stretch of channel the fish jump in, Mosi on the bank at the left and her reed beyond.
  siki_fishing: { position: eye(-2, -16, 5.0), target: eye(10, 6, 1.4), fov: 54 },
  // Mosi and Uggeðla face to face across the water.
  siki_two_shot: { position: eye(3, -15, 1.9), target: eye(9, 3, 2.3), fov: 44 },
  // Low, looking up at her sail against the sky, where the star rises from its top.
  siki_star: { position: eye(3.5, -10.5, 0.9), target: eye(13.5, 1.5, 6.2), fov: 48 },
  // The ferry, moving shots in Mosi's frame (x ahead of him, y up from the water he wades, z to his right: toward her): he is on
  // the ground whatever she does, and the shots look at her wherever she is. Mosi wades the near bank, 3 to 4.5 m from her.
  // Side by side: from the inner bank a little ahead of them, across her and Mosi, who stand clear of each other from there.
  ferry_side: { position: { actor: 'mosi', part: 'feet', offset: [9, 3.0, 16], local: true }, target: { actor: 'mosi', part: 'feet', offset: [0, 1.8, 2.6], local: true }, fov: 50 },
  // From the front, over the water: her head, Egill on her back and the sail over him.
  ferry_front: { position: { actor: 'mosi', part: 'feet', offset: [13, 1.5, 4.2], local: true }, target: { actor: 'uggedla', offset: [2, 1.6, 0] }, fov: 46 },
  // From behind and above, over her sail: where she is going, and Þórseðla's head over the trees.
  ferry_back: { position: { actor: 'mosi', part: 'feet', offset: [-12, 4.6, 4.2], local: true }, target: 'thorsedla.head', fov: 46 },
  // The end of the channel: Mosi coming up out of the water onto the hummock, Uggeðla in the pool, the berry bushes beyond.
  siki_hummocks: { position: [31.5, 1.7, 33.5], target: [45.5, 2.2, 25.8], fov: 50 },
  // For a tall screen: the sail over the reed, Mosi small below.
  siki_portrait: { position: eye(1.5, -6, 1.4), target: eye(12.5, 1.0, 4.0), fov: 38 },
};

// ---------------------------------------------------------------------------------------------
// The arrival

/** The berry bushes behind the hummocks, as a picture of the place: two big ones with red bunches facing the pool, a smaller blue one. */
export function berriesAtTheHummocks(world) {
  const spec = [
    { position: [55.3, 24.6], kind: 'red', count: 3, facing: 205, size: 1.5 },
    { position: [53.4, 32.4], kind: 'red', count: 2, facing: 215, size: 1.2 },
    { position: [59.6, 29.0], kind: 'blue', count: 3, facing: 200, size: 1.3 },
  ];
  return createBerryBushes(world, { bushes: spec.map(b => ({ ...b, position: [b.position[0], world.heightAt(...b.position), b.position[1]] })) });
}

/**
 * Síkið, under the black the trail's end leaves: the trail's prints and their animals let go of and Kambeðla hidden, Mosi (with Egill
 * in the saddle) at the path's start, Uggeðla at her reed (hidden until her lying-low pose is built) and Þórseðla in her trees, alive;
 * the Fen's water sounds go on, and the camera cuts to the arrival.
 */
export function arriveInSiki(s, c) {
  const { world, kambedla, mosi, uggedla, thorsedla } = c;
  c.prints?.dispose();
  c.printCritters?.dispose();
  c.prints = c.printCritters = null;
  kambedla.raw.root.visible = false;
  c.trailWalk?.cancel(); // his walk on down the trail ended with it
  const [sx, sz] = SIKI_PATH[0], [nx, nz] = SIKI_PATH[1];
  mosi.place(sx, sz, bearing([sx, sz], [nx, nz]));
  uggedla.place(UGGEDLA_REED.position[0], UGGEDLA_REED.position[2], UGGEDLA_REED.heading);
  uggedla.raw.root.visible = false; // lies low in the reed; her pose is the next task's
  thorsedla.raw.root.visible = true;
  thorsedla.place(THORSEDLA_FAR.position[0], THORSEDLA_FAR.position[2], THORSEDLA_FAR.heading);
  c.berries = berriesAtTheHummocks(world);
  thorsedlaLife(s, c); // idle, and a bite or a nod every 7 to 12 s: no taps here, she is too far off to be tapped
  s.sfx('fen'); // laid on the trail already: asked again, it stays as it is
  s.camera.cut('siki_arrive');
}
