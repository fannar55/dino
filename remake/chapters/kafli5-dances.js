// The animals' dances in the music video (chapter 5, scene 6): what each group of the choir, the beetles and the dragonflies do in
// each part of the set (the storyboard: qa/remake/kafli5/myndband/index.html). kafli5.js makes one of these as the set starts and
// gives it every frame of the set.
//
// Everything here is a pure function of the dance beat (kafli5-video.js): `danceOf(member, beat)` is a pose, with no timer and no
// state, so the rewind spools the dances back and Stoppdans freezes them without a line here knowing. The one thing that reads the
// set's own beat is the turtle that moves while everything is frozen (`slip`).
//
//   PARTS                 the set's parts on the dance beat: [{ id, feature, from, to }] (the drop and its replay are one part)
//   danceOf(m, beat, x)   the pose of member `m` at dance beat `beat`: offsets from where it stands (metres, degrees, radians),
//                         its squash and what its model plays; x: { reduced, ground(x, z), her: [x, y, z], setBeat }
//   memberOf(group, k, seats)  a member for danceOf: seat `k` of `seats` ([{ x, y, z, heading }])
//   stageMembers()        every dancer on the pool's own seats, flat ground: for tests and tools
//   audienceOf(group, k, seats)  one of those that came and stand on the far bank (not in the choir): it dances where it stands
//   createDances(c)       the scene's: { update(video), cue(event), dispose() }
//
// A dance is built of a few moves a group has (its bob, its jump, its own number: the stomp, the spin on the shell, the leaps
// between the pads, the line, the eight), each sized by the part: small while another group has the floor, the wildest in the drop.
// A part's move blends into the next over a beat or less, also by the beat.
import { SONG } from './kafli5-set.js';
import { danceBeatAt } from './kafli5-video.js';
import { CHOIR, GROUPS, WADE, SPOTS, seatsOf } from './kafli5-pool.js';
import { FAR_POOL } from './kafli4-route.js';
import { RUN, runPoint, PARADE, paradePoint, eightPoint, stageLife } from './kafli5-stage.js';

const SET = SONG.set;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const LEVEL = FAR_POOL.level;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = v => clamp(v, 0, 1);
const smooth = k => { const x = clamp01(k); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const frac = v => v - Math.floor(v);
/** 0 before `a`, 1 after `b`, eased between. */
const win = (u, a, b) => smooth((u - a) / (b - a));
/** A hop's arc over x = 0 to 1 (0 outside it). */
const hop = x => (x <= 0 || x >= 1 ? 0 : 4 * x * (1 - x));
/** 1 on each whole beat, 0 between. */
const dip = u => (0.5 + 0.5 * Math.cos(TAU * u)) ** 2;
/** The short way from heading `a` to `b`, degrees (-180 to 180). */
const short = (a, b) => ((b - a + 540) % 360 + 360) % 360 - 180;
const headingOf = (dx, dz) => Math.atan2(dz, dx) / DEG;

// --- the set on the dance beat -----------------------------------------------------------------

/** The dance beat a cue of the set is heard at, or null if it comes while the picture is spooled back or frozen. */
const heardAt = setBeat => { const d = danceBeatAt(setBeat); return d.frozen || d.rewinding ? null : d.beat; };
/** The set's parts on the dance beat. The drop's replay is the drop (the same beats again); after the last hit rings, `after`. */
export const PARTS = (() => {
  const parts = SET.sections.filter(s => s.id !== 'rewind' && s.id !== 'redrop').map(s => ({ id: s.id, feature: s.feature, from: danceBeatAt(s.startBeat).beat }));
  parts.push({ id: 'after', feature: null, from: SET.endBeat + 4 });
  parts.forEach((part, i) => { part.to = parts[i + 1]?.from ?? Infinity; part.before = parts[i - 1] ?? null; });
  return parts;
})();
export const partAt = beat => PARTS.findLast(part => part.from <= beat) ?? PARTS[0];
const partOf = id => PARTS.find(part => part.id === id);
const sorted = list => [...new Set(list.filter(b => b !== null))].sort((a, b) => a - b);
/** Each group's calls (the moments it sings in the set), on the dance beat. */
export const CALLS = Object.fromEntries([...GROUPS, 'beetles', 'dragonflies'].map(group => [group,
  sorted(SET.cues.filter(cue => cue.kind === 'call' && cue.group === group).map(cue => heardAt(cue.beat)))]));
/** Her tune's notes in the set (a group and a dance beat each). */
export const TUNE = SET.tune.map(({ group, beat }) => ({ group, beat: heardAt(beat) })).filter(note => note.beat !== null);
const ROARS = sorted(SET.cues.filter(cue => cue.kind === 'roar').map(cue => heardAt(cue.beat)));
const HOPPS = sorted(SET.lines.filter(line => line.id.startsWith('hopp')).map(line => heardAt(line.beat)));
/** The turtle that moves in Stoppdans, and the set's beat it does (the picture is frozen: this one runs on the set's own beat). */
export const SLIP = { turtle: 1, at: SET.cues.find(cue => cue.kind === 'moved').beat, until: SET.cues.find(cue => cue.kind === 'unfreeze').beat };

// --- who dances --------------------------------------------------------------------------------

/** How high each can jump, metres (the big jumps: the drop, the roars, the last hit). */
export const JUMP = { grazers: 1.2, turtles: 0.8, frogs: 2.1, lizards: 1.5, flyers: 2.6, beetles: 0.6, dragonflies: 0 };
// The line's order: the lizards' seats by how far toward the log (their right) each sits, the leader first.
const LINE = [5, 1, 3, 0, 4, 2];
// The frogs' pads along the bow, toward the reed (seat numbers).
const BOW = [3, 1, 0, 2, 4];
// The parade's order (toward the reed): the grazers by seat, the leader first, and how far each goes compared to the middle one (m).
// Two lanes: the one that sits nearest the water goes on the inner lane, between the two on the outer one.
const FILE = { order: [2, 0, 1], more: [5.2, 0, -5.2], lane: [33.4, 36, 36] };

/** A member for danceOf: seat `k` of its group's `seats` ([{ x, y, z, heading }]: where each stands as the set starts). */
export function memberOf(group, k, seats) {
  const seat = seats[k];
  return { group, k, n: seats.length, x: seat.x, y: seat.y, z: seat.z, heading: seat.heading, seats, late: 0.05 * Math.sin(k * 2.7 + 1), size: 1 + 0.08 * Math.sin(k * 1.9 + 0.4) };
}
/**
 * One of the rest of those that came (the lizards, grazers and flyers on the bank beyond Egill and Mosi, not in the choir): it
 * dances as its kind does, where it stands (no line, no flight, no parade).
 */
export function audienceOf(group, k, seats) {
  return { ...memberOf(group, k, seats), audience: true };
}
/** Every dancer on the pool's own seats (kafli5-pool.js, kafli5-stage.js) over flat ground at `level`: for tests and tools. */
export function stageMembers(level = LEVEL) {
  const stage = stageLife();
  const groups = Object.fromEntries(GROUPS.map(group => [group, seatsOf(group).map(({ at, heading }) => ({ x: at[0], y: level, z: at[1], heading }))]));
  groups.beetles = stage.beetles.map(({ at, heading }) => ({ x: at[0], y: level + 0.8, z: at[1], heading }));
  groups.dragonflies = stage.dragonflies.map(({ at, up, heading }) => ({ x: at[0], y: LEVEL + up, z: at[1], heading }));
  return Object.entries(groups).flatMap(([group, seats]) => seats.map((_, k) => memberOf(group, k, seats)));
}

// --- a pose ------------------------------------------------------------------------------------

// A pose while it is built: offsets, and how much of each thing its model can play (`walk`, `run`, `flap`, ... 0 to 1, with where
// in the clip: `walkAt`, ... in rounds of it). finish() makes of it what life.js takes.
const blank = () => ({
  dx: 0, dy: 0, dz: 0, turn: 0, pitch: 0, roll: 0, sx: 1, sy: 1, sz: 1, mix: 1,
  walk: 0, walkAt: 0, trot: 0, trotAt: 0, graze: 0, standAt: 0.3, run: 0, runAt: 0, peer: 0, flap: 0, flapAt: 0, glide: 0,
  look: 0, hide: 0, leap: 0, kickA: 0, kickB: 0, wing: 0,
});
const PICKED = new Set(['walkAt', 'trotAt', 'standAt', 'runAt', 'flapAt', 'wing']);
/** Pose `a` blended toward `b` by `w` (the clips' places are taken from the heavier). */
function blend(a, b, w) {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const out = {};
  for (const key in a) out[key] = PICKED.has(key) ? (w < 0.5 ? a[key] : b[key]) : lerp(a[key], b[key], w);
  out.turn = a.turn + short(a.turn, b.turn) * w;
  return out;
}
/** `side` metres to the member's right and `fwd` metres the way it faces (toward the pool). */
function shift(P, m, side, fwd = 0) {
  const h = m.heading * DEG;
  P.dx += Math.cos(h) * fwd - Math.sin(h) * side;
  P.dz += Math.sin(h) * fwd + Math.cos(h) * side;
}
/** Turned `share` of the way toward [x, z] (never more than 75 degrees). */
function face(P, m, at, share) {
  P.turn += clamp(short(m.heading, headingOf(at[0] - m.x, at[1] - m.z)), -75, 75) * share;
}
/** Squashed down by `by` (0.2: a fifth lower, a little wider). */
function squat(P, by) {
  P.sy *= 1 - by;
  P.sx *= 1 + by * 0.4;
  P.sz *= 1 + by * 0.4;
}
/** At the world's [x, y, z], `w` of the way from where it stands. */
function goTo(P, m, at, w) {
  P.dx += (at[0] - m.x) * w;
  P.dy += (at[1] - m.y) * w;
  P.dz += (at[2] - m.z) * w;
}

/**
 * A turn (degrees from its own heading) that follows the way `wayAt(v)` (a heading, any round of it) `share` of the way. While
 * all of it (from `full[0]` to `full[1]`) it is the short way there; as it comes in before that and goes out after, it runs on from
 * what it was then, so a way that goes right round never makes it flip.
 */
function follow(m, wayAt, u, share, full) {
  const anchor = clamp(u, full[0], full[1]);
  const mid = (anchor + u) / 2;
  return (short(m.heading, wayAt(anchor)) + short(wayAt(anchor), wayAt(mid)) + short(wayAt(mid), wayAt(u))) * share;
}

// --- the moves every group has -----------------------------------------------------------------

/** A group's own bob to the beat, `a` big (1: its full dance floor size). */
function bob(P, m, u, a) {
  if (a <= 0) return;
  const v = u + m.late;
  switch (m.group) {
    case 'grazers': { // a heavy sway from foot to foot, marching on the spot
      const s = Math.sin(Math.PI * u);
      shift(P, m, 0.5 * a * s);
      P.roll += 0.075 * a * s;
      P.dy += 0.16 * a * Math.sin(Math.PI * u) ** 2;
      squat(P, 0.05 * a * dip(u));
      P.walk = Math.max(P.walk, Math.min(0.6, 0.6 * a));
      P.walkAt = u / 2;
      break;
    }
    case 'turtles': { // rocking on the shell's rim, the head out and in
      const s = Math.sin(Math.PI * v);
      P.roll += 0.2 * a * s;
      shift(P, m, 0.12 * a * s);
      P.dy += 0.08 * a * Math.sin(Math.PI * v) ** 2;
      P.look = Math.max(P.look, a * (0.5 + 0.5 * Math.sin(Math.PI * v - 1)));
      break;
    }
    case 'frogs': { // a hop a beat, one after another along the pads
      const x = frac(u - 0.17 * BOW.indexOf(m.k));
      const e = hop(x / 0.55);
      P.dy += 0.5 * a * e;
      P.leap = Math.max(P.leap, a * e);
      P.turn += 20 * a * Math.sin((Math.PI * u) / 2);
      if (x > 0.55) squat(P, 0.16 * a * Math.exp(-(x - 0.55) * 9));
      break;
    }
    case 'lizards': { // jogging on the spot, every other one up as its neighbour comes down, the tail swinging
      const x = frac(v + (m.k % 2) * 0.5);
      P.dy += 0.32 * a * hop(x / 0.5);
      P.turn += 15 * a * Math.sin(TAU * v);
      P.run = Math.max(P.run, Math.min(0.75, 0.6 * a));
      P.runAt = v;
      break;
    }
    case 'flyers': { // hopping with the wings half out
      const x = frac(v);
      const e = hop(x / 0.5);
      P.dy += 0.3 * a * e;
      P.roll += 0.12 * a * Math.sin(Math.PI * v);
      P.flap = Math.max(P.flap, Math.min(0.85, a * (0.25 + 0.5 * e)));
      P.flapAt = v;
      break;
    }
    case 'beetles':
      squat(P, 0.05 * a * dip(u));
      break;
    default: break;
  }
}

/** A little hop on each of the group's own calls round `beat` (it sings: kafli5.js flashes its ring), `size` of its jump. */
function pop(P, m, beat, size, calls = CALLS[m.group]) {
  if (size <= 0 || !calls?.length) return;
  let lo = 0, hi = calls.length; // the first call after `beat`
  while (lo < hi) { const mid = (lo + hi) >> 1; if (calls[mid] <= beat) lo = mid + 1; else hi = mid; }
  let e = 0;
  for (let i = lo - 1; i >= 0 && i >= lo - 4; i--) e = Math.max(e, hop((beat - calls[i]) / 0.6));
  if (!e) return;
  P.dy += size * JUMP[m.group] * e;
  P.sy *= 1 + 0.08 * e;
  if (m.group === 'frogs') P.leap = Math.max(P.leap, e);
  if (m.group === 'flyers') P.flap = Math.max(P.flap, 0.8 * e);
  if (m.group === 'turtles') P.look = Math.max(P.look, e);
}

/** A jump at part beat `at`: down first, up `height` m over `beats`, and a squash as it lands. */
function jump(P, m, u, at, height, beats = 1.5) {
  const x = (u - at) / beats;
  const down = win(u, at - 0.6, at - 0.1) * (1 - win(u, at - 0.05, at + 0.12));
  const e = hop(x);
  const landed = u > at + beats ? Math.exp(-(u - at - beats) * 6) : 0;
  P.dy += height * e;
  squat(P, 0.14 * down + 0.16 * landed);
  P.sy *= 1 + 0.1 * e;
  switch (m.group) {
    case 'grazers': P.pitch += 0.09 * e; break; // the front end up
    case 'turtles': P.look = Math.max(P.look, e); P.roll += 0.5 * e * Math.min(1, height / JUMP.turtles) * (m.k % 2 ? 1 : -1); break;
    case 'frogs': P.leap = Math.max(P.leap, Math.sin(Math.PI * clamp01(x))); P.pitch += 0.3 * e; break;
    case 'lizards': P.pitch += 0.25 * e; P.run = Math.max(P.run, e); P.runAt = u * 2; break;
    case 'flyers': P.flap = Math.max(P.flap, clamp01(1.4 * e + down)); P.flapAt = u * 2; break;
    case 'beetles': P.kickA = Math.max(P.kickA, e); P.kickB = Math.max(P.kickB, e); break;
    default: break;
  }
}

/** A group's last pose (the ending that is not one, and the real one), `w` of it. */
function strike(P, m, w, size = 1) {
  const side = m.k % 2 ? 1 : -1;
  switch (m.group) {
    case 'grazers': P.pitch += 0.15 * w; P.dy += 0.42 * w; P.roll += 0.06 * side * w; P.turn += 14 * (1 - m.k) * w * size; break;
    case 'turtles': P.look = lerp(P.look, 1, w); P.pitch += 0.32 * w; P.roll += 0.28 * side * w; P.dy += 0.14 * w; break;
    case 'frogs': P.leap = lerp(P.leap, 1, w); P.pitch += 0.5 * w; P.dy += 0.3 * w; P.turn += 16 * (BOW.indexOf(m.k) - 2) * w * size; break;
    case 'lizards': P.pitch += 0.42 * w; P.dy += 0.3 * w; P.turn += 12 * (LINE.indexOf(m.k % 6) - 2.5) * w * size; P.peer = lerp(P.peer, 1, w); break;
    case 'flyers': P.glide = lerp(P.glide, 1, w); P.flap *= 1 - w; P.pitch += 0.38 * w; P.dy += 0.5 * w; P.roll += 0.14 * side * w; break;
    case 'beetles': P.kickA = lerp(P.kickA, 1, w); P.pitch += 0.5 * w; P.dy += 0.12 * w; break;
    default: break;
  }
}
/** It hops into its last pose at part beat `at` and holds it. */
function strikeAt(P, m, u, at, size = 1) {
  strike(P, m, win(u, at - 0.1, at + 0.22), size);
  P.dy += 0.25 * JUMP[m.group] * hop((u - at + 0.12) / 0.7);
}

// --- each group's own number -------------------------------------------------------------------

/**
 * The grazers' stomp: up and over to one side, and down ON the beat, left, right, heavy, all three together. `a` 1 in their own
 * part, more in the drop.
 */
function stomp(P, m, u, a) {
  const n = Math.floor(u);
  const x = u - n;
  const sideOf = k => (((k % 2) + 2) % 2 ? 1 : -1); // which foot comes down on beat k
  const over = lerp(sideOf(n), sideOf(n + 1), win(x, 0.22, 0.8)); // where the weight is: on the foot that stomped, then over
  const q = clamp01((x - 0.22) / 0.78);
  const lift = Math.sin(Math.PI * q ** 1.7); // up slowly, down fast
  const hit = Math.exp(-x * 7); // just after it lands
  shift(P, m, 0.55 * Math.min(a, 1.15) * over);
  P.roll += 0.13 * a * over;
  P.dy += 0.42 * a * lift;
  P.pitch += 0.05 * a * lift - 0.05 * a * hit;
  squat(P, 0.1 * Math.min(1.4, a) * hit);
  P.walk = Math.max(P.walk, 0.7);
  P.walkAt = u / 2 + 0.25;
}

/**
 * The turtles' number over `beats`: until `fast` a very slow sway, the head stretching far out and in; then over onto the shell
 * and spinning on it, a turn a beat, the legs and head waving; back onto the feet at the end. `slow`: no spin (less motion).
 */
function shell(P, m, u, { beats = 16, fast = 8, a = 1, still = false } = {}) {
  const h = 0.62 * m.size; // how tall it is: on its back the shell's top is on the stone
  if (still) { // less motion: a slow sway, then a quicker one
    const rate = u < fast ? 4 : 2;
    P.roll += 0.14 * Math.sin((TAU * u) / rate);
    P.look = Math.max(P.look, 0.5 - 0.5 * Math.cos((TAU * u) / rate));
    return;
  }
  const over = win(u, fast - 0.35 + 0.12 * m.k, fast + 0.45 + 0.12 * m.k) * (1 - win(u, beats - 1.2 + 0.1 * m.k, beats - 0.3 + 0.1 * m.k));
  const sway = (1 - over) * (u < fast + 1 ? 1 : 0.4);
  // slow: one sway every four beats, the head out as it leans
  P.roll += 0.24 * a * sway * Math.sin((TAU * u) / 4);
  shift(P, m, 0.28 * a * sway * Math.sin((TAU * u) / 4));
  P.look = Math.max(P.look, sway * (0.5 - 0.5 * Math.cos((TAU * u) / 4 + 0.6 * m.k)));
  P.pitch += 0.12 * sway * Math.sin((TAU * u) / 8);
  if (over <= 0) return;
  // on its shell: rolled right over, lifted so the shell's top is what touches, a little toss as it goes over
  const way = m.k % 2 ? -1 : 1;
  P.roll += Math.PI * over * way;
  P.dy += h * Math.sin((Math.PI * over) / 2) ** 2 + 0.3 * hop(over);
  shift(P, m, [0, -0.6, 0.6][m.k % 3] * over, [0.35, -0.1, -0.1][m.k % 3] * over); // apart a little: room to spin
  const from = fast + 0.3 + 0.12 * m.k, to = beats - 1.1 + 0.1 * m.k;
  const turns = Math.max(1, Math.round((to - from) * 0.9));
  const t = clamp01((u - from) / (to - from));
  const eased = t < 0.12 ? (t * t) / 0.24 : t > 0.88 ? 0.88 - ((1 - t) * (1 - t)) / 0.24 : t - 0.06; // up to speed, a steady spin, and down
  P.turn += u >= to ? 0 : 360 * turns * way * (eased / 0.88);
  const wave = 0.5 + 0.5 * Math.sin(TAU * 2 * u + m.k); // the head and legs out and in, twice a beat
  P.look = Math.max(P.look, over * wave);
  P.hide = Math.max(P.hide, over * 0.5 * (1 - wave));
  P.pitch += 0.12 * over * Math.sin(TAU * u + m.k); // wobbling like a coin
}

// The frogs' leaps between their pads: a plan is, for each frog, its leaps in order ({ at, beats, from, to, high, bulge }: pads by
// seat number). On a croak two neighbours change pads, crossing in the air, the one high and the other low; before the part ends
// everyone leaps home.
function leapPlan({ calls, from, to, high = 1.0, beats = 0.6, pattern = [0, 3, 1, 2] }) {
  const on = [...BOW]; // the frog on each pad of the bow
  const busy = new Array(BOW.length).fill(-Infinity);
  const plan = BOW.map(() => []);
  const home = to - 2.3;
  let turn = 0;
  for (const at of calls) {
    if (at < from || at > home - beats - 0.1) continue;
    for (let tries = 0; tries < pattern.length; tries++) {
      const p = pattern[(turn + tries) % pattern.length];
      const [a, b] = [on[p], on[p + 1]];
      if (busy[a] > at + 1e-6 || busy[b] > at + 1e-6) continue;
      plan[a].push({ at, beats, from: BOW[p], to: BOW[p + 1], high, bulge: 0.35 });
      plan[b].push({ at, beats, from: BOW[p + 1], to: BOW[p], high: high * 0.45, bulge: -0.35 });
      on[p] = b;
      on[p + 1] = a;
      busy[a] = busy[b] = at + beats;
      turn += tries + 1;
      break;
    }
  }
  on.forEach((frog, p) => {
    if (BOW[p] === frog) return;
    const far = Math.abs(BOW.indexOf(frog) - p);
    plan[frog].push({ at: home, beats: 0.6 + 0.3 * far, from: BOW[p], to: frog, high: high * (0.6 + 0.15 * far), bulge: p % 2 ? 0.3 : -0.3 });
  });
  return plan;
}
/** The parade's round of the pads: at each of `times` every frog leaps one pad on along the bow (`way` 1 toward the reed), the last one right over the others to the first. */
function roundPlan(times, way, start = [...BOW]) {
  const on = [...start];
  const plan = BOW.map(() => []);
  for (const at of times) {
    const next = on.map((_, p) => on[(p - way + on.length) % on.length]);
    next.forEach((frog, p) => {
      const was = on.indexOf(frog);
      const over = Math.abs(p - was) > 1;
      plan[frog].push({ at, beats: over ? 1.6 : 0.7, from: BOW[was], to: BOW[p], high: over ? 2.2 : 0.8, bulge: over ? -0.9 : 0 });
    });
    next.forEach((frog, p) => { on[p] = frog; });
  }
  return plan;
}
const joinPlans = (...plans) => BOW.map((_, frog) => plans.flatMap(plan => plan[frog]).sort((a, b) => a.at - b.at));
const callsIn = (group, from, to) => CALLS[group].filter(beat => beat >= from && beat < to);
const FROG = (() => {
  const frogs = partOf('frogs'), drop = partOf('drop'), freeze = partOf('freeze'), carnival = partOf('carnival'), last = partOf('lastchorus');
  return {
    frogs: leapPlan({ calls: callsIn('frogs', frogs.from, frogs.to), from: frogs.from, to: frogs.to }),
    // the drop: from the jump's landing on, higher
    drop: leapPlan({ calls: callsIn('frogs', drop.from + 2, drop.to), from: drop.from + 2, to: drop.to, high: 1.4 }),
    // Stoppdans: two are in the air, at the top of their leaps, on each second beat: the freeze (six beats in) catches them there
    freeze: leapPlan({ calls: [1.7, 3.7, 5.7].map(b => freeze.from + b), from: freeze.from, to: freeze.from + 16, pattern: [1, 2, 0, 3] }),
    // the parade: round the pads toward the reed on the way out, and back round on the way home
    carnival: joinPlans(roundPlan([3, 5, 7, 9, 11].map(b => carnival.from + b), 1), roundPlan([19, 21, 23, 25, 27].map(b => carnival.from + b), -1)),
    last: leapPlan({ calls: callsIn('frogs', last.from, last.to), from: last.from, to: last.to, high: 1.3 }),
  };
})();
/** A frog by its plan at `beat`: on a pad (a little bounce to the beat), or in the air between two. */
function leaps(P, m, beat, plan, a = 1) {
  const list = plan[m.k];
  let e = null;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].at <= beat) { e = list[i]; break; }
  const pad = k => m.seats[k];
  if (!e) { P.dy += 0.12 * a * hop(frac(beat) / 0.4); return; }
  const x = (beat - e.at) / e.beats;
  const to = pad(e.to);
  if (x >= 1) {
    P.dx += to.x - m.x;
    P.dz += to.z - m.z;
    squat(P, 0.22 * Math.exp(-(x - 1) * e.beats * 7));
    P.dy += 0.12 * a * hop(frac(beat) / 0.4) * win(x, 1.5, 2.5);
    return;
  }
  const from = pad(e.from);
  const dx = to.x - from.x, dz = to.z - from.z;
  const far = Math.hypot(dx, dz) || 1;
  const s = lerp(x, smooth(x), 0.35);
  const out = e.bulge * Math.sin(Math.PI * x);
  P.dx += from.x + dx * s - (dz / far) * out - m.x;
  P.dz += from.z + dz * s + (dx / far) * out - m.z;
  P.dy += e.high * hop(x);
  P.leap = Math.max(P.leap, Math.sin(Math.PI * x) ** 0.6);
  P.turn += 0.6 * short(m.heading, headingOf(dx, dz)) * win(x, 0, 0.35) * (1 - win(x, 0.65, 1)); // half turned the way it leaps
  P.pitch += 0.5 * Math.cos(Math.PI * x) * Math.sin(Math.PI * x) ** 0.5;
}

/**
 * The lizards' line over 16 beats: they fall into a line along the water's edge, dart along it toward the log in three quick runs,
 * stopping between to shake their tails where the snare is (the lizards' calls: three shakes round each second beat), turn about,
 * dart back in two longer runs and sit down where they sat, home by the twelfth beat and a half (the camera is on their place
 * from the twelfth: kafli5-video.js CAMERA), with the last shakes there. `still`: the shakes only (less motion).
 */
const DARTS = { out: [1.05, 3.05, 5.05], back: [9.05, 11.05], beats: 1.4, far: 7.5, about: [7.05, 8.45] };
const SHAKES = [0.5, 0.75, 1, 1.75]; // in each two beats
function line(P, m, u, x, { a = 1, still = false } = {}) {
  // the tail: a quick wag on each shake
  let wag = 0;
  const cell = Math.floor(u / 2) * 2;
  for (const base of [cell - 2, cell]) for (const s of SHAKES) {
    const t = u - (base + s);
    if (t >= 0 && t < 0.7) wag += Math.sin(TAU * 2.2 * t) * Math.exp(-t * 4.5);
  }
  if (still) {
    P.turn += 16 * wag;
    P.dy += 0.08 * Math.abs(wag);
    return;
  }
  const j = LINE.indexOf(m.k);
  const out = DARTS.out.reduce((sum, at) => sum + win(u, at, at + DARTS.beats), 0) / DARTS.out.length; // 0 to 1: how far out
  const back = DARTS.back.reduce((sum, at) => sum + win(u, at, at + DARTS.beats), 0) / DARTS.back.length;
  const speed = [...DARTS.out, ...DARTS.back].reduce((sum, at) => sum + hop((u - at) / DARTS.beats), 0); // 1 in the middle of a dart
  const seat = [0, 1.6, -1.6, 0.8, -0.8, 2.4][m.k]; // where it sits along the bank (toward the log)
  const strung = win(u, 0.3, 4.6) * (1 - win(u, 9.4, 12.4)); // the leader darts first and the line strings out behind it
  const s = lerp(seat, 3.5 - 1.9 * j, strung) + DARTS.far * (out - back);
  const inLine = win(u, 0, 2.2) * (1 - win(u, 10.9, 12.9));
  const [px, pz] = runPoint(s);
  const [qx, qz] = runPoint(s + 0.3);
  goTo(P, m, [px, x.ground(px, pz), pz], inLine);
  const about = win(u, DARTS.about[0], DARTS.about[1]);
  const along = headingOf(qx - px, qz - pz) + 180 * about * (j % 2 ? 1 : -1);
  P.turn += short(m.heading, along) * inLine + 16 * a * wag * (1 - 0.6 * speed);
  P.run = Math.max(P.run, clamp01(speed * 1.3 + 0.7 * hop(about)));
  P.runAt = (DARTS.far * (out + back)) / 0.83 + about * 2;
  P.run = Math.max(P.run, 0.8 * hop((u - 11.6) / 1.6)); // the last steps to where it sat
  P.dy += 0.1 * a * Math.abs(wag) + 0.25 * hop(about);
  P.pitch += 0.1 * speed;
}
/** The lizards in the drop: round and round in a ring where they sit, chasing each other's tails. */
function ring(P, m, u, x, { from = 2, to = 15, a = 1 } = {}) {
  const on = win(u, from, from + 2) * (1 - win(u, to - 2, to));
  if (on <= 0) return;
  const spot = CHOIR.lizards.at;
  const round = TAU * (m.k / m.n) + (TAU * (u - from)) / 8; // a round in eight beats
  const r = 2.3;
  const px = spot[0] + r * Math.cos(round) - 0.9 * Math.cos(CHOIR.lizards.heading * DEG), pz = spot[1] + r * Math.sin(round) - 0.9 * Math.sin(CHOIR.lizards.heading * DEG);
  goTo(P, m, [px, x.ground(px, pz), pz], on);
  const wayAt = v => (TAU * (m.k / m.n) + (TAU * (v - from)) / 8) / DEG + 90;
  P.turn += follow(m, wayAt, u, on, [from + 2, to - 2]);
  P.run = Math.max(P.run, on);
  P.runAt = (r * (TAU * (u - from)) / 8) / 0.83;
  P.dy += 0.35 * a * on * hop(frac(u + m.k / m.n) / 0.5);
  P.roll += 0.25 * on; // leaning into the ring
}

// A flight: where a flyer is at a part's beat (`at`: on its way up, in its figure, on its way down), its nose along the figure
// itself (`figure`: where it would be were it all in the air) once it is well off the ground, banking into the turns.
function flight(P, m, u, at, figure, on, full) {
  if (on <= 0) return;
  const p = at(u), a = at(u - 0.04), b = at(u + 0.04);
  goTo(P, m, p, 1);
  const f0 = figure(u - 0.12), f1 = figure(u - 0.04), f2 = figure(u + 0.04), f3 = figure(u + 0.12);
  const wayAt = v => { const q0 = figure(v - 0.04), q1 = figure(v + 0.04); return headingOf(q1[0] - q0[0], q1[2] - q0[2]); };
  const flying = win(u, full[0] - 2, full[0]) * (1 - win(u, full[1], full[1] + 2)); // near the ground it faces as it stood
  P.turn += follow(m, wayAt, u, flying, full);
  const turning = short(headingOf(f1[0] - f0[0], f1[2] - f0[2]), headingOf(f3[0] - f2[0], f3[2] - f2[2])) / 0.16; // degrees a beat
  P.roll += clamp(turning * 0.012, -0.7, 0.7) * flying;
  P.pitch += clamp(0.7 * Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2]) + 0.05), -0.6, 0.6) * flying;
}
// Where the flyers go by between their bank and the eight: over the shallows in front of the lizards, well to the side of her.
const EIGHT_BY = [FAR_POOL.center[0] + 21 * Math.cos(197 * DEG), LEVEL + 5, FAR_POOL.center[1] + 21 * Math.sin(197 * DEG)];
/**
 * The flyers' eight over `beats`: up off the bank and in over the water, `rounds` of the figure of eight over the pool one behind
 * another (the dive past the low tip five eighths through each round), and out and down where they stood. `still`: they flap where
 * they stand (less motion).
 */
function eight(P, m, u, { beats = 16, rounds = 1, still = false } = {}) {
  if (still) {
    P.flap = Math.max(P.flap, 0.6);
    P.flapAt = u;
    P.dy += 0.2 * hop(frac(u) / 0.6);
    return;
  }
  // in the figure from `up` to `down`: of a round, that is from a quarter into it (coming down from the high tip) through the
  // middle, round the low tip, through the middle again and nearly to where it began; in sixteen beats the first of them is at
  // the low tip, the dive, on the eighth
  const up = 4.2, down = beats - 4.2;
  const rate = (rounds - 0.28) / (beats - 6.6);
  const ease = (v, a, b) => { const k = clamp01((v - a) / (b - a)); return lerp(k, smooth(k), 0.6); };
  const air = v => ease(v, 0.3, up) * (1 - ease(v, down, beats - 0.3));
  const figure = v => eightPoint((5 * Math.PI) / 4 + TAU * (0.265 + (v - 3.3) * rate) - 0.2 * m.k);
  const at = v => { // in and out in a bow by `EIGHT_BY`: the straight way to the pool's middle is over Slóeðla
    const w = air(v);
    const f = figure(v);
    const here = [m.x, m.y, m.z];
    return here.map((from, i) => (1 - w) * (1 - w) * from + 2 * w * (1 - w) * EIGHT_BY[i] + w * w * f[i]);
  };
  const on = air(u);
  flight(P, m, u, at, figure, on, [up - 0.6, down + 0.6]);
  const hard = clamp01(win(u, 0.1, 0.5) * (1 - win(u, up - 1.5, up)) + win(u, down + 0.8, down + 2) * (1 - win(u, beats - 0.6, beats - 0.15))); // off the ground and onto it
  const flapping = clamp01(Math.max(hard, 0.3 + 0.7 * hop(frac(u / 2) / 0.5) * win(on, 0, 0.3))); // and a few beats now and then
  P.flap = Math.max(P.flap, flapping * win(u, 0.1, 0.5) * (1 - win(u, beats - 0.5, beats - 0.1)));
  P.flapAt = u;
  P.glide = Math.max(P.glide, on * (1 - flapping));
}
/** The flyers in the drop and over the parade: a ring over a place, a round in `lap` beats, from `from` to `to`. */
function wheel(P, m, u, { from, to, lap = 4, r = 5, over, high = 6, swell = [], home = 0, gap = null }) {
  const span = [from - 1.5, from + 1.5, to - 2.5, to + 1];
  const on = win(u, span[0], span[1]) * (1 - win(u, span[2], span[3]));
  if (on <= 0) return;
  const figure = v => {
    const [cx, cz, rx = r, rz = r, tilt = 0] = over(v);
    const round = home + (TAU * (v - to)) / lap - (gap ?? TAU / m.n) * m.k; // the first of them is at `home` at `to`
    const ox = rx * Math.cos(round), oz = rz * Math.sin(round);
    const bump = swell.reduce((sum, b) => sum + 1.3 * hop((v - b) / 1.4), 0);
    return [cx + ox * Math.cos(tilt) - oz * Math.sin(tilt), LEVEL + high + 0.8 * Math.sin(round * 2) + bump, cz + ox * Math.sin(tilt) + oz * Math.cos(tilt)];
  };
  const at = v => {
    const air = win(v, span[0], span[1]) * (1 - win(v, span[2], span[3]));
    const [ex, ey, ez] = figure(v);
    return [lerp(m.x, ex, air), lerp(m.y, ey, air), lerp(m.z, ez, air)];
  };
  flight(P, m, u, at, figure, on, [span[1], span[2]]);
  const flapping = clamp01(0.45 + 0.55 * hop(frac(u) / 0.6) + (1 - on));
  P.flap = Math.max(P.flap, flapping * win(u, span[0], span[0] + 0.5) * (1 - win(u, span[3] - 0.5, span[3])));
  P.flapAt = u;
  P.glide = Math.max(P.glide, on * (1 - flapping));
}

/**
 * The beetles' drum: a hit every half beat from part beat `from` to `to`, and on each the beetle whose turn it is hops: a run down
 * the log, the two ends, everyone; and back up it.
 */
const ALL = [0, 1, 2, 3, 4, 5];
const DRUM = [[0], [1], [2], [3], [4], [5], [0, 5], ALL, [5], [4], [3], [2], [1], [0], [2, 3], ALL];
function drum(P, m, u, { from = 0, to = 16, a = 1 } = {}) {
  let e = 0, even = true;
  const now = Math.floor(u * 2);
  for (let i = now; i >= now - 1 && i >= from * 2; i--) {
    if (i >= to * 2 || !DRUM[i % DRUM.length].includes(m.k)) continue;
    const up = hop((u - i / 2) / 0.45);
    if (up > e) { e = up; even = i % 2 === 0; }
  }
  P.dy += 0.42 * a * e;
  if (even) P.kickA = Math.max(P.kickA, e); else P.kickB = Math.max(P.kickB, e);
  P.pitch += 0.35 * e;
  P.turn += 12 * e * (even ? 1 : -1);
  squat(P, 0.05 * dip(u * 2) * (1 - e));
}

/**
 * The dragonflies, the whole set through: hovering over the shallows by the log; on its call before her horn each darts low over
 * the water to her crest and circles her through the quiet part; home in the build; fast rings over the shallows in the drop; and
 * round her again in the last chorus. `still`: they stay where they hover.
 */
const DARTED = (() => {
  const calls = CALLS.dragonflies;
  const horn = partOf('break'), rise = partOf('rise'), drop = partOf('drop'), last = partOf('lastchorus');
  return { calls, home: rise.from + 2, drop: [drop.from, drop.to], last: [last.from + 1, last.to - 5], horn: horn.from };
})();
function dragonfly(P, m, beat, x) {
  const ph = m.k * 2.1;
  const at = b => {
    const hx = m.x + 0.4 * Math.sin(0.83 * b + ph), hy = m.y + 0.18 * Math.sin(1.9 * b + 2 * ph), hz = m.z + 0.35 * Math.sin(0.61 * b + 3 * ph);
    if (x.reduced) return [hx, hy, hz];
    const call = DARTED.calls[m.k % DARTED.calls.length];
    const there = clamp01(win(b, call, call + 3) - win(b, DARTED.home + m.k, DARTED.home + m.k + 3.5)
      + win(b, DARTED.last[0] + m.k, DARTED.last[0] + m.k + 2.5) - win(b, DARTED.last[1] + m.k, DARTED.last[1] + m.k + 3));
    const quick = b >= DARTED.last[0] ? 2 : 1; // round her: a round in eight beats in the quiet part, in four in the last chorus
    const round = (TAU * b * quick) / 8 + (TAU * m.k) / m.n;
    const r = 2.6 + 0.3 * Math.sin(0.7 * b + ph);
    const tx = x.her[0] + r * Math.cos(round), ty = x.her[1] + 0.5 + 0.45 * Math.sin(1.3 * b + ph), tz = x.her[2] + r * Math.sin(round);
    const wild = win(b, DARTED.drop[0], DARTED.drop[0] + 1) * (1 - win(b, DARTED.drop[1] - 2, DARTED.drop[1]));
    const loop = TAU * b / 2 + ph;
    const low = 0.9 * Math.sin(Math.PI * there) * (1 - there); // low over the water on the way to her
    return [
      lerp(hx, tx, there) + 2.4 * wild * Math.cos(loop),
      lerp(hy, ty, there) - low + 0.9 * wild * (1 + Math.sin(loop * 2)),
      lerp(hz, tz, there) + 2.4 * wild * Math.sin(loop),
    ];
  };
  const p = at(beat), a = at(beat - 0.04), b = at(beat + 0.04);
  goTo(P, m, p, 1);
  let vx = 0, vz = 0; // its way over the last and the next third of a beat: it turns, it does not flip
  for (const off of [-0.3, -0.15, 0, 0.15, 0.3]) { const q0 = at(beat + off - 0.04), q1 = at(beat + off + 0.04); vx += (q1[0] - q0[0]) / 5; vz += (q1[2] - q0[2]) / 5; }
  const fast = win(Math.hypot(vx, vz), 0.035, 0.12);
  P.turn += short(m.heading, headingOf(vx, vz)) * fast - 20 * Math.sin(0.47 * beat + ph) * (1 - fast);
  P.pitch += clamp(Math.atan2(b[1] - a[1], Math.hypot(vx, vz) + 0.05), -0.5, 0.5) * fast;
  P.wing = 0.12 + 0.6 * Math.sin(TAU * 4.3 * beat + ph);
}

/** The turtle that moves while everything is frozen: it was up on its shell's rim, and it tips over, slides and pulls its head in. */
function slip(P, m, setBeat) {
  if (m.group !== 'turtles' || m.k !== SLIP.turtle || !(setBeat >= SLIP.at) || setBeat >= SLIP.until) return;
  const t = setBeat - SLIP.at;
  const wobble = win(t, 0, 0.6) * (1 - win(t, 0.9, 1.3)) * Math.sin(TAU * 2.5 * t) * 0.12; // it cannot hold it...
  const down = win(t, 0.85, 1.5); // ...and over it goes (the camera is on it by then)
  const thump = t > 1.5 ? Math.exp(-(t - 1.5) * 5) * Math.abs(Math.sin(TAU * 1.5 * (t - 1.5))) : 0;
  P.roll = P.roll * (1 - down) + wobble;
  P.dy = P.dy * (1 - down) + 0.1 * thump;
  P.pitch *= 1 - down;
  shift(P, m, 0.3 * down, 0.12 * down);
  P.turn += 25 * down;
  const peek = win(t, 5.5, 6.5) * (1 - win(t, 7.2, 7.8)); // one look out, and in again
  P.look = P.look * (1 - win(t, 1.3, 1.9)) + 0.35 * peek;
  P.hide = Math.max(P.hide, win(t, 1.4, 2.1) * (1 - 0.6 * peek));
}

// --- the parts ---------------------------------------------------------------------------------

const FLUGEDLA = FAR_POOL.landing;
const GROUP_AT = Object.fromEntries(GROUPS.map(group => [group, CHOIR[group].at]));
const NOTES = Object.fromEntries(GROUPS.map(group => [group, TUNE.filter(note => note.group === group).map(note => note.beat)]));

/** While another has the floor: a small bob, turned a little its way, a hop when it sings itself. */
function watch(P, m, u, x, who, a = 0.4) {
  bob(P, m, u, a * x.size);
  if (who && who !== m.group && GROUP_AT[who] && m.group !== 'beetles') face(P, m, GROUP_AT[who], 0.3);
  pop(P, m, x.beat, 0.18 * x.size);
}
/** The whole floor dancing, and each group marking its notes of her tune. */
function tune(P, m, u, x, a) {
  bob(P, m, u, a * x.size);
  const e = Math.max(0, ...(NOTES[m.group] ?? []).map(at => hop((x.beat - at) / 1.2)));
  if (e > 0) {
    P.dy += 0.55 * JUMP[m.group] * e * x.size;
    P.sy *= 1 + 0.1 * e;
    face(P, m, WADE.at, 0.7 * e);
    if (m.group === 'frogs') P.leap = Math.max(P.leap, e);
    if (m.group === 'flyers') P.flap = Math.max(P.flap, e);
    if (m.group === 'turtles') P.look = Math.max(P.look, e);
  }
}
// The rise's roll: slow, then twice as quick each eight beats, and smaller.
const rolled = u => (u < 8 ? 0.5 * u : u < 16 ? 4 + (u - 8) : u < 24 ? 12 + 2 * (u - 16) : 28 + 4 * (u - 24));

const MOVES = {
  // the band from far away: heads toward Flugeðla, a first small bob
  arrival(P, m, u, x) {
    face(P, m, FLUGEDLA, 0.6 * win(u, 0, 3));
    bob(P, m, u, 0.3 * win(u, 0, 4) * x.size);
    pop(P, m, x.beat, 0.3 * x.size);
  },
  // her welcome, and the forest answers: a wave of hops along the bank, low to high, and again
  welcome(P, m, u, x) {
    face(P, m, FLUGEDLA, 0.6);
    bob(P, m, u, 0.35 * x.size);
    const gi = Math.max(0, GROUPS.indexOf(m.group));
    jump(P, m, u, 8 + 0.5 * gi, 0.6 * JUMP[m.group] * x.size, 1.1);
    jump(P, m, u, 12 + 0.5 * gi, 0.45 * JUMP[m.group] * x.size, 1.0);
  },
  // the warm-up: down on beats two and four with the claps; in the build they sink, and in its silence they are low and still
  warmup(P, m, u, x) {
    face(P, m, FLUGEDLA, 0.6 * (1 - win(u, 0, 4)));
    const low = win(u, 24, 31.3);
    const a = (0.55 + 0.45 * win(u, 8, 12)) * (1 - low) * x.size;
    const clap = dip((u - 1) / 2);
    squat(P, 0.13 * a * clap);
    P.dy += 0.3 * JUMP[m.group] * a * hop(frac((u - 1) / 2) / 0.45);
    bob(P, m, u, 0.3 * a);
    squat(P, 0.28 * low * (x.reduced ? 0.5 : 1));
    if (m.group === 'turtles') P.hide = Math.max(P.hide, 0.8 * low);
    if (m.group === 'grazers') P.graze = Math.max(P.graze, low);
  },
  // the dance floor: everyone up at once, and into each group's own dance
  groove(P, m, u, x) {
    jump(P, m, u, 0, 0.8 * JUMP[m.group] * x.size, 1.3);
    bob(P, m, u, win(u, 0.9, 2) * x.size);
    pop(P, m, x.beat, 0.2 * x.size * win(u, 2, 3));
  },
  tuneA(P, m, u, x) { tune(P, m, u, x, 0.7); },
  grazers(P, m, u, x) {
    if (m.group !== 'grazers') { watch(P, m, u, x, 'grazers'); return; }
    stomp(P, m, u, x.size);
  },
  turtles(P, m, u, x) {
    if (m.group !== 'turtles') { // the slow record: everyone at half speed until "Og hratt!"
      const quick = win(u, 7.6, 8.4);
      const slow = blank(), fast = blank();
      watch(slow, m, u / 2, x, 'turtles', 0.4);
      watch(fast, m, u, x, 'turtles', 0.5);
      Object.assign(P, blend(blend(P, slow, 1), fast, quick));
      return;
    }
    shell(P, m, u, { still: x.reduced });
  },
  frogs(P, m, u, x) {
    if (m.group !== 'frogs') { watch(P, m, u, x, 'frogs'); return; }
    if (x.reduced) { bob(P, m, u, 0.6); pop(P, m, x.beat, 0.3); return; }
    leaps(P, m, x.beat, FROG.frogs);
  },
  lizards(P, m, u, x) {
    if (m.group !== 'lizards') { watch(P, m, u, x, 'lizards'); return; }
    line(P, m, u, x, { still: x.stay });
  },
  flyers(P, m, u, x) {
    if (m.group !== 'flyers') { watch(P, m, u, x, null); if (m.group !== 'turtles') P.pitch += 0.1 * win(u, 2, 4) * (1 - win(u, 13, 15)); return; }
    eight(P, m, u, { still: x.stay });
  },
  // the percussion alone: the beetles drum, everyone else nearly still
  beetles(P, m, u, x) {
    if (m.group === 'beetles') { drum(P, m, u, { a: x.size }); return; }
    watch(P, m, u, x, null, 0.3);
  },
  // the dragonflies dart to her, and everyone turns to her
  dragonflies(P, m, u, x) {
    watch(P, m, u, x, null, 0.3 * (1 - win(u, 3, 7)));
    face(P, m, WADE.at, 0.55 * win(u, 3, 7));
  },
  // her horn: everything calms; they settle and sway, slowly
  break(P, m, u, x) {
    face(P, m, WADE.at, 0.55);
    const s = Math.sin((TAU * (u + 3 * m.late)) / 8);
    shift(P, m, 0.22 * x.size * s * (m.group === 'grazers' ? 1.6 : 1));
    P.roll += 0.06 * x.size * s;
    squat(P, 0.07 + 0.03 * Math.sin((TAU * u) / 4));
    if (m.group === 'turtles') P.look = Math.max(P.look, 0.5 + 0.4 * Math.sin((TAU * u) / 8 + m.k));
    if (m.group === 'grazers') P.standAt = 0.3 + u / 16;
  },
  // the build: they rise and lean in, the bob quicker and smaller as the roll speeds up; a group pops up on each number; on
  // "Einn!" everyone is down low, holding
  rise(P, m, u, x) {
    face(P, m, WADE.at, 0.55 * (1 - win(u, 0, 6)));
    const hold = win(u, 30, 30.5);
    const a = (1 - 0.6 * win(u, 4, 28)) * (1 - hold) * x.size;
    const roll = rolled(u);
    squat(P, 0.1 * a * dip(roll));
    P.dy += 0.22 * JUMP[m.group] * a * hop(frac(roll) / 0.6) * win(u, 0.5, 2);
    shift(P, m, 0, 0.35 * win(u, 2, 26) * (1 - hold) * x.size); // leaning in toward the water
    P.pitch -= 0.05 * win(u, 2, 26) * (1 - hold);
    P.sy *= 1 + 0.05 * win(u, 0, 8) * (1 - hold);
    if (m.group === 'flyers') { P.flap = Math.max(P.flap, 0.5 * a + 0.35 * hold); P.flapAt = roll; }
    if (m.group === 'lizards') { P.run = Math.max(P.run, 0.5 * a); P.runAt = roll; }
    if (m.group === 'grazers') { P.walk = Math.max(P.walk, 0.5 * a); P.walkAt = roll / 2; }
    // the countdown: the group that answers a number pops up
    const count = m.audience ? null : { grazers: 23, turtles: 25, frogs: 27, lizards: 29 }[m.group];
    if (count) jump(P, m, u, count, 0.75 * JUMP[m.group] * x.size, 1.0);
    squat(P, 0.3 * hold * (x.reduced ? 0.5 : 1));
    if (m.group === 'turtles') P.hide = Math.max(P.hide, 0.7 * hold);
  },
  // the drop (and again, after the rewind): everyone jumps at once, as high as each can, then the wildest of each dance
  drop(P, m, u, x) {
    jump(P, m, u, 0, JUMP[m.group] * x.size, 1.7);
    const wild = win(u, 1.6, 2.4) * (1 - win(u, 15, 16));
    if (x.stay) { bob(P, m, u, wild * (x.reduced ? 1 : 1.3)); return; }
    switch (m.group) {
      case 'grazers': { const Q = blank(); stomp(Q, m, u, 1.45); Object.assign(P, blend(P, Q, wild)); break; }
      case 'turtles': shell(P, m, u, { beats: 16, fast: 2.2 }); break;
      case 'frogs': leaps(P, m, x.beat, FROG.drop, wild); break;
      case 'lizards': ring(P, m, u, x); break;
      case 'flyers': { // a ring over the shallows in front of where they stand, three times round
        const h = CHOIR.flyers.heading * DEG;
        wheel(P, m, u, { from: 2.5, to: 14.5, lap: 4, high: 5.5, home: h + Math.PI, over: () => [CHOIR.flyers.at[0] + 7 * Math.cos(h), CHOIR.flyers.at[1] + 7 * Math.sin(h), 5.5, 5.5] });
        break;
      }
      case 'beetles': jump(P, m, u, 2 + Math.floor(Math.max(0, u - 2)), 0.5, 0.8); break;
      default: break;
    }
  },
  anthem(P, m, u, x) { tune(P, m, u, x, 1); pop(P, m, x.beat, 0.15 * x.size); },
  // Stoppdans: they dance big, and each is at the far end of its move on every second beat: the freeze, six beats in, catches the
  // grazers up on one side, a turtle on its shell's rim, two frogs in the air, the lizards mid-hop and the flyers off the ground
  freeze(P, m, u, x) {
    const a = win(u, 0, 0.8) * x.size;
    const top = hop(frac(u / 2 + 0.5)); // 1 on each second beat (2, 4, 6), 0 on the odd ones
    switch (m.group) {
      case 'grazers': {
        const way = (Math.floor(u / 2 + 0.5) + m.k) % 2 ? 1 : -1; // each its own way: one up on its left, the next on its right
        shift(P, m, 0.5 * a * top * way);
        P.roll += 0.2 * a * top * way;
        P.dy += 0.9 * a * top;
        P.pitch += 0.2 * a * top;
        P.walk = 0.7; P.walkAt = u / 2;
        break;
      }
      case 'turtles': {
        // up onto the rim of the shell and down again; the one that will slip is the one that stands highest
        const way = m.k % 2 ? 1 : -1;
        const tall = m.k === SLIP.turtle ? 1 : 0.6;
        P.roll += (Math.PI / 2) * 0.9 * tall * a * top * way * (x.reduced ? 0.5 : 1);
        P.dy += 0.25 * tall * a * top;
        P.look = Math.max(P.look, top);
        break;
      }
      case 'frogs':
        if (x.reduced) bob(P, m, u, a); else leaps(P, m, x.beat, FROG.freeze, a);
        break;
      case 'lizards': {
        const mine = m.k % 2 ? top : hop(frac(u / 2));
        P.dy += 1.1 * a * mine;
        P.pitch += 0.45 * a * mine;
        P.turn += 30 * a * Math.sin(Math.PI * u) * (m.k % 2 ? 1 : -1);
        P.run = 0.8; P.runAt = u * 2;
        break;
      }
      case 'flyers':
        P.dy += 1.8 * a * top;
        P.flap = Math.max(P.flap, 0.3 + 0.7 * top); P.flapAt = u + 0.3;
        P.roll += 0.25 * a * top * (m.k % 2 ? 1 : -1);
        break;
      case 'beetles': jump(P, m, u, Math.floor(u / 2) * 2 + 1.5, 0.4, 1); break;
      default: break;
    }
  },
  // the carnival: a parade along the bow toward the reed and back, the flyers over it; on each "Hopp!" everyone hops
  carnival(P, m, u, x) {
    const hopps = HOPPS.map(b => b - partOf('carnival').from);
    for (const at of hopps) jump(P, m, u, at, 0.7 * JUMP[m.group] * x.size, 1.2);
    if (x.stay) { bob(P, m, u, 1); pop(P, m, x.beat, 0.15 * x.size); return; }
    const out = win(u, 2.5, 13.5), back = win(u, 18, 28);
    const far = out - back; // 0 at home, 1 at the far end of the parade
    const going = hop((u - 2.5) / 11) + hop((u - 18) / 10); // moving (1 in the middle of each way)
    switch (m.group) {
      case 'grazers': {
        const j = FILE.order.indexOf(m.k);
        const along = -[0, 3.4, -3.4][m.k]; // where its seat is along the bank (toward the reed)
        const [px, pz] = paradePoint('grazers', along + (PARADE.grazers.out + FILE.more[j]) * far, FILE.lane[m.k]);
        const onLane = win(far, 0, 0.12);
        goTo(P, m, [px, x.ground(px, pz), pz], onLane);
        // facing: along the bank on the way out, about through the pool's side, back along it, and to the pool again
        const tangent = win(u, 0.5, 2.6) - 2 * win(u, 13.6, 17.6) + win(u, 28, 30.6); // 1: toward the reed, -1: back
        P.turn += -90 * tangent;
        const speed = going * (PARADE.grazers.out + FILE.more[j]) / 8;
        P.trot = clamp01((speed - 1.2) / 1.6) * clamp01(going * 3);
        P.walk = clamp01(going * 3 + hop((u - 13.6) / 4) + hop((u - 28) / 2.6) + hop((u - 0.5) / 2.1)) * (1 - P.trot);
        const walked = (PARADE.grazers.out + FILE.more[j]) * (out + back);
        P.walkAt = walked / 1.45 + u / 4;
        P.trotAt = walked / 2.44;
        P.dy += 0.14 * x.size * Math.sin(Math.PI * u) ** 2;
        P.roll += 0.05 * Math.sin(Math.PI * u);
        break;
      }
      case 'lizards': {
        const j = LINE.length - 1 - LINE.indexOf(m.k); // the other way: the one nearest the reed leads
        const [px, pz] = paradePoint('lizards', 2.6 - 1.7 * j + PARADE.lizards.out * far);
        const inLine = win(u, 0.8, 2.5) * (1 - win(u, 28.2, 30.2));
        goTo(P, m, [px, x.ground(px, pz), pz], inLine);
        const angle = CHOIR.lizards.angle + ((2.6 - 1.7 * j + PARADE.lizards.out * far) / PARADE.lizards.distance) / DEG;
        const about = win(u, 14, 17.5);
        P.turn += short(m.heading, angle + 90 + 180 * about * (j % 2 ? 1 : -1)) * inLine;
        P.run = clamp01(going * 3 + hop(about));
        P.runAt = (PARADE.lizards.out * (out + back)) / 0.83 + u / 2;
        P.dy += 0.3 * x.size * hop(frac(u + j * 0.5) / 0.5);
        P.turn += 12 * Math.sin(TAU * u);
        break;
      }
      case 'frogs': leaps(P, m, x.beat, FROG.carnival); break;
      case 'turtles': { // they cannot leave their stone: each marches a full turn round on it, and back
        P.turn += 360 * far * (m.k % 2 ? -1 : 1);
        bob(P, m, u, 1);
        break;
      }
      case 'flyers': // over the parade: a long ring over the bow, bank side out and water side back, twice round
        wheel(P, m, u, {
          from: 2.5, to: 27.5, lap: 12.5, high: 7.5, swell: hopps, home: -Math.PI / 2, gap: 0.3,
          over: () => { const [cx, cz] = [FAR_POOL.center[0] + 26 * Math.cos(183 * DEG), FAR_POOL.center[1] + 26 * Math.sin(183 * DEG)]; return [cx, cz, 3.6, 13.5, 3 * DEG]; },
        });
        break;
      case 'beetles': drum(P, m, u, { from: 0, to: 32, a: 0.8 }); break;
      default: break;
    }
  },
  // "Egill, segðu já!": they wait, leaning toward him; when the forest answers, everyone jumps, and higher on "Hærra!"
  crowd(P, m, u, x) {
    face(P, m, SPOTS.egill, 0.8 * win(u, 0, 2) * (1 - win(u, 14.5, 16)));
    const waiting = win(u, 0.5, 3) * (1 - win(u, 7.4, 7.9));
    shift(P, m, 0, 0.3 * waiting * x.size);
    P.pitch -= 0.06 * waiting;
    bob(P, m, u, (0.15 + 0.45 * win(u, 8, 9)) * x.size);
    const roars = ROARS.map(b => b - partOf('crowd').from).filter(b => b >= 0 && b < 16);
    roars.forEach((at, i) => jump(P, m, u, at, (0.8 + 0.3 * i) * JUMP[m.group] * x.size, 1.5));
  },
  // the ending that is not one: a last pose, held
  fakeend(P, m, u, x) { strikeAt(P, m, u, 0, x.size); },
  // the last chorus: every dance at once, the biggest
  lastchorus(P, m, u, x) {
    if (x.reduced || (m.audience && m.group !== 'grazers')) { tune(P, m, u, x, 1.2); return; }
    const v = u >= 32 ? 16 : u % 16;
    switch (m.group) {
      case 'grazers': stomp(P, m, u, 1.3 * win(u, 0, 0.6) * (1 - win(u, 31, 32))); break;
      case 'turtles': shell(P, m, v, { beats: 16, fast: 4 }); break;
      case 'frogs': leaps(P, m, x.beat, FROG.last, 1.2); break;
      case 'lizards': line(P, m, v, x, { a: 1.2 }); break;
      case 'flyers': eight(P, m, u, { beats: 32, rounds: 2 }); break;
      case 'beetles': drum(P, m, u, { from: 0, to: 32, a: 1.1 }); break;
      default: break;
    }
  },
  // good night: on each of the band's stabs one group strikes its pose, high to low; on the last hit everyone jumps; and then
  // they stand as they stood
  end(P, m, u, x) {
    const stab = { flyers: 0, lizards: 1, frogs: 2, turtles: 3, grazers: 4, beetles: 4 }[m.group];
    if (stab === undefined) return;
    const posed = blank();
    strikeAt(posed, m, u, stab, x.size);
    const held = 1 - win(u, 11.6, 12.1);
    if (u < stab - 0.1) squat(P, 0.12 * win(u, 0, 0.4)); // ready
    Object.assign(P, blend(P, posed, held * win(u, stab - 0.1, stab)));
    jump(P, m, u, 12, JUMP[m.group] * x.size, 1.6);
  },
  after() {},
};

const LAST = partOf('end');
/** How long a part takes to come in over the one before (beats): the hard starts are short. */
const COME_IN = { groove: 0.15, drop: 0.12, carnival: 0.3, fakeend: 0.25, grazers: 0.6, frogs: 0.15, beetles: 0.15, lastchorus: 0.25, crowd: 1, end: 0.5, after: 0.01 };

function partPose(part, m, beat, x) {
  const P = blank();
  if (m.group === 'dragonflies') dragonfly(P, m, beat, x); // theirs is one flight, the whole set through
  else MOVES[part.id]?.(P, m, beat - part.from, x);
  return P;
}

/**
 * The pose of member `m` at dance beat `beat`. `x`: { reduced, ground(x, z): the land's height, her: where the dragonflies circle
 * ([x, y, z], over Slóeðla's crest), setBeat: the set's own beat (only the frozen turtle reads it) }.
 * Returns what world/ardalur/life.js takes as a thing's dance: { dx, dy, dz, turn, pitch, roll, squash, morphs, clips, wings, mix }.
 */
export function danceOf(m, beat, x = {}) {
  const at = {
    reduced: Boolean(x.reduced), stay: Boolean(x.reduced || m.audience), size: x.reduced ? 0.5 : 1, beat, ground: x.ground ?? (() => m.y),
    her: x.her ?? [WADE.at[0], LEVEL + 3.2, WADE.at[1]],
  };
  const part = partAt(beat);
  let P = partPose(part, m, beat, at);
  // a group's own part starts sharp for the group; the others ease into watching it
  const comeIn = CALLS[part.feature] && part.feature !== m.group ? 1 : COME_IN[part.id] ?? 1;
  const w = part.before ? win(beat - part.from, 0, comeIn) : 1;
  if (w < 1) P = blend(partPose(part.before, m, beat, at), P, w);
  // out of its idle life over the first beat, and back into it once the last jump has landed
  P.mix = win(beat, 0, 1) * (1 - win(beat, LAST.from + 14.2, LAST.from + 15.8));
  if (x.setBeat !== undefined) slip(P, m, x.setBeat);
  return finish(P, m);
}

/** What life.js takes: the offsets, and the model's frames by its kind. */
function finish(P, m) {
  const out = { dx: P.dx, dy: P.dy, dz: P.dz, turn: P.turn, pitch: P.pitch, roll: P.roll, squash: [P.sx, P.sy, P.sz], mix: P.mix };
  const rest = (...used) => Math.max(0, 1 - used.reduce((sum, v) => sum + v, 0));
  switch (m.group) {
    case 'grazers': {
      const total = Math.max(1, P.walk + P.trot + P.graze);
      const [walk, trot, graze] = [P.walk / total, P.trot / total, P.graze / total];
      out.clips = [['walk', walk ? P.walkAt : 0, walk], ['trot', trot ? P.trotAt : 0, trot], ['graze', 0.5, graze], ['look', P.standAt, rest(walk, trot, graze)]];
      break;
    }
    case 'lizards': {
      const total = Math.max(1, P.run + P.peer);
      const [run, peer] = [P.run / total, P.peer / total];
      out.clips = [['run', run ? P.runAt : 0, run], ['look', 0.6, peer], ['idle', 0.2, rest(run, peer)]];
      break;
    }
    case 'flyers': {
      const total = Math.max(1, P.flap + P.glide);
      const [flap, glide] = [P.flap / total, P.glide / total];
      out.clips = [['flap', flap ? P.flapAt : 0, flap], ['glide', 0.2, glide], ['perch', 0.2, rest(flap, glide)]];
      break;
    }
    case 'turtles': out.morphs = { look: clamp01(P.look) * (1 - clamp01(P.hide)), hide: clamp01(P.hide) }; break;
    case 'frogs': out.morphs = { leap: clamp01(P.leap) }; break;
    case 'beetles': out.morphs = { kickA: clamp01(P.kickA), kickB: clamp01(P.kickB) }; break;
    case 'dragonflies': out.morphs = { hover: 1 }; out.wings = [P.wing, 1]; break;
    default: break;
  }
  return out;
}

// --- the scene's --------------------------------------------------------------------------------

/**
 * The dances for the chapter's state `c` (c.world, c.members: the choir's members by group, c.reduced: less motion asked for).
 * Returns { update({ beat, setBeat, frozen, rewinding, section }), cue(event), dispose() }:
 *   update   every frame of the set: `beat` is the dance beat, `setBeat` the set's own, `section` the set's part now
 *   cue      every event of the set as it comes (kafli5.js onSet: sections, her lines, calls and the other cues)
 *   dispose  the set is over: everyone back as they stood
 */
export function createDances(c) {
  const life = c.world?.forest?.life ?? null;
  const reduced = Boolean(c.reduced);
  const ground = (x, z) => c.world?.heightAt?.(x, z) ?? LEVEL;
  // everyone as they stand when the set starts: these are the seats the dances are danced from
  const groups = { ...Object.fromEntries(GROUPS.map(group => [group, c.members?.[group] ?? []])), beetles: life?.pool?.beetles ?? [], dragonflies: life?.pool?.dragonflies ?? [] };
  const seatsOfThese = things => things.map(b => ({ x: b.gather.at.x, y: b.gather.at.y, z: b.gather.at.z, heading: b.gather.heading }));
  const dancers = Object.entries(groups).flatMap(([group, things]) => {
    const seats = seatsOfThese(things);
    return things.map((b, k) => ({ b, m: memberOf(group, k, seats) }));
  });
  // and the rest of those that came, on the bank beyond Egill and Mosi: the whole forest dances, each where it stands
  const inChoir = new Set(dancers.map(({ b }) => b));
  const KIND = { grasbitur: 'grazers', smaedla: 'lizards', salamander: 'lizards', flugdyr: 'flyers' };
  for (const group of ['grazers', 'lizards', 'flyers']) {
    const things = (life?.arrivals ?? []).filter(b => KIND[b.kind] === group && !inChoir.has(b) && b.gather);
    const seats = seatsOfThese(things);
    things.forEach((b, k) => dancers.push({ b, m: audienceOf(group, k, seats) }));
  }
  // where the dragonflies circle: over her crest as she stands in the water now
  const head = c.sloedla?.raw?.headPosition?.(new c.world.THREE.Vector3()) ?? null;
  const her = head ? [head.x, Math.max(head.y, LEVEL + 2) + 0.2, head.z] : [WADE.at[0], LEVEL + 3.2, WADE.at[1]];
  return {
    dancers,
    update({ beat, setBeat }) {
      for (const { b, m } of dancers) b.dance = danceOf(m, beat, { reduced, ground, her, setBeat });
    },
    // nothing here waits for a cue: every call, count, roar and "Hopp!" of the set is in the dances by its beat (so the rewind and
    // the freeze hold them too), and a child's tap hops a group on top of its dance (kafli5.js sing: life.js hop)
    cue() {},
    dispose() {
      for (const { b } of dancers) b.dance = null;
    },
  };
}
