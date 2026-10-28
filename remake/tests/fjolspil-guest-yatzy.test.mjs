// remake/tests/fjolspil-guest-yatzy.test.mjs
// Litla Yatzy on a guest's phone (engine/fjolspil/guest-yatzy.js): the phone is the cup (roll, hold, pick a card), the big
// screen the table, and every view from it the whole picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDocument } from './fake-dom.mjs';
import { createFakeContext } from './fake-audio.mjs';
import { createSfx } from '../engine/audio/sfx.js';
import { rig, $, $$, view, tap } from './fjolspil-guest-rig.mjs';
import { renderYatzy } from '../engine/fjolspil/guest-yatzy.js';
import { yatzyPhoneSounds, YATZY_PHONE_GAPS, YATZY_PHONE_SFX } from '../engine/fjolspil/yatzy-phone-sounds.js';

const mine = (over = {}) => ({ screen: 'yatzy', you: 1, turn: 1, round: 2, rolls: 1, dice: [3, 3, 1, 5, 6], held: [true, true, false, false, false], roll: { seq: 4, by: 1 }, canRoll: true, canHold: true, canScore: true,
  cards: [{ id: 'pair', label: 'Eitt par', score: null, preview: 6, faces: [3, 3] }, { id: 'twoPairs', label: 'Tvö pör', score: null, preview: 0, faces: [] }, { id: 'threeKind', label: 'Þrír eins', score: 9, preview: null, faces: [3, 3, 3] }, { id: 'smallStraight', label: 'Röð', score: null, preview: 0, faces: [] }, { id: 'yatzy', label: 'Yatzy', score: null, preview: 0, faces: [] }],
  players: [{ seat: 0, name: 'Egill', avatar: 'egill', total: 23 }, { seat: 1, name: 'Ásta', avatar: 'kambedla', total: 15 }, { seat: 2, name: 'Mosi', avatar: 'mosi', total: 12 }], winner: null, ...over });

/** The phone seated as Ásta (seat 1), showing Litla Yatzy's views as they come (seq 1 first). */
function seated() {
  const r = rig({ search: '?r=GULL', views: { yatzy: renderYatzy } });
  r.net.statusFn('connected');
  r.net.message({ v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Ásta' } });
  let seq = 0;
  r.show = body => r.net.message(view('yatzy', body, ++seq));
  return r;
}
const acts = net => net.sent.filter(m => m.type === 'act').map(m => m.body);
const dice = root => [...$$(root, '.spil-yatzy-die')];
const card = (root, id) => [...$$(root, '.spil-yatzy-card')].find(el => el.getAttribute('data-card') === id);
const pick = (root, id) => $(card(root, id), '.spil-yatzy-pick');
const pips = root => [...$$(root, '.spil-yatzy-rolls i')].map(pip => pip.classList.contains('left'));

test('her turn: the dice, the cup and the cards are hers; a roll, a hold and a score are sent once each', () => {
  const { root, net, show } = seated();
  show(mine());
  assert.equal($(root, '.spil-yatzy-turn').textContent, 'Þú átt leik!');
  assert.equal($(root, '.spil-yatzy-turn').classList.contains('mine'), true);
  assert.deepEqual(pips(root), [true, true, false], 'two rolls left');
  const [first, , third] = dice(root);
  assert.equal(dice(root).length, 5);
  assert.equal(first.classList.contains('held'), true);
  assert.equal(first.getAttribute('aria-pressed'), 'true');
  assert.equal(third.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(dice(root).map(die => die.getAttribute('data-face')), ['3', '3', '1', '5', '6']);
  assert.equal($(third, 'b').textContent, '1');
  assert.match($(third, 'img').src, /\/assets\/eitt\/mosi\.webp$/, 'a one is Mosi, as on the table');
  assert.equal($(third, 'img').alt, 'Mosi');
  assert.match($(first, 'img').src, /\/assets\/eitt\/brontosaurus\.webp$/, 'a three is Þórseðla');
  const cup = $(root, '.spil-yatzy-cup');
  assert.equal(cup.textContent, 'Kasta aftur!');

  tap(cup);
  tap(cup);
  assert.deepEqual(acts(net), [{ type: 'roll' }], 'a double tap rolls once');
  assert.equal(cup.disabled, true, 'until the next view');

  tap(third);
  tap(dice(root)[3]);
  assert.deepEqual(acts(net).slice(1), [{ type: 'hold', die: 2 }], 'one hold for each view');
  assert.equal(dice(root).every(die => die.disabled), true);

  assert.equal($$(card(root, 'pair'), '.spil-yatzy-mini').length, 2, 'the dice that score');
  assert.equal($$(card(root, 'twoPairs'), '.spil-yatzy-mini').length, 4, 'or the example, two twos and two fours');
  assert.equal($(card(root, 'pair'), '.spil-yatzy-name').textContent, 'Eitt par');
  assert.equal($(card(root, 'pair'), '.spil-yatzy-value').textContent, '+6');
  assert.equal(card(root, 'pair').classList.contains('available'), true);
  tap(pick(root, 'pair'));
  tap(pick(root, 'pair'));
  assert.deepEqual(acts(net).slice(2), [{ type: 'score', card: 'pair' }], 'one score');
  assert.equal(card(root, 'threeKind').classList.contains('filled'), true);
  assert.equal(card(root, 'threeKind').classList.contains('available'), false);
  assert.equal($(card(root, 'threeKind'), '.spil-yatzy-value').textContent, '9');
  assert.equal(pick(root, 'threeKind').disabled, true, 'a filled card is done');

  show(mine({ rolls: 2, roll: { seq: 5, by: 1 } }));
  assert.equal(cup.disabled, false, 'the next view offers a roll again');
  assert.equal(dice(root)[2].disabled, false);
  assert.equal(pick(root, 'pair').disabled, false);
  assert.deepEqual(pips(root), [true, false, false]);
});

test('a card worth nothing asks first', () => {
  const { root, net, show } = seated();
  show(mine());
  const twoPairs = card(root, 'twoPairs');
  const confirm = $(twoPairs, '.spil-yatzy-confirm');
  assert.equal(confirm.hidden, true);
  assert.equal(twoPairs.classList.contains('zero'), true);
  assert.equal(card(root, 'pair').classList.contains('zero'), false);
  tap(pick(root, 'twoPairs'));
  assert.deepEqual(acts(net), [], 'nothing sent yet');
  assert.equal(confirm.hidden, false);
  assert.equal($(confirm, '.spil-yatzy-ask').textContent, 'Nota spjaldið? 0 stig');
  assert.equal($(confirm, '.spil-yatzy-use').textContent, 'Nota');
  assert.equal($(confirm, '.spil-yatzy-other').textContent, 'Velja annað');

  tap(pick(root, 'yatzy'));
  assert.equal(confirm.hidden, true, 'another card asks instead');
  assert.equal($(card(root, 'yatzy'), '.spil-yatzy-confirm').hidden, false);
  tap($(card(root, 'yatzy'), '.spil-yatzy-other'));
  assert.equal($(card(root, 'yatzy'), '.spil-yatzy-confirm').hidden, true, '"Velja annað" puts it away');
  assert.deepEqual(acts(net), []);

  tap(pick(root, 'twoPairs'));
  tap($(confirm, '.spil-yatzy-use'));
  tap($(confirm, '.spil-yatzy-use'));
  assert.deepEqual(acts(net), [{ type: 'score', card: 'twoPairs' }], '"Nota" sends it, once');
  assert.equal(confirm.hidden, true);

  show(mine({ canScore: false }));
  assert.equal(twoPairs.classList.contains('zero'), false, 'a card that may not be picked asks nothing');
  assert.equal(pick(root, 'twoPairs').disabled, true);
});

test("another's turn: everything waits, the names and totals show", () => {
  const { root, net, show } = seated();
  show(mine({ turn: 2, canRoll: false, canHold: false, canScore: false }));
  assert.equal($(root, '.spil-yatzy-turn').textContent, 'Mosi á leik');
  assert.equal($(root, '.spil-yatzy-turn').classList.contains('mine'), false);
  const cup = $(root, '.spil-yatzy-cup');
  assert.equal(cup.disabled, true);
  assert.equal(dice(root).every(die => die.disabled), true);
  assert.equal([...$$(root, '.spil-yatzy-pick')].every(el => el.disabled), true);
  assert.equal([...$$(root, '.spil-yatzy-card')].some(el => el.classList.contains('available')), false);
  tap(cup);
  tap(dice(root)[2]);
  tap(pick(root, 'pair'));
  assert.deepEqual(acts(net), [], 'nothing is hers to send');

  const rows = [...$$(root, '.spil-yatzy-players li')];
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row.classList.contains('current')), [false, false, true]);
  assert.equal($(rows[2], '.spil-yatzy-pname').textContent, 'Mosi');
  assert.match($(rows[2], '.spil-yatzy-total').textContent, /12/);
  assert.match($(rows[2], '.spil-face img').src, /\/assets\/book\/images\/mosi-render\.webp$/, 'Mosi has his own picture');

  show(mine({ turn: 0, rolls: 0, dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], roll: null, canRoll: false, canHold: false, canScore: false }));
  assert.equal($(root, '.spil-yatzy-turn').textContent, 'Egill á leik');
  assert.equal(cup.textContent, 'Kasta!', 'a turn not rolled yet');
  assert.deepEqual(dice(root).map(die => die.getAttribute('data-face')), ['0', '0', '0', '0', '0']);
  assert.equal($(dice(root)[0], 'b').textContent, '?', 'the back side');
  assert.equal($(dice(root)[0], 'img').hidden, true);
  assert.deepEqual(pips(root), [true, true, true]);
});

test('a new roll tumbles the free dice and rattles once; the first view never tumbles', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = new FakeDocument();
  const root = doc.createElement('section');
  const played = [];
  const audio = { effects: options => (options.sounds === yatzyPhoneSounds && options.gaps === YATZY_PHONE_GAPS ? { play: name => played.push(name) } : null) };
  const sent = [];
  const send = act => sent.push(act);
  const tumbling = () => [...root.querySelectorAll('.spil-yatzy-die')].map(die => die.classList.contains('spil-tumble'));
  renderYatzy(root, mine(), { send, doc, audio });
  assert.deepEqual(tumbling(), [false, false, false, false, false], 'the dice as they lie when the screen opens');
  assert.deepEqual(played, []);

  renderYatzy(root, mine({ rolls: 2, dice: [3, 3, 2, 2, 4], roll: { seq: 5, by: 1 } }), { send, doc, audio });
  assert.deepEqual(tumbling(), [false, false, true, true, true], 'the held ones stay');
  assert.deepEqual(played, ['rattle']);
  assert.equal(root.querySelectorAll('.spil-yatzy-die')[2].getAttribute('data-face'), '2', 'showing the new faces');

  renderYatzy(root, mine({ rolls: 2, dice: [3, 3, 2, 2, 4], held: [true, true, true, false, false], roll: { seq: 5, by: 1 } }), { send, doc, audio });
  assert.deepEqual(played, ['rattle'], 'a hold is no new roll');
  t.mock.timers.tick(950);
  assert.deepEqual(tumbling(), [false, false, false, false, false], "down after 950 ms, as the big screen's dice");

  renderYatzy(root, mine({ turn: 2, rolls: 1, dice: [6, 6, 6, 1, 2], held: [false, false, false, false, false], roll: { seq: 6, by: 2 }, canRoll: false, canHold: false, canScore: false }), { send, doc, audio });
  assert.deepEqual(tumbling(), [true, true, true, true, true], "anyone's roll, on every phone");
  assert.deepEqual(played, ['rattle', 'rattle']);
  renderYatzy(root, mine({ roll: { seq: 7, by: 1 } }), { send, doc, audio: { effects: () => null } });
  assert.deepEqual(sent, [], "no sound before the page's first touch is no error");
});

test('the rattle is four short knocks of noise', () => {
  assert.deepEqual(YATZY_PHONE_SFX, ['rattle']);
  assert.deepEqual(YATZY_PHONE_GAPS, { rattle: 0.3 });
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, sounds: yatzyPhoneSounds, gaps: YATZY_PHONE_GAPS });
  sfx.play('rattle');
  assert.equal(context.bufferSources.length, 4);
  assert.equal(context.oscillators.length, 0);
});

test('the end: the winner and the totals; a tie says so', () => {
  const { root, show } = seated();
  show(mine());
  const won = $(root, '.spil-yatzy-won');
  assert.equal(won.hidden, true);
  show(mine({ winner: 2, canRoll: false, canHold: false, canScore: false }));
  assert.equal(won.hidden, false);
  assert.equal($(won, '.spil-words').textContent, 'Mosi vann!');
  assert.equal($(won, '.spil-burst').hidden, false);
  assert.match($(won, '.spil-face img').src, /\/assets\/book\/images\/mosi-render\.webp$/);
  assert.equal($(root, '.spil-yatzy-turn').hidden, true);
  assert.equal($(root, '.spil-yatzy-dice').hidden, true, "the winner takes the dice's place");
  assert.equal($(root, '.spil-yatzy-cup').hidden, true);
  assert.equal($(root, '.spil-yatzy-players').hidden, false, "and everyone's totals stay");
  assert.deepEqual([...$$(root, '.spil-yatzy-players li')].map(row => row.classList.contains('current')), [false, false, false]);
  show(mine({ winner: 'tie', canRoll: false, canHold: false, canScore: false }));
  assert.equal($(won, '.spil-words').textContent, 'Jafntefli!');
  assert.equal($(won, '.spil-burst').hidden, true, 'no one face for a tie');
  show(mine());
  assert.equal(won.hidden, true, 'a new game');
  assert.equal($(root, '.spil-yatzy-turn').hidden, false);
});

test('a name is text', () => {
  const { root, show } = seated();
  const players = mine().players.map(player => (player.seat === 1 ? { ...player, name: '<b>Ásta</b>' } : player));
  show(mine({ players, turn: 2 }));
  const name = $$(root, '.spil-yatzy-pname')[1];
  assert.equal(name.textContent, '<b>Ásta</b>');
  assert.equal(name.innerHTML.includes('<b>'), false);
  assert.equal(name.children.length, 0);
  show(mine({ players: mine().players.map(player => (player.seat === 2 ? { ...player, name: '<i>Mosi</i>' } : player)), turn: 2 }));
  assert.equal($(root, '.spil-yatzy-turn').textContent, '<i>Mosi</i> á leik');
});
