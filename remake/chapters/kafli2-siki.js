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
// the hummocks) is kept. What capture changed:
//   - the water's edge is 4.5 m from Mosi's middle, not 1.5: his nose is 4.4 m ahead of it, and stops at the water; the reed is 12.6 m
//     out to her middle, measured from the same point (the test holds it to 10 to 16 m);
//   - (more below as the shots were found)
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
export const SIKI_PATH = [[-18, -1.5], [-12, 0.9], [-6, 0.8], [0, 0], [4.8, 0], [9.4, 0]].map(([a, b]) => ahead(a, b));
export const SIKI_WALK = SIKI_PATH.slice(0, 4); // from where Síkið begins to MOSI_BANK: Mosi's walk

// The channel comes up from the south-west along the front of the bank, passes the end of the path and turns east, then south-east,
// to the hummocks. 8 m wide (it breathes between 6.5 and 9.5 m along its length) and 1.25 m deep in the middle (world/props/water.js:
// the bed rises to each edge over 2.5 times the depth), so a swimmer 14 m long keeps her belly in the water with her sail up, and Mosi
// wades its shallow edge (water 0.3 to 0.6 m deep) a metre and a bit inside the bank. It ends in a rounded pool beside the hummocks.
const CHANNEL = [[9.2, -44], [9.2, -22], [9.2, -9], [9.2, 0], [9.2, 7], [12.4, 13], [20, 17], [30, 16], [40, 11], [48, 4]].map(([a, b]) => ahead(a, b));
const SIKI_WATER = { pools: [], channel: { line: CHANNEL, width: 8, depth: 1.25 } };
const SHAPE = waterShape(SIKI_WATER);
/** How deep the water is at [x, z] on the ground the forest digs (0 on dry ground). */
const depthAt = ([x, z]) => (SHAPE.signedAt(x, z) < 0 ? Math.max(0, SHAPE.level - SHAPE.bedAt(x, z)) : 0);

// ---------------------------------------------------------------------------------------------
// The points the scenes use

/** Mosi stops on the bank where the path goes under, his nose at the water, facing the way he came down. */
export const MOSI_BANK = spot(0, 0, PATH_HEADING);
// Uggeðla lies low across the channel, in the shallows by the far bank, her head to the north-east (the way the ferry will go), in the
// reed that hides all of her but her sail (the reed bed below). Her root is the middle of her 14 m.
export const UGGEDLA_REED = spot(12.6, 1.5, PATH_HEADING - 90);
// The fish jump in the channel's deep water round her head: five spots in the open water a few metres off, spread so that a child
// sees them one after the other across the picture, none behind another.
export const FISHING_SPOTS = [[9.6, 2.4], [8.4, 5.4], [10.4, 8.2], [9.2, 10.6], [13.0, 12.6]].map(([a, b]) => ahead(a, b));
// The ferry: her line along the middle of the channel from the crossing, a metre toward the far bank so that Mosi, wading the shallow
// edge on the near side, has the room, to the pool at the hummocks; and his line beside it. (Derived from the channel's own centre line
// and depth by tests/kafli2.test.mjs's rules: 1.13 m deep or more for her, 0.4 to 0.45 m for him.)
export const FERRY_LINE = [[8.3, 5.9], [10.3, 2.7], [12.3, 0.2], [14.8, -1.5], [17.8, -2.5], [20.6, -2.7], [23.7, -2.3], [26.5, -1.2], [29.1, 0.6], [31.5, 3], [33.6, 5.5], [35.4, 8.3], [36.9, 11.2], [38.2, 14.2], [39.3, 17.9], [40.1, 21.8], [40.6, 24.5]];
export const MOSI_WADE_LINE = [[4.6, 3.4], [6.6, 0.3], [9.6, -2.7], [13.1, -4.7], [17.2, -5.9], [20.7, -6.1], [24.6, -5.7], [28.3, -4.2], [31.2, -2], [34, 0.7], [36.5, 3.5], [38.8, 6.3], [40.8, 9.4], [42.3, 12.7], [43.4, 16.9], [44, 21], [44.4, 23.7]];
/** Mosi's stop at the end of the channel, on the dry moss hummock, where he comes up out of the water. */
export const HUMMOCK = { position: [47.4, 0, 27.0], heading: 215 };
/** Where she stops in the pool at the end, beside the hummock. */
export const UGGEDLA_DROP = { position: [40.2, 0, 23.6], heading: 80 };
/** Þórseðla, far off beyond the hummocks in the way the ferry goes, among low swamp conifers, biting the top of the one she faces. */
export const THORSEDLA_FAR = { position: [69, 0, 117], heading: -15 };

// ---------------------------------------------------------------------------------------------
// The plants the layout places itself (world/forest/plan.js: growFen places these first, and where it says); the Fen's own passes fill
// in the rest of the place round them (reed beds along the water, groves of swamp conifers, moss hummocks, ferns, lilies on the water).

const round2 = v => Math.round(v * 100) / 100;
const far = ([x, z], from = [0, 0]) => Math.hypot(x - from[0], z - from[1]);
const alongHer = metres => {
  const h = rad(THORSEDLA_FAR.heading);
  return { position: [round(THORSEDLA_FAR.position[0] + Math.cos(h) * metres), 0, round(THORSEDLA_FAR.position[2] + Math.sin(h) * metres)] };
};

/**
 * The reed bed she lies in: dense golden horsetail reed, 2.2 to 3.7 m tall (scale 1.45 to 1.8), over an ellipse round her middle,
 * 19 m along her and 12 across, where the water is not deeper than 0.8 m; and a few tall horsetails (3 to 5 m) behind it. From the
 * near bank, a camera at a child's height sees reed to the tops of her back and the sail standing out of it.
 */
function reedBed() {
  const random = seededRandom('siki reed bed');
  const [hx, hz] = [UGGEDLA_REED.position[0], UGGEDLA_REED.position[2]];
  const h = rad(UGGEDLA_REED.heading);
  const along = [Math.cos(h), Math.sin(h)], across = [-Math.sin(h), Math.cos(h)];
  const plants = [];
  const taken = [];
  const clear = p => taken.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.95);
  for (let tries = 0; tries < 900 && plants.length < 70; tries++) {
    const u = (random() * 2 - 1) * 9.5, v = (random() * 2 - 1) * 6;
    if ((u / 9.5) ** 2 + (v / 6) ** 2 > 1) continue;
    const p = [round2(hx + along[0] * u + across[0] * v), round2(hz + along[1] * u + across[1] * v)];
    if (depthAt(p) > 0.8 || !clear(p)) continue;
    taken.push(p);
    plants.push({ name: 'horsetailReed', position: p, variant: plants.length % 4, scale: round2(1.45 + random() * 0.35) });
  }
  for (let tries = 0, tall = 0; tries < 300 && tall < 14; tries++) {
    const u = (random() * 2 - 1) * 9, v = 2.2 + random() * 3.6;
    const p = [round2(hx + along[0] * u + across[0] * v), round2(hz + along[1] * u + across[1] * v)];
    if (depthAt(p) > 0 || SHAPE.signedAt(...p) < 0.5 || !clear(p)) continue;
    taken.push(p);
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
    if (SHAPE.signedAt(...p) < 1 || far(p, [HUMMOCK.position[0], HUMMOCK.position[2]]) < 2.4) continue;
    plants.push({ name: 'mossHummock', position: p, variant: k % 4, scale: round2(0.9 + random() * 0.5) });
  }
  return plants;
}

// ---------------------------------------------------------------------------------------------
// The layout

export const SIKI_LAYOUT = {
  seed: 13,
  // The clearing's middle is on the dry land inside the channel's bend, among the places the story spends its time (its ground is
  // finest within 40 m of it: the path's start, the crossing, the ferry's whole way).
  clearing: { center: [18, 6], radius: 24 },
  forestEdge: 30,
  path: SIKI_PATH,
  biome: 'fen',
  water: SIKI_WATER,
  // the dry moss mounds at the end of the channel, where Mosi comes up out of the water
  hummocks: [
    { center: [48, 26], radius: 6, height: 0.45 },
    { center: [55, 33], radius: 5, height: 0.35 },
  ],
  plants: [...reedBed(), ...lilies(), ...herTrees(), ...mossAtTheEnd()],
  mist: [
    { center: ahead(10, 4), radius: 24, height: 1.1 },
    { center: [44, 26], radius: 14, height: 1.0 },
  ],
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
  // The arrival: from behind the path's start, low, the path running on into the water with the reed beyond it; Mosi walks away down it.
  siki_arrive: { position: eye(-23, 3.0, 1.9), target: eye(7, 0.5, 1.2), fov: 46 },
  // Mosi and Egill at the water, the path gone under it, seen from the near bank across his nose.
  siki_flooded: { position: eye(2.5, -12, 1.5), target: eye(2.5, 0, 1.9), fov: 44 },
  // Over Mosi's right shoulder, across the channel to the reed bed, wide enough for her whole sail.
  siki_sail: { position: eye(-7, -5.5, 2.2), target: eye(14, 1.0, 3.6), fov: 50 },
  // Still and wide: the whole stretch of channel the fish jump in, Mosi on the bank at the left and her reed beyond.
  siki_fishing: { position: eye(-1.5, -14, 2.8), target: eye(10, 4.5, 1.0), fov: 52 },
  // Mosi and Uggeðla face to face across the water.
  siki_two_shot: { position: eye(4, -13, 1.7), target: eye(9, 3, 2.2), fov: 48 },
  // Low, looking up at her sail against the sky, where the star rises from its top.
  siki_star: { position: eye(2.8, -4.5, 0.9), target: eye(13, 2.0, 6.0), fov: 48 },
  // The ferry (moving shots, in her own frame: x ahead of her, y up, z to her right; Mosi wades on her left).
  ferry_side: { position: { actor: 'uggedla', part: 'feet', offset: [0.5, 1.8, 13], local: true }, target: { actor: 'uggedla', part: 'feet', offset: [0, 1.6, -3], local: true }, fov: 50 },
  ferry_front: { position: { actor: 'uggedla', part: 'feet', offset: [9, 1.6, 1.5], local: true }, target: { actor: 'uggedla', part: 'feet', offset: [0, 3.2, 0], local: true }, fov: 46 },
  ferry_back: { position: { actor: 'uggedla', part: 'feet', offset: [-8, 4.5, 0.8], local: true }, target: 'thorsedla.head', fov: 46 },
  // The end of the channel: Mosi coming up out of the water onto the hummock, Uggeðla in the pool, the berry bushes beyond.
  siki_hummocks: { position: [35.5, 1.6, 31.5], target: [44.5, 1.8, 25.5], fov: 48 },
  // For a tall screen: the sail over the reed, Mosi small below.
  siki_portrait: { position: eye(1.5, -6, 1.4), target: eye(12.5, 1.0, 4.0), fov: 38 },
};

// ---------------------------------------------------------------------------------------------
// The arrival

/** The berry bushes behind the hummocks, as a picture of the place: two big ones with red bunches facing the pool, a smaller blue one. */
export function berriesAtTheHummocks(world) {
  const spec = [
    { position: [53.5, 24.2], kind: 'red', count: 3, facing: 205, size: 1.5 },
    { position: [51.5, 31.8], kind: 'red', count: 2, facing: 215, size: 1.2 },
    { position: [57.6, 28.4], kind: 'blue', count: 3, facing: 200, size: 1.3 },
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
