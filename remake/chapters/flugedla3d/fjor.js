// Flugeðla og fiðrildið's fast trial (?chapter=flugedla3d&profa=fjor): the owner's "meiri hraða, gegnum tré … DJ eðla" of
// 2026-11-16 (the plan's section 12). One take of 56 beats of her set (125 bpm: 26.88 s) that loops: a sprint through the trees at
// 17-19 m/s with her weaving behind us and swooshing at us, two snap turns and a barrel roll, the butterfly shooting up and the
// climb into the cloud at 24 m/s, a float over the cloud sea, the dive at 29 m/s with the peak at our nose, and the pull-out low
// over the forest. Pure: the page, the layout and the tests read the same numbers.
//
// The camera flies backwards (it looks at her) along its route (route.js makeRoute: back, up, turn), its height over the forest
// floor smoothed by the page; it banks into its turns (roll from the turn rate), looks up in the climb and down in the dive (pitch),
// and its height skips inside the full white. In the forest she flies ON the camera's path, d metres behind it (so a turn swings her
// across the picture as the path bends); in the open air she is placed in the picture itself. The butterfly is always placed in the
// picture, darting.
import { makeRoute } from './route.js';

export const BPM = 125;
export const BEAT = 60 / BPM; // 0.48 s
export const BEATS = 56;
export const LENGTH = BEATS * BEAT; // 26.88 s
export const LOW = 3.8; // m over the forest floor: the ground at a 16:10 bottom edge at k 0.69 (D 13), a 4:3 one at k 0.57
// where the take starts (the world's x, z) and the set's beat it starts on (the drop "NÚ!" at the set's beat 296 lands on beat 30
// here, the butterfly shooting up)
export const START = { x: -95, z: -150 };
export const SET_BEAT = 266;
export const CLOUD_Y = { lo: 77, hi: 103, ease: 9 }; // route.js CLOUD (base 84, top 96, 7 m clear, 9 m ease), over the lane's ground
export const WHITE = { up: 0.5, down: 0.5 }; // s of full white on the screen each way: the height skips in it
const at = b => b * BEAT;

// ---- the camera ----
const LEVEL = 19.3; // the climb levels off
const TIP = at(43); // 20.64: she tips over, the dive
const rates = pull => [
  { t: -1, over: 0.5, back: 17 },
  { t: 1.0, over: 1.0, back: 19 },
  // the weave through the trunks
  { t: 0.9, over: 0.6, turn: 18 }, { t: 2.4, over: 0.6, turn: -18 }, { t: 4.3, over: 0.6, turn: 18 }, { t: 6.2, over: 0.6, turn: -18 }, { t: 8.0, over: 0.6, turn: 0 },
  // two snap turns, left then right (60 degrees a second, eased over 0.3 s)
  { t: at(20), over: 0.3, turn: -60 }, { t: at(22.3), over: 0.3, turn: 0 },
  { t: at(24), over: 0.3, turn: 60 }, { t: at(25.6), over: 0.3, turn: 0 },
  // the climb: slower backwards, 24 m/s up
  { t: 13.9, over: 1.0, back: 6 },
  { t: at(30), over: 1.0, up: 24 },
  { t: LEVEL, over: 1.0, up: 0 },
  { t: 19.5, over: 1.0, back: 7 },
  // the dive at 29 m/s, then the pull-out low and fast
  { t: TIP, over: 0.8, up: -29 },
  { t: pull, over: 1.3, up: 0 },
  { t: pull + 0.3, over: 1.0, back: 18 },
];
const ROUTE_START = { x: START.x, y: LOW, z: START.z, yaw: 0 };
function withJumps(pull) {
  const list = rates(pull);
  const plain = makeRoute(list, { start: ROUTE_START, length: LENGTH, dt: 1 / 120 });
  let t = at(30);
  while (plain.at(t).y < CLOUD_Y.lo) t += 1 / 240;
  const jUp = { t: t + WHITE.up / 2, jump: (CLOUD_Y.hi - CLOUD_Y.lo) - plain.at(t).up * WHITE.up };
  const climbed = makeRoute([...list, jUp], { start: ROUTE_START, length: LENGTH, dt: 1 / 120 });
  t = TIP;
  while (climbed.at(t).y > CLOUD_Y.hi) t += 1 / 240;
  const jDown = { t: t + WHITE.down / 2, jump: -((CLOUD_Y.hi - CLOUD_Y.lo) + climbed.at(t).up * WHITE.down) };
  return [...list, jUp, jDown];
}
// the pull-out's second that brings the camera back to LOW over the floor (a later pull goes lower)
export const PULL = (() => {
  let a = 21.5, b = 25.5;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    const r = makeRoute(withJumps(m), { start: ROUTE_START, length: LENGTH, dt: 1 / 120 });
    let low = Infinity;
    for (let t = m; t <= LENGTH; t += 0.05) low = Math.min(low, r.at(t).y);
    if (low < LOW) b = m; else a = m;
  }
  return (a + b) / 2;
})();
export const FJOR_CHANGES = withJumps(PULL);
export const fjorRoute = () => makeRoute(FJOR_CHANGES, { start: ROUTE_START, length: LENGTH + 1, dt: 1 / 120 });

const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
/** An eased channel: [{ t, over, v }] from 0, each easing from where it is to v over `over` s. */
export function channel(list, start = 0) {
  return t => {
    let v = start;
    for (const c of list) {
      if (t <= c.t) break;
      v = lerp(v, c.v, smooth((t - c.t) / c.over));
    }
    return v;
  };
}
// the camera's pitch (degrees, + looks up): up after the butterfly in the climb, level over the cloud, down in the dive
export const PITCH = channel([
  { t: at(29.6), over: 0.6, v: 22 }, { t: 18.0, over: 0.6, v: 6 }, { t: LEVEL, over: 0.8, v: 0 },
  { t: TIP - 0.2, over: 0.6, v: -25 }, { t: PULL - 0.2, over: 1.2, v: -4 }, { t: PULL + 1.2, over: 0.8, v: 0 },
]);
/** The camera at trial second t: the route's place and heading, its pitch and roll (roll: + leans the view right, into a right turn). */
export function cameraAt(route, t) {
  const p = route.at(t);
  const turn = route.rates.turn(t - 0.08);
  const roll = Math.max(-20, Math.min(20, turn / 3));
  return { ...p, pitch: PITCH(t), roll };
}

/** The whole take's numbers for the hand-back: its speeds and the camera's greatest rates. */
export function cameraStats(route, dt = 1 / 120) {
  let yaw = 0, roll = 0, pitch = 0, back = 0, up = 0, down = 0;
  let last = cameraAt(route, 0);
  for (let t = dt; t <= LENGTH; t += dt) {
    const c = cameraAt(route, t);
    yaw = Math.max(yaw, Math.abs(c.yaw - last.yaw) / dt);
    roll = Math.max(roll, Math.abs(c.roll - last.roll) / dt);
    pitch = Math.max(pitch, Math.abs(c.pitch - last.pitch) / dt);
    back = Math.max(back, c.back); up = Math.max(up, c.up); down = Math.max(down, -c.up);
    last = c;
  }
  return { yawRate: +yaw.toFixed(1), rollRate: +roll.toFixed(1), pitchRate: +pitch.toFixed(1), back, up, down, maxRoll: 20, maxPitch: 25 };
}

// ---- the path: the camera's own track over the ground, by distance flown (horizontally) ----
export function pathOf(route, dt = 1 / 60) {
  const pts = [];
  let s = 0, last = null;
  for (let t = 0; t <= route.length + 1e-9; t += dt) {
    const p = route.at(t);
    if (last) s += Math.hypot(p.x - last.x, p.z - last.z);
    pts.push({ t, s, x: p.x, y: p.y, z: p.z, yaw: p.yaw });
    last = p;
  }
  /** The camera's second when it had flown s metres. */
  const timeAt = s0 => {
    if (s0 <= 0) return 0;
    let lo = 0, hi = pts.length - 1;
    if (s0 >= pts[hi].s) return pts[hi].t;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].s < s0) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi];
    return lerp(a.t, b.t, (s0 - a.s) / Math.max(1e-9, b.s - a.s));
  };
  const sAt = t => {
    const i = Math.min(pts.length - 1, Math.max(0, Math.round(t / dt)));
    return pts[i].s;
  };
  return { pts, timeAt, sAt, length: pts.at(-1).s };
}

// ---- her ----
const TAU = 2 * Math.PI;
// her distance behind us along the path (m, her body's middle; her nearest point is about 3 m nearer us) in the forest: weaving at
// 9.5, three swooshes at us landing on the beat (to 6.5: her nearest point about 5.4 % out), a drop back behind the screen and a
// rocket up at us, a lunge at the butterfly; the barrel roll out of the second snap turn. Each change lands on its beat.
const land = (beat, over, v) => ({ t: at(beat) - over, over, v });
const D_HER = channel([
  land(6, 0.45, 7), land(7.4, 0.6, 9.5), // swoosh 1 (beat 6)
  land(9.6, 0.6, 16), land(12, 0.55, 7), land(13.6, 0.6, 9.5), // back behind the screen, then a rocket up at us (beat 12)
  land(17, 0.4, 7.6), land(18.4, 0.6, 9.5), // the lunge at the butterfly (beat 17)
  land(26, 0.4, 10), land(28.4, 0.6, 9.5),
], 9.5);
const ROLL_HER = channel([{ t: at(26), over: at(2), v: 360 }]); // the barrel roll (beats 26-28)
// open air: where she is in the picture (blend 1) from the climb to the end (the take ends over open ground)
const AIR = channel([{ t: 14.9, over: 0.7, v: 1 }]);
const AIR_BODY = [
  // [second, u, v, k, over]: rocketing up from under the picture after the butterfly, beside us over the cloud, ahead in the dive
  [14.9, 0.5, 0.75, 0.9, 0.01], [16.0, 0.5, 0.62, 0.66, 1.0], [17.0, 0.42, 0.58, 0.6, 1.2], [18.6, 0.55, 0.5, 0.72, 1.0],
  [LEVEL + 0.4, 0.38, 0.58, 0.66, 1.0], [TIP, 0.6, 0.55, 0.8, 1.2], [22.9, 0.5, 0.6, 0.75, 1.2],
  // the peak as the white clears: her beak about 4 % out, the butterfly at our nose, held about 1.5 s into the pull-out
  [23.4, 0.5, 0.6, 0.56, 0.5], [24.7, 0.5, 0.58, 0.56, 0.1],
  // peeling away to the side, then weaving over the open ground
  [25.4, 0.7, 0.52, 0.8, 0.7], [26.2, 0.45, 0.55, 0.68, 0.8],
];
const track3 = list => t => {
  let s = list[0].slice(1, 4);
  for (const [t1, u, v, k, over] of list.slice(1)) {
    if (t <= t1 - over) break;
    const e = smooth((t - (t1 - over)) / over);
    s = [lerp(s[0], u, e), lerp(s[1], v, e), lerp(s[2], k, e)];
  }
  return s;
};
const airBody = track3(AIR_BODY);

/**
 * Her at trial second t: { path: { d, side, lift } (metres behind us on the path, to the path's right, up), air: [u, v, k] of her
 * body in the picture, blend (0 path, 1 air), pose: { yaw, pitch, bank, sweep, neck, clip, at } }.
 */
export function herAt(t, cam) {
  const d = D_HER(t);
  // the weave: side to side on the path, banked hard into it (a 4-beat cycle)
  const ph = TAU * t / (4 * BEAT);
  const weave = t < at(20) ? 1 : t < at(26) ? 0.35 : 0.6;
  const side = weave * 0.6 * Math.sin(ph);
  const bankWeave = -weave * 62 * Math.cos(ph);
  const blend = AIR(t);
  const roll = ROLL_HER(t);
  // in a snap turn she banks with it (the camera's turn rate a little before)
  const turnBank = (cam?.turnBefore ?? 0) * 1.1;
  let pose = { yaw: 0, pitch: 4, bank: bankWeave + turnBank + roll, sweep: 0, neck: 0, clip: 'fly', at: t * 1.7 };
  if (blend > 0) {
    // open air: climbing hard after the butterfly, gliding above the cloud, diving swept back (key 7b), braking out of it
    // (her pitch is the world's: the camera looks up 22 degrees in the climb and down 25 in the dive, and she faces it)
    const climb = t < LEVEL ? 1 : 0, dive = t >= TIP - 0.3 && t < 24.7 ? 1 : 0;
    const air = climb ? { pitch: 62, bank: 0, sweep: 55, clip: 'fly', at: t * 2.1 }
      : dive ? { pitch: 8, bank: 0, sweep: 70, neck: 18, clip: 'glide', at: 0 }
        : t < TIP ? { pitch: 6, bank: 35 * Math.sin(TAU * t / 3.84), sweep: 20, clip: 'glide', at: 0 }
          : { pitch: 14, bank: -60 * Math.sin(TAU * (t - 24.7) / 3.84), sweep: 20, clip: 'fly', at: t * 1.8 };
    pose = blend >= 0.5 ? { ...pose, ...air } : pose;
  }
  return { path: { d, side, lift: -0.6 + 0.5 * Math.sin(ph * 0.5) }, air: airBody(t), blend, pose };
}

// ---- the butterfly: darting all over the picture ----
// [second, u, v, k, over]: its darts on top of a restless wander; to our nose (k 0.27-0.3: 5-5.4 % out) and back toward her beak
const DARTS = channel([
  // to our nose, a little ahead of each swoosh of hers (beats 6, 12, 17), and once on its own (beat 19)
  { t: at(5.2), over: 0.3, v: 1 }, { t: at(6.6), over: 0.4, v: 0 },
  { t: at(11.2), over: 0.3, v: 1 }, { t: at(12.6), over: 0.4, v: 0 },
  { t: at(16.2), over: 0.3, v: 1 }, { t: at(17.6), over: 0.4, v: 0 },
  { t: at(18.8), over: 0.3, v: 1 }, { t: at(20), over: 0.4, v: 0 },
  { t: 22.6, over: 0.5, v: 1 }, { t: 24.6, over: 0.4, v: 0 }, // the peak, held about 1.5 s
]);
const SHOOT = channel([{ t: at(29.6), over: 0.5, v: 1 }, { t: at(31.5), over: 0.8, v: 0 }]); // it shoots straight up (beat 30)
/** The butterfly at trial second t: { at: [u, v, k], yaw, pitch, flap }. */
export function butterflyAt(t, her) {
  const u = 0.5 + 0.2 * Math.sin(TAU * t / 2.3) + 0.06 * Math.sin(TAU * t / 0.77);
  const v = 0.45 + 0.12 * Math.sin(TAU * t / 1.9 + 1) + 0.04 * Math.sin(TAU * t / 0.61);
  let k = 0.55 + 0.1 * Math.sin(TAU * t / 3.1);
  // in the forest it keeps ahead of her (nearer us than her beak by 1.5 m or more), or darts aside when she swooshes in
  const dart = DARTS(t);
  const shoot = SHOOT(t);
  const near = her && her.blend < 0.5 ? (her.path.d - 4) / 13 : her ? her.air[2] - 0.3 : 0.6;
  let uu = u, vv = v - 0.3 * shoot;
  k = Math.max(0.3, Math.min(k, near));
  k = lerp(k, 0.285, dart);
  uu = lerp(uu, 0.5 + 0.04 * Math.sin(TAU * t / 0.9), dart);
  vv = lerp(vv, her && her.blend < 0.5 ? 0.36 : 0.42, dart); // above her face
  const flap = 0.3 + 0.9 * Math.abs(Math.sin(TAU * 5 * t));
  return { at: [uu, vv, Math.max(0.27, k)], yaw: 25 * Math.sin(TAU * t / 1.3), pitch: -15 * shoot + 30 * shoot, flap };
}

// ---- the forest along the path: trunks whipping past 3-5 m from the camera's line, the floor's trees round them ----
let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** The plants (layout.plants form) along the path where the camera is low: whip trunks, then a wood round them, kept off the line. */
export function fjorPlants(path) {
  seed = 5;
  const out = [];
  const lowAt = s => { const t = path.timeAt(s); const p = path.pts[Math.min(path.pts.length - 1, Math.round(t * 60))]; return p.y < 12 ? p : null; };
  // (where the camera climbs or comes down through the canopy, a glade: 9 m more)
  const clear = (x, z, r) => !path.pts.some(q => q.y < 30 && Math.hypot(x - q.x, z - q.z) < r + (q.y > 6 ? 9 : 0));
  let side = 1;
  // whip trunks: every 5 to 7 m along the low path, alternating sides, 3.3 to 4.8 m off the line
  for (let s = 6; s < path.length; s += 5 + rnd() * 2) {
    const p = lowAt(s);
    if (!p) continue;
    side = -side;
    const off = 3.6 + rnd() * 1.4;
    const psi = (p.yaw * Math.PI) / 180, c = Math.cos(psi), sn = Math.sin(psi);
    const x = p.x + side * c * off, z = p.z + side * sn * off;
    if (!clear(x, z, 3.2)) continue;
    const araucaria = rnd() < 0.45;
    out.push({ name: araucaria ? 'araucaria' : 'broadleaf', position: [x, z], variant: Math.floor(rnd() * 8), scale: 0.95 + 0.25 * rnd(), rot: rnd() * 6.28, whip: true });
  }
  // the wood round the line: a jittered grid out to 40 m from it
  for (let s = 0; s < path.length; s += 6.5) {
    const p = path.pts[Math.min(path.pts.length - 1, Math.round(path.timeAt(s) * 60))]; // under the climb and the dive too
    if (!p) continue;
    const psi = (p.yaw * Math.PI) / 180, c = Math.cos(psi), sn = Math.sin(psi);
    for (let off = 8; off < 40; off += 6 + rnd() * 2) {
      for (const sd of [-1, 1]) {
        const o = off + rnd() * 3, along = (rnd() - 0.5) * 5;
        const x = p.x + sd * c * o - sn * along, z = p.z + sd * sn * o + c * along;
        if (!clear(x, z, 6.5)) continue;
        const araucaria = rnd() < 0.3;
        out.push({ name: araucaria ? 'araucaria' : 'broadleaf', position: [x, z], variant: Math.floor(rnd() * 8), scale: 0.95 + 0.3 * rnd(), rot: rnd() * 6.28 });
      }
    }
  }
  return out;
}

/** Nothing grows on the line itself (3 m to each side) where the camera is low. */
export function fjorKeepOut(path) {
  return (x, z) => (path.pts.some(q => q.y < 30 && Math.hypot(x - q.x, z - q.z) < 3 + (q.y > 6 ? 12 : 0)) ? 1 : 0);
}
