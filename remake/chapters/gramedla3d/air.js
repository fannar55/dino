// Grameðla kemur!'s air (the owner's "meira vfx", 2026-11-12), each where it serves the depth and all of it at or behind the screen
// plane, since each beat has its own one thing out of the screen:
//   - the mist curling round her as she walks out of it: soft pale wisps born round her body, turning about her and thinning out;
//   - Flugeðla's brake: her wings' downdraft sweeps leaf and pollen specks off the lane behind her, out to both sides;
//   - after the roar: dust and leaves shaken from the crowns, drifting down through the lane.
// Like vfx.js, everything is a function of the show's second (pose(t)), the specks are the game's glints, and none is new art.
import * as THREE from 'three';
import { glints, SPARKLE_LOOK } from '../../world/props/sparkles.js';
import { seededRandom } from '../../engine/random.js';

export const CURLS = { from: 24.5, to: 37.5, every: 0.22, life: 3.2, size: 2.1, colour: '#dfe7e1', ring: [0.9, 2.0] };
export const SWEEP = { per: 40, life: 2.6, size: 0.12, colour: '#d9de86', depth: [7.5, 10.5], across: 2.2, out: [1.4, 3.2] };
export const FALL = { leaves: 34, dust: 30, life: 5.0, colour: '#a9c45c', dustColour: '#e6dcc0', area: { x: 4.6, depth: [9, 17], y: [4.2, 6.6] } };

const NORMAL = { blending: THREE.NormalBlending };
const BEHIND = 1.05; // k: the air stays behind the screen plane on every shape's camera (the stage's is 16:10)

/**
 * `herAt(t)`: her place on the ground at second t ({ x, z }, or null when she is not on the stage); `brake`: the second Flugeðla's
 * wings spread; `roar`: [from, to] the seconds the crowns shake off their dust and leaves; `groundAt(x, z)`; `clampK(p, kMin)`.
 */
export function createAir(world, { herAt, brake, roar, groundAt, clampK, camZ = 8 }) {
  const random = seededRandom('gramedla air');
  const soft = (core, glow, falloff) => ({ ...SPARKLE_LOOK, ...NORMAL, core, star: 0, glow, falloff, twinkle: 0, rim: 1, vary: 1, rise: 0, drift: [0, 0] });
  const make = (count, o) => {
    const set = glints(world, { count: Math.max(1, count), spread: 0, fall: 0, ...o });
    set.points.name = `gramedla ${o.seed}`;
    return set;
  };

  // ---- the curls: one wisp every `every` seconds while she comes out of the mist, about her body where she was at its birth ----
  const curls = [];
  for (let t = CURLS.from; t < CURLS.to; t += CURLS.every) {
    const at = herAt(t);
    if (!at) continue;
    curls.push({ t, x: at.x, z: at.z, a: random() * Math.PI * 2, r: CURLS.ring[0] + (CURLS.ring[1] - CURLS.ring[0]) * random(), h: 0.2 + 2.2 * random(), turn: (random() < 0.5 ? -1 : 1) * (0.35 + 0.3 * random()) });
  }
  const curl = make(curls.length, { life: CURLS.life, size: CURLS.size, colour: CURLS.colour, seed: 'curls', look: soft(CURLS.colour, 0.14, 1.8) });
  curl.points.renderOrder = 10;
  curls.forEach((c, i) => { curl.birth[i] = c.t; });

  // ---- the sweep: flecks lying on the lane behind Flugeðla's brake, blown out to the sides ----
  const sweeps = Array.from({ length: SWEEP.per }, () => {
    const x = (random() * 2 - 1) * SWEEP.across;
    const z = camZ - (SWEEP.depth[0] + (SWEEP.depth[1] - SWEEP.depth[0]) * random());
    return { t: brake + 0.25 * random(), x, z, y: groundAt(x, z), out: Math.sign(x || 1) * (SWEEP.out[0] + (SWEEP.out[1] - SWEEP.out[0]) * random()), up: 0.5 + 1.1 * random(), w: random() * 6 };
  });
  const sweep = make(sweeps.length, { life: SWEEP.life, size: SWEEP.size, colour: SWEEP.colour, seed: 'sweep', look: { ...SPARKLE_LOOK, star: 0, glow: 0.9, falloff: 2.4, twinkle: 0.4, rim: 1, vary: 1, rise: 0, drift: [0, 0] } });
  sweeps.forEach((s, i) => { sweep.birth[i] = s.t; });

  // ---- the fall: after the roar, leaves and dust from the crowns over the lane, drifting down and swaying ----
  const falling = n => Array.from({ length: n }, () => ({
    t: roar[0] + (roar[1] - roar[0]) * random(),
    x: (random() * 2 - 1) * FALL.area.x,
    z: camZ - (FALL.area.depth[0] + (FALL.area.depth[1] - FALL.area.depth[0]) * random()),
    y: FALL.area.y[0] + (FALL.area.y[1] - FALL.area.y[0]) * random(),
    speed: 0.55 + 0.5 * random(), sway: 0.25 + 0.35 * random(), w: random() * 6,
  }));
  const leafList = falling(FALL.leaves), dustList = falling(FALL.dust);
  const leaves = make(leafList.length, { life: FALL.life, size: 0.16, colour: FALL.colour, seed: 'leaves', look: { ...SPARKLE_LOOK, ...NORMAL, core: FALL.colour, star: 0, glow: 0.95, falloff: 2.6, twinkle: 0.3, rim: 1, vary: 1, rise: 0, drift: [0, 0] } });
  const motes = make(dustList.length, { life: FALL.life, size: 0.1, colour: FALL.dustColour, seed: 'fall dust', look: soft(FALL.dustColour, 0.7, 2.2) });
  leafList.forEach((s, i) => { leaves.birth[i] = s.t; });
  dustList.forEach((s, i) => { motes.birth[i] = s.t; });

  const sets = [curl, sweep, leaves, motes];
  for (const s of sets) s.points.geometry.attributes.birth.needsUpdate = true;
  const p = new THREE.Vector3();
  const HIDE = (set, i) => { set.position[i * 3] = 0; set.position[i * 3 + 1] = -500; set.position[i * 3 + 2] = 0; };
  const put = (set, i, v) => { set.position[i * 3] = v.x; set.position[i * 3 + 1] = v.y; set.position[i * 3 + 2] = v.z; };

  function pose(t) {
    curls.forEach((c, i) => {
      const a = t - c.t;
      if (a < 0 || a > CURLS.life) return HIDE(curl, i);
      const turn = c.a + c.turn * a, r = c.r + 0.45 * a;
      p.set(c.x + Math.cos(turn) * r, groundAt(c.x, c.z) + c.h + 0.18 * a, c.z + Math.sin(turn) * r * 0.7);
      put(curl, i, clampK(p, BEHIND));
    });
    sweeps.forEach((s, i) => {
      const a = t - s.t;
      if (a < 0 || a > SWEEP.life) return HIDE(sweep, i);
      const e = 1 - Math.exp(-a / 0.45);
      p.set(s.x + s.out * e, s.y + 0.05 + Math.max(0, s.up * e - 0.35 * a * a) + 0.06 * Math.sin(5 * a + s.w), s.z + 0.3 * Math.sin(2 * a + s.w));
      put(sweep, i, clampK(p, BEHIND));
    });
    for (const [list, set] of [[leafList, leaves], [dustList, motes]]) {
      list.forEach((s, i) => {
        const a = t - s.t;
        const y = s.y - s.speed * a;
        if (a < 0 || a > FALL.life || y < groundAt(s.x, s.z)) return HIDE(set, i);
        p.set(s.x + s.sway * Math.sin(1.7 * a + s.w), y, s.z + 0.5 * s.sway * Math.cos(1.3 * a + s.w));
        put(set, i, clampK(p, BEHIND));
      });
    }
    for (const s of sets) {
      s.points.geometry.attributes.position.needsUpdate = true;
      s.uniforms.uTime.value = t;
    }
  }

  /** What is in the air now, for the measurements: each set's points. */
  function points() {
    const read = (set, n) => { const list = []; for (let i = 0; i < n; i++) if (set.position[i * 3 + 1] > -400) list.push(new THREE.Vector3(set.position[i * 3], set.position[i * 3 + 1], set.position[i * 3 + 2])); return list; };
    return { curls: read(curl, curls.length), sweep: read(sweep, sweeps.length), leaves: read(leaves, leafList.length), fallDust: read(motes, dustList.length) };
  }
  return { pose, points, sets };
}
