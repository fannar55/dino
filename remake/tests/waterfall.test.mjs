import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWaterfall, rainbowLevel, SPRAY_REACH } from '../world/props/waterfall.js';
import { createRoute, FALLS } from '../chapters/kafli4-route.js';
import { sunDirection } from '../engine/lighting.js';

// Árdalurinn's falls (chapter 4): 40 m from the lip to the plunge pool, the water leaving the lip eastward.
const SPEC = { top: [FALLS.face, FALLS.top, FALLS.z], bottom: [FALLS.face, FALLS.base, FALLS.z], width: FALLS.width, seed: 9 };
const SUN = sunDirection({ sun: { azimuth: 215, elevation: 22 } }); // earlyAfternoon's (Task 10): behind the cliff, low in the west
const stage = () => {
  const camera = new THREE.PerspectiveCamera(52, 1.6, 0.1, 3000);
  const scene = new THREE.Scene();
  scene.add(camera);
  return { scene, camera };
};
// the camera at `from`, looking along `dir`
const aim = (camera, from, dir) => {
  camera.position.set(...from);
  camera.lookAt(new THREE.Vector3(...from).add(new THREE.Vector3(...dir)));
  camera.updateMatrixWorld();
};
const turned = (v, axis, deg) => v.clone().applyAxisAngle(axis, THREE.MathUtils.degToRad(deg));
const drawn = group => {
  const list = [];
  group.traverseVisible(o => { if (o.isMesh || o.isPoints || o.isLine) list.push(o); });
  return list;
};
const trianglesOf = o => (o.isMesh ? (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 : 0);

test('the waterfall draws in at most 6 calls and 20k triangles: the falling water, the spray, the rainbow and the foam', () => {
  const world = stage();
  const falls = createWaterfall(world, SPEC);
  aim(world.camera, [FALLS.face + 60, 30, FALLS.z], [-1, 0, 0]);
  falls.update(0, SUN);
  assert.equal(falls.group.parent, world.scene, 'it puts itself in the scene');
  const all = [];
  falls.group.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) all.push(o); });
  assert.ok(all.length <= 6, `${all.length} draw calls`);
  const triangles = all.reduce((sum, o) => sum + trianglesOf(o), 0);
  assert.ok(triangles <= 20000, `${triangles} triangles`);
  for (const part of ['water', 'spray', 'rainbow', 'foam']) {
    assert.ok(all.some(o => o.name.toLowerCase().includes(part)), `it has its ${part}`);
  }
  assert.ok(all.filter(o => o.isPoints).length >= 1, 'the spray is glints (world/props/sparkles.js)');
  falls.dispose();
  assert.equal(falls.group.parent, null, 'dispose takes it out of the scene');
});

test('the water falls in front of the cliff, and the climb up the falls stays clear of it', () => {
  const world = stage();
  const falls = createWaterfall(world, SPEC);
  for (let y = FALLS.base; y <= FALLS.top - 0.5; y += 0.5) {
    const x = falls.curtainAt(y);
    assert.ok(x > FALLS.face + 0.2, `at ${y} m the water is in front of the face (x ${x.toFixed(2)})`);
    assert.ok(x < FALLS.face + 4, `and leans out no more than 4 m (${(x - FALLS.face).toFixed(2)} m at ${y} m)`);
    if (y > FALLS.base) assert.ok(falls.curtainAt(y - 0.5) >= x - 1e-9, 'the lower, the further out');
  }
  // her body on the climb (chapter 4's route), from where she meets the falling water to the lip, is 2.5 m or more clear of it
  const route = createRoute();
  const p = new THREE.Vector3();
  for (let t = 109; t <= 117; t += 0.05) {
    route.pointAt(route.progressAt(t), p);
    if (p.y < FALLS.base + 4 || p.y > FALLS.top || Math.abs(p.z - FALLS.z) > FALLS.width) continue;
    const clear = p.x - falls.curtainAt(p.y);
    assert.ok(clear >= 2.5, `at ${t.toFixed(2)} s she is ${clear.toFixed(2)} m from the water (y ${p.y.toFixed(1)})`);
  }
  falls.dispose();
});

test('the spray is thickest at the foot of the falls and gone 30 m from it', () => {
  const world = stage();
  const falls = createWaterfall(world, SPEC);
  const foot = falls.base.clone();
  assert.ok(Math.abs(falls.sprayLevel(foot) - 1) < 1e-9, `${falls.sprayLevel(foot)} at the foot`);
  assert.equal(SPRAY_REACH, 30);
  for (const dir of [[1, 0, 0], [0, 1, 0], [0.6, 0.8, 0], [0, 0, 1]]) {
    const way = new THREE.Vector3(...dir).normalize();
    let last = 1;
    for (let d = 1; d <= 30; d += 1) {
      const level = falls.sprayLevel(foot.clone().addScaledVector(way, d + (dir[2] ? FALLS.width * 0.6 : 0))); // across: from past the edge of the water
      assert.ok(level <= last + 1e-9, `it thins with distance (${level} after ${last} at ${d} m along ${dir})`);
      assert.ok(level >= 0 && level <= 1);
      last = level;
    }
    assert.equal(last, 0, `none 30 m along ${dir}`);
  }
  const half = falls.sprayLevel(foot.clone().add(new THREE.Vector3(15, 0, 0)));
  assert.ok(half > 0.1 && half < 0.9, `${half} halfway`);
  falls.dispose();
});

test('the rainbow is there only when the sun is behind the camera, within 50 degrees of the way it looks', () => {
  const anti = SUN.clone().negate();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(anti, up).normalize();
  assert.equal(rainbowLevel(anti, SUN), 1, 'looking straight away from the sun');
  assert.equal(rainbowLevel(turned(anti, side, 30), SUN), 1, '30 degrees off');
  assert.equal(rainbowLevel(turned(anti, up, -35), SUN), 1, '35 degrees off to the side');
  const fading = rainbowLevel(turned(anti, side, 46), SUN);
  assert.ok(fading > 0 && fading < 1, `fading by 46 degrees (${fading})`);
  assert.equal(rainbowLevel(turned(anti, side, 50.5), SUN), 0, 'gone past 50 degrees');
  assert.equal(rainbowLevel(turned(anti, up, 90), SUN), 0, 'gone looking across the sun');
  assert.equal(rainbowLevel(SUN, SUN), 0, 'gone looking into the sun');
  assert.equal(rainbowLevel(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.3, -0.2, 0.9).normalize()), 0, 'none with the sun down');

  // in the scene: the bow shows with the sun behind the camera and fades, never pops, when the camera turns to face the sun
  const world = stage();
  const falls = createWaterfall(world, SPEC);
  const behind = [FALLS.face - 30, FALLS.top + 25, FALLS.z - 30];
  aim(world.camera, behind, anti.toArray());
  falls.update(110, SUN); // a jump (the first frame, or a seek) shows it at once
  assert.equal(falls.rainbow.level, 1);
  assert.equal(falls.rainbow.mesh.visible, true);
  aim(world.camera, behind, SUN.toArray());
  let last = falls.rainbow.level;
  let t = 110;
  for (let i = 0; i < 120; i++) {
    t += 1 / 60;
    falls.update(t, SUN);
    const level = falls.rainbow.level;
    assert.ok(Math.abs(level - last) <= 0.15 * 0.25 + 1e-9, `a frame changes it by ${Math.abs(level - last).toFixed(3)}`);
    last = level;
  }
  assert.equal(falls.rainbow.level, 0, 'gone after two seconds facing the sun');
  assert.equal(falls.rainbow.mesh.visible, false, 'and not drawn');
  falls.dispose();
});

test('nothing flashes: the spray\'s light changes by at most 15 % a frame, through a cut from the falls\' face to into the sun', () => {
  const world = stage();
  const falls = createWaterfall(world, SPEC);
  const sets = drawn(falls.group).filter(o => o.isPoints);
  // each glint's light as the shader has it (world/props/sparkles.js: fades in over a tenth of its life, out as 1 - t^2)
  const light = set => {
    const { birth } = set.geometry.attributes;
    const { uTime, uLife } = set.material.uniforms;
    let sum = 0;
    for (let i = 0; i < birth.count; i++) {
      const age = uTime.value - birth.getX(i);
      if (age < 0 || age > uLife.value) continue;
      const k = age / uLife.value;
      sum += Math.min(1, k * 10) * (1 - k * k);
    }
    return sum;
  };
  aim(world.camera, [FALLS.face + 40, 25, FALLS.z + 10], [-1, 0.1, -0.2]);
  let t = 100;
  falls.update(t, SUN);
  let before = sets.map(light);
  let gain = falls.spray.gain;
  for (let i = 1; i < 60 * 8; i++) {
    if (i === 60 * 3) aim(world.camera, [FALLS.face + 25, 30, FALLS.z], SUN.toArray()); // the cut: now straight into the sun through the spray
    t += 1 / 60;
    falls.update(t, SUN);
    const now = sets.map(light);
    now.forEach((v, k) => {
      const ratio = v / before[k];
      assert.ok(ratio > 0.85 && ratio < 1.15, `set ${k} at ${t.toFixed(2)} s: ${before[k].toFixed(2)} -> ${v.toFixed(2)}`);
    });
    const g = falls.spray.gain;
    assert.ok(g / gain > 0.85 && g / gain < 1.15, `the spray's glow at ${t.toFixed(2)} s: ${gain.toFixed(3)} -> ${g.toFixed(3)}`);
    before = now;
    gain = g;
  }
  assert.ok(falls.spray.gain > 1.2, `the spray glows with the sun through it (${falls.spray.gain.toFixed(2)})`);
  falls.dispose();
});
