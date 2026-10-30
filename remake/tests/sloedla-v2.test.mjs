// Slóeðla's song game, the new song system (engine/sloedla/v2): songs made of layers, each a recorded stem or a composed part,
// owned by a dinosaur or by the song. The owner's lean rule: a few tests of the fiddly parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineOf, validateSong } from '../engine/sloedla/v2/format.js';
import { partNotes } from '../engine/sloedla/v2/parts.js';
import { makeSong } from './sloedla-v2-fixture.mjs';

test('v2 song: its timeline, the rules a song keeps, and composed notes', () => {
  const song = makeSong();
  assert.deepEqual(validateSong(song), []);
  const { beat, sections, length } = timelineOf(song);
  assert.equal(beat, 0.5);
  assert.equal(sections[1].start, 4);
  assert.equal(sections[1].startBeat, 8);
  assert.equal(length, 60);
  const lag = song.layers.find(l => l.id === 'lag');
  for (const [change, word] of [
    [{ layers: [...song.layers, { id: 'x', owner: 'd', stem: 'x.mp3' }] }, 'owner'],
    [{ layers: [...song.layers, { id: 'y', owner: 'a', part: { instrument: 'horn', sections: {} } }] }, 'instrument'],
    [{ layers: [...song.layers, { id: 'z', owner: 'a', stem: 'z.mp3', part: lag.part }] }, 'stem or a part'],
    [{ sections: song.sections.map(s => (s.name === 'kor' ? { ...s, lift: 2 } : s)) }, 'lift'],
    [{ chart: { ...song.chart, barn: [{ beat: 2, owner: 'c', layer: 'trommur' }, ...song.chart.barn] } }, '2.5'],
    [{ chart: { ...song.chart, barn: [...song.chart.barn, { beat: 100, owner: 'b', layer: 'trommur' }] } }, 'owned'],
  ]) assert.ok(validateSong({ ...song, ...change }).some(p => p.includes(word)), word);
  const notes = partNotes(song, lag, 2); // kor, normal
  assert.equal(notes[0].t, 20);
  assert.equal(notes[0].beat, 40);
  assert.ok(notes.some(n => n.mark));
  assert.notDeepEqual(partNotes(song, lag, 2, 'big').map(n => n.step), notes.map(n => n.step));
  const tuned = partNotes({ ...song, key: { ...song.key, cents: 30 } }, lag, 2);
  assert.ok(Math.abs(tuned[0].freq / notes[0].freq - 2 ** (30 / 1200)) < 1e-9);
});
