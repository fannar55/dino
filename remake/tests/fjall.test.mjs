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
import { readFileSync } from 'node:fs';
import { createRoute, FALLS } from '../chapters/kafli4-route.js';
import { SHOTS } from '../chapters/kafli6-route.js';

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

// ---- Task 8: the stages for real -------------------------------------------------------------------------------------

const LENGTHS = { thorsedla: 22, kambedla: 7, uggedla: 14, sloedla: 7.5, flugedla: 7.5, gramedla: 12 }; // STYLE.md section 3

test('from view_east the pool, the falls, the Fen and the glade are in frame, wide and upright, with no ground in between', () => {
  const w = world();
  const slope = createSlope(w, { grey: true });
  const shot = SHOTS.hlid.view_east;
  const camera = new THREE.PerspectiveCamera(shot.fov, 1280 / 800, 0.1, 6000);
  camera.position.set(...shot.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(new THREE.Vector3(...shot.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  assert.ok(shot.fov >= 38, 'a wide shot (the forest filling the frame: 40 degrees, as wide upright, where the director keeps the width)');
  // upright: the camera's right is level (no roll), and up on the screen is up in the world
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  assert.ok(Math.abs(right.y) < 1e-6, `rolled: ${right.y}`);
  assert.ok(up.y > 0.9, 'upright');
  const route = createRoute();
  const on = (x, z, above) => new THREE.Vector3(x, slope.far.heightAt(x, z) + above, z);
  const things = {
    pool: new THREE.Vector3(route.pool.center[0], route.pool.level + 0.5, route.pool.center[1]),
    falls: new THREE.Vector3(FALLS.x + 10, FALLS.top + 8, FALLS.z), // its lip and the spray rising over it (the face looks east, away)
    fen: on(-60, 90, 6),
    glade: on(-832, -192, 8),
  };
  const from = camera.position;
  for (const [name, point] of Object.entries(things)) {
    const p = point.clone().project(camera);
    assert.ok(Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95 && p.z < 1, `${name} in frame: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`);
    // the line of sight to it stays over the ground all the way (the last 2 % is the thing's own ground)
    for (let t = 0.01; t < 0.98; t += 0.0025) {
      const q = from.clone().lerp(point, t);
      assert.ok(q.y > slope.heightAt(q.x, q.z), `${name}: ground in between at ${q.x.toFixed(0)}, ${q.z.toFixed(0)} (t ${t.toFixed(3)})`);
    }
  }
  slope.dispose();
});

test('the top holds everyone: six discs inside the rim, none overlapping, 12 m free in the middle', () => {
  const top = createTop(world(), { grey: true });
  assert.deepEqual(top.room.map(r => r.friend).sort(), Object.keys(LENGTHS).sort());
  for (const { friend, at, r } of top.room) {
    assert.equal(r, LENGTHS[friend] / 2, `${friend}: half her length`);
    const d = Math.hypot(...at);
    assert.ok(d + r <= top.radius, `${friend} inside the rim: ${d + r}`);
    assert.ok(d - r >= 12, `${friend} keeps the middle free: ${d - r}`);
  }
  for (let i = 0; i < top.room.length; i++) {
    for (let j = i + 1; j < top.room.length; j++) {
      const [a, b] = [top.room[i], top.room[j]];
      assert.ok(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) >= a.r + b.r, `${a.friend} and ${b.friend} overlap`);
    }
  }
  assert.deepEqual(top.centre, [0, 0]);
  top.dispose();
});

test('the top is flat (no step over 0.3 m inside the rim); every wayUp starts under the sea and ends 8 m inside the rim', () => {
  const top = createTop(world(), { grey: true });
  for (let x = -top.radius; x < top.radius; x += 1) {
    for (let z = -top.radius; z < top.radius; z += 1) {
      if (Math.hypot(x + 1, z + 1) > top.radius) continue;
      const y = top.heightAt(x, z);
      assert.ok(Math.abs(top.heightAt(x + 1, z) - y) <= 0.3 && Math.abs(top.heightAt(x, z + 1) - y) <= 0.3, `a step at ${x}, ${z}`);
    }
  }
  for (let k = 0; k < 24; k++) {
    const angle = (k / 24) * Math.PI * 2;
    const [ex, ez] = top.edge(angle);
    const rim = Math.hypot(ex, ez);
    assert.ok(rim >= top.radius && Math.abs(top.heightAt(ex, ez) - top.sea.level) < 0.05, `the rim at ${k}: where the ground meets the cloud`);
    const way = top.wayUp(angle);
    assert.equal(way.length, 3);
    assert.ok(top.heightAt(...way[0]) < top.sea.level, `way ${k} starts under the sea`);
    assert.ok(Math.abs(Math.hypot(...way[2]) - (rim - 8)) < 1e-6, `way ${k} ends 8 m inside the rim`);
    const end = top.heightAt(...way[2]);
    assert.ok(end >= 0 && end <= 3, `way ${k} ends on the top: ${end}`);
  }
  top.dispose();
});

test('createTop alone builds with no chapter 6 state, and dispose leaves the scene as it found it', () => {
  const source = readFileSync(new URL('../world/fjall/top.js', import.meta.url), 'utf8');
  assert.ok(!/chapters\//.test(source), 'top.js imports nothing of a chapter');
  const w = world();
  const before = [...w.scene.children];
  const top = createTop(w);
  assert.equal(top.group.parent, w.scene);
  assert.ok(top.plants.length > 50, 'grass, low plants and rocks');
  assert.ok(top.sea.cards && top.sea.bank, 'the sea of cloud and its bank');
  for (let t = 0; t < 1; t += DT) top.update(DT, t);
  const swell = top.sea.wave({ from: [-40, 30], strength: 3, seconds: 0.5 });
  for (let t = 0; t < 0.6; t += DT) top.update(DT, t);
  assert.ok(swell.done, 'the swell has passed');
  top.veil.setLevel(1);
  top.sea.setGlow(0.5);
  top.dispose();
  assert.deepEqual(w.scene.children, before);
  assert.equal(top.group.parent, null);
});

test('in the cloud at level 0.5 a bush 30 m off is whiter than one 8 m off; at level 1 neither shows beyond 20 m', () => {
  const w = world();
  const belt = createBelt(w, { prints: PRINTS });
  const bushes = belt.plants.filter(p => p.name === 'bush').map(p => new THREE.Vector3(p.x, p.y + 0.8, p.z));
  // an eye in the cloud, 3 m up, 8 m from one bush and about 30 m from another
  let eye = null, near = null, far = null;
  for (const n of bushes) {
    for (let k = 0; k < 16 && !far; k++) {
      const e = new THREE.Vector3(n.x + Math.cos(k * 0.39) * 8, 3, n.z + Math.sin(k * 0.39) * 8);
      const f = bushes.find(p => Math.abs(e.distanceTo(p) - 30) < 3);
      if (f) [eye, near, far] = [e, n, f];
    }
    if (far) break;
  }
  assert.ok(eye, 'a bush near and one far');
  // the fog the engine draws (engine/fog.js): its density at the eye's height times the path, nearly level here
  const falloff = w.look.fog.heightFalloff;
  const fogged = p => 1 - Math.exp(-w.scene.fog.density * Math.exp(-falloff * eye.y) * eye.distanceTo(p));
  belt.cloud.setLevel(0.5, 0);
  assert.ok(fogged(far) > fogged(near) + 0.2, `${fogged(far)} vs ${fogged(near)}`);
  belt.cloud.setLevel(1, 0);
  for (const p of belt.plants) {
    const at = new THREE.Vector3(p.x, p.y + 0.5, p.z);
    if (eye.distanceTo(at) > 20) assert.ok(fogged(at) > 0.95, `shows at ${eye.distanceTo(at).toFixed(1)} m`);
  }
  belt.dispose();
});

// ---- the audit (B10): the cloud's blow and the light finish cleanly ----------------------------------------------------

test('setLevel during a blow finishes the blow: whoever waits on it goes on', () => {
  const w = world();
  const cloud = createCloud(w);
  cloud.setLevel(1, 0);
  const blown = cloud.blowAway({ from: [0, 0] });
  run(cloud, 0.5);
  cloud.setLevel(0.5, 0);
  assert.equal(blown.done, true);
  cloud.dispose();
});

test('the ring of her roar is whole however many swirls are in the cloud', () => {
  const w = world();
  const cloud = createCloud(w);
  cloud.setLevel(1, 0);
  for (let i = 0; i < 12; i++) cloud.swirlAt([i * 3, 0]); // a child tapping wrong again and again
  for (let i = 0; i < 3; i++) cloud.liftAt([i * 4, 2]);
  cloud.blowAway({ from: [0, 0] });
  assert.equal(cloud.cards.filter(c => c.alive && c.kind === 'ring').length, 24);
  assert.equal(cloud.cards.filter(c => c.alive && c.kind === 'drift').length, 14, 'the wisps round the camera stay');
  cloud.dispose();
});

test('blowAway ends at the fog of the look the light is going to (world.lightLook)', () => {
  const w = world();
  w.look = LOOKS.lowSun;
  const cloud = createCloud(w);
  cloud.setLevel(1, 0);
  w.lightLook = LOOKS.afterRoar;
  const blown = cloud.blowAway({ from: [0, 0] });
  run(cloud, CLOUD.blow + DT);
  assert.equal(blown.done, true);
  assert.ok(Math.abs(w.scene.fog.density - LOOKS.afterRoar.fog.density) < 1e-9, `${w.scene.fog.density}`);
  cloud.dispose();
});

test('dispose while the cloud holds the fog gives the sky\'s fog glow back', () => {
  // held at dispose (a chapter left in the cloud): the sky's horizon glow is the look's again, not the one the cloud matched it to
  const v = world();
  v.look = LOOKS.lowSun;
  v.lightLook = LOOKS.inCloud;
  const sky = v.sky.dome.material.uniforms;
  const held = createCloud(v);
  held.setLevel(1, 0);
  run(held, 0.2);
  held.dispose();
  assert.equal(sky.uFogSun.value.getHex(), new THREE.Color(LOOKS.inCloud.fog.sunColor).getHex());
  assert.equal(sky.uFogSunStrength.value, LOOKS.inCloud.fog.sunStrength);
});

test('the light eased while the cloud holds the fog takes the density on from where the cloud lets go of it, with no jump', () => {
  const w = { ...world(), look: LOOKS.lowSun };
  const cloud = createCloud(w);
  cloud.setLevel(1, 0);
  const ease = easeLight(w, LOOKS.sunset, 3); // the roar's: the cloud blows away under it, over the same 3 s
  const blown = cloud.blowAway({ from: [0, 0], seconds: 2 });
  let last = w.scene.fog.density, most = 0;
  for (let t = 0; t < 3.5; t += DT) {
    w.effects.update(DT);
    cloud.update(DT, t);
    most = Math.max(most, Math.abs(w.scene.fog.density - last));
    last = w.scene.fog.density;
  }
  assert.equal(blown.done, true);
  assert.equal(ease.done, true);
  assert.ok(most < 0.01, `the fog jumped by ${most}`);
  assert.ok(Math.abs(w.scene.fog.density - LOOKS.sunset.fog.density) < 1e-9);
  cloud.dispose();
});
