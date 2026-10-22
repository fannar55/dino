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
//   plants  [{ name, position: [x, z], scale, variant, rot }]: plants the chapter places itself, first and where it says
//   mist    [{ center, radius, height, level }]: low mist over the place (world/props/mist.js), `forest.mists` in order
//   farFriends, lookout  where the friends far out in the Fen are and the point they are seen from: tall plants keep out of
//           the lines between them
//   mossClear [{ center: [x, z], radius }]: no hanging moss from inside these discs (moss.js), the plan unchanged
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
import { createHangingMoss } from './moss.js';
import { smoothstep, clamp } from './random.js';
import { createNoiseTextureSteps, createLeafTextureSteps, createSharedUniforms, createVegetationMaterial, createWindDepthMaterial } from './materials.js';
import { runSync, runSliced } from './slices.js';
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
 * the trunk ends (top) and how thick it is there (trunk). A chapter places things by plants with it (kafli1's flowers).
 */
export function placementInfo(p) {
  const { model, scale } = p;
  return {
    name: p.name, lod: p.lod, x: p.x, y: p.y, z: p.z, scale,
    tris: (model.solid ? model.solid.triangles : 0) + (model.thin ? model.thin.triangles : 0),
    radius: model.radius * scale, height: model.height * scale,
    top: model.trunk ? model.trunk.top * scale : null, trunk: model.trunk ? model.trunk.r * scale : null,
  };
}

/**
 * A forest for `layout` (see the top of this file), built at once, or with `slice` ({ budget, wait, onSlice }: slices.js runSliced)
 * a slice at a time over frames, so that it can be built while the child watches. Either way it resolves to the same forest.
 */
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

  const noiseTexture = yield* createNoiseTextureSteps(seed);
  yield 'noise';
  const leafTexture = yield* createLeafTextureSteps(seed);
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
  yield 'ground material';
  const groundMesh = new THREE.Mesh(yield* terrain.buildGroundGeometrySteps(q), floor.material);
  yield 'ground';
  groundMesh.name = 'Forest ground';
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
  const thinDepth = createWindDepthMaterial(shared, 'forest-thin');
  const batcher = createBatcher();
  for (const p of plan.placements) {
    batcher.add(p);
    if (CASTERS.has(p.name) && p.band !== 'deep' && !(low && p.band === 'inner')) batcher.addCaster(p);
  }
  const [ccx, ccz] = layout.clearing.center;
  yield 'batched';
  const { meshes, casterMeshes } = yield* batcher.buildSteps(bucket => {
    const s = BAND_SETUP[bucket.band];
    return { material: bucket.kind === 'thin' ? thin : solid, receiveShadow: s.receive, renderOrder: s.order };
  }, {
    order: p => Math.hypot(p.x - ccx, p.z - ccz),
    casterSetup: bucket => ({ material: solid, depthMaterial: bucket.kind === 'thin' ? thinDepth : solidDepth, renderOrder: 9 }),
  });
  for (const m of meshes) group.add(m);
  for (const m of casterMeshes) group.add(m);

  yield 'plants';
  // grass
  const grass = yield* createGrassSteps(world, { terrain, layout, seed, shared, actorUniforms, blocked: plan.blocked, q });
  group.add(grass.group);
  yield 'grass';

  // far forest and air; the Fen's treeline stands well out, so the Fen opens to it
  const far = yield* createFarForestSteps({ layout, seed, terrain, q, rings: terrain.biome.fen ? FEN.far.rings : FOREST.far.rings });
  group.add(far.mesh);
  yield 'far';
  const air = createAtmosphere(world, { layout, seed, terrain, shared, sun: world.lighting.direction, q });
  group.add(air.group);
  yield 'air';

  // the Fen's water, the moss hanging from its conifers, and the mist low over it
  const water = layout.water
    ? yield* createWaterSteps(world, layout.water, terrain.heightAt, { spots: waterSpots(plan.placements, ground.water), seed, centre: layout.clearing.center })
    : null;
  if (water) group.add(water.group);
  yield 'water';
  // moss hangs only where it can be seen, on the conifers within MOSS_REACH m of the clearing
  const moss = createHangingMoss(world, plan.placements.filter(p => Math.hypot(p.x - ccx, p.z - ccz) < MOSS_REACH), shared, {
    antialias: q.antialias, seed, clear: layout.mossClear ?? [],
  });
  if (moss) group.add(moss.mesh);
  yield 'moss';
  // the mist lies over the water where there is any, its cards standing on the surface
  const mists = (layout.mist ?? []).map((spec, i) => createMist(world, {
    ...spec, seed: seed + i,
    heightAt: ground.water ? (x, z) => layout.water.surfaceAt(x, z) ?? terrain.heightAt(x, z) : terrain.heightAt,
    over: ground.water ? mistPoints(ground.water, spec.center, spec.radius, layout.actors) : null,
  }));
  for (const mist of mists) group.add(mist.group);

  scene.add(group);

  const fp = FOREST.grass.footprint;
  const info = {
    buildMs: Math.round(performance.now() - t0),
    placements: plan.stats.counts,
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
    mistCards: mists.reduce((n, m) => n + m.cards, 0),
    placementList: plan.placements.map(placementInfo),
  };
  if (world.params?.get?.('debug') === '1') console.info('[forest]', info);

  // Profiling aid: ?forestOff=grass,trees,ground,far,air,shadows hides parts of the forest.
  const off = new Set((world.params?.get?.('forestOff') || '').split(',').filter(Boolean));
  if (off.has('grass')) grass.group.visible = false;
  if (off.has('trees')) for (const m of meshes) m.userData.hidden = true;
  if (off.has('ground')) groundMesh.visible = false;
  if (off.has('far')) far.mesh.visible = false;
  if (off.has('air')) air.group.visible = false;
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
  const updateShadowMatrices = shadow ? shadow.updateMatrices.bind(shadow) : null;
  function showCasters() {
    if (!castersOn || !group.visible) return;
    for (const m of casterMeshes) m.visible = m.userData.cull.submitted > 0;
  }
  function hideCasters() { for (const m of casterMeshes) m.visible = false; }
  if (shadow && casterMeshes.length) {
    shadow.updateMatrices = function forestShadowPass(light, viewport) {
      updateShadowMatrices(light, viewport);
      if (light === sun) showCasters();
    };
    for (const m of casterMeshes) {
      m.frustumCulled = false;
      m.onAfterShadow = (renderer, object) => { object.visible = false; };
    }
  }

  // Rebuild the index buffers when the view (main meshes) or the shadow focus (casters) moved.
  const lastCam = new THREE.Vector3(Infinity, 0, 0), lastDir = new THREE.Vector3(), lastFocus = new THREE.Vector3(Infinity, 0, 0);
  const camNow = new THREE.Vector3(), dirNow = new THREE.Vector3(), focusNow = new THREE.Vector3();
  let lastFov = 0, lastRadius = 0;
  let submitted = 0, casterTris = 0;
  function cullIfMoved() {
    const cam = world.camera;
    camNow.setFromMatrixPosition(cam.matrixWorld);
    dirNow.set(0, 0, -1).transformDirection(cam.matrixWorld);
    if (camNow.distanceTo(lastCam) > 0.4 || dirNow.dot(lastDir) < 0.99966 || cam.fov !== lastFov) {
      submitted = cullBatches(meshes, cam);
      lastCam.copy(camNow); lastDir.copy(dirNow); lastFov = cam.fov;
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
      if (!root) continue;
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
    water?.update(time ?? 0);
    water?.wade(world.actors.values()); // rings round the feet of whoever stands in the water
    for (const mist of mists) mist.update(time ?? 0);
  }

  return {
    group,
    info,
    update,
    get stats() { return { submitted, casterTris }; },
    /** Strength of the warm light round characters (tools compare frames with it off). */
    get actorWarm() { return actorUniforms.uActorWarm.value; },
    set actorWarm(v) { actorUniforms.uActorWarm.value = v; },
    heightAt: terrain.heightAt,
    butterflies: air.butterflies,
    /** The Fen's water (world/props/water.js: surfaceAt, depthAt, rippleAt, bubblesAt), or null where there is none. */
    water,
    /** The place's low mists (world/props/mist.js: setLevel), in the layout's order. */
    mists,
    dispose() {
      scene.remove(group);
      groundMesh.geometry.dispose();
      floor.material.dispose();
      floor.mask.tex.dispose();
      floor.mask.shade?.dispose();
      water?.dispose();
      moss?.dispose();
      for (const mist of mists) mist.dispose();
      for (const m of meshes) m.geometry.dispose();
      for (const m of casterMeshes) m.geometry.dispose();
      if (shadow && updateShadowMatrices) shadow.updateMatrices = updateShadowMatrices;
      solid.dispose(); thin.dispose(); solidDepth.dispose(); thinDepth.dispose();
      grass.dispose();
      far.dispose();
      air.dispose();
      noiseTexture.dispose();
      leafTexture.dispose();
    },
  };
}
