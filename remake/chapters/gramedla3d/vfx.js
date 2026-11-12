// Grameðla kemur!'s ground and breath effects (the owner, 2026-11-12: "VFX fótspor þegar hún labbar", "smá hvít loft úr nösum"):
// at each of her footfalls a low burst of pale earth dust that spreads and settles, a few pollen and leaf specks knocked up, and a
// print pressed into the ground that stays to the end of the show; at each sniff and at the huff a puff of white air out of each
// nostril, anchored to her nostrils, that billows a little and is gone in under a second.
//
// Everything is a function of the show's second (pose(t) every frame), so a seek lands on the frame and "Aftur" starts clean. The
// specks are the game's glints (world/props/sparkles.js), placed here each frame and faded by the shader over their life. No new art:
// the print is a soft dark patch made in code, like a blob shadow.
//
// The screen's rules: dust and specks stay behind the screen plane (k 1 and further: pushed back along the line of sight if a
// burst would come nearer); the breath may come out, never nearer than k 0.334 (4 %), and stays inside the middle of the frame.
import * as THREE from 'three';
import { glints, SPARKLE_LOOK } from '../../world/props/sparkles.js';
import { seededRandom } from '../../engine/random.js';

export const DUST = { per: 12, life: 1.9, reach: 1.5, rise: 0.75, size: 0.95, colour: '#d6c6a2', kMin: 1.0 };
export const FLECKS = { per: 4, life: 2.6, reach: 1.9, rise: 1.5, size: 0.11, colour: '#dfe08a', kMin: 1.0 };
export const PRINT = { length: 1.25, width: 0.85, grow: 0.18, opacity: 0.42 };
export const BREATH = { per: 10, life: 0.9, size: 0.17, kMin: 0.336, colour: '#f4f8f2' };

const NORMAL = { blending: THREE.NormalBlending };

/** A soft dark oval, darkest in its middle (a canvas, drawn once). */
function printTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const fill = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  fill.addColorStop(0, 'rgba(46, 34, 18, 1)');
  fill.addColorStop(0.55, 'rgba(46, 34, 18, 0.7)');
  fill.addColorStop(1, 'rgba(46, 34, 18, 0)');
  g.fillStyle = fill;
  g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * `steps`: her footfalls, [{ t, at: Vector3 (the ground under the foot), yaw (radians: her heading) }]; `breaths`: [{ t, spread (m
 * the puff billows out) }]; `nostril(i, out)`: her nostril i (0, 1) in the world now; `headUp(out)`: her head's up now; `headAhead(out)`: the way her snout points now; `clampK(p,
 * kMin)`: p pushed back along the line of sight to k kMin if it is nearer (and returns it).
 */
export function createVfx(world, { steps, breaths, nostril, headUp, headAhead, clampK }) {
  const random = seededRandom('gramedla footfalls');
  // ---- the dust and the flecks: per step, each speck its own way out (an angle, a reach, a height) ----
  const ways = (n, count) => Array.from({ length: n * count }, () => ({ a: random() * Math.PI * 2, r: 0.45 + 0.55 * random(), h: 0.3 + 0.7 * random(), s: random() }));
  const dustWays = ways(steps.length, DUST.per);
  const fleckWays = ways(steps.length, FLECKS.per);
  const dustLook = { ...SPARKLE_LOOK, ...NORMAL, star: 0, glow: 0.62, falloff: 2.1, twinkle: 0, rim: 1, vary: 1, core: DUST.colour, rise: 0, drift: [0, 0] };
  const fleckLook = { ...SPARKLE_LOOK, star: 0, glow: 0.9, falloff: 2.4, twinkle: 0.5, rim: 1, vary: 1, rise: 0, drift: [0, 0] };
  const dust = glints(world, { count: Math.max(1, dustWays.length), life: DUST.life, spread: 0, fall: 0, size: DUST.size, colour: DUST.colour, seed: 'dust', look: dustLook });
  const flecks = glints(world, { count: Math.max(1, fleckWays.length), life: FLECKS.life, spread: 0, fall: 0, size: FLECKS.size, colour: FLECKS.colour, seed: 'flecks', look: fleckLook });
  dust.points.name = 'gramedla dust';
  flecks.points.name = 'gramedla flecks';
  dust.points.renderOrder = 11; // under the motes and the breath
  steps.forEach((s, i) => {
    for (let j = 0; j < DUST.per; j++) dust.birth[i * DUST.per + j] = s.t;
    for (let j = 0; j < FLECKS.per; j++) flecks.birth[i * FLECKS.per + j] = s.t + 0.04 * j;
  });
  dust.points.geometry.attributes.birth.needsUpdate = true;
  flecks.points.geometry.attributes.birth.needsUpdate = true;

  // ---- the prints: one flat soft patch each, at the foot, turned with her ----
  const map = printTexture();
  const printMaterial = new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, opacity: PRINT.opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const prints = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), printMaterial, Math.max(1, steps.length));
  prints.name = 'gramedla prints';
  prints.frustumCulled = false;
  prints.renderOrder = 2;
  world.scene.add(prints);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

  // ---- the breath: per puff of air, per nostril, a few soft white specks ----
  const breathLook = { ...SPARKLE_LOOK, ...NORMAL, core: BREATH.colour, star: 0, glow: 0.38, falloff: 2.2, twinkle: 0, rim: 1, vary: 1, rise: 0, drift: [0, 0] };
  const breathWays = breaths.map(() => [0, 1].map(() => Array.from({ length: BREATH.per }, () => ({ a: random() * Math.PI * 2, r: random(), s: 0.6 + 0.4 * random() }))));
  // one life and one speck size for every puff (the shader's); the huff is bigger by how far its specks billow out
  const breath = glints(world, { count: Math.max(1, breaths.length * 2 * BREATH.per), life: BREATH.life, spread: 0, fall: 0, size: BREATH.size, colour: BREATH.colour, seed: 'breath', look: breathLook });
  breath.points.name = 'gramedla breath';
  breath.points.renderOrder = 13;
  breath.points.material.depthTest = false; // always in front of her nostrils: never cut by her skin
  breaths.forEach((b, i) => { for (let j = 0; j < 2 * BREATH.per; j++) breath.birth[i * 2 * BREATH.per + j] = b.t; });
  breath.points.geometry.attributes.birth.needsUpdate = true;

  const p = new THREE.Vector3(), n = new THREE.Vector3(), up = new THREE.Vector3(), out = new THREE.Vector3(), side = new THREE.Vector3(), ahead = new THREE.Vector3();
  const HIDE = (set, i) => { set.position[i * 3] = 0; set.position[i * 3 + 1] = -500; set.position[i * 3 + 2] = 0; };
  const put = (set, i, v) => { set.position[i * 3] = v.x; set.position[i * 3 + 1] = v.y; set.position[i * 3 + 2] = v.z; };

  /** Everything where it is at second t of the show (`showing`: her head is posed this frame, so the breath can follow it). */
  function pose(t) {
    // dust and flecks: only the steps within their life move
    steps.forEach((s, i) => {
      const a = t - s.t;
      for (let j = 0; j < DUST.per; j++) {
        const idx = i * DUST.per + j;
        if (a < 0 || a > DUST.life) { HIDE(dust, idx); continue; }
        const w = dustWays[idx];
        const r = DUST.reach * w.r * (1 - Math.exp(-a / 0.32));
        const y = 0.12 + DUST.rise * w.h * (1 - Math.exp(-a / 0.28)) - 0.16 * a * a; // up and out, then settling
        p.set(s.at.x + Math.cos(w.a) * r, s.at.y + Math.max(0.06, y), s.at.z + Math.sin(w.a) * r * 0.8);
        put(dust, idx, clampK(p, DUST.kMin));
      }
      for (let j = 0; j < FLECKS.per; j++) {
        const idx = i * FLECKS.per + j;
        const b = a - 0.04 * j;
        if (b < 0 || b > FLECKS.life) { HIDE(flecks, idx); continue; }
        const w = fleckWays[idx];
        const r = FLECKS.reach * w.r * (1 - Math.exp(-b / 0.4));
        const y = FLECKS.rise * w.h * (1 - Math.exp(-b / 0.25)) - 0.3 * b * b + 0.08 * Math.sin(5 * b + 6 * w.s);
        p.set(s.at.x + Math.cos(w.a) * r + 0.12 * Math.sin(3 * b + w.a), s.at.y + Math.max(0.04, 0.1 + y), s.at.z + Math.sin(w.a) * r * 0.8);
        put(flecks, idx, clampK(p, FLECKS.kMin));
      }
      // the print: pressed in as the foot comes down, there to the end
      const grow = a < 0 ? 0 : Math.min(1, a / PRINT.grow);
      q.setFromAxisAngle(Y, s.yaw);
      sc.set(PRINT.length * grow + 1e-4, 1, PRINT.width * grow + 1e-4);
      prints.setMatrixAt(i, m4.compose(out.copy(s.at).setY(s.at.y + 0.03), q, sc));
    });
    // the breath: out of the nostrils, ahead of her snout and a little down and out to the side, billowing, gone within its life
    breaths.forEach((b, i) => {
      const a = t - b.t;
      for (let k = 0; k < 2; k++) {
        const live = a >= 0 && a <= BREATH.life;
        if (live) {
          nostril(k, n);
          headUp(up);
          headAhead(ahead);
          side.copy(n).sub(nostril(1 - k, out)).normalize(); // out of this nostril's side
        }
        for (let j = 0; j < BREATH.per; j++) {
          const idx = (i * 2 + k) * BREATH.per + j;
          if (!live) { HIDE(breath, idx); continue; }
          const w = breathWays[i][k][j];
          const e = 1 - Math.exp(-a / 0.22); // out fast, then it hangs
          const reach = b.spread * e * w.s;
          const billow = 0.35 * b.spread * e * w.r;
          p.copy(n)
            .addScaledVector(ahead, 0.75 * reach)
            .addScaledVector(up, -0.45 * reach + billow * Math.sin(w.a) + 0.1 * a)
            .addScaledVector(side, 0.3 * reach + billow * Math.cos(w.a));
          put(breath, idx, clampK(p, BREATH.kMin));
        }
      }
    });
    for (const set of [dust, flecks, breath]) {
      set.points.geometry.attributes.position.needsUpdate = true;
      set.uniforms.uTime.value = t;
    }
    prints.instanceMatrix.needsUpdate = true;
  }

  /** What is out of the screen this frame (for the measurements): the nearest k of the breath and of the dust and flecks. */
  function points() {
    const read = (set, n) => { const list = []; for (let i = 0; i < n; i++) if (set.position[i * 3 + 1] > -400) list.push(new THREE.Vector3(set.position[i * 3], set.position[i * 3 + 1], set.position[i * 3 + 2])); return list; };
    return { dust: read(dust, dustWays.length), flecks: read(flecks, fleckWays.length), breath: read(breath, breaths.length * 2 * BREATH.per) };
  }
  return { pose, points, dust, flecks, breath, prints };
}
