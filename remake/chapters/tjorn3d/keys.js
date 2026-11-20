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
  murk: { tone: '#2c5a55', deep: 0.42, density: 0.115 }, // per metre of ray under the water (murk.js); the tone is the water's teal, dimmed
};

// The lily plants (the forest's own 'waterLily': a few pads and a flower each), where they float in every key: at the sides, clear of
// the middle where she comes up. `scale` is the plant's (2 makes pads 1 to 2 cm across on the table).
export const LILIES = [
  { at: [-7.4, 3.9], variant: 2, scale: 2.0 }, // the frog's (this variant has no flower: its middle pad is free)
  { at: [7.9, 2.9], variant: 0, scale: 2.0 }, // the butterfly's (one flower, on its middle pad)
  { at: [-6.6, -3.9], variant: 1, scale: 2.2 },
  { at: [7.3, -4.4], variant: 4, scale: 1.8 },
];
export const FROG = { lily: 0, length: 1.3, heading: 60 }; // cm long on the table, on the first pad of its lily
export const BUTTERFLY = { lily: 1, span: 1.5, heading: 200 }; // cm across its wings

// The fish: [x, y, z] cm (y under the screen is negative), heading, length in cm. Idling in place.
const CALM_FISH = [
  { at: [-3.2, -2.2, 1.4], heading: 20, size: 1.6 },
  { at: [4.1, -4.0, -1.6], heading: 160, size: 2.2 },
  { at: [0.6, -6.5, 3.0], heading: 250, size: 1.4 },
  { at: [-5.6, -8.0, -1.0], heading: 80, size: 2.4 },
  { at: [2.2, -1.4, -4.2], heading: 300, size: 1.2 },
  { at: [8.4, -5.6, 0.4], heading: 120, size: 1.8 },
];
// ...and getting out of her way: the same fish nearer the edges, their noses outward
const FLED_FISH = [
  { at: [-8.6, -2.0, 3.2], heading: 150, size: 1.6 },
  { at: [9.2, -3.4, -3.4], heading: 320, size: 2.2 },
  { at: [5.4, -5.0, 5.4], heading: 60, size: 1.4 },
  { at: [-9.4, -6.4, -3.6], heading: 215, size: 2.4 },
  { at: [-3.8, -1.2, -5.8], heading: 250, size: 1.2 },
  { at: [10.2, -5.0, 2.4], heading: 20, size: 1.8 },
];

/**
 * The keys, in order. `her`: where her root is ([x, z]), her way, how far her root is under the surface (`sink`, cm) or what is
 * to stand how high (`rise`: { of: 'head' | 'all', cm }, which settles the sink), `pitch` (degrees her whole body is tipped nose
 * up), `clip`, `swim` (the tail's wave), `look` ('eye': her head turned to the viewer's eyes), `strike` (a point her snout
 * reaches for), `jaw` (degrees open), and `centre`: her picture over the surface (with whatever `with` names) is centred on the
 * page between top and bottom. `says` names the number the label gives. `rings` are [x, z, strength, every s, first at s] (cm; from
 * where her neck cuts the surface when `ringsOn` is 'neck'; a ring lives 2.6 s, so none comes oftener), `bubbles` are bursts:
 * [x, z, cm under the surface they start, every s, first at s]. Both go by the water's clock alone.
 */
export const KEYS = [
  {
    id: '1', name: 'Kyrr tjörn', says: 'top',
    her: null, fish: CALM_FISH, butterfly: 'lily',
    rings: [[-6.9, 4.5, 0.35, 3.1, 1.4], [3.4, 1.2, 0.3, 4.3, 1.1]],
  },
  {
    id: '2', name: 'Skugginn', says: 'under',
    her: { at: [0.5, -1.5], heading: 58, sink: 14.6, pitch: 0, clip: 'wade', pace: 0.25, swim: 0.6 },
    fish: FLED_FISH, butterfly: 'lily',
    bubbles: [[3.2, 1.6, 9, 2.6, -0.3], [1.6, 2.6, 8, 3.4, 0.7]], // over her snout
    rings: [[3.2, 1.6, 0.5, 2.6, 1.5], [1.6, 2.6, 0.4, 3.4, 2.5]], // where each burst comes up
  },
  {
    id: '3', name: 'Seglið', says: 'sail',
    her: { at: [-0.5, 1.2], heading: 14, rise: { of: 'all', cm: 3.5 }, pitch: 0, clip: 'wade', pace: 0.3, swim: 1 },
    fish: FLED_FISH, butterfly: 'lily',
    rings: [[2.6, 1.9, 0.6, 2.6, 1.5], [-3.4, 0.6, 0.45, 3.0, 0.9]],
  },
  ...[['4a', 5], ['4b', 6.5], ['4c', 8]].map(([id, cm]) => ({
    id, name: 'Höfuðið', says: 'head',
    her: { at: [0, 0], heading: 90, rise: { of: 'head', cm }, pitch: 40, clip: 'idle', look: 'eye', centre: true },
    fish: FLED_FISH, butterfly: 'lily',
    rings: [[0, 0.6, 0.7, 2.6, 1.6], [0.3, -0.8, 0.4, 3.1, 1.0]],
    ringsOn: 'neck',
  })),
  {
    id: '5', name: 'Fiskurinn', says: 'fish',
    her: { at: [-1.6, -1.2], heading: 82, rise: { of: 'head', cm: 4.4 }, pitch: 36, clip: 'idle', strike: 'fish', gap: 0.5, jaw: 6 },
    fish: FLED_FISH, butterfly: 'lily',
    jump: { at: [1.2, 5.0, 3.6], heading: 205, size: 2.5, pitch: 8, left: [3.6, 4.4] }, // the big fish at the top of its arc; where it left the water
    rings: [[3.6, 4.4, 1.2, 2.6, 1.5], [3.6, 4.4, 0.6, 2.6, 0.9], [-1.4, 0.4, 0.5, 3.0, 1.2]],
  },
  {
    id: '6', name: 'Fiðrildið', says: 'butterfly',
    her: { at: [0, 0], heading: 90, rise: { of: 'head', cm: 4 }, pitch: 30, clip: 'idle', look: 'eye', centre: true },
    fish: CALM_FISH, butterfly: 'snout',
    rings: [[0, 0.6, 0.6, 2.6, 1.7], [0.3, -1.0, 0.5, 2.9, 1.1], [-0.4, 0.2, 0.45, 3.3, 0.5]],
    ringsOn: 'neck',
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
