// Light "looks" from the style guide (remake/STYLE.md). A chapter picks one by name.
// Colours are sRGB hex. Sun azimuth is in degrees from +X toward +Z; elevation in degrees above
// the horizon. Fog density is per metre at ground level and thins with height (heightFalloff, 1/m).
const morning = {
  sun: { azimuth: 135, elevation: 32, color: '#ffe3b8', intensity: 2.9 },
  hemi: { sky: '#cfe3f2', ground: '#5f6a3a', intensity: 0.55 },
  sky: { zenith: '#4f93d6', horizon: '#e9e8d8', glow: '#fff0d2', cloud: '#ffffff', cloudShade: '#d9e1ec', cloudCover: 0.55 },
  fog: { color: '#d6e2dc', sunColor: '#f6e2bf', sunStrength: 0.8, density: 0.014, heightFalloff: 0.08 },
  exposure: 1.0, envIntensity: 0.7,
};

export const LOOKS = {
  morning,
  // Chapter 2's: later the same morning, the sun a little further round, lower and warmer, and the mist a touch lighter.
  lateMorning: {
    ...morning,
    sun: { azimuth: 150, elevation: 26, color: '#ffe0b0', intensity: 2.8 },
    fog: { ...morning.fog, color: '#dfe7df' },
  },
  // The memory game's (engine/memory/world.js): a golden morning, the sun high on the upper right of the search view, a deeper fill under
  // it and only a thin warm mist.
  memoryMorning: {
    ...morning,
    sun: { azimuth: 310, elevation: 38, color: '#ffdba2', intensity: 3.1 },
    hemi: { sky: '#c4dcec', ground: '#6e6a3a', intensity: 0.6 },
    fog: { color: '#d3d8b4', sunColor: '#ffd9a0', sunStrength: 1, density: 0.0055, heightFalloff: 0.035 },
    envIntensity: 0.5,
  },
  // Level 2's (engine/memory/levels/steinagljufur.js): the gorge in the afternoon, the sun high and warm over the search camera's right shoulder so
  // the sandstone walls facing the glade are lit and the friends' shadows fall away behind them, warm light bounced up from the sand and a dusty haze.
  // (Later stages of the round take it on to golden, sunset and evening: Task 7.)
  gorgeAfternoon: {
    ...morning,
    sun: { azimuth: 30, elevation: 42, color: '#ffe4c0', intensity: 2.8 },
    hemi: { sky: '#d0dcea', ground: '#85704f', intensity: 0.6 },
    fog: { color: '#e9dcc5', sunColor: '#ffe2b8', sunStrength: 0.8, density: 0.0042, heightFalloff: 0.04 },
    envIntensity: 0.55,
  },
  // Task 7: level 2's round goes on from the afternoon to the evening (levels/steinagljufur/world.js blends between these four, a stage after
  // each step). Every value is spelled out, so a blend never reads a field another look leaves out. The sun swings round from over the glade
  // (azimuth 30) to behind the cameras of the upper gorge (they look from about 136-150 degrees), so the friends' faces on Sólarsyllan catch the
  // last light and the sky the cameras see over the hillside is the darker, eastern one where the stars come out.
  gorgeGolden: {
    sun: { azimuth: 95, elevation: 24, color: '#ffcb8e', intensity: 2.9 },
    hemi: { sky: '#d6d4dc', ground: '#8a6a45', intensity: 0.58 },
    sky: { zenith: '#6f9bd0', horizon: '#f4d6a8', glow: '#ffd59a', cloud: '#fff0dc', cloudShade: '#d9b9a0', cloudCover: 0.5 },
    fog: { color: '#ecd3ae', sunColor: '#ffd29a', sunStrength: 0.8, density: 0.0044, heightFalloff: 0.04 },
    exposure: 1.0, envIntensity: 0.55,
  },
  gorgeSunset: {
    sun: { azimuth: 135, elevation: 14, color: '#ffa36a', intensity: 2.8 },
    hemi: { sky: '#d4bcc4', ground: '#8a5a3c', intensity: 0.62 },
    sky: { zenith: '#4a5c9a', horizon: '#f2a882', glow: '#ffb070', cloud: '#ffc6a4', cloudShade: '#a8879c', cloudCover: 0.45 },
    fog: { color: '#e8b190', sunColor: '#ffad74', sunStrength: 0.8, density: 0.0046, heightFalloff: 0.04 },
    exposure: 1.04, envIntensity: 0.5,
  },
  gorgeEvening: {
    sun: { azimuth: 150, elevation: 9, color: '#ff9470', intensity: 2.2 },
    hemi: { sky: '#97a6d6', ground: '#6a5248', intensity: 0.95 },
    sky: { zenith: '#0f1838', horizon: '#6e5a82', glow: '#ff9466', cloud: '#4a4266', cloudShade: '#2a2a48', cloudCover: 0.62 },
    fog: { color: '#6e5a82', sunColor: '#ff9466', sunStrength: 0.8, density: 0.0042, heightFalloff: 0.04 },
    exposure: 1.12, envIntensity: 0.4,
  },
  golden: {
    sun: { azimuth: 210, elevation: 15, color: '#ffc68a', intensity: 2.9 },
    hemi: { sky: '#cadcef', ground: '#6b5a37', intensity: 0.55 },
    sky: { zenith: '#729fd2', horizon: '#f6d3a4', glow: '#ffd79c', cloud: '#fff2e0', cloudShade: '#d6b8a4', cloudCover: 0.45 },
    fog: { color: '#e0d5c2', sunColor: '#f8c78c', sunStrength: 1, density: 0.016, heightFalloff: 0.07 },
    exposure: 1.0, envIntensity: 0.8,
  },
  evening: {
    sun: { azimuth: 250, elevation: 6, color: '#ff9f6e', intensity: 2.2 },
    hemi: { sky: '#a9b8d8', ground: '#4f4636', intensity: 0.5 },
    sky: { zenith: '#4f6fae', horizon: '#f2b28e', glow: '#ffb27a', cloud: '#ffd9c2', cloudShade: '#9c8aa6', cloudCover: 0.42 },
    fog: { color: '#c9b7b0', sunColor: '#f6a678', sunStrength: 1, density: 0.018, heightFalloff: 0.07 },
    exposure: 1.05, envIntensity: 0.7,
  },
};

// Chapter 4's (spec 2, "snemma síðdegis"): early afternoon, the sun lower and further round than chapter 2's late morning, and
// everything else 40 % of the way from lateMorning toward golden, the sun's colour too (warmer). The flight's golden light (chapters/
// kafli4-flight.js) goes the rest of the way over the falls and back.
LOOKS.earlyAfternoon = {
  ...blendLooks(LOOKS.lateMorning, LOOKS.golden, 0.4),
  sun: { ...blendLooks(LOOKS.lateMorning, LOOKS.golden, 0.4).sun, azimuth: 215, elevation: 22 },
};

// Chapter 5's (its spec 1, "gullið síðdegi"): the golden afternoon at the far pool, later the same day, everything 70 % of the way
// from lateMorning toward golden, the sun's colour too, and the sun lower than chapter 4's from the same way (heading 215), so the
// pool's shots keep their light as chapter 4 left it; not yet the sunset (chapter 6 and the festival have that).
LOOKS.goldenAfternoon = {
  ...blendLooks(LOOKS.lateMorning, LOOKS.golden, 0.7),
  sun: { ...blendLooks(LOOKS.lateMorning, LOOKS.golden, 0.7).sun, azimuth: 215, elevation: 14 },
};

/**
 * A look `k` of the way from `a` to `b` (0 is a, 1 is b): its colours mixed as written (sRGB hex, channel by channel) and its numbers
 * in between; the sun's place is a's.
 */
export function blendLooks(a, b, k) {
  const mix = (x, y) => {
    if (typeof x === 'number') return x + (y - x) * k;
    if (typeof x === 'string' && x.startsWith('#')) {
      const [p, q] = [x, y].map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
      return `#${p.map((v, i) => Math.round(v + (q[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
    }
    if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).map(key => [key, key in y ? mix(x[key], y[key]) : x[key]]));
    return x;
  };
  const out = mix(a, b);
  out.sun = { ...out.sun, azimuth: a.sun.azimuth, elevation: a.sun.elevation };
  return out;
}

export function pickLook(name) {
  return LOOKS[name] || LOOKS.morning;
}
