// The festival's top as data (docs/superpowers/specs/2026-11-21-stjornuhatidin-design.md sections 1 to 3 and 6; the plan's
// departures "The layout" and "The six stars hang on the sky sphere"): where everyone stands in each scene, where the stage rises,
// where the stars, the moon and the sun are in the sky, where the five friends come up, and every shot of the one place `toppur`
// (world/fjall/top.js createTop: 45 m round, its ground 0 to 3 m, the sea of cloud at -7 m) and whom it is for. Pure data and small
// pure helpers; hatid.js stages it. Metres, [x, z]; headings and bearings in degrees from +X toward +Z (0 faces +X, 90 faces +Z), as
// the looks' sun azimuth (engine/lighting.js sunDirection) and top.edge's angle.
//
//   BEARING                 the sun's (where it sets, toward the bank), the stage's and the child's (who watches the party)
//   floorPoint(across, depth) -> [x, z]  `depth` m from the middle toward the stage, `across` m to the child's right
//   FRIENDS8, MODELS, LENGTH, HEAD       the eight, their models (assets/characters/), lengths (STYLE.md 3) and heads
//   standsOf(top)           { start, farewell, dark, party, gather }: { friend: { at, heading } | { on: 'gramedla', at, heading } }
//   arrivalOf(top, friend)  where a friend comes up: { way: top.wayUp's three points, at, heading }
//   STAGE, FLOOR, ARRIVALS, SKY, STAR_TAP, SUN_TAP, starOver(friend, stands, shot), partyPlace(friend) (her star in the party)
//   SHOTS.toppur, SHOWS (shot -> who must be in its frame), SCENE (shot -> the stands it is seen with), tallShot(name) (its upright
//   frame, where it has one), sunShot(aspect), starsShot(aspect) (the two still tap shots)
import { TOP_END, topEnd } from './kafli6-route.js';
import { LOOKS } from '../engine/looks.js';

const deg = Math.PI / 180;
const way = heading => [Math.cos(heading * deg), Math.sin(heading * deg)];
const headingTo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / deg;
const round = (v, k = 100) => Math.round(v * k) / k;
const at3 = ([x, z], y) => [round(x), round(y), round(z)];
const GROUND = 1.2; // m: the top's ground on the flat (createTop: 0.7 to 1.5 m)

/**
 * The layout (the plan: open until chunk 2's still): the sun sets toward the top's bank (top.js BANK.bearing, LOOKS.sunset's
 * azimuth 215); the stage rises the other way, with the moon behind it; the child watches the party from the sun's side.
 */
export const BEARING = { sun: -145, stage: 45, child: -135 };
const [SX, SZ] = way(BEARING.stage);
/** [x, z] `depth` m from the top's middle toward the stage and `across` m to the child's right (the child faces the stage). */
export function floorPoint(across, depth) {
  return [SX * depth - SZ * across, SZ * depth + SX * across];
}

export const FRIENDS8 = ['gramedla', 'mosi', 'egill', 'flugedla', 'kambedla', 'uggedla', 'thorsedla', 'sloedla'];
/** Each friend's model in assets/characters/ (as fjall-toppur.js names them), Mosi's and Egill's. */
export const MODELS = {
  thorsedla: 'brontosaurus', kambedla: 'stegosaurus', uggedla: 'spinosaurus', sloedla: 'parasaurolophus', flugedla: 'pteranodon', gramedla: 'trex',
  mosi: 'mosi', egill: 'egill',
};
/** m from nose to tail (STYLE.md 3; Flugeðla her wingspan, Egill his height): a friend's room is a disc half of it round her root. */
export const LENGTH = { gramedla: 12, mosi: 8.5, egill: 1.1, flugedla: 7.5, kambedla: 7, uggedla: 14, thorsedla: 22, sloedla: 7.5 };
/**
 * Her head, [ahead, up] m from her root in her own frame, as she stands (read from lineup.js's face shots of each at real size;
 * Mosi's and Egill's as tests/kafli6-route.test.mjs PART); onHerHead: Egill sitting on Grameðla's (kafli6-seat.js HEAD_SEAT, his
 * head over her skull), in her frame.
 */
export const HEAD = {
  gramedla: [4, 4.2], mosi: [2.7, 3], egill: [0, 1], flugedla: [1.5, 3], kambedla: [2.5, 1.9], uggedla: [5.9, 5], thorsedla: [7.6, 8], sloedla: [2.5, 2.9],
  onHerHead: [3, 5.9],
};

// ---------------------------------------------------------------------------------------------
// The five who come up (spec 3, scene 1): in its order, each about fifteen seconds; up her way at bearing `way` (top.wayUp), none
// from the south-west, where Grameðla came up (TOP_END.way), nor out of the sun. `line`: her line in the set `hatid` (Task 5's WORDS).
export const ARRIVALS = [
  { friend: 'flugedla', way: -20, seconds: 15, line: 'h_flugedla_forest' }, // „Allur skógurinn er á leiðinni!“
  { friend: 'kambedla', way: -60, seconds: 15, line: 'h_kambedla_light' }, // „Ég kom með ljósið!“
  { friend: 'uggedla', way: 10, seconds: 15, line: 'h_uggedla_river' }, // „Allir komnir yfir ána!“
  { friend: 'thorsedla', way: -95, seconds: 15, line: 'h_thorsedla_late' }, // „Er ég of sein?“
  { friend: 'sloedla', way: 70, seconds: 15, line: 'h_sloedla_song' }, // „Ég man lagið!“
];
/** Where `friend` comes up onto `top`: her way (top.wayUp: under the sea, the rim, its inside point), and she on its inside point, facing in. */
export function arrivalOf(top, friend) {
  const { way: bearing } = ARRIVALS.find(a => a.friend === friend);
  const path = top.wayUp(bearing * deg);
  return { way: path, at: path[2], heading: headingTo(path[1], path[2]) };
}

// ---------------------------------------------------------------------------------------------
// The farewell and the dark (scenes 1 and 2): one arc round the top's middle, open to the sun, everyone facing it. Along it from the
// way Þórseðla came up round to Grameðla's: each a disc of half her length from the next (and ARC.pad more), Mosi beside Grameðla,
// the small ones between the big. Chord `c` between two on the arc takes 2 asin(c / 2R) of it.
const ARC = { radius: 24, pad: 1.06, order: ['thorsedla', 'kambedla', 'flugedla', 'uggedla', 'sloedla', 'mosi', 'gramedla'] };
const ARC_STANDS = (() => {
  const steps = ARC.order.slice(1).map((who, i) => {
    const chord = Math.max(6, ((LENGTH[who] + LENGTH[ARC.order[i]]) / 2) * ARC.pad);
    return (2 * Math.asin(chord / (2 * ARC.radius))) / deg;
  });
  const span = steps.reduce((a, b) => a + b, 0);
  let bearing = BEARING.sun + 180 - span / 2;
  const out = {};
  ARC.order.forEach((who, i) => {
    if (i) bearing += steps[i - 1];
    const [x, z] = way(bearing);
    out[who] = { at: [round(x * ARC.radius), round(z * ARC.radius)], heading: BEARING.sun };
  });
  return out;
})();
const DARK = { ...ARC_STANDS, egill: { on: 'gramedla', ...ARC_STANDS.gramedla } };

// The party (scene 3, first values): Slóeðla and Flugeðla on the stage, the big ones either side of it, the small ones in front, Mosi
// and Egill dancing at the front; everyone faces the child, as a band on a stage does.
const PARTY_AT = {
  sloedla: [0, 30], flugedla: [7.6, 29], gramedla: [-17, 20], thorsedla: [21, 22], uggedla: [-13, 4], kambedla: [12, 5], mosi: [-2, -9], egill: [2.5, -11],
};
const PARTY = Object.fromEntries(Object.entries(PARTY_AT).map(([who, p]) => [who, { at: floorPoint(...p).map(v => round(v)), heading: BEARING.child }]));

// The gathering (scene 4): a ring round Egill a little in front of the middle, everyone 7 m or more from him, turned to him; the big
// ones further out, the ring a little open toward the child's side, where its shot stands. [bearing from him, metres].
const EGILL_GATHER = floorPoint(0, -4);
const RING = { mosi: [-130, 8], gramedla: [-85, 15], kambedla: [-45, 8], uggedla: [-5, 17], thorsedla: [55, 21], flugedla: [100, 9], sloedla: [155, 9] };
const GATHER = {
  egill: { at: EGILL_GATHER.map(v => round(v)), heading: BEARING.stage },
  ...Object.fromEntries(Object.entries(RING).map(([who, [b, d]]) => {
    const [x, z] = way(BEARING.stage + b);
    const at = [round(EGILL_GATHER[0] + x * d), round(EGILL_GATHER[1] + z * d)];
    return [who, { at, heading: round(headingTo(at, EGILL_GATHER), 1000) }];
  })),
};

/**
 * Where everyone stands in each scene on `top` (a createTop): { start, farewell, dark, party, gather }, each { friend: { at: [x, z],
 * heading } }, and Egill { on: 'gramedla', at, heading } while he sits on her head (her own at and heading). start: where chapter 6
 * stops them (topEnd), and each of the five on her way's inside point as she comes up.
 */
export function standsOf(top) {
  const end = topEnd(top);
  const coming = Object.fromEntries(ARRIVALS.map(({ friend }) => {
    const { at, heading } = arrivalOf(top, friend);
    return [friend, { at, heading }];
  }));
  return {
    start: { gramedla: end.her, mosi: end.mosi, egill: { on: 'gramedla', ...end.her }, ...coming },
    farewell: structuredClone(DARK),
    dark: structuredClone(DARK),
    party: structuredClone(PARTY),
    gather: structuredClone(GATHER),
  };
}

// ---------------------------------------------------------------------------------------------
/**
 * The stage (spec 6): `stones` stones rise in a half ring of `arc` degrees, `radius` m round its middle, behind it (open to the
 * child), each `height` m high; Slóeðla stands on it, Flugeðla beside her. The dance floor: `count` glow flowers within `radius` m.
 */
export const STAGE = { centre: floorPoint(0, 30), stones: 9, arc: 150, radius: 9, height: [0.6, 1.4] };
export const FLOOR = { radius: 30, count: 420 };

// ---------------------------------------------------------------------------------------------
// The sky: places on the sky sphere as { azimuth, elevation } in degrees, seen from wherever the camera is.
/** A star's tap circle: degrees round it on the sky. The sun's: degrees round its middle. */
export const STAR_TAP = 3.6;
export const SUN_TAP = 6.5;
// The six in two rows, so six tap circles fit an upright screen (first values 26 and 38: the high row came down to 36, so its
// circles at the frame's sides clear the star counter on 16:10)
const ROWS = { low: 26, high: 36 };

// The still shot the six stars are tapped in (starsShot): from the sun's side, a little up, looking over the arc at its faces, the
// north-east sky over it, where the stage will rise and the moon come up.
const STARS_FROM = { bearing: BEARING.sun, out: 47, up: 2.2 };
const STARS_AT = at3(way(STARS_FROM.bearing).map(v => v * STARS_FROM.out), GROUND + STARS_FROM.up);
// The rows by the arc's order of the six: next ones never in one row
const STAR_ROW = { thorsedla: 'high', kambedla: 'low', flugedla: 'high', uggedla: 'low', sloedla: 'high', gramedla: 'low' };
const STARS_PITCH = 19; // degrees up: the high row's circles under the star counter on 16:10, the friends' heads over the captions
/** Her head as she stands ([x, y over her root, z]). */
function headOf(friend, stands) {
  const s = stands[friend];
  const host = s.on ? stands[s.on] : s;
  const [ahead, up] = s.on ? HEAD.onHerHead : HEAD[friend];
  const [fx, fz] = way(host.heading);
  return [host.at[0] + fx * ahead, up, host.at[1] + fz * ahead];
}
/** How far right of the middle a direction `d` ([x, y, z]) lands in `shot`, as a share of the depth (the screen's x before the lens). */
function across(shot, d) {
  const f = [shot.target[0] - shot.position[0], shot.target[1] - shot.position[1], shot.target[2] - shot.position[2]];
  const r = [-f[2], 0, f[0]]; // forward x up: the camera's right
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return dot(d, r) / Math.hypot(r[0], r[2]) / (dot(d, f) / Math.hypot(...f));
}
const skyDirection = (azimuth, elevation) => [Math.cos(elevation * deg) * Math.cos(azimuth * deg), Math.sin(elevation * deg), Math.cos(elevation * deg) * Math.sin(azimuth * deg)];
/**
 * The azimuth that puts `friend`'s star over her in `shot` (standing as `stands` says): on the screen straight above her head, in its
 * row. The screen's x of a place on the sky depends only on the camera's place and its way (the director keeps an authored frame's
 * width on any screen), so the same star is over her wide and upright when both look the same way from the same place.
 */
export function starOver(friend, stands, shot) {
  const [hx, hy, hz] = headOf(friend, stands);
  // her root on the top's ground (0.7 to 1.5 m on the flat: GROUND; half a metre off moves her head's x by under a pixel at 50 m)
  const u = across(shot, [hx - shot.position[0], GROUND + hy - shot.position[1], hz - shot.position[2]]);
  const elevation = ROWS[STAR_ROW[friend]];
  let lo = headingTo([shot.position[0], shot.position[2]], [hx, hz]) - 40, hi = lo + 80;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (across(shot, skyDirection(mid, elevation)) < u) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The six stars' still tap shot: the camera does not move while a tap waits. The same place and way for both screens (so each star is
 * over its friend on both); the upright frame's lens is narrower, its circles bigger (the director keeps the authored width).
 */
export function starsShot(aspect = 1.6) {
  const flat = Object.keys(STAR_ROW).map(f => { const [x, , z] = headOf(f, DARK); return headingTo([STARS_AT[0], STARS_AT[2]], [x, z]); });
  const mid = (Math.max(...flat) + Math.min(...flat)) / 2;
  const [x, z] = way(mid);
  const c = Math.cos(STARS_PITCH * deg);
  return {
    position: STARS_AT,
    target: [round(STARS_AT[0] + x * c * 40), round(STARS_AT[1] + Math.sin(STARS_PITCH * deg) * 40), round(STARS_AT[2] + z * c * 40)],
    fov: aspect < 1 ? 50 : 60,
  };
}

const SUN = { azimuth: BEARING.sun, elevation: LOOKS.sunset.sun.elevation }; // as the top's sunset has it (LOOKS.sunset: 215, 10)
export const SKY = {
  sun: SUN,
  stars: Object.fromEntries(Object.entries(STAR_ROW).map(([f, row]) => [f, { azimuth: starOver(f, DARK, starsShot()), elevation: ROWS[row] }])),
  // the first star, the one Þórseðla sees (spec: "Ein lítil stjarna kviknar"): high over the arc, above the six's rows
  first: { azimuth: 30, elevation: 50 },
  moon: { azimuth: 45, elevation: 7 }, // behind the stage, peeking up over the sea of cloud
  seventh: { azimuth: 45, elevation: 58 },
  // the constellations (engine/constellations.js): in scene 2 each drawing's longest side `span` degrees, her own star at her place
  // above (Task 10b measured all six whole and apart in stars_wide at 9, at both sizes). In the party (party_wide cuts the sky at
  // about 27 degrees) the six hang `lower` degrees lower and `gather` of their way from the shot's middle, `span` wide (partyPlace),
  // and `nudge` ([azimuth, elevation] degrees more) moves four of them off the moon, which rises in the shot's middle: without it
  // Uggeðla's snout touched its hat and Grameðla's tail and Slóeðla's feet came within 1.6 degrees of it; with it no line is within
  // 3.4 degrees, all six whole at both sizes, two drawings 1.7 degrees apart at the nearest (.tools/hatid-12/moonclear.mjs; Task 12)
  span: 9,
  party: { lower: 16, gather: 0.62, span: 11, nudge: { kambedla: [-5, 0], uggedla: [-4.5, 0], gramedla: [4.5, 0], sloedla: [2, 2] } },
};

/** The sun's tap shot: from behind Grameðla and Mosi on the arc, high, toward the sun low over the sea, they clear under it. */
export function sunShot(aspect = 1.6) {
  const upright = aspect < 1;
  const position = at3(way(60).map(v => v * 36), GROUND + 6.3);
  const [x, z] = way(BEARING.sun + (upright ? -6 : -8));
  const pitch = upright ? -2 : 1;
  const c = Math.cos(pitch * deg);
  return {
    position,
    target: [round(position[0] + x * c * 40), round(position[1] + Math.sin(pitch * deg) * 40), round(position[2] + z * c * 40)],
    fov: upright ? 44 : 50,
  };
}

// ---------------------------------------------------------------------------------------------
// The shots. Heights are over the top's own ground (0.7 to 1.5 m on the flat: G); none looks within 35 degrees of the sun while it
// is up, but the two that look at it (lineup_sun, sun_faces: the light low, his nightcap on, as chapter 5's set_sun).
const G = GROUND;
const shot = (from, to, fov) => ({ position: from.map(v => round(v)), target: to.map(v => round(v)), fov });
/** [x, y, z]: floorPoint(across, depth), `up` m over G. */
const fp = (across, depth, up) => { const [x, z] = floorPoint(across, depth); return [x, G + up, z]; };
/** [x, y, z] at bearing `b`, `d` m from the middle, `up` m over G. */
const polar = (b, d, up) => { const [x, z] = way(b); return [x * d, G + up, z * d]; };
/** [x, y, z] of a stand's point `ahead` m on her heading and `right` m to her right, `up` m over G. */
const off = (stand, ahead, right, up) => {
  const [fx, fz] = way(stand.heading);
  return [stand.at[0] + fx * ahead - fz * right, G + up, stand.at[1] + fz * ahead + fx * right];
};
/** Toward the sky place `sky` from `from`, `d` m out. */
const toSky = (from, { azimuth, elevation }, d = 40) => {
  const c = Math.cos(elevation * deg);
  return [from[0] + Math.cos(azimuth * deg) * c * d, from[1] + Math.sin(elevation * deg) * d, from[2] + Math.sin(azimuth * deg) * c * d];
};

// chapter 6's stop on the top (topEnd on the top as createTop builds it: measured 2026-11-25): her root and Mosi's
const STOP = { her: { at: [-26.57, 33.04], heading: -85.1 }, mosi: { at: [-21.18, 34.51], heading: -83.2 } };

const S = DARK;
// the seventh star seen past Þórseðla's head, she the first to see it: 11 m from her head on the sun's side, low, looking up
const SEVENTH_FROM = (() => { const [x, , z] = headOf('thorsedla', GATHER); const [fx, fz] = way(SKY.seventh.azimuth); return [x - fx * 11, G + 1.2, z - fz * 11]; })();
export const SHOTS = {
  toppur: {
    // Scene 1. The top empty and quiet: low from the middle, Grameðla with Egill on her head and Mosi beside her, the sea beyond
    top_empty: shot(polar(-20, 4, 1.4), [(STOP.her.at[0] + STOP.mosi.at[0]) / 2, G + 3.2, (STOP.her.at[1] + STOP.mosi.at[1]) / 2 - 3], 50),
    // each friend as she comes up out of the cloud (hatid-arrival.js), each from a place off her way and off every other's (Task 8,
    // the chunk's ruling 1: in grey they walked through the lens), toward her sign:
    // Flugeðla's speck far out over the sea, from the sun's side of the middle (her lap passes behind the lens, she lands in front)
    arrive_flugedla: shot(polar(-150, 18, 2.5), polar(-12, 150, 5), 52),
    // The other four from the brow (46.5 m out, where the ground starts down to the rim at 54) or down its slope (50.5 m out, 2 m over
    // the ground there), off her way: the top's shoulder hides
    // the cloud within ten metres of the rim from anywhere on the flat (Task 8's first stills: nobody showed but a crown).
    // Kambeðla's and Slóeðla's lenses are low (0.8 m) and look level: the sky and the top's ground take the frame the see-through sea
    // had, which was over the tablet's GPU budget (Task 8's fix round: 7.1 ms; nearer the rim's puffs, 10.4).
    // the lilac light in the cloud over her way, from her left
    arrive_kambedla: shot(polar(-84, 46.5, 0.8), polar(-60, 56, 0.4), 46),
    // the sail cutting along the rim's cloud toward her way, from her right
    arrive_uggedla: shot(polar(-8, 46.5, 1.8), polar(20, 55, -6.5), 50),
    // her head rising over the cloud as she comes to the rim, from her right
    arrive_thorsedla: shot(polar(-116, 46.5, 1.8), polar(-95, 60, 1.5), 50),
    // her head and crest over the cloud as her note sounds, 16 m off, from her left, Mosi and Grameðla behind the lens
    arrive_sloedla: shot(polar(86, 46.5, 0.8), polar(70, 54, 0), 44),
    // Each one's second shot (Task 8's fix round 2): from the top, the moment she is over the rim (Flugeðla: as she comes down off
    // her lap), she walks (flies) toward the lens to her stand and says her line in it. Each lens stands past her stand on her way in
    // and off it to one side, so where she says her line and where she stops are near one line from it; none within 8 m of anyone's
    // stand on the top, Flugeðla's none of hers (hatid-arrival.js; the points from .tools/hatid-koma/heima.mjs, the untouched play).
    home_flugedla: shot([31.3, G + 1.6, -4.1], [19.6, G + 3.8, 18], 48),
    home_kambedla: shot([34, G + 1.4, 12], [22.9, 3, -22.8], 38),
    home_uggedla: shot([3.9, G + 1.4, 15.6], [27.9, 5.8, 12.2], 46),
    home_thorsedla: shot([12.5, G + 1.4, 4.2], [5.6, G + 5.8, -35.2], 34),
    home_sloedla: shot([1.6, G + 1.4, 13.9], [11.6, 3.6, 29.5], 46),
    // everyone lined up facing the sun: the still shot the sun is tapped in
    lineup_sun: sunShot(1.6),
    // the sun's face close as it waves, yawns and sinks, Egill on her head under it
    // (Task 8: from her left, 5 m off her tail: from her right, 2 m off it, her tail came within 4 m of the lens and Mosi stood there)
    sun_faces: shot(off(S.gramedla, -6, -5, 5.4), toSky(off(S.gramedla, -6, -5, 5.4), { azimuth: BEARING.sun + 10, elevation: 6 }), 34),
    // Scene 2. The dark: the arc from the sun's side, Kambeðla's plates the only light
    dark_wait: shot(polar(BEARING.sun + 6, 46, 1.6), polar(48, 12, 3.4), 54),
    // Þórseðla stretches her neck highest of all: the first star over her
    first_star: shot(off(S.thorsedla, 16, -6, 1.5), toSky(off(S.thorsedla, 16, -6, 1.5), { azimuth: 16, elevation: 32 }), 55),
    // her roar up into the sky: low in front of her, Egill on her head
    roar_up: shot(off(S.gramedla, 13, 3, 0.8), off(S.gramedla, 0, 0, 6.5), 50),
    // the ring rolls out over the sea of cloud: from by the rim, past her, out over the sea (from the arc's end past Mosi, so the
    // guests hiding at his back are behind the lens: Task 12)
    sea_ring: shot(polar(95, 30, 6.5), [-105, G - 9, -7.7], 55),
    // the six stars hang over their friends: the still shot they are tapped in
    stars_wide: starsShot(1.6),
    // she lays her head down and Egill floats down to Mosi
    egill_down: shot(off(S.gramedla, 12, -7, 1.4), off(S.mosi, 0, 0, 2.2), 48),
    // the half moon peeks up over the clouds behind the top, a party hat on: past Mosi on his party stand (everyone is at theirs by
    // then: Task 12), over the stage, a long lens on the sea beyond it so the moon is big and nobody stands in front of it
    moon_peek: shot(fp(-4.5, -15, 3.2), toSky(fp(-4.5, -15, 3.2), { azimuth: 45, elevation: 5 }), 34),
    // Scene 3. The party, all toward the stage from the child's side
    stage_front: shot(fp(2, 14, 1.6), fp(3, 30, 3), 44),
    party_wide: shot(fp(0, -36, 4.2), fp(1, 10, 3.6), 55),
    party_high: shot(fp(-14, -28, 6.8), fp(2, 12, 1.5), 52),
    floor_low: shot(fp(4, -18, 0.5), fp(0, -9, 1.4), 46),
    egill_mosi: shot(fp(5, -19, 1.1), fp(0, -10, 1.6), 42),
    sky_dance: shot(fp(0, -30, 1.2), toSky(fp(0, -30, 1.2), { azimuth: 33, elevation: 30 }), 58),
    solo_kambedla: shot(fp(16, -6, 1.2), fp(12, 6, 1.6), 40),
    solo_uggedla: shot(fp(-1, 2, 1.4), fp(-13, 0.5, 4.2), 38),
    solo_thorsedla: shot(fp(18, -2, 1.2), fp(21, 22, 6.5), 50),
    solo_flugedla: shot(fp(10, 16, 1.4), fp(7.6, 29, 2.5), 40),
    solo_sloedla: shot(fp(-3, 17, 1.4), fp(0, 30, 2.6), 40),
    // (Task 6: from her right, toward the rim: from fp(-14, 4) the lens stood inside Uggeðla)
    solo_gramedla: shot(fp(-7, 13, 1.2), fp(-17, 20, 3.8), 46),
    // the moon alone over the sea of cloud, from behind the stage, everyone behind the lens (Task 6: from the floor its long lens drew
    // Mosi, Uggeðla and Þórseðla at full detail, 309k triangles, over the budget)
    moon_close: shot(fp(0, 41, 1.4), toSky(fp(0, 41, 1.4), { azimuth: 45, elevation: 7 }), 28),
    final_pose: shot(fp(0, -34, 3.2), fp(1, 8, 3), 55),
    // Scene 4. Round Egill, the seventh star, the lift
    gather: shot(off(GATHER.egill, -15, 1, 3.4), off(GATHER.egill, 4, 0, 1.4), 54),
    seventh_sky: shot(SEVENTH_FROM, toSky(SEVENTH_FROM, { azimuth: 45, elevation: 44 }), 55),
    lift_side: shot(off(GATHER.egill, 0, 9, 1.4), off(GATHER.egill, 0, 0, 2.6), 46),
    // Mosi looks up after him: low, from his right, he on one side and the sky over Egill on the other (Task 6: was 1 m off his head)
    mosi_up: shot(off(GATHER.mosi, 3, 10, 0.8), off(GATHER.mosi, 4.5, 0, 5), 54),
    rise_down: shot(off(GATHER.egill, -10, 3, 7), off(GATHER.egill, 2, 0, 0.6), 52),
  },
};

/**
 * Where `friend`'s star hangs in the party (her constellation with it): SKY.stars' place SKY.party.lower degrees lower, its azimuth
 * brought SKY.party.gather of its way to party_wide's middle (the look-check page's nedar=16&saman=0.62), and her nudge off the moon.
 */
const PARTY_MIDDLE = (() => { const { position: p, target: t } = SHOTS.toppur.party_wide; return headingTo([p[0], p[2]], [t[0], t[2]]); })();
export function partyPlace(friend) {
  const { azimuth, elevation } = SKY.stars[friend];
  const off = ((azimuth - PARTY_MIDDLE + 540) % 360) - 180;
  const [da, de] = SKY.party.nudge[friend] ?? [0, 0];
  return { azimuth: round(PARTY_MIDDLE + off * SKY.party.gather + da, 1000), elevation: elevation - SKY.party.lower + de };
}

/** Who each shot is for: in its frame while the camera holds it (tests/hatid-route.test.mjs), standing as SCENE says. */
export const SHOWS = {
  top_empty: ['gramedla', 'egill', 'mosi'],
  // the five as each comes: her sign past the rim has no stand to project from (hatid.test.mjs watches each in her own shot as she
  // comes, the top's shoulder counted); Flugeðla lands on hers in front of the lens
  ...Object.fromEntries(ARRIVALS.map(({ friend }) => [`arrive_${friend}`, friend === 'flugedla' ? [friend] : []])),
  // and each on the top in her second shot, where she comes over the rim (her start stand: 8 m inside it on her way)
  ...Object.fromEntries(ARRIVALS.map(({ friend }) => [`home_${friend}`, [friend]])),
  lineup_sun: ['gramedla', 'egill', 'mosi'],
  sun_faces: ['egill'],
  dark_wait: ['kambedla', 'mosi', 'gramedla', 'egill'],
  first_star: ['thorsedla'],
  roar_up: ['gramedla', 'egill'],
  sea_ring: ['gramedla'],
  stars_wide: ['kambedla', 'uggedla', 'thorsedla', 'flugedla', 'sloedla', 'gramedla', 'egill'],
  egill_down: ['gramedla', 'egill', 'mosi'],
  moon_peek: [], // the moon is what it shows (SKY_SHOTS); Mosi only as a back in its corner, his head past the edge
  stage_front: ['sloedla', 'flugedla'],
  party_wide: FRIENDS8,
  party_high: ['gramedla', 'thorsedla', 'sloedla', 'mosi', 'egill'],
  floor_low: ['mosi', 'egill'],
  egill_mosi: ['mosi', 'egill'],
  sky_dance: [],
  solo_kambedla: ['kambedla'],
  solo_uggedla: ['uggedla'],
  solo_thorsedla: ['thorsedla'],
  solo_flugedla: ['flugedla'],
  solo_sloedla: ['sloedla'],
  solo_gramedla: ['gramedla'],
  moon_close: [],
  final_pose: FRIENDS8,
  gather: ['egill', 'mosi', 'kambedla', 'sloedla'],
  seventh_sky: ['thorsedla'],
  lift_side: ['egill', 'mosi'],
  mosi_up: ['mosi'],
  rise_down: ['egill', 'mosi'],
};
/** The stands (standsOf's) each shot is seen with: its scene. */
const SCENES = {
  // (Flugeðla's home shot sees her come down onto her farewell stand: she flies in, not up her way)
  start: ['top_empty', ...ARRIVALS.flatMap(({ friend }) => [`arrive_${friend}`, ...(friend === 'flugedla' ? [] : [`home_${friend}`])])],
  farewell: ['home_flugedla', 'lineup_sun', 'sun_faces'],
  dark: ['dark_wait', 'first_star', 'roar_up', 'sea_ring', 'stars_wide', 'egill_down'],
  party: ['moon_peek', 'stage_front', 'party_wide', 'party_high', 'floor_low', 'egill_mosi', 'sky_dance', ...Object.keys(STAR_ROW).map(f => `solo_${f}`), 'moon_close', 'final_pose'],
  gather: ['gather', 'seventh_sky', 'lift_side', 'mosi_up', 'rise_down'],
};
export const SCENE = Object.fromEntries(Object.entries(SCENES).flatMap(([scene, names]) => names.map(name => [name, scene])));

// The upright frames (0.625) where the wide one does not hold what it must there
const TALL = {
  lineup_sun: sunShot(0.625),
  stars_wide: starsShot(0.625),
};
/** The upright frame of shot `name`, where one is needed (else null: the wide frame holds upright too). */
export function tallShot(name) {
  return TALL[name] ?? null;
}

// ---------------------------------------------------------------------------------------------
/**
 * The tablet's budget for the party's widest shot (STYLE.md 11; the plan's Global Constraints: GPU median 6 ms, 100 draw calls,
 * 250k triangles on the `tablet` preset, both screens), as Task 6 measured it in grey (qa/remake/hatid/butur2/maeling.md):
 * `shot` at `beat` of `?chapter=veisla` with all eight, `guests` stand-ins at the rim and `lights` light points (hatid-standins.js,
 * `?gestir=23`), capture.mjs --bench 120 on the laptop's Iris Xe. `levers`: what was applied of the plan's four, in their order:
 *   1 the four furthest stand where they draw at the quarter (under 200 px: `far`; Þórseðla, 24 m long, draws over 280 px anywhere on
 *     the top in this shot, so the fourth is Kambeðla, the next furthest of the big ones);
 *   2 those four cast no shadow in the party (`noShadow`: hatid.js theParty, engine/character-lod.js userData.noShadow);
 *   3 guests from 23 to 14 (not needed: `guests` stays 23);
 *   4 a wide shot held `wideBars` bars at the most (CAMERA already cuts every wide shot within 4: not needed beyond that).
 * `measured`: the shot after the levers, the worse of two runs. Before them: 264,014 triangles wide (over), 239,316 upright. Task 8
 * measured it again with the real guests (hatid-guests.js) and `?gestir` for the light points only (qa/remake/hatid/butur3/maeling.md).
 * Chunks 5 and 6 (the stage, the lights, the guests) build inside what is left: about 1.4 ms, 60 calls and 30k triangles wide.
 */
export const BUDGET = {
  shot: 'party_wide',
  beat: 76, // one bar after the first beat of `dance` (the chunk's rulings)
  guests: 23,
  lights: 600,
  levers: [1, 2],
  far: ['gramedla', 'flugedla', 'kambedla', 'sloedla'],
  noShadow: ['gramedla', 'flugedla', 'kambedla', 'sloedla'],
  wideBars: 4,
  wide: ['party_wide', 'party_high', 'final_pose'],
  limits: { gpuMs: 6, drawCalls: 100, triangles: 250000 },
  measured: {
    '1280x800': { gpuMs: 4.75, drawCalls: 34, triangles: 218227 },
    '800x1280': { gpuMs: 4.7, drawCalls: 37, triangles: 193529 },
  },
};

export { TOP_END };
