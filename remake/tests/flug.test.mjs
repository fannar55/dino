// The flight alone (chapters/flug.js, ?chapter=flug): chapter 4's flight on Flugeðla's back as a film, beats A to G in about 170 s, with
// Egill riding, Mosi's two cameos, every shot of spec section 5 and the synthesized wind bed. It plays to the end unattended with no
// warnings, on schedule, holds still and silent through a pause, plays calmer under reduced motion, and a seek lands where the play does.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { playUnattended } from './chapter-harness.mjs';
import { createFakeContext } from './fake-audio.mjs';
import { createFlightSounds } from '../engine/audio/flight-sounds.js';
import { BEATS } from '../chapters/kafli4-route.js';
import * as flugModule from '../chapters/flug.js';


// What a run sees: Mosi on the screen in each beat, her place and the camera at flight times, the clock's scale.
function watcher({ at = [] } = {}) {
  const seen = { mosiSeen: {}, places: {}, scales: [], banks: [], camera: [], u: [], framing: [], looked: 0 };
  let lastLook = -1;
  const wanted = [...at];
  const head = new THREE.Vector3();
  let wrapped = false;
  const onFrame = ({ world, director }) => {
    const c = world.chapterState;
    if (!c?.flight) return;
    if (!wrapped) {
      const setScale = world.clock.setScale.bind(world.clock);
      world.clock.setScale = value => { seen.scales.push({ value, at: c.flier.t }); return setScale(value); };
      wrapped = true;
    }
    const t = c.flier.t;
    const mosi = world.actors.get('mosi');
    if (mosi.root.visible) {
      world.camera.updateMatrixWorld();
      const p = mosi.headPosition(head).project(world.camera);
      if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) (seen.mosiSeen[c.flight.beat] ??= []).push(t);
    }
    while (wanted.length && t >= wanted[0] - 1e-9) seen.places[wanted.shift()] = world.actors.get('flugedla').root.position.clone();
    seen.banks.push(c.flier.bank);
    seen.u.push({ t, u: c.flier.u, beat: c.flight.beat });
    seen.camera.push({ t, shot: c.camera.current, position: director.rig.position.clone(), her: c.flier.pose.position.clone() });
    // twice a second: her and Egill whole in the frame, their heads above the bottom 30 %, on 16:10 and on an upright tablet
    if (Math.floor(t * 2) !== lastLook && c.camera.current) {
      lastLook = Math.floor(t * 2);
      seen.looked++;
      for (const problem of framing(world, director)) seen.framing.push(`t=${t.toFixed(1)} ${c.camera.current}: ${problem}`);
    }
  };
  return { seen, onFrame };
}

// What is wrong with the frame now, at 16:10 and at an upright 0.625 (spec 5's rules for a child, STYLE.md 8: Flug).
function framing(world, director) {
  const problems = [];
  const flugedla = world.actors.get('flugedla');
  const egill = world.actors.get('egill');
  const head = flugedla.model.getObjectByName('Head');
  for (const aspect of [1.6, 0.625]) {
    world.camera.aspect = aspect;
    world.camera.updateProjectionMatrix();
    director.apply();
    world.scene.updateMatrixWorld(true);
    const where = p => { const q = p.project(world.camera); return { x: q.x, v: (1 - q.y) / 2, z: q.z }; };
    const points = [['Egill', where(egill.headPosition(new THREE.Vector3()))], ['her head', where(head.getWorldPosition(new THREE.Vector3()))],
      ['her body', where(flugedla.root.localToWorld(new THREE.Vector3(0.06, 2.6, 0)))]];
    for (const [who, p] of points) {
      if (!(p.z < 1 && Math.abs(p.x) < 0.95 && p.v > 0.08 && p.v < 0.97)) problems.push(`${aspect}: ${who} out of the frame (x ${p.x.toFixed(2)}, v ${p.v.toFixed(2)})`);
      else if (who !== 'her body' && p.v > 0.7) problems.push(`${aspect}: ${who} in the bottom 30 % (v ${p.v.toFixed(2)})`);
    }
  }
  world.camera.aspect = 1.6;
  world.camera.updateProjectionMatrix();
  director.apply();
  world.scene.updateMatrixWorld(true);
  const cam = world.camera.position;
  if (cam.distanceTo(head.getWorldPosition(new THREE.Vector3())) < 1) problems.push('the camera in her head');
  if (cam.distanceTo(egill.headPosition(new THREE.Vector3())) < 0.8) problems.push('the camera in Egill\'s face');
  if (cam.y < world.heightAt(cam.x, cam.z)) problems.push('the camera under the ground');
  return problems;
}

const full = watcher({ at: [90] });
const run = await playUnattended(flugModule, { limit: 240, seeking: true, onFrame: full.onFrame });
const flight = run.world.chapterState.flight;
const since = at => at - flight.started;

test('the flight plays unattended to the end with no warnings', () => {
  const { task, world, director } = run;
  assert.equal(task.failed, false, String(task.error?.stack));
  assert.equal(task.done, true, 'the review chapter ends');
  assert.deepEqual(world.chapterTimeline.map(m => m.scene), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.deepEqual(director.warnings, []);
  assert.ok(Math.abs(since(flight.ended) - BEATS.END) < 0.05, `the flight ends at ${since(flight.ended).toFixed(2)} s`);
});

test('every frame of the flight shows her and Egill, on 16:10 and on an upright tablet', () => {
  assert.ok(full.seen.looked > 300, `looked at ${full.seen.looked} frames`);
  assert.deepEqual(full.seen.framing, []);
});

test('beats start on schedule', () => {
  for (const { scene, at } of run.world.chapterTimeline) {
    assert.ok(Math.abs(since(at) - BEATS[scene]) <= 0.5, `${scene} at ${since(at).toFixed(2)} s (planned ${BEATS[scene]})`);
  }
});

test('every shot of spec 5 is used, in its beat', () => {
  const shots = new Map(); // shot -> the beats it is used in
  for (const { t, shot } of full.seen.camera) if (shot) (shots.get(shot) ?? shots.set(shot, new Set()).get(shot)).add(run.world.chapterState.route.beatAt(t));
  const want = {
    face: ['A', 'D'], belowTakeOff: ['A'], chase: ['B', 'C', 'D', 'E', 'G'], waterLevel: ['B', 'C'], bankShadow: ['C'], mosiBank: ['C'],
    gorgeHigh: ['D'], mosiRim: ['D'], fallsSide: ['E'], vista: ['F'], orbit: ['F'],
  };
  for (const [shot, beats] of Object.entries(want)) {
    for (const beat of beats) assert.ok(shots.get(shot)?.has(beat), `${shot} in ${beat} (used in ${[...(shots.get(shot) ?? [])]})`);
  }
});

test('Mosi is seen in C and in D', () => {
  const said = (text, beat) => run.captions.find(c => c.who === 'Mosi' && c.text === text && run.world.chapterState.route.beatAt(since(c.at)) === beat);
  assert.ok(said('Bíðið eftir mér!', 'C'), JSON.stringify(run.captions.filter(c => c.who === 'Mosi')));
  assert.ok(said('Ég fer styttri leiðina!', 'D'));
  for (const beat of ['C', 'D', 'G']) assert.ok((full.seen.mosiSeen[beat] ?? []).length > 30, `Mosi on the screen in ${beat} for more than a second`);
  for (const beat of ['A', 'B', 'E', 'F']) assert.equal(full.seen.mosiSeen[beat], undefined, `Mosi out of sight in ${beat}`);
  // the lines of spec 5 are all said, Egill's, hers and Mosi's
  const texts = run.captions.map(c => c.text);
  for (const text of ['Haltu þér fast!', 'Vááá!', 'Hátíð í kvöld! Komið öll!', 'Vá!', 'Sjáðu fossinn!', 'Upp með honum!', 'Þarna, handan fjallanna, býr Grameðla.',
    'Er hún stór?', 'Stærst af öllum!', 'Ég sé allt!', 'Takk fyrir vindinn, Egill.', 'Sjáðu, fjarlæga tjörnin. Þar býr Slóeðla.', 'Ég sé Mosa!']) {
    assert.ok(texts.includes(text), `"${text}" is said`);
  }
  // no two captions at once: each line is over before the next begins
  const lines = run.captions.map(c => ({ ...c, end: c.at + 0.6 + c.text.split(/\s+/).length * 0.42 }));
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i].at >= lines[i - 1].end - 1e-6, `"${lines[i].text}" begins over "${lines[i - 1].text}"`);
});

test('the slow second at the crest of E is on the game clock, and back to normal after it', () => {
  const slow = full.seen.scales.filter(s => s.value < 1);
  assert.equal(slow.length, 1);
  assert.equal(slow[0].value, 0.25);
  assert.equal(run.world.chapterState.route.beatAt(slow[0].at), 'E');
  assert.equal(full.seen.scales.at(-1).value, 1);
});

test('pausing at 60 s holds the beat and silences the wind bed', async () => {
  const audio = createFakeContext({ state: 'running' });
  const levels = [];
  const paused = watcher();
  const onFrame = frame => {
    paused.onFrame(frame);
    const sounds = frame.world.chapterState?.sounds;
    if (sounds) levels.push({ room: audio.currentTime, level: sounds.level, playing: sounds.playing });
  };
  const { world, task } = await playUnattended(flugModule, { limit: 90, seeking: false, audio, pauses: [{ at: 60, seconds: 5 }], onFrame });
  assert.equal(task.failed, false, String(task.error?.stack));
  const c = world.chapterState;
  const during = paused.seen.u.filter((f, i) => i > 0 && paused.seen.u[i - 1].t === f.t);
  assert.ok(during.length > 100, `${during.length} frames stood still`);
  assert.ok(during.every(f => f.u === during[0].u && f.beat === 'C'), 'she does not move, and C goes on');
  const d = world.chapterTimeline.find(m => m.scene === 'D');
  assert.ok(Math.abs(d.at - c.flight.started - BEATS.D) <= 0.5, 'D comes on schedule after the pause');
  const at = room => levels.find(l => l.room >= room - 1e-6);
  assert.ok(at(58).playing && at(58).level > 0.5, `the wind bed sounds before the pause (${at(58).level})`);
  assert.ok(at(61).level < 0.001, `silent in the pause (${at(61).level})`);
  assert.ok(at(64.9).level < 0.001);
  assert.ok(at(67).level > 0.5, 'and back after it');
});

test('the wind bed follows her speed, and makes no sound where there is no audio (captures)', () => {
  const audio = createFakeContext({ state: 'running' });
  const sounds = createFlightSounds({ context: audio, output: audio.destination });
  sounds.start();
  audio.advance(2);
  const gainAt = v => { sounds.setSpeed(v); audio.advance(2); return sounds.bed; };
  const slow = gainAt(8);
  const fast = gainAt(18);
  assert.ok(fast.gain > slow.gain * 2 && fast.cutoff > slow.cutoff, JSON.stringify({ slow, fast }));
  sounds.stop();
  const silent = createFlightSounds({ context: null });
  for (const call of ['start', 'setSpeed', 'setPan', 'whoosh', 'wingbeat', 'gust', 'water', 'falls', 'pause', 'resume', 'stop']) silent[call](1);
  silent.setPaused(true);
  assert.equal(silent.playing, false);
});

test('reduced motion: no orbit, no slow crest, half the bank, and the flight still ends at 170 s', async () => {
  const calm = watcher();
  const { world, task, director } = await playUnattended(flugModule, { limit: 240, seeking: true, reduced: true, onFrame: calm.onFrame });
  assert.equal(task.failed, false, String(task.error?.stack));
  assert.deepEqual(director.warnings, []);
  const c = world.chapterState;
  assert.ok(Math.abs(c.flight.ended - c.flight.started - BEATS.END) < 0.05);
  assert.equal(calm.seen.scales.filter(s => s.value < 1).length, 0, 'no slow second');
  const orbit = calm.seen.camera.filter(f => f.shot === 'orbit');
  assert.ok(orbit.length > 100, 'the orbit is asked for');
  assert.ok(orbit.every(f => f.position.distanceTo(orbit[0].position) < 1e-6), 'and is the fixed vista instead');
  assert.ok(Math.max(...calm.seen.banks.map(Math.abs)) <= 15 + 1e-6, 'she banks half as far');
});

test('seeking twice to t=90 puts her in the same place', async () => {
  const again = watcher({ at: [90] });
  await playUnattended(flugModule, { limit: 95, seeking: true, onFrame: again.onFrame });
  assert.ok(full.seen.places[90] && again.seen.places[90]);
  assert.ok(full.seen.places[90].distanceTo(again.seen.places[90]) < 1e-9, `${full.seen.places[90].toArray()} and ${again.seen.places[90].toArray()}`);
});
