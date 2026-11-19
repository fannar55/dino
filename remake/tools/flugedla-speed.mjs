// How fast the nearest trunks cross the picture (degrees a second), from the pure data: the step-1 bend trial (the film's camera,
// stage.js's planted lane walls) beside the fast take (fjor.js and its planted wood). Each frame's fastest trunk (its point at the
// camera's height, inside the 16:10 frame, nearer than 40 m), the take's fastest and the median of the frames' fastest.
//
//   node remake/tools/flugedla-speed.mjs
import { filmRoute } from '../chapters/flugedla3d/route.js';
import { plants } from '../chapters/flugedla3d/stage.js';
import { LENGTH, cameraAt } from '../chapters/flugedla3d/fjor.js';
import { FJOR_ROUTE, FJOR_LAYOUT } from '../chapters/flugedla3d/fjor-stage.js';

const tanV = Math.tan((23 * Math.PI) / 180), tanH = tanV * 1.6;
function basis(c) {
  const y = (c.yaw * Math.PI) / 180, p = ((c.pitch ?? 0) * Math.PI) / 180, a = -((c.roll ?? 0) * Math.PI) / 180;
  const f = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
  const r0 = [Math.cos(y), 0, Math.sin(y)];
  const u0 = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]];
  return { f, right: r0.map((v, i) => v * Math.cos(a) + u0[i] * Math.sin(a)), up: u0.map((v, i) => -r0[i] * Math.sin(a) + v * Math.cos(a)), p: [c.x, c.y, c.z] };
}
function sweep(name, camAt, from, to, trunks, dt = 1 / 30) {
  let prev = new Map(), best = { w: 0 };
  const frames = [];
  for (let t = from; t <= to; t += dt) {
    const c = camAt(t), b = basis(c);
    const now = new Map();
    let most = 0;
    for (const [i, [x, z]] of trunks.entries()) {
      const d = [x - c.x, 0, z - c.z];
      const dot = v => d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
      const vx = dot(b.right), vy = dot(b.up), vz = dot(b.f);
      const n = Math.hypot(vx, vy, vz);
      if (vz <= 0 || n > 40 || Math.abs(vx) > tanH * vz || Math.abs(vy) > tanV * vz) continue;
      const dir = [vx / n, vy / n, vz / n];
      now.set(i, dir);
      const l = prev.get(i);
      if (l) most = Math.max(most, (Math.acos(Math.min(1, dir[0] * l[0] + dir[1] * l[1] + dir[2] * l[2])) * 180) / Math.PI / dt);
    }
    prev = now;
    frames.push(most);
    if (most > best.w) best = { w: most, t };
  }
  const sorted = frames.filter(w => w > 0).sort((a, b) => a - b);
  console.log(`${name}: fastest ${best.w.toFixed(0)} deg/s (at ${best.t.toFixed(2)} s); the frames' fastest: median ${sorted[Math.floor(sorted.length / 2)].toFixed(0)} deg/s, 90th percentile ${sorted[Math.floor(sorted.length * 0.9)].toFixed(0)} deg/s`);
}
const film = filmRoute(); // (the bend trial was the film's seconds 28.5-41.5; the trial itself is gone)
sweep('the bend trial (step 1, 6 m/s, lane walls from 15.5 m)', t => film.at(t), 28.5, 41.5, plants().map(p => p.position));
sweep('the fast take (17-19 m/s in the forest)', t => cameraAt(FJOR_ROUTE, t), 0, LENGTH, FJOR_LAYOUT.plants.map(p => p.position));
