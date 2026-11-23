// Chapter 6's light as one evening (the owner's F1 reports 1 and 10 of 2026-11-23: "það var þegar rökkur eftir lagið ... má ekki verða
// bjart aftur", "passa lýsingu á öllum kafla eftir slóeðlu lag"). Chapter 5 ends in the calm night after Slóeðla's song (kafli5-show-
// score.js LOOKS.night, laid over the golden afternoon by engine/show/dusk.js), and chapter 6 goes on from there: its first frame is
// that look, and from the pool to the cloud the evening only deepens. Coming up out of the cloud after her roar into the last light
// above it is the one brighter moment, the story's own (kafli6.js AFTER_ROAR and the top's LOOKS.sunset, both as he picked them).
//
//   EVENING.afterSong   the pool and the ford: chapter 5's closing look, to the letter, in the shape engine/light-blend.js sets
//   EVENING.slope       the slope, later in the same dusk: the sun and the sky a little deeper; the footlights as they were
//   EVENING.inCloud     inside the cloud: one soft grey, no brighter than the dusk round it (the sky's sun disc darker still), the
//                       footlights a little softer
//   brightness(look)    { sky, sun, glow }: how bright a look's sky (its brightest broad part: zenith, horizon or haze), its sun and
//                       its sun's glow are on the screen, in relative luminance times the exposure (the tests hold the evening by it)
//   startEvening(world) the light at chapter 6's first frame: EVENING.afterSong (lightTo), and what light-blend.js leaves alone laid
//                       as chapter 5's dusk lays it (engine/show/dusk.js): the pool's water, the Mosi cloud's colour and the sky's
//                       light on things. -> { lift(seconds), restore() }: the rest eased back to the place's own (the cloud blows
//                       away: the sunset's light on things as he approved it), or at once
//
// The characters are seen by the footlights, as in chapter 5's dark half: the fill light's colour from below (hemi.ground), pale
// and warm, much stronger than the day's; never by a brighter sun.
import { LOOKS } from '../engine/looks.js';
import { LOOKS as SHOW_LOOKS } from './kafli5-show-score.js';
import { lightTo } from '../engine/light-blend.js';
import { createDusk } from '../engine/show/dusk.js';

const SUN = { azimuth: 215, elevation: 10 }; // chapter 6's one sun (engine/looks.js lowSun): the light changes, its place does not
const NIGHT = SHOW_LOOKS.night;

/**
 * A look of chapter 5's show laid over `base` as engine/show/dusk.js lays it at its whole weight: every colour the show's look names
 * is its own, and its numbers are shares of the base's; what it does not name (the fog's density and glow strength, the cloud cover)
 * stays the base's.
 */
export function showLookOver(base, look) {
  const share = (value, of) => (Number.isFinite(of) ? value * of : value);
  return {
    sun: { ...base.sun, color: look.sun?.color ?? base.sun.color, intensity: share(base.sun.intensity, look.sun?.intensity) },
    hemi: { ...base.hemi, ...pick(look.hemi, ['sky', 'ground']), intensity: share(base.hemi.intensity, look.hemi?.intensity) },
    sky: { ...base.sky, ...pick(look.sky, ['zenith', 'horizon', 'glow', 'cloud', 'cloudShade']) },
    fog: { ...base.fog, ...pick(look.fog, ['color', 'sunColor']) },
    exposure: share(base.exposure, look.exposure),
    envIntensity: share(base.envIntensity, look.envIntensity),
  };
}
const pick = (from = {}, keys) => Object.fromEntries(keys.filter(key => from[key]).map(key => [key, from[key]]));

const afterSong = { ...showLookOver(LOOKS.goldenAfternoon, NIGHT), name: 'after the song' };
afterSong.sun = { ...afterSong.sun, ...SUN };

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

// Inside the cloud: the cloud's fog and sky one grey with a breath of the dusk's lilac, as bright as the dusk's horizon and no
// brighter; the sky's glow darker than that (so the sun's disc does not shine through the grey); the sun soft and the footlights
// a little softer than outside, pale and warm, so the two stand clear in the grey. The fog's density is the cloud's own
// (world/fjall/cloud.js holds it); its glow strength the old inCloud's.
const GREY = '#4e4c55';
const inCloud = {
  ...afterSong,
  name: 'in the cloud at dusk',
  sun: { ...afterSong.sun, color: '#b4acc4', intensity: 0.7 },
  hemi: { sky: '#7a7890', ground: '#e6dccc', intensity: 2.1 },
  sky: { ...afterSong.sky, zenith: GREY, horizon: GREY, glow: '#3e3c44', cloud: '#5a5760', cloudShade: '#4a4850' },
  fog: { ...afterSong.fog, color: GREY, sunColor: '#6a6474', sunStrength: LOOKS.inCloud.fog.sunStrength, density: LOOKS.inCloud.fog.density },
};

export const EVENING = {
  afterSong,
  slope: { ...deeper(afterSong, 0.06), name: 'the slope at dusk' },
  inCloud,
};

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

/** What engine/light-blend.js leaves alone, as chapter 5's night has it, for a world whose light on things is now `env`. */
const restOf = env => ({
  water: NIGHT.water,
  mosiCloud: NIGHT.mosiCloud,
  ...(Number.isFinite(env) && env > 0 ? { envIntensity: afterSong.envIntensity / env } : {}),
});

/** The light at chapter 6's first frame (see the header). */
export function startEvening(world) {
  lightTo(world, afterSong);
  const rest = createDusk(world);
  const look = restOf(world.scene?.environmentIntensity);
  rest.mix([[look, 1]]);
  let lifting = null;
  return {
    get depth() { return rest.depth; },
    lift(seconds) {
      if (!(seconds > 0) || !world.effects) { rest.restore(); return; }
      const ease = lifting = { age: 0 };
      world.effects.add({
        label: 'evening rest',
        update: dt => {
          if (lifting !== ease) return false;
          ease.age += dt;
          const k = Math.min(1, ease.age / seconds);
          rest.mix([[look, 1 - k * k * (3 - 2 * k)]]);
          return k < 1;
        },
      });
    },
    restore() {
      lifting = null;
      rest.restore();
    },
  };
}
