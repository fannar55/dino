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
import { bankSteps, plantSteps, outcropProps, LUSH, viewKeeper, FAR_CUT, propFarModel } from './banks.js';
import { beltSteps } from './belt.js';
import { groundPaint, createGroundMaterial, createPlantMaterials } from './look.js';
import { createGorgeSight, createHazeSight, ABOVE_SECTOR } from './sight.js';
import { createAnimals } from './animals.js';
import { createLife } from './life.js';
import { stillViews } from '../../engine/camera/flight-camera.js';
import { createCrowds } from '../critters/crowd.js';
import { createSpeciesLibrary } from '../forest/species.js';
import { cullBatches, cardReach, mergeCardMeshes, cullLayer } from '../forest/batch.js';
import { createNoiseTexture, createLeafTexture, leafMeanOf, createCardFade, setCardFade } from '../forest/materials.js';
import { createWaterMaterial, ringsUntil } from '../props/water.js';
import { createWaterfall } from '../props/waterfall.js';
import { createFarLand, createFarHaze, FAR } from './far-land.js';
import { FEN, FOREST } from '../forest/config.js';
import { CARDED, createCardAtlas, createCardMaterial } from '../forest/cards.js';

export const SIGHT = 100; // metres from the camera (seen from above) to a section's land (its route piece and the 160 m round it) within which it is shown
// ...and in the flight more than that: so far that each of its trees with a card is its card (batch.js cardReach) and its other
// plants nothing yet (their cut, banks.js FAR_CUT) when it comes, so its coming changes nothing seen (showReach)
export const DOWNWASH = 8; // metres round her body within which the reeds and the plants bend away from her

/**
 * Build Árdalurinn. Options: grey (the stand-ins of chunk 1; otherwise the real look: look.js, the forest's plants, the game's
 * water), seed, route, budget(), now() (the build slices), critters (loadCritters in animals.js: the small lizard, loaded first),
 * cardFrom (metres past which a tree is drawn as its card: world/forest/cards.js; settable on the place too).
 * `at` ([x, z], or a list of them) is for a chapter that stands in a spot or two of the valley and does not fly (chapter 5 at the far
 * pool; chapter 6 there and at the ford above the falls): only the sections whose land is within SIGHT of any of them are built, all
 * at once, none queued (its cameras stand near it: one that wanders off has the land
 * round it built when it comes, noted in stats.late), and they are shown with no flight (world.flightU
 * null: none wanted round the snag). `views` ({ position, looks }: Vector3s) are a still camera's lines of sight more, kept clear of
 * plants as the flight's are (banks.js VIEW), and `keep` ({ x, z, r }) spots where nothing grows: that chapter's own shots and spots.
 * `choir` is chapter 5's life at the pool (chapters/kafli5-pool.js POOL_LIFE: life.js createLife's `choir`), made with the valley.
 * `trees` are a chapter's own trees, standing in the valley as given where its rules let a tree stand, and `treeless` circles
 * ({ x, z, r }) where no tree of the valley's own grows (banks.js plantSteps; chapter 4: the white tree's patch round the snag);
 * stats.left lists those of `trees` that may not stand.
 */
export function createArdalur(world, { grey = false, seed = 4, route = createRoute(), budget = () => 3, now = () => performance.now(), critters = {}, cardFrom = FOREST.lod.cardFrom, at = null, views: moreViews = [], keep = [], choir = null, trees = [], treeless = [], lush = false } = {}) {
  // the lush valley (banks.js LUSH): chapter 4's flight; an object is LUSH with some of its parts changed (a probe's, a test's)
  const thick = lush && !grey ? (lush === true ? LUSH : { ...LUSH, ...lush }) : null;
  const spots = at === null ? null : typeof at[0] === 'number' ? [at] : at; // where a chapter that stands still stands
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
    // the band round cardFrom over which a far tree fades into its card: one uniform for the cards and the plants that fade (update)
    const cardFade = createCardFade();
    // the far land's haze: the trees' cards and the sections' ground fade into it as the far land does, while it shows (far-land.js)
    const haze = createFarHaze();
    return {
      noise, leaf, library, cardFade, haze, atlas: null, cards: null, paint: groundPaint(terrain, route), // (atlas, cards: once the props are known)
      plants: createPlantMaterials(world, { noise, leaf, cardFade }), water: createWaterMaterial(world, { seed, river: true, noise }),
    };
  })();
  if (real) real.water.uniforms.uRingsUntil.value = -1; // no ring yet: rippleAt keeps it
  const materials = grey ? {
    ground: lambert(GREY.ground), water: lambert(GREY.water), rock: lambert(GREY.rock), plant: lambert(GREY.plant),
    falls: new THREE.MeshLambertMaterial({ color: GREY.falls, side: THREE.DoubleSide }), snag: lambert(GREY.snag), mark: lambert(GREY.mark), far: lambert(GREY.far),
  } : {
    ground: createGroundMaterial(real.noise, { haze: real.haze }), water: real.water.material,
    falls: new THREE.MeshLambertMaterial({ color: '#dfe9ec', side: THREE.DoubleSide }), snag: lambert(FEN.snag), mark: lambert(GREY.mark),
  };
  const group = new THREE.Group();
  group.name = 'Árdalur';
  world.scene?.add?.(group);
  // the animal groups of C (animals.js), in the real look; the grey one has their marks. They are drawn as crowds (each kind of
  // critter in one draw call), begun and ended round them each frame; only those in view, or near enough to cast a shadow into it;
  // a soft shade under each on the ground where the sun's shadow map does not reach (crowd.js groundAt)
  const crowds = real ? createCrowds(world, { parent: group, inView: true, groundAt: (x, z) => terrain.heightAt(x, z) }) : null;
  const animals = real ? createAnimals(world, route, { heightAt: (x, z) => terrain.heightAt(x, z), library: real.library, crowds, critters }) : null;
  // the life nobody taps (life.js): the Fen's birds, the fish, the birds in the bank trees, the water striders, and the big call's
  // rows of small lizards and flocks of birds; in the same crowds
  const life = real ? createLife(world, route, { heightAt: (x, z) => terrain.heightAt(x, z), library: real.library, crowds, critters, choir }) : null;
  // every kind is reserved: their meshes now, with the valley, so the warm-up before the start button draws them (main.js getReady)
  crowds?.ready();
  // the far pool's beds of reed, and where nothing else grows by it (river.js): grown with the banks, as the animals' props are
  const pond = real ? poolPlants(route.pool, (x, z) => terrain.heightAt(x, z)) : null;
  // the land above the falls: its ponds' lilies and reed, its outcrops of rock, and nothing else in its water (river.js, banks.js)
  const upland = real ? landPlants(terrain.waters, (x, z) => terrain.heightAt(x, z)) : null;
  const outcrops = real ? outcropProps(route, (x, z) => terrain.heightAt(x, z)) : null;
  const props = real ? [...animals.props, ...life.props, ...pond.props, ...upland.props, ...outcrops.props] : [];
  const clear = real ? [...animals.clear, ...life.clear, ...pond.clear, ...upland.clear, ...outcrops.clear, ...keep] : [];
  // round each animal group, on its side of the river, only low plants grow (banks.js LOW): the child sees the animals over them
  const low = real ? animals.groups.map(g => ({ x: g.point.x, z: g.point.z, side: terrain.where(g.point.x, g.point.z).side })) : [];
  // the still shots' views, where nothing stands by the camera or on its line of sight (banks.js VIEW, spec 6)
  const views = real ? [...stillViews(route, { heightAt: (x, z) => terrain.heightAt(x, z) }), ...moreViews] : [];
  const keeper = thick?.belt ? viewKeeper(views) : null; // the belt's trees keep off the still shots' lines of sight too
  if (real) {
    // the far trees' pictures: every variant of the CARDED species as the library makes it, then the far shapes of the chapter's own
    // trees and of the props of those species (their shapes are their own); the cards' colours as the plants' material draws them far
    // off: their painted leaves at their far tone (none in the low preset)
    const entries = CARDED.flatMap(name => Array.from({ length: FOREST.trees.variants[name] }, (_, variant) => ({ name, variant, model: real.library.get(name, variant, 2, {}) })));
    const known = new Set(entries.map(e => e.model));
    const own = [...trees.map(t => ({ name: t.name, variant: t.variant, model: t.models.at(-1).model })),
      ...props.filter(p => CARDED.includes(p.name)).map(p => ({ name: p.name, variant: p.variant, model: propFarModel(real.library, p) }))];
    for (const e of own) {
      if (!CARDED.includes(e.name) || known.has(e.model)) continue;
      known.add(e.model);
      entries.push(e);
    }
    real.atlas = createCardAtlas(world.renderer ?? null, entries, { leafTone: world.q?.name === 'low' ? 1 : leafMeanOf(real.leaf) });
    real.cards = createCardMaterial(real.atlas, { coverage: Boolean(world.q?.antialias), fade: real.cardFade, haze: real.haze });
  }
  const crest = Math.floor(route.progressAt(FAR.from) * index.count); // her path's sample at the crest of E, where the far land shows

  // What is always there: the water, the falls (a slot in grey, the falling water, spray, rainbow and foam in the real look:
  // world/props/waterfall.js), the snag, the animal groups' marks (grey only), and the far land's slot in grey (the real look has
  // the far land itself, far-land.js, which the flight shows from the crest of E).
  const farLand = real ? createFarLand(world, route, { terrain, seed, haze: real.haze }) : null;
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
  // the flight's reach: past it every tree of a section is its card (5 m to spare: a tree stands in its section's land, its mid-height
  // over it) and its other plants nothing (10 m to spare); a chapter that stands still (`at`), or one with no cards, keeps SIGHT
  const showReach = () => (at || !real || !Number.isFinite(cardFrom) ? SIGHT : Math.max(SIGHT, cardReach(cardFrom) + 5, FAR_CUT + 10));
  const reach0 = showReach();
  const needed = sections.list.map(() => Infinity);
  const p = new THREE.Vector3();
  for (let t = 0; t <= BEATS.END; t += 1) {
    const u = route.progressAt(t);
    route.pointAt(u, p);
    for (const i of [...sections.wanted(u), ...nearTo(p.x, p.z, reach0 + 120)]) needed[i] = Math.min(needed[i], t);
  }

  const parts = sections.list.map(() => null); // each section's group once built
  const plantMeshes = sections.list.map(() => []); // each section's merged plant meshes (the real look), culled as the camera moves
  const groundMeshes = sections.list.map(() => null); // and its ground, culled by its 40 m tiles (terrain.js TILE)
  const belts = sections.list.map(() => null); // the lush valley's forest on the horizon (belt.js), each section's piece
  // from down in the gorge the ground hides most plants above the falls: the cull leaves those out (sight.js)
  const sight = real ? createGorgeSight(route, terrain, index) : null;
  const hideAbove = (range, mesh) => (range.sector ?? mesh.userData.sector) === ABOVE_SECTOR && sight.hidden(world.camera.position, range.sphere);
  // low over the fen the far plants deep in the haze are left out too (sight.js)
  const haze = real ? createHazeSight(world) : null;
  const hideHazed = (range, mesh) => mesh.userData.band === 'far' && haze.hidden(world.camera.position, range.sphere);
  const hideBoth = (range, mesh) => hideHazed(range, mesh) || hideAbove(range, mesh);
  const stats = { late: [], built: [], sections: parts, left: [], belts };
  // The far layer (batch.js mergeCardMeshes): every built section's cards in one mesh, one draw call, which draws the cards of the
  // sections not shown while the far land stands under them (from the crest of E: far-land.js), fogged and lit as theirs (their very
  // material). A section comes into reach with its trees all cards, so it takes over from the layer with nothing seen to change, then
  // each tree turns into its mesh over the band (batch.js CARD_BAND). Remade when a section is built, once the queue is done (or the
  // far land shows); none in a chapter that stands still (`at`).
  const layer = { mesh: null, dirty: false };
  function remakeLayer() {
    layer.dirty = false;
    const own = parts.map((part, i) => ({ part: i, mesh: plantMeshes[i].find(m => m.userData.cards && !m.userData.belt) })).filter(p => p.mesh);
    const made = mergeCardMeshes(own, { material: real.cards, renderOrder: 3, into: layer.mesh });
    if (made && !layer.mesh) group.add(made);
    layer.mesh = made;
  }
  const queue = createBuildQueue({ budget, now });
  function* build(i) {
    const ground = yield* groundSteps(terrain, index, sections.list[i], materials.ground, real?.paint);
    const banks = grey
      ? yield* bankSteps({ terrain, index, route, ground, seed: seed * 1000 + i, materials })
      : yield* plantSteps({
        terrain, index, route, ground, seed: seed * 1000 + i, library: real.library, materials: real.plants, props, clear, low, views,
        atlas: real.atlas, cards: real.cards, grove: seed, trees, treeless, lush: thick,
      });
    // (a section the flight first comes to after the crest of E has none: the far land is the horizon by then)
    const belt = thick?.belt && ground.samples[0] < crest
      ? yield* beltSteps({
        terrain, index, route, samples: ground.samples, seed: seed * 1000 + i + 500, paint: real.paint, groundMaterial: materials.ground,
        atlas: real.atlas, cardMaterial: real.cards, inView: keeper, belt: thick.belt, grove: seed,
      })
      : null;
    return { ground, banks, belt };
  }
  const done = i => ({ ground, banks, belt }) => {
    const part = new THREE.Group();
    part.name = `Árdalur section ${i}`;
    part.add(ground.mesh, banks.group);
    part.userData.placements = banks.placements ?? [];
    stats.left.push(...(banks.left ?? []));
    plantMeshes[i] = banks.meshes ?? [];
    if (belt?.group) {
      part.add(belt.group);
      if (belt.cards) plantMeshes[i] = [...plantMeshes[i], belt.cards]; // culled with the plants (the frustum, the haze)
      belts[i] = belt;
    }
    groundMeshes[i] = ground.mesh;
    // after the plants (3): from above, the crowns cover much of it, and early depth testing then skips the ground under them
    ground.mesh.renderOrder = 4;
    part.visible = false;
    parts[i] = part;
    group.add(part);
    sections.list[i].built = true;
    stats.built.push(i);
    layer.dirty = true;
    if (real && !at && !queue.busy) remakeLayer(); // the last section built: the layer is there before the first frame draws
  };
  const order = (a, b) => needed[a] - needed[b] || a - b;
  // Round the snag at once; the rest a slice at a time, soonest needed first. A chapter that stands at `at`: the land round it at once,
  // and nothing more.
  const first = spots ? new Set(spots.flatMap(([x, z]) => nearTo(x, z))) : new Set([...sections.wanted(0), ...nearTo(route.tree[0], route.tree[2], reach0)]);
  for (const i of [...first].sort(order)) finish({ steps: build(i), done: done(i) });
  if (!spots) for (const i of sections.list.map(s => s.index).filter(i => !first.has(i)).sort(order)) queue.add(i, build(i), done(i));

  let lastVisible = [];
  const downwash = real ? real.plants.downwash : new THREE.Vector4();
  function update(dt, time = 0) {
    // no flight where the chapter stands still (`at`): only what the camera is near is wanted
    const u = at && (world.flightU === null || world.flightU === undefined) ? null : world.flightU ?? 0;
    const camera = world.camera?.position;
    const near = camera ? nearTo(camera.x, camera.z, showReach()) : [];
    for (const i of new Set([...(u === null ? [] : sections.wanted(u)), ...near])) {
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
      // the belt is the horizon below the falls until the far land shows (from the crest of E), which stands in for it then
      const t = world.flightTime ?? -1;
      const farOn = farLand.shown && t >= FAR.from && t < FAR.to;
      for (const i of lastVisible) if (belts[i]) belts[i].group.visible = !farOn;
      setCardFade(real.cardFade, cardFrom); // the shaders fade a tree into its card over the band the cull draws both in
      for (const i of lastVisible) cullBatches(plantMeshes[i], world.camera, 1.5, hide, cardFrom);
      // the far layer: the cards of the sections not shown, while the far land stands under them
      if (!at && layer.dirty && (farOn || !queue.busy)) remakeLayer();
      if (layer.mesh) {
        if (farOn) {
          const shown = new Set(lastVisible);
          cullLayer(layer.mesh, world.camera, { margin: 1.5, keep: r => !shown.has(r.part), hide });
        } else layer.mesh.visible = false;
      }
      // the ground's tiles in view (only the frustum: the ground is what hides the rest)
      cullBatches(lastVisible.map(i => groundMeshes[i]).filter(Boolean), world.camera, 2);
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
    real.water.uniforms.uRingsUntil.value = ringsUntil(rings); // until then the river's shader goes through its rings
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
    /** The sections whose land is within `reach` metres of (x, z), seen from above. */
    near: (x, z, reach = SIGHT) => nearTo(x, z, reach),
    get visible() { return lastVisible; },
    /** The far layer: the cards of the sections not shown, one mesh (null till the first frame after the build, and where it stands still). */
    get farCards() { return layer.mesh; },
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
