import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  MOON, MOON_MOUTHS, MOON_ACTS, MOON_QUADS, MOON_ROCK_DEG, MOON_ASKEW_DEG, MOON_BLINK,
  createMoonFace, moonPose, drawMoonFrames, drawMoonSheet,
} from '../engine/moon-face.js';
import { SUN_DISTANCE } from '../engine/sun-face.js';
import { FJALL } from '../world/fjall/ground.js';
import { SHOTS, SKY, STAGE } from '../chapters/hatid-route.js';

const deg = THREE.MathUtils.radToDeg;
const CAMERA_FAR = 1200; // main.js's camera: the sea is drawn out to here
const FAR_SEA = FJALL.top.sea + 4; // the far sea's cards lie up to 4 m over its level (world/fjall/top.js)
const SIZES = [['1280x800', 1280, 800], ['800x1280', 800, 1280]];

/** A shot's camera at an aspect, as main.js has it. */
function cameraOf(shot, aspect) {
  const camera = new THREE.PerspectiveCamera(shot.fov, aspect, 0.25, CAMERA_FAR);
  camera.position.fromArray(shot.position);
  camera.lookAt(...shot.target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}
/** The sea's horizon from a camera: its far cards at the far plane, under the camera (as hatid-looks.test.mjs has it). */
const horizonOf = camera => deg(Math.atan2(FAR_SEA - camera.position.y, CAMERA_FAR));
const elevationOf = (camera, point) => deg(Math.asin(point.clone().sub(camera.position).normalize().y));
/** The highest thing of the moon: its disc's top, the hat's tip and the hand's far end. */
function topOf(face, camera) {
  const p = face.points;
  return Math.max(elevationOf(camera, p.top), elevationOf(camera, p.hatTip), elevationOf(camera, p.hand) + (MOON.hand / 2) * MOON.radiusDeg);
}
const moon = (extra = {}) => createMoonFace({ scene: new THREE.Scene(), texture: null, sheet: null, ...SKY.moon, ...extra });
const PEEK_SHOTS = [['party_wide', SHOTS.toppur.party_wide], ['moon_peek', SHOTS.toppur.moon_peek]];

test('at rise 0 the whole moon is under the sea\'s horizon from party_wide and moon_peek; at 1 it is above it, hat and all, behind the stage', () => {
  assert.deepEqual(MOON, { radiusDeg: 3.4, under: -6, hat: 0.9, hand: 0.6 });
  for (const [name, shot] of PEEK_SHOTS) {
    for (const [size, w, h] of SIZES) {
      const camera = cameraOf(shot, w / h);
      const horizon = horizonOf(camera);
      const face = moon();
      face.set(moonPose([{ kind: 'peek', at: 5 }], 1));
      assert.equal(face.pose.rise, 0);
      face.update(camera);
      const top = topOf(face, camera);
      assert.ok(top < horizon, `${name} ${size}: at rise 0 its top is at ${top.toFixed(2)} degrees, the sea's horizon at ${horizon.toFixed(2)}`);
      face.set(moonPose([], 1)); // no peek asked: it is up
      assert.equal(face.pose.rise, 1);
      face.update(camera);
      const bottom = elevationOf(camera, face.points.bottom);
      assert.ok(bottom > horizon + 1, `${name} ${size}: at rise 1 its bottom is at ${bottom.toFixed(2)}, the horizon at ${horizon.toFixed(2)}`);
      assert.ok(elevationOf(camera, face.points.hatTip) > bottom + 2 * MOON.radiusDeg, 'the hat on its head, over it');
      const away = face.sprite.position.clone().sub(camera.position);
      assert.ok(Math.abs(away.length() - SUN_DISTANCE) < 1e-6, 'as far out as the sun');
      const centre = elevationOf(camera, face.points.centre);
      assert.ok(Math.abs(centre - SKY.moon.elevation) < 0.4, `${name}: its middle at its place, ${centre.toFixed(2)} degrees up`);
    }
  }
  // behind the stage: from party_wide the moon's bearing is the stage's, and the stage stands in front of it
  const camera = cameraOf(SHOTS.toppur.party_wide, 1.6);
  const face = moon();
  face.set(moonPose([], 0));
  face.update(camera);
  const toMoon = face.points.centre.clone().sub(camera.position);
  const toStage = new THREE.Vector3(STAGE.centre[0] - camera.position.x, 0, STAGE.centre[1] - camera.position.z);
  const off = deg(Math.atan2(toMoon.z, toMoon.x) - Math.atan2(toStage.z, toStage.x));
  assert.ok(Math.abs(off) < 3, `the moon ${off.toFixed(1)} degrees off the stage's bearing`);
  assert.ok(toStage.length() < toMoon.length() / 4, 'the stage is nearer');
  assert.throws(() => createMoonFace({ scene: new THREE.Scene(), texture: null, sheet: null }), /azimuth/, 'its place comes from the caller');
});

test('peek: first only the eye and the hat\'s tip show, it looks both ways, then it is up', () => {
  const acts = [{ kind: 'peek', at: 2 }];
  assert.equal(moonPose(acts, 1.99).rise, 0, 'under the sea until it peeks');
  for (const [name, shot] of PEEK_SHOTS) {
    for (const [size, w, h] of SIZES) {
      const camera = cameraOf(shot, w / h);
      const horizon = horizonOf(camera);
      const face = moon();
      // over its eye (the hold of the look): the eye and the hat's tip over the sea, the mouth, the hand and the bottom under it
      for (const t of [2 + 1.0, 2 + 1.5, 2 + 2.0]) {
        face.set(moonPose(acts, t));
        face.update(camera);
        const p = face.points;
        const at = k => elevationOf(camera, p[k]);
        const say = `${name} ${size} at ${t}: eye ${at('eye').toFixed(2)}, mouth ${at('mouth').toFixed(2)}, horizon ${horizon.toFixed(2)}`;
        assert.ok(at('eye') - (0.12 * MOON.radiusDeg) > horizon, `${say}: the whole eye shows`);
        assert.ok(at('hatTip') > horizon, `${say}: the hat's tip shows`);
        assert.ok(at('mouth') < horizon - 0.2, `${say}: the mouth is under`);
        assert.ok(at('hand') + (MOON.hand / 2) * MOON.radiusDeg < horizon, `${say}: the hand is under`);
        assert.ok(at('bottom') < horizon, say);
      }
      face.set(moonPose(acts, 2 + MOON_ACTS.peek + 0.01));
      face.update(camera);
      assert.ok(elevationOf(camera, face.points.bottom) > horizon + 1, `${name} ${size}: then all of it is up`);
    }
  }
  // the look: it leans one way and then the other while only its eye is up
  const sways = [];
  for (let t = 2.9; t <= 4.1; t += 0.02) sways.push(moonPose(acts, t).sway);
  assert.ok(Math.min(...sways) < -4 && Math.max(...sways) > 4, `it looks both ways: ${Math.min(...sways).toFixed(1)} to ${Math.max(...sways).toFixed(1)}`);
  const end = moonPose(acts, 2 + MOON_ACTS.peek);
  assert.equal(end.rise, 1);
  assert.ok(Math.abs(end.sway) < 1e-9, 'straight when it is up');
  // rising is smooth: never a jump of more than 0.06 in a thirtieth of a second
  let last = 0;
  for (let t = 2; t <= 5.2; t += 1 / 30) {
    const { rise } = moonPose(acts, t);
    assert.ok(Math.abs(rise - last) < 0.06, `at ${t.toFixed(2)} s the rise jumps from ${last} to ${rise}`);
    last = rise;
  }
});

test('toot: the mouth blows and the blower is out twice in two seconds', () => {
  assert.equal(MOON_ACTS.toot, 2);
  assert.deepEqual(MOON_MOUTHS, ['smile', 'grin', 'oh', 'blow']);
  const acts = [{ kind: 'toot', at: 5 }];
  assert.equal(moonPose(acts, 4.9).mouth, 'smile');
  for (const t of [5.2, 5.6, 6, 6.4, 6.9]) assert.equal(moonPose(acts, t).mouth, 'blow', `at ${t}`);
  assert.equal(moonPose(acts, 7.2).mouth, 'smile', 'and the smile again');
  let runs = 0;
  let out = false;
  for (let t = 4.9; t <= 7.3; t += 0.01) {
    const b = moonPose(acts, t).blower;
    assert.ok(b >= 0 && b <= 1);
    if (!out && b > 0.95) runs++;
    out = b > 0.95 ? true : b < 0.1 ? false : out;
    if (t < 5 || t > 7) assert.equal(b, 0, `rolled up at ${t.toFixed(2)}`);
  }
  assert.equal(runs, 2, 'out twice');
  assert.ok(moonPose(acts, 6).blower < 0.1, 'rolled back up between');
  // on the face: the blower's tube is as long as it is out, and there is no blower when it does not blow
  const camera = cameraOf(SHOTS.toppur.moon_close, 1.6);
  const face = moon();
  const tube = () => {
    const p = face.overlay.geometry.attributes.position;
    const a = new THREE.Vector3().fromBufferAttribute(p, MOON_QUADS.tube * 4);
    const b = new THREE.Vector3().fromBufferAttribute(p, MOON_QUADS.tube * 4 + 1);
    return a.distanceTo(b);
  };
  const curl = () => {
    const p = face.overlay.geometry.attributes.position;
    return new THREE.Vector3().fromBufferAttribute(p, MOON_QUADS.curl * 4).distanceTo(new THREE.Vector3().fromBufferAttribute(p, MOON_QUADS.curl * 4 + 1));
  };
  let peak = 5;
  for (let t = 5; t < 6; t += 0.01) if (moonPose(acts, t).blower > moonPose(acts, peak).blower) peak = t;
  face.set(moonPose(acts, peak));
  face.update(camera);
  const long = tube();
  assert.ok(long > 0.8 * SUN_DISTANCE * Math.tan(THREE.MathUtils.degToRad(MOON.radiusDeg)), 'blown out, nearly a radius long');
  // every quad shown is wound to face the camera (a front-sided material draws nothing of one that is not)
  const toward = camera.position.clone().sub(face.overlay.position);
  const corners = face.overlay.geometry.attributes.position;
  for (const [name, q] of Object.entries(MOON_QUADS)) {
    const c = [0, 1, 3].map(k => new THREE.Vector3().fromBufferAttribute(corners, q * 4 + k));
    const facing = c[1].clone().sub(c[0]).cross(c[2].clone().sub(c[0])).dot(toward);
    assert.ok(facing > 0, `the ${name} faces the camera`);
  }
  face.set(moonPose(acts, 5.1)); // past the in-between mouth, before the first blow
  face.update(camera);
  assert.ok(tube() < long / 4 && curl() > 0, 'rolled up at the lips');
  face.set(moonPose(acts, 4));
  face.update(camera);
  assert.equal(tube(), 0, 'no blower when it smiles');
  assert.equal(curl(), 0);
});

test('a roar knocks the hat askew and the hand puts it right', () => {
  const acts = [{ kind: 'askew', at: 1 }, { kind: 'fixHat', at: 3 }];
  assert.equal(moonPose(acts, 0.9).hat, 0);
  assert.ok(Math.abs(moonPose(acts, 2).hat - MOON_ASKEW_DEG) < 0.5, `askew: ${moonPose(acts, 2).hat}`);
  assert.equal(MOON_ASKEW_DEG, 25);
  assert.ok(moonPose(acts, 1.1).hat > 5, 'knocked at once, not slowly');
  const reaching = moonPose(acts, 3.3);
  assert.equal(reaching.hand.kind, 'hat');
  assert.ok(reaching.hand.u > 0 && reaching.hand.u < 1);
  const holding = moonPose(acts, 3.8);
  assert.deepEqual(holding.hand, { kind: 'hat', u: 1 });
  assert.ok(holding.hat > 1 && holding.hat < MOON_ASKEW_DEG - 1, 'the hand turns it back');
  const done = moonPose(acts, 3 + MOON_ACTS.fixHat + 0.05);
  assert.equal(done.hat, 0);
  assert.deepEqual(done.hand, { kind: 'rest', u: 0 });
  // on the face: the hat's quad turned by as much, the hand on the hat while it holds it
  const camera = cameraOf(SHOTS.toppur.moon_close, 1.6);
  const face = moon();
  const hatAngle = () => {
    const p = face.overlay.geometry.attributes.position;
    const a = new THREE.Vector3().fromBufferAttribute(p, MOON_QUADS.hat * 4);
    const b = new THREE.Vector3().fromBufferAttribute(p, MOON_QUADS.hat * 4 + 1);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const d = b.sub(a);
    return deg(Math.atan2(-d.dot(up), d.dot(right))); // clockwise on the screen
  };
  const middle = quad => {
    const p = face.overlay.geometry.attributes.position;
    return [0, 1, 2, 3].map(k => new THREE.Vector3().fromBufferAttribute(p, quad * 4 + k)).reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(4);
  };
  face.set(moonPose(acts, 0.9));
  face.update(camera);
  const straight = hatAngle();
  face.set(moonPose(acts, 2));
  face.update(camera);
  // knocked forward, over its brow: counter-clockwise, toward the face, which looks to the screen's left
  assert.ok(Math.abs(hatAngle() - straight + MOON_ASKEW_DEG) < 0.6, `the hat turned ${(hatAngle() - straight).toFixed(1)} degrees on the screen`);
  face.set(holding);
  face.update(camera);
  const R = SUN_DISTANCE * Math.tan(THREE.MathUtils.degToRad(MOON.radiusDeg));
  const apart = middle(MOON_QUADS.hand).distanceTo(middle(MOON_QUADS.hat));
  assert.ok(apart < 0.45 * R, `the hand on the hat: ${(apart / R).toFixed(2)} R apart`);
  face.set(done);
  face.update(camera);
  assert.ok(middle(MOON_QUADS.hand).distanceTo(middle(MOON_QUADS.hat)) > 0.8 * R, 'and back at its side');
});

test('rock sways on the beat it is given and the hand is on the hat', () => {
  for (const bpm of [84, 120]) {
    const beat = 60 / bpm;
    const acts = [{ kind: 'rock', at: 10, seconds: 12, bpm }];
    assert.equal(moonPose(acts, 9.9).sway, 0);
    for (let k = 1; 10 + (k + 1) * beat < 22; k++) {
      const on = moonPose(acts, 10 + k * beat);
      assert.ok(Math.abs(on.sway - (k % 2 ? 1 : -1) * MOON_ROCK_DEG) < 1e-6, `${bpm} bpm: beat ${k} sways ${on.sway}`);
      assert.ok(Math.abs(moonPose(acts, 10 + (k + 0.5) * beat).sway) < 1e-6, 'upright between beats');
      assert.deepEqual(on.hand, { kind: 'hat', u: 1 }, 'holding its hat');
      assert.equal(on.hat, 0);
    }
    const after = moonPose(acts, 22.5);
    assert.equal(after.sway, 0);
    assert.deepEqual(after.hand, { kind: 'rest', u: 0 });
  }
  assert.ok(MOON_ROCK_DEG >= 5 && MOON_ROCK_DEG <= 12);
});

test('the same acts and time give the same pose, whatever was asked before; it blinks every 3 to 6 s', () => {
  const acts = [
    { kind: 'peek', at: 1 }, { kind: 'smile', at: 4.5 }, { kind: 'toot', at: 6 }, { kind: 'askew', at: 9 }, { kind: 'fixHat', at: 10 },
    { kind: 'rock', at: 12, seconds: 6, bpm: 84 }, { kind: 'oh', at: 19, seconds: 2 }, { kind: 'wave', at: 22 }, { kind: 'tipHat', at: 25 },
  ];
  const times = Array.from({ length: 300 }, (_, i) => i * 0.1);
  const first = times.map(t => moonPose(acts, t));
  const shuffled = [...times].reverse();
  for (const t of shuffled) moonPose([{ kind: 'wave', at: t / 2 }], t * 3); // other questions between
  const again = shuffled.map(t => moonPose([...acts].reverse(), t)).reverse(); // the acts in another order
  assert.deepEqual(again, first);
  for (const pose of first) {
    assert.ok(['open', 'half', 'shut'].includes(pose.eye));
    assert.ok([...MOON_MOUTHS, 'mid'].includes(pose.mouth), pose.mouth);
    assert.ok(['rest', 'wave', 'hat', 'tip'].includes(pose.hand.kind));
  }
  assert.throws(() => moonPose([{ kind: 'dance', at: 0 }], 1), /kind/);
  // on the face: a pose is a picture, whatever was set before it
  const camera = cameraOf(SHOTS.toppur.moon_close, 1.6);
  const texture = new THREE.Texture();
  const face = moon({ texture });
  const picture = () => ({
    frame: texture.offset.x,
    rotation: face.sprite.material.rotation,
    sprite: face.sprite.position.toArray(),
    corners: Array.from(face.overlay.geometry.attributes.position.array),
    uvs: Array.from(face.overlay.geometry.attributes.uv.array),
  });
  face.set(first[140]);
  face.update(camera);
  const once = picture();
  for (const pose of first.slice(0, 60)) { face.set(pose); face.update(camera); }
  face.set(first[140]);
  face.update(camera);
  assert.deepEqual(picture(), once);
  // blinks: by themselves, every 3 to 6 s, through half shut, each shorter than a quarter of a second
  const starts = [];
  let was = 'open';
  let shutFor = 0;
  for (let t = 0; t < 120; t += 0.005) {
    const { eye } = moonPose([], t);
    if (was === 'open' && eye !== 'open') { starts.push(t); assert.equal(eye, 'half', 'it goes through half shut'); }
    shutFor = eye === 'open' ? 0 : shutFor + 0.005;
    assert.ok(shutFor < 0.25);
    was = eye;
  }
  assert.ok(starts.length >= 19, `${starts.length} blinks in two minutes`);
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    assert.ok(gap > MOON_BLINK.every[0] - 0.01 && gap < MOON_BLINK.every[1] + 0.01, `${gap.toFixed(2)} s between blinks`);
  }
  face.set({ ...first[0], eye: 'shut' });
  face.update(camera);
  assert.equal(texture.offset.x, 2 / 3, 'the shut eye is the strip\'s third frame');
});

/**
 * Stands a page in for Node while `make` runs (as sun-face.test.mjs does): its canvases are stand-ins whose 2D contexts do nothing.
 */
function onAPage(make) {
  const canvases = [];
  const gradient = { addColorStop: () => {} };
  const context = new Proxy({}, {
    get: (target, name) => (name in target ? target[name] : /Gradient$/.test(name) ? () => gradient : () => {}),
    set: (target, name, value) => { target[name] = value; return true; },
  });
  globalThis.document = {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => context };
      canvases.push(canvas);
      return canvas;
    },
  };
  try {
    return { made: make(), canvases };
  } finally {
    delete globalThis.document;
  }
}

test('the moon is two draws and its textures are small: a strip of three frames and one sheet', () => {
  assert.equal(drawMoonFrames(), null, 'no canvas in Node');
  assert.equal(drawMoonSheet(), null);
  const scene = new THREE.Scene();
  const { made: face, canvases } = onAPage(() => createMoonFace({ scene, ...SKY.moon }));
  assert.equal(canvases.length, 2);
  const [strip, sheet] = canvases;
  assert.equal(strip.width, 3 * strip.height, 'three frames side by side: open, half shut, shut');
  assert.ok(strip.height <= 256, `${strip.height} px a frame`);
  assert.ok(sheet.width * sheet.height <= 512 * 256, `the mouths, the hand, the hat and the blower on ${sheet.width} x ${sheet.height} px`);
  const drawn = [];
  scene.traverse(o => { if (o.isSprite || o.isMesh || o.isPoints || o.isLine) drawn.push(o); });
  assert.deepEqual(drawn, [face.sprite, face.overlay], 'a sprite and one overlay mesh');
  assert.equal(face.overlay.geometry.index.count, 6 * Object.keys(MOON_QUADS).length);
  for (const object of drawn) {
    const m = object.material;
    assert.equal(m.fog, false, 'never fogged');
    assert.equal(m.toneMapped, false);
    assert.equal(m.depthWrite, false);
    assert.equal(m.depthTest, true, 'what is nearer hides it');
    assert.equal(m.depthFunc, THREE.LessEqualDepth, 'drawn at the far plane, as the sun');
    assert.equal(m.transparent, true);
    assert.equal(m.map.colorSpace, THREE.SRGBColorSpace);
  }
  assert.deepEqual([face.sprite.material.map.repeat.x, face.sprite.material.map.repeat.y], [1 / 3, 1]);
  assert.ok(face.sprite.renderOrder < face.overlay.renderOrder, 'the mouth, hat and hand over the face');
  face.dispose();
  assert.equal(scene.children.length, 0);
});

test('in party_wide the moon covers under 2 % of the frame', () => {
  for (const [size, w, h] of SIZES) {
    const camera = cameraOf(SHOTS.toppur.party_wide, w / h);
    const face = moon();
    face.set(moonPose([], 0));
    face.update(camera);
    const px = v => { const n = v.clone().project(camera); return [(n.x + 1) * w / 2, (1 - n.y) * h / 2, n.z]; };
    const [cx, cy, z] = px(face.points.centre);
    assert.ok(cx > 0 && cx < w && cy > 0 && cy < h && z < 1 + 1e-6, `${size}: in the frame, at ${cx.toFixed(0)}, ${cy.toFixed(0)}`);
    const r = Math.hypot(...px(face.points.top).slice(0, 2).map((v, i) => v - [cx, cy][i]));
    let area = (Math.PI * r * r) / 2; // the half moon
    const p = face.overlay.geometry.attributes.position;
    for (const quad of [MOON_QUADS.hat, MOON_QUADS.hand]) { // and the whole squares of the hat and the hand, more than they paint
      const c = [0, 1, 2, 3].map(k => px(face.overlay.localToWorld(new THREE.Vector3().fromBufferAttribute(p, quad * 4 + k))));
      let s = 0;
      for (let k = 0; k < 4; k++) s += c[k][0] * c[(k + 1) % 4][1] - c[(k + 1) % 4][0] * c[k][1];
      area += Math.abs(s) / 2;
    }
    const share = area / (w * h);
    assert.ok(share < 0.02, `${size}: ${(100 * share).toFixed(2)} % of the frame`);
    assert.ok(share > 0.002, `${size}: but it is there to see (${(100 * share).toFixed(2)} %)`);
  }
});
