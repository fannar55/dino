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
