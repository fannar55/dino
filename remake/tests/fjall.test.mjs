// The mountain (world/fjall): its three stages in grey (the slope, the belt of cloud, the top) and the cloud that thickens with the
// prints and blows away from her roar (cloud.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOOKS } from '../engine/looks.js';
import { easeLight } from '../engine/light-blend.js';
import { CLOUD, densityAt, createCloud } from '../world/fjall/cloud.js';
import { FJALL, createSlope, createBelt, createTop } from '../world/fjall/index.js';
import { lightWorld } from './light-world.mjs';

const DT = 1 / 30;
const run = (cloud, seconds) => { for (let t = 0; t < seconds - 1e-9; t += DT) cloud.update(DT, t); };
const world = () => ({ ...lightWorld(LOOKS.lowSun), clock: { time: 0 }, heightAt: () => 0, camera: new THREE.PerspectiveCamera(45, 1.6, 0.1, 1200) });
// six prints about 9 m apart along a gentle path from the origin (the chapter's come from kafli6-route.js)
const PRINTS = Array.from({ length: 6 }, (_, i) => {
  const along = 4 + i * 9, bend = Math.sin(i * 0.6) * 2;
  return { position: [along, bend + (i % 2 ? 0.8 : -0.8)], heading: Math.atan2(Math.cos(i * 0.6) * 0.12, 1), foot: i % 2 ? 'left' : 'right' };
});

test('densityAt: level 0 sees about 115 m, level 1 about 13 m (where the fog is nine tenths)', () => {
  assert.equal(densityAt(0), CLOUD.density[0]);
  assert.equal(densityAt(1), CLOUD.density[1]);
  const sight = level => Math.log(10) / densityAt(level);
  assert.ok(Math.abs(sight(0) - 115) < 5, `${sight(0)}`);
  assert.ok(Math.abs(sight(1) - 13.5) < 1, `${sight(1)}`);
  assert.ok(densityAt(0.25) < densityAt(0.5) && densityAt(0.5) < densityAt(1));
  assert.equal(densityAt(-1), densityAt(0));
  assert.equal(densityAt(2), densityAt(1));
});

test('the cloud reaches its level in the asked seconds and the fog\'s density is densityAt(level)', () => {
  const w = world();
  const cloud = createCloud(w, { radius: 60 });
  cloud.setLevel(0.5, 2);
  run(cloud, 1);
  assert.ok(cloud.level > 0 && cloud.level < 0.5, `half way through: ${cloud.level}`);
  run(cloud, 1.05);
  assert.equal(cloud.level, 0.5);
  assert.ok(Math.abs(w.scene.fog.density - densityAt(0.5)) < 1e-9);
  cloud.setLevel(1); // CLOUD.ease
  run(cloud, CLOUD.ease + DT);
  assert.equal(cloud.level, 1);
  assert.ok(Math.abs(w.scene.fog.density - densityAt(1)) < 1e-9);
  cloud.setLevel(0.25, 0); // at once
  assert.equal(cloud.level, 0.25);
  assert.ok(Math.abs(w.scene.fog.density - densityAt(0.25)) < 1e-9);
  cloud.dispose();
});

test('the cloud is as thick after ten seconds without an update as before', () => {
  const w = world();
  const cloud = createCloud(w);
  cloud.setLevel(0.75, 1);
  run(cloud, 0.5);
  const [level, density] = [cloud.level, w.scene.fog.density];
  // the game held (a pause, the book open): ten seconds go by and nothing updates it
  assert.equal(cloud.level, level);
  assert.equal(w.scene.fog.density, density);
  // and the look eased while it holds the fog changes the fog's colour, never its density
  const ease = easeLight(w, LOOKS.inCloud, 1);
  for (let i = 0; i < 40; i++) w.effects.update(DT);
  assert.equal(ease.done, true);
  assert.equal(w.scene.fog.density, density);
  cloud.update(0, 0);
  assert.equal(w.scene.fog.density, density);
  cloud.dispose();
});

test('blowAway brings the level to 0 within CLOUD.blow and the cards fly out from `from`; reduced: they only fade', () => {
  for (const reduced of [false, true]) {
    const w = world();
    const cloud = createCloud(w, { reduced });
    cloud.setLevel(1, 0);
    const from = new THREE.Vector3(3, 0, -2);
    const handle = cloud.blowAway({ from });
    assert.equal(handle.done, false);
    run(cloud, 0.2);
    const ring = () => cloud.cards.filter(c => c.kind === 'ring' && c.alive);
    assert.ok(ring().length >= 12, `a ring of cards: ${ring().length}`);
    const out = cards => cards.map(c => Math.hypot(c.x - from.x, c.z - from.z));
    const early = out(ring());
    const opacityEarly = ring().reduce((sum, c) => sum + c.opacity, 0);
    run(cloud, 1.2);
    const later = out(ring());
    const opacityLater = ring().reduce((sum, c) => sum + c.opacity, 0);
    if (reduced) {
      early.forEach((d, i) => assert.ok(Math.abs(later[i] - d) < 1e-9, 'no card moves'));
      assert.ok(opacityLater < opacityEarly, 'they fade');
    } else {
      early.forEach((d, i) => assert.ok(later[i] > d + 5, `card ${i} flies out: ${d} -> ${later[i]}`));
    }
    run(cloud, CLOUD.blow - 1.4 + DT);
    assert.equal(handle.done, true);
    assert.equal(cloud.level, 0);
    assert.ok(Math.abs(w.scene.fog.density - LOOKS.sunset.fog.density) < 1e-9, 'the clear air of the sunset');
    run(cloud, 3);
    assert.equal(ring().length, 0, 'gone once it is over');
    cloud.dispose();
  }
});

test('the moving cards: a swirl, the lift over a print and the golden glow; reduced, the swirl brightens and does not turn', () => {
  for (const reduced of [false, true]) {
    const w = world();
    const cloud = createCloud(w, { reduced });
    cloud.setLevel(0.5, 0);
    cloud.swirlAt(new THREE.Vector3(5, 0, 0));
    run(cloud, 0.1);
    const swirl = cloud.cards.filter(c => c.kind === 'swirl' && c.alive);
    assert.ok(swirl.length >= 1);
    const at = swirl.map(c => [c.x, c.z]);
    run(cloud, 0.5);
    const moved = swirl.some((c, i) => Math.hypot(c.x - at[i][0], c.z - at[i][1]) > 0.1);
    assert.equal(moved, !reduced);
    if (reduced) assert.ok(swirl.every(c => c.bright > 0), 'it brightens');
    cloud.liftAt(new THREE.Vector3(10, 0, 0));
    run(cloud, 0.6);
    assert.ok(w.scene.fog.density < densityAt(0.5), 'the cloud lifts a little as the print is counted');
    run(cloud, 3);
    assert.ok(Math.abs(w.scene.fog.density - densityAt(0.5)) < 1e-9, 'and closes again');
    cloud.glow(new THREE.Vector3(0, 3, -20), 1);
    run(cloud, 1);
    assert.ok(cloud.glowLevel > 0.9);
    cloud.glow(null, 0);
    run(cloud, 1.5);
    assert.ok(cloud.glowLevel < 0.01);
    cloud.dispose();
  }
});

test('dispose gives the fog back: the look\'s own density and colour', () => {
  const w = world();
  const cloud = createCloud(w);
  cloud.setLevel(1, 0);
  w.scene.fog.color.set(LOOKS.inCloud.fog.color);
  w.scene.add(cloud.group);
  cloud.dispose();
  assert.equal(w.scene.fog.density, LOOKS.lowSun.fog.density);
  assert.equal(w.scene.fog.color.getHex(), new THREE.Color(LOOKS.lowSun.fog.color).getHex());
  assert.equal(cloud.group.parent, null);
  assert.equal(w.scene.fog.userData.heldBy ?? null, null);
});

test('the belt\'s and the top\'s ground lies between 0 and 3 m; the slope\'s ledge is on the far land, east of the ridge', () => {
  const w = world();
  const belt = createBelt(w, { grey: true, prints: PRINTS });
  const top = createTop(w, { grey: true });
  for (const [place, reach] of [[belt, 60], [top, FJALL.top.radius]]) {
    for (let x = -reach; x <= reach; x += 3) {
      for (let z = -reach; z <= reach; z += 3) {
        if (Math.hypot(x, z) > reach) continue;
        const y = place.heightAt(x, z);
        assert.ok(y >= 0 && y <= 3, `${x}, ${z}: ${y}`);
      }
    }
    assert.ok(place.group.isObject3D);
    place.update(DT, 0);
  }
  assert.ok(belt.cloud && typeof belt.cloud.setLevel === 'function');
  assert.equal(belt.prints.targets.length, 6);
  assert.ok(top.heightAt(FJALL.top.radius + 60, 0) < FJALL.top.sea, 'the top falls away into the sea of cloud');
  const slope = createSlope(w, { grey: true });
  const [x, z] = slope.ledge;
  assert.ok(x > FJALL.ridge[0], 'east of the ridge');
  assert.ok(Math.hypot(x - FJALL.ridge[0], z - FJALL.ridge[1]) < 400);
  assert.ok(slope.far.shown, 'its far land shows');
  assert.ok(Math.abs(slope.heightAt(x, z) - slope.far.heightAt(x, z)) < 4, 'on the far land');
  assert.ok(slope.heightAt(x, z) >= slope.far.heightAt(x, z), 'and over it');
  slope.update(DT, 0);
  for (const place of [belt, top, slope]) place.dispose();
});
