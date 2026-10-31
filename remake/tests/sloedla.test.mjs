import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HIT_WINDOW, LEVELS, createJudge, createScore, count, fullHouse, laneOf, perfectGame, pointsOf, starsFor, tierOf } from '../engine/sloedla/chart.js';
import { seededRandom } from '../engine/random.js';
import { CROWD_QUIET, CROWD_TAKES, cueOf } from '../engine/sloedla/crowd.js';
import { GRADES, gradeOf, milestoneOf } from '../engine/sloedla/text.js';
import { pitchOf, rootHz } from '../engine/sloedla/key.js';

test('the key: A4 is 440 Hz, and a lift goes up by semitones', () => {
  assert.ok(Math.abs(rootHz('A') * 2 - 440) < 1e-9, 'A4 is 440 Hz');
  const lifted = pitchOf({ root: 'Bb', scale: 'major' }, 2)(0);
  assert.ok(Math.abs(lifted - rootHz('C') * 2) < 1e-9, 'a lift of two semitones takes B-flat3 to C4');
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

// the owner (2026-10-31): a tap at no note breaks the run, so it must be seen: a light shake of her button and a little grey puff
test('a tap at no note is seen: her button shakes "no" for a moment, then stands still', async () => {
  const { STRAY_SHAKE, strayShake } = await import('../engine/sloedla/game.js');
  assert.equal(strayShake(Infinity), 0, 'no tap at nothing, no shake');
  assert.equal(strayShake(-0.1), 0);
  const most = Math.max(...Array.from({ length: 16 }, (_, i) => Math.abs(strayShake(i * 0.01))));
  assert.ok(most >= 0.05 && most <= 0.15, `a light shake you can see, a share of her size: ${most.toFixed(3)}`);
  assert.ok(STRAY_SHAKE > 0.2 && STRAY_SHAKE <= 0.5, 'a moment, not a fuss');
  assert.equal(strayShake(STRAY_SHAKE), 0, 'then she stands still');
});

// the owner (2026-10-31): the screen said 95 of 95 notes, the DJ "Næstum fullt hús!" (a stray tap had broken the run)
test('fullt hús is every note played, as the end screen counts them; a stray tap does not take it away, a missed note does', () => {
  const score = createScore(95);
  for (let i = 0; i < 95; i++) {
    if (i === 3) count(score, { kind: 'stray' });
    count(score, { kind: 'hit', great: true, offset: 0 });
  }
  assert.equal(score.best, 92, 'the stray broke the run, as in the owner\'s round');
  assert.equal(fullHouse(score), true, '95 of 95 played');
  const missed = createScore(95);
  for (let i = 0; i < 94; i++) count(missed, { kind: 'hit', great: true, offset: 0 });
  count(missed, { kind: 'miss' });
  assert.equal(fullHouse(missed), false, '94 of 95');
  assert.equal(fullHouse(createScore(0)), false, 'no notes, no full house');
});
test('the child\'s window is wider late than early', () => {
  const { barn } = LEVELS;
  const judge = createJudge([{ t: 1, lane: 0 }, { t: 3, lane: 0 }], barn);
  assert.equal(judge.tap(0, 1 - 0.3).kind, 'near', '300 ms early is too early');
  assert.equal(judge.tap(0, 1 + 0.3).kind, 'hit', '300 ms late still plays it');
  assert.deepEqual(judge.sweep(3 + barn.late - 0.01), [], 'the second note waits out its late window');
  assert.deepEqual(judge.sweep(3 + barn.late + 0.01), [1]);
});

test('the run raises tiers', () => {
  assert.deepEqual([0, 2, 3, 8, 16, 40].map(tierOf), [0, 0, 1, 2, 3, 3]);
  const score = createScore(10);
  const crossed = [];
  for (let i = 0; i < 8; i++) crossed.push(count(score, { kind: 'hit', offset: 0, grade: 'perfect' }));
  assert.deepEqual(crossed, [0, 0, 1, 0, 0, 0, 0, 2], 'the run crosses into tier 1 at three (Fever) and tier 2 at eight');
});

test('points: 100 right on, 80 close, 60 and 40 further off, nothing for a miss; Stjörnukraftur doubles the number, not the stars', () => {
  const score = createScore(4);
  for (const grade of ['perfect', 'great', 'fine', 'ok']) count(score, { kind: 'hit', offset: 0, grade });
  assert.equal(score.points, 280);
  assert.equal(pointsOf(score), 280);
  const star = createScore(4);
  for (const grade of ['perfect', 'great', 'fine', 'ok']) count(star, { kind: 'hit', offset: 0, grade, double: true });
  assert.equal(pointsOf(star), 560, 'every note twice in Stjörnukraftur');
  assert.equal(starsFor(star), starsFor(score), 'the doubling never changes the stars');
});

test('stars: zero to five from the points; strays past a spare few cost the stars but never the number shown', () => {
  const at = share => starsFor({ points: share * 100 * 100, strays: 0, total: 100, hits: 100, belowGreat: 1 });
  assert.deepEqual([0, 0.14, 0.15, 0.35, 0.55, 0.72, 0.73, 0.85, 1].map(at), [0, 0, 1, 2, 3, 3, 4, 5, 5]);
  assert.equal(starsFor({ points: 8000, strays: 25, total: 100, hits: 100, belowGreat: 10 }), 4, 'a quarter of the notes in strays is free');
  const spam = { points: 9000, strays: 400, total: 100, hits: 100, belowGreat: 10 };
  assert.equal(starsFor(spam), 0, 'tapping everywhere all the time is no way to the stars');
  assert.equal(pointsOf({ ...spam, bonus: 0 }), 9000, 'the number shown does not go down');
});

test('fullkominn leikur: every note at least Frábært! and no stray, always five stars; above fullt hús', () => {
  const play = (grades, strays = 0) => {
    const score = createScore(grades.length);
    for (let i = 0; i < strays; i++) count(score, { kind: 'stray' });
    for (const grade of grades) count(score, { kind: 'hit', offset: 0, grade });
    return score;
  };
  const great = play(Array(50).fill('great'));
  assert.equal(perfectGame(great), true);
  assert.equal(starsFor(great), 5, '80 % of the points, yet five stars');
  assert.equal(perfectGame(play([...Array(49).fill('perfect'), 'fine'])), false, 'one Fínt! is not perfect');
  assert.equal(fullHouse(play([...Array(49).fill('perfect'), 'fine'])), true, 'but it is a full house');
  assert.equal(perfectGame(play(Array(50).fill('perfect'), 1)), false, 'a stray takes it away');
  assert.equal(perfectGame(createScore(0)), false);
});

test('Stjörnukraftur takes a quarter more hits to reach: 15 for a child, 30 for grown-ups', () => {
  assert.equal(LEVELS.barn.meter, 15);
  assert.equal(LEVELS.fullordinn.meter, 30);
});

/**
 * A round played by a pretend child (seeded): 200 notes in one lane 2 s apart, each tapped with chance `tapped` at its time plus a
 * normal spread of `spread` s; the stars it gets.
 */
function childStars({ seed, tapped, spread }) {
  const random = seededRandom(`child-${seed}`);
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const notes = Array.from({ length: 200 }, (_, i) => ({ t: 2 + i * 2, lane: 0 }));
  const judge = createJudge(notes, LEVELS.barn);
  const score = createScore(notes.length);
  for (const note of notes) {
    if (random() >= tapped) continue;
    const result = judge.tap(0, note.t + spread * normal());
    if (result.kind === 'hit') count(score, { ...result, grade: gradeOf(result.offset, LEVELS.barn) });
  }
  for (const _ of judge.sweep(Infinity)) count(score, { kind: 'miss' });
  return starsFor(score);
}

// the owner (2026-10-31): not too hard; the stars held by children who play as six-year-olds do (Bonacina 2019: ~180 ms)
test('simulated children: 85 % at 150 ms gets three stars, all at 150 ms four, all at 100 ms five', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    assert.equal(childStars({ seed, tapped: 0.85, spread: 0.15 }), 3, `seed ${seed}: 85 % at 150 ms`);
    assert.equal(childStars({ seed, tapped: 1, spread: 0.15 }), 4, `seed ${seed}: all at 150 ms`);
    assert.equal(childStars({ seed, tapped: 1, spread: 0.1 }), 5, `seed ${seed}: all at 100 ms`);
  }
});

test('lanes: the roles sit b a c with three lanes, a and c with two', () => {
  assert.deepEqual(['b', 'a', 'c'].map(role => laneOf(role, 3)), [0, 1, 2]);
  assert.deepEqual(['a', 'b', 'c'].map(role => laneOf(role, 2)), [0, 1, 1]);
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
  const { DJ_LINES, DJ_TAKES, DJ_QUIET, djCueOf, endLineOf } = await import('../engine/sloedla/dj.js');
  const memory = {};
  assert.equal(djCueOf({ kind: 'start' }, 0, memory), 'byrjun');
  assert.equal(djCueOf({ kind: 'tier', tier: 1 }, 1, memory), null, 'a quiet spell after a line');
  assert.equal(djCueOf({ kind: 'tier', tier: 1 }, DJ_QUIET + 0.5, memory), 'flott');
  assert.equal(djCueOf({ kind: 'milestone', streak: 10 }, DJ_QUIET + 1, memory), 'r10', 'his first milestone is said, even in his quiet (the game queues it while he talks)');
  assert.equal(djCueOf({ kind: 'tier', tier: 2 }, DJ_QUIET + 2, memory), null, 'a small one keeps the quiet');
  assert.equal(djCueOf({ kind: 'tier', tier: 3 }, DJ_QUIET + 2.5, memory), 'stjornukraftur', 'Stjörnukraftur is a big one');
  assert.equal(djCueOf({ kind: 'rejoin', role: 'c', back: false }, 50, memory), null, 'her first notes of the song are no news');
  assert.equal(djCueOf({ kind: 'milestone', streak: 110 }, 60, memory), null, 'no line for a hundred and ten');
  // he does not count every five: the more he has counted in a row, the likelier he lets the next go (the number still rises on
  // the screen); fifty and a hundred he always says
  const counting = {};
  const unlucky = () => 0.99;
  assert.equal(djCueOf({ kind: 'milestone', streak: 10 }, 100, counting, unlucky), 'r10', 'the first he counts');
  assert.equal(djCueOf({ kind: 'milestone', streak: 15 }, 110, counting, unlucky), null, 'after one, he may let the next go');
  assert.equal(djCueOf({ kind: 'milestone', streak: 20 }, 120, counting, unlucky), 'r20', 'after letting one go he counts again');
  assert.equal(djCueOf({ kind: 'milestone', streak: 50 }, 130, counting, unlucky), 'r50', 'fifty always');
  assert.equal(djCueOf({ kind: 'milestone', streak: 100 }, 140, counting, unlucky), 'r100', 'a hundred always');
  const keen = {};
  const said = [10, 15, 20, 25, 30].map((streak, i) => djCueOf({ kind: 'milestone', streak }, 200 + 10 * i, keen, () => 0.6));
  assert.deepEqual(said, ['r10', 'r15', null, 'r25', 'r30'], 'a fair chance after one (75 %), less after two (50 %)');
  assert.equal(djCueOf({ kind: 'rejoin', role: 'b', back: true }, 70, memory), 'kambedla');
  assert.equal(djCueOf({ kind: 'end', stars: 3, misses: 0, full: true }, 70.1, memory), 'fullthus', 'the end is always said');
  assert.equal(endLineOf({ stars: 3, misses: 2 }), 'naestum');
  assert.equal(endLineOf({ stars: 3, misses: 5 }), 'frabaert');
  assert.equal(endLineOf({ stars: 0, misses: 40 }), 'aftur');
  const made = JSON.parse(fs.readFileSync(new URL('../assets/audio/sloedla/dj/dj.json', import.meta.url), 'utf8'));
  assert.ok(made.voice?.id, 'the DJ has a voice of his own');
  for (const [key, texts] of Object.entries(DJ_LINES)) assert.ok(texts.length >= 2, `${key}: more than one way of saying it, so he does not repeat himself`);
  assert.equal(djCueOf({ kind: 'clap' }, 71, memory), 'klapp', 'the clapping is called for');
  for (const { id, text } of DJ_TAKES) {
    assert.ok(fs.existsSync(new URL(`../assets/audio/sloedla/dj/${id}.mp3`, import.meta.url)), `${id}.mp3 is there`);
    assert.equal(made.lines[id]?.text, text, `dj.json says ${id} is "${text}"`);
  }
});

test('the crowd claps along with real claps: a few people first, more as it goes on; every clap on disk, its source and licence said', async () => {
  const { CLAP_SETS, clapLayersOf, peopleOf } = await import('../engine/sloedla/claps.js');
  assert.ok(peopleOf(0) < peopleOf(8) && peopleOf(8) < peopleOf(16) && peopleOf(16) < peopleOf(24), 'more people join as it goes on');
  assert.equal(peopleOf(0), 4, 'four people start it');
  assert.ok(clapLayersOf(40).some(layer => layer.far), 'at the end the back of the hall claps too');
  const made = JSON.parse(fs.readFileSync(new URL('../assets/audio/sloedla/klapp/klapp.json', import.meta.url), 'utf8'));
  const credits = fs.readFileSync(new URL('../assets/audio/sloedla/klapp/KREDIT.md', import.meta.url), 'utf8');
  for (const [set, takes] of Object.entries(CLAP_SETS)) {
    for (const take of takes) {
      const name = `${set}-${take}`;
      assert.ok(fs.existsSync(new URL(`../assets/audio/sloedla/klapp/${name}.wav`, import.meta.url)), `${name}.wav is there`);
      assert.match(made.claps[name]?.licence ?? '', /^CC/, `klapp.json says ${name}'s licence`);
      if (made.claps[name].licence.startsWith('CC BY')) assert.ok(credits.includes(`${name}.wav`), `KREDIT.md credits ${name}`);
    }
  }
});
