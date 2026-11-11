// Chapter 5's song as data (chapters/kafli5-song.js): the five groups' tones, the melody's four phrases, the tempo and the key,
// which are the song's own (assets/audio/kafli5/song/song.json: DJ Flugeðla's set on the disco-funk band).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GROUPS, TONES, MELODY, TEMPO, KEY, PHRASE_LAYERS, LAYER_LEVELS, CALM, toneHz, nextBeat } from '../chapters/kafli5-song.js';

const SONG = JSON.parse(fs.readFileSync(new URL('../assets/audio/kafli5/song/song.json', import.meta.url), 'utf8'));
const cents = (a, b) => 1200 * Math.log2(a / b);

test('the melody is 2 + 3 + 4 + 5 notes of the five groups and ends on degree 1', () => {
  assert.deepEqual(MELODY.map(p => p.length), [2, 3, 4, 5]);
  for (const g of MELODY.flat()) assert.ok(GROUPS.includes(g), g);
  assert.equal(TONES[MELODY[3].at(-1)], 1);
  assert.deepEqual(GROUPS, ['grazers', 'turtles', 'frogs', 'lizards', 'flyers']);
  assert.deepEqual(TONES, { grazers: 1, turtles: 2, frogs: 3, lizards: 5, flyers: 6 });
});

test('the tones rise from grazers to flyers and are the key\'s pentatonic', () => {
  const hz = GROUPS.map(g => toneHz(g));
  for (let i = 1; i < hz.length; i++) assert.ok(hz[i] > hz[i - 1], `${GROUPS[i]} over ${GROUPS[i - 1]}`);
  // A 440 is the song's do. The band is tuned in equal steps, so the tones are too: 0, 2, 4, 7 and 9 semitones over the root
  assert.ok(Math.abs(cents(hz[0], 440)) < 0.01, `root ${hz[0]}`);
  [0, 2, 4, 7, 9].forEach((steps, i) => assert.ok(Math.abs(cents(hz[i] / hz[0], 2 ** (steps / 12))) < 0.01, `${GROUPS[i]} ${hz[i]}`));
  // an octave asks for twice, and another key moves every tone with it
  assert.ok(Math.abs(toneHz('frogs', KEY, -1) * 2 - toneHz('frogs')) < 1e-9);
  assert.ok(Math.abs(cents(toneHz('grazers', { root: 'G', a4: 440 }), toneHz('grazers')) + 200) < 0.01);
  assert.ok(Math.abs(cents(toneHz('grazers', { root: 'Bb', a4: 440 }), toneHz('grazers')) - 100) < 0.01);
});

test('no note is the one before it: every phrase but the first starts on a different group than the last ended on', () => {
  // a repeated tap is no phrase, and a child cannot tell a second light on the same animal from the first
  const notes = MELODY.flat();
  for (let i = 1; i < notes.length; i++) assert.notEqual(notes[i], notes[i - 1], `note ${i + 1}`);
  for (let p = 1; p < MELODY.length; p++) assert.notEqual(MELODY[p][0], MELODY[p - 1].at(-1), `phrase ${p + 1}`);
});

test('the tempo and the key are the song\'s: every tone is within 5 cents of song.json\'s key, and the set sings her tune', () => {
  assert.deepEqual(TEMPO, { bpm: SONG.bpm, offset: SONG.beatOffset });
  assert.deepEqual(KEY, { root: 'A', a4: 440 });
  GROUPS.forEach((group, i) => assert.ok(Math.abs(cents(toneHz(group, KEY), SONG.key[i])) < 5, `${group} ${toneHz(group)} against ${SONG.key[i]}`));
  assert.deepEqual(SONG.set.tune.slice(0, 14).map(note => note.group), MELODY.flat(), 'the set sings the tune the chapter teaches');
});

test('a part of the band joins after each phrase, and every layer named is a file of the loop', () => {
  assert.equal(PHRASE_LAYERS.length, MELODY.length);
  const named = [...new Set([...Object.keys(LAYER_LEVELS), ...PHRASE_LAYERS.flatMap(step => Object.keys(step))])];
  for (const layer of named) assert.ok(layer in SONG.loop.layers, layer);
  // before the first phrase only the band far away; after the last the whole band, and the muffled copy is gone
  assert.ok(LAYER_LEVELS.far > 0);
  for (const layer of ['drums', 'bass', 'music']) assert.ok(!LAYER_LEVELS[layer], `${layer} waits for its phrase`);
  const end = PHRASE_LAYERS.reduce((levels, step) => ({ ...levels, ...step }), { ...LAYER_LEVELS });
  for (const layer of ['drums', 'bass', 'music']) assert.ok(end[layer] > 0, layer);
  assert.equal(end.far, 0);
  // each phrase brings something in that was not there
  let levels = { ...LAYER_LEVELS };
  for (const [p, step] of PHRASE_LAYERS.entries()) {
    assert.ok(Object.entries(step).some(([layer, level]) => level > (levels[layer] ?? 0)), `phrase ${p + 1} is heard`);
    levels = { ...levels, ...step };
  }
});

test('the calm layer: a file of the loop as long as the others, low, and not one of the parts of the band', () => {
  assert.equal(SONG.loop.layers.calm, 'loop-calm.mp3');
  const size = name => fs.statSync(new URL(`../assets/audio/kafli5/song/${name}`, import.meta.url)).size;
  assert.ok(Math.abs(size('loop-calm.mp3') - size('loop-far.mp3')) < 2000, 'a bar, the loop and a bar, as the layers of the band are');
  assert.ok(CALM.level > 0 && CALM.level <= 0.5 && CALM.in > 0 && CALM.out > 0);
  assert.ok(!('calm' in LAYER_LEVELS) && PHRASE_LAYERS.every(step => !('calm' in step)), 'the band of the choir is the band alone');
});

test('nextBeat is the first beat at or after the time', () => {
  const beat = 60 / TEMPO.bpm;
  assert.equal(nextBeat(0), 0);
  assert.ok(Math.abs(nextBeat(0.01) - beat) < 1e-9);
  assert.ok(Math.abs(nextBeat(beat) - beat) < 1e-9, 'on a beat is that beat');
  assert.ok(Math.abs(nextBeat(beat * 7 + 1e-12) - beat * 7) < 1e-9, 'a hair over a beat is that beat');
  assert.ok(Math.abs(nextBeat(3.3) - Math.ceil(3.3 / beat) * beat) < 1e-9);
  assert.ok(Math.abs(nextBeat(1, { bpm: 120, offset: 0.2 }) - 1.2) < 1e-9);
  assert.ok(Math.abs(nextBeat(0, { bpm: 120, offset: 0.2 }) - 0.2) < 1e-9);
});
