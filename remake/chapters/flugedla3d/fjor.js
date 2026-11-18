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
  // two snap turns, left then right (60 degrees a second, eased over 0.3 s; round 2: earlier, so the second hold follows them)
  { t: at(18), over: 0.3, turn: -60 }, { t: at(20.3), over: 0.3, turn: 0 },
  { t: at(21.5), over: 0.3, turn: 60 }, { t: at(23.1), over: 0.3, turn: 0 },
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
// Round 2 (2026-11-18, "3D effect er mest á fiðrildi"): the screen plane goes back to FJOR_D (her whole body comes out in front of
// it) and she flies nearer; three holds where she hangs steady in the picture, big, bobbing her head on the beat, while the forest
// streams past; her swooshes come on a diagonal (yawed, one wing toward us). Her beak reaches about 3 m in front of her chest, so
// the chest's out is bounded by the beak's 6 %: her neck is drawn back a little (neck < 0) to win some of it.
export const FJOR_D = 17.5;
// her distance behind us along the path (m, her chest) in the forest. Each change lands on its beat.
const land = (beat, over, v) => ({ t: at(beat) - over, over, v });
const D_HER = channel([
  land(6, 0.45, 7.2), land(7.2, 0.5, 8.4), // swoosh 1 (beat 6), on a diagonal; then the first hold (in the picture)
  land(16, 0.45, 7.2), land(17, 0.45, 8.4), // swoosh 2 (beat 16), the other diagonal
  land(18.5, 0.5, 19), land(20.5, 0.55, 7.6), land(21.6, 0.5, 8.4), // back behind the screen, then a rocket at us (beat 20.5)
], 8.4);
const ROLL_HER = channel([{ t: at(21.6), over: at(2), v: 360 }]); // the barrel roll (beats 21.6-23.6), out of the rocket
// her yaw to the camera (degrees): the diagonals
const YAW_HER = channel([
  { t: at(6) - 0.5, over: 0.45, v: 35 }, { t: at(6) + 0.1, over: 0.5, v: 0 },
  { t: at(16) - 0.5, over: 0.45, v: -35 }, { t: at(16) + 0.1, over: 0.5, v: 0 },
  { t: at(20.5) - 0.6, over: 0.5, v: 40 }, { t: at(20.5) + 0.15, over: 0.5, v: 0 },
]);
// in the picture (blend 1): the first hold, the second (after the snap turns), then from the climb to the end
export const HOLDS = [[3.85, 6.9], [11.45, 14.4], [23.3, 26.0]];
const AIR = channel([{ t: 3.4, over: 0.45, v: 1 }, { t: 6.9, over: 0.5, v: 0 }, { t: 11.0, over: 0.45, v: 1 }]);
const HOLD_K = 0.46; // her chest at the holds: 8 m (+2.35 %; her beak about 5 %)
const AIR_BODY = [
  // [second, u, v, k, over] (k at FJOR_D): the first hold, the second
  [3.4, 0.5, 0.56, HOLD_K, 0.01], [11.0, 0.5, 0.56, HOLD_K, 0.01],
  // rocketing up after the butterfly, beside us over the cloud, ahead in the dive
  [15.0, 0.5, 0.7, 0.62, 0.6], [16.0, 0.5, 0.62, 0.5, 0.9], [17.0, 0.42, 0.58, 0.47, 1.0], [18.6, 0.55, 0.5, 0.56, 1.0],
  [LEVEL + 0.4, 0.38, 0.58, 0.5, 1.0], [TIP, 0.6, 0.55, 0.6, 1.2], [22.85, 0.5, 0.58, 0.5, 1.2],
  // the peak as the white clears: held in front of us into the pull-out
  [23.3, 0.5, 0.57, HOLD_K, 0.45], [26.0, 0.5, 0.57, HOLD_K, 0.01],
  // peeling away to the side, back to her path distance for the loop
  [26.5, 0.72, 0.52, 0.6, 0.5], [26.88, 0.5, 0.55, 0.48, 0.38],
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
  const weave = t < at(18) ? 1 : 0.5;
  const yaw = YAW_HER(t);
  const diag = Math.min(1, Math.abs(yaw) / 35);
  const side = weave * 0.6 * Math.sin(ph) * (1 - diag);
  // banked hard into the weave (and in a diagonal, banked into it: the near wing down and toward us)
  const bankWeave = -weave * 62 * Math.cos(ph) * (1 - diag) + Math.sign(yaw) * 55 * diag;
  const blend = AIR(t);
  const roll = ROLL_HER(t);
  // in a snap turn she banks with it (the camera's turn rate a little before)
  const turnBank = (cam?.turnBefore ?? 0) * 1.1;
  // her head bobs on the beat (the DJ), drawn back a little
  const bob = -10 - 9 * Math.abs(Math.sin((Math.PI * t) / BEAT));
  let pose = { yaw, pitch: 4, bank: bankWeave + turnBank + roll, sweep: 0, neck: -8, clip: 'fly', at: t * 1.7 };
  if (blend > 0) {
    // a hold: hanging in front of us, level, looking at us, bobbing; a slow sway of her wings' tilt
    const hold = HOLDS.some(([a, b]) => t >= a - 0.5 && t < b + 0.3) && !(t >= 14.4 && t < 23.0);
    // open air: climbing hard after the butterfly, gliding above the cloud, diving swept back (key 7b), braking out of it
    // (her pitch is the world's: the camera looks up 22 degrees in the climb and down 25 in the dive, and she faces it)
    const climb = t >= 14.4 && t < LEVEL ? 1 : 0, dive = t >= TIP - 0.3 && t < 23.0 ? 1 : 0;
    const air = hold ? { yaw: 0, pitch: t > 20 ? 10 : 4, bank: 12 * Math.sin(TAU * t / (4 * BEAT)) + roll, sweep: 40, neck: bob, clip: 'fly', at: t * 1.5 }
      : climb ? { yaw: 0, pitch: 62, bank: 0, sweep: 55, neck: 0, clip: 'fly', at: t * 2.1 }
        : dive ? { yaw: 0, pitch: 8, bank: 0, sweep: 70, neck: 10, clip: 'glide', at: 0 }
          : t < TIP ? { yaw: 0, pitch: 6, bank: 35 * Math.sin(TAU * t / 3.84), sweep: 20, neck: -6, clip: 'glide', at: 0 }
            : { yaw: 25, pitch: 14, bank: -60 * Math.sin(TAU * (t - 26.0) / 3.84), sweep: 20, neck: -6, clip: 'fly', at: t * 1.8 };
    pose = blend >= 0.5 ? { ...pose, ...air } : pose;
  }
  return { path: { d, side, lift: -0.6 + 0.5 * Math.sin(ph * 0.5) }, air: airBody(t), blend, pose };
}

// ---- the butterfly: darting all over the picture ----
// [second, u, v, k, over]: its darts on top of a restless wander; to our nose (k 0.27-0.3: 5-5.4 % out) and back toward her beak
const DARTS = channel([
  // to our nose: once in each hold (and twice in the first), and a little ahead of the second swoosh and the rocket
  { t: at(8.6), over: 0.3, v: 1 }, { t: at(10), over: 0.4, v: 0 },
  { t: at(12.2), over: 0.3, v: 1 }, { t: at(13.6), over: 0.4, v: 0 },
  { t: at(15.2), over: 0.3, v: 1 }, { t: at(16.6), over: 0.4, v: 0 },
  { t: at(19.6), over: 0.3, v: 1 }, { t: at(21), over: 0.4, v: 0 },
  { t: at(25), over: 0.3, v: 1 }, { t: at(26.4), over: 0.4, v: 0 },
  { t: 23.4, over: 0.4, v: 1 }, { t: 24.4, over: 0.4, v: 0 }, // the peak
]);
const SHOOT = channel([{ t: at(29.6), over: 0.5, v: 1 }, { t: at(31.5), over: 0.8, v: 0 }]); // it shoots straight up (beat 30)
/** The butterfly at trial second t: { at: [u, v, k], yaw, pitch, flap }. */
export function butterflyAt(t, her, D = FJOR_D) {
  const u = 0.5 + 0.2 * Math.sin(TAU * t / 2.3) + 0.06 * Math.sin(TAU * t / 0.77);
  const v = 0.45 + 0.12 * Math.sin(TAU * t / 1.9 + 1) + 0.04 * Math.sin(TAU * t / 0.61);
  let k = 0.55 + 0.1 * Math.sin(TAU * t / 3.1);
  // in the forest it keeps ahead of her (nearer us than her beak by 1.5 m or more), or darts aside when she swooshes in
  const dart = DARTS(t);
  const shoot = SHOOT(t);
  // (nearer us than her beak, about 3 m in front of her chest, by 0.6 m or more)
  const near = her && her.blend < 0.5 ? (her.path.d - 3.6) / D : her ? (her.air[2] * FJOR_D - 3.6) / D : 0.6;
  let uu = u, vv = v - 0.3 * shoot;
  k = Math.max(0.28, Math.min(k, near));
  k = lerp(k, 0.285, dart);
  // (to our nose beside her face, a little to her right of it and above it)
  uu = lerp(uu, 0.6 + 0.04 * Math.sin(TAU * t / 0.9), dart);
  vv = lerp(vv, her && her.blend < 0.5 ? 0.36 : 0.36, dart);
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
  const clear = (x, z, r) => !path.pts.some(q => q.y < 30 && Math.hypot(x - q.x, z - q.z) < r + (q.t > 13.4 ? 9 : 0));
  let side = 1;
  // whip trunks: every 5 to 7 m along the low path, alternating sides, 3.3 to 4.8 m off the line
  for (let s = 6; s < path.length; s += 5 + rnd() * 2) {
    const p = lowAt(s);
    if (!p) continue;
    side = -side;
    const off = 4.2 + rnd() * 1.2;
    const psi = (p.yaw * Math.PI) / 180, c = Math.cos(psi), sn = Math.sin(psi);
    const x = p.x + side * c * off, z = p.z + side * sn * off;
    if (!clear(x, z, 3.2)) continue;
    // (round 2: only tall slim trunks along the line, their crowns high over the camera: stage.js's SLIM)
    rnd();
    out.push({ name: 'araucaria', position: [x, z], variant: Math.floor(rnd() * 8), scale: 1.2 + 0.2 * rnd(), rot: rnd() * 6.28, whip: true });
  }
  // the wood round the line: a jittered grid out to 40 m from it
  for (let s = 0; s < path.length; s += 6.5) {
    const p = path.pts[Math.min(path.pts.length - 1, Math.round(path.timeAt(s) * 60))]; // under the climb and the dive too
    if (!p) continue;
    const psi = (p.yaw * Math.PI) / 180, c = Math.cos(psi), sn = Math.sin(psi);
    for (let off = 8; off < 32; off += 6 + rnd() * 2) {
      for (const sd of [-1, 1]) {
        const o = off + rnd() * 3, along = (rnd() - 0.5) * 5;
        const x = p.x + sd * c * o - sn * along, z = p.z + sd * sn * o + c * along;
        if (!clear(x, z, 6.5)) continue;
        // (near the line only tall slim trees: a broadleaf's low crown there hangs at the top edge over the camera)
        const araucaria = o < 16 || rnd() < 0.3;
        out.push({ name: araucaria ? 'araucaria' : 'broadleaf', position: [x, z], variant: Math.floor(rnd() * 8), scale: araucaria && o < 16 ? 1.2 + 0.2 * rnd() : 0.95 + 0.3 * rnd(), rot: rnd() * 6.28 });
      }
    }
  }
  return out;
}

/** Nothing grows on the line itself (3 m to each side) where the camera is low. */
export function fjorKeepOut(path) {
  return (x, z) => (path.pts.some(q => q.y < 30 && Math.hypot(x - q.x, z - q.z) < 3 + (q.y > 6 ? 12 : 0)) ? 1 : 0);
}
