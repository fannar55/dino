// The computer players of "Veiddu" (spec §3): Uggeðla's and Mosi's minds, and the advice Mosi gives the child. A pure module.
//
// A mind plays fair. It knows its own hand and what everyone at the table heard and saw, and it builds its memory from the rules'
// public events (rules.js) alone, never from the other hands, the pond or a card another seat fished:
//   ask   the asker holds the kind                   no    the one asked lacks the kind
//   give  the giver lacks the kind, and the asker has paired it        pair  two copies are out of play
// A fact is dropped once the public events make it untrue (a holder gives the card or lays the pair; all four copies are down).
// Each fact is remembered at the moment of choosing with a chance that depends on the mind's skill and on how many turns ago it
// was learnt. The seats at the table of one device are the child, Uggeðla and Mosi (SEAT).

import { clampSkill } from '../eitt/skill.js';
import { COPIES, KINDS } from './cards.js';
import { isOver, legalTargets } from './rules.js';

export const SEAT = Object.freeze({ child: 0, uggedla: 1, mosi: 2 });

/** The skill the computer players begin with in a new save: the child model wins 50.5% of 4000 simulated games at it (tools/veiddu-sim.mjs). */
export const VEIDDU_SKILL_START = 0.2;

const BEHIND = 3; // the child is this many pairs behind the leader
const EASE = 0.3; // how much milder the minds are then

/** The skill to play with right now: 0.3 milder while the child is 3 or more pairs behind the leader. */
export function inRoundSkill(skill, childPairs, leaderPairs) {
  const base = clampSkill(skill);
  return leaderPairs - childPairs >= BEHIND ? clampSkill(base - EASE) : base;
}

/** The chance of remembering a fact learnt `age` turns ago, for a mind of this skill (0 to 1). */
export const recallChance = (skill, age) => Math.min(1, Math.max(0, 0.3 + 0.6 * clampSkill(skill) - 0.04 * age));

// ---------------------------------------------------------------------------------------------------------------------------
// Memory: { turns, laid, holds, lacks }. `turns` counts the turns seen, `laid` the copies of each kind that are out of play.
// `holds` and `lacks` map a number for the kind and the seat to a fact { kind, seat, turn } learnt on that turn. Nothing is kept about
// the mind's own seat.

const KIND_NUMBER = new Map(KINDS.map((kind, i) => [kind.id, i]));
const factKey = (kind, seat) => KIND_NUMBER.get(kind) * 4 + seat; // a table has 4 seats at most

const newMemory = () => ({ turns: 0, laid: {}, holds: new Map(), lacks: new Map() });

function learn(memory, me, event) {
  const note = (facts, kind, seat) => {
    if (seat !== me) facts.set(factKey(kind, seat), { kind, seat, turn: memory.turns });
  };
  const drop = (facts, kind, seat) => facts.delete(factKey(kind, seat));
  switch (event.type) {
    case 'turn':
      memory.turns++;
      break;
    case 'ask':
      drop(memory.lacks, event.kind, event.seat);
      note(memory.holds, event.kind, event.seat);
      break;
    case 'no':
      drop(memory.holds, event.kind, event.seat);
      note(memory.lacks, event.kind, event.seat);
      break;
    case 'give':
      drop(memory.holds, event.kind, event.from);
      drop(memory.holds, event.kind, event.to);
      note(memory.lacks, event.kind, event.from);
      break;
    case 'pair': {
      drop(memory.holds, event.kind, event.seat);
      memory.laid[event.kind] = (memory.laid[event.kind] ?? 0) + 2;
      if (memory.laid[event.kind] >= COPIES) {
        for (const facts of [memory.holds, memory.lacks]) {
          for (const [key, fact] of facts) if (fact.kind === event.kind) facts.delete(key);
        }
      }
      break;
    }
    default:
      break; // deal, fish, refill, pond-empty, out, over: nothing that everyone saw
  }
}

// The events everyone at the table saw; the card ids of the others (deal, fish, refill) are private to their seat.
const PUBLIC = new Set(['ask', 'no', 'give', 'pair', 'out', 'turn', 'pond-empty']);

const copyFacts = facts => [...facts.values()].map(fact => ({ ...fact }));

// ---------------------------------------------------------------------------------------------------------------------------

const kindsIn = (game, seat) => game.hands[seat].map(card => card.kind);

// Copies of `kind` that may be somewhere else: not laid, and not the one in the mind's own hand.
const unseenCopies = (memory, kind) => COPIES - (memory.laid[kind] ?? 0) - 1;

// The facts that say a seat which can be asked holds a kind that is in `seat`'s hand and that `remembers`, the latest first.
function knownHolders(memory, game, seat, remembers) {
  const kinds = new Set(kindsIn(game, seat));
  const targets = legalTargets(game, seat);
  const found = [...memory.holds.values()].filter(fact => kinds.has(fact.kind) && targets.includes(fact.seat) && remembers(fact));
  return found.sort((a, b) => b.turn - a.turn || a.seat - b.seat);
}

/**
 * The mind of `seat`. Feed it every event of the game, in order, with `observe` (the game is accepted so a table can pass what it
 * has, but a mind learns from the event alone); ask it what to do with `chooseAsk`. `memory()` is a plain copy of what it knows.
 */
export function createMind(seat, { random = Math.random } = {}) {
  const memory = newMemory();

  return {
    observe(event) {
      learn(memory, seat, event);
    },

    /**
     * { target, kind } for the seat's turn in phase 'ask'. A holder it remembers comes first. Otherwise a random kind from its hand,
     * asked of a seat that holds cards and that it does not remember saying no to that kind; with no such seat, anything legal.
     */
    chooseAsk(game, { skill }) {
      const own = kindsIn(game, seat);
      const targets = legalTargets(game, seat);
      if (own.length === 0 || targets.length === 0) throw new Error(`Seat ${seat} has nothing to ask`);
      const remembers = fact => random() < recallChance(skill, memory.turns - fact.turn);

      const [holder] = knownHolders(memory, game, seat, remembers);
      if (holder) return { target: holder.seat, kind: holder.kind };

      const live = own.filter(kind => unseenCopies(memory, kind) > 0);
      const options = [];
      for (const kind of live.length > 0 ? live : own) {
        const open = targets.filter(target => {
          const said = memory.lacks.get(factKey(kind, target));
          return !(said && remembers(said));
        });
        if (open.length > 0) options.push({ kind, open });
      }
      const pool = options.length > 0 ? options : own.map(kind => ({ kind, open: targets }));
      const { kind, open } = pool[Math.floor(random() * pool.length)];
      return { target: open[Math.floor(random() * open.length)], kind };
    },

    memory: () => ({
      turns: memory.turns,
      laid: { ...memory.laid },
      holds: copyFacts(memory.holds),
      lacks: copyFacts(memory.lacks),
    }),
  };
}

/**
 * The best ask for `seat` (the child), from everything that was said so far (the game's log) and with no forgetting: Mosi's
 * advice and the idle hint. It reads only the public events of the log, never the card ids another seat fished, drew or was dealt.
 * { kind, target, reason }, with reason
 *   'they-asked'  a seat other than Mosi asked for a kind in the hand: ask that seat (the latest ask comes first)
 *   'mosi-asked'  Mosi (seat 2) asked for it
 *   'guess'       nobody has: a kind with the most copies unseen, from a seat that has not said no to it and has the most cards
 *   'fish'        there is nobody to ask or the pond is calling: kind and target are null
 * It is null once the game is over.
 */
export function bestAsk(game, seat) {
  if (isOver(game)) return null;
  const own = kindsIn(game, seat);
  const targets = legalTargets(game, seat);
  if ((game.phase === 'fish' && game.turn === seat) || own.length === 0 || targets.length === 0) {
    return { kind: null, target: null, reason: 'fish' };
  }
  const memory = newMemory();
  for (const event of game.log) if (PUBLIC.has(event.type)) learn(memory, seat, event);

  const [holder] = knownHolders(memory, game, seat, () => true);
  if (holder) return { kind: holder.kind, target: holder.seat, reason: holder.seat === SEAT.mosi ? 'mosi-asked' : 'they-asked' };

  const fullest = open => open.reduce((best, target) => (game.hands[target].length > game.hands[best].length ? target : best));
  const options = own
    .map(kind => ({ kind, open: targets.filter(target => !memory.lacks.has(factKey(kind, target))), unseen: unseenCopies(memory, kind) }))
    .filter(option => option.open.length > 0 && option.unseen > 0);
  if (options.length === 0) return { kind: own[0], target: fullest(targets), reason: 'guess' };
  const best = options.reduce((top, option) => (option.unseen > top.unseen ? option : top));
  return { kind: best.kind, target: fullest(best.open), reason: 'guess' };
}
