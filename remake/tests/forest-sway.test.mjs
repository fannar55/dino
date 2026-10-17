import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SPECIES, createSpeciesLibrary } from '../world/forest/species.js';
import * as config from '../world/forest/config.js';
import { WIND_GLSL } from '../world/forest/materials.js';
import { createBatcher } from '../world/forest/batch.js';
import { createForest } from '../world/forest/forest.js';
import { PRESETS } from '../engine/quality.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { createWind } from '../engine/wind.js';

const { FOREST, BEAT_SHARE, WIND_PEAK } = config;
const DEG = Math.PI / 180;

// The style guide caps sway at 3 degrees, the beat included. The config's two numbers only bound what bendAt bakes from
// maxSwayDeg (trunks, crowns, needles, tree-fern trunks); fronds, stems and stalks carry weights of their own. So this builds
// every kind the forest has, in the variants, levels of detail and shapes the planner asks for, and measures what its builders baked.
//
// The measure: a vertex that sways s metres at full wind, d metres from the plant's root (the model's origin), leans by the slope
// s / d. The wind shader bends a part by at most WIND_PEAK times its sway along the wind and across it, and the beat bends it
// further along the wind by BEAT_SHARE of its sway at the crest of its wave (a tree's every fourth beat, a plant's every second),
// so a slope is a lean of atan(...) degrees. A vertex nearer its root than MIN_REACH moves by millimetres, not by an angle, and is
// left out. A tree fern's fronds ride on its trunk top, which has a lean of its own, so they are measured from there, by what they
// bend beyond it.
//
// The rule: at the crest of the beat, every kind's peak lean stays at or below the larger of 3 degrees and the peak it had before
// the beat.
const MIN_REACH = 0.25; // m
const SEED = 7;
const SHAPES = { broadleaf: [{}, { reach: 0.9 }, { reach: 0.45, size: 0.6 }], bush: [{}, { fine: true }] }; // as the planner asks for them

// The peaks, in degrees at full wind, of the kinds that leaned past 3 before the beat, measured as below on the builders of commit
// e5f53f5, the one before it. Weights alone give 4.37 for the cycad fronds, 6.6 for the tree-fern fronds and 4.1 for the horsetail,
// and 2.74 for the fern fronds and flower stems; but this measures the line from the root to a point, and the chord of an arched
// fern frond or of a flower head is shorter than the length its weight is taken from, so those two read just over 3 here.
const BEFORE_THE_BEAT = {
  'treeFern fronds': 7.172,
  cycad: 4.307,
  fern: 3.099,
  flowers: 3.071,
  horsetail: 3.989,
};
// the arch and droop of a frond decide the chord, so a tweak to a builder moves a peak by about a percent without moving its weight
const GEOMETRY_ALLOWANCE = 1.02;
const MIN_BEAT = 0.5; // degrees the beat must add to every kind that sways: the visible beat is the owner's request
const LEAST = 0.8; // the least of its wave a plant takes (forestWind: 0.8 to 1 of it, by the plant's wind phase)

/** The steepest lean slope among the vertices of `builder`, as the sway beyond `carried` over the distance from `from`. */
function leanSlope(builder, from = [0, 0, 0], carried = 0) {
  let slope = 0;
  for (let i = 0; i < builder.count; i++) {
    const sway = builder.wind[i * 3] - carried;
    if (sway <= 0) continue;
    const reach = Math.hypot(builder.pos[i * 3] - from[0], builder.pos[i * 3 + 1] - from[1], builder.pos[i * 3 + 2] - from[2]);
    slope = Math.max(slope, sway / Math.max(reach, MIN_REACH));
  }
  return slope;
}

/** The lean in degrees of a slope at the top of the wind, with `beat` (a share of the part's sway) on top along the wind. */
const leanDegrees = (slope, beat) => (Math.atan(Math.hypot(slope * (WIND_PEAK.along + beat), slope * WIND_PEAK.side)) * 180) / Math.PI;

/** Every kind's peak slope, in the groups the rule is stated for: each variant, level of detail and shape the forest builds. */
function peakSlopes() {
  const library = createSpeciesLibrary(SEED);
  const slopes = {};
  const note = (group, slope) => { slopes[group] = Math.max(slopes[group] ?? 0, slope); };
  for (const kind of Object.keys(SPECIES)) {
    for (let variant = 0; variant < (FOREST.trees.variants[kind] ?? 3); variant++) {
      for (let lod = 0; lod < 3; lod++) {
        for (const shape of SHAPES[kind] ?? [{}]) {
          const model = library.get(kind, variant, lod, shape);
          if (kind === 'treeFern') {
            const trunkTop = Math.max(...model.solid.wind.filter((_, i) => i % 3 === 0));
            note('treeFern trunk', leanSlope(model.solid));
            note('treeFern fronds', leanSlope(model.thin, model.crown.c, trunkTop));
          } else {
            note(kind, Math.max(model.solid ? leanSlope(model.solid) : 0, model.thin ? leanSlope(model.thin) : 0));
          }
        }
      }
    }
  }
  return slopes;
}

test('the test knows the wind shader: WIND_PEAK and BEAT_SHARE are its numbers, and the beat\'s wave crests at BEAT_SHARE', () => {
  const text = WIND_GLSL.replace(/\s+/g, ' ');
  const osc = WIND_GLSL.match(/float osc = sin\(t \* 0\.9 \+ phase\) \* ([\d.]+) \+ sin\(t \* 1\.63 \+ phase \* 1\.7\) \* ([\d.]+);/);
  const lean = WIND_GLSL.match(/float lean = strength \* \(([\d.]+) \+ ([\d.]+) \* osc\) \+ ([\d.]+) \* beat;/);
  const side = WIND_GLSL.match(/bend \+= side \* sway \* strength \* ([\d.]+) \* sin\(/);
  const beat = WIND_GLSL.match(/float beat = mix\(forestWave\(uBeats, ([\d.]+)\), forestWave\(uBeats, ([\d.]+)\), tree\) \* \(([\d.]+) \+ ([\d.]+) \* fract\(w\.x \* 7\.31\)\);/);
  const wave = text.match(/float forestWave\( float beats, float period \) \{ return ([\d.]+) \+ ([\d.]+) \* cos\( 6\.2831853 \* fract\( beats \/ period \) \); \}/);
  assert.ok(osc && lean && side && beat && wave, 'forestWind no longer has the lines this reads (the swing, the lean with the beat, the beat\'s waves, the sideways flutter)');
  assert.match(text, /uniform float uBeats; /, 'the beat count is the wind\'s uniform');
  assert.match(text, /vec3 forestWind\(vec3 wp, vec4 w, float tree\) \{/, 'forestWind takes the tree\'s share of the sway (aTree)');
  assert.doesNotMatch(text, /\buBeat\b/, 'nothing reads the pulse');
  const [, swing1, swing2] = osc.map(Number);
  const [, base, gust, share] = lean.map(Number);
  assert.ok(Math.abs(WIND_PEAK.along - (base + gust * (swing1 + swing2))) < 1e-9, `along the wind the shader reaches ${base + gust * (swing1 + swing2)} of a part's sway, WIND_PEAK says ${WIND_PEAK.along}`);
  assert.equal(WIND_PEAK.side, Number(side[1]));
  assert.equal(share, Number(BEAT_SHARE.toFixed(3)), 'the shader takes another share of the sway for the beat than config.js says');
  assert.equal(BEAT_SHARE, FOREST.wind.beatAmplitudeDeg / FOREST.wind.maxSwayDeg);
  // the beat: a plant's share of the sway on a wave of two beats, a tree's on one of four (aTree mixes them); each plant takes 0.8
  // to 1 of its wave; and the wave is 1 at its crest and nothing halfway (engine/beat.js: waveAt). So at the crest a part leans by
  // BEAT_SHARE of its sway more, and no more: the 3 degrees of the rule below are measured there.
  const [, plants, trees, least, more] = beat.map(Number);
  assert.equal(plants, FOREST.wind.beatPeriods.plants);
  assert.equal(trees, FOREST.wind.beatPeriods.trees);
  assert.equal(least, LEAST, 'the least of its wave a plant takes');
  assert.equal(least + more, 1, 'and the most, its whole wave');
  const [, middle, swing] = wave.map(Number);
  assert.equal(middle + swing, 1, 'the wave crests at 1');
  assert.equal(middle - swing, 0, 'and is nothing halfway between its crests');
});

const SLOPES = peakSlopes();

test('every kind of the forest is measured, and the measure sees the sway of the plants that have it', () => {
  for (const kind of Object.keys(SPECIES)) {
    assert.ok(kind in SLOPES || (kind === 'treeFern' && 'treeFern trunk' in SLOPES), `${kind} was not measured`);
  }
  for (const group of ['broadleaf', 'araucaria', 'treeFern trunk', 'treeFern fronds', 'cycad', 'fern', 'bush', 'horsetail', 'flowers']) {
    assert.ok(SLOPES[group] > 0.02, `${group} has a slope of ${SLOPES[group]}: the measure reads no sway`);
  }
});

for (const [group, slope] of Object.entries(SLOPES)) {
  const before = BEFORE_THE_BEAT[group];
  test(before === undefined ? `${group}: within 3 degrees at the crest of the beat` : `${group}: within the ${before} degrees it had before the beat`, () => {
    const peak = leanDegrees(slope, BEAT_SHARE);
    if (before === undefined) {
      assert.ok(peak <= 3, `${group} leans ${peak.toFixed(3)} degrees at full wind at the crest of the beat: over the style guide's 3`);
    } else {
      assert.ok(before > 3, `${group} is listed as having leaned past 3 before the beat, at ${before}`);
      assert.ok(peak <= before * GEOMETRY_ALLOWANCE, `${group} leans ${peak.toFixed(3)} degrees at the crest of the beat, over the ${before} it had without it: the beat must take a share of its sway, not add to it`);
    }
    // and it still moves with the beat, even the plant that takes the least of its wave: a rule met by flattening the plants would
    // defeat the owner's request
    const beat = leanDegrees(slope, LEAST * BEAT_SHARE) - leanDegrees(slope, 0);
    if (slope > 0) assert.ok(beat >= MIN_BEAT, `${group} gains only ${beat.toFixed(2)} degrees at the crest of the beat`);
  });
}

// ---- which wave a vertex rides: the tree's share of its sway, baked as aTree ----------------------------------------------------

const library = createSpeciesLibrary(SEED);
function placement(name, o = {}) {
  const { variant = 0, lod = 0, band = 'edge', x = 3.2, z = -2.4, y = 0.35, rot = 0.9, scale = 1.1, phase = 0.5 } = o;
  const model = library.get(name, variant, lod);
  return { name, model, variant, lod, x, y, z, rot, scale, band, models: [{ level: lod, model }], sector: 0, sky: 1, phase, blocksGrass: false, grassRadius: 0 };
}
/** The main and caster meshes a batcher builds from one placement. */
function bake(p) {
  const batcher = createBatcher();
  batcher.add(p);
  batcher.addCaster(p);
  const material = new THREE.MeshBasicMaterial();
  const { meshes, casterMeshes } = batcher.build(() => ({ material }), { casterSetup: () => ({ material }) });
  return [...meshes, ...casterMeshes];
}
/** The aTree bytes of a mesh, after checking that it is one normalized byte a vertex. */
function treeBytes(mesh) {
  const a = mesh.geometry.getAttribute('aTree');
  assert.ok(a, `${mesh.name} has no aTree`);
  assert.equal(a.itemSize, 1, 'one share a vertex');
  assert.equal(a.normalized, true, 'read as 0 to 1');
  assert.ok(a.array instanceof Uint8Array, 'a byte each');
  assert.equal(a.count, mesh.geometry.getAttribute('position').count);
  return Array.from(a.array);
}

test('a tree\'s every part rides the trees\' wave: aTree is 1 on its trunk, crown, needles and a tree fern\'s trunk, shadows included', () => {
  for (const name of ['broadleaf', 'araucaria']) {
    for (const lod of [0, 2]) {
      for (const mesh of bake(placement(name, { lod }))) {
        assert.ok(treeBytes(mesh).every(b => b === 255), `a ${name} (level ${lod}) has a vertex that is not all tree: ${mesh.name}`);
      }
    }
  }
  for (const lod of [0, 1, 2]) {
    const trunks = bake(placement('treeFern', { lod })).filter(mesh => mesh.userData.kind === 'solid');
    assert.equal(trunks.length, 2, 'a tree fern\'s trunk, and its shadow');
    for (const mesh of trunks) assert.ok(treeBytes(mesh).every(b => b === 255), `a tree fern's trunk (level ${lod}) is not all tree`);
  }
});

test('a plant\'s every part rides the plants\' wave: aTree is 0 on fronds, flowers, stems, stalks, bushes and cycads', () => {
  for (const name of ['fern', 'flowers', 'cycad', 'bush', 'horsetail', 'mushrooms', 'rock', 'log']) {
    for (const variant of [0, 1]) {
      const meshes = bake(placement(name, { variant, band: 'clearing' }));
      assert.ok(meshes.length > 0);
      for (const mesh of meshes) assert.ok(treeBytes(mesh).every(b => b === 0), `a ${name} (variant ${variant}) has a vertex with a tree's share: ${mesh.name}`);
    }
  }
});

test('a tree fern\'s frond rides both waves, by the share of its sway that is its trunk top\'s', () => {
  for (const variant of [0, 1, 2, 3]) {
    for (const lod of [0, 2]) {
      const p = placement('treeFern', { variant, lod });
      const fronds = bake(p).filter(mesh => mesh.userData.kind === 'thin');
      assert.equal(fronds.length, 2, 'the fronds, and their shadow');
      // the trunk top's sway at full wind (species.js: bendAt at the top of a trunk of that height), which every frond rides on
      const carried = FOREST.wind.maxSwayDeg * DEG * p.model.trunk.top;
      const thin = p.model.thin;
      for (const mesh of fronds) {
        const bytes = treeBytes(mesh);
        assert.equal(bytes.length, thin.count, 'one placement: the baked vertices are the model\'s, in order');
        let lowest = 1;
        bytes.forEach((b, i) => {
          const sway = thin.wind[i * 3];
          const share = b / 255;
          assert.ok(b > 0 && b < 255, `frond vertex ${i} is all ${b === 0 ? 'plant' : 'tree'}`);
          // in proportion to its sway: the trunk top's part of it is the tree's, the rest the frond's own
          assert.ok(Math.abs(share * sway - carried) <= (0.5 / 255) * sway + 1e-9, `frond vertex ${i} gives the tree ${(share * sway).toFixed(4)} m of its ${sway.toFixed(4)} m sway, not the trunk top's ${carried.toFixed(4)} m`);
          lowest = Math.min(lowest, share);
        });
        assert.ok(lowest < 0.6, `the tip of a frond is ${lowest.toFixed(2)} tree: the frond's own sway hardly shows`);
      }
    }
  }
});

// ---- the wiring: every material that sways reads the beat count and the tree share ----------------------------------------------

/** A forest built in node, the way tools/world/forest-stats.mjs builds one. */
async function forestOf(layout) {
  const look = pickLook('morning');
  const world = {
    THREE, renderer: { getDrawingBufferSize: v => v.set(1280, 800) }, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200),
    q: PRESETS.low, params: new URLSearchParams(''), look, lighting: { direction: sunDirection(look), sun: null, focusRadius: 10 },
    wind: createWind(), chapter: { look: 'morning', actors: {} }, heightAt: () => 0, actors: new Map(),
  };
  return { world, forest: await createForest(world, layout) };
}
const LIB = { MeshLambertMaterial: 'lambert', MeshBasicMaterial: 'basic', MeshDepthMaterial: 'depth' };
/** What three hands the shader of a material: its uniforms and its sources, after the material's own onBeforeCompile. */
function compiled(material) {
  const lib = THREE.ShaderLib[LIB[material.type]];
  const shader = material.isShaderMaterial
    ? { uniforms: { ...material.uniforms }, vertexShader: material.vertexShader, fragmentShader: material.fragmentShader }
    : { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  material.onBeforeCompile(shader);
  return shader;
}
const LAYOUT = { seed: 23, clearing: { center: [0, 0], radius: 9 }, forestEdge: 14, path: [[-48, 14], [-30, 9], [-16, 4], [-6, 1], [3, 0]] };

test('every material that sways reads the wind\'s uBeats and the baked aTree, the shadows\' too, and none reads the pulse', async () => {
  const { world, forest } = await forestOf(LAYOUT);
  const meshes = [];
  forest.group.traverse(o => { if (o.isMesh || o.isPoints) meshes.push(o); });
  const shaders = new Map();
  for (const mesh of meshes) {
    for (const material of [mesh.material, mesh.customDepthMaterial].filter(Boolean)) {
      if (!shaders.has(material)) shaders.set(material, compiled(material));
    }
  }
  const byName = name => [...shaders].filter(([m]) => m.name === name).map(([, s]) => s);
  // nothing anywhere in the forest reads the pulse
  for (const [material, shader] of shaders) {
    assert.doesNotMatch(`${shader.vertexShader}\n${shader.fragmentShader}`, /\buBeat\b/, `${material.name} reads uBeat`);
    assert.ok(!('uBeat' in shader.uniforms), `${material.name} is handed uBeat`);
  }
  // the vegetation and its shadows: the beat count, and the tree's share of each vertex's sway into forestWind
  const swaying = ['forest-solid', 'forest-thin', 'forest-solid-depth', 'forest-thin-depth'];
  for (const name of swaying) {
    const found = byName(name);
    assert.ok(found.length > 0, `the forest has no ${name} material`);
    for (const shader of found) {
      assert.equal(shader.uniforms.uBeats, world.wind.uniforms.uBeats, `the ${name} material does not read the wind's own uBeats`);
      assert.match(shader.vertexShader, /attribute float aTree;/, `the ${name} material does not read aTree`);
      assert.match(shader.vertexShader, /transformed \+= forestWind\( forestRest, aWind, aTree \);/, `the ${name} material does not sway by the tree's share`);
    }
  }
  // the grass: a ripple of the beat down the wind, a crest every rippleSpacing metres, GRASS_BEAT_SHARE of a blade's bend at it
  const [grass] = byName('forest-grass');
  assert.ok(grass, 'the forest has no grass');
  assert.equal(grass.uniforms.uBeats, world.wind.uniforms.uBeats, 'the grass does not read the wind\'s own uBeats');
  const text = grass.vertexShader.replace(/\s+/g, ' ');
  assert.match(text, /float gAlong = dot\( gBase\.xz, uWindDirection \);/, 'along the wind');
  const ripple = text.match(/gWind \*= 1\.0 \+ ([\d.]+) \* forestWave\( uBeats - gAlong \/ ([\d.]+), ([\d.]+) \);/);
  assert.ok(ripple, 'the grass does not ripple with the beat');
  assert.equal(Number(ripple[1]), config.GRASS_BEAT_SHARE, 'the ripple\'s share of a blade\'s bend');
  assert.equal(config.GRASS_BEAT_SHARE, 0.3, 'light: the owner\'s word');
  assert.equal(Number(ripple[2]), FOREST.wind.rippleSpacing, 'metres between the crests');
  assert.equal(Number(ripple[3]), FOREST.wind.beatPeriods.grass, 'a crest every beat');
  // and every geometry that sways carries the share its vertices give the tree, main and caster alike
  let swayed = 0, cast = 0;
  for (const mesh of meshes) {
    if (!mesh.geometry.getAttribute('aWind')) continue;
    treeBytes(mesh);
    swayed++;
    if (mesh.userData.caster) cast++;
  }
  assert.ok(swayed > 10 && cast > 0, `${swayed} swaying meshes, ${cast} of them casters`);
  forest.dispose();
});
