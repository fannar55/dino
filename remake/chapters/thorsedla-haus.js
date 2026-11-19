// Look-check for Egill on Þórseðla's head (?chapter=thorsedla-haus): she holds one moment of one of her clips in the foundation
// clearing and Egill sits on the seat on her head (kafli3-thorsedla.js SEAT: riding.js createSeat with places on her skin), riding
// it as in chapter 3, with the camera at one view. For stills from every side (remake/tools/capture.mjs, with t to freeze it):
//
//   ?chapter=thorsedla-haus&clip=liftUp&at=1&of=1&view=right&t=1
//
//   clip    her clip: lowerHead (default: her head down at the bank, where he floats onto it) or liftUp (the lift: at=1 the top)
//   at      seconds into the clip, or a share of it with `of=1`
//   view    one close to the seat: back, left, right, front, top, legL, legR, below (from under her jaw, up past her cheek); or far:
//           wide (her head and neck and him, from her left)
// Units are metres; heading 0 faces +X.
import { chapter as grunnur } from './grunnur.js';
import { createSeat, ride, SIT_DEPTH } from '../engine/riding.js';
import { SEAT } from './kafli3-thorsedla.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const CLIP = params.get('clip') || 'lowerHead';
const AT = params.has('at') ? Number(params.get('at')) || 0 : 1;
const OF = params.has('at') ? params.get('of') === '1' : true;
const VIEW = params.get('view') || 'right';
const SPOT = [-8, 0, 2]; // her root, so her head comes over the open middle of the clearing

// Close views of the seat: [ahead, up, right] in metres from the seat of his trousers in her frame (heading 0, world up), and where
// they look, likewise.
const CLOSE = {
  back: { from: [-2.6, 0.9, 0], at: [0.3, 0.1, 0], fov: 38 },
  left: { from: [0.1, 0.4, -2.6], at: [0.1, 0, 0], fov: 36 },
  right: { from: [0.1, 0.4, 2.6], at: [0.1, 0, 0], fov: 36 },
  front: { from: [2.4, 0.9, -1.2], at: [0, 0.2, 0], fov: 36 },
  top: { from: [-0.6, 2.6, 0.05], at: [0.1, 0, 0], fov: 40 },
  legL: { from: [0.6, 0.05, -1.8], at: [0.1, -0.1, -0.25], fov: 32 },
  legR: { from: [0.6, 0.05, 1.8], at: [0.1, -0.1, 0.25], fov: 32 },
  below: { from: [1.6, -1.4, 1.6], at: [0.1, 0.2, 0], fov: 38 },
  wide: { from: [1, 1.5, -9], at: [-1.5, -1.5, 0], fov: 42 },
};

export const chapter = {
  id: 'thorsedla-haus',
  title: 'Egill á höfði Þórseðlu',
  look: 'earlyAfternoon',
  layout: grunnur.layout, // the same clearing and forest
  actors: {
    thorsedla: { url: '../assets/characters/brontosaurus.glb', position: SPOT, heading: 0 },
    egill: { url: '../assets/characters/egill.glb', position: [SPOT[0] + 12, 0, SPOT[2] + 4], heading: 0 },
  },
  startShot: 'hero',
  shots: {
    hero: { position: [SPOT[0] + 10, 6, SPOT[2] + 16], target: [SPOT[0] + 8, 4, SPOT[2]], fov: 40 },
  },

  *script(s) {
    const her = s.actor('thorsedla').raw;
    const egill = s.actor('egill').raw;
    const THREE = her.world.THREE;
    const clip = her.clips.get(CLIP) ?? her.clips.get('lowerHead');
    const action = her.play(clip.name, { fade: 0, timeScale: 0 }); // held still at that moment of the clip
    action.time = Math.min(clip.duration - 1e-3, OF ? AT * clip.duration : AT);
    const seat = createSeat(her, SEAT);
    egill.play('sit', { fade: 0 });
    const riding = ride(egill, seat, { settle: 0 });
    her.world.chapterState = { her, egill, seat, riding }; // for probes
    yield s.wait(0.5); // let the pose, the seat and his hands and legs settle
    const view = CLOSE[VIEW] ?? CLOSE.right;
    const bottom = seat.update().clone().add(new THREE.Vector3(0, SIT_DEPTH, 0));
    const at = ([a, u, r]) => bottom.clone().add(new THREE.Vector3(a, u, r));
    yield s.camera.cut({ position: at(view.from).toArray(), target: at(view.at).toArray(), fov: view.fov, label: VIEW }, { check: false });
    yield s.ready();
    yield s.fade(0, 0.3); // up out of the black a scene starts in
    yield s.wait(1e6);
  },
};
