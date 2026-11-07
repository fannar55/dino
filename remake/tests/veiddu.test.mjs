import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../engine/random.js';
import { KINDS, COPIES, makeDeck, kindOf } from '../engine/veiddu/cards.js';
import { newGame, ask, fish, legalTargets, holds, isOver, winners } from '../engine/veiddu/rules.js';
import { createMind, bestAsk, inRoundSkill, recallChance, VEIDDU_SKILL_START, SEAT } from '../engine/veiddu/minds.js';
import { createSpeech, GUARD_MS, LATE_START_MS, nameLine, askLine, answerLine, whyLine, endLine, isHers, priorityOf, HINT_LINE, EMPTY_LINE, NUDGE_LINE } from '../engine/veiddu/speech.js';
import { SAY, WHY, asking } from '../engine/veiddu/table.js';
import { veidduSounds, VEIDDU_SFX, VEIDDU_GAPS, SPLASHES, splashFor, createSplash } from '../engine/veiddu/veiddu-sounds.js';
import { EITT_GAPS } from '../engine/eitt/eitt-sounds.js';
import { createSfx } from '../engine/audio/sfx.js';
import { createFakeContext, centsFromKey, pitchesOf, withFetch } from './fake-audio.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createSave, forgetSave } from '../engine/save.js';
import { createBook, VEIDDU_STAR } from '../engine/book/book.js';
import { childWon, afterRoundSave } from '../engine/veiddu/remote.js';
import { DONE } from '../engine/handle.js';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';

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
  const credits = JSON.parse(fs.readFileSync(new URL('../assets/veiddu/credits.json', import.meta.url), 'utf8'));
  for (const kind of KINDS) {
    assert.equal(kind.image, `assets/veiddu/${kind.id}.webp`, 'every card is a photo, the fish too (the owner\'s picks, 2026-11-01)');
    const file = fs.readFileSync(new URL(`../${kind.image}`, import.meta.url));
    const credit = credits[kind.id];
    assert.ok(credit?.credit && credit.license && credit.source, `${kind.id} is credited`);
    assert.equal(crypto.createHash('sha256').update(file).digest('hex'), credit.sha256, `${kind.id}: the file is the one credited`);
  }
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

// ---- The voices (speech.js) -------------------------------------------------------------------------------------------------

const LINES_SOURCE = JSON.parse(fs.readFileSync(new URL('../assets/audio/veiddu/lines-source.json', import.meta.url), 'utf8'));
const LINES_MADE = JSON.parse(fs.readFileSync(new URL('../assets/audio/lines.json', import.meta.url), 'utf8'));
const WHY_REASONS = ['they-asked', 'mosi-asked', 'guess', 'fish'];
const SEATS = [SEAT.child, SEAT.uggedla, SEAT.mosi];

/** Every line id the table can ask for, with the words its bubble shows (null: the table shows none). */
function tableLines() {
  const out = [];
  for (const kind of KINDS) {
    out.push({ id: nameLine(kind.id), text: null });
    for (const seat of SEATS) out.push({ id: askLine(seat, kind.id), text: asking(kind.id) });
  }
  for (const seat of SEATS) {
    out.push({ id: answerLine(seat, 'yes'), text: seat === SEAT.child ? SAY.give : SAY.yes });
    out.push({ id: answerLine(seat, 'no'), text: seat === SEAT.child ? SAY.childNo : SAY.no });
    out.push({ id: answerLine(seat, 'lucky'), text: SAY.lucky });
  }
  out.push({ id: EMPTY_LINE, text: SAY.empty }, { id: NUDGE_LINE, text: SAY.nudge }, { id: HINT_LINE, text: SAY.giveHelp });
  for (const reason of WHY_REASONS) out.push({ id: whyLine(reason), text: WHY[reason] });
  for (const round of [1, 2]) for (const winners of [[0], [1], [2], [0, 1], [1, 2], [0, 1, 2]]) out.push({ id: endLine(winners, round), text: null });
  return out;
}

test('every line the table can ask for is in the veiddu set, in the right voice, and its bubble says what the line says', () => {
  const source = new Map(LINES_SOURCE.map(line => [line.id, line]));
  const asked = tableLines();
  for (const { id, text } of asked) {
    const line = source.get(id);
    assert.ok(line, `${id} is in lines-source.json`);
    assert.equal(id.split('_')[1], line.speaker, `${id} is spoken by ${line.speaker}`);
    if (text !== null) assert.equal(text, line.text, `${id}: the bubble and the voice say the same`);
    const made = LINES_MADE[id];
    assert.ok(made?.src && made.duration > 0 && made.mouth, `${id} is recorded, with a length and a mouth`);
  }
  // and every recorded line but the tutorial's (Task 7) is one the table asks for
  const used = new Set(asked.map(line => line.id));
  const unused = LINES_SOURCE.map(line => line.id).filter(id => !used.has(id) && !id.startsWith('veiddu_tut_'));
  assert.deepEqual(unused, [], 'no recorded line is left unspoken');
  assert.equal(nameLine('fiskur-graenn'), 'veiddu_egill_name_fiskur_graenn', 'the dash of a kind id is an underscore in a line id');
  assert.equal(askLine(SEAT.uggedla, 'froskur'), 'veiddu_uggedla_ask_froskur');
});

test('the end of a round: a winner says "Ég vann!", the others take turns at "Þú vannst!", a tie is Mosi\'s', () => {
  assert.equal(endLine([SEAT.uggedla], 1), 'veiddu_uggedla_won');
  assert.equal(endLine([SEAT.mosi], 1), 'veiddu_mosi_won');
  assert.equal(endLine([SEAT.child], 1), 'veiddu_uggedla_you_won');
  assert.equal(endLine([SEAT.child], 2), 'veiddu_mosi_you_won');
  assert.equal(endLine([SEAT.child], 3), 'veiddu_uggedla_you_won');
  for (const winners of [[0, 1], [1, 2], [0, 1, 2]]) assert.equal(endLine(winners, 1), 'veiddu_mosi_tie');
});

test('priorities: Egill first, then Mosi\'s advice and the tutorial, then the asks and answers, then chatter', () => {
  assert.equal(priorityOf('veiddu_egill_name_froskur'), 3);
  assert.equal(priorityOf('veiddu_egill_ask_snigill'), 3);
  assert.equal(priorityOf('veiddu_egill_yes'), 3);
  for (const id of ['veiddu_mosi_why_guess', 'veiddu_mosi_why_they_asked', 'veiddu_mosi_give_hint', 'veiddu_tut_pick']) assert.equal(priorityOf(id), 2, id);
  for (const id of ['veiddu_mosi_ask_froskur', 'veiddu_uggedla_ask_froskur', 'veiddu_mosi_yes', 'veiddu_uggedla_no', 'veiddu_mosi_lucky', 'veiddu_uggedla_empty', 'veiddu_mosi_won', 'veiddu_uggedla_you_won', 'veiddu_mosi_tie']) {
    assert.equal(priorityOf(id), 1, id);
  }
  assert.equal(priorityOf('veiddu_uggedla_your_turn'), 0);
  assert.equal(priorityOf('veiddu_mosi_ask_froskur') > priorityOf('veiddu_uggedla_your_turn'), true);
  for (const { id } of tableLines()) assert.ok([0, 1, 2, 3].includes(priorityOf(id)), id);
  assert.equal(isHers('veiddu_uggedla_empty'), true);
  assert.equal(isHers('veiddu_mosi_ask_froskur'), false);
});

const SPEECH_LINES = {
  veiddu_egill_name_froskur: { src: 'assets/n.mp3', duration: 1, mouth: '00ff' },
  veiddu_egill_name_skjaldbaka: { src: 'assets/n2.mp3', duration: 1.2, mouth: '00ff' },
  veiddu_uggedla_ask_froskur: { src: 'assets/ua.mp3', duration: 2, mouth: '00ff' },
  veiddu_mosi_ask_froskur: { src: 'assets/ma.mp3', duration: 2, mouth: '00ff' },
  veiddu_mosi_why_guess: { src: 'assets/w1.mp3', duration: 3, mouth: '00ff' },
  veiddu_mosi_why_fish: { src: 'assets/w2.mp3', duration: 2.5, mouth: '00ff' },
  veiddu_uggedla_your_turn: { src: 'assets/t.mp3', duration: 1.5, mouth: '00ff' },
};

/** Speech over a voice that plays nothing, a clock and timers that move only when told, and notes of what happened. */
function rig(lines = SPEECH_LINES, options = {}) {
  let now = 1000;
  let nextTimer = 1;
  const timers = [];
  const played = [];
  const ducks = [];
  const heard = [];
  let speaking = null;
  let report;
  let position = 0; // how far the voice has played (a test moves it)
  const voice = {
    get current() { return speaking === null ? null : { src: speaking, time: position }; },
    play(src) {
      if (silenced) return null;
      played.push(src.replace('http://x/assets/', ''));
      position = 0;
      const was = speaking;
      speaking = src;
      if (!was) report(true);
      return src;
    },
    stop() {
      if (speaking === null) return;
      speaking = null;
      report(false);
    },
  };
  let silenced = false;
  Object.defineProperty(voice, 'muted', { get: () => silenced, set: value => { silenced = Boolean(value); if (silenced) voice.stop(); } });
  const speech = createSpeech({
    lines, base: 'http://x/', clock: () => now, makeVoice: ({ onSpeaking }) => { report = onSpeaking; return voice; },
    setTimer: (fn, ms) => { timers.push({ id: nextTimer, at: now + ms, fn }); return nextTimer++; },
    clearTimer: id => { const k = timers.findIndex(timer => timer.id === id); if (k >= 0) timers.splice(k, 1); },
    onDuck: on => ducks.push(on), onLine: line => heard.push(line), ...options,
  });
  const advance = ms => {
    const until = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > until) break;
      now = timers[0].at;
      timers.shift().fn();
    }
    now = until;
  };
  return { speech, played, ducks, heard, advance, ended: () => voice.stop(), setPosition: seconds => { position = seconds; }, get speaking() { return speaking !== null; } };
}

test('a line begins at once when nothing speaks, ducks the music, and its seconds come back', () => {
  const r = rig();
  assert.equal(r.speech.say('veiddu_uggedla_ask_froskur'), 2);
  assert.deepEqual(r.played, ['ua.mp3']);
  assert.deepEqual(r.ducks, [true]);
  assert.equal(r.speech.talking, true);
  assert.deepEqual(r.speech.current, { id: 'veiddu_uggedla_ask_froskur', priority: 1 });
  assert.deepEqual(r.heard, [{ id: 'veiddu_uggedla_ask_froskur', line: SPEECH_LINES.veiddu_uggedla_ask_froskur, sound: true }], 'the mouth is told, with the line');
  r.ended();
  assert.deepEqual(r.ducks, [true, false], 'the music comes back');
  assert.equal(r.speech.talking, false);
  assert.equal(r.speech.current, null);
});

test('one voice at a time: a line asked for while another speaks waits its turn, and says how long that will be', () => {
  const r = rig();
  let started = 0;
  assert.equal(r.speech.say('veiddu_uggedla_ask_froskur'), 2);
  r.advance(500);
  assert.equal(r.speech.say('veiddu_mosi_ask_froskur', { onStart: () => started++ }), 3.5, '1.5 s of the first left, then its own 2');
  assert.deepEqual(r.played, ['ua.mp3'], 'it does not speak over the first');
  assert.equal(started, 0);
  r.ended();
  assert.deepEqual(r.played, ['ua.mp3', 'ma.mp3'], 'it begins as the first ends');
  assert.equal(started, 1, 'onStart runs as it begins');
  assert.deepEqual(r.ducks, [true, false, true], 'the music dips again for it only after it dipped, never twice in a row');
});

test('lines waiting go in order of who matters: Egill, Mosi\'s advice, the game\'s asks, chatter', () => {
  const r = rig();
  r.speech.say('veiddu_uggedla_ask_froskur'); // sounding
  r.speech.say('veiddu_uggedla_your_turn');
  r.speech.say('veiddu_mosi_ask_froskur');
  r.speech.say('veiddu_mosi_why_guess');
  r.speech.say('veiddu_egill_name_froskur');
  assert.equal(r.speech.waiting, 4);
  for (let k = 0; k < 4; k++) r.ended();
  assert.deepEqual(r.played, ['ua.mp3', 'n.mp3', 'w1.mp3', 'ma.mp3', 't.mp3']);
  r.ended();
  assert.equal(r.speech.talking, false);
});

test('a line that waited too long, or is no longer true, is dropped; a later piece of advice and a repeated line take the old one\'s place', () => {
  const r = rig();
  r.speech.say('veiddu_uggedla_ask_froskur');
  r.speech.say('veiddu_egill_name_froskur', { within: 1000 }); // waits too long
  r.speech.say('veiddu_egill_name_skjaldbaka', { still: () => false }); // no longer true
  r.speech.say('veiddu_uggedla_your_turn', { still: () => true, within: 5000 }); // fine
  r.advance(2000);
  r.ended();
  assert.deepEqual(r.played, ['ua.mp3', 't.mp3'], 'only the chatter that was still worth saying');
  r.ended();
  // advice: the newer one replaces the older one waiting
  r.speech.say('veiddu_mosi_ask_froskur');
  r.speech.say('veiddu_mosi_why_guess');
  r.speech.say('veiddu_mosi_why_fish');
  r.speech.say('veiddu_egill_name_froskur');
  r.speech.say('veiddu_egill_name_froskur'); // asked twice: said once
  assert.equal(r.speech.waiting, 2);
  r.ended();
  r.ended();
  assert.deepEqual(r.played.slice(2), ['ma.mp3', 'n.mp3', 'w2.mp3']);
});

test('a line not recorded yet, or a muted game, is passed over: no sound, no time, and onStart at once', () => {
  const r = rig();
  let started = 0;
  assert.equal(r.speech.say('veiddu_tut_pick', { onStart: () => started++ }), 0);
  assert.equal(started, 1);
  assert.deepEqual(r.heard, [{ id: 'veiddu_tut_pick', line: null, sound: false }], 'her mouth is told there is no recording');
  assert.deepEqual(r.played, []);
  r.speech.say('veiddu_uggedla_ask_froskur');
  r.speech.say('veiddu_mosi_ask_froskur'); // waiting
  r.speech.muted = true;
  assert.equal(r.speech.waiting, 0, 'muting drops what waits');
  assert.equal(r.speech.talking, false, 'and stops what sounds');
  assert.equal(r.speech.say('veiddu_mosi_ask_froskur', { onStart: () => started++ }), 0);
  assert.equal(started, 2);
  assert.equal(r.heard.at(-1).sound, false);
  r.speech.muted = false;
  assert.equal(r.speech.say('veiddu_mosi_ask_froskur'), 2, 'sound again');
  assert.deepEqual(createSpeech({ muted: true, makeVoice: () => ({}) }).muted, true, 'a speech can begin muted');
});

test('a voice whose end never comes is stopped after its length and 1.5 s, and the next line goes on', () => {
  const r = rig();
  r.speech.say('veiddu_uggedla_ask_froskur'); // 2 s
  r.speech.say('veiddu_mosi_ask_froskur');
  r.setPosition(2); // it has played all of it and does not end
  r.advance(2000 + GUARD_MS - 10);
  assert.deepEqual(r.played, ['ua.mp3'], 'not yet');
  r.advance(20);
  assert.deepEqual(r.played, ['ua.mp3', 'ma.mp3'], 'stopped, and the next begins');
  r.ended();
  r.advance(60000);
  assert.equal(r.speech.talking, false, 'nothing is left going');
});

test('a voice that began late is let finish; one that has not begun is waited for once more, and a stalled one is stopped', () => {
  // begun late: 1.2 s into a 2 s line when its time is up
  let r = rig();
  r.speech.say('veiddu_uggedla_ask_froskur');
  r.speech.say('veiddu_mosi_ask_froskur');
  r.advance(2000 + GUARD_MS - 1);
  r.setPosition(1.2);
  r.advance(2);
  r.advance(0.8 * 1000 + GUARD_MS - 10);
  assert.deepEqual(r.played, ['ua.mp3'], 'let go on, not cut');
  r.setPosition(2);
  r.advance(20);
  assert.deepEqual(r.played, ['ua.mp3', 'ma.mp3'], 'stopped only when it had played its length and still did not end');
  // not begun: one more wait, then it is given up
  r = rig();
  r.speech.say('veiddu_uggedla_ask_froskur');
  r.speech.say('veiddu_mosi_ask_froskur');
  r.advance(2000 + GUARD_MS + LATE_START_MS - 10);
  assert.deepEqual(r.played, ['ua.mp3'], 'waited for');
  r.advance(20);
  assert.deepEqual(r.played, ['ua.mp3', 'ma.mp3'], 'then given up');
  // stalled part way: the position does not move between two looks
  r = rig();
  r.speech.say('veiddu_uggedla_ask_froskur');
  r.speech.say('veiddu_mosi_ask_froskur');
  r.advance(2000 + GUARD_MS - 1);
  r.setPosition(0.5);
  r.advance(2);
  r.advance(1.5 * 1000 + GUARD_MS + 10);
  assert.deepEqual(r.played, ['ua.mp3', 'ma.mp3'], 'a voice stuck at 0.5 s is stopped at its next look');
});

test('cut drops the chatter and stops it if it is sounding, and leaves everything else alone', () => {
  const r = rig();
  r.speech.say('veiddu_uggedla_your_turn');
  assert.equal(r.speech.cut(0), true);
  assert.equal(r.speech.talking, false);
  r.speech.say('veiddu_egill_name_froskur');
  r.speech.say('veiddu_uggedla_your_turn'); // waits
  assert.equal(r.speech.cut(0), false, 'a name is not chatter');
  assert.equal(r.speech.waiting, 0, 'but the chatter waiting is gone');
  assert.equal(r.speech.talking, true);
  r.ended();
  r.speech.say('veiddu_mosi_why_guess');
  assert.equal(r.speech.cut(2), true, 'Mosi\'s advice, when it has been taken');
  assert.equal(r.speech.talking, false);
});

test('stop drops everything and silences the voice; hush leaves the one sounding to end by itself', () => {
  const r = rig();
  r.speech.say('veiddu_uggedla_ask_froskur');
  r.speech.say('veiddu_mosi_ask_froskur');
  r.speech.hush();
  assert.equal(r.speech.waiting, 0);
  assert.equal(r.speech.talking, true);
  r.speech.say('veiddu_mosi_ask_froskur');
  r.speech.stop();
  assert.equal(r.speech.waiting, 0);
  assert.equal(r.speech.talking, false);
  assert.deepEqual(r.played, ['ua.mp3']);
  r.advance(60000);
  assert.deepEqual(r.played, ['ua.mp3'], 'the guard of the stopped line does not wake the next');
});

// ---- The save, the tile and the stickers (Task 8) ---------------------------------------------------------------------------

const SAVE_KEY = 'mosi-remake-v1';
const NO_VEIDDU = { skill: null, losses: 0, wins: 0, tutorialDone: false, game: null, seats: null };

/** A storage of the test's own, as the browser's localStorage behaves. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
}
const storedOf = storage => JSON.parse(storage.getItem(SAVE_KEY));

test('createSave keeps veiddu { skill, losses, wins, tutorialDone } and reads a save without it as defaults', () => {
  // a save from before the game (with Eitt! played): the defaults, and no block written until Veiddu is played
  const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ stars: ['k1_kambedla'], findings: [], seen: [], places: [], eitt: { skill: 0.4, losses: 2, wins: 3, tutorialDone: true } }) });
  const save = createSave(storage);
  assert.deepEqual(save.getVeiddu(), NO_VEIDDU);
  assert.equal(save.getVeiddu().skill, null, 'skill is null before the first round');
  save.addStar(VEIDDU_STAR);
  assert.equal('veiddu' in storedOf(storage), false, 'the star is not a game played: no veiddu block yet');

  // the round's result is kept, and the next page reads it
  save.setVeiddu({ skill: 0.35, losses: 1, wins: 2 });
  assert.deepEqual(save.getVeiddu(), { ...NO_VEIDDU, skill: 0.35, losses: 1, wins: 2 });
  assert.deepEqual(storedOf(storage).veiddu, { skill: 0.35, losses: 1, wins: 2, tutorialDone: false });
  assert.deepEqual(createSave(storage).getVeiddu(), { ...NO_VEIDDU, skill: 0.35, losses: 1, wins: 2 });

  // a change leaves what it does not name as it was (the tutorial's flag, the round's numbers)
  save.setVeiddu({ tutorialDone: true });
  assert.deepEqual(save.getVeiddu(), { ...NO_VEIDDU, skill: 0.35, losses: 1, wins: 2, tutorialDone: true });
  save.setVeiddu({ skill: 0.5, losses: 0, wins: 3 });
  assert.deepEqual(createSave(storage).getVeiddu(), { ...NO_VEIDDU, skill: 0.5, losses: 0, wins: 3, tutorialDone: true });
  assert.equal(save.setVeiddu(), undefined, 'a call with nothing to change is allowed');

  // Eitt!'s block and the rest are not touched, and the other way round
  assert.deepEqual(save.getEitt(), { skill: 0.4, losses: 2, wins: 3, tutorialDone: true, game: null, seats: null });
  assert.deepEqual(storedOf(storage).eitt, { skill: 0.4, losses: 2, wins: 3, tutorialDone: true });
  assert.deepEqual(save.get().stars, ['k1_kambedla', VEIDDU_STAR]);
  save.setEitt({ wins: 4 });
  assert.equal(save.getVeiddu().wins, 3, 'Eitt!\'s wins are not Veiddu\'s');
  assert.equal(save.getEitt().wins, 4);

  // forgotten with the save, as Eitt! is (forgetSave takes the one key)
  forgetSave(storage);
  assert.deepEqual(createSave(storage).getVeiddu(), NO_VEIDDU);
});

test('the save reads only what makes sense: bad numbers and strangers in the veiddu block become the defaults', () => {
  const stored = veiddu => createSave(memoryStorage({ [SAVE_KEY]: JSON.stringify({ stars: [], veiddu }) })).getVeiddu();
  assert.deepEqual(stored({ skill: 2, losses: -1, wins: 1.5, tutorialDone: 'yes', game: [1], seats: { x: 1 } }), NO_VEIDDU, 'out of range, not whole, not true, a list for a game, seats without a game');
  assert.deepEqual(stored({ skill: 'high', losses: '3', wins: null }), NO_VEIDDU);
  assert.deepEqual(stored('veiddu'), NO_VEIDDU);
  assert.deepEqual(stored({ skill: 0, losses: 2, wins: 7, tutorialDone: true }), { ...NO_VEIDDU, skill: 0, losses: 2, wins: 7, tutorialDone: true }, 'skill 0 is a skill');
  // a storage that fails is the game's problem no more than before: it lives in memory
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  const save = createSave(broken);
  assert.doesNotThrow(() => save.setVeiddu({ wins: 1 }));
  assert.equal(save.getVeiddu().wins, 1);
});

test('veiddu keeps a round of Fjölspil with its seats, hands out copies, and forgets both on game: null', () => {
  const save = createSave(null);
  assert.equal(save.getVeiddu().game, null);
  const game = { pairs: [[], [], []], turn: 1 };
  save.setVeiddu({ game, seats: { max: 4, reserved: ['uggedla'], seats: [] } });
  assert.deepEqual(save.getVeiddu().game, game);
  assert.notEqual(save.getVeiddu().game, game, 'a copy');
  save.getVeiddu().game.turn = 9;
  assert.equal(save.getVeiddu().game.turn, 1, 'and the copy is not the save\'s own');
  assert.deepEqual(save.getVeiddu().seats.reserved, ['uggedla']);
  save.setVeiddu({ wins: 1 });
  assert.deepEqual(save.getVeiddu().game, game, 'other changes leave it');
  save.setVeiddu({ game: null });
  assert.equal(save.getVeiddu().game, null);
  assert.equal(save.getVeiddu().seats, null, 'the seats go with the game');
  save.setVeiddu({ seats: { max: 4 } });
  assert.equal(save.getVeiddu().seats, null, 'seats without a game are not kept');
});

test('a tie that includes the child counts as a win for wins', () => {
  // a whole game the minds played in which the child and another seat have most pairs (seeded: the same game each run)
  const tied = playAll(0.5).find(({ game }) => game.winners.length > 1 && game.winners.includes(SEAT.child));
  assert.ok(tied, 'among 1000 seeded games there is a tie with the child in it');
  const { game } = tied;
  assert.deepEqual(winners(game), game.winners);
  assert.ok(game.winners.length >= 2 && game.winners.includes(SEAT.child));
  assert.ok(game.winners.every(seat => game.pairs[seat].length === Math.max(...game.pairs.map(p => p.length))), 'all of them have the most pairs');
  assert.ok(game.pairs.some(p => p.length < game.pairs[SEAT.child].length) || game.winners.length === 3, 'and the child did not simply win alone');

  // the end of a round (remote.js, which the solo table and the Fjölspil table both use): a child among the winners has won, whether alone
  // or in a tie, and the save gets the next skill with one more win; a round lost leaves the wins, and the child's losses grow
  assert.equal(childWon(game.winners), true, 'the child is among the winners, not necessarily the only one');
  assert.equal(childWon([SEAT.mosi]), false);
  assert.equal(childWon([SEAT.uggedla, SEAT.mosi]), false);
  const afterIt = afterRoundSave;
  const save = createSave(null);
  save.setVeiddu(afterIt(save.getVeiddu(), game.winners));
  assert.equal(save.getVeiddu().wins, 1, 'a tie is a win');
  assert.equal(save.getVeiddu().losses, 0);
  save.setVeiddu(afterIt(save.getVeiddu(), [SEAT.mosi]));
  assert.equal(save.getVeiddu().wins, 1, 'a round the child is not in the winners of is no sticker');
  assert.equal(save.getVeiddu().losses, 1);
});

/** The book over a save, with a record of the games it opens and the sounds it plays; the Veiddu tile, the sticker sheet and the slots. */
function bookRig(fill = () => {}) {
  const save = createSave(null);
  fill(save);
  const played = [];
  const sounds = [];
  const doc = new FakeDocument(['book']);
  const book = createBook(doc, { save, audio: { sfx: name => { sounds.push(name); return true; }, stop() {}, narrate: () => DONE }, onPause() {}, onPlay: game => played.push(game) });
  const root = doc.getElementById('book');
  const tap = el => {
    el.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
    el.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
  };
  const tile = game => root.findAll(e => e.getAttribute('data-game') === game)[0];
  const slot = game => tile(game).parentNode;
  const sheet = () => root.findAll(e => e.classList.contains('sticker-sheet'))[0];
  const stickers = () => sheet().findAll(e => e.classList.contains('book-sticker'));
  const slots = () => root.findAll(e => e.classList.contains('game-slot'));
  return { save, book, root, played, sounds, tap, tile, slot, sheet, stickers, slots };
}

test('Veiddu\'s tile is Uggeðla\'s, shows with her star, is new until opened, and a tap hands the game to onPlay', () => {
  assert.equal(VEIDDU_STAR, 'k2_uggedla');
  const { save, book, played, sounds, tap, tile, slot, slots } = bookRig(s => s.addStar('k1_kambedla'));
  book.open('games', 'child');
  assert.equal(slot('veiddu').hidden, true, 'no Veiddu without Uggeðla\'s star');
  assert.deepEqual(slots().map(s => s.findAll(e => e.getAttribute('data-game'))[0].getAttribute('data-game')), ['eitt', 'veiddu', 'hals', 'yatzy-junior', 'minnisspil'], 'five slots: the two card games side by side, then the board, the dice and the memory game (hidden here)');
  assert.equal(tile('veiddu').parentNode.parentNode.getAttribute('data-open'), '2', 'Eitt! and Litla Yatzy are the two open');
  assert.ok(tile('veiddu').classList.contains('unfound'));
  sounds.length = 0;
  tap(tile('veiddu'));
  assert.deepEqual(played, [], 'a game not open opens nothing');
  assert.deepEqual(sounds, ['wiggle'], 'it wiggles');

  sounds.length = 0;
  save.addStar(VEIDDU_STAR);
  book.refresh();
  assert.equal(slot('veiddu').hidden, false, 'Veiddu appears with k2_uggedla');
  assert.equal(slot('veiddu').parentNode.getAttribute('data-open'), '3', 'and is counted in data-open');
  const t = tile('veiddu');
  assert.ok(t.classList.contains('new') && !t.classList.contains('found') && !t.classList.contains('unfound'), 'new until opened');
  assert.deepEqual(t.findAll(e => e.classList.contains('badge-new')).map(e => e.textContent), ['Nýtt!']);
  assert.equal(t.getAttribute('aria-label'), 'Veiddu, spil við Uggeðlu');
  assert.equal(t.findAll(e => e.classList.contains('tile-name'))[0].textContent, 'Veiddu');
  assert.match(t.findAll(e => e.tagName === 'IMG')[0].src, /assets\/book\/images\/uggedla-render\.webp$/, 'her picture');
  assert.ok(t.style['--hue'], 'in her colour');

  tap(t);
  assert.deepEqual(played, ['veiddu'], 'a tap hands the game over');
  assert.deepEqual(sounds, ['tile']);
  assert.ok(save.get().seen.includes('veiddu'), 'and it is seen from then on');
  assert.ok(t.classList.contains('found') && !t.classList.contains('new'), 'the tile is not new');
  assert.deepEqual(t.findAll(e => e.classList.contains('badge-new')), []);
  assert.equal(save.get().seen.includes('eitt'), false, 'Eitt! is not touched');
});

test('with Uggeðla\'s star alone the Leikir page shows Veiddu and Litla Yatzy; all four of a full book are counted', () => {
  const { save, book, slot } = bookRig(s => s.addStar(VEIDDU_STAR));
  book.open('games', 'child');
  assert.deepEqual(['eitt', 'hals', 'veiddu', 'yatzy-junior'].map(game => slot(game).hidden), [true, true, false, false]);
  assert.equal(slot('veiddu').parentNode.getAttribute('data-open'), '2');
  save.addStar('k1_kambedla');
  save.addStar('k2_thorsedla');
  book.refresh();
  assert.deepEqual(['eitt', 'hals', 'veiddu', 'yatzy-junior'].map(game => slot(game).hidden), [false, false, false, false]);
  assert.equal(slot('veiddu').parentNode.getAttribute('data-open'), '4');
});

test('Uggeðla\'s stickers follow Kambeðla\'s on the sheet, one for each win, and the sheet shows when either game is open', () => {
  const { save, book, sheet, stickers } = bookRig();
  book.open('games', 'child');
  assert.equal(sheet().hidden, true, 'no game open, no sheet');
  save.addStar(VEIDDU_STAR);
  book.refresh();
  assert.equal(sheet().hidden, false, 'Uggeðla\'s game alone opens it');
  assert.deepEqual(stickers().map(s => s.className), ['book-sticker empty'], 'one dashed place where the first will go');

  save.setVeiddu({ wins: 2 });
  book.refresh();
  assert.deepEqual(stickers().map(s => s.className), ['book-sticker uggedla', 'book-sticker uggedla']);
  assert.equal(sheet().getAttribute('aria-label'), '2 uggeðlulímmiðar');

  save.addStar('k1_kambedla');
  save.setEitt({ wins: 3 });
  book.refresh();
  assert.deepEqual(stickers().map(s => s.className), [...Array(3).fill('book-sticker'), ...Array(2).fill('book-sticker uggedla')], 'Kambeðla\'s first, then Uggeðla\'s');
  assert.equal(sheet().getAttribute('aria-label'), '3 kambeðlulímmiðar og 2 uggeðlulímmiðar');

  save.setEitt({ wins: 0 });
  save.setVeiddu({ wins: 1 });
  book.refresh();
  assert.deepEqual(stickers().map(s => s.className), ['book-sticker uggedla']);
  assert.equal(sheet().getAttribute('aria-label'), 'Einn uggeðlulímmiði');
  save.setVeiddu({ wins: 0 });
  book.refresh();
  assert.deepEqual(stickers().map(s => s.className), ['book-sticker empty'], 'still one dashed place, not two');

  // more than the page holds: the page is full and the count says how many there are
  save.setEitt({ wins: 12 });
  save.setVeiddu({ wins: 11 });
  book.refresh();
  assert.equal(stickers().length, 20, 'twenty stickers on the page');
  assert.equal(stickers().filter(s => s.classList.contains('uggedla')).length, 8, 'Kambeðla\'s twelve first, then eight of Uggeðla\'s');
  assert.deepEqual(sheet().findAll(e => e.classList.contains('sticker-count')).map(e => e.textContent), ['23']);
});

test('a win in Veiddu is a sticker in the book that was open, the next time the book refreshes (the table\'s onClose)', () => {
  const { save, book, stickers } = bookRig(s => s.addStar(VEIDDU_STAR));
  book.open('games', 'child');
  assert.equal(stickers().filter(s => s.classList.contains('uggedla')).length, 0);
  save.setVeiddu({ skill: 0.25, losses: 0, wins: 1 }); // as table.js endRound does
  book.refresh(); // and as main.js does when the game shuts
  assert.equal(stickers().filter(s => s.classList.contains('uggedla')).length, 1);
});
