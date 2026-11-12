// Grameðla kemur!'s key frames (step 1 of the spec: one still from the height of each beat of the storyboard, section 4). Pure data:
// each frame says its time in the show and the state of every actor and particle group at that time, and the review page
// (chapters/gramedla3d.js, ?lykill=N) sets the stage from this table alone. Step 2 moves between them.
//
// Places are in the stage's fixed 16:10 frame: (u, v) from its top left (0..1), k the depth as a share of the screen plane's D
// (engine/stage3d.js). Out of the screen is the parallax in front of it as a share of the screen's width at STRENGTH:
// out = STRENGTH · (1/k − 1), so k = 1 / (1 + out / STRENGTH). Angles are radians unless a name says degrees.
//
// The rules every frame keeps (spec section 2): nothing further out than MAX_OUT; anything nearer than k EDGE_K inside the middle
// MIDDLE of the frame; nothing in front of the screen at an edge (the page measures the solid things, the table holds the particles'
// places, so their numbers are by hand: tests/gramedla3d-keys.test.mjs); pale or yellow-green in front.

export const STRENGTH = 0.02; // the owner's calibration, 2026-11-12: "4% 0,02"
export const MAX_OUT = 0.04;
export const EDGE_K = 0.6;
export const MIDDLE = [0.2, 0.8];
export const kOf = out => 1 / (1 + out / STRENGTH);
export const outOf = k => STRENGTH * (1 / k - 1);

// ---- particle groups: code-made specks at places in the frame (u, v, k ranges), drawn as the game's glints or as leaf flecks ----
// kind: motes (pale specks in the light), pollen (yellow), puffs (her breath: big soft pale glints), leaves (flat flecks in leaf
// colours). `stream` lays a group along a line from one (u, v, k) to another instead of in a box (the roar's blast).
export const GROUPS = {
  // behind the screen in every frame: the lane's light is full of them, all the way in
  motesFar: { kind: 'motes', count: 90, u: [0.04, 0.96], v: [0.04, 0.9], k: [1.05, 4.2], size: 0.07, seed: 'far motes' },
  // Kyrrð: some come out, 1 to 2 % (k 0.67 to 0.5), well inside the middle
  motesNear: { kind: 'motes', count: 26, u: [0.26, 0.74], v: [0.24, 0.72], k: [kOf(0.02), kOf(0.01)], size: 0.035, seed: 'near motes' },
  // Dynkur: leaves and pollen falling out of the shaken crowns, at many depths, all behind the screen but for none
  leavesFar: { kind: 'leaves', count: 80, u: [0.08, 0.92], v: [0.05, 0.7], k: [1.15, 4], size: 0.3, seed: 'far leaves' },
  pollenFar: { kind: 'pollen', count: 70, u: [0.1, 0.9], v: [0.05, 0.65], k: [1.1, 4], size: 0.14, seed: 'far pollen' },
  // Þefið: two or three pale puffs of her breath between her nostrils and us, never nearer than her snout (k 0.334)
  puffs: { kind: 'puffs', points: [[0.47, 0.6, 0.36], [0.53, 0.63, 0.4], [0.5, 0.66, 0.46]], size: 0.32, seed: 'puffs' },
  // Öskrið: leaves, pollen and motes streaming out of her open mouth at the lens, the nearest 3.5 % out, inside the middle
  blastMotes: { kind: 'motes', count: 46, stream: { from: [0.5, 0.62, 0.6], to: [0.5, 0.5, kOf(0.035)], spread: 0.15 }, size: 0.04, seed: 'blast motes' },
  blastPollen: { kind: 'pollen', count: 34, stream: { from: [0.5, 0.62, 0.6], to: [0.5, 0.48, kOf(0.033)], spread: 0.16 }, size: 0.05, seed: 'blast pollen' },
  blastLeaves: { kind: 'leaves', count: 24, stream: { from: [0.5, 0.64, 0.6], to: [0.5, 0.5, kOf(0.03)], spread: 0.17 }, size: 0.09, seed: 'blast leaves' },
};

// ---- the frames ----
// gram: Grameðla. Either solved to a snout place ({ k, u, v }: the snout tip there, she leans as far as that takes, as in step 0)
// or standing ({ stand: { depth, u } }: her root that far up the lane, not leaning). clip/at: the clip she is held in and the
// second of it ('widest': the roar's widest jaw). turn: extra head turn about the upright (+ to her left, our right), roll: head
// tilted about its length, pitch: head turned up (+) or down past looking at the lens. null: not on the stage.
// flugedla: Flugeðla with Egill in her saddle: her beak tip at (u, v, k), held in clip at second `at`, facing us; egill.point: his
// left arm points back over his shoulder (he leans out `lean` degrees to show beside her neck).
// butterfly: the pale hero butterfly at (u, v, k), or on: 'snout' (sitting on her snout tip).
// birds: the flock, each [u, v, k, yaw (degrees: 0 flies across to the right, 90 toward us), wings (0 up .. 1 down)].
// trees: { shake: m the crowns of the far lane's trees are thrown sideways, depth: [m, m] where }, or { away: m they bend away
// from the lane's middle, depth } (the blast).
export const KEYS = [
  {
    id: '1', n: 1, name: 'Kyrrð', time: 5,
    lead: 'butterfly', leadText: 'fiðrildið',
    gram: null,
    butterfly: { at: [0.56, 0.47, kOf(0.02)], yaw: 200 },
    particles: ['motesFar', 'motesNear'],
  },
  {
    id: '2', n: 2, name: 'Dynkur', time: 13,
    lead: 'birds', leadText: 'fuglarnir',
    gram: null,
    birds: [
      [0.4, 0.36, kOf(0.025), 30, 0.1], [0.5, 0.31, kOf(0.022), 70, 0.8], [0.6, 0.37, kOf(0.02), 140, 0.3],
      [0.64, 0.47, kOf(0.024), 200, 0.9], [0.55, 0.52, kOf(0.021), 250, 0.2], [0.44, 0.5, kOf(0.023), 300, 0.6],
      [0.35, 0.44, kOf(0.02), 350, 0.4],
    ],
    trees: { shake: 2.4, depth: [22, 50] },
    particles: ['motesFar', 'leavesFar', 'pollenFar'],
  },
  {
    id: '3', n: 3, name: 'Flugeðla', time: 21,
    lead: 'flugedla', leadText: 'goggurinn',
    gram: null,
    flugedla: { beak: [0.5, 0.5, kOf(0.015)], clip: 'fly', at: 0, pitch: 15, yaw: 10, egill: { point: true, lean: 24 } },
    particles: ['motesFar'],
  },
  {
    id: '4', n: 4, name: 'Hún kemur', time: 37,
    lead: 'gram', leadText: 'trýnið',
    gram: { k: 1, u: 0.5, v: 0.42, roll: 0.22, turn: 0, pitch: 0 },
    particles: ['motesFar'],
  },
  {
    id: '4a', n: 4, variant: 'a', name: 'Hún kemur', time: 30,
    lead: 'gram', leadText: 'hún',
    gram: { stand: { depth: 31, u: 0.5 }, clip: 'walk', at: 0.45 },
    particles: ['motesFar'],
  },
  {
    id: '5', n: 5, name: 'Þefið', time: 48,
    lead: 'gram', leadText: 'trýnið',
    gram: { k: kOf(0.04), u: 0.5, v: 0.56, turn: -0.25, pitch: 0 },
    particles: ['motesFar', 'puffs'],
  },
  {
    id: '6', n: 6, name: 'Öskrið', time: 55,
    lead: 'gram', leadText: 'hausinn',
    gram: { k: 0.53, u: 0.5, v: 0.44, clip: 'roar', at: 'widest', turn: -0.15, pitch: -0.1 },
    trees: { away: 1.8, depth: [14, 36] },
    particles: ['motesFar', 'blastMotes', 'blastPollen', 'blastLeaves'],
  },
  {
    id: '7', n: 7, name: 'Fiðrildið', time: 62,
    lead: 'gram', leadText: 'trýnið',
    gram: { k: kOf(0.03), u: 0.5, v: 0.62, turn: -0.25, pitch: -0.12 },
    butterfly: { on: 'snout' },
    particles: ['motesFar'],
  },
  {
    id: '7b', n: 7, variant: 'b', name: 'Fiðrildið', time: 64,
    lead: 'butterfly', leadText: 'fiðrildið',
    gram: { k: kOf(0.025), u: 0.5, v: 0.6, turn: -0.25, pitch: -0.05 },
    butterfly: { at: [0.5, 0.47, kOf(0.037)], yaw: 250 },
    particles: ['motesFar'],
  },
];

/** The frame for an address's lykill= (a number picks the first frame of that beat: 4 is '4', 4a its variant). */
export function keyIndex(id) {
  const s = String(id ?? '1').toLowerCase();
  const exact = KEYS.findIndex(k => k.id === s);
  if (exact >= 0) return exact;
  const n = KEYS.findIndex(k => k.n === Number.parseInt(s, 10));
  return n >= 0 ? n : 0;
}

// a group's points: [u, v, k] each, seeded, so a page and a test lay them out alike
export function groupPoints(spec) {
  if (spec.points) return spec.points.map(p => [...p]);
  let seed = 0;
  for (const ch of spec.seed) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  seed = seed || 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  for (let i = 0; i < spec.count; i++) {
    if (spec.stream) {
      // along the line, spread round it in the frame by up to `spread`, thinning as it nears the lens
      const { from, to, spread } = spec.stream;
      const t = random() ** 0.8;
      const a = random() * Math.PI * 2, r = spread * Math.sqrt(random()) * (0.4 + 0.6 * t);
      out.push([from[0] + (to[0] - from[0]) * t + Math.cos(a) * r, from[1] + (to[1] - from[1]) * t + Math.sin(a) * r * 0.7, from[2] + (to[2] - from[2]) * t]);
    } else {
      const u = spec.u[0] + (spec.u[1] - spec.u[0]) * random();
      const v = spec.v[0] + (spec.v[1] - spec.v[0]) * random();
      // depth: even in 1/k (so even in parallax), not in metres
      const ik = 1 / spec.k[0] + (1 / spec.k[1] - 1 / spec.k[0]) * random();
      out.push([u, v, 1 / ik]);
    }
  }
  return out;
}
