import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { seededRandom } from '../../engine/random.js';
import { sparkleBurst, sparkleTrail, needEffects } from './sparkles.js';

// The marsh berry bushes of the Fen (chapter 2, scene 4: Egill picks five bunches of red berries for Þórseðla, and the blue ones
// are the birds'). Each bush is a low, round shrub about a metre high: a small dark heart under a hundred and ten leaves laid along
// its round in layers, lapping over each other, and its berries hanging in bunches on the outside where a child sees them, six
// glossy berries to a bunch, 4.6 cm each. A bunch is what the child taps and counts. One picked flies in an arc to a point (Egill's basket), with
// a trail of glints, and leaves its bush, which shakes, its leaves nodding. All the bushes are one mesh, all the berries one
// instanced mesh: two draw calls (and a third for a bunch in the air).
//
//   const berries = createBerryBushes(world, { bushes: [{ position: [x, y, z], kind: 'red', count: 2, facing }] });
//   for (const t of berries.targets) s.target(t.name, t);    // berry_<bush>_<i>: { name, point, radius: 0.35, kind }: a bunch
//   yield berries.pick('berry_0_1', basket.point);           // it flies there; a Handle, done when it is there
//   berries.shake(0);                                         // a Handle, done when the bush is still again
//   berries.glimmer(true);                                    // now and then a glint on a red bunch still on its bush
//
// `facing` (degrees, 0 is +X and 90 is +Z) is the side of the bush its bunches hang on: the side the camera sees. The leaves sway a
// little in the shader and shake when a bunch is picked (a bush index and a sway weight on each vertex); the berries on a shaking
// bush shake with it. Everything runs on the game clock (world.effects, world.clock.time). The basket (basket.js) draws a bunch
// that lands in it the same: BUNCH and berryGeometry.

// m; how many leaves, a leaf's length and width; the heart's share of the bush, and where the leaves lie (shares of it, in to out)
const BUSH = { radius: 0.6, height: 1.0, leaves: 110, leaf: [0.3, 0.14], heart: 0.4, shell: [0.45, 0.85] };
const LEAF = { core: '#2e4f2c', dark: '#3e6a38', mid: '#5c8a45', light: '#8ab05a' };
export const BERRY = { radius: 0.023, red: '#d8323a', blue: '#3f5fc4', tip: '#3b2a22' };
// A bunch: six berries round its middle (metres), hanging a little.
export const BUNCH = [[0, 0, 0], [0.037, 0.014, 0.014], [-0.035, 0.012, 0.018], [0.007, -0.035, 0.014], [0.018, 0.016, -0.032], [-0.02, -0.016, -0.028]];
const SHAKE = { seconds: 0.8, hz: 7, reach: 0.06 }; // a bush's shake: how long, how fast, how far its top moves (m)
const FLIGHT = { seconds: 0.85, arc: 0.6 }; // s a picked bunch flies, and m it rises above the straight line
const GLINT_EVERY = 2.6; // s between glints on the red bunches while they glimmer

const smooth = t => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };

/** A berry: a slightly squat ball with a dark little crown on top, 64 triangles, white for its instance's colour. */
export function berryGeometry() {
  const geometry = new THREE.SphereGeometry(BERRY.radius, 8, 5);
  geometry.scale(1, 0.92, 1);
  const pos = geometry.attributes.position;
  const colour = [];
  const shade = new THREE.Color('#ffffff');
  const tip = new THREE.Color(BERRY.tip);
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > BERRY.radius * 0.8 ? tip : shade;
    colour.push(top.r, top.g, top.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
  return geometry.toNonIndexed();
}

/** A whole bunch as one geometry (for one in the air). */
export function bunchGeometry() {
  const one = berryGeometry();
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const src = one.attributes[name].array;
    const array = new Float32Array(src.length * BUNCH.length);
    BUNCH.forEach((offset, k) => {
      for (let i = 0; i < src.length; i += 3) {
        array[k * src.length + i] = src[i] + (name === 'position' ? offset[0] : 0);
        array[k * src.length + i + 1] = src[i + 1] + (name === 'position' ? offset[1] : 0);
        array[k * src.length + i + 2] = src[i + 2] + (name === 'position' ? offset[2] : 0);
      }
    });
    out.setAttribute(name, new THREE.BufferAttribute(array, 3));
  }
  one.dispose();
  out.computeBoundingSphere();
  return out;
}

/** Where one bush's bunches hang: on the side it faces, spread across it, half to three quarters of the way up, on its leaves. */
function bunchesOf(random, count, facing) {
  const f = THREE.MathUtils.degToRad(facing);
  return Array.from({ length: count }, (_, i) => {
    const spread = count > 1 ? (i / (count - 1) - 0.5) * 1.5 : 0;
    const a = f + spread + (random() - 0.5) * 0.25;
    const up = BUSH.height * (0.42 + 0.22 * random());
    const out = BUSH.radius * (0.98 + 0.06 * random());
    return [Math.cos(a) * out, up, Math.sin(a) * out];
  });
}

/**
 * One bush: a small dark heart (an 80-triangle ball) and BUSH.leaves leaves over it, each two triangles, laid along the bush's
 * round in layers from BUSH.shell[0] to [1] of the way out, each lapping over the ones under it (shingled, as a shrub's leaves are):
 * flat to the round and tipped a little out, pointing round it and mostly down it, the inner ones darker.
 */
function bushGeometry(random, b, [x, y, z]) {
  const position = [], colour = [], sway = [];
  const tone = [LEAF.dark, LEAF.mid, LEAF.light].map(hex => new THREE.Color(hex));
  const core = new THREE.Color(LEAF.core);
  const push = (p, c, up) => { position.push(p.x, p.y, p.z); colour.push(c.r, c.g, c.b); sway.push(b, Math.max(0, up)); };
  const R = BUSH.radius, H = BUSH.height * 0.5, middle = y + BUSH.height * 0.47;
  const heart = new THREE.IcosahedronGeometry(1, 1);
  const hp = heart.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < hp.count; i++) {
    v.fromBufferAttribute(hp, i);
    const p = new THREE.Vector3(x + v.x * R * BUSH.heart, middle + v.y * H * BUSH.heart, z + v.z * R * BUSH.heart);
    push(p, core, (p.y - y) / BUSH.height);
  }
  heart.dispose();
  const out = new THREE.Vector3(), round = new THREE.Vector3(), down = new THREE.Vector3(), along = new THREE.Vector3(), side = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < BUSH.leaves; i++) {
    const a = random() * Math.PI * 2;
    const h = 0.06 + 0.94 * random(); // from the foot of the bush (0) to its top (1)
    const lat = Math.asin(2 * h - 1);
    out.set(Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat)); // the way out from the middle, on the round
    const layer = random();
    const reach = BUSH.shell[0] + (BUSH.shell[1] - BUSH.shell[0]) * layer;
    const base = new THREE.Vector3(x + out.x * R * reach, middle + out.y * H * reach * 1.1, z + out.z * R * reach);
    // flat to the round: round it (horizontal) and down it, mostly down, tipped a little out
    round.crossVectors(UP, out);
    if (round.lengthSq() < 1e-4) round.set(1, 0, 0);
    round.normalize();
    down.crossVectors(round, out).normalize(); // down the round
    const turn = THREE.MathUtils.degToRad(-75 + (random() - 0.5) * 150); // from round it (0) to down it (-90) and back up
    along.copy(round).multiplyScalar(Math.cos(turn)).addScaledVector(down, -Math.sin(turn)).addScaledVector(out, 0.35).normalize();
    side.crossVectors(along, out).normalize();
    const length = BUSH.leaf[0] * (0.8 + 0.4 * random()), width = BUSH.leaf[1] * (0.8 + 0.4 * random());
    const tip = base.clone().addScaledVector(along, length);
    const mid = base.clone().addScaledVector(along, length * 0.45);
    const fold = out.clone().multiplyScalar(width * 0.12); // a little convex over its rib
    const left = mid.clone().addScaledVector(side, width * 0.5).sub(fold);
    const right = mid.clone().addScaledVector(side, -width * 0.5).sub(fold);
    const c = tone[Math.min(2, Math.floor(random() * 1.6 + h * 1.2 + layer * 0.6))].clone()
      .offsetHSL(0, 0, (random() - 0.5) * 0.06).multiplyScalar(0.62 + 0.38 * layer);
    const rib = c.clone().multiplyScalar(0.82);
    const up = p => (p.y - y) / BUSH.height;
    push(base, rib, up(base)); push(left, c, up(left)); push(tip, c, up(tip));
    push(base, rib, up(base)); push(tip, c, up(tip)); push(right, c, up(right));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
  g.setAttribute('aBush', new THREE.Float32BufferAttribute(sway, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Berry bushes at `bushes` ([{ position: [x, y, z], kind: 'red' | 'blue', count, facing = 0 }]: the ground under each; `count`
 * bunches). Returns
 *   group           the bushes and their berries, in world.scene
 *   targets         [{ name: 'berry_<b>_<i>', point, radius: 0.35, kind }]: every bunch, picked or not
 *   picked          the names of the bunches picked
 *   pick(name, to)  the bunch flies to `to` (a point spec, followed as it moves) and leaves its bush; a Handle, done when it is there
 *   shake(bush)     bush number `bush` shakes, its berries with it; a Handle
 *   glimmer(on)     a glint on a red bunch still on its bush every few seconds
 *   flying          the last bunch sent flying (a mesh; out of sight once it is there)
 *   update(t), dispose()
 */
export function createBerryBushes(world, { bushes = [], seed = 'berries' } = {}) {
  if (!Array.isArray(bushes) || !bushes.length) throw new TypeError('createBerryBushes takes `bushes`: [{ position: [x, y, z], kind, count }]');
  needEffects(world, 'createBerryBushes');
  for (const b of bushes) {
    if (!['red', 'blue'].includes(b.kind)) throw new TypeError(`A bush's berries are 'red' or 'blue', not ${JSON.stringify(b.kind)}`);
  }
  const random = seededRandom(seed);
  const group = new THREE.Group();
  group.name = 'Berry bushes';

  // ---- the bushes: leaves round a dark heart, one mesh ----
  const parts = bushes.map((b, i) => bushGeometry(random, i, b.position));
  const bushGeometryAll = mergeAll(parts);
  const shakes = bushes.map(() => 0);
  const bushUniforms = { uBushTime: { value: 0 }, uShake: { value: new Float32Array(Math.max(1, bushes.length)) } };
  const bushMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  bushMaterial.name = 'berry bushes';
  bushMaterial.onBeforeCompile = shader => {
    if (!shader.vertexShader.includes('#include <begin_vertex>')) return;
    Object.assign(shader.uniforms, bushUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aBush; // x: which bush, y: how high on it (0 at its foot, 1 at its top)
uniform float uBushTime;
uniform float uShake[ ${Math.max(1, bushes.length)} ];`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  float bushShake = uShake[ int( aBush.x + 0.5 ) ];
  float bushSway = 0.012 * sin( uBushTime * 1.7 + aBush.x * 2.1 + position.x * 0.9 ) + bushShake * ${SHAKE.reach.toFixed(3)} * sin( uBushTime * ${(SHAKE.hz * Math.PI * 2).toFixed(3)} + position.z * 3.0 );
  transformed.x += bushSway * aBush.y;
  transformed.z += 0.6 * bushSway * aBush.y;`);
  };
  bushMaterial.customProgramCacheKey = () => `berry-bushes-${bushes.length}`;
  const bushMesh = new THREE.Mesh(bushGeometryAll, bushMaterial);
  bushMesh.name = 'Berry bushes';
  bushMesh.castShadow = true;
  bushMesh.receiveShadow = true;
  group.add(bushMesh);

  // ---- the bunches: every berry one instance of one mesh ----
  const bunchList = [];
  bushes.forEach((bush, b) => {
    const [x, y, z] = bush.position;
    bunchesOf(random, bush.count, bush.facing ?? 0).forEach((at, i) => bunchList.push({
      name: `berry_${b}_${i}`, bush: b, kind: bush.kind,
      home: new THREE.Vector3(x + at[0], y + at[1], z + at[2]),
      point: new THREE.Vector3(x + at[0], y + at[1], z + at[2]),
      turn: random() * Math.PI * 2,
    }));
  });
  const geometry = berryGeometry();
  const berryMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0 });
  berryMaterial.name = 'berries';
  const berries = new THREE.InstancedMesh(geometry, berryMaterial, bunchList.length * BUNCH.length);
  berries.name = 'Berries';
  berries.castShadow = false;
  berries.receiveShadow = true;
  const colours = { red: new THREE.Color(BERRY.red), blue: new THREE.Color(BERRY.blue) };
  const tint = new THREE.Color();
  bunchList.forEach((bunch, i) => BUNCH.forEach((_, k) => berries.setColorAt(i * BUNCH.length + k, tint.copy(colours[bunch.kind]).offsetHSL(0, 0, (k % 3 - 1) * 0.04))));
  group.add(berries);
  const byName = new Map(bunchList.map(bunch => [bunch.name, bunch]));
  const picked = new Set();

  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), none = new THREE.Vector3(0, 0, 0);
  const shakeOffset = new THREE.Vector3(), at = new THREE.Vector3();
  let now = 0;
  function placeBerries() {
    bunchList.forEach((bunch, i) => {
      const k = shakes[bunch.bush];
      const swing = 0.012 * Math.sin(now * 1.7 + bunch.bush * 2.1 + bunch.home.x * 0.9) + k * SHAKE.reach * Math.sin(now * SHAKE.hz * Math.PI * 2 + bunch.home.z * 3);
      const up = (bunch.home.y - bushes[bunch.bush].position[1]) / BUSH.height;
      shakeOffset.set(swing * up, 0, 0.6 * swing * up);
      bunch.point.copy(bunch.home).add(shakeOffset);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, bunch.turn);
      const gone = picked.has(bunch.name);
      BUNCH.forEach((offset, b) => {
        at.fromArray(offset).applyQuaternion(q).add(bunch.point);
        matrix.compose(at, q, gone ? none : one);
        berries.setMatrixAt(i * BUNCH.length + b, matrix);
      });
    });
    berries.instanceMatrix.needsUpdate = true;
  }
  placeBerries();

  const targets = bunchList.map(bunch => ({ name: bunch.name, point: bunch.point, radius: 0.35, kind: bunch.kind }));

  // ---- picking, shaking, glinting ----
  const flights = [];
  let flying = null;
  const inAir = bunchGeometry();
  const flyMaterials = { red: berryMaterial.clone(), blue: berryMaterial.clone() };
  for (const [kind, m] of Object.entries(flyMaterials)) { m.vertexColors = true; m.color = colours[kind].clone(); m.name = `bunch ${kind} flying`; }
  const live = new Set();
  const to3 = new THREE.Vector3();

  function pick(name, to) {
    const bunch = byName.get(name);
    if (!bunch) throw new Error(`No bunch named "${name}" (bunches: ${bunchList.map(b => b.name).join(', ')})`);
    const handle = new Handle(`${name} picked`);
    if (picked.has(name)) return handle.finish();
    picked.add(name);
    const mesh = new THREE.Mesh(inAir, flyMaterials[bunch.kind]);
    mesh.name = 'Bunch flying';
    mesh.position.copy(bunch.point);
    mesh.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, bunch.turn);
    group.add(mesh);
    flying = mesh;
    const flight = { mesh, from: bunch.point.clone(), to, start: now, handle };
    handle.onCancel = () => land(flight);
    flights.push(flight);
    live.add(sparkleTrail(world, () => mesh.position, { duration: FLIGHT.seconds * 0.9, count: 14, size: 0.12, seed: `${name} flight` }));
    placeBerries();
    return handle;
  }
  function land(flight) {
    const i = flights.indexOf(flight);
    if (i >= 0) flights.splice(i, 1);
    flight.mesh.position.copy(world.resolvePoint ? world.resolvePoint(flight.to, to3) : to3.copy(flight.to));
    flight.mesh.visible = false;
    flight.mesh.removeFromParent();
    if (!flight.handle.done) flight.handle.finish();
  }
  function fly(flight) {
    const u = (now - flight.start) / FLIGHT.seconds;
    const end = world.resolvePoint ? world.resolvePoint(flight.to, to3) : to3.copy(flight.to);
    if (u >= 1) { land(flight); return; }
    flight.mesh.position.lerpVectors(flight.from, end, smooth(u));
    flight.mesh.position.y += FLIGHT.arc * 4 * u * (1 - u);
  }

  const shaking = bushes.map(() => null); // { start, handle }
  function shake(b) {
    if (!bushes[b]) throw new Error(`No bush number ${b} (there are ${bushes.length})`);
    shaking[b]?.handle.finish();
    const handle = new Handle(`bush ${b} shakes`, () => { shaking[b] = null; shakes[b] = 0; });
    shaking[b] = { start: now, handle };
    return handle;
  }

  let glimmering = false;
  let nextGlint = 0;
  function glimmer(on) { glimmering = Boolean(on); nextGlint = now + 0.5; }

  function update(t) {
    now = t;
    bushUniforms.uBushTime.value = t;
    shaking.forEach((s, b) => {
      if (!s) return;
      const u = (t - s.start) / SHAKE.seconds;
      if (u >= 1) { shaking[b] = null; shakes[b] = 0; s.handle.finish(); return; }
      shakes[b] = Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u);
    });
    bushUniforms.uShake.value.set(shakes);
    for (const flight of [...flights]) fly(flight);
    placeBerries();
    if (glimmering && t >= nextGlint) {
      nextGlint = t + GLINT_EVERY;
      const left = bunchList.filter(bunch => bunch.kind === 'red' && !picked.has(bunch.name));
      if (left.length) {
        const bunch = left[Math.floor(t / GLINT_EVERY) % left.length];
        live.add(sparkleBurst(world, bunch.point.clone().add(new THREE.Vector3(0, 0.04, 0)), { count: 6, duration: 1, size: 0.13, spread: 0.2, seed: `berry glint ${bunch.name}` }));
      }
    }
    for (const handle of live) if (handle.done) live.delete(handle);
  }

  let disposed = false;
  world.scene.add(group);
  world.effects.add({
    update() {
      if (disposed) return false;
      update(world.clock?.time ?? now);
      return true;
    },
  });

  return {
    group, targets, picked, pick, shake, glimmer, update,
    get flying() { return flying; },
    /** Where bunch `name` hangs now (a live point), and its kind. */
    berry: name => byName.get(name),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const flight of [...flights]) land(flight);
      for (const s of shaking) s?.handle.finish();
      for (const handle of live) if (!handle.done) handle.cancel();
      group.removeFromParent();
      bushGeometryAll.dispose(); bushMaterial.dispose();
      geometry.dispose(); inAir.dispose(); berryMaterial.dispose(); berries.dispose();
      for (const m of Object.values(flyMaterials)) m.dispose();
    },
  };
}

/** Non-indexed geometries with the same attributes as one. */
function mergeAll(parts) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(parts[0].attributes)) {
    const size = parts[0].attributes[name].itemSize;
    const total = parts.reduce((n, g) => n + g.attributes[name].array.length, 0);
    const array = new Float32Array(total);
    let offset = 0;
    for (const g of parts) { array.set(g.attributes[name].array, offset); offset += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}
