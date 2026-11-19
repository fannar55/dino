// The flight alone (chapters/flug.js, ?chapter=flug): chapter 4's flight on Flugeðla's back as a film, beats A to G in about 170 s, with
// Egill riding, Mosi's two cameos, every shot of spec section 5 and the synthesized wind bed. It plays to the end unattended with no
// warnings, on schedule, holds still and silent through a pause, plays calmer under reduced motion, and a seek lands where the play does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { playUnattended } from './chapter-harness.mjs';
import { createFakeContext, FakeMediaElement } from './fake-audio.mjs';
import { createClock } from '../engine/clock.js';
import { createFlightSounds } from '../engine/audio/flight-sounds.js';
import { BEATS, LEAP, CALL_SHOTS } from '../chapters/kafli4-route.js';
import { SLOW, MUSIC, GOLDEN, ROAR, SONG, EGILL_ANSWERS, createFlightSong } from '../chapters/kafli4-flight.js';
import { LOOKS, pickLook } from '../engine/looks.js';
import * as flugModule from '../chapters/flug.js';
const CALL_KINDS = new Set(CALL_SHOTS.map(row => row.shot)); // the call shots' kinds of camera (the call, the run-along, the ledge, the herd)


// What a run sees: Mosi on the screen in each beat, her place and the camera at flight times, the clock's scale.
function watcher({ at = [] } = {}) {
  const seen = { mosiSeen: {}, places: {}, scales: [], banks: [], camera: [], u: [], framing: [], looked: 0, music: [], lenient: [], sfx: [], light: [], song: [], songLenient: [], songCue: null, songDrift: 0 };
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
      // the page's music, sun and fill light, which the harness's world has none of; and the sounds the flight asks for, with when
      const flightTime = () => c.s.time - c.flight.started;
      world.music = {
        setLevel: (level, seconds) => seen.music.push({ level, seconds, t: flightTime() }),
        lenient: seconds => seen.lenient.push({ seconds, t: flightTime() }),
      };
      // the flight's own song: where it is as the flight starts, and the levels and windows the flight gives it
      if (c.song) {
        seen.songCue = c.song.position - flightTime();
        const { setLevel, lenient } = c.song;
        c.song.setLevel = (level, seconds) => { seen.song.push({ level, seconds, t: flightTime() }); return setLevel(level, seconds); };
        c.song.lenient = seconds => { seen.songLenient.push({ seconds, t: flightTime() }); return lenient(seconds); };
      }
      world.lighting.sun ??= new THREE.DirectionalLight('#ffffff', 1);
      world.lighting.hemi ??= new THREE.HemisphereLight('#ffffff', '#000000', 1);
      const sfx = c.s.sfx;
      c.s.sfx = (name, detail) => { seen.sfx.push({ name, detail, t: flightTime() }); return sfx(name, detail); };
      wrapped = true;
    }
    const t = c.flier.t;
    if (c.song && c.flight.ended === null) seen.songDrift = Math.max(seen.songDrift, Math.abs(c.song.position - (c.s.time - c.flight.started) - SONG.at));
    const { sun, hemi } = world.lighting;
    seen.light.push({
      t, sun: sun.color.getHexString(), sunI: sun.intensity, sky: hemi.color.getHexString(), ground: hemi.groundColor.getHexString(),
      hemiI: hemi.intensity, fog: world.scene.fog.color.getHexString(),
    });
    const mosi = world.actors.get('mosi');
    if (mosi.root.visible) {
      world.camera.updateMatrixWorld();
      const seenFrom = clear(world, world.camera.position, mosi.headPosition(head));
      const p = head.project(world.camera);
      if (seenFrom && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) (seen.mosiSeen[c.flight.beat] ??= []).push(t);
    }
    while (wanted.length && t >= wanted[0] - 1e-9) seen.places[wanted.shift()] = world.actors.get('flugedla').root.position.clone();
    seen.banks.push(c.flier.bank);
    seen.u.push({ t, u: c.flier.u, beat: c.flight.beat });
    seen.camera.push({ t, shot: c.camera.current, position: director.rig.position.clone(), her: c.flier.pose.position.clone() });
    // twice a second: her and Egill whole in the frame, their heads above the bottom 30 %, on 16:10 and on an upright tablet. Not in a
    // call shot (the call, the run-along, the ledge, the herd): its frame is the group's, which she comes into and sweeps through
    // (tests/flight-camera.test.mjs frames what it is about and her in it at both sizes, with no land between)
    if (Math.floor(t * 2) !== lastLook && c.camera.current && !CALL_KINDS.has(c.camera.current)) {
      lastLook = Math.floor(t * 2);
      seen.looked++;
      for (const problem of framing(world, director)) seen.framing.push(`t=${t.toFixed(1)} ${c.camera.current}: ${problem}`);
    }
  };
  return { seen, onFrame };
}

/** No land between `from` and `to` (the valley's ground, every half metre, with 0.3 m to spare). */
function clear(world, from, to) {
  const d = from.distanceTo(to);
  const p = new THREE.Vector3();
  for (let s = 0.5; s < d - 0.5; s += 0.5) {
    p.lerpVectors(from, to, s / d);
    if (p.y < world.heightAt(p.x, p.z) + 0.3) return false;
  }
  return true;
}

// What is wrong with the frame now, at 16:10 and at an upright 0.625 (spec 5's rules for a child, STYLE.md 8: Flug).
function framing(world, director) {
  const problems = [];
  const flugedla = world.actors.get('flugedla');
  const egill = world.actors.get('egill');
  const head = flugedla.model.getObjectByName('Head');
  director.apply();
  world.scene.updateMatrixWorld(true);
  for (const [who, point] of [['Egill', egill.headPosition(new THREE.Vector3())], ['her head', head.getWorldPosition(new THREE.Vector3())],
    ['her body', flugedla.root.localToWorld(new THREE.Vector3(0.06, 2.6, 0))]]) {
    if (!clear(world, world.camera.position, point)) problems.push(`land between the camera and ${who}`);
  }
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
  assert.ok(full.seen.looked > 250, `looked at ${full.seen.looked} frames`); // twice a second, a call shot only as she passes
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
    face: ['A', 'D'], belowTakeOff: ['A'], chase: ['B', 'C', 'D', 'E', 'G'], waterLevel: ['B'], call: ['C'], runAlong: ['C'], mosiBank: ['C'],
    ledge: ['D'], herd: ['F'], mosiRim: ['D'], fallsSide: ['E'], fallsTop: ['E'], vista: ['F'], orbit: ['F'],
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
    'Er hún stór?', 'Stærsta rándýrið!', 'Ég sé allt!', 'Takk fyrir vindinn, Egill.', 'Sjáðu, fjarlæga tjörnin. Þar býr Slóeðla.', 'Ég sé Mosa!']) {
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

test('the flight has its own song (the owner\'s pick of 2026-11-05): it begins with the flight, half a second in, and keeps to the flight\'s clock', () => {
  const c = run.world.chapterState;
  assert.ok(c.song, 'the flight has a song');
  assert.ok(Math.abs(full.seen.songCue - SONG.at) < 1e-6, `${SONG.at} s into the song as the flight starts: ${full.seen.songCue}`);
  assert.ok(full.seen.songDrift < 1e-6, `and on the flight's clock to its end: at most ${full.seen.songDrift} s off`);
  // the song's file, beside the chapter's sounds: the cut take the owner heard, made smaller (96 kb/s, as the themes are)
  const file = fs.statSync(new URL(`../assets/audio/kafli4/${SONG.src}`, import.meta.url));
  assert.ok(file.size > 1.5e6 && file.size < 3e6, `${SONG.src} is ${file.size} bytes`);
  assert.ok(SONG.seconds > BEATS.END + SONG.at + 10, 'it plays on past the flight, into her landing');
});

test('the flight\'s song keeps its level while a line is said: no dip under talk in the flight (the owner\'s word of 2026-11-16)', async () => {
  const context = createFakeContext({ state: 'running' });
  const element = new FakeMediaElement({ duration: 200 });
  const clock = createClock();
  const sound = { context, output: null, hold: () => () => {}, speaking: false, createElement: () => element };
  const song = createFlightSong({ clock, sound });
  await song.ready;
  const volume = context.lastGains[0];
  const run = seconds => {
    for (let left = seconds; left > 1e-9; left -= 1 / 60) {
      const dt = Math.min(1 / 60, left);
      clock.tick(dt);
      context.advance(dt);
      song.update();
    }
  };
  song.play(SONG.at);
  run(0.5);
  const normal = volume.gain.valueAt(context.currentTime);
  assert.ok(normal > 0, 'it sounds');
  sound.speaking = true;
  run(0.5);
  const under = volume.gain.valueAt(context.currentTime);
  assert.ok(Math.abs(under - normal) < 1e-9, `the same under a line: ${(20 * Math.log10(under / normal)).toFixed(2)} dB`);
});

test('the page\'s theme is silent through the review flight, and the flight\'s levels are its song\'s: up as she leaps, down as she glides', () => {
  const { music, song } = full.seen;
  assert.ok(music.every(m => m.level === 0), `the theme is never raised: ${JSON.stringify(music)}`);
  const leap = song.find(m => m.level === MUSIC.flight);
  assert.ok(leap && Math.abs(leap.t - LEAP) < 0.05, `louder as she leaps: ${JSON.stringify(song)}`);
  const glide = song.find(m => m.level === MUSIC.glide);
  assert.ok(glide && Math.abs(glide.t - BEATS.G) < 0.05, 'quieter as she glides down');
});

test('the music plays on through the slow second at the crest: never lowered there, and let run at its own speed past the slowed clock', () => {
  // the owner (2026-11-04): the slow motion at the top is good, but the music going down with it sounded wrong
  const { song: music, songLenient: lenient } = full.seen;
  assert.deepEqual(music.filter(m => m.level === 0), [], 'the music is never silenced in the flight');
  const atCrest = music.filter(m => m.t > SLOW.at - 1 && m.t < GOLDEN.at + 1);
  assert.deepEqual(atCrest, [], `no change of level round the crest: ${JSON.stringify(atCrest)}`);
  const before = music.filter(m => m.t < SLOW.at).at(-1);
  assert.equal(before.level, MUSIC.flight, 'the flight\'s level through the crest');
  // the playhead belongs to the game clock: held to a clock at a quarter speed, the music would be dipped and moved back each
  // second; a lenient window over the slow second lets the playhead follow the sound instead (engine/audio/music.js)
  assert.equal(lenient.length, 1, JSON.stringify(lenient));
  assert.ok(Math.abs(lenient[0].t - SLOW.at) < 0.05, `the window opens at the crest, at ${lenient[0].t.toFixed(2)} s`);
  assert.ok(lenient[0].seconds >= SLOW.seconds * SLOW.scale && lenient[0].seconds <= 1, `it covers the slow second's game time: ${lenient[0].seconds} s`);
});

test('the light goes golden from the burst out of the spray, stays golden through F, and is back to the chapter look by the end', () => {
  assert.equal(flugModule.chapter.look, 'earlyAfternoon');
  const look = pickLook(flugModule.chapter.look);
  const hex = colour => new THREE.Color(colour).getHexString();
  const want = l => ({ sun: hex(l.sun.color), sunI: l.sun.intensity, sky: hex(l.hemi.sky), ground: hex(l.hemi.ground), hemiI: l.hemi.intensity, fog: hex(l.fog.color) });
  const { light } = full.seen;
  const at = t => light.find(l => l.t >= t - 1e-9);
  const same = (got, l, why) => {
    for (const [key, value] of Object.entries(want(l))) {
      if (typeof value === 'number') assert.ok(Math.abs(got[key] - value) < 1e-6, `${why}: ${key} ${got[key]} (want ${value})`);
      else assert.equal(got[key], value, `${why}: ${key}`);
    }
  };
  for (const t of [20, 100, GOLDEN.at - 0.05]) same(at(t), look, `the chapter's light at ${t} s`);
  for (const t of [GOLDEN.at + GOLDEN.rise + 0.05, BEATS.F, 135, BEATS.G - 0.05]) same(at(t), LOOKS.golden, `golden at ${t} s`);
  same(at(BEATS.G + GOLDEN.back + 0.05), look, 'back to the chapter\'s light in G');
  same(light.at(-1), look, 'and so at the end');
  // no jumps on the way: each frame moves the haze's colour a little
  const channels = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  for (let i = 1; i < light.length; i++) {
    const step = Math.max(...channels(light[i].fog).map((v, k) => Math.abs(v - channels(light[i - 1].fog)[k])));
    assert.ok(step <= 3, `the haze jumps ${step} at ${light[i].t.toFixed(2)} s`);
  }
});

test('Grameðla\'s roar: once, in F, low and far, as Flugeðla speaks of her', () => {
  const roars = full.seen.sfx.filter(s => s.name === 'gramedlaRoar');
  assert.equal(roars.length, 1, JSON.stringify(full.seen.sfx.map(s => s.name)));
  assert.equal(run.world.chapterState.route.beatAt(roars[0].t), 'F');
  assert.equal(roars[0].detail?.level, ROAR.level);
  assert.equal(ROAR.level, 0.25);
  const line = run.captions.find(c => c.text === 'Þarna, handan fjallanna, býr Grameðla.');
  assert.ok(roars[0].t > since(line.at) && roars[0].t - since(line.at) < 4, `the roar at ${roars[0].t.toFixed(2)} s, her line at ${since(line.at).toFixed(2)} s`);
});

test('the big call\'s answers include the herd and the flyers (the owner\'s picks of 2026-11-07), after the call', () => {
  const big = run.world.chapterState.play.big.at;
  assert.ok(Number.isFinite(big), 'the big call came');
  const after = full.seen.sfx.filter(s => s.t > big);
  for (const name of ['frog', 'lizards', 'birds', 'grazers', 'flyers']) {
    assert.ok(after.some(s => s.name === name), `${name} answer the big call (heard after it: ${after.map(s => s.name)})`);
  }
});

test('pausing at 60 s holds the beat and silences the wind bed and the song', async () => {
  const audio = createFakeContext({ state: 'running' });
  const levels = [];
  const paused = watcher();
  const onFrame = frame => {
    paused.onFrame(frame);
    const sounds = frame.world.chapterState?.sounds;
    const song = frame.world.sound?.elements?.[0];
    if (sounds) levels.push({ room: audio.currentTime, level: sounds.level, playing: sounds.playing, song: song ? !song.paused : null, songAt: song?.currentTime, songPos: frame.world.chapterState?.song?.position });
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
  // the song: one element, playing before the pause, stopped in it, and playing again after it on the flight's clock
  assert.equal(world.sound.elements.length, 1, 'the flight\'s song');
  assert.equal(at(58).song, true, 'the song plays before the pause');
  assert.equal(at(61).song, false, 'and is stopped in it');
  assert.equal(at(64.9).song, false);
  assert.equal(at(67).song, true, 'and plays after it');
  for (const room of [58, 70]) assert.ok(Math.abs(at(room).songAt - at(room).songPos) <= 0.1, `on its playhead at ${room} s: ${at(room).songAt.toFixed(2)} against ${at(room).songPos.toFixed(2)}`);
});

test('the review flight speaks with the recorded lines: each line plays its own kafli4 recording', () => {
  const recorded = JSON.parse(fs.readFileSync(new URL('../assets/audio/lines.json', import.meta.url), 'utf8'));
  const lines = Object.entries(flugModule.chapter.lines);
  assert.ok(lines.length > 10);
  for (const [id, line] of lines) {
    assert.equal(line.audio, id, `${id} plays its recording`);
    assert.equal(recorded[id]?.src, `assets/audio/kafli4/${id}.mp3`, `${id} is recorded`);
  }
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

test('the warm-up behind the start button draws what first shows mid-flight: the actors, the falls, the far land and the animals', () => {
  const part = name => Object.assign(new THREE.Group(), { name });
  const actors = new Map(['flugedla', 'egill', 'mosi'].map(name => [name, { root: part(name) }]));
  const forest = { waterfall: { group: part('falls') }, farLand: { group: part('far land') }, animals: { group: part('animals') } };
  const warm = flugModule.chapter.warmUp({ actors, forest });
  const names = warm.objects.map(o => o.name).sort();
  assert.deepEqual(names, ['animals', 'egill', 'falls', 'far land', 'flugedla', 'mosi']);
  assert.equal(typeof warm.dispose, 'function');
  // the grey valley has none of the three
  const grey = flugModule.chapter.warmUp({ actors, forest: { waterfall: null, farLand: null, animals: null } });
  assert.deepEqual(grey.objects.map(o => o.name).sort(), ['egill', 'flugedla', 'mosi']);
});

// The flight is a film (the owner, 2026-11-15: docs/superpowers/specs/2026-11-15-kafli-4-flugmynd-design.md): Egill watches it and
// touches nothing in it. Two runs, not captures: one that touches nothing, and one whose hands drag and tap all over it. A drag is
// what pointer.js says of the one finger that drags; a tap on a name is what it says of a finger on a target.
const dragAll = (pointer, phase, dx = 0, dy = 0) => [...pointer.listeners.drag].forEach(fn => fn({ phase, dx, dy, x: 640, y: 400 }));
const GOLD = new THREE.Color('#ffe28a').getHexString(); // the glitter's and the gold burst's glints (world/props/sparkles.js)

/** One run: `hands(t, run)` each frame at the flight's time t, after what the frame showed is written down. */
async function playAs(hands = () => {}) {
  const log = { lines: [], shots: [], poses: [], frames: [], buttons: 0, targets: new Set(), gold: [] };
  let started = false;
  let now = 0;
  let lastPose = -1;
  const onFrame = ({ world, pointer, stage }) => {
    const c = world.chapterState;
    if (!c?.flight) return;
    now = c.s.time - c.flight.started;
    if (!started) {
      started = true;
      // what is asked of the voices, at the flight's time it is asked (between frames too: a tap)
      const flightTime = () => c.s.time - c.flight.started;
      const say = stage.s.say;
      stage.s.say = (speaker, id, options) => {
        const task = say(speaker, id, options);
        log.lines.push({ id, speaker, from: flightTime(), to: null, task });
        return task;
      };
    }
    for (const line of log.lines) if (line.to === null && line.task.done) line.to = now;
    if (c.camera.current !== log.shots.at(-1)?.shot) log.shots.push({ shot: c.camera.current, t: now });
    if (Math.floor(now * 2) !== lastPose) {
      lastPose = Math.floor(now * 2);
      log.poses.push({ t: now, at: c.flier.pose.position.toArray(), turn: c.flier.pose.quaternion.toArray() });
    }
    // what a finger could find: the old „Hraðar!“ button, a group's tap target, the gold glitter over a group
    if (world.page?.body.querySelector('.flight-faster')) log.buttons++;
    for (const name of pointer.targets.keys()) if (name.startsWith('group:')) log.targets.add(name);
    for (const child of world.scene.children) {
      if (child.isPoints && child.visible && child.material?.uniforms?.uColour?.value.getHexString() === GOLD) log.gold.push(now);
    }
    log.frames.push({ t: now, shot: c.camera.current, u: c.flier.u });
    hands(now, { world, pointer, c, log });
  };
  const run = await playUnattended(flugModule, { limit: 240, seeking: false, onFrame });
  return { ...run, log, c: run.world.chapterState };
}

// Hands all over it: at 20, 40 and 70 s a finger drawn 300 px aside and then 80 px down, each group tapped by its name as she comes
// to it (90 to 30 m ahead of her, where its target used to be), a tap on nothing in C, and one on the land in F.
function allOverIt() {
  const done = new Set();
  const once = (key, when, fn) => { if (when && !done.has(key)) { done.add(key); fn(); } };
  let dragging = null;
  return (t, { pointer, c }) => {
    for (const at of [20, 40, 70]) {
      once(`drag ${at}`, t >= at, () => { dragAll(pointer, 'start', 0, 0); dragging = at; });
      if (dragging === at && t < at + 0.5) dragAll(pointer, 'move', 20, 0); // 300 px aside over half a second
      else if (dragging === at && t < at + 0.8) dragAll(pointer, 'move', 0, 9); // and 80 px down
      once(`drag ${at} end`, t >= at + 1, () => { dragAll(pointer, 'end'); dragging = null; });
    }
    for (const g of c.route.groups) {
      const ahead = (g.u - c.flier.u) * c.route.length;
      once(`tap ${g.id}`, ahead <= 90 && ahead >= 30, () => pointer.tap(`group:${g.id}`));
    }
    once('nothing', t >= 50, () => pointer.tap(null));
    once('land', t >= 127, () => pointer.tap(null));
  };
}

const untouched = await playAs();
const handled = await playAs(allOverIt());
const groupIds = untouched.c.route.groups.map(g => g.id);
const near = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= 1e-6);

test('nothing touched: every group is still called once and the flight ends at 170 s', () => {
  const { task, director, c, log } = untouched;
  assert.equal(task.failed, false, String(task.error?.stack));
  assert.deepEqual(director.warnings, []);
  assert.ok(Math.abs(c.flight.ended - c.flight.started - BEATS.END) < 0.05, 'the flight ends at 170 s');
  const groups = c.play.calls.filter(call => call.id !== 'land');
  assert.deepEqual(groups.map(call => call.id), groupIds, 'each group once, in the order she meets them');
  // she calls each herself, aloud, but where Egill answers a call shot as the camera cuts back to her (EGILL_ANSWERS): her call to the
  // next group is left out under his line (the group is still called, and answers)
  const over = call => log.lines.filter(l => l.from <= call.t && (l.to ?? Infinity) > call.t).map(l => l.id);
  const answering = new Set(Object.values(EGILL_ANSWERS));
  const silent = groups.filter(call => !call.voiced && !over(call).some(id => answering.has(id)));
  assert.ok(groups.every(call => call.how !== 'tap'), 'by herself');
  assert.deepEqual(silent.map(call => [call.id, +call.t.toFixed(1), over(call)]), [], "she calls each herself, aloud, but under Egill's answers");
  assert.ok(groups.filter(call => !call.voiced).length <= Object.keys(EGILL_ANSWERS).length, 'one at most under each of his answers');
  assert.deepEqual(c.play.answers.map(a => a.id), groupIds, 'and each answers');
  const big = c.play.calls.filter(call => call.id === 'land');
  assert.equal(big.length, 1, 'the big call over the land, once');
  // at 135 s, or, when a line still plays then (their recorded lengths), as soon as it ends
  const waited = log.lines.filter(l => l.from < big[0].t - 1e-6 && l.to !== null && l.to > 135 - 1e-6);
  const due = Math.max(135, ...waited.map(l => l.to));
  assert.ok(Math.abs(big[0].t - due) < 0.1, `by itself at 135 s, after the line playing (${big[0].t.toFixed(2)}, due ${due.toFixed(2)}: ${waited.map(l => l.id)})`);
  // her line about Grameðla is not cut: the call waits for it, and the lines after wait for the call (a line's `to` is the frame
  // that saw it end, up to a frame after it did)
  const lines = log.lines.filter(l => l.to !== null).sort((a, b) => a.from - b.from);
  for (let i = 1; i < lines.length; i++) {
    assert.ok(lines[i].from >= lines[i - 1].to - 1 / 30, `${lines[i].id} at ${lines[i].from.toFixed(2)} over ${lines[i - 1].id} (to ${lines[i - 1].to.toFixed(2)})`);
  }
  assert.equal(log.lines.filter(l => l.id === 'k4_egill_all').length, 1, 'and Egill sees it all');
});

test('a drag or a tap in the flight changes nothing: her pose, the shots and the lines are the untouched flight\'s', () => {
  const { task, director, log } = handled;
  assert.equal(task.failed, false, String(task.error?.stack));
  assert.deepEqual(director.warnings, []);
  const a = untouched.log;
  const b = log;
  assert.ok(a.poses.length > 330, `her pose every 0.5 s (${a.poses.length})`);
  assert.equal(b.poses.length, a.poses.length, 'as many half seconds');
  for (let i = 0; i < a.poses.length; i++) {
    const [p, q] = [a.poses[i], b.poses[i]];
    assert.ok(Math.abs(p.t - q.t) <= 1e-6 && near(p.at, q.at) && near(p.turn, q.turn), `at ${p.t.toFixed(2)} s she is at ${q.at.map(v => v.toFixed(2))}, not ${p.at.map(v => v.toFixed(2))}`);
  }
  const shots = run => run.shots.map(s => `${s.shot} ${s.t.toFixed(6)}`);
  assert.deepEqual(shots(b), shots(a), 'the same shots, cut at the same seconds');
  const lines = run => run.lines.map(l => `${l.id} ${l.from.toFixed(6)}`);
  assert.deepEqual(lines(b), lines(a), 'the same lines, at the same seconds');
  assert.deepEqual(handled.c.play.calls.map(call => `${call.id} ${call.how} ${call.t.toFixed(6)}`), untouched.c.play.calls.map(call => `${call.id} ${call.how} ${call.t.toFixed(6)}`), 'and the same calls');
});

test('no button or targets in the flight: nothing for a finger, and no glitter over the animals', () => {
  for (const [who, run] of [['untouched', untouched], ['handled', handled]]) {
    assert.equal(run.log.buttons, 0, `${who}: no „Hraðar!“ button in the page`);
    assert.deepEqual([...run.log.targets], [], `${who}: no group is a tap target`);
    assert.deepEqual(run.log.gold.filter(t => t >= BEATS.C && t < BEATS.D).slice(0, 3), [], `${who}: no gold glints over a group in C`);
  }
  for (const kind of ['steer', 'faster']) assert.throws(() => untouched.c.play.enable(kind, false), /Unknown flight play/, `the flight has no ${kind}`);
  assert.equal(untouched.c.play.button, undefined, 'nor a button');
  assert.equal(typeof untouched.c.camera.boost, 'undefined', 'nor a burst\'s wider lens');
});

test('seeking twice to t=90 puts her in the same place', async () => {
  const again = watcher({ at: [90] });
  await playUnattended(flugModule, { limit: 95, seeking: true, onFrame: again.onFrame });
  assert.ok(full.seen.places[90] && again.seen.places[90]);
  assert.ok(full.seen.places[90].distanceTo(again.seen.places[90]) < 1e-9, `${full.seen.places[90].toArray()} and ${again.seen.places[90].toArray()}`);
});
