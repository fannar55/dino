// Grameðla kemur!'s measurements (tools/gramedla-probe.mjs reads them; spec section 7): for what is on the stage now, how far its
// lead comes out, the depth probe's shares of the picture (in front of the screen, at it, behind), the far background's parallax,
// the frame and ground rules, the particles' places worked out from the table (the probe does not see them: they write no depth),
// and the clearances that say nothing passes through anything.
import * as THREE from 'three';
import { bodyMesh } from '../../engine/clip-probe.js';
import { createDepthProbe } from '../../engine/depth-probe.js';
import { plantVolumes, reachInto } from '../../engine/tree-probe.js';
import { createShell } from '../../engine/shell.js';
import { EDGE_K, MIDDLE, outOf } from './keys.js';

const EDGE = 0.02; // a speck this near a frame edge (share of the frame) counts as at it

export function createMeasure(world, { stage, D, GRASS, GROUND_SHARE, pose, cast, nearLane, gram, director }) {
  const { camera, gler } = world;
  const { frameOf, groundEdgeDepth } = stage;
  const probe = createDepthProbe(world, { width: 320 });
  const shells = new Map();
  const shellOf = actor => { if (!shells.has(actor)) shells.set(actor, createShell(THREE, actor)); return shells.get(actor); };
  const p = new THREE.Vector3();
  const r3 = n => +n.toFixed(3);

  /** The nearest of an actor's skin (every `step`th vertex) in the screen's frame now, and any of it in front of the screen at an edge. */
  function skinOf(actor, step = 3, body = bodyMesh(actor)) {
    body.skeleton.update();
    const pos = body.geometry.attributes.position;
    let near = { k: Infinity }, edge = { k: Infinity };
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < pos.count; i += step) {
      body.getVertexPosition(i, p).applyMatrix4(body.matrixWorld);
      const [u, v, k] = frameOf(p, camera);
      if (k <= 0 || u < -0.3 || u > 1.3 || v < -0.3 || v > 1.3) continue;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        if (k < near.k) near = { k: r3(k), u: r3(u), v: r3(v) };
        if (k < 1) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      }
      if ((u < EDGE || u > 1 - EDGE || v < EDGE || v > 1 - EDGE) && k < edge.k) edge = { k: r3(k), u: r3(u), v: r3(v) };
    }
    return { near, edge, frontBox: u0 < Infinity ? [u0, v0, u1, v1].map(r3) : null };
  }

  /** The specks of the groups showing, in the screen's frame now (where the timeline put them: worked out, not seen). */
  function particles() {
    const out = [];
    for (const g of cast.groups.values()) {
      if (!g.object.visible) continue;
      let nearest = { k: Infinity }, front = 0, wideNear = 0, atEdge = 0;
      for (const q of g.now) {
        const [u, v, k] = frameOf(q, camera);
        if (k < nearest.k) nearest = { k: r3(k), u: r3(u), v: r3(v) };
        if (k < 1) front++;
        const inMiddle = u >= MIDDLE[0] && u <= MIDDLE[1] && v >= MIDDLE[0] && v <= MIDDLE[1];
        if (k < EDGE_K && !inMiddle) wideNear++;
        if (k < 1 && (u < EDGE || u > 1 - EDGE || v < EDGE || v > 1 - EDGE)) atEdge++;
      }
      out.push({ group: g.name, kind: g.spec.kind, count: g.points.length, front, nearest, out: r3(outOf(nearest.k) * 100), wideNear, atEdge });
    }
    return out;
  }

  /** How near any of an actor's capsules comes to the plants by the lane (m into one, or the clearance when none is reached). */
  function plantsAgainst(actor) {
    const shell = shellOf(actor);
    shell.update();
    // the capsules where her bones are this frame (update() alone leaves them where they were last placed)
    const capsules = shell.place();
    let worst = null;
    for (const pl of nearLane) {
      const hit = reachInto(plantVolumes(pl), capsules, 0);
      if (hit && (!worst || hit.depth > worst.depth)) worst = { name: pl.name, x: r3(pl.x), z: r3(pl.z), depth: r3(hit.depth), bone: hit.bone, y: r3(hit.y) };
    }
    if (worst) return { into: worst };
    // no contact: the nearest any capsule comes to a plant's trunk, across the ground
    let clear = Infinity;
    for (const pl of nearLane) {
      const tr = (pl.model?.trunk?.r ?? 0.3) * (pl.scale ?? 1);
      for (const c of capsules) for (const p of [c.a, c.b]) clear = Math.min(clear, Math.hypot(pl.x - p[0], pl.z - p[2]) - c.r - tr);
    }
    return { clear: r3(clear) };
  }
  // a small thing (a bird, the butterfly: a ball of radius r at pt) against the plants' own volumes, height and all: the depth into
  // one (negative) or the clearance, found by growing the ball until it touches (to 1 cm, up to 2 m)
  const volumes = new Map();
  const volumesOf = pl => { if (!volumes.has(pl)) volumes.set(pl, plantVolumes(pl)); return volumes.get(pl); };
  const nearestPlant = (pt, r = 0.1) => {
    const ball = [{ a: [pt.x, pt.y, pt.z], b: [pt.x, pt.y, pt.z], r }];
    let into = 0;
    for (const pl of nearLane) { const hit = reachInto(volumesOf(pl), ball, 0); if (hit) into = Math.max(into, hit.depth); }
    if (into > 0) return r3(-into);
    const touches = g => nearLane.some(pl => reachInto(volumesOf(pl), ball, g));
    if (!touches(2)) return 2;
    let lo = 0, hi = 2;
    while (hi - lo > 0.01) { const m = (lo + hi) / 2; if (touches(m)) hi = m; else lo = m; }
    return r3(lo);
  };

  function measure(key) {
    const Dn = gler?.plane ?? D;
    const strength = gler?.settings.strength ?? 0.02;
    camera.updateMatrixWorld();
    // a pixel of the border is the ground when the point it shows is within GRASS m over the terrain (the floor and its grass)
    const ray = new THREE.Vector3(), fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const isGround = (u, vv, dep) => {
      ray.set(2 * u - 1, 1 - 2 * vv, 0.5).unproject(camera).sub(camera.position).normalize();
      const t = dep / ray.dot(fwd);
      const x = camera.position.x + ray.x * t, y = camera.position.y + ray.y * t, z = camera.position.z + ray.z * t;
      return y - world.heightAt(x, z) < GRASS;
    };
    const depth = probe.sample(Dn, { isGround });
    let ground = Infinity;
    for (let x = -1; x <= 1.0001; x += 0.25) ground = Math.min(ground, groundEdgeDepth(camera, x));
    const far = depth.farthest;
    const row = {
      key: key.id, name: key.name, time: key.time, shape: [innerWidth, innerHeight], strength, D: r3(Dn),
      picture: { front: depth.front, at: depth.at, behind: depth.behind, sky: depth.sky },
      background: { farthestK: far, parallax: +(strength * (1 - 1 / far)).toFixed(4) },
      edge: { border: r3(depth.border), borderAt: depth.borderAt, ok: depth.border >= 1, wide: r3(depth.wide), wideAt: depth.wideAt, wideOk: depth.wide >= EDGE_K, middle: r3(depth.middle), middleAt: depth.middleAt, groundBorder: r3(depth.groundBorder) },
      ground: { k: r3(ground / Dn), ok: ground / Dn >= GROUND_SHARE },
      particles: particles(),
      actors: {},
      clear: {},
    };
    if (key.gram) {
      const [u, v, k] = frameOf(pose.snout(p), camera);
      const { layers, ...solved } = director.now.gram ?? {};
      row.actors.gram = { snout: { u: r3(u), v: r3(v), k: r3(k), out: r3(outOf(k) * 100) }, skin: skinOf(gram), solved, layers };
      row.clear.gramPlants = plantsAgainst(gram);
    }
    if (key.flugedla) {
      const b = cast.beak();
      const [u, v, k] = frameOf(b, camera);
      row.actors.flugedla = { beak: { u: r3(u), v: r3(v), k: r3(k), out: r3(outOf(k) * 100) }, skin: skinOf(cast.her, 3, cast.herBody()), egill: skinOf(cast.boy, 2) };
      row.clear.flugedlaPlants = plantsAgainst(cast.her);
    }
    if (key.butterfly) {
      const b = cast.butterflyAt(new THREE.Vector3());
      const [u, v, k] = frameOf(b, camera);
      row.actors.butterfly = { u: r3(u), v: r3(v), k: r3(k), out: r3(outOf(k) * 100), toPlant: nearestPlant(b) };
      if (key.gram) row.clear.butterflyToSnout = r3(b.distanceTo(pose.snout(p)));
    }
    if (key.birds) {
      const rows = cast.flock.children.map(m => { const [u, v, k] = frameOf(m.getWorldPosition(p), camera); return { u: r3(u), v: r3(v), k: r3(k), toPlant: nearestPlant(p) }; });
      const near = rows.reduce((a, b) => (b.k < a.k ? b : a), { k: Infinity });
      let apart = Infinity;
      const list = cast.flock.children;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) apart = Math.min(apart, list[i].position.distanceTo(list[j].position));
      row.actors.birds = { count: rows.length, nearest: near, out: r3(outOf(near.k) * 100), farthest: r3(Math.max(...rows.map(r => r.k))), toPlant: Math.min(...rows.map(r => r.toPlant)), apart: r3(apart) };
    }
    // the lead: what the label names, as far out as it is measured now
    const leadK = key.lead === 'gram' ? row.actors.gram?.skin.near.k ?? row.actors.gram?.snout.k
      : key.lead === 'butterfly' ? row.actors.butterfly?.k
      : key.lead === 'birds' ? row.actors.birds?.nearest.k
      : row.actors.flugedla?.beak.k;
    row.lead = { what: key.lead, k: leadK, out: leadK ? r3(outOf(leadK) * 100 * strength / 0.02) : null };
    return row;
  }
  /** Only the lead, as the label says it (no depth probe: cheap enough for the review page to ask now and then). */
  function lead(key) {
    camera.updateMatrixWorld();
    const strength = gler?.settings.strength ?? 0.02;
    const kOfPoint = pt => frameOf(pt, camera)[2];
    const k = key.lead === 'gram' ? skinOf(gram, 3).near.k
      : key.lead === 'butterfly' ? kOfPoint(cast.butterflyAt(p))
      : key.lead === 'birds' ? Math.min(...cast.flock.children.map(m => kOfPoint(m.getWorldPosition(p))))
      : cast.beak() ? kOfPoint(cast.beak()) : null;
    return { what: key.lead, k, out: Number.isFinite(k) ? r3(strength * (1 / k - 1) * 100) : null };
  }
  // ---- the motion (tools/gramedla-probe.mjs --hreyfing): each step of the show, what is out and where, the rules and clearances ----
  const headVerts = pose.headVerts;
  const body = bodyMesh(gram);
  const atEdge = (u, v) => u < EDGE || u > 1 - EDGE || v < EDGE || v > 1 - EDGE;
  const point = (q, extra = {}) => { const [u, v, k] = frameOf(q, camera); return { k: r3(k), u: r3(u), v: r3(v), edge: k < 1 && atEdge(u, v), ...extra }; };
  /** One step: { t, things: { name: { near: {k,u,v}, edge (k of any of it in front at an edge, or null) } }, specks, ground, depth, clear }. */
  function sample({ depth = true, clear = true } = {}) {
    const n = director.now;
    camera.updateMatrixWorld();
    const row = { t: +n.t.toFixed(3), things: {}, specks: [], clear: {} };
    const skin = (actor, step, mesh) => { const s = skinOf(actor, step, mesh); return { near: s.near, edge: s.edge.k < 1 ? s.edge : null, box: s.frontBox }; };
    if (n.gram) row.things.gram = skin(gram, 4);
    if (n.flugedla) { row.things.flugedla = skin(cast.her, 4, cast.herBody()); row.things.egill = skin(cast.boy, 4); }
    const bpos = n.butterfly && n.butterfly.mode !== 'hidden' ? cast.butterflyAt(new THREE.Vector3()) : null;
    if (bpos) row.things.butterfly = { near: point(bpos), edge: point(bpos).edge ? point(bpos) : null };
    if (n.birds) {
      const list = cast.birds.filter(m => m.visible).map(m => point(m.getWorldPosition(new THREE.Vector3())));
      const near = list.reduce((a, b) => (b.k < a.k ? b : a), { k: Infinity });
      row.things.birds = { near, edge: list.find(b => b.edge) ?? null, wide: list.filter(b => b.k < EDGE_K && !(b.u >= MIDDLE[0] && b.u <= MIDDLE[1] && b.v >= MIDDLE[0] && b.v <= MIDDLE[1])).length };
    }
    row.specks = particles().map(g => ({ group: g.group, front: g.front, k: g.nearest.k, out: g.out, wideNear: g.wideNear, atEdge: g.atEdge }));
    let ground = Infinity;
    for (let x = -1; x <= 1.0001; x += 0.25) ground = Math.min(ground, groundEdgeDepth(camera, x));
    row.ground = r3(ground / (gler?.plane ?? D));
    if (depth) {
      const Dn = gler?.plane ?? D;
      const ray = new THREE.Vector3(), fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      const isGround = (u, vv, dep) => {
        ray.set(2 * u - 1, 1 - 2 * vv, 0.5).unproject(camera).sub(camera.position).normalize();
        const tt = dep / ray.dot(fwd);
        return camera.position.y + ray.y * tt - world.heightAt(camera.position.x + ray.x * tt, camera.position.z + ray.z * tt) < GRASS;
      };
      const d = probe.sample(Dn, { isGround });
      row.depth = { border: r3(d.border), borderAt: d.borderAt, groundBorder: r3(d.groundBorder), front: d.front, at: d.at, farthest: d.farthest };
    }
    if (clear) {
      if (n.gram) row.clear.gramPlants = plantsAgainst(gram);
      if (n.flugedla) row.clear.flugedlaPlants = plantsAgainst(cast.her);
      if (n.birds) {
        const list = cast.birds.filter(m => m.visible);
        let apart = Infinity, plant = Infinity;
        for (let i = 0; i < list.length; i++) {
          plant = Math.min(plant, nearestPlant(list[i].position, 0.24));
          for (let j = i + 1; j < list.length; j++) apart = Math.min(apart, list[i].position.distanceTo(list[j].position));
        }
        row.clear.birds = { apart: r3(apart), plant: r3(plant) };
      }
      if (bpos) {
        row.clear.butterflyPlant = nearestPlant(bpos, 0.08);
        if (n.gram) {
          // the butterfly to her skin (her head's, where it would meet her): sitting on her snout is meant
          body.skeleton.update();
          let near = Infinity;
          for (let i = 0; i < headVerts.length; i += 2) near = Math.min(near, body.getVertexPosition(headVerts[i], p).applyMatrix4(body.matrixWorld).distanceTo(bpos));
          row.clear.butterflyGram = r3(near);
        }
      }
    }
    return row;
  }
  return { measure, skinOf, lead, sample };
}
