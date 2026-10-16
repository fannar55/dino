import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, createSpeciesLibrary } from '../world/forest/species.js';
import { FOREST, BEAT_SHARE, WIND_PEAK } from '../world/forest/config.js';
import { WIND_GLSL } from '../world/forest/materials.js';

// The style guide caps sway at 3 degrees, the beat included. The config's two numbers only bound what bendAt bakes from
// maxSwayDeg (trunks, crowns, needles, tree-fern trunks); fronds, stems and stalks carry weights of their own. So this builds
// every kind the forest has, in the variants, levels of detail and shapes the planner asks for, and measures what its builders baked.
//
// The measure: a vertex that sways s metres at full wind, d metres from the plant's root (the model's origin), leans by the slope
// s / d. The wind shader bends a part by at most WIND_PEAK times its sway (along the wind, and on the beat BEAT_SHARE of it more),
// so a slope is a lean of atan(...) degrees. A vertex nearer its root than MIN_REACH moves by millimetres, not by an angle, and is
// left out. A tree fern's fronds ride on its trunk top, which has a lean of its own, so they are measured from there, by what they
// bend beyond it.
//
// The rule: on the beat, every kind's peak lean stays at or below the larger of 3 degrees and the peak it had before the beat.
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

/** The lean in degrees of a slope at the top of the wind and of the beat. */
const leanDegrees = (slope, beat) => (Math.atan(Math.hypot(slope * (WIND_PEAK.along + (beat ? BEAT_SHARE : 0)), slope * WIND_PEAK.side)) * 180) / Math.PI;

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

test('the test knows the wind shader: WIND_PEAK and BEAT_SHARE are the numbers in forestWind', () => {
  const osc = WIND_GLSL.match(/float osc = sin\(t \* 0\.9 \+ phase\) \* ([\d.]+) \+ sin\(t \* 1\.63 \+ phase \* 1\.7\) \* ([\d.]+);/);
  const lean = WIND_GLSL.match(/float lean = strength \* \(([\d.]+) \+ ([\d.]+) \* osc\) \+ ([\d.]+) \* uBeat;/);
  const side = WIND_GLSL.match(/bend \+= side \* sway \* strength \* ([\d.]+) \* sin\(/);
  assert.ok(osc && lean && side, 'forestWind no longer has the lines this reads (the swing, the lean with the beat, the sideways flutter)');
  const [, swing1, swing2] = osc.map(Number);
  const [, base, gust, share] = lean.map(Number);
  assert.ok(Math.abs(WIND_PEAK.along - (base + gust * (swing1 + swing2))) < 1e-9, `along the wind the shader reaches ${base + gust * (swing1 + swing2)} of a part's sway, WIND_PEAK says ${WIND_PEAK.along}`);
  assert.equal(WIND_PEAK.side, Number(side[1]));
  assert.equal(share, Number(BEAT_SHARE.toFixed(3)), 'the shader takes another share of the sway for the beat than config.js says');
  assert.equal(BEAT_SHARE, FOREST.wind.beatAmplitudeDeg / FOREST.wind.maxSwayDeg);
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
  test(before === undefined ? `${group}: within 3 degrees with the beat` : `${group}: within the ${before} degrees it had before the beat`, () => {
    const peak = leanDegrees(slope, true);
    if (before === undefined) {
      assert.ok(peak <= 3, `${group} leans ${peak.toFixed(3)} degrees at full wind on the beat: over the style guide's 3`);
    } else {
      assert.ok(before > 3, `${group} is listed as having leaned past 3 before the beat, at ${before}`);
      assert.ok(peak <= before * GEOMETRY_ALLOWANCE, `${group} leans ${peak.toFixed(3)} degrees on the beat, over the ${before} it had without it: the beat must take a share of its sway, not add to it`);
    }
    // and it still moves with the beat: a rule met by flattening the plants would defeat the owner's request
    const beat = peak - leanDegrees(slope, false);
    if (slope > 0) assert.ok(beat >= MIN_BEAT, `${group} gains only ${beat.toFixed(2)} degrees on the beat`);
  });
}
