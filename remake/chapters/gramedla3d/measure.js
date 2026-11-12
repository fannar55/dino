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

export function createMeasure(world, { stage, D, GRASS, GROUND_SHARE, pose, cast, nearLane, gram }) {
  const { camera, gler } = world;
  const { frameOf, groundEdgeDepth } = stage;
  const probe = createDepthProbe(world, { width: 320 });
  const shells = new Map();
  const shellOf = actor => { if (!shells.has(actor)) shells.set(actor, createShell(THREE, actor)); return shells.get(actor); };
  const p = new THREE.Vector3();
  const r3 = n => +n.toFixed(3);

  /** The nearest of an actor's skin (every `step`th vertex) in the screen's frame now, and any of it in front of the screen at an edge. */
  function skinOf(actor, step = 3) {
    const body = bodyMesh(actor);
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

  /** The specks of the groups showing, in the screen's frame now (their places are the table's: worked out, not seen). */
  function particles() {
    const out = [];
    for (const g of cast.groups.values()) {
      if (!g.object.visible) continue;
      let nearest = { k: Infinity }, front = 0, wideNear = 0, atEdge = 0;
      for (const q of g.points) {
        stage.framePoint(q[0], q[1], q[2], p, stage.stageCam, D);
        const [u, v, k] = frameOf(p, camera);
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
    let worst = null;
    for (const pl of nearLane) {
      const hit = reachInto(plantVolumes(pl), shell.capsules, 0);
      if (hit && (!worst || hit.depth > worst.depth)) worst = { name: pl.name, x: r3(pl.x), z: r3(pl.z), depth: r3(hit.depth) };
    }
    if (worst) return { into: worst };
    // no contact: the clearance from her root's place to the nearest plant's trunk, less her reach
    let clear = Infinity;
    const at = actor.root.position;
    for (const pl of nearLane) clear = Math.min(clear, Math.hypot(pl.x - at.x, pl.z - at.z));
    return { clear: r3(clear) };
  }
  const nearestPlant = pt => {
    let best = Infinity;
    for (const pl of nearLane) best = Math.min(best, Math.hypot(pl.x - pt.x, pl.z - pt.z) - (pl.model?.trunk?.r ?? 0.3) * (pl.scale ?? 1));
    return r3(best);
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
      row.actors.gram = { snout: { u: r3(u), v: r3(v), k: r3(k), out: r3(outOf(k) * 100) }, skin: skinOf(gram), solved: world.gramedla.state.solution };
      row.clear.gramPlants = plantsAgainst(gram);
    }
    if (key.flugedla) {
      const b = cast.beak();
      const [u, v, k] = frameOf(b, camera);
      row.actors.flugedla = { beak: { u: r3(u), v: r3(v), k: r3(k), out: r3(outOf(k) * 100) }, skin: skinOf(cast.her), egill: skinOf(cast.boy, 2) };
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
  return { measure, skinOf, lead };
}
