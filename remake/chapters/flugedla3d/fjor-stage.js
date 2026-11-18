// The fast trial's world (?chapter=flugedla3d&profa=fjor; fjor.js): its own layout, laid round its own flight line, so the key
// frames and the two step-1 trials keep theirs (stage.js). The line runs through a wood planted along it (fjor.js fjorPlants): trunks
// whipping past 3.3-4.8 m from the camera's line, the wood beyond, the generator's forest round its clearing in the middle of it.
// The leaveOut keeps every crown at least CROWN_GAP from the line (her wings, banked in the weave, reach about 2.5 m from it) and
// every trunk that is not a whip trunk 3 m from it.
import { fjorRoute, pathOf, fjorPlants, fjorKeepOut } from './fjor.js';
import { LAYOUT, cloudBalls, sweptHit } from './stage.js';

export const FJOR_ROUTE = fjorRoute();
export const FJOR_PATH = pathOf(FJOR_ROUTE);
export const CROWN_GAP = 4.5;
// the low line, every metre or so (for the leaveOut's distances)
const LINE = (() => {
  const out = [];
  let last = null;
  for (const q of FJOR_PATH.pts) {
    if (q.y > 30) continue;
    if (last && Math.hypot(q.x - last.x, q.z - last.z) < 1) continue;
    out.push(last = q);
  }
  return out;
})();
// (from a second before the climb, when the camera looks up under the canopy)
const GLADE = FJOR_PATH.pts.filter((q, i) => i % 6 === 0 && q.y < 30 && q.t > 13.4);
/** The nearest the low line comes to (x, y, z) (y over the floor), and to (x, z) alone. */
export function lineGap(x, y, z) {
  let d3 = Infinity, d2 = Infinity;
  for (const q of LINE) {
    const h = Math.hypot(x - q.x, z - q.z);
    if (h > 40) continue;
    d2 = Math.min(d2, h);
    d3 = Math.min(d3, Math.hypot(h, y - q.y));
  }
  return { d3, d2 };
}

function leaveOut(info, p) {
  if (!p?.model) return false;
  const m = p.model, sc = p.scale ?? 1, c = Math.cos(p.rot ?? 0), s = Math.sin(p.rot ?? 0);
  const cr = m.crown;
  if (cr) {
    const cx = p.x + (cr.c[0] * c - cr.c[2] * s) * sc, cz = p.z + (cr.c[0] * s + cr.c[2] * c) * sc;
    if (lineGap(cx, cr.c[1] * sc, cz).d3 - Math.max(cr.r, cr.ry ?? cr.r) * sc < CROWN_GAP) return true;
  }
  // (round 2: no broadleaf within 18 m of the line: its low crown hangs at the top edge over the camera; tall slim trees only)
  if ((info?.name ?? p.name) === 'broadleaf' && lineGap(p.x, 1, p.z).d2 < 18) return true;
  const r = (m.trunk?.r ?? 0.4) * sc;
  if (lineGap(p.x, 1, p.z).d2 - r < 2.9) return true;
  // the glade where the camera climbs or comes down through the canopy
  if (GLADE.some(q => Math.hypot(p.x - q.x, p.z - q.z) < ((info?.name ?? p.name) === 'broadleaf' ? 22 : 12))) return true;
  return false;
}

const MID = (() => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of FJOR_PATH.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  return [(x0 + x1) / 2, (z0 + z1) / 2];
})();
const keepOut = fjorKeepOut(FJOR_PATH);
export const FJOR_LAYOUT = {
  ...LAYOUT,
  clearing: { center: MID, radius: 4 },
  path: [[MID[0] + 30, MID[1] + 30], [MID[0] + 40, MID[1] + 40]],
  keepOut,
  lifeKeepOut: keepOut,
  leaveOut,
  plants: fjorPlants(FJOR_PATH),
};

// the cloud's balls, kept out of the near picture from this take's places too (1/40 s apart: it climbs at 24 m/s, dives at 29)
const POSES = (() => {
  const out = [];
  for (let t = 0; t <= FJOR_ROUTE.length + 1e-9; t += 1 / 40) {
    const p = FJOR_ROUTE.at(t), psi = (p.yaw * Math.PI) / 180;
    out.push({ t, x: p.x, y: p.y, z: p.z, s: Math.sin(psi), c: Math.cos(psi) });
  }
  return out;
})();
export const fjorCloudBalls = () => cloudBalls().filter(([x, y, z, r]) => sweptHit([x, y, z], r, { list: POSES }) === null);
