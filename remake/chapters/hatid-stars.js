// The festival's three taps as rules (docs/superpowers/specs/2026-11-21-stjornuhatidin-design.md, section 4), and the six stars as
// they hang on the sky (createSkyStars, the one part of this file that draws).
//
// The rules have no drawing, no sound and no clock of their own: the scene gives the machines the child's taps and the game's time;
// what happened comes back as events. Nothing can fail: a tap at the wrong moment (before `start`, after the task is over, on a lit
// star, on no star) counts nothing, brings no event and no hint, and a child who taps nothing sees it all happen by itself.
//
// createOneTap: the sun's wave and Grameðla's roar. One tap counts. Untouched, Mosi says his line again at `hint` s and it happens
// by itself at `auto` s ('go' by 'help').
// createStars: six stars, tapped in any order, several at once. Tones always rise in the order lit (SONG.motif[n]); a tone never
// sounds within TONE_GAP of the one before, so two taps in one instant give two tones TONE_GAP apart, the lower first. The help
// takes the first unlit friend in `friends`' order; after it lit one by itself the waits are halved until the child lights one.
// starTone(s, n): the n-th tone, the effects' bell (engine/audio/sfx.js starBell) at SONG.motif[n].
// createSkyStars: the six on the sky (scene 2): each the star picture of engine/scene/star-sprite.js, its gold taken out so it can
// wear a colour, dim as it arrives out of the book, glowing and bobbing as the help's hint, and at light() bursting into her colour
// as her constellation (engine/constellations.js) draws itself out from it over DRAW_SECONDS.
//
// Time is whatever number the caller gives: a game that does not pass time gives none, so no wait runs out.
import * as THREE from 'three';
import { createHelp } from './kafli6-help.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { SONG } from './hatid-song.js';
import { SKY } from './hatid-route.js';
import { Handle } from '../engine/handle.js';
import { createStarSprite } from '../engine/scene/star-sprite.js';
import { skyDirection, SKY_DISTANCE } from '../engine/night-sky.js';

export const TAP_HELP = {
  sun: { hint: 6, auto: 12 },
  roar: { hint: 6, auto: 12 },
  stars: { hint: 5, auto: 12 },
};
/** Seconds between two tones of the stars. */
export const TONE_GAP = 0.25;

// `help` may be a ladder from createHelp or its seconds ({ hint, auto }).
const ladderOf = help => (typeof help?.want === 'function' ? help : createHelp(help));

/** Events since the last call, in time order (ties keep the order they happened). */
function drain(out) {
  return out.splice(0).map((event, i) => [event, i]).sort((a, b) => a[0].time - b[0].time || a[1] - b[1]).map(([event]) => event);
}

export function createOneTap({ help = TAP_HELP.sun } = {}) {
  const ladder = ladderOf(help);
  const out = [];
  let started = false;
  let waiting = false;
  let done = false;
  let wantedAt = 0;

  const go = (time, by) => {
    out.push({ type: 'go', time, by });
    waiting = false;
    done = true;
  };
  function update(now) {
    if (!waiting) return;
    for (const level of ladder.update(now)) {
      const at = wantedAt + ladder.times[level];
      if (level === 'hint') out.push({ type: 'help', time: at, level: 'hint' });
      else if (level === 'auto') {
        ladder.done('auto');
        go(at, 'help');
      }
    }
  }

  return {
    /** The task begins at `time`: the tap is wanted. */
    start(time) {
      if (started) return;
      started = true;
      waiting = true;
      wantedAt = time;
      out.push({ type: 'want', time });
      ladder.want(time);
    },
    tap(time) {
      update(time);
      if (!started || done) return { counted: false };
      ladder.done('child');
      go(time, 'child');
      return { counted: true };
    },
    update,
    events() { return drain(out); },
    state() { return { waiting, done }; },
  };
}

export function createStars({ friends = FRIENDS.map(f => f.key), help = TAP_HELP.stars } = {}) {
  const ladder = ladderOf(help);
  const out = [];
  const lit = [];
  let started = false;
  let waiting = false;
  let done = false;
  let wantedAt = 0;
  let lastTone = -Infinity; // when the latest tone sounds

  const unlit = () => friends.filter(f => !lit.includes(f));

  function want(time) {
    waiting = true;
    wantedAt = time;
    out.push({ type: 'want', time });
    ladder.want(time);
  }
  function light(friend, time, by) {
    const n = lit.length;
    const at = Math.max(time, lastTone + TONE_GAP);
    lastTone = at;
    lit.push(friend);
    out.push({ type: 'light', time, friend, n, tone: SONG.motif[n], at, by });
    if (lit.length >= friends.length) {
      waiting = false;
      done = true;
      out.push({ type: 'all', time: at, at });
      out.push({ type: 'done', time: at });
    } else {
      want(time);
    }
  }
  function update(now) {
    if (!waiting) return;
    for (const level of ladder.update(now)) {
      const at = wantedAt + ladder.times[level];
      const friend = unlit()[0];
      if (level === 'hint') out.push({ type: 'help', time: at, level: 'hint', friend });
      else if (level === 'auto') {
        ladder.done('auto');
        light(friend, at, 'help');
        if (done) return;
      }
    }
  }

  return {
    /** The stars have arrived at `time`: the first is wanted. */
    start(time) {
      if (started) return;
      started = true;
      want(time);
    },
    /** The child tapped star `friend` (null: no star) at `time`. */
    tap(friend, time) {
      update(time);
      if (!started || done || friend === null || !friends.includes(friend) || lit.includes(friend)) return { counted: false };
      ladder.done('child');
      light(friend, time, 'child');
      return { counted: true };
    },
    update,
    events() { return drain(out); },
    state() { return { lit: [...lit], waiting, done }; },
  };
}

/** The n-th star's tone (0 the first lit): the effects' bell at SONG.motif[n], the song's own notes. */
export function starTone(s, n) {
  return s.sfx('starBell', { frequency: SONG.motif[n] });
}

/** Seconds a constellation takes to draw itself out from her star once it is lit. */
export const DRAW_SECONDS = 2.6;
/**
 * The six's look on the sky, in degrees across and light: dim as they arrive (popping in over `pop` s), the hint's glow (bigger,
 * breathing `breathHz` times a second, bobbing `bob` degrees), the burst as one is lit, and the halo it settles to round her own
 * star once her drawing is whole.
 */
const LOOK = {
  dim: { size: 2.4, level: 0.5, colour: '#d3daf0' }, pop: 0.45,
  glow: { size: 3.4, level: 0.95, swing: 0.25, breathHz: 1.3, bob: 0.35 },
  burst: { size: 5, seconds: 0.5 }, halo: { size: 2.2, level: 0.55 },
};
const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const wrap = a => ((a + 540) % 360) - 180;
/** Popped in: past its size and back (as star-sprite.js's star). */
const popIn = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

let whiteTexture = null;
/**
 * The star's own picture (star-sprite.js) with its gold taken out: each pixel its brightest channel in grey, so the sprite's colour
 * is the colour it shows (dim pale blue, then hers). None where there is no page.
 */
function whiteStar(texture) {
  if (whiteTexture || !texture?.image || typeof document === 'undefined') return whiteTexture ?? texture ?? null;
  const from = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = from.width;
  canvas.height = from.height;
  const g = canvas.getContext('2d');
  g.drawImage(from, 0, 0);
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.max(d[i], d[i + 1], d[i + 2]);
  g.putImageData(image, 0, 0);
  whiteTexture = new THREE.CanvasTexture(canvas);
  whiteTexture.colorSpace = THREE.SRGBColorSpace;
  return whiteTexture;
}

/**
 * The six stars on the sky, in `world.scene`, hung SKY_DISTANCE from the camera (as the night sky is) at `places` (SKY.stars), each
 * friend's constellation (`constellations`, a createConstellations) added at her star `span` degrees wide, held in her traced pose
 * (`still`), from `actors[friend]` (her actor) when she is lit. `sky` (the night sky) is not drawn on: its clearing is the caller's.
 *   arrive(friend)        her star is there, dim (the journal's star has landed on it)
 *   glow(friend, on)      the help's hint: bigger, breathing and bobbing, until off (a lit star does not)
 *   dim(friend)           back to dim (not a lit star)
 *   light(friend, colour, { at })  a Handle: her colour, a burst, her constellation drawn out from it over DRAW_SECONDS from `at`
 *                         (now: -Infinity lights her whole at once, the party alone); done when whole
 *   gather(placeOf, { seconds, span })  every star and drawing eased over `seconds` to `placeOf(friend)` ({ azimuth, elevation }),
 *                         the drawings to `span` degrees (the party's places: hatid-route.js partyPlace)
 *   pointOf(friend)       her tap point, live (out => out), where her star hangs from the camera
 *   state(friend)         { phase ('away' | 'dim' | 'lit'; a glowing star is 'dim'), level (its light now), colour }
 *   stars                 { friend: { sprite } } of those there
 *   update(camera, time)  this frame's look on the game's clock (each sprite also hangs itself from the camera that draws it)
 *   dispose()             leaves the scene (the constellations are the caller's to dispose)
 */
export function createSkyStars(world, { sky = null, constellations, places = SKY.stars, actors = {}, span = SKY.span } = {}) {
  void sky;
  const keys = FRIENDS.map(f => f.key);
  const items = new Map(); // friend -> { star, sprite, glow, born, lit: { colour, from, handle } | null, level, bob, place }
  let clock = null; // the time of the last update
  const v = new THREE.Vector3();
  let move = null; // gather's: { from: { friend: place }, to, spans: [a, b], span, start, seconds }
  const now = () => clock ?? 0;

  const placeOf = friend => items.get(friend)?.place ?? places[friend];
  function hang(item, camera) {
    const { azimuth, elevation } = item.place;
    skyDirection(azimuth, elevation + item.bob, v);
    item.sprite.position.copy(camera.position).addScaledVector(v, SKY_DISTANCE);
  }
  const sizeOf = degrees => 2 * SKY_DISTANCE * Math.tan(THREE.MathUtils.degToRad(degrees) / 2);

  function make(friend) {
    const star = createStarSprite({ from: new THREE.Vector3() });
    const sprite = star.object;
    const material = sprite.material;
    material.map = whiteStar(material.map);
    material.depthTest = true; // what stands in front of the sky hides it (Þórseðla's head, the stage)
    material.color.set(LOOK.dim.colour);
    material.opacity = 0;
    material.rotation = 0;
    sprite.name = `Hátíð star ${friend}`;
    sprite.renderOrder = -2; // over the night sky and the drawings
    const item = { star, sprite, glow: false, born: now(), lit: null, level: 0, bob: 0, place: { ...placeOf(friend) } };
    sprite.onBeforeRender = (renderer, scene, camera) => { hang(item, camera); sprite.updateMatrixWorld(true); };
    world.scene.add(sprite);
    items.set(friend, item);
    look(friend, item, now());
    return item;
  }

  function look(friend, item, time) {
    const age = time - item.born;
    let size = LOOK.dim.size * popIn(smooth(age / LOOK.pop));
    let level = LOOK.dim.level * smooth(age / (LOOK.pop * 0.6));
    item.bob = 0;
    if (item.lit) {
      const { from, handle } = item.lit;
      const u = (time - from) / LOOK.burst.seconds;
      const settle = smooth((time - from - LOOK.burst.seconds) / (DRAW_SECONDS - LOOK.burst.seconds));
      // the burst, then down to the halo round her own star as her drawing comes out of it
      size = u < 1 ? LOOK.dim.size + (LOOK.burst.size - LOOK.dim.size) * Math.sqrt(Math.sin(Math.PI * Math.max(0, u) * 0.5))
        : LOOK.burst.size + (LOOK.halo.size - LOOK.burst.size) * settle;
      level = u < 1 ? 1 : 1 + (LOOK.halo.level - 1) * settle;
      if (!handle.done) {
        const whole = Math.min(1, Math.max(0, (time - from) / DRAW_SECONDS));
        constellations.set(friend, { drawn: whole, level: 1 });
        if (whole >= 1) handle.finish();
      }
    } else if (item.glow !== false) {
      const t = time - item.glow;
      const breath = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * LOOK.glow.breathHz);
      size = LOOK.glow.size * (1 + 0.2 * breath);
      level = LOOK.glow.level - LOOK.glow.swing * (1 - breath);
      item.bob = LOOK.glow.bob * Math.sin(t * Math.PI * LOOK.glow.breathHz);
    }
    item.level = level;
    item.sprite.material.opacity = level;
    item.sprite.scale.setScalar(sizeOf(size));
  }

  return {
    arrive(friend) {
      if (!keys.includes(friend) || items.has(friend)) return;
      make(friend);
    },
    glow(friend, on) {
      const item = items.get(friend);
      if (!item || item.lit) return;
      item.glow = on ? (item.glow === false ? now() : item.glow) : false;
    },
    dim(friend) {
      const item = items.get(friend);
      if (!item || item.lit) return;
      item.glow = false;
    },
    light(friend, colour, { at = now() } = {}) {
      const item = items.get(friend) ?? make(friend);
      if (item.lit) return item.lit.handle;
      item.glow = false;
      item.sprite.material.color.set(colour);
      const handle = new Handle(`${friend}'s constellation`, () => constellations.set(friend, { drawn: 1, level: 1 }));
      item.lit = { colour, from: at, handle };
      const { azimuth, elevation } = item.place;
      constellations.add(friend, actors[friend], { colour, azimuth, elevation, span: move ? move.span : span, still: true });
      constellations.set(friend, { drawn: 0, level: 1 });
      return handle;
    },
    gather(to, { seconds = 3, span: wide = span } = {}) {
      const from = Object.fromEntries(keys.map(k => [k, { ...placeOf(k) }]));
      move = { from, to, spans: [move?.span ?? span, wide], span: move?.span ?? span, start: now(), seconds };
    },
    pointOf(friend) {
      return out => skyDirection(placeOf(friend).azimuth, placeOf(friend).elevation, out).multiplyScalar(SKY_DISTANCE).add(world.camera.position);
    },
    state(friend) {
      const item = items.get(friend);
      if (!item) return { phase: 'away', level: 0, colour: null };
      return { phase: item.lit ? 'lit' : 'dim', level: item.level, colour: item.lit?.colour ?? null };
    },
    get stars() { return Object.fromEntries([...items].map(([k, item]) => [k, { sprite: item.sprite }])); },
    update(camera, time) {
      clock = time;
      if (move && move.seconds >= 0) {
        const k = move.seconds > 0 ? smooth((time - move.start) / move.seconds) : 1;
        move.span = move.spans[0] + (move.spans[1] - move.spans[0]) * k;
        for (const friend of keys) {
          const a = move.from[friend], b = move.to(friend);
          const place = { azimuth: a.azimuth + wrap(b.azimuth - a.azimuth) * k, elevation: a.elevation + (b.elevation - a.elevation) * k };
          const item = items.get(friend);
          if (item) item.place = place;
          if (item?.lit) constellations.place(friend, { ...place, span: move.span });
        }
        if (k >= 1) move.seconds = -1; // there: held
      }
      for (const [friend, item] of items) {
        look(friend, item, time);
        if (camera) hang(item, camera);
      }
    },
    dispose() {
      for (const item of items.values()) {
        world.scene.remove(item.sprite);
        item.star.dispose();
      }
      items.clear();
    },
  };
}
