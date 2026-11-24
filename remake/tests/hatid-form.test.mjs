// Stjörnuhátíðin's song: its form (tools/hatid-lag/form.mjs) and the four candidate presets of the music tool. Lean: the bars, the
// slots the song has to leave room for, and what every candidate asks the model for.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { BEATS_PER_BAR, DANCE_BEATS, ENTRIES, FORM, MOTIF, SOLOS, TEMPO, beatsOf, entriesOf, secondsOf } from '../tools/hatid-lag/form.mjs';
import { PRESETS, filesOf, planOf, requestOf, sectionsHeard, sectionsOf } from '../tools/sloedla-music.mjs';

const ALL = Object.keys(PRESETS).filter(name => name.startsWith('hatid-'));
const FESTIVAL = ALL.filter(name => PRESETS[name].form); // the four that ask for the form bar by bar
const SCENE = ALL.filter(name => PRESETS[name].prompt); // the two that only describe the scene

test('the form is the spec\'s six sections in whole bars: 120 bars, four minutes at 120 bpm', () => {
  assert.deepEqual(FORM.map(part => [part.id, part.bars]), [['intro', 24], ['dance', 32], ['solos', 24], ['quiet', 12], ['chorus', 24], ['chord', 4]]);
  assert.equal(secondsOf(120), 240);
  assert.ok(secondsOf(TEMPO.from) < 270 && secondsOf(TEMPO.to) > 230);
});

test('six solos of eight dance beats fill the solo section, in the spec\'s order', () => {
  const solos = beatsOf().find(part => part.id === 'solos');
  assert.equal(SOLOS.length * 8 * DANCE_BEATS, solos.beats);
  assert.deepEqual(SOLOS, ['kambedla', 'uggedla', 'thorsedla', 'flugedla', 'sloedla', 'gramedla']);
});

test('the intro has room for seven entries: the horn alone, then one every three bars', () => {
  const entries = entriesOf();
  assert.deepEqual(entries.map(entry => entry.id), ENTRIES);
  assert.equal(entries[0].sound, 'horn');
  assert.deepEqual(entries.map(entry => entry.bar), [0, 4, 7, 10, 13, 16, 19]);
  const intro = FORM.find(part => part.id === 'intro');
  assert.equal(entries.at(-1).bar + 3 + 2, intro.bars, 'the last entry\'s three bars, then a two-bar build');
  assert.equal(beatsOf()[0].beats, intro.bars * BEATS_PER_BAR);
});

test('the motif is six rising notes', () => {
  assert.equal(MOTIF.length, 6);
  assert.ok(MOTIF.every((degree, i) => i === 0 || degree > MOTIF[i - 1]));
});

test('every festival preset asks for the whole form, no singing, and neither chapter 5\'s key nor its tempo', () => {
  assert.equal(FESTIVAL.length, 4);
  for (const name of FESTIVAL) {
    const preset = PRESETS[name];
    const { chunks } = planOf(name);
    assert.deepEqual(sectionsOf(name).map(section => [section.kind, section.bars]), FORM.map(part => [part.id, part.bars]), name);
    assert.ok(Math.abs(chunks.reduce((sum, chunk) => sum + chunk.duration_ms, 0) - secondsOf(preset.bpm) * 1000) <= 1, `${name}: the whole song`);
    assert.ok(chunks.every(chunk => chunk.positive_styles.includes('instrumental backing track')), `${name}: instrumental`);
    assert.ok(chunks.every(chunk => ['vocals', 'singing', 'choir'].every(style => chunk.negative_styles.includes(style))), `${name}: no voices`);
    assert.ok(preset.bpm >= TEMPO.from && preset.bpm <= TEMPO.to && preset.bpm !== 125, `${name}: ${preset.bpm} bpm`);
    assert.ok(!/^A (major|minor)$/.test(preset.key), `${name}: ${preset.key}`);
  }
  const quiet = planOf(FESTIVAL[0]).chunks[FORM.findIndex(part => part.id === 'quiet')];
  assert.ok(quiet.negative_styles.includes('drums'), 'the quiet part has no drums');
  assert.equal(new Set(FESTIVAL.map(name => PRESETS[name].key)).size, 4, 'each its own key');
});

test('the two scene presets ask with the same description, for four minutes and no singing, and say nothing of tempo or key', () => {
  assert.deepEqual(SCENE, ['hatid-e', 'hatid-f', 'hatid-g', 'hatid-h']);
  const [first, second, third, fourth] = SCENE.map(name => requestOf(name));
  // the two with a model for the sound: the same scene, wordless backing voices allowed, the model song never named
  assert.deepEqual(third, fourth, 'one description, two songs');
  assert.equal(third.force_instrumental, false);
  assert.ok(third.prompt.includes(first.prompt.split('\n\n')[0]) && third.prompt.endsWith(first.prompt.split('\n\n').at(-1)), 'the same scene');
  assert.ok(/wordless/.test(third.prompt) && /no lead singer/.test(third.prompt) && !/instrumental/.test(third.prompt));
  assert.ok(!/northern town|dream academy/i.test(third.prompt), 'its air in words, not its name');
  assert.deepEqual(first, second, 'one description, two songs');
  assert.deepEqual(Object.keys(first).sort(), ['force_instrumental', 'model_id', 'music_length_ms', 'prompt']);
  assert.equal(first.force_instrumental, true);
  assert.equal(first.music_length_ms, 240000);
  assert.ok(/stars/.test(first.prompt) && /final chord/.test(first.prompt) && !/\bBPM\b|\b[A-G] major\b/.test(first.prompt));
  assert.throws(() => requestOf('hatid-e', 1, 7), /seed/);
  // the model's own plan gives the sections their times
  const heard = sectionsHeard({ chunks: [{ text: '[Intro]', duration_ms: 20000 }, { text: '[Dance]\nla la', duration_ms: 60000 }] }, 80);
  assert.deepEqual(heard.map(part => [part.name, part.startSec, part.seconds]), [['Intro', 0, 20], ['Dance', 20, 60]]);
  assert.deepEqual(sectionsHeard(null, 240).map(part => [part.startSec, part.seconds]), [[0, 240]]);
});

test('a festival preset writes under qa/, never under remake/assets', () => {
  for (const name of ALL) {
    const { mp3, json } = filesOf(name);
    for (const file of [mp3, json, filesOf(name).stem('drums')]) {
      const relative = path.relative(path.resolve(import.meta.dirname, '../..'), file).replace(/\\/g, '/');
      assert.ok(relative.startsWith(`qa/remake/hatid/lag/${name}/`), relative);
    }
  }
  assert.ok(filesOf('djamm').mp3.replace(/\\/g, '/').endsWith('remake/assets/audio/sloedla/v2/djamm/song.mp3'), 'the others are unchanged');
});
