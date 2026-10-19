import { BOARD, DINOSAURS, tilePosition } from './rules.js';

// Where each Þórseðla of the board stands (rules.js DINOSAURS: six of them, five necks and five tails between them), at her
// natural proportions (no neck or tail drawn out by more than about a fifth, the owner's word of 2026-10-19). Each stands on a
// rock shelf behind a tier, at that tier's height, side-on to the camera like Codex's:
//  - her chest a little behind the first square of her neck (`lead` metres along the board), so her neck rises forward in an
//    S and her head comes to rest over the square above, and comes down to the first square in a bow;
//  - her rump just past the first square of her tail, so her tail hangs down from her hips behind the tier and the square.
// Four are the model's 22 m at 0.84 (18.5 m): their bodies fit under the tier above. Two routes reach two tiers, so those two
// are grown-up giants, uniformly bigger rather than stretched, and stand farther back where there is room:
//  - Burkni (25 up to 56): her chest just past the neck's squares, a deep giant whose neck rises nearly straight up and curls
//    forward to the square two tiers up; her tail hangs from her rump behind square 28, which her body leaves clear.
//  - Lyng (74 down to 42, the top tier): her neck carries no route, so she stands well back with her head held low and
//    forward, and her long tail hangs down past the tier below.
//
// `x` is her root (between her feet) along the board, `z` how far behind the blocks (the blocks' row is z 0), `facing` 1 to
// the right and -1 to the left, `size` her scale against the model's real 22 m. The names are Codex's ids; `name` is the
// game's.

const MODEL = { neck: 3.26, tail: -3.66, chest: 2.24, hips: -2.18, halfWidth: 1.9, legs: 1.57, foot: 0.4, back: 5.3 };
export { MODEL as THORSEDLA_MODEL };
export const BLOCK_BACK = 1.2; // z of the back face of a tier's blocks (board.js STONE.depth / 2)

const SPECS = {
  fern: { name: 'Burkni', tier: 1, size: 1.48, z: -7.2, chestAt: 1.15 },
  amber: { name: 'Gyllir', tier: 1, size: 0.84, lead: 1.45 },
  sage: { name: 'Salvía', tier: 3, size: 0.84, lead: 1.45 },
  coral: { name: 'Glóð', tier: 3, size: 0.84, lead: 1.45 },
  birch: { name: 'Kvisti', tier: 0, size: 0.84, lead: 1.5 },
  plum: { name: 'Lyng', tier: 4, size: 1.5, facing: -1, turn: -35, rump: [0.35, -3.9] },
};

/** How far behind the blocks a Þórseðla of size k stands at the least: her near side a hand behind them. */
const nearZ = k => -(BLOCK_BACK + 0.2 + MODEL.halfWidth * k);
const THREE_DEG = Math.PI / 180;

/** The six places: { id, name, tier, x, z, facing, size, neck, tail, color }. */
export const PLACES = DINOSAURS.map(d => {
  const s = SPECS[d.id];
  const facing = s.facing ?? d.facing;
  const k = s.size;
  const turn = s.turn ?? 6; // degrees toward the camera from side-on (less than 0: away from it)
  let x, z = s.z ?? nearZ(k);
  if (s.chestAt !== undefined) x = s.chestAt - facing * MODEL.neck * k; // her chest at a given x (Burkni)
  else if (d.neck) x = tilePosition(d.neck.from).x - facing * (MODEL.neck * k + s.lead); // her chest `lead` behind the neck's square
  else {
    // her rump at a given spot past the tail's square, her body turned away from the camera behind it (Lyng)
    const h = THREE_DEG * (facing > 0 ? turn : 180 - turn);
    const rx = tilePosition(d.tail.from).x - facing * s.rump[0], rz = s.rump[1];
    x = rx - Math.cos(h) * MODEL.tail * k;
    z = rz - Math.sin(h) * MODEL.tail * k;
  }
  return Object.freeze({ id: d.id, name: s.name, tier: s.tier, x, z, facing, turn, size: k, neck: d.neck, tail: d.tail, color: d.color });
});

/**
 * The rock shelf a place stands on: { tier, x0, x1, z0, z1 } (tier 0 stands on the grass). It lies under her feet only, from
 * a little behind her hind feet to a little past her front feet, so her tail hangs down past its end, and from behind her far
 * feet to a little before her near ones, so the necks rising to the tier above pass in front of it.
 */
export function shelfFor(place) {
  const k = place.size, f = place.facing;
  if (place.turn < 0) {
    // turned away: a slab turned with her, round her four feet ({ angle } about y round its middle)
    const h = THREE_DEG * (f > 0 ? place.turn : 180 - place.turn);
    const hind = MODEL.hips * k - MODEL.foot * k - 0.3, front = MODEL.chest * k + MODEL.foot * k + 0.6;
    const half = MODEL.legs * k + MODEL.foot * k + 0.15;
    const mid = (hind + front) / 2, cx = place.x + Math.cos(h) * mid, cz = place.z + Math.sin(h) * mid;
    const len = (front - hind) / 2;
    return { tier: place.tier, x0: cx - len, x1: cx + len, z0: cz - half, z1: cz + half, angle: -h };
  }
  const hind = place.x + f * MODEL.hips * k, front = place.x + f * MODEL.chest * k;
  const ends = [hind - f * (MODEL.foot * k + 0.1), front + f * (MODEL.foot * k + 0.12)];
  const near = Math.min(-BLOCK_BACK - 0.05, place.z + MODEL.legs * k + MODEL.foot * k + 0.35);
  return { tier: place.tier, x0: Math.min(...ends), x1: Math.max(...ends), z0: place.z - MODEL.legs * k - MODEL.foot * k - 0.8, z1: near };
}

export const TIER_HEIGHT = BOARD.rowHeight;
