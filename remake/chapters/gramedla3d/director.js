// Grameðla kemur!'s director (chapters/gramedla3d.js): every frame it puts everything where the timeline says for a second of the
// show (timeline.js): Grameðla's place, lean and clips, the butterfly, the flock, Flugeðla with Egill, the specks, the trees and the
// mist. The show calls it with the show's second; the review page (?lykill=N) with its key's.
import * as THREE from 'three';
import { HERO } from '../../world/forest/butterflies.js';
import { KEYS, GROUPS } from './keys.js';
import { createHaze } from './haze.js';
import { createVfx } from './vfx.js';
import { createAir } from './air.js';
import { gramAt, butterflyAt, birdsAt, flugedlaAt, specksAt, treesAt, mistAt, cues, between, WALK_IN, CUES, FLIGHT } from './timeline.js';

const CLIPS = ['idle', 'walk', 'roar'];
const smoothstep = x => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

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
  // far up the lane she is in the morning haze (haze.js; timeline.js HAZE): her colours toward the mist's, faint where she starts
  const herHaze = createHaze(gram.model);
  function setClips(g) {
    for (const name of CLIPS) {
      const a = actions[name];
      const layer = g.layers.find(l => l.clip === name);
      if (!layer) { a.enabled = false; continue; }
      if (!a.isScheduled()) a.play();
      a.enabled = true;
      a.setEffectiveTimeScale(0);
      a.setEffectiveWeight(layer.weight);
      a.time = layer.time;
    }
  }

  // ---- her footfalls on the ground (vfx.js): where each foot comes down, worked out once from her pose at its second ----
  const feet = ['LeftFoot', 'RightFoot'].map(n => gram.model.getObjectByName(n));
  const fp = [new THREE.Vector3(), new THREE.Vector3()], fwd = new THREE.Vector3();
  const footfalls = all.steps.map(s => {
    const g = gramAt(s.t, rig);
    setClips(g);
    gram.mixer.update(0);
    pose.at(g.x, g.z);
    gram.root.updateMatrixWorld(true);
    feet.forEach((f, i) => f.getWorldPosition(fp[i]));
    const down = fp[0].y <= fp[1].y ? fp[0] : fp[1]; // the foot that is down
    fwd.set(1, 0, 0).applyQuaternion(gram.root.quaternion).setY(0).normalize();
    const at = down.clone().addScaledVector(fwd, 0.35);
    at.y = world.heightAt(at.x, at.z);
    return { t: s.t, at, yaw: Math.atan2(-fwd.z, fwd.x), depth: s.depth };
  });
  // her breath: at each sniff and at the huff, timed to their sounds (soundtrack.js)
  const breaths = [...CUES.sniff.map(t => ({ t, spread: 0.32 })), { t: CUES.huff, spread: 0.5 }];
  const clampK = (q, kMin) => {
    const [u, vv, k] = frameOf(q, stageCam, D);
    return k < kMin ? framePoint(u, vv, kMin, q, stageCam, D) : q;
  };
  const UP = new THREE.Vector3(0, 1, 0);
  // the air (air.js): mist curling round her as she comes out, the lane swept by Flugeðla's brake, the crowns shaken by the roar
  const air = createAir(world, {
    herAt: t => { const g = gramAt(t, rig); return g && g.seen > 0.05 ? { x: g.x, z: g.z } : null; },
    brake: FLIGHT.brake[0], roar: [CUES.roar + 0.4, CUES.roar + 3.2], groundAt: (x, z) => world.heightAt(x, z), clampK,
  });
  const vfx = createVfx(world, { steps: footfalls, breaths, nostril: (i, out) => pose.nostril(i, out), headUp: out => out.copy(UP), headAhead: out => out.set(1, 0, 0).transformDirection(pose.bones.Head.matrixWorld), clampK });

  gram.control(() => {
    if (!her) {
      gram.place(away[0], away[1]);
      gram.root.visible = false;
      return;
    }
    gram.root.visible = her.seen > 0.003;
    herHaze.set(her.haze ?? 0, her.seen ?? 1);
    setClips(her);
    pose.at(her.x, her.z);
  }, () => {
    if (her) { pose.leanNow(her); gram.root.updateMatrixWorld(true); }
    if (now.t !== null) { vfx.pose(now.t); air.pose(now.t); } // after her head is posed: the breath leaves her nostrils as they are this frame
  });

  // ---- the butterfly: its mode changes start a flight (butterflies.js follow or land); the flight reads this frame's place ----
  const bf = cast.butterflies;
  let flyMode = null, fly = null;
  // It sits on the top of her snout (the ridge between her nostrils and her eyes, pose.snoutTop), its feet just above her skin and
  // its wings up over it; it comes down onto it from above and in front (a hover over her snout, nearer us), and lifts off the same
  // way: straight up and toward us first, then on to 7b. Never through her (measure.js counts its pieces inside her).
  const LANDED = 0.012; // m its feet over her skin
  const HOVER = { up: 0.3, near: 0.3 }; // m above the landing point and toward the camera: where it comes down from and lifts to
  const w1 = new THREE.Vector3(), w2 = new THREE.Vector3();
  const onTop = out => pose.snoutTop(out).addScaledVector(UP, LANDED);
  const hover = out => {
    onTop(out);
    w2.copy(stageCam.position).sub(out).setY(0).normalize();
    return out.addScaledVector(UP, HOVER.up).addScaledVector(w2, HOVER.near);
  };
  const DOWN_FROM = 0.7; // share of the approach spent flying to the hover; the rest coming down onto her snout
  const UP_TO = 0.4; // share of the lift spent rising to the hover; the rest flying on to 7b
  function flyPath(out) {
    if (!fly) return out.set(0, -200, 0);
    if (fly.mode === 'at') return framePoint(...fly.at, out, stageCam, D);
    if (fly.mode === 'approach') {
      hover(w1);
      if (fly.e < DOWN_FROM) return framePoint(...between(fly.from, frameOf(w1, stageCam, D), smoothstep(fly.e / DOWN_FROM)), out, stageCam, D);
      return out.lerpVectors(w1, onTop(w2), smoothstep((fly.e - DOWN_FROM) / (1 - DOWN_FROM)));
    }
    if (fly.mode === 'lift') {
      hover(w1);
      if (fly.e < UP_TO) return out.lerpVectors(onTop(w2), w1, smoothstep(fly.e / UP_TO));
      return framePoint(...between(frameOf(w1, stageCam, D), fly.to, smoothstep((fly.e - UP_TO) / (1 - UP_TO))), out, stageCam, D);
    }
    return out.set(0, -200, 0);
  }
  function poseButterfly(state) {
    fly = state;
    if (!bf || state.mode === flyMode) return;
    flyMode = state.mode;
    if (state.mode === 'snout') {
      // sitting on the top of her snout: on it at once, then settled there (its wings closed: butterflies.js's landing)
      bf.follow(HERO, onTop, { snap: true });
      bf.land(() => onTop(new THREE.Vector3()), { name: HERO, duration: 0.25 });
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
    cast.poseTrees(now.trees = treesAt(t, all.steps), nearInfo);
    poseMist(mistAt(t));
  }
  /** Start again from the top (the end card's "Aftur"): the butterfly's flight is begun again by its next mode. */
  function reset() { flyMode = null; }

  return { apply, reset, now, cues: all, rig, vfx, air, footfalls };
}
