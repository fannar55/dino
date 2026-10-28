import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import * as THREE from 'three';
import { createClock } from '../engine/clock.js';
import { createEffects } from '../engine/effects.js';
import { createPointResolver } from '../engine/points.js';
import { createWind } from '../engine/wind.js';
import { PRESETS } from '../engine/quality.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { createTerrain } from '../world/forest/terrain.js';
import { createForest } from '../world/forest/forest.js';
import * as atmosphere from '../world/forest/atmosphere.js';
import { HERO } from '../world/forest/butterflies.js';
import { loadGlb } from './glb.mjs';
import { createCritters } from '../world/critters/critters.js';
import { BIRD, KINDS, createModel } from '../world/critters/models.js';
import { DONE } from '../engine/handle.js';
import { pickTarget } from '../engine/input/pointer.js';
import { chapter as grunnur } from '../chapters/grunnur.js';

// Critters a child can tap: the clearing's butterflies (world/forest/butterflies.js, which atmosphere.js builds) and
// the frog, snail, beetle and little birds of world/critters/. They are checked on a world as main.js makes one:
// a scene, the game clock, world.effects, the point resolver and stand-ins for the actors a test moves about.

const step = (frame, seconds, dt = 1 / 30) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) frame(dt);
};
const sha = parts => {
  const hash = crypto.createHash('sha1');
  for (const part of parts) hash.update(typeof part === 'string' ? part : Buffer.from(part.buffer, part.byteOffset, part.byteLength));
  return hash.digest('hex').slice(0, 16);
};

// ---- the clearing's butterflies ----------------------------------------------------------------

const SUN = sunDirection(pickLook('morning'));
const OLD_GRUNNUR = {
  // What the butterflies of grunnur's layout were before they could be tapped (commit 0e82ac1): their buffers, and the
  // centres and loops the shader flies them on. If you change them on purpose, paste the new numbers.
  tablet: { buffers: 'ba22baf447ba3492', centres: '8b83cd09da23923a', loops: '21e5ac522b963cfc', triangles: 44 },
  low: { buffers: 'a2131d30ec9eb6c4', centres: '181edfad364ccbe5', loops: '810ddfc91ace87bb', triangles: 22 },
};

/** The atmosphere of grunnur's layout on a world as main.js makes one, and the frame the loop runs: the clock, then the wind, then the forest. */
function butterflyStage({ layout = grunnur.layout, q = PRESETS.tablet, loadModel = null } = {}) {
  const world = {
    renderer: { getDrawingBufferSize: v => v.set(1280, 800) }, scene: new THREE.Scene(), clock: createClock(), effects: createEffects(),
    actors: new Map(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200),
  };
  if (loadModel) world.loadModel = loadModel; // else the hero butterfly has no model here, and flies unseen
  world.camera.position.set(-9, 1.3, 6);
  world.resolvePoint = createPointResolver(world);
  const shared = { uWindTime: { value: 0 }, uWindDirection: { value: new THREE.Vector2(0.8, 0.6).normalize() } };
  const air = atmosphere.createAtmosphere(world, { layout, seed: layout.seed, terrain: createTerrain(world, layout, layout.seed), shared, sun: SUN, q });
  world.forest = { butterflies: air.butterflies };
  const mesh = air.group.getObjectByName('Butterflies');
  // what three hands the shader of the butterflies' material
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  mesh.material.onBeforeCompile(shader);
  const frame = (dt = 1 / 30) => {
    world.clock.step(dt);
    shared.uWindTime.value = world.clock.time; // wind.update(clock.time)
    world.effects.update(dt);
    air.update(world.camera);
  };
  const butterflies = air.butterflies;
  // pale: the targets the shader's arrays hold, by index (the hero, the last target, is posed through its own group)
  return { world, air, shared, frame, mesh, shader, butterflies, targets: butterflies.targets, pale: butterflies.targets.filter(t => t.name !== HERO), run: seconds => step(frame, seconds) };
}

/** Runs the shader's own flyPath, from its source text, on numbers: it is plain scalar GLSL, which JavaScript reads as it is. */
function shaderFlyPath(vertexShader) {
  const source = vertexShader.match(/vec3 flyPath\( int id, float t \) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(source, 'the butterflies\' shader has a flyPath function');
  const statements = source.split(';').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(statements.slice(0, 2), ['vec3 c = uFlyCentre[ id ]', 'vec3 l = uFlyLoop[ id ]'], 'it flies a butterfly from its centre and loop');
  const returned = statements[2].match(/^return c \+ vec3\( ([\s\S]*) \)$/);
  assert.ok(returned, 'and returns c + vec3( x, y, z )');
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < returned[1].length; i++) {
    const ch = returned[1][i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { parts.push(returned[1].slice(from, i)); from = i + 1; }
  }
  parts.push(returned[1].slice(from));
  assert.equal(parts.length, 3);
  const [x, y, z] = parts.map(p => new Function('t', 'l', `const sin = Math.sin, cos = Math.cos; return ${p};`));
  return (t, centre, loop) => new THREE.Vector3(centre.x + x(t, loop), centre.y + y(t, loop), centre.z + z(t, loop));
}

/** What the shader's own loop gives butterfly `id` when the wind clock reads `time`: where it is, which way it faces and how wide its wings are. */
function loopPose(stage, id, time) {
  const flyPath = shaderFlyPath(stage.shader.vertexShader);
  const aFly = stage.mesh.geometry.getAttribute('aFly');
  let speed;
  let phase;
  for (let i = 0; i < aFly.count; i++) if (Math.round(aFly.getX(i)) === id) { speed = aFly.getZ(i); phase = aFly.getW(i); break; }
  const centre = stage.shader.uniforms.uFlyCentre.value[id];
  const loop = stage.shader.uniforms.uFlyLoop.value[id];
  const t = time * speed + phase;
  const here = flyPath(t, centre, loop);
  const ahead = flyPath(t + 0.05, centre, loop);
  const wings = stage.shader.vertexShader.match(/float flap = ([^;]+);/)?.[1];
  assert.ok(wings, 'the shader has a wing beat');
  return {
    position: here,
    yaw: Math.atan2(ahead.z - here.z, ahead.x - here.x),
    flap: new Function('uWindTime', 'aFly', `const sin = Math.sin; return ${wings};`)(time, { w: phase }),
  };
}
/** Where the shader puts butterfly `id` when the wind clock reads `time`: its own formula, fed what is in the mesh and its uniforms. */
const loopPosition = (stage, id, time) => loopPose(stage, id, time).position;
const held = (stage, id) => stage.shader.uniforms.uFlyFace.value[id].y; // 1 while the code holds a butterfly, 0 while the shader flies it
const here = (stage, id) => stage.targets[id].point.clone();
const wait = (stage, handle, limit = 20) => {
  for (let t = 0; !handle.done && t < limit; t += 1 / 30) stage.frame();
  return handle.done;
};

test('the butterflies\' CPU positions are the shader\'s own formula', () => {
  const stage = butterflyStage();
  assert.equal(stage.pale.length, 4);
  for (const time of [0, 0.37, 1.5, 12.84, 100.2, 601.9]) {
    stage.shared.uWindTime.value = time;
    stage.air.update(stage.world.camera);
    stage.pale.forEach((target, id) => {
      const expected = loopPosition(stage, id, time);
      assert.ok(target.point.distanceTo(expected) < 1e-9, `butterfly ${id + 1} at ${time} s is ${target.point.distanceTo(expected)} m from where the shader puts it`);
    });
  }
  // the check can fail: the butterflies do fly about, and each its own loop
  const early = here(stage, 0);
  stage.shared.uWindTime.value = 3;
  stage.air.update(stage.world.camera);
  assert.ok(here(stage, 0).distanceTo(early) > 0.5, 'the butterfly moved');
  assert.ok(here(stage, 0).distanceTo(here(stage, 1)) > 1, 'and not as another does');
});

test('with nothing tapped the shader flies every butterfly, as it did before they could be tapped', () => {
  for (const q of [PRESETS.tablet, PRESETS.low]) {
    const stage = butterflyStage({ q });
    const old = OLD_GRUNNUR[q.name];
    const g = stage.mesh.geometry;
    assert.equal(sha([...['position', 'color', 'aFly'].map(n => g.getAttribute(n).array), g.index.array]), old.buffers, `${q.name}: the butterflies\' mesh`);
    assert.equal(g.index.count / 3, old.triangles);
    const centres = stage.shader.uniforms.uFlyCentre.value, loops = stage.shader.uniforms.uFlyLoop.value;
    assert.equal(sha([Float32Array.from(centres.flatMap(v => v.toArray()))]), old.centres, `${q.name}: their centres`);
    assert.equal(sha([Float32Array.from(loops.flatMap(v => v.toArray()))]), old.loops, `${q.name}: their loops`);
    assert.equal(stage.air.group.children.length, 3, 'shafts, motes and the butterflies: no draw call more');
    assert.equal(stage.mesh.renderOrder, 3);
    assert.equal(stage.mesh.material.customProgramCacheKey(), 'forest-butterflies');

    // the shader still has its old formula and its old way of posing a wing, word for word
    const shaderText = stage.shader.vertexShader;
    for (const line of [
      'vec3 flyPath( int id, float t ) {',
      '  vec3 c = uFlyCentre[ id ];',
      '  vec3 l = uFlyLoop[ id ];',
      '  return c + vec3( sin( t ) * l.x + sin( t * 2.3 ) * 0.35, l.z + 0.35 * sin( t * 1.7 ) + 0.12 * sin( t * 5.1 ), sin( t * 0.83 + 1.1 ) * l.y + cos( t * 1.9 ) * 0.3 );',
      '  int flyId = int( aFly.x + 0.5 );',
      '  float flyT = uWindTime * aFly.z + aFly.w;',
      '  vec3 flyP = flyPath( flyId, flyT );',
      '  vec3 flyAhead = flyPath( flyId, flyT + 0.05 ) - flyP;',
      '  float yaw = atan( flyAhead.z, flyAhead.x );',
      '  float flap = 0.25 + 1.05 * ( 0.5 + 0.5 * sin( uWindTime * 17.0 + aFly.w * 7.0 ) );',
      '  lp = vec3( lp.x, lp.y * cos( flap ) + abs( lp.z ) * sin( flap ), lp.z * cos( flap ) );',
      '  lp *= 1.6;',
      '  transformed = flyP + vec3( lp.x * cy - lp.z * sy, lp.y, lp.x * sy + lp.z * cy );',
    ]) assert.ok(shaderText.includes(line), `the shader lost "${line}"`);

    // and nothing is held in code: the shader is let fly them, frame after frame
    stage.run(40);
    stage.pale.forEach((_, id) => assert.equal(held(stage, id), 0, `butterfly ${id + 1} is flown by the shader`));
    assert.equal(stage.pale.length, q.name === 'low' ? 2 : 4);
    assert.equal(stage.targets.length, stage.pale.length + 1, 'and the hero');
  }
});

test('a butterfly close to the lens wears away from its wing tips in, as the moss does from its edges, and further off is as it was', () => {
  for (const q of [PRESETS.tablet, PRESETS.low]) {
    const { mesh, shader } = butterflyStage({ q });
    assert.equal(mesh.material.alphaTest, 0.5, 'alpha-tested, so it needs no sorting');
    assert.equal(mesh.material.alphaToCoverage, Boolean(q.antialias), 'and dithered by the multisampling where there is any');
    assert.match(shader.vertexShader, /float flyNear = smoothstep\( 1\.2, 3\.0, -\( modelViewMatrix \* vec4\( transformed, 1\.0 \) \)\.z \);/, 'gone by 1.2 m, whole from 3 m');
    assert.match(shader.vertexShader, /vFlyNear = clamp\( 2\.0 \* flyNear - 0\.8 \* flyEdge, 0\.0, 1\.0 \);/, 'the tips first');
    // the same sum: from 3 m on every part of a wing is whole (alpha 1, so neither the alpha test nor the coverage touches it); at
    // 2 m the tips are gone and the roots stay; by 1.2 m all of it
    const near = depth => { const t = Math.min(1, Math.max(0, (depth - 1.2) / 1.8)); return t * t * (3 - 2 * t); };
    const alpha = (depth, edge) => Math.min(1, Math.max(0, 2 * near(depth) - 0.8 * edge));
    for (const edge of [0, 0.5, 1]) assert.equal(alpha(3, edge), 1);
    assert.ok(alpha(2, 1) < 0.5 && alpha(2, 0) >= 0.5, 'at 2 m the tips go, the roots stay');
    assert.equal(alpha(1.2, 0), 0);
    assert.match(shader.fragmentShader, /#include <color_fragment>\s*diffuseColor\.a \*= vFlyNear;/, 'before the alpha test');
  }
});

test('the butterflies are tap targets, butterfly-1 and so on, whose points follow them', () => {
  const stage = butterflyStage();
  assert.deepEqual(stage.targets.map(t => t.name), ['butterfly-1', 'butterfly-2', 'butterfly-3', 'butterfly-4', 'butterfly-hero']);
  for (const target of stage.targets) {
    assert.ok(target.point.isVector3, 'a point spec a tap target takes');
    assert.ok(target.radius >= 0.2 && target.radius <= 1, `${target.radius} m round a butterfly`);
  }
  const point = stage.targets[2].point;
  const seen = [];
  for (let i = 0; i < 30; i++) {
    stage.frame();
    seen.push(stage.world.resolvePoint(point, new THREE.Vector3()));
    assert.ok(seen.at(-1).distanceTo(loopPosition(stage, 2, stage.shared.uWindTime.value)) < 1e-9, 'it is where the butterfly is now');
  }
  assert.equal(stage.targets[2].point, point, 'the same vector for good, so a target that holds it follows');
  assert.ok(seen[0].distanceTo(seen.at(-1)) > 0.2);
  assert.equal(stage.butterflies.targets, stage.targets);
});

test('flutter sends one butterfly up and away for 3 s, and it comes back to its loop', () => {
  const stage = butterflyStage();
  stage.run(2);
  const others = [0, 2, 3];
  const handle = stage.butterflies.flutter('butterfly-2');
  assert.equal(handle.done, false);
  assert.equal(stage.butterflies.flutter('butterfly-2'), handle, 'a second tap joins the flutter under way');
  const start = stage.shared.uWindTime.value;
  const seen = [];
  while (!handle.done && seen.length < 200) {
    stage.frame();
    const time = stage.shared.uWindTime.value;
    const loop = loopPosition(stage, 1, time);
    seen.push({ time: time - start, off: here(stage, 1).sub(loop) });
    assert.equal(held(stage, 1), handle.done ? 0 : 1, 'while it flutters the code flies it');
    for (const id of others) {
      assert.equal(held(stage, id), 0, `butterfly ${id + 1} was not tapped`);
      assert.ok(here(stage, id).distanceTo(loopPosition(stage, id, time)) < 1e-9, `and keeps to its loop`);
    }
  }
  assert.equal(handle.done, true);
  assert.equal(handle.cancelled, false);
  const length = seen.at(-1).time;
  assert.ok(length >= 3 - 1e-6 && length < 3.1, `${length.toFixed(2)} s`);
  // up and away, most of the way through
  const middle = seen.find(s => s.time >= 1.5);
  assert.ok(middle.off.y > 1.2, `${middle.off.y.toFixed(2)} m above its loop half way`);
  assert.ok(Math.hypot(middle.off.x, middle.off.z) > 2, `${Math.hypot(middle.off.x, middle.off.z).toFixed(2)} m aside`);
  assert.ok(Math.max(...seen.map(s => s.off.y)) < 4, 'and not out of the world');
  // smooth: it leaves its loop gently (no jump in the first frame) and the last frame is its loop again
  assert.ok(seen[0].off.length() < 0.1, `first frame ${seen[0].off.length().toFixed(3)} m from its loop`);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].off.distanceTo(seen[i - 1].off) < 0.35, `a jump of ${seen[i].off.distanceTo(seen[i - 1].off).toFixed(2)} m in frame ${i}`);
  assert.equal(held(stage, 1), 0, 'the shader has it again');
  stage.frame();
  assert.ok(here(stage, 1).distanceTo(loopPosition(stage, 1, stage.shared.uWindTime.value)) < 1e-9, 'on its loop');
  // and it can be sent again
  const again = stage.butterflies.flutter('butterfly-2');
  assert.notEqual(again, handle);
  assert.equal(again.done, false);
  assert.ok(wait(stage, again));
});

// ---- the hero butterfly: a model of its own, flown as the pale ones are -------------------------------
test('the hero butterfly is one more, under the mesh, on a loop of its own, and sent to a point only by name', async () => {
  const stage = butterflyStage();
  const hero = stage.butterflies.hero;
  assert.equal(hero.name, HERO);
  assert.equal(HERO, 'butterfly-hero');
  assert.equal(stage.targets.at(-1).name, HERO, 'the last tap target');
  assert.equal(hero.group.parent, stage.mesh, 'under the butterflies\' mesh, so the atmosphere is still three objects');
  assert.equal(await hero.loaded, false, 'this world reads no model: it flies unseen');
  assert.equal(hero.group.children.length, 0);
  stage.run(2);
  const point = stage.targets.at(-1).point;
  const was = point.clone();
  const feet = hero.group.position.y - point.y;
  assert.ok(feet > 0.05 && feet < 0.1, `it stands ${feet} m above its point: on its feet`);
  assert.ok(hero.group.position.x === point.x && hero.group.position.z === point.z, 'over the point');
  stage.run(2);
  assert.ok(point.distanceTo(was) > 0.3, 'it flies on the wind clock');
  assert.ok(Math.abs(hero.group.position.y - point.y - feet) < 1e-9, 'still on its feet');

  // a landing asked without a name takes the nearest pale butterfly, never the hero, even where the hero is the nearest
  const target = point.clone().add(new THREE.Vector3(0.05, 0, 0));
  const handle = stage.butterflies.land(target);
  assert.notEqual(handle.label, `${HERO} lands`);
  stage.run(3.5);
  assert.equal(handle.done, true);
  assert.ok(point.distanceTo(target) > 0.3, 'the hero went on with its loop');
  const landed = stage.pale.map((_, id) => here(stage, id).distanceTo(target));
  assert.ok(Math.min(...landed) < 1e-6, `a pale butterfly sits on the point (${landed.map(d => d.toFixed(2))})`);

  // by name it flies there and stands on the point, and no pale butterfly more is held
  const heldBefore = stage.pale.map((_, id) => held(stage, id));
  const named = stage.butterflies.land(target, { name: HERO });
  assert.equal(named.label, `${HERO} lands`);
  stage.run(3.5);
  assert.equal(named.done, true);
  assert.ok(point.distanceTo(target) < 1e-9, 'the hero sits on the point');
  assert.ok(hero.group.position.distanceTo(target.clone().setY(target.y + feet)) < 1e-9, 'its feet on it');
  assert.deepEqual(stage.pale.map((_, id) => held(stage, id)), heldBefore, 'the pale butterflies are as they were');

  // a tap sends it off again, back to its loop
  const off = stage.butterflies.flutter(HERO);
  assert.equal(off.label, `${HERO} flutters`);
  stage.run(3.5);
  assert.equal(off.done, true);
  assert.ok(point.distanceTo(target) > 0.5, 'off the point');
});

test('the hero butterfly\'s model: under 300 KB and 4,000 triangles, its wings turned by the beat and its feet on its point', async () => {
  const models = new Map(); // as the chapter harness reads models: once a file
  const loadModel = url => models.get(url) ?? models.set(url, loadGlb(new URL(url))).get(url);
  const stage = butterflyStage({ loadModel });
  const hero = stage.butterflies.hero;
  assert.equal(await hero.loaded, true);
  const body = hero.group.getObjectByName('Body'), wingL = hero.group.getObjectByName('WingL'), wingR = hero.group.getObjectByName('WingR');
  assert.ok(body && wingL && wingR, 'Body, WingL and WingR');
  let triangles = 0;
  hero.group.traverse(o => { if (o.isMesh) triangles += o.geometry.index.count / 3; });
  assert.ok(triangles > 2000 && triangles <= 4000, `${triangles} triangles`);
  const bytes = fs.statSync(new URL('../assets/critters/butterfly.glb', import.meta.url)).size;
  assert.ok(bytes < 300 * 1024, `${bytes} bytes`);
  hero.group.traverse(o => { if (o.isMesh) assert.equal(o.castShadow, false, 'no shadow caster'); });

  stage.run(1);
  const point = stage.targets.at(-1).point;
  assert.ok(body.userData.feet > 0.05 && body.userData.feet < 0.1, 'the model says where its feet are');
  assert.ok(Math.abs(hero.group.position.y - point.y - body.userData.feet) < 1e-9, 'it stands on its feet, as far below the body axis as the model says');
  // the wings: one lifted by the shader's beat, the other the same the other way about the body axis
  const l = wingL.rotation.x, r = wingR.rotation.x;
  assert.ok(l > 0 && l < 1.6 && Math.abs(l + r) < 1e-12, `wings at ${l} and ${r}`);
  const seen = new Set();
  for (let i = 0; i < 30; i++) { stage.frame(); seen.add(wingL.rotation.x.toFixed(3)); }
  assert.ok(seen.size > 10, 'and they beat');

  // the file's scene is shared: another forest's hero is a copy with the same geometry, and a disposed one leaves it be
  const other = butterflyStage({ loadModel });
  assert.equal(await other.butterflies.hero.loaded, true);
  assert.notEqual(other.butterflies.hero.group.getObjectByName('Body'), body);
  assert.equal(other.butterflies.hero.group.getObjectByName('Body').geometry, body.geometry);
  stage.butterflies.dispose();
  assert.equal(hero.group.children.length, 0);
  assert.equal(other.butterflies.hero.group.getObjectByName('Body').geometry.attributes.position.count > 0, true);
});

test('flutter takes a name the forest has', () => {
  const stage = butterflyStage({ q: PRESETS.low });
  assert.throws(() => stage.butterflies.flutter('butterfly-3'), /butterfly-3/, 'low quality flies two');
  assert.throws(() => stage.butterflies.flutter('moth'), /moth/);
  assert.equal(stage.butterflies.flutter('butterfly-1').done, false);
});

test('a flutter moves with the game clock only', () => {
  const stage = butterflyStage();
  stage.run(1);
  const handle = stage.butterflies.flutter('butterfly-1');
  stage.run(1);
  const was = here(stage, 0);
  stage.world.clock.setPaused(true);
  for (let i = 0; i < 60; i++) { stage.world.effects.update(stage.world.clock.tick(1 / 30)); stage.air.update(stage.world.camera); }
  assert.equal(handle.done, false);
  assert.ok(here(stage, 0).equals(was), 'two paused seconds do nothing');
  stage.world.clock.setPaused(false);
  assert.ok(wait(stage, handle));
});

test('the code takes a butterfly over and gives it back without a pop: it starts and ends as the shader has it', () => {
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const frame = 1 / 30;
  // every butterfly, started at different points of its loop and its wing beat
  for (const [id, delay] of [[0, 0], [1, 0.37], [2, 0.8], [3, 1.1], [1, 1.9], [2, 2.45]]) {
    const stage = butterflyStage();
    stage.run(1.5 + delay);
    const handle = stage.butterflies.flutter(`butterfly-${id + 1}`);
    const start = stage.shared.uWindTime.value;
    const apart = { first: { yaw: 0, flap: 0, frames: 0 }, last: { yaw: 0, flap: 0, frames: 0 } };
    for (let i = 0; !handle.done && i < 200; i++) {
      stage.frame();
      const time = stage.shared.uWindTime.value;
      const k = (time - start) / 3;
      const part = k < 0.012 ? apart.first : k > 0.98 && k < 1 ? apart.last : null; // the first frame it has it, and the last
      if (!part) continue;
      part.frames++;
      const held = { yaw: stage.shader.uniforms.uFlyFace.value[id].x, flap: stage.shader.uniforms.uFlyHold.value[id].w };
      // The wings are the shader's own wings. The heading goes on from the frame before when it takes over (the shader's own heading
      // turns by as much as 100 degrees in a frame at the turns of a loop), and is the shader's heading when it hands back.
      part.yaw = Math.max(part.yaw, Math.abs(wrap(held.yaw - loopPose(stage, id, part === apart.first ? time - frame : time).yaw)));
      part.flap = Math.max(part.flap, Math.abs(held.flap - loopPose(stage, id, time).flap));
    }
    assert.ok(handle.done);
    for (const [where, a] of Object.entries(apart)) {
      assert.ok(a.frames >= 1, `a frame to look at: ${where}`);
      assert.ok(a.yaw < (where === 'first' ? 0.12 : 0.4), `butterfly ${id + 1} (${delay} s on): ${a.yaw.toFixed(2)} rad off the shader's heading at the ${where} frame`);
      assert.ok(a.flap < 0.12, `butterfly ${id + 1} (${delay} s on): ${a.flap.toFixed(2)} rad off the shader's wings at the ${where} frame`);
    }
  }
});

// ---- landing ---------------------------------------------------------------------------------------

/** A stand-in for Mosi whose head a test moves about, and the point spec for a horn on it. */
function withMosi(stage, at = new THREE.Vector3(3, 1.6, 1)) {
  const head = at.clone();
  const mosi = { root: new THREE.Group(), centre: out => out.copy(head).setY(head.y - 1), headPosition: out => out.copy(head) };
  stage.world.actors.set('mosi', mosi);
  return { head, horn: { actor: 'mosi', part: 'head', offset: [0.4, 0.5, 0.2] } };
}
const hornAt = (head, horn) => head.clone().add(new THREE.Vector3(...horn.offset));

test('butterflyLand flies one butterfly to the point and settles it there', () => {
  const stage = butterflyStage();
  stage.run(1);
  const { head, horn } = withMosi(stage);
  const goal = hornAt(head, horn);
  const handle = atmosphere.butterflyLand(stage.world, horn, { duration: 3 });
  assert.equal(handle.done, false);
  const before = stage.targets.map((_, id) => here(stage, id));
  const nearest = before.map((p, id) => [p.distanceTo(goal), id]).sort((a, b) => a[0] - b[0])[0][1];
  const seen = [];
  const start = stage.shared.uWindTime.value;
  while (!handle.done && seen.length < 200) {
    stage.frame();
    seen.push({ time: stage.shared.uWindTime.value - start, at: here(stage, nearest) });
  }
  assert.equal(handle.cancelled, false);
  const length = seen.at(-1).time;
  assert.ok(length >= 3 - 1e-6 && length < 3.1, `it took ${length.toFixed(2)} s`);
  assert.ok(seen.at(-1).at.distanceTo(goal) < 1e-6, 'and it is on the horn');
  assert.equal(held(stage, nearest), 1, 'which the code holds it on: the shader does not fly it');
  // on its way it comes closer, as one flight, not a jump
  const away = seen.map(s => s.at.distanceTo(goal));
  assert.ok(away[Math.floor(away.length / 2)] < away[0] && away[Math.floor(away.length / 2)] > 0.2, 'half way there at half the time');
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].at.distanceTo(seen[i - 1].at) < 0.6, `a jump of ${seen[i].at.distanceTo(seen[i - 1].at).toFixed(2)} m in frame ${i}`);
  // the other butterflies flew on
  stage.pale.forEach((_, id) => { if (id !== nearest) assert.equal(held(stage, id), 0); });
});

test('a landed butterfly follows the moving point', () => {
  const stage = butterflyStage();
  const { head, horn } = withMosi(stage);
  stage.run(0.5);
  const handle = atmosphere.butterflyLand(stage.world, horn);
  assert.ok(wait(stage, handle));
  const id = stage.targets.findIndex((_, i) => held(stage, i) === 1);
  assert.ok(id >= 0, 'one butterfly is held');
  // Mosi walks on (and his head bobs); the butterfly stays where the horn is, however long it has sat there
  const worst = [];
  for (let i = 0; i < 400; i++) {
    head.x += 0.03;
    head.z -= 0.012;
    head.y = 1.6 + 0.08 * Math.sin(i / 7);
    stage.frame();
    worst.push(here(stage, id).distanceTo(hornAt(head, horn)));
  }
  assert.ok(Math.max(...worst) < 1e-6, `${Math.max(...worst)} m off the horn`);
  assert.equal(handle.done, true);
  assert.equal(held(stage, id), 1);
  assert.ok(head.x > 14, 'he really did walk on');
});

test('a point given as a function is followed too: a horn read off a head that turns as well as moves', () => {
  const stage = butterflyStage();
  stage.run(0.5);
  const head = new THREE.Vector3(3, 1.6, 1);
  const turn = new THREE.Quaternion();
  const horn = new THREE.Vector3(1.6, 0.9, 0.4); // in the head's own frame
  const spec = out => out.copy(horn).applyQuaternion(turn).add(head); // where the horn is: turned with the head, not just carried by it
  const handle = atmosphere.butterflyLand(stage.world, spec);
  assert.ok(wait(stage, handle));
  const id = stage.targets.findIndex((_, i) => held(stage, i) === 1);
  assert.ok(id >= 0);
  const off = [];
  const turned = [];
  for (let i = 0; i < 300; i++) {
    head.x += 0.02;
    turn.setFromEuler(new THREE.Euler(0, 0.4 * Math.sin(i / 20), 0.25 * Math.sin(i / 13))); // the head bobs and turns as it walks
    stage.frame();
    const at = spec(new THREE.Vector3());
    off.push(here(stage, id).distanceTo(at));
    turned.push(at.clone().sub(head));
  }
  assert.ok(Math.max(...off) < 1e-6, `${Math.max(...off)} m off the horn`);
  assert.ok(Math.max(...turned.map(p => p.distanceTo(turned[0]))) > 0.5, 'the horn really did swing about the head');
});

test('a landed butterfly is sent away by a flutter, and comes back to its loop', () => {
  const stage = butterflyStage();
  const { head, horn } = withMosi(stage);
  assert.ok(wait(stage, atmosphere.butterflyLand(stage.world, horn, { duration: 2 })));
  const id = stage.targets.findIndex((_, i) => held(stage, i) === 1);
  stage.run(1);
  const sat = { yaw: stage.shader.uniforms.uFlyFace.value[id].x, flap: stage.shader.uniforms.uFlyHold.value[id].w };
  const flutter = stage.butterflies.flutter(stage.targets[id].name);
  assert.equal(flutter.done, false);
  const perch = hornAt(head, horn);
  const lifted = [];
  for (let i = 0; !flutter.done && i < 600; i++) {
    head.x += 0.01; // Mosi goes on his way; the butterfly does not
    stage.frame();
    lifted.push(here(stage, id));
    if (i === 0) {
      // it goes on from how it sat: facing the same way, its wings as they were, not snapped to a beat
      assert.ok(Math.abs(Math.atan2(Math.sin(stage.shader.uniforms.uFlyFace.value[id].x - sat.yaw), Math.cos(stage.shader.uniforms.uFlyFace.value[id].x - sat.yaw))) < 0.2, 'it keeps its heading');
      assert.ok(Math.abs(stage.shader.uniforms.uFlyHold.value[id].w - sat.flap) < 0.1, 'and its wings');
    }
  }
  assert.ok(flutter.done, 'the flutter ends');
  assert.ok(lifted[0].distanceTo(perch) < 0.2, 'it leaves from the horn');
  assert.ok(lifted.some(p => p.y > perch.y + 1), 'up and away');
  assert.ok(hornAt(head, horn).distanceTo(perch) > 0.5, 'while Mosi has walked on');
  assert.equal(held(stage, id), 0, 'the shader flies it again');
  stage.frame();
  assert.ok(here(stage, id).distanceTo(loopPosition(stage, id, stage.shared.uWindTime.value)) < 1e-9, 'on its loop');
});

test('cancelling a flight to a point sends the butterfly back to its loop', () => {
  const stage = butterflyStage();
  const { horn } = withMosi(stage);
  const handle = atmosphere.butterflyLand(stage.world, horn, { duration: 4 });
  stage.run(1.5);
  handle.cancel();
  assert.equal(handle.done, true);
  assert.equal(handle.cancelled, true);
  const id = stage.targets.findIndex((_, i) => held(stage, i) === 1);
  assert.ok(id >= 0, 'it is still held while it leaves');
  stage.run(3.2);
  assert.equal(held(stage, id), 0, 'and then the shader flies it');
  stage.frame();
  assert.ok(here(stage, id).distanceTo(loopPosition(stage, id, stage.shared.uWindTime.value)) < 1e-9);
});

test('butterflyLand takes the butterfly nearest the point, or the one it is told to', () => {
  const stage = butterflyStage();
  stage.run(1);
  for (const id of [2, 0, 3, 1]) {
    const fresh = butterflyStage();
    fresh.run(1);
    const spot = here(fresh, id).add(new THREE.Vector3(0.3, 0.4, -0.2));
    atmosphere.butterflyLand(fresh.world, spot);
    fresh.frame();
    assert.deepEqual(fresh.pale.map((_, i) => held(fresh, i)), [0, 1, 2, 3].map(i => (i === id ? 1 : 0)), `the point beside butterfly ${id + 1}`);
  }
  // one that is told which
  const spot = new THREE.Vector3(1, 1, 1);
  atmosphere.butterflyLand(stage.world, spot, { name: 'butterfly-4' });
  stage.frame();
  assert.equal(held(stage, 3), 1);
  // a second landing takes another, while the first sits
  const second = atmosphere.butterflyLand(stage.world, spot.clone().add(new THREE.Vector3(0.1, 0, 0)));
  stage.frame();
  assert.equal([0, 1, 2, 3].filter(i => held(stage, i) === 1).length, 2);
  assert.ok(wait(stage, second));
});

test('butterflyLand refuses what it cannot do at the call, and leaves the butterflies as they were', () => {
  const stage = butterflyStage();
  assert.throws(() => atmosphere.butterflyLand(stage.world, 'nobody.head'), /nobody/);
  assert.throws(() => atmosphere.butterflyLand(stage.world, null), /point/i);
  assert.throws(() => atmosphere.butterflyLand(stage.world, [0, 1, 0], { duration: 0 }), /duration/);
  assert.throws(() => atmosphere.butterflyLand(stage.world, [0, 1, 0], { name: 'moth' }), /moth/);
  assert.throws(() => atmosphere.butterflyLand({ resolvePoint: stage.world.resolvePoint }, [0, 1, 0]), /butterflies/);
  assert.throws(() => atmosphere.butterflyLand({ forest: {} }, [0, 1, 0]), /butterflies/);
  stage.run(0.5);
  stage.pale.forEach((_, id) => assert.equal(held(stage, id), 0));
});

test('a butterfly whose point can no longer be found is let go, not held for good', t => {
  const stage = butterflyStage();
  const { horn } = withMosi(stage);
  const handle = atmosphere.butterflyLand(stage.world, horn, { duration: 3 });
  stage.run(1);
  const errors = t.mock.method(console, 'error', () => {});
  stage.world.actors.delete('mosi'); // gone from the scene
  stage.run(0.2);
  assert.equal(handle.done, true, 'a script waiting for it goes on');
  assert.equal(handle.cancelled, true);
  assert.equal(errors.mock.callCount(), 1, 'and it says so once');
  stage.run(4);
  assert.equal(errors.mock.callCount(), 1);
  assert.deepEqual(stage.pale.map((_, id) => held(stage, id)), [0, 0, 0, 0], 'the shader flies them all again');
});

test('a script waiting on a butterfly is not left waiting when its forest goes out of view', () => {
  // the forest's own update runs only while it is the one in view: here it is not called at all
  const away = stage => (dt = 1 / 30) => {
    stage.world.clock.step(dt);
    stage.shared.uWindTime.value = stage.world.clock.time;
    stage.world.effects.update(dt);
  };
  const flutterOnly = butterflyStage();
  step(away(flutterOnly), 0.5);
  const fluttering = flutterOnly.butterflies.flutter('butterfly-1');
  assert.equal(flutterOnly.world.effects.size, 1, 'a flutter is on the game clock while it lasts');
  flutterOnly.butterflies.flutter('butterfly-2');
  assert.equal(flutterOnly.world.effects.size, 1, 'once, not for each butterfly');
  step(away(flutterOnly), 3.3);
  assert.equal(fluttering.done, true);
  assert.equal(flutterOnly.world.effects.size, 0, 'and nothing is left running once it is over');

  const landOnly = butterflyStage();
  const { horn } = withMosi(landOnly);
  step(away(landOnly), 0.5);
  const landing = atmosphere.butterflyLand(landOnly.world, horn);
  assert.equal(landOnly.world.effects.size, 1, 'so is a landing');
  step(away(landOnly), 3.3);
  assert.equal(landing.done, true);
  assert.equal(landing.cancelled, false);
  assert.equal(landOnly.world.effects.size, 0);

  // A stopped scene clears world.effects (scene.stop): a flutter after that is driven on the game clock again.
  const cleared = butterflyStage();
  step(away(cleared), 0.5);
  cleared.butterflies.flutter('butterfly-1');
  cleared.world.effects.clear();
  const again = cleared.butterflies.flutter('butterfly-2');
  assert.equal(cleared.world.effects.size, 1, 'the flutter is on the game clock, though the last driver was cleared away');
  step(away(cleared), 3.3);
  assert.equal(again.done, true);
});

test('disposing the forest lets a script waiting on a butterfly go on', () => {
  const stage = butterflyStage();
  const { horn } = withMosi(stage);
  const landing = atmosphere.butterflyLand(stage.world, horn);
  const fluttering = stage.butterflies.flutter('butterfly-1');
  stage.run(0.5);
  stage.air.dispose();
  assert.equal(landing.done, true);
  assert.equal(landing.cancelled, true);
  assert.equal(fluttering.done, true);
});

// ---- the forest itself -------------------------------------------------------------------------

test('a forest exposes its butterflies and drives them from its update', async () => {
  const look = pickLook('morning');
  const layout = { ...grunnur.layout, seed: 5, clearing: { center: [0, 0], radius: 9 }, forestEdge: 14, path: [[-48, 14], [-30, 9], [-16, 4], [-6, 1], [3, 0]] };
  const world = {
    THREE, renderer: { getDrawingBufferSize: v => v.set(1280, 800) }, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200),
    q: PRESETS.low, params: new URLSearchParams(''), look, lighting: { direction: sunDirection(look), sun: null, focusRadius: 10 },
    wind: createWind(), chapter: { look: 'morning', actors: {} }, heightAt: () => 0, actors: new Map(),
  };
  world.resolvePoint = createPointResolver(world);
  const forest = await createForest(world, layout);
  world.forest = forest;
  const { butterflies } = forest;
  assert.ok(butterflies, 'world.forest.butterflies');
  assert.deepEqual(butterflies.targets.map(t => t.name), ['butterfly-1', 'butterfly-2', 'butterfly-hero'], 'low quality flies two pale ones, and the hero');
  const mesh = forest.group.getObjectByName('Butterflies');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  mesh.material.onBeforeCompile(shader);
  const flyPath = shaderFlyPath(shader.vertexShader);
  const aFly = mesh.geometry.getAttribute('aFly');
  for (const time of [0, 4.5, 20]) {
    world.wind.update(time);
    forest.update(1 / 30, time);
    butterflies.targets.filter(t => t.name !== HERO).forEach((target, id) => { // the hero is posed through its own group, not the shader
      let speed;
      let phase;
      for (let i = 0; i < aFly.count; i++) if (Math.round(aFly.getX(i)) === id) { speed = aFly.getZ(i); phase = aFly.getW(i); break; }
      const expected = flyPath(time * speed + phase, shader.uniforms.uFlyCentre.value[id], shader.uniforms.uFlyLoop.value[id]);
      assert.ok(world.resolvePoint(target.point, new THREE.Vector3()).distanceTo(expected) < 1e-9, `butterfly ${id + 1} at ${time} s`);
    });
  }
  // landing goes through the forest in view
  const handle = atmosphere.butterflyLand(world, [1, 1.5, 1], { duration: 1 });
  for (let i = 0; i < 40; i++) {
    world.wind.update(20 + (i + 1) / 30);
    forest.update(1 / 30, 20 + (i + 1) / 30);
  }
  assert.equal(handle.done, true);
  forest.dispose();
});

// ---- the frog, the snail, the beetle and the birds ---------------------------------------------

function stage() {
  const world = { scene: new THREE.Scene(), clock: createClock(), effects: createEffects(), actors: new Map(), heightAt: () => 0 };
  world.resolvePoint = createPointResolver(world);
  // one frame as main.js runs it: the clock moves on, then the effects update
  const frame = (dt = 1 / 30) => {
    world.clock.step(dt);
    world.effects.update(dt);
  };
  return { world, frame, run: seconds => step(frame, seconds) };
}
const SPOTS = [
  { name: 'frog', kind: 'frog', position: [0, 0, 0], heading: 0 },
  { name: 'snail', kind: 'snail', position: [1.5, 0, 0] },
  { name: 'beetle', kind: 'beetle', position: [3, 0, 0] },
];
/** Birds at 1, 3, 5.5, 6.5, 9 and 20 m from the origin, along +x. */
const BIRDS = [1, 3, 5.5, 6.5, 9, 20].map((x, i) => ({ name: `bird-${i + 1}`, position: [x, 0, 0] }));
const meshOf = (critters, name) => {
  let found = null;
  critters.group.getObjectByName(`Critter ${name}`).traverse(o => { if (o.isMesh) found = o; });
  return found;
};
const pointOf = (critters, name) => critters.targets.find(t => t.name === name).point;
const influence = (mesh, name) => mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]];
/** How many separate peaks a series has above `min`. */
const peaks = (series, min) => series.filter((v, i) => v > min && v >= series[i - 1] && v > (series[i + 1] ?? -Infinity)).length;
const upOf = mesh => new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
/** Frames until the handle is done, for 20 s at most; says whether it is. */
const until = (s, handle) => {
  for (let t = 0; !handle.done && t < 20; t += 1 / 30) s.frame();
  return handle.done;
};
/** Runs `read` for every frame of a reaction (until its handle is done, or 6 s) and gives the series. */
function watch(s, handle, read) {
  const series = [read()];
  for (let t = 0; !handle.done && t < 6; t += 1 / 30) { s.frame(); series.push(read()); }
  return series;
}

test('a critter reacts once per tap', () => {
  const s = stage();
  const critters = createCritters(s.world, { spots: SPOTS });
  const snail = meshOf(critters, 'snail');
  const beetle = meshOf(critters, 'beetle');
  const restY = pointOf(critters, 'frog').y;
  s.run(1); // nobody has tapped: they sit still
  assert.equal(pointOf(critters, 'frog').y, restY);
  assert.equal(influence(snail, 'hide'), 0);
  assert.ok(upOf(beetle).y > 0.99);

  const reactions = {
    frog: { read: () => pointOf(critters, 'frog').y - restY, count: series => peaks(series, 0.15), what: 'hop' },
    snail: { read: () => influence(snail, 'hide'), count: series => peaks(series, 0.9), what: 'hiding' },
    beetle: { read: () => upOf(beetle).y, count: series => series.filter((v, i) => v < 0 && series[i - 1] >= 0).length, what: 'roll over' }, // y is below 0 when it lies on its back
  };
  for (const [name, { read, count, what }] of Object.entries(reactions)) {
    for (const taps of [1, 2]) {
      const handle = critters.react(name);
      assert.equal(handle.done, false, `${name}: a tap starts a reaction`);
      assert.equal(critters.react(name), handle, `${name}: a second tap during it joins it, it does not react twice`);
      s.frame();
      assert.equal(critters.react(name), handle, `${name}: nor a third a moment later`);
      const series = watch(s, handle, read);
      assert.equal(handle.done, true, `${name}: the reaction ends`);
      assert.equal(handle.cancelled, false);
      assert.equal(count(series), 1, `${name}: tap ${taps} makes exactly one ${what}`);
      s.run(0.5); // and nothing goes on after it
      const after = [];
      for (let i = 0; i < 30; i++) { s.frame(); after.push(read()); }
      assert.equal(count(after), 0, `${name}: nothing more happens by itself`);
    }
  }
  // the reactions of the three are their own: tapping the frog did not move the snail
  assert.equal(influence(snail, 'hide'), 0);
});

test('the frog hops to one side and, tapped again, hops back; the snail and the beetle end as they were', () => {
  const s = stage();
  const critters = createCritters(s.world, { spots: SPOTS });
  const frog = critters.group.getObjectByName('Critter frog');
  const start = frog.position.clone();
  const tap = name => { assert.ok(until(s, critters.react(name)), `${name}'s reaction ends`); s.run(0.2); };
  tap('frog');
  const first = frog.position.clone();
  assert.ok(first.distanceTo(start) > 0.35 && first.distanceTo(start) < 1, `${first.distanceTo(start).toFixed(2)} m along`);
  assert.ok(Math.abs(first.y - start.y) < 1e-6, 'and down on the ground again');
  tap('frog');
  assert.ok(frog.position.distanceTo(start) < 1e-6, 'the second tap hops it back where it was');
  tap('frog');
  assert.ok(frog.position.distanceTo(first) < 1e-6, 'and the third forth again: it never wanders off');
  for (const name of ['snail', 'beetle']) {
    const group = critters.group.getObjectByName(`Critter ${name}`);
    const was = group.position.clone();
    const mesh = meshOf(critters, name);
    const quaternion = mesh.quaternion.clone();
    tap(name);
    assert.ok(group.position.distanceTo(was) < 1e-6, `${name} stays where it is`);
    assert.ok(Math.abs(mesh.quaternion.dot(quaternion)) > 1 - 1e-9, `${name} ends the way it started`);
  }
});

test('the frog hops over the ground as it is, and a tap target follows each critter', () => {
  const s = stage();
  s.world.heightAt = (x, z) => 0.3 * x; // a slope
  const critters = createCritters(s.world, { spots: [{ name: 'frog', kind: 'frog', position: [0, 0, 0], heading: 0 }] });
  const frog = critters.group.getObjectByName('Critter frog');
  const point = pointOf(critters, 'frog');
  assert.equal(critters.targets.length, 1);
  assert.ok(point.isVector3);
  const handle = critters.react('frog');
  const seen = [];
  for (let i = 0; !handle.done && i < 600; i++) {
    s.frame();
    assert.ok(point.distanceTo(s.world.resolvePoint(point, new THREE.Vector3())) < 1e-12, 'the target is a live point');
    assert.ok(Math.abs(point.x - frog.position.x) < 0.2 && Math.abs(point.z - frog.position.z) < 0.2, 'over the frog');
    seen.push(point.y - frog.position.y);
  }
  assert.ok(handle.done, 'the hop ends');
  assert.ok(Math.max(...seen) > 0.3, `the target went up with the frog: ${Math.max(...seen).toFixed(2)} m`);
  assert.ok(Math.abs(frog.position.y - 0.3 * frog.position.x) < 1e-6, `it landed on the slope: ${frog.position.y} at x ${frog.position.x}`);
});

/** The lowest point of a mesh as it stands now (its base shape, whatever its morph targets do), in world metres. */
function lowest(mesh) {
  const position = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  let low = Infinity;
  for (let i = 0; i < position.count; i++) low = Math.min(low, v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).y);
  return low;
}

test('the reactions are smooth: nothing snaps into its pose or out of it, and nothing sinks into the ground', () => {
  const s = stage();
  const critters = createCritters(s.world, { spots: SPOTS });
  const snail = meshOf(critters, 'snail');
  const beetle = meshOf(critters, 'beetle');
  // the frog, there and back: its target moves a step at a time, and it never goes under the ground
  for (const way of ['there', 'back']) {
    const handle = critters.react('frog');
    const last = pointOf(critters, 'frog').clone();
    let jump = 0;
    let low = Infinity;
    for (let i = 0; !handle.done && i < 300; i++) {
      s.frame();
      jump = Math.max(jump, last.distanceTo(pointOf(critters, 'frog')));
      last.copy(pointOf(critters, 'frog'));
      low = Math.min(low, lowest(meshOf(critters, 'frog')));
    }
    assert.ok(handle.done);
    assert.ok(jump < 0.12, `the frog's target moves ${jump.toFixed(2)} m in a frame ${way}`);
    assert.ok(low > -0.004, `the frog sinks ${(-low).toFixed(3)} m into the ground ${way}`);
  }
  // the snail goes in, stays in, and comes out slowly
  const hiding = critters.react('snail');
  const start = s.world.clock.time;
  const hidden = t => { while (s.world.clock.time < start + t - 1e-9) s.frame(); return influence(snail, 'hide'); };
  assert.ok(hidden(0.6) > 0.99, 'drawn in by 0.6 s');
  assert.ok(hidden(1.7) > 0.99, 'and in still');
  const coming = hidden(2.6);
  assert.ok(coming > 0.05 && coming < 0.95, `coming out at 2.6 s: ${coming.toFixed(2)}`);
  assert.ok(until(s, hiding));
  assert.equal(influence(snail, 'hide'), 0, 'out at the end');
  // the beetle: it rolls over and back a little at a time, on the ground and never into it
  const rolling = critters.react('beetle');
  let up = upOf(beetle).y;
  let snap = 0;
  let low = Infinity;
  for (let i = 0; !rolling.done && i < 300; i++) {
    s.frame();
    snap = Math.max(snap, Math.abs(upOf(beetle).y - up));
    up = upOf(beetle).y;
    low = Math.min(low, lowest(beetle));
  }
  assert.ok(rolling.done);
  assert.ok(snap < 0.75, `the beetle turns ${snap.toFixed(2)} of the way over in a frame`);
  assert.ok(low > -0.004, `the beetle sinks ${(-low).toFixed(3)} m into the ground`);
});

test('a capture that jumps the clock to a time and freezes it still has the critters right', () => {
  const s = stage();
  const critters = createCritters(s.world, { spots: SPOTS, birds: BIRDS });
  const restY = pointOf(critters, 'frog').y;
  s.world.clock.step(7.3); // a seek: the clock goes there, with no frames on the way
  const flying = critters.scare([0, 0, 0]);
  const hop = critters.react('frog');
  s.world.clock.step(0.55);
  s.world.effects.update(0); // the frames of a frozen clock: dt is 0, the clock is where it is
  assert.ok(pointOf(critters, 'frog').y - restY > 0.1, 'the frog is in the air');
  assert.ok(pointOf(critters, flying[0]).y > 1, 'and a bird is up');
  s.world.clock.step(0.6);
  s.world.effects.update(0);
  assert.equal(hop.done, true);
  assert.ok(Math.abs(pointOf(critters, 'frog').y - restY) < 1e-6);
});

test('birds within 6 m of the scare point fly up', () => {
  const s = stage();
  const critters = createCritters(s.world, { birds: BIRDS });
  const scared = critters.scare([0, 0, 0]);
  assert.deepEqual(scared, ['bird-1', 'bird-2', 'bird-3'], 'the three within 6 m');
  const before = Object.fromEntries(BIRDS.map(b => [b.name, pointOf(critters, b.name).clone()]));
  s.run(1);
  for (const bird of BIRDS) {
    const now = pointOf(critters, bird.name);
    if (scared.includes(bird.name)) {
      assert.ok(now.y - before[bird.name].y > 1, `${bird.name} is ${(now.y - before[bird.name].y).toFixed(2)} m up`);
      assert.ok(Math.hypot(now.x - before[bird.name].x, now.z - before[bird.name].z) > 0.5, `${bird.name} is away too`);
    } else {
      assert.ok(now.equals(before[bird.name]), `${bird.name} was out of reach and sits still`);
    }
  }
  // away from the point, not toward it
  for (const name of scared) {
    const b = pointOf(critters, name);
    assert.ok(Math.hypot(b.x, b.z) > Math.hypot(before[name].x, before[name].z) - 0.01, `${name} flies away from where it was scared`);
  }
  // they are gone, over the trees, within a few seconds, and they stay gone
  s.run(4);
  const mesh = critters.group.getObjectByName('Birds');
  assert.ok(mesh.isInstancedMesh);
  const matrix = new THREE.Matrix4();
  scared.forEach(name => {
    mesh.getMatrixAt(BIRDS.findIndex(b => b.name === name), matrix);
    assert.equal(matrix.getMaxScaleOnAxis(), 0, `${name} is out of the picture`);
  });
  BIRDS.forEach((b, i) => {
    if (scared.includes(b.name)) return;
    mesh.getMatrixAt(i, matrix);
    assert.ok(matrix.getMaxScaleOnAxis() > 0.5, `${b.name} still sits there`);
  });
});

test('scare takes a radius, and a bird already away is not scared twice', () => {
  const s = stage();
  const critters = createCritters(s.world, { birds: BIRDS });
  assert.deepEqual(critters.scare([0, 0, 0], 2), ['bird-1']);
  assert.deepEqual(critters.scare([0, 0, 0], 2), [], 'it is already flying');
  assert.deepEqual(critters.scare([0, 0, 0], 4), ['bird-2']);
  assert.deepEqual(critters.scare([20, 0, 0], 1), ['bird-6']);
  assert.deepEqual(critters.scare([0, 0, 0], 100), ['bird-3', 'bird-4', 'bird-5'], 'the rest, wherever they are');
  s.run(5);
  assert.deepEqual(critters.scare([0, 0, 0], 100), [], 'and the ones that have flown away are not there to scare');
  // any point spec: a vector, an actor's name
  const again = createCritters(s.world, { birds: BIRDS.map(b => ({ ...b, name: `${b.name}-again` })) });
  s.world.actors.set('mosi', { root: new THREE.Group(), centre: out => out.set(2, 0, 0), headPosition: out => out.set(2, 3, 0) });
  assert.deepEqual(again.scare('mosi', 2.5), ['bird-1-again', 'bird-2-again'], 'a point spec the world knows');
  assert.deepEqual(again.scare(new THREE.Vector3(20, 0, 0), 1), ['bird-6-again']);
});

test('a critter faces as it is told, and otherwise the way its name picks', () => {
  const s = stage();
  const critters = createCritters(s.world, {
    spots: [{ name: 'frog', kind: 'frog', position: [0, 0, 0], heading: 90 }, { name: 'snail', kind: 'snail', position: [1, 0, 0] }],
    birds: [{ name: 'bird-1', position: [2, 0, 0], heading: 180 }, { name: 'bird-2', position: [3, 0, 0] }],
  });
  const facing = name => new THREE.Vector3(1, 0, 0).applyQuaternion(critters.group.getObjectByName(`Critter ${name}`).quaternion);
  assert.ok(facing('frog').distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-9, 'heading 90 faces +Z');
  const again = createCritters(stage().world, { spots: [{ name: 'snail', kind: 'snail', position: [9, 0, 9] }] });
  assert.ok(new THREE.Vector3(1, 0, 0).applyQuaternion(again.group.getObjectByName('Critter snail').quaternion).distanceTo(facing('snail')) < 1e-9, 'a name always faces the same way');
  const matrix = new THREE.Matrix4();
  critters.group.getObjectByName('Birds').getMatrixAt(0, matrix);
  const turned = new THREE.Vector3(1, 0, 0).applyMatrix4(new THREE.Matrix4().extractRotation(matrix));
  assert.ok(turned.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-6, 'a bird of heading 180 faces -X');
});

test('a bird is a tap target, and its tap sends it up', () => {
  const s = stage();
  const critters = createCritters(s.world, { birds: BIRDS });
  const handle = critters.react('bird-4');
  assert.equal(handle.done, false);
  assert.equal(critters.react('bird-4'), handle, 'one flight for the taps of the moment');
  s.run(1);
  assert.ok(pointOf(critters, 'bird-4').y > 1);
  assert.ok(pointOf(critters, 'bird-5').y < 0.2, 'the others sit');
  s.run(4);
  assert.equal(handle.done, true, 'the flight is over when it is out of sight');
  assert.equal(critters.react('bird-4').done, true, 'a bird that has flown away has nothing to do: its tap is a finished handle');
  assert.equal(critters.react('bird-4'), DONE);
});

test('a walking actor sends up the birds within 6 m of it, and a standing one does not', () => {
  const s = stage();
  const reacted = [];
  const critters = createCritters(s.world, { birds: BIRDS, onReact: (name, kind) => reacted.push([name, kind]) });
  const mosi = { walking: false, root: new THREE.Group() };
  mosi.root.position.set(0, 0, 0);
  s.world.actors.set('mosi', mosi);
  s.run(1);
  assert.deepEqual(reacted, [], 'he stands among them and they do not mind');
  assert.ok(critters.targets.every(t => t.point.y < 0.2));
  mosi.walking = true;
  s.frame();
  assert.deepEqual(reacted, [['bird-1', 'bird'], ['bird-2', 'bird'], ['bird-3', 'bird']], 'he steps and the three within 6 m go up, once each');
  s.run(1);
  assert.ok(pointOf(critters, 'bird-1').y > 1);
  assert.ok(pointOf(critters, 'bird-5').y < 0.2, 'those 9 m off sit on');
  mosi.root.position.set(8, 0, 0); // he walks on toward them
  s.frame();
  assert.deepEqual(reacted.slice(3), [['bird-4', 'bird'], ['bird-5', 'bird']], 'and as he gets near the next ones go up');
  s.run(1);
  assert.equal(reacted.length, 5);
  assert.ok(pointOf(critters, 'bird-6').y < 0.2, 'the one 12 m from him stays');
});

test('critters need no actors: world.actors may be empty or missing', () => {
  const s = stage();
  delete s.world.actors;
  const critters = createCritters(s.world, { birds: BIRDS, spots: SPOTS });
  s.run(1);
  assert.ok(critters.targets.every(t => Number.isFinite(t.point.y)));
});

test('onReact hears every reaction once, whatever started it', () => {
  const s = stage();
  const reacted = [];
  const critters = createCritters(s.world, { spots: SPOTS, birds: BIRDS, onReact: (name, kind) => reacted.push(`${name}:${kind}`) });
  critters.react('frog');
  critters.react('frog');
  critters.react('beetle');
  critters.scare([0, 0, 0], 2);
  critters.react('bird-1'); // already flying
  critters.react('bird-6');
  assert.deepEqual(reacted, ['frog:frog', 'beetle:beetle', 'bird-1:bird', 'bird-6:bird']);
});

test('a sound that fails does not stop a critter', t => {
  const s = stage();
  const errors = t.mock.method(console, 'error', () => {});
  const critters = createCritters(s.world, { spots: SPOTS, birds: BIRDS, onReact: () => { throw new Error('no sound'); } });
  const hop = critters.react('frog');
  assert.equal(hop.done, false);
  assert.deepEqual(critters.scare([0, 0, 0]), ['bird-1', 'bird-2', 'bird-3'], 'every bird in reach goes up all the same');
  s.run(1.1);
  assert.equal(hop.done, true);
  assert.ok(pointOf(critters, 'bird-1').y > 1);
  assert.equal(errors.mock.callCount(), 4, 'it is said, once for each');
});

test('critters run on the game clock only, and a reaction is the same however the frames fall', () => {
  const run = (dt, pause) => {
    const s = stage();
    const critters = createCritters(s.world, { spots: SPOTS, birds: BIRDS });
    s.run(1);
    critters.react('frog');
    critters.react('snail');
    critters.react('beetle');
    critters.scare([0, 0, 0]);
    if (pause) {
      s.world.clock.setPaused(true);
      s.run(0.4);
      const held = critters.targets.map(t => t.point.clone());
      for (let i = 0; i < 60; i++) s.world.effects.update(s.world.clock.tick(1 / 30)); // two paused seconds
      assert.ok(critters.targets.every((t, i) => t.point.equals(held[i])), 'a paused game holds every critter where it is');
      s.world.clock.setPaused(false);
      s.run(0.6);
    } else {
      step(s.frame, 1, dt);
    }
    return critters.targets.map(t => t.point.toArray());
  };
  const a = run(1 / 30);
  const b = run(1 / 60);
  const c = run(1 / 24);
  const d = run(1 / 30, true);
  for (const other of [b, c, d]) other.forEach((p, i) => p.forEach((v, k) => assert.ok(Math.abs(v - a[i][k]) < 1e-6, `target ${i} at a second in is where it was (${v} against ${a[i][k]})`)));
});

test('every critter model stands on its feet: not floating above the ground it is put on, not sunk in it', () => {
  for (const kind of [...KINDS, 'bird']) {
    const { geometry, pivot } = createModel(kind);
    const low = lowest({ geometry, matrixWorld: new THREE.Matrix4() });
    assert.ok(Math.abs(low + pivot) < 0.004, `${kind}: its lowest point is ${low.toFixed(3)} m, its middle ${pivot} m over the ground`);
    geometry.dispose();
  }
});

test('a bird\'s wings are tagged for the shader and, folded, lie along its sides', () => {
  const { geometry } = createModel('bird');
  const position = geometry.attributes.position;
  const tag = geometry.attributes.aWing;
  assert.ok(tag, 'a tag for each vertex');
  assert.equal(tag.count, position.count);
  const wingVertices = [];
  for (let i = 0; i < tag.count; i++) {
    assert.ok([-1, 0, 1].includes(tag.getX(i)));
    if (tag.getX(i) !== 0) {
      wingVertices.push(i);
      assert.equal(Math.sign(position.getZ(i)), tag.getX(i), 'a wing is tagged by the side it is on');
    }
  }
  assert.equal(wingVertices.length, 36, 'two wings of six triangles');
  assert.equal(wingVertices.filter(i => tag.getX(i) > 0).length, 18);
  // what the shader does at rest, on the numbers: the wing about its shoulder, turned by BIRD.fold, moved down and out
  const turn = new THREE.Matrix4().makeRotationZ(BIRD.fold.rotation[2]).multiply(new THREE.Matrix4().makeRotationX(BIRD.fold.rotation[0]));
  const [sx, sy, sz] = BIRD.shoulder;
  const folded = wingVertices.map(i => {
    const side = tag.getX(i);
    const rel = new THREE.Vector3(position.getX(i) - sx, position.getY(i) - sy, (position.getZ(i) - sz * side) * side).applyMatrix4(turn).add(new THREE.Vector3(...BIRD.fold.offset));
    return new THREE.Vector3(sx + rel.x, sy + rel.y, (sz * side) + rel.z * side);
  });
  const spread = new THREE.Box3().setFromPoints(wingVertices.map(i => new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i))));
  const at = new THREE.Box3().setFromPoints(folded);
  assert.ok(spread.max.z - spread.min.z > 0.25, 'in flight the wings are out to the sides');
  assert.ok(at.max.z - at.min.z < 0.1, `folded they are ${(at.max.z - at.min.z).toFixed(3)} m across: at its sides`);
  assert.ok(at.min.y > -0.002, 'and not under the ground');
  assert.ok(at.max.y < 0.1 && at.max.x < 0.03 && at.min.x > -0.14, 'lying back along the body, not over its head');
  // the body of the bird is not tagged: it stays as it is
  const body = new THREE.Box3();
  for (let i = 0; i < tag.count; i++) if (tag.getX(i) === 0) body.expandByPoint(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));
  assert.ok(Math.abs(at.max.z) <= body.max.z + 0.006 && Math.abs(at.max.z) >= body.max.z - 0.012, 'the folded wing sits at the width of the body');
});

test('a critter has at most 400 triangles and is one draw call; the birds are one instanced mesh', () => {
  for (const kind of [...KINDS, 'bird']) {
    const { geometry, triangles } = createModel(kind);
    assert.equal(geometry.attributes.position.count / 3, triangles);
    assert.ok(triangles <= 400 && triangles >= 100, `${kind}: ${triangles} triangles`);
    assert.equal(geometry.index, null);
    assert.ok(geometry.attributes.color && geometry.attributes.normal, `${kind}: vertex colours and normals, no texture`);
    geometry.dispose();
  }
  const s = stage();
  const critters = createCritters(s.world, { spots: SPOTS, birds: BIRDS });
  const meshes = [];
  critters.group.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, SPOTS.length + 1, 'a mesh each, and one for all the birds');
  for (const mesh of meshes) {
    const triangles = mesh.geometry.attributes.position.count / 3;
    assert.ok(triangles <= 400, `${mesh.name}: ${triangles} triangles`);
    assert.equal(mesh.material.map ?? null, null, 'no texture');
  }
  const birds = critters.group.getObjectByName('Birds');
  assert.ok(birds.isInstancedMesh);
  assert.equal(birds.count, BIRDS.length, 'a bird for each instance');
  assert.equal(meshes.filter(m => m.isInstancedMesh).length, 1);
  // the ones on the ground have a shadow on it (it is what sets a frog on a path); the birds, which fly, do not cast one
  for (const mesh of meshes) {
    assert.equal(mesh.receiveShadow, true, `${mesh.name} takes the shade`);
    assert.equal(mesh.castShadow, !mesh.isInstancedMesh, `${mesh.name} ${mesh.isInstancedMesh ? 'casts no shadow' : 'casts its shadow'}`);
  }
});

test('a critter\'s tap target is wide enough to hit and sits on it', () => {
  const s = stage();
  const critters = createCritters(s.world, { spots: SPOTS, birds: BIRDS });
  assert.deepEqual(critters.targets.map(t => t.name), [...SPOTS, ...BIRDS].map(c => c.name));
  for (const target of critters.targets) {
    assert.ok(target.radius >= 0.15 && target.radius <= 0.6, `${target.name}: ${target.radius} m`);
    assert.ok(target.point.isVector3);
  }
  const frog = critters.group.getObjectByName('Critter frog');
  assert.ok(pointOf(critters, 'frog').y > frog.position.y + 0.02 && pointOf(critters, 'frog').y < frog.position.y + 0.15, 'about the middle of the frog');
});

test('a finger aimed at a critter picks it, hopping or not, and a finger aimed at a butterfly picks that butterfly', () => {
  // as pointer.js picks: a ray from the camera, the targets' points where they are now, and a target at least 44 px wide (0.02 rad at 800 px)
  const pick = (eye, targets, at, world) => {
    const ray = new THREE.Ray(eye.clone(), at.clone().sub(eye).normalize());
    const centred = targets.map(t => ({ name: t.name, centre: world.resolvePoint(t.point, new THREE.Vector3()), radius: t.radius, enabled: true }));
    return pickTarget(ray, centred, { minAngle: 0.02 });
  };
  const s = stage();
  const behind = BIRDS.map(b => ({ ...b, position: [b.position[0], 0, -2.5] })); // in the bushes behind the three on the path
  const critters = createCritters(s.world, { spots: SPOTS, birds: behind });
  const child = new THREE.Vector3(1.5, 1.1, 3.5); // a child's eye height, 3.5 m off
  for (const target of critters.targets) assert.equal(pick(child, critters.targets, target.point, s.world), target.name, `a finger on ${target.name}`);
  critters.react('frog');
  critters.react('bird-3');
  s.run(0.55);
  for (const name of ['frog', 'bird-3']) assert.equal(pick(child, critters.targets, pointOf(critters, name), s.world), name, `a finger on ${name} in the air`);
  const stagedButterflies = butterflyStage();
  const eye = new THREE.Vector3(2, 1.3, 9); // a child at the edge of the clearing (from where two butterflies do not stand in each other's way)
  stagedButterflies.run(3);
  for (const target of stagedButterflies.targets) assert.equal(pick(eye, stagedButterflies.targets, target.point, stagedButterflies.world), target.name, `a finger on ${target.name}`);
});

test('dispose takes the critters out of the scene, frees what they made and stops their effect', () => {
  const s = stage();
  const critters = createCritters(s.world, { spots: SPOTS, birds: BIRDS });
  assert.equal(s.world.effects.size, 1, 'the critters registered themselves on the game clock');
  assert.equal(s.world.scene.children.length, 1);
  const freed = [];
  critters.group.traverse(o => {
    if (!o.isMesh) return;
    for (const resource of [o.geometry, o.material]) resource.addEventListener('dispose', () => freed.push(resource));
  });
  const reacting = critters.react('frog');
  const flying = critters.react('bird-1');
  s.run(0.3);
  critters.dispose();
  assert.equal(s.world.scene.children.length, 0);
  assert.equal(reacting.done && reacting.cancelled, true, 'a script waiting on a reaction goes on');
  assert.equal(flying.done && flying.cancelled, true);
  assert.ok(freed.length >= SPOTS.length + 2, `${freed.length} resources freed`);
  s.frame();
  assert.equal(s.world.effects.size, 0, 'the effect stopped');
  // and it stays harmless
  const count = freed.length;
  critters.dispose();
  critters.update(1 / 30, 9);
  assert.deepEqual(critters.scare([0, 0, 0]), []);
  assert.equal(critters.react('frog').done, true);
  assert.equal(freed.length, count, 'nothing freed twice');
});

test('a reaction can be cut short: the critter is at rest at once', () => {
  const s = stage();
  const critters = createCritters(s.world, { spots: SPOTS, birds: BIRDS });
  const handle = critters.react('beetle');
  s.run(0.7);
  assert.ok(upOf(meshOf(critters, 'beetle')).y < 0.5, 'it is on its way over');
  handle.cancel();
  assert.equal(handle.done, true);
  assert.ok(upOf(meshOf(critters, 'beetle')).y > 0.99, 'a beetle is never left on its back');
  const hop = critters.react('frog');
  s.run(0.3);
  hop.cancel();
  s.frame();
  const frog = critters.group.getObjectByName('Critter frog');
  assert.ok(Math.abs(pointOf(critters, 'frog').y - frog.position.y - 0.06) < 0.02, 'a frog is never left in the air');
  const fly = critters.react('bird-2');
  s.run(0.5);
  fly.cancel();
  s.run(0.1);
  assert.equal(fly.done, true);
  const matrix = new THREE.Matrix4();
  critters.group.getObjectByName('Birds').getMatrixAt(1, matrix);
  assert.equal(matrix.getMaxScaleOnAxis(), 0, 'a bird that is cut short has flown off');
});

test('the birds\' wings fold at rest and beat in flight', t => {
  const s = stage();
  const critters = createCritters(s.world, { birds: BIRDS.slice(0, 2) });
  const birds = critters.group.getObjectByName('Birds');
  const flight = birds.geometry.getAttribute('aFlight');
  assert.ok(flight && flight.isInstancedBufferAttribute, 'the beat of each bird is an instance attribute');
  assert.equal(flight.count, 2);
  assert.equal(flight.getY(0), 0, 'perched: wings folded');
  critters.react('bird-1');
  const beats = [];
  for (let i = 0; i < 30; i++) { s.frame(); beats.push(flight.getX(0)); }
  assert.equal(flight.getY(0), 1, 'in flight: wings out');
  assert.ok(Math.max(...beats) - Math.min(...beats) > 1, 'and beating');
  assert.equal(flight.getY(1), 0, 'the other sits');
  // the shader the birds are drawn with reads that attribute; it patches three's standard shader
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  birds.material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /attribute vec2 aFlight;/);
  assert.match(shader.vertexShader, /attribute float aWing;/);
  assert.equal(typeof birds.material.customProgramCacheKey(), 'string');
  const warn = t.mock.method(console, 'warn', () => {});
  birds.material.onBeforeCompile({ vertexShader: 'void main() {}', fragmentShader: '', uniforms: {} });
  assert.equal(warn.mock.callCount(), 1, 'if three\'s shader changes so the anchors are gone, it says so rather than draw broken birds');
});

// ---- the Fen's animals ----------------------------------------------------------------------------

// The Fen's own critters (chapter 2), all of them animals that lived alongside the dinosaurs: a dragonfly, a diving beetle
// (brunnklukka), a newt-like salamander, a turtle, an early bird (fornfugl, feathered, with a long tail), a fish and a water strider.
const FEN_KINDS = ['dragonfly', 'waterBeetle', 'salamander', 'turtle', 'earlyBird', 'fish', 'waterStrider'];

test('every fen critter has a model under 400 triangles and a reaction', () => {
  for (const kind of FEN_KINDS) {
    assert.ok(KINDS.includes(kind), `${kind} is a kind a spot can be`);
    const { geometry, triangles } = createModel(kind);
    assert.equal(geometry.attributes.position.count / 3, triangles);
    assert.ok(triangles <= 400 && triangles >= 100, `${kind}: ${triangles} triangles`);
    assert.ok(geometry.attributes.color && geometry.attributes.normal, `${kind}: vertex colours and normals, no texture`);
    geometry.dispose();
  }
  // the dragonfly's two pairs of wings and the early bird's two wings are tagged for the wing shader the birds have
  for (const [kind, wings] of [['dragonfly', 4], ['earlyBird', 2]]) {
    const { geometry } = createModel(kind);
    const tag = geometry.attributes.aWing;
    assert.ok(tag, `${kind}'s wings are tagged`);
    const pos = geometry.attributes.position;
    let left = 0, right = 0;
    for (let i = 0; i < tag.count; i++) {
      if (tag.getX(i) > 0) { right++; assert.ok(pos.getZ(i) > -0.001, `${kind}: a right wing is on the right`); }
      if (tag.getX(i) < 0) { left++; assert.ok(pos.getZ(i) < 0.001, `${kind}: a left wing is on the left`); }
    }
    assert.ok(left > 0 && left === right, `${kind}: as much wing on each side`);
    assert.equal(createModel(kind).wings, wings, `${kind} has ${wings} wings`);
  }
  const s = stage();
  // the fish and the strider and the beetle on the water, the rest on the ground; whatever they touch on the water rings it
  const rings = [];
  const spots = FEN_KINDS.map((kind, i) => ({ name: kind, kind, position: [i * 2, 0, 0], heading: 0 }));
  const critters = createCritters(s.world, { spots, ripple: (point, strength) => rings.push({ x: point.x, z: point.z, strength }) });
  const meshes = [];
  critters.group.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, FEN_KINDS.length, 'one mesh, one draw call, each');
  // its own idle: each lives a little without a tap (the old critters sit still until tapped)
  const pose = name => {
    const mesh = meshOf(critters, name);
    mesh.updateWorldMatrix(true, false);
    const flight = mesh.material.userData?.flight?.value;
    return [...mesh.matrixWorld.elements, ...(mesh.morphTargetInfluences ?? []), ...(flight ? [flight.x, flight.y] : [])];
  };
  const differ = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 1e-4);
  const before = Object.fromEntries(FEN_KINDS.map(kind => [kind, pose(kind)]));
  const still = Object.fromEntries(FEN_KINDS.map(kind => [kind, false]));
  for (let t = 0; t < 6; t += 1 / 30) {
    s.frame();
    for (const kind of FEN_KINDS) if (differ(pose(kind), before[kind])) still[kind] = true;
  }
  for (const kind of FEN_KINDS) assert.ok(still[kind], `${kind} lives a little by itself`);
  // its reaction: a tap starts one, a second joins it, and it ends where it began
  const home = name => critters.group.getObjectByName(`Critter ${name}`).position.clone();
  for (const kind of FEN_KINDS) {
    const from = home(kind);
    const handle = critters.react(kind);
    assert.equal(handle.done, false, `${kind}: a tap starts a reaction`);
    assert.equal(critters.react(kind), handle, `${kind}: a second tap joins it`);
    let far = 0, high = -Infinity;
    for (let t = 0; t < 10 && !handle.done; t += 1 / 30) {
      s.frame();
      const point = pointOf(critters, kind);
      far = Math.max(far, Math.hypot(point.x - from.x, point.z - from.z));
      high = Math.max(high, point.y);
    }
    assert.equal(handle.done, true, `${kind}: the reaction ends`);
    s.run(0.2);
    assert.ok(home(kind).distanceTo(from) < 0.02, `${kind} is back where it was`);
    if (kind === 'salamander') assert.ok(far >= 0.3, `the salamander crawls two body lengths: ${far.toFixed(2)} m`);
    if (kind === 'earlyBird') assert.ok(high >= 1.5, `the early bird flies up: ${high.toFixed(2)} m`);
    if (kind === 'fish') assert.ok(high >= 0.25, `the fish jumps out of the water: ${high.toFixed(2)} m`);
    if (kind === 'dragonfly') assert.ok(far >= 0.4, `the dragonfly darts off: ${far.toFixed(2)} m`);
  }
  // the turtle draws its head in, and out again
  const turtle = meshOf(critters, 'turtle');
  const hiding = critters.react('turtle');
  const hide = [];
  for (let t = 0; t < 6 && !hiding.done; t += 1 / 30) { s.frame(); hide.push(influence(turtle, 'hide')); }
  assert.ok(Math.max(...hide) > 0.95 && hide.at(-1) < 0.05, 'the turtle pulls its head in and puts it out again');
  // the fish's jump rings the water where it goes in and comes out
  assert.ok(rings.some(r => Math.hypot(r.x - home('fish').x, r.z - home('fish').z) < 1), 'the fish rings the water');
  critters.dispose();
});

test('createCritters says what is wrong with what it is given, and leaves nothing behind', () => {
  const s = stage();
  const spot = { name: 'frog', kind: 'frog', position: [0, 0, 0] };
  const bad = [
    [{ spots: [{ ...spot, kind: 'dragon' }] }, /kind/],
    [{ spots: [{ ...spot, name: '' }] }, /name/],
    [{ spots: [{ ...spot, position: [0, 0] }] }, /position/],
    [{ spots: [{ ...spot, position: [0, NaN, 0] }] }, /position/],
    [{ spots: [spot, { ...spot, kind: 'snail' }] }, /frog/],
    [{ spots: [spot], birds: [{ name: 'frog', position: [1, 0, 0] }] }, /frog/],
    [{ birds: [{ name: 'bird', position: 'here' }] }, /position/],
    [{ spots: [{ ...spot, heading: 'north' }] }, /heading/],
    [{ birds: [{ name: 'bird', position: [1, 0, 1], heading: NaN }] }, /heading/],
    [{ spots: [spot], onReact: 'a sound' }, /onReact/],
    [{ spots: 'frog' }, /spots/],
  ];
  for (const [options, message] of bad) assert.throws(() => createCritters(s.world, options), message);
  assert.throws(() => createCritters({ scene: s.world.scene, effects: s.world.effects }, { spots: [spot] }), /clock/);
  assert.equal(s.world.scene.children.length, 0, 'a refused set leaves nothing in the scene');
  assert.equal(s.world.effects.size, 0);
  const none = createCritters(s.world, {});
  assert.deepEqual(none.targets, []);
  none.dispose();
  assert.throws(() => createCritters(s.world, { spots: [spot] }).react('toad'), /toad/);
});

test('critters can be driven by hand on a world with no effects', () => {
  const world = { scene: new THREE.Scene(), heightAt: () => 0 };
  const critters = createCritters(world, { spots: [SPOTS[0]], birds: BIRDS.slice(0, 1) });
  critters.update(0, 1); // with no clock the time is the one update() last had
  const handle = critters.react('frog');
  const y = [];
  for (let i = 0; i < 40; i++) { critters.update(1 / 30, 1 + (i + 1) / 30); y.push(pointOf(critters, 'frog').y); }
  assert.equal(peaks(y, 0.15), 1);
  assert.equal(handle.done, true);
  critters.dispose();
});
