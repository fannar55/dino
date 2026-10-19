// "Háls og hali": the rules, ported from Codex's board-rules tests, and the fossil collection. The only test file of the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../engine/random.js';
import { createSave } from '../engine/save.js';
import {
  BOARD, DINOSAURS, SHORTCUTS, SPECIAL_TILES, FOSSIL_KINDS, FOSSIL_SQUARES,
  tileNumber, tilePosition, resolveTurn, createGame, applyTurn, validateGame, placeFossils,
} from '../engine/hals/rules.js';

test('80 squares form one continuous serpentine board with an adjacent start', () => {
  const numbers = [];
  for (let row = 0; row < BOARD.rows; row++) {
    for (let column = 0; column < BOARD.columns; column++) {
      const number = tileNumber(row, column);
      numbers.push(number);
      assert.deepEqual(tilePosition(number), { x: (column - 7.5) * 2.3, y: row * 5.5, z: 0 });
    }
  }
  assert.deepEqual([...numbers].sort((a, b) => a - b), Array.from({ length: 80 }, (_, i) => i + 1));
  assert.deepEqual([tileNumber(0, 0), tileNumber(0, 15), tileNumber(1, 0), tileNumber(1, 15), tileNumber(4, 0), tileNumber(4, 15)], [1, 16, 32, 17, 65, 80]);
  for (let number = 0; number < 80; number++) {
    const a = tilePosition(number), b = tilePosition(number + 1);
    const dx = Math.abs(b.x - a.x), dy = b.y - a.y;
    assert.ok((Math.abs(dx - 2.3) < 1e-10 && dy === 0) || (dx === 0 && dy === 5.5), `${number} to ${number + 1} must be adjacent`);
  }
});

test('six dinosaurs own five upward necks and five downward tails with distinct endpoints', () => {
  assert.equal(DINOSAURS.length, 6);
  assert.equal(SHORTCUTS.length, 10);
  assert.equal(new Set(SHORTCUTS.flatMap(s => [s.from, s.to])).size, 20);
  for (const dinosaur of DINOSAURS) {
    assert.ok([1, -1].includes(dinosaur.facing));
    for (const type of ['neck', 'tail']) {
      const shortcut = SHORTCUTS.find(s => s.dinosaur === dinosaur.id && s.type === type);
      if (!dinosaur[type]) {
        assert.equal(shortcut, undefined, 'An inactive body part cannot become a shortcut');
        continue;
      }
      assert.deepEqual({ from: shortcut.from, to: shortcut.to }, dinosaur[type]);
      assert.equal(shortcut.type === 'neck', shortcut.to > shortcut.from);
      assert.equal(shortcut.type === 'neck', tilePosition(shortcut.to).y > tilePosition(shortcut.from).y);
      assert.ok(!SHORTCUTS.some(s => s.from === shortcut.to), 'A ride must end on an ordinary square');
    }
  }
  assert.deepEqual(SHORTCUTS.filter(s => s.type === 'neck').map(s => [s.from, s.to]), [[25, 56], [21, 44], [57, 72], [53, 76], [4, 29]]);
  assert.deepEqual(SHORTCUTS.filter(s => s.type === 'tail').map(s => [s.from, s.to]), [[28, 6], [18, 14], [60, 38], [50, 46], [74, 42]]);
});

test('neck and tail rides activate only on the dice landing, with every walking step retained', () => {
  for (const shortcut of SHORTCUTS) {
    const landing = resolveTurn(shortcut.from - 3, 3);
    assert.deepEqual(landing.steps, [shortcut.from - 2, shortcut.from - 1, shortcut.from]);
    assert.equal(landing.landed, shortcut.from);
    assert.equal(landing.shortcut, shortcut);
    assert.equal(landing.destination, shortcut.to);
    const passing = resolveTurn(shortcut.from - 1, 2);
    assert.equal(passing.shortcut, null);
    assert.equal(passing.destination, shortcut.from + 1);
  }
  assert.deepEqual(resolveTurn(0, 1), { from: 0, roll: 1, steps: [1], landed: 1, shortcut: null, event: null, destination: 1, won: false });
});

test('a roll too high for the finish still wins, and every position has a route to the finish', () => {
  assert.deepEqual(resolveTurn(78, 6), { from: 78, roll: 6, steps: [79, 80], landed: 80, shortcut: null, event: null, destination: 80, won: true });
  assert.equal(resolveTurn(74, 6).won, true);
  assert.deepEqual(resolveTurn(80, 1).steps, []);

  for (const mode of ['classic', 'adventure']) {
    const routesToFinish = new Set([80]);
    for (let changed = true; changed;) {
      changed = false;
      for (let from = 0; from <= BOARD.count; from++) {
        for (let roll = 1; roll <= 6; roll++) {
          const turn = resolveTurn(from, roll, { mode });
          assert.ok(turn.destination >= 1 && turn.destination <= 80);
          assert.equal(turn.steps.length, Math.min(roll, 80 - from));
          assert.equal(turn.won, turn.destination === 80);
          if (routesToFinish.has(turn.destination) && !routesToFinish.has(from)) { routesToFinish.add(from); changed = true; }
        }
      }
    }
    assert.equal(routesToFinish.size, 81, `${mode}: no square traps a player in a closed loop`);
  }
});

test('adventure events happen only on the landing square, in adventure mode, and never on a route', () => {
  assert.deepEqual(SPECIAL_TILES.map(e => e.type), ['firefly', 'firefly', 'firefly', 'firefly', 'mud', 'mud', 'fossil', 'fossil', 'fossil', 'fossil']);
  const routeSquares = new Set(SHORTCUTS.flatMap(s => [s.from, s.to]));
  for (const event of SPECIAL_TILES) {
    assert.ok(!routeSquares.has(event.from), `event ${event.from} is not on a route`);
    assert.ok(!SHORTCUTS.some(s => s.from === event.to), 'an event never carries a pawn onto a neck or a tail');
    const landing = resolveTurn(event.from - 1, 1, { mode: 'adventure' });
    assert.equal(landing.event, event);
    assert.equal(landing.destination, event.to);
    assert.equal(resolveTurn(event.from - 1, 1).event, null, 'classic mode has no events');
    assert.equal(resolveTurn(event.from - 2, 3, { mode: 'adventure' }).event, null, 'passing over does nothing');
  }
  assert.equal(resolveTurn(8, 1, { mode: 'adventure' }).destination, 11, 'fireflies carry the pawn 2 on');
  const mud = resolveTurn(46, 1, { mode: 'adventure' });
  assert.deepEqual([mud.event.type, mud.destination], ['mud', 45], 'mud sets it 2 back, onto a fossil square that does not trigger in the same turn');
  assert.throws(() => resolveTurn(0, 1, { mode: 'hard' }), RangeError);
});

test('malformed indices, dice and settings fail before entering game state', () => {
  for (const invalid of [-1, 81, 1.5, NaN, Infinity, '1', null, undefined]) {
    assert.throws(() => tilePosition(invalid), RangeError);
    assert.throws(() => resolveTurn(invalid, 1), RangeError);
  }
  for (const invalid of [0, 7, -1, 1.5, NaN, '6', null, undefined]) assert.throws(() => resolveTurn(0, invalid), RangeError);
  assert.throws(() => tileNumber(-1, 0), RangeError);
  assert.throws(() => tileNumber(5, 0), RangeError);
  assert.throws(() => tileNumber(0, 16), RangeError);
  for (const playerCount of [0, 5, 1.5, '2', NaN]) assert.throws(() => createGame({ playerCount }), RangeError);
  assert.throws(() => createGame({ vsComputer: 1 }), TypeError);
  assert.throws(() => createGame({ playerCount: 1, vsComputer: true }), RangeError);
});

test('players take turns, a six gives no extra roll, and a win freezes the game', () => {
  let state = createGame({ playerCount: 4, vsComputer: true });
  assert.deepEqual(state.players.map(p => p.isComputer), [false, false, false, true]);
  for (let player = 0; player < 4; player++) {
    const prior = state;
    const snapshot = JSON.stringify(prior);
    state = applyTurn(state, 6);
    assert.equal(state.lastTurn.player, player);
    assert.equal(state.players[player].position, 6);
    assert.equal(state.currentPlayer, (player + 1) % 4);
    assert.equal(state.turnCount, player + 1);
    assert.equal(JSON.stringify(prior), snapshot, 'the game that went in is left alone');
    assert.equal(validateGame(JSON.parse(JSON.stringify(state))), true);
  }
  assert.equal(applyTurn(createGame({ playerCount: 1 }), 3).currentPlayer, 0, 'a solo player goes again');

  const initial = createGame();
  initial.players[0].position = 79;
  const won = applyTurn(initial, 5);
  assert.equal(won.winner, 0);
  assert.equal(won.currentPlayer, 0);
  assert.equal(won.players[0].position, 80);
  assert.equal(won.lastTurn.won, true);
  assert.equal(applyTurn(won, 6), won, 'later rolls move nobody');
  assert.equal(won.turnCount, 1);
});

test('saved state validation rejects impossible or unfinished states, and accepts older ones', () => {
  assert.equal(createGame().version, 1);
  const legacy = createGame(); delete legacy.version; delete legacy.fossilKinds;
  assert.equal(validateGame(legacy), true, 'a game from before the version or the fossil kinds still loads');
  assert.throws(() => validateGame({ ...createGame(), version: 2 }), RangeError);
  assert.throws(() => validateGame(null), TypeError);
  const bad = change => { const game = createGame(); change(game); return game; };
  assert.throws(() => validateGame(bad(g => { g.players[0].position = 81; })), RangeError);
  assert.throws(() => validateGame(bad(g => { g.players[1].id = 0; })), TypeError);
  assert.throws(() => validateGame(bad(g => { g.currentPlayer = 2; })), RangeError);
  assert.throws(() => validateGame(bad(g => { g.players[0].position = 80; })), RangeError);
  assert.throws(() => validateGame(bad(g => { g.winner = 1; })), RangeError);
  assert.throws(() => validateGame(bad(g => { g.players[0].fossils = [8]; })), RangeError);
  assert.throws(() => validateGame(bad(g => { g.fossilKinds = { 8: 'tooth' }; })), RangeError);
  assert.throws(() => validateGame(bad(g => { g.fossilKinds = { 7: 'dragon' }; })), RangeError);
  assert.throws(() => validateGame(bad(g => { g.fossilKinds = { 7: 'tooth', 32: 'tooth' }; })), RangeError);
});

test('every game puts four different kinds of the eight on the fossil squares, and a find names its kind', () => {
  assert.equal(FOSSIL_KINDS.length, 8);
  assert.equal(new Set(FOSSIL_KINDS.map(k => k.id)).size, 8);
  assert.deepEqual(FOSSIL_SQUARES, [7, 32, 45, 67]);
  const seen = new Set();
  for (let seed = 0; seed < 30; seed++) {
    const placed = placeFossils(seededRandom(`hals-${seed}`));
    assert.deepEqual(Object.keys(placed).map(Number), FOSSIL_SQUARES);
    assert.equal(new Set(Object.values(placed)).size, 4);
    Object.values(placed).forEach(kind => { assert.ok(FOSSIL_KINDS.some(k => k.id === kind)); seen.add(kind); });
  }
  assert.equal(seen.size, 8, 'across games every kind turns up');
  assert.deepEqual(placeFossils(seededRandom('same')), placeFossils(seededRandom('same')), 'a seed places the same kinds');

  const game = createGame({ mode: 'adventure', random: seededRandom('find') });
  game.players[0].position = 6;
  const found = applyTurn(game, 1);
  assert.equal(found.lastTurn.newFossil, true);
  assert.equal(found.lastTurn.fossil, game.fossilKinds[7]);
  assert.deepEqual(found.players[0].fossils, [7]);
  assert.equal(applyTurn({ ...found, currentPlayer: 0, players: found.players.map((p, i) => i ? p : { ...p, position: 6 }) }, 1).lastTurn.newFossil, false, 'the same square twice is no new find');
  assert.equal(applyTurn({ ...game, mode: 'classic' }, 1).lastTurn.fossil, null, 'classic mode finds nothing');
  assert.equal(applyTurn(createGame(), 1).lastTurn.fossil, null, 'a plain square finds nothing');
});

test('the fossil collection is kept in the save, once each, and an older save still loads', () => {
  const files = new Map();
  const storage = { getItem: k => files.get(k) ?? null, setItem: (k, v) => files.set(k, v) };

  const old = JSON.stringify({ stars: ['k1_kambedla'], findings: ['beetle'], seen: ['mosi'] });
  files.set('mosi-remake-v1', old);
  const before = createSave(storage);
  assert.deepEqual(before.getHals(), { found: [] }, 'a save from before the fossils has none');
  assert.deepEqual(before.get(), { stars: ['k1_kambedla'], findings: ['beetle'], seen: ['mosi'] });
  assert.equal(files.get('mosi-remake-v1'), old, 'and reading it stores nothing new');

  assert.equal(before.addHalsFound('tooth'), true);
  assert.equal(before.addHalsFound('tooth'), false, 'a kind counts once');
  assert.equal(before.addHalsFound('egg'), true);
  assert.throws(() => before.addHalsFound(''), TypeError);
  assert.deepEqual(JSON.parse(files.get('mosi-remake-v1')).hals, { found: ['tooth', 'egg'] });
  assert.deepEqual(createSave(storage).getHals(), { found: ['tooth', 'egg'] }, 'the next visit has them');
  assert.deepEqual(createSave(storage).get().stars, ['k1_kambedla'], 'the rest is kept');
  assert.deepEqual(createSave(null).getHals(), { found: [] }, 'without storage it still works');
});

test('the game under way and the intro are kept beside the collection, and forgotten when asked', () => {
  const files = new Map();
  const storage = { getItem: k => files.get(k) ?? null, setItem: (k, v) => files.set(k, v) };
  const save = createSave(storage);
  assert.deepEqual(save.getHalsPlay(), { game: null, intro: false, hello: false }, 'nothing at first');
  const game = applyTurn(createGame({ playerCount: 2, vsComputer: true, mode: 'adventure' }), 3);
  save.setHalsPlay({ game: { state: game, setup: { players: 1, mode: 'adventure' } }, intro: true });
  save.addHalsFound('leaf');
  const next = createSave(storage);
  assert.deepEqual(next.getHalsPlay().game.state, game, 'the game comes back as it was');
  assert.equal(validateGame(next.getHalsPlay().game.state), true);
  assert.equal(next.getHalsPlay().intro, true);
  assert.deepEqual(next.getHals(), { found: ['leaf'] }, 'the collection is untouched');
  next.setHalsPlay({ game: null });
  assert.equal(createSave(storage).getHalsPlay().game, null, 'a finished game is forgotten');
  assert.equal(createSave(storage).getHalsPlay().intro, true, 'and the rest stays');
  assert.deepEqual(JSON.parse(files.get('mosi-remake-v1')).hals, { found: ['leaf'], intro: true });
});
