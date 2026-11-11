// Look-check for the saddle on Flugeðla's back (?chapter=hnakkur): she holds one moment of one of her clips over the foundation
// clearing, banked as asked, with Egill riding her as in the flight (engine/flier.js rideFlier), and the camera at one view.
// For stills of the fit from every side (remake/tools/capture.mjs, with t to freeze it):
//
//   ?chapter=hnakkur&clip=fly&at=0.2&bank=20&view=back&t=1
//
//   clip   her clip: glide (default), fly, carry, takeOff, idle, land
//   at     seconds into the clip (fly is a wing beat: 0 has the wings up), or `share` of it with `of=1` (at=0.5&of=1: halfway)
//   bank   degrees she banks (right wing down for a positive bank), as the flier banks her
//   view   the flight's own bound shots, as the flight frames them: face, chase, side, orbit (at the orbit's start); or one close to the
//          seat: back, backHigh, left, right, front, top, under, legL, legR, head (his head and hers, from her left)
//   saddle 1: she wears her saddle (engine/flier-saddle.js) and he rides on it; or the address of another fitted saddle file
//   her    the address of another build of her model (to compare a rebake with the game's)
// Units are metres; heading 0 faces +X.
import { chapter as grunnur } from './grunnur.js';
import { rideFlier } from '../engine/flier.js';
import { createFlierSaddle } from '../engine/flier-saddle.js';
import { createFlightCamera } from '../engine/camera/flight-camera.js';
import { BODY_HEIGHT } from './kafli4-route.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const CLIP = params.get('clip') || 'glide';
const AT = Number(params.get('at')) || 0;
const BANK = Number(params.get('bank')) || 0;
const VIEW = params.get('view') || 'back';
const SADDLE = params.get('saddle');
const SPOT = [3.5, 0, -2]; // where the lineup puts her: open ground
const HIGH = 2.5; // her root over the ground, so her feet hang clear of it in flight

// Close views of the seat: [ahead, up, right] in metres from it in her frame (her heading, world up), and where they look, likewise.
const CLOSE = {
  back: { from: [-2.6, 0.9, 0], at: [0.3, 0.1, 0], fov: 38 },
  backHigh: { from: [-2.2, 2.4, 0.4], at: [0.2, 0, 0], fov: 38 },
  left: { from: [-0.1, 0.5, -2.6], at: [0.05, 0.05, 0], fov: 36 },
  right: { from: [-0.1, 0.5, 2.6], at: [0.05, 0.05, 0], fov: 36 },
  front: { from: [2.2, 0.8, -1.2], at: [0, 0.3, 0], fov: 36 },
  top: { from: [-0.6, 2.6, 0.05], at: [0.1, 0, 0], fov: 40 },
  under: { from: [0.2, -3.2, -1.6], at: [0, -0.4, 0], fov: 44 },
  legL: { from: [0.6, 0.1, -1.4], at: [0, -0.15, -0.2], fov: 34 },
  legR: { from: [0.6, 0.1, 1.4], at: [0, -0.15, 0.2], fov: 34 },
  head: { from: [0.3, 0.9, -1.7], at: [0.2, 0.65, 0], fov: 34 },
};

export const chapter = {
  id: 'hnakkur',
  title: 'Hnakkur',
  look: 'earlyAfternoon',
  layout: grunnur.layout, // the same clearing and forest
  actors: {
    flugedla: { url: params.get('her') || '../assets/characters/pteranodon.glb', position: SPOT, heading: 0 },
    egill: { url: '../assets/characters/egill.glb', position: [SPOT[0] - 3, 0, SPOT[2]], heading: 0 },
  },
  startShot: 'hero',
  shots: {
    hero: { position: [SPOT[0] - 9, 4, SPOT[2] + 6], target: [SPOT[0], 3.5, SPOT[2]], fov: 40 },
  },

  *script(s) {
    const her = s.actor('flugedla').raw;
    const egill = s.actor('egill').raw;
    const THREE = her.world.THREE;
    const clip = her.clips.get(CLIP) ?? her.clips.get('glide');
    const time = params.get('of') === '1' ? AT * clip.duration : AT;
    // held still at that moment of the clip
    const action = her.play(clip.name, { fade: 0, timeScale: 0 });
    action.time = time;
    // her root, banked about her own X as the flier banks her
    const root = {
      position: new THREE.Vector3(SPOT[0], HIGH, SPOT[2]),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(BANK)),
    };
    her.control(() => {
      her.root.position.copy(root.position);
      her.root.quaternion.copy(root.quaternion);
    });
    const body = root.position.clone().add(new THREE.Vector3(0.06, BODY_HEIGHT, 0).applyQuaternion(root.quaternion));
    const flier = { actor: her, root, route: { waterAt: () => null }, heading: 0, bank: BANK, t: 30, pose: { position: body, quaternion: root.quaternion } };
    let saddle = null;
    if (SADDLE) {
      saddle = createFlierSaddle(her, SADDLE === '1' ? {} : { url: new URL(SADDLE, globalThis.location.href).href });
      saddle.show();
      yield saddle.loaded;
    }
    const riding = rideFlier(egill, flier, { saddle });
    her.world.chapterState = { her, egill, riding, flier, saddle }; // for probes
    yield s.wait(0.2); // let the pose and the seat settle
    if (['face', 'chase', 'side', 'orbit'].includes(VIEW)) {
      createFlightCamera(her.world.director, flier, { world: her.world, egill }).shot(VIEW);
    } else {
      const view = CLOSE[VIEW] ?? CLOSE.back;
      const seat = new THREE.Vector3();
      her.model.getObjectByName('Spine').localToWorld(seat.set(-0.056, 0.198, 0.009));
      const at = ([a, u, r]) => seat.clone().add(new THREE.Vector3(a, u, r));
      yield s.camera.cut({ position: at(view.from).toArray(), target: at(view.at).toArray(), fov: view.fov, label: VIEW }, { check: false });
    }
    yield s.ready();
    yield s.fade(0, 0.3); // up out of the black a scene starts in
    yield s.wait(1e6);
  },
};
