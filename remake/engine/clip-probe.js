// The clip probe: are any butterflies inside an animal's body, or nearer it than their wings reach? (Fiðrildadansinn, round 5:
// tools/clip-probe.mjs plays the whole show in fixed steps and asks this every step.) It reads the posed body meshes themselves, not
// the shells (engine/shell.js) the flights keep out of, so it checks the shells too.
//
// Each animal's `_body` skinned mesh is baked as it is posed now (getVertexPosition, the skeleton updated first: a probe steps the
// scene without drawing it). A point is inside when two rays from it, to the camera and nearly straight up, both cross the surface an
// odd number of times; its clearance is the distance to the nearest posed vertex less its wing's reach. The mesh's index changes with
// the character LOD: the probe reads the full one's (character-lod.js fullGeometry), whatever level is drawn.
import { fullGeometry } from './character-lod.js';

/** The body mesh of an actor: its skinned mesh named `..._body`, or its largest skinned mesh. */
export function bodyMesh(actor) {
  let named = null;
  let largest = null;
  actor.model.traverse(o => {
    if (!o.isSkinnedMesh) return;
    if (/_body$/.test(o.name)) named ??= o;
    if (!largest || o.geometry.attributes.position.count > largest.geometry.attributes.position.count) largest = o;
  });
  return named ?? largest;
}

export function createClipProbe(world, names) {
  const { THREE } = world;
  const V = new THREE.Vector3();
  const bodies = names.map(name => {
    const actor = world.actors.get(name);
    const mesh = bodyMesh(actor);
    return { name, actor, mesh, baked: new Float32Array(mesh.geometry.attributes.position.count * 3), count: 0, index: null, min: [0, 0, 0], max: [0, 0, 0] };
  });

  function bake(b) {
    b.actor.model.updateMatrixWorld(true);
    b.mesh.skeleton?.update();
    const geo = fullGeometry(b.mesh);
    b.count = geo.attributes.position.count;
    b.index = geo.index.array;
    if (b.baked.length < b.count * 3) b.baked = new Float32Array(b.count * 3);
    const m = b.mesh.matrixWorld;
    const out = b.baked;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let i = 0; i < b.count; i++) {
      b.mesh.getVertexPosition(i, V);
      V.applyMatrix4(m);
      out[3 * i] = V.x; out[3 * i + 1] = V.y; out[3 * i + 2] = V.z;
      if (V.x < x0) x0 = V.x; if (V.x > x1) x1 = V.x;
      if (V.y < y0) y0 = V.y; if (V.y > y1) y1 = V.y;
      if (V.z < z0) z0 = V.z; if (V.z > z1) z1 = V.z;
    }
    b.min = [x0, y0, z0];
    b.max = [x1, y1, z1];
  }

  // Möller–Trumbore, both faces, hits in (0, L)
  function crossings(b, ox, oy, oz, dx, dy, dz, L) {
    const p = b.baked, ix = b.index;
    let n = 0;
    for (let k = 0; k < ix.length; k += 3) {
      const a = 3 * ix[k], bb = 3 * ix[k + 1], c = 3 * ix[k + 2];
      const ax = p[a], ay = p[a + 1], az = p[a + 2];
      const e1x = p[bb] - ax, e1y = p[bb + 1] - ay, e1z = p[bb + 2] - az;
      const e2x = p[c] - ax, e2y = p[c + 1] - ay, e2z = p[c + 2] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det;
      const tx = ox - ax, ty = oy - ay, tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-6 && t < L) n++;
    }
    return n;
  }
  function nearest(b, x, y, z) {
    let best = Infinity;
    const p = b.baked, n = b.count * 3;
    for (let i = 0; i < n; i += 3) {
      const dx = p[i] - x, dy = p[i + 1] - y, dz = p[i + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /**
   * One look: `points` are [{ name, p: [x, y, z], wing, contact }]. Returns [{ name, body, inside, distance }] for each point within
   * `reach` metres of a body's box (the others are clear of it).
   */
  function look(points, { reach = 0.6 } = {}) {
    for (const b of bodies) bake(b);
    const cam = world.camera.position;
    const found = [];
    for (const point of points) {
      const [x, y, z] = point.p;
      for (const b of bodies) {
        if (x < b.min[0] - reach || x > b.max[0] + reach || y < b.min[1] - reach || y > b.max[1] + reach || z < b.min[2] - reach || z > b.max[2] + reach) continue;
        const distance = nearest(b, x, y, z);
        let inside = false;
        if (x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1] && z > b.min[2] && z < b.max[2]) {
          let dx = cam.x - x, dy = cam.y - y, dz = cam.z - z;
          const L = Math.hypot(dx, dy, dz);
          dx /= L; dy /= L; dz /= L;
          inside = crossings(b, x, y, z, dx, dy, dz, L) % 2 === 1 && crossings(b, x, y, z, 0.13, 0.983, 0.129, 1e6) % 2 === 1;
        }
        found.push({ name: point.name, body: b.name, inside, distance, clearance: distance - (point.wing ?? 0), contact: Boolean(point.contact) });
      }
    }
    return found;
  }

  return { look, bodies };
}

/**
 * The table of a whole run from the looks of each step: [{ t, found }] (found as look() gives it) and the step's length. Seconds with
 * a centre inside a body (the steps with any, times the step), how many butterflies pass through each animal, the worst moment, and
 * the smallest clearance of a wing while it is not in a meant contact (landing on the horn, sitting on her head).
 */
export function clipTable(steps, step, { clearance = 0.02 } = {}) {
  let insideSteps = 0;
  const through = {};
  const spans = {};
  let worst = { t: null, count: 0 };
  let tightest = { clearance: Infinity, t: null, name: null, body: null };
  const close = [];
  for (const { t, found } of steps) {
    const inside = found.filter(f => f.inside);
    if (inside.length) insideSteps++;
    if (inside.length > worst.count) worst = { t, count: inside.length };
    for (const f of inside) {
      (through[f.body] ??= new Set()).add(f.name);
      const key = `${f.name} in ${f.body}`;
      const span = (spans[key] ??= []);
      const last = span[span.length - 1];
      if (last && t - last[1] <= step * 1.5) last[1] = t; else span.push([t, t]);
    }
    for (const f of found) {
      if (f.contact) continue;
      if (f.clearance < tightest.clearance) tightest = { clearance: f.clearance, t, name: f.name, body: f.body };
      if (f.clearance < clearance && !f.inside) close.push({ t, name: f.name, body: f.body, clearance: f.clearance });
    }
  }
  return {
    secondsInside: +(insideSteps * step).toFixed(2),
    through: Object.fromEntries(Object.entries(through).map(([k, s]) => [k, s.size])),
    worst,
    tightest: { ...tightest, clearance: +tightest.clearance.toFixed(3) },
    closeSteps: close.length,
    spans: Object.fromEntries(Object.entries(spans).map(([k, list]) => [k, list.map(([a, b]) => `${a.toFixed(2)}-${b.toFixed(2)}`)])),
  };
}
