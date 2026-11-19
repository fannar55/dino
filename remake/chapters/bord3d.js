// Borðmynd (?chapter=bord3d): a trial "phantogram" of Mosi, a 3D picture for a screen LYING FLAT on a table, watched through the
// red/cyan glasses from one seat, looking down at it at about 45 degrees. Mosi stands on the screen, facing the viewer turned a
// little to one side, and looks up at the viewer's eyes; he breathes and blinks. The ground is the screen and his shadow lies on it.
// Nothing else: no forest, no sound, no speech, nothing saved, no end (the page stays).
//
// The geometry is engine/table3d.js: the two eye cameras stand at the viewer's eyes, look straight down and see exactly the screen's
// rectangle, so the ground has no parallax and Mosi stands out of the screen. The world is scaled to the table: Mosi, some 4 m tall
// in the game, is N cm on the table, so one real cm is M/N metres and the cameras stand that many times the eyes' place away.
// Centimetres are centimetres only if the page knows how big the screen is: "skjár −" and "skjár +" set its diagonal in inches.
//
//   ?chapter=bord3d                        the glasses start, then Mosi 6 cm tall; ‹ › (or the arrow keys): 4, 6, 8, 10 cm
//   &haed=8  &skjar=10.5                   Mosi's height in cm, the screen's diagonal in inches
//   &fjarlaegd=45  &horn=45  &augu=5.8     the seat: cm from the screen's centre, degrees up from the table, cm between the eyes
//   &snu=45                                how far Mosi is turned from facing the viewer, degrees (to the viewer's left, toward the sun)
//   &gler=0                                no glasses: the same table picture from the point between the eyes (the stretched picture)
//   &sjon=1                                what the viewer sees: an ordinary camera at the point between the eyes looking at the screen's
//                                          centre, the screen's rectangle outlined on the ground, no glasses
// None of it is saved. world.bord.measure() gives the numbers (tools/bord3d-probe.mjs asks it).
import * as THREE from 'three';
import { glassesStart } from '../engine/book/show-cards.js';
import { tableEyes, placeEye, onTable, parallaxAt, outlineBox, centreOnTable, marginsOf, cmPerPixel } from '../engine/table3d.js';
import { tableUi, tala } from './bord3d/ui.js';

const CHARS = '../assets/characters/';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const knob = (key, fallback, lo, hi) => {
  const value = Number(params.get(key));
  return params.get(key) !== null && params.get(key) !== '' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;
};

export const HEIGHTS = [4, 6, 8, 10]; // cm: Mosi's height on the table at each step
const HEIGHT = knob('haed', 6, 2, 20);
export const SCREEN = { min: 7, max: 17, step: 0.5, inches: 10.5 }; // the screen's diagonal
export const SEAT = { R: knob('fjarlaegd', 45, 20, 90), a: knob('horn', 45, 20, 80), ipd: knob('augu', 5.8, 4, 8) }; // cm, degrees, cm
const TURN = knob('snu', 45, -90, 90); // degrees from facing the viewer, to the viewer's left: a quarter to one side
export const MARGIN = 0.04; // his picture's least distance to each edge of the page, as a share of the page that way
const SJON = params.get('sjon') === '1';
const MONO = SJON || params.get('gler') === '0';
const SETTLE = 30; // steps of 0.1 s for his head to come to rest on a new look
const PHASES = 6; // moments of his breathing his picture is bounded over
const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;

export const chapter = {
  id: 'bord3d',
  title: 'Borðmynd',
  look: 'morning',
  gler: { panel: false },
  // the glasses start, as every show's, and one more line: how the screen must lie
  startButton: doc => glassesStart(doc, { more: 'Leggðu skjáinn flatan á borð og horfðu skáhallt niður á hann.' }),
  // a clearing wide enough to be the whole page at every size (a 17 inch screen with Mosi 4 cm tall is 38 m of it), the path far off
  layout: {
    seed: 11,
    clearing: { center: [0, 0], radius: 27 },
    forestEdge: 33,
    path: [[-90, 64], [-45, 56], [0, 53], [45, 56], [90, 64]],
  },
  actors: {
    mosi: { url: CHARS + 'mosi.glb', position: [0, 0, 0], heading: 90 + TURN },
  },
  startShot: 'table',
  // where the camera is for the moment before the script takes it over (the script drives it from its first step)
  shots: { table: { position: [0, 3, 14], target: [0, 2, 0], fov: 40 } },

  *script(s) {
    const mosi = s.actor('mosi').raw;
    const world = mosi.world;
    const { camera, gler, director, scene } = world;
    const win = typeof window !== 'undefined' ? window : null;

    // ---- the table: the forest's ground alone (no plants, grass, treeline, air, animals), no mist over it, no music ----
    for (const child of [...world.forest.group.children]) if (child.name !== 'Forest ground') world.forest.group.remove(child);
    if (scene.fog) scene.fog.density = 0;
    world.music?.setLevel?.(0, 0);

    // ---- Mosi: his idle, his head turned up to the point between the viewer's eyes ----
    mosi.place(0, 0, 90 + TURN);
    mosi.play('idle', { fade: 0 });
    const eyePoint = new THREE.Vector3(0, 20, 20);
    mosi.lookAt(out => out.copy(eyePoint), { weight: 1, maxAngle: 70, maxPitch: 48 });
    const cycle = mosi.clips.get('idle')?.duration ?? 4;
    const p = new THREE.Vector3();
    /** His skins, each set of vertices once (a simpler level and the shadow's caster draw the same ones). */
    function skins() {
      const list = [];
      const seen = new Set();
      mosi.model.traverse(o => {
        const at = o.isSkinnedMesh && o.geometry.attributes.position;
        if (!at || seen.has(at)) return;
        seen.add(at);
        list.push(o);
      });
      return list;
    }
    /** Every vertex of his skin where his pose puts it now, in the world (x, y, z, ...). */
    function cloud() {
      mosi.root.updateMatrixWorld(true);
      const list = skins();
      const out = new Float32Array(3 * list.reduce((n, m) => n + m.geometry.attributes.position.count, 0));
      let j = 0;
      for (const mesh of list) {
        const count = mesh.geometry.attributes.position.count;
        for (let i = 0; i < count; i++) {
          mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld);
          out[j++] = p.x; out[j++] = p.y; out[j++] = p.z;
        }
      }
      return out;
    }

    // ---- the view: what is chosen (step, screen), and what follows from it (solve) ----
    const steps = HEIGHTS.includes(HEIGHT) ? HEIGHTS : [...HEIGHTS, HEIGHT].sort((x, y) => x - y);
    const view = {
      steps, index: steps.indexOf(HEIGHT), inches: knob('skjar', SCREEN.inches, 5, 32), ...SEAT, turn: TURN,
      mode: SJON ? 'sjon' : MONO ? 'mono' : 'gler', dirty: true, solves: 0,
      origin: [0, 0], scale: 0.7, eyes: null, box: null, margins: null, fits: false,
    };
    const near = camera.near, far = camera.far;
    /**
     * The page as the table sees it: its size in cm, from the screen's diagonal in inches and in CSS pixels. A screen said to be
     * smaller than the page on it (a headless capture's is 800 x 600 whatever the page) is taken to be the page's size; the long
     * and the short side are compared, not width and height, since some tablets do not turn the screen's numbers with the screen.
     */
    function page() {
      const w = win?.innerWidth || 1280, h = win?.innerHeight || 800;
      const sw = win?.screen?.width || w, sh = win?.screen?.height || h;
      const long = Math.max(sw, sh, w, h), short = Math.max(Math.min(sw, sh), Math.min(w, h));
      const cm = cmPerPixel(view.inches, long, short);
      return { cm, W: w * cm, Hs: h * cm, screenPx: [long, short] };
    }
    const eyesFor = (pg, scale) => tableEyes({ W: pg.W, Hs: pg.Hs, R: view.R, a: view.a, ipd: view.ipd, near, far, scale });
    /**
     * Everything that follows from the step, the screen and the seat. His head looks at the viewer, so his pose depends a little on
     * where the eyes are, which depends on his height in that pose and on where he stands: three rounds settle it (the last moves
     * nothing that shows). His picture is bounded over his breathing, every vertex of his skin through both eyes.
     */
    function solve() {
      const pg = page();
      const N = view.steps[view.index];
      let { scale, origin } = view;
      let eyes = eyesFor(pg, scale);
      let clouds = [];
      for (let round = 0; round < 3; round++) {
        eyePoint.set(origin[0] + eyes.mid.x, eyes.mid.y, origin[1] + eyes.mid.z);
        for (let i = 0; i < SETTLE; i++) mosi.update(0.1);
        // one whole turn of his idle, so he is left at the moment of it he was at
        clouds = [];
        for (let i = 0; i < PHASES; i++) { mosi.update(cycle / PHASES); clouds.push(cloud()); }
        let top = 0;
        for (const c of clouds) for (let i = 1; i < c.length; i += 3) if (c[i] > top) top = c[i];
        scale = top / N; // metres in a cm: his highest point, at the top of a breath, is N cm over the screen
        eyes = eyesFor(pg, scale);
        origin = centreOnTable(clouds, [eyes.left, eyes.right], origin);
      }
      eyePoint.set(origin[0] + eyes.mid.x, eyes.mid.y, origin[1] + eyes.mid.z);
      const box = outlineBox(clouds, [eyes.left, eyes.right], origin);
      const margins = marginsOf(box, pg.W * scale, pg.Hs * scale);
      const least = Math.min(margins.left, margins.right, margins.top, margins.bottom);
      // the least margin in cm, on the side it is on
      const leastCm = Math.min(margins.left * pg.W, margins.right * pg.W, margins.top * pg.Hs, margins.bottom * pg.Hs);
      Object.assign(view, { ...pg, height: N, metres: N * scale, scale, origin, eyes, box, margins, least, leastCm, fits: least >= MARGIN - 1e-9, dirty: false, solves: view.solves + 1 });
      // the director's camera, which picks his level of detail and aims the sun's shadow: straight above the page, as high as the
      // eyes, seeing the page and a twentieth more (so he is as big to it as to the eyes, which see exactly the page, and his level
      // of detail is the one they need; director.effectiveFov widens a lens on a screen narrower than 16:10)
      const half = (0.525 * pg.Hs) / eyes.height;
      const aspect = pg.W / pg.Hs;
      view.centreFov = deg(2 * Math.atan(aspect >= 1.6 ? half : (half * aspect) / 1.6));
      // the seat's own view (sjon=1): from between the eyes at the screen's centre, the whole rectangle inside the frame
      let tan = 0;
      const seat = new THREE.PerspectiveCamera();
      seat.position.set(0, eyes.height, eyes.height / Math.tan(rad(view.a)));
      seat.lookAt(0, 0, 0);
      seat.updateMatrixWorld(true);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        p.set((x * pg.W) / 2, 0, (z * pg.Hs) / 2).applyMatrix4(seat.matrixWorldInverse);
        tan = Math.max(tan, Math.abs(p.y / p.z), Math.abs(p.x / p.z) / aspect);
      }
      view.seatFov = deg(2 * Math.atan(tan / 0.86));
      frame.scale.set(pg.W * scale, 1, pg.Hs * scale);
      frame.position.set(origin[0], 0, origin[1]);
      label();
    }

    // ---- the screen's rectangle on the ground, for the seat's view only: four plain strips ----
    const frame = new THREE.Group();
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
    frame.visible = SJON;
    scene.add(frame);

    // ---- the page's own things ----
    const ui = typeof document !== 'undefined' ? tableUi(document, {
      step: d => { view.index = Math.min(view.steps.length - 1, Math.max(0, view.index + d)); view.dirty = true; },
      screen: d => { view.inches = Math.min(SCREEN.max, Math.max(SCREEN.min, Math.round((view.inches + d * SCREEN.step) / SCREEN.step) * SCREEN.step)); view.dirty = true; },
    }) : null;
    if (MONO) ui?.element.classList.add('bord-mono');
    if (MONO && typeof document !== 'undefined') document.body.classList.add('bord-mono');
    function label() {
      if (!ui) return;
      const tight = view.fits ? '' : view.least < 0 ? ` · kemst ekki fyrir (${tala(-view.leastCm)} cm út fyrir)` : ` · þröngt (${tala(view.leastCm)} cm að brún)`;
      ui.label.textContent = `Mosi ${tala(view.height)} cm · skjár ${tala(view.inches)} tommur · ${view.index + 1} af ${view.steps.length}${tight}`;
    }
    win?.addEventListener('resize', () => { view.dirty = true; });

    // ---- the cameras ----
    // the director's: straight above the page (a hair toward the viewer, so its "up" is the screen's top)
    director.drive('borð', rig => {
      const h = view.eyes.mid.y;
      rig.position.set(view.origin[0], h, view.origin[1] + h * 0.02);
      rig.target.set(view.origin[0], 0, view.origin[1]);
      rig.fov = view.centreFov;
    });
    // the two eyes, placed here at every draw (engine/gler.js setEyes). Without the glasses (gler=0, sjon=1) both are the one point
    // between the eyes and the left one's picture is shown as it is (the glasses' own check, `pass`).
    const at = [0, 0, 0];
    function seatView(eye) {
      eye.position.set(at[0], view.eyes.mid.y, at[2] + view.eyes.mid.z);
      eye.up.set(0, 1, 0);
      eye.lookAt(at[0], 0, at[2]);
      eye.fov = view.seatFov; eye.aspect = camera.aspect; eye.near = near; eye.far = far;
      eye.updateProjectionMatrix();
      eye.updateMatrixWorld(true);
    }
    if (gler) {
      gler.enable(true);
      if (MONO) gler.settings.method = 'pass';
      gler.setEyes((eyes, centre) => {
        at[0] = view.origin[0]; at[2] = view.origin[1];
        if (SJON) eyes.forEach(seatView);
        else {
          placeEye(eyes[0], MONO ? view.eyes.mid : view.eyes.left, at);
          placeEye(eyes[1], MONO ? view.eyes.mid : view.eyes.right, at);
        }
        for (const eye of eyes) eye.layers.mask = centre.layers.mask;
      });
    }

    /**
     * The numbers, as he stands now: every vertex of his skin through the two eye cameras the picture is drawn with (the glasses'
     * own while they are on), read where it lands on the page. Lengths in cm, shares of the page's width or depth.
     */
    function measure() {
      const { W, Hs, scale, eyes } = view;
      at[0] = view.origin[0]; at[2] = view.origin[1];
      const through = !MONO && gler ? gler.eyes : [placeEye(new THREE.PerspectiveCamera(), eyes.left, at), placeEye(new THREE.PerspectiveCamera(), eyes.right, at)];
      const c = cloud();
      const ndc = new THREE.Vector3();
      const box = [[Infinity, -Infinity, Infinity, -Infinity], [Infinity, -Infinity, Infinity, -Infinity]];
      let top = 0;
      for (let i = 0; i < c.length; i += 3) {
        if (c[i + 1] > c[top + 1]) top = i;
        through.forEach((eye, e) => {
          ndc.set(c[i], c[i + 1], c[i + 2]).project(eye);
          const b = box[e];
          if (ndc.x < b[0]) b[0] = ndc.x;
          if (ndc.x > b[1]) b[1] = ndc.x;
          if (ndc.y < b[2]) b[2] = ndc.y;
          if (ndc.y > b[3]) b[3] = ndc.y;
        });
      }
      const share = { left: (Math.min(box[0][0], box[1][0]) + 1) / 2, right: (1 - Math.max(box[0][1], box[1][1])) / 2, top: (1 - Math.max(box[0][3], box[1][3])) / 2, bottom: (Math.min(box[0][2], box[1][2]) + 1) / 2 };
      const least = Math.min(share.left, share.right, share.top, share.bottom);
      // his highest point: its two pictures on the page
      const h = c[top + 1] / scale;
      const xs = through.map(eye => (ndc.set(c[top], c[top + 1], c[top + 2]).project(eye).x * W) / 2);
      // the ground under his feet and at the page's corners: where both eyes draw it
      const ground = [[at[0], 0, at[2]], [at[0] + 0.4 * W * scale, 0, at[2] - 0.4 * Hs * scale], [0, 0, 0]].map(g => {
        const [l, r] = through.map(eye => (ndc.set(...g).project(eye).x * W) / 2);
        return l - r;
      });
      // what the viewer sees: each vertex seen straight from an eye, against its picture on the screen seen from that eye (px apart)
      let seen = 0;
      const eyeCam = new THREE.PerspectiveCamera(view.seatFov, W / Hs, near, far);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), flat = [0, 0];
      for (const eye of [eyes.left, eyes.right]) {
        eyeCam.position.set(at[0] + eye.x, eye.y, at[2] + eye.z);
        eyeCam.lookAt(at[0], 0, at[2]);
        eyeCam.updateMatrixWorld(true);
        for (let i = 0; i < c.length; i += 3 * 37) {
          a.set(c[i], c[i + 1], c[i + 2]).project(eyeCam);
          onTable({ x: at[0] + eye.x, y: eye.y, z: at[2] + eye.z }, c[i], c[i + 1], c[i + 2], flat);
          b.set(flat[0], 0, flat[1]).project(eyeCam);
          seen = Math.max(seen, Math.hypot(((a.x - b.x) * (win?.innerWidth ?? 1280)) / 2, ((a.y - b.y) * (win?.innerHeight ?? 800)) / 2));
        }
      }
      // and from the point between the eyes: is his picture inside the rectangle there (the seat's view, sjon=1)
      const seat = marginsOf(outlineBox([c], [eyes.mid], view.origin), W * scale, Hs * scale);
      const r3 = x => Math.round(x * 1000) / 1000;
      return {
        mode: view.mode, through: !MONO && gler ? 'the glasses\' eye cameras' : 'eye cameras made for the measure',
        page: { px: [win?.innerWidth, win?.innerHeight], screenPx: view.screenPx, screenSaid: [win?.screen?.width, win?.screen?.height], inches: view.inches, cmPerPx: view.cm, W: r3(W), Hs: r3(Hs) },
        seat: { R: view.R, a: view.a, ipd: view.ipd, eyeHeight: r3(eyes.height) },
        mosi: { step: view.index + 1, of: view.steps.length, cm: view.height, metres: r3(view.metres), metresPerCm: r3(scale), turn: view.turn, vertices: c.length / 3, origin: view.origin.map(r3) },
        top: { cm: r3(h), parallaxCm: r3(xs[0] - xs[1]), formulaCm: r3(parallaxAt(h, eyes.height, view.ipd)), share: r3((xs[0] - xs[1]) / W) },
        margins: { share: Object.fromEntries(Object.entries(share).map(([k, v]) => [k, r3(v)])), cm: { left: r3(share.left * W), right: r3(share.right * W), top: r3(share.top * Hs), bottom: r3(share.bottom * Hs) }, least: r3(least), fits: least >= MARGIN - 1e-9 },
        solved: { margins: Object.fromEntries(Object.entries(view.margins).map(([k, v]) => [k, r3(v)])), fits: view.fits, label: ui?.label.textContent ?? null },
        groundParallaxCm: ground.map(x => Math.round(x * 1e6) / 1e6),
        seenErrorPx: Math.round(seen * 1000) / 1000,
        seatMargins: Object.fromEntries(Object.entries(seat).map(([k, v]) => [k, r3(v)])),
        level: skins().map(m => m.geometry.index?.count ?? 0),
      };
    }
    world.bord = { view, measure, solve, mosi };

    // ---- every frame: a new step, screen or page size is solved before anything is drawn with it ----
    solve();
    s.after(0, function* keep() {
      for (;;) {
        if (view.dirty) solve();
        yield;
      }
    });

    yield s.ready();
    if (ui) document.body.append(ui.element);
    yield s.fade(0, 1);
    for (;;) yield;
  },
};
