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
export function makeRoute(allChanges, { start = { x: 0, y: 7, z: 0, yaw: 0 }, length, dt = 1 / 120 } = {}) {
  // a { t, jump } moves the camera's height at once by `jump` metres: only ever inside the full white, where nothing is seen (the
  // film's two clouds passages are each kept to about a second of white so)
  const jumps = allChanges.filter(c => c.jump !== undefined).sort((a, b) => a.t - b.t);
  const changes = allChanges.filter(c => c.jump === undefined);
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
  let nextJump = 0;
  for (let i = 0; i <= n; i++) {
    while (nextJump < jumps.length && jumps[nextJump].t <= i * dt) y += jumps[nextJump++].jump;
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
  return { at, length, dt, samples, stats, rates: { back, up, turn }, jumps };
}

// ---- the film's camera (the storyboard, section 4) ----
export const LANE_H = 7; // m over the lane: the ground at the bottom edge of a 4:3 screen (tan 25.6°) is then beyond D 13 (6.6 m)
export const MOUTH = { x: 0, z: -90 }; // where the camera stands still at the wood's mouth, looking in (−Z)
// The S-bend: two arcs of about 35 m radius, 40 degrees each (turn 9.5°/s at 6 m/s is a 36 m radius). Each arc's heading change is
// TURN · (1 + HOLD) with eases of 1 s in and out and 1.6 s through zero between them (each half of it adds TURN/2): 40 degrees.
export const TURN = 9.5;
export const BEND = { from: 30.5, ease: 1, flip: 1.6, hold: 40 / TURN - 1 };
// The clouds: base 84 m over the lane, the sea's top at 96 (puffs reach above it here and there). Inside, everything is white
// (whiteAt): wherever the base or the sea's top would come nearer than 7 m to the camera (on the 4:3 screen the frame's corner
// reaches 6.6 m above and below at D), and eased over 9 m outside that (0.75 s at the dive's 12 m/s, 1.1 s at the climb's 8).
// The base is that high for the dive: the white is gone 68 m over the lane, and below that she comes near (1.25 s), holds the peak
// 2 s, all at 12 m/s, and the brake from 12 m/s to the lane takes 4 s (24 m).
export const CLOUD = { base: 84, top: 96, clear: 7, ease: [9, 9] };
// The full white is kept short: the camera's height skips inside it (a jump), so it shows WHITE seconds of white on the way up and
// on the way down, not the whole layer at speed.
export const WHITE = { up: 1.2, down: 1.0 };
export const DIVE = { tip: 59.5, down: 12, brake: 67 }; // she tips over at 59.5 s; 12 m/s down until the brake at 67

const b0 = BEND.from, b1 = b0 + BEND.ease, b2 = b1 + BEND.hold, b3 = b2 + BEND.flip, b4 = b3 + BEND.hold;
const rateChanges = level => [
  // 3. Samflug: off backwards from the wood's mouth
  { t: 20, over: 1.5, back: 5 },
  // 4. Beygjurnar: a little faster, and the S
  { t: 29, over: 1, back: 6 },
  { t: b0, over: BEND.ease, turn: TURN },
  { t: b2, over: BEND.flip, turn: -TURN },
  { t: b4, over: BEND.ease, turn: 0 },
  // 5. Upp: climbing at 8 m/s, slower backwards, levelling off over the cloud sea (when: `level`, found below)
  { t: 40.5, over: 1.5, up: 8, back: 3 },
  { t: 52.5, over: 2, back: 2 },
  { t: level, over: 2, up: 0 },
  // 7. Dýfan: she tips over and plunges at 12 m/s, through the cloud (a second of white), out under its base, comes near and holds
  // the peak 2 s, all at 12 m/s; then the brake to the lane
  { t: DIVE.tip, over: 1.5, up: -DIVE.down },
  { t: DIVE.brake, over: 4, up: 0 },
  // 8. Kveðjan: the camera slows to a stop over the lane
  { t: 68, over: 3, back: 0 },
];
export const FILM_LENGTH = 76;
const START = { x: MOUTH.x, y: LANE_H, z: MOUTH.z, yaw: 0 };
const lo = CLOUD.base - CLOUD.clear, hi = CLOUD.top + CLOUD.clear;
// the jumps for a given levelling-off second: each in the middle of its full white, as long as that white should last
function withJumps(level) {
  const rates = rateChanges(level);
  const plain = makeRoute(rates, { start: START, length: FILM_LENGTH, dt: 1 / 60 });
  let t = 40;
  while (plain.at(t).y < lo) t += 1 / 240;
  const jUp = { t: t + WHITE.up / 2, jump: (hi - lo) - plain.at(t).up * WHITE.up };
  const climbed = makeRoute([...rates, jUp], { start: START, length: FILM_LENGTH, dt: 1 / 60 });
  t = DIVE.tip;
  while (climbed.at(t).y > hi) t += 1 / 240;
  const jDown = { t: t + WHITE.down / 2, jump: -((hi - lo) - DIVE.down * WHITE.down) };
  return [...rates, jUp, jDown];
}
// the levelling-off second that brings the camera back to LANE_H over the lane at the end (bisection: a later one climbs higher)
const LEVEL = (() => {
  let a = 50, b = 58;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    const end = makeRoute(withJumps(m), { start: START, length: FILM_LENGTH, dt: 1 / 60 }).at(FILM_LENGTH).y;
    if (end > LANE_H) b = m; else a = m;
  }
  return (a + b) / 2;
})();
export const FILM_CHANGES = withJumps(LEVEL);
export const filmRoute = () => makeRoute(FILM_CHANGES, { start: START, length: FILM_LENGTH });

/** How white the picture is with the camera at height y over the lane (1 inside the cloud's base-to-top layer and near it). */
export function whiteAt(y, c = CLOUD) {
  const lo = c.base - c.clear, hi = c.top + c.clear;
  if (y >= lo && y <= hi) return 1;
  if (y < lo) return smooth(1 - (lo - y) / c.ease[0]);
  return smooth(1 - (y - hi) / c.ease[1]);
}

// ---- the two motion trials (step 1): stretches of the film's own camera, looped (so the lane and the clouds are the film's) ----
// beygja: the run into the S at 6 m/s, both arcs and out (13 s); upp: the climb at 8 m/s through the cloud, the seconds above it, the
// dive at 12 m/s through the cloud again, her peak under it and the brake over the lane
export const TRIALS = { beygja: { from: 28.5, to: 41.5 }, upp: { from: 39.5, to: 71 } };
