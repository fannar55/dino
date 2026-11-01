// Árdalurinn (world/ardalur): the river valley of chapter 4's flight, in grey, built in 150 m sections along the route. Sections are
// built before they are wanted, even on a slow device, and shown only while near; the land never comes within 2 m of her path; the
// cliff of the falls stands behind the falling water; each section is cheap enough to draw; and a chapter's location may build such
// a place instead of a forest.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoute, BEATS, LEAP, FALLS } from '../chapters/kafli4-route.js';
import { createArdalur } from '../world/ardalur/index.js';
import { createSections } from '../world/ardalur/sections.js';
import { createLocations } from '../engine/locations.js';

const route = createRoute();
const DT = 1 / 30;

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
