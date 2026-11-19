// What the table pages share (chapters/bord3d.js, chapters/tjorn3d.js): a 3D picture for a screen LYING FLAT on a table, watched
// through the red/cyan glasses from one seat (engine/table3d.js has the geometry). Here are the address's knobs, the screen's size
// and its memory, the page's real size, and the stage: the two eye cameras put at the viewer's eyes at every draw (engine/gler.js
// setEyes), the director's camera straight above the page (it picks levels of detail and aims the sun's shadow), the two checks
// without the glasses, and the screen's rectangle for the seat's view.
//
//   &skjar=10.5                            the screen's diagonal in inches (the address wins over what the device remembers, and is not remembered)
//   &fjarlaegd=45  &horn=45  &augu=5.8     the seat: cm from the screen's centre, degrees up from the table, cm between the eyes
//   &gler=0                                no glasses: the same table picture from the point between the eyes (the stretched picture)
//   &sjon=1                                what the viewer sees: an ordinary camera at the point between the eyes looking at the screen's
//                                          centre, the screen's rectangle outlined on its plane, no glasses
import * as THREE from 'three';
import { tableEyes, placeEye, cmPerPixel } from './table3d.js';

export const SCREEN = { min: 7, max: 17, step: 0.5, inches: 10.5 }; // the screen's diagonal
export const MARGIN = 0.04; // a standing thing's least distance to each edge of the page, as a share of the page that way
export const SCREEN_KEY = 'mosi.bord.skjar.v1'; // the screen's inches, remembered on the device for every table page
const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;

/** The address's knobs: knob(key, fallback, lo, hi) reads a number, `seat` is where the viewer sits, `mode` how the picture is shown. */
export function tableKnobs(params) {
  const knob = (key, fallback, lo, hi) => {
    const value = Number(params.get(key));
    return params.get(key) !== null && params.get(key) !== '' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;
  };
  const sjon = params.get('sjon') === '1';
  const mono = sjon || params.get('gler') === '0';
  return {
    knob, sjon, mono, mode: sjon ? 'sjon' : mono ? 'mono' : 'gler',
    seat: { R: knob('fjarlaegd', 45, 20, 90), a: knob('horn', 45, 20, 80), ipd: knob('augu', 5.8, 4, 8) }, // cm, degrees, cm
  };
}

const storageOf = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
/**
 * The screen's diagonal in inches: the address's (`skjar`), else what this device remembers, else 10.5. `step(d)` moves it half an
 * inch a step between 7 and 17 and remembers it; the address's own value is never written down.
 */
export function screenSize(params, storage = storageOf()) {
  const given = Number(params.get('skjar'));
  const fromAddress = params.get('skjar') !== null && params.get('skjar') !== '' && Number.isFinite(given);
  let kept = NaN;
  try { kept = Number(JSON.parse(storage?.getItem(SCREEN_KEY) ?? 'null')); } catch { /* nothing kept, or not a number */ }
  const size = {
    inches: fromAddress ? Math.min(32, Math.max(5, given)) : Number.isFinite(kept) && kept >= SCREEN.min && kept <= SCREEN.max ? kept : SCREEN.inches,
    fromAddress,
    step(d) {
      size.inches = Math.min(SCREEN.max, Math.max(SCREEN.min, Math.round((size.inches + d * SCREEN.step) / SCREEN.step) * SCREEN.step));
      try { storage?.setItem(SCREEN_KEY, JSON.stringify(size.inches)); } catch { /* no storage: it lasts this visit */ }
      return size.inches;
    },
  };
  return size;
}

/**
 * The page as the table sees it: its size in cm, from the screen's diagonal in inches and in CSS pixels. A screen said to be
 * smaller than the page on it (a headless capture's is 800 x 600 whatever the page) is taken to be the page's size; the long
 * and the short side are compared, not width and height, since some tablets do not turn the screen's numbers with the screen.
 */
export function tablePage(win, inches) {
  const w = win?.innerWidth || 1280, h = win?.innerHeight || 800;
  const sw = win?.screen?.width || w, sh = win?.screen?.height || h;
  const long = Math.max(sw, sh, w, h), short = Math.max(Math.min(sw, sh), Math.min(w, h));
  const cm = cmPerPixel(inches, long, short);
  return { cm, W: w * cm, Hs: h * cm, screenPx: [long, short] };
}

/**
 * The stage. `use(page, scale, origin)` says what the picture is drawn with from now on: the page (tablePage), how many of the
 * world's metres a cm of the table is, and where the page's centre is on the world's ground ([x, z]; `level` is the height of the
 * screen's plane in the world). From then on the glasses' eye cameras stand at the viewer's eyes (both at the point between them
 * with gler=0; an ordinary camera there with sjon=1) and the director's camera straight above the page. `stage.eyes` are the eyes
 * (table3d.js tableEyes), `through()` the two cameras a measure reads the picture through.
 */
export function createTableStage(world, { seat, sjon = false, mono = false, level = 0 }) {
  const { camera, gler, director, scene } = world;
  const near = camera.near, far = camera.far;
  const p = new THREE.Vector3();

  // the screen's rectangle on its plane, for the seat's view only: four plain strips
  const frame = new THREE.Group();
  frame.name = 'Table page';
  {
    const material = new THREE.MeshBasicMaterial({ color: '#f6f1e4', fog: false, depthTest: false, transparent: true, opacity: 0.9 });
    const strip = (w, d, x, z) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.01, z);
      mesh.renderOrder = 50;
      mesh.frustumCulled = false;
      frame.add(mesh);
    };
    const t = 0.006; // of the page each way
    strip(1 + t, t, 0, -0.5); strip(1 + t, t, 0, 0.5); strip(t, 1 + t, -0.5, 0); strip(t, 1 + t, 0.5, 0);
  }
  frame.visible = sjon;
  scene.add(frame);

  const stage = {
    seat, sjon, mono, level, near, far, frame,
    page: null, scale: 1, origin: [0, 0], eyes: null, centreFov: 40, seatFov: 40,
    eyesFor: (pg, scale) => tableEyes({ W: pg.W, Hs: pg.Hs, R: seat.R, a: seat.a, ipd: seat.ipd, near, far, scale }),
    use(pg, scale, origin, eyes = stage.eyesFor(pg, scale)) {
      Object.assign(stage, { page: pg, scale, origin: [origin[0], origin[1]], eyes });
      // the director's camera: straight above the page, as high as the eyes, seeing the page and a twentieth more (so a thing is as
      // big to it as to the eyes, which see exactly the page, and its level of detail is the one they need; director.effectiveFov
      // widens a lens on a screen narrower than 16:10)
      const half = (0.525 * pg.Hs) / eyes.height;
      const aspect = pg.W / pg.Hs;
      stage.centreFov = deg(2 * Math.atan(aspect >= 1.6 ? half : (half * aspect) / 1.6));
      // the seat's own view (sjon=1): from between the eyes at the screen's centre, the whole rectangle inside the frame
      let tan = 0;
      const seatCam = new THREE.PerspectiveCamera();
      seatCam.position.set(0, eyes.height, eyes.height / Math.tan(rad(seat.a)));
      seatCam.lookAt(0, 0, 0);
      seatCam.updateMatrixWorld(true);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        p.set((x * pg.W) / 2, 0, (z * pg.Hs) / 2).applyMatrix4(seatCam.matrixWorldInverse);
        tan = Math.max(tan, Math.abs(p.y / p.z), Math.abs(p.x / p.z) / aspect);
      }
      stage.seatFov = deg(2 * Math.atan(tan / 0.86));
      frame.scale.set(pg.W * scale, 1, pg.Hs * scale);
      frame.position.set(origin[0], level, origin[1]);
    },
    /** The page's centre in the world, [x, y, z]. */
    at: (out = [0, 0, 0]) => { out[0] = stage.origin[0]; out[1] = level; out[2] = stage.origin[1]; return out; },
    /** The two cameras the picture is drawn with: the glasses' own while they are on, else two made for the measure. */
    through() {
      const at = stage.at();
      return !mono && gler ? gler.eyes : [placeEye(new THREE.PerspectiveCamera(), stage.eyes.left, at), placeEye(new THREE.PerspectiveCamera(), stage.eyes.right, at)];
    },
  };

  // the director's: straight above the page (a hair toward the viewer, so its "up" is the screen's top)
  director.drive('borð', rig => {
    const h = stage.eyes.mid.y;
    rig.position.set(stage.origin[0], level + h, stage.origin[1] + h * 0.02);
    rig.target.set(stage.origin[0], level, stage.origin[1]);
    rig.fov = stage.centreFov;
  });
  // the two eyes, placed here at every draw. Without the glasses (gler=0, sjon=1) both are the one point between the eyes and the
  // left one's picture is shown as it is (the glasses' own check, `pass`).
  const at = [0, 0, 0];
  function seatView(eye) {
    eye.position.set(at[0], at[1] + stage.eyes.mid.y, at[2] + stage.eyes.mid.z);
    eye.up.set(0, 1, 0);
    eye.lookAt(at[0], at[1], at[2]);
    eye.fov = stage.seatFov; eye.aspect = camera.aspect; eye.near = near; eye.far = far;
    eye.updateProjectionMatrix();
    eye.updateMatrixWorld(true);
  }
  if (gler) {
    gler.enable(true);
    if (mono) gler.settings.method = 'pass';
    gler.setEyes((eyes, centre) => {
      stage.at(at);
      if (sjon) eyes.forEach(seatView);
      else {
        placeEye(eyes[0], mono ? stage.eyes.mid : stage.eyes.left, at);
        placeEye(eyes[1], mono ? stage.eyes.mid : stage.eyes.right, at);
      }
      for (const eye of eyes) eye.layers.mask = centre.layers.mask;
    });
  }
  return stage;
}
