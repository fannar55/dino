import * as THREE from 'three';

/**
 * The rope of level 2's fourth step: a tube along a curve that the code bends (the owner's rule for the rope: a line, as the wrap on the branch of level 1, because it has to hang, draw taut
 * and swing). Its texture is ambientCG's Rope 001 (CC0, assets/memory/bord2/rope-color.webp, rope-source.json), repeated along it. Everything is told in the frame of its `parent` (the upper
 * gorge's frame: x forward, y up, z to the right).
 *
 *   createRope(stage, { from, to, sag, parent, groundAt, route, trunk })
 *     from      the rope's fixed end: where it is tied at the foot of the cliff (a point)
 *     to        its free end when it lies (a point near `from`: the coil the Flugeðlur pick up)
 *     sag       how loose the rope hangs between the two when it is carried (metres at the middle per 10 m, default 1.3)
 *     route     the handrail: the points the rope runs along when it is taut (from the foot to the tree, along the path's edge)
 *     trunk     { base, radius }: the tree it is wound round
 *     groundAt  (x, z) -> y, so that a rope that lies never goes under the ground
 *
 *   hang()              lets it go slack: the coil lies on the ground at the foot again (also the start of a round)
 *   carry(a, b, lift)   it is carried: from the foot to the carrier `b` and on to `a` (the end), `lift` 0..1 how far it has come off the ground (the first moments of a lift)
 *   setTrail(points)    the end has gone round the trunk: the places it has been (points of the frame), wound on after the part that is carried
 *   tighten(t)          draws it taut (0 as it hung from the carriers, 1 the handrail along the route, the wind close round the trunk)
 *   swing(t, amount)    sets how far it sways: t is the time (the phase)
 *   update()            rebuilds the tube when something changed
 *
 * The tube is ROPE_TRIANGLES triangles (under the plan's 1,000).
 */
const SEGMENTS = 72, SIDES = 7, RADIUS = .058;
export const ROPE_TRIANGLES = SEGMENTS * SIDES * 2;
const url = new URL('../../../../assets/memory/bord2/rope-color.webp', import.meta.url).href;
const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function createRope(stage, { from, to, sag = 1.3, parent, groundAt = () => 0, route = [], trunk = null, rise = .5 } = {}) {
  const T = stage?.THREE ?? THREE, scene = parent ?? stage.scene;
  const A = from.clone(), B0 = to.clone();
  const texture = new T.TextureLoader().load(url); texture.colorSpace = T.SRGBColorSpace; texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.anisotropy = 4;
  const material = new T.MeshStandardMaterial({ map: texture, color: '#f2dcb4', roughness: .92, metalness: 0 });
  const position = new Float32Array((SEGMENTS + 1) * (SIDES + 1) * 3), normal = new Float32Array(position.length), uv = new Float32Array((SEGMENTS + 1) * (SIDES + 1) * 2), index = [];
  for (let i = 0; i < SEGMENTS; i++) for (let j = 0; j < SIDES; j++) { const a = i * (SIDES + 1) + j, b = a + 1, c = a + SIDES + 1, d = c + 1; index.push(a, c, b, b, c, d); }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(position, 3).setUsage(T.DynamicDrawUsage)); geometry.setAttribute('normal', new T.BufferAttribute(normal, 3).setUsage(T.DynamicDrawUsage)); geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  const mesh = new T.Mesh(geometry, material); mesh.name = 'Reipið'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);

  const state = { mode: 'lying', a: B0.clone(), b: B0.clone(), lift: 0, tight: 0, phase: 0, swing: 0, trail: [], dirty: true, tip: null };
  const route3 = route.map(p => p.clone()), routeLengths = [0]; for (let i = 1; i < route3.length; i++) routeLengths.push(routeLengths[i - 1] + route3[i].distanceTo(route3[i - 1]));
  const onRoute = u => { // the handrail at `u` of its length
    if (route3.length < 2) return A.clone();
    const s = Math.min(1, Math.max(0, u)) * routeLengths.at(-1); let i = 1; while (i < routeLengths.length - 1 && routeLengths[i] < s) i++;
    return route3[i - 1].clone().lerp(route3[i], (s - routeLengths[i - 1]) / Math.max(1e-6, routeLengths[i] - routeLengths[i - 1]));
  };
  // The coil on the ground at the foot: the rope laid in loose loops from the stake to its free end (a heap).
  const lying = u => {
    const p = A.clone().lerp(B0, Math.min(1, u * 1.5)), wave = Math.sin(u * Math.PI * 7.5) * .42 * Math.sin(Math.min(1, u * 1.1) * Math.PI), loop = Math.sin(u * Math.PI * 3) * .3;
    p.x += loop; p.z += wave * (1 - u * .3); p.y = groundAt(p.x, p.z) + RADIUS + .015 + Math.abs(Math.sin(u * Math.PI * 9)) * .05; return p;
  };
  // The rope as it is carried: from the stake to `b` in a loose arc (the farther the carriers, the less it sags), swaying a little sideways.
  const arc = u => {
    const end = state.b, d = A.distanceTo(end), q = A.clone().lerp(end, u), hang = sag * (d / 10) * Math.min(1, .35 + d / 14) * 4 * u * (1 - u) * (1 - state.tight);
    q.y -= hang; const side = Math.sin(u * Math.PI) * state.swing * Math.sin(state.phase * 5.1 + u * 4.2);
    q.x += side * .35; q.z += side; q.y = Math.max(q.y, groundAt(q.x, q.z) + RADIUS + .05); return q;
  };
  // The taut rope: along the handrail, a little above the path's edge.
  const taut = u => { const q = onRoute(u); q.y += rise + .03 * Math.sin(u * Math.PI); return q; };

  function build() {
    const points = [], count = 30, w = smooth(state.tight), lift = smooth(state.lift);
    for (let i = 0; i <= count; i++) {
      const u = i / count, free = state.mode === 'lying' ? lying(u) : lift >= 1 ? arc(u) : lying(u).lerp(arc(u), lift);
      points.push(w > 0 ? free.lerp(taut(u), w) : free);
    }
    if (state.mode === 'carried' && !state.trail.length && state.a.distanceTo(state.b) > .05) points.push(state.a.clone());
    // the part that has gone round the trunk: where the end has been, drawn in to the trunk as the rope tightens (its loops close on the wood, each a little higher)
    if (trunk && state.trail.length) {
      const c = trunk.base, n = state.trail.length;
      state.trail.forEach((p, k) => {
        const dx = p.x - c.x, dz = p.z - c.z, r = Math.hypot(dx, dz) || 1, rr = lerp(r, trunk.radius + RADIUS + .01, w), y = lerp(p.y, c.y + .5 + .75 * k / Math.max(1, n - 1), w);
        points.push(new T.Vector3(c.x + dx / r * rr, y, c.z + dz / r * rr));
      });
    }
    const curve = new T.CatmullRomCurve3(points, false, 'centripetal'), samples = [], tangents = [];
    for (let i = 0; i <= SEGMENTS; i++) { const t = i / SEGMENTS; samples.push(curve.getPointAt(t)); tangents.push(curve.getTangentAt(t)); }
    const n = new T.Vector3(0, 1, 0), v = new T.Vector3(), binormal = new T.Vector3(); if (Math.abs(tangents[0].y) > .95) n.set(1, 0, 0);
    let along = 0;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = tangents[i]; n.sub(v.copy(t).multiplyScalar(n.dot(t))).normalize(); binormal.crossVectors(t, n).normalize();
      if (i) along += samples[i].distanceTo(samples[i - 1]);
      for (let j = 0; j <= SIDES; j++) {
        const angle = j / SIDES * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle), k = i * (SIDES + 1) + j;
        const nx = n.x * c + binormal.x * s, ny = n.y * c + binormal.y * s, nz = n.z * c + binormal.z * s;
        position[k * 3] = samples[i].x + nx * RADIUS; position[k * 3 + 1] = samples[i].y + ny * RADIUS; position[k * 3 + 2] = samples[i].z + nz * RADIUS;
        normal[k * 3] = nx; normal[k * 3 + 1] = ny; normal[k * 3 + 2] = nz;
        // the strands run along the rope: the texture repeats once for every .85 metres, twice round
        uv[k * 2] = along / .85; uv[k * 2 + 1] = j / SIDES * 2;
      }
    }
    geometry.attributes.position.needsUpdate = true; geometry.attributes.normal.needsUpdate = true; geometry.attributes.uv.needsUpdate = true;
    geometry.computeBoundingSphere(); state.dirty = false; state.tip = samples.at(-1).clone();
  }
  const api = {
    mesh, triangles: ROPE_TRIANGLES,
    /** Slack: the coil lies on the ground at the foot, the way it starts. */
    hang() { Object.assign(state, { mode: 'lying', lift: 0, tight: 0, swing: 0, phase: 0, trail: [], dirty: true }); state.a.copy(B0); state.b.copy(B0); mesh.visible = true; },
    /** Carried by two friends: `a` is the end, `b` the one behind it (the rope runs from the foot through `b` to `a`); `lift` how far it has come off the ground. */
    carry(a, b, lift = 1) { state.mode = 'carried'; state.a.copy(a); state.b.copy(b ?? a); state.lift = lift; state.dirty = true; mesh.visible = true; },
    /** The end has been round the trunk: the places it went (points of the frame). */
    setTrail(points) { state.trail = points.map(p => p.clone()); state.dirty = true; },
    /** Draws the rope taut: 0 hanging from the carriers, 1 the handrail. */
    tighten(t) { state.tight = Math.min(1, Math.max(0, t)); state.dirty = true; },
    /** The rope sways: `t` is a time (it sets the phase); `amount` how much (metres at the middle). */
    swing(t, amount = state.swing) { if (state.swing !== amount || state.swing > 0) state.dirty = true; state.phase = t; state.swing = amount; },
    /** The end of the tube now (a point of the frame). */
    tip: () => (state.tip ?? B0).clone(),
    get tight() { return state.tight; }, get mode() { return state.mode; }, get visible() { return mesh.visible; },
    show() { mesh.visible = true; state.dirty = true; }, hide() { mesh.visible = false; },
    update() { if (state.dirty && mesh.visible) build(); },
    /** A new round. */
    reset() { api.hang(); mesh.visible = false; },
    dispose() { scene.remove(mesh); geometry.dispose(); material.dispose(); texture.dispose(); },
    /** (QA) the state. */
    debug: () => ({ mode: state.mode, lift: +state.lift.toFixed(2), tight: +state.tight.toFixed(2), trail: state.trail.length, visible: mesh.visible, tip: state.tip ? state.tip.toArray().map(x => +x.toFixed(2)) : null }),
  };
  return api;
}
