// The music video's clock (chapters/kafli5-video.js): the dance beat that everything moving to the set reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BENDS, CAMERA, danceBeatAt, sectionAt, shielded } from '../chapters/kafli5-video.js';
import { SHOTS, SHOWS, GROUPS, GROUP_SHOTS, seatsOf } from '../chapters/kafli5-pool.js';
import { SONG } from '../chapters/kafli5-set.js';
import { danceOf, memberOf } from '../chapters/kafli5-dances.js';
import { flugedlaAt, clockAt } from '../chapters/kafli5-people-score.js';
import { FAR_POOL, createRoute } from '../chapters/kafli4-route.js';
import { createDirector } from '../engine/camera/director.js';
import { createPointResolver } from '../engine/points.js';
import { createTerrain } from '../world/ardalur/terrain.js';

test('the bends are the set\'s own cues: the rewind into the second drop, and the freeze of Stoppdans', () => {
  const part = id => SONG.set.sections.find(section => section.id === id);
  assert.equal(BENDS.rewind.from, part('rewind').startBeat);
  assert.equal(BENDS.rewind.to, part('redrop').startBeat);
  assert.equal(BENDS.rewind.from - BENDS.rewind.back, part('drop').startBeat, 'it spools back to the drop\'s first beat');
  assert.ok(BENDS.freeze.from > part('freeze').startBeat && BENDS.freeze.to === part('carnival').startBeat, 'frozen from "Stopp!" to the carnival\'s first beat');
});

test('the dance beat is the set\'s beat, runs back through the rewind, stands in the freeze and snaps back after it', () => {
  assert.deepEqual(danceBeatAt(100), { beat: 100, frozen: false, rewinding: false });
  const { rewind, freeze } = BENDS;
  // through the rewind it runs backwards, twice as fast, with no jump at either end
  assert.ok(Math.abs(danceBeatAt(rewind.from - 1e-6).beat - danceBeatAt(rewind.from).beat) < 1e-5);
  assert.ok(danceBeatAt(rewind.from + 1).rewinding && Math.abs(danceBeatAt(rewind.from + 1).beat - (rewind.from - 2)) < 1e-9);
  assert.ok(Math.abs(danceBeatAt(rewind.to - 1e-6).beat - danceBeatAt(rewind.to).beat) < 1e-5, 'the drop comes again from where the spool ended');
  assert.equal(danceBeatAt(rewind.to).beat, rewind.from - rewind.back);
  // then forward again, whole beats behind the set (so every dance stays on the beat and on the bar)
  const lost = rewind.to + 10 - danceBeatAt(rewind.to + 10).beat;
  assert.equal(lost, 12);
  assert.equal(lost % 4, 0, 'whole bars');
  // the freeze: one beat all the way, then the set's beat at once
  const held = danceBeatAt(freeze.from).beat;
  for (const at of [freeze.from, freeze.from + 3.3, freeze.to - 1e-6]) assert.deepEqual(danceBeatAt(at), { beat: held, frozen: true, rewinding: false });
  assert.ok(Math.abs(danceBeatAt(freeze.from - 1e-6).beat - held) < 1e-5, 'no jump into the freeze');
  assert.deepEqual(danceBeatAt(freeze.to), { beat: freeze.to, frozen: false, rewinding: false });
  // nowhere else does it jump: a 30th of a second is 0.07 beats
  const step = (1 / 30) / (60 / SONG.bpm);
  for (let at = 0; at < SONG.set.endBeat; at += step) {
    if (at + step >= freeze.to && at < freeze.to) continue; // the snap out of the freeze
    assert.ok(Math.abs(danceBeatAt(at + step).beat - danceBeatAt(at).beat) <= 2 * step + 1e-9, `at ${at.toFixed(2)}`);
  }
});

test('sectionAt names the set\'s part at a beat', () => {
  assert.equal(sectionAt(0).id, 'arrival');
  assert.equal(sectionAt(150).id, 'turtles');
  assert.equal(sectionAt(SONG.set.endBeat).id, 'end');
  assert.equal(sectionAt(-1), null);
});

// The camera (CAMERA): what the set is cut to. The style's own speeds hold (STYLE.md section 8); its 2.5 s between cuts does not,
// as the flight has its own rule: in the set a shot lasts a bar at least, but for the ones marked quick.
const BEAT = 60 / SONG.bpm;
const PEAK = Math.PI / 2; // a move eased in and out is this much faster in its middle than on average
const END = SONG.set.endBeat + 4; // the last shot holds while the last hit rings
/** How many beats the shot cut to by CAMERA's entry `k` lasts. */
const lasts = k => (CAMERA[k + 1]?.beat ?? END) - CAMERA[k].beat;
/** The shot on the screen at the set's beat `beat`. */
const shotAt = beat => CAMERA.findLast(entry => entry.beat <= beat).cut;
const line = id => SONG.set.lines.find(entry => entry.id === id).beat;
const cues = kind => SONG.set.cues.filter(cue => cue.kind === kind);

// Shots shorter than a bar (`quick`) are only in these runs of the set, and none is under `least` beats. The floor is two beats
// (0.96 s): what the countdown has had from the start, long enough for a six-year-old to see who it is and one move of theirs. A
// single beat (0.48 s) is kept for two runs where every picture is the same kind as the one before it and the sound says what it
// is: three looks at the frogs, each nearer, and the five last hits, a group on each as it sings its own note.
const QUICK_RUNS = [
  { from: 160, to: 162, least: 1 }, // "frosk- frosk- froskadjamm!": three looks at the frogs
  { from: 192, to: 194, least: 2 }, // the flyers take off, over the camera
  { from: 264, to: 266, least: 2 }, // "Vængina upp!", before "Hendur upp, Egill!" goes to him
  { from: 286, to: 296, least: 2 }, // the countdown: a group a number
  { from: 312, to: 320, least: 2 }, // the drop's second coming: a group a half bar
  { from: 432, to: 456, least: 2 }, // the last chorus: two groups between her horn's answers
  { from: 460, to: 465, least: 1 }, // the five last hits: a group a hit
];

test('the camera is cut to the set: every part has its shot, on the beat, a bar long at least but for the quick ones', () => {
  assert.ok(CAMERA.length >= 45, `${CAMERA.length} cuts`);
  for (const [k, entry] of CAMERA.entries()) {
    assert.ok(SHOTS[entry.cut], `cut ${k} at ${entry.beat}: "${entry.cut}" is a shot`);
    assert.ok(Number.isInteger(entry.beat), `cut ${k} on a beat (${entry.beat})`);
    if (k > 0) {
      assert.ok(entry.beat > CAMERA[k - 1].beat, `cut ${k} after the one before`);
      assert.notEqual(entry.cut, CAMERA[k - 1].cut, `the cut at ${entry.beat} is to another shot`);
    }
    // a shot lasts a bar, or it is marked quick, stands in one of the quick runs, is not under the run's floor and does not move
    const beats = lasts(k);
    assert.equal(Boolean(entry.quick), beats < 4, `the shot at ${entry.beat} lasts ${beats} beats: quick says so, and only then`);
    if (!entry.quick) continue;
    const run = QUICK_RUNS.find(({ from, to }) => entry.beat >= from && entry.beat + beats <= to);
    assert.ok(run, `the quick shot at ${entry.beat} is inside a run of quick shots`);
    assert.ok(beats >= run.least, `the quick shot at ${entry.beat} lasts ${beats} beats (${run.least} at least there)`);
    assert.equal(entry.then, undefined, `the quick shot at ${entry.beat} stands still`);
  }
  // nothing bends the picture's clock with a cut inside it: the rewind spools one shot back, and the freeze begins in the shot it is in
  assert.ok(!CAMERA.some(entry => entry.beat > BENDS.rewind.from && entry.beat < BENDS.rewind.to), 'no cut in the rewind');
  assert.ok(!CAMERA.some(entry => entry.beat === BENDS.freeze.from), 'no cut on "Stopp!"');
  // quick shots come in short runs (five at most, as the countdown), and a shot of a bar or more follows each run
  const quick = CAMERA.map(entry => Boolean(entry.quick));
  assert.ok(quick.filter(Boolean).length <= 30, `${quick.filter(Boolean).length} quick shots`);
  for (let k = 0; k + 5 < quick.length; k++) assert.ok(!quick.slice(k, k + 6).every(Boolean), `six quick shots in a row from ${CAMERA[k].beat}`);
  // every part of the set is seen in a shot of its own choosing, and each group's part in the group's own shots
  for (const section of SONG.set.sections) {
    const cuts = CAMERA.filter(entry => entry.beat >= section.startBeat && entry.beat < section.startBeat + section.beats);
    if (section.id !== 'rewind') assert.ok(cuts.length >= 1, `${section.id} has a cut`);
    if (GROUP_SHOTS[section.feature] && section.id !== 'freeze') {
      const own = Object.values(GROUP_SHOTS[section.feature]);
      assert.ok(cuts.some(entry => own.includes(entry.cut)) || cuts.some(entry => entry.cut.startsWith(`set_${section.feature}`)), `${section.id} shows the ${section.feature}`);
    }
  }
  // close and far: many different shots, the groups' close ones among them
  const used = new Set(CAMERA.map(entry => entry.cut));
  assert.ok(used.size >= 14, `${used.size} different shots`);
  for (const group of Object.keys(GROUP_SHOTS)) assert.ok(used.has(GROUP_SHOTS[group].close) && used.has(GROUP_SHOTS[group].all), `${group} close and whole`);
});

// --- what the cut shows (the owner's list of 2026-11-18: the animals close on the big moments, a stop-dance and a rewind that
// are seen, Egill shown when the room is asked to clap, lift its hands and hop, and the countdown's cuts on the numbers) ---

const WIDE = ['choir_wide', 'set_low_wide', 'set_water_low']; // the three shots of the whole pool: the dancers are specks in them
const DROP = SONG.set.sections.find(section => section.id === 'drop').startBeat;
/** The share of the set from beat `from` on that the three wide shots hold. */
const wideShare = from => CAMERA.reduce((sum, entry, k) => sum + (WIDE.includes(entry.cut) ? Math.max(0, entry.beat + lasts(k) - Math.max(entry.beat, from)) : 0), 0) / (END - from);
const groupOf = shot => [...GROUPS, 'beetles'].find(group => shot.startsWith(`set_${group}`)) ?? (shot === 'set_wheel' ? 'flyers' : null);

test('from the drop on the animals are seen close: the wide shots hold a third of it, and every group has its close shot', () => {
  assert.ok(wideShare(0) <= 0.36, `the wide shots hold ${(100 * wideShare(0)).toFixed(1)} % of the set`);
  assert.ok(wideShare(DROP) <= 0.36, `the wide shots hold ${(100 * wideShare(DROP)).toFixed(1)} % from the drop on`);
  for (const group of [...GROUPS, 'beetles']) {
    assert.ok(CAMERA.some(entry => entry.beat >= DROP && groupOf(entry.cut) === group && !entry.cut.endsWith('_run')), `the ${group} are seen close after the drop`);
  }
  // the drop's second coming and the last chorus go from group to group
  const groupsIn = id => {
    const { startBeat, beats } = SONG.set.sections.find(section => section.id === id);
    return new Set(CAMERA.filter(entry => entry.beat >= startBeat && entry.beat < startBeat + beats).map(entry => groupOf(entry.cut)).filter(Boolean));
  };
  assert.ok(groupsIn('redrop').size >= 5, `the second drop shows ${[...groupsIn('redrop')]}`);
  assert.ok(groupsIn('lastchorus').size >= 4, `the last chorus shows ${[...groupsIn('lastchorus')]}`);
  // the five last hits: each group in its close shot on the hit it sings, high to low (kafli5-dances.js MOVES.end poses them so)
  const hits = SONG.set.sections.find(section => section.id === 'end').startBeat;
  [...GROUPS].reverse().forEach((group, k) => {
    assert.ok(cues('call').some(cue => cue.group === group && cue.beat === hits + k), `the ${group} sing on ${hits + k}`);
    assert.ok(CAMERA.some(entry => entry.beat === hits + k && entry.cut === GROUP_SHOTS[group].close), `the hit on ${hits + k} is cut to the ${group}, close`);
  });
  // where the music wants air it has it: a drop's first hit, the forest's answers and the last hit of all are wide
  for (const beat of [BENDS.rewind.to, line('louder') + 2, SONG.set.endBeat]) assert.ok(WIDE.includes(shotAt(beat)), `wide on ${beat}`);
});

test('the countdown is cut on the numbers: each number with its group, low to high', () => {
  const counts = cues('count');
  assert.deepEqual(counts.map(cue => cue.n), [5, 4, 3, 2, 1]);
  counts.forEach(cue => {
    const group = GROUPS[5 - cue.n];
    const cut = CAMERA.find(entry => entry.beat === cue.beat);
    assert.ok(cut && groupOf(cut.cut) === group, `"${cue.n}" (${cue.beat}) is cut to the ${group}: ${cut?.cut}`);
  });
});

test('Stoppdans is seen: close on the frogs as "Stopp!" catches them, Egill hanging in his jump, and no cut hides "Dansa!"', () => {
  const { from: stopp, to: dansa } = BENDS.freeze;
  const k = CAMERA.findLastIndex(entry => entry.beat <= stopp);
  assert.equal(groupOf(CAMERA[k].cut), 'frogs', `"Stopp!" is seen in ${CAMERA[k].cut}`);
  assert.ok(stopp - CAMERA[k].beat <= 2, 'the cut to the frogs is just before it: they are seen leaping, then caught');
  // the camera goes on moving through the frozen picture: that is what says it is frozen
  const { then } = CAMERA[k];
  assert.ok(then && CAMERA[k].beat + then.beats >= stopp + 2, 'the camera moves on while the frogs hang');
  // the moment everything moves again is inside a shot, and that shot is Egill's: he comes down out of his frozen jump
  assert.ok(!CAMERA.some(entry => entry.beat === dansa), 'no cut on the beat everything moves again');
  const j = CAMERA.findLastIndex(entry => entry.beat <= dansa);
  assert.equal(CAMERA[j].cut, 'set_egill_close');
  assert.ok(dansa - CAMERA[j].beat >= 2 && CAMERA[j].beat + lasts(j) - dansa >= 2, 'he is seen frozen, and seen starting again');
});

test('"Aftur!" is seen: the rewind is held close on the turtles, who spin on their shells there, and the first drop on Flugeðla', () => {
  const { from, to } = BENDS.rewind;
  const k = CAMERA.findLastIndex(entry => entry.beat <= from);
  assert.equal(CAMERA[k].cut, 'set_turtles_close');
  assert.ok(from - CAMERA[k].beat >= 2, 'they are seen spinning forwards first');
  assert.ok(CAMERA[k].beat + lasts(k) >= to, 'and backwards to the end of the spool');
  assert.equal(shotAt(DROP), 'set_drop', '"Nú!": Flugeðla up out of the pool');
});

test('Egill shows what the room is asked to do: the claps, his hands up and both "Hopp!"', () => {
  const claps = cues('clap').map(cue => cue.beat);
  const close = (beat, what) => assert.equal(shotAt(beat), 'set_egill_close', `${what} (${beat})`);
  // "Klappið með!": the band's first three claps are his, close
  claps.slice(0, 3).forEach(beat => close(beat, 'a clap of the warm-up'));
  // "Hendur upp, Egill!": his hands go up in his own shot and stay up in it for a bar
  const up = line('wings') + 2.2; // kafli5-people-score.js: his hands start up two beats into her line
  close(up, 'his hands going up');
  close(up + 4, 'his hands up');
  // the carnival: two claps running and the first "Hopp!" close on him; he is in the picture for the second
  const [first, second] = [line('hopp'), line('hopp-2')];
  claps.filter(beat => beat > first - 4 && beat < first).forEach(beat => close(beat, 'a clap of the carnival'));
  close(first, 'the first "Hopp!"');
  close(first + 1, 'and its landing');
  for (const beat of [second, second + 1]) assert.ok(SHOWS[shotAt(beat)].includes('egill'), `Egill is in ${shotAt(beat)} for the second "Hopp!" (${beat})`);
});

// What is inside a shot's frame: the dances and the people's scores at a beat, seen by the real director's camera on a 16:10
// screen and on a tablet held upright (it keeps the 16:10 frame's width there).
const terrain = createTerrain(createRoute(), { seed: 4 });
const ground = (x, z) => terrain.heightAt(x, z);
const wet = (x, z) => Math.hypot(x - FAR_POOL.center[0], z - FAR_POOL.center[1]) < FAR_POOL.radius;
const TALL = { grazers: 2.6, turtles: 0.7, frogs: 0.75, lizards: 0.6, flyers: 0.9 }; // m: a member's top over its feet
const ON = { turtles: 1.8 }; // m: the turtles sit on top of their stone
const members = Object.fromEntries(GROUPS.map(group => {
  const seats = seatsOf(group).map(({ at, heading }) => ({ x: at[0], y: (wet(...at) ? FAR_POOL.level : ground(...at)) + (ON[group] ?? 0), z: at[1], heading }));
  return [group, seats.map((_, k) => memberOf(group, k, seats))];
}));
/** `group`'s members at the set's beat `setBeat`: [{ feet, top, up }] (Vector3s, and metres off its seat's height). */
function dancersAt(group, setBeat) {
  return members[group].map(m => {
    const pose = danceOf(m, danceBeatAt(setBeat).beat, { ground, setBeat });
    const feet = new THREE.Vector3(m.x + pose.dx, m.y + pose.dy, m.z + pose.dz);
    return { feet, top: feet.clone().add(new THREE.Vector3(0, TALL[group], 0)), up: pose.dy };
  });
}
/** Asks whether a point is in the frame of CAMERA's shot at `setBeat` (its move played up to then), on a screen `aspect` wide. */
function frameAt(setBeat, aspect) {
  const k = CAMERA.findLastIndex(entry => entry.beat <= setBeat);
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 2000);
  const world = { camera, heightAt: ground, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const director = createDirector({ camera, world, shots: SHOTS, lint: false });
  director.cut(CAMERA[k].cut, { check: false });
  const { then } = CAMERA[k];
  if (then?.push !== undefined) director.push({ distance: then.push, duration: then.beats * BEAT });
  else if (then?.orbit !== undefined) director.orbit({ degrees: then.orbit, duration: then.beats * BEAT });
  else if (then?.zoom !== undefined) director.zoom(then.zoom, { duration: then.beats * BEAT });
  for (let t = 0; t < (setBeat - CAMERA[k].beat) * BEAT - 1e-9; t += 1 / 30) director.update(1 / 30);
  camera.updateMatrixWorld();
  const holds = (point, edge = 0) => { const p = point.clone().project(camera); return p.z < 1 && Math.abs(p.x) <= 1 - edge && Math.abs(p.y) <= 1 - edge; };
  return { shot: CAMERA[k].cut, holds, whole: dancer => holds(dancer.feet) && holds(dancer.top) };
}
const ASPECTS = [1.6, 0.625];

test('the quick shots hold what they are cut to: each group whole in its frame as it pops up on its number, at 16:10 and upright', () => {
  for (const cue of cues('count').filter(count => count.n > 1)) {
    const group = GROUPS[5 - cue.n];
    for (const aspect of ASPECTS) {
      for (const beat of [cue.beat + 0.1, cue.beat + 1.3, cue.beat + 1.5, cue.beat + 1.7]) { // as the cut lands, and up in the air
        const frame = frameAt(beat, aspect);
        const out = dancersAt(group, beat).filter(dancer => !frame.whole(dancer)).length;
        assert.equal(out, 0, `${out} of the ${group} out of ${frame.shot} at ${beat} (${aspect})`);
      }
    }
  }
});

test('"Stopp!" catches two frogs in the air inside the frame, and they hang there while the camera moves', () => {
  const { from: stopp } = BENDS.freeze;
  for (const aspect of ASPECTS) {
    for (const beat of [stopp, stopp + 1, stopp + 1.9]) {
      const frame = frameAt(beat, aspect);
      const frogs = dancersAt('frogs', beat);
      const hanging = frogs.filter(frog => frog.up > 0.3);
      assert.equal(hanging.length, 2, `${hanging.length} frogs in the air at ${beat}`);
      assert.ok(hanging.every(frame.whole), `the frogs in the air are in ${frame.shot} at ${beat} (${aspect})`);
      assert.ok(frogs.filter(frame.whole).length >= 4, `the pads round them too (${aspect})`);
    }
    // and the cut to them lands on a leap: one is in the air as the shot begins
    const first = CAMERA.findLast(entry => entry.beat <= stopp).beat;
    const frame = frameAt(first + 0.05, aspect);
    assert.ok(dancersAt('frogs', first + 0.05).some(frog => frog.up > 0.3 && frame.whole(frog)), `a frog is in the air as the shot begins (${aspect})`);
  }
});

test('the drop\'s shot holds Flugeðla from the water to the top of her climb, the sun behind her', () => {
  const body = beat => { const { at } = flugedlaAt(clockAt(beat)); return new THREE.Vector3(at[0], at[1] + 2.6, at[2]); }; // she flies 2.6 m over her path
  for (const aspect of ASPECTS) {
    for (let beat = DROP; beat < DROP + lasts(CAMERA.findIndex(entry => entry.beat === DROP)) - 0.2; beat += 0.25) {
      const frame = frameAt(beat, aspect);
      assert.ok(frame.holds(body(beat), 0.04), `she is in ${frame.shot} at ${beat} (${aspect})`);
    }
  }
  // it looks toward the low sun (kafli5-pool.test.mjs lets it: it is dusk by then, as for set_sun), and she climbs across it
  const { position, target } = SHOTS.set_drop;
  const way = (Math.atan2(target[2] - position[2], target[0] - position[0]) * 180) / Math.PI;
  const toHer = beat => (Math.atan2(body(beat).z - position[2], body(beat).x - position[0]) * 180) / Math.PI;
  const SUN = 215;
  assert.ok(Math.abs(((way - SUN + 540) % 360) - 180) <= 25, 'the sun is in the frame');
  assert.ok(Math.abs(((toHer(DROP + 1) - SUN + 540) % 360) - 180) <= 6, 'and she goes up across it');
});

test('the flyers are in their frames: taking off toward the camera, and in their wheel when the drop comes back', () => {
  for (const aspect of ASPECTS) {
    // their part: all four whole in the frame for the first beat and a half of the take-off (they pass over the camera on the cut)
    const start = SONG.set.sections.find(section => section.id === 'flyers').startBeat;
    for (const beat of [start, start + 0.5, start + 1, start + 1.5]) {
      const frame = frameAt(beat, aspect);
      assert.equal(frame.shot, 'set_flyers');
      assert.equal(dancersAt('flyers', beat).filter(frame.whole).length, 4, `the flyers in set_flyers at ${beat} (${aspect})`);
    }
    // the wheel: three of the four in the frame all the way
    const k = CAMERA.findIndex(entry => entry.cut === 'set_wheel');
    for (let beat = CAMERA[k].beat; beat < CAMERA[k].beat + lasts(k); beat += 0.25) {
      const inFrame = dancersAt('flyers', beat).filter(frameAt(beat, aspect).whole).length;
      assert.ok(inFrame >= 3, `${inFrame} flyers of the wheel in the frame at ${beat} (${aspect})`);
    }
  }
});

test('the second drop\'s shots hold the wildest of each dance: the lizards\' ring and the frogs\' leaps whole in their frames', () => {
  for (const aspect of ASPECTS) {
    for (const group of ['lizards', 'frogs', 'grazers']) {
      const k = CAMERA.findIndex(entry => entry.beat >= BENDS.rewind.to && groupOf(entry.cut) === group);
      for (let beat = CAMERA[k].beat; beat < CAMERA[k].beat + lasts(k); beat += 0.25) {
        const frame = frameAt(beat, aspect);
        const dancers = dancersAt(group, beat);
        const whole = dancers.filter(frame.whole).length;
        assert.ok(whole >= dancers.length - 1, `${whole} of ${dancers.length} ${group} whole in ${frame.shot} at ${beat} (${aspect})`);
      }
    }
  }
});

test('every move of the camera in the set is slow enough for the style and over before the next cut', () => {
  const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const [k, entry] of CAMERA.entries()) {
    if (!entry.then) continue;
    const { then } = entry;
    const next = CAMERA[k + 1]?.beat ?? SONG.set.endBeat + 4;
    assert.ok(then.beats > 0 && entry.beat + then.beats <= next, `the move at ${entry.beat} ends by the cut at ${next}`);
    const seconds = then.beats * BEAT;
    assert.ok(seconds >= 1.5, `the move at ${entry.beat} takes ${seconds.toFixed(2)} s (1.5 at least)`);
    const shot = SHOTS[entry.cut];
    const reach = far(shot.position, shot.target);
    if (then.push !== undefined) assert.ok((Math.abs(then.push) / seconds) * PEAK <= 1.2, `the push at ${entry.beat}: ${((Math.abs(then.push) / seconds) * PEAK).toFixed(2)} m/s`);
    else if (then.orbit !== undefined) {
      assert.ok((Math.abs(then.orbit) / seconds) * PEAK <= 10, `the orbit at ${entry.beat}: ${((Math.abs(then.orbit) / seconds) * PEAK).toFixed(1)} deg/s`);
      const arc = (reach * Math.abs(then.orbit) * Math.PI) / 180;
      assert.ok((arc / seconds) * PEAK <= 1.2, `the orbit at ${entry.beat} carries the camera ${((arc / seconds) * PEAK).toFixed(2)} m/s`);
    } else if (then.zoom !== undefined) {
      assert.ok(then.zoom >= 24 && then.zoom <= 60 && (Math.abs(then.zoom - shot.fov) / seconds) * PEAK <= 8, `the zoom at ${entry.beat}`);
    } else assert.fail(`the move at ${entry.beat} is a push, an orbit or a zoom`);
  }
  assert.ok(CAMERA.filter(entry => entry.then).length >= 20, 'the camera moves in many of its shots');
});

test('a part of the video that throws is told of once and left out of that call; the others go on', () => {
  const said = [];
  const calls = [];
  const bad = shielded('dances', { update() { calls.push('update'); throw new Error('half built'); }, cue() { calls.push('cue'); }, dispose() { throw new Error('again'); } }, message => said.push(message));
  assert.doesNotThrow(() => { bad.update({ beat: 1 }); bad.update({ beat: 2 }); bad.cue({ kind: 'call' }); bad.dispose(); });
  assert.deepEqual(calls, ['update', 'update', 'cue'], 'it is still called every time');
  assert.equal(said.length, 2, 'said once for each of its calls that throws');
  assert.ok(/dances/.test(said[0]) && /update/.test(said[0]) && /half built/.test(said[0]), said[0]);
  const good = shielded('show', { update: v => v.beat * 2, cue() {}, dispose() {} }, () => assert.fail('nothing to say'));
  assert.equal(good.update({ beat: 4 }), 8, 'what a part returns comes through');
});
