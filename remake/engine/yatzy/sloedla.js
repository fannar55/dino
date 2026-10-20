// Slóeðla's choices at the Yatzy table, and the sharp evaluator that Mosi's advice also uses.
// Like Kambeðla in "Eitt!" (engine/eitt/skill.js), her skill is a number in 0..1 that rises when the child wins, falls when
// the child loses, and eases off inside a game whenever the child falls behind by 8 or more points.

import {
  CATEGORIES,
  DICE_COUNT,
  canUseEgg,
  countFaces,
  detectCombo,
  dinoByFace,
  longestRun,
  openCategories,
  scoreCategory,
  totalScore,
} from './rules.js';
import { clampSkill } from '../eitt/skill.js';

export const BEHIND_POINTS = 8;
const EASE_SKILL = 0.3;

const pick = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/** Effective skill inside a game: milder when the child trails Slóeðla by 8+ points. */
export function inYatzyRound(skill, game) {
  const base = clampSkill(skill);
  const diff = totalScore(game, 'sloedla') - totalScore(game, 'child');
  return diff >= BEHIND_POINTS ? clampSkill(base - EASE_SKILL) : base;
}

/** How desirable it is to lock `categoryId` with `dice` right now for `who` (higher is better). */
export function categoryWorth(game, who, categoryId, dice = game.dice) {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  const pts = scoreCategory(categoryId, dice);
  const open = openCategories(game, who);

  if (pts === 0) {
    // When forced to take 0, sacrifice a friend row or Yatzy late rather than easy combos like pair or treasure.
    if (cat.kind === 'friend') return -20 - cat.face;
    if (categoryId === 'yatzy') return -15;
    if (categoryId === 'footprints') return -30;
    if (categoryId === 'full-nest') return -35;
    if (categoryId === 'three') return -45;
    if (categoryId === 'pair') return -60;
    return -100;
  }

  if (categoryId === 'yatzy') return 1000 + pts * 20;
  if (categoryId === 'footprints') return 420 + pts * 18;
  if (categoryId === 'full-nest') return 400 + pts * 16;
  if (categoryId === 'three') return 260 + pts * 15;
  if (cat.kind === 'friend') {
    // 3 or more matching friends (6..10 pts) is very strong; 2 matching (4 pts) is decent; 1 (2 pts) is a fallback.
    const ratio = pts / cat.max;
    return (pts >= 6 ? 250 : pts === 4 ? 130 : 40) + pts * 14 + ratio * 20;
  }
  if (categoryId === 'pair') {
    return (pts === 6 ? 190 : 110) + pts * 10;
  }
  if (categoryId === 'treasure') {
    // Keep treasure in reserve early unless it scores 7-8 and nothing else scores well.
    const reservePenalty = open.length > 4 ? 45 : 0;
    return 95 + pts * 10 - reservePenalty;
  }
  return pts * 10;
}

/** The best open category for `who` given `game.dice`. */
export function sharpCategory(game, who = 'child') {
  const open = openCategories(game, who);
  if (open.length === 0) return null;
  let best = open[0];
  let bestVal = -Infinity;
  for (const cat of open) {
    const val = categoryWorth(game, who, cat.id, game.dice);
    if (val > bestVal) {
      bestVal = val;
      best = cat;
    }
  }
  return best.id;
}

/** Finds a 4-die or 3-die consecutive run mask `[bool, bool, bool, bool, bool]` if one exists in `dice`. */
function straightHoldMask(dice) {
  const runs4 = [
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 4, 5, 6],
  ];
  for (const run of runs4) {
    const used = new Set();
    const mask = [false, false, false, false, false];
    for (let i = 0; i < DICE_COUNT; i++) {
      if (run.includes(dice[i]) && !used.has(dice[i])) {
        used.add(dice[i]);
        mask[i] = true;
      }
    }
    if (used.size === 4) return mask;
  }
  const runs3 = [
    [2, 3, 4],
    [3, 4, 5],
    [1, 2, 3],
    [4, 5, 6],
  ];
  for (const run of runs3) {
    const used = new Set();
    const mask = [false, false, false, false, false];
    for (let i = 0; i < DICE_COUNT; i++) {
      if (run.includes(dice[i]) && !used.has(dice[i])) {
        used.add(dice[i]);
        mask[i] = true;
      }
    }
    if (used.size === 3) return mask;
  }
  return null;
}

/**
 * Computes the optimal 5-boolean hold mask for `who` when `game.rollsLeft > 0`.
 * Returns `{ mask, reason, targetFace }` where `mask.every(Boolean)` means the hand is already complete and should be scored!
 */
export function bestHoldPlan(game, who = 'child') {
  const dice = game.dice;
  const open = openCategories(game, who);
  const openIds = new Set(open.map(c => c.id));
  const counts = countFaces(dice);
  const maxCount = Math.max(...counts.slice(1));
  const run = longestRun(dice);

  // 1. Already a 5-of-a-kind Yatzy!
  if (maxCount === 5) {
    return { mask: [true, true, true, true, true], reason: 'score-yatzy', targetFace: dice[0] };
  }

  // 2. Already a 5-die straight and footprints is open!
  if (run === 5 && openIds.has('footprints')) {
    return { mask: [true, true, true, true, true], reason: 'score-straight', targetFace: null };
  }

  // 3. Already a Full House (3 + 2) and full-nest is open!
  const pairFaces = counts.map((c, f) => (f >= 1 && c >= 2 ? f : -1)).filter(f => f >= 1);
  if (maxCount === 3 && pairFaces.length === 2 && openIds.has('full-nest')) {
    return { mask: [true, true, true, true, true], reason: 'score-full-nest', targetFace: null };
  }

  // 4. Two pairs when full-nest is open (or pair is open and we want 6 pts): hold all 4 dice of both pairs!
  if (maxCount === 2 && pairFaces.length === 2 && openIds.has('full-nest')) {
    const mask = dice.map(d => pairFaces.includes(d));
    return { mask, reason: 'hold-two-pairs', targetFace: pairFaces[0] };
  }

  // 5. Four-die straight when footprints is open and maxCount <= 2: hold the 4 straight dice!
  if (run === 4 && openIds.has('footprints') && maxCount <= 2) {
    const mask = straightHoldMask(dice);
    if (mask) return { mask, reason: 'hold-straight', targetFace: null };
  }

  // 6. Pick the best matching face (2, 3, or 4 of a kind) to collect:
  // Prefer a face with higher count, and break ties by whether its friend box is open!
  if (maxCount >= 2) {
    let bestFace = 1;
    let bestVal = -Infinity;
    for (let f = 1; f <= 6; f++) {
      if (counts[f] < 2) continue;
      const dino = dinoByFace(f);
      const friendOpen = openIds.has(dino.key) ? 25 : 0;
      const comboOpen = (openIds.has('three') ? 10 : 0) + (openIds.has('yatzy') ? 10 : 0);
      const val = counts[f] * 100 + friendOpen + comboOpen + f;
      if (val > bestVal) {
        bestVal = val;
        bestFace = f;
      }
    }
    const mask = dice.map(d => d === bestFace);
    return { mask, reason: 'hold-matching', targetFace: bestFace };
  }

  // 7. All 5 dice are singletons (maxCount === 1):
  if (openIds.has('footprints')) {
    const sMask = straightHoldMask(dice);
    if (sMask) return { mask: sMask, reason: 'hold-straight', targetFace: null };
  }

  // Otherwise hold the single die whose friend category is open (or the first die).
  const openFriendFace = dice.find(f => openIds.has(dinoByFace(f).key)) ?? dice[0];
  const mask = dice.map(d => d === openFriendFace);
  return { mask, reason: 'hold-friend', targetFace: openFriendFace };
}

/**
 * Returns the sharp next action for `who`:
 * - `{ type: 'roll' }` when not rolled yet
 * - `{ type: 'use-egg' }` when the Golden Egg is ready and improves the hand
 * - `{ type: 'hold-and-roll', held, reason, targetFace }` when rolling again is better
 * - `{ type: 'score', categoryId, reason }` when it is time to pick a category on the scorecard
 */
export function sharpAction(game, who = 'child') {
  if (!game.rolled) {
    return { type: 'roll', reason: 'first-roll' };
  }

  const combo = detectCombo(game.dice);
  // Check if the child can and should use the Golden Egg
  if (who === 'child' && canUseEgg(game, 'child') && combo.kind !== 'yatzy') {
    const counts = countFaces(game.dice);
    const maxCount = Math.max(...counts.slice(1));
    if (maxCount >= 2 || game.rollsLeft === 0) {
      return { type: 'use-egg', reason: 'use-egg' };
    }
  }

  const bestCat = sharpCategory(game, who);
  if (game.rollsLeft <= 0) {
    return { type: 'score', categoryId: bestCat, reason: 'score-best' };
  }

  const plan = bestHoldPlan(game, who);
  if (plan.mask.every(Boolean)) {
    return { type: 'score', categoryId: bestCat, reason: plan.reason };
  }

  // If the current best category already scores >= 10 points and rollsLeft === 1, and it's a combo like full-nest or footprints
  const currentPts = scoreCategory(bestCat, game.dice);
  if (currentPts >= 12) {
    return { type: 'score', categoryId: bestCat, reason: 'score-best' };
  }

  return {
    type: 'hold-and-roll',
    held: plan.mask,
    reason: plan.reason,
    targetFace: plan.targetFace,
  };
}

/**
 * Slóeðla's decision on her turn:
 * Returns `{ type: 'roll' }`, `{ type: 'hold-and-roll', held }`, or `{ type: 'score', categoryId }`.
 */
export function chooseSloedlaMove(game, skill = 0.5, random = Math.random) {
  if (game.winner || game.turn !== 'sloedla') throw new Error("It is not Slóeðla's turn");
  if (!game.rolled) return { type: 'roll' };

  const effective = inYatzyRound(skill, game);
  const sharp = sharpAction(game, 'sloedla');

  if (game.rollsLeft <= 0) {
    if (random() < effective) return { type: 'score', categoryId: sharp.categoryId };
    const open = openCategories(game, 'sloedla');
    const scoring = open.filter(c => scoreCategory(c.id, game.dice) > 0);
    const pool = scoring.length > 0 ? scoring : open;
    return { type: 'score', categoryId: pick(pool, random).id };
  }

  if (random() < effective) {
    return sharp;
  }

  // Mild play: sometimes stop after 1 or 2 rolls if a category scores >= 4, or hold a pair
  const open = openCategories(game, 'sloedla');
  const scoring = open.filter(c => scoreCategory(c.id, game.dice) >= 4);
  if (scoring.length > 0 && random() < 0.45) {
    return { type: 'score', categoryId: pick(scoring, random).id };
  }
  const plan = bestHoldPlan(game, 'sloedla');
  if (plan.mask.every(Boolean)) {
    return { type: 'score', categoryId: sharpCategory(game, 'sloedla') };
  }
  return { type: 'hold-and-roll', held: plan.mask };
}
