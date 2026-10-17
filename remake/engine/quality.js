// Quality presets. `tablet` is the target (a mid-range Android tablet) and the default.
// Budgets for `tablet` (measured on the dev laptop's Intel Iris Xe at 1280x800, see README):
// GPU median <= 6 ms per frame, <= 100 draw calls, <= 250k triangles, <= 96 MB textures.
export const PRESETS = {
  low: {
    name: 'low', pixelRatio: 0.8, maxPixelRatio: 1, antialias: false, shadowSize: 512,
    grass: 0.45, trees: 0.6, plants: 0.5, dynamicResolution: true,
  },
  tablet: {
    name: 'tablet', pixelRatio: 1, maxPixelRatio: 1, antialias: true, shadowSize: 1024,
    grass: 1, trees: 1, plants: 1, dynamicResolution: true,
  },
  high: {
    name: 'high', pixelRatio: 1.5, maxPixelRatio: 2, antialias: true, shadowSize: 2048,
    grass: 1.6, trees: 1.25, plants: 1.4, dynamicResolution: false,
  },
};

export function pickQuality(params) {
  return PRESETS[params.get('quality')] || PRESETS.tablet;
}
