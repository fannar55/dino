// The light looks (engine/looks.js). Chapter 4's earlyAfternoon: the sun lower and further round than chapter 2's late morning,
// warmer, and the rest 40 % of the way from lateMorning toward golden (spec 2: "snemma síðdegis").
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOOKS, pickLook, blendLooks } from '../engine/looks.js';

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); // sRGB 0..1, as written
const between = (value, a, b, k) => Math.abs(value - (a + (b - a) * k));

test('earlyAfternoon: the sun at 215 deg and 22 deg, warmer, and the rest 40 % from lateMorning toward golden', () => {
  const look = pickLook('earlyAfternoon');
  const { lateMorning: from, golden: to } = LOOKS;
  assert.equal(look, LOOKS.earlyAfternoon);
  assert.equal(look.sun.azimuth, 215);
  assert.equal(look.sun.elevation, 22);
  assert.ok(look.sun.elevation < from.sun.elevation, 'lower than lateMorning');
  const warmth = hex => { const [r, , b] = rgb(hex); return r - b; };
  assert.ok(warmth(look.sun.color) > warmth(from.sun.color), `${look.sun.color} warmer than ${from.sun.color}`);
  assert.ok(warmth(look.sun.color) < warmth(to.sun.color), `and not as warm as golden's ${to.sun.color}`);
  // every colour and number but the sun's place: 40 % of the way
  const pairs = [
    ['hemi.sky'], ['hemi.ground'], ['hemi.intensity'], ['sky.zenith'], ['sky.horizon'], ['sky.glow'], ['sky.cloud'], ['sky.cloudShade'],
    ['sky.cloudCover'], ['fog.color'], ['fog.sunColor'], ['fog.sunStrength'], ['fog.density'], ['fog.heightFalloff'], ['exposure'],
    ['envIntensity'], ['sun.color'], ['sun.intensity'],
  ];
  const get = (o, path) => path.split('.').reduce((v, k) => v[k], o);
  for (const [path] of pairs) {
    const [a, b, v] = [get(from, path), get(to, path), get(look, path)];
    if (typeof v === 'number') assert.ok(between(v, a, b, 0.4) < 1e-9, `${path}: ${v} (from ${a} to ${b})`);
    else rgb(v).forEach((c, i) => assert.ok(between(c, rgb(a)[i], rgb(b)[i], 0.4) <= 1 / 255, `${path}: ${v} (from ${a} to ${b})`));
  }
});

test('blendLooks mixes two looks: the ends are the looks themselves', () => {
  const at0 = blendLooks(LOOKS.lateMorning, LOOKS.golden, 0);
  const at1 = blendLooks(LOOKS.lateMorning, LOOKS.golden, 1);
  assert.equal(new THREE.Color(at0.fog.color).getHexString(), new THREE.Color(LOOKS.lateMorning.fog.color).getHexString());
  assert.equal(new THREE.Color(at1.sky.glow).getHexString(), new THREE.Color(LOOKS.golden.sky.glow).getHexString());
  assert.equal(at1.hemi.intensity, LOOKS.golden.hemi.intensity);
  assert.equal(at0.sun.azimuth, LOOKS.lateMorning.sun.azimuth);
});

// Chapter 6's (its spec 2): the low sun of the climb, the red gold of the slope, the white inside the cloud, and the sunset over the
// sea of cloud at the top; one fixed sun for all four, low in the west-south-west.
test('the four looks have every field morning has, and one sun', () => {
  for (const name of ['lowSun', 'redGold', 'inCloud', 'sunset']) {
    assert.deepEqual(Object.keys(LOOKS[name]).sort(), Object.keys(LOOKS.morning).sort(), name);
    for (const part of ['sun', 'hemi', 'sky', 'fog']) assert.deepEqual(Object.keys(LOOKS[name][part]).sort(), Object.keys(LOOKS.morning[part]).sort(), `${name}.${part}`);
    assert.deepEqual([LOOKS[name].sun.azimuth, LOOKS[name].sun.elevation], [215, 10], name);
  }
  assert.equal(LOOKS.inCloud.fog.color, LOOKS.inCloud.sky.horizon);
  assert.equal(LOOKS.inCloud.sky.zenith, '#f1f3f0');
  assert.equal(LOOKS.inCloud.fog.color, '#f1f3f0');
  assert.deepEqual([LOOKS.inCloud.sun.intensity, LOOKS.inCloud.hemi.intensity], [1.2, 0.95]);
  assert.equal(LOOKS.sunset.fog.density, 0.004);
  assert.equal(LOOKS.sunset.sky.horizon, LOOKS.evening.sky.horizon);
  const lowSun = blendLooks(LOOKS.goldenAfternoon, LOOKS.evening, 0.35);
  const redGold = blendLooks(LOOKS.goldenAfternoon, LOOKS.evening, 0.65);
  assert.equal(LOOKS.lowSun.sky.glow, lowSun.sky.glow);
  assert.equal(LOOKS.lowSun.fog.density, lowSun.fog.density);
  assert.equal(LOOKS.redGold.sun.color, redGold.sun.color);
});
