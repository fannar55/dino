// Look-check scene: the characters side by side in the foundation clearing, at their sizes in the
// game. It has no script, only review shots (?chapter=lineup&shot=<name>&t=<seconds>), for comparing
// a new character with Mosi and Egill and for measuring the GPU cost with it in view
// (remake/tools/capture.mjs; ?gramedla=0 leaves her out).
//
// Grameðla the T. rex is 12 m nose to tail (the owner's real size, 2026-10-15); Mosi is still 4 m and
// Egill 1.1 m. Units are metres; heading 0 faces +X.
import { chapter as grunnur } from './grunnur.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');

export const chapter = {
  id: 'lineup',
  title: 'Uppstilling',
  look: 'morning',
  layout: grunnur.layout, // the same clearing and forest
  actors: {
    ...(params.get('gramedla') === '0' ? {} : { gramedla: { url: '../assets/characters/trex.glb', position: [-1.5, 0, -5.5], heading: 0 } }),
    mosi: { url: '../assets/characters/mosi.glb', position: [4.2, 0, -0.6], heading: 0 },
    egill: { url: '../assets/characters/egill.glb', position: [7.6, 0, 0.6], heading: 200 },
  },
  shots: {
    // The three in profile, the T. rex behind the others.
    lineup: { position: [2, 2.3, 11.5], target: [1.2, 3.0, -3], fov: 52 },
    hero: { position: [2, 2.3, 11.5], target: [1.2, 3.0, -3], fov: 52 },
    // Grameðla's face from the front three-quarter, at about a grown-up's eye height.
    face: { position: [9.5, 2.6, 1.5], target: [3.7, 3.8, -5.3], fov: 38 },
    // A low angle beside Egill, looking up at her.
    low: { position: [7.2, 0.5, 3.6], target: [0.5, 3.4, -4.5], fov: 50 },
    // The back of her neck from above and behind, where Tripo's seam between body and head runs.
    neck: { position: [-3.5, 7.2, -1.5], target: [0.6, 4.7, -5.5], fov: 30 },
  },
};
