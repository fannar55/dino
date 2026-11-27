// The festival's spoken lines (the plan's Task 21): every line of remake/chapters/hatid.js WORDS is a line of the hatid set
// (assets/audio/hatid/lines-source.json, made by tools/voice-lines.mjs --set hatid), said by its speaker from its own recording.
// Grameðla has no line. Slóeðla's four calls are said over the song, each on its call's beat, and must be over before the move.
//   node --import ./remake/tests/setup.mjs --test remake/tests/hatid-lines.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORDS, chapter } from '../chapters/hatid.js';
import { CALL_LINE } from '../chapters/hatid-dance.js';
import { SONG } from '../chapters/hatid-song.js';

const readJson = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
const exists = relative => fs.existsSync(new URL(relative, import.meta.url));
const SOURCE = exists('../assets/audio/hatid/lines-source.json') ? readJson('../assets/audio/hatid/lines-source.json') : [];
const RECORDED = readJson('../assets/audio/lines.json'); // what the page reads: id -> { src, duration, mouth }
const MADE = readJson('../assets/audio/voices-made.json').lines; // the committed record of every take the tools mastered
const VOICES = readJson('../assets/audio/voices.json');
const SPEAKERS = ['egill', 'mosi', 'flugedla', 'kambedla', 'uggedla', 'thorsedla', 'sloedla'];

test('every festival line is a line of the hatid set with the same words, its id h_<speaker>_<name>, named for its speaker; Grameðla has none', () => {
  const source = new Map(SOURCE.map(line => [line.id, line]));
  assert.equal(source.size, SOURCE.length, 'no id twice');
  assert.equal(SOURCE.length, 25, 'the festival has 25 lines');
  assert.deepEqual([...source.keys()].sort(), Object.keys(WORDS).sort(), 'the set is WORDS, no more and no less');
  for (const [id, text] of Object.entries(WORDS)) {
    const entry = source.get(id);
    assert.ok(entry, `${id} is not in hatid/lines-source.json`);
    assert.match(id, new RegExp(`^h_${entry.speaker}_[a-z0-9_]+$`), `${id} names its speaker, ${entry.speaker}`);
    assert.ok(SPEAKERS.includes(entry.speaker), `${id}: ${entry.speaker} is not a festival speaker (Grameðla has no lines)`);
    assert.equal(entry.text, text, `${id}: the source says what WORDS says`);
    assert.deepEqual(chapter.lines[id], { text, audio: id }, `${id} is said from its own recording`);
  }
  assert.ok(!SOURCE.some(line => line.speaker === 'gramedla'), 'Grameðla has none');
});

test('every festival line has its recording, in lines.json and in voices-made.json, with a mouth that opens', () => {
  const unrecorded = [];
  for (const { id, speaker } of SOURCE) {
    assert.ok(VOICES[speaker], `${speaker} has a voice`);
    const entry = RECORDED[id];
    if (entry?.src !== `assets/audio/hatid/${id}.mp3` || !exists(`../assets/audio/hatid/${id}.mp3`) || !MADE[`hatid/${id}`]) { unrecorded.push(id); continue; }
    assert.ok(entry.duration > 0.4 && entry.duration < 12, `${id} is ${entry.duration} s long`);
    assert.equal(MADE[`hatid/${id}`].duration, entry.duration, `${id}: the record and lines.json agree on its length`);
    assert.ok(typeof entry.mouth === 'string' && /[1-9a-f]/.test(entry.mouth), `${id} has a mouth that opens (it is not silent)`);
  }
  assert.ok(SOURCE.length > 0, 'the set has lines');
  assert.deepEqual(unrecorded, [], 'every line has its recording (node remake/tools/voice-lines.mjs --set hatid --only <ids>)');
});

test("each of Slóeðla's four calls is shorter than its gap in the song", () => {
  const beat = 60 / SONG.bpm;
  assert.deepEqual(Object.keys(CALL_LINE).sort(), ['hop', 'spin', 'stomp', 'up']);
  for (const [move, id] of Object.entries(CALL_LINE)) {
    const calls = SONG.song.calls.filter(call => call.move === move);
    assert.ok(calls.length > 0, `${move} is called in the song`);
    const gap = Math.min(...calls.map(call => (call.doBeat - call.beat) * beat)); // one bar: four beats of 0.714 s
    assert.ok(gap > 2.8 && gap < 2.9, `${move}'s gap is one bar (${gap.toFixed(3)} s)`);
    const duration = RECORDED[id]?.duration;
    assert.ok(duration > 0, `${id} is recorded`);
    assert.ok(duration < gap, `${id} is ${duration} s, its gap ${gap.toFixed(3)} s`);
  }
});
