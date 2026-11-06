// The life in the flight that nobody taps (world/ardalur/life.js): the Fen's early birds and dragonflies in A, fish jumping in her
// lane, birds flushed from the bank trees between the groups of C, water striders a skim sends skating. All of it on the flight's
// own clock, set off by where the schedule has her, and none of it in her way. In F and G the big call sends rows of small lizards
// and flocks of birds out of the groves toward the far pool.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoute, BEATS, FAR_POOL, MEADOW, NESTS } from '../chapters/kafli4-route.js';
import { createTerrain, groundDrawnAt } from '../world/ardalur/terrain.js';
import { RAPIDS } from '../world/ardalur/river.js';
import { createLife } from '../world/ardalur/life.js';
import { groveAt } from '../world/ardalur/banks.js';
import { SMAEDLA_MODEL, GRASBITUR_MODEL, FLUGDYR_MODEL } from '../world/ardalur/animals.js';
import { crowdModelFrom } from '../world/critters/crowd-models.js';
import { loadGlb } from './glb.mjs';

const route = createRoute();
const terrain = createTerrain(route, { seed: 4 });
const heightAt = (x, z) => terrain.heightAt(x, z);
const DT = 1 / 30;
const herAt = t => route.pointAt(route.progressAt(Math.min(BEATS.END, Math.max(0, t))));
/** How near her path comes to a point, seen from above. */
const fromPath = p => {
  let best = Infinity;
  for (let t = 0; t <= BEATS.END; t += 0.1) { const q = herAt(t); best = Math.min(best, Math.hypot(q.x - p.x, q.z - p.z)); }
  return best;
};

/** A life in a world whose game clock runs 100 s ahead of the flight's; step(t) sets the flight's time t and updates it. */
function made(options = {}) {
  const world = { scene: new THREE.Scene(), clock: { time: 0 }, flightTime: null, camera: null };
  const life = createLife(world, route, { heightAt, ...options });
  const step = t => {
    world.flightTime = t;
    world.clock.time = 100 + t;
    life.update(DT, world.clock.time);
  };
  return { world, life, step };
}

/** Each perched flier sits still until its trigger, is 3 m higher a second later, and is gone at +3.6 s and ever after. */
function fliesUpAndAway(things, step) {
  for (const b of things) {
    step(b.trigger - 0.5);
    assert.ok(b.visible && b.position.distanceTo(b.at) < 1e-6, `${b.id} sits where it sat before she comes`);
    step(b.trigger + 1);
    assert.ok(b.visible && b.position.y - b.at.y >= 3, `${b.id} flies up (${(b.position.y - b.at.y).toFixed(2)} m in 1 s)`);
    for (const after of [3.6, 10, BEATS.END - b.trigger]) {
      step(b.trigger + after);
      assert.equal(b.visible, false, `${b.id} is gone ${after.toFixed(1)} s after`);
    }
  }
}

test("the Fen's birds fly up as she comes, once, and are gone", () => {
  const { life, step } = made();
  const birds = life.things.filter(t => t.kind === 'earlyBird');
  assert.equal(birds.length, 5);
  for (const b of birds) {
    assert.ok(terrain.where(b.at.x, b.at.z).fen > 0.6 && terrain.where(b.at.x, b.at.z).e > 0.5, `${b.id} sits in the Fen, on land`);
    assert.ok(fromPath(b.at) <= 25, `${b.id} is within 25 m of her path`);
    assert.ok(b.trigger > 0 && b.trigger < BEATS.C, `${b.id} flies up in A or B (${b.trigger.toFixed(2)} s)`);
    assert.ok(herAt(b.trigger).distanceTo(b.at) <= 14 + 1e-3, `${b.id}: she is within 14 m when it flies up`);
    assert.ok(herAt(b.trigger - 0.1).distanceTo(b.at) > 14, `${b.id}: not before`);
  }
  fliesUpAndAway(birds, step);
  // and four dragonflies hover in the reed, over the ground, all the flight
  const flies = life.things.filter(t => t.kind === 'dragonfly');
  assert.equal(flies.length, 4);
  step(10);
  for (const f of flies) {
    assert.ok(terrain.where(f.at.x, f.at.z).fen > 0.6, `${f.id} hovers in the Fen`);
    const over = f.position.y - heightAt(f.position.x, f.position.z);
    assert.ok(f.visible && over > 0.5 && over < 3, `${f.id} hovers in the reed (${over.toFixed(2)} m up)`);
  }
});

test('fish jump ahead of her in her lane, once each', () => {
  const { life, step } = made();
  const fish = life.things.filter(t => t.kind === 'fish');
  assert.equal(fish.length, 10);
  for (const f of fish) {
    const d = route.river.nearest(f.at.x, f.at.z).d;
    assert.ok(d >= 0 && d <= 850, `${f.id} at river d ${d.toFixed(0)}`);
    assert.notEqual(route.waterAt(f.at.x, f.at.z), null, `${f.id} is in the river`);
    assert.ok(fromPath(f.at) <= 6, `${f.id} is in her lane (${fromPath(f.at).toFixed(2)} m from her path)`);
    const her = herAt(f.trigger);
    assert.ok(Math.abs(Math.hypot(her.x - f.at.x, her.z - f.at.z) - 24) < 0.1, `${f.id}: she is 24 m before it when it jumps`);
  }
  const above = fish.map(() => []);
  const peak = fish.map(() => 0);
  for (let t = 0; t <= BEATS.END; t += 0.05) {
    step(t);
    fish.forEach((f, i) => {
      if (!f.visible) return;
      const over = f.position.y - route.river.at(route.river.nearest(f.position.x, f.position.z).d).level;
      if (over > 0.05) above[i].push(t);
      peak[i] = Math.max(peak[i], over);
    });
  }
  fish.forEach((f, i) => {
    assert.ok(above[i].length > 0, `${f.id} jumps`);
    assert.ok(above[i].every(t => t >= f.trigger - 1e-9 && t <= f.trigger + 0.8 + 1e-9), `${f.id} is out of the water only in its jump`);
    assert.ok(peak[i] > 1.0 && peak[i] <= 1.2 + 1e-6, `${f.id} jumps 1.2 m (${peak[i].toFixed(2)})`);
  });
});

test('birds fly up from the bank trees as she passes', () => {
  const { life, step } = made();
  const trees = life.props.filter(p => p.name === 'broadleaf');
  assert.equal(trees.length, 6);
  const groupsAt = route.groups.map(g => route.river.nearest(g.at[0], g.at[2]).d);
  for (const p of trees) {
    const w = terrain.where(p.x, p.z);
    assert.ok(w.e > 0 && w.e <= 12, `a tree within 12 m of the water (${w.e.toFixed(1)} m)`);
    assert.ok(w.d > groupsAt[0] && w.d < groupsAt.at(-1) && groupsAt.every(d => Math.abs(d - w.d) >= 15), `a tree between the groups (d ${w.d.toFixed(0)})`);
  }
  const birds = life.things.filter(t => t.kind === 'bird' && t.id.startsWith('tree-'));
  assert.equal(birds.length, 24);
  for (const b of birds) {
    assert.ok(b.trigger > BEATS.C && b.trigger < BEATS.D, `${b.id} flies up in C (${b.trigger.toFixed(2)} s)`);
    assert.ok(herAt(b.trigger).distanceTo(b.at) <= 20 + 1e-3, `${b.id}: she is within 20 m when it flies up`);
  }
  fliesUpAndAway(birds, step);
});

test('a skim sends the striders off and back', () => {
  const { life, step } = made();
  const striders = life.things.filter(t => t.kind === 'waterStrider');
  assert.equal(striders.length, 8);
  for (const s of striders) {
    const w = terrain.where(s.at.x, s.at.z);
    assert.ok(w.d < RAPIDS.from && w.e < -0.5 && w.e > -4, `${s.id} on the water near a bank of the lazy reach (d ${w.d.toFixed(0)}, e ${w.e.toFixed(1)})`);
  }
  const [first] = striders;
  step(40);
  // a skim 30 m off moves nothing
  const far = [first.at.x + 30, first.at.z];
  assert.ok(striders.every(s => Math.hypot(s.at.x - far[0], s.at.z - far[1]) > 10));
  life.skim(...far);
  step(41);
  for (const s of striders) assert.ok(s.position.distanceTo(s.at) < 1e-6, `${s.id} stays put`);
  // one 2 m off sends those within 10 m skating out and back
  life.skim(first.at.x + 2, first.at.z);
  const near = striders.filter(s => Math.hypot(s.at.x - first.at.x - 2, s.at.z - first.at.z) <= 10);
  step(42);
  for (const s of near) assert.ok(s.position.distanceTo(s.at) >= 1, `${s.id} skates off (${s.position.distanceTo(s.at).toFixed(2)} m)`);
  step(43);
  for (const s of near) assert.ok(s.position.distanceTo(s.at) < 0.1, `${s.id} is back`);
  for (const s of striders) assert.ok(Math.abs(s.position.y - s.at.y) < 1e-6, `${s.id} stays on the water`);
});

test("life is a function of the flight's clock: jumping to a time lands where playing up to it does", () => {
  const played = made();
  const jumped = made();
  for (let t = 0; t < 47.3; t += DT) played.step(t);
  played.step(47.3);
  jumped.step(47.3);
  played.life.things.forEach((a, i) => {
    const b = jumped.life.things[i];
    assert.equal(a.visible, b.visible, `${a.id} seen in both`);
    assert.ok(a.position.distanceTo(b.position) < 1e-6, `${a.id}: ${a.position.toArray()} and ${b.position.toArray()}`);
  });
});

test('nothing in her way: every thing stays 3 m from her path at its time', () => {
  const { life, step } = made();
  let closest = Infinity;
  let who = '';
  for (let t = 0; t <= BEATS.END; t += 0.1) {
    step(t);
    const her = herAt(t);
    for (const thing of life.things) {
      if (!thing.visible) continue;
      const d = thing.position.distanceTo(her);
      if (d < closest) { closest = d; who = `${thing.id} at ${t.toFixed(1)} s`; }
    }
  }
  assert.ok(closest >= 3, `${who}: ${closest.toFixed(2)} m from her`);
  life.dispose();
});

// ---------------------------------------------------------------------------------------------
// F and G: the big call (chapters/kafli4-flight-play.js bigCall) comes by itself at 135.5 s (its line waits for the one playing), or
// at once on a tap on the land from 125 s

const CALLS = [135.5, 126];
const PATH = Array.from({ length: Math.round(BEATS.END / 0.1) + 1 }, (_, i) => herAt(i * 0.1));
/** How near her path comes to a point: seen from above (`flat`), or in the air. */
const awayFrom = (p, flat) => PATH.reduce((best, q) => Math.min(best, flat ? Math.hypot(q.x - p.x, q.z - p.z) : q.distanceTo(p)), Infinity);
const toPool = p => Math.hypot(p.x - FAR_POOL.center[0], p.z - FAR_POOL.center[1]);
const middleOf = points => points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
/** How much of a small lizard's pose is the frames of `clip` (clipPose: a pose's weights sum to 1). */
const weight = (m, clip) => Object.entries(m.morphs).filter(([name]) => name.startsWith(`${clip}.`)).reduce((sum, [, w]) => sum + w, 0);
let lizard = null;
const lizardModel = async () => (lizard ??= crowdModelFrom(await loadGlb(new URL(SMAEDLA_MODEL))));
let grazer = null;
const grazerModel = async () => (grazer ??= crowdModelFrom(await loadGlb(new URL(GRASBITUR_MODEL))));
const bothModels = async () => ({ smaedla: await lizardModel(), grasbitur: await grazerModel() });
let flyer = null;
const flyerModel = async () => (flyer ??= crowdModelFrom(await loadGlb(new URL(FLUGDYR_MODEL))));
const allModels = async () => ({ ...(await bothModels()), flugdyr: await flyerModel() });

test('the big call sends rows of small lizards and flocks of birds toward the far pool', async () => {
  const critters = { smaedla: await lizardModel() };
  for (const at of CALLS) {
    const { world, life, step } = made({ critters });
    const { rows, flocks } = life;
    assert.deepEqual(rows.map(r => `${r.where}:${r.members.length}`), ['F:10', 'F:10', 'F:10', 'G:10', 'G:10'], 'three rows of ten in F, two in G');
    assert.deepEqual(flocks.map(f => f.members.length), [18, 18, 18, 18], 'four flocks of 18');
    assert.ok(rows.every(r => r.members.every(m => m.kind === 'smaedla')), "the rows are the owner's small lizard");
    assert.ok(flocks.every(f => f.members.every(b => b.kind === 'bird')), 'the flocks are birds');
    for (const g of [...rows, ...flocks]) assert.ok(groveAt(...g.from) >= 0.5, `${g.id} comes out of a grove (${groveAt(...g.from).toFixed(2)})`);
    for (const f of flocks) assert.ok(heightAt(...f.from) > 45, `${f.id}: a grove above the falls`);
    // before the call nothing moves: the rows stand in their groves, the flocks are in the trees
    step(BEATS.F);
    const rest = new Map(rows.flatMap(r => r.members).map(m => [m, m.position.clone()]));
    for (let t = BEATS.F; t < at; t += 0.5) {
      step(t);
      for (const [m, p] of rest) assert.ok(m.visible && m.position.distanceTo(p) < 1e-6 && Math.abs(weight(m, 'idle') - 1) < 1e-6, `${m.id} stands still at ${t} s`);
      assert.ok(flocks.every(f => f.members.every(b => !b.visible)), `the flocks are in the trees at ${t} s`);
    }
    life.bigCall(at);
    step(at + 0.45);
    for (const [m, p] of rest) assert.ok(m.position.distanceTo(p) < 1e-6, `${m.id} sets off half a second after the call, not sooner`);
    const before = rows.map(r => toPool(middleOf(r.members.map(m => m.position))));
    step(at + 5);
    for (const m of rest.keys()) assert.ok(Math.abs(weight(m, 'run') - 1) < 1e-6, `${m.id} runs (${weight(m, 'run').toFixed(2)})`);
    step(at + 10);
    rows.forEach((r, i) => {
      const nearer = before[i] - toPool(middleOf(r.members.map(m => m.position)));
      assert.ok(r.members.every(m => m.visible) && nearer >= 30, `${r.id} comes ${nearer.toFixed(1)} m nearer the far pool in 10 s (call at ${at} s)`);
    });
    for (const f of flocks) {
      const up = f.members.filter(b => b.visible);
      assert.equal(up.length, 18, `${f.id}: all up`);
      const rose = middleOf(up.map(b => b.position)).y - middleOf(f.members.map(b => b.at)).y;
      const nearer = toPool({ x: f.from[0], z: f.from[1] }) - toPool(middleOf(up.map(b => b.position)));
      assert.ok(rose >= 10 && nearer >= 30, `${f.id} rises ${rose.toFixed(1)} m and flies ${nearer.toFixed(1)} m toward the far pool`);
    }
    // none comes within 25 m of her path: the lizards seen from above, the birds in the air
    const closest = { lizard: Infinity, bird: Infinity };
    for (let t = at; t <= BEATS.END; t += 0.5) {
      step(t);
      for (const r of rows) for (const m of r.members) if (m.visible) closest.lizard = Math.min(closest.lizard, awayFrom(m.position, true));
      for (const f of flocks) for (const b of f.members) if (b.visible) closest.bird = Math.min(closest.bird, awayFrom(b.position, false));
    }
    assert.ok(closest.lizard >= 25 && closest.bird >= 25, `call at ${at} s: lizards ${closest.lizard.toFixed(1)} m, birds ${closest.bird.toFixed(1)} m from her path`);
    // and once the flight is over they are gone: the far pool has its own (scene 7)
    world.flightTime = null;
    world.clock.time += 1;
    life.update(DT, world.clock.time);
    assert.ok([...rows, ...flocks].every(g => g.members.every(m => !m.visible)), 'gone after the flight');
  }
});

test('the herd grazes in the dale by her way and on the top of the step until the big call, lifts its heads, walks, then trots toward the far pool', async () => {
  const critters = await bothModels();
  for (const at of CALLS) {
    const { world, life, step } = made({ critters });
    const { herd } = life;
    assert.deepEqual(herd.map(g => `${g.id}:${g.members.length}`), ['dale:6', 'step:7', 'stepNorth:5'], 'one herd, grazing in three groups');
    const grazers = herd.flatMap(g => g.members);
    assert.ok(grazers.every(m => m.kind === 'grasbitur'), "the owner's grazer");
    const [mx, mz, mr] = MEADOW;
    const inMeadow = p => Math.hypot(p.x - mx, p.z - mz) < mr;
    assert.ok(herd[0].members.every(m => groveAt(m.at.x, m.at.z) < 0.5 && awayFrom(m.at, true) >= 15 && awayFrom(m.at, true) < 50), 'the first group in the open dale, 15 to 50 m from her way');
    assert.ok(herd.slice(1).every(g => g.members.every(m => m.at.y > 54 && groveAt(m.at.x, m.at.z) < 0.5)), 'the others on the open top of the step above the falls');
    // none closer to another than its own length, standing or running
    const apart = () => Math.min(...herd.flatMap(g => g.members.flatMap((a, i) => g.members.slice(i + 1).map(b => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)))));
    // before the call they graze where they stand
    step(BEATS.F);
    const rest = new Map(grazers.map(m => [m, m.position.clone()]));
    const length = critters.grasbitur.length * grazers[0].scale; // drawn, nose to tail
    assert.ok(apart() >= length + 0.5, `apart at rest: ${apart().toFixed(1)} m (each ${length.toFixed(1)} m long)`);
    for (let t = BEATS.F; t < at; t += 0.5) {
      step(t);
      for (const [m, p] of rest) assert.ok(m.visible && m.position.distanceTo(p) < 1e-6 && Math.abs(weight(m, 'graze') - 1) < 1e-6, `${m.id} grazes at ${t} s`);
    }
    life.bigCall(at);
    // each lifts its head from the grass 0.5 to 1.5 s after the call
    const lifted = new Map();
    for (let i = 0; i <= 44; i++) {
      const s = i * 0.05;
      step(at + s);
      for (const m of grazers) if (!lifted.has(m) && weight(m, 'look') > 0.01) lifted.set(m, s);
    }
    for (const m of grazers) assert.ok(lifted.has(m) && lifted.get(m) >= 0.45 && lifted.get(m) <= 1.55, `${m.id} lifts its head ${lifted.get(m)?.toFixed(2)} s after the call`);
    step(at + 5.5);
    // all have set off walking (the dale's and the corner's, with a few metres of open ground, already slowing to stand), the south
    // group in full stride
    for (const m of grazers) assert.ok(weight(m, 'walk') > 0.5 && m.position.distanceTo(m.at) > 1, `${m.id} walks 5.5 s after the call (${weight(m, 'walk').toFixed(2)}, ${m.position.distanceTo(m.at).toFixed(1)} m)`);
    for (const m of herd[1].members) assert.ok(weight(m, 'walk') > 0.99, `${m.id} walks in full stride 5.5 s after the call (${weight(m, 'walk').toFixed(2)})`);
    step(at + 10);
    for (const m of herd[1].members) assert.ok(weight(m, 'trot') > 0.99, `${m.id} trots 10 s after the call (${weight(m, 'trot').toFixed(2)})`);
    // toward the far pool: 15 s after the call the step's south group is 20 m nearer it, the dale's and the step's corner's 5 m (to the end of their open ground), the meadow's 10 m (to the end of its open grass)
    step(BEATS.F);
    const before = herd.map(g => toPool(middleOf(g.members.map(m => m.position))));
    step(at + 15);
    herd.forEach((g, i) => {
      const nearer = before[i] - toPool(middleOf(g.members.map(m => m.position)));
      assert.ok(nearer >= [5, 20, 5][i], `${g.id} comes ${nearer.toFixed(1)} m nearer the far pool in 15 s (call at ${at} s)`);
    });
    // on open ground all the way, never over the step's edge, never in a grove, never near her; apart; then they stop and look
    let least = Infinity, closest = Infinity;
    for (let t = at; t <= BEATS.END; t += 0.25) {
      step(t);
      least = Math.min(least, apart());
      for (const m of grazers) {
        assert.ok(m.visible, `${m.id} seen at ${t} s`);
        assert.ok(Math.abs(m.position.y - m.at.y) < 6, `${m.id} keeps to the top of its ground at ${t} s (${(m.position.y - m.at.y).toFixed(1)} m)`);
        assert.ok(inMeadow(m.position) || groveAt(m.position.x, m.position.z) < 0.5, `${m.id} out of the groves at ${t} s`);
        closest = Math.min(closest, awayFrom(m.position, true));
      }
    }
    assert.ok(least >= length - 0.5, `the herd keeps apart: ${least.toFixed(1)} m at the least`);
    assert.ok(closest >= 15, `call at ${at} s: the herd ${closest.toFixed(1)} m from her path at the nearest`);
    step(at + 30);
    const stopped = grazers.map(m => m.position.clone());
    step(at + 31);
    grazers.forEach((m, i) => assert.ok(m.position.distanceTo(stopped[i]) < 1e-6 && weight(m, 'look') > 0.99, `${m.id} stands and looks 30 s after the call`));
    // and once the flight is over they are gone: the far pool has its own
    world.flightTime = null;
    world.clock.time += 1;
    life.update(DT, world.clock.time);
    assert.ok(grazers.every(m => !m.visible), 'gone after the flight');
  }
});

// ---------------------------------------------------------------------------------------------
// D to G: the flyers of the gorge (the life spec 2D-2G): on ledges in its walls until she comes by, then off with her, up the falls,
// round her in the slow circle (not under reduced motion), down the glide, and onto the far pool's bank

/** Her heading at flight second t, seen from above: { fx, fz }. */
const flatAt = t => {
  const a = herAt(t - 0.25), b = herAt(t + 0.25);
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { fx: (b.x - a.x) / l, fz: (b.z - a.z) / l };
};
/** Where p is round her at flight second t, seen from above: degrees from straight ahead of her, toward her right. */
const bearing = (p, t) => {
  const her = herAt(t);
  const { fx, fz } = flatAt(t);
  const dx = p.x - her.x, dz = p.z - her.z;
  return THREE.MathUtils.radToDeg(Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz));
};
/** How far round her a flyer goes between flight seconds `from` and `to`: the span of its bearing, its steps added up. */
function turned(b, step, from, to) {
  let last = null, sum = 0, lo = 0, hi = 0;
  for (let t = from; t <= to + 1e-9; t += 0.1) {
    step(t);
    const a = bearing(b.position, t);
    if (last !== null) { sum += ((a - last + 540) % 360) - 180; lo = Math.min(lo, sum); hi = Math.max(hi, sum); }
    last = a;
  }
  return hi - lo;
}

test('the flyers leave their nests as she passes and fly with her to the far pool', async () => {
  const { life, step } = made({ critters: await allModels() });
  const { flyers } = life;
  assert.ok(NESTS.length >= 6 && NESTS.length <= 10, `${NESTS.length} nests (the spec: 6 to 10)`);
  assert.equal(flyers.length, NESTS.length, 'a flyer on each');
  assert.ok(flyers.every(b => b.kind === 'flugdyr'), "the owner's flyer");
  // the nests: on the gorge's walls as they are drawn, both walls, 950 to 1150 m up the river, 10 to 25 m over it
  const sides = new Map();
  for (const [x, y, z] of NESTS) {
    const w = terrain.where(x, z);
    assert.ok(w.d >= 950 && w.d <= 1150 && w.gorge > 0.99, `a nest in the gorge (${w.d.toFixed(0)} m up the river)`);
    assert.ok(y - w.level >= 10 && y - w.level <= 25, `a nest ${(y - w.level).toFixed(1)} m over the river`);
    assert.ok(Math.abs(groundDrawnAt(heightAt, x, z) - y) < 0.15, `a nest on the wall as drawn (${(groundDrawnAt(heightAt, x, z) - y).toFixed(2)} m)`);
    sides.set(w.side, (sides.get(w.side) ?? 0) + 1);
  }
  assert.ok(sides.size === 2 && [...sides.values()].every(n => n >= 3), `nests on both walls (${[...sides.values()].join(' and ')})`);
  // each sits on its ledge until the schedule brings her within 25 m of it, then flies off
  for (const b of flyers) {
    let at = null;
    for (let t = BEATS.C; t <= BEATS.E && at === null; t += 0.01) if (herAt(t).distanceTo(b.nest) <= 25) at = t;
    assert.ok(at !== null && Math.abs(b.trigger - at) < 0.02, `${b.id} sets off at ${b.trigger?.toFixed(2)} s (she is 25 m off at ${at?.toFixed(2)} s)`);
    for (const t of [0, BEATS.D, b.trigger - 0.2]) {
      step(t);
      assert.ok(b.visible && b.position.distanceTo(b.nest) < 1e-6 && Math.abs(weight(b, 'perch') - 1) < 1e-6, `${b.id} sits on its ledge at ${t.toFixed(1)} s`);
    }
    step(b.trigger + 1.5);
    assert.ok(b.position.distanceTo(b.nest) > 3 && weight(b, 'flap') > 0.5, `${b.id} flies off its ledge (${b.position.distanceTo(b.nest).toFixed(1)} m, flapping ${weight(b, 'flap').toFixed(2)})`);
  }
  // with her: within 15 m of her for most of 100 to 165 s; never within 4 m of her body or Egill's head (0.8 m over it); in the
  // air (from 1.2 s off its ledge to its last second down onto the bank) never within 1 m of the ground drawn round it, nor of the gorge's walls
  const near = new Map(flyers.map(b => [b, 0]));
  let samples = 0, closest = Infinity, who = '', low = Infinity, lowWho = '';
  const round = [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]];
  for (let t = 0; t <= BEATS.END + 1e-9; t += 0.05) {
    step(t);
    const her = herAt(t);
    const head = her.clone().add(new THREE.Vector3(0, 0.8, 0));
    if (t >= 100 && t <= 165) samples++;
    for (const b of flyers) {
      assert.ok(b.visible, `${b.id} seen at ${t.toFixed(2)} s`);
      const d = Math.min(b.position.distanceTo(her), b.position.distanceTo(head));
      if (d < closest) { closest = d; who = `${b.id} at ${t.toFixed(2)} s`; }
      if (t >= 100 && t <= 165 && b.position.distanceTo(her) <= 15) near.set(b, near.get(b) + 1);
      if (t > b.trigger + 1.2 && t < b.land.to - 1) {
        const over = b.position.y - Math.max(...round.map(([dx, dz]) => groundDrawnAt(heightAt, b.position.x + dx, b.position.z + dz)));
        if (over < low) { low = over; lowWho = `${b.id} at ${t.toFixed(2)} s`; }
      }
    }
  }
  assert.ok(closest >= 4, `${who}: ${closest.toFixed(2)} m from her body or Egill's head`);
  assert.ok(low >= 1, `${lowWho}: ${low.toFixed(2)} m over the ground round it`);
  for (const [b, n] of near) assert.ok(n / samples >= 0.8, `${b.id} within 15 m of her ${((100 * n) / samples).toFixed(0)} % of 100 to 165 s`);
  // round her in the slow circle: each goes at least half way round her in F
  for (const b of flyers) {
    const turn = turned(b, step, BEATS.F, BEATS.G);
    assert.ok(turn >= 180, `${b.id} goes ${turn.toFixed(0)} degrees round her in F`);
  }
  // at the end: perched on the far pool's north-east bank, apart, away from where she, Egill and Mosi stand and from the beds of reed
  step(BEATS.END);
  for (const b of flyers) {
    const p = b.position;
    assert.ok(Math.abs(p.y - heightAt(p.x, p.z)) < 0.05 && p.y > FAR_POOL.level + 0.2, `${b.id} stands on the bank`);
    assert.ok(toPool(p) >= FAR_POOL.radius + 1 && toPool(p) <= FAR_POOL.radius + 12, `${b.id} by the far pool (${toPool(p).toFixed(1)} m from its middle)`);
    assert.ok(p.x > FAR_POOL.center[0] && p.z < FAR_POOL.center[1], `${b.id} on its north-east bank`);
    for (const [name, [x, z]] of [['her', FAR_POOL.landing], ['Egill', FAR_POOL.bank], ['Mosi', FAR_POOL.mosi]]) {
      assert.ok(Math.hypot(p.x - x, p.z - z) >= 10, `${b.id} away from where ${name} stands`);
    }
    for (const bed of FAR_POOL.reeds) assert.ok(Math.hypot(p.x - bed.at[0], p.z - bed.at[1]) >= bed.radius + 3, `${b.id} out of the reed`);
    assert.ok(Math.abs(weight(b, 'perch') - 1) < 1e-6, `${b.id} perched`);
  }
  const gap = Math.min(...flyers.flatMap((a, i) => flyers.slice(i + 1).map(b => a.position.distanceTo(b.position))));
  assert.ok(gap >= 2, `landed apart (${gap.toFixed(1)} m at the least)`);
});

test('under reduced motion the flyers hold their places round her: they never circle', async () => {
  const { world, life, step } = made({ critters: await allModels() });
  world.flightReduced = true;
  for (const b of life.flyers) {
    const turn = turned(b, step, BEATS.F, BEATS.G);
    assert.ok(turn < 10, `${b.id} goes ${turn.toFixed(0)} degrees round her in F`);
  }
});

test('without its model there is no herd, and the flight goes on', () => {
  const { life, step } = made({ critters: {} });
  assert.deepEqual(life.herd, []);
  assert.deepEqual(life.flyers, [], 'nor flyers');
  life.bigCall(135.5);
  step(150);
  assert.ok(!life.things.some(t => t.kind === 'grasbitur'));
});

test("after the big call too, life is a function of the flight's clock: jumping lands where playing does", async () => {
  const critters = await allModels();
  const played = made({ critters });
  const jumped = made({ critters });
  played.life.bigCall(135.5);
  jumped.life.bigCall(135.5);
  for (let t = 120; t < 152.7; t += DT) played.step(t);
  played.step(152.7);
  jumped.step(152.7);
  assert.ok(played.life.rows.length === 5 && played.life.flocks.length === 4 && played.life.herd.length === 3, 'the rows, the flocks and the herd');
  assert.ok(played.life.flyers.length >= 6, 'and the flyers');
  played.life.things.forEach((a, i) => {
    const b = jumped.life.things[i];
    assert.equal(a.visible, b.visible, `${a.id} seen in both`);
    assert.ok(a.position.distanceTo(b.position) < 1e-6 && Math.abs(a.heading - b.heading) < 1e-6, `${a.id}: ${a.position.toArray()} and ${b.position.toArray()}`);
    assert.deepEqual(a.morphs, b.morphs, `${a.id}: the same pose`);
  });
});
