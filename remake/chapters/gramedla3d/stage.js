// Grameðla kemur!'s stage (chapters/gramedla3d.js): where the still camera stands, the screen plane, the lane it looks up and the
// forest round it (the spec: docs/superpowers/specs/2026-11-12-gramedla-kemur-3d-design.md, section 3). Measured in step 0.
//
// A child's eye 1.7 m up, still, tilted up as little as keeps the ground at the bottom edge at GROUND_SHARE of D or further
// (engine/stage3d.js solves it); places are solved in its fixed 16:10 frame.

export const CAMERA = [0, 1.7, 8];
export const LOOK = -90; // degrees: the camera looks along -Z, up the lane
export const FOV = 46;
export const D = 6.5; // m: the screen plane
export const GROUND_SHARE = 0.85;
export const GRASS = 0.35; // m over the terrain that the measurements count as the floor (its grass)

// The lane: straight up -Z from the camera, LANE.half m each side of its middle kept clear of every plant the forest would grow
// there (layout.keepOut), and nearer than NEAR m the whole of the widest screen's view as well (1170x540: 42.6 degrees each side of
// the axis, and a metre more), so nothing growing comes in front of the screen at an edge. The footpath runs up its middle.
export const LANE = { half: 3.4, to: -48 };
const NEAR = 14;
const WIDEST = Math.tan((42.6 * Math.PI) / 180);
export function keepOut(x, z) {
  const depth = CAMERA[2] - z;
  if (depth > -2 && depth < NEAR && Math.abs(x - CAMERA[0]) < depth * WIDEST + 1) return 1;
  if (z < CAMERA[2] && z > LANE.to && Math.abs(x - CAMERA[0]) < LANE.half) return 1;
  return 0;
}
// the plants that grow near the lane, kept for the checks that nothing stands in one (layout.leaveOut sees each; it takes none)
export const nearLane = [];
export const nearInfo = []; // and what the forest says of each (name, x, y, z, height, ...)
export function leaveOut(info, placement) {
  if (Math.abs(info.x - CAMERA[0]) < LANE.half + 9 && info.z < CAMERA[2] && info.z > LANE.to - 6) { nearLane.push(placement); nearInfo.push(info); }
  return false;
}

// The morning mist (world/props/mist.js cards, additive and light): it fills the lane from some 16 m in to its far end, thicker
// further in. Step 0 had one patch 40 m in, where the cards fade (MIST_FADE.far 40-55 m), so it hardly showed; these stand nearer.
export const MIST = [
  { center: [0, -10], radius: 6, height: 3.2, level: 1 },
  { center: [0, -20], radius: 8, height: 4.5, level: 1.4 },
  { center: [0, -30], radius: 9, height: 5.5, level: 1.6 },
];

export const LAYOUT = {
  seed: 37,
  clearing: { center: [0, 2], radius: 8 },
  forestEdge: 11,
  path: [[0, 16], [0, 4], [0, -12], [0, -30], [0, -56]],
  glade: { shafts: 4 },
  leafShadows: true,
  keepOut,
  lifeKeepOut: keepOut, // the forest's critters too (world/forest/life.js)
  leaveOut,
  mist: MIST,
};
