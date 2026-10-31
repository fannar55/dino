import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMemoryGame } from '../engine/memory/rules.js';
import { LEVELS, levelById, levelNumber, unlockedLevels, unlockLevel, chooseLevel } from '../engine/memory/levels/index.js';
import { BERJALUNDUR } from '../engine/memory/levels/berjalundur.js';

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
  assert.deepEqual(LEVELS.map(level => level.id), ['berjalundur']);
  assert.equal(levelById('berjalundur'), BERJALUNDUR); assert.equal(levelById('nope'), null);
  assert.equal(levelNumber(1), BERJALUNDUR); assert.equal(levelNumber(9), null);
  assert.equal(BERJALUNDUR.number, 1); assert.equal(BERJALUNDUR.title, 'Berjalundurinn'); assert.equal(BERJALUNDUR.ribbon, 'Leiðin að berjalundinum');
  assert.deepEqual([...BERJALUNDUR.friends], ['triceratops', 'stegosaurus', 'brontosaurus']);
  assert.deepEqual([...BERJALUNDUR.gifts], ['shrew', 'hermitCrab', 'crab']);
  assert.deepEqual(BERJALUNDUR.steps.map(step => [step.id, step.kind, step.target]), [['lift', 'task', 'branch'], ['roll', 'task', 'log'], ['cross', 'travel', 'staging'], ['lay', 'task', 'bark'], ['finish', 'travel', 'grove']]);
  assert.deepEqual(BERJALUNDUR.steps.filter(step => step.species).map(step => [step.id, step.species]), [['lift', 'brontosaurus'], ['roll', 'triceratops'], ['lay', 'stegosaurus']]);
  assert.equal(BERJALUNDUR.steps[0].holds, 'roll');
  assert.deepEqual(BERJALUNDUR.steps.find(step => step.id === 'roll').beatWords, ['Einn!', 'Tveir!', 'ÝTA!']);
  assert.deepEqual(BERJALUNDUR.steps.find(step => step.id === 'lay').beatWords, ['Ein!', 'Tvær!', 'Þrjár!']);
  assert.deepEqual(BERJALUNDUR.steps.filter(step => step.journey).map(step => step.journey), ['Lyfta grein', 'Gera trjábrú', 'Leggja gönguleið']);
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
    assert.deepEqual([...chooseLevel(new URLSearchParams(''), storage).locked], []);
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

test('choosing a level: level 1 by default, ?bord= by number, an unknown number falls back to level 1', () => {
  const storage = memoryStorage(null);
  for (const query of ['', 'bord=1', 'bord=9', 'bord=abc', 'bord=0', 'bord=-1']) {
    const choice = chooseLevel(new URLSearchParams(query), storage);
    assert.equal(choice.level, BERJALUNDUR, query); assert.equal(choice.locked instanceof Set, true);
  }
});

test("level 1's words are the markup's own words: the first paint stays as it was", () => {
  const html = readFileSync(new URL('../minnisspil.html', import.meta.url), 'utf8');
  const { copy, ribbon, friends, gifts } = BERJALUNDUR, { welcome, ending, help, loading, aria } = copy;
  const inMarkup = [
    `<h1>Hvar er vinur minn?</h1><span>${ribbon}</span>`,
    `<span class="eyebrow">${welcome.eyebrow}</span><h2>${welcome.title}</h2>`, `<p>${welcome.lines.join('<br>')}</p>`,
    `type="button">${welcome.start} <span aria-hidden="true">→</span></button>`, `<p class="fine">${welcome.fine}</p>`,
    `<span class="eyebrow">${help.eyebrow}</span><h2>${help.title}</h2>`, `<ol>${help.items.map(item => `<li>${item}</li>`).join('')}</ol>`,
    `<p>${help.note}</p>`, `data-resume type="button">${help.resume}</button>`,
    `<span class="eyebrow">${ending.eyebrow}</span><h2>${ending.title}</h2><p id="ending-copy">${ending.text}</p>`,
    `type="button">${ending.again} <span aria-hidden="true">↻</span></button>`,
    `<h2>${loading.title}</h2><p id="loading-copy">${loading.copy}</p>`,
    `id="targets" aria-label="${aria.targets}"`, `id="journey" class="journey" aria-label="${aria.journey}"`,
    `aria-label="0 af ${friends.length} pörum fundin" hidden><div class="nest-dots" aria-hidden="true">${'<i></i>'.repeat(friends.length)}</div><span id="progress-text">0 / ${friends.length} pör</span>`,
    `aria-label="Karfan: 0 af ${gifts.length} fundið" hidden><span class="basket-icon" aria-hidden="true"></span><span id="basket-text" aria-hidden="true">0 / ${gifts.length}</span>`,
    ...BERJALUNDUR.steps.filter(step => step.journey).map(step => `<li data-step="${step.id}">`),
  ];
  for (const snippet of inMarkup) assert.ok(html.includes(snippet), snippet);
});
