import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createLighting } from '../engine/lighting.js';
import { pickLook } from '../engine/looks.js';
import { createPointResolver, isLive } from '../engine/points.js';
import { createScene } from '../engine/scene/scene.js';
import { DONE } from '../engine/handle.js';
import { createSunFace, addMosiCloud } from '../engine/sun-face.js';

const deg = THREE.MathUtils.radToDeg;
const UP = new THREE.Vector3(0, 1, 0);

/** Light, a camera and an empty scene for the sun to hang in, as main.js builds them. */
function stage(lookName = 'morning') {
  const look = pickLook(lookName);
  const lighting = createLighting(new THREE.Scene(), look, { shadowSize: 0 });
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200);
  camera.position.set(3, 1.5, -2);
  return { scene: new THREE.Scene(), look, lighting, camera };
}

/** Compass bearing from +X toward +Z and elevation, in degrees, of a direction. */
function bearing(v) {
  const d = v.clone().normalize();
  return { azimuth: deg(Math.atan2(d.z, d.x)), elevation: deg(Math.asin(d.y)) };
}

/** An angle in degrees brought into (-180, 180]. */
const wrap = a => ((((a + 180) % 360) + 360) % 360) - 180;

/** Which way, from the camera, something hangs. */
const toward = (sprite, camera) => sprite.position.clone().sub(camera.position);

// ---------------------------------------------------------------------------------------------
// Where the sun is

test('the sun spec resolves along the light direction', () => {
  const { lighting, camera } = stage();
  const resolve = createPointResolver({ camera, lighting });
  const offset = resolve('sun').sub(camera.position);
  assert.ok(Math.abs(offset.length() - 600) < 1e-9, `the sun is ${offset.length()} m away`);
  assert.ok(offset.normalize().distanceTo(lighting.direction) < 1e-12, 'in the direction of the light');

  // Like the sky, it goes where the camera goes.
  camera.position.set(-40, 7, 12);
  const moved = resolve('sun').sub(camera.position);
  assert.ok(moved.distanceTo(lighting.direction.clone().multiplyScalar(600)) < 1e-9);
});

test('the sun spec follows the camera, so it is live, and says so when there is no light', () => {
  const { lighting, camera } = stage();
  assert.equal(isLive('sun'), true);
  assert.throws(() => createPointResolver({ camera })('sun'), /light/);
  // Into a vector it is given, like every other spec.
  const out = new THREE.Vector3();
  assert.equal(createPointResolver({ camera, lighting })('sun', out), out);
});

test('the face hangs where the sun spec points, 600 m out, and goes where the camera goes', () => {
  const { scene, lighting, camera } = stage();
  const resolve = createPointResolver({ camera, lighting });
  const face = createSunFace({ scene, lighting });
  // Before the first frame it already hangs along the light, from the origin, and not on top of the camera.
  assert.ok(face.sprite.position.distanceTo(lighting.direction.clone().multiplyScalar(600)) < 1e-9);
  for (const position of [[3, 1.5, -2], [-40, 7, 12], [250, 90, -300]]) {
    camera.position.set(...position);
    face.update(0, camera);
    assert.ok(face.sprite.position.distanceTo(resolve('sun')) < 1e-9);
    assert.ok(Math.abs(toward(face.sprite, camera).length() - 600) < 1e-9);
  }
});

test('the face covers the disc the sky paints, and is not much bigger', () => {
  const { scene, lighting } = stage();
  // sky.js paints its disc over dot(view, sunDir) from 0.99935 to 0.9997; the face has to cover all of it.
  const source = readFileSync(new URL('../engine/sky.js', import.meta.url), 'utf8');
  const disc = /smoothstep\((0\.\d+), (0\.\d+), sd\)/.exec(source);
  assert.ok(disc, 'sky.js no longer paints its sun disc with smoothstep(a, b, sd): make sun-face.js cover the new one');
  const skyRadius = deg(Math.acos(Number(disc[1])));
  const { radiusDeg } = createSunFace({ scene, lighting });
  assert.ok(radiusDeg >= skyRadius, `the face is ${radiusDeg.toFixed(2)} degrees across its radius, the sky's disc ${skyRadius.toFixed(2)}`);
  assert.ok(radiusDeg <= skyRadius * 1.35, 'the same sun, not a giant');
});

// ---------------------------------------------------------------------------------------------
// The wink

test('wink closes and reopens on the clock', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  face.update(10, camera);
  assert.equal(face.eyesClosed, false, 'open eyes to begin with');

  face.wink();
  face.update(10.1, camera); // the first frame after the call starts the wink
  assert.equal(face.eyesClosed, true);
  face.update(10.1 + 0.3, camera);
  assert.equal(face.eyesClosed, true, 'still shut 0.3 s later');
  face.update(10.1 + 0.36, camera);
  assert.equal(face.eyesClosed, false, 'open again after 0.35 s');
});

test('a wink lasts 0.35 s of game time whatever the frames are like, and a paused game holds it', () => {
  const { scene, lighting, camera } = stage();
  // None of these frame rates fits 0.35 s into a whole number of frames, so a frame is plainly shut or open:
  // the frame the wink starts on is shut, and so is every frame up to 0.35 s after it.
  for (const dt of [1 / 30, 1 / 12, 1 / 25, 1 / 45]) {
    const face = createSunFace({ scene, lighting });
    face.update(2, camera);
    face.wink();
    let t = 2;
    let shut = 0;
    for (let i = 0; i < 4 / dt; i++) {
      face.update(t, camera);
      if (face.eyesClosed) shut++;
      t += dt;
    }
    assert.equal(shut, Math.ceil(0.35 / dt), `at ${(1 / dt).toFixed(0)} fps the eyes were shut for ${shut} frames`);
  }

  const face = createSunFace({ scene, lighting });
  face.wink();
  face.update(5, camera);
  for (let i = 0; i < 50; i++) face.update(5.2, camera); // paused part way through
  assert.equal(face.eyesClosed, true);
  for (let i = 0; i < 50; i++) face.update(5.4, camera); // paused after it
  assert.equal(face.eyesClosed, false);
  face.update(1, camera); // a clock that goes back (a seek that starts over) does not wink
  assert.equal(face.eyesClosed, false);
});

test('winking again starts the wink over, and no wink starts before the call', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  face.update(1, camera);
  face.update(1.2, camera);
  assert.equal(face.eyesClosed, false, 'nothing winks by itself');

  face.wink();
  face.update(2, camera);
  face.wink();
  face.update(2.25, camera);
  assert.equal(face.eyesClosed, true);
  face.update(2.5, camera); // 0.5 s after the first wink, but only 0.25 s after the second
  assert.equal(face.eyesClosed, true);
  face.update(2.61, camera);
  assert.equal(face.eyesClosed, false);
});

test('a wink goes through a half-shut face on its way down and on its way back up, so it reads softly', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  face.update(1, camera);
  assert.equal(face.eyes, 'open');
  face.wink();
  const seen = [];
  for (const after of [0, 0.03, 0.07, 0.15, 0.25, 0.27, 0.3, 0.34, 0.36]) {
    face.update(1 + after, camera);
    seen.push([after, face.eyes]);
  }
  assert.deepEqual(seen, [
    [0, 'half'], [0.03, 'half'], // down
    [0.07, 'shut'], [0.15, 'shut'], [0.25, 'shut'],
    [0.27, 'half'], [0.3, 'half'], [0.34, 'half'], // and back up, a little slower
    [0.36, 'open'],
  ]);
  assert.ok(seen.every(([, eyes]) => (eyes !== 'open') === (eyes === 'half' || eyes === 'shut')), 'eyesClosed is any of the wink');
  // At the tablet's 30 fps a wink shows the half-shut face for two frames going down and three coming up.
  const tablet = createSunFace({ scene, lighting });
  tablet.wink();
  const frames = [];
  for (let i = 0; i < 12; i++) {
    tablet.update(2 + i / 30, camera);
    frames.push(tablet.eyes[0]);
  }
  assert.equal(frames.join(''), 'hhsssssshhho', 'h: half shut, s: shut, o: open again');
});

test('the strip shows its first frame while the eyes are open, its second while they are half shut and its third while they are shut', () => {
  const { scene, lighting, camera } = stage();
  const texture = new THREE.Texture();
  const face = createSunFace({ scene, lighting, texture });
  assert.equal(face.sprite.material.map, texture);
  assert.deepEqual([texture.repeat.x, texture.repeat.y], [1 / 3, 1], 'one of the three frames at a time');
  face.update(0, camera);
  assert.equal(texture.offset.x, 0);
  face.wink();
  face.update(1, camera);
  assert.equal(texture.offset.x, 1 / 3, 'half shut');
  face.update(1.2, camera);
  assert.equal(texture.offset.x, 2 / 3, 'shut');
  face.update(1.4, camera);
  assert.equal(texture.offset.x, 0);
});

// ---------------------------------------------------------------------------------------------
// The Mosi cloud

test('the Mosi cloud drifts with the game clock', () => {
  const { scene, lighting, camera } = stage();
  const cloud = addMosiCloud({ scene, lighting });
  const where = t => {
    cloud.update(t, camera);
    return bearing(toward(cloud.sprite, camera));
  };
  const start = where(0);
  const later = where(600); // ten minutes of game time
  // To the right as the sun's own bearing grows: toward the sun, the way the sky's clouds go.
  assert.ok(Math.abs(later.azimuth - start.azimuth - 5) < 1e-6, `moved ${later.azimuth - start.azimuth} degrees in 10 minutes`);
  assert.ok(Math.abs(later.elevation - start.elevation) < 1e-9, 'it stays at its height');

  // A pure function of the clock: a paused game (the same time again) holds it still, and a
  // frame at 600 s is the same frame however the clock got there.
  for (let i = 0; i < 5; i++) assert.deepEqual(where(600), later);
  assert.deepEqual(where(0), start);
});

test('the Mosi cloud hangs 35 degrees to the left of the sun, at the sun\'s height, in every look', () => {
  for (const name of ['morning', 'golden', 'evening']) {
    const { scene, look, lighting, camera } = stage(name);
    const cloud = addMosiCloud({ scene, lighting, look });
    cloud.update(0, camera);
    const sun = bearing(lighting.direction);
    const at = bearing(toward(cloud.sprite, camera));
    assert.ok(Math.abs(at.elevation - sun.elevation) < 1e-9, `${name}: same height`);
    assert.ok(Math.abs(wrap(sun.azimuth - at.azimuth) - 35) < 1e-9, `${name}: ${wrap(sun.azimuth - at.azimuth)} degrees round from the sun`);
    // Left as somebody who faces the sun sees it.
    const facing = new THREE.Vector3(lighting.direction.x, 0, lighting.direction.z).normalize();
    const right = facing.clone().cross(UP);
    const fromSun = toward(cloud.sprite, camera).normalize().sub(lighting.direction);
    assert.ok(fromSun.dot(right) < 0, `${name}: to the left of the sun`);
  }
});

test('the Mosi cloud sits 600 m out and goes where the camera goes', () => {
  const { scene, lighting, camera } = stage();
  const cloud = addMosiCloud({ scene, lighting });
  assert.ok(Math.abs(cloud.sprite.position.length() - 600) < 1e-9, 'out in the sky from the start, not at the origin');
  cloud.update(30, camera);
  const first = toward(cloud.sprite, camera);
  camera.position.set(-120, 4, 75);
  cloud.update(30, camera);
  assert.ok(Math.abs(first.length() - 600) < 1e-9);
  assert.ok(toward(cloud.sprite, camera).distanceTo(first) < 1e-9, 'the same direction from wherever the camera is');
});

// ---------------------------------------------------------------------------------------------
// What the two cost, and how they are painted

test('the face and the cloud are two sprites, never fogged, and still hidden by what is nearer', () => {
  const { lighting } = stage();
  const scene = new THREE.Scene();
  const face = createSunFace({ scene, lighting });
  const cloud = addMosiCloud({ scene, lighting });
  assert.deepEqual(scene.children, [face.sprite, cloud.sprite], 'one sprite each: two draw calls');
  for (const { sprite } of [face, cloud]) {
    const material = sprite.material;
    assert.equal(sprite.isSprite, true);
    assert.equal(material.fog, false, 'at 600 m the height fog would erase it');
    assert.equal(material.depthTest, true, 'the trees in front of it hide it');
    assert.equal(material.depthWrite, false);
    assert.equal(material.transparent, true);
    assert.equal(material.toneMapped, false, 'drawn as painted, like the sky');
  }
  assert.ok(face.sprite.renderOrder < cloud.sprite.renderOrder, 'a cloud drifting over the sun hides it');
  assert.equal(face.sprite.material.map, null, 'no canvas in Node, so no texture');
});

/**
 * Stands a page in for Node while `make` runs: its canvases are stand-ins whose 2D contexts do nothing but
 * remember every colour they are asked to paint with. Returns what `make` returned, the canvases and the colours.
 */
function onAPage(make) {
  const canvases = [];
  const colours = new Set();
  const gradient = { addColorStop: (offset, colour) => colours.add(colour) };
  const context = new Proxy({}, {
    get: (target, name) => {
      if (name in target) return target[name];
      return /Gradient$/.test(name) ? () => gradient : () => {};
    },
    set: (target, name, value) => {
      if (typeof value === 'string' && /^(fillStyle|strokeStyle|shadowColor)$/.test(name)) colours.add(value);
      target[name] = value;
      return true;
    },
  });
  globalThis.document = {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => context };
      canvases.push(canvas);
      return canvas;
    },
  };
  try {
    return { made: make(), canvases, colours };
  } finally {
    delete globalThis.document;
  }
}

/** A canvas colour, '#rrggbb' or 'rgba(r, g, b, a)', as '#rrggbb'. */
function hex(colour) {
  const m = /^rgba?\((\d+), (\d+), (\d+)/.exec(colour);
  return m ? `#${[m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('')}` : colour.toLowerCase();
}

test('the Mosi cloud is painted in the sky\'s own cloud and shade colours, whatever the look', () => {
  for (const name of ['morning', 'golden', 'evening']) {
    const { scene, look, lighting } = stage(name);
    const { colours, made } = onAPage(() => addMosiCloud({ scene, lighting, look }));
    const painted = [...new Set([...colours].map(hex))].sort();
    assert.deepEqual(painted, [look.sky.cloud, look.sky.cloudShade].sort(), `${name}: only the sky's two cloud colours`);
    assert.ok(made.sprite.material.map, 'with a page the cloud has its picture');
  }
});

test('the textures are small: a strip of three square frames for the face and one 2:1 picture for the cloud', () => {
  const { scene, lighting } = stage();
  const { canvases, made } = onAPage(() => ({ face: createSunFace({ scene, lighting }), cloud: addMosiCloud({ scene, lighting }) }));
  assert.equal(canvases.length, 2);
  const [strip, picture] = canvases;
  assert.equal(strip.width, 3 * strip.height, 'three frames side by side: open, half shut, shut');
  assert.ok(strip.height <= 256, `${strip.height} px a frame`);
  assert.equal(picture.width, 2 * picture.height);
  assert.ok(picture.width <= 512, `${picture.width} px wide`);
  assert.deepEqual([made.face.sprite.material.map.repeat.x, made.face.sprite.material.map.repeat.y], [1 / 3, 1]);
  assert.equal(made.cloud.sprite.material.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(made.face.sprite.material.map.colorSpace, THREE.SRGBColorSpace);
});

// ---------------------------------------------------------------------------------------------
// The scene

test('s.sun.wink shuts the sun\'s eyes and returns DONE, so a script goes straight on', () => {
  const { scene, lighting, camera } = stage();
  const sun = createSunFace({ scene, lighting });
  const stageOfScript = createScene({ world: {}, director: {}, ui: {}, voice: {}, sun });
  assert.equal(stageOfScript.s.sun.wink(), DONE);
  sun.update(2, camera);
  assert.equal(sun.eyesClosed, true);

  // In main.js's order each frame (the scene, then the sun), the eyes shut on the frame the script calls it.
  const other = createSunFace({ scene: new THREE.Scene(), lighting });
  const play = createScene({ world: {}, director: {}, ui: {}, voice: {}, sun: other });
  const calls = [];
  play.start(function* script(s) {
    yield s.wait(1);
    yield s.sun.wink();
    calls.push(s.time);
    yield s.wait(0.5);
    calls.push(s.time);
  });
  const shut = [];
  let t = 0;
  for (let frame = 0; frame < 90; frame++) {
    t += 1 / 30;
    play.update(1 / 30);
    other.update(t, camera);
    if (other.eyesClosed) shut.push(t);
  }
  assert.equal(calls.length, 2);
  assert.ok(Math.abs(calls[0] - 1) < 1e-6, `the script went on at once, at ${calls[0]} s`);
  assert.ok(Math.abs(shut[0] - 1) < 1e-6, `the eyes shut on that frame, at ${shut[0]} s`);
  assert.ok(shut.length === 10 || shut.length === 11, `shut for ${shut.length} frames at 30 fps`);
  assert.ok(shut.every((value, i) => i === 0 || Math.abs(value - shut[i - 1] - 1 / 30) < 1e-9), 'one wink, in a row');
});

test('s.sun.wink says so when the scene has no sun', () => {
  const { s } = createScene({ world: {}, director: {}, ui: {}, voice: {} });
  assert.throws(() => s.sun.wink(), /s\.sun\.wink needs the sun.*createSunFace/);
});
