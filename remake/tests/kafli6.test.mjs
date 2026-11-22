// Chapter 6 (remake/chapters/kafli6.js), "Boð til Grameðlu", in grey (chunk 1), played through by children of several kinds
// (tests/chapter-harness.mjs): one who touches nothing, one who taps right at once, one who taps wrong every 2 s for ever, one whose
// book stands open for 30 s in each task, one on a tablet that asks for less motion, and one on a tablet held upright. Its three
// tasks have their own tests (kafli6-stones, kafli6-prints, kafli6-call), as do its places (kafli6-route, fjall).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as kafli6 from '../chapters/kafli6.js';
import { playUnattended } from './chapter-harness.mjs';
import { CLOUD_BY_PRINT, FORD, STEPS, CALL, callStand } from '../chapters/kafli6-route.js';
import { SHAPE, STEP_OUT, SNIFF } from '../chapters/kafli6-gramedla.js';

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
  const seen = { climb: { side: [], slide: { gramedla: 0, mosi: 0 }, seat: 0, top: null }, crowd: [], out: [], cloud: [], handheld: 0, bright: false, aimChecks: 0, around: {}, sky: [], ford: [], rings: [], mountain: { glade: [], hop: 0, summit: null, veil: [] }, her: [], music: [] };
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
      // the music's level as the chapter sets it (engine/audio/music.js setLevel: a straight line over `seconds`)
      if (!world.music) world.music = { setLevel: (level, seconds = 1) => seen.music.push({ level, seconds, at: world.chapterState?.s.time ?? 0 }) };
      const c = world.chapterState;
      if (!c) return;
      seen.sky.push({ time: c.s.time, scene: c.scene, shown: SKY.filter(name => world.scene.getObjectByName(name)?.visible) });
      if (c.scene === 2 && c.stones) watchFord(world, c, seen);
      world.camera.updateMatrixWorld();
      const time = c.s.time;
      // never more than three big characters outside the farewell
      if (typeof c.scene === 'number' && c.scene > 1) {
        for (const who of ['sloedla', 'flugedla']) {
          const actor = world.actors.get(who);
          // Flugeðla at the very end is a speck far out over the sea of cloud, not a big character in the frame
          const far = who === 'flugedla' && c.scene === 7 && actor.root.position.distanceTo(world.actors.get('gramedla').root.position) > 100;
          if (actor.root.visible && !far) seen.crowd.push(`${who} at ${time.toFixed(1)} s`);
        }
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
      watchMountain(world, c, seen.mountain);
      watchHer(world, c, seen.her);
      watchClimb(world, c, seen.climb);
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

/** The mountain as the chapter plays it (world/fjall): the glade's glow on the slope, the pebbles, the top's shape, the last wisp. */
function watchMountain(world, c, seen) {
  const place = world.forest;
  if (!place) return;
  if (c.scene === 3 && place.far) seen.glade.push({ time: c.s.time, level: place.far.kambedla.glow.material.uniforms.uLevel.value });
  if (c.scene === 4 && place.pebbles) seen.hop = Math.max(seen.hop, ...place.pebbles.stones.map(stone => stone.lift ?? 0));
  if (c.scene === 6 && place.summit && c.meet && !seen.summit) seen.summit = { at: place.summit.group.position.clone(), stand: c.meet.stand };
  if (c.scene === 7 && place.veil) seen.veil.push(place.veil.level);
}

/**
 * Grameðla, Mosi and Egill each frame of scenes 5 and 6 until the star (Task 10): her place, head, snout and heading, how much of her
 * is drawn, her feet, the call's round, the glow, Egill's and Mosi's heads, and Mosi's neck, head and jaw (his little roar).
 */
const MOSI_BONES = ['Neck', 'Head', 'Jaw'];
function watchHer(world, c, seen) {
  if (!(c.scene === 5 || c.scene === 6) || !c.her?.points) return;
  if (c.chapterLog.some(e => e.type === 'star')) return;
  const her = world.actors.get('gramedla');
  const mosi = world.actors.get('mosi');
  const egill = world.actors.get('egill');
  for (const a of [her, mosi, egill]) a.root.updateMatrixWorld(true);
  const call = c.callTask?.state();
  const glow = c.cloud?.glowMesh;
  seen.push({
    time: c.s.time, scene: c.scene, round: call?.round ?? null, phase: call?.phase ?? null, direction: call?.direction ?? null,
    drawn: her.root.visible ? c.her.seen : 0, ...c.her.points(),
    feet: ['LeftFoot', 'RightFoot'].map(n => her.model.getObjectByName(n).getWorldPosition(new THREE.Vector3())),
    egill: egill.headPosition(new THREE.Vector3()), mosiHead: mosi.headPosition(new THREE.Vector3()), mosiRoot: mosi.root.position.clone(),
    glow: { level: c.cloud?.glowLevel ?? 0, at: glow?.material.uniforms.uCentre.value.clone() },
    mosiBones: MOSI_BONES.map(n => mosi.model.getObjectByName(n).quaternion.clone()),
  });
}

/**
 * Scene 7 (Task 11), each frame: Egill on the seat on her head from when he is seated; in the tramp up (from 'tramp' to 'tramped')
 * how far Mosi is from her side (across her way and along it) and how far a planted foot of either moves in a frame (a foot is
 * planted while its heel stands, in its own root's frame, within 2 mm of where it stood at the start of the scene; not on the rim's
 * steep shoulder, more than STEEP degrees, where the feet keep to her root's level and the brow hides them); and in top_wide,
 * once they stand, whether she, Mosi and Egill are in the frame and where Flugeðla is.
 */
const STEEP = 15;
const CLIMB_FEET = { gramedla: ['LeftFoot', 'RightFoot'], mosi: ['BackFootL', 'BackFootR', 'FrontFootL', 'FrontFootR'] };
function watchClimb(world, c, seen) {
  if (c.scene !== 7) return;
  const her = world.actors.get('gramedla'), mosi = world.actors.get('mosi'), egill = world.actors.get('egill');
  for (const a of [her, mosi, egill]) a.root.updateMatrixWorld(true);
  const actors = { gramedla: her, mosi };
  const heels = who => CLIMB_FEET[who].map(n => {
    const bone = actors[who].model.getObjectByName(n);
    const p = bone.getWorldPosition(new THREE.Vector3());
    return { world: p, y: actors[who].root.worldToLocal(p.clone()).y };
  });
  seen.rest ??= { gramedla: heels('gramedla').map(h => h.y), mosi: heels('mosi').map(h => h.y) };
  const log = c.chapterLog;
  if (c.seat && log.some(e => e.type === 'seated')) seen.seat = Math.max(seen.seat, egill.root.position.distanceTo(c.seat.update()));
  const tramping = log.some(e => e.type === 'tramp') && !log.some(e => e.type === 'tramped');
  if (tramping) {
    const ahead = new THREE.Vector3(1, 0, 0).applyQuaternion(her.root.quaternion).setY(0).normalize();
    const d = mosi.root.position.clone().sub(her.root.position).setY(0);
    seen.side.push({ time: c.s.time, across: Math.abs(d.x * ahead.z - d.z * ahead.x), along: d.dot(ahead) });
    const now = { place: world.forest, gramedla: heels('gramedla'), mosi: heels('mosi'), roots: { gramedla: her.root.position.clone(), mosi: mosi.root.position.clone() } };
    if (seen.last && seen.last.place === now.place) {
      for (const who of ['gramedla', 'mosi']) now[who].forEach((h, k) => {
        const a = now.roots[who], b = seen.last.roots[who];
        if (Math.abs(a.y - b.y) > Math.tan(THREE.MathUtils.degToRad(STEEP)) * Math.hypot(a.x - b.x, a.z - b.z) + 1e-4) return;
        const was = seen.last[who][k], rest = seen.rest[who][k];
        if (h.y - rest < 0.002 && was.y - rest < 0.002) {
          const moved = Math.hypot(h.world.x - was.world.x, h.world.z - was.world.z);
          if (moved > seen.slide[who]) { seen.slide[who] = moved; seen.slideAt = { who, k, time: c.s.time }; }
        }
      });
    }
    seen.last = now;
  }
  const stood = log.find(e => e.type === 'tramped');
  if (c.shotLabel === 'top_wide' && stood && !seen.top && c.s.time >= stood.at + 0.5) {
    const flier = world.actors.get('flugedla');
    seen.top = {
      time: c.s.time,
      framed: {
        gramedla: inFrame(her.headPosition(new THREE.Vector3()), world.camera) && inFrame(her.root.position, world.camera),
        mosi: inFrame(mosi.headPosition(new THREE.Vector3()), world.camera),
        egill: inFrame(egill.headPosition(new THREE.Vector3()), world.camera),
      },
      flier: { shown: flier.root.visible, off: flier.root.position.distanceTo(her.root.position), below: her.root.position.y - flier.root.position.y },
    };
  }
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
/** Taps `name` once, a second after the chapter waits for a tap on her head or Egill (scene 7). */
const headTap = name => (c, frame, seen) => {
  if (c.waiting?.task !== 'head' || seen.headTapped || c.s.time - c.waiting.since < 1) return;
  seen.headTapped = c.s.time;
  frame.pointer.tap(name, { x: 640, y: 400 });
};
// a child who taps only her head, and an upright one who taps only Egill: as a child plays (no seeking, which takes a tap by itself)
const herHead = () => play('her head', { seeking: false, child: headTap('gramedla-head') });
const egillTapped = () => play('egill tapped', { seeking: false, aspect: 0.625, child: headTap('egill') });

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
  const worst = { root: 0, head: 0, heading: 0, pitch: 0, at: {} };
  const most = (what, v, t) => { if (v > worst[what]) { worst[what] = v; worst.at[what] = t.toFixed(2); } };
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1], b = frames[k];
    most('root', a.root.distanceTo(b.root), b.time);
    most('head', a.head.distanceTo(b.head), b.time);
    most('heading', turned(a.heading, b.heading), b.time);
    most('pitch', Math.abs(a.pitch - b.pitch), b.time);
  }
  assert.ok(worst.root <= 0.15 && worst.head <= 0.15, `his root ${worst.root.toFixed(3)} m, his head ${worst.head.toFixed(3)} m in a frame (at ${JSON.stringify(worst.at)} s)`);
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

test('the mountain as it plays: the glade glows while Egill speaks of it, the pebbles hop at the thud, the top ahead after the roar, the last wisp thins', async () => {
  const run = await untouched();
  const { glade, hop, summit, veil } = run.watched.mountain;
  assert.ok(glade.some(f => f.level > 0.5), 'the glade glows on the slope');
  assert.ok(glade.at(-1).level === 0, 'and is off again before the slope is left');
  assert.ok(glade[0].level === 0, 'off as the slope begins');
  assert.ok(hop > 0.08, `the pebbles hop ${hop.toFixed(2)} m`);
  assert.ok(summit, 'the top placed at the meet');
  const ahead = Math.hypot(summit.at.x - summit.stand.x, summit.at.z - summit.stand.z);
  const way = Math.atan2(summit.at.z - summit.stand.z, summit.at.x - summit.stand.x) * 180 / Math.PI;
  assert.ok(ahead > 200 && Math.abs(((way - summit.stand.heading + 540) % 360) - 180) < 5, `ahead of them: ${ahead.toFixed(0)} m at ${way.toFixed(0)}`);
  assert.ok(veil.length && veil[0] === 1 && veil.at(-1) === 0, 'the last wisp on the top, thinned away');
});


// Grameðla in the cloud (Task 10) ------------------------------------------------------------------
const TURNS = { left: -CALL.angle, ahead: 0, right: CALL.angle };
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** The way from `stand` to `point`, in degrees from his heading (left negative). */
const sideOf = (stand, point) => (((Math.atan2(point.z - stand.z, point.x - stand.x) * 180) / Math.PI - stand.heading + 540) % 360) - 180;
const herLog = (run, what) => run.world.chapterState.chapterLog.filter(e => e.type === 'her' && e.what === what);

test("in round 1 she is hidden and the glow is on the answer's side", async () => {
  for (const run of [await untouched(), await quick()]) {
    const frames = run.watched.her.filter(f => f.scene === 5 && f.round === 0 && f.phase === 'listen');
    assert.ok(frames.length > 10, `${frames.length} frames`);
    assert.equal(Math.max(...frames.map(f => f.drawn)), 0, 'nothing of her is drawn in the first round');
    const stand = callStand(0, []);
    const lit = frames.filter(f => f.glow.level > 0.3);
    assert.ok(lit.length > 5, 'the glow is on');
    for (const f of lit) {
      const side = sideOf(stand, f.glow.at);
      assert.ok(Math.abs(side - TURNS[f.direction]) < 3, `the glow at ${side.toFixed(1)} degrees for ${f.direction}`);
    }
  }
});

test("in rounds 2 and 3 she stands on the answer's side at CALL.her metres, facing Mosi, seen 0.35 and 0.7", async () => {
  for (const run of [await untouched(), await quick()]) {
    const { directions } = run.world.chapterState.callTask;
    for (const round of [1, 2]) {
      const frames = run.watched.her.filter(f => f.scene === 5 && f.round === round && ['listen', 'walk'].includes(f.phase));
      assert.ok(frames.length > 10, `round ${round + 1}: ${frames.length} frames`);
      const most = Math.max(...frames.map(f => f.drawn));
      assert.ok(Math.abs(most - SHAPE.seen[round]) < 0.01, `round ${round + 1}: seen ${most.toFixed(3)}`);
      // as soon as she is all there (before her step toward them)
      const f = frames.find(g => g.drawn >= SHAPE.seen[round] - 0.005);
      const stand = callStand(round, directions);
      const off = flat(f.root, stand);
      assert.ok(Math.abs(off - CALL.her[round]) < 0.3, `round ${round + 1}: ${off.toFixed(2)} m from Mosi`);
      // straight ahead she stands a little to his right (kafli6-gramedla.js SHAPE.ahead), or the call's camera sees her behind him
      const side = sideOf(stand, f.root);
      const want = f.direction === 'ahead' ? SHAPE.ahead : TURNS[f.direction];
      assert.ok(Math.abs(side - want) < 2, `round ${round + 1}: at ${side.toFixed(1)} degrees for ${f.direction}`);
      const facing = (((Math.atan2(stand.z - f.root.z, stand.x - f.root.x) * 180) / Math.PI - f.heading + 540) % 360) - 180;
      assert.ok(Math.abs(facing) < 5, `round ${round + 1}: she faces ${facing.toFixed(1)} degrees off Mosi`);
    }
  }
});

test(`she steps out to ${STEP_OUT.stop} m ahead of Mosi and never nearer than ${STEP_OUT.clear} m to Egill's head until she bows`, async () => {
  for (const run of [await untouched(), await quick()]) {
    const [bow] = herLog(run, 'bow');
    const [stopped] = herLog(run, 'stopped');
    assert.ok(bow && stopped, 'she stopped and bowed');
    const frames = run.watched.her.filter(f => f.scene === 6 && f.time < bow.at && f.drawn > 0);
    assert.ok(frames.length > 60, `${frames.length} frames`);
    const at = frames.at(-1);
    const { stand } = run.world.chapterState.meet;
    const ahead = flat(at.root, stand);
    assert.ok(Math.abs(ahead - STEP_OUT.stop) < 0.25, `she stopped ${ahead.toFixed(2)} m ahead of his root`);
    assert.ok(Math.abs(sideOf(stand, at.root)) < 2, 'straight ahead of him');
    const nearest = Math.min(...frames.map(f => Math.min(f.snout.distanceTo(f.egill), f.head.distanceTo(f.egill))));
    assert.ok(nearest >= STEP_OUT.clear, `her snout ${nearest.toFixed(2)} m from Egill's head before she bowed`);
    // and nothing of her is in the white before she comes out of it: she is drawn from the stepOut on
    assert.ok(frames[0].time >= herLog(run, 'stepOut')[0].at - 1e-6);
  }
});

test("bowing, her snout comes within 1.0 to 1.5 m of Egill's head and her feet stay planted", async () => {
  for (const run of [await untouched(), await quick()]) {
    const [bow] = herLog(run, 'bow');
    const [up] = herLog(run, 'up');
    const frames = run.watched.her.filter(f => f.time >= bow.at && f.time <= up.at);
    assert.ok(frames.length > 100, `${frames.length} frames`);
    const nearest = Math.min(...frames.map(f => f.snout.distanceTo(f.egill)));
    assert.ok(nearest >= 1.0 && nearest <= 1.5, `her snout ${nearest.toFixed(2)} m from Egill's head at its nearest`);
    const moved = Math.max(...frames.map(f => Math.max(f.feet[0].distanceTo(frames[0].feet[0]), f.feet[1].distanceTo(frames[0].feet[1]))));
    assert.ok(moved < 0.03, `a foot moved ${moved.toFixed(3)} m while she bowed`);
    // and her snout is in front of his head and not under it: she sniffs Egill, not Mosi
    const low = frames.reduce((a, f) => (f.snout.distanceTo(f.egill) < a.snout.distanceTo(a.egill) ? f : a));
    assert.ok(low.snout.y > low.egill.y - 0.6, `her snout ${(low.egill.y - low.snout.y).toFixed(2)} m under his head`);
    assert.ok(low.snout.distanceTo(low.mosiHead) > 0.9, `her snout ${low.snout.distanceTo(low.mosiHead).toFixed(2)} m from Mosi's head`);
  }
});

test('nothing of her jumps more than 8 degrees or 0.15 m in a frame from her first shape to the star', async () => {
  for (const run of [await untouched(), await quick(), await upright()]) {
    const frames = run.watched.her;
    const first = frames.findIndex(f => f.drawn > 0);
    assert.ok(first >= 0, 'she was seen');
    const worst = { root: 0, head: 0, snout: 0, heading: 0, at: {} };
    const most = (what, v, t) => { if (v > worst[what]) { worst[what] = v; worst.at[what] = t.toFixed(2); } };
    let pairs = 0;
    for (let k = first + 1; k < frames.length; k++) {
      const a = frames[k - 1], b = frames[k];
      if (!(a.drawn > 0 && b.drawn > 0) || b.time - a.time > 0.1) continue;
      pairs++;
      for (const what of ['root', 'head', 'snout']) most(what, a[what].distanceTo(b[what]), b.time);
      most('heading', turned(a.heading, b.heading), b.time);
    }
    assert.ok(pairs > 600, `${pairs} frames seen`);
    assert.ok(worst.root <= 0.15 && worst.head <= 0.15 && worst.snout <= 0.15, `root ${worst.root.toFixed(3)}, head ${worst.head.toFixed(3)}, snout ${worst.snout.toFixed(3)} m in a frame (at ${JSON.stringify(worst.at)} s)`);
    assert.ok(worst.heading <= 8, `she turned ${worst.heading.toFixed(2)} degrees in a frame`);
  }
});

test('the star rises from over her head and is k6_gramedla', async () => {
  const run = await untouched();
  const stars = run.world.chapterState.chapterLog.filter(e => e.type === 'star');
  assert.equal(stars.length, 1);
  const [star] = stars;
  assert.equal(star.id, 'k6_gramedla');
  const from = new THREE.Vector3(...star.from), head = new THREE.Vector3(...star.head);
  assert.ok(from.y - head.y > 1 && from.y - head.y < 3, `${(from.y - head.y).toFixed(2)} m over her head`);
  assert.ok(flat(from, head) < 0.5, `${flat(from, head).toFixed(2)} m to the side of it`);
  assert.equal(star.scene, 6);
  assert.deepEqual(run.save.get().stars.filter(id => id === 'k6_gramedla'), ['k6_gramedla']);
});

// Scene 7 (Task 11): the seat on her head and the walk up --------------------------------------------------------------------------

test('Egill floats up when her head or he is tapped, and after 6 s when nothing is', async () => {
  const runs = { nothing: await untouched(), 'gramedla-head': await herHead(), egill: await egillTapped() };
  for (const [name, run] of Object.entries(runs)) {
    ended(run, name);
    const log = run.world.chapterState.chapterLog;
    const down = log.find(e => e.type === 'her' && e.what === 'headIsDown');
    const on = log.find(e => e.type === 'onHerHead');
    const seated = log.find(e => e.type === 'seated');
    assert.ok(down && on && seated, `${name}: her head down, the float and the seat are logged`);
    if (name === 'nothing') {
      assert.equal(on.tapped, null);
      assert.ok(Math.abs(on.at - down.at - 6) < 0.2, `nothing tapped: he floats up ${(on.at - down.at).toFixed(2)} s after her head is down`);
    } else {
      assert.equal(on.tapped, name, `${name} tapped`);
      assert.ok(Math.abs(on.at - run.watched.headTapped) < 0.1, `${name}: he floats up ${(on.at - run.watched.headTapped).toFixed(2)} s after the tap`);
    }
    assert.ok(Math.abs(seated.at - on.at - 2.6) < 0.1, `${name}: the float takes ${(seated.at - on.at).toFixed(2)} s`);
  }
});

test('in the tramp up Mosi stays 4 to 9 m from her side and neither slides a planted foot more than 3 cm in a frame', async () => {
  for (const run of [await untouched(), await egillTapped()]) {
    const { side, slide, slideAt } = run.watched.climb;
    assert.ok(side.length > 300, `${side.length} frames of the tramp`);
    const across = side.map(f => f.across), along = side.map(f => Math.abs(f.along));
    assert.ok(Math.min(...across) >= 4 && Math.max(...across) <= 9, `Mosi is ${Math.min(...across).toFixed(2)} to ${Math.max(...across).toFixed(2)} m off her side`);
    assert.ok(Math.max(...along) <= 9, `and at most ${Math.max(...along).toFixed(2)} m ahead of her or behind`);
    for (const who of ['gramedla', 'mosi']) assert.ok(slide[who] <= 0.03, `${who}'s planted foot slid ${(slide[who] * 100).toFixed(1)} cm in a frame (${JSON.stringify(slideAt)})`);
  }
});

test("Egill stays within 2 cm of the seat from the rise to the chapter's end", async () => {
  for (const run of [await untouched(), await herHead()]) {
    const { seat } = run.watched.climb;
    assert.ok(seat < 0.02, `he was ${(seat * 100).toFixed(1)} cm off the seat`);
    assert.ok(run.world.chapterState.riding, 'he rides her to the end');
  }
});

test('in top_wide she, Mosi and Egill are in frame at both shapes of screen, and Flugeðla is over 100 m off and below them', async () => {
  for (const run of [await untouched(), await egillTapped()]) {
    const { top } = run.watched.climb;
    assert.ok(top, 'top_wide was held with them standing');
    assert.deepEqual(top.framed, { gramedla: true, mosi: true, egill: true });
    assert.equal(top.flier.shown, true, 'Flugeðla is there, far below');
    assert.ok(top.flier.off > 100, `Flugeðla is ${top.flier.off.toFixed(0)} m off`);
    assert.ok(top.flier.below > 0, `and ${top.flier.below.toFixed(1)} m below her feet`);
  }
});

// The sounds (Task 12) ------------------------------------------------------------------------------------------------------------

const soundsOf = (run, name) => run.world.chapterState.chapterLog.filter(e => e.type === 'sound' && (!name || e.name === name));
/** The music's level at `t` (scene time), from the chapter's setLevel calls (a straight line from where it was over `seconds`). */
function musicAt(calls, t) {
  const valueAt = (r, x) => (r.seconds <= 0 || x >= r.start + r.seconds ? r.to : r.from + (r.to - r.from) * ((x - r.start) / r.seconds));
  let ramp = { from: 1, to: 1, start: -Infinity, seconds: 0 };
  for (const call of calls) {
    if (call.at > t) break;
    ramp = { from: valueAt(ramp, call.at), to: call.level, start: call.at, seconds: call.seconds };
  }
  return valueAt(ramp, t);
}

test('her answer is quieter and duller the further off she is: 60, 30 and 12 m in that order', async () => {
  const { farRoarAt } = kafli6;
  const db = level => 20 * Math.log10(level);
  const far = farRoarAt(60), mid = farRoarAt(30), near = farRoarAt(12);
  assert.ok(Math.abs(db(far.level) + 14) < 0.01 && far.cutoff === 700, `60 m: ${db(far.level).toFixed(1)} dB through ${far.cutoff} Hz`);
  assert.ok(Math.abs(db(mid.level) + 7) < 0.01 && mid.cutoff === 1800, `30 m: ${db(mid.level).toFixed(1)} dB through ${mid.cutoff} Hz`);
  assert.ok(Math.abs(db(near.level)) < 0.01 && near.cutoff === null, `12 m: ${db(near.level).toFixed(1)} dB, no low-pass`);
  assert.ok(far.tail > mid.tail && mid.tail > near.tail, `a longer tail far off: ${far.tail}, ${mid.tail}, ${near.tail} s`);
  for (const run of [await untouched(), await quick()]) {
    const firsts = logOf(run, 'call', 'answer').filter(e => !e.again);
    const roars = firsts.map(answer => soundsOf(run, 'gramedlaRoar').find(e => e.scene === 5 && e.at >= answer.at - 1e-6 && e.at < answer.at + 0.2));
    assert.ok(roars.every(Boolean), 'each answer is her roar');
    assert.deepEqual(roars.map(e => e.distance), CALL.her, 'from 60, 30 and 12 m');
    assert.ok(roars[0].level < roars[1].level && roars[1].level < roars[2].level, `louder as she comes: ${roars.map(e => e.level.toFixed(2))}`);
    assert.deepEqual(roars.map(e => e.cutoff ?? null), [700, 1800, null], 'and clearer');
    const sides = { left: -1, ahead: 0, right: 1 };
    roars.forEach((e, k) => assert.equal(Math.sign(e.pan), sides[firsts[k].direction], `round ${k + 1} heard from the ${firsts[k].direction}`));
  }
});

test('in the cloud the music is at 0 from the first print to her roar, and at 1 within 2 s after it', async () => {
  const run = await untouched();
  const calls = run.watched.music;
  assert.ok(calls.length >= 2, `${calls.length} calls`);
  const c = run.world.chapterState;
  const [print] = run.seen.said.filter(e => e.id === 'k6_mosi_print');
  const roar = c.chapterLog.find(e => e.type === 'herRoar' && e.scene === 6);
  for (const scene of [2, 3]) {
    const from = sceneAt(run, scene), to = sceneAt(run, scene + 1);
    for (let t = from; t < to; t += 0.5) assert.equal(musicAt(calls, t), 1, `the music at 1 at ${t.toFixed(1)} s (scene ${scene})`);
  }
  for (let t = print.at; t <= roar.at; t += 0.5) assert.equal(musicAt(calls, t), 0, `the music at 0 at ${t.toFixed(1)} s in the cloud`);
  assert.equal(musicAt(calls, roar.at + 2), 1, 'back 2 s after her roar');
  assert.ok(musicAt(calls, roar.at + 1) > 0.3 && musicAt(calls, roar.at + 1) < 0.7, 'coming back over the 2 s');
  const into = calls.find(call => call.level === 0);
  assert.equal(into.seconds, 3, 'gone over 3 s as they go into the cloud');
});

test('a wrong stone is heard: the rock, then the splash; a hop: hooves', async () => {
  const run = await wrong();
  const c = run.world.chapterState;
  const wobbles = logOf(run, 'stones', 'wobble');
  assert.ok(wobbles.length >= 5);
  let splashes = 0;
  for (const wobble of wobbles) {
    const rock = soundsOf(run, 'stoneRock').find(e => Math.abs(e.at - wobble.at) < 0.05);
    assert.ok(rock, `the stone rocks at ${wobble.at.toFixed(1)} s`);
    const into = c.chapterLog.find(e => e.type === 'frog' && e.id === `frog-${wobble.stone}` && e.at >= wobble.at && e.at < wobble.at + 1.5);
    if (!into?.into) continue;
    const splash = soundsOf(run, 'frogSplash').find(e => e.at > rock.at && e.at < wobble.at + 1.5);
    assert.ok(splash, `its frog splashes in after it (${wobble.at.toFixed(1)} s)`);
    assert.ok(Math.abs(splash.at - into.at) < 0.05, 'as it lands in the water');
    splashes++;
  }
  assert.ok(splashes >= 1, `${splashes} frogs went in`);
  for (const ran of [await untouched(), run]) {
    const hops = logOf(ran, 'stones', 'hop');
    const hooves = soundsOf(ran, 'hoofStone');
    assert.equal(hooves.length, hops.length, `a hoof on stone for each of ${hops.length} hops`);
    hops.forEach((hop, k) => {
      const next = hops[k + 1]?.at ?? Infinity;
      assert.ok(hooves[k].at > hop.at && hooves[k].at < next, `hop ${k + 1}: his hooves come down on its stone`);
    });
  }
});

test('the prints squelch, Mosi roars a little, her steps thump, and the cloud has its wind, gone as it blows away', async () => {
  const run = await untouched();
  const c = run.world.chapterState;
  const counts = logOf(run, 'prints', 'count');
  const wet = soundsOf(run, 'wetStep');
  assert.equal(wet.length, counts.length, 'a wet step for each print');
  assert.equal(soundsOf(run, 'mosiRoar').length, logOf(run, 'call', 'call').length, 'his little roar each time he calls');
  const thumps = soundsOf(run, 'gramedlaThump');
  for (const scene of [4, 5, 6, 7]) assert.ok(thumps.some(e => e.scene === scene), `her footfall in scene ${scene}`);
  const wind = soundsOf(run, 'mountainWind');
  const [print] = run.seen.said.filter(e => e.id === 'k6_mosi_print');
  const blow = c.chapterLog.find(e => e.type === 'blow');
  assert.ok(wind[0].at < print.at && wind[0].level > 0, 'the wind as they go into the cloud');
  assert.ok(wind.some(e => e.level === 0 && Math.abs(e.at - blow.at) < 0.05), 'and gone as the cloud blows away');
});
