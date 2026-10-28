// remake/tests/eitt-turn-cue.test.mjs
// Whose turn it is in "Eitt!" over Fjölspil, impossible to miss: on her own phone a frame, a card, a chime and a buzz as the turn
// passes to her, her hand waiting while it is another's; on every screen the seat with the turn marked and the way the turn goes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';
import { fakeTimers, $, $$, tap } from './fjolspil-guest-rig.mjs';
import { createFakeContext } from './fake-audio.mjs';
import { renderEitt } from '../engine/fjolspil/guest-eitt.js';
import { createEittGame } from '../engine/eitt/table.js';
import { makeDeck, newGame } from '../engine/eitt/rules.js';
import { createSeats, avatarOf } from '../engine/fjolspil/seats.js';
import { setWay, wayElement } from '../engine/eitt/way.js';
import { eittSounds, EITT_SFX, EITT_GAPS } from '../engine/eitt/eitt-sounds.js';
import { createSfx } from '../engine/audio/sfx.js';

const card = id => makeDeck().find(c => c.id === id);
const COUNTS = [
  { seat: 0, name: 'Egill', avatar: 'egill', cards: 5 },
  { seat: 1, name: 'Anna', avatar: 'sloedla', cards: 3 },
  { seat: 2, name: 'Bjarni', avatar: 'gramedla', cards: 4 },
];
/** A view for seat 1 (Anna), the turn Egill's unless `extra` says otherwise. */
const viewOf = (extra = {}) => ({
  screen: 'eitt', you: 1, turn: 0, direction: 1, colour: 'red', top: card('red-5-a'), lastPlay: null,
  hand: [card('red-7-a'), card('blue-2-a')], playable: [], canDraw: false, canPass: false, needsColour: null, eittNeeded: false, canCatch: null,
  counts: COUNTS, winner: null, ...extra,
});
const HERS = { turn: 1, playable: ['red-7-a'] };

/** Anna's phone: the screen in a fake page with a window that has timers and a buzz, and the device's effects that note what they play. */
function phone() {
  const doc = new FakeDocument(['game']);
  const timers = fakeTimers();
  const buzzes = [];
  const played = [];
  const sent = [];
  doc.defaultView = {
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, addEventListener() {},
    navigator: { vibrate: pattern => { buzzes.push(pattern); return true; } },
  };
  const audio = { effects: () => ({ play: name => { played.push(name); return true; } }) };
  const root = doc.getElementById('game');
  const show = view => renderEitt(root, view, { send: act => sent.push(act), doc, audio });
  const chimes = () => played.filter(name => name === 'turn').length;
  const cue = () => $(root, '.spil-eitt-cue');
  const frame = () => $(root, '.spil-eitt-frame');
  const hand = () => $(root, '.spil-eitt-hand');
  return { doc, root, timers, buzzes, played, sent, show, chimes, cue, frame, hand };
}

test('as the turn passes to her, her phone shows the card and the frame, chimes once and buzzes once', () => {
  const p = phone();
  p.show(viewOf()); // Egill's turn
  assert.equal(p.cue().hidden, true, 'no card while it is another\'s turn');
  assert.equal(p.frame().classList.contains('on'), false);
  assert.equal(p.chimes(), 0);
  assert.deepEqual(p.buzzes, []);

  p.show(viewOf(HERS)); // the turn comes to her
  assert.equal(p.cue().hidden, false, 'the card is up');
  assert.equal(p.frame().classList.contains('on'), true, 'the frame glows');
  assert.equal(p.chimes(), 1, 'the chime is asked for once');
  assert.deepEqual(p.buzzes, [[60, 40, 60]], 'and the phone buzzes once');
  assert.equal($(p.root, '.spil-eitt-cue-words').textContent, 'Þú átt leik!');
  assert.match($(p.root, '.spil-eitt-cue-face img').src ?? '', /parasaurolophus/, 'with her own picture');
  assert.equal(p.cue().style['--c'], avatarOf('sloedla').colour, 'in her own colour');
  assert.equal(p.frame().style['--c'], avatarOf('sloedla').colour);

  p.show(viewOf({ ...HERS, hand: [card('red-7-a'), card('blue-2-a'), card('wild-a')] })); // a view that repeats her turn
  p.show(viewOf({ ...HERS, canDraw: false }));
  assert.equal(p.chimes(), 1, 'a view that repeats her turn does not chime again');
  assert.equal(p.buzzes.length, 1);
  assert.equal(p.frame().classList.contains('on'), true, 'the frame stays while the turn is hers');

  p.show(viewOf({ turn: 2 })); // it passes on to Bjarni
  assert.equal(p.cue().hidden, true, 'the card goes with her turn');
  assert.equal(p.frame().classList.contains('on'), false);
  p.show(viewOf({ turn: 0 })); // and on to Egill: nothing for her
  assert.equal(p.chimes(), 1, 'a turn that passes to somebody else makes no sound here');
  assert.equal(p.buzzes.length, 1);

  p.show(viewOf(HERS)); // her turn again
  assert.equal(p.chimes(), 2);
  assert.equal(p.cue().hidden, false);
});

test('a screen that opens on her turn gives her the card, and the end of a round gives her nothing', () => {
  const p = phone();
  p.show(viewOf(HERS));
  assert.equal(p.cue().hidden, false);
  assert.equal(p.chimes(), 1);
  p.show(viewOf({ ...HERS, winner: 0 })); // Egill won: her turn is not one
  assert.equal(p.cue().hidden, true);
  assert.equal(p.frame().classList.contains('on'), false);
  assert.equal(p.hand().classList.contains('waiting'), false, 'a hand is not waiting once the round is over');
  p.show(viewOf({ turn: 0 })); // the next round, Egill's again
  p.show(viewOf({ ...HERS }));
  assert.equal(p.chimes(), 2);
});

test('her card goes after two seconds and a half, or at her first touch, which it lets through', () => {
  const p = phone();
  p.show(viewOf({ turn: 0 }));
  p.show(viewOf(HERS));
  assert.equal(p.doc.listenerCount('pointerdown'), 1, 'the page listens for her first touch');
  p.timers.advance(2400);
  assert.equal(p.cue().hidden, false, 'still up at 2.4 s');
  p.timers.advance(150);
  assert.equal(p.cue().hidden, true, 'gone after 2.5 s');
  assert.equal(p.doc.listenerCount('pointerdown'), 0, 'and the page listens no more');
  assert.equal(p.frame().classList.contains('on'), true, 'the frame stays with her turn');

  p.show(viewOf({ turn: 2 }));
  p.show(viewOf(HERS)); // again
  assert.equal(p.cue().hidden, false);
  const touch = pointerEvent('pointerdown', { x: 40, y: 400 });
  p.doc.dispatchEvent(touch);
  assert.equal(p.cue().hidden, true, 'her first touch puts the card away');
  assert.equal(touch.defaultPrevented, false, 'and the touch goes on to what it was for');
  assert.equal(p.doc.listenerCount('pointerdown'), 0);
  tap($$(p.root, '.spil-eitt-hand .eitt-card')[0]);
  assert.deepEqual(p.sent, [{ type: 'play', cardId: 'red-7-a' }], 'the tap that plays a card plays it');
  assert.equal(p.timers.count, 0, 'no timer is left running for a card that is gone');
});

test('her hand is dimmed and lowered while another seat has the turn, and lifts when hers comes', () => {
  const p = phone();
  p.show(viewOf({ turn: 0 }));
  assert.equal(p.hand().classList.contains('waiting'), true, 'Egill\'s turn: waiting');
  p.show(viewOf({ turn: 2 }));
  assert.equal(p.hand().classList.contains('waiting'), true);
  p.show(viewOf(HERS));
  assert.equal(p.hand().classList.contains('waiting'), false, 'hers: lifted');
  p.show(viewOf({ turn: 0 }));
  assert.equal(p.hand().classList.contains('waiting'), true);
});

test('the heading wears the colour of whoever has the turn, and that seat\'s fan is marked and ringed in its own colour', () => {
  const p = phone();
  p.show(viewOf({ turn: 2 }));
  const title = $(p.root, '.spil-eitt-turn');
  assert.equal(title.textContent, 'Bjarni á leik');
  assert.equal(title.style['--c'], avatarOf('gramedla').colour);
  const seats = [...$$(p.root, '.spil-eitt-seat')];
  assert.deepEqual(seats.map(li => li.dataset.seat), ['2', '0'], 'the others in seat order after hers');
  assert.deepEqual(seats.map(li => li.classList.contains('turn')), [true, false], 'only Bjarni\'s fan has the turn');
  assert.equal(seats[0].style['--c'], avatarOf('gramedla').colour);
  p.show(viewOf(HERS));
  assert.equal(title.textContent, 'Þú átt leik!');
  assert.equal(title.style['--c'], avatarOf('sloedla').colour);
  assert.deepEqual([...$$(p.root, '.spil-eitt-seat')].map(li => li.classList.contains('turn')), [false, false], 'her own turn marks no fan');
});

test('the arrows round the pile show the way the turn goes and spin once when a reverse turns it', () => {
  const p = phone();
  p.show(viewOf({ turn: 0, direction: 1 }));
  const way = $(p.root, '.eitt-way');
  assert.ok(way, 'the arrows are in the pile');
  assert.equal(way.hidden, false);
  assert.equal(way.dataset.way, '1', 'clockwise');
  assert.equal($$(p.root, '.spil-eitt-pile .eitt-card').length, 1, 'and they are no card of the pile');
  const spins = [];
  way.animate = (...args) => { spins.push(args); };
  p.show(viewOf({ turn: 0, direction: 1 }));
  assert.equal(spins.length, 0, 'a view that changes nothing turns nothing');
  p.show(viewOf({ turn: 2, direction: -1 })); // a reverse: the turn goes back the other way
  assert.equal(way.dataset.way, '-1', 'anticlockwise');
  assert.equal(spins.length, 1, 'with one spin as it flips');
  p.show(viewOf({ turn: 2, direction: -1, hand: [card('red-7-a')] }));
  assert.equal(spins.length, 1);
  p.show(viewOf({ turn: 0, direction: 1 })); // another reverse: back again
  assert.equal(way.dataset.way, '1');
  assert.equal(spins.length, 2);
});

test('with two seats there is no way to show: a reverse is only a skip', () => {
  const p = phone();
  p.show(viewOf({ counts: COUNTS.slice(0, 2) }));
  assert.equal($(p.root, '.eitt-way').hidden, true);
  p.show(viewOf({ counts: COUNTS }));
  assert.equal($(p.root, '.eitt-way').hidden, false);
});

test('setWay: the first setting turns nothing, a flip spins once, and a calm device only changes over', () => {
  const doc = new FakeDocument();
  const el = wayElement(doc);
  const spins = [];
  el.animate = (...args) => { spins.push(args); };
  assert.equal(setWay(el, 1), false);
  assert.equal(setWay(el, 1), false);
  assert.equal(spins.length, 0);
  assert.equal(setWay(el, -1), true);
  assert.equal(el.dataset.way, '-1');
  assert.equal(spins.length, 1);
  assert.equal(setWay(el, 1, { calm: true }), true, 'it turned');
  assert.equal(el.dataset.way, '1');
  assert.equal(spins.length, 1, 'but with no spin under reduced motion');
});

test('the chime is one of Eitt!\'s own effects, in the key, and cannot double', () => {
  assert.ok(EITT_SFX.includes('turn'));
  assert.ok(EITT_GAPS.turn >= 1, 'a gap longer than the chime itself');
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: { key: [523.43, 587.53, 659.48, 784.26, 880.31] }, sounds: eittSounds, gaps: EITT_GAPS });
  assert.equal(sfx.play('turn'), true);
  assert.equal(sfx.play('turn'), false, 'asked again at once, it does not sound');
  context.advance(EITT_GAPS.turn + 0.1);
  assert.equal(sfx.play('turn'), true);
});

// ---- Egill's big screen ---------------------------------------------------------------------------------------------------

/**
 * The big screen's table for a round of Fjölspil kept under way (Egill and two guests), opened and taken up: `turn` and `direction` as
 * kept, and `give` a card put in Egill's hand. Resolves when the table waits for its first move.
 */
async function bigScreen(t, { turn, direction = 1, give = null }) {
  t.mock.method(console, 'warn', () => {}); // Kambeðla's live view needs a real page; her picture stands in
  const doc = new FakeDocument(['eitt']);
  const root = doc.getElementById('eitt');
  const seats = createSeats({});
  seats.join({ guestId: '1'.repeat(32), name: 'Ásta', avatar: 'kambedla' });
  seats.join({ guestId: '2'.repeat(32), name: 'Bjarni', avatar: 'gramedla' });
  let seed = 7;
  const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const game = { ...newGame({ players: 3, random }), turn, direction };
  if (give) { // swap the card into Egill's first place, wherever it lay
    const owner = [game.deck, game.pile, ...game.hands].find(zone => zone.some(held => held.id === give));
    const into = owner.find(held => held.id === give);
    if (owner !== game.hands[0]) {
      owner[owner.indexOf(into)] = game.hands[0][0];
      game.hands[0][0] = into;
    }
    game.colour = into.colour;
  }
  const fjolspil = {
    seats, send() {}, onAct() {}, async resume() {}, async openLobby() { return null; }, async waitFor() { return 'back'; }, closeGame() {},
  };
  const snapshot = seats.snapshot();
  const save = { getEitt: () => ({ tutorialDone: true, game, seats: { ...snapshot, seats: snapshot.seats.slice(0, 3) } }), setEitt() {} };
  const eitt = createEittGame(doc, { save, fjolspil, win: undefined, random });
  t.after(() => eitt.close());
  eitt.open();
  for (const type of ['pointerdown', 'pointerup']) root.querySelector('.eitt-continue').dispatchEvent(pointerEvent(type, { x: 10, y: 10 }));
  const until = async (ready, what) => {
    for (let waited = 0; waited < 5000 && !ready(); waited += 50) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(ready(), what);
  };
  const rows = () => [...root.querySelectorAll('.eitt-seat')];
  const me = () => root.querySelector('.eitt-me');
  const way = () => root.querySelector('.eitt-way');
  return { eitt, root, rows, me, way, until };
}

test('on the big screen the seat with the turn is marked, with its own colour, and Egill\'s own tag when it is his', async t => {
  const big = await bigScreen(t, { turn: 1 });
  await big.until(() => big.rows().length === 2 && big.rows()[0].classList.contains('turn'), 'Ásta\'s row has the turn');
  assert.deepEqual(big.rows().map(row => row.classList.contains('turn')), [true, false]);
  assert.equal(big.me().classList.contains('turn'), false, 'Egill is not the one');
  assert.equal(big.rows()[0].style['--c'], avatarOf('kambedla').colour, 'its ring is in the seat\'s own colour');
  assert.equal(big.rows()[1].style['--c'], avatarOf('gramedla').colour);
  assert.equal(big.me().style['--c'], avatarOf('egill').colour);
  assert.equal(big.way().dataset.way, '1');
  assert.equal(big.way().hidden, false);
  assert.equal(big.root.querySelectorAll('.eitt-me .eitt-seat-name')[0].textContent, 'Egill');
});

test('on the big screen a reverse turns the arrows once, and the turn goes to the seat before Egill, which gets the mark', async t => {
  const big = await bigScreen(t, { turn: 0, give: 'red-reverse-a' });
  await big.until(() => big.eitt.phase === 'child', 'the table waits for Egill');
  assert.equal(big.me().classList.contains('turn'), true, 'Egill\'s own tag has the turn');
  assert.deepEqual(big.rows().map(row => row.classList.contains('turn')), [false, false]);
  assert.equal(big.way().dataset.way, '1');
  const spins = [];
  big.way().animate = (...args) => { spins.push(args); };
  const reverse = big.root.querySelector('.eitt-hand .eitt-card.reverse');
  for (const type of ['pointerdown', 'pointerup']) reverse.dispatchEvent(pointerEvent(type, { x: 10, y: 10 }));
  await big.until(() => big.way().dataset.way === '-1' && big.rows()[1].classList.contains('turn'), 'the turn goes back round');
  assert.equal(big.way().dataset.way, '-1', 'the arrows go the other way');
  assert.equal(spins.length, 1, 'with one spin');
  assert.equal(big.eitt.game.turn, 2);
  assert.deepEqual(big.rows().map(row => row.classList.contains('turn')), [false, true], 'Bjarni, the seat before Egill, has the mark');
  assert.equal(big.me().classList.contains('turn'), false, 'and Egill\'s tag has not');
});
