// remake/tests/veiddu-remote.test.mjs
// What a phone sees and does in "Veiddu" in Fjölspil (engine/veiddu/remote.js, Task 9): the view of one seat holds only that seat's hand,
// an act the rules or the moment do not allow changes nothing, and a round kept in the save comes back whole.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../engine/random.js';
import { newGame, ask, fish, legalTargets, holds } from '../engine/veiddu/rules.js';
import { createMind } from '../engine/veiddu/minds.js';
import { makeDeck, KINDS } from '../engine/veiddu/cards.js';
import { viewFor, actOf, publicEvent, keptGameOf, winnersWords, childWon, afterRoundSave, questionText } from '../engine/veiddu/remote.js';

/** A game of `seats` played by minds for `acts` acts: [{ game, events }] after each. */
function played(seats, acts, seed = 'fjolspil') {
  const random = seededRandom(seed);
  const start = newGame({ seats, random });
  let game = start.game;
  const minds = Array.from({ length: seats }, (_, seat) => createMind(seat, { random }));
  for (const event of start.events) for (const mind of minds) mind.observe(event);
  const out = [{ game, events: start.events }];
  for (let k = 0; k < acts && game.phase !== 'over'; k++) {
    const seat = game.turn;
    let result;
    if (game.phase === 'fish') result = fish(game, seat);
    else {
      const { target, kind } = minds[seat].chooseAsk(game, { skill: 0.5 });
      result = ask(game, seat, target, kind);
    }
    game = result.game;
    for (const event of result.events) for (const mind of minds) mind.observe(event);
    out.push({ game, events: result.events });
  }
  return out;
}
const NAMES = ['Egill', 'Anna', 'Bjarni', 'Uggeðla'];
const AVATARS4 = ['egill', 'kambedla', 'gramedla', 'uggedla'];

test('the guest view of seat N carries only seat N\'s hand and the others\' counts', () => {
  for (const seats of [2, 3, 4]) {
    for (const { game, events } of played(seats, 40, `view-${seats}`)) {
      for (let seat = 0; seat < seats; seat++) {
        const last = events.map(publicEvent).filter(Boolean).at(-1) ?? null;
        const v = viewFor(game, seat, { awaiting: { seat: game.turn, need: game.phase === 'fish' ? 'fish' : 'ask' }, lastEvent: last, names: NAMES, avatars: AVATARS4 });
        assert.deepEqual(v.hand.map(c => c.id).sort(), game.hands[seat].map(c => c.id).sort(), 'her own hand, whole');
        assert.deepEqual(v.counts, game.hands.map(hand => hand.length), 'and how many each seat holds');
        assert.equal(typeof v.pond, 'number');
        assert.deepEqual(v.catches, game.pairs, 'the pairs laid are public');
        const text = JSON.stringify(v);
        const hidden = [...game.pond, ...game.hands.flatMap((hand, other) => (other === seat ? [] : hand))].map(c => c.id);
        for (const id of hidden) assert.ok(!text.includes(`"${id}"`), `${id} is not in seat ${seat}'s view`);
        assert.ok(!('log' in v) && !('hands' in v), 'no log, no hands');
        assert.ok(!text.includes('"cardId"'), 'no card ids of a deal, a fish or a refill');
        assert.equal(v.names.length, seats);
      }
    }
  }
});

/** Three hands of five with nothing paired, dealt round the table. */
function stacked() {
  const deck = makeDeck();
  const by = id => deck.find(c => c.id === id);
  const hands = [
    ['froskur-1', 'snigill-1', 'salamandra-1', 'skjaldbaka-1', 'drekafluga-1'],
    ['snigill-2', 'brunnklukka-1', 'vatnalaesingi-1', 'fiskur-raudur-1', 'fiskur-gulur-1'],
    ['salamandra-2', 'fiskur-graenn-1', 'fiskur-blar-1', 'fiskur-appelsinugulur-1', 'fiskur-fjolublar-1'],
  ];
  const first = [];
  for (let i = 0; i < 5; i++) for (const hand of hands) first.push(by(hand[i]));
  return newGame({ seats: 3, stack: [...first, ...deck.filter(c => !first.includes(c))] }).game;
}

test('the view names what the seat does now: only the seat the table waits for has a duty, and a question is public', () => {
  const game = stacked();
  const base = { names: NAMES, avatars: AVATARS4 };
  const mine = viewFor(game, 0, { ...base, awaiting: { seat: 0, need: 'ask' } });
  assert.equal(mine.mode, 'ask');
  assert.deepEqual(mine.targets, [1, 2]);
  assert.equal(viewFor(game, 1, { ...base, awaiting: { seat: 0, need: 'ask' } }).mode, 'wait');
  assert.equal(viewFor(game, 0, { ...base, awaiting: null }).mode, 'wait', 'the table is playing something out');
  assert.deepEqual(viewFor(game, 1, { ...base, awaiting: null }).targets, []);
  // a question being answered: Anna (seat 1) holds a snigill and is asked for it by Egill
  const pending = { from: 0, to: 1, kind: 'snigill' };
  const anna = viewFor(game, 1, { ...base, pending, awaiting: { seat: 1, need: 'give', kind: 'snigill' } });
  assert.equal(anna.mode, 'give');
  assert.deepEqual(anna.asked, { from: 0, to: 1, kind: 'snigill', no: false });
  const bjarni = viewFor(game, 2, { ...base, pending, awaiting: { seat: 1, need: 'give', kind: 'snigill' } });
  assert.equal(bjarni.mode, 'wait');
  assert.deepEqual(bjarni.asked, anna.asked, 'every phone hears the question');
  assert.equal(questionText('snigill'), 'Áttu snigil?');
  // after a no the asker fishes, and everyone sees what was asked
  const { game: after } = ask(game, 0, 2, 'froskur');
  assert.equal(after.phase, 'fish');
  const fishing = viewFor(after, 0, { ...base, awaiting: { seat: 0, need: 'fish' } });
  assert.equal(fishing.mode, 'fish');
  assert.deepEqual(fishing.asked, { from: 0, to: 2, kind: 'froskur', no: true });
  assert.deepEqual(fishing.targets, []);
  assert.deepEqual(viewFor(after, 1, { ...base, awaiting: { seat: 0, need: 'fish' } }).asked, fishing.asked);
});

test('the end: winners are in the view, and nobody has a duty any more', () => {
  const { game } = played(3, 600, 'to-the-end').at(-1);
  assert.equal(game.phase, 'over');
  const v = viewFor(game, 0, { awaiting: { seat: 0, need: 'ask' }, names: NAMES, avatars: AVATARS4 });
  assert.equal(v.mode, 'over');
  assert.deepEqual(v.winners, game.winners);
  assert.deepEqual(v.targets, []);
  assert.equal(winnersWords([1], NAMES), 'Anna vann!');
  assert.equal(winnersWords([0, 3], NAMES), 'Egill og Uggeðla unnu jafnt!');
  assert.equal(winnersWords([0, 1, 2], NAMES), 'Egill, Anna og Bjarni unnu jafnt!');
});

test('the public part of an event has no card ids', () => {
  const { events } = played(3, 30, 'events').at(-1);
  for (const event of events.map(publicEvent).filter(Boolean)) assert.ok(!('cardId' in event) && !('cardIds' in event));
  assert.equal(publicEvent({ type: 'deal', seat: 1, cardId: 'x-1' }), null);
  assert.equal(publicEvent({ type: 'fish', seat: 1, cardId: 'froskur-1', lucky: true }).lucky, true);
  assert.deepEqual(publicEvent({ type: 'pair', seat: 2, kind: 'snigill', cardIds: ['snigill-1', 'snigill-2'] }), { type: 'pair', seat: 2, kind: 'snigill' });
});

test('a legal act is passed on as the table will play it, and only the one the table waits for', () => {
  const game = stacked();
  assert.deepEqual(actOf(game, 0, { type: 'ask', target: 1, kind: 'snigill', extra: 'ignored' }, { seat: 0, need: 'ask' }), { type: 'ask', target: 1, kind: 'snigill' });
  // the one asked: gives the card of the kind, or says no when she lacks it
  assert.deepEqual(actOf(game, 1, { type: 'give', cardId: 'snigill-2' }, { seat: 1, need: 'give', kind: 'snigill' }), { type: 'give', cardId: 'snigill-2' });
  assert.deepEqual(actOf(game, 1, { type: 'no' }, { seat: 1, need: 'no', kind: 'froskur' }), { type: 'no' }, 'a kind she lacks');
  const { game: sent } = ask(game, 0, 2, 'froskur');
  assert.deepEqual(actOf(sent, 0, { type: 'fish' }, { seat: 0, need: 'fish' }), { type: 'fish' });
});

test('an illegal guest act changes nothing: the game, what the table waits for, and the view stay as they were', () => {
  const game = stacked();
  const seat = 0;
  const awaiting = { seat, need: 'ask' };
  const before = JSON.stringify({ game, awaiting });
  const viewBefore = JSON.stringify(viewFor(game, seat, { awaiting, names: NAMES, avatars: AVATARS4 }));
  const held = 'froskur';
  const lacking = KINDS.map(k => k.id).find(id => !holds(game, seat, id));
  const illegal = [
    null, undefined, 'ask', 42, [], {}, { type: 7 }, { type: 'jump' }, { type: '' },
    { type: 'give', cardId: 'froskur-1' }, // she was not asked
    { type: 'no' }, // she was not asked
    { type: 'fish' }, // the pond is not calling
    { type: 'ask', target: seat, kind: held }, // herself
    { type: 'ask', target: 9, kind: held }, { type: 'ask', target: -1, kind: held }, { type: 'ask', target: 1.5, kind: held }, { type: 'ask', target: '1', kind: held },
    { type: 'ask', target: 1, kind: lacking }, // a kind she does not hold
    { type: 'ask', target: 1, kind: 'not-a-kind' }, { type: 'ask', target: 1 }, { type: 'ask', kind: held },
  ];
  for (const act of illegal) assert.equal(actOf(game, seat, act, awaiting), null, JSON.stringify(act));
  // a seat with no cards cannot be asked
  const bare = { ...game, hands: [game.hands[0], [], game.hands[2]] };
  assert.equal(actOf(bare, 0, { type: 'ask', target: 1, kind: held }, awaiting), null);
  // another seat's act, or any act when the table waits for nobody or for somebody else, is nothing either
  const legal = { type: 'ask', target: 1, kind: held };
  assert.notEqual(actOf(game, seat, legal, awaiting), null, 'the same act is fine from the right seat');
  assert.equal(actOf(game, 2, legal, awaiting), null, 'but not from another seat');
  assert.equal(actOf(game, seat, legal, null), null, 'nor while the table plays something out');
  assert.equal(actOf(game, seat, legal, { seat: 2, need: 'ask' }), null, 'nor while it waits for somebody else');
  assert.equal(actOf(game, seat, legal, { seat, need: 'fish' }), null, 'nor for another thing than it waits for');
  // a give of a card she does not hold, or of the wrong kind; a no while she holds the kind
  assert.equal(actOf(game, 1, { type: 'give', cardId: 'brunnklukka-1' }, { seat: 1, need: 'give', kind: 'snigill' }), null, 'the wrong card');
  assert.equal(actOf(game, 1, { type: 'give', cardId: 'snigill-1' }, { seat: 1, need: 'give', kind: 'snigill' }), null, 'a card she does not have');
  assert.equal(actOf(game, 1, { type: 'give', cardId: 'snigill-2' }, { seat: 1, need: 'no', kind: 'snigill' }), null, 'a give when she must say no');
  assert.equal(actOf(game, 1, { type: 'no' }, { seat: 1, need: 'no', kind: 'snigill' }), null, 'no, when she holds the kind');
  assert.equal(actOf(game, 1, { type: 'no' }, { seat: 1, need: 'give', kind: 'snigill' }), null, 'no, when she must give');
  assert.equal(JSON.stringify({ game, awaiting }), before, 'the game and the wait are as they were');
  assert.equal(JSON.stringify(viewFor(game, seat, { awaiting, names: NAMES, avatars: AVATARS4 })), viewBefore);
  // nothing is allowed once the game is over
  const over = played(3, 600, 'over-for-acts').at(-1).game;
  assert.equal(actOf(over, 0, { type: 'fish' }, { seat: 0, need: 'fish' }), null);
});

test('a round kept in the save comes back as the rules\' data, and anything that is not a whole round under way is refused', () => {
  const { game } = played(3, 25, 'kept').at(-1);
  assert.notEqual(game.phase, 'over');
  const sent = JSON.parse(JSON.stringify(game));
  const back = keptGameOf(sent);
  assert.deepEqual(back, { ...game, winners: null });
  assert.ok(back.hands.flat().every(card => Object.isFrozen(card)), 'every card is the deck\'s own');
  assert.equal(keptGameOf(null), null);
  assert.equal(keptGameOf({}), null);
  assert.equal(keptGameOf({ ...sent, hands: [sent.hands[0]] }), null, 'one seat is no table');
  assert.equal(keptGameOf({ ...sent, pond: sent.pond.slice(1) }), null, 'a card is missing');
  assert.equal(keptGameOf({ ...sent, pond: [...sent.pond.slice(1), sent.pond[0], sent.pond[0]] }), null, 'a card twice');
  assert.equal(keptGameOf({ ...sent, turn: 7 }), null);
  assert.equal(keptGameOf({ ...sent, phase: 'over' }), null);
  assert.equal(keptGameOf({ ...sent, pairs: sent.pairs.slice(0, 2) }), null);
  assert.equal(keptGameOf({ ...sent, hands: sent.hands.map(hand => hand.map(card => ({ id: `${card.id}x` }))) }), null, 'strangers are not cards');
  const done = played(3, 600, 'kept-over').at(-1).game;
  assert.equal(keptGameOf(JSON.parse(JSON.stringify(done))), null, 'a round that is over is not kept');
});

test('a tie the child is in is a win for the save, and the round lost grows the losses', () => {
  assert.equal(childWon([0]), true);
  assert.equal(childWon([1, 0]), true, 'a tie he is in');
  assert.equal(childWon([1, 2]), false);
  const won = afterRoundSave({ skill: null, losses: 2, wins: 4 }, [0, 2]);
  assert.deepEqual([won.wins, won.losses], [5, 0]);
  const lost = afterRoundSave({ skill: 0.2, losses: 0, wins: 1 }, [2]);
  assert.deepEqual([lost.wins, lost.losses], [1, 1]);
  assert.ok(lost.skill < 0.2);
});
