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
import { createRiverSurface, createFallsSlot, createPoolSurface } from './river.js';
import { bankSteps, plantSteps } from './banks.js';
import { groundPaint, createGroundMaterial, createPlantMaterials } from './look.js';
import { createGorgeSight, ABOVE_SECTOR } from './sight.js';
import { createSpeciesLibrary } from '../forest/species.js';
import { cullBatches } from '../forest/batch.js';
import { createNoiseTexture, createLeafTexture } from '../forest/materials.js';
import { createWaterMaterial } from '../props/water.js';
import { FEN } from '../forest/config.js';

export const SIGHT = 100; // metres from the camera (seen from above) to a section's land (its route piece and the 160 m round it) within which it is shown
export const DOWNWASH = 8; // metres round her body within which the reeds and the plants bend away from her

/**
 * Build Árdalurinn. Options: grey (the stand-ins of chunk 1; otherwise the real look: look.js, the forest's plants, the game's
 * water), seed, route, budget(), now() (the build slices).
 */
export function createArdalur(world, { grey = false, seed = 4, route = createRoute(), budget = () => 3, now = () => performance.now() } = {}) {
  const terrain = createTerrain(route, { seed });
  const index = createRouteIndex(route);
  const sections = createSections(route);
  const lambert = colour => new THREE.MeshLambertMaterial({ color: colour });
  // the real look's shared things: the noise and leaf textures, the plants' materials, one species library, the river's water
  const real = grey ? null : (() => {
    const noise = createNoiseTexture(seed);
    const leaf = createLeafTexture(seed);
    return {
      noise, leaf, library: createSpeciesLibrary(seed), paint: groundPaint(terrain, route),
      plants: createPlantMaterials(world, { noise, leaf }), water: createWaterMaterial(world, { seed, river: true, noise }),
    };
  })();
  const materials = grey ? {
    ground: lambert(GREY.ground), water: lambert(GREY.water), rock: lambert(GREY.rock), plant: lambert(GREY.plant),
    falls: new THREE.MeshLambertMaterial({ color: GREY.falls, side: THREE.DoubleSide }), snag: lambert(GREY.snag), mark: lambert(GREY.mark), far: lambert(GREY.far),
  } : {
    ground: createGroundMaterial(real.noise), water: real.water.material,
    falls: new THREE.MeshLambertMaterial({ color: '#dfe9ec', side: THREE.DoubleSide }), snag: lambert(FEN.snag), mark: lambert(GREY.mark), far: lambert('#6f8a80'),
  };
  const group = new THREE.Group();
  group.name = 'Árdalur';
  world.scene?.add?.(group);

  // What is always there: the water, the falls' slot, the snag, the animal groups' marks, the far land's slot.
  const always = new THREE.Group();
  always.name = 'Árdalur (always)';
  always.add(createRiverSurface(route, materials.water), createFallsSlot(route.falls, materials.falls), createPoolSurface(route.pool, materials.water));
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
  const far = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 9, 1, true).translate(0, 0.5, 0), materials.far, 4);
  [[-2050, 100, 380, 320], [-1900, -350, 300, 260], [-1950, 550, 300, 240], [-1700, -650, 260, 200]].forEach(([x, z, r, h], i) => {
    far.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(r, h, r)));
  });
  far.name = 'Far land (slot)';
  far.computeBoundingSphere();
  marks.computeBoundingSphere();
  always.add(snag, marks, far);
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
  const hideAbove = (range, mesh) => mesh.userData.sector === ABOVE_SECTOR && sight.hidden(world.camera.position, range.sphere);
  const stats = { late: [], built: [], sections: parts };
  const queue = createBuildQueue({ budget, now });
  function* build(i) {
    const ground = yield* groundSteps(terrain, index, sections.list[i], materials.ground, real?.paint);
    const banks = grey
      ? yield* bankSteps({ terrain, index, route, ground, seed: seed * 1000 + i, materials })
      : yield* plantSteps({ terrain, index, route, ground, seed: seed * 1000 + i, library: real.library, materials: real.plants });
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
      // the plants in view, at the detail their distance calls for (world/forest/batch.js), but for those the gorge hides; her
      // downwash; the water's clock
      world.camera.updateMatrixWorld();
      const hide = sight.active(camera) ? hideAbove : null;
      for (const i of lastVisible) cullBatches(plantMeshes[i], world.camera, 1.5, hide);
      const her = world.flightU === null || world.flightU === undefined ? null : world.flightPoint ?? route.pointAt(world.flightU);
      if (her) downwash.set(her.x, her.y, her.z, DOWNWASH);
      else downwash.set(0, 0, 0, 0);
      real.water.uniforms.uTime.value = time;
      if (world.lighting?.direction) real.water.uniforms.uSunDir.value.copy(world.lighting.direction);
    }
    queue.tick();
  }

  return {
    group, route, terrain, sections, stats, materials, grey,
    /** Her downwash as the plants see it: her body (x, y, z) and how far round it they bend (w; 0 when she is not flying). */
    downwash,
    heightAt: (x, z) => terrain.heightAt(x, z),
    get visible() { return lastVisible; },
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
        real.plants.dispose();
        real.water.dispose();
        real.leaf.dispose();
      }
    },
  };
}
