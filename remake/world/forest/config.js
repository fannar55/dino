// Every look and density tunable of the forest lives here, not in the chapter. The chapter's
// layout says where things are (clearing, forest edge, path); this file says how they look.
// Colours are sRGB hex from remake/STYLE.md section 4. Distances in metres.

export const PALETTE = {
  // ground
  grassSun: '#a6b84a',
  grassTip: '#dccb6e',
  grassBase: '#55703a',
  grassShade: '#3f5f3c',
  moss: '#6f8f3c',
  clover: '#7fa046',
  soil: '#a07d52',
  soilDark: '#6e5236',
  path: '#c2a273',
  pathEdge: '#8f6f49',
  litterA: '#b8743c',
  litterB: '#d29a4a',
  // trees and plants
  canopyShadow: '#2e5544',
  canopyMid: '#3f6c4c',
  canopySun: '#7fa64c',
  canopyFar: '#3b6260',
  conifer: '#2c4f45',
  coniferTip: '#4f7a5a',
  fern: '#5f8f3e',
  fernBacklit: '#9cc25a',
  cycad: '#4e7b47',
  horsetail: '#6f9a4a',
  bark: '#6e5440',
  barkCrevice: '#4a382b',
  barkHighlight: '#8d7058',
  barkMoss: '#6d8c3d',
  // rock and wood
  rockLight: '#a39d8f',
  rockMid: '#7a756a',
  rockDark: '#57534b',
  mossCap: '#7c9a44',
  log: '#7a5a40',
  cutWood: '#d8b27a',
  // accents (clusters of 3 to 7)
  buttercup: '#f2c443',
  coral: '#ef8a5a',
  pink: '#f0a3b6',
  white: '#f6f1e4',
  violet: '#9c83d4',
  mushroomCap: '#d9573b',
  mushroomSpots: '#f7efdc',
  mushroomStem: '#ece0c4',
  berries: '#c8414a',
  shaft: '#fff1cf',
};

export const FOREST = {
  terrain: {
    radius: 260,
    rings: [[0, 34, 1.6], [34, 70, 3.2], [70, 260, 0]], // [from, to, step]; step 0 = geometric
    segments: 100,
    undulation: 0.55, // +- m, low frequency, forest only
    bumps: 0.14, // +- m, small hummocks
    clearingCalm: 0.06, // fraction of the undulation left where actors stand
    bowlRise: 1.6, // the forest floor rises gently away from the clearing (m at bowlRadius)
    bowlRadius: 60,
    maskSize: 96, // ground mask covers +-48 m around the clearing centre
    maskRes: 512,
    // Lambert albedo gain so sunlit ground lands near the palette's on-screen colours.
    albedoGain: 1.3,
  },
  path: {
    halfWidth: 0.9, // in the clearing
    halfWidthForest: 0.68,
    edgeSoft: 0.22,
    treeClear: 2.8, // trunk centre to path centreline, plus trunk radius
    plantClear: 1.5, // the brief: 1.5 m clear along the path
    rockClear: 1.6,
    fadeEnds: 3, // the path fades out over the last metres of the polyline
  },
  // Rings around the clearing centre, relative to layout values. Bands split near shadow casters
  // from far non-casters and give frustum culling something to cull.
  bands: {
    edgeOuter: 11, // edge band = forestEdge - 2 .. forestEdge + edgeOuter
    innerOuter: 25, // inner band out to forestEdge + innerOuter
    deepOuter: 44, // deep band out to forestEdge + deepOuter
    sectors: { clearing: 2, edge: 16, inner: 8, deep: 8 },
  },
  trees: {
    edgeSpacing: 7.4, // along the edge ring
    hiLobes: false, // detail-2 lobes on the big edge trees (more triangles, rounder silhouettes)
    edgeDepth: [0.6, 4.5], // trunk ring offset beyond forestEdge
    innerSpacing: 5.8,
    deepSpacing: 7.4,
    araucariaShare: { edge: 0.1, inner: 0.22, deep: 0.3 },
    treeFernShare: { inner: 0.1, deep: 0.04 },
    variants: { broadleaf: 8, araucaria: 8, treeFern: 4, cycad: 3, fern: 5, bush: 8, horsetail: 3, flowers: 8, mushrooms: 3, rock: 5, log: 1 },
  },
  understory: {
    treeFerns: 20,
    saplings: 16,
    saplingsInner: 16,
    bushesInner: 34,
    cycads: 10,
    bushes: 48,
    ferns: 110,
    horsetails: 10,
    mushrooms: 12,
    rocks: 12,
  },
  clearing: {
    flowers: 34,
    rocks: 3,
    ferns: 10,
  },
  // A fern glade is a layout with `glade: { ferns, shafts }`, both optional (gladeOf below fills them in); it has leaf shadows
  // too (leafShadow) unless its layout says `leafShadows: false`. A layout without `glade` meets none of this, and ferns 1 with
  // shafts 0 leave what the planner and the atmosphere make as it is.
  glade: {
    // ferns: times the ferns round the clearing, the rim's own (clearing.ferns) and the forest edge's (understory.ferns), which grow
    // round the clearing and not in the middle where the actors stand. They are lusher as well as more: every step of `ferns`
    // above 1 makes them `perFern` bigger, up to `max` times, and has them push the grass aside and grow behind a character (plan.js).
    ferns: 1,
    fernGrowth: { perFern: 0.3, max: 1.6 },
    shafts: 0, // light shafts that land inside the clearing
    // How a glade's shafts are drawn (atmosphere.js). ground: where one lands, as a share of the clearing radius; top: the height of
    // its upper end (m); width (m); strength: times the forest's shafts; near: the camera distance (m) over which one fades in, much
    // closer than the forest's 3 to 9 m, because in a glade the camera is always within a few metres of one; motes: glittering motes in each.
    shaft: { ground: [0.15, 0.8], top: [12, 16], width: [1.8, 3.2], strength: 5, near: [1.5, 5], motes: 12 },
  },
  // Leaf shadows on the floor (materials.js), for a layout with `leafShadows: true` and for a glade (leafShadowsOf below): clumps of
  // shade that take `strength` of the sun and drift with the wind clock at `speed` metres a second, the nearer layer with the wind,
  // the farther one across it. scale: the two layers' pattern per metre; cover: the noise values between which a clump fades in.
  // (The dapple of the shaded forest drifts at 2 cm/s: nobody sees it move.)
  leafShadow: { strength: 0.6, speed: 0.09, scale: [0.21, 0.34], cover: [0.46, 0.62] },
  grass: {
    density: 70, // blades per m2 at full density (tablet), inside the sunny clearing
    tiles: 4, // the clearing grass is a tiles x tiles grid of chunks
    clump: [3, 7], // blades per tuft
    clumpRadius: 0.07,
    height: [0.16, 0.46], // short underlayer, tall blades
    width: [0.034, 0.056],
    lean: 0.5,
    extent: 2.5, // grass reaches this far past forestEdge, thinning
    forestDensity: 0.07, // relative density of tufts on the forest floor
    pathDensity: 0.1, // on the path itself (sparse, short)
    corridorReach: 38, // grass follows the path corridor this far from the centre
    lodNear: 5, // full density closer than this to the camera
    lodFar: 19, // density reaches lodMin here
    lodMin: 0.18,
    cameraClear: 0.9, // blades shrink inside this radius around the camera
    footprint: { radius: 0.95, soft: 0.85, halfLength: 1.35 }, // flattened capsule per actor
  },
  // Wind. maxSwayDeg is how far a tree top leans at full wind: bendAt (species.js) bakes trunks, crowns, needles and tree-fern
  // trunks from it. Each beat of the theme (engine/beat.js) adds beatAmplitudeDeg on top (BEAT_SHARE below), so those reach
  // the style guide's 3 degrees with it and no more. Fronds, stems and stalks have weights of their own: with the beat they
  // too stay within 3 degrees, or, where they already leaned further before the beat, at the peak they had (LEAN in species.js).
  wind: {
    swayScale: 1.4, // metres represented by aWind.y = 1
    flutterScale: 0.12, // metres represented by aWind.z = 1
    maxSwayDeg: 2.0, // a tree top at full wind
    beatAmplitudeDeg: 1, // what the beat adds to it: maxSwayDeg + this is at most 3
  },
  shade: {
    // Fake canopy shade outside the shadow map: 1 = open sky, 0 = deep shade.
    edgeSun: 0.42,
    innerSun: 0.16,
    deepSun: 0.09,
    dapple: 0.42, // how much the dapple pattern lets through in shade
  },
  far: {
    rings: [
      { radius: 60, rows: 2, spacing: 4.4, height: [10, 14.5], crown: [5.5, 8.5], strip: [2.6, 4.4], color: ['#1d3833', '#355756'], haze: '#a9c0bb', topHaze: 0.3, araucaria: 0 },
      { radius: 84, rows: 1, spacing: 4.4, height: [10, 14], crown: [6, 9], strip: [2.8, 4.6], color: ['#2a4642', '#486a6a'], haze: '#bccfca', topHaze: 0.5, araucaria: 0 },
    ],
  },
  shafts: { count: 5, strength: 0.085, width: [1.6, 3.2] },
  motes: { count: 70, radius: 8.5, height: [0.4, 4.2] },
  butterflies: { count: 4 },
  shots: { clearance: 1.5 },
  // Distance LOD: plants carry up to three detail levels and switch at these camera distances.
  // switch: distances to a plant's mid-height point (trunks, understory). Crowns pick their level by
  // their own projected size (half-extent / distance to the crown centre): the `crownFine` largest
  // crowns in view above crownSize[0] get the fine level, others the middle one above crownSize[1].
  // The cap keeps the fine crowns' cost bounded in every frame, wherever the camera is.
  actorWarm: 0.5, // strength of the lighter, warmer ground and grass round characters (STYLE.md 5.1); halved, it read as a spotlight following Mosi in the tracking shot
  lod: { switch: [10, 32], switchSmall: [8, 22], crownSize: [0.3, 0.19], crownFine: 3 },
};

/** The beat adds this share of a part's own full-wind sway, along the wind, at the top of its pulse (forestWind in materials.js; grass.js takes the same share of a blade's bend). */
export const BEAT_SHARE = FOREST.wind.beatAmplitudeDeg / FOREST.wind.maxSwayDeg;

/**
 * The most forestWind (materials.js) bends a part before the beat, as a multiple of its `sway`, the metres it bends at full wind:
 * along the wind 0.55 + 0.45 * (0.6 + 0.25) of it (full strength, the strongest swing) and 0.22 of it sideways; the beat adds
 * BEAT_SHARE along the wind. tests/forest-sway.test.mjs keeps these numbers in step with the shader's text.
 */
export const WIND_PEAK = { along: 0.55 + 0.45 * (0.6 + 0.25), side: 0.22 };

/** Scale counts by the quality preset. */
export function scaled(count, factor) {
  return Math.max(0, Math.round(count * factor));
}

/** A layout's glade options with the defaults filled in. `on` says whether the layout is a glade at all. */
export function gladeOf(layout) {
  const given = layout.glade;
  const count = (value, fallback) => (Number.isFinite(value) && value >= 0 ? value : fallback);
  return {
    on: Boolean(given),
    ferns: count(given?.ferns, FOREST.glade.ferns),
    shafts: Math.round(count(given?.shafts, FOREST.glade.shafts)),
  };
}

/** Whether a layout has leaf shadows on its floor: its own `leafShadows` says so, else a glade has them and no other forest does. */
export function leafShadowsOf(layout) {
  return Boolean(layout.leafShadows ?? gladeOf(layout).on);
}
