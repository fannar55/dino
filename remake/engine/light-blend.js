// The light between places (chapter 6: the afternoon told by a look per place, engine/looks.js), set while the game runs. A look
// changes what a uniform or a light's own number can carry, and nothing else: the sun's colour and strength, the fill (the
// hemisphere's two colours and strength), the fog's colour and density, the sky dome's colours and its fog band's glow toward the
// sun, and the exposure. The sun's place stays (the fog's sun and its falloff are compiled into every shader: engine/fog.js), and so
// do the sky's clouds' cover and the sky's light on things. Chapter 3's haze (kafli3-lookout.js) and chapter 4's lightAt
// (kafli4-flight.js) are the models; both stay as they are.
//
//   lightTo(world, look)                 the light is the look's, now
//   easeLight(world, look, seconds)      -> Handle, done when the light is there; a newer one takes over from where the light is
//                                        (the older one is then done too), on the game clock (world.effects)
//
// A cloud that holds the fog (world/fjall/cloud.js: scene.fog.userData.heldBy) keeps its density: a look then sets the fog's colour
// only, until the cloud lets go. world.lightLook is the look the light is at or on its way to (the cloud gives the fog back to it).
// A world without one of these (a test's, a capture's) is left alone there.
import * as THREE from 'three';
import { Handle } from './handle.js';

const SKY = [['uZenith', 'zenith'], ['uHorizon', 'horizon'], ['uGlow', 'glow'], ['uCloud', 'cloud'], ['uCloudShade', 'cloudShade']];
const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/** What a look sets in this world: colours ({ value: Color, of(look) -> hex }) and numbers ({ object, key, of(look) }). */
function partsOf(world) {
  const { sun = null, hemi = null } = world.lighting ?? {};
  const fog = world.scene?.fog ?? null;
  const sky = world.sky?.dome?.material?.uniforms ?? null;
  const renderer = world.renderer && 'toneMappingExposure' in world.renderer ? world.renderer : null;
  const colours = [], numbers = [];
  const colour = (value, of) => { if (value?.isColor) colours.push({ value, of }); };
  const number = (object, key, of, held = () => false) => { if (object && Number.isFinite(object[key])) numbers.push({ object, key, of, held }); };
  colour(sun?.color, look => look.sun.color);
  number(sun, 'intensity', look => look.sun.intensity);
  colour(hemi?.color, look => look.hemi.sky);
  colour(hemi?.groundColor, look => look.hemi.ground);
  number(hemi, 'intensity', look => look.hemi.intensity);
  colour(fog?.color, look => look.fog.color);
  number(fog, 'density', look => look.fog.density, () => Boolean(fog.userData?.heldBy));
  for (const [name, key] of SKY) colour(sky?.[name]?.value, look => look.sky[key]);
  colour(sky?.uFogColor?.value, look => look.fog.color);
  colour(sky?.uFogSun?.value, look => look.fog.sunColor);
  number(sky?.uFogSunStrength, 'value', look => look.fog.sunStrength);
  number(renderer, 'toneMappingExposure', look => look.exposure);
  return { colours, numbers };
}

/** The light is `look`'s, now. */
export function lightTo(world, look) {
  const { colours, numbers } = partsOf(world);
  for (const { value, of } of colours) value.set(of(look));
  for (const { object, key, of, held } of numbers) if (!held()) object[key] = of(look);
  if (world.lightEase && !world.lightEase.done) world.lightEase.finish(); // an ease on its way somewhere else stops here
  world.lightEase = null;
  world.lightLook = look;
}

/** The light eased from where it is to `look`'s over `seconds` of the game's clock: a Handle, done when it is there. */
export function easeLight(world, look, seconds) {
  const handle = new Handle(`light to ${look?.name ?? 'a look'}`);
  const older = world.lightEase;
  if (older && !older.done) older.finish(); // a newer one takes over: whoever waited on the older goes on
  if (!(seconds > 0) || !world.effects) {
    lightTo(world, look);
    return handle.finish();
  }
  const { colours, numbers } = partsOf(world);
  const from = { colours: colours.map(({ value }) => value.clone()), numbers: numbers.map(({ object, key }) => object[key]) };
  const to = { colours: colours.map(({ of }) => new THREE.Color(of(look))), numbers: numbers.map(({ of }) => of(look)) };
  world.lightEase = handle;
  world.lightLook = look;
  // a number held meanwhile (the cloud's fog density) is eased on from where it is let go, over what is left of the ease
  const since = numbers.map(() => 0);
  let age = 0;
  world.effects.add({
    label: 'light',
    update: dt => {
      if (world.lightEase !== handle || handle.done) return false; // a newer one took over, or lightTo
      age += dt;
      const k = smooth(age / seconds);
      colours.forEach(({ value }, i) => value.copy(from.colours[i]).lerp(to.colours[i], k));
      numbers.forEach(({ object, key, held }, i) => {
        if (held()) { from.numbers[i] = object[key]; since[i] = k; return; }
        const share = since[i] < 1 ? (k - since[i]) / (1 - since[i]) : 1;
        object[key] = from.numbers[i] + (to.numbers[i] - from.numbers[i]) * share;
      });
      if (age < seconds) return true;
      world.lightEase = null;
      handle.finish();
      return false;
    },
  });
  return handle;
}
