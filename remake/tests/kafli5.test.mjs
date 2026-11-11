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
import { MELODY, GROUPS, TEMPO, LAYER_LEVELS, PHRASE_LAYERS, CALM } from '../chapters/kafli5-song.js';
import { SONG } from '../chapters/kafli5-set.js';
import { CAMERA } from '../chapters/kafli5-video.js';
import { HELP } from '../chapters/kafli5-choir.js';
import { FAR_POOL } from '../chapters/kafli4-route.js';
import { SHOTS, STEPS, WADE, SPOTS } from '../chapters/kafli5-pool.js';
import { FRIENDS } from '../engine/sloedla/friends.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { FOREST } from '../world/forest/config.js';

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
// How tall the far reed stands over its ground (world/ardalur/river.js poolPlants: the reed's variants, at scales 0.95 to 1.25; the
// land's seed is createArdalur's, 4): the shortest plant, about the middle one, and the tallest. The tall horsetails among it are thin
// stems and hide nothing.
const REED_TOP = (() => {
  const library = createSpeciesLibrary(4);
  const heights = Array.from({ length: FOREST.trees.variants.horsetailReed }, (_, v) => library.get('horsetailReed', v, 1, {}).height);
  return { low: Math.min(...heights) * 0.95, mean: (heights.reduce((a, b) => a + b, 0) / heights.length) * 1.1, high: Math.max(...heights) * 1.25 };
})();
const REED_BED = 7; // the far bed's radius (kafli4-route.js FAR_POOL.reeds)
const CLEAR = 2.5; // m: as she walks, her body (tail to jaw, from above) stays this far from anyone
/** How far [x, z] point `p` (a Vector3, from above) is from the segment from `a` to `b`. */
const toSegment = (p, a, b) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * k, p.z - a.z - dz * k);
};

/**
 * The chapter played by `child` (a function of the chapter's state, the frame and what the run has seen, that taps with the
 * frame's pointer), with what the run sees on the way: the caption colours, every held shot's subjects out of frame, and the choir
 * shot's frames (the groups and the reed out of frame, the camera).
 */
function playIt({ seeking = true, aspect = 1.6, reduced = false, eager = false, child = null, audio = null } = {}) {
  const seen = { colours: [], out: [], choirFrames: [], wanted: null, taps: [], turtleLift: Infinity, her: [] };
  return playUnattended(kafli5, {
    seeking, limit: 900, shaped: true, aspect, reduced, eager, audio,
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
      // her, from scene 2 to scene 6: where she is and how she holds herself (kafli5-sloedla.js points), and who is nearest her body
      if (c.her?.points && c.scene >= 2 && c.scene <= 6) {
        const p = c.her.points();
        const others = ['mosi', 'egill', 'flugedla'].map(who => [who, world.actors.get(who).root.position])
          .concat(GROUPS.flatMap(group => (c.members[group] ?? []).map((b, k) => [`${group} ${k}`, b.position])));
        let near = { d: Infinity, who: null };
        for (const [who, at] of others) {
          const d = toSegment(at, p.body[0], p.body[1]);
          if (d < near.d) near = { d, who };
        }
        seen.her.push({ t: c.s.time, scene: c.scene, shot, hold: director.mode === 'hold', step: c.her.step, moving: c.her.moving, peeking: c.her.peeking, near, ...p });
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

test('nobody touching: the chapter plays to its end in 8 to 10 minutes, the star given', async () => {
  const run = await untouched();
  const end = ended(run, 'untouched');
  // about five minutes of story and choir, and Flugeðla's set of 3 min 50 s (the owner's pick of 2026-11-11)
  assert.ok(end >= 480 && end <= 600, `the end at ${end.toFixed(1)} s`);
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

test('a child who taps the wrong group every time still ends the chapter, under 12 minutes', async () => {
  const run = await wrong();
  const end = ended(run, 'always wrong');
  assert.ok(end < 720, `the end at ${end.toFixed(1)} s`);
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

test('each phrase brings in its part of the band, and the loop is blended into the set with no silence between them', async () => {
  const run = await quick();
  const c = run.world.chapterState;
  const band = logOf(run, 'band').filter(entry => !entry.blend);
  assert.deepEqual(band.map(entry => entry.phrase), [undefined, 0, 1, 2, 3], 'as the task starts, and after each phrase');
  assert.deepEqual(band[0].layers, LAYER_LEVELS);
  band.slice(1).forEach((entry, p) => assert.deepEqual(entry.layers, PHRASE_LAYERS[p], `phrase ${p + 1}`));
  assert.ok(Math.abs(band[0].at - sceneAt(run, 4)) < 0.1, 'the far band from the task\'s first moment');
  const phrases = logOf(run, 'phrase');
  band.slice(1).forEach((entry, p) => assert.ok(Math.abs(entry.at - phrases[p].at) < 0.1, `the part of phrase ${p + 1} joins as the phrase is found`));
  // the set starts where the loop's chords are the set's first (every sixteenth beat of the chapter's grid), with the whole band
  // of the loop still playing, and the loop's parts fade out under the set's first bars: the owner heard three seconds of
  // silence there (2026-11-11), the loop faded out and the set not yet begun
  const [set] = logOf(run, 'set');
  assert.ok(set.at > sceneAt(run, 6), 'the set starts in scene 6');
  const turns = set.beat / 16;
  assert.ok(Math.abs(turns - Math.round(turns)) < (FRAME / BEAT) / 16 + 1e-6, `on a sixteenth beat of the chapter's grid (${turns.toFixed(3)})`);
  const [blend] = logOf(run, 'band').filter(entry => entry.blend);
  assert.ok(blend && Math.abs(blend.at - set.at) < FRAME + 1e-6, 'the blend begins as the set does');
  for (const layer of ['drums', 'bass', 'music']) assert.ok(blend.from[layer] > 0, `${layer} still plays as the set starts`);
  assert.ok(blend.seconds >= 2 * BEAT * 2 && blend.seconds <= 16 * BEAT, `the loop's last part is out ${blend.seconds.toFixed(2)} s into the set`);
  for (const layer of ['drums', 'bass', 'music', 'far']) assert.equal(c.band.level(layer), 0, `${layer} is out by the end`);
  assert.equal(c.band.playing, false, 'the loop has left');
});

test('the chapter is never silent: the pool is heard and a calm music plays until the choir (but for a breath as her song is lost), and both again when the set is over', async () => {
  const run = await quick();
  ended(run, 'eager');
  const c = run.world.chapterState;
  const said = id => run.seen.spokenAt.get(id);
  const sounds = logOf(run, 'sound');
  const named = name => sounds.filter(entry => entry.name === name);
  // the pool's bed (the owner, 2026-11-11: "núna er allt hljótt þangað til lag byrjar")
  const beds = named('fen');
  assert.equal(beds.length, 3);
  assert.ok(beds[0].at < sceneAt(run, 1) + 0.5 && beds[0].calls !== false, 'the pool is heard from the first moment, frogs and all');
  assert.ok(Math.abs(beds[1].at - sceneAt(run, 3)) < 0.5 && beds[1].calls === false, 'only its water while the choir is listened to (a frog of the bed is not a frog of the choir)');
  assert.ok(beds[2].at >= c.set.ended && beds[2].at < sceneAt(run, 7) && beds[2].calls !== false, 'and its frogs again when the set is over');
  // the calm music: the set's quiet record, a layer of the loop
  const calm = logOf(run, 'calm');
  assert.deepEqual(calm.map(entry => entry.on), [true, false, true, false, true, false]);
  assert.ok(calm[0].at < sceneAt(run, 1) + 0.5, 'from the first moment');
  assert.ok(calm[1].at >= said('k5_sloedla_forgot') && calm[1].at < said('k5_mosi_animals'), 'it goes when she has said her song is lost');
  assert.ok(calm[2].at >= said('k5_mosi_animals') - 0.5 && calm[2].at < sceneAt(run, 3), 'and is back as Mosi says the animals remember');
  assert.ok(calm[2].at - calm[1].at < 8, 'a breath of no music, not a silence');
  const [band] = logOf(run, 'band');
  assert.ok(Math.abs(calm[3].at - band.at) < 0.1, 'it gives way to the far band as the choir begins');
  const [roar] = logOf(run, 'roar');
  assert.ok(calm[4].at > roar.at + 3, 'the roar is heard in the quiet, and the music comes after it');
  assert.ok(calm[5].at >= said('k5_mosi_longest') && calm[5].at + 2.2 <= run.world.chapterTimeline.find(mark => mark.scene === 'end').at + 1e-6, 'and it is gone when the book opens');
  for (const layer of ['calm', 'drums', 'bass', 'music', 'far']) assert.equal(c.band.level(layer), 0, layer + ' is out at the end');
  // what happens is heard
  const [peek] = logOf(run, 'peek');
  assert.ok(named('sailRise').some(entry => Math.abs(entry.at - peek.at) < 0.2), 'the reed rustles as she peeks');
  const walk = named('step').filter(entry => entry.at > sceneAt(run, 2) && entry.at < sceneAt(run, 3));
  assert.ok(walk.length >= 4, walk.length + ' of Mosi\'s steps down to the water');
  walk.slice(1).forEach((step, k) => assert.ok(step.at - walk[k].at > 0.4, 'a walk, not a drum roll'));
  const off = said('k5_mosi_animals');
  const calls = sounds.filter(entry => entry.call && entry.at >= off - 0.5 && entry.at < sceneAt(run, 3));
  assert.deepEqual(calls.map(entry => entry.call).sort(), [...GROUPS].sort(), 'each group answers as it sets off');
  calls.forEach(entry => assert.ok(Math.abs(entry.pan) <= 0.8, 'from where it is'));
  // her feet in the water: every step out of the reed, and the wade
  const steps = logOf(run, 'step');
  assert.equal(steps.length, MELODY.length - 1);
  const strokes = named('swim');
  for (const step of steps) assert.ok(strokes.some(entry => entry.at >= step.at && entry.at < step.at + 1), 'water as she steps out (step ' + step.step + ')');
  assert.ok(strokes.some(entry => entry.at >= sceneAt(run, 6) && entry.at < run.world.chapterState.songStart), 'and as she wades out');
  strokes.slice(1).forEach((stroke, k) => assert.ok(stroke.at - strokes[k].at > 1.5, 'one stroke under the last of the one before, never a pile'));
  assert.ok(strokes.every(stroke => stroke.at < run.world.chapterState.songStart), 'none in the set');
});

test('scene 6 plays the whole set: every part of it in order, her words on the screen, the right shots, and then her thanks', async () => {
  const run = await untouched();
  const c = run.world.chapterState;
  const SET = SONG.set;
  assert.deepEqual(logOf(run, 'section').map(entry => entry.id), SET.sections.map(section => section.id), 'every part');
  assert.deepEqual(logOf(run, 'videoError').map(entry => entry.message), [], 'no part of the video threw (the dances, the show, the people)');
  logOf(run, 'section').forEach((entry, k) => {
    const due = c.songStart + SET.sections[k].startBeat * BEAT;
    assert.ok(entry.at >= due - 1e-6 && entry.at - due <= FRAME + 1e-6, `${entry.id} on its beat (${(entry.at - due).toFixed(3)} s after)`);
  });
  assert.deepEqual(logOf(run, 'djLine').map(entry => entry.id), SET.lines.map(line => line.id), 'every line of hers');
  const shown = run.captions.filter(entry => entry.who === 'Flugeðla').map(entry => entry.text);
  for (const line of SET.lines) assert.ok(shown.includes(line.text), `"${line.text}" is on the screen`);
  // the set takes its length, and she thanks Egill after its last hit has rung
  assert.ok(Math.abs(c.set.ended - c.songStart - (SET.endBeat * BEAT + 2.4)) < 0.1, `the set took ${(c.set.ended - c.songStart).toFixed(1)} s`);
  const thanks = run.seen.said.find(line => line.id === 'k5_sloedla_thanks');
  assert.ok(thanks.at >= c.set.ended, 'her thanks after the set');
  // her horn's part is hers, Flugeðla's parts are Flugeðla's, a group's part is the choir's
  const shotAt = time => run.seen.cuts.findLast(cut => cut.at <= time + 1e-6)?.shot;
  const part = id => SET.sections.find(section => section.id === id);
  const middle = section => c.songStart + (section.startBeat + section.beats / 2) * BEAT;
  assert.equal(shotAt(middle(part('break')) - 4 * BEAT), 'set_her_close');
  assert.equal(shotAt(c.songStart + (part('welcome').startBeat + 2) * BEAT), 'set_flugedla');
  assert.equal(shotAt(c.songStart + (part('grazers').startBeat + 2) * BEAT), 'set_grazers');
  assert.equal(shotAt(middle(part('grazers')) + 2 * BEAT), 'set_grazers_close');
  assert.deepEqual(logOf(run, 'cut').map(entry => entry.shot), CAMERA.map(entry => entry.cut), 'every cut of the camera, in order');
  // the groups hop as they sing in the set (nobody touched the screen)
  assert.ok(logOf(run, 'free').length === 0 && logOf(run, 'cue').some(entry => entry.kind === 'freeze'), 'the cues the video will be cut to are met');
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

// Her life in the reed and out of it (kafli5-sloedla.js): hidden but her crest, the peek, a step out after each phrase, the wade.
const overGround = (world, point) => point.y - world.heightAt(point.x, point.z);
const fromBed = point => Math.hypot(point.x - FAR_POOL.farReed[0], point.z - FAR_POOL.farReed[1]);

test('she is out of sight but her crest in reed_close until the peek', async () => {
  for (const [kind, playKind, least] of [['untouched', untouched, 150], ['eager', quick, 20]]) {
    const run = await playKind();
    const frames = run.watched.her;
    const [peek] = logOf(run, 'peek');
    assert.ok(peek, `she peeks (${kind})`);
    const before = frames.filter(f => f.scene === 2 && f.shot === 'reed_close' && f.hold && f.t < peek.at);
    assert.ok(before.length >= least, `${before.length} frames of the reed before the peek (${kind})`);
    const over = point => overGround(run.world, point);
    const say = f => `${f.t.toFixed(1)} s: eyes ${over(f.eyes).toFixed(2)}, back ${over(f.back).toFixed(2)}, ${Object.entries(f.bones).map(([name, b]) => `${name} ${over(b).toFixed(2)}`).join(', ')}, crest ${over(f.crest).toFixed(2)} m over the ground, ${fromBed(f.root).toFixed(1)} m into the bed`;
    const seen = before.filter(f => over(f.eyes) > REED_TOP.low || over(f.back) > REED_TOP.low || Object.values(f.bones).some(b => over(b) > REED_TOP.low) || fromBed(f.root) > REED_BED - 2);
    assert.deepEqual(seen.slice(0, 3).map(say), [], `${kind}: her eyes, her back's top and her bones under the shortest reed (${REED_TOP.low.toFixed(2)} m), inside the bed`);
    const hid = before.filter(f => over(f.crest) < REED_TOP.mean + 0.3);
    assert.deepEqual(hid.slice(0, 3).map(say), [], `${kind}: her crest well over the middle reed (${(REED_TOP.mean + 0.3).toFixed(2)} m)`);
    // the peek: her eyes come over the reed
    const peeking = frames.filter(f => f.scene === 2 && f.peeking && f.t > peek.at + 1.5 && f.shot === 'reed_close');
    assert.ok(peeking.length > 20, `${peeking.length} frames of her peeking (${kind})`);
    const low = peeking.filter(f => over(f.eyes) < REED_TOP.mean + 0.1);
    assert.deepEqual(low.slice(0, 3).map(say), [], `${kind}: peeking, her eyes over the reed (${REED_TOP.mean.toFixed(2)} m)`);
  }
});

test('each phrase takes her one step nearer, and never through Egill, Mosi or a group', async () => {
  for (const [kind, playKind] of [['untouched', untouched], ['eager', quick]]) {
    const run = await playKind();
    ended(run, kind);
    const steps = logOf(run, 'step');
    const phrases = logOf(run, 'phrase');
    assert.deepEqual(steps.map(entry => entry.step), [1, 2, 3], `${kind}: a step after each phrase but the last`);
    steps.forEach((entry, k) => assert.ok(entry.at > phrases[k].at && entry.at < phrases[k + 1].at, `${kind}: step ${entry.step} between phrases ${k} and ${k + 1}`));
    const frames = run.watched.her;
    const walking = frames.filter(f => f.moving);
    assert.ok(walking.length > 300, `${kind}: she walks out (${walking.length} frames)`);
    // where she stops: each step, then out in the pool, each nearer Egill than the last
    const stops = frames.filter((f, i) => i > 0 && frames[i - 1].moving && !f.moving);
    const wanted = [...STEPS.slice(1).map(entry => entry.at), WADE.at];
    assert.equal(stops.length, wanted.length, `${kind}: she stops ${stops.length} times`);
    stops.forEach((f, k) => {
      const off = Math.hypot(f.root.x - wanted[k][0], f.root.z - wanted[k][1]);
      assert.ok(off < 0.3, `${kind}: stop ${k + 1} is ${off.toFixed(2)} m from its place`);
    });
    const toEgill = [STEPS[0].at, ...wanted].map(([x, z]) => Math.hypot(x - SPOTS.egill[0], z - SPOTS.egill[1]));
    toEgill.forEach((d, k) => k && assert.ok(d < toEgill[k - 1] - 1, `${kind}: each stop nearer Egill (${toEgill.map(v => v.toFixed(1))})`));
    // never through anyone
    const close = walking.filter(f => f.near.d < CLEAR);
    assert.deepEqual(close.slice(0, 3).map(f => `${f.t.toFixed(1)} s: ${f.near.d.toFixed(2)} m from ${f.near.who}`), [], `${kind}: as she walks no one is within ${CLEAR} m of her body`);
  }
});

test('nothing of her jumps more than 8 degrees or 0.1 m in a frame from scene 2 to scene 6', async () => {
  const DEG = 180 / Math.PI;
  for (const [kind, playKind] of [['untouched', untouched], ['eager', quick], ['upright', upright]]) {
    const frames = (await playKind()).watched.her;
    assert.ok(frames.length > 3000, `${kind}: ${frames.length} frames of her`);
    const jumps = [];
    for (let i = 1; i < frames.length; i++) {
      const [a, b] = [frames[i - 1], frames[i]];
      assert.ok(b.t - a.t < FRAME * 1.5, `${kind}: every frame from scene 2 to 6 (${a.t.toFixed(2)} to ${b.t.toFixed(2)} s)`);
      const moved = Object.fromEntries(['root', 'head', 'eyes', 'crest'].map(k => [k, a[k].distanceTo(b[k])]));
      let turned = Math.abs(b.heading - a.heading) % 360;
      turned = Math.min(turned, 360 - turned);
      const looked = a.facing.angleTo(b.facing) * DEG;
      if (Math.max(...Object.values(moved)) > 0.1 || turned > 8 || looked > 8) {
        jumps.push(`${b.t.toFixed(2)} s, scene ${b.scene} in ${b.shot}: ${Object.entries(moved).map(([k, m]) => `${k} ${m.toFixed(3)} m`).join(', ')}; turned ${turned.toFixed(1)}, her head ${looked.toFixed(1)} degrees`);
      }
    }
    assert.deepEqual(jumps.slice(0, 5), [], `${kind}: ${jumps.length} jumps`);
  }
});
