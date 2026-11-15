// Samflug's air (chapters/samflug3d.js), code-made: leaves torn off the lane's trees, drifting in from the walls toward the middle
// behind her, and pale motes hanging in the lane's light. Both stand still in the world (they do not travel with her), so as the
// camera flies backwards they recede down the lane into the mist. Each is born inside the frame at k 1.2 or deeper and only goes
// further from there (rule 2: nothing an edge cuts is in front of the screen; rule 4: nothing pops: a leaf grows from nothing over
// its first half second and shrinks away at the end of its life, a mote fades in and out as the glints do).
//
// Every leaf and mote is a function of the show's second: leaf i is born at the second (i / N) of each cycle, at a place worked out
// from where the camera was then, so a seek lands on the frame.
import * as THREE from 'three';
import { glints, SPARKLE_LOOK } from '../../world/props/sparkles.js';
import { tanH, tanV } from './stage.js';

const LEAF = { count: 70, life: 6, size: 0.16, colours: ['#8fbf4e', '#c9c24a', '#e8a33a', '#a8c95a', '#7fae45', '#b5c84a'] };
const MOTE = { count: 90, life: 8, size: 0.06 };

const hash = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

export function createAir(world, { D, camY, cameraZ }) {
  // ---- leaves: flat ovals in the forest's leaf colours (as gramedla3d/cast.js draws its leaf flecks) ----
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.quadraticCurveTo(-0.1, 0.32, 0.5, 0);
  shape.quadraticCurveTo(-0.1, -0.32, -0.5, 0);
  const geometry = new THREE.ShapeGeometry(shape, 4).rotateX(-Math.PI / 2);
  const leaves = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), LEAF.count);
  leaves.name = 'samflug leaves';
  leaves.frustumCulled = false;
  const c = new THREE.Color();
  for (let i = 0; i < LEAF.count; i++) leaves.setColorAt(i, c.set(LEAF.colours[Math.floor(hash(i, 1) * LEAF.colours.length)]));
  world.scene.add(leaves);

  // ---- motes: glints, re-born as they fade ----
  const motes = glints(world, {
    count: MOTE.count, life: MOTE.life, spread: 0, fall: 0, size: MOTE.size, colour: '#fff6d6', seed: 'samflug motes',
    look: { ...SPARKLE_LOOK, star: 0, glow: 0.8, falloff: 2.6, twinkle: 1, rim: 1, rise: 0.4, drift: [0.15, 0] },
  });
  motes.points.name = 'samflug motes';
  const attr = motes.points.geometry.attributes;

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const state = { leaves: [], motes: [] };

  /** The world point at frame place (u, v) and depth k·D from the camera as it was at its z (a level camera looking along -Z). */
  const placeAt = (u, v, k, z, out) => {
    const dep = k * D;
    return out.set((2 * u - 1) * tanH * dep, camY + (1 - 2 * v) * tanV * dep, z - dep);
  };

  function update(t) {
    state.leaves.length = 0;
    for (let i = 0; i < LEAF.count; i++) {
      const offset = (i / LEAF.count) * LEAF.life;
      const age = (((t - offset) % LEAF.life) + LEAF.life) % LEAF.life;
      const born = t - age;
      const cycle = Math.floor((t - offset) / LEAF.life);
      const r = n => hash(i * 7 + cycle * 131, n);
      // born at a side of the frame (inside it), high, deep: off the walls' crowns
      const side = r(2) < 0.5 ? -1 : 1;
      const k0 = 1.25 + 2.2 * r(3);
      placeAt(side < 0 ? 0.06 + 0.06 * r(4) : 0.88 + 0.06 * r(4), 0.12 + 0.3 * r(5), k0, cameraZ(born), p);
      // drifting in toward the middle and down, fluttering, and a little away down the lane (the breeze she makes)
      const a = age;
      p.x += -side * (1.1 + 0.8 * r(6)) * a;
      p.y += -0.45 * a + 0.25 * Math.sin(a * (2 + 2 * r(7)) + 6 * r(8));
      p.z += -(0.6 + 0.6 * r(9)) * a;
      const grow = Math.min(1, a / 0.5) * Math.min(1, (LEAF.life - a) / 0.8);
      e.set(a * (1.5 + r(10)) + 6 * r(11), a * (0.8 + r(12)), Math.sin(a * 3 + r(13) * 6) * 0.9);
      q.setFromEuler(e);
      s.setScalar(LEAF.size * (0.7 + 0.6 * r(14)) * grow);
      leaves.setMatrixAt(i, m4.compose(p, q, s));
      state.leaves.push(p.toArray());
    }
    leaves.instanceMatrix.needsUpdate = true;

    state.motes.length = 0;
    for (let i = 0; i < MOTE.count; i++) {
      const offset = (i / MOTE.count) * MOTE.life;
      const age = (((t - offset) % MOTE.life) + MOTE.life) % MOTE.life;
      const born = t - age;
      const cycle = Math.floor((t - offset) / MOTE.life);
      const r = n => hash(i * 13 + cycle * 97, n + 20);
      // the motes hang in the lane behind her: in the frame's middle band, deep
      placeAt(0.12 + 0.76 * r(1), 0.08 + 0.7 * r(2), 1.2 + 3 * r(3) ** 1.3, cameraZ(born), p);
      motes.position.set([p.x, p.y, p.z], i * 3);
      motes.birth[i] = born;
      state.motes.push(p.toArray());
    }
    attr.position.needsUpdate = attr.birth.needsUpdate = true;
    motes.uniforms.uTime.value = t;
  }
  return { update, leaves, motes, state };
}
