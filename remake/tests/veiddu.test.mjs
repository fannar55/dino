import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../engine/random.js';
import { KINDS, COPIES, makeDeck, kindOf } from '../engine/veiddu/cards.js';
import { newGame, ask, fish, legalTargets, holds, isOver, winners } from '../engine/veiddu/rules.js';
import { createMind, bestAsk, inRoundSkill, recallChance, VEIDDU_SKILL_START } from '../engine/veiddu/minds.js';
import { veidduSounds, VEIDDU_SFX, VEIDDU_GAPS, SPLASHES, splashFor, createSplash } from '../engine/veiddu/veiddu-sounds.js';
import { EITT_GAPS } from '../engine/eitt/eitt-sounds.js';
import { createSfx } from '../engine/audio/sfx.js';
import { createFakeContext, centsFromKey, pitchesOf, withFetch } from './fake-audio.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const deck = makeDeck();
const card = id => deck.find(c => c.id === id);
const types = events => events.map(e => e.type);

/**
 * A deck in draw order for `newGame({ stack })`: `hands` are the cards each seat is dealt (round robin, so every seat gets the
 * same number), `pond` the first cards drawn after the deal. The rest of the deck follows unless `rest` is false.
 */
function stackOf(hands, pond = [], rest = true) {
  const first = [];
  for (let i = 0; i < hands[0].length; i++) for (const hand of hands) first.push(card(hand[i]));
  first.push(...pond.map(card));
  const used = new Set(first.map(c => c.id));
  return rest ? [...first, ...deck.filter(c => !used.has(c.id))] : first;
}

// Three hands of five with nothing paired and the pond's first draws chosen by the test.
const HANDS = [
  ['froskur-1', 'snigill-1', 'salamandra-1', 'skjaldbaka-1', 'drekafluga-1'],
  ['snigill-2', 'brunnklukka-1', 'vatnalaesingi-1', 'fiskur-raudur-1', 'fiskur-gulur-1'],
  ['salamandra-2', 'fiskur-graenn-1', 'fiskur-blar-1', 'fiskur-appelsinugulur-1', 'fiskur-fjolublar-1'],
];
const table = (pond = []) => newGame({ stack: stackOf(HANDS, pond) });
// Tiny tables of one card each, for the pond and the end of the game.
const tiny = (hands, pond) => newGame({ hand: 1, stack: stackOf(hands, pond, false) });

test('makeDeck has 52 cards, 4 of each of 13 kinds', () => {
  assert.equal(KINDS.length, 13);
  assert.equal(COPIES, 4);
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(c => c.id)).size, 52, 'every card has its own id');
  for (const kind of KINDS) {
    const copies = deck.filter(c => c.kind === kind.id);
    assert.equal(copies.length, 4, kind.id);
    assert.deepEqual(copies.map(c => c.id), [1, 2, 3, 4].map(n => `${kind.id}-${n}`));
    assert.ok(copies.every(c => kindOf(c.id) === kind.id));
  }
});

test('the kinds follow the spec: names, questions, images and colours', () => {
  assert.deepEqual(KINDS.map(k => k.id), [
    'froskur', 'skjaldbaka', 'drekafluga', 'brunnklukka', 'vatnalaesingi', 'salamandra', 'snigill',
    'fiskur-raudur', 'fiskur-gulur', 'fiskur-graenn', 'fiskur-blar', 'fiskur-appelsinugulur', 'fiskur-fjolublar',
  ]);
  assert.equal(KINDS[1].name, 'Skjaldbaka');
  assert.equal(KINDS[1].ask, 'skjaldböku');
  assert.equal(KINDS[4].ask, 'vatnalæsingja');
  assert.equal(KINDS[12].name, 'Fjólublár fiskur');
  assert.equal(KINDS[12].ask, 'fjólubláan fisk');
  for (const kind of KINDS.slice(0, 7)) assert.equal(kind.image, `assets/veiddu/${kind.id}.webp`);
  for (const kind of KINDS.slice(7)) assert.equal(kind.image, null, 'the fish wait for the owner\'s images');
  assert.ok(KINDS.every(k => /^#[0-9a-f]{6}$/i.test(k.colour)));
  assert.equal(new Set(KINDS.map(k => k.colour)).size, 13, 'no two cards share a colour');
  assert.deepEqual(KINDS.slice(7, 11).map(k => k.colour), ['#e8483b', '#f7bd2b', '#48ad4a', '#3a8de4'], 'the four Eitt! colours');
  assert.throws(() => kindOf('dreki-1'));
});

test('newGame deals 5 to each of 3 seats, leaves 37 in the pond and no seat holds two of a kind', () => {
  for (let seed = 0; seed < 200; seed++) {
    const { game, events } = newGame({ random: seededRandom(`deal-${seed}`) });
    assert.equal(game.hands.length, 3);
    assert.equal(game.pond.length, 37);
    for (let seat = 0; seat < 3; seat++) {
      assert.equal(events.filter(e => e.type === 'deal' && e.seat === seat).length, 5);
      assert.equal(game.hands[seat].length + 2 * game.pairs[seat].length, 5, 'what was dealt is in the hand or in pairs');
      const kinds = game.hands[seat].map(c => c.kind);
      assert.equal(new Set(kinds).size, kinds.length, 'one of each kind at most');
    }
    assert.equal(game.pond.length + game.hands.flat().length + 2 * game.pairs.flat().length, 52, 'all 52 cards are somewhere');
    assert.deepEqual([game.turn, game.phase, game.asked, game.winners, game.pondEmptySaid], [0, 'ask', null, null, false]);
  }
  const a = newGame({ random: seededRandom('same') }).game;
  const b = newGame({ random: seededRandom('same') }).game;
  assert.deepEqual(a.hands, b.hands, 'the same random numbers deal the same game');
});

test('newGame with a stack deals in order and lays a dealt pair at once', () => {
  const hands = [
    ['froskur-1', 'froskur-2', 'snigill-1', 'salamandra-1', 'brunnklukka-1'],
    HANDS[1],
    ['salamandra-2', 'fiskur-graenn-1', 'fiskur-blar-1', 'fiskur-appelsinugulur-1', 'fiskur-fjolublar-1'],
  ];
  const { game, events } = newGame({ stack: stackOf(hands, ['skjaldbaka-2']) });
  assert.deepEqual(events.slice(0, 4).map(e => [e.type, e.seat, e.cardId]), [
    ['deal', 0, 'froskur-1'], ['deal', 1, 'snigill-2'], ['deal', 2, 'salamandra-2'], ['deal', 0, 'froskur-2'],
  ]);
  const pairs = events.filter(e => e.type === 'pair');
  assert.deepEqual(pairs, [{ type: 'pair', seat: 0, kind: 'froskur', cardIds: ['froskur-1', 'froskur-2'] }]);
  assert.ok(events.findIndex(e => e.type === 'pair') > events.findLastIndex(e => e.type === 'deal'), 'the pairs come after the deal');
  assert.deepEqual(game.pairs[0], ['froskur']);
  assert.equal(game.hands[0].length, 3);
  assert.ok(!holds(game, 0, 'froskur'));
  assert.equal(game.pond.at(-1).id, 'skjaldbaka-2', 'the pond is drawn from the end');
  assert.deepEqual(events.at(-1), { type: 'turn', seat: 0 });
});

test('ask: a yes gives the card, lays the pair and keeps the turn', () => {
  const { game } = table();
  const before = JSON.stringify(game);
  const out = ask(game, 0, 1, 'snigill');
  assert.equal(JSON.stringify(game), before, 'the game that went in is not changed');
  assert.deepEqual(out.events, [
    { type: 'ask', seat: 0, target: 1, kind: 'snigill' },
    { type: 'give', from: 1, to: 0, kind: 'snigill', cardId: 'snigill-2' },
    { type: 'pair', seat: 0, kind: 'snigill', cardIds: ['snigill-1', 'snigill-2'] },
  ]);
  assert.deepEqual([out.game.turn, out.game.phase, out.game.asked], [0, 'ask', null]);
  assert.deepEqual(out.game.pairs[0], ['snigill']);
  assert.equal(out.game.hands[0].length, 4, 'five cards, one given, two laid');
  assert.equal(out.game.hands[1].length, 4);
  assert.ok(!holds(out.game, 0, 'snigill') && !holds(out.game, 1, 'snigill'));
});

test('ask: a no sets phase \'fish\' with asked set', () => {
  const { game } = table();
  const out = ask(game, 0, 2, 'froskur');
  assert.deepEqual(out.events, [
    { type: 'ask', seat: 0, target: 2, kind: 'froskur' },
    { type: 'no', seat: 2, kind: 'froskur' },
  ]);
  assert.equal(out.game.phase, 'fish');
  assert.deepEqual(out.game.asked, { seat: 0, target: 2, kind: 'froskur' });
  assert.equal(out.game.turn, 0);
  assert.deepEqual(out.game.hands, game.hands);
});

test('fish: lucky draw lays the pair and keeps the turn', () => {
  const { game } = table(['froskur-2']);
  const out = fish(ask(game, 0, 2, 'froskur').game, 0);
  assert.deepEqual(out.events, [
    { type: 'fish', seat: 0, cardId: 'froskur-2', lucky: true },
    { type: 'pair', seat: 0, kind: 'froskur', cardIds: ['froskur-1', 'froskur-2'] },
  ]);
  assert.deepEqual([out.game.turn, out.game.phase, out.game.asked], [0, 'ask', null]);
  assert.deepEqual(out.game.pairs[0], ['froskur']);
  assert.equal(out.game.pond.length, 36);
});

test('fish: a draw that pairs another card lays it and passes the turn', () => {
  const { game } = table(['snigill-3']);
  const out = fish(ask(game, 0, 2, 'froskur').game, 0);
  assert.deepEqual(out.events, [
    { type: 'fish', seat: 0, cardId: 'snigill-3', lucky: false },
    { type: 'pair', seat: 0, kind: 'snigill', cardIds: ['snigill-1', 'snigill-3'] },
    { type: 'turn', seat: 1 },
  ]);
  assert.deepEqual([out.game.turn, out.game.phase, out.game.asked], [1, 'ask', null]);
  assert.deepEqual(out.game.pairs[0], ['snigill']);
});

test('fish: a draw that pairs nothing is kept and passes the turn', () => {
  const { game } = table(['brunnklukka-2']);
  const out = fish(ask(game, 0, 2, 'froskur').game, 0);
  assert.deepEqual(types(out.events), ['fish', 'turn']);
  assert.equal(out.events[0].lucky, false);
  assert.equal(out.game.hands[0].length, 6);
  assert.equal(out.game.turn, 1);
});

test('ask and fish throw on an illegal act', () => {
  const { game } = table(['brunnklukka-2']);
  assert.throws(() => ask(game, 1, 0, 'snigill'), /turn/, 'not the seat\'s turn');
  assert.throws(() => ask(game, 0, 1, 'fiskur-blar'), /hold/, 'the seat does not hold the kind');
  assert.throws(() => ask(game, 0, 1, 'dreki'), /hold/, 'not a kind at all');
  assert.throws(() => ask(game, 0, 0, 'snigill'), /itself/, 'the target is the seat itself');
  assert.throws(() => ask(game, 0, 3, 'snigill'), /seat/, 'the target is not at the table');
  assert.throws(() => ask(game, 0, 1.5, 'snigill'), /seat/);
  assert.throws(() => fish(game, 0), /fish/, 'fish needs phase fish');
  const fishing = ask(game, 0, 2, 'froskur').game;
  assert.throws(() => ask(fishing, 0, 1, 'snigill'), /ask/, 'phase fish: ask is not allowed');
  assert.throws(() => fish(fishing, 1), /turn/, 'fish by a seat that is not on turn');
  const passed = fish(fishing, 0).game;
  assert.throws(() => fish(passed, 1), /fish/);
  assert.deepEqual(legalTargets(game, 0), [1, 2]);
  assert.deepEqual(legalTargets(game, 2), [0, 1]);
});

test('a seat with no cards refills from the pond at its turn', () => {
  const hands = [['froskur-1'], ['froskur-2'], ['skjaldbaka-1']];
  const { game } = tiny(hands, ['drekafluga-1', 'brunnklukka-1', 'snigill-1']);
  // Seat 0 lays a pair with its only card: its hand is empty while it keeps the turn.
  const yes = ask(game, 0, 1, 'froskur');
  assert.deepEqual(types(yes.events), ['ask', 'give', 'pair', 'refill']);
  assert.deepEqual(yes.events[3], { type: 'refill', seat: 0, cardId: 'drekafluga-1' });
  assert.deepEqual(yes.game.hands[0].map(c => c.id), ['drekafluga-1']);
  assert.equal(yes.game.turn, 0);
  // Seat 1 gave its last card: nobody can ask it until its own turn.
  assert.deepEqual(legalTargets(yes.game, 0), [2]);
  assert.throws(() => ask(yes.game, 0, 1, 'drekafluga'), /no cards/);
  // When the turn gets to seat 1, it draws one card and goes on.
  const miss = fish(ask(yes.game, 0, 2, 'drekafluga').game, 0);
  assert.deepEqual(miss.events, [
    { type: 'fish', seat: 0, cardId: 'brunnklukka-1', lucky: false },
    { type: 'turn', seat: 1 },
    { type: 'refill', seat: 1, cardId: 'snigill-1' },
    { type: 'pond-empty' },
  ]);
  assert.deepEqual([miss.game.turn, miss.game.phase], [1, 'ask']);
  assert.deepEqual(miss.game.hands[1].map(c => c.id), ['snigill-1']);
});

test('with an empty pond a seat with no cards is out and skipped', () => {
  const hands = [['froskur-1'], ['froskur-2'], ['skjaldbaka-1']];
  const { game } = tiny(hands, ['drekafluga-1']);
  const yes = ask(game, 0, 1, 'froskur');
  assert.deepEqual(types(yes.events), ['ask', 'give', 'pair', 'refill', 'pond-empty']);
  // Seat 0 asks and gets a no; the pond is empty, so the turn passes, and seat 1 has nothing to play with.
  const miss = ask(yes.game, 0, 2, 'drekafluga');
  assert.deepEqual(miss.events, [
    { type: 'ask', seat: 0, target: 2, kind: 'drekafluga' },
    { type: 'no', seat: 2, kind: 'drekafluga' },
    { type: 'out', seat: 1 },
    { type: 'turn', seat: 2 },
  ]);
  assert.deepEqual([miss.game.turn, miss.game.phase], [2, 'ask']);
  assert.deepEqual(legalTargets(miss.game, 2), [0]);
  const back = ask(miss.game, 2, 0, 'skjaldbaka');
  assert.deepEqual(types(back.events), ['ask', 'no', 'turn']);
  assert.equal(back.game.turn, 0);
  assert.deepEqual(types(ask(back.game, 0, 2, 'drekafluga').events), ['ask', 'no', 'out', 'turn']);
});

test('pond-empty comes once, and after it a no passes the turn', () => {
  const hands = [['skjaldbaka-1'], ['brunnklukka-1'], ['snigill-1']];
  const { game } = tiny(hands, ['drekafluga-1']);
  const first = fish(ask(game, 0, 1, 'skjaldbaka').game, 0);
  assert.deepEqual(first.events, [
    { type: 'fish', seat: 0, cardId: 'drekafluga-1', lucky: false },
    { type: 'pond-empty' },
    { type: 'turn', seat: 1 },
  ]);
  assert.equal(first.game.pondEmptySaid, true);
  assert.equal(first.game.pond.length, 0);
  const second = ask(first.game, 1, 2, 'brunnklukka');
  assert.deepEqual(second.events, [
    { type: 'ask', seat: 1, target: 2, kind: 'brunnklukka' },
    { type: 'no', seat: 2, kind: 'brunnklukka' },
    { type: 'turn', seat: 2 },
  ]);
  assert.deepEqual([second.game.turn, second.game.phase, second.game.asked], [2, 'ask', null]);
  assert.throws(() => fish(second.game, 2), /fish/, 'there is nothing to fish for');
});

test('the last pair ends the game', () => {
  const hands = [['froskur-1'], ['froskur-2'], ['skjaldbaka-1']];
  const { game } = tiny(hands, ['skjaldbaka-2']);
  const yes = ask(game, 0, 1, 'froskur');
  assert.deepEqual(types(yes.events), ['ask', 'give', 'pair', 'refill', 'pond-empty']);
  const last = ask(yes.game, 0, 2, 'skjaldbaka');
  assert.deepEqual(types(last.events), ['ask', 'give', 'pair', 'over']);
  assert.deepEqual(last.events.at(-1), { type: 'over', winners: [0] });
  assert.ok(isOver(last.game));
  assert.equal(last.game.phase, 'over');
  assert.deepEqual(last.game.winners, [0]);
  assert.deepEqual(last.game.pairs, [['froskur', 'skjaldbaka'], [], []]);
  assert.deepEqual(legalTargets(last.game, 0), []);
  assert.throws(() => ask(last.game, 0, 1, 'froskur'), /ask/);
  assert.throws(() => fish(last.game, 0), /fish/);
});

test('winners: [0,2] when seats 0 and 2 tie on most pairs', () => {
  assert.deepEqual(winners({ pairs: [['a', 'b'], ['c'], ['d', 'e']] }), [0, 2]);
  assert.deepEqual(winners({ pairs: [['a'], ['c', 'd'], ['e']] }), [1]);
  assert.deepEqual(winners({ pairs: [[], [], []] }), [0, 1, 2]);
});

// Minds play whole games; the same games serve the end-of-game and the legal-ask checks.
function playGame(seed, skill, onStep = null) {
  const random = seededRandom(`veiddu-${skill}-${seed}`);
  let { game, events } = newGame({ random });
  const minds = [0, 1, 2].map(seat => createMind(seat, { random }));
  const all = [...events];
  const see = (evs, now) => { for (const e of evs) for (const mind of minds) mind.observe(e, now); };
  see(events, game);
  const violations = [];
  let acts = 0;
  let choices = 0;
  while (!isOver(game) && acts < 500) {
    acts++;
    const seat = game.turn;
    let out;
    if (game.phase === 'ask') {
      const choice = minds[seat].chooseAsk(game, { skill });
      choices++;
      if (game.hands[seat].length === 0) violations.push(['empty-handed asker', seed, skill]);
      if (!holds(game, seat, choice.kind)) violations.push(['kind not in hand', seed, skill, choice]);
      if (choice.target === seat || !Number.isInteger(choice.target) || !game.hands[choice.target]?.length) violations.push(['bad target', seed, skill, choice]);
      if (!game.pond.some(c => c.kind === choice.kind) && !game.hands.some((hand, s) => s !== seat && hand.some(c => c.kind === choice.kind))) violations.push(['no unseen copy', seed, skill, choice]);
      out = ask(game, seat, choice.target, choice.kind);
    } else {
      out = fish(game, seat);
    }
    game = out.game;
    all.push(...out.events);
    see(out.events, game);
    onStep?.(game);
  }
  return { game, acts, choices, events: all, violations };
}

const results = new Map();
function playAll(skill) {
  if (!results.has(skill)) results.set(skill, Array.from({ length: 1000 }, (_, seed) => playGame(seed, skill)));
  return results.get(skill);
}

test('1000 seeded games played by minds at skill 0, 0.5 and 1 all end with 26 pairs within 400 acts', () => {
  for (const skill of [0, 0.5, 1]) {
    let most = 0;
    for (const [seed, { game, acts, events }] of playAll(skill).entries()) {
      const where = `skill ${skill}, seed ${seed}`;
      assert.ok(isOver(game), `${where}: the game ends`);
      assert.ok(acts <= 400, `${where}: ${acts} acts`);
      assert.equal(game.pairs.flat().length, 26, where);
      assert.equal(game.pond.length + game.hands.flat().length, 0, where);
      for (const kind of KINDS) assert.equal(game.pairs.flat().filter(k => k === kind.id).length, 2, `${where}: ${kind.id} is laid twice`);
      assert.equal(events.filter(e => e.type === 'pond-empty').length, 1, `${where}: pond-empty comes once`);
      assert.equal(events.filter(e => e.type === 'over').length, 1, where);
      assert.deepEqual(events.at(-1), { type: 'over', winners: winners(game) }, where);
      assert.ok(winners(game).length >= 1);
      most = Math.max(most, acts);
    }
    assert.ok(most <= 400, `skill ${skill}: the longest game took ${most} acts`);
  }
});

test('chooseAsk never asks an empty-handed seat, never a kind it lacks, never a kind with no unseen copies', () => {
  let choices = 0;
  for (const skill of [0, 0.5, 1]) {
    for (const run of playAll(skill)) {
      assert.deepEqual(run.violations, []);
      choices += run.choices;
    }
  }
  assert.ok(choices > 100000, `${choices} choices were checked`);
});

test('a mind\'s memory is the same whatever card id another seat fished', () => {
  for (let seed = 0; seed < 20; seed++) {
    const { events } = playGame(seed, 0.5);
    for (const seat of [0, 1, 2]) {
      const real = createMind(seat, { random: seededRandom('m') });
      const masked = createMind(seat, { random: seededRandom('m') });
      let learnt = 0;
      for (const e of events) {
        const hidden = ['deal', 'fish', 'refill'].includes(e.type) && e.seat !== seat ? { ...e, cardId: 'hidden' } : e;
        real.observe(e, null);
        masked.observe(hidden, null);
        assert.deepEqual(real.memory(), masked.memory(), `seed ${seed}, seat ${seat}, after ${e.type}`);
        const memory = real.memory();
        learnt = Math.max(learnt, memory.holds.length + memory.lacks.length);
      }
      assert.ok(learnt > 0, 'the memory was not empty all game');
    }
  }
});

test('a mind learns only from what everyone heard: asks, nos, gives and pairs', () => {
  const mind = createMind(0);
  const memory = () => mind.memory();
  mind.observe({ type: 'turn', seat: 1 }, null);
  mind.observe({ type: 'ask', seat: 1, target: 2, kind: 'snigill' }, null);
  assert.deepEqual(memory().holds.map(f => [f.kind, f.seat]), [['snigill', 1]], 'the asker holds the kind');
  mind.observe({ type: 'no', seat: 2, kind: 'snigill' }, null);
  assert.deepEqual(memory().lacks.map(f => [f.kind, f.seat]), [['snigill', 2]], 'the one asked lacks it');
  mind.observe({ type: 'ask', seat: 0, target: 1, kind: 'froskur' }, null);
  assert.equal(memory().holds.length, 1, 'its own asks teach it nothing');
  mind.observe({ type: 'give', from: 1, to: 2, kind: 'snigill', cardId: 'snigill-2' }, null);
  assert.deepEqual(memory().holds, [], 'the giver no longer holds it');
  assert.deepEqual(memory().lacks.map(f => [f.kind, f.seat]).sort(), [['snigill', 1], ['snigill', 2]]);
  mind.observe({ type: 'pair', seat: 2, kind: 'snigill', cardIds: ['snigill-1', 'snigill-2'] }, null);
  assert.equal(memory().laid.snigill, 2);
  mind.observe({ type: 'ask', seat: 2, target: 1, kind: 'snigill' }, null);
  mind.observe({ type: 'pair', seat: 1, kind: 'snigill', cardIds: ['snigill-3', 'snigill-4'] }, null);
  assert.equal(memory().laid.snigill, 4);
  assert.deepEqual([memory().holds, memory().lacks], [[], []], 'with every copy laid, nothing about the kind is kept');
});

test('chooseAsk asks a remembered holder first, otherwise a seat that has not said no', () => {
  const { game } = table();
  const sure = () => 0; // always remembers, always picks the first choice
  const mind = createMind(0, { random: sure });
  mind.observe({ type: 'turn', seat: 1 }, game);
  mind.observe({ type: 'ask', seat: 1, target: 2, kind: 'snigill' }, game);
  assert.deepEqual(mind.chooseAsk(game, { skill: 1 }), { target: 1, kind: 'snigill' });
  const none = createMind(0, { random: sure });
  none.observe({ type: 'no', seat: 1, kind: 'froskur' }, game);
  assert.deepEqual(none.chooseAsk(game, { skill: 1 }), { target: 2, kind: 'froskur' }, 'seat 1 said no to the frog');
  const forgetful = createMind(0, { random: () => 0.99 });
  forgetful.observe({ type: 'turn', seat: 1 }, game);
  forgetful.observe({ type: 'ask', seat: 1, target: 2, kind: 'snigill' }, game);
  assert.notDeepEqual(forgetful.chooseAsk(game, { skill: 0 }), { target: 1, kind: 'snigill' }, 'a memory that fails is not used');
});

test('recall and the skill inside a round', () => {
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(close(recallChance(0.5, 0), 0.6));
  assert.ok(close(recallChance(0.5, 5), 0.4), 'each turn since costs 0.04');
  assert.ok(close(recallChance(1, 0), 0.9));
  assert.equal(recallChance(0, 20), 0, 'held at 0');
  assert.equal(recallChance(1, -10), 1, 'held at 1');
  assert.equal(inRoundSkill(0.5, 2, 5), 0.2, 'three pairs behind the leader: milder by 0.3');
  assert.equal(inRoundSkill(0.5, 3, 5), 0.5, 'two behind is not enough');
  assert.equal(inRoundSkill(0.2, 0, 6), 0, 'never below 0');
  assert.ok(VEIDDU_SKILL_START >= 0 && VEIDDU_SKILL_START <= 1);
});

test('bestAsk names the seat that asked for a kind the child holds (reason \'they-asked\', or \'mosi-asked\' for seat 2)', () => {
  const { game: start } = table(['brunnklukka-2', 'froskur-2', 'skjaldbaka-2']);
  // The child asks the wrong seat and fishes a card that pairs nothing; the turn goes to Uggeðla.
  let game = fish(ask(start, 0, 2, 'froskur').game, 0).game;
  assert.equal(game.turn, 1);
  // Uggeðla asks Mosi for a snail, so she holds one. The child holds the other.
  game = ask(game, 1, 2, 'snigill').game;
  assert.deepEqual(bestAsk(game, 0), { kind: 'snigill', target: 1, reason: 'they-asked' });
  game = fish(game, 1).game;
  assert.equal(game.turn, 2);
  // Then Mosi asks Uggeðla for a salamander, and the child holds one of those too.
  game = ask(game, 2, 1, 'salamandra').game;
  game = fish(game, 2).game;
  assert.equal(game.turn, 0);
  assert.deepEqual(bestAsk(game, 0), { kind: 'salamandra', target: 2, reason: 'mosi-asked' }, 'the latest ask is the one to answer');
});

test('bestAsk guesses without a clue and sends the child fishing when the pond calls', () => {
  const { game } = table();
  const guess = bestAsk(game, 0);
  assert.equal(guess.reason, 'guess');
  assert.ok(holds(game, 0, guess.kind));
  assert.ok(legalTargets(game, 0).includes(guess.target));
  assert.deepEqual(bestAsk(game, 0), guess, 'the same game gives the same advice');
  const fishing = ask(game, 0, 2, 'froskur').game;
  assert.equal(bestAsk(fishing, 0).reason, 'fish');
  const asked = bestAsk(ask(game, 0, 1, 'snigill').game, 0);
  assert.notEqual(asked.kind, 'snigill', 'the pair is laid: no longer in the hand');
});

// The log as another seat's private card ids hide it: only the seats named keep their own card ids.
const masked = (game, keep) => ({
  ...game,
  log: game.log.map(e => (['deal', 'fish', 'refill'].includes(e.type) && !keep.includes(e.seat) ? { ...e, cardId: 'hidden' } : e)),
});

test('bestAsk gives the same advice whichever card another seat fished', () => {
  const { game: start } = table(['brunnklukka-2', 'froskur-2', 'skjaldbaka-2']);
  let game = fish(ask(start, 0, 2, 'froskur').game, 0).game;
  game = ask(game, 1, 2, 'snigill').game;
  game = fish(game, 1).game;
  assert.ok(game.log.some(e => e.type === 'fish' && e.seat === 1), 'the other seat fished');
  assert.deepEqual(bestAsk(masked(game, [0]), 0), bestAsk(game, 0));
  assert.deepEqual(bestAsk(masked(game, [0]), 0), { kind: 'snigill', target: 1, reason: 'they-asked' });

  let advice = 0;
  for (let seed = 0; seed < 30; seed++) {
    playGame(seed, 0.5, game => {
      if (isOver(game)) return;
      for (const seat of [0, 1, 2]) {
        const real = bestAsk(game, seat);
        assert.deepEqual(bestAsk(masked(game, [seat]), seat), real, `seed ${seed}, seat ${seat}`);
        if (real.reason === 'they-asked' || real.reason === 'mosi-asked') advice++;
      }
    });
  }
  assert.ok(advice > 100, `${advice} pieces of advice came from what the others asked`);
});

// ---- Sound ----------------------------------------------------------------------------------------------------------------------

const MUSIC_KEY = JSON.parse(fs.readFileSync(new URL('../assets/audio/eitt/music.json', import.meta.url), 'utf8')).key; // Eitt!'s music, which Veiddu plays for now
const VEIDDU_ASSETS = new URL('../assets/veiddu/', import.meta.url);
const seededSound = () => 0.5;

test('veidduSounds makes the seven sounds, every note of them in the key of the game\'s music', () => {
  assert.deepEqual([...VEIDDU_SFX].sort(), ['draw', 'fanfare', 'flick', 'pair', 'pond-call', 'turn', 'wiggle']);
  const none = () => {};
  assert.deepEqual(Object.keys(veidduSounds({ tone: none, noise: none, bell: none, key: MUSIC_KEY })).sort(), [...VEIDDU_SFX].sort());
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: { key: MUSIC_KEY }, random: seededSound, sounds: veidduSounds, gaps: VEIDDU_GAPS });
  for (const name of VEIDDU_SFX) {
    const before = context.started.length;
    assert.equal(sfx.play(name), true, `${name} plays`);
    const made = context.started.slice(before);
    assert.ok(made.length > 0, `${name} makes a sound`);
    for (const hz of context.oscillators.slice(-made.length).flatMap(pitchesOf)) assert.ok(centsFromKey(hz, MUSIC_KEY) < 0.5, `${name}: ${hz} Hz is a note of the key`);
    context.advance(10);
  }
  assert.equal(sfx.play('flick', { soft: true }), true, 'a soft flick is the same sound, softer');
});

test('VEIDDU_GAPS names only its sounds, keeps Eitt!\'s where it has them, and stops a pair, a call or a chime from doubling', () => {
  for (const [name, seconds] of Object.entries(VEIDDU_GAPS)) {
    assert.ok(VEIDDU_SFX.includes(name), `${name} is one of the sounds`);
    assert.ok(seconds > 0 && seconds < 2, `${name}: ${seconds} s`);
    if (name in EITT_GAPS) assert.equal(seconds, EITT_GAPS[name], `${name} keeps Eitt!'s gap`);
  }
  assert.ok(VEIDDU_GAPS.turn >= 1, 'a gap longer than the chime itself');
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: { key: MUSIC_KEY }, sounds: veidduSounds, gaps: VEIDDU_GAPS });
  for (const name of ['pair', 'pond-call', 'turn']) {
    assert.equal(sfx.play(name), true, name);
    assert.equal(sfx.play(name), false, `${name} asked again at once does not sound`);
    context.advance(VEIDDU_GAPS[name] + 0.1);
    assert.equal(sfx.play(name), true, `${name} again after its gap`);
  }
});

test('a pair is two flicks one on the other and a bright chord of the key; the pond\'s call is two bells rising', () => {
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: { key: MUSIC_KEY }, random: seededSound, sounds: veidduSounds, gaps: VEIDDU_GAPS });
  sfx.play('pair');
  const slaps = context.bufferSources; // each flick has a papery slap of noise
  assert.equal(slaps.length, 2, 'two flicks');
  assert.ok(slaps[1].starts[0].when > slaps[0].starts[0].when, 'one after the other');
  const chord = new Set(context.oscillators.flatMap(pitchesOf).map(hz => Math.round(hz * 100)));
  for (const n of [0, 2, 4]) assert.ok(chord.has(Math.round(MUSIC_KEY[n] * 2 * 100)), `the chord has the key's note ${n}`);
  context.advance(10);
  const before = context.oscillators.length;
  sfx.play('pond-call');
  const call = context.oscillators.slice(before);
  const first = call.find(o => pitchesOf(o)[0] === MUSIC_KEY[2] * 2);
  const second = call.find(o => pitchesOf(o)[0] === MUSIC_KEY[4] * 2);
  assert.ok(first && second, 'two bells');
  assert.ok(MUSIC_KEY[4] > MUSIC_KEY[2] && second.starts[0].when > first.starts[0].when, 'the second is higher and later: it rises');
});

test('the splash: Egill\'s fishes make the full one, Uggeðla\'s and Mosi\'s the soft one, quieter', () => {
  assert.equal(splashFor(0), 'full');
  assert.equal(splashFor(1), 'soft');
  assert.equal(splashFor(2), 'soft');
  assert.ok(SPLASHES.soft.level < SPLASHES.full.level);
});

test('splash.json describes both files: CC0, with the sha256 of each file as it is installed', () => {
  const info = JSON.parse(fs.readFileSync(new URL('splash.json', VEIDDU_ASSETS), 'utf8'));
  for (const { file } of Object.values(SPLASHES)) {
    const entry = info.files[file];
    assert.ok(entry, `${file} is described`);
    assert.equal(entry.licence, 'CC0 1.0');
    assert.match(entry.source, /^https:\/\/freesound\.org\/people\/[^/]+\/sounds\/\d+\/$/);
    assert.match(entry.preview, /^https:\/\/cdn\.freesound\.org\/previews\//);
    assert.ok(entry.author && entry.done);
    assert.match(entry.sourceSha256, /^[0-9a-f]{64}$/);
    assert.equal(entry.sha256, crypto.createHash('sha256').update(fs.readFileSync(new URL(file, VEIDDU_ASSETS))).digest('hex'), `${file} is the file that was described`);
  }
});

test('createSplash plays the right file at its level through the output, and only when it may', async t => {
  t.mock.method(console, 'info', () => {}); // the missing file says so
  const urls = { full: 'http://x/splash.mp3', soft: 'http://x/splash-soft.mp3' };
  const context = createFakeContext({ state: 'suspended' });
  const output = context.createGain();
  const splash = createSplash({ context, output, urls, random: seededSound });
  assert.equal(splash.play(0), false, 'not before the files are in');
  const asked = await withFetch(async seen => {
    await splash.load();
    await splash.load();
    return seen;
  });
  assert.deepEqual(asked, [urls.full, urls.soft], 'each file fetched once');
  assert.equal(splash.play(0), false, 'not on a page the browser has not let sound begin');
  context.setState('running');
  const sounded = seat => {
    const before = context.bufferSources.length;
    assert.equal(splash.play(seat), true);
    const [source] = context.bufferSources.slice(before);
    const volume = source.outputs[0];
    assert.ok(volume.outputs.includes(output), 'heard through the page\'s output');
    return { source, level: volume.gain.value };
  };
  assert.equal(sounded(0).level, SPLASHES.full.level);
  assert.equal(sounded(1).level, SPLASHES.soft.level);
  assert.equal(sounded(2).level, SPLASHES.soft.level);
  assert.equal(sounded(0).source.playbackRate.value, 1, 'at its own pitch when the dice say the middle');
  splash.muted = true;
  assert.equal(splash.play(0), false, 'muted');
  splash.muted = false;
  assert.equal(splash.play(0), true);
  // silent: no context, a file that is not there
  assert.equal(createSplash({ urls }).play(0), false);
  await createSplash({ urls }).load();
  const missing = createSplash({ context, urls });
  await withFetch(() => missing.load(), () => ({ ok: false, status: 404 }));
  assert.equal(missing.play(1), false, 'a splash that cannot be had is simply not heard');
});
