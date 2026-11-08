import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMemoryGame } from '../engine/memory/rules.js';
import { LEVELS, levelById, levelNumber, unlockedLevels, unlockLevel, chooseLevel, finishLevel, isNewLevel, markPlayed } from '../engine/memory/levels/index.js';
import { BERJALUNDUR } from '../engine/memory/levels/berjalundur.js';
import { STEINAGLJUFUR } from '../engine/memory/levels/steinagljufur.js';

const fixed = () => createMemoryGame({ random: () => 0.999 });
const pairIds = (game, species) => game.getState().cards.filter(card => card.species === species).map(card => card.id);
function revealTwo(game, first, second) {
  assert.equal(game.pick(first)[0]?.type, 'reveal');
  game.advance(0.45);
  assert.equal(game.pick(second)[0]?.type, 'reveal');
  return game.advance(0.45);
}
function invariant(game) {
  const state = game.getState();
  assert.equal(new Set(state.cards.map(card => card.id)).size, state.cards.length);
  assert.ok(state.cards.filter(card => card.status === 'open').length <= 2);
  assert.equal(state.cards.filter(card => card.status === 'matched').length, 2 * state.matchedPairs);
  assert.equal(new Set(state.selected).size, state.selected.length);
  assert.ok(state.selected.every(id => state.cards[id].status !== 'hidden'));
  // Gift leaves (species null, an item) are pairs of their own: found two at a time, never counted as friend pairs.
  assert.equal(state.cards.filter(card => card.status === 'found').length, 2 * state.found.length);
  for (const name of new Set(state.cards.map(card => card.species).filter(Boolean))) {
    const pair = state.cards.filter(card => card.species === name);
    assert.equal(pair.length, 2);
    assert.notEqual(pair.filter(card => card.status === 'matched').length, 1);
  }
  for (const item of new Set(state.cards.map(card => card.item).filter(Boolean))) {
    const pair = state.cards.filter(card => card.item === item);
    assert.equal(pair.length, 2);
    assert.notEqual(pair.filter(card => card.status === 'found').length, 1);
  }
}

test('new game has three shuffled friend pairs, three gift pairs and independent, deeply immutable snapshots', () => {
  const game = fixed(), before = game.getState();
  assert.equal(before.phase, 'ready');
  assert.equal(before.cards.length, 12);
  assert.equal(before.cards.filter(card => card.species === null).length, 6);
  assert.equal(before.matchedPairs, 0);
  assert.equal(before.paused, false);
  assert.ok(before.cards.every(card => card.status === 'hidden'));
  assert.throws(() => { before.cards[0].species = 'changed'; }, TypeError);
  assert.throws(() => { before.selected.push(0); }, TypeError);
  game.pick(0);
  assert.equal(before.cards[0].status, 'hidden');
  assert.equal(game.getState().cards[0].status, 'open');
  invariant(game);
});

test('supplied random source controls Fisher-Yates shuffle and each restart reshuffles', () => {
  let sample = 0.999, calls = 0;
  const roster = ['a', 'b', 'c'];
  const game = createMemoryGame({ species: roster, random: () => { calls++; return sample; } });
  const names = () => game.getState().cards.map(card => card.species ?? card.item);
  assert.deepEqual(names(), ['a', 'a', 'b', 'b', 'c', 'c', 'shrew', 'shrew', 'hermitCrab', 'hermitCrab', 'crab', 'crab']);
  assert.equal(calls, 11);
  roster[0] = 'external change';
  sample = 0;
  game.restart();
  assert.deepEqual(names(), ['a', 'b', 'b', 'c', 'c', 'shrew', 'shrew', 'hermitCrab', 'hermitCrab', 'crab', 'crab', 'a']);
  assert.equal(calls, 22);
  invariant(game);
});

test('first reveal has a readability lock; same, invalid and third cards never reveal', () => {
  const game = fixed();
  for (const invalid of [-1, 12, 1.5, NaN, '0', null]) assert.deepEqual(game.pick(invalid), []);
  assert.deepEqual(game.pick(0), [{ type: 'reveal', ids: [0], species: 'triceratops', item: null }]);
  assert.equal(game.getState().phase, 'revealing');
  assert.deepEqual(game.pick(0), []);
  assert.deepEqual(game.pick(2), []);
  game.advance(0.44);
  assert.deepEqual(game.pick(2), []);
  game.advance(0.01);
  assert.equal(game.getState().phase, 'one-open');
  assert.deepEqual(game.pick(0), []);
  game.pick(2);
  assert.deepEqual(game.pick(4), []);
  assert.deepEqual(game.getState().selected, [0, 2]);
  invariant(game);
});

test('mismatch exposes both for 1.5 seconds after reveal and locks during closing', () => {
  const game = fixed();
  assert.deepEqual(revealTwo(game, 0, 2), []);
  assert.equal(game.getState().phase, 'mismatch');
  assert.deepEqual(game.advance(1.49), []);
  assert.equal(game.getState().cards.filter(card => card.status === 'open').length, 2);
  assert.deepEqual(game.pick(4), []);
  assert.deepEqual(game.advance(0.01), [{ type: 'conceal', ids: [0, 2] }]);
  assert.deepEqual(game.getState().selected, []);
  assert.ok(game.getState().cards.every(card => card.status === 'hidden'));
  assert.deepEqual(game.pick(0), []);
  game.advance(0.29);
  assert.deepEqual(game.pick(0), []);
  game.advance(0.01);
  assert.equal(game.getState().phase, 'ready');
  assert.equal(game.pick(0)[0].type, 'reveal');
});

test('matches are counted once, retain their slots and complete only after travel; the round is won with the last gift pair', () => {
  const game = fixed(), roster = ['triceratops', 'stegosaurus', 'brontosaurus'], gifts = ['shrew', 'hermitCrab', 'crab'];
  for (const [nestIndex, species] of roster.entries()) {
    const ids = pairIds(game, species);
    assert.deepEqual(revealTwo(game, ...ids), [{ type: 'match', ids, species, nestIndex }]);
    assert.equal(game.getState().phase, 'matching');
    assert.equal(game.getState().matchedPairs, nestIndex + 1);
    for (const id of ids) assert.deepEqual(game.pick(id), []);
    assert.deepEqual(game.advance(0.99), []);
    assert.deepEqual(game.advance(0.01), []);
    assert.equal(game.getState().phase, 'ready', 'the friends alone do not end the round');
    invariant(game);
  }
  for (const [giftIndex, item] of gifts.entries()) {
    const ids = game.getState().cards.filter(card => card.item === item).map(card => card.id);
    assert.deepEqual(revealTwo(game, ...ids), [{ type: 'gift', ids, item, giftIndex }]);
    assert.equal(game.getState().phase, 'matching');
    assert.equal(game.getState().matchedPairs, 3, 'a gift pair is not a friend pair');
    assert.deepEqual(game.advance(0.99), []);
    const events = game.advance(0.01);
    assert.deepEqual(events, giftIndex === 2 ? [{ type: 'won', ids: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }] : []);
    assert.equal(game.getState().phase, giftIndex === 2 ? 'won' : 'ready');
    invariant(game);
  }
  assert.deepEqual(game.advance(100), []);
  assert.deepEqual(game.pick(0), []);
  assert.equal(game.getState().matchedPairs, 3);
  assert.deepEqual([...game.getState().found], gifts);
});

test('pause freezes input and every timed stage; invalid time cannot corrupt the game', () => {
  const game = fixed();
  game.pick(0); game.advance(0.2); game.pause(true);
  const frozen = game.getState();
  assert.deepEqual(game.advance(100), []);
  assert.deepEqual(game.pick(1), []);
  assert.deepEqual(game.getState(), frozen);
  game.pause(false); game.advance(0.24);
  assert.equal(game.getState().phase, 'revealing');
  game.advance(0.01); game.pick(2); game.advance(0.45);
  game.advance(0.7); game.pause(true); game.advance(100); game.pause(false);
  assert.deepEqual(game.advance(0.79), []);
  assert.equal(game.advance(0.01)[0].type, 'conceal');
  game.pause(true); game.advance(100); game.pause(false); game.advance(0.3);
  revealTwo(game, 0, 1); game.advance(0.5);
  game.pause(true); game.advance(100); game.pause(false); game.advance(0.49);
  assert.equal(game.getState().phase, 'matching');
  game.advance(0.01);
  assert.equal(game.getState().phase, 'ready');
  const before = game.getState();
  for (const dt of [-1, 0, NaN, Infinity, '1']) assert.deepEqual(game.advance(dt), []);
  assert.deepEqual(game.getState(), before);
});

test('restart during reveal, mismatch and matching discards all previous pending work', () => {
  const game = fixed();
  const stages = [
    () => game.pick(0),
    () => revealTwo(game, 0, 2),
    () => revealTwo(game, 0, 1),
  ];
  for (const enter of stages) {
    enter(); game.pause(true); game.restart();
    assert.equal(game.getState().phase, 'ready');
    assert.equal(game.getState().paused, false);
    assert.equal(game.getState().matchedPairs, 0);
    assert.deepEqual(game.advance(100), []);
    invariant(game);
  }
});

test('large and partitioned time steps emit the same ordered events and final state', () => {
  for (const second of [1, 2]) {
    const large = fixed(), small = fixed();
    for (const game of [large, small]) { game.pick(0); game.advance(0.45); game.pick(second); }
    const expected = large.advance(3), actual = [];
    for (let i = 0; i < 300; i++) actual.push(...small.advance(0.01));
    assert.deepEqual(actual, expected);
    assert.deepEqual(small.getState(), large.getState());
    invariant(large);
  }
});

test('repeated arbitrary input preserves pair and selection invariants', () => {
  let seed = 12345;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const game = createMemoryGame({ random });
  for (let i = 0; i < 2000; i++) {
    game.pick(Math.floor(random() * 14) - 1);
    game.advance(random() * 0.8);
    if (i % 113 === 0) game.pause(!game.getState().paused);
    if (i % 397 === 0) game.restart();
    invariant(game);
  }
});

test('custom roster supports a single pair and rejects invalid setup', () => {
  const game = createMemoryGame({ species: ['triceratops'], gifts: [], random: () => 0 });
  revealTwo(game, 0, 1);
  assert.equal(game.advance(1)[0].type, 'won');
  for (const species of [[], ['a', 'a'], [''], [1], 'a']) {
    assert.throws(() => createMemoryGame({ species }), TypeError);
  }
  assert.throws(() => createMemoryGame({ random: 4 }), TypeError);
  for (const sample of [-0.1, 1, NaN, Infinity]) {
    assert.throws(() => createMemoryGame({ random: () => sample }), RangeError);
  }
});

// The levels: level 1 is described as data, and its lock never depends on storage working.
const memoryStorage = initial => {
  let value = initial;
  return { getItem: key => (key === 'minnisspil.unlocked' ? value : null), setItem(key, next) { if (key === 'minnisspil.unlocked') value = next; }, get value() { return value; } };
};
const blockedStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('a four-friend level deals 16 cards: four friend pairs (the Flugeðla among them) and four gift pairs, and is won with the last pair', () => {
  const roster = ['triceratops', 'stegosaurus', 'brontosaurus', 'pteranodon'], gifts = ['ammonite', 'trilobite', 'fern', 'footprint'];
  const game = createMemoryGame({ random: () => 0.999, species: roster, gifts });
  const cards = game.getState().cards;
  assert.equal(cards.length, 16);
  assert.equal(new Set(cards.map(card => card.id)).size, 16);
  for (const name of roster) assert.equal(cards.filter(card => card.species === name).length, 2, `two leaves hide ${name}`);
  for (const item of gifts) assert.equal(cards.filter(card => card.item === item).length, 2, `two leaves hide the ${item}`);
  assert.equal(cards.filter(card => card.species === null).length, 8);
  invariant(game);
  for (const [nestIndex, species] of roster.entries()) {
    const ids = pairIds(game, species);
    assert.deepEqual(revealTwo(game, ...ids), [{ type: 'match', ids, species, nestIndex }]);
    game.advance(1);
    assert.equal(game.getState().matchedPairs, nestIndex + 1);
    invariant(game);
  }
  for (const [giftIndex, item] of gifts.entries()) {
    const ids = game.getState().cards.filter(card => card.item === item).map(card => card.id);
    assert.deepEqual(revealTwo(game, ...ids), [{ type: 'gift', ids, item, giftIndex }]);
    const events = game.advance(1);
    assert.deepEqual(events, giftIndex === 3 ? [{ type: 'won', ids: [...Array(16).keys()] }] : []);
  }
  assert.equal(game.getState().phase, 'won');
});

test('level 1 is described as frozen data the rules, the story and the game read', () => {
  assert.deepEqual(LEVELS.map(level => level.id), ['berjalundur', 'steinagljufur']);
  assert.equal(levelById('berjalundur'), BERJALUNDUR); assert.equal(levelById('nope'), null);
  assert.equal(levelNumber(1), BERJALUNDUR); assert.equal(levelNumber(9), null);
  assert.equal(BERJALUNDUR.number, 1); assert.equal(BERJALUNDUR.title, 'Berjalundurinn');
  assert.deepEqual([...BERJALUNDUR.friends], ['triceratops', 'stegosaurus', 'brontosaurus']);
  assert.deepEqual([...BERJALUNDUR.gifts], ['shrew', 'hermitCrab', 'crab']);
  assert.deepEqual(BERJALUNDUR.steps.map(step => [step.id, step.kind, step.target]), [['lift', 'task', 'branch'], ['roll', 'task', 'log'], ['cross', 'travel', 'staging'], ['lay', 'task', 'bark'], ['finish', 'travel', 'grove']]);
  assert.deepEqual(BERJALUNDUR.steps.filter(step => step.species).map(step => [step.id, step.species]), [['lift', 'brontosaurus'], ['roll', 'triceratops'], ['lay', 'stegosaurus']]);
  assert.equal(BERJALUNDUR.steps[0].holds, 'roll');
  assert.deepEqual(BERJALUNDUR.steps.find(step => step.id === 'roll').beatWords, ['Einn!', 'Tveir!', 'ÝTA!']);
  assert.deepEqual(BERJALUNDUR.steps.find(step => step.id === 'lay').beatWords, ['Ein!', 'Tvær!', 'Þrjár!']);
  assert.ok(BERJALUNDUR.steps.every(step => !('journey' in step)), 'the steps have no trail names: the screen has no trail of steps');
  const cross = BERJALUNDUR.steps.find(step => step.id === 'cross');
  assert.deepEqual([cross.needsAllFound, cross.waitsForGifts, cross.automatic], [true, true, true]);
  assert.throws(() => { BERJALUNDUR.steps[0].target = 'changed'; }, TypeError, 'the description cannot be changed by the game');
  assert.throws(() => { BERJALUNDUR.friends.push('x'); }, TypeError);
});

test("level 1's glade is data too: a leaf for every card, a rest for every pair, where Mosi stands, how the search view looks", () => {
  const { grid, nests, mosiSpot, gladeView, friends, gifts } = BERJALUNDUR;
  assert.equal(grid.columns * grid.rows, 2 * (friends.length + gifts.length), 'a hiding place for every card');
  assert.deepEqual([grid.columns, grid.rows, grid.across, grid.deep, grid.angle, ...grid.centre], [4, 3, 3, 3.6, Math.PI / 6, -5.2, 7.6]);
  assert.deepEqual(nests.map(rest => [...rest]), [[-.8, -.4], [2.2, 7.6], [-6.9, -1.25]]);
  assert.equal(nests.length, friends.length, 'a rest for every pair');
  assert.deepEqual({ ...mosiSpot }, { x: 3, z: 2.8, heading: 90 });
  assert.deepEqual([[...gladeView.landscape], [...gladeView.portrait]], [[.464, .375, .803], [.52, .8, -.3]]);
  assert.throws(() => { grid.across = 1; }, TypeError);
  assert.throws(() => { nests[0].push(1); }, TypeError);
});

test('a level has a world: level 1 loads, an unknown level does not', async () => {
  const { loadLevelWorld } = await import('../engine/memory/levels/worlds.js');
  assert.equal(typeof await loadLevelWorld('berjalundur'), 'function');
  await assert.rejects(() => loadLevelWorld('nope'), RangeError);
});

test("level 1's world answers the shared stage with every member the interface lists (levels/worlds.js)", async () => {
  const THREE = await import('three');
  const { createSceneRunner } = await import('../engine/memory/scenes.js');
  const { loadLevelWorld } = await import('../engine/memory/levels/worlds.js');
  const stage = { THREE, scene: new THREE.Scene(), params: new URLSearchParams(), level: BERJALUNDUR, nests: [], scenes: createSceneRunner(), fx: {}, mosi: {}, heightAt: () => 0, time: () => 0, reducedMotion: () => false };
  const world = (await loadLevelWorld('berjalundur'))(stage);
  const calls = ['build', 'cameraCue', 'getTargets', 'tapPoint', 'playStep', 'startFail', 'isBusy', 'setStepState', 'setReducedMotion', 'update', 'afterActors', 'updateMosi', 'pollEvents',
    'navObjects', 'mosiPlace', 'mosiObstacle', 'bindPair', 'ownsPair', 'pairCentre', 'hasTravelReservation', 'visited', 'nestSelectable', 'wet', 'wood', 'riverDistance', 'avoidIdle', 'getDebug', 'reset', 'dispose'];
  assert.deepEqual(calls.filter(name => typeof world[name] !== 'function'), []);
  assert.deepEqual(Object.keys(world.layout).sort(), ['dress', 'keepOut', 'lift', 'path'], 'what the forest is grown from');
  assert.ok(Array.isArray(world.overviewPoints) && world.overviewPoints.every(point => point.length === 3));
  for (const [x, z] of [[0, 0], [-5, 7], [4.5, -20]]) { const keep = world.layout.keepOut(x, z); assert.ok(keep >= 0 && keep <= 1, 'keepOut is 0 to 1'); assert.ok(Number.isFinite(world.layout.lift(x, z))); }
  // before the forest stands (build) nothing is busy, no obstacle shows, and Mosi stands at his spot in the glade
  assert.equal(world.isBusy(), false); assert.deepEqual(world.getTargets(), []); assert.deepEqual({ ...world.mosiPlace() }, { ...BERJALUNDUR.mosiSpot });
  assert.equal(world.mosiObstacle(), true);
  assert.equal(world.wet(0, 0), false, 'dry in the glade'); assert.equal(world.wood(0, 0), false);
});

test("level 1's flags are today's five fields, read off the done steps", () => {
  const flags = ids => BERJALUNDUR.flags(new Set(ids));
  assert.deepEqual(flags([]), { branch: 'down', bridgeBuilt: false, atStaging: false, boardwalkBuilt: false, visited: false });
  assert.deepEqual(flags(['lift']), { branch: 'held', bridgeBuilt: false, atStaging: false, boardwalkBuilt: false, visited: false });
  assert.deepEqual(flags(['lift', 'roll']), { branch: 'down', bridgeBuilt: true, atStaging: false, boardwalkBuilt: false, visited: false });
  assert.deepEqual(flags(['lift', 'roll', 'cross']), { branch: 'down', bridgeBuilt: true, atStaging: true, boardwalkBuilt: false, visited: false });
  assert.deepEqual(flags(['lift', 'roll', 'cross', 'lay']), { branch: 'down', bridgeBuilt: true, atStaging: true, boardwalkBuilt: true, visited: false });
  assert.deepEqual(flags(['lift', 'roll', 'cross', 'lay', 'finish']), { branch: 'down', bridgeBuilt: true, atStaging: true, boardwalkBuilt: true, visited: true });
});

test('level 1 is always unlocked, whatever storage holds or does when it is blocked', () => {
  for (const storage of [blockedStorage, memoryStorage(null), memoryStorage('not json'), memoryStorage('{"a":1}'), memoryStorage('[1,null,"nope"]'), {}, undefined]) {
    assert.deepEqual([...unlockedLevels(storage)], ['berjalundur']);
    assert.deepEqual([...chooseLevel(new URLSearchParams(''), storage).locked], ['steinagljufur'], 'level 2 is locked until level 1 has been finished');
  }
  assert.equal(unlockedLevels() instanceof Set, true, 'the default storage is localStorage behind a try/catch: no localStorage here, no crash');
});

test('unlocking a level is written as a JSON array of ids, and tells whether it was saved', () => {
  const storage = memoryStorage(null);
  assert.equal(unlockLevel('nope', storage), false, 'an unknown level is not stored'); assert.equal(storage.value, null);
  assert.equal(unlockLevel('berjalundur', storage), true); assert.deepEqual(JSON.parse(storage.value), ['berjalundur']);
  assert.equal(unlockLevel('berjalundur', storage), true); assert.deepEqual(JSON.parse(storage.value), ['berjalundur'], 'twice is once');
  assert.equal(unlockLevel('berjalundur', blockedStorage), false, 'storage that throws is a no, not a crash');
  assert.deepEqual([...unlockedLevels(storage)], ['berjalundur']);
});

test('«Nýtt!»: an open level other than level 1 is new until a round of it starts (minnisspil.played), and blocked storage is no crash', () => {
  const keys = {}, storage = { getItem: key => keys[key] ?? null, setItem(key, value) { keys[key] = value; } };
  const [one, two] = LEVELS;
  assert.equal(isNewLevel(one, new Set(), storage), false, 'level 1 is never new');
  assert.equal(isNewLevel(two, new Set([two.id]), storage), false, 'a locked level is not new');
  assert.equal(isNewLevel(two, new Set(), storage), true);
  assert.equal(markPlayed(two, storage), true); assert.deepEqual(JSON.parse(keys['minnisspil.played']), [two.id]);
  assert.equal(isNewLevel(two, new Set(), storage), false, 'played: not new any more');
  assert.equal(keys['minnisspil.unlocked'], undefined, 'the played key is its own, next to the unlocked one');
  assert.equal(markPlayed(two, blockedStorage), false); assert.equal(isNewLevel(two, new Set(), blockedStorage), true);
});

test('the juice pass: the page sounds are Litla Yatzy\'s, on the buttons and the picker, never on the finger or the repeat; the star, the basket and the end', () => {
  const game = readFileSync(new URL('../engine/memory/game.js', import.meta.url), 'utf8');
  assert.match(game, /import \{ createJuniorAudio \} from '\.\.\/yatzy-junior\/sounds\.js'/);
  const body = name => game.slice(game.indexOf(`function ${name}(`), game.indexOf('\n}', game.indexOf(`function ${name}(`)));
  for (const quiet of ['repeatMoment', 'refreshControls', 'sayAgain']) assert.ok(!body(quiet).includes('uiSound('), `${quiet} makes no page sound`);
  for (const [name, kind] of [['giftLanded', 'land'], ['landDot', 'pip'], ['setEnding', 'win'], ['pressMosi', 'tap'], ['tapFriend', 'tap']]) assert.ok(body(name).includes(`uiSound('${kind}'`), `${name} plays ${kind}`);
  assert.match(game, /if \(uiDucked !== voice\) \{ uiDucked = voice; ui\.duck\(voice\); \}/, 'the page sounds dip under his voice');
  const scenes = readFileSync(new URL('../engine/memory/scenes/first-minute.js', import.meta.url), 'utf8');
  assert.match(scenes, /say: 'match', sound: \{ name: 'star', nestIndex \}/, 'the star flies as Mosi claps at home');
});

test('choosing a level: level 1 by default, ?bord= by number, an unknown number falls back to level 1', () => {
  const storage = memoryStorage(null);
  for (const query of ['', 'bord=1', 'bord=3', 'bord=9', 'bord=abc', 'bord=0', 'bord=-1', 'bord=2.5', 'bord=']) {
    const choice = chooseLevel(new URLSearchParams(query), storage);
    assert.equal(choice.level, BERJALUNDUR, query); assert.equal(choice.locked instanceof Set, true);
  }
});

test("level 1's words are the markup's own words, on the new screen: the pause, Mosi to ask, the chip of pairs and gifts, nothing more", () => {
  const html = readFileSync(new URL('../minnisspil.html', import.meta.url), 'utf8');
  const { copy, friends, gifts } = BERJALUNDUR, { welcome, ending, loading, aria } = copy;
  const inMarkup = [
    '<h1 class="sr-only">Saman getum við það!</h1>', '<title>Saman getum við það! · Mosi</title>', 'aria-label="Saman getum við það! Minnisspil með Mosa"',
    `<h2>${welcome.title}</h2>`, `<p>${welcome.lines.join('<br>')}</p>`,
    `type="button">${welcome.start} <span aria-hidden="true">→</span></button>`,
    `<h2>${ending.title}</h2><p id="ending-copy">${ending.text}</p>`,
    `type="button">${ending.again} <span aria-hidden="true">↻</span></button>`,
    `<h2>${loading.title}</h2><p id="loading-copy">${loading.copy}</p>`,
    `id="targets" aria-label="${aria.targets}"`,
    `aria-label="0 af ${friends.length} pörum fundin" hidden><div class="nest-dots" aria-hidden="true">${'<i></i>'.repeat(friends.length)}</div></div>`,
    `aria-label="Karfan: 0 af ${gifts.length} fundið" hidden><span class="basket-icon" aria-hidden="true"></span><span id="basket-text" aria-hidden="true">0 / ${gifts.length}</span>`,
    '<button id="pause" class="round" type="button" aria-label="Gera hlé">',
    '<button id="mosi-help" class="mosi-help" type="button" aria-label="Spyrja Mosa">',
    '<h2>Mosi bíður.</h2>',
  ];
  for (const snippet of inMarkup) assert.ok(html.includes(snippet), snippet);
  // What left the screen (spec section 1, "Fer af skjánum"): the overview, sound and help buttons, the help card, the green ribbon with its trail, the small print.
  for (const gone of ['id="camera"', 'id="sound"', 'id="help"', 'help-dialog', 'overview-hint', 'adventure-ribbon', 'id="journey"', 'class="eyebrow"', 'class="fine"', 'class="speaker"', 'progress-text']) {
    assert.ok(!html.includes(gone), `no ${gone} on the new screen`);
  }
  // ... and the level fields only they read (levels/*.js).
  for (const level of LEVELS) {
    assert.deepEqual([level.ribbon, level.copy.help, level.copy.welcome.eyebrow, level.copy.welcome.fine, level.copy.ending.eyebrow, level.copy.aria.journey], Array(6).fill(undefined), level.id);
    assert.ok(level.steps.every(step => !('journey' in step)), `${level.id}: no step has a trail name`);
  }
  // The sound is never muted now: the old saved mute is forgotten at load (coach.js), and game.js has no mute of its own.
  const game = readFileSync(new URL('../engine/memory/game.js', import.meta.url), 'utf8');
  assert.match(game, /from '\.\/coach\.js'/); assert.match(game, /forgetOldMute\(/);
  assert.ok(!game.includes('setMute('), 'no mute'); assert.ok(!game.includes("'mosi.memory.muted.v1'"), "the old key is named in coach.js only");
  // Mosi's button and the repeat use the coach's rules (a search says `first`, the picker `who`); a restart forgets what he repeated.
  assert.match(game, /askLine\(\{/); assert.match(game, /repeatDue\(\{/); assert.match(game, /repeatedKey = null; voiceQuiet = 0;/);
  assert.match(game, /const MOMENT_KINDS = \{ search: 'first', choose: 'who' \};/);
  // His bubble has the words he says: the welcome and the match line.
  assert.match(game, /caption\(VOICE_LINES\[LINES\.welcome\]\.text, WELCOME_HOLD\)/); assert.match(game, /caption\(VOICE_LINES\.match\.text, 3\.4\)/); assert.ok(!game.includes('momentLast'), 'no reaction line is kept for the repeat');
});

// ---- level 2 and the lock ----

test('the lock survives a throwing storage: only level 1 is open, nothing is saved, and ?bord=2 still opens level 2', () => {
  assert.deepEqual([...unlockedLevels(blockedStorage)], ['berjalundur']);
  assert.equal(unlockLevel('steinagljufur', blockedStorage), false, 'storage that throws is a no, not a crash');
  const plain = chooseLevel(new URLSearchParams(''), blockedStorage);
  assert.equal(plain.level.id, 'berjalundur'); assert.deepEqual([...plain.locked], ['steinagljufur']);
  const asked = chooseLevel(new URLSearchParams('bord=2'), blockedStorage);
  assert.equal(asked.level.id, 'steinagljufur'); assert.equal(asked.level, STEINAGLJUFUR);
  assert.deepEqual([...asked.locked], [], 'the level asked for by number is not shown locked');
  assert.equal(chooseLevel(new URLSearchParams('bord=1'), blockedStorage).level, BERJALUNDUR);
});

test('unlocking is remembered: level 2 opens once level 1 has been finished and stays open', () => {
  const storage = memoryStorage(null);
  assert.deepEqual([...unlockedLevels(storage)], ['berjalundur']);
  assert.equal(unlockLevel('steinagljufur', storage), true);
  assert.deepEqual(JSON.parse(storage.value), ['steinagljufur']);
  assert.deepEqual([...unlockedLevels(storage)].sort(), ['berjalundur', 'steinagljufur']);
  const choice = chooseLevel(new URLSearchParams(''), storage);
  assert.equal(choice.level, BERJALUNDUR, 'the page still starts at level 1'); assert.deepEqual([...choice.locked], []);
  assert.equal(unlockLevel('berjalundur', storage), true); assert.deepEqual(JSON.parse(storage.value).sort(), ['berjalundur', 'steinagljufur'], 'the saved ids add up');
  // a second visit (a new reader of the same storage) sees it open
  assert.deepEqual([...unlockedLevels(memoryStorage(storage.value))].sort(), ['berjalundur', 'steinagljufur']);
});

test('finishing a level opens it and the next for good, and shows the next on this page even when storage does not take it', () => {
  // level 1 played to the end: level 2 is open now and next time
  const storage = memoryStorage(null), first = chooseLevel(new URLSearchParams(''), storage);
  assert.deepEqual([...first.locked], ['steinagljufur']);
  assert.equal(finishLevel(first.level, first.locked, storage), STEINAGLJUFUR, 'the next level');
  assert.deepEqual([...first.locked], [], "this page's ending card offers Steinagljúfrið");
  assert.deepEqual([...unlockedLevels(storage)].sort(), ['berjalundur', 'steinagljufur']);
  assert.deepEqual([...chooseLevel(new URLSearchParams(''), storage).locked], [], 'and a page opened later');
  // storage that throws (a private window): this page still offers level 2, a page opened later has it locked again, as the plan says
  const shut = chooseLevel(new URLSearchParams(''), blockedStorage);
  assert.equal(finishLevel(shut.level, shut.locked, blockedStorage), STEINAGLJUFUR);
  assert.deepEqual([...shut.locked], [], 'offered on this page without storage');
  assert.deepEqual([...chooseLevel(new URLSearchParams(''), blockedStorage).locked], ['steinagljufur'], 'locked again on the next page');
  // level 2 reached by ?bord=2 on a device where level 1 was never finished: played to the end, it is open on level 1's picker
  const direct = memoryStorage(null), second = chooseLevel(new URLSearchParams('bord=2'), direct);
  assert.equal(second.level, STEINAGLJUFUR); assert.equal(finishLevel(second.level, second.locked, direct), null, 'no level after the last');
  assert.deepEqual([...chooseLevel(new URLSearchParams(''), direct).locked], [], 'the level just finished does not show as locked');
});

test('an unknown ?bord falls back to level 1, and the known numbers pick their level', () => {
  const storage = memoryStorage(null);
  for (const query of ['bord=3', 'bord=9', 'bord=0', 'bord=-2', 'bord=abc', 'bord=2x', 'bord=1.5', 'bord=%20', 'x=2']) assert.equal(chooseLevel(new URLSearchParams(query), storage).level, BERJALUNDUR, query);
  assert.equal(chooseLevel(new URLSearchParams('bord=2'), storage).level, STEINAGLJUFUR);
  assert.equal(chooseLevel(new URLSearchParams('seed=7&bord=2'), storage).level, STEINAGLJUFUR);
  assert.equal(chooseLevel(null, storage).level, BERJALUNDUR); assert.equal(chooseLevel(undefined, storage).level, BERJALUNDUR);
});

test('level 2 deals 16 cards with four fossil pairs and the baby Flugeðla among the four friend pairs, and is won with the last pair', () => {
  const { friends, gifts } = STEINAGLJUFUR;
  assert.deepEqual([...friends], ['triceratops', 'stegosaurus', 'brontosaurus', 'pteranodon']);
  assert.deepEqual([...gifts], ['ammonite', 'trilobite', 'fern', 'footprint']);
  const game = createMemoryGame({ random: () => 0.999, species: friends, gifts });
  const cards = game.getState().cards;
  assert.equal(cards.length, 16); assert.equal(new Set(cards.map(card => card.id)).size, 16);
  for (const name of friends) assert.equal(cards.filter(card => card.species === name).length, 2, `two leaves hide ${name}`);
  for (const item of gifts) assert.equal(cards.filter(card => card.item === item).length, 2, `two leaves hide the ${item}`);
  assert.equal(cards.filter(card => card.species === null).length, 8, 'eight fossil leaves');
  assert.equal(cards.filter(card => card.species === 'pteranodon').length, 2);
  invariant(game);
  for (const [nestIndex, species] of friends.entries()) {
    const ids = pairIds(game, species);
    assert.deepEqual(revealTwo(game, ...ids), [{ type: 'match', ids, species, nestIndex }]);
    game.advance(1); invariant(game);
  }
  for (const [giftIndex, item] of gifts.entries()) {
    const ids = game.getState().cards.filter(card => card.item === item).map(card => card.id);
    assert.deepEqual(revealTwo(game, ...ids), [{ type: 'gift', ids, item, giftIndex }]);
    assert.deepEqual(game.advance(1), giftIndex === 3 ? [{ type: 'won', ids: [...Array(16).keys()] }] : []);
  }
  assert.equal(game.getState().phase, 'won'); assert.deepEqual([...game.getState().found], ['ammonite', 'trilobite', 'fern', 'footprint']);
});

test('level 2 is described as frozen data: its steps, its pairs, its glade and its words', () => {
  const level = STEINAGLJUFUR;
  assert.equal(level.number, 2); assert.equal(level.title, 'Steinagljúfrið');
  assert.equal(levelById('steinagljufur'), level); assert.equal(levelNumber(2), level);
  assert.deepEqual(level.steps.map(step => [step.id, step.kind, step.target]), [['light', 'task', 'tunnel'], ['headbutt', 'task', 'rocks'], ['through', 'travel', 'tunnelExit'], ['reach', 'task', 'ledge'], ['fly', 'task', 'cliff'], ['climb', 'travel', 'clifftop'], ['pull', 'together', 'trunk'], ['walk', 'travel', 'sunLedge']]);
  assert.deepEqual(level.steps.filter(step => step.species).map(step => [step.id, step.species]), [['light', 'stegosaurus'], ['headbutt', 'triceratops'], ['reach', 'brontosaurus'], ['fly', 'pteranodon']]);
  assert.equal(level.steps[0].holds, 'through');
  assert.deepEqual(level.steps.find(step => step.id === 'headbutt').beatWords, ['Einn!', 'Tveir!', 'BÚMM!']);
  assert.deepEqual(level.steps.find(step => step.id === 'pull').beatWords, ['Einn!', 'Tveir!', 'TOGA!']);
  const through = level.steps.find(step => step.id === 'through');
  assert.deepEqual([through.needsAllFound, through.waitsForGifts, through.automatic], [true, true, true]);
  // the grid has a leaf for every card, a rest for every pair
  const { grid, nests, mosiSpot, gladeView, friends, gifts } = level;
  assert.equal(grid.columns * grid.rows, 2 * (friends.length + gifts.length)); assert.deepEqual([grid.columns, grid.rows], [4, 4]);
  assert.equal(nests.length, friends.length); assert.ok(Number.isFinite(mosiSpot.x + mosiSpot.z + mosiSpot.heading));
  assert.ok(gladeView.landscape.length === 3 && gladeView.portrait.length === 3);
  assert.deepEqual(Object.keys(level.roster).sort(), [...friends].sort()); assert.deepEqual(Object.keys(level.pairs).sort(), [...friends].sort());
  assert.throws(() => { level.steps[0].target = 'changed'; }, TypeError); assert.throws(() => { level.friends.push('x'); }, TypeError);
  // every key of the story is level 2's own (g2-), and no two moments share one
  const keys = [...Object.values(level.story.common).filter(value => typeof value === 'string'), ...level.steps.flatMap(step => ['doing', 'ready', 'arriving', 'find', 'open', 'gather', 'gifts', 'landing'].map(name => level.story[step.id][name]).filter(Boolean))];
  assert.ok(keys.length > 20); assert.ok(keys.every(key => key.startsWith('g2-')), keys.filter(key => !key.startsWith('g2-')).join());
  assert.equal(new Set(keys).size, keys.length, 'a key says one moment');
  // the words the search says: a task's find prompt, the wait for the fossils
  assert.equal(level.story.light.find, 'g2-find-glowers'); assert.equal(level.story.light.ready, 'g2-light-ready');
  assert.deepEqual(level.steps.filter(step => step.kind === 'task').map(step => level.story[step.id].prompts.find.startsWith('Finnum vin sem getur ')), [true, true, true, true]);
  assert.equal(level.story.through.prompts.gifts, 'Finnum fyrst það sem er eftir undir laufunum!');
  // the flags read the done steps, and the ladder reads back from them
  const flags = ids => level.flags(new Set(ids));
  assert.ok(Object.values(flags([])).every(value => value === false));
  const all = level.steps.map(step => step.id);
  for (let n = 0; n <= all.length; n++) assert.deepEqual(level.doneFrom(flags(all.slice(0, n))), all.slice(0, n), `${n} steps done`);
  assert.ok(level.steps.every(step => level.targets[step.target]?.label), 'every obstacle has an accessible name');
  assert.equal(level.music({}), 'glade');
});

test("level 2's world loads and answers the shared stage with every member the interface requires; it stands nothing before it is built and starts no step", async () => {
  const THREE = await import('three');
  const { createSceneRunner } = await import('../engine/memory/scenes.js');
  const { loadLevelWorld } = await import('../engine/memory/levels/worlds.js');
  const { frameOf, outside, closure, FLOOR } = await import('../engine/memory/levels/steinagljufur/ground.js');
  const stage = { THREE, scene: new THREE.Scene(), params: new URLSearchParams(), level: STEINAGLJUFUR, nests: [], scenes: createSceneRunner(), fx: {}, mosi: {}, heightAt: () => 0, time: () => 0, reducedMotion: () => false, leaves: [], onLeafGround: () => false };
  const world = (await loadLevelWorld('steinagljufur'))(stage);
  const required = ['build', 'cameraCue', 'getTargets', 'tapPoint', 'playStep', 'startFail', 'isBusy', 'setStepState', 'setReducedMotion', 'update', 'afterActors', 'pollEvents',
    'navObjects', 'mosiPlace', 'mosiObstacle', 'bindPair', 'ownsPair', 'pairCentre', 'hasTravelReservation', 'visited', 'nestSelectable', 'avoidIdle', 'getDebug', 'reset', 'dispose'];
  assert.deepEqual(required.filter(name => typeof world[name] !== 'function'), []);
  assert.deepEqual(['keepOut', 'lift', 'dress', 'path', 'clearing', 'farRings'].filter(key => !(key in world.layout)), [], 'what the forest is grown from');
  assert.ok(Array.isArray(world.overviewPoints) && world.overviewPoints.every(point => point.length === 3));
  // Nothing grows by itself in a gorge; the floor is flat and the ground climbs behind the back and the left walls, not on the open side.
  const frame = frameOf(STEINAGLJUFUR.grid), at = (u, v) => frame.toWorld(u, v);
  for (const [u, v] of [[0, 0], [-20, 5], [30, 30]]) assert.equal(world.layout.keepOut(...at(u, v)), 1);
  assert.equal(world.layout.lift(...at(0, 0)), 0); assert.equal(world.layout.lift(...at(5, -5)), 0, 'the floor is flat');
  assert.ok(world.layout.lift(...at(0, 30)) > 8, 'the plateau behind the back wall'); assert.ok(world.layout.lift(...at(-30, 0)) > 8, 'and behind the left wall');
  assert.ok(world.layout.lift(...at(8, -40)) < 1.5, 'the open side stays open');
  // Before build(): no obstacle, nothing busy, no step starts, Mosi is at his spot and the friends keep clear of him.
  assert.deepEqual(world.getTargets(), []); assert.equal(world.isBusy(), false);
  for (const id of STEINAGLJUFUR.steps.map(step => step.id)) assert.equal(world.playStep(id), null, `${id} is not built yet`);
  assert.equal(world.startFail('triceratops', 'tunnel'), false); assert.deepEqual(world.pollEvents(), []);
  assert.deepEqual({ ...world.mosiPlace() }, { ...STEINAGLJUFUR.mosiSpot }); assert.equal(world.mosiObstacle(), true);
  assert.equal(world.nestSelectable('triceratops'), true); world.setStepState({ selected: 'triceratops' }); assert.equal(world.nestSelectable('triceratops'), false); world.reset();
  // The walls stand outside the floor: a friend does not play at their foot, and may in the middle.
  assert.equal(world.avoidIdle(...at(0, 0)), null); assert.equal(world.avoidIdle(...at(FLOOR.half[0] + 2, 0)), 'wall');
  // The glade's frame: the grid's (u, v) and the world's (x, z) turn into one another, and the description puts everything on the floor.
  for (const [u, v] of [[0, 0], [3.5, -2], [-8, 7]]) { const [x, z] = frame.toWorld(u, v), [u2, v2] = frame.toGrid(x, z); assert.ok(Math.hypot(u - u2, v - v2) < 1e-9); }
  const grid = STEINAGLJUFUR.grid, cells = [];
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.columns; col++) cells.push([(col - (grid.columns - 1) / 2) * grid.across, -((row - (grid.rows - 1) / 2) * grid.deep)]);
  const onFloor = (x, z, margin) => outside(...frame.toGrid(x, z)) < -margin;
  for (const [index, [x, z]] of STEINAGLJUFUR.nests.entries()) {
    assert.ok(onFloor(x, z, 3), `the rest of pair ${index} is well inside the floor`);
    const [u, v] = frame.toGrid(x, z);
    assert.ok(cells.every(([cu, cv]) => Math.hypot(u - cu, v - cv) > 4), `the rest of pair ${index} is clear of the leaves`);
  }
  assert.ok(onFloor(STEINAGLJUFUR.mosiSpot.x, STEINAGLJUFUR.mosiSpot.z, 1.5), 'Mosi stands on the floor');
  assert.ok(closure(0, 20) > .99 && closure(-20, 0) > .99, 'the back and the left are walls'); assert.ok(closure(0, -20) < .01 && closure(20, 0) < .2, 'the front and the right are open');
  // The dressing keeps off the rests, Mosi and the leaves it is told to avoid, and names only plants the forest has.
  const plants = world.layout.dress({ avoid: () => false });
  assert.ok(plants.length > 20 && plants.every(plant => ['rock', 'rockSmall', 'fern', 'cycad', 'treeFern'].includes(plant.name) && plant.scale > 0));
  assert.ok(plants.every(plant => STEINAGLJUFUR.nests.every(([nx, nz]) => Math.hypot(plant.position[0] - nx, plant.position[1] - nz) >= 3.4)), 'nothing grows in a pair\'s rest');
  assert.ok(plants.every(plant => Math.hypot(plant.position[0] - STEINAGLJUFUR.mosiSpot.x, plant.position[1] - STEINAGLJUFUR.mosiSpot.z) >= 3.6), 'nothing grows where Mosi stands');
});

test("the welcome card has the level picker: a card for each level with its picture, the lock's words and the start button in focus", async () => {
  const html = readFileSync(new URL('../minnisspil.html', import.meta.url), 'utf8'), { existsSync } = await import('node:fs');
  assert.ok(html.includes('<div id="level-cards" class="level-cards" role="group" aria-label="Veldu borð"></div>'), 'the cards are made from LEVELS by game.js into this');
  assert.ok(html.includes('<button id="start" class="primary" autofocus type="button">'), 'the dialog opens with the start button in focus, not the first card');
  assert.ok(!html.includes('intro-pairs'), "level 1's three badges are not on the card of the other level");
  for (const level of LEVELS) assert.ok(existsSync(new URL(`../assets/memory/levels/${level.id}.webp`, import.meta.url)), `${level.id}: the picture of its world`);
  assert.equal(STEINAGLJUFUR.copy.locked, 'Kláraðu Berjalundinn fyrst'); assert.equal(BERJALUNDUR.copy.locked, undefined, 'level 1 is never locked');
  const game = readFileSync(new URL('../engine/memory/game.js', import.meta.url), 'utf8');
  // (what finishing does is finishLevel's, tested above; here only that the win calls it, unconditionally, and refreshes the picker and the ending card)
  assert.match(game, /function unlockNext\(\) \{ finishLevel\(level, locked\); reflectPicker\(\); \}/, 'a level finished opens itself and the next');
  assert.match(game, /celebrated = true; world\.celebrate\(\); audio\.win\(\); unlockNext\(\);/, 'at the win');
  assert.match(game, /aria-disabled/); assert.match(game, /dataset\.level/);
});

test('Mosi\'s ask and repeat rules (coach)', async () => {
  const { IDLE_HINT, IDLE_REPEAT, OLD_MUTE_KEY, forgetOldMute, momentLine, askLine, repeatDue } = await import('../engine/memory/coach.js');
  const { VOICE_LINES } = await import('../engine/memory/voice-lines.js');
  assert.equal(IDLE_HINT, 4); assert.equal(IDLE_REPEAT, 10);
  const store = new Map([[OLD_MUTE_KEY, 'true'], ['other', '1']]);
  forgetOldMute({ removeItem: key => store.delete(key) });
  assert.equal(store.has(OLD_MUTE_KEY), false); assert.equal(store.get('other'), '1');
  assert.doesNotThrow(() => forgetOldMute(null)); assert.doesNotThrow(() => forgetOldMute(undefined));
  assert.doesNotThrow(() => forgetOldMute({ removeItem() { throw new Error('blocked'); } }));
  // The instruction of the moment: its own line, else its kind's (a search says `first`), never the last line he said (a match, a gift...).
  const kinds = { search: 'first', choose: 'who' };
  assert.equal(momentLine({ key: 'g2-light-ready', kind: 'work', voice: { 'g2-light-ready': 'g2_light_ready' }, kinds }), 'g2_light_ready');
  assert.equal(momentLine({ key: 'find-friends', kind: 'search', kinds }), 'first');
  assert.equal(momentLine({ key: 'gifts-left', kind: 'search', voice: { 'gifts-left': 'giftsLeft' }, kinds }), 'giftsLeft', 'its own line first');
  assert.equal(momentLine({ key: 'lift-ready', kind: 'work', voice: {}, kinds }), null, 'a wait with no line of its own: the repeat says nothing');
  // Level 1's three waits have their lines (the owner's yes of 2026-11-08), and their words are the moments' prompts.
  assert.deepEqual({ ...BERJALUNDUR.voice }, { 'lift-ready': 'lift_ready', 'roll-ready': 'roll_ready', 'lay-ready': 'lay_ready' });
  for (const [key, id] of Object.entries(BERJALUNDUR.voice)) {
    const step = BERJALUNDUR.steps.find(item => BERJALUNDUR.story[item.id]?.ready === key);
    assert.equal(VOICE_LINES[id]?.text, BERJALUNDUR.story[step.id].prompts.ready, `${key}: Mosi says what his bubble says`);
    assert.equal(momentLine({ key, kind: 'work', voice: BERJALUNDUR.voice, kinds }), id, `${key}: the repeat and the button say ${id}`);
  }
  assert.equal(momentLine({ key: 'b' }), null);
  assert.equal(askLine({ key: 'a', kind: 'search', kinds, speaking: true }), null);
  assert.equal(askLine({ key: 'a', kind: 'search', kinds, busy: true }), null);
  assert.equal(askLine({ key: 'lift-ready', kind: 'work', kinds, help: 'help' }), 'help', 'a moment with no line: the help line');
  assert.equal(askLine({ key: 'who-branch', kind: 'choose', kinds, help: 'help' }), 'who');
  assert.equal(askLine({ key: 'b' }), null);
  const due = { idle: 10, key: 'a', repeated: null, mayAct: true, speaking: false, line: 'who' };
  assert.equal(repeatDue({ ...due, idle: 9.9 }), false);
  assert.equal(repeatDue(due), true);
  assert.equal(repeatDue({ ...due, repeated: 'a' }), false);
  assert.equal(repeatDue({ ...due, speaking: true }), false);
  assert.equal(repeatDue({ ...due, line: null }), false);
  assert.equal(repeatDue({ ...due, mayAct: false }), false);
});
