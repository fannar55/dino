// Chapter 6 (remake/chapters/kafli6.js), "Boð til Grameðlu", in grey (chunk 1), played through by children of several kinds
// (tests/chapter-harness.mjs): one who touches nothing, one who taps right at once, one who taps wrong every 2 s for ever, one whose
// book stands open for 30 s in each task, one on a tablet that asks for less motion, and one on a tablet held upright. Its three
// tasks have their own tests (kafli6-stones, kafli6-prints, kafli6-call), as do its places (kafli6-route, fjall).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as kafli6 from '../chapters/kafli6.js';
import { playUnattended } from './chapter-harness.mjs';
import { CLOUD_BY_PRINT, FORD, STEPS } from '../chapters/kafli6-route.js';

const { chapter, WORDS } = kafli6;
const FRAME = 1 / 30;
const SKY = ['SunFace', 'SunHandsAndMouth', 'MosiCloud']; // the sky's own decorations (engine/sun-face.js) the cloud must hide

const inFrame = (point, camera) => {
  const p = point.clone().project(camera);
  return p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
};

/**
 * The chapter played by `child` (a function of the chapter's state and the frame, which taps with the frame's pointer), with what
 * the run sees on the way: the big characters shown outside scene 1, every aimed target out of frame while its task waits, the
 * cloud's level, the handheld, the brightened swirl cards (less motion).
 */
function playIt({ seeking = true, aspect = 1.6, reduced = false, child = null, pauses = [], limit = 620 } = {}) {
  const seen = { crowd: [], out: [], cloud: [], handheld: 0, bright: false, aimChecks: 0, around: {}, sky: [], ford: [], rings: [] };
  return playUnattended(kafli6, {
    seeking, limit, shaped: true, aspect, reduced, pauses,
    onFrame(frame) {
      const { world, director, t } = frame;
      // the harness has the smiling sun (createSunFace) but not main.js's Mosi cloud: the smallest stand-in, a sprite of its name
      if (!world.scene.getObjectByName('MosiCloud')) {
        const stand = new THREE.Sprite(new THREE.SpriteMaterial());
        stand.name = 'MosiCloud';
        world.scene.add(stand);
      }
      const c = world.chapterState;
      if (!c) return;
      seen.sky.push({ time: c.s.time, scene: c.scene, shown: SKY.filter(name => world.scene.getObjectByName(name)?.visible) });
      if (c.scene === 2 && c.stones) watchFord(world, c, seen);
      world.camera.updateMatrixWorld();
      const time = c.s.time;
      // never more than three big characters outside the farewell
      if (typeof c.scene === 'number' && c.scene > 1) {
        for (const who of ['sloedla', 'flugedla']) if (world.actors.get(who).root.visible) seen.crowd.push(`${who} at ${time.toFixed(1)} s`);
      }
      // the aimed targets while their task waits (from WAIT_GRACE after the wait began: the shot for it may wait a moment to cut)
      const w = c.waiting;
      if (w && time - w.since >= 2.6) {
        for (const name of w.names) {
          const spec = c.aims[name];
          if (!spec) continue;
          seen.aimChecks++;
          const point = world.resolvePoint(spec, new THREE.Vector3());
          if (!inFrame(point, world.camera)) seen.out.push(`${name} (${w.task}) at ${time.toFixed(1)} s`);
        }
      }
      if (c.cloud) seen.cloud.push({ time, t, level: c.cloud.level, held: Boolean(world.scene.fog?.userData?.heldBy), density: world.scene.fog.density });
      seen.handheld = Math.max(seen.handheld, director.handheldLevel ?? 0);
      if (c.cloud?.cards?.some(card => card.alive && card.kind === 'swirl' && card.bright > 0.05)) seen.bright = true;
      for (const pause of pauses) {
        const key = pause.at;
        if (Math.abs(t - (pause.at - FRAME)) < FRAME / 2) (seen.around[key] ??= {}).before = c.cloud?.level ?? null;
        if (Math.abs(t - (pause.at + pause.seconds + FRAME)) < FRAME / 2) (seen.around[key] ??= {}).after = c.cloud?.level ?? null;
      }
      child?.(c, frame, seen);
    },
  }).then(run => ({ ...run, watched: seen }));
}

/** The ford as it goes, each frame of scene 2: Mosi, Egill and his seat, the wrong stones as they lie, the frogs, and every ring. */
const WRONG = STEPS.flatMap(step => step.stones.filter(stone => !stone.right).map(stone => stone.id));
function watchFord(world, c, seen) {
  if (!seen.ringsWatched && world.forest?.rippleAt) {
    const ripple = world.forest.rippleAt;
    world.forest.rippleAt = (x, z, strength) => { seen.rings.push({ x, z, strength, at: c.s.time }); return ripple(x, z, strength); };
    seen.ringsWatched = true;
  }
  seen.stones = c.stones;
  const mosi = world.actors.get('mosi');
  const egill = world.actors.get('egill');
  mosi.root.updateMatrixWorld(true);
  const frogs = {};
  for (const id of WRONG) frogs[id] = c.frogs.group.getObjectByName(`Critter frog-${id}`).position.clone();
  seen.ford.push({
    time: c.s.time, root: mosi.root.position.clone(), head: mosi.headPosition(new THREE.Vector3()), heading: mosi.heading,
    pitch: THREE.MathUtils.radToDeg(mosi.model.rotation.z), seat: c.saddle.seat.clone(), egill: egill.root.position.clone(),
    stones: Object.fromEntries(WRONG.map(id => [id, c.stones.matrixOf(id).elements.slice()])), frogs,
  });
}

// The children ----------------------------------------------------------------------------------
/** What the chapter wants now, as a key that changes with each new wait, and the right tap for it. */
function wantNow(c) {
  const stones = c.stoneTask?.state();
  if (stones && stones.waiting && !stones.done) {
    const right = c.steps[stones.step].stones.find(s => s.right).id;
    const wrong = c.steps[stones.step].stones.find(s => !s.right).id;
    return { key: `stone ${stones.step}`, right, wrong };
  }
  const prints = c.printTask?.state();
  if (prints && prints.waiting && !prints.done) return { key: `print ${prints.next}`, right: `print${prints.next + 1}`, wrong: null };
  const call = c.callTask?.state();
  if (call && call.phase === 'ask') return { key: `ask ${call.round}`, right: 'mosi', wrong: null };
  if (call && call.phase === 'listen') {
    const wrong = ['left', 'ahead', 'right'].find(d => d !== call.direction);
    return { key: `listen ${call.round}`, right: `dir-${call.direction}`, wrong: `dir-${wrong}` };
  }
  return null;
}
/** Taps the right thing half a second after each wait begins. */
function quickChild(c, frame, seen) {
  const want = wantNow(c);
  if (!want) return;
  if (seen.quick?.key !== want.key) seen.quick = { key: want.key, since: c.s.time, done: false };
  if (!seen.quick.done && c.s.time - seen.quick.since >= 0.5) {
    seen.quick.done = true;
    frame.pointer.tap(want.right, { x: 640, y: 400 });
  }
}
/** Taps wrong every 2 s for ever: a wrong stone, the cloud (no target), a wrong third. */
function wrongChild(c, frame, seen) {
  if (c.s.time - (seen.lastWrong ?? -Infinity) < 2) return;
  const want = wantNow(c);
  const inTask = [2, 4, 5].includes(c.scene);
  if (!want && !inTask) return;
  seen.lastWrong = c.s.time;
  seen.wrongTaps = (seen.wrongTaps ?? 0) + 1;
  if (want?.wrong) frame.pointer.tap(want.wrong, { x: 200, y: 300 });
  else frame.pointer.tap(null, { x: 1180, y: 160 });
}

const once = new Map();
const play = (name, options) => {
  if (!once.has(name)) once.set(name, playIt(options));
  return once.get(name);
};
const untouched = () => play('untouched', { seeking: false });
const quick = () => play('quick', { child: quickChild });
const wrong = () => play('wrong', { child: wrongChild });
const calm = () => play('reduced', { reduced: true, child: wrongChild });
const upright = () => play('upright', { aspect: 0.625 });

const logOf = (run, task, type) => run.world.chapterState.taskLog.filter(e => e.task === task && (!type || e.type === type));
const sceneAt = (run, scene) => run.world.chapterTimeline.find(mark => mark.scene === scene)?.at;
const ended = (run, what) => {
  const { task, stage, world } = run;
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.equal(task.done, true, `${what}: still going at ${stage.s.time.toFixed(1)} s`);
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7, 'end'], what);
  return world.chapterTimeline.at(-1).at;
};

// -----------------------------------------------------------------------------------------------

test('nobody touching: the chapter plays to its end in under 10 minutes and gives the star k6_gramedla', async () => {
  const run = await untouched();
  const end = ended(run, 'untouched');
  assert.ok(end < 600, `the end at ${end.toFixed(1)} s`);
  assert.ok(end > 360, `the end at ${end.toFixed(1)} s: about 7.5 minutes is the aim`);
  assert.deepEqual(run.save.get().stars.filter(id => id === 'k6_gramedla'), ['k6_gramedla'], 'her star, once');
  assert.deepEqual(run.director.warnings, [], 'the director');
  assert.equal(run.book.opened.at(-1)[0], 'map', 'it ends in the book, on the map');
  assert.ok(run.book.nods.includes('gramedla'), 'her tile nods');
});

test('nobody touching: five hops by Mosi, six counts by Egill, three walks by Mosi, each on its help', async () => {
  const run = await untouched();
  const hops = logOf(run, 'stones', 'hop');
  assert.equal(hops.length, 5);
  assert.ok(hops.every(e => e.by === 'mosi'), 'every hop his own');
  assert.equal(logOf(run, 'stones', 'help').filter(e => e.level === 'auto').length, 5);
  const counts = logOf(run, 'prints', 'count');
  assert.equal(counts.length, 6);
  assert.ok(counts.every(e => e.by === 'egill'), 'every print found by Egill');
  const walks = logOf(run, 'call', 'walk');
  assert.equal(walks.length, 3);
  assert.ok(walks.every(e => e.by === 'mosi'), 'every walk his own');
  assert.equal(logOf(run, 'call', 'call').filter(e => e.by === 'mosi').length, 3, 'he calls by himself each round');
  for (const help of ['k6_mosi_flat']) assert.ok(run.seen.spoken.has(help), `${help} is said`);
});

test('a child who taps right at once: no help event in any task, and the three tasks take under 180 s together', async () => {
  const run = await quick();
  ended(run, 'quick');
  for (const task of ['stones', 'prints', 'call']) assert.deepEqual(logOf(run, task, 'help'), [], `no help in ${task}`);
  assert.ok(logOf(run, 'stones', 'hop').every(e => e.by === 'child'));
  assert.ok(logOf(run, 'prints', 'count').every(e => e.by === 'child'));
  assert.ok(logOf(run, 'call', 'walk').every(e => e.by === 'child'));
  const span = task => {
    const log = logOf(run, task);
    return log.find(e => e.type === 'done').at - log[0].at;
  };
  const total = span('stones') + span('prints') + span('call');
  assert.ok(total < 180, `the three tasks took ${total.toFixed(1)} s (${['stones', 'prints', 'call'].map(t => span(t).toFixed(1)).join(', ')})`);
});

test('a child who taps wrong every 2 s for ever (a wrong stone, the cloud, a wrong third) still ends the chapter in under 10 minutes', async () => {
  const run = await wrong();
  const end = ended(run, 'always wrong');
  assert.ok(end < 600, `the end at ${end.toFixed(1)} s`);
  assert.ok(logOf(run, 'stones', 'wobble').length >= 5, 'the stones rocked');
  assert.ok(logOf(run, 'prints', 'swirl').length >= 6, 'the cloud swirled');
  assert.ok(logOf(run, 'call', 'swirl').length >= 3, 'the cloud swirled in the call');
  assert.ok(logOf(run, 'call', 'again').length >= 1, 'Mosi said listen again');
  assert.equal(logOf(run, 'stones', 'hop').filter(e => e.by === 'child').length, 0);
  assert.equal(logOf(run, 'prints', 'count').filter(e => e.by === 'child').length, 0);
  assert.equal(logOf(run, 'call', 'walk').filter(e => e.by === 'child').length, 0);
});

test('the prints are six and the call three rounds, each from a new direction', async () => {
  for (const run of [await untouched(), await quick(), await wrong()]) {
    assert.deepEqual(logOf(run, 'prints', 'count').map(e => e.index), [0, 1, 2, 3, 4, 5]);
    const firsts = logOf(run, 'call', 'answer').filter(e => !e.again);
    assert.deepEqual(firsts.map(e => e.round), [0, 1, 2]);
    for (let k = 1; k < firsts.length; k++) assert.notEqual(firsts[k].direction, firsts[k - 1].direction, `round ${k + 1}`);
    assert.deepEqual(logOf(run, 'call', 'walk').map(e => e.direction), firsts.map(e => e.direction), 'he walks the way she answered');
  }
});

test('the cloud thickens with every print (CLOUD_BY_PRINT) and is gone within 3 s of her roar', async () => {
  const run = await untouched();
  const c = run.world.chapterState;
  const levels = c.chapterLog.filter(e => e.type === 'cloudLevel').map(e => e.level);
  assert.deepEqual(levels.slice(0, 7), CLOUD_BY_PRINT, 'a level before the prints and one after each');
  const [roar] = c.chapterLog.filter(e => e.type === 'herRoar' && e.scene === 6);
  assert.ok(roar, 'she roars in scene 6');
  const after = run.watched.cloud.filter(f => f.time >= roar.at + 3);
  assert.ok(after.length && after[0].level < 0.05, `the cloud at ${after[0]?.level.toFixed(2)} 3 s after the roar`);
  const later = run.watched.cloud.filter(f => f.time >= roar.at + 4.5);
  assert.ok(later.length && !later[0].held, 'the cloud has let the fog go');
});

test('the book open for 30 s in each task: the same help comes 30 s later and the cloud is as thick after as before', async () => {
  const base = await untouched();
  const pauses = [2, 4, 5].map((scene, k) => ({ at: sceneAt(base, scene) + 10 + 30 * k, seconds: 30 }));
  const run = await play('paused', { seeking: false, pauses });
  ended(run, 'paused');
  for (const task of ['stones', 'prints', 'call']) {
    const a = logOf(base, task, 'help').map(e => `${e.level} ${e.at.toFixed(1)}`);
    const b = logOf(run, task, 'help').map(e => `${e.level} ${e.at.toFixed(1)}`);
    assert.deepEqual(b, a, `${task}: the help at the same scene times (30 s later on the room's clock)`);
  }
  for (const pause of pauses.slice(1)) {
    const { before, after } = run.watched.around[pause.at] ?? {};
    assert.ok(Number.isFinite(before) && Math.abs(after - before) < 1e-6, `the cloud before ${before} and after ${after}`);
  }
});

test('reduced motion: no handheld, the cloud fades, a wrong tap brightens, and the chapter ends', async () => {
  const run = await calm();
  ended(run, 'reduced');
  assert.equal(run.watched.handheld, 0, 'no handheld');
  const c = run.world.chapterState;
  assert.equal(c.cloud?.reduced ?? c.cloudReduced, true, 'the cloud is told');
  assert.ok(run.watched.bright, 'a wrong tap in the cloud brightens it');
  assert.ok(c.chapterLog.some(e => e.type === 'thud' && !e.handheld), 'the thud without the shake');
});

test('upright (aspect 0.625): every aimed target is on the screen whenever its task waits', async () => {
  const run = await upright();
  ended(run, 'upright');
  assert.ok(run.watched.aimChecks > 300, `${run.watched.aimChecks} checks`);
  assert.deepEqual(run.watched.out.slice(0, 12), []);
});

test('every line of WORDS is said at least once by the untouched and the wrong-tapping child together', async () => {
  const said = new Set([...(await untouched()).seen.spoken, ...(await wrong()).seen.spoken]);
  const missing = Object.keys(WORDS).filter(id => !said.has(id));
  assert.deepEqual(missing, []);
  for (let n = 1; n <= 6; n++) assert.ok(said.has(`k2_mosi_${n}`), `Mosi counts ${n}`);
});

test('outside scene 1 Slóeðla and Flugeðla are not shown, so never more than three big characters', async () => {
  for (const run of [await untouched(), await quick()]) assert.deepEqual(run.watched.crowd.slice(0, 5), []);
});

test("in the cloud the sky's own Mosi cloud and smiling sun are hidden, and back once it has blown away", async () => {
  const run = await untouched();
  const { world, watched } = run;
  const log = world.chapterState.chapterLog.filter(e => e.type === 'sky');
  assert.deepEqual(log.map(e => e.hidden), [true, false], 'hidden once, shown once');
  assert.equal(log[0].scene, 4, 'hidden as the chapter enters the belt');
  assert.equal(log[0].count, SKY.length, 'every decoration was found');
  const blow = world.chapterState.chapterLog.find(e => e.type === 'blow');
  const back = log[1].at;
  assert.equal(log[1].scene, 6);
  assert.ok(back > blow.at && back - blow.at < 4, `back ${(back - blow.at).toFixed(1)} s after the blow began`);
  const inCloud = watched.sky.filter(f => (f.scene === 4 && f.time > log[0].at + 0.5) || f.scene === 5 || (f.scene === 6 && f.time < blow.at));
  assert.ok(inCloud.length > 1000, `${inCloud.length} frames in the cloud`);
  assert.deepEqual(inCloud.filter(f => f.shown.length).map(f => `${f.shown} at ${f.time.toFixed(1)} s`), [], 'none shows in the cloud');
  const before = watched.sky.filter(f => f.scene === 3);
  const after = watched.sky.filter(f => f.time > back + 0.1);
  for (const [what, frames] of [['before the belt', before], ['after the blow', after]]) {
    assert.ok(frames.length > 0 && frames.every(f => f.shown.length === SKY.length), `all shown ${what}`);
  }
  for (const name of SKY) assert.equal(world.scene.getObjectByName(name).visible, true, `${name} as the engine had it at the end`);
});


// The ford (Task 7) ------------------------------------------------------------------------------
/** The frames of scene 2 from Mosi's first hop on (he crosses), as watchFord saw them. */
function crossingFrames(run) {
  const [first] = logOf(run, 'stones', 'hop');
  return run.watched.ford.filter(f => f.time >= first.at);
}
const turned = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('a wrong stone wobbles and comes to rest where it lay; its frog is in the water with a ring', async () => {
  const run = await wrong();
  const { ford, rings } = run.watched;
  const c = run.world.chapterState;
  const [first] = logOf(run, 'stones', 'wobble');
  assert.ok(first, 'a wrong stone wobbled');
  const id = first.stone;
  const before = ford.filter(f => f.time < first.at).at(-1);
  const during = ford.filter(f => f.time > first.at && f.time < first.at + 1);
  const after = ford.find(f => f.time > first.at + 1.4);
  const moved = Math.max(...during.map(f => Math.max(...f.stones[id].map((v, i) => Math.abs(v - before.stones[id][i])))));
  assert.ok(moved > 0.01, `it wobbled (${moved.toFixed(3)})`);
  assert.deepEqual(after.stones[id], before.stones[id], 'at rest as it lay');
  // its frog hopped off into the water: on the water's level, off every stone, with a ring where it came down
  const hop = c.chapterLog.find(e => e.type === 'frog' && e.id === `frog-${id}` && e.into);
  assert.ok(hop, 'its frog hopped in');
  const landed = ford.find(f => f.time > hop.at + 0.4);
  const frog = landed.frogs[id];
  assert.ok(Math.abs(frog.y - FORD.level) < 0.05, `the frog at ${(frog.y - FORD.level).toFixed(2)} m over the water`);
  for (const other of STEPS.flatMap(step => step.stones)) assert.equal(run.watched.stones.surfaceAt(other.id, frog.x, frog.z), -Infinity, `the frog off ${other.id}`);
  const before0 = before.frogs[id];
  assert.ok(Math.hypot(frog.x - before0.x, frog.z - before0.z) > 0.5, 'it hopped off its stone');
  const ring = rings.find(r => Math.abs(r.at - hop.at) < 0.05 && Math.hypot(r.x - frog.x, r.z - frog.z) < 0.4);
  assert.ok(ring, `a ring where it came down (${rings.length} rings)`);
});

test('nothing of Mosi jumps more than 8 degrees or 0.15 m in a frame while he crosses', async () => {
  const run = await untouched();
  const frames = crossingFrames(run);
  assert.ok(frames.length > 600, `${frames.length} frames`);
  const worst = { root: 0, head: 0, heading: 0, pitch: 0 };
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1], b = frames[k];
    worst.root = Math.max(worst.root, a.root.distanceTo(b.root));
    worst.head = Math.max(worst.head, a.head.distanceTo(b.head));
    worst.heading = Math.max(worst.heading, turned(a.heading, b.heading));
    worst.pitch = Math.max(worst.pitch, Math.abs(a.pitch - b.pitch));
  }
  assert.ok(worst.root <= 0.15 && worst.head <= 0.15, `his root ${worst.root.toFixed(3)} m, his head ${worst.head.toFixed(3)} m in a frame`);
  assert.ok(worst.heading <= 8 && worst.pitch <= 8, `he turned ${worst.heading.toFixed(2)} and pitched ${worst.pitch.toFixed(2)} degrees in a frame`);
  // he went all the way over: from the north bank onto the south one
  assert.ok(frames[0].root.distanceTo(frames.at(-1).root) > 20, 'over the river');
  // and the water rang where his front feet came down on each stone
  for (const step of STEPS) {
    const right = step.stones.find(stone => stone.right);
    assert.ok(run.watched.rings.some(r => Math.hypot(r.x - right.at[0], r.z - right.at[1]) < 0.01), `a ring at ${right.id}`);
  }
});

test('Egill stays in the saddle through every hop (within 2 cm)', async () => {
  for (const run of [await untouched(), await quick()]) {
    const frames = crossingFrames(run);
    const off = Math.max(...frames.map(f => f.egill.distanceTo(f.seat)));
    assert.ok(off <= 0.02, `Egill ${off.toFixed(3)} m off his seat`);
    // and the seat bounces with Mosi's hop: up and down by more than 20 cm over the crossing
    const lift = Math.max(...frames.map(f => f.seat.y - f.root.y)) - Math.min(...frames.map(f => f.seat.y - f.root.y));
    assert.ok(lift > 0.2, `the seat bounced ${lift.toFixed(2)} m`);
  }
});
