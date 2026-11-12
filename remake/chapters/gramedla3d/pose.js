// Grameðla's pose on the stage (chapters/gramedla3d.js): she stands in the lane facing the lens and leans in by bending spine, chest
// and neck down by shares of one angle, her head turned so the snout points at the lens; where she stands and how far she leans are
// solved so her snout tip is at a place in the stage's frame (u, v, k). Nothing is drawn: only her own bones are turned.
//
//   const pose = createGramPose(gram, stage, camera)
//   pose.hold(clip, at)                 held in a clip at a second ('widest': the roar's widest jaw); the lean starts from there
//   pose.solve({ k, u, v, turn, roll, pitch })   -> { x, z, theta, turn, ... } (turn is the head's turn that centres its outline,
//                                       plus the extra asked for)
//   pose.apply(solution)                stands and leans as solved (each frame, from the held pose: the overlay calls it)
//   pose.stand(x, z, extra)             stands at (x, z) facing the lens, not leaning
//   pose.snout(out)                     the snout tip in the world now
//   pose.leanNow({ theta, turn, roll, pitch })   leans from the pose her clips have given her this frame (the show: director.js)
import * as THREE from 'three';
import { rotateBoneWorld } from '../../engine/actor.js';
import { bodyMesh } from '../../engine/clip-probe.js';

/**
 * For bones a pose turns after the clips: the mixer leaves a bone alone when its value has not changed since it last set it, so a
 * turn laid on it would be laid on again the next frame. begin() puts back what the bone was before the last turn where the mixer
 * has not set it since (it is still what the turn left); end() remembers what the turn left.
 */
export function guardBones(bones) {
  const before = bones.map(b => b.quaternion.clone());
  const after = bones.map(b => b.quaternion.clone());
  let armed = false;
  return {
    begin() {
      bones.forEach((b, i) => {
        if (armed && b.quaternion.equals(after[i])) b.quaternion.copy(before[i]);
        before[i].copy(b.quaternion);
      });
    },
    end() {
      bones.forEach((b, i) => after[i].copy(b.quaternion));
      armed = true;
    },
  };
}

// her lean: spine, chest and neck bend down by these shares of one angle; the head turns the snout to the lens
const LEAN = { Spine: 0.22, Chest: 0.3, Neck: 0.48 };
const SNOUT_MID = 0.12; // m: the snout tip is the forward-most upper-jaw vertex within this of the head's middle
const TURN_GAIN = 2.3; // radians of head turn per share of the frame's width the head's outline is off its snout
const TURN_MAX = 0.08; // radians
const AIM = 0.5; // how much of the angle down to the lens the head turns
const LEAN_RANGE = [0, 1.5]; // radians
export const SNOUT_V = 0.56; // step 0's snout height in the frame: a little under the middle, as her head is mostly above it

export function createGramPose(gram, stage, camera) {
  const { camPos, stageCam, framePoint, frameOf } = stage;
  const D = stage.D;
  const q = new THREE.Quaternion();
  const bone = name => gram.model.getObjectByName(name);
  const bones = { Spine: bone('Spine'), Chest: bone('Chest'), Neck: bone('Neck'), Head: bone('Head'), Jaw: bone('Jaw'), Hips: bone('Hips') };
  const facingLens = (x, z) => Math.atan2(camPos.z - z, camPos.x - x) * 180 / Math.PI;
  const at = (x, z) => gram.place(x, z, facingLens(x, z));

  // ---- held in a clip: the mixer stopped there; its bones are what every lean starts from ----
  let held = { clip: null, at: null };
  const restNames = ['Spine', 'Chest', 'Neck', 'Head'];
  let rest = [];
  const pose = (name, t) => {
    const action = gram.play(name, { fade: 0, timeScale: 0 });
    action.time = t;
    gram.mixer.update(0);
    return action;
  };
  // the roar's widest jaw: the second its Jaw bone is turned furthest from the idle's
  let roarWidest = null;
  function widestRoar() {
    const clip = gram.clips.get('roar');
    if (!clip) return 0;
    pose('idle', 0);
    const base = bones.Jaw.quaternion.clone();
    let best = -1, bestAt = 0;
    for (let i = 0; i <= 80; i++) {
      const t = (clip.duration * i) / 80;
      pose('roar', t);
      const angle = bones.Jaw.quaternion.angleTo(base);
      if (angle > best) { best = angle; bestAt = t; }
    }
    return bestAt;
  }
  function hold(clip = 'idle', second = 0) {
    if (clip === held.clip && second === held.at) return;
    const name = gram.clips.get(clip) ? clip : 'idle';
    if (name === 'roar' && roarWidest === null) roarWidest = widestRoar();
    const t = second === 'widest' ? roarWidest : second;
    pose(name, t);
    gram.mixer.timeScale = 0; // held there, whatever plays later
    gram.root.updateMatrixWorld(true);
    rest = restNames.map(n => [bones[n], bones[n].quaternion.clone()]);
    held = { clip, at: second, time: t };
  }

  // ---- the snout tip: the forward-most vertex of her upper jaw near its middle, in the Head bone's frame (from the idle) ----
  at(0, camPos.z - 12);
  pose('idle', 0);
  gram.root.updateMatrixWorld(true);
  const body = bodyMesh(gram);
  const headVerts = [];
  const jawVerts = [];
  let snoutLocal;
  {
    body.skeleton.update();
    const list = body.skeleton.bones;
    const head = list.indexOf(bones.Head), jaw = list.indexOf(bones.Jaw);
    const ofHead = new Set();
    bones.Head.traverse(o => { const j = list.indexOf(o); if (j >= 0) ofHead.add(j); });
    const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
    let tip = null, best = -Infinity;
    const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(gram.root.quaternion).setY(0).normalize();
    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(gram.root.quaternion);
    const upper = [];
    for (let i = 0; i < si.count; i++) {
      let top = 0, w = -1;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); top = si.getComponent(i, k); }
      if (!ofHead.has(top)) continue;
      headVerts.push(i);
      if (top === jaw) jawVerts.push(i);
      if (top === head) upper.push(body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld));
    }
    const lo = Math.min(...upper.map(u => u.dot(side))), hi = Math.max(...upper.map(u => u.dot(side)));
    const mid = (lo + hi) / 2;
    for (const u of upper) if (Math.abs(u.dot(side) - mid) < SNOUT_MID && u.dot(facing) > best) { best = u.dot(facing); tip = u; }
    snoutLocal = bones.Head.worldToLocal(tip.clone());
  }
  const snout = (out = new THREE.Vector3()) => out.copy(snoutLocal).applyMatrix4(bones.Head.matrixWorld);
  hold('idle', 0);

  // ---- the lean ----
  const right = new THREE.Vector3(), sp = new THREE.Vector3(), hp = new THREE.Vector3(), fw = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  function lean(theta, { turn = 0, roll = 0, pitch = 0 } = {}) {
    for (const [o, r] of rest) o.quaternion.copy(r);
    gram.root.updateMatrixWorld(true);
    right.set(0, 0, 1).applyQuaternion(gram.root.quaternion);
    for (const [name, share] of Object.entries(LEAN)) rotateBoneWorld(bones[name], q.setFromAxisAngle(right, -theta * share));
    // the head: as it stands (the lean undone), then down by the angle from the snout to the lens, so she looks at us
    rotateBoneWorld(bones.Head, q.setFromAxisAngle(right, theta));
    snout(sp);
    const drop = Math.atan2(sp.y - camera.position.y, Math.hypot(sp.x - camera.position.x, sp.z - camera.position.z));
    rotateBoneWorld(bones.Head, q.setFromAxisAngle(right, -drop * AIM + pitch));
    // and about the upright, so the snout points at the lens from the side too
    bones.Head.getWorldPosition(hp);
    snout(sp);
    const yaw = Math.atan2(camera.position.x - hp.x, camera.position.z - hp.z) - Math.atan2(sp.x - hp.x, sp.z - hp.z);
    rotateBoneWorld(bones.Head, q.setFromAxisAngle(UP, yaw + turn));
    // tilted about its own length (head to snout)
    if (roll) {
      bones.Head.getWorldPosition(hp);
      fw.copy(snout(sp)).sub(hp).normalize();
      rotateBoneWorld(bones.Head, q.setFromAxisAngle(fw, roll));
    }
  }
  const poseAt = (x, z, theta, p = new THREE.Vector3(), how = {}) => { at(x, z); lean(theta, how); return snout(p); };

  /** The head's outline in the stage's frame: its box's middle across, less the snout's place. */
  const hv = new THREE.Vector3();
  function centre() {
    body.skeleton.update();
    let u0 = Infinity, u1 = -Infinity;
    for (let i = 0; i < headVerts.length; i += 3) {
      const u = frameOf(body.getVertexPosition(headVerts[i], hv).applyMatrix4(body.matrixWorld), stageCam, D)[0];
      u0 = Math.min(u0, u); u1 = Math.max(u1, u);
    }
    return (u0 + u1) / 2 - frameOf(snout(hv), stageCam, D)[0];
  }

  /**
   * Where she stands and how far she leans for her snout tip at (u, v) in the stage's frame, k·D deep (held as she is): for a lean,
   * where she stands puts the snout over its place; the lean (bisected in LEAN_RANGE) brings it to its height. Then the head's turn
   * that centres its outline on the snout, plus `turn`, and her root moved again after each.
   */
  function solve({ k, u = 0.5, v = SNOUT_V, turn: extra = 0, roll = 0, pitch = 0, centred = true } = {}) {
    const want = framePoint(u, v, k, new THREE.Vector3(), stageCam, D);
    const p = new THREE.Vector3();
    let x = want.x, z = want.z - 6;
    let how = { turn: extra, roll, pitch };
    const place = theta => {
      for (let i = 0; i < 12; i++) {
        poseAt(x, z, theta, p, how);
        x += want.x - p.x;
        z += want.z - p.z;
      }
      poseAt(x, z, theta, p, how);
      return p.y - want.y; // > 0: the snout is too high, she leans further
    };
    let [lo, hi] = LEAN_RANGE;
    let theta;
    if (place(lo) <= 0) theta = lo;
    else if (place(hi) >= 0) theta = hi;
    else {
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (place(mid) > 0) lo = mid; else hi = mid;
      }
      theta = (lo + hi) / 2;
    }
    place(theta);
    let turn = 0;
    if (centred) {
      for (let i = 0; i < 4; i++) {
        how = { turn: turn + extra, roll, pitch };
        poseAt(x, z, theta, p, how);
        turn = Math.max(-TURN_MAX, Math.min(TURN_MAX, turn + TURN_GAIN * centre()));
        how = { turn: turn + extra, roll, pitch };
        for (let j = 0; j < 8; j++) {
          poseAt(x, z, theta, p, how);
          x += want.x - p.x;
          z += want.z - p.z;
        }
      }
    }
    how = { turn: turn + extra, roll, pitch };
    poseAt(x, z, theta, p, how);
    const off = centre();
    return { x: +x.toFixed(3), z: +z.toFixed(3), theta: +theta.toFixed(4), turn: +(turn + extra).toFixed(4), roll, pitch, off: +off.toFixed(4), lean: +(theta * 180 / Math.PI).toFixed(1), error: +p.distanceTo(want).toFixed(4), k };
  }

  /** Standing at `depth` m up the lane at `u` across the frame (her root on the view's line there), not leaning. */
  function standAt({ depth, u = 0.5 }) {
    const p = framePoint(u, 0.5, depth / D, new THREE.Vector3(), stageCam, D);
    return { x: +p.x.toFixed(3), z: +p.z.toFixed(3), theta: 0, turn: 0, roll: 0, pitch: 0, standing: true };
  }

  /** The nearest of her head's skin in the stage's frame, as a share of D. */
  function nearestK() {
    body.skeleton.update();
    let k = Infinity;
    for (const i of headVerts) k = Math.min(k, frameOf(body.getVertexPosition(i, hv).applyMatrix4(body.matrixWorld), stageCam, D)[2]);
    return k;
  }
  /** As solve(), but the snout's k moved until the nearest of her head (a cheek, a lip, the lower jaw) is at the row's k. */
  function solveNearest(spec) {
    let k = spec.k, sol = solve(spec);
    for (let i = 0; i < 4; i++) {
      const near = nearestK();
      if (Math.abs(near - spec.k) < 0.002) break;
      k *= spec.k / near;
      sol = solve({ ...spec, k });
    }
    sol.nearest = +nearestK().toFixed(4);
    sol.k = +k.toFixed(4);
    return sol;
  }

  /** Leans from her pose as her clips have set it this frame (not from a held clip's): the show's every frame. */
  const leanGuard = guardBones(restNames.map(n => bones[n]));
  function leanNow(p) {
    leanGuard.begin();
    rest = restNames.map(n => [bones[n], bones[n].quaternion.clone()]);
    gram.root.updateMatrixWorld(true);
    lean(p.theta, p);
    leanGuard.end();
  }

  function apply(sol) {
    at(sol.x, sol.z);
    lean(sol.theta, sol);
  }

  return { bones, body, headVerts, jawVerts, snout, snoutLocal, hold, leanNow, get held() { return held; }, lean, poseAt, solve, solveNearest, nearestK, standAt, apply, at, centre, right };
}
