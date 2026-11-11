// Slóeðla at the far pool (chapter 5, kafli5.js; spec 2 and 4): her life in the reed and out of it. She hides deep in the far reed
// with only her crest over it, peeks out (her eyes and her crest over the reed) when the child taps the reed, comes a step out after
// each phrase (kafli5-pool.js STEPS: her crest, her head, her neck and shoulders, all of her in the shallows), blows her horn with
// her head up (her 'call' clip), and wades out into the pool for the whole song (WADE).
//
//   const her = sloedlaLife(s.actor('sloedla'));
//   her.hide()                  deep in the reed at STEPS[0], at once (before the chapter starts)
//   her.peek(true | false)      her eyes over the reed, rising over PEEK.seconds, or down again
//   her.courage = 0..1          shy to brave: her head held low and her walk slow at 0, upright and quicker at 1 (the scenes set it)
//   yield her.stepOut(n)        she walks to STEPS[n] (a handle the scene can wait on), rising out of the reed as she comes
//   her.blow({ seconds })       her horn: head up, the 'call' clip, for `seconds`, then back to what she was doing
//   yield her.wade()            out into the pool for the whole song
//   her.idle(), her.happy()     the clip she rests in
//   her.dance(score)            her dance in the music video (scene 6): score() gives what it asks of her each frame, null ends it
//   her.points()                where her parts are now (the tests watch her with it)
//
// Hidden is low: she is 4.1 m to the top of her crest and the reed about 2 m, so in the reed she stands SINK m under her ground and
// the reed hides the rest; each step out lifts her a little more, over the whole walk, and her head comes up with her courage. The
// head and neck poses the clips do not have (shy, peeking, blowing) are made here on her neck bones, after the clips each frame, as
// chapter 4 made Flugeðla's spread wings (kafli4-flugedla.js). She is held the whole chapter (actor.control): every place she stands
// and every turn she makes is eased from the last, so nothing of her jumps, not even where the camera does not look.
//
// Her dance (scene 6, the music video: kafli5-people-score.js sloedlaAt) is laid over all of that: a lift and a sway of her root, a
// turn and a lean of her body, a nod, a turn and a tilt of her head down her neck, her tail. What the score asks is a pure function
// of the dance beat; what she does of it each frame is as much as moves nothing of her further than DANCE allows (the test's 0.1 m
// and 8 degrees a frame, with room to spare), so when the clock leaps ("Dansa!" after Stoppdans) or runs back twice as fast (the
// rewind) she catches up as fast as she gently can and never jumps.
import * as THREE from 'three';
import { Handle } from '../engine/handle.js';
import { STEPS, WADE } from './kafli5-pool.js';

const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const smooth = k => k * k * (3 - 2 * k);

/** How far under her ground she stands at each kind of step (m): the reed, then the water, hides the rest of her. */
export const SINK = { crest: -1.75, head: -0.55, neck: -0.25, whole: 0 };
/** The peek: she rises `lift` m over `seconds`, her head `raise` degrees up. */
export const PEEK = { lift: 1.45, seconds: 1.2, raise: 10 };
/** Shy to brave: her head `low` degrees down at courage 0; her walk `slow` m/s at courage 0 and `brave` at 1; her head turns at most `settle` deg/s. */
export const SHY = { low: 22, slow: 0.55, brave: 1.0, settle: 24 };
/**
 * Her horn: her head `raise` degrees up as she blows; the 'call' clip fades in over `in` s and out over `out` s, and holds `hold` s
 * more after a note, so notes close together stay one blow. The clip raises her head (0.5 to 1.8 s), holds it, and drops it fast (4.2
 * to 4.8 s): while it shows it goes to and fro within the held part (`sustain`, s), so a long blow never drops her head and raises it
 * again, and the clip she goes on to fades in over a held pose.
 */
export const BLOW = { raise: 14, in: 0.5, out: 1.0, hold: 0.3, sustain: [2.0, 4.1] };
/** Her courage as she sets off for each step (STEPS[1] to [3]) and for the wade (4): shy at the first two, brave at the last two. */
export const COURAGE = [0, 0.15, 0.35, 0.75, 1];
// Each clip's speed: her 'happy' a little slower than the model's, gentle (at its own speed her head bobs over 3 m/s).
const SPEED = { happy: 0.8 };
const NATURAL = 1.047; // m/s: the speed her walk clip's own feet go at (the actor's gait for 'walk', measured)
const TURN = 35; // deg/s she turns at most, as she walks and as she settles to face Egill
const GROUND = 0.35; // s: her feet follow the ground this far behind (the pool's rim is a step in it)
const EASE_IN = 1.2; // s her walk takes to come up to speed, and m it slows down over at its end
// The neck bones that carry her head's pose, and each one's share of it.
const NECK = [['Neck', 0.2], ['Neck2', 0.25], ['Neck3', 0.25], ['Head', 0.3]];
const TAIL = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6'];
/**
 * Her dance's bounds: the most her root, her head, her eyes and her crest's tip may move (m/s) and her heading and her head's facing
 * turn (degrees/s) while she dances; over that, less of what the score asks is taken this frame (halved up to `tries` times, then
 * none: her life's own moves alone). At the chapter's test's 30 frames a second: 0.08 m and 6 degrees a frame.
 */
export const DANCE = { speed: 2.4, turn: 180, tries: 5 };
const MOVES = ['lift', 'side', 'yaw', 'lean', 'nod', 'turn', 'tilt', 'tail'];
const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(0, 0, 1);

/** A value that goes to a new one over `seconds`, eased at both ends. */
function tween(now) {
  const t = { from: now, to: now, age: 1, seconds: 1, now };
  t.go = (to, seconds) => Object.assign(t, { from: t.now, to, age: 0, seconds: Math.max(1e-3, seconds) });
  t.update = dt => {
    t.age += dt;
    t.now = t.from + (t.to - t.from) * smooth(Math.min(1, t.age / t.seconds));
    return t.now;
  };
  return t;
}

/** Turn `from` (degrees) toward `to` at most `rate` deg/s, settling softly. */
function turnToward(from, to, rate, dt) {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return from + Math.sign(delta) * Math.min(Math.abs(delta), rate * dt, Math.abs(delta) * (1 - Math.exp(-dt * 4)));
}

const parentQ = new THREE.Quaternion();
const localQ = new THREE.Quaternion();
/** Turn `bone` by `q`, a turn in the world's frame. */
function rotateBoneWorld(bone, q) {
  bone.parent.getWorldQuaternion(parentQ);
  localQ.copy(parentQ).invert().multiply(q).multiply(parentQ);
  bone.quaternion.premultiply(localQ);
  bone.updateMatrixWorld(true);
}

/**
 * Where her crest's tip and her eyes are in her head bone's own frame, from her bind pose: the highest point of her body, and the
 * middle of her eyelids; and the top of her back (the highest point from behind her hips to her spine) in her hip bone's frame.
 */
function measure(her, head, hips, spine) {
  her.model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.pose(); });
  her.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const l = new THREE.Vector3();
  const along = bone => her.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3())).x;
  const [from, to] = [along(hips) - 1.2, along(spine)]; // her crest curls back as far as over her spine: the back ends there
  let crest = null;
  let back = null;
  her.model.traverse(o => {
    if (!o.isMesh || o === her.eyelids?.mesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (!crest || v.y > crest.y) crest = v.clone();
      her.root.worldToLocal(l.copy(v));
      if (l.x >= from && l.x <= to && (!back || v.y > back.y)) back = v.clone();
    }
  });
  const lids = her.eyelids?.mesh;
  let eyes;
  if (lids) {
    if (!lids.geometry.boundingBox) lids.geometry.computeBoundingBox();
    eyes = lids.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(lids.matrixWorld);
  } else eyes = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.35, 0.15, 0)); // a model without eyelids: ahead of the head bone
  return { crest: head.worldToLocal(crest), eyes: head.worldToLocal(eyes), back: hips.worldToLocal(back) };
}

/**
 * A copy of `clip` with its turns smoothed key by key (each key a weighted mean of the five round it, the clip looping): her 'happy'
 * clip's head trembles up to 11 degrees from one key to the next (the model's own), which reads as a twitch, not a joy.
 */
export function calmClip(clip) {
  const calm = clip.clone();
  const WEIGHTS = [1, 4, 6, 4, 1];
  const q = new THREE.Quaternion();
  for (const track of calm.tracks) {
    if (!track.name.endsWith('.quaternion')) continue;
    const keys = track.times.length;
    const from = Float32Array.from(track.values);
    for (let i = 0; i < keys; i++) {
      const sum = [0, 0, 0, 0];
      for (let k = -2; k <= 2; k++) {
        const j = (((i + k) % keys) + keys) % keys;
        q.fromArray(from, j * 4);
        const sign = q.x * from[i * 4] + q.y * from[i * 4 + 1] + q.z * from[i * 4 + 2] + q.w * from[i * 4 + 3] < 0 ? -1 : 1;
        const w = WEIGHTS[k + 2] * sign;
        sum[0] += q.x * w; sum[1] += q.y * w; sum[2] += q.z * w; sum[3] += q.w * w;
      }
      q.set(...sum).normalize().toArray(track.values, i * 4);
    }
  }
  return calm;
}

/** Her life on `actor` (the scene's actor: s.actor('sloedla')). */
export function sloedlaLife(actor) {
  const her = actor.raw;
  const { world, root } = her;
  const bone = name => her.model.getObjectByName(name);
  const head = bone('Head');
  const body = [bone('Tail6'), bone('Jaw')];
  const chain = NECK.map(([name, share]) => ({ bone: bone(name), share, base: new THREE.Quaternion(), held: false })).filter(link => link.bone);
  const tail = TAIL.map(name => ({ bone: bone(name), base: new THREE.Quaternion(), held: false })).filter(link => link.bone);
  const parts = measure(her, head, bone('Hips'), bone('Spine'));
  if (her.clips.has('happy')) her.clips.set('happy', calmClip(her.clips.get('happy')));
  const state = {
    x: STEPS[0].at[0], z: STEPS[0].at[1], heading: STEPS[0].heading, face: STEPS[0].heading,
    sink: SINK.crest, lift: tween(0), pitch: -SHY.low, courage: 0, peeking: false, blowing: 0, rest: 'idle', walk: null, step: 0,
  };
  state.ground = world.heightAt(state.x, state.z);
  const axis = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  // her dance: what the score asks (`score`), what she does of it now (`moves`), where it put her last frame (`last`), her resting
  // clip's time on the score's clock (`clock`: null while the clip runs by itself), and how far behind the score she is (`behind`)
  const dance = { score: null, moves: Object.fromEntries(MOVES.map(k => [k, 0])), next: {}, last: null, clock: null, behind: 0, y: 0 };
  const still = Object.fromEntries(MOVES.map(k => [k, 0]));
  const seen = { root: new THREE.Vector3(), head: new THREE.Vector3(), eyes: new THREE.Vector3(), crest: new THREE.Vector3(), facing: new THREE.Vector3(), heading: 0 };
  const headQ = new THREE.Quaternion();

  // Her clips, each fading from the weight it has now: three's crossFadeTo starts its fade out at full weight, so a change made while
  // another is still fading would put her back in the old pose for a frame.
  const actions = new Set([her.mixer.clipAction(her.clips.get('idle'))]);
  const call = her.clips.has('call') ? her.mixer.clipAction(her.clips.get('call')) : null;
  function fadeTo(name, { fade = 0.5, timeScale = 1 } = {}) {
    const clip = her.clips.get(name);
    if (!clip) return null;
    const next = her.mixer.clipAction(clip);
    const live = next.enabled && next.isScheduled();
    const from = live ? next.getEffectiveWeight() : 0;
    if (!live) {
      const once = Boolean(clip.userData?.once);
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.play();
    }
    next.enabled = true;
    next.setEffectiveTimeScale(timeScale * (SPEED[name] ?? 1));
    next.setEffectiveWeight(1);
    if (fade > 0) next._scheduleFading(fade, from, 1);
    for (const action of actions) {
      if (action === next) continue;
      const weight = action.getEffectiveWeight();
      if (fade <= 0 || weight <= 1e-4) action.stop();
      else action.setEffectiveWeight(weight).fadeOut(fade);
    }
    actions.add(next);
    return next;
  }

  // Before the clips: her neck as the clips left it last frame (the pose below is laid over them again after), the walk, the peek,
  // her head's lean and the horn's time, and her root where all of that puts it.
  function drive(dt) {
    for (const link of chain) if (link.held) link.bone.quaternion.copy(link.base);
    for (const link of tail) {
      if (link.held) link.bone.quaternion.copy(link.base);
      link.held = false;
    }
    const w = state.walk;
    if (w) {
      w.t += dt;
      const left = w.length - w.s;
      const speed = w.speed * Math.min(1, 0.3 + (0.7 * w.t) / EASE_IN) * Math.min(1, 0.35 + (0.65 * left) / EASE_IN);
      w.s = Math.min(w.length, w.s + speed * dt);
      const k = w.length > 0 ? w.s / w.length : 1;
      state.x = w.from[0] + (w.to[0] - w.from[0]) * k;
      state.z = w.from[1] + (w.to[1] - w.from[1]) * k;
      state.sink = w.sinkFrom + (w.sinkTo - w.sinkFrom) * smooth(k);
      w.action?.setEffectiveTimeScale(Math.max(0.2, speed / NATURAL));
      state.heading = turnToward(state.heading, w.way, TURN * Math.min(1, 0.3 + (0.7 * w.t) / EASE_IN), dt);
      if (w.s >= w.length - 1e-4) {
        state.walk = null;
        w.action?.setEffectiveTimeScale(0);
        fadeTo(state.blowing > 0 ? 'call' : state.rest, { fade: state.blowing > 0 ? BLOW.in : 0.6 });
        w.handle.finish();
      }
    } else state.heading = turnToward(state.heading, state.face, TURN, dt);
    state.lift.update(dt);
    const goal = -SHY.low * (1 - state.courage) + (state.peeking ? PEEK.raise : 0) + (state.blowing > 0 ? BLOW.raise : 0);
    const delta = goal - state.pitch;
    state.pitch += Math.sign(delta) * Math.min(Math.abs(delta), SHY.settle * dt, Math.abs(delta) * (1 - Math.exp(-dt * 3)));
    if (state.blowing > 0) {
      state.blowing = Math.max(0, state.blowing - dt);
      if (state.blowing === 0 && !state.walk) fadeTo(state.rest, { fade: BLOW.out });
    }
    if (call && call.getEffectiveWeight() > 0) {
      if (call.timeScale > 0 && call.time > BLOW.sustain[1]) call.timeScale = -1;
      else if (call.timeScale < 0 && call.time < BLOW.sustain[0]) call.timeScale = 1;
    }
    state.ground += (world.heightAt(state.x, state.z) - state.ground) * (1 - Math.exp(-dt / GROUND));
    dance.y = state.ground + state.sink + state.lift.now;
    root.position.set(state.x, dance.y, state.z);
    root.rotation.set(0, -rad(state.heading), 0);
    // while she dances the clip she rests in is on the score's clock (so it runs back in the rewind and stands in Stoppdans), from
    // where it was when the dance began; after it, it runs by itself again
    const rest = her.clips.get(state.rest) ? her.mixer.clipAction(her.clips.get(state.rest)) : null;
    const clock = dance.score ? dance.next.clock : undefined;
    if (rest && Number.isFinite(clock)) {
      const speed = SPEED[state.rest] ?? 1;
      const length = rest.getClip().duration;
      if (dance.clock?.rest !== state.rest) dance.clock = { rest: state.rest, offset: rest.time - clock * speed };
      rest.time = (((dance.clock.offset + clock * speed) % length) + length) % length;
      rest.timeScale = 0;
    } else if (dance.clock) {
      const was = her.clips.get(dance.clock.rest);
      if (was) her.mixer.clipAction(was).timeScale = SPEED[dance.clock.rest] ?? 1;
      dance.clock = null;
    }
  }

  // Her root and her neck with `m` of her dance on them (and her head's own lean: her courage, her peek, her horn), from where her
  // life put her root this frame and the clips left her neck.
  function lay(m) {
    const h = rad(state.heading + m.yaw);
    axis.set(-Math.sin(h), 0, Math.cos(h)); // the line across her shoulders, to her right
    ahead.set(Math.cos(h), 0, Math.sin(h));
    root.position.set(state.x + axis.x * m.side, dance.y + m.lift, state.z + axis.z * m.side);
    root.quaternion.setFromAxisAngle(UP, -h);
    if (m.lean) root.quaternion.multiply(turn.setFromAxisAngle(SIDE, rad(m.lean)));
    for (const link of chain) link.bone.quaternion.copy(link.base);
    root.updateMatrixWorld(true);
    const pitch = state.pitch + m.nod;
    let turned = 0; // her neck's turn so far (radians): each bone nods and tilts about its own line across and ahead
    for (const link of chain) {
      if (m.turn) {
        const step = -rad(m.turn * link.share);
        rotateBoneWorld(link.bone, turn.setFromAxisAngle(UP, step));
        axis.applyAxisAngle(UP, step);
        ahead.applyAxisAngle(UP, step);
        turned += step;
      }
      if (Math.abs(pitch) >= 1e-4) rotateBoneWorld(link.bone, turn.setFromAxisAngle(axis, rad(pitch * link.share)));
      if (m.tilt) rotateBoneWorld(link.bone, turn.setFromAxisAngle(ahead, rad(m.tilt * link.share)));
    }
    if (turned) axis.applyAxisAngle(UP, -turned); // the line across her shoulders again
  }
  /** Where the parts of her the chapter's test watches are now, into `out`. */
  function see(out) {
    out.root.copy(root.position);
    head.getWorldPosition(out.head);
    out.eyes.copy(parts.eyes).applyMatrix4(head.matrixWorld);
    out.crest.copy(parts.crest).applyMatrix4(head.matrixWorld);
    out.facing.copy(parts.eyes).normalize().applyQuaternion(head.getWorldQuaternion(headQ));
    return out;
  }

  // After the clips: her head's lean, shared down her neck, about the line across her shoulders (up is positive), and her dance.
  function pose(dt) {
    for (const link of chain) {
      link.base.copy(link.bone.quaternion);
      link.held = true;
    }
    const asked = dance.score ? dance.score(dt) : null;
    const want = asked ?? still;
    dance.next = want;
    const { moves, last } = dance;
    const dancing = asked || MOVES.some(k => moves[k] !== 0);
    if (!dancing) {
      lay(still);
      dance.last = null;
      dance.behind = 0;
      return;
    }
    // as much of the way to what the score asks as moves nothing of her too far in this frame
    const [far, round] = [DANCE.speed * dt, DANCE.turn * dt];
    const from = { ...moves };
    let share = 1;
    for (let k = 0; k <= DANCE.tries; k++, share = k < DANCE.tries ? share / 2 : 0) {
      for (const key of MOVES) moves[key] = from[key] + ((want[key] ?? 0) - from[key]) * share;
      lay(moves);
      if (!last || share === 0) break;
      see(seen);
      const moved = Math.max(seen.root.distanceTo(last.root), seen.head.distanceTo(last.head), seen.eyes.distanceTo(last.eyes), seen.crest.distanceTo(last.crest));
      const turned = Math.max(deg(seen.facing.angleTo(last.facing)), Math.abs(state.heading + moves.yaw - last.heading));
      if (moved <= far && turned <= round) break;
    }
    dance.behind = share < 1 ? Math.max(...MOVES.map(key => Math.abs((want[key] ?? 0) - moves[key]))) : 0;
    for (const key of MOVES) if (Math.abs(moves[key]) < 1e-6 && !asked) moves[key] = 0;
    dance.last = see(last ?? { root: new THREE.Vector3(), head: new THREE.Vector3(), eyes: new THREE.Vector3(), crest: new THREE.Vector3(), facing: new THREE.Vector3(), heading: 0 });
    dance.last.heading = state.heading + moves.yaw;
    // her tail swings behind her (nothing watches it: it takes the score's swing as it is)
    for (const link of tail) {
      link.base.copy(link.bone.quaternion);
      link.held = true;
      if (want.tail) rotateBoneWorld(link.bone, turn.setFromAxisAngle(UP, -rad((want.tail ?? 0) / tail.length)));
    }
  }

  function walkTo(at, { sink, face, speed }) {
    const from = [state.x, state.z];
    const length = Math.hypot(at[0] - from[0], at[1] - from[1]);
    state.walk?.handle.finish();
    const handle = new Handle('sloedla walk');
    if (length < 0.05) {
      state.walk = null;
      state.sink = sink;
      state.face = face;
      return handle.finish();
    }
    const calling = (call?.getEffectiveWeight() ?? 0) > 0.05;
    const action = fadeTo('walk', { fade: calling ? BLOW.out : 0.6, timeScale: (speed * 0.3) / NATURAL }); // from the horn, as slowly as the horn ends
    state.blowing = 0;
    state.face = face;
    state.walk = {
      from, to: [...at], length, s: 0, t: 0, speed, sinkFrom: state.sink, sinkTo: sink, handle, action,
      way: deg(Math.atan2(at[1] - from[1], at[0] - from[0])),
    };
    return handle;
  }
  const speedNow = () => SHY.slow + (SHY.brave - SHY.slow) * state.courage;

  her.control(drive, pose);
  return {
    get step() { return state.step; },
    get show() { return STEPS[state.step].show; },
    get moving() { return Boolean(state.walk); },
    get peeking() { return state.peeking; },
    get courage() { return state.courage; },
    set courage(value) { state.courage = Math.max(0, Math.min(1, Number(value) || 0)); },
    /** Deep in the reed at STEPS[0], her crest over it, shy: at once (before the chapter starts). */
    hide() {
      state.walk?.handle.finish();
      Object.assign(state, { x: STEPS[0].at[0], z: STEPS[0].at[1], heading: STEPS[0].heading, face: STEPS[0].heading, sink: SINK.crest, lift: tween(0), pitch: -SHY.low, courage: 0, peeking: false, blowing: 0, rest: 'idle', walk: null, step: 0 });
      state.ground = world.heightAt(state.x, state.z);
      fadeTo('idle', { fade: 0 });
      drive(0);
      root.updateMatrixWorld(true);
    },
    /** Her eyes over the reed (`on`), rising over PEEK.seconds, or down into it again. */
    peek(on) {
      state.peeking = Boolean(on);
      state.lift.go(on ? PEEK.lift : 0, PEEK.seconds);
    },
    /** She walks to STEPS[n], coming further out of the reed as she comes; returns the walk's handle. */
    stepOut(n) {
      state.step = Math.max(0, Math.min(STEPS.length - 1, n));
      const { at, heading, show } = STEPS[state.step];
      state.peeking = false;
      state.lift.go(0, PEEK.seconds);
      return walkTo(at, { sink: SINK[show], face: heading, speed: speedNow() });
    },
    /** Her horn for `seconds`: her head up, the 'call' clip; then back to the clip she rests in. */
    blow({ seconds = 1 } = {}) {
      if (state.blowing <= 0 && !state.walk) fadeTo('call', { fade: BLOW.in });
      state.blowing = Math.max(state.blowing, seconds + BLOW.hold);
    },
    idle() {
      state.rest = 'idle';
      if (!state.walk && state.blowing <= 0) fadeTo('idle', { fade: 0.6 });
    },
    happy() {
      state.rest = 'happy';
      if (!state.walk && state.blowing <= 0) fadeTo('happy', { fade: 0.6 });
    },
    /**
     * Her dance: `score(dt)` is asked each frame what the dance wants of her now ({ lift, side (m), yaw, lean, nod, turn, tilt, tail
     * (degrees), clock (s: her resting clip's time) }: kafli5-people-score.js sloedlaAt) and she does as much of it as is gentle
     * (DANCE); dance(null) ends it, and she eases back to how her life has her.
     */
    dance(score) {
      dance.score = score ?? null;
    },
    /** How far behind what her dance asks she is now (m or degrees, the furthest of its parts): 0 but where the clock leaps or races. */
    get behind() { return dance.behind; },
    /** Out into the pool for the whole song: the walk's handle. */
    wade() {
      state.step = STEPS.length - 1;
      return walkTo(WADE.at, { sink: SINK.whole, face: WADE.heading, speed: speedNow() });
    },
    /**
     * Where her parts are now, in the world: her root and heading (degrees), her head bone and the way it faces, her eyes, her
     * crest's tip, the top of her back, her body from above (tail to jaw) and her body's bones.
     */
    points() {
      root.updateMatrixWorld(true);
      const at = o => o.getWorldPosition(new THREE.Vector3());
      const q = head.getWorldQuaternion(new THREE.Quaternion());
      return {
        root: root.position.clone(),
        heading: state.heading + dance.moves.yaw,
        head: at(head),
        facing: parts.eyes.clone().normalize().applyQuaternion(q),
        eyes: head.localToWorld(parts.eyes.clone()),
        crest: head.localToWorld(parts.crest.clone()),
        back: bone('Hips').localToWorld(parts.back.clone()),
        body: body.map(at),
        bones: Object.fromEntries(['Hips', 'Chest', 'Neck2', 'Neck3', 'Head'].map(name => [name, at(bone(name))])),
      };
    },
  };
}
