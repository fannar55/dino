// Classic Scandinavian Yatzy, independent of rendering, audio and wall time.
// Every action returns fresh data. The controller owns animation/pause locks.
export const DICE_COUNT = 5;
export const MAX_ROLLS = 3;
export const SAVE_VERSION = 1;
export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 50;

export const CATEGORIES = Object.freeze([
  {id:'ones', label:'Einar', section:'upper', face:1, max:5, description:'Teldu alla ásana. Hver ás gefur 1 stig.'},
  {id:'twos', label:'Tvíar', section:'upper', face:2, max:10, description:'Leggðu saman alla tvistana.'},
  {id:'threes', label:'Þristar', section:'upper', face:3, max:15, description:'Leggðu saman alla þristana.'},
  {id:'fours', label:'Fjarkar', section:'upper', face:4, max:20, description:'Leggðu saman alla fjarkana.'},
  {id:'fives', label:'Fimmur', section:'upper', face:5, max:25, description:'Leggðu saman allar fimmurnar.'},
  {id:'sixes', label:'Sexur', section:'upper', face:6, max:30, description:'Leggðu saman allar sexurnar.'},
  {id:'pair', label:'Eitt par', section:'lower', max:12, description:'Tvær eins. Hæsta parið gefur stig; hinir teningarnir telja ekki.'},
  {id:'twoPairs', label:'Tvö pör', section:'lower', max:22, description:'Tvö ólík pör. Leggðu saman þessa fjóra teninga. Fjórar eins eru ekki tvö pör.'},
  {id:'threeKind', label:'Þrjár eins', section:'lower', max:18, description:'Að minnsta kosti þrjár eins. Aðeins þrír eins teningar telja.'},
  {id:'fourKind', label:'Fjórar eins', section:'lower', max:24, description:'Að minnsta kosti fjórar eins. Aðeins fjórir eins teningar telja.'},
  {id:'smallStraight', label:'Lítil röð', section:'lower', max:15, description:'Einn af hverju: 1, 2, 3, 4 og 5. Gefur 15 stig.'},
  {id:'largeStraight', label:'Stór röð', section:'lower', max:20, description:'Einn af hverju: 2, 3, 4, 5 og 6. Gefur 20 stig.'},
  {id:'fullHouse', label:'Fullt hús', section:'lower', max:28, description:'Nákvæmlega þrjár eins og tvær aðrar eins. Allir fimm telja. Fimm eins eru ekki fullt hús.'},
  {id:'chance', label:'Séns', section:'lower', max:30, description:'Leggðu saman alla fimm teningana, hvernig sem þeir liggja.'},
  {id:'yatzy', label:'YATZY', section:'lower', max:50, description:'Allir fimm teningarnir eins. Gefur 50 stig.'},
].map(category => Object.freeze(category)));

const BY_ID = new Map(CATEGORIES.map(category => [category.id, category]));
const PLAYER_IDS = ['you', 'mosi'];
const UINT32_MAX = 0xffffffff;
const STATE_FIELDS = ['version', 'players', 'currentPlayer', 'startingPlayer', 'turnCount', 'rollCount', 'dice', 'held', 'rng', 'status', 'winner'];
const assert = (condition, message) => {if (!condition) throw new TypeError(message);};
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function ownValue(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  assert(descriptor && Object.hasOwn(descriptor, 'value'), `Missing or non-data field: ${key}`);
  return descriptor.value;
}
function categoryFor(id) {
  const category = BY_ID.get(id); assert(category, `Unknown Yatzy category: ${String(id)}`); return category;
}
function diceCounts(dice) {
  assert(Array.isArray(dice) && dice.length === DICE_COUNT, 'Exactly five dice are required');
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < DICE_COUNT; i++) {
    const face = ownValue(dice, i); assert(integer(face, 1, 6), 'Dice must be integers from 1 to 6'); counts[face]++;
  }
  return counts;
}
function scoreCounts(category, counts) {
  if (category.face) return counts[category.face] * category.face;
  if (category.id === 'chance') return counts.reduce((sum, count, face) => sum + count * face, 0);
  if (category.id === 'smallStraight') return counts.slice(1, 6).every(count => count === 1) ? 15 : 0;
  if (category.id === 'largeStraight') return counts.slice(2).every(count => count === 1) ? 20 : 0;
  if (category.id === 'yatzy') return counts.includes(5) ? 50 : 0;
  if (category.id === 'fullHouse') {
    const three = counts.indexOf(3), two = counts.indexOf(2);
    return three > 0 && two > 0 ? three * 3 + two * 2 : 0;
  }
  if (category.id === 'twoPairs') {
    const pairs = [];
    for (let face = 6; face >= 1; face--) if (counts[face] >= 2) pairs.push(face);
    return pairs.length >= 2 ? 2 * (pairs[0] + pairs[1]) : 0;
  }
  const needed = category.id === 'pair' ? 2 : category.id === 'threeKind' ? 3 : 4;
  for (let face = 6; face >= 1; face--) if (counts[face] >= needed) return face * needed;
  return 0;
}

/** Strict five-dice scoring; previews() handles a turn that has not rolled yet. */
export function scoreCategory(categoryId, dice) {return scoreCounts(categoryFor(categoryId), diceCounts(dice));}

// Enumerate only the 252 unordered hands once, to validate saved score values.
// The AI never enumerates 7,776 ordered outcomes or reads the future RNG.
const REACHABLE = new Map(CATEGORIES.map(category => [category.id, new Set()]));
const validationCounts = [0, 0, 0, 0, 0, 0, 0];
function buildReachable(face = 1, left = DICE_COUNT) {
  if (face === 6) {
    validationCounts[face] = left;
    for (const category of CATEGORIES) REACHABLE.get(category.id).add(scoreCounts(category, validationCounts));
    return;
  }
  for (let count = 0; count <= left; count++) {validationCounts[face] = count; buildReachable(face + 1, left - count);}
}
buildReachable();

function validateScorecard(scorecard) {
  assert(record(scorecard), 'A scorecard must be a plain object');
  for (const category of CATEGORIES) {
    const value = ownValue(scorecard, category.id);
    assert(value === null || REACHABLE.get(category.id).has(value), `Impossible score for ${category.id}`);
  }
}
function sumCard(scorecard) {
  let upper = 0, lower = 0;
  for (const category of CATEGORIES) {
    if (category.section === 'upper') upper += scorecard[category.id] ?? 0;
    else lower += scorecard[category.id] ?? 0;
  }
  const bonus = upper >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
  return {upper, bonus, lower, total:upper + bonus + lower};
}
/** Null is unfilled; a numeric zero is a permanently used category. */
export function totals(scorecard) {validateScorecard(scorecard); return sumCard(scorecard);}
function findWinner(players) {
  const difference = sumCard(players[0].scores).total - sumCard(players[1].scores).total;
  return difference === 0 ? 'tie' : PLAYER_IDS[difference > 0 ? 0 : 1];
}

/** Validates shape, reachable points, alternating turns and derived end state. */
export function validateGame(value) {
  assert(record(value), 'Game must be a plain object');
  for (const key of STATE_FIELDS) ownValue(value, key);
  assert(value.version === SAVE_VERSION, 'Unsupported Yatzy save version');
  assert(integer(value.startingPlayer, 0, 1) && integer(value.currentPlayer, 0, 1), 'Invalid player index');
  assert(integer(value.turnCount, 0, 30), 'Invalid scored turn count');
  assert(integer(value.rollCount, 0, MAX_ROLLS), 'Invalid roll count');
  assert(integer(value.rng, 0, UINT32_MAX), 'Invalid random state');
  assert(Array.isArray(value.players) && value.players.length === 2, 'Exactly two players are required');
  const filled = [];
  for (let i = 0; i < 2; i++) {
    const player = ownValue(value.players, i);
    assert(record(player), 'Invalid player');
    assert(ownValue(player, 'id') === PLAYER_IDS[i], 'Unexpected player identity or order');
    const scores = ownValue(player, 'scores'); validateScorecard(scores);
    filled.push(CATEGORIES.filter(category => scores[category.id] !== null).length);
  }
  const first = value.startingPlayer, next = (first + value.turnCount) % 2;
  assert(filled[first] === Math.ceil(value.turnCount / 2) && filled[1 - first] === Math.floor(value.turnCount / 2), 'Scores do not match alternating turns');
  assert(value.currentPlayer === next, 'Current player does not match turn count');
  assert(Array.isArray(value.dice) && value.dice.length === DICE_COUNT, 'Exactly five dice are required');
  assert(Array.isArray(value.held) && value.held.length === DICE_COUNT, 'Exactly five hold flags are required');
  for (let i = 0; i < DICE_COUNT; i++) {
    const die = ownValue(value.dice, i), held = ownValue(value.held, i);
    assert(typeof held === 'boolean', 'Hold flags must be booleans');
    assert(value.rollCount === 0 ? die === 0 && !held : integer(die, 1, 6), 'Dice/holds do not match roll phase');
  }
  if (value.turnCount === 30) {
    assert(value.status === 'finished' && value.rollCount === 0, 'Finished game has an active turn');
    assert(value.winner === findWinner(value.players), 'Incorrect saved winner');
  } else {
    assert(value.status === 'playing' && value.winner === null, 'Playing game has a terminal result');
  }
  return true;
}
function copyGame(game) {
  return {
    version:SAVE_VERSION,
    players:game.players.map(player => ({id:player.id, scores:Object.fromEntries(CATEGORIES.map(category => [category.id, player.scores[category.id]]))})),
    currentPlayer:game.currentPlayer, startingPlayer:game.startingPlayer, turnCount:game.turnCount, rollCount:game.rollCount,
    dice:[...game.dice], held:[...game.held], rng:game.rng, status:game.status, winner:game.winner,
  };
}
/** Return an owned, sanitized snapshot, or null for malformed/foreign saves. */
export function restoreGame(serializedOrObject) {
  try {
    if (typeof serializedOrObject === 'string' && serializedOrObject.length > 20000) return null;
    const candidate = typeof serializedOrObject === 'string' ? JSON.parse(serializedOrObject) : serializedOrObject;
    validateGame(candidate); return copyGame(candidate);
  } catch {return null;}
}
export function createGame({seed = 1, startingPlayer = 0} = {}) {
  assert(integer(seed, 0, UINT32_MAX), 'Seed must be an unsigned 32-bit integer');
  assert(integer(startingPlayer, 0, 1), 'Starting player must be 0 or 1');
  return {
    version:SAVE_VERSION,
    players:PLAYER_IDS.map(id => ({id, scores:Object.fromEntries(CATEGORIES.map(category => [category.id, null]))})),
    currentPlayer:startingPlayer, startingPlayer, turnCount:0, rollCount:0,
    dice:Array(DICE_COUNT).fill(0), held:Array(DICE_COUNT).fill(false), rng:seed, status:'playing', winner:null,
  };
}
function requirePlaying(game) {validateGame(game); assert(game.status === 'playing', 'The game is finished');}
function randomWord(rng) {
  const next = (rng + 0x6d2b79f5) >>> 0;
  let value = Math.imul(next ^ next >>> 15, next | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return {rng:next, word:(value ^ value >>> 14) >>> 0};
}
/** Roll unheld dice, consuming one attempt. All five roll on a fresh turn. */
export function roll(game) {
  requirePlaying(game);
  assert(game.rollCount < MAX_ROLLS, 'No rolls remain');
  assert(!game.held.every(Boolean), 'Release a die or choose a score: all dice are held');
  const next = copyGame(game);
  for (let i = 0; i < DICE_COUNT; i++) if (!next.held[i]) {
    let draw;
    // Reject the four excess words instead of favoring the first four faces.
    do {draw = randomWord(next.rng); next.rng = draw.rng;} while (draw.word >= 4294967292);
    next.dice[i] = 1 + draw.word % 6;
  }
  next.rollCount++; return next;
}
/** Toggle one hold, or explicitly set it. Legal after roll 1 or 2 only. */
export function hold(game, index, held) {
  requirePlaying(game);
  assert(integer(index, 0, DICE_COUNT - 1), 'Invalid die index');
  assert(game.rollCount > 0 && game.rollCount < MAX_ROLLS, 'Holding requires a rolled turn with attempts left');
  assert(held === undefined || typeof held === 'boolean', 'Held must be a boolean');
  const next = copyGame(game); next.held[index] = held === undefined ? !next.held[index] : held; return next;
}
/** Only open rows are returned, and only after the first roll. */
export function previews(game) {
  validateGame(game);
  if (game.status !== 'playing' || game.rollCount === 0) return {};
  const counts = diceCounts(game.dice), scores = game.players[game.currentPlayer].scores;
  return Object.fromEntries(CATEGORIES.filter(category => scores[category.id] === null).map(category => [category.id, scoreCounts(category, counts)]));
}
/** Record the selected row, including a failed combination's zero, then switch. */
export function score(game, categoryId) {
  requirePlaying(game); const category = categoryFor(categoryId);
  assert(game.rollCount > 0, 'Roll before choosing a score');
  assert(game.players[game.currentPlayer].scores[categoryId] === null, 'That score category is already filled');
  const next = copyGame(game);
  next.players[game.currentPlayer].scores[categoryId] = scoreCounts(category, diceCounts(game.dice));
  next.turnCount++; next.currentPlayer = (next.startingPlayer + next.turnCount) % 2;
  next.rollCount = 0; next.dice.fill(0); next.held.fill(false);
  if (next.turnCount === 30) {next.status = 'finished'; next.winner = findWinner(next.players);}
  return next;
}

// A bounded, readable opponent, not an exhaustive optimal-play solver. Mosi
// compares target patterns and estimates success from the dice he can see.
const BASELINE = {ones:2.4, twos:4.8, threes:7.2, fours:9.6, fives:12, sixes:14.4,
  pair:9, twoPairs:14, threeKind:12, fourKind:13, smallStraight:12, largeStraight:15, fullHouse:18, chance:21, yatzy:15};
const FACTORIAL = [1, 1, 2, 6, 24, 120];
const completionCache = new Map();
function completionProbability(missing, free, attempts) {
  const needs = missing.filter(count => count > 0).sort((a, b) => a - b);
  if (!needs.length) return 1;
  if (needs.reduce((a, b) => a + b, 0) > free || attempts <= 0) return 0;
  const key = `${attempts}:${free}:${needs.join(',')}`;
  if (completionCache.has(key)) return completionCache.get(key);
  const kinds = needs.length, perFace = (1 - (1 - kinds / 6) ** attempts) / kinds, miss = 1 - kinds * perFace;
  function sum(index, left, weight) {
    if (index === kinds) return weight * miss ** left / FACTORIAL[left];
    let result = 0;
    for (let count = needs[index]; count <= left; count++) result += sum(index + 1, left - count, weight * perFace ** count / FACTORIAL[count]);
    return result;
  }
  const probability = FACTORIAL[free] * sum(0, free, 1);
  // There are fewer than 100 deficit/free/attempt combinations for five dice.
  completionCache.set(key, probability); return probability;
}
function targets(category) {
  const oneFace = count => Array.from({length:6}, (_, i) => ({needs:{[i + 1]:count}, points:(i + 1) * count}));
  if (category.id === 'pair') return oneFace(2);
  if (category.id === 'threeKind') return oneFace(3);
  if (category.id === 'fourKind') return oneFace(4);
  if (category.id === 'yatzy') return oneFace(5).map(target => ({...target, points:50}));
  if (category.id === 'smallStraight' || category.id === 'largeStraight') {
    const start = category.id === 'smallStraight' ? 1 : 2;
    return [{needs:Object.fromEntries(Array.from({length:5}, (_, i) => [start + i, 1])), points:category.max}];
  }
  const patterns = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    if (category.id === 'twoPairs' && a < b) patterns.push({needs:{[a]:2, [b]:2}, points:2 * (a + b)});
    if (category.id === 'fullHouse' && a !== b) patterns.push({needs:{[a]:3, [b]:2}, points:3 * a + 2 * b});
  }
  return patterns;
}
const TARGETS = new Map(CATEGORIES.filter(category => !category.face && category.id !== 'chance').map(category => [category.id, targets(category)]));

/**
 * Returns null after game end; otherwise {type:'score', categoryId} or
 * {type:'roll', held:boolean[5]}. Apply hold flags before calling roll().
 * It may also be used as a suggestion for the current human player's turn.
 */
export function decideAI(game) {
  validateGame(game);
  if (game.status === 'finished') return null;
  if (game.rollCount === 0) return {type:'roll', held:Array(DICE_COUNT).fill(false)};
  const card = game.players[game.currentPlayer].scores;
  const open = CATEGORIES.filter(category => card[category.id] === null), counts = diceCounts(game.dice);
  const attempts = MAX_ROLLS - game.rollCount, upper = sumCard(card).upper;
  const possibleUpper = upper + open.filter(category => category.face).reduce((sum, category) => sum + category.max, 0);
  const bonusWeight = upper < 63 && possibleUpper >= 63 ? .45 : 0;
  const utility = (category, points) => points - BASELINE[category.id] + (category.face ? Math.min(points, Math.max(0, 63 - upper)) * bonusWeight : 0);
  let bestScore = null;
  for (const category of open) {
    const points = scoreCounts(category, counts), value = utility(category, points);
    if (!bestScore || value > bestScore.value + 1e-9) bestScore = {category, points, value};
  }
  if (!attempts) return {type:'score', categoryId:bestScore.category.id};
  let bestRoll = null;
  function consider(category, held, expected) {
    const value = utility(category, expected), count = held.filter(Boolean).length;
    if (count === DICE_COUNT) return;
    // Stable category/target order breaks exact ties; prefer fewer moving dice.
    if (!bestRoll || value > bestRoll.value + 1e-9 || Math.abs(value - bestRoll.value) <= 1e-9 && count > bestRoll.count) bestRoll = {held, value, count};
  }
  for (const category of open) {
    if (category.face) {
      const held = game.dice.map(face => face === category.face), kept = counts[category.face];
      consider(category, held, category.face * (kept + (DICE_COUNT - kept) * (1 - (5 / 6) ** attempts)));
    } else if (category.id === 'chance') {
      const expectedDie = attempts === 1 ? 3.5 : 4.25, held = game.dice.map(face => face >= expectedDie);
      consider(category, held, game.dice.reduce((sum, face, i) => sum + (held[i] ? face : expectedDie), 0));
    } else {
      for (const target of TARGETS.get(category.id)) {
        const missing = {...target.needs};
        const held = game.dice.map(face => {if (missing[face] > 0) {missing[face]--; return true;} return false;});
        const free = held.filter(value => !value).length;
        consider(category, held, target.points * completionProbability(Object.values(missing), free, attempts));
      }
    }
  }
  const strongScore = bestScore.points >= (bestScore.category.face ? bestScore.category.face * 3 : bestScore.category.id === 'chance' ? 25 : bestScore.category.max * .9);
  if (!bestRoll || strongScore && bestScore.value >= bestRoll.value - .15) return {type:'score', categoryId:bestScore.category.id};
  return {type:'roll', held:[...bestRoll.held]};
}
