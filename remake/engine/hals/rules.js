// The rules of "Háls og hali", a snakes-and-ladders game for a five-year-old, ported from Codex's version
// (dino-board-adventure/dist/board-rules.js) with its behaviour kept. It is plain data and pure functions: no DOM,
// no three.js, no sound, and no hidden randomness in a turn. The world, the dice and the voices do not decide where a
// player lands; they play out the result that resolveTurn() and applyTurn() return.
//
// The board is 80 squares on five tiers of 16, drawn from the side. Square 0 is the start, before the first square.
// The ends of the tiers are joined, so every square touches the next one: the first tier runs left to right, the
// second right to left, and so on up.
//
// A Þórseðla's neck is a ladder (she lifts the pawn up to a higher tier) and her tail is a slide (the pawn rides down).
//
// The rules, as Codex had them:
//  - The die is 1 to 6, and only the square a pawn LANDS on starts anything. Walking over a neck, a tail or an
//    event does nothing, and a six gives no extra roll.
//  - The far end of a neck or a tail is an ordinary square, so one turn never chains into a second ride.
//  - A roll that is too high for the finish still wins: the pawn stops on 80.
//  - In "adventure" mode ("Ævintýraskógur") a few squares carry a small event, never on a route: fireflies carry the
//    pawn 2 squares on, mud sets it 2 back, and a fossil is a find. Mode "classic" has none of them.
//
// Added for the remake: the fossil collection (FOSSIL_KINDS). Every game puts a few of the 8 kinds on the fossil
// squares (placeFossils), so it pays to play again, and applyTurn names the kind a landing finds. Keeping what has
// been found between games is the save's job (engine/save.js, addHalsFound), not the rules'.

// The entire board is deterministic. Codex's measures (metres in the world), with the tiers 5.75 m apart instead of
// his 5.5, so a Þórseðla at her natural size fits under the tier above (the owner's look at the board, 2026-10-19).
export const BOARD = Object.freeze({
  columns: 16,
  rows: 5,
  count: 80,
  spacing: 2.3,
  rowHeight: 5.75,
});

// The Þórseðlas that carry the routes. `neck` goes up from a low square to a high one, `tail` slides down; either is
// null when she has only the other (Kvisti has a neck and Lyng a tail). `facing` is the way she looks along the board
// (1 is to the right) and `color` is Codex's colour for her.
export const DINOSAURS = Object.freeze([
  {id: 'fern', color: '#75b87b', facing: 1, neck: {from: 25, to: 56}, tail: {from: 28, to: 6}},
  {id: 'amber', color: '#dca251', facing: -1, neck: {from: 21, to: 44}, tail: {from: 18, to: 14}},
  {id: 'sage', color: '#7ba691', facing: 1, neck: {from: 57, to: 72}, tail: {from: 60, to: 38}},
  {id: 'coral', color: '#d88479', facing: -1, neck: {from: 53, to: 76}, tail: {from: 50, to: 46}},
  {id: 'birch', name: 'Kvisti', color: '#c8ae79', facing: 1, neck: {from: 4, to: 29}, tail: null},
  {id: 'plum', name: 'Lyng', color: '#a491ab', facing: 1, neck: null, tail: {from: 74, to: 42}},
].map(dinosaur => Object.freeze({
  ...dinosaur,
  neck: dinosaur.neck ? Object.freeze(dinosaur.neck) : null,
  tail: dinosaur.tail ? Object.freeze(dinosaur.tail) : null,
})));

// Every neck and tail as one ride: { id, type: 'neck' | 'tail', from, to, dinosaur }.
export const SHORTCUTS = Object.freeze(DINOSAURS.flatMap(dinosaur =>
  ['neck', 'tail'].filter(type => dinosaur[type]).map(type => Object.freeze({
    id: `${dinosaur.id}-${type}`,
    type,
    from: dinosaur[type].from,
    to: dinosaur[type].to,
    dinosaur: dinosaur.id,
  })),
));

const shortcutsByStart = new Map(SHORTCUTS.map(shortcut => [shortcut.from, shortcut]));

// Adventure is optional and deliberately one event per dice landing. These small encounters never chain into a
// dinosaur route or another event. `to` is where the pawn ends up (a fossil stays where it is).
export const SPECIAL_TILES = Object.freeze([
  ...[9, 15, 34, 62].map(from => ({type: 'firefly', from, to: from + 2, label: 'Ljósflugur'})),
  ...[47, 70].map(from => ({type: 'mud', from, to: from - 2, label: 'Mjúk leðja'})),
  ...[7, 32, 45, 67].map(from => ({type: 'fossil', from, to: from, label: 'Steingervingur'})),
].map(event => Object.freeze(event)));
const eventsByStart = new Map(SPECIAL_TILES.map(event => [event.from, event]));

// The fossil collection: 8 things a child can find. `id` is the name in code and in the save; `name` is what the
// narrator says and what the sticker shows.
export const FOSSIL_KINDS = Object.freeze([
  {id: 'ammonite', name: 'Ammónít'},
  {id: 'trilobite', name: 'Þríbroti'},
  {id: 'tooth', name: 'Risaeðlutönn'},
  {id: 'footprint', name: 'Fótspor'},
  {id: 'leaf', name: 'Steingert laufblað'},
  {id: 'amber', name: 'Raf með flugu'},
  {id: 'egg', name: 'Risaeðluegg'},
  {id: 'skeleton', name: 'Beinagrind'},
].map(kind => Object.freeze(kind)));
const kindIds = new Set(FOSSIL_KINDS.map(kind => kind.id));

// The squares where a fossil lies, in board order: Codex's 7, 32, 45 and 67.
export const FOSSIL_SQUARES = Object.freeze(SPECIAL_TILES.filter(event => event.type === 'fossil').map(event => event.from));
const isFossilSquare = number => eventsByStart.get(number)?.type === 'fossil';

/**
 * Which kind lies on which fossil square in one game: an object like { 7: 'tooth', 32: 'egg', 45: 'leaf', 67: 'ammonite' },
 * four different kinds of the eight, picked and ordered by `random` (a function giving numbers in [0, 1), such as
 * Math.random or a seeded one from engine/random.js).
 */
export function placeFossils(random = Math.random) {
  if (typeof random !== 'function') throw new TypeError('random must be a function.');
  const pool = FOSSIL_KINDS.map(kind => kind.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Object.fromEntries(FOSSIL_SQUARES.map((square, index) => [square, pool[index]]));
}

function validateMode(mode) {
  if (mode !== 'classic' && mode !== 'adventure') throw new RangeError('Unknown game mode.');
}

function integerInRange(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer from ${min} to ${max}.`);
  }
}

// Row zero is at the bottom. Odd rows run back towards the left, so every
// consecutive square touches its neighbour, including the ends of rows.
export function tileNumber(row, column) {
  integerInRange(row, 0, BOARD.rows - 1, 'row');
  integerInRange(column, 0, BOARD.columns - 1, 'column');
  return row * BOARD.columns + (row % 2 ? BOARD.columns - column : column + 1);
}

// Where a square sits in the world: x along the board (0 is the middle), y up the tiers. Square 0, the start, waits
// one step left of the first square.
export function tilePosition(number) {
  integerInRange(number, 0, BOARD.count, 'number');
  if (number === 0) {
    return {x: -(BOARD.columns + 1) / 2 * BOARD.spacing, y: 0, z: 0};
  }
  const row = Math.floor((number - 1) / BOARD.columns);
  const offset = (number - 1) % BOARD.columns;
  const column = row % 2 ? BOARD.columns - 1 - offset : offset;
  return {
    x: (column - (BOARD.columns - 1) / 2) * BOARD.spacing,
    y: row * BOARD.rowHeight,
    z: 0,
  };
}

/**
 * One throw from square `from` (0 to 80): { from, roll, steps, landed, shortcut, event, destination, won }.
 *   steps        the squares the pawn walks over, one hop each, ending on `landed` (never past 80)
 *   shortcut     the neck or tail on `landed`, or null
 *   event        the adventure event on `landed` (mode "adventure" only, never together with a shortcut), or null
 *   destination  where the pawn ends the turn: the shortcut's or event's far end, else `landed`
 *   won          the pawn ends on 80
 */
export function resolveTurn(from, roll, {mode = 'classic'} = {}) {
  integerInRange(from, 0, BOARD.count, 'from');
  integerInRange(roll, 1, 6, 'roll');
  validateMode(mode);
  const landed = Math.min(BOARD.count, from + roll);
  const steps = Array.from({length: landed - from}, (_, index) => from + index + 1);
  // Passing over a neck or tail does nothing. Only the dice landing activates
  // one ride. Its destination never triggers an additional ride this turn.
  const shortcut = shortcutsByStart.get(landed) ?? null;
  const event = mode === 'adventure' && !shortcut ? eventsByStart.get(landed) ?? null : null;
  const destination = shortcut?.to ?? event?.to ?? landed;
  return {from, roll, steps, landed, shortcut, event, destination, won: destination === BOARD.count};
}

/**
 * A new game, as plain data that can go straight into JSON:
 *   { version, mode, players: [{ id, position, isComputer, fossils }], currentPlayer, winner, turnCount, lastTurn, fossilKinds }
 * `fossils` are the fossil squares that player has found in this game; `fossilKinds` says which kind lies on each
 * fossil square (placeFossils(random)). The last player is the computer when `vsComputer`.
 */
export function createGame({playerCount = 2, vsComputer = false, mode = 'classic', random = Math.random} = {}) {
  integerInRange(playerCount, 1, 4, 'playerCount');
  validateMode(mode);
  if (typeof vsComputer !== 'boolean') throw new TypeError('vsComputer must be a boolean.');
  if (vsComputer && playerCount < 2) throw new RangeError('A computer game needs at least two players.');
  return {
    version: 1,
    mode,
    players: Array.from({length: playerCount}, (_, id) => ({
      id,
      position: 0,
      isComputer: vsComputer && id === playerCount - 1,
      fossils: [],
    })),
    currentPlayer: 0,
    winner: null,
    turnCount: 0,
    lastTurn: null,
    fossilKinds: placeFossils(random),
  };
}

/**
 * The game after the current player throws `roll` (1 to 6); the game that went in is left alone, and a won game comes
 * back as it is. `lastTurn` is resolveTurn()'s result plus:
 *   player     who threw
 *   newFossil  true when the landing found a fossil square this player had not found before in this game
 *   fossil     the kind that lies on the fossil square landed on (an id of FOSSIL_KINDS), or null when it was no
 *              fossil square, or the game has no placement (a game saved before the collection)
 * Whether the kind is new to the child's collection is not the rules' business: the host asks the save.
 */
export function applyTurn(state, roll) {
  validateGame(state);
  integerInRange(roll, 1, 6, 'roll');
  if (state.winner !== null) return state;
  const player = state.currentPlayer;
  const turn = resolveTurn(state.players[player].position, roll, {mode: state.mode ?? 'classic'});
  const alreadyFound = state.players[player].fossils ?? [];
  const onFossil = turn.event?.type === 'fossil';
  const newFossil = onFossil && !alreadyFound.includes(turn.landed);
  const fossil = onFossil ? state.fossilKinds?.[turn.landed] ?? null : null;
  return {
    ...state,
    players: state.players.map((entry, index) => index === player ? {
      ...entry, position: turn.destination,
      fossils: newFossil ? [...alreadyFound, turn.landed] : [...alreadyFound],
    } : {...entry, fossils: [...(entry.fossils ?? [])]}),
    currentPlayer: turn.won ? player : (player + 1) % state.players.length,
    winner: turn.won ? player : null,
    turnCount: state.turnCount + 1,
    lastTurn: {...turn, player, newFossil, fossil},
  };
}

// Safe to call on parsed saved games before rendering or resuming them. Throws a RangeError or a TypeError that says
// what is wrong, and gives true otherwise.
export function validateGame(state) {
  if (!state || !Array.isArray(state.players)) throw new TypeError('A game must contain players.');
  // Earlier local previews did not include a version. Their state shape is
  // compatible, while an unknown future format must not resume incorrectly.
  if (state.version !== undefined && state.version !== 1) throw new RangeError('Unsupported game version.');
  validateMode(state.mode ?? 'classic');
  integerInRange(state.players.length, 1, 4, 'player count');
  for (const [index, player] of state.players.entries()) {
    if (!player || player.id !== index || typeof player.isComputer !== 'boolean') {
      throw new TypeError('Each player must have a sequential id and a boolean isComputer.');
    }
    integerInRange(player.position, 0, BOARD.count, 'player position');
    if (player.fossils !== undefined && (!Array.isArray(player.fossils) ||
      new Set(player.fossils).size !== player.fossils.length ||
      !player.fossils.every(isFossilSquare))) {
      throw new RangeError('Fossils must be distinct collectible squares.');
    }
  }
  integerInRange(state.currentPlayer, 0, state.players.length - 1, 'currentPlayer');
  integerInRange(state.turnCount, 0, Number.MAX_SAFE_INTEGER, 'turnCount');
  if (state.winner !== null) {
    integerInRange(state.winner, 0, state.players.length - 1, 'winner');
    if (state.players[state.winner].position !== BOARD.count || state.currentPlayer !== state.winner) {
      throw new RangeError('The winning player must be at the finish and own the final turn.');
    }
  }
  if (state.players.some((player, index) => player.position === BOARD.count && index !== state.winner)) {
    throw new RangeError('Only the winning player can be at the finish.');
  }
  // A game saved before the collection has no placement, which is fine.
  if (state.fossilKinds !== undefined) {
    const placed = state.fossilKinds;
    if (!placed || typeof placed !== 'object' || Array.isArray(placed)) {
      throw new TypeError('fossilKinds must say which kind lies on which fossil square.');
    }
    const kinds = Object.values(placed);
    if (!Object.keys(placed).every(key => isFossilSquare(Number(key))) ||
      !kinds.every(kind => kindIds.has(kind)) || new Set(kinds).size !== kinds.length) {
      throw new RangeError('fossilKinds must put distinct known kinds on fossil squares.');
    }
  }
  return true;
}
