import { RIVER, MARSH } from './bridge-props.js';
import { sandAt, walkable } from './world-ground.js';

// The memory game's own plants, named for the forest's planner (layout.plants: { name, position: [x, z], scale, variant, rot, sky }).
// They are the forest species as they are (ferns, mossy stones, golden reeds, bushes, flowers), only put where this place wants
// them: round the sandy glade, along the river and the marsh, round the grove and in the dark corners of the search view.
// Nothing stands where a friend or Mosi walks (walkable), on a leaf's ground (`avoid`) or on the sand.
const VARIANTS = Object.freeze({ fern: 5, bush: 8, flowers: 8, rock: 5, rockSmall: 5, horsetailReed: 4 });
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const GLADE = Object.freeze({ centre: [-4.2, 6.8], radius: [9.4, 7.8] });
// The dark corners of the search view: big ferns close to the camera that frame the picture, as in the mock ([x, z, scale]).
const FRAME = Object.freeze([[-11.5, 15.8, 2.3], [-13.8, 12, 2.4], [6.8, 13, 2.3], [9, 10.8, 2.4], [-15, 5.5, 2.6], [-15.8, 9.8, 2.6], [-14.5, 0, 2.4]]);
const round = value => Math.round(value * 100) / 100;

export function dressGround({ avoid = () => false } = {}) {
  const plants = [];
  let serial = 0;
  const next = () => hash(++serial + 7000);
  const pick = list => list[Math.floor(next() * list.length) % list.length];
  const range = (a, b) => a + (b - a) * next();
  const room = (x, z, margin = .4, sand = .3) => !walkable(x, z, margin) && !avoid(x, z, margin) && sandAt(x, z) < sand;
  function add(name, x, z, { scale = 1, variant = Math.floor(next() * VARIANTS[name]), sky = 1 } = {}) {
    plants.push({ name, position: [round(x), round(z)], scale: round(scale), variant, rot: round(next() * Math.PI * 2), sky });
  }
  // `count` tries of a place from `where()`, each kept when the ground there has room; `make` plants it.
  function scatter(count, where, make, { margin = .4, sand = .3 } = {}) {
    for (let i = 0; i < count; i++) { const [x, z] = where(); if (room(x, z, margin, sand)) make(x, z); }
  }
  const ring = (from, to) => () => { const a = next() * Math.PI * 2, e = range(from, to); return [GLADE.centre[0] + Math.cos(a) * GLADE.radius[0] * e, GLADE.centre[1] + Math.sin(a) * GLADE.radius[1] * e]; };

  // The glade's rim: fern beds, mossy stones and flowers where the sand turns to grass.
  scatter(150, ring(1.02, 1.55), (x, z) => {
    const roll = next();
    if (roll < .52) add('fern', x, z, { scale: range(1, 1.8) });
    else if (roll < .68) add('rockSmall', x, z, { scale: range(.7, 1.5) });
    else if (roll < .78) add('rock', x, z, { scale: range(.4, .8) });
    else if (roll < .96) add('flowers', x, z, { scale: range(.9, 1.4) });
    else add('bush', x, z, { scale: range(.7, 1.1), variant: pick([3, 6, 7]) });
  }, { margin: 1.2 });
  // Further out, bigger: bushes and ferns that make the edge of the clearing a wall of leaves.
  scatter(80, ring(1.5, 2.3), (x, z) => (next() < .75 ? add('fern', x, z, { scale: range(1.4, 2.4) }) : add('bush', x, z, { scale: range(1.1, 1.6), variant: pick([3, 6, 7]) })), { margin: 1 });

  for (const [x, z, scale] of FRAME) if (room(x, z, .5)) add('fern', x, z, { scale, sky: .5 });

  // The river's banks: reeds and stones at the water's edge, on both sides.
  const bank = () => { const i = 1 + Math.floor(next() * (RIVER.points.length - 2)), [ax, az] = RIVER.points[i - 1], [bx, bz] = RIVER.points[i + 1], l = Math.hypot(bx - ax, bz - az), side = next() < .5 ? -1 : 1, d = range(2, 3.4); return [RIVER.points[i][0] - (bz - az) / l * d * side, RIVER.points[i][1] + (bx - ax) / l * d * side]; };
  scatter(110, bank, (x, z) => {
    const roll = next();
    if (roll < .4) add('horsetailReed', x, z, { scale: range(.5, .85) });
    else if (roll < .6) add('rock', x, z, { scale: range(.35, .9) });
    else if (roll < .8) add('fern', x, z, { scale: range(.9, 1.5) });
    else add('flowers', x, z, { scale: range(.9, 1.3) });
  }, { margin: .3 });

  // The marsh: golden reeds and stones round it where nobody walks (its ends and the strip of bank beside the boardwalk's lane).
  const marsh = () => { const a = next() * Math.PI * 2, e = range(1.05, 1.5); return [MARSH.center[0] + Math.cos(a) * (MARSH.halfWidth + 1.2) * e, MARSH.center[1] + Math.sin(a) * (MARSH.halfDepth + 1.2) * e]; };
  scatter(90, marsh, (x, z) => {
    const roll = next();
    if (roll < .7) add('horsetailReed', x, z, { scale: range(.6, 1) });
    else if (roll < .85) add('rockSmall', x, z, { scale: range(.8, 1.6) });
    else add('fern', x, z, { scale: range(.9, 1.4) });
  }, { margin: .3 });

  // The grove: ferns, flowers and stones round its berry shrubs (build-props.js), and a few leafy bushes behind them.
  const grove = () => { const a = Math.PI + next() * Math.PI, e = range(1.0, 1.8); return [4.5 + Math.cos(a) * 6.4 * e, -26 + Math.sin(a) * 4.4 * e - 1.2]; };
  scatter(60, grove, (x, z) => {
    const roll = next();
    if (roll < .5) add('fern', x, z, { scale: range(1, 1.8) });
    else if (roll < .75) add('flowers', x, z, { scale: range(1, 1.4) });
    else if (roll < .9) add('rock', x, z, { scale: range(.45, 1) });
    else add('bush', x, z, { scale: range(1, 1.5), variant: pick([3, 6, 7]) });
  }, { margin: .8 });
  return plants;
}
