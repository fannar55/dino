// Grameðla kemur! (?chapter=gramedla3d): the second show for red/cyan glasses, built for them (the plan:
// docs/superpowers/specs/2026-11-12-gramedla-kemur-3d-design.md). A new clearing in the forest with a lane running straight away from
// the still camera into the morning mist, and Grameðla coming up it until her head is out of the screen.
//
//   ?chapter=gramedla3d&kvordun=1      step 0, the calibration (gramedla3d/calibration.js): the owner chose "4% 0,02"
//   ?chapter=gramedla3d&lykill=3       step 1, the key frames (gramedla3d/keys.js): arrows (or the buttons) step through them
//
// One job a file, in gramedla3d/: stage.js (the camera, the screen plane, the lane and the forest), pose.js (her lean, solved to a
// snout place), keys.js (the key frames as data), cast.js (the butterfly, the flock, Flugeðla with Egill, the specks, the trees'
// bend), measure.js (the numbers), review.js (the review pages' controls) and calibration.js (step 0).
import * as THREE from 'three';
import { createStage } from '../engine/stage3d.js';
import { endCard, glassesStart } from '../engine/book/show-cards.js';
import { leaveShow } from '../engine/book/show-player.js';
import { CAMERA, LOOK, FOV, D, GROUND_SHARE, GRASS, LAYOUT, nearLane, nearInfo } from './gramedla3d/stage.js';
import { createGramPose } from './gramedla3d/pose.js';
import { createCast } from './gramedla3d/cast.js';
import { KEYS, keyIndex, outOf } from './gramedla3d/keys.js';
import { createMeasure } from './gramedla3d/measure.js';
import { runCalibration } from './gramedla3d/calibration.js';
import { reviewUi, pct } from './gramedla3d/review.js';

export { CAMERA, D, LANE, keepOut, leaveOut } from './gramedla3d/stage.js';

const CHARS = '../assets/characters/';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const KVORDUN = params.get('kvordun') === '1';
const LYKILL = params.has('lykill');
const AWAY = [0, -400]; // where an actor not in a frame stands (and is hidden)

export const chapter = {
  id: 'gramedla3d',
  title: 'Grameðla kemur!',
  look: 'morning',
  gler: { panel: false },
  startButton: glassesStart,
  layout: LAYOUT,
  actors: {
    gramedla: { url: CHARS + 'trex.glb', position: [0, 0, -6], heading: 90 },
    flugedla: { url: CHARS + 'pteranodon.glb', position: [AWAY[0] + 6, 0, AWAY[1]], heading: 90 },
    egill: { url: CHARS + 'egill.glb', position: [AWAY[0] - 6, 0, AWAY[1]], heading: 90 },
  },
  cast: {},
  lines: {},
  startShot: 'show',
  shots: {
    show: { position: CAMERA, target: [CAMERA[0], CAMERA[1] + 1.2, CAMERA[2] - 10], fov: FOV },
  },

  *script(s) {
    const gram = s.actor('gramedla').raw;
    const world = gram.world;
    const { camera, gler } = world;
    const plane = () => gler?.plane ?? D;
    const stage = createStage(world, { position: CAMERA, look: LOOK, fov: FOV, groundShare: GROUND_SHARE, depth: D, plane });
    stage.D = D;
    camera.position.copy(stage.camPos); // her head aims at the screen's camera: it stands where the stage's does
    const pose = createGramPose(gram, stage, camera);

    // the review pages hold the glasses' own settings: the strength (the calibration's, else the owner's 0.02), the screen plane
    // where it is (pop 1); nothing is saved
    const hold = () => {
      if (!gler) return;
      if (KVORDUN || LYKILL) {
        gler.settings.strength = hold.strength?.() ?? 0.02;
        gler.settings.pop = 1;
      }
      gler.setPlane(D, { jump: true });
    };
    hold();
    s.after(0, function* keep() { for (;;) { hold(); camera.updateMatrixWorld(); yield; } });
    const shot = { position: stage.camPos.toArray(), target: stage.camTarget.toArray(), fov: FOV, label: 'gramedla' };
    yield s.camera.cut(shot, { check: false });

    const cast = createCast(world, { stage, D, flugedla: s.actor('flugedla').raw, egill: s.actor('egill').raw, gram, snout: out => pose.snout(out) });
    const { measure } = createMeasure(world, { stage, D, GRASS, GROUND_SHARE, pose, cast, nearLane, gram });
    cast.setButterfly(null);
    cast.setFlugedla(null);

    const state = { pitch: stage.pitch, stagePitch: stage.stagePitch, snoutLocal: pose.snoutLocal.toArray(), solution: null, key: null };
    world.gramedla = { state, stage, pose, cast, keys: KEYS };

    if (KVORDUN || !LYKILL) {
      cast.setParticles(['motesFar']);
      if (KVORDUN) {
        const cal = runCalibration(world, { gram, pose, stage, D, GRASS, GROUND_SHARE, nearLane, params, hold });
        Object.assign(world.gramedla, { view: cal.view, measure: cal.measure, show: cal.show });
        Object.assign(state, { solved: cal.solved, view: cal.view });
        yield s.ready();
        yield s.fade(0, 1);
        for (;;) yield;
      }
      const sol = pose.solve({ k: 0.334 });
      pose.apply(sol);
      gram.setOverlay(() => pose.apply(sol));
      // the show itself comes in step 2; until then the stage, the end card after a while
      yield s.ready();
      yield s.fade(0, 1.5);
      yield s.wait(20);
      yield s.fade(1, 1);
      let again = false;
      const { element: end } = endCard(document, { onAgain: () => { again = true; }, onQuit: () => leaveShow(window) });
      document.body.append(end);
      yield s.until(() => again);
      end.remove();
      return;
    }

    // ---- the key frames: each set from its row of the table alone ----
    const solutions = new Map();
    const view = { index: keyIndex(params.get('lykill')), busy: null };
    let current = null;
    gram.setOverlay(() => { if (current) pose.apply(current); });
    async function show(index) {
      view.index = index;
      const key = KEYS[index];
      state.key = key.id;
      const g = key.gram;
      if (g) {
        pose.hold(g.clip ?? 'idle', g.at ?? 0);
        if (!solutions.has(index)) solutions.set(index, g.stand ? pose.standAt(g.stand) : pose.solve(g));
        current = solutions.get(index);
        pose.apply(current);
        gram.root.visible = true;
      } else {
        current = { x: AWAY[0], z: AWAY[1], theta: 0, turn: 0 };
        pose.hold('idle', 0);
        pose.apply(current);
        gram.root.visible = false;
      }
      state.solution = current;
      cast.bendTrees(key.trees ?? null, nearInfo);
      cast.setParticles(key.particles ?? []);
      cast.setButterfly(key.butterfly ?? null);
      await cast.setBirds(key.birds ?? null);
      await cast.setFlugedla(key.flugedla ?? null);
      hold();
      return key;
    }
    const go = index => (view.busy = show(index).then(() => { view.busy = null; sync(); }));
    let labelIn = -1; // frames until the label measures its frame (once everything is drawn where it is)
    const ui = typeof document !== 'undefined' ? reviewUi(document, { step: d => go((view.index + d + KEYS.length) % KEYS.length) }) : null;
    // the label: which frame, and how far its lead is out as measured (a frame later, once everything is drawn where it is)
    function sync() {
      if (!ui) return;
      const key = KEYS[view.index];
      ui.label.textContent = `Lykilrammi ${key.n}${key.variant ?? ''} af 7 · ${key.name}`;
      labelIn = 3;
    }
    function label() {
      const key = KEYS[view.index];
      const out = measure(key).lead.out;
      const said = out == null ? '' : out >= 0.05 ? ` · ${key.leadText} ${pct(out)} út` : out > -0.05 ? ` · ${key.leadText} við skjáinn` : ` · ${key.leadText} ${pct(-out)} inn`;
      ui.label.textContent = `Lykilrammi ${key.n}${key.variant ?? ''} af 7 · ${key.name}${said}`;
    }
    s.after(0, function* labels() { for (;;) { if (labelIn > 0 && --labelIn === 0 && !view.busy) label(); yield; } });
    Object.assign(world.gramedla, {
      view,
      show: async i => { await view.busy; await show(i); sync(); return KEYS[i].id; },
      measure: () => measure(KEYS[view.index]),
      outOf,
    });
    go(view.index);
    yield s.until(() => !view.busy);
    if (ui) document.body.append(ui.element);
    yield s.ready();
    yield s.fade(0, 1);
    for (;;) yield;
  },
};
