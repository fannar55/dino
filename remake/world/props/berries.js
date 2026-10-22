import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { seededRandom } from '../../engine/random.js';
import { sparkleBurst, sparkleTrail, needEffects } from './sparkles.js';

// The marsh berry bushes of the Fen (chapter 2, scene 4: Egill picks five red berries for Þórseðla, and the blue ones are the
// birds'). Each bush is a low, round shrub of a few leafy clumps, about 0.9 m high, with its berries hanging on the outside where
// a child sees them: big glossy berries, red or blue, 14 cm across, so a finger finds them. A berry picked flies in an arc to a
// point (Egill's basket), with a trail of glints, and leaves its bush, which shakes, its leaves nodding. All the bushes are one
// mesh, all the berries one instanced mesh: two draw calls (and a third for a berry in the air).
//
//   const berries = createBerryBushes(world, { bushes: [{ position: [x, y, z], kind: 'red', count: 2, facing }] });
//   for (const t of berries.targets) s.target(t.name, t);    // berry_<bush>_<i>: { name, point, radius: 0.35, kind }
//   yield berries.pick('berry_0_1', basket.point);           // it flies there; a Handle, done when it is there
//   berries.shake(0);                                         // a Handle, done when the bush is still again
//   berries.glimmer(true);                                    // now and then a glint on a red berry still on its bush
//
// `facing` (degrees, 0 is +X and 90 is +Z) is the side of the bush its berries hang on: the side the camera sees. The bushes'
// leaves sway a little in the shader and shake when a berry is picked (a bush index and a sway weight on each vertex); the berries
// on a shaking bush shake with it. Everything runs on the game clock (world.effects, world.clock.time).

const BUSH = { radius: 0.62, height: 1.0, clumps: 5 };
const LEAF = { dark: '#3e6a38', mid: '#5c8a45', light: '#86ad58' };
const BERRY = { radius: 0.07, red: '#d8323a', blue: '#3f5fc4', tip: '#3b2a22' };
const SHAKE = { seconds: 0.8, hz: 7, reach: 0.06 }; // a bush's shake: how long, how fast, how far its top moves (m)
const FLIGHT = { seconds: 0.85, arc: 0.6 }; // s a picked berry flies, and m it rises above the straight line
const GLINT_EVERY = 2.6; // s between glints on the red berries while they glimmer

const smooth = t => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };

/** A berry: a slightly squat ball with a dark little crown on top, 72 triangles. */
function berryGeometry() {
  const geometry = new THREE.SphereGeometry(BERRY.radius, 9, 5);
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

/** One bush's clumps, as [{ at: [x, y, z], radii }] round its foot, and where on it its berries hang. */
function bushShape(random, count, facing) {
  const clumps = Array.from({ length: BUSH.clumps }, (_, i) => {
    const a = (i / BUSH.clumps) * Math.PI * 2 + random() * 0.8;
    const out = i === 0 ? 0 : BUSH.radius * (0.42 + 0.18 * random());
    const r = BUSH.radius * (i === 0 ? 0.62 : 0.42 + 0.12 * random());
    return { at: [Math.cos(a) * out, (i === 0 ? 0.5 : 0.36 + 0.12 * random()) * BUSH.height, Math.sin(a) * out], radii: [r, r * (i === 0 ? 0.85 : 0.75), r] };
  });
  // its berries: on the side it faces, spread across it, half to three quarters of the way up, just outside the leaves
  const f = THREE.MathUtils.degToRad(facing);
  const berries = Array.from({ length: count }, (_, i) => {
    const spread = count > 1 ? (i / (count - 1) - 0.5) * 1.5 : 0;
    const a = f + spread + (random() - 0.5) * 0.25;
    const up = BUSH.height * (0.42 + 0.22 * random());
    const out = BUSH.radius * (0.92 + 0.08 * random());
    return [Math.cos(a) * out, up, Math.sin(a) * out];
  });
  return { clumps, berries };
}

/**
 * Berry bushes at `bushes` ([{ position: [x, y, z], kind: 'red' | 'blue', count, facing = 0 }]: the ground under each). Returns
 *   group           the bushes and their berries, in world.scene
 *   targets         [{ name: 'berry_<b>_<i>', point, radius: 0.35, kind }]: every berry, picked or not
 *   picked          the names of the berries picked
 *   pick(name, to)  the berry flies to `to` (a point spec, followed as it moves) and leaves its bush; a Handle, done when it is there
 *   shake(bush)     bush number `bush` shakes, its berries with it; a Handle
 *   glimmer(on)     a glint on a red berry still on its bush every few seconds
 *   flying          the last berry sent flying (a mesh; out of sight once it is there)
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

  // ---- the bushes: soft leafy clumps, one mesh ----
  const shapes = bushes.map(b => bushShape(random, b.count, b.facing ?? 0));
  const parts = [];
  const leaf = [LEAF.dark, LEAF.mid, LEAF.light].map(hex => new THREE.Color(hex));
  shapes.forEach((shape, b) => {
    const [x, y, z] = bushes[b].position;
    for (const clump of shape.clumps) {
      const g = new THREE.IcosahedronGeometry(1, 1); // 80 triangles, each with vertices of its own
      const pos = g.attributes.position;
      const normal = g.attributes.normal;
      const colour = [], sway = [];
      for (let i = 0; i < pos.count; i++) {
        // a lumpy ball: each vertex in or out a little, so the clump reads as leaves, not a sphere
        const n = new THREE.Vector3().fromBufferAttribute(pos, i);
        const lump = 1 + 0.13 * Math.sin(n.x * 9.1 + b * 3.7) * Math.sin(n.y * 7.3 + n.z * 5.9);
        const p = n.clone().multiplyScalar(lump);
        pos.setXYZ(i, x + clump.at[0] + p.x * clump.radii[0], y + clump.at[1] + p.y * clump.radii[1], z + clump.at[2] + p.z * clump.radii[2]);
        // soft: the clump's own roundness for the light, not its facets
        const s = n.clone().set(n.x / clump.radii[0], n.y / clump.radii[1], n.z / clump.radii[2]).normalize();
        normal.setXYZ(i, s.x, s.y, s.z);
        const k = Math.min(1, Math.max(0, 0.5 + 0.5 * n.y + 0.15 * Math.sin(n.x * 13 + n.z * 11)));
        const c = k < 0.5 ? leaf[0].clone().lerp(leaf[1], k * 2) : leaf[1].clone().lerp(leaf[2], (k - 0.5) * 2);
        colour.push(c.r, c.g, c.b);
        sway.push(b, Math.max(0, (clump.at[1] + p.y * clump.radii[1]) / BUSH.height));
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
      g.setAttribute('aBush', new THREE.Float32BufferAttribute(sway, 2));
      parts.push(g);
    }
  });
  const bushGeometry = mergeAll(parts);
  bushGeometry.computeBoundingSphere();
  const shakes = bushes.map(() => 0);
  const bushUniforms = { uBushTime: { value: 0 }, uShake: { value: new Float32Array(Math.max(1, bushes.length)) } };
  const bushMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: false });
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
  const bushMesh = new THREE.Mesh(bushGeometry, bushMaterial);
  bushMesh.name = 'Berry bushes';
  bushMesh.castShadow = true;
  bushMesh.receiveShadow = true;
  group.add(bushMesh);

  // ---- the berries: one instanced mesh ----
  const berryList = [];
  shapes.forEach((shape, b) => {
    const [x, y, z] = bushes[b].position;
    shape.berries.forEach((at, i) => berryList.push({
      name: `berry_${b}_${i}`, bush: b, kind: bushes[b].kind,
      home: new THREE.Vector3(x + at[0], y + at[1], z + at[2]),
      point: new THREE.Vector3(x + at[0], y + at[1], z + at[2]),
      turn: random() * Math.PI * 2,
    }));
  });
  const geometry = berryGeometry();
  const berryMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0 });
  berryMaterial.name = 'berries';
  const berries = new THREE.InstancedMesh(geometry, berryMaterial, berryList.length);
  berries.name = 'Berries';
  berries.castShadow = false;
  berries.receiveShadow = true;
  const colours = { red: new THREE.Color(BERRY.red), blue: new THREE.Color(BERRY.blue) };
  berryList.forEach((berry, i) => berries.setColorAt(i, colours[berry.kind]));
  group.add(berries);
  const byName = new Map(berryList.map(berry => [berry.name, berry]));
  const picked = new Set();

  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), none = new THREE.Vector3(0, 0, 0);
  const shakeOffset = new THREE.Vector3();
  let now = 0;
  function placeBerries() {
    berryList.forEach((berry, i) => {
      const k = shakes[berry.bush];
      const swing = 0.012 * Math.sin(now * 1.7 + berry.bush * 2.1 + berry.home.x * 0.9) + k * SHAKE.reach * Math.sin(now * SHAKE.hz * Math.PI * 2 + berry.home.z * 3);
      const up = (berry.home.y - bushes[berry.bush].position[1]) / BUSH.height;
      shakeOffset.set(swing * up, 0, 0.6 * swing * up);
      berry.point.copy(berry.home).add(shakeOffset);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, berry.turn);
      matrix.compose(berry.point, q, picked.has(berry.name) ? none : one);
      berries.setMatrixAt(i, matrix);
    });
    berries.instanceMatrix.needsUpdate = true;
  }
  placeBerries();

  const targets = berryList.map(berry => ({ name: berry.name, point: berry.point, radius: 0.35, kind: berry.kind }));

  // ---- picking, shaking, glinting ----
  const flights = [];
  let flying = null;
  const flyMaterials = { red: berryMaterial.clone(), blue: berryMaterial.clone() };
  for (const [kind, m] of Object.entries(flyMaterials)) { m.vertexColors = true; m.color = colours[kind].clone(); m.name = `berry ${kind} flying`; }
  const live = new Set();
  const to3 = new THREE.Vector3();

  function pick(name, to) {
    const berry = byName.get(name);
    if (!berry) throw new Error(`No berry named "${name}" (berries: ${berryList.map(b => b.name).join(', ')})`);
    const handle = new Handle(`${name} picked`);
    if (picked.has(name)) return handle.finish();
    picked.add(name);
    const mesh = new THREE.Mesh(geometry, flyMaterials[berry.kind]);
    mesh.name = 'Berry flying';
    mesh.position.copy(berry.point);
    group.add(mesh);
    flying = mesh;
    const flight = { mesh, from: berry.point.clone(), to, start: now, handle };
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
    const k = smooth(u);
    flight.mesh.position.lerpVectors(flight.from, end, k);
    flight.mesh.position.y += FLIGHT.arc * 4 * u * (1 - u);
    flight.mesh.scale.setScalar(1 - 0.25 * k);
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
      const left = berryList.filter(berry => berry.kind === 'red' && !picked.has(berry.name));
      if (left.length) {
        const berry = left[Math.floor(t / GLINT_EVERY) % left.length];
        live.add(sparkleBurst(world, berry.point.clone().add(new THREE.Vector3(0, BERRY.radius * 0.8, 0)), { count: 5, duration: 1, size: 0.13, spread: 0.18, seed: `berry glint ${berry.name}` }));
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
    /** Where berry `name` hangs now (a live point), and its kind. */
    berry: name => byName.get(name),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const flight of [...flights]) land(flight);
      for (const s of shaking) s?.handle.finish();
      for (const handle of live) if (!handle.done) handle.cancel();
      group.removeFromParent();
      bushGeometry.dispose(); bushMaterial.dispose();
      geometry.dispose(); berryMaterial.dispose(); berries.dispose();
      for (const m of Object.values(flyMaterials)) m.dispose();
    },
  };
}

/** Non-indexed geometries with the same attributes as one. */
function mergeAll(parts) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(parts[0].attributes).filter(name => name !== 'uv')) {
    const size = parts[0].attributes[name].itemSize;
    const total = parts.reduce((n, g) => n + g.attributes[name].array.length, 0);
    const array = new Float32Array(total);
    let at = 0;
    for (const g of parts) { array.set(g.attributes[name].array, at); at += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  for (const g of parts) g.dispose();
  return out;
}
