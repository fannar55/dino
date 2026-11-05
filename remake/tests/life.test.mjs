// The life in the flight that nobody taps (world/ardalur/life.js): the Fen's early birds and dragonflies in A, fish jumping in her
// lane, birds flushed from the bank trees between the groups of C, water striders a skim sends skating. All of it on the flight's
// own clock, set off by where the schedule has her, and none of it in her way.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoute, BEATS } from '../chapters/kafli4-route.js';
import { createTerrain } from '../world/ardalur/terrain.js';
import { RAPIDS } from '../world/ardalur/river.js';
import { createLife } from '../world/ardalur/life.js';

const route = createRoute();
const terrain = createTerrain(route, { seed: 4 });
const heightAt = (x, z) => terrain.heightAt(x, z);
const DT = 1 / 30;
const herAt = t => route.pointAt(route.progressAt(Math.min(BEATS.END, Math.max(0, t))));
/** How near her path comes to a point, seen from above. */
const fromPath = p => {
  let best = Infinity;
  for (let t = 0; t <= BEATS.END; t += 0.1) { const q = herAt(t); best = Math.min(best, Math.hypot(q.x - p.x, q.z - p.z)); }
  return best;
};

/** A life in a world whose game clock runs 100 s ahead of the flight's; step(t) sets the flight's time t and updates it. */
function made() {
  const world = { scene: new THREE.Scene(), clock: { time: 0 }, flightTime: null, camera: null };
  const life = createLife(world, route, { heightAt });
  const step = t => {
    world.flightTime = t;
    world.clock.time = 100 + t;
    life.update(DT, world.clock.time);
  };
  return { world, life, step };
}

/** Each perched flier sits still until its trigger, is 3 m higher a second later, and is gone at +3.6 s and ever after. */
function fliesUpAndAway(things, step) {
  for (const b of things) {
    step(b.trigger - 0.5);
    assert.ok(b.visible && b.position.distanceTo(b.at) < 1e-6, `${b.id} sits where it sat before she comes`);
    step(b.trigger + 1);
    assert.ok(b.visible && b.position.y - b.at.y >= 3, `${b.id} flies up (${(b.position.y - b.at.y).toFixed(2)} m in 1 s)`);
    for (const after of [3.6, 10, BEATS.END - b.trigger]) {
      step(b.trigger + after);
      assert.equal(b.visible, false, `${b.id} is gone ${after.toFixed(1)} s after`);
    }
  }
}

test("the Fen's birds fly up as she comes, once, and are gone", () => {
  const { life, step } = made();
  const birds = life.things.filter(t => t.kind === 'earlyBird');
  assert.equal(birds.length, 5);
  for (const b of birds) {
    assert.ok(terrain.where(b.at.x, b.at.z).fen > 0.6 && terrain.where(b.at.x, b.at.z).e > 0.5, `${b.id} sits in the Fen, on land`);
    assert.ok(fromPath(b.at) <= 25, `${b.id} is within 25 m of her path`);
    assert.ok(b.trigger > 0 && b.trigger < BEATS.C, `${b.id} flies up in A or B (${b.trigger.toFixed(2)} s)`);
    assert.ok(herAt(b.trigger).distanceTo(b.at) <= 14 + 1e-3, `${b.id}: she is within 14 m when it flies up`);
    assert.ok(herAt(b.trigger - 0.1).distanceTo(b.at) > 14, `${b.id}: not before`);
  }
  fliesUpAndAway(birds, step);
  // and four dragonflies hover in the reed, over the ground, all the flight
  const flies = life.things.filter(t => t.kind === 'dragonfly');
  assert.equal(flies.length, 4);
  step(10);
  for (const f of flies) {
    assert.ok(terrain.where(f.at.x, f.at.z).fen > 0.6, `${f.id} hovers in the Fen`);
    const over = f.position.y - heightAt(f.position.x, f.position.z);
    assert.ok(f.visible && over > 0.5 && over < 3, `${f.id} hovers in the reed (${over.toFixed(2)} m up)`);
  }
});

test('fish jump ahead of her in her lane, once each', () => {
  const { life, step } = made();
  const fish = life.things.filter(t => t.kind === 'fish');
  assert.equal(fish.length, 10);
  for (const f of fish) {
    const d = route.river.nearest(f.at.x, f.at.z).d;
    assert.ok(d >= 0 && d <= 850, `${f.id} at river d ${d.toFixed(0)}`);
    assert.notEqual(route.waterAt(f.at.x, f.at.z), null, `${f.id} is in the river`);
    assert.ok(fromPath(f.at) <= 6, `${f.id} is in her lane (${fromPath(f.at).toFixed(2)} m from her path)`);
    const her = herAt(f.trigger);
    assert.ok(Math.abs(Math.hypot(her.x - f.at.x, her.z - f.at.z) - 24) < 0.1, `${f.id}: she is 24 m before it when it jumps`);
  }
  const above = fish.map(() => []);
  const peak = fish.map(() => 0);
  for (let t = 0; t <= BEATS.END; t += 0.05) {
    step(t);
    fish.forEach((f, i) => {
      if (!f.visible) return;
      const over = f.position.y - route.river.at(route.river.nearest(f.position.x, f.position.z).d).level;
      if (over > 0.05) above[i].push(t);
      peak[i] = Math.max(peak[i], over);
    });
  }
  fish.forEach((f, i) => {
    assert.ok(above[i].length > 0, `${f.id} jumps`);
    assert.ok(above[i].every(t => t >= f.trigger - 1e-9 && t <= f.trigger + 0.8 + 1e-9), `${f.id} is out of the water only in its jump`);
    assert.ok(peak[i] > 1.0 && peak[i] <= 1.2 + 1e-6, `${f.id} jumps 1.2 m (${peak[i].toFixed(2)})`);
  });
});

test('birds fly up from the bank trees as she passes', () => {
  const { life, step } = made();
  const trees = life.props.filter(p => p.name === 'broadleaf');
  assert.equal(trees.length, 6);
  const groupsAt = route.groups.map(g => route.river.nearest(g.at[0], g.at[2]).d);
  for (const p of trees) {
    const w = terrain.where(p.x, p.z);
    assert.ok(w.e > 0 && w.e <= 12, `a tree within 12 m of the water (${w.e.toFixed(1)} m)`);
    assert.ok(w.d > groupsAt[0] && w.d < groupsAt.at(-1) && groupsAt.every(d => Math.abs(d - w.d) >= 15), `a tree between the groups (d ${w.d.toFixed(0)})`);
  }
  const birds = life.things.filter(t => t.kind === 'bird');
  assert.equal(birds.length, 24);
  for (const b of birds) {
    assert.ok(b.trigger > BEATS.C && b.trigger < BEATS.D, `${b.id} flies up in C (${b.trigger.toFixed(2)} s)`);
    assert.ok(herAt(b.trigger).distanceTo(b.at) <= 20 + 1e-3, `${b.id}: she is within 20 m when it flies up`);
  }
  fliesUpAndAway(birds, step);
});

test('a skim sends the striders off and back', () => {
  const { life, step } = made();
  const striders = life.things.filter(t => t.kind === 'waterStrider');
  assert.equal(striders.length, 8);
  for (const s of striders) {
    const w = terrain.where(s.at.x, s.at.z);
    assert.ok(w.d < RAPIDS.from && w.e < -0.5 && w.e > -4, `${s.id} on the water near a bank of the lazy reach (d ${w.d.toFixed(0)}, e ${w.e.toFixed(1)})`);
  }
  const [first] = striders;
  step(40);
  // a skim 30 m off moves nothing
  const far = [first.at.x + 30, first.at.z];
  assert.ok(striders.every(s => Math.hypot(s.at.x - far[0], s.at.z - far[1]) > 10));
  life.skim(...far);
  step(41);
  for (const s of striders) assert.ok(s.position.distanceTo(s.at) < 1e-6, `${s.id} stays put`);
  // one 2 m off sends those within 10 m skating out and back
  life.skim(first.at.x + 2, first.at.z);
  const near = striders.filter(s => Math.hypot(s.at.x - first.at.x - 2, s.at.z - first.at.z) <= 10);
  step(42);
  for (const s of near) assert.ok(s.position.distanceTo(s.at) >= 1, `${s.id} skates off (${s.position.distanceTo(s.at).toFixed(2)} m)`);
  step(43);
  for (const s of near) assert.ok(s.position.distanceTo(s.at) < 0.1, `${s.id} is back`);
  for (const s of striders) assert.ok(Math.abs(s.position.y - s.at.y) < 1e-6, `${s.id} stays on the water`);
});

test("life is a function of the flight's clock: jumping to a time lands where playing up to it does", () => {
  const played = made();
  const jumped = made();
  for (let t = 0; t < 47.3; t += DT) played.step(t);
  played.step(47.3);
  jumped.step(47.3);
  played.life.things.forEach((a, i) => {
    const b = jumped.life.things[i];
    assert.equal(a.visible, b.visible, `${a.id} seen in both`);
    assert.ok(a.position.distanceTo(b.position) < 1e-6, `${a.id}: ${a.position.toArray()} and ${b.position.toArray()}`);
  });
});

test('nothing in her way: every thing stays 3 m from her path at its time', () => {
  const { life, step } = made();
  let closest = Infinity;
  let who = '';
  for (let t = 0; t <= BEATS.END; t += 0.1) {
    step(t);
    const her = herAt(t);
    for (const thing of life.things) {
      if (!thing.visible) continue;
      const d = thing.position.distanceTo(her);
      if (d < closest) { closest = d; who = `${thing.id} at ${t.toFixed(1)} s`; }
    }
  }
  assert.ok(closest >= 3, `${who}: ${closest.toFixed(2)} m from her`);
  life.dispose();
});
