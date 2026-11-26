import * as THREE from 'three';
import { BEAT, entered, sectionAt, soloAt, energyAt, pulseAt, cuesIn } from './hatid-score.js';
import { SONG } from './hatid-song.js';
import { BEARING, BUDGET, FLOOR, HEAD, SHOTS, STAGE, floorPoint, partyPlace, partyStands } from './hatid-route.js';
import { PARTY_LOOKS } from './hatid-looks.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { createDusk } from '../engine/show/dusk.js';
import { createBeams } from '../engine/show/beams.js';
import { createLightPoints } from '../engine/show/lights.js';
import { createRings } from '../engine/show/rings.js';
import { createGlowFloor, FLOOR_LOOK } from '../world/props/glow-floor.js';
import { createSpeciesLibrary } from '../world/forest/species.js';

// The festival's stage (spec 6, "Sviðið": "Sviðið birtist með ljósum", fireflies as lamps; the owner's rule for the party: fun before
// realism). It lights up part by part as each friend comes into the song's intro (STAGE_PARTS), all of it at full when the choir
// comes in, and from then on its lights follow the song: every number here is a pure function of the song's beat (hatid-score.js)
// and of the party's stands (hatid-route.js partyStands), so a pause holds it, `?t=` lands on the same picture and the book's tile
// draws the very same stage.
//
//   STAGE_PARTS                what lights with whom: [{ part, with }] in the intro's order
//   partsAt(beat)              how far each part is lit, 0 to 1 ({ stones, cone, floor, strings, sea, spots, fireflies, full })
//   stonePlaces()              the nine stones: [{ at: [x, z], width, height, yaw }], in a half ring behind the stage
//   stonesAt(beat)             each stone's rise, 0 (under the ground) to 1, one after another over the first bar
//   coneAt(beat, o)            Slóeðla's own cone: { from, to, width, colour, level }
//   spotsAt(beat, o)           the four spotlights: [{ from, to, width, colour, level }] (their sources are swarms of fireflies)
//   stringsAt(beat, o)         120 lights on six strings from the drawings' feet down to the stones: [{ at, colour, level, string }]
//   firefliesAt(beat, i, out)  firefly i (of FIREFLIES.count): out.{ x, y, z, size, r, g, b, level }
//   seaAt(beat)                { glow (null: as the top has it), colour, ripples } for top.sea.setGlow and top.sea.ripples
//   floorAt(beat)              { open, pulse, colour, steps } for the glow floor's set()
//   partyLook(beat, o)         { parts, lift }: the party's light for engine/show/dusk.js mix(parts, lift)
//   createStage(c)             { update(beat), state(), dispose() }: draws them all, in five draw calls
//
// `o` is { reduced, heightAt }: reduced (less motion) holds the spotlights still and takes the light's lift away; heightAt the top's
// ground (GROUND, its flat, without one). Colours are sRGB 0 to 1 ([r, g, b]) or hex where a tool takes hex.

const BAR = SONG.beatsPerBar;
const GROUND = 1.2; // m: the top's ground on its flat (hatid-route.js GROUND), where no heightAt is given
const deg = Math.PI / 180;
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = x => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
const fract = x => x - Math.floor(x);
const way = heading => [Math.cos(heading * deg), Math.sin(heading * deg)];
const groundOf = o => o?.heightAt ?? (() => GROUND);
/** A number of its own for (i, k), 0 to 1, the same every time. */
const rnd = (i, k) => fract(Math.sin(i * 12.9898 + k * 78.233 + 0.5) * 43758.5453);

const STANDS = partyStands();
const entryOf = who => SONG.song.entries.find(e => e.who === who).beat;
const sectionOf = beat => sectionAt(beat)?.id ?? null;
const QUIET = SONG.song.sections.find(s => s.id === 'quiet');

// ---------------------------------------------------------------------------------------------
// The friends' hues, as light: each friend's colour (journal-data.js FRIENDS) fuller and brighter, as the constellations' lines are
const LIGHT_HUE = { saturation: 0.85, lightness: 0.6 };
const hsl = {};
// Mosi's and Egill's (who have no constellation, so no colour in the book): Mosi moss green, Egill red; the choir's a white light
const OTHER_COLOURS = { mosi: '#5fae5a', egill: '#e2574c' };
const lightHue = (colour, { saturation, lightness } = LIGHT_HUE) => {
  const c = new THREE.Color().setStyle(colour, THREE.SRGBColorSpace);
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, saturation, lightness, THREE.SRGBColorSpace);
  return `#${c.getHexString(THREE.SRGBColorSpace)}`;
};
const HUES = Object.fromEntries([...FRIENDS, ...Object.entries(OTHER_COLOURS).map(([key, colour]) => ({ key, colour }))].map(({ key, colour }) => [key, lightHue(colour)]));
HUES.choir = '#f4f0ff';
// the floor's: the same hues deeper, so a flower's petals keep their colour under the beat's light (at 0.6 lightness they read
// white near the lens on the beat)
const FLOOR_HUE = { saturation: 0.95, lightness: 0.48 };
const FLOOR_HUES = Object.fromEntries([...FRIENDS, ...Object.entries(OTHER_COLOURS).map(([key, colour]) => ({ key, colour }))].map(({ key, colour }) => [key, lightHue(colour, FLOOR_HUE)]));
/** Each one's hue as the stage's light: the six friends', Mosi's, Egill's and the choir's white (sRGB hex). */
export const FRIEND_HUES = Object.freeze({ ...HUES });
const ORDER = FRIENDS.map(f => f.key);
const rgbOf = hex => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const hexOf = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`;
const mixRgb = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
/** A friend's hue a bar, round the six in the book's order (`shift` bars on), or the soloist's through her solo. */
function hueAt(beat, shift = 0) {
  const solo = soloAt(beat);
  if (solo && HUES[solo.who]) return HUES[solo.who];
  const n = ((Math.floor(beat / BAR) + shift) % ORDER.length + ORDER.length) % ORDER.length;
  return HUES[ORDER[n]];
}
const hueOf = who => HUES[who] ?? '#fff1d6';

/** How far into the quiet part, 0 to 1: it falls over its first bar and lifts over its last. */
function quietAt(beat) {
  const from = QUIET.startBeat, to = QUIET.startBeat + QUIET.beats;
  if (beat < from || beat >= to) return 0;
  return Math.min(smooth((beat - from) / BAR), smooth((to - beat) / BAR));
}
/** The spotlights' gate: 0 through the whole quiet part (out on its first beat, where the camera cuts to the sky), in over the beat after it. */
function spotGate(beat) {
  const from = QUIET.startBeat, to = QUIET.startBeat + QUIET.beats;
  if (beat >= from && beat < to) return 0;
  if (beat >= to && beat < to + 1) return smooth(beat - to);
  return 1;
}

// ---------------------------------------------------------------------------------------------
// What lights with whom (the brief; ruling 1 of chunk 5: beats from the map). Each part comes in eased over a bar from its friend's
// entry (entered), at STAGE_LIGHT.intro of its light, and everything goes to full over the bar from the choir's entry (beat 76).
// Slóeðla has two: the stones rise over the bar from her horn, then her cone lights over the next.
export const STAGE_PARTS = [
  { part: 'stones', with: 'sloedla' },
  { part: 'cone', with: 'sloedla' },
  { part: 'floor', with: 'gramedla' }, // her first stomp springs it open in a wave from her feet
  { part: 'strings', with: 'kambedla' },
  { part: 'sea', with: 'uggedla' },
  { part: 'spots', with: 'thorsedla' },
  { part: 'fireflies', with: 'flugedla' },
  { part: 'full', with: 'choir' },
];
export const STAGE_LIGHT = { intro: 0.65, coneAfter: BAR };

export function partsAt(beat) {
  const full = entered('choir', beat);
  const lit = on => (on > 0 ? on * (1 - (1 - STAGE_LIGHT.intro) * (1 - full)) : 0);
  return {
    stones: Math.max(...stonesAt(beat)),
    cone: lit(entered('sloedla', beat - STAGE_LIGHT.coneAfter)),
    floor: lit(entered('gramedla', beat)),
    strings: lit(entered('kambedla', beat)),
    sea: lit(entered('uggedla', beat)),
    spots: lit(entered('thorsedla', beat)),
    fireflies: lit(entered('flugedla', beat)),
    full,
  };
}

// ---------------------------------------------------------------------------------------------
// The stones: STAGE.stones of the game's own `rock` in a half ring of STAGE.arc degrees, STAGE.radius m round the stage's middle, on
// the side away from the child, tallest in the middle (STAGE.height). Each rises out of the ground over a beat, one after another
// over the first bar from Slóeðla's horn.
// Task 14b (the owner's first of seven, 2026-11-26: "Hærri steinar í hring, hver í lit síns vinar, sem kvikna þegar vinurinn kemur
// inn. Þá sést sviðið úr fjarlægð"): the nine are tall standing stones in a ring round the dance floor, STONES.ring m from the top's
// middle, at `rels` degrees from the stage's bearing (about 23 apart), open 60 degrees behind the stage as a gate the moon rises in: from
// the low lenses in front of the stage (floor_low, egill_mosi, the solos: -3 to 18 m across its line) a stone nearer the line
// stood in front of the moon (.tools/hatid-14b/occlude.mjs). Tallest at the back (`height`), lower toward the child's side. Each is
// one friend's (`who`): the six friends' on the six at the back (matched to the strings by their azimuth from party_wide's lens, so
// each string lands on its own friend's stone), Mosi's, Egill's and the choir's on the three at the ends (Mosi on his side, Egill on
// his).
export const STONES = { width: [1.9, 2.5], rise: 1, seed: 14, ring: 37, rels: [-116, -93, -70, -47, -22, 38, 60, 82, 104], height: [5.6, 8.2] };
const STONE_PLACES = Array.from({ length: STAGE.stones }, (_, k) => {
  const rel = STONES.rels[k]; // degrees from the stage's bearing
  const [x, z] = way(BEARING.stage + rel);
  const back = Math.cos(rel * deg); // 1 straight behind the stage, 0 at the sides
  return {
    at: [x * STONES.ring, z * STONES.ring],
    width: lerp(STONES.width[0], STONES.width[1], rnd(k, 1)),
    height: lerp(STONES.height[0], STONES.height[1], clamp01(back)) + 0.4 * (rnd(k, 3) - 0.5),
    yaw: rnd(k, 2) * Math.PI * 2,
    rel,
  };
});
export const stonePlaces = () => STONE_PLACES.map(s => ({ ...s, at: [...s.at] }));
export function stonesAt(beat) {
  const gap = (BAR - STONES.rise) / (STAGE.stones - 1);
  const from = entryOf('sloedla');
  return STONE_PLACES.map((_, k) => smooth((beat - from - k * gap) / STONES.rise));
}
// Each stone's light (Task 14b): dark until its one comes into the song (entered: the six friends' entries; Mosi, Egill and the
// choir with the choir, beat 76, where everything is on), then it lights in a flash over half a beat that settles to `on`, beating a
// little with the pulse; in a solo the soloist's at `solo` and the others down to `others`; dim in the quiet part (`quiet`).
export const STONE_LIGHT = { on: 0.75, flash: 1, beat: 0.2, solo: 1, others: 0.4, quiet: 0.35 };
const ENTRY_OF = who => SONG.song.entries.find(e => e.who === who)?.beat ?? entryOf('choir');
export function stoneLightsAt(beat) {
  const solo = soloAt(beat);
  const q = quietAt(beat);
  const pulse = pulseAt(beat);
  return STONE_PLACES.map(({ who }) => {
    const u = beat - ENTRY_OF(who);
    let level = 0;
    if (u >= 0) {
      const flash = Math.exp(-3 * u) * STONE_LIGHT.flash; // a bright "on" that settles
      level = STONE_LIGHT.on * smooth(u / 0.5) * (1 - STONE_LIGHT.beat + STONE_LIGHT.beat * pulse) + flash * smooth(u / 0.15);
      if (solo) level *= solo.who === who ? STONE_LIGHT.solo / STONE_LIGHT.on : STONE_LIGHT.others;
      level *= lerp(1, STONE_LIGHT.quiet, q);
    }
    return { who, colour: HUES[who], level: Math.min(1.5, level) };
  });
}

// ---------------------------------------------------------------------------------------------
// Slóeðla's cone: a pale warm light from high over her straight down onto her (the spec: "Slóeðla stendur á þeim í ljóskeilu"),
// lit after the stones, dim in the quiet part and in another friend's solo (`others`: there the four spotlights are the light, and
// her white cone seen close from the side burned the soloist's shot out).
export const CONE = { up: 15, width: 5, colour: '#fff1d6', quiet: 0.4, others: 0.35 };
export function coneAt(beat, o = {}) {
  const [x, z] = STANDS.sloedla.at;
  const y = groundOf(o)(x, z);
  const solo = soloAt(beat);
  const others = solo && solo.who !== 'sloedla' ? CONE.others : 1;
  const level = partsAt(beat).cone * (0.75 + 0.25 * pulseAt(beat)) * lerp(1, CONE.quiet, quietAt(beat)) * others;
  return { from: [x, y + CONE.up, z], to: [x, y, z], width: CONE.width, colour: rgbOf(CONE.colour), level };
}

// ---------------------------------------------------------------------------------------------
// The four spotlights (spec 6: "Kastarar"): each a swarm of fireflies high over the back of the floor (`from`), its cone landing on
// a friend and sweeping to the next on each bar's last beat, in her own hue; all four on the soloist through her solo; dark through
// the quiet part. Reduced: each stays on its first friend.
export const SPOTS = {
  from: [[-24, 22, 16], [-9, 32, 19], [9, 32, 19], [24, 22, 16]], // floorPoint(across, depth) and m over the ground
  on: ['mosi', 'kambedla', 'uggedla', 'gramedla', 'thorsedla', 'flugedla', 'egill', 'sloedla'], // whom they land on, round the bars
  width: 3, swarm: 30, solo: 0.7, // swarm: fireflies a source; solo: m round the soloist the four land
};
const SPOT_FROM = SPOTS.from.map(([a, d, up]) => { const [x, z] = floorPoint(a, d); return [x, GROUND + up, z]; });
function standPoint(who, o) {
  const [x, z] = STANDS[who].at;
  return [x, groundOf(o)(x, z), z];
}
export function spotsAt(beat, o = {}) {
  const level = partsAt(beat).spots * spotGate(beat) * (0.6 + 0.4 * pulseAt(beat)) * (0.8 + 0.2 * energyAt(beat));
  const solo = soloAt(beat);
  return SPOT_FROM.map((from, k) => {
    if (solo && STANDS[solo.who]) {
      const [x, y, z] = standPoint(solo.who, o);
      const [ox, oz] = way(45 + k * 90);
      return { from: [...from], to: [x + ox * SPOTS.solo, y, z + oz * SPOTS.solo], width: SPOTS.width, colour: rgbOf(hueOf(solo.who)), level };
    }
    const bar = o.reduced ? 0 : Math.floor(beat / BAR);
    const turn = o.reduced ? 0 : smooth(beat - bar * BAR - (BAR - 1)); // the bar's last beat
    const n = SPOTS.on.length;
    const a = SPOTS.on[(((k * 2 + bar) % n) + n) % n], b = SPOTS.on[(((k * 2 + bar + 1) % n) + n) % n];
    const p = standPoint(a, o), q = standPoint(b, o);
    return {
      from: [...from], to: [lerp(p[0], q[0], turn), lerp(p[1], q[1], turn), lerp(p[2], q[2], turn)], width: SPOTS.width,
      colour: mixRgb(rgbOf(hueOf(a)), rgbOf(hueOf(b)), turn), level,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The strings of lights (the chunk's ruling 3): six, one from each drawing's feet (her lowest star at her party place) down to a
// stone, STRINGS.lights on each, hanging a little; a run of light goes down each on the beat. A string's top is that star as seen from
// party_wide's lens, STRINGS.reach m out (so in the party's wide shot it hangs from the star itself); its colour is its friend's.
export const STRINGS = { count: 6, lights: 20, reach: 85, sag: 0.06, size: 0.75, drop: 7, stones: [2, 3, 4, 5, 6, 7] };
const LENS = SHOTS.toppur.party_wide.position;
const skyWay = ({ azimuth, elevation }) => [Math.cos(elevation * deg) * Math.cos(azimuth * deg), Math.sin(elevation * deg), Math.cos(elevation * deg) * Math.sin(azimuth * deg)];
/** Where a string's top hangs: `place` ({ azimuth, elevation }) STRINGS.reach m from party_wide's lens. */
export function stringTop(place) {
  const d = skyWay(place);
  return [LENS[0] + d[0] * STRINGS.reach, LENS[1] + d[1] * STRINGS.reach, LENS[2] + d[2] * STRINGS.reach];
}
// without the drawings (a test's world): each friend's party place STRINGS.drop degrees lower, about her feet
const STRING_FEET = Object.fromEntries(ORDER.map(key => { const p = partyPlace(key); return [key, { azimuth: p.azimuth, elevation: p.elevation - STRINGS.drop }]; }));
const azimuthFromLens = ([x, , z]) => Math.atan2(z - LENS[2], x - LENS[0]) / deg;
// Whose each stone is (STONES): the six at the back (STRINGS.stones) the six friends' in the strings' order from party_wide's lens,
// so no two strings cross and each lands on its own friend's stone; the three at the front ends the choir's, Mosi's and Egill's.
(() => {
  const tops = ORDER.map(key => ({ key, az: azimuthFromLens(stringTop(STRING_FEET[key])) })).sort((a, b) => a.az - b.az);
  const backs = STRINGS.stones.map(k => ({ k, az: azimuthFromLens([STONE_PLACES[k].at[0], 0, STONE_PLACES[k].at[1]]) })).sort((a, b) => a.az - b.az);
  tops.forEach(({ key }, s) => { STONE_PLACES[backs[s].k].who = key; });
  const ends = STONE_PLACES.map((s, k) => k).filter(k => !STRINGS.stones.includes(k)).sort((a, b) => STONE_PLACES[a].rel - STONE_PLACES[b].rel);
  ['choir', 'mosi', 'egill'].forEach((who, j) => { STONE_PLACES[ends[j]].who = who; }); // Mosi dances on the child's left, Egill on the right
})();
const STONE_OF = Object.fromEntries(STONE_PLACES.map(s => [s.who, s]));
export function stringsAt(beat, o = {}) {
  const feet = o.feet ?? STRING_FEET; // { friend: { azimuth, elevation } }
  const heightAt = groundOf(o);
  const tops = ORDER.map(key => ({ key, top: stringTop(feet[key]) }));
  const lit = partsAt(beat).strings;
  const q = quietAt(beat);
  const phase = 1 - fract(beat); // the run is at the top on the beat and goes down
  const out = [];
  tops.forEach(({ key, top }) => {
    const s = STONE_OF[key];
    const bottom = [s.at[0], heightAt(s.at[0], s.at[1]) + s.height * 0.92, s.at[1]];
    const span = Math.hypot(top[0] - bottom[0], top[1] - bottom[1], top[2] - bottom[2]);
    const colour = rgbOf(hueOf(key));
    for (let k = 0; k < STRINGS.lights; k++) {
      const t = 1 - k / (STRINGS.lights - 1); // 1 at the top
      const sag = STRINGS.sag * span * 4 * t * (1 - t);
      const run = Math.exp(-((t - phase) ** 2) / 0.006);
      out.push({
        at: [lerp(bottom[0], top[0], t), lerp(bottom[1], top[1], t) - sag, lerp(bottom[2], top[2], t)],
        colour, level: lit * (0.4 + 0.6 * run * (1 - 0.6 * q)) * (1 - 0.4 * q), string: key,
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The fireflies (spec 6: fireflies as lamps): FIREFLIES.count in loose swarms over the floor (firefly i in swarm i % swarms), drawn up
// Þórseðla's neck in a spiral through her solo, drifting free and wide through the quiet part.
export const FIREFLIES = { count: 240, swarms: 6, size: 0.4, colour: '#ffd98a', height: 4.5 };
const SWARMS = [[-14, -4], [0, -14], [14, -2], [-8, 12], [10, 14], [0, 3]].map(([a, d]) => floorPoint(a, d));
const NECK = (() => {
  const { at, heading } = STANDS.thorsedla;
  const [fx, fz] = way(heading);
  const [ahead, up] = HEAD.thorsedla;
  return { base: [at[0] + fx * 2, 3.5, at[1] + fz * 2], head: [at[0] + fx * ahead, up + 0.6, at[1] + fz * ahead] };
})();
const NECK_AXIS = (() => {
  const d = new THREE.Vector3(NECK.head[0] - NECK.base[0], NECK.head[1] - NECK.base[1], NECK.head[2] - NECK.base[2]).normalize();
  const u = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
  const v = new THREE.Vector3().crossVectors(u, d);
  return { u: u.toArray(), v: v.toArray() };
})();
const FLY = rgbOf(FIREFLIES.colour);
const THOR = rgbOf(hueOf('thorsedla'));
export function firefliesAt(beat, i, out = {}, o = {}) {
  const heightAt = groundOf(o);
  const s = i % FIREFLIES.swarms;
  const j = Math.floor(i / FIREFLIES.swarms);
  const per = Math.ceil(FIREFLIES.count / FIREFLIES.swarms);
  // in its swarm, which wanders slowly over the floor
  const [sx, sz] = SWARMS[s];
  const cx = sx + 5 * Math.sin(beat * 0.05 + s * 1.7), cz = sz + 5 * Math.cos(beat * 0.04 + s * 2.3);
  const r = 0.8 + 2.2 * rnd(i, 1);
  const a = rnd(i, 2) * Math.PI * 2 + beat * (0.25 + 0.3 * rnd(i, 3)) * (rnd(i, 4) < 0.5 ? -1 : 1);
  let x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
  let y = GROUND + FIREFLIES.height + (rnd(i, 5) - 0.5) * 2.4 + 0.4 * Math.sin(beat * 0.8 + i);
  // free, in the quiet part: wide over the whole top, slow
  const q = quietAt(beat);
  if (q > 0) {
    const R = 4 + 24 * Math.sqrt(rnd(i, 6));
    const b = rnd(i, 7) * Math.PI * 2 + beat * 0.012 * (rnd(i, 8) + 0.3);
    const fx = Math.cos(b) * R, fz = Math.sin(b) * R, fy = GROUND + 2 + 9 * rnd(i, 9) + 0.6 * Math.sin(beat * 0.2 + i);
    x = lerp(x, fx, q); y = lerp(y, fy, q); z = lerp(z, fz, q);
  }
  // up Þórseðla's neck in a spiral, while she plays
  const solo = soloAt(beat);
  const pull = solo?.who === 'thorsedla' ? smooth((solo.u * 12) / 1.5) * smooth(((1 - solo.u) * 12) / 1.5) : 0;
  if (pull > 0) {
    const t = fract(j / per + beat * 0.2);
    const turn = Math.PI * 2 * (t * 2.5) + s * (Math.PI / 3) + beat * 0.6;
    const radius = 1.6 * (1 - 0.45 * t);
    const { u, v } = NECK_AXIS;
    const px = lerp(NECK.base[0], NECK.head[0], t) + (u[0] * Math.cos(turn) + v[0] * Math.sin(turn)) * radius;
    const py = lerp(NECK.base[1], NECK.head[1], t) + heightAt(STANDS.thorsedla.at[0], STANDS.thorsedla.at[1]) + (u[1] * Math.cos(turn) + v[1] * Math.sin(turn)) * radius;
    const pz = lerp(NECK.base[2], NECK.head[2], t) + (u[2] * Math.cos(turn) + v[2] * Math.sin(turn)) * radius;
    x = lerp(x, px, pull); y = lerp(y, py, pull); z = lerp(z, pz, pull);
  }
  const colour = pull > 0 ? mixRgb(FLY, THOR, pull * 0.6) : FLY;
  out.x = x; out.y = y; out.z = z;
  out.size = FIREFLIES.size;
  out.r = colour[0]; out.g = colour[1]; out.b = colour[2];
  out.level = partsAt(beat).fireflies * (0.7 + 0.3 * Math.sin(beat * 3 + i * 1.7)) * lerp(1, 0.9, q);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The sea of cloud (top.sea): from Uggeðla's entry it glows in a friend's hue a bar (one colour at a time: two lights at once add to
// a pale lavender; the soloist's through her solo), beating with the pulse, dimmer in the quiet part; a ripple leaves Grameðla's
// feet on every stomp and runs out over the sea (the newest RIPPLE.most). Before Uggeðla the sea is as the top has it (glow null).
export const SEA = { base: 0.25, beat: 0.65, quiet: 0.5, rest: { glow: 0.35, colour: '#f6e4da' }, speed: 40, life: 8, strength: 1.6, width: 14, shift: 3 };
const STOMPS = cuesIn('stomp', -Infinity, Infinity).map(c => c.beat);
export const FLOOR_FROM = [...STANDS.gramedla.at];
function ripplesAt(beat) {
  const out = [];
  for (let k = STOMPS.length - 1; k >= 0 && out.length < 4; k--) {
    const age = beat - STOMPS[k];
    if (age < 0) continue;
    if (age >= SEA.life) break;
    out.push({ from: [...FLOOR_FROM], front: age * BEAT * SEA.speed, strength: SEA.strength * (1 - age / SEA.life) ** 1.5, width: SEA.width });
  }
  return out;
}
export function seaAt(beat) {
  const on = partsAt(beat).sea;
  const ripples = ripplesAt(beat);
  if (!(on > 0)) return { glow: null, colour: null, ripples };
  const coming = entered('uggedla', beat); // over her entry's bar from the sea's own pale light to her hue's
  const hue = hueAt(beat, SEA.shift);
  const beating = on * (SEA.base + SEA.beat * pulseAt(beat)) * (0.7 + 0.3 * energyAt(beat)) * lerp(1, SEA.quiet, quietAt(beat));
  if (coming >= 1) return { glow: beating, colour: hue, ripples };
  return { glow: lerp(SEA.rest.glow, beating, coming), colour: hexOf(mixRgb(rgbOf(SEA.rest.colour), rgbOf(hue), coming)), ripples };
}

// ---------------------------------------------------------------------------------------------
// The floor of glow flowers (world/props/glow-floor.js; the chunk's rulings 2 and 3): buds until Grameðla's first stomp, then open in
// a wave from her feet that has crossed the whole floor a bar later; a common light beating with the pulse in a friend's hue a bar
// (not the sea's: FLOOR's own turn of the six), and a pool of light under each friend on the floor on every beat (a step, STEP.radius
// m), bigger under her on each stomp. The blooms are FLOOR_STYLE.size of the glow flower's (Task 13's 1.7 read as specks).
// Task 14b (the owner's third, "Blóm sem hoppa og snúast þegar stigið er á þau"): each step carries its age in beats (a fifth
// number: the beat's steps are as old as the beat, the stomp's as old as the stomp), and the floor (made with `hop` unless reduced)
// makes a flower under it jump and turn once round over the step's first FLOOR_LOOK.hop.length beat, then settle.
// Task 14b (the owner's second, "Gólfið í blönduðum litum: hvert blóm í lit vinarins sem er næstur því"): each flower takes the hue
// of the one of the eight nearest it (`friends`: their places and hues, the glow floor's uniforms), `mix` of it over the section's
// hue a bar (`colour`, which stays as a tint, so the floor still beats with the song), blended over `border` m where two meet; in a
// solo the soloist's hue takes more of the floor (`soloMix`).
export const FLOOR_STYLE = { size: 2.6, rest: 0.07, own: 0.1, base: 0.38, beat: 0.6, quiet: 0.35, mix: 0.65, soloMix: 0.35, border: 3 };
export const STEP = { radius: 4.5, level: 0.6, stomp: { radius: 6, level: 1.3, fade: 3 }, on: ['mosi', 'egill', 'kambedla', 'uggedla', 'gramedla', 'thorsedla'] };
const FIRST_STOMP = STOMPS[0];
const OPEN_MAX = Math.hypot(...FLOOR_FROM) + FLOOR.radius + FLOOR_LOOK.band + 0.5;
export function floorAt(beat) {
  const u = clamp01((beat - FIRST_STOMP) / BAR);
  const open = u > 0 ? OPEN_MAX * smooth(u) : 0;
  const lit = partsAt(beat).floor;
  const dim = lerp(1, FLOOR_STYLE.quiet, quietAt(beat));
  const pulse = lit * (FLOOR_STYLE.base + FLOOR_STYLE.beat * pulseAt(beat)) * (0.75 + 0.25 * energyAt(beat)) * dim;
  const steps = [];
  if (lit > 0) {
    for (const who of STEP.on) {
      const [x, z] = STANDS[who].at;
      steps.push([x, z, who === 'egill' ? STEP.radius * 0.6 : STEP.radius, lit * STEP.level * pulseAt(beat) * dim, fract(beat)]);
    }
    const last = STOMPS.findLast(b => b <= beat);
    if (last !== undefined && beat - last < 1) steps.push([FLOOR_FROM[0], FLOOR_FROM[1], STEP.stomp.radius, lit * STEP.stomp.level * Math.exp(-STEP.stomp.fade * (beat - last)), beat - last]);
  }
  const friends = Object.entries(STANDS).map(([who, { at }]) => [at[0], at[1], FLOOR_HUES[who]]);
  return { open, pulse, colour: hueAt(beat), steps, friends, mix: soloAt(beat) ? FLOOR_STYLE.soloMix : FLOOR_STYLE.mix, border: FLOOR_STYLE.border };
}

// ---------------------------------------------------------------------------------------------
// The party's light (engine/show/dusk.js mix: the dusk is made while the light is HATID_LOOKS.night, hatid-looks.js PARTY_LOOKS):
// the night as its base, tinted toward the section's hue as the stage lights up (warm in the dance and the last chorus), two thirds
// of the way back to the dark through the quiet part (over its first and last bar), and a soft lift on a hit, never two starting
// inside a second. Reduced: no lift.
export const PARTY_LIGHT = { tint: 0.45, quiet: 2 / 3, lift: 0.7, rise: 0.15, fall: 2.2, lasts: 2.5 };
// (Task 14b: the dance and the last chorus warm toward Flugeðla's pink, not Þórseðla's gold and Grameðla's orange: a yellow light on
// the green top turned the grass olive on Task 14's stills)
const SECTION_HUE = { intro: 'flugedla', dance: 'flugedla', quiet: 'sloedla', chorus: 'flugedla', chord: 'thorsedla' };
const HITS = (() => {
  const kept = [];
  for (const { beat } of cuesIn('hit', -Infinity, Infinity)) if (!kept.length || (beat - kept.at(-1)) * BEAT >= 1) kept.push(beat);
  return kept;
})();
function liftAt(beat) {
  let lift = 0;
  for (const h of HITS) {
    const t = beat - h;
    if (t < 0 || t >= PARTY_LIGHT.lasts) continue;
    lift = Math.max(lift, PARTY_LIGHT.lift * smooth(t / PARTY_LIGHT.rise) * Math.exp(-PARTY_LIGHT.fall * t));
  }
  return lift;
}
export function partyLook(beat, { reduced = false } = {}) {
  const p = partsAt(beat);
  const on = (p.cone + p.floor + p.strings + p.sea + p.spots + p.fireflies) / 6;
  const q = quietAt(beat);
  const tint = PARTY_LIGHT.tint * on * (1 - q);
  const dark = PARTY_LIGHT.quiet * q;
  const solo = soloAt(beat);
  const hue = solo ? hueOf(solo.who) : HUES[SECTION_HUE[sectionOf(beat)] ?? 'thorsedla'];
  return {
    parts: [[PARTY_LOOKS.night, 1 - tint - dark], [PARTY_LOOKS.tint(hue), tint], [PARTY_LOOKS.dark, dark]],
    lift: reduced ? 0 : liftAt(beat),
  };
}

// ---------------------------------------------------------------------------------------------
// The stage drawn: the stones (one instanced mesh of the game's own rock), the floor, the beams, the light points and the rings:
// five draw calls, none casting a shadow. update(beat) writes them all from the functions above and nothing else, and the sea and
// the light; state() is what it wrote (hatid.js partyFrame). With c.reduced: half the fireflies, the spotlights still, no lift.
// c: { world, top (heightAt, sea), figures (the constellations: the strings hang from their feet; optional), reduced }.
const r3 = v => Math.round(v * 1000) / 1000;
const r2 = v => Math.round(v * 100) / 100;
const RINGS = { capacity: 24, spot: 0.45, cone: 0.5, step: 0.35 };
const linear = new THREE.Color();

function stoneMesh(world) {
  const library = createSpeciesLibrary(STONES.seed);
  const { solid } = library.get('rock', 0, 0, { mossy: 0.5 });
  const pos = Float32Array.from(solid.pos);
  const col = new Float32Array(solid.col.length);
  for (let i = 0; i < col.length; i += 3) {
    linear.setRGB(solid.col[i], solid.col[i + 1], solid.col[i + 2], THREE.SRGBColorSpace);
    col[i] = linear.r; col[i + 1] = linear.g; col[i + 2] = linear.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setIndex(Array.from(solid.idx));
  // a unit stone: 1 m across, 1 m high, standing on y 0
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  geometry.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
  geometry.scale(1 / (max.x - min.x), 1 / (max.y - min.y), 1 / (max.z - min.z));
  geometry.computeVertexNormals();
  // Task 14b: each stone's light from inside, an instance's own (rgb as light, linear; level): its rock tinted toward the hue and a
  // glow that is strongest where the stone turns away from the eye (its edges, as a lit stone's skin) and low on it
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(STAGE.stones * 4), 4);
  glow.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aGlow', glow);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.name = 'stage stones';
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'attribute vec4 aGlow;\nvarying vec4 vGlow;\nvarying float vUp;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;\nvUp = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', 'varying vec4 vGlow;\nvarying float vUp;\n#include <common>')
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.35 + vGlow.rgb * 0.45, clamp( vGlow.a, 0.0, 1.0 ) * ${STONE_GLOW.tint.toFixed(3)} );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float edge = 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
      totalEmissiveRadiance += vGlow.rgb * vGlow.a * ( ${STONE_GLOW.body.toFixed(3)} + ${STONE_GLOW.edge.toFixed(3)} * edge * edge ) * ( 1.0 - ${STONE_GLOW.low.toFixed(3)} * vUp );`);
  };
  material.customProgramCacheKey = () => 'stage stones glow';
  const mesh = new THREE.InstancedMesh(geometry, material, STAGE.stones);
  mesh.name = 'Stage stones';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  world.scene?.add(mesh);
  return { mesh, geometry, material, glow, triangles: geometry.index.count / 3 };
}
const STONE_GLOW = { tint: 0.7, body: 0.28, edge: 1.4, low: 0.35 };

export function createStage(c) {
  const { world, top = null, reduced = false } = c;
  const heightAt = top?.heightAt ?? world.heightAt ?? (() => GROUND);
  const o = { reduced, heightAt };
  const stones = stoneMesh(world);
  const floor = createGlowFloor(world, { heightAt, keep: [{ at: STAGE.centre, r: STAGE.radius + 1.5 }], from: FLOOR_FROM, size: FLOOR_STYLE.size, rest: FLOOR_STYLE.rest, own: FLOOR_STYLE.own, hop: !reduced });
  floor.mesh.name = 'Stage floor';
  const beams = createBeams(world, { capacity: 1 + SPOT_FROM.length, name: 'Stage beams' });
  const points = createLightPoints(world, { capacity: BUDGET.lights, name: 'Stage lights' });
  const rings = createRings(world, { capacity: RINGS.capacity, name: 'Stage rings' });
  const dusk = createDusk(world);
  const flies = reduced ? FIREFLIES.count / 2 : FIREFLIES.count;
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const fly = {};
  const feetOf = () => {
    const figures = c.figures;
    if (!figures?.pointsOf) return null;
    const out = {};
    for (const key of ORDER) {
      try {
        const pts = figures.pointsOf(key);
        if (!pts.length) return null;
        const low = pts.reduce((a, b) => (b.elevation < a.elevation ? b : a));
        out[key] = { azimuth: low.azimuth, elevation: low.elevation };
      } catch { return null; }
    }
    return out;
  };
  let seaTouched = false;
  let now = null;

  function update(beat) {
    const parts = partsAt(beat);
    // the stones
    const rises = stonesAt(beat);
    STONE_PLACES.forEach((s, k) => {
      const y = heightAt(s.at[0], s.at[1]) - 0.15 - (1 - rises[k]) * (s.height + 0.4);
      position.set(s.at[0], y, s.at[1]);
      quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
      scale.set(s.width, s.height + 0.15, s.width * 0.8);
      stones.mesh.setMatrixAt(k, matrix.compose(position, quaternion, scale));
    });
    stones.mesh.instanceMatrix.needsUpdate = true;
    const stoneLights = stoneLightsAt(beat);
    stoneLights.forEach((l, k) => {
      linear.set(l.colour);
      stones.glow.setXYZW(k, linear.r, linear.g, linear.b, l.level * rises[k]);
    });
    stones.glow.needsUpdate = true;
    // the floor
    const f = floorAt(beat);
    floor.set(f);
    // the beams and the light on the ground
    beams.begin();
    rings.begin();
    points.begin();
    const cone = coneAt(beat, o);
    const spots = spotsAt(beat, o);
    for (const b of [cone, ...spots]) {
      if (!(b.level > 0)) continue;
      beams.beam(b.from, b.to, b.width, ...b.colour, b.level);
      rings.disc(b.to[0], b.to[1] + 0.06, b.to[2], b.width / 2 + 1, ...b.colour, b.level * (b === cone ? RINGS.cone : RINGS.spot));
    }
    const floorRgb = rgbOf(f.colour);
    for (const [x, z, radius, level] of f.steps) rings.disc(x, heightAt(x, z) + 0.06, z, radius * 0.75, ...floorRgb, level * RINGS.step);
    rings.end();
    beams.end();
    // the light points: the spotlights' swarms, the strings, the fireflies
    let swarms = 0;
    spots.forEach((s, k) => {
      const level = parts.spots * (0.35 + 0.65 * spotGate(beat));
      for (let j = 0; j < SPOTS.swarm; j++) {
        const i = k * SPOTS.swarm + j;
        const a = rnd(i, 11) * Math.PI * 2 + beat * (0.5 + 0.5 * rnd(i, 12));
        const r = 0.4 + 1.2 * rnd(i, 13);
        points.add(s.from[0] + Math.cos(a) * r, s.from[1] + (rnd(i, 14) - 0.5) * 1.4, s.from[2] + Math.sin(a) * r, 0.45, ...FLY, level * (0.7 + 0.3 * Math.sin(beat * 4 + i)));
        if (level > 0.003) swarms++;
      }
    });
    const lights = stringsAt(beat, { ...o, feet: feetOf() ?? undefined });
    let strings = 0;
    for (const l of lights) { points.add(...l.at, STRINGS.size, ...l.colour, l.level); if (l.level > 0.003) strings++; }
    let fireflies = 0;
    for (let i = 0; i < flies; i++) {
      firefliesAt(beat, i, fly, o);
      points.add(fly.x, fly.y, fly.z, fly.size, fly.r, fly.g, fly.b, fly.level);
      if (fly.level > 0.003) fireflies++;
    }
    points.end();
    // the sea
    const sea = seaAt(beat);
    if (top?.sea) {
      if (sea.glow === null) { if (seaTouched) restSea(); }
      else { top.sea.setGlow(sea.glow, sea.colour); seaTouched = true; }
      top.sea.ripples?.(sea.ripples);
    }
    // the light
    const look = partyLook(beat, o);
    dusk.mix(look.parts, look.lift);
    now = {
      beat: r3(beat),
      parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r3(v)])),
      stones: rises.map(r3),
      stoneLights: stoneLights.map(l => ({ who: l.who, colour: l.colour, level: r3(l.level) })),
      floor: { open: r2(f.open), pulse: r3(f.pulse), colour: f.colour, steps: f.steps.length },
      cone: r3(cone.level),
      spots: spots.map(s => ({ from: s.from.map(r2), to: s.to.map(r2), colour: hexOf(s.colour), level: r3(s.level) })),
      sea: { glow: sea.glow === null ? null : r3(sea.glow), colour: sea.colour, ripples: sea.ripples.length },
      look: { weights: look.parts.map(([, w]) => r3(w)), lift: r3(look.lift) },
      counts: { points: points.count, fireflies, strings, swarms, beams: beams.count, rings: rings.count },
    };
  }
  function restSea() {
    top.sea.setGlow(SEA.rest.glow, SEA.rest.colour); // the rim's own pale light, as the top made it
    top.sea.cards?.setGlow?.(0);
    top.sea.bank?.setGlow?.(0);
    seaTouched = false;
  }

  return {
    update,
    state: () => (now ? structuredClone(now) : null),
    /** The stage's own triangles: the stones', the floor's (a test's, the bench's). */
    get triangles() { return stones.triangles * STAGE.stones + (floor.mesh.geometry.index.count / 3) * floor.mesh.geometry.instanceCount; },
    parts: { stones, floor, beams, points, rings, dusk },
    dispose() {
      dusk.restore();
      if (top?.sea) {
        if (seaTouched) restSea();
        top.sea.ripples?.([]);
      }
      stones.mesh.removeFromParent();
      stones.geometry.dispose();
      stones.material.dispose();
      stones.mesh.dispose?.();
      floor.dispose();
      beams.dispose();
      points.dispose();
      rings.dispose();
    },
  };
}
