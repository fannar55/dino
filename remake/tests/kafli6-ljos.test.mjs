// Chapter 6's light as one evening after Slóeðla's song, and the far Þórseðla at her own size (the owner's F1 reports 1, 3 and 10 of
// 2026-11-23: "má ekki verða bjart aftur", "þórseðla altof stór", "sól á að vera með nátt húfu frá kafla áður"). Chapter 6 starts
// in chapter 5's closing look (kafli6-looks.js EVENING.afterSong against kafli5-show-score.js's night as engine/show/dusk.js lays it),
// never gets brighter from the pool to the cloud, the sun wears its nightcap from the first frame to the last, and the Þórseðla
// seen from the slope stands on the forest floor with her head a neck over the trees.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as kafli6 from '../chapters/kafli6.js';
import { EVENING, brightness, startEvening } from '../chapters/kafli6-looks.js';
import { LOOK_CUES, lookMixAt } from '../chapters/kafli5-show-score.js';
import { chapter as kafli5 } from '../chapters/kafli5.js';
import { LOOKS, pickLook } from '../engine/looks.js';
import { createDusk } from '../engine/show/dusk.js';
import { lightTo, easeLight } from '../engine/light-blend.js';
import { lightWorld } from './light-world.mjs';
import { playUnattended, chapterWorld } from './chapter-harness.mjs';
import { createSlope } from '../world/fjall/index.js';
import { PRESETS } from '../engine/quality.js';
import { SHOTS } from '../chapters/kafli6-route.js';

const TOLERANCE = 0.02; // a look from the pool to the cloud is never more than 2 % brighter than chapter 5's closing one
const TALLER = [1.25, 1.8]; // the far Þórseðla's height over the forest floor, in the mean height of the trees round her

/** A world as main.js makes one in `look`, with what engine/show/dusk.js also tints: the sky's light on things, the Mosi cloud, a pool. */
function fullWorld(look) {
  const world = lightWorld(look);
  world.scene.environmentIntensity = look.envIntensity;
  const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffffff' }));
  cloud.name = 'MosiCloud';
  world.scene.add(cloud);
  const c = hex => ({ value: new THREE.Color(hex) });
  world.forest = { materials: { water: { uniforms: { uHorizon: c('#cfe6e0'), uZenith: c('#5f9ab0'), uDeep: c('#2f6f70'), uGlint: c('#fff6dc') } } } };
  return world;
}
/** Everything the light is in `world`: colours as sRGB hex and numbers. */
function lightOf(world) {
  const { sun, hemi } = world.lighting;
  const u = world.sky.dome.material.uniforms;
  const w = world.forest.materials.water.uniforms;
  const hex = colour => `#${colour.getHexString()}`;
  return {
    sun: hex(sun.color), sunIntensity: sun.intensity, hemiSky: hex(hemi.color), hemiGround: hex(hemi.groundColor), hemiIntensity: hemi.intensity,
    fog: hex(world.scene.fog.color), zenith: hex(u.uZenith.value), horizon: hex(u.uHorizon.value), glow: hex(u.uGlow.value),
    cloud: hex(u.uCloud.value), cloudShade: hex(u.uCloudShade.value), skyFog: hex(u.uFogColor.value), fogSun: hex(u.uFogSun.value),
    exposure: world.renderer.toneMappingExposure, env: world.scene.environmentIntensity,
    mosiCloud: hex(world.scene.getObjectByName('MosiCloud').material.color),
    water: ['uHorizon', 'uZenith', 'uDeep', 'uGlint'].map(name => hex(w[name].value)),
  };
}
const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

test("chapter 6's first frame is chapter 5's last: the night after the song, to the last colour", () => {
  // chapter 5: its golden afternoon, and the look its show leaves for the last scene (after the good night, the turn done)
  const five = fullWorld(pickLook(kafli5.look));
  const after = LOOK_CUES.at(-1);
  assert.ok(after.look && after.beat > 0, 'the last cue of the show is the calm night');
  const dusk = createDusk(five);
  dusk.mix(lookMixAt(after.beat + 1000));
  dusk.still();
  // chapter 6: its own look at the start (main.js), then the evening it starts in
  const six = fullWorld(pickLook(kafli6.chapter.look));
  startEvening(six);
  const [a, b] = [lightOf(five), lightOf(six)];
  for (const key of Object.keys(a)) {
    const [x, y] = [a[key], b[key]];
    if (typeof x === 'number') assert.ok(Math.abs(x - y) < 1e-9, `${key}: chapter 5 ends at ${x}, chapter 6 starts at ${y}`);
    else for (const [p, q] of [x].flat().map((hex, i) => [hex, [y].flat()[i]])) {
      channels(p).forEach((v, i) => assert.ok(Math.abs(v - channels(q)[i]) <= 1, `${key}: chapter 5 ends at ${p}, chapter 6 starts at ${q}`));
    }
  }
});

test("the evening's water, Mosi cloud and light on things lift with the roar and leave the eased light alone", () => {
  const six = fullWorld(pickLook(kafli6.chapter.look));
  const env = six.scene.environmentIntensity;
  const evening = startEvening(six);
  assert.ok(Math.abs(six.scene.environmentIntensity - EVENING.afterSong.envIntensity) < 1e-9);
  lightTo(six, EVENING.inCloud);
  easeLight(six, LOOKS.afterRoar, 3); // the blow (kafli6.js): the light eases up out of the cloud while the rest lifts
  evening.lift(3);
  for (let t = 0; t < 4; t += 1 / 30) six.effects.update(1 / 30);
  const light = lightOf(six);
  assert.equal(light.zenith, LOOKS.afterRoar.sky.zenith, 'the sky is the light after the roar');
  assert.ok(Math.abs(light.sunIntensity - LOOKS.afterRoar.sun.intensity) < 1e-9, 'the sun the light after the roar');
  assert.ok(Math.abs(light.env - env) < 1e-9, 'the light on things as the place had it');
  assert.equal(light.mosiCloud, '#ffffff');
  evening.restore();
  assert.equal(lightOf(six).zenith, LOOKS.afterRoar.sky.zenith, 'and restore touches nothing else');
});

test('the evening only deepens from the pool to the cloud, and coming up out of it is warmer than the cloud', () => {
  const bound = brightness(EVENING.afterSong);
  const order = [EVENING.afterSong, EVENING.slope, EVENING.inCloud];
  for (let i = 0; i < order.length; i++) {
    const now = brightness(order[i]);
    for (const part of ['sky', 'sun', 'glow']) {
      assert.ok(now[part] <= bound[part] * (1 + TOLERANCE), `${order[i].name}: its ${part} ${now[part].toFixed(4)} over the song's ${bound[part].toFixed(4)}`);
      if (i) assert.ok(now[part] <= brightness(order[i - 1])[part] * (1 + TOLERANCE), `${order[i].name}: its ${part} brighter than ${order[i - 1].name}'s`);
    }
  }
  // the light after the roar (as he picked it) is brighter than the cloud in every part, so the ease up out of it never dips
  const roar = brightness(LOOKS.afterRoar), cloud = brightness(EVENING.inCloud);
  for (const part of ['sky', 'sun', 'glow']) assert.ok(roar[part] > cloud[part], `after the roar its ${part} is over the cloud's`);
  // the characters are seen by the footlights, as at the end of chapter 5: the fill from below at least the song's in every place
  for (const look of order) assert.ok(look.hemi.intensity >= 0.8 * EVENING.afterSong.hemi.intensity, `${look.name}: the footlights`);
});

let played = null;
/** The untouched play, seeking (as a ?t= capture plays it), with the light the chapter asks for and the sun's cap each frame. */
function untouched() {
  played ??= (async () => {
    const frames = [];
    const run = await playUnattended(kafli6, {
      seeking: true, shaped: true, limit: 620,
      onFrame({ world, sunFace }) {
        if (!world.scene.getObjectByName('MosiCloud')) {
          const stand = new THREE.Sprite(new THREE.SpriteMaterial());
          stand.name = 'MosiCloud';
          world.scene.add(stand);
        }
        const c = world.chapterState;
        if (!c) return;
        const face = world.scene.getObjectByName('SunFace');
        const cap = world.scene.getObjectByName('SunNightcap');
        frames.push({
          time: c.s.time, scene: c.scene, look: world.lightLook ?? null, capOn: sunFace.capOn,
          face: Boolean(face?.visible), cap: Boolean(cap?.visible && cap.parent),
        });
      },
    });
    return { run, frames, log: run.world.chapterState.chapterLog };
  })();
  return played;
}

test('the untouched play: it starts in the song\'s night and no look before the roar is brighter than it', async () => {
  const { frames, log } = await untouched();
  const blow = log.find(entry => entry.type === 'blow');
  assert.ok(blow, 'her roar blows the cloud away');
  const first = frames.find(f => f.scene === 1);
  assert.equal(first.look, EVENING.afterSong, 'scene 1 opens in the night after the song');
  const before = frames.filter(f => f.time < blow.at && f.look);
  assert.ok(before.length > 1000);
  const bound = brightness(EVENING.afterSong);
  const looks = [...new Set(before.map(f => f.look))];
  for (const look of looks) {
    const b = brightness(look);
    for (const part of ['sky', 'sun', 'glow']) assert.ok(b[part] <= bound[part] * (1 + TOLERANCE), `${look.name ?? 'a look'}: its ${part} over the song's`);
  }
  // in order: each look the light goes to no brighter than the one before it
  for (let i = 1; i < looks.length; i++) {
    for (const part of ['sky', 'sun']) assert.ok(brightness(looks[i])[part] <= brightness(looks[i - 1])[part] * (1 + TOLERANCE), `${looks[i].name} after ${looks[i - 1].name}`);
  }
  // from the blow to the top the light goes only to the light after the roar (no dusk in between), then the top's sunset
  const later = [...new Set(frames.filter(f => f.time >= blow.at && f.look).map(f => f.look))];
  const named = later.map(look => (look === LOOKS.sunset ? 'sunset' : look.name));
  assert.deepEqual(named, ['after the roar', 'sunset'], `after the blow: ${named.join(', ')}`);
});

test('the sun wears its nightcap from the first frame to the last, wherever its face shows', async () => {
  const { frames } = await untouched();
  assert.ok(frames.length > 3000);
  const bare = frames.filter(f => f.capOn !== 1);
  assert.deepEqual(bare.slice(0, 3).map(f => `${f.capOn} at ${f.time.toFixed(1)} s`), [], 'the cap is on all through');
  const shown = frames.filter(f => f.face);
  assert.ok(shown.length > 1000, 'the face shows outside the cloud');
  const noCap = shown.filter(f => !f.cap);
  assert.deepEqual(noCap.slice(0, 3).map(f => `scene ${f.scene} at ${f.time.toFixed(1)} s`), [], 'the face never shows without its cap');
});

test(`the far Þórseðla stands on the forest floor, her head ${TALLER[0]} to ${TALLER[1]} times the trees round her, and is seen from view_east`, async () => {
  const world = await chapterWorld(kafli6.chapter);
  world.q = PRESETS.tablet;
  const slope = createSlope(world);
  for (let i = 0; i < 50 && !slope.thorsedla.actor; i++) await new Promise(resolve => setTimeout(resolve, 100));
  const actor = slope.thorsedla.actor;
  assert.ok(actor, 'her model loads');
  const shot = SHOTS.hlid.view_east;
  const camera = new THREE.PerspectiveCamera(shot.fov, 1280 / 800, 0.1, 6000);
  camera.position.set(...shot.position);
  camera.lookAt(new THREE.Vector3(...shot.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const px = point => (1 - point.clone().project(camera).y) / 2 * 800;
  let clock = 0;
  for (const until of [1, 15, 30, 45]) {
    for (; clock < until; clock += 0.1) slope.update(0.1, clock);
    actor.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(actor.model);
    const [x, z] = slope.thorsedla.at();
    const near = slope.forest.placements.filter(p => Math.hypot(p.x - x, p.z - z) < 60);
    assert.ok(near.length > 15, `trees round her at ${clock.toFixed(0)} s`);
    const mean = list => list.reduce((sum, v) => sum + v, 0) / list.length;
    const floor = mean(near.map(p => p.y));
    const treeTop = mean(near.map(p => p.y + (p.card.bottom + p.card.height) * p.scale));
    const ratio = (box.max.y - floor) / (treeTop - floor);
    assert.ok(Math.abs(box.min.y - floor) < 3, `at ${clock.toFixed(0)} s her feet at ${box.min.y.toFixed(1)} m, the forest floor at ${floor.toFixed(1)} m`);
    assert.ok(ratio >= TALLER[0] && ratio <= TALLER[1], `at ${clock.toFixed(0)} s she is ${ratio.toFixed(2)} trees tall`);
    // seen: in the frame, and her head and neck at least 12 px over the treetops round her
    const head = new THREE.Vector3(x, box.max.y, z).project(camera);
    assert.ok(Math.abs(head.x) < 0.95 && Math.abs(head.y) < 0.95 && head.z < 1, `in the frame at ${clock.toFixed(0)} s`);
    const over = px(new THREE.Vector3(x, treeTop, z)) - px(new THREE.Vector3(x, box.max.y, z));
    assert.ok(over >= 12, `at ${clock.toFixed(0)} s her head is ${over.toFixed(0)} px over the trees`);
  }
  slope.dispose();
});
