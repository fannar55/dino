import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chapter } from '../chapters/kafli2.js';
import { createWater, createWaterMaterial, waterShape } from '../world/props/water.js';
import { createMudPrints } from '../world/props/mud-prints.js';
import { createBerryBushes } from '../world/props/berries.js';
import { createClock } from '../engine/clock.js';
import { createEffects } from '../engine/effects.js';
import { createPointResolver } from '../engine/points.js';
import { createMist, CARDS } from '../world/props/mist.js';
import { createForest, shapeGround } from '../world/forest/forest.js';
import { planForest } from '../world/forest/plan.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { biomeOf } from '../world/forest/biome.js';
import { FEN } from '../world/forest/config.js';
import { PRESETS } from '../engine/quality.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { createWind } from '../engine/wind.js';
import { shotStats } from '../tools/world/shot-stats.mjs';
import { createActor } from '../engine/actor.js';
import { emptyWorld, loadCharacter } from './characters.mjs';

// Chapter 2's two new places, the trail (fenjaslod) and the Fen (fen): the Fen's own biome in the forest generator, its water,
// its mist and its plants, and the cost of every shot set in them (world/forest/, world/props/water.js and mist.js).

const FEN_PLACE = chapter.locations.fen;
const TRAIL = chapter.locations.fenjaslod;
const layoutOf = place => ({ ...place.layout, shots: place.shots });

/** A world in Node, as tools/world/forest-stats.mjs makes one: no renderer, a stand-in sun whose shadow focus is the clearing. */
function nodeWorld(q = PRESETS.tablet) {
  const look = pickLook(chapter.look);
  const sun = { castShadow: true, target: { position: new THREE.Vector3() }, shadow: { updateMatrices() {} } };
  return {
    THREE, renderer: { getDrawingBufferSize: v => v.set(1280, 800) }, scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200), clock: null, q, params: new URLSearchParams(''), look,
    lighting: { direction: sunDirection(look), sun, focusRadius: 10 }, wind: createWind(), chapter, heightAt: () => 0, actors: new Map(),
  };
}

const libraries = new Map();
const libraryOf = seed => { if (!libraries.has(seed)) libraries.set(seed, createSpeciesLibrary(seed)); return libraries.get(seed); };
/** A place's plan, with its ground shaped as createForest shapes it (the water dug out, the hummocks raised). */
function planOf(place, q = PRESETS.tablet) {
  const world = { chapter };
  const { layout, terrain } = shapeGround(world, layoutOf(place), place.layout.seed);
  return { layout, terrain, plan: planForest({ world, layout, seed: place.layout.seed, terrain, library: libraryOf(place.layout.seed), q }) };
}
const counted = placements => placements.reduce((out, p) => ({ ...out, [p.name]: (out[p.name] ?? 0) + 1 }), {});
const herPoints = layout => Object.entries(layout.actors).filter(([name]) => name === 'thorsedla' || name.startsWith('thorsedla_'));

// ---- the water ------------------------------------------------------------------------------

test('water surfaces sit above the bed and fade at the edge', () => {
  const world = nodeWorld();
  const { layout, terrain } = shapeGround(world, layoutOf(FEN_PLACE), FEN_PLACE.layout.seed);
  const water = createWater(world, layout.water, terrain.heightAt);
  const shape = waterShape(layout.water);
  // in the middle of every pool the surface is the pool's depth above the bed the actors stand on
  for (const pool of FEN_PLACE.layout.water.pools) {
    const [x, z] = pool.center;
    const top = water.surfaceAt(x, z);
    assert.notEqual(top, null, `pool at ${x}, ${z} has no surface in its middle`);
    assert.ok(Math.abs(top - terrain.heightAt(x, z) - pool.depth) < 0.02, `the pool at ${x}, ${z} is ${(top - terrain.heightAt(x, z)).toFixed(3)} m deep, not ${pool.depth}`);
    assert.ok(Math.abs(water.depthAt(x, z) - pool.depth) < 0.02);
    // and all the water lies at one level
    assert.equal(top, water.level);
  }
  // along the middle of the channel, as deep as it says
  const { line } = shape;
  for (let i = 10; i < line.length - 10; i += 25) {
    const [x, z] = line[i];
    assert.ok(Math.abs(water.depthAt(x, z) - FEN_PLACE.layout.water.channel.depth) < 0.02, `the channel at ${x.toFixed(1)}, ${z.toFixed(1)} is ${water.depthAt(x, z).toFixed(3)} m deep`);
  }
  // walking out of a pool: the depth falls to nothing at the edge and the surface ends there; beyond it is dry ground
  const p1 = FEN_PLACE.layout.water.pools[0];
  let edge = null;
  for (let r = 0; r < p1.radius * 1.6; r += 0.05) {
    const x = p1.center[0], z = p1.center[1] + r; // due south, toward Mosi's side
    if (water.surfaceAt(x, z) === null) { edge = r; break; }
    assert.ok(terrain.heightAt(x, z) < water.level, 'the bed stays under the surface wherever the water shows');
  }
  assert.ok(edge !== null && edge > p1.radius * 0.8, `p1 ends ${edge} m from its middle`);
  assert.ok(water.depthAt(p1.center[0], p1.center[1] + edge - 0.06) < 0.06, 'the depth falls to nothing at the edge');
  assert.equal(water.depthAt(p1.center[0], p1.center[1] + edge + 0.5), 0, 'and there is none beyond it');
  // the surface fades out over the last 0.4 m inside its edge: every vertex outside the water is clear, every one well inside is not
  const { aWater } = water.surface.geometry.attributes;
  const pos = water.surface.geometry.attributes.position;
  let outside = 0, inside = 0;
  for (let i = 0; i < pos.count; i++) {
    const s = shape.signedAt(pos.getX(i), pos.getZ(i));
    assert.ok(Math.abs(aWater.getX(i) - Math.min(s, 50)) < 1e-4, 'each vertex knows its distance to the shore');
    if (s >= 0) outside++;
    if (s < -shape.fade) inside++;
  }
  assert.ok(outside > 50 && inside > 500, `${outside} vertices on the shore, ${inside} in open water`);
  assert.equal(shape.fade, 0.4, 'the fade is 0.4 m wide');
  // nothing on Mosi's hummock
  const [mx, , mz] = FEN_PLACE.layout.actors.mosi.position;
  assert.equal(water.surfaceAt(mx, mz), null);
  assert.equal(water.depthAt(mx, mz), 0);
  // the budget: at most 2 draw calls (the surface, and the bubbles while some rise) and 6k triangles for the whole Fen
  let calls = 0, triangles = 0;
  water.group.traverse(o => { if (o.isMesh || o.isPoints) { calls++; if (o.isMesh) triangles += o.geometry.index.count / 3; } });
  assert.ok(calls <= 2, `${calls} draw calls`);
  assert.ok(triangles <= 6000, `${triangles} triangles of water`);
  water.dispose();
});

test('rings and bubbles live on the water\'s clock, and no more than eight rings at once', () => {
  const world = nodeWorld();
  const { layout, terrain } = shapeGround(world, layoutOf(FEN_PLACE), FEN_PLACE.layout.seed);
  const water = createWater(world, layout.water, terrain.heightAt);
  water.update(10);
  const [x, z] = FEN_PLACE.layout.water.pools[0].center;
  const slots = water.surface.material.uniforms.uRipples.value;
  assert.equal(slots.length, 8, 'eight rings at most');
  const rings = Array.from({ length: 11 }, (_, i) => water.rippleAt(new THREE.Vector3(x + i * 0.2, 0, z), 1));
  const live = slots.filter(r => r.w > 0 && r.z === 10);
  assert.equal(live.length, 6, 'six for the script (the newest take the oldest\'s places), two kept for the faint rings that start by themselves');
  assert.ok(rings.every(r => !r.done));
  const bubbles = water.bubblesAt([x, 0, z]);
  const points = water.group.getObjectByName('Water bubbles');
  assert.equal(points.visible, true, 'the bubbles are drawn while they rise');
  for (let t = 10; t < 14; t += 1 / 30) water.update(t);
  assert.ok(rings.every(r => r.done), 'every ring has faded');
  assert.equal(bubbles.done, true, 'the bubbles have broken on the surface');
  assert.equal(points.visible, false, 'and cost no draw call any more');
  water.dispose();
});

test('whoever stands in the water makes rings round their feet, and nobody on dry land does', () => {
  const world = nodeWorld();
  const { layout, terrain } = shapeGround(world, layoutOf(FEN_PLACE), FEN_PLACE.layout.seed);
  const water = createWater(world, layout.water, terrain.heightAt);
  const wader = (x, z) => {
    const root = new THREE.Group();
    const foot = new THREE.Bone();
    foot.name = 'FrontFootL';
    foot.position.set(x, terrain.heightAt(x, z) + 0.3, z);
    root.add(foot);
    root.updateMatrixWorld(true);
    return { root, model: root };
  };
  const [px, pz] = FEN_PLACE.layout.water.pools[0].center;
  const [mx, , mz] = FEN_PLACE.layout.actors.mosi.position;
  const slots = water.surface.material.uniforms.uRipples.value;
  water.update(20);
  water.wade([wader(mx, mz)]);
  assert.equal(slots.filter(r => r.w > 0 && r.z === 20).length, 0, 'no ring on dry land');
  water.wade([wader(px, pz)]);
  const ring = slots.find(r => r.w > 0 && r.z === 20);
  assert.ok(ring && Math.hypot(ring.x - px, ring.y - pz) < 1e-6, 'a ring round the foot in the water');
  assert.ok(ring.w < 0.5, 'a faint one');
  water.dispose();
});

// ---- the mist -------------------------------------------------------------------------------

test('the mist is a few soft cards that the sun lifts', () => {
  const world = nodeWorld();
  const mist = createMist(world, { center: [0, 0], radius: 20, heightAt: () => 0 });
  assert.equal(CARDS, 12);
  assert.ok(mist.cards > 0 && mist.cards <= 12, `${mist.cards} cards`);
  assert.equal(mist.mesh.geometry.index.count / 6, mist.cards, 'two triangles a card');
  assert.equal(mist.mesh.material.blending, THREE.AdditiveBlending);
  assert.equal(mist.mesh.material.depthWrite, false);
  assert.equal(mist.level, 1);
  mist.setLevel(0.25);
  assert.equal(mist.level, 0.25);
  mist.setLevel(0);
  assert.equal(mist.mesh.visible, false, 'gone mist costs nothing');
  mist.dispose();
});

// ---- the plan -------------------------------------------------------------------------------

test('the fen plan keeps plants out of the water and lilies in it', () => {
  const { layout, plan } = planOf(FEN_PLACE);
  const counts = counted(plan.placements);
  // the Fen grows its own plants, and none of the forest's broadleaves, araucarias, bushes or flowers
  for (const name of ['swampConifer', 'horsetailReed', 'horsetailTall', 'waterLily', 'mossHummock', 'deadSnag', 'fern', 'cycad', 'treeFern', 'log']) {
    assert.ok(counts[name] > 0, `the Fen has no ${name}`);
  }
  for (const name of ['broadleaf', 'araucaria', 'bush', 'flowers']) assert.equal(counts[name] ?? 0, 0, `the Fen grows ${counts[name]} ${name}`);
  assert.ok(counts.waterLily >= 12, `${counts.waterLily} lilies`);
  for (const p of plan.placements) {
    const depth = layout.water.depthAt(p.x, p.z);
    if (p.name === 'waterLily') {
      assert.ok(depth > 0.05, `a lily at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} in ${depth.toFixed(3)} m of water`);
      assert.ok(Math.abs(p.y - layout.water.surfaceAt(p.x, p.z)) < 0.05, 'and floating on it');
    } else {
      assert.ok(depth <= 0.05, `a ${p.name} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} stands in ${depth.toFixed(3)} m of water`);
    }
  }
  // the authored plants are where the layout says: her two conifers and Flugeðla's snag
  for (const spec of FEN_PLACE.layout.plants) {
    assert.ok(plan.placements.some(p => p.name === spec.name && Math.hypot(p.x - spec.position[0], p.z - spec.position[1]) < 1e-6), `${spec.name} at ${spec.position}`);
  }
});

test('the trail turns from forest to fen across its middle', () => {
  const { layout, plan } = planOf(TRAIL);
  const biome = biomeOf(layout);
  const fenKinds = new Set(['swampConifer', 'horsetailReed', 'horsetailTall', 'waterLily', 'mossHummock', 'deadSnag']);
  const forestKinds = new Set(['broadleaf', 'araucaria', 'bush', 'flowers']);
  let fen = 0, forest = 0;
  for (const p of plan.placements) {
    const share = biome.shareAt(p.x, p.z);
    if (fenKinds.has(p.name)) { fen++; assert.ok(share > 0, `a ${p.name} on the forest side at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`); }
    if (forestKinds.has(p.name)) { forest++; assert.ok(share < 1, `a ${p.name} on the fen side at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`); }
  }
  assert.ok(fen > 20 && forest > 20, `${fen} fen plants, ${forest} forest plants`);
  // ten metres of blend, around the path's middle
  const [fx, fz] = layout.blend.from, [tx, tz] = layout.blend.to;
  assert.ok(Math.abs(Math.hypot(tx - fx, tz - fz) - 10) < 1e-9);
  // and the trail goes down to the Fen
  const ends = [TRAIL.layout.path[0], TRAIL.layout.path.at(-1)];
  const { terrain } = planOf(TRAIL);
  assert.ok(terrain.heightAt(...ends[0]) - terrain.heightAt(...ends[1]) > 1.5, 'the fen end lies lower than the forest end');
});

test('Þórseðla\'s standing points are clear of plants', () => {
  const { layout, plan } = planOf(FEN_PLACE);
  const points = herPoints(layout);
  assert.equal(points.length, 4, 'four points along her');
  const xs = points.map(([, a]) => a.position);
  const span = Math.max(...xs.map(a => Math.hypot(a[0] - xs[0][0], a[2] - xs[0][2])), ...xs.map(a => Math.hypot(a[0] - xs[1][0], a[2] - xs[1][2])));
  assert.ok(span > 14 && span < 22, `her points span ${span.toFixed(1)} m of her 22`);
  for (const p of plan.placements) {
    for (const [name, a] of points) {
      const d = Math.hypot(p.x - a.position[0], p.z - a.position[2]);
      assert.ok(d >= 3.2, `a ${p.name} ${d.toFixed(2)} m from ${name}`);
    }
  }
  // she stands in p1, 0.6 m of water where she stands (past her ankles: the next test); Mosi on a dry hummock above the water
  const her = layout.actors.thorsedla.position;
  assert.ok(Math.abs(layout.water.depthAt(her[0], her[2]) - 0.6) < 0.02, `${layout.water.depthAt(her[0], her[2])} m of water where she stands`);
  const mosi = layout.actors.mosi.position;
  assert.equal(layout.water.depthAt(mosi[0], mosi[2]), 0, 'Mosi stands on dry ground');
  const { terrain } = planOf(FEN_PLACE);
  assert.ok(terrain.heightAt(mosi[0], mosi[2]) > layout.water.surfaceAt(her[0], her[2]) + 0.25, 'on a hummock');
  // her two conifers stand before her head, their crowns at the height she bites
  const head = layout.actors.thorsedla_head.position;
  const conifers = plan.placements.filter(p => p.name === 'swampConifer' && Math.hypot(p.x - head[0], p.z - head[2]) < 8);
  assert.ok(conifers.length >= 2, `${conifers.length} conifers before her head`);
  for (const c of conifers) assert.ok(c.model.height * c.scale > 8.5 && c.model.height * c.scale < 13, `a conifer she bites is ${(c.model.height * c.scale).toFixed(1)} m tall`);
  // the far friends are far out, 60 to 120 m from the middle of the Fen
  for (const [name, [x, z]] of Object.entries(layout.farFriends)) {
    const d = Math.hypot(x - layout.clearing.center[0], z - layout.clearing.center[1]);
    assert.ok(d >= 60 && d <= 120, `${name} is ${d.toFixed(0)} m out`);
  }
});

test('Þórseðla wades: the water covers her feet past the ankle joints where she stands', async () => {
  const { layout, terrain } = planOf(FEN_PLACE);
  const world = emptyWorld();
  world.heightAt = terrain.heightAt;
  const { position: [x, , z], heading } = layout.actors.thorsedla;
  const thorsedla = await createActor(world, { name: 'thorsedla', gltf: await loadCharacter('thorsedla'), position: [x, 0, z], heading });
  thorsedla.root.updateMatrixWorld(true);
  assert.ok(Math.abs(thorsedla.root.position.y - terrain.heightAt(x, z)) < 1e-9, 'her root is on the bed');
  const level = layout.water.surfaceAt(x, z);
  for (const name of ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR']) {
    const foot = thorsedla.model.getObjectByName(name).getWorldPosition(new THREE.Vector3());
    assert.ok(foot.y <= level - 0.2, `${name} is at ${foot.y.toFixed(3)}, the water at ${level}: her ankle is not under it`);
    assert.ok(layout.water.depthAt(foot.x, foot.z) > 0.5, `${name} stands in the pool`);
  }
});

test('the clearing centre of both places is where the ground is counted from: no lift there', () => {
  for (const place of [TRAIL, FEN_PLACE]) {
    const { layout, terrain } = shapeGround({ chapter }, layoutOf(place), place.layout.seed);
    const [cx, cz] = layout.clearing.center;
    assert.ok(Math.abs(terrain.heightAt(cx, cz)) < 1e-12);
    assert.ok(Math.abs(layout.lift(cx, cz, 0)) < 1e-12, `${place.layout.seed}: the lift is nothing at the centre (terrain.js counts heights from there)`);
  }
});

// ---- the budget -----------------------------------------------------------------------------

test('the fen stays within the forest budget', async () => {
  for (const place of [TRAIL, FEN_PLACE]) {
    const world = nodeWorld();
    const forest = await createForest(world, layoutOf(place));
    if (place === FEN_PLACE) {
      assert.ok(forest.water, 'the Fen has its water');
      assert.ok(forest.mists.length === 1 && forest.mists[0].cards <= 12, 'and its mist');
    }
    for (const [name, shot] of Object.entries(place.shots)) {
      if (!Array.isArray(shot.position)) continue;
      const stats = shotStats(world, forest, shot);
      assert.ok(stats.triangles <= 150000, `${name}: ${stats.triangles} triangles`);
      assert.ok(stats.calls <= 60, `${name}: ${stats.calls} draw calls`);
    }
    forest.dispose();
  }
});

test('no moss hangs between Egill and where her face comes down to him (mossClear), and the trees round it keep theirs', async () => {
  const discs = FEN_PLACE.layout.mossClear;
  assert.ok(discs?.length, 'the Fen clears moss where her face comes down');
  const forest = await createForest(nodeWorld(), layoutOf(FEN_PLACE));
  const moss = forest.group.getObjectByName('Hanging moss');
  assert.ok(moss && forest.info.mossCards >= 100, `${forest.info.mossCards} cards of moss`);
  const pos = moss.geometry.attributes.position;
  let near = 0;
  for (let i = 0; i < pos.count; i += 8) { // a card is four rows of two; its first row is where it hangs from
    const x = (pos.getX(i) + pos.getX(i + 1)) / 2, z = (pos.getZ(i) + pos.getZ(i + 1)) / 2;
    for (const { center, radius } of discs) {
      const d = Math.hypot(x - center[0], z - center[1]);
      assert.ok(d >= radius, `a strand hangs ${d.toFixed(2)} m from the middle of the clear disc at ${center}`);
      if (d < radius + 2) near++;
    }
  }
  assert.ok(near > 0, 'the conifers by the disc keep their other strands');
  forest.dispose();
});

// ---- Þórseðla's footprints and the berries -----------------------------------------------------

/** nodeWorld with the game clock and effects main.js has, and its own frame: the clock on, then the effects. */
function propWorld(heightAt) {
  const world = nodeWorld();
  world.clock = createClock();
  world.effects = createEffects();
  world.heightAt = heightAt;
  world.resolvePoint = createPointResolver(world);
  const frame = (dt = 1 / 30) => { world.clock.step(dt); world.effects.update(dt); };
  return { world, run: seconds => { for (let t = 0; t < seconds - 1e-9; t += 1 / 30) frame(); } };
}
/** The distance from a point to a polyline, how far along it the nearest point is, which side the point is on and the way there. */
function alongLine(line, x, z) {
  let best = { d: Infinity, s: 0 };
  let s0 = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len)));
    const d = Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t);
    if (d < best.d) best = { d, s: s0 + len * t, side: Math.sign((bx - ax) * (z - az) - (bz - az) * (x - ax)), dir: Math.atan2(bz - az, bx - ax) };
    s0 += len;
  }
  return best;
}

test('ten mud prints lie on the trail with water in them', () => {
  const { layout, terrain } = shapeGround({ chapter }, layoutOf(TRAIL), TRAIL.layout.seed);
  const prints = TRAIL.layout.prints;
  assert.equal(prints?.length, 10, 'ten footprints');
  // On the path, down its fen half, in the order she walked them toward the Fen: a stride apart, left foot and right foot in turn.
  const biome = biomeOf(layout);
  const placed = prints.map(p => ({ ...p, ...alongLine(TRAIL.layout.path, ...p.position) }));
  for (const [i, p] of placed.entries()) {
    assert.ok(p.d <= 0.5, `print ${i + 1} is ${p.d.toFixed(2)} m off the middle of the path`);
    assert.ok(biome.shareAt(...p.position) > 0.9, `print ${i + 1} is in the fen half of the trail`);
    const off = Math.abs((((p.heading * Math.PI) / 180 - p.dir + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * (180 / Math.PI);
    assert.ok(off <= 25, `print ${i + 1} points ${off.toFixed(0)} degrees off the way down the trail`);
    if (i === 0) continue;
    const step = Math.hypot(p.position[0] - placed[i - 1].position[0], p.position[1] - placed[i - 1].position[1]);
    assert.ok(p.s > placed[i - 1].s && step >= 2 && step <= 2.8, `print ${i + 1} is ${step.toFixed(2)} m on from the one before`);
    assert.equal(p.side, -placed[i - 1].side, `print ${i + 1} is the other foot's`);
  }
  const { world, run } = propWorld(terrain.heightAt);
  const mud = createMudPrints(world, { prints, heightAt: terrain.heightAt });
  assert.equal(mud.group.parent, world.scene);
  const meshes = [];
  mud.group.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 2, 'two draw calls for all ten: the mud and the water');
  const [mudMesh, waterMesh] = [mud.group.getObjectByName('Mud prints'), mud.group.getObjectByName('Print water')];
  assert.ok(mudMesh && waterMesh);
  const triangles = meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
  assert.ok(triangles <= 13000, `${triangles} triangles`);
  // the targets: one a print, print1 to print10, over its water
  assert.deepEqual(mud.targets.map(t => t.name), prints.map((_, i) => `print${i + 1}`));
  for (const [i, t] of mud.targets.entries()) {
    const [x, z] = prints[i].position;
    assert.equal(t.radius, 0.6);
    assert.ok(Math.hypot(t.point.x - x, t.point.z - z) < 0.3, `print${i + 1}'s target is over it`);
    const up = t.point.y - terrain.heightAt(x, z);
    assert.ok(up > 0 && up < 0.2, `print${i + 1}'s target is ${up.toFixed(2)} m above the ground`);
  }
  // Pressed into the mud: nothing stands more than a hand's breadth above the ground, and the edge of it goes under the ground,
  // so it never floats on the path; its floor lies under the water.
  const pos = mudMesh.geometry.attributes.position;
  let highest = -Infinity, edgeAbove = 0;
  const edge = mudMesh.geometry.attributes.aEdge;
  assert.ok(edge, 'the mud marks its outer edge');
  for (let i = 0; i < pos.count; i++) {
    const up = pos.getY(i) - terrain.heightAt(pos.getX(i), pos.getZ(i));
    highest = Math.max(highest, up);
    if (edge.getX(i) > 0.5 && up > -0.005) edgeAbove++;
  }
  assert.ok(highest <= 0.1, `the rim stands ${(highest * 100).toFixed(1)} cm above the path (6 cm at the heel, more where the trail falls away under the toes)`);
  assert.equal(edgeAbove, 0, 'the outer edge of every print is under the ground');
  // The water: the water's own shader (the same as the pools of the Fen), with a print's state, 2 cm below each rim.
  const pools = createWaterMaterial(world, {});
  assert.equal(waterMesh.material.fragmentShader, pools.material.fragmentShader, "the Fen's water shader");
  assert.equal(waterMesh.material.vertexShader, pools.material.vertexShader);
  assert.ok('PRINT_WATER' in waterMesh.material.defines);
  pools.dispose();
  const wpos = waterMesh.geometry.attributes.position;
  const owner = waterMesh.geometry.attributes.aPrint;
  const levels = prints.map(() => new Set());
  for (let i = 0; i < wpos.count; i++) {
    const k = owner.getX(i);
    const [x, z] = prints[k].position;
    assert.ok(Math.hypot(wpos.getX(i) - x, wpos.getZ(i) - z) < 0.8, `the water of print ${k + 1} is over it`);
    levels[k].add(wpos.getY(i).toFixed(4));
  }
  for (const [k, set] of levels.entries()) {
    assert.equal(set.size, 1, `print ${k + 1}'s water is flat`);
    const level = Number([...set][0]);
    assert.ok(Math.abs(mud.rimOf(k) - level - 0.02) < 0.003, `print ${k + 1}'s water lies ${((mud.rimOf(k) - level) * 100).toFixed(1)} cm below its rim`);
    assert.ok(level > mud.floorOf(k) + 0.01, 'above its floor');
  }
  // A splash rings the water; the count raises a big digit 0.6 m out of it for 1.6 s; a counted print's water goes still and gold.
  run(0.5);
  const splash = mud.splash(2);
  const rings = waterMesh.material.uniforms.uRipples.value.filter(r => r.w > 0);
  assert.ok(rings.some(r => Math.hypot(r.x - prints[2].position[0], r.y - prints[2].position[1]) < 0.3), 'a ring in print 3');
  const counting = mud.count(2);
  let tallest = 0, risen = 0;
  for (let t = 0; t < 1.7 && !counting.done; t += 1 / 30) {
    run(1 / 30);
    const digit = world.scene.getObjectByName('Print digit');
    if (!digit?.visible) continue;
    const box = new THREE.Box3().setFromObject(digit);
    tallest = Math.max(tallest, box.max.y - box.min.y);
    risen = Math.max(risen, box.min.y - mud.levelOf(2));
  }
  assert.ok(counting.done, 'the digit is gone after 1.6 s');
  assert.ok(tallest >= 0.6, `the digit is ${tallest.toFixed(2)} m tall`);
  assert.ok(risen >= 0.5, `and rises ${risen.toFixed(2)} m out of the water`);
  assert.ok(splash.done, 'the splash is over');
  mud.done(2);
  run(1);
  const state = waterMesh.geometry.attributes.aState;
  for (let i = 0; i < state.count; i++) if (owner.getX(i) === 2) assert.ok(state.getX(i) > 0.99, "print 3's water is still and gold");
  // A sauropod's hind foot: one impression with its claw marks on the front edge toward the outside of the foot, her left foot's
  // the mirror of her right's. Where a claw is pressed in on the outside, the same place on the inside is the lip.
  for (const [k, p] of prints.entries()) {
    const out = p.foot === 'left' ? -1 : 1;
    assert.equal(p.foot, k % 2 === 0 ? 'right' : 'left', `print ${k + 1} is her ${k % 2 === 0 ? 'right' : 'left'} foot's`);
    const [cx, , cz] = mud.pointIn(k, 0.39, 0.185 * out);
    const [ix, , iz] = mud.pointIn(k, 0.39, -0.185 * out);
    const claw = mud.groundAt(cx, cz) - terrain.heightAt(cx, cz), inner = mud.groundAt(ix, iz) - terrain.heightAt(ix, iz);
    assert.ok(claw < 0.015, `print ${k + 1}: a claw is pressed in on the outside of the foot (${(claw * 100).toFixed(1)} cm)`);
    assert.ok(inner > 0.02, `print ${k + 1}: the inside there is the lip (${(inner * 100).toFixed(1)} cm)`);
  }
  mud.dispose();
  assert.equal(mud.group.parent, null);
});

test('berry bushes expose five red targets and the blue ones', () => {
  const { layout, terrain, plan } = planOf(FEN_PLACE);
  const spec = FEN_PLACE.layout.berries;
  assert.ok(spec?.length >= 3, 'bushes on the berry hummocks');
  const bushes = spec.map(b => ({ ...b, position: [b.position[0], terrain.heightAt(...b.position), b.position[1]] }));
  const { world, run } = propWorld(terrain.heightAt);
  const berries = createBerryBushes(world, { bushes });
  const red = berries.targets.filter(t => t.kind === 'red');
  const blue = berries.targets.filter(t => t.kind === 'blue');
  assert.equal(red.length, 5, 'five red berries');
  assert.ok(blue.length >= 2, `${blue.length} blue ones`);
  assert.equal(spec.filter(b => b.kind === 'blue').length, 1, 'one bush of blue berries, for the birds');
  for (const t of berries.targets) {
    assert.match(t.name, /^berry_\d+_\d+$/);
    assert.equal(t.radius, 0.35);
    const [b] = t.name.split('_').slice(1).map(Number);
    const [x, y, z] = bushes[b].position;
    assert.equal(t.kind, bushes[b].kind);
    assert.ok(Math.hypot(t.point.x - x, t.point.z - z) < 0.9, `${t.name} hangs on its bush`);
    assert.ok(t.point.y - y > 0.15 && t.point.y - y < 1.3, `${t.name} is ${(t.point.y - y).toFixed(2)} m up`);
  }
  // on dry hummocks, clear of the Fen's plants, and never in the water
  for (const b of bushes) {
    assert.equal(layout.water.depthAt(b.position[0], b.position[2]), 0, `the bush at ${b.position} stands on dry ground`);
    const near = plan.placements.filter(p => p.name !== 'mossHummock' && Math.hypot(p.x - b.position[0], p.z - b.position[2]) < 0.9 + (p.radius ?? 0.5));
    assert.deepEqual(near.map(p => p.name), [], `nothing grows where the bush at ${b.position} stands`);
  }
  let calls = 0;
  berries.group.traverse(o => { if (o.isMesh && o.visible) calls++; });
  assert.ok(calls <= 2, `${calls} draw calls`);
  // a picked berry flies to the point and leaves its bush; the bush shakes
  const to = new THREE.Vector3(bushes[0].position[0] + 2, bushes[0].position[1] + 0.8, bushes[0].position[2]);
  const flight = berries.pick(red[0].name, to);
  const shake = berries.shake(0);
  run(0.1);
  assert.equal(berries.picked.has(red[0].name), true);
  run(1.5);
  assert.equal(flight.done, true, 'the berry has flown');
  assert.equal(shake.done, true, 'the bush has shaken');
  assert.ok(berries.flying.position.distanceTo(to) < 0.01, 'and ends at the point');
  berries.dispose();
  assert.equal(berries.group.parent, null);
});

// ---- the look -------------------------------------------------------------------------------

test('the Fen has its own palette', () => {
  assert.equal(FEN.grassSun, '#c9b45a');
  assert.equal(FEN.grassTip, '#e3d08a');
  assert.equal(FEN.grassBase, '#6b7a3a');
  assert.equal(FEN.mud, '#4a3a2c');
  assert.equal(FEN.waterDeep, '#3f7a6e');
  assert.equal(FEN.waterSky, '#a9c9c4');
  assert.equal(FEN.bark, '#5a4636');
  assert.equal(FEN.hangingMoss, '#8aa05a');
  assert.equal(FEN.lilyPad, '#4f8a4a');
  assert.equal(FEN.mist, '#cfe0d6');
});
