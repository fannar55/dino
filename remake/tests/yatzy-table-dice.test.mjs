import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDiceAndCup, faceQuaternion, upwardFace } from '../engine/yatzy-table/dice.js';
import { createYatzyEffects } from '../engine/yatzy-table/effects.js';

async function diceFixture(run) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  globalThis.Image = class { width = 256; height = 256; async decode() {} };
  globalThis.document = { createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { width: 0, height: 0, digits: [] };
    const context = new Proxy({ fillText(value) { canvas.digits.push(Number(value)); } }, { get(object, key) { return object[key] ?? (() => {}); } });
    canvas.getContext = () => context;
    return canvas;
  } };
  const world = { scene: new THREE.Scene(), table: { y: 1.4 }, camera: new THREE.PerspectiveCamera(40, 1.5, .1, 100) };
  world.camera.position.set(0, 5, 7); world.camera.lookAt(0, 1.4, 0); world.camera.updateMatrixWorld();
  const events = [];
  let model;
  try { model = await createDiceAndCup(world, { onEvent: (kind, data) => events.push({ kind, data, time: model.getDebugState().elapsed, positions: kind === 'impact' ? model.dice.map(die => die.position.clone()) : [] }) }); await run({ model, world, events }); }
  finally {
    model?.dispose();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
    if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage); else delete globalThis.Image;
  }
}

test('every actual textured die face points upwards for its logical value and opposite faces sum to seven', async () => {
  await diceFixture(({ model }) => {
    const mesh = model.dice[0], geometry = mesh.geometry, position = geometry.attributes.position;
    const faces = geometry.groups.map(group => {
      const normal = new THREE.Vector3(), point = new THREE.Vector3();
      for (let i = group.start; i < group.start + group.count; i++) normal.add(point.fromBufferAttribute(position, geometry.index.getX(i)));
      normal.normalize();
      return { normal, value: mesh.material[group.materialIndex].map.image.digits[0] };
    });
    assert.deepEqual(faces.map(face => face.value).sort(), [1, 2, 3, 4, 5, 6]);
    for (const face of faces) {
      const opposite = faces.find(other => other.normal.dot(face.normal) < -.999999);
      assert.equal(face.value + opposite.value, 7);
      for (const yaw of [0, .7, Math.PI, Math.PI * 1.8]) {
        const quaternion = faceQuaternion(face.value, yaw);
        assert.ok(face.normal.clone().applyQuaternion(quaternion).y > .999999, 'the numbered/material face itself is on top');
        assert.equal(upwardFace(quaternion), face.value);
      }
    }
    for (const value of [0, 7, 1.2, NaN]) assert.throws(() => faceQuaternion(value), RangeError);
  });
});

test('rolling keeps held dice fixed and finishes with the same visual and logical results for either player', async () => {
  await diceFixture(({ model, events }) => {
    for (const player of [0, 1]) for (const calm of [false, true]) {
      const values = [1, 2, 3, 4, 5], held = [true, false, true, false, false], results = [1, 6, 3, 2, 4];
      model.sync(values, held, player);
      const saved = [0, 2].map(index => ({ position: model.dice[index].position.clone(), quaternion: model.dice[index].quaternion.clone() }));
      const duration = model.startRoll(results, held, player, calm);
      for (let frame = 0; frame < Math.ceil(duration * 60) + 2; frame++) {
        model.update(1 / 60);
        for (let i = 0; i < 2; i++) {
          const mesh = model.dice[i * 2];
          assert.ok(mesh.position.distanceTo(saved[i].position) < 1e-8, 'held dice are not gathered into the cup');
          assert.ok(mesh.quaternion.angleTo(saved[i].quaternion) < 1e-7);
        }
      }
      const state = model.getDebugState();
      assert.equal(state.rolling, false); assert.deepEqual(state.values, results); assert.deepEqual(state.up, results); assert.deepEqual(state.held, held);
      const vertex = new THREE.Vector3();
      for (const mesh of model.dice) {
        mesh.updateMatrixWorld(true);
        let lowest = Infinity;
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) lowest = Math.min(lowest, vertex.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld).y);
        assert.ok(Math.abs(lowest - 1.4) < 1e-6, 'actual settled die vertices meet the felt, independent of die size');
      }
      assert.deepEqual(model.screenPositions().map(die => die.value), results);
    }
    assert.ok(events.some(event => event.kind === 'impact') && events.some(event => event.kind === 'rattle'));
    for (const event of events.filter(event => event.kind === 'impact')) {
      const { x, y, z } = event.data.position;
      assert.ok(event.positions.some(position => Math.hypot(position.x - x, position.z - z) < 1e-8), 'dust and spatial sound originate at the actual die contact, not its eventual target');
      assert.ok(y >= 1.4 && y <= 1.42, 'contact effects originate at the felt rather than inside the die');
    }
  });
});

test('holding one die moves only that die along a paused game-clock arc', async () => {
  await diceFixture(({ model }) => {
    model.sync([1, 2, 3, 4, 5], [false, false, false, false, false]);
    const before = model.dice.map(die => die.position.clone());
    model.setHeld([true, false, false, false, false]);
    assert.ok(model.dice.every((die, i) => die.position.equals(before[i])), 'selection begins continuously');
    model.update(.17);
    assert.ok(model.dice[0].position.y > before[0].y + .08);
    for (let i = 1; i < 5; i++) assert.ok(model.dice[i].position.equals(before[i]), 'unselected dice remain on the felt');
    const paused = model.dice.map(die => die.position.toArray());
    for (let i = 0; i < 20; i++) model.update(0);
    assert.deepEqual(model.dice.map(die => die.position.toArray()), paused);
    model.update(.25);
    assert.ok(Math.abs(model.dice[0].position.z - 1.43) < 1e-8);
    assert.ok(Math.abs(model.dice[0].position.y - before[0].y) < 1e-8);
    assert.deepEqual(model.getDebugState().up, [1, 2, 3, 4, 5]);
  });
});

test('rolling immediately after holding cannot leave a kept die suspended through the roll', async () => {
  await diceFixture(({ model }) => {
    model.sync([1, 2, 3, 4, 5], [false, false, false, false, false]);
    const floorCentre = model.dice[0].position.y, held = [true, false, false, false, false];
    model.setHeld(held); model.update(.12);
    assert.ok(model.dice[0].position.y > floorCentre);
    model.startRoll([1, 6, 5, 4, 3], held);
    for (let i = 0; i < 36; i++) model.update(1 / 60);
    assert.equal(model.rolling, true);
    assert.ok(Math.abs(model.dice[0].position.y - floorCentre) < 1e-8, 'the retained die reaches the felt during cup preparation');
    assert.ok(Math.abs(model.dice[0].position.z - 1.43) < 1e-8);
    assert.equal(upwardFace(model.dice[0].quaternion), 1);
  });
});

test('zero-delta pauses the cup and dice, and reset cancels pending roll events', async () => {
  await diceFixture(({ model, events }) => {
    model.sync([1, 2, 3, 4, 5], [false, false, false, false, false]);
    model.startRoll([6, 5, 4, 3, 2], [false, false, false, false, false]);
    for (let i = 0; i < 45; i++) model.update(1 / 60);
    const state = model.getDebugState(), quaternions = model.dice.map(die => die.quaternion.toArray()), count = events.length;
    for (let i = 0; i < 90; i++) model.update(0);
    assert.deepEqual(model.getDebugState(), state); assert.deepEqual(model.dice.map(die => die.quaternion.toArray()), quaternions); assert.equal(events.length, count);
    model.sync([0, 0, 0, 0, 0], [false, false, false, false, false]);
    for (let i = 0; i < 300; i++) model.update(1 / 60);
    assert.equal(events.length, count); assert.equal(model.rolling, false); assert.ok(model.dice.every(die => !die.visible));
  });
});

test('enabling calm mode mid-roll preserves every die pose and result, then finishes once within .2 seconds without more roll sounds', async () => {
  await diceFixture(({ model, events }) => {
    const initial = [1, 2, 3, 4, 5], result = [1, 6, 3, 2, 4], held = [true, false, true, false, false];
    for (const player of [0, 1]) for (const switchTime of [.15, .85, 1.62, 2.9]) {
      model.sync(initial, held, player); model.startRoll(result, held, player);
      for (let time = 0; time < switchTime - 1e-9; time += 1 / 120) model.update(Math.min(1 / 120, switchTime - time));
      const poses = model.dice.map(die => ({ position: die.position.toArray(), quaternion: die.quaternion.toArray() }));
      const eventCount = events.length;
      model.setReducedMotion(false);
      model.setReducedMotion(true);
      assert.deepEqual(model.dice.map(die => ({ position: die.position.toArray(), quaternion: die.quaternion.toArray() })), poses, 'switching calm mode does not teleport a die or change its orientation');
      assert.deepEqual(model.getDebugState().values, result); assert.deepEqual(model.getDebugState().held, held);
      assert.equal(model.getDebugState().duration, .2); assert.equal(model.getGripTarget(), null);
      const paused = model.getDebugState(); model.update(0); assert.deepEqual(model.getDebugState(), paused);
      assert.equal(model.update(.1), false);
      const halfway = model.getDebugState(); model.setReducedMotion(true); model.setReducedMotion(false);
      assert.deepEqual(model.getDebugState(), halfway, 'repeated preference notifications do not restart the transition');
      assert.equal(model.update(.099), false); assert.equal(model.rolling, true);
      assert.equal(model.update(.0011), true); assert.equal(model.rolling, false);
      const finished = model.getDebugState();
      assert.deepEqual(finished.up, result); assert.deepEqual(finished.values, result);
      for (const index of [0, 2]) {
        assert.deepEqual(model.dice[index].position.toArray(), poses[index].position, 'retained dice stay at their contact point');
        assert.deepEqual(model.dice[index].quaternion.toArray(), poses[index].quaternion);
      }
      model.setReducedMotion(true);
      for (let frame = 0; frame < 120; frame++) assert.equal(model.update(1 / 60), false);
      assert.deepEqual(model.getDebugState(), finished); assert.equal(events.length, eventCount, 'no later rattle, impact, or cup event survives the calm transition');
    }
  });
});

test('a parked black cup clears every held die for either player using actual transformed mesh bounds', async () => {
  await diceFixture(({ model, world }) => {
    for (const player of [0, 1]) {
      model.sync([1, 2, 3, 4, 5], [true, true, true, true, true], player);
      world.scene.updateMatrixWorld(true);
      const cupParts = model.cup.children.filter(part => part.userData.cupPart);
      assert.equal(cupParts.length, 4, 'check the opaque wall, two rims and felt base');
      for (const part of cupParts) {
        const cupBounds = new THREE.Box3().setFromObject(part, true);
        for (const die of model.dice) {
          const dieBounds = new THREE.Box3().setFromObject(die, true);
          assert.equal(cupBounds.intersectsBox(dieBounds), false, `player ${player}: actual ${part.geometry.type} clears ${die.name}`);
          const dx = Math.max(0, cupBounds.min.x - dieBounds.max.x, dieBounds.min.x - cupBounds.max.x);
          const dz = Math.max(0, cupBounds.min.z - dieBounds.max.z, dieBounds.min.z - cupBounds.max.z);
          assert.ok(Math.hypot(dx, dz) > .08, 'parked cup has visible horizontal clearance, not just barely separated height');
        }
      }
    }
  });
});

test('the black cup has opaque textured walls, a chunky rim and an open mouth above dark felt', async () => {
  await diceFixture(({ model, world }) => {
    const parts = model.cup.children.filter(part => part.userData.cupPart);
    for (const part of parts) {
      assert.equal(part.material.transparent, false); assert.equal(part.material.opacity, 1);
      assert.equal(part.material.depthWrite, true, 'dice inside the cup are occluded by its physical wall');
    }
    const wall = parts.find(part => part.userData.cupPart === 'wall'), rim = parts.find(part => part.userData.cupPart === 'rim');
    assert.ok(wall.material.map.isDataTexture && wall.material.bumpMap === wall.material.map);
    assert.ok(wall.material.map.image.width <= 64 && wall.material.map.image.height <= 64, 'grain is a small shared repeat texture');
    const colors = wall.geometry.attributes.color;
    for (let i = 0; i < colors.count; i++) assert.ok(Math.max(colors.getX(i), colors.getY(i), colors.getZ(i)) < .04, 'outer and inner shell remain near-black');
    assert.ok(rim.geometry.parameters.tube >= .025, 'rolled rim has visible thickness');
    world.scene.updateMatrixWorld(true);
    const origin = new THREE.Vector3(0, 1.5, 0).applyMatrix4(model.cup.matrixWorld);
    const direction = new THREE.Vector3(0, -1, 0).transformDirection(model.cup.matrixWorld);
    const hits = new THREE.Raycaster(origin, direction).intersectObjects(parts, false);
    assert.ok(hits.length > 0);
    const first = model.cup.worldToLocal(hits[0].point.clone());
    assert.ok(first.y > .09 && first.y < .12, 'a ray down the opening reaches the bottom felt, not a cap across the mouth');
    assert.equal(hits[0].object.userData.cupPart, 'felt');
  });
});

test('mouth releases are sequential and tumble continuously; real die vertices never penetrate the felt', async () => {
  await diceFixture(({ model, world, events }) => {
    const point = new THREE.Vector3(), values = [6, 2, 5, 1, 4], empty = [false, false, false, false, false];
    for (const player of [0, 1]) {
      model.sync([1, 2, 3, 4, 5], empty, player); model.startRoll(values, empty, player);
      const start = events.length, previous = model.dice.map(die => ({ position: die.position.clone(), quaternion: die.quaternion.clone() }));
      for (let frame = 0; frame < 420; frame++) {
        const before = model.getDebugState().elapsed; model.update(1 / 120); world.scene.updateMatrixWorld(true);
        for (let i = 0; i < 5; i++) {
          const mesh = model.dice[i], positions = mesh.geometry.attributes.position;
          for (let vertex = 0; vertex < positions.count; vertex++) {
            point.fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld);
            assert.ok(point.y >= world.table.y - 1e-7, 'rotating rounded-cube vertices stay above the actual tabletop');
          }
          if (before > 1.3) {
            assert.ok(mesh.position.distanceTo(previous[i].position) < .09, 'release/landing does not teleport the die');
            assert.ok(mesh.quaternion.angleTo(previous[i].quaternion) < .24, 'release/settle preserves continuous rotation');
          }
          previous[i].position.copy(mesh.position); previous[i].quaternion.copy(mesh.quaternion);
        }
      }
      const releases = events.slice(start).filter(event => event.kind === 'release');
      assert.deepEqual(releases.map(event => event.data.die), [0, 1, 2, 3, 4]);
      for (let i = 1; i < releases.length; i++) assert.ok(releases[i].time - releases[i - 1].time > .06, 'dice pour one after another');
      for (const release of releases) assert.ok(release.data.position.y > world.table.y + .13, 'the die exits the elevated cup mouth');
      assert.equal(events.slice(start).filter(event => event.kind === 'settle').length, 5);
      assert.deepEqual(model.getDebugState().up, values);
    }
  });
});

test('the gathered dice stay inside the opaque cup wall before their individual mouth exits', async () => {
  await diceFixture(({ model, world }) => {
    const point = new THREE.Vector3(), inverse = new THREE.Matrix4(), empty = [false, false, false, false, false];
    model.sync([1, 2, 3, 4, 5], empty); model.startRoll([6, 5, 4, 3, 2], empty);
    for (let frame = 0; frame < 156; frame++) {
      model.update(1 / 120); if (model.getDebugState().elapsed < .75) continue;
      world.scene.updateMatrixWorld(true); inverse.copy(model.cup.matrixWorld).invert();
      for (const mesh of model.dice) for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        point.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
        assert.ok(Math.hypot(point.x, point.z) < .34, 'no white corner protrudes through the black side wall');
        assert.ok(point.y > .06, 'gathered dice remain above the opaque cup base');
      }
    }
  });
});

test('visual trajectories are deterministic across frame rates and do not consume gameplay randomness', async () => {
  const traces = [];
  for (const step of [1 / 30, 1 / 144]) await diceFixture(({ model, events }) => {
    model.sync([1, 2, 3, 4, 5], [false, true, false, false, false], 1);
    const originalRandom = Math.random; Math.random = () => { throw new Error('visual motion consumed random state'); };
    try {
      const input = [5, 2, 1, 6, 3], held = [false, true, false, false, false], trace = [];
      model.startRoll(input, held, 1); let time = 0;
      for (const stop of [.7, 1.5, 1.9, 2.3, 2.7, 3.4]) {
        while (time < stop - 1e-10) { const dt = Math.min(step, stop - time); model.update(dt); time += dt; }
        trace.push(model.dice.map(die => [...die.position.toArray(), ...die.quaternion.toArray()]));
      }
      assert.deepEqual(input, [5, 2, 1, 6, 3]); assert.deepEqual(held, [false, true, false, false, false]);
      traces.push({ trace, events: events.map(event => [event.kind, event.data.die]) });
    } finally { Math.random = originalRandom; }
  });
  for (let frame = 0; frame < traces[0].trace.length; frame++) for (let die = 0; die < 5; die++) for (let coordinate = 0; coordinate < 7; coordinate++) {
    assert.ok(Math.abs(traces[0].trace[frame][die][coordinate] - traces[1].trace[frame][die][coordinate]) < 1e-7, 'a frame-rate change cannot alter the pour path or result');
  }
  assert.deepEqual(traces[0].events.map(event => JSON.stringify(event)).sort(), traces[1].events.map(event => JSON.stringify(event)).sort(), 'contact/release/settle events are neither lost nor duplicated when simultaneous contacts share a frame');
});

test('settled layouts vary without overlapping dice or a held row, and rebounds lose height', async () => {
  await diceFixture(({ model, events }) => {
    const held = [true, false, false, true, false], vertex = new THREE.Vector3(), layouts = [];
    for (const player of [0, 1]) for (let turn = 0; turn < 4; turn++) {
      model.sync([1, 2, 3, 4, 5], held, player); model.startRoll([1, 6, 2, 4, 3], held, player);
      const heights = [], from = events.length;
      while (model.rolling) {
        model.update(1 / 240); const die = model.dice[1]; die.updateMatrixWorld(true); let bottom = Infinity;
        for (let i = 0; i < die.geometry.attributes.position.count; i++) bottom = Math.min(bottom, vertex.fromBufferAttribute(die.geometry.attributes.position, i).applyMatrix4(die.matrixWorld).y - 1.4);
        heights.push({ time: model.getDebugState().elapsed, bottom });
      }
      for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) {
        const pa = model.dice[a].position, pb = model.dice[b].position;
        assert.ok(Math.hypot(pa.x - pb.x, pa.z - pb.z) > .38, 'settled dice have visible space between their actual footprints');
      }
      const impacts = events.slice(from).filter(event => event.kind === 'impact' && event.data.die === 1);
      assert.equal(impacts.length, 3);
      const peak = (start, end) => Math.max(0, ...heights.filter(sample => sample.time >= start && sample.time < end).map(sample => sample.bottom));
      const first = peak(impacts[0].time, impacts[1].time), second = peak(impacts[1].time, impacts[2].time);
      assert.ok(first < .14 && second < first * .5, 'low gravity rebounds dissipate energy instead of repeating a high sine wave');
      layouts.push(model.dice[1].position.toArray());
    }
    assert.ok(layouts[0].some((value, index) => Math.abs(value - layouts[1][index]) > .001), 'successive rolls do not form the same perfectly regular layout');
  });
});

test('the cup contains no hand geometry and enlarged dice remain independent of any legacy paw resolver', async () => {
  await diceFixture(({ model }) => {
    assert.equal(model.cup.children.length, 4);
    assert.ok(model.cup.children.every(part => part.isMesh && ['wall', 'rim', 'base', 'felt'].includes(part.userData.cupPart)), 'only the four physical black cup parts remain');
    const size = new THREE.Vector3(); model.dice[0].geometry.computeBoundingBox(); model.dice[0].geometry.boundingBox.getSize(size);
    for (const dimension of size.toArray()) assert.ok(Math.abs(dimension - .23 * 1.18) < 1e-7, 'actual die geometry is 18 percent larger');
    let calls = 0; model.setGripResolver(() => { calls++; throw new Error('an autonomous cup asked for a paw'); });
    const values = [1, 2, 3, 4, 5], held = [false, false, false, false, false];
    for (const player of [0, 1]) {
      model.sync(values, held, player); model.startRoll(values, held, player);
      for (let frame = 0; frame < 420; frame++) { model.update(1 / 120); assert.equal(model.getGripTarget(), null); }
      assert.deepEqual(model.getDebugState().up, values);
    }
    assert.equal(calls, 0); model.dispose(); model.setReady(true); model.setGripResolver(() => { calls++; }); model.update(1);
    assert.equal(calls, 0); assert.equal(model.getGripTarget(), null);
  });
});

test('the ready cup floats at centre, freezes on pause or calm, and returns smoothly to a clear result parking place', async () => {
  await diceFixture(({ model, world }) => {
    const empty = [false, false, false, false, false];
    model.sync([0, 0, 0, 0, 0], empty); model.setReady(true);
    const centre = model.cup.position.clone(); assert.ok(Math.abs(centre.x) < .2 && Math.abs(centre.z) < .1);
    assert.ok(centre.y > world.table.y + .15);
    model.update(.25); assert.ok(model.cup.position.distanceTo(centre) > .001, 'readiness has a restrained floating motion');
    const idle = model.getDebugState(); for (let i = 0; i < 20; i++) model.update(0);
    assert.deepEqual(model.getDebugState(), idle);
    model.setReducedMotion(true); const calm = model.getDebugState(); for (let i = 0; i < 60; i++) model.update(1 / 60);
    assert.deepEqual(model.getDebugState(), calm, 'calm mode suppresses idle bob and lean');
    model.setReducedMotion(false); model.startRoll([6, 5, 4, 3, 2], empty, 0);
    const previous = model.cup.position.clone(); let highest = previous.y;
    while (model.rolling) {
      model.update(1 / 120); highest = Math.max(highest, model.cup.position.y);
      assert.ok(model.cup.position.distanceTo(previous) < .07, 'self-shake and parking never teleport the cup');
      previous.copy(model.cup.position);
    }
    assert.ok(highest > centre.y + .20, 'the autonomous cup lifts before pouring');
    assert.ok(Math.abs(model.cup.position.x + 1.45) < .01 && Math.abs(model.cup.position.z - .80) < .01);
    assert.ok(Math.abs(model.cup.position.y - world.table.y - .06) < 1e-9, 'park close to the felt away from the dice-selection area');
    const parked = model.cup.position.clone(); model.setReady(true); for (let i = 0; i < 120; i++) model.update(1 / 120);
    assert.ok(Math.abs(model.cup.position.x - parked.x) < 1e-9 && Math.abs(model.cup.position.z - parked.z) < 1e-9, 'reroll readiness does not recenter the cup over readable dice');
    model.sync([0, 0, 0, 0, 0], empty, 1); assert.ok(Math.abs(model.cup.position.x) < .2 && Math.abs(model.cup.position.z) < .1, 'only a new empty turn returns to centre');
  });
});

test('projected cup and dice targets reuse their records and follow the actual current mesh poses', async () => {
  await diceFixture(({ model, world }) => {
    const values = [1, 2, 3, 4, 5], held = [false, false, false, false, false];
    model.sync(values, held); model.setReady(true);
    const list = model.screenPositions(), records = [...list], cup = model.screenCupPosition(), focus = model.getFocusTarget(), out = new THREE.Vector3();
    assert.equal(model.getFocusTarget(out), out); assert.ok(out.distanceTo(focus) < 1e-12);
    assert.ok(cup.visible && cup.ready && cup.radius > 0 && Number.isFinite(cup.radius));
    assert.ok(cup.width > 0 && cup.height > 0 && Number.isFinite(cup.width + cup.height));
    for (let frame = 0; frame < 60; frame++) {
      model.update(1 / 60);
      assert.equal(model.screenPositions(), list); for (let i = 0; i < 5; i++) assert.equal(list[i], records[i]);
      assert.equal(model.screenCupPosition(), cup); assert.equal(model.getFocusTarget(), focus);
      const projected = out.copy(focus).project(world.camera);
      assert.ok(Math.abs(cup.x - (projected.x * .5 + .5)) < 1e-9 && Math.abs(cup.y - (-projected.y * .5 + .5)) < 1e-9);
    }
    model.setHeld([false, true, false, false, false]); model.update(.4);
    assert.deepEqual(model.screenPositions().map(target => target.value), values); assert.equal(list[1].held, true);
    model.startRoll([6, 2, 3, 5, 1], [false, true, false, false, false]); model.update(.8);
    assert.equal(model.screenCupPosition().ready, false, 'a rolling cup cannot appear ready for a second click');
    assert.deepEqual(model.screenPositions().map(target => target.value), [6, 2, 3, 5, 1]);
    model.dispose(); assert.equal(model.screenCupPosition().visible, false); assert.ok(model.screenPositions().every(target => !target.visible));
  });
});

test('cached tight cup bounds exactly follow real silhouettes while symmetric dimensions retain the focus anchor', async () => {
  await diceFixture(({ model, world }) => {
    const point = new THREE.Vector3(), focus = new THREE.Vector3(), empty = [false, false, false, false, false];
    const record = model.screenCupPosition();
    function assertContainsCup() {
      world.scene.updateMatrixWorld(true);
      const bounds = model.screenCupPosition();
      assert.equal(bounds, record, 'silhouette updates reuse the projection record');
      model.getFocusTarget(focus).project(world.camera);
      assert.ok(Math.abs(bounds.x - (focus.x * .5 + .5)) < 1e-12 && Math.abs(bounds.y - (-focus.y * .5 + .5)) < 1e-12, 'the click anchor stays on the existing cup focus');
      assert.ok(bounds.width > 0 && bounds.height > 0 && Number.isFinite(bounds.width + bounds.height));
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      model.cup.traverse(mesh => {
        if (!mesh.geometry) return;
        const vertices = mesh.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) {
          point.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld).project(world.camera);
          const x = point.x * .5 + .5, y = -point.y * .5 + .5;
          assert.ok(Math.abs(x - bounds.x) <= bounds.width * .5 + 1e-9, 'every cup vertex fits the reported viewport-width fraction');
          assert.ok(Math.abs(y - bounds.y) <= bounds.height * .5 + 1e-9, 'every cup vertex fits the reported viewport-height fraction');
          assert.ok(x >= bounds.left - 1e-9 && x <= bounds.right + 1e-9 && y >= bounds.top - 1e-9 && y <= bounds.bottom + 1e-9, 'the tighter hitbox contains the actual mesh');
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      });
      assert.ok(Math.abs(left - bounds.left) < 1e-9 && Math.abs(right - bounds.right) < 1e-9 && Math.abs(top - bounds.top) < 1e-9 && Math.abs(bottom - bounds.bottom) < 1e-9, 'each tight edge touches an actual projected vertex instead of inflated empty space');
      assert.ok(bounds.right - bounds.left <= bounds.width && bounds.bottom - bounds.top <= bounds.height);
    }
    for (const view of [{ aspect: 1.5, eye: [0, 5, 7] }, { aspect: 390 / 844, eye: [0, 5.4, .9] }]) {
      world.camera.aspect = view.aspect; world.camera.position.set(...view.eye); world.camera.lookAt(0, 1.6, 0); world.camera.updateProjectionMatrix(); world.camera.updateMatrixWorld();
      model.sync([0, 0, 0, 0, 0], empty); model.setReady(true); assertContainsCup();
      model.update(.18); assertContainsCup();
      model.startRoll([1, 2, 3, 4, 5], empty);
      for (let i = 0; i < 70; i++) { model.update(.05); assertContainsCup(); }
      model.sync([0, 0, 0, 0, 0], empty, 1, { animate: true });
      for (let i = 0; i < 12; i++) { model.update(.05); assertContainsCup(); }
    }
    model.root.position.set(.2, -.1, .3); model.root.rotation.y = .3; model.root.scale.set(1.1, .9, 1.05); assertContainsCup();
  });
});

test('cached die bounds contain real silhouettes through zoom, held motion and tumble with transformed parents', async () => {
  await diceFixture(({ model, world }) => {
    const point = new THREE.Vector3(), empty = [false, false, false, false, false];
    const targets = model.screenPositions(), records = [...targets];
    function assertContainsDice() {
      assert.equal(model.screenPositions(), targets);
      for (let i = 0; i < 5; i++) {
        const die = model.dice[i], bounds = targets[i], vertices = die.geometry.attributes.position;
        assert.equal(bounds, records[i], 'bounds reuse the existing target record');
        assert.ok(Number.isFinite(bounds.left + bounds.right + bounds.top + bounds.bottom));
        assert.ok(bounds.left < bounds.x && bounds.x < bounds.right && bounds.top < bounds.y && bounds.y < bounds.bottom);
        point.setFromMatrixPosition(die.matrixWorld).project(world.camera);
        assert.ok(Math.abs(bounds.x - (point.x * .5 + .5)) < 1e-12 && Math.abs(bounds.y - (-point.y * .5 + .5)) < 1e-12, 'centres use world transforms too');
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (let vertex = 0; vertex < vertices.count; vertex++) {
          point.fromBufferAttribute(vertices, vertex).applyMatrix4(die.matrixWorld).project(world.camera);
          const x = point.x * .5 + .5, y = -point.y * .5 + .5;
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        assert.ok(bounds.left <= left + 1e-9 && bounds.right >= right - 1e-9 && bounds.top <= top + 1e-9 && bounds.bottom >= bottom - 1e-9, 'reported bounds contain every transformed mesh vertex');
        assert.ok(bounds.right - bounds.left < (right - left) * 1.32 && bounds.bottom - bounds.top < (bottom - top) * 1.32, 'conservative corner bounds stay close to the actual rounded silhouette');
      }
    }
    for (const view of [{ aspect: 1.5, eye: [0, 5, 7] }, { aspect: 390 / 844, eye: [0, 4.3, .6] }]) {
      world.camera.aspect = view.aspect; world.camera.position.set(...view.eye); world.camera.lookAt(0, 1.6, 0); world.camera.updateProjectionMatrix(); world.camera.updateMatrixWorld();
      model.sync([1, 2, 3, 4, 5], empty); assertContainsDice();
      model.setHeld([true, false, false, false, true]);
      for (let frame = 0; frame < 8; frame++) { model.update(.05); assertContainsDice(); }
      model.startRoll([1, 6, 2, 3, 5], [true, false, false, false, true]);
      for (let frame = 0; frame < 70; frame++) { model.update(.05); assertContainsDice(); }
    }
    model.root.position.set(.3, -.1, .2); model.root.rotation.y = .37; model.root.scale.set(1.1, .9, 1.05);
    assertContainsDice();
    model.sync([0, 0, 0, 0, 0], empty); assert.ok(model.screenPositions().every(target => !target.visible));
  });
});

test('camera framing points reuse settled world targets rather than transient rolling or holding poses', async () => {
  await diceFixture(({ model }) => {
    const empty = [false, false, false, false, false], values = [1, 2, 3, 4, 5];
    model.sync(values, empty);
    const points = model.getFramingPoints(), records = [...points], before = points.map(point => point.clone());
    assert.ok(points.every((point, i) => point.distanceTo(model.dice[i].position) < 1e-12));
    model.setHeld([true, false, false, false, false]);
    assert.equal(model.getFramingPoints(), points); assert.ok(points.every((point, i) => point === records[i]));
    assert.equal(points[0].z, 1.43); assert.ok(model.dice[0].position.distanceTo(points[0]) > .1, 'camera sees the destination before the hold arc arrives');
    assert.ok(points.slice(1).every((point, i) => point.distanceTo(before[i + 1]) < 1e-12));
    model.update(.34); assert.ok(points[0].distanceTo(model.dice[0].position) < 1e-12);
    model.startRoll([1, 4, 2, 6, 3], [true, false, false, false, false]);
    const settled = model.getFramingPoints().map(point => point.clone());
    for (let frame = 0; frame < 70; frame++) {
      model.update(.05); model.getFramingPoints();
      assert.ok(points.every((point, i) => point.distanceTo(settled[i]) < 1e-12), 'flight poses never pull the result framing around');
    }
    assert.ok(points.every((point, i) => point.distanceTo(model.dice[i].position) < 1e-12));
    model.root.position.set(.2, -.1, .4); model.root.rotation.y = .31;
    model.getFramingPoints();
    assert.ok(points.every((point, i) => point.distanceTo(settled[i].applyMatrix4(model.root.matrixWorld)) < 1e-12));
    // Consumers may retain the records; they cannot corrupt the underlying targets.
    points[0].set(999, 999, 999); model.getFramingPoints(); assert.ok(points[0].x < 10);
  });
});

test('a first throw begins with hidden dice inside the cup; only visible reroll dice gather from the table', async () => {
  await diceFixture(({ model, world, events }) => {
    const empty = [false, false, false, false, false], point = new THREE.Vector3(), inverse = new THREE.Matrix4();
    model.sync([0, 0, 0, 0, 0], empty); assert.ok(model.dice.every(die => !die.visible));
    model.startRoll([1, 2, 3, 4, 5], empty);
    for (let frame = 0; frame < 120; frame++) {
      world.scene.updateMatrixWorld(true); inverse.copy(model.cup.matrixWorld).invert();
      for (const die of model.dice) for (let vertex = 0; vertex < die.geometry.attributes.position.count; vertex++) {
        point.fromBufferAttribute(die.geometry.attributes.position, vertex).applyMatrix4(die.matrixWorld).applyMatrix4(inverse);
        assert.ok(Math.hypot(point.x, point.z) < .34 && point.y > .06 && point.y < 1.02, 'first-roll dice are inside the physical cup instead of popping onto the felt');
      }
      model.update(1 / 120);
    }
    assert.equal(events.filter(event => event.kind === 'sweep').length, 0, 'a loaded first cup has nothing to sweep up');
    while (model.rolling) model.update(1 / 120);
    const positions = model.dice.map(die => die.position.clone()); model.setHeld([true, false, false, false, false]); model.update(.4);
    positions[0].copy(model.dice[0].position); model.startRoll([1, 6, 5, 4, 3], [true, false, false, false, false]);
    for (let i = 0; i < 5; i++) assert.ok(model.dice[i].position.distanceTo(positions[i]) < 1e-9, 'a reroll starts at the visible current positions');
    model.update(.2); assert.ok(model.dice.slice(1).some((die, index) => die.position.distanceTo(positions[index + 1]) > .1));
    assert.ok(model.dice[0].position.distanceTo(positions[0]) < 1e-9); assert.equal(events.filter(event => event.kind === 'sweep').length, 1);
  });
});

test('animated turn reset preserves the parked pose, takes .55 seconds, pauses, and can be interrupted by a roll', async () => {
  await diceFixture(({ model }) => {
    const empty = [false, false, false, false, false]; model.sync([1, 2, 3, 4, 5], empty);
    const parked = model.cup.position.clone(), orientation = model.cup.quaternion.clone();
    model.sync([0, 0, 0, 0, 0], empty, 1, { animate: true });
    assert.ok(model.cup.position.equals(parked)); assert.ok(model.cup.quaternion.equals(orientation)); assert.ok(model.dice.every(die => !die.visible));
    const before = model.getDebugState(); model.update(0); assert.deepEqual(model.getDebugState(), before);
    model.update(.275); assert.ok(model.getDebugState().returning); assert.ok(model.cup.position.x > parked.x && model.cup.position.x < -.15);
    const middle = model.cup.position.clone(); model.startRoll([6, 5, 4, 3, 2], empty, 1);
    assert.ok(model.cup.position.equals(middle)); assert.equal(model.getDebugState().returning, false);
    model.update(1 / 120); assert.ok(model.cup.position.distanceTo(middle) < .02, 'a click during the centre return starts continuously');
    model.sync([1, 2, 3, 4, 5], empty); assert.ok(model.cup.position.equals(parked), 'default sync still snaps for restoration and QA');
    model.sync([0, 0, 0, 0, 0], empty, 0, { animate: true }); model.update(.549); assert.equal(model.getDebugState().returning, true);
    model.update(.0011); assert.equal(model.getDebugState().returning, false); assert.ok(Math.abs(model.cup.position.x + .15) < 1e-9 && Math.abs(model.cup.position.z - .05) < 1e-9);
  });
});

test('compact result cup scales continuously during pickup, return, interruption and calm mode', async () => {
  await diceFixture(({ model }) => {
    const empty = [false, false, false, false, false], values = [1, 2, 3, 4, 5];
    model.sync(values, empty); assert.equal(model.cup.scale.x, .42);
    let previous = model.cup.scale.x;
    model.startRoll([6, 5, 4, 3, 2], empty);
    assert.equal(model.cup.scale.x, previous, 'starting a cast preserves the current scale');
    for (let frame = 0; frame < 410; frame++) {
      model.update(1 / 120);
      assert.ok(Math.abs(model.cup.scale.x - previous) < .025, 'scale changes less than 3.1% of full size per 120 Hz frame without a snap');
      assert.ok(model.cup.scale.x >= .42 - 1e-12 && model.cup.scale.x <= .82 + 1e-12);
      if (frame > 40 && frame < 230) assert.equal(model.cup.scale.x, .82, 'dice are gathered and released from the full-size cup');
      previous = model.cup.scale.x;
    }
    assert.equal(model.cup.scale.x, .42);
    for (const delay of [0, .07, .275, .55]) {
      model.sync(values, empty); model.sync([0, 0, 0, 0, 0], empty, 1, { animate: true });
      assert.equal(model.cup.scale.x, .42); model.update(delay);
      previous = model.cup.scale.x;
      model.update(0); assert.equal(model.cup.scale.x, previous, 'paused turn-return keeps its exact scale');
      model.startRoll(values, empty, 1); assert.equal(model.cup.scale.x, previous, 'interrupting the return preserves its intermediate scale');
      model.update(.14); assert.ok(model.cup.scale.x >= previous); previous = model.cup.scale.x;
      model.setReducedMotion(true); assert.equal(model.cup.scale.x, previous, 'live calm keeps its current scale on entry');
      for (let frame = 0; frame < 25; frame++) {
        model.update(.01); assert.ok(model.cup.scale.x <= previous + 1e-12); previous = model.cup.scale.x;
      }
      assert.equal(model.cup.scale.x, .42); assert.deepEqual(model.getDebugState().up, values);
    }
    model.sync(values, empty); model.sync([0, 0, 0, 0, 0], empty, 0, { animate: true }); model.update(.55);
    assert.equal(model.cup.scale.x, .82, 'a completed new turn restores full size');
  });
});

test('compact parked cup clears all visible result and held dice in both player layouts', async () => {
  await diceFixture(({ model, world }) => {
    for (const player of [0, 1]) for (const held of [[false, false, false, false, false], [true, false, true, false, true], [true, true, true, true, true]]) {
      model.sync([1, 2, 3, 4, 5], held, player); world.scene.updateMatrixWorld(true);
      const cupBounds = new THREE.Box3().setFromObject(model.cup, true);
      assert.equal(model.cup.scale.x, .42);
      for (const die of model.dice) assert.equal(cupBounds.intersectsBox(new THREE.Box3().setFromObject(die, true)), false, 'compact cup geometry stays separate from every readable die');
    }
  });
});

test('casting before a new turn finishes expanding never exposes loaded dice outside the compact cup', async () => {
  await diceFixture(({ model, world }) => {
    const empty = [false, false, false, false, false], point = new THREE.Vector3(), inverse = new THREE.Matrix4();
    for (const interruptedAt of [0, .07, .275]) {
      model.sync([1, 2, 3, 4, 5], empty); model.sync([0, 0, 0, 0, 0], empty, 0, { animate: true }); model.update(interruptedAt);
      model.startRoll([6, 5, 4, 3, 2], empty);
      for (let frame = 0; frame < 120; frame++) {
        world.scene.updateMatrixWorld(true); inverse.copy(model.cup.matrixWorld).invert();
        if (frame > 35) assert.ok(model.dice.every(die => die.visible), 'all loaded dice become visible once the full cup encloses them');
        for (const die of model.dice) if (die.visible) for (let vertex = 0; vertex < die.geometry.attributes.position.count; vertex++) {
          point.fromBufferAttribute(die.geometry.attributes.position, vertex).applyMatrix4(die.matrixWorld).applyMatrix4(inverse);
          assert.ok(Math.hypot(point.x, point.z) < .34 && point.y > .06 && point.y < 1.02, 'visible loaded vertices never poke through the compact shell');
        }
        model.update(1 / 120);
      }
    }
  });
});

test('dice disposal releases shared materials and geometry once and disables the old roll', async () => {
  await diceFixture(({ model, world, events }) => {
    const resources = new Set();
    model.root.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) { resources.add(material); if (material.map) resources.add(material.map); }
    });
    const counts = new Map();
    for (const resource of resources) { counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)); }
    model.startRoll([1, 2, 3, 4, 5], [false, false, false, false, false]); model.update(.5);
    model.dispose(); model.dispose();
    assert.equal(world.scene.children.length, 0);
    for (const count of counts.values()) assert.equal(count, 1);
    const before = model.getDebugState(), eventCount = events.length;
    model.update(5); model.startRoll([6, 6, 6, 6, 6], [false, false, false, false, false]);
    assert.deepEqual(model.getDebugState(), before); assert.equal(events.length, eventCount);
  });
});

test('Yatzy effects use fixed particle and ring pools, freeze in pause and clear both synchronously', () => {
  const world = { scene: new THREE.Scene(), table: { y: 1.4 } }, effects = createYatzyEffects(world), position = new THREE.Vector3(0, 1.4, 0);
  try {
    const mesh = world.scene.children[0], matrix = mesh.instanceMatrix;
    for (let i = 0; i < 40; i++) effects.emit(position, { kind: 'score' });
    effects.update(.05);
    assert.equal(world.scene.children.length, 2); assert.equal(effects.getStats().active, 120);
    const snapshot = matrix.array.slice(), version = matrix.version;
    for (let i = 0; i < 30; i++) effects.update(0);
    assert.deepEqual(matrix.array, snapshot); assert.equal(matrix.version, version);
    for (let i = 0; i < 160; i++) effects.update(.02);
    assert.equal(effects.getStats().active, 0);
    effects.emit(position, { kind: 'score', reduced: true }); effects.update(.02); assert.equal(effects.getStats().active, 0);
    effects.emit(position, { kind: 'hold' }); effects.update(.02); assert.equal(effects.getStats().active, 12);
    effects.clear(); assert.ok(world.scene.children.every(pool => pool.count === 0)); effects.update(.02); assert.ok(world.scene.children.every(pool => pool.count === 0));
    assert.equal(mesh.instanceMatrix, matrix, 'bursts never replace their instance buffer');
  } finally { effects.dispose(); }
});

test('effect disposal releases the instance allocation once and makes detached effects inert', () => {
  const world = { scene: new THREE.Scene(), table: { y: 1.4 } }, effects = createYatzyEffects(world), mesh = world.scene.children[0];
  const counts = new Map(world.scene.children.flatMap(pool => [[pool, 0], [pool.geometry, 0], [pool.material, 0]]));
  for (const resource of counts.keys()) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  effects.emit(new THREE.Vector3(), { kind: 'score' }); effects.update(.02);
  effects.dispose(); effects.dispose();
  assert.equal(world.scene.children.length, 0);
  for (const count of counts.values()) assert.equal(count, 1);
  const version = mesh.instanceMatrix.version;
  effects.emit(new THREE.Vector3(), { kind: 'score' }); effects.update(.1); effects.clear();
  assert.equal(mesh.instanceMatrix.version, version); assert.equal(effects.getStats().active, 0);
});
