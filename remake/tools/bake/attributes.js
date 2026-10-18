// Which vertex attributes the mouth pass (mouth.js) carries through when it rebuilds a skin, besides the five it
// always keeps. Only those its command names, in the query's `attrs` (as three's loader names them: _PLATEROW in the
// GLB is `_platerow`), so a pass rebuilds a skin the same way whatever else its bake wrote: Kambeðla's command names her
// plate rows, and Slóeðla's bake, which also writes a plate row for the small patch on her back (quadruped-rig.js),
// rebakes without one, as her record says. An attribute the command names and the skin lacks stops the pass, so a
// mistyped name is not dropped without a word.

/** The skin attributes the pass always keeps. */
export const SKIN_ATTRIBUTES = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];

/**
 * The other attributes to carry: those `names` lists ("a,b", an array, or nothing for none), in that order, each one an
 * attribute the skin has (`attributes`, a geometry's attributes object) and not one of SKIN_ATTRIBUTES.
 */
export function carriedAttributes(attributes, names) {
  const list = (Array.isArray(names) ? names : String(names ?? '').split(',')).map(name => String(name).trim()).filter(Boolean);
  for (const name of list) {
    if (SKIN_ATTRIBUTES.includes(name)) throw new Error(`attrs: ${name} is one of the skin's own attributes, kept anyway`);
    if (!Object.hasOwn(attributes, name)) throw new Error(`attrs: the skin has no attribute ${name} (it has ${Object.keys(attributes).join(', ')})`);
  }
  return [...new Set(list)];
}
