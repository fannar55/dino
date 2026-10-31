import test from 'node:test';
import assert from 'node:assert/strict';
import './setup.mjs';

const THREE = await import('three');
const { createBridgeAdventure } = await import('../engine/memory/bridge-adventure.js');
const { canDepart } = await import('../engine/memory/travel-traffic.js');

const SPECIES = ['triceratops', 'brontosaurus', 'stegosaurus'];

// State-machine tests use small stand-ins and the real adventure/prop logic.
// Actual animated body/tail and surface clearance is checked by the convoy
// browser gate; an empty model here does not establish physical clearance.
function fixture({ plan, skinned = false } = {}) {
  const scene = new THREE.Scene();
  const nests = SPECIES.map((species, i) => {
    const root = new THREE.Group();
    root.position.set(-4 + i * 4, 0, 5);
    return { species, root, restOffsets: [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)], restYaw: 0 };
  });
  const pairs = Object.fromEntries(SPECIES.map((species, i) => [species, [0, 1].map(member => {
    const root = new THREE.Group(), model = new THREE.Group();
    root.add(model); scene.add(root);
    root.position.copy(nests[i].root.position).add(nests[i].restOffsets[member]);
    const actor = {
      species, member, root, model, walking: false,
      noseLocal: new THREE.Vector3(1, .8, 0), supportLocal: new THREE.Vector3(.9, 1, 0),
      walk(value) { this.walking = value; }, setMotion() {},
      getNosePosition() { return root.localToWorld(this.noseLocal.clone()); },
      getSupportPosition() { return root.localToWorld(this.supportLocal.clone()); },
    };
    return actor;
  })]));
  let time = 0, adventure;
  const calls = [];
  adventure = createBridgeAdventure({
    scene, heightAt: () => 0, nests,
    planWalk(actor, end, options) {
      const context = { actor, end, options, action: adventure.getDebug().action, pairs, time };
      calls.push(context);
      return plan ? plan(context) : [actor.root.position.clone(), end.clone()];
    },
  });
  for (const species of SPECIES) adventure.bindPair(species, pairs[species]);
  const actors = SPECIES.flatMap(species => pairs[species]);
  const resources = skinned ? actors.map(actor => attachSkinnedBox(actor)) : [];
  function tick(dt = .025) { time += dt; adventure.update(dt, time); adventure.afterActors(dt); }
  function until(predicate, label, seconds = 120) {
    for (let i = 0; i < seconds / .025 && !predicate(); i++) tick();
    assert.ok(predicate(), label);
  }
  function start(id, selected = null) {
    adventure.setState({ selected, unlocked: SPECIES });
    assert.equal(adventure.start(id), true, `${id} starts`);
  }
  function finish() { until(() => !adventure.isBusy(), 'action finishes'); }
  function build() {
    start('lift', 'brontosaurus'); finish();
    start('roll', 'triceratops'); finish();
    assert.equal(adventure.getDebug().bridge.built, true);
    adventure.pollEvents();
  }
  return { adventure, actors, pairs, calls, tick, until, start, finish, build, dispose() { adventure.dispose(); resources.forEach(dispose => dispose()); } };
}

const moving = debug => debug.routes.filter(route => route.started && !route.finished);

test('the second helper departs during the first approach and both clocks freeze while paused', () => {
  const f = fixture();
  try {
    f.start('lift', 'brontosaurus');
    f.until(() => moving(f.adventure.getDebug()).length === 2, 'both helpers walk at once');
    const before = f.adventure.getDebug();
    assert.equal(before.action.phase, 'approach');
    assert.equal(before.routes.some(route => route.finished), false, 'overlap starts before either arrival');
    assert.equal(f.pairs.brontosaurus.every(actor => actor.walking), true);
    const positions = f.actors.map(actor => actor.root.position.toArray());
    for (let i = 0; i < 30; i++) f.tick(0);
    assert.deepEqual(f.adventure.getDebug(), before, 'all route and phase clocks stay frozen');
    assert.deepEqual(f.actors.map(actor => actor.root.position.toArray()), positions);
    f.finish();
    assert.equal(f.adventure.getDebug().branch.held, true);
  } finally { f.adventure.dispose(); }
});

test('planning a follower never freezes an already walking helper', () => {
  let followerCalls = 0;
  const f = fixture({ plan: ({ actor, end, action }) => {
    if (action.id === 'lift' && action.phase === 'approach' && actor.member === 1 && ++followerCalls < 30) return undefined;
    return [actor.root.position.clone(), end.clone()];
  } });
  try {
    f.start('lift', 'brontosaurus');
    f.until(() => followerCalls > 0, 'follower planning starts');
    const lead = f.pairs.brontosaurus[0], from = lead.root.position.clone();
    for (let i = 0; i < 15; i++) f.tick();
    assert.ok(followerCalls > 1 && followerCalls < 30, 'follower route is still pending');
    assert.ok(lead.root.position.distanceTo(from) > .5, 'leader progresses during pending planning');
    assert.equal(lead.walking, true);
    f.finish();
    assert.equal(f.adventure.getDebug().branch.held, true);
  } finally { f.adventure.dispose(); }
});

for (const id of ['cross', 'finish']) test(`${id} is a convoy and completes only when all six helpers arrive`, () => {
  const f = fixture();
  try {
    f.build();
    if (id === 'finish') {
      f.start('cross'); f.finish();
      f.start('lay', 'stegosaurus'); f.finish();
    }
    f.adventure.pollEvents(); f.start(id);
    let maxActive = 0, sawPartial = false, startsBeforeFirstArrival = 0;
    for (let i = 0; i < 6000 && f.adventure.isBusy(); i++) {
      f.tick();
      const debug = f.adventure.getDebug();
      maxActive = Math.max(maxActive, moving(debug).length);
      if (debug.action && !debug.routes.some(route => route.finished)) startsBeforeFirstArrival = Math.max(startsBeforeFirstArrival, debug.routes.filter(route => route.started).length);
      if (debug.action?.crossed.length > 0 && debug.action.crossed.length < 6) {
        sawPartial = true;
        assert.equal(id === 'cross' ? debug.staging.arrived : debug.grove.visited, false, 'first arrival cannot finish the whole action');
      }
    }
    assert.equal(f.adventure.isBusy(), false);
    assert.ok(maxActive >= 2, `more than one helper actually moves together (${maxActive})`);
    assert.ok(startsBeforeFirstArrival >= 2, 'followers depart before the leader reaches its destination');
    assert.equal(sawPartial, true, 'arrivals are recorded individually');
    const debug = f.adventure.getDebug();
    assert.equal(id === 'cross' ? debug.staging.arrived : debug.grove.visited, true);
    assert.equal(f.adventure.pollEvents().filter(event => event.type === 'bridge-complete' && event.id === id).length, 1);
    assert.equal(f.actors.some(actor => actor.walking), false);
  } finally { f.adventure.dispose(); }
});

test('a failed follower route drains moving crossers safely and retry keeps arrived helpers on the far bank', () => {
  let reject = true;
  const f = fixture({ plan: ({ actor, end, action }) => {
    if (reject && action.id === 'cross' && actor.species === 'triceratops' && actor.member === 1) return null;
    return [actor.root.position.clone(), end.clone()];
  } });
  try {
    f.build(); f.start('cross');
    f.until(() => f.calls.some(call => call.action.id === 'cross' && call.actor === f.pairs.triceratops[1]), 'second crosser route is rejected');
    assert.equal(f.adventure.isBusy(), true, 'rejection waits for the committed crossing to reach dry ground');
    assert.ok(f.pairs.triceratops[0].root.position.z > -10, 'first helper has not arrived at rejection time');
    f.finish();
    const arrived = f.pairs.triceratops[0], farPosition = arrived.root.position.toArray();
    assert.ok(farPosition[2] < -10, 'moving helper finishes its committed crossing');
    assert.equal(f.adventure.getDebug().staging.arrived, false);
    assert.equal(f.adventure.pollEvents().filter(event => event.type === 'bridge-blocked' && event.id === 'cross').length, 1);
    const plansBefore = f.calls.filter(call => call.action.id === 'cross' && call.actor === arrived).length;
    reject = false; f.start('cross');
    for (let i = 0; i < 6000 && f.adventure.isBusy(); i++) {
      f.tick();
      assert.deepEqual(arrived.root.position.toArray(), farPosition, 'retry does not move an arrived helper backwards');
    }
    assert.equal(f.adventure.isBusy(), false);
    assert.equal(f.adventure.getDebug().staging.arrived, true);
    assert.equal(f.calls.filter(call => call.action.id === 'cross' && call.actor === arrived).length, plansBefore);
  } finally { f.adventure.dispose(); }
});

test('reset cancels every overlapping route without a late arrival or reward', () => {
  const f = fixture();
  try {
    f.build(); f.start('cross');
    f.until(() => moving(f.adventure.getDebug()).length >= 2, 'crossing has overlapping walkers');
    f.adventure.reset();
    const positions = f.actors.map(actor => actor.root.position.toArray());
    for (let i = 0; i < 1000; i++) f.tick();
    assert.deepEqual(f.actors.map(actor => actor.root.position.toArray()), positions);
    assert.equal(f.adventure.isBusy(), false);
    assert.deepEqual(f.adventure.getDebug().routes, []);
    assert.equal(f.adventure.getDebug().stage, 'waiting');
    assert.deepEqual(f.adventure.pollEvents(), []);
  } finally { f.adventure.dispose(); }
});

function attachSkinnedBox(actor) {
  const { model } = actor, bone = new THREE.Bone();
  bone.name = 'Body'; model.add(bone);
  const geometry = new THREE.BoxGeometry(.8, .4, .4, 10, 2, 2), count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const material = new THREE.MeshBasicMaterial(), mesh = new THREE.SkinnedMesh(geometry, material);
  model.add(mesh); mesh.bind(new THREE.Skeleton([bone]));
  return () => { geometry.dispose(); material.dispose(); };
}

function skinnedBoxActor() {
  const root = new THREE.Group(), model = new THREE.Group(); root.add(model);
  const actor = { root, model, species: 'test' };
  actor.dispose = attachSkinnedBox(actor);
  return actor;
}

function lineTravel(actor, from, to, age = 0) {
  const points = [new THREE.Vector3(...from), new THREE.Vector3(...to)], total = points[0].distanceTo(points[1]);
  const duration = total / 2 + .3, yaw = -Math.atan2(to[2] - from[2], to[0] - from[0]);
  actor.root.position.lerpVectors(points[0], points[1], Math.min(1, age / (duration - .3)));
  actor.root.rotation.y = yaw;
  return { actor, route: { points, lengths: [0, total], total }, duration, finalYaw: yaw, age };
}

test('a crossing lane is reserved in time rather than locked for the whole route', () => {
  const follower = skinnedBoxActor(), leader = skinnedBoxActor();
  try {
    const candidate = lineTravel(follower, [0, 0, 0], [6, 0, 0]);
    const conflicting = lineTravel(leader, [3, 0, -3], [3, 0, 3]);
    assert.equal(canDepart(candidate, [conflicting]), false, 'simultaneous intersection is unsafe');
    const cleared = lineTravel(leader, [3, 0, -3], [3, 0, 3], 1.8);
    assert.ok(cleared.age < cleared.duration, 'leader is still traveling');
    assert.equal(canDepart(candidate, [cleared]), true, 'follower can start once the intersection is temporally clear');
  } finally { follower.dispose(); leader.dispose(); }
});

test('a leader parked at a shared destination remains a solid reservation', () => {
  const follower = skinnedBoxActor(), leader = skinnedBoxActor();
  try {
    const candidate = lineTravel(follower, [0, 0, 0], [6, 0, 0]);
    const parked = lineTravel(leader, [6, 0, -3], [6, 0, 0], 1.8);
    assert.equal(canDepart(candidate, [parked]), false, 'finishing a route cannot erase its parked body');
  } finally { follower.dispose(); leader.dispose(); }
});

test('the walk to the grove is authored and on a timetable: it never asks the near-bank planner and every friend arrives, whatever their size', () => {
  const f = fixture({ skinned: true, plan: ({ actor, end, action }) => {
    assert.ok(end?.isVector3, `${action.id}/${action.phase} must provide a real destination`);
    assert.notEqual(action.id, 'finish', 'the marsh route is authored entirely on the far bank');
    return [actor.root.position.clone(), end.clone()];
  } });
  try {
    f.build(); f.start('cross'); f.finish(); f.start('lay', 'stegosaurus'); f.finish();
    // The walk keeps to its timetable (Mosi's lead, the rows two abreast) and does not wait for headway, so even
    // a friend far too big for her place cannot hold it up: all six arrive, once.
    f.pairs.brontosaurus.forEach(actor => actor.root.scale.setScalar(10));
    f.adventure.pollEvents(); f.start('finish', null); f.finish();
    const debug = f.adventure.getDebug(), events = f.adventure.pollEvents();
    assert.equal(debug.grove.visited, true);
    assert.equal(events.filter(event => event.type === 'bridge-blocked').length, 0);
    assert.equal(events.filter(event => event.type === 'final-arrival').length, 1);
    assert.equal(events.filter(event => event.type === 'bridge-complete' && event.id === 'finish').length, 1);
  } finally { f.dispose(); }
});

test('reduced-motion crossing still overlaps, pauses exactly, and waits for all arrivals', () => {
  const f = fixture();
  try {
    f.adventure.setReducedMotion(true); f.build(); f.start('cross');
    f.until(() => moving(f.adventure.getDebug()).length >= 2, 'reduced-motion followers overlap');
    const before = f.adventure.getDebug();
    for (let i = 0; i < 20; i++) f.tick(0);
    assert.deepEqual(f.adventure.getDebug(), before);
    assert.equal(before.staging.arrived, false);
    f.finish();
    assert.equal(f.adventure.getDebug().staging.arrived, true);
    assert.equal(f.actors.some(actor => actor.walking), false);
  } finally { f.dispose(); }
});
