// Uggeðla í tjörninni, step 2: the show's timeline as data (chapters/tjorn3d/play.js plays it; the plan is
// docs/superpowers/specs/2026-11-19-uggedla-i-tjorninni-bordmynd-design.md, section 4). Pure numbers, no three: every place is in
// the table's frame (keys.js: cm, x to the viewer's right, y up from the surface, z toward the viewer), every time in seconds of
// the show.
//
// The story: the pond lies calm (1); a dark shape rises from the deep at the left, bubbles ahead of it, and the fish get out of
// its way (2); her sail breaks the surface and glides across the middle (3), then goes under and she is gone; bubbles come up near
// the viewer, and her head rises there to 6,5 cm, water running off it, and looks at him (4: the long hold); the big fish leaps in
// front of her and she darts her head at it, takes it, comes down with a splash and swallows it (5); the butterfly flutters over
// from its lily and sits on her snout, she holds still for it, it lifts off before she sinks, and the pond lies calm again (6).
//
// She is only ever turned where nobody sees it: between the glide and the head she is deep in the murk (her top 15 cm under or
// more: murk.js fades everything out there), and that is where she turns to the viewer and tips nose up.
import { SCALE, LILIES, BUTTERFLY } from './keys.js';

export const PARTS = [
  { id: 1, name: 'Kyrr tjörn', from: 0, to: 8 },
  { id: 2, name: 'Skugginn', from: 8, to: 20 },
  { id: 3, name: 'Seglið', from: 20, to: 30 },
  { id: 4, name: 'Höfuðið', from: 30, to: 42 },
  { id: 5, name: 'Fiskurinn', from: 42, to: 50 },
  { id: 6, name: 'Fiðrildið', from: 50, to: 60 },
];
export const CALM = { from: 60, to: 62 }; // the pond as it lay at the start: the last picture
export const LENGTH = CALM.to;
export const FADE = { in: 0.6, out: 0.5 }; // s from black at the start, to black at the end (the end card stands on black)
export const partAt = t => PARTS.find(p => t >= p.from && t < p.to) ?? null;

export const GRAVITY = 9.8 / SCALE; // cm/s² on the table: the game's own fall at the table's size (a drop falls 6 cm in 0.86 s)

const rad = d => (d * Math.PI) / 180;
const clamp01 = u => Math.min(1, Math.max(0, u));
export const smooth = u => { const c = clamp01(u); return c * c * (3 - 2 * c); };
const EASE = { io: smooth, in: u => u * u, out: u => 1 - (1 - u) * (1 - u), lin: u => u };

/** A channel from rows [t, value, ease into it ('io' unless said)]: the first's value before it, the last's after it. */
export function channel(rows) {
  return t => {
    if (t <= rows[0][0]) return rows[0][1];
    for (let i = 1; i < rows.length; i++) {
      if (t < rows[i][0]) {
        const [t0, v0] = rows[i - 1], [t1, v1, ease = 'io'] = rows[i];
        return v0 + (v1 - v0) * EASE[ease](clamp01((t - t0) / (t1 - t0)));
      }
    }
    return rows[rows.length - 1][1];
  };
}

// ---------------------------------------------------------------------------------------------
// Uggeðla

export const DEEP = 27; // her root this far under and nothing of her is seen (her top is 15 cm under or more, tipped or not)
// The glide: one straight line she swims along from the deep at the left to the right of the middle, her way along it. `u` is her
// root's place on it (cm from `at`).
// It runs through the middle of the pond, clear of the lilies on both sides: the sail cuts the surface no nearer than half a
// centimetre to a pad (the lily at the far left reaches z = -1.0, the butterfly's z = 1.2 from x = 4.7).
export const LINE = { at: [-1, 0.3], heading: 4 };
const along = u => [LINE.at[0] + u * Math.cos(rad(LINE.heading)), LINE.at[1] + u * Math.sin(rad(LINE.heading))];
// The head: key 4b's place and height (keys.js: her picture centred on the page; her root is at her feet, near the viewer's edge)
export const HEAD = { at: [0, 6.26], heading: 90, pitch: 62, sink: 5.02, top: 6.5 };
// Lower in the water than that she stands a little farther from the viewer: her hands are at the waterline then, and their picture
// lies nearest the viewer's edge of all she shows (on a 10 inch 16:10 page it would be 0.35 cm from it, not the 0.54 the rule asks)
const BACK = { by: 0.35, from: 5.1, over: 0.7 };
const backAt = sink => BACK.by * smooth((sink - BACK.from) / BACK.over);
// The tip of her snout as her head stands in the hold (cm, measured: tools/tjorn3d-probe.mjs --show)
const SNOUT = [-0.04, 6.27, 5.31];
export const TURN = 32.0; // the second she turns, deep down and unseen
export const HOLD = { from: 36.4, to: 42 }; // her head is up and still: the show's biggest moment
export const SAIL = { up: 23.6, down: 28.6 }; // her sail is all the way up between these
export const SINKS = 55.2; // the second she begins to sink for good, slowly at first: the butterfly still sits, and lifts off soon after
export const GONE = 59.6; // she is deep in the murk again, and stays there

// (it ends where the sail's fore end is still half a centimetre short of the butterfly's lily as it goes under)
const U = channel([[8, -10.0], [19, -8.6], [22, -6.5, 'in'], [29, 2.2, 'lin'], [TURN, 4.3, 'out']]);
const SINK = channel([
  [8, DEEP + 1], [19, 14.6, 'out'], [21.6, 12.4], [SAIL.up, 8.66], [SAIL.down, 8.66], [30.2, 12.6], [TURN, DEEP, 'in'],
  // the head: up through the murk, then out of the water more and more slowly
  [32.4, DEEP], [34.4, 11.5, 'lin'], [HOLD.from, HEAD.sink, 'out'], [43.98, HEAD.sink],
  // the fish: when she has it she comes down with it and bobs up again (never higher than her head stood: the page has no more
  // room over it at the smallest screen)
  [44.5, 8.6, 'in'], [45.3, 7.2, 'out'], [46.4, 7.4], [49, 7.5],
  // the butterfly: she holds still, then sinks, slowly at first
  [SINKS, 7.5], [GONE, DEEP, 'in'],
]);
const SWIM = channel([[8, 0.5], [19, 0.6], [22, 1], [30, 1], [TURN, 0.4]]);
// her jaw opens 9 degrees at most (kafli2-uggedla.js JAW_MAX): open as she darts, shut on the fish as far as the fish lets it (she
// holds it across her jaws: play.js), open once more as it goes down
const JAW = channel([[43.5, 0], [43.74, 9, 'out'], [43.84, 6.5, 'in'], [45.78, 6.5], [45.95, 9], [46.14, 0]]);
// From the fish's coming to her swallowing it her head is led by the tip of her snout (the rig's strike: neck and head reach until
// the tip is on a point), not by her look: the point is hers to the millimetre, so the catch is where the fish is and her head never
// rises over where it stood. STRIKE is how much of her head's pose is the reach's.
// It takes her head over while her look still holds it (the tip is put where her look has it, so the two agree), and her look takes
// it back the same way.
const STRIKE = channel([[HOLD.to, 0], [42.5, 1], [47.0, 1], [47.9, 0]]);

/** A path through points from rows [t, [x, y, z], ease into it]: as a channel, for three numbers. */
function path(rows) {
  const parts = [0, 1, 2].map(i => channel(rows.map(([t, p, ease]) => [t, p[i], ease])));
  return t => parts.map(part => part(t));
}

/**
 * Her at a second: whether she is there at all, her root's place ([x, z]) and how far it is under the surface, her way and how far
 * her whole body is tipped nose up (degrees), her neck (tuck: 0 folded low, 1 at ease), her tail's swimming, her jaw (degrees),
 * how much her head is led by the tip of her snout and where that tip is put (`snout`, [x, y, z]), and what she looks at ('eye' the
 * viewer, 'butterfly'; null: nothing).
 */
export function herAt(t) {
  const sink = SINK(t);
  if (t < TURN) {
    return { there: t >= 8, at: along(U(t)), sink, heading: LINE.heading, pitch: 0, tuck: 0, swim: SWIM(t), jaw: 0, strike: 0, toss: 0, look: null, lookWeight: 0 };
  }
  let look = null, lookWeight = 0;
  // (her look is what holds her head down from her body's own way, 62 degrees up: it lets go only while the tip of her snout leads)
  if (t >= 34.2 && t < 42.5) { look = 'eye'; lookWeight = 1; }
  else if (t >= 46.4 && t < 50.6) { look = 'eye'; lookWeight = 1; }
  // (play.js: she looks at it as it comes, straight ahead while it sits, and after it when it is well off; her look keeps all its
  // weight until she is gone: with less of it her snout would rise toward her body's own way, into the butterfly over it)
  else if (t >= 50.6) { look = 'butterfly'; lookWeight = 1; }
  const back = backAt(sink);
  const strike = STRIKE(t);
  // the tip's place goes with her body: down as she sinks, away as she stands back
  const tip = strike > 0 ? SNOUT_PATH(t) : null;
  return {
    there: t < GONE, at: back ? [HEAD.at[0], HEAD.at[1] - back] : HEAD.at, sink, heading: HEAD.heading, pitch: HEAD.pitch, tuck: 1, swim: 0,
    jaw: JAW(t), strike, toss: 0, snout: tip && [tip[0], tip[1] - (sink - HEAD.sink), tip[2] - back], look, lookWeight,
  };
}

// ---------------------------------------------------------------------------------------------
// The big fish that leaps: up from the deep at the right, out of the water at `out`, over the top of its arc right in front of
// her, between her and the viewer, where her jaws shut on it (`take`); she swallows it at `gulp`.

export const JUMP = {
  size: 2.5, // cm long
  from: [8.4, -13.5, 2.2], // where it is first seen: small and far down
  exit: [4.9, 0, 5.5], // where it leaves the water: clear of her hand and of the lily's pads
  catch: [0.5, 5.9], // [x, z] where she takes it, just past the top
  top: 4.45, // cm: its middle at the top of its arc (its back is some 0.6 higher)
  short: [0, -0.15, -0.4], // the tip of her snout stops this far from its middle: under it, on her side of it
  rise: 40.4, out: 43.0, take: 43.84, gulp: 46.1, // (it goes down her throat over the last third of a second before `gulp`)
};
const JUMP_UP = Math.sqrt(2 * GRAVITY * JUMP.top); // cm/s as it leaves the water
JUMP.topAt = JUMP.out + JUMP_UP / GRAVITY;

/**
 * The leaping fish at a second: null before it comes and once she has it; else its middle [x, y, z], its nose's way (heading and
 * pitch, degrees) and its tail's beat, and whether it is in the air.
 */
export function jumperAt(t) {
  if (t < JUMP.rise || t >= JUMP.take) return null;
  if (t < JUMP.out) {
    // under the water: a curve up from the deep, faster and faster, its nose turning up
    const u = (t - JUMP.rise) / (JUMP.out - JUMP.rise);
    const k = smooth(u), up = u * u * u;
    const at = [0, 1, 2].map(i => JUMP.from[i] + (JUMP.exit[i] - JUMP.from[i]) * (i === 1 ? up : k));
    const heading = (Math.atan2(JUMP.exit[2] - JUMP.from[2], JUMP.exit[0] - JUMP.from[0]) * 180) / Math.PI;
    return { at, heading: heading + (JUMP_HEADING - heading) * smooth(u * 1.2 - 0.2), pitch: 62 * up, beat: 2.2 * (t - JUMP.rise) + 2.5 * u * u, air: false };
  }
  const a = t - JUMP.out, span = JUMP.take - JUMP.out;
  const vy = JUMP_UP - GRAVITY * a;
  const vx = (JUMP.catch[0] - JUMP.exit[0]) / span, vz = (JUMP.catch[1] - JUMP.exit[2]) / span;
  return {
    at: [JUMP.exit[0] + vx * a, JUMP_UP * a - 0.5 * GRAVITY * a * a, JUMP.exit[2] + vz * a],
    heading: JUMP_HEADING, pitch: (Math.atan2(vy, Math.hypot(vx, vz)) * 180) / Math.PI, beat: 4 * a, air: true,
  };
}
const JUMP_HEADING = (Math.atan2(JUMP.catch[1] - JUMP.exit[2], JUMP.catch[0] - JUMP.exit[0]) * 180) / Math.PI;

// Where the tip of her snout goes (as her body stands in the hold; herAt takes it down and back with her): she turns to the fish as
// it comes up, draws back, darts and has it; follows through; carries it, her head toward the viewer; flicks it down; and is back.
const MEET = (() => { const at = jumperAt(JUMP.take - 1e-6).at; return at.map((x, i) => x + JUMP.short[i]); })();
const CARRY = [0, 5.9, 5.2];
const SNOUT_PATH = path([
  [42.5, SNOUT], [43.3, [1.0, 5.9, 5.0]], [43.56, [1.0, 6.05, 4.7]], [JUMP.take, MEET, 'in'], [43.98, [MEET[0] - 0.45, MEET[1] - 0.25, MEET[2] + 0.1], 'out'],
  [44.7, CARRY], [45.75, CARRY], [46.0, [CARRY[0], CARRY[1] + 0.7, CARRY[2] - 0.6], 'out'], [46.4, CARRY], [47.0, SNOUT],
]);

// ---------------------------------------------------------------------------------------------
// The small fish: each patrols a small round at its own depth while the pond is calm, darts to a place out of her way as her
// shadow grows, idles there, and comes back when she is gone. Places are where the fish's PICTURE lies on the page (keys.js:
// under), so a deep fish is seen where the table says, not where it is.

export const FISH = [
  { calm: [-3.4, 2.6], depth: 2.2, size: 1.6, round: 0.9, lap: 11, fled: [-9.2, 5.4], fledDepth: 2.0, nose: 150, flee: 11.6, back: 57.0 },
  { calm: [3.6, 1.2], depth: 4.0, size: 2.2, round: 1.1, lap: 14, fled: [9.4, -5.6], fledDepth: 3.4, nose: 320, flee: 13.4, back: 57.6 },
  { calm: [0.4, 4.6], depth: 6.5, size: 1.4, round: 0.7, lap: 9, fled: [9.8, 5.6], fledDepth: 3.0, nose: 40, flee: 14.6, back: 58.4 },
  { calm: [-4.4, -0.6], depth: 8.0, size: 2.4, round: 1.0, lap: 16, fled: [-9.6, -5.0], fledDepth: 5.0, nose: 190, flee: 9.4, back: 56.6 },
  { calm: [1.8, -3.2], depth: 1.4, size: 1.2, round: 0.8, lap: 8, fled: [-2.5, -6.2], fledDepth: 1.2, nose: 250, flee: 12.4, back: 57.3 },
  { calm: [7.2, -1.2], depth: 5.6, size: 1.8, round: 0.9, lap: 12, fled: [4.0, -6.3], fledDepth: 2.2, nose: 290, flee: 15.6, back: 58.0 },
];
const DART = 1.3, RETURN = 3.2; // s a fish takes to get out of her way, and to come back

/** Fish `i` at a second: where its picture lies ([x, z]), its depth (cm), its nose's way (degrees), its length and its tail's beat. */
export function fishAt(i, t) {
  const f = FISH[i];
  const turn = (2 * Math.PI * t) / f.lap + i * 1.9;
  const calm = [f.calm[0] + f.round * Math.cos(turn), f.calm[1] + 0.6 * f.round * Math.sin(turn)];
  const calmNose = (Math.atan2(0.6 * Math.cos(turn), -Math.sin(turn)) * 180) / Math.PI;
  const fled = [f.fled[0] + 0.12 * Math.sin(t * 0.5 + i * 1.7), f.fled[1] + 0.1 * Math.cos(t * 0.4 + i)];
  const out = EASE.out(clamp01((t - f.flee) / DART)), home = smooth((t - f.back) / RETURN);
  const w = out * (1 - home); // 0 in its round, 1 out of her way
  const going = t >= f.flee && t < f.flee + DART, coming = t >= f.back && t < f.back + RETURN;
  const way = (Math.atan2(f.fled[1] - calm[1], f.fled[0] - calm[0]) * 180) / Math.PI;
  const nose = going ? way : coming ? way + 180 : w > 0.5 ? f.nose : calmNose;
  return {
    seen: [calm[0] + (fled[0] - calm[0]) * w, calm[1] + (fled[1] - calm[1]) * w],
    depth: f.depth + (f.fledDepth - f.depth) * w + 0.05 * Math.sin(t * 0.7 + i),
    heading: nose, size: f.size,
    beat: going ? 6 * (t - f.flee) : coming ? 1.6 * (t - f.back) : t * 0.45 + i * 0.37,
    away: w,
  };
}

// ---------------------------------------------------------------------------------------------
// The butterfly: on its lily's flower, over to her snout, back again before the water reaches it.

export const BUTTERFLY_TIMES = { up: 50.0, land: 52.8, off: 55.6, home: 58.4 };
export const FLIGHT = { high: 5.6, flutter: 0.28, sway: 0.3, wings: 9 }; // cm over the water at most, cm of bobbing and swaying, wing beats a second

/** What the butterfly is doing at a second: 'lily', 'snout', or flying 'over' / 'back' with how far (0 to 1). */
export function butterflyAt(t) {
  const { up, land, off, home } = BUTTERFLY_TIMES;
  if (t < up || t >= home) return { on: 'lily', u: 0 };
  if (t < land) return { on: 'over', u: (t - up) / (land - up) };
  if (t < off) return { on: 'snout', u: 0 };
  return { on: 'back', u: (t - off) / (home - off) };
}
export const BUTTERFLY_LILY = LILIES[BUTTERFLY.lily].at;

// ---------------------------------------------------------------------------------------------
// What it all does to the water. Rings: [t, x, z, strength] (a ring lives 2.6 s; the water shows six at once). Bubbles: bursts
// [t, x, z, cm under], each a ring where it comes up. Splashes: drops thrown up from a place.

const sail = (t, ahead = 0.8, aside = 0) => { const p = along(U(t) + ahead); return [p[0], p[1] + aside]; };
const E = JUMP.exit;
const NECK = [0, 2.4]; // where her neck and chest cut the surface when her head is up (the middle of it)
export const RINGS = [
  // 1. a fish kisses the surface, a pad stirs
  [1.4, -5.2, 5.6, 0.35], [3.1, 3.4, 1.2, 0.3], [5.6, -1.0, -3.6, 0.3], [7.3, 5.6, 4.6, 0.3],
  // 3. the sail breaks the surface, cuts along it and goes under
  ...[[21.9, 1.2], [22.5, 1.0], [23.2, 0.9], [24.4, 0.6], [25.6, 0.6], [26.8, 0.6], [28.0, 0.6], [29.0, 0.8], [29.7, 1.0], [30.4, 0.8], [31.2, 0.5]]
    .map(([t, strength], n) => [t, ...sail(t, n % 2 ? 2.4 : -0.6, n % 2 ? 0.5 : -0.4), strength]),
  // 4. her head breaks the surface, and the water stirs round her while she stays
  [34.4, NECK[0], NECK[1] + 0.2, 1.3], [34.9, 0.5, 2.0, 1.0], [35.5, -1.7, 1.7, 0.9], [36.2, 1.8, 1.5, 0.8], [37.6, 0.2, 3.1, 0.5], [39.2, -1.9, 1.4, 0.4], [40.8, 1.9, 1.6, 0.4],
  // 5. the fish leaves the water; she comes down; the water settles
  [JUMP.out, E[0], E[2], 1.2], [JUMP.out + 0.22, E[0] + 0.2, E[2], 0.7],
  [44.42, NECK[0], NECK[1], 1.5], [44.58, -1.7, 1.9, 1.1], [44.74, 1.8, 1.7, 1.1], [45.5, 0.2, 3.1, 0.8], [46.2, 0, 2.2, 0.6], [46.9, -1.8, 1.5, 0.5], [48.4, 1.8, 1.6, 0.4],
  // 6. the butterfly leaves its lily; she goes under; it is home
  [BUTTERFLY_TIMES.up + 0.1, BUTTERFLY_LILY[0], BUTTERFLY_LILY[1], 0.35],
  [56.4, 0.1, 2.3, 0.6], [57.2, NECK[0], NECK[1] + 0.3, 1.1], [57.8, 0.4, 2.3, 0.9], [58.5, -0.3, 2.6, 0.7], [59.3, 0, 2.5, 0.5],
  [BUTTERFLY_TIMES.home + 0.1, BUTTERFLY_LILY[0], BUTTERFLY_LILY[1], 0.3],
  // the calm pond again
  [60.6, -5.2, 5.6, 0.3], [61.2, 3.4, 1.2, 0.3],
].sort((a, b) => a[0] - b[0]);

export const BUBBLE = { each: 6, apart: 0.22, seconds: 1.8, size: 0.05 }; // a burst: so many, s apart, s to rise, metres at the game's size
export const BUBBLES = [
  // 2. ahead of her as she comes up
  ...[[9.6, 4.6, 0.6], [11.3, 5.8, -0.4], [12.9, 4.0, -0.9], [14.5, 6.4, 0.3], [16.1, 5.2, 0.9], [17.6, 6.9, -0.5], [19.0, 5.6, 0.2]]
    .map(([t, ahead, aside]) => { const p = along(U(t) + ahead); return [t, p[0], p[1] + aside, Math.min(11, SINK(t) - 5)]; }),
  // 4. where her head is about to come up
  [32.3, 0.2, 3.2, 11], [33.0, -0.4, 2.6, 10], [33.5, 0.3, 2.9, 8],
  // 6. where she went down
  [57.4, 0.1, 2.6, 6], [57.8, -0.3, 2.2, 9],
];

// Splashes: [t, x, z, drops, [slowest, fastest] cm/s up, [least, most] cm/s outward, cm round the place they start in]
export const SPLASHES = [
  [JUMP.out, E[0], E[2], 36, [5, 10], [0.4, 2.0], 0.3], // the fish leaves the water
  [44.42, NECK[0], NECK[1], 80, [6, 12], [0.5, 1.8], 1.9], // she comes down
  [57.2, NECK[0], NECK[1] + 0.2, 24, [3, 7], [0.4, 1.4], 1.0], // her head goes under
];
// The water that runs off her as her head comes up: drops let go of her skin one by one over these seconds, most at the start
export const RUNOFF = { from: 34.5, to: 39.0, drops: 80 };
export const DROPS = SPLASHES.reduce((n, row) => n + row[3], 0) + RUNOFF.drops;

// Seconds that between them show everything the show has: her (under the water, her sail up, her head up with the water running
// off it), the leaping fish in the air, the fish in her jaws with the spray round it, the butterfly in flight. The page draws each
// once under the black before the show starts (chapters/tjorn3d.js), so that nothing's first draw falls in the show.
export const WARM = [12, 26, 38, JUMP.out + 0.5, JUMP.take + 0.76, BUTTERFLY_TIMES.up + 2];
