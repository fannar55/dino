import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEARD, assertNotRejected, checkHeardFile, evidenceFor, fixesByWord, fixesProblems, importJano, readHeard, rejectedIn, rejection } from '../tools/heard.mjs';
import { allLines, cacheKey, dry, main, readMade, regenerationPlan, sha256 } from '../tools/voice-lines.mjs';
import { readLexicon, requestFor } from '../tools/pronunciation.mjs';
import { bookHtml } from '../tools/voice-pages.mjs';
import { fixtureLexicon } from './lexicon-fixture.mjs';
import { WAITING } from './waiting-for-new-take.mjs';

// THE OWNER'S EAR (tools/heard.mjs): his yes/no verdicts live in the repo (remake/assets/audio/heard/), each bound to the exact
// request he heard; no line this checkout ships carries a request he rejected (but those waiting for a new take); every tool that
// sends text-to-speech goes through the book (requestFor) and the guard; and every line that carries its own say or context names
// what it fixes, so the next session finds the recipe that already won.

const file = relative => fileURLToPath(new URL(relative, import.meta.url));
const REPO = file('../..');
const TOOLS = file('../tools');
const sources = new Map();
const read = name => { if (!sources.has(name)) sources.set(name, fs.readFileSync(path.join(TOOLS, name), 'utf8')); return sources.get(name); };
const HEX = /^[0-9a-f]{64}$/;
const KEY = 'sk_test_0123456789abcdef0123456789abcdef0123456789ab';
const MOSI = 'osSKuDKznhXBktjJ9Z9F';

/** The tools that send to ElevenLabs text-to-speech but do not take the book and the guard yet: file -> why, and when it goes. */
const PENDING = {};

// ---------------------------------------------------------------------------------------------
// The repo as it is

test('every heard file is valid: named <date>-<set>.json, verdict ja or nei, key and mp3 64 hex, each line "<set>/<id>"', () => {
  const dir = path.join(REPO, HEARD);
  const names = fs.readdirSync(dir).filter(name => name.endsWith('.json'));
  assert.ok(names.length >= 1, 'the owner\'s first yes/no page is imported');
  assert.deepEqual(fs.readdirSync(dir).filter(name => !name.endsWith('.json')), [], 'nothing but heard files (no .part left over)');
  const heard = readHeard(REPO); // checks every file as the tools do
  for (const name of names) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`, `${name}: in the form heard.mjs writes`);
    assert.match(name, /^\d{4}-\d{2}-\d{2}-[a-z][a-z0-9-]*?(-\d+)?\.json$/);
  }
  assert.ok(heard.verdicts.length > 0);
  for (const verdict of heard.verdicts) {
    assert.match(verdict.id, /^[a-z][a-z0-9-]*\/[A-Za-z][A-Za-z0-9_]*$/, `${verdict.file}: ${verdict.id}`);
    assert.ok(['ja', 'nei'].includes(verdict.verdict), `${verdict.id}: ja or nei`);
    assert.match(verdict.key, HEX, `${verdict.id}: key`);
    assert.match(verdict.mp3, HEX, `${verdict.id}: mp3`);
    assert.ok(verdict.speaker && verdict.text, `${verdict.id}: who said what`);
  }
  // The first import (jano-kafli2.json, 2026-11-01): "Einn!" was rejected on the very request Háls og hali's "Einn!" ships.
  assert.equal(rejection(heard, '493e80dadd1c17b453585d02d7964c0c3e70db8b78e35a68beaa65f3800fa7f7')?.id, 'kafli2/k2_mosi_einn');
});

test('no line this checkout ships carries a request the owner rejected, but those waiting for a new take (tests/waiting-for-new-take.mjs)', () => {
  const shipped = rejectedIn(readHeard(REPO), readMade(REPO));
  assert.deepEqual(
    shipped.filter(item => !Object.hasOwn(WAITING, item.id)).map(item => `${item.id} (rejected as ${item.by.id}, ${item.by.date})`), [],
    'the owner rejected these takes: make them again with another recipe or seed (voice-lines.mjs --plan and --dry say which), or, when another branch makes the new take, name them in tests/waiting-for-new-take.mjs',
  );
  for (const [id, why] of Object.entries(WAITING)) {
    assert.ok(typeof why === 'string' && why.trim().length > 20, `${id}: WAITING says why it waits and where the new take is made`);
    assert.ok(shipped.some(item => item.id === id), `${id} is in tests/waiting-for-new-take.mjs, but this checkout no longer ships a rejected request for it (its new take is in): take it out of WAITING`);
  }
});

test('every tool that sends to ElevenLabs text-to-speech takes requestFor from pronunciation.mjs and calls the heard guard (sound effects, music, speech-to-text and voice design are not text-to-speech)', () => {
  const tools = fs.readdirSync(TOOLS).filter(name => name.endsWith('.mjs'));
  const asksEleven = name => /api\.elevenlabs\.io/.test(read(name));
  const speaks = name => asksEleven(name) && /\/text-to-speech\b/.test(read(name));
  const speaking = tools.filter(speaks);
  for (const name of ['voice-lines.mjs', 'yatzy-junior-voices.mjs', 'sloedla-dj.mjs']) assert.ok(speaking.includes(name), `${name} sends text-to-speech and is found as such`);
  for (const name of ['sloedla-crowd.mjs', 'sloedla-music.mjs', 'memory-sound-design.mjs'].filter(name => tools.includes(name))) {
    assert.ok(asksEleven(name) && !speaking.includes(name), `${name} asks ElevenLabs for sound effects, music or speech-to-text only: not text-to-speech`);
  }
  const imports = (source, name, from) => new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'${from.replaceAll('.', '\\.')}'`).test(source);
  const complies = name => {
    const source = read(name);
    const body = source.replace(/^import[^;]*;$/gm, '');
    return imports(source, 'requestFor', './pronunciation.mjs') && /\brequestFor\(/.test(body) && imports(source, 'assertNotRejected', './heard.mjs') && /\bassertNotRejected\(/.test(body);
  };
  for (const name of speaking) {
    if (Object.hasOwn(PENDING, name)) {
      assert.ok(!complies(name), `${name} takes the book and the guard now: take it out of PENDING (${PENDING[name]})`);
      continue;
    }
    assert.ok(complies(name), `${name} sends text-to-speech: it imports requestFor from ./pronunciation.mjs (every line through the book) and assertNotRejected from ./heard.mjs, and calls it for every game line before it asks or installs`);
  }
  for (const name of Object.keys(PENDING)) assert.ok(speaking.includes(name), `${name} is in PENDING but is no longer a text-to-speech tool here: take it out`);
});

test('every line that carries its own say or context names what it fixes: book words (in pronunciation.json and said in the line), "punctuation" or "line"', () => {
  const lexicon = readLexicon(REPO);
  const lines = allLines(REPO); // every set's lines-source.json, and Litla Yatzy's with lines-overrides.json
  const own = lines.filter(line => line.say !== undefined || line.context !== undefined);
  assert.ok(own.length >= 22, `${own.length} lines carry their own say or context`);
  assert.deepEqual(lines.flatMap(line => fixesProblems(line, lexicon)), []);
  // What the line-level fixes say, word by word, is what --dry shows.
  const fixes = fixesByWord(lines);
  assert.deepEqual(fixes.get('einn').map(fix => fix.where), ['yatzy-junior/smallStraight']);
  assert.ok(fixes.get('uggedla').length >= 2);
  for (const id of fixes.keys()) assert.ok(Object.hasOwn(lexicon.words, id), `${id} is a word of the book`);
});

// ---------------------------------------------------------------------------------------------
// The tool, on roots of the tests' own

/** A temp root with a record, the lines beside it and (when given) heard files. */
function makeRoot(t, { lines = {}, record = {}, heard = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const audio = path.join(root, 'remake/assets/audio');
  for (const [set, list] of Object.entries(lines)) {
    fs.mkdirSync(path.join(audio, set), { recursive: true });
    fs.writeFileSync(path.join(audio, set, 'lines-source.json'), JSON.stringify(list));
  }
  fs.mkdirSync(audio, { recursive: true });
  fs.writeFileSync(path.join(audio, 'voices-made.json'), JSON.stringify({ about: 'test', lines: record }));
  if (Object.keys(heard).length) fs.mkdirSync(path.join(root, HEARD), { recursive: true });
  for (const [name, data] of Object.entries(heard)) fs.writeFileSync(path.join(root, HEARD, name), `${JSON.stringify(data, null, 2)}\n`);
  return root;
}
const hex = n => n.toString(16).padStart(2, '0').repeat(32);
const verdict = (choice, key, extra = {}) => ({ verdict: choice, key, mp3: hex(0xee), speaker: 'mosi', text: 'Einn!', ...extra });
const jano = (t, data) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jano-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const name = path.join(dir, `jano-${data.set}.json`);
  fs.writeFileSync(name, JSON.stringify(data));
  return name;
};

test('importJano binds each verdict to the request and MP3 the record holds, writes one file per import, and leaves the owner\'s file as it was', t => {
  const lines = { kafli2: [{ id: 'k2_mosi_einn', speaker: 'mosi', text: 'Einn!' }, { id: 'k2_mosi_tveir', speaker: 'mosi', text: 'Tveir!' }] };
  const record = { 'kafli2/k2_mosi_einn': { key: hex(1), mp3: hex(2), duration: 1, model: 'eleven_v4' }, 'kafli2/k2_mosi_tveir': { key: hex(3), mp3: hex(4), duration: 1, model: 'eleven_v4' } };
  const root = makeRoot(t, { lines, record });
  const saved = { set: 'kafli2', choices: { k2_mosi_einn: 'nei', k2_mosi_tveir: 'ja' }, notes: { k2_mosi_einn: ' sounds like ein ', k2_mosi_tveir: '' } };
  const owners = jano(t, saved);
  const before = fs.readFileSync(owners, 'utf8');
  const done = importJano(root, owners, { date: '2026-11-01' });
  assert.equal(done.file, `${HEARD}/2026-11-01-kafli2.json`);
  assert.deepEqual([done.ja, done.nei], [1, 1]);
  assert.equal(fs.readFileSync(owners, 'utf8'), before, "the owner's file is only read");
  const written = JSON.parse(fs.readFileSync(path.join(root, done.file), 'utf8'));
  assert.deepEqual(written, {
    set: 'kafli2', date: '2026-11-01', source: 'jano-kafli2.json', verdicts: {
      'kafli2/k2_mosi_einn': { verdict: 'nei', key: hex(1), mp3: hex(2), speaker: 'mosi', text: 'Einn!', note: 'sounds like ein' },
      'kafli2/k2_mosi_tveir': { verdict: 'ja', key: hex(3), mp3: hex(4), speaker: 'mosi', text: 'Tveir!' },
    },
  });
  assert.throws(() => importJano(root, owners, { date: '2026-11-01' }), /already imported, as remake\/assets\/audio\/heard\/2026-11-01-kafli2\.json\. Nothing was written/);
  const again = importJano(root, jano(t, { ...saved, choices: { k2_mosi_einn: 'ja' } }), { date: '2026-11-01' });
  assert.equal(again.file, `${HEARD}/2026-11-01-kafli2-2.json`, 'a name taken: -2');
  const heard = readHeard(root);
  assert.equal(rejection(heard, hex(1)), null, "the later import's ja lifts the nei");
  assert.deepEqual(heard.byKey.get(hex(1)).map(item => [item.verdict, item.file]), [['nei', `${HEARD}/2026-11-01-kafli2.json`], ['ja', `${HEARD}/2026-11-01-kafli2-2.json`]], 'in date order, -2 after its first');
});

test('importJano refuses a line the record does not know, and reads another checkout\'s record and lines with --made', t => {
  const root = makeRoot(t, { lines: { kafli2: [{ id: 'k2_mosi_old', speaker: 'mosi', text: 'Halló!' }] }, record: { 'kafli2/k2_mosi_old': { key: hex(5), mp3: hex(6) } } });
  const owners = jano(t, { set: 'kafli2', choices: { k2_mosi_einn: 'nei', k2_mosi_old: 'ja' } });
  assert.throws(() => importJano(root, owners, { date: '2026-11-01' }), /kafli2\/k2_mosi_einn is not in the record .*--made .*Nothing was written/s);
  assert.ok(!fs.existsSync(path.join(root, HEARD)), 'nothing written');
  const other = makeRoot(t, { lines: { kafli2: [{ id: 'k2_mosi_einn', speaker: 'mosi', text: 'Einn!' }, { id: 'k2_mosi_old', speaker: 'mosi', text: 'Halló!' }] }, record: { 'kafli2/k2_mosi_einn': { key: hex(7), mp3: hex(8) }, 'kafli2/k2_mosi_old': { key: hex(5), mp3: hex(6) } } });
  const done = importJano(root, owners, { made: path.join(other, 'remake/assets/audio/voices-made.json'), date: '2026-11-02' });
  assert.equal(done.verdicts['kafli2/k2_mosi_einn'].key, hex(7));
  assert.throws(() => importJano(root, jano(t, { set: 'kafli2', choices: { k2_mosi_old: 'kannski' } })), /"kannski" is not "ja" or "nei"/);
  assert.throws(() => importJano(root, owners, { date: '2026-13-01', made: path.join(other, 'remake/assets/audio/voices-made.json') }), /not a date/);
});

test('a heard file that is not as heard.mjs writes it is refused, with what is wrong', () => {
  const good = { set: 'hals', date: '2026-11-01', source: 'jano-hals.json', verdicts: { 'hals/hals_mosi_1': verdict('nei', hex(9)) } };
  assert.deepEqual(checkHeardFile('2026-11-01-hals.json', good), { date: '2026-11-01', set: 'hals', n: 1 });
  assert.deepEqual(checkHeardFile('2026-11-01-yatzy-junior-3.json', { ...good, set: 'yatzy-junior', verdicts: { 'yatzy-junior/smallStraight': verdict('ja', hex(9)) } }), { date: '2026-11-01', set: 'yatzy-junior', n: 3 });
  for (const [why, name, data, message] of [
    ['a name without a date', 'hals.json', good, /not named/],
    ['another set than its name', '2026-11-01-kafli2.json', good, /"set" is the set its name says/],
    ['another date than its name', '2026-11-02-hals.json', good, /"date" is the date its name says/],
    ['a verdict that is neither', '2026-11-01-hals.json', { ...good, verdicts: { 'hals/hals_mosi_1': verdict('kannski', hex(9)) } }, /"ja" or "nei"/],
    ['a short key', '2026-11-01-hals.json', { ...good, verdicts: { 'hals/hals_mosi_1': verdict('nei', 'abc') } }, /64-hex cache key/],
    ['a line of another set', '2026-11-01-hals.json', { ...good, verdicts: { 'kafli2/k2_mosi_einn': verdict('nei', hex(9)) } }, /is not "hals\/<id>"/],
    ['a field of its own', '2026-11-01-hals.json', { ...good, verdicts: { 'hals/hals_mosi_1': verdict('nei', hex(9), { seed: 7 }) } }, /holds verdict, key, mp3/],
    ['no verdicts', '2026-11-01-hals.json', { ...good, verdicts: {} }, /at least one/],
  ]) assert.throws(() => checkHeardFile(name, data), message, why);
});

test('the guard: only the latest verdict on exactly that request counts, and it names the line, the verdict and what to do', t => {
  const root = makeRoot(t, { heard: {
    '2026-11-01-kafli2.json': { set: 'kafli2', date: '2026-11-01', source: 'jano-kafli2.json', verdicts: { 'kafli2/k2_mosi_einn': verdict('nei', hex(1)), 'kafli2/k2_mosi_tveir': verdict('nei', hex(2), { text: 'Tveir!' }) } },
    '2026-11-03-kafli2.json': { set: 'kafli2', date: '2026-11-03', source: 'jano-kafli2.json', verdicts: { 'kafli2/k2_mosi_tveir': verdict('ja', hex(2), { text: 'Tveir!' }) } },
  } });
  const heard = readHeard(root);
  assert.throws(() => assertNotRejected(heard, hex(1), 'hals/hals_mosi_1'), { message: 'hals/hals_mosi_1: The owner rejected exactly this request (kafli2/k2_mosi_einn, 2026-11-01): choose another recipe or seed.' });
  assert.doesNotThrow(() => assertNotRejected(heard, hex(2), 'kafli2/k2_mosi_tveir'), 'a later ja lifts it');
  assert.doesNotThrow(() => assertNotRejected(heard, hex(3), 'x'), 'another request is another request');
  assert.deepEqual(rejectedIn(heard, { 'hals/hals_mosi_1': { key: hex(1) }, 'kafli2/k2_mosi_tveir': { key: hex(2) } }).map(item => [item.id, item.by.id]), [['hals/hals_mosi_1', 'kafli2/k2_mosi_einn']]);
  assert.deepEqual(readHeard(makeRoot(t)).verdicts, [], 'a root without heard files has none');
});

/** A voice root of the tests' own: one set, the voices, a lexicon, a record, MP3s that are the record's, lines.json, and heard files. */
function voiceRoot(t, { lines, lexicon = { words: {} }, heard = {} }) {
  const voices = { mosi: MOSI };
  const keyOf = line => { const sent = requestFor(line, lexicon); return cacheKey({ text: sent.text, voiceId: voices[line.speaker], seed: sent.seed, context: sent.context }); };
  const root = makeRoot(t, { lines: { hals: lines }, heard });
  const audio = path.join(root, 'remake/assets/audio');
  fs.writeFileSync(path.join(audio, 'voices.json'), JSON.stringify(voices));
  fs.writeFileSync(path.join(audio, 'pronunciation.json'), JSON.stringify(lexicon, null, 2));
  const record = {};
  const entries = {};
  for (const line of lines) {
    const mp3 = path.join(audio, 'hals', `${line.id}.mp3`);
    fs.writeFileSync(mp3, `take of ${line.id}`);
    record[`hals/${line.id}`] = { key: keyOf(line), mp3: sha256(mp3), duration: 1.25, model: 'eleven_v4' };
    entries[line.id] = { src: `assets/audio/hals/${line.id}.mp3`, duration: 1.25, mouth: '0f000' };
  }
  fs.writeFileSync(path.join(audio, 'voices-made.json'), JSON.stringify({ about: 'test', lines: record }));
  fs.writeFileSync(path.join(audio, 'lines.json'), JSON.stringify(entries));
  fs.mkdirSync(path.join(audio, 'yatzy-junior'), { recursive: true });
  fs.writeFileSync(path.join(audio, 'yatzy-junior/manifest.json'), JSON.stringify({}));
  return { root, keyOf };
}
const HALS = [{ id: 'hals_mosi_1', speaker: 'mosi', text: 'Einn!' }, { id: 'hals_mosi_2', speaker: 'mosi', text: 'Tveir!' }];
const rejecting = key => ({ '2026-11-01-kafli2.json': { set: 'kafli2', date: '2026-11-01', source: 'jano-kafli2.json', verdicts: { 'kafli2/k2_mosi_einn': verdict('nei', key, { note: 'eins og ein' }) } } });

test('voice-lines.mjs makes no rejected request: it stops before anything is asked or installed, with the line and the verdict', async t => {
  const keyOf = line => cacheKey({ text: line.text, voiceId: MOSI });
  const { root } = voiceRoot(t, { lines: HALS, heard: rejecting(keyOf(HALS[0])) });
  const calls = [];
  const fetch = async () => { calls.push(1); throw new Error('asked'); };
  await assert.rejects(main(['--set', 'hals', '--only', 'hals_mosi_1'], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} }), { message: 'hals/hals_mosi_1: The owner rejected exactly this request (kafli2/k2_mosi_einn, 2026-11-01): choose another recipe or seed.' });
  await assert.rejects(main(['--set', 'hals'], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} }), /hals\/hals_mosi_1: The owner rejected/, 'the whole set stops, before its first line');
  assert.equal(calls.length, 0, 'nothing asked');
  const take = path.join(root, 'remake/assets/audio/hals/hals_mosi_1.mp3');
  assert.equal(fs.readFileSync(take, 'utf8'), 'take of hals_mosi_1', 'nothing installed');
});

test('--plan lists a line whose shipped take the owner rejected under its set, to make again with another recipe or seed; once the recipe changes it is a line to make', async t => {
  const keyOf = line => cacheKey({ text: line.text, voiceId: MOSI });
  const { root } = voiceRoot(t, { lines: HALS, heard: rejecting(keyOf(HALS[0])) });
  const plan = regenerationPlan(root, { caches: [], junior: {} }).hals;
  assert.deepEqual(plan.rejected, [{ id: 'hals_mosi_1', by: 'kafli2/k2_mosi_einn', date: '2026-11-01', note: 'eins og ein' }]);
  assert.deepEqual([plan.make, plan.current], [[], 1], 'not to make as it is (the guard would refuse the same request), not as it should be');
  const logged = [];
  await main(['--plan'], { root, log: line => logged.push(line) });
  assert.ok(logged.some(line => line.startsWith('hals: 0 to make') && line.endsWith('1 rejected by the owner')), logged.join('\n'));
  assert.ok(logged.some(line => line.includes('rejected by the owner, to make again with another recipe or seed: hals_mosi_1 (his "nei" on kafli2/k2_mosi_einn, 2026-11-01')), logged.join('\n'));
  // A recipe for Einn now: the request changes, so the line is one to make, its rejection among the reasons.
  const lexicon = fixtureLexicon();
  fs.writeFileSync(path.join(root, 'remake/assets/audio/pronunciation.json'), JSON.stringify(lexicon, null, 2));
  const after = regenerationPlan(root, { caches: [], junior: {} }).hals;
  assert.deepEqual(after.rejected, []);
  assert.deepEqual(after.make.map(item => item.id), ['hals_mosi_1']);
  assert.match(after.make[0].reasons.join('; '), /^the owner rejected its take \(kafli2\/k2_mosi_einn, 2026-11-01\); the lexicon changed its request/);
});

test('--dry tells, line by line, where each of its words was fixed on a line of its own and whether this exact request was rejected', t => {
  const lexicon = fixtureLexicon(); // Einn: IPA; ein-inni and Egill not chosen
  const lines = [
    { id: 'hals_mosi_1', speaker: 'mosi', text: 'Einn!' },
    { id: 'hals_mosi_count', speaker: 'mosi', text: 'Einn, tveir, þrír.', context: 'Við teljum á íslensku: einn, tveir, þrír.', seed: 7, fixes: 'einn', note: 'by ear' },
    { id: 'hals_mosi_hi', speaker: 'mosi', text: 'Halló!' },
  ];
  const { root } = voiceRoot(t, { lines, lexicon });
  const sent = requestFor(lines[0], lexicon);
  const key = cacheKey({ text: sent.text, voiceId: MOSI, seed: sent.seed, context: sent.context });
  fs.mkdirSync(path.join(root, HEARD), { recursive: true });
  fs.writeFileSync(path.join(root, HEARD, '2026-11-01-hals.json'), `${JSON.stringify({ set: 'hals', date: '2026-11-01', source: 'jano-hals.json', verdicts: { 'hals/hals_mosi_1': verdict('nei', key) } }, null, 2)}\n`);
  const logged = [];
  const rows = dry({ root, set: 'hals', log: line => logged.push(line) });
  const row = id => rows.find(item => item.id === id);
  const ipa = lexicon.words.einn.recipes.ipa;
  assert.deepEqual(row('hals_mosi_1').evidence, [
    'REJECTED: the owner rejected exactly this request (hals/hals_mosi_1, 2026-11-01): choose another recipe or seed.',
    `Einn: fixed on its own line in hals/hals_mosi_count (context "Við teljum á íslensku: einn, tveir, þrír.", seed 7); the book's default is ipa (say ${JSON.stringify(ipa.say.Einn)}${ipa.seed === undefined ? '' : `, seed ${ipa.seed}`}).`,
  ]);
  assert.equal(row('hals_mosi_1').rejected, true);
  assert.deepEqual(row('hals_mosi_count').evidence, [], 'its own fix is not news to it');
  assert.deepEqual(row('hals_mosi_hi').evidence, []);
  assert.ok(logged.includes(`      ${row('hals_mosi_1').evidence[1]}`), 'printed under the line');
  assert.match(logged[0], /1 REJECTED by the owner/);
  // The same evidence, word by word, on the book's page.
  const html = bookHtml(lexicon, [], { elsewhere: fixesByWord(allLines(root, {})) });
  assert.equal(html.includes('Sérlausnir'), false, 'no rows, no sections');
  const withRows = bookHtml(lexicon, [{ word: 'einn', speaker: 'mosi', recipe: 'ipa', text: 'Einn!', file: 'einn/mosi-ipa.mp3', sent: { text: 'x' } }], { elsewhere: fixesByWord(allLines(root, {})) });
  assert.match(withRows, /Sérlausnir annars staðar[^<]*<code>hals\/hals_mosi_count<\/code> · samhengi \(ekki talað\): Við teljum á íslensku: einn, tveir, þrír\. · fræ 7/);
});

test('evidenceFor and fixesProblems on lines of their own', () => {
  const lexicon = fixtureLexicon();
  const fixes = fixesByWord([{ set: 'eitt', id: 'a', speaker: 'mosi', text: 'Eitt!', say: 'Eytt!', fixes: ['eitt'] }, { set: 'eitt', id: 'b', speaker: 'mosi', text: 'Eitt!', fixes: 'punctuation', say: 'Eitt.' }]);
  assert.deepEqual([...fixes.keys()], ['eitt'], '"punctuation" names no word');
  const heard = { byKey: new Map() };
  assert.deepEqual(evidenceFor({ where: 'kafli1/x', words: [{ id: 'eitt' }], key: null, lexicon, fixes, heard }), [`Eitt: fixed on its own line in eitt/a (say "Eytt!"); the book's default is stafsetning (say "Eiht", seed 42).`]);
  const line = fields => ({ set: 'hals', id: 'x', speaker: 'mosi', text: 'Einn! Vá.', ...fields });
  assert.deepEqual(fixesProblems(line({ seed: 3 }), lexicon), [], 'a seed alone needs no fixes');
  assert.deepEqual(fixesProblems(line({ kept: 'by ear' }), lexicon), [], 'kept alone needs no fixes');
  assert.match(fixesProblems(line({ context: 'Teljum.' }), lexicon)[0], /no "fixes"/);
  assert.deepEqual(fixesProblems(line({ context: 'Teljum.', fixes: 'einn' }), lexicon), []);
  assert.deepEqual(fixesProblems(line({ context: 'Teljum.', fixes: ['einn', 'egill'] }), lexicon), ['hals/x: fixes egill, but the line does not say Egill.']);
  assert.match(fixesProblems(line({ context: 'Teljum.', fixes: 'synti' }), lexicon)[0], /"synti" is not a word of pronunciation\.json/);
  assert.deepEqual(fixesProblems(line({ say: 'Einn, Vá', fixes: 'punctuation' }), lexicon), [], 'punctuation and spaces alone');
  assert.match(fixesProblems(line({ say: 'Eitn! Vá.', fixes: 'punctuation' }), lexicon)[0], /more than punctuation/);
  assert.match(fixesProblems(line({ say: 'Einn, Vá', context: 'x', fixes: 'punctuation' }), lexicon)[0], /have no context/);
  assert.match(fixesProblems(line({ context: 'x', fixes: 'line', note: 'by ear' }), lexicon)[0], /say so in the note/);
  assert.deepEqual(fixesProblems(line({ context: 'x', fixes: 'line', note: 'It fixes the whole line.' }), lexicon), []);
  assert.match(fixesProblems(line({ seed: 3, fixes: 'einn' }), lexicon)[0], /without a say or context/);
});
