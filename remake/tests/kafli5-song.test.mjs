// Chapter 5's song as data (chapters/kafli5-song.js): the five groups' tones, the melody's four phrases, the tempo and the key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, TONES, MELODY, TEMPO, KEY, PHRASE_LAYERS, toneHz, nextBeat } from '../chapters/kafli5-song.js';

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
  // F over A 440, in the octave a child sings in
  assert.ok(Math.abs(cents(hz[0], 440 * 2 ** (-4 / 12))) < 0.01, `root ${hz[0]}`);
  [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3].forEach((ratio, i) => assert.ok(Math.abs(cents(hz[i] / hz[0], ratio)) < 5, `${GROUPS[i]} ${hz[i]}`));
  // an octave asks for twice, and another key moves every tone with it
  assert.ok(Math.abs(toneHz('frogs', KEY, -1) * 2 - toneHz('frogs')) < 1e-9);
  assert.ok(Math.abs(cents(toneHz('grazers', { root: 'G', a4: 440 }), toneHz('grazers')) - 200) < 0.01);
  assert.ok(Math.abs(cents(toneHz('grazers', { root: 'Bb', a4: 440 }), toneHz('grazers')) - 500) < 0.01);
});

test('no note is the one before it: every phrase but the first starts on a different group than the last ended on', () => {
  // a repeated tap is no phrase, and a child cannot tell a second light on the same animal from the first
  const notes = MELODY.flat();
  for (let i = 1; i < notes.length; i++) assert.notEqual(notes[i], notes[i - 1], `note ${i + 1}`);
  for (let p = 1; p < MELODY.length; p++) assert.notEqual(MELODY[p][0], MELODY[p - 1].at(-1), `phrase ${p + 1}`);
});

test('the tempo, the key and the stems that join after each phrase are the placeholders Task 7 measures', () => {
  assert.deepEqual(TEMPO, { bpm: 84, offset: 0 });
  assert.deepEqual(KEY, { root: 'F', a4: 440 });
  assert.deepEqual(PHRASE_LAYERS, [['pad'], ['bass'], ['beat'], ['lead']]);
});

test('nextBeat is the first beat at or after the time', () => {
  const beat = 60 / 84;
  assert.equal(nextBeat(0), 0);
  assert.ok(Math.abs(nextBeat(0.01) - beat) < 1e-9);
  assert.ok(Math.abs(nextBeat(beat) - beat) < 1e-9, 'on a beat is that beat');
  assert.ok(Math.abs(nextBeat(beat * 7 + 1e-12) - beat * 7) < 1e-9, 'a hair over a beat is that beat');
  assert.ok(Math.abs(nextBeat(3.3) - beat * 5) < 1e-9);
  assert.ok(Math.abs(nextBeat(1, { bpm: 120, offset: 0.2 }) - 1.2) < 1e-9);
  assert.ok(Math.abs(nextBeat(0, { bpm: 120, offset: 0.2 }) - 0.2) < 1e-9);
});
