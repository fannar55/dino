import * as THREE from 'three';

// A dusk that falls over a place for a while and lifts again, leaving the place's light exactly as it found it (chapter 5's music
// video: the quiet part under Slóeðla's horn; STYLE.md 6: a look changes only as a slow authored change, and this is one). And
// more looks than the one: a show may hand it any look of the same shape, or a mix of several (chapter 5's set has a colour for
// each record: chapters/kafli5-show-score.js LOOKS).
//
//   const dusk = createDusk(world);   // remembers the light as it is now
//   dusk.set(depth, lift);            // any time, any order: depth 0 (as it was) to 1 (dusk), lift 0 to 1 (a soft flash of light)
//   dusk.mix(parts, lift);            // the same with any looks: parts is [[look, weight], ...], the weights 1 together at most
//   dusk.still();                     // the mix it has, with no flash on it
//   dusk.restore();                   // the light as it was when createDusk was called, to the last bit
//
// It dims and tints what the look set and nothing else: the sun's colour and strength (never its place: the shadows stay), the
// sky's fill and the colour that fill has from below (the footlights: what stands on the ground is lit from under by it), the
// haze's colour, the sky dome's colours, the sky in the water and the water's own colour and glitter, Mosi's cloud, the exposure
// and the sky's light on things. No light is added and none taken away: these are the two lights the place has, and uniforms. Each
// is written as a blend of what was remembered and the looks, so mix() is a function of its looks, their weights and the lift
// only and has no memory. A world without one of them (a test's, a capture's) is left alone there, and so is a thing a look does
// not name.
export const DUSK = {
  sun: { color: '#ff9a62', intensity: 0.55 }, // of the look's strength
  hemi: { sky: '#8e9fd6', ground: '#4a4036', intensity: 0.95 },
  sky: { zenith: '#26356e', horizon: '#e9976f', glow: '#ffae78', cloud: '#e0a798', cloudShade: '#5c5784' },
  fog: { color: '#8f7f98', sunColor: '#f2a078' },
  water: { horizon: '#d98c74', zenith: '#2a3a72' },
  mosiCloud: '#e2a69c', // the cloud shaped like Mosi (engine/sun-face.js), which no light falls on: tinted as the sky's clouds are
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

  // every colour a look tints, with what it was and where a look names it, and every number with what it was, where a look names
  // its share of that, and how much a flash adds
  const colours = [];
  const colour = (value, of) => { if (value?.isColor) colours.push({ value, was: value.clone(), of }); };
  colour(sun?.color, look => look.sun?.color);
  colour(hemi?.color, look => look.hemi?.sky);
  colour(hemi?.groundColor, look => look.hemi?.ground);
  colour(fog?.color, look => look.fog?.color);
  for (const [name, key] of [['uZenith', 'zenith'], ['uHorizon', 'horizon'], ['uGlow', 'glow'], ['uCloud', 'cloud'], ['uCloudShade', 'cloudShade']]) colour(sky?.[name]?.value, look => look.sky?.[key]);
  colour(sky?.uFogColor?.value, look => look.fog?.color);
  colour(sky?.uFogSun?.value, look => look.fog?.sunColor);
  colour(water?.uHorizon?.value, look => look.water?.horizon);
  colour(water?.uZenith?.value, look => look.water?.zenith);
  colour(water?.uDeep?.value, look => look.water?.deep);
  colour(water?.uGlint?.value, look => look.water?.glint);
  colour(world.scene?.getObjectByName?.('MosiCloud')?.material?.color, look => look.mosiCloud);
  const numbers = [];
  const number = (object, key, of, lift = 0) => { if (object && Number.isFinite(object[key])) numbers.push({ object, key, was: object[key], of, lift }); };
  number(sun, 'intensity', look => look.sun?.intensity, LIFT.sun);
  number(hemi, 'intensity', look => look.hemi?.intensity);
  number(renderer, 'toneMappingExposure', look => look.exposure, LIFT.exposure);
  number(scene, 'environmentIntensity', look => look.envIntensity);

  // a look as this place takes it: a colour for each colour held (null: the look leaves it as it was) and a share for each number
  const read = new Map();
  function taken(look) {
    let mine = read.get(look);
    if (!mine) {
      mine = {
        look,
        colours: colours.map(({ of }) => { const hex = of(look); return hex ? new THREE.Color(hex) : null; }),
        shares: numbers.map(({ of }) => { const share = of(look); return Number.isFinite(share) ? share : 1; }),
      };
      read.set(look, mine);
    }
    return mine;
  }

  const now = []; // the mix it has: [taken look, weight]
  let depth = 0;
  let lift = 0;
  function mix(parts, toLift = 0) {
    now.length = 0;
    depth = 0;
    for (const [look, weight] of parts) {
      const w = Math.min(1 - depth, Math.max(0, weight)); // together 1 at most
      if (!look || !(w > 0)) continue;
      now.push([taken(look), w]);
      depth += w;
    }
    lift = Math.min(1, Math.max(0, toLift));
    colours.forEach(({ value, was }, k) => {
      value.copy(was);
      for (const [{ colours: to }, w] of now) {
        if (!to[k]) continue; // this look leaves it as it was
        value.r += (to[k].r - was.r) * w;
        value.g += (to[k].g - was.g) * w;
        value.b += (to[k].b - was.b) * w;
      }
    });
    numbers.forEach(({ object, key, was, lift: more }, k) => {
      let share = 1;
      for (const [{ shares }, w] of now) share += (shares[k] - 1) * w;
      object[key] = depth > 0 || lift > 0 ? was * share * (1 + more * lift) : was;
    });
  }
  return {
    mix,
    set(toDepth, toLift = 0) { mix([[DUSK, toDepth]], toLift); },
    still() { mix(now.map(([{ look }, w]) => [look, w]), 0); },
    /** How far the light is from what it found, 0 (as it was) to 1: the looks' weights together. */
    get depth() { return depth; },
    get lift() { return lift; },
    /** What the dusk has hold of: how many colours and numbers (a test's). */
    get held() { return { colours: colours.length, numbers: numbers.length }; },
    restore() { mix([], 0); },
  };
}
