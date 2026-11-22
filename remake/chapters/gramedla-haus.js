// Look-check for Egill on Grameðla's head (?chapter=gramedla-haus): she holds one pose in the foundation clearing and Egill sits on
// the seat on her head (kafli6-seat.js HEAD_SEAT: riding.js createSeat with places on her skin), riding it as in chapter 6, with
// the camera at one view. For stills from every side (remake/tools/capture.mjs, with t to freeze it):
//
//   ?chapter=gramedla-haus&pose=down&view=right&t=1
//
//   pose    down: her head down on the ground for him (kafli6-seat.js headDownPose); up (default): standing, her head up; stride:
//           her stride held at `at` (a share of the clip, default 0.25)
//   view    one close to the seat: back, left, right, front, top; or far: wide (all of her and him, from her left)
// Units are metres; heading 0 faces +X.
import { chapter as grunnur } from './grunnur.js';
import { createSeat, ride, SIT_DEPTH } from '../engine/riding.js';
import { createLean } from '../engine/pose/lean.js';
import { HEAD_SEAT, createHips, headDownPose } from './kafli6-seat.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const POSE = params.get('pose') || 'up';
const AT = params.has('at') ? Number(params.get('at')) || 0 : 0.25;
const VIEW = params.get('view') || 'right';
const SPOT = [-10, 0, 2]; // her root, so she stands in the open middle of the clearing

// Close views of the seat: [ahead, up, right] in metres from the seat of his trousers in her frame (heading 0, world up), and where
// they look, likewise. The wide view is from her left, far enough for all of her.
const CLOSE = {
  back: { from: [-3.4, 2.1, 0], at: [0.4, 0, 0], fov: 38 },
  left: { from: [0.2, 1.0, -3.0], at: [0.2, -0.05, 0], fov: 38 },
  right: { from: [0.2, 1.0, 3.0], at: [0.2, -0.05, 0], fov: 38 },
  front: { from: [3.4, 1.1, -1.6], at: [0, 0.2, 0], fov: 36 },
  top: { from: [-1.6, 2.6, 0.05], at: [0.2, 0, 0], fov: 42 },
  // her head down: her neck and back rise behind him, so from over them
  backDown: { from: [-1.7, 2.4, 0.3], at: [0.6, -0.1, 0], fov: 40 },
  wide: { from: [1, 0.5, -17], at: [-2.5, -2, 0], fov: 44 },
};

/** Her pose now: her clip held, and for `down` her lean and hips laid over it every frame (her overlay). Returns the pose found. */
export function holdPose(her, pose, { at = AT } = {}) {
  const clip = pose === 'stride' ? 'stride' : 'idle';
  const action = her.play(clip, { fade: 0, timeScale: 0 }); // held still at that moment of the clip
  action.time = pose === 'stride' ? at * action.getClip().duration : 0;
  her.mixer.update(0);
  her.root.updateMatrixWorld(true);
  if (pose !== 'down') return null;
  const lean = createLean(her);
  const hips = createHips(her);
  const down = headDownPose(her, lean, hips);
  her.setOverlay(() => {
    hips.set(down.hips);
    lean.set({ theta: down.theta, pitch: down.pitch });
  });
  return down;
}

export const chapter = {
  id: 'gramedla-haus',
  title: 'Egill á höfði Grameðlu',
  look: 'earlyAfternoon',
  layout: grunnur.layout, // the same clearing and forest
  actors: {
    gramedla: { url: '../assets/characters/trex.glb', position: SPOT, heading: 0 },
    egill: { url: '../assets/characters/egill.glb', position: [SPOT[0] + 9, 0, SPOT[2] + 4], heading: 0 },
  },
  startShot: 'hero',
  shots: {
    hero: { position: [SPOT[0] + 6, 5, SPOT[2] + 16], target: [SPOT[0] + 3, 3, SPOT[2]], fov: 40 },
  },

  *script(s) {
    const her = s.actor('gramedla').raw;
    const egill = s.actor('egill').raw;
    const THREE = her.world.THREE;
    const down = holdPose(her, POSE);
    const seat = createSeat(her, HEAD_SEAT);
    egill.play('sit', { fade: 0 });
    const riding = ride(egill, seat, { settle: 0 });
    her.world.chapterState = { her, egill, seat, riding, down }; // for probes
    yield s.wait(0.5); // let the pose, the seat and his hands and legs settle
    const view = (POSE === 'down' && VIEW === 'back' ? CLOSE.backDown : CLOSE[VIEW]) ?? CLOSE.right;
    const bottom = seat.update().clone().add(new THREE.Vector3(0, SIT_DEPTH, 0));
    const at = ([a, u, r]) => bottom.clone().add(new THREE.Vector3(a, u, r));
    yield s.camera.cut({ position: at(view.from).toArray(), target: at(view.at).toArray(), fov: view.fov, label: VIEW }, { check: false });
    yield s.ready();
    yield s.fade(0, 0.3); // up out of the black a scene starts in
    yield s.wait(1e6);
  },
};
