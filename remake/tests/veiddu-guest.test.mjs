// remake/tests/veiddu-guest.test.mjs
// Veiddu on a guest's device (engine/fjolspil/guest-veiddu.js, Task 9): her own hand, the others' tags, the one thing she may do now, and
// the signs that it is hers (the frame, the card, the chime). Run in the guest page's rig with a fake DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDocument } from './fake-dom.mjs';
import { tap, view } from './fjolspil-guest-rig.mjs';
import { renderVeiddu, heardText, WORDS } from '../engine/fjolspil/guest-veiddu.js';
import { viewFor } from '../engine/veiddu/remote.js';
import { newGame, ask } from '../engine/veiddu/rules.js';
import { makeDeck } from '../engine/veiddu/cards.js';
import { rig, FakeStorage, $, $$ } from './fjolspil-guest-rig.mjs';

const NAMES = ['Egill', 'Anna', 'Bjarni'];
const AVATARS = ['egill', 'kambedla', 'gramedla'];

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
const make = (game, seat, extra = {}) => viewFor(game, seat, { names: NAMES, avatars: AVATARS, ...extra });

/** The screen in a root of its own, with a fake audio (the effects it asked for and what they played), a window with a buzz, and the acts sent. */
function screen({ buzz = true } = {}) {
  const doc = new FakeDocument([]);
  const root = doc.createElement('section');
  const played = [];
  const buzzes = [];
  const timers = [];
  doc.defaultView = {
    navigator: buzz ? { userActivation: { hasBeenActive: true }, vibrate: pattern => { buzzes.push(pattern); return true; } } : {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { timers[id - 1] = null; },
    addEventListener() {},
  };
  const options = [];
  const audio = { effects(opts) { options.push(opts); return { play: (name, detail) => played.push(detail ? [name, detail] : name) }; } };
  const sent = [];
  const show = v => renderVeiddu(root, v, { send: act => sent.push(act), doc, audio });
  return { doc, root, played, buzzes, timers, options, sent, show };
}
const seatTag = (root, seat) => $$(root, '.spil-veiddu-seat').find(li => li.dataset.seat === String(seat));
const hit = (root, seat) => seatTag(root, seat).querySelector('.spil-veiddu-seat-hit');
const cardOf = (root, id) => $$(root, '.veiddu-card').find(card => card.dataset.id === id);

test('the screen shows her own hand and the others\' tags: a name, a picture, how many cards and their pairs, never their cards', () => {
  const game = stacked();
  const s = screen();
  s.show(make(game, 1, { awaiting: { seat: 0, need: 'ask' } }));
  assert.deepEqual($$(s.root, '.spil-veiddu-hand .veiddu-card').map(card => card.dataset.id).sort(), game.hands[1].map(c => c.id).sort());
  const tags = $$(s.root, '.spil-veiddu-seat');
  assert.deepEqual(tags.map(li => li.dataset.seat), ['2', '0'], 'the others, in the order the turn goes after hers');
  assert.deepEqual(tags.map(li => li.querySelector('.spil-veiddu-name').textContent), ['Bjarni', 'Egill']);
  assert.deepEqual(tags.map(li => li.querySelector('.spil-veiddu-count').textContent), ['5', '5']);
  const text = JSON.stringify($$(s.root, '.veiddu-card').map(card => card.dataset.id));
  for (const other of [...game.hands[0], ...game.hands[2], ...game.pond]) assert.ok(!text.includes(`"${other.id}"`), `${other.id} is not on her screen`);
  assert.equal($(s.root, '.spil-veiddu-pond-count').textContent, String(game.pond.length));
  assert.equal($(s.root, '.spil-veiddu-turn').textContent, 'Egill á leik');
  assert.equal($(s.root, '.spil-veiddu-seat-hit').getAttribute('aria-label') ?? '', '', 'the tag button has no extra label of its own');
});

test('her turn: she lifts a card, the seats she may ask glow, and a tap on one sends the ask', () => {
  const game = stacked();
  const s = screen();
  s.show(make(game, 0, { awaiting: { seat: 0, need: 'ask' } }));
  assert.equal($(s.root, '.spil-veiddu-turn').textContent, WORDS.mine);
  assert.equal($(s.root, '.spil-veiddu-do').textContent, WORDS.pick);
  assert.equal($$(s.root, '.spil-veiddu-seat.target').length, 0, 'nothing glows before a card is picked');
  tap(hit(s.root, 1));
  assert.deepEqual(s.sent, [], 'a seat before a card: nothing is sent');
  assert.deepEqual(s.played.at(-1), 'wiggle');
  tap(cardOf(s.root, 'snigill-1'));
  assert.equal(cardOf(s.root, 'snigill-1').classList.contains('picked'), true);
  assert.equal($(s.root, '.spil-veiddu-do').textContent, WORDS.target);
  assert.deepEqual($$(s.root, '.spil-veiddu-seat.target').map(li => li.dataset.seat), ['1', '2']);
  tap(cardOf(s.root, 'froskur-1')); // another card changes it
  assert.equal(cardOf(s.root, 'snigill-1').classList.contains('picked'), false);
  assert.equal(cardOf(s.root, 'froskur-1').classList.contains('picked'), true);
  tap(hit(s.root, 2));
  assert.deepEqual(s.sent, [{ type: 'ask', target: 2, kind: 'froskur' }]);
  tap(hit(s.root, 1));
  tap(cardOf(s.root, 'snigill-1'));
  assert.equal(s.sent.length, 1, 'one act for each view: a second tap before the next sends nothing');
  // the next view (the question is being answered) frees her again
  s.show(make(game, 0, { awaiting: { seat: 2, need: 'no', kind: 'froskur' }, pending: { from: 0, to: 2, kind: 'froskur' } }));
  assert.equal($(s.root, '.spil-veiddu-turn').textContent, WORDS.mine);
  assert.equal($(s.root, '.spil-veiddu-do').hidden, true, 'she waits for the answer');
  assert.deepEqual($$(s.root, '.spil-veiddu-seat.target'), []);
});

test('asked for an animal she holds: the card lights and is the one right answer; any other wiggles', () => {
  const game = stacked();
  const s = screen();
  const pending = { from: 0, to: 1, kind: 'snigill' };
  s.show(make(game, 1, { pending, awaiting: { seat: 1, need: 'give', kind: 'snigill' } }));
  assert.equal($(s.root, '.spil-veiddu-turn').textContent, 'Egill á leik');
  assert.equal($(s.root, '.spil-veiddu-do').textContent, `Áttu snigil? ${WORDS.give}`);
  assert.equal(cardOf(s.root, 'snigill-2').classList.contains('give'), true);
  assert.equal(cardOf(s.root, 'brunnklukka-1').classList.contains('give'), false);
  assert.equal($(s.root, '.spil-veiddu-no').hidden, true);
  tap(cardOf(s.root, 'brunnklukka-1'));
  assert.deepEqual(s.sent, []);
  assert.equal(s.played.at(-1), 'wiggle');
  tap(cardOf(s.root, 'snigill-2'));
  assert.deepEqual(s.sent, [{ type: 'give', cardId: 'snigill-2' }]);
});

test('asked for an animal she has not got: "Farðu að veiða!" is the one answer, and cards do nothing', () => {
  const game = stacked();
  const s = screen();
  const pending = { from: 0, to: 2, kind: 'froskur' };
  s.show(make(game, 2, { pending, awaiting: { seat: 2, need: 'no', kind: 'froskur' } }));
  const button = $(s.root, '.spil-veiddu-no');
  assert.equal(button.hidden, false);
  assert.equal(button.querySelector('span').textContent, 'Farðu að veiða!');
  assert.equal($(s.root, '.spil-veiddu-do').textContent, `Áttu frosk? ${WORDS.no}`);
  tap(cardOf(s.root, 'fiskur-blar-1'));
  assert.deepEqual(s.sent, []);
  tap(button);
  assert.deepEqual(s.sent, [{ type: 'no' }]);
});

test('told no, she fishes: the pond calls, and a tap on it draws; at any other time it only wiggles', () => {
  const game = stacked();
  const { game: after } = ask(game, 0, 2, 'froskur');
  const s = screen();
  s.show(make(after, 1, { awaiting: { seat: 0, need: 'fish' } }));
  tap($(s.root, '.spil-veiddu-pond'));
  assert.deepEqual(s.sent, [], 'it is not her turn');
  assert.equal(s.played.at(-1), 'wiggle');
  assert.equal($(s.root, '.spil-veiddu-pond').classList.contains('calls'), false);
  s.show(make(after, 0, { awaiting: { seat: 0, need: 'fish' } }));
  assert.equal($(s.root, '.spil-veiddu-pond').classList.contains('calls'), true);
  assert.equal($(s.root, '.spil-veiddu-do').textContent, WORDS.fish);
  tap($(s.root, '.spil-veiddu-pond'));
  assert.deepEqual(s.sent, [{ type: 'fish' }]);
});

test('the turn is hard to miss: a frame in her colour, her card, the chime and a buzz, once when something becomes hers', () => {
  const game = stacked();
  const s = screen();
  s.show(make(game, 1, { awaiting: { seat: 0, need: 'ask' } }));
  assert.equal($(s.root, '.spil-veiddu-frame').classList.contains('on'), false);
  assert.equal($(s.root, '.spil-veiddu-cue').hidden, true);
  assert.deepEqual(s.played.filter(name => name === 'turn'), []);
  // a question for her: it becomes hers
  const pending = { from: 0, to: 1, kind: 'snigill' };
  s.show(make(game, 1, { pending, awaiting: { seat: 1, need: 'give', kind: 'snigill' } }));
  assert.equal($(s.root, '.spil-veiddu-frame').classList.contains('on'), true);
  assert.equal($(s.root, '.spil-veiddu-frame').style['--c'], '#ab85c1', 'in her own colour (Kambeðla\'s)');
  const cue = $(s.root, '.spil-veiddu-cue');
  assert.equal(cue.hidden, false);
  assert.equal($(s.root, '.spil-veiddu-cue-words').textContent, 'Egill spyr þig!');
  assert.match($(s.root, '.spil-veiddu-cue-face img').src, /kambedla-render\.webp$/);
  assert.deepEqual(s.played.filter(name => name === 'turn'), ['turn']);
  assert.deepEqual(s.buzzes, [[60, 40, 60]]);
  assert.equal(s.options.at(-1).sounds.name, 'veidduSounds', 'the game\'s own effects, on the page\'s audio');
  assert.ok(!('voice' in s.options.at(-1)) && !String(s.options.at(-1).music).includes('lines'), 'never a voice');
  // the same view again, or another that is still hers, does not ring again
  s.show(make(game, 1, { pending, awaiting: { seat: 1, need: 'give', kind: 'snigill' } }));
  assert.deepEqual(s.played.filter(name => name === 'turn'), ['turn']);
  assert.equal(s.buzzes.length, 1);
  // it passes to somebody else: the frame goes, and the card with it
  s.show(make(game, 1, { awaiting: { seat: 2, need: 'ask' } }));
  assert.equal($(s.root, '.spil-veiddu-frame').classList.contains('on'), false);
  assert.equal($(s.root, '.spil-veiddu-cue').hidden, true);
  // and her turn comes
  s.show(make(game, 0, { awaiting: { seat: 0, need: 'ask' } }));
  s.show(make(game, 1, { awaiting: { seat: 1, need: 'ask' } }));
  assert.equal($(s.root, '.spil-veiddu-cue-words').textContent, WORDS.mine);
  assert.deepEqual(s.played.filter(name => name === 'turn'), ['turn', 'turn']);
  // her first touch puts the card away
  const hold = s.timers.filter(Boolean).at(-1);
  hold.fn();
  assert.equal(cue.hidden, true, 'after its time');
});

test('the end: the winners in the heading, her fanfare only if she won, and nothing left to do', () => {
  const game = stacked();
  const over = { ...game, phase: 'over', winners: [1] };
  const s = screen();
  s.show(make(game, 1, { awaiting: { seat: 1, need: 'ask' } }));
  s.show(make(over, 1, { awaiting: { seat: 1, need: 'ask' } }));
  assert.equal($(s.root, '.spil-veiddu-turn').textContent, 'Anna vann!');
  assert.equal($(s.root, '.spil-veiddu-turn').classList.contains('won'), true);
  assert.equal($(s.root, '.spil-veiddu-frame').classList.contains('on'), false);
  assert.ok(s.played.includes('fanfare'));
  const loser = screen();
  loser.show(make(game, 0, { awaiting: { seat: 1, need: 'ask' } }));
  loser.show(make(over, 0, { awaiting: { seat: 1, need: 'ask' } }));
  assert.ok(!loser.played.includes('fanfare'), 'a round lost has no jingle');
});

test('a big hand lies in rows with every card at least 88 px across, and what was said is a line of words with no name in a case', () => {
  const s = screen();
  const kinds = ['froskur', 'skjaldbaka', 'drekafluga', 'brunnklukka', 'vatnalaesingi', 'salamandra', 'snigill', 'fiskur-raudur', 'fiskur-gulur', 'fiskur-graenn', 'fiskur-blar', 'fiskur-appelsinugulur', 'fiskur-fjolublar'];
  const hand = kinds.map(kind => ({ id: `${kind}-1`, kind }));
  s.show({ screen: 'veiddu', seat: 0, hand, counts: [13, 0, 0], catches: [[], [], []], pond: 39, turn: 0, phase: 'ask', asked: null, mode: 'ask', targets: [], lastEvent: null, names: NAMES, avatars: AVATARS, away: [], winners: [] });
  const cards = $$(s.root, '.spil-veiddu-hand .veiddu-card');
  assert.equal(cards.length, 13);
  const xs = cards.map(card => Number.parseFloat(card.style['--x']));
  const rows = [];
  xs.forEach((x, k) => { if (k === 0 || x <= xs[k - 1]) rows.push([]); rows.at(-1).push(x); }); // a new row where the cards start again at the left
  assert.ok(rows.length > 1, 'more than one row');
  for (const row of rows) for (let k = 1; k < row.length; k++) assert.ok(row[k] - row[k - 1] >= 88 - 0.5, 'the strip of each card showing is at least a finger');
  assert.equal(heardText({ type: 'ask', seat: 1, target: 2, kind: 'froskur' }, NAMES), 'Anna → Bjarni: Áttu frosk?');
  assert.equal(heardText({ type: 'give', from: 2, to: 1, kind: 'froskur' }, NAMES), 'Bjarni: Já!');
  assert.equal(heardText({ type: 'no', seat: 2, kind: 'froskur' }, NAMES), 'Bjarni: Nei!');
  assert.equal(heardText({ type: 'pair', seat: 1, kind: 'skjaldbaka' }, NAMES), 'Anna fékk par: Skjaldbaka');
  assert.equal(heardText({ type: 'fish', seat: 0, lucky: true }, NAMES), 'Egill veiddi það!');
  assert.equal(heardText({ type: 'fish', seat: 0, lucky: false }, NAMES), 'Egill veiddi!');
  assert.equal(heardText({ type: 'pond-empty' }, NAMES), 'Tjörnin er tóm!');
  assert.equal(heardText(null, NAMES), '');
  assert.equal(heardText({ type: 'ask', seat: 0, target: 1, kind: 'froskur' }, ['<b>Egill</b>', 'Anna']), '<b>Egill</b> → Anna: Áttu frosk?', 'a name is text');
});

test('through the guest page: a veiddu view is rendered on its own screen, an act goes to the big screen as an act message', () => {
  const storage = new FakeStorage();
  storage.setItem('mosi-fjolspil-guest', JSON.stringify({ guestId: 'a'.repeat(32), name: 'Anna', avatar: 'kambedla' }));
  const r = rig({ search: '?r=GULL', storage, views: { veiddu: renderVeiddu } });
  r.net.statusFn('connected');
  const game = stacked();
  r.net.message(view('veiddu', make(game, 1, { awaiting: { seat: 1, need: 'ask' } }), 1));
  assert.equal(r.page.screen, 'game');
  assert.equal($(r.root, '.spil-game').getAttribute('data-game'), 'veiddu');
  assert.equal($$(r.root, '.spil-veiddu-hand .veiddu-card').length, 5);
  tap($$(r.root, '.veiddu-card').find(card => card.dataset.id === 'snigill-2'));
  tap($$(r.root, '.spil-veiddu-seat-hit')[0]);
  assert.deepEqual(r.net.sent.at(-1), { v: 1, type: 'act', body: { type: 'ask', target: 2, kind: 'snigill' } });
});
