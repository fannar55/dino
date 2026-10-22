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
    variants: {
      broadleaf: 8, araucaria: 8, treeFern: 4, cycad: 3, fern: 5, bush: 8, horsetail: 3, flowers: 8, mushrooms: 3, rock: 5, log: 1,
      // the Fen's own (FEN below)
      swampConifer: 6, horsetailReed: 4, horsetailTall: 3, waterLily: 6, mossHummock: 4, deadSnag: 4,
    },
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
  // trunks from it. The theme's beat (engine/beat.js: followBeat, in wind.uBeats) sways the forest further on top of the wind, smoothly
  // and in time with the music, on waves `beatPeriods` beats long that crest on the strong beats: a tree's parts once in four beats,
  // a plant's (fronds, stems, stalks, bushes) once in two, by beatAmplitudeDeg at the crest (BEAT_SHARE below), so a tree top reaches
  // the style guide's 3 degrees there and no more; and the grass ripples every beat, its crests running down the wind rippleSpacing
  // metres apart (GRASS_BEAT_SHARE below). Fronds, stems and stalks have weights of their own: at the crest they too stay within 3
  // degrees, or, where they already leaned further before the beat, at the peak they had (LEAN in species.js).
  wind: {
    swayScale: 1.4, // metres represented by aWind.y = 1
    flutterScale: 0.12, // metres represented by aWind.z = 1
    maxSwayDeg: 2.0, // a tree top at full wind
    beatAmplitudeDeg: 1, // what the beat adds to it at the crest of its wave: maxSwayDeg + this is at most 3
    beatPeriods: { trees: 4, plants: 2, grass: 1 }, // beats from one crest of a band's wave to the next (each divides engine/beat.js's FOLD)
    rippleSpacing: 5, // m between two crests of the grass's ripple, along the wind
  },
  // Parts that move about a pivot of their own, on top of the wind (materials.js: forestPivot). batch.js bakes the pivot into every
  // vertex as aPivot (PIVOT below): for a fern the vertex's height above the plant's foot (up to `height` metres), for a flower head
  // and a mushroom its offset from the point it nods or hops about (up to `reach` metres each way). 8 bits each.
  pivot: { reach: 0.4, height: 2 },
  // Ferns lean away from a character the way the grass lies down (grass.footprint is the capsule they both use): by up to leanDeg
  // degrees about their foot where the footprint is, easing to nothing `reach` metres beyond it (for a footprint the size of
  // grass.footprint, a smaller actor's footprint has a smaller reach). A lean, not a squash. The reach is well beyond the grass's
  // own soft edge because a fern at the side of a path stands two metres off the middle of a body that wide, and is to bend.
  fernBend: { reach: 2.6, leanDeg: 50 },
  // On each strong beat of the theme (engine/beat.js: danceOf, in wind.uDance) the flowers and mushrooms of these bands (planner
  // bands, plan.js) dance: a flower head nods up to nodDeg degrees about its stem's tip, toward the way it faces, and a mushroom
  // hops `hop` metres and squashes by `squash` of its height. This is play, beside the sway, which keeps to 3 degrees: a head a few
  // centimetres across shows no nod of 3. The edge band is in because the planner grows the mushrooms at the feet of the ring of
  // trees, which is there (grunnur has none in the clearing band), and the child sees both from the clearing: ['clearing'] alone
  // would leave the mushrooms still.
  dance: { bands: ['clearing', 'edge'], nodDeg: 8, hop: 0.03, squash: 0.1 },
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
  // The clearing's butterflies (butterflies.js): `count` of them loop over the clearing and each is a tap target `radius` m wide.
  // One the child taps flutters (`flutter`): it is `away` m aside and `rise` m up at the middle of `seconds`, zigzagging `zigzag` m,
  // beats its wings `beats` more times than it would and spreads them between `wings` (radians; at rest they swing 0.25 to 1.3).
  // One sent to a point (butterflyLand, `land`) arcs `lift` m over the way there, weaving `weave` m, beats `excited` radians a second
  // faster, and on landing folds its wings to `rest` (the middle and the swing of the angle, then the rate of the slow beat), over `settle` s.
  butterflies: {
    count: 4,
    radius: 0.4,
    flutter: { seconds: 3, away: 3.2, rise: 2.1, zigzag: 0.14, beats: 3, wings: [0.06, 1.5] },
    land: { seconds: 3, lift: 0.55, weave: 0.2, excited: 8, wings: [0.12, 1.45], rest: [1.2, 0.26, 2.1], settle: 0.5 },
  },
  shots: { clearance: 1.5 },
  // Distance LOD: plants carry up to three detail levels and switch at these camera distances.
  // switch: distances to a plant's mid-height point (trunks, understory). Crowns pick their level by
  // their own projected size (half-extent / distance to the crown centre): the `crownFine` largest
  // crowns in view above crownSize[0] get the fine level, others the middle one above crownSize[1].
  // The cap keeps the fine crowns' cost bounded in every frame, wherever the camera is.
  actorWarm: 0.5, // strength of the lighter, warmer ground and grass round characters (STYLE.md 5.1); halved, it read as a spotlight following Mosi in the tracking shot
  lod: { switch: [10, 32], switchSmall: [8, 22], crownSize: [0.3, 0.19], crownFine: 3 },
};

// The Fen (layout.biome 'fen', chapter 2): a wetland with its own look, the spec's palette (docs/superpowers/specs/
// 2026-10-21-kafli-2-bod-til-thorsedlu-design.md, section 3: wet, golden and clear, never dark), and how it grows: open water
// and golden reed with groves of swamp conifers, where the forest is a wall of broadleaves. A layout with `blend: { from, to }`
// turns from forest to fen between those two points (biome.js); everything here is mixed in by that share.
export const FEN = {
  // ground: golden reed, moss on the hummocks, dark mud at the water
  grassSun: '#c9b45a',
  grassTip: '#e3d08a',
  grassBase: '#6b7a3a',
  grassShade: '#566a3e',
  moss: '#6f8f3c',
  mossWet: '#4e7a3a',
  mud: '#4a3a2c',
  path: '#8a7152', // a trodden, damp path
  // water (world/props/water.js): teal in shade, sky-coloured toward the horizon, a golden glint toward the sun
  waterDeep: '#3f7a6e',
  waterSky: '#a9c9c4',
  waterBed: '#8b8a5a', // the bed's olive silt, seen through the shallows at the very edge
  waterTreeline: '#4b6a5e', // the far treeline the water reflects at a low angle
  glint: '#fff0c6',
  mist: '#cfe0d6',
  // trees and plants
  bark: '#5a4636',
  barkCrevice: '#3d2f25',
  barkHighlight: '#7b6450',
  hangingMoss: '#8aa05a',
  canopyShadow: '#2f5847',
  canopyMid: '#4a7752',
  canopySun: '#8cae5c',
  reed: '#c9b45a',
  reedTip: '#e3d08a',
  reedBase: '#6b7a3a',
  horsetail: '#7c9c48',
  lilyPad: '#4f8a4a',
  lilyWhite: '#f6f1e4',
  lilyPink: '#f0a3b6',
  lilyHeart: '#f2c443',
  snag: '#b5ad9e', // dead wood weathered silver-grey
  snagShade: '#6f685c', // its cracks
  // The ground is a calm basin: little undulation, a shallow bowl, the hummocks small. The ground mesh is finer than the forest's
  // so the banks of the pools and the channel are smooth (terrain.js), and the water lies at one level everywhere (water.js),
  // `waterLevel` metres from the clearing's centre.
  terrain: { undulation: 0.16, bumps: 0.08, bowlRise: 0.3, rings: [[0, 40, 1.0], [40, 80, 3.2], [80, 260, 0]], segments: 180 },
  waterLevel: -0.06,
  // Open sky: what a plant in the fen sees of it (the forest's deep band sees 0.09), and the shade a grove of conifers throws.
  sky: 0.86,
  // Grass in the fen: golden reed, sparser and taller than the clearing's grass.
  grass: { density: 0.85, densityBlended: 0.55, tall: 1.5 }, // the trail, part forest, keeps the lighter grass (its budget)
  // How much the fen grows (per place, at tablet; scaled by the quality preset).
  counts: {
    groves: 16, // groups of two to four swamp conifers
    loneConifers: 14,
    snags: 10,
    reedBeds: 60, // each a bed of three to seven clumps
    tallHorsetails: 30,
    hummocks: 44,
    ferns: 80,
    cycads: 16,
    treeFerns: 10,
    lilies: 44,
    rocks: 8,
    logs: 2,
  },
  // Where it grows: out to this far beyond the forest edge (m), most of it on the clearing's rim (plan.js: growFen).
  reach: 70,
  reachBlended: 35, // a place that is part forest grows its fen nearer: it is seen from its path
  blendedTrees: 0.65, // and fewer of its trees, which a trail sees many of at once
  // Hanging moss under a conifer's lower tiers (forest.js): cards, how long and how wide (m), and how far they swing (degrees).
  mossCards: { perTree: [5, 8], length: [2.5, 4.5], width: [0.55, 0.9], swingDeg: 4 },
  // The far treeline: well out, so the fen opens to it (far.js).
  far: {
    rings: [
      { radius: 150, rows: 2, spacing: 6, height: [12, 17], crown: [6, 9.5], strip: [2.4, 4.0], color: ['#3a5a4c', '#5d7d6b'], haze: '#c7d8d0', topHaze: 0.45, araucaria: 0.15 },
      { radius: 190, rows: 1, spacing: 6, height: [12, 16], crown: [6, 9], strip: [2.6, 4.2], color: ['#4b6a5e', '#6d8b7d'], haze: '#d0dfd8', topHaze: 0.6, araucaria: 0.1 },
    ],
  },
};

/** The beat adds this share of a part's own full-wind sway, along the wind, at the crest of its wave (forestWind in materials.js). */
export const BEAT_SHARE = FOREST.wind.beatAmplitudeDeg / FOREST.wind.maxSwayDeg;

/** At a crest of its ripple a blade of grass bends further by this share of its own bend (grass.js): light, the owner asked. */
export const GRASS_BEAT_SHARE = 0.3;

/**
 * The most forestWind (materials.js) bends a part without the beat, as a multiple of its `sway`, the metres it bends at full wind:
 * along the wind 0.55 + 0.45 * (0.6 + 0.25) of it (full strength, the strongest swing) and 0.22 of it sideways; the crest of the
 * beat adds BEAT_SHARE along the wind. tests/forest-sway.test.mjs keeps these numbers in step with the shader's text.
 */
export const WIND_PEAK = { along: 0.55 + 0.45 * (0.6 + 0.25), side: 0.22 };

/**
 * The last byte of a vertex's aPivot (batch.js bakes it, forestPivot in materials.js reads it): `none` for a vertex that moves with
 * the wind alone; `lean` for a fern's, which leans away from a character; `hop` for a mushroom's; and from `nod` on, a flower
 * head's, the byte naming which of the `nodSteps` ways round (the direction the head faces) it dips toward.
 */
export const PIVOT = { none: 0, lean: 1, hop: 2, nod: 3, nodSteps: 253 };

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
