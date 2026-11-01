import * as THREE from 'three';
import { measureWalkGait } from '../../walk-gait.js';

/**
 * Friends (and Mosi) that walk a route on the game clock: level 2's group walks in a line (through the tunnel, up the ramp, up the steep path), and a wrong friend walks to its obstacle and back.
 * A route is a list of segments, done one after the other:
 *   { to: [Vector3...], speed }   walk through these points (heights included: the root is that high), at `speed` metres a second
 *   { wait: seconds }             stand
 *   { until: seconds }            stand until the walkers' own clock (the seconds since `start`) has reached it
 *   { pop: seconds }              grow from nothing where it stands (the group comes out of the tunnel's dark)
 *   { hide: true }                is not drawn from now on
 *   { call: () => {...} }         does something, on the way
 * The walk clip is played at the pace the friend moves (the friends' own feet follow the root: baby-actors.js), the body pitched with the slope when `pitch` is set. The friend turns
 * toward where it goes, and at the end to `yaw` (when given), and onDone is called. Mosi's walk is his own clip (`isMosi`): the same route, his walk at the pace.
 */
const turn = (from, to, k) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;
const clamp = THREE.MathUtils.clamp;

export function createWalkers({ stage }) {
  const walks = new Map();
  let clock = 0, mosiPace = 0;
  const mosi = () => stage.mosi.actor;
  const paceOfMosi = () => {
    if (!mosiPace) { const m = mosi(), feet = []; m.model.traverse(bone => { if (bone.isBone && /Foot/.test(bone.name)) feet.push(bone); }); mosiPace = (measureWalkGait(m.model, m.root, m.clips.get('walk'), feet)?.naturalSpeed ?? 2) * m.root.scale.x; }
    return mosiPace;
  };
  const isMosi = actor => actor === mosi();
  const base = new WeakMap(); // the scale a friend has when it is not popping in
  const walkOn = (actor, speed, reduced) => { if (isMosi(actor)) mosi().play('walk', { fade: .2, timeScale: clamp(speed / Math.max(.1, paceOfMosi()), .5, 3) }); else actor.walk?.(true); void reduced; };
  const walkOff = (actor, reduced) => { if (isMosi(actor)) mosi().play('idle', { fade: .3, timeScale: reduced ? 0 : 1 }); else actor.walk?.(false); };
  const rootY = (actor, y) => isMosi(actor) ? y : y + .04;

  function finish(w, reduced) {
    walkOff(w.actor, reduced); w.actor.root.rotation.z = 0;
    if (w.yaw !== null && w.yaw !== undefined) w.actor.root.rotation.y = w.yaw;
    walks.delete(w.actor); w.onDone?.(w.actor);
  }

  return {
    /** Starts a route for `actor` (a route that is running is replaced). `delay`: seconds to stand first. */
    start(actor, segments, { delay = 0, yaw = null, pitch = false, onDone = null } = {}) {
      if (!base.has(actor)) base.set(actor, actor.root.scale.x);
      walks.set(actor, { actor, segments: segments.map(segment => ({ ...segment })), i: 0, route: null, s: 0, delay, yaw, pitch, onDone, walking: false, tilt: 0, started: false });
    },
    cancel(actor) { const w = walks.get(actor); if (!w) return; walkOff(actor, false); actor.root.rotation.z = 0; walks.delete(actor); },
    cancelAll(reduced = false) { for (const w of [...walks.values()]) { walkOff(w.actor, reduced); w.actor.root.rotation.z = 0; } walks.clear(); },
    busy: () => walks.size > 0,
    isWalking: actor => walks.has(actor),
    count: () => walks.size,
    clock: () => clock,
    resetClock() { clock = 0; },
    update(dt, reduced = false) {
      if (!(dt > 0)) return;
      clock += dt;
      for (const w of [...walks.values()]) {
        const actor = w.actor, root = actor.root;
        let budget = dt;
        if (w.delay > 0) { w.delay -= dt; if (w.delay > 0) continue; budget = -w.delay; w.delay = 0; }
        for (let guard = 0; guard < 8 && budget > 0; guard++) {
          const seg = w.segments[w.i];
          if (!seg) { finish(w, reduced); break; }
          if (seg.wait !== undefined || seg.until !== undefined) {
            if (w.walking) { walkOff(actor, reduced); w.walking = false; root.rotation.z = 0; }
            if (seg.until !== undefined) { if (clock >= seg.until) { w.i++; continue; } break; }
            seg.wait -= budget; if (seg.wait <= 0) { budget = -seg.wait; w.i++; continue; } break;
          }
          if (seg.call) { seg.call(actor); w.i++; continue; }
          if (seg.hide) { root.visible = false; w.i++; continue; }
          if (seg.pop !== undefined) {
            if (!root.visible) root.visible = true;
            seg.age = (seg.age ?? 0) + budget; const u = reduced ? 1 : clamp(seg.age / Math.max(.01, seg.pop), 0, 1), s = base.get(actor) * (.02 + .98 * u * u * (3 - 2 * u)); root.scale.setScalar(s);
            if (u >= 1) { root.scale.setScalar(base.get(actor)); budget = seg.age - seg.pop; w.i++; continue; }
            break;
          }
          // a walk
          if (!seg.route) {
            const points = [root.position.clone(), ...seg.to.map(p => p.clone())], lengths = [0];
            // (a point is a place on the ground: the root is that high, and Mosi's is on it)
            for (let k = 1; k < points.length; k++) { points[k].y = rootY(actor, points[k].y); lengths.push(lengths[k - 1] + points[k].distanceTo(points[k - 1])); }
            seg.route = { points, lengths, total: lengths.at(-1) }; seg.s = 0;
            if (!w.walking && seg.route.total > .02) { walkOn(actor, seg.speed ?? 3, reduced); w.walking = true; }
          }
          const { points, lengths, total } = seg.route, speed = seg.speed ?? 3;
          const at = d => { // the point at distance d along the route
            d = clamp(d, 0, total); let k = 1; while (k < lengths.length - 1 && lengths[k] < d) k++;
            const span = Math.max(1e-6, lengths[k] - lengths[k - 1]); return points[k - 1].clone().lerp(points[k], (d - lengths[k - 1]) / span);
          };
          const need = Math.max(0, total - seg.s), step = speed * budget;
          seg.s += Math.min(need, step);
          const here = at(seg.s), ahead = at(seg.s + .45), behind = at(seg.s - .45);
          root.position.copy(here);
          const dx = ahead.x - here.x, dz = ahead.z - here.z;
          if (Math.hypot(dx, dz) > .02) root.rotation.y = turn(root.rotation.y, Math.atan2(-dz, dx), reduced ? 1 : 1 - Math.exp(-dt / .11));
          if (w.pitch) { const target = Math.atan2(ahead.y - behind.y, Math.hypot(ahead.x - behind.x, ahead.z - behind.z) + 1e-6); w.tilt = turn(w.tilt, target, reduced ? 1 : 1 - Math.exp(-dt / .2)); root.rotation.z = w.tilt; }
          else root.rotation.z = 0;
          if (seg.s >= total - 1e-4) { budget = step > need ? (step - need) / Math.max(.01, speed) : 0; w.i++; seg.route = null; continue; }
          break;
        }
      }
    },
    /** Puts a friend at a point on the ground (a Vector3) facing `yaw`, drawn at its size. */
    place(actor, point, yaw, visible = true) { const root = actor.root; root.position.copy(point); root.position.y = rootY(actor, point.y); root.rotation.set(0, yaw ?? root.rotation.y, 0); root.visible = visible; if (!isMosi(actor)) root.scale.setScalar(base.get(actor) ?? 1); },
    rootY,
  };
}
