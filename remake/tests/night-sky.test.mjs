import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLighting } from '../engine/lighting.js';
import { pickLook } from '../engine/looks.js';
import { addMosiCloud } from '../engine/sun-face.js';
import { createSky } from '../engine/sky.js';
import { createNightSky, skyDirection, skyPoint, NIGHT, SKY_DISTANCE } from '../engine/night-sky.js';
import { SKY } from '../chapters/hatid-route.js';

const deg = THREE.MathUtils.radToDeg;

/** A world as main.js builds it, as much of it as the night sky touches: the scene, the dome (no PMREM in Node) and the Mosi cloud. */
function world() {
  const look = pickLook('morning');
  const scene = new THREE.Scene();
  const lighting = createLighting(new THREE.Scene(), look, { shadowSize: 0 });
  const sky = createSky({ scene, look, sunDir: lighting.direction, environment: false });
  addMosiCloud({ scene, lighting, look, texture: null });
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 1200);
  camera.position.set(3, 1.5, -2);
  camera.lookAt(30, 30, 20);
  camera.updateMatrixWorld();
  return { scene, sky, camera };
}

const angle = (a, b) => deg(a.angleTo(b));
const lit = night => Array.from({ length: NIGHT.stars }, (_, i) => night.starAt(i)).filter(s => s.light > 0);

/** The points a Points object draws this frame: each with its direction from the group's middle, its colour and its alpha. */
function drawn(points) {
  const position = points.geometry.getAttribute('position');
  const colour = points.geometry.getAttribute('aColor');
  const size = points.geometry.getAttribute('aSize');
  const count = Math.min(points.geometry.drawRange.count, position.count);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = colour.getW(i);
    if (!(a > 0)) continue;
    out.push({
      direction: new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)).normalize(),
      rgb: [colour.getX(i), colour.getY(i), colour.getZ(i)],
      alpha: a,
      size: size.getX(i),
    });
  }
  return out;
}
const along = (from, to, u) => {
  const a = skyDirection(...from);
  const b = skyDirection(...to);
  return a.clone().applyAxisAngle(a.clone().cross(b).normalize(), a.angleTo(b) * u);
};

test('no star before many, one star at first, and the hundreds come out as many rises: over 500 lit at 1, the zenith\'s before the horizon\'s', () => {
  const w = world();
  const night = createNightSky(w);
  assert.equal(night.group.parent, w.scene);
  night.set({ dark: 1, first: 0, many: 0, time: 0 });
  assert.equal(lit(night).length, 0, 'nothing before the first star');

  night.set({ first: 1, many: 0 });
  const one = lit(night);
  assert.equal(one.length, 1, 'one star at first');
  assert.equal(one[0].index, 0, 'star 0 is the first');
  assert.ok(angle(one[0].direction, skyDirection(SKY.first.azimuth, SKY.first.elevation)) < 1e-6, 'the first star is at SKY.first');

  const counts = [0.15, 0.3, 0.6, 1].map(many => { night.set({ many }); return lit(night).map(s => s.index); });
  for (let k = 1; k < counts.length; k++) {
    assert.ok(counts[k].length > counts[k - 1].length, `more at ${[0.15, 0.3, 0.6, 1][k]}: ${counts.map(c => c.length)}`);
    assert.ok(counts[k - 1].every(i => counts[k].includes(i)), 'a star once out stays out as many rises');
  }
  assert.ok(counts[3].length > 500, `${counts[3].length} lit at 1`);

  // At 0.3 the high sky has come out more than the low sky has
  night.set({ many: 0.3 });
  const share = (lo, hi) => {
    const all = Array.from({ length: NIGHT.stars }, (_, i) => night.starAt(i)).filter(s => s.index > 0 && s.elevation >= lo && s.elevation < hi);
    return all.filter(s => s.light > 0).length / all.length;
  };
  assert.ok(share(60, 91) > 2 * share(NIGHT.low, 20), `zenith ${share(60, 91).toFixed(2)}, horizon ${share(NIGHT.low, 20).toFixed(2)}`);
  // and each star's moment: the mean moment of the high stars is earlier than of the low
  const mean = (lo, hi) => {
    const s = Array.from({ length: NIGHT.stars }, (_, i) => night.starAt(i)).filter(x => x.index > 0 && x.elevation >= lo && x.elevation < hi);
    return s.reduce((sum, x) => sum + x.at, 0) / s.length;
  };
  assert.ok(mean(60, 91) < mean(NIGHT.low, 20));
});

test('the same numbers are the same sky, whatever was set before', () => {
  const a = world();
  const b = world();
  const one = createNightSky(a);
  const two = createNightSky(b);
  one.set({ dark: 1, first: 1, many: 0.9, time: 3 });
  one.set({ dark: 0.2, first: 0.4, many: 0.1, time: 40 });
  one.set({ dark: 0.6, first: 0.8, many: 0.45, time: 7.5 });
  two.set({ dark: 0.6, first: 0.8, many: 0.45, time: 7.5 });
  for (let i = 0; i < NIGHT.stars; i++) assert.equal(one.starAt(i).light, two.starAt(i).light, `star ${i}`);
  const stars = night => night.group.getObjectByName('NightStars');
  assert.deepEqual(Array.from(stars(one).geometry.getAttribute('aColor').array), Array.from(stars(two).geometry.getAttribute('aColor').array));
  assert.deepEqual(Array.from(stars(one).geometry.getAttribute('position').array), Array.from(stars(two).geometry.getAttribute('position').array));
  assert.equal(stars(one).material.uniforms.uTime.value, stars(two).material.uniforms.uTime.value);
  assert.equal(a.sky.dome.material.uniforms.uCover.value, b.sky.dome.material.uniforms.uCover.value);
  assert.equal(a.scene.getObjectByName('MosiCloud').material.opacity, b.scene.getObjectByName('MosiCloud').material.opacity);
  // and the same seed is the same sky in another world
  const three = createNightSky(world());
  for (let i = 0; i < NIGHT.stars; i += 37) assert.ok(angle(one.starAt(i).direction, three.starAt(i).direction) < 1e-9);
  const other = createNightSky(world(), { seed: 8 });
  assert.ok(angle(one.starAt(5).direction, other.starAt(5).direction) > 1e-3, 'another seed, another sky');
});

test('no star lies in a cleared disc or under 6 degrees', () => {
  const clear = [
    ...Object.values(SKY.stars).map(({ azimuth, elevation }) => ({ azimuth, elevation, degrees: 4 })),
    { ...SKY.moon, degrees: 9 },
    { azimuth: 120, elevation: 40, degrees: 15 },
  ];
  const night = createNightSky(world(), { clear });
  assert.equal(NIGHT.low, 6);
  for (let i = 0; i < NIGHT.stars; i++) {
    const s = night.starAt(i);
    assert.ok(s.elevation >= NIGHT.low, `star ${i} at ${s.elevation}`);
    for (const c of clear) assert.ok(angle(s.direction, skyDirection(c.azimuth, c.elevation)) >= c.degrees, `star ${i} in a disc`);
  }
  // the default has the brief's numbers and SKY.first
  assert.deepEqual(NIGHT, { stars: 700, low: 6, shooting: 12, sparks: 40, bands: 3 });
  assert.equal(SKY_DISTANCE, 450);
});

test('a shooting star is on its way at u and has burst into its colour after it; twelve at once are drawn, a thirteenth is dropped', () => {
  const w = world();
  const night = createNightSky(w);
  const points = night.group.getObjectByName('NightShooting');
  const from = [10, 60];
  const to = [70, 25];
  assert.equal(night.shoot([{ from, to, u: 0.5, colour: '#ff60c0', burst: 0 }]), 1);
  let p = drawn(points);
  assert.ok(p.length > 1, 'a head and a tail');
  const head = p.reduce((best, x) => (x.size > best.size ? x : best));
  assert.ok(angle(head.direction, along(from, to, 0.5)) < 0.01, `the head is half-way: ${angle(head.direction, along(from, to, 0.5))}`);
  const way = skyDirection(...to).sub(skyDirection(...from));
  assert.ok(p.every(x => x === head || x.direction.dot(way) < head.direction.dot(way) + 1e-9), 'the tail is behind the head');
  assert.ok(p.every(x => angle(x.direction, along(from, to, 0.5)) < angle(skyDirection(...from), skyDirection(...to)) * 0.5 + 1e-6));

  night.shoot([{ from, to, u: 1, colour: '#ff60c0', burst: 0.5 }]);
  p = drawn(points);
  assert.equal(p.length, NIGHT.sparks, 'the sparks, the head gone');
  const pink = new THREE.Color('#ff60c0');
  for (const x of p) {
    assert.ok(Math.abs(x.rgb[0] - pink.r) < 1e-6 && Math.abs(x.rgb[1] - pink.g) < 1e-6 && Math.abs(x.rgb[2] - pink.b) < 1e-6, 'in its colour');
    assert.ok(angle(x.direction, skyDirection(...to)) < 8, 'about where it burst');
  }
  assert.ok(Math.max(...p.map(x => angle(x.direction, skyDirection(...to)))) > 1, 'spread out');
  const later = (night.shoot([{ from, to, u: 1, colour: '#ff60c0', burst: 0.9 }]), drawn(points));
  assert.ok(Math.max(...later.map(x => x.alpha)) < Math.max(...p.map(x => x.alpha)), 'fading');
  // the same index bursts the same way
  night.shoot([{ from, to, u: 1, colour: '#ff60c0', burst: 0.5 }]);
  assert.deepEqual(drawn(points).map(x => x.direction.toArray()), p.map(x => x.direction.toArray()));
  // burst over: nothing
  night.shoot([{ from, to, u: 1, colour: '#ff60c0', burst: 1 }]);
  assert.equal(drawn(points).length, 0);

  // thirteen at once: twelve are drawn, the thirteenth is not
  const list = Array.from({ length: 13 }, (_, k) => ({ from: [k * 25, 50], to: [k * 25 + 20, 30], u: 0.6, colour: '#80ffd0', burst: 0 }));
  assert.equal(night.shoot(list), NIGHT.shooting);
  p = drawn(points);
  const heads = list.map(s => p.some(x => angle(x.direction, along(s.from, s.to, s.u)) < 0.01));
  assert.deepEqual(heads, [...Array(12).fill(true), false]);
  list[1].burst = 0.3;
  list[1].u = 1;
  list[4].burst = 0.6;
  list[4].u = 1;
  night.shoot(list);
  assert.ok(drawn(points).length >= 2 * NIGHT.sparks + 10, 'two bursting among the twelve');
  // nothing moves by itself: the same frame until it is told again
  const before = drawn(points);
  night.update(w.camera);
  night.set({ time: 99 });
  assert.deepEqual(drawn(points).map(x => x.direction.toArray()), before.map(x => x.direction.toArray()));
  night.shoot([]);
  assert.equal(drawn(points).length, 0);
  assert.equal(points.visible, false);
});

test('reduced: a burst is one glow, and the northern lights are the same at two times', () => {
  const night = createNightSky(world(), { reduced: true });
  const points = night.group.getObjectByName('NightShooting');
  night.shoot([{ from: [10, 60], to: [70, 25], u: 1, colour: '#ffd36b', burst: 0.3 }]);
  const early = drawn(points);
  assert.equal(early.length, 1, 'one glow');
  assert.ok(angle(early[0].direction, skyDirection(70, 25)) < 1e-6, 'where it burst');
  night.shoot([{ from: [10, 60], to: [70, 25], u: 1, colour: '#ffd36b', burst: 0.8 }]);
  assert.ok(drawn(points)[0].alpha < early[0].alpha, 'that fades');

  const ribbons = night.group.getObjectByName('NightLights');
  const picture = () => [Array.from(ribbons.geometry.getAttribute('position').array), Array.from(ribbons.geometry.getAttribute('aColor').array)];
  night.aurora(1, 2);
  const a = picture();
  night.aurora(1, 9.5);
  assert.deepEqual(picture(), a, 'still');
  // and without reduced they wave
  const moving = createNightSky(world());
  const lights = moving.group.getObjectByName('NightLights');
  moving.aurora(1, 2);
  const b = Array.from(lights.geometry.getAttribute('position').array);
  moving.aurora(1, 9.5);
  assert.notDeepEqual(Array.from(lights.geometry.getAttribute('position').array), b, 'waving');
  // high over the whole sky: every bearing has light over 20 degrees
  const pos = lights.geometry.getAttribute('position');
  const bearings = new Set();
  for (let i = 0; i < pos.count; i++) {
    const d = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    assert.ok(deg(Math.asin(d.y)) > 15, 'high');
    bearings.add(Math.floor((deg(Math.atan2(d.z, d.x)) + 180) / 30) % 12);
  }
  assert.equal(bearings.size, 12, 'all round');
  assert.equal(NIGHT.bands, 3);
});

test('the sky hangs from the camera: it is where it was on the screen after the camera has moved 40 m', () => {
  const w = world();
  const night = createNightSky(w);
  night.set({ dark: 1, first: 1, many: 1, time: 1 });
  night.shoot([{ from: [20, 55], to: [60, 30], u: 0.4, colour: '#ffffff', burst: 0 }]);
  night.aurora(1, 0);
  night.update(w.camera);
  w.scene.updateMatrixWorld(true);
  const screen = () => {
    const out = [];
    for (const i of [0, 1, 50, 300, 699]) out.push(night.starAt(i).position.clone().project(w.camera));
    const head = night.group.getObjectByName('NightShooting');
    out.push(new THREE.Vector3().fromBufferAttribute(head.geometry.getAttribute('position'), 0).applyMatrix4(head.matrixWorld).project(w.camera));
    const ribbon = night.group.getObjectByName('NightLights');
    out.push(new THREE.Vector3().fromBufferAttribute(ribbon.geometry.getAttribute('position'), 7).applyMatrix4(ribbon.matrixWorld).project(w.camera));
    return out;
  };
  const before = screen();
  assert.ok(Math.abs(night.starAt(1).position.distanceTo(w.camera.position) - SKY_DISTANCE) < 1e-6);
  w.camera.position.add(new THREE.Vector3(40, 0, 0));
  w.camera.updateMatrixWorld();
  night.update(w.camera);
  w.scene.updateMatrixWorld(true);
  const after = screen();
  before.forEach((v, k) => {
    assert.ok(Math.abs(v.x - after[k].x) < 1e-6 && Math.abs(v.y - after[k].y) < 1e-6, `point ${k} moved on the screen`);
  });
  // skyPoint is the same live point
  const p = skyPoint(w.camera, 30, 50);
  assert.ok(p.clone().sub(w.camera.position).sub(skyDirection(30, 50).multiplyScalar(SKY_DISTANCE)).length() < 1e-9);
  assert.ok(Math.abs(skyDirection(30, 50).length() - 1) < 1e-12);
  const out = new THREE.Vector3();
  assert.equal(skyDirection(-145, 10, out), out);
  assert.ok(Math.abs(deg(Math.atan2(out.z, out.x)) + 145) < 1e-9 && Math.abs(deg(Math.asin(out.y)) - 10) < 1e-9, 'the bearings of the route');
});

test('three draw calls, and restore leaves the dome\'s cover and the Mosi cloud as they were', () => {
  const w = world();
  const cover = w.sky.dome.material.uniforms.uCover.value;
  const cloud = w.scene.getObjectByName('MosiCloud');
  const opacity = cloud.material.opacity;
  const night = createNightSky(w);
  night.set({ dark: 1, first: 1, many: 1, time: 0 });
  night.shoot([{ from: [20, 55], to: [60, 30], u: 1, colour: '#ffffff', burst: 0.2 }]);
  night.aurora(1, 0);
  const calls = [];
  night.group.traverse(o => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) calls.push(o); });
  assert.equal(calls.length, 3);
  for (const o of calls) {
    assert.equal(o.material.fog, false, `${o.name} fogged`);
    assert.equal(o.material.toneMapped, false, `${o.name} tone mapped`);
    assert.equal(o.material.depthWrite, false);
    assert.equal(o.material.depthFunc, THREE.LessEqualDepth, 'at the far plane, as the sun is');
  }
  const meshes = calls.filter(o => o.isMesh);
  assert.deepEqual(meshes.map(o => o.name), ['NightLights'], 'no triangles but the ribbons\'');
  // the dark has thinned the clouds to none and faded the Mosi cloud
  assert.ok(w.sky.dome.material.uniforms.uCover.value > 1.2, 'no cloud is over the cover');
  assert.equal(cloud.material.opacity, 0);
  night.set({ dark: 0.5 });
  assert.ok(cloud.material.opacity > 0 && cloud.material.opacity < opacity);
  night.restore();
  assert.equal(w.sky.dome.material.uniforms.uCover.value, cover);
  assert.equal(cloud.material.opacity, opacity);
  // nothing to show, nothing drawn
  const empty = createNightSky(world());
  const shown = [];
  empty.group.traverse(o => { if ((o.isMesh || o.isPoints) && o.visible) shown.push(o); });
  assert.equal(shown.length, 0);
  night.dispose();
  assert.equal(night.group.parent, null);
  assert.equal(w.sky.dome.material.uniforms.uCover.value, cover);
});
