import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeAdventure, BRIDGE_HELPERS, BRIDGE_ACTIONS } from '../engine/memory/bridge-rules.js';
import { createStepRules } from '../engine/memory/step-rules.js';

const HELPERS = ['triceratops', 'brontosaurus', 'stegosaurus'];
const ACTIONS = ['lift', 'roll', 'cross', 'lay', 'finish'];
const empty = () => ({ unlocked: [], free: [], selected: null, active: null, branch: 'down', bridgeBuilt: false, atStaging: false, boardwalkBuilt: false, visited: false, next: 'branch', asking: null, candidates: [], failing: null, phase: 'locked', done: [] });
function run(game, id) {
  assert.equal(game.can(id), true, id + ' is available'); assert.equal(game.choose(id), true);
  assert.equal(game.getState().active, id);
  for (const action of ACTIONS) assert.equal(game.can(action), false, 'one action owns the helpers');
  assert.equal(game.select(null), false); assert.equal(game.complete('wrong'), false);
  assert.equal(game.complete(id), true); assert.equal(game.complete(id), false, 'completion is consumed once');
  assert.equal(game.getState().selected, null); assert.equal(game.getState().active, null);
}
function lift(game) { game.select('brontosaurus'); run(game, 'lift'); }
function build(game) { lift(game); game.select('triceratops'); run(game, 'roll'); }
function stage(game) { build(game); run(game, 'cross'); }
function lay(game) { stage(game); game.select('stegosaurus'); run(game, 'lay'); }
function allFound() { const game = createBridgeAdventure(); HELPERS.forEach(species => game.unlock(species)); return game; }
const permutations = values => values.length === 1 ? [values] : values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest]));

test('three helpers and five actions begin locked with no construction or arrival progress', () => {
  assert.deepEqual([...BRIDGE_HELPERS].sort(), [...HELPERS].sort());
  assert.deepEqual([...BRIDGE_ACTIONS].sort(), [...ACTIONS].sort());
  const game = createBridgeAdventure(); assert.deepEqual(game.getState(), empty());
  for (const id of ACTIONS) { assert.equal(game.can(id), false); assert.equal(game.choose(id), false); assert.equal(game.complete(id), false); }
  for (const species of ['tyrannosaurus', undefined, '', 0]) { assert.equal(game.unlock(species), false); assert.equal(game.select(species), false); }
  for (const species of HELPERS) { assert.equal(game.select(species), false); assert.equal(game.unlock(species), true); assert.equal(game.unlock(species), false); }
});

test('construction requires its own selected species and previous stage', () => {
  const game = allFound();
  for (const species of HELPERS) {
    game.select(null); game.select(species); assert.equal(game.can('lift'), species === 'brontosaurus');
    for (const action of ['roll', 'cross', 'lay', 'finish']) assert.equal(game.can(action), false);
  }
  game.select(null); lift(game);
  assert.equal(game.getState().active, null, 'holding is idle, so memory can continue');
  for (const species of HELPERS) {
    game.select(null); game.select(species);
    assert.equal(game.can('roll'), species === 'triceratops'); assert.equal(game.can('lift'), false, 'a held branch is not lifted again');
    assert.equal(game.can('lay'), false, 'bark cannot be placed from the near bank');
  }
  game.select(null); game.select('triceratops'); run(game, 'roll'); run(game, 'cross');
  for (const species of HELPERS) {
    game.select(null); game.select(species); assert.equal(game.can('lay'), species === 'stegosaurus');
    for (const action of ['lift', 'roll', 'cross', 'finish']) assert.equal(game.can(action), false);
  }
});

test('two found pairs can build the main bridge but crossing waits for all six animals', () => {
  const game = createBridgeAdventure(); game.unlock('brontosaurus'); lift(game);
  game.unlock('triceratops'); game.select('triceratops'); run(game, 'roll');
  assert.equal(game.can('cross'), false); assert.equal(game.choose('cross'), false);
  assert.equal(game.getState().atStaging, false); assert.equal(game.getState().visited, false);
  game.unlock('stegosaurus'); assert.equal(game.can('cross'), true);
});

for (const order of permutations(HELPERS)) test('complete chain after discovery order ' + order.join(' / '), () => {
  const game = createBridgeAdventure(); order.forEach(species => game.unlock(species));
  build(game); assert.equal(game.getState().branch, 'down', 'the built bridge lets the branch go'); run(game, 'cross');
  assert.equal(game.getState().atStaging, true); assert.equal(game.getState().branch, 'down');
  assert.equal(game.getState().boardwalkBuilt, false); assert.equal(game.getState().visited, false);
  assert.notEqual(game.getState().phase, 'complete', 'staging is not the ending'); assert.equal(game.can('finish'), false);
  game.select('stegosaurus'); run(game, 'lay');
  assert.equal(game.getState().boardwalkBuilt, true); assert.equal(game.getState().visited, false);
  assert.notEqual(game.getState().phase, 'complete', 'construction is not final arrival');
  run(game, 'finish'); assert.equal(game.getState().visited, true); assert.equal(game.getState().phase, 'complete');
  for (const action of ACTIONS) assert.equal(game.choose(action), false, 'completed work cannot replay rewards');
  for (const species of HELPERS) assert.equal(game.select(species), false);
});

test('the branch stays held from the lift until the bridge is built, then the Þórseðlur are free again', () => {
  const game = allFound(); lift(game);
  for (const species of HELPERS) { game.select(null); game.select(species); assert.equal(game.can('lift'), false); }
  assert.equal(game.getState().free.includes('brontosaurus'), false, 'holding the branch, they are busy');
  game.select(null); game.select('triceratops'); run(game, 'roll');
  assert.equal(game.getState().branch, 'down'); assert.equal(game.getState().bridgeBuilt, true); assert.equal(game.can('cross'), true);
  assert.equal(game.getState().free.includes('brontosaurus'), true, 'the branch let go, they can be chosen again');
  assert.equal(game.can('lift'), false, 'a built bridge does not need another lift');
  run(game, 'cross'); assert.equal(game.getState().branch, 'down');
});

test('immutable snapshots and selection cannot advance construction or hidden timers', () => {
  const game = allFound(); game.select('stegosaurus'); const before = game.getState();
  assert.throws(() => before.unlocked.push('other'), TypeError);
  assert.throws(() => { before.boardwalkBuilt = true; }, TypeError);
  for (let i = 0; i < 100; i++) { assert.equal(game.can('lay'), false); assert.deepEqual(game.getState(), before); }
  assert.equal(game.select('stegosaurus'), true); assert.equal(game.getState().selected, null);
  assert.equal(game.select(null), false); assert.equal(game.choose('unknown'), false);
  build(game); assert.equal(before.bridgeBuilt, false); assert.equal(before.selected, 'stegosaurus');
});

for (const interrupted of ACTIONS) test('restart during ' + interrupted + ' clears all progress and rejects late completion', () => {
  const game = allFound();
  if (interrupted === 'lift') game.select('brontosaurus');
  else if (interrupted === 'roll') { lift(game); game.select('triceratops'); }
  else if (interrupted === 'cross') build(game);
  else if (interrupted === 'lay') { stage(game); game.select('stegosaurus'); }
  else lay(game);
  assert.equal(game.choose(interrupted), true); game.restart(); assert.equal(game.complete(interrupted), false);
  assert.deepEqual(game.getState(), empty());
});

test('a blocked route returns control without completing work and can be retried', () => {
  for (const interrupted of ACTIONS) {
    const game = allFound();
    if (interrupted === 'lift') game.select('brontosaurus');
    else if (interrupted === 'roll') { lift(game); game.select('triceratops'); }
    else if (interrupted === 'cross') build(game);
    else if (interrupted === 'lay') { stage(game); game.select('stegosaurus'); }
    else lay(game);
    const before = game.getState();
    assert.equal(game.cancel(interrupted), false);
    assert.equal(game.choose(interrupted), true);
    assert.equal(game.cancel('wrong'), false);
    assert.equal(game.getState().active, interrupted);
    assert.equal(game.cancel(interrupted), true);
    const after = game.getState();
    assert.equal(after.active, null); assert.equal(after.selected, null);
    for (const field of ['branch', 'bridgeBuilt', 'atStaging', 'boardwalkBuilt', 'visited']) assert.equal(after[field], before[field]);
    assert.equal(game.complete(interrupted), false, 'a late completion cannot award cancelled work');
    if (before.selected) game.select(before.selected);
    assert.equal(game.choose(interrupted), true, 'retry is available');
  }
});

test('blocked crossing retains the built bridge and the actually released branch', () => {
  const game = allFound(); build(game); game.choose('cross');
  assert.equal(game.cancel('cross', { branch: 'down' }), true);
  assert.equal(game.getState().branch, 'down'); assert.equal(game.getState().bridgeBuilt, true);
  assert.equal(game.getState().atStaging, false); assert.equal(game.getState().visited, false);
  assert.equal(game.can('cross'), true); assert.equal(game.can('lift'), false);
});

test('repeated mixed commands preserve every stage prerequisite', () => {
  const game = createBridgeAdventure(); let seed = 19; const choices = [...ACTIONS, ...HELPERS, null, 'wrong'];
  for (let i = 0; i < 4000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = choices[seed % choices.length], before = game.getState(), method = ['unlock', 'select', 'choose', 'complete', 'cancel', 'restart'][(seed >>> 10) % 6];
    if (method === 'choose' && game.can(value)) {
      if (value === 'roll') assert.equal(before.branch, 'held');
      if (value === 'cross') assert.ok(before.bridgeBuilt && HELPERS.every(species => before.unlocked.includes(species)));
      if (value === 'lay') assert.ok(before.atStaging && before.selected === 'stegosaurus');
      if (value === 'finish') assert.ok(before.boardwalkBuilt && before.atStaging);
    }
    game[method](value); const after = game.getState();
    assert.equal(new Set(after.unlocked).size, after.unlocked.length); assert.ok(after.unlocked.every(species => HELPERS.includes(species)));
    if (after.selected) assert.ok(after.unlocked.includes(after.selected));
    if (after.atStaging) assert.ok(after.bridgeBuilt && HELPERS.every(species => after.unlocked.includes(species)));
    if (after.boardwalkBuilt) assert.ok(after.atStaging);
    if (after.visited) assert.ok(after.boardwalkBuilt && after.branch === 'down' && after.active === null);
  }
});

// A level that is not level 1: a task, a "together" step and a travel step. The rules read the ladder from the description.
const fakeLevel = (extra = {}) => ({
  id: 'fake', friends: ['x', 'y'],
  steps: [
    { id: 'a', kind: 'task', target: 'rock', species: 'x' },
    { id: 'b', kind: 'together', target: 'rope', beatWords: ['Einn!', 'Tveir!'] },
    { id: 'c', kind: 'travel', target: 'far', needsAllFound: true, automatic: true },
  ],
  flags: done => ({ rockMoved: done.has('a') }),
  ...extra,
});

test("step rules run any level's ladder", () => {
  const rules = createStepRules(fakeLevel());
  assert.equal(rules.next(), 'rock', 'the first step glows first');
  assert.deepEqual(rules.getState().done, []);
  assert.equal(rules.getState().rockMoved, false, "the level's flags are part of the state");
  assert.deepEqual(rules.ask('rope'), { kind: 'not-yet' }, 'the together step waits for the one before it');
  assert.equal(rules.ask('far'), null, 'a travel step is not an obstacle');
  assert.deepEqual(rules.ask('rock'), { kind: 'find-first' });
  rules.unlock('x');
  assert.deepEqual(rules.ask('rock'), { kind: 'choose', candidates: ['x'] });
  assert.deepEqual(rules.pick('x'), { kind: 'start', action: 'a' });
  assert.equal(rules.complete('a'), true);
  assert.deepEqual(rules.getState().done, ['a']); assert.equal(rules.getState().rockMoved, true);
  assert.equal(rules.next(), 'rope');
  assert.deepEqual(rules.ask('rope'), { kind: 'start', action: 'b' }, 'a together step starts at once');
  const together = rules.getState();
  assert.equal(together.asking, null); assert.deepEqual(together.candidates, []); assert.equal(together.active, 'b', 'no bubbles, the step is running');
  assert.equal(rules.complete('b'), true);
  assert.equal(rules.next(), null, 'a travel step starts on its own');
  assert.equal(rules.can('c'), false, 'y is not found yet'); assert.equal(rules.choose('c'), false);
  rules.unlock('y'); assert.equal(rules.can('c'), true);
  assert.equal(rules.choose('c'), true); assert.equal(rules.complete('c'), true);
  assert.equal(rules.getState().phase, 'complete'); assert.deepEqual(rules.getState().done, ['a', 'b', 'c']);
  rules.restart();
  assert.deepEqual(rules.getState().done, []); assert.equal(rules.getState().rockMoved, false); assert.equal(rules.next(), 'rock');
});

test('a step the one before it has not finished cannot start, even by asking', () => {
  const rules = createStepRules(fakeLevel()); rules.unlock('x'); rules.unlock('y');
  for (const id of ['b', 'c']) assert.equal(rules.can(id), false);
  assert.deepEqual(rules.ask('rope'), { kind: 'not-yet' });
  assert.equal(rules.getState().active, null, 'a not-yet answer starts nothing');
  assert.equal(rules.select('x'), true); assert.equal(rules.choose('a'), true);
  assert.deepEqual(rules.ask('rope'), null, 'nothing is asked while a step runs'); assert.equal(rules.getState().active, 'a');
});

test("cancel hands the level's onCancel the step, the options and the done steps", () => {
  const calls = [];
  const rules = createStepRules(fakeLevel({ onCancel: (id, opts, done) => calls.push([id, opts, [...done]]) }));
  rules.unlock('x'); rules.select('x');
  assert.equal(rules.cancel('a', { why: 'blocked' }), false); assert.equal(calls.length, 0, 'nothing runs, nothing to cancel');
  rules.choose('a');
  assert.equal(rules.cancel('b', { why: 'blocked' }), false); assert.equal(calls.length, 0, 'another step is not the running one');
  assert.equal(rules.cancel('a', { why: 'blocked' }), true);
  assert.deepEqual(calls, [['a', { why: 'blocked' }, []]]);
  assert.equal(rules.getState().active, null); assert.deepEqual(rules.getState().done, [], 'a cancelled step is not done');
});

test('holds keep a species busy until the named step', () => {
  const game = allFound(); lift(game);
  assert.equal(game.getState().free.includes('brontosaurus'), false, 'holding the branch');
  assert.equal(game.getState().free.includes('triceratops'), true);
  game.select('triceratops'); run(game, 'roll');
  assert.equal(game.getState().free.includes('brontosaurus'), true, 'the roll let the branch go');
  // The same rule in a level of another shape: x is busy after a until b is done.
  const rules = createStepRules(fakeLevel({ steps: [
    { id: 'a', kind: 'task', target: 'rock', species: 'x', holds: 'b' },
    { id: 'b', kind: 'task', target: 'log', species: 'y' },
  ] }));
  rules.unlock('x'); rules.unlock('y'); rules.select('x'); rules.choose('a'); rules.complete('a');
  assert.deepEqual([...rules.getState().free], ['y']);
  assert.deepEqual(rules.ask('log'), { kind: 'choose', candidates: ['y'] }, 'only the free pair can be chosen');
  rules.pick('y'); rules.complete('b');
  assert.deepEqual([...rules.getState().free], ['x', 'y']);
});

test("level 1's state keeps today's five fields and adds the done steps", () => {
  const game = allFound();
  assert.deepEqual(game.getState().done, []);
  lift(game); assert.deepEqual(game.getState().done, ['lift']); assert.equal(game.getState().branch, 'held');
  game.select('triceratops'); run(game, 'roll'); assert.deepEqual(game.getState().done, ['lift', 'roll']);
  run(game, 'cross'); game.select('stegosaurus'); run(game, 'lay'); run(game, 'finish');
  assert.deepEqual(game.getState().done, ACTIONS);
  assert.deepEqual(Object.keys(game.getState()), Object.keys(empty()), 'done is not one of the listed fields: snapshots still compare as before');
  game.restart(); assert.deepEqual(game.getState().done, []);
});

// ---- level 2: the tunnel and the rockfall (Task 4) ----
const gorge = async () => (await import('../engine/memory/levels/steinagljufur.js')).STEINAGLJUFUR;
const everyone = (level, rules) => { for (const species of level.friends) rules.unlock(species); return rules; };

test('level 2 opens light, then headbutt; a wrong friend fails and the right one starts', async () => {
  const level = await gorge(), rules = everyone(level, createStepRules(level));
  assert.equal(rules.next(), 'tunnel', 'the tunnel glows first');
  assert.deepEqual(rules.ask('rocks'), { kind: 'not-yet' }, 'the rockfall waits for the light');
  assert.deepEqual(rules.ask('tunnel'), { kind: 'choose', candidates: [...level.friends] }, 'every found pair is a choice');
  assert.equal(level.steps[0].species, 'stegosaurus', 'the Kambeðlur light the tunnel');
  // Three wrong friends, each fails and the bubbles come back; the table of the playthrough's first try is one of them.
  const wrongAtTunnel = level.friends.filter(species => species !== 'stegosaurus');
  assert.ok(wrongAtTunnel.includes(level.wrongFriends.tunnel), `the driver tries a wrong friend at the tunnel (${level.wrongFriends.tunnel})`);
  for (const species of wrongAtTunnel) {
    assert.deepEqual(rules.pick(species), { kind: 'fail' }); assert.equal(rules.getState().failing, species); assert.equal(rules.getState().phase, 'failing');
    assert.equal(rules.pick('stegosaurus'), null, 'nothing is picked while a wrong friend tries');
    assert.equal(rules.failDone(), true); assert.equal(rules.getState().asking, 'tunnel', 'the bubbles come back');
  }
  assert.deepEqual(rules.pick('stegosaurus'), { kind: 'start', action: 'light' }); assert.equal(rules.getState().active, 'light');
  assert.equal(rules.complete('light'), true); assert.equal(rules.getState().tunnelLit, true); assert.equal(rules.next(), 'rocks');
  // The rockfall: the Kambeðlur are still at the tunnel (they hold the light), so the choice is the other three, and the playthrough's wrong try is one of them.
  assert.deepEqual(rules.ask('rocks'), { kind: 'choose', candidates: ['triceratops', 'brontosaurus', 'pteranodon'] });
  assert.ok(['brontosaurus', 'pteranodon'].includes(level.wrongFriends.rocks), `the driver tries a wrong friend at the rocks that the bubbles offer (${level.wrongFriends.rocks})`);
  for (const species of ['brontosaurus', 'pteranodon']) { assert.deepEqual(rules.pick(species), { kind: 'fail' }); assert.equal(rules.failDone(), true); }
  assert.deepEqual(rules.pick('triceratops'), { kind: 'start', action: 'headbutt' });
  assert.equal(rules.complete('headbutt'), true); assert.equal(rules.getState().rocksFallen, true);
  assert.equal(rules.next(), null, 'the walk through the tunnel starts on its own (Task 5)');
  assert.deepEqual(level.steps.find(step => step.id === 'headbutt').beatWords, ['Einn!', 'Tveir!', 'BÚMM!'], 'three taps in rhythm');
});

test('the stegosaurus pair holds the light until through', async () => {
  const level = await gorge(), rules = everyone(level, createStepRules(level));
  rules.ask('tunnel'); rules.pick('stegosaurus'); rules.complete('light');
  assert.deepEqual([...rules.getState().free], ['triceratops', 'brontosaurus', 'pteranodon'], 'the Kambeðlur stay at the tunnel');
  rules.ask('rocks'); rules.pick('triceratops'); rules.complete('headbutt');
  assert.equal(rules.getState().free.includes('stegosaurus'), false, 'still holding the light while the rocks are gone');
  assert.equal(rules.getState().tunnelLit, true);
  assert.equal(rules.can('through'), true); assert.equal(rules.choose('through'), true); assert.equal(rules.complete('through'), true);
  assert.deepEqual([...rules.getState().free], [...level.friends], 'through lets the light go');
  assert.equal(rules.getState().tunnelLit, true, 'the tunnel stays lit until the trunk is down');
  // What the world raises while it works is heard and said: each name is an audio method that exists.
  const audio = (await import('../engine/memory/audio.js')).createMemoryAudio({ manifestUrl: null });
  const names = Object.keys(level.eventSounds);
  for (const type of ['light-step', 'tunnel-lit', 'beat:headbutt', 'rocks-hit', 'rocks-fall', 'fail-bump', 'fail-pebble', 'fail-peck']) assert.ok(names.includes(type), `${type} has a sound`);
  for (const [type, entries] of Object.entries(level.eventSounds)) for (const entry of entries) {
    const method = typeof entry === 'string' ? entry : entry.method;
    if (method) assert.equal(typeof audio[method], 'function', `${type}: audio.${method} exists`);
  }
  audio.dispose();
  assert.equal(level.eventCaptions['tunnel-lit'].text, 'Plöturnar lýsa eins og ljósker!'); assert.equal(level.eventCaptions['rocks-fall'].text, 'Búmm! Leiðin er opin!');
});

// ---- level 2: through the tunnel, the ledge and the cliff (Task 5) ----
test('through waits for every pair and every gift', async () => {
  const level = await gorge(), rules = createStepRules(level), through = level.steps.find(step => step.id === 'through');
  // The step is a travel step that starts by itself, and needs every friend found and every fossil in the basket (the leaves are behind the camera once it begins).
  assert.deepEqual([through.kind, through.needsAllFound, through.waitsForGifts, through.automatic], ['travel', true, true, true]);
  for (const species of ['stegosaurus', 'triceratops', 'brontosaurus']) rules.unlock(species);
  rules.select('stegosaurus'); assert.equal(rules.choose('light'), true); assert.equal(rules.complete('light'), true);
  rules.select('triceratops'); assert.equal(rules.choose('headbutt'), true); assert.equal(rules.complete('headbutt'), true);
  assert.equal(rules.can('through'), false, 'the Flugeðlur are still under the leaves');
  assert.equal(rules.choose('through'), false);
  assert.equal(rules.unlock('pteranodon'), true);
  assert.equal(rules.can('through'), true, 'all four pairs are found');
  assert.equal(rules.choose('through'), true); assert.equal(rules.complete('through'), true);
  assert.equal(rules.getState().throughTunnel, true);
  // The next obstacle is the ledge, and the Kambeðlur, free again, can try it (and fail) like the rest.
  assert.equal(rules.next(), 'ledge');
  assert.deepEqual([...rules.ask('ledge').candidates].sort(), [...level.friends].sort());
});

test('level 2 has a wrong go for every friend that cannot do the ledge or the cliff, and the right one starts', async () => {
  const level = await gorge(), rules = everyone(level, createStepRules(level)), { FAIL_TRIES, GESTURES } = await import('../engine/memory/gestures.js');
  for (const species of ['stegosaurus', 'triceratops']) { rules.select(species); assert.equal(rules.choose(species === 'stegosaurus' ? 'light' : 'headbutt'), true); rules.complete(species === 'stegosaurus' ? 'light' : 'headbutt'); }
  rules.choose('through'); rules.complete('through');
  // The ledge: the Þórseðlur reach it; the Þríhyrnur hop and cannot, the Kambeðlur rear up and wobble, the Flugeðlur fly up and dangle from the slab.
  for (const [target, right, wrong] of [['ledge', 'brontosaurus', ['triceratops', 'stegosaurus', 'pteranodon']], ['cliff', 'pteranodon', ['brontosaurus', 'triceratops', 'stegosaurus']]]) {
    assert.deepEqual(rules.ask(target), { kind: 'choose', candidates: [...level.friends] }, `every found pair is a choice at the ${target}`);
    assert.ok(wrong.includes(level.wrongFriends[target]), `the driver tries a wrong friend at the ${target}: ${level.wrongFriends[target]}`);
    for (const species of wrong) {
      assert.deepEqual(rules.pick(species), { kind: 'fail' }, `${species} fails at the ${target}`); assert.equal(rules.failDone(), true);
      assert.ok(GESTURES[FAIL_TRIES[`${target}:${species}`]], `${species} at the ${target} has a funny try of its own`);
    }
    assert.deepEqual(rules.pick(right), { kind: 'start', action: target === 'ledge' ? 'reach' : 'fly' });
    assert.equal(rules.complete(target === 'ledge' ? 'reach' : 'fly'), true);
  }
  assert.equal(rules.getState().ropeUp, true); assert.equal(rules.next(), null, 'the climb starts on its own');
  assert.equal(rules.can('climb'), true);
});

test('level 2 says and sounds the walk through the tunnel, the ledge, the cliff and the climb', async () => {
  const level = await gorge(), { VOICE_LINES } = await import('../engine/memory/voice-lines.js'), fs = await import('node:fs');
  const TEXT = { g2_through: 'Göngin eru opin. Allir með!', g2_ledge_ready: 'Stallurinn er of hár. Hver nær hátt?', g2_reached: 'Langir hálsar ná hátt!', g2_cliff_ready: 'Klettaveggurinn er brattur. Hver getur flogið með reipið upp?', g2_flown: 'Flugeðlurnar fljúga upp!', g2_climb: 'Haldið í reipið. Upp með ykkur!' };
  for (const [id, text] of Object.entries(TEXT)) {
    assert.equal(VOICE_LINES[id]?.text, text, `${id}: the words`);
    assert.ok(fs.existsSync(new URL(`../assets/audio/memory/${id}.mp3`, import.meta.url)), `${id} is recorded`);
  }
  // Mosi says the travel steps' lines as they start, the two "who can" lines when the pair is home, the other two as their tasks begin.
  assert.deepEqual([level.lines.through, level.lines.climb], ['g2_through', 'g2_climb']);
  assert.equal(level.voice['g2-reach-ready'], 'g2_ledge_ready'); assert.equal(level.voice['g2-fly-ready'], 'g2_cliff_ready');
  assert.equal(level.story.reach.prompts.ready, TEXT.g2_ledge_ready); assert.equal(level.story.fly.prompts.ready, TEXT.g2_cliff_ready); assert.equal(level.story.through.prompts.open, TEXT.g2_through); assert.equal(level.story.climb.prompts.doing, TEXT.g2_climb);
  assert.deepEqual(level.eventSounds['reach-start'], [{ say: 'g2_reached', delay: .9 }]); assert.deepEqual(level.eventSounds['fly-start'], [{ say: 'g2_flown', delay: .9 }]);
  assert.equal(level.eventCaptions['reach-start'].text, TEXT.g2_reached); assert.equal(level.eventCaptions['fly-start'].text, TEXT.g2_flown);
  // What the world raises while it works is heard: each name is an audio method that exists, and each recorded cue is in the gorge's manifest.
  const audio = (await import('../engine/memory/audio.js')).createMemoryAudio({ manifestUrl: null }), manifest = JSON.parse(fs.readFileSync(new URL('../assets/audio/memory/soundscape/gorge/manifest.json', import.meta.url), 'utf8'));
  for (const type of ['reach-start', 'beat:reach', 'slab-step', 'slab-down', 'fly-start', 'wing-beat', 'rope-lift', 'rope-knots', 'rope-taut', 'climb-step', 'fail-rope', 'fail-slip']) assert.ok(level.eventSounds[type], `${type} has a sound`);
  for (const [type, entries] of Object.entries(level.eventSounds)) for (const entry of entries) { const method = typeof entry === 'string' ? entry : entry.method; if (method) assert.equal(typeof audio[method], 'function', `${type}: audio.${method} exists`); }
  for (const id of ['wing-flap', 'slab-lower', 'slab-lower-alt', 'rope-whoosh', 'rope-tighten', 'rope-knots', 'gravel-slip', 'gravel-climb']) assert.ok(manifest.sfx[id] && fs.existsSync(new URL(`../assets/audio/memory/soundscape/gorge/${manifest.sfx[id].file}`, import.meta.url)), `${id} is a sound of the gorge`);
  audio.dispose();
  // The two CC BY sounds the step adds, and the three models, are named behind the ending card's "i".
  const credited = level.credits.map(row => `${row.author} ${row.license} ${row.source}`).join(' | ');
  for (const needle of ['Tdude9000 CC BY 3.0', 'jorickhoofd CC BY 4.0', 'F.M.Audio CC BY 4.0', 'Kenney CC0', 'ambientCG CC0']) assert.ok(credited.includes(needle), `${needle} is credited`);
  assert.ok(level.credits.some(row => row.title.startsWith('Tréð') && row.author === 'Quaternius'));
});

// ---- level 2: everyone pulls, the trunk falls, the walk to Sólarsyllan (Task 6) ----
test('a together step starts without bubbles and every friend joins', async () => {
  const level = await gorge(), rules = everyone(level, createStepRules(level)), fs = await import('node:fs');
  for (const [species, id] of [['stegosaurus', 'light'], ['triceratops', 'headbutt'], [null, 'through'], ['brontosaurus', 'reach'], ['pteranodon', 'fly'], [null, 'climb']]) {
    if (species) rules.select(species); assert.equal(rules.choose(id), true, id); assert.equal(rules.complete(id), true, id);
  }
  assert.equal(rules.getState().atClifftop, true); assert.equal(rules.next(), 'trunk', 'on the clifftop the trunk is next');
  const pull = level.steps.find(step => step.id === 'pull');
  assert.deepEqual([pull.kind, pull.target, pull.beatWords], ['together', 'trunk', ['Einn!', 'Tveir!', 'TOGA!']]);
  // A tap on the trunk starts the pull at once: no bubbles ask who can, no pair is picked.
  assert.deepEqual(rules.ask('trunk'), { kind: 'start', action: 'pull' });
  assert.equal(rules.getState().asking, null); assert.equal(rules.getState().selected, null); assert.equal(rules.getState().active, 'pull');
  // The game plays the step at that tap (game.js askObstacle: a 'start' answer plays the world's step, and cancels it when it cannot begin).
  const game = fs.readFileSync(new URL('../engine/memory/game.js', import.meta.url), 'utf8'), ask = game.slice(game.indexOf('function askObstacle'), game.indexOf('function pickFriend'));
  assert.match(ask, /answer\.kind === 'start'/, 'askObstacle starts a together step');
  assert.match(ask, /world\.playStep\(answer\.action/, 'and plays its scene');
  // Every friend joins: all eight and Mosi have a place on the rope, and a place on Sólarsyllan at the end of the walk over the trunk.
  const { FORMATIONS } = await import('../engine/memory/levels/steinagljufur/upper-mover.js');
  for (const formation of ['rope', 'sun']) {
    assert.ok(FORMATIONS[formation]?.mosi, `Mosi has a place in ${formation}`);
    for (const species of level.friends) assert.equal(FORMATIONS[formation][species]?.length, 2, `both ${species} have a place in ${formation}`);
  }
  assert.equal(rules.complete('pull'), true); assert.equal(rules.getState().trunkDown, true);
  // The walk over the trunk starts by itself, and Mosi says the bridge's line as it does; before the tap he calls everyone to the rope.
  const walk = level.steps.find(step => step.id === 'walk');
  assert.deepEqual([walk.kind, walk.automatic], ['travel', true]); assert.equal(rules.can('walk'), true);
  assert.equal(rules.choose('walk'), true); assert.equal(rules.complete('walk'), true); assert.equal(rules.getState().onSunLedge, true);
  const { VOICE_LINES } = await import('../engine/memory/voice-lines.js');
  assert.equal(level.lines.walk, 'g2_bridge'); assert.equal(level.voice['g2-pull-ready'], 'g2_pull_ready');
  assert.equal(VOICE_LINES.g2_pull_ready?.text, 'Togum öll saman í reipið!'); assert.equal(VOICE_LINES.g2_bridge?.text, 'Brúin er komin. Á Sólarsylluna!');
  for (const id of ['g2_pull_ready', 'g2_bridge']) assert.ok(fs.existsSync(new URL(`../assets/audio/memory/${id}.mp3`, import.meta.url)), `${id} is recorded`);
  // What the pull and the fall sound like: each a method of the audio that exists.
  const audio = (await import('../engine/memory/audio.js')).createMemoryAudio({ manifestUrl: null });
  for (const type of ['beat:pull', 'trunk-tilt', 'trunk-fall', 'trunk-dust', 'rope-lift', 'wing-beat', 'rope-knots', 'rope-taut']) assert.ok(level.eventSounds[type], `${type} has a sound`);
  for (const [type, entries] of Object.entries(level.eventSounds)) for (const entry of entries) { const method = typeof entry === 'string' ? entry : entry.method; if (method) assert.equal(typeof audio[method], 'function', `${type}: audio.${method} exists`); }
  assert.ok(level.eventSounds['trunk-fall'].includes('bridgeLand'), "the trunk lands with level 1's thud");
  audio.dispose();
});

test("level 2's upper gorge is as the story says: a ledge too high to walk up, a steep path up to a flat rim with room for Task 6, and a rope, slab and tree within their caps", async () => {
  const { groundAt, LEDGE, CLIMB, RIM, CLIMB_LENGTH, wayPoints } = await import('../engine/memory/levels/steinagljufur/upper-ground.js');
  const { ROPE_TRIANGLES } = await import('../engine/memory/levels/steinagljufur/rope.js');
  const fs = await import('node:fs'), asset = name => JSON.parse(fs.readFileSync(new URL(`../assets/memory/bord2/${name}`, import.meta.url), 'utf8'));
  // the exit floor is level and the ledge is a step of 1.9 metres up in under a metre of ground: too high for a baby to walk up, and the slab (4.8 m, 24 degrees) is what lets them
  assert.equal(groundAt(-6, -1), 0); assert.equal(groundAt(LEDGE.x + 2.5, 0), LEDGE.height);
  assert.ok(groundAt(LEDGE.x - .6, 0) < .05 && groundAt(LEDGE.x + .05, 0) === LEDGE.height, 'the riser is a step (the whole height in 60 centimetres), not a slope');
  assert.ok(LEDGE.height > 1.2 && LEDGE.height < 2.6, 'a baby stands about a metre high');
  // the path climbs from the terrace to the rim in bends, steeply but not a wall; every point of it is on the ground it says
  const way = wayPoints(1), rise = CLIMB.at(-1)[2] - CLIMB[0][2];
  assert.ok(Math.abs(rise - (RIM.y - LEDGE.height)) < 1.1, `the path ends at the rim: ${rise} metres up`);
  assert.ok(Math.atan2(rise, CLIMB_LENGTH) > .3 && Math.atan2(rise, CLIMB_LENGTH) < .6, 'steep: between 17 and 34 degrees on average');
  for (const [x, z, y] of way) assert.ok(Math.abs(groundAt(x, z) - y) < .05, `the path is the ground at ${x}, ${z}`);
  const headings = way.slice(1).map((p, i) => Math.atan2(p[1] - way[i][1], p[0] - way[i][0]));
  assert.ok(Math.max(...headings) - Math.min(...headings) > .7, 'the path winds (the camera follows it up)');
  // the rim is flat and wide, with room for the dead trunk and the gap beyond the tree (Task 6): level for more than ten metres past the top of the path
  for (let x = 26; x <= 36; x += 2) assert.equal(groundAt(x, RIM.from[1] + (RIM.to[1] - RIM.from[1]) * (x - RIM.from[0]) / (RIM.to[0] - RIM.from[0])), RIM.y, `the rim is level at ${x}`);
  // the caps the plan sets: the rope 1,000 triangles, the slab 1,000, the tree 3,000
  assert.ok(ROPE_TRIANGLES <= 1000, `the rope's tube: ${ROPE_TRIANGLES}`);
  assert.ok(asset('gorge-slab-source.json').triangles <= 1000); assert.ok(asset('gorge-tree-source.json').triangles <= 3000);
  assert.equal(asset('rope-source.json').width, 512); assert.ok(asset('rope-source.json').height <= 512, 'the rope texture is 512 px or less');
});
