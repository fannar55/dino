// Söngur Slóeðlu in fjölspil: who plays which dinosaur, pure (no page, no net). Fjölspil's seats (fjolspil/seats.js) become the
// band: a guest who picked Kambeðla, Slóeðla or Þórseðla plays that dinosaur's lane at her own level ("Krakki" or "Fullorðinn");
// Egill, at the big screen, picks his dinosaur first and plays every lane nobody else holds (spec §4). A lane's `judged` says
// where its taps are judged: 'here' (on this screen, at once), 'grace' (a guest's, judged on the big screen a trip late, so its
// notes wait REMOTE_GRACE more) or 'outside' (on a guest's tablet: another player's lane, judged on the big screen only).

import { AVATARS } from '../fjolspil/seats.js';
import { LEVELS, REMOTE_GRACE } from './chart.js';

/** The dinosaur (Fjölspil avatar) of each role: Kambeðla b, Slóeðla a, Þórseðla c. */
export const SONG_AVATARS = Object.freeze({ b: 'kambedla', a: 'sloedla', c: 'thorsedla' });

/** The role an avatar plays, or null (Grameðla, Flugeðla and Uggeðla are not in the band). */
export const roleOf = avatarId => Object.keys(SONG_AVATARS).find(role => SONG_AVATARS[role] === avatarId) ?? null;

/** The roles with a lane, left to right: b a c with three, a c with two (Slóeðla and Þórseðla). */
export const rolesOf = lanes => (lanes === 2 ? ['a', 'c'] : ['b', 'a', 'c']);

const guests = seats => seats.filter(seat => seat.kind === 'remote');

/**
 * The lobby a guest sees: `offer` the dinosaurs with a lane but Egill's, `reserved` every other avatar (never a guest's), and
 * `max` seats, Egill's among them (three with three dinosaurs, two with two).
 */
export function lobbyOf({ lanes, mine }) {
  const offer = rolesOf(lanes).filter(role => role !== mine).map(role => SONG_AVATARS[role]);
  return { offer, reserved: AVATARS.map(a => a.id).filter(id => !offer.includes(id)), max: lanes === 2 ? 2 : 3 };
}

/**
 * The band's lanes, left to right: [{ role, player, name, level, judged }]. A present guest holding a lane's dinosaur plays it at
 * her level (a child's when she has none); Egill plays every other lane at `level`.
 */
export function lineupOf({ lanes, mine, level, seats }) {
  const playing = guests(seats).filter(seat => seat.present);
  return rolesOf(lanes).map(role => {
    const seat = playing.find(s => s.avatar === SONG_AVATARS[role]);
    if (!seat) return { role, player: 0, name: 'Egill', level, judged: 'here' };
    return { role, player: seat.seat, name: seat.name, level: seat.level ?? 'barn', judged: 'grace' };
  });
}

/** The players of a lineup, each with her roles and level, in the order of their first lane: the player's `groups`. */
export function groupsOf(lineup) {
  const groups = [];
  for (const lane of lineup) {
    const group = groups.find(g => g.player === lane.player);
    if (group) group.roles.push(lane.role);
    else groups.push({ player: lane.player, roles: [lane.role], level: lane.level });
  }
  return groups;
}

/** The lineup with `role`'s lane Egill's at `level` (its guest dropped out). */
export function takeOver(lineup, role, level) {
  return lineup.map(lane => (lane.role === role ? { role, player: 0, name: 'Egill', level, judged: 'here' } : lane));
}

/** How a lane is judged: its level's windows and fall, and the grace its notes wait (Infinity: judged elsewhere). */
export function laneRules(lane) {
  const windows = LEVELS[lane.level] ?? LEVELS.barn;
  const grace = lane.judged === 'grace' ? REMOTE_GRACE : lane.judged === 'outside' ? Infinity : 0;
  return { windows, fall: windows.fall, grace };
}

/** "2 eðlur" leaves Kambeðla out and has two seats: not while a guest holds Kambeðla, nor with two guests. */
export function canTwoLanes(seats) {
  const list = guests(seats);
  return list.length < 2 && !list.some(seat => seat.avatar === SONG_AVATARS.b);
}

/**
 * Egill's dinosaur after a change of lanes or seats: his own while it has a lane and no guest holds it, else the first one free,
 * else null. Null while he has not picked.
 */
export function mineFor({ lanes, mine, seats }) {
  if (!mine) return null;
  const held = new Set(guests(seats).map(seat => roleOf(seat.avatar)).filter(Boolean));
  const roles = rolesOf(lanes);
  if (roles.includes(mine) && !held.has(mine)) return mine;
  return roles.find(role => !held.has(role)) ?? null;
}

/** The end's lines: one a player, Egill first and then by seat, with her roles, points and „Frábært!“ count summed per lane. */
export function linesOf(lineup, laneScores) {
  const lines = [];
  lineup.forEach((lane, i) => {
    const score = laneScores[i] ?? { points: 0, great: 0 };
    let line = lines.find(l => l.player === lane.player);
    if (!line) lines.push(line = { player: lane.player, name: lane.name, roles: [], points: 0, great: 0 });
    line.roles.push(lane.role);
    line.points += score.points;
    line.great += score.great;
  });
  return lines.sort((x, y) => x.player - y.player);
}
