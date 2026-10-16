// Look-check scene: the characters side by side in the foundation clearing, at their real sizes.
// It has no script, only review shots (?chapter=lineup&shot=<name>&t=<seconds>), for comparing a new
// character with Mosi and Egill and for measuring the GPU cost with it in view
// (remake/tools/capture.mjs; ?gramedla=0, ?kambedla=0 or ?thorsedla=0 leaves her out).
//
// Þórseðla the Brontosaurus is 22 m nose to tail (her head 8.6 m up), Grameðla the T. rex 12 m,
// Mosi 8.5 m, Kambeðla the Stegosaurus 7 m and Egill 1.1 m tall (STYLE.md section 3). Þórseðla
// stands across the back of the clearing behind Mosi, facing left, her tail reaching into the trees.
// Units are metres; heading 0 faces +X.
import { chapter as grunnur } from './grunnur.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');

export const chapter = {
  id: 'lineup',
  title: 'Uppstilling',
  look: 'morning',
  layout: grunnur.layout, // the same clearing and forest
  actors: {
    ...(params.get('thorsedla') === '0' ? {} : { thorsedla: { url: '../assets/characters/brontosaurus.glb', position: [9, 0, -13], heading: 170 } }),
    ...(params.get('gramedla') === '0' ? {} : { gramedla: { url: '../assets/characters/trex.glb', position: [-4, 0, -9], heading: 20 } }),
    ...(params.get('kambedla') === '0' ? {} : { kambedla: { url: '../assets/characters/stegosaurus.glb', position: [-1.5, 0, 3.5], heading: 25 } }),
    mosi: { url: '../assets/characters/mosi.glb', position: [10, 0, -3], heading: 0 },
    egill: { url: '../assets/characters/egill.glb', position: [9, 0, 3], heading: 200 },
  },
  shots: {
    // The four side by side, the T. rex at the back on the left, turned a little toward us, and the
    // Brontosaurus across the back.
    lineup: { position: [3.5, 2.4, 14], target: [3.5, 3.6, -4], fov: 55 },
    hero: { position: [3.5, 2.4, 14], target: [3.5, 3.6, -4], fov: 55 },
    // Grameðla's face from the front three-quarter, at about a grown-up's eye height.
    face: { position: [6, 2.6, -1], target: [-0.2, 4.2, -7.6], fov: 38 },
    // Kambeðla's face from the front three-quarter, at a child's eye height.
    kambedla: { position: [4.6, 1.5, 7.4], target: [0.7, 1.9, 4.6], fov: 36 },
    // Kambeðla from the side, with Mosi beyond her.
    kambedlaSide: { position: [-0.5, 1.6, 15.5], target: [0.5, 2.2, 1], fov: 46 },
    // A low angle in front of her, looking up.
    low: { position: [0.5, 0.7, 1.5], target: [-1.5, 4.2, -8], fov: 50 },
    // The back of her neck from above and behind, where Tripo's seam between body and head runs.
    neck: { position: [-7.5, 7.2, -5.5], target: [-2.1, 4.9, -8.3], fov: 30 },
    // Þórseðla from in front of her, at a child's eye height, looking up her neck.
    thorsedla: { position: [5, 1.1, -4], target: [1.5, 5.6, -12], fov: 52 },
    // Her face from the front three-quarter, up at her head.
    thorsedlaFace: { position: [-1.6, 7.3, -8.4], target: [1.5, 7.9, -11.6], fov: 34 },
    // Her whole length from her left side, Mosi and Egill in front of her for scale.
    thorsedlaSide: { position: [15, 1.7, 6.5], target: [11.5, 4.2, -13.5], fov: 50 },
  },
};
