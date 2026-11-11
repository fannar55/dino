import * as THREE from 'three';

// A dusk that falls over a place for a while and lifts again, leaving the place's light exactly as it found it (chapter 5's music
// video: the quiet part under Slóeðla's horn; STYLE.md 6: a look changes only as a slow authored change, and this is one).
//
//   const dusk = createDusk(world);   // remembers the light as it is now
//   dusk.set(depth, lift);            // any time, any order: depth 0 (as it was) to 1 (dusk), lift 0 to 1 (a soft flash of light)
//   dusk.restore();                   // the light as it was when createDusk was called, to the last bit
//
// It dims and warms what the look set and nothing else: the sun's colour and strength (never its place: the shadows stay), the
// sky's fill, the haze's colour, the sky dome's colours, the sky in the water, the exposure and the sky's light on things. Each is
// written as a blend of what was remembered and DUSK, so set() is a function of its two numbers only and has no memory. A world
// without one of them (a test's, a capture's) is left alone there.
export const DUSK = {
  sun: { color: '#ff9a62', intensity: 0.55 }, // of the look's strength
  hemi: { sky: '#8e9fd6', ground: '#4a4036', intensity: 0.95 },
  sky: { zenith: '#26356e', horizon: '#e9976f', glow: '#ffae78', cloud: '#e0a798', cloudShade: '#5c5784' },
  fog: { color: '#8f7f98', sunColor: '#f2a078' },
  water: { horizon: '#d98c74', zenith: '#2a3a72' },
  exposure: 0.9, envIntensity: 0.7, // of the look's
};
export const LIFT = { exposure: 0.1, sun: 0.15 }; // how much brighter a whole flash is

export function createDusk(world) {
  const { sun = null, hemi = null } = world.lighting ?? {};
  const fog = world.scene?.fog ?? null;
  const sky = world.sky?.dome?.material?.uniforms ?? null;
  const water = world.forest?.materials?.water?.uniforms ?? null;
  const renderer = world.renderer && 'toneMappingExposure' in world.renderer ? world.renderer : null;
  const scene = world.scene && 'environmentIntensity' in world.scene ? world.scene : null;

  // every colour the dusk tints, with what it was and what the dusk makes it, and every number with what it was and its dusk share
  const colours = [];
  const colour = (value, to) => { if (value?.isColor) colours.push({ value, was: value.clone(), to: new THREE.Color(to) }); };
  colour(sun?.color, DUSK.sun.color);
  colour(hemi?.color, DUSK.hemi.sky);
  colour(hemi?.groundColor, DUSK.hemi.ground);
  colour(fog?.color, DUSK.fog.color);
  for (const [name, key] of [['uZenith', 'zenith'], ['uHorizon', 'horizon'], ['uGlow', 'glow'], ['uCloud', 'cloud'], ['uCloudShade', 'cloudShade']]) colour(sky?.[name]?.value, DUSK.sky[key]);
  colour(sky?.uFogColor?.value, DUSK.fog.color);
  colour(sky?.uFogSun?.value, DUSK.fog.sunColor);
  colour(water?.uHorizon?.value, DUSK.water.horizon);
  colour(water?.uZenith?.value, DUSK.water.zenith);
  const numbers = [];
  const number = (object, key, share, lift = 0) => { if (object && Number.isFinite(object[key])) numbers.push({ object, key, was: object[key], share, lift }); };
  number(sun, 'intensity', DUSK.sun.intensity, LIFT.sun);
  number(hemi, 'intensity', DUSK.hemi.intensity);
  number(renderer, 'toneMappingExposure', DUSK.exposure, LIFT.exposure);
  number(scene, 'environmentIntensity', DUSK.envIntensity);

  let depth = 0;
  let lift = 0;
  function set(toDepth, toLift = 0) {
    depth = Math.min(1, Math.max(0, toDepth));
    lift = Math.min(1, Math.max(0, toLift));
    for (const { value, was, to } of colours) {
      if (depth > 0) value.copy(was).lerp(to, depth);
      else value.copy(was);
    }
    for (const { object, key, was, share, lift: more } of numbers) {
      object[key] = depth > 0 || lift > 0 ? was * (1 + (share - 1) * depth) * (1 + more * lift) : was;
    }
  }
  return {
    set,
    get depth() { return depth; },
    get lift() { return lift; },
    /** What the dusk has hold of: how many colours and numbers (a test's). */
    get held() { return { colours: colours.length, numbers: numbers.length }; },
    restore() { set(0, 0); },
  };
}
