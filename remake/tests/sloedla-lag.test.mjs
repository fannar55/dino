// "Lag Slóeðlu" in Söngur Slóeðlu (engine/sloedla/v2/songs/sloedla.js): chapter 5's song as a song of the song game. The record is
// the one DJ Flugeðla's set is built on (the owner's pick), its drums Þórseðla's and its bass Kambeðla's, and Slóeðla plays her own
// tune, the one the choir found in the chapter, on her horn. What every song must hold is in sloedla-v2.test.mjs and
// sloedla-menu.test.mjs, which go over the whole list.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SONGS_V2, loadSongV2 } from '../engine/sloedla/v2/songs/index.js';
import { timelineOf, validateSong } from '../engine/sloedla/v2/format.js';
import { partNotes } from '../engine/sloedla/v2/parts.js';
import { sectionChart } from '../engine/sloedla/v2/chart.js';
import { MELODY, TONES, TEMPO, KEY } from '../chapters/kafli5-song.js';
import { DJ_LINES } from '../engine/sloedla/dj.js';

const FOLDER = new URL('../assets/audio/sloedla/v2/sloedla/', import.meta.url);
/** A degree of the major scale (1 do, 2 re, 3 mi, 5 sol, 6 la) as the parts write it: steps from do. */
const stepOf = degree => degree - 1;
const entry = () => SONGS_V2.find(song => song.id === 'sloedla');

test('Lag Slóeðlu is in the song game\'s list, last, in her blue', () => {
  assert.ok(entry(), 'a song called sloedla');
  assert.equal(SONGS_V2.at(-1).id, 'sloedla', 'the newest song is last');
  assert.equal(entry().name, 'Lag Slóeðlu');
  assert.equal(entry().hue, '#6793d0', 'her blue, as on her card and her tile');
  assert.ok(DJ_LINES['lag-sloedla']?.length >= 2 && DJ_LINES['lag-sloedla'].every(line => line.includes('Lag Slóeðlu')), 'the DJ names it');
});

test('it is the chapter\'s song: its tempo and key, the whole record, the drums Þórseðla\'s and the bass Kambeðla\'s', async () => {
  const song = await loadSongV2('sloedla');
  assert.deepEqual(validateSong(song), []);
  assert.equal(song.tempo.bpm, TEMPO.bpm);
  assert.equal(song.key.root, KEY.root);
  assert.equal(song.key.scale, 'major');
  const made = JSON.parse(fs.readFileSync(new URL('song.json', FOLDER), 'utf8'));
  const { length, sections } = timelineOf(song);
  assert.equal(sections.reduce((sum, section) => sum + section.bars, 0), made.structure.bars, 'every bar of the record');
  assert.ok(Math.abs(length - made.structure.plannedSeconds) < 0.01, `${length.toFixed(2)} s`);
  assert.ok(Math.abs(song.key.cents - made.tuningCents) < 0.05, 'her horn is tuned to the record');
  const by = owner => song.layers.filter(layer => layer.owner === owner);
  assert.deepEqual(by('c').map(layer => layer.stem), ['drums.mp3']);
  assert.deepEqual(by('b').map(layer => layer.stem), ['bass.mp3']);
  assert.equal(by('a').length, 1, 'Slóeðla has one layer');
  assert.ok(by('a')[0].part, 'and it is composed: her horn');
  assert.ok(by(null).some(layer => layer.stem), 'the rest of the band is the song\'s own');
  for (const layer of song.layers.filter(each => each.stem)) {
    assert.ok(fs.statSync(new URL(layer.stem, FOLDER)).size > 1_000_000, `${layer.stem} is on disk`);
  }
});

test('Slóeðla\'s horn plays her tune as the choir found it: the same notes in the same order, a phrase every two bars', async () => {
  const song = await loadSongV2('sloedla');
  const horn = song.layers.find(layer => layer.owner === 'a');
  const { sections } = timelineOf(song);
  const tuned = sections.filter(section => section.name === 'lagid');
  assert.ok(tuned.length >= 3, `her whole tune is played ${tuned.length} times`);
  for (const section of tuned) {
    assert.equal(section.bars, 8);
    const notes = partNotes(song, horn, section.index);
    assert.deepEqual(notes.map(note => note.step), MELODY.flat().map(group => stepOf(TONES[group])), 'do re mi sol la, as the animals sang them');
    // each phrase begins on its second bar line, and its first note is the child's
    let k = 0;
    MELODY.forEach((phrase, p) => {
      const first = notes[k];
      assert.equal(first.beat - section.startBeat, p * 8, `phrase ${p + 1} begins bar ${p * 2 + 1}`);
      assert.ok(first.mark, `phrase ${p + 1}: its first note falls for the child`);
      k += phrase.length;
    });
    assert.ok(notes.every(note => note.freq > 200 && note.freq < 400), 'in her horn\'s own low voice, an octave under the animals');
  }
  assert.ok(sections[tuned[0].index].start > 40, 'the tune comes once the band is going');
});

test('she plays in most of the song, so the child on her lane always has something to do', async () => {
  const song = await loadSongV2('sloedla');
  const { sections, beat } = timelineOf(song);
  const silent = sections.filter(section => !sectionChart(song, section.index, 'normal', { level: 'barn', roles: ['a'] }).length).map(section => section.name);
  assert.deepEqual(silent, ['intro', 'klapp'], 'only the band\'s way in and the clapping are without her');
  const hers = sections.flatMap(section => sectionChart(song, section.index, 'normal', { level: 'barn', roles: ['a', 'b', 'c'] })).filter(note => note.role === 'a');
  assert.ok(hers.length >= 40, `${hers.length} notes of hers for the child`);
  const longest = Math.max(...hers.slice(1).map((note, i) => note.t - hers[i].t));
  assert.ok(longest < 6.5 * 4 * beat, `never long without her: ${longest.toFixed(1)} s at most (the clapping's four bars and a little)`);
});
