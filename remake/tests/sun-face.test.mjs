import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createLighting } from '../engine/lighting.js';
import { pickLook } from '../engine/looks.js';
import { createPointResolver, isLive } from '../engine/points.js';
import { createScene } from '../engine/scene/scene.js';
import { DONE } from '../engine/handle.js';
import {
  createSunFace, addMosiCloud, SUN_RADIUS_DEG, WINK_SECONDS, BLINK_SECONDS, BLINK_EVERY, MOUTH_BETWEEN, MOUTH_SECONDS,
  WAVE_SECONDS, HUG_SECONDS, HAND_SIZE,
} from '../engine/sun-face.js';

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
      if (face.eyesClosed && shut === i) shut++; // the frames shut from the wink's first on (an idle blink later is not the wink)
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
// Idle blinks

/** The eyes at 30 frames a second from `from` to `to` s: [time, eyes]. */
function watchEyes(face, camera, from, to, step = 1 / 30) {
  const seen = [];
  for (let i = 0; from + i * step < to; i++) {
    const t = from + i * step;
    face.update(t, camera);
    seen.push([t, face.eyes]);
  }
  return seen;
}
/** When each closing of the eyes began, from watchEyes. */
const closings = seen => seen.filter(([, eyes], i) => eyes !== 'open' && (i === 0 || seen[i - 1][1] === 'open')).map(([t]) => t);

test('the sun blinks by itself every 3 to 6 s, through the half-shut face, on the clock', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  const seen = watchEyes(face, camera, 0, 120);
  const starts = closings(seen);
  assert.ok(starts.length >= 20 && starts.length <= 40, `${starts.length} blinks in two minutes`);
  assert.ok(starts[0] >= BLINK_EVERY[0] - 1 / 30 && starts[0] <= BLINK_EVERY[1] + 1 / 30, `the first after ${starts[0].toFixed(2)} s`);
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    assert.ok(gap >= BLINK_EVERY[0] - 1 / 30 && gap <= BLINK_EVERY[1] + 1 / 30, `${gap.toFixed(2)} s between two blinks`);
  }
  // Each blink: half shut, shut, half shut, open again, quicker than a wink.
  for (const start of starts.filter(t => t < 119)) {
    const blink = seen.filter(([t]) => t >= start - 1e-9 && t < start + BLINK_SECONDS + 0.05).map(([, eyes]) => eyes[0]).join('');
    assert.match(blink, /^h+s+h+o/, `a blink at ${start.toFixed(2)} s went ${blink}`);
  }
  assert.ok(BLINK_SECONDS < WINK_SECONDS);
});

test('the blinks are a pure function of the clock: the same times blink however the frames fall, and a paused game holds them', () => {
  const { scene, lighting, camera } = stage();
  const dense = createSunFace({ scene, lighting });
  const at60 = watchEyes(dense, camera, 0, 40, 1 / 60);
  const sparse = createSunFace({ scene, lighting });
  // Jumping straight to each time, in a shuffled order, gives the eyes the dense run had there.
  const picks = at60.filter((_, i) => i % 7 === 0);
  for (const [t, eyes] of [...picks].sort((a, b) => Math.sin(a[0] * 99) - Math.sin(b[0] * 99))) {
    sparse.update(t, camera);
    assert.equal(sparse.eyes, eyes, `at ${t.toFixed(3)} s`);
  }
  const [t, eyes] = at60.find(([, e]) => e === 'shut');
  for (let i = 0; i < 20; i++) dense.update(t, camera);
  assert.equal(dense.eyes, eyes, 'paused in a blink, it stays shut');
});

test('no blink during a wink, nor straight after one: the wink alone shuts the eyes', () => {
  const { scene, lighting, camera } = stage();
  const probe = createSunFace({ scene, lighting });
  const blinks = closings(watchEyes(probe, camera, 0, 60));
  // A wink called so that it starts just before, at, or just after a blink would have; at leads of 0.3 and 0.6 s the blink would
  // have begun as the wink's eyes opened, or 0.25 s after: the 0.4 s that no blink begins in after a wink holds it back.
  for (const lead of [0.6, 0.3, 0.15, 0.05, -0.05, -0.15, -0.3]) {
    const face = createSunFace({ scene, lighting });
    const blink = blinks[3];
    const wink = blink - lead;
    const before = watchEyes(face, camera, 0, wink);
    face.wink();
    const after = watchEyes(face, camera, wink, wink + 2);
    const shown = after.map(([, e]) => e[0]).join('');
    assert.match(shown, /^hhsssssshhho+$/, `winking ${lead} s before a blink, the eyes went ${shown}`);
    assert.equal(before.at(-1)[1] === 'open' || lead < 0, true);
  }
});

// ---------------------------------------------------------------------------------------------
// The mouth

/** What a face shows, as the frames go by: the mouth's frame at each time. */
function watchMouth(face, camera, from, to, step = 1 / 30) {
  const seen = [];
  for (let i = 0; from + i * step < to; i++) {
    const t = from + i * step;
    face.update(t, camera);
    seen.push([t, face.mouthFrame]);
  }
  return seen;
}

test('mouth("grin") and mouth("oh") change it through a short in-between and give the smile back after their time', () => {
  const { scene, lighting, camera } = stage();
  for (const [shape, seconds] of [['grin', 1.2], ['oh', 0.8], ['grin', undefined]]) {
    const face = createSunFace({ scene, lighting });
    face.update(0.9, camera);
    assert.equal(face.mouthFrame, 'smile', 'a calm smile to begin with');
    const handle = seconds === undefined ? face.mouth(shape) : face.mouth(shape, seconds);
    const hold = seconds ?? MOUTH_SECONDS;
    // The change begins on the next frame, at 1 s, as a wink does.
    const at = after => { face.update(1 + after, camera); return face.mouthFrame; };
    assert.equal(at(0), 'mid', `${shape}: the in-between first`);
    assert.equal(at(1 / 30), 'mid');
    assert.equal(at(MOUTH_BETWEEN + 0.02), shape);
    assert.equal(at(hold - 0.05), shape, `${shape}: held for ${hold} s`);
    assert.equal(handle.done, false, 'the handle waits for the smile');
    assert.equal(at(hold + 0.02), 'mid', `${shape}: the in-between on the way back`);
    assert.equal(at(hold + MOUTH_BETWEEN + 0.02), 'smile');
    assert.equal(handle.done, true, 'and is done once the smile is back');
    assert.equal(handle.cancelled, false);
  }
  assert.ok(MOUTH_BETWEEN >= 1 / 30 && MOUTH_BETWEEN <= 0.12, 'an in-between of a frame or a few: soft, never a held pose');
});

test('every change of mouth goes through the in-between, so the child never sees one shape pop into another', () => {
  const { scene, lighting, camera } = stage();
  for (const step of [1 / 30, 1 / 60, 1 / 24]) {
    const face = createSunFace({ scene, lighting });
    watchMouth(face, camera, 0, 1, step);
    face.mouth('oh', 0.7);
    const a = watchMouth(face, camera, 1, 1.3, step);
    face.mouth('grin', 0.9);
    const b = watchMouth(face, camera, 1.3, 3.5, step);
    face.hug();
    const c = watchMouth(face, camera, 3.5, 3.5 + HUG_SECONDS + 1, step);
    const frames = [...a, ...b, ...c].map(([, m]) => m);
    for (let i = 1; i < frames.length; i++) {
      if (frames[i] !== frames[i - 1]) assert.ok(frames[i] === 'mid' || frames[i - 1] === 'mid', `${frames[i - 1]} to ${frames[i]} with no in-between at ${step.toFixed(3)} s a frame`);
    }
    assert.ok(frames.includes('oh') && frames.includes('grin'), 'both shapes showed');
  }
});

test('a new mouth call takes over: the shape it asks for holds its own time, and the handle it replaced ends cancelled', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  face.update(1, camera);
  const first = face.mouth('grin', 3);
  face.update(1.5, camera); // the grin begins
  const second = face.mouth('oh', 0.5);
  face.update(1.6, camera); // the oh begins
  assert.equal(first.done, true);
  assert.equal(first.cancelled, true, 'the grin was cut short');
  assert.equal(face.mouthFrame, 'mid', 'from the grin to the oh through the in-between');
  face.update(1.7, camera);
  assert.equal(face.mouthFrame, 'oh');
  face.update(2.05, camera);
  assert.equal(face.mouthFrame, 'oh', 'the oh lasts its own half second');
  face.update(2.12, camera);
  assert.equal(face.mouthFrame, 'mid');
  face.update(2.2, camera);
  assert.equal(face.mouthFrame, 'smile', 'and gives back the smile, not the grin');
  assert.equal(second.done && !second.cancelled, true);
  // Asking for the smile while smiling is done on the next frame, with nothing to show; an unknown shape says what there is.
  const smile = face.mouth('smile');
  assert.equal(smile.done, false);
  face.update(2.25, camera);
  assert.equal(smile.done, true);
  assert.equal(face.mouthFrame, 'smile');
  assert.throws(() => face.mouth('frown'), /smile.*grin.*oh/);
  assert.throws(() => face.mouth('oh', -1), /seconds/);
});

test('the overlay shows the mouth of the moment: its quad looks at that mouth on the sheet', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  const cellOf = () => {
    const uv = face.overlay.geometry.attributes.uv;
    return [0, 1, 2, 3].map(i => [uv.getX(i), uv.getY(i)]).flat().map(v => v.toFixed(4)).join();
  };
  face.update(1, camera);
  const cells = { smile: cellOf() };
  face.mouth('grin', 0.5);
  face.update(1.02, camera);
  cells.mid = cellOf();
  face.update(1.2, camera);
  cells.grin = cellOf();
  face.mouth('oh', 0.5);
  face.update(1.4, camera);
  assert.equal(cellOf(), cells.mid, 'from the grin to the oh through the in-between');
  face.update(1.5, camera);
  cells.oh = cellOf();
  assert.equal(new Set(Object.values(cells)).size, 4, 'four mouths, four places on the sheet');
  face.update(2.1, camera);
  assert.equal(cellOf(), cells.smile, 'and back to the smile');
});

// ---------------------------------------------------------------------------------------------
// The hands

/** The hands at each time: [time, [screen-left hand, screen-right hand]], each { x, y, angle } in the face's own units. */
function watchHands(face, camera, from, to, step = 1 / 30) {
  const seen = [];
  for (let i = 0; from + i * step < to; i++) {
    const t = from + i * step;
    face.update(t, camera);
    seen.push([t, face.hands.map(h => ({ ...h })), { ...face.squash }, face.mouthFrame]);
  }
  return seen;
}

test('at rest the hands hang at the disc\'s sides, a mirror of each other, moving a little so the sun stays alive', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  const seen = watchHands(face, camera, 0, 10);
  for (const [t, [left, right]] of seen) {
    assert.ok(left.x < -0.85 && right.x > 0.85, `at ${t.toFixed(2)} s the hands are at the sides (${left.x.toFixed(2)}, ${right.x.toFixed(2)})`);
    assert.ok(left.y < 0 && right.y < 0, 'below the middle');
  }
  const [, [left, right]] = seen[0];
  assert.ok(Math.abs(left.x + right.x) < 0.05 && Math.abs(left.angle + right.angle) < 10, 'a mirror of each other');
  const ys = seen.map(([, [, r]]) => r.y);
  const spread = Math.max(...ys) - Math.min(...ys);
  assert.ok(spread > 0.01 && spread < 0.08, `a gentle bob of ${spread.toFixed(3)} R`);
  assert.deepEqual(seen.map(([, , squash]) => squash).every(s => s.x === 1 && s.y === 1), true, 'and the face its own round self');
});

test('wave: one hand rises beside the face, swings three or four times and comes back down, while the other rests', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  face.update(1, camera);
  const rest = face.hands.map(h => ({ ...h }));
  const handle = face.wave();
  const seen = watchHands(face, camera, 1, 1 + WAVE_SECONDS + 0.5);
  const during = seen.filter(([t]) => t < 1 + WAVE_SECONDS);
  // Which hand waves: the one that rises.
  const waving = during.some(([, [l]]) => l.y > 0.1) ? 0 : 1;
  const resting = 1 - waving;
  const raised = during.filter(([, hands]) => hands[waving].y > 0.1);
  assert.ok(raised.length * (1 / 30) > 0.6 * WAVE_SECONDS, `the hand is up for ${(raised.length / 30).toFixed(2)} s of ${WAVE_SECONDS}`);
  assert.ok(raised.every(([, hands]) => Math.abs(hands[waving].x) > 0.85 && Math.abs(hands[waving].x) < 1.6), 'beside the face, not over it');
  // The swings: the angle turns one way and back, three or four times (a turn counts once it has gone back 10 degrees).
  const angles = raised.map(([, hands]) => hands[waving].angle);
  let turns = 0;
  let extreme = angles[0];
  let rising = null;
  for (const a of angles) {
    if (rising !== false && a > extreme) { extreme = a; rising ??= true; } else if (rising !== true && a < extreme) { extreme = a; rising ??= false; }
    if (rising === true && a < extreme - 10) { turns++; rising = false; extreme = a; } else if (rising === false && a > extreme + 10) { turns++; rising = true; extreme = a; }
  }
  const swings = turns / 2;
  assert.ok(swings >= 3 && swings <= 4.5, `${swings} swings`);
  assert.ok(Math.max(...angles) - Math.min(...angles) > 30, `swinging through ${(Math.max(...angles) - Math.min(...angles)).toFixed(0)} degrees`);
  // The other hand rests, bobbing as at rest; both are back at rest when it is over.
  for (const [, hands] of during) assert.ok(Math.abs(hands[resting].x - rest[resting].x) < 0.06 && Math.abs(hands[resting].y - rest[resting].y) < 0.06, 'the other hand rests');
  const [, end] = seen.at(-1);
  for (const k of [0, 1]) assert.ok(Math.abs(end[k].x - rest[k].x) < 0.06 && Math.abs(end[k].y - rest[k].y) < 0.06 && Math.abs(end[k].angle - rest[k].angle) < 8, 'back at rest');
  // The moves are smooth: no hand jumps between two frames.
  for (let i = 1; i < seen.length; i++) {
    for (const k of [0, 1]) {
      const a = seen[i - 1][1][k];
      const b = seen[i][1][k];
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 0.25 && Math.abs(b.angle - a.angle) < 30, `a hand jumped at ${seen[i][0].toFixed(2)} s`);
    }
  }
  assert.equal(handle.done, true, 'the handle is done when the hand is down');
});

test('hug: both hands come in and cross over the front of the disc, the face squeezes and beams, and they go back out', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  face.update(1, camera);
  const rest = face.hands.map(h => ({ ...h }));
  const handle = face.hug();
  const seen = watchHands(face, camera, 1, 1 + HUG_SECONDS + 0.5);
  // Crossed: each hand on the other side of the middle from where it rests, over the disc, the two overlapping.
  const crossed = seen.filter(([, [l, r]]) => l.x > 0 && r.x < 0);
  assert.ok(crossed.length / 30 > 0.4 * HUG_SECONDS, `crossed for ${(crossed.length / 30).toFixed(2)} s`);
  for (const [t, [l, r]] of crossed) {
    assert.ok(Math.hypot(l.x, l.y) < 1 && Math.hypot(r.x, r.y) < 1, `at ${t.toFixed(2)} s both wrists are over the disc`);
    assert.ok(Math.hypot(l.x - r.x, l.y - r.y) < HAND_SIZE, 'and the hands overlap');
    assert.ok(l.y < -0.4 && r.y < -0.4, 'below the mouth, which beams over them');
  }
  // The squeeze: the face pressed a little wider and lower, twice, and back.
  const squeezes = seen.map(([, , s]) => s.x - 1);
  let pulses = 0;
  for (let i = 1; i < squeezes.length - 1; i++) if (squeezes[i] > 0.01 && squeezes[i] >= squeezes[i - 1] && squeezes[i] > squeezes[i + 1]) pulses++;
  assert.equal(pulses, 2, 'two squeezes');
  assert.ok(Math.max(...squeezes) < 0.06, 'gentle ones');
  assert.ok(seen.every(([, , s]) => s.y <= 1 && s.x >= 1), 'wider and lower, never taller');
  // Beaming: a grin while the hands are in.
  assert.ok(crossed.every(([, , , mouth]) => mouth === 'grin' || mouth === 'mid'), 'the face beams while it hugs');
  assert.ok(crossed.filter(([, , , mouth]) => mouth === 'grin').length > crossed.length * 0.8);
  const [, end, squash, mouth] = seen.at(-1);
  for (const k of [0, 1]) assert.ok(Math.abs(end[k].x - rest[k].x) < 0.06 && Math.abs(end[k].angle - rest[k].angle) < 8, 'back at rest');
  assert.deepEqual([squash.x, squash.y, mouth], [1, 1, 'smile'], 'and round and smiling again');
  for (let i = 1; i < seen.length; i++) {
    for (const k of [0, 1]) {
      const a = seen[i - 1][1][k];
      const b = seen[i][1][k];
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 0.25 && Math.abs(b.angle - a.angle) < 30, `a hand jumped at ${seen[i][0].toFixed(2)} s`);
    }
  }
  assert.equal(handle.done, true);
});

test('squeezed, the face still covers the sky\'s own sun disc', () => {
  const { scene, lighting, camera } = stage();
  const source = readFileSync(new URL('../engine/sky.js', import.meta.url), 'utf8');
  const skyRadius = deg(Math.acos(Number(/smoothstep\((0\.\d+), (0\.\d+), sd\)/.exec(source)[1])));
  const face = createSunFace({ scene, lighting });
  face.update(1, camera);
  const base = face.sprite.scale.clone();
  face.hug();
  let least = Infinity;
  for (let t = 1; t < 1 + HUG_SECONDS; t += 1 / 60) {
    face.update(t, camera);
    least = Math.min(least, face.sprite.scale.x / base.x, face.sprite.scale.y / base.y);
  }
  assert.ok(least < 1, 'it does squeeze');
  assert.ok(face.radiusDeg * least >= skyRadius * 1.1, `at its narrowest the face is ${(face.radiusDeg * least).toFixed(2)} degrees, the sky's disc ${skyRadius.toFixed(2)}`);
  assert.equal(face.radiusDeg.toFixed(6), deg(Math.atan(((base.x / 2) * 0.9) / 600)).toFixed(6), 'radiusDeg is the face at rest');
});

test('a gesture never cuts into another: one asked for while another goes on starts when that one is over', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  const wave = face.wave();
  face.update(1, camera); // the wave begins
  face.update(1.5, camera);
  const hug = face.hug();
  const again = face.hug();
  const seen = watchHands(face, camera, 1.5, 1 + WAVE_SECONDS + 2 * HUG_SECONDS + 0.5);
  const crossedFrom = seen.find(([, [l, r]]) => l.x > 0 && r.x < 0)[0];
  assert.ok(crossedFrom > 1 + WAVE_SECONDS, `the hug began after the wave, crossing at ${crossedFrom.toFixed(2)} s`);
  assert.equal(wave.done && hug.done && again.done, true);
  for (let i = 1; i < seen.length; i++) {
    for (const k of [0, 1]) {
      const a = seen[i - 1][1][k];
      const b = seen[i][1][k];
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 0.25 && Math.abs(b.angle - a.angle) < 30, `a hand jumped at ${seen[i][0].toFixed(2)} s`);
    }
  }
});

test('the hands stay readable at the chapter\'s lenses: 20 px or more across at 1280 x 800', () => {
  // The chapter shows the sun through 46 to 50 degree lenses (the dawn, sunLow and star shots).
  const px = (size, fov) => (size * Math.tan(THREE.MathUtils.degToRad(SUN_RADIUS_DEG)) * 800) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
  assert.ok(px(HAND_SIZE, 50) >= 20, `a hand is ${px(HAND_SIZE, 50).toFixed(1)} px across through a 50 degree lens`);
  assert.ok(px(HAND_SIZE, 50) <= px(1.2, 50), 'and smaller than the face');
});

// ---------------------------------------------------------------------------------------------
// One clock, one picture

/** Everything a face shows: its frame, its mouth's place on the sheet, the overlay's corners, the squeeze. */
function picture(face) {
  return JSON.stringify({
    eyes: face.eyes, mouth: face.mouthFrame, squash: face.squash,
    uv: [...face.overlay.geometry.attributes.uv.array].map(v => v.toFixed(5)),
    corners: [...face.overlay.geometry.attributes.position.array].map(v => v.toFixed(4)),
  });
}

test('the same clock gives the same picture: whatever the frames before, and paused', () => {
  const { scene, lighting, camera } = stage();
  camera.lookAt(-300, 200, 400);
  camera.updateMatrixWorld();
  // A script's calls, each made just before the frame at its time, as main.js runs the scene before the sun.
  const calls = [[2, f => f.wave()], [2.4, f => f.mouth('grin', 1.5)], [6, f => f.wink()], [6.4, f => f.mouth('oh', 0.9)], [9, f => f.hug()], [10, f => f.wink()]];
  const play = (face, times) => {
    const pictures = new Map();
    const pending = [...calls];
    for (const t of times) {
      while (pending.length && pending[0][0] <= t + 1e-9) pending.shift()[1](face);
      face.update(t, camera);
      pictures.set(t.toFixed(4), picture(face));
    }
    return pictures;
  };
  const frames = Array.from({ length: 30 * 14 }, (_, i) => i / 30);
  const a = play(createSunFace({ scene, lighting }), frames);
  const b = play(createSunFace({ scene, lighting }), frames);
  assert.deepEqual([...a], [...b], 'two faces with the same calls show the same picture at every frame');
  // A face that skips frames between the calls shows, at each time it is drawn, what the other showed then.
  const wanted = [...new Set([...calls.map(([t]) => t), ...frames.filter((_, i) => i % 11 === 0)])].sort((x, y) => x - y);
  const c = play(createSunFace({ scene, lighting }), wanted);
  for (const [t, shown] of c) assert.equal(shown, a.get(t), `at ${t} s`);
  // Paused: the same time again, many times, changes nothing.
  const face = createSunFace({ scene, lighting });
  face.wave();
  face.update(3, camera);
  face.update(3.6, camera);
  const held = picture(face);
  for (let i = 0; i < 30; i++) face.update(3.6, camera);
  assert.equal(picture(face), held);
});

test('a clock that goes back, a seek that starts over, forgets what it had not reached yet', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  face.update(1, camera);
  const rest = picture(face);
  face.update(5, camera);
  face.hug();
  face.mouth('oh', 3);
  face.update(5.5, camera);
  face.update(1, camera);
  assert.equal(picture(face), rest, 'back at 1 s it is the sun of 1 s');
  face.update(5.5, camera);
  assert.deepEqual([face.mouthFrame, face.squash.x], ['smile', 1], 'and going forward again the hug and the oh are gone: the script calls them again');
});

test('a clock that goes back into the middle of a grin or a hug keeps what had begun by then, and its end: nothing is left stuck', () => {
  const { scene, lighting, camera } = stage();
  // A 2 s grin from 5 s, played to 8 s, then back to 6 s and on again: the grin at 6 s, the smile from 7.08 s.
  const face = createSunFace({ scene, lighting });
  face.update(4.9, camera);
  face.mouth('grin', 2);
  face.update(5, camera);
  face.update(8, camera);
  assert.equal(face.mouthFrame, 'smile');
  face.update(6, camera);
  assert.equal(face.mouthFrame, 'grin', 'back in the middle of the grin');
  face.update(8, camera);
  assert.equal(face.mouthFrame, 'smile', 'and the smile comes back where it did');
  face.update(30, camera);
  assert.equal(face.mouthFrame, 'smile');
  // An "o" asked at 6.5 s, after the grin, then the clock back to 6 s: the "o" is forgotten and the grin's own end comes back.
  const other = createSunFace({ scene, lighting });
  other.update(4.9, camera);
  other.mouth('grin', 2);
  other.update(5, camera);
  other.update(6.5, camera);
  other.mouth('oh', 3);
  other.update(6.6, camera);
  other.update(6, camera);
  assert.equal(other.mouthFrame, 'grin');
  other.update(7.5, camera);
  assert.equal(other.mouthFrame, 'smile', 'the grin ends at 7 s as it was planned before the "o" took over');
  // A hug from 10 s, played to 13 s, back to 11 s: crossed and grinning; on to 13 s: at rest and smiling.
  const hugging = createSunFace({ scene, lighting });
  hugging.update(9.9, camera);
  hugging.hug();
  hugging.update(10, camera);
  hugging.update(13, camera);
  hugging.update(11, camera);
  assert.ok(hugging.hands[0].x > 0 && hugging.hands[1].x < 0 && hugging.mouthFrame === 'grin', 'back in the middle of the hug');
  hugging.update(13, camera);
  assert.deepEqual([hugging.mouthFrame, hugging.squash.x, hugging.hands[0].x < -0.85], ['smile', 1, true], 'and it ends as it did');
});

test('a mouth asked while a hug waits its turn leaves the hug its grin', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  face.wave();
  face.update(1, camera); // the wave, 1 to 3.3 s
  face.hug();
  face.update(1.1, camera); // the hug waits its turn: 3.3 to 5.7 s
  face.mouth('oh', 0.5);
  const seen = watchHands(face, camera, 1.2, 1 + WAVE_SECONDS + HUG_SECONDS + 0.3);
  assert.ok(seen.some(([t, , , mouth]) => t < 2 && mouth === 'oh'), 'the "o" shows');
  const held = seen.filter(([t]) => t > 1 + WAVE_SECONDS + 0.5 && t < 1 + WAVE_SECONDS + HUG_SECONDS - 0.6);
  assert.ok(held.length > 30 && held.every(([, , , mouth]) => mouth === 'grin'), 'and the hug, when its turn comes, grins as ever');
});

test('a sun handle that loses a race is honoured: a hug still waiting is dropped and the queue moves up, one under way finishes, and an "o" goes back to the smile', () => {
  const { lighting, camera } = stage();
  const sun = createSunFace({ scene: new THREE.Scene(), lighting });
  const play = createScene({ world: {}, director: {}, ui: {}, voice: {}, sun });
  const marks = {};
  play.start(function* script(s) {
    yield s.wait(1);
    s.sun.wave(); // the hands are busy from 1 s to 3.3 s
    const queued = s.sun.hug(); // it waits its turn behind the wave...
    yield s.race(queued, s.wait(0.5)); // ...and loses the race at 1.5 s: it is dropped
    marks.queued = queued;
    marks.next = s.sun.hug(); // asked at 1.5 s, it moves up into the dropped hug's place, right after the wave
    yield s.wait(8.5 - s.time);
    const going = s.sun.hug(); // nothing else under way: it begins at once, at 8.5 s...
    yield s.race(going, s.wait(0.5)); // ...and loses at 9 s, but a gesture under way finishes
    marks.going = going;
    yield s.wait(12 - s.time);
    yield s.race(s.sun.mouth('oh', 5), s.wait(1)); // an "o" for 5 s, cut short at 13 s
    marks.ohCut = s.time;
  });
  const seen = [];
  let t = 0;
  for (let frame = 0; frame < 30 * 16; frame++) {
    t += 1 / 30;
    play.update(1 / 30);
    sun.update(t, camera);
    seen.push({ t, crossed: sun.hands[0].x > 0 && sun.hands[1].x < 0, mouth: sun.mouthFrame });
  }
  const crossedAt = from => seen.filter(f => f.crossed && f.t >= from).map(f => f.t);
  // The dropped hug never shows; the next one crosses right after the wave (3.3 to 5.7 s), not after a gap (5.7 to 8.1 s).
  assert.equal(marks.queued.cancelled, true);
  const first = crossedAt(0).filter(x => x < 8.4);
  assert.ok(first.length > 25 && first[0] > 1 + WAVE_SECONDS && first.at(-1) < 1 + WAVE_SECONDS + HUG_SECONDS, `the second hug crossed from ${first[0]?.toFixed(2)} to ${first.at(-1)?.toFixed(2)} s, in the dropped one's place`);
  assert.equal(marks.next.done && !marks.next.cancelled, true, 'and finished as asked');
  // The hug under way when its race was lost finishes: crossed until near its end, then back at rest.
  const second = crossedAt(8.4).filter(x => x < 11.5);
  assert.ok(second.at(-1) > 8.5 + 1.8, `the hug under way crossed until ${second.at(-1)?.toFixed(2)} s: it finished`);
  assert.equal(marks.going.cancelled, true);
  // The cut-short "o": the smile again through the in-between, at once, not 5 s on.
  const at = time => seen.find(f => Math.abs(f.t - time) < 1 / 60).mouth;
  assert.equal(at(12.5), 'oh');
  assert.ok(Math.abs(marks.ohCut - 13) < 0.05, `the race ended at ${marks.ohCut.toFixed(2)} s`);
  const after = seen.filter(f => f.t > 13 - 1e-9 && f.t < 13.3).map(f => f.mouth);
  assert.deepEqual([...new Set(after)], ['mid', 'smile'], `after the cut: ${after.join(' ')}`);
  assert.ok(seen.filter(f => f.t > 13.2).every(f => f.mouth === 'smile'), 'and it stays smiling');
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

test('the sun is two draws, its face and one overlay for its mouth and both hands, the cloud one; never fogged, still hidden by what is nearer', () => {
  const { lighting } = stage();
  const scene = new THREE.Scene();
  const face = createSunFace({ scene, lighting });
  const cloud = addMosiCloud({ scene, lighting });
  assert.deepEqual(scene.children, [face.sprite, face.overlay, cloud.sprite], 'the face, its overlay and the cloud: three draw calls');
  assert.equal(face.sprite.isSprite, true);
  assert.equal(face.overlay.isMesh, true);
  const quads = face.overlay.geometry;
  assert.equal(quads.attributes.position.count, 12, 'three quads in the one draw: the mouth and two hands');
  assert.equal(quads.index.count, 18);
  for (const object of [face.sprite, face.overlay, cloud.sprite]) {
    const material = object.material;
    assert.equal(material.fog, false, 'at 600 m the height fog would erase it');
    assert.equal(material.depthTest, true, 'the trees in front of it hide it');
    assert.equal(material.depthWrite, false);
    assert.equal(material.transparent, true);
    assert.equal(material.toneMapped, false, 'drawn as painted, like the sky');
    assert.equal(object.castShadow, false);
  }
  assert.ok(face.sprite.renderOrder < face.overlay.renderOrder, 'the mouth and the hands are drawn over the face');
  assert.ok(face.overlay.renderOrder < cloud.sprite.renderOrder, 'a cloud drifting over the sun hides it, hands and all');
  assert.equal(face.sprite.material.map, null, 'no canvas in Node, so no texture');
  assert.equal(face.overlay.material.map, null);
});

test('the overlay rides the face: flat to the screen as the sprite is, its mouth under the eyes, its hands at the sides, and culled with them', () => {
  const { scene, lighting, camera } = stage();
  const face = createSunFace({ scene, lighting });
  for (const [position, look] of [[[3, 1.5, -2], [-40, 30, 200]], [[-40, 7, 12], [300, 200, 100]]]) {
    camera.position.set(...position);
    camera.lookAt(...look);
    camera.updateMatrixWorld();
    face.update(2, camera);
    assert.ok(face.overlay.position.distanceTo(face.sprite.position) < 1e-9, 'it hangs where the face hangs');
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const metres = 600 * Math.tan(THREE.MathUtils.degToRad(SUN_RADIUS_DEG)); // the disc's radius, R
    const at = i => new THREE.Vector3().fromBufferAttribute(face.overlay.geometry.attributes.position, i);
    for (let i = 0; i < 12; i++) assert.ok(Math.abs(at(i).dot(forward)) < 1e-6, 'every corner in the plane of the face, as flat to the screen as the sprite');
    const centre = from => [0, 1, 2, 3].map(k => at(from + k)).reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(4);
    const mouth = centre(0);
    assert.ok(Math.abs(mouth.dot(right)) < 1e-6 && mouth.dot(up) < -0.2 * metres && mouth.dot(up) > -0.6 * metres, 'the mouth below the middle of the face');
    const [screenLeft, screenRight] = [centre(4), centre(8)].sort((a, b) => a.dot(right) - b.dot(right));
    assert.ok(screenLeft.dot(right) < -0.85 * metres && screenRight.dot(right) > 0.85 * metres, 'a hand at each side of the disc');
    assert.ok(face.handPoints[0].distanceTo(face.overlay.localToWorld(screenLeft.clone())) < 1e-6, 'handPoints says where they are');
  }
  // Wherever the hands go, they stay inside the overlay's bounding sphere, so it is culled only when they are out of view.
  const reach = face.overlay.geometry.boundingSphere.radius;
  const metres = 600 * Math.tan(THREE.MathUtils.degToRad(SUN_RADIUS_DEG));
  face.wave();
  face.hug();
  let far = 0;
  for (let t = 2; t < 2 + WAVE_SECONDS + HUG_SECONDS + 0.5; t += 1 / 30) {
    face.update(t, camera);
    const p = face.overlay.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) far = Math.max(far, new THREE.Vector3().fromBufferAttribute(p, i).length());
  }
  assert.ok(far < reach, `the hands reach ${(far / metres).toFixed(2)} R, the bounding sphere ${(reach / metres).toFixed(2)} R`);
  assert.ok(reach < 3 * metres, 'and it is not much bigger');
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

test('the textures are small: a strip of three square frames for the face, one small sheet for its mouths and its hand, and one 2:1 picture for the cloud', () => {
  const { scene, lighting } = stage();
  const { canvases, made } = onAPage(() => ({ face: createSunFace({ scene, lighting }), cloud: addMosiCloud({ scene, lighting }) }));
  assert.equal(canvases.length, 3);
  const [strip, sheet, picture] = canvases;
  assert.equal(strip.width, 3 * strip.height, 'three frames side by side: open, half shut, shut');
  assert.ok(strip.height <= 256, `${strip.height} px a frame`);
  assert.ok(sheet.width * sheet.height <= 512 * 256, `the mouths and the hand on ${sheet.width} x ${sheet.height} px`);
  assert.equal(picture.width, 2 * picture.height);
  assert.ok(picture.width <= 512, `${picture.width} px wide`);
  assert.deepEqual([made.face.sprite.material.map.repeat.x, made.face.sprite.material.map.repeat.y], [1 / 3, 1]);
  for (const map of [made.cloud.sprite.material.map, made.face.sprite.material.map, made.face.overlay.material.map]) assert.equal(map.colorSpace, THREE.SRGBColorSpace);
});

test('the mouths and the hands are painted in the face\'s own colours: its gold, its ink and its cheeks', () => {
  const { scene, lighting } = stage();
  const strip = onAPage(() => createSunFace({ scene, lighting, sheet: null })); // the face's frames alone
  const faceColours = new Set([...strip.colours].map(hex));
  const sheet = onAPage(() => createSunFace({ scene, lighting, texture: null })); // the mouths and the hand alone
  const colours = [...new Set([...sheet.colours].map(hex))];
  assert.ok(colours.length >= 3, `the sheet paints with ${colours.length} colours`);
  for (const colour of colours) assert.ok(faceColours.has(colour), `${colour} is not one of the face's colours`);
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

test('s.sun.wave, s.sun.hug and s.sun.mouth start at once and return handles a script can yield, done when the gesture is', () => {
  const { lighting, camera } = stage();
  const sun = createSunFace({ scene: new THREE.Scene(), lighting });
  const play = createScene({ world: {}, director: {}, ui: {}, voice: {}, sun });
  const marks = [];
  play.start(function* script(s) {
    yield s.wait(1);
    const waving = s.sun.wave();
    marks.push(['wave', s.time, waving.done]);
    yield waving;
    marks.push(['waved', s.time]);
    yield s.sun.mouth('oh', 0.8);
    marks.push(['oh', s.time]);
    const grin = s.sun.mouth('grin'); // not yielded: the script goes on while it grins
    yield s.sun.hug();
    marks.push(['hugged', s.time, grin.done]);
  });
  const seen = [];
  let t = 0;
  for (let frame = 0; frame < 30 * 12; frame++) {
    t += 1 / 30;
    play.update(1 / 30); // the scene, then the sun: main.js's order
    sun.update(t, camera);
    seen.push([t, sun.mouthFrame, sun.hands[0].y, sun.hands[1].y]);
  }
  const at = name => marks.find(m => m[0] === name);
  assert.deepEqual(at('wave').slice(0, 1), ['wave']);
  assert.equal(at('wave')[2], false, 'the wave is under way, not done, when the call returns');
  const close = (a, b, why) => assert.ok(Math.abs(a - b) <= 2.5 / 30, `${why}: ${a.toFixed(3)} s, not ${b.toFixed(3)} s`);
  close(at('waved')[1], 1 + WAVE_SECONDS, 'the script went on when the wave was over');
  close(at('oh')[1], at('waved')[1] + 0.8 + MOUTH_BETWEEN, 'and when the oh had given the smile back');
  close(at('hugged')[1], at('oh')[1] + HUG_SECONDS, 'and when the hug was over');
  assert.equal(at('hugged')[2], true, 'the grin asked for before the hug is over by the hug\'s end');
  assert.ok(seen.some(([time, mouth]) => time > at('waved')[1] && time < at('oh')[1] && mouth === 'oh'), 'the oh showed');
});

test('s.sun.wave, s.sun.hug and s.sun.mouth say so when the scene has no sun', () => {
  const { s } = createScene({ world: {}, director: {}, ui: {}, voice: {} });
  assert.throws(() => s.sun.wave(), /s\.sun\.wave needs the sun.*createSunFace/);
  assert.throws(() => s.sun.hug(), /s\.sun\.hug needs the sun.*createSunFace/);
  assert.throws(() => s.sun.mouth('grin'), /s\.sun\.mouth needs the sun.*createSunFace/);
});
