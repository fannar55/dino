// The morning haze on a model far up the lane (Grameðla walking out of the mist, Flugeðla flying in from it): its own colours fade
// toward the mist's as `haze` goes to 1 (its albedo down, the mist's colour as its emissive), and it is drawn faint (`seen` under 1)
// where it first comes out of nothing. No shadow while it is mostly haze. The model's materials must be its own.
//
//   const haze = createHaze(model);   haze.set(haze, seen);
import * as THREE from 'three';

// the morning mist far up the lane as it looks on the screen (sampled from plain captures where she starts)
export const MIST_COLOUR = new THREE.Color('#bccbc6');

export function createHaze(...models) {
  const hazed = [];
  const meshes = [];
  for (const model of models) {
    model.traverse(o => {
      if (!o.isMesh) return;
      meshes.push({ o, cast: o.castShadow });
      for (const m of [].concat(o.material)) {
        if (!m || hazed.some(h => h.m === m) || !m.color) continue;
        hazed.push({ m, colour: m.color.clone(), emissive: m.emissive?.clone() ?? null, transparent: m.transparent, opacity: m.opacity });
      }
    });
  }
  let hazeNow = -1, seenNow = -1;
  return {
    set(haze = 0, seen = 1) {
      if (Math.abs(haze - hazeNow) < 1e-4 && Math.abs(seen - seenNow) < 1e-4) return;
      hazeNow = haze; seenNow = seen;
      for (const h of hazed) {
        h.m.color.copy(h.colour).multiplyScalar(1 - haze);
        if (h.emissive) h.m.emissive.copy(h.emissive).lerp(MIST_COLOUR, haze);
        const faint = seen < 0.999;
        if (h.m.transparent !== (faint || h.transparent)) { h.m.transparent = faint || h.transparent; h.m.needsUpdate = true; }
        h.m.opacity = h.opacity * seen;
      }
      for (const { o, cast } of meshes) o.castShadow = cast && haze < 0.5;
    },
  };
}
