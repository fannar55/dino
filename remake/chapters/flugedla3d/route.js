// Flugeðla og fiðrildið's camera (chapters/flugedla3d.js): where it is and which way it looks at each second, as the integral of
// three rates, each eased from one value to the next over a second or more (the plan, rule 2: still, backwards, up or down, level,
// never rolled, never shaken; its one turn about the upright is beat 4's, at most 10 degrees a second). Pure: the forest's layout,
// the tests and the page all read the same table.
//
// The camera looks along its heading ψ: the direction (sin ψ, 0, −cos ψ), so ψ 0 looks down −Z and a positive ψ turns it to its
// right (toward +X). `back` is its speed backwards (away from where it looks), `up` its climb (negative: down), `turn` the heading's
// rate. Heights are metres over the lane's ground (the page adds the ground's level).

const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const rad = d => (d * Math.PI) / 180;

/**
 * A route from its changes: each { t, over, back?, up?, turn? } eases the named rates from what they are at t to the new values over
 * `over` seconds (smoothstep). Returns { at(t), length, dt, samples, stats }: at(t) → { x, y, z, yaw (degrees), back, up, turn }.
 */
export function makeRoute(changes, { start = { x: 0, y: 7, z: 0, yaw: 0 }, length, dt = 1 / 120 } = {}) {
  // each change starts from the value the rate has at its start (the earlier changes done by then): a change's start is its own t
  const settled = name => {
    const list = changes.filter(c => c[name] !== undefined).sort((a, b) => a.t - b.t);
    const from = [];
    let v = 0;
    for (const c of list) { from.push(v); v = c[name]; }
    return t => {
      let value = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (t <= c.t) break;
        value = from[i] + (c[name] - from[i]) * smooth((t - c.t) / c.over);
      }
      return value;
    };
  };
  const back = settled('back'), up = settled('up'), turn = settled('turn');
  const n = Math.ceil(length / dt);
  const samples = new Float64Array((n + 1) * 4); // x, y, z, yaw (degrees)
  let x = start.x, y = start.y, z = start.z, yaw = start.yaw;
  for (let i = 0; i <= n; i++) {
    samples.set([x, y, z, yaw], i * 4);
    const t = (i + 0.5) * dt;
    const b = back(t), w = turn(t), u = up(t);
    const psi = rad(yaw + w * dt * 0.5);
    // backwards: against the look direction (sin ψ, −cos ψ)
    x -= Math.sin(psi) * b * dt;
    z += Math.cos(psi) * b * dt;
    y += u * dt;
    yaw += w * dt;
  }
  function at(t) {
    const f = Math.min(n, Math.max(0, t / dt));
    const i = Math.min(n - 1, Math.floor(f)), e = f - i;
    const a = i * 4, c = (i + 1) * 4;
    const lerp = k => samples[a + k] + (samples[c + k] - samples[a + k]) * e;
    return { x: lerp(0), y: lerp(1), z: lerp(2), yaw: lerp(3), back: back(t), up: up(t), turn: turn(t) };
  }
  // the camera's own numbers (the plan's section 8): its greatest turn rate, and the shortest time any change of a rate takes
  const stats = {
    maxTurn: Math.max(...changes.filter(c => c.turn !== undefined).map(c => Math.abs(c.turn))),
    shortestChange: Math.min(...changes.map(c => c.over)),
    maxBack: Math.max(...changes.filter(c => c.back !== undefined).map(c => c.back)),
    maxUp: Math.max(...changes.filter(c => c.up !== undefined).map(c => c.up)),
    maxDown: -Math.min(...changes.filter(c => c.up !== undefined).map(c => c.up)),
  };
  return { at, length, dt, samples, stats, rates: { back, up, turn } };
}

// ---- the film's camera (the storyboard, section 4) ----
export const LANE_H = 7; // m over the lane: the ground at the bottom edge of a 4:3 screen (tan 25.6°) is then beyond D 13 (6.6 m)
export const MOUTH = { x: 0, z: -90 }; // where the camera stands still at the wood's mouth, looking in (−Z)
// The S-bend: two arcs of about 35 m radius, 40 degrees each (turn 9.5°/s at 6 m/s is a 36 m radius). Each arc's heading change is
// TURN · (1 + HOLD) with eases of 1 s in and out and 1.6 s through zero between them (each half of it adds TURN/2): 40 degrees.
export const TURN = 9.5;
export const BEND = { from: 30.5, ease: 1, flip: 1.6, hold: 40 / TURN - 1 };
// The clouds: base 60 m over the lane, the sea's top at 72 (puffs reach above it here and there); the climb goes on to 105 m and
// the dive starts there. Inside, everything is white (whiteAt): wherever the base or the sea's top would come nearer than 7 m to
// the camera (on the 4:3 screen the frame's corner reaches 6.6 m above and below at D), and eased over 11-12 m outside that.
export const CLOUD = { base: 60, top: 72, clear: 7, ease: [12, 11] };

const b0 = BEND.from, b1 = b0 + BEND.ease, b2 = b1 + BEND.hold, b3 = b2 + BEND.flip, b4 = b3 + BEND.hold;
export const FILM_CHANGES = [
  // 3. Samflug: off backwards from the wood's mouth
  { t: 20, over: 1.5, back: 5 },
  // 4. Beygjurnar: a little faster, and the S
  { t: 29, over: 1, back: 6 },
  { t: b0, over: BEND.ease, turn: TURN },
  { t: b2, over: BEND.flip, turn: -TURN },
  { t: b4, over: BEND.ease, turn: 0 },
  // 5. Upp: climbing at 8 m/s, slower backwards
  { t: 40.5, over: 1.5, up: 8, back: 3 },
  { t: 52.5, over: 2, up: 0, back: 2 },
  // 7. Dýfan: down at 4 m/s while she comes near and holds (58.5-61.5), then 12 m/s into the cloud, then braking to the lane
  { t: 57.5, over: 1, up: -4 },
  { t: 61.5, over: 1.5, up: -12 },
  { t: 67, over: 4, up: 0 },
  // 8. Kveðjan: the camera slows to a stop over the lane
  { t: 68, over: 3, back: 0 },
];
export const FILM_LENGTH = 76;
export const filmRoute = () => makeRoute(FILM_CHANGES, { start: { x: MOUTH.x, y: LANE_H, z: MOUTH.z, yaw: 0 }, length: FILM_LENGTH });

/** How white the picture is with the camera at height y over the lane (1 inside the cloud's base-to-top layer and near it). */
export function whiteAt(y, c = CLOUD) {
  const lo = c.base - c.clear, hi = c.top + c.clear;
  if (y >= lo && y <= hi) return 1;
  if (y < lo) return smooth(1 - (lo - y) / c.ease[0]);
  return smooth(1 - (y - hi) / c.ease[1]);
}

// ---- the two motion trials (step 1): stretches of the film's own camera, looped (so the lane and the clouds are the film's) ----
// beygja: the run into the S at 6 m/s, both arcs and out (13 s); upp: the climb at 8 m/s through the cloud, the seconds above it, the
// dive (4 m/s through her hold, then 12 m/s) through the cloud again and the brake over the lane (31.5 s: the climb and the dive
// alone are 98 m each way, so it cannot be 20 s at these speeds)
export const TRIALS = { beygja: { from: 28.5, to: 41.5 }, upp: { from: 39.5, to: 71 } };
