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

export function pickLook(name) {
  return LOOKS[name] || LOOKS.morning;
}
