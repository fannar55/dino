import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacter, emptyWorld } from './characters.mjs';
import { createMosiOpponent } from '../engine/yatzy-mosi/opponent.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
async function harness(options = {}) {
  const world = emptyWorld();
  world.camera.position.set(0, 5.2, 6.7); world.camera.lookAt(0, 2.05, -.45); world.camera.updateMatrixWorld(true);
  const opponent = await createMosiOpponent(world, { ...options, gltf: await loadCharacter('mosi') });
  let time = 0;
  const tick = (state = {}, dt = 1 / 60) => opponent.update(dt, time += dt, state);
  const transforms = () => {
    const values = [];
    opponent.group.traverse(node => values.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()));
    return values;
  };
  return { world, opponent, tick, transforms };
}

test('the real remake Mosi is seated in the shared scene with both paws on the table', async () => {
  const h = await harness();
  try {
    const state = h.opponent.getDebugState();
    assert.equal(state.bones, 19); assert.equal(state.triangles, 25222);
    assert.deepEqual(state.clips, ['idle', 'walk']); assert.equal(state.controlled, true);
    assert.equal(h.opponent.group.parent, h.world.scene);
    assert.equal(h.world.actors.get('mosi-yatzy'), h.opponent.actor);
    assert.ok(h.opponent.actor.eyelids, 'the actual baked face must retain its eyelids');
    assert.ok(state.head[1] > 2.2 && state.head[1] < 2.7);
    const projected = new THREE.Vector3(...state.head).project(h.world.camera);
    assert.ok(projected.y > .2 && projected.y < .5, 'Mosi should occupy the upper part of the table view');
    for (const paw of state.paws) {
      assert.ok(paw[1] > 1.48 && paw[1] < 1.53, 'ankle leaves the actual sole on the felt');
      assert.ok(paw[2] > -1.9 && paw[2] < -1.3, 'paws should be visible inside the far rim');
    }
  } finally { h.opponent.dispose(); }
});

test('thinking, looking and happiness leave the seat and resting paws anchored', async () => {
  const h = await harness();
  try {
    const first = h.opponent.getDebugState();
    let maximumTilt = 0, maximumJaw = 0;
    for (let frame = 0; frame < 360; frame++) {
      if (frame === 90) h.opponent.react('happy');
      h.tick({ thinking: frame < 90, target: { x: frame < 180 ? 2 : -2, y: 1.55, z: .5 } });
      const state = h.opponent.getDebugState();
      maximumTilt = Math.max(maximumTilt, Math.abs(state.tilt)); maximumJaw = Math.max(maximumJaw, state.jawOpen);
      assert.deepEqual(state.position, first.position);
      state.paws.forEach((point, index) => point.forEach((value, axis) => near(value, first.paws[index][axis])));
      assert.ok(h.transforms().every(Number.isFinite));
    }
    assert.ok(maximumTilt > .06 && maximumJaw > .05);
    assert.equal(h.opponent.getDebugState().reaction, null, 'a reaction should finish without another controller call');
  } finally { h.opponent.dispose(); }
});

test('Mosi watches the autonomous cup with both paws planted and unchanged foreleg lengths', async () => {
  const h = await harness();
  try {
    const first = h.opponent.getDebugState();
    const limbs = ['L', 'R'].map(side => {
      const leg = h.opponent.actor.model.getObjectByName('FrontLeg' + side), foot = h.opponent.actor.model.getObjectByName('FrontFoot' + side);
      const shoulder = leg.getWorldPosition(new THREE.Vector3()), point = foot.getWorldPosition(new THREE.Vector3());
      return { leg, foot, shoulder, length: shoulder.distanceTo(point), localLength: foot.position.length() };
    });
    const target = new THREE.Vector3(), actual = new THREE.Vector3();
    h.opponent.react('anticipate'); let maximumTilt = 0;
    for (let frame = 0; frame < 240; frame++) {
      target.set(Math.sin(frame / 45) * 1.8, 1.8 + Math.sin(frame / 70) * .5, -.4);
      h.tick({ rolling: true, target });
      const state = h.opponent.getDebugState();
      assert.deepEqual(state.position, first.position); assert.equal(state.watch.rolling, true);
      assert.deepEqual(state.watch.target, target.toArray());
      maximumTilt = Math.max(maximumTilt, Math.abs(state.watch.tilt));
      assert.ok(Math.abs(state.watch.tilt) <= THREE.MathUtils.degToRad(1.4));
      state.paws.forEach((point, index) => point.forEach((value, axis) => near(value, first.paws[index][axis])));
      limbs.forEach(limb => {
        near(limb.foot.getWorldPosition(actual).distanceTo(limb.shoulder), limb.length);
        near(limb.foot.position.length(), limb.localLength);
      });
      assert.ok(h.transforms().every(Number.isFinite));
    }
    assert.ok(maximumTilt > .015, 'watching a moving cup should add a small visible response');
    for (let frame = 0; frame < 180; frame++) h.tick();
    const rest = h.opponent.getDebugState();
    assert.equal(rest.watch.rolling, false); near(rest.watch.tilt, 0, 1e-6); near(rest.watch.nod, 0, 1e-6);
    assert.deepEqual(rest.watch.target, h.world.camera.position.toArray());
  } finally { h.opponent.dispose(); }
});

test('gaze follows left and right cup targets smoothly without a legacy reach, and a finished throw releases celebration taps immediately', async () => {
  const h = await harness();
  try {
    const first = h.opponent.getDebugState(), head = h.opponent.actor.model.getObjectByName('Head');
    const target = new THREE.Vector3(-3, 1.9, -.5);
    for (let frame = 0; frame < 120; frame++) h.tick({ rolling: true, target });
    const left = head.getWorldQuaternion(new THREE.Quaternion());
    target.x = 3;
    h.tick({ rolling: true, target, handTarget: { x: -100, y: 100, z: 100 } });
    const firstRight = head.getWorldQuaternion(new THREE.Quaternion());
    assert.ok(left.angleTo(firstRight) < .08, 'a new cup target must not snap the gaze across the table');
    for (let frame = 0; frame < 120; frame++) h.tick({ rolling: true, target });
    assert.ok(left.angleTo(head.getWorldQuaternion(new THREE.Quaternion())) > .15);
    h.opponent.getDebugState().paws.forEach((point, index) => point.forEach((value, axis) => near(value, first.paws[index][axis])));
    h.opponent.react('great');
    for (let frame = 0; frame < 36; frame++) h.tick({ rolling: true, target });
    near(h.opponent.getDebugState().expression.pawL, 0);
    h.tick({ rolling: false });
    assert.ok(h.opponent.getDebugState().expression.pawL > .04, 'the old rolling blend must not suppress a useful result reaction');
    h.opponent.reset();
    assert.equal(h.opponent.getDebugState().watch.rolling, false);
    near(h.opponent.getDebugState().watch.tilt, 0);
  } finally { h.opponent.dispose(); }
});

test('zero-dt pause freezes the complete pose and reset cancels seated gestures', async () => {
  const h = await harness();
  try {
    h.opponent.react('win');
    for (let frame = 0; frame < 30; frame++) h.tick({ rolling: true, thinking: true });
    const before = h.transforms(), state = h.opponent.getDebugState();
    for (let frame = 0; frame < 90; frame++) h.tick({ target: { x: 10, y: -5, z: 0 } }, 0);
    assert.deepEqual(h.transforms(), before); assert.deepEqual(h.opponent.getDebugState(), state);
    h.opponent.reset();
    const reset = h.opponent.getDebugState();
    assert.equal(reset.time, 0); assert.equal(reset.reaction, null);
    near(reset.rolling, 0); near(reset.thinking, 0); near(reset.jawOpen, 0);
    reset.paws.forEach(paw => assert.ok(paw[1] > 1.48 && paw[1] < 1.53));
    for (let frame = 0; frame < 180; frame++) h.tick();
    assert.equal(h.opponent.getDebugState().reaction, null);
  } finally { h.opponent.dispose(); }
});

test('reduced motion ends decorative gestures while keeping gaze and planted forelegs', async () => {
  const h = await harness();
  try {
    h.opponent.react('win'); for (let frame = 0; frame < 20; frame++) h.tick();
    for (let frame = 0; frame < 120; frame++) h.tick({ reducedMotion: true, thinking: true, rolling: true });
    const state = h.opponent.getDebugState();
    assert.equal(state.reaction, null); near(state.nod, 0); near(state.tilt, 0); near(state.jawOpen, 0);
    assert.equal(h.opponent.react('win'), false);
    state.paws.forEach(point => assert.ok(point[1] > 1.48 && point[1] < 1.53));
    near(state.watch.tilt, 0); near(state.watch.nod, 0);
    assert.equal(state.watch.rolling, true, 'calm mode still follows the autonomous throw');
    const idle = h.opponent.actor.mixer.existingAction(h.opponent.actor.clips.get('idle'));
    near(idle.getEffectiveTimeScale(), 0);
    for (let frame = 0; frame < 120; frame++) h.tick();
    assert.equal(h.opponent.getDebugState().reaction, null);
    assert.ok(idle.getEffectiveTimeScale() > 0);
  } finally { h.opponent.dispose(); }
});

test('good, bad, near, anticipation and great rolls have distinct readable gesture sequences', async () => {
  const h = await harness();
  try {
    const peaks = {};
    for (const kind of ['anticipate', 'good', 'bad', 'near', 'great', 'win']) {
      h.opponent.reset(); assert.equal(h.opponent.react(kind), true);
      const peak = peaks[kind] = { up: 0, down: 0, tilt: 0, yaw: 0, jaw: 0, lid: 0, left: 0, right: 0 };
      for (let frame = 0; frame < 240; frame++) {
        h.tick(); const g = h.opponent.getDebugState().expression;
        peak.up = Math.max(peak.up, g.nod); peak.down = Math.min(peak.down, g.nod);
        peak.tilt = Math.max(peak.tilt, Math.abs(g.tilt)); peak.yaw = Math.max(peak.yaw, Math.abs(g.yaw));
        peak.jaw = Math.max(peak.jaw, g.jaw); peak.lid = Math.max(peak.lid, g.lid);
        peak.left = Math.max(peak.left, g.pawL); peak.right = Math.max(peak.right, g.pawR);
      }
      assert.equal(h.opponent.getDebugState().reaction, null);
      assert.ok(Object.values(h.opponent.getDebugState().expression).every(value => value === 0), 'each reaction must fully settle');
    }
    assert.ok(peaks.good.down < -.08 && peaks.good.up > .06 && peaks.good.jaw > .075, 'a good roll gets a visible double nod and smile');
    assert.ok(peaks.bad.down < -.13 && peaks.bad.lid > .23 && peaks.bad.up > .03, 'a poor roll slumps, softens the eyes, then recovers');
    assert.ok(peaks.near.yaw > .11 && peaks.near.tilt > .13, 'a near miss gets a curious sideways look');
    assert.ok(peaks.anticipate.down < -.08 && peaks.anticipate.jaw < .03 && peaks.anticipate.left === 0, 'anticipation is a focused inhale, not a celebration');
    assert.ok(peaks.great.up > .15 && peaks.great.left > .095 && peaks.great.right > .12, 'a great roll gets an upright head and alternating paw taps');
    assert.ok(peaks.win.jaw <= THREE.MathUtils.degToRad(7), 'the original cut beak must remain within its authored opening');
  } finally { h.opponent.dispose(); }
});

test('celebration taps preserve foreleg length and tabletop clearance, and watching a cast keeps paws planted without suppressing expressions', async () => {
  const h = await harness();
  try {
    const first = h.opponent.getDebugState();
    const limbs = ['L', 'R'].map(side => {
      const leg = h.opponent.actor.model.getObjectByName(`FrontLeg${side}`), foot = h.opponent.actor.model.getObjectByName(`FrontFoot${side}`);
      const shoulder = leg.getWorldPosition(new THREE.Vector3()), point = foot.getWorldPosition(new THREE.Vector3());
      return { leg, foot, shoulder, length: shoulder.distanceTo(point), level: foot.getWorldQuaternion(new THREE.Quaternion()) };
    });
    const point = new THREE.Vector3(), orientation = new THREE.Quaternion();
    h.opponent.react('great'); let raised = false;
    for (let frame = 0; frame < 180; frame++) {
      h.tick();
      limbs.forEach((limb, index) => {
        limb.foot.getWorldPosition(point); limb.foot.getWorldQuaternion(orientation);
        near(point.distanceTo(limb.shoulder), limb.length);
        assert.ok(point.y >= first.paws[index][1] - 1e-8, 'a tap may rise above the felt but never push the foot through it');
        near(Math.abs(orientation.dot(limb.level)), 1);
        raised ||= point.y > first.paws[index][1] + .09;
      });
      assert.deepEqual(h.opponent.getDebugState().position, first.position);
    }
    assert.ok(raised);
    const target = new THREE.Vector3(-1, 2, -.5);
    for (const kind of ['good', 'bad', 'great', 'win']) {
      h.opponent.react(kind);
      for (let frame = 0; frame < 100; frame++) {
        h.tick({ rolling: true, target });
        const state = h.opponent.getDebugState();
        assert.equal(state.watch.rolling, true);
        near(state.expression.pawL, 0); near(state.expression.pawR, 0);
        state.paws.forEach((paw, index) => paw.forEach((value, axis) => near(value, first.paws[index][axis])));
        limbs.forEach(limb => near(limb.leg.getWorldPosition(point).distanceTo(limb.shoulder), 0));
      }
    }
  } finally { h.opponent.dispose(); }
});

test('reaction interruptions blend continuously, and calm mode clears body, eye and paw gestures', async () => {
  const h = await harness();
  try {
    h.opponent.react('bad'); for (let frame = 0; frame < 45; frame++) h.tick();
    const before = h.opponent.getDebugState().expression;
    assert.ok(before.lid > .15);
    h.opponent.react('great'); h.tick();
    const after = h.opponent.getDebugState().expression;
    assert.ok(Math.abs(after.nod - before.nod) < .01, 'a new result must not snap the head to neutral');
    assert.equal(h.opponent.react('great'), false, 'a duplicate immediate cue must not keep restarting a gesture');
    h.tick({ reducedMotion: true });
    const calm = h.opponent.getDebugState();
    assert.equal(calm.reaction, null);
    assert.ok(Object.values(calm.expression).every(value => value === 0));
    near(h.opponent.actor.eyelids.blink.level, 0);
    assert.equal(h.opponent.react('bad'), false);
    h.tick(); h.opponent.react('near'); h.tick();
    h.opponent.reset();
    assert.ok(Object.values(h.opponent.getDebugState().expression).every(value => value === 0));
  } finally { h.opponent.dispose(); }
});

test('actual seated skin remains finite and bounded across gestures and resets', async () => {
  const h = await harness();
  try {
    const skins = []; h.opponent.group.traverse(node => { if (node.isSkinnedMesh) skins.push(node); });
    const vertex = new THREE.Vector3(); let checked = 0;
    for (let frame = 0; frame < 240; frame++) {
      if (frame === 45) h.opponent.react('win');
      if (frame === 150) h.opponent.reset();
      h.tick({ thinking: frame < 45, rolling: frame > 100 && frame < 150, target: { x: frame < 120 ? 100 : -100, y: 1.55, z: .5 } });
      if (frame % 20) continue;
      for (const skin of skins) {
        skin.skeleton.update();
        for (let i = 0; i < skin.geometry.attributes.position.count; i++) {
          skin.getVertexPosition(i, vertex).applyMatrix4(skin.matrixWorld);
          assert.ok(vertex.toArray().every(Number.isFinite));
          assert.ok(Math.abs(vertex.x) < 1.5 && vertex.y > -.1 && vertex.y < 4 && vertex.z > -6 && vertex.z < -.5, 'seating or additive animation must not explode the skin');
          checked++;
        }
      }
    }
    assert.ok(checked > 100000);
  } finally { h.opponent.dispose(); }
});

test('bad optional inputs remain finite and disposal is idempotent without destroying shared source geometry', async () => {
  const h = await harness();
  let disposedGeometry = 0;
  h.opponent.actor.model.traverse(node => { if (node.isSkinnedMesh && !node.name.includes('eyelids')) node.geometry.addEventListener('dispose', () => disposedGeometry++); });
  h.tick({ target: { x: NaN, y: Infinity, z: 0 } }); h.tick({}, NaN);
  assert.ok(h.transforms().every(Number.isFinite));
  h.opponent.dispose(); h.opponent.dispose();
  assert.equal(h.opponent.group.parent, null); assert.equal(h.world.actors.has('mosi-yatzy'), false);
  assert.equal(disposedGeometry, 0);
  const state = h.opponent.getDebugState(); h.opponent.update(1, 999, { rolling: true }); h.opponent.reset();
  assert.deepEqual(h.opponent.getDebugState(), state); assert.equal(h.opponent.react(), false);
});
