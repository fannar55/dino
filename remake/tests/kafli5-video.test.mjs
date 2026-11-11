// The music video's clock (chapters/kafli5-video.js): the dance beat that everything moving to the set reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BENDS, danceBeatAt, sectionAt } from '../chapters/kafli5-video.js';
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
