import * as THREE from 'three';
import { BEAT, END_BEAT, entered, sectionAt, soloAt, energyAt, pulseAt, cuesIn } from './hatid-score.js';
import { SONG } from './hatid-song.js';
import { BEARING, BUDGET, FLOOR, HEAD, SHOTS, SKY, STAGE, floorPoint, partyPlace, partyStands } from './hatid-route.js';
import { PARTY_LOOKS } from './hatid-looks.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { createDusk } from '../engine/show/dusk.js';
import { createBeams } from '../engine/show/beams.js';
import { createLightPoints } from '../engine/show/lights.js';
import { createRings } from '../engine/show/rings.js';
import { createGlowFloor, FLOOR_LOOK } from '../world/props/glow-floor.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { moonPose, MOON_HAT_LIFT } from '../engine/moon-face.js';

// The festival's stage (spec 6, "Sviðið": "Sviðið birtist með ljósum", fireflies as lamps; the owner's rule for the party: fun before
// realism). It lights up part by part as each friend comes into the song's intro (STAGE_PARTS), all of it at full when the choir
// comes in, and from then on its lights follow the song: every number here is a pure function of the song's beat (hatid-score.js)
// and of the party's stands (hatid-route.js partyStands), so a pause holds it, `?t=` lands on the same picture and the book's tile
// draws the very same stage.
//
//   STAGE_PARTS                what lights with whom: [{ part, with }] in the intro's order
//   partsAt(beat)              how far each part is lit, 0 to 1 ({ stones, cone, floor, strings, sea, spots, fireflies, full })
//   stonePlaces()              the nine stones: [{ at: [x, z], width, height, yaw, rel, who }], tall, in a ring round the floor
//   stonesAt(beat)             each stone's rise, 0 (under the ground) to 1, one after another over the first bar
//   stoneLightsAt(beat)        each stone's light: [{ who, colour, level }], dark until its one comes into the song (Task 14b)
//   fireworksAt(beat, o)       the bursts in the air after a hit: [{ at, colour, level, size, hit, spot }] (Task 14b)
//   moonAt(beat, base)         the moon's pose in the party: MOON_MOVES over its acts' pose (Task 14b)
//   moonPlaceAt(beat, o)       where the moon hangs: its climb from its peek to its party place over the intro (Task 17b)
//   FRIEND_HUES, FIREFLY_QUIET the eight's and the choir's hues as light; the quiet part's gathering and rise (Task 14b)
//   coneAt(beat, o)            Slóeðla's own cone: { from, to, width, colour, level }
//   spotsAt(beat, o)           the four spotlights: [{ from, to, width, colour, level }] (their sources are swarms of fireflies)
//   stringsAt(beat, o)         120 lights on six strings from the drawings' feet down to the stones: [{ at, colour, level, string }]
//   firefliesAt(beat, i, out)  firefly i (of FIREFLIES.count): out.{ x, y, z, size, r, g, b, level }
//   seaAt(beat)                { glow (null: as the top has it), colour, ripples } for top.sea.setGlow and top.sea.ripples
//   floorAt(beat)              { open, pulse, colour, steps } for the glow floor's set()
//   partyLook(beat, o)         { parts, lift }: the party's light for engine/show/dusk.js mix(parts, lift)
//   createStage(c)             { update(beat), state(), dispose() }: draws them all, in five draw calls
//   (Task 17) chorusAt, dieAt  the last chorus's boost and the chord's dying light; breathAt the constellations' breath in the
//                              quiet part; skyBurstsAt the shooting stars that burst on the burst cues; auroraAt the northern
//                              lights; stageLightAt all the stage's light summed
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
// Task 17: the last chorus and the chord. The chorus is the biggest light of the party: from its first beat every light of the stage
// is FINALE.boost brighter (chorusAt), and on the chord they all die (dieAt: full for its first bar, then down to nothing when the
// chord's tail ends, END_TAIL).
const CHORUS = SONG.song.sections.find(s => s.id === 'chorus');
const CHORD = SONG.song.sections.find(s => s.id === 'chord');
export const END_TAIL = END_BEAT + SONG.song.tail / BEAT;
export const FINALE = { boost: 0.35, on: 0.1, die: [CHORD.startBeat + BAR, END_TAIL] };
/** 0 before the last chorus, 1 from its first beat (in over FINALE.on beat) to the end. */
export const chorusAt = beat => smooth((beat - CHORUS.startBeat) / FINALE.on);
/** 1 until the chord's second bar, down to 0 as its tail ends: how much of the stage's light is left. */
export const dieAt = beat => 1 - smooth((beat - FINALE.die[0]) / (FINALE.die[1] - FINALE.die[0]));
/** The stage's lights at `beat`, as a share of what the song gives them: the chorus's boost, the chord's dying. */
const finaleLight = beat => (1 + FINALE.boost * chorusAt(beat)) * dieAt(beat);

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
// entry (entered), at STAGE_LIGHT.intro of its light, and everything goes to full over the bar from the choir's entry (beat 72).
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
// choir with the choir, beat 72, where everything is on), then it lights in a flash over half a beat that settles to `on`, beating a
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
      level *= lerp(1, STONE_LIGHT.quiet, q) * finaleLight(beat);
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
  const level = partsAt(beat).cone * (0.75 + 0.25 * pulseAt(beat)) * lerp(1, CONE.quiet, quietAt(beat)) * others * finaleLight(beat);
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
  const level = partsAt(beat).spots * spotGate(beat) * (0.6 + 0.4 * pulseAt(beat)) * (0.8 + 0.2 * energyAt(beat)) * finaleLight(beat);
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
// Fireworks (Task 14b, the owner's fourth: "Flugeldar úr kösturunum á stóru höggunum í laginu"): on each of the song's 16 `hit` cues
// every lit spotlight's swarm throws FIREWORKS.per light points up and out in the hue of the friend it is on at the hit; they fly out
// fast, slow in the air, fall and fade, gone a bar after the hit (`life` beats). None in the quiet part (no hit falls in it, and
// a spotlight is dark there). Reduced: no flying points (createStage flashes the swarm softly instead: burstFlash).
export const FIREWORKS = { per: 28, life: BAR, speed: [13, 21], drag: 1.3, fall: 5, size: 1.25, flash: 0.9 };
const BURSTS = cuesIn('hit', -Infinity, Infinity).map(c => c.beat);
/** The burst points in the air at `beat`: [{ at, colour, level, size, hit, spot }]. */
export function fireworksAt(beat, o = {}) {
  const out = [];
  if (o.reduced) return out;
  for (const h of BURSTS) {
    const age = beat - h;
    if (age < 0 || age >= FIREWORKS.life) continue;
    if (quietAt(h) > 0 || spotGate(h) < 1) continue;
    const t = age * BEAT; // seconds in the air
    const fade = (1 - age / FIREWORKS.life) ** 1.5;
    spotsAt(h, o).forEach((spot, k) => {
      if (!(spot.level > 0)) return;
      for (let j = 0; j < FIREWORKS.per; j++) {
        const i = k * 100 + j + h * 7;
        const turn = ((j + rnd(i, 21) * 0.8) / FIREWORKS.per) * Math.PI * 2;
        const up = (20 + 60 * rnd(i, 22)) * deg;
        const v = lerp(FIREWORKS.speed[0], FIREWORKS.speed[1], rnd(i, 23));
        const go = (v * (1 - Math.exp(-FIREWORKS.drag * t))) / FIREWORKS.drag;
        const [fx, fy, fz] = spot.from;
        out.push({
          at: [fx + Math.cos(turn) * Math.cos(up) * go, fy + Math.sin(up) * go - 0.5 * FIREWORKS.fall * t * t, fz + Math.sin(turn) * Math.cos(up) * go],
          colour: spot.colour,
          level: fade * (0.75 + 0.25 * Math.sin(beat * 9 + j * 2.1)),
          size: FIREWORKS.size * (1 + 0.6 * Math.exp(-4 * age)),
          hit: h, spot: k,
        });
      }
    });
  }
  return out;
}
/** Reduced motion's burst: how much brighter the swarms are a beat after a hit (0 to FIREWORKS.flash), soft. */
export function burstFlash(beat) {
  let f = 0;
  for (const h of BURSTS) {
    const age = beat - h;
    if (age < 0 || age >= FIREWORKS.life || quietAt(h) > 0) continue;
    f = Math.max(f, FIREWORKS.flash * smooth(age / 0.25) * Math.exp(-1.5 * age));
  }
  return f;
}

// ---------------------------------------------------------------------------------------------
// The strings of lights (the chunk's ruling 3): six, one from each drawing's feet (her lowest star at her party place) down to a
// stone, STRINGS.lights on each, hanging a little; a run of light goes down each on the beat. A string's top is that star as seen from
// party_wide's lens, STRINGS.reach m out (so in the party's wide shot it hangs from the star itself); its colour is its friend's.
// Task 14b (the owner's sixth: "Luktir á ljósaseríunum sem sveiflast þegar Grameðla stappar"): every fifth light of a string (from the
// third) is a lantern, `lantern.size` m, warmer (`warmth` of the way to `warm`), hanging `hang` m under the line and glowing
// steadily; on every stomp cue the strings swing sideways (across their own line, most in the middle of each, `swing.amp` of its
// length), a beat's swing that dies away and is still `settle` beats after the stomp, the lanterns `lag` beat behind and a little
// wider. Reduced: they hang still.
export const STRINGS = {
  count: 6, lights: 20, reach: 85, sag: 0.06, size: 0.75, drop: 7, stones: [2, 3, 4, 5, 6, 7],
  lantern: { every: 5, first: 2, size: 2.4, hang: 0.9, warm: '#ffc46b', warmth: 0.55, glow: 0.8 },
  swing: { amp: 0.04, settle: 2, lag: 0.2, lanterns: 1.35 },
};
/** How far the strings are swung at `beat` (-1 to 1 or so; 0 still), `lag` beat behind a stomp: still on it and `settle` beats after. */
function swingAt(beat, lag = 0) {
  const { settle } = STRINGS.swing;
  let v = 0;
  for (let k = STOMPS.length - 1; k >= 0; k--) {
    const since = beat - STOMPS[k];
    if (since < 0) continue;
    if (since >= settle) break;
    const age = since - lag;
    if (age <= 0) continue;
    const u = age / (settle - lag);
    v += Math.sin(Math.PI * 2 * age) * (1 - u) ** 2;
  }
  return v;
}
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
  const lit = partsAt(beat).strings * finaleLight(beat);
  const q = quietAt(beat);
  const phase = 1 - fract(beat); // the run is at the top on the beat and goes down
  const out = [];
  const { lantern: L, swing: W } = STRINGS;
  const swung = o.reduced ? 0 : swingAt(beat), lagged = o.reduced ? 0 : swingAt(beat, W.lag);
  tops.forEach(({ key, top }) => {
    const s = STONE_OF[key];
    const bottom = [s.at[0], heightAt(s.at[0], s.at[1]) + s.height * 0.92, s.at[1]];
    const span = Math.hypot(top[0] - bottom[0], top[1] - bottom[1], top[2] - bottom[2]);
    const colour = rgbOf(hueOf(key));
    const warm = mixRgb(colour, rgbOf(L.warm), L.warmth);
    // sideways: across the string's own line, level
    const across = Math.hypot(top[0] - bottom[0], top[2] - bottom[2]) || 1;
    const side = [-(top[2] - bottom[2]) / across, (top[0] - bottom[0]) / across];
    for (let k = 0; k < STRINGS.lights; k++) {
      const t = 1 - k / (STRINGS.lights - 1); // 1 at the top
      const bow = 4 * t * (1 - t);
      const sag = STRINGS.sag * span * bow;
      const run = Math.exp(-((t - phase) ** 2) / 0.006);
      const lantern = k >= L.first && (k - L.first) % L.every === 0 && k < STRINGS.lights - 1;
      const sway = (lantern ? lagged * W.lanterns : swung) * W.amp * span * bow;
      const level = lit * (0.4 + 0.6 * run * (1 - 0.6 * q)) * (1 - 0.4 * q);
      out.push({
        at: [lerp(bottom[0], top[0], t) + side[0] * sway, lerp(bottom[1], top[1], t) - sag - (lantern ? L.hang : 0), lerp(bottom[2], top[2], t) + side[1] * sway],
        colour: lantern ? warm : colour,
        level: lantern ? Math.max(level, lit * L.glow * (1 - 0.4 * q)) : level,
        size: lantern ? L.size : STRINGS.size,
        lantern, string: key,
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The fireflies (spec 6: fireflies as lamps): FIREFLIES.count in loose swarms over the floor (firefly i in swarm i % swarms), drawn up
// Þórseðla's neck in a spiral through her solo, drifting free and wide through the quiet part.
export const FIREFLIES = { count: 240, swarms: 6, size: 0.4, colour: '#ffd98a', height: 4.5 };
// Task 14b (the owner's seventh: "Í kyrru stundinni safnast ljósflugurnar saman og fljúga upp til sjöundu stjörnunnar"): through the
// quiet part (beats 208-252) the fireflies drift free as before until `at.gather`, then come together over the floor into one slow
// turning swarm (`gather`, `ball` m round, by `at.rise`; 7 m left of the stage's line: from party_wide a swarm on it hid the moon),
// and from there, one after another over `spread` beats, each rises in
// a spiral (`turns` times round its way up, narrowing to `end` m) over `rise` beats to where the seventh star will come: SKY.seventh
// `distance` m from the quiet part's shot's lens (sky_dance), about 60 m over the floor's middle; it fades into that place and is
// gone, the last of them two beats before the last chorus, whose first beat brings them all back over the floor at once. The seventh
// star itself is not drawn (it shows only in scene 4). Reduced: they drift and fade in the same order, no swarm, no spiral.
const FLY_SEVENTH = (() => {
  const lens = SHOTS.toppur.sky_dance.position;
  const { azimuth: az, elevation: el } = SKY.seventh;
  const d = [Math.cos(el * deg) * Math.cos(az * deg), Math.sin(el * deg), Math.cos(el * deg) * Math.sin(az * deg)];
  return [0, 1, 2].map(k => lens[k] + d[k] * 70);
})();
export const FIREFLY_QUIET = {
  // (Task 17 fix 1: gather 230, rise 236, spread 7, rise 8, so the camera's story sees it: the swarm forms behind Egill and Mosi
  // from 232, the stream goes up in sky_dance from 240, the last in by 251, a beat before the chorus; it was 218, 226, 12, 12)
  at: { gather: 230, rise: 236 }, spread: 7, rise: 8, turns: 3, swirl: 0.35, ball: [1.5, 4.5], end: 0.4,
  gather: (() => { const [x, z] = floorPoint(-7, 2); return [x, GROUND + 5, z]; })(), seventh: FLY_SEVENTH, distance: 70,
};
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
/** (Task 16) Flugeðla's wake: every `every`th firefly, `behind` beats behind her on her lap, scattered `spread` m. */
export const FIREFLY_WAKE = { every: 3, behind: [0.2, 1.6], spread: 1.6 };
/** (Task 16) Grameðla's giant prints in the floor: each a foot of light in her hue (FOOT), and a step for the flowers under it. */
export const PRINT_LIGHT = { ring: 0.9, step: 1.2, up: 0.4, fill: 0.85, rim: 1.4 }; // (up 0.07 and 0.18: the floor's rise cut the discs in the stills)
// (fix 1) A giant three-toed print, in the print's own size (1 = PRINTS.size m), its heel's middle at 0 and its toes along +x: a heel
// pad, then three toes apart from it and from each other, the middle one longest, each a capsule thinning to a round tip.
export const FOOT = { heel: [0.38, 0.32], toes: [[-32, 0.52, 1.3, 0.17, 0.11], [0, 0.54, 1.5, 0.18, 0.12], [32, 0.52, 1.3, 0.17, 0.11]], rim: 0.05, reach: [-0.5, 1.7, 0.95] };
const THOR = rgbOf(hueOf('thorsedla'));
const GRAM = rgbOf(hueOf('gramedla'));
const PRINTS_STEP_RADIUS = 3.2; // m: a step's pool round a giant print's heel
// (fix 1) The prints' light: a flat square a print, its fragment drawing FOOT (a signed distance: the pads filled, their edge bright),
// added to the picture as the rings are; one draw call, drawn only while a print is lit.
const FOOT_VERTEX = /* glsl */`
attribute vec3 aCentre;
attribute vec3 aFoot; // cos, sin of its heading, its size (m)
attribute vec4 aColour;
varying vec2 vAt;
varying vec4 vColour;
uniform vec3 uReach; // back, front, side (in sizes)
void main() {
  vec2 local = vec2(mix(uReach.x, uReach.y, position.x * 0.5 + 0.5), position.z * uReach.z);
  vAt = local;
  vColour = aColour;
  vec2 along = vec2(aFoot.x, aFoot.y), across = vec2(-aFoot.y, aFoot.x);
  vec2 xz = (along * local.x + across * local.y) * aFoot.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(aCentre + vec3(xz.x, 0.0, xz.y), 1.0);
}`;
const FOOT_FRAGMENT = /* glsl */`
varying vec2 vAt;
varying vec4 vColour;
uniform vec2 uHeel;
uniform vec4 uToes[3]; // angle (rad), from, to, base radius
uniform float uTips[3];
uniform float uRim, uFill, uGlow;
float capsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
void main() {
  vec2 q = vAt / uHeel;
  float d = (length(q) - 1.0) * min(uHeel.x, uHeel.y);
  for (int i = 0; i < 3; i++) {
    vec2 dir = vec2(cos(uToes[i].x), sin(uToes[i].x));
    d = min(d, capsule(vAt, dir * uToes[i].y, dir * uToes[i].z, uToes[i].w, uTips[i]));
  }
  float fill = 1.0 - smoothstep(-uRim * 0.5, uRim * 0.5, d);
  float rim = exp(-(d / uRim) * (d / uRim));
  float light = (uFill * fill + uGlow * rim) * vColour.a;
  if (light < 0.004) discard;
  gl_FragColor = vec4(vColour.rgb * light, 0.0);
}`;
function createPrintLight(world, capacity = 3) {
  const square = new THREE.BufferGeometry();
  square.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, -1, 0, 1, 1, 0, 1, 1, 0, -1], 3));
  square.setIndex([0, 1, 2, 0, 2, 3]);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = square.index;
  geometry.setAttribute('position', square.getAttribute('position'));
  const arrays = { aCentre: new Float32Array(capacity * 3), aFoot: new Float32Array(capacity * 3), aColour: new Float32Array(capacity * 4) };
  const attributes = Object.entries(arrays).map(([key, array]) => {
    const a = new THREE.InstancedBufferAttribute(array, key === 'aColour' ? 4 : 3);
    a.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(key, a);
    return a;
  });
  geometry.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    vertexShader: FOOT_VERTEX, fragmentShader: FOOT_FRAGMENT, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: {
      uReach: { value: new THREE.Vector3(...FOOT.reach) },
      uHeel: { value: new THREE.Vector2(...FOOT.heel) },
      uToes: { value: FOOT.toes.map(([a, from, to, r]) => new THREE.Vector4(a * Math.PI / 180, from, to, r)) },
      uTips: { value: FOOT.toes.map(t => t[4]) },
      uRim: { value: FOOT.rim }, uFill: { value: PRINT_LIGHT.fill }, uGlow: { value: PRINT_LIGHT.rim },
    },
  });
  material.name = 'Stage prints';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Stage prints';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  world.scene?.add(mesh);
  let count = 0;
  return {
    mesh,
    begin() { count = 0; },
    /** A print: its heel's middle, its heading (degrees, as the stands'), its size (m), colour (sRGB) and level. */
    foot(x, y, z, heading, size, r, g, b, level) {
      if (count >= capacity || !(level > 0.004)) return;
      const a = heading * Math.PI / 180;
      arrays.aCentre.set([x, y, z], count * 3);
      arrays.aFoot.set([Math.cos(a), Math.sin(a), size], count * 3);
      arrays.aColour.set([r, g, b, Math.min(1, level)], count * 4);
      count++;
    },
    end() { for (const a of attributes) a.needsUpdate = true; geometry.instanceCount = count; mesh.visible = count > 0; },
    get count() { return count; },
    dispose() { mesh.removeFromParent(); geometry.dispose(); square.dispose(); material.dispose(); },
  };
}
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
  // free, in the quiet part: wide over the whole top, slow (Task 14b: at first; then they gather and rise, see FIREFLY_QUIET)
  const q = quietAt(beat);
  const inQuiet = beat >= QUIET.startBeat && beat < QUIET_END;
  const free = inQuiet ? smooth((beat - QUIET.startBeat) / BAR) : 0; // in over the first bar; out at once on the chorus's first beat
  let gone = 1; // how much of its light is left (0: it has flown into the seventh star's place, or faded)
  if (free > 0) {
    const R = 4 + 24 * Math.sqrt(rnd(i, 6));
    const b = rnd(i, 7) * Math.PI * 2 + beat * 0.012 * (rnd(i, 8) + 0.3);
    const fx = Math.cos(b) * R, fz = Math.sin(b) * R, fy = GROUND + 2 + 9 * rnd(i, 9) + 0.6 * Math.sin(beat * 0.2 + i);
    x = lerp(x, fx, free); y = lerp(y, fy, free); z = lerp(z, fz, free);
    const Q = FIREFLY_QUIET;
    const leave = Q.at.rise + Q.spread * rnd(i, 31); // its turn to go up
    if (o.reduced) {
      gone = 1 - smooth((beat - leave) / Q.rise); // reduced: they drift and fade, in the same order, no spiral
    } else if (beat >= Q.at.gather) {
      // one slow swarm over the floor, turning
      const turn = rnd(i, 32) * Math.PI * 2 + beat * Q.swirl;
      const rh = Q.ball[0] + (Q.ball[1] - Q.ball[0]) * rnd(i, 33);
      const dy = (rnd(i, 34) - 0.5) * Q.ball[1];
      const g = smooth((beat - Q.at.gather) / (Q.at.rise - Q.at.gather));
      const [gx, gy, gz] = Q.gather;
      const p = clamp01((beat - leave) / Q.rise); // up: 0 in the swarm, 1 at the seventh star's place
      const e = p * p * (3 - 2 * p);
      const radius = lerp(rh, Q.end, e);
      const a2 = turn + Q.turns * Math.PI * 2 * e;
      const [tx, ty, tz] = Q.seventh;
      const bx = lerp(gx, tx, e) + Math.cos(a2) * radius, by = lerp(gy + dy, ty, e), bz = lerp(gz, tz, e) + Math.sin(a2) * radius;
      x = lerp(x, bx, g); y = lerp(y, by, g); z = lerp(z, bz, g);
      gone = beat >= leave + Q.rise ? 0 : 1 - smooth((p - 0.75) / 0.25);
    }
  }
  // up Þórseðla's neck in a spiral, while she plays
  const solo = soloAt(beat);
  const pull = solo?.who === 'thorsedla' ? smooth((solo.u * 12) / 1.5) * smooth(((1 - solo.u) * 12) / 1.5) : 0;
  if (pull > 0) {
    const t = fract(j / per + beat * 0.2);
    const turn = Math.PI * 2 * (t * 2.5) + s * (Math.PI / 3) + beat * 0.6;
    const radius = 1.6 * (1 - 0.45 * t);
    const { u, v } = NECK_AXIS;
    const ou = Math.cos(turn) * radius, ov = Math.sin(turn) * radius;
    let px, py, pz;
    if (o.neck?.length > 1) {
      // (Task 16) up her neck as she holds it (hatid-band.js lights().neck: world points from its base to her head), so they climb
      // with her head when it goes up into the lights
      const n = o.neck, at = t * (n.length - 1), k = Math.min(n.length - 2, Math.floor(at)), e = at - k;
      px = lerp(n[k][0], n[k + 1][0], e) + u[0] * ou + v[0] * ov;
      py = lerp(n[k][1], n[k + 1][1], e) + u[1] * ou + v[1] * ov;
      pz = lerp(n[k][2], n[k + 1][2], e) + u[2] * ou + v[2] * ov;
    } else {
      px = lerp(NECK.base[0], NECK.head[0], t) + u[0] * ou + v[0] * ov;
      py = lerp(NECK.base[1], NECK.head[1], t) + heightAt(STANDS.thorsedla.at[0], STANDS.thorsedla.at[1]) + u[1] * ou + v[1] * ov;
      pz = lerp(NECK.base[2], NECK.head[2], t) + u[2] * ou + v[2] * ov;
    }
    x = lerp(x, px, pull); y = lerp(y, py, pull); z = lerp(z, pz, pull);
  }
  // (Task 16) Flugeðla's wind (o.lap: hatid-band.js lights().lap): a third of them caught up in her wake on her lap, trailing a
  // beat and a half behind her and let go as she comes down
  const wake = o.lap && i % FIREFLY_WAKE.every === 0 ? o.lap.wind : 0;
  if (wake > 0) {
    const [wx, wy, wz] = o.lap.at(o.lap.b - FIREFLY_WAKE.behind[0] - (FIREFLY_WAKE.behind[1] - FIREFLY_WAKE.behind[0]) * rnd(i, 41));
    const spread = FIREFLY_WAKE.spread * (0.4 + rnd(i, 42));
    x = lerp(x, wx + (rnd(i, 43) - 0.5) * 2 * spread, wake);
    y = lerp(y, wy + (rnd(i, 44) - 0.5) * 1.4 * spread, wake);
    z = lerp(z, wz + (rnd(i, 45) - 0.5) * 2 * spread, wake);
  }
  const colour = pull > 0 ? mixRgb(FLY, THOR, pull * 0.6) : FLY;
  out.x = x; out.y = y; out.z = z;
  out.size = FIREFLIES.size;
  out.r = colour[0]; out.g = colour[1]; out.b = colour[2];
  out.level = partsAt(beat).fireflies * (0.7 + 0.3 * Math.sin(beat * 3 + i * 1.7)) * lerp(1, 0.9, q) * gone * finaleLight(beat);
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
  const beating = on * (SEA.base + SEA.beat * pulseAt(beat)) * (0.7 + 0.3 * energyAt(beat)) * lerp(1, SEA.quiet, quietAt(beat)) * finaleLight(beat);
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
// Task 15 (the chunk-6 rulings' 13): floorAt(beat, { feet, places }) takes the dance's real feet (hatid-dance.js feetAt: each
// { x, z, age, radius, level }, a step as old as the foot's landing, lit as the beat's pools were, exp(-4 age) of its level) and
// the places they really stand (places: { who: [x, z] }, for the hues); without them the pools stand at the stands as before.
export function floorAt(beat, { feet = null, places = null } = {}) {
  const u = clamp01((beat - FIRST_STOMP) / BAR);
  const open = u > 0 ? OPEN_MAX * smooth(u) : 0;
  const lit = partsAt(beat).floor;
  const dim = lerp(1, FLOOR_STYLE.quiet, quietAt(beat)) * finaleLight(beat);
  const pulse = lit * (FLOOR_STYLE.base + FLOOR_STYLE.beat * pulseAt(beat)) * (0.75 + 0.25 * energyAt(beat)) * dim;
  const steps = [];
  if (lit > 0 && feet) {
    for (const f of feet) steps.push([f.x, f.z, f.radius, lit * STEP.level * f.level * Math.exp(-4 * f.age) * dim, f.age]);
    const last = STOMPS.findLast(b => b <= beat);
    if (last !== undefined && beat - last < 1) steps.push([FLOOR_FROM[0], FLOOR_FROM[1], STEP.stomp.radius, lit * STEP.stomp.level * Math.exp(-STEP.stomp.fade * (beat - last)), beat - last]);
  } else if (lit > 0) {
    for (const who of STEP.on) {
      const [x, z] = STANDS[who].at;
      steps.push([x, z, who === 'egill' ? STEP.radius * 0.6 : STEP.radius, lit * STEP.level * pulseAt(beat) * dim, fract(beat)]);
    }
    const last = STOMPS.findLast(b => b <= beat);
    if (last !== undefined && beat - last < 1) steps.push([FLOOR_FROM[0], FLOOR_FROM[1], STEP.stomp.radius, lit * STEP.stomp.level * Math.exp(-STEP.stomp.fade * (beat - last)), beat - last]);
  }
  const friends = Object.entries(STANDS).map(([who, { at }]) => [...(places?.[who] ?? at).slice(0, 2), FLOOR_HUES[who]]);
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
  const tint = PARTY_LIGHT.tint * on * (1 - q) * dieAt(beat); // (Task 17) back to the night as the chord's lights die
  const dark = PARTY_LIGHT.quiet * q;
  const solo = soloAt(beat);
  const hue = solo ? hueOf(solo.who) : HUES[SECTION_HUE[sectionOf(beat)] ?? 'thorsedla'];
  return {
    parts: [[PARTY_LOOKS.night, 1 - tint - dark], [PARTY_LOOKS.tint(hue), tint], [PARTY_LOOKS.dark, dark]],
    lift: reduced ? 0 : liftAt(beat),
  };
}

// ---------------------------------------------------------------------------------------------
// The moon dances (Task 14b, the owner's fifth: "Tunglið dansar: vaggar hattinum í takt og opnar munninn með kórnum"). moonAt(beat,
// base) is the moon's pose in the party: `base` is what the festival's acts make of it (engine/moon-face.js moonPose: the peek, the
// smile, the toot, which stay), and MOON_MOVES, in order, each (beat, pose) -> pose, put the dance over it: the hat bobs on every
// beat (tipped forward MOON_DANCE.bob degrees and lifted `lift` radii, at once on the beat and down by the next), it rocks a little
// with the bar (`rock` degrees one way on the bar's second beat, the other on its fourth), it opens its mouth on the beat ("o") and
// shuts it between while the choir sings (from its entry, beat 72, but not in the quiet part), unless an act has the mouth, and it
// blinks every 3 to 6 seconds of the song. All of it calm (`quiet` of itself) in the quiet part. Chunk 6 adds its moves to
// MOON_MOVES (after these): the roar knocking the hat askew and the hand fixing it (as moonPose's 'askew' and 'fixHat' do, from the
// roar cues' beats), and the slow rock in the quiet part (a move that scales `rock` by quietAt); nothing else changes.
export const MOON_DANCE = { bob: 7, lift: 0.08, rock: 3, open: 0.4, quiet: 0.3 };
const QUIET_END = QUIET.startBeat + QUIET.beats;
const choirSings = beat => entered('choir', beat) > 0 && !(beat >= QUIET.startBeat && beat < QUIET_END) && beat < END_BEAT;
const danceOn = beat => smooth(beat / BAR) * (beat < END_BEAT ? 1 : 0) * lerp(1, MOON_DANCE.quiet, quietAt(beat));
/** On the beat, eased up over its first tenth, down by its middle and still till the next. */
const onBeat = beat => { const u = fract(beat); return u < 0.1 ? smooth(u / 0.1) : Math.max(0, 1 - smooth((u - 0.1) / 0.4)); };
export const MOON_MOVES = [
  function hatBob(beat, pose) {
    const k = onBeat(beat) * danceOn(beat);
    return { ...pose, hat: (Number(pose.hat) || 0) + MOON_DANCE.bob * k, hatLift: Math.min(MOON_HAT_LIFT, (Number(pose.hatLift) || 0) + MOON_DANCE.lift * k) };
  },
  function barRock(beat, pose) {
    return { ...pose, sway: (Number(pose.sway) || 0) + MOON_DANCE.rock * danceOn(beat) * Math.sin((Math.PI * 2 * beat) / BAR) };
  },
  function choirMouth(beat, pose) {
    if (!choirSings(beat) || pose.mouth !== 'smile') return pose; // an act's mouth (a grin, the blower) stays
    const u = fract(beat);
    const mouth = u < 0.06 ? 'mid' : u < MOON_DANCE.open ? 'oh' : u < MOON_DANCE.open + 0.08 ? 'mid' : 'smile';
    return { ...pose, mouth };
  },
  function blink(beat, pose) {
    return { ...pose, eye: moonPose([], beat * BEAT).eye }; // the song's own blinks, so the same beat blinks the same
  },
];
// Task 17's moves (chunk-6 ruling 4: pushed onto MOON_MOVES, one moonAt): in the quiet part it rocks slowly (`quiet.rock` degrees
// each way over `quiet.bars` bars, with the quiet part), and in the last chorus it rocks on the beat with its hand on its hat (moonPose's
// 'rock' over the chorus), the roar on each of the map's roar cues knocks the hat askew (moonPose's 'askew', on the cue) and its hand
// puts it right `fix` beats after (moonPose's 'fixHat': straight again within two bars).
export const MOON_FINALE = { quiet: { rock: 6, bars: 2 }, fix: 3 };
const ROARS = cuesIn('roar', -Infinity, Infinity).map(c => c.beat);
const CHORUS_ROCK = [{ kind: 'rock', at: CHORUS.startBeat * BEAT, seconds: (CHORD.startBeat - CHORUS.startBeat) * BEAT, bpm: SONG.bpm }];
const CHORUS_HAT = ROARS.flatMap(b => [{ kind: 'askew', at: b * BEAT }, { kind: 'fixHat', at: (b + MOON_FINALE.fix) * BEAT }]);
MOON_MOVES.push(
  function quietRock(beat, pose) {
    const q = quietAt(beat);
    if (!(q > 0)) return pose;
    const sway = MOON_FINALE.quiet.rock * q * Math.sin((Math.PI * 2 * (beat - QUIET.startBeat)) / (MOON_FINALE.quiet.bars * BAR));
    return { ...pose, sway: (Number(pose.sway) || 0) + sway };
  },
  function chorusMoon(beat, pose) {
    const t = beat * BEAT;
    const rock = moonPose(CHORUS_ROCK, t); // its sway on the beat and its hand on the hat through the chorus
    const hat = moonPose(CHORUS_HAT, t).hat; // askew from each roar, straight again after its fix
    if (!rock.sway && !hat && rock.hand.kind === 'rest') return pose;
    const hand = rock.hand.kind !== 'rest' && pose.hand?.kind === 'rest' ? rock.hand : pose.hand;
    return { ...pose, sway: (Number(pose.sway) || 0) + rock.sway, hat: (Number(pose.hat) || 0) + hat, hand };
  },
);
/**
 * (Task 17b, the owner's word of 2026-11-27: the moon up to the right) Where the moon hangs at `beat` of the party: { azimuth,
 * elevation }. It peeked over the sea of cloud at SKY.moon (scene 2, approved) and climbs to SKY.partyMoon over the intro, from
 * SKY.moonRise.from to .to, so the child sees it go up to watch the party; there before the dance (beat 72). Its way: it slides to the
 * right first (its azimuth over the first `side` of the climb), sinking back into the sea of cloud as it goes (`dip` degrees at the
 * most in the middle: only its hat shows over the cloud as it passes under Grameðla's drawing), and climbs up the right side to its
 * place (its elevation over the last `side`), every part eased at both ends. No part of it, disc, hat or hand, comes within 3 degrees
 * of a drawing's line at any beat of the climb (.tools/hatid-17b/risepath.mjs: 3.55 at the nearest; a straight way crossed a line
 * for a third of the climb, a dip of 6 put its hat on Grameðla's tail). A pure function of the beat, so a seek finds it where its
 * beat has it. With less motion it is at its party place from the start.
 */
export const MOON_RISE = { side: 0.8, dip: 12 };
export function moonPlaceAt(beat, { reduced = false } = {}) {
  const { from, to } = SKY.moonRise;
  const s = reduced ? 1 : Math.min(1, Math.max(0, (beat - from) / (to - from)));
  const ease = t => { const u = Math.min(1, Math.max(0, t)); return u * u * u * (10 + u * (6 * u - 15)); };
  const { side, dip } = MOON_RISE;
  return {
    azimuth: lerp(SKY.moon.azimuth, SKY.partyMoon.azimuth, ease(s / side)),
    elevation: lerp(SKY.moon.elevation, SKY.partyMoon.elevation, ease((s - (1 - side)) / side)) - dip * Math.sin(Math.PI * s) ** 2,
  };
}

export function moonAt(beat, base = moonPose([], beat * BEAT)) {
  let pose = { ...base, hand: { ...(base.hand ?? { kind: 'rest', u: 0 }) } };
  for (const move of MOON_MOVES) pose = move(beat, pose);
  return pose;
}

// ---------------------------------------------------------------------------------------------
// Task 17, the sky of the end (spec 6, "Kyrra stundin": "stjörnumerkin anda hægt"; "Síðasta viðlagið": "Stjörnuhröp þjóta yfir
// himininn og springa eins og flugeldar í litum vinanna. Norðurljós bylgjast með laginu yfir öllum himninum.").
// breathAt(beat): the constellations' breath in the quiet part (engine/constellations.js set's `breath`), one breath in `breath`
// beats (four bars), with the quiet part (in over its first bar, out over its last), 0 everywhere else.
export const BREATH = { beats: 4 * BAR };
export function breathAt(beat) {
  const q = quietAt(beat);
  if (!(q > 0)) return 0;
  return q * (0.5 - 0.5 * Math.cos((Math.PI * 2 * (beat - QUIET.startBeat)) / BREATH.beats));
}
// The shooting stars that burst (chunk-6 ruling 16: SKY_BURSTS, not a second FIREWORKS): on each of the map's `burst` cues a volley of
// `per` shooting stars rise out of the sea of cloud behind the stage like rockets (from `low` degrees up, each from `lean` degrees
// of azimuth off its burst), cross the sky over `cross` beats and burst together on the cue, each in a friend's hue (the six in
// turn, the volley's first one a friend on from the last's), at `at` ([azimuth, elevation]: over the stage and the drawings, in
// chorus_sky's frame at both sizes); a burst spreads `spread` degrees and fades over `last` beats. Never more than NIGHT.shooting at
// once (per 6). They are the night sky's points (engine/night-sky.js shoot), not the stage's light points. Reduced: no stars fly; each
// burst is the night sky's one soft glow where it would burst.
export const SKY_BURSTS = {
  per: 6, cross: 2, last: 3, low: 4, spread: 8, size: 1.7,
  at: [[24, 37], [31, 45], [38, 35], [45, 44], [52, 36], [58, 45]],
  lean: [-16, -9, -3, 4, 10, 16],
};
const SKY_BURST_CUES = cuesIn('burst', -Infinity, Infinity).map(c => c.beat);
export function skyBurstsAt(beat, { reduced = false } = {}) {
  const out = [];
  const { per, cross, last, low, at, lean } = SKY_BURSTS;
  SKY_BURST_CUES.forEach((cue, n) => {
    const age = beat - cue;
    if (age < (reduced ? 0 : -cross) || age >= last) return;
    for (let i = 0; i < per; i++) {
      const who = ORDER[(n + i) % ORDER.length];
      const [az, el] = at[i];
      out.push({
        from: [az + lean[i], low], to: [az, el], u: age < 0 ? 1 + age / cross : 1, burst: age < 0 ? 0 : age / last,
        colour: HUES[who], who, cue, spread: SKY_BURSTS.spread, size: SKY_BURSTS.size,
      });
    }
  });
  return out;
}
// The northern lights (engine/night-sky.js aurora): up over the last chorus's first bar, full through it, waving with the song's
// clock and surging on each bar's first beat, down over the chord (gone by its last beat). Reduced: the night sky holds them still.
export const AURORA = { level: 1, surge: 0.6, bar: 0.25 };
export function auroraAt(beat) {
  const up = smooth((beat - CHORUS.startBeat) / BAR);
  const down = 1 - smooth((beat - CHORD.startBeat) / CHORD.beats);
  const level = AURORA.level * up * down;
  const b = beat / BAR;
  const time = beat * BEAT + AURORA.surge * (Math.floor(b) + smooth(fract(b) / AURORA.bar)); // a step of the wave on each bar
  return { level: level > 1e-4 ? level : 0, time };
}

/**
 * The stage's light summed at `beat` (what the tests compare the parts by): the stones', Slóeðla's cone, the four spotlights, the
 * strings and the fireflies (each as a share of all of them lit), the floor's beat, the sea's glow, and the bursts in the air (the
 * spotlights' fireworks and the sky's shooting stars).
 */
export function stageLightAt(beat, o = {}) {
  const sum = list => list.reduce((s, v) => s + v, 0);
  const stones = sum(stoneLightsAt(beat).map(l => l.level)) / STAGE.stones;
  const spots = sum(spotsAt(beat, o).map(s => s.level)) / SPOT_FROM.length;
  const strings = stringsAt(beat, o);
  const fly = {};
  let flies = 0;
  for (let i = 0; i < FIREFLIES.count; i += 4) flies += firefliesAt(beat, i, fly, o).level;
  const fireworks = sum(fireworksAt(beat, o).map(p => p.level)) / (FIREWORKS.per * SPOT_FROM.length);
  const bursts = sum(skyBurstsAt(beat, o).map(b => (b.burst > 0 ? 1 - b.burst : 0.3 * b.u))) / SKY_BURSTS.per;
  return stones + coneAt(beat, o).level + spots + sum(strings.map(l => l.level)) / strings.length + flies / (FIREFLIES.count / 4)
    + floorAt(beat).pulse + (seaAt(beat).glow ?? 0) + fireworks + bursts;
}

// ---------------------------------------------------------------------------------------------
// The stage drawn: the stones (one instanced mesh of the game's own rock), the floor, the beams, the light points and the rings:
// five draw calls, none casting a shadow. update(beat) writes them all from the functions above and nothing else, and the sea and
// the light; state() is what it wrote (hatid.js partyFrame). With c.reduced: half the fireflies, the spotlights still, no lift.
// c: { world, top (heightAt, sea), figures (the constellations: the strings hang from their feet; optional), reduced }.
const r3 = v => Math.round(v * 1000) / 1000;
const r2 = v => Math.round(v * 100) / 100;
const RINGS = { capacity: 40, spot: 0.45, cone: 0.5, step: 0.35 }; // (Task 16: 24 + Grameðla's three prints of four discs)
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
  const glow = new THREE.InstancedBufferAttribute(new Float32Array((STAGE.stones + 1) * 4), 4); // (Task 16: and the deck)
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
  const mesh = new THREE.InstancedMesh(geometry, material, STAGE.stones + 1); // the last: Flugeðla's deck (Task 16), when there is a band
  mesh.name = 'Stage stones';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  world.scene?.add(mesh);
  return { mesh, geometry, material, glow, triangles: geometry.index.count / 3 };
}
const STONE_GLOW = { tint: 0.7, body: 0.28, edge: 1.4, low: 0.35 };

/** The stage's drawn parts, made in `world.scene` (none when it has no scene): what createStage draws and stageWarmers warms. */
function stageParts(world, { heightAt, reduced }) {
  const stones = stoneMesh(world);
  const floor = createGlowFloor(world, { heightAt, keep: [{ at: STAGE.centre, r: STAGE.radius + 1.5 }], from: FLOOR_FROM, size: FLOOR_STYLE.size, rest: FLOOR_STYLE.rest, own: FLOOR_STYLE.own, hop: !reduced });
  floor.mesh.name = 'Stage floor';
  const beams = createBeams(world, { capacity: 1 + SPOT_FROM.length, name: 'Stage beams' });
  const points = createLightPoints(world, { capacity: BUDGET.lights, name: 'Stage lights' });
  const rings = createRings(world, { capacity: RINGS.capacity, name: 'Stage rings' });
  const feet = createPrintLight(world); // (fix 1) Grameðla's giant prints
  const meshes = [stones.mesh, floor.mesh, beams.mesh ?? beams.object, points.mesh ?? points.object, rings.mesh ?? rings.object, feet.mesh].filter(Boolean);
  const dispose = () => {
    stones.mesh.removeFromParent();
    stones.geometry.dispose();
    stones.material.dispose();
    stones.mesh.dispose?.();
    floor.dispose();
    beams.dispose();
    points.dispose();
    rings.dispose();
    feet.dispose();
  };
  return { stones, floor, beams, points, rings, feet, meshes, dispose };
}

/**
 * (Task 22 fix 1) The stage's parts made again out of any scene, only for their shaders to be built before the party (hatid.js
 * warmParty: renderer.compileAsync, nothing drawn): { meshes, dispose() }. Its first frame built them, a second's stall as the song
 * began. Kept until the party's own parts draw with the same programs (a disposed material's program goes when nothing else uses it).
 */
export function stageWarmers(c) {
  const { world, top = null, reduced = false } = c;
  const parts = stageParts({ ...world, scene: null }, { heightAt: top?.heightAt ?? world.heightAt ?? (() => GROUND), reduced });
  return { meshes: parts.meshes, dispose: parts.dispose };
}

export function createStage(c) {
  const { world, top = null, reduced = false } = c;
  const heightAt = top?.heightAt ?? world.heightAt ?? (() => GROUND);
  const o = { reduced, heightAt };
  const parts = stageParts(world, { heightAt, reduced });
  const { stones, floor, beams, points, rings, feet } = parts;
  const dusk = createDusk(world);
  const flies = reduced ? FIREFLIES.count / 2 : FIREFLIES.count;
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const bug = {}; // a firefly of the frame
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

  const deckAt = STAGE.stones;
  function update(beat, { dim = 1, fly = beat } = {}) {
    const parts = partsAt(beat);
    const band = c.band?.lights ? c.band.lights(beat) : null; // (Task 16) the band's: Þórseðla's neck, Flugeðla's lap, the prints
    // the stones
    const rises = stonesAt(beat);
    STONE_PLACES.forEach((s, k) => {
      const y = heightAt(s.at[0], s.at[1]) - 0.15 - (1 - rises[k]) * (s.height + 0.4);
      position.set(s.at[0], y, s.at[1]);
      quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
      scale.set(s.width, s.height + 0.15, s.width * 0.8);
      stones.mesh.setMatrixAt(k, matrix.compose(position, quaternion, scale));
    });
    // (Task 16) the deck Flugeðla scratches: a flat stone at her left wing, up with her, lit in her hue on each scratch
    const deck = c.band?.deck ?? null;
    const deckUp = deck ? deck.rise(beat) : 0;
    if (deck) {
      const [dx, dz] = deck.at;
      position.set(dx, heightAt(dx, dz) - 0.05 - (1 - deckUp) * (deck.size[1] + 0.2), dz);
      quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -deck.yaw);
      scale.set(deck.size[0], deck.size[1] + 0.05, deck.size[2]);
    } else { position.set(0, -50, 0); quaternion.identity(); scale.set(0, 0, 0); }
    stones.mesh.setMatrixAt(deckAt, matrix.compose(position, quaternion, scale));
    stones.mesh.instanceMatrix.needsUpdate = true;
    if (deck) { linear.set(deck.colour); stones.glow.setXYZW(deckAt, linear.r, linear.g, linear.b, deck.glow(beat) * deckUp); }
    const stoneLights = stoneLightsAt(beat);
    stoneLights.forEach((l, k) => {
      linear.set(l.colour);
      stones.glow.setXYZW(k, linear.r, linear.g, linear.b, l.level * rises[k]);
    });
    stones.glow.needsUpdate = true;
    // the floor
    const f = floorAt(beat, c.dance?.feetAt ? { feet: c.dance.feetAt(beat), places: c.dance.places() } : undefined);
    // (Task 16) Grameðla's giant prints: a step under each for the flowers to jump on (as old as it is)
    for (const p of band?.prints ?? []) if (p.level > 0.003) f.steps.push([p.at[0], p.at[1], PRINTS_STEP_RADIUS, p.level * PRINT_LIGHT.step, Math.max(0, p.age)]);
    floor.set(f);
    // the beams and the light on the ground
    beams.begin();
    rings.begin();
    points.begin();
    const cone = coneAt(beat, o);
    const spots = spotsAt(beat, o);
    for (const b of [cone, ...spots]) {
      if (!(b.level > 0)) continue;
      beams.beam(b.from, b.to, b.width, ...b.colour, b.level * dim);
      rings.disc(b.to[0], b.to[1] + 0.06, b.to[2], b.width / 2 + 1, ...b.colour, b.level * dim * (b === cone ? RINGS.cone : RINGS.spot));
    }
    const floorRgb = rgbOf(f.colour);
    for (const [x, z, radius, level] of f.steps) rings.disc(x, heightAt(x, z) + 0.06, z, radius * 0.75, ...floorRgb, level * dim * RINGS.step);
    feet.begin();
    for (const p of band?.prints ?? []) {
      if (!(p.level > 0.003)) continue;
      const [x, z] = p.at;
      feet.foot(x, heightAt(x, z) + PRINT_LIGHT.up, z, p.heading, p.size, ...GRAM, p.level * PRINT_LIGHT.ring);
    }
    feet.end();
    rings.end();
    beams.end();
    // the light points: the spotlights' swarms, the strings, the fireflies
    let swarms = 0;
    spots.forEach((s, k) => {
      const level = dim * parts.spots * (0.35 + 0.65 * spotGate(beat)) * (reduced ? 1 + burstFlash(beat) : 1);
      for (let j = 0; j < SPOTS.swarm; j++) {
        const i = k * SPOTS.swarm + j;
        const a = rnd(i, 11) * Math.PI * 2 + beat * (0.5 + 0.5 * rnd(i, 12));
        const r = 0.4 + 1.2 * rnd(i, 13);
        points.add(s.from[0] + Math.cos(a) * r, s.from[1] + (rnd(i, 14) - 0.5) * 1.4, s.from[2] + Math.sin(a) * r, 0.45, ...FLY, level * (0.7 + 0.3 * Math.sin(beat * 4 + i)));
        if (level > 0.003) swarms++;
      }
    });
    let fireworks = 0;
    for (const p of fireworksAt(beat, o)) { points.add(...p.at, p.size, ...p.colour, p.level * dim, 0); fireworks++; }
    const lights = stringsAt(beat, { ...o, feet: feetOf() ?? undefined });
    let strings = 0;
    for (const l of lights) { points.add(...l.at, l.size, ...l.colour, l.level * dim); if (l.level > 0.003) strings++; }
    let fireflies = 0;
    for (let i = 0; i < flies; i++) {
      firefliesAt(fly, i, bug, band ? { ...o, neck: band.neck, lap: band.lap } : o);
      points.add(bug.x, bug.y, bug.z, bug.size, bug.r, bug.g, bug.b, bug.level);
      if (bug.level > 0.003) fireflies++;
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
      light: r3(stageLightAt(beat, o) * dim), // (Task 17) all of it summed; (Task 18) at rest, dimmed
      dim: r3(dim),
      counts: { points: points.count, fireflies, strings, swarms, fireworks, beams: beams.count, rings: rings.count },
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
    /**
     * (Task 18) After the song, the stage at rest: as it stood on `beat` (the last chord's), its beams, pools and lights at `level`
     * of that (scene 4: a third), its fireflies drifting on at `fly` (a beat that goes on with the scene's clock).
     */
    rest(level, beat, fly = beat) { update(beat, { dim: Math.max(0, Math.min(1, level)), fly }); },
    state: () => (now ? structuredClone(now) : null),
    /** The stage's own triangles: the stones', the floor's (a test's, the bench's). */
    get triangles() { return stones.triangles * (STAGE.stones + (c.band?.deck ? 1 : 0)) + (floor.mesh.geometry.index.count / 3) * floor.mesh.geometry.instanceCount; },
    parts: { stones, floor, beams, points, rings, dusk },
    dispose() {
      dusk.restore();
      if (top?.sea) {
        if (seaTouched) restSea();
        top.sea.ripples?.([]);
      }
      parts.dispose();
    },
  };
}
