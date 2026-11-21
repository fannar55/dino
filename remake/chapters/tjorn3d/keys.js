// Uggeðla í tjörninni, step 1: the key frames as data (chapters/tjorn3d.js stages them; the plan is
// docs/superpowers/specs/2026-11-19-uggedla-i-tjorninni-bordmynd-design.md, section 4). Pure numbers, no three.
//
// The table's frame, in real cm: x to the viewer's right, y up from the screen (the pond's surface), z toward the viewer, the
// screen's centre at 0. Headings are the game's (degrees, 0 faces +x, 90 faces +z: toward the viewer). SCALE says how many of the
// game's metres a cm of the table is: at 0.6 Uggeðla, 14 m long with her sail 7.3 m up, is 23 cm long and her sail 12 cm tall, so
// most of her is always under the surface, and a head 8 cm over the table is 4.8 m over the water.
export const SCALE = 0.6;
export const POND = {
  radius: 54, // m: the pool, far wider than any page (the bank is never in the window, over or under the water)
  bed: 15, // cm under the screen: the bottom (the plan: at most 15)
  clear: 0.34, // how much of the game's own water colour lies on the surface (its own is 0.95: nothing shows through)
  // murk.js: the water's tone (a mid-tone teal), how much of it is left at the bed, how fast a thing darkens with its depth (per
  // metre) and fades into the tone (per metre of the eye's ray under the water)
  murk: { tone: '#5a9a90', deep: 0.75, dim: 0.3, density: 0.16 },
};

/**
 * Where a thing `depth` cm under the surface must be for its picture to lie at `seen` ([x, z] on the page, cm from its centre) for
 * an eye at `eye` ({ x, y, z } cm: y its height over the table): what is under the water is seen through the page as through a
 * window, so the deeper it lies the farther from the viewer it must be to be seen at the same place. Returns [x, y, z], y negative.
 */
export function under(seen, depth, eye) {
  const k = (eye.y + depth) / eye.y;
  return [seen[0] * k - (eye.x * depth) / eye.y, -depth, seen[1] * k - (eye.z * depth) / eye.y];
}

// The lily plants (the forest's own 'waterLily': a few pads and a flower each), where they float in every key: at the sides, clear of
// the middle where she comes up. `scale` is the plant's (2 makes pads 1 to 2 cm across on the table).
export const LILIES = [
  { at: [-7.4, 3.6], variant: 2, scale: 2.6 }, // the frog's (it sits on the widest free pad of it)
  { at: [7.9, 2.9], variant: 0, scale: 2.0 }, // the butterfly's (one flower, on its middle pad)
  { at: [-6.6, -3.9], variant: 1, scale: 2.2 },
  { at: [7.3, -4.4], variant: 4, scale: 1.8 },
];
export const FROG = { lily: 0, length: 1.2, heading: 60 }; // cm long on the table
export const BUTTERFLY = { lily: 1, span: 1.5, heading: 200 }; // cm across its wings

// The fish: where its picture lies on the page ([x, z] cm, for the eye between the two), how deep it is (cm), heading, length in cm.
// Idling in place.
const CALM_FISH = [
  { seen: [-3.4, 2.6], depth: 2.2, heading: 20, size: 1.6 },
  { seen: [3.6, 1.2], depth: 4.0, heading: 160, size: 2.2 },
  { seen: [0.4, 4.6], depth: 6.5, heading: 250, size: 1.4 },
  { seen: [-4.4, -0.6], depth: 8.0, heading: 80, size: 2.4 },
  { seen: [1.8, -3.2], depth: 1.4, heading: 300, size: 1.2 },
  { seen: [7.2, -1.2], depth: 5.6, heading: 120, size: 1.8 },
];
// ...and getting out of her way: the same fish nearer the edges, their noses outward
const FLED_FISH = [
  { seen: [-8.8, 4.6], depth: 2.0, heading: 150, size: 1.6 },
  { seen: [8.6, -5.2], depth: 3.4, heading: 320, size: 2.2 },
  { seen: [9.4, 5.2], depth: 5.0, heading: 40, size: 1.4 },
  { seen: [-9.4, -1.2], depth: 6.4, heading: 190, size: 2.4 },
  { seen: [-3.6, -5.4], depth: 1.2, heading: 250, size: 1.2 },
  { seen: [3.2, -5.6], depth: 4.6, heading: 290, size: 1.8 },
];

/**
 * The keys, in order. `her`: where her root is ([x, z]), her way, how far her root is under the surface (`sink`, cm) or what is
 * to stand how high (`rise`: { of: 'head' | 'all', cm }, which settles the sink), `pitch` (degrees her whole body is tipped nose
 * up), `tuck` (1: her neck at ease, 0: folded down, lying low), `clip`, `swim` (the tail's wave), `look` ('eye': her head turned to
 * the viewer's eyes), `strike` ('fish': her snout reaches for the fish in the air and stops `gap` cm short of its side; she is put
 * where it gets there), `jaw` (degrees open), and `centre`: her picture over the surface is centred on the page between top and bottom. `says`
 * names the number the label gives. `rings` are [x, z, strength, every s, first at s] (cm on the page; a ring lives 2.6 s, so none
 * comes oftener), `neckRings` the same from where her neck cuts the surface, `snoutBubbles` are bursts of bubbles from the
 * tip of her snout, each with a ring where it comes up: [x, z from the tip, every s, first at s]. All go by the water's clock alone.
 */
export const KEYS = [
  {
    id: '1', name: 'Kyrr tjörn', says: 'top',
    her: null, fish: CALM_FISH, butterfly: 'lily',
    rings: [[-5.2, 5.6, 0.35, 3.1, 1.4], [3.4, 1.2, 0.3, 4.3, 1.1]],
  },
  {
    id: '2', name: 'Skugginn', says: 'under',
    her: { at: [0.5, -9.5], heading: 58, sink: 14.6, pitch: 0, tuck: 0, clip: 'idle', swim: 0.6 },
    fish: FLED_FISH, butterfly: 'lily',
    snoutBubbles: [[0, 0, 2.6, -0.3], [-0.9, 0.5, 3.4, 0.7]], // bursts from her snout, and a ring where each comes up
  },
  {
    id: '3', name: 'Seglið', says: 'sail',
    her: { at: [-1.0, -1.5], heading: 14, rise: { of: 'all', cm: 3.5 }, pitch: 0, tuck: 0, clip: 'idle', swim: 1 },
    fish: FLED_FISH, butterfly: 'lily',
    neckRings: [[2.8, 1.0, 1.0, 2.6, 1.5], [-3.0, -0.4, 0.8, 3.0, 0.9], [0.4, 1.3, 0.7, 3.4, 0.3]], // from the middle of where the sail cuts the surface
  },
  ...[['4a', 5], ['4b', 6.5], ['4c', 8]].map(([id, cm]) => ({
    id, name: 'Höfuðið', says: 'head',
    her: { at: [0, 5], heading: 90, rise: { of: 'head', cm }, pitch: 62, clip: 'idle', look: 'eye', centre: true },
    fish: FLED_FISH, butterfly: 'lily',
    neckRings: [[1.9, 0.3, 1.0, 2.6, 1.5], [-1.9, 0.2, 0.9, 3.1, 1.0], [0.2, 1.7, 0.9, 2.9, 0.6]], // round her, where she cuts the surface
  })),
  {
    id: '5', name: 'Fiskurinn', says: 'fish',
    her: { at: [-3.0, 0.5], heading: 48, rise: { of: 'head', cm: 5.0 }, pitch: 54, clip: 'idle', strike: 'fish', gap: 0.6, jaw: 6 },
    fish: FLED_FISH, butterfly: 'lily',
    jump: { at: [2.7, 4.5, 5.0], heading: 138, size: 2.5, pitch: 4 }, // the big fish at the top of its arc, crossing right in front of her (crosswise to her way)
    rings: [[4.2, 1.0, 1.2, 2.6, 1.5], [4.2, 1.0, 0.7, 2.6, 0.9]], // where it left the water
    neckRings: [[-1.9, 0.2, 0.9, 3.0, 1.2], [0.2, 1.7, 0.8, 2.8, 0.5]],
  },
  {
    id: '6', name: 'Fiðrildið', says: 'butterfly',
    her: { at: [0, 4], heading: 90, rise: { of: 'head', cm: 4 }, pitch: 46, clip: 'idle', look: 'eye', centre: true },
    fish: CALM_FISH.filter(f => f.depth !== 6.5), butterfly: 'snout', // the fish are back, but for the one that idles where she is
    neckRings: [[1.9, 0.3, 1.0, 2.6, 1.7], [-1.9, 0.2, 0.9, 2.9, 1.1], [0.2, 1.7, 0.9, 3.3, 0.5], [0.4, -1.6, 0.7, 3.7, 0.2]], // she is sinking: more of them
  },
];

/** The key an address asks for (`lykill=4b`; a bare 4 is 4a), or the first. */
export function keyIndex(value) {
  const asked = String(value ?? '').trim().toLowerCase();
  const exact = KEYS.findIndex(k => k.id === asked);
  if (exact >= 0) return exact;
  const first = KEYS.findIndex(k => k.id.startsWith(asked) && asked !== '');
  return first >= 0 ? first : 0;
}
