import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBridgeGeometry, bankSide, deckCoordinates, overWater, overMarsh, supportingSurface, supportedByDeck, inDestination } from '../tools/memory-geometry-check.mjs';

const deck = { start: [-3, 1, 4], end: [5, 1, -2], halfWidth: 1.1, deckY: 1 };
const river = { center: [1, 1], normal: [.8, -.6], halfWidth: 1.6, waterY: 0 };
const destination = { center: [6.6, -3.2], radius: 1.5 };
const fixture = (position, extra = {}) => ({ bridge: { built: true, walkable: deck }, river, destination,
  pairs: { triceratops: { actors: [{ id: 'tri-0', position, ...extra }] }, brontosaurus: { actors: [] } } });

test('diagonal bridge coordinates use its actual endpoints rather than old world X/Z assumptions', () => {
  const coordinates = deckCoordinates([1, 1, 1], deck);
  assert.equal(coordinates.along, 5); assert.equal(coordinates.length, 10); assert.ok(Math.abs(coordinates.across) < 1e-12);
  assert.equal(bankSide([-3, 1, 4], river, deck), 'near');
  assert.equal(bankSide([5, 1, -2], river, deck), 'far');
  assert.equal(supportedByDeck([1, 1, 1], deck), true);
  assert.deepEqual(assessBridgeGeometry(fixture([1, 1, 1])).errors, []);
});

test('water beside or below a built bridge fails even when an authored route could claim crossing', () => {
  assert.equal(overWater([2.2, 1, 2.6], river), true);
  assert.equal(supportedByDeck([2.2, 1, 2.6], deck), false);
  assert.match(assessBridgeGeometry(fixture([2.2, 1, 2.6])).errors[0], /unsupported/);
  assert.match(assessBridgeGeometry(fixture([1, 0, 1])).errors[0], /unsupported/);
  const beforeBuild = fixture([1, 1, 1]); beforeBuild.bridge.built = false;
  assert.match(assessBridgeGeometry(beforeBuild).errors[0], /unsupported/);
  assert.deepEqual(assessBridgeGeometry(fixture([-3, .1, 4]), { extraActors: [{ id: 'walking-home', position: [2.2, 1, 2.6] }] }).errors,
    ['walking-home root is unsupported above water'], 'unbound home-transfer actors are audited too');
});

test('root on deck does not hide an actual foot hanging off its side', () => {
  const world = fixture([1, 1, 1], { feet: [{ position: [2.2, 1, 2.6], planted: true }, { position: [1, 1.5, 1], planted: false }] });
  const result = assessBridgeGeometry(world);
  assert.deepEqual(result.errors, ['tri-0 foot 0 is unsupported above water']);
  assert.equal(result.actors[0].feetChecked, 2);
  assert.deepEqual(assessBridgeGeometry(fixture([-3, .1, 4]), { extraActors: [{ id: 'walking-home', position: [-3, .1, 4], feet: [{ position: [2.2, 1, 2.6] }] }] }).errors,
    ['walking-home foot 0 is unsupported above water'], 'home travel must also support each actual foot');
});

test('arrival must reach the destination on the far bank, and river extent excludes dry land', () => {
  assert.equal(inDestination([6.6, .1, -3.2], destination), true);
  assert.equal(inDestination([1, 1, 1], destination), false);
  assert.equal(inDestination([2, .1, 2], { bounds: { minX: 1, maxX: 3, minZ: 1, maxZ: 3 } }), true);
  assert.equal(overWater([2.2, 1, 2.6], { ...river, bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 } }), false);
  const result = assessBridgeGeometry(fixture([6.6, .1, -3.2]));
  assert.equal(result.actors[0].bank, 'far'); assert.equal(result.actors[0].destination, true);
});

test('missing geometry metadata fails instead of silently accepting an unverified route', () => {
  const world = fixture([1, 1, 1]); delete world.river;
  assert.throws(() => assessBridgeGeometry(world), /Missing rotated deck/);
  assert.throws(() => assessBridgeGeometry(fixture([NaN, 1, 1])), /finite coordinate/);
  assert.throws(() => assessBridgeGeometry(fixture([1, 1, 1], { feet: [{ position: [1, 2] }] })), /X\/Y\/Z/);
});

test('curved river checks its nearest finite centreline segment, including downstream bends', () => {
  const curved = { points: [[-5, -5], [0, 0], [5, 0]], halfWidth: 1, waterY: 0 };
  assert.equal(overWater([4, 1, .5], curved), true);
  assert.equal(overWater([4, 1, 2], curved), false);
  assert.equal(overWater([5.5, 1, 0], curved), true, 'finite endpoint has a rounded water edge');
  assert.equal(overWater([7, 1, 0], curved), false, 'river is not an infinite tangent line');
});

function marshFixture(position, extra = {}) {
  return { bridge: { built: true, walkable: deck }, river, destination: { bounds: { minX: -1, maxX: 10, minZ: -29, maxZ: -23 } },
    staging: { bounds: { minX: -1.5, maxX: 10.5, minZ: -17.3, maxZ: -10.5 } },
    marsh: { center: [4.5, -19.5], halfWidth: 5.6, halfDepth: 1.5, waterY: -.32 },
    boardwalk: { built: false, panels: [
      { placed: true, start: [4.5, .2, -17.2], end: [4.5, .2, -18.7], halfWidth: 1.6, deckY: .2 },
      { placed: false, start: [4.5, .2, -18.7], end: [4.5, .2, -20.2], halfWidth: 1.6, deckY: .2 },
      { placed: false, start: [4.5, .2, -20.2], end: [4.5, .2, -21.7], halfWidth: 1.6, deckY: .2 },
    ] }, pairs: { stegosaurus: { actors: [{ id: 'stego-0', position, ...extra }] } } };
}

test('elliptical marsh includes its center but excludes dry curved corners', () => {
  const world = marshFixture([4.5, .2, -19.5]);
  assert.equal(overMarsh([4.5, .2, -19.5], world.marsh), true);
  assert.equal(overMarsh([9.8, .2, -20.9], world.marsh), false);
  assert.equal(overMarsh([4.5, .2, -22], world.marsh), false);
  assert.throws(() => overMarsh([4.5, .2, -19.5], { ...world.marsh, halfDepth: 0 }), /ellipse dimensions/);
});

test('an unplaced panel cannot support Stegosaurus, while an already placed partial walkway can', () => {
  const world = marshFixture([4.5, .24, -19.5]);
  assert.equal(supportingSurface(world.pairs.stegosaurus.actors[0].position, world), null);
  assert.deepEqual(assessBridgeGeometry(world).errors, ['stego-0 root is unsupported above water']);
  world.boardwalk.panels[1].placed = true;
  assert.equal(world.boardwalk.built, false, 'partial construction is intentionally supported');
  assert.equal(supportingSurface(world.pairs.stegosaurus.actors[0].position, world), 'boardwalk-1');
  assert.deepEqual(assessBridgeGeometry(world, { requireMarsh: true }).errors, []);
});

test('a root on bark does not excuse a foot in marsh beside it or below its surface', () => {
  const world = marshFixture([4.5, .24, -19.5], { feet: [{ position: [6.3, .24, -19.5] }, { position: [4.5, -.2, -19.5] }] });
  world.boardwalk.panels[1].placed = true;
  const result = assessBridgeGeometry(world);
  assert.deepEqual(result.errors, ['stego-0 foot 0 is unsupported above water', 'stego-0 foot 1 is unsupported above water']);
  assert.deepEqual(result.violations[0].hazards, ['marsh']);
  assert.equal(result.actors[0].feetChecked, 2);
});

test('staging and final destination are distinct and all three species are included', () => {
  const world = marshFixture([4.5, .04, -14]);
  world.pairs.triceratops = { actors: [{ id: 'tri-0', position: [4.5, .04, -24] }] };
  world.pairs.brontosaurus = { actors: [{ id: 'bronto-0', position: [4.5, .04, -13] }] };
  const result = assessBridgeGeometry(world, { requireMarsh: true });
  assert.equal(result.actors.length, 3);
  assert.equal(result.actors.find(a => a.id === 'stego-0').staging, true);
  assert.equal(result.actors.find(a => a.id === 'stego-0').destination, false);
  assert.equal(result.actors.find(a => a.id === 'tri-0').destination, true);
  assert.throws(() => assessBridgeGeometry(fixture([1, 1, 1]), { requireMarsh: true }), /Missing marsh/);
});
