// The festival's light from the sunset to the party's night (spec §3: the light's four stages, "sólsetur ... rauðgult ... blátt ...
// dökkblátt"; the plan's Task 7). One sun for all of it, where the top's sunset has it (azimuth 215, elevation 10: engine/looks.js
// LOOKS.sunset, hatid-route.js SKY.sun): the light changes, its place does not. The sun's face sinks under the sea of cloud by its
// own drop (engine/sun-face.js drop, s.sun.drop), not by moving the light.
//
//   SUNSET           { under, seconds }: the degrees that take the sun's whole face, its hands and cap under the sea's horizon from the farewell shots
//                    (lineup_sun, sun_faces), and the seconds it takes to sink (first values)
//   HATID_LOOKS      { sunset, red, blue, dark, night }, each with every field LOOKS.morning has, in the shape engine/light-blend.js
//                    sets:
//     sunset         the top's sunset as chapter 6 leaves it (LOOKS.sunset)
//     red            the gold gone red: the sun's light at 0.6 of the sunset's, the sky's gold to red, the fog's sun still on
//     blue           the sky blue (the blue hour): the sun's light at 0.2, the fog's sun gone
//     dark           deep blue, the fog #16204a: the sun's light 0.12 and blue, a rim on a silhouette, the fill 0.25 (spec §3:
//                    "vinirnir eru skuggamyndir með ljósrönd")
//     night          the party's base: chapter 5's night colours (kafli5-show-score.js LOOKS.night, copied here so nothing of
//                    chapter 5's score is loaded: the plan's departures; hatid-looks.test.mjs holds them to it), bright and warm,
//                    exposure 1.0, the fill 0.8
//   lookAt(u)        a look, u 0 (sunset) to 3 (dark), blended in between (engine/looks.js blendLooks); held to 0 to 3
//
// The fog's own sun (engine/fog.js) is compiled into every shader from the chapter's first look and stays; what a look can fade is
// the sky dome's fog band toward the sun (fog.sunStrength), which every look after `red` has at 0.
import { LOOKS, blendLooks } from '../engine/looks.js';

// under: the first whole degree at which the face, its hands and its nightcap's top (1.85 radii over the face's middle) are all under
// from sun_faces and both lineup_sun frames (ruling 10 of chunk 3; hatid-looks.test.mjs finds it)
export const SUNSET = { under: 16, seconds: 14 };

const base = LOOKS.sunset;
const SUN = { azimuth: base.sun.azimuth, elevation: base.sun.elevation };
const look = (name, { sun, hemi, sky, fog, exposure, envIntensity }) => ({
  name: `hátíð: ${name}`,
  sun: { ...SUN, ...sun },
  hemi,
  sky: { cloudCover: base.sky.cloudCover, ...sky },
  fog: { density: base.fog.density, heightFalloff: base.fog.heightFalloff, ...fog },
  exposure,
  envIntensity,
});

const sunset = { ...base, name: 'hátíð: sunset' };

const red = look('red', {
  sun: { color: '#ff6a48', intensity: 0.6 * base.sun.intensity },
  hemi: { sky: '#a08cc0', ground: '#4a3832', intensity: 0.45 },
  sky: { zenith: '#3c4a8e', horizon: '#e8785e', glow: '#ff7a50', cloud: '#f0a088', cloudShade: '#76607e' },
  fog: { color: '#a8808a', sunColor: '#f07a58', sunStrength: base.fog.sunStrength },
  exposure: base.exposure, envIntensity: 0.6,
});

const blue = look('blue', {
  sun: { color: '#7a86d0', intensity: 0.2 * base.sun.intensity },
  hemi: { sky: '#6a78b8', ground: '#3a3448', intensity: 0.35 },
  sky: { zenith: '#1a2a66', horizon: '#4a62a6', glow: '#8a7ab8', cloud: '#56609a', cloudShade: '#2a3264' },
  fog: { color: '#3e4c84', sunColor: '#5a64a0', sunStrength: 0 },
  exposure: 1, envIntensity: 0.5,
});

const dark = look('dark', {
  sun: { color: '#4a5ab8', intensity: 0.12 * base.sun.intensity },
  hemi: { sky: '#8a9ae8', ground: '#161c34', intensity: 0.25 }, // a pale sky over the ground, so it still reads as ground (ruling 5)
  sky: { zenith: '#060a24', horizon: '#1c2858', glow: '#30407a', cloud: '#1c2650', cloudShade: '#0c1230' },
  fog: { color: '#16204a', sunColor: '#22305e', sunStrength: 0 },
  exposure: 1, envIntensity: 0.35,
});

// chapter 5's night (kafli5-show-score.js LOOKS.night), its colours to the letter
const SHOW_NIGHT = {
  sun: '#c0b4e8', hemi: { sky: '#4a5cae', ground: '#f0e4d0' },
  sky: { zenith: '#0a0c2c', horizon: '#5a4a8c', glow: '#ffc8a0', cloud: '#6a5ea0', cloudShade: '#181840' },
  fog: { color: '#3a3470', sunColor: '#7a6ab4' },
};
const night = look('night', {
  sun: { color: SHOW_NIGHT.sun, intensity: 0.8 },
  hemi: { ...SHOW_NIGHT.hemi, intensity: 0.8 },
  sky: SHOW_NIGHT.sky,
  fog: { ...SHOW_NIGHT.fog, sunStrength: 0 },
  exposure: 1, envIntensity: 0.4,
});

export const HATID_LOOKS = { sunset, red, blue, dark, night };

const STAGES = [sunset, red, blue, dark];
/** The light `u` of the way through the dusk: 0 the sunset, 1 red, 2 blue, 3 dark, blended in between; held to 0 to 3. */
export function lookAt(u) {
  const at = Math.min(STAGES.length - 1, Math.max(0, Number(u) || 0));
  const i = Math.min(STAGES.length - 2, Math.floor(at));
  const k = at - i;
  if (k <= 0) return { ...STAGES[i] };
  if (k >= 1) return { ...STAGES[i + 1] };
  return { ...blendLooks(STAGES[i], STAGES[i + 1], k), name: `hátíð: dusk ${at.toFixed(2)}` };
}
