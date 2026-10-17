import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocations } from '../engine/locations.js';
import { createScene } from '../engine/scene/scene.js';
import { planForest } from '../world/forest/plan.js';
import { createTerrain } from '../world/forest/terrain.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { PRESETS } from '../engine/quality.js';

// What the locations module needs of a forest: a group to show or hide, and the ground height.
const fakeForest = height => ({ group: { visible: true }, heightAt: () => height });

/**
 * Two places, a and b, over fake forests. `built` collects the layouts build() was called with;
 * `before(layout)` runs inside build(), so a test can hold a build up or make it fail.
 */
function twoPlaces({ before = () => {} } = {}) {
  const a = fakeForest(1);
  const b = fakeForest(2);
  const world = {};
  const built = [];
  const locations = createLocations({
    world,
    locations: {
      a: { layout: { id: 'a', seed: 1 }, shots: { one: { position: [0, 2, 8] } } },
      b: { layout: { id: 'b', seed: 2 }, shots: {} },
    },
    build: async layout => {
      built.push(layout);
      await before(layout);
      return layout.id === 'a' ? a : b;
    },
  });
  return { a, b, world, built, locations };
}

test('switches heightAt and visibility', async () => {
  const { a, b, world, locations } = twoPlaces();
  await locations.setLocation('a');
  assert.equal(world.heightAt(0, 0), 1);
  assert.equal(world.forest, a);
  assert.equal(world.location, 'a');
  await locations.setLocation('b');
  assert.equal(world.heightAt(0, 0), 2);
  assert.equal(a.group.visible, false);
  assert.equal(b.group.visible, true);
  assert.equal(world.forest, b);
  assert.equal(world.location, 'b');
  assert.equal(locations.current, 'b');
  assert.deepEqual(locations.names, ['a', 'b']);
  await locations.setLocation('a');
  assert.equal(world.heightAt(0, 0), 1);
  assert.equal(a.group.visible, true);
  assert.equal(b.group.visible, false);
});

test('builds each location once', async () => {
  const { locations, built } = twoPlaces();
  for (const name of ['a', 'b', 'a', 'b']) await locations.setLocation(name);
  assert.equal(built.length, 2);
});

test('two requests for a location that is still building share the one build', async () => {
  let open;
  const gate = new Promise(resolve => { open = resolve; });
  const { world, locations, built } = twoPlaces({ before: () => gate });
  const first = locations.setLocation('a');
  const second = locations.setLocation('a');
  open();
  await Promise.all([first, second]);
  assert.equal(built.length, 1);
  assert.equal(world.location, 'a');
});

test('builds a location from its layout, carrying its own shots as layout.shots', async () => {
  const { locations, built } = twoPlaces();
  await locations.setLocation('a');
  await locations.setLocation('b');
  assert.equal(built[0].id, 'a');
  assert.equal(built[0].seed, 1);
  assert.deepEqual(built[0].shots, { one: { position: [0, 2, 8] } });
  assert.deepEqual(built[1].shots, {});
});

test('an unknown location is refused and the current one stays in view', async () => {
  const { a, world, locations } = twoPlaces();
  await locations.setLocation('a');
  await assert.rejects(locations.setLocation('nowhere'), /nowhere/);
  assert.equal(a.group.visible, true);
  assert.equal(world.location, 'a');
  assert.equal(locations.current, 'a');
});

test('a build that fails leaves the old location in view and may be tried again', async () => {
  let broken = true;
  const { a, b, world, locations, built } = twoPlaces({
    before: layout => { if (layout.id === 'b' && broken) throw new Error('out of memory'); },
  });
  await locations.setLocation('a');
  await assert.rejects(locations.setLocation('b'), /out of memory/);
  assert.equal(a.group.visible, true);
  assert.equal(world.location, 'a');
  broken = false;
  await locations.setLocation('b');
  assert.equal(world.location, 'b');
  assert.equal(b.group.visible, true);
  assert.equal(built.filter(layout => layout.id === 'b').length, 2);
});

// A stage UI that remembers every fade level it was given.
function fakeUi() {
  const ui = { fadeLevel: 0, levels: [], setFade(level) { ui.fadeLevel = level; ui.levels.push(level); } };
  return ui;
}

/** Step the scene by `count` frames, letting settled promises reach the scheduler after each. */
async function frames(scheduler, count, dt = 0.1) {
  for (let i = 0; i < count; i++) {
    scheduler.update(dt);
    await new Promise(resolve => setImmediate(resolve));
  }
}

test('goTo fades out, switches, fades in', async () => {
  const ui = fakeUi();
  const building = [];
  let open;
  const gate = new Promise(resolve => { open = resolve; });
  const { world, locations } = twoPlaces({
    before: layout => {
      if (layout.id !== 'b') return undefined;
      building.push({ fade: ui.fadeLevel, location: world.location });
      return gate; // the build of b takes as long as the test wants
    },
  });
  await locations.setLocation('a');
  const { s, scheduler } = createScene({ world, director: {}, ui, voice: {}, locations });
  let arrived = false;
  scheduler.run((function* script() {
    yield s.goTo('b', { fade: 1 });
    arrived = true;
  })());

  await frames(scheduler, 20); // a second of fading to black, then the build starts and holds
  assert.deepEqual(building, [{ fade: 1, location: 'a' }], 'the screen is black before the switch begins');
  const out = ui.levels.slice();
  await frames(scheduler, 10);
  assert.equal(ui.levels.length, out.length, 'nothing moves while the forest builds');
  assert.equal(ui.fadeLevel, 1);
  assert.equal(scheduler.pending, 1, 'a seek waits for the build through the scheduler');
  assert.equal(world.location, 'a');
  assert.equal(arrived, false);

  open();
  await frames(scheduler, 20); // the switch resolves, the fade comes back in
  assert.equal(world.location, 'b');
  assert.equal(ui.fadeLevel, 0);
  assert.equal(scheduler.pending, 0);
  assert.ok(arrived && scheduler.idle, 'the script went on after the fade');
  const back = ui.levels.slice(out.length);
  assert.ok(out.every((v, i) => i === 0 || v >= out[i - 1]) && out.at(-1) === 1, 'fades out to black');
  assert.ok(back.every((v, i) => i === 0 || v <= back[i - 1]) && back.at(-1) === 0, 'fades back in to clear');
});

test('goTo says so when the scene was given no locations', () => {
  const { s } = createScene({ world: {}, director: {}, ui: fakeUi(), voice: {} });
  assert.throws(() => s.goTo('b'), /locations/);
});

// The planner keeps the shots clear that the layout carries (a chapter location sets its own) and,
// without any, the chapter's.
test('the planner keeps a location\'s own shots clear, and the chapter\'s only without them', () => {
  const layout = { seed: 7, clearing: { center: [0, 0], radius: 8 }, forestEdge: 12, path: [[-40, 0], [40, 0]] };
  const shot = position => ({ position, target: [0, 1.2, 0], fov: 40 });
  const library = createSpeciesLibrary(layout.seed); // builds its models on first use: share it
  const plan = shots => {
    const world = { chapter: { shots: { review: shot([20, 1.6, 14]) } } };
    return planForest({
      world, layout: shots ? { ...layout, shots } : layout, seed: layout.seed,
      terrain: createTerrain(world, layout, layout.seed), library, q: PRESETS.low,
    });
  };
  const names = result => [...new Set(result.shots.map(s => s.name))];
  assert.deepEqual(names(plan()), ['review'], 'without layout.shots the chapter\'s shots are kept clear, as before');
  assert.deepEqual(names(plan({ glade: shot([-14, 1.6, 9]) })), ['glade']);
  assert.deepEqual(names(plan({})), [], 'a location without shots keeps none clear');

  // They really are kept clear: a tree stands where this camera would be, unless a shot is set there.
  const open = plan({});
  const tree = open.placements.find(p => p.name === 'broadleaf');
  const camera = [tree.x + 1, 1.6, tree.z];
  const crowding = result => result.placements.filter(p => (p.name === 'broadleaf' || p.name === 'araucaria')
    && Math.hypot(p.x - camera[0], p.z - camera[2]) < 1.5);
  assert.ok(crowding(open).length > 0, 'the check can fail: with no shot a tree stands there');
  assert.equal(crowding(plan({ close: shot(camera) })).length, 0);
});

// ---------------------------------------------------------------------------------------------
// The chapter's places as main.js reads them

import { shotsOf, startOf } from '../engine/locations.js';
import fs from 'node:fs';

/** Runs `run` with console.warn caught, and gives back what it was told. */
function warnings(run) {
  const told = [];
  const original = console.warn;
  console.warn = (...args) => told.push(args.join(' '));
  try {
    return { result: run(), told };
  } finally {
    console.warn = original;
  }
}

test('shotsOf gives the director every shot of a chapter, its own and each place\'s, and says so when a name is used twice', () => {
  const one = { position: [0, 1, 5] };
  const two = { position: [1, 1, 5] };
  const plain = warnings(() => shotsOf({ shots: { hero: one } }));
  assert.deepEqual(plain.result, { hero: one }, 'a chapter in one place has its own shots');
  const placed = warnings(() => shotsOf({ shots: { hero: one }, locations: { a: { shots: { wide: two } }, b: { shots: {} }, c: {} } }));
  assert.deepEqual(placed.result, { hero: one, wide: two });
  assert.deepEqual(placed.told, []);
  const twice = warnings(() => shotsOf({ shots: { wide: one }, locations: { a: { shots: { wide: two } }, b: { shots: { close: one, wide: one } } } }));
  assert.equal(twice.result.wide, one, 'the last place to set it wins, as before');
  assert.equal(twice.told.length, 2, 'one warning for each place that sets it again');
  assert.match(twice.told[0], /"wide".*the chapter.*\ba\b/);
  assert.match(twice.told[1], /"wide".*\ba\b.*\bb\b/);
});

test('startOf says what is missing when a chapter in several places does not say where it begins', () => {
  assert.equal(startOf({ start: 'a', locations: { a: {}, b: {} } }), 'a');
  assert.throws(() => startOf({ locations: { rjodur: {}, burknalaut: {} } }), /`start`.*rjodur, burknalaut/);
  assert.throws(() => startOf({ start: 'nowhere', locations: { rjodur: {} } }), /nowhere.*rjodur/);
});

test('main.js takes the director\'s shots and the first place from shotsOf and startOf', () => {
  const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{ createLocations, shotsOf, startOf \} from '\.\/engine\/locations\.js';/);
  assert.match(main, /const shots = shotsOf\(chapter\);/);
  assert.match(main, /setLocation\(startOf\(chapter\)\)/);
});
