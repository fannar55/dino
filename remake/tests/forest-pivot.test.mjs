import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as config from '../world/forest/config.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { createBatcher } from '../world/forest/batch.js';
import { createForest } from '../world/forest/forest.js';
import * as materials from '../world/forest/materials.js';
import { ACTOR_GLSL } from '../world/forest/terrain.js';
import { PRESETS } from '../engine/quality.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { createWind } from '../engine/wind.js';

// Three parts of the forest move about a pivot of their own, on top of the wind (materials.js: forestPivot):
//   ferns lean away from a character's footprint, by their height, the way the grass lies down;
//   flower heads nod about the top of their stem on each strong beat of the theme, and mushrooms hop and squash about their foot.
// The batcher bakes the pivot into every vertex as aPivot (4 bytes). These tests read the baked bytes the way the shader does, hold
// the amplitudes to the config, and check the wiring of the footprints and the dance into the vegetation shader. The shader's
// arithmetic is mirrored below (`mirror`) so its behaviour can be checked here; the numbers it uses are read out of its text.
const { FOREST } = config;
const { createSharedUniforms, createVegetationMaterial } = materials;
const DEG = Math.PI / 180;
const pivotCodes = () => config.PIVOT; // looked up when a test runs, so a missing export fails that test and not the whole file

// ---- baking a plant the way the forest does ---------------------------------------------------------

const library = createSpeciesLibrary(7);
function placement(name, o = {}) {
  const { variant = 0, lod = 0, band = 'clearing', x = 3.2, z = -2.4, y = 0.35, rot = 0.9, scale = 1.2, phase = 0.5 } = o;
  const model = library.get(name, variant, lod);
  return { name, model, variant, lod, x, y, z, rot, scale, band, models: [{ level: lod, model }], sector: 0, sky: 1, phase, blocksGrass: false, grassRadius: 0 };
}
/** The meshes a batcher builds from these placements, and for each its vertices: position, aPivot bytes. */
function bake(...placements) {
  const batcher = createBatcher();
  for (const p of placements) batcher.add(p);
  const { meshes } = batcher.build(() => ({ material: new THREE.MeshBasicMaterial() }));
  return meshes.map(mesh => ({ mesh, kind: mesh.userData.kind, pos: mesh.geometry.getAttribute('position').array, pivot: mesh.geometry.getAttribute('aPivot')?.array }));
}
const vertices = baked => baked.flatMap(b => Array.from({ length: b.pos.length / 3 }, (_, i) => ({
  p: new THREE.Vector3(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]),
  bytes: b.pivot ? Array.from(b.pivot.subarray(i * 4, i * 4 + 4)) : null, kind: b.kind, i, mesh: b.mesh,
})));

/** What the shader makes of the bytes of aPivot (materials.js, forestPivot), read independently of the baker. */
function decode([x, y, z, code]) {
  const PIVOT = pivotCodes();
  if (code === PIVOT.none) return { kind: 'none' };
  if (code === PIVOT.lean) return { kind: 'lean', height: (x / 255) * FOREST.pivot.height };
  const rel = new THREE.Vector3(x - 127, y - 127, z - 127).multiplyScalar(FOREST.pivot.reach / 127);
  if (code === PIVOT.hop) return { kind: 'hop', rel };
  return { kind: 'nod', rel, facing: ((code - PIVOT.nod) / PIVOT.nodSteps) * Math.PI * 2 };
}
const pivotOf = v => v.p.clone().sub(decode(v.bytes).rel);
/** The vertices that share a pivot (one head, one mushroom): clustered by distance, since the encoding wobbles the pivot by a step. */
const around = (list, near = 0.012) => {
  const groups = [];
  for (const v of list) {
    const c = pivotOf(v);
    const group = groups.find(g => g.centre.distanceTo(c) < near);
    if (group) { group.list.push(v); group.centre.lerp(c, 1 / group.list.length); } else groups.push({ centre: c.clone(), list: [v] });
  }
  return groups.map(g => g.list);
};

// ---- the bytes ---------------------------------------------------------------------------------------

test('every fern vertex is baked with its height above the plant\'s foot, in every band; no other plant has a lean', () => {
  const PIVOT = pivotCodes();
  for (const band of ['clearing', 'edge', 'inner', 'deep']) {
    const fern = placement('fern', { band, y: 0.35, scale: 1.3 });
    const all = vertices(bake(fern));
    assert.ok(all.length > 100, 'a fern has vertices');
    let worst = 0, highest = 0;
    for (const v of all) {
      const d = decode(v.bytes);
      assert.equal(d.kind, 'lean', `a fern vertex in the ${band} band has no lean`);
      const height = Math.max(0, v.p.y - fern.y);
      worst = Math.max(worst, Math.abs(d.height - Math.min(height, FOREST.pivot.height)));
      highest = Math.max(highest, d.height);
    }
    assert.ok(worst < FOREST.pivot.height / 255, `the baked height is off by ${(worst * 1000).toFixed(1)} mm`);
    assert.ok(highest > 0.15, `the highest fern vertex is ${highest.toFixed(2)} m up: the lever is there`);
  }
  for (const name of ['cycad', 'treeFern', 'horsetail', 'bush', 'broadleaf', 'araucaria', 'rock', 'log']) {
    const others = vertices(bake(placement(name, { band: 'edge' })));
    assert.ok(others.length > 0);
    assert.ok(others.every(v => v.bytes[3] === PIVOT.none && v.bytes[0] === 0), `a ${name} has a pivot baked`);
  }
});

/** The normal of a head: its triangles' normals added up, from the baked positions. */
function headNormal(group) {
  const mesh = group[0].mesh;
  const index = mesh.userData.cull.master; // every triangle of the mesh; its index buffer holds only what the camera sees, and none has looked
  const pos = mesh.geometry.getAttribute('position').array;
  const own = new Set(group.map(v => v.i));
  const sum = new THREE.Vector3();
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t < index.length; t += 3) {
    if (!own.has(index[t])) continue;
    a.fromArray(pos, index[t] * 3); b.fromArray(pos, index[t + 1] * 3); c.fromArray(pos, index[t + 2] * 3);
    const face = b.sub(a).cross(c.sub(a));
    if (face.y < 0) face.negate(); // the heads face up
    sum.add(face);
  }
  return sum.normalize();
}
function angleBetween(a, b) {
  const d = (a - b) % (Math.PI * 2);
  return Math.abs(d) > Math.PI ? d - Math.sign(d) * Math.PI * 2 : d;
}

test('a flower head nods about the top of its stem, toward the way it faces', () => {
  const PIVOT = pivotCodes();
  const tilted = [];
  let seen = 0;
  for (const variant of [0, 1, 2, 3]) {
    const flowers = placement('flowers', { variant, rot: 0.9, scale: 1.2 });
    const all = vertices(bake(flowers));
    const heads = all.filter(v => v.bytes[3] >= PIVOT.nod);
    const rest = all.filter(v => v.bytes[3] === PIVOT.none);
    assert.ok(heads.length > 0 && rest.length > 0, 'the heads move about a pivot, the stems and leaves do not');
    const groups = around(heads);
    assert.ok(groups.length >= 3 && groups.length <= 7, `${groups.length} heads in a cluster of 3 to 7 blooms`);
    for (const group of groups) {
      seen++;
      // every vertex of the head says the same pivot, to the step of the encoding
      const centre = group.reduce((sum, v) => sum.add(pivotOf(v)), new THREE.Vector3()).divideScalar(group.length);
      for (const v of group) assert.ok(pivotOf(v).distanceTo(centre) < 2.5 * FOREST.pivot.reach / 127, 'the head\'s vertices disagree about the pivot');
      assert.ok(group.length === 27 || group.length === 23, `a head has ${group.length} vertices`);
      // and the pivot is the stem's tip: stem vertices end within a centimetre or two of it
      const stem = rest.filter(v => v.p.distanceTo(centre) < 0.02);
      assert.ok(stem.length >= 3, `only ${stem.length} stem vertices near a head's pivot`);
      // the head stays within reach of its pivot: it is a few centimetres across
      for (const v of group) assert.ok(decode(v.bytes).rel.length() < 0.16, `a head vertex is ${decode(v.bytes).rel.length().toFixed(2)} m from the pivot`);
      // it dips toward the way it faces: the horizontal part of its normal
      assert.equal(new Set(group.map(v => v.bytes[3])).size, 1, 'a head has one facing');
      const normal = headNormal(group);
      if (Math.hypot(normal.x, normal.z) > 0.25) tilted.push(Math.abs(angleBetween(decode(group[0].bytes).facing, Math.atan2(normal.z, normal.x))));
    }
  }
  assert.ok(seen >= 12 && tilted.length >= 3, `${tilted.length} of ${seen} heads tilt enough to tell which way they face`);
  for (const off of tilted) assert.ok(off < 5 * DEG, `a head faces ${(off / DEG).toFixed(1)} degrees from the way it dips`);
});

test('a mushroom hops about its own foot: the pivot is on the ground under it and the whole mushroom has it', () => {
  const PIVOT = pivotCodes();
  const mushrooms = placement('mushrooms', { variant: 0, y: 0.5, scale: 1.3, band: 'edge' });
  const all = vertices(bake(mushrooms));
  assert.equal(all.length, mushrooms.model.solid.count);
  assert.ok(all.every(v => v.bytes[3] === PIVOT.hop), 'every vertex of a mushroom moves with it');
  const groups = around(all, 0.02);
  assert.ok(groups.length >= 2 && groups.length <= 5, `${groups.length} mushrooms in a clump of 2 to 5`);
  for (const group of groups) {
    const foot = pivotOf(group[0]);
    assert.ok(Math.abs(foot.y - mushrooms.y) < 0.01, `a mushroom turns about a point ${((foot.y - mushrooms.y) * 100).toFixed(1)} cm off the ground`);
    assert.ok(Math.hypot(foot.x - mushrooms.x, foot.z - mushrooms.z) < 0.5, 'and not near the clump');
    // stem and cap are above the foot: the height of a mushroom, a handful of centimetres to about 30
    const rise = Math.max(...group.map(v => decode(v.bytes).rel.y));
    assert.ok(rise > 0.08 && rise < 0.4, `a mushroom ${rise.toFixed(2)} m tall`);
    const widest = Math.max(...group.map(v => Math.hypot(decode(v.bytes).rel.x, decode(v.bytes).rel.z)));
    assert.ok(widest > 0.05 && widest < 0.2, `a cap ${widest.toFixed(2)} m from the stem's axis`);
  }
});

test('flowers and mushrooms dance in the bands the config names, and nowhere else', () => {
  const PIVOT = pivotCodes();
  const bands = ['clearing', 'edge', 'inner', 'deep'];
  const dancing = () => bands.filter(band => {
    const baked = vertices(bake(placement('flowers', { band }), placement('mushrooms', { band, x: 8 })));
    return baked.some(v => v.bytes[3] >= PIVOT.hop);
  });
  assert.deepEqual(dancing(), FOREST.dance.bands, 'the bands that dance are the config\'s');
  assert.ok(FOREST.dance.bands.includes('clearing'));
  const was = FOREST.dance.bands;
  try {
    FOREST.dance.bands = ['clearing'];
    assert.deepEqual(dancing(), ['clearing']);
    FOREST.dance.bands = [];
    assert.deepEqual(dancing(), []);
    // a fern leans in every band whatever the dance does
    assert.ok(vertices(bake(placement('fern', { band: 'deep' }))).every(v => v.bytes[3] === PIVOT.lean));
  } finally {
    FOREST.dance.bands = was;
  }
});

test('every main geometry has the aPivot attribute and no shadow caster does', () => {
  const batcher = createBatcher();
  const plants = [placement('broadleaf', { band: 'edge' }), placement('fern', { band: 'edge', x: 9 }), placement('mushrooms', { band: 'clearing', x: -4 })];
  for (const p of plants) { batcher.add(p); batcher.addCaster(p); }
  const { meshes, casterMeshes } = batcher.build(() => ({ material: new THREE.MeshBasicMaterial() }), { casterSetup: () => ({ material: new THREE.MeshBasicMaterial() }) });
  assert.ok(meshes.length >= 3 && casterMeshes.length >= 1);
  for (const mesh of meshes) {
    const a = mesh.geometry.getAttribute('aPivot');
    assert.ok(a, `${mesh.name} has no aPivot`);
    assert.equal(a.itemSize, 4);
    assert.equal(a.normalized, true);
    assert.ok(a.array instanceof Uint8Array);
    assert.equal(a.count, mesh.geometry.getAttribute('position').count);
  }
  for (const mesh of casterMeshes) assert.equal(mesh.geometry.getAttribute('aPivot'), undefined, `${mesh.name} carries aPivot: shadows are not bent`);
});

test('the codes of aPivot leave room for every facing and fit a byte', () => {
  const PIVOT = pivotCodes();
  assert.deepEqual([PIVOT.none, PIVOT.lean, PIVOT.hop, PIVOT.nod], [0, 1, 2, 3]);
  assert.equal(PIVOT.nod + PIVOT.nodSteps - 1, 255, 'the facings fill the rest of the byte');
});

// ---- the shader's text -------------------------------------------------------------------------------

const number = (name, source = materials.PIVOT_GLSL) => {
  const m = source.match(new RegExp(`const float ${name} = (-?[\\d.]+);`));
  assert.ok(m, `the shader has no const float ${name}`);
  return Number(m[1]);
};

test('the shader\'s amplitudes are the config\'s, and the config is what the ruling asks for', () => {
  const PIVOT = pivotCodes();
  const nod = number('forestNod'), hop = number('forestHop'), squash = number('forestSquash');
  assert.ok(Math.abs(nod - FOREST.dance.nodDeg * DEG) < 1e-5, `the shader nods ${nod / DEG} degrees, the config says ${FOREST.dance.nodDeg}`);
  assert.ok(Math.abs(hop - FOREST.dance.hop) < 1e-6);
  assert.ok(Math.abs(squash - FOREST.dance.squash) < 1e-6);
  assert.ok(Math.abs(number('forestLean') - FOREST.fernBend.leanDeg * DEG) < 1e-5);
  assert.ok(Math.abs(number('forestLeanReach') - FOREST.fernBend.reach) < 1e-6);
  assert.ok(Math.abs(number('forestFootRadius') - FOREST.grass.footprint.radius) < 1e-6, 'the reach is for the footprint of the grass');
  assert.ok(Math.abs(number('forestReach') - FOREST.pivot.reach) < 1e-6);
  assert.ok(Math.abs(number('forestHeight') - FOREST.pivot.height) < 1e-6);
  assert.equal(number('forestNodSteps'), PIVOT.nodSteps, 'the shader counts the facings the baker counts');
  // the ruling: heads dip up to 8 degrees, mushrooms hop about 3 cm with a little squash
  assert.ok(FOREST.dance.nodDeg > 3 && FOREST.dance.nodDeg <= 8, `${FOREST.dance.nodDeg} degrees: more than the sway's 3 so that a small head shows it, no more than 8`);
  assert.ok(FOREST.dance.hop >= 0.02 && FOREST.dance.hop <= 0.04, `a hop of ${FOREST.dance.hop} m is not about 3 cm`);
  assert.ok(FOREST.dance.squash > 0 && FOREST.dance.squash <= 0.15, 'a little squash');
});

test('the shader says what the mirror below computes, statement for statement', () => {
  // The arithmetic of forestPivot is mirrored in this file (`mirror`) because node has no GPU: these are the lines of the shader the
  // mirror stands for. Change one on purpose and this fails until the mirror is changed to match (and the shader has been checked
  // against the mirror on a GPU again: its own source in a transform-feedback pass, which a test in node cannot do).
  const text = materials.PIVOT_GLSL.replace(/\s+/g, ' ');
  const said = [
    'float code = floor( a.w * 255.0 + 0.5 );',
    'if ( code < 1.5 ) return forestFernLean( wp.xz, a.x * forestHeight );',
    'vec3 rel = ( a.xyz * 255.0 - 127.0 ) * ( forestReach / 127.0 );',
    'float own = 0.8 + 0.2 * fract( w.x * 7.31 );',
    'vec2 beyond = vec2( local.x - clamp( local.x, -s.x, s.x ), local.y );',
    'vec2 dir = mix( local, beyond, smoothstep( 0.0, 0.3, length( beyond ) ) );',
    'dir /= max( length( dir ), 1e-4 );',
    'return dir.x * a.zw + dir.y * vec2( -a.w, a.z );',
    'float reach = forestLeanReach * uActorShape[ i ].y / forestFootRadius;',
    'push += forestActorAway( p, i ) * ( 1.0 - smoothstep( -0.2, reach, forestActorDistance( p, i ) ) );',
    'float angle = forestLean * min( len, 1.0 );',
    'vec2 dir = push / max( len, 1e-4 );',
    'return vec3( dir.x * sin( angle ), cos( angle ) - 1.0, dir.y * sin( angle ) ) * lever;',
    'float squash = uDance.z * forestSquash * own;',
    'return vec3( rel.x * 0.5 * squash, uDance.y * forestHop * own - rel.y * squash, rel.z * 0.5 * squash );',
    'float facing = ( code - 3.0 ) * ( 6.2831853 / forestNodSteps );',
    'vec3 axis = vec3( sin( facing ), 0.0, -cos( facing ) );',
    'float angle = uDance.x * forestNod * own;',
    'vec3 turned = rel * cos( angle ) + cross( axis, rel ) * sin( angle ) + axis * ( dot( axis, rel ) * ( 1.0 - cos( angle ) ) );',
    'return turned - rel;',
  ];
  for (const statement of said) assert.ok(text.includes(statement), `the shader no longer says: ${statement}`);
  // the loop that adds up the pushes of the actors stops at the count, as the grass's does
  assert.match(text, /for \( int i = 0; i < 4; i \+\+ \) \{ if \( i >= uActorCount \) break;/);
  // the footprint distance is the ground and the grass's own
  assert.match(ACTOR_GLSL.replace(/\s+/g, ' '), /vec2 local = vec2\( dot\( d, a\.zw \), dot\( d, vec2\( -a\.w, a\.z \) \) \); vec2 q = vec2\( max\( abs\( local\.x \) - s\.x, 0\.0 \), local\.y \); return length\( q \) - s\.y;/);
});

/** What three hands the shader of a patched material: its uniforms and its sources. */
function compiled(material) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderChunk.meshlambert_vert, fragmentShader: THREE.ShaderChunk.meshlambert_frag };
  material.onBeforeCompile(shader);
  return shader;
}
async function forestOf(layout, actors = new Map()) {
  const look = pickLook('morning');
  const world = {
    THREE, renderer: { getDrawingBufferSize: v => v.set(1280, 800) }, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200),
    q: PRESETS.low, params: new URLSearchParams(''), look, lighting: { direction: sunDirection(look), sun: null, focusRadius: 10 },
    wind: createWind(), chapter: { look: 'morning', actors: {} }, heightAt: () => 0, actors,
  };
  return { world, forest: await createForest(world, layout) };
}
const LAYOUT = { seed: 23, clearing: { center: [0, 0], radius: 9 }, forestEdge: 14, path: [[-48, 14], [-30, 9], [-16, 4], [-6, 1], [3, 0]] };
const meshOf = (forest, kind) => forest.group.children.find(m => m.isMesh && m.userData.kind === kind && !m.userData.caster);

test('the vegetation shader reads the footprints the grass and the ground read, and the dance of the wind', async () => {
  const { world, forest } = await forestOf(LAYOUT);
  const veg = { thin: compiled(meshOf(forest, 'thin').material), solid: compiled(meshOf(forest, 'solid').material) };
  const grass = compiled(forest.group.getObjectByName('Grass').children[0].material);
  const ground = compiled(forest.group.getObjectByName('Forest ground').material);
  for (const [name, shader] of Object.entries(veg)) {
    for (const u of ['uActors', 'uActorShape', 'uActorCount']) {
      assert.ok(shader.uniforms[u], `the ${name} material has no ${u}`);
      assert.equal(shader.uniforms[u], grass.uniforms[u], `the ${name} material's ${u} is not the grass's own`);
      assert.equal(shader.uniforms[u], ground.uniforms[u]);
    }
    assert.equal(shader.uniforms.uDance, world.wind.uniforms.uDance, `the ${name} material does not read the wind's uDance`);
    assert.match(shader.vertexShader, /attribute vec4 aPivot;/);
    assert.ok(shader.vertexShader.indexOf('forestActorDistance') < shader.vertexShader.indexOf('forestFernLean'), 'the footprint function the grass uses comes first');
    assert.match(shader.vertexShader, /transformed \+= forestWind\( forestRest, aWind, aTree \);\s+transformed \+= forestPivot\( forestRest, aWind, aPivot \);/, 'the pivot comes on top of the wind');
  }
  // and the footprints are the characters', written each frame as for the grass
  const mosi = { root: new THREE.Object3D() };
  mosi.root.position.set(1.5, 0, -0.5);
  mosi.root.rotation.y = -0.6;
  world.actors.set('mosi', mosi);
  forest.update(1 / 30, 0);
  assert.equal(veg.thin.uniforms.uActorCount.value, 1);
  const a = veg.thin.uniforms.uActors.value[0], s = veg.thin.uniforms.uActorShape.value[0];
  assert.deepEqual([a.x, a.y].map(v => Math.round(v * 1e6) / 1e6), [1.5, -0.5]);
  assert.ok(Math.abs(a.z - Math.cos(0.6)) < 1e-6 && Math.abs(a.w - Math.sin(0.6)) < 1e-6, 'the heading');
  assert.deepEqual([s.x, s.y], [FOREST.grass.footprint.halfLength, FOREST.grass.footprint.radius], 'the same capsule');
  forest.dispose();
});

test('a vegetation material needs the actors it bends ferns away from, and says so', () => {
  const wind = createWind();
  const shared = createSharedUniforms({ wind }, null, null);
  assert.throws(() => createVegetationMaterial(shared, { key: 'x' }), /actors/);
  const actors = { glsl: ACTOR_GLSL, uniforms: { uActors: { value: [] }, uActorShape: { value: [] }, uActorCount: { value: 0 } } };
  const shader = compiled(createVegetationMaterial(shared, { key: 'x', actors }));
  assert.equal(shader.uniforms.uActors, actors.uniforms.uActors);
});

test('setDance feeds one shared uDance uniform that the vegetation reads, held to what the shader can use', () => {
  const wind = createWind();
  assert.deepEqual(wind.uniforms.uDance.value.toArray(), [0, 0, 0], 'it starts still');
  wind.setDance({ nod: 0.4, hop: 0.6, squash: -0.3 });
  assert.deepEqual(wind.uniforms.uDance.value.toArray(), [0.4, 0.6, -0.3]);
  wind.setDance({ nod: 7, hop: -2, squash: 9 });
  assert.deepEqual(wind.uniforms.uDance.value.toArray(), [1, 0, 1], 'a nod and a hop run from 0 to 1 and a squash from -1 to 1');
  wind.setDance({ nod: NaN, hop: Infinity, squash: undefined });
  assert.deepEqual(wind.uniforms.uDance.value.toArray(), [0, 0, 0], 'a broken beat must not send NaN into every flower');
  const shared = createSharedUniforms({ wind }, null, null);
  assert.equal(shared.uDance, wind.uniforms.uDance, 'the materials get the engine\'s own uniform, not a copy');
});

// ---- the shader's arithmetic, mirrored ---------------------------------------------------------------

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mirror = {
  /** forestActorDistance: the signed distance from a point to an actor's capsule (negative inside). */
  distance(p, actor, shape) {
    const dx = p.x - actor.x, dz = p.z - actor.y;
    const lx = dx * actor.z + dz * actor.w, lz = dx * -actor.w + dz * actor.z;
    return Math.hypot(Math.max(Math.abs(lx) - shape.x, 0), lz) - shape.y;
  },
  /** forestActorAway: which way, along the ground, is away from the capsule. */
  away(p, actor, shape) {
    const dx = p.x - actor.x, dz = p.z - actor.y;
    const lx = dx * actor.z + dz * actor.w, lz = dx * -actor.w + dz * actor.z;
    const bx = lx - Math.min(shape.x, Math.max(-shape.x, lx)), bz = lz;
    const k = smoothstep(0, 0.3, Math.hypot(bx, bz));
    let ux = lx + (bx - lx) * k, uz = lz + (bz - lz) * k;
    const len = Math.max(Math.hypot(ux, uz), 1e-4);
    ux /= len; uz /= len;
    return new THREE.Vector2(ux * actor.z - uz * actor.w, ux * actor.w + uz * actor.z);
  },
  /** forestFernLean: the offset of a fern vertex `lever` metres above its foot at ground point p. */
  lean(p, lever, actors, shapes) {
    const push = new THREE.Vector2();
    for (let i = 0; i < actors.length; i++) {
      const reach = (FOREST.fernBend.reach * shapes[i].y) / FOREST.grass.footprint.radius;
      const f = 1 - smoothstep(-0.2, reach, mirror.distance(p, actors[i], shapes[i]));
      push.addScaledVector(mirror.away(p, actors[i], shapes[i]), f);
    }
    const len = push.length();
    const angle = FOREST.fernBend.leanDeg * DEG * Math.min(len, 1);
    const dir = push.clone().divideScalar(Math.max(len, 1e-4));
    return new THREE.Vector3(dir.x * Math.sin(angle), Math.cos(angle) - 1, dir.y * Math.sin(angle)).multiplyScalar(lever);
  },
  /** forestPivot for a flower head or a mushroom: the offset of a vertex `rel` from its pivot, by the wind's uDance and the plant's own share. */
  dance(code, rel, own, dance) {
    const PIVOT = pivotCodes();
    if (code === PIVOT.hop) {
      const squash = dance.z * FOREST.dance.squash * own;
      return new THREE.Vector3(rel.x * 0.5 * squash, dance.y * FOREST.dance.hop * own - rel.y * squash, rel.z * 0.5 * squash);
    }
    const facing = ((code - PIVOT.nod) / PIVOT.nodSteps) * Math.PI * 2;
    const axis = new THREE.Vector3(Math.sin(facing), 0, -Math.cos(facing));
    const angle = dance.x * FOREST.dance.nodDeg * DEG * own;
    return rel.clone().applyAxisAngle(axis, angle).sub(rel);
  },
};
const MOSI = { actor: new THREE.Vector4(0, 0, 1, 0), shape: new THREE.Vector4(FOREST.grass.footprint.halfLength, FOREST.grass.footprint.radius, FOREST.grass.footprint.soft, 0) };
const out = offset => Math.hypot(offset.x, offset.z); // how far a lean moves a point along the ground
const lean = (x, z, lever = 0.6, actors = [MOSI]) => mirror.lean({ x, z }, lever, actors.map(a => a.actor), actors.map(a => a.shape));

test('a fern leans away from the footprint, by its height, and stands again with the distance', () => {
  const { halfLength, radius } = FOREST.grass.footprint;
  const reach = FOREST.fernBend.reach;
  // beside the body, 0.3 m from the capsule: it leans straight out, sideways, and the foot stays
  const side = lean(0.4, radius + 0.3);
  assert.ok(side.z > 0.2, `the top moves ${side.z.toFixed(2)} m out from a body on the +z side`);
  assert.ok(Math.abs(side.x) < 0.02, 'and not along it');
  assert.equal(lean(0.4, 1.2, 0).length(), 0, 'a point at its foot does not move');
  // in front of it, the lean is along its heading; behind it, the other way
  assert.ok(lean(halfLength + radius + 0.2, 0).x > 0.1, 'ahead of the body it leans on ahead');
  assert.ok(lean(-(halfLength + radius + 0.2), 0).x < -0.1, 'behind it, the other way');
  // a lean, not a squash: the point keeps its distance from the foot (it is turned, not shortened) and the top comes down a little
  for (const lever of [0.2, 0.6, 1.2]) {
    const off = lean(0.4, radius, lever);
    const turned = new THREE.Vector3(off.x, lever + off.y, off.z);
    assert.ok(Math.abs(turned.length() - lever) < 1e-9, `a point ${lever} m up is ${turned.length()} m from the foot after the lean`);
    assert.ok(off.y < 0 && out(off) > 2 * -off.y, 'the top comes down less than it moves out');
    assert.ok(out(off) / lever > 0.4, 'a lean of a good number of degrees at the footprint');
  }
  // proportional to the height
  const small = lean(0.4, 1.3, 0.3), tall = lean(0.4, 1.3, 0.6);
  assert.ok(Math.abs(out(tall) / out(small) - 2) < 0.05);
  // it eases: the lean falls steadily as the distance grows and is gone at the reach, without a step anywhere
  let previous = Infinity;
  for (let d = -0.4; d <= reach + 0.3; d += 0.02) {
    const here = out(lean(0.4, radius + d));
    assert.ok(here <= previous + 1e-9, `the lean grows ${(here - previous).toFixed(4)} m going away at ${d.toFixed(2)} m`);
    assert.ok(previous === Infinity || previous - here < 0.024, `it falls ${(previous - here).toFixed(3)} m in a step of 2 cm: a jump, not an ease`);
    previous = here;
  }
  assert.ok(out(lean(0.4, radius + reach + 0.01)) < 1e-9, 'gone at the reach');
  // far from every actor, or with no actor at all, it does not move
  assert.equal(lean(9, 9).length(), 0);
  assert.equal(mirror.lean({ x: 0.4, z: 1.2 }, 0.6, [], []).length(), 0);
});

test('the lean is continuous across the body: no fern flips to the other side as the footprint passes over it', () => {
  // walk a point along a line across the capsule, through its axis, and across the length of it: neighbouring points lean alike
  const step = 0.01;
  const worstJump = (from, to) => {
    let worst = 0, last = null;
    for (let t = 0; t <= 1; t += step / from.distanceTo(to)) {
      const p = from.clone().lerp(to, t);
      const off = lean(p.x, p.y, 0.6);
      const here = new THREE.Vector3(off.x, 0, off.z);
      if (last && Math.hypot(p.x, p.y) > 0.15) worst = Math.max(worst, here.distanceTo(last));
      last = here;
    }
    return worst;
  };
  // across the body, 0.7 m ahead of its middle, along the axis, off to one side, and across the middle slantwise
  for (const [a, b] of [[[0.7, -2.2], [0.7, 2.2]], [[-3.5, 0.02], [3.5, 0.02]], [[-3.5, 0.5], [3.5, 0.5]], [[2, -3], [-2, 3]]]) {
    const jump = worstJump(new THREE.Vector2(...a), new THREE.Vector2(...b));
    assert.ok(jump < 0.06, `the lean of a 0.6 m high point jumps ${jump.toFixed(3)} m in 1 cm along ${a} to ${b}`);
  }
});

test('two characters push a fern from both sides and it stands between them', () => {
  const other = { actor: new THREE.Vector4(0, 2.6, 1, 0), shape: MOSI.shape };
  const between = lean(0.4, 1.3, 0.6, [MOSI, other]);
  assert.ok(out(between) < 0.02, 'pushed equally from both sides it does not lean');
  const near = lean(0.4, 0.9, 0.6, [MOSI, other]);
  assert.ok(near.z > 0.1, 'nearer one of them it leans away from that one');
});

test('a flower head tips toward its facing and a mushroom hops and squashes, by the amount of the dance', () => {
  const PIVOT = pivotCodes();
  const flowers = placement('flowers', { variant: 2, rot: 0.3, scale: 1.1 });
  const heads = vertices(bake(flowers)).filter(v => v.bytes[3] >= PIVOT.nod);
  const groups = around(heads);
  assert.ok(groups.length >= 3);
  for (const group of groups) {
    const rel = group.map(v => decode(v.bytes).rel);
    const full = group.map(v => mirror.dance(v.bytes[3], decode(v.bytes).rel, 1, new THREE.Vector3(1, 0, 0)));
    const none = group.map(v => mirror.dance(v.bytes[3], decode(v.bytes).rel, 1, new THREE.Vector3(0, 1, 1)));
    for (const off of none) assert.ok(off.length() < 1e-12, 'a nod of 0 moves nothing');
    // a rigid turn about the pivot by the config's angle: every vertex keeps its distance from the pivot and the farthest moves 2 r sin(a/2)
    let farthest = 0;
    group.forEach((v, i) => {
      assert.ok(Math.abs(rel[i].clone().add(full[i]).length() - rel[i].length()) < 1e-9, 'the head keeps its shape');
      farthest = Math.max(farthest, full[i].length());
    });
    const reachOfHead = Math.max(...rel.map(r => r.length()));
    assert.ok(farthest <= 2 * Math.sin((FOREST.dance.nodDeg * DEG) / 2) * reachOfHead + 1e-9);
    assert.ok(farthest > 0.005, `the farthest petal moves ${(farthest * 1000).toFixed(1)} mm at the full nod`);
    // the petals on the side it faces go down, and the raised middle of the head hardly moves
    const facing = decode(group[0].bytes).facing;
    const toward = new THREE.Vector3(Math.cos(facing), 0, Math.sin(facing));
    const hub = rel.reduce((best, r, i) => (r.length() < rel[best].length() ? i : best), 0);
    const tip = rel.reduce((best, r, i) => (r.dot(toward) > rel[best].dot(toward) ? i : best), 0);
    assert.ok(full[tip].y < 0, 'the petals on the side it faces go down');
    assert.ok(full[hub].length() < full[tip].length(), 'and the middle of the head hardly moves');
  }
  // a mushroom: the whole of it rises by the hop, its top comes down by the squash, its foot hardly moves
  const mush = vertices(bake(placement('mushrooms', { variant: 1, scale: 1 })));
  const squash = FOREST.dance.squash, hop = FOREST.dance.hop;
  const rels = mush.map(v => decode(v.bytes).rel);
  const high = rels.reduce((best, r) => (r.y > best.y ? r : best), rels[0]);
  const foot = rels.reduce((best, r) => (r.y < best.y ? r : best), rels[0]);
  const air = mirror.dance(PIVOT.hop, high, 1, new THREE.Vector3(0, 1, 0));
  assert.ok(Math.abs(air.y - hop) < 1e-9 && air.x === 0 && air.z === 0, `in the air at the top of the hop a mushroom has risen ${air.y} m`);
  const landed = mirror.dance(PIVOT.hop, high, 1, new THREE.Vector3(0, 0, 1));
  assert.ok(Math.abs(landed.y + high.y * squash) < 1e-9, 'landing, its top comes down by the squash of its height');
  const rim = rels.reduce((best, r) => (Math.hypot(r.x, r.z) > Math.hypot(best.x, best.z) ? r : best), rels[0]);
  const spread = mirror.dance(PIVOT.hop, rim, 1, new THREE.Vector3(0, 0, 1));
  assert.ok(Math.hypot(rim.x + spread.x, rim.z + spread.z) > Math.hypot(rim.x, rim.z), 'and the cap spreads a little');
  assert.ok(mirror.dance(PIVOT.hop, foot, 1, new THREE.Vector3(0, 0, 1)).length() < 0.005, 'the foot stays on the ground');
  assert.ok(mirror.dance(PIVOT.hop, high, 1, new THREE.Vector3(0, 0, -1)).y > 0, 'a negative squash stretches');
  // each plant takes its own share of the dance, so a field of them does not move as one
  assert.ok(Math.abs(mirror.dance(PIVOT.hop, high, 0.85, new THREE.Vector3(0, 1, 0)).y - 0.85 * hop) < 1e-9);
});
