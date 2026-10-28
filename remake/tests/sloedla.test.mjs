import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HIT_WINDOW, LEVELS, createJudge, createScore, count, laneOf, makeChart, starsFor, tierOf } from '../engine/sloedla/chart.js';
import { scaleOf } from '../engine/sloedla/sounds.js';

const SONG = new URL('../assets/audio/sloedla/dino-trail.json', import.meta.url);
const SHEET = new URL('../assets/audio/sloedla/dino-trail.notes.json', import.meta.url);

test('the sheet on disk is the one makeChart writes from the song\'s grid, on its beats', () => {
  const grid = JSON.parse(fs.readFileSync(SONG, 'utf8'));
  const sheet = JSON.parse(fs.readFileSync(SHEET, 'utf8'));
  assert.equal(sheet.bpm, grid.bpm);
  assert.equal(sheet.beatOffset, grid.beatOffset);
  const to = Math.floor(((sheet.duration - 4 - grid.beatOffset) * grid.bpm) / 60);
  for (const level of Object.keys(LEVELS)) {
    const notes = sheet.levels[level].notes;
    assert.deepEqual(notes, makeChart({ bpm: grid.bpm, beatOffset: grid.beatOffset, from: 8, to, level, seed: sheet.seed }), `${level}: tools/sloedla-chart.mjs wrote it`);
    for (const note of notes) assert.ok(Math.abs(note.t - (grid.beatOffset + (note.beat * 60) / grid.bpm)) < 1e-3, `${level}: note at beat ${note.beat} is on it`);
    assert.ok(notes.at(-1).t < sheet.duration - 4, `${level}: the song fades out after the last note`);
  }
  const child = sheet.levels.barn.notes;
  assert.ok(child.length >= 40 && child.length <= 60, `the child's level has a fair number of notes (${child.length})`);
  for (let i = 1; i < child.length; i++) assert.ok(child[i].beat - child[i - 1].beat >= 2, 'the child never has two notes closer than two beats');
  assert.ok(child.slice(0, 8).every(note => note.role === 'a'), 'Slóeðla opens the song alone');
});

test('a tap plays the nearest waiting note of its lane in the window; a miss goes, a stray breaks the run', () => {
  const notes = [{ t: 1, lane: 0 }, { t: 2, lane: 1 }, { t: 3, lane: 0 }];
  const judge = createJudge(notes);
  const score = createScore(notes.length);
  assert.equal(judge.tap(1, 1.0).kind, 'stray', 'nothing in that lane near');
  const early = judge.tap(0, 1 - HIT_WINDOW - 0.1);
  assert.equal(early.kind, 'near', 'early, but not a stray');
  const hit = judge.tap(0, 1.05);
  assert.equal(hit.kind, 'hit');
  assert.equal(hit.index, 0);
  assert.equal(hit.great, true);
  count(score, hit);
  assert.equal(judge.tap(0, 1.1).kind, 'stray', 'a note is played once');
  assert.deepEqual(judge.sweep(2.1), [], 'the second note can still be played');
  assert.deepEqual(judge.sweep(2.3), [1], 'and then it is gone');
  count(score, { kind: 'miss' });
  assert.equal(score.streak, 0);
  assert.equal(judge.state(1), 'missed');
  assert.equal(judge.tap(0, 3.15).kind, 'hit');
  assert.equal(judge.left(), 0);
});

test('stars: one to three for a fair share played; strays past a spare few cost; the run raises tiers', () => {
  assert.equal(starsFor({ hits: 0, strays: 0, total: 50 }), 0);
  assert.equal(starsFor({ hits: 13, strays: 0, total: 50 }), 1);
  assert.equal(starsFor({ hits: 25, strays: 0, total: 50 }), 2);
  assert.equal(starsFor({ hits: 40, strays: 0, total: 50 }), 3);
  assert.equal(starsFor({ hits: 40, strays: 13, total: 50 }), 3, 'a few strays are free');
  assert.equal(starsFor({ hits: 50, strays: 200, total: 50 }), 0, 'tapping everywhere all the time is no way to the stars');
  assert.deepEqual([0, 3, 4, 8, 16, 40].map(tierOf), [0, 0, 1, 2, 3, 3]);
  const score = createScore(10);
  const crossed = [];
  for (let i = 0; i < 8; i++) crossed.push(count(score, { kind: 'hit', offset: 0 }));
  assert.deepEqual(crossed, [0, 0, 0, 1, 0, 0, 0, 2], 'the run crosses into tier 1 at four and tier 2 at eight');
});

test('lanes and notes: the roles sit b a c with three lanes, a and c with two; steps climb the key', () => {
  assert.deepEqual(['b', 'a', 'c'].map(role => laneOf(role, 3)), [0, 1, 2]);
  assert.deepEqual(['a', 'b', 'c'].map(role => laneOf(role, 2)), [0, 1, 1]);
  const scale = scaleOf([100, 112, 125, 150, 168]);
  assert.deepEqual([0, 4, 5, 7, -1].map(scale), [100, 168, 200, 250, 84]);
});
