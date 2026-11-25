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
import { ARRIVALS, BUDGET } from '../chapters/hatid-route.js';
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
      child?.(c, frame, seen);
    },
  }).then(run => ({ ...run, watched: seen }));
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
