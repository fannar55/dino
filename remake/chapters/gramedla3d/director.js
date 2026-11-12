// Grameðla kemur!'s director (chapters/gramedla3d.js): every frame it puts everything where the timeline says for a second of the
// show (timeline.js): Grameðla's place, lean and clips, the butterfly, the flock, Flugeðla with Egill, the specks, the trees and the
// mist. The show calls it with the show's second; the review page (?lykill=N) with its key's.
import * as THREE from 'three';
import { HERO } from '../../world/forest/butterflies.js';
import { KEYS, GROUPS } from './keys.js';
import { gramAt, butterflyAt, birdsAt, flugedlaAt, specksAt, treesAt, mistAt, cues, between, WALK_IN } from './timeline.js';

const CLIPS = ['idle', 'walk', 'roar'];
// the morning mist far up the lane as it looks on the screen (sampled from a plain capture at 20 s, where she starts)
const MIST_COLOUR = new THREE.Color('#bccbc6');

/**
 * Her poses for the keys she is in, solved on the stage (pose.js): frame 4a standing up the lane, the others leaning so her nearest
 * skin is at the row's k. Each solved held in its row's clip and second.
 */
export function solveRig(pose) {
  const rig = {};
  for (const key of KEYS) {
    const g = key.gram;
    if (!g) continue;
    pose.hold(g.clip ?? 'idle', g.at ?? 0);
    rig[key.id] = g.stand ? pose.standAt(g.stand) : pose.solveNearest(g);
  }
  return rig;
}

export function createDirector(world, { stage, D, pose, cast, gram, rig, away, nearInfo }) {
  const { stageCam, framePoint, frameOf } = stage;
  const all = cues(rig);
  const beatSteps = all.steps.filter(s => s.t <= WALK_IN.to);
  const v = new THREE.Vector3();
  cast.prepareTrees(nearInfo);
  cast.poseSpecks(Object.fromEntries(Object.keys(GROUPS).map(name => [name, { alpha: 0 }])), 0); // every group made now, none drawn

  // ---- Grameðla: her clips each a layer held at the second and weight the timeline gives, her root and lean after them ----
  gram.mixer.stopAllAction();
  const actions = Object.fromEntries(CLIPS.map(name => {
    const a = gram.mixer.clipAction(gram.clips.get(name));
    a.setLoop(THREE.LoopRepeat, Infinity);
    return [name, a];
  }));
  let her = null; // the timeline's Grameðla this frame
  gram.setOverlay(null);
  // far up the lane she is in the morning haze: her own colours fade toward the mist's (her albedo down, the mist's colour as her
  // emissive), and at the very start she is drawn faint as well (timeline.js HAZE). Her materials are hers alone (one trex).
  const hazed = [];
  gram.model.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m || hazed.some(h => h.m === m) || !m.color) continue;
      hazed.push({ m, colour: m.color.clone(), emissive: m.emissive?.clone() ?? null, transparent: m.transparent, opacity: m.opacity });
    }
  });
  const meshes = [];
  gram.model.traverse(o => { if (o.isMesh) meshes.push({ o, cast: o.castShadow }); });
  let hazeNow = -1, seenNow = -1;
  function poseHaze(haze, seen) {
    if (Math.abs(haze - hazeNow) < 1e-4 && Math.abs(seen - seenNow) < 1e-4) return;
    hazeNow = haze; seenNow = seen;
    for (const h of hazed) {
      h.m.color.copy(h.colour).multiplyScalar(1 - haze);
      if (h.emissive) h.m.emissive.copy(h.emissive).lerp(MIST_COLOUR, haze);
      const faint = seen < 0.999;
      if (h.m.transparent !== (faint || h.transparent)) { h.m.transparent = faint || h.transparent; h.m.needsUpdate = true; }
      h.m.opacity = h.opacity * seen;
    }
    // no shadow from her while she is still mostly haze (it would lie on the lane before she is there)
    for (const { o, cast } of meshes) o.castShadow = cast && haze < 0.5;
  }
  gram.control(() => {
    if (!her) {
      gram.place(away[0], away[1]);
      gram.root.visible = false;
      return;
    }
    gram.root.visible = her.seen > 0.003;
    poseHaze(her.haze ?? 0, her.seen ?? 1);
    for (const name of CLIPS) {
      const a = actions[name];
      const layer = her.layers.find(l => l.clip === name);
      if (!layer) { a.enabled = false; continue; }
      if (!a.isScheduled()) a.play();
      a.enabled = true;
      a.setEffectiveTimeScale(0);
      a.setEffectiveWeight(layer.weight);
      a.time = layer.time;
    }
    pose.at(her.x, her.z);
  }, () => { if (her) pose.leanNow(her); });

  // ---- the butterfly: its mode changes start a flight (butterflies.js follow or land); the flight reads this frame's place ----
  const bf = cast.butterflies;
  let flyMode = null, fly = null;
  const snoutFrame = () => frameOf(pose.snout(v), stageCam, D);
  const onSnout = out => pose.snout(out).add(new THREE.Vector3(0, 0.02, 0));
  function flyPath(out) {
    if (!fly) return out.set(0, -200, 0);
    if (fly.mode === 'at') return framePoint(...fly.at, out, stageCam, D);
    if (fly.mode === 'approach') {
      const s = snoutFrame();
      return framePoint(...between(fly.from, [s[0], s[1] - 0.01, s[2]], fly.e), out, stageCam, D);
    }
    if (fly.mode === 'lift') {
      const s = snoutFrame();
      return framePoint(...between([s[0], s[1] - 0.01, s[2]], fly.to, fly.e), out, stageCam, D);
    }
    return out.set(0, -200, 0);
  }
  function poseButterfly(state) {
    fly = state;
    if (!bf || state.mode === flyMode) return;
    flyMode = state.mode;
    if (state.mode === 'snout') {
      // sitting on her snout tip: on it at once, then settled there (its wings closed: butterflies.js's landing)
      bf.follow(HERO, onSnout, { snap: true });
      bf.land(() => pose.snout(new THREE.Vector3()), { name: HERO, duration: 0.25 });
    } else bf.follow(HERO, flyPath, { snap: true });
  }

  // ---- the mist: its cards' level and a slow sway ----
  const mists = (world.forest?.mists ?? []).map(m => ({ m, level: m.level, x: m.group.position.x }));
  function poseMist(state) {
    for (const { m, level, x } of mists) {
      m.setLevel(level * state.level);
      m.group.position.x = x + state.sway;
    }
  }

  const now = { t: null, gram: null, butterfly: null, birds: null, flugedla: null, specks: null, trees: null };
  /** Everything where it is at second t of the show. */
  function apply(t) {
    now.t = t;
    her = now.gram = gramAt(t, rig);
    poseButterfly(now.butterfly = butterflyAt(t));
    cast.poseBirds(now.birds = birdsAt(t));
    cast.poseFlugedla(now.flugedla = flugedlaAt(t));
    cast.poseSpecks(now.specks = specksAt(t), t);
    cast.poseTrees(now.trees = treesAt(t, beatSteps), nearInfo);
    poseMist(mistAt(t));
  }
  /** Start again from the top (the end card's "Aftur"): the butterfly's flight is begun again by its next mode. */
  function reset() { flyMode = null; }

  return { apply, reset, now, cues: all, rig };
}
