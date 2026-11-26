// The festival's stage tools (Task 13): the floor of glow flowers (world/props/glow-floor.js) and the cones of light
// (engine/show/beams.js). The sea's colours and ripples are in fjall.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGlowFloor, FLOOR_LOOK } from '../world/props/glow-floor.js';
import { createBeams } from '../engine/show/beams.js';
import { FLOOR, STAGE } from '../chapters/hatid-route.js';

const heightAt = (x, z) => 1.2 + 0.3 * Math.sin(x * 0.07) * Math.sin(z * 0.06);
const world = () => ({ scene: new THREE.Scene(), heightAt });
const KEEP = [{ at: STAGE.centre, r: STAGE.radius + 1.5 }];
const flat = d => Math.hypot(d[0], d[2]);

test('the floor is one draw call and under 12k triangles; no flower stands on the stage', () => {
  const w = world();
  const floor = createGlowFloor(w, { heightAt, keep: KEEP });
  assert.deepEqual(w.scene.children, [floor.mesh], 'one mesh in the scene, nothing else');
  assert.ok(floor.mesh.isMesh && !Array.isArray(floor.mesh.material), 'one mesh, one material');
  assert.ok(floor.mesh.geometry.isInstancedBufferGeometry, 'its flowers are instances of one bloom');
  assert.equal(floor.mesh.geometry.instanceCount, FLOOR.count);
  assert.equal(floor.spots.length, FLOOR.count);
  assert.equal(floor.mesh.castShadow, false, 'no shadow pass: that would be a second draw call');
  const triangles = (floor.mesh.geometry.index.count / 3) * floor.mesh.geometry.instanceCount;
  assert.ok(triangles < 12000, `${triangles} triangles`);
  for (const [x, y, z] of floor.spots) {
    assert.ok(Math.hypot(x, z) <= FLOOR.radius + 1e-9, 'inside the floor');
    assert.ok(Math.abs(y - heightAt(x, z)) < 0.1, 'on the ground');
    for (const k of KEEP) assert.ok(Math.hypot(x - k.at[0], z - k.at[1]) >= k.r, `no flower on the stage: ${x}, ${z}`);
  }
  // spread over the whole floor, not bunched: every 5 m cell of it that is off the stage has a flower near
  for (let x = -25; x <= 25; x += 5) for (let z = -25; z <= 25; z += 5) {
    if (Math.hypot(x, z) > FLOOR.radius - 3 || KEEP.some(k => Math.hypot(x - k.at[0], z - k.at[1]) < k.r + 3)) continue;
    assert.ok(floor.spots.some(([sx, , sz]) => Math.hypot(sx - x, sz - z) < 4), `a flower near ${x}, ${z}`);
  }
  floor.dispose();
  assert.equal(w.scene.children.length, 0);
});

test('open is a wave: at 10 m the flowers within 10 m of the middle are open and those beyond are buds', () => {
  const floor = createGlowFloor(world(), { heightAt });
  const versions = Object.values(floor.mesh.geometry.attributes).map(a => a.version);
  for (let i = 0; i < floor.spots.length; i++) assert.equal(floor.flower(i).open, 0, 'as made all are buds');
  floor.set({ open: 10 });
  let inside = 0, beyond = 0;
  for (let i = 0; i < floor.spots.length; i++) {
    const d = flat(floor.spots[i]);
    const { open } = floor.flower(i);
    if (d <= 10 - FLOOR_LOOK.band) assert.ok(open > 1 - 1e-9, `open at ${d.toFixed(2)} m`);
    if (d < 10) { assert.ok(open > 0, `springing at ${d.toFixed(2)} m`); inside++; }
    if (d >= 10) { assert.equal(open, 0, `a bud at ${d.toFixed(2)} m`); beyond++; }
  }
  assert.ok(inside > 20 && beyond > 200, `${inside} open, ${beyond} buds`);
  // as it grows each flower only opens further (a wave going out), and all are open past the floor's edge
  const before = floor.spots.map((_, i) => floor.flower(i).open);
  floor.set({ open: 14 });
  floor.spots.forEach((_, i) => assert.ok(floor.flower(i).open >= before[i]));
  floor.set({ open: FLOOR.radius + 2 * FLOOR_LOOK.band });
  floor.spots.forEach((_, i) => assert.equal(floor.flower(i).open, 1));
  assert.equal(floor.mesh.material.uniforms.uOpen.value, FLOOR.radius + 2 * FLOOR_LOOK.band, 'a uniform');
  assert.deepEqual(Object.values(floor.mesh.geometry.attributes).map(a => a.version), versions, 'nothing written a flower at a time');
  floor.dispose();
});

test('a step lights the flowers under it and no others', () => {
  const floor = createGlowFloor(world(), { heightAt });
  floor.set({ open: 40, pulse: 0.3, colour: '#ff5fd2' });
  const base = floor.spots.map((_, i) => floor.flower(i).light);
  base.forEach(l => assert.ok(Math.abs(l - 0.3) < 1e-9, 'open flowers share the pulse'));
  const [x, , z] = floor.spots[7];
  const versions = Object.values(floor.mesh.geometry.attributes).map(a => a.version);
  floor.set({ steps: [[x, z, 1.6, 1]] });
  let lit = 0;
  floor.spots.forEach(([sx, , sz], i) => {
    const d = Math.hypot(sx - x, sz - z);
    const { light } = floor.flower(i);
    if (d >= 1.6) assert.equal(light, base[i], `no light at ${d.toFixed(2)} m`);
    else { assert.ok(light > base[i], `lit at ${d.toFixed(2)} m`); lit++; }
  });
  assert.ok(lit >= 1 && floor.flower(7).light >= 1.3 - 1e-9, 'the flower under the foot is the brightest');
  // at most sixteen; none is the rest
  floor.set({ steps: Array.from({ length: 20 }, (_, k) => [k, 0, 1, 1]) });
  assert.equal(floor.mesh.material.uniforms.uSteps.value.filter(v => v.w > 0).length, 16);
  floor.set({ steps: [] });
  floor.spots.forEach((_, i) => assert.equal(floor.flower(i).light, base[i]));
  assert.deepEqual(Object.values(floor.mesh.geometry.attributes).map(a => a.version), versions, 'uniforms only');
  floor.dispose();
});

test('the same numbers are the same floor', () => {
  const a = createGlowFloor(world(), { heightAt, keep: KEEP });
  const b = createGlowFloor(world(), { heightAt, keep: KEEP });
  assert.deepEqual(a.spots, b.spots);
  assert.deepEqual([...a.mesh.geometry.getAttribute('aSpot').array], [...b.mesh.geometry.getAttribute('aSpot').array]);
  const c = createGlowFloor(world(), { heightAt, keep: KEEP, seed: 7 });
  assert.notDeepEqual(a.spots, c.spots, 'another seed, another floor');
  const d = createGlowFloor(world(), { heightAt, count: 120, radius: 12 });
  assert.equal(d.spots.length, 120);
  assert.ok(d.spots.every(s => flat(s) <= 12));
  for (const f of [a, b, c, d]) f.dispose();
});

test('ten beams are one draw call', () => {
  const w = world();
  const beams = createBeams(w);
  assert.deepEqual(w.scene.children, [beams.mesh]);
  beams.begin();
  for (let k = 0; k < 11; k++) beams.beam([k, 16, 30], [k * 2, 1.2, 10], 1.5, 1, 0.8, 0.4, 0.9);
  beams.end();
  assert.equal(beams.count, 10, 'the capacity: the eleventh is dropped');
  assert.equal(beams.mesh.geometry.instanceCount, 10);
  assert.ok(!Array.isArray(beams.mesh.material) && beams.mesh.castShadow === false);
  assert.equal(beams.mesh.material.blending, THREE.CustomBlending, 'added to the picture');
  assert.ok((beams.mesh.geometry.index.count / 3) * 10 < 600, 'a few hundred triangles');
  const r = v => Math.round(v * 1e4) / 1e4;
  const third = beams.read(3);
  assert.deepEqual({ from: third.from.map(r), to: third.to.map(r), width: r(third.width), colour: third.colour.map(r) },
    { from: [3, 16, 30], to: [6, 1.2, 10], width: 1.5, colour: [1, 0.8, 0.4, 0.9] });
  beams.begin();
  beams.beam(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 0, 0), 2, 1, 1, 1, 0);
  beams.end();
  assert.equal(beams.count, 0, 'a beam with no light is not drawn');
  assert.equal(beams.mesh.visible, false);
  beams.dispose();
  assert.equal(w.scene.children.length, 0);
});
