import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLighting } from '../engine/lighting.js';
import { LOOKS } from '../engine/looks.js';
import { CAP, HAND_SIZE, createSunFace } from '../engine/sun-face.js';
import { FJALL } from '../world/fjall/ground.js';
import { SHOTS, tallShot } from '../chapters/hatid-route.js';
import { brightness } from '../chapters/kafli6-looks.js';
import { LOOKS as SHOW_LOOKS } from '../chapters/kafli5-show-score.js';
import { SUNSET, HATID_LOOKS, lookAt } from '../chapters/hatid-looks.js';

const deg = THREE.MathUtils.radToDeg;
const CAMERA_FAR = 1200; // main.js's camera: the sea is drawn out to here
const FAR_SEA = FJALL.top.sea + 4; // the far sea's cards lie up to 4 m over its level (world/fjall/top.js)

test('at SUNSET.under the face, its hands and its cap are below the sea\'s horizon from sun_faces and lineup_sun, and not a degree sooner', () => {
  const lighting = createLighting(new THREE.Scene(), HATID_LOOKS.sunset, { shadowSize: 0 });
  const shots = [['sun_faces', SHOTS.toppur.sun_faces], ['lineup_sun', SHOTS.toppur.lineup_sun], ['lineup_sun upright', tallShot('lineup_sun')]];
  const elevation = (camera, point) => deg(Math.asin(point.clone().sub(camera.position).normalize().y));
  let first = 0; // the first whole degree at which everything is under from every shot
  for (const [name, shot] of shots) {
    const camera = new THREE.PerspectiveCamera(shot.fov, 1.6, 0.25, CAMERA_FAR);
    camera.position.fromArray(shot.position);
    camera.lookAt(...shot.target);
    camera.updateMatrixWorld();
    const face = createSunFace({ scene: new THREE.Scene(), lighting });
    face.cap(1); // it wears its nightcap as it goes down
    // the sea's horizon from this camera: its far cards at the far plane, under the camera
    const horizon = deg(Math.atan2(FAR_SEA - camera.position.y, CAMERA_FAR));
    // the highest of the disc's top, the cap sprite's top (CAP.at[1] + CAP.size / 2 = 1.85 radii over the face's middle) and each
    // hand (its wrist point and a hand's whole size over it, more than its farthest corner)
    let t = 1;
    const top = () => {
      face.update((t += 1 / 30), camera);
      const r = face.radiusDeg;
      const tops = [elevation(camera, face.sprite.position) + r, elevation(camera, face.capSprite.position) + (CAP.size / 2) * r];
      for (const point of face.handPoints) tops.push(elevation(camera, point) + HAND_SIZE * r);
      return Math.max(...tops);
    };
    assert.ok(top() - 4 * face.radiusDeg > horizon, `${name}: before it sets the whole sun is over the sea`);
    let d = 0;
    while (d < 60) {
      face.drop(++d);
      if (top() < horizon) break;
    }
    first = Math.max(first, d);
    face.drop(SUNSET.under);
    const under = top();
    assert.ok(under < horizon, `${name}: the top of the face, hands and cap at ${under.toFixed(2)} degrees, the sea's horizon at ${horizon.toFixed(2)}`);
  }
  assert.deepEqual(SUNSET, { under: first, seconds: 14 });
});

const SECTIONS = Object.keys(LOOKS.morning);
const NAMES = ['sunset', 'red', 'blue', 'dark', 'night'];

test('the five looks have every field morning has and one sun; each is darker than the one before but night, which is brighter than dark', () => {
  assert.deepEqual(Object.keys(HATID_LOOKS).sort(), [...NAMES].sort());
  for (const name of NAMES) {
    const look = HATID_LOOKS[name];
    for (const section of SECTIONS) {
      const want = LOOKS.morning[section];
      if (typeof want === 'number') { assert.equal(typeof look[section], 'number', `${name}.${section}`); continue; }
      for (const [key, value] of Object.entries(want)) {
        assert.equal(typeof look[section]?.[key], typeof value, `${name}.${section}.${key}`);
        if (typeof value === 'string') assert.match(look[section][key], /^#[0-9a-f]{6}$/, `${name}.${section}.${key}`);
      }
    }
    assert.deepEqual([look.sun.azimuth, look.sun.elevation], [215, 10], `${name}: one sun, where the sunset has it`);
  }
  const sunset = HATID_LOOKS.sunset;
  assert.equal(HATID_LOOKS.red.sun.intensity.toFixed(6), (0.6 * sunset.sun.intensity).toFixed(6), 'red: the sun\'s light at 0.6 of sunset\'s');
  assert.equal(HATID_LOOKS.blue.sun.intensity.toFixed(6), (0.2 * sunset.sun.intensity).toFixed(6), 'blue: at 0.2');
  assert.equal(HATID_LOOKS.dark.sun.intensity.toFixed(6), (0.12 * sunset.sun.intensity).toFixed(6), 'dark: at 0.12');
  assert.equal(HATID_LOOKS.dark.fog.color, '#16204a');
  assert.equal(HATID_LOOKS.dark.hemi.intensity, 0.25);
  assert.equal(HATID_LOOKS.night.hemi.intensity, 0.8);
  assert.equal(HATID_LOOKS.night.exposure, 1);
  for (const name of ['blue', 'dark', 'night']) assert.equal(HATID_LOOKS[name].fog.sunStrength, 0, `${name}: the fog's sun is gone`);
  assert.ok(HATID_LOOKS.red.fog.sunStrength > 0, 'red still has it');

  const order = ['sunset', 'red', 'blue', 'dark'].map(name => [name, brightness(HATID_LOOKS[name])]);
  for (let i = 1; i < order.length; i++) {
    for (const part of ['sky', 'sun', 'glow']) {
      assert.ok(order[i][1][part] < order[i - 1][1][part], `${order[i][0]}'s ${part} (${order[i][1][part].toFixed(4)}) darker than ${order[i - 1][0]}'s (${order[i - 1][1][part].toFixed(4)})`);
    }
  }
  const dark = brightness(HATID_LOOKS.dark), night = brightness(HATID_LOOKS.night);
  for (const part of ['sky', 'sun', 'glow']) assert.ok(night[part] > dark[part], `the party's night is brighter than the dark in its ${part}`);
  const red = new THREE.Color(HATID_LOOKS.red.sun.color), gold = new THREE.Color(sunset.sun.color);
  assert.ok(red.g / red.r < gold.g / gold.r, 'red: the gold gone red');
  const blue = new THREE.Color(HATID_LOOKS.dark.sun.color);
  assert.ok(blue.b > blue.r, 'dark: the sun\'s last light is blue');

  // lookAt: 0 the sunset to 3 the dark, blended in between, the sun in its one place
  assert.deepEqual({ ...lookAt(0), name: null }, { ...sunset, name: null });
  assert.deepEqual({ ...lookAt(3), name: null }, { ...HATID_LOOKS.dark, name: null });
  assert.deepEqual({ ...lookAt(1), name: null }, { ...HATID_LOOKS.red, name: null });
  assert.deepEqual({ ...lookAt(-1), name: null }, { ...sunset, name: null }, 'held to 0');
  assert.deepEqual({ ...lookAt(7), name: null }, { ...HATID_LOOKS.dark, name: null }, 'held to 3');
  let last = brightness(lookAt(0));
  for (let u = 0.25; u <= 3 + 1e-9; u += 0.25) {
    const look = lookAt(u);
    assert.deepEqual([look.sun.azimuth, look.sun.elevation], [215, 10]);
    const now = brightness(look);
    assert.ok(now.sky <= last.sky + 1e-9 && now.sun <= last.sun + 1e-9, `lookAt(${u}) no brighter than the step before`);
    last = now;
  }
});

test('night\'s colours are chapter 5\'s night', () => {
  const night = HATID_LOOKS.night, show = SHOW_LOOKS.night;
  assert.equal(night.sun.color, show.sun.color);
  assert.deepEqual([night.hemi.sky, night.hemi.ground], [show.hemi.sky, show.hemi.ground]);
  for (const key of ['zenith', 'horizon', 'glow', 'cloud', 'cloudShade']) assert.equal(night.sky[key], show.sky[key], `sky.${key}`);
  assert.deepEqual([night.fog.color, night.fog.sunColor], [show.fog.color, show.fog.sunColor]);
});
