// What grows on the banks of Árdalurinn (chapter 4's flight), scattered over a section's own cells by what the ground is there (the
// Fen, the water's edge, the valley sides, the gorge's rim, the land above the falls). Nothing grows on the walls, nothing near
// enough the route to be flown into, and nothing on Mosi's two cameo paths.
//
//   bankSteps   the grey stand-ins: cones at the real heights of the species they stand in for, boxes for the rocks. Two draw calls.
//   plantSteps  the real plants: the forest's own species (world/forest/species.js), baked into a few merged meshes a section
//               (world/forest/batch.js) that are culled as the camera moves; lilies on the lazy reach and the far pool. A plant
//               never comes within 3 m of her path (CLEAR_OF_HER), at any steer, its crown counted.
import * as THREE from 'three';
import { GRID } from './terrain.js';
import { FOREST, FEN } from '../forest/config.js';
import { createBatcher } from '../forest/batch.js';
import { RAPIDS } from './river.js';
import { aboveTheFalls, ABOVE_SECTOR } from './sight.js';

// The stand-ins: [species, height range in metres, radius as a share of the height].
const PLANTS = {
  reed: ['horsetailReed', [1.4, 2.0], 0.12],
  horsetail: ['horsetailTall', [2.2, 3.2], 0.12],
  cycad: ['cycad', [1.8, 2.8], 0.4],
  bush: ['bush', [1.2, 2.0], 0.6],
  treeFern: ['treeFern', [4, 6], 0.35],
  broadleaf: ['broadleaf', [10, 14], 0.32],
  araucaria: ['araucaria', [14, 19], 0.18],
  swampConifer: ['swampConifer', [11, 15], 0.2],
};
// What grows where: [plant, chance per 10 m by 10 m].
const ZONES = {
  fen: [['reed', 1.2], ['horsetail', 0.4], ['swampConifer', 0.05], ['bush', 0.15]],
  edge: [['reed', 1.6], ['horsetail', 0.6], ['rock', 0.25]],
  valley: [['broadleaf', 0.14], ['araucaria', 0.08], ['treeFern', 0.22], ['cycad', 0.25], ['bush', 0.4], ['rock', 0.12]],
  rim: [['bush', 0.5], ['cycad', 0.2], ['araucaria', 0.05], ['rock', 0.3]],
};
const CLEAR = 12; // metres about the route seen from above inside which nothing may stand taller than her path less 3 m

/** A seeded random number generator (mulberry32). */
export function seeded(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The steps that plant one section's ground (a generator for the build queue): returns a group with the cones and the boxes. */
export function* bankSteps({ terrain, index, route, ground, seed, materials }) {
  const { own, grid: { gx0, gz0, W } } = ground;
  const rng = seeded(seed);
  const cones = [];
  const boxes = [];
  const cameoPaths = [route.cameos.bank.path, route.cameos.rim.path];
  const nearCameo = (x, z) => cameoPaths.some(path => path.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7));
  const near = {};
  const CELL = 10; // metres: one roll of the dice per 10 m square, at its own spot in it
  const per = Math.round(CELL / GRID);
  const cellsAcross = W - 1;
  const rows = own.length / cellsAcross;
  for (let j = 0; j < rows; j += per) {
    for (let i = 0; i < cellsAcross; i += per) {
      if (!own[j * cellsAcross + i]) continue;
      const x = (gx0 + i) * GRID + rng() * CELL;
      const z = (gz0 + j) * GRID + rng() * CELL;
      const w = terrain.where(x, z);
      let zone = null;
      if (w.e < 0.5) continue; // the water
      if (w.fen > 0.6) zone = 'fen';
      else if (w.e < 6 && w.gorge < 0.5) zone = 'edge';
      else if (w.gorge > 0.5 && w.e < 9) continue; // the walls
      else if (w.gorge > 0.5 && w.e < 32) zone = 'rim';
      else zone = 'valley';
      if (w.toPool < route.pool.radius + 2) continue;
      if (nearCameo(x, z)) continue;
      for (const [kind, chance] of ZONES[zone]) {
        if (rng() > chance) continue;
        const px = x + (rng() - 0.5) * 4;
        const pz = z + (rng() - 0.5) * 4;
        const y = terrain.heightAt(px, pz);
        if (kind === 'rock') {
          const size = 0.6 + rng() * 1.6;
          boxes.push([px, y + size * 0.3, pz, size * (1 + rng()), size, size * (0.8 + rng() * 0.6), rng() * Math.PI]);
          continue;
        }
        const [, [lo, hi], share] = PLANTS[kind];
        const height = lo + rng() * (hi - lo);
        const k = index.nearest(px, pz, CLEAR, near);
        if (k >= 0 && y + height > index.points[k].y - 3) continue; // she could fly into it
        cones.push([px, y, pz, height * share, height]);
      }
    }
    yield 'banks';
  }
  const group = new THREE.Group();
  group.name = 'Árdalur banks';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  if (cones.length) {
    const geometry = new THREE.ConeGeometry(1, 1, 7, 1, true);
    geometry.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, materials.plant, cones.length);
    cones.forEach(([x, y, z, r, h], i) => mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q.identity(), s.set(r, h, r))));
    mesh.name = 'Árdalur plants (grey)';
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  if (boxes.length) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, materials.rock, boxes.length);
    const up = new THREE.Vector3(0, 1, 0);
    boxes.forEach(([x, y, z, sx, sy, sz, turn], i) => mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q.setFromAxisAngle(up, turn), s.set(sx, sy, sz))));
    mesh.name = 'Árdalur rocks (grey)';
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return { group, plants: cones.length, rocks: boxes.length };
}

// ---------------------------------------------------------------------------------------------
// The real plants

// What grows where: [species, how many per 10 m by 10 m square]. The Fen round the snag is chapter 3's (golden reed, horsetails,
// moss hummocks, a swamp conifer now and then); the lazy reach's banks are reed and horsetail with ferns and stones, the rapids'
// banks stones; the valley is the forest, its understory only near the river (further up its sides only trees show from the air);
// the gorge's rim is bushes, cycads and rock; the lilies float near the banks of the lazy reach and round the far pool.
const REAL = {
  fen: [['horsetailReed', 1.0], ['horsetailTall', 0.3], ['mossHummock', 0.3], ['swampConifer', 0.05], ['bush', 0.08], ['deadSnag', 0.01]],
  edge: [['horsetailReed', 1.3], ['horsetailTall', 0.5], ['fern', 0.8], ['bush', 0.35], ['flowers', 0.6], ['mossHummock', 0.3], ['rockSmall', 0.4], ['rock', 0.15]],
  rapids: [['rock', 0.6], ['rockSmall', 0.8], ['horsetailTall', 0.3], ['fern', 0.3]],
  near: [['broadleaf', 0.12], ['araucaria', 0.04], ['treeFern', 0.2], ['cycad', 0.2], ['bush', 0.35], ['fern', 0.5], ['flowers', 0.3], ['rock', 0.08]],
  // by the animal groups (LOW): what the child sees over
  low: [['flowers', 1.0], ['fern', 0.6], ['mossHummock', 0.5], ['rockSmall', 0.4]],
  far: [['broadleaf', 0.16], ['araucaria', 0.07], ['treeFern', 0.08]],
  rim: [['bush', 0.4], ['cycad', 0.15], ['araucaria', 0.04], ['rock', 0.3], ['rockSmall', 0.3]],
  water: [['waterLily', 1.2]],
};
const SCALE = {
  broadleaf: [0.9, 1.2], araucaria: [0.75, 1.0], swampConifer: [0.9, 1.15], deadSnag: [0.7, 1.0], treeFern: [0.9, 1.4], cycad: [0.9, 1.3],
  bush: [0.9, 1.4], fern: [1.0, 1.6], horsetailReed: [0.9, 1.3], horsetailTall: [0.9, 1.2], rock: [0.8, 2.2], rockSmall: [0.8, 1.6],
  mossHummock: [0.8, 1.3], waterLily: [0.8, 1.2], flowers: [0.9, 1.4],
};
// The banks of the river up to the gorge, green all along: every `step` metres up each bank a plant may stand in each row (metres
// from the water's edge), at `chance`, `jitter` metres either way along, of the mix of the bank's zone (REAL.edge, REAL.rapids), but
// where a plant already stands within `near` metres (seen from above, in x and in z).
const BANK = { step: 2.5, rows: [[0.6, 3.4], [3.2, 6.4]], chance: 0.85, jitter: 1.0, near: 2.0 };
/** Within `reach` metres of an animal group, on its side of the river, nothing taller than `height` grows (REAL.low there). */
export const LOW = { reach: 10, height: 0.6 };
/**
 * The still shots' views (engine/camera/flight-camera.js stillViews, spec 6): nothing taller than `tall` within `near` metres of a
 * camera (seen from above), and nothing within `gap` metres of a line from a camera to what it looks at.
 */
export const VIEW = { near: 6, tall: 0.5, gap: 1 };
const VIEW_STEP = 0.25; // metres between the points of a line of sight a plant is measured from (and VIEW_STEP / 2 more kept clear)

/** The views' lines of sight, each with its box seen from above. */
function linesOf(views) {
  return views.flatMap(v => v.looks.map(b => {
    const a = v.position;
    return { a, b, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  }));
}

/** True when a plant at (x, y, z), `r` round and `h` tall, stands in a still shot's view: tall by its camera, or by a line of sight. */
function inView(views, lines, x, y, z, r, h) {
  if (h > VIEW.tall && views.some(v => Math.hypot(v.position.x - x, v.position.z - z) <= VIEW.near)) return true;
  const reach = r + VIEW.gap + VIEW_STEP;
  for (const { a, b, minX, maxX, minZ, maxZ } of lines) {
    if (x < minX - reach || x > maxX + reach || z < minZ - reach || z > maxZ + reach) continue;
    const length = a.distanceTo(b);
    const steps = Math.max(1, Math.ceil(length / VIEW_STEP));
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const sx = a.x + (b.x - a.x) * f, sy = a.y + (b.y - a.y) * f, sz = a.z + (b.z - a.z) * f;
      const across = Math.hypot(sx - x, sz - z) - r;
      const up = Math.max(0, y - sy, sy - (y + h));
      if (Math.hypot(Math.max(0, across), up) < VIEW.gap + VIEW_STEP / 2) return true;
    }
  }
  return false;
}
const UNDERSTORY_REACH = 60; // m from the water's edge beyond which only trees grow
const FEN_FULL = 40; // m from her path within which the Fen grows as thick as it does at the snag; beyond, FEN_FAR of that
const FEN_FAR = 0.35;
const FINE = 30; // m from her path within which a plant has its middle detail level for when the camera comes near; beyond, only the coarse one
const ONE_LEVEL = new Set(['rock', 'rockSmall', 'mossHummock']); // their middle level is cheap enough anywhere
const LANE = 4; // m she may be steered aside (route.lanes)
export const CLEAR_OF_HER = 3.5; // m between a plant (its crown counted) and her path at any steer: a little more than the 3 m the test asks
const SNAG_CLEAR = 4; // m round the white snag's foot
// High over the land (F and G: her path HIGH m or more over the ground under it) no tree's crown may come within UNDER m under her
// path within ASIDE m of it seen from above: the chase camera, above and behind her, would see a crown, not the land.
export const HIGH = 12;
const UNDER = 9.5;
const ASIDE = 14.5;
const TREES = new Set(['broadleaf', 'araucaria', 'treeFern', 'swampConifer', 'deadSnag']);
const highOf = new WeakMap(); // the route index's samples where she flies high over dry land, worked out once

/** The samples of her path that are HIGH m or more over dry land (not the river, not the pool): [{ x, y, z }]. */
export function highOverLand(index, terrain, route) {
  if (highOf.has(index)) return highOf.get(index);
  const list = index.points.filter(q => {
    const w = terrain.where(q.x, q.z);
    return q.y - terrain.heightAt(q.x, q.z) >= HIGH && w.e > 0 && w.toPool > route.pool.radius;
  });
  highOf.set(index, list);
  return list;
}

/** True when a tree with its top at `top` and its crown `r` round its foot at (x, z) would rise into the view under her (HIGH). */
function underHer(high, x, z, top, r) {
  const reach = ASIDE + r;
  for (const q of high) {
    if (Math.abs(q.x - x) >= reach || Math.abs(q.z - z) >= reach) continue;
    if (Math.hypot(q.x - x, q.z - z) - r < ASIDE && q.y - top < UNDER) return true;
  }
  return false;
}

/** How far a placed model reaches round its foot (its crown counted) and how tall it is, in metres. */
export function bodyOf(model, scale) {
  const crown = model.crown ? Math.hypot(model.crown.c[0], model.crown.c[2]) + model.crown.r : 0;
  return { r: Math.max(model.radius, crown) * scale, h: model.height * scale };
}

/** True when a plant standing at (x, y, z), `r` round and `h` tall, would come within CLEAR_OF_HER of her path at any steer. */
function inHerWay(index, x, y, z, r, h, near) {
  const k = index.nearest(x, z, LANE + r + CLEAR_OF_HER + 1, near);
  if (k < 0) return false;
  for (let j = Math.max(0, k - 60); j <= Math.min(index.points.length - 1, k + 60); j++) {
    const q = index.points[j];
    const across = Math.hypot(q.x - x, q.z - z) - LANE - r;
    if (across > CLEAR_OF_HER) continue;
    const up = Math.max(0, y - q.y, q.y - (y + h));
    if (Math.hypot(Math.max(0, across), up) < CLEAR_OF_HER) return true;
  }
  return false;
}

/**
 * The outcrops of the land above the falls (route.land.outcrops: [x, z, scale]) as rock props for plantSteps, each on the ground,
 * and where nothing else grows round them. Returns { props, clear }.
 */
export function outcropProps(route, heightAt) {
  const props = [];
  const clear = [];
  (route.land?.outcrops ?? []).forEach(([x, z, scale], i) => {
    props.push({ name: 'rock', variant: i % FOREST.trees.variants.rock, x, y: heightAt(x, z), z, rot: i * 2.39, scale });
    clear.push({ x, z, r: 1.2 * scale });
  });
  return { props, clear };
}

/**
 * The steps that grow one section's real plants (a generator for the build queue). `library` is the forest's species library (one
 * for the whole valley, so each shape is made once), `materials` { solid, thin } (look.js: createPlantMaterials), `props` what the
 * animals sit on and `clear` where nothing else may grow (animals.js: the lily pads, the log, the stone, round each critter), `low`
 * the animal groups ({ x, z, side }) round which only low plants grow (LOW), `views` the still shots' (VIEW), `atlas` and `cards`
 * the far trees' pictures and their material (world/forest/cards.js: a tree that has one is drawn as it far off). Returns { group,
 * placements, meshes }: the placements as the forest's (world/forest/plan.js), the meshes merged a section at a time.
 */
export function* plantSteps({ terrain, index, route, ground, seed, library, materials, props = [], clear = [], low = [], views = [], atlas = null, cards = null }) {
  const lines = linesOf(views);
  const meadow = route.land?.meadow ?? null;
  const { own, grid: { gx0, gz0, W } } = ground;
  const rng = seeded(seed);
  const range = ([lo, hi]) => lo + rng() * (hi - lo);
  const cameoPaths = [route.cameos.bank.path, route.cameos.rim.path];
  const nearCameo = (x, z) => cameoPaths.some(path => path.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7));
  const steep = (x, z) => {
    const gx = terrain.heightAt(x + 1, z) - terrain.heightAt(x - 1, z);
    const gz = terrain.heightAt(x, z + 1) - terrain.heightAt(x, z - 1);
    return Math.hypot(gx, gz) / 2 > 0.75;
  };
  const near = {};
  const high = highOverLand(index, terrain, route);
  const placements = [];
  const CELL = 10;
  const per = Math.round(CELL / GRID);
  const cellsAcross = W - 1;
  const rows = own.length / cellsAcross;
  const { pool } = route;
  /** True within LOW.reach of an animal group, on its side of the river. */
  const lowAt = (x, z) => low.some(c => Math.abs(c.x - x) <= LOW.reach && Math.abs(c.z - z) <= LOW.reach
    && Math.hypot(c.x - x, c.z - z) <= LOW.reach && terrain.where(x, z).side === c.side);
  /** Grows one `name` at (px, pz) if it may stand there (`sky` its share of the sky, `d` its river distance). */
  function* grow(name, px, pz, sky, d) {
    let scale = range(SCALE[name]);
    const variant = Math.floor(rng() * FOREST.trees.variants[name]);
    const rot = rng() * Math.PI * 2;
    const phase = rng();
    let y;
    if (name === 'waterLily') {
      const wp = terrain.where(px, pz);
      const inPool = wp.toPool < pool.radius - 1.5;
      if (!inPool && !(wp.e < -0.5 && wp.e > -4.5 && wp.d < RAPIDS.from - 10)) return;
      y = (inPool ? pool.level : route.river.at(wp.d).level) + 0.012;
    } else {
      if (terrain.where(px, pz).e < 0.3 || steep(px, pz)) return;
      if (Math.hypot(px - route.tree[0], pz - route.tree[2]) < SNAG_CLEAR) return;
      y = terrain.heightAt(px, pz);
    }
    const coarse = yield* library.getSteps(name, variant, 2, {});
    const one = ONE_LEVEL.has(name);
    const fine = !one && index.nearest(px, pz, FINE, near) >= 0;
    const middle = one || fine ? yield* library.getSteps(name, variant, 1, {}) : null;
    if (name !== 'waterLily' && lowAt(px, pz)) {
      // by an animal group: only what can be drawn low, and drawn so
      const tall = Math.max(coarse.height, middle?.height ?? 0);
      if (LOW.height / tall < 0.6) return;
      scale = Math.min(scale, (LOW.height * 0.98) / tall);
    }
    const body = bodyOf(coarse, scale);
    if (inHerWay(index, px, y, pz, body.r, body.h, near)) return;
    if (clear.some(c => Math.hypot(px - c.x, pz - c.z) < c.r + body.r)) return; // an animal or what it sits on
    if (TREES.has(name) && underHer(high, px, pz, y + body.h, body.r)) return;
    if (TREES.has(name) && meadow && Math.hypot(px - meadow[0], pz - meadow[1]) < meadow[2] + body.r) return; // the herd's open meadow
    const models = fine ? [{ level: 1, model: middle }, { level: 2, model: coarse }] : [{ level: one ? 1 : 2, model: one ? middle : coarse }];
    const model = models[0].model;
    const drawn = bodyOf(model, scale);
    if (inView(views, lines, px, y - (model.sink ?? 0) * scale, pz, Math.max(drawn.r, body.r), Math.max(drawn.h, body.h))) return; // a still shot sees past it
    placements.push({
      name, model, models, variant, lod: models[0].level, x: px, y: y - (model.sink ?? 0) * scale, z: pz, rot, scale, phase,
      band: fine ? 'near' : 'far', sector: aboveTheFalls(route, d) ? ABOVE_SECTOR : 0, sky, d, card: atlas?.card(name, variant) ?? null,
    });
  }
  for (let j = 0; j < rows; j += per) {
    for (let i = 0; i < cellsAcross; i += per) {
      if (!own[j * cellsAcross + i]) continue;
      const x = (gx0 + i) * GRID + rng() * CELL;
      const z = (gz0 + j) * GRID + rng() * CELL;
      const w = terrain.where(x, z);
      let zone;
      if (w.toPool < pool.radius - 1.5) zone = w.toPool > pool.radius - 7 ? 'water' : null;
      else if (w.toPool < pool.radius + 5) zone = 'edge';
      else if (w.e < -0.5) zone = w.d < RAPIDS.from - 10 && w.e > -4.5 ? 'water' : null;
      else if (w.fen > 0.6) zone = 'fen';
      else if (w.gorge > 0.5 && w.e < 9) zone = null; // the walls
      else if (w.e < 6) zone = w.d < RAPIDS.from ? 'edge' : 'rapids';
      else if (w.gorge > 0.5 && w.e < 32) zone = 'rim';
      else zone = w.e < UNDERSTORY_REACH ? 'near' : 'far';
      if (!zone || nearCameo(x, z)) continue;
      // the Fen's far reed is sparser (as chapter 2's Fen has it): a few pixels a blade, it reads by the gold of the ground under it
      const thin = zone === 'fen' && index.nearest(x, z, FEN_FULL, near) < 0 ? FEN_FAR : 1;
      for (const [name, base] of REAL[zone]) {
        const chance = base * thin;
        const count = Math.floor(chance) + (rng() < chance % 1 ? 1 : 0);
        for (let c = 0; c < count; c++) yield* grow(name, x + (rng() - 0.5) * 6, z + (rng() - 0.5) * 6, zone === 'fen' ? FEN.sky : 0.9, w.d);
      }
    }
    yield 'plants';
  }
  // the banks, green all along up to the gorge (BANK): in each row a plant every step or so, of the bank's mix (low by the animals)
  const ownAt = (x, z) => {
    const i = Math.floor(x / GRID) - gx0;
    const j = Math.floor(z / GRID) - gz0;
    return i >= 0 && j >= 0 && i < cellsAcross && j < rows && own[j * cellsAcross + i];
  };
  const pick = mix => {
    let r = rng() * mix.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [name, weight] of mix) if ((r -= weight) < 0) return name;
    return mix.at(-1)[0];
  };
  for (let d = 0; d < route.gorge.from; d += BANK.step) {
    const r = route.river.at(d);
    for (const side of [-1, 1]) {
      for (const [e0, e1] of BANK.rows) {
        const middle = r.half + (e0 + e1) / 2;
        const mx = r.x - r.dir[1] * side * middle;
        const mz = r.z + r.dir[0] * side * middle;
        if (!ownAt(mx, mz)) continue;
        if (placements.some(p => p.name !== 'waterLily' && Math.abs(p.x - mx) < BANK.near && Math.abs(p.z - mz) < BANK.near)) continue; // green already
        if (rng() >= BANK.chance) continue;
        const at = route.river.at(Math.max(0, d + (rng() - 0.5) * 2 * BANK.jitter));
        const out = at.half + e0 + rng() * (e1 - e0);
        const px = at.x - at.dir[1] * side * out;
        const pz = at.z + at.dir[0] * side * out;
        const w = terrain.where(px, pz);
        if (w.gorge > 0.5 || w.toPool < pool.radius + 5 || nearCameo(px, pz)) continue;
        const mix = lowAt(px, pz) ? REAL.low : w.d < RAPIDS.from ? REAL.edge : REAL.rapids;
        yield* grow(pick(mix), px, pz, w.fen > 0.6 ? FEN.sky : 0.9, w.d);
      }
    }
    if (Math.round(d / BANK.step) % 8 === 7) yield 'banks';
  }
  // what the animals sit on, those that stand in this section's own cells
  for (const prop of props) {
    const i = Math.floor(prop.x / GRID) - gx0;
    const j = Math.floor(prop.z / GRID) - gz0;
    if (i < 0 || j < 0 || i >= cellsAcross || j >= rows || !own[j * cellsAcross + i]) continue;
    const middle = yield* library.getSteps(prop.name, prop.variant, 1, {});
    const models = ONE_LEVEL.has(prop.name) ? [{ level: 1, model: middle }]
      : [{ level: 1, model: middle }, { level: 2, model: yield* library.getSteps(prop.name, prop.variant, 2, {}) }];
    const d = terrain.where(prop.x, prop.z).d;
    placements.push({
      name: prop.name, model: middle, models, variant: prop.variant, lod: 1, x: prop.x, y: prop.y - (middle.sink ?? 0) * prop.scale, z: prop.z,
      rot: prop.rot, scale: prop.scale, phase: 0.5, band: 'near', sector: aboveTheFalls(route, d) ? ABOVE_SECTOR : 0, sky: 0.9, d,
    });
  }
  const batcher = createBatcher();
  for (const p of placements) batcher.add(p);
  const { meshes } = yield* batcher.buildSteps(bucket => ({
    material: bucket.kind === 'thin' ? materials.thin : materials.solid, receiveShadow: true, renderOrder: 3,
  }), { cards: cards ? { material: cards, renderOrder: 3 } : null });
  const group = new THREE.Group();
  group.name = 'Árdalur plants';
  for (const mesh of meshes) {
    mesh.name = mesh.name.replace('Forest', 'Árdalur');
    group.add(mesh);
  }
  return { group, placements, meshes };
}
