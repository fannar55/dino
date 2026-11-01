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
 * With a `ground(x, z)` (the height of the ground at a point of the scene), the root takes the ground's height wherever it is on a walk, so that a friend steps over a
 * rise between two points instead of going through it: each point keeps only its height over the ground under it, drawn straight between them (a point in the air
 * keeps its own). A walk on a solid (the slab) says `ground: false` and is drawn straight from point to point; with `surface(x, z)` (the solid's top and the ground round it)
 * a pitched body on it lies on that surface as a body on the ground does (below), its root on the walk's line or as much higher as the surface needs. A walk that says
 * `backward: true` is walked facing the other way (the friend backs out of a tight place: its walk is played backward, baby-actors.js).
 * The walk clip is played at the pace the friend moves (the friends' own feet follow the root: baby-actors.js), the body pitched with the slope when `pitch` is set. On the
 * ground, a pitched body lies on the ground under its toes and heels: it is pitched along the line between the two (as far as its stride takes them), and the root comes up
 * as far as its underside (tail and head too) and its feet where they are now need at the pitch it has, so that where the way rises ahead (the foot of a slope, the edge of
 * the terrace) the front feet do not go into the rise, nor the tail into the flat behind. The friend turns toward where it goes, and at the end to `yaw` (when given), and
 * onDone is called. Mosi's walk is his own clip (`isMosi`): the same route, his walk at the pace.
 */
const turn = (from, to, k) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;
const clamp = THREE.MathUtils.clamp;

export function createWalkers({ stage, ground = null }) {
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
  // A walker's body against the ground, in metres at its size, measured once from its skin as it stands (every other vertex): how far its toes reach ahead of its root and its
  // heels behind it (the skin its foot bones carry), and its underside (`under`: in ten lengths from tail to nose, the lowest point of the skin over the root's level, [x, y]).
  // The stride takes the feet further than they stand (the planted feet keep to the plane of the pitched body: baby-actors.js, footing.js): `ahead` and `behind` are the most
  // its foot bones have yet gone past where they were then, and `sole` is how high the foot bones stand over the soles.
  const spans = new WeakMap(), v = new THREE.Vector3();
  const footRange = (actor, span) => { let hi = -Infinity, lo = Infinity; for (const bone of span.feet) { const x = actor.root.worldToLocal(bone.getWorldPosition(v)).x * span.k; if (x > hi) hi = x; if (x < lo) lo = x; } return [hi, lo]; };
  const spanOf = actor => {
    if (!spans.has(actor)) {
      const root = actor.root, xs = [], all = [], feet = [], k = isMosi(actor) ? root.scale.x : base.get(actor) ?? root.scale.x; root.updateMatrixWorld(true);
      const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert(), model = actor.model ?? root;
      model.traverse(o => {
        if (o.isBone && /Foot/.test(o.name)) feet.push(o);
        if (!o.isSkinnedMesh) return;
        const { position, skinIndex, skinWeight } = o.geometry.attributes, bones = o.skeleton.bones;
        if (!skinIndex || !skinWeight) return;
        for (let i = 0; i < position.count; i += 2) {
          let b = 0, most = -1; for (let c = 0; c < 4; c++) { const w = skinWeight.getComponent(i, c); if (w > most) { most = w; b = skinIndex.getComponent(i, c); } }
          o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).applyMatrix4(toRoot); all.push(v.x * k, v.y * k);
          if (/Foot|Toe/.test(bones[b]?.name ?? '')) xs.push(v.x);
        }
      });
      if (!xs.length) for (const bone of feet) xs.push(bone.getWorldPosition(v).applyMatrix4(toRoot).x);
      const span = { k, feet, front: xs.length ? Math.max(.1, xs.reduce((a, b) => Math.max(a, b)) * k) : .1, back: xs.length ? Math.max(.1, -xs.reduce((a, b) => Math.min(a, b)) * k) : .1, ahead: 0, behind: 0, under: [], sole: 0 };
      if (all.length) {
        let x0 = Infinity, x1 = -Infinity; for (let i = 0; i < all.length; i += 2) { x0 = Math.min(x0, all[i]); x1 = Math.max(x1, all[i]); }
        const bins = Array.from({ length: 10 }, () => [0, Infinity]);
        for (let i = 0; i < all.length; i += 2) { const bin = bins[Math.min(9, Math.floor((all[i] - x0) / Math.max(1e-6, x1 - x0) * 10))]; if (all[i + 1] < bin[1]) { bin[0] = all[i]; bin[1] = all[i + 1]; } }
        span.under = bins.filter(bin => bin[1] < Infinity);
      }
      [span.hi, span.lo] = feet.length ? footRange(actor, span) : [0, 0];
      span.sole = feet.length ? Math.min(...feet.map(bone => root.worldToLocal(bone.getWorldPosition(v)).y * k)) : 0;
      spans.set(actor, span);
    }
    return spans.get(actor);
  };
  /** A pitched body on the ground along its way: `along(d)` is the place d metres ahead on the way (behind: negative) as the root's height there. Returns the pitch of the line from
   * the ground under its heels to the ground under its toes, as far as its stride takes them; `settle` then puts the root as high as its underside and its feet need. */
  function bodyOn(actor, along) {
    const span = spanOf(actor);
    if (span.feet.length) { const [hi, lo] = footRange(actor, span), most = span.front + span.back; span.ahead = clamp(hi - span.hi, span.ahead, most); span.behind = clamp(span.lo - lo, span.behind, most); }
    const front = span.front + span.ahead, back = span.back + span.behind, f = along(front), b = along(-back);
    return { actor, span, front, back, f, b, under: span.under.map(([x, y]) => [x, y, along(x).y]), pitch: Math.atan2(f.y - b.y, front + back) };
  }
  /** At pitch `tilt`, raises the root (its yaw, pitch and place along the way already set) as far as needed that nothing of the body's underside goes under the ground along its
   * way (nor within `margin` of it where it is over the root's level: the head, the tail and the belly, not the feet), nor its feet where they are now (the stride and its
   * turns take them off the way). */
  function settle(body, tilt, margin = 0) {
    const { actor, span, front, back, f, b } = body, root = actor.root, t = Math.tan(tilt);
    let y = Math.max(root.position.y, f.y - front * t, b.y + back * t);
    for (const [x, low, g] of body.under) y = Math.max(y, g - x * t - low + (low > 0 ? margin : 0));
    root.position.y = y;
    if (!ground) return;
    let lift = 0;
    for (const foot of span.feet) { foot.getWorldPosition(v); const h = ground(v.x, v.z); if (Number.isFinite(h)) lift = Math.max(lift, rootY(actor, h) + span.sole - v.y); }
    root.position.y += lift;
  }

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
    /** Lays a body on a way that is not a walk of these walkers (level 1's crossing: the friends on its log and Mosi): pitched from the ground under its heels to the
     * ground under its toes and its root raised as far as its underside needs (bodyOn and settle above); `along(d)` as for bodyOn. */
    lie(actor, along) { const body = bodyOn(actor, along); actor.root.rotation.z = body.pitch; settle(body, body.pitch); },
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
            const under = ground && seg.ground !== false ? points.map(p => ground(p.x, p.z)) : null;
            const over = under && under.every(Number.isFinite) ? points.map((p, k) => p.y - rootY(actor, under[k])) : null;
            seg.route = { points, lengths, total: lengths.at(-1), over }; seg.s = 0;
            if (!w.walking && seg.route.total > .02) { walkOn(actor, seg.speed ?? 3, reduced); w.walking = true; }
          }
          const { points, lengths, total, over } = seg.route, speed = seg.speed ?? 3;
          const at = d => { // the point at distance d along the route (before its start and past its end: on along its first or last leg, where the heels and toes are)
            let k = 1; while (k < lengths.length - 1 && lengths[k] < d) k++;
            const len = lengths[k] - lengths[k - 1], u = len > .05 ? (d - lengths[k - 1]) / len : clamp((d - lengths[k - 1]) / Math.max(1e-6, len), 0, 1), p = points[k - 1].clone().lerp(points[k], u);
            if (over) { const h = ground(p.x, p.z), w = clamp(u, 0, 1); if (Number.isFinite(h)) p.y = rootY(actor, h) + over[k - 1] + (over[k] - over[k - 1]) * w; }
            return p;
          };
          const need = Math.max(0, total - seg.s), step = speed * budget;
          seg.s += Math.min(need, step);
          const here = at(seg.s), ahead = at(seg.s + .45), behind = at(seg.s - .45), back = seg.backward ? -1 : 1;
          // (pitched on the ground: the body along the line between the ground under its toes and under its heels, as far as its stride takes them; on a solid with its
          // surface, the same over that surface; a friend that backs has its toes behind it on the way)
          const onSurface = seg.surface && !over ? d => { const p = at(seg.s + back * d), h = seg.surface(p.x, p.z); if (Number.isFinite(h)) p.y = rootY(actor, h); return p; } : null;
          const body = w.pitch && over ? bodyOn(actor, d => at(seg.s + back * d)) : w.pitch && onSurface ? bodyOn(actor, onSurface) : null;
          root.position.copy(here);
          const dx = ahead.x - here.x, dz = ahead.z - here.z;
          if (Math.hypot(dx, dz) > .02) root.rotation.y = turn(root.rotation.y, Math.atan2(-dz, dx) + (back < 0 ? Math.PI : 0), reduced ? 1 : 1 - Math.exp(-dt / .11));
          if (w.pitch) {
            const target = body ? body.pitch : back * Math.atan2(ahead.y - behind.y, Math.hypot(ahead.x - behind.x, ahead.z - behind.z) + 1e-6);
            w.tilt = turn(w.tilt, target, reduced ? 1 : 1 - Math.exp(-dt / (body ? .06 : .2))); root.rotation.z = w.tilt;
            // (and at the pitch it has, nothing of it goes under the ground: the root rises as far as its underside and its feet need)
            if (body) settle(body, w.tilt);
          }
          else root.rotation.z = 0;
          if (seg.s >= total - 1e-4) { budget = step > need ? (step - need) / Math.max(.01, speed) : 0; w.i++; seg.route = null; continue; }
          break;
        }
      }
    },
    /** Puts a friend at a point on the ground (a Vector3) facing `yaw`, drawn at its size. */
    place(actor, point, yaw, visible = true) { const root = actor.root; root.position.copy(point); root.position.y = rootY(actor, point.y); root.rotation.set(0, yaw ?? root.rotation.y, 0); root.visible = visible; if (!isMosi(actor)) root.scale.setScalar(base.get(actor) ?? 1); },
    rootY,
    /** For a body the mover itself moves along a way (the wrong friends' goes up the path): `bodyOn(actor, along)` and `settle(body, tilt)`, as a pitched walk uses them. */
    bodyOn,
    settle,
  };
}
