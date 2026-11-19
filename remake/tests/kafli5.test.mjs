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
import { SHOTS, STEPS, WADE, SPOTS, WEST, headingTo } from '../chapters/kafli5-pool.js';
import * as kafli4 from '../chapters/kafli4.js';
import { createSave, defaultChapter } from '../engine/save.js';
import { renderMap } from '../engine/book/map-page.js';
import { FakeDocument } from './fake-dom.mjs';
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
 * The stage as it stands in a frame (the one the set starts in): where Egill, Mosi and Flugeðla are, which way they face and
 * whether they show; her, her courage and her step; every animal at the pool (the choir's members in their groups, and all the
 * rest, where each stands); the groups' tap points and the targets on the screen; the camera; and the light (the haze's colour,
 * which a dusk tints, and the sun's nightcap).
 */
function stageOf({ world, sunFace, pointer }) {
  const c = world.chapterState;
  const at = v => [v.x, v.y, v.z];
  const life = world.forest.life;
  const where = b => ({ at: at(b.gather?.at ?? b.position), heading: b.gather?.heading ?? null });
  const her = c.her.points();
  return {
    time: c.s.time,
    actors: Object.fromEntries(['mosi', 'egill', 'flugedla'].map(who => {
      const actor = world.actors.get(who);
      return [who, { at: at(actor.root.position), heading: actor.heading, shown: actor.root.visible }];
    })),
    her: { at: at(her.root), heading: her.heading, head: at(her.head), shown: world.actors.get('sloedla').root.visible, courage: c.her.courage, step: c.her.step, moving: c.her.moving },
    members: Object.fromEntries(GROUPS.map(group => [group, c.members[group].map(b => ({ id: b.id, ...where(b) }))])),
    arrivals: life.arrivals.map(where),
    pool: Object.fromEntries(Object.entries(life.pool).filter(([, things]) => Array.isArray(things)).map(([kind, things]) => [kind, things.map(where)])),
    aims: Object.fromEntries(Object.entries(c.aims).map(([name, point]) => [name, [...point]])),
    targets: [...pointer.targets.keys()].sort(),
    shot: c.set?.shot ?? null,
    camera: at(world.camera.position),
    light: { haze: world.scene.fog.color.getHexString(), density: world.scene.fog.density, cap: sunFace.capOn },
  };
}

/**
 * The chapter played by `child` (a function of the chapter's state, the frame and what the run has seen, that taps with the
 * frame's pointer), with what the run sees on the way: the caption colours, every held shot's subjects out of frame, and the choir
 * shot's frames (the groups and the reed out of frame, the camera).
 */
function playIt({ seeking = true, aspect = 1.6, reduced = false, eager = false, child = null, audio = null, savedWith = null } = {}) {
  const seen = { colours: [], out: [], choirFrames: [], wanted: null, taps: [], turtleLift: Infinity, her: [], west: [] };
  return playUnattended(kafli5, {
    seeking, limit: 900, shaped: true, aspect, reduced, eager, audio, savedWith,
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
      if (c.set && !seen.atSet) seen.atSet = stageOf(frame); // everyone and the light as the set starts (the show alone is held to it)
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
      // scene 7: which way each of them faces (the roar comes from the west). Hers is her life's own heading: the actor reads its
      // back from the root's turn, which past a quarter turn is not the heading she was given
      if (c.scene === 7) {
        const facing = who => world.actors.get(who).heading;
        seen.west.push({ t: c.s.time, mosi: facing('mosi'), egill: facing('egill'), sloedla: c.her.points().heading });
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
const play = (name, options, how = playIt) => {
  if (!once.has(name)) once.set(name, how(options));
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
  const [roar] = logOf(run, 'roar');
  const beds = named('fen');
  assert.equal(beds.length, 5);
  assert.ok(beds[0].at < sceneAt(run, 1) + 0.5 && beds[0].calls !== false, 'the pool is heard from the first moment, frogs and all');
  assert.ok(Math.abs(beds[1].at - sceneAt(run, 3)) < 0.5 && beds[1].calls === false, 'only its water while the choir is listened to (a frog of the bed is not a frog of the choir)');
  assert.ok(beds[2].at >= c.set.ended && beds[2].at < sceneAt(run, 7) && beds[2].calls !== false, 'and its frogs again when the set is over');
  assert.ok(beds[3].at > roar.at && beds[3].at < roar.at + 0.6 && beds[3].calls === false, 'the roar hushes them: only the water');
  assert.ok(Math.abs(beds[4].at - said('k5_mosi_gramedla')) < 0.1 && beds[4].calls !== false, 'and they dare again as Mosi speaks');
  // the party far away (the owner's yes of 2026-11-18): the band's loop again from the set's last hit, low, under her thanks and the
  // star, until the roar stops it dead; then real quiet for a breath before Mosi's line
  const party = logOf(run, 'party');
  assert.deepEqual(party.map(entry => entry.on), [true, false]);
  assert.ok(Math.abs(party[0].at - (c.songStart + SONG.set.endBeat * BEAT)) < FRAME + 1e-6, 'it comes on the set\'s last hit: no hole after "Góða nótt"');
  assert.ok(party[0].at + kafli5.PARTY.in < said('k5_sloedla_thanks') + 1.5, 'and is there when she thanks Egill');
  assert.ok(party[1].at > roar.at && party[1].at - roar.at < 0.6 && kafli5.PARTY.cut <= 0.1, `the roar stops it dead (${(party[1].at - roar.at).toFixed(2)} s into the roar, gone in ${kafli5.PARTY.cut} s)`);
  assert.ok(party[1].at - party[0].at > 10, `it played ${(party[1].at - party[0].at).toFixed(1)} s`);
  for (const [layer, level] of Object.entries(kafli5.PARTY.layers)) {
    assert.ok(Object.hasOwn(SONG.loop.layers, layer) && layer !== 'calm', `${layer} is a part of the band's loop`);
    assert.ok(level > 0 && level <= 0.5, `${layer} is low (${level}): far away, under the lines`);
  }
  const breath = said('k5_mosi_gramedla') - (roar.at + 2.6); // the roar's own 2.4 s and Mosi's last step as he turns (2.6 s) are over
  assert.ok(breath >= 1.8 && breath <= 3, `a breath of real quiet before Mosi's line (${breath.toFixed(1)} s)`);
  assert.equal(sounds.filter(entry => entry.at > roar.at + 2.7 && entry.at < said('k5_mosi_gramedla') - 0.05).length, 0, 'nothing sounds in it');
  // the calm music: the set's quiet record, a layer of the loop
  const calm = logOf(run, 'calm');
  assert.deepEqual(calm.map(entry => entry.on), [true, false, true, false, true, false]);
  assert.ok(calm[0].at < sceneAt(run, 1) + 0.5, 'from the first moment');
  assert.ok(calm[1].at >= said('k5_sloedla_forgot') && calm[1].at < said('k5_mosi_animals'), 'it goes when she has said her song is lost');
  assert.ok(calm[2].at >= said('k5_mosi_animals') - 0.5 && calm[2].at < sceneAt(run, 3), 'and is back as Mosi says the animals remember');
  assert.ok(calm[2].at - calm[1].at < 8, 'a breath of no music, not a silence');
  const [band] = logOf(run, 'band');
  assert.ok(Math.abs(calm[3].at - band.at) < 0.1, 'it gives way to the far band as the choir begins');
  assert.ok(calm[4].at > roar.at + 3 && calm[4].at > party[1].at + 3, 'the roar rolls out over nothing, and the music comes after it');
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

test('a hand on the fader: the set\'s level is ridden slowly, back before the drop and in the ending that is not one, and the last chorus is the highest of the night', async () => {
  const { RIDE, SET_LEVEL, FINALE } = kafli5;
  const SET = SONG.set;
  const part = id => SET.sections.find(section => section.id === id);
  const dB = ratio => 20 * Math.log10(ratio);
  // the moves, one after another: none starts before the one before it is done
  const moves = RIDE.map((move, k) => ({ ...move, from: k ? RIDE[k - 1].level : SET_LEVEL, beats: move.seconds / BEAT }));
  moves.forEach((move, k) => {
    assert.ok(move.beat >= 0 && move.beat + move.beats <= (moves[k + 1]?.beat ?? SET.endBeat), `the move at ${move.beat} is done before the next`);
    // slow: a bar at least, and no faster than a DJ's hand that nobody notices (a compressor that pumps moves 5 dB in a fifth of a second)
    const rate = Math.abs(dB(move.level / move.from)) / move.seconds;
    assert.ok(move.seconds >= 4 * BEAT - 1e-9, `the move at ${move.beat} takes ${move.seconds.toFixed(2)} s`);
    assert.ok(rate <= 1.6, `the move at ${move.beat}: ${rate.toFixed(2)} dB a second`);
    assert.ok(Math.abs(dB(move.level / move.from)) <= 3, `the move at ${move.beat}: ${dB(move.level / move.from).toFixed(1)} dB`);
  });
  /** The set's level at one of its beats: straight lines from move to move (engine/audio/music.js's fader). */
  const levelAt = beat => {
    let level = SET_LEVEL;
    for (const move of moves) if (beat > move.beat) level = move.from + (move.level - move.from) * Math.min(1, (beat - move.beat) / move.beats);
    return level;
  };
  // the owner's own level (2026-11-11) from the set's start to the build, and on the drop, the rewind, the drop again and on to the false ending
  for (let beat = 0; beat <= part('rise').startBeat; beat += 0.5) assert.equal(levelAt(beat), SET_LEVEL, `beat ${beat}`);
  for (let beat = part('drop').startBeat; beat <= part('fakeend').startBeat; beat += 0.5) assert.equal(levelAt(beat), SET_LEVEL, `beat ${beat}`);
  // back a little through the build, and up again over the count's last bar: the drop comes out of less
  const build = levelAt(part('drop').startBeat - 8);
  assert.ok(dB(build / SET_LEVEL) <= -1 && dB(build / SET_LEVEL) >= -2, `the build is ${dB(build / SET_LEVEL).toFixed(1)} dB back`);
  assert.ok(levelAt(part('rise').startBeat + 4) > build && levelAt(part('drop').startBeat - 2) > build, 'slowly down, slowly up');
  // back as the record stops in the ending that is not one, and up under "Einu sinni enn!"
  const fake = levelAt(part('lastchorus').startBeat - 4);
  assert.ok(dB(fake / SET_LEVEL) <= -1 && dB(fake / SET_LEVEL) >= -2, `the false ending is ${dB(fake / SET_LEVEL).toFixed(1)} dB back`);
  // the last chorus, to the last hit: the highest of the whole set
  for (let beat = part('lastchorus').startBeat; beat <= SET.endBeat; beat += 0.5) assert.equal(levelAt(beat), FINALE, `beat ${beat}`);
  for (let beat = 0; beat < part('lastchorus').startBeat; beat += 0.25) assert.ok(levelAt(beat) < FINALE, `beat ${beat} is under the finale`);
  assert.ok(Math.max(...Array.from({ length: part('fakeend').startBeat * 4 }, (_, i) => levelAt(i / 4))) <= SET_LEVEL, 'nothing before the false ending is over the level it had');
  assert.equal(Math.max(...RIDE.map(move => move.level), SET_LEVEL), FINALE);
  // by the file the last chorus is 0.85 LU under the first drop at one level (-13.49 against -12.64 LUFS, BS.1770, measured from
  // djamm.mp3); the finale's level puts it 0.5 to 1 LU over. And it stays under 2.2: at 2.3 the set's peaks reach full scale
  // going into the page's limiter (engine/audio/output.js; a model of it fed the file)
  const over = dB(FINALE / SET_LEVEL) - 0.85;
  assert.ok(over >= 0.5 && over <= 1, `the last chorus sits ${over.toFixed(2)} LU over the first drop`);
  assert.ok(FINALE < 2.2);
  // as it is played: each move on its beat, in order
  const run = await untouched();
  const c = run.world.chapterState;
  const rides = logOf(run, 'ride');
  assert.deepEqual(rides.map(({ beat, level, seconds }) => ({ beat, level, seconds })), RIDE);
  rides.forEach(ride => {
    const due = c.songStart + ride.beat * BEAT;
    assert.ok(ride.at >= due - 1e-6 && ride.at - due <= FRAME + 1e-6, `the move at ${ride.beat} on its beat`);
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

// ---------------------------------------------------------------------------------------------
// The start, the end and the save (the plan's Task 9): the chapter a save opens, the map's piece and her star, a second play, the
// roar from the west, and the book the chapter ends in.

const EARLIER = ['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla'];
const saveWith = stars => {
  const save = createSave(null);
  for (const star of stars) save.addStar(star);
  return save;
};
/** How far apart two headings are, in degrees (0 to 180). */
const apart = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
// a child who comes from chapter 4 with the four stars and the places chapter 3's lookout gives, and one who has played this
// chapter to its end before
const fromFour = () => play('fromFour', { savedWith: s => { EARLIER.forEach(id => s.addStar(id)); ['fen', 'sloedla', 'flugedla', 'uggedla'].forEach(id => s.addPlace(id)); } });
const again = () => play('again', { savedWith: s => { [...EARLIER, 'k5_sloedla'].forEach(id => s.addStar(id)); ['fen', 'sloedla', 'flugedla', 'uggedla'].forEach(id => s.addPlace(id)); } });

test('defaultChapter opens chapter 5 after Flugeðla and keeps every earlier answer', () => {
  const cases = [[[], 'kafli1'], [['k1_kambedla'], 'kafli2'], [['k1_kambedla', 'k2_uggedla'], 'kafli3'],
    [['k1_kambedla', 'k2_uggedla', 'k2_thorsedla'], 'kafli4'],
    [EARLIER, 'kafli5'],
    [[...EARLIER, 'k5_sloedla'], 'kafli5'],
    [['k1_kambedla', 'k2_thorsedla'], 'kafli2'], // an old chapter 2 save still meets Uggeðla
    [['k1_kambedla', 'k2_thorsedla', 'k4_flugedla'], 'kafli2'], // and so does one that flew with Flugeðla before it met her
    [['k1_kambedla', 'k2_uggedla', 'k4_flugedla'], 'kafli3']]; // Flugeðla's star alone does not skip Þórseðla
  for (const [stars, want] of cases) assert.equal(defaultChapter(saveWith(stars)), want, `stars ${stars.join(', ') || 'none'}`);
});

test('kafli4 hands over to kafli5, and kafli5 to none yet', () => {
  assert.equal(kafli4.chapter.next, 'kafli5');
  assert.equal(chapter.next, null, 'chapter 6 is not made yet');
});

test('scene 1 draws map piece e, and her star stars it', async () => {
  const run = await fromFour();
  ended(run, 'from chapter 4');
  assert.deepEqual(run.moments.flatMap(moment => moment.ids), ['e'], 'piece e, once: from her tree to the far pool');
  const [moment] = run.moments;
  assert.ok(moment.at >= sceneAt(run, 1) && moment.closeAt < sceneAt(run, 2), `in scene 1 (${moment.at.toFixed(1)} to ${moment.closeAt?.toFixed(1)} s)`);
  const said = run.seen.spokenAt.get('k5_mosi_map');
  assert.ok(said >= moment.at && said < moment.closeAt, 'Mosi says where they are going while it is up');
  // the book's map with the save the chapter leaves: her slot starred, the piece to her reached, and Grameðla's the one ahead
  const mapOf = save => {
    const doc = new FakeDocument();
    const leaf = { el: doc.createElement('div'), tiles: [doc.createElement('div'), doc.createElement('div')] };
    leaf.el.append(...leaf.tiles);
    return renderMap(leaf, { save, win: { matchMedia: () => ({ matches: false }) } });
  };
  const map = mapOf(run.save);
  assert.equal(map.stateOf('sloedla'), 'done', 'her slot has its star');
  assert.ok(['pending', 'drawn'].includes(map.routeOf('e')), `piece e is reached: ${map.routeOf('e')}`);
  assert.equal(map.next(), 'f', 'the way ahead is to Grameðla');
  // and before her star it was the way ahead
  const before = mapOf(saveWith(EARLIER));
  assert.equal(before.next(), 'e');
  assert.equal(before.stateOf('sloedla'), 'empty');
});

test('played again with k5_sloedla already in the save: no second star, the book shows her once', async () => {
  const run = await again();
  ended(run, 'played again');
  const { stars, places } = run.save.get();
  assert.deepEqual([...stars].sort(), [...EARLIER, 'k5_sloedla'].sort(), `no second star: ${stars}`);
  assert.equal(places.filter(id => id === 'sloedla').length, 1, `her place once: ${places}`);
  assert.ok(run.seen.spokenAt.has('k5_sloedla_thanks') && run.seen.spokenAt.has('k5_mosi_star'), 'the lines are said all the same');
  // and a child who comes with nothing (the page's address names the chapter) has her tile in the book all the same: it shows by
  // her place (cards.json), which chapter 3's lookout gives
  const fresh = await untouched();
  assert.equal(fresh.save.get().places.filter(id => id === 'sloedla').length, 1, `her place is on the map: ${fresh.save.get().places}`);
  assert.equal(fresh.save.get().stars.filter(id => id === 'k5_sloedla').length, 1);
});

test('the roar comes from the west and everyone turns toward it within 2 s', async () => {
  const run = await untouched();
  const [roar] = logOf(run, 'roar');
  assert.ok(roar && roar.at > sceneAt(run, 7), 'the roar, in scene 7');
  const heard = run.soundLog.filter(entry => entry.name === 'gramedlaRoar');
  assert.equal(heard.length, 1, 'heard once');
  // the camera stands west of them and looks back east at their faces (kafli5-pool.js west_listen), so the west is behind it: the
  // roar is not from a side. It is far off but big (the owner's yes of 2026-11-18: it was 0.3, under Mosi's lines): over
  // everything said in the scene, and under the roar the child knows from chapter 3's lookout (level 1)
  assert.ok(Math.abs(heard[0].detail.pan) < 0.5 && heard[0].detail.level >= 0.7 && heard[0].detail.level <= 0.9, `pan ${heard[0].detail.pan}, level ${heard[0].detail.level}`);
  assert.ok(WEST[0] < SPOTS.mosi[0] - 1000, 'the ridge is far in the west');
  const want = { mosi: headingTo(SPOTS.mosi, WEST), egill: headingTo(SPOTS.egill, WEST), sloedla: headingTo(WADE.at, WEST) };
  const frames = run.watched.west;
  const at = t => frames.findLast(frame => frame.t <= t);
  const [before, soon, last] = [at(roar.at), at(roar.at + 2), frames.at(-1)];
  for (const who of ['mosi', 'egill', 'sloedla']) {
    const [was, then, end] = [before, soon, last].map(frame => apart(frame[who], want[who]));
    assert.ok(was > 20, `${who} was not facing the west before it (${was.toFixed(0)} degrees off)`);
    assert.ok(then < was - 20 || then < 5, `${who} is turning to it within 2 s: ${was.toFixed(0)} then ${then.toFixed(0)} degrees off`);
    assert.ok(end < 5, `${who} faces the west when the lines are said: ${end.toFixed(1)} degrees off`);
  }
  // nobody says a word until they have turned
  const first = run.seen.spokenAt.get('k5_mosi_gramedla');
  assert.ok(first > roar.at + 3, `Mosi names her ${(first - roar.at).toFixed(1)} s after the roar`);
  for (const who of ['mosi', 'egill', 'sloedla']) assert.ok(apart(at(first)[who], want[who]) < 5, `${who} has turned by then`);
});

test('the chapter ends in the book on the dinosaurs with Slóeðla nodding, then the map', async () => {
  for (const [kind, playKind] of [['untouched', untouched], ['played again', again]]) {
    const run = await playKind();
    const end = ended(run, kind);
    const said = ['k5_mosi_gramedla', 'k5_egill_next', 'k5_mosi_longest'].map(id => run.seen.spokenAt.get(id));
    assert.ok(said[0] < said[1] && said[1] < said[2] && said[2] < end, `${kind}: the three lines, then the book`);
    assert.deepEqual(run.book.opened.map(([tab]) => tab), ['dinosaurs', 'map'], `${kind}: the book, twice`);
    assert.deepEqual(run.book.nods, ['sloedla', null], `${kind}: her tile nods`);
    assert.equal(run.book.isOpen, true, `${kind}: and it stays open`);
  }
});

// ---------------------------------------------------------------------------------------------
// The show alone (kafli5.js `show`, ?chapter=djamm: the book's tile "Djamm skógarins"): scene 6's set and nothing else of the
// chapter. Held against the chapter's own untouched play, frame for frame where the two must be one.

const { show, ALONE } = kafli5;
const SET = SONG.set;
const EARNED = { stars: ['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla', 'k5_sloedla'], places: ['fen', 'sloedla', 'flugedla', 'uggedla'] };
const BOOK_HELD = { at: 60, seconds: 5 }; // the run's seconds the game stands still, as when a book is opened over the show
const cardOf = doc => doc.body.children.find(element => element.classList.contains('dans-end')) ?? null;
const click = element => element.dispatchEvent(new Event('click'));

/**
 * The show played with nobody touching it, in time and with its sound, the game held for five seconds on the way (a book opened
 * over it); on the end card "Hætta" is pressed (the page it would leave is a stand-in, so the show stands there still), and then
 * "Aftur", and the second showing plays its first bars.
 */
function playShow() {
  const seen = { atSet: [], held: [], card: null, quit: null, again: null, posted: [], elements: null };
  return playUnattended({ ...kafli5, chapter: show }, {
    seeking: false, limit: 256, shaped: true, audio: createFakeContext({ state: 'running' }), pauses: [BOOK_HELD],
    savedWith: s => { EARNED.stars.forEach(id => s.addStar(id)); EARNED.places.forEach(id => s.addPlace(id)); seen.saved = JSON.stringify(s.get()); },
    onFrame(frame) {
      const { t, world } = frame;
      const c = world.chapterState;
      if (!c) return;
      world.camera.updateMatrixWorld();
      const [record] = world.sound.elements;
      // each showing's first frame of the set
      if (c.set && seen.atSet.at(-1)?.start !== c.set.start) seen.atSet.push({ start: c.set.start, stage: stageOf(frame), record: world.sound.elements.at(-1), band: c.band.playing });
      // while the game is held: its record stands still, and after it the record is where the set is
      if (t >= BOOK_HELD.at + 1 && t < BOOK_HELD.at + BOOK_HELD.seconds - 1) seen.held.push({ paused: record.paused, time: record.currentTime });
      if (!seen.after && t >= BOOK_HELD.at + BOOK_HELD.seconds + 3) seen.after = { paused: record.paused, time: record.currentTime, set: c.s.time - c.set.start };
      // the end card: what stands under it, then "Hætta", then "Aftur"
      const card = cardOf(world.page);
      if (card && !seen.card) {
        const buttons = card.findAll(element => element.tagName === 'BUTTON');
        seen.card = { t, at: c.s.time, words: buttons.map(button => button.textContent), stage: stageOf(frame), band: c.band.playing, party: c.band.level('far') };
      }
      if (seen.card && !seen.quit && t >= seen.card.t + 1) {
        const [, quit] = card.findAll(element => element.tagName === 'BUTTON');
        globalThis.window = { location: { search: '?chapter=djamm&syning=1', origin: 'http://localhost:4280' }, parent: { postMessage: message => seen.posted.push(message) } };
        try { click(quit); } finally { delete globalThis.window; }
        seen.quit = { t, band: c.band.playing, song: c.song.playing };
      }
      if (seen.quit && !seen.again && t >= seen.quit.t + 1) {
        seen.quit.record = { paused: record.paused };
        click(card.findAll(element => element.tagName === 'BUTTON')[0]);
        seen.again = { t, at: c.s.time };
      }
    },
  }).then(run => ({ ...run, watched: seen }));
}
const alone = () => play('alone', null, playShow);

// What the set did and on which of its beats (as the log has it: the frame it fell in): its parts, its cuts, her words, the fader's
// moves, its cues and the party at its end.
const setLog = (run, start, end = Infinity) => run.world.chapterState.choirLog
  .filter(entry => ['section', 'cut', 'djLine', 'ride', 'cue', 'party', 'videoError'].includes(entry.type) && entry.at >= start - 1e-6 && entry.at <= end)
  .map(entry => ({ beat: (entry.at - start) / BEAT, what: [entry.type, entry.id ?? entry.shot ?? entry.kind ?? entry.level ?? entry.on ?? entry.message].join(' ') }));
/** Two logs of the set are one: the same things in the same order, each within a frame of the same beat. */
function sameSet(mine, theirs, what) {
  assert.deepEqual(mine.map(entry => entry.what), theirs.map(entry => entry.what), what);
  const late = mine.map((entry, k) => ({ ...entry, off: Math.abs(entry.beat - theirs[k].beat) })).filter(entry => entry.off > FRAME / BEAT + 1e-6);
  assert.deepEqual(late, [], `${what}: each on its beat, to the frame`);
}
const near = (a, b, most, what) => {
  const far = Math.hypot(...a.map((v, i) => v - b[i]));
  assert.ok(far <= most, `${what}: ${far.toFixed(3)} m apart (${a.map(v => v.toFixed(2))} and ${b.map(v => v.toFixed(2))})`);
};
/** Two stages are one: everyone in the same place facing the same way, the same ones showing, the same tap points and the same light. */
function sameStage(a, b, what, { light = true } = {}) {
  for (const who of ['mosi', 'egill', 'flugedla']) {
    near(a.actors[who].at, b.actors[who].at, 0.1, `${what}: ${who}`);
    assert.ok(apart(a.actors[who].heading, b.actors[who].heading) < 3, `${what}: ${who} faces ${a.actors[who].heading.toFixed(1)}, not ${b.actors[who].heading.toFixed(1)}`);
    assert.equal(a.actors[who].shown, b.actors[who].shown, `${what}: ${who} shows`);
  }
  near(a.her.at, b.her.at, 0.1, `${what}: Slóeðla`);
  near(a.her.head, b.her.head, 1.2, `${what}: her head`); // loosely: it bobs in the clip she rests in, and where that clip is, is no state
  assert.ok(apart(a.her.heading, b.her.heading) < 3, `${what}: she faces ${a.her.heading.toFixed(1)}, not ${b.her.heading.toFixed(1)}`);
  assert.deepEqual([a.her.shown, a.her.courage, a.her.step, a.her.moving], [b.her.shown, b.her.courage, b.her.step, b.her.moving], `${what}: she shows, brave, out in the pool, standing`);
  for (const group of GROUPS) {
    assert.deepEqual(a.members[group].map(b2 => b2.id), b.members[group].map(b2 => b2.id), `${what}: the same ${group} in the choir`);
    a.members[group].forEach((member, k) => {
      near(member.at, b.members[group][k].at, 0.02, `${what}: ${group} ${k} in its seat`);
      assert.ok(apart(member.heading, b.members[group][k].heading) < 1, `${what}: ${group} ${k} faces as in its seat`);
    });
  }
  assert.equal(a.arrivals.length, b.arrivals.length, `${what}: as many came along`);
  a.arrivals.forEach((one, k) => near(one.at, b.arrivals[k].at, 0.02, `${what}: arrival ${k}`));
  assert.deepEqual(Object.keys(a.pool), Object.keys(b.pool), `${what}: the pool's own`);
  for (const kind of Object.keys(a.pool)) a.pool[kind].forEach((one, k) => near(one.at, b.pool[kind][k].at, 0.02, `${what}: the pool's ${kind} ${k}`));
  assert.deepEqual(a.targets, b.targets, `${what}: the same things to tap`);
  assert.deepEqual(Object.keys(a.aims).sort(), Object.keys(b.aims).sort(), `${what}: the same tap points`);
  for (const name of Object.keys(a.aims)) near(a.aims[name], b.aims[name], 0.001, `${what}: ${name}`);
  assert.equal(a.shot, b.shot, `${what}: the shot`);
  near(a.camera, b.camera, 0.01, `${what}: the camera`);
  if (light) assert.deepEqual(a.light, b.light, `${what}: the light`);
}

test('the show alone starts on the set: a bar of the band, then the set\'s first beat, under three seconds from its start', async () => {
  const run = await alone();
  assert.equal(run.task.failed, false, String(run.task.error?.stack ?? run.task.error));
  const c = run.world.chapterState;
  const [first] = logOf(run, 'set');
  const began = run.world.chapterTimeline[0];
  assert.equal(began.scene, 6, 'it begins in the set\'s scene');
  const wait = first.start - began.at;
  assert.ok(Math.abs(wait - ALONE.lead * BEAT) <= FRAME + 1e-6, `the set comes in ${wait.toFixed(2)} s after the start: ${ALONE.lead} beats of the band`);
  assert.ok(wait <= 3, 'within three seconds');
  // on the band's turn of chords, the band whole as the choir left it, and blended out under the set as in the chapter
  assert.ok(Math.abs(first.beat / 16 - Math.round(first.beat / 16)) < 0.01, `the set starts on the loop's beat ${first.beat.toFixed(2)}`);
  const blend = logOf(run, 'band').find(entry => entry.blend);
  const theirs = logOf(await untouched(), 'band').find(entry => entry.blend);
  assert.deepEqual(blend.from, theirs.from, 'the band is as loud as the chapter has it when the set comes in');
  assert.equal(blend.seconds, theirs.seconds);
  assert.ok(c.set && run.watched.atSet.length >= 1);
  assert.equal(run.watched.atSet[0].band, true, 'the band plays as the set comes in');
});

test('the show alone starts with everyone where the chapter has them at the set\'s first beat, in the same light', async () => {
  const [run, chapterRun] = [await alone(), await untouched()];
  sameStage(run.watched.atSet[0].stage, chapterRun.watched.atSet, 'the show against the chapter');
  // and that is: all four showing, she out in the pool, the choir of five groups aimed, the afternoon
  const stage = run.watched.atSet[0].stage;
  assert.ok(stage.her.shown && Object.values(stage.actors).every(actor => actor.shown), 'all four show');
  near([stage.her.at[0], stage.her.at[2]], WADE.at, 0.1, 'she stands out in the pool');
  assert.deepEqual(stage.targets, GROUPS.map(group => `choir-${group}`).sort(), 'the five groups can be tapped, and nothing else');
  assert.equal(stage.light.cap, 0, 'the sun wears no cap yet');
  assert.equal(stage.shot, 'choir_wide');
});

test('the show alone plays the set as the chapter plays it: every part, cut, word, cue and move of the fader on the same beat', async () => {
  const [run, chapterRun] = [await alone(), await untouched()];
  const mine = setLog(run, run.watched.atSet[0].start, run.watched.card.at);
  const c = chapterRun.world.chapterState;
  const theirs = setLog(chapterRun, c.songStart, c.set.ended);
  assert.ok(theirs.length > 250, `${theirs.length} things happen in the chapter's set`);
  sameSet(mine, theirs, 'the set alone against the chapter\'s');
  assert.deepEqual(logOf(run, 'videoError'), [], 'and no part of the video failed');
  // through the game held for five seconds on the way (a book opened over the show, a hidden tab): the record stood still, and
  // is where the set is afterwards
  const { held, after } = run.watched;
  assert.ok(held.length > 60 && held.every(frame => frame.paused), 'the record stands still while the game is held');
  assert.equal(after.paused, false, 'and plays on');
  assert.ok(Math.abs(after.time - after.set) < 0.15, `the record is ${after.time.toFixed(2)} s in where the set is ${after.set.toFixed(2)} s in`);
});

test('the show alone says none of the story\'s lines and leaves the save as it was: no star, no map piece, no book', async () => {
  const run = await alone();
  for (const id of Object.keys(chapter.lines)) assert.equal(run.seen.spoken.has(id), false, `${id} is not said`);
  assert.ok(run.seen.said.length >= SET.lines.length && run.seen.said.every(line => typeof line.id === 'object'), 'only Flugeðla\'s words on the screen');
  assert.deepEqual(show.lines, {}, 'and none is fetched');
  assert.equal(JSON.stringify(run.save.get()), run.watched.saved, 'the save is untouched');
  assert.deepEqual(run.finds, [], 'nothing found');
  assert.deepEqual(run.moments, [], 'no map');
  assert.deepEqual(run.book.opened, [], 'no book');
  for (const name of ['star', 'journal', 'gramedlaRoar', 'falseHorn']) assert.equal(run.sounds.includes(name), false, `no ${name} is heard`);
  assert.equal(show.next ?? null, null, 'and no chapter follows it');
  assert.equal(show.startsItself, true, 'it starts as a video does');
});

test('the show alone ends on a card with Aftur and Hætta, over the pool in its dusk with the party far away', async () => {
  const run = await alone();
  const { card, atSet, quit, posted } = run.watched;
  assert.ok(card, 'the card comes');
  assert.deepEqual(card.words, ['Aftur', 'Hætta']);
  const length = card.at - atSet[0].start;
  assert.ok(Math.abs(length - (SET.endBeat * BEAT + 2.4)) < 0.2, `${length.toFixed(1)} s after the set's first beat: its last hit and its ring`);
  assert.deepEqual(run.world.chapterTimeline.slice(0, 2).map(mark => mark.scene), [6, 'end']);
  assert.ok(card.stage.light.cap > 0.9 && card.stage.light.haze !== atSet[0].stage.light.haze, 'it is dusk, the sun in its cap');
  assert.ok(card.band && card.party > 0, 'the party is heard on from far away');
  // "Hætta": silent at once, and the frame asks the book to close it
  assert.deepEqual(posted, ['mosi-syning-loka']);
  assert.deepEqual([quit.band, quit.song], [false, false], 'the band and the record stop');
  assert.equal(quit.record.paused, true);
  assert.equal(logOf(run, 'hush').length, 1);
});

test('the show alone plays again from the card: the afternoon back, everyone in place, the record from its top', async () => {
  const run = await alone();
  const { atSet, again } = run.watched;
  assert.ok(again && atSet.length === 2, 'a second showing begins');
  assert.equal(cardOf(run.doc), null, 'the card is gone');
  const wait = atSet[1].start - again.at;
  assert.ok(wait < 4, `its first beat ${wait.toFixed(1)} s after the tap`);
  sameStage(atSet[1].stage, atSet[0].stage, 'the second showing against the first');
  assert.notEqual(atSet[1].record, atSet[0].record, 'a new record');
  assert.equal(atSet[1].record.paused, false, 'playing');
  assert.equal(atSet[0].record.paused, true, 'and the first is silent');
  assert.equal(atSet[1].band, true, 'the band leads in again');
  const c = run.world.chapterState;
  const mine = setLog(run, atSet[1].start);
  const first = setLog(run, atSet[0].start, atSet[0].start + c.s.time - atSet[1].start);
  assert.ok(mine.length >= 3, 'the second showing is under way');
  sameSet(mine, first.slice(0, mine.length), 'the second showing as the first began');
  assert.equal(JSON.stringify(run.save.get()), run.watched.saved, 'and the save is still untouched');
});
