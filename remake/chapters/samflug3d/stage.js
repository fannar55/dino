// Samflug's stage (chapters/samflug3d.js): the camera flying backwards down a long straight forest lane, the screen plane, the lane's
// width (the rule that keeps whatever an edge of the frame cuts behind the screen) and the forest it is grown as.
//
// The camera looks along -Z, level, CAM_H over the lane's highest ground, and flies along +Z at the address's speed (hradi=, m/s).
// Everything that stands in the world enters the frame at an edge as the camera passes it, so the lane is the stage: nothing may be
// nearer than D where an edge cuts it.

export const FOV = 46; // vertical, degrees, of the stage's 16:10 frame (its width at depth z is 1.358 z)
export const ASPECT = 16 / 10;
export const D = 13; // m: the screen plane (her body at k 0.75 is 9.75 m away: her wings span about 70 % of the frame there)
export const CAM_H = 5.8; // m over the highest ground under the lane's near part (the ground at the bottom edge is then beyond D)
export const LENGTH = 15; // s: the trial loops
export const SPEED = { default: 4, max: 8 };
export const START_Z = -24; // where the camera is at second 0
export const MARGIN = 1.0; // m kept in hand beyond the lane rule (sway, a crown's lobe)

const rad = d => (d * Math.PI) / 180;
export const tanV = Math.tan(rad(FOV) / 2);
export const tanH = tanV * ASPECT;

/**
 * The lane rule: the clear half width a lane needs so that a thing at its side is cut by the frame's side edge no nearer than D.
 * A thing at x = w (from the axis) is at the edge where its depth is w / tan(horizontal half angle): that must be D or more.
 */
export const laneHalf = (d = D, h = tanH, margin = MARGIN) => d * h + margin;
/** The same for the ground at the bottom edge: the camera's height over it so the ground there is D away or further (level camera). */
export const groundClear = (d = D, v = tanV) => d * v;
/** How far down the lane (depth, m) a thing standing `w` m from its middle first shows at the side edge. */
export const entersAt = (w, h = tanH) => w / h;

// The lane's walls: the clear half width the rule asks for (13 · 0.679 + 1 = 9.8 m), then crowns reach in: trunks stand further out.
export const CLEAR = laneHalf(); // nothing of a plant inside this (|x| < CLEAR): crowns included
export const TRUNKS = [15.0, 18.2, 22, 27]; // m: the rows of trunks each side (the first row's crowns reach in to about CLEAR)
export const NEAR_SCALE = [0.95, 1.08]; // the first two rows' broadleaves (a broadleaf's crown reaches about 6.5 m from its trunk at scale 1)
export const LANE = { from: 130, to: -190 }; // z: the lane's planted length (the camera goes from START_Z to START_Z + 15 · max speed)

let seed = 23;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** The lane's plants: rows of tall trees each side, tree ferns and bushes before them, all where the rule allows (layout.plants). */
export function lanePlants() {
  seed = 23;
  const out = [];
  for (const side of [-1, 1]) {
    TRUNKS.forEach((x0, row) => {
      const step = row === 0 ? 7.5 : 6.5;
      for (let z = LANE.from; z > LANE.to; z -= step * (0.8 + 0.4 * rnd())) {
        const araucaria = rnd() < 0.25 + 0.1 * row;
        // the near rows' broadleaf crowns lean out of the lane (their crown sits off the trunk toward +x at rot 0) and stay smaller
        const near = row < 2 && !araucaria;
        const rot = near ? (side > 0 ? 0 : Math.PI) + (rnd() - 0.5) * 0.6 : rnd() * Math.PI * 2;
        const scale = near ? NEAR_SCALE[0] + (NEAR_SCALE[1] - NEAR_SCALE[0]) * rnd() : 0.95 + 0.3 * rnd();
        out.push({ name: araucaria ? 'araucaria' : 'broadleaf', position: [side * (x0 + rnd() * 1.6), z + rnd() * 2], variant: Math.floor(rnd() * 8), scale, rot });
      }
    });
    // a tree fern or a bush now and then between the first row and the clear half width
    for (let z = LANE.from; z > LANE.to; z -= 5 + 6 * rnd()) {
      const fern = rnd() < 0.4;
      out.push({ name: fern ? 'treeFern' : 'bush', position: [side * (CLEAR + (fern ? 2.6 : 1.4) + rnd() * 1.2), z], variant: Math.floor(rnd() * (fern ? 4 : 8)), scale: 0.9 + 0.3 * rnd() });
    }
  }
  return out;
}

/** The generator grows nothing in the lane (its own trees, ferns, bushes and critters keep out). */
export function keepOut(x) {
  return Math.abs(x) < CLEAR + 5 ? 1 : 0;
}

/**
 * The last word on the lane (layout.leaveOut, after the plan): a tree whose crown (the species model's crown sphere, placed as the
 * batcher places it) still reaches inside the lane rule's half width is left out, so no crown is ever cut by a side edge before D.
 */
export function crownInLane(p, half = D * tanH) {
  const cr = p?.model?.crown;
  if (!cr || !(p.name === 'broadleaf' || p.name === 'araucaria' || p.name === 'treeFern')) return false;
  const c = Math.cos(p.rot), s = Math.sin(p.rot), sc = p.scale;
  const cx = p.x + (cr.c[0] * c - cr.c[2] * s) * sc;
  return Math.abs(cx) - cr.r * sc < half;
}

export const LAYOUT = {
  seed: 41,
  clearing: { center: [0, -30], radius: 8 },
  forestEdge: 11,
  path: [[0, LANE.from], [0, -60], [0, LANE.to]], // a faint track down the lane's middle (the generator needs a path)
  leafShadows: false,
  // the far forest's misty rings (world/forest/far.js) well beyond where the camera flies: the lane's far end dissolves into them
  farRings: [
    { radius: 200, rows: 2, spacing: 5, height: [12, 17], crown: [6, 9.5], strip: [2.6, 4.4], color: ['#2f4d45', '#4f6f66'], haze: '#bccfca', topHaze: 0.45, araucaria: 0.1 },
    { radius: 235, rows: 1, spacing: 6, height: [12, 16], crown: [6, 9], strip: [2.6, 4.2], color: ['#4b6a5e', '#6d8b7d'], haze: '#d0dfd8', topHaze: 0.6, araucaria: 0.1 },
  ],
  keepOut,
  lifeKeepOut: keepOut,
  leaveOut: (info, p) => crownInLane(p),
  plants: lanePlants(),
};
