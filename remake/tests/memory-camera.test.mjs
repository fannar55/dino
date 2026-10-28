import test from 'node:test';
import assert from 'node:assert/strict';
import './setup.mjs';
const THREE = await import('three');
const { createCameraDirector } = await import('../engine/memory/camera-director.js');

const glade = { key: 'glade', points: [[-8, .03, 7], [6, .03, 7], [-8, 3, -6], [6, 3, -6]] };
const overview = { key: 'journey', points: [...glade.points, [-3, 3, -30], [11, 3, -30]] };
const action = { key: 'bark', phase: 'carry', scale: 'action', points: [[2, .1, -15], [8, .1, -15], [2, 2.3, -23], [8, 2.3, -23]] };
function fixture(width = 1280, height = 800) {
  const camera = new THREE.PerspectiveCamera(35, width / height, .1, 500);
  camera.position.set(3, 7, 12);
  const director = createCameraDirector({ camera, overview: () => overview, fallback: () => glade });
  director.setViewport(width, height); return { camera, director };
}
const settle = director => { for (let i = 0; i < 90; i++) director.update(1 / 60); assert.equal(director.isMoving(), false); };

test('requesting a shot never moves a paused camera, including repeated zero or invalid time updates', () => {
  const { camera, director } = fixture(), initial = camera.position.toArray();
  director.setCue(action); assert.equal(director.isMoving(), true); assert.deepEqual(camera.position.toArray(), initial);
  for (const dt of [0, 0, -1, NaN]) director.update(dt);
  assert.deepEqual(camera.position.toArray(), initial);
  director.update(.3); const paused = director.getDebug(); assert.notDeepEqual(paused.position, initial);
  for (let i = 0; i < 120; i++) director.update(0);
  assert.deepEqual(director.getDebug(), paused);
});

test('overview is inspection-only and auto becomes interactive only after travel settles', () => {
  const { director } = fixture(); assert.equal(director.isInteractive(), true);
  director.setMode('overview'); assert.equal(director.isInteractive(), false); settle(director);
  assert.equal(director.getDebug().worldInputEnabled, false);
  director.setMode('auto'); assert.equal(director.isInteractive(), false); settle(director);
  assert.equal(director.isInteractive(), true);
  const before = director.getDebug(); assert.equal(director.setMode('unknown'), false); assert.deepEqual(director.getDebug(), before);
});

test('reduced motion waits for a positive game tick then snaps to the requested destination', () => {
  const { director } = fixture(); director.setReducedMotion(true); director.setCue(action);
  const pending = director.getDebug(); director.update(0); assert.deepEqual(director.getDebug(), pending);
  director.update(1 / 60); const settled = director.getDebug();
  assert.equal(settled.moving, false); assert.deepEqual(settled.position, settled.destinationPosition); assert.deepEqual(settled.target, settled.destinationTarget);
});

test('whole-route overview and action framing reserve HUD space in wide, tablet and phone views', () => {
  for (const [width, height, top, bottom, side] of [[1280, 800, 160, 130, 42], [820, 1180, 145, 130, 42], [390, 844, 164, 140, 26]]) {
    const { camera, director } = fixture(width, height);
    for (const [mode, description] of [['overview', overview], ['auto', action]]) {
      director.setCue(action); director.setMode(mode); settle(director);
      for (const point of description.points) {
        const projected = new THREE.Vector3(...point).project(camera), x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
        const bottomReserve = mode === 'overview' ? 96 : bottom; // Overview replaces the coach with the shorter inspection hint.
        assert.ok(x >= side && x <= width - side && y >= top && y <= height - bottomReserve, `${width}x${height} ${mode}: framing point clears HUD margins`);
        assert.ok(projected.z >= -1 && projected.z <= 1);
      }
    }
  }
});

test('repeated same cue does not restart travel and a new cue replaces the old destination', () => {
  const { director } = fixture(); director.setCue(action); director.update(.3);
  const progress = director.getDebug().progress; director.setCue({ ...action }); assert.equal(director.getDebug().progress, progress);
  director.setCue({ ...action, key: 'final', points: [[1, 1, -25], [8, 2, -29]] }); settle(director);
  assert.equal(director.getDebug().intent, 'final');
  director.setMode('overview'); director.update(.2); director.reset();
  const reset = director.getDebug(); assert.equal(reset.mode, 'auto'); assert.equal(reset.intent, 'glade'); assert.equal(reset.moving, false);
});
