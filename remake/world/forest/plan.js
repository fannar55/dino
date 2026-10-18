// The planner turns the chapter's layout into placements: which species, which variant, where,
// facing which way. It knows nothing about geometry beyond each model's bounds, so a species can
// be swapped (a Tripo GLB, say) without touching this file.
//
// Rules it enforces:
//   - the path stays clear (trees further than plants), the clearing stays open and sunny,
//   - every review shot keeps 1.5 m of air around the camera and an unblocked view of its
//     subject (actors) and its centre; trees may frame the edges of the frame,
//   - nothing grows where an actor stands,
//   - big crowns stay out of the sun corridor so the clearing keeps its light.
// A fern glade (layout.glade, config.js) grows a lusher rim of ferns round its clearing. The shots and the actors are the
// layout's own when it carries `shots` and `actors` (a chapter location keeps its own place clear), else the chapter's.
import * as THREE from 'three';
import { FOREST, scaled, gladeOf } from './config.js';
import { createRng, smoothstep, clamp } from './random.js';
import { sunDirection } from '../../engine/lighting.js';
import { pickLook } from '../../engine/looks.js';

class SpatialHash {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return `${i},${j}`; }
  add(item) {
    const i = Math.floor(item.x / this.cell), j = Math.floor(item.z / this.cell);
    const k = this.key(i, j);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(item);
  }
  *near(x, z, radius) {
    const i0 = Math.floor((x - radius) / this.cell), i1 = Math.floor((x + radius) / this.cell);
    const j0 = Math.floor((z - radius) / this.cell), j1 = Math.floor((z + radius) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = this.map.get(this.key(i, j));
      if (list) yield* list;
    }
  }
}

// Screen rectangle of a box in an actor's own frame (x forward, y up, z to the side), seen by a
// shot camera. `box` = [x0, x1, y0, y1, z0, z1] in metres.
const BODY = [-2.3, 2.3, 0, 2.4, -1.0, 1.0];
const HEAD = [0.7, 2.6, 0.8, 2.7, -1.05, 1.05]; // Mosi's head, frill and horns
function actorBox(view, tanH, tanV, x, z, headingRad, box = BODY) {
  const fx = Math.cos(headingRad), fz = Math.sin(headingRad);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, dMin = Infinity, visible = false;
  const w = new THREE.Vector3();
  for (const sx of [box[0], box[1]]) for (const sz of [box[4], box[5]]) for (const y of [box[2], box[3]]) {
    w.set(x + fx * sx - fz * sz, y, z + fz * sx + fx * sz).applyMatrix4(view);
    const depth = -w.z;
    if (depth < 0.3) continue;
    visible = true;
    const nx = w.x / (depth * tanH), ny = w.y / (depth * tanV);
    x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
    dMin = Math.min(dMin, depth);
  }
  if (!visible || x1 < -1.2 || x0 > 1.2 || y1 < -1.2 || y0 > 1.2) return null;
  return { x0: x0 - 0.06, x1: x1 + 0.06, y0: y0 - 0.06, y1: y1 + 0.08, depth: dMin - 0.2 };
}

// Review and scene shots become protection volumes. Static shots ([x, y, z] position) are used as
// they are; shots framed on a subject aim at its head; actor-relative shots that follow a walk are
// sampled along the layout path, other actor-relative shots sit at the actor's own position. The
// scene's face move (a push from the introduction toward the face) is added as its own shot.
// Close framings (camera within 12 m of the actor) also keep a deep backdrop behind the head free
// of crowns, fronds and bushes, so the frill stands against dark trunks, misty depth or sky.
// The shots are the layout's own when it carries `shots` (a chapter location keeps its own clear, not
// the other places'), else the chapter's.
// The actors a place protects are the layout's own `actors` ({ name: { position, heading } }, as in the chapter) when it
// carries them, since each location of a chapter has its actors in other places, else the chapter's.
const actorSpecs = (world, layout) => layout.actors ?? world.chapter?.actors ?? {};
function buildShots(world, layout, terrain, sun) {
  const shots = [];
  const actors = Object.entries(actorSpecs(world, layout)).map(([name, a]) => ({
    name, x: (a.position || [0, 0, 0])[0], z: (a.position || [0, 0, 0])[2], heading: THREE.MathUtils.degToRad(a.heading || 0),
  }));
  // the introduction turns Mosi a little toward the camera: protect both headings
  const subjectsTurned = actors.flatMap(a => [a, { ...a, heading: a.heading + THREE.MathUtils.degToRad(20) }]);
  const [cx, cz] = layout.clearing.center;
  const walk = [];
  for (let s = 0; s <= terrain.path.total; s += 1.5) {
    const [x, z, dx, dz] = terrain.path.pointAt(s);
    if (Math.hypot(x - cx, z - cz) < layout.forestEdge + 4) walk.push({ x, z, heading: Math.atan2(dz, dx) });
  }
  const headAt = a => [a.x + Math.cos(a.heading) * 1.7, 1.6, a.z + Math.sin(a.heading) * 1.7];
  function add(name, position, target, fov, subjects, kind) {
    const cam = new THREE.PerspectiveCamera(fov ?? 40, 1.6, 0.1, 1000);
    cam.position.fromArray(position);
    const tv = new THREE.Vector3().fromArray(target);
    cam.lookAt(tv);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const view = cam.matrixWorldInverse.clone();
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const tanH = tanV * cam.aspect;
    const rects = [];
    const fwd = new THREE.Vector3(target[0] - position[0], 0, target[2] - position[2]).normalize();
    const intoSun = fwd.dot(new THREE.Vector3(sun.x, 0, sun.z).normalize()) > 0.55;
    for (const a of subjects) {
      const close = Math.hypot(position[0] - a.x, position[2] - a.z) < 12;
      const body = actorBox(view, tanH, tanV, a.x, a.z, a.heading);
      if (body) { body.backdrop = close && kind !== 'track' ? (intoSun ? 24 : 10) : 0; rects.push(body); }
      if (close) {
        const head = actorBox(view, tanH, tanV, a.x, a.z, a.heading, HEAD);
        // only the near crowns behind the head share its value; farther ones are misty and lighter
        if (head) { head.backdrop = kind === 'track' ? 14 : kind === 'frame' ? (intoSun ? 24 : 16) : (intoSun ? 26 : 18); head.head = true; rects.push(head); }
      }
    }
    const targetDist = cam.position.distanceTo(tv);
    if (kind === 'static' && target[1] < 3) rects.push({ x0: -0.3, x1: 0.3, y0: -0.4, y1: 0.3, depth: targetDist * 0.92 });
    shots.push({ name, pos: cam.position.clone(), view, tanH, tanV, rects, targetDist, kind });
  }
  for (const [name, s] of Object.entries(layout.shots ?? world.chapter?.shots ?? {})) {
    const pos = s.position;
    const tgt = s.target;
    if (Array.isArray(pos)) {
      if (Array.isArray(tgt)) add(name, pos, tgt, s.fov, actors, 'static');
      else {
        // framed on a subject: aim at the actor's head and protect it
        const a = actors.find(x => x.name === (s.frame?.subject?.actor || tgt?.actor)) || actors[0];
        if (a) {
          add(name, pos, headAt(a), s.fov, subjectsTurned, 'frame');
          // the scene pushes in from here and frames the face tighter (fov 34): that framing too
          const h = headAt(a);
          const d = [h[0] - pos[0], h[1] - pos[1], h[2] - pos[2]];
          const len = Math.hypot(...d);
          const push = Math.min(0.9, len * 0.3);
          add(`${name}-push`, [pos[0] + d[0] / len * push, pos[1] + d[1] / len * push, pos[2] + d[2] / len * push], h, 34, subjectsTurned, 'frame');
        }
      }
    } else if (pos && pos.actor && Array.isArray(pos.offset) && !pos.local) {
      const o = tgt && tgt.actor && Array.isArray(tgt.offset) ? tgt.offset : [0, 0, 0];
      if (name === 'track' || s.follow) {
        walk.forEach((w, i) => {
          if (i % 2) return;
          const p = [w.x + pos.offset[0], pos.offset[1], w.z + pos.offset[2]];
          add(`${name}@${i}`, p, [w.x + o[0], 1.1 + o[1], w.z + o[2]], s.fov, [w], 'track');
        });
      } else {
        for (const a of actors) {
          add(name, [a.x + pos.offset[0], pos.offset[1], a.z + pos.offset[2]], [a.x + o[0], 1.1 + o[1], a.z + o[2]], s.fov, subjectsTurned, 'static');
        }
      }
    }
  }
  return shots;
}

// Plants whose leaves count as a crown for the backdrop rule (fronds and bushes too).
const FOLIAGE = new Set(['bush', 'fern', 'cycad', 'treeFern', 'horsetail']);

export function planForest({ world, layout, seed, terrain, library, q }) {
  const [cx, cz] = layout.clearing.center;
  const clearR = layout.clearing.radius;
  const edgeR = layout.forestEdge;
  const B = FOREST.bands;
  const P = FOREST.path;
  const T = FOREST.trees;
  const U = FOREST.understory;
  const S = FOREST.shade;
  const clearance = FOREST.shots.clearance;
  // A glade with glade.ferns above 1 has a lush rim: more ferns, each bigger (a share more for each fern beyond the first), pushing
  // the grass aside and free to grow behind a character, which other foliage is not. glade.ferns 1 is the forest as it is.
  const glade = gladeOf(layout);
  const lush = glade.ferns > 1;
  const growth = clamp(1 + FOREST.glade.fernGrowth.perFern * (glade.ferns - 1), 1, FOREST.glade.fernGrowth.max);
  const look = pickLook(world.chapter?.look || 'morning');
  const sun = sunDirection(look);
  const shots = buildShots(world, layout, terrain, sun);
  const actors = Object.values(actorSpecs(world, layout)).map(a => ({ x: (a.position || [0, 0, 0])[0], z: (a.position || [0, 0, 0])[2] }));
  const sunSamples = [];
  for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [2.2, 2.2], [-2.2, 2.2], [2.2, -2.2], [-2.2, -2.2]]) sunSamples.push(new THREE.Vector3(cx + dx, 1.2, cz + dz));

  const lodBias = q.name === 'low' ? 1 : 0; // low quality uses the next coarser model everywhere
  const cameraSpots = shots.filter(s => !s.name.includes('@')).map(s => [s.pos.x, s.pos.z]);
  const nearCamera = (x, z) => { let d = Infinity; for (const [px, pz] of cameraSpots) d = Math.min(d, Math.hypot(px - x, pz - z)); return d; };
  const occupied = new SpatialHash(4);
  const treeHash = new SpatialHash(8);
  const placements = [];
  const stats = { rejected: { path: 0, shot: 0, sun: 0, space: 0, actor: 0 }, byShot: {}, accents: { placed: 0, far: 0, ground: 0, rejected: 0 }, framing: [] };

  const radiusOf = (x, z) => Math.hypot(x - cx, z - cz);
  function bandOf(r) {
    if (r < edgeR - 2) return 'clearing';
    if (r < edgeR + B.edgeOuter) return 'edge';
    if (r < edgeR + B.innerOuter) return 'inner';
    return 'deep';
  }
  function sectorOf(band, x, z) {
    const n = B.sectors[band];
    const a = Math.atan2(z - cz, x - cx) + Math.PI;
    return Math.min(n - 1, Math.floor((a / (Math.PI * 2)) * n));
  }
  /** Open sky at a radius: 1 in the clearing, falling through the edge into the deep shade. */
  function skyAt(r) {
    if (r < clearR + 0.5) return 1;
    if (r < edgeR + 4) return 1 + (S.edgeSun - 1) * smoothstep(clearR + 0.5, edgeR + 4, r);
    if (r < edgeR + 16) return S.edgeSun + (S.innerSun - S.edgeSun) * smoothstep(edgeR + 4, edgeR + 16, r);
    return S.innerSun + (S.deepSun - S.innerSun) * smoothstep(edgeR + 16, edgeR + 32, r);
  }

  // world-space bounding spheres of a model placed at (x, y, z) with rotation and scale
  function spheres(model, x, y, z, rot, scale, tall) {
    const out = [];
    const c = Math.cos(rot), s = Math.sin(rot);
    const tw = (lx, ly, lz) => [x + (lx * c - lz * s) * scale, y + ly * scale, z + (lx * s + lz * c) * scale];
    if (tall && model.trunk) {
      out.push({ c: tw(0, 0.8, 0), r: model.trunk.flare * scale, trunk: true });
      for (let h = 2.5; h < model.trunk.top; h += 2.5) out.push({ c: tw(0, h, 0), r: model.trunk.r * scale * 1.1, trunk: true });
    }
    if (model.crown) {
      const cr = model.crown;
      if (tall) {
        out.push({ c: tw(cr.c[0], cr.c[1], cr.c[2]), r: Math.min(cr.r, cr.ry * 1.2) * scale * 0.95, crown: true });
        // crowns are wider than tall: two more spheres along the long axis
        const off = Math.max(0, cr.r - cr.ry) * 0.85;
        if (off > 0.5) {
          out.push({ c: tw(cr.c[0] + off, cr.c[1], cr.c[2]), r: cr.ry * scale * 1.05, crown: true });
          out.push({ c: tw(cr.c[0] - off, cr.c[1], cr.c[2]), r: cr.ry * scale * 1.05, crown: true });
          out.push({ c: tw(cr.c[0], cr.c[1], cr.c[2] + off), r: cr.ry * scale * 1.05, crown: true });
          out.push({ c: tw(cr.c[0], cr.c[1], cr.c[2] - off), r: cr.ry * scale * 1.05, crown: true });
        }
      } else {
        out.push({ c: tw(cr.c[0], cr.c[1], cr.c[2]), r: Math.max(cr.r, cr.ry) * scale });
      }
    }
    return out;
  }

  const _v = new THREE.Vector3();
  function shotBlocked(list, edgeShot = null) {
    for (const shot of shots) {
      for (const sp of list) {
        _v.set(sp.c[0], sp.c[1], sp.c[2]);
        const dist = _v.distanceTo(shot.pos);
        if (dist < clearance + sp.r) return shot.name;
        _v.applyMatrix4(shot.view);
        const depth = -_v.z;
        if (depth <= 0.25) continue;
        const nx = _v.x / (depth * shot.tanH), ny = _v.y / (depth * shot.tanV);
        const rx = sp.r / (depth * shot.tanH), ry = sp.r / (depth * shot.tanV);
        // a big thing right in front of the lens fills the frame: keep it away
        // (a framing trunk for this very shot may come in further from the edge)
        const keepMiddle = shot.name === edgeShot ? 0.2 : 0.45;
        if (depth < 5 && rx > 0.22 && Math.abs(nx) - rx < keepMiddle && Math.abs(ny) - ry < 0.9) return shot.name;
        // a trunk a few metres from the lens cuts an authored picture in two: only at the frame edges
        if (sp.trunk && shot.kind !== 'track' && depth < 7 && Math.abs(nx) - rx < (shot.name === edgeShot ? 0.2 : 0.5) && Math.abs(ny) - ry < 1) return shot.name;
        for (const rect of shot.rects) {
          // crowns may not sit right behind an actor either (green on green): the background
          // behind a character is the dark forest wall, the misty distance or the sky
          const limit = sp.crown && rect.backdrop && !edgeShot ? rect.depth + rect.backdrop + (sp.frond && rect.head ? 10 : 0) : rect.depth; // framing trunks may stand far behind other shots' subjects
          if (depth - sp.r > limit) continue;
          if (nx + rx > rect.x0 && nx - rx < rect.x1 && ny + ry > rect.y0 && ny - ry < rect.y1) return shot.name;
        }
      }
    }
    return null;
  }

  function sunBlocked(list) {
    for (const sp of list) {
      _v.set(sp.c[0], sp.c[1], sp.c[2]);
      for (const p of sunSamples) {
        const vx = _v.x - p.x, vy = _v.y - p.y, vz = _v.z - p.z;
        const t = vx * sun.x + vy * sun.y + vz * sun.z;
        if (t < 0) continue;
        const perp2 = vx * vx + vy * vy + vz * vz - t * t;
        if (perp2 < (sp.r + 0.6) ** 2) return true;
      }
    }
    return false;
  }

  function spaceFree(x, z, r, factor = 1) {
    for (const o of occupied.near(x, z, r + 8)) {
      const d = Math.hypot(o.x - x, o.z - z);
      const need = (r + o.r) * Math.min(factor, o.soft ?? 1);
      if (d < need) return false;
    }
    return true;
  }

  /**
   * Try to place a model. opts: { lod, variant, rot, scale, tall, pathClear, actorClear, spacing,
   * soft, sun, skipShots, sink }.
   */
  // Plants that change with distance carry several detail levels; the batcher bakes them all and
  // the cull picks one by camera distance. The deep band starts at the middle level.
  const LOD_SPECIES = new Set(['broadleaf', 'araucaria', 'treeFern', 'cycad', 'fern', 'bush', 'horsetail']);
  function levelsFor(name, r, baseLod) {
    if (!LOD_SPECIES.has(name)) return [Math.min(2, baseLod + lodBias)];
    const first = Math.min(2, (bandOf(r) === 'deep' ? 1 : 0) + lodBias);
    const out = [];
    for (let l = first; l <= 2; l++) out.push(l);
    return out;
  }
  function tryPlace(name, x, z, opts) {
    let shape = opts.shape || {};
    // the bushes right next to an authored camera get extra-fine lobes: they fill the frame there
    if (name === 'bush' && nearCamera(x, z) < 3.8) shape = { ...shape, fine: true };
    const levels = levelsFor(name, radiusOf(x, z), opts.lod ?? 0);
    const lod = levels[0];
    const model = library.get(name, opts.variant, lod, shape);
    const scale = opts.scale ?? 1;
    const tall = Boolean(opts.tall);
    const r = radiusOf(x, z);
    const pq = terrain.path.query(x, z);
    const trunkR = model.trunk ? model.trunk.flare * scale : model.radius * scale * 0.7;
    if (pq.d < (opts.pathClear ?? P.plantClear) + trunkR) { stats.rejected.path++; return null; }
    if (layout.keepOut?.(x, z) > 0.5) { stats.rejected.path++; return null; } // a layout's own bare ground
    for (const a of actors) {
      if (Math.hypot(a.x - x, a.z - z) < (opts.actorClear ?? 3.2) + model.radius * scale * 0.5) { stats.rejected.actor++; return null; }
    }
    const footprint = (opts.footprint ?? (tall ? model.trunk?.flare ?? model.radius : model.radius)) * scale;
    if (name === 'araucaria') {
      for (const o of treeHash.near(x, z, 10)) if (o.araucaria && Math.hypot(o.x - x, o.z - z) < 9) { stats.rejected.space++; return null; }
    }
    if (opts.treeSpacing) {
      for (const o of treeHash.near(x, z, opts.treeSpacing + 1)) {
        if (Math.hypot(o.x - x, o.z - z) < Math.min(opts.treeSpacing, o.s)) { stats.rejected.space++; return null; }
      }
    }
    if (!spaceFree(x, z, footprint * (opts.spacing ?? 1), opts.soft ?? 1)) { stats.rejected.space++; return null; }
    const y = terrain.heightAt(x, z) - (opts.sink ?? model.sink ?? 0) * scale;
    const rot = opts.rot ?? 0;
    const list = opts.spheres ? opts.spheres(y) : spheres(model, x, y, z, rot, scale, tall);
    // kept out from behind close-ups, but not the rim ferns of a lush glade: they are the glade, and so low that they hide nothing behind a character
    const rimFern = lush && name === 'fern' && r < edgeR + B.edgeOuter;
    if ((opts.backdrop || FOLIAGE.has(name)) && !rimFern) for (const sp of list) { sp.crown = true; sp.frond = FOLIAGE.has(name); }
    if (!opts.skipShots) {
      const blocked = shotBlocked(list, opts.edgeShot);
      if (blocked) { stats.rejected.shot++; const k = blocked.split("@")[0] + (tall ? ":tall" : ""); stats.byShot[k] = (stats.byShot[k] || 0) + 1; return null; }
    }
    if (tall && r < 40 && sunBlocked(list.filter(s => s.crown || s.c[1] > 4))) { stats.rejected.sun++; return null; }
    const band = bandOf(r);
    const placement = {
      name, model, variant: opts.variant, lod, x, y, z, rot, scale, band,
      models: levels.map(level => ({ level, model: level === lod ? model : library.get(name, opts.variant, level, shape) })),
      sector: sectorOf(band, x, z), sky: opts.sky ?? skyAt(r), phase: opts.phase ?? 0,
      blocksGrass: opts.blocksGrass ?? false, grassRadius: (opts.grassRadius ?? model.radius * 0.7) * scale,
    };
    placements.push(placement);
    occupied.add({ x, z, r: footprint, soft: opts.soft ?? 1, name, blocksGrass: placement.blocksGrass, grassRadius: placement.grassRadius });
    if (opts.treeSpacing || name === 'araucaria') treeHash.add({ x, z, s: opts.treeSpacing || 3, araucaria: name === 'araucaria' });
    return placement;
  }

  const faceClearing = (x, z) => Math.atan2(cz - z, cx - x);

  // ---- 0. the fallen log: placed first, at the first good spot of a sweep around the edge -------
  {
    const rng = createRng(seed, 'log');
    const model = library.get('log', 0, 0);
    const half = model.length / 2;
    const a0 = rng.angle();
    let placedLog = null;
    for (let step = 0; step < 144 && !placedLog; step++) {
      const a = a0 + (step % 72) * (Math.PI / 36);
      const rr = edgeR - (step < 72 ? 3.4 : 2.6);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const rot = a + Math.PI / 2 + (step % 2 ? 0.25 : -0.25); // roughly along the edge
      const dx = Math.cos(rot), dz = Math.sin(rot);
      let ok = true;
      for (let t = -1; t <= 1; t += 0.25) {
        if (terrain.path.query(x + dx * half * t, z + dz * half * t).d < P.rockClear + 0.6) { ok = false; break; }
      }
      if (!ok) continue;
      // three small spheres along the log, not one big one
      const logSpheres = y => [-0.6, 0, 0.6].map(t => ({ c: [x + dx * half * t, y + 0.5, z + dz * half * t], r: 0.9, crown: true }));
      placedLog = tryPlace('log', x, z, { variant: 0, lod: 0, rot, footprint: 1.0, spacing: 1, pathClear: 0, blocksGrass: true, grassRadius: 0.6, spheres: logSpheres });
      if (placedLog) {
        placedLog.logAxis = [dx, dz];
        placedLog.halfLength = half;
        for (let t = -1; t <= 1.001; t += 0.2) {
          const px = x + dx * half * t, pz = z + dz * half * t;
          occupied.add({ x: px, z: pz, r: 0.6, soft: 0.6, blocksGrass: true, grassRadius: 0.55 });
          terrain.stampSoil(px, pz, 1.1, 0.65);
        }
      }
    }
  }

  // ---- 1. the edge ring: big characterful trees framing the clearing ---------------------------
  {
    const rng = createRng(seed, 'edge-ring');
    let ang = rng.angle();
    const end = ang + Math.PI * 2 - 0.2;
    while (ang < end) {
      const ringR = edgeR + rng.range(T.edgeDepth[0], T.edgeDepth[1]);
      let placed = null;
      for (let attempt = 0; attempt < 5 && !placed; attempt++) {
        const a = ang + (attempt ? rng.range(-0.06, 0.06) : 0);
        const rr = ringR + attempt * 1.3;
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        const araucaria = rng.chance(T.araucariaShare.edge);
        const name = araucaria ? 'araucaria' : 'broadleaf';
        placed = tryPlace(name, x, z, {
          variant: rng.int(0, T.variants[name] - 1), lod: 0, tall: true,
          rot: faceClearing(x, z) + rng.range(-0.45, 0.45), scale: rng.range(0.95, 1.18),
          pathClear: P.treeClear, shape: araucaria ? {} : { reach: 0.9 }, treeSpacing: 5.6, phase: rng.next(),
          blocksGrass: true, grassRadius: 1.0, sink: 0.05,
        });
      }
      ang += (T.edgeSpacing * rng.range(0.85, 1.2)) / ringR;
    }
  }

  // ---- 1b. framing trunks: shots taken from inside the forest get a trunk at a frame edge ------
  {
    const rng = createRng(seed, 'framing');
    for (const shot of shots) {
      if (shot.kind !== 'static' || shot.pos.y > 3 || radiusOf(shot.pos.x, shot.pos.z) < edgeR + 1) continue; // eye-level shots from the forest
      const inv = new THREE.Matrix4().copy(shot.view).invert();
      for (const side of [-1, 1]) {
        for (let attempt = 0; attempt < 6; attempt++) {
          const depth = rng.range(3.6, 6.5);
          const nx = side * rng.range(0.78, 0.98);
          const v = new THREE.Vector3(nx * shot.tanH * depth, 0, -depth).applyMatrix4(inv);
          const p = tryPlace('broadleaf', v.x, v.z, {
            variant: rng.int(0, T.variants.broadleaf - 1), lod: 0, tall: true, rot: rng.angle(), scale: rng.range(0.95, 1.15),
            pathClear: P.treeClear, shape: { reach: 0.3 }, treeSpacing: 3.2, phase: rng.next(), blocksGrass: true, grassRadius: 1.0, edgeShot: shot.name, soft: 0.5,
          });
          if (p) { stats.framing.push(shot.name); break; }
        }
      }
    }
  }

  // ---- 2. second row, inner forest and deep forest --------------------------------------------
  function scatterTrees(stream, r0, r1, spacing, lod, share, density) {
    const rng = createRng(seed, stream);
    const area = Math.PI * (r1 * r1 - r0 * r0);
    const attempts = Math.round((area / (spacing * spacing)) * 2.2 * density);
    for (let i = 0; i < attempts; i++) {
      const a = rng.angle();
      const rr = Math.sqrt(r0 * r0 + rng.next() * (r1 * r1 - r0 * r0));
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const roll = rng.next();
      let name = 'broadleaf';
      if (roll < share.araucaria) name = 'araucaria';
      else if (roll < share.araucaria + (share.treeFern || 0)) name = 'treeFern';
      tryPlace(name, x, z, {
        variant: rng.int(0, T.variants[name] - 1), lod: name === 'treeFern' ? Math.min(lod, 1) : lod, tall: true,
        rot: rng.angle(), scale: rng.range(0.9, 1.2), pathClear: name === 'treeFern' ? 1.8 : P.treeClear,
        shape: name === 'broadleaf' ? { reach: 0.25 } : {}, treeSpacing: name === 'treeFern' ? 2.6 : spacing, phase: rng.next(),
        blocksGrass: true, grassRadius: 0.9,
      });
    }
  }
  // groups of two to four trees with open gaps between the groups: a forest, not an orchard
  function scatterClusters(stream, r0, r1, clusterSpacing, share, density) {
    const rng = createRng(seed, stream);
    const area = Math.PI * (r1 * r1 - r0 * r0);
    const count = Math.round((area / (clusterSpacing * clusterSpacing)) * 1.6 * density);
    const centres = [];
    for (let i = 0; i < count * 4 && centres.length < count; i++) {
      const a = rng.angle();
      const rr = Math.sqrt(r0 * r0 + rng.next() * (r1 * r1 - r0 * r0));
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (centres.some(c => Math.hypot(c[0] - x, c[1] - z) < clusterSpacing * 0.75)) continue;
      centres.push([x, z]);
    }
    for (const [ux, uz] of centres) {
      const n = rng.int(2, 4);
      for (let k = 0; k < n; k++) {
        const a = rng.angle(), d = k === 0 ? 0 : rng.range(2.6, 5.5);
        const x = ux + Math.cos(a) * d, z = uz + Math.sin(a) * d;
        const roll = rng.next();
        let name = 'broadleaf';
        if (roll < share.araucaria) name = 'araucaria';
        else if (roll < share.araucaria + (share.treeFern || 0)) name = 'treeFern';
        tryPlace(name, x, z, {
          variant: rng.int(0, T.variants[name] - 1), lod: 1, tall: true,
          rot: rng.angle(), scale: rng.range(0.85, 1.22), pathClear: name === 'treeFern' ? 1.8 : P.treeClear,
          shape: name === 'broadleaf' ? { reach: 0.25 } : {}, treeSpacing: name === 'treeFern' ? 2.4 : 3.3, phase: rng.next(),
          blocksGrass: true, grassRadius: 0.9,
        });
      }
    }
  }
  scatterClusters('edge-row', edgeR + 4.5, edgeR + B.edgeOuter, 9.5, { araucaria: T.araucariaShare.edge + 0.1, treeFern: 0.08 }, q.trees);
  scatterClusters('inner', edgeR + B.edgeOuter, edgeR + B.innerOuter, 9.5, { araucaria: T.araucariaShare.inner, treeFern: T.treeFernShare.inner }, q.trees);
  scatterTrees('deep', edgeR + B.innerOuter, edgeR + B.deepOuter, T.deepSpacing, 2, { araucaria: T.araucariaShare.deep, treeFern: T.treeFernShare.deep }, q.trees);

  // ---- 4. rocks: a few in the clearing, more along the edge -----------------------------------
  {
    const rng = createRng(seed, 'rocks');
    let placed = 0;
    for (let i = 0; i < 200 && placed < FOREST.clearing.rocks; i++) {
      const a = rng.angle();
      const rr = rng.range(4.5, edgeR - 2.5);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const p = tryPlace(rng.chance(0.5) ? 'rock' : 'rockSmall', x, z, {
        variant: rng.int(0, T.variants.rock - 1), lod: 0, rot: rng.angle(), scale: rng.range(0.55, 0.9), pathClear: P.rockClear,
        shape: { mossy: 0.7 }, spacing: 1.6, blocksGrass: true, grassRadius: 0.8,
      });
      if (p) { placed++; terrain.stampSoil(x, z, p.model.radius * p.scale * 1.25, 0.45); }
    }
    const edgeRocks = scaled(U.rocks, q.plants);
    placed = 0;
    for (let i = 0; i < 300 && placed < edgeRocks; i++) {
      const a = rng.angle();
      const rr = rng.range(edgeR - 1.5, edgeR + 12);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const big = rng.chance(0.55);
      const p = tryPlace(big ? 'rock' : 'rockSmall', x, z, {
        variant: rng.int(0, T.variants.rock - 1), lod: rr < edgeR + 5 ? 0 : 1, rot: rng.angle(), scale: rng.range(0.8, 1.3),
        pathClear: P.rockClear, shape: { mossy: 1.15 }, spacing: 1.2, blocksGrass: true, grassRadius: 0.85,
      });
      if (p) placed++;
    }
  }

  // ---- 5. understory shrubs: tree ferns, cycads, bushes ---------------------------------------
  function scatterKind(name, stream, count, r0, r1, opts = {}) {
    const rng = createRng(seed, stream);
    let placed = 0;
    for (let i = 0; i < count * 25 && placed < count; i++) {
      let x, z;
      const nearTrunk = opts.nearTrunk && rng.chance(opts.nearTrunk);
      if (nearTrunk) {
        const trees = placements.filter(p => p.name === 'broadleaf' || p.name === 'araucaria');
        if (!trees.length) continue;
        const t = rng.pick(trees);
        const a = rng.angle(), d = (t.model.trunk?.flare ?? 1) * t.scale + rng.range(0.8, 2.6);
        x = t.x + Math.cos(a) * d; z = t.z + Math.sin(a) * d;
      } else {
        const a = rng.angle();
        const rr = Math.sqrt(r0 * r0 + rng.next() * (r1 * r1 - r0 * r0));
        x = cx + Math.cos(a) * rr; z = cz + Math.sin(a) * rr;
      }
      const rr = radiusOf(x, z);
      if (rr < r0 || rr > r1) continue;
      const lod = rr < edgeR + 3 ? 0 : rr < edgeR + 16 ? 1 : 2;
      const p = tryPlace(name, x, z, {
        variant: rng.int(0, (T.variants[name] || 3) - 1), lod, rot: opts.face ? faceClearing(x, z) + rng.range(-0.8, 0.8) : rng.angle(),
        scale: rng.range(...(opts.scale || [0.85, 1.15])), pathClear: opts.pathClear ?? P.plantClear, tall: opts.tall,
        spacing: opts.spacing ?? 1, soft: opts.soft ?? 1, actorClear: opts.actorClear, phase: rng.next(),
        blocksGrass: opts.blocksGrass ?? false, grassRadius: opts.grassRadius, sky: opts.sky, shape: opts.shape, treeSpacing: opts.treeSpacing,
      });
      if (p) placed++;
    }
    return placed;
  }
  // medium trees: young broadleaves that fill the middle storey of the forest wall
  scatterKind('broadleaf', 'saplings', scaled(U.saplings, q.trees), edgeR + 0.5, edgeR + 12, { tall: true, nearTrunk: 0.25, shape: { reach: 0.45, size: 0.6 }, treeSpacing: 3.6, pathClear: P.treeClear - 0.6, scale: [0.85, 1.2], blocksGrass: true, grassRadius: 0.6 });
  // the inner forest gets its own middle storey, so the view between trunks meets foliage
  scatterKind('broadleaf', 'saplings-inner', scaled(U.saplingsInner, q.trees), edgeR + 12, edgeR + 30, { tall: true, nearTrunk: 0.2, shape: { reach: 0.2, size: 0.6 }, treeSpacing: 3.6, pathClear: P.treeClear - 0.6, scale: [0.85, 1.25] });
  scatterKind('bush', 'bushes-inner', scaled(U.bushesInner, q.plants), edgeR + 9, edgeR + 28, { spacing: 1.0, nearTrunk: 0.5, soft: 0.8, scale: [0.9, 1.4] });
  scatterKind('treeFern', 'tree-ferns', scaled(U.treeFerns, q.plants), edgeR - 1, edgeR + 9, { tall: true, nearTrunk: 0.4, spacing: 1.2, pathClear: 1.8, scale: [0.85, 1.2] });
  scatterKind('cycad', 'cycads', scaled(U.cycads, q.plants), edgeR - 2.5, edgeR + 6, { spacing: 1.1, pathClear: P.plantClear, nearTrunk: 0.2 });
  scatterKind('bush', 'bushes', scaled(U.bushes, q.plants), edgeR - 1.5, edgeR + 10, { spacing: 1.0, nearTrunk: 0.45, soft: 0.8, blocksGrass: true, grassRadius: 0.7, face: true });

  // ---- 6. ferns: thick at the edge, along the forest path, sparse inside ----------------------
  scatterKind('fern', 'ferns-edge', scaled(Math.round(U.ferns * 0.55) * glade.ferns, q.plants), edgeR - 2.5, edgeR + 6, { spacing: 0.75, soft: 0.6, nearTrunk: 0.35, scale: [0.8 * growth, 1.3 * growth], pathClear: P.plantClear, blocksGrass: lush });
  scatterKind('fern', 'ferns-inner', scaled(Math.round(U.ferns * 0.3), q.plants), edgeR + 6, edgeR + 22, { spacing: 0.8, soft: 0.6, nearTrunk: 0.5, scale: [0.9, 1.4] });
  {
    // ferns lining the forest path
    const rng = createRng(seed, 'ferns-path');
    const count = scaled(Math.round(U.ferns * 0.25), q.plants);
    let placed = 0;
    for (let i = 0; i < count * 20 && placed < count; i++) {
      const s = rng.next() * terrain.path.total;
      const [px, pz, dx, dz] = terrain.path.pointAt(s);
      if (radiusOf(px, pz) < edgeR - 1) continue;
      const side = rng.sign();
      const off = rng.range(1.9, 3.8);
      const x = px - dz * side * off, z = pz + dx * side * off;
      const p = tryPlace('fern', x, z, {
        variant: rng.int(0, T.variants.fern - 1), lod: radiusOf(x, z) < edgeR + 10 ? 0 : 1, rot: rng.angle(), scale: rng.range(0.8, 1.25),
        pathClear: P.plantClear, spacing: 0.8, soft: 0.6, phase: rng.next(),
      });
      if (p) placed++;
    }
  }

  // ---- 7. horsetails by the path and the rim ---------------------------------------------------
  {
    const rng = createRng(seed, 'horsetails');
    const count = scaled(U.horsetails, q.plants);
    let placed = 0;
    for (let i = 0; i < count * 30 && placed < count; i++) {
      const s = rng.next() * terrain.path.total;
      const [px, pz, dx, dz] = terrain.path.pointAt(s);
      const side = rng.sign();
      const off = rng.range(1.2, 2.6);
      const x = px - dz * side * off, z = pz + dx * side * off;
      const rr = radiusOf(x, z);
      if (rr < edgeR - 4 || rr > edgeR + 16) continue;
      const p = tryPlace('horsetail', x, z, { variant: rng.int(0, T.variants.horsetail - 1), lod: rr < edgeR + 8 ? 0 : 1, rot: rng.angle(), scale: rng.range(0.85, 1.2), pathClear: P.plantClear, spacing: 0.9, phase: rng.next() });
      if (p) placed++;
    }
  }

  // ---- 8. mushrooms at tree feet and on the log ----------------------------------------------
  {
    const rng = createRng(seed, 'mushrooms');
    const count = scaled(U.mushrooms, q.plants);
    let placed = 0;
    const hosts = placements.filter(p => (p.name === 'broadleaf' && p.band === 'edge') || p.name === 'log');
    for (let i = 0; i < count * 30 && placed < count && hosts.length; i++) {
      const h = rng.pick(hosts);
      let x, z;
      if (h.name === 'log') {
        const t = rng.range(-0.9, 0.9);
        const side = rng.sign();
        x = h.x + h.logAxis[0] * h.halfLength * t - h.logAxis[1] * side * rng.range(0.55, 0.85);
        z = h.z + h.logAxis[1] * h.halfLength * t + h.logAxis[0] * side * rng.range(0.55, 0.85);
      } else {
        const a = rng.angle(), d = h.model.trunk.flare * h.scale * rng.range(0.9, 1.4);
        x = h.x + Math.cos(a) * d; z = h.z + Math.sin(a) * d;
      }
      const p = tryPlace('mushrooms', x, z, { variant: rng.int(0, T.variants.mushrooms - 1), lod: 0, rot: rng.angle(), scale: rng.range(0.9, 1.4), pathClear: P.plantClear, spacing: 0.5, soft: 0.2, phase: rng.next() });
      if (p) placed++;
    }
  }

  // ---- 9. flowers in the clearing, and a few rim ferns ---------------------------------------
  {
    const rng = createRng(seed, 'flowers');
    const count = scaled(FOREST.clearing.flowers, q.plants);
    let placed = 0;
    for (let i = 0; i < count * 30 && placed < count; i++) {
      const a = rng.angle();
      const rr = Math.sqrt(rng.range(2.5 * 2.5, (edgeR - 1.2) ** 2));
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (terrain.soilMask(x, z) > 0.4) continue;
      const p = tryPlace('flowers', x, z, { variant: rng.int(0, T.variants.flowers - 1), lod: 0, rot: rng.angle(), scale: rng.range(0.9, 1.2), pathClear: P.plantClear, spacing: 2.2, actorClear: 2.6, phase: rng.next() });
      if (p) placed++;
    }
    const ferns = scaled(FOREST.clearing.ferns * glade.ferns, q.plants); // a glade grows more
    placed = 0;
    for (let i = 0; i < ferns * 30 && placed < ferns; i++) {
      const a = rng.angle();
      const rr = rng.range(clearR - 0.5, edgeR - 1.5);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const p = tryPlace('fern', x, z, { variant: rng.int(0, T.variants.fern - 1), lod: 0, rot: rng.angle(), scale: rng.range(0.7, 1.0) * growth, pathClear: P.plantClear, spacing: 0.9, soft: 0.6, phase: rng.next(), blocksGrass: lush });
      if (p) placed++;
    }
  }

  // ---- 10. accents where the camera looks: flowers in the lower third of each authored shot -----
  {
    const rng = createRng(seed, 'accents');
    const ray = new THREE.Vector3(), origin = new THREE.Vector3(), inv = new THREE.Matrix4();
    const groundHit = (shot, nx, ny) => {
      inv.copy(shot.view).invert();
      origin.setFromMatrixPosition(inv);
      ray.set(nx * shot.tanH, ny * shot.tanV, -1).transformDirection(inv);
      if (ray.y > -0.03) return null;
      const t = (terrain.heightAt(origin.x, origin.z) - origin.y) / ray.y;
      return [origin.x + ray.x * t, origin.z + ray.z * t, t];
    };
    const spots = [[-0.78, -0.62], [0.72, -0.7], [-0.4, -0.85], [0.42, -0.58], [0.05, -0.9], [-0.9, -0.85], [0.9, -0.9], [-0.6, -0.45], [0.6, -0.45], [-0.2, -0.65], [0.25, -0.8], [-0.95, -0.5]];
    for (const shot of shots) {
      if (shot.kind === 'track') continue;
      let placedHere = 0;
      for (const [nx, ny] of spots) {
        if (placedHere >= 3) break;
        const hit = groundHit(shot, nx + rng.range(-0.06, 0.06), ny + rng.range(-0.05, 0.05));
        if (!hit || hit[2] < 2.2 || hit[2] > 11) { stats.accents.far++; continue; }
        const r = radiusOf(hit[0], hit[1]);
        if (r > edgeR + 4 || terrain.soilMask(hit[0], hit[1]) > 0.5) { stats.accents.ground++; continue; }
        const p = tryPlace('flowers', hit[0], hit[1], { variant: rng.int(0, T.variants.flowers - 1), lod: 0, rot: rng.angle(), scale: rng.range(1.0, 1.3), pathClear: P.plantClear, spacing: 1.2, actorClear: 2.1, phase: rng.next() });
        if (p) { placedHere++; stats.accents.placed++; } else stats.accents.rejected++;
      }
    }
  }
  /** Grass stays out of rocks, the log, trunks and bush centres. */
  function blocked(x, z) {
    for (const o of occupied.near(x, z, 3)) {
      if (!o.blocksGrass) continue;
      if (Math.hypot(o.x - x, o.z - z) < o.grassRadius) return true;
    }
    return false;
  }

  const counts = {};
  for (const p of placements) counts[p.name] = (counts[p.name] || 0) + 1;
  stats.counts = counts;
  return { placements, blocked, stats, skyAt, bandOf, sectorOf, sun, shots };
}
