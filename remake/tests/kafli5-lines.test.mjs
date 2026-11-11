// Chapter 5's spoken lines (the plan's Task 8): every line of remake/chapters/kafli5.js is a line of the kafli5 set
// (assets/audio/kafli5/lines-source.json, made by tools/voice-lines.mjs --set kafli5, beside DJ Flugeðla's lines for the set), said
// by its speaker from its own recording. Slóeðla's wait for her voice (tests/waiting-for-voice.mjs).
//   node --import ./remake/tests/setup.mjs --test remake/tests/kafli5-lines.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as kafli5 from '../chapters/kafli5.js';
import { WAITING_FOR_HER_VOICE } from './waiting-for-voice.mjs';

const { chapter } = kafli5;
const readJson = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
const SOURCE = readJson('../assets/audio/kafli5/lines-source.json');
const RECORDED = readJson('../assets/audio/lines.json'); // what the page reads: id -> { src, duration, mouth }
const MADE = readJson('../assets/audio/voices-made.json').lines; // the committed record of every take the tools mastered
const VOICES = readJson('../assets/audio/voices.json');
const exists = relative => fs.existsSync(new URL(relative, import.meta.url));

test('every chapter 5 line is a line of the kafli5 set with the same words, named for its speaker, who has a caption name', () => {
  const source = new Map(SOURCE.map(line => [line.id, line]));
  assert.equal(source.size, SOURCE.length, 'no id twice');
  assert.equal(Object.keys(chapter.lines).length, 19);
  for (const [id, line] of Object.entries(chapter.lines)) {
    const entry = source.get(id);
    assert.ok(entry, `${id} is not in kafli5/lines-source.json`);
    assert.match(id, new RegExp(`^k5_${entry.speaker}_[a-z0-9_]+$`), `${id} names its speaker, ${entry.speaker}`);
    assert.ok(chapter.cast[entry.speaker], `${entry.speaker} speaks ${id} but has no caption name`);
    assert.deepEqual(line, { text: entry.text, audio: id }, `${id} says what the source says, from its own recording`);
  }
  // the rest of the set is DJ Flugeðla's lines in the song, which the chapter does not speak itself (they are in the set's mix)
  for (const entry of SOURCE) assert.ok(chapter.lines[entry.id] || /^k5_dj_[abc]_[a-z0-9_]+$/.test(entry.id), `${entry.id} is neither a chapter line nor one of the DJ's`);
});

test('Mosi\'s, Egill\'s and Flugeðla\'s chapter lines each have their recording, in lines.json and in the record of takes', () => {
  const speakers = new Map(SOURCE.map(line => [line.id, line.speaker]));
  const spoken = Object.keys(chapter.lines).filter(id => speakers.get(id) !== 'sloedla');
  assert.equal(spoken.length, 16);
  const unrecorded = [];
  for (const id of spoken) {
    assert.ok(VOICES[speakers.get(id)], `${speakers.get(id)} has a voice`);
    const entry = RECORDED[id];
    if (entry?.src !== `assets/audio/kafli5/${id}.mp3` || !exists(`../assets/audio/kafli5/${id}.mp3`) || !MADE[`kafli5/${id}`]) { unrecorded.push(id); continue; }
    assert.ok(entry.duration > 0.8 && entry.duration < 9, `${id} is ${entry.duration} s long`);
    assert.equal(MADE[`kafli5/${id}`].duration, entry.duration, `${id}: the record and lines.json agree on its length`);
    assert.ok(typeof entry.mouth === 'string' && /[1-9a-f]/.test(entry.mouth), `${id} has a mouth that opens (it is not silent)`);
    assert.ok(!WAITING_FOR_HER_VOICE.has(id));
  }
  assert.deepEqual(unrecorded, [], 'every such line has its recording (node remake/tools/voice-lines.mjs --set kafli5 --only <ids>)');
});

test('Slóeðla\'s three lines wait for her voice, and only until she has one', t => {
  const hers = SOURCE.filter(line => line.speaker === 'sloedla').map(line => line.id);
  assert.deepEqual(hers.sort(), ['k5_sloedla_forgot', 'k5_sloedla_mine', 'k5_sloedla_thanks']);
  for (const id of WAITING_FOR_HER_VOICE) assert.ok(hers.includes(id), `WAITING_FOR_HER_VOICE names ${id}, which is not one of her lines`);
  const waiting = [];
  for (const id of hers) {
    const recorded = RECORDED[id]?.src === `assets/audio/kafli5/${id}.mp3` && exists(`../assets/audio/kafli5/${id}.mp3`);
    if (recorded) assert.ok(!WAITING_FOR_HER_VOICE.has(id), `${id} has its recording now: take it out of WAITING_FOR_HER_VOICE`);
    else {
      assert.ok(WAITING_FOR_HER_VOICE.has(id), `${id} has no recording and is not named as waiting`);
      waiting.push(id);
    }
  }
  // the day the owner's pick is kept (design-voice.mjs --keep writes voices.json), her lines are recorded with it
  if (VOICES.sloedla) assert.deepEqual(waiting, [], 'she has a voice now: record her lines (node remake/tools/voice-lines.mjs --set kafli5 --only <ids>)');
  else if (waiting.length) t.diagnostic(`${waiting.length} of Slóeðla's lines wait for her voice and are shown as captions: ${waiting.join(', ')}`);
});
