// Árdalurinn (world/ardalur): the river valley of chapter 4's flight, in grey, built in 150 m sections along the route. Sections are
// built before they are wanted, even on a slow device, and shown only while near; the land never comes within 2 m of her path; the
// cliff of the falls stands behind the falling water; each section is cheap enough to draw; and a chapter's location may build such
// a place instead of a forest.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoute, BEATS, LEAP, FALLS, GORGE, HILLS, OUTCROPS, STREAMS, PONDS, MEADOW } from '../chapters/kafli4-route.js';
import { createArdalur } from '../world/ardalur/index.js';
import { createGorgeSight, ABOVE_SECTOR, createHazeSight, fogBetween, FOG_CUT } from '../world/ardalur/sight.js';
import { createSections } from '../world/ardalur/sections.js';
import { createRouteIndex, createTerrain, CORRIDOR } from '../world/ardalur/terrain.js';
import { createAnimals, ANSWER, SMAEDLA_MODEL, GRASBITUR_MODEL, FLUGDYR_MODEL } from '../world/ardalur/animals.js';
import { crowdModelFrom } from '../world/critters/crowd-models.js';
import { loadGlb } from './glb.mjs';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { HIGH, bodyOf, groveAt } from '../world/ardalur/banks.js';
import { stillViews } from '../engine/camera/flight-camera.js';
import { createFarLand, FAR } from '../world/ardalur/far-land.js';
import { cullBatches } from '../world/forest/batch.js';
import { FOREST } from '../world/forest/config.js';
import { CARDED as CARD_SPECIES, bakeGeometry } from '../world/forest/cards.js';
import { createLocations } from '../engine/locations.js';
import { RAPIDS, flowAt, whiteAt } from '../world/ardalur/river.js';
import { createWind } from '../engine/wind.js';
import { PRESETS } from '../engine/quality.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';

const route = createRoute();
const DT = 1 / 30;

/** A world in Node for the real look (as tests/fen.test.mjs makes one): wind, a look, a sun and a quality preset, no renderer. */
function litWorld() {
  const look = pickLook('lateMorning');
  return {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200), q: PRESETS.tablet, look,
    lighting: { direction: sunDirection(look), focusRadius: 10 }, wind: createWind(), actors: new Map(), params: new URLSearchParams(''),
  };
}
let lit = null;
let litWorldOf = null;
/** The real valley, built once for the tests that only look at it (litWorldOf: its world, for the tests that move its camera). */
// the owner's grazer, as the chapter loads it (animals.js loadCritters), so the lit valley has its herd (life.js)
const grazer = crowdModelFrom(await loadGlb(new URL(GRASBITUR_MODEL)));
function litValley() {
  if (!lit) {
    litWorldOf = litWorld();
    lit = createArdalur(litWorldOf, { grey: false, route, critters: { grasbitur: grazer } });
    lit.buildAll();
  }
  return lit;
}
const trianglesOf = model => (model.solid ? model.solid.triangles : 0) + (model.thin ? model.thin.triangles : 0);

test('sections cover the route and only near ones are visible', () => {
  const sections = createSections(route);
  const { list } = sections;
  assert.equal(list[0].from, 0);
  assert.equal(list.at(-1).to, 1);
  list.forEach((s, i) => { if (i > 0) assert.equal(s.from, list[i - 1].to); });
  assert.equal(list.length, Math.ceil(route.length / 150));
  for (const s of list) s.built = true;
  for (let u = 0; u <= 1; u += 0.005) {
    const wanted = sections.wanted(u);
    assert.ok(wanted.length <= 4, `u=${u}: ${wanted.length} wanted`);
    assert.ok(wanted.includes(sections.indexAt(u)));
    const visible = sections.update(u);
    assert.ok(visible.every(i => wanted.includes(i)), `u=${u}: ${visible} not in ${wanted}`);
  }
  // a section that is not built is never shown
  list[3].built = false;
  assert.ok(!sections.update(list[3].from + 0.001).includes(3));
});

test('a section ahead is built before it is wanted, on a slow device too', () => {
  // A slow tablet: three build steps a frame (a real one does ten or more in its 3 ms).
  let clock = 0;
  const world = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200) };
  const place = createArdalur(world, { grey: true, route, budget: () => 4, now: () => ++clock });
  const shown = [];
  for (let t = 0; t <= BEATS.END; t += DT) {
    world.flightU = route.progressAt(t);
    const here = route.pointAt(world.flightU);
    // the camera: behind her mostly, and every 20 s for 4 s a fixed shot 60 m off to the side, ahead of her
    if (t % 20 < 4) world.camera.position.copy(route.pointAt(route.progressAt(Math.min(BEATS.END, t + 3)))).add(new THREE.Vector3(40, 15, 40));
    else world.camera.position.copy(route.pointAt(route.progressAt(Math.max(0, t - 0.6)))).add(new THREE.Vector3(0, 2.5, 0));
    place.update(DT, t);
    for (const s of place.sections.list) assert.ok(!s.visible || s.built, `t=${t.toFixed(2)}: section ${s.index} shown unbuilt`);
    const i = place.sections.indexAt(world.flightU);
    assert.ok(place.sections.list[i].visible, `t=${t.toFixed(2)}: the section under her (${i}) is shown`);
    if (Math.abs(here.y) > 1e6) throw new Error('nan');
    let triangles = 0;
    place.stats.sections.forEach(part => part?.visible && part.traverse(o => {
      if (o.isMesh) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    }));
    shown.push(triangles);
  }
  assert.deepEqual(place.stats.late, [], 'every section was built in time');
  // the valley's share of a shot's 250k triangles (STYLE.md 11): the rest is for Flugeðla, Egill and Mosi (some 85k)
  assert.ok(Math.max(...shown) <= 140000, `at most ${Math.max(...shown)} triangles of land shown at once`);
  place.dispose();
});

test('the land never comes within 2 m of her path, nor of the lane she may steer in', () => {
  const world = { scene: new THREE.Scene() };
  const place = createArdalur(world, { grey: true, route });
  const side = new THREE.Vector3();
  for (let t = LEAP + 1.5; t <= BEATS.END; t += 0.25) {
    const u = route.progressAt(t);
    const p = route.pointAt(u);
    const tan = route.tangentAt(u);
    side.set(-tan.z, 0, tan.x).normalize();
    const reach = t >= 15 && t <= 105 ? [-4, -2, 0, 2, 4] : [0];
    for (const k of reach) {
      const x = p.x + side.x * k;
      const z = p.z + side.z * k;
      const ground = place.heightAt(x, z);
      assert.ok(ground <= p.y - 2, `t=${t} aside ${k}: the ground ${ground.toFixed(2)} is ${(p.y - ground).toFixed(2)} m under her`);
    }
  }
  // the river is under her in B to D, and its surface is at the river's level there
  for (let t = 22; t < BEATS.E; t += 1) {
    const s = route.distanceAt(t);
    const level = route.riverLevelAt(s);
    assert.notEqual(level, null);
    const p = route.pointAt(s / route.length);
    assert.ok(place.heightAt(p.x, p.z) < level, `t=${t}: the bed is under the water`);
  }
  place.dispose();
});

test('the cliff of the falls stands behind the falling water, and she climbs 3 m clear of it', () => {
  const world = { scene: new THREE.Scene() };
  const place = createArdalur(world, { grey: true, route });
  // beside the river (its upper reach lies on FALLS.z): up at the lip above the falls, down in the gorge's bowl below them
  assert.ok(place.heightAt(FALLS.face - 8, FALLS.z + 30) > FALLS.top - 1, 'above the falls, the land is up at the lip');
  assert.ok(place.heightAt(FALLS.face + 8, FALLS.z + 110) < FALLS.top - 10, 'below the falls, the land beyond the gorge rim is low');
  assert.ok(place.heightAt(FALLS.face + 8, FALLS.z) < FALLS.base, 'below it, the plunge pool');
  for (let t = BEATS.E; t <= BEATS.F; t += 0.1) {
    const p = route.pointAt(route.progressAt(t));
    if (p.y < FALLS.base + 2 || p.y > FALLS.top) continue;
    assert.ok(place.heightAt(p.x - 3, p.z) < p.y - 1, `t=${t.toFixed(1)}: the cliff within 3 m of her at ${p.y.toFixed(1)} m`);
  }
  // the far pool is a basin under its water, and the snag stands on the Fen
  assert.ok(place.heightAt(...[route.pool.center[0], route.pool.center[1]]) < route.pool.level - 0.5);
  assert.ok(Math.abs(place.heightAt(0, 0)) < 1, `the snag's foot at ${place.heightAt(0, 0).toFixed(2)} m`);
  place.dispose();
});

test('the water and the ground face up, so the sun lights them from above', () => {
  const world = { scene: new THREE.Scene() };
  const place = createArdalur(world, { grey: true, route });
  place.buildAll();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const flat = [];
  world.scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh && /river|pool|ground/.test(o.name)) flat.push(o); });
  assert.ok(flat.length > 10);
  for (const mesh of flat) {
    const { position } = mesh.geometry.attributes;
    const index = mesh.geometry.index;
    let down = 0;
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i));
      b.fromBufferAttribute(position, index.getX(i + 1));
      c.fromBufferAttribute(position, index.getX(i + 2));
      facing.subVectors(b, a).cross(c.sub(a));
      if (facing.y < 0) down++;
    }
    assert.equal(down, 0, `${mesh.name}: ${down} of ${index.count / 3} triangles face down (a double-sided face seen from its back is lit from below: black)`);
  }
  place.dispose();
});

test('each section stays within the forest budget', () => {
  const world = { scene: new THREE.Scene() };
  const place = createArdalur(world, { grey: true, route });
  place.buildAll();
  for (const part of place.stats.sections) {
    let triangles = 0;
    let calls = 0;
    part.traverse(o => {
      if (!o.isMesh) return;
      calls++;
      const per = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      triangles += per * (o.isInstancedMesh ? o.count : 1);
    });
    assert.ok(triangles <= 150000 && calls <= 60, `${part.name}: ${triangles} triangles, ${calls} calls`);
    assert.ok(triangles > 1000, `${part.name} has ground`);
  }
  place.dispose();
});

// The ground was one mesh a section, drawn whole whenever any of it showed. Now its 40 m tiles out of view are left out, and a smooth
// tile far off is drawn in 5 m cells; still one call, and no crack: the coarse ground has the fine ground's open edges and no others.
test('the ground draws only its tiles in view, far ones coarse, with no crack between them', () => {
  const place = litValley();
  const section = place.stats.sections.find(part => part?.children.some(o => /ground/.test(o.name)));
  const ground = section.children.find(o => /ground/.test(o.name));
  const { cull } = ground.userData;
  const fine = cull.ranges.filter(r => r.lod === 0);
  const coarse = cull.ranges.filter(r => r.lod === 1);
  assert.ok(fine.length > 20, `${fine.length} tiles`);
  assert.ok(coarse.length > 0, 'some tiles are smooth enough to be coarse');
  const openEdges = ranges => {
    const count = new Map();
    for (const r of ranges) for (let k = r.start; k < r.start + r.count; k += 3) {
      const t = [cull.master[k], cull.master[k + 1], cull.master[k + 2]];
      for (let e = 0; e < 3; e++) {
        const [a, b] = [t[e], t[(e + 1) % 3]].sort((x, y) => x - y);
        count.set(`${a}:${b}`, (count.get(`${a}:${b}`) ?? 0) + 1);
      }
    }
    return [...count].filter(([, n]) => n === 1).map(([edge]) => edge).sort();
  };
  // every tile coarse that can be: the same open edges as all fine (the section's own rim), so nothing opens between tiles or blocks
  const mixed = fine.map(r => coarse.find(c => c.plant === r.plant) ?? r);
  assert.deepEqual(openEdges(mixed), openEdges(fine));
  // half coarse, half fine: still none
  const half = fine.map((r, k) => (k % 2 ? coarse.find(c => c.plant === r.plant) ?? r : r));
  assert.deepEqual(openEdges(half), openEdges(fine));
  const fineTriangles = fine.reduce((n, r) => n + r.count / 3, 0);
  const coarseTriangles = mixed.reduce((n, r) => n + r.count / 3, 0);
  assert.ok(coarseTriangles < fineTriangles, `${coarseTriangles} of ${fineTriangles} triangles coarse`);
  // a camera over one tile looking down at it: that tile in, a tile 400 m off out of the frustum, all in one call
  const tile = fine[Math.floor(fine.length / 2)];
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200);
  camera.position.copy(tile.sphere.center).add(new THREE.Vector3(0, 30, 0));
  camera.lookAt(tile.sphere.center);
  camera.updateMatrixWorld();
  cullBatches([ground], camera, 2);
  assert.ok(cull.kept.includes(tile), 'the tile under the camera is drawn');
  assert.ok(cull.kept.length < fine.length, `${cull.kept.length} of ${fine.length} tiles drawn`);
  assert.ok(ground.geometry.drawRange.count < fine.reduce((n, r) => n + r.count, 0));
});

test('the real valley: each section stays within the forest budget, its plants at the finest level they are drawn at', () => {
  const place = litValley();
  for (const part of place.stats.sections) {
    let calls = 0;
    let triangles = 0;
    part.traverse(o => {
      if (!o.isMesh) return;
      calls++;
      if (!o.userData.cull) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    const { placements } = part.userData;
    assert.ok(placements.length > 50, `${part.name}: ${placements.length} plants`); // the gorge's walls leave least room
    for (const p of placements) triangles += trianglesOf(p.models[0].model);
    assert.ok(triangles <= 150000 && calls <= 60, `${part.name}: ${Math.round(triangles)} triangles, ${calls} calls`);
  }
  // the Fen's plants round the snag, the forest's up the valley, the reed at the water's edge
  const names = new Set(place.stats.sections.flatMap(part => part.userData.placements.map(p => p.name)));
  for (const name of ['horsetailReed', 'swampConifer', 'broadleaf', 'araucaria', 'treeFern', 'cycad', 'bush', 'rock', 'waterLily']) {
    assert.ok(names.has(name), `the valley grows ${name}`);
  }
});

// ---- far trees as cards (world/forest/cards.js) ---------------------------------------------------------------------------------

const CARDED = new Set(['broadleaf', 'araucaria', 'treeFern', 'swampConifer']);
/** A section's merged plant meshes, its card mesh among them. */
const plantsOf = part => part.children.find(o => o.name === 'Árdalur plants').children;
/** The ranges of a mesh that are the plant at (x, z) (each range's ref stands over its plant's foot). */
const rangesAt = (mesh, p) => mesh.userData.cull.ranges.filter(r => Math.abs(r.ref.x - p.x) < 1e-6 && Math.abs(r.ref.z - p.z) < 1e-6);

test("a card's picture is drawn from its tree's own shape: every vertex, its colour and its sky exposure, in its cell", () => {
  const library = createSpeciesLibrary(4);
  for (const name of CARD_SPECIES) {
    const model = library.get(name, 0, 2, {});
    const parts = [model.solid, model.thin].filter(p => p?.count);
    const g = bakeGeometry(model, 0.5, 3, 1);
    const pos = g.getAttribute('position'), col = g.getAttribute('aColour'), exp = g.getAttribute('aExposure');
    assert.equal(pos.count, parts.reduce((n, p) => n + p.count, 0), `${name}: every vertex`);
    assert.equal(g.index.count, parts.reduce((n, p) => n + p.idx.length, 0), `${name}: every triangle`);
    const first = parts[0];
    assert.ok(Math.abs(pos.getX(0) - (first.pos[0] * 0.5 + 3)) < 1e-6 && Math.abs(pos.getY(0) - (first.pos[1] * 0.5 + 1)) < 1e-6, `${name}: moved into its cell`);
    assert.ok(Math.abs(col.getY(0) - first.col[1]) < 1e-6 && Math.abs(exp.getX(0) - first.exp[0]) < 1e-6, `${name}: its colour and exposure`);
    for (let i = 0; i < pos.count; i++) assert.ok(Number.isFinite(pos.getX(i) + pos.getY(i) + col.getX(i) + exp.getX(i)), `${name}: vertex ${i}`);
  }
});

test('a far tree is a card, a near one a mesh', () => {
  const place = litValley();
  const camera = litWorldOf.camera;
  const part = place.stats.sections.find(sec => sec.userData.placements.some(p => p.name === 'broadleaf'));
  const tree = part.userData.placements.find(p => p.name === 'broadleaf');
  const meshes = plantsOf(part);
  const cards = meshes.filter(m => m.userData.cards);
  assert.equal(cards.length, 1, 'one card mesh a section');
  assert.equal(cards[0].castShadow, false, 'cards cast no shadow');
  assert.ok(rangesAt(cards[0], tree).length === 1, 'the tree has a card');
  const drawn = card => meshes.filter(m => !!m.userData.cards === card).some(m => (m.userData.cull.kept ?? []).some(r => rangesAt(m, tree).includes(r)));
  for (const [far, mesh] of [[60, true], [220, false]]) {
    camera.position.set(tree.x + far, tree.y + 12, tree.z);
    camera.lookAt(tree.x, tree.y + 5, tree.z);
    camera.updateMatrixWorld();
    cullBatches(meshes, camera, 1.5, null, FOREST.lod.cardFrom);
    assert.equal(drawn(false), mesh, `at ${far} m the tree's mesh is ${mesh ? '' : 'not '}drawn`);
    assert.equal(drawn(true), !mesh, `at ${far} m its card is ${mesh ? 'not ' : ''}drawn`);
  }
});

test('a card stands where its tree stands, as tall and as wide', () => {
  const place = litValley();
  let checked = 0;
  for (const part of place.stats.sections) {
    const card = plantsOf(part).find(m => m.userData.cards);
    if (!card) continue;
    const centre = card.geometry.getAttribute('aCentre');
    const size = card.geometry.getAttribute('aSize');
    for (const tree of part.userData.placements.filter(p => CARDED.has(p.name)).slice(0, 6)) {
      const [r] = rangesAt(card, tree);
      assert.ok(r, `${tree.name} at (${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}) has a card`);
      const v = card.userData.cull.master[r.start];
      // the tree's own shape, as drawn far off (its coarsest level)
      const { model } = tree.models.at(-1);
      let wide = 0, top = -Infinity, bottom = Infinity;
      for (const b of [model.solid, model.thin]) {
        if (!b?.count) continue;
        for (let i = 0; i < b.count; i++) {
          wide = Math.max(wide, Math.hypot(b.pos[i * 3], b.pos[i * 3 + 2]));
          top = Math.max(top, b.pos[i * 3 + 1]);
          bottom = Math.min(bottom, b.pos[i * 3 + 1]);
        }
      }
      const tall = (top - bottom) * tree.scale;
      const across = 2 * wide * tree.scale;
      assert.ok(Math.hypot(centre.getX(v) - tree.x, centre.getZ(v) - tree.z) < 0.5, `${tree.name}: the card stands on its tree's foot`);
      assert.ok(Math.abs(size.getY(v) - tall) <= 0.1 * tall, `${tree.name}: ${size.getY(v).toFixed(1)} m tall, its tree ${tall.toFixed(1)} m`);
      assert.ok(Math.abs(size.getX(v) - across) <= 0.1 * across, `${tree.name}: ${size.getX(v).toFixed(1)} m wide, its tree ${across.toFixed(1)} m`);
      checked++;
    }
  }
  assert.ok(checked >= 30, `${checked} cards checked`);
});

/**
 * The vista shot at flight time t (engine/camera/flight-camera.js): 30 m behind her, 12 m to her right and 7 m up, looking over her
 * (4 m above her), fov 55. Sets `camera` (its aspect 16:10) and returns { u, her }.
 */
function vistaAt(camera, t) {
  const u = route.progressAt(t);
  const her = route.pointAt(u);
  const tan = route.tangentAt(u);
  const f = new THREE.Vector3(tan.x, 0, tan.z).normalize();
  const right = new THREE.Vector3(-f.z, 0, f.x);
  camera.fov = 55;
  camera.aspect = 16 / 10;
  camera.updateProjectionMatrix();
  camera.position.copy(her).addScaledVector(f, -30).addScaledVector(right, 12).add(new THREE.Vector3(0, 7, 0));
  camera.lookAt(her.x, her.y + 4, her.z);
  camera.updateMatrixWorld();
  return { u, her };
}

test('the vista over the land costs fewer triangles: its far trees are cards', () => {
  const place = litValley();
  const world = litWorldOf;
  const { camera } = world;
  const aspect = camera.aspect;
  const t = 139;
  const { u, her } = vistaAt(camera, t);
  world.flightU = u;
  world.flightPoint = her;
  place.update(DT, t);
  const drawn = cardFrom => place.visible.reduce((sum, i) => sum + cullBatches(plantsOf(place.stats.sections[i]), camera, 1.5, null, cardFrom), 0);
  const all = drawn(Infinity);
  const carded = drawn(FOREST.lod.cardFrom);
  world.flightPoint = null;
  camera.fov = 40;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  assert.ok(carded <= 0.75 * all, `${carded} triangles with cards, ${all} without (${(100 * (1 - carded / all)).toFixed(0)} % fewer)`);
});

// ---- the land above the falls (chapters/kafli4-route.js: HILLS, OUTCROPS, STREAMS, PONDS, MEADOW) -----------------------------

const TREE_NAMES = new Set(['broadleaf', 'araucaria', 'treeFern', 'swampConifer', 'deadSnag']);
const WIDE_SHOT = 128; // the wide shot (vista) is on from F (125 s) to the side shot (131 s): its middle

test('the land above the falls rolls: soft hills, each inside the corridor, rising over its own foot', () => {
  const terrain = createTerrain(route, { seed: 4 });
  const index = createRouteIndex(route);
  const out = {};
  assert.ok(HILLS.length >= 3 && HILLS.length <= 5, `${HILLS.length} hills`);
  let tallest = 0;
  for (const [x, z, h, r] of HILLS) {
    assert.ok(h >= 3 && h <= 8 && r >= 40 && r <= 90, `a hill ${h} m high and ${r} m round`);
    assert.ok(terrain.where(x, z).d >= terrain.fallsD && terrain.where(x, z).e > 20, `the hill at (${x}, ${z}) stands on the land above the falls, off the river`);
    index.nearest(x, z, Infinity, out);
    assert.ok(out.dist + r + 10 <= CORRIDOR, `the hill at (${x}, ${z}) is inside the corridor with 10 m to spare`);
    let foot = 0;
    for (let k = 0; k < 16; k++) foot += terrain.heightAt(x + r * Math.cos((k * Math.PI) / 8), z + r * Math.sin((k * Math.PI) / 8)) / 16;
    const rise = terrain.heightAt(x, z) - foot;
    assert.ok(rise >= h - 1, `the hill at (${x}, ${z}) rises ${rise.toFixed(1)} m over its foot (${h} m)`);
    tallest = Math.max(tallest, rise);
  }
  assert.ok(tallest >= 6, `the tallest hill rises ${tallest.toFixed(1)} m`);
});

test('streams run down into the river and ponds hold their water', () => {
  const terrain = createTerrain(route, { seed: 4 });
  const { streams, ponds } = terrain.waters;
  assert.equal(streams.length, STREAMS.length);
  assert.ok(STREAMS.length >= 1 && STREAMS.length <= 2, `${STREAMS.length} streams`);
  for (const [i, stream] of streams.entries()) {
    assert.ok(stream.half >= 0.75 && stream.half <= 1.5, `stream ${i}: ${2 * stream.half} m wide`);
    let last = Infinity;
    for (let m = 0; m <= stream.length; m++) {
      const level = stream.levelAt(m);
      assert.ok(level <= last + 1e-9, `stream ${i}: its level rises at ${m} m`);
      last = level;
      const [x, z, side] = stream.pointAt(m);
      if (m > 2 && m < stream.length - 2) {
        assert.ok(terrain.heightAt(x, z) <= level - 0.3, `stream ${i}: its bed under its water at ${m} m`);
        assert.ok(terrain.heightAt(x + side[0] * (stream.half + 3), z + side[1] * (stream.half + 3)) >= level, `stream ${i}: its bank over its water at ${m} m`);
      }
    }
    assert.ok(stream.levelAt(0) > stream.levelAt(stream.length) + 0.5, `stream ${i} falls along its length`);
    const [ex, ez] = stream.pointAt(stream.length);
    const w = terrain.where(ex, ez);
    assert.ok(w.d >= terrain.fallsD && Math.abs(w.e) <= 2, `stream ${i} ends ${w.e.toFixed(1)} m from the upper river's edge`);
    assert.ok(stream.levelAt(stream.length) >= w.level - 0.05, `stream ${i} runs into the river, not up out of it`);
  }
  assert.equal(ponds.length, PONDS.length);
  assert.ok(PONDS.length >= 2 && PONDS.length <= 3, `${PONDS.length} ponds`);
  for (const [i, pond] of ponds.entries()) {
    assert.ok(pond.radius >= 8 && pond.radius <= 14, `pond ${i}: ${pond.radius} m round`);
    assert.ok(terrain.where(pond.x, pond.z).d >= terrain.fallsD, `pond ${i} is above the falls`);
    assert.ok(terrain.heightAt(pond.x, pond.z) <= pond.level - 0.6, `pond ${i} is deep enough to hold water`);
    for (let k = 0; k < 36; k++) {
      const a = (k * Math.PI) / 18;
      const rim = terrain.heightAt(pond.x + (pond.radius + 0.5) * Math.cos(a), pond.z + (pond.radius + 0.5) * Math.sin(a));
      assert.ok(rim > pond.level + 0.05, `pond ${i}: its rim ${(rim - pond.level).toFixed(2)} m over its water at ${k * 10}°`);
    }
  }
});

test('each pond has its lilies and reed, the streams and ponds are drawn at their levels, and nothing else grows in them', () => {
  const place = litValley();
  const { streams, ponds } = place.terrain.waters;
  const all = place.stats.sections.flatMap(part => part.userData.placements);
  for (const [i, pond] of ponds.entries()) {
    const lilies = all.filter(p => p.name === 'waterLily' && Math.hypot(p.x - pond.x, p.z - pond.z) < pond.radius);
    const reed = all.filter(p => p.name.startsWith('horsetail') && Math.hypot(p.x - pond.x, p.z - pond.z) < pond.radius + 5);
    assert.ok(lilies.length >= 3 && lilies.every(p => Math.abs(p.y - pond.level) < 0.1), `pond ${i}: ${lilies.length} lilies on its water`);
    assert.ok(reed.length >= 6, `pond ${i}: ${reed.length} reeds round it`);
    const inIt = all.filter(p => p.name !== 'waterLily' && !p.name.startsWith('horsetail') && Math.hypot(p.x - pond.x, p.z - pond.z) < pond.radius - 0.5);
    assert.equal(inIt.length, 0, `pond ${i}: ${inIt.map(p => p.name).join(', ')} in its water`);
  }
  for (const [i, stream] of streams.entries()) {
    for (const p of all) {
      const near = stream.nearest(p.x, p.z);
      assert.ok(near.dist >= stream.half + 0.3 || near.m > stream.length - 1, `stream ${i}: a ${p.name} in its water at ${near.m.toFixed(0)} m`);
    }
  }
  const waters = place.group.getObjectByName('Árdalur upper waters');
  assert.ok(waters, 'the streams and ponds are drawn');
  const box = new THREE.Box3().setFromObject(waters);
  for (const pond of ponds) assert.ok(box.containsPoint(new THREE.Vector3(pond.x, pond.level, pond.z)), 'a pond in the waters');
  for (const stream of streams) {
    const [x, z] = stream.pointAt(stream.length / 2);
    assert.ok(box.containsPoint(new THREE.Vector3(x, stream.levelAt(stream.length / 2), z)), 'a stream in the waters');
  }
});

test('outcrops of rock stand on the land above the falls', () => {
  const place = litValley();
  const all = place.stats.sections.flatMap(part => part.userData.placements);
  assert.ok(OUTCROPS.length >= 4 && OUTCROPS.length <= 6, `${OUTCROPS.length} outcrops`);
  for (const [x, z, scale] of OUTCROPS) {
    assert.ok(scale >= 2 && scale <= 4);
    assert.ok(place.terrain.where(x, z).d >= place.terrain.fallsD, `the outcrop at (${x}, ${z}) is above the falls`);
    assert.ok(all.some(p => p.name === 'rock' && Math.hypot(p.x - x, p.z - z) < 0.01 && p.scale === scale), `a rock at (${x}, ${z})`);
  }
});

test('the meadow is open and in the middle of the wide shot', () => {
  const place = litValley();
  const [mx, mz, radius] = MEADOW;
  assert.ok(place.terrain.where(mx, mz).d >= place.terrain.fallsD, 'the meadow is above the falls');
  const all = place.stats.sections.flatMap(part => part.userData.placements);
  const trees = all.filter(p => TREE_NAMES.has(p.name) && Math.hypot(p.x - mx, p.z - mz) < radius);
  assert.equal(trees.length, 0, `${trees.length} trees in the meadow`);
  const camera = new THREE.PerspectiveCamera(55, 16 / 10, 0.5, 4000);
  vistaAt(camera, WIDE_SHOT);
  const p = new THREE.Vector3(mx, place.terrain.heightAt(mx, mz), mz).project(camera);
  assert.ok(p.z < 1 && Math.abs(p.x) <= 1 / 3 && Math.abs(p.y) <= 1 / 3, `the meadow's middle at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) in the frame`);
});

// ---- groves and glades (banks.js: groveAt) ----------------------------------------------------------------------------------------

/** Where trees may grow at all (banks.js: the near and far zones), on a 10 m grid over the corridor: [x, z] each. */
function treeLand(terrain) {
  const index = createRouteIndex(route);
  const out = {};
  const land = [];
  for (let x = -1700; x <= 250; x += 10) {
    for (let z = -260; z <= 460; z += 10) {
      if (index.nearest(x, z, CORRIDOR, out) < 0) continue;
      const w = terrain.where(x, z);
      if (w.e < 6 || w.fen > 0.6 || w.gorge > 0.5 || w.toPool < route.pool.radius + 5) continue;
      land.push([x, z]);
    }
  }
  return land;
}

test('trees grow in groves with glades between', () => {
  const place = litValley();
  const land = treeLand(place.terrain);
  // the groves: blobs 60 to 120 m across, about 45 % of the land
  const grove = land.filter(([x, z]) => groveAt(x, z, 4) >= 0.5).length / land.length;
  assert.ok(grove >= 0.35 && grove <= 0.55, `${(grove * 100).toFixed(0)} % of the land in groves`);
  let edges = 0, runs = 0, lines = 0;
  for (let z = -200; z <= 400; z += 40) {
    let last = null;
    for (let x = -1600; x <= 200; x += 5) {
      const now = groveAt(x, z, 4) >= 0.5;
      if (last !== null && now !== last) edges++;
      last = now;
    }
    runs += 1800;
    lines++;
  }
  const across = runs / (edges + lines); // the mean length of a grove or a glade along a line
  assert.ok(across >= 60 && across <= 120, `groves and glades ${across.toFixed(0)} m across`);
  // trees a hectare in the groves (groveAt 0.6 or more) and in the glades (0.2 or less)
  const area = { grove: 0, glade: 0 };
  for (const [x, z] of land) {
    const g = groveAt(x, z, 4);
    if (g >= 0.6) area.grove += 0.01;
    else if (g <= 0.2) area.glade += 0.01;
  }
  const trees = { grove: 0, glade: 0 };
  const props = new Set(place.animals.props.map(p => `${p.x}:${p.z}`));
  for (const p of place.stats.sections.flatMap(part => part.userData.placements)) {
    if (!TREE_NAMES.has(p.name) || props.has(`${p.x}:${p.z}`)) continue;
    const w = place.terrain.where(p.x, p.z);
    if (w.e < 6 || w.fen > 0.6 || w.gorge > 0.5) continue;
    const g = groveAt(p.x, p.z, 4);
    if (g >= 0.6) trees.grove++;
    else if (g <= 0.2) trees.glade++;
  }
  const dense = trees.grove / area.grove, open = trees.glade / area.glade;
  assert.ok(dense >= 3 * open, `${dense.toFixed(1)} trees a hectare in the groves, ${open.toFixed(1)} in the glades`);
});

test('each group is seen from the river: no tree behind it within 25 m', () => {
  const place = litValley();
  const props = new Set(place.animals.props.map(p => `${p.x}:${p.z}`));
  const all = place.stats.sections.flatMap(part => part.userData.placements);
  for (const g of place.animals.groups) {
    const side = place.terrain.where(g.point.x, g.point.z).side;
    const behind = all.filter(p => TREE_NAMES.has(p.name) && !props.has(`${p.x}:${p.z}`) && Math.hypot(p.x - g.point.x, p.z - g.point.z) < 25
      && place.terrain.where(p.x, p.z).side === side);
    assert.equal(behind.length, 0, `${g.id}: ${behind.map(p => `a ${p.name} ${Math.hypot(p.x - g.point.x, p.z - g.point.z).toFixed(0)} m off`).join(', ')}`);
  }
});

/** The placements of the real valley in 5 m cells, and those within r of (x, z), seen from above. */
function placementsNear(place) {
  const cells = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const q of place.stats.sections.flatMap(part => part.userData.placements)) {
    const k = key(Math.floor(q.x / 5), Math.floor(q.z / 5));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(q);
  }
  return (x, z, r) => {
    const out = [];
    const span = Math.ceil(r / 5);
    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        for (const q of cells.get(key(Math.floor(x / 5) + i, Math.floor(z / 5) + j)) ?? []) if (Math.hypot(q.x - x, q.z - z) <= r) out.push(q);
      }
    }
    return out;
  };
}

test('the banks of A to C are green: a plant at least every 4 m of bank, low by the animals', () => {
  const place = litValley();
  const near = placementsNear(place);
  const props = [...place.animals.props, ...place.life.props];
  const isProp = q => props.some(p => Math.hypot(p.x - q.x, p.z - q.z) < 0.01);
  const clear = [...place.animals.clear, ...place.life.clear];
  const paths = [route.cameos.bank.path, route.cameos.rim.path];
  const onPath = (x, z) => paths.some(path => path.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7));
  let samples = 0;
  let green = 0;
  const bare = [];
  for (let d = 0; d <= 850; d += 2) {
    const r = route.river.at(d);
    for (const side of [-1, 1]) {
      for (const e of [1, 3.5, 6]) {
        const x = r.x - r.dir[1] * side * (r.half + e);
        const z = r.z + r.dir[0] * side * (r.half + e);
        if (clear.some(c => Math.hypot(x - c.x, z - c.z) < c.r) || onPath(x, z)) continue;
        samples++;
        if (near(x, z, 3).some(q => q.name !== 'waterLily')) green++;
        else bare.push(`d ${d} side ${side} e ${e}`);
      }
    }
  }
  assert.ok(green / samples >= 0.8, `${(100 * green / samples).toFixed(1)} % of ${samples} spots on the banks have a plant within 3 m (bare: ${bare.slice(0, 6).join('; ')} ...)`);
  // nothing but low plants within 10 m of a group, on its side of the river: the child sees the animals, not the reed
  for (const g of place.animals.groups) {
    const side = place.terrain.where(g.point.x, g.point.z).side;
    for (const q of near(g.point.x, g.point.z, 10)) {
      if (isProp(q) || place.terrain.where(q.x, q.z).side !== side) continue;
      const h = q.model.height * q.scale;
      assert.ok(h <= 0.6, `${g.id}: a ${q.name} ${h.toFixed(2)} m tall stands ${Math.hypot(q.x - g.point.x, q.z - g.point.z).toFixed(1)} m from it`);
    }
  }
});

test('the big call\'s rows of small lizards run where nothing grows: no plant over 0.5 m within 2 m of the line a row runs (life.js)', () => {
  const place = litValley();
  const near = placementsNear(place);
  const wrong = [];
  for (const row of place.life.rows) {
    const tail = Math.min(...row.members.map(m => m.along));
    for (let a = tail; a <= row.length; a += 1) {
      const x = row.from[0] + row.dir[0] * a, z = row.from[1] + row.dir[1] * a;
      for (const q of near(x, z, 2)) {
        const h = q.model.height * q.scale;
        if (h > 0.5) wrong.push(`${row.id} at ${a.toFixed(0)} m: a ${q.name} ${h.toFixed(2)} m tall ${Math.hypot(q.x - x, q.z - z).toFixed(1)} m off`);
      }
    }
  }
  assert.deepEqual(wrong.slice(0, 8), [], `${wrong.length} plants in the rows' way`);
});

test('the herd grazes and goes where nothing grows: no plant over 0.5 m within 2.5 m of where a grazer stands or the line it goes (life.js)', () => {
  const place = litValley();
  const near = placementsNear(place);
  const wrong = [];
  assert.equal(place.life.herd.length, 3, 'the herd, in its three groups');
  for (const group of place.life.herd) {
    for (const m of group.members) {
      for (let a = 0; a <= group.room; a += 1) {
        const x = m.at.x + group.dir[0] * a, z = m.at.z + group.dir[1] * a;
        for (const q of near(x, z, 2.5)) {
          const h = q.model.height * q.scale;
          if (h > 0.5) wrong.push(`${m.id} at ${a.toFixed(0)} m: a ${q.name} ${h.toFixed(2)} m tall ${Math.hypot(q.x - x, q.z - z).toFixed(1)} m off`);
        }
      }
    }
  }
  assert.deepEqual(wrong.slice(0, 8), [], `${wrong.length} plants in the herd's way`);
});

test('the still shots see what they show: nothing tall by the camera, nothing on the line of sight', () => {
  const place = litValley();
  const near = placementsNear(place);
  const views = stillViews(route, { heightAt: place.heightAt });
  for (const shot of ['belowTakeOff', 'waterLevel', 'mosiBank', 'bankShadow', 'gorgeHigh', 'mosiRim', 'fallsSide', 'fallsTop']) {
    assert.ok(views.some(v => v.shot === shot), `a view of ${shot}`);
  }
  const wrong = [];
  for (const view of views) {
    const p = view.position;
    for (const q of near(p.x, p.z, 6)) {
      const h = q.model.height * q.scale;
      if (h > 0.5) wrong.push(`${view.shot} (${view.from} s): a ${q.name} ${h.toFixed(2)} m tall ${Math.hypot(q.x - p.x, q.z - p.z).toFixed(1)} m from the camera`);
    }
    const blocking = new Set();
    for (const look of view.looks) {
      const length = p.distanceTo(look);
      for (let k = 0; k <= length; k += 0.25) {
        const s = p.clone().lerp(look, k / length);
        for (const q of near(s.x, s.z, 9)) {
          if (blocking.has(q)) continue;
          const body = bodyOf(q.model, q.scale);
          const across = Math.hypot(q.x - s.x, q.z - s.z) - body.r;
          const up = Math.max(0, q.y - s.y, s.y - (q.y + body.h));
          if (Math.hypot(Math.max(0, across), up) < 1) {
            blocking.add(q);
            wrong.push(`${view.shot} (${view.from} s): a ${q.name} at ${q.x.toFixed(1)}, ${q.z.toFixed(1)} in the line of sight`);
          }
        }
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('the river runs: lazy below the rapids, white water only from where they begin to the falls, lilies in the lazy reach', () => {
  const place = litValley();
  const river = place.group.getObjectByName('Árdalur river');
  const { position, aFlow, aWater } = river.geometry.attributes;
  assert.ok(aFlow && aWater, 'the river carries the water\'s flow and shore');
  const fallsD = route.river.falls;
  let white = 0;
  for (let i = 0; i < position.count; i++) {
    const { d } = route.river.nearest(position.getX(i), position.getZ(i));
    const speed = Math.hypot(aFlow.getX(i), aFlow.getY(i));
    const dir = route.river.at(d).dir;
    assert.ok(aFlow.getX(i) * dir[0] + aFlow.getY(i) * dir[1] <= 0, `d=${d.toFixed(0)}: the water runs downstream`);
    if (d < RAPIDS.from - 5) {
      assert.ok(Math.abs(speed - 0.4) < 0.05, `d=${d.toFixed(0)}: the lazy reach drifts at ${speed.toFixed(2)} m/s`);
      assert.equal(aWater.getZ(i), 0, `d=${d.toFixed(0)}: no white water in the lazy reach`);
    }
    if (d > fallsD + 1) assert.equal(aWater.getZ(i), 0, `d=${d.toFixed(0)}: no white water above the falls`);
    if (d > route.gorge.from + 5 && d < route.gorge.to - 5) {
      assert.ok(speed > 2.4, `d=${d.toFixed(0)}: the gorge's rapids run at ${speed.toFixed(2)} m/s`);
      assert.ok(aWater.getZ(i) > 0.6, `d=${d.toFixed(0)}: white water in the gorge`);
      white++;
    }
  }
  assert.ok(white > 20);
  assert.equal(whiteAt(route, RAPIDS.from - 1), 0);
  assert.ok(whiteAt(route, route.gorge.from + 10) > 0.6);
  assert.ok(Math.abs(flowAt(route, 100) - 0.4) < 1e-6);
  assert.ok(Math.abs(flowAt(route, 1000) - 2.5) < 1e-6);
  // the lilies float on the lazy reach, near its banks, round the far pool and on the land's ponds above the falls (calm water all)
  const onPond = p => place.terrain.waters.ponds.find(pond => Math.hypot(p.x - pond.x, p.z - pond.z) < pond.radius);
  for (const p of place.stats.sections.flatMap(part => part.userData.placements.filter(onPond))) {
    if (p.name === 'waterLily') assert.ok(Math.abs(p.y - onPond(p).level) < 0.1, "a lily floats at its pond's level");
  }
  const lilies = place.stats.sections.flatMap(part => part.userData.placements.filter(p => p.name === 'waterLily' && !onPond(p)));
  const inPool = p => Math.hypot(p.x - route.pool.center[0], p.z - route.pool.center[1]) < route.pool.radius - 1;
  assert.ok(lilies.filter(p => !inPool(p)).length > 20, `${lilies.length} lilies`);
  assert.ok(lilies.some(inPool), 'lilies on the far pool');
  for (const p of lilies) {
    if (inPool(p)) {
      assert.ok(Math.abs(p.y - route.pool.level) < 0.05, 'a lily floats at the pool\'s level');
      continue;
    }
    const n = route.river.nearest(p.x, p.z);
    const at = route.river.at(n.d);
    assert.ok(n.d < RAPIDS.from, `a lily at d=${n.d.toFixed(0)} is in the lazy reach`);
    assert.ok(n.dist < at.half - 0.5, 'a lily is on the water');
    assert.ok(Math.abs(p.y - at.level) < 0.05, `a lily floats at the water's level (${(p.y - at.level).toFixed(3)})`);
  }
});

test('the plants keep out of her flight lane: none within 3 m of her path, at any steer', () => {
  const place = litValley();
  const plants = place.stats.sections.flatMap(part => part.userData.placements);
  // each plant as an upright cylinder: its crown's reach round its foot, from its foot to its top
  const bodies = plants.map(p => {
    const m = p.models[0].model;
    const crown = m.crown ? Math.hypot(m.crown.c[0], m.crown.c[2]) + m.crown.r : 0;
    return { x: p.x, z: p.z, y0: p.y, y1: p.y + m.height * p.scale, r: Math.max(m.radius, crown) * p.scale, name: p.name };
  });
  const side = new THREE.Vector3();
  for (let t = LEAP + 1.5; t <= BEATS.END; t += 0.25) {
    const u = route.progressAt(t);
    const p = route.pointAt(u);
    const tan = route.tangentAt(u);
    side.set(-tan.z, 0, tan.x).normalize();
    const lane = route.lanes.find(l => u >= l.from && u <= l.to);
    const reach = lane ? [-lane.half, -lane.half / 2, 0, lane.half / 2, lane.half] : [0];
    for (const k of reach) {
      const x = p.x + side.x * k;
      const z = p.z + side.z * k;
      for (const b of bodies) {
        const across = Math.hypot(b.x - x, b.z - z) - b.r;
        if (across > 3) continue;
        const up = Math.max(0, b.y0 - p.y, p.y - b.y1);
        assert.ok(Math.hypot(Math.max(0, across), up) >= 3, `t=${t} aside ${k}: a ${b.name} ${Math.hypot(Math.max(0, across), up).toFixed(2)} m from her`);
      }
    }
  }
  assert.ok(bodies.length > 1000, `${bodies.length} plants`);
});

test('high over dry land no tree crown rises within 9 m under her, so the chase camera sees the land, not a crown', () => {
  const place = litValley();
  const { terrain } = place;
  const trees = new Set(['broadleaf', 'araucaria', 'treeFern', 'swampConifer', 'deadSnag']);
  const crowns = place.stats.sections.flatMap(part => part.userData.placements).filter(p => trees.has(p.name)).map(p => {
    const m = p.models[0].model;
    const crown = m.crown ? Math.hypot(m.crown.c[0], m.crown.c[2]) + m.crown.r : 0;
    return { x: p.x, z: p.z, top: p.y + m.height * p.scale, r: Math.max(m.radius, crown) * p.scale, name: p.name };
  });
  let high = 0;
  for (let t = LEAP + 1.5; t <= BEATS.END; t += 0.25) {
    const p = route.pointAt(route.progressAt(t));
    // low, or over the river or the pool (along it, up the falls): the banks' and the rim's trees stand beside her there
    const w = terrain.where(p.x, p.z);
    if (p.y - terrain.heightAt(p.x, p.z) < HIGH || w.e <= 0 || w.toPool <= route.pool.radius) continue;
    high++;
    for (const c of crowns) {
      if (Math.hypot(c.x - p.x, c.z - p.z) - c.r >= 14) continue;
      assert.ok(p.y - c.top >= 9, `t=${t}: a ${c.name}'s top ${(p.y - c.top).toFixed(1)} m under her, ${(Math.hypot(c.x - p.x, c.z - p.z) - c.r).toFixed(1)} m aside`);
    }
  }
  assert.ok(high > 100, `${high} quarter seconds high over the land`);
});

test('the reeds bend under her: the plants\' downwash follows her, 8 m round', () => {
  const world = litWorld();
  const place = createArdalur(world, { grey: false, route });
  world.flightU = route.progressAt(30);
  world.flightPoint = route.pointAt(world.flightU);
  world.camera.position.copy(world.flightPoint).add(new THREE.Vector3(0, 3, 8));
  world.camera.lookAt(world.flightPoint);
  world.camera.updateMatrixWorld();
  place.update(DT, 30);
  const wash = place.downwash;
  assert.deepEqual([wash.x, wash.y, wash.z, wash.w], [world.flightPoint.x, world.flightPoint.y, world.flightPoint.z, 8]);
  // no flight: nothing bends
  world.flightU = null;
  world.flightPoint = null;
  place.update(DT, 31);
  assert.equal(place.downwash.w, 0);
  place.dispose();
});

// main.js draws a place once before the start button shows (chapter.readyFirst: chapter 4's Árdalurinn), a group of its meshes a
// frame, each group building its shaders then; a mesh made later builds its shaders where it is first drawn. The white tree's black
// drew the whole valley again for them, 2.4-4.9 s in one frame (the crowds' animals: instanced, with morph frames).
test('all the valley draws is made with it: its first frames make nothing new to draw', async () => {
  const critters = {
    smaedla: crowdModelFrom(await loadGlb(new URL(SMAEDLA_MODEL))),
    grasbitur: grazer,
    flugdyr: crowdModelFrom(await loadGlb(new URL(FLUGDYR_MODEL))),
  };
  const world = { ...litWorld(), clock: { time: 0 }, flightTime: null };
  const place = createArdalur(world, { grey: false, route, critters });
  place.buildAll();
  // what a draw builds a shader for: each material a mesh draws with (its shadow's too), and how it draws it
  const drawsWith = () => {
    const out = new Set();
    place.group.traverse(o => {
      if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
      const how = `${o.isInstancedMesh ? ' instanced' : ''}${o.morphTexture ? ' morphing' : ''}${o.isSkinnedMesh ? ' skinned' : ''}`;
      for (const m of [o.material, o.customDepthMaterial].flat().filter(Boolean)) out.add(`${o.name || o.type}: ${m.name || m.type} ${m.uuid}${how}`);
    });
    return out;
  };
  const made = drawsWith();
  for (const t of [0, BEATS.C + 5, BEATS.F + 5, BEATS.G + 5]) {
    world.flightTime = t;
    world.clock.time = 100 + t;
    world.flightU = route.progressAt(t);
    world.camera.position.copy(route.pointAt(world.flightU)).add(new THREE.Vector3(0, 3, 8));
    world.camera.updateMatrixWorld();
    place.update(DT, world.clock.time);
  }
  const later = [...drawsWith()].filter(k => !made.has(k));
  assert.deepEqual(later, [], 'nothing is drawn that was not there once the valley was built');
  place.dispose();
});

test('from down in the gorge the ground hides most plants above the falls: the cull leaves those out, and only those', () => {
  const place = litValley();
  const world = litWorldOf;
  const { terrain } = place;
  const sight = createGorgeSight(route, terrain, createRouteIndex(route));
  const parts = place.stats.sections;
  // the plants above the falls are batched on their own
  const aboveMeshes = part => part.children.find(o => o.name === 'Árdalur plants').children.filter(mesh => mesh.userData.sector === ABOVE_SECTOR);
  for (const part of parts) {
    for (const p of part.userData.placements) assert.equal(p.sector === ABOVE_SECTOR, p.d > route.river.falls + 2, `a plant ${p.d.toFixed(1)} m up the river`);
  }
  const withAbove = parts.filter(part => aboveMeshes(part).length > 0);
  assert.ok(withAbove.length >= 2, `${withAbove.length} sections have plants above the falls`);

  // the view up the gorge at t 90 (the capture's camera): most of them are left out; a plain cull of the same view would draw them
  const look = (x, y, z, tx, ty, tz, t) => {
    world.flightU = route.progressAt(t);
    world.flightPoint = null;
    world.camera.position.set(x, y, z);
    world.camera.lookAt(tx, ty, tz);
    world.camera.updateMatrixWorld();
    place.update(DT, t);
  };
  const drawn = () => withAbove.filter(part => part.visible)
    .reduce((n, part) => n + aboveMeshes(part).reduce((m, mesh) => m + (mesh.visible ? mesh.geometry.drawRange.count / 3 : 0), 0), 0);
  look(-1102.2, 15, 164.5, -1347, 50, 126, 90);
  assert.ok(sight.active(world.camera.position), 'the rule is on down in the gorge');
  const ruled = drawn();
  for (const part of withAbove) if (part.visible) cullBatches(aboveMeshes(part), world.camera);
  const plain = drawn();
  assert.ok(plain > 20000, `a plain cull draws ${plain} triangles above the falls at t 90`); // the groves and the meadow (banks.js) leave fewer in this view
  assert.ok(ruled < plain * 0.25, `the rule draws ${ruled} of them`);
  // over the lip, looking up the valley: the rule is off
  look(-1350, 61, 125.6, -1470, 70, 92, 112);
  assert.equal(sight.active(world.camera.position), false);
  world.flightU = null;

  // wherever the rule leaves a plant out, the ground truly hides it: cameras all down the gorge (three heights, three places across)
  // and up the falls' face (her path and a chase camera's), and for each the line from the camera to the top of each plant left out
  // (its crown and four points round it) must pass under the ground somewhere, the ground read every metre along it
  const blocked = (c, x, y, z) => {
    const D = Math.hypot(x - c.x, z - c.z);
    for (let s = 1; s < D; s += 1) {
      const k = s / D;
      if (terrain.heightAt(c.x + (x - c.x) * k, c.z + (z - c.z) * k) > c.y + (y - c.y) * k + 0.3) return true;
    }
    return false;
  };
  const cameras = [];
  for (let d = GORGE.from; d < route.river.falls; d += 60) {
    const at = route.river.at(d);
    for (const across of [-0.6, 0, 0.6]) {
      for (const up of [1.5, 8, 20]) cameras.push(new THREE.Vector3(at.x - at.dir[1] * at.half * across, at.level + up, at.z + at.dir[0] * at.half * across));
    }
  }
  for (const [x, y, z] of [[-1296, 14.6, 128.5], [-1318, 16, 127], [-1332, 22, 126.5], [-1338.5, 32, 126.2], [-1340.5, 43, 126]]) {
    cameras.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x + 8, y + 3, z));
  }
  const ranges = withAbove.flatMap(part => aboveMeshes(part).flatMap(mesh => mesh.userData.cull.ranges));
  let hidden = 0;
  let checked = 0;
  for (const camera of cameras) {
    if (!sight.active(camera)) continue;
    const left = ranges.filter(r => sight.hidden(camera, r.sphere));
    hidden += left.length;
    const step = Math.max(1, Math.floor(left.length / 30));
    for (let k = 0; k < left.length; k += step) {
      const { center: { x, y, z }, radius: r } = left[k].sphere;
      for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        checked++;
        assert.ok(blocked(camera, x + ox, y + r, z + oz), `a plant at ${(x + ox).toFixed(1)}, ${(y + r).toFixed(1)}, ${(z + oz).toFixed(1)} is in sight of ${camera.toArray().map(v => v.toFixed(1))}`);
      }
    }
  }
  assert.ok(hidden > ranges.length * 10, `the rule left out ${hidden} plant pieces in all (${ranges.length} pieces, ${cameras.length} cameras)`);
  assert.ok(checked > 3000, `${checked} sight lines checked`);
});

test('low over the fen the far plants deep in the haze are left out, and only those: near ones and the view from up high keep all', () => {
  const place = litValley();
  const world = litWorldOf;
  const { look } = world;
  world.scene.fog = new THREE.FogExp2(look.fog.color, look.fog.density); // as engine/fog.js installs it
  const haze = createHazeSight(world);
  const meshes = () => place.stats.sections.filter(part => part.visible)
    .flatMap(part => part.children.find(o => o.name === 'Árdalur plants').children);
  const view = t => {
    // a chase camera's view: 12 m behind her and 2 m up, looking 40 m ahead along her path
    const at = route.pointAt(route.progressAt(t));
    const ahead = route.pointAt(route.progressAt(t + 2));
    const back = new THREE.Vector3(at.x - ahead.x, 0, at.z - ahead.z).normalize();
    world.flightU = route.progressAt(t);
    world.flightPoint = null;
    world.camera.position.set(at.x + back.x * 12, at.y + 2, at.z + back.z * 12);
    world.camera.lookAt(ahead.x, ahead.y, ahead.z);
    world.camera.updateMatrixWorld();
    place.update(DT, t);
    const kept = { far: 0, near: 0 };
    for (const mesh of meshes()) if (mesh.visible) kept[mesh.userData.band] += mesh.userData.cull.kept.reduce((n, r) => n + r.count / 3, 0);
    return kept;
  };
  const plain = () => {
    const kept = { far: 0, near: 0 };
    for (const mesh of meshes()) {
      cullBatches([mesh], world.camera);
      if (mesh.visible) kept[mesh.userData.band] += mesh.userData.cull.kept.reduce((n, r) => n + r.count / 3, 0);
    }
    return kept;
  };
  for (const t of [22, 30, 40.45]) {
    const ruled = view(t);
    const all = plain();
    assert.ok(all.far > 30000, `t ${t}: a plain cull draws ${all.far} far triangles`);
    assert.ok(ruled.far < all.far * 0.85, `t ${t}: the haze rule draws ${ruled.far} of ${all.far} far triangles`);
    assert.equal(ruled.near, all.near, `t ${t}: the near band is never left out for haze`);
    // every far piece left out is more than FOG_CUT fogged at its nearest point and at its top; every one kept is less
    view(t);
    const cam = world.camera.position;
    for (const mesh of meshes()) {
      if (mesh.userData.band !== 'far') continue;
      const kept = new Set(mesh.userData.cull.kept);
      cullBatches([mesh], world.camera);
      for (const r of mesh.userData.cull.kept) {
        const { center: c, radius } = r.sphere;
        const toward = new THREE.Vector3().subVectors(cam, c).normalize().multiplyScalar(radius).add(c);
        const fog = Math.min(fogBetween(cam, toward, look.fog.density, look.fog.heightFalloff),
          fogBetween(cam, new THREE.Vector3(c.x, c.y + radius, c.z), look.fog.density, look.fog.heightFalloff));
        assert.equal(kept.has(r), fog <= FOG_CUT, `t ${t}: a far piece ${cam.distanceTo(c).toFixed(0)} m away, ${fog.toFixed(3)} fogged`);
      }
    }
  }
  // from up high over the land the haze is thin: nothing is left out
  const high = view(157);
  assert.deepEqual(high, plain(), 'from up high the haze rule leaves nothing out');
  world.flightU = null;
  world.scene.fog = null;
});

test('the haze along a line of sight is engine/fog.js\'s: thicker with distance, thinner the higher the camera', () => {
  const at = (cy, x, y) => fogBetween(new THREE.Vector3(0, cy, 0), new THREE.Vector3(x, y, 0), 0.014, 0.08);
  assert.ok(at(6, 300, 6) > at(6, 200, 6) && at(6, 200, 6) > at(6, 100, 6));
  assert.ok(at(50, 300, 50) < at(6, 300, 6) * 0.2);
  // level line: 1 - exp(-density * e^(-falloff y) * distance)
  assert.ok(Math.abs(at(6, 250, 6) - (1 - Math.exp(-0.014 * Math.exp(-0.08 * 6) * 250))) < 1e-9);
  // a line rising to a crown is less fogged than a level one as long
  assert.ok(at(6, 250, 30) < at(6, Math.hypot(250, 24), 6));
});

// ---- the animal groups (Task 8) -----------------------------------------------------------------------------------------------

/** When she passes route progress u (seconds into the flight). */
function passes(u) {
  let lo = 0;
  let hi = BEATS.END;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (route.progressAt(mid) < u) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
const animalTerrain = createTerrain(route, { seed: 4 });
/** A world for the animals: a scene, the game clock, and her body where the flight has it at game time t. */
function animalWorld() {
  const world = { scene: new THREE.Scene(), clock: { time: 0 }, flightPoint: null, camera: null };
  world.at = t => {
    world.clock.time = t;
    world.flightPoint = route.pointAt(route.progressAt(t));
  };
  return world;
}
const NINE = ['frogs-1', 'lizards-1', 'birds-1', 'frogs-2', 'turtles', 'birds-2', 'lizards-2', 'dragonflies', 'lizards-3'];
const MEMBERS = { frogs: 6, lizards: 10, birds: 10, turtle: 3, dragonflies: 6 };

test('nine animal groups along C, in the order she meets them, each where the route puts it, each a wide tap target', () => {
  const world = animalWorld();
  const animals = createAnimals(world, route, { heightAt: animalTerrain.heightAt });
  assert.deepEqual(animals.groups.map(g => g.id), NINE);
  assert.deepEqual(animals.groups.map(g => [g.id, g.kind]), route.groups.map(g => [g.id, g.kind]));
  for (const g of animals.groups) assert.equal(g.members.length, MEMBERS[g.kind], `${g.id}: ${g.members.length} animals`);
  for (const [i, g] of animals.groups.entries()) {
    assert.ok(g.point.distanceTo(new THREE.Vector3(...route.groups[i].at)) < 6, `${g.id} is by its place on the bank`);
    assert.ok(g.radius >= 3, `${g.id}: a wide tap target (${g.radius} m)`);
    assert.equal(g.answered, false);
  }
  // each critter is one of the game's own (world/critters/models.js), at most 400 triangles, larger than life, and each kind is one
  // draw call however many of it there are
  for (const mesh of animals.crowds.meshes) {
    const triangles = mesh.geometry.attributes.position.count / 3;
    assert.ok(triangles <= 400, `${mesh.name}: ${triangles} triangles`);
  }
  animals.update(DT, 0);
  const all = animals.groups.reduce((n, g) => n + g.members.length, 0);
  assert.equal(animals.crowds.placed().length, all, 'with no camera, every critter is drawn');
  assert.ok(animals.crowds.calls() <= 5, `${animals.crowds.calls()} draw calls for all nine groups`);
  // none under the ground; the dragonflies over the water
  for (const g of animals.groups) {
    for (const m of g.members) {
      const p = m.position;
      assert.ok(m.visible, `${g.id}: every critter is there before she calls`);
      assert.ok(p.y >= animalTerrain.heightAt(p.x, p.z) - 0.05, `${g.id}: a critter under the ground at ${p.toArray().map(v => v.toFixed(1))}`);
      if (g.kind === 'dragonflies') assert.ok(p.y > route.river.at(route.river.nearest(p.x, p.z).d).level + 0.5, 'a dragonfly over the water');
      assert.ok(m.height > 0.1, `${g.id}: drawn larger than life (${m.height.toFixed(2)} m tall)`);
    }
  }
  assert.ok(world.scene.children.includes(animals.group));
  animals.dispose();
  assert.ok(!world.scene.children.includes(animals.group));
});

test('a tap on the birds\' tree calls the birds: the group is the tree\'s crown, and they sit in it', () => {
  const library = createSpeciesLibrary(4);
  const animals = createAnimals(animalWorld(), route, { heightAt: animalTerrain.heightAt, library });
  const birds = animals.groups.filter(x => x.kind === 'birds');
  assert.equal(birds.length, 2, 'two groups of birds in their trees');
  for (const g of birds) {
    // their tree is a prop the plants grow; its crown where the batcher puts it (world/forest/batch.js)
    const tree = animals.props.filter(p => p.name === 'broadleaf').sort((a, b) => Math.hypot(a.x - g.point.x, a.z - g.point.z) - Math.hypot(b.x - g.point.x, b.z - g.point.z))[0];
    assert.ok(tree, `${g.id}: a broadleaf to sit in`);
    const model = library.get('broadleaf', tree.variant, 1, {});
    const c = Math.cos(tree.rot), s = Math.sin(tree.rot), sc = tree.scale;
    const y = tree.y - (model.sink ?? 0) * sc;
    const crown = new THREE.Vector3(tree.x + (model.crown.c[0] * c - model.crown.c[2] * s) * sc, y + model.crown.c[1] * sc, tree.z + (model.crown.c[0] * s + model.crown.c[2] * c) * sc);
    assert.ok(g.point.distanceTo(crown) < 2, `${g.id}: the tap target is the crown (${g.point.distanceTo(crown).toFixed(2)} m off)`);
    assert.ok(g.radius >= 3, `${g.id}: as wide as a crown (${g.radius} m)`);
    for (const m of g.members) assert.ok(m.position.distanceTo(crown) < model.crown.r * sc + 0.5, `${g.id}: a bird in its crown`);
  }
  animals.dispose();
});

test('each group sets off for the festival when it answers, once', () => {
  const world = animalWorld();
  const animals = createAnimals(world, route, { heightAt: animalTerrain.heightAt });
  const levelAt = p => route.river.at(route.river.nearest(p.x, p.z).d).level;
  const dAt = p => route.river.nearest(p.x, p.z).d;
  for (const g of animals.groups) {
    const t0 = passes(route.groups.find(r => r.id === g.id).u);
    world.at(t0);
    animals.update(DT, t0);
    const home = g.members.map(m => m.position.clone());
    const handle = g.answer();
    assert.equal(handle.done, false, `${g.id}: the answer takes time`);
    assert.equal(g.answered, true);
    const seconds = ANSWER[g.kind];
    let rose = 0;
    let neck = 0;
    let closest = Infinity;
    const upstream = g.members.map(() => -Infinity);
    for (let i = 0; i <= Math.round(seconds / DT); i++) {
      const t = t0 + i * DT;
      world.at(t);
      animals.update(DT, t);
      g.members.forEach((m, k) => {
        if (!m.visible) return;
        const p = m.position;
        closest = Math.min(closest, p.distanceTo(world.flightPoint));
        rose = Math.max(rose, p.y - home[k].y);
        upstream[k] = Math.max(upstream[k], dAt(p) - dAt(home[k]));
        if (g.kind === 'turtle') neck = Math.min(neck, m.morphs.hide);
        assert.ok(p.y >= animalTerrain.heightAt(p.x, p.z) - 0.05, `${g.id} ${k}: under the ground at ${(t - t0).toFixed(2)} s`);
        if (g.kind === 'frogs' || g.kind === 'turtle') assert.ok(p.y >= levelAt(p) - 0.05, `${g.id} ${k}: under the water while seen, at ${(t - t0).toFixed(2)} s`);
      });
    }
    const near = g.kind === 'birds' ? 4 : 3; // the birds fly by her, but never close to her body
    assert.ok(closest >= near, `${g.id}: nothing passes within ${near} m of her (${closest.toFixed(2)} m)`);
    // when the answer is over: on their way (gone, or well up the river), but the dragonflies, which come home
    world.at(t0 + seconds);
    animals.update(DT, t0 + seconds);
    assert.equal(handle.done, true, `${g.id}: the answer is over`);
    if (g.kind === 'dragonflies') g.members.forEach(m => assert.ok(m.visible && m.position.distanceTo(m.home) < 0.6, 'the dragonflies come home'));
    else {
      g.members.forEach((m, k) => {
        const away = !m.visible || ((g.kind === 'lizards' || g.kind === 'frogs') && upstream[k] >= 15);
        assert.ok(away, `${g.id} ${k}: set off (seen ${m.visible}, ${upstream[k].toFixed(1)} m upstream)`);
      });
    }
    if (g.kind === 'frogs') assert.ok(rose > 0.8, `a frog leaps off its pad (${rose.toFixed(2)} m up)`);
    if (g.kind === 'birds') assert.ok(rose > 3, `the birds fly up out of their tree (${rose.toFixed(2)} m up)`);
    if (g.kind === 'turtle') assert.ok(neck < -0.4, `the turtles stretch their necks first (hide ${neck.toFixed(2)})`);
    if (g.kind === 'lizards') upstream.forEach((ran, k) => assert.ok(ran >= 15, `lizard ${k} runs up the bank with her (${ran.toFixed(1)} m)`));
    // once: a second answer is a finished Handle, and nothing comes back
    assert.equal(g.answer().done, true, `${g.id} answers once`);
    world.at(t0 + seconds + 3);
    animals.update(DT, t0 + seconds + 3);
    if (g.kind === 'dragonflies') g.members.forEach(m => assert.ok(m.visible && m.position.distanceTo(m.home) < 0.6, 'the dragonflies stay home'));
    else assert.ok(g.members.every(m => !m.visible), `${g.id}: gone for good`);
  }
  animals.dispose();
});

test('the lizards are the owner\'s small lizard: drinking or idle at rest, looking up as she passes over, running as they answer', async () => {
  const smaedla = crowdModelFrom(await loadGlb(new URL(SMAEDLA_MODEL)));
  const world = animalWorld();
  const animals = createAnimals(world, route, { heightAt: animalTerrain.heightAt, critters: { smaedla } });
  // how much of a member's pose is the clip's frames (a pose from clipPose sums to 1)
  const weight = (m, clip) => Object.entries(m.morphs).filter(([name]) => name.startsWith(`${clip}.`)).reduce((sum, [, w]) => sum + w, 0);
  const lizards = animals.groups.filter(g => g.kind === 'lizards');
  assert.equal(lizards.length, 3);
  for (const g of lizards) {
    assert.ok(g.members.every(m => m.kind === 'smaedla'), `${g.id}: small lizards`);
    const t0 = passes(route.groups.find(r => r.id === g.id).u);
    // long before she comes: the row at the edge drinks, the row behind stands about
    world.at(t0 - 20);
    animals.update(DT, t0 - 20);
    g.members.forEach((m, k) => {
      const clip = m.e < 1 ? 'drink' : 'idle';
      assert.ok(Math.abs(weight(m, clip) - 1) < 1e-6, `${g.id} ${k}: ${clip} at rest (${weight(m, clip).toFixed(2)})`);
    });
    // as she passes over them, they look up at her
    world.at(t0);
    animals.update(DT, t0);
    g.members.forEach((m, k) => assert.ok(weight(m, 'look') > 0.9, `${g.id} ${k}: looks up as she passes (${weight(m, 'look').toFixed(2)})`));
    // their answer: they run with her
    g.answer();
    world.at(t0 + 2);
    animals.update(DT, t0 + 2);
    g.members.forEach((m, k) => assert.ok(!m.visible || Math.abs(weight(m, 'run') - 1) < 1e-6, `${g.id} ${k}: runs (${weight(m, 'run').toFixed(2)})`));
    // the run's frames go round with the ground they cover, not on their own: half a second on, other frames
    const before = JSON.stringify(g.members[0].morphs);
    world.at(t0 + 2.5);
    animals.update(DT, t0 + 2.5);
    assert.notEqual(JSON.stringify(g.members[0].morphs), before, `${g.id}: the run goes on`);
  }
  // drawn from the model's two levels: near and far, two draw calls at most for the kind
  assert.equal(animals.crowds.meshes.filter(mesh => mesh.userData.kind === 'smaedla').length, 2);
  animals.dispose();
});

/** Two valleys' animals, each answering at t0 = when she passes the birds' tree; `steps(world, animals)` plays one of them. */
function twoAnswering() {
  const pair = [animalWorld(), animalWorld()].map(world => ({ world, animals: createAnimals(world, route, { heightAt: animalTerrain.heightAt }) }));
  const t0 = passes(route.groups[2].u);
  for (const { world, animals } of pair) {
    world.at(t0);
    animals.update(DT, t0);
    for (const g of animals.groups) g.answer();
  }
  return { pair, t0 };
}
function samePoses(a, b) {
  a.groups.forEach((g, i) => g.members.forEach((m, k) => {
    const other = b.groups[i].members[k];
    assert.ok(m.position.distanceTo(other.position) < 1e-6, `${g.id} ${k}: ${m.position.toArray()} and ${other.position.toArray()}`);
    assert.equal(m.visible, other.visible, `${g.id} ${k}: seen in both`);
    assert.ok(Math.abs(m.heading - other.heading) < 1e-6, `${g.id} ${k}: turned alike`);
    assert.deepEqual(m.morphs, other.morphs, `${g.id} ${k}: posed alike`);
  }));
}

test('an answer is a function of the game clock: jumping to a time lands on the same pose as playing up to it', () => {
  const { pair: [played, jumped], t0 } = twoAnswering();
  for (let t = t0; t < t0 + 3.4; t += DT) {
    played.world.at(t);
    played.animals.update(DT, t);
  }
  for (const { world, animals } of [played, jumped]) {
    world.at(t0 + 3.4);
    animals.update(0, t0 + 3.4);
  }
  samePoses(played.animals, jumped.animals);
  played.animals.dispose();
  jumped.animals.dispose();
});

test('a pause holds an answer: the animals stand still while the game clock does, and go on from there', () => {
  const { pair: [paused, straight], t0 } = twoAnswering();
  for (let t = t0; t <= t0 + 2; t += DT) {
    paused.world.at(t);
    paused.animals.update(DT, t);
  }
  paused.world.at(t0 + 2);
  paused.animals.update(DT, t0 + 2);
  const held = paused.animals.groups.map(g => g.members.map(m => m.position.clone()));
  for (let i = 0; i < 90; i++) paused.animals.update(DT, t0 + 2); // 3 s of frames on a held clock
  paused.animals.groups.forEach((g, i) => g.members.forEach((m, k) => assert.ok(m.position.distanceTo(held[i][k]) < 1e-9, `${g.id} ${k} moved in the pause`)));
  for (let t = t0 + 2; t <= t0 + 4; t += DT) {
    paused.world.at(t);
    paused.animals.update(DT, t);
  }
  for (const { world, animals } of [paused, straight]) {
    world.at(t0 + 4);
    animals.update(DT, t0 + 4);
  }
  samePoses(paused.animals, straight.animals);
  paused.animals.dispose();
  straight.animals.dispose();
});

test('the real valley: the animals have their lily pads, log and stone, and no plant grows on them', () => {
  const place = litValley();
  const animals = place.animals;
  assert.ok(animals, 'the real valley has the animals');
  assert.ok(animals.props.length >= 5, `${animals.props.length} props`);
  const placements = place.stats.sections.flatMap(part => part.userData.placements);
  for (const prop of animals.props) {
    assert.ok(placements.some(p => p.name === prop.name && Math.hypot(p.x - prop.x, p.z - prop.z) < 0.01), `the ${prop.name} at ${prop.x.toFixed(1)}, ${prop.z.toFixed(1)} is grown`);
  }
  for (const g of animals.groups) {
    for (const m of g.members) {
      const p = m.position;
      const crowd = placements.filter(q => !animals.props.some(prop => prop.x === q.x && prop.z === q.z) && q.name !== 'waterLily' && Math.hypot(q.x - p.x, q.z - p.z) < 1.2);
      assert.equal(crowd.length, 0, `${g.id}: ${crowd.map(q => q.name)} grow on a critter at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
    }
  }
  // the grey marks are gone from the real valley
  let marks = 0;
  place.group.traverse(o => { if (o.name === 'Animal groups (marks)') marks++; });
  assert.equal(marks, 0);
});

test('the real valley has the life in the flight (life.js): its trees grown, drawn with the animals, no plant on a critter', () => {
  const place = litValley();
  const { life } = place;
  assert.ok(life, 'the real valley has the life in the flight');
  assert.equal(life.crowds, place.animals.crowds, 'one set of crowds for all the critters');
  const placements = place.stats.sections.flatMap(part => part.userData.placements);
  for (const prop of life.props) {
    assert.ok(placements.some(p => p.name === prop.name && Math.hypot(p.x - prop.x, p.z - prop.z) < 0.01), `the ${prop.name} at ${prop.x.toFixed(1)}, ${prop.z.toFixed(1)} is grown`);
  }
  const props = [...life.props, ...place.animals.props];
  for (const thing of life.things) {
    if (thing.kind === 'bird' || thing.kind === 'fish') continue; // in a crown, under the water
    const p = thing.at;
    const crowd = placements.filter(q => !props.some(prop => prop.x === q.x && prop.z === q.z) && Math.hypot(q.x - p.x, q.z - p.z) < 1.2);
    assert.equal(crowd.length, 0, `${thing.id}: ${crowd.map(q => q.name)} grow on it`);
  }
});

test('a location with build() is used instead of a forest layout', async () => {
  const world = { scene: new THREE.Scene() };
  const place = { group: new THREE.Group(), heightAt: (x, z) => x + z, update() {} };
  const locations = createLocations({
    world,
    locations: { ardalur: { build: w => { assert.equal(w, world); return place; }, shots: {} } },
    build: () => { throw new Error('no forest here'); },
  });
  await locations.setLocation('ardalur');
  assert.equal(world.forest, place);
  assert.equal(world.heightAt(2, 3), 5);
  assert.equal(world.location, 'ardalur');
  assert.equal(place.group.visible, true);
});

test('the real valley has the falls (world/props/waterfall.js) where the grey one has its slot, on the valley clock and sun', () => {
  const world = litWorld();
  world.scene.fog = new THREE.FogExp2('#dfe7df', world.look.fog.density);
  const place = createArdalur(world, { grey: false, route });
  const falls = place.waterfall;
  assert.ok(falls, 'the real look has the falls');
  assert.equal(falls.group.parent, place.group);
  assert.ok(falls.base.x > FALLS.face && Math.abs(falls.base.z - FALLS.z) < 1e-9 && falls.base.y === FALLS.base, 'its foot is at the plunge pool, in front of the cliff');
  const named = (group, name) => { let found = null; group.traverse(o => { if (o.name === name) found = o; }); return found; };
  assert.equal(named(place.group, 'Árdalur falls (slot)'), null, 'and no slot');
  const greyWorld = litWorld();
  const grey = createArdalur(greyWorld, { grey: true, route });
  assert.equal(grey.waterfall, null);
  assert.ok(named(grey.group, 'Árdalur falls (slot)'), 'the grey look keeps its slot');
  // on the valley's clock and its sun, seen from the climb and from high over the land above it
  const view = t => {
    world.flightU = route.progressAt(t);
    world.flightPoint = route.pointAt(world.flightU);
    world.camera.position.copy(world.flightPoint).add(new THREE.Vector3(8, 2, 0));
    world.camera.lookAt(new THREE.Vector3(FALLS.face, 30, FALLS.z));
    world.camera.updateMatrixWorld();
    place.update(DT, t);
  };
  view(112);
  const spray = [];
  falls.group.traverse(o => { if (o.isPoints) spray.push(o); });
  assert.ok(spray.length > 0 && spray.every(o => Math.abs(o.material.uniforms.uTime.value - (112 % 4)) < 1e-9), 'the spray runs on its clock');
  assert.ok(spray.every(o => o.material.uniforms.uShade.value.w < 1e5), 'and the cliff shades it from the valley sun');
  assert.equal(falls.group.visible, true);
  view(135);
  assert.ok(spray.every(o => Math.abs(o.material.uniforms.uTime.value - (135 % 4)) < 1e-9));
  place.dispose();
  grey.dispose();
});

test('the real valley has the far land (far-land.js) round it, where the grey one has the slot\'s cones; shown from the crest of E to the end', () => {
  const world = litWorld();
  world.scene.fog = new THREE.FogExp2('#dfe7df', world.look.fog.density);
  const place = createArdalur(world, { grey: false, route });
  const far = place.farLand;
  assert.ok(far, 'the real look has the far land');
  assert.equal(far.group.parent, place.group);
  const named = (group, name) => { let found = null; group.traverse(o => { if (o.name === name) found = o; }); return found; };
  assert.equal(named(place.group, 'Far land (slot)'), null, 'and no slot');
  const greyWorld = litWorld();
  const grey = createArdalur(greyWorld, { grey: true, route });
  assert.equal(grey.farLand, null);
  assert.ok(named(grey.group, 'Far land (slot)'), 'the grey look keeps its slot');
  // hidden until the flight shows it, and then only from the crest of E to the end of the flight
  assert.equal(far.group.visible, false);
  far.update(FAR.from + 1, world.camera);
  assert.equal(far.group.visible, false, 'not before show()');
  far.show(true);
  for (const [t, on] of [[0, false], [BEATS.E, false], [FAR.from - 0.05, false], [FAR.from, true], [BEATS.F, true], [BEATS.G + 4, true], [BEATS.END - 0.05, true], [BEATS.END + 0.05, false]]) {
    far.update(t, world.camera);
    assert.equal(far.group.visible, on, `${on ? 'shown' : 'hidden'} at ${t} s`);
  }
  // while shown the camera sees to its far edge, and afterwards as far as before
  far.update(BEATS.F, world.camera);
  assert.ok(world.camera.far >= 6000, `the camera sees ${world.camera.far} m`);
  far.update(BEATS.END + 1, world.camera);
  assert.equal(world.camera.far, 1200);
  far.show(false);
  far.update(BEATS.F, world.camera);
  assert.equal(far.group.visible, false, 'show(false) hides it whatever the time');
  place.dispose();
  grey.dispose();
});

test('the far land: the whole map, under the valley\'s own ground in its corridor, mountains to the west, clear of her, within budget', () => {
  const world = litWorld();
  const terrain = createTerrain(route, { seed: 4 });
  const far = createFarLand(world, route, { terrain });
  const box = new THREE.Box3().setFromObject(far.ground);
  assert.ok(box.min.x <= -3000 && box.max.x >= 1500 && box.min.z <= -2500 && box.max.z >= 2500, `it reaches ${box.min.toArray()} to ${box.max.toArray()}`);
  // in the valley's corridor it lies under the valley's own ground, so where a section is shown its ground covers it
  const index = createRouteIndex(route);
  const out = {};
  let tried = 0;
  for (let x = -1500; x <= 200; x += 13) {
    for (let z = -300; z <= 500; z += 11) {
      index.nearest(x, z, 200, out);
      if (out.dist > 120) continue;
      tried++;
      const under = terrain.heightAt(x, z) - far.heightAt(x, z);
      assert.ok(under >= 0.5, `${under.toFixed(2)} m under the valley's ground at (${x}, ${z}), ${out.dist.toFixed(0)} m from her path`);
    }
  }
  assert.ok(tried > 2000, `${tried} points tried`);
  // the mountains: to the west and north-west of the falls, peaks well over the lip, and none near her
  const peaks = far.peaks;
  assert.ok(peaks.length >= 5);
  for (const p of peaks) {
    const away = Math.hypot(p.x - FALLS.x, p.z - FALLS.z);
    assert.ok(away > 700, `a peak ${away.toFixed(0)} m from the falls`);
    assert.ok(p.x < FALLS.x + 700, 'west of the snag\'s side of the map');
  }
  assert.ok(Math.max(...peaks.map(p => far.heightAt(p.x, p.z))) > FALLS.top + 250, 'the highest stands 250 m over the lip');
  for (let t = FAR.from; t <= BEATS.END; t += 0.5) {
    const her = route.pointAt(route.progressAt(t));
    assert.ok(far.heightAt(her.x, her.z) < her.y - 6, `the far land 6 m under her at ${t} s`);
  }
  // cheap: one ground, one mist, one glow (Grameðla and Þórseðla are the far friends' light levels: about 1,400 triangles each)
  let triangles = 0;
  let calls = 0;
  far.group.traverse(o => {
    if (!o.isMesh && !o.isPoints) return;
    calls++;
    if (o.isMesh) triangles += Math.min(o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count, o.geometry.drawRange.count) / 3;
  });
  assert.ok(triangles <= 25000, `${triangles} triangles`);
  assert.ok(calls <= 4, `${calls} draw calls`);
  far.dispose();
});

test('the far land draws only the slice of itself the view looks over, never short of a triangle the view could see', () => {
  const world = litWorld();
  const terrain = createTerrain(route, { seed: 4 });
  const far = createFarLand(world, route, { terrain });
  far.show();
  const geometry = far.ground.geometry;
  const pos = geometry.attributes.position;
  const all = Math.min(geometry.index.count, geometry.drawRange.count); // before any view: the whole land
  const index = geometry.index.array;
  const key = (a, b, c) => `${a},${b},${c}`;
  const whole = [];
  for (let i = 0; i < all; i += 3) whole.push([index[i], index[i + 1], index[i + 2]]);
  const points = whole.map(t => t.map(v => new THREE.Vector3().fromBufferAttribute(pos, v)));
  const frustum = new THREE.Frustum();
  // is any of the triangle in the view: clipped by each of the frustum's planes in turn, does some of it stay?
  const seen = corners => {
    let poly = corners;
    for (const plane of frustum.planes) {
      const kept = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
        if (da >= 0) kept.push(a);
        if ((da >= 0) !== (db >= 0)) kept.push(a.clone().lerp(b, da / (da - db)));
      }
      poly = kept;
      if (!poly.length) return false;
    }
    return true;
  };
  const look = (t, from, at, aspect, fov) => {
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
    camera.position.copy(from);
    camera.lookAt(at);
    far.update(t, camera); // sets the camera's far plane for the land, then picks the slice for this view
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const start = geometry.drawRange.start;
    const end = Math.min(start + geometry.drawRange.count, index.length);
    const drawn = new Set();
    for (let i = start; i < end; i += 3) drawn.add(key(index[i], index[i + 1], index[i + 2]));
    const missed = whole.filter((tri, n) => !drawn.has(key(...tri)) && seen(points[n])).length;
    assert.equal(missed, 0, `${missed} triangles in the view at ${t} s are not drawn`);
    return (end - start) / 3;
  };
  // G's start, the chase camera behind her along her way (both frame shapes): a slice, not the whole land
  const chase = (t, aspect) => {
    const p = route.pointAt(route.progressAt(t));
    const d = route.tangentAt(route.progressAt(t)).setY(0).normalize();
    return look(t, p.clone().addScaledVector(d, -6.5).add(new THREE.Vector3(0, 5, 0)), p.clone().addScaledVector(d, 12), aspect, 50);
  };
  for (const [t, aspect] of [[154.5, 1.6], [155.5, 0.625], [156.5, 1.6]]) {
    const drawn = chase(t, aspect);
    assert.ok(drawn <= 6000, `${drawn} of ${all / 3} triangles drawn at ${t} s (${aspect})`);
  }
  // the camera turning on the spot, anywhere over F and G: never a triangle short
  for (const t of [120, 128.5, 139, 146, 160, 165]) {
    const p = route.pointAt(route.progressAt(t));
    for (let yaw = 0; yaw < 360; yaw += 15) {
      const a = THREE.MathUtils.degToRad(yaw);
      look(t, p, new THREE.Vector3(p.x + Math.cos(a) * 50, p.y - 12, p.z + Math.sin(a) * 50), 1.6, 55);
    }
  }
  // looking down over the grid's middle: all of it
  const middle = new THREE.Vector3(-1250, far.heightAt(-1250, 90) + 200, 90);
  assert.equal(look(140, middle, new THREE.Vector3(-1250, 0, 140), 1.6, 55), all / 3);
  far.dispose();
});

test('the far land: Grameðla a dark shape walking slowly in the mist beyond the mountains, seen from her; Kambeðla\'s plates blink as the land answers', () => {
  const world = litWorld();
  const terrain = createTerrain(route, { seed: 4 });
  const far = createFarLand(world, route, { terrain });
  const g = t => far.gramedla.at(t);
  for (const t of [BEATS.F, 128, 131]) {
    const p = g(t);
    const away = Math.hypot(p.x - FALLS.x, p.z - FALLS.z);
    assert.ok(away > 900 && away < 2200, `${away.toFixed(0)} m from the falls at ${t} s`);
    assert.ok(p.x < FALLS.x - 400, 'to the west, beyond the mountains\' first ridge');
    // seen from just behind her as she says it: nothing of the land between
    const her = route.pointAt(route.progressAt(t));
    const eye = new THREE.Vector3(her.x, her.y + 8, her.z);
    const chest = new THREE.Vector3(p.x, p.y + p.height * 0.6, p.z);
    for (let s = 0.02; s < 0.98; s += 0.01) {
      const q = eye.clone().lerp(chest, s);
      assert.ok(q.y > far.heightAt(q.x, q.z) + 1, `the land hides her at ${t} s (${(s * 100).toFixed(0)} % of the way)`);
    }
    assert.ok(far.mistAt(chest) > 0.25, `she stands in the mist at ${t} s (${far.mistAt(chest).toFixed(2)})`);
  }
  const step = Math.hypot(g(131).x - g(125).x, g(131).z - g(125).z);
  assert.ok(step > 1 && step / 6 < far.gramedla.scale * 1.2, `she walks slowly: ${(step / 6).toFixed(1)} m/s at ${far.gramedla.scale} times her size`);
  assert.equal(typeof far.gramedla.roar, 'function');
  // Kambeðla's plates: dark before the answers, blinking during them (138 to 141 s), dark again after
  const blink = t => far.kambedla.level(t);
  for (const t of [BEATS.F, 130, 137]) assert.equal(blink(t), 0, `dark at ${t} s`);
  assert.ok(Math.max(...[138, 138.3, 138.6, 139, 139.3, 139.6, 140, 140.4].map(blink)) > 0.9, 'bright as the land answers');
  assert.ok(Math.min(...[138, 138.3, 138.6, 139, 139.3, 139.6, 140, 140.4].map(blink)) < 0.5, 'and blinking, not steady');
  for (const t of [143, 150]) assert.equal(blink(t), 0, `dark again at ${t} s`);
  // a tap on the land brings the big call early (chapters/kafli4-flight-play.js): the plates blink as long after it as they would after
  // 135 s, and the blinks come once
  far.kambedla.answerAt(129.7);
  const early = t => blink(t - 5.3);
  for (const t of [BEATS.F, 130, 137, 143, 150]) assert.equal(blink(t - 5.3), 0, `dark at ${t - 5.3} s`);
  assert.ok(Math.max(...[138, 138.3, 138.6, 139, 139.3, 139.6, 140, 140.4].map(early)) > 0.9, 'bright as the land answers the early call');
  far.kambedla.answerAt(135);
  assert.ok(blink(138.2) > 0.9);
  far.dispose();
});

test('rings in the river where she skims it, on the water\'s clock; the grey valley has none', () => {
  const place = litValley();
  const { uniforms } = place.materials.water; // the river's water (world/props/water.js createWaterMaterial, river)
  assert.ok(uniforms?.uRipples, 'the river water\'s rings');
  const time = uniforms.uTime.value;
  uniforms.uTime.value = 42;
  place.rippleAt(10, -20, 1);
  const ring = uniforms.uRipples.value.find(r => r.x === 10 && r.y === -20);
  assert.ok(ring && ring.z === 42 && ring.w === 1, JSON.stringify(ring));
  // one after another, the oldest ring makes way for the newest
  for (let i = 0; i < uniforms.uRipples.value.length; i++) place.rippleAt(i, i, 0.5);
  assert.ok(!uniforms.uRipples.value.some(r => r.x === 10 && r.y === -20), 'the first ring has made way');
  for (const r of uniforms.uRipples.value) r.set(0, 0, -99, 0);
  uniforms.uTime.value = time;
  const grey = createArdalur({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() }, { grey: true, route });
  assert.doesNotThrow(() => grey.rippleAt(0, 0, 1));
});
