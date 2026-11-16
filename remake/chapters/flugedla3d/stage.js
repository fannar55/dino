// Flugeðla og fiðrildið's stage (chapters/flugedla3d.js): the lens, the screen plane, the frame rule as a swept space, and the world
// it is laid out in: the wood's mouth with the five slalom trunks and the gate, the lane behind the camera with its S-bend (the
// camera's own path: route.js), the forest round both, and the clouds above (clouds.js draws them from CLOUDS here).
//
// The frame rule (the plan, rule 4): nothing in front of the screen touches an edge of the picture. With the camera moving, nothing
// may grow or float where the picture's near part (nearer than NEAR) passes at any second of the flight (sweptHit, over the film's
// camera at SWEEP_STEP), the bend included. Taken from the trial (samflug3d): the lane rule (CLEAR) and the crown filter, now made
// the swept test itself.
import { filmRoute, MOUTH, LANE_H, CLOUD } from './route.js';

export const FOV = 46; // vertical, degrees, of the stage's fixed 16:10 frame
export const ASPECT = 16 / 10;
export const D = 13; // m: the screen plane
export const NEAR = 13.5; // m: the near part of the picture the rule keeps clear (D and half a metre)
const rad = d => (d * Math.PI) / 180;
export const tanV = Math.tan(rad(FOV) / 2);
export const tanH = tanV * ASPECT;
// on a 4:3 screen the engine keeps the 16:10 width (director.effectiveFov), so the picture is taller: its half-height is tanH / (4/3)
export const tanV43 = tanH / (4 / 3);
export const CLEAR = D * tanH + 1; // the trial's lane rule: 9.8 m clear to each side of the lane's middle
export const SWEEP_STEP = 0.1; // s between the camera's places the swept test looks from

export const ROUTE = filmRoute();
const poses = [];
for (let t = 0; t <= ROUTE.length + 1e-9; t += SWEEP_STEP) {
  const p = ROUTE.at(t);
  const psi = rad(p.yaw);
  poses.push({ t, x: p.x, y: p.y, z: p.z, s: Math.sin(psi), c: Math.cos(psi) });
}
export const POSES = poses;

/**
 * Is a ball (centre [x, y, z], heights over the lane's ground; radius r) ever inside the picture's near part, from any of the
 * camera's places? The picture is the stage's 16:10 frame, widened by `margin` m. Returns the first second it is, or null.
 */
export function sweptHit(p, r = 0, { near = NEAR, margin = 0.3, list = POSES } = {}) {
  for (const q of list) {
    const dx = p[0] - q.x, dz = p[2] - q.z;
    const depth = dx * q.s - dz * q.c; // along the look (sin ψ, −cos ψ)
    if (depth + r <= 0 || depth - r >= near) continue;
    const lateral = dx * q.c + dz * q.s; // to the camera's right (cos ψ, sin ψ)
    const up = p[1] - q.y;
    const d = Math.max(depth, 0);
    if (Math.abs(lateral) - r - margin < tanH * d && Math.abs(up) - r - margin < tanV * d) return q.t;
  }
  return null;
}

// ---- the wood's mouth: the camera stands at MOUTH looking in (−Z); the trunks are [across (+ our right), depth] from it ----
// Five slalom trunks, alternating sides of the middle, and the gate: two slim tall trees 11 m apart, just behind the screen plane.
export const SLALOM = [[2.6, 60], [-2.6, 48], [3, 37], [-3, 27], [3.2, 19]];
export const GATE = [[-5.5, 14.5], [5.5, 14.5]];
export const SLIM = { name: 'araucaria', scale: 1.25 }; // the slalom and gate trees: tall, a slim trunk, the crown high up
const worldOf = ([across, depth]) => [MOUTH.x + across, MOUTH.z - depth];
export const SLALOM_AT = SLALOM.map(worldOf);
export const GATE_AT = GATE.map(worldOf);

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// the lane's middle: the camera's path over the ground (under the climb and the dive too), every metre or so
export const LANE_PATH = (() => {
  const out = [];
  let last = null;
  for (const q of POSES) {
    if (last && Math.hypot(q.x - last.x, q.z - last.z) < 1) continue;
    out.push(last = { x: q.x, z: q.z, s: q.s, c: q.c });
  }
  return out;
})();
const laneDistance = (x, z) => {
  let best = Infinity;
  for (const q of LANE_PATH) best = Math.min(best, Math.hypot(x - q.x, z - q.z));
  return best;
};
// the slalom's corridor: open but for its own trunks (she flies down it)
const inCorridor = (x, z) => Math.abs(x - MOUTH.x) < 9 && z < MOUTH.z - 10 && z > MOUTH.z - 72;

/** The plants the layout places (layout.plants): the slalom and the gate, the wood beyond the mouth, the lane's walls. */
export function plants() {
  seed = 7;
  const out = [];
  for (const [x, z] of [...SLALOM_AT, ...GATE_AT]) out.push({ name: SLIM.name, position: [x, z], variant: 2, scale: SLIM.scale, rot: 0, slim: true });
  // the wood: a jittered grid in front of the mouth and round it, but not in the corridor nor on the lane
  for (let x = -70; x <= 70; x += 7.5) {
    for (let z = MOUTH.z + 30; z >= -190; z -= 7.5) {
      const px = x + (rnd() - 0.5) * 4, pz = z + (rnd() - 0.5) * 4;
      if (inCorridor(px, pz) || laneDistance(px, pz) < CLEAR + 4) { rnd(); rnd(); continue; }
      const araucaria = rnd() < 0.3;
      out.push({ name: araucaria ? 'araucaria' : 'broadleaf', position: [px, pz], variant: Math.floor(rnd() * 8), scale: 0.95 + 0.3 * rnd() });
    }
  }
  // a fern or a bush here and there in the wood's floor near the corridor (behind the screen: the swept test keeps it so)
  for (let i = 0; i < 26; i++) {
    const px = MOUTH.x + (rnd() - 0.5) * 30, pz = MOUTH.z - 16 - rnd() * 60;
    const fern = rnd() < 0.5;
    if (SLALOM_AT.some(([sx, sz]) => Math.hypot(px - sx, pz - sz) < 2.5)) continue;
    out.push({ name: fern ? 'treeFern' : 'bush', position: [px, pz], variant: Math.floor(rnd() * (fern ? 4 : 8)), scale: 0.8 + 0.3 * rnd() });
  }
  // the lane's walls: rows of trees each side of its middle, the near rows' broadleaf crowns leaning out of the lane
  const ROWS = [15.5, 19, 23, 28];
  let along = 0, last = null;
  for (const q of LANE_PATH) {
    if (last) along += Math.hypot(q.x - last.x, q.z - last.z);
    last = q;
    if (q.z < MOUTH.z + 4) continue; // the mouth: the wood itself is there
    for (const [row, off] of ROWS.entries()) {
      const step = row === 0 ? 7.5 : 6.5;
      if (Math.floor(along / step) === Math.floor((along - 1.01) / step)) continue;
      for (const side of [-1, 1]) {
        const o = off + rnd() * 1.6;
        const px = q.x + side * q.c * o, pz = q.z + side * q.s * o;
        if (laneDistance(px, pz) < CLEAR + 3) continue;
        const araucaria = rnd() < 0.25 + 0.1 * row;
        const near = row < 2 && !araucaria;
        const rot = near ? Math.atan2(side * q.s, side * q.c) + (rnd() - 0.5) * 0.6 : rnd() * Math.PI * 2;
        const scale = near ? 0.95 + 0.13 * rnd() : 0.95 + 0.3 * rnd();
        out.push({ name: araucaria ? 'araucaria' : 'broadleaf', position: [px, pz], variant: Math.floor(rnd() * 8), scale, rot });
      }
    }
  }
  return out;
}

/** The generator grows nothing on the lane, in the corridor or round the camera's start. */
export function keepOut(x, z) {
  return inCorridor(x, z) || laneDistance(x, z) < CLEAR + 5 ? 1 : 0;
}

const isSlim = p => [...SLALOM_AT, ...GATE_AT].some(([x, z]) => Math.abs(p.x - x) < 0.01 && Math.abs(p.z - z) < 0.01);
/**
 * The last word (layout.leaveOut, after the plan): a plant any part of which (its trunk's line and its crown's ball, from the
 * species model as the batcher places it) is ever in the picture's near part is left out. The slalom and gate trees stand where the
 * plan puts them (the swept test is the probe's to confirm for them).
 */
export function leaveOut(info, p) {
  if (!p?.model || isSlim(p)) return false;
  const m = p.model, sc = p.scale ?? 1, c = Math.cos(p.rot ?? 0), s = Math.sin(p.rot ?? 0);
  const ground = 0; // heights over the lane's ground: the camera's are (route.js)
  const cr = m.crown;
  if (cr) {
    const cx = p.x + (cr.c[0] * c - cr.c[2] * s) * sc, cz = p.z + (cr.c[0] * s + cr.c[2] * c) * sc;
    if (sweptHit([cx, ground + cr.c[1] * sc, cz], Math.max(cr.r, cr.ry ?? cr.r) * sc) !== null) return true;
  }
  const top = (m.trunk?.top ?? m.height ?? 2) * sc;
  for (let h = 0.5; h < top; h += 2) if (sweptHit([p.x, ground + h, p.z], (m.trunk?.r ?? 0.4) * sc + 0.3) !== null) return true;
  return false;
}

export const LAYOUT = {
  seed: 53,
  // the generator's clearing (it needs one) off in the wood east of the lane, where the camera never looks: no lit patch on the lane
  clearing: { center: [45, 10], radius: 4 },
  forestEdge: 8,
  path: [[MOUTH.x, MOUTH.z], [0, 0], [-19.3, 40], [-19.3, 100]],
  leafShadows: false,
  // the far forest's misty rings well beyond the flight
  farRings: [
    { radius: 215, rows: 2, spacing: 5, height: [12, 17], crown: [6, 9.5], strip: [2.6, 4.4], color: ['#2f4d45', '#4f6f66'], haze: '#bccfca', topHaze: 0.45, araucaria: 0.1 },
    { radius: 245, rows: 1, spacing: 6, height: [12, 16], crown: [6, 9], strip: [2.6, 4.2], color: ['#4b6a5e', '#6d8b7d'], haze: '#d0dfd8', topHaze: 0.6, araucaria: 0.1 },
  ],
  keepOut,
  lifeKeepOut: keepOut,
  leaveOut,
  plants: plants(),
};

// ---- the clouds (clouds.js draws them): soft balls, heights over the lane's ground ----
// The sea: a layer from CLOUD.base to CLOUD.top over the whole flight, its balls bulging above the top here and there; towers: stacks
// of balls standing out of it at many depths ahead of the camera's places up there. Every ball is kept out of the swept near part
// (the climb's and the dive's shafts are clear: the white hides them).
export function cloudBalls() {
  seed = 91;
  const balls = [];
  for (let x = -260; x <= 220; x += 15) {
    for (let z = -260; z <= 240; z += 15) {
      const r = 8 + rnd() * 6;
      const px = x + (rnd() - 0.5) * 9, pz = z + (rnd() - 0.5) * 9;
      const y = CLOUD.base + r * 0.75 + rnd() * (CLOUD.top - CLOUD.base - r * 0.9);
      balls.push([px, y, pz, r, 0]);
      if (rnd() < 0.35) balls.push([px + (rnd() - 0.5) * 8, CLOUD.base - r * 0.15, pz + (rnd() - 0.5) * 8, r * 0.7, 0]); // ragged base
    }
  }
  // the towers, round where the camera is above the clouds (x −19, z 50 to 80) and further off, at many depths
  const centre = [-19, 60];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, dist = 30 + rnd() * 190;
    const tx = centre[0] + Math.cos(a) * dist, tz = centre[1] + Math.sin(a) * dist - 40;
    const height = 14 + rnd() * 46, r0 = 9 + rnd() * 7;
    for (let y = CLOUD.top; y < CLOUD.top + height; y += r0 * 0.7) {
      const shrink = 1 - 0.45 * (y - CLOUD.top) / height;
      balls.push([tx + (rnd() - 0.5) * r0 * 0.6, y, tz + (rnd() - 0.5) * r0 * 0.6, r0 * shrink, 1]);
    }
  }
  // wisps hanging under the base, ahead of the climb: they come down through the picture as the camera rises
  for (let i = 0; i < 40; i++) {
    const tx = centre[0] + (rnd() - 0.5) * 120, tz = -10 - rnd() * 140;
    balls.push([tx, CLOUD.base - 4 - rnd() * 14, tz, 3 + rnd() * 4, 2]);
  }
  return balls.filter(([x, y, z, r]) => sweptHit([x, y, z], r) === null);
}

export { MOUTH, LANE_H, CLOUD };
