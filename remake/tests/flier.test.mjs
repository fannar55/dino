// The flier (engine/flier.js): Flugeðla on chapter 4's route (chapters/kafli4-route.js) with Egill on her back. She follows the route's
// schedule to the centimetre, banks into the turns (never past 30 degrees), moves aside for a steer and comes back, and a „Hraðar!“ burst
// borrows time that she pays back before the falls. Egill sits on the top of her back between the wings and turns with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chapterWorld } from './chapter-harness.mjs';
import { updateActors } from '../engine/actor.js';
import { createFlier, rideFlier, perchedHeading, SEAT } from '../engine/flier.js';
import { createRoute, BEATS, FASTER_LAST, LEAP } from '../chapters/kafli4-route.js';
import { SIT_DEPTH } from '../engine/riding.js';

const deg = THREE.MathUtils.radToDeg;
const chapter = {
  look: 'lateMorning',
  actors: {
    flugedla: { url: '../assets/characters/pteranodon.glb' },
    egill: { url: '../assets/characters/egill.glb' },
  },
};
const world = await chapterWorld(chapter);
const flugedla = world.actors.get('flugedla');
const egill = world.actors.get('egill');
const route = createRoute();
const DT = 1 / 30;

/** Play the flight from `from` to `to` in frames, as main.js does: the flier first, then the actors. */
function fly(flier, from, to, each = () => {}) {
  for (let t = from; t <= to + 1e-9; t += DT) {
    each(t);
    flier.update(t);
    updateActors(world.actors.values(), DT);
  }
}

test('the flier follows the route and banks no more than 30 degrees', () => {
  const flier = createFlier(flugedla, route, { world });
  const hips = flugedla.model.getObjectByName('Hips');
  let most = 0;
  for (let t = 0; t <= BEATS.END; t += 0.25) {
    flier.update(t);
    flugedla.update(0.25);
    const want = route.pointAt(route.progressAt(t));
    assert.ok(flier.pose.position.distanceTo(want) < 0.05, `t=${t}: ${flier.pose.position.distanceTo(want).toFixed(3)} m off the route`);
    assert.ok(Math.abs(flier.bank) <= 30, `t=${t}: bank ${flier.bank.toFixed(1)}`);
    assert.equal(world.flightU, flier.u);
    most = Math.max(most, Math.abs(flier.bank));
    // her body is where the route says (the clip bobs her hips a little; she sits on the snag top before the leap)
    if (t > LEAP + 4) {
      flugedla.root.updateMatrixWorld(true);
      const at = hips.getWorldPosition(new THREE.Vector3());
      assert.ok(at.distanceTo(want) < 0.35, `t=${t}: her hips ${at.distanceTo(want).toFixed(2)} m from the route`);
    }
  }
  assert.ok(most > 10, `she banks into the turns (at most ${most.toFixed(1)} degrees)`);
  // before the leap she stands on the snag top, upright
  flier.update(1);
  flugedla.update(DT);
  assert.ok(Math.abs(flugedla.root.position.y - route.tree[1]) < 0.01, 'her feet on the snag top');
  assert.equal(flier.bank, 0);
  flier.stop();
});

test('a steer comes back to the line within 1.5 s and never leaves the lane', () => {
  const flier = createFlier(flugedla, route, { world });
  let widest = 0;
  fly(flier, 38, 40, t => { flier.steer(1); });
  fly(flier, 40, 42, () => { flier.steer(1); widest = Math.max(widest, Math.abs(flier.offset)); });
  assert.ok(widest <= 4 && widest > 3.5, `she moved ${widest.toFixed(2)} m aside`);
  flier.steer(0);
  fly(flier, 42, 43.5);
  assert.ok(Math.abs(flier.offset) < 0.1, `back to ${flier.offset.toFixed(3)} m after 1.5 s`);
  // she leans into her own sideways move
  flier.steer(-1);
  let leaned = 0;
  fly(flier, 44, 45, () => { leaned = Math.min(leaned, flier.bank - flier.turnBank); });
  assert.ok(leaned < -5, `she leans ${leaned.toFixed(1)} degrees into the steer`);
  // outside the lanes a steer does nothing
  flier.steer(0);
  fly(flier, 45, 47);
  flier.steer(1);
  fly(flier, 110, 112, () => flier.steer(1));
  assert.ok(Math.abs(flier.offset) < 1e-6, 'no steering up the falls');
  flier.stop();
});

test('bursts are refused in cooldown and after FASTER_LAST, and the borrowed time is back by E', () => {
  const flier = createFlier(flugedla, route, { world });
  fly(flier, 39, 40);
  assert.equal(flier.burst(), true, 'a burst at 40 s');
  fly(flier, 40 + DT, 41);
  assert.equal(flier.burst(), false, 'refused while it lasts and in the 3 s after');
  assert.ok(flier.extra > 0, 'she is ahead of the schedule');
  assert.ok(flier.speed > route.speedAt(41) * 1.4, `she flies ${flier.speed.toFixed(1)} m/s`);
  flier.stop();

  const spam = createFlier(flugedla, route, { world });
  let accepted = 0;
  let last = 0;
  let slowest = Infinity;
  fly(spam, 35, BEATS.E, t => {
    if (Math.round(t / DT) % 3 === 0 && spam.burst()) { accepted++; last = t; }
    if (t > 36) slowest = Math.min(slowest, spam.speed);
  });
  assert.ok(accepted >= 10, `${accepted} bursts`);
  assert.ok(last <= FASTER_LAST, `the last burst began at ${last.toFixed(2)} s`);
  assert.ok(slowest > 4, `never slower than ${slowest.toFixed(1)} m/s`);
  assert.ok(Math.abs(spam.u - route.progressAt(BEATS.E)) < 1e-6, `at E she is ${(spam.u - route.progressAt(BEATS.E)) * route.length} m off`);
  assert.equal(spam.extra, 0);
  fly(spam, BEATS.E + DT, FASTER_LAST + 10);
  assert.equal(spam.burst(), false, 'no burst after FASTER_LAST');
  spam.stop();
});

test('seeking puts her where the route says, steer and burst forgotten', () => {
  const flier = createFlier(flugedla, route, { world });
  fly(flier, 50, 51, () => { flier.steer(1); flier.burst(); });
  flier.update(90);
  const a = flier.pose.position.clone();
  flier.update(30);
  flier.update(90);
  assert.ok(flier.pose.position.distanceTo(a) < 1e-9);
  assert.ok(a.distanceTo(route.pointAt(route.progressAt(90))) < 1e-6);
  flier.stop();
});

test('the rider banks with her and stays on the seat', () => {
  // the tightest turn of the flight
  let tight = 0;
  let most = 0;
  const probe = createFlier(flugedla, route, { world });
  for (let t = LEAP + 4; t < BEATS.END; t += 0.5) {
    probe.update(t);
    if (Math.abs(probe.bank) > most) { most = Math.abs(probe.bank); tight = t; }
  }
  probe.stop();
  assert.ok(most > 20, `the tightest turn banks ${most.toFixed(1)} degrees`);

  const flier = createFlier(flugedla, route, { world });
  const riding = rideFlier(egill, flier);
  const spine = flugedla.model.getObjectByName('Spine');
  const seatLocal = new THREE.Vector3(...riding.seatLocal);
  const check = t => {
    world.scene.updateMatrixWorld(true);
    flugedla.root.updateMatrixWorld(true);
    egill.root.updateMatrixWorld(true);
    const seat = seatLocal.clone().applyMatrix4(spine.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(egill.root.quaternion);
    const bottom = egill.root.position.clone().addScaledVector(up, SIT_DEPTH);
    assert.ok(bottom.distanceTo(seat) < 0.05, `t=${t.toFixed(2)}: he sits ${bottom.distanceTo(seat).toFixed(3)} m from the seat`);
    // his roll is her back's roll; her back's roll is her bank give or take the clip's own sway
    const roll = q => deg(Math.asin(-new THREE.Vector3(0, 0, 1).applyQuaternion(q).y));
    const back = riding.frame(new THREE.Quaternion());
    assert.ok(Math.abs(roll(egill.root.quaternion) - roll(back)) < 1, `t=${t.toFixed(2)}: his roll ${roll(egill.root.quaternion).toFixed(1)}, her back's ${roll(back).toFixed(1)}`);
    assert.ok(Math.abs(roll(back) - flier.bank) < 14, `t=${t.toFixed(2)}: her back ${roll(back).toFixed(1)}, her bank ${flier.bank.toFixed(1)}`);
  };
  fly(flier, tight - 2, tight + 1, t => { if (t > tight - 1.5) check(t); });
  assert.equal(egill.controlled, true);
  riding.stop();
  assert.equal(egill.controlled, false);
  flier.stop();
});

test('taken on where a float left him (straight under the seat, upright), he settles into the seat with no jump', () => {
  const flier = createFlier(flugedla, route, { world });
  fly(flier, 0, 0.5); // perched, before the leap: her back is not level
  const spine = flugedla.model.getObjectByName('Spine');
  world.scene.updateMatrixWorld(true);
  const seat = new THREE.Vector3(...SEAT.local).applyMatrix4(spine.matrixWorld);
  egill.root.position.copy(seat).add(new THREE.Vector3(0, -SIT_DEPTH, 0));
  const ahead = new THREE.Vector3(1, 0, 0).applyQuaternion(flugedla.root.quaternion);
  egill.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(ahead.z, ahead.x)); // facing her way, as riding.js floatTo leaves him
  const was = { at: egill.root.position.clone(), turn: egill.root.quaternion.clone() };
  const riding = rideFlier(egill, flier, { settle: 0.4 });
  let first = null;
  fly(flier, 0.5 + DT, 1.2, t => {
    if (first === null && t > 0.5 + 1.5 * DT) first = { moved: egill.root.position.distanceTo(was.at), turned: deg(egill.root.quaternion.angleTo(was.turn)) };
  });
  assert.ok(first.moved < 0.04 && first.turned < 3, `in the first frame he moved ${first.moved.toFixed(3)} m and turned ${first.turned.toFixed(1)} degrees`);
  world.scene.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(egill.root.quaternion);
  const bottom = egill.root.position.clone().addScaledVector(up, SIT_DEPTH);
  const now = new THREE.Vector3(...SEAT.local).applyMatrix4(spine.matrixWorld);
  assert.ok(bottom.distanceTo(now) < 0.05, `and then he sits ${bottom.distanceTo(now).toFixed(3)} m from the seat`);
  riding.stop();
  flier.stop();
});

test('an actor spec scale scales the model inside the root, which stays in metres', async () => {
  const bigWorld = await chapterWorld({ look: 'lateMorning', actors: { flugedla: { url: '../assets/characters/pteranodon.glb', scale: 4 / 3 } } });
  const big = bigWorld.actors.get('flugedla');
  assert.equal(big.scale, 4 / 3);
  assert.equal(big.root.scale.x, 1);
  assert.ok(Math.abs(big.size.x - flugedla.size.x * 4 / 3) < 1e-3, `${big.size.x} vs ${flugedla.size.x}`);
  // the flier puts the larger body on the same path: her body rides higher over her feet
  const flier = createFlier(big, route, { world: bigWorld });
  flier.update(60);
  big.update(DT);
  big.root.updateMatrixWorld(true);
  const hips = big.model.getObjectByName('Hips').getWorldPosition(new THREE.Vector3());
  assert.ok(hips.distanceTo(route.pointAt(route.progressAt(60))) < 0.4, `her hips ${hips.distanceTo(route.pointAt(route.progressAt(60))).toFixed(2)} m off`);
  flier.update(1);
  big.update(DT);
  assert.ok(Math.abs(big.root.position.y - route.tree[1]) < 0.01, 'her feet on the snag top at the larger size too');
  flier.stop();
  big.dispose();
});

test('perchedHeading says which way she faces on the snag before the leap, as the flier turns her there', () => {
  const flier = createFlier(flugedla, route, { world });
  flier.update(0);
  assert.ok(Math.abs(perchedHeading(route) - flier.heading) < 1e-9, `${perchedHeading(route)} against ${flier.heading}`);
  flier.update(1);
  assert.ok(Math.abs(perchedHeading(route) - flier.heading) < 1e-9, 'and still before the leap');
  flier.stop();
  assert.equal(SEAT.bone, 'Spine', 'the seat on her back is told, for a float onto it (chapter 4, scene 5)');
});
