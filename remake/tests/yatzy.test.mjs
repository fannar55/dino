import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seededRandom } from '../engine/random.js';
import { createSave } from '../engine/save.js';
import {
  DINOS, CATEGORIES, DICE_COUNT, MAX_ROLLS, MAX_EGG_CHARGE,
  dinoByFace, dinoByKey, scoreCategory, detectCombo, newGame,
  rollDice, toggleHold, setHeld, canUseEgg, bestEggTransform, useEggPower,
  chooseCategory, openCategories, totalScore,
} from '../engine/yatzy/rules.js';
import { chooseSloedlaMove, inYatzyRound } from '../engine/yatzy/sloedla.js';
import { adviseYatzy, YATZY_REASONS } from '../engine/yatzy/advice.js';
import { yatzySounds, YATZY_GAPS } from '../engine/yatzy/yatzy-sounds.js';
import { createSfx } from '../engine/audio/sfx.js';
import { createBook } from '../engine/book/book.js';
import { createYatzyGame, TUTORIAL_STEPS } from '../engine/yatzy/table.js';
import { DONE } from '../engine/handle.js';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';
import { createFakeContext } from './fake-audio.mjs';

const THEME = JSON.parse(fs.readFileSync(new URL('../assets/audio/theme.json', import.meta.url), 'utf8'));

test('six dinosaur friends map to dice faces 1 to 6 and twelve categories exist', () => {
  assert.equal(DINOS.length, 6);
  assert.deepEqual(DINOS.map(d => d.face), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(DINOS.map(d => d.key), ['mosi', 'kambedla', 'thorsedla', 'gramedla', 'sloedla', 'flugedla']);
  for (let face = 1; face <= 6; face++) {
    assert.equal(dinoByFace(face).face, face);
    assert.equal(dinoByKey(dinoByFace(face).key).face, face);
  }
  assert.equal(dinoByFace(0), null);
  assert.equal(dinoByFace(7), null);

  assert.equal(CATEGORIES.length, 12);
  assert.equal(CATEGORIES.filter(c => c.side === 'left').length, 6);
  assert.equal(CATEGORIES.filter(c => c.side === 'right').length, 6);
});

test('kid-friendly scoring rewards every category without complex arithmetic', () => {
  // Dinosaur friend categories: 2 points per matching die
  assert.equal(scoreCategory('mosi', [1, 1, 1, 4, 6]), 6);
  assert.equal(scoreCategory('kambedla', [2, 2, 5, 5, 5]), 4);
  assert.equal(scoreCategory('sloedla', [2, 2, 5, 5, 5]), 6);
  assert.equal(scoreCategory('flugedla', [1, 2, 3, 4, 5]), 0);

  // Tveir vinir (pair): 4 pts for 1 pair, 6 pts for 2 pairs or 4-of-a-kind
  assert.equal(scoreCategory('pair', [3, 3, 1, 4, 6]), 4);
  assert.equal(scoreCategory('pair', [3, 3, 4, 4, 6]), 6);
  assert.equal(scoreCategory('pair', [1, 2, 3, 4, 6]), 0);

  // Þrír saman (three of a kind): 7 pts for 3, 9 pts for 4+
  assert.equal(scoreCategory('three', [4, 4, 4, 1, 2]), 7);
  assert.equal(scoreCategory('three', [4, 4, 4, 4, 2]), 9);
  assert.equal(scoreCategory('three', [4, 4, 1, 1, 2]), 0);

  // Fullt hreiður (3+2 or 5-of-a-kind): 10 pts
  assert.equal(scoreCategory('full-nest', [5, 5, 5, 2, 2]), 10);
  assert.equal(scoreCategory('full-nest', [5, 5, 5, 5, 5]), 10);
  assert.equal(scoreCategory('full-nest', [5, 5, 5, 5, 2]), 0);

  // Fótsporaröð (4+ consecutive faces): 9 pts for 4, 12 pts for 5
  assert.equal(scoreCategory('footprints', [1, 2, 3, 4, 4]), 9);
  assert.equal(scoreCategory('footprints', [2, 3, 4, 5, 6]), 12);
  assert.equal(scoreCategory('footprints', [1, 2, 3, 5, 6]), 0);

  // Fjársjóðskarfa (chance): always 5–8 pts
  assert.ok(scoreCategory('treasure', [1, 2, 4, 5, 6]) >= 5);

  // Risaeðlu-Yatzy (5 of a kind): 15 pts
  assert.equal(scoreCategory('yatzy', [6, 6, 6, 6, 6]), 15);
  assert.equal(scoreCategory('yatzy', [6, 6, 6, 6, 5]), 0);
  assert.throws(() => scoreCategory('unknown', [1, 2, 3, 4, 5]), TypeError);
});

test('detectCombo highlights the highest-tier pattern rolled', () => {
  assert.equal(detectCombo([5, 5, 5, 5, 5]).kind, 'yatzy');
  assert.equal(detectCombo([5, 5, 5, 5, 5]).dinoKey, 'sloedla');
  assert.equal(detectCombo([1, 2, 3, 4, 5]).kind, 'footprints-5');
  assert.equal(detectCombo([2, 2, 2, 4, 4]).kind, 'full-nest');
  assert.equal(detectCombo([3, 3, 3, 3, 1]).kind, 'four');
  assert.equal(detectCombo([1, 2, 3, 4, 6]).kind, 'footprints-4');
  assert.equal(detectCombo([3, 3, 3, 1, 5]).kind, 'three');
  assert.equal(detectCombo([2, 2, 4, 4, 6]).kind, 'two-pairs');
  assert.equal(detectCombo([4, 4, 1, 2, 6]).kind, 'pair');
  assert.equal(detectCombo([1, 2, 4, 5, 6]).kind, 'none');
});

test('rolling, holding in the moss nest, and Slóeðla\'s Golden Egg power work immutably', () => {
  const game = newGame();
  assert.equal(game.turn, 'child');
  assert.equal(game.rollsLeft, MAX_ROLLS);
  assert.throws(() => toggleHold(game, 'child', 0), /before holding/);
  assert.throws(() => chooseCategory(game, 'child', 'treasure'), /must roll/);

  // Roll 1: force a pair of Slóeðlur [5, 5, 1, 2, 3]
  const seq1 = [5, 5, 1, 2, 3];
  let idx = 0;
  const afterRoll1 = rollDice(game, 'child', () => (seq1[idx++] - 0.5) / 6);
  assert.deepEqual(afterRoll1.dice, [5, 5, 1, 2, 3]);
  assert.equal(afterRoll1.rollsLeft, 2);
  assert.equal(afterRoll1.eggCharge, MAX_EGG_CHARGE, 'rolling a pair charges the Golden Egg to full (3)');
  assert.equal(canUseEgg(afterRoll1, 'child'), true);

  // Hold the two 5s in the moss nest
  let held = toggleHold(afterRoll1, 'child', 0);
  held = toggleHold(held, 'child', 1);
  assert.deepEqual(held.held, [true, true, false, false, false]);

  // Use Slóeðla's Golden Egg: grants +1 roll and turns one unheld die into a matching 5!
  const target = bestEggTransform(held, 'child');
  assert.equal(target.face, 5);
  const { game: afterEgg, changedIndex, newFace } = useEggPower(held, 'child');
  assert.equal(newFace, 5);
  assert.ok(changedIndex >= 2 && changedIndex < DICE_COUNT);
  assert.equal(afterEgg.eggUsedThisTurn, true);
  assert.equal(afterEgg.eggCharge, 0);
  assert.equal(afterEgg.rollsLeft, 3);
  assert.equal(afterEgg.dice.filter(d => d === 5).length, 3, 'one unheld die transformed into Slóeðla (5)');
  assert.equal(canUseEgg(afterEgg, 'child'), false, 'only once per turn');
});

test('rolling a 5-of-a-kind records the dinosaur badge in yatzyBadges', () => {
  let game = newGame();
  game = rollDice(game, 'child', () => (5 - 0.5) / 6); // [5, 5, 5, 5, 5]
  assert.deepEqual(game.dice, [5, 5, 5, 5, 5]);
  assert.deepEqual(game.yatzyBadges, ['sloedla']);
  const scored = chooseCategory(game, 'child', 'yatzy');
  assert.equal(scored.scores.child.yatzy, 15);
  assert.equal(scored.turn, 'sloedla');
});

test('Slóeðla and Mosi play full 12-round games legally across 80 seeds', () => {
  assert.ok(YATZY_REASONS.length >= 8);
  const seenReasons = new Set();

  for (let seed = 0; seed < 80; seed++) {
    const random = seededRandom(`yatzy-sim-${seed}`);
    const skill = [0, 0.5, 1][seed] ?? random();
    let game = newGame();

    for (let safety = 0; !game.winner; safety++) {
      assert.ok(safety < 500, `seed ${seed} did not finish`);
      if (game.turn === 'child') {
        const advice = adviseYatzy(game);
        assert.ok(advice, 'Mosi always has advice on the child\'s turn');
        assert.ok(YATZY_REASONS.includes(advice.reason), `valid reason: ${advice.reason}`);
        seenReasons.add(advice.reason);

        if (advice.type === 'roll') {
          game = rollDice(game, 'child', random);
        } else if (advice.type === 'use-egg' && canUseEgg(game, 'child')) {
          game = useEggPower(game, 'child').game;
        } else if (advice.type === 'hold-and-roll' && game.rollsLeft > 0) {
          game = setHeld(game, 'child', advice.held);
          game = rollDice(game, 'child', random);
        } else {
          const catId = advice.categoryId ?? openCategories(game, 'child')[0].id;
          game = chooseCategory(game, 'child', catId);
        }
      } else {
        const effSkill = inYatzyRound(skill, game);
        const move = chooseSloedlaMove(game, effSkill, random);
        if (move.type === 'roll') {
          game = rollDice(game, 'sloedla', random);
        } else if (move.type === 'hold-and-roll') {
          game = setHeld(game, 'sloedla', move.held);
          game = rollDice(game, 'sloedla', random);
        } else if (move.type === 'score') {
          game = chooseCategory(game, 'sloedla', move.categoryId);
        }
      }
    }

    assert.ok(['child', 'sloedla', 'tie'].includes(game.winner));
    for (const who of ['child', 'sloedla']) {
      assert.equal(Object.keys(game.scores[who]).length, 12, `${who} filled all 12 categories`);
      assert.ok(totalScore(game, who) > 0);
    }
  }

  assert.ok(seenReasons.size >= 5, `Mosi gave diverse reasons: ${[...seenReasons].join(', ')}`);
});

test('all procedural Yatzy sound effects play cleanly through WebAudio', () => {
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({
    context,
    theme: THEME,
    sounds: yatzySounds,
    gaps: YATZY_GAPS,
    random: seededRandom('yatzy-sfx'),
  });
  for (const name of Object.keys(yatzySounds)) {
    const before = context.started.length;
    assert.equal(sfx.play(name), true, `${name} plays`);
    assert.ok(context.started.length > before, `${name} starts audio nodes`);
    context.advance(5);
  }
});

test('save.js persists Yatzy stats, tutorialDone, and badges cleanly alongside existing progress', () => {
  const files = new Map();
  const storage = { getItem: k => files.get(k) ?? null, setItem: (k, v) => files.set(k, v) };
  const save = createSave(storage);

  assert.deepEqual(save.getYatzy(), { skill: null, losses: 0, wins: 0, badges: [], tutorialDone: false });
  save.setYatzy({ wins: 2, skill: 0.55, tutorialDone: true });
  assert.equal(save.addYatzyBadge('sloedla'), true);
  assert.equal(save.addYatzyBadge('sloedla'), false, 'badge added once');
  assert.equal(save.addYatzyBadge('mosi'), true);

  const reloaded = createSave(storage);
  assert.deepEqual(reloaded.getYatzy(), {
    skill: 0.55,
    losses: 0,
    wins: 2,
    badges: ['sloedla', 'mosi'],
    tutorialDone: true,
  });
});

test('the Leikir page in the book shows Risaeðlu-Yatzy and opens it on tap', () => {
  const doc = new FakeDocument(['book']);
  const save = createSave(null);
  const played = [];
  const book = createBook(doc, {
    save,
    audio: { sfx: () => true, stop() {}, narrate: () => DONE },
    onPlay: game => played.push(game),
  });
  book.open('games', 'child');
  const root = doc.getElementById('book');
  const yatzyTile = root.findAll(e => e.getAttribute?.('data-game') === 'yatzy')[0];
  assert.ok(yatzyTile, 'Risaeðlu-Yatzy tile is on the Leikir page');
  assert.equal(yatzyTile.classList.contains('new'), true, 'starts with Nýtt! badge');

  yatzyTile.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
  yatzyTile.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));

  assert.deepEqual(played, ['yatzy']);
  assert.equal(save.get().seen.includes('yatzy'), true);
  assert.equal(yatzyTile.classList.contains('new'), false);
});

test('Mosi interactive tutorial auto-starts on first play, enforces right moves, and marks tutorialDone', async () => {
  const doc = new FakeDocument(['yatzy']);
  const files = new Map();
  const storage = { getItem: k => files.get(k) ?? null, setItem: (k, v) => files.set(k, v) };
  const save = createSave(storage);
  const context = createFakeContext({ state: 'running' });

  const yatzy = createYatzyGame(doc, {
    save,
    audio: { context, theme: THEME },
    random: seededRandom('yatzy-tut'),
  });

  // First open: tutorial starts automatically because save.getYatzy().tutorialDone is false
  yatzy.open();
  assert.equal(yatzy.isTeaching, true);
  assert.equal(yatzy.tutorialStep?.id, 'intro');
  assert.ok(TUTORIAL_STEPS.length >= 11);

  // Step 1 -> Step 2: Advance from intro
  yatzy.nextTutorialStep();
  assert.equal(yatzy.tutorialStep?.id, 'roll-1');

  // Trying to tap a die before rolling is blocked by the tutorial
  yatzy.toggleDie(2);
  assert.equal(yatzy.tutorialStep?.id, 'roll-1');

  // Step 2: Roll #1 produces rigged [1, 1, 3, 4, 6]
  yatzy.roll();
  assert.deepEqual(yatzy.game.dice, [1, 1, 3, 4, 6]);
  assert.equal(yatzy.tutorialStep?.id, 'hold-0');

  // Trying to hold the wrong die (index 3) is blocked; holding die 0 succeeds
  yatzy.toggleDie(3);
  assert.equal(yatzy.game.held[3], false);
  assert.equal(yatzy.tutorialStep?.id, 'hold-0');

  yatzy.toggleDie(0);
  assert.equal(yatzy.game.held[0], true);
  assert.equal(yatzy.tutorialStep?.id, 'hold-1');

  // Step 4: Hold second Mosi (die 1)
  yatzy.toggleDie(1);
  assert.equal(yatzy.game.held[1], true);
  assert.equal(yatzy.tutorialStep?.id, 'roll-2');

  // Step 5: Roll again -> rigged Fullt hreiður [1, 1, 1, 2, 2]
  yatzy.roll();
  assert.deepEqual(yatzy.game.dice, [1, 1, 1, 2, 2]);
  assert.equal(yatzy.tutorialStep?.id, 'explain-boards');

  // Step 6 -> Step 7: Advance explanation of the two scoreboards
  yatzy.nextTutorialStep();
  assert.equal(yatzy.tutorialStep?.id, 'score-full-nest');

  // Tapping a wrong category (e.g. 'pair') is blocked with a helpful nudge
  yatzy.pickCategory('pair');
  assert.equal(yatzy.game.scores.child.pair, undefined);
  assert.equal(yatzy.tutorialStep?.id, 'score-full-nest');

  // Step 7: Score Fullt hreiður (+10) -> triggers Slóeðla's scripted turn
  yatzy.pickCategory('full-nest');
  assert.equal(yatzy.game.scores.child['full-nest'], 10);
  assert.equal(yatzy.tutorialStep?.id, 'sloedla-turn-1');

  // Wait for Slóeðla's scripted turn timers to complete
  await new Promise(r => setTimeout(r, 1800));
  assert.equal(yatzy.game.scores.sloedla.thorsedla, 6);
  assert.equal(yatzy.tutorialStep?.id, 'roll-round-2');

  // Step 8: Roll round 2 -> rigged [5, 5, 5, 5, 2] + Golden Egg ready
  yatzy.roll();
  assert.deepEqual(yatzy.game.dice, [5, 5, 5, 5, 2]);
  assert.equal(yatzy.tutorialStep?.id, 'use-egg');

  // Step 9: Use Golden Egg -> transforms 5th die to 5 for Risaeðlu-Yatzy!
  yatzy.useEgg();
  assert.deepEqual(yatzy.game.dice, [5, 5, 5, 5, 5]);
  assert.equal(yatzy.tutorialStep?.id, 'score-yatzy');
  assert.equal(save.getYatzy().badges.includes('sloedla'), true);

  // Step 10: Score Yatzy (+15) -> triggers Slóeðla's second scripted turn
  yatzy.pickCategory('yatzy');
  assert.equal(yatzy.game.scores.child.yatzy, 15);
  assert.equal(yatzy.tutorialStep?.id, 'sloedla-turn-2');

  await new Promise(r => setTimeout(r, 1800));
  assert.equal(yatzy.game.scores.sloedla.kambedla, 4);
  assert.equal(yatzy.tutorialStep?.id, 'round-3-roll');

  // Step 11: Roll round 3 -> [4, 4, 4, 1, 6], child must pick 'three' (+7) or 'gramedla' (+6)
  yatzy.roll();
  assert.deepEqual(yatzy.game.dice, [4, 4, 4, 1, 6]);
  assert.equal(yatzy.tutorialStep?.id, 'round-3-pick');

  // Wrong low-scoring category is gently rejected
  yatzy.pickCategory('mosi');
  assert.equal(yatzy.game.scores.child.mosi, undefined);
  assert.equal(yatzy.tutorialStep?.id, 'round-3-pick');

  // Picking 'three' (+7) completes the tutorial and marks tutorialDone: true!
  yatzy.pickCategory('three');
  assert.equal(yatzy.tutorialStep?.id, 'done');
  assert.equal(save.getYatzy().tutorialDone, true);

  // Tapping "Byrja leik!" exits tutorial and starts a fresh normal game
  yatzy.nextTutorialStep();
  assert.equal(yatzy.isTeaching, false);
  assert.equal(yatzy.game.round, 1);
  assert.equal(Object.keys(yatzy.game.scores.child).length, 0);

  yatzy.close();
});

