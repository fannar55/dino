import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createClock } from '../engine/clock.js';
import { createEffects } from '../engine/effects.js';
import { createPointResolver } from '../engine/points.js';
import { createGlowFlower } from '../world/props/glow-flower.js';

// Glow flowers (world/props/glow-flower.js), the three the child hunts for in scene 8. They are checked on a
// world as main.js makes one: a scene, the game clock, world.effects (which the frame loop updates after the
// actors) and the point resolver, with a stand-in for Egill that a test can move about.

function stage() {
  const hand = new THREE.Vector3(2, 0.8, 0);
  const egill = { centre: out => out.copy(hand), headPosition: out => out.set(hand.x, hand.y + 0.5, hand.z), root: new THREE.Group() };
  const world = { scene: new THREE.Scene(), clock: createClock(), effects: createEffects(), actors: new Map([['egill', egill]]) };
  world.resolvePoint = createPointResolver(world);
  return { world, hand };
}
// One frame as main.js runs it: the clock moves on, then the effects update.
const frame = (world, dt = 1 / 30) => {
  world.clock.step(dt);
  world.effects.update(dt);
};
const step = (world, seconds, dt = 1 / 30) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) frame(world, dt);
};
const plant = (world, name = 'stone', position = [4, 0, -2]) => createGlowFlower(world, { name, position });

const meshes = flower => {
  const found = [];
  flower.group.traverse(o => { if (o.isMesh) found.push(o); });
  return found;
};
const bodyOf = flower => meshes(flower).find(m => m.material.isMeshStandardMaterial);
const haloOf = flower => meshes(flower).find(m => m.material.isShaderMaterial);

test('the glimmer is a function of the game clock', () => {
  const { world } = stage();
  const flower = plant(world);
  const times = [0, 0.1, 0.37, 1.5, 12.84, 100.2];
  const seen = times.map(t => {
    flower.update(t);
    return flower.glow;
  });
  // Come back to each time after visiting another: the same value, however the clock got there.
  for (const i of [3, 0, 5, 1, 4, 2]) {
    flower.update(times[i] + 7.77);
    flower.update(times[i]);
    assert.equal(flower.glow, seen[i], `at t = ${times[i]}`);
  }
  assert.equal(haloOf(flower).material.uniforms.uLevel.value, flower.glow, 'the glow the shader draws is that value');

  // It pulses at 1.2 Hz: a period on it is the same, and over 5 s there are six throbs.
  const period = 1 / 1.2;
  for (const t of [0, 0.37, 5.1]) {
    flower.update(t);
    const was = flower.glow;
    for (const later of [period, 3 * period]) {
      flower.update(t + later);
      assert.ok(Math.abs(flower.glow - was) < 1e-9, `${later.toFixed(3)} s after t = ${t}`);
    }
  }
  const levels = [];
  for (let i = 0; i <= 2400; i++) {
    flower.update(0.0123 + i / 480);
    levels.push(flower.glow);
  }
  const middle = (Math.max(...levels) + Math.min(...levels)) / 2;
  let throbs = 0;
  for (let i = 1; i < levels.length; i++) if (levels[i - 1] < middle && levels[i] >= middle) throbs++;
  assert.equal(throbs, 6, 'throbs in 5 s');
  assert.ok(Math.max(...levels) > 0.95 && Math.max(...levels) <= 1, `brightest ${Math.max(...levels)}`);
  assert.ok(Math.min(...levels) > 0.3 && Math.min(...levels) < 0.7, `dimmest ${Math.min(...levels)}: a glimmer that never goes quite out, so it is never missed`);
  assert.ok(Math.max(...levels) - Math.min(...levels) > 0.3, 'but it throbs plainly');
});

test('flowers with different names glimmer out of step; a name always glimmers the same way', () => {
  const [stone, ferns, tree] = ['stone', 'ferns', 'tree'].map(name => plant(stage().world, name));
  const again = plant(stage().world, 'stone', [-7, 0, 1]); // the same name, elsewhere
  const apart = { stone_ferns: 0, stone_tree: 0, ferns_tree: 0 };
  for (let t = 0; t < 1 / 1.2; t += 0.02) {
    for (const flower of [stone, ferns, tree, again]) flower.update(t);
    assert.equal(again.glow, stone.glow);
    apart.stone_ferns = Math.max(apart.stone_ferns, Math.abs(stone.glow - ferns.glow));
    apart.stone_tree = Math.max(apart.stone_tree, Math.abs(stone.glow - tree.glow));
    apart.ferns_tree = Math.max(apart.ferns_tree, Math.abs(ferns.glow - tree.glow));
  }
  for (const [pair, most] of Object.entries(apart)) assert.ok(most > 0.2, `${pair} are never more than ${most.toFixed(2)} apart: they throb in step`);
});

test('a flower glimmers by itself: it is on world.effects and reads the game clock', () => {
  const { world } = stage();
  const flower = plant(world);
  assert.equal(world.effects.size, 1, 'the flower registered itself');
  // A twin on a world with no effects, updated by hand at the clock's time, keeps in step with it.
  const twin = plant({ scene: new THREE.Scene() });
  for (let i = 0; i < 40; i++) {
    frame(world, 1 / 30 + (i % 3) * 0.01); // frames of uneven length
    twin.update(world.clock.time);
    assert.equal(flower.glow, twin.glow, `frame ${i}`);
  }
  // While the game is paused the clock stands still, and so does the glimmer.
  world.clock.setPaused(true);
  const held = flower.glow;
  for (let i = 0; i < 20; i++) world.effects.update(world.clock.tick(1 / 30));
  assert.equal(flower.glow, held);
});

test('glimmer(false) puts the glow out and glimmer(true) brings it back', () => {
  const { world } = stage();
  const flower = plant(world);
  flower.update(0.4);
  const lit = flower.glow;
  assert.ok(lit > 0);
  assert.equal(haloOf(flower).visible, true);
  assert.equal(flower.glimmer(false).done, true, 'it takes effect at once, so a script may yield it');
  assert.equal(flower.glow, 0);
  assert.equal(haloOf(flower).visible, false, 'no glow, no draw call');
  step(world, 0.5);
  assert.equal(flower.glow, 0, 'it stays out as the clock runs');
  flower.glimmer(true);
  flower.update(0.4);
  assert.equal(flower.glow, lit, 'the same value at the same t as before');
  assert.equal(haloOf(flower).visible, true);
});

test('pick resolves and hides the flower', () => {
  const { world } = stage();
  const flower = plant(world);
  const handle = flower.pick();
  assert.equal(handle.done, false);
  assert.equal(flower.group.visible, true);
  step(world, 0.5);
  assert.equal(handle.done, false, 'it takes 0.6 s of game time');
  assert.equal(flower.group.visible, true);
  step(world, 0.1 + 2 / 30);
  assert.equal(handle.done, true);
  assert.equal(handle.cancelled, false);
  assert.equal(flower.group.visible, false);
  assert.equal(world.effects.size, 0, 'a picked flower is finished with the clock');
});

test('pick lifts and shrinks the flower toward the point it is given', () => {
  const { world } = stage();
  const flower = plant(world, 'stone', [0, 0, 0]);
  const start = flower.point.clone();
  const target = start.clone().add(new THREE.Vector3(3, 0, 0)); // level with the flower, 3 m away
  const handle = flower.pick(target);
  const seen = [];
  while (!handle.done && seen.length < 60) {
    frame(world);
    seen.push({ at: flower.point.clone(), size: flower.group.scale.x, glow: flower.glow });
  }
  assert.ok(seen.length >= 18 && seen.length <= 21, `${seen.length} frames at 30 fps for 0.6 s`);
  const high = Math.max(...seen.map(s => s.at.y - start.y));
  assert.ok(high > 0.15, `it lifts: ${high.toFixed(2)} m above where it started, on the way to a hand level with it`);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].size <= seen[i - 1].size + 1e-9, `it only shrinks (frame ${i})`);
  assert.ok(seen[0].size > 0.9, 'it starts at full size');
  const last = seen[seen.length - 1];
  assert.ok(last.size < 0.2, `it ends small: ${last.size.toFixed(2)}`);
  assert.ok(last.at.distanceTo(target) < 1e-6, 'and in the hand');
  const middle = seen[Math.floor(seen.length / 2)];
  assert.ok(middle.at.x > start.x + 0.5 && middle.at.x < target.x - 0.5, 'half way there at half time');
  // It keeps glowing on the way and has gone out by the time it arrives, so nothing winks out in mid-air.
  assert.ok(middle.glow > 0.3, `still glowing half way: ${middle.glow.toFixed(2)}`);
  assert.ok(seen.at(-2).glow < 0.25, `nearly out a frame before: ${seen.at(-2).glow.toFixed(2)}`);
  assert.equal(last.glow, 0, 'and out');
});

test('pick follows a point that moves: it is resolved every frame', () => {
  const { world, hand } = stage();
  const flower = plant(world);
  const handle = flower.pick(); // toward Egill, who walks off as the flower flies
  const from = hand.clone();
  while (!handle.done) {
    hand.x += 0.04;
    hand.z += 0.02;
    frame(world);
  }
  assert.ok(hand.distanceTo(from) > 0.7, 'Egill moved');
  assert.ok(flower.point.distanceTo(hand) < 1e-6, 'it arrived where he is now, not where he was');
});

test('pick goes toward Egill unless told otherwise, and takes any point spec', () => {
  const { world } = stage();
  const specs = [];
  const resolve = world.resolvePoint;
  world.resolvePoint = (spec, out) => {
    specs.push(spec);
    return resolve(spec, out);
  };
  const flower = plant(world);
  flower.pick();
  assert.equal(specs[0], 'egill');
  const other = plant(world, 'ferns', [1, 0, 1]);
  const spec = { actor: 'egill', part: 'head', offset: [0, 0.1, 0] };
  other.pick(spec);
  assert.equal(specs.at(-1), spec);
  step(world, 1);
  assert.ok(other.point.distanceTo(world.resolvePoint(spec)) < 1e-6, 'it went to the head, not the middle');
});

test('pick counts game time only', () => {
  const { world } = stage();
  const flower = plant(world);
  const handle = flower.pick();
  step(world, 0.2);
  world.clock.setPaused(true);
  const was = flower.point.clone();
  for (let i = 0; i < 60; i++) world.effects.update(world.clock.tick(1 / 30)); // two paused seconds
  assert.equal(handle.done, false);
  assert.ok(flower.point.equals(was), 'it hangs where it was');
  world.clock.setPaused(false);
  step(world, 0.6);
  assert.equal(handle.done, true);
});

test('pick fails at the call when the point cannot be resolved, and the flower stays as it was', () => {
  const { world } = stage();
  world.actors.clear(); // no Egill to pick toward
  const flower = plant(world);
  assert.throws(() => flower.pick(), /egill/);
  step(world, 1);
  assert.equal(flower.group.visible, true);
  assert.equal(world.effects.size, 1);
  assert.ok(flower.glow > 0, 'still glimmering, so it can be found and picked once Egill is there');
  world.actors.set('egill', { centre: out => out.set(1, 1, 1), headPosition: out => out, root: new THREE.Group() });
  assert.equal(flower.pick().done, false);
});

test('a second pick joins the first, and a picked flower stays picked', () => {
  const { world } = stage();
  const flower = plant(world);
  const first = flower.pick();
  step(world, 0.2);
  assert.equal(flower.pick(), first, 'one pick at a time');
  step(world, 1);
  assert.equal(first.done, true);
  assert.equal(flower.pick().done, true, 'nothing left to pick');
  assert.equal(flower.group.visible, false);
  flower.glimmer(true);
  assert.equal(flower.glow, 0, 'it does not glimmer again');
  assert.equal(haloOf(flower).visible, false);
});

test('cancelling a pick still ends with the flower picked', () => {
  const { world } = stage();
  const flower = plant(world);
  const handle = flower.pick();
  step(world, 0.2);
  assert.ok(flower.glow > 0);
  handle.cancel();
  assert.equal(handle.done, true);
  assert.equal(flower.group.visible, false, 'a flower is never left in mid-air');
  assert.equal(flower.glow, 0, 'and its glimmer is out, at once');
  world.effects.update(1 / 30);
  assert.equal(world.effects.size, 0);
});

test('a flower costs at most 300 triangles and two draw calls', () => {
  const { world } = stage();
  const flower = plant(world);
  const cost = () => {
    let triangles = 0;
    let calls = 0;
    flower.group.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      calls++;
      const { index, attributes } = o.geometry;
      triangles += (index ? index.count : attributes.position.count) / 3;
    });
    return { triangles, calls };
  };
  const lit = cost();
  assert.ok(lit.triangles <= 300, `${lit.triangles} triangles`);
  assert.equal(lit.calls, 2, 'the petals and stem in one, the glow in the other');
  flower.glimmer(false);
  assert.equal(cost().calls, 1, 'a flower with its glow out is one call');
  for (const mesh of meshes(flower)) {
    assert.equal(mesh.material.map ?? null, null, 'no texture: it is all drawn in code');
    assert.equal(mesh.castShadow, false, 'a flower this small casts no shadow');
  }
});

test('the bloom is five lilac-white petals', () => {
  const { world } = stage();
  const { geometry } = bodyOf(plant(world));
  const { position, color } = geometry.attributes;
  const { index } = geometry;
  // Lilac to white: red and blue both at least green (the stem and leaves are green, the centre gold).
  const colours = Array.from({ length: position.count }, (_, i) => new THREE.Color().fromBufferAttribute(color, i).convertLinearToSRGB());
  const petalVertices = colours.map((c, i) => (c.r >= c.g && c.b >= c.g ? i : -1)).filter(i => i >= 0);
  assert.ok(petalVertices.length >= 30, `${petalVertices.length} petal vertices`);
  const mean = f => petalVertices.reduce((sum, i) => sum + f(colours[i]), 0) / petalVertices.length;
  assert.ok(mean(c => (c.r + c.g + c.b) / 3) > 0.7, 'light: the petals are near white');
  assert.ok(mean(c => c.b - c.g) > 0.03, 'with lilac in them, not grey');
  // Seen from above, walk a ring round the middle of the bloom, at 7 tenths of the petals' reach: they cover
  // it in five arcs, one for each petal, with a gap between.
  const isPetal = new Set(petalVertices);
  const flat = i => [position.getX(i), position.getZ(i)];
  const ring = 0.7 * Math.max(...petalVertices.map(i => Math.hypot(...flat(i))));
  const triangles = [];
  for (let t = 0; t < index.count; t += 3) {
    const corners = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    if (corners.every(i => isPetal.has(i))) triangles.push(corners.map(flat));
  }
  const covers = ([a, b, c], x, z) => {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d;
    const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d;
    return u >= 0 && v >= 0 && u + v <= 1;
  };
  const SAMPLES = 720;
  const covered = Array.from({ length: SAMPLES }, (_, s) => {
    const turn = (s / SAMPLES) * 2 * Math.PI;
    return triangles.some(t => covers(t, ring * Math.cos(turn), ring * Math.sin(turn)));
  });
  const arcs = covered.filter((on, s) => on && !covered[(s + SAMPLES - 1) % SAMPLES]).length;
  assert.equal(arcs, 5, 'petals');
  assert.ok(covered.filter(Boolean).length > 0.6 * SAMPLES, 'which between them fill most of the ring: a full flower');
});

test('every part of the flower glows in its own colour', t => {
  const { world } = stage();
  const flower = plant(world);
  const material = bodyOf(flower).material;
  assert.equal(material.vertexColors, true);
  const { vertexShader, fragmentShader, uniforms } = THREE.ShaderLib.standard;
  const shader = { vertexShader, fragmentShader, uniforms: THREE.UniformsUtils.clone(uniforms) };
  material.onBeforeCompile(shader, null);
  const at = shader.fragmentShader.indexOf('#include <emissivemap_fragment>');
  assert.ok(at > 0);
  assert.match(shader.fragmentShader.slice(at), /^#include <emissivemap_fragment>\s*totalEmissiveRadiance \*= vColor\.rgb;/, 'the colour of the vertex tints what the flower gives out, before the lights add to it');
  assert.equal(typeof material.customProgramCacheKey(), 'string');
  // The petals' own light follows the glimmer.
  flower.update(0);
  const emissive = [];
  for (let i = 0; i < 40; i++) {
    flower.update(i / 48 / 1.2);
    emissive.push([flower.glow, material.emissiveIntensity]);
  }
  emissive.sort((a, b) => a[0] - b[0]);
  assert.ok(emissive.at(-1)[1] > emissive[0][1] + 0.05, 'brighter when the glow is');
  // If three's shader changes so the anchor is gone, say so rather than quietly lose the glow.
  const warn = t.mock.method(console, 'warn', () => {});
  material.onBeforeCompile({ vertexShader: '', fragmentShader: 'void main() {}', uniforms: {} }, null);
  assert.equal(warn.mock.callCount(), 1);
});

test('the glow fades toward the ground under the flower, not toward the branch it stands on', () => {
  const { world } = stage();
  world.heightAt = () => 0.4;
  const floorOf = flower => haloOf(flower).material.uniforms.uFloor.value;
  assert.equal(floorOf(createGlowFlower(world, { name: 'stone', position: [1, 0.4, 1] })), 0.4, 'a flower on the ground');
  assert.equal(floorOf(createGlowFlower(world, { name: 'tree', position: [1, 2.3, 1] })), 0.4, 'a flower up a tree: the ground is far below its glow');
  assert.equal(floorOf(createGlowFlower(world, { name: 'ferns', position: [1, 0.1, 1] })), 0.1, 'never above the flower itself');
  delete world.heightAt;
  assert.equal(floorOf(createGlowFlower(world, { name: 'ferns', position: [1, 0.7, 1] })), 0.7, 'a world with no ground to ask: where it stands');
});

test('point is the middle of the bloom, the same vector for good, and follows the flower', () => {
  const { world } = stage();
  const flower = createGlowFlower(world, { name: 'tree', position: [3, 2.1, -4] });
  const { point } = flower;
  assert.ok(point.isVector3);
  assert.ok(Math.abs(point.x - 3) < 0.05 && Math.abs(point.z + 4) < 0.05, 'over the stem');
  assert.ok(point.y > 2.1 + 0.3 && point.y < 2.1 + 0.8, `a stem's length above where it stands: ${point.y}`);
  assert.deepEqual(world.resolvePoint(point).toArray(), point.toArray(), 'a point spec, as a search target takes');
  assert.ok(flower.group.position.equals(new THREE.Vector3(3, 2.1, -4)));
  assert.ok(world.scene.children.includes(flower.group));
  const before = point.y;
  flower.group.position.y += 1; // a chapter that puts it somewhere else after
  flower.update(0);
  assert.equal(flower.point, point, 'so a tap target holding it follows');
  assert.ok(Math.abs(point.y - (before + 1)) < 1e-9);
});

test('dispose() takes the flower out of the scene, frees what it made and stops its effect', () => {
  const { world } = stage();
  const flower = plant(world);
  const freed = [];
  for (const mesh of meshes(flower)) for (const resource of [mesh.geometry, mesh.material]) resource.addEventListener('dispose', () => freed.push(resource));
  assert.equal(world.scene.children.length, 1);
  flower.dispose();
  assert.equal(world.scene.children.length, 0);
  assert.equal(freed.length, 4, 'two geometries and two materials');
  world.effects.update(1 / 30);
  assert.equal(world.effects.size, 0, 'the effect stopped');
  // And it stays harmless.
  flower.dispose();
  flower.update(3);
  flower.glimmer(true);
  assert.equal(flower.glow, 0);
  assert.equal(flower.pick().done, true, 'nothing left to pick');
  assert.equal(freed.length, 4, 'nothing freed twice');
});

test('dispose() while a flower is being picked cancels the pick, so a script waiting on it goes on', () => {
  const { world } = stage();
  const flower = plant(world);
  const handle = flower.pick();
  step(world, 0.2);
  flower.dispose();
  assert.equal(handle.done, true);
  assert.equal(handle.cancelled, true);
  world.effects.update(1 / 30);
  assert.equal(world.effects.size, 0);
});

test('a flower needs a name, a position and, to run on the clock, a game clock', () => {
  const { world } = stage();
  assert.throws(() => createGlowFlower(world, { position: [0, 0, 0] }), /name/);
  assert.throws(() => createGlowFlower(world, { name: 'stone' }), /position/);
  assert.throws(() => createGlowFlower(world, { name: 'stone', position: [0, 0] }), /position/);
  assert.throws(() => createGlowFlower(world, { name: 'stone', position: [0, Number.NaN, 0] }), /position/);
  assert.throws(() => createGlowFlower({ scene: world.scene, effects: world.effects }, { name: 'stone', position: [0, 0, 0] }), /clock/);
  assert.equal(world.scene.children.length, 0, 'a refused flower leaves nothing behind');
  assert.equal(world.effects.size, 0);
});
