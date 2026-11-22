// Chapter 6's places prepared ahead (main.js prepareLater): the slope (world/fjall/slope.js) is built while the start button shows and
// drawn once in Árdalurinn's place (main.js warmPrepared -> withPlace), and nothing of it may stay in scenes 1 and 2: the camera's far
// plane is Árdalurinn's again, and its far Þórseðla (nine times her size) is not in the picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import * as kafli6 from '../chapters/kafli6.js';
import { chapterWorld } from './chapter-harness.mjs';
import { createLocations } from '../engine/locations.js';
import { SHOTS } from '../chapters/kafli6-route.js';

const FRAME = 1 / 30;

/** main.js's own withPlace, as it is written there, run with this test's world, clock and camera. */
function mainWithPlace(world, clock, camera) {
  const source = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const found = source.match(/\nfunction withPlace\(forest, fn\) \{[\s\S]*?\n\}\r?\n/);
  assert.ok(found, 'main.js has withPlace');
  return new Function('world', 'clock', 'camera', `${found[0]}\nreturn withPlace;`)(world, clock, camera);
}

/** Shown in the picture: it and every parent up to the scene visible. */
function shownIn(scene, object) {
  for (let o = object; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === scene) return true;
  }
  return false;
}

function pose(camera, shot) {
  camera.position.set(...shot.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(new THREE.Vector3(...shot.target));
  camera.updateMatrixWorld();
}

async function until(test, seconds = 60) {
  const end = Date.now() + seconds * 1000;
  while (!test()) {
    if (Date.now() > end) return false;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return true;
}

test('the slope prepared and drawn in Árdalurinn\'s place leaves the far plane and no giant Þórseðla behind; shown, it has both', async () => {
  const { chapter } = kafli6;
  const world = await chapterWorld(chapter);
  const clock = { time: 0 };
  const camera = world.camera;
  const locations = createLocations({ world, locations: chapter.locations, build: () => { throw new Error('every place of chapter 6 builds itself'); } });
  await locations.setLocation('ardalur');
  const ardalur = world.forest;
  // the far pool's shot, high over the water (the far friends show from 6 m up)
  pose(camera, SHOTS.ardalur.pool_west);
  for (let i = 0; i < 3; i++) { clock.time += FRAME; ardalur.update?.(FRAME, clock.time); }
  const far = camera.far;
  assert.ok(far <= 1200, `Árdalurinn's far plane: ${far}`);

  // prepareLater: built, a slice at a time, and kept hidden; its far Þórseðla loads meanwhile
  const slope = await locations.prepare('hlid');
  assert.equal(slope.group.visible, false);
  assert.ok(await until(() => slope.thorsedla.actor), 'her model loads');

  // warmPrepared: drawn once in parts, each part inside main.js's withPlace, the place's update run for each view
  const withPlace = mainWithPlace(world, clock, camera);
  for (let part = 0; part < 3; part++) {
    withPlace(slope, () => {
      for (const view of ['slope_ride', 'view_east']) {
        pose(camera, SHOTS.hlid[view]);
        world.forest.update?.(0, clock.time);
      }
    });
    pose(camera, SHOTS.ardalur.pool_west);
    clock.time += FRAME;
    world.forest.update?.(FRAME, clock.time);
  }
  // scenes 1 and 2 go on in Árdalurinn
  assert.equal(world.forest, ardalur);
  for (let i = 0; i < 30; i++) { clock.time += FRAME; world.forest.update?.(FRAME, clock.time); }
  world.scene.updateMatrixWorld(true);
  assert.equal(shownIn(world.scene, slope.thorsedla.actor.root), false, 'her far Þórseðla is not in the picture');
  assert.equal(camera.far, far, 'the far plane is Árdalurinn\'s again');
  const shownOfSlope = [];
  world.scene.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && shownIn(world.scene, o)) { for (let p = o; p; p = p.parent) if (p === slope.group || p.name === 'Far friends') { shownOfSlope.push(o.name); break; } } });
  assert.deepEqual(shownOfSlope, [], 'nothing of the slope is in the picture');

  // scene 3: the slope shown, the far plane far and Þórseðla there
  await locations.setLocation('hlid');
  pose(camera, SHOTS.hlid.view_east);
  for (let i = 0; i < 3; i++) { clock.time += FRAME; world.forest.update?.(FRAME, clock.time); }
  assert.ok(camera.far >= 6000, `the slope sees far: ${camera.far}`);
  assert.equal(shownIn(world.scene, slope.thorsedla.actor.root), true, 'Þórseðla walks in the view east');
  // and let go (scene 4), the far plane back as it was
  await locations.setLocation('ardalur');
  locations.release('hlid');
  assert.equal(camera.far, far);
  locations.release?.('sky');
  ardalur.dispose?.();
});
