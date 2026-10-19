import { BOARD, DINOSAURS, tilePosition } from './rules.js';

// Where each Þórseðla of the board stands (rules.js DINOSAURS: six of them, five necks and five tails between them). Each
// stands on a rock shelf behind a tier, at that tier's height, side-on to the camera like Codex's: her chest by the first
// square of her neck, her rump by the first square of her tail. `x` is her root (between her feet) along the board, `z` how
// far behind the blocks (the blocks' row is z 0), `facing` 1 to the right and -1 to the left, `size` her scale against the
// model's real 22 m. Lyng, the tail of the top tier, stands farther back, so the heads of sage and coral can come up to their
// squares in front of her.
//
// The names are Codex's ids; `name` is what the game calls her.

const MODEL = { neck: 3.26, tail: -3.66, chest: 2.24, hips: -2.18, halfWidth: 1.9 };
export { MODEL as THORSEDLA_MODEL };

const SPECS = {
  fern: { name: 'Burkni', tier: 1, size: 0.75, z: -4.2, lead: 0.8 },
  amber: { name: 'Gyllir', tier: 1, size: 0.75, z: -4.2, lead: 0.8 },
  sage: { name: 'Salvía', tier: 3, size: 0.75, z: -4.2, lead: 0.8 },
  coral: { name: 'Glóð', tier: 3, size: 0.75, z: -4.2, lead: 0.8 },
  birch: { name: 'Kvisti', tier: 0, size: 0.72, z: -4.4, lead: 0.8 },
  plum: { name: 'Lyng', tier: 4, size: 0.85, z: -7.6, facing: -1, rumpAt: 0.15 },
};

/** The six places: { id, name, tier, x, z, facing, size, neck, tail } (neck and tail as in rules.js, or null). */
export const PLACES = DINOSAURS.map(d => {
  const s = SPECS[d.id];
  const facing = s.facing ?? d.facing;
  let x;
  if (d.neck) {
    // her neck's base a little behind the neck's first square, so her head comes down onto it in front of her chest
    x = tilePosition(d.neck.from).x - facing * (MODEL.neck * s.size + s.lead);
  } else {
    // her rump over the tail's first square (rumpAt: how far past it, along her)
    x = tilePosition(d.tail.from).x + facing * (-MODEL.tail * s.size + (s.rumpAt ?? 0));
  }
  return Object.freeze({ id: d.id, name: s.name, tier: s.tier, x, z: s.z, facing, size: s.size, neck: d.neck, tail: d.tail, color: d.color });
});

/** The rock shelf a place stands on: { tier, x0, x1, z0, z1 } (tier 0 stands on the grass). */
export function shelfFor(place) {
  const k = place.size;
  const back = place.x - place.facing * (-MODEL.tail * k + 0.9);
  const front = place.x + place.facing * (MODEL.neck * k + 0.7);
  const halfWidth = MODEL.halfWidth * k + 0.9;
  // the shelf reaches forward to the tier's log, unless it stands well back (Lyng): then it is a rock of its own
  const near = place.z > -6 ? -0.9 : place.z + halfWidth;
  return { tier: place.tier, x0: Math.min(back, front), x1: Math.max(back, front), z0: place.z - halfWidth, z1: near };
}

export const TIER_HEIGHT = BOARD.rowHeight;
