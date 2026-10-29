import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HIT_WINDOW, LEVELS, createJudge, createScore, count, laneOf, makeChart, starsFor, tierOf } from '../engine/sloedla/chart.js';
import { scaleOf } from '../engine/sloedla/sounds.js';
import { CROWD_QUIET, CROWD_TAKES, cueOf } from '../engine/sloedla/crowd.js';
import { VOICES_DEFAULT, VOICE_LEVELS } from '../engine/sloedla/voices.js';
import { GRADES, gradeOf, milestoneOf } from '../engine/sloedla/text.js';
import { chartOf, compileSection, pitchOf, rootHz, timeline } from '../engine/sloedla/song.js';
import { SONGS } from '../engine/sloedla/songs/index.js';

test('every song reads, and its child\'s notes are two beats apart at least (four when calm), in all three lanes', async () => {
  for (const entry of SONGS) {
    const song = (await entry.load()).default;
    const { beat, sections, length } = timeline(song);
    assert.ok(length > 60 && length < 240, `${song.id}: a round of one to four minutes (${length.toFixed(0)} s)`);
    for (const variant of ['normal', 'big', 'calm']) {
      const notes = sections.flatMap((_, i) => chartOf(compileSection(song, i, variant), { level: 'barn', beat, section: i }));
      const gap = variant === 'calm' ? 4 : 2;
      for (let i = 1; i < notes.length; i++) assert.ok((notes[i].t - notes[i - 1].t) / beat >= gap - 1e-6, `${song.id} ${variant}: notes ${i - 1} and ${i} are ${gap} beats apart`);
      if (variant === 'normal') for (const role of ['a', 'b', 'c']) assert.ok(notes.filter(n => n.role === role).length >= 8, `${song.id}: the child plays ${role} too`);
    }
  }
  assert.ok(Math.abs(rootHz('A') * 2 - 440) < 1e-9, 'A4 is 440 Hz');
  const lifted = pitchOf({ root: 'Bb', scale: 'major' }, 2)(0);
  assert.ok(Math.abs(lifted - rootHz('C') * 2) < 1e-9, 'a lift of two semitones takes B-flat3 to C4');
});

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

test('the child\'s window is wider late than early, and the band belongs to the dinosaurs but for the skeleton', async () => {
  const { barn } = LEVELS;
  const judge = createJudge([{ t: 1, lane: 0 }, { t: 3, lane: 0 }], barn);
  assert.equal(judge.tap(0, 1 - 0.3).kind, 'near', '300 ms early is too early');
  assert.equal(judge.tap(0, 1 + 0.3).kind, 'hit', '300 ms late still plays it');
  assert.deepEqual(judge.sweep(3 + barn.late - 0.01), [], 'the second note waits out its late window');
  assert.deepEqual(judge.sweep(3 + barn.late + 0.01), [1]);
  const song = (await SONGS[0].load()).default;
  const { band } = compileSection(song, 2, 'normal');
  const owner = inst => [...new Set(band.filter(e => e.inst === inst && !e.tier && e.vel > 0.4).map(e => e.gate))];
  assert.deepEqual(owner('clap'), ['c'], 'the claps are Þórseðla\'s');
  assert.deepEqual(owner('bass'), ['b'], 'the bass is Kambeðla\'s');
  assert.deepEqual(owner('pad'), [null], 'the pad is the skeleton');
  const pulse = band.filter(e => e.inst === 'kick' && e.gate === null);
  assert.equal(pulse.length, song.sections.vidlag.bars * 4, 'the skeleton keeps a soft pulse on every beat');
});

test('stars: one to three for a fair share played; strays past a spare few cost; the run raises tiers', () => {
  assert.equal(starsFor({ hits: 0, strays: 0, total: 50 }), 0);
  assert.equal(starsFor({ hits: 13, strays: 0, total: 50 }), 1);
  assert.equal(starsFor({ hits: 25, strays: 0, total: 50 }), 2);
  assert.equal(starsFor({ hits: 40, strays: 0, total: 50 }), 3);
  assert.equal(starsFor({ hits: 40, strays: 13, total: 50 }), 3, 'a few strays are free');
  assert.equal(starsFor({ hits: 50, strays: 200, total: 50 }), 0, 'tapping everywhere all the time is no way to the stars');
  assert.deepEqual([0, 2, 3, 8, 16, 40].map(tierOf), [0, 0, 1, 2, 3, 3]);
  const score = createScore(10);
  const crossed = [];
  for (let i = 0; i < 8; i++) crossed.push(count(score, { kind: 'hit', offset: 0 }));
  assert.deepEqual(crossed, [0, 0, 1, 0, 0, 0, 0, 2], 'the run crosses into tier 1 at three (Fever) and tier 2 at eight');
});

test('lanes and notes: the roles sit b a c with three lanes, a and c with two; steps climb the key', () => {
  assert.deepEqual(['b', 'a', 'c'].map(role => laneOf(role, 3)), [0, 1, 2]);
  assert.deepEqual(['a', 'b', 'c'].map(role => laneOf(role, 2)), [0, 1, 1]);
  const scale = scaleOf([100, 112, 125, 150, 168]);
  assert.deepEqual([0, 4, 5, 7, -1].map(scale), [100, 168, 200, 250, 84]);
});

test('the crowd answers now and then: a quiet spell between its sounds, a sigh seldom, applause at the end always; its takes are on disk', () => {
  const memory = {};
  const yes = () => 0;
  assert.equal(cueOf('tier2', 10, memory, yes), 'va', 'a run of eight: vá!');
  assert.equal(cueOf('tier3', 12, memory, yes), null, 'not again so soon');
  assert.equal(cueOf('tier3', 10 + CROWD_QUIET + 0.1, memory, yes), 'fagn', 'gold, after a quiet spell: cheering');
  assert.equal(cueOf('broke', 30, memory, yes), 'ae', 'a long run broken: æææ');
  assert.equal(cueOf('broke', 40, memory, yes), null, 'a sigh is seldom: not twice in twenty seconds');
  assert.equal(cueOf('end', 40.5, memory, yes), 'klapp', 'applause at the end, whatever came just before');
  assert.equal(cueOf('rejoin', 60, {}, () => 0.9), null, 'the smaller moments only some of the time');
  const busy = {};
  let heard = 0;
  for (let t = 0; t < 120; t += 1) if (cueOf(['more', 'rejoin', 'big', 'broke'][t % 4], t, busy, yes)) heard++;
  assert.ok(heard <= 120 / CROWD_QUIET + 1, `a round full of moments still hears the crowd now and then (${heard} times in two minutes)`);
  const made = JSON.parse(fs.readFileSync(new URL('../assets/audio/sloedla/crowd.json', import.meta.url), 'utf8')).sounds;
  for (const [sound, takes] of Object.entries(CROWD_TAKES)) {
    for (let take = 1; take <= takes; take++) {
      assert.ok(fs.existsSync(new URL(`../assets/audio/sloedla/crowd-${sound}-${take}.mp3`, import.meta.url)), `crowd-${sound}-${take}.mp3 is there`);
      assert.equal(made[`${sound}-${take}`]?.kind, sound, `crowd.json says what crowd-${sound}-${take} is`);
    }
  }
});

test('each song gives the dinosaurs instruments of its own, every one known, a tapped note louder than one that plays by itself', async () => {
  const kits = new Set();
  for (const entry of SONGS) {
    const song = (await entry.load()).default;
    for (const role of ['a', 'b', 'c']) assert.ok(VOICE_LEVELS[song.voices?.[role]], `${song.id}: role ${role} plays a known instrument (${song.voices?.[role]})`);
    kits.add(['a', 'b', 'c'].map(role => song.voices[role]).join(' '));
  }
  assert.equal(kits.size, SONGS.length, 'no two songs sound alike');
  for (const role of ['a', 'b', 'c']) assert.ok(VOICE_LEVELS[VOICES_DEFAULT[role]], 'a song that names none has the first instruments');
  for (const [name, { play, tapped, soft }] of Object.entries(VOICE_LEVELS)) assert.ok(soft < play && play < tapped && tapped <= 1, `${name}: a stray tap is softest, a tapped note loudest`);
});

test('a tap is praised by how close it was: Fullkomið! right on, Frábært!, Fínt!, OK! further off, early or late alike; milestones at 10, 15, 20 ...', () => {
  const barn = LEVELS.barn;
  assert.equal(gradeOf(0.02, barn), 'perfect');
  assert.equal(gradeOf(-0.06, barn), 'perfect');
  assert.equal(gradeOf(-0.12, barn), 'great');
  assert.equal(gradeOf(0.2, barn), 'fine');
  assert.equal(gradeOf(-0.25, barn), 'ok');
  assert.equal(gradeOf(0.05, LEVELS.fullordinn), 'great', 'the grown-ups must be closer');
  for (const level of Object.values(LEVELS)) assert.ok(level.perfect < level.great && level.great < level.fine && level.fine <= Math.max(level.early, level.late), 'the words go in order inside the window');
  assert.deepEqual(Object.values(GRADES).map(g => g.text), ['Fullkomið!', 'Frábært!', 'Fínt!', 'OK!']);
  const milestones = Array.from({ length: 120 }, (_, i) => i + 1).filter(milestoneOf);
  assert.deepEqual(milestones, [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120]);
});

test('the DJ calls the milestones and the big moments, never on top of himself, and the end always; his lines are on disk', async () => {
  const { DJ_LINES, DJ_QUIET, djCueOf, endLineOf } = await import('../engine/sloedla/dj.js');
  const memory = {};
  assert.equal(djCueOf({ kind: 'start' }, 0, memory), 'byrjun');
  assert.equal(djCueOf({ kind: 'tier', tier: 1 }, 1, memory), null, 'a quiet spell after a line');
  assert.equal(djCueOf({ kind: 'tier', tier: 1 }, DJ_QUIET + 0.5, memory), 'flott');
  assert.equal(djCueOf({ kind: 'milestone', streak: 10 }, DJ_QUIET + 1, memory), 'r10', 'a milestone is always said (the game queues it while he talks)');
  assert.equal(djCueOf({ kind: 'tier', tier: 2 }, DJ_QUIET + 2, memory), null, 'a small one keeps the quiet');
  assert.equal(djCueOf({ kind: 'tier', tier: 3 }, DJ_QUIET + 2.5, memory), 'stjornukraftur', 'Stjörnukraftur is a big one');
  assert.equal(djCueOf({ kind: 'rejoin', role: 'c', back: false }, 50, memory), null, 'her first notes of the song are no news');
  assert.equal(djCueOf({ kind: 'milestone', streak: 110 }, 60, memory), null, 'no line for a hundred and ten');
  assert.equal(djCueOf({ kind: 'rejoin', role: 'b', back: true }, 70, memory), 'kambedla');
  assert.equal(djCueOf({ kind: 'end', stars: 3, misses: 0, full: true }, 70.1, memory), 'fullthus', 'the end is always said');
  assert.equal(endLineOf({ stars: 3, misses: 2 }), 'naestum');
  assert.equal(endLineOf({ stars: 3, misses: 5 }), 'frabaert');
  assert.equal(endLineOf({ stars: 0, misses: 40 }), 'aftur');
  const made = JSON.parse(fs.readFileSync(new URL('../assets/audio/sloedla/dj/dj.json', import.meta.url), 'utf8'));
  assert.ok(made.voice?.id, 'the DJ has a voice of his own');
  for (const [id, text] of Object.entries(DJ_LINES)) {
    assert.ok(fs.existsSync(new URL(`../assets/audio/sloedla/dj/${id}.mp3`, import.meta.url)), `${id}.mp3 is there`);
    assert.equal(made.lines[id]?.text, text, `dj.json says ${id} is "${text}"`);
  }
});
