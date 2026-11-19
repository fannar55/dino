// Grameðla kemur! (?chapter=gramedla3d): the second show for red/cyan glasses, built for them (the plan:
// docs/superpowers/specs/2026-11-12-gramedla-kemur-3d-design.md). A new clearing in the forest with a lane running straight away from
// the still camera into the morning mist, and Grameðla coming up it until her head is out of the screen.
//
//   ?chapter=gramedla3d                the show: the glasses start, about 85 seconds, the end card ("Aftur" plays it again)
//   ?chapter=gramedla3d&kvordun=1      step 0, the calibration (gramedla3d/calibration.js): the owner chose "4% 0,02"
//   ?chapter=gramedla3d&lykill=3       step 1, the key frames (gramedla3d/keys.js): the show stopped at each key's second; arrows
//                                      (or the buttons) step through them
//
// One job a file, in gramedla3d/: stage.js (the camera, the screen plane, the lane and the forest), keys.js (the key frames as data),
// timeline.js (the motion between them, and the sound's cues), director.js (puts everything where the timeline says), pose.js (her
// lean, solved to a snout place), cast.js (the butterfly, the flock, Flugeðla with Egill, the specks, the trees' bend), measure.js
// (the numbers), review.js (the review page's controls) and calibration.js (step 0).
import { createStage } from '../engine/stage3d.js';
import { endCard, glassesStart } from '../engine/book/show-cards.js';
import { leaveShow } from '../engine/book/show-player.js';
import { CAMERA, LOOK, FOV, D, GROUND_SHARE, GRASS, LAYOUT, nearLane, nearInfo } from './gramedla3d/stage.js';
import { createGramPose } from './gramedla3d/pose.js';
import { createCast } from './gramedla3d/cast.js';
import { KEYS, keyIndex, outOf } from './gramedla3d/keys.js';
import { LENGTH, FADE, BEATS } from './gramedla3d/timeline.js';
import { createDirector, solveRig } from './gramedla3d/director.js';
import { createMeasure } from './gramedla3d/measure.js';
import { runCalibration } from './gramedla3d/calibration.js';
import { reviewUi, pct } from './gramedla3d/review.js';
import { soundEvents, LINES } from './gramedla3d/soundtrack.js';
import { createShowSounds } from './gramedla3d/sounds.js';

export { CAMERA, D, LANE, keepOut, leaveOut } from './gramedla3d/stage.js';

const CHARS = '../assets/characters/';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const KVORDUN = params.get('kvordun') === '1';
const LYKILL = params.has('lykill');
const AWAY = [0, -400]; // where an actor not on the stage stands (and is hidden)

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
  cast: { egill: { name: 'Egill' } },
  // Egill's two lines (soundtrack.js LINES), heard only: the show keeps text off the screen (spec rule 8)
  lines: Object.fromEntries(Object.entries(LINES).map(([id, text]) => [id, { text, audio: id }])),
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

    // the glasses' own settings held: the show's strength is the owner's 0.02 (the calibration's own on its page), the screen plane
    // where it is (pop 1); nothing is saved
    const hold = () => {
      if (!gler) return;
      gler.settings.strength = hold.strength?.() ?? 0.02;
      gler.settings.pop = 1;
      gler.setPlane(D, { jump: true });
    };
    hold();
    s.after(0, function* keep() { for (;;) { hold(); camera.updateMatrixWorld(); yield; } });
    const shot = { position: stage.camPos.toArray(), target: stage.camTarget.toArray(), fov: FOV, label: 'gramedla' };
    yield s.camera.cut(shot, { check: false });

    const state = { pitch: stage.pitch, stagePitch: stage.stagePitch, snoutLocal: pose.snoutLocal.toArray(), solution: null, key: null };
    world.gramedla = { state, stage, pose, keys: KEYS, gram };
    const cast = createCast(world, { stage, D, flugedla: s.actor('flugedla').raw, egill: s.actor('egill').raw });

    if (KVORDUN) {
      cast.poseSpecks({ motesFar: { alpha: 1 } }, 0);
      const cal = runCalibration(world, { gram, pose, stage, D, GRASS, GROUND_SHARE, nearLane, params, hold });
      Object.assign(world.gramedla, { view: cal.view, measure: cal.measure, show: cal.show });
      Object.assign(state, { solved: cal.solved, view: cal.view });
      yield s.ready();
      yield s.fade(0, 1);
      for (;;) yield;
    }

    // ---- the show and its key frames: one timeline (gramedla3d/timeline.js), her poses for the keys solved first ----
    const rig = solveRig(pose);
    const director = createDirector(world, { stage, D, pose, cast, gram, rig, away: AWAY, nearInfo });
    let birdsIn = false;
    cast.birdsReady.then(() => { birdsIn = true; });
    yield s.until(() => cast.riding !== null && birdsIn);
    const { measure, skinOf, lead, sample } = createMeasure(world, { stage, D, GRASS, GROUND_SHARE, pose, cast, nearLane, gram, director });
    Object.assign(world.gramedla, { cast, rig, director, measure, sample, skinOf, outOf, cues: director.cues, length: LENGTH, beats: BEATS });

    // the second of the show the stage is at: the show's own clock, or the review page's key
    const clock = { t: 0, from: null };
    // the sound (the show only): soundtrack.js's events, each handed out as the show's second passes it
    const track = { events: [], next: 0, fire: null };
    s.after(0, function* run() {
      for (;;) {
        const t = clock.from === null ? clock.t : Math.min(LENGTH, s.time - clock.from);
        state.t = t;
        director.apply(t);
        if (clock.from !== null && track.fire) while (track.next < track.events.length && track.events[track.next].t <= t) track.fire(track.events[track.next++]);
        yield;
      }
    });

    if (LYKILL) {
      const view = { index: keyIndex(params.get('lykill')) };
      const show = index => {
        view.index = index;
        state.key = KEYS[index].id;
        clock.t = KEYS[index].time;
        sync();
        return KEYS[index].id;
      };
      let labelIn = -1; // frames until the label measures its frame (once everything is drawn where it is)
      const ui = typeof document !== 'undefined' ? reviewUi(document, { step: d => show((view.index + d + KEYS.length) % KEYS.length) }) : null;
      // the label: which frame, and how far its lead is out as measured (a frame later, once everything is drawn where it is)
      function sync() {
        if (!ui) return;
        const key = KEYS[view.index];
        ui.label.textContent = `Lykilrammi ${key.n}${key.variant ?? ''} af 7 · ${key.name}`;
        labelIn = 3;
      }
      function label() {
        const key = KEYS[view.index];
        const out = lead(key).out;
        const said = out == null ? '' : out >= 0.05 ? ` · ${key.leadText} ${pct(out)} út` : out > -0.05 ? ` · ${key.leadText} við skjáinn` : ` · ${key.leadText} ${pct(-out)} inn`;
        ui.label.textContent = `Lykilrammi ${key.n}${key.variant ?? ''} af 7 · ${key.name}${said}`;
      }
      s.after(0, function* labels() { for (let n = 0; ; n++) { if (ui && ((labelIn > 0 && --labelIn === 0) || n % 15 === 0)) label(); yield; } });
      Object.assign(world.gramedla, { view, show: async i => show(i), measure: () => measure(KEYS[view.index]) });
      show(view.index);
      yield s.wait(0.1);
      if (ui) document.body.append(ui.element);
      yield s.ready();
      yield s.fade(0, 1);
      for (;;) yield;
    }

    // ---- the show: the glasses' start (chapter.startButton), then the timeline from the top, then the end card ----
    // Its sound: no music (the theme held at nothing), the game's forest under everything, the recordings (gramedla3d/sounds.js) on
    // the page's output held with the game, Egill's lines heard only. The glasses' tap is the touch that lets sound begin; a capture
    // has no sound at all, and its seek hands out only the lines (his mouth) and the forest's wishes, which sound nowhere.
    const sounds = createShowSounds({ context: world.sound?.context ?? null, output: world.sound?.output ?? null });
    if (!s.seeking) world.sound?.hold?.(sounds);
    world.music?.setLevel?.(0, 0);
    track.events = soundEvents(rig);
    track.fire = e => {
      if (e.line) s.say('egill', e.line, { hold: 0, caption: false, listen: false });
      else if (e.bed !== undefined) s.sfx('forest', { level: e.bed, seconds: e.seconds });
      else if (e.sfx) s.sfx(e.sfx, e.detail);
      else if (!s.seeking) sounds.play(e);
    };
    world.gramedla.sound = { events: track.events, sounds };
    clock.t = 0;
    director.apply(0);
    yield s.ready();
    for (;;) {
      director.reset();
      sounds.stop(); // "Aftur" starts clean
      track.next = 0;
      clock.from = s.time;
      state.showing = true;
      yield s.fade(1, 0);
      s.after(FADE.in[0], () => s.fade(0, FADE.in[1] - FADE.in[0]));
      yield s.until(() => s.time - clock.from >= FADE.out[0]);
      yield s.fade(1, FADE.out[1] - FADE.out[0]);
      yield s.until(() => s.time - clock.from >= LENGTH);
      state.showing = false;
      // the end card: "Aftur" plays it again, "Hætta" leaves (the book's frame closes; on its own, the game's start)
      let again = false;
      const { element: end } = endCard(document, { onAgain: () => { again = true; }, onQuit: () => { sounds.stop(); s.sfx('forest', { level: 0 }); leaveShow(window); } });
      document.body.append(end);
      try {
        yield s.until(() => again);
      } finally {
        end.remove();
      }
      clock.from = null;
      clock.t = 0;
    }
  },
};
