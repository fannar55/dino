// The rules of "Háls og hali", a snakes-and-ladders game for a five-year-old, ported from Codex's version
// (dino-board-adventure/dist/board-rules.js) with its behaviour kept. It is plain data and pure functions: no DOM,
// no three.js, no sound, and no hidden randomness in a turn. The world, the dice and the voices do not decide where a
// player lands; they play out the result that resolveTurn() and applyTurn() return.
//
// The board is 100 squares on five tiers of 20, drawn from the side (the owner's choice of 2026-10-19; Codex's had 80 on
// tiers of 16). Square 0 is the start, before the first square. The ends of the tiers are joined, so every square
// touches the next one: the first tier runs left to right, the second right to left, and so on up.
//
// A Þórseðla's neck is a ladder (she lifts the pawn up to a higher tier) and her tail is a slide (the pawn rides down).
//
// The rules, as Codex had them:
//  - The die is 1 to 6, and only the square a pawn LANDS on starts anything. Walking over a neck, a tail or an
//    event does nothing, and a six gives no extra roll.
//  - The far end of a neck or a tail is an ordinary square, so one turn never chains into a second ride.
//  - The finish must be reached exactly (the owner's rule of 2026-10-19; Codex's let a roll too high win): a roll past
//    100 hops up onto it and bounces back by what is over, so from p with roll r the pawn lands on 200 - (p + r). The
//    square it bounces back to plays out as any landing (the fossil on 95 counts; no route starts in 94 to 99).
//  - In "adventure" mode ("Ævintýraskógur") a few squares carry a small event, never on a route: fireflies carry the
//    pawn 2 squares on, mud sets it 2 back, and a fossil is a find. Mode "classic" has none of them.
//
// Added for the remake: the fossil collection (FOSSIL_KINDS). Every game puts 5 of the 8 kinds on the fossil
// squares (placeFossils), so it pays to play again, and applyTurn names the kind a landing finds. Keeping what has
// been found between games is the save's job (engine/save.js, addHalsFound), not the rules'.

// The entire board is deterministic. Codex's measures (metres in the world), with the tiers 7.5 m apart instead of
// his 5.5, so a Þórseðla at her natural size stands in full view between two tiers (the owner's look, 2026-10-19).
// The tiers zigzag in depth: the odd tiers (the second and the fourth) stand in front, the even ones `recess` metres
// further back. A Þórseðla stands behind an odd tier, so the tier above her is behind her (her neck rises in front of it
// and her head rests over its square) and the tier below her is behind her too (her tail hangs down onto it).
export const BOARD = Object.freeze({
  columns: 20,
  rows: 5,
  count: 100,
  spacing: 2.3,
  rowHeight: 7.5,
  recess: 6.2,
});

// The Þórseðlas that carry the routes, laid out for 100 squares in the spirit of Codex's: four stand behind the two
// front tiers, each with a neck up one tier and a tail down one tier; the two long routes, two tiers each, belong to
// the two big elder giants at the board's ends, Burkni's neck at the right (19 up to 59) and Lyng's tail at the left
// (82 down to 41). `neck` goes up from a low square to a high one, `tail` slides down; either is null when she has only
// the other. `facing` is the way she looks along the board (1 is to the right) and `color` is Codex's colour for her.
// An ordinary neck's last square is right over its first, which lies ahead of her chest, so she bows forward onto it.
// Balance (2026-10-19, 6000 seeded games of two): median 32 turns in all, 90th percentile 50, against 28 and 43 on
// Codex's 80 squares (adventure mode: 31 and 49 against 29 and 45). With the exact finish and its bounce (the owner, later
// that day): median 39 and 60 (adventure 38 and 58), about three and a half bounces a game.
export const DINOSAURS = Object.freeze([
  {id: 'fern', color: '#75b87b', facing: -1, neck: {from: 19, to: 59}, tail: null},
  {id: 'amber', color: '#dca251', facing: -1, neck: {from: 28, to: 53}, tail: {from: 23, to: 18}},
  {id: 'coral', color: '#d88479', facing: -1, neck: {from: 34, to: 47}, tail: {from: 29, to: 12}},
  {id: 'sage', color: '#7ba691', facing: 1, neck: {from: 69, to: 92}, tail: {from: 74, to: 46}},
  {id: 'birch', name: 'Kvisti', color: '#c8ae79', facing: 1, neck: {from: 63, to: 98}, tail: {from: 68, to: 52}},
  {id: 'plum', name: 'Lyng', color: '#a491ab', facing: 1, neck: null, tail: {from: 82, to: 41}},
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
// dinosaur route or another event. `to` is where the pawn ends up (a fossil stays where it is). None lies on a route's
// square, and none carries the pawn onto one.
export const SPECIAL_TILES = Object.freeze([
  ...[8, 38, 56, 77, 90].map(from => ({type: 'firefly', from, to: from + 2, label: 'Ljósflugur'})),
  ...[15, 44, 86].map(from => ({type: 'mud', from, to: from - 2, label: 'Mjúk leðja'})),
  ...[5, 26, 50, 75, 95].map(from => ({type: 'fossil', from, to: from, label: 'Steingervingur'})),
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

// The squares where a fossil lies, in board order (5, 26, 50, 75 and 95).
export const FOSSIL_SQUARES = Object.freeze(SPECIAL_TILES.filter(event => event.type === 'fossil').map(event => event.from));
const isFossilSquare = number => eventsByStart.get(number)?.type === 'fossil';

/**
 * Which kind lies on which fossil square in one game: an object like { 5: 'tooth', 26: 'egg', 50: 'leaf', 75: 'ammonite',
 * 95: 'amber' }, a different kind on each fossil square (five of the eight), picked and ordered by `random` (a function
 * giving numbers in [0, 1), such as Math.random or a seeded one from engine/random.js).
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

// Where a square sits in the world: x along the board (0 is the middle), y up the tiers, z toward the camera (the even
// tiers stand BOARD.recess further back). Square 0, the start, waits one step left of the first square.
export function tilePosition(number) {
  integerInRange(number, 0, BOARD.count, 'number');
  if (number === 0) {
    return {x: -(BOARD.columns + 1) / 2 * BOARD.spacing, y: 0, z: -BOARD.recess};
  }
  const row = Math.floor((number - 1) / BOARD.columns);
  const offset = (number - 1) % BOARD.columns;
  const column = row % 2 ? BOARD.columns - 1 - offset : offset;
  return {
    x: (column - (BOARD.columns - 1) / 2) * BOARD.spacing,
    y: row * BOARD.rowHeight,
    z: row % 2 ? 0 : -BOARD.recess,
  };
}

/**
 * One throw from square `from` (0 to 100): { from, roll, steps, landed, bounce, shortcut, event, destination, won }.
 *   steps        the squares the pawn walks over, one hop each, ending on `landed`: up to 100 at most, and down again when
 *                the roll goes past it (98 + 5: 99, 100, 99, 98, 97)
 *   bounce       how many squares it bounced back off 100 (0 when the roll did not go past it)
 *   shortcut     the neck or tail on `landed`, or null
 *   event        the adventure event on `landed` (mode "adventure" only, never together with a shortcut), or null
 *   destination  where the pawn ends the turn: the shortcut's or event's far end, else `landed`
 *   won          the pawn ends on 100
 */
export function resolveTurn(from, roll, {mode = 'classic'} = {}) {
  integerInRange(from, 0, BOARD.count, 'from');
  integerInRange(roll, 1, 6, 'roll');
  validateMode(mode);
  // Past 100 the pawn hops up onto it and back by the rest: the steps run up to 100 and down again to where it lands.
  const target = from + roll;
  const bounce = from < BOARD.count && target > BOARD.count ? target - BOARD.count : 0;
  const landed = from === BOARD.count ? from : bounce ? BOARD.count - bounce : target;
  const steps = [
    ...Array.from({length: Math.min(target, BOARD.count) - from}, (_, index) => from + index + 1),
    ...Array.from({length: bounce}, (_, index) => BOARD.count - 1 - index),
  ];
  // Passing over a neck or tail does nothing. Only the dice landing activates
  // one ride. Its destination never triggers an additional ride this turn.
  const shortcut = shortcutsByStart.get(landed) ?? null;
  const event = mode === 'adventure' && !shortcut ? eventsByStart.get(landed) ?? null : null;
  const destination = shortcut?.to ?? event?.to ?? landed;
  return {from, roll, steps, landed, bounce, shortcut, event, destination, won: destination === BOARD.count};
}

/**
 * A new game, as plain data that can go straight into JSON:
 *   { version, mode, players: [{ id, position, isComputer, fossils }], currentPlayer, winner, turnCount, lastTurn, fossilKinds }
 * `fossils` are the fossil squares that player has found in this game; `fossilKinds` says which kind lies on each
 * fossil square (placeFossils(random)). The last player is the computer when `vsComputer`; or `computers` says it
 * for each player, one boolean per player (the seats of "Fjölspil", spec §7.2), and `vsComputer` is then not read.
 */
export function createGame({playerCount = 2, vsComputer = false, computers = null, mode = 'classic', random = Math.random} = {}) {
  integerInRange(playerCount, 1, 4, 'playerCount');
  validateMode(mode);
  if (computers !== null) {
    if (!Array.isArray(computers) || computers.length !== playerCount || !computers.every(value => typeof value === 'boolean')) {
      throw new RangeError('computers must have one boolean per player');
    }
  } else {
    if (typeof vsComputer !== 'boolean') throw new TypeError('vsComputer must be a boolean.');
    if (vsComputer && playerCount < 2) throw new RangeError('A computer game needs at least two players.');
  }
  return {
    version: GAME_VERSION,
    mode,
    players: Array.from({length: playerCount}, (_, id) => ({
      id,
      position: 0,
      isComputer: computers ? computers[id] : vsComputer && id === playerCount - 1,
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

// The shape of a game kept in a save. Version 2 is the board of 100 squares: a game kept from the board of 80 (version 1,
// or the earlier previews without a version) is refused, so the host offers a new game instead.
export const GAME_VERSION = 2;

// Safe to call on parsed saved games before rendering or resuming them. Throws a RangeError or a TypeError that says
// what is wrong, and gives true otherwise.
export function validateGame(state) {
  if (!state || !Array.isArray(state.players)) throw new TypeError('A game must contain players.');
  if (state.version !== GAME_VERSION) throw new RangeError('Unsupported game version.');
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
