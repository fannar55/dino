// Chapter 5 (remake/chapters/kafli5.js), "Boð til Slóeðlu", played through by children of several kinds (tests/chapter-harness.mjs):
// one who touches nothing, one who taps the lit animal at once, one who always taps the wrong one, one who waits for Mosi to name
// it, and one who taps along in the whole song. Its parts have their own tests (kafli5-pool, kafli5-song, kafli5-choir and
// choir-sounds).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as kafli5 from '../chapters/kafli5.js';
import { playUnattended } from './chapter-harness.mjs';
import { createFakeContext } from './fake-audio.mjs';
import { MELODY, GROUPS, TEMPO } from '../chapters/kafli5-song.js';
import { HELP } from '../chapters/kafli5-choir.js';
import { FAR_POOL } from '../chapters/kafli4-route.js';
import { SHOTS } from '../chapters/kafli5-pool.js';
import { FRIENDS } from '../engine/sloedla/friends.js';

const { chapter, NAMES, SHOWS } = kafli5;
const BEAT = 60 / TEMPO.bpm;
const FRAME = 1 / 30; // the harness's frame
const REED = new THREE.Vector3(FAR_POOL.farReed[0], FAR_POOL.level + 2.6, FAR_POOL.farReed[1]); // over the reed, where her crest shows
const NOTES = MELODY.flat().length;
const CHOIR_FROM = new THREE.Vector3(...SHOTS.choir_wide.position); // where the choir's shot stands (it turns, it never moves)

// The subjects a shot is for (kafli5-pool.js SHOWS), where the camera should see them.
const SUBJECTS = {
  mosi: world => world.actors.get('mosi').headPosition(new THREE.Vector3()),
  egill: world => world.actors.get('egill').headPosition(new THREE.Vector3()),
  flugedla: world => world.actors.get('flugedla').headPosition(new THREE.Vector3()),
  sloedla: world => world.actors.get('sloedla').headPosition(new THREE.Vector3()),
};
const inFrame = (point, camera) => {
  const p = point.clone().project(camera);
  return p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
};

/**
 * The chapter played by `child` (a function of the chapter's state, the frame and what the run has seen, that taps with the
 * frame's pointer), with what the run sees on the way: the caption colours, every held shot's subjects out of frame, and the choir
 * shot's frames (the groups and the reed out of frame, the camera).
 */
function playIt({ seeking = true, aspect = 1.6, reduced = false, eager = false, child = null, audio = null } = {}) {
  const seen = { colours: [], out: [], choirFrames: [], wanted: null, taps: [], turtleLift: Infinity };
  return playUnattended(kafli5, {
    seeking, limit: 720, shaped: true, aspect, reduced, eager, audio,
    onFrame(frame) {
      const { world, ui, director, shot } = frame;
      if (!seen.wrapped) {
        seen.wrapped = true;
        const caption = ui.caption;
        ui.caption = (who, text, colour) => {
          if (text != null) seen.colours.push({ who, colour });
          return caption(who, text, colour);
        };
      }
      const c = world.chapterState;
      if (!c) return;
      world.camera.updateMatrixWorld();
      if (shot && SHOWS[shot] && director.mode === 'hold') {
        for (const who of SHOWS[shot]) if (!inFrame(SUBJECTS[who](world), world.camera)) seen.out.push(`${who} out of ${shot} at ${c.s.time.toFixed(1)} s`);
      }
      if ((c.scene === 4 || c.scene === 5) && world.camera.position.distanceTo(CHOIR_FROM) < 0.05 && c.points) {
        const out = GROUPS.filter(group => !inFrame(new THREE.Vector3(...c.points[group]), world.camera));
        if (!inFrame(REED, world.camera)) out.push('reed');
        seen.choirFrames.push({ t: c.s.time, out, camera: world.camera.position.clone(), turn: world.camera.quaternion.clone() });
      }
      // how high the turtles sit over the ground (their stone) while the choir sings
      if (c.scene === 4 || c.scene === 5) {
        for (const b of world.forest.life.pool.turtles) seen.turtleLift = Math.min(seen.turtleLift, b.position.y - world.heightAt(b.position.x, b.position.z));
      }
      // the note the choir wants now, and since when (scene time)
      const st = c.choir?.state();
      if (st && st.waiting && !st.done) {
        const key = `${st.phrase}-${st.index}`;
        if (seen.wanted?.key !== key) seen.wanted = { key, group: MELODY[st.phrase][st.index], since: c.s.time, tapped: 0, last: null };
      } else seen.wanted = null;
      child?.(c, frame, seen);
    },
  }).then(run => ({ ...run, watched: seen }));
}
const tapGroup = (frame, seen, group, c) => {
  frame.pointer.tap(`choir-${group}`);
  seen.taps.push({ group, at: c.s.time });
};

// The children
/** Taps the wanted animal half a second after it is wanted (the lit one; in phrases 3 and 4 the one she showed). */
function eagerChild(c, frame, seen) {
  const w = seen.wanted;
  if (w && !w.tapped && c.s.time - w.since >= 0.5) {
    w.tapped = 1;
    tapGroup(frame, seen, w.group, c);
  }
}
/** Taps a wrong animal a second after a note is wanted, and again every 3 s while it is. */
function wrongChild(c, frame, seen) {
  const w = seen.wanted;
  if (!w) return;
  const due = w.last === null ? c.s.time - w.since >= 1 : c.s.time - w.last >= 3;
  if (due) {
    w.last = c.s.time;
    tapGroup(frame, seen, GROUPS.find(g => g !== w.group), c);
  }
}
/** Waits for Mosi to name the animal, then taps it. */
function slowChild(c, frame, seen) {
  const w = seen.wanted;
  if (w && !w.tapped && c.s.time - w.since >= HELP.point + 1) {
    w.tapped = 1;
    tapGroup(frame, seen, w.group, c);
  }
}
/** Touches nothing in the choir; in the whole song taps an animal every 1.3 s, round the five. */
function alongChild(c, frame, seen) {
  if (c.scene !== 6 || !Number.isFinite(c.songStart) || c.s.time < c.songStart) return;
  seen.along ??= { last: -Infinity, k: 0 };
  if (seen.along.k < 12 && c.s.time - seen.along.last >= 1.3) {
    seen.along.last = c.s.time;
    tapGroup(frame, seen, GROUPS[seen.along.k++ % GROUPS.length], c);
  }
}

const once = new Map();
const play = (name, options) => {
  if (!once.has(name)) once.set(name, playIt(options));
  return once.get(name);
};
// in time, with the chapter's own sound playing (a fake context that throws on a non-finite value, as a browser does)
const untouched = () => play('untouched', { seeking: false, audio: createFakeContext({ state: 'running' }) });
const quick = () => play('eager', { eager: true, child: eagerChild });
const wrong = () => play('wrong', { child: wrongChild });
const slow = () => play('slow', { child: slowChild });
const along = () => play('along', { child: alongChild });
const calm = () => play('reduced', { reduced: true });
const upright = () => play('upright', { aspect: 0.625 });

const logOf = (run, type) => run.world.chapterState.choirLog.filter(entry => entry.type === type);
const sceneAt = (run, scene) => run.world.chapterTimeline.find(mark => mark.scene === scene)?.at;
const ended = (run, what) => {
  const { task, stage, world } = run;
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.equal(task.done, true, `${what}: still going at ${stage.s.time.toFixed(1)} s`);
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7, 'end'], what);
  return world.chapterTimeline.at(-1).at;
};

test('nobody touching: the chapter plays to its end in 5 to 7 minutes, the star given', async () => {
  const run = await untouched();
  const end = ended(run, 'untouched');
  assert.ok(end >= 300 && end <= 420, `the end at ${end.toFixed(1)} s (spec: about 6 minutes, never over 10)`);
  assert.deepEqual(run.save.get().stars.filter(id => id === 'k5_sloedla'), ['k5_sloedla'], 'her star, once');
  assert.deepEqual(run.director.warnings, [], 'the director');
  assert.deepEqual(run.watched.out, [], 'every held shot shows whom it is for');
  assert.ok(logOf(run, 'peek').length === 1 && !logOf(run, 'peek')[0].tapped, 'she peeks out by herself');
});

test('nobody touching: every phrase comes on the help, and Mosi names the group at each point', async () => {
  const run = await untouched();
  const counted = logOf(run, 'sing').filter(entry => entry.counted);
  assert.deepEqual(counted.map(entry => entry.group), MELODY.flat(), 'her song, note by note');
  assert.ok(counted.every(entry => entry.auto), 'every note sang by itself');
  assert.deepEqual(logOf(run, 'phrase').map(entry => entry.phrase), [0, 1, 2, 3]);
  const points = logOf(run, 'help').filter(entry => entry.level === 'point');
  assert.ok(points.length >= MELODY.length, `Mosi points at least once a phrase (${points.length})`);
  const said = run.seen.said;
  for (const point of points) {
    assert.ok(said.some(line => line.id === NAMES[point.group] && Math.abs(line.at - point.at) < 0.25), `Mosi names ${point.group} at ${point.at.toFixed(1)} s`);
  }
});

test('a child who taps everything at once (eager) finishes the choir in under 90 s and no help is heard', async () => {
  const run = await quick();
  ended(run, 'eager');
  const [done] = logOf(run, 'done');
  const took = done.at - sceneAt(run, 4);
  assert.ok(took < 90, `the choir took ${took.toFixed(1)} s`);
  assert.deepEqual(logOf(run, 'help'), [], 'no help came');
  assert.deepEqual(run.seen.said.filter(line => Object.values(NAMES).includes(line.id)), [], 'Mosi names nothing');
  const counted = logOf(run, 'sing').filter(entry => entry.counted);
  assert.equal(counted.length, NOTES);
  assert.ok(counted.every(entry => !entry.auto), 'every note was the child\'s');
  assert.ok(logOf(run, 'peek')[0].tapped, 'the reed was tapped');
});

test('a child who taps the wrong group every time still ends the chapter, under 10 minutes', async () => {
  const run = await wrong();
  const end = ended(run, 'always wrong');
  assert.ok(end < 600, `the end at ${end.toFixed(1)} s`);
  const taps = logOf(run, 'tap');
  assert.ok(taps.length >= NOTES * 3, `${taps.length} wrong taps`);
  assert.ok(taps.every(tap => !tap.counted), 'none counted');
  const counted = logOf(run, 'sing').filter(entry => entry.counted);
  assert.deepEqual(counted.map(entry => entry.group), MELODY.flat(), 'the whole song still came');
  assert.ok(logOf(run, 'light').some(entry => entry.again), 'the right one lit again after a wrong tap');
});

test('in the free play a tap on any group sings on the next beat of TEMPO', async () => {
  const run = await along();
  ended(run, 'along');
  const c = run.world.chapterState;
  const taps = logOf(run, 'freeTap');
  const sung = logOf(run, 'free');
  assert.ok(taps.length >= 10, `${taps.length} taps in the song`);
  assert.equal(sung.length, taps.length, 'each tap sang');
  taps.forEach((tap, k) => {
    const beats = (tap.beat - c.songStart) / BEAT;
    assert.ok(Math.abs(beats - Math.round(beats)) < 1e-6, `tap ${k} waits for a beat (${beats.toFixed(3)})`);
    assert.ok(tap.beat >= tap.at - 1e-9 && tap.beat - tap.at < BEAT + 1e-9, `tap ${k}: the next beat`);
    const sang = sung[k];
    assert.equal(sang.group, tap.group);
    assert.ok(sang.at >= tap.beat - 1e-9 && sang.at - tap.beat <= FRAME + 1e-6, `tap ${k} sings on its beat (${(sang.at - tap.beat).toFixed(3)} s after)`);
  });
});

test('reduced motion: the notes fade instead of flying and the choir shot holds still, to the end', async () => {
  const run = await calm();
  ended(run, 'reduced');
  const notes = logOf(run, 'note');
  // a note from each animal the child (or the help) sang to her, and one from her to each animal as she shows phrases 3 and 4
  assert.equal(notes.length, NOTES + MELODY[2].length + MELODY[3].length, 'every note');
  assert.ok(notes.every(note => note.reduced), 'every note fades');
  const frames = run.watched.choirFrames;
  assert.ok(frames.length > 600, `${frames.length} frames of the choir shot`);
  // with motion it turns toward the group that sings
  const turning = (await untouched()).watched.choirFrames;
  assert.ok(turning.some((frame, i) => i > 0 && frame.t - turning[i - 1].t < FRAME * 1.5 && frame.turn.angleTo(turning[i - 1].turn) > 1e-5), 'with motion the choir shot turns');
  // within each hold of the shot the camera does not move or turn
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].t - frames[i - 1].t > FRAME * 1.5) continue; // a cut away and back
    assert.ok(frames[i].camera.distanceTo(frames[i - 1].camera) < 1e-6, `the camera moved at ${frames[i].t.toFixed(1)} s`);
    assert.ok(frames[i].turn.angleTo(frames[i - 1].turn) < 1e-6, `the camera turned at ${frames[i].t.toFixed(1)} s`);
  }
});

test('every line of WORDS is said once at least, and the captions name Slóeðla in her colour', async () => {
  const run = await slow();
  ended(run, 'slow');
  const missing = Object.keys(chapter.lines).filter(id => !run.seen.spokenAt.has(id));
  assert.deepEqual(missing, [], 'every line said');
  const hers = run.watched.colours.filter(entry => entry.who === 'Slóeðla');
  assert.ok(hers.length >= 3, `${hers.length} of her captions`);
  assert.ok(hers.every(entry => entry.colour === FRIENDS.a.dark), `her colour is the dark of her blue (${FRIENDS.a.dark})`);
  assert.deepEqual(run.captions.filter(entry => /^k\d_[a-z]+_/.test(entry.text)).map(entry => entry.text), [], 'no caption shows an id');
});

test('the turtles sit on their stone the whole choir, not in it', async () => {
  const run = await untouched();
  assert.ok(run.watched.turtleLift > 0.8, `the lowest turtle is ${run.watched.turtleLift.toFixed(2)} m over the ground`);
});

test('upright (aspect 0.625): the choir shot shows all five groups and the reed the whole task', async () => {
  for (const [shape, playShape] of [['upright', upright], ['16:10', untouched]]) {
    const run = await playShape();
    ended(run, shape);
    const frames = run.watched.choirFrames;
    assert.ok(frames.length > 600, `${frames.length} frames of the choir shot (${shape})`);
    const out = frames.filter(frame => frame.out.length);
    assert.deepEqual(out.slice(0, 3).map(frame => `${frame.out} at ${frame.t.toFixed(1)} s`), [], `${shape}: ${out.length} frames miss some`);
    assert.deepEqual(run.director.warnings, [], `the director (${shape})`);
    assert.deepEqual(run.watched.out, [], `every held shot shows whom it is for (${shape})`);
  }
});
