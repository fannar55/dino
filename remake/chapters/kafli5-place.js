// Chapter 5's pool as a place a chapter builds (engine/locations.js `build`): Árdalurinn round the far pool, in its real look, with
// the choir's frogs and turtles, its shots' lines of sight kept clear of plants and its spots where nothing grows. Chapter 5 builds
// it as it is (kafli5.js `tjorn`); chapter 6 begins there, the pool exactly as chapter 5 leaves it, and builds the ford above the
// falls with it (kafli6-route.js FORD): more spots (createArdalur's `at`: the sections within SIGHT of any of them), more views and
// more kept ground, after chapter 5's.
//
//   locations: { tjorn: { build: world => buildPool(world), shots } }
import { createRoute, FAR_POOL } from './kafli4-route.js';
import { CHOIR, GROUPS, STEPS, SPOTS, WADE, SHOTS, POOL_LIFE, seatsOf } from './kafli5-pool.js';
import { createArdalur } from '../world/ardalur/index.js';
import { loadCritters } from '../world/ardalur/animals.js';

export const ROUTE = createRoute({ wingspan: 7.5 }); // chapter 4's valley, the very same land (kafli4.js ROUTE)
const LEVEL = FAR_POOL.level;
/** How high over its ground each group's tap point is (its middle as the child sees it), m. */
export const TAP_HEIGHT = { grazers: 1.6, turtles: 0.5, frogs: 0.35, lizards: 0.5, flyers: 0.8 };

/** The still shots' lines of sight, kept clear of plants (createArdalur's `views`), and the choir's places, where nothing grows. */
export function viewsOf(world) {
  const V3 = world.THREE.Vector3;
  const point = ([x, z], up = 1.5) => new V3(x, Math.max(world.heightAt(x, z), LEVEL) + up, z);
  const looks = {
    pool_open: [point(FAR_POOL.bank, 1), point(FAR_POOL.mosi, 3), point(FAR_POOL.landing, 2)],
    reed_close: [point(STEPS[0].at, 2.4), ...STEPS.map(step => point(step.at, 2.5))],
    bank_talk: [point(SPOTS.egill, 1), point(SPOTS.mosi, 3)],
    choir_wide: [...GROUPS.map(group => point(CHOIR[group].at, TAP_HEIGHT[group])), point(SPOTS.reed, 2.6)],
    sloedla_out: [point(WADE.at, 2.6)],
    west_listen: [point(SPOTS.egill, 1), point(SPOTS.mosi, 3)],
  };
  return Object.entries(SHOTS).map(([shot, { position }]) => ({ shot, position: new V3(...position), looks: looks[shot] ?? [] }));
}
export const KEEP = [
  ...GROUPS.filter(group => group !== 'frogs').flatMap(group => seatsOf(group).map(({ at: [x, z] }) => ({ x, z, r: group === 'grazers' ? 4.2 : 1.6 }))),
  { x: SPOTS.egill[0], z: SPOTS.egill[1], r: 2 },
  { x: SPOTS.mosi[0], z: SPOTS.mosi[1], r: 3 },
];

/**
 * What createArdalur builds the pool with (but the critters, which buildPool loads): `at` more spots ([x, z]), `views` more lines of
 * sight ({ shot, position, looks }, points as Vector3s or [x, y, z]) and `keep` more ground where nothing grows ({ x, z, r }).
 */
export function poolOptions(world, { at = [], views = [], keep = [] } = {}) {
  const V3 = world.THREE.Vector3;
  const vector = p => (p.isVector3 ? p : new V3(...p));
  return {
    grey: false, route: ROUTE, at: [FAR_POOL.center, ...at],
    views: [...viewsOf(world), ...views.map(v => ({ ...v, position: vector(v.position), looks: v.looks.map(vector) }))],
    keep: [...KEEP, ...keep], choir: POOL_LIFE,
  };
}

/** The pool exactly as chapter 5 builds it, with `at`, `views` and `keep` more (poolOptions). */
export async function buildPool(world, more = {}) {
  return createArdalur(world, { ...poolOptions(world, more), critters: await loadCritters(world) });
}
