// The forest system: layout in, forest out.
//
//   createForest(world, layout) -> { group, update(dt, time), heightAt(x, z), dispose() }
//
// layout = { seed, clearing: { center, radius }, forestEdge, path: [[x, z], ...] } from the chapter.
// Everything else (palette, densities, bands, wind weights) is in ./config.js. The pieces:
//   terrain.js     height function, ground masks, ground mesh and material
//   species.js     the species registry: procedural variants per kind
//   plan.js        placements from the layout (path, shots, actors, sun corridor)
//   batch.js       placed models baked into merged sector meshes
//   grass.js       blade grass with wind, distance LOD and actor footprints
//   far.js         the far treeline rings
//   atmosphere.js  light shafts and motes
import * as THREE from 'three';
import { FOREST } from './config.js';
import { createTerrain } from './terrain.js';
import { createSpeciesLibrary } from './species.js';
import { planForest } from './plan.js';
import { createBatcher, cullBatches, cullCasters } from './batch.js';
import { createGrass } from './grass.js';
import { createFarForest } from './far.js';
import { createAtmosphere } from './atmosphere.js';
import { createNoiseTexture, createLeafTexture, createSharedUniforms, createVegetationMaterial, createWindDepthMaterial } from './materials.js';

const BAND_SETUP = {
  // receiveShadow near the playable area; shadows come from the caster meshes (batch.js)
  clearing: { receive: true, order: 2 },
  edge: { receive: true, order: 3 },
  inner: { receive: false, order: 4 },
  deep: { receive: false, order: 5 },
};
// Kinds whose shadows matter; small plants cast none. The deep band casts nothing.
const CASTERS = new Set(['broadleaf', 'araucaria', 'treeFern', 'cycad', 'bush', 'rock', 'rockSmall', 'log']);

export async function createForest(world, layout) {
  const t0 = performance.now();
  const { scene, q } = world;
  const seed = (layout.seed ?? 1) >>> 0;
  const group = new THREE.Group();
  group.name = 'Forest';

  const noiseTexture = createNoiseTexture(seed);
  const leafTexture = createLeafTexture(seed);
  const shared = createSharedUniforms(world, noiseTexture, leafTexture);
  const actorUniforms = {
    uActors: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 0)) },
    uActorShape: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(1.3, 0.9, 0.8, 0)) },
    uActorCount: { value: 0 },
    uActorWarm: { value: FOREST.actorWarm }, // the lighter, warmer ground round characters
  };

  // ground
  const terrain = createTerrain(world, layout, seed);
  const library = createSpeciesLibrary(seed);
  const plan = planForest({ world, layout, seed, terrain, library, q });

  // canopy shade from the crowns round the clearing (their ground shadows along the sun)
  terrain.setCanopy(plan.placements.filter(p => (p.name === 'broadleaf' || p.name === 'araucaria') && p.model.crown && p.band !== 'deep').map(p => {
    const cr = p.model.crown, c = Math.cos(p.rot), s = Math.sin(p.rot);
    return {
      x: p.x + (cr.c[0] * c - cr.c[2] * s) * p.scale, y: p.y + cr.c[1] * p.scale, z: p.z + (cr.c[0] * s + cr.c[2] * c) * p.scale,
      r: cr.r * p.scale, density: p.name === 'araucaria' ? 0.6 : 0.9,
    };
  }), world.lighting.direction);
  const ground = terrain.createGroundMaterial(shared, actorUniforms); // after planning: soil stamps, canopy
  const groundMesh = new THREE.Mesh(terrain.buildGroundGeometry(q), ground.material);
  groundMesh.name = 'Forest ground';
  groundMesh.receiveShadow = true;
  groundMesh.renderOrder = 7;
  group.add(groundMesh);

  // vegetation, rocks and wood
  const low = q.name === 'low';
  const solid = createVegetationMaterial(shared, { side: THREE.FrontSide, key: 'forest-solid', low });
  const thin = createVegetationMaterial(shared, { side: THREE.DoubleSide, key: 'forest-thin', low });
  const solidDepth = createWindDepthMaterial(shared, 'forest-solid');
  const thinDepth = createWindDepthMaterial(shared, 'forest-thin');
  const batcher = createBatcher();
  for (const p of plan.placements) {
    batcher.add(p);
    if (CASTERS.has(p.name) && p.band !== 'deep' && !(low && p.band === 'inner')) batcher.addCaster(p);
  }
  const [ccx, ccz] = layout.clearing.center;
  const { meshes, casterMeshes } = batcher.build(bucket => {
    const s = BAND_SETUP[bucket.band];
    return { material: bucket.kind === 'thin' ? thin : solid, receiveShadow: s.receive, renderOrder: s.order };
  }, {
    order: p => Math.hypot(p.x - ccx, p.z - ccz),
    casterSetup: bucket => ({ material: solid, depthMaterial: bucket.kind === 'thin' ? thinDepth : solidDepth, renderOrder: 9 }),
  });
  for (const m of meshes) group.add(m);
  for (const m of casterMeshes) group.add(m);

  // grass
  const grass = createGrass(world, { terrain, layout, seed, shared, actorUniforms, blocked: plan.blocked, q });
  group.add(grass.group);

  // far forest and air
  const far = createFarForest({ layout, seed, terrain, q });
  group.add(far.mesh);
  const air = createAtmosphere(world, { layout, seed, terrain, shared, sun: world.lighting.direction, q });
  group.add(air.group);

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
    placementList: plan.placements.map(p => ({ name: p.name, lod: p.lod, x: p.x, z: p.z, scale: p.scale, tris: (p.model.solid ? p.model.solid.triangles : 0) + (p.model.thin ? p.model.thin.triangles : 0) })),
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
    dispose() {
      scene.remove(group);
      groundMesh.geometry.dispose();
      ground.material.dispose();
      ground.mask.tex.dispose();
      ground.mask.shade?.dispose();
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
