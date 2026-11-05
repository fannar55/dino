// The flight alone (chapters/flug.js, ?chapter=flug): chapter 4's flight on Flugeðla's back as a film, beats A to G in about 170 s, with
// Egill riding, Mosi's two cameos, every shot of spec section 5 and the synthesized wind bed. It plays to the end unattended with no
// warnings, on schedule, holds still and silent through a pause, plays calmer under reduced motion, and a seek lands where the play does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { playUnattended } from './chapter-harness.mjs';
import { createFakeContext } from './fake-audio.mjs';
import { createFlightSounds } from '../engine/audio/flight-sounds.js';
import { BEATS, FASTER_LAST, LEAP } from '../chapters/kafli4-route.js';
import { SLOW, MUSIC, GOLDEN, ROAR, SONG } from '../chapters/kafli4-flight.js';
import { LOOKS, pickLook } from '../engine/looks.js';
import * as flugModule from '../chapters/flug.js';


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
    // twice a second: her and Egill whole in the frame, their heads above the bottom 30 %, on 16:10 and on an upright tablet
    if (Math.floor(t * 2) !== lastLook && c.camera.current) {
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
    gorgeHigh: ['D'], mosiRim: ['D'], fallsSide: ['E'], fallsTop: ['E'], vista: ['F'], orbit: ['F'],
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

// What Egill may do on the flight (spec 6, Task 11), as three children play it, not as a capture: one who touches nothing, one who
// tries each thing once, and one who mashes everything all the time. A drag is what pointer.js says of the one finger that drags; a
// thumb resting on the glass taps nothing it did not land on (pointer.js), so a second finger is a tap on nothing.
const dragAll = (pointer, phase, dx = 0, dy = 0) => [...pointer.listeners.drag].forEach(fn => fn({ phase, dx, dy, x: 640, y: 400 }));
const fasterOf = world => world.page?.body.querySelector('.flight-faster') ?? null;
const hintOf = world => world.page?.body.querySelector('.flight-hint') ?? null;
const showing = element => Boolean(element) && !element.hidden;
const press = element => {
  for (const type of ['pointerdown', 'pointerup']) element.dispatchEvent(new Event(type));
  element.dispatchEvent(new Event('click'));
};

/** One run as a child plays it: `child(t, run)` each frame at the flight's time t, after what the frame showed is written down. */
async function playAs(child = () => {}) {
  const log = { lines: [], steers: [], frames: [], taps: {}, drags: new Set(), presses: [], skims: [] };
  let started = false;
  let now = 0;
  const onFrame = ({ world, director, pointer, stage }) => {
    const c = world.chapterState;
    if (!c?.flight) return;
    now = c.s.time - c.flight.started;
    if (!started) {
      started = true;
      // what is asked of her and of the voices, at the flight's time it is asked (between frames too: a tap, a press)
      const flightTime = () => c.s.time - c.flight.started;
      const say = stage.s.say;
      stage.s.say = (speaker, id, options) => {
        const task = say(speaker, id, options);
        log.lines.push({ id, speaker, from: flightTime(), to: null, task });
        return task;
      };
      const steer = c.flier.steer;
      // where she tells the life in the flight (world/ardalur/life.js) she skims
      const life = world.forest?.life;
      if (life) { const skim = life.skim; life.skim = (x, z) => { log.skims.push({ x, z, t: flightTime() }); return skim(x, z); }; }
      else if (world.forest) world.forest.life = { skim: (x, z) => log.skims.push({ x, z, t: flightTime() }) };
      c.flier.steer = x => { log.steers.push({ x, t: flightTime() }); return steer(x); };
    }
    for (const line of log.lines) if (line.to === null && line.task.done) line.to = now;
    log.frames.push({
      t: now, shot: c.camera.current, fov: director.rig.fov, offset: c.flier.offset, lift: c.flier.lift, bursting: c.flier.bursting,
      u: c.flier.u, button: showing(fasterOf(world)), hint: showing(hintOf(world)), lines: c.play?.speedLines?.level ?? 0,
    });
    child(now, { world, pointer, c, log });
  };
  const run = await playUnattended(flugModule, { limit: 240, seeking: false, onFrame });
  return { ...run, log, c: run.world.chapterState };
}

// The child who tries each thing once (and a group twice), at times the flight's shots allow.
function triesEverything() {
  const done = new Set();
  const once = (key, when, fn) => { if (when && !done.has(key)) { done.add(key); fn(); } };
  const appeared = new Map(); // a group's target -> when it first showed
  let dragging = null;
  return (t, { world, pointer, log }) => {
    const drag = (phase, dx, dy) => { log.drags.add(t); dragAll(pointer, phase, dx, dy); };
    // B, the first chase shot: a steer to the right, and a thumb tapping the glass meanwhile
    once('steer', t >= 17, () => { drag('start', 6, 0); dragging = 'steer'; });
    if (dragging === 'steer' && t < 18.5 && !done.has('steer move ' + t)) drag('move', 6, 0);
    once('thumb', t >= 17.8, () => { log.thumb = t; pointer.tap(null); });
    once('steer end', t >= 18.5, () => { drag('end', 0, 0); dragging = null; });
    // B: a finger drawn down, to skim the water
    once('skim', t >= 21, () => { drag('start', 0, 14); dragging = 'skim'; });
    if (dragging === 'skim' && t < 21.6) drag('move', 0, 8);
    once('skim end', t >= 22.5, () => { drag('end', 0, 0); dragging = null; });
    // the still shot from the water (25 to 28.3 s) and the chase after 92 s: a steer there does nothing
    once('still', t >= 26, () => { drag('start', 6, 0); dragging = 'still'; });
    if (dragging === 'still' && t < 27) drag('move', 6, 0);
    once('still end', t >= 27, () => { drag('end', 0, 0); dragging = null; });
    once('late', t >= 100, () => { drag('start', 6, 0); dragging = 'late'; });
    if (dragging === 'late' && t < 101) drag('move', 6, 0);
    once('late end', t >= 101, () => { drag('end', 0, 0); dragging = null; });
    // C: a steer under way, and „Hraðar!“ pressed in a frame the finger holds still; then whenever it shows
    once('hold', t >= 37.5, () => { drag('start', 6, 0); dragging = 'hold'; });
    if (dragging === 'hold' && t < 38.5 && !(t >= 38 && !done.has('faster'))) drag('move', 4, 0);
    const button = fasterOf(world);
    if (showing(button) && t >= 38) {
      done.add('faster');
      log.presses.push(t);
      press(button);
    }
    once('hold end', t >= 38.5, () => { drag('end', 0, 0); dragging = null; });
    // C: each group tapped as soon as its target shows, and once more a little later
    for (const name of pointer.targets.keys()) if (name.startsWith('group:') && !appeared.has(name)) appeared.set(name, t);
    for (const [name, since] of appeared) {
      once(`${name} tap`, t >= since + 0.4, () => { log.taps[name.slice(6)] = t; pointer.tap(name); });
      once(`${name} again`, t >= since + 0.8, () => pointer.tap(name));
    }
    // F: a tap on the land while she speaks of Grameðla
    once('land', t >= 127, () => { log.land = t; pointer.tap(null); });
  };
}

// The child who touches everything all the time: every target and the land each frame, „Hraðar!“ whenever it shows, and a finger
// that never stops dragging, side to side and down and up, lifted and put down again every half second.
function mashes() {
  let frame = 0;
  let down = false;
  return (t, { world, pointer }) => {
    frame++;
    pointer.tap(null);
    for (const name of [...pointer.targets.keys()]) pointer.tap(name);
    const button = fasterOf(world);
    if (showing(button)) press(button);
    if (Math.floor(t * 2) % 2 === 0) {
      if (!down) { dragAll(pointer, 'start', 20, 0); down = true; }
      dragAll(pointer, 'move', frame % 2 ? 40 : -40, frame % 4 < 2 ? 30 : -30);
    } else if (down) {
      dragAll(pointer, 'end');
      down = false;
    }
  };
}

const untouched = await playAs();
const eager = await playAs(triesEverything());
const mashed = await playAs(mashes());
const groupIds = untouched.c.route.groups.map(g => g.id);
const framesIn = (run, from, to) => run.log.frames.filter(f => f.t >= from && f.t < to);

test('nothing touched: every group is still called once and the flight ends at 170 s', () => {
  const { task, director, c, log } = untouched;
  assert.equal(task.failed, false, String(task.error?.stack));
  assert.deepEqual(director.warnings, []);
  assert.ok(Math.abs(c.flight.ended - c.flight.started - BEATS.END) < 0.05, 'the flight ends at 170 s');
  const groups = c.play.calls.filter(call => call.id !== 'land');
  assert.deepEqual(groups.map(call => call.id), groupIds, 'each group once, in the order she meets them');
  assert.ok(groups.every(call => call.how === 'auto' && call.voiced), `she calls each herself, aloud (not: ${JSON.stringify(groups.filter(call => !call.voiced).map(call => [call.id, +call.t.toFixed(1), log.lines.filter(l => l.from <= call.t && (l.to ?? Infinity) > call.t).map(l => l.id)]))})`);
  assert.deepEqual(c.play.answers.map(a => a.id), groupIds, 'and each answers');
  const big = c.play.calls.filter(call => call.id === 'land');
  assert.equal(big.length, 1, 'the big call over the land, once');
  // at 135 s, or, when a line still plays then (their recorded lengths), as soon as it ends
  const waited = log.lines.filter(l => l.from < big[0].t - 1e-6 && l.to !== null && l.to > 135 - 1e-6);
  const due = Math.max(135, ...waited.map(l => l.to));
  assert.ok(Math.abs(big[0].t - due) < 0.1, `by itself at 135 s, after the line playing (${big[0].t.toFixed(2)}, due ${due.toFixed(2)}: ${waited.map(l => l.id)})`);
  // the finger hint shows in the first chase shot of B and only then; the button only in B to D
  const hinted = log.frames.filter(f => f.hint);
  assert.ok(hinted.length > 30 && hinted.every(f => f.t >= BEATS.B && f.t < 25 && f.shot === 'chase'), 'the hint, in the first chase shot');
  assert.ok(log.frames.some(f => f.button), '„Hraðar!“ shows');
});

test('a tap on a group calls it at once; the same group is not called again', () => {
  const { c, log } = eager;
  const groups = c.play.calls.filter(call => call.id !== 'land');
  assert.deepEqual(groups.map(call => call.id), groupIds, 'each group once');
  for (const call of groups) {
    assert.equal(call.how, 'tap', `${call.id}: called by the tap`);
    assert.ok(Math.abs(call.t - log.taps[call.id]) < 0.05, `${call.id}: at once (${call.t.toFixed(2)}, tapped ${log.taps[call.id].toFixed(2)})`);
  }
  assert.deepEqual(c.play.answers.map(a => a.id), groupIds, 'each answers once');
  for (const a of c.play.answers) assert.ok(a.t >= groups.find(call => call.id === a.id).t, `${a.id} answers after her call`);
});

test('steering is ignored outside chase shots and after 92 s', () => {
  const { log } = eager;
  // in the chase of B she moves aside, and is back on her way within 2 s of the finger lifting
  const steered = framesIn(eager, 17, 18.6);
  assert.ok(Math.max(...steered.map(f => f.offset)) > 1.5, `she moves aside (${Math.max(...steered.map(f => f.offset)).toFixed(2)} m)`);
  assert.ok(Math.abs(framesIn(eager, 20.5, 20.6)[0].offset) < 0.2, 'back on her way 2 s after');
  for (const [from, to, where] of [[26, 27.5, 'the still shot from the water'], [100, 101.5, 'the chase after 92 s']]) {
    assert.ok(framesIn(eager, from, to).every(f => Math.abs(f.offset) < 0.05), `no steer in ${where}`);
    assert.ok(log.steers.filter(s => s.t >= from && s.t < to).every(s => s.x === 0), `nothing asked of her in ${where}`);
  }
});

test('a skim: she drops to the water, it splashes and Egill laughs, at most once in 10 s', () => {
  const { log, soundLog, c } = eager;
  const low = framesIn(eager, 21.4, 22.6);
  assert.ok(Math.min(...low.map(f => f.lift)) < -1, `she drops (${Math.min(...low.map(f => f.lift)).toFixed(2)} m)`);
  const start = c.flight.started;
  assert.ok(soundLog.some(s => s.name === 'skim' && s.at - start >= 21 && s.at - start < 22.6), 'a splash (her feet on the river: sfx.js SAMPLES skim)');
  const laughs = log.lines.filter(l => l.id === 'k4_egill_laugh');
  assert.equal(laughs.length, 1, 'Egill laughs once');
  assert.ok(laughs[0].from >= 21 && laughs[0].from < 22.6);
  // and the water striders near it skate off (world/ardalur/life.js): she tells the life where she touches the water
  assert.ok(log.skims.length > 0 && log.skims.every(s => s.t >= 21 && s.t < 22.6), `the life is told of the skim (${log.skims.map(s => s.t.toFixed(2))})`);
});

test('a press on Hraðar! does not steer, and Hraðar! is hidden after FASTER_LAST', () => {
  const { log, c } = eager;
  const first = log.presses[0];
  assert.ok(first >= 38 && first < 38.1, `pressed at ${first}`);
  assert.equal(log.steers.filter(s => Math.abs(s.t - first) < 1e-9).length, 0, 'the press asks no steer of her');
  assert.ok(framesIn(eager, first, first + 0.1).some(f => f.bursting), 'she bursts');
  for (const run of [untouched, eager, mashed]) {
    const wrong = run.log.frames.filter(f => f.button && !(f.t <= FASTER_LAST && f.shot === 'chase'));
    assert.deepEqual(wrong.map(f => `${f.t.toFixed(2)} ${f.shot}`), [], 'shown only in chase shots, up to FASTER_LAST');
  }
  // Egill on the first burst and every third after it, and she answers each time; a burst while a line plays passes his shout on to
  // the next one (he never talks over her)
  const bursts = c.play.bursts;
  assert.ok(bursts.length >= 4, `${bursts.length} bursts`);
  const shouts = log.lines.filter(l => l.id === 'k4_egill_faster1' || l.id === 'k4_egill_faster2');
  assert.ok(shouts.length >= 1 && shouts.length <= Math.ceil(bursts.length / 3), `${shouts.length} shouts for ${bursts.length} bursts`);
  assert.equal(shouts[0].id, 'k4_egill_faster1');
  const quiet = b => !log.lines.some(l => l.from < b.t - 1e-6 && (l.to === null || l.to > b.t)); // a line playing as it came
  const firstQuiet = bursts.find(quiet);
  const said = log.lines.map(l => `${l.id} ${l.from.toFixed(2)}-${l.to?.toFixed(2)}`).join(', ');
  assert.ok(Math.abs(shouts[0].from - firstQuiet.t) < 0.05, `on the first burst with no line playing (${firstQuiet.t.toFixed(2)}; bursts ${bursts.map(b => b.t.toFixed(2))}; ${said})`);
  assert.equal(log.lines.filter(l => l.id === 'k4_flugedla_holdon').length, shouts.length, 'and she answers each shout');
});

test('a burst widens the lens by 8 degrees and it comes back', () => {
  const { log } = eager;
  const first = log.presses[0];
  const before = framesIn(eager, first - 0.5, first).at(-1).fov;
  const during = Math.max(...framesIn(eager, first, first + 2.5).map(f => f.fov));
  assert.ok(Math.abs(during - before - 8) < 0.3, `${before.toFixed(2)} to ${during.toFixed(2)}`);
  const after = framesIn(eager, first + 4, first + 5.4).filter(f => !f.bursting && f.shot === 'chase');
  assert.ok(after.length && after.every(f => Math.abs(f.fov - before) < 0.2), 'back once the burst is over');
  // the speed lines fade in over 0.3 s and out over 0.6 s, and never flash
  const lines = framesIn(eager, first - 0.2, first + 4.5).map(f => f.lines);
  assert.ok(Math.max(...lines) > 0.95, 'the speed lines show');
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i] - lines[i - 1] < 0.12, 'no jump up in a frame');
  assert.ok(framesIn(eager, first + 3.2, first + 3.4).every(f => f.lines === 0), 'gone 0.6 s after the burst');
});

test('a second finger during a steer changes nothing', () => {
  const { log, c } = eager;
  assert.ok(log.thumb > 17 && log.thumb < 18.5);
  // in the thumb's frame the dragging finger moved once, and that is the one steer asked of her
  assert.equal(log.steers.filter(s => Math.abs(s.t - log.thumb) < 1e-9).length, 1, 'the thumb asks nothing more of her');
  const around = framesIn(eager, log.thumb - 0.2, log.thumb + 0.2).map(f => f.offset);
  for (let i = 1; i < around.length; i++) assert.ok(around[i] >= around[i - 1] - 1e-9, 'she keeps moving the way the finger drags');
  assert.ok(c.play.calls.every(call => call.t >= BEATS.C), 'and a tap on nothing before C calls nothing');
});

test('a tap on the land in F brings the big call early, and it comes only once', () => {
  const { c, log } = eager;
  const big = c.play.calls.filter(call => call.id === 'land');
  assert.equal(big.length, 1);
  assert.equal(big[0].how, 'tap');
  assert.ok(big[0].t > log.land && big[0].t < 135, `early: ${big[0].t.toFixed(2)} (tapped ${log.land.toFixed(2)})`);
  // her line about Grameðla is not cut: the call waits for it, and the lines after wait for the call
  for (const run of [untouched, eager, mashed]) {
    // (a line's `to` is the frame that saw it end, up to a frame after it did)
    const lines = run.log.lines.filter(l => l.to !== null).sort((a, b) => a.from - b.from);
    for (let i = 1; i < lines.length; i++) {
      assert.ok(lines[i].from >= lines[i - 1].to - 1 / 30, `${lines[i].id} at ${lines[i].from.toFixed(2)} over ${lines[i - 1].id} (to ${lines[i - 1].to.toFixed(2)})`);
    }
  }
  const call = log.lines.find(l => l.id === 'k4_flugedla_call1' && l.from >= BEATS.F);
  assert.ok(call && Math.abs(call.from - big[0].t) < 0.05, 'the call is said as it comes');
  assert.equal(log.lines.filter(l => l.id === 'k4_egill_all').length, 1, 'and Egill still sees it all');
});

test('mashing everything still meets every beat within 0.5 s', () => {
  const { task, director, c, world, log } = mashed;
  assert.equal(task.failed, false, String(task.error?.stack));
  assert.deepEqual(director.warnings, []);
  assert.ok(Math.abs(c.flight.ended - c.flight.started - BEATS.END) < 0.05, 'the flight ends at 170 s');
  for (const { scene, at } of world.chapterTimeline) {
    const t = at - c.flight.started;
    assert.ok(Math.abs(t - BEATS[scene]) <= 0.5, `${scene} at ${t.toFixed(2)} s`);
    // from the falls on (the big moments, spec 6), where she is then: within half a second of flying of where the schedule has her
    if (BEATS[scene] < BEATS.E) continue;
    const f = log.frames.find(x => x.t >= BEATS[scene]);
    const off = Math.abs(f.u - c.route.progressAt(f.t)) * c.route.length;
    assert.ok(off <= 0.5 * c.route.speedAt(f.t), `${scene}: ${off.toFixed(1)} m from her place`);
  }
  assert.deepEqual(c.play.calls.filter(call => call.id !== 'land').map(call => call.id), groupIds, 'each group once');
  assert.equal(c.play.calls.filter(call => call.id === 'land').length, 1, 'the big call once');
});

test('seeking twice to t=90 puts her in the same place', async () => {
  const again = watcher({ at: [90] });
  await playUnattended(flugModule, { limit: 95, seeking: true, onFrame: again.onFrame });
  assert.ok(full.seen.places[90] && again.seen.places[90]);
  assert.ok(full.seen.places[90].distanceTo(again.seen.places[90]) < 1e-9, `${full.seen.places[90].toArray()} and ${again.seen.places[90].toArray()}`);
});
