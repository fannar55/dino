// The show round the music video (chapter 5, scene 6): the fireflies, the dusk in the quiet part, the splashes, the big numbers of
// the countdown, the glowing notes and the beat in the light. kafli5.js makes one of these as the set starts and gives it every
// frame of the set; everything here is a pure function of the dance beat (kafli5-video.js), so the rewind spools it back and
// Stoppdans freezes it.
//
// What happens when is the score's (kafli5-show-score.js: read off the set's own sections, tune and cues); this file draws it,
// every frame anew from the beat, with the engine's small tools (engine/show/): the lights in the air are one draw call of points
// (lights.js), the light on the water one of flat squares, two triangles a ring (rings.js), the dusk a tint of the look's own
// light that is put back to the last bit (dusk.js), and the number a piece of the page that takes no tap (big-number.js). It keeps
// no time and no state of its own: update() with the same beat draws the same picture, whatever came before.
//
// With less motion (c.reduced): half the fireflies at half the size, drifting only (no swarm, no burst), no beat in the light, no
// flash, the dusk half as deep, the numbers half the size and fading, the notes fading out at one end and in at the other.
// The address's `syning=0` leaves the show out (to measure what it costs).
import { CHOIR, GROUPS, WADE } from './kafli5-pool.js';
import { FAR_POOL } from './kafli4-route.js';
import {
  createFireflies, FIREFLIES, NOTES, NOTE, noteAt, notePoint, SPLASHES, SPLASH, SPLASH_AIR, dropAt, splashRingAt, countAt, duskAt, liftAt, capAt,
  energyOf, pulseAt, beatRingsAt, padOf,
} from './kafli5-show-score.js';
import { createLightPoints } from '../engine/show/lights.js';
import { createRings } from '../engine/show/rings.js';
import { createDusk } from '../engine/show/dusk.js';
import { createBigNumber } from '../engine/show/big-number.js';

const LEVEL = FAR_POOL.level;
const srgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const GOLD = srgb('#ffd56a'); // a group's note (the chapter's glow: kafli5.js GLOW)
const HERS = srgb('#ffeeb8'); // a note of her horn: paler
const WATER = srgb('#e4f3ff'); // a drop in the sun, a splash's ring
const WARM = srgb('#ffdc8a'); // the beat's rings on the water, the light under a group
const SOLID = { fly: [0.6, 0.22], note: 0.45, drop: 0.75 }; // how much a light covers what is behind it (a firefly: by day, at dusk)
const CAPACITY = { lights: 640, rings: 48 };
const ON_WATER = 0.05; // m over the water a ring lies
const lerp = (a, b, k) => a + (b - a) * k;
const put = (out, x, y, z) => { out[0] = x; out[1] = y; out[2] = z; return out; };

/**
 * The show for the chapter's state `c` (c.world, c.reduced: less motion asked for, c.aims: the groups' tap points, c.sloedla, and
 * c.sun: the scene's sun, which wears its nightcap while the dusk lasts; the owner's wish of 2026-11-11).
 * Returns { update({ beat, setBeat, frozen, rewinding, section }, dt), cue(event), dispose() }:
 *   update   every frame of the set: `beat` is the dance beat, `setBeat` the set's own, `section` the set's part now
 *   cue      every event of the set as it comes (kafli5.js onSet: sections, her lines, calls and the other cues)
 *   dispose  the set is over, or the chapter was left: the light, the sky and the screen as they were, nothing of the show left.
 *            `dispose({ dusk: true })` (the set is over and the chapter goes on) keeps the dusk and the sun's cap as they are, with
 *            no flash on them, until `day()`
 *   day      the afternoon back, and the cap off: the chapter is over or left (after either dispose; twice is once)
 */
export function createShow(c, { doc = c.world?.page ?? globalThis.document ?? null } = {}) {
  const { world } = c;
  if (world.params?.get?.('syning') === '0') return { update() {}, cue() {}, dispose() {}, day() {} };
  const reduced = Boolean(c.reduced);
  const fireflies = createFireflies({ count: reduced ? FIREFLIES.count / 2 : FIREFLIES.count, reduced });
  const lights = createLightPoints(world, { capacity: CAPACITY.lights, name: 'kafli5 show: lights' });
  const rings = createRings(world, { capacity: CAPACITY.rings, name: 'kafli5 show: rings' });
  const dusk = createDusk(world);
  const number = createBigNumber(doc);
  let disposed = false;

  // where a note starts and ends: a group's tap point (kafli5.js aims them), her crest as she holds it now
  const head = world.THREE ? new world.THREE.Vector3() : null;
  function pointOf(who, out) {
    if (who === 'crest' || who === 'sky') {
      const p = head && c.sloedla?.raw?.headPosition?.(head);
      return p ? put(out, p.x, p.y + 0.8, p.z) : put(out, WADE.at[0], LEVEL + 3.4, WADE.at[1]);
    }
    const aim = c.aims?.[`choir-${who}`];
    return aim ? put(out, aim[0], aim[1], aim[2]) : put(out, CHOIR[who].at[0], LEVEL + 1, CHOIR[who].at[1]);
  }
  /** The ground under a group, where its light lies. */
  const floors = {};
  function floorOf(group) {
    const { at, on } = CHOIR[group];
    floors[group] ??= (on === 'lilies' ? LEVEL : Math.max(world.heightAt?.(at[0], at[1]) ?? LEVEL, LEVEL)) + 0.07;
    return floors[group];
  }

  const fly = { x: 0, y: 0, z: 0, size: 0, level: 0, r: 0, g: 0, b: 0 };
  const drop = { x: 0, y: 0, z: 0, size: 0, level: 0 };
  const [a, b, p] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

  function drawFireflies(beat, energy, dark) {
    const solid = lerp(SOLID.fly[0], SOLID.fly[1], dark);
    for (let i = 0; i < fireflies.count; i++) {
      fireflies.at(i, beat, energy, fly);
      lights.add(fly.x, fly.y, fly.z, fly.size, fly.r, fly.g, fly.b, fly.level, solid);
    }
  }

  function drawNotes(beat) {
    for (const note of NOTES) {
      const now = noteAt(note, beat);
      if (!now) continue;
      const colour = note.from === 'crest' ? HERS : GOLD;
      pointOf(note.from, a);
      if (note.to === 'sky') put(b, a[0], a[1] + NOTE.climb, a[2]);
      else pointOf(note.to, b);
      if (reduced) { // no flight: it fades out where it starts and in where it ends
        const at = now.u < 0.5 ? a : b;
        lights.add(at[0], at[1], at[2], 1, ...colour, now.glow > 0 ? now.glow : Math.abs(1 - 2 * now.u), SOLID.note);
        continue;
      }
      if (now.glow > 0) { // landed: a light where it went in
        lights.add(b[0], b[1], b[2], 1.6 + 1.8 * now.glow, ...colour, now.glow, SOLID.note);
        continue;
      }
      const fade = note.to === 'sky' ? 1 - now.u ** 2 : Math.min(1, 0.4 + 4 * Math.min(now.u, 1 - now.u));
      for (let k = NOTE.tail; k >= 0; k--) { // its tail first, its head over it
        const u = now.u - k * (0.07 / note.life) * NOTE.fly;
        if (u < 0) continue;
        notePoint(note, a, b, u, p);
        const thin = 1 - k / (NOTE.tail + 1);
        lights.add(p[0], p[1], p[2], (k ? 1.1 : 2) * (0.5 + 0.5 * thin) * (note.to === 'sky' ? 1 - 0.3 * now.u : 1), ...colour, fade * thin * (k ? 0.7 : 1), SOLID.note);
      }
    }
  }

  function drawSplashes(beat) {
    const long = Math.max(SPLASH.ring, SPLASH_AIR);
    for (const splash of SPLASHES) {
      const age = beat - splash.beat;
      if (age < 0) break; // they are in order: the rest are later
      if (age >= long) continue;
      const ring = splashRingAt(splash, age);
      if (ring) rings.ring(splash.at[0], LEVEL + ON_WATER, splash.at[1], ring.radius, ring.width, ...WATER, ring.level * (reduced ? 0.5 : 1));
      for (let j = 0; j < splash.drops; j += reduced ? 2 : 1) {
        if (!dropAt(splash, j, age, drop)) continue;
        lights.add(drop.x, LEVEL + drop.y, drop.z, drop.size * (reduced ? 0.5 : 1), ...WATER, drop.level, SOLID.drop);
      }
    }
  }

  function drawBeat(beat, section, energy) {
    if (reduced || !section) return;
    beatRingsAt(beat, energy, (x, z, radius, width, level) => rings.ring(x, LEVEL + ON_WATER, z, radius, width, ...WARM, level));
    if (GROUPS.includes(section.feature)) { // the light under the group whose part it is, on the backbeat
      const { at, radius } = CHOIR[section.feature];
      rings.disc(at[0], floorOf(section.feature), at[1], radius * 1.25, ...WARM, 0.1 + 0.16 * pulseAt(beat));
    }
  }

  function day() {
    dusk.restore();
    c.sun?.cap?.(0);
  }

  function update(video) {
    if (disposed) return;
    const { beat, section = null } = video;
    const energy = reduced ? 0 : energyOf(section?.id);
    const dark = duskAt(beat);
    lights.begin();
    rings.begin();
    drawBeat(beat, section, energy);
    drawSplashes(beat);
    drawFireflies(beat, energy, dark);
    drawNotes(beat);
    lights.end();
    rings.end();
    dusk.set(dark * (reduced ? 0.5 : 1), reduced ? 0 : liftAt(beat));
    c.sun?.cap?.(capAt(beat)); // its nightcap comes down as the dusk falls, and stays on
    const count = countAt(beat, { reduced });
    if (count) number.show(String(count.n), count);
    else number.hide();
  }

  return {
    update,
    cue(event) {
      // a frog pushes off its lily pad as it calls: the water's own ring round the pad (the white ring and the drops where it
      // lands are the score's)
      if (disposed || event.kind !== 'call' || event.group !== 'frogs') return;
      const [x, z] = padOf(event.beat);
      world.forest?.rippleAt?.(x, z, reduced ? 0.3 : 0.6);
    },
    dispose({ dusk: kept = false } = {}) {
      if (disposed) return;
      disposed = true;
      if (kept) dusk.set(dusk.depth, 0);
      else day();
      number.dispose();
      lights.dispose();
      rings.dispose();
    },
    day,
    /** For tests and probes: the parts, as they are after the last update. */
    parts: { lights, rings, dusk, number, fireflies },
  };
}
