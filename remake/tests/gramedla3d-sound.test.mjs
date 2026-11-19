// Grameðla kemur!'s sound (chapters/gramedla3d/soundtrack.js): hung on the timeline's cues in order, her footfalls by distance,
// Egill's two lines in lines.json and heard only, every recording on disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { soundEvents, stepAt, LINES, SOUND_FILES, SOUND } from '../chapters/gramedla3d/soundtrack.js';
import { CUES, cues, LENGTH } from '../chapters/gramedla3d/timeline.js';
import { chapter } from '../chapters/gramedla3d.js';

const REMAKE = new URL('../', import.meta.url);
const RIG = {
  '4a': { x: 0, z: -22.785, theta: 0, turn: 0, roll: 0, pitch: 0 },
  4: { x: 0.02, z: -3.859, theta: 0.4867, turn: -0.0088, roll: 0.22, pitch: 0 },
  5: { x: 0.824, z: 0.608, theta: 1.3141, turn: -0.17, roll: 0, pitch: 0 },
  6: { x: 0.439, z: -0.926, theta: 0.5388, turn: -0.07, roll: 0, pitch: -0.1 },
  7: { x: 0.607, z: 0.03, theta: 1.0554, turn: -0.17, roll: 0, pitch: -0.12 },
  '7b': { x: 0.531, z: -0.159, theta: 1.2977, turn: -0.17, roll: 0, pitch: -0.05 },
};

test('the sound follows the cues in order: forest, thumps, flock, wings, "Hún kemur!", footfalls, sniffs, breath, roar, huff, "Bless"', () => {
  const events = soundEvents(RIG);
  for (let i = 1; i < events.length; i++) assert.ok(events[i].t >= events[i - 1].t, `in order at ${events[i].t}`);
  assert.ok(events.every(e => e.t >= 0 && e.t < LENGTH), 'all within the show');
  const at = (t, pick) => events.filter(e => Math.abs(e.t - t) < 1e-6 && pick(e));
  // the cue-to-sound mapping
  assert.equal(events[0].bed, 1, 'the forest first');
  for (const t of CUES.thump) assert.equal(at(t, e => e.sound === 'thump').length, 1, `a far thump at ${t}`);
  assert.ok(at(CUES.birdsUp, e => e.sound === 'flutter').length === 1, 'the flock bursts at birdsUp');
  const all = cues(RIG);
  for (const t of all.wings) assert.equal(at(t, e => /^wing\d$/.test(e.sound)).length, 1, `a wing beat at ${t}`);
  for (const step of all.steps) assert.equal(at(step.t, e => e.sound === 'thump').length, 1, `a footfall at ${step.t}`);
  for (const t of CUES.sniff) assert.equal(at(t, e => e.sound === 'exhale').length, 1, `a sniff at ${t}`);
  assert.equal(at(CUES.breathIn, e => e.sound === 'exhale' && e.reverse).length, 1, 'the breath in');
  assert.equal(at(+(CUES.roar + SOUND.roarLead).toFixed(3), e => e.sound === 'roar' && e.db === 0).length, 1, 'the roar, full');
  assert.equal(at(CUES.huff, e => e.sound === 'exhale').length, 1, 'the huff');
  assert.deepEqual(events.filter(e => e.line).map(e => [e.t, e.line]), [[CUES.hunKemur, 'g3_egill_kemur'], [CUES.bless, 'g3_egill_bless']]);
  // the order of the story
  const first = pick => events.find(pick).t;
  const order = [
    first(e => e.bed === 1), first(e => e.sound === 'thump'), first(e => e.sound === 'flutter'), first(e => /^wing/.test(e.sound) && e.what.startsWith('Flugeðla')),
    first(e => e.line === 'g3_egill_kemur'), first(e => e.what.startsWith('her ')), first(e => e.what === 'a sniff'), first(e => e.sound === 'roar'),
    first(e => e.what === 'a soft huff'), first(e => e.line === 'g3_egill_bless'),
  ];
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // the forest drops away for the thumps and the stillness, and goes with the fade
  const beds = events.filter(e => e.bed !== undefined).map(e => e.bed);
  assert.deepEqual(beds, [1, SOUND.bed.thumps, 1, SOUND.bed.still, 0]);
});

test('her footfalls: far ones quiet and dull, near ones full and open', () => {
  assert.deepEqual(stepAt(SOUND.far), { db: SOUND.step.far, cutoff: SOUND.stepCutoff });
  assert.deepEqual(stepAt(SOUND.near), { db: SOUND.step.near, cutoff: null });
  let last = stepAt(40);
  for (let d = 39; d >= 5; d--) {
    const now = stepAt(d);
    assert.ok(now.db >= last.db && (now.cutoff === null || (last.cutoff !== null && now.cutoff >= last.cutoff)), `louder and brighter nearer, at ${d} m`);
    last = now;
  }
  const steps = soundEvents(RIG).filter(e => e.what.startsWith('her '));
  assert.ok(steps[0].db <= -17 && steps[0].cutoff <= 300, 'the first ones far up the lane');
  assert.ok(Math.max(...steps.map(e => e.db)) >= -4.5, 'the nearest nearly full');
});

test('Egill\'s two lines are in lines.json, in the chapter, and heard only (no caption)', () => {
  const lines = JSON.parse(fs.readFileSync(new URL('assets/audio/lines.json', REMAKE), 'utf8'));
  for (const [id, text] of Object.entries(LINES)) {
    assert.ok(lines[id], `${id} is in lines.json`);
    assert.ok(fs.existsSync(new URL(lines[id].src, REMAKE)), `${id}'s recording is there`);
    assert.deepEqual(chapter.lines[id], { text, audio: id });
  }
  const source = fs.readFileSync(new URL('chapters/gramedla3d.js', REMAKE), 'utf8');
  assert.match(source, /s\.say\('egill', e\.line, \{ hold: 0, caption: false, listen: false \}\)/);
});

test('every recording the show plays is on disk', () => {
  for (const [name, file] of Object.entries(SOUND_FILES)) assert.ok(fs.existsSync(new URL(file, REMAKE)), `${name}: ${file}`);
  for (const e of soundEvents(RIG).filter(e => e.sound)) assert.ok(SOUND_FILES[e.sound], `${e.sound} is known`);
});
