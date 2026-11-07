// The life in the flight that nobody taps (the life spec, 2026-11-05, sections 3 and 8): what lives along her way and flees as she
// comes, besides the groups she calls to (animals.js).
//   A and B: five early birds in the Fen's reed fly up as she comes over them; four dragonflies hover in the reed.
//   B and C: ten fish jump in her lane ahead of her; eight water striders by the banks of the lazy reach skate off from a skim.
//   C: six trees on the banks between the groups, four birds in each, fly up as she passes.
//   F and G: at the big call, rows of small lizards stream out of the groves toward the far pool, and flocks of birds rise out of
//   the groves above the falls and fly off toward it (the life spec 2F and 2G).
//   F: a herd of the owner's grazer grazes above the falls, in three groups: in the open dale near the wide shot before the call,
//   in the step's north-east corner that the slow circle passes close as they lift their heads, and on the step's south side that it
//   sees after. At the call each lifts its head, walks, then trots toward the far pool to the end of its open ground, and stands looking.
//   D to G: the gorge's flyers leave their ledges as she passes, fly round her up the falls and in the slow circle, and come down on
//   the far pool's bank at the flight's end.
//   Scene 7 (chapters/kafli4.js): those that came stand at the far pool (FAR_POOL.gather): the G rows' small lizards, the herd's
//   corner group and the flyers, idle on the bank beyond Egill and Mosi, looking at her.
//
//   const life = createLife(world, route, { heightAt, library, crowds, critters }); // library: the forest's species (the trees'
//                        crowns); critters: { smaedla, grasbitur, flugdyr } (animals.js loadCritters), the Fen's salamander stands
//                        in for the rows without the first, there is no herd without the second and no flyers without the third
//   life.things          [{ id, kind, at, trigger, position, visible, ... }]: each critter, where it sits (at) and the flight second
//                        it sets off (trigger; null for those that only hover or skate), its pose at the last update
//   life.rows            [{ id, where ('F' or 'G'), from, dir, length, delay, members }]: the rows of small lizards, `from` the front
//   life.flocks          [{ id, from, dir, delay, members }]: the flocks of birds, `from` the middle of the grove they sit in
//   life.herd            [{ id, at, dir, room, members }]: the herd's groups, `room` how far they go ([] without the grazer)
//   life.flyers          the gorge's flyers, each with its ledge (nest), its place round her (slot) and its landing (land)
//   life.flyersOff       { at, side }: the flight second the first of them leaves its nest, and its side of her ('left' or 'right');
//                        null without them (chapters/kafli4-flight-play.js: they cry then)
//   life.arrivals        those that stand at the far pool in scene 7, each with its spot there (gather: { at, heading })
//   life.props           the trees the birds sit in, for the plants to grow (banks.js); life.clear  where nothing else may grow
//                        (the herd's ways: nothing taller than GRAZE.low)
//   life.update(dt, t)   each frame, on the game clock t; the flight's own time is world.flightTime (null or < 0 outside the flight)
//   life.skim(x, z)      she skims the water at (x, z): the striders within 10 m skate off and back
//   life.bigCall(at)     the big call came at flight second `at` (chapters/kafli4-flight-play.js): the rows, the flocks and the herd set off
//   life.arrive()        scene 7 has begun: from now on, outside the flight, the arrivals stand at the far pool
//   life.pool            chapter 5's (`choir` given: chapters/kafli5-pool.js POOL_LIFE): { frogs, turtles }, the frogs on their
//                        lily pads and the turtles on their stone at the far pool, there from the build (the crowds reserve them then)
//   life.moveTo(b, { at, via, heading, seconds })  one that stands at the pool (an arrival, or one of the pool's) walks there by
//                        the points `via` ([x, z]s: round the pool), a flyer flies, in `seconds` of game time, and stands there
//                        turned to `heading`
//   life.hop(b, { height, seconds })  it hops once where it is (a frog leaps), as it sings its tone (chapter 5's choir)
//   life.dispose()
//
// Every trigger is a flight time worked out at build from the schedule (route.progressAt), and the big call's is given as a flight
// time, so a pose is a function of world.flightTime: a seek or a capture finds them where playing would have. A skate is timed on the
// game clock, as an answer is. Outside the flight they are all where they sat, but the rows, the flocks and the herd of a call made:
// they are gone; and once scene 7 has begun (arrive), the arrivals stand at the far pool. They are drawn in the crowds
// (world/critters/crowd.js), given or their own.
import * as THREE from 'three';
import { BEATS, FAR_POOL, MEADOW, NESTS } from '../../chapters/kafli4-route.js';
import { createModel } from '../critters/models.js';
import { createCrowds } from '../critters/crowd.js';
import { clipPose } from '../critters/crowd-models.js';
import { crownOf } from './animals.js';
import { groveAt } from './banks.js';
import { fenShare } from './terrain.js';

/**
 * How much larger than life each is drawn, to read from her back (as animals.js SCALE). The rows' small lizards are seen from 20 to
 * 50 m above them, 40 to 150 m off: 2 m long (C's, seen close by the river, are 1.2 m); the salamander stands in at about that size.
 * The grazer is 7.5 m long, 2.9 m tall: the owner asked for the herd bigger and nearer (2026-11-06). The flyer is 2.4 m across its
 * wings: a third of hers, seen 5 to 12 m off.
 */
export const LIFE_SCALE = { earlyBird: 5, dragonfly: 5, fish: 6.5, bird: 7, waterStrider: 10, smaedla: 2.5, salamander: 6, grasbitur: 3, flugdyr: 2, frog: 4.5, turtle: 4.5 };
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp01 = k => Math.min(1, Math.max(0, k));
const smooth = k => { const x = clamp01(k); return x * x * (3 - 2 * x); };
const smoother = k => { const x = clamp01(k); return x * x * x * (x * (6 * x - 15) + 10); };
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
// vista, under reduced motion), south of the herd's corner group; F2 and F3 out of the groves at the step's foot (the slow circle round
// her); G1 and G2 across the low land toward the far pool's north bank (the glide down). All at least 25 m from her path, from above.
const ROWS = [
  { id: 'F1', where: 'F', from: [-1408, 10], length: 60, delay: 0.5 },
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
// F, the herd: the owner's grazer (drawn 2.5 m x LIFE_SCALE long), `count` of each group on a disc `spread` m round `at` (none nearer
// another than its own length). Measured on the flight camera (2026-11-06): the dale between the stream and the groves, 90-110 m
// from the wide shot (the vista, 124-131 s: 20 px tall, not the meadow's 6 at 180 m), north of its pond and 20 m from her way; the
// step's north-east corner, which the slow circle passes 40-60 m off as they lift their heads (call to 7 s after it: 30-50 px), and
// which the circle frames under reduced motion, a fixed vista; and the step's south side, which the slow circle frames from 2 s
// after the call to its end (20 px).
const HERD = [
  { id: 'dale', at: [-1502, 75], count: 6, spread: 13 },
  { id: 'step', at: [-1388, -30], count: 7, spread: 14 },
  { id: 'stepNorth', at: [-1367, 31], count: 5, spread: 12 },
];
// At the call each lifts its head from the grass (`up` s) `delay` s after it, the one in front first so none runs into another;
// looks about till `look` s; walks off over `start` s and walks `walk` s; then trots (taking `trotIn` s to), toward the far pool, its
// legs at their clips' stride, easing to a stop over the last `ease` m. Each group goes `margin` m short of where its open ground
// ends for the first of it (the step's edge, a grove, water, `path` m from her path; looked for to `reach` m), and stands looking
// about. They are drawn to `seen` m. Nothing taller than `low` m grows within `lane` m of where each stands and goes, nose to tail
// (circles every `step` m); the grass they graze stays.
const GRAZE = {
  delay: [0.5, 1.5], up: 0.5, look: 2, start: 0.4, walk: 4, trotIn: 1, ease: 4,
  margin: 6, reach: 200, steep: 0.8, rise: 6, path: 15, seen: 320, lane: 2.5, step: 2, low: 0.5,
};
// D to G, the gorge's flyers (the owner's flugdýr): one on each ledge of NESTS, perched until the schedule brings her within `within`
// m of it; then off the ledge (`out` m out the way it looks and `drop` m down over `off` s, going her way at `along` m/s) and into
// its place round her from `wait` s over `join` s. Its place (SLOTS: [ahead, to her right, up] m from her body, flat to her heading)
// is on its own wall's side of her, behind her, and at least 3 m over or under where the near cameras stand (the chase 3.2 m over
// her body, the face, the side and the slow circle 0.8 to 1.6 m), so it never comes into a shot's way. In formation it rides `bob`
// m up and down and `sway` m back and forth, and beats its wings for `beat[0]` s every `beat[1]` s, all the way up the falls
// (`climb`). In F the formation wheels `turns` times round her toward her right, easing in and out (`circle`; not under reduced
// motion). From `land.from` s (each `land.every` s after the one before) it draws ahead of her `land.ahead` m and comes down over
// `land.seconds` s in an arc (`land.arc` m over the straight way) onto its spot on the far pool's bank, flapping for the last `flare`.
const FLY = {
  within: 25, out: 3.5, drop: 1.5, off: 1.2, along: 6, wait: 0.3, join: 2.8, bob: 0.3, sway: 0.4, beat: [1.2, 4.5],
  climb: [105, 119.5], turns: 1, circle: [126, 149], land: { from: 162.5, every: 0.3, seconds: 4.5, ahead: 22, arc: 2.5, flare: 1.2 },
};
const SLOTS = {
  right: [[-3.5, 6, 5.2], [-6.5, 4.5, 6.4], [-5, 5.5, -2.4], [-8.5, 7.5, 5.6]],
  left: [[-7.5, -5.5, 6.2], [-4.5, -6, 7.4], [-9.5, -2.5, -2.4], [-9.5, -7.5, 5]],
};
// Where they land is the far pool's (FAR_POOL.gather, 'flyer'): its north-east bank, those on her left (north of her as she glides
// east) on the northern spots, away from her shallows, Egill's and Mosi's spots and the beds of reed.
// Scene 7, the arrivals (the life spec 2, scene 7): the rows of `rows` (they ran to the far pool's north bank), the herd's group
// `herd` and the flyers stand at the far pool's spots for them (FAR_POOL.gather: 'lizard', 'grazer', 'flyer'), each turned toward
// her in the shallows give or take `turn` degrees. The lizards stand about (now and then a look up, over `look` s), the grazers
// graze and look up by turns (over `graze` s). Nothing taller than `low` m grows within `lane` m of where they stand.
const GATHER = { rows: 'G', herd: 'stepNorth', turn: 25, look: 9, graze: 11, low: 0.4, lane: [1.6, 2.5] };
// Chapter 5's pool (createLife's `choir`): a frog sits LILY m over the water on its pad, the pads and the stone are grown with the
// banks, and a move turns its way over TURN of it at each end; a flyer flies over at most FLY_UP m; a hop is HOP's.
const POOL_LIFE = { lily: 0.03, pad: 2.2, padUp: 0.012, turn: 0.15, flyUp: 5, rockTop: 0.55, rockTurn: 0.6 };
const HOP_DEFAULT = { height: 0.6, seconds: 0.45 };

/**
 * Chapter 5's stone: how high its drawn surface is over (x, z), so a turtle sits on it and not in it (the stone is lumpy). The stone
 * is placed as world/ardalur/banks.js places a prop (lod 1, sunk by its model's sink, turned by `rot`, scaled); without its model it
 * is a smooth top POOL_LIFE.rockTop of its scale high.
 */
function rockSurface(model, { x, y, z, rot, scale }) {
  const smooth = () => y + POOL_LIFE.rockTop * scale;
  const pos = model?.solid?.pos;
  if (!pos?.length) return smooth;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (model.solid.idx?.length) geometry.setIndex(model.solid.idx);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  // banks.js and batch.js turn a vertex (lx, lz) to (lx cos rot - lz sin rot, lx sin rot + lz cos rot): three's turn by -rot
  mesh.position.set(x, y - (model.sink ?? 0) * scale, z);
  mesh.rotation.y = -rot;
  mesh.scale.setScalar(scale);
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const from = new THREE.Vector3();
  return (px, pz) => {
    ray.set(from.set(px, y + 4 * scale, pz), down);
    const hit = ray.intersectObject(mesh, false)[0];
    return hit ? hit.point.y : smooth();
  };
}

export function createLife(world, route, { heightAt = () => 0, library = null, crowds = null, critters = {}, choir = null } = {}) {
  const { river } = route;
  const own = !crowds;
  crowds ??= createCrowds(world);
  const baked = critters.smaedla ?? null;
  const LIZARD = baked ? 'smaedla' : 'salamander';
  const grazer = critters.grasbitur ?? null;
  const flyer = critters.flugdyr ?? null;
  const BAKED = { smaedla: baked, grasbitur: grazer, flugdyr: flyer }; // the owner's models, as tools/prep-crowd.mjs bakes them
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
    // the owner's small lizard and grazer: their frames' names, as the crowd draws them, and their height standing
    const own = BAKED[kind];
    if (own) return { morphs: (own.lods[0].geometry.morphAttributes.position ?? []).map(a => a.name), height: own.height, wings: false };
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

  // F: the herd, grazing in its three groups until the big call (none without the owner's grazer)
  const land = route.land ?? {};
  const meadowAt = (x, z) => Math.hypot(x - MEADOW[0], z - MEADOW[1]) < MEADOW[2]; // no tree grows in it (banks.js)
  const wetAt = (x, z) => (land.ponds ?? []).some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r + 3)
    || (land.streams ?? []).some(s => s.path.some((b, i) => i > 0 && toSegment(x, z, s.path[i - 1], b) < s.half + 3));
  const PATH = Array.from({ length: Math.round(BEATS.END / 0.5) + 1 }, (_, i) => herAt(i * 0.5, new THREE.Vector3()));
  const fromPath = (x, z) => PATH.reduce((best, p) => Math.min(best, Math.hypot(p.x - x, p.z - z)), Infinity);
  /**
   * How far from (x, z) along `dir` the ground stays open and walkable: to the step's edge (a drop steeper than `steep` a metre, or
   * `rise` m off its own level), a grove, water, or near her path.
   */
  function openFor(x, z, dir) {
    const level = heightAt(x, z);
    let last = level;
    for (let a = 1; a <= GRAZE.reach; a++) {
      const px = x + dir[0] * a, pz = z + dir[1] * a;
      const y = heightAt(px, pz);
      const shut = Math.abs(y - last) > GRAZE.steep || Math.abs(y - level) > GRAZE.rise
        || (!meadowAt(px, pz) && groveAt(px, pz) >= 0.5) || wetAt(px, pz) || fromPath(px, pz) < GRAZE.path;
      if (shut) return a - 1;
      last = y;
    }
    return GRAZE.reach;
  }
  const herd = !grazer ? [] : HERD.map((spec, gi) => {
    const dx = FAR_POOL.center[0] - spec.at[0], dz = FAR_POOL.center[1] - spec.at[1];
    const far = Math.hypot(dx, dz);
    const group = { id: spec.id, at: [...spec.at], dir: [dx / far, dz / far], room: 0, members: [] };
    const run = headingOf(group.dir[0], group.dir[1]);
    const spots = Array.from({ length: spec.count }, (_, k) => {
      const r = spec.spread * Math.sqrt((k + 0.5) / spec.count);
      const a = k * 2.39996 + gi; // the golden angle: a disc of them, none on another
      return [spec.at[0] + r * Math.cos(a), spec.at[1] + r * Math.sin(a)];
    });
    group.room = Math.max(0, Math.min(...spots.map(([x, z]) => openFor(x, z, group.dir))) - GRAZE.margin);
    // the one in front sets off first, so none runs into the one before it
    const ahead = ([x, z]) => (x - spec.at[0]) * group.dir[0] + (z - spec.at[1]) * group.dir[1];
    const order = spots.map((_, k) => k).sort((i, j) => ahead(spots[j]) - ahead(spots[i]));
    spots.forEach(([x, z], k) => {
      const delay = GRAZE.delay[0] + ((GRAZE.delay[1] - GRAZE.delay[0]) * order.indexOf(k)) / Math.max(1, spec.count - 1);
      group.members.push(add(`${group.id}-grazer-${k}`, 'grasbitur', new THREE.Vector3(x, heightAt(x, z), z), run + 70 * Math.sin(k * 2.3 + gi * 1.1), { group, k, delay, run }));
      const half = (grazer.length * LIFE_SCALE.grasbitur) / 2;
      for (let a = -half; a <= group.room + half; a += GRAZE.step) {
        clear.push({ x: x + group.dir[0] * a, z: z + group.dir[1] * a, r: GRAZE.lane, over: GRAZE.low });
      }
    });
    return group;
  });

  // D to G: the gorge's flyers, each on its ledge until she comes, its place round her on its own wall's side of her
  const flyers = !flyer ? [] : NESTS.map(([x, y, z, heading], k) => {
    const nest = new THREE.Vector3(x, y, z);
    const b = add(`flyer-${k}`, 'flugdyr', nest, heading, { nest, look: [Math.cos(heading * DEG), Math.sin(heading * DEG)] });
    b.trigger = firstWithin(nest, FLY.within);
    const p = herAt(b.trigger, new THREE.Vector3());
    const way = wayAt(b.trigger);
    b.way = [way.fx, way.fz];
    b.side = (x - p.x) * way.rx + (z - p.z) * way.rz > 0 ? 'right' : 'left';
    return b;
  });
  const spotsOf = who => FAR_POOL.gather.filter(g => g[2] === who);
  const perches = spotsOf('flyer');
  for (const side of ['left', 'right']) {
    flyers.filter(b => b.side === side).forEach((b, j) => {
      b.slot = SLOTS[side][j];
      const [x, z] = perches[(side === 'left' ? 0 : perches.length / 2) + j];
      const from = FLY.land.from + (2 * j + (side === 'right' ? 1 : 0)) * FLY.land.every;
      b.land = {
        spot: new THREE.Vector3(x, heightAt(x, z), z), from, to: from + FLY.land.seconds,
        heading: headingOf(FAR_POOL.center[0] - x, FAR_POOL.center[1] - z), // looking across the pool
      };
      clear.push({ x, z, r: 1.2 });
    });
  }
  // the first to leave its nest, and its side of her: they cry then (chapters/kafli4-flight-play.js)
  const first = flyers.reduce((a, b) => (a && a.trigger <= b.trigger ? a : b), null);
  const flyersOff = first ? { at: first.trigger, side: first.side } : null;

  // Scene 7: the arrivals, each given its spot at the far pool, turned toward her in the shallows; the flyers stand where they landed
  let arrived = false;
  const arrivals = [];
  const [lx, lz] = FAR_POOL.landing;
  const toTheirSpots = (members, who, lane) => {
    const spots = spotsOf(who);
    members.slice(0, spots.length).forEach((b, k) => {
      const [x, z] = spots[k];
      const heading = headingOf(lx - x, lz - z) + GATHER.turn * Math.sin(k * 2.3 + 0.4);
      b.gather = { at: new THREE.Vector3(x, heightAt(x, z), z), heading };
      arrivals.push(b);
      const half = b.kind === 'grasbitur' ? (grazer.length * b.scale) / 2 : 0;
      const [hx, hz] = [Math.cos(heading * DEG), Math.sin(heading * DEG)];
      for (let a = -half; a <= half; a += GRAZE.step) clear.push({ x: x + hx * a, z: z + hz * a, r: lane, over: GATHER.low });
    });
  };
  toTheirSpots(rows.filter(r => r.where === GATHER.rows).flatMap(r => r.members), 'lizard', GATHER.lane[0]);
  toTheirSpots(herd.find(g => g.id === GATHER.herd)?.members ?? [], 'grazer', GATHER.lane[1]);
  for (const b of flyers) { b.gather = { at: b.land.spot, heading: b.land.heading }; arrivals.push(b); }

  // Chapter 5: the far pool's frogs, each on a lily pad, and its turtles on their stone, there from the build
  const pool = { frogs: [], turtles: [] };
  if (choir) {
    const level = choir.level ?? FAR_POOL.level;
    choir.frogs.forEach(({ at: [x, z], heading }, k) => {
      props.push({ name: 'waterLily', variant: k % 6, x, y: level + POOL_LIFE.padUp, z, rot: (k * 1.7) % TAU, scale: POOL_LIFE.pad });
      clear.push({ x, z, r: 0.9 });
      const frog = add(`pool-frog-${k}`, 'frog', new THREE.Vector3(x, level + POOL_LIFE.lily, z), heading);
      frog.gather = { at: frog.at.clone(), heading };
      pool.frogs.push(frog);
    });
    const { rock } = choir;
    if (rock) {
      const [x, z] = rock.at;
      const y = heightAt(x, z);
      const rot = POOL_LIFE.rockTurn;
      props.push({ name: 'rock', variant: rock.variant, x, y, z, rot, scale: rock.scale });
      clear.push({ x, z, r: 1.2 * rock.scale });
      const model = library?.get?.('rock', rock.variant, 1, {}) ?? null;
      const surface = rockSurface(model, { x, y, z, rot, scale: rock.scale });
      choir.turtles.forEach(({ at: [tx, tz], heading }, k) => {
        const turtle = add(`pool-turtle-${k}`, 'turtle', new THREE.Vector3(tx, surface(tx, tz), tz), heading);
        turtle.gather = { at: turtle.at.clone(), heading };
        pool.turtles.push(turtle);
      });
    }
  }

  for (const kind of new Set(things.map(t => t.kind))) {
    const n = things.filter(t => t.kind === kind).length;
    crowds.reserve(kind, n, BAKED[kind] ? { ...BAKED[kind], seen: kind === 'grasbitur' ? GRAZE.seen : null } : { model: modelOf(kind) });
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
   * One that came, at its spot by the far pool in scene 7, turned toward her: a small lizard stands about and now and then looks up
   * (its look clip held at its fifth frame, as animals.js does), a grazer grazes and looks up by turns. Its frames' weights add up to 1.
   */
  function standing(b, clock) {
    b.position.copy(b.gather.at);
    b.heading = b.gather.heading;
    for (const name in b.morphs) b.morphs[name] = 0;
    const model = BAKED[b.kind];
    const blend = (clip, time, w) => {
      if (w <= 0) return;
      const frames = clipPose(model, clip, time, b.phase);
      for (const name in frames) b.morphs[name] += frames[name] * w;
    };
    const up = period => smooth(1.5 * Math.sin((TAU * clock) / period + b.phase) - 0.3); // head up some of the time
    if (b.kind === 'grasbitur') {
      const w = up(GATHER.graze);
      blend('graze', clock, 1 - w);
      blend('look', clock, w);
    } else if (model) {
      const w = up(GATHER.look);
      blend('idle', clock, 1 - w);
      blend('look', (5 / model.clips.look.frames) * model.clips.look.seconds, w);
    } else {
      b.morphs.curl = 0.45 * (0.5 + 0.5 * Math.sin((TAU * clock) / 7 + b.phase));
    }
  }

  /**
   * A row's small lizard: standing about in its grove until the big call, then off after the one before it toward the far pool,
   * huddling again where its row stops; gone once the flight is over (but those that stand at the far pool in scene 7). Its frames'
   * weights add up to 1 (clipPose).
   */
  function lizard(b, ft, clock) {
    const { row } = b;
    if (ft === null && arrived && b.gather) { standing(b, clock); return; }
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

  /**
   * How far a grazer has gone `s` s after it set off walking (its group's `room` m at most), how much of its pose is going, and how
   * much of that trotting: walking at its walk's stride, then trotting at its trot's, so the feet keep to the ground; easing to a
   * stop over the last `ease` m.
   */
  function went(s, room, scale) {
    if (s <= 0 || room <= 0) return [0, 0, 0];
    const clips = grazer.clips;
    const vw = (clips.walk.stride * scale) / clips.walk.seconds;
    const vt = (clips.trot.stride * scale) / clips.trot.seconds;
    const { start, walk, trotIn } = GRAZE;
    const w = Math.min(Math.max(0, s - walk), trotIn);
    const d = s < start ? (vw * s * s) / (2 * start)
      : s < walk ? vw * (s - start / 2)
        : vw * (walk - start / 2) + vw * w + ((vt - vw) * w * w) / (2 * trotIn) + vt * Math.max(0, s - walk - trotIn);
    const going = smooth(s / start);
    const trotting = smooth((s - walk) / trotIn);
    const ease = Math.min(GRAZE.ease, room);
    const easing = room - ease;
    if (d <= easing) return [d, going, trotting];
    const x = Math.min(2, (d - easing) / ease); // slowing evenly: the last `ease` metres take twice the going
    return [easing + ease * (x - (x * x) / 4), going * (1 - x / 2), trotting];
  }

  /**
   * A grazer of the herd: grazing where it stands until the big call, then its head up, a look about, a walk and a trot toward the
   * far pool to the end of its group's open ground, where it stands looking about; gone once the flight is over. Its clips' weights
   * add up to 1 (clipPose).
   */
  function grazing(b, ft, clock) {
    const { group } = b;
    if (ft === null && arrived && b.gather) { standing(b, clock); return; }
    if (call !== null && ft === null) { b.visible = false; return; }
    for (const name in b.morphs) b.morphs[name] = 0;
    const blend = (clip, time, w) => {
      if (w <= 0) return;
      const frames = clipPose(grazer, clip, time, b.phase);
      for (const name in frames) b.morphs[name] += frames[name] * w;
    };
    const u = call === null || ft === null ? -1 : ft - call - b.delay;
    if (u <= 0) { blend('graze', clock, 1); return; }
    const [d, going, trotting] = went(u - GRAZE.look, group.room, b.scale);
    const x = b.at.x + group.dir[0] * d, z = b.at.z + group.dir[1] * d;
    b.position.set(x, heightAt(x, z), z);
    b.heading = lerpAngle(b.rest, b.run, smooth((u - GRAZE.look + 0.4) / 0.8));
    const up = smooth(u / GRAZE.up);
    const { walk, trot } = grazer.clips;
    blend('graze', clock, 1 - up);
    blend('look', u, up * (1 - going));
    blend('walk', (d / (walk.stride * b.scale)) * walk.seconds, up * going * (1 - trotting));
    blend('trot', (d / (trot.stride * b.scale)) * trot.seconds, up * going * trotting);
  }

  // Where she really is against the schedule (a burst puts her ahead of it, a steer aside of it): world.flightU and world.flightPoint
  // as the flier leaves them each frame; none of that in a world without them (a test's), and none after a seek.
  const follow = { du: 0, aside: 0 };
  const frame = { p: new THREE.Vector3(), fx: 1, fz: 0 };
  const ua = new THREE.Vector3(), ub = new THREE.Vector3();
  /** Her body at flight second t (`follow`'s lead and aside on the schedule's place) and her heading there, seen from above. */
  function herFrame(t, out = frame) {
    const u = THREE.MathUtils.clamp(route.progressAt(THREE.MathUtils.clamp(t, 0, BEATS.END)) + follow.du, 0, 1);
    route.pointAt(u, out.p);
    const du = 2 / route.length;
    route.pointAt(Math.max(0, u - du), ua);
    route.pointAt(Math.min(1, u + du), ub);
    const l = Math.hypot(ub.x - ua.x, ub.z - ua.z) || 1;
    out.fx = (ub.x - ua.x) / l;
    out.fz = (ub.z - ua.z) / l;
    out.p.x -= out.fz * follow.aside;
    out.p.z += out.fx * follow.aside;
    return out;
  }
  function followHer(ft) {
    follow.du = 0;
    follow.aside = 0;
    if (ft === null || world.flightU === null || world.flightU === undefined) return;
    follow.du = world.flightU - route.progressAt(THREE.MathUtils.clamp(ft, 0, BEATS.END));
    const at = world.flightPoint;
    if (at) { herFrame(ft); follow.aside = (at.x - frame.p.x) * -frame.fz + (at.z - frame.p.z) * frame.fx; }
  }
  /** How far the formation has wheeled round her at flight second t (radians, toward her right): none under reduced motion. */
  const wheeled = t => (world.flightReduced ? 0 : TAU * FLY.turns * smoother((t - FLY.circle[0]) / (FLY.circle[1] - FLY.circle[0])));
  /** A flyer's place round her at flight second t, `ahead` m further forward than its slot. */
  function slotAt(b, t, ahead, out) {
    const { p, fx, fz } = herFrame(t);
    const [a0, r0, up] = b.slot;
    const turn = wheeled(t);
    const a = a0 * Math.cos(turn) - r0 * Math.sin(turn) + FLY.sway * Math.sin((TAU * t) / 4.7 + 2 * b.phase) + ahead;
    const r = r0 * Math.cos(turn) + a0 * Math.sin(turn);
    return out.set(p.x + fx * a - fz * r, p.y + up + FLY.bob * Math.sin((TAU * t) / 3.1 + b.phase), p.z + fz * a + fx * r);
  }
  const launchAt = new THREE.Vector3();
  /** Where a flyer is at flight second t: on its ledge, off it into its place, round her, down onto the far pool's bank. */
  function flyerAt(b, t, out) {
    const s = t - b.trigger;
    if (s <= 0) return out.copy(b.nest);
    const tau = t - b.land.from;
    if (tau >= FLY.land.seconds) return out.copy(b.land.spot);
    slotAt(b, t, tau > 0 ? FLY.land.ahead * smooth(tau / (0.6 * FLY.land.seconds)) : 0, out);
    const joined = smooth((s - FLY.wait) / FLY.join);
    if (joined < 1) {
      const o = smooth(s / FLY.off);
      launchAt.set(
        b.nest.x + b.look[0] * FLY.out * o + b.way[0] * FLY.along * s,
        b.nest.y - FLY.drop * o,
        b.nest.z + b.look[1] * FLY.out * o + b.way[1] * FLY.along * s,
      );
      out.lerpVectors(launchAt, out, joined);
    }
    if (tau > 0) {
      const w = smooth(tau / FLY.land.seconds);
      out.lerp(b.land.spot, w);
      out.y += FLY.land.arc * 4 * w * (1 - w);
    }
    return out;
  }
  const window01 = (t, [from, to]) => smooth((t - from) / 0.5) * (1 - smooth((t - to) / 0.5));
  const was = new THREE.Vector3(), will = new THREE.Vector3();
  /**
   * A flyer: perched on its ledge until she comes, flapping off it into its place, gliding round her with a few beats now and then
   * (flapping up the falls), down onto the far pool's bank, and perched there, looking across the pool. Its clips' weights add up to 1.
   */
  function flyerPose(b, ft, clock) {
    for (const name in b.morphs) b.morphs[name] = 0;
    const blend = (clip, time, w) => {
      if (w <= 0) return;
      const frames = clipPose(flyer, clip, time, b.phase);
      for (const name in frames) b.morphs[name] += frames[name] * w;
    };
    if (ft === null && arrived) {
      b.position.copy(b.gather.at);
      b.heading = b.gather.heading;
      blend('perch', clock, 1);
      return;
    }
    const s = ft === null ? -1 : ft - b.trigger;
    if (s <= 0) { blend('perch', clock, 1); return; }
    const tau = ft - b.land.from;
    if (tau >= FLY.land.seconds) {
      b.position.copy(b.land.spot);
      b.heading = b.land.heading;
      blend('perch', clock, 1);
      return;
    }
    flyerAt(b, ft, b.position);
    flyerAt(b, ft - 0.05, was);
    flyerAt(b, ft + 0.05, will);
    const vx = will.x - was.x, vy = will.y - was.y, vz = will.z - was.z;
    const flat = Math.hypot(vx, vz);
    if (flat > 0.02) b.heading = headingOf(vx, vz);
    b.pitch = THREE.MathUtils.clamp(0.6 * Math.atan2(vy, flat), -0.45, 0.45);
    const beatAt = ((((ft / FLY.beat[1] + b.phase) % 1) + 1) % 1) * FLY.beat[1];
    const flap = Math.max(
      1 - smooth((s - (FLY.wait + FLY.join - 0.6)) / 0.6), // off the ledge and into its place
      window01(ft, FLY.climb), // up the falls
      smooth(beatAt / 0.2) * (1 - smooth((beatAt - FLY.beat[0] + 0.2) / 0.2)), // a few beats now and then
      smooth((tau - (FLY.land.seconds - FLY.land.flare)) / 0.3), // the last of the way down
    );
    const perched = Math.max(1 - smooth(s / 0.25), smooth((tau - (FLY.land.seconds - 0.3)) / 0.3));
    blend('perch', clock, perched);
    blend('flap', clock, (1 - perched) * flap);
    blend('glide', clock, (1 - perched) * (1 - flap));
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
      case 'grasbitur':
        grazing(b, ft, clock);
        break;
      case 'flugdyr':
        flyerPose(b, ft, clock);
        break;
      case 'frog':
        b.position.copy(b.gather.at);
        b.heading = b.gather.heading;
        b.squash[1] = 1 + 0.03 * Math.sin(TAU * 0.7 * clock + p);
        b.morphs.leap = 0;
        break;
      case 'turtle':
        b.position.copy(b.gather.at);
        b.heading = b.gather.heading;
        b.morphs.look = Math.max(0, Math.sin((TAU * clock) / 9 + p)) ** 2;
        b.morphs.hide = 0;
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
    followHer(flying ? ft : null);
    if (own) crowds.begin(world.camera ?? null);
    for (const b of things) {
      const going = flying ? 0 : moving(b, t);
      pose(b, flying ? ft : null, clock, t);
      if (!flying) { walk(b, going, clock); hopping(b, t); }
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

  /** The big call came at flight second `at`: the rows, the flocks and the herd set off. The first call is the one. */
  function bigCall(at) {
    if (call === null && Number.isFinite(at)) call = at;
  }

  /**
   * Chapter 5: `b`, one that stands at the pool, goes to `at` ([x, z]) in `seconds` of game time, from where it stands by the points
   * `via`, and stands there turned to `heading`. It turns its way at the start, walks (a flyer flies over), and turns to `heading` at
   * the end.
   */
  function moveTo(b, { at, via = [], heading = b.gather?.heading ?? b.rest, seconds = 4 } = {}) {
    if (!b.gather) return;
    // a frog keeps to the water and a turtle to its stone (its height there); the rest walk on the ground
    const keepsHeight = b.kind === 'frog' || b.kind === 'turtle';
    const point = ([x, z]) => new THREE.Vector3(x, keepsHeight ? b.gather.at.y : heightAt(x, z), z);
    const way = [b.gather.at.clone(), ...(b.kind === 'flugdyr' ? [] : via.map(point)), point(at)];
    const lengths = way.slice(1).map((p, i) => Math.hypot(p.x - way[i].x, p.z - way[i].z));
    const total = lengths.reduce((sum, d) => sum + d, 0);
    b.trip = { way, lengths, total, from: way[0], to: way.at(-1), start: now(), seconds: Math.max(0.1, seconds), h0: b.gather.heading, h1: heading };
  }
  /** Chapter 5: `b` hops once where it stands (a frog leaps), `height` m up over `seconds` of game time. */
  function hop(b, { height = HOP_DEFAULT.height, seconds = HOP_DEFAULT.seconds } = {}) {
    b.hopped = { start: now(), height, seconds };
  }
  /** Where a move has `b` now (its gather spot as it goes); how much of its pose is going (0 standing, 1 on its way). */
  function moving(b, t) {
    const trip = b.trip;
    if (!trip) return 0;
    const k = clamp01((t - trip.start) / trip.seconds);
    const e = smoother(k);
    const { from, to, way: points, lengths, total } = trip;
    // where along the way it is, and the way it goes there
    let left = e * total;
    let i = 0;
    while (i < lengths.length - 1 && left > lengths[i]) left -= lengths[i++];
    const a = points[i];
    const b2 = points[i + 1];
    const f = lengths[i] > 1e-6 ? Math.min(1, left / lengths[i]) : 1;
    const x = a.x + (b2.x - a.x) * f;
    const z = a.z + (b2.z - a.z) * f;
    const y = b.kind === 'flugdyr' ? from.y + (to.y - from.y) * e + POOL_LIFE.flyUp * Math.sin(Math.PI * e) : b.kind === 'frog' || b.kind === 'turtle' ? from.y : heightAt(x, z);
    b.gather.at.set(x, y, z);
    const way = headingOf(b2.x - a.x, b2.z - a.z);
    const far = total > 0.5;
    const turn = POOL_LIFE.turn;
    b.gather.heading = !far ? lerpAngle(trip.h0, trip.h1, smooth(k))
      : k < turn ? lerpAngle(trip.h0, way, smooth(k / turn))
        : k > 1 - turn ? lerpAngle(way, trip.h1, smooth((k - 1 + turn) / turn)) : way;
    trip.travelled = e * total;
    if (k >= 1) {
      b.gather.at.copy(to);
      b.gather.heading = trip.h1;
      b.trip = null;
      return 0;
    }
    return far ? smooth(Math.min(k, 1 - k) / 0.08) : 0;
  }
  /** Its walk (a run, a flyer's flapping) over the standing pose, `going` of it, its feet in step with how far it has come. */
  function walk(b, going, clock) {
    if (going <= 0 || !b.trip) return;
    const model = BAKED[b.kind];
    const clip = b.kind === 'grasbitur' ? 'walk' : b.kind === 'smaedla' ? 'run' : b.kind === 'flugdyr' ? 'flap' : null;
    if (!model || !clip || !model.clips?.[clip]) return;
    const { stride, seconds } = model.clips[clip];
    const time = stride ? (b.trip.travelled / (stride * b.scale)) * seconds : clock;
    const frames = clipPose(model, clip, time, b.phase);
    for (const name in b.morphs) b.morphs[name] *= 1 - going;
    for (const name in frames) b.morphs[name] = (b.morphs[name] ?? 0) + frames[name] * going;
  }
  /** A hop where it stands: up and down again, a frog's legs out as it goes. */
  function hopping(b, t) {
    const h = b.hopped;
    if (!h) return;
    const u = (t - h.start) / h.seconds;
    if (u < 0) return;
    if (u >= 1) { b.hopped = null; return; }
    b.position.y += 4 * h.height * u * (1 - u);
    if (b.kind === 'frog') b.morphs.leap = Math.sin(Math.PI * u);
    b.squash[1] *= 1 + 0.08 * Math.sin(Math.PI * u);
  }

  /** Scene 7 has begun (chapters/kafli4.js): outside the flight from now on, those that came stand at the far pool. */
  function arrive() {
    arrived = true;
  }

  return {
    things, rows, flocks, herd, flyers, flyersOff, arrivals, props, clear, crowds, update, skim, bigCall, arrive, pool, moveTo, hop,
    dispose() { if (own) crowds.dispose(); },
  };
}

const lerpAngle = (a, b, k) => a + (((b - a + 540) % 360) - 180) * k;

function unit(x, z) {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

/** How far (x, z) is from the line from a to b, seen from above. */
function toSegment(x, z, [ax, az], [bx, bz]) {
  const vx = bx - ax, vz = bz - az;
  const k = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(x - ax - vx * k, z - az - vz * k);
}
