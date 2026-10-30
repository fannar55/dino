// The tools of Slóeðla's new song system: the variety check (every song its own) and, later, the stem charts and the music
// tool's own forms. The owner's lean rule: a few tests of the fiddly parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formOf, tapLikeness, tapsOf, varietyProblems } from '../tools/sloedla-variety.mjs';
import { SONGS } from '../engine/sloedla/songs/index.js';
import { SONGS_V2 } from '../engine/sloedla/v2/songs/index.js';
import { PRESETS, planOf, sectionsOf } from '../tools/sloedla-music.mjs';
import { gridOnsets, onsetStrength, pickChart } from '../tools/sloedla-stem-chart.mjs';
import { makeSong } from './sloedla-v2-fixture.mjs';

const madeOld = entry => !entry.file || fs.existsSync(new URL(`../engine/sloedla/songs/${entry.file}`, import.meta.url));
const madeNew = entry => fs.existsSync(new URL(`../engine/sloedla/v2/songs/${entry.file}`, import.meta.url));

test('variety: taps, form and likeness; every v2 song is its own', async () => {
  const song = makeSong();
  assert.equal(formOf(song), '2A 8B 8C 8B 4D');
  const taps = tapsOf(song);
  assert.equal(taps.length, 30);
  assert.equal(taps[2], 'a0,c4');
  assert.equal(taps[3], 'b0,c4');
  assert.equal(tapLikeness(['a0', 'b4'], ['a0', 'c4']), 0.5);
  const fresh = await Promise.all(SONGS_V2.filter(madeNew).map(async entry => (await entry.load()).default));
  const old = await Promise.all(SONGS.filter(madeOld).map(async entry => (await entry.load()).default));
  assert.ok(fresh.length >= 1 && old.length >= 4);
  assert.ok(tapsOf(old[0]).length > 30, 'an old song has its taps too');
  assert.deepEqual(varietyProblems(fresh, [...old, ...fresh]), []);
  assert.ok(varietyProblems([song], [song, { ...song, id: 'twin' }]).some(p => p.includes('twin')), 'a twin is caught');
});

test('music tool: a preset\'s own form and words; old presets as before', () => {
  const rokk = sectionsOf('rokk');
  assert.equal(rokk.length, 8);
  assert.equal(rokk.reduce((sum, s) => sum + s.bars, 0), 56);
  assert.ok(planOf('rokk').chunks[0].negative_styles.includes('prominent lead melody'));
  const own = { ...PRESETS.rokk, form: [['Intro', 'intro', 2, ['drums alone']], ['A', 'verse', 8]], negative: ['x'] };
  assert.deepEqual(sectionsOf(own).map(s => s.bars), [2, 8]);
  const plan = planOf(own);
  assert.equal(plan.chunks.length, 2);
  assert.ok(plan.chunks[0].positive_styles.includes('drums alone'));
  assert.deepEqual(plan.chunks[0].negative_styles, ['x']);
});

test('stem chart: onsets on the beat from a click track; the child\'s notes two beats apart, shared fairly, never on top of a fixed note', () => {
  const rate = 22050;
  const samples = new Float32Array(rate * 60);
  for (let t = 0; t < 60; t += 0.5) {
    const at = Math.round(t * rate);
    for (let k = 0; k < 200; k++) samples[at + k] = 0.8 * Math.exp(-k / 40) * (k % 2 ? 1 : -1);
  }
  const onsets = gridOnsets(onsetStrength(samples, rate), { bpm: 120, offset: 0, slotsPerBeat: 2, length: 60 });
  const beats = onsets.map(o => o.beat);
  for (let b = 1; b <= 118; b++) assert.ok(beats.includes(b), `an onset on beat ${b}`);
  assert.ok(beats.every(b => Number.isInteger(b)), 'none between the beats');
  const every = Array.from({ length: 120 }, (_, beat) => ({ beat, strength: 1 }));
  const layers = { a: 'piano', b: 'bass', c: 'drums' };
  const chart = pickChart({ onsets: { a: every, b: every, c: every }, layers, level: 'barn', bpm: 120, length: 60, fixed: [{ beat: 41, owner: 'a' }] });
  const sorted = chart.map(n => n.beat).sort((x, y) => x - y);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= 2, `${sorted[i - 1]} and ${sorted[i]}`);
  assert.ok(sorted[0] * 0.5 >= 2.5);
  assert.ok(!sorted.some(b => Math.abs(b - 41) < 2));
  const counts = ['a', 'b', 'c'].map(owner => chart.filter(n => n.owner === owner).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, String(counts));
  assert.ok(chart.every(n => n.layer === layers[n.owner]));
});
