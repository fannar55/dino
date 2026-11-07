import * as THREE from 'three';

// A character's skin as a surface to measure against: the closest point on it to any point, which side of it a point is on, and the
// bone weights there. Built on the triangles of the skinned mesh (the body: the one with the most vertices) that lie within `near` of
// `around` in the bind pose, so a saddle can be fitted to her back and tested against it without the rest of her.
//
//   const skin = skinSurface(mesh, { around, near: 1.2 })   // bind-pose positions, in the mesh's own (bind) frame
//   skin.closest(point)        // { point, normal, distance (positive outside her), face, weights: Map(bone index -> weight) }
//   skin.pose()                // re-skins the region in the pose her bones are in now, in the world (a test's frames)
//
// The skin is one closed, consistently wound shell (the bake tools weld it so), so the closest triangle's normal tells the side; near an
// edge the side is taken from the normals of all the triangles that share the closest point, weighted by their angles there.

const tri = new THREE.Triangle();
const v = new THREE.Vector3();

export function skinSurface(mesh, { around = null, near = Infinity, cell = 0.05 } = {}) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const { skinIndex, skinWeight } = geometry.attributes;
  const index = geometry.index;
  const count = position.count;
  const bind = new Float32Array(count * 3); // bind-pose positions in the mesh's frame (bindMatrix applied)
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix);
    bind[3 * i] = v.x; bind[3 * i + 1] = v.y; bind[3 * i + 2] = v.z;
  }
  // the triangles near `around`, and the vertices they use
  const faces = [];
  const used = new Set();
  const faceCount = index ? index.count / 3 : count / 3;
  const corner = (f, k) => (index ? index.getX(3 * f + k) : 3 * f + k);
  for (let f = 0; f < faceCount; f++) {
    const a = corner(f, 0), b = corner(f, 1), c = corner(f, 2);
    if (around) {
      let close = false;
      for (const i of [a, b, c]) {
        const d = Math.hypot(bind[3 * i] - around.x, bind[3 * i + 1] - around.y, bind[3 * i + 2] - around.z);
        if (d < near) { close = true; break; }
      }
      if (!close) continue;
    }
    faces.push(a, b, c);
    used.add(a); used.add(b); used.add(c);
  }
  const vertices = [...used];
  const around3 = new Map(); // vertex -> the region's triangles (offsets into faces) that use it
  for (let f = 0; f < faces.length; f += 3) for (let k = 0; k < 3; k++) {
    const i = faces[f + k];
    if (!around3.has(i)) around3.set(i, []);
    around3.get(i).push(f);
  }
  const stamp = new Int32Array(faces.length / 3);
  let query = 0;
  const now = new Float32Array(count * 3); // where the region's vertices are: bind pose until pose()
  for (const i of vertices) { now[3 * i] = bind[3 * i]; now[3 * i + 1] = bind[3 * i + 1]; now[3 * i + 2] = bind[3 * i + 2]; }

  // a grid of the triangles by their bounds
  let grid = new Map();
  const key = (x, y, z) => ((x + 2048) * 4096 + (y + 2048)) * 4096 + (z + 2048); // cells within ±2048 of the origin
  function build() {
    grid = new Map();
    for (let f = 0; f < faces.length; f += 3) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        const i = faces[f + k];
        x0 = Math.min(x0, now[3 * i]); x1 = Math.max(x1, now[3 * i]);
        y0 = Math.min(y0, now[3 * i + 1]); y1 = Math.max(y1, now[3 * i + 1]);
        z0 = Math.min(z0, now[3 * i + 2]); z1 = Math.max(z1, now[3 * i + 2]);
      }
      for (let x = Math.floor(x0 / cell); x <= Math.floor(x1 / cell); x++) {
        for (let y = Math.floor(y0 / cell); y <= Math.floor(y1 / cell); y++) {
          for (let z = Math.floor(z0 / cell); z <= Math.floor(z1 / cell); z++) {
            const k = key(x, y, z);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(f);
          }
        }
      }
    }
  }
  build();

  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const at = (i, out) => out.set(now[3 * i], now[3 * i + 1], now[3 * i + 2]);
  const best = new THREE.Vector3();
  const cand = new THREE.Vector3();
  const bary = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();

  /** The closest point of the region's skin to `p`, searching outward cell by cell up to `reach` (in the mesh's units). */
  function closest(p, { reach = 2 } = {}) {
    let bestD = Infinity;
    let bestF = -1;
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
    query++;
    for (let r = 0; r * cell <= reach + cell; r++) {
      if (bestF >= 0 && (r - 1) * cell > bestD) break;
      for (let x = cx - r; x <= cx + r; x++) {
        for (let y = cy - r; y <= cy + r; y++) {
          for (let z = cz - r; z <= cz + r; z++) {
            if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== r) continue; // the shell of the cube only
            const list = grid.get(key(x, y, z));
            if (!list) continue;
            for (const f of list) {
              if (stamp[f / 3] === query) continue;
              stamp[f / 3] = query;
              tri.set(at(faces[f], A), at(faces[f + 1], B), at(faces[f + 2], C));
              tri.closestPointToPoint(p, cand);
              const d = cand.distanceTo(p);
              if (d < bestD) { bestD = d; bestF = f; best.copy(cand); }
            }
          }
        }
      }
    }
    if (bestF < 0) return null;
    // the side: the normals of the triangles round the closest point, by their angles at it (one triangle's own when it is inside it)
    const normal = new THREE.Vector3();
    const round = new Set([bestF, ...[0, 1, 2].flatMap(k => around3.get(faces[bestF + k]))]);
    for (const f of round) {
      tri.set(at(faces[f], A), at(faces[f + 1], B), at(faces[f + 2], C));
      tri.closestPointToPoint(best, cand);
      if (cand.distanceToSquared(best) > 1e-10) continue;
      tri.getNormal(faceNormal);
      tri.getBarycoord(best, bary);
      // the angle of the triangle at the point: a corner's own angle, half a turn along an edge, a full one inside
      const zeros = [bary.x, bary.y, bary.z].filter(w => w < 1e-6).length;
      let angle = 2 * Math.PI;
      if (zeros === 1) angle = Math.PI;
      else if (zeros === 2) {
        const k = [bary.x, bary.y, bary.z].findIndex(w => w > 1 - 1e-6);
        const P = [A, B, C][k], Q = [A, B, C][(k + 1) % 3], R = [A, B, C][(k + 2) % 3];
        angle = cand.subVectors(Q, P).angleTo(v.subVectors(R, P));
      }
      normal.addScaledVector(faceNormal, angle);
    }
    normal.normalize();
    tri.set(at(faces[bestF], A), at(faces[bestF + 1], B), at(faces[bestF + 2], C));
    tri.getBarycoord(best, bary);
    const side = Math.sign(v.subVectors(p, best).dot(normal)) || 1;
    const weights = new Map();
    [bary.x, bary.y, bary.z].forEach((share, k) => {
      const i = faces[bestF + k];
      for (let j = 0; j < 4; j++) {
        const w = skinWeight.getComponent(i, j) * share;
        if (w <= 0) continue;
        const bone = skinIndex.getComponent(i, j);
        weights.set(bone, (weights.get(bone) ?? 0) + w);
      }
    });
    return { point: best.clone(), normal, distance: side * bestD, face: bestF / 3, weights };
  }

  return {
    mesh,
    /** The region's vertex count and triangle count. */
    get size() { return { vertices: vertices.length, triangles: faces.length / 3 }; },
    closest,
    /** Re-skin the region in the pose her bones are in now, in world space (mesh.matrixWorld and the skeleton must be current). */
    pose() {
      mesh.skeleton.update();
      for (const i of vertices) {
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
        now[3 * i] = v.x; now[3 * i + 1] = v.y; now[3 * i + 2] = v.z;
      }
      build();
    },
    /** Back to the bind pose, in the mesh's frame. */
    unpose() {
      for (const i of vertices) { now[3 * i] = bind[3 * i]; now[3 * i + 1] = bind[3 * i + 1]; now[3 * i + 2] = bind[3 * i + 2]; }
      build();
    },
  };
}
