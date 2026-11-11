// Chapter 5's place (chapters/kafli5-pool.js): the far pool's choir spots, her steps out of the reed, the shots and the light, and
// Árdalurinn built only round the pool (world/ardalur/index.js: createArdalur's `at`).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHOIR, GROUPS, STEPS, SPOTS, WADE, SHOTS, SHOWS, GROUP_SHOTS, seatsOf, around } from '../chapters/kafli5-pool.js';
import { FAR_POOL, createRoute } from '../chapters/kafli4-route.js';
import { LOOKS } from '../engine/looks.js';
import { LIMITS, createDirector } from '../engine/camera/director.js';
import { createPointResolver } from '../engine/points.js';
import { createTerrain } from '../world/ardalur/terrain.js';
import { createArdalur, SIGHT } from '../world/ardalur/index.js';

const route = createRoute();
const terrain = createTerrain(route, { seed: 4 });
const ground = (x, z) => terrain.heightAt(x, z);
const toPool = ([x, z]) => Math.hypot(x - FAR_POOL.center[0], z - FAR_POOL.center[1]);
const wet = at => toPool(at) < FAR_POOL.radius;
/** What stands at [x, z]: on the water if the pool is there, else on the ground. */
const surface = at => (wet(at) ? FAR_POOL.level : ground(...at));

/** A camera cut to `shot` by the real director, on a screen `aspect` wide (0.625: a tablet held upright). */
function cameraOn(shot, aspect) {
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 2000);
  const world = { camera, heightAt: ground, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const director = createDirector({ camera, world, shots: SHOTS, lint: false });
  director.cut(shot, { check: false });
  camera.updateMatrixWorld();
  return { camera, director };
}
const SIZE = { 1.6: [1280, 800], 0.625: [800, 1280] };
/** Where `point` lands on the screen, in pixels, and how wide `radius` metres across the view is there. */
function onScreen(camera, aspect, point, radius = 0) {
  const [w, h] = SIZE[aspect];
  const p = point.clone().project(camera);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const q = point.clone().addScaledVector(right, radius).project(camera);
  return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, front: p.z < 1, r: (Math.abs(q.x - p.x) / 2) * w, w, h };
}
const spotPoint = g => new THREE.Vector3(CHOIR[g].at[0], surface(CHOIR[g].at), CHOIR[g].at[1]);

test('every choir spot is in the pool shot, at 16:10 and upright, and no two tap circles overlap on the screen', () => {
  for (const aspect of [1.6, 0.625]) {
    const { camera } = cameraOn('choir_wide', aspect);
    const seen = GROUPS.map(g => ({ g, ...onScreen(camera, aspect, spotPoint(g), CHOIR[g].radius) }));
    for (const s of seen) {
      assert.ok(s.front, `${s.g} in front of the camera (${aspect})`);
      assert.ok(s.x - s.r >= 0 && s.x + s.r <= s.w, `${s.g}'s circle across the frame at ${aspect}: ${s.x.toFixed(0)} ± ${s.r.toFixed(0)} px`);
      assert.ok(s.y - s.r >= 0 && s.y + s.r <= 0.85 * s.h, `${s.g}'s circle above the frame's bottom 15 % at ${aspect}: ${s.y.toFixed(0)} ± ${s.r.toFixed(0)} px`);
      assert.ok(s.r >= (aspect > 1 ? 50 : 35), `${s.g}'s circle is a big target at ${aspect}: ${s.r.toFixed(0)} px`);
    }
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const a = seen[i], b = seen[j];
        const apart = Math.hypot(a.x - b.x, a.y - b.y);
        assert.ok(apart >= a.r + b.r, `${a.g} and ${b.g} at ${aspect}: ${apart.toFixed(0)} px apart, ${(a.r + b.r).toFixed(0)} needed`);
      }
    }
  }
});

test('the five groups stand low to high from the left of choir_wide to its right', () => {
  assert.deepEqual(GROUPS, ['grazers', 'turtles', 'frogs', 'lizards', 'flyers']);
  assert.deepEqual(Object.keys(CHOIR).sort(), [...GROUPS].sort());
  for (const aspect of [1.6, 0.625]) {
    const { camera } = cameraOn('choir_wide', aspect);
    const xs = GROUPS.map(g => onScreen(camera, aspect, spotPoint(g)).x);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], `${GROUPS[i]} right of ${GROUPS[i - 1]} at ${aspect}`);
  }
});

test('every choir spot is dry, but the frogs\' lily pads in the shallows; each faces the pool and is wide enough to tap', () => {
  for (const g of GROUPS) {
    const { at, heading, radius, on } = CHOIR[g];
    assert.ok(radius >= 2.5, `${g}'s tap circle is ${radius} m round`);
    if (on === 'lilies') {
      assert.equal(g, 'frogs');
      const depth = FAR_POOL.level - ground(...at);
      assert.ok(wet(at) && depth > 0.15 && depth <= 1.4, `the frogs' pads float in the shallows: ${depth.toFixed(2)} m of water`);
    } else {
      assert.ok(toPool(at) >= FAR_POOL.radius + 1, `${g} stands on dry ground, ${toPool(at).toFixed(1)} m from the middle`);
      assert.ok(ground(...at) > FAR_POOL.level, `${g}'s ground is over the water`);
    }
    const toMiddle = (Math.atan2(FAR_POOL.center[1] - at[1], FAR_POOL.center[0] - at[0]) * 180) / Math.PI;
    assert.ok(Math.abs(((heading - toMiddle + 540) % 360) - 180) < 1, `${g} faces the pool's middle`);
    // out of the reed beds, Egill's, Mosi's and Flugeðla's spots, and 8 m from each other group
    for (const bed of FAR_POOL.reeds) assert.ok(Math.hypot(at[0] - bed.at[0], at[1] - bed.at[1]) >= bed.radius + radius - 1, `${g} out of the reed`);
    for (const who of ['egill', 'mosi', 'flugedla']) assert.ok(Math.hypot(at[0] - SPOTS[who][0], at[1] - SPOTS[who][1]) >= 12, `${g} away from ${who}`);
    for (const h of GROUPS) if (h !== g) assert.ok(Math.hypot(at[0] - CHOIR[h].at[0], at[1] - CHOIR[h].at[1]) >= 8, `${g} 8 m from ${h}`);
  }
});

test('her four steps go from inside the far reed to the shallows, each nearer Egill than the last', () => {
  assert.deepEqual(STEPS.map(s => s.show), ['crest', 'head', 'neck', 'whole']);
  const reed = FAR_POOL.reeds.find(bed => bed.at[0] === FAR_POOL.farReed[0] && bed.at[1] === FAR_POOL.farReed[1]);
  const inReed = at => Math.hypot(at[0] - reed.at[0], at[1] - reed.at[1]);
  assert.ok(inReed(STEPS[0].at) < reed.radius - 2, `the first deep in the reed: ${inReed(STEPS[0].at).toFixed(1)} m from its middle`);
  assert.ok(inReed(STEPS[3].at) > reed.radius + 1, 'the last out of it');
  const depth = FAR_POOL.level - ground(...STEPS[3].at);
  assert.ok(wet(STEPS[3].at) && depth > 0.2 && depth < 1.5, `the last in the shallows: ${depth.toFixed(2)} m of water`);
  const toEgill = at => Math.hypot(at[0] - SPOTS.egill[0], at[1] - SPOTS.egill[1]);
  for (let i = 1; i < STEPS.length; i++) assert.ok(toEgill(STEPS[i].at) < toEgill(STEPS[i - 1].at) - 2, `step ${i} nearer Egill`);
  assert.ok(toEgill(WADE.at) < toEgill(STEPS[3].at) && wet(WADE.at), 'the whole song from further out in the pool, nearer him');
  // each faces Egill's bank
  for (const s of [...STEPS, WADE]) {
    const to = (Math.atan2(SPOTS.egill[1] - s.at[1], SPOTS.egill[0] - s.at[0]) * 180) / Math.PI;
    assert.ok(Math.abs(((s.heading - to + 540) % 360) - 180) < 1);
  }
});

// Who each shot shows, standing where the chapter puts them then: scene 1 as chapter 4 left them, Slóeðla at the step (or the
// wade) the shot is used at, and the height of what of them must be seen (their heads).
const HEAD = { egill: 1.0, mosi: 3.4, flugedla: 2.4, sloedla: 3.6 };
const WHERE = {
  pool_open: { egill: FAR_POOL.bank, mosi: FAR_POOL.mosi, flugedla: FAR_POOL.landing },
  reed_close: { sloedla: STEPS[0].at },
  bank_talk: { egill: SPOTS.egill, mosi: SPOTS.mosi },
  choir_wide: { sloedla: STEPS[0].at },
  sloedla_out: { sloedla: WADE.at },
  west_listen: { egill: SPOTS.egill, mosi: SPOTS.mosi },
  // the set (scene 6): she wades, Egill is at the water's edge, Flugeðla in the shallows where she landed
  set_her_close: { sloedla: WADE.at },
  set_her_low: { sloedla: WADE.at },
  set_egill_close: { egill: SPOTS.egill },
  set_flugedla: { flugedla: SPOTS.flugedla },
};

test('the set\'s shots of a group show the group: every seat in its wide shot, its middle in its close one, at 16:10 and upright', () => {
  const HIGH = { grazers: 2.6, turtles: 0.6, frogs: 0.3, lizards: 0.5, flyers: 0.9 }; // m: about where a member's head is over what it stands on
  const BASE = { grazers: 0, turtles: 0.9, frogs: 0, lizards: 0, flyers: 0 }; // m: the turtles sit on their stone (kafli5.test.mjs: over 0.8 m up)
  for (const group of GROUPS) {
    const { all, close } = GROUP_SHOTS[group];
    assert.ok(SHOTS[all] && SHOTS[close], `${group} has its two shots`);
    for (const aspect of [1.6, 0.625]) {
      const wide = cameraOn(all, aspect).camera;
      for (const [k, seat] of seatsOf(group).entries()) {
        for (const lift of [BASE[group], BASE[group] + HIGH[group]]) {
          const s = onScreen(wide, aspect, new THREE.Vector3(seat.at[0], surface(seat.at) + lift, seat.at[1]));
          assert.ok(s.front && s.x >= 0.03 * s.w && s.x <= 0.97 * s.w && s.y >= 0.06 * s.h && s.y <= 0.9 * s.h,
            `${group} ${k} (${lift} m up) in ${all} at ${aspect}: ${s.x.toFixed(0)}, ${s.y.toFixed(0)} of ${s.w} x ${s.h}`);
        }
      }
      const near = cameraOn(close, aspect).camera;
      const s = onScreen(near, aspect, spotPoint(group).add(new THREE.Vector3(0, BASE[group] + HIGH[group] / 2, 0)));
      assert.ok(s.front && s.x >= 0.25 * s.w && s.x <= 0.75 * s.w && s.y >= 0.2 * s.h && s.y <= 0.75 * s.h, `${group}'s middle in ${close} at ${aspect}: ${s.x.toFixed(0)}, ${s.y.toFixed(0)}`);
      // close is closer: the group's spot is at least half again as big on the screen
      const size = camera => onScreen(camera, aspect, spotPoint(group), 1).r;
      assert.ok(size(near) >= size(wide) * 1.4, `${close} is a closer look than ${all} at ${aspect}: ${size(near).toFixed(0)} against ${size(wide).toFixed(0)} px a metre`);
    }
  }
});

test('every chapter 5 shot keeps the director quiet (LIMITS) and shows who SHOWS names', () => {
  for (const name of ['pool_open', 'reed_close', 'choir_wide', 'sloedla_out', 'west_listen']) assert.ok(SHOTS[name], `${name} is a shot`);
  assert.deepEqual(Object.keys(SHOWS).sort(), Object.keys(SHOTS).sort(), 'every shot says whom it is for');
  for (const [name, shot] of Object.entries(SHOTS)) {
    const [x, y, z] = shot.position;
    assert.ok(shot.fov >= LIMITS.lens[0] && shot.fov <= LIMITS.lens[1], `${name}: a ${shot.fov} degree lens`);
    const height = y - ground(x, z);
    assert.ok(height >= 0.3 && height <= LIMITS.maxHeight, `${name}: the camera ${height.toFixed(2)} m over the ground`);
    assert.ok(y - surface([x, z]) >= 1, `${name}: the camera a metre or more over the water or the ground`);
    const [tx, ty, tz] = shot.target;
    const down = (Math.atan2(y - ty, Math.hypot(tx - x, tz - z)) * 180) / Math.PI;
    assert.ok(down <= LIMITS.maxDown, `${name} looks ${down.toFixed(0)} degrees down`);
    // the sun 35 to 150 degrees off the camera's axis (STYLE.md 5), seen from above
    const heading = (Math.atan2(tz - z, tx - x) * 180) / Math.PI;
    const off = Math.abs(((heading - LOOKS.goldenAfternoon.sun.azimuth + 540) % 360) - 180);
    assert.ok(off >= 35 && off <= 180, `${name}: the sun ${off.toFixed(0)} degrees off its axis`);
    for (const aspect of [1.6, 0.625]) {
      const { camera, director } = cameraOn(name, aspect);
      assert.deepEqual(director.warnings, [], `${name} at ${aspect}`);
      for (const who of SHOWS[name]) {
        const at = WHERE[name][who];
        const s = onScreen(camera, aspect, new THREE.Vector3(at[0], surface(at) + HEAD[who], at[1]));
        assert.ok(s.front && s.x >= 0.04 * s.w && s.x <= 0.96 * s.w && s.y >= 0.05 * s.h && s.y <= 0.85 * s.h,
          `${who} in ${name} at ${aspect}: ${s.x.toFixed(0)}, ${s.y.toFixed(0)}`);
      }
    }
  }
});

test('createArdalur at the pool builds only the sections within SIGHT and nothing is late', () => {
  const world = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200), flightU: null };
  const place = createArdalur(world, { grey: true, route, at: FAR_POOL.center });
  const built = [...place.stats.built].sort((a, b) => a - b);
  assert.ok(built.length >= 1 && built.length < place.sections.list.length / 2, `${built.length} of ${place.sections.list.length} sections built`);
  // the sections whose land is within SIGHT of the pool's middle, and nothing else
  const near = place.near(FAR_POOL.center[0], FAR_POOL.center[1]);
  for (const i of near) assert.ok(built.includes(i), `section ${i}, within sight of the pool, is built`);
  // each shot of the chapter: shown with no flight, and nothing built late
  for (const shot of Object.values(SHOTS)) {
    world.camera.position.set(...shot.position);
    place.update(1 / 30, 0);
    for (const s of place.sections.list) assert.ok(!s.visible || s.built, `section ${s.index} shown unbuilt`);
    assert.ok(place.visible.length > 0, 'the land under the shot is shown');
  }
  assert.deepEqual(place.stats.late, [], 'nothing was wanted before it was built');
  assert.equal(place.building, null, 'and nothing waits to be built');
  place.dispose();
});

test('goldenAfternoon: the sun lower than earlyAfternoon, from the same way, warmer', () => {
  assert.ok(LOOKS.goldenAfternoon.sun.elevation < LOOKS.earlyAfternoon.sun.elevation);
  assert.equal(LOOKS.goldenAfternoon.sun.azimuth, 215);
  assert.equal(LOOKS.goldenAfternoon.sun.elevation, 14);
  // 70 % of the way from lateMorning to golden: its sun's colour warmer (less blue) than chapter 4's
  const blue = hex => parseInt(hex.slice(5, 7), 16);
  assert.ok(blue(LOOKS.goldenAfternoon.sun.color) < blue(LOOKS.earlyAfternoon.sun.color));
  assert.ok(LOOKS.goldenAfternoon.sun.elevation > LOOKS.evening.sun.elevation, 'not yet the evening');
  assert.ok(around(0, 0)[0] === FAR_POOL.center[0]);
});
