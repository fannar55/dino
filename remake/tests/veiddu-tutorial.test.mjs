// remake/tests/veiddu-tutorial.test.mjs
// Mosi's tutorial in "Veiddu" (spec section 8): the stacked deck makes the six steps happen in their order, with the two minds asking
// what the script says; every line the tutorial says is in the veiddu set, recorded, and says what the table shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newGame, ask, fish, holds, legalTargets, isOver } from '../engine/veiddu/rules.js';
import { bestAsk, SEAT } from '../engine/veiddu/minds.js';
import { makeDeck, KINDS } from '../engine/veiddu/cards.js';
import { TUTORIAL, LISTEN, REAL, TUTORIAL_MINDS, tutorialStack } from '../engine/veiddu/table.js';
import { priorityOf } from '../engine/veiddu/speech.js';

const { child: CHILD, uggedla: UGGEDLA, mosi: MOSI } = SEAT;
const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const stepOf = name => TUTORIAL.find(step => step.id === `veiddu_tut_${name}`);
const askText = kind => KINDS.find(k => k.id === kind).ask;
const of = (events, type) => events.filter(event => event.type === type);

/**
 * Plays the tutorial as the table does: the child's acts are the steps' `live`, the minds' asks are TUTORIAL_MINDS, a fish is the
 * rules'. Returns what happened in each step: { deal, ask, fish, theirs: [...], give, remember, game }.
 */
function walk() {
  const minds = { [UGGEDLA]: [...TUTORIAL_MINDS[UGGEDLA]], [MOSI]: [...TUTORIAL_MINDS[MOSI]] };
  const start = newGame({ stack: tutorialStack() });
  let game = start.game;
  const out = { deal: start.events, theirs: [] };
  const step = (name, f) => {
    const result = f(game);
    game = result.game;
    return result.events;
  };
  const mindAsk = seat => {
    const move = minds[seat].shift();
    assert.ok(move, `seat ${seat} has a move in the script`);
    assert.equal(game.turn, seat, `it is seat ${seat}'s turn when the script has it ask`);
    assert.equal(game.phase, 'ask');
    return step('mind', g => ask(g, seat, move.target, move.kind));
  };

  // Step 2: the child asks Uggeðla for the skjaldbaka and gets it; step 3: it is a pair (said as it flies)
  const asking = stepOf('ask').live;
  assert.equal(game.turn, CHILD);
  assert.equal(game.phase, 'ask');
  assert.ok(legalTargets(game, CHILD).includes(asking.target));
  out.ask = step('ask', g => ask(g, CHILD, asking.target, asking.kind));

  // Step 4: the child asks Mosi for the drekafluga, is told no, and fishes
  const fishing = stepOf('fish').live;
  assert.equal(game.turn, CHILD, 'a yes keeps the turn');
  out.fish = [...step('fish ask', g => ask(g, CHILD, fishing.target, fishing.kind))];
  assert.equal(game.phase, 'fish');
  out.fish.push(...step('fish draw', g => fish(g, CHILD)));

  // The minds: Uggeðla asks Mosi for the froskur (no) and fishes; Mosi asks the child for the salamandra (step 5: yes) and then Uggeðla
  // for the vatnalaesingi (no) and fishes
  assert.equal(game.turn, UGGEDLA);
  out.theirs.push(mindAsk(UGGEDLA));
  assert.equal(game.phase, 'fish');
  out.theirs.push(step('her fish', g => fish(g, UGGEDLA)));
  assert.equal(game.turn, MOSI);
  out.give = mindAsk(MOSI);
  assert.equal(game.turn, MOSI, 'a yes keeps the turn');
  out.theirs.push(mindAsk(MOSI));
  out.theirs.push(step('his fish', g => fish(g, MOSI)));

  // Step 6: back to the child, who holds a froskur that Uggeðla asked for
  const remembering = stepOf('remember').live;
  assert.equal(game.turn, CHILD);
  out.remembered = bestAsk(game, CHILD);
  out.remember = step('remember', g => ask(g, CHILD, remembering.target, remembering.kind));
  out.game = game;
  assert.deepEqual([minds[UGGEDLA].length, minds[MOSI].length], [0, 0], 'the script is used up');
  return out;
}

test('the tutorial has six steps, in the order of the spec, and the words of the brief', () => {
  assert.deepEqual(TUTORIAL.map(step => step.id.replace('veiddu_tut_', '')), ['pairs', 'ask', 'laid', 'fish', 'give', 'remember']);
  assert.equal(stepOf('remember').text, 'Uggeðla bað um frosk. Spurðu hana!');
  assert.equal(REAL.text, 'Nú spilum við alvöruleik!');
  assert.deepEqual(TUTORIAL.map(step => Object.keys(step.live ?? {}).join()), ['', 'kind,target', '', 'kind,target', 'give', 'kind,target'], 'which steps ask something of the child');
});

test('the stacked deck is the whole deck, once, and the deal gives Egill one pair and nobody else any', () => {
  const stack = tutorialStack();
  assert.equal(stack.length, 52);
  assert.deepEqual(stack.map(card => card.id).sort(), makeDeck().map(card => card.id).sort());
  const { deal, game } = (() => {
    const start = newGame({ stack });
    return { deal: start.events, game: start.game };
  })();
  const pairs = of(deal, 'pair');
  assert.deepEqual(pairs.map(({ seat, kind }) => [seat, kind]), [[CHILD, 'snigill']], 'step 1: a pair is dealt to Egill and goes to his catch');
  assert.deepEqual(game.hands.map(hand => hand.length), [3, 5, 5]);
  assert.equal(game.pond.length, 37);
  assert.equal(game.turn, CHILD);
  assert.equal(game.phase, 'ask');
});

test('the six steps happen in their order, from the stacked deck', () => {
  const play = walk();

  // 2 and 3: Egill asks Uggeðla for the skjaldbaka, she gives it, the pair goes down in his catch
  assert.deepEqual(play.ask.map(event => event.type), ['ask', 'give', 'pair']);
  assert.deepEqual([play.ask[0].seat, play.ask[0].target, play.ask[0].kind], [CHILD, UGGEDLA, 'skjaldbaka']);
  assert.deepEqual([play.ask[1].from, play.ask[1].to], [UGGEDLA, CHILD]);
  assert.deepEqual([play.ask[2].seat, play.ask[2].kind], [CHILD, 'skjaldbaka']);

  // 4: Egill asks Mosi for the drekafluga, Mosi has none, Egill fishes, and the card is not a lucky one: the turn goes on
  assert.deepEqual(play.fish.map(event => event.type), ['ask', 'no', 'fish', 'turn']);
  assert.equal(play.fish[1].seat, MOSI);
  assert.equal(play.fish[2].lucky, false);
  assert.deepEqual(play.fish[3], { type: 'turn', seat: UGGEDLA });

  // Uggeðla asks Mosi for a froskur (the thing to remember), is told no, fishes, and the turn goes to Mosi
  const [hers] = play.theirs;
  assert.deepEqual(hers.map(event => event.type), ['ask', 'no']);
  assert.deepEqual([hers[0].seat, hers[0].target, hers[0].kind], [UGGEDLA, MOSI, 'froskur']);
  assert.deepEqual(play.theirs[1].map(event => event.type), ['fish', 'turn']);

  // 5: Mosi asks Egill for the salamandra and Egill gives it: it is Mosi's pair
  assert.deepEqual(play.give.map(event => event.type), ['ask', 'give', 'pair']);
  assert.deepEqual([play.give[0].seat, play.give[0].target, play.give[0].kind], [MOSI, CHILD, 'salamandra']);
  assert.deepEqual([play.give[1].from, play.give[1].to], [CHILD, MOSI]);
  assert.equal(play.give[2].seat, MOSI);

  // Mosi asks again (a yes keeps the turn), Uggeðla has none, he fishes, and the turn comes to Egill
  assert.deepEqual(play.theirs[2].map(event => event.type), ['ask', 'no']);
  assert.deepEqual(play.theirs[3].map(event => event.type), ['fish', 'turn']);
  assert.deepEqual(play.theirs[3].at(-1), { type: 'turn', seat: CHILD });

  // 6: what Uggeðla asked for is what Egill fished and holds, and Mosi's advice would be to ask her; he does, and gets it
  assert.deepEqual([play.remembered.kind, play.remembered.target, play.remembered.reason], ['froskur', UGGEDLA, 'they-asked']);
  assert.deepEqual(play.remember.map(event => event.type), ['ask', 'give', 'pair']);
  assert.deepEqual([play.remember[1].from, play.remember[1].to, play.remember[2].kind], [UGGEDLA, CHILD, 'froskur']);

  // At the end Egill has three pairs (snigill, skjaldbaka, froskur), Mosi one, and the game goes on
  assert.deepEqual(play.game.pairs, [['snigill', 'skjaldbaka', 'froskur'], [], ['salamandra']]);
  assert.equal(isOver(play.game), false);
  assert.equal(play.game.turn, CHILD);
});

test('every act of the tutorial is one the rules allow, and no fish of it is lucky or pairs for a mind but the ones set', () => {
  const play = walk();
  const fishes = play.game.log.filter(event => event.type === 'fish');
  assert.equal(fishes.length, 3);
  assert.ok(fishes.every(event => event.lucky === false), 'a fish that pairs would end a step the wrong way');
  assert.deepEqual(of(play.game.log, 'pair').map(({ seat, kind }) => [seat, kind]), [[CHILD, 'snigill'], [CHILD, 'skjaldbaka'], [MOSI, 'salamandra'], [CHILD, 'froskur']]);
});

test('what each step lights is what Egill holds at that moment, and the words name it', () => {
  // The cards are the stack's own: the child is dealt the skjaldbaka, the drekafluga and the salamandra, fishes the froskur
  const start = newGame({ stack: tutorialStack() });
  for (const name of ['ask', 'fish']) assert.ok(holds(start.game, CHILD, stepOf(name).live.kind), `${name}: he holds it`);
  assert.ok(holds(start.game, CHILD, stepOf('give').live.give), 'give: he holds what Mosi asks for');
  assert.ok(holds(start.game, MOSI, stepOf('give').live.give), 'and Mosi holds one too (it is his pair)');
  assert.ok(!holds(start.game, MOSI, stepOf('fish').live.kind), 'fish: Mosi has not got it');
  assert.ok(holds(start.game, stepOf('ask').live.target, stepOf('ask').live.kind), 'ask: the one asked has it');
  assert.ok(holds(start.game, UGGEDLA, stepOf('remember').live.kind), 'remember: Uggeðla holds the frog she asked for');
  // the animal each step names in its words (accusative, as the question has it) is the one it lights
  assert.match(stepOf('fish').text, new RegExp(askText(stepOf('fish').live.kind)));
  assert.match(stepOf('remember').text, new RegExp(askText(stepOf('remember').live.kind)));
  assert.match(stepOf('ask').text, /skjaldbökuna/);
  assert.match(stepOf('laid').text, /skjaldböku/);
  assert.match(stepOf('ask').text, /Uggeðlu/);
  assert.match(stepOf('fish').text, /Mosa/);
});

test('every line of the tutorial is in the veiddu set, in Mosi\'s voice, with the words the table shows, and recorded', () => {
  const source = read('../assets/audio/veiddu/lines-source.json');
  const recorded = read('../assets/audio/lines.json');
  const lines = [...TUTORIAL, LISTEN, REAL];
  assert.equal(new Set(lines.map(line => line.id)).size, lines.length, 'no id twice');
  for (const line of lines) {
    const row = source.find(entry => entry.id === line.id);
    assert.ok(row, `${line.id} is in lines-source.json`);
    assert.equal(row.speaker, 'mosi', `${line.id} is Mosi's`);
    assert.equal(row.text, line.text, `${line.id}: the bubble says what the voice says`);
    assert.ok(recorded[line.id]?.src, `${line.id} is recorded (lines.json)`);
    assert.ok(recorded[line.id].duration > 1, `${line.id} has a length`);
    assert.ok(fs.existsSync(new URL(`../${recorded[line.id].src}`, import.meta.url)), `${line.id}: the MP3 is there`);
    assert.equal(priorityOf(line.id), 2, `${line.id} is heard as Mosi's advice is`);
  }
  // and the set has no veiddu_tut line the table does not use
  assert.deepEqual(source.filter(entry => entry.id.startsWith('veiddu_tut_')).map(entry => entry.id).sort(), lines.map(line => line.id).sort());
});
