#!/usr/bin/env node
// Plays "Veiddu" games between a model of the child and the two computer players, to find the skill they should start at so the
// child wins about half the games. The child model is a mind of the same kind (engine/veiddu/minds.js) with its skill held at 0.5;
// the computer players play at the skill given, and ease off by inRoundSkill while the child is far behind, as at the real table.
//   node remake/tools/veiddu-sim.mjs --skill 0.2,0.35,0.5,0.7 --games 4000 [--child 0.5] [--no-ease]
// For each skill it prints the child's share of wins (a tie that includes the child counts as a win), the child's mean pairs, the
// mean asks per game and an estimated time for a game (a child's ask 7 s, a computer player's ask 4 s, a give 2 s, a fish 3 s).

import { pathToFileURL } from 'node:url';
import { seededRandom } from '../engine/random.js';
import { newGame, ask, fish, isOver, winners } from '../engine/veiddu/rules.js';
import { createMind, inRoundSkill } from '../engine/veiddu/minds.js';

const SECONDS = { childAsk: 7, mindAsk: 4, give: 2, fish: 3 };

/** One game: the child is seat 0, the computer players seats 1 and 2. Returns { winners, pairs, asks, seconds }. */
export function playGame(seed, { skill, childSkill = 0.5, ease = true }) {
  const random = seededRandom(seed);
  let { game, events } = newGame({ random });
  const minds = [0, 1, 2].map(seat => createMind(seat, { random }));
  const see = list => { for (const event of list) for (const mind of minds) mind.observe(event, game); };
  see(events);
  let asks = 0;
  let seconds = 0;
  while (!isOver(game)) {
    const seat = game.turn;
    let out;
    if (game.phase === 'ask') {
      const counts = game.pairs.map(laid => laid.length);
      const now = seat === 0 ? childSkill : ease ? inRoundSkill(skill, counts[0], Math.max(...counts)) : skill;
      const choice = minds[seat].chooseAsk(game, { skill: now });
      out = ask(game, seat, choice.target, choice.kind);
      asks++;
      seconds += seat === 0 ? SECONDS.childAsk : SECONDS.mindAsk;
    } else {
      out = fish(game, seat);
      seconds += SECONDS.fish;
    }
    seconds += SECONDS.give * out.events.filter(event => event.type === 'give').length;
    game = out.game;
    see(out.events);
  }
  return { winners: winners(game), pairs: game.pairs.map(laid => laid.length), asks, seconds };
}

/** `games` games at one skill: { skill, childWins, share, childPairs, asks, minutes }. */
export function simulate({ skill, games, childSkill, ease }) {
  let childWins = 0;
  let pairs = 0;
  let asks = 0;
  let seconds = 0;
  for (let i = 0; i < games; i++) {
    const result = playGame(`veiddu-sim-${skill}-${i}`, { skill, childSkill, ease });
    if (result.winners.includes(0)) childWins++;
    pairs += result.pairs[0];
    asks += result.asks;
    seconds += result.seconds;
  }
  return { skill, games, childWins, share: childWins / games, childPairs: pairs / games, asks: asks / games, minutes: seconds / games / 60 };
}

function main(argv) {
  const option = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : fallback;
  };
  const skills = option('skill', '0.2,0.35,0.5,0.7').split(',').map(Number);
  const games = Number(option('games', 4000));
  const childSkill = Number(option('child', 0.5));
  const ease = !argv.includes('--no-ease');
  if (skills.some(s => !Number.isFinite(s)) || !Number.isInteger(games) || games < 1 || !Number.isFinite(childSkill)) {
    console.error('usage: node remake/tools/veiddu-sim.mjs --skill 0.2,0.35,0.5,0.7 --games 4000 [--child 0.5] [--no-ease]');
    process.exit(1);
  }
  console.log(`${games} games per skill, child model at skill ${childSkill}, computer players ${ease ? 'ease off when the child is 3 pairs behind' : 'at a steady skill'}`);
  console.log('skill | child wins | child pairs | asks/game | est. minutes');
  console.log('------+------------+-------------+-----------+-------------');
  for (const skill of skills) {
    const r = simulate({ skill, games, childSkill, ease });
    console.log(`${skill.toFixed(2).padStart(5)} | ${(r.share * 100).toFixed(1).padStart(9)}% | ${r.childPairs.toFixed(2).padStart(11)} | ${r.asks.toFixed(1).padStart(9)} | ${r.minutes.toFixed(1).padStart(12)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
