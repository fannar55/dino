// The show round chapter 5's music video (chapters/kafli5-show.js and its score, kafli5-show-score.js; the tools in engine/show/):
// the fireflies, the dusk, the splashes, the countdown's numbers, the glowing notes and the beat in the light. All of it is a
// function of the dance beat (kafli5-video.js), so most of this is plain arithmetic; the last tests draw it into a small world
// and play the chapter into the middle of the set and leave.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BURSTS, PUFFS, COUNTS, COUNT, countAt, DUSK, duskAt, CAP, capAt, FLASHES, LIFT, liftAt, NOTES, NOTE, noteAt, notePoint, SPLASHES, SPLASH, SPLASH_AIR,
  dropAt, splashRingAt, createFireflies, FIREFLIES, outAt, gatherAt, pulseAt, energyOf, beatRingsAt, BEAT_RING, padOf, BEAT_SECONDS,
} from '../chapters/kafli5-show-score.js';
import { createShow } from '../chapters/kafli5-show.js';
import { createDusk } from '../engine/show/dusk.js';
import { createBigNumber } from '../engine/show/big-number.js';
import { BENDS, danceBeatAt, sectionAt } from '../chapters/kafli5-video.js';
import { SONG } from '../chapters/kafli5-set.js';
import { CHOIR, GROUPS, WADE, seatsOf } from '../chapters/kafli5-pool.js';
import { FAR_POOL } from '../chapters/kafli4-route.js';
import * as kafli5 from '../chapters/kafli5.js';
import { playUnattended } from './chapter-harness.mjs';
import { FakeDocument } from './fake-dom.mjs';

const SET = SONG.set;
const part = id => SET.sections.find(section => section.id === id);
const FRAME = (1 / 30) / BEAT_SECONDS; // a frame of a tablet at 30 a second, in beats
const HER = WADE.at;
const fromHer = p => Math.hypot(p.x - HER[0], p.z - HER[1]);
/** Every frame of the set as the scene plays it: [{ setBeat, beat, frozen, rewinding, section }]. */
const framesOfTheSet = (() => {
  const frames = [];
  for (let setBeat = 0; setBeat <= SET.endBeat + 5; setBeat += FRAME) frames.push({ setBeat, ...danceBeatAt(setBeat), section: sectionAt(setBeat) });
  return frames;
})();

test('the bursts are the two big drops, and the other peak is a puff', () => {
  assert.deepEqual(BURSTS, [part('drop').startBeat, part('lastchorus').startBeat]);
  assert.deepEqual(PUFFS, [danceBeatAt(part('anthem').startBeat).beat], 'the anthem\'s peak, at the dance beat it is heard on');
  assert.equal(danceBeatAt(part('redrop').startBeat).beat, BURSTS[0], 'the drop after the rewind is the first burst again, by the clock alone');
});

test('the countdown: each number on its beat, big and clear, and gone well before the next', () => {
  assert.deepEqual(COUNTS.map(count => count.n), [5, 4, 3, 2, 1]);
  COUNTS.forEach(({ beat, n }, k) => {
    assert.equal(SET.cues.find(cue => cue.kind === 'count' && cue.n === n).beat, beat);
    assert.equal(countAt(beat - 0.01)?.n ?? null, k ? null : null, `nothing just before ${n}`);
    const on = countAt(beat + 0.6);
    assert.deepEqual([on.n, on.scale, on.opacity], [n, 1, 1], `${n} stands whole in the middle of its time`);
    assert.ok(countAt(beat).scale < 0.5 && countAt(beat).opacity === 0, 'it pops in from small');
    assert.ok(countAt(beat + COUNT.pop * 0.7).scale > 1, 'a little past its size on the way');
    assert.equal(countAt(beat + COUNT.on), null);
    const next = COUNTS[k + 1]?.beat ?? part('drop').startBeat;
    assert.ok(next - (beat + COUNT.on) >= 0.6, 'the animals are seen between two numbers');
    assert.ok(COUNT.on * BEAT_SECONDS >= 0.6, 'long enough for a child to read a digit');
  });
  for (const { beat, frozen } of framesOfTheSet) {
    const count = countAt(beat);
    assert.ok(!count || (beat >= COUNTS[0].beat && beat < COUNTS.at(-1).beat + COUNT.on), 'no number outside the countdown, the rewind included');
    assert.ok(!frozen || !count);
  }
  // with less motion: half the size, and only a fade
  for (let age = 0; age < COUNT.on; age += 0.05) {
    const { scale, opacity } = countAt(COUNTS[0].beat + age, { reduced: true });
    assert.equal(scale, 0.5);
    assert.ok(opacity >= 0 && opacity <= 1);
  }
});

test('the dusk sinks as her horn begins, holds through the build, and the day is back as the drop lands and ever after', () => {
  const [from, to] = [part('break').startBeat, part('drop').startBeat];
  for (let beat = -4; beat <= from; beat += 0.5) assert.equal(duskAt(beat), 0);
  assert.ok(duskAt(from + DUSK.sink / 2) > 0.3 && duskAt(from + DUSK.sink / 2) < 0.7);
  for (let beat = from + DUSK.sink; beat <= to - DUSK.back; beat += 0.25) assert.equal(duskAt(beat), 1, `deep at ${beat}`);
  assert.equal(duskAt(to), 0, 'the day is back on the drop\'s first beat');
  assert.ok(DUSK.back * BEAT_SECONDS < 0.15, '"at once"');
  let last = 0;
  for (const { beat, setBeat } of framesOfTheSet) {
    const dusk = duskAt(beat);
    assert.ok(dusk >= 0 && dusk <= 1);
    if (setBeat >= to) assert.equal(dusk, 0, `no dusk after the drop (the set's beat ${setBeat.toFixed(2)}: the rewind and all)`);
    if (setBeat < to - DUSK.back) assert.ok(Math.abs(dusk - last) < 0.03, 'it sinks slowly');
    last = dusk;
  }
});

test('the soft flashes: on the peaks and the band\'s hits, never two in a second, and a fade each', () => {
  for (const peak of [...BURSTS, ...PUFFS]) assert.equal(FLASHES.find(flash => flash.beat === peak)?.strength, 1);
  FLASHES.slice(1).forEach((flash, k) => {
    assert.ok(flash.beat - FLASHES[k].beat >= LIFT.beats, `${FLASHES[k].beat} and ${flash.beat}`);
    assert.ok((flash.beat - FLASHES[k].beat) * BEAT_SECONDS >= 0.5, 'never faster than twice a second');
  });
  for (const { beat, strength } of FLASHES) {
    assert.equal(liftAt(beat), strength);
    assert.ok(liftAt(beat + LIFT.beats / 2) < strength / 2);
    assert.ok(liftAt(beat - 0.01) < 0.01, 'the one before has faded');
  }
  // as the scene plays it, the freeze included (it stands on one beat: one level), a flash never rises twice within half a second
  let rises = [];
  let last = 0;
  framesOfTheSet.forEach(({ beat }, k) => {
    const lift = liftAt(beat);
    assert.ok(lift >= 0 && lift <= 1);
    if (lift > last + 0.2) rises.push(k);
    last = lift;
  });
  rises.slice(1).forEach((k, n) => assert.ok((k - rises[n]) / 30 >= 0.5, `two flashes ${((k - rises[n]) / 30).toFixed(2)} s apart`));
});

test('the backbeat and the rings of light on the water', () => {
  assert.equal(pulseAt(1), 1);
  assert.equal(pulseAt(3), 1);
  assert.ok(pulseAt(2.9) < 0.02 && pulseAt(0) < 0.1, 'only the bar\'s second and fourth beats');
  assert.equal(energyOf('break'), 0, 'the quiet part is quiet');
  assert.equal(energyOf(undefined), 0);
  for (const section of SET.sections) assert.ok(energyOf(section.id) >= 0 && energyOf(section.id) <= 1 && section.id in { ...Object.fromEntries(SET.sections.map(s => [s.id, 1])) });
  const at = beat => { const rings = []; beatRingsAt(beat, 1, (x, z, radius, width, level) => rings.push({ x, z, radius, width, level })); return rings; };
  assert.equal(at(100.5).length, BEAT_RING.life / BEAT_RING.every, 'two at a time');
  assert.ok(BEAT_RING.every * BEAT_SECONDS >= 0.5, 'a new ring no oftener than twice a second');
  const [young, old] = at(100.5);
  assert.deepEqual([young.x, young.z], HER, 'from under her on a bar\'s first beat');
  assert.deepEqual([old.x, old.z], FAR_POOL.center, 'from the pool\'s middle on its third');
  assert.ok(old.radius > young.radius && old.level < young.level, 'it spreads and fades');
  assert.ok(at(100.5).every(ring => ring.radius < FAR_POOL.radius), 'inside the pool');
  let rings = 0;
  beatRingsAt(250, energyOf('break'), () => rings++);
  assert.equal(rings, 0, 'none in the quiet part');
});

test('the notes: her tune flies from each group to her crest, her horn rises into the sky in the quiet part and answers the groups after it', () => {
  for (const { group, beat } of SET.tune) {
    const note = NOTES.find(n => n.from === group && n.to === 'crest' && n.beat === danceBeatAt(beat).beat);
    assert.ok(note, `${group} at ${beat}`);
    assert.equal(note.life, NOTE.fly);
  }
  const horns = SET.cues.filter(cue => cue.kind === 'horn');
  const quiet = horns.filter(cue => sectionAt(cue.beat).id === 'break');
  assert.ok(quiet.length >= 8);
  for (const cue of quiet) assert.ok(NOTES.some(n => n.from === 'crest' && n.to === 'sky' && n.beat === cue.beat), `a note into the sky at ${cue.beat}`);
  const answers = NOTES.filter(n => n.from === 'crest' && n.to !== 'sky');
  assert.equal(answers.length, horns.length - quiet.length);
  assert.ok(answers.every(n => GROUPS.includes(n.to)));
  for (const id of ['anthem', 'lastchorus']) {
    const to = new Set(answers.filter(n => sectionAt(n.beat >= BENDS.rewind.to - 12 && n.beat < BENDS.freeze.from - 12 ? n.beat + 12 : n.beat).id === id).map(n => n.to));
    assert.ok(to.size >= 3, `her answers in ${id} go out to several groups (${[...to]})`);
  }
  const last = answers.filter(n => n.beat >= part('end').startBeat).map(n => n.to);
  assert.deepEqual(last, GROUPS.slice(0, last.length), 'the last hits: group after group, low to high');
  // a note's life: on its beat it is where it starts, it is over its way's middle half way, and it lands and glows
  const note = NOTES.find(n => n.to === 'crest');
  const [a, b] = [[0, 1, 0], [10, 3, 4]];
  assert.equal(noteAt(note, note.beat - 0.01), null);
  assert.deepEqual(noteAt(note, note.beat), { u: 0, glow: 0 });
  assert.deepEqual(notePoint(note, a, b, 0, []), a);
  assert.deepEqual(notePoint(note, a, b, 1, []).map(v => +v.toFixed(9)), b);
  assert.ok(notePoint(note, a, b, 0.5, [])[1] > 2 + NOTE.arc - 0.01, 'an arc');
  assert.ok(noteAt(note, note.beat + NOTE.fly + 0.1).glow > 0.8, 'the light where it lands');
  assert.equal(noteAt(note, note.beat + NOTE.fly + NOTE.glow), null);
  const up = NOTES.find(n => n.to === 'sky');
  assert.ok(notePoint(up, a, a, 1, [])[1] - a[1] === NOTE.climb && noteAt(up, up.beat + NOTE.rise) === null);
  for (let u = 0; u < 1; u += 0.02) { // no jump on either way
    for (const n of [note, up]) assert.ok(Math.hypot(...notePoint(n, a, b, u + 0.02, []).map((v, k) => v - notePoint(n, a, b, u, [])[k])) < 0.8);
  }
});

test('the splashes: crowns of drops all round the pool on the bursts, and a small one where a frog lands', () => {
  const crowns = SPLASHES.filter(splash => splash.drops > 6);
  assert.equal(crowns.length, SPLASH.crowns * (BURSTS.length + 1), 'on each burst and on the last hit');
  for (const burst of BURSTS) {
    const round = crowns.filter(splash => splash.beat >= burst && splash.beat < burst + 0.25);
    assert.equal(round.length, SPLASH.crowns, `with the drop at ${burst}`);
    const angles = round.map(({ at }) => Math.atan2(at[1] - FAR_POOL.center[1], at[0] - FAR_POOL.center[0])).sort((x, y) => x - y);
    angles.slice(1).forEach((angle, k) => assert.ok(angle - angles[k] < 1, 'all round'));
    for (const { at } of round) {
      const far = Math.hypot(at[0] - FAR_POOL.center[0], at[1] - FAR_POOL.center[1]);
      assert.ok(far < FAR_POOL.radius * 0.85 && far > FAR_POOL.radius * 0.6, 'in the water near its rim');
    }
  }
  const out = {};
  for (const splash of SPLASHES) {
    let top = 0;
    for (let j = 0; j < splash.drops; j++) {
      for (let age = 0; age < SPLASH_AIR; age += 0.05) {
        const drop = dropAt(splash, j, age, out);
        if (drop) top = Math.max(top, drop.y);
      }
      assert.equal(dropAt(splash, j, SPLASH_AIR + 0.01, out), false, 'down again');
      assert.equal(dropAt(splash, j, -0.01, out), false);
    }
    if (splash.drops) assert.ok(top <= (splash.drops > 6 ? SPLASH.height : 0.5) + 0.01 && top > (splash.drops > 6 ? 1.5 : 0.2), `as high as ${top.toFixed(2)} m`);
    assert.equal(splashRingAt(splash, SPLASH.ring), null);
    assert.ok(splashRingAt(splash, 1).radius > splashRingAt(splash, 0).radius && splashRingAt(splash, 3).level < splashRingAt(splash, 1).level);
  }
  const pads = seatsOf('frogs').map(seat => seat.at);
  const frogs = SET.cues.filter(cue => cue.kind === 'call' && cue.group === 'frogs');
  for (const call of frogs) {
    assert.ok(pads.some(pad => pad[0] === padOf(call.beat)[0] && pad[1] === padOf(call.beat)[1]));
    const beat = danceBeatAt(call.beat).beat + SPLASH.frogAfter;
    assert.ok(SPLASHES.some(splash => splash.beat === beat && splash.at === padOf(call.beat)), `a ring at a lily pad as the frog of ${call.beat} lands`);
  }
  assert.equal(new Set(frogs.map(call => padOf(call.beat))).size, pads.length, 'every pad has its turn');
  // the grazers' stomps: a ring out over the water from the bank at their feet, and no drops
  const stomps = SET.cues.filter(cue => cue.kind === 'call' && cue.group === 'grazers' && sectionAt(cue.beat).id === 'grazers');
  assert.ok(stomps.length >= 8);
  for (const stomp of stomps) {
    const ring = SPLASHES.find(splash => splash.beat === stomp.beat && splash.drops === 0);
    assert.ok(ring, `a ring on the stomp at ${stomp.beat}`);
    assert.ok(Math.hypot(ring.at[0] - FAR_POOL.center[0], ring.at[1] - FAR_POOL.center[1]) < FAR_POOL.radius, 'on the water');
    assert.ok(Math.hypot(ring.at[0] - CHOIR.grazers.at[0], ring.at[1] - CHOIR.grazers.at[1]) < 9, 'at their feet');
  }
});

test('the fireflies: out of the reed, round her in the quiet part, out over the whole pool on the drop, and never a jump', () => {
  const flies = createFireflies();
  assert.equal(flies.count, FIREFLIES.count);
  const all = (beat, energy = 1) => Array.from({ length: flies.count }, (_, i) => flies.at(i, beat, energy, {}));
  const lit = swarm => swarm.filter(fly => fly.level > 0.05);
  // the same beat is the same picture, whatever was asked before
  const once = all(301.3);
  all(12);
  all(440);
  assert.deepEqual(all(301.3), once);
  // none before the set; the first rise out of the reeds as it starts
  assert.equal(lit(all(0)).length, 0);
  const first = lit(all(3));
  assert.ok(first.length >= 3 && first.length < flies.count / 4, `${first.length} at beat 3`);
  for (const fly of first) {
    const near = Math.min(...FAR_POOL.reeds.map(reed => Math.hypot(fly.x - reed.at[0], fly.z - reed.at[1]) - reed.radius));
    assert.ok(near < 10 && fly.y < FAR_POOL.level + 4.5, 'still by its reed, low');
  }
  assert.ok(lit(all(16)).length > first.length, 'more as the set goes on');
  assert.ok(outAt(60) < outAt(236) && outAt(250) === 1 && outAt(296) === 1, 'all of them out for her horn');
  // round her in the quiet part and the build: most of them, all near her, over the water, drawn in before the drop
  // (the last of them are still streaming to her from the reed as her horn begins)
  for (const [beat, share] of [[248, 0.6], [264, 0.9], [290, 0.95]]) {
    const round = lit(all(beat));
    assert.ok(round.length > flies.count * 0.85, `${round.length} at ${beat}`);
    const near = round.filter(fly => fromHer(fly) < 9);
    assert.ok(near.length >= round.length * share, `${near.length} of ${round.length} within 9 m of her at ${beat}`);
    assert.ok(round.every(fly => fly.y > FAR_POOL.level + 0.3 && fly.y < FAR_POOL.level + 9));
  }
  assert.equal(gatherAt(250), 1);
  assert.equal(gatherAt(200), 0);
  const mean = swarm => swarm.reduce((sum, fly) => sum + fromHer(fly), 0) / swarm.length;
  assert.ok(mean(lit(all(294))) < mean(lit(all(250))), 'tighter as the count goes');
  // the burst: every one, from where it was in the swarm, out over the whole pool in two beats, in the confetti's colours
  const [burst] = BURSTS;
  assert.ok(Math.max(...all(burst - 1e-4).map((fly, i) => Math.hypot(fly.x - all(burst)[i].x, fly.y - all(burst)[i].y, fly.z - all(burst)[i].z))) < 0.05, 'it starts where they are');
  const flung = all(burst + 2);
  assert.equal(lit(flung).length >= flies.count * 0.9, true);
  assert.ok(mean(flung) > 2.5 * mean(all(burst)), `from ${mean(all(burst)).toFixed(1)} m to ${mean(flung).toFixed(1)} m in two beats`);
  assert.ok(flung.filter(fly => fromHer(fly) > 14).length > flies.count / 5 && Math.max(...flung.map(fly => fly.y)) > FAR_POOL.level + 8, 'far and high');
  assert.ok(flung.every(fly => fromHer(fly) < FAR_POOL.radius + 6), 'over the pool and its banks');
  const colours = swarm => new Set(swarm.map(fly => [fly.r, fly.g, fly.b].map(v => v.toFixed(2)).join()));
  assert.ok(colours(flung).size > colours(all(250)).size, 'more colours on the burst');
  assert.ok(all(burst + 0.5).reduce((sum, fly) => sum + fly.size, 0) > 1.5 * all(250, 0).reduce((sum, fly) => sum + fly.size, 0), 'and bigger');
  // again on the second drop, and the last chorus has them all, biggest
  assert.ok(mean(all(BURSTS[1] + 2)) > 2.5 * mean(all(BURSTS[1])));
  assert.equal(lit(all(BURSTS[1] + 16)).length >= flies.count * 0.9, true);
  assert.ok(lit(all(380)).length < lit(all(BURSTS[1] + 16)).length, 'densest in the last chorus');
  // gone after the last hit has rung
  assert.equal(lit(all(SET.endBeat + 4.5)).length, 0);

  // as the scene plays it, frame by frame: no firefly jumps (but with the snap out of the freeze, when the whole picture does),
  // it stands still in Stoppdans, and it goes back the way it came in the rewind
  const fly = {};
  let before = null;
  let worst = { calm: 0, burst: 0 };
  for (const frame of framesOfTheSet) {
    const now = [];
    for (let i = 0; i < flies.count; i += 3) {
      flies.at(i, frame.beat, energyOf(frame.section?.id), fly);
      now.push([fly.x, fly.y, fly.z, fly.level]);
    }
    const snap = before && before.frame.frozen && !frame.frozen;
    if (before && !snap) {
      const bursting = BURSTS.some(beat => Math.min(frame.beat, before.frame.beat) < beat + 4 && Math.max(frame.beat, before.frame.beat) >= beat);
      now.forEach((p, k) => {
        if (p[3] <= 0.01 && before.now[k][3] <= 0.01) return;
        const moved = Math.hypot(p[0] - before.now[k][0], p[1] - before.now[k][1], p[2] - before.now[k][2]);
        if (bursting) worst.burst = Math.max(worst.burst, moved);
        else worst.calm = Math.max(worst.calm, moved);
        if (frame.frozen && before.frame.frozen) assert.equal(moved, 0, 'still in Stoppdans');
      });
    }
    before = { frame, now };
  }
  assert.ok(worst.calm < 0.45, `the fastest a firefly drifts is ${worst.calm.toFixed(2)} m a frame`);
  assert.ok(worst.burst < 6.5, `and in a burst (twice as fast in the rewind) ${worst.burst.toFixed(2)} m a frame`);
  const [out, back] = [BENDS.rewind.from - 2, BENDS.rewind.from + 1]; // two beats before the rewind, and one beat (two back) into it
  assert.equal(danceBeatAt(back).beat, out);
  assert.deepEqual(all(danceBeatAt(back).beat), all(out), 'the rewind is the same picture again');
});

test('the fireflies with less motion: half of them, half the size, drifting where they are', () => {
  const calm = createFireflies({ count: FIREFLIES.count / 2, reduced: true });
  const full = createFireflies();
  assert.equal(calm.count, full.count / 2);
  const all = beat => Array.from({ length: calm.count }, (_, i) => calm.at(i, beat, 1, {}));
  assert.ok(Math.max(...all(300).map(fly => fly.size)) <= FIREFLIES.size * 1.25 / 2 + 1e-9, 'half the size');
  const mean = swarm => swarm.reduce((sum, fly) => sum + fromHer(fly), 0) / swarm.length;
  assert.ok(Math.abs(mean(all(275)) - mean(all(300))) < 2 && mean(all(275)) > 12, 'no swarm and no burst');
  assert.deepEqual(all(300).map(fly => fly.size), all(301).map(fly => fly.size), 'no beat in their light');
  let worst = 0;
  for (let beat = 290; beat < 300; beat += FRAME) {
    all(beat).forEach((fly, i) => { const next = calm.at(i, beat + FRAME, 1, {}); worst = Math.max(worst, Math.hypot(next.x - fly.x, next.y - fly.y, next.z - fly.z)); });
  }
  assert.ok(worst < 0.2, `no fast moves (${worst.toFixed(2)} m a frame)`);
});

// ---------------------------------------------------------------------------------------------
// Drawn: a small world with the light a page's world has

function smallWorld({ reduced = false, params = null } = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#e0d5c2', 0.016);
  scene.environmentIntensity = 0.77;
  const colour = hex => ({ value: new THREE.Color(hex) });
  const world = {
    THREE, scene, camera: new THREE.PerspectiveCamera(50, 1.6, 0.1, 1200), params,
    lighting: { sun: new THREE.DirectionalLight('#ffce95', 2.87), hemi: new THREE.HemisphereLight('#cbdcef', '#676038', 0.55) },
    sky: { dome: { material: { uniforms: { uZenith: colour('#6c9bd3'), uHorizon: colour('#f4d9af'), uGlow: colour('#ffdca8'), uCloud: colour('#fff6e9'), uCloudShade: colour('#d7c4b6'), uFogColor: colour('#e0dacb'), uFogSun: colour('#f7cf9b'), uFogSunStrength: { value: 0.94 } } } } },
    forest: { materials: { water: { uniforms: { uHorizon: colour('#f4d9af'), uZenith: colour('#6c9bd3') } } }, ripples: [], rippleAt(x, z, strength) { this.ripples.push([x, z, strength]); } },
    renderer: { toneMappingExposure: 1, getDrawingBufferSize: v => v.set(1280, 800) },
    heightAt: () => FAR_POOL.level + 0.4,
  };
  const doc = new FakeDocument(['view']);
  doc.body.append(doc.getElementById('view') ?? doc.add('view'), doc.add('caption')); // the canvas, and what stands over the game
  world.page = doc;
  const head = new THREE.Vector3(HER[0], FAR_POOL.level + 3, HER[1]);
  const c = {
    world, reduced, aims: Object.fromEntries(GROUPS.map(group => [`choir-${group}`, [CHOIR[group].at[0], FAR_POOL.level + 1, CHOIR[group].at[1]]])),
    sloedla: { raw: { headPosition: out => out.copy(head) } },
  };
  /** Everything the dusk may touch, as numbers. */
  const light = () => JSON.stringify([
    world.lighting.sun.color.toArray(), world.lighting.sun.intensity, world.lighting.hemi.color.toArray(), world.lighting.hemi.groundColor.toArray(),
    world.lighting.hemi.intensity, scene.fog.color.toArray(), scene.environmentIntensity, world.renderer.toneMappingExposure,
    Object.values(world.sky.dome.material.uniforms).map(u => u.value.toArray?.() ?? u.value), Object.values(world.forest.materials.water.uniforms).map(u => u.value.toArray()),
    world.lighting.sun.position.toArray(),
  ]);
  const numbers = () => doc.body.children.filter(el => el.classList.contains('big-number'));
  return { world, c, doc, light, numbers };
}
const video = setBeat => ({ setBeat, ...danceBeatAt(setBeat), section: sectionAt(setBeat) });
const drawn = show => ({
  lights: Array.from({ length: show.parts.lights.count }, (_, i) => show.parts.lights.read(i)),
  rings: Array.from({ length: show.parts.rings.count }, (_, i) => show.parts.rings.read(i)),
});

test('the show draws the same picture at the same beat, with two draw calls and next to no triangles', () => {
  const { world, c } = smallWorld();
  const before = world.scene.children.length;
  const show = createShow(c);
  assert.equal(world.scene.children.length - before, 2, 'the lights and the rings: two objects, a draw call each');
  const { lights, rings } = show.parts;
  assert.ok(lights.object.isPoints && !lights.object.castShadow && !rings.object.castShadow, 'points, and no shadow casters');
  show.update(video(300));
  const once = drawn(show);
  show.update(video(250));
  show.update(video(20));
  show.update(video(300));
  assert.deepEqual(drawn(show), once);
  // the rewind: one beat (two back) into it is the picture of two beats before it; Stoppdans: one picture all the way
  show.update(video(BENDS.rewind.from - 2));
  const out = drawn(show);
  show.update(video(BENDS.rewind.from + 1));
  assert.deepEqual(drawn(show), out);
  show.update(video(BENDS.freeze.from + 0.1));
  const frozen = drawn(show);
  show.update(video(BENDS.freeze.to - 0.1));
  assert.deepEqual(drawn(show), frozen);
  assert.ok(frozen.lights.length > FIREFLIES.count / 2, 'the fireflies hang in the air');
  // the whole set: never more lights than there is room for (none is dropped), and at most a few dozen triangles
  let most = { lights: 0, rings: 0 };
  for (const frame of framesOfTheSet.filter((_, k) => k % 3 === 0)) {
    show.update(frame);
    most = { lights: Math.max(most.lights, lights.count), rings: Math.max(most.rings, rings.count) };
    assert.equal(rings.object.geometry.instanceCount, rings.count);
    assert.equal(lights.object.geometry.drawRange.count, lights.count);
  }
  assert.ok(most.lights < lights.capacity, `${most.lights} lights at most, of ${lights.capacity}`);
  assert.ok(most.rings < rings.capacity && most.rings * 2 <= 80, `${most.rings} rings at most: ${most.rings * 2} triangles`);
  show.dispose();
});

test('the show in the set: the first fireflies, the notes, the frogs\' rings, the numbers on the page', () => {
  const { world, c, doc, numbers } = smallWorld();
  const show = createShow(c);
  const { lights, rings, number } = show.parts;
  show.update(video(0));
  assert.equal(lights.count, 0, 'nothing as the set starts');
  assert.equal(numbers().length, 0, 'and nothing on the page until a number shows');
  show.update(video(12));
  assert.ok(lights.count > 10);
  // a note of her tune on its way from the lizards to her crest: a bright head half way, over the straight line
  const note = SET.tune[0];
  show.update(video(note.beat + NOTE.fly / 2));
  const from = c.aims[`choir-${note.group}`];
  const head = drawn(show).lights.filter(light => light.shape[0] > 1.5);
  assert.equal(head.length, 1);
  assert.ok(Math.abs(head[0].position[0] - (from[0] + HER[0]) / 2) < 0.5 && head[0].position[1] > FAR_POOL.level + 3.5, 'half way, on its arc');
  // in the quiet part notes rise from her crest
  const horn = SET.cues.find(cue => cue.kind === 'horn' && sectionAt(cue.beat).id === 'break');
  show.update(video(horn.beat + 3));
  assert.ok(drawn(show).lights.some(light => Math.hypot(light.position[0] - HER[0], light.position[2] - HER[1]) < 1 && light.position[1] > FAR_POOL.level + 3.8 + 4), 'a note high over her crest');
  // a frog's call: the water's own ring at its pad at once (the cue), and the show's white ring there as it lands
  const call = SET.cues.find(cue => cue.kind === 'call' && cue.group === 'frogs' && sectionAt(cue.beat).id === 'frogs');
  show.cue(call);
  assert.deepEqual(world.forest.ripples.at(-1).slice(0, 2), padOf(call.beat));
  show.cue({ kind: 'call', group: 'grazers', beat: call.beat });
  show.cue({ kind: 'peak', beat: 296 });
  assert.equal(world.forest.ripples.length, 1, 'only the frogs');
  show.update(video(call.beat + SPLASH.frogAfter + 0.5));
  const pad = padOf(call.beat);
  assert.ok(drawn(show).rings.some(ring => ring.centre[0] === Math.fround(pad[0]) && ring.centre[2] === Math.fround(pad[1]) && ring.shape[2] === 0), 'a ring at the pad');
  assert.ok(drawn(show).rings.some(ring => ring.shape[2] === 1 && ring.centre[0] === Math.fround(CHOIR.frogs.at[0])), 'and the light under the frogs, whose part it is');
  // the numbers: one element right after the canvas, the digit she calls, no taps taken
  for (const { beat, n } of COUNTS) {
    show.update(video(beat + 0.5));
    assert.equal(numbers().length, 1);
    const [el] = numbers();
    assert.equal(el.children[0].textContent, String(n));
    assert.equal(number.shown.text, String(n));
    assert.ok(el.style.cssText.includes('pointer-events: none'), 'a tap goes through it to the animals');
    assert.equal(el.style.display, 'flex');
    assert.equal(doc.body.children[doc.body.children.indexOf(el) - 1].id, 'view', 'over the game, under everything else');
    show.update(video(beat + 1.5));
    assert.equal(number.shown, null);
    assert.equal(el.style.display, 'none', 'gone before the next');
  }
  show.update(video(BURSTS[0] + 0.5));
  assert.equal(number.shown, null);
  assert.ok(rings.count >= SPLASH.crowns, 'the crowns\' rings on the drop');
  assert.ok(drawn(show).lights.filter(light => light.shape[1] > 0.7).length > SPLASH.crowns * 6, 'and their drops in the air');
  show.dispose();
  assert.equal(numbers().length, 0);
});

test('the dusk: darker and warmer in the quiet part, the day back on the drop, and everything exactly as it was after', () => {
  const { world, c, light } = smallWorld();
  const was = light();
  const show = createShow(c);
  assert.equal(light(), was, 'making the show changes nothing');
  assert.deepEqual(show.parts.dusk.held, { colours: 13, numbers: 4 }, 'the sun, the fill, the haze, the sky, the water, the exposure');
  show.update(video(100));
  assert.equal(light(), was, 'the afternoon, between two flashes');
  show.update(video(250));
  assert.notEqual(light(), was);
  const { sun, hemi } = world.lighting;
  assert.ok(sun.intensity < 2.87 * 0.6 && world.renderer.toneMappingExposure < 0.95 && world.scene.environmentIntensity < 0.77 * 0.75, 'darker');
  assert.ok(sun.color.b / sun.color.r < new THREE.Color('#ffce95').b / 1 - 0.1, 'warmer');
  assert.ok(hemi.intensity < 0.55 && world.sky.dome.material.uniforms.uZenith.value.b < new THREE.Color('#6c9bd3').b);
  show.update(video(BURSTS[0] + LIFT.beats)); // the drop, its flash over
  assert.equal(light(), was, 'the day is back');
  show.update(video(BURSTS[0]));
  assert.ok(world.renderer.toneMappingExposure > 1 && world.renderer.toneMappingExposure <= 1.1 + 1e-9, 'a soft lift on the drop');
  // left in the middle of the dusk, a number on the screen: everything back, to the last bit
  show.update(video(COUNTS[2].beat + 0.5));
  assert.notEqual(light(), was);
  show.dispose();
  assert.equal(light(), was);
  assert.equal(world.scene.children.length, 0);
  show.dispose(); // twice does no harm
  show.update(video(250)); // nor a frame after it
  assert.equal(light(), was);
  // the dusk by itself: any order, the same light for the same numbers, and restore
  const dusk = createDusk(world);
  dusk.set(0.7, 0.3);
  const some = light();
  dusk.set(1, 0);
  dusk.set(0.2, 1);
  dusk.set(0.7, 0.3);
  assert.equal(light(), some);
  dusk.restore();
  assert.equal(light(), was);
  // a world with no light of its own (a test's, a capture's) is left alone
  assert.deepEqual(createDusk({}).held, { colours: 0, numbers: 0 });
  assert.doesNotThrow(() => createDusk({}).set(1, 1));
});

test('with less motion: no beat, no flash, half the dusk, half the fireflies, the number small', () => {
  const { world, c } = smallWorld({ reduced: true });
  const show = createShow(c);
  show.update(video(70.5)); // the dance floor: nobody calls, so no splash either
  assert.equal(show.parts.rings.count, 0, 'no rings on the beat');
  show.update(video(part('grazers').startBeat + 2.5));
  assert.ok(drawn(show).rings.every(ring => ring.shape[2] === 0), 'no light under a group');
  assert.ok(show.parts.lights.count <= FIREFLIES.count / 2);
  show.update(video(BURSTS[0]));
  assert.equal(world.renderer.toneMappingExposure, 1, 'no flash');
  show.update(video(250));
  assert.ok(Math.abs(show.parts.dusk.depth - 0.5) < 1e-9);
  show.update(video(COUNTS[0].beat + 0.6));
  assert.equal(show.parts.number.shown.scale, 0.5);
  show.dispose();
});

test('the address can leave the show out, and a page without a place for a number still plays', () => {
  const off = smallWorld({ params: new URLSearchParams('syning=0') });
  const none = createShow(off.c);
  none.update(video(250));
  none.cue({ kind: 'peak', beat: 296 });
  none.dispose();
  assert.equal(off.world.scene.children.length, 0);
  const number = createBigNumber(null);
  assert.doesNotThrow(() => { number.show('3', { scale: 1, opacity: 1 }); number.hide(); number.dispose(); });
});

test('the chapter left in the middle of the build (dusk, a number on the screen): nothing of the show is left behind', async () => {
  const lights = world => world.scene.children.filter(object => object.name.startsWith('kafli5 show'));
  const seen = { light: null, dusk: false, number: false, shows: 0 };
  let light = null;
  const numbers = doc => doc.body.children.filter(el => el.classList.contains('big-number'));
  const run = await playUnattended(kafli5, {
    seeking: true, limit: 900, shaped: true,
    onFrame({ world, stage }) {
      if (seen.left) return;
      if (!light) { // a page's light, before the set
        world.lighting.sun = new THREE.DirectionalLight('#ffce95', 2.87);
        world.lighting.hemi = new THREE.HemisphereLight('#cbdcef', '#676038', 0.55);
        world.renderer.toneMappingExposure = 1;
        light = () => JSON.stringify([world.lighting.sun.color.toArray(), world.lighting.sun.intensity, world.lighting.hemi.color.toArray(), world.lighting.hemi.intensity, world.renderer.toneMappingExposure]);
        seen.light = light();
      }
      const c = world.chapterState;
      if (!c?.video || !Number.isFinite(c.songStart)) return;
      seen.shows = Math.max(seen.shows, lights(world).length);
      if (light() !== seen.light) seen.dusk = true;
      if (numbers(world.page).some(el => el.style.display === 'flex')) seen.number = true;
      if (c.video.setBeat >= COUNTS[2].beat + 0.5) { // "Þrír!" is on the screen: the child leaves
        assert.ok(seen.dusk && seen.number && seen.shows === 2);
        assert.notEqual(light(), seen.light);
        stage.stop();
        seen.left = { light: light(), lights: lights(world).length, numbers: numbers(world.page).length };
      }
    },
  });
  assert.ok(run.world.chapterState.songStart > 0);
  assert.deepEqual(seen.left, { light: seen.light, lights: 0, numbers: 0 });
});

test('the sun wears its nightcap in the dusk: on as it falls, off as the day comes back, and off when the show is left', () => {
  const { c } = smallWorld();
  const worn = [];
  c.sun = { cap: amount => worn.push(amount) };
  const show = createShow(c);
  const at = beat => { show.update(video(beat)); return worn.at(-1); };
  assert.equal(at(100), 0, 'by day: no cap');
  assert.equal(at(250), 1, 'in the quiet part: on its head');
  assert.equal(at(250), capAt(250));
  const from = part('break').startBeat;
  assert.equal(at(from + CAP.from), 0, 'the dusk sinks for a bar first');
  const falling = at(from + CAP.from + CAP.beats / 2);
  assert.ok(falling > 0.3 && falling < 0.7, `coming down as the dusk falls: ${falling}`);
  assert.equal(at(from + DUSK.sink), 1, 'on its head when the dusk is deep');
  for (let beat = from, last = 0; beat <= from + DUSK.sink; beat += FRAME) {
    const now = capAt(beat);
    assert.ok(now >= last && now - last < 0.05, `no jump at ${beat}`);
    last = now;
  }
  assert.equal(at(part('drop').startBeat), 0, 'the day is back on the drop');
  at(260);
  show.dispose();
  assert.equal(worn.at(-1), 0, 'left in the dusk: the cap comes off');
});

test('with less motion the dusk is half as deep, but the cap is whole; and a chapter state with no sun plays on', () => {
  const { c } = smallWorld({ reduced: true });
  const worn = [];
  c.sun = { cap: amount => worn.push(amount) };
  const show = createShow(c);
  show.update(video(250));
  assert.equal(worn.at(-1), 1);
  show.dispose();
  const bare = createShow(smallWorld().c);
  bare.update(video(250));
  bare.dispose();
});
