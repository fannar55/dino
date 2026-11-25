// Stjörnuhátíðin (remake/chapters/hatid.js) in grey, played through by children of several kinds (tests/chapter-harness.mjs): one
// who touches nothing; a busy one who taps the stars backwards and then the screen all over through the party; one whose book stands
// open for 30 s in the first dance (with the game's sound); one on an upright tablet that asks for less motion; and the party alone
// on the book's tile (chapters/veisla.js). Its parts have their own tests: the top as data (hatid-route), the three taps (hatid-stars)
// and the song's map (hatid-song).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as hatid from '../chapters/hatid.js';
import * as veisla from '../chapters/veisla.js';
import { playUnattended } from './chapter-harness.mjs';
import { createFakeContext } from './fake-audio.mjs';
import { topEnd } from '../chapters/kafli6-route.js';
import { ARRIVALS, BUDGET, FRIENDS8, LENGTH as BODY, STAGE, FLOOR } from '../chapters/hatid-route.js';
import { GUESTS, guestSeat } from '../chapters/hatid-guests.js';
import { SUNSET, lookAt } from '../chapters/hatid-looks.js';
import { FJALL } from '../world/fjall/ground.js';
import { BEAT, END_BEAT, secondsAt, CAMERA } from '../chapters/hatid-score.js';
import { SONG } from '../chapters/hatid-song.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { LOOKS } from '../engine/looks.js';

const { chapter, party, WORDS, partyFrame, ALONE, partyTime } = hatid;
const FRAME = 1 / 30;
const LENGTH = secondsAt(END_BEAT) + SONG.song.tail; // the song's file, from its first sound to its last
const BEATS = [8, 100, 200, 300, 360]; // the party's frames compared (the rulings: 360, as 400 is past the end)
const CALLS = { up: 'h_sloedla_up', stomp: 'h_sloedla_stomp', spin: 'h_sloedla_spin', hop: 'h_sloedla_hop' };

const inFrame = (point, camera) => {
  const p = point.clone().project(camera);
  return p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
};

/**
 * The festival played by `child` (taps with the frame's pointer), with what the run sees on the way: the first frame, every aimed
 * target out of frame while its task waits, the handheld, where everyone is as the song starts, the party's frames at BEATS, and
 * the song and the beat each frame while the game is held.
 */
function playIt(module, { aspect = 1.6, reduced = false, child = null, pauses = [], limit = 700, audio = null, savedWith = null } = {}) {
  const seen = { first: null, out: [], aimChecks: 0, handheld: 0, atSong: null, frames: {}, held: [], after: null, saved: null };
  return playUnattended(module, {
    seeking: false, limit, shaped: true, aspect, reduced, pauses, audio,
    savedWith: save => { savedWith?.(save); seen.saved = JSON.stringify(save.get()); },
    onFrame(frame) {
      const { world, director, t } = frame;
      const c = world.chapterState;
      if (!c) return;
      world.camera.updateMatrixWorld();
      if (!seen.first && c.s.time > 0) seen.first = firstFrame(world, c, frame);
      seen.handheld = Math.max(seen.handheld, director.handheldLevel ?? 0);
      const w = c.waiting;
      if (w && c.s.time - w.since >= 1) {
        for (const name of w.names) {
          const spec = c.aims[name];
          if (!spec) continue;
          seen.aimChecks++;
          if (!inFrame(world.resolvePoint(spec, new THREE.Vector3()), world.camera)) seen.out.push(`${name} (${w.task}) at ${c.s.time.toFixed(1)} s`);
        }
      }
      if (c.partyStart != null && !seen.atSong) {
        seen.atSong = Object.fromEntries([...world.actors].map(([name, a]) => [name, { shown: a.root.visible, at: a.root.position.clone() }]));
      }
      if (c.partyStart != null && c.partyBeat != null) {
        for (const beat of BEATS) if (!seen.frames[beat] && c.partyBeat >= beat) seen.frames[beat] = partyFrame(c);
      }
      for (const pause of pauses) {
        if (t >= pause.at + 1 && t < pause.at + pause.seconds - 1) {
          seen.held.push({ beat: c.partyBeat, position: c.song.position, paused: world.sound?.elements.at(-1)?.paused ?? null });
        }
        if (!seen.after && t >= pause.at + pause.seconds + 3) {
          seen.after = { beat: c.partyBeat, position: c.song.position, paused: world.sound?.elements.at(-1)?.paused ?? null, current: world.sound?.elements.at(-1)?.currentTime ?? null };
        }
      }
      watchArrival(world, c, frame, seen);
      child?.(c, frame, seen);
    },
  }).then(run => ({ ...run, watched: seen }));
}

// Scene 1 as the child sees it, frame by frame: how near the lens each friend's body comes and how much of the frame she hides, the
// big friends each arrival shot holds, what jumps (a step that differs from the frame before's by more than JUMP, or a turn of more
// than JUMP's degrees), when each of the five is first on the top, Þórseðla's head over the sea and her feet, Slóeðla in the frame,
// the guests, Egill on his seat while everyone waves, and the sun's drop with the light.
const NEAR = 4; // m: no friend's body (her joints) nearer the lens (the chunk's ruling 1)
const JUMP = { metres: 0.15, degrees: 8 };
const FIVE = ARRIVALS.map(a => a.friend);
const BIG = FRIENDS8.filter(who => who !== 'egill');
const FEET = { thorsedla: ['BackFootL', 'BackFootR', 'FrontFootL', 'FrontFootR'] };
const jointsOf = new WeakMap();
const turnOf = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
function watchArrival(world, c, { sunFace }, seen) {
  if (c.scene !== 'arrival' || !c.top) return;
  const a = (seen.arrival ??= { frames: 0, near: [], halves: [], big: {}, jumps: [], last: new Map(), onTop: {}, thorsedla: { headOver: null, feet: null, highest: 0 }, sloedlaSeen: null, seat: 0, drops: [] });
  a.frames++;
  const camera = world.camera;
  camera.updateMatrixWorld();
  const time = c.s.time;
  const shot = c.shotLabel;
  const v = new THREE.Vector3();
  const sea = FJALL.top.sea;
  const on = (x, z) => Math.hypot(x, z) <= c.top.radius;
  let bigs = 0;
  for (const who of FRIENDS8) {
    const actor = world.actors.get(who);
    if (!actor.root.visible) { a.last.delete(who); continue; }
    actor.root.updateMatrixWorld(true);
    if (!jointsOf.has(actor)) { const bones = []; actor.model.traverse(o => { if (o.isBone) bones.push(o); }); jointsOf.set(actor, bones); }
    let nearest = Infinity;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const top = new THREE.Vector3(0, -Infinity, 0); // her highest joint
    for (const bone of jointsOf.get(actor)) {
      bone.getWorldPosition(v);
      if (v.y > top.y) top.copy(v);
      nearest = Math.min(nearest, v.distanceTo(camera.position));
      const p = v.project(camera);
      if (p.z >= 1 || p.z <= -1) continue;
      box[0] = Math.min(box[0], Math.max(-1, p.x)); box[1] = Math.min(box[1], Math.max(-1, p.y));
      box[2] = Math.max(box[2], Math.min(1, p.x)); box[3] = Math.max(box[3], Math.min(1, p.y));
    }
    const hides = box[2] > box[0] && box[3] > box[1] ? ((box[2] - box[0]) * (box[3] - box[1])) / 4 : 0;
    if (nearest < NEAR) a.near.push(`${who} ${nearest.toFixed(2)} m from the lens in ${shot} at ${time.toFixed(1)} s`);
    if (hides > 0.5) a.halves.push(`${who} hides ${(hides * 100).toFixed(0)} % of ${shot} at ${time.toFixed(1)} s`);
    const head = actor.headPosition(new THREE.Vector3());
    const h = head.clone().project(camera);
    const inFrame = h.z < 1 && Math.abs(h.x) <= 1 && Math.abs(h.y) <= 1;
    if (BIG.includes(who) && inFrame) bigs++;
    // her sign seen in her own shot: her head in the frame (not at its very edge), over the cloud, and the top's ground nowhere over
    // the line from the lens to it (its shoulder hid all of them in the first stills). Kambeðla's sign is her lit plates, which stand
    // some 1.5 m over her back's highest joint: hers is that joint, up to 1.5 m under the cloud's top.
    const sign = who === 'kambedla' ? top : head;
    const s = who === 'kambedla' ? top.clone().project(camera) : h;
    if (shot === `arrive_${who}` && s.z < 1 && Math.abs(s.x) <= 0.92 && Math.abs(s.y) <= 0.85 && sign.y > sea + (who === 'kambedla' ? -1.5 : 0.3)) {
      let clear = true;
      for (let i = 1; i < 40 && clear; i++) {
        v.lerpVectors(camera.position, sign, i / 40);
        if (v.y < c.top.heightAt(v.x, v.z)) clear = false;
      }
      if (clear) (a.signSeen ??= {})[who] = (a.signSeen[who] ?? 0) + 1;
    }
    // what jumps (her heading from her root's forward way: a banked flier's Euler angles flip)
    const at = actor.root.position.clone();
    const ahead = new THREE.Vector3(1, 0, 0).applyQuaternion(actor.root.quaternion);
    const heading = THREE.MathUtils.radToDeg(Math.atan2(ahead.z, ahead.x));
    const was = a.last.get(who);
    if (was) {
      const step = at.clone().sub(was.at);
      if (was.step && step.distanceTo(was.step) > JUMP.metres) a.jumps.push(`${who} jumps ${step.distanceTo(was.step).toFixed(2)} m at ${time.toFixed(2)} s (${shot})`);
      if (turnOf(heading, was.heading) > JUMP.degrees) a.jumps.push(`${who} turns ${turnOf(heading, was.heading).toFixed(1)} degrees in a frame at ${time.toFixed(2)} s`);
      a.last.set(who, { at, step, heading });
    } else a.last.set(who, { at, step: null, heading });
    // first on the top: her root on the flat, on its ground, not sunk
    if (FIVE.includes(who) && a.onTop[who] == null && on(at.x, at.z) && at.y >= c.top.heightAt(at.x, at.z) - 0.3 && actor.model.position.y > -0.05) a.onTop[who] = time;
    if (who === 'thorsedla') {
      const t = a.thorsedla;
      const feetOn = FEET.thorsedla.some(name => { const foot = actor.model.getObjectByName(name).getWorldPosition(v); return on(foot.x, foot.z) && foot.y >= c.top.heightAt(foot.x, foot.z) - 0.5; });
      if (feetOn && t.feet == null) t.feet = time;
      if (t.feet == null) {
        if (head.y > sea + 0.5 && t.headOver == null) t.headOver = time;
        t.highest = Math.max(t.highest, head.y - sea);
      }
    }
    if (who === 'sloedla' && a.sloedlaSeen == null && inFrame && head.y > sea + 0.3) a.sloedlaSeen = time;
  }
  if (/^arrive_/.test(shot ?? '')) a.big[shot] = Math.max(a.big[shot] ?? 0, bigs);
  for (const g of c.guests?.where?.() ?? []) {
    const key = `${g.group} ${g.k}`;
    const was = a.last.get(key);
    if (!g.shown) { a.last.delete(key); continue; }
    if (was) {
      const step = g.at.clone().sub(was.at);
      if (was.step && step.distanceTo(was.step) > JUMP.metres) a.jumps.push(`the ${key} jumps ${step.distanceTo(was.step).toFixed(2)} m at ${time.toFixed(2)} s`);
      a.last.set(key, { at: g.at.clone(), step });
    } else a.last.set(key, { at: g.at.clone(), step: null });
  }
  if (c.waving) a.seat = Math.max(a.seat, world.actors.get('egill').root.position.distanceTo(c.seat.update()));
  a.drops.push({ at: time, drop: sunFace.dropDeg, look: world.lightLook });
}

function firstFrame(world, c, { sunFace }) {
  const her = world.actors.get('gramedla'), mosi = world.actors.get('mosi'), egill = world.actors.get('egill');
  return {
    end: topEnd(world.forest), her: { at: her.root.position.clone(), heading: her.heading }, mosi: { at: mosi.root.position.clone(), heading: mosi.heading },
    egill: egill.root.position.distanceTo(c.seat.update()), look: world.lightLook, cap: sunFace.capOn, location: world.location,
  };
}

// The busy child: the stars backwards (the book's last friend first) a second after each is wanted, and from the party's start the
// screen all over every 0.7 s (no target there, and the names of the taps before, which are no longer targets).
const BACKWARDS = FRIENDS.map(f => f.key).reverse();
function busyChild(c, frame, seen) {
  const w = c.waiting;
  if (w?.task === 'stars' && c.s.time - w.since >= 1 && c.s.time - (seen.lastStar ?? -Infinity) >= 1) {
    const next = BACKWARDS.find(friend => !c.starTask.state().lit.includes(friend));
    if (next) {
      seen.lastStar = c.s.time;
      frame.pointer.tap(`star-${next}`, { x: 640, y: 200 });
    }
  }
  if (c.partyStart == null) return;
  if (c.s.time - (seen.lastTap ?? -Infinity) < 0.7) return;
  seen.lastTap = c.s.time;
  seen.partyTaps = (seen.partyTaps ?? 0) + 1;
  const k = seen.partyTaps;
  frame.pointer.tap([null, 'sun', 'gramedla', 'star-kambedla'][k % 4], { x: (k * 211) % 1280, y: (k * 97) % 800 });
}

const once = new Map();
const play = (name, make) => {
  if (!once.has(name)) once.set(name, make());
  return once.get(name);
};
const untouched = () => play('untouched', () => playIt(hatid));
const busy = () => play('busy', () => playIt(hatid, { child: busyChild }));
const upright = () => play('upright calm', () => playIt(hatid, { aspect: 0.625, reduced: true }));
const paused = async () => {
  const base = await untouched();
  const start = base.world.chapterState.partyStart; // the run's seconds are the scene's when nothing stood still before
  return play('paused', () => playIt(hatid, { audio: createFakeContext({ state: 'running' }), pauses: [{ at: start + secondsAt(80), seconds: 30 }] }));
};
const EARNED = ['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla', 'k5_sloedla', 'k6_gramedla'];
const tile = () => play('tile', () => playIt({ ...veisla }, {
  limit: ALONE.fadeIn + ALONE.toot + LENGTH + 4, audio: createFakeContext({ state: 'running' }),
  savedWith: save => EARNED.forEach(id => save.addStar(id)),
}));

const logOf = (run, type) => run.world.chapterState.chapterLog.filter(e => e.type === type);
const tasks = (run, task, type) => run.world.chapterState.taskLog.filter(e => e.task === task && (!type || e.type === type));
const ended = (run, what) => {
  const { task, stage, world } = run;
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.equal(task.done, true, `${what}: still going at ${stage.s.time.toFixed(1)} s`);
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), ['arrival', 'stars', 'party', 'seventh', 'end'], what);
};
/** The party's log relative to its start: what, and on which beat it fell (seconds from its start, as beats of the map). */
const partyLog = run => {
  const c = run.world.chapterState;
  return c.partyLog.map(e => ({ what: [e.type, e.shot ?? e.id ?? e.kind ?? e.move ?? ''].join(' '), beat: e.beat, off: e.at - c.partyStart }));
};
function sameLog(mine, theirs, what) {
  assert.ok(theirs.length > 200, `${what}: ${theirs.length} things in the party`);
  assert.deepEqual(mine.map(e => `${e.what} ${e.beat}`), theirs.map(e => `${e.what} ${e.beat}`), what);
  const late = mine.filter((e, k) => Math.abs(e.off - theirs[k].off) > FRAME + 1e-6);
  assert.deepEqual(late.slice(0, 5), [], `${what}: each in the same frame`);
}
const angle = (a, b) => THREE.MathUtils.radToDeg(new THREE.Quaternion(...a).angleTo(new THREE.Quaternion(...b)));
function sameFrames(a, b, what) {
  for (const beat of BEATS) {
    const [x, y] = [a[beat], b[beat]];
    assert.ok(x && y, `${what}: a frame at beat ${beat}`);
    for (const who of Object.keys(y.actors)) {
      const [p, q] = [x.actors[who], y.actors[who]];
      assert.ok(Math.hypot(...p.at.map((v, i) => v - q.at[i])) < 0.01, `${what} beat ${beat}: ${who} at ${p.at} not ${q.at}`);
      assert.ok(Math.abs(p.heading - q.heading) < 0.5, `${what} beat ${beat}: ${who} faces ${p.heading}`);
      for (const bone of ['Head', 'Neck', 'Tail1']) {
        if (!q.bones[bone]) continue;
        assert.ok(angle(p.bones[bone], q.bones[bone]) < 1, `${what} beat ${beat}: ${who}'s ${bone} ${angle(p.bones[bone], q.bones[bone]).toFixed(2)} degrees off`);
      }
    }
    for (const key of ['position', 'target']) assert.ok(Math.hypot(...x.camera[key].map((v, i) => v - y.camera[key][i])) < 0.01, `${what} beat ${beat}: the camera's ${key}`);
    assert.deepEqual(x.stage, y.stage, `${what} beat ${beat}: the stage`);
  }
}

// -----------------------------------------------------------------------------------------------

test('nobody touching: from the arrival to Egill lifting takes under 10½ minutes, and the festival plays to its end', async () => {
  const run = await untouched();
  ended(run, 'untouched');
  const [lifted] = logOf(run, 'lifted');
  assert.ok(lifted, 'Egill lifts');
  assert.ok(lifted.at < 630, `lifted at ${lifted.at.toFixed(1)} s`);
  assert.deepEqual(run.director.warnings, [], 'the director');
  assert.equal(run.book.opened.at(-1)?.[0], 'dinosaurs', 'it ends in the book, on its dinosaurs');
  assert.deepEqual(run.save.get().stars, [], 'and gives no star');
});

test('nobody touching: the sun waves, she roars and all six stars light, each on its help; all eight are on the top when the song starts', async () => {
  const run = await untouched();
  for (const task of ['sun', 'roar']) {
    const [go] = tasks(run, task, 'go');
    assert.equal(go?.by, 'help', `${task}: by the help`);
    const [want] = tasks(run, task, 'want');
    assert.ok(Math.abs(go.at - want.at - 12) < 0.1, `${task}: 12 s after it was wanted`);
    assert.equal(tasks(run, task, 'help').length, 1, `${task}: one hint`);
  }
  const lights = tasks(run, 'stars', 'light');
  assert.deepEqual(lights.map(e => e.friend), FRIENDS.map(f => f.key), 'the six, in the book\'s order');
  assert.ok(lights.every(e => e.by === 'help'));
  assert.equal(tasks(run, 'stars', 'all').length, 1);
  assert.equal(logOf(run, 'wave').length, 1, 'the sun waved');
  assert.equal(logOf(run, 'roared').length, 1, 'she roared');
  const at = run.watched.atSong;
  assert.deepEqual(Object.keys(at).sort(), ['egill', 'flugedla', 'gramedla', 'kambedla', 'mosi', 'sloedla', 'thorsedla', 'uggedla']);
  for (const [who, { shown, at: p }] of Object.entries(at)) {
    assert.ok(shown, `${who} shows`);
    assert.ok(Math.hypot(p.x, p.z) < 45, `${who} on the top (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  }
});

test('the first frame is chapter 6\'s last: Grameðla and Mosi within 0.1 m and 2 degrees of topEnd, Egill on her head, LOOKS.sunset, the sun in its cap', async () => {
  const { first } = (await untouched()).watched;
  assert.equal(first.location, 'toppur');
  for (const who of ['her', 'mosi']) {
    const end = first.end[who];
    assert.ok(Math.hypot(first[who].at.x - end.at[0], first[who].at.z - end.at[1]) < 0.1, `${who} at topEnd`);
    assert.ok(Math.abs(((first[who].heading - end.heading + 540) % 360) - 180) < 2, `${who} faces topEnd's way`);
  }
  assert.ok(first.egill < 0.05, `Egill ${first.egill.toFixed(3)} m from the seat on her head`);
  assert.equal(first.look, LOOKS.sunset);
  assert.equal(first.cap, 1);
});

test('the five come in the spec\'s order, 15 s apart, each with her line', async () => {
  const run = await untouched();
  const comes = logOf(run, 'arrive');
  assert.deepEqual(comes.map(e => e.friend), ARRIVALS.map(a => a.friend));
  for (let k = 1; k < comes.length; k++) assert.ok(Math.abs(comes[k].at - comes[k - 1].at - 15) < 0.1, `${comes[k].friend} ${(comes[k].at - comes[k - 1].at).toFixed(2)} s after`);
  comes.forEach(({ friend, at }) => {
    const { line } = ARRIVALS.find(a => a.friend === friend);
    const said = run.seen.said.find(e => e.id === line);
    assert.ok(said && said.at > at && said.at < at + 15, `${friend} says ${line} in her 15 s`);
  });
});

test('each friend is known before she is seen: the plates\' glow, the sail, the head, the horn and the speck come 2 s or more before her body is on the top', async () => {
  const run = await untouched();
  const { onTop } = run.watched.arrival;
  const signs = logOf(run, 'sign');
  assert.deepEqual(signs.map(e => [e.friend, e.sign]), [['flugedla', 'speck'], ['kambedla', 'glow'], ['uggedla', 'sail'], ['thorsedla', 'head'], ['sloedla', 'horn']]);
  for (const { friend, at } of signs) {
    assert.ok(onTop[friend] != null, `${friend} comes onto the top`);
    assert.ok(onTop[friend] - at >= 2, `${friend}: her sign at ${at.toFixed(1)} s, she on the top at ${onTop[friend].toFixed(1)} s`);
  }
});

test('Þórseðla\'s head is over the sea before any of her feet are on the top; Slóeðla\'s note sounds before she is in frame', async () => {
  const run = await untouched();
  const { thorsedla, sloedlaSeen } = run.watched.arrival;
  assert.ok(thorsedla.headOver != null && thorsedla.feet != null && thorsedla.headOver < thorsedla.feet, `her head over the sea at ${thorsedla.headOver}, her feet on the top at ${thorsedla.feet}`);
  assert.ok(thorsedla.highest >= 8.5, `her head ${thorsedla.highest.toFixed(1)} m over the sea before she sets foot on the top`);
  const [horn] = logOf(run, 'sound').filter(e => e.name === 'sloedlaHorn' && e.scene === 'arrival');
  assert.ok(horn, 'her horn in the arrival');
  assert.ok(sloedlaSeen != null && horn.at < sloedlaSeen, `her note at ${horn?.at.toFixed(1)} s, she in frame at ${sloedlaSeen?.toFixed(1)} s`);
});

test('the guests come with their friends: the flyers with Flugeðla, frogs, turtles and lizards with Uggeðla, the grazers with Slóeðla; none stands in a friend\'s stand or on the floor', async () => {
  const run = await untouched();
  assert.deepEqual(GUESTS, { flyers: 6, frogs: 5, turtles: 3, lizards: 6, grazers: 3 });
  assert.equal(Object.values(GUESTS).reduce((a, b) => a + b, 0), BUDGET.guests);
  const comes = Object.fromEntries(logOf(run, 'arrive').map(e => [e.friend, e.at]));
  const WITH = { flyers: 'flugedla', frogs: 'uggedla', turtles: 'uggedla', lizards: 'uggedla', grazers: 'sloedla' };
  const [want] = tasks(run, 'sun', 'want');
  for (const [group, friend] of Object.entries(WITH)) {
    const coming = logOf(run, 'guests').filter(e => e.group === group && e.phase === 'coming');
    const there = logOf(run, 'guests').filter(e => e.group === group && e.phase === 'there');
    assert.equal(coming.length, 1, `the ${group} come once`);
    assert.ok(coming[0].at >= comes[friend] && coming[0].at < comes[friend] + 15, `the ${group} come in ${friend}'s 15 s`);
    assert.ok(there[0]?.at <= want.at, `the ${group} are in their seats by the sun's tap`);
  }
  const { stands, top } = run.world.chapterState;
  for (const [group, n] of Object.entries(GUESTS)) {
    for (let k = 0; k < n; k++) {
      const { at } = guestSeat(group, k);
      const out = Math.hypot(...at);
      assert.ok(out > FLOOR.radius && out <= top.radius, `the ${group} ${k} on the rim, off the floor (${out.toFixed(1)} m out)`);
      assert.ok(Math.hypot(at[0] - STAGE.centre[0], at[1] - STAGE.centre[1]) >= STAGE.radius + 1, `the ${group} ${k} off the stage`);
      for (const [scene, s] of Object.entries(stands)) {
        if (scene === 'start') continue;
        for (const [who, stand] of Object.entries(s)) {
          if (stand.on) continue;
          const d = Math.hypot(at[0] - stand.at[0], at[1] - stand.at[1]);
          assert.ok(d >= BODY[who] / 2 + 0.5, `the ${group} ${k} in ${who}'s ${scene} stand (${d.toFixed(1)} m)`);
        }
      }
    }
  }
});

test('the sun waves with both hands when tapped, and everyone on the top waves with it', async () => {
  const run = await untouched();
  const [go] = tasks(run, 'sun', 'go');
  const waves = logOf(run, 'wave');
  assert.equal(waves.length, 1);
  assert.equal(waves[0].both, true, 'both hands');
  assert.ok(Math.abs(waves[0].at - go.at) < 0.1, 'as it is tapped');
  const with_ = logOf(run, 'waveWith');
  assert.deepEqual(with_.map(e => e.who).sort(), [...FRIENDS8].sort(), 'all eight');
  for (const e of with_) assert.ok(e.at - waves[0].at >= -1e-6 && e.at - waves[0].at < 0.5, `${e.who} waves with it`);
  assert.equal(with_.find(e => e.who === 'egill').how, 'wave', 'Egill with his own wave');
  assert.ok(run.watched.arrival.seat < 0.05, `Egill keeps his seat on her head (${run.watched.arrival.seat.toFixed(3)} m off it)`);
});

test('the sun goes under in SUNSET.seconds and the light is dark when it has; the music is at 0 from then to the song', async () => {
  const run = await untouched();
  const { drops } = run.watched.arrival;
  const from = drops.find(d => d.drop > 0);
  const under = drops.find(d => d.drop >= SUNSET.under - 1e-6);
  assert.ok(from && under, 'it sinks all the way');
  assert.ok(Math.abs(under.at - from.at - SUNSET.seconds) <= 2 * FRAME, `under in ${(under.at - from.at).toFixed(2)} s`);
  const dark = lookAt(3);
  for (const [part, key] of [['sun', 'color'], ['sky', 'zenith'], ['sky', 'horizon'], ['fog', 'color']]) assert.equal(under.look[part][key], dark[part][key], `the light's ${part}.${key} is the dark's`);
  assert.equal(under.look.hemi.intensity, dark.hemi.intensity);
  const music = logOf(run, 'music');
  const quiet = music.findIndex(e => e.level === 0);
  assert.ok(quiet >= 0, 'the music goes');
  assert.ok(Math.abs(music[quiet].at - from.at) <= FRAME + 1e-6 && Math.abs(music[quiet].seconds - SUNSET.seconds) < 1e-9, 'to 0 over the sinking');
  assert.deepEqual(music.slice(quiet + 1).map(e => e.level), [], 'and nothing more till the song');
  const [song] = logOf(run, 'party');
  assert.ok(song.at > under.at);
  // the wind alone after it: 4 s and more of nothing but the wind before scene 2
  const stars = run.world.chapterTimeline.find(m => m.scene === 'stars');
  assert.ok(stars.at - under.at >= 4 - FRAME, `${(stars.at - under.at).toFixed(1)} s of wind alone`);
  assert.ok(!run.seen.said.some(e => e.at > under.at + 0.5 && e.at < stars.at), 'no line in it');
});

test('nothing of anyone jumps more than 8 degrees or 0.15 m in a frame through the arrival', async () => {
  const run = await untouched();
  assert.ok(run.watched.arrival.frames > 3000, `${run.watched.arrival.frames} frames`);
  assert.deepEqual(run.watched.arrival.jumps.slice(0, 8), []);
});

test('no arrival shot holds more than three big friends', async () => {
  for (const run of [await untouched(), await upright()]) {
    const { big } = run.watched.arrival;
    assert.deepEqual(Object.keys(big).sort(), ARRIVALS.map(a => `arrive_${a.friend}`).sort());
    for (const [shot, n] of Object.entries(big)) assert.ok(n <= 3, `${shot} holds ${n}`);
  }
});

test('nobody walks through the lens: in every frame of the arrival no friend\'s body is within 4 m of the camera and none hides more than half the frame', async () => {
  for (const [what, run] of [['wide', await untouched()], ['upright', await upright()]]) {
    assert.deepEqual(run.watched.arrival.near.slice(0, 6), [], what);
    assert.deepEqual(run.watched.arrival.halves.slice(0, 6), [], what);
    // and each of the five is seen in her own shot (her head in its frame, over the cloud, nothing of the top before it) 2 s or more
    for (const who of FIVE) assert.ok((run.watched.arrival.signSeen?.[who] ?? 0) >= 60, `${who} seen ${run.watched.arrival.signSeen?.[who] ?? 0} frames in arrive_${who} (${what})`);
  }
});

test('a child who taps the stars backwards hears the six tones rise all the same, and each star takes its own friend\'s colour', async () => {
  const run = await busy();
  ended(run, 'busy');
  const lights = tasks(run, 'stars', 'light');
  assert.deepEqual(lights.map(e => e.friend), BACKWARDS, 'lit as tapped');
  assert.ok(lights.every(e => e.by === 'child'));
  const tones = logOf(run, 'tone');
  assert.deepEqual(tones.map(e => e.n), [0, 1, 2, 3, 4, 5]);
  for (let k = 1; k < tones.length; k++) {
    assert.ok(tones[k].rate > tones[k - 1].rate, 'each tone higher');
    assert.ok(tones[k].at >= tones[k - 1].at + 0.25 - 1e-6, 'and after the one before');
  }
  const stars = run.world.chapterState.stars;
  for (const { key, colour } of FRIENDS) assert.equal(`#${stars[key].sprite.material.color.getHexString()}`, colour, `${key}'s star in her colour`);
});

test('taps in the party change nothing: a child tapping all over the screen every 0.7 s gets the partyLog and the poses of the untouched play', async () => {
  const [run, base] = [await busy(), await untouched()];
  assert.ok(run.watched.partyTaps > 300, `${run.watched.partyTaps} taps in the party`);
  sameLog(partyLog(run), partyLog(base), 'the busy child\'s party');
  sameFrames(run.watched.frames, base.watched.frames, 'the busy child\'s party');
});

test('the party is the song\'s clock: every cut, call and section of partyLog is on its beat of the map, within a frame', async () => {
  const run = await untouched();
  const c = run.world.chapterState;
  const log = c.partyLog;
  for (const e of log) assert.ok(Math.abs(e.at - c.partyStart - secondsAt(e.beat)) <= FRAME + 1e-6, `${e.type} ${e.beat} at ${(e.at - c.partyStart).toFixed(3)} s`);
  assert.deepEqual(log.filter(e => e.type === 'cut').map(e => [e.beat, e.shot]), CAMERA.map(e => [e.beat, e.cut]), 'every cut of CAMERA');
  assert.deepEqual(log.filter(e => e.type === 'call').map(e => [e.beat, e.move]), SONG.song.calls.map(e => [e.beat, e.move]), 'every call');
  assert.deepEqual(log.filter(e => e.type === 'section').map(e => [e.beat, e.id]), SONG.song.sections.map(e => [e.startBeat, e.id]), 'every section');
  assert.equal(log.filter(e => e.type === 'cue').length, SONG.song.cues.length, 'every cue');
  for (const call of SONG.song.calls) {
    const said = run.seen.said.find(e => e.id === CALLS[call.move] && Math.abs(e.at - c.partyStart - secondsAt(call.beat)) <= FRAME + 1e-6);
    assert.ok(said, `Slóeðla calls ${call.move} on beat ${call.beat}`);
  }
  const [over] = logOf(run, 'partyEnd');
  assert.ok(Math.abs(over.at - c.partyStart - LENGTH) <= FRAME + 1e-6, `the party ends ${(over.at - c.partyStart).toFixed(2)} s in, the song ${LENGTH.toFixed(2)}`);
  assert.equal(logOf(run, 'partyAim').length, 0, 'nothing aimed in the party');
});

test('the book open for 30 s in the first dance: the song\'s position and the beat stop together and go on together', async () => {
  const [run, base] = [await paused(), await untouched()];
  ended(run, 'paused');
  const { held, after } = run.watched;
  assert.ok(held.length > 800, `${held.length} frames held`);
  assert.ok(held.every(f => f.beat === held[0].beat && f.position === held[0].position), 'the beat and the song stand still');
  assert.ok(held[0].beat > 72 && held[0].beat < 136, `in the first dance (beat ${held[0].beat.toFixed(1)})`);
  assert.ok(held.every(f => f.paused === true), 'the song is silent');
  assert.equal(after.paused, false, 'and plays on');
  assert.ok(Math.abs(secondsAt(after.beat) - after.position) < 1e-6, `the beat ${after.beat.toFixed(2)} where the song is ${after.position.toFixed(2)} s in`);
  assert.ok(Math.abs(after.current - after.position) < 0.15, `the record ${after.current.toFixed(2)} s in`);
  sameLog(partyLog(run), partyLog(base), 'the party through the pause');
});

test('the party on the tile is the party in the chapter: the same partyFrame at the same beats, and the same partyLog', async () => {
  const [run, base] = [await tile(), await untouched()];
  assert.equal(run.task.failed, false, String(run.task.error?.stack ?? run.task.error));
  sameLog(partyLog(run), partyLog(base), 'the tile\'s party');
  sameFrames(run.watched.frames, base.watched.frames, 'the tile\'s party');
});

test('the tile plays from the moon\'s Tút to the last chord, says only the four calls, gives no star and leaves the save as it was', async () => {
  const run = await tile();
  const c = run.world.chapterState;
  const horns = run.soundLog.filter(e => e.name === 'horn');
  const began = run.world.chapterTimeline[0].at;
  assert.equal(horns.length, 1, 'the moon\'s Tút once');
  assert.ok(Math.abs(horns[0].at - began) < FRAME + 1e-6, 'as the black lifts');
  assert.ok(Math.abs(c.partyStart - horns[0].at - ALONE.toot) < FRAME + 1e-6, 'and the song after it');
  const card = run.doc.body.children.find(element => element.classList.contains('dans-end'));
  assert.ok(card, 'the end card');
  const [over] = logOf(run, 'partyEnd');
  assert.ok(Math.abs(over.at - c.partyStart - LENGTH) <= FRAME + 1e-6, 'it ends on the last chord\'s tail');
  assert.deepEqual([...run.seen.spoken].sort(), Object.values(CALLS).sort(), 'only the four calls');
  assert.deepEqual(Object.keys(party.lines).sort(), Object.values(CALLS).sort());
  assert.equal(JSON.stringify(run.save.get()), run.watched.saved, 'the save untouched');
  assert.deepEqual(run.book.opened, [], 'no book');
  assert.equal(run.sounds.includes('star'), false, 'no star tone');
  assert.equal(party.next, null);
  assert.equal(party.startsItself, true);
  assert.ok(Math.abs(partyTime(100) - (c.partyStart - began + secondsAt(100))) < FRAME + 1e-6, 'partyTime is the tile\'s second of a beat');
});

test('reduced motion: no handheld, and the festival plays to its end', async () => {
  const run = await upright();
  ended(run, 'reduced');
  assert.equal(run.watched.handheld, 0, 'no handheld');
  assert.equal(run.world.chapterState.reduced, true);
  assert.ok(logOf(run, 'roared').every(e => e.handheld === false), 'her roar without the shake');
});

test('upright (aspect 0.625): every aimed target is on the screen whenever its task waits', async () => {
  const run = await upright();
  ended(run, 'upright');
  assert.ok(run.watched.aimChecks > 500, `${run.watched.aimChecks} checks`);
  assert.deepEqual(run.watched.out.slice(0, 12), []);
});

test('every line of WORDS is said in the untouched play but h_mosi_wave, which the help says', async () => {
  const run = await untouched();
  const missing = Object.keys(WORDS).filter(id => !run.seen.spoken.has(id));
  assert.deepEqual(missing, []);
  const [hint] = tasks(run, 'sun', 'help');
  const wave = run.seen.said.find(e => e.id === 'h_mosi_wave');
  assert.ok(Math.abs(wave.at - hint.at) < 0.5, 'Mosi asks again on the sun\'s hint');
  assert.equal(run.seen.said.filter(e => e.id === 'h_mosi_wave').length, 1);
  for (const [id, text] of Object.entries(WORDS)) assert.equal(chapter.lines[id].text, text);
});

test('no wide shot of CAMERA lasts longer than BUDGET.wideBars', () => {
  // a wide shot holds everyone, and costs the most: it is cut away from within BUDGET.wideBars bars (4 beats a bar)
  assert.deepEqual(BUDGET.wide, ['party_wide', 'party_high', 'final_pose']);
  const wide = CAMERA.map((shot, i) => ({ ...shot, until: CAMERA[i + 1]?.beat ?? END_BEAT })).filter(shot => BUDGET.wide.includes(shot.cut));
  assert.ok(wide.some(shot => shot.cut === BUDGET.shot), `the measured shot ${BUDGET.shot} is cut to`);
  for (const shot of wide) assert.ok(shot.until - shot.beat <= BUDGET.wideBars * 4, `${shot.cut} at beat ${shot.beat} holds ${(shot.until - shot.beat) / 4} bars`);
  // the measured frame: one bar into the dance, where CAMERA holds the measured shot (the rulings: beat 76)
  const held = CAMERA.filter(shot => shot.beat <= BUDGET.beat).at(-1);
  assert.equal(held.cut, BUDGET.shot);
  assert.equal(BUDGET.beat, SONG.song.sections.find(s => s.id === 'dance').startBeat + 4);
});
