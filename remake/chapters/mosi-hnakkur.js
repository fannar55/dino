// Look-check for the saddle on Mosi's back (?chapter=mosi-hnakkur): he holds one moment of one of his clips in the foundation
// clearing, wearing his saddle (engine/riding.js createSaddle), with Egill riding on it (ride), and the camera at one view.
// For stills of the fit from every side (remake/tools/capture.mjs, with t to freeze it):
//
//   ?chapter=mosi-hnakkur&clip=walk&at=0.5&of=1&view=right&t=1
//
//   clip    his clip: idle (default) or walk
//   at      seconds into the clip, or a share of it with `of=1` (at=0.5&of=1: halfway)
//   view    one close to the seat: back, backHigh, left, right, front, top, legL, legR, frill (his frill and Egill's head, from his
//           left); or far: game (as a chapter sees them, from behind and to his left), side (the whole of him from his right)
//   look    degrees his head turns to his left (negative: his right), and `up` degrees it tilts up: the frill near Egill
//   saddle  the address of another fitted saddle file (its places then come from the file: wait for it)
//   bare    1: no saddle, Egill on its places all the same (to see Mosi's back)
// Units are metres; heading 0 faces +X.
import { chapter as grunnur } from './grunnur.js';
import { createSaddle, ride, SIT_DEPTH } from '../engine/riding.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const CLIP = params.get('clip') || 'idle';
const AT = Number(params.get('at')) || 0;
const VIEW = params.get('view') || 'right';
const SADDLE = params.get('saddle');
const SPOT = [3.5, 0, -2]; // open ground in the clearing

// Close views of the seat: [ahead, up, right] in metres from it in his frame (heading 0, world up), and where they look, likewise.
const CLOSE = {
  back: { from: [-3.4, 1.1, 0], at: [0.3, 0.05, 0], fov: 38 },
  backHigh: { from: [-2.6, 2.6, 0.6], at: [0.2, 0, 0], fov: 38 },
  left: { from: [-0.1, 0.5, -3.4], at: [0.05, 0, 0], fov: 36 },
  right: { from: [-0.1, 0.5, 3.4], at: [0.05, 0, 0], fov: 36 },
  front: { from: [2.4, 1.2, -1.8], at: [0, 0.3, 0], fov: 36 },
  top: { from: [-0.7, 3, 0.05], at: [0.1, 0, 0], fov: 40 },
  legL: { from: [0.5, 0.1, -2.2], at: [0, -0.15, -0.4], fov: 34 },
  legR: { from: [0.5, 0.1, 2.2], at: [0, -0.15, 0.4], fov: 34 },
  frill: { from: [0.4, 1, -2.4], at: [0.5, 0.5, 0], fov: 38 },
  game: { from: [-7.5, 1.2, -6], at: [0.6, -1, 0], fov: 40 },
  side: { from: [0.2, -0.6, 11], at: [0.2, -1.4, 0], fov: 40 },
};

export const chapter = {
  id: 'mosi-hnakkur',
  title: 'Hnakkur Mosa',
  look: 'earlyAfternoon',
  layout: grunnur.layout, // the same clearing and forest
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', position: SPOT, heading: 0 },
    egill: { url: '../assets/characters/egill.glb', position: [SPOT[0] - 4, 0, SPOT[2] + 3], heading: 0 },
  },
  startShot: 'hero',
  shots: {
    hero: { position: [SPOT[0] - 10, 5, SPOT[2] + 8], target: [SPOT[0], 2.5, SPOT[2]], fov: 40 },
  },

  *script(s) {
    const mosi = s.actor('mosi').raw;
    const egill = s.actor('egill').raw;
    const THREE = mosi.world.THREE;
    const clip = mosi.clips.get(CLIP) ?? mosi.clips.get('idle');
    const time = params.get('of') === '1' ? AT * clip.duration : AT;
    // held still at that moment of the clip
    const action = mosi.play(clip.name, { fade: 0, timeScale: 0 });
    action.time = time;
    const saddle = createSaddle(mosi, SADDLE ? { url: new URL(SADDLE, globalThis.location.href).href } : {});
    if (params.get('bare') !== '1') saddle.show();
    yield saddle.loaded;
    const riding = ride(egill, saddle, { settle: 0 }); // (it caps his looks, as in the chapters)
    if (params.has('look')) {
      // a point 10 m off, from about where his head is, `look` degrees to his left and `up` degrees up
      const yaw = THREE.MathUtils.degToRad(Number(params.get('look')) || 0), up = THREE.MathUtils.degToRad(Number(params.get('up')) || 0);
      mosi.lookAt([SPOT[0] + 3.5 + 10 * Math.cos(yaw), 3 + 10 * Math.tan(up), SPOT[2] - 10 * Math.sin(yaw)]);
    }
    mosi.world.chapterState = { mosi, egill, saddle, riding }; // for probes
    yield s.wait(0.5); // let the pose, the seat and his hands and legs settle
    const view = CLOSE[VIEW] ?? CLOSE.right;
    const seat = saddle.update().clone().add(new THREE.Vector3(0, SIT_DEPTH, 0));
    const at = ([a, u, r]) => seat.clone().add(new THREE.Vector3(a, u, r));
    yield s.camera.cut({ position: at(view.from).toArray(), target: at(view.at).toArray(), fov: view.fov, label: VIEW }, { check: false });
    yield s.ready();
    yield s.fade(0, 0.3); // up out of the black a scene starts in
    yield s.wait(1e6);
  },
};
