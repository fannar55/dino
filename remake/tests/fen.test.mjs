import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chapter } from '../chapters/kafli2.js';
import { createWater, waterShape } from '../world/props/water.js';
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
  const rings = Array.from({ length: 11 }, (_, i) => water.rippleAt(new THREE.Vector3(x + i * 0.2, 0, z), 1));
  const live = water.surface.material.uniforms.uRipples.value.filter(r => r.w > 0 && r.z === 10);
  assert.equal(live.length, 8, 'eight rings at most: the newest take the oldest\'s places');
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
  for (const name of ['swampConifer', 'horsetailReed', 'horsetailTall', 'waterLily', 'mossHummock', 'deadSnag', 'fern', 'cycad']) {
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
  // she stands in the shallow pool p1, 0.3 m deep under her feet; Mosi on a dry hummock above the water
  const her = layout.actors.thorsedla.position;
  assert.ok(Math.abs(layout.water.depthAt(her[0], her[2]) - 0.3) < 0.02, `${layout.water.depthAt(her[0], her[2])} m of water where she stands`);
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
