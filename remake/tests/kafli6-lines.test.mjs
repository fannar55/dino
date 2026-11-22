// Chapter 6's spoken lines (the plan's Task 13): every line of remake/chapters/kafli6.js WORDS is a line of the kafli6 set
// (assets/audio/kafli6/lines-source.json, made by tools/voice-lines.mjs --set kafli6), said by its speaker from its own recording.
// Mosi counts the prints with chapter 2's six takes (k2_mosi_1 .. k2_mosi_6): nothing is recorded for the count.
//   node --import ./remake/tests/setup.mjs --test remake/tests/kafli6-lines.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORDS, chapter } from '../chapters/kafli6.js';

const readJson = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
const exists = relative => fs.existsSync(new URL(relative, import.meta.url));
const SOURCE = exists('../assets/audio/kafli6/lines-source.json') ? readJson('../assets/audio/kafli6/lines-source.json') : [];
const RECORDED = readJson('../assets/audio/lines.json'); // what the page reads: id -> { src, duration, mouth }
const MADE = readJson('../assets/audio/voices-made.json').lines; // the committed record of every take the tools mastered
const VOICES = readJson('../assets/audio/voices.json');
const COUNT = ['Eitt!', 'Tvö!', 'Þrjú!', 'Fjögur!', 'Fimm!', 'Sex!'];

test('every chapter 6 line is a line of the kafli6 set with the same words, named for its speaker', () => {
  const source = new Map(SOURCE.map(line => [line.id, line]));
  assert.equal(source.size, SOURCE.length, 'no id twice');
  assert.deepEqual([...source.keys()].sort(), Object.keys(WORDS).sort(), 'the set is WORDS, no more and no less');
  for (const [id, text] of Object.entries(WORDS)) {
    const entry = source.get(id);
    assert.ok(entry, `${id} is not in kafli6/lines-source.json`);
    assert.match(id, new RegExp(`^k6_${entry.speaker}_[a-z0-9_]+$`), `${id} names its speaker, ${entry.speaker}`);
    assert.ok(['mosi', 'egill', 'sloedla', 'flugedla'].includes(entry.speaker), `${id}: Grameðla has no lines`);
    assert.equal(entry.text, text, `${id}: the source says what WORDS says`);
    assert.deepEqual(chapter.lines[id], { text, audio: id }, `${id} is said from its own recording`);
  }
});

test('every chapter 6 line has its recording, in lines.json and in voices-made.json, with a mouth that opens', () => {
  const unrecorded = [];
  for (const { id, speaker } of SOURCE) {
    assert.ok(VOICES[speaker], `${speaker} has a voice`);
    const entry = RECORDED[id];
    if (entry?.src !== `assets/audio/kafli6/${id}.mp3` || !exists(`../assets/audio/kafli6/${id}.mp3`) || !MADE[`kafli6/${id}`]) { unrecorded.push(id); continue; }
    assert.ok(entry.duration > 0.8 && entry.duration < 12, `${id} is ${entry.duration} s long`);
    assert.equal(MADE[`kafli6/${id}`].duration, entry.duration, `${id}: the record and lines.json agree on its length`);
    assert.ok(typeof entry.mouth === 'string' && /[1-9a-f]/.test(entry.mouth), `${id} has a mouth that opens (it is not silent)`);
  }
  assert.ok(SOURCE.length > 0, 'the set has lines');
  assert.deepEqual(unrecorded, [], 'every line has its recording (node remake/tools/voice-lines.mjs --set kafli6 --only <ids>)');
});

test("the count at the prints is chapter 2's six takes of Mosi, each at its print: nothing is recorded for it", () => {
  const kafli2 = new Map(readJson('../assets/audio/kafli2/lines-source.json').map(line => [line.id, line]));
  COUNT.forEach((word, k) => {
    const id = `k2_mosi_${k + 1}`; // kafli6.js says k2_mosi_${k + 1} at the count of print k (0 to 5)
    assert.deepEqual(chapter.lines[id], { text: word, audio: id }, `print ${k + 1}: the chapter says ${word} from ${id}`);
    assert.equal(kafli2.get(id)?.text, word, `${id} is chapter 2's ${word}`);
    assert.equal(kafli2.get(id)?.speaker, 'mosi');
    assert.equal(RECORDED[id]?.src, `assets/audio/kafli2/${id}.mp3`, `${id} plays chapter 2's take`);
    assert.ok(exists(`../assets/audio/kafli2/${id}.mp3`), `${id}.mp3 is there`);
    assert.ok(/[1-9a-f]/.test(RECORDED[id].mouth), `${id} is not silent`);
    assert.ok(!SOURCE.some(line => line.id === id || line.text === word), `${word} is not recorded again in kafli6`);
  });
  const src = fs.readFileSync(new URL('../chapters/kafli6.js', import.meta.url), 'utf8');
  assert.match(src, /c\.lines\.say\('mosi', `k2_mosi_\$\{k \+ 1\}`\)/, 'the count event of print k says k2_mosi_(k+1)');
  assert.equal(Object.keys(chapter.lines).length, Object.keys(WORDS).length + COUNT.length, 'the chapter speaks WORDS and the count, nothing else');
});
