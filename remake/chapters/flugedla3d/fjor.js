// Flugeðla og fiðrildið's fast take (?chapter=flugedla3d&profa=fjor): the owner's "meiri hraða, gegnum tré … DJ eðla" of
// 2026-11-16 (the plan's section 12), and since round 3 (2026-11-18) his route on from the cloud: "sleppum þórseðlu senu ... þegar
// við fljúgum í skýin þá koma fleiri flugeðlur ... svo þegar við komum aftur niður ... haus niður fyrst ... í gljúfrið þar sem
// fossinn er ... með litlum fuglum svo upp foss". One take on her set's beat grid (125 bpm) that loops through black:
//
//   1. the forest sprint (0-13.44 s, beats 0-28): trunks whipping past, her weaving and swooshing at us, two holds, two snap turns
//   2. the climb into the cloud after the butterfly (beat 30 on, 24 m/s)
//   3. the flock above the cloud sea (FLOCK: about 10 s): more Flugeðlas rise from the clouds and come from far off, a wheel on the
//      beat, a near sweep under her; they peel away when the butterfly drops
//   4. the dive, head first: she noses over, the camera drops ahead of her and below, pitched up at her (DIVE)
//   5. the gorge of chapter 4 (VALLEY: its own place, its own camera path along the river): out of the cloud over it, pulled out low
//      over the river, backwards along it with little birds round her
//   6. up the falls: the butterfly up the face, she after it, the camera rising ahead of her looking down
//   7. the crest: level over the top, her hold near us, black, the loop
//
// The camera flies backwards (it looks at her). Until the dive's white it flies the forest's route (route.js makeRoute: back, up,
// turn; its height over the forest floor smoothed by the page); from the climb's white the place is the valley (the page shifts the
// camera and the clouds there together: VALLEY.off), and from the dive's white the camera flies the valley's own path (valleyCamera).
// In the forest she flies ON the camera's path, d metres behind it; in the open air she is placed in the picture itself. Pure: the
// page, the layout and the tests read the same numbers.
import { makeRoute } from './route.js';
import { createRoute, FALLS } from '../kafli4-route.js';

export const BPM = 125;
export const BEAT = 60 / BPM; // 0.48 s
// Round 3: the flock's 20 beats are inserted at beat 41 of the 56-beat take (the float over the cloud): every authored second from
// there on moves DT later (sh). The take is played through a time warp (warp below) that slows it on a few beats.
export const INS_BEAT = 41, DT_BEATS = 20;
export const INS = INS_BEAT * BEAT, DT = DT_BEATS * BEAT; // 19.68 s, 9.6 s
/** An authored second of the 56-beat take, moved after the inserted flock. */
export const sh = t => (t >= INS - 1e-9 ? t + DT : t);
const at = b => sh(b * BEAT);
export const LOW = 3.8; // m over the forest floor: the ground at a 16:10 bottom edge at k 0.69 (D 13), a 4:3 one at k 0.57
// where the take starts (the world's x, z)
export const START = { x: -95, z: -150 };
export const CLOUD_Y = { lo: 77, hi: 103, ease: 9 }; // route.js CLOUD (base 84, top 96, 7 m clear, 9 m ease), over the lane's ground
export const WHITE = { up: 0.5, down: 0.5 }; // s of full white on the screen each way: the height skips in it
export const FOREST_END = 28 * BEAT; // 13.44 s: the forest's last hold ends, the climb begins

// ---- the camera in the forest and over the cloud (the forest's route) ----
const LEVEL = sh(19.3); // the climb levels off
export const TIP = at(43); // 30.24 s: the butterfly drops, she noses over
export const FLOCK = { from: INS, to: INS + DT, beat: b => INS + b * BEAT }; // the flock's 20 beats (19.68-29.28 s)
const rates = () => [
  { t: -1, over: 0.5, back: 17 },
  { t: 1.0, over: 1.0, back: 19 },
  // the weave through the trunks
  { t: 0.9, over: 0.6, turn: 18 }, { t: 2.4, over: 0.6, turn: -18 }, { t: 4.3, over: 0.6, turn: 18 }, { t: 6.2, over: 0.6, turn: -18 }, { t: 8.0, over: 0.6, turn: 0 },
  // two snap turns, left then right (60 degrees a second, eased over 0.3 s)
  { t: at(18), over: 0.3, turn: -60 }, { t: at(20.3), over: 0.3, turn: 0 },
  { t: at(21.5), over: 0.3, turn: 60 }, { t: at(23.1), over: 0.3, turn: 0 },
  // the climb: slower backwards, 24 m/s up
  { t: 13.9, over: 1.0, back: 6 },
  { t: at(30), over: 1.0, up: 24 },
  { t: LEVEL, over: 1.0, up: 0 },
  { t: 19.5, over: 1.0, back: 7 },
  // the float with the flock: a slow drift round to the left (the cloud towers wheel past behind them)
  { t: FLOCK.beat(2), over: 1.5, turn: -4 }, { t: FLOCK.beat(16), over: 1.5, turn: 0 },
  // the dive: she noses over first (TIP), then the camera drops ahead of her at 29 m/s
  { t: TIP + 0.3, over: 0.6, up: -29 },
  { t: TIP + 0.3, over: 0.6, back: 2 },
];
const ROUTE_START = { x: START.x, y: LOW, z: START.z, yaw: 0 };
const A_LENGTH = TIP + 4; // the forest's route ends inside the dive's white (VALLEY.t): the valley's path takes over there
function withJumps() {
  const list = rates();
  const plain = makeRoute(list, { start: ROUTE_START, length: A_LENGTH, dt: 1 / 120 });
  let t = at(30);
  while (plain.at(t).y < CLOUD_Y.lo) t += 1 / 240;
  const jUp = { t: t + WHITE.up / 2, jump: (CLOUD_Y.hi - CLOUD_Y.lo) - plain.at(t).up * WHITE.up };
  const climbed = makeRoute([...list, jUp], { start: ROUTE_START, length: A_LENGTH, dt: 1 / 120 });
  t = TIP;
  while (climbed.at(t).y > CLOUD_Y.hi) t += 1 / 240;
  // (into the cloud going down: the valley's path takes over half way through its white)
  return { list: [...list, jUp], up: jUp.t, down: t + WHITE.down / 2 };
}
const JUMPS = withJumps();
export const FJOR_CHANGES = JUMPS.list;
/** The climb's white (the place becomes the valley in it) and the dive's (the valley's path begins in it), in story seconds. */
export const SWITCH = { up: JUMPS.up, down: JUMPS.down };
export const fjorRoute = () => makeRoute(FJOR_CHANGES, { start: ROUTE_START, length: A_LENGTH, dt: 1 / 120 });

const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
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

// ---- the valley (round 3): chapter 4's gorge, its falls ----
// The valley's own path: down out of the cloud over the gorge, pulled out low over the river, backwards up the river between the
// walls (looking down it, at her), then swung round at the plunge pool to look along the falls' face while it rises up it, ahead of
// her, and over the top. In the valley's own coordinates (world/ardalur: chapter 4's), its heights the world's.
const RIVER = createRoute({ wingspan: 7.5 }).river;
const VT = SWITCH.down; // the valley path's first second (in the white)
const END_BEATS = 12; // the ending "Hópurinn kemur aftur" after the crest (his pick, 2026-11-18): 12 beats, so the take ends on the set's
// beat 388 (Kjötkveðjuhátíð 372-404, its first 16-beat phrase's end); the flock gathers from the end of the crest's turn, 3.4 beats before
const V_BEATS = 41 + END_BEATS; // the valley's part of the take: 25.44 s
export const LENGTH = Math.round((VT + V_BEATS * BEAT) / BEAT) * BEAT; // the story's length, on a whole beat
/** The ending: its beats (b) counted from where the take ended before it (story beat 108). */
export const END = { from: LENGTH - END_BEATS * BEAT, beats: END_BEATS, beat: b => LENGTH - END_BEATS * BEAT + b * BEAT };
const vt = x => VT + x; // a second of the valley's part
const D_BREAK = 1066; // m along the river where we come out of the cloud over the gorge (x about -1161)
const ABOVE = 12; // (round 3 polish: higher between the walls, so they stay milder at the side edges) // m over the river through the gorge
// how fast it goes up the river (m/s, along it): slow in the dive, 15 m/s down the gorge, slowing at the pool
const V_SPEED = channel([
  { t: vt(1.6), over: 1.2, v: 15 }, { t: vt(10.4), over: 1.4, v: 4 }, { t: vt(12.6), over: 1.0, v: 0 },
], 6);
const V_D = (() => {
  const dt = 1 / 120, n = Math.ceil((LENGTH - VT + 1) / dt);
  const out = new Float64Array(n + 1);
  let d = D_BREAK;
  for (let i = 0; i <= n; i++) { out[i] = d; d += V_SPEED(VT + (i + 0.5) * dt) * dt; }
  return t => { const f = clamp((t - VT) / dt, 0, n); const i = Math.min(n - 1, Math.floor(f)); return out[i] + (out[i + 1] - out[i]) * (f - i); };
})();
// the river's line smoothed (its corners rounded over 30 m), and the way down it
const riverAt = d => {
  let x = 0, z = 0, lv = 0, dx = 0, dz = 0, n = 0;
  for (let o = -15; o <= 15; o += 5) { const p = RIVER.at(d + o); x += p.x; z += p.z; dx += p.dir[0]; dz += p.dir[1]; n++; }
  const p = RIVER.at(d);
  lv = p.level;
  return { x: x / n, z: z / n, level: lv, dir: [dx / n, dz / n] };
};
const downYaw = d => { const a = riverAt(d - 12), b = riverAt(d + 12); return (Math.atan2(-(b.x - a.x), b.z - a.z) * 180) / Math.PI; }; // looking down the river (from its smoothed line)
// the falls (kafli4-route.js FALLS: its face at x -1345, the water 16 m wide round z 126, from 50 m down to the pool at 10 m): she
// climbs up beside the water's south edge, the camera ahead of her and above, out over the pool, looking along the face (north, +z)
// and down at her
export const FALLS_CLIMB = { her: [FALLS.face + 8, FALLS.z - 6], cam: [FALLS.face + 12, FALLS.z - 10], yaw: 202, from: vt(12.2), to: vt(16.4) };
export const CREST = { from: vt(16.4), y: FALLS.top + 9, yaw: 96, at: [FALLS.face + 22, FALLS.z + 1] };
const CREST_TURN = t => smooth((t - vt(15.2)) / 2.8);
// the camera's height and its place off the river's line (blended to the falls' places from the pool on)
const V_H = t => {
  const d = V_D(t);
  const low = riverAt(d).level + ABOVE + 0.8 * Math.sin((t - VT) * 1.3);
  return low;
};
// the dive's drop out of the cloud: 29 m/s, braking over the last 13 m to the gorge's low line
const DROP = { t1: 1.75, t2: 2.7 }; // s into the valley's part: still at 29 m/s, level at the low line
function dropY(x, y0, yLow) {
  const v = 29;
  if (x <= DROP.t1) return y0 - v * x;
  const yb = y0 - v * DROP.t1, T = DROP.t2 - DROP.t1, e = clamp((x - DROP.t1) / T, 0, 1);
  // a cubic from (yb, -v) to (yLow, 0)
  const h00 = 2 * e ** 3 - 3 * e ** 2 + 1, h10 = e ** 3 - 2 * e ** 2 + e, h01 = -2 * e ** 3 + 3 * e ** 2;
  return h00 * yb + h10 * T * -v + h01 * yLow;
}
const V_PITCH = channel([
  { t: vt(2.0), over: 1.0, v: 2 }, // pulled out: level, over the river
  { t: vt(11.8), over: 1.0, v: -34 }, // at the pool: down at her as she climbs (polish: -58 showed the pool, not the water's face)
  { t: vt(15.9), over: 1.1, v: -8 }, // over the top
], 55);
// her climb up the falls and the camera ahead of her: 0 at the pool, 1 over the top
const CLIMB = t => smooth((t - FALLS_CLIMB.from) / (FALLS_CLIMB.to - FALLS_CLIMB.from));
const SWING = t => smooth((t - vt(10.8)) / 2.9); // the camera's swing from down the river to along the face
/** The valley's camera at story second t (t >= VALLEY.t): world x, y, z, yaw, pitch, roll and its speeds. `base`: the clouds' level. */
export function valleyCamera(t, base = 0) {
  const x = t - VT;
  const d = V_D(t);
  const r = riverAt(d);
  const y0 = base + CLOUD_Y.lo - 0.5;
  let y = dropY(x, y0, riverAt(V_D(VT + DROP.t2)).level + ABOVE);
  if (x > DROP.t2) y = V_H(t) + (dropY(DROP.t2, y0, 0) - dropY(DROP.t2, y0, 0)); // (level with the low line)
  if (x > DROP.t2 - 0.6 && x <= DROP.t2) y = lerp(y, V_H(t), smooth((x - (DROP.t2 - 0.6)) / 0.6));
  // the falls: up the face ahead of her, then over the top
  const sw = SWING(t), cl = CLIMB(t);
  let px = r.x, pz = r.z;
  px = lerp(px, FALLS_CLIMB.cam[0], sw);
  pz = lerp(pz, FALLS_CLIMB.cam[1], sw);
  const climbY = lerp(riverAt(1215).level + ABOVE + 2, CREST.y, cl);
  y = lerp(y, climbY, smooth((t - vt(11.6)) / 1.2));
  let yaw = downYaw(d);
  yaw = lerp(yaw, FALLS_CLIMB.yaw, sw);
  // over the top: round to look back down the gorge from over the pool (the land falling away under her)
  const cr = CREST_TURN(t);
  yaw = lerp(yaw, CREST.yaw, cr);
  px = lerp(px, CREST.at[0], cr);
  pz = lerp(pz, CREST.at[1], cr);
  const pitch = V_PITCH(t);
  // roll: into the swing round at the pool (the yaw's rate), and a lean in the gorge's bends
  const yawRate = (lerp(lerp(downYaw(V_D(t + 0.05)), FALLS_CLIMB.yaw, SWING(t + 0.05)), CREST.yaw, CREST_TURN(t + 0.05)) - yaw) / 0.05;
  const roll = clamp(yawRate / 3, -20, 20);
  const speed = V_SPEED(t);
  const up = x < DROP.t1 ? -29 : 0;
  return { x: px, y, z: pz, yaw, pitch, roll, back: speed, up, turn: yawRate, valley: true };
}
/** The valley: when the place changes (the climb's white) and its path begins (the dive's white); `off`: the page's shift. */
export const VALLEY = { t: VT, place: SWITCH.up, breakAt: [RIVER.at(D_BREAK).x, RIVER.at(D_BREAK).z], length: LENGTH - VT };

// the camera's pitch (degrees, + looks up) in the forest's route: up after the butterfly in the climb, level over the cloud, up at
// her as it drops ahead of her in the dive (head first: she comes down at us out of the cloud)
export const PITCH = channel([
  { t: at(29.6), over: 0.6, v: 22 }, { t: 18.0, over: 0.6, v: 6 }, { t: LEVEL, over: 0.8, v: 0 },
  { t: TIP + 0.35, over: 0.75, v: 55 },
]);
/** The camera at story second t: the route's place and heading, its pitch and roll (roll: + leans the view right, into a right turn). */
export function cameraAt(route, t, base = 0) {
  if (t >= VT) return valleyCamera(t, base);
  const p = route.at(t);
  const turn = route.rates.turn(t - 0.08);
  const roll = Math.max(-20, Math.min(20, turn / 3));
  return { ...p, pitch: PITCH(t), roll };
}

/** The whole take's numbers for the hand-back: its speeds and the camera's greatest rates. */
export function cameraStats(route, dt = 1 / 120) {
  let yaw = 0, roll = 0, pitch = 0, back = 0, up = 0, down = 0, maxPitch = 0;
  let last = cameraAt(route, 0);
  for (let t = dt; t <= LENGTH; t += dt) {
    const c = cameraAt(route, t);
    if (Math.abs(t - VT) > dt * 1.5) {
      yaw = Math.max(yaw, Math.abs(c.yaw - last.yaw) / dt);
      roll = Math.max(roll, Math.abs(c.roll - last.roll) / dt);
      pitch = Math.max(pitch, Math.abs(c.pitch - last.pitch) / dt);
    }
    back = Math.max(back, c.back); up = Math.max(up, c.up); down = Math.max(down, -c.up); maxPitch = Math.max(maxPitch, Math.abs(c.pitch));
    last = c;
  }
  return { yawRate: +yaw.toFixed(1), rollRate: +roll.toFixed(1), pitchRate: +pitch.toFixed(1), back, up, down, maxRoll: 20, maxPitch: +maxPitch.toFixed(1) };
}

// ---- the path: the camera's own track over the forest floor, by distance flown (horizontally) ----
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
// it) and she flies nearer; holds where she hangs steady in the picture, big, bobbing her head on the beat; her swooshes come on a
// diagonal (yawed, one wing toward us). Her beak reaches about 3 m in front of her chest, so the chest's out is bounded by the beak's
// 6 %: her neck is drawn back a little (neck < 0) to win some of it.
export const FJOR_D = 17.5;
// her distance behind us along the path (m, her chest) in the forest. Each change lands on its beat.
const land = (beat, over, v) => ({ t: at(beat) - over, over, v });
const D_HER = channel([
  land(6, 0.45, 7.7), land(7.2, 0.5, 8.4), // swoosh 1 (beat 6), on a diagonal; then the first hold (in the picture)
  land(16, 0.45, 7.7), land(17, 0.45, 8.4), // swoosh 2 (beat 16), the other diagonal
  land(18.5, 0.5, 19), land(20.5, 0.55, 7.6), land(21.6, 0.5, 8.4), // back behind the screen, then a rocket at us (beat 20.5)
], 8.4);
const ROLL_HER = channel([{ t: at(21.6), over: 2 * BEAT, v: 360 }]); // the barrel roll (beats 21.6-23.6), out of the rocket
// her yaw to the camera (degrees): the diagonals
const YAW_HER = channel([
  { t: at(6) - 0.5, over: 0.45, v: 35 }, { t: at(6) + 0.1, over: 0.5, v: 0 },
  { t: at(16) - 0.5, over: 0.45, v: -35 }, { t: at(16) + 0.1, over: 0.5, v: 0 },
  { t: at(20.5) - 0.6, over: 0.5, v: 40 }, { t: at(20.5) + 0.15, over: 0.5, v: 0 },
]);
// in the picture (hanging steady, bobbing): the first hold, the second (after the snap turns), with the flock, the dive's peak as we
// come out of the cloud over the gorge, two down the gorge, the crest with the flock round her, and the last (the flock gone past us)
export const HOLDS = [[3.85, 6.9], [10.9, FOREST_END], [FLOCK.beat(6), FLOCK.beat(14)], [vt(0.3), vt(2.6)], [vt(3.4), vt(6.0)], [vt(7.6), vt(10.6)], [CREST.from + 0.4, END.beat(4)], [END.beat(6.5), LENGTH - 0.4]];
const AIR = channel([{ t: 3.4, over: 0.45, v: 1 }, { t: 6.9, over: 0.5, v: 0 }, { t: 10.45, over: 0.45, v: 1 }]);
const HOLD_K = 0.46; // her chest at the holds: 8 m (+2.35 %; her beak about 5 %)
const PEAK_K = 0.435; // the dive's peak: 7.6 m (+2.6 %; her beak under 6 %)
const AIR_BODY = [
  // [second, u, v, k, over] (k at FJOR_D): the first hold, the second
  [3.4, 0.5, 0.56, HOLD_K, 0.01], [10.45, 0.5, 0.56, HOLD_K, 0.01],
  // rocketing up after the butterfly, beside us over the cloud
  [15.0, 0.3, 0.55, 0.42, 0.9], [16.0, 0.5, 0.62, 0.5, 0.9], [17.0, 0.42, 0.58, 0.47, 1.0], [18.6, 0.55, 0.5, 0.56, 1.0],
  [LEVEL + 0.4, 0.38, 0.58, 0.5, 1.0],
  // with the flock: in the middle, in front of them all, a hold, then a little aside as the near one sweeps under
  [FLOCK.beat(6), 0.5, 0.47, HOLD_K, 1.2], [FLOCK.beat(14), 0.5, 0.47, HOLD_K, 0.01], [FLOCK.beat(18), 0.46, 0.5, 0.48, 1.2],
  // the nose-over and the dive: in the middle of the picture as the camera drops ahead of her (she comes at us head first)
  [TIP + 0.4, 0.5, 0.5, 0.5, 0.5], [vt(0.2), 0.5, 0.48, PEAK_K, 0.8],
  // the peak held through the pull-out, then the gorge: holds and a weave between them
  [vt(2.6), 0.5, 0.5, PEAK_K, 0.01], [vt(3.4), 0.5, 0.54, HOLD_K, 0.8], [vt(6.0), 0.5, 0.54, HOLD_K, 0.01],
  [vt(6.8), 0.34, 0.5, 0.5, 0.8], [vt(7.6), 0.5, 0.54, HOLD_K, 0.8], [vt(10.6), 0.5, 0.54, HOLD_K, 0.01],
  // up the falls: climbing at us, then the crest's hold
  [vt(11.8), 0.5, 0.55, 0.5, 1.0], [FALLS_CLIMB.to, 0.5, 0.52, 0.48, 2.0], [CREST.from + 0.4, 0.5, 0.54, HOLD_K, 0.6],
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
const NOSE = t => smooth((t - TIP) / 0.5); // the nose-over: her head goes down first

/**
 * Her at story second t: { path: { d, side, lift } (metres behind us on the path, to the path's right, up), air: [u, v, k] of her
 * body in the picture, blend (0 path, 1 air), pose: { yaw, pitch, bank, sweep, neck, clip, at } }. `cam.pitch`: the camera's pitch
 * (her pitch is the world's: she faces the camera's line, so its pitch is taken off).
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
  const blend = t < FOREST_END + 0.6 ? AIR(t) : 1;
  const roll = ROLL_HER(t);
  // in a snap turn she banks with it (the camera's turn rate a little before)
  const turnBank = (cam?.turnBefore ?? 0) * 1.1;
  // her head bobs on the beat (the DJ), drawn back a little
  const bob = -10 - 9 * Math.abs(Math.sin((Math.PI * t) / BEAT));
  const camPitch = cam?.pitch ?? 0;
  let pose = { yaw, pitch: 4, bank: bankWeave + turnBank + roll, sweep: 0, neck: -8, clip: 'fly', at: t * 1.7 };
  if (blend > 0) {
    const hold = HOLDS.some(([a, b]) => t >= a - 0.5 && t < b + 0.3) || (t >= FOREST_END && t < at(30)) || t >= CREST.from; // (the crest and the ending: she hangs there)
    const climb = t >= at(30) && t < LEVEL ? 1 : 0;
    // facing the camera: her pitch the camera's taken off (looking up at her, she points down at us)
    const face = -camPitch;
    let air;
    if (t >= TIP && t < VT + 2.6) {
      // the nose-over and the dive, head first: her nose down past the line to the camera, wings swept back, beak leading
      const n = NOSE(t);
      air = { yaw: 0, pitch: lerp(4, -75, n) * (1 - smooth((t - (TIP + 0.5)) / 0.8)) + (face - 14) * smooth((t - (TIP + 0.5)) / 0.8), bank: 0, sweep: lerp(20, 72, n), neck: lerp(-6, 8, n), clip: 'glide', at: 0 };
    } else if (t >= vt(11.6) && t < FALLS_CLIMB.to) {
      // up the falls: climbing hard at the camera above her, head first
      air = { yaw: 0, pitch: face + 6, bank: 10 * Math.sin(TAU * t / (4 * BEAT)), sweep: 45, neck: 4, clip: 'fly', at: t * 2.2 };
    } else if (hold) {
      air = { yaw: 0, pitch: face + (t > 20 && t < FLOCK.from ? 10 : 2), bank: 12 * Math.sin(TAU * t / (4 * BEAT)) + roll, sweep: 40, neck: bob, clip: 'fly', at: t * 1.5 };
    } else if (climb) {
      air = { yaw: 0, pitch: 62, bank: 0, sweep: 55, neck: 0, clip: 'fly', at: t * 2.1 };
    } else if (t >= VT) {
      // the gorge's weave between the holds: banked, the near wing dipping toward the river
      air = { yaw: 18 * Math.sin(TAU * (t - vt(6)) / 3.2), pitch: face + 6, bank: 40 * Math.sin(TAU * (t - vt(6)) / 1.6), sweep: 25, neck: -6, clip: 'fly', at: t * 1.8 };
    } else {
      // gliding above the cloud with the flock, banking with their wheel
      air = { yaw: 0, pitch: face + 6, bank: 30 * Math.sin(TAU * (t - FLOCK.from) / 3.84), sweep: 20, neck: -6, clip: 'glide', at: 0 };
    }
    pose = blend >= 0.5 ? { ...pose, ...air } : pose;
  }
  return { path: { d, side, lift: -0.6 + 0.5 * Math.sin(ph * 0.5) }, air: airBody(t), blend, pose };
}

// ---- the flock above the cloud sea (round 3): 7 more Flugeðlas ----
// Each is placed in the picture as she is ([u, v, k], k at FJOR_D) by keys [flock beat, u, v, k, bank]: the far three rise out of the
// cloud sea far off (under its top at first), the middle two come in from far off, the near two rise from below and come up beside
// her; on flock beat 10 they all wheel together (banked, swung across on the beat); one sweeps across under her (beats 11.5-13.2);
// from beat 19 they peel away, banking out and down into the cloud as the butterfly drops. scale: size against hers.
export const FLOCK_MEMBERS = [
  { layer: 'far', scale: 0.9, tint: 0.92, phase: 0.1, keys: [[-1, 0.34, 0.98, 5.0, 0], [3, 0.34, 0.64, 5.0, 10], [10, 0.38, 0.62, 5.0, -40], [12, 0.37, 0.62, 5.0, 0], [19, 0.36, 0.64, 5.0, 0], [23, 0.2, 1.05, 5.5, -50]] },
  { layer: 'far', scale: 0.85, tint: 0.88, phase: 0.45, keys: [[0, 0.7, 1.0, 6.0, 0], [4, 0.7, 0.58, 6.0, -10], [10, 0.64, 0.56, 6.0, -40], [12, 0.66, 0.57, 6.0, 0], [19, 0.68, 0.58, 6.0, 0], [23, 0.9, 1.05, 6.5, 50]] },
  { layer: 'far', scale: 0.95, tint: 0.95, phase: 0.7, keys: [[1, 0.86, 0.99, 4.2, 0], [5, 0.85, 0.66, 4.2, 15], [10, 0.8, 0.64, 4.2, -40], [12, 0.82, 0.65, 4.2, 0], [19, 0.84, 0.66, 4.2, 0], [22.5, 1.0, 1.05, 4.6, 50]] },
  { layer: 'mid', scale: 1.0, tint: 0.97, phase: 0.25, keys: [[2, 0.36, 0.44, 9.0, 0], [8, 0.3, 0.42, 1.1, 20], [10, 0.4, 0.38, 1.1, -45], [12, 0.38, 0.4, 1.1, 0], [19, 0.32, 0.42, 1.15, 0], [23, -0.1, 0.9, 1.6, -60]] },
  { layer: 'mid', scale: 0.92, tint: 0.9, phase: 0.6, keys: [[3, 0.66, 0.4, 9.5, 0], [9, 0.72, 0.4, 0.95, -20], [10, 0.62, 0.36, 0.95, -45], [12, 0.64, 0.38, 0.95, 0], [19, 0.7, 0.4, 1.0, 0], [23, 1.1, 0.92, 1.5, 60]] },
  { layer: 'near', scale: 0.95, tint: 1.0, phase: 0.85, keys: [[3, 0.16, 0.98, 2.6, 0], [9, 0.15, 0.66, 0.8, 25], [10, 0.18, 0.64, 0.8, -35], [12, 0.16, 0.65, 0.8, 0], [19, 0.15, 0.66, 0.8, 0], [22.5, -0.25, 0.95, 0.8, -60]] },
  // the near one on the right, then the sweep across under her (in front of the screen, from the right edge out at the left), and
  // on out and down into the cloud: it does not come back (the F1 report of 2026-11-18 23:19: it came back into the left near one)
  { layer: 'near', scale: 0.9, tint: 0.94, phase: 0.35, keys: [[4, 0.84, 0.98, 2.8, 0], [9.5, 0.9, 0.7, 0.6, -25], [11.4, 1.2, 0.92, 0.4, 0], [11.5, 1.2, 1.05, 0.38, 0], [13.2, -0.24, 1.05, 0.38, 0], [13.3, -0.26, 1.02, 0.5, -30], [16, -0.45, 1.15, 0.9, -50]] },
];
// ---- the ending, "Hópurinn kemur aftur" (keys in END beats): the flock comes back up out of the gorge behind her at the crest ----
// From the bottom edge, deep (small), rising into three layers round her as above the cloud: far (73-105 m), middle (25-26 m, over her head), near
// (15-16 m, beside her wings); she in the middle, nearest (8 m). The formation move: a wave from far to near (each layer dips and banks
// on its half beat, beats 1-2.5), then all bank as one (beat 3, held to 4). On beat 4 (the set's beat 380, its half phrase) they
// break: the far and middle ones away to the sides and up, deep; the near ones past us on both sides, quick. Then she holds alone.
// Each: [settled u, v, k], the side it breaks to (-1 left, 1 right), when it starts in from the edge and where ([u, v, k]), when it is in place.
const ENDING = [
  { at: [0.1, 0.24, 5.0], side: -1, start: -3.4, from: [0.14, 1.12, 6.0], set: 0.0 },
  { at: [0.9, 0.26, 6.0], side: 1, start: -3.2, from: [0.86, 1.12, 7.0], set: 0.0 },
  { at: [0.5, 0.1, 4.4], side: 1, start: -3.0, from: [0.54, 1.12, 5.4], set: 0.0 },
  { at: [0.38, 0.2, 1.5], side: -1, start: -2.8, from: [0.42, 1.12, 3.6], set: 0.5 },
  { at: [0.62, 0.21, 1.4], side: 1, start: -2.6, from: [0.58, 1.12, 3.4], set: 0.5 },
  // (the near ones in from the side edges, behind the screen, round to beside her wings: apart from the middle ones' way up)
  { at: [0.2, 0.36, 0.9], side: -1, start: -2.4, from: [-0.2, 0.5, 1.6], set: 1.0 },
  { at: [0.8, 0.37, 0.88], side: 1, start: -2.2, from: [1.2, 0.48, 1.6], set: 1.0 },
];
const WAVE = { far: 1.0, mid: 1.5, near: 2.0 }; // each layer's dip, on its half beat
FLOCK_MEMBERS.forEach((m, i) => {
  const e = ENDING[i], [u, v, k] = e.at, s = e.side, w = WAVE[m.layer];
  const still = b => [b, u, v, k, 0];
  const keys = [[e.start, ...e.from, 0], still(e.set)];
  if (e.set < w - 0.5) keys.push(still(w - 0.5));
  keys.push([w, u, v + 0.06, k, -30 * s], still(w + 0.5));
  if (w + 0.5 < 2.5) keys.push(still(2.5));
  keys.push([3.0, u + 0.02, v - 0.02, k, -30], [4.0, u + 0.02, v - 0.02, k, -30]); // all bank as one (beat 3, held to the break)
  if (m.layer === 'near') keys.push([5.0, s < 0 ? -0.35 : 1.35, 0.35, 0.32, 60 * s]); // past us, quick (one beat)
  else if (m.layer === 'mid') keys.push([6.0, u + 0.85 * s, 0.0, k * 1.6, 55 * s]); // away to the side and up
  else keys.push([6.5, u + 0.6 * s, -0.14, k * 1.5, 55 * s]); // away to the side and up, deep
  m.end = keys;
});
/** A flock member at story second t: { at: [u, v, k], bank, heading (degrees off the camera's), scale, flap } or null before it is up. */
export function flockAt(m, t) {
  const ending = m.end && t >= END.beat(m.end[0][0] - 0.02);
  const b = ending ? (t - END.from) / BEAT : (t - FLOCK.from) / BEAT;
  const keys = ending ? m.end : m.keys;
  if (b < keys[0][0] - 0.01 || b > keys.at(-1)[0] + 0.01) return null;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] < b) i++;
  const a = keys[i], c = keys[i + 1];
  const e = smooth((b - a[0]) / Math.max(1e-6, c[0] - a[0]));
  // (the sweep is straight across at an even speed)
  const lin = clamp((b - a[0]) / Math.max(1e-6, c[0] - a[0]), 0, 1);
  const f = a[3] < 0.4 && c[3] < 0.4 ? lin : e;
  const u = lerp(a[1], c[1], f), v = lerp(a[2], c[2], f), k = lerp(a[3], c[3], f), bank = lerp(a[4], c[4], f);
  // a little bob of their own, and their heading turned into their sideways motion
  const du = (c[1] - a[1]) / Math.max(0.2, c[0] - a[0]);
  const sweep = a[3] < 0.4 && c[3] < 0.4; // (across the picture on a diagonal: side-on, its far wing reached back to her)
  return { at: [u + 0.01 * Math.sin(TAU * (t / 2.1 + m.phase)), v + 0.012 * Math.sin(TAU * (t / 1.7 + m.phase)), k], bank, heading: sweep ? Math.sign(-du) * 35 : clamp(-du * 60, -40, 40), scale: m.scale };
}

// ---- the butterfly: darting all over the picture ----
// its darts on top of a restless wander; to our nose (k 0.27-0.3: 5-5.4 % out) and back toward her beak
const DARTS = channel([
  // to our nose: once in each hold (and twice in the first), and a little ahead of the second swoosh and the rocket
  { t: at(8.6), over: 0.3, v: 1 }, { t: at(10), over: 0.4, v: 0 },
  { t: at(12.2), over: 0.3, v: 1 }, { t: at(13.6), over: 0.4, v: 0 },
  { t: at(15.2), over: 0.3, v: 1 }, { t: at(16.6), over: 0.4, v: 0 },
  { t: at(19.6), over: 0.3, v: 1 }, { t: at(21), over: 0.4, v: 0 },
  { t: at(25), over: 0.3, v: 1 }, { t: at(26.4), over: 0.4, v: 0 },
  // with the flock, in the gorge
  { t: FLOCK.beat(7), over: 0.3, v: 1 }, { t: FLOCK.beat(8.6), over: 0.4, v: 0 },
  { t: vt(4.2), over: 0.3, v: 1 }, { t: vt(5.2), over: 0.4, v: 0 },
  { t: vt(8.4), over: 0.3, v: 1 }, { t: vt(9.4), over: 0.4, v: 0 },
]);
const SHOOT = channel([{ t: at(29.6), over: 0.5, v: 1 }, { t: at(31.5), over: 0.8, v: 0 }]); // it shoots straight up (beat 30)
// the drop at the dive (it leads her down, between her and us) and its shot up the falls (toward the camera above it)
const DROP_B = channel([{ t: TIP - 0.2, over: 0.4, v: 1 }, { t: vt(2.4), over: 0.8, v: 0 }]);
const UP_FALLS = channel([{ t: vt(11.4), over: 0.5, v: 1 }, { t: vt(13.2), over: 0.8, v: 0 }]);
// the ending's last hold: it hovers by her beak (beside it, a little above: 4.5 % out, under the hold's 5 %)
const BEAK = channel([{ t: END.beat(5.5), over: 0.8, v: 1 }]);
/** The butterfly at story second t: { at: [u, v, k], yaw, pitch, flap }. */
export function butterflyAt(t, her, D = FJOR_D) {
  const u = 0.5 + 0.2 * Math.sin(TAU * t / 2.3) + 0.06 * Math.sin(TAU * t / 0.77);
  const v = 0.45 + 0.12 * Math.sin(TAU * t / 1.9 + 1) + 0.04 * Math.sin(TAU * t / 0.61);
  let k = 0.55 + 0.1 * Math.sin(TAU * t / 3.1);
  const dart = DARTS(t);
  const shoot = SHOOT(t);
  // (nearer us than her beak, about 3 m in front of her chest, by 0.6 m or more)
  const near = her && her.blend < 0.5 ? (her.path.d - 3.6) / D : her ? (her.air[2] * FJOR_D - 3.6) / D : 0.6;
  let uu = u, vv = v - 0.3 * shoot;
  k = Math.max(0.28, Math.min(k, near));
  k = lerp(k, 0.285, dart);
  // (to our nose beside her face, a little to her right of it and above it)
  uu = lerp(uu, 0.62 + 0.03 * Math.sin(TAU * t / 0.9), dart);
  vv = lerp(vv, 0.12, dart);
  // when she swooshes in on the path (nearer than her usual 8.4 m), it gets out of her way: up and to the side away from her lead wing
  const away = her && her.blend < 0.5 ? Math.min(1, Math.max(0, (8.4 - her.path.d) / 1.0)) : 0;
  uu = lerp(uu, (her?.pose?.yaw ?? 0) >= 0 ? 0.27 : 0.73, away);
  vv = lerp(vv, 0.3, away);
  k = lerp(k, 0.33, away);
  // the dive: it leads her down, just above the middle (between her beak and us)
  const drop = DROP_B(t);
  uu = lerp(uu, 0.66 + 0.06 * Math.sin(TAU * t / 0.9), drop);
  vv = lerp(vv, 0.6 + 0.04 * Math.sin(TAU * t / 0.7), drop);
  k = lerp(k, 0.29, drop);
  // up the falls: it shoots up at the camera, out over the top of the picture
  const upf = UP_FALLS(t);
  uu = lerp(uu, 0.7 + 0.05 * Math.sin(TAU * t / 0.9), upf);
  vv = lerp(vv, 0.2 + 0.04 * Math.sin(TAU * t / 0.7), upf);
  k = lerp(k, 0.3, upf);
  const bk = BEAK(t);
  uu = lerp(uu, 0.65 + 0.05 * Math.sin(TAU * t / 1.3), bk); // (hovering, never parked)
  vv = lerp(vv, 0.38 + 0.045 * Math.sin(TAU * t / 0.9), bk);
  k = lerp(k, 0.31, bk);
  const flap = 0.3 + 0.9 * Math.abs(Math.sin(TAU * 5 * t));
  return { at: [uu, vv, Math.max(0.27, k)], yaw: 25 * Math.sin(TAU * t / 1.3), pitch: -15 * shoot + 30 * shoot, flap };
}

// ---- the little birds of the gorge (critters/fugl.glb) ----
// A loose flock flying up the gorge with us (placed in the picture: [u, v, k]), near and far, and three that dart past in front of
// the screen; at the falls they scatter, up and out of the picture. Each: { at(t) → [u, v, k] | null, scale }.
export const BIRDS = (() => {
  let s = 17;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  const from = vt(2.2), to = vt(12.6);
  // the loose flock: from far down the gorge (small) up to their places round her, near and far
  for (let i = 0; i < 18; i++) {
    const far = i < 10;
    const side = r() < 0.5 ? -1 : 1, u0 = far ? 0.35 + r() * 0.3 : 0.5 + side * (0.2 + r() * 0.12), v0 = far ? 0.42 + r() * 0.18 : 0.3 + r() * 0.5;
    const k0 = far ? 1.6 + r() * 2.4 : 1.0 + r() * 0.5; // (the near ones out beside her and behind her wings)
    const ph = r() * TAU, come = from + r() * 2.5, sc = (far ? 2.2 : 1.6) + r() * 0.6, beat = 9 + r() * 4;
    const out0 = r() < 0.5 ? -1 : 1;
    out.push({ scale: sc, beat, phase: ph, at: t => {
      if (t < come || t > to + 1.6) return null;
      const e = smooth((t - come) / 2.0); // in from far down the gorge (behind her, small)
      const sc2 = smooth((t - to) / 1.4); // the scatter at the falls: up and out
      const u = u0 + 0.04 * Math.sin(t * 1.3 + ph) + out0 * 0.7 * sc2;
      const v = v0 + 0.03 * Math.sin(t * 1.7 + ph) - 0.8 * sc2;
      const k = lerp(9, k0, e) + 0.05 * Math.sin(t * 0.9 + ph);
      return [u, v, k];
    } });
  }
  // three that dart past in front of the screen (k 0.35-0.5), across from one edge to the other in about 0.7 s
  for (const [t0, from_, to_, v, k] of [[vt(4.9), -0.15, 1.15, 0.2, 0.42], [vt(7.1), 1.15, -0.15, 0.84, 0.38], [vt(9.6), -0.15, 1.15, 0.14, 0.72]]) {
    out.push({ scale: 1.6, beat: 14, phase: t0, dart: true, at: t => (t < t0 || t > t0 + 0.75 ? null : [lerp(from_, to_, (t - t0) / 0.75), v + 0.05 * Math.sin((t - t0) * 9), k]) });
  }
  return out;
})();

// ---- the forest along the path: trunks whipping past 3-5 m from the camera's line, the floor's trees round them ----
let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** The plants (layout.plants form) along the path where the camera is low: whip trunks, then a wood round them, kept off the line. */
export function fjorPlants(path) {
  seed = 5;
  const out = [];
  const lowAt = s => { const t = path.timeAt(s); const p = path.pts[Math.min(path.pts.length - 1, Math.round(t * 60))]; return p.y < 12 ? p : null; };
  // (where the camera climbs through the canopy, a glade: 9 m more)
  const clear = (x, z, r) => !path.pts.some(q => q.y < 30 && Math.hypot(x - q.x, z - q.z) < r + (q.t > 13.0 ? 9 : 0));
  let side = 1;
  // whip trunks: every 5 to 7 m along the low path, alternating sides, 4.2 to 5.4 m off the line
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
    const pl = { name: 'araucaria', position: [x, z], variant: Math.floor(rnd() * 8), scale: 1.2 + 0.2 * rnd(), rot: rnd() * 6.28, whip: true };
    const tc = path.timeAt(s);
    if ((tc > 0.7 && tc < 1.3) || (tc > 10.4 && tc < 10.95)) continue; // (her wing clipped these: round 2 fix)
    out.push(pl);
  }
  // the wood round the line: a jittered grid out to 27 m from it
  for (let s = 0; s < path.length; s += 6.5) {
    const p = path.pts[Math.min(path.pts.length - 1, Math.round(path.timeAt(s) * 60))];
    if (!p || p.y > 40) continue;
    const psi = (p.yaw * Math.PI) / 180, c = Math.cos(psi), sn = Math.sin(psi);
    for (let off = 8; off < 27; off += 6 + rnd() * 2) {
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

// ---- the slow stretches ("hægmynd"): the take's time warp ----
// Each starts on a story beat and plays that one beat over three beats of the music (at a fifth of the speed for 0.96 s, eased in
// and out over 0.24 s each), so the music keeps its tempo and every move after it still lands on a beat (two beats later).
// Story beat 6: her nearest in the first swoosh; beat 51: the flock's wheel (flock beat 10), the near one's sweep under her after it.
export const SLOW_BEATS = [6, INS_BEAT + 10];
const EASE = 0.24, WIN = 3 * BEAT, Q = (BEAT - EASE) / (WIN - EASE); // Q = 0.2
const I = u => u * u * u - (u * u * u * u) / 2; // the integral of smoothstep from 0 to u
function within(x) {
  // story seconds gone x real seconds into a stretch, and the speed there
  const S = u => u * u * (3 - 2 * u);
  if (x < EASE) return { gone: x - (1 - Q) * EASE * I(x / EASE), rate: 1 - (1 - Q) * S(x / EASE) };
  const a = EASE - ((1 - Q) * EASE) / 2;
  if (x < WIN - EASE) return { gone: a + Q * (x - EASE), rate: Q };
  const y = Math.min(EASE, x - (WIN - EASE));
  return { gone: a + Q * (WIN - 2 * EASE) + Q * y + (1 - Q) * EASE * I(y / EASE), rate: Q + (1 - Q) * S(y / EASE) };
}
/** The take's warp: slow (true) or straight through (&haegt=0). story(r), rate(r), real(story), length (real s), setBeat. */
export function warp(slow = true) {
  const list = slow ? SLOW_BEATS.map((b, i) => ({ sigma: b * BEAT, rho: b * BEAT + 2 * i * BEAT })) : [];
  const extra = 2 * BEAT * list.length;
  const at1 = r => {
    let passed = 0;
    for (const w of list) {
      if (r < w.rho) break;
      if (r < w.rho + WIN) { const g = within(r - w.rho); return { story: w.sigma + g.gone, rate: g.rate }; }
      passed++;
    }
    return { story: r - 2 * BEAT * passed, rate: 1 };
  };
  const real = tau => { let a = 0, b = LENGTH + extra; for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (at1(m).story < tau) a = m; else b = m; } return (a + b) / 2; };
  const dropBeat = 30 + 2 * list.filter(w => w.sigma < 30 * BEAT).length; // the music's drop on the butterfly shooting up (story beat 30)
  return { story: r => at1(r).story, rate: r => at1(r).rate, real, length: LENGTH + extra, setBeat: 296 - dropBeat, slows: list.map(w => [w.rho, w.rho + WIN]) };
}
export const SET_BEAT = warp(false).setBeat;
