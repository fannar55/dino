// Árdalurinn, the river valley of chapter 4's flight, as a place a chapter's location builds (engine/locations.js: `build`):
//
//   locations: { ardalur: { build: world => createArdalur(world, { grey: true }), shots } }
//
// It stands where a forest would (world.forest): `group`, `heightAt(x, z)` and `update(dt, time)`, which main.js calls each frame
// after the camera has moved. The land is in 150 m sections along the route (sections.js). Those round the snag are built at once;
// the rest are built a slice a frame (3 ms) in the order the flight needs them, worked out from the route's schedule: a section is
// needed from the first second the flight comes within sight of it. A section is shown while it is near her (one behind, two ahead,
// at world.flightU) or its land is within SIGHT of the camera, so a fixed shot away from her still has its ground. A section that is wanted
// before it is built (a seek) is built at once, and noted in `stats.late`.
import * as THREE from 'three';
import { createRoute, BEATS } from '../../chapters/kafli4-route.js';
import { createSections, createBuildQueue, finish } from './sections.js';
import { createTerrain, createRouteIndex, groundSteps, CORRIDOR, GREY } from './terrain.js';
import { createRiverSurface, createFallsSlot, createPoolSurface, poolPlants, landPlants, createLandWaters } from './river.js';
import { bankSteps, plantSteps, outcropProps } from './banks.js';
import { groundPaint, createGroundMaterial, createPlantMaterials } from './look.js';
import { createGorgeSight, createHazeSight, ABOVE_SECTOR } from './sight.js';
import { createAnimals } from './animals.js';
import { createLife } from './life.js';
import { stillViews } from '../../engine/camera/flight-camera.js';
import { createCrowds } from '../critters/crowd.js';
import { createSpeciesLibrary } from '../forest/species.js';
import { cullBatches } from '../forest/batch.js';
import { createNoiseTexture, createLeafTexture } from '../forest/materials.js';
import { createWaterMaterial } from '../props/water.js';
import { createWaterfall } from '../props/waterfall.js';
import { createFarLand } from './far-land.js';
import { FEN, FOREST } from '../forest/config.js';
import { CARDED, createCardAtlas, createCardMaterial } from '../forest/cards.js';

export const SIGHT = 100; // metres from the camera (seen from above) to a section's land (its route piece and the 160 m round it) within which it is shown
export const DOWNWASH = 8; // metres round her body within which the reeds and the plants bend away from her

/**
 * Build Árdalurinn. Options: grey (the stand-ins of chunk 1; otherwise the real look: look.js, the forest's plants, the game's
 * water), seed, route, budget(), now() (the build slices), critters (loadCritters in animals.js: the small lizard, loaded first),
 * cardFrom (metres past which a tree is drawn as its card: world/forest/cards.js; settable on the place too).
 */
export function createArdalur(world, { grey = false, seed = 4, route = createRoute(), budget = () => 3, now = () => performance.now(), critters = {}, cardFrom = FOREST.lod.cardFrom } = {}) {
  const terrain = createTerrain(route, { seed });
  const index = createRouteIndex(route);
  const sections = createSections(route);
  const lambert = colour => new THREE.MeshLambertMaterial({ color: colour });
  // the real look's shared things: the noise and leaf textures, the plants' materials, one species library, the river's water, the
  // far trees' pictures (one atlas of every variant's coarse shape, the shape the meshes draw far off) and their material
  const real = grey ? null : (() => {
    const noise = createNoiseTexture(seed);
    const leaf = createLeafTexture(seed);
    const library = createSpeciesLibrary(seed);
    const atlas = createCardAtlas(world.renderer ?? null, CARDED.flatMap(name => Array.from({ length: FOREST.trees.variants[name] },
      (_, variant) => ({ name, variant, model: library.get(name, variant, 2, {}) }))));
    return {
      noise, leaf, library, atlas, cards: createCardMaterial(atlas), paint: groundPaint(terrain, route),
      plants: createPlantMaterials(world, { noise, leaf }), water: createWaterMaterial(world, { seed, river: true, noise }),
    };
  })();
  const materials = grey ? {
    ground: lambert(GREY.ground), water: lambert(GREY.water), rock: lambert(GREY.rock), plant: lambert(GREY.plant),
    falls: new THREE.MeshLambertMaterial({ color: GREY.falls, side: THREE.DoubleSide }), snag: lambert(GREY.snag), mark: lambert(GREY.mark), far: lambert(GREY.far),
  } : {
    ground: createGroundMaterial(real.noise), water: real.water.material,
    falls: new THREE.MeshLambertMaterial({ color: '#dfe9ec', side: THREE.DoubleSide }), snag: lambert(FEN.snag), mark: lambert(GREY.mark),
  };
  const group = new THREE.Group();
  group.name = 'Árdalur';
  world.scene?.add?.(group);
  // the animal groups of C (animals.js), in the real look; the grey one has their marks. They are drawn as crowds (each kind of
  // critter in one draw call), begun and ended round them each frame.
  const crowds = real ? createCrowds(world, { parent: group }) : null;
  const animals = real ? createAnimals(world, route, { heightAt: (x, z) => terrain.heightAt(x, z), library: real.library, crowds, critters }) : null;
  // the life nobody taps (life.js): the Fen's birds, the fish, the birds in the bank trees, the water striders; in the same crowds
  const life = real ? createLife(world, route, { heightAt: (x, z) => terrain.heightAt(x, z), library: real.library, crowds }) : null;
  // the far pool's beds of reed, and where nothing else grows by it (river.js): grown with the banks, as the animals' props are
  const pond = real ? poolPlants(route.pool, (x, z) => terrain.heightAt(x, z)) : null;
  // the land above the falls: its ponds' lilies and reed, its outcrops of rock, and nothing else in its water (river.js, banks.js)
  const upland = real ? landPlants(terrain.waters, (x, z) => terrain.heightAt(x, z)) : null;
  const outcrops = real ? outcropProps(route, (x, z) => terrain.heightAt(x, z)) : null;
  const props = real ? [...animals.props, ...life.props, ...pond.props, ...upland.props, ...outcrops.props] : [];
  const clear = real ? [...animals.clear, ...life.clear, ...pond.clear, ...upland.clear, ...outcrops.clear] : [];
  // round each animal group, on its side of the river, only low plants grow (banks.js LOW): the child sees the animals over them
  const low = real ? animals.groups.map(g => ({ x: g.point.x, z: g.point.z, side: terrain.where(g.point.x, g.point.z).side })) : [];
  // the still shots' views, where nothing stands by the camera or on its line of sight (banks.js VIEW, spec 6)
  const views = real ? stillViews(route, { heightAt: (x, z) => terrain.heightAt(x, z) }) : [];

  // What is always there: the water, the falls (a slot in grey, the falling water, spray, rainbow and foam in the real look:
  // world/props/waterfall.js), the snag, the animal groups' marks (grey only), and the far land's slot in grey (the real look has
  // the far land itself, far-land.js, which the flight shows from the crest of E).
  const farLand = real ? createFarLand(world, route, { terrain, seed }) : null;
  if (farLand) group.add(farLand.group);
  const always = new THREE.Group();
  always.name = 'Árdalur (always)';
  always.add(createRiverSurface(route, materials.water), createPoolSurface(route.pool, materials.water));
  const landWaters = createLandWaters(terrain.waters, materials.water);
  if (landWaters) always.add(landWaters);
  const { falls } = route;
  const waterfall = real
    ? createWaterfall(world, { top: [falls.face, falls.top, falls.z], bottom: [falls.face, falls.base, falls.z], width: falls.width, seed })
    : null;
  if (waterfall) group.add(waterfall.group);
  else always.add(createFallsSlot(falls, materials.falls));
  const foot = terrain.heightAt(route.tree[0], route.tree[2]) - 0.5;
  const snag = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, route.tree[1] - foot, 8), materials.snag);
  snag.position.set(route.tree[0], (route.tree[1] + foot) / 2, route.tree[2]);
  snag.name = 'White snag (grey)';
  snag.castShadow = true;
  const marks = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), materials.mark, route.groups.length);
  const m = new THREE.Matrix4();
  route.groups.forEach((g, i) => {
    const r = g.kind === 'dragonflies' ? 0.6 : 1.2;
    marks.setMatrixAt(i, m.compose(new THREE.Vector3(...g.at), new THREE.Quaternion(), new THREE.Vector3(r, r, r)));
  });
  marks.name = 'Animal groups (marks)';
  marks.computeBoundingSphere();
  always.add(snag);
  if (grey) {
    const far = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 9, 1, true).translate(0, 0.5, 0), materials.far, 4);
    [[-2050, 100, 380, 320], [-1900, -350, 300, 260], [-1950, 550, 300, 240], [-1700, -650, 260, 200]].forEach(([x, z, r, h], i) => {
      far.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(r, h, r)));
    });
    far.name = 'Far land (slot)';
    far.computeBoundingSphere();
    always.add(far);
  }
  if (!animals) always.add(marks);
  else marks.geometry.dispose();
  group.add(always);

  // Each section's bounds seen from above (its route piece and the corridor round it), and when the flight first needs it.
  const bounds = sections.list.map(({ from, to }) => {
    const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (let k = Math.floor(from * index.count); k <= Math.min(index.count, Math.ceil(to * index.count)); k++) {
      const p = index.points[k];
      b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
    }
    b.minX -= CORRIDOR; b.maxX += CORRIDOR; b.minZ -= CORRIDOR; b.maxZ += CORRIDOR;
    return b;
  });
  const away = (b, x, z) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
  const nearTo = (x, z, reach = SIGHT) => sections.list.filter((_, i) => away(bounds[i], x, z) < reach).map(s => s.index);
  const needed = sections.list.map(() => Infinity);
  const p = new THREE.Vector3();
  for (let t = 0; t <= BEATS.END; t += 1) {
    const u = route.progressAt(t);
    route.pointAt(u, p);
    for (const i of [...sections.wanted(u), ...nearTo(p.x, p.z, SIGHT + 120)]) needed[i] = Math.min(needed[i], t);
  }

  const parts = sections.list.map(() => null); // each section's group once built
  const plantMeshes = sections.list.map(() => []); // each section's merged plant meshes (the real look), culled as the camera moves
  // from down in the gorge the ground hides most plants above the falls: the cull leaves those out (sight.js)
  const sight = real ? createGorgeSight(route, terrain, index) : null;
  const hideAbove = (range, mesh) => (range.sector ?? mesh.userData.sector) === ABOVE_SECTOR && sight.hidden(world.camera.position, range.sphere);
  // low over the fen the far plants deep in the haze are left out too (sight.js)
  const haze = real ? createHazeSight(world) : null;
  const hideHazed = (range, mesh) => mesh.userData.band === 'far' && haze.hidden(world.camera.position, range.sphere);
  const hideBoth = (range, mesh) => hideHazed(range, mesh) || hideAbove(range, mesh);
  const stats = { late: [], built: [], sections: parts };
  const queue = createBuildQueue({ budget, now });
  function* build(i) {
    const ground = yield* groundSteps(terrain, index, sections.list[i], materials.ground, real?.paint);
    const banks = grey
      ? yield* bankSteps({ terrain, index, route, ground, seed: seed * 1000 + i, materials })
      : yield* plantSteps({
        terrain, index, route, ground, seed: seed * 1000 + i, library: real.library, materials: real.plants, props, clear, low, views,
        atlas: real.atlas, cards: real.cards, grove: seed,
      });
    return { ground, banks };
  }
  const done = i => ({ ground, banks }) => {
    const part = new THREE.Group();
    part.name = `Árdalur section ${i}`;
    part.add(ground.mesh, banks.group);
    part.userData.placements = banks.placements ?? [];
    plantMeshes[i] = banks.meshes ?? [];
    part.visible = false;
    parts[i] = part;
    group.add(part);
    sections.list[i].built = true;
    stats.built.push(i);
  };
  const order = (a, b) => needed[a] - needed[b] || a - b;
  // Round the snag at once; the rest a slice at a time, soonest needed first.
  const first = new Set([...sections.wanted(0), ...nearTo(route.tree[0], route.tree[2])]);
  for (const i of [...first].sort(order)) finish({ steps: build(i), done: done(i) });
  for (const i of sections.list.map(s => s.index).filter(i => !first.has(i)).sort(order)) queue.add(i, build(i), done(i));

  let lastVisible = [];
  const downwash = real ? real.plants.downwash : new THREE.Vector4();
  function update(dt, time = 0) {
    const u = world.flightU ?? 0;
    const camera = world.camera?.position;
    const near = camera ? nearTo(camera.x, camera.z) : [];
    for (const i of new Set([...sections.wanted(u), ...near])) {
      if (sections.list[i].built) continue;
      const job = queue.take(i);
      if (job) finish(job);
      stats.late.push({ index: i, u });
    }
    lastVisible = sections.update(u, near);
    parts.forEach((part, i) => { if (part) part.visible = sections.list[i].visible; });
    if (real) {
      // the plants in view, at the detail their distance calls for (world/forest/batch.js), but for those the gorge or the haze hides; her
      // downwash; the water's clock
      world.camera.updateMatrixWorld();
      const hide = sight.active(camera) ? hideBoth : hideHazed;
      for (const i of lastVisible) cullBatches(plantMeshes[i], world.camera, 1.5, hide, cardFrom);
      const her = world.flightU === null || world.flightU === undefined ? null : world.flightPoint ?? route.pointAt(world.flightU);
      if (her) downwash.set(her.x, her.y, her.z, DOWNWASH);
      else downwash.set(0, 0, 0, 0);
      crowds.begin(world.camera ?? null);
      animals.update(dt, time);
      life.update(dt, time);
      crowds.end();
      waterfall.update(time, world.lighting?.direction); // drawn whenever in view: its top stands high, where the haze is thin
      // the far land at the flight's time (chapters/kafli4-flight.js sets it), every frame the page draws, a capture's still too
      farLand.update(world.flightTime ?? -1, world.camera);
      real.water.uniforms.uTime.value = time;
      if (world.lighting?.direction) real.water.uniforms.uSunDir.value.copy(world.lighting.direction);
    }
    queue.tick();
  }

  // Rings in the river where she skims it (chapters/kafli4-flight-play.js), on the water's clock: the oldest ring makes way for the newest
  let ring = 0;
  function rippleAt(x, z, strength = 1) {
    if (!real) return;
    const rings = real.water.uniforms.uRipples.value;
    rings[ring].set(x, z, real.water.uniforms.uTime.value, strength);
    ring = (ring + 1) % rings.length;
  }

  return {
    group, route, terrain, sections, stats, materials, grey, rippleAt,
    /** Her downwash as the plants see it: her body (x, y, z) and how far round it they bend (w; 0 when she is not flying). */
    downwash,
    /** The animal groups (animals.js), in the real look; null in the grey one. */
    animals,
    /** The life nobody taps (life.js), in the real look; null in the grey one. skim(x, z) where she touches the water. */
    life,
    /** The falls (world/props/waterfall.js), in the real look; null in the grey one (a slot). */
    waterfall,
    /** The land round the valley (far-land.js), in the real look; null in the grey one (a slot). */
    farLand,
    heightAt: (x, z) => terrain.heightAt(x, z),
    get visible() { return lastVisible; },
    /** Metres past which a tree is drawn as its card (Infinity: never). */
    get cardFrom() { return cardFrom; },
    set cardFrom(metres) { cardFrom = metres; },
    get building() { return queue.current; },
    /** Each frame (main.js calls a place's update as it does a forest's): show the near sections and build a slice. */
    update,
    /** Build every section now (a capture or a test that jumps about). */
    buildAll() { for (const i of sections.list.map(s => s.index)) { const job = queue.take(i); if (job) finish(job); } },
    dispose() {
      group.removeFromParent();
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      for (const material of Object.values(materials)) material.dispose();
      if (real) {
        farLand.dispose();
        waterfall.dispose();
        animals.dispose();
        life.dispose();
        crowds.dispose();
        real.plants.dispose();
        real.water.dispose();
        real.leaf.dispose();
        real.cards.dispose();
        real.atlas.dispose();
      }
    },
  };
}
