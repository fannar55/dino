// Look-check scene: the characters side by side in the foundation clearing, at their real sizes.
// It has no script, only review shots (?chapter=lineup&shot=<name>&t=<seconds>), for comparing a new
// character with Mosi and Egill and for measuring the GPU cost with it in view
// (remake/tools/capture.mjs; ?gramedla=0 leaves her out).
//
// Grameðla the T. rex is 12 m nose to tail, Mosi 8.5 m and Egill 1.1 m tall (STYLE.md section 3).
// Units are metres; heading 0 faces +X.
import { chapter as grunnur } from './grunnur.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');

export const chapter = {
  id: 'lineup',
  title: 'Uppstilling',
  look: 'morning',
  layout: grunnur.layout, // the same clearing and forest
  actors: {
    ...(params.get('gramedla') === '0' ? {} : { gramedla: { url: '../assets/characters/trex.glb', position: [-4, 0, -9], heading: 20 } }),
    mosi: { url: '../assets/characters/mosi.glb', position: [10, 0, -3], heading: 0 },
    egill: { url: '../assets/characters/egill.glb', position: [9, 0, 3], heading: 200 },
  },
  shots: {
    // The three side by side, the T. rex at the back on the left, turned a little toward us.
    lineup: { position: [3.5, 2.4, 14], target: [3.5, 3.6, -4], fov: 55 },
    hero: { position: [3.5, 2.4, 14], target: [3.5, 3.6, -4], fov: 55 },
    // Grameðla's face from the front three-quarter, at about a grown-up's eye height.
    face: { position: [6, 2.6, -1], target: [-0.2, 4.2, -7.6], fov: 38 },
    // A low angle in front of her, looking up.
    low: { position: [0.5, 0.7, 1.5], target: [-1.5, 4.2, -8], fov: 50 },
    // The back of her neck from above and behind, where Tripo's seam between body and head runs.
    neck: { position: [-7.5, 7.2, -5.5], target: [-2.1, 4.9, -8.3], fov: 30 },
  },
};
