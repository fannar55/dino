// The festival's top as data (chapters/hatid-route.js): where chapter 6 leaves Grameðla and Mosi, where everyone stands in each
// scene, the stage's place, the sky's places, the arrivals' ways and every shot; and the two still tap shots, the sun's and the six
// stars', on an upright tablet (0.625) and a wide one (1.6) (the plan's Review Focus 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BEARING, floorPoint, FRIENDS8, MODELS, LENGTH, HEAD, standsOf, STAGE, FLOOR, ARRIVALS, arrivalOf, SKY, STAR_TAP, SUN_TAP, starOver,
  SHOTS, SHOWS, SCENE, tallShot, sunShot, starsShot, BUDGET, partyPlace,
} from '../chapters/hatid-route.js';
import { loadCharacter } from './characters.mjs';
import { TOP_END, topEnd } from '../chapters/kafli6-route.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { createTop } from '../world/fjall/top.js';
import { FJALL } from '../world/fjall/ground.js';
import { LIMITS, createDirector } from '../engine/camera/director.js';
import { createPointResolver } from '../engine/points.js';

// The top as the festival builds it (grey: the same ground, rim and ways up as the look's)
const top = createTop({ THREE, scene: new THREE.Scene() }, { grey: true });
const STANDS = standsOf(top);
const place = { ground: (x, z) => top.heightAt(x, z) };
const rad = THREE.MathUtils.degToRad;
const way = heading => [Math.cos(rad(heading)), Math.sin(rad(heading))];
const away = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const offOf = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const headingTo = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const SIZE = { 1.6: [1280, 800], 0.625: [800, 1280] };
const BIG = FRIENDS8.filter(f => f !== 'egill');
const SUN_SHOTS = ['lineup_sun', 'sun_faces']; // the two that look at the sun (as chapter 5's set_sun: the light low, his nightcap on)
const UNDER_THE_SUN = ['top_empty', ...ARRIVALS.flatMap(a => [`arrive_${a.friend}`, `home_${a.friend}`]), ...SUN_SHOTS]; // scene 1, before the sun has set

/** The shot for a screen `aspect` wide: the upright frame where the shot has one. */
const shotFor = (name, aspect) => (aspect < 1 && tallShot(name)) || SHOTS.toppur[name];

/** A camera cut to `shot` by the real director on a screen `aspect` wide; where things land on it. */
function project(shot, aspect, stands = STANDS.dark) {
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 4000);
  const world = { camera, heightAt: place.ground, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const director = createDirector({ camera, world, shots: {}, lint: false });
  director.cut(shot, { check: false });
  camera.updateMatrixWorld();
  const [w, h] = SIZE[aspect];
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  /** Where `point` lands, in pixels, and how wide `radius` m across the view is there. */
  const at = (point, radius = 0) => {
    const p = point.clone().project(camera);
    const q = point.clone().addScaledVector(right, radius).project(camera);
    const ahead = point.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) > 0;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, front: ahead && p.z < 1, r: (Math.abs(q.x - p.x) / 2) * w, w, h };
  };
  /** A point of `who` standing as `stands` says: [ahead, up] m in her frame (Egill on her head: ON_HER in hers). */
  const pointOf = (who, [ahead, up]) => {
    const stand = stands[who];
    const host = stand.on ? stands[stand.on] : stand;
    const [fx, fz] = way(host.heading);
    const [x, z] = host.at;
    return new THREE.Vector3(x + fx * ahead, place.ground(x, z) + up, z + fz * ahead);
  };
  const headPart = who => (stands[who].on ? HEAD.onHerHead : HEAD[who]);
  return {
    camera, director, w, h,
    head: who => at(pointOf(who, headPart(who))),
    /** her span across the screen: her snout's, her middle's and her tail's x */
    span: who => {
      if (stands[who].on) return [at(pointOf(who, headPart(who))).x, at(pointOf(who, headPart(who))).x];
      const l = LENGTH[who];
      const xs = [HEAD[who], [0, HEAD[who][1] * 0.6], [-l / 2, 1]].map(p => at(pointOf(who, p)).x);
      return [Math.min(...xs), Math.max(...xs)];
    },
    /** a place on the sky (azimuth, elevation in degrees) and its tap circle of `degrees` round it */
    sky: ({ azimuth, elevation }, degrees = 0) => {
      const d = new THREE.Vector3(Math.cos(rad(elevation)) * Math.cos(rad(azimuth)), Math.sin(rad(elevation)), Math.cos(rad(elevation)) * Math.sin(rad(azimuth)));
      const p = camera.position.clone().addScaledVector(d, 600);
      return at(p, 600 * Math.tan(rad(degrees)));
    },
    at,
    /** on the screen with `margin` of it free at the sides, clear of the star counter (top 8 %) and the captions (bottom 15 %) */
    inFrame: (s, margin = 0.04) => s.front && s.x - s.r >= margin * w && s.x + s.r <= (1 - margin) * w && s.y - s.r >= Math.max(margin, 0.08) * h && s.y + s.r <= 0.85 * h,
  };
}

/** The shot's static rules (as chapter 6's): lens, height over the top's own ground, not top-down; the sun off its axis while it is up. */
function rulesHold(name, shot) {
  const [x, y, z] = shot.position;
  assert.ok(shot.fov >= LIMITS.lens[0] && shot.fov <= LIMITS.lens[1], `${name}: a ${shot.fov} degree lens`);
  const height = y - place.ground(x, z);
  assert.ok(height >= 0.3 && height <= LIMITS.maxHeight, `${name}: the camera ${height.toFixed(2)} m over the ground`);
  const [tx, ty, tz] = shot.target;
  const down = (Math.atan2(y - ty, Math.hypot(tx - x, tz - z)) * 180) / Math.PI;
  assert.ok(down <= LIMITS.maxDown, `${name} looks ${down.toFixed(0)} degrees down`);
  if (UNDER_THE_SUN.includes(name) && !SUN_SHOTS.includes(name)) {
    const off = offOf(headingTo([x, z], [tx, tz]), BEARING.sun);
    assert.ok(off >= 35, `${name}: the sun ${off.toFixed(0)} degrees off its axis`);
  }
}

const standing = stands => Object.entries(stands).filter(([, s]) => !s.on);

test('the festival starts where chapter 6 ends: topEnd is the stop of its last scene', () => {
  assert.deepEqual(TOP_END, { way: 126, walk: 4, side: 5.5 });
  // what kafli6.js did with its own constants: up her way at 126 degrees to its inside point, 4 m on toward her room, Mosi 5.5 m on
  // her right and 1 m back, having run there from 1.2 m ahead of her inside point on her right
  const slope = top.wayUp(rad(126));
  const room = top.room.find(r => r.friend === 'gramedla').at;
  const towards = headingTo(slope[2], room);
  const [fx, fz] = way(towards);
  const stop = [slope[2][0] + fx * 4, slope[2][1] + fz * 4];
  const mosi = [stop[0] - fx - fz * 5.5, stop[1] - fz + fx * 5.5];
  const end = topEnd(top);
  assert.ok(away(end.her.at, stop) < 1e-9 && offOf(end.her.heading, towards) < 1e-9, `her stop ${end.her.at}`);
  assert.ok(away(end.mosi.at, mosi) < 1e-9, `his stop ${end.mosi.at}`);
  assert.ok(offOf(end.mosi.heading, towards) < 10, 'he has run on beside her, the way she goes');
  // and the festival's first scene stands them there, Egill on her head
  assert.deepEqual(STANDS.start.gramedla, end.her);
  assert.deepEqual(STANDS.start.mosi, end.mosi);
  assert.equal(STANDS.start.egill.on, 'gramedla');
  // the five who come up stand where they come up, each on her way's inside point
  for (const a of ARRIVALS) assert.deepEqual(STANDS.start[a.friend], (({ at, heading }) => ({ at, heading }))(arrivalOf(top, a.friend)));
  // the models, as fjall-toppur.js names them, and Mosi's and Egill's
  assert.deepEqual(MODELS, {
    thorsedla: 'brontosaurus', kambedla: 'stegosaurus', uggedla: 'spinosaurus', sloedla: 'parasaurolophus', flugedla: 'pteranodon', gramedla: 'trex',
    mosi: 'mosi', egill: 'egill',
  });
});

test('everyone has a stand in every scene, inside the flat, no two bodies overlapping', () => {
  assert.deepEqual(Object.keys(STANDS).sort(), ['dark', 'farewell', 'gather', 'party', 'start']);
  assert.deepEqual(FRIENDS8, ['gramedla', 'mosi', 'egill', 'flugedla', 'kambedla', 'uggedla', 'thorsedla', 'sloedla']);
  for (const [scene, stands] of Object.entries(STANDS)) {
    assert.deepEqual(Object.keys(stands).sort(), [...FRIENDS8].sort(), scene);
    for (const [who, s] of Object.entries(stands)) {
      if (s.on) { assert.equal(who, 'egill'); assert.equal(s.on, 'gramedla'); continue; }
      assert.ok(Number.isFinite(s.heading) && s.at.length === 2, `${scene}: ${who}`);
      if (scene === 'start') continue; // chapter 6's stop, on the brow (top.wayUp: 1.2 m past the flat)
      assert.ok(Math.hypot(...s.at) + LENGTH[who] / 2 <= FJALL.top.radius, `${scene}: ${who} inside the flat (${Math.hypot(...s.at).toFixed(1)} m out)`);
    }
    const list = standing(stands);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [a, sa] = list[i], [b, sb] = list[j];
      const d = away(sa.at, sb.at);
      if (scene === 'start' && [a, b].sort().join() === 'gramedla,mosi') {
        // chapter 6's own stop: side by side, he TOP_END.side m on her right, the same way (closer than their discs: bodies abreast)
        assert.ok(d >= TOP_END.side && offOf(sa.heading, sb.heading) <= 10, `start: Mosi abreast of her, ${d.toFixed(2)} m`);
        continue;
      }
      assert.ok(d >= (LENGTH[a] + LENGTH[b]) / 2, `${scene}: ${a} and ${b} ${d.toFixed(2)} m apart, ${((LENGTH[a] + LENGTH[b]) / 2).toFixed(2)} needed`);
    }
  }
  // the farewell and the dark: an arc open to the sun, each facing it, nobody in another's way to it, the big ones 6 m or more from
  // the next, Mosi beside Grameðla (her nearest), Egill on her head
  for (const scene of ['farewell', 'dark']) {
    const stands = STANDS[scene];
    assert.equal(stands.egill.on, 'gramedla', `${scene}: Egill on her head`);
    const list = standing(stands);
    const [sx, sz] = way(BEARING.sun);
    const sunward = s => s.at[0] * sx + s.at[1] * sz; // m toward the sun from the top's middle
    for (const [who, s] of list) {
      assert.ok(offOf(s.heading, BEARING.sun) <= 30, `${scene}: ${who} faces the sun`);
      assert.ok(sunward(s) <= 0, `${scene}: ${who} on the sun's side of the middle (nobody stands out between the others and it)`);
    }
    assert.equal(list.length, 7);
    // along the arc: its ends nearer the sun than its middle, nearer and nearer from the middle out (an arc open to the sun)
    const order = list.map(([who, s]) => ({ who, s, b: ((headingTo([0, 0], s.at) - BEARING.sun + 360) % 360) })).sort((a, b) => a.b - b.b);
    const deepest = order.reduce((k, o, i) => (sunward(o.s) < sunward(order[k].s) ? i : k), 0);
    assert.ok(deepest > 0 && deepest < order.length - 1, `${scene}: its middle is not an end`);
    for (let i = 1; i < order.length; i++) {
      assert.ok(away(order[i].s.at, order[i - 1].s.at) >= 6, `${scene}: ${order[i].who} 6 m or more from ${order[i - 1].who}`);
      const [near, far] = i <= deepest ? [order[i], order[i - 1]] : [order[i - 1], order[i]];
      assert.ok(sunward(far.s) > sunward(near.s), `${scene}: ${far.who} nearer the sun than ${near.who}, further out along the arc`);
    }
    const nearest = list.filter(([who]) => who !== 'gramedla').sort((a, b) => away(a[1].at, stands.gramedla.at) - away(b[1].at, stands.gramedla.at))[0][0];
    assert.equal(nearest, 'mosi', `${scene}: Mosi beside Grameðla`);
  }
  // the gathering: a ring round Egill, everyone 7 m or more from him and turned to him
  const { gather } = STANDS;
  for (const [who, s] of standing(gather)) {
    if (who === 'egill') continue;
    assert.ok(away(s.at, gather.egill.at) >= 7, `gather: ${who} ${away(s.at, gather.egill.at).toFixed(1)} m from Egill`);
    assert.ok(offOf(s.heading, headingTo(s.at, gather.egill.at)) <= 20, `gather: ${who} turned to him`);
  }
  const round = standing(gather).filter(([w]) => w !== 'egill').map(([, s]) => headingTo(gather.egill.at, s.at)).sort((a, b) => a - b);
  const gaps = round.map((b, i) => (i ? b - round[i - 1] : b + 360 - round[round.length - 1]));
  assert.ok(Math.max(...gaps) <= 120, `gather: a ring round him (its widest gap ${Math.max(...gaps).toFixed(0)} degrees)`);
});

test('in the party everyone faces the child and nobody stands between the child and Egill', () => {
  const { party } = STANDS;
  // the child, at the flat's rim on its bearing; his line to Egill
  const child = [Math.cos(rad(BEARING.child)) * FJALL.top.radius, Math.sin(rad(BEARING.child)) * FJALL.top.radius];
  for (const [who, s] of standing(party)) {
    assert.ok(offOf(s.heading, headingTo(s.at, child)) <= 25, `${who} faces the child (${s.heading.toFixed(0)}, ${headingTo(s.at, child).toFixed(0)})`);
    if (who === 'egill') continue;
    const e = party.egill.at;
    const l = away(child, e);
    const [ux, uz] = [(e[0] - child[0]) / l, (e[1] - child[1]) / l];
    const t = Math.max(0, Math.min(l, (s.at[0] - child[0]) * ux + (s.at[1] - child[1]) * uz));
    const near = away(s.at, [child[0] + ux * t, child[1] + uz * t]);
    assert.ok(near >= LENGTH[who] / 2, `${who} between the child and Egill (${near.toFixed(2)} m from his line)`);
  }
  // Slóeðla and Flugeðla on the stage, round its middle
  for (const who of ['sloedla', 'flugedla']) assert.ok(away(party[who].at, STAGE.centre) <= STAGE.radius, `${who} on the stage`);
  assert.deepEqual(STAGE.centre, floorPoint(0, 30));
  assert.ok(away(floorPoint(0, 30), [0, 0]) - 30 < 1e-9 && offOf(headingTo([0, 0], floorPoint(0, 30)), BEARING.stage) < 1e-9);
  assert.ok(offOf(headingTo(floorPoint(0, 0), floorPoint(5, 0)), BEARING.stage + 90) < 1e-9, 'across is to the child\'s right');
  assert.deepEqual({ ...STAGE, centre: undefined }, { centre: undefined, stones: 9, arc: 150, radius: 9, height: [0.6, 1.4] });
  assert.deepEqual(FLOOR, { radius: 30, count: 420 });
});

test('upright and wide: the sun is in sunShot with a tap circle of 60 px or more, clear of every friend', () => {
  for (const aspect of [1.6, 0.625]) {
    const shot = sunShot(aspect);
    rulesHold(`sunShot(${aspect})`, shot);
    const view = project(shot, aspect, STANDS.farewell);
    assert.deepEqual(view.director.warnings, []);
    const sun = view.sky(SKY.sun, SUN_TAP);
    assert.ok(view.inFrame(sun, 0.04), `the sun at ${aspect}: ${sun.x.toFixed(0)}, ${sun.y.toFixed(0)} ± ${sun.r.toFixed(0)}`);
    assert.ok(sun.r >= 60, `its tap circle ${sun.r.toFixed(0)} px at ${aspect}`);
    for (const who of FRIENDS8) {
      const head = view.head(who);
      const [lo, hi] = view.span(who);
      const d = Math.hypot(head.x - sun.x, head.y - sun.y);
      assert.ok(!head.front || d >= sun.r * 1.1, `${who}'s head in the sun's circle at ${aspect}`);
      // under it where she is across it: her head below its circle
      if (head.front && hi >= sun.x - sun.r && lo <= sun.x + sun.r) assert.ok(head.y >= sun.y + sun.r, `${who} under the sun at ${aspect}`);
    }
    // Mosi, who asks, and Egill, who taps, with her
    for (const who of SHOWS.lineup_sun) assert.ok(view.inFrame(view.head(who), 0.04), `${who} in sunShot at ${aspect}`);
  }
  assert.ok(SUN_TAP === 6.5 && offOf(SKY.sun.azimuth, BEARING.sun) < 1e-9);
});

test('upright and wide: the six stars are in starsShot, each within its friend\'s span on the screen and above her, tap circles apart', () => {
  for (const aspect of [1.6, 0.625]) {
    const view = project(starsShot(aspect), aspect);
    assert.deepEqual(view.director.warnings, []);
    const stars = FRIENDS.map(f => view.sky(SKY.stars[f.key], STAR_TAP));
    for (const [i, star] of stars.entries()) {
      assert.ok(view.inFrame(star, 0.04), `${FRIENDS[i].key} at ${aspect}`);
      assert.ok(star.y < view.head(FRIENDS[i].key).y, 'above its friend');
      const [lo, hi] = view.span(FRIENDS[i].key);
      assert.ok(star.x >= lo - 2 && star.x <= hi + 2, `${FRIENDS[i].key}'s star over her at ${aspect}: ${star.x.toFixed(0)} in ${lo.toFixed(0)}..${hi.toFixed(0)}`);
      assert.ok(star.r >= 28, `${FRIENDS[i].key}'s tap circle ${star.r.toFixed(0)} px at ${aspect}`);
      for (const other of stars.slice(i + 1)) assert.ok(Math.hypot(star.x - other.x, star.y - other.y) >= star.r + other.r);
    }
    // nobody else's head nearer a star than its own friend's
    for (const [i, star] of stars.entries()) {
      const mine = Math.abs(view.head(FRIENDS[i].key).x - star.x);
      for (const f of FRIENDS) if (f.key !== FRIENDS[i].key) assert.ok(Math.abs(view.head(f.key).x - star.x) > mine, `${FRIENDS[i].key}'s star nearer ${f.key} at ${aspect}`);
    }
  }
  // the stars hang where starOver puts them over their friends, in two rows; a still shot, the same place for both screens
  assert.deepEqual(starsShot(1.6).position, starsShot(0.625).position);
  assert.deepEqual(starsShot(1.6).target, starsShot(0.625).target);
  const rows = [...new Set(FRIENDS.map(f => SKY.stars[f.key].elevation))].sort((a, b) => a - b);
  assert.ok(rows.length === 2 && rows[1] - rows[0] >= 10 && rows[0] >= 20, `two rows: ${rows}`);
  for (const f of FRIENDS) for (const aspect of [1.6, 0.625]) assert.ok(offOf(SKY.stars[f.key].azimuth, starOver(f.key, STANDS.dark, starsShot(aspect))) < 1e-9);
  assert.equal(STAR_TAP, 3.6);
  assert.deepEqual([SKY.moon, SKY.seventh], [{ azimuth: 45, elevation: 7 }, { azimuth: 45, elevation: 58 }]);
});

test('no arrival comes up within 30 degrees of another or of the south-west', () => {
  assert.deepEqual(ARRIVALS.map(a => a.friend), ['flugedla', 'kambedla', 'uggedla', 'thorsedla', 'sloedla']);
  for (const [i, a] of ARRIVALS.entries()) {
    assert.equal(a.seconds, 15);
    assert.match(a.line, new RegExp(`^h_${a.friend}_`));
    assert.ok(offOf(a.way, TOP_END.way) >= 30, `${a.friend} by the way Grameðla came up`);
    assert.ok(offOf(a.way, BEARING.sun) >= 30, `${a.friend} out of the sun`);
    for (const b of ARRIVALS.slice(i + 1)) assert.ok(offOf(a.way, b.way) >= 30, `${a.friend} and ${b.friend}`);
    // she comes up her way onto the brow, facing in
    const up = arrivalOf(top, a.friend);
    assert.deepEqual(up.way, top.wayUp(rad(a.way)));
    assert.deepEqual(up.at, up.way[2]);
    assert.ok(offOf(up.heading, headingTo(up.way[1], up.way[2])) < 1e-9);
  }
});

const NAMES = [
  'top_empty', ...ARRIVALS.flatMap(a => [`arrive_${a.friend}`, `home_${a.friend}`]), 'lineup_sun', 'sun_faces', 'dark_wait', 'first_star', 'roar_up', 'sea_ring',
  'stars_wide', 'egill_down', 'moon_peek', 'stage_front', 'party_wide', 'party_high', 'floor_low', 'egill_mosi', 'sky_dance',
  ...FRIENDS.map(f => `solo_${f.key}`), 'moon_close', 'final_pose', 'gather', 'seventh_sky', 'lift_side', 'mosi_up', 'rise_down',
];
// what of the sky each shot must hold
const SKY_SHOTS = { lineup_sun: [SKY.sun], sun_faces: [SKY.sun], first_star: [SKY.first], moon_peek: [SKY.moon], moon_close: [SKY.moon], seventh_sky: [SKY.seventh], sky_dance: FRIENDS.map(f => SKY.stars[f.key]) };

test('every shot keeps the director quiet (LIMITS) and shows who SHOWS names, wide and upright', () => {
  assert.deepEqual(Object.keys(SHOTS), ['toppur']);
  assert.deepEqual(Object.keys(SHOTS.toppur).sort(), [...NAMES].sort());
  assert.deepEqual(Object.keys(SHOWS).sort(), [...NAMES].sort());
  assert.deepEqual(Object.keys(SCENE).sort(), [...NAMES].sort());
  assert.deepEqual(SHOTS.toppur.lineup_sun, sunShot(1.6));
  assert.deepEqual(SHOTS.toppur.stars_wide, starsShot(1.6));
  assert.deepEqual(tallShot('stars_wide') ?? SHOTS.toppur.stars_wide, starsShot(0.625));
  for (const name of NAMES) {
    for (const aspect of [1.6, 0.625]) {
      const shot = shotFor(name, aspect);
      rulesHold(`${name} at ${aspect}`.replace(/ at .*/, ''), shot);
      const stands = STANDS[SCENE[name]];
      const view = project(shot, aspect, stands);
      assert.deepEqual(view.director.warnings, [], `${name} at ${aspect}`);
      for (const who of SHOWS[name]) {
        assert.ok(stands[who], `${name}: where ${who} stands`);
        const s = view.head(who);
        assert.ok(s.front && s.x >= 0.04 * s.w && s.x <= 0.96 * s.w && s.y >= 0.08 * s.h && s.y <= 0.85 * s.h,
          `${who} in ${name} at ${aspect}: ${s.x.toFixed(0)}, ${s.y.toFixed(0)} of ${s.w} x ${s.h}`);
      }
      if (name === 'mosi_up') {
        // Mosi looking up after Egill: his head well clear of the lens and low in the frame, the sky over him
        const s = view.head('mosi');
        const [ahead, up] = HEAD.mosi;
        const { at, heading } = stands.mosi;
        const head = new THREE.Vector3(at[0] + Math.cos(rad(heading)) * ahead, place.ground(...at) + up, at[1] + Math.sin(rad(heading)) * ahead);
        assert.ok(view.camera.position.distanceTo(head) >= 6, `mosi_up ${view.camera.position.distanceTo(head).toFixed(1)} m from his head at ${aspect}`);
        assert.ok(s.y >= 0.45 * s.h, `room over Mosi in mosi_up at ${aspect}: his head at ${s.y.toFixed(0)} of ${s.h}`);
      }
      for (const [k, p] of (SKY_SHOTS[name] ?? []).entries()) assert.ok(view.inFrame(view.sky(p), 0.04), `${name}'s sky ${k} at ${aspect}`);
    }
  }
});

test('in the party the six hang lower and closer (SKY.party), each star in party_wide at both sizes, clear of the moon and of each other', () => {
  assert.deepEqual([SKY.span, SKY.party.lower, SKY.party.gather, SKY.party.span], [9, 16, 0.62, 11]);
  const [px, , pz] = SHOTS.toppur.party_wide.position, [tx, , tz] = SHOTS.toppur.party_wide.target;
  const middle = Math.atan2(tz - pz, tx - px) / rad(1);
  for (const f of FRIENDS) {
    const { azimuth, elevation } = SKY.stars[f.key];
    const [da, de] = SKY.party.nudge[f.key] ?? [0, 0];
    const place = partyPlace(f.key);
    assert.ok(Math.abs(place.elevation - (elevation - SKY.party.lower + de)) < 1e-9, `${f.key} ${SKY.party.lower} degrees lower`);
    assert.ok(offOf(place.azimuth, middle + offOf(azimuth, middle) * Math.sign(((azimuth - middle + 540) % 360) - 180) * SKY.party.gather + da) < 0.01, `${f.key} gathered to the middle`);
    assert.deepEqual(partyPlace(f.key), place, 'pure');
  }
  for (const aspect of [1.6, 0.625]) {
    const view = project(shotFor('party_wide', aspect), aspect, STANDS.party);
    const moon = view.sky(SKY.moon);
    const stars = FRIENDS.map(f => [f.key, view.sky(partyPlace(f.key))]);
    for (const [key, star] of stars) {
      assert.ok(view.inFrame(star, 0.02), `${key}'s star in party_wide at ${aspect}`);
      assert.ok(Math.hypot(star.x - moon.x, star.y - moon.y) > 0.05 * star.w, `${key}'s star off the moon at ${aspect}`);
    }
    for (let i = 0; i < stars.length; i++) for (let j = i + 1; j < stars.length; j++) {
      const [a, b] = [stars[i][1], stars[j][1]];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.05 * a.w, `${stars[i][0]} and ${stars[j][0]} apart at ${aspect}`);
    }
  }
});

test('party_wide holds all eight, the stage and the moon\'s place; no solo shot holds more than three big friends', () => {
  for (const aspect of [1.6, 0.625]) {
    const view = project(shotFor('party_wide', aspect), aspect, STANDS.party);
    for (const who of FRIENDS8) assert.ok(view.inFrame(view.head(who), 0.04), `${who} in party_wide at ${aspect}`);
    // the stage: its middle and the ends of its half ring of stones (behind it, open to the child)
    const [cx, cz] = STAGE.centre;
    const g = place.ground(cx, cz);
    for (const b of [0, -STAGE.arc / 2, STAGE.arc / 2]) {
      const [dx, dz] = way(BEARING.stage + b);
      const s = view.at(new THREE.Vector3(cx + dx * STAGE.radius, g + STAGE.height[0], cz + dz * STAGE.radius));
      assert.ok(view.inFrame(s, 0.04), `the stage's stones at ${b} at ${aspect}`);
    }
    assert.ok(view.inFrame(view.sky(SKY.moon), 0.04), `the moon's place at ${aspect}`);
    for (const f of FRIENDS) {
      const solo = project(shotFor(`solo_${f.key}`, aspect), aspect, STANDS.party);
      assert.ok(solo.inFrame(solo.head(f.key), 0.04), `${f.key} in her solo at ${aspect}`);
      const seen = BIG.filter(who => solo.inFrame(solo.head(who), 0));
      assert.ok(seen.length <= 3, `solo_${f.key} at ${aspect} holds ${seen.join(', ')}`);
    }
  }
});

// The party's widest shot against the tablet's budget (STYLE.md 11; the plan's Global Constraints): measured in grey with stand-ins
// (Task 6, qa/remake/hatid/butur2/maeling.md), and the levers applied written into BUDGET.
const LOD = { half: 700, quarter: 200, hysteresis: 0.08 }; // engine/character-lod.js LEVELS and HYSTERESIS
const sizes = (async () => {
  const out = {};
  for (const who of FRIENDS8) {
    const gltf = await loadCharacter(who);
    gltf.scene.updateMatrixWorld(true);
    out[who] = [];
    gltf.scene.traverse(o => {
      if (!o.isSkinnedMesh || (o.geometry.index?.count ?? 0) / 3 < 4000) return;
      o.geometry.computeBoundingBox();
      const box = o.geometry.boundingBox;
      out[who].push({
        diagonal: box.getSize(new THREE.Vector3()).length() * o.matrixWorld.getMaxScaleOnAxis(),
        centre: box.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld),
      });
    });
  }
  return out;
})();

/** How wide each friend draws in `shot` on a screen `aspect` wide, as updateCharacterLods measures it (her bind-pose diagonal, px). */
async function drawnPx(shot, aspect, stands) {
  const view = project(shot, aspect, stands);
  const meshes = await sizes;
  const perUnit = view.h / (2 * Math.tan(rad(view.camera.fov) / 2));
  return Object.fromEntries(FRIENDS8.map(who => {
    const { at, heading } = stands[who].on ? stands[stands[who].on] : stands[who];
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rad(heading));
    const px = Math.max(...meshes[who].map(({ diagonal, centre }) => {
      const c = centre.clone().applyQuaternion(turn).add(new THREE.Vector3(at[0], place.ground(at[0], at[1]), at[1]));
      if (stands[who].on) c.y += HEAD.onHerHead[1];
      return (diagonal * perUnit) / c.distanceTo(view.camera.position);
    }));
    return [who, px];
  }));
}

test('in party_wide no more than three big friends draw over 700 px wide and at least four draw under 200 px, at 1280x800 and 800x1280', async () => {
  for (const aspect of [1.6, 0.625]) {
    const px = await drawnPx(shotFor('party_wide', aspect), aspect, STANDS.party);
    const said = Object.entries(px).map(([who, p]) => `${who} ${p.toFixed(0)}`).join(', ');
    // at full detail: over the half's switch less its slack (a friend coming from a close shot keeps her full skin down to there)
    const full = BIG.filter(who => px[who] >= LOD.half * (1 - LOD.hysteresis));
    assert.ok(full.length <= 3, `at ${aspect} ${full.length} big friends at full detail: ${said}`);
    // at the quarter whatever shot came before: under the quarter's switch less its slack
    const quarter = BIG.filter(who => px[who] < LOD.quarter * (1 - LOD.hysteresis));
    assert.ok(quarter.length >= 4, `at ${aspect} only ${quarter.join(', ') || 'nobody'} at the quarter: ${said}`);
    // the four furthest are BUDGET's, and they are those at the quarter
    for (const who of BUDGET.far) assert.ok(quarter.includes(who), `${who} at the quarter at ${aspect}: ${said}`);
  }
  assert.equal(BUDGET.far.length, 4);
  // never more than three big friends near the camera in one shot of the party
  for (const name of Object.keys(SCENE).filter(n => SCENE[n] === 'party')) {
    for (const aspect of [1.6, 0.625]) {
      const px = await drawnPx(shotFor(name, aspect), aspect, STANDS.party);
      const view = project(shotFor(name, aspect), aspect, STANDS.party);
      const seen = who => { const s = view.head(who); return s.front && s.x >= 0 && s.x <= s.w && s.y >= 0 && s.y <= s.h; };
      const near = BIG.filter(who => seen(who) && px[who] >= LOD.half * (1 - LOD.hysteresis));
      assert.ok(near.length <= 3, `${name} at ${aspect}: ${near.join(', ')}`);
    }
  }
});

test('BUDGET says what was measured: its three numbers are inside the budget at both sizes', () => {
  assert.deepEqual(BUDGET.limits, { gpuMs: 6, drawCalls: 100, triangles: 250000 });
  assert.deepEqual(Object.keys(BUDGET.measured).sort(), ['1280x800', '800x1280']);
  for (const [size, m] of Object.entries(BUDGET.measured)) {
    for (const key of ['gpuMs', 'drawCalls', 'triangles']) {
      assert.ok(Number.isFinite(m[key]) && m[key] > 0, `${size}: ${key} measured`);
      assert.ok(m[key] <= BUDGET.limits[key], `${size}: ${key} ${m[key]} over ${BUDGET.limits[key]}`);
    }
  }
  // what was measured: party_wide one bar into the dance, all eight, the guests and the light points
  assert.equal(BUDGET.shot, 'party_wide');
  assert.ok(Number.isInteger(BUDGET.guests) && BUDGET.guests >= 14 && BUDGET.guests <= 23, `${BUDGET.guests} guests`);
  assert.equal(BUDGET.lights, 600);
  assert.ok(Array.isArray(BUDGET.levers) && BUDGET.levers.every(l => [1, 2, 3, 4].includes(l)), `levers ${BUDGET.levers}`);
  assert.deepEqual(BUDGET.levers, [...BUDGET.levers].sort(), 'the levers in their order');
  assert.ok(BUDGET.wideBars >= 1 && BUDGET.wideBars <= 4);
});

test.after(() => top.dispose());
