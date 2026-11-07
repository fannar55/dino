// Quality presets. `tablet` is the target (a mid-range Android tablet) and the default.
// Budgets for `tablet` (measured on the dev laptop's Intel Iris Xe at 1280x800, see README):
// GPU median <= 6 ms per frame, <= 100 draw calls, <= 250k triangles, <= 96 MB textures.

// How far over 1 the tablet's dynamic resolution may climb (engine/renderer.js) while its frames come at about the display's own rate,
// on a screen sharper than the canvas (a 1.5 DPR tablet: 1.25 draws a quarter more pixels each way, sharper; 1 is never over).
// ?resolutionCap=1.5 (or 1) tries another on the device without a new build.
export const RESOLUTION_CAP = 1.25;

export const PRESETS = {
  low: {
    name: 'low', pixelRatio: 0.8, maxPixelRatio: 1, maxScale: 1, antialias: false, shadowSize: 512,
    grass: 0.45, trees: 0.6, plants: 0.5, dynamicResolution: true,
  },
  tablet: {
    name: 'tablet', pixelRatio: 1, maxPixelRatio: 1, maxScale: RESOLUTION_CAP, antialias: true, shadowSize: 1024,
    grass: 1, trees: 1, plants: 1, dynamicResolution: true,
  },
  high: {
    name: 'high', pixelRatio: 1.5, maxPixelRatio: 2, maxScale: 1, antialias: true, shadowSize: 2048,
    grass: 1.6, trees: 1.25, plants: 1.4, dynamicResolution: false,
  },
};

export function pickQuality(params) {
  const preset = PRESETS[params.get('quality')] || PRESETS.tablet;
  const cap = Number(params.get('resolutionCap'));
  return Number.isFinite(cap) && cap >= 1 && cap <= 2 ? { ...preset, maxScale: cap } : preset;
}
