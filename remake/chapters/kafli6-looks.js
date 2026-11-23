// Chapter 6's light as one evening (the owner's F1 reports 1 and 10 of 2026-11-23: "það var þegar rökkur eftir lagið ... má ekki verða
// bjart aftur", "passa lýsingu á öllum kafla eftir slóeðlu lag"; and his word on the stills the same day: "það á ekki að vera alveg
// nótt alveg frá slóeðlu, heldur næstum, svo kemur sólsetur efst á fjalli í sér senu"). Chapter 5 ends in the calm night after
// Slóeðla's song (kafli5-show-score.js LOOKS.night, laid over the golden afternoon by engine/show/dusk.js); chapter 6 is NEARLY night
// from its first frame: NEAR of the way from chapter 5's dusk (its look `rose`, the dusk "as the owner knows it") to that night, a
// small step lighter than the night. It deepens a little on the slope, is a grey of the same evening in the cloud, and after her roar
// the cloud blows away to the slope's nearly-night sky with a clearer air: no gold. The sunset is the top's own scene, a cut to
// engine/looks.js LOOKS.sunset as they come up above the clouds (kafli6.js).
//
//   EVENING.pool        the pool and the ford: chapter 5's dusk and night mixed [rose, 1 - NEAR] + [night, NEAR] over the golden
//                       afternoon, to the letter as engine/show/dusk.js mixes them, in the shape engine/light-blend.js sets
//   EVENING.slope       the slope, a little later: the sun and the sky a little deeper; the footlights as they were
//   EVENING.inCloud     inside the cloud: one soft grey of the same evening, no brighter than the slope's sky (the sky's sun disc
//                       darker still), the footlights as outside, so her and Mosi's colours stand clear in it
//   EVENING.afterRoar   the cloud gone: the slope's look with a thin haze (the cloud lies round them still, below the top)
//   NEAR                how far toward chapter 5's night the evening starts, 0 (its dusk) to 1 (its night)
//   brightness(look)    { sky, sun, glow }: how bright a look's sky (its brightest broad part: zenith, horizon or haze), its sun and
//                       its sun's glow are on the screen, in relative luminance times the exposure (the tests hold the evening by it)
//   startEvening(world) the light at chapter 6's first frame: EVENING.pool (lightTo), and what light-blend.js leaves alone as the same
//                       mix has it: the pool's water, the Mosi cloud's colour and the sky's light on things. -> { depth, restore() }:
//                       restore() gives those back to the place's own at once (the cut to the top's sunset, as he approved it)
//
// The characters are seen by the footlights, as in chapter 5's dark half: the fill light's colour from below (hemi.ground), pale
// and warm, much stronger than the day's; never by a brighter sun.
import * as THREE from 'three';
import { LOOKS } from '../engine/looks.js';
import { LOOKS as SHOW_LOOKS } from './kafli5-show-score.js';
import { lightTo } from '../engine/light-blend.js';

const SUN = { azimuth: 215, elevation: 10 }; // chapter 6's one sun (engine/looks.js lowSun): the light changes, its place does not
export const NEAR = 2 / 3;
/** Chapter 5's dusk and night as engine/show/dusk.js mixes them: [[look, weight], ...]. */
export const NEARLY_NIGHT = [[SHOW_LOOKS.rose, 1 - NEAR], [SHOW_LOOKS.night, NEAR]];
/** The rivers and pools: chapter 5's night water itself (the dusk's pink in it made the river a pink ribbon from the slope). */
export const NIGHT_WATER = [[SHOW_LOOKS.night, 1]];

const hexOf = colour => `#${colour.getHexString()}`;
/**
 * Looks of chapter 5's show mixed over `base` as engine/show/dusk.js mixes them (`parts`: [[look, weight], ...], the weights 1
 * together at most): a colour moves from the base's toward each look's that names it by that look's weight, a number is the base's
 * times its shares mixed the same way; what no look names (the fog's density and glow strength, the cloud cover) stays the base's.
 */
export function showMixOver(base, parts) {
  const colour = (was, of) => {
    const value = new THREE.Color(was), from = value.clone();
    for (const [look, w] of parts) {
      const hex = of(look);
      if (!hex) continue;
      const to = new THREE.Color(hex);
      value.r += (to.r - from.r) * w; value.g += (to.g - from.g) * w; value.b += (to.b - from.b) * w;
    }
    return hexOf(value);
  };
  const number = (was, of) => was * parts.reduce((share, [look, w]) => share + (Number.isFinite(of(look)) ? (of(look) - 1) * w : 0), 1);
  return {
    sun: { ...base.sun, color: colour(base.sun.color, l => l.sun?.color), intensity: number(base.sun.intensity, l => l.sun?.intensity) },
    hemi: { sky: colour(base.hemi.sky, l => l.hemi?.sky), ground: colour(base.hemi.ground, l => l.hemi?.ground), intensity: number(base.hemi.intensity, l => l.hemi?.intensity) },
    sky: {
      ...base.sky,
      ...Object.fromEntries(['zenith', 'horizon', 'glow', 'cloud', 'cloudShade'].map(key => [key, colour(base.sky[key], l => l.sky?.[key])])),
    },
    fog: { ...base.fog, color: colour(base.fog.color, l => l.fog?.color), sunColor: colour(base.fog.sunColor, l => l.fog?.sunColor) },
    exposure: number(base.exposure, l => l.exposure),
    envIntensity: number(base.envIntensity, l => l.envIntensity),
  };
}

const pool = { ...showMixOver(LOOKS.goldenAfternoon, NEARLY_NIGHT), name: 'nearly night' };
pool.sun = { ...pool.sun, ...SUN };

/** `look` darker by `k` (0 to 1): its sun weaker and its sky and haze toward black (the glow half as much); the fill as it was. */
function deeper(look, k) {
  const toward = (hex, by = k) => `#${[1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - by)).toString(16).padStart(2, '0')).join('')}`;
  return {
    ...look,
    sun: { ...look.sun, intensity: look.sun.intensity * (1 - k) },
    sky: { ...look.sky, zenith: toward(look.sky.zenith), horizon: toward(look.sky.horizon), glow: toward(look.sky.glow, k / 2), cloud: toward(look.sky.cloud), cloudShade: toward(look.sky.cloudShade) },
    fog: { ...look.fog, color: toward(look.fog.color), sunColor: toward(look.fog.sunColor, k / 2) },
  };
}
const slope = { ...deeper(pool, 0.05), name: 'nearly night on the slope' };

// Inside the cloud: the cloud's fog and sky one grey with a breath of the evening's lilac, a little under the slope's sky; the sky's
// glow darker than that (so the sun's disc does not shine through the grey); the sun soft and the footlights as outside, pale and
// warm, so the two stand clear in the grey. The fog's density is the cloud's own (world/fjall/cloud.js holds it); its glow strength
// the old inCloud's.
const GREY = '#75727c';
const inCloud = {
  ...slope,
  name: 'in the cloud, nearly night',
  sun: { ...slope.sun, color: '#c4bcd0', intensity: 0.8 },
  hemi: { sky: '#9a98ac', ground: '#eee4d4', intensity: Math.max(2.1, slope.hemi.intensity) },
  sky: { ...slope.sky, zenith: GREY, horizon: GREY, glow: '#5e5c66', cloud: '#827f8a', cloudShade: '#6c6a74' },
  fog: { ...slope.fog, color: GREY, sunColor: '#8c8698', sunStrength: LOOKS.inCloud.fog.sunStrength, density: LOOKS.inCloud.fog.density },
};

// After her roar: the slope's nearly-night sky again, the air clearer (the thin haze of engine/looks.js afterRoar, its density only)
const afterRoar = { ...slope, fog: { ...slope.fog, density: LOOKS.afterRoar.fog.density }, name: 'after the roar' };

export const EVENING = { pool, slope, inCloud, afterRoar };

// ---- how bright a look is on the screen -----------------------------------------------------------------------------------

const linear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** The relative luminance of an sRGB hex colour. */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => linear(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** How bright `look`'s sky (its brightest broad part), sun and glow are on the screen. */
export function brightness(look) {
  const exposure = look.exposure ?? 1;
  return {
    sky: exposure * Math.max(luminance(look.sky.zenith), luminance(look.sky.horizon), luminance(look.fog.color)),
    sun: exposure * look.sun.intensity * luminance(look.sun.color),
    glow: exposure * luminance(look.sky.glow),
  };
}

// ---- the first frame ------------------------------------------------------------------------------------------------------

/**
 * What engine/light-blend.js leaves alone, held at what it was and at the evening's mix: the pool's water colours, the Mosi cloud's
 * colour and the sky's light on things. engine/show/dusk.js would write back every light it holds each time it mixes, the sky's too,
 * over the looks this chapter eases to; this holds these three only.
 */
function holdRest(world) {
  const parts = [];
  const colour = (value, of, mix = NEARLY_NIGHT) => {
    if (!value?.isColor) return;
    const was = value.clone(), to = was.clone();
    for (const [look, w] of mix) {
      const hex = of(look);
      if (!hex) continue;
      const c = new THREE.Color(hex);
      to.r += (c.r - was.r) * w; to.g += (c.g - was.g) * w; to.b += (c.b - was.b) * w;
    }
    parts.push({ value, was, to });
  };
  const water = world.forest?.materials?.water?.uniforms;
  for (const [name, key] of [['uHorizon', 'horizon'], ['uZenith', 'zenith'], ['uDeep', 'deep'], ['uGlint', 'glint']]) colour(water?.[name]?.value, look => look.water?.[key], NIGHT_WATER);
  colour(world.scene?.getObjectByName?.('MosiCloud')?.material?.color, look => look.mosiCloud);
  const scene = world.scene && Number.isFinite(world.scene.environmentIntensity) ? world.scene : null;
  const env = scene ? { was: scene.environmentIntensity, to: pool.envIntensity } : null;
  return weight => {
    for (const { value, was, to } of parts) value.copy(was).lerp(to, weight);
    if (env) scene.environmentIntensity = env.was + (env.to - env.was) * weight;
  };
}

/** The light at chapter 6's first frame (see the header). */
export function startEvening(world) {
  lightTo(world, pool);
  const rest = holdRest(world);
  let depth = 1;
  rest(depth);
  return {
    get depth() { return depth; },
    restore() {
      if (depth > 0) rest(depth = 0);
    },
  };
}
