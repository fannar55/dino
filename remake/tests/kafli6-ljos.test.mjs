// Chapter 6's light as one evening after Slóeðla's song, and the far Þórseðla at her own size (the owner's F1 reports 1, 3 and 10 of
// 2026-11-23: "má ekki verða bjart aftur", "þórseðla altof stór", "sól á að vera með nátt húfu frá kafla áður"; and his word on the
// stills: "ekki alveg nótt alveg frá slóeðlu, heldur næstum, svo kemur sólsetur efst á fjalli í sér senu"). Chapter 6 starts nearly
// night (kafli6-looks.js EVENING.pool: between chapter 5's dusk and its night as engine/show/dusk.js mixes them, nearer the night),
// never gets brighter from the pool to the climb, the sunset comes as the top's own scene at above_clouds, the sun wears its nightcap
// from the first frame to the last, and the Þórseðla seen from the slope stands on the forest floor with her head a neck over the trees.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as kafli6 from '../chapters/kafli6.js';
import { EVENING, NEAR, NEARLY_NIGHT, NIGHT_WATER, brightness, showMixOver, startEvening } from '../chapters/kafli6-looks.js';
import { LOOKS as SHOW_LOOKS, LOOK_CUES } from '../chapters/kafli5-show-score.js';
import { chapter as kafli5 } from '../chapters/kafli5.js';
import { LOOKS, pickLook } from '../engine/looks.js';
import { createDusk } from '../engine/show/dusk.js';
import { lightTo, easeLight } from '../engine/light-blend.js';
import { lightWorld } from './light-world.mjs';
import { playUnattended, chapterWorld } from './chapter-harness.mjs';
import { createSlope } from '../world/fjall/index.js';
import { PRESETS } from '../engine/quality.js';
import { SHOTS } from '../chapters/kafli6-route.js';

const TOLERANCE = 0.02; // a look from the pool to the climb is never more than 2 % brighter than the pool's, nor than the one before it
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

test("chapter 6's first frame is nearly night: chapter 5's dusk and night as its show mixes them, nearer the night, to the last colour", () => {
  // chapter 5's own mixer (engine/show/dusk.js) on its golden afternoon, with its dusk and its night at the evening's weights
  const five = fullWorld(pickLook(kafli5.look));
  assert.ok(LOOK_CUES.at(-1).look === 'night' && LOOK_CUES.some(cue => cue.look === 'rose'), 'its show has the dusk and ends in the night');
  createDusk(five).mix(NEARLY_NIGHT);
  const six = fullWorld(pickLook(kafli6.chapter.look));
  startEvening(six);
  const [a, b] = [lightOf(five), lightOf(six)];
  // the water is chapter 5's night water itself (NIGHT_WATER: the dusk's pink made the river a pink ribbon), the same mixer
  const water = fullWorld(pickLook(kafli5.look));
  createDusk(water).mix(NIGHT_WATER);
  a.water = lightOf(water).water;
  for (const key of Object.keys(a)) {
    const [x, y] = [a[key], b[key]];
    if (typeof x === 'number') assert.ok(Math.abs(x - y) < 1e-9, `${key}: the mix is ${x}, chapter 6 starts at ${y}`);
    else for (const [p, q] of [x].flat().map((hex, i) => [hex, [y].flat()[i]])) {
      channels(p).forEach((v, i) => assert.ok(Math.abs(v - channels(q)[i]) <= 1, `${key}: the mix is ${p}, chapter 6 starts at ${q}`));
    }
  }
  // between the dusk and the night, nearer the night: in the sky's and the sun's brightness
  assert.ok(NEAR > 0.5 && NEAR < 1);
  const dusk = brightness(showMixOver(pickLook(kafli5.look), [[SHOW_LOOKS.rose, 1]]));
  const night = brightness(showMixOver(pickLook(kafli5.look), [[SHOW_LOOKS.night, 1]]));
  const now = brightness(EVENING.pool);
  for (const part of ['sky', 'sun']) {
    const k = (now[part] - night[part]) / (dusk[part] - night[part]);
    assert.ok(k > 0.05 && k < 0.5, `its ${part} ${k.toFixed(2)} of the way from the night to the dusk`);
  }
});

test("the evening's water, Mosi cloud and light on things stay until the top, and restore leaves the light alone", () => {
  const six = fullWorld(pickLook(kafli6.chapter.look));
  const env = six.scene.environmentIntensity;
  const evening = startEvening(six);
  assert.ok(Math.abs(six.scene.environmentIntensity - EVENING.pool.envIntensity) < 1e-9);
  lightTo(six, EVENING.inCloud);
  easeLight(six, EVENING.afterRoar, 3); // the blow (kafli6.js)
  for (let t = 0; t < 4; t += 1 / 30) six.effects.update(1 / 30);
  assert.ok(Math.abs(six.scene.environmentIntensity - EVENING.pool.envIntensity) < 1e-9, 'after the roar still the evening');
  lightTo(six, LOOKS.sunset); // the top (kafli6.js)
  evening.restore();
  const light = lightOf(six);
  assert.equal(light.zenith, LOOKS.sunset.sky.zenith, 'the sky is the sunset');
  assert.ok(Math.abs(light.env - env) < 1e-9, 'the light on things as the place had it');
  assert.equal(light.mosiCloud, '#ffffff');
});

test('the evening only deepens from the pool to the climb, and the top is its sunset', () => {
  const bound = brightness(EVENING.pool);
  const order = [EVENING.pool, EVENING.slope, EVENING.inCloud];
  for (let i = 0; i < order.length; i++) {
    const now = brightness(order[i]);
    for (const part of ['sky', 'sun', 'glow']) {
      assert.ok(now[part] <= bound[part] * (1 + TOLERANCE), `${order[i].name}: its ${part} ${now[part].toFixed(4)} over the pool's ${bound[part].toFixed(4)}`);
      if (i) assert.ok(now[part] <= brightness(order[i - 1])[part] * (1 + TOLERANCE), `${order[i].name}: its ${part} brighter than ${order[i - 1].name}'s`);
    }
  }
  // after the roar: the slope's sky again, no brighter, no gold; only the air clearer
  const roar = brightness(EVENING.afterRoar), slope = brightness(EVENING.slope);
  for (const part of ['sky', 'sun', 'glow']) assert.ok(roar[part] <= slope[part] * (1 + TOLERANCE), `after the roar its ${part}`);
  assert.ok(EVENING.afterRoar.fog.density < EVENING.slope.fog.density, 'a clearer air');
  // the top's sunset is the warmest picture, and as he picked it
  for (const part of ['sky', 'sun']) assert.ok(brightness(LOOKS.sunset)[part] > bound[part], `the sunset's ${part}`);
  // the characters are seen by the footlights, as at the end of chapter 5
  for (const look of [...order, EVENING.afterRoar]) assert.ok(look.hemi.intensity >= 0.8 * EVENING.pool.hemi.intensity, `${look.name}: the footlights`);
});

let played = null;
/** The untouched play, seeking (as a ?t= capture plays it), with the light the chapter asks for and the sun's cap each frame. */
function untouched() {
  played ??= (async () => {
    const frames = [];
    const run = await playUnattended(kafli6, {
      seeking: true, shaped: true, limit: 620,
      onFrame({ world, sunFace, ui }) {
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
          time: c.s.time, scene: c.scene, shot: c.shotLabel ?? null, place: world.location, fade: ui.fadeLevel, look: world.lightLook ?? null, capOn: sunFace.capOn,
          face: Boolean(face?.visible), cap: Boolean(cap?.visible && cap.parent),
        });
      },
    });
    return { run, frames, log: run.world.chapterState.chapterLog };
  })();
  return played;
}

test("the untouched play: nearly night from the first frame, never brighter to the climb, and the sunset the top's own scene", async () => {
  const { frames, log } = await untouched();
  const blow = log.find(entry => entry.type === 'blow');
  assert.ok(blow, 'her roar blows the cloud away');
  const first = frames.find(f => f.scene === 1);
  assert.equal(first.look, EVENING.pool, 'scene 1 opens nearly night');
  const above = frames.findIndex(f => f.look === LOOKS.sunset);
  assert.ok(above > 0 && frames.slice(above).some(f => f.shot === 'above_clouds'), 'they come up above the clouds in the sunset');
  const before = frames.slice(0, above).filter(f => f.look);
  assert.ok(before.length > 1000);
  const bound = brightness(EVENING.pool);
  const looks = [...new Set(before.map(f => f.look))];
  for (const look of looks) {
    const b = brightness(look);
    for (const part of ['sky', 'sun', 'glow']) assert.ok(b[part] <= bound[part] * (1 + TOLERANCE), `${look.name ?? 'a look'}: its ${part} over the pool's`);
  }
  assert.deepEqual(looks.map(look => look.name), [EVENING.pool, EVENING.slope, EVENING.inCloud, EVENING.afterRoar].map(look => look.name), 'the evening, in order');
  // a scene of its own: the light turns to the sunset under the black of the cut to the top (s.goTo's fade), holds there to the end,
  // and the frame before the black came down was nearly night
  assert.ok(frames[above].fade > 0.99 && frames[above].place === 'toppur', `the sunset comes under the black (fade ${frames[above].fade})`);
  assert.deepEqual(frames.slice(above).filter(f => f.look !== LOOKS.sunset).slice(0, 3).map(f => `${f.shot} at ${f.time.toFixed(1)} s`), [], 'the sunset holds on the top');
  assert.equal(frames[above - 1].look, EVENING.afterRoar, 'the last frame before it is nearly night');
  const lastSeen = frames.slice(0, above).findLast(f => f.fade < 0.01);
  assert.equal(lastSeen.look, EVENING.afterRoar, 'and so is the last frame seen before the black');
  // and the top is never seen through the climb's camera: the cut to above_clouds is under the black too, so the picture that
  // comes up out of it is the top's own first shot
  const wrong = frames.filter(f => f.place === 'toppur' && f.fade < 0.99 && !['above_clouds', 'top_wide'].includes(f.shot));
  assert.deepEqual(wrong.slice(0, 3).map(f => `${f.shot} at ${f.time.toFixed(2)} s (fade ${f.fade.toFixed(2)})`), [], 'the top seen through another scene\'s camera');
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
