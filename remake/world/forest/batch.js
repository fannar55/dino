// The batcher bakes placed models into merged static meshes, one per (band, sector, material).
// Merging keeps draw calls low. Wind phase and canopy shade are written per vertex here, because
// they depend on where the plant stands.
//
// Each merged mesh remembers where every plant (and every detail level of it) sits in its index
// buffer. When the camera moves, cullBatches() rebuilds the index buffer from the plants in view, at
// the detail level their distance calls for, so a mesh only submits what can be seen, in one draw
// call. Shadows come from separate caster meshes built from each plant's coarsest shape and culled
// by whether its shadow can land in the shadow focus (cullCasters). The main meshes cast nothing,
// so the shadow pass never draws plants the camera cannot see and the main pass never draws plants
// that are only there for their shadow.
import * as THREE from 'three';
import { FOREST } from './config.js';

const SWAY = FOREST.wind.swayScale;
// Small things vanish into the grass and mist long before this distance (metres to the camera).
const CULL_DISTANCE = { flowers: 20, mushrooms: 18, horsetail: 30, fern: 40, rockSmall: 36 };
const LOD_SWITCH = FOREST.lod.switch;
// small understory plants drop to their far shape sooner than the trees
const UNDERSTORY = new Set(['bush', 'fern', 'cycad', 'treeFern', 'horsetail']);
const LOD_SWITCH_SMALL = FOREST.lod.switchSmall || LOD_SWITCH;
// Trees whose crown is its own cull piece pick the crown's level by its projected size, not by
// the distance to the tree's mid-height: a big crown right overhead counts as near.
const CROWN_LOD = new Set(['broadleaf', 'araucaria']);
const [CROWN_T0, CROWN_T1] = FOREST.lod.crownSize;
const CROWN_FINE = FOREST.lod.crownFine ?? 4;

/** One record per tree: crown centre and half-extent, and the level chosen for this view. */
function crownLod(placement, first) {
  const cr = placement.model.crown;
  if (!cr || !CROWN_LOD.has(placement.name)) return null;
  const c = Math.cos(placement.rot), s = Math.sin(placement.rot), sc = placement.scale;
  const centre = new THREE.Vector3(
    placement.x + (cr.c[0] * c - cr.c[2] * s) * sc,
    placement.y + cr.c[1] * sc,
    placement.z + (cr.c[0] * s + cr.c[2] * c) * sc,
  );
  return { centre, size: Math.max(cr.r, cr.ry) * sc, first, level: 2, frame: -1, proj: 0 };
}

function createBuckets() {
  const buckets = new Map();
  return {
    buckets,
    push(key, info, item, builder) {
      if (!buckets.has(key)) buckets.set(key, { key, ...info, items: [], verts: 0, indices: 0 });
      const b = buckets.get(key);
      b.items.push(item);
      b.verts += builder.count;
      b.indices += builder.idx.length;
    },
  };
}

export function createBatcher() {
  const main = createBuckets();
  const casters = createBuckets();

  function add(placement) {
    const { band, sector } = placement;
    const levels = placement.models || [{ level: placement.lod, model: placement.model }];
    const h = (placement.model.height || 1) * placement.scale;
    const ref = new THREE.Vector3(placement.x, placement.y + h * 0.5, placement.z);
    const sw = UNDERSTORY.has(placement.name) ? LOD_SWITCH_SMALL : LOD_SWITCH;
    const crown = crownLod(placement, levels[0].level);
    levels.forEach(({ level, model }, i) => {
      // distance band of this level: [switch before it, switch after it)
      const minD = i === 0 ? 0 : sw[Math.min(level, sw.length) - 1];
      const maxD = i === levels.length - 1 ? Infinity : sw[Math.min(level, sw.length - 1)];
      for (const kind of ['solid', 'thin']) {
        const builder = model[kind];
        if (!builder || !builder.count) continue;
        // thin parts (fronds, petals) are small: they share wider sectors, which saves draw calls
        const s = kind === 'thin' ? Math.floor(sector / 2) * 2 : sector;
        main.push(`${band}:${s}:${kind}`, { band, sector: s, kind }, { builder, placement, minD, maxD, ref, level, crown }, builder);
      }
    });
  }

  /** A shadow caster from the plant's coarsest shape (shrunk a little, see buildGeometry). */
  function addCaster(placement) {
    const { band, sector } = placement;
    const levels = placement.models || [{ level: placement.lod, model: placement.model }];
    const { model } = levels[levels.length - 1];
    const group = Math.floor(sector / 4);
    for (const kind of ['solid', 'thin']) {
      const builder = model[kind];
      if (!builder || !builder.count) continue;
      casters.push(`${band}:${group}:${kind}`, { band, sector: group, kind }, { builder, placement, minD: 0, maxD: Infinity, ref: null }, builder);
    }
  }

  function buildGeometry(bucket, { caster = false } = {}) {
    const n = bucket.verts;
    const pos = new Float32Array(n * 3);
    const nrm = caster ? null : new Float32Array(n * 3);
    const col = caster ? null : new Uint8Array(n * 4);
    const wind = new Uint8Array(n * 4);
    const IndexArray = n > 65535 ? Uint32Array : Uint16Array;
    const master = new IndexArray(bucket.indices);
    const ranges = [];
    let v = 0, k = 0;
    const box = new THREE.Box3();
    const tmp = new THREE.Vector3();
    for (const { builder: m, placement: p, minD, maxD, ref, level, crown } of bucket.items) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot), sc = p.scale;
      const phase = Math.round((p.phase % 1) * 255);
      const sky = p.sky;
      const base = v;
      box.makeEmpty();
      for (let i = 0; i < m.count; i++, v++) {
        let lx = m.pos[i * 3], ly = m.pos[i * 3 + 1], lz = m.pos[i * 3 + 2];
        const nx = m.nrm[i * 3], ny = m.nrm[i * 3 + 1], nz = m.nrm[i * 3 + 2];
        if (caster) {
          // casters are the coarse shape pulled inside the fine one, so a crown never shadows
          // its own lit surface where the coarse and fine outlines differ
          const pull = bucket.kind !== 'solid' ? 0 : m.wind[i * 3 + 2] > 0.5 ? 0.32 : 0.03;
          lx -= nx * pull; ly -= ny * pull; lz -= nz * pull;
        }
        const x = p.x + (lx * c - lz * s) * sc, y = p.y + ly * sc, z = p.z + (lx * s + lz * c) * sc;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        box.expandByPoint(tmp.set(x, y, z));
        if (!caster) {
          nrm[v * 3] = nx * c - nz * s;
          nrm[v * 3 + 1] = ny;
          nrm[v * 3 + 2] = nx * s + nz * c;
          col[v * 4] = Math.round(Math.min(1, m.col[i * 3]) * 255);
          col[v * 4 + 1] = Math.round(Math.min(1, m.col[i * 3 + 1]) * 255);
          col[v * 4 + 2] = Math.round(Math.min(1, m.col[i * 3 + 2]) * 255);
          const exposure = m.exp[i];
          col[v * 4 + 3] = Math.round(Math.min(1, Math.max(0, sky + (1 - sky) * exposure)) * 255);
        }
        wind[v * 4] = phase;
        wind[v * 4 + 1] = Math.round(Math.min(1, (m.wind[i * 3] * sc) / SWAY) * 255);
        wind[v * 4 + 2] = Math.round(Math.min(1, m.wind[i * 3 + 1]) * 255);
        wind[v * 4 + 3] = Math.round(Math.min(1, m.wind[i * 3 + 2]) * 255);
      }
      // one range per cull piece (trunk, crown); each gets the bounding sphere of its own triangles
      const cuts = [0, ...(m.marks || []), m.idx.length];
      for (let c2 = 0; c2 < cuts.length - 1; c2++) {
        if (cuts[c2 + 1] <= cuts[c2]) continue;
        const start = k;
        const pbox = new THREE.Box3();
        for (let j = cuts[c2]; j < cuts[c2 + 1]; j++) {
          const vi = base + m.idx[j];
          master[k++] = vi;
          pbox.expandByPoint(tmp.set(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]));
        }
        const sphere = pbox.getBoundingSphere(new THREE.Sphere());
        sphere.radius += 0.8; // sway
        // pieces after the first mark are the crown: cullBatches picks their level per view
        ranges.push({
          start, count: k - start, sphere, cull: CULL_DISTANCE[p.name] ?? Infinity, minD, maxD, ref: ref || sphere.center,
          name: p.name, lod: level ?? p.lod, crown: c2 > 0 && crown ? crown : null,
        });
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (!caster) {
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
    }
    g.setAttribute('aWind', new THREE.BufferAttribute(wind, 4, true));
    const dynamic = new THREE.BufferAttribute(new IndexArray(master.length), 1);
    dynamic.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(dynamic);
    g.setDrawRange(0, 0);
    g.computeBoundingBox();
    g.boundingBox.expandByScalar(0.8); // room for sway
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    return { g, master, ranges };
  }

  function makeMeshes(store, setup, { order, caster = false } = {}) {
    const meshes = [];
    for (const bucket of [...store.buckets.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      // draw near-to-far inside each merged mesh, so early depth testing rejects hidden foliage
      if (order) bucket.items.sort((a, b) => order(a.placement) - order(b.placement));
      const { g, master, ranges } = buildGeometry(bucket, { caster });
      const o = setup(bucket);
      const mesh = new THREE.Mesh(g, o.material);
      mesh.name = `${caster ? 'Forest caster' : 'Forest'} ${bucket.key}`;
      mesh.castShadow = caster;
      mesh.receiveShadow = !caster && o.receiveShadow;
      mesh.renderOrder = o.renderOrder ?? 2;
      if (o.depthMaterial) mesh.customDepthMaterial = o.depthMaterial;
      mesh.visible = false; // until the first cull
      mesh.userData = {
        band: bucket.band, sector: bucket.sector, kind: bucket.kind, triangles: bucket.indices / 3, caster,
        cull: { master, ranges, signature: -1, submitted: 0 }, hidden: false,
      };
      meshes.push(mesh);
    }
    return meshes;
  }

  /**
   * Build the main meshes and the caster meshes. `setup(bucket)` returns { material,
   * depthMaterial, receiveShadow, renderOrder }; `casterSetup(bucket)` the same for casters.
   */
  function build(setup, { order, casterSetup } = {}) {
    const meshes = makeMeshes(main, setup, { order });
    const casterMeshes = casterSetup ? makeMeshes(casters, casterSetup, { caster: true }) : [];
    return { meshes, casterMeshes };
  }
  return { add, addCaster, build };
}

function rebuildIndex(mesh, keep, signature) {
  const data = mesh.userData.cull;
  if (signature === data.signature) return data.submitted;
  const index = mesh.geometry.index;
  let offset = 0;
  for (const r of keep) {
    index.array.set(data.master.subarray(r.start, r.start + r.count), offset);
    offset += r.count;
  }
  mesh.geometry.setDrawRange(0, offset);
  if (offset > 0) {
    index.clearUpdateRanges();
    index.addUpdateRange(0, offset);
    index.needsUpdate = true;
  }
  data.signature = signature;
  data.submitted = offset / 3;
  return data.submitted;
}

const _frustum = new THREE.Frustum();
const _m4 = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _cam = new THREE.Vector3();
const _rel = new THREE.Vector3();

let _view = 0;
const _crowns = [];

/**
 * Main pass: a plant is drawn when its sphere is in the camera frustum (with a margin, so small
 * moves need no rebuild), at the level of detail its distance calls for. Crowns are ranked by
 * projected size first: the few largest in view get the fine level (a capped number, so the cost
 * stays bounded), the rest the middle or far level. An empty mesh is hidden, so it costs no draw
 * call. Returns the number of triangles now submitted.
 */
export function cullBatches(meshes, camera, margin = 1.5) {
  _m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_m4);
  _cam.setFromMatrixPosition(camera.matrixWorld);
  // crowns in view, largest on screen first
  _view++;
  _crowns.length = 0;
  for (const mesh of meshes) {
    for (const r of mesh.userData.cull.ranges) {
      const c = r.crown;
      if (!c || c.frame === _view) continue;
      c.frame = _view;
      c.proj = c.size / Math.max(0.5, _cam.distanceTo(c.centre));
      c.level = 2;
      _sphere.set(c.centre, c.size + margin);
      if (_frustum.intersectsSphere(_sphere)) _crowns.push(c);
    }
  }
  _crowns.sort((a, b) => b.proj - a.proj);
  _crowns.forEach((c, i) => {
    const want = i < CROWN_FINE && c.proj > CROWN_T0 ? 0 : c.proj > CROWN_T1 ? 1 : 2;
    c.level = Math.max(want, c.first);
  });
  let total = 0;
  for (const mesh of meshes) {
    const data = mesh.userData.cull;
    let signature = 7;
    const keep = [];
    data.ranges.forEach((r, i) => {
      if (r.crown) {
        if (r.lod !== r.crown.level) return;
      } else {
        const d = _cam.distanceTo(r.ref);
        if (d < r.minD || d >= r.maxD) return;
      }
      if (_cam.distanceTo(r.sphere.center) - r.sphere.radius > r.cull) return;
      _sphere.copy(r.sphere);
      _sphere.radius += margin;
      if (!_frustum.intersectsSphere(_sphere)) return;
      keep.push(r);
      signature = (Math.imul(signature, 31) + i + 1) | 0;
    });
    const n = rebuildIndex(mesh, keep, signature);
    mesh.userData.cull.kept = keep;
    mesh.visible = n > 0 && !mesh.userData.hidden;
    total += n;
  }
  return total;
}

/**
 * Shadow casters: a plant is kept when its shadow can land in the focus sphere, that is when it
 * stands within the focus radius of the sun ray through the focus centre, up-sun of the focus (or
 * inside it). Returns the triangles kept. The caller shows the casters only for the shadow pass.
 */
export function cullCasters(meshes, centre, radius, sunDir) {
  let total = 0;
  for (const mesh of meshes) {
    const data = mesh.userData.cull;
    let signature = 11;
    const keep = [];
    data.ranges.forEach((r, i) => {
      _rel.copy(r.sphere.center).sub(centre);
      const t = _rel.dot(sunDir);
      const reach = radius + r.sphere.radius;
      if (t < -reach || t > radius * 4 + r.sphere.radius) return;
      const lateral2 = _rel.lengthSq() - t * t;
      if (lateral2 > reach * reach) return;
      keep.push(r);
      signature = (Math.imul(signature, 31) + i + 1) | 0;
    });
    total += rebuildIndex(mesh, keep, signature);
  }
  return total;
}
