import { BOARD, DINOSAURS, tilePosition } from './rules.js';

// Where each Þórseðla of the board stands (rules.js DINOSAURS: six of them, five necks and five tails between them), at her
// natural proportions (no neck or tail drawn out by more than about a quarter, the owner's word of 2026-10-19).
//
// Four stand on rock shelves behind the two front tiers (the second and the fourth: rules.js BOARD.recess), at the tier's
// height, side-on to the camera like Codex's:
//  - a little lower than the tier (`drop`), so her back stays under the numbers of the tier above;
//  - her chest a little behind the first square of her neck (`lead` metres along the board), so her neck rises in front of
//    the tier above (which stands further back), her head comes to rest over its square, and comes down to the first square
//    in a bow;
//  - her rump just past the first square of her tail, so her tail hangs down from her hips behind her tier onto the tier
//    below (further back too), its tip on the last square.
// The two long routes, two tiers each, belong to the two big elder giants, uniformly bigger rather than stretched, who stand
// at the board's ends where they hide no square:
//  - Burkni (19 up to 59), on the grass beside the right end, facing the camera: her neck rises beside the end, past the
//    stairs, and curls over the end square onto the square two tiers up.
//  - Lyng (82 down to 41), on a shelf behind the top tier at its left end, `drop` metres under its blocks so her back does
//    not tower over the board, turned a little away from the camera: her long tail hangs down beside the board's left end,
//    past the stairs, onto the square two tiers down.
//
// `x` is her root (between her feet) along the board, `z` how far toward the camera (a front tier's blocks are at z 0),
// `facing` 1 to the right and -1 to the left, `turn` degrees toward the camera from side-on (less than 0: away from it),
// `size` her scale against the model's own. The names are Codex's ids; `name` is the game's.

const MODEL = { neck: 3.26, tail: -3.66, chest: 2.24, hips: -2.18, halfWidth: 1.9, legs: 1.57, foot: 0.4, back: 5.3 };
export { MODEL as THORSEDLA_MODEL };
export const BLOCK_BACK = 1.2; // the back face of a tier's blocks behind their middle (board.js STONE.depth / 2)

const SPECS = {
  // the elder giant at the right end, beside the stairs, her chest 3 m in front of the back tiers
  fern: { name: 'Burkni', tier: 0, size: 1.85, at: [27.7, -11.2], turn: 88, maxStretch: 1.5 },
  amber: { name: 'Gyllir', tier: 1, size: 1.15, lead: 0.3, drop: 0.35 },
  coral: { name: 'Glóð', tier: 1, size: 1.15, lead: 0.3, drop: 0.35 },
  sage: { name: 'Salvía', tier: 3, size: 1.15, lead: 0.3, drop: 0.35 },
  birch: { name: 'Kvisti', tier: 3, size: 1.15, lead: 0.3, drop: 0.35 },
  // the elder giant on the top tier, her rump behind square 81, at the board's left end
  plum: { name: 'Lyng', tier: 4, size: 1.6, turn: -25, rump: [1.45, -10.4], drop: 3.0, maxStretch: 1.5 },
};

/** How far behind a front tier's blocks a Þórseðla of size k stands at the least: her near side a hand behind them. */
const nearZ = k => -(BLOCK_BACK + 0.2 + MODEL.halfWidth * k);
const DEG = Math.PI / 180;
/** The way she faces, in x and z, from her facing and turn (three's heading: 0 along +x, 90 toward the camera). */
export const headingOf = place => DEG * (place.facing > 0 ? place.turn : 180 - place.turn);

/** The six places: { id, name, tier, x, z, facing, turn, size, maxStretch, neck, tail, color }. */
export const PLACES = DINOSAURS.map(d => {
  const s = SPECS[d.id];
  const facing = s.facing ?? d.facing;
  const k = s.size;
  const turn = s.turn ?? 6;
  const h = DEG * (facing > 0 ? turn : 180 - turn);
  let x, z;
  if (s.at) [x, z] = s.at; // a giant at a spot of her own (Burkni)
  else if (s.rump) {
    // her rump at a spot past the tail's first square, her body turned with her (Lyng)
    const rx = tilePosition(d.tail.from).x - facing * s.rump[0], rz = s.rump[1];
    x = rx - Math.cos(h) * MODEL.tail * k;
    z = rz - Math.sin(h) * MODEL.tail * k;
  } else {
    x = tilePosition(d.neck.from).x - facing * (MODEL.neck * k + s.lead); // her chest `lead` behind the neck's square
    z = nearZ(k);
  }
  return Object.freeze({ id: d.id, name: s.name, tier: s.tier, drop: s.drop ?? 0, x, z, facing, turn, size: k, maxStretch: s.maxStretch, neck: d.neck, tail: d.tail, color: d.color });
});

/**
 * The rock shelf a place stands on: { tier, x0, x1, z0, z1, angle } (on tier 0 she stands on the grass). It lies under her feet
 * only, from a little behind her hind feet to a little past her front feet, so her tail hangs down past its end, and from behind
 * her far feet to just behind the blocks. A turned place's slab turns with her (`angle` about y round its middle).
 */
export function shelfFor(place) {
  const k = place.size, f = place.facing;
  if (Math.abs(place.turn) > 15) {
    const h = headingOf(place);
    const hind = MODEL.hips * k - MODEL.foot * k - 0.3, front = MODEL.chest * k + MODEL.foot * k + 0.6;
    const half = MODEL.legs * k + MODEL.foot * k + 0.15;
    const mid = (hind + front) / 2, cx = place.x + Math.cos(h) * mid, cz = place.z + Math.sin(h) * mid;
    const len = (front - hind) / 2;
    return { tier: place.tier, drop: place.drop, x0: cx - len, x1: cx + len, z0: cz - half, z1: cz + half, angle: -h };
  }
  const hind = place.x + f * MODEL.hips * k, front = place.x + f * MODEL.chest * k;
  const ends = [hind - f * (MODEL.foot * k + 0.1), front + f * (MODEL.foot * k + 0.12)];
  const near = Math.min(-BLOCK_BACK - 0.05, place.z + MODEL.legs * k + MODEL.foot * k + 0.35);
  return { tier: place.tier, drop: place.drop, x0: Math.min(...ends), x1: Math.max(...ends), z0: place.z - MODEL.legs * k - MODEL.foot * k - 0.8, z1: near };
}

export const TIER_HEIGHT = BOARD.rowHeight;
