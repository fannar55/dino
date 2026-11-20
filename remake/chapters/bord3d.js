// Borðmynd (?chapter=bord3d): a trial "phantogram" of Mosi, a 3D picture for a screen LYING FLAT on a table, watched through the
// red/cyan glasses from one seat, looking down at it at about 45 degrees. Mosi stands on the screen, facing the viewer turned a
// little to one side, and looks up at the viewer's eyes; he breathes and blinks. The ground is the screen and his shadow lies on it.
// Nothing else: no forest, no sound, no speech, no end (the page stays).
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
// Only the screen's size is saved, on the device, for every table page (engine/table-stage.js, which has what the table pages share).
// world.bord.measure() gives the numbers (tools/bord3d-probe.mjs asks it).
import * as THREE from 'three';
import { glassesStart } from '../engine/book/show-cards.js';
import { onTable, parallaxAt, outlineBox, centreOnTable, marginsOf } from '../engine/table3d.js';
import { SCREEN, MARGIN, tableKnobs, screenSize, tablePage, createTableStage } from '../engine/table-stage.js';
import { tableUi, tableStart, tala } from '../engine/table-ui.js';

const CHARS = '../assets/characters/';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const { knob, seat: SEAT, sjon: SJON, mono: MONO, mode: MODE } = tableKnobs(params);

export const HEIGHTS = [4, 6, 8, 10]; // cm: Mosi's height on the table at each step
const HEIGHT = knob('haed', 6, 2, 20);
export { SCREEN, MARGIN, SEAT };
const TURN = knob('snu', 45, -90, 90); // degrees from facing the viewer, to the viewer's left: a quarter to one side
const SETTLE = 30; // steps of 0.1 s for his head to come to rest on a new look
const PHASES = 6; // moments of his breathing his picture is bounded over

export const chapter = {
  id: 'bord3d',
  title: 'Borðmynd',
  look: 'morning',
  gler: { panel: false },
  // the glasses start, as every show's, and one more line: how the screen must lie
  startButton: doc => tableStart(doc, glassesStart(doc, { more: 'Leggðu skjáinn flatan á borð og horfðu skáhallt niður á hann.' })),
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
    const { camera, scene } = world;
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
    const screen = screenSize(params);
    const view = {
      steps, index: steps.indexOf(HEIGHT), inches: screen.inches, ...SEAT, turn: TURN,
      mode: MODE, dirty: true, solves: 0,
      origin: [0, 0], scale: 0.7, eyes: null, box: null, margins: null, fits: false,
    };
    const near = camera.near, far = camera.far;
    // the cameras: the two eyes at the viewer's, the director's above the page (engine/table-stage.js)
    const stage = createTableStage(world, { seat: SEAT, sjon: SJON, mono: MONO });
    const page = () => tablePage(win, view.inches);
    const eyesFor = stage.eyesFor;
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
      // the picture is drawn with these from now on (the director's camera above the page picks his level of detail and aims the
      // sun's shadow; the seat's view and the screen's rectangle are for sjon=1)
      stage.use(pg, scale, origin, eyes);
      view.centreFov = stage.centreFov;
      view.seatFov = stage.seatFov;
      label();
    }

    // ---- the page's own things ----
    const ui = typeof document !== 'undefined' ? tableUi(document, {
      step: d => { view.index = Math.min(view.steps.length - 1, Math.max(0, view.index + d)); view.dirty = true; },
      screen: d => { view.inches = screen.step(d); view.dirty = true; }, // remembered on the device
      prev: 'Minni Mosi', next: 'Stærri Mosi',
    }) : null;
    if (MONO) ui?.element.classList.add('bord-mono');
    if (MONO && typeof document !== 'undefined') document.body.classList.add('bord-mono');
    function label() {
      if (!ui) return;
      const tight = view.fits ? '' : view.least < 0 ? ` · kemst ekki fyrir (${tala(-view.leastCm)} cm út fyrir)` : ` · þröngt (${tala(view.leastCm)} cm að brún)`;
      ui.label.textContent = `Mosi ${tala(view.height)} cm · skjár ${tala(view.inches)} tommur · ${view.index + 1} af ${view.steps.length}${tight}`;
    }
    win?.addEventListener('resize', () => { view.dirty = true; });

    /**
     * The numbers, as he stands now: every vertex of his skin through the two eye cameras the picture is drawn with (the glasses'
     * own while they are on), read where it lands on the page. Lengths in cm, shares of the page's width or depth.
     */
    function measure() {
      const { W, Hs, scale, eyes } = view;
      const at = stage.at();
      const through = stage.through();
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
        mode: view.mode, through: !MONO && world.gler ? 'the glasses\' eye cameras' : 'eye cameras made for the measure',
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
