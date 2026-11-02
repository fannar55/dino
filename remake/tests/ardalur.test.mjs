// Árdalurinn (world/ardalur): the river valley of chapter 4's flight, in grey, built in 150 m sections along the route. Sections are
// built before they are wanted, even on a slow device, and shown only while near; the land never comes within 2 m of her path; the
// cliff of the falls stands behind the falling water; each section is cheap enough to draw; and a chapter's location may build such
// a place instead of a forest.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoute, BEATS, LEAP, FALLS, GORGE } from '../chapters/kafli4-route.js';
import { createArdalur } from '../world/ardalur/index.js';
import { createGorgeSight, ABOVE_SECTOR, createHazeSight, fogBetween, FOG_CUT } from '../world/ardalur/sight.js';
import { createSections } from '../world/ardalur/sections.js';
import { createRouteIndex, createTerrain } from '../world/ardalur/terrain.js';
import { createAnimals } from '../world/ardalur/animals.js';
import { HIGH } from '../world/ardalur/banks.js';
import { createFarLand, FAR } from '../world/ardalur/far-land.js';
import { cullBatches } from '../world/forest/batch.js';
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
function litValley() {
  if (!lit) {
    litWorldOf = litWorld();
    lit = createArdalur(litWorldOf, { grey: false, route });
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
  // the lilies float on the lazy reach, near its banks, and round the far pool (calm water both)
  const lilies = place.stats.sections.flatMap(part => part.userData.placements.filter(p => p.name === 'waterLily'));
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
  assert.ok(plain > 30000, `a plain cull draws ${plain} triangles above the falls at t 90`);
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
    assert.ok(all.far > 40000, `t ${t}: a plain cull draws ${all.far} far triangles`);
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
const morphOf = (mesh, name) => mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]];

test('five animal groups along C, in the order she meets them, each where the route puts it, each a wide tap target', () => {
  const world = animalWorld();
  const animals = createAnimals(world, route, { heightAt: animalTerrain.heightAt });
  assert.deepEqual(animals.groups.map(g => [g.id, g.kind]), route.groups.map(g => [g.id, g.kind]));
  const count = Object.fromEntries(animals.groups.map(g => [g.kind, g.members.length]));
  assert.ok(count.frogs >= 3 && count.snails >= 3 && count.dragonflies >= 4 && count.lizards >= 3, JSON.stringify(count));
  assert.equal(count.turtle, 1);
  for (const [i, g] of animals.groups.entries()) {
    assert.ok(g.point.distanceTo(new THREE.Vector3(...route.groups[i].at)) < 6, `${g.id} is by its place on the bank`);
    assert.ok(g.radius >= 3, `${g.id}: a wide tap target (${g.radius} m)`);
    assert.equal(g.answered, false);
  }
  // each critter is one of the game's own (world/critters/models.js), one mesh of at most 400 triangles, larger than life
  let meshes = 0;
  animals.group.traverse(o => {
    if (!o.isMesh) return;
    meshes++;
    assert.ok(o.geometry.attributes.position.count / 3 <= 400, `${o.name}: ${o.geometry.attributes.position.count / 3} triangles`);
  });
  assert.equal(meshes, animals.groups.reduce((n, g) => n + g.members.length, 0));
  // none under the ground; the dragonflies over the water
  animals.update(DT, 0);
  for (const g of animals.groups) {
    for (const m of g.members) {
      const p = m.root.getWorldPosition(new THREE.Vector3());
      assert.ok(p.y >= animalTerrain.heightAt(p.x, p.z) - 0.05, `${g.id}: a critter under the ground at ${p.toArray().map(v => v.toFixed(1))}`);
      if (g.kind === 'dragonflies') assert.ok(p.y > route.river.at(route.river.nearest(p.x, p.z).d).level + 0.5, 'a dragonfly over the water');
    }
  }
  assert.ok(world.scene.children.includes(animals.group));
  animals.dispose();
  assert.ok(!world.scene.children.includes(animals.group));
});

test('each group answers her once: frog jumps, snails lift their eyes, dragonflies follow her, turtle stretches, lizards run', () => {
  const world = animalWorld();
  const animals = createAnimals(world, route, { heightAt: animalTerrain.heightAt });
  for (const g of animals.groups) {
    const t0 = passes(route.groups.find(r => r.id === g.id).u);
    world.at(t0);
    animals.update(DT, t0);
    const home = g.members.map(m => m.root.getWorldPosition(new THREE.Vector3()));
    const handle = g.answer();
    assert.equal(handle.done, false, `${g.id}: the answer takes time`);
    assert.equal(g.answered, true);
    let rose = 0;
    let eyes = 0;
    let neck = 0;
    let near = Infinity;
    for (let t = t0; t <= t0 + 12; t += DT) {
      world.at(t);
      animals.update(DT, t);
      g.members.forEach((m, k) => {
        const p = m.root.getWorldPosition(new THREE.Vector3());
        rose = Math.max(rose, p.y - home[k].y);
        if (g.kind === 'snails') eyes = Math.min(eyes, morphOf(m.mesh, 'hide'));
        if (g.kind === 'turtle') neck = Math.min(neck, morphOf(m.mesh, 'hide'));
        if (g.kind === 'dragonflies' && Math.abs(t - (t0 + 2)) < DT / 2) near = Math.min(near, -p.distanceTo(world.flightPoint));
      });
    }
    assert.equal(handle.done, true, `${g.id}: the answer is over`);
    const end = g.members.map(m => m.root.getWorldPosition(new THREE.Vector3()));
    if (g.kind === 'frogs') assert.ok(rose > 0.8, `a frog jumps (${rose.toFixed(2)} m up)`);
    if (g.kind === 'snails') assert.ok(eyes < -0.3, `the snails lift their eyes (hide ${eyes.toFixed(2)})`);
    if (g.kind === 'turtle') assert.ok(neck < -0.4, `the turtle stretches its neck (hide ${neck.toFixed(2)})`);
    if (g.kind === 'dragonflies') {
      assert.ok(-near < 8, `2 s on, every dragonfly is within 8 m of her (${(-near).toFixed(1)} m)`);
      end.forEach((p, k) => assert.ok(p.distanceTo(home[k]) < 0.6, 'and they come home'));
    }
    if (g.kind === 'lizards') {
      end.forEach((p, k) => {
        const ran = route.river.nearest(p.x, p.z).d - route.river.nearest(home[k].x, home[k].z).d;
        assert.ok(ran > 12, `a lizard runs along the bank with her, upstream (${ran.toFixed(1)} m)`);
        assert.ok(p.y >= animalTerrain.heightAt(p.x, p.z) - 0.05, 'on the ground');
      });
    }
    if (['frogs', 'snails', 'turtle'].includes(g.kind)) end.forEach((p, k) => assert.ok(p.distanceTo(home[k]) < 0.05, `${g.id} rest where they were`));
    // once: a second answer is a finished Handle and moves nothing
    const again = g.answer();
    assert.equal(again.done, true, `${g.id} answers once`);
    world.at(t0 + 13);
    animals.update(DT, t0 + 13);
    g.members.forEach((m, k) => assert.ok(m.root.getWorldPosition(new THREE.Vector3()).distanceTo(end[k]) < 0.6, `${g.id} stays at rest`));
  }
  animals.dispose();
});

test('an answer is a function of the game clock: jumping to a time lands on the same pose as playing up to it', () => {
  const playedWorld = animalWorld();
  const replay = createAnimals(playedWorld, route, { heightAt: animalTerrain.heightAt });
  const jumpedWorld = animalWorld();
  const jumped = createAnimals(jumpedWorld, route, { heightAt: animalTerrain.heightAt });
  const t0 = passes(route.groups[2].u);
  for (const [w, a] of [[playedWorld, replay], [jumpedWorld, jumped]]) {
    w.at(t0);
    a.update(DT, t0);
    for (const g of a.groups) g.answer();
  }
  for (let t = t0; t < t0 + 1.7; t += DT) {
    playedWorld.at(t);
    replay.update(DT, t);
  }
  playedWorld.at(t0 + 1.7);
  replay.update(DT, t0 + 1.7);
  jumpedWorld.at(t0 + 1.7);
  jumped.update(0, t0 + 1.7);
  replay.groups.forEach((g, i) => g.members.forEach((m, k) => {
    const a = m.root.getWorldPosition(new THREE.Vector3());
    const b = jumped.groups[i].members[k].root.getWorldPosition(new THREE.Vector3());
    assert.ok(a.distanceTo(b) < 1e-6, `${g.id} ${k}: ${a.toArray()} and ${b.toArray()}`);
  }));
  replay.dispose();
  jumped.dispose();
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
      const p = m.root.getWorldPosition(new THREE.Vector3());
      const crowd = placements.filter(q => !animals.props.some(prop => prop.x === q.x && prop.z === q.z) && q.name !== 'waterLily' && Math.hypot(q.x - p.x, q.z - p.z) < 1.2);
      assert.equal(crowd.length, 0, `${g.id}: ${crowd.map(q => q.name)} grow on a critter at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
    }
  }
  // the grey marks are gone from the real valley
  let marks = 0;
  place.group.traverse(o => { if (o.name === 'Animal groups (marks)') marks++; });
  assert.equal(marks, 0);
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
    if (o.isMesh) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  assert.ok(triangles <= 25000, `${triangles} triangles`);
  assert.ok(calls <= 4, `${calls} draw calls`);
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
  far.dispose();
});
