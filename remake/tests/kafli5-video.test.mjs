// The music video's clock (chapters/kafli5-video.js): the dance beat that everything moving to the set reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BENDS, CAMERA, danceBeatAt, sectionAt } from '../chapters/kafli5-video.js';
import { SHOTS, GROUP_SHOTS } from '../chapters/kafli5-pool.js';
import { SONG } from '../chapters/kafli5-set.js';

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
// as the flight has its own rule: in the set a shot lasts a bar at least, but for the few marked quick.
const BEAT = 60 / SONG.bpm;
const PEAK = Math.PI / 2; // a move eased in and out is this much faster in its middle than on average

test('the camera is cut to the set: every part has its shot, on the bar, a bar apart at least but for the quick ones', () => {
  assert.ok(CAMERA.length >= 45, `${CAMERA.length} cuts`);
  for (const [k, entry] of CAMERA.entries()) {
    assert.ok(SHOTS[entry.cut], `cut ${k} at ${entry.beat}: "${entry.cut}" is a shot`);
    assert.ok(Number.isInteger(entry.beat), `cut ${k} on a beat (${entry.beat})`);
    if (k === 0) continue;
    const apart = entry.beat - CAMERA[k - 1].beat;
    assert.ok(apart > 0, `cut ${k} after the one before`);
    if (!entry.quick && !CAMERA[k - 1].quick) assert.ok(apart >= 4, `the shot before the cut at ${entry.beat} lasts a bar (${apart} beats)`);
    assert.notEqual(entry.cut, CAMERA[k - 1].cut, `the cut at ${entry.beat} is to another shot`);
  }
  // nothing bends the picture's clock with a cut inside it: the rewind spools one shot back, and the freeze begins in the shot it is in
  assert.ok(!CAMERA.some(entry => entry.beat > BENDS.rewind.from && entry.beat < BENDS.rewind.to), 'no cut in the rewind');
  assert.ok(!CAMERA.some(entry => entry.beat === BENDS.freeze.from), 'no cut on "Stopp!"');
  // quick cuts are few: the three looks at the frogs and the countdown
  const quick = CAMERA.filter(entry => entry.quick).map(entry => entry.beat);
  assert.ok(quick.length <= 9 && quick.every(at => (at >= 160 && at <= 162) || (at >= 286 && at <= 296)), `quick: ${quick}`);
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
