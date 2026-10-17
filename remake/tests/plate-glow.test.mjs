import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createActor } from '../engine/actor.js';
import { prepareCharacter, releaseCharacter, updateCharacterLods, whenReady } from '../engine/character-lod.js';
import { createEffects } from '../engine/effects.js';
import { Handle } from '../engine/handle.js';
import { createScheduler } from '../engine/scene/scheduler.js';
import { MAX_ROWS, addPlateGlow } from '../engine/plate-glow.js';
import { emptyWorld, loadCharacter, skinnedMeshOf } from './characters.mjs';

// Kambeðla's plates lighting up row by row (engine/plate-glow.js). The bake marks every plate vertex
// with its row, counted from the head, in the glTF attribute _PLATEROW (three's loader names it
// `_platerow`). The glow patches a copy of her skin's material, so these tests read what the patch
// hands the GPU: the shader source and the uniforms it adds, as three's onBeforeCompile gives them.

const gltfPromise = loadCharacter('kambedla');

// A fresh Kambeðla. Actors made from one parsed file share its materials.
async function stage() {
  const actor = await createActor(emptyWorld(), { name: 'kambedla', gltf: await gltfPromise });
  return { actor, skin: skinnedMeshOf(actor.model) };
}

// A stand-in for a model: one mesh whose vertices carry plate rows 0 to `top`.
function plated(top, material = new THREE.MeshStandardMaterial()) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('_platerow', new THREE.BufferAttribute(Float32Array.from({ length: count }, (_, i) => i % (top + 1)), 1));
  const model = new THREE.Group();
  model.add(new THREE.Mesh(geometry, material));
  return { name: 'stand-in', model };
}
const skinOf = actor => actor.model.children[0];

// What three hands a material's onBeforeCompile (the standard shader's source, its includes not yet
// resolved), and what the material makes of it.
function compile(material) {
  const { vertexShader, fragmentShader, uniforms } = THREE.ShaderLib.standard;
  const shader = { vertexShader, fragmentShader, uniforms: THREE.UniformsUtils.clone(uniforms) };
  material.onBeforeCompile(shader, null);
  return shader;
}
const plain = () => compile(new THREE.MeshStandardMaterial());
// The levels the GPU gets, one per row.
const levelsOf = material => compile(material).uniforms.uRowLevel.value;

// The lines `after` has that `before` has not.
function addedLines(before, after) {
  const have = new Map();
  for (const line of before.split('\n')) have.set(line, (have.get(line) ?? 0) + 1);
  return after.split('\n').filter(line => {
    const n = have.get(line) ?? 0;
    if (n) have.set(line, n - 1);
    return !n;
  });
}

// The `if ( vPlateRow > 0.5 ) { ... }` statement of a fragment shader: where it starts and ends.
function plateGate(source) {
  const start = source.search(/if\s*\(\s*vPlateRow\s*>\s*0\.5\s*\)/);
  assert.ok(start >= 0, 'the fragment shader gates on the plate row');
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return { start, end: i + 1, block: source.slice(start, i + 1) };
  }
  throw new Error('the plate gate is never closed');
}

test('counts rows from the _platerow attribute', async () => {
  const { actor } = await stage();
  assert.equal(addPlateGlow(actor).rows, 3, 'Kambeðla has three rows of plates');
  // Any model carrying the attribute works, up to MAX_ROWS rows.
  assert.equal(MAX_ROWS, 8);
  for (const top of [1, 2, 5, MAX_ROWS]) assert.equal(addPlateGlow(plated(top)).rows, top, `${top} rows`);
  assert.throws(() => addPlateGlow(plated(MAX_ROWS + 1)), /9 plate rows/);
  // A model with no plates cannot be lit.
  assert.throws(() => addPlateGlow(plated(0)), /no plates/);
  const bare = new THREE.Group();
  bare.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  assert.throws(() => addPlateGlow({ name: 'bare', model: bare }), /no plates/);
});

test('setRow eases to its level over the duration', async () => {
  const { actor, skin } = await stage();
  const glow = addPlateGlow(actor);
  const levels = levelsOf(skin.material);
  assert.deepEqual([...levels], new Array(MAX_ROWS).fill(0), 'every row starts unlit');
  const handle = glow.setRow(1, 1); // 0.8 s by default
  assert.ok(handle instanceof Handle);
  assert.equal(handle.done, false);
  glow.update(0.4);
  assert.ok(Math.abs(levels[1] - 0.5) < 1e-6, `half way through it is ${levels[1]}`);
  glow.update(0.39);
  assert.ok(levels[1] > 0.99 && levels[1] < 1, `just short of the end it is ${levels[1]}`);
  assert.equal(handle.done, false);
  glow.update(0.02);
  assert.equal(levels[1], 1);
  assert.equal(handle.done, true);
  assert.equal(handle.cancelled, false);
  assert.deepEqual([levels[0], levels[2]], [0, 0], 'the other rows stayed unlit');
  // Down again, over a duration of its own.
  const down = glow.setRow(1, 0.25, { duration: 2 });
  glow.update(1);
  assert.ok(Math.abs(levels[1] - 0.625) < 1e-6, `half way down it is ${levels[1]}`);
  glow.update(1);
  assert.equal(levels[1], 0.25);
  assert.equal(down.done, true);
});

test('a level moves smoothly, never backward, and the handle finishes with the last frame of it', async () => {
  const { actor, skin } = await stage();
  const glow = addPlateGlow(actor);
  const levels = levelsOf(skin.material);
  const handle = glow.setRow(0, 1, { duration: 1 });
  let last = 0;
  let steps = 0;
  for (let t = 0; t < 1.5; t += 1 / 60) {
    glow.update(1 / 60);
    steps++;
    assert.ok(levels[0] >= last, `the level went back from ${last} to ${levels[0]}`);
    assert.ok(levels[0] - last < 0.06, `the level jumped by ${levels[0] - last} in a frame`);
    last = levels[0];
    if (t + 1 / 60 < 1 - 1e-9) assert.equal(handle.done, false, `done early, at ${(t + 1 / 60).toFixed(3)} s`);
    else if (t > 1 + 1 / 60) assert.equal(handle.done, true);
  }
  assert.equal(levels[0], 1);
  assert.ok(steps > 60);
});

test('setAll eases every row together, and a row set on its own leaves the others alone', async () => {
  const { actor, skin } = await stage();
  const glow = addPlateGlow(actor);
  const levels = levelsOf(skin.material);
  const all = glow.setAll(1, { duration: 0.5 });
  glow.update(0.25);
  assert.deepEqual([...levels.slice(0, 3)], [0.5, 0.5, 0.5]);
  assert.equal(levels[3], 0, 'there is no fourth row');
  assert.equal(all.done, false);
  // One row is taken away from the group: it goes its own way and the group finishes without it.
  const own = glow.setRow(1, 0, { duration: 0.5 });
  assert.equal(own.done, false);
  glow.update(0.25);
  assert.equal(levels[0], 1);
  assert.equal(levels[2], 1);
  assert.ok(Math.abs(levels[1] - 0.25) < 1e-6, `the row set on its own is at ${levels[1]}`);
  assert.equal(all.done, true, 'the group is done when its own rows are');
  assert.equal(all.cancelled, false);
  assert.equal(own.done, false, 'the row set on its own has its own time to go');
  glow.update(0.25);
  assert.equal(levels[1], 0);
  assert.equal(own.done, true);
  assert.deepEqual([levels[0], levels[2]], [1, 1], 'the others stay lit');
});

test('a new target takes over from where the row is, and cancels the ease it replaces', async () => {
  const { actor, skin } = await stage();
  const glow = addPlateGlow(actor);
  const levels = levelsOf(skin.material);
  const up = glow.setRow(0, 1, { duration: 0.8 });
  glow.update(0.4);
  const down = glow.setRow(0, 0, { duration: 0.4 });
  assert.equal(up.done, true);
  assert.equal(up.cancelled, true);
  assert.ok(Math.abs(levels[0] - 0.5) < 1e-6, 'it carries on from the level it had');
  glow.update(0.2);
  assert.ok(Math.abs(levels[0] - 0.25) < 1e-6, `half way down it is ${levels[0]}`);
  glow.update(0.2);
  assert.equal(levels[0], 0);
  assert.equal(down.done, true);
  assert.equal(down.cancelled, false);
});

test('cancelling a handle stops the row where it is', async () => {
  const { actor, skin } = await stage();
  const glow = addPlateGlow(actor);
  const levels = levelsOf(skin.material);
  const handle = glow.setRow(2, 1);
  glow.update(0.4);
  handle.cancel();
  assert.equal(handle.done, true);
  glow.update(1);
  assert.ok(Math.abs(levels[2] - 0.5) < 1e-6, `it stayed at ${levels[2]}`);
});

test('a zero duration, or a row already at its level, is done at once', async () => {
  const { actor, skin } = await stage();
  const glow = addPlateGlow(actor);
  const levels = levelsOf(skin.material);
  const now = glow.setRow(0, 1, { duration: 0 });
  assert.equal(now.done, true);
  assert.equal(levels[0], 1, 'lit before any frame');
  assert.equal(glow.setRow(0, 1).done, true, 'nothing to ease');
  glow.setRow(1, 0.3, { duration: 0 });
  assert.equal(glow.setRow(1, 0.3).done, true, 'the same fraction again is nothing to ease either');
  glow.setRow(1, 0, { duration: 0 });
  assert.equal(glow.setAll(1).done, false, 'two rows are still to go');
  glow.update(0.8);
  assert.equal(glow.setAll(1).done, true);
  assert.deepEqual([...levels.slice(0, 3)], [1, 1, 1]);
  // A level beyond 0 to 1 is held to it.
  glow.setAll(7, { duration: 0 });
  assert.deepEqual([...levels.slice(0, 3)], [1, 1, 1]);
  glow.setAll(-2, { duration: 0 });
  assert.deepEqual([...levels.slice(0, 3)], [0, 0, 0]);
});

test('time that does not pass moves nothing', async () => {
  const { actor, skin } = await stage();
  const glow = addPlateGlow(actor);
  const levels = levelsOf(skin.material);
  const handle = glow.setRow(0, 1);
  for (const dt of [0, -1, NaN, undefined]) glow.update(dt);
  assert.equal(levels[0], 0);
  assert.equal(handle.done, false);
  glow.update(0.8);
  assert.equal(levels[0], 1);
});

test('the glow asks for rows and levels that exist', async () => {
  const { actor } = await stage();
  const glow = addPlateGlow(actor);
  for (const row of [-1, 3, 0.5, NaN, '1', undefined]) assert.throws(() => glow.setRow(row, 1), RangeError, `row ${row}`);
  for (const level of [NaN, undefined, '1', Infinity]) assert.throws(() => glow.setRow(0, level), TypeError, `level ${level}`);
  for (const level of [NaN, undefined]) assert.throws(() => glow.setAll(level), TypeError, `setAll level ${level}`);
  for (const duration of [-1, NaN, '1']) assert.throws(() => glow.setRow(0, 1, { duration }), TypeError, `duration ${duration}`);
  assert.throws(() => addPlateGlow(plated(2), { dull: NaN }), TypeError);
});

test('non-plate vertices are not lit: the patched shader gates on the plate row', async () => {
  const { actor, skin } = await stage();
  addPlateGlow(actor);
  const shader = compile(skin.material);
  const original = plain();
  // Vertex stage: the row goes through to the fragment stage, nothing else changes.
  assert.deepEqual(addedLines(original.vertexShader, shader.vertexShader).map(line => line.trim()).sort(), [
    'attribute float _platerow;',
    'flat varying float vPlateRow;',
    'vPlateRow = _platerow;',
  ]);
  // Fragment stage: whatever touches the colour or the glow sits inside the gate.
  const gate = plateGate(shader.fragmentShader);
  assert.match(gate.block, /diffuseColor\.rgb\s*=/);
  assert.match(gate.block, /totalEmissiveRadiance\s*\+=/);
  const outside = shader.fragmentShader.slice(0, gate.start) + shader.fragmentShader.slice(gate.end);
  for (const line of addedLines(original.fragmentShader, outside)) {
    assert.match(line, /^\s*(uniform |flat varying |\/\/|$)/, `"${line.trim()}" sits outside the plate gate`);
  }
  // The gate comes after the maps have made the colour and before the lights read it.
  const at = chunk => shader.fragmentShader.indexOf(`#include <${chunk}>`);
  assert.ok(at('emissivemap_fragment') < gate.start && gate.start < at('lights_physical_fragment'), 'the gate is between the maps and the lights');
  // And it reaches the plate row's own level, whichever row it is.
  assert.match(gate.block, /uRowLevel\[/);
  // Drivers can be strict about what a shader's source holds.
  for (const source of [shader.vertexShader, shader.fragmentShader]) assert.match(source, /^[\x00-\x7f]*$/, 'the shader source is ASCII');
});

test('unlit plates are dull and grey, a lit row has its own colour back, and nothing else is touched', async () => {
  const { actor, skin } = await stage();
  addPlateGlow(actor);
  const { uniforms, fragmentShader } = compile(skin.material);
  assert.equal(uniforms.uPlateDull.value, 0.85, 'dull by default');
  assert.equal(uniforms.uPlateGlow.value.getHexString(), 'ab85c1', 'lilac by default');
  // Inside the gate: the colour goes toward a grey by `dull` while the row is unlit, and the glow
  // is added by the row's level, so a lit row (1) has no dulling left and all of the glow.
  const { block } = plateGate(fragmentShader);
  assert.match(block, /mix\(\s*diffuseColor\.rgb\s*,[^;]*uPlateDull\s*\*\s*\(\s*1\.0\s*-\s*plateLevel\s*\)\s*\)/);
  assert.match(block, /totalEmissiveRadiance\s*\+=\s*uPlateGlow\s*\*\s*plateLevel/);
  // The grey is darker than the plate's own colour, the same hue-less grey for every plate.
  const grey = block.match(/plateGrey\s*=\s*([\d.]+)\s*\*\s*dot\(/);
  assert.ok(grey && Number(grey[1]) > 0 && Number(grey[1]) < 1, 'a grey darker than the plate is');

  // The options: how dull, and the colour of the glow, which the shader gets in linear light.
  for (const [dull, want] of [[0, 0], [0.3, 0.3], [1, 1], [5, 1], [-1, 0]]) {
    const other = plated(2);
    addPlateGlow(other, { dull });
    assert.equal(compile(skinOf(other).material).uniforms.uPlateDull.value, want, `dull ${dull}`);
  }
  const other = plated(2);
  addPlateGlow(other, { colour: '#5d4370' });
  const { value } = compile(skinOf(other).material).uniforms.uPlateGlow;
  assert.ok(value.equals(new THREE.Color('#5d4370')));
  assert.ok(Math.abs(value.r - 0x5d / 255) > 0.05, 'in linear light, not the hex digits');
});

test('chains an earlier onBeforeCompile and extends the program cache key', () => {
  const material = new THREE.MeshStandardMaterial();
  const calls = [];
  material.onBeforeCompile = shader => {
    calls.push('earlier');
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'float earlier = 1.0;\nvoid main() {');
    shader.uniforms.uEarlier = { value: 1 };
  };
  material.customProgramCacheKey = () => 'earlier-patch';
  const actor = plated(2, material);
  addPlateGlow(actor);
  const patched = skinOf(actor).material;
  const shader = compile(patched);
  assert.deepEqual(calls, ['earlier'], 'the earlier patch runs once, first');
  assert.ok(shader.uniforms.uEarlier && shader.uniforms.uRowLevel, 'both patches add their uniforms');
  const { fragmentShader } = shader;
  assert.ok(fragmentShader.indexOf('float earlier') >= 0 && fragmentShader.indexOf('float earlier') < fragmentShader.indexOf('uRowLevel'), 'the earlier text is kept, ahead of ours');
  assert.equal(material.customProgramCacheKey(), 'earlier-patch', 'the material it was made from is left alone');
  const key = patched.customProgramCacheKey();
  assert.ok(key.startsWith('earlier-patch') && key !== 'earlier-patch', `the key ${key} extends the earlier one`);
});

test('without an earlier cache key, the earlier patch itself tells programs apart', () => {
  const patchedBy = onBeforeCompile => {
    const material = new THREE.MeshStandardMaterial();
    if (onBeforeCompile) material.onBeforeCompile = onBeforeCompile;
    const actor = plated(2, material);
    addPlateGlow(actor);
    return skinOf(actor).material;
  };
  const one = shader => { shader.uniforms.one = { value: 1 }; };
  const two = shader => { shader.uniforms.two = { value: 2 }; };
  const keyOf = material => material.customProgramCacheKey();
  assert.equal(keyOf(patchedBy(one)), keyOf(patchedBy(one)), 'the same patches share a program');
  assert.notEqual(keyOf(patchedBy(one)), keyOf(patchedBy(two)), 'different earlier patches do not');
  assert.notEqual(keyOf(patchedBy(null)), keyOf(patchedBy(one)), 'nor does the glow alone');
  assert.notEqual(keyOf(patchedBy(null)), new THREE.MeshStandardMaterial().customProgramCacheKey(), 'a plain material never takes the glow\'s program');
  // The earlier patch, as it was before, still runs for the copy.
  assert.ok('one' in compile(patchedBy(one)).uniforms);
});

test('each actor gets a copy of the skin material, with the same maps and settings', async () => {
  const gltf = await gltfPromise;
  const a = await createActor(emptyWorld(), { name: 'a', gltf });
  const b = await createActor(emptyWorld(), { name: 'b', gltf });
  const [skinA, skinB] = [a, b].map(actor => skinnedMeshOf(actor.model));
  const shared = skinA.material;
  assert.equal(skinB.material, shared, 'actors made from one file share its material');
  // Give it the maps the real file has in the browser (Node reads it without textures).
  shared.map = new THREE.Texture();
  shared.normalMap = new THREE.Texture();
  try {
    const glowA = addPlateGlow(a);
    assert.notEqual(skinA.material, shared);
    assert.equal(skinB.material, shared, 'the other Kambeðla keeps the shared material');
    assert.equal(compile(shared).fragmentShader, plain().fragmentShader, 'which is not patched');
    for (const property of ['name', 'map', 'normalMap', 'roughness', 'metalness', 'side', 'shadowSide', 'color', 'emissive']) {
      assert.deepEqual(skinA.material[property], shared[property], `the copy keeps its ${property}`);
    }
    assert.equal(skinA.material.map, shared.map, 'the same map, not another texture');
    // Each glow has its own levels, and one program is enough for both.
    const glowB = addPlateGlow(b);
    glowA.setRow(0, 1, { duration: 0 });
    assert.equal(levelsOf(skinA.material)[0], 1);
    assert.equal(levelsOf(skinB.material)[0], 0);
    assert.equal(skinA.material.customProgramCacheKey(), skinB.material.customProgramCacheKey());
    assert.equal(glowB.rows, 3);
  } finally {
    shared.map = null;
    shared.normalMap = null;
  }
});

test('adding the glow again starts over from the skin\'s own material instead of patching twice', async () => {
  const { actor, skin } = await stage();
  const own = skin.material;
  const first = addPlateGlow(actor);
  first.setRow(0, 1, { duration: 0 });
  let freed = false;
  skin.material.addEventListener('dispose', () => { freed = true; });
  const second = addPlateGlow(actor);
  assert.ok(freed, 'the copy the first glow made is let go');
  assert.notEqual(skin.material, own);
  const { vertexShader } = compile(skin.material);
  assert.equal(vertexShader.split('attribute float _platerow;').length - 1, 1, 'the attribute is declared once');
  assert.equal(levelsOf(skin.material)[0], 0, 'the plates are dull again');
  first.setRow(1, 1, { duration: 0 });
  assert.equal(levelsOf(skin.material)[1], 0, 'the first glow no longer reaches the skin');
  second.setRow(1, 1, { duration: 0 });
  assert.equal(levelsOf(skin.material)[1], 1);
  assert.equal(second.rows, 3);
});

test('only the skin is patched: a shadow caster sharing its geometry keeps its own material', () => {
  const { model } = plated(3);
  const skin = model.children[0];
  const casterMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
  const caster = new THREE.Mesh(skin.geometry, casterMaterial);
  skin.add(caster);
  const original = skin.material;
  addPlateGlow({ name: 'stand-in', model });
  assert.equal(caster.material, casterMaterial);
  assert.notEqual(skin.material, original);
  assert.equal(compile(casterMaterial).fragmentShader, plain().fragmentShader);
});

test('a scene script can wait for a row to light, on the game clock', async () => {
  const { actor, skin } = await stage();
  const glow = addPlateGlow(actor);
  const levels = levelsOf(skin.material);
  // The frame as main.js runs it: the scene's scheduler, then the effects.
  const effects = createEffects();
  effects.add(glow);
  const scheduler = createScheduler();
  const marks = [];
  scheduler.run((function* script() {
    yield glow.setRow(0, 1);
    marks.push(['row 1', scheduler.time, levels[0]]);
    yield glow.setAll(1, { duration: 0.4 });
    marks.push(['all', scheduler.time, levels[2]]);
  })());
  const dt = 1 / 30;
  for (let i = 0; i < 90 && !scheduler.idle; i++) {
    scheduler.update(dt);
    effects.update(dt);
  }
  assert.equal(marks.length, 2, 'the script got through both waits');
  assert.equal(marks[0][2], 1, 'row 1 was lit when it went on');
  // The ease ends in the effects of a frame; the scheduler sees it on the next one.
  assert.ok(marks[0][1] >= 0.8 && marks[0][1] <= 0.8 + 3 * dt, `the first wait took ${marks[0][1].toFixed(3)} s`);
  assert.equal(marks[1][2], 1, 'and the rows were all lit when the second wait ended');
  assert.ok(marks[1][1] - marks[0][1] >= 0.4 - 1e-9 && marks[1][1] - marks[0][1] <= 0.4 + 3 * dt);
  assert.equal(effects.size, 1, 'the glow stays in the effects, ready for the next row');
  assert.equal(glow.update(dt), true);
});

test('the plate rows reach every character LOD level, one row to a triangle', async () => {
  const gltf = await gltfPromise;
  const model = gltf.scene.clone(true);
  const root = new THREE.Group();
  root.add(model);
  root.updateMatrixWorld(true);
  await prepareCharacter(model, null);
  await whenReady();
  const mesh = skinnedMeshOf(model);
  const source = gltf.scene.getObjectByName(mesh.name).geometry;
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const centre = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
  const seen = [];
  for (const distance of [6, 40, 400]) {
    camera.position.set(centre.x + distance, centre.y, centre.z);
    camera.lookAt(centre);
    updateCharacterLods(camera, 800);
    const { geometry } = mesh;
    seen.push(geometry.index.count / source.index.count);
    assert.equal(geometry.attributes._platerow, source.attributes._platerow, `the level at ${distance} m shares the rows`);
    // A plate has vertices of its own: a triangle is all of one row, so the edge of a lit plate is a crisp line.
    const rows = geometry.attributes._platerow;
    const index = geometry.index;
    const counts = new Map();
    for (let t = 0; t < index.count; t += 3) {
      const row = rows.getX(index.getX(t));
      assert.ok(row === rows.getX(index.getX(t + 1)) && row === rows.getX(index.getX(t + 2)), `a triangle at ${distance} m is on more than one row`);
      counts.set(row, (counts.get(row) ?? 0) + 1);
    }
    assert.deepEqual([...counts.keys()].sort(), [0, 1, 2, 3]);
  }
  assert.ok(seen[0] === 1 && seen[1] < 0.6 && seen[2] < 0.3, `the levels were ${seen.map(x => x.toFixed(2))} of the triangles`);
  releaseCharacter(model);
});

test('a three whose standard shader has lost an anchor the patch needs says so, instead of leaving the plates grey without a word', () => {
  const told = [];
  const original = console.warn;
  console.warn = (...args) => told.push(args.join(' '));
  try {
    const actor = plated(2);
    addPlateGlow(actor);
    const material = skinOf(actor).material;
    const fine = compile(material);
    assert.equal(told.length, 0, 'the vendored three has every anchor');
    assert.match(fine.fragmentShader, /vPlateRow > 0\.5/);

    // A later three renames the chunk the plates' light goes after.
    const { vertexShader, fragmentShader, uniforms } = THREE.ShaderLib.standard;
    const renamed = { vertexShader, fragmentShader: fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissive_map_fragment>'), uniforms: THREE.UniformsUtils.clone(uniforms) };
    material.onBeforeCompile(renamed, null);
    assert.equal(told.length, 1, 'one warning');
    assert.match(told[0], /plate/i);
    assert.match(told[0], /emissivemap_fragment/, 'naming what is missing');

    const noMain = { vertexShader: vertexShader.replace('void main() {', 'void main(){'), fragmentShader, uniforms: THREE.UniformsUtils.clone(uniforms) };
    material.onBeforeCompile(noMain, null);
    assert.equal(told.length, 2);
    assert.match(told[1], /void main/);
  } finally {
    console.warn = original;
  }
});
