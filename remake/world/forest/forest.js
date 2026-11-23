// The forest system: layout in, forest out.
//
//   createForest(world, layout, { slice }) -> { group, update(dt, time), heightAt(x, z), butterflies, dispose() }   (a promise; with
//   `slice` it is built a slice at a time over frames, slices.js, the same forest either way)
//
// `butterflies` is the clearing's pale butterflies as tap targets ({ targets: [{ name, point, radius }], flutter(name), land(spec) },
// atmosphere.js: butterflyLand flies one to a point).
//
// layout = { seed, clearing: { center, radius }, forestEdge, path: [[x, z], ...] } from the chapter, and, all optional:
//   shots   the camera shots set in this place, which the planner keeps clear (a chapter location carries its own)
//   actors  { name: { position, heading } } who stands in this place, kept clear too (else the chapter's actors are)
//   glade   { ferns, shafts } makes it a fern glade: a rim of ferns that many times lusher, that many light shafts landing in
//           the clearing (config.js: FOREST.glade), and leaf shadows over its floor unless `leafShadows` says false
//   leafShadows  true puts leaf shadows on the floor, slowly drifting with the wind (config.js: FOREST.leafShadow); a glade has
//           them by default, any other forest does not
//   biome   'fen' grows the Fen instead of the forest (biome.js, FEN in config.js), with `blend: { from, to }` only beyond
//           the line between those points (the trail from the forest into the Fen)
//   water   { pools, channel }: the Fen's water (world/props/water.js). The ground is dug out under it (shapeGround below),
//           plants keep out of it (keepOut), lilies grow on it, and `forest.water` draws it; heightAt is the bed, so an actor
//           in the water stands on the bottom
//   hummocks [{ center, radius, height }]: dry mounds raised out of the Fen's floor
//   plants  [{ name, position: [x, z], scale, variant, rot, sky }]: plants the chapter places itself, first and where it says (in a forest too, plan.js 0b)
//   mist    [{ center, radius, height, level }]: low mist over the place (world/props/mist.js), `forest.mists` in order
//   farFriends, lookout  where the friends far out in the Fen are and the point they are seen from: tall plants keep out of
//           the lines between them
//   mossClear [{ center: [x, z], radius }]: no hanging moss from inside these discs (moss.js), the plan unchanged
//   leaveOut  (info, placement) => true for a plant (placementInfo: name, x, z, height, radius, ...; and the placement with its
//           model) the place grows without: the plan is
//           made as it would be and those plants are taken out of it before anything is built (a walk through the trees in one
//           chapter, Fiðrildadansinn), so every other plant stays where it was
//   sectors   { clearing, edge, inner, deep }: how many sector meshes each band is cut into (config.js: bands.sectors); fewer, bigger ones draw in fewer calls
//   farRings  the far treeline's rings (far.js) instead of the biome's own: [{ radius, rows, spacing, height, crown, strip, color, haze, topHaze, araucaria }]
//   farCards  { from }: the trees of the carded kinds (cards.js CARDED) at least `from` m from the clearing's centre, where the place's
//           cameras never come near, are still pictures of themselves (cards.js), never their mesh: one quad each, lit as the plants
//           and bending with the wind as their tops do (the take-off's forest round chapter 4's white tree)
//   groundPieces  true cuts the ground into pieces round the clearing (cutGround) and draws only those in view: its far rings have as
//           many triangles as its near ones, and a camera in the clearing sees a sixth of them
// Everything else (palette, densities, bands, wind weights) is in ./config.js. The pieces:
//   terrain.js     height function, ground masks, ground mesh and material
//   species.js     the species registry: procedural variants per kind
//   plan.js        placements from the layout (path, shots, actors, sun corridor)
//   batch.js       placed models baked into merged sector meshes (and the pivot of what bends, nods and hops: aPivot)
//   grass.js       blade grass with wind, distance LOD and actor footprints
//   far.js         the far treeline rings
//   atmosphere.js  light shafts and motes
import * as THREE from 'three';
import { FOREST, FEN, leafShadowsOf } from './config.js';
import { createTerrain, ACTOR_GLSL } from './terrain.js';
import { createSpeciesLibrary } from './species.js';
import { planForestSteps } from './plan.js';
import { createBatcher, cullBatches, cullCasters } from './batch.js';
import { createGrassSteps } from './grass.js';
import { createFarForestSteps } from './far.js';
import { createAtmosphere } from './atmosphere.js';
import { createForestLife } from './life.js';
import { createHangingMoss } from './moss.js';
import { smoothstep, clamp } from './random.js';
import { createNoiseTextureSteps, createLeafTextureSteps, createSharedUniforms, createVegetationMaterial, createWindDepthMaterial, leafMeanOf } from './materials.js';
import { CARDED, createCardAtlas, createCardMaterial } from './cards.js';
import { runSync, runSliced, FRESH } from './slices.js';
import { waterShape, createWaterSteps } from '../props/water.js';
import { createMist } from '../props/mist.js';

const BAND_SETUP = {
  // receiveShadow near the playable area; shadows come from the caster meshes (batch.js)
  clearing: { receive: true, order: 2 },
  edge: { receive: true, order: 3 },
  inner: { receive: false, order: 4 },
  deep: { receive: false, order: 5 },
};
// Kinds whose shadows matter; small plants cast none. The deep band casts nothing.
const CASTERS = new Set(['broadleaf', 'araucaria', 'treeFern', 'cycad', 'bush', 'rock', 'rockSmall', 'log', 'swampConifer', 'deadSnag']);
// Kinds whose crowns shade the ground round the clearing (terrain.setCanopy), and how much.
const CANOPY = { broadleaf: 0.9, araucaria: 0.6, swampConifer: 0.75 };
// Far out the ground mesh is coarse (terrain.js: its rings), so round the water there a broad, shallow hollow keeps the ground
// under the whole surface: this much lower than the water's edge, past 60 m from the clearing's centre.
const FAR_DROP = 0.12;
// Near the clearing the ground at the water's edge stands this much above it, so no bare ground lies lower than the water.
const BANK = 0.02;
// Hanging moss is a few centimetres of strand: past this far from the clearing it is not seen, so it is not drawn there.
const MOSS_REACH = 100;
// A far tree's picture (layout.farCards): pixels a cell of its atlas. Such a tree stands 20 m or more from the camera, mostly under
// 300 px tall on the tablet (the white tree's: half of them under 180 px), so a cell of this holds it at about a pixel a pixel.
const FAR_CARD_CELL = 256;
// The ground's pieces (cutGround): sectors round the clearing's centre, and rings out from it (metres), each ring's sector one piece.
const GROUND_PIECES = { sectors: 48, rings: [3, 6, 9, 12, 15, 18, 22, 26, 30, 35, 40, 50, 60, 80, 110, 170] };
// The plants are culled again once the camera has moved `move` m or turned `turn` radians (a degree and a half) since the last cull.
const RECULL = { move: 0.4, turn: 0.0261 };

/**
 * A layout's ground, shaped as the forest grows it: the layout itself, or a copy whose `lift` digs the Fen's water out of the
 * floor and raises its hummocks, whose `keepOut` keeps plants and grass out of the water (1 inside its edge, fading to nothing
 * 0.4 m outside it), and whose `water` answers surfaceAt(x, z) and depthAt(x, z) on that ground. Returns { layout, terrain,
 * water } (water: the shape, world/props/water.js: waterShape, or null). Each pool and the channel is dug to its depth below
 * the one level all the water lies at, its bed smooth-stepped over 2.5 times its depth inside the edge (waterShape.bedAt); round
 * it the ground stands a little above the water at its edge and eases back to its own height within two metres near the
 * clearing; far out, where the ground mesh is coarse, it lies in a wider hollow a little below the water's edge.
 */
export function shapeGround(world, layout, seed = layout.seed ?? 1) {
  const water = layout.water ? waterShape(layout.water) : null;
  const hummocks = layout.hummocks ?? [];
  let shaped = layout;
  if (water || hummocks.length) {
    const own = layout.lift;
    const [cx, cz] = layout.clearing.center;
    const lift = (x, z, natural) => {
      let h = natural + (own ? own(x, z, natural) : 0);
      for (const { center: [hx, hz], radius, height } of hummocks) {
        const d = Math.hypot(x - hx, z - hz) / radius;
        if (d < 1) h += height * smoothstep(1, 0.3, d);
      }
      if (water) {
        const r = Math.hypot(x - cx, z - cz);
        const margin = clamp(2 + (r - 30) * 0.35, 2, 22);
        const { s, depth } = water.nearest(x, z);
        if (s < margin) {
          const bed = s < 0
            ? water.level - (water.edgeDrop + (depth - water.edgeDrop) * smoothstep(0, 2.5 * depth, -s))
            : water.level + BANK - (BANK + water.edgeDrop + FAR_DROP) * smoothstep(34, 60, r);
          const eased = s <= 0 ? bed : bed + (h - bed) * smoothstep(margin * 0.25, margin, s);
          if (eased < h) h = eased;
        }
      }
      return h - natural;
    };
    shaped = { ...layout, lift };
    if (water) {
      const ownKeep = layout.keepOut;
      shaped.keepOut = (x, z) => {
        const s = water.signedAt(x, z);
        const wet = s <= 0 ? 1 : 1 - smoothstep(0, 0.4, s);
        return ownKeep ? Math.max(ownKeep(x, z), wet) : wet;
      };
    }
  }
  const terrain = createTerrain(world, shaped, seed);
  if (water) {
    shaped.water = {
      ...layout.water, level: water.level, shape: water,
      surfaceAt: (x, z) => (water.signedAt(x, z) < 0 ? water.level : null),
      depthAt: (x, z) => (water.signedAt(x, z) < 0 ? Math.max(0, water.level - terrain.heightAt(x, z)) : 0),
    };
  }
  return { layout: shaped, terrain, water };
}

/** Where the water's faint rings start by themselves: at the lilies, and in the water by roots, reed and stones at its edge. */
function waterSpots(placements, water) {
  const kinds = { lily: [], root: [], reed: [], stone: [] };
  const kindOf = { waterLily: 'lily', swampConifer: 'root', deadSnag: 'root', horsetailReed: 'reed', rock: 'stone', rockSmall: 'stone', log: 'stone' };
  const e = 0.3;
  for (const p of placements) {
    const kind = kindOf[p.name];
    if (!kind) continue;
    if (kind === 'lily') { kinds.lily.push([p.x, p.z]); continue; }
    const s = water.signedAt(p.x, p.z);
    if (!(s > 0 && s < 2.5)) continue;
    const gx = water.signedAt(p.x + e, p.z) - water.signedAt(p.x - e, p.z), gz = water.signedAt(p.x, p.z + e) - water.signedAt(p.x, p.z - e);
    const l = Math.hypot(gx, gz) || 1;
    kinds[kind].push([p.x - (gx / l) * (s + 0.4), p.z - (gz / l) * (s + 0.4)]);
  }
  // some of each kind, spread through each list (placements come in the order the passes grew them, lilies last)
  const some = (list, n) => list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]);
  return [...some(kinds.lily, 10), ...some(kinds.root, 10), ...some(kinds.reed, 8), ...some(kinds.stone, 4)];
}

/**
 * Points over a place's open water within a mist's disc (a 2 m grid, more than a metre from any edge), for its cards to stand
 * on: none where an actor stands in the water, so no mist veils legs at the waterline (MIST_CLEAR m round Þórseðla's root,
 * MIST_CLEAR_OTHERS round every other point the layout's actors name).
 */
const MIST_CLEAR = 9, MIST_CLEAR_OTHERS = 5;
function mistPoints(water, [cx, cz], radius, actors = {}) {
  const clear = Object.entries(actors).map(([name, a]) => [a.position[0], a.position[2], name === 'thorsedla' ? MIST_CLEAR : MIST_CLEAR_OTHERS]);
  const points = [];
  for (let z = cz - radius; z <= cz + radius; z += 2) {
    for (let x = cx - radius; x <= cx + radius; x += 2) {
      if (Math.hypot(x - cx, z - cz) > radius || water.signedAt(x, z) >= -1) continue;
      if (clear.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
      points.push([x, z]);
    }
  }
  return points;
}

/**
 * What the forest tells of one plant it grew (info.placementList): its kind, detail level, place and scale, the triangles
 * it costs, and its size in metres: how far it reaches round (radius), how tall it is, and for a plant with a trunk where
 * the trunk ends (top) and how thick it is there (trunk); for a dead snag also where its broken top is ([x, z], tip) and how thick
 * it is there (tipR). A chapter places things by plants with it (kafli1's flowers).
 */
export function placementInfo(p) {
  const { model, scale } = p;
  return {
    name: p.name, lod: p.lod, x: p.x, y: p.y, z: p.z, scale,
    tris: (model.solid ? model.solid.triangles : 0) + (model.thin ? model.thin.triangles : 0),
    radius: model.radius * scale, height: model.height * scale,
    top: model.trunk ? model.trunk.top * scale : null, trunk: model.trunk ? model.trunk.r * scale : null,
    ...(model.trunk?.tip ? { tip: tipOf(p), tipR: model.trunk.tipR * scale } : {}),
  };
}

/** Where a plant's trunk ends, in the world ([x, z]): its own `tip`, turned and scaled as the plant is placed (batch.js). */
function tipOf({ model, x, z, rot, scale }) {
  const [lx, lz] = model.trunk.tip, c = Math.cos(rot), s = Math.sin(rot);
  return [x + (lx * c - lz * s) * scale, z + (lx * s + lz * c) * scale];
}

/**
 * A forest for `layout` (see the top of this file), built at once, or with `slice` ({ budget, wait, onSlice }: slices.js runSliced)
 * a slice at a time over frames, so that it can be built while the child watches. Either way it resolves to the same forest.
 */
/**
 * The trees of the carded kinds at least `from` m from the clearing's centre (layout.farCards) as cards only: their pictures (one a
 * shape, from the coarsest level each is drawn at, with the painted leaves' far tone, cards.js createCardAtlas) and the cards' material
 * with the forest's wind; each such placement gets its `card` and `cardOnly`, so the batcher bakes its card and no mesh (batch.js).
 * Returns { atlas, material, count } or null when no tree stands that far.
 */
function farCardsOf(world, placements, [cx, cz], { from }, { leafTexture, shared, low, q }) {
  const far = placements.filter(p => CARDED.includes(p.name) && Math.hypot(p.x - cx, p.z - cz) >= from);
  if (!far.length) return null;
  const modelOf = p => (p.models || [{ model: p.model }]).at(-1).model;
  const entries = [], known = new Set();
  for (const p of far) {
    const model = modelOf(p);
    if (known.has(model)) continue;
    known.add(model);
    entries.push({ name: p.name, variant: p.variant, model });
  }
  const atlas = createCardAtlas(world.renderer ?? null, entries, { leafTone: low ? 1 : leafMeanOf(leafTexture), cell: FAR_CARD_CELL, columns: Math.min(8, Math.ceil(Math.sqrt(entries.length))) });
  for (const p of far) {
    p.card = atlas.cardOf(modelOf(p));
    p.cardOnly = true;
  }
  const material = createCardMaterial(atlas, { coverage: Boolean(q.antialias), wind: shared });
  return { atlas, material, count: far.length };
}

/**
 * The forest's ground (one mesh, its rings round the clearing as many triangles each, the far ones as many as the near) in pieces the
 * forest culls as the batcher's meshes (batch.js cullBatches): its triangles sorted by where their middle is, a sector round `center`
 * and a ring out from it (GROUND_PIECES), each piece a range of the index with a sphere round all its triangles. The same vertices and
 * triangles, drawn whole until the first cull.
 */
function cutGround(mesh, [cx, cz]) {
  const g = mesh.geometry, pos = g.getAttribute('position'), all = g.index.array;
  const { sectors, rings } = GROUND_PIECES;
  const pieces = new Map();
  for (let i = 0; i < all.length; i += 3) {
    let x = 0, z = 0;
    for (let k = 0; k < 3; k++) { x += pos.getX(all[i + k]) / 3; z += pos.getZ(all[i + k]) / 3; }
    const ring = rings.findIndex(r => Math.hypot(x - cx, z - cz) < r);
    const sector = Math.floor(((Math.atan2(z - cz, x - cx) / (2 * Math.PI)) + 1) % 1 * sectors) % sectors;
    const key = (ring < 0 ? rings.length : ring) * sectors + sector;
    if (!pieces.has(key)) pieces.set(key, []);
    pieces.get(key).push(i);
  }
  const master = new all.constructor(all.length);
  const ranges = [];
  const box = new THREE.Box3(), v = new THREE.Vector3();
  let k = 0;
  for (const key of [...pieces.keys()].sort((a, b) => a - b)) {
    const start = k;
    box.makeEmpty();
    for (const i of pieces.get(key)) {
      for (let j = 0; j < 3; j++) {
        master[k++] = all[i + j];
        box.expandByPoint(v.fromBufferAttribute(pos, all[i + j]));
      }
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    ranges.push({ start, count: k - start, sphere, ref: sphere.center, minD: 0, maxD: Infinity, cull: Infinity, crown: null, plant: null, li: -1, name: 'ground' });
  }
  const index = new THREE.BufferAttribute(master.slice(), 1);
  index.setUsage(THREE.DynamicDrawUsage);
  g.setIndex(index);
  mesh.userData = { ...mesh.userData, kind: 'ground', cull: { master, ranges, crownRanges: [], kept: [], signature: -1, submitted: master.length / 3, geometry: g }, hidden: false };
}

export async function createForest(world, layout, { slice = null } = {}) {
  const steps = forestSteps(world, layout);
  return slice ? runSliced(steps, slice) : runSync(steps);
}

function* forestSteps(world, layout) {
  const t0 = performance.now();
  const { scene, q } = world;
  const seed = (layout.seed ?? 1) >>> 0;
  const group = new THREE.Group();
  group.name = 'Forest';

  const aniso = Math.min(4, world.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  const noiseTexture = yield* createNoiseTextureSteps(seed);
  if (aniso > 1) noiseTexture.anisotropy = aniso;
  yield 'noise';
  const leafTexture = yield* createLeafTextureSteps(seed);
  if (aniso > 1) leafTexture.anisotropy = aniso;
  yield 'leaf';
  const shared = createSharedUniforms(world, noiseTexture, leafTexture, leafShadowsOf(layout) ? FOREST.leafShadow.strength : 0);
  const actorUniforms = {
    uActors: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 0)) },
    uActorShape: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(1.3, 0.9, 0.8, 0)) },
    uActorCount: { value: 0 },
    uActorWarm: { value: FOREST.actorWarm }, // the lighter, warmer ground round characters
  };

  // ground: the layout's, with the Fen's water dug out and its hummocks raised
  const ground = shapeGround(world, layout, seed);
  yield 'ground shaped';
  layout = ground.layout;
  const { terrain } = ground;
  const library = createSpeciesLibrary(seed);
  const plan = yield* planForestSteps({ world, layout, seed, terrain, library, q });
  // a chapter's own few plants left out of the place as planned (layout.leaveOut), before anything is built from the plan
  if (layout.leaveOut) {
    const before = plan.placements.length;
    plan.placements = plan.placements.filter(p => !layout.leaveOut(placementInfo(p), p));
    plan.stats.leftOut = before - plan.placements.length;
  }
  yield 'planned';

  // canopy shade from the crowns round the clearing (their ground shadows along the sun)
  yield* terrain.setCanopySteps(plan.placements.filter(p => CANOPY[p.name] && p.model.crown && p.band !== 'deep').map(p => {
    const cr = p.model.crown, c = Math.cos(p.rot), s = Math.sin(p.rot);
    return {
      x: p.x + (cr.c[0] * c - cr.c[2] * s) * p.scale, y: p.y + cr.c[1] * p.scale, z: p.z + (cr.c[0] * s + cr.c[2] * c) * p.scale,
      r: cr.r * p.scale, density: CANOPY[p.name],
    };
  }), world.lighting.direction);
  yield 'canopy';
  const floor = yield* terrain.createGroundMaterialSteps(shared, actorUniforms); // after planning: soil stamps, canopy
  if (aniso > 1 && floor.mask?.tex) floor.mask.tex.anisotropy = aniso;
  yield 'ground material';
  const groundMesh = new THREE.Mesh(yield* terrain.buildGroundGeometrySteps(q), floor.material);
  yield 'ground';
  groundMesh.name = 'Forest ground';
  if (layout.groundPieces) cutGround(groundMesh, layout.clearing.center); // in pieces, of which the forest draws those in view
  groundMesh.receiveShadow = true;
  groundMesh.renderOrder = 7;
  group.add(groundMesh);

  // vegetation, rocks and wood
  const low = q.name === 'low';
  // the ferns lean away from the same footprint capsules the grass lies down under and the ground shades round
  const actors = { glsl: ACTOR_GLSL, uniforms: actorUniforms };
  const solid = createVegetationMaterial(shared, { side: THREE.FrontSide, key: 'forest-solid', low, actors });
  const thin = createVegetationMaterial(shared, { side: THREE.DoubleSide, key: 'forest-thin', low, actors });
  const solidDepth = createWindDepthMaterial(shared, 'forest-solid');
  const thinDepth = createWindDepthMaterial(shared, 'forest-thin', { side: THREE.DoubleSide });
  // the trees past all the place's cameras as cards of themselves (layout.farCards; some ms for their pictures: a slice of its own)
  const [ccx, ccz] = layout.clearing.center;
  if (layout.farCards) yield FRESH;
  const farCards = layout.farCards ? farCardsOf(world, plan.placements, [ccx, ccz], layout.farCards, { leafTexture, shared, low, q }) : null;
  if (layout.farCards) yield 'far cards';
  const batcher = createBatcher();
  for (const p of plan.placements) {
    batcher.add(p);
    if (CASTERS.has(p.name) && p.band !== 'deep' && !(low && p.band === 'inner')) batcher.addCaster(p);
  }
  yield 'batched';
  const { meshes, casterMeshes } = yield* batcher.buildSteps(bucket => {
    const s = BAND_SETUP[bucket.band];
    return { material: bucket.kind === 'thin' ? thin : solid, receiveShadow: s.receive, renderOrder: s.order };
  }, {
    order: p => Math.hypot(p.x - ccx, p.z - ccz),
    casterSetup: bucket => ({ material: bucket.kind === 'thin' ? thin : solid, depthMaterial: bucket.kind === 'thin' ? thinDepth : solidDepth, renderOrder: 9 }),
    cards: farCards ? { material: farCards.material, renderOrder: BAND_SETUP.deep.order, wind: true } : undefined,
  });
  for (const m of meshes) group.add(m);
  for (const m of casterMeshes) group.add(m);

  yield 'plants';
  // grass
  const grass = yield* createGrassSteps(world, { terrain, layout, seed, shared, actorUniforms, blocked: plan.blocked, q });
  group.add(grass.group);
  yield 'grass';

  // far forest and air; the Fen's treeline stands well out, so the Fen opens to it
  const far = yield* createFarForestSteps({ layout, seed, terrain, q, rings: layout.farRings ?? (terrain.biome.fen ? FEN.far.rings : FOREST.far.rings) });
  group.add(far.mesh);
  yield 'far';
  const air = createAtmosphere(world, { layout, seed, terrain, shared, sun: world.lighting.direction, q });
  group.add(air.group);
  yield 'air';

  // the Fen's water, the moss hanging from its conifers, and the mist low over it
  const water = layout.water
    ? yield* createWaterSteps(world, layout.water, terrain.heightAt, { spots: waterSpots(plan.placements, ground.water), seed, centre: layout.clearing.center, noise: noiseTexture })
    : null;
  if (water) group.add(water.group);
  yield 'water';
  const life = createForestLife(world, { layout, seed, terrain, placements: plan.placements, water, q });
  group.add(life.group);
  yield 'life';
  // moss hangs only where it can be seen, on the conifers within MOSS_REACH m of the clearing (some 25 ms: a slice of its own)
  yield FRESH;
  const moss = createHangingMoss(world, plan.placements.filter(p => Math.hypot(p.x - ccx, p.z - ccz) < MOSS_REACH), shared, {
    antialias: q.antialias, seed, clear: layout.mossClear ?? [],
  });
  if (moss) group.add(moss.mesh);
  const pieces = [groundMesh.userData.cull ? groundMesh : null, moss?.mesh].filter(Boolean); // culled as the plants are (cutGround, moss.js)
  yield 'moss';
  // the mist lies over the water where there is any, its cards standing on the surface
  const mists = [];
  for (const [i, spec] of (layout.mist ?? []).entries()) {
    yield FRESH; // each some 25 ms: a slice of its own
    mists.push(createMist(world, {
      ...spec, seed: seed + i, noise: noiseTexture,
      heightAt: ground.water ? (x, z) => layout.water.surfaceAt(x, z) ?? terrain.heightAt(x, z) : terrain.heightAt,
      over: ground.water ? mistPoints(ground.water, spec.center, spec.radius, layout.actors) : null,
    }));
    yield; // so the next FRESH is not the step this slice began with
  }
  for (const mist of mists) group.add(mist.group);

  scene.add(group);

  const fp = FOREST.grass.footprint;
  const info = {
    buildMs: Math.round(performance.now() - t0),
    placements: plan.stats.counts,
    leftOut: plan.stats.leftOut ?? 0,
    rejected: plan.stats.rejected,
    framing: plan.stats.framing,
    accents: plan.stats.accents,
    byShot: plan.stats.byShot,
    grassBlades: grass.blades,
    grassTriangles: grass.triangles,
    meshes: meshes.map(m => ({ name: m.name, tris: m.userData.triangles })),
    casters: casterMeshes.map(m => ({ name: m.name, tris: m.userData.triangles })),
    farTriangles: far.triangles,
    groundTriangles: groundMesh.geometry.index.count / 3,
    waterTriangles: water ? water.triangles : 0,
    mossCards: moss ? moss.cards : 0,
    farCards: farCards ? farCards.count : 0,
    mistCards: mists.reduce((n, m) => n + m.cards, 0),
    placementList: plan.placements.map(placementInfo),
  };
  if (world.params?.get?.('debug') === '1') console.info('[forest]', info);

  // Profiling aid: ?forestOff=grass,trees,ground,far,air,shadows hides parts of the forest.
  const off = new Set((world.params?.get?.('forestOff') || '').split(',').filter(Boolean));
  if (off.has('grass')) grass.group.visible = false;
  if (off.has('trees')) for (const m of meshes) m.userData.hidden = true;
  if (off.has('ground')) { groundMesh.visible = false; groundMesh.userData.hidden = true; } // (the cull leaves a hidden one hidden)
  if (off.has('far')) far.mesh.visible = false;
  if (off.has('air')) air.group.visible = false;
  if (off.has('life')) life.group.visible = false;
  const castersOn = !off.has('shadows') && !off.has('trees');
  for (const band of ['clearing', 'edge', 'inner', 'deep']) {
    if (off.has(band)) for (const m of meshes) if (m.userData.band === band) m.userData.hidden = true;
  }

  // The caster meshes may only take part in the shadow pass. three builds the main render list
  // before it draws the shadow map, so the casters stay hidden while the list is built, are shown
  // when the sun's shadow pass starts (the light's updateMatrices runs then) and each hides itself
  // in its own onAfterShadow, right after it was drawn. They skip the shadow camera's frustum test,
  // so a shown caster is always drawn (its index buffer only holds plants that shade the focus),
  // and update() hides them all again in case a shadow pass was cut short.
  const sun = world.lighting.sun;
  const shadow = sun?.shadow;
  let disposed = false;
  function showCasters() {
    if (disposed || !castersOn || !group.visible) return;
    for (const m of casterMeshes) m.visible = m.userData.cull.submitted > 0;
  }
  function hideCasters() { for (const m of casterMeshes) m.visible = false; }
  let shadowHooks = null;
  let onShadowPass = null;
  if (shadow && casterMeshes.length) {
    shadowHooks = shadow._forestShadowHooks;
    if (!shadowHooks) {
      shadowHooks = new Set();
      shadow._forestShadowHooks = shadowHooks;
      const before = shadow.updateMatrices;
      shadow.updateMatrices = function forestShadowPass(light, viewport) {
        before.call(this, light, viewport);
        for (const fn of shadowHooks) fn(light);
      };
    }
    onShadowPass = light => { if (light === sun) showCasters(); };
    shadowHooks.add(onShadowPass);
    for (const m of casterMeshes) {
      m.frustumCulled = false;
      m.onAfterShadow = (renderer, object) => { object.visible = false; };
    }
  }

  // Rebuild the index buffers when the view (main meshes) or the shadow focus (casters) moved: the main ones once the camera has
  // moved RECULL.move m or turned RECULL.turn (any way, a roll too) since. In between, the cull's margin holds the move and its
  // slack for the turn (batch.js cullBatches `turn`) the rest, so a far plant at the frame's edge is drawn while the camera turns slowly.
  const lastCam = new THREE.Vector3(Infinity, 0, 0), lastTurn = new THREE.Quaternion(), lastFocus = new THREE.Vector3(Infinity, 0, 0);
  const camNow = new THREE.Vector3(), turnNow = new THREE.Quaternion(), focusNow = new THREE.Vector3();
  const activePieces = [];
  let lastFov = 0, lastAspect = 0, lastRadius = 0;
  let submitted = 0, casterTris = 0;
  function cullIfMoved() {
    const cam = world.camera;
    camNow.setFromMatrixPosition(cam.matrixWorld);
    turnNow.setFromRotationMatrix(cam.matrixWorld);
    if (camNow.distanceTo(lastCam) > RECULL.move || turnNow.angleTo(lastTurn) > RECULL.turn || cam.fov !== lastFov || cam.aspect !== lastAspect) {
      submitted = cullBatches(meshes, cam, undefined, null, undefined, RECULL.turn);
      // the moss a tree at a time, the ground in pieces (while each is the geometry it cut: a place may swap its ground's for its own)
      activePieces.length = 0;
      for (const m of pieces) if (m.geometry === m.userData.cull.geometry) activePieces.push(m);
      cullBatches(activePieces, cam, undefined, null, undefined, RECULL.turn);
      lastCam.copy(camNow); lastTurn.copy(turnNow); lastFov = cam.fov; lastAspect = cam.aspect;
    }
    if (sun && sun.castShadow && casterMeshes.length) {
      focusNow.copy(sun.target.position);
      const radius = world.lighting.focusRadius ?? 10;
      if (focusNow.distanceTo(lastFocus) > 0.3 || radius !== lastRadius) {
        casterTris = cullCasters(casterMeshes, focusNow, radius, world.lighting.direction);
        lastFocus.copy(focusNow); lastRadius = radius;
      }
    }
  }

  function update(dt, time) {
    // actors: footprint capsules for grass and contact shade
    let n = 0;
    for (const actor of world.actors.values()) {
      if (n >= 4) break;
      const root = actor.root;
      if (!root || root.visible === false) continue;
      const heading = -root.rotation.y;
      actorUniforms.uActors.value[n].set(root.position.x, root.position.z, Math.cos(heading), Math.sin(heading));
      actorUniforms.uActorShape.value[n].set(fp.halfLength * (actor.footprintScale ?? 1), fp.radius * (actor.footprintScale ?? 1), fp.soft, 0);
      n++;
    }
    actorUniforms.uActorCount.value = n;
    hideCasters();
    world.camera.updateMatrixWorld();
    cullIfMoved();
    grass.update(world.camera);
    air.update(world.camera);
    life.update(dt, time ?? 0);
    water?.update(time ?? 0);
    water?.wade(world.actors.values()); // rings round the feet of whoever stands in the water
    for (const mist of mists) mist.update(time ?? 0);
  }

  return {
    group,
    info,
    /** The plants as planned, each with its model (a probe fits trunks and crowns from their geometry: engine/tree-probe.js). */
    placements: plan.placements,
    update,
    get stats() { return { submitted, casterTris }; },
    /** Strength of the warm light round characters (tools compare frames with it off). */
    get actorWarm() { return actorUniforms.uActorWarm.value; },
    set actorWarm(v) { actorUniforms.uActorWarm.value = v; },
    heightAt: terrain.heightAt,
    butterflies: air.butterflies,
    /** The Fen's water (world/props/water.js: surfaceAt, depthAt, rippleAt, bubblesAt), or null where there is none. */
    water,
    /** Ambient wildlife (world/forest/life.js: songbirds, lizards, turtles, frogs, dragonflies, flyers). */
    life,
    /** The place's low mists (world/props/mist.js: setLevel), in the layout's order. */
    mists,
    dispose() {
      disposed = true;
      hideCasters();
      if (shadowHooks && onShadowPass) shadowHooks.delete(onShadowPass);
      scene.remove(group);
      groundMesh.geometry.dispose();
      floor.material.dispose();
      floor.mask.tex.dispose();
      floor.mask.shade?.dispose();
      life.dispose();
      water?.dispose();
      moss?.dispose();
      farCards?.material.dispose();
      farCards?.atlas.dispose();
      for (const mist of mists) mist.dispose();
      for (const m of meshes) m.geometry.dispose();
      for (const m of casterMeshes) m.geometry.dispose();
      solid.dispose(); thin.dispose(); solidDepth.dispose(); thinDepth.dispose();
      grass.dispose();
      far.dispose();
      air.dispose();
      noiseTexture.dispose();
      leafTexture.dispose();
    },
  };
}
