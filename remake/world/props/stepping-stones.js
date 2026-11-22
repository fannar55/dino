import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { sparkleBurst } from './sparkles.js';

// The stepping stones of chapter 6's ford (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md, sections 4 and 5:
// "Áin við fossinn"): five steps across the river above the falls, each with two or three stones, one of them right and the others
// wrong. A right stone must read at a glance as big, flat and dry, a wrong one as small, wet and wobbly, to a six-year-old on a tablet:
//   right  the valley's own `rock` (world/forest/species.js), laid broad and low with its top pressed flat, pale and dry, a little moss
//   wrong  the valley's own `rockSmall`, round, dark and wet, darkest at the water line, with a wet shine; it wobbles when tapped
// Each stands on the river bed under it (heightAt), so none floats however deep the water is. With no species library, or `grey`, they
// are chunk 1's grey discs.
//
//   const stones = createSteppingStones(world, { steps: STEPS, level, library, sizes: STONE });   // kafli6-route.js
//   for (const t of stones.targets) ...      // { name: the stone's id, point (Vector3 over its top), radius: its tap circle }
//   stones.topOf(id)                         // Vector3: its top at its middle, where Mosi's front feet go
//   stones.frogSpot(id)                      // [x, y, z] on a wrong stone, off its middle away from the step's right one (null: a right one)
//   stones.away(id)                          // [x, z]: the way from the step's right stone to this one (the frog hops that way)
//   stones.surfaceAt(id, x, z)               // its surface's height over (x, z), -Infinity off it (what a frog stands on)
//   stones.matrixOf(id)                      // how it lies now (Matrix4): its rest, or a wobble
//   stones.wobble(id)                        // a wrong stone rocks for WOBBLE.seconds and comes to rest as it lay; returns a Handle
//   stones.glitter(id)                       // glints rise off it for GLITTER.seconds: the help's hint (a Handle); glitter(null) stops all
//   stones.update(dt, time)                  // by hand, for a world without effects (with world.effects it runs itself)
//   stones.dispose()
//
// Everything runs on the game clock (world.effects), so a paused game pauses it and a capture lands on the same frame. Draw calls: the
// right stones are one merged mesh, the wrong ones one instanced mesh (each casts a shadow: two more in the shadow pass). Triangles:
// 5 x about 320 for the right ones (the rock's finest shape, lod 0: they are big and near the camera; lod 1 shows its facets), 8 x 80
// for the wrong ones (lod 1).

const DEPTH = 0.6; // m under the water at the least (the grey discs; the real stones go down to the river bed)
const BED = 0.15; // m into the river bed
const COLOUR = { right: '#9a978d', wrong: '#7d7a72' }; // the grey stand-ins: the right one lighter (dry)
const STONE = { right: { across: 3, up: 0.35, tap: 1.6 }, wrong: { across: 1.4, up: 0.25, tap: 1.0 } };
// The look: the right stone's top pressed flat over its last FLAT m, its colour lifted toward a pale dry grey; the wrong stone darker,
// and darker yet (wet) up to WET m over the water, with a shine
const FLAT = 0.1;
const DRY = { toward: [0.8, 0.79, 0.75], by: 0.55, mossy: 0.25, long: 1.12, spread: 1.16, lod: 0 }; // spread: its widest over its width at the water
const WET = { band: 0.12, dark: 0.62, band_dark: 0.6, tint: [0.92, 0.98, 1.0], mossy: 1.1, shininess: 40, specular: '#2c3032' };
const UNDER = { colour: [0.1, 0.19, 0.18], most: 0.85, depth: 0.45 };
const WOBBLE = { seconds: 1.1, degrees: 9, swings: 2.5 };
const GLITTER = { seconds: 3, every: 0.35 };
const VARIANTS = 5; // the species library's rock variants (world/forest/config.js FOREST.trees.variants.rock)

const linear = new THREE.Color();
/** The library's sRGB colour as the renderer's linear one. */
const toLinear = (r, g, b) => linear.setRGB(r, g, b).convertSRGBToLinear();

/** The highest point of a mesh's surface over (x, z): its triangles seen from above. -Infinity where none is over it. */
function surfaceOf(pos, idx, x, z) {
  let best = -Infinity;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-9) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    const w = 1 - u - v;
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
    best = Math.max(best, u * pos[a + 1] + v * pos[b + 1] + w * pos[c + 1]);
  }
  return best;
}

/**
 * A library rock laid as a stone in the river: `across` m wide (and `long` times that along its own x), its top `up` m over the
 * water and its foot `down` m under it, in its own frame (y 0 the water line, x along the river). Returns { pos, nrm, col, idx },
 * colours linear. `flat` presses its top flat; `paint(c, y)` colours each vertex at height y over the water.
 */
function layRock(model, { across, long = 1, up, down, flat = 0, paint }) {
  const src = model.solid;
  const n = src.pos.length / 3;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = src.pos[i * 3], y = src.pos[i * 3 + 1], z = src.pos[i * 3 + 2];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const sx = (across * long) / (maxX - minX), sz = across / (maxZ - minZ);
  // the top (up + flat over the water before it is pressed) and the water line: the upper part keeps its shape, the lower part
  // stretches down to the foot
  const top = up + flat * 3;
  const sy = (top + DEPTH) / (maxY - minY);
  const waterY = maxY - top / sy; // the model's height that comes to the water line
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y0 = src.pos[i * 3 + 1];
    let y = y0 >= waterY ? (y0 - waterY) * sy : -((waterY - y0) / (waterY - minY)) * down;
    if (flat && y > up - flat) y = up - flat + (y - (up - flat)) * 0.25;
    pos[i * 3] = (src.pos[i * 3] - cx) * sx;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = (src.pos[i * 3 + 2] - cz) * sz;
    let c = paint([src.col[i * 3], src.col[i * 3 + 1], src.col[i * 3 + 2]], y);
    // under the water it goes the river's dark green, so where the shallows by a bank are clear it reads as under them
    if (y < 0) c = mix(c, UNDER.colour, UNDER.most * Math.min(1, -y / UNDER.depth));
    toLinear(c[0], c[1], c[2]);
    col[i * 3] = linear.r; col[i * 3 + 1] = linear.g; col[i * 3 + 2] = linear.b;
  }
  // its highest point exactly `up` over the water
  let high = -Infinity;
  for (let i = 0; i < n; i++) high = Math.max(high, pos[i * 3 + 1]);
  for (let i = 0; i < n; i++) if (pos[i * 3 + 1] > 0) pos[i * 3 + 1] *= up / high;
  return { pos, col, idx: Uint32Array.from(src.idx) };
}

const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const paintDry = c => mix(c, DRY.toward, DRY.by).map(v => Math.min(1, v * 1.08));
const paintWet = (c, y) => {
  const k = y < WET.band ? WET.band_dark * WET.dark : WET.dark;
  return [c[0] * k * WET.tint[0], c[1] * k * WET.tint[1], c[2] * k * WET.tint[2]];
};

/** A geometry of `rocks` ({ pos, col, idx } each), merged; normals made from the shapes as laid. */
function merged(rocks) {
  const count = rocks.reduce((s, r) => s + r.pos.length / 3, 0);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), idx = [];
  let base = 0;
  for (const r of rocks) {
    pos.set(r.pos, base * 3);
    col.set(r.col, base * 3);
    for (const i of r.idx) idx.push(i + base);
    base += r.pos.length / 3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSteppingStones(world, { steps, level, heightAt = world.heightAt, library = null, sizes = STONE, grey = false, seed = 6 } = {}) {
  const real = Boolean(library) && !grey;
  const group = new THREE.Group();
  group.name = 'Stepping stones';
  const disposables = [];
  const stones = new Map(); // id -> { id, at, right, size, top, away, frog, wobbling, matrix (wrong: its rest), surface(x, z) }
  const list = steps.flatMap((step, k) => step.stones.map(stone => ({ ...stone, step: k })));
  const rightOfStep = steps.map(step => step.stones.find(s => s.right));
  const bed = (x, z) => Math.min(level - DEPTH, (heightAt?.(x, z) ?? level - DEPTH) - BED);
  for (const stone of list) {
    const right = rightOfStep[stone.step];
    let away = [stone.at[0] - right.at[0], stone.at[1] - right.at[1]];
    const l = Math.hypot(away[0], away[1]);
    away = l > 1e-6 ? [away[0] / l, away[1] / l] : [1, 0];
    stones.set(stone.id, { id: stone.id, at: stone.at, right: stone.right, step: stone.step, size: stone.right ? sizes.right : sizes.wrong, away, wobbling: null });
  }
  // the river's way at the ford, for turning the right stones' long side along it
  const along = (() => {
    const s = steps.find(step => step.stones.length > 1)?.stones;
    if (!s) return 0;
    const a = s[0].at, b = s[s.length - 1].at;
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  })();

  let rightMesh = null, wrongMesh = null;
  const greyMeshes = [];
  if (real) {
    // the right ones: a rock each (its own variant and turn), laid broad, low and flat, merged into one mesh
    const rights = list.filter(s => s.right);
    const rocks = rights.map((stone, k) => {
      const s = stones.get(stone.id);
      const [x, z] = stone.at;
      const down = level - bed(x, z);
      const laid = layRock(library.get('rock', (k + seed) % VARIANTS, DRY.lod, { mossy: DRY.mossy }), { across: s.size.across * DRY.spread, long: DRY.long, up: s.size.up, down, flat: FLAT, paint: paintDry });
      const turn = along + ((k * 37) % 30 - 15) * (Math.PI / 180);
      const cos = Math.cos(turn), sin = Math.sin(turn);
      for (let i = 0; i < laid.pos.length; i += 3) {
        const lx = laid.pos[i], lz = laid.pos[i + 2];
        laid.pos[i] = x + lx * cos - lz * sin;
        laid.pos[i + 1] += level;
        laid.pos[i + 2] = z + lx * sin + lz * cos;
      }
      s.surface = (px, pz) => surfaceOf(laid.pos, laid.idx, px, pz);
      s.range = { start: 0, count: laid.pos.length / 3 };
      return laid;
    });
    let start = 0;
    rights.forEach((stone, k) => { stones.get(stone.id).range.start = start; start += rocks[k].pos.length / 3; });
    const geometry = merged(rocks);
    geometry.userData.stones = rights.map(stone => ({ id: stone.id, ...stones.get(stone.id).range }));
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    material.name = 'stepping-stone-right';
    rightMesh = new THREE.Mesh(geometry, material);
    rightMesh.name = 'Stepping stones right';
    rightMesh.castShadow = true;
    rightMesh.receiveShadow = true;
    group.add(rightMesh);
    disposables.push(geometry, material);

    // the wrong ones: one small rock, round, dark and wet, instanced; each its own turn and a little larger or smaller
    const wrongs = list.filter(s => !s.right);
    const deepest = Math.max(...wrongs.map(s => level - bed(...s.at)), DEPTH);
    const laid = layRock(library.get('rockSmall', seed % VARIANTS, 1, { mossy: WET.mossy }), { across: sizes.wrong.across, up: sizes.wrong.up, down: deepest, paint: paintWet });
    const geometryW = merged([laid]);
    const materialW = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: WET.shininess, specular: new THREE.Color(WET.specular) });
    materialW.name = 'stepping-stone-wrong';
    wrongMesh = new THREE.InstancedMesh(geometryW, materialW, wrongs.length);
    wrongMesh.name = 'Stepping stones wrong';
    wrongMesh.castShadow = true;
    wrongMesh.receiveShadow = true;
    const q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    wrongs.forEach((stone, k) => {
      const s = stones.get(stone.id);
      const turn = k * 2.39996;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, turn);
      s.matrix = new THREE.Matrix4().compose(p.set(stone.at[0], level, stone.at[1]), q, one);
      s.index = k;
      wrongMesh.setMatrixAt(k, s.matrix);
      const v = new THREE.Vector3();
      const pos = new Float32Array(laid.pos.length);
      for (let i = 0; i < laid.pos.length; i += 3) {
        v.set(laid.pos[i], laid.pos[i + 1], laid.pos[i + 2]).applyMatrix4(s.matrix);
        pos[i] = v.x; pos[i + 1] = v.y; pos[i + 2] = v.z;
      }
      s.surface = (px, pz) => surfaceOf(pos, laid.idx, px, pz);
    });
    wrongMesh.instanceMatrix.needsUpdate = true;
    wrongMesh.computeBoundingSphere();
    group.add(wrongMesh);
    disposables.push(geometryW, materialW, wrongMesh); // the instanced mesh gives back its instance buffers
  } else {
    // chunk 1's grey discs: a flat disc each, standing out of the water by its `up` and down DEPTH under it
    const materials = { right: new THREE.MeshLambertMaterial({ color: COLOUR.right }), wrong: new THREE.MeshLambertMaterial({ color: COLOUR.wrong }) };
    materials.right.name = 'stepping-stone-right';
    materials.wrong.name = 'stepping-stone-wrong';
    disposables.push(materials.right, materials.wrong);
    for (const stone of list) {
      const s = stones.get(stone.id);
      const height = s.size.up + DEPTH;
      const geometry = new THREE.CylinderGeometry(s.size.across / 2, s.size.across / 2 * 1.08, height, 20);
      disposables.push(geometry);
      const mesh = new THREE.Mesh(geometry, stone.right ? materials.right : materials.wrong);
      mesh.name = stone.id;
      mesh.position.set(stone.at[0], level + s.size.up - height / 2, stone.at[1]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      s.mesh = mesh;
      const r = s.size.across / 2;
      s.surface = (px, pz) => (Math.hypot(px - stone.at[0], pz - stone.at[1]) <= r ? level + s.size.up : -Infinity);
      greyMeshes.push(mesh);
    }
  }
  for (const s of stones.values()) {
    const middle = s.surface(s.at[0], s.at[1]);
    s.top = new THREE.Vector3(s.at[0], Number.isFinite(middle) ? middle : level + s.size.up, s.at[1]);
    if (!s.right) {
      // the frog sits a third of the way out toward the water it will hop into
      const r = s.size.across * 0.22;
      const fx = s.at[0] + s.away[0] * r, fz = s.at[1] + s.away[1] * r;
      const fy = s.surface(fx, fz);
      s.frog = [fx, Number.isFinite(fy) ? fy : s.top.y, fz];
    }
  }
  const targets = [...stones.values()].map(s => ({ name: s.id, point: new THREE.Vector3(s.at[0], s.top.y + 0.15, s.at[1]), radius: s.size.tap }));
  world.scene?.add?.(group);

  let disposed = false;
  const live = new Set();
  const pivot = new THREE.Vector3(), turnQ = new THREE.Quaternion(), axis = new THREE.Vector3(), awayV = new THREE.Vector3(), m = new THREE.Matrix4(), tm = new THREE.Matrix4();
  function wobbleAt(s, now) {
    const w = s.wobbling;
    if (!w) return;
    const k = (now - w.from) / WOBBLE.seconds;
    const done = k >= 1;
    const swing = done ? 0 : Math.sin(k * Math.PI * 2 * WOBBLE.swings) * (1 - k) * THREE.MathUtils.degToRad(WOBBLE.degrees);
    if (s.mesh) s.mesh.rotation.set(swing * 0.6, 0, swing);
    else if (wrongMesh) {
      if (done) wrongMesh.setMatrixAt(s.index, s.matrix);
      else {
        // it rocks about a point at the water line under its middle, about an axis across the river and a little along it
        pivot.set(s.at[0], level - 0.1, s.at[1]);
        axis.set(-s.away[1], 0, s.away[0]).addScaledVector(awayV.set(s.away[0], 0, s.away[1]), 0.6).normalize();
        turnQ.setFromAxisAngle(axis, swing);
        m.makeTranslation(pivot.x, pivot.y, pivot.z).multiply(tm.makeRotationFromQuaternion(turnQ)).multiply(tm.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
        wrongMesh.setMatrixAt(s.index, m.multiply(s.matrix));
      }
      wrongMesh.instanceMatrix.needsUpdate = true;
    }
    if (done) {
      s.wobbling = null;
      w.handle.finish();
    }
  }
  let lastTime = 0;
  function update(dt, time = lastTime + (dt ?? 0)) {
    if (disposed) return false;
    lastTime = time;
    for (const s of stones.values()) wobbleAt(s, time);
    for (const g of live) {
      if (time >= g.until) { live.delete(g); g.handle.finish(); continue; }
      if (time >= g.next) {
        g.next = time + GLITTER.every;
        const turn = (time * 2.39996) % (Math.PI * 2);
        const r = g.stone.size.across * 0.3;
        sparkleBurst(world, new THREE.Vector3(g.stone.at[0] + Math.cos(turn) * r, g.stone.top.y + 0.08, g.stone.at[1] + Math.sin(turn) * r), { count: 10, duration: 1.1, size: 0.22, spread: 0.6, seed: `stone glitter ${g.n++ % 7}` });
      }
    }
    return true;
  }
  const now = () => world.clock?.time ?? lastTime;
  world.effects?.add?.({ label: 'stepping stones', update: () => update(0, now()) });

  return {
    group, targets,
    /** Its top at its middle (a Vector3: copy it before changing it). */
    topOf: id => stones.get(id).top,
    /** Where its frog sits ([x, y, z]); null for a right stone. */
    frogSpot: id => (stones.get(id).frog ? [...stones.get(id).frog] : null),
    /** The way ([x, z], unit) from its step's right stone to it: where its frog hops. */
    away: id => [...stones.get(id).away],
    /** The stone's surface over (x, z) (-Infinity off it): for what stands on it. */
    surfaceAt: (id, x, z) => stones.get(id).surface(x, z),
    /** How the stone lies now (a Matrix4 from its own frame: its rest, or a wobble), for a test or a probe. */
    matrixOf(id, out = new THREE.Matrix4()) {
      const s = stones.get(id);
      if (s.mesh) return out.copy(s.mesh.updateMatrix() ?? s.mesh.matrix);
      if (s.index !== undefined) { wrongMesh.getMatrixAt(s.index, out); return out; }
      return out.identity();
    },
    /** The stone wobbles (a wrong tap) and comes to rest as it lay. */
    wobble(id) {
      const s = stones.get(id);
      s.wobbling?.handle.finish();
      s.wobbling = { from: now(), handle: new Handle(`${id} wobbles`) };
      return s.wobbling.handle;
    },
    /** Glints rise off it for a while: the right stone, as the help's hint. glitter(null) stops every glint. */
    glitter(id) {
      if (id === null) {
        for (const g of live) g.handle.finish();
        live.clear();
        return new Handle('no glitter').finish();
      }
      const t = now();
      const g = { stone: stones.get(id), until: t + GLITTER.seconds, next: t, n: 0, handle: new Handle(`${id} glitters`) };
      live.add(g);
      return g.handle;
    },
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const g of live) g.handle.finish();
      live.clear();
      for (const s of stones.values()) s.wobbling?.handle.finish();
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
