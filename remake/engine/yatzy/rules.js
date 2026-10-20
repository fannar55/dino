// The rules of "Risaeðlu-Yatzy!", our five-dice dinosaur Yatzy that the child plays with Slóeðla (Parasaurolophus).
// Plain data and pure functions, with no DOM, no three.js and no sound: a Game goes in, a new Game comes out (the input is
// never mutated), and an illegal move throws. The table, Slóeðla's AI and Mosi's advice sit on top of this module.

export const DICE_COUNT = 5;
export const MAX_ROLLS = 3;
export const MAX_EGG_CHARGE = 3;

/**
 * The six faces of each die (1..6): every face carries both a number/pips AND one of the six dinosaur friends in their
 * signature hue from STYLE.md.
 */
export const DINOS = Object.freeze([
  Object.freeze({ face: 1, key: 'mosi', name: 'Mosi', colour: '#6fae4f', deep: '#4a8434', light: '#a3d977', img: 'assets/eitt/mosi.webp' }),
  Object.freeze({ face: 2, key: 'kambedla', name: 'Kambeðla', colour: '#8f6aa3', deep: '#5d4370', light: '#c3a3d6', img: 'assets/book/images/kambedla-render-thumb.webp' }),
  Object.freeze({ face: 3, key: 'thorsedla', name: 'Þórseðla', colour: '#e9b14d', deep: '#b57d1e', light: '#ffe082', img: 'assets/eitt/brontosaurus.webp' }),
  Object.freeze({ face: 4, key: 'gramedla', name: 'Grameðla', colour: '#e8483b', deep: '#ad3127', light: '#ff8a75', img: 'assets/eitt/trex.webp' }),
  Object.freeze({ face: 5, key: 'sloedla', name: 'Slóeðla', colour: '#3a8de4', deep: '#2161a6', light: '#82c4ff', img: 'assets/eitt/parasaurolophus.webp' }),
  Object.freeze({ face: 6, key: 'flugedla', name: 'Flugeðla', colour: '#dc8090', deep: '#955055', light: '#f5b0bd', img: 'assets/eitt/pteranodon.webp' }),
]);

export const dinoByFace = face => DINOS[face - 1] ?? null;
export const dinoByKey = key => DINOS.find(d => d.key === key) ?? null;

/**
 * The 12 visual scorecard categories:
 * - Left column ('left'): the 6 dinosaur friends (1..6). Each matching die gives 2 points (2..10), so Mosi (1) is just as
 *   rewarding as Flugeðla (6) and a five-year-old never has to multiply 4 × 3 vs 1 × 3.
 * - Right column ('right'): the 6 dinosaur combinations.
 */
export const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'mosi', name: '1 · Mosi', short: 'Mosi', side: 'left', kind: 'friend', face: 1, max: 10, hint: '2 stig fyrir hvern Mosa' }),
  Object.freeze({ id: 'kambedla', name: '2 · Kambeðla', short: 'Kambeðla', side: 'left', kind: 'friend', face: 2, max: 10, hint: '2 stig fyrir hverja Kambeðlu' }),
  Object.freeze({ id: 'thorsedla', name: '3 · Þórseðla', short: 'Þórseðla', side: 'left', kind: 'friend', face: 3, max: 10, hint: '2 stig fyrir hverja Þórseðlu' }),
  Object.freeze({ id: 'gramedla', name: '4 · Grameðla', short: 'Grameðla', side: 'left', kind: 'friend', face: 4, max: 10, hint: '2 stig fyrir hverja Grameðlu' }),
  Object.freeze({ id: 'sloedla', name: '5 · Slóeðla', short: 'Slóeðla', side: 'left', kind: 'friend', face: 5, max: 10, hint: '2 stig fyrir hverja Slóeðlu' }),
  Object.freeze({ id: 'flugedla', name: '6 · Flugeðla', short: 'Flugeðla', side: 'left', kind: 'friend', face: 6, max: 10, hint: '2 stig fyrir hverja Flugeðlu' }),
  Object.freeze({ id: 'pair', name: 'Tveir vinir', short: 'Par', side: 'right', kind: 'combo', max: 6, hint: '2 eins = 4 stig · 2 pör = 6 stig' }),
  Object.freeze({ id: 'three', name: 'Þrír saman', short: 'Þrenna', side: 'right', kind: 'combo', max: 9, hint: '3 eins = 7 stig · 4 eins = 9 stig' }),
  Object.freeze({ id: 'full-nest', name: 'Fullt hreiður', short: 'Fullt hreiður', side: 'right', kind: 'combo', max: 10, hint: '3 eins + 2 eins = 10 stig' }),
  Object.freeze({ id: 'footprints', name: 'Fótsporaröð', short: 'Röð', side: 'right', kind: 'combo', max: 12, hint: '4 í röð = 9 stig · 5 í röð = 12 stig' }),
  Object.freeze({ id: 'treasure', name: 'Fjársjóðskarfa', short: 'Karfa', side: 'right', kind: 'combo', max: 8, hint: 'Allir teningar gefa 4–8 stig!' }),
  Object.freeze({ id: 'yatzy', name: 'Risaeðlu-Yatzy!', short: 'Yatzy!', side: 'right', kind: 'combo', max: 15, hint: 'Allir 5 eins = 15 stig + Gullmerki!' }),
]);

const CATEGORY_IDS = new Set(CATEGORIES.map(c => c.id));
const PLAYERS = ['child', 'sloedla'];

export const other = who => (who === 'child' ? 'sloedla' : 'child');

/** Counts how many of each face 1..6 appear in `dice` (returns a 7-element array where index 1..6 holds the count). */
export function countFaces(dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  if (!Array.isArray(dice)) return counts;
  for (const d of dice) {
    if (Number.isInteger(d) && d >= 1 && d <= 6) counts[d]++;
  }
  return counts;
}

/** Longest run of consecutive faces present in `dice` (e.g. [1,2,3,4,6] -> 4; [2,3,4,5,6] -> 5). */
export function longestRun(dice) {
  const counts = countFaces(dice);
  let best = 0;
  let cur = 0;
  for (let f = 1; f <= 6; f++) {
    if (counts[f] > 0) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}

/**
 * Scores `dice` (an array of 5 faces in 1..6) for `categoryId`.
 * Returns 0 if `dice` is incomplete.
 */
export function scoreCategory(categoryId, dice) {
  if (!CATEGORY_IDS.has(categoryId)) throw new TypeError(`Unknown category "${categoryId}"`);
  if (!Array.isArray(dice) || dice.length !== DICE_COUNT || dice.some(d => !Number.isInteger(d) || d < 1 || d > 6)) return 0;

  const cat = CATEGORIES.find(c => c.id === categoryId);
  const counts = countFaces(dice);
  if (cat.kind === 'friend') {
    return counts[cat.face] * 2;
  }

  const maxCount = Math.max(...counts.slice(1));
  const pairsOrBetter = counts.slice(1).filter(c => c >= 2).length;
  const run = longestRun(dice);

  switch (categoryId) {
    case 'pair':
      if (pairsOrBetter >= 2 || maxCount >= 4) return 6;
      if (maxCount >= 2) return 4;
      return 0;
    case 'three':
      if (maxCount >= 4) return 9;
      if (maxCount >= 3) return 7;
      return 0;
    case 'full-nest':
      if (maxCount === 5 || (maxCount === 3 && pairsOrBetter === 2)) return 10;
      return 0;
    case 'footprints':
      if (run >= 5) return 12;
      if (run >= 4) return 9;
      return 0;
    case 'treasure': {
      // Always scores between 4 and 8 so the child always has a safe, happy fallback box.
      const bonus = maxCount >= 3 ? 4 : pairsOrBetter >= 2 ? 3 : maxCount === 2 ? 2 : run >= 4 ? 4 : 1;
      return Math.min(8, 4 + bonus);
    }
    case 'yatzy':
      return maxCount === 5 ? 15 : 0;
    default:
      return 0;
  }
}

/**
 * Inspects a 5-dice roll and returns its most exciting combination for banners, sound effects and animations:
 * { kind, face, indices, label }
 */
export function detectCombo(dice) {
  if (!Array.isArray(dice) || dice.length !== DICE_COUNT) return { kind: 'none', face: null, indices: [], label: '' };
  const counts = countFaces(dice);
  const maxCount = Math.max(...counts.slice(1));
  const bestFace = counts.findIndex((c, f) => f >= 1 && c === maxCount);
  const matchingIndices = face => dice.map((d, i) => (d === face ? i : -1)).filter(i => i >= 0);

  if (maxCount === 5) {
    const dino = dinoByFace(bestFace);
    return { kind: 'yatzy', face: bestFace, dinoKey: dino.key, indices: [0, 1, 2, 3, 4], label: `Risaeðlu-Yatzy! 5× ${dino.name}!` };
  }
  const run = longestRun(dice);
  if (run === 5) {
    return { kind: 'footprints-5', face: bestFace, indices: [0, 1, 2, 3, 4], label: 'Stór fótsporaröð!' };
  }
  const pairsOrBetter = counts.slice(1).filter(c => c >= 2).length;
  if (maxCount === 3 && pairsOrBetter === 2) {
    return { kind: 'full-nest', face: bestFace, indices: [0, 1, 2, 3, 4], label: 'Fullt hreiður!' };
  }
  if (maxCount === 4) {
    const dino = dinoByFace(bestFace);
    return { kind: 'four', face: bestFace, indices: matchingIndices(bestFace), label: `Fjórir eins! (${dino.name})` };
  }
  if (run === 4) {
    return { kind: 'footprints-4', face: bestFace, indices: [0, 1, 2, 3, 4], label: 'Fótsporaröð!' };
  }
  if (maxCount === 3) {
    const dino = dinoByFace(bestFace);
    return { kind: 'three', face: bestFace, indices: matchingIndices(bestFace), label: `Þrír saman! (${dino.name})` };
  }
  if (pairsOrBetter >= 2) {
    const pairFaces = counts.map((c, f) => (f >= 1 && c >= 2 ? f : -1)).filter(f => f >= 1);
    const indices = dice.map((d, i) => (pairFaces.includes(d) ? i : -1)).filter(i => i >= 0);
    return { kind: 'two-pairs', face: bestFace, indices, label: 'Tvö pör!' };
  }
  if (maxCount === 2) {
    return { kind: 'pair', face: bestFace, indices: matchingIndices(bestFace), label: 'Tveir vinir!' };
  }
  return { kind: 'none', face: bestFace, indices: [], label: '' };
}

/** Creates a fresh two-player game between 'child' and 'sloedla'. */
export function newGame() {
  return {
    turn: 'child',
    round: 1,
    rollsLeft: MAX_ROLLS,
    rolled: false,
    dice: [1, 2, 3, 4, 5],
    held: [false, false, false, false, false],
    eggCharge: 2, // starts 1 spark away from full so the child gets to try the Golden Egg early!
    eggUsedThisTurn: false,
    scores: { child: {}, sloedla: {} },
    yatzyBadges: [],
    winner: null,
  };
}

/** Categories still available to `who`. */
export function openCategories(game, who) {
  if (!PLAYERS.includes(who)) throw new TypeError(`"${who}" is not a player`);
  const taken = game.scores[who] ?? {};
  return CATEGORIES.filter(c => !(c.id in taken));
}

/** Total points scored so far by `who`. */
export function totalScore(game, who) {
  if (!PLAYERS.includes(who)) throw new TypeError(`"${who}" is not a player`);
  return Object.values(game.scores[who] ?? {}).reduce((sum, v) => sum + v, 0);
}

function mustTurn(game, who) {
  if (!PLAYERS.includes(who)) throw new TypeError(`"${who}" is not a player`);
  if (game.winner) throw new Error(`The game is over: ${game.winner} won`);
  if (game.turn !== who) throw new Error(`It is ${game.turn}'s turn, not ${who}'s`);
}

function randomFace(random) {
  return Math.min(6, Math.max(1, Math.floor(random() * 6) + 1));
}

function withYatzyBadge(badges, dice, who) {
  if (who !== 'child') return badges;
  const combo = detectCombo(dice);
  if (combo.kind === 'yatzy' && combo.dinoKey && !badges.includes(combo.dinoKey)) {
    return [...badges, combo.dinoKey];
  }
  return badges;
}

/**
 * Rolls all unheld dice for `who` (on the first roll of a turn, all 5 dice roll).
 * Decrements `rollsLeft`. When the child rolls a pair or better, `eggCharge` gains +1 (up to MAX_EGG_CHARGE).
 */
export function rollDice(game, who, random = Math.random) {
  mustTurn(game, who);
  if (game.rollsLeft <= 0) throw new Error(`${who} has no rolls left this turn`);
  const firstRoll = !game.rolled;
  const held = firstRoll ? [false, false, false, false, false] : [...game.held];
  if (!firstRoll && held.every(Boolean)) throw new Error('Cannot roll when all 5 dice are held in the nest');

  const dice = game.dice.map((face, i) => (held[i] ? face : randomFace(random)));
  const combo = detectCombo(dice);
  const chargeGain = who === 'child' && combo.kind !== 'none' ? 1 : 0;
  const eggCharge = Math.min(MAX_EGG_CHARGE, game.eggCharge + chargeGain);
  const yatzyBadges = withYatzyBadge(game.yatzyBadges, dice, who);

  return {
    ...game,
    rolled: true,
    rollsLeft: game.rollsLeft - 1,
    dice,
    held,
    eggCharge,
    yatzyBadges,
  };
}

/** Toggles whether die `index` (0..4) is held in the moss nest. */
export function toggleHold(game, who, index) {
  mustTurn(game, who);
  if (!game.rolled) throw new Error('Roll the dice before holding them in the nest');
  if (game.rollsLeft <= 0) throw new Error('No rolls left: pick a category on the scorecard');
  if (!Number.isInteger(index) || index < 0 || index >= DICE_COUNT) throw new RangeError(`Die index ${index} out of range 0..4`);
  const held = game.held.map((h, i) => (i === index ? !h : h));
  return { ...game, held };
}

/** Sets the held array directly (used by Slóeðla's AI and Mosi's quick-hold). */
export function setHeld(game, who, heldMask) {
  mustTurn(game, who);
  if (!game.rolled) throw new Error('Roll the dice before holding them');
  if (!Array.isArray(heldMask) || heldMask.length !== DICE_COUNT) throw new TypeError('heldMask must be an array of 5 booleans');
  return { ...game, held: heldMask.map(Boolean) };
}

/** Whether the child can activate the Golden Egg (Slóeðla's horn power) right now. */
export function canUseEgg(game, who = 'child') {
  return (
    !game.winner &&
    who === 'child' &&
    game.turn === 'child' &&
    game.rolled &&
    !game.eggUsedThisTurn &&
    game.eggCharge >= MAX_EGG_CHARGE
  );
}

/**
 * Finds the best single-die transformation `(index, targetFace)` for the Golden Egg power:
 * prefers an unheld die (or any die if all are held) and picks the `(index, targetFace)` that maximizes the best available
 * category score (with a strong bonus for creating a 5-of-a-kind Yatzy, Fullt hreiður, or Fótsporaröð).
 */
export function bestEggTransform(game, who = 'child') {
  const open = openCategories(game, who);
  const candidateIndices = game.held.some(h => !h)
    ? game.held.map((h, i) => (!h ? i : -1)).filter(i => i >= 0)
    : [0, 1, 2, 3, 4];
  const heldFaces = new Set(game.dice.filter((_, i) => game.held[i]));

  let bestScore = -1;
  let bestIndex = candidateIndices[0];
  let bestFace = game.dice[bestIndex];

  for (const idx of candidateIndices) {
    for (let f = 1; f <= 6; f++) {
      if (f === game.dice[idx]) continue;
      const trial = game.dice.map((d, i) => (i === idx ? f : d));
      const counts = countFaces(trial);
      const maxSame = Math.max(...counts.slice(1));
      const topCat = Math.max(0, ...open.map(c => scoreCategory(c.id, trial)));
      const matchesHeld = heldFaces.has(f) ? 45 : 0;
      // Value the immediate category score, matching the child's held dice, and building toward sets
      const value = topCat * 10 + maxSame * 6 + matchesHeld + (maxSame === 5 ? 50 : 0);
      if (value > bestScore) {
        bestScore = value;
        bestIndex = idx;
        bestFace = f;
      }
    }
  }
  return { index: bestIndex, face: bestFace };
}

/**
 * Activates the Golden Egg (Slóeðla's horn power):
 * - Spends the 3 egg sparks (`eggCharge = 0`, `eggUsedThisTurn = true`)
 * - Grants +1 extra roll (`rollsLeft + 1`)
 * - Transforms one die into `bestEggTransform`'s face and holds the matching group!
 * Returns `{ game, changedIndex, newFace }`.
 */
export function useEggPower(game, who = 'child') {
  if (!canUseEgg(game, who)) throw new Error('The Golden Egg is not ready to use');
  const { index, face } = bestEggTransform(game, who);
  const dice = game.dice.map((d, i) => (i === index ? face : d));
  const yatzyBadges = withYatzyBadge(game.yatzyBadges, dice, who);
  const next = {
    ...game,
    dice,
    rollsLeft: game.rollsLeft + 1,
    eggCharge: 0,
    eggUsedThisTurn: true,
    yatzyBadges,
  };
  return { game: next, changedIndex: index, newFace: face };
}

/**
 * Scores the current dice into `categoryId` for `who` and advances the turn.
 * When both players have filled all 12 categories, sets `winner` ('child', 'sloedla', or 'tie').
 */
export function chooseCategory(game, who, categoryId) {
  mustTurn(game, who);
  if (!game.rolled) throw new Error(`${who} must roll before choosing a category`);
  if (!CATEGORY_IDS.has(categoryId)) throw new TypeError(`Unknown category "${categoryId}"`);
  if (categoryId in game.scores[who]) throw new Error(`Category "${categoryId}" is already filled for ${who}`);

  const points = scoreCategory(categoryId, game.dice);
  const nextScores = {
    ...game.scores,
    [who]: { ...game.scores[who], [categoryId]: points },
  };
  const yatzyBadges = withYatzyBadge(game.yatzyBadges, game.dice, who);
  // Picking a category also gives +1 spark toward the Golden Egg if the child scored >= 6 points and didn't just use the egg
  const eggCharge = who === 'child' && !game.eggUsedThisTurn && points >= 6
    ? Math.min(MAX_EGG_CHARGE, game.eggCharge + 1)
    : game.eggCharge;

  const nextPlayer = other(who);
  const childDone = Object.keys(nextScores.child).length === CATEGORIES.length;
  const sloedlaDone = Object.keys(nextScores.sloedla).length === CATEGORIES.length;
  const allDone = childDone && sloedlaDone;

  let winner = null;
  if (allDone) {
    const childTotal = Object.values(nextScores.child).reduce((a, b) => a + b, 0);
    const sloedlaTotal = Object.values(nextScores.sloedla).reduce((a, b) => a + b, 0);
    winner = childTotal > sloedlaTotal ? 'child' : sloedlaTotal > childTotal ? 'sloedla' : 'tie';
  }

  return {
    ...game,
    turn: allDone ? who : nextPlayer,
    round: who === 'sloedla' && !allDone ? game.round + 1 : game.round,
    rollsLeft: MAX_ROLLS,
    rolled: false,
    held: [false, false, false, false, false],
    eggCharge,
    eggUsedThisTurn: false,
    scores: nextScores,
    yatzyBadges,
    winner,
  };
}
