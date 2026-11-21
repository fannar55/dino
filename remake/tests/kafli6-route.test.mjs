// Chapter 6's places as data (chapters/kafli6-route.js): the ford above the falls and its stones, the giant's prints on the belt
// of cloud, the call's stands and glows, the shots of the four places and who each one shows; and chapter 5's pool as a place two
// chapters build (chapters/kafli5-place.js buildPool).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ROUTE, FORD, STEPS, STONE, FALLS_LOOK, BELT_PATH, PRINT_SIZE, PRINT_PACE, PRINT_TAP, PRINTS, mosiAt, CLOUD_BY_PRINT, CALL,
  callStand, directionPoint, herAt, SHOTS, SHOWS, STANDS, stepShot, printShot, callShot, meetShot, meetOf, MEET, BELT_GROUND,
  ARDALUR_VIEWS, ARDALUR_KEEP, crossing, MOSI_FRONT,
} from '../chapters/kafli6-route.js';
import { KEEP, viewsOf, poolOptions } from '../chapters/kafli5-place.js';
import { FAR_POOL } from '../chapters/kafli4-route.js';
import { FLOW } from '../world/ardalur/river.js';
import { LIMITS, createDirector } from '../engine/camera/director.js';
import { createPointResolver } from '../engine/points.js';
import { createTerrain } from '../world/ardalur/terrain.js';
import { createSlope } from '../world/fjall/index.js';
import { createArdalur } from '../world/ardalur/index.js';
import { createSteppingStones } from '../world/props/stepping-stones.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { rainbowLevel } from '../world/props/waterfall.js';
import { LOOKS } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';

const SUN = 215; // the chapter's sun (engine/looks.js lowSun and the places' looks): azimuth 215, as chapter 5's
const terrain = createTerrain(ROUTE, { seed: 4 });
// the slope stage as chapter 6 builds it (world/fjall createSlope): its shelf over the far land
const slope = createSlope({ THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(50, 1.6, 0.1, 1000), heightAt: () => 0 }, { grey: true });
const river = ROUTE.river;
/** The water's level at (x, z), or -Infinity where there is none (the river above the falls, the far pool). */
function waterAt(x, z) {
  if (Math.hypot(x - FAR_POOL.center[0], z - FAR_POOL.center[1]) < FAR_POOL.radius) return FAR_POOL.level;
  const n = river.nearest(x, z);
  const r = river.at(n.d);
  return n.dist < r.half + 1 ? r.level : -Infinity;
}
// Each place's ground, as the director sees it (world.heightAt), and what stands at a point: the water if any, else the ground.
// The belt and the top are stages of their own whose ground lies between 0 and 3 m (world/fjall): their shots are checked on
// flat ground at BELT_GROUND, and the functions' shots on flat ground at 0, the middle and 3 m.
const PLACES = {
  ardalur: { ground: (x, z) => terrain.heightAt(x, z), surface: (x, z) => Math.max(terrain.heightAt(x, z), waterAt(x, z)) },
  hlid: { ground: (x, z) => slope.heightAt(x, z), surface: (x, z) => slope.heightAt(x, z) },
  sky: { ground: () => BELT_GROUND, surface: () => BELT_GROUND },
  toppur: { ground: () => BELT_GROUND, surface: () => BELT_GROUND },
};
const flat = y => ({ ground: () => y, surface: () => y });

/** A camera cut to `shot` (a name in `shots`, or a shot) by the real director, on a screen `aspect` wide (0.625: upright). */
function cameraOn(shots, shot, aspect, place) {
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 4000);
  const world = { camera, heightAt: place.ground, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const director = createDirector({ camera, world, shots, lint: false });
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
const offOf = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const headingOf = (from, to) => (Math.atan2(to[2] - from[2], to[0] - from[0]) * 180) / Math.PI;

/** The shot's static rules (as the director's lint and chapter 5's test): lens, height, not top-down, the sun off its axis. */
function rulesHold(name, shot, place) {
  const [x, y, z] = shot.position;
  assert.ok(shot.fov >= LIMITS.lens[0] && shot.fov <= LIMITS.lens[1], `${name}: a ${shot.fov} degree lens`);
  const height = y - place.ground(x, z);
  assert.ok(height >= 0.3 && height <= LIMITS.maxHeight, `${name}: the camera ${height.toFixed(2)} m over the ground`);
  assert.ok(y - place.surface(x, z) >= 1, `${name}: the camera a metre or more over the water or the ground`);
  const [tx, ty, tz] = shot.target;
  const down = (Math.atan2(y - ty, Math.hypot(tx - x, tz - z)) * 180) / Math.PI;
  assert.ok(down <= LIMITS.maxDown, `${name} looks ${down.toFixed(0)} degrees down`);
  const off = offOf(headingOf(shot.position, shot.target), SUN);
  assert.ok(off >= 35, `${name}: the sun ${off.toFixed(0)} degrees off its axis`);
}

// What of each must be seen, from its root in its own frame: [ahead, up]. Egill in the saddle sits over Mosi's shoulders; on her
// head he sits over her skull.
const PART = { mosi: [2.7, 3.0], egill: [0, 1.0], flugedla: [0, 2.4], sloedla: [0, 3.6], gramedla: [2.0, 3.5] };
const SADDLE = [1.2, 4.2];
const ON_HER = [3.0, 5.9];
/** The point of `who` that must be in frame, standing as `stands` says, on `place`. */
function pointOf(stands, who, place) {
  const stand = stands[who];
  const host = stand.on ? stands[stand.on] : stand;
  const [ahead, up] = stand.on === 'mosi' ? SADDLE : stand.on === 'gramedla' ? ON_HER : PART[who];
  const h = THREE.MathUtils.degToRad(host.heading ?? 0);
  const [x, z] = host.at;
  const y = host.y ?? place.surface(x, z);
  return new THREE.Vector3(x + Math.cos(h) * ahead, y + up, z + Math.sin(h) * ahead);
}
function showsWho(shots, name, whom, stands, place) {
  for (const aspect of [1.6, 0.625]) {
    const { camera, director } = cameraOn(shots, name, aspect, place);
    assert.deepEqual(director.warnings, [], `${name} at ${aspect}`);
    for (const who of whom) {
      const s = onScreen(camera, aspect, pointOf(stands, who, place));
      assert.ok(s.front && s.x >= 0.04 * s.w && s.x <= 0.96 * s.w && s.y >= 0.05 * s.h && s.y <= 0.85 * s.h,
        `${who} in ${name} at ${aspect}: ${s.x.toFixed(0)}, ${s.y.toFixed(0)} of ${s.w} x ${s.h}`);
    }
  }
}

const groundAt = ([x, z]) => terrain.heightAt(x, z);
const away = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('the ford is above the falls and clear of the quick water at the lip', () => {
  assert.equal(FORD.d, ROUTE.river.falls + 45);
  assert.ok(FORD.d - ROUTE.river.falls > FLOW.lip);
  assert.equal(FORD.level, ROUTE.river.at(FORD.d).level);
  const here = river.at(FORD.d);
  assert.deepEqual(FORD.centre, [here.x, here.z]);
  assert.equal(FORD.half, here.half);
  // from on the north bank, to on the south, both dry, across the river from each other
  assert.equal(river.nearest(...FORD.from).side, 1, 'from: the north bank');
  assert.equal(river.nearest(...FORD.to).side, -1, 'to: the south bank');
  for (const end of [FORD.from, FORD.to]) {
    assert.ok(groundAt(end) > FORD.level + 0.2, `a bank's spot is dry: ${(groundAt(end) - FORD.level).toFixed(2)} m over the water`);
    assert.ok(Math.abs(river.nearest(...end).d - FORD.d) < 1, 'straight across');
  }
});

test('five steps of 3, 2, 3, 2, 3 stones, one right in each; the right ones cross the river 3.4 to 3.8 m apart', () => {
  assert.deepEqual(STEPS.map(s => s.stones.length), [3, 2, 3, 2, 3]);
  const ids = new Set();
  let from = FORD.from;
  for (const [step, { stones }] of STEPS.entries()) {
    assert.equal(stones.filter(s => s.right).length, 1, `step ${step} has one right stone`);
    for (const [k, stone] of stones.entries()) {
      assert.equal(stone.id, `stone-${step}-${k}`);
      assert.ok(!ids.has(stone.id));
      ids.add(stone.id);
      // every stone stands in the water, within reach of where Mosi stands
      assert.ok(groundAt(stone.at) < FORD.level - 0.3, `${stone.id} in the river`);
      assert.ok(away(stone.at, from) <= 7, `${stone.id} within reach: ${away(stone.at, from).toFixed(1)} m`);
    }
    // the step's stones apart by their tap circles
    for (let i = 0; i < stones.length; i++) for (let j = i + 1; j < stones.length; j++) {
      const r = (s => (s.right ? STONE.right.tap : STONE.wrong.tap));
      assert.ok(away(stones[i].at, stones[j].at) >= r(stones[i]) + r(stones[j]), `step ${step}: ${i} and ${j} apart`);
    }
    const right = stones.find(s => s.right);
    const gap = away(right.at, from);
    assert.ok(gap >= 3.4 && gap <= 3.8, `step ${step}: ${gap.toFixed(2)} m from the last`);
    from = right.at;
  }
  const last = away(from, FORD.to);
  assert.ok(last >= 3.4 && last <= 3.8, `the last stone to the south bank: ${last.toFixed(2)} m`);
  assert.ok(STONE.right.across > STONE.wrong.across && STONE.right.tap > STONE.wrong.tap);
  assert.ok(Number.isInteger(FALLS_LOOK) && FALLS_LOOK >= 0 && FALLS_LOOK < STEPS.length);
});

test('six prints, right and left in turn, PRINT_PACE apart; mosiAt(0) has his front feet in the first', () => {
  assert.equal(PRINT_SIZE, 5);
  assert.equal(PRINT_PACE, 9);
  assert.equal(PRINTS.length, 6);
  assert.ok(BELT_PATH.length >= 2);
  PRINTS.forEach((p, k) => {
    assert.equal(p.foot, k % 2 === 0 ? 'right' : 'left');
    assert.ok(Number.isFinite(p.heading));
    // on the belt: within its cloud (60 m round the stage's middle)
    assert.ok(Math.hypot(...p.position) < 55, `print ${k} in the cloud`);
    if (k) {
      const step = away(p.position, PRINTS[k - 1].position);
      assert.ok(step >= PRINT_PACE && step <= PRINT_PACE * 1.05, `print ${k}: ${step.toFixed(2)} m from the last`);
    }
  });
  // his front feet (2.3 m ahead of his root, 0.9 m either side) in each print he stands at, near its heel
  for (let k = 0; k < PRINTS.length; k++) {
    const at = mosiAt(k);
    const p = PRINTS[k];
    const h = THREE.MathUtils.degToRad(at.heading);
    const ph = THREE.MathUtils.degToRad(p.heading);
    for (const side of [-0.9, 0.9]) {
      const foot = [at.x + Math.cos(h) * 2.3 - Math.sin(h) * side, at.z + Math.sin(h) * 2.3 + Math.cos(h) * side];
      const dx = foot[0] - p.position[0], dz = foot[1] - p.position[1];
      const along = dx * Math.cos(ph) + dz * Math.sin(ph);
      const across = -dx * Math.sin(ph) + dz * Math.cos(ph);
      assert.ok(along > -PRINT_SIZE / 2 + 0.3 && along < 0 && Math.abs(across) < 0.3 * PRINT_SIZE, `his front foot in print ${k}: ${along.toFixed(2)}, ${across.toFixed(2)}`);
    }
  }
  // the sixth leaves him a pace on, where the call begins
  assert.ok(away([mosiAt(6).x, mosiAt(6).z], [mosiAt(5).x, mosiAt(5).z]) > PRINT_PACE * 0.95);
  assert.deepEqual(callStand(0, []), mosiAt(6));
  assert.deepEqual(CLOUD_BY_PRINT, [0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]);
});

test('upright and wide: each step\'s stones are in stepShot(k), their tap circles apart', () => {
  for (let k = 0; k < STEPS.length; k++) {
    const shot = stepShot(k);
    rulesHold(`stepShot(${k})`, shot, PLACES.ardalur);
    for (const aspect of [1.6, 0.625]) {
      const { camera, director } = cameraOn({}, shot, aspect, PLACES.ardalur);
      assert.deepEqual(director.warnings, []);
      const seen = STEPS[k].stones.map(stone => {
        const size = stone.right ? STONE.right : STONE.wrong;
        return { stone, ...onScreen(camera, aspect, new THREE.Vector3(stone.at[0], FORD.level + size.up, stone.at[1]), size.tap) };
      });
      for (const s of seen) {
        assert.ok(s.front && s.x - s.r >= 0 && s.x + s.r <= s.w, `${s.stone.id} across the frame at ${aspect}: ${s.x.toFixed(0)} ± ${s.r.toFixed(0)}`);
        assert.ok(s.y - s.r >= 0 && s.y + s.r <= 0.85 * s.h, `${s.stone.id} above the bottom 15 % at ${aspect}: ${s.y.toFixed(0)} ± ${s.r.toFixed(0)}`);
      }
      for (let i = 1; i < seen.length; i++) assert.ok(seen[i].x > seen[i - 1].x, `step ${k}: listed left to right at ${aspect}`);
      for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
        const apart = Math.hypot(seen[i].x - seen[j].x, seen[i].y - seen[j].y);
        assert.ok(apart >= seen[i].r + seen[j].r, `step ${k} at ${aspect}: ${apart.toFixed(0)} px, ${(seen[i].r + seen[j].r).toFixed(0)} needed`);
      }
      // Mosi, on the bank or with his front feet on the last stone, with Egill on his back
      const stands = { mosi: crossing(k), egill: { on: 'mosi' } };
      for (const who of ['mosi', 'egill']) {
        const s = onScreen(camera, aspect, pointOf(stands, who, PLACES.ardalur));
        assert.ok(s.front && s.x >= 0.04 * s.w && s.x <= 0.96 * s.w && s.y >= 0.05 * s.h && s.y <= 0.85 * s.h, `${who} in stepShot(${k}) at ${aspect}`);
      }
    }
  }
  // printShot(k): print k round its tap circle, and Mosi's head over it, on any ground the belt has
  for (const ground of [0, BELT_GROUND, 3]) {
    for (let k = 0; k < PRINTS.length; k++) {
      const shot = printShot(k, ground);
      rulesHold(`printShot(${k})`, shot, flat(ground));
      for (const aspect of [1.6, 0.625]) {
        const { camera, director } = cameraOn({}, shot, aspect, flat(ground));
        assert.deepEqual(director.warnings, []);
        const [px, pz] = PRINTS[k].position;
        const s = onScreen(camera, aspect, new THREE.Vector3(px, ground, pz), PRINT_TAP);
        assert.ok(s.front && s.x - s.r >= 0 && s.x + s.r <= s.w && s.y - s.r >= 0 && s.y + s.r <= 0.85 * s.h,
          `print ${k} at ${aspect} on ${ground} m: ${s.x.toFixed(0)}, ${s.y.toFixed(0)} ± ${s.r.toFixed(0)}`);
        const at = mosiAt(k);
        const head = onScreen(camera, aspect, pointOf({ mosi: { at: [at.x, at.z], heading: at.heading } }, 'mosi', flat(ground)));
        assert.ok(head.front && head.x >= 0.04 * head.w && head.x <= 0.96 * head.w && head.y >= 0.05 * head.h, `Mosi's head in printShot(${k}) at ${aspect}`);
      }
    }
  }
});

// Every way the call can go: three rounds, never the same direction twice in a row (chapters/kafli6-help.js callDirections)
const WAYS = ['left', 'ahead', 'right'];
const WALKS = WAYS.flatMap(a => WAYS.filter(b => b !== a).flatMap(b => WAYS.filter(c => c !== b).map(c => [a, b, c])));

test('upright and wide: the three glows lie one in each third of callShot, and Mosi is in it', () => {
  assert.equal(WALKS.length, 12);
  const THIRDS = { left: [0.04, 0.3], ahead: [0.37, 0.63], right: [0.7, 0.96] };
  for (const walked of WALKS) {
    for (let round = 0; round < 3; round++) {
      const stand = callStand(round, walked.slice(0, round));
      for (const ground of [0, BELT_GROUND, 3]) {
        const shot = callShot(stand, ground);
        rulesHold(`callShot(${round}, ${walked})`, shot, flat(ground));
        for (const aspect of [1.6, 0.625]) {
          const { camera, director } = cameraOn({}, shot, aspect, flat(ground));
          assert.deepEqual(director.warnings, []);
          for (const direction of WAYS) {
            const s = onScreen(camera, aspect, new THREE.Vector3(...directionPoint(stand, direction, ground)));
            const [a, b] = THIRDS[direction];
            assert.ok(s.front && s.x > a * s.w && s.x < b * s.w && s.y > 0.08 * s.h && s.y < 0.7 * s.h,
              `${direction} in round ${round} at ${aspect} (${walked}): ${(s.x / s.w).toFixed(2)}, ${(s.y / s.h).toFixed(2)}`);
          }
          const mosi = onScreen(camera, aspect, pointOf({ mosi: { at: [stand.x, stand.z], heading: stand.heading } }, 'mosi', flat(ground)));
          assert.ok(mosi.front && mosi.y >= 0.05 * mosi.h && mosi.y <= 0.85 * mosi.h && mosi.x > 0.3 * mosi.w && mosi.x < 0.7 * mosi.w, `Mosi in callShot at ${aspect}`);
        }
      }
      // she is further each round back, and nearer each round on: in the direction she answers from
      for (const direction of WAYS) {
        const her = herAt(stand, direction, round);
        assert.ok(Math.abs(away(her, [stand.x, stand.z]) - CALL.her[round]) < 1e-9);
        const glow = directionPoint(stand, direction);
        assert.ok(Math.abs(away([glow[0], glow[2]], [stand.x, stand.z]) - CALL.glow) < 1e-9);
      }
    }
    // a walk is CALL.reach m toward where she answered, and he faces that way
    for (let round = 0; round < 3; round++) {
      const a = callStand(round, walked.slice(0, round));
      const b = callStand(round + 1, walked.slice(0, round + 1));
      assert.ok(Math.abs(away([a.x, a.z], [b.x, b.z]) - CALL.reach) < 1e-9);
      const turn = { left: -CALL.angle, ahead: 0, right: CALL.angle }[walked[round]];
      assert.ok(offOf(b.heading, a.heading + turn) < 1e-9);
    }
    // where she is seen, on the belt's stage in its cloud (60 m round its middle): in the last round, and where she meets them
    assert.ok(Math.hypot(...herAt(callStand(2, walked.slice(0, 2)), walked[2], 2)) < 55);
    assert.ok(Math.hypot(...meetOf(callStand(3, walked)).she_comes.gramedla.at) < 55);
  }
  assert.deepEqual(CALL, { reach: 7, glow: 22, angle: 40, her: [60, 30, 12] });
});

test('every shot keeps the director quiet (LIMITS) and shows who SHOWS names', () => {
  const NAMES = {
    ardalur: ['pool_west', 'pool_saddle', 'ford_arrive', 'falls_look', 'ford_across'],
    hlid: ['slope_ride', 'view_east', 'clouds_up'],
    sky: ['print_first', 'she_comes', 'sniff_close', 'roar_wide', 'star_up', 'head_down', 'on_her_head', 'climb_side'],
    toppur: ['above_clouds', 'top_wide'],
  };
  assert.deepEqual(Object.keys(SHOTS).sort(), Object.keys(NAMES).sort());
  for (const [place, names] of Object.entries(NAMES)) assert.deepEqual(Object.keys(SHOTS[place]).sort(), [...names].sort(), place);
  const all = Object.values(SHOTS).flatMap(shots => Object.keys(shots));
  assert.deepEqual(Object.keys(SHOWS).sort(), [...all].sort(), 'every shot says whom it is for');
  for (const [place, shots] of Object.entries(SHOTS)) {
    for (const [name, shot] of Object.entries(shots)) {
      rulesHold(name, shot, PLACES[place]);
      assert.ok(STANDS[name], `${name}: where everyone stands`);
      for (const who of SHOWS[name]) assert.ok(STANDS[name][who], `${name}: where ${who} stands`);
      showsWho(shots, name, SHOWS[name], STANDS[name], PLACES[place]);
    }
  }
  // the meeting's shots, wherever the call has brought him and on any ground the belt has
  for (const walked of WALKS) {
    const stand = callStand(3, walked);
    for (const ground of [0, 3]) {
      const stands = meetOf(stand, ground);
      for (const name of Object.keys(MEET)) {
        const shot = meetShot(name, stand, ground);
        rulesHold(`${name} (${walked})`, shot, flat(ground));
        showsWho({ [name]: shot }, name, SHOWS[name], stands[name], flat(ground));
      }
    }
  }
});

test('the ford\'s shots keep their lines of sight and the stones\' banks clear of plants', () => {
  const names = Object.keys(SHOTS.ardalur).filter(name => name !== 'pool_west'); // (chapter 5's own, kept already)
  for (const name of names) assert.ok(ARDALUR_VIEWS.some(v => v.shot === name), `${name} is kept clear`);
  for (let k = 0; k < STEPS.length; k++) assert.ok(ARDALUR_VIEWS.some(v => v.shot === `step_${k}`));
  for (const v of ARDALUR_VIEWS) {
    assert.equal(v.position.length, 3);
    assert.ok(v.looks.length >= 1 && v.looks.every(p => p.length === 3));
  }
  for (const end of [FORD.from, FORD.to]) assert.ok(ARDALUR_KEEP.some(k => Math.hypot(k.x - end[0], k.z - end[1]) < 0.5 && k.r >= 3));
});

test('buildPool with nothing more builds what chapter 5 built: the same sections, keep and views', () => {
  const world = { THREE, heightAt: (x, z) => terrain.heightAt(x, z) };
  const options = poolOptions(world);
  assert.equal(options.route, ROUTE);
  assert.equal(options.grey, false);
  assert.deepEqual(options.at, [FAR_POOL.center]);
  assert.deepEqual(options.keep, KEEP);
  assert.deepEqual(options.views, viewsOf(world));
  // chapter 5's kept ground: its 18 circles (the choir's seats but the frogs', Egill's and Mosi's spots), as they were
  assert.equal(KEEP.length, 18);
  const sum = KEEP.reduce((s, k) => s + k.x + 2 * k.z + 3 * k.r, 0);
  assert.ok(Math.abs(sum - KEEP_SUM) < 1e-6, `the kept ground is chapter 5's (${sum})`);
  // with the ford: its spot more, its views and its keep after chapter 5's
  const more = poolOptions(world, { at: [FORD.centre], views: ARDALUR_VIEWS, keep: ARDALUR_KEEP });
  assert.deepEqual(more.at, [FAR_POOL.center, FORD.centre]);
  assert.deepEqual(more.keep, [...KEEP, ...ARDALUR_KEEP]);
  assert.equal(more.views.length, options.views.length + ARDALUR_VIEWS.length);
  for (const v of more.views) assert.ok(v.position.isVector3 && v.looks.every(p => p.isVector3), 'views as the valley takes them');
  // the same sections as chapter 5's one spot
  const scene = () => ({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200), flightU: null });
  const sorted = place => [...place.stats.built].sort((a, b) => a - b);
  const one = createArdalur(scene(), { grey: true, route: ROUTE, at: FAR_POOL.center });
  const pool = createArdalur(scene(), { grey: true, route: ROUTE, at: options.at });
  assert.deepEqual(sorted(pool), sorted(one));
  one.dispose();
  pool.dispose();
});
// chapter 5's KEEP as it stood in kafli5.js before it moved (2026-11-21)
const KEEP_SUM = -14937.170225784283;

// The ford's stones as the chapter builds them in the real look: the valley's own rocks, standing on the river bed
const fordStones = () => createSteppingStones({ THREE, scene: new THREE.Scene(), heightAt: (x, z) => terrain.heightAt(x, z) }, {
  steps: STEPS, level: FORD.level, sizes: STONE, heightAt: (x, z) => terrain.heightAt(x, z), library: createSpeciesLibrary(4),
});
/** A stone's points over the water, in the world: the part a child sees. */
function seenOf(stones, id) {
  const mesh = stones.group.children.find(m => m.geometry.userData.stones?.some(r => r.id === id));
  if (mesh) {
    const { start, count } = mesh.geometry.userData.stones.find(r => r.id === id);
    const pos = mesh.geometry.attributes.position;
    return Array.from({ length: count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, start + i)).filter(p => p.y >= FORD.level);
  }
  const wrong = stones.group.children.find(m => m.isInstancedMesh);
  const matrix = stones.matrixOf(id);
  const pos = wrong.geometry.attributes.position;
  return Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(matrix)).filter(p => p.y >= FORD.level);
}
/** How wide a set of points is along the way `heading` (degrees) and across it. */
function widths(points, heading) {
  const h = THREE.MathUtils.degToRad(heading);
  const a = points.map(p => p.x * Math.cos(h) + p.z * Math.sin(h)), b = points.map(p => -p.x * Math.sin(h) + p.z * Math.cos(h));
  return [Math.max(...a) - Math.min(...a), Math.max(...b) - Math.min(...b)];
}

test('each right stone\'s top is dry (STONE.right.up over the river\'s level) and at least 2.8 m across', () => {
  const stones = fordStones();
  const over = crossing(1).heading;
  for (const [step, { stones: list }] of STEPS.entries()) {
    for (const stone of list) {
      const points = seenOf(stones, stone.id);
      const high = Math.max(...points.map(p => p.y));
      const top = stones.topOf(stone.id);
      if (stone.right) {
        assert.ok(Math.abs(high - (FORD.level + STONE.right.up)) < 0.01, `${stone.id}: its top ${(high - FORD.level).toFixed(2)} m over the water`);
        assert.ok(top.y >= FORD.level + STONE.right.up - 0.05, `${stone.id} is flat and dry in the middle: ${(top.y - FORD.level).toFixed(2)} m up`);
        const [a, b] = widths(points, over);
        assert.ok(a >= 2.8 && b >= 2.8, `${stone.id}: ${a.toFixed(2)} by ${b.toFixed(2)} m over the water`);
        // where he stands at the next point of the crossing, his front feet (0.88 m either side) come down on its flat top
        const at = crossing(step + 1);
        const h = THREE.MathUtils.degToRad(at.heading);
        for (const side of [-0.88, 0.88]) {
          const foot = [at.at[0] + Math.cos(h) * MOSI_FRONT - Math.sin(h) * side, at.at[1] + Math.sin(h) * MOSI_FRONT + Math.cos(h) * side];
          const under = stones.surfaceAt(stone.id, ...foot);
          assert.ok(under >= FORD.level + STONE.right.up - 0.12, `${stone.id}: his front foot ${side} on its top (${(under - FORD.level).toFixed(2)} m up)`);
        }
        assert.equal(stones.frogSpot(stone.id), null);
      } else {
        // a wrong one is small and lower: no frog would sit on a right one
        assert.ok(high <= FORD.level + STONE.wrong.up + 0.01 && high < FORD.level + STONE.right.up - 0.05, `${stone.id}: ${(high - FORD.level).toFixed(2)} m up`);
        const [a, b] = widths(points, over);
        assert.ok(Math.max(a, b) <= STONE.wrong.across * 1.15, `${stone.id} is small: ${a.toFixed(2)} by ${b.toFixed(2)} m`);
        const frog = stones.frogSpot(stone.id);
        assert.ok(Math.abs(frog[1] - stones.surfaceAt(stone.id, frog[0], frog[2])) < 1e-6, `${stone.id}: its frog sits on it`);
        // its frog hops 0.6 m the way it faces (critters.js HOP.distance), off the stone into the water, clear of the others
        const [ax, az] = stones.away(stone.id);
        const lands = [frog[0] + ax * 0.6, frog[2] + az * 0.6];
        for (const other of STEPS.flatMap(x => x.stones)) assert.equal(stones.surfaceAt(other.id, ...lands), -Infinity, `${stone.id}'s frog lands on ${other.id}`);
        assert.ok(groundAt(lands) < FORD.level - 0.2, `${stone.id}'s frog lands in the water`);
      }
    }
  }
  stones.dispose();
});

test('from falls_look the rainbow shows (rainbowLevel > 0.5 under LOOKS.lowSun) and the lip is over 40 m away', () => {
  const sun = sunDirection(LOOKS.lowSun);
  const lip = river.at(river.falls);
  for (const aspect of [1.6, 0.625]) {
    const { camera } = cameraOn(SHOTS.ardalur, 'falls_look', aspect, PLACES.ardalur);
    const view = camera.getWorldDirection(new THREE.Vector3());
    assert.ok(rainbowLevel(view, sun) > 0.5, `the rainbow at ${rainbowLevel(view, sun).toFixed(2)} (${aspect})`);
    assert.ok(camera.position.distanceTo(new THREE.Vector3(lip.x, lip.level, lip.z)) > 40, 'the lip far off');
    // and the lip is in the frame: they look down the falls
    const s = onScreen(camera, aspect, new THREE.Vector3(lip.x, lip.level, lip.z));
    assert.ok(s.front && s.x > 0.05 * s.w && s.x < 0.95 * s.w && s.y > 0.1 * s.h && s.y < 0.9 * s.h, `the lip at ${s.x.toFixed(0)}, ${s.y.toFixed(0)}`);
  }
  // nothing is near the drop: Mosi crosses 45 m above it at the nearest
  for (let k = 0; k <= STEPS.length + 2; k++) {
    const n = river.nearest(...crossing(k).at);
    assert.ok(n.d - river.falls > 40, `point ${k} of the crossing ${(n.d - river.falls).toFixed(1)} m from the lip`);
  }
});
