import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TABLE, createYatzyTable, createYatzyCameraRig } from '../engine/yatzy-mosi/world.js';

test('Yatzy furniture gives dice one level felt surface and a raised rounded rail', () => {
  const furniture = createYatzyTable();
  try {
    furniture.group.updateMatrixWorld(true);
    const felt = furniture.group.getObjectByName('Playable green felt');
    felt.geometry.computeBoundingBox();
    const bounds = felt.geometry.boundingBox;
    assert.ok(Math.abs(bounds.min.y - TABLE.y) < 1e-6 && Math.abs(bounds.max.y - TABLE.y) < 1e-6);
    assert.ok(Math.abs(bounds.max.x - bounds.min.x - TABLE.width) < 1e-6);
    assert.ok(Math.abs(bounds.max.z - bounds.min.z - TABLE.depth) < 1e-6);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 8, 0), new THREE.Vector3(0, -1, 0));
    const centre = ray.intersectObject(furniture.group, true)[0];
    assert.equal(centre.object, felt, 'the wood frame leaves the rolling centre open');
    assert.ok(Math.abs(centre.point.y - TABLE.y) < 1e-6);
    ray.ray.origin.x = 3;
    const rim = ray.intersectObject(furniture.group, true)[0];
    assert.ok(rim.point.y > TABLE.y + .1 && rim.point.y < TABLE.y + .17);
    assert.equal(furniture.chair.position.z, -3.35);
    ray.ray.origin.set(0, 8, -3.35);
    const seat = ray.intersectObject(furniture.chair, true)[0];
    assert.ok(Math.abs(seat.point.y - .72) < .001, 'the chair meets Mosi’s seated pose contract');
    let calls = 0, triangles = 0;
    furniture.group.traverse(object => { if (object.isMesh) { calls++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3; } });
    assert.equal(calls, 6, 'joinery and legs are merged rather than individual draws');
    assert.ok(triangles < 14000, `furniture triangles: ${triangles}`);
  } finally { furniture.dispose(); }
});

test('Yatzy furniture owns only two mipmapped surfaces and releases every resource once', () => {
  const furniture = createYatzyTable(), resources = new Set(), textures = new Set();
  furniture.group.traverse(object => {
    if (!object.isMesh) return;
    resources.add(object.geometry); resources.add(object.material);
    for (const key of ['map', 'bumpMap']) if (object.material[key]) textures.add(object.material[key]);
  });
  assert.equal(textures.size, 2);
  for (const texture of textures) {
    resources.add(texture);
    assert.equal(texture.generateMipmaps, true);
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(texture.image.width, 512);
  }
  const counts = new Map();
  for (const resource of resources) { counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)); }
  const scene = new THREE.Scene(); scene.add(furniture.group);
  furniture.dispose(); furniture.dispose();
  assert.equal(scene.children.length, 0);
  for (const count of counts.values()) assert.equal(count, 1);
});


const freeLayout = [[-.92, -.25], [-.38, .46], [.34, -.45], [.91, .19], [.32, .86]];
function layout(player = 0, held = []) {
  return freeLayout.map(([x, z], i) => new THREE.Vector3(held.includes(i) ? (i - 2) * .6 : x, TABLE.y + .1357, held.includes(i) ? player ? -.75 : 1.43 : player ? .35 - z * .65 : z));
}
function projectedBounds(camera, point, width, height, half = .149) {
  const projected = new THREE.Vector3(), result = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const x of [-half, half]) for (const y of [-.1357, .1357]) for (const z of [-half, half]) {
    projected.copy(point).add(new THREE.Vector3(x, y, z)).project(camera);
    const sx = (projected.x + 1) * width / 2, sy = (1 - projected.y) * height / 2;
    result.left = Math.min(result.left, sx); result.right = Math.max(result.right, sx);
    result.top = Math.min(result.top, sy); result.bottom = Math.max(result.bottom, sy);
  }
  return result;
}
function faceWidth(camera, points, width) {
  let total = 0;
  for (const point of points) {
    const left = point.clone().add(new THREE.Vector3(-.1357, .1357, 0)).project(camera);
    const right = point.clone().add(new THREE.Vector3(.1357, .1357, 0)).project(camera);
    total += (right.x - left.x) * width / 2;
  }
  return total / points.length;
}

test('adaptive closeup enlarges the artwork and fits real unheld, mixed, and held layouts with external labels', () => {
  const direction = new THREE.Vector3();
  for (const [width, height] of [[1066, 1000], [390, 472.64], [1280, 720], [320, 400], [650, 900]]) {
    const camera = new THREE.PerspectiveCamera(), rig = createYatzyCameraRig(camera, { width, height });
    for (const player of [0, 1]) for (const held of [[], [0, 3], [0, 1, 2, 3, 4]]) {
      const points = layout(player, held); rig.setDiceFocus(points, { snap: true }); rig.setView('dice', { reduced: true });
      camera.getWorldDirection(direction);
      assert.ok(Math.abs(THREE.MathUtils.radToDeg(Math.asin(-direction.y)) - 61) < .001);
      for (const point of points) {
        const bounds = projectedBounds(camera, point, width, height), compact = height < 620;
        assert.ok(bounds.left >= 0 && bounds.right <= width, 'the full die remains onscreen');
        assert.ok(bounds.top - 22 >= (compact ? 60 : 90), 'external result labels clear the masthead');
        assert.ok(bounds.bottom + 20 <= height - (compact ? 90 : 110), 'held labels clear the roll controls');
        const centre = point.clone().project(camera), x = (centre.x + 1) * width / 2, y = (1 - centre.y) * height / 2;
        assert.ok(x >= 23 && x <= width - 23 && y >= 23 && y <= height - 23, 'a 46px target fits');
      }
      const cup = new THREE.Vector3(-1.45, TABLE.y + .06 + .52 * .42, .80).project(camera);
      const cupX = (cup.x + 1) * width / 2, cupY = (1 - cup.y) * height / 2;
      assert.ok(cupX >= 22 && cupX <= width - 22 && cupY >= 22 && cupY <= height - 22, 'the smaller parked cup remains a full clickable target');
      for (const x of [-.394 * .42, .394 * .42]) for (const y of [0, 1.001 * .42]) for (const z of [-.394 * .42, .394 * .42]) {
        const rim = new THREE.Vector3(-1.45 + x, TABLE.y + .06 + y, .80 + z).project(camera);
        assert.ok(Math.abs(rim.x) <= 1 && Math.abs(rim.y) <= 1, 'the actual parked-cup silhouette is completely visible');
      }
      if (player === 0 && held.length === 0 && (width === 1066 || width === 390)) {
        const before = width === 1066 ? 67.18525 : 24.40905;
        assert.ok(faceWidth(camera, points, width) >= before * 1.35, 'actual top artwork is at least 35% larger than the former result camera');
      }
      if (player === 0 && held.length === 5 && (width === 1066 || width === 390)) {
        const before = width === 1066 ? 75.65739 : 26.71746;
        assert.ok(faceWidth(camera, points, width) >= before * 1.22, 'even the widest held row is materially larger');
      }
    }
    rig.dispose();
  }
});

test('camera establishes the overhead angle before finishing its close dolly, and pause freezes both stages', () => {
  const camera = new THREE.PerspectiveCamera(), rig = createYatzyCameraRig(camera, { width: 1066, height: 1000 });
  const seated = camera.position.clone(); assert.deepEqual(seated.toArray(), [-.4, 3.2, 4.4]);
  assert.equal(rig.isViewTransitioning(), false);
  rig.setView('dice'); assert.ok(camera.position.equals(seated)); assert.equal(rig.isViewTransitioning(), true);
  rig.update(.78);
  const state = rig.getState(), travelling = camera.position.clone(), quaternion = camera.quaternion.toArray();
  assert.equal(state.blend, 1); assert.ok(state.zoom > 0 && state.zoom < .6); assert.equal(state.transitioning, true);
  const angleStageWidth = faceWidth(camera, layout(), 1066);
  for (let frame = 0; frame < 60; frame++) assert.equal(rig.update(0), false);
  assert.equal(rig.isViewTransitioning(), true, 'the allocation-free predicate includes paused camera motion');
  assert.deepEqual(rig.getState(), state); assert.ok(camera.position.equals(travelling)); assert.deepEqual(camera.quaternion.toArray(), quaternion);
  rig.setView('dice'); assert.deepEqual(rig.getState(), state, 'repeated requests do not restart travel');
  rig.update(.4); assert.equal(rig.getState().zoom, 1); assert.equal(rig.getState().transitioning, false);
  assert.equal(rig.isViewTransitioning(), false);
  assert.ok(faceWidth(camera, layout(), 1066) > angleStageWidth * 1.1, 'a visible extra zoom follows the overhead reveal');
  const overhead = camera.position.clone();
  rig.setView('table'); rig.update(.2); const returning = camera.position.clone();
  rig.setView('dice'); assert.ok(camera.position.equals(returning), 'reversing never snaps to an endpoint');
  rig.update(1.3); assert.ok(camera.position.distanceTo(overhead) < 1e-9);
  rig.setView('table'); rig.update(1); assert.ok(camera.position.distanceTo(seated) < 1e-9);
  assert.equal(rig.update(-1), false); assert.throws(() => rig.setView('unknown'), RangeError); rig.dispose();
});

test('adaptive focus copies targets, eases a hold destination, and is inert under a paused clock', () => {
  const camera = new THREE.PerspectiveCamera(), rig = createYatzyCameraRig(camera, { width: 390, height: 472.64 });
  rig.setDiceFocus(layout(), { snap: true }); rig.setView('dice', { reduced: true });
  const start = camera.position.clone(), points = layout(0, [0, 3]);
  assert.equal(rig.setDiceFocus(points), true); assert.ok(camera.position.equals(start));
  assert.equal(rig.isViewTransitioning(), true, 'the predicate also includes held-layout reframing');
  points[0].set(1000, 1000, 1000); // The caller's cached records can be reused immediately.
  assert.equal(rig.update(0), false); assert.ok(camera.position.equals(start));
  rig.update(.25); assert.equal(rig.getState().reframing, true); const midway = camera.position.clone();
  assert.ok(midway.distanceTo(start) > .01);
  rig.update(.4); assert.equal(rig.getState().transitioning, false);
  const comparisonCamera = new THREE.PerspectiveCamera(), comparison = createYatzyCameraRig(comparisonCamera, { width: 390, height: 472.64 });
  comparison.setDiceFocus(layout(0, [0, 3]), { snap: true }); comparison.setView('dice', { reduced: true });
  assert.ok(camera.position.distanceTo(comparisonCamera.position) < 1e-9);
  assert.equal(rig.setDiceFocus(layout(0, [0, 3])), false, 'stationary requests do not create idle camera breathing');
  const endpoint = camera.position.clone(); assert.equal(rig.setDiceFocus([{ x: NaN }]), false); assert.ok(camera.position.equals(endpoint));
  rig.setDiceFocus(layout(1, [0, 1, 2, 3, 4])); rig.update(.1); rig.setView('dice', { reduced: true });
  assert.equal(rig.getState().transitioning, false); assert.equal(rig.getState().zoom, 1);
  assert.equal(rig.isViewTransitioning(), false, 'calm mode clears the predicate immediately');
  comparison.setDiceFocus(layout(1, [0, 1, 2, 3, 4]), { snap: true });
  assert.ok(camera.position.distanceTo(comparisonCamera.position) < 1e-9, 'calm mode completes an active reframe immediately');
  rig.dispose(); comparison.dispose();
});

test('resize preserves both camera stages and calm mode snaps immediately even with a paused clock', () => {
  const camera = new THREE.PerspectiveCamera(), rig = createYatzyCameraRig(camera, { width: 1066, height: 1000 });
  rig.setDiceFocus(layout(0, [1, 4]), { snap: true }); rig.setView('dice'); rig.update(.85);
  const { blend, zoom } = rig.getState(); rig.resize(390, 472.64);
  assert.equal(rig.getState().blend, blend); assert.equal(rig.getState().zoom, zoom); assert.equal(rig.getState().transitioning, true);
  const comparisonCamera = new THREE.PerspectiveCamera(), comparison = createYatzyCameraRig(comparisonCamera, { width: 390, height: 472.64 });
  comparison.setDiceFocus(layout(0, [1, 4]), { snap: true }); comparison.setView('dice'); comparison.update(.85);
  assert.ok(camera.position.distanceTo(comparisonCamera.position) < 1e-9);
  assert.ok(camera.quaternion.angleTo(comparisonCamera.quaternion) < 1e-7);
  rig.setView('dice', { reduced: true }); assert.equal(rig.getState().zoom, 1); assert.equal(rig.getState().transitioning, false);
  const snapped = camera.position.clone(); rig.update(0); assert.ok(camera.position.equals(snapped));
  rig.setView('table', { reduced: true }); const stopped = camera.position.clone();
  rig.dispose(); rig.dispose(); rig.setView('dice', { reduced: true }); rig.setDiceFocus(layout()); rig.resize(1280, 720); rig.update(1);
  assert.ok(camera.position.equals(stopped)); comparison.dispose();
});

test('camera opens ahead of actual held arcs, keeping every moving die and external label in frame', () => {
  for (const [width, height] of [[1066, 1000], [390, 472.64]]) for (const player of [0, 1]) {
    for (const held of [[0], [1], [2], [3], [4], [0, 3], [0, 1, 2, 3, 4]]) for (const reverse of [false, true]) {
      const camera = new THREE.PerspectiveCamera(), rig = createYatzyCameraRig(camera, { width, height });
      const starts = layout(player, reverse ? held : []), ends = layout(player, reverse ? [] : held);
      rig.setDiceFocus(starts, { snap: true }); rig.setView('dice', { reduced: true }); rig.setDiceFocus(ends);
      for (let frame = 1; frame <= 72; frame++) {
        rig.update(1 / 120);
        const raw = Math.min(1, frame / 120 / .34), progress = raw * raw * (3 - 2 * raw);
        for (let index = 0; index < 5; index++) {
          const point = starts[index].clone().lerp(ends[index], progress);
          if (starts[index].distanceToSquared(ends[index]) > .0001) point.y += Math.sin(progress * Math.PI) * .13;
          const bounds = projectedBounds(camera, point, width, height), compact = height < 620;
          assert.ok(bounds.left >= 0 && bounds.right <= width, `${width}px player${player} die${index} frame${frame}: moving silhouette stays onscreen`);
          assert.ok(bounds.top - 22 >= (compact ? 60 : 90), 'moving result label clears the masthead');
          assert.ok(bounds.bottom + 20 <= height - (compact ? 90 : 110), 'moving held label clears the controls');
        }
      }
      assert.equal(rig.getState().transitioning, false); rig.dispose();
    }
  }
});
