// The light between places (engine/light-blend.js): a look set while the game runs, at once (lightTo) or eased (easeLight).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOOKS } from '../engine/looks.js';
import { lightTo, easeLight } from '../engine/light-blend.js';
import { createEffects } from '../engine/effects.js';
import { sunDirection } from '../engine/lighting.js';

/** A world as main.js makes one, its light from `look`: the sun and the fill, the fog, the sky's uniforms, the exposure. */
export function lightWorld(look = LOOKS.lowSun) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(look.fog.color, look.fog.density);
  const sun = new THREE.DirectionalLight(look.sun.color, look.sun.intensity);
  sun.position.copy(sunDirection(look)).multiplyScalar(40);
  const hemi = new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity);
  const c = hex => new THREE.Color(hex);
  const uniforms = {
    uZenith: { value: c(look.sky.zenith) }, uHorizon: { value: c(look.sky.horizon) }, uGlow: { value: c(look.sky.glow) },
    uCloud: { value: c(look.sky.cloud) }, uCloudShade: { value: c(look.sky.cloudShade) }, uFogColor: { value: c(look.fog.color) },
    uFogSun: { value: c(look.fog.sunColor) }, uSunDir: { value: sunDirection(look) }, uCover: { value: look.sky.cloudCover },
    uFogSunStrength: { value: look.fog.sunStrength },
  };
  return {
    scene, look, effects: createEffects(),
    lighting: { sun, hemi, direction: sunDirection(look) },
    sky: { dome: { material: { uniforms } } },
    renderer: { toneMappingExposure: look.exposure },
  };
}

const near = (a, b, d = 1e-6) => Math.abs(a - b) <= d;
/** How far colour `a` is from hex `b`, 0 to 1 (the largest channel's difference, in sRGB). */
const off = (a, b) => {
  const x = {}, y = {};
  a.getRGB(x, THREE.SRGBColorSpace);
  new THREE.Color(b).getRGB(y, THREE.SRGBColorSpace);
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
};

test('lightTo sets the sun, the hemisphere, the fog and the sky to the look and leaves the sun where it is', () => {
  const world = lightWorld(LOOKS.lowSun);
  const where = world.lighting.sun.position.clone();
  const dir = world.sky.dome.material.uniforms.uSunDir.value.clone();
  const cover = world.sky.dome.material.uniforms.uCover.value;
  const look = LOOKS.inCloud;
  lightTo(world, look);
  const { sun, hemi } = world.lighting;
  const u = world.sky.dome.material.uniforms;
  assert.ok(off(sun.color, look.sun.color) < 1e-3);
  assert.equal(sun.intensity, look.sun.intensity);
  assert.ok(off(hemi.color, look.hemi.sky) < 1e-3 && off(hemi.groundColor, look.hemi.ground) < 1e-3);
  assert.equal(hemi.intensity, look.hemi.intensity);
  assert.ok(off(world.scene.fog.color, look.fog.color) < 1e-3);
  assert.equal(world.scene.fog.density, look.fog.density);
  for (const [name, key] of [['uZenith', 'zenith'], ['uHorizon', 'horizon'], ['uGlow', 'glow'], ['uCloud', 'cloud'], ['uCloudShade', 'cloudShade']]) {
    assert.ok(off(u[name].value, look.sky[key]) < 1e-3, name);
  }
  assert.ok(off(u.uFogColor.value, look.fog.color) < 1e-3 && off(u.uFogSun.value, look.fog.sunColor) < 1e-3);
  assert.equal(u.uFogSunStrength.value, look.fog.sunStrength);
  assert.equal(world.renderer.toneMappingExposure, look.exposure);
  // and nothing else: the sun's place, the sky's sun and its cloud cover
  assert.ok(sun.position.equals(where));
  assert.ok(u.uSunDir.value.equals(dir));
  assert.equal(u.uCover.value, cover);
  assert.equal(world.lightLook, look);
});

test('easeLight is half way after half its seconds, there at the end, and stands still with no update', () => {
  const world = lightWorld(LOOKS.lowSun);
  const from = LOOKS.lowSun, to = LOOKS.sunset;
  const handle = easeLight(world, to, 4);
  assert.equal(handle.done, false);
  for (let i = 0; i < 60; i++) world.effects.update(1 / 30); // 2 s
  assert.ok(near(world.lighting.sun.intensity, (from.sun.intensity + to.sun.intensity) / 2, 1e-6), `${world.lighting.sun.intensity}`);
  assert.ok(near(world.scene.fog.density, (from.fog.density + to.fog.density) / 2, 1e-6));
  assert.ok(near(world.renderer.toneMappingExposure, (from.exposure + to.exposure) / 2, 1e-6));
  const mid = new THREE.Color(from.fog.color).lerp(new THREE.Color(to.fog.color), 0.5);
  for (const k of ['r', 'g', 'b']) assert.ok(near(world.scene.fog.color[k], mid[k], 1e-6), k);
  // nobody updates it for a while: it stands where it is
  const held = world.lighting.sun.intensity;
  assert.equal(world.lighting.sun.intensity, held);
  assert.equal(handle.done, false);
  for (let i = 0; i < 61; i++) world.effects.update(1 / 30);
  assert.equal(handle.done, true);
  assert.equal(world.lighting.sun.intensity, to.sun.intensity);
  assert.equal(world.scene.fog.density, to.fog.density);
  assert.ok(off(world.sky.dome.material.uniforms.uHorizon.value, to.sky.horizon) < 1e-3);
  assert.equal(world.effects.size, 0);
});

test('a newer easeLight takes over from the one before, from where the light is', () => {
  const world = lightWorld(LOOKS.lowSun);
  const first = easeLight(world, LOOKS.sunset, 4);
  for (let i = 0; i < 30; i++) world.effects.update(1 / 30);
  const at = world.lighting.sun.intensity;
  const second = easeLight(world, LOOKS.inCloud, 2);
  assert.equal(first.done, true, 'the older one is done (its waiters go on)');
  world.effects.update(0);
  assert.ok(near(world.lighting.sun.intensity, at, 1e-9), 'no jump');
  for (let i = 0; i < 61; i++) world.effects.update(1 / 30);
  assert.equal(second.done, true);
  assert.equal(world.lighting.sun.intensity, LOOKS.inCloud.sun.intensity);
});

test('easeLight with no seconds is lightTo, done at once; a world without a part is left alone there', () => {
  const world = lightWorld(LOOKS.lowSun);
  assert.equal(easeLight(world, LOOKS.redGold, 0).done, true);
  assert.equal(world.lighting.sun.intensity, LOOKS.redGold.sun.intensity);
  const bare = { scene: new THREE.Scene(), effects: createEffects() };
  lightTo(bare, LOOKS.sunset); // no lights, fog, sky or renderer: nothing to set, nothing thrown
  const h = easeLight(bare, LOOKS.inCloud, 1);
  for (let i = 0; i < 31; i++) bare.effects.update(1 / 30);
  assert.equal(h.done, true);
});
