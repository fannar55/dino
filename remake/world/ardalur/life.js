// The life in the flight that nobody taps (the life spec, 2026-11-05, sections 3 and 8): what lives along her way and flees as she
// comes, besides the groups she calls to (animals.js).
//   A and B: five early birds in the Fen's reed fly up as she comes over them; four dragonflies hover in the reed.
//   B and C: ten fish jump in her lane ahead of her; eight water striders by the banks of the lazy reach skate off from a skim.
//   C: six trees on the banks between the groups, four birds in each, fly up as she passes.
//   F and G: at the big call, rows of small lizards stream out of the groves toward the far pool, and flocks of birds rise out of
//   the groves above the falls and fly off toward it (the life spec 2F and 2G).
//
//   const life = createLife(world, route, { heightAt, library, crowds, critters }); // library: the forest's species (the trees'
//                        crowns); critters: { smaedla } (animals.js loadCritters), the Fen's salamander stands in for the rows without it
//   life.things          [{ id, kind, at, trigger, position, visible, ... }]: each critter, where it sits (at) and the flight second
//                        it sets off (trigger; null for those that only hover or skate), its pose at the last update
//   life.rows            [{ id, where ('F' or 'G'), from, dir, length, delay, members }]: the rows of small lizards, `from` the front
//   life.flocks          [{ id, from, dir, delay, members }]: the flocks of birds, `from` the middle of the grove they sit in
//   life.props           the trees the birds sit in, for the plants to grow (banks.js); life.clear  where nothing else may grow
//   life.update(dt, t)   each frame, on the game clock t; the flight's own time is world.flightTime (null or < 0 outside the flight)
//   life.skim(x, z)      she skims the water at (x, z): the striders within 10 m skate off and back
//   life.bigCall(at)     the big call came at flight second `at` (chapters/kafli4-flight-play.js): the rows and the flocks set off
//   life.dispose()
//
// Every trigger is a flight time worked out at build from the schedule (route.progressAt), and the big call's is given as a flight
// time, so a pose is a function of world.flightTime: a seek or a capture finds them where playing would have. A skate is timed on the
// game clock, as an answer is. Outside the flight they are all where they sat, but the rows and the flocks of a call made: they are
// gone (the far pool has its own). They are drawn in the crowds (world/critters/crowd.js), given or their own.
import * as THREE from 'three';
import { BEATS, FAR_POOL } from '../../chapters/kafli4-route.js';
import { createModel } from '../critters/models.js';
import { createCrowds } from '../critters/crowd.js';
import { clipPose } from '../critters/crowd-models.js';
import { crownOf } from './animals.js';
import { fenShare } from './terrain.js';

/**
 * How much larger than life each is drawn, to read from her back (as animals.js SCALE). The rows' small lizards are seen from 20 to
 * 50 m above them, 40 to 150 m off: 2 m long (C's, seen close by the river, are 1.2 m); the salamander stands in at about that size.
 */
export const LIFE_SCALE = { earlyBird: 5, dragonfly: 5, fish: 6.5, bird: 7, waterStrider: 10, smaedla: 2.5, salamander: 6 };
const TAU = Math.PI * 2;
const clamp01 = k => Math.min(1, Math.max(0, k));
const smooth = k => { const x = clamp01(k); return x * x * (3 - 2 * x); };
const headingOf = (dx, dz) => THREE.MathUtils.radToDeg(Math.atan2(dz, dx)); // degrees: 0 faces +X, 90 faces +Z

// A flier that flies up and away: `climb` m/s up (less `drag`), `away` m/s off (gaining `faster`), out of sight at `gone` seconds.
const FLUSH = { gone: 3.5, climb: 4.2, drag: 0.3, away: 5, faster: 0.6, ahead: 0.4, beat: 7 };
// The Fen's early birds: by her path at these flight seconds, on alternate sides, as far off as the first of `off` that is in the
// Fen's reed and lets her come within `within` metres; they fly up when she does.
const FEN_BIRDS = { at: [5.5, 7.5, 9.5, 11.5, 13.5], off: [9, 8, 10, 7, 11, 6, 12], within: 14 };
const FEN_FLIES = { at: [7, 10.5, 14, 17], off: [8, 10, 7, 12], up: 1.4 };
// The fish: one every `every` metres up the river from `from`, `off` metres beside her path, jumping `height` m in `seconds` when
// she is `ahead` metres before it, `across` metres out from her path.
const FISH = { from: 30, every: 88, off: [3.5, 4.5, 5.5], ahead: 24, height: 1.2, seconds: 0.8, across: 1.4 };
// The bank trees: in the gaps between the groups (but those just after a group of birds; the third on the far bank from the second
// water-level shot, which stands by the near one), `e` m from the water, `scale` as the birds' trees in animals.js; four birds in
// the crown's river side ([turn from facing the river, height in the crown]).
const PERCHES = { gaps: [0, 1, 3, 4, 6, 7], side: [-1, 1, -1, -1, -1, 1], e: 7, scale: 0.65, within: 20, out: 0.85, birds: [[-0.7, 0.3], [-0.25, -0.05], [0.25, 0.4], [0.7, 0.1]] };
// The water striders: one every `every` metres from `from`, on alternate banks, `e` from the water's edge; a skim within `reach`
// sends them `out` metres off and back in `seconds`.
const STRIDERS = { from: 40, every: 55, count: 8, e: [-2.0, -2.5, -3.0], reach: 10, out: 1.5, seconds: 2 };
// F and G, the big call's rows of small lizards: each huddles in its grove, its front at `from`, and runs toward `to` (the far pool's
// middle if not given) `length` metres (to `to` if not given), setting off `delay` s after the call. Each is placed where the flight's
// shots after the call see it (measured on the flight camera, 2026-11-06): F1 over the land above the falls to the top of its step (the
// vista, under reduced motion); F2 and F3 out of the groves at the step's foot (the slow circle round her); G1 and G2 across the low
// land toward the far pool's north bank (the glide down). All at least 25 m from her path, seen from above.
const ROWS = [
  { id: 'F1', where: 'F', from: [-1410, 20], length: 62, delay: 0.5 },
  { id: 'F2', where: 'F', from: [-1300, -40], length: 90, delay: 0.9 },
  { id: 'F3', where: 'F', from: [-1332, 1.5], length: 100, delay: 1.3 },
  { id: 'G1', where: 'G', from: [-1125, -4], to: [-990, 24], delay: 0.7 },
  { id: 'G2', where: 'G', from: [-1115, 14], to: [-982, 36], delay: 1.1 },
];
// A row: `count` lizards huddled in pairs `pair` m apart (`side` m to each side, the first number and up to the second more), off one
// after another `stagger` s apart, up to `speed` m/s in `accel` s, easing to a stop over the last `ease` m and huddling again. Their
// legs go round once every `stride` m. Nothing grows within `lane` m of the way they run (circles every `step` m).
const ROW = { count: 10, pair: 1.4, side: [0.6, 0.5], stagger: 0.3, speed: 4.5, accel: 0.8, ease: 3, stride: 1.6, lane: 2.2, step: 3 };
// The flocks: `count` birds each in the crowns of a grove above the falls (`canopy` m over the ground, within `spread` m of its
// middle), off `delay` s after the call (each bird up to `stagger` s later), up `rise` m in `riseFor` s and on up `climb` m/s, toward
// the far pool at up to `speed` m/s (in `accel` s), gone at `gone` s, behind her by then. Each grove is one the flight's shots see.
const FLOCKS = [
  { id: 'flock-1', from: [-1410, -20], delay: 1.0 },
  { id: 'flock-2', from: [-1430, -60], delay: 1.7 },
  { id: 'flock-3', from: [-1428, 92], delay: 2.3 }, // 26 m from where she flies over its grove at 135 s
  { id: 'flock-4', from: [-1505, 5], delay: 2.9 },
];
const FLOCK = { count: 18, canopy: 8, spread: 6, stagger: 0.6, rise: 16, riseFor: 3, climb: 1.2, speed: 9, accel: 2.5, gone: 22, beat: 7 };

export function createLife(world, route, { heightAt = () => 0, library = null, crowds = null, critters = {} } = {}) {
  const { river } = route;
  const own = !crowds;
  crowds ??= createCrowds(world);
  const baked = critters.smaedla ?? null;
  const LIZARD = baked ? 'smaedla' : 'salamander';
  const her = new THREE.Vector3();
  const herAt = (t, out = her) => route.pointAt(route.progressAt(Math.min(BEATS.END, Math.max(0, t))), out);
  /** Her way, seen from above, at flight second t: forward and to her right. */
  const wayAt = t => {
    const a = herAt(t - 0.5, new THREE.Vector3());
    const b = herAt(t + 0.5, new THREE.Vector3());
    const f = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const fx = (b.x - a.x) / f, fz = (b.z - a.z) / f;
    return { fx, fz, rx: -fz, rz: fx };
  };
  /** The first flight second she is within `reach` of `point` (seen from above when `flat`), to a millisecond; null if never. */
  function firstWithin(point, reach, flat = false) {
    const dist = t => { herAt(t); return flat ? Math.hypot(her.x - point.x, her.z - point.z) : her.distanceTo(point); };
    for (let t = 0; t <= BEATS.END; t += 0.05) {
      if (dist(t) > reach) continue;
      let lo = Math.max(0, t - 0.05);
      let hi = t;
      if (dist(lo) <= reach) return lo;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (dist(mid) <= reach) hi = mid; else lo = mid; }
      return hi;
    }
    return null;
  }
  /** How near her path comes to `point` over the flight. */
  const closest = point => { let best = Infinity; for (let t = 0; t <= BEATS.END; t += 0.1) best = Math.min(best, herAt(t).distanceTo(point)); return best; };
  /** A spot on the bank: `along` metres up the river from distance d, `e` from the water's edge on `side` (as animals.js). */
  function spot(d, side, e) {
    const r = river.at(d);
    const nx = -r.dir[1] * side;
    const nz = r.dir[0] * side;
    return { x: r.x + nx * (r.half + e), z: r.z + nz * (r.half + e), level: r.level, dir: r.dir, out: [nx, nz] };
  }

  const models = {};
  const modelOf = kind => (models[kind] ??= (() => {
    // the owner's small lizard: its frames' names, as the crowd draws them, and its height standing
    if (kind === 'smaedla') return { morphs: (baked.lods[0].geometry.morphAttributes.position ?? []).map(a => a.name), height: baked.height, wings: false };
    const model = createModel(kind);
    model.geometry.computeBoundingBox();
    model.height = model.geometry.boundingBox.max.y - model.geometry.boundingBox.min.y;
    return model;
  })());
  const things = [];
  const props = [];
  const clear = [];
  function add(id, kind, at, heading, extra = {}) {
    const model = modelOf(kind);
    const scale = LIFE_SCALE[kind];
    const thing = {
      id, kind, at, trigger: null, position: at.clone(), visible: true, heading, rest: heading, scale, pitch: 0, squash: [1, 1, 1],
      morphs: Object.fromEntries(model.morphs.map(name => [name, 0])), wings: model.wings ? [0, 0] : null, height: model.height * scale,
      phase: things.length * 1.37, ...extra,
    };
    things.push(thing);
    return thing;
  }

  // A: the Fen's early birds, and its dragonflies, by her path where the reed is
  FEN_BIRDS.at.forEach((t, k) => {
    const p = herAt(t, new THREE.Vector3());
    const way = wayAt(t);
    const side = k % 2 ? 1 : -1;
    const at = FEN_BIRDS.off.map(off => {
      const x = p.x + way.rx * side * off, z = p.z + way.rz * side * off;
      return new THREE.Vector3(x, heightAt(x, z), z);
    }).find(a => fenAt(a) && closest(a) <= FEN_BIRDS.within - 1 && closest(a) >= 4);
    if (!at) throw new Error(`[life] no spot in the Fen's reed by her path at ${t} s`);
    const bird = add(`fen-bird-${k}`, 'earlyBird', at, headingOf(way.fx, way.fz) + 35 * Math.sin(k * 2.1), {
      dir: unit(way.rx * side + FLUSH.ahead * way.fx, way.rz * side + FLUSH.ahead * way.fz),
    });
    bird.trigger = firstWithin(at, FEN_BIRDS.within);
    clear.push({ x: at.x, z: at.z, r: 0.25 * bird.scale + 0.4 });
  });
  FEN_FLIES.at.forEach((t, k) => {
    const p = herAt(t, new THREE.Vector3());
    const way = wayAt(t);
    const side = k % 2 ? -1 : 1;
    const at = FEN_FLIES.off.map(off => {
      const x = p.x + way.rx * side * off, z = p.z + way.rz * side * off;
      return new THREE.Vector3(x, heightAt(x, z) + FEN_FLIES.up, z);
    }).find(a => fenAt(a) && closest(a) >= 5);
    if (!at) throw new Error(`[life] no spot in the Fen's reed for a dragonfly at ${t} s`);
    const fly = add(`fen-dragonfly-${k}`, 'dragonfly', at, headingOf(way.fx, way.fz) + 70 * Math.sin(k * 2.3));
    clear.push({ x: at.x, z: at.z, r: 0.25 * fly.scale + 0.4 });
  });
  function fenAt(a) {
    const w = route.river.nearest(a.x, a.z);
    const edge = w.dist - river.at(w.d).half;
    return fenShare(a.x, a.z) > 0.6 && edge > 1;
  }

  // B and C: the fish, in her lane, each jumping out from her path as she comes
  for (let k = 0; k < 10; k++) {
    const d = FISH.from + k * FISH.every;
    const r = river.at(d);
    let tNear = 0;
    let best = Infinity;
    for (let t = BEATS.B; t <= BEATS.E; t += 0.05) {
      herAt(t);
      const dd = Math.hypot(her.x - r.x, her.z - r.z);
      if (dd < best) { best = dd; tNear = t; }
    }
    const p = herAt(tNear, new THREE.Vector3());
    const way = wayAt(tNear);
    const side = k % 2 ? 1 : -1;
    const off = FISH.off[k % FISH.off.length];
    const x = p.x + way.rx * side * off, z = p.z + way.rz * side * off;
    const level = river.at(river.nearest(x, z).d).level;
    const at = new THREE.Vector3(x, level, z);
    const fish = add(`fish-${k}`, 'fish', at, headingOf(way.rx * side, way.rz * side), { dir: [way.rx * side, way.rz * side] });
    fish.trigger = firstWithin(at, FISH.ahead, true);
  }

  // C: the bank trees between the groups, and their birds
  const groupDs = route.groups.map(g => river.nearest(g.at[0], g.at[2]).d);
  PERCHES.gaps.forEach((gap, i) => {
    const d = (groupDs[gap] + groupDs[gap + 1]) / 2;
    const side = PERCHES.side[i];
    const base = spot(d, side, PERCHES.e);
    const tree = { name: 'broadleaf', variant: i % 2, x: base.x, y: heightAt(base.x, base.z), z: base.z, rot: (i * 2.3 + 0.7) % TAU, scale: PERCHES.scale };
    props.push(tree);
    clear.push({ x: tree.x, z: tree.z, r: 2.0 });
    const crown = crownOf(tree, library);
    const water = spot(d, side, 0);
    PERCHES.birds.forEach(([turn, up], k) => {
      const tx = -water.out[0], tz = -water.out[1];
      const ox = tx * Math.cos(turn) - tz * Math.sin(turn);
      const oz = tx * Math.sin(turn) + tz * Math.cos(turn);
      const ring = Math.sqrt(1 - up * up) * crown.r * PERCHES.out;
      const at = new THREE.Vector3(crown.middle.x + ox * ring, crown.middle.y + up * crown.ry, crown.middle.z + oz * ring);
      const bird = add(`tree-${i}-bird-${k}`, 'bird', at, headingOf(ox, oz), {
        dir: unit(water.out[0] + FLUSH.ahead * water.dir[0], water.out[1] + FLUSH.ahead * water.dir[1]),
      });
      bird.trigger = firstWithin(at, PERCHES.within);
    });
  });

  // B and C: the water striders, near the banks of the lazy reach
  for (let k = 0; k < STRIDERS.count; k++) {
    const d = STRIDERS.from + k * STRIDERS.every;
    const side = k % 2 ? 1 : -1;
    const w = spot(d, side, STRIDERS.e[k % STRIDERS.e.length]);
    const at = new THREE.Vector3(w.x, w.level, w.z);
    const strider = add(`strider-${k}`, 'waterStrider', at, headingOf(w.dir[0], w.dir[1]) + 50 * Math.sin(k * 1.9), { skate: null });
    clear.push({ x: at.x, z: at.z, r: 0.25 * strider.scale + 0.4 });
  }

  // F and G: the big call's rows of small lizards, huddled in pairs in their groves until it comes
  let call = null;
  const across = (r, along, side) => [r.from[0] + r.dir[0] * along - r.dir[1] * side, r.from[1] + r.dir[1] * along + r.dir[0] * side];
  const rows = ROWS.map(spec => {
    const to = spec.to ?? FAR_POOL.center;
    const dx = to[0] - spec.from[0], dz = to[1] - spec.from[1];
    const far = Math.hypot(dx, dz);
    const row = { id: spec.id, where: spec.where, from: [...spec.from], dir: [dx / far, dz / far], length: spec.length ?? far, delay: spec.delay, members: [] };
    const run = headingOf(row.dir[0], row.dir[1]);
    for (let k = 0; k < ROW.count; k++) {
      const along = -Math.floor(k / 2) * ROW.pair;
      const side = (k % 2 ? 1 : -1) * (ROW.side[0] + ROW.side[1] * ((k * 0.37) % 1));
      const [x, z] = across(row, along, side);
      row.members.push(add(`${row.id}-lizard-${k}`, LIZARD, new THREE.Vector3(x, heightAt(x, z), z), run + 30 * Math.sin(k * 1.7 + row.delay), { row, k, along, side, run }));
    }
    // nothing grows in the way they run, from the tail of the huddle to where they huddle again
    for (let a = -Math.floor((ROW.count - 1) / 2) * ROW.pair - ROW.lane; a <= row.length + ROW.lane; a += ROW.step) {
      const [x, z] = across(row, a, 0);
      clear.push({ x, z, r: ROW.lane });
    }
    return row;
  });
  // and the flocks in the crowns of the groves above the falls, unseen until they fly up
  const flocks = FLOCKS.map(spec => {
    const dx = FAR_POOL.center[0] - spec.from[0], dz = FAR_POOL.center[1] - spec.from[1];
    const far = Math.hypot(dx, dz);
    const flock = { id: spec.id, from: [...spec.from], dir: [dx / far, dz / far], delay: spec.delay, members: [] };
    for (let k = 0; k < FLOCK.count; k++) {
      const r = FLOCK.spread * Math.sqrt((k + 0.5) / FLOCK.count);
      const a = k * 2.39996; // the golden angle: a disc of them, none on another
      const x = spec.from[0] + r * Math.cos(a), z = spec.from[1] + r * Math.sin(a);
      const at = new THREE.Vector3(x, heightAt(x, z) + FLOCK.canopy + 1.5 * Math.sin(k * 1.3), z);
      flock.members.push(add(`${flock.id}-bird-${k}`, 'bird', at, headingOf(flock.dir[0], flock.dir[1]) + 12 * Math.sin(k * 2.7), {
        flock, k, late: FLOCK.stagger * ((k * 0.61) % 1),
      }));
    }
    return flock;
  });

  for (const kind of new Set(things.map(t => t.kind))) {
    crowds.reserve(kind, things.filter(t => t.kind === kind).length, kind === 'smaedla' ? baked : { model: modelOf(kind) });
  }

  let last = 0;
  const now = () => world.clock?.time ?? last;

  /** A flier perched at `at` until `s` = 0 (its trigger), then up and away, gone at FLUSH.gone. */
  function flier(b, s, clock) {
    b.wings[0] = 0;
    b.wings[1] = 0;
    if (s < 0) return;
    if (s >= FLUSH.gone) { b.visible = false; return; }
    const up = FLUSH.climb * s - FLUSH.drag * s * s;
    const off = FLUSH.away * s + FLUSH.faster * s * s;
    b.position.set(b.at.x + b.dir[0] * off, b.at.y + up, b.at.z + b.dir[1] * off);
    b.heading = headingOf(b.dir[0], b.dir[1]);
    b.pitch = 0.5 * (1 - smooth(s / 1.5));
    b.wings[0] = 0.15 + 0.6 * Math.sin(TAU * FLUSH.beat * clock + b.phase);
    b.wings[1] = smooth(s / 0.2);
  }

  /** How far a row's lizard has run `u` s after it set off, eased to a stop at `length` m, and how much of its pose is running. */
  function ran(u, length) {
    if (u <= 0) return [0, 0];
    const d = u < ROW.accel ? (ROW.speed * u * u) / (2 * ROW.accel) : ROW.speed * (u - ROW.accel / 2);
    const running = smooth(u / ROW.accel);
    const easing = length - ROW.ease;
    if (d <= easing) return [d, running];
    const x = Math.min(2, (d - easing) / ROW.ease); // slowing evenly: the last `ease` metres take twice the running
    return [easing + ROW.ease * (x - (x * x) / 4), running * (1 - x / 2)];
  }

  /**
   * A row's small lizard: standing about in its grove until the big call, then off after the one before it toward the far pool,
   * huddling again where its row stops; gone once the flight is over. Its frames' weights add up to 1 (clipPose).
   */
  function lizard(b, ft, clock) {
    const { row } = b;
    if (call !== null && ft === null) { b.visible = false; return; }
    const u = call === null || ft === null ? 0 : ft - call - row.delay - b.k * ROW.stagger;
    const [travelled, running] = ran(u, row.length);
    if (u > 0) {
      const [x, z] = across(row, b.along + travelled, b.side);
      b.position.set(x, heightAt(x, z), z);
      b.heading = lerpAngle(b.rest, b.run, smooth(u / 0.4));
    }
    for (const name in b.morphs) b.morphs[name] = 0;
    if (b.kind === 'smaedla') {
      const blend = (frames, w) => { if (w > 0) for (const name in frames) b.morphs[name] += frames[name] * w; };
      blend(clipPose(baked, 'idle', clock, b.phase), 1 - running);
      blend(clipPose(baked, 'run', (travelled / ROW.stride) * baked.clips.run.seconds, b.phase), running);
    } else {
      const step = Math.sin((TAU * travelled) / ROW.stride);
      b.morphs.curl = 0.45 * (0.5 + 0.5 * Math.sin((TAU * clock) / 7 + b.phase)) * (1 - running);
      b.morphs.walkA = running * Math.max(0, step);
      b.morphs.walkB = running * Math.max(0, -step);
    }
  }

  /** A flock's bird: unseen in the crowns until the big call, then up out of the grove and off toward the far pool. */
  function flocking(b, ft, clock) {
    const { flock } = b;
    b.wings[0] = 0;
    b.wings[1] = 0;
    const s = call === null || ft === null ? -1 : ft - call - flock.delay - b.late;
    if (s < 0 || s >= FLOCK.gone) { b.visible = false; return; }
    const up = FLOCK.rise * smooth(s / FLOCK.riseFor) + FLOCK.climb * s;
    const off = s < FLOCK.accel ? (FLOCK.speed * s * s) / (2 * FLOCK.accel) : FLOCK.speed * (s - FLOCK.accel / 2);
    b.position.set(b.at.x + flock.dir[0] * off, b.at.y + up, b.at.z + flock.dir[1] * off);
    b.heading = b.rest + 6 * Math.sin((TAU * clock) / 3.1 + b.phase);
    b.pitch = 0.5 * (1 - smooth(s / 1.5));
    b.wings[0] = 0.15 + 0.6 * Math.sin(TAU * FLOCK.beat * clock + b.phase);
    b.wings[1] = smooth(s / 0.2);
  }

  /** Each thing's pose: `ft` the flight's time (null outside the flight), `clock` what its idle life runs on, `t` the game clock. */
  function pose(b, ft, clock, t) {
    b.position.copy(b.at);
    b.heading = b.rest;
    b.visible = true;
    b.pitch = 0;
    b.squash[0] = 1; b.squash[1] = 1; b.squash[2] = 1;
    const p = b.phase;
    const s = ft === null || b.trigger === null ? -Infinity : ft - b.trigger;
    switch (b.kind) {
      case 'earlyBird':
        b.morphs.look = Math.max(0, Math.sin(TAU * clock / 5 + p)) ** 2;
        b.squash[1] = 1 + 0.02 * Math.sin(TAU * 0.9 * clock + p);
        flier(b, s, clock);
        break;
      case 'smaedla':
      case 'salamander':
        lizard(b, ft, clock);
        break;
      case 'bird':
        if (b.flock) { flocking(b, ft, clock); break; }
        b.heading = b.rest + 18 * Math.sin(TAU * clock / 4.3 + p) * Math.max(0, Math.sin(TAU * clock / 11 + 2 * p));
        b.squash[1] = 1 + 0.02 * Math.sin(TAU * 0.9 * clock + p);
        flier(b, s, clock);
        break;
      case 'dragonfly': {
        b.morphs.hover = 1;
        b.wings[0] = 0.12 + 0.6 * Math.sin(TAU * 11 * clock + p);
        b.wings[1] = 1;
        b.position.x += 0.35 * Math.sin(clock * 0.83 + p);
        b.position.y += 0.15 * Math.sin(clock * 1.9 + 2 * p);
        b.position.z += 0.3 * Math.sin(clock * 0.61 + 3 * p);
        b.heading = b.rest - 20 * Math.sin(clock * 0.47 + p);
        break;
      }
      case 'fish': {
        // under the water, out of sight, but for its one jump
        if (!(s >= 0 && s <= FISH.seconds)) { b.visible = false; break; }
        const a = s / FISH.seconds;
        b.position.set(b.at.x + b.dir[0] * FISH.across * a, b.at.y + 4 * FISH.height * a * (1 - a), b.at.z + b.dir[1] * FISH.across * a);
        b.pitch = 0.8 * Math.atan2(4 * FISH.height * (1 - 2 * a), FISH.across);
        b.morphs.flex = Math.sin(TAU * a);
        break;
      }
      case 'waterStrider': {
        const a = b.skate ? (t - b.skate.start) / STRIDERS.seconds : -1;
        if (a >= 0 && a < 1) {
          const off = STRIDERS.out * Math.sin(Math.PI * a);
          b.position.x += b.skate.dir[0] * off;
          b.position.z += b.skate.dir[1] * off;
          b.heading = headingOf(b.skate.dir[0], b.skate.dir[1]) + (a > 0.5 ? 180 * smooth((a - 0.5) / 0.15) : 0);
          b.morphs.row = 0.5 + 0.5 * Math.sin(TAU * 4 * a);
        } else {
          b.heading = b.rest + 25 * Math.sin(clock * 0.4 + p);
          b.morphs.row = Math.max(0, Math.sin(clock * 1.7 + p)) ** 4;
        }
        break;
      }
      default: break;
    }
  }

  function update(dt, t = now()) {
    last = t;
    const ft = world.flightTime ?? null;
    const flying = ft !== null && ft >= 0;
    const clock = flying ? ft : t;
    if (own) crowds.begin(world.camera ?? null);
    for (const b of things) {
      pose(b, flying ? ft : null, clock, t);
      if (b.visible) crowds.place(b.kind, b.position, b.heading, b.scale, b);
    }
    if (own) crowds.end();
  }

  /** She skims the water at (x, z): the striders within reach that are not already off skate away from her and back. */
  function skim(x, z) {
    const t = now();
    for (const b of things) {
      if (b.kind !== 'waterStrider') continue;
      const dx = b.at.x - x, dz = b.at.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist > STRIDERS.reach) continue;
      if (b.skate && t >= b.skate.start && t - b.skate.start < STRIDERS.seconds) continue;
      b.skate = { start: t, dir: dist > 1e-6 ? [dx / dist, dz / dist] : [Math.cos(b.rest * Math.PI / 180), Math.sin(b.rest * Math.PI / 180)] };
    }
  }

  /** The big call came at flight second `at`: the rows and the flocks set off. The first call is the one. */
  function bigCall(at) {
    if (call === null && Number.isFinite(at)) call = at;
  }

  return {
    things, rows, flocks, props, clear, crowds, update, skim, bigCall,
    dispose() { if (own) crowds.dispose(); },
  };
}

const lerpAngle = (a, b, k) => a + (((b - a + 540) % 360) - 180) * k;

function unit(x, z) {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}
