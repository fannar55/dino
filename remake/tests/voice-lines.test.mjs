import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MOUTH_RATE, REMAKE_AUDIO, SETS, buildLines, remakeLines, updateLines } from '../tools/audio-lines.mjs';
import { createHash } from 'node:crypto';
import { CANDIDATES, MODEL, SETTINGS, cacheKey, madeFrom, main, parseArgs, readLines, regenerationPlan, siblingCaches } from '../tools/voice-lines.mjs';
import { VISIT, fixtureLexicon, fixtureWords } from './lexicon-fixture.mjs';

// The remake's voices (tools/voice-lines.mjs): the lines to be spoken (lines-source.json) match the spec, the key stays
// out of every file and log, every answer is cached, and the lines.json entries are the game's own kind. The lines come in
// sets, each in a folder of its own: kafli1, the chapter's, and book, the narrator's.

const file = relative => fileURLToPath(new URL(relative, import.meta.url));
const REAL = {
  repo: file('../..'),
  source: file('../assets/audio/kafli1/lines-source.json'),
  book: file('../assets/audio/book/lines-source.json'),
  voices: file('../assets/audio/voices.json'),
  lines: file('../assets/audio/lines.json'),
  spec: file('../../docs/superpowers/specs/2026-10-15-kafli-1-bod-til-kambedlunnar.md'),
  bookSpec: file('../../docs/superpowers/specs/2026-10-17-landkonnudabok-fraedsla-design.md'),
  narration: file('../../dist/assets/audio/narration-is.json'),
  oldScript: file('../../scripts/generate-narration.mjs'),
  tool: file('../tools/voice-lines.mjs'),
};
const readJson = path_ => JSON.parse(fs.readFileSync(path_, 'utf8'));

const KEY = 'sk_test_0123456789abcdef0123456789abcdef0123456789ab';
const VOICES = { mosi: 'osSKuDKznhXBktjJ9Z9F', kambedla: 'KambedlaVoice0000001', egill: 'EgillVoice0000000002' };

const hasFfmpeg = ['ffmpeg', 'ffprobe'].every(tool => spawnSync(tool, ['-version']).status === 0);
const needsFfmpeg = { skip: hasFfmpeg ? false : 'ffmpeg and ffprobe are needed to make and measure audio' };

let speech = null;
/** A second and a bit of "voice": a tone with a slow tremolo, so the mouth has loud and quiet parts to follow. */
function fakeSpeech() {
  speech ??= execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=1.4', '-af', 'tremolo=f=3:d=0.9',
    '-ar', '44100', '-ac', '1', '-b:a', '128k', '-f', 'mp3', '-'], { maxBuffer: 1 << 24 });
  return speech;
}

/** An ElevenLabs that answers every request with `audio` and remembers what it was asked. */
function fakeApi(answer = () => new Response(fakeSpeech(), { status: 200, headers: { 'content-type': 'audio/mpeg' } })) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return answer(url, init);
  };
  return { fetch, calls };
}

/** A repo root of its own in the temp folder, with the lines to speak, the voices, a pronunciation lexicon (empty unless given) and the lines.json the game has; the book's lines (a set of their own) only when `book` gives them. */
function makeRoot(t, { lines = readJson(REAL.source), book = null, voices = VOICES, lexicon = { words: {} } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-lines-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const audio = path.join(root, 'remake/assets/audio');
  fs.mkdirSync(path.join(audio, 'kafli1'), { recursive: true });
  fs.writeFileSync(path.join(audio, 'kafli1/lines-source.json'), JSON.stringify(lines));
  if (book) {
    fs.mkdirSync(path.join(audio, 'book'), { recursive: true });
    fs.writeFileSync(path.join(audio, 'book/lines-source.json'), JSON.stringify(book));
  }
  fs.writeFileSync(path.join(audio, 'voices.json'), JSON.stringify(voices));
  if (lexicon) fs.writeFileSync(path.join(audio, 'pronunciation.json'), JSON.stringify(lexicon, null, 2));
  fs.writeFileSync(path.join(audio, 'lines.json'), JSON.stringify({ welcome: { src: '../dist/assets/audio/welcome.mp3', duration: 6.49, mouth: '0bfc' } }, null, 1));
  return root;
}

/** Every file under `dir`, relative, sorted. */
function filesUnder(dir) {
  const out = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full); else out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

const seconds = target => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', target], { encoding: 'utf8' }).trim());

// ---------------------------------------------------------------------------------------------
// The lines and voices as data

test('lines-source.json has every line the spec speaks in scenes 1 to 10, with exactly its text', () => {
  const spec = fs.readFileSync(REAL.spec, 'utf8');
  const scenes = spec.slice(spec.search(/^## Senur 1/m), spec.search(/^## Lifandi skógur/m));
  assert.ok(scenes.length > 3000, 'the spec still has its scenes');
  const quoted = [...scenes.matchAll(/„([^“]+)“/g)].map(match => match[1]);
  assert.ok(quoted.length >= 30, `only ${quoted.length} lines found in the spec's scenes`);
  const lines = readJson(REAL.source);
  const texts = new Set(lines.map(line => line.text));
  const welcome = readJson(REAL.narration).welcome; // scene 3's greeting is the game's existing recording
  for (const text of quoted) assert.ok(texts.has(text) || text === welcome, `the spec says „${text}“ but lines-source.json does not`);
  // Nothing is spoken that the script does not say, except the humming, which is not words.
  const said = new Set(quoted);
  for (const line of lines) assert.ok(said.has(line.text) || line.id === 'k1_mosi_hum', `${line.id} is not in the spec's scenes`);
  assert.ok(lines.some(line => line.id === 'k1_mosi_hum' && line.speaker === 'mosi'), 'Mosi hums the theme in scene 2');
});

test('every line has a clear id, a speaker with a voice slot, text, and its own take when it says what another says', () => {
  const lines = readJson(REAL.source);
  const voices = readJson(REAL.voices);
  const recorded = readJson(REAL.lines);
  assert.deepEqual(Object.keys(voices).filter(who => !['narrator', 'thorsedla'].includes(who)).sort(), ['egill', 'kambedla', 'mosi']); // the book's narrator and the games' hosts (Þórseðla) are picked by the owner later
  const ids = new Set();
  const takes = new Map();
  for (const line of lines) {
    assert.deepEqual(Object.keys(line).filter(key => !['id', 'speaker', 'text', 'seed', 'kept'].includes(key)), [], `${line.id}: unknown field`);
    assert.match(line.id, /^k1_[a-z]+_[a-z0-9_]+$/, 'k1_<speaker>_<short>');
    assert.equal(line.id.split('_')[1], line.speaker, `${line.id} belongs to ${line.speaker}`);
    assert.ok(Object.hasOwn(voices, line.speaker), `${line.id}: no voice slot for ${line.speaker}`);
    assert.ok(typeof line.text === 'string' && line.text.length > 0 && line.text === line.text.trim(), `${line.id}: text`);
    assert.ok(!ids.has(line.id), `${line.id} twice`);
    ids.add(line.id);
    assert.ok(!Object.hasOwn(recorded, line.id) || recorded[line.id].src.startsWith('assets/audio/kafli1/'), `${line.id} clashes with a recording of the game`);
    if (Object.hasOwn(line, 'seed')) assert.ok(Number.isInteger(line.seed) && line.seed >= 0 && line.seed <= 4294967295, `${line.id}: seed`);
    const same = `${line.speaker}|${line.text}`;
    takes.set(same, [...(takes.get(same) ?? []), line]);
  }
  // Lines that say the same thing would share one cached take; a seed of its own gives each another.
  for (const same of takes.values()) {
    if (same.length < 2) continue;
    const seeds = same.map(line => line.seed);
    assert.ok(seeds.every(seed => seed !== undefined) && new Set(seeds).size === seeds.length, `${same.map(line => line.id)} say the same: each needs its own seed`);
  }
});

test('the lines the owner chose by ear, the takes that say Egill, Kambeðla, Snigill, Eitt and Ein right and Egill calling up to Mosi, are kept, so the tool cannot make them over', () => {
  const lines = readJson(REAL.source);
  for (const id of ['k1_mosi_festival', 'k1_mosi_hocus', 'k1_mosi_star', 'k1_mosi_worry', 'k1_mosi_visit', 'k1_mosi_critters',
    'k1_mosi_snail', 'k1_mosi_greet', 'k1_mosi_one', 'k1_mosi_invite', 'k1_mosi_next', 'k1_egill_hey']) {
    const kept = lines.find(line => line.id === id)?.kept;
    assert.ok(typeof kept === 'string' && kept.trim(), `${id} has no "kept" in lines-source.json: node remake/tools/voice-lines.mjs would make it over from a v3 take, asking ElevenLabs if none is cached (if you mean to make it again, take the id off this list)`);
  }
});

test("voices.json gives Mosi the game's voice, and each new voice is one the owner chose", () => {
  const voices = readJson(REAL.voices);
  const game = /const voiceId = '([^']+)'/.exec(fs.readFileSync(REAL.oldScript, 'utf8'))[1]; // "default ice" in scripts/generate-narration.mjs
  assert.equal(voices.mosi, game);
  for (const who of ['kambedla', 'egill']) assert.match(voices[who] ?? '', /^[A-Za-z0-9]{20}$/, `${who} has a voice id`);
  assert.equal(new Set(Object.values(voices)).size, Object.keys(voices).length, 'a voice each');
});

test('every line of lines-source.json is recorded, and lines.json has an entry for each recording and none for a missing one', () => {
  const recorded = readJson(REAL.lines);
  const lines = readJson(REAL.source);
  const made = fs.readdirSync(path.dirname(REAL.source)).filter(name => name.endsWith('.mp3')).map(name => name.slice(0, -4));
  const known = new Set(lines.map(line => line.id));
  for (const line of lines) assert.ok(made.includes(line.id), `${line.id} has no recording: run node remake/tools/voice-lines.mjs`);
  for (const id of made) {
    assert.ok(known.has(id), `${id}.mp3 is not a line of lines-source.json`);
    assert.equal(recorded[id]?.src, `assets/audio/kafli1/${id}.mp3`, `lines.json lacks ${id}: run node remake/tools/audio-lines.mjs`);
    assert.deepEqual(Object.keys(recorded[id]), ['src', 'duration', 'mouth']);
  }
  for (const [id, entry] of Object.entries(recorded)) {
    if (!entry.src.startsWith('assets/audio/kafli1/')) continue; // the chapter's (k1_kambedla_play is the card game's, in eitt/)
    assert.ok(made.includes(id), `lines.json has ${id} but kafli1/${id}.mp3 is gone`);
    assert.ok(Math.abs(entry.mouth.length - entry.duration * MOUTH_RATE) <= 1.5, `${id}: a mouth track as long as the line`);
  }
});

test('lines.json holds the length of each recording as it is now, so a recording swapped by hand is noticed', needsFfmpeg, () => {
  const recorded = readJson(REAL.lines);
  for (const line of readJson(REAL.source)) {
    const length = seconds(path.join(path.dirname(REAL.source), `${line.id}.mp3`));
    assert.ok(Math.abs(recorded[line.id].duration - length) < 0.002, `${line.id}: lines.json says ${recorded[line.id].duration} s, the file is ${length} s: run node remake/tools/audio-lines.mjs, which measures the MP3s that are there (voice-lines.mjs would ask ElevenLabs for a new take of each line that is not kept)`);
  }
});

// ---------------------------------------------------------------------------------------------
// The key

test('the tool stops without ELEVENLABS_API_KEY', async t => {
  const root = makeRoot(t);
  const before = filesUnder(root);
  const lines = fs.readFileSync(path.join(root, 'remake/assets/audio/lines.json'), 'utf8');
  const { fetch, calls } = fakeApi();
  for (const argv of [[], ['--audition', 'kambedla'], ['--audition', 'narrator'], ['--only', 'k1_mosi_waving'], ['--set', 'book']]) {
    for (const env of [{}, { ELEVENLABS_API_KEY: '' }, { ELEVENLABS_API_KEY: '   ' }]) {
      await assert.rejects(main(argv, { env, root, fetch, log() {} }), /ELEVENLABS_API_KEY/, `${argv.join(' ')} with ${JSON.stringify(env)}`);
    }
  }
  assert.equal(calls.length, 0, 'not one request');
  assert.deepEqual(filesUnder(root), before, 'not one file made');
  assert.equal(fs.readFileSync(path.join(root, 'remake/assets/audio/lines.json'), 'utf8'), lines);

  // The tool itself, as it is run from a shell with no key: it says so and leaves the repo as it was.
  const env = { ...process.env };
  delete env.ELEVENLABS_API_KEY;
  const watched = [path.join(path.dirname(REAL.source), '..', 'lines.json'), path.join(file('../../.tools'), 'elevenlabs-remake')];
  const stamp = () => watched.map(entry => (fs.existsSync(entry) ? fs.statSync(entry).mtimeMs : null));
  const stamps = stamp();
  const result = spawnSync(process.execPath, [REAL.tool, '--audition', 'egill'], { env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ELEVENLABS_API_KEY/);
  assert.deepEqual(stamp(), stamps);
});

test('the tool never writes the key: not into a failed request\'s message, the logs, the cache, the recordings, lines.json or the samples', needsFfmpeg, async t => {
  const root = makeRoot(t);
  const logs = [];
  const log = (...parts) => logs.push(parts.join(' '));

  // A server that echoes the key back in its complaint: the tool's error must not carry it.
  const echo = fakeApi(() => new Response(JSON.stringify({ detail: `invalid api key ${KEY}` }), { status: 401, headers: { 'content-type': 'application/json' } }));
  await assert.rejects(
    main(['--only', 'k1_mosi_waving'], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch: echo.fetch, log }),
    error => /401/.test(error.message) && !error.message.includes(KEY));

  // A server that answers: make a line of each speaker, audition, and look through everything the tool left behind.
  const { fetch, calls } = fakeApi();
  const env = { ELEVENLABS_API_KEY: KEY };
  await main(['--only', 'k1_mosi_waving,k1_kambedla_lost,k1_egill_wow'], { env, root, fetch, log });
  await main(['--audition', 'kambedla'], { env, root, fetch, log });
  await main(['--audition', 'egill'], { env, root, fetch, log });
  assert.ok(calls.length > 10, 'requests were made');
  for (const call of calls) {
    assert.equal(call.headers['xi-api-key'], KEY, 'the key travels in the header');
    assert.ok(!call.url.includes(KEY) && !call.url.includes(encodeURIComponent(KEY)), 'and never in the URL');
    assert.ok(!JSON.stringify(call.body).includes(KEY), 'nor in the body');
  }
  const left = filesUnder(root);
  assert.ok(left.some(name => name.startsWith('.tools/elevenlabs-remake/')) && left.some(name => name.startsWith('qa/remake/voices/')) && left.some(name => name.startsWith('remake/assets/audio/kafli1/')));
  for (const name of left) assert.ok(!fs.readFileSync(path.join(root, name)).includes(KEY), `${name} holds the key`);
  assert.ok(logs.length > 0 && logs.every(line => !line.includes(KEY)), 'the logs');
});

// ---------------------------------------------------------------------------------------------
// The cache

test('a take is cached by a hash of its text, voice, model and settings, so each is paid for once', needsFfmpeg, async t => {
  const base = { text: 'Eitt!', voiceId: VOICES.mosi };
  const key = cacheKey(base);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(cacheKey({ ...base }), key, 'the same request, the same key');
  assert.notEqual(cacheKey({ ...base, text: 'Tvö!' }), key);
  assert.notEqual(cacheKey({ ...base, voiceId: VOICES.egill }), key);
  assert.notEqual(cacheKey({ ...base, model: 'eleven_v3' }), key);
  assert.notEqual(cacheKey({ ...base, settings: { ...SETTINGS, speed: 1 } }), key);
  assert.notEqual(cacheKey({ ...base, seed: 1 }), key);
  assert.notEqual(cacheKey({ ...base, seed: 1 }), cacheKey({ ...base, seed: 2 }));
  assert.equal(MODEL, 'eleven_v4');

  const lines = [{ id: 'k1_mosi_one', speaker: 'mosi', text: 'Eitt!' }, { id: 'k1_mosi_two', speaker: 'mosi', text: 'Tvö!' }];
  const root = makeRoot(t, { lines });
  const env = { ELEVENLABS_API_KEY: KEY };
  const { fetch, calls } = fakeApi();
  await main([], { env, root, fetch, log() {} });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.body.text), ['Eitt!', 'Tvö!']);
  assert.ok(calls.every(call => call.body.model_id === MODEL && call.body.language_code === 'is' && call.url.includes(`/${VOICES.mosi}?`)));
  await main(['--only', 'k1_mosi_two'], { env, root, fetch, log() {} });
  assert.equal(calls.length, 2, 'the second run is answered from .tools/elevenlabs-remake/');
  assert.equal(filesUnder(path.join(root, '.tools/elevenlabs-remake')).length, 2);

  // Another voice is another take. A line whose text changes is asked for again, and the line that did not change is not.
  const voicesFile = path.join(root, 'remake/assets/audio/voices.json');
  fs.writeFileSync(voicesFile, JSON.stringify({ ...VOICES, mosi: 'AnotherVoice00000003' }));
  await main(['--only', 'k1_mosi_one'], { env, root, fetch, log() {} });
  assert.equal(calls.length, 3);
  assert.ok(calls[2].url.includes('/AnotherVoice00000003?'));
  fs.writeFileSync(voicesFile, JSON.stringify(VOICES));
  fs.writeFileSync(path.join(root, 'remake/assets/audio/kafli1/lines-source.json'), JSON.stringify([{ ...lines[0], text: 'Eitt, eitt!' }, lines[1]]));
  await main([], { env, root, fetch, log() {} });
  assert.deepEqual(calls.slice(3).map(call => call.body.text), ['Eitt, eitt!']);
});

test('lines that say the same thing get takes of their own from their seeds', needsFfmpeg, async t => {
  const lines = [1, 2, 3].map(seed => ({ id: `k1_kambedla_mmm${seed}`, speaker: 'kambedla', text: 'Mmm!', seed }));
  const root = makeRoot(t, { lines });
  const { fetch, calls } = fakeApi();
  await main([], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} });
  assert.deepEqual(calls.map(call => call.body.seed), [1, 2, 3]);
  assert.equal(new Set(calls.map(call => call.body.text)).size, 1);
  for (const line of lines) assert.ok(fs.existsSync(path.join(root, `remake/assets/audio/kafli1/${line.id}.mp3`)));
});

// ---------------------------------------------------------------------------------------------
// Making the lines

test('a line is made into an MP3 beside lines-source.json, and lines.json learns its src, exact duration and mouth', needsFfmpeg, async t => {
  const lines = [
    { id: 'k1_mosi_one', speaker: 'mosi', text: 'Eitt!' },
    { id: 'k1_kambedla_glow', speaker: 'kambedla', text: 'Sjáið! Ég lýsi aftur!' },
    { id: 'k1_egill_wow', speaker: 'egill', text: 'Vá! Ég sé yfir allt!' },
  ];
  const root = makeRoot(t, { lines });
  const oldEntries = fs.readFileSync(path.join(root, 'remake/assets/audio/lines.json'), 'utf8');
  const { fetch, calls } = fakeApi();
  const env = { ELEVENLABS_API_KEY: KEY };
  await main(['--only', 'k1_egill_wow,k1_mosi_one'], { env, root, fetch, log() {} });
  assert.deepEqual(calls.map(call => call.body.text), ['Eitt!', 'Vá! Ég sé yfir allt!'], 'only those, in the order of the file');
  assert.ok(calls[1].url.includes(`/${VOICES.egill}?`), "each speaker's own voice");
  assert.ok(!fs.existsSync(path.join(root, 'remake/assets/audio/kafli1/k1_kambedla_glow.mp3')));

  const recorded = JSON.parse(fs.readFileSync(path.join(root, 'remake/assets/audio/lines.json'), 'utf8'));
  assert.deepEqual(Object.keys(recorded), ['welcome', 'k1_mosi_one', 'k1_egill_wow']);
  assert.equal(JSON.stringify(recorded.welcome, null, 1), JSON.stringify(JSON.parse(oldEntries).welcome, null, 1), "the game's own entry is left alone");
  for (const id of ['k1_mosi_one', 'k1_egill_wow']) {
    const mp3 = path.join(root, `remake/assets/audio/kafli1/${id}.mp3`);
    const entry = recorded[id];
    assert.deepEqual(Object.keys(entry), ['src', 'duration', 'mouth'], 'the fields every line of lines.json has');
    assert.equal(entry.src, `assets/audio/kafli1/${id}.mp3`, 'relative to remake/index.html');
    assert.ok(Math.abs(entry.duration - seconds(mp3)) < 0.002, `${id}: the exact duration of the file`);
    assert.ok(entry.duration > 1.4 && entry.duration < 2.2, `${id}: the voice and a quarter second of silence after it, ${entry.duration}`);
    assert.match(entry.mouth, /^[0-9a-f]+$/);
    assert.ok(Math.abs(entry.mouth.length - entry.duration * MOUTH_RATE) <= 1.5, `${id}: a mouth track as long as the line`);
    assert.ok(entry.mouth.includes('0') && /[a-f]/.test(entry.mouth), `${id}: loud and quiet parts`);
  }

  await main(['--only', 'k1_kambedla_glow'], { env, root, fetch, log() {} });
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'remake/assets/audio/lines.json'), 'utf8'))), ['welcome', 'k1_mosi_one', 'k1_egill_wow', 'k1_kambedla_glow']);
});

test('lines of every speaker are normalised to the loudness of the game\'s narration', needsFfmpeg, async t => {
  const lines = [{ id: 'k1_mosi_one', speaker: 'mosi', text: 'Eitt!' }];
  const root = makeRoot(t, { lines });
  await main([], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch: fakeApi().fetch, log() {} });
  const target = path.join(root, 'remake/assets/audio/kafli1/k1_mosi_one.mp3');
  const measured = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', target, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const integrated = Number([...measured.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)[1]); // the summary at the end
  assert.ok(integrated > -21 && integrated < -15, `${integrated} LUFS, about -18 like scripts/generate-narration.mjs`);
  const info = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate,channels,codec_name', '-of', 'csv=p=0', target], { encoding: 'utf8' }).trim();
  assert.equal(info, 'mp3,44100,1');
});

test('a speaker whose voice is not chosen yet stops the run before any request; the others can be made with --only', needsFfmpeg, async t => {
  const root = makeRoot(t, { voices: { ...VOICES, kambedla: null, egill: null } });
  const { fetch, calls } = fakeApi();
  const env = { ELEVENLABS_API_KEY: KEY };
  const before = filesUnder(root);
  await assert.rejects(main([], { env, root, fetch, log() {} }), /kambedla.*egill|egill.*kambedla/);
  await assert.rejects(main(['--only', 'k1_kambedla_lost'], { env, root, fetch, log() {} }), /kambedla/);
  assert.equal(calls.length, 0);
  assert.deepEqual(filesUnder(root), before);
  await main(['--only', 'k1_mosi_waving'], { env, root, fetch, log() {} });
  assert.equal(calls.length, 1);
});

test('the command line refuses what it does not know', () => {
  assert.deepEqual(parseArgs([]), { only: null, audition: null, set: 'kafli1' });
  assert.deepEqual(parseArgs(['--only', 'k1_mosi_one,k1_mosi_two']), { only: ['k1_mosi_one', 'k1_mosi_two'], audition: null, set: 'kafli1' });
  assert.deepEqual(parseArgs(['--audition', 'egill']), { only: null, audition: 'egill', set: 'kafli1' });
  for (const argv of [['--audition'], ['--audition', 'mosi'], ['--audition', 'constructor'], ['--only'], ['--only', ''], ['--force'], ['k1_mosi_one'], ['--audition', 'egill', '--only', 'k1_mosi_one']]) {
    assert.throws(() => parseArgs(argv), Error, argv.join(' '));
  }
});

test("parseArgs takes a line set and the narrator's audition", () => {
  assert.equal(parseArgs([]).set, 'kafli1', 'the chapter unless told otherwise');
  assert.equal(parseArgs(['--set', 'kafli1']).set, 'kafli1');
  assert.deepEqual(parseArgs(['--set', 'book']), { only: null, audition: null, set: 'book' });
  assert.deepEqual(parseArgs(['--set', 'kafli2']), { only: null, audition: null, set: 'kafli2' }, "chapter 2's lines");
  assert.deepEqual(parseArgs(['--only', 'book_find_me', '--set', 'book']), { only: ['book_find_me'], audition: null, set: 'book' }, 'in either order');
  assert.deepEqual(parseArgs(['--audition', 'narrator']), { only: null, audition: 'narrator', set: 'kafli1' });
  for (const argv of [['--set'], ['--set', ''], ['--set', 'kafli3'], ['--set', 'Book'], ['--set', 'constructor'], ['--set', '--only', 'book_find_me']]) {
    assert.throws(() => parseArgs(argv), /--set needs kafli1 or book/, argv.join(' '));
  }
  // A candidate speaks a line of its own set, so --set may only repeat that set in an audition.
  assert.deepEqual(parseArgs(['--audition', 'narrator', '--set', 'book']), { only: null, audition: 'narrator', set: 'book' });
  assert.deepEqual(parseArgs(['--audition', 'egill', '--set', 'kafli1']), { only: null, audition: 'egill', set: 'kafli1' });
  for (const argv of [['--audition', 'narrator', '--set', 'kafli1'], ['--audition', 'egill', '--set', 'book']]) {
    assert.throws(() => parseArgs(argv), /--audition .* set/, argv.join(' '));
  }
});

test('--only names lines that exist, and a line file with a bad id stops the run', needsFfmpeg, async t => {
  const root = makeRoot(t);
  const { fetch, calls } = fakeApi();
  const env = { ELEVENLABS_API_KEY: KEY };
  await assert.rejects(main(['--only', 'k1_mosi_waving,k1_mosi_nonsense'], { env, root, fetch, log() {} }), /k1_mosi_nonsense/);
  const bad = makeRoot(t, { lines: [{ id: '../escape', speaker: 'mosi', text: 'Eitt!' }] });
  await assert.rejects(main([], { env, root: bad, fetch, log() {} }), /\.\.\/escape/);
  assert.equal(calls.length, 0);
  assert.ok(!fs.existsSync(path.join(bad, '.tools')));
});

test('a kept line is never asked for, mastered or written over, with or without --only, and its lines.json entry still comes from its MP3', needsFfmpeg, async t => {
  const kept = "the owner's pick, an Eleven v4 take (seed 2), 2026-10-16";
  const lines = [
    { id: 'k1_mosi_one', speaker: 'mosi', text: 'Eitt!' },
    { id: 'k1_mosi_two', speaker: 'mosi', text: 'Tvö!', seed: 1, kept },
  ];
  const runs = [[[], ['Eitt!']], [['--only', 'k1_mosi_two'], []], [['--only', 'k1_mosi_one,k1_mosi_two'], ['Eitt!']]]; // the arguments, and what is asked for
  for (const [argv, asked] of runs) {
    const label = argv.join(' ') || 'all lines';
    const root = makeRoot(t, { lines });
    const installed = path.join(root, 'remake/assets/audio/kafli1/k1_mosi_two.mp3');
    fs.writeFileSync(installed, fakeSpeech()); // the owner's take: not what the tool would make of "Tvö!", which is a quarter second longer and 96 kbps
    const { fetch, calls } = fakeApi();
    const out = [];
    await main(argv, { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
    assert.deepEqual(calls.map(call => call.body.text), asked, `${label}: only a line that is not kept is asked for`);
    assert.ok(fs.readFileSync(installed).equals(fakeSpeech()), `${label}: the kept MP3 is as it was`);
    assert.ok(out.includes(`Kept k1_mosi_two: ${kept}`), `${label}: it says the line is kept, ${JSON.stringify(out)}`);
    const entry = JSON.parse(fs.readFileSync(path.join(root, 'remake/assets/audio/lines.json'), 'utf8')).k1_mosi_two;
    assert.ok(entry, `${label}: lines.json has an entry for the kept line`);
    assert.deepEqual(Object.keys(entry), ['src', 'duration', 'mouth']);
    assert.equal(entry.src, 'assets/audio/kafli1/k1_mosi_two.mp3');
    assert.ok(Math.abs(entry.duration - seconds(installed)) < 0.002, `${label}: the exact duration of the MP3 that is there, ${entry.duration} s`);
    assert.ok(Math.abs(entry.mouth.length - entry.duration * MOUTH_RATE) <= 1.5, `${label}: and a mouth track as long`);
  }
});

test('a kept line whose MP3 is missing stops the run before any request, with or without --only, and says how to put it right', async t => {
  const lines = [
    { id: 'k1_mosi_one', speaker: 'mosi', text: 'Eitt!' },
    { id: 'k1_mosi_two', speaker: 'mosi', text: 'Tvö!', seed: 1, kept: "the owner's pick, an Eleven v4 take (seed 2), 2026-10-16" },
  ];
  for (const argv of [[], ['--only', 'k1_mosi_two'], ['--only', 'k1_mosi_one,k1_mosi_two']]) {
    const root = makeRoot(t, { lines }); // the kept line's MP3 is not there
    const before = filesUnder(root);
    const { fetch, calls } = fakeApi();
    await assert.rejects(main(argv, { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} }), error => {
      assert.match(error.message, /k1_mosi_two/);
      assert.match(error.message, /kept/);
      assert.match(error.message, /No request was made/);
      return true;
    }, argv.join(' ') || 'all lines');
    assert.equal(calls.length, 0, 'nothing is paid for, the line that is not kept neither');
    assert.deepEqual(filesUnder(root), before, 'and nothing is written');
  }
});

test('a kept line needs no voice: the run makes the others', needsFfmpeg, async t => {
  const lines = [
    { id: 'k1_mosi_two', speaker: 'mosi', text: 'Tvö!', kept: "the owner's pick" },
    { id: 'k1_egill_wow', speaker: 'egill', text: 'Vá!' },
  ];
  const root = makeRoot(t, { lines, voices: { ...VOICES, mosi: null } });
  fs.writeFileSync(path.join(root, 'remake/assets/audio/kafli1/k1_mosi_two.mp3'), fakeSpeech());
  const { fetch, calls } = fakeApi();
  await main([], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} });
  assert.deepEqual(calls.map(call => call.body.text), ['Vá!'], 'only the line that is not kept is asked for');
  assert.ok(fs.existsSync(path.join(root, 'remake/assets/audio/kafli1/k1_egill_wow.mp3')));
});

test('readLines refuses a kept that is empty or not a string, before any request', async t => {
  const line = { id: 'k1_mosi_one', speaker: 'mosi', text: 'Eitt!' };
  for (const kept of ['', '   ', 2, true, null, [], ["the owner's pick"], {}]) {
    assert.throws(() => readLines(makeRoot(t, { lines: [{ ...line, kept }] })), /k1_mosi_one.*kept/, `kept ${JSON.stringify(kept)}`);
  }
  const { fetch, calls } = fakeApi();
  const root = makeRoot(t, { lines: [{ ...line, kept: '' }] });
  await assert.rejects(main([], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} }), /k1_mosi_one.*kept/);
  assert.equal(calls.length, 0);
  assert.equal(readLines(makeRoot(t, { lines: [{ ...line, kept: "the owner's pick" }] }))[0].kept, "the owner's pick");
});

// ---------------------------------------------------------------------------------------------
// The book's lines: a set of their own, spoken by the narrator

const NARRATOR = 'NarratorVoice0000004'; // the voice the owner will pick; voices.json has no narrator until then
const BOOK_LINES = [
  { id: 'book_find_me', speaker: 'narrator', text: 'Finndu mig í skóginum!' },
  { id: 'book_wait', speaker: 'narrator', text: 'Bíddu aðeins!' },
];

test("the line sets are chapter 1's, the book's, the card game's, Háls og hali's and chapter 2's, each in a folder of its own", () => {
  assert.deepEqual(SETS, {
    kafli1: 'remake/assets/audio/kafli1', book: 'remake/assets/audio/book', eitt: 'remake/assets/audio/eitt', hals: 'remake/assets/audio/hals',
    kafli2: 'remake/assets/audio/kafli2',
  });
  assert.equal(REMAKE_AUDIO, SETS.kafli1, 'the chapter stays the default');
});

test("the book's lines-source.json holds the narrator's lines, which the tool reads like the chapter's", () => {
  const lines = readLines(REAL.repo, 'book');
  const byId = new Map(lines.map(line => [line.id, line]));
  assert.ok(byId.has('book_kalligrammatid_1'), "the Kalligrammatid card's first page, which the narrator's candidates read");
  for (const line of lines) {
    assert.match(line.id, /^book_[a-z0-9_]+$/, 'book_<card>_<page> or book_<what>');
    assert.equal(line.speaker, 'narrator', `${line.id}: the narrator reads the whole book`);
  }
  // The unfound animal's tile (spec 3.2): the narrator says exactly this.
  assert.equal(byId.get('book_find_me')?.text, 'Finndu mig í skóginum!');
  assert.ok(fs.readFileSync(REAL.bookSpec, 'utf8').includes('„Finndu mig í skóginum!“'), 'and so does the spec');
});

test("the book's lines live in their own folder", needsFfmpeg, t => {
  const root = makeRoot(t, { book: BOOK_LINES });
  const audio = path.join(root, 'remake/assets/audio');
  assert.deepEqual(readLines(root, 'book'), BOOK_LINES, 'book/lines-source.json');
  assert.deepEqual(readLines(root), readJson(REAL.source), "and the chapter's lines are what you get without a set");
  assert.deepEqual(readLines(root, 'kafli1'), readLines(root));
  assert.throws(() => readLines(root, 'kafli3'), /kafli3/);

  fs.writeFileSync(path.join(audio, 'book/book_find_me.mp3'), fakeSpeech()); // book_wait has no MP3 yet
  const made = remakeLines(root, null, 'book');
  assert.deepEqual(Object.keys(made), ['book_find_me'], 'a line with no MP3 is left out, as in the chapter');
  assert.deepEqual(Object.keys(made.book_find_me), ['src', 'duration', 'mouth']);
  assert.equal(made.book_find_me.src, 'assets/audio/book/book_find_me.mp3', 'relative to remake/index.html');
  assert.deepEqual(remakeLines(root, ['book_wait'], 'book'), {}, 'only the lines asked for, and only if made');
  assert.deepEqual(remakeLines(root), {}, "the chapter's set does not see the book's MP3");
  assert.throws(() => remakeLines(root, null, 'kafli3'), /kafli3/);

  // lines.json takes the game's lines, then the chapter's, then the book's.
  fs.mkdirSync(path.join(root, 'dist/assets/audio'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/assets/audio/old.mp3'), fakeSpeech());
  fs.writeFileSync(path.join(root, 'dist/assets/audio/narration-manifest.json'), JSON.stringify({ clips: { old: 'old.mp3' } }));
  fs.writeFileSync(path.join(audio, 'kafli1/k1_mosi_waving.mp3'), fakeSpeech());
  const lines = buildLines(root);
  assert.deepEqual(Object.keys(lines), ['old', 'k1_mosi_waving', 'book_find_me'], 'buildLines holds both sets');
  assert.equal(lines.k1_mosi_waving.src, 'assets/audio/kafli1/k1_mosi_waving.mp3');
  assert.equal(lines.book_find_me.src, 'assets/audio/book/book_find_me.mp3');
});

test('updateLines renews the entries of one set and leaves the rest of lines.json as it is', needsFfmpeg, t => {
  const root = makeRoot(t, { book: BOOK_LINES });
  const audio = path.join(root, 'remake/assets/audio');
  for (const mp3 of ['book/book_find_me.mp3', 'book/book_wait.mp3', 'kafli1/k1_mosi_waving.mp3']) fs.writeFileSync(path.join(audio, mp3), fakeSpeech());
  const keys = () => Object.keys(readJson(path.join(audio, 'lines.json')));
  updateLines(root, ['book_wait'], 'book');
  assert.deepEqual(keys(), ['welcome', 'book_wait'], 'only the line named, from the book');
  updateLines(root, ['k1_mosi_waving']);
  assert.deepEqual(keys(), ['welcome', 'book_wait', 'k1_mosi_waving'], "and the chapter's set by default");
  updateLines(root, ['book_find_me', 'k1_mosi_waving'], 'book');
  assert.deepEqual(keys(), ['welcome', 'book_wait', 'k1_mosi_waving', 'book_find_me'], 'a line of another set is not made by it');
  assert.equal(readJson(path.join(audio, 'lines.json')).book_find_me.src, 'assets/audio/book/book_find_me.mp3');
  assert.throws(() => updateLines(root, ['book_find_me'], 'kafli3'), /kafli3/);
});

test("--set book makes the book's lines in the book's folder, in the narrator's voice, and registers them", needsFfmpeg, async t => {
  const root = makeRoot(t, { book: BOOK_LINES, voices: { ...VOICES, narrator: NARRATOR } });
  const audio = path.join(root, 'remake/assets/audio');
  const { fetch, calls } = fakeApi();
  const out = [];
  await main(['--set', 'book'], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  assert.deepEqual(calls.map(call => call.body.text), BOOK_LINES.map(line => line.text), "the book's lines, in the order of its file");
  assert.ok(calls.every(call => call.url.includes(`/${NARRATOR}?`)), "in the narrator's voice");
  assert.deepEqual(filesUnder(path.join(audio, 'book')), [...BOOK_LINES.map(line => `${line.id}.mp3`), 'lines-source.json'].sort());
  assert.deepEqual(filesUnder(path.join(audio, 'kafli1')), ['lines-source.json'], "nothing is made in the chapter's folder");
  const recorded = readJson(path.join(audio, 'lines.json'));
  assert.deepEqual(Object.keys(recorded), ['welcome', ...BOOK_LINES.map(line => line.id)]);
  for (const { id } of BOOK_LINES) {
    assert.equal(recorded[id].src, `assets/audio/book/${id}.mp3`);
    assert.deepEqual(Object.keys(recorded[id]), ['src', 'duration', 'mouth']);
    assert.ok(Math.abs(recorded[id].duration - seconds(path.join(audio, `book/${id}.mp3`))) < 0.002, `${id}: the exact duration of the file`);
  }
  assert.ok(out.some(line => line.includes('remake/assets/audio/book/')), `it says where they are, ${JSON.stringify(out)}`);

  await main(['--set', 'book', '--only', 'book_wait'], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} });
  assert.equal(calls.length, 2, 'a second run is answered from the cache');
});

test('--only is looked up in the set that is made, and a speaker without a voice stops the book run before any request', needsFfmpeg, async t => {
  const root = makeRoot(t, { book: BOOK_LINES }); // VOICES has no narrator: the owner has not picked yet
  const { fetch, calls } = fakeApi();
  const env = { ELEVENLABS_API_KEY: KEY };
  const before = filesUnder(root);
  await assert.rejects(main(['--set', 'book'], { env, root, fetch, log() {} }), /No voice is chosen for narrator/);
  await assert.rejects(main(['--set', 'book', '--only', 'k1_mosi_waving'], { env, root, fetch, log() {} }), /Not in remake\/assets\/audio\/book\/lines-source\.json: k1_mosi_waving/);
  await assert.rejects(main(['--only', 'book_find_me'], { env, root, fetch, log() {} }), /Not in remake\/assets\/audio\/kafli1\/lines-source\.json: book_find_me/);
  assert.equal(calls.length, 0);
  assert.deepEqual(filesUnder(root), before, 'nothing is written');
  await main(['--only', 'k1_mosi_waving'], { env, root, fetch, log() {} });
  assert.equal(calls.length, 1, "the chapter's lines do not wait for the narrator");
});

test("a kept line of the book is looked for, and kept, in the book's folder", needsFfmpeg, async t => {
  const kept = "the owner's pick, an Eleven v4 take (seed 2), 2026-10-18";
  const book = [{ ...BOOK_LINES[0], kept }, BOOK_LINES[1]];
  const env = { ELEVENLABS_API_KEY: KEY };
  const voices = { ...VOICES, narrator: NARRATOR };

  const bare = makeRoot(t, { book, voices }); // the kept line's MP3 is not there
  const first = fakeApi();
  await assert.rejects(main(['--set', 'book'], { env, root: bare, fetch: first.fetch, log() {} }), error => {
    assert.match(error.message, /book_find_me/);
    assert.match(error.message, /kept/);
    assert.match(error.message, /remake\/assets\/audio\/book/, "it points at the book's folder");
    assert.match(error.message, /No request was made/);
    return true;
  });
  assert.equal(first.calls.length, 0);

  const root = makeRoot(t, { book, voices });
  const installed = path.join(root, 'remake/assets/audio/book/book_find_me.mp3');
  fs.writeFileSync(installed, fakeSpeech());
  const { fetch, calls } = fakeApi();
  const out = [];
  await main(['--set', 'book'], { env, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  assert.deepEqual(calls.map(call => call.body.text), ['Bíddu aðeins!'], 'only the line that is not kept is asked for');
  assert.ok(fs.readFileSync(installed).equals(fakeSpeech()), 'the kept MP3 is as it was');
  assert.ok(out.includes(`Kept book_find_me: ${kept}`), JSON.stringify(out));
  assert.equal(readJson(path.join(root, 'remake/assets/audio/lines.json')).book_find_me.src, 'assets/audio/book/book_find_me.mp3', 'and its entry comes from that MP3');
});

// ---------------------------------------------------------------------------------------------
// The auditions

for (const [character, expected] of [['kambedla', { min: 4, max: 6 }], ['egill', { min: 4, max: 6 }], ['narrator', { min: 4, max: 6 }]]) {
  test(`--audition ${character} writes one sample of a line they really say per candidate voice, and an index`, needsFfmpeg, async t => {
    const root = makeRoot(t, { book: readJson(REAL.book) });
    const { fetch, calls } = fakeApi();
    const out = [];
    await main(['--audition', character], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log: (...parts) => out.push(parts.join(' ')) });

    const { line, voices, set = 'kafli1' } = CANDIDATES[character]; // a candidate may name the set its sample line is in
    const source = readJson({ kafli1: REAL.source, book: REAL.book }[set]).find(entry => entry.id === line);
    assert.equal(source.speaker, character, 'the sample is a line the character really says');
    assert.ok(voices.length >= expected.min && voices.length <= expected.max, `${voices.length} candidates`);
    assert.equal(new Set(voices.map(voice => voice.id)).size, voices.length, 'each candidate once');
    assert.ok(voices.every(voice => /^[A-Za-z0-9]{20}$/.test(voice.id) && voice.name && voice.note), 'a name, an id and a note for each');
    assert.deepEqual(calls.map(call => call.url.match(/text-to-speech\/([^?]+)/)[1]), voices.map(voice => voice.id));
    assert.ok(calls.every(call => call.body.text === source.text && call.body.model_id === MODEL && call.body.language_code === 'is'));

    const folder = path.join(root, 'qa/remake/voices');
    const made = filesUnder(folder);
    const samples = made.filter(name => name.endsWith('.mp3'));
    assert.equal(samples.length, voices.length);
    assert.equal(new Set(samples).size, samples.length);
    assert.ok(samples.every(name => name.startsWith(`${character}-`)), samples.join(', '));
    assert.deepEqual(made.filter(name => !name.endsWith('.mp3')), [`${character}-index.md`]);
    for (const name of samples) assert.ok(seconds(path.join(folder, name)) > 0.5, `${name} plays`);

    const index = fs.readFileSync(path.join(folder, `${character}-index.md`), 'utf8');
    assert.ok(index.includes(source.text), 'the index says what is sung');
    for (const voice of voices) {
      const sample = samples.find(name => name.includes(`-${voices.indexOf(voice) + 1}-`));
      assert.ok(sample, `${voice.name} has a file`);
      assert.ok(index.includes(voice.name) && index.includes(voice.id) && index.includes(sample), `${voice.name}: name, id and file in the index`);
    }
    assert.ok(!fs.existsSync(path.join(root, `remake/assets/audio/${set}/${line}.mp3`)), 'a sample is not a recording of the chapter or the book');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'remake/assets/audio/lines.json'), 'utf8')).welcome.mouth, '0bfc');
    assert.ok(out.length > 0);
  });
}

test("the narrator's sample line is in the book set, and its five candidates are Icelandic voices no character speaks with", () => {
  const { set, line, voices } = CANDIDATES.narrator;
  assert.equal(set, 'book');
  const sample = readLines(REAL.repo, 'book').find(entry => entry.id === line);
  assert.ok(sample, `${line}, the sample line, is in the real book source`);
  assert.equal(sample.speaker, 'narrator');

  // Calm voices of the shared library that read Icelandic, in the order they are heard.
  assert.deepEqual(voices.map(voice => voice.name.split(' - ')[0]), ['Ingibjorg', 'Katrin', 'Sigrun', 'Bjorn', 'Baldur']);
  assert.deepEqual(voices.map(voice => voice.id), ['EPNZHjyiFUvsaPPq9zRU', 'rx2Jwpr6lciMIbfYvpOA', 'phADS9h1woMxkLioLz5z', '6LR26ZnZ2USBpLHfBBH7', 'B4dcQDH3p7a2cAn9wzSc']);
  assert.ok(voices.every(voice => /^[A-Za-z0-9]{20}$/.test(voice.id) && voice.note.startsWith('Icelandic voice from the shared library: ')), 'an id and a note for each');
  assert.equal(new Set(voices.map(voice => voice.id)).size, voices.length, 'each candidate once');
  const taken = readJson(REAL.voices);
  for (const who of ['mosi', 'kambedla', 'egill']) assert.ok(!voices.some(voice => voice.id === taken[who]), `${who} already speaks with a voice of their own`);
});

// ---------------------------------------------------------------------------------------------
// lines.json from the game's lines and the remake's

test('audio-lines.mjs builds lines.json from the game\'s lines and the remake\'s, with the same fields', needsFfmpeg, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-lines-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'dist/assets/audio'), { recursive: true });
  fs.mkdirSync(path.join(root, 'remake/assets/audio/kafli1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/assets/audio/old.mp3'), fakeSpeech());
  fs.writeFileSync(path.join(root, 'dist/assets/audio/narration-manifest.json'), JSON.stringify({ clips: { old: 'old.mp3' } }));
  fs.writeFileSync(path.join(root, 'remake/assets/audio/kafli1/k1_mosi_one.mp3'), fakeSpeech());
  fs.writeFileSync(path.join(root, 'remake/assets/audio/kafli1/lines-source.json'), JSON.stringify([
    { id: 'k1_mosi_one', speaker: 'mosi', text: 'Eitt!' },
    { id: 'k1_mosi_two', speaker: 'mosi', text: 'Tvö!' }, // not made yet: no entry
  ]));
  const lines = buildLines(root);
  assert.deepEqual(Object.keys(lines), ['old', 'k1_mosi_one']);
  assert.deepEqual(Object.keys(lines.old), Object.keys(lines.k1_mosi_one));
  assert.equal(lines.old.src, '../dist/assets/audio/old.mp3');
  assert.equal(lines.k1_mosi_one.src, 'assets/audio/kafli1/k1_mosi_one.mp3');
  assert.deepEqual({ ...lines.old, src: '' }, { ...lines.k1_mosi_one, src: '' }, 'the same file, the same duration and mouth');
});

// ---------------------------------------------------------------------------------------------
// The pronunciation standard in the tool (remake/assets/audio/pronunciation.json)

// The tests' own lexicon (lexicon-fixture.mjs), never the shipped one, whose choices change as the owner picks: Kambeðla's
// visit context (seed 1), Snigill's IPA (seed 1), Eiht (seed 42), Eyn; Egill not chosen.
const HARD = [
  { id: 'k1_mosi_greet', speaker: 'mosi', text: 'Kambeðla! Halló!' },
  { id: 'k1_mosi_one', speaker: 'mosi', text: 'Eitt!' },
  { id: 'k1_mosi_snail', speaker: 'mosi', text: 'Snigill. Hann er ekkert að flýta sér.' },
  { id: 'k1_mosi_two', speaker: 'mosi', text: 'Tvö!' },
  { id: 'k1_egill_wow', speaker: 'egill', text: 'Áfram, Egill!' }, // Egill is not chosen yet: sent as written
];

test('the tool sends each line through the lexicon: a respelling or IPA as the text, a context as previous_text, the recipe\'s seed; the caption, lines-source.json and lines.json stay clean', needsFfmpeg, async t => {
  const root = makeRoot(t, { lines: HARD, lexicon: fixtureLexicon() });
  const source = fs.readFileSync(path.join(root, 'remake/assets/audio/kafli1/lines-source.json'), 'utf8');
  const { fetch, calls } = fakeApi();
  const out = [];
  await main([], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  const sent = Object.fromEntries(calls.map((call, i) => [HARD[i].id, call.body]));
  assert.deepEqual(sent.k1_mosi_greet, { text: 'Kambeðla! Halló!', model_id: MODEL, language_code: 'is', voice_settings: SETTINGS, seed: 1, previous_text: VISIT });
  assert.equal(sent.k1_mosi_one.text, 'Eiht!');
  assert.equal(sent.k1_mosi_one.seed, 42);
  assert.equal(sent.k1_mosi_snail.text, '"/ˈstniːjɪtl̥/". Hann er ekkert að flýta sér.', 'the IPA as the winning take sent it');
  assert.deepEqual(sent.k1_mosi_two, { text: 'Tvö!', model_id: MODEL, language_code: 'is', voice_settings: SETTINGS }, 'a line with no hard word is sent as before');
  assert.equal(sent.k1_egill_wow.text, 'Áfram, Egill!', 'a word the owner has not picked is sent as written');
  assert.ok(!('previous_text' in sent.k1_egill_wow));
  assert.equal(fs.readFileSync(path.join(root, 'remake/assets/audio/kafli1/lines-source.json'), 'utf8'), source, 'lines-source.json, which the captions read, is untouched');
  const recorded = readJson(path.join(root, 'remake/assets/audio/lines.json'));
  for (const { id } of HARD) assert.deepEqual(Object.keys(recorded[id]), ['src', 'duration', 'mouth'], `${id}: lines.json holds no text`);
  assert.ok(out.includes(`Ready k1_mosi_greet: ${recorded.k1_mosi_greet.duration} s (kambedla: samhengi)`), JSON.stringify(out));
  // The cache is keyed by what was sent: the same run again asks nothing, a changed recipe asks for that line only.
  await main([], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} });
  assert.equal(calls.length, HARD.length);
  const lexicon = fixtureLexicon();
  lexicon.words.kambedla.chosen = 'samhengi-42';
  fs.writeFileSync(path.join(root, 'remake/assets/audio/pronunciation.json'), JSON.stringify(lexicon));
  await main([], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} });
  assert.deepEqual(calls.slice(HARD.length).map(call => [call.body.text, call.body.seed]), [['Kambeðla! Halló!', 42]]);
});

test("a line's own say and context are sent in place of the lexicon's, and a kept line that says a hard word is still never asked for", needsFfmpeg, async t => {
  const lines = [
    { id: 'k1_mosi_one', speaker: 'mosi', text: 'Eitt!', say: 'Eytt!', context: 'Teljum!' },
    { id: 'k1_mosi_greet', speaker: 'mosi', text: 'Kambeðla! Halló!', kept: "the owner's pick" },
  ];
  const root = makeRoot(t, { lines, lexicon: fixtureLexicon() });
  fs.writeFileSync(path.join(root, 'remake/assets/audio/kafli1/k1_mosi_greet.mp3'), fakeSpeech());
  const { fetch, calls } = fakeApi();
  await main([], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} });
  assert.deepEqual(calls.map(call => [call.body.text, call.body.previous_text, call.body.seed]), [['Eytt!', 'Teljum!', 42]], 'the kept line is not asked for');
  assert.ok(fs.readFileSync(path.join(root, 'remake/assets/audio/kafli1/k1_mosi_greet.mp3')).equals(fakeSpeech()));
});

test('without the lexicon the tool sends nothing', async t => {
  const root = makeRoot(t, { lexicon: null });
  const { fetch, calls } = fakeApi();
  await assert.rejects(main(['--only', 'k1_mosi_waving'], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} }), /pronunciation\.json is missing.*No request was made/);
  await assert.rejects(main(['--dry'], { env: {}, root, fetch, log() {} }), /pronunciation\.json is missing/);
  assert.equal(calls.length, 0);
});

test('--dry prints, per line, the text that would be sent, its context and seed, and whether a word is unchosen, without a key, a request or a file', async t => {
  const root = makeRoot(t, { lines: [...HARD, { id: 'k1_mosi_next', speaker: 'mosi', text: 'Ein komin.', kept: "the owner's pick" }], lexicon: fixtureLexicon() });
  const before = filesUnder(root);
  const { fetch, calls } = fakeApi();
  const out = [];
  await main(['--dry'], { env: {}, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  assert.equal(calls.length, 0, 'not one request');
  assert.deepEqual(filesUnder(root), before, 'not one file');
  const text = out.join('\n');
  assert.match(out[0], /^kafli1: 6 lines, 3 sent with a recipe, 1 with a word not chosen yet, 1 kept, 5 to ask$/);
  assert.ok(text.includes('  k1_mosi_greet: "Kambeðla! Halló!"  seed 1  [kambedla: samhengi]  to ask'), text);
  assert.ok(text.includes(`      context (not spoken): ${JSON.stringify(VISIT)}`));
  assert.ok(text.includes('  k1_mosi_one: "Eiht!"  seed 42  [eitt: stafsetning]  to ask'));
  assert.ok(text.includes('  k1_egill_wow: "Áfram, Egill!"  [egill: unchosen, sent as written]  to ask'));
  assert.ok(text.includes('  k1_mosi_two: "Tvö!"  to ask'));
  assert.ok(text.includes("  k1_mosi_next: kept, never sent (the owner's pick)"));
  out.length = 0;
  await main(['--dry', '--only', 'k1_mosi_two'], { env: {}, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  assert.deepEqual(out, ['kafli1: 1 lines, 0 sent with a recipe, 0 with a word not chosen yet, 0 kept, 1 to ask', '  k1_mosi_two: "Tvö!"  to ask']);
  out.length = 0;
  await main(['--dry', '--set', 'all'], { env: {}, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  assert.ok(out.some(line => line.startsWith('yatzy-junior: ')) && out.some(line => line.startsWith('  yatzyRoll: "Eiht markmið eftir. Kastaðu!"')), 'and Litla Yatzy with all');
  assert.equal(calls.length, 0);
});

test('parseArgs takes the lexicon commands, and refuses them together or with what they do not use', () => {
  assert.deepEqual(parseArgs(['--dry']), { only: null, audition: null, set: 'kafli1', dry: true });
  assert.deepEqual(parseArgs(['--dry', '--set', 'all']), { only: null, audition: null, set: 'all', dry: true });
  assert.deepEqual(parseArgs(['--dry', '--set', 'yatzy-junior', '--only', 'yatzyRoll']), { only: ['yatzyRoll'], audition: null, set: 'yatzy-junior', dry: true });
  assert.deepEqual(parseArgs(['--book', 'all']), { only: null, audition: null, set: 'kafli1', book: 'all' });
  assert.deepEqual(parseArgs(['--book', 'egill', '--dry']), { only: null, audition: null, set: 'kafli1', book: 'egill', dry: true });
  assert.deepEqual(parseArgs(['--pick', 'picks.json']), { only: null, audition: null, set: 'kafli1', pick: 'picks.json' });
  assert.deepEqual(parseArgs(['--plan']), { only: null, audition: null, set: 'kafli1', plan: true });
  assert.deepEqual(parseArgs(['--ab', 'eitt']), { only: null, audition: null, set: 'kafli1', ab: 'eitt' });
  assert.deepEqual(parseArgs(['--ab', 'yatzy-junior', '--only', 'yatzyRoll']), { only: ['yatzyRoll'], audition: null, set: 'kafli1', ab: 'yatzy-junior' });
  assert.deepEqual(parseArgs(['--remake-kept', 'eitt']), { only: null, audition: null, set: 'kafli1', remakeKept: 'eitt' });
  assert.deepEqual(parseArgs(['--remake-kept', 'book', '--only', 'book_mosi_4']), { only: ['book_mosi_4'], audition: null, set: 'kafli1', remakeKept: 'book' });
  assert.deepEqual(parseArgs(['--ab-apply', 'eitt', 'ab-eitt.json']), { only: null, audition: null, set: 'kafli1', abApply: { set: 'eitt', file: 'ab-eitt.json' } });
  for (const argv of [['--remake-kept'], ['--remake-kept', 'yatzy-junior'], ['--ab-apply', 'eitt'], ['--ab-apply', 'kafli3', 'x.json'], ['--remake-kept', 'eitt', '--dry'],
    ['--ab-apply', 'eitt', 'x.json', '--only', 'a'], ['--remake-kept', 'eitt', '--ab', 'eitt'], ['--ab-apply', 'eitt', 'x.json', '--set', 'eitt']]) {
    assert.throws(() => parseArgs(argv), Error, argv.join(' '));
  }
  assert.throws(() => parseArgs(['--remake-kept', 'eitt', '--plan']), /--plan and --remake-kept do not go together/);
  for (const argv of [['--set', 'all'], ['--set', 'yatzy-junior'], ['--book'], ['--book', '--dry'], ['--pick'], ['--ab'], ['--ab', 'kafli3'], ['--plan', '--book', 'all'],
    ['--plan', '--dry'], ['--pick', 'p.json', '--dry'], ['--audition', 'egill', '--dry'], ['--book', 'all', '--set', 'book'], ['--plan', '--only', 'x'], ['--ab', 'book', '--set', 'book']]) {
    assert.throws(() => parseArgs(argv), Error, argv.join(' '));
  }
});

// ---------------------------------------------------------------------------------------------
// The pronunciation book and the owner's picks

const BOOK_LEXICON = fixtureWords('kambedla', 'egill');
const BOOK_SOURCE = [
  { id: 'k1_mosi_greet', speaker: 'mosi', text: 'Kambeðla! Halló!' },
  { id: 'k1_mosi_long', speaker: 'mosi', text: 'Kambeðla er vinkona mín og plöturnar hennar lýsa.' },
  { id: 'k1_egill_name', speaker: 'egill', text: 'Ég heiti Egill!' },
  { id: 'k1_mosi_go', speaker: 'mosi', text: 'Áfram, Egill!' },
];

test('--book renders an audition per word, speaker and recipe into qa/remake/voices/framburdarbok/<word>/<speaker>-<recipe>.mp3, mastered, with its page; the take heard is the take the line is then made from', needsFfmpeg, async t => {
  const root = makeRoot(t, { lines: BOOK_SOURCE, lexicon: BOOK_LEXICON });
  const { fetch, calls } = fakeApi();
  const env = { ELEVENLABS_API_KEY: KEY };
  const out = [];
  await main(['--book', 'all'], { env, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  const folder = path.join(root, 'qa/remake/voices/framburdarbok');
  const expected = [
    ...['hratt', 'samhengi', 'samhengi-42'].map(recipe => `kambedla/mosi-${recipe}.mp3`),
    ...['mosi', 'egill'].flatMap(speaker => ['hratt', 'ipa', 'stafsetning', 'samhengi'].map(recipe => `egill/${speaker}-${recipe}.mp3`)),
  ];
  assert.deepEqual(filesUnder(folder), [...expected, 'book.json', 'index.html'].sort());
  assert.equal(calls.length, expected.length, 'one request per audition');
  for (const name of expected) {
    const length = seconds(path.join(folder, name));
    assert.ok(length > 1.4 && length < 2.2, `${name}: mastered like the lines, the voice and a quarter second, ${length}`);
  }
  const bodies = calls.map(call => call.body);
  assert.ok(bodies.some(body => body.text === 'Kambeðla! Halló!' && body.previous_text === VISIT && body.seed === 1), "the shortest of Mosi's Kambeðla lines, with the context");
  assert.ok(bodies.some(body => body.text === 'Ég heiti "/ˈeiːjɪtl̥/"!' && body.previous_text === undefined), "Egill's IPA in Egill's line");
  assert.ok(calls.some(call => call.url.includes(`/${VOICES.egill}?`) && call.body.text === 'Ég heiti Eijitl!'), "in Egill's voice");
  const page = fs.readFileSync(path.join(folder, 'index.html'), 'utf8');
  for (const name of expected) {
    const [word, file] = name.split('/');
    const [speaker, ...recipe] = file.slice(0, -4).split('-');
    assert.ok(page.includes(`data-row="${word}|${speaker}|${recipe.join('-')}"`) && page.includes(`src="${name}"`), `${name} is on the page`);
  }
  assert.ok(out.some(line => line.includes('framburdarbok')), JSON.stringify(out.slice(-2)));
  assert.equal(fs.readFileSync(path.join(root, 'remake/assets/audio/kafli1/lines-source.json'), 'utf8'), JSON.stringify(BOOK_SOURCE), 'the lines are untouched');

  // The line the book read with the chosen recipe, and the raw Egill lines (not chosen yet), cost nothing when they are made.
  await main([], { env, root, fetch, log() {} });
  assert.deepEqual(calls.slice(expected.length).map(call => call.body.text), ['Kambeðla er vinkona mín og plöturnar hennar lýsa.'], 'only the line the book did not read');
  // --book --dry lists what it would send and asks nothing; one word at a time works too.
  const dryOut = [];
  await main(['--book', 'Egill', '--dry'], { env: {}, root, fetch, log: (...parts) => dryOut.push(parts.join(' ')) });
  assert.equal(calls.length, expected.length + 1);
  assert.equal(dryOut.at(-1), '8 auditions of 1 words; 0 to ask (0 characters), the rest cached.');
});

test("--pick writes the owner's picks into the lexicon's chosen, and nothing else; a pick that is not a recipe or a word writes nothing", async t => {
  const root = makeRoot(t, { lexicon: null });
  const lexiconFile = path.join(root, 'remake/assets/audio/pronunciation.json');
  const fixture = `${JSON.stringify(fixtureLexicon(), null, 2)}\n`; // written as --pick writes it
  fs.writeFileSync(lexiconFile, fixture);
  const picks = path.join(root, 'picks.json');
  const { fetch, calls } = fakeApi();
  const out = [];
  fs.writeFileSync(picks, JSON.stringify({ egill: 'ipa', 'Þórseðla': 'samhengi', kambedla: 'samhengi', oglir: null }));
  await main(['--pick', picks], { env: {}, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  const after = JSON.parse(fs.readFileSync(lexiconFile, 'utf8'));
  assert.equal(after.words.egill.chosen, 'ipa');
  assert.equal(after.words.thorsedla.chosen, 'samhengi', 'by its name as well as its id');
  assert.equal(after.words.kambedla.chosen, 'samhengi');
  assert.equal(after.words.oglir.chosen, null);
  const expected = fixtureLexicon();
  expected.words.egill.chosen = 'ipa';
  expected.words.thorsedla.chosen = 'samhengi';
  expected.words.oglir.chosen = null;
  assert.equal(fs.readFileSync(lexiconFile, 'utf8'), `${JSON.stringify(expected, null, 2)}\n`, 'the file keeps its form: only the picks changed');
  assert.ok(out.includes('egill: not chosen -> ipa') && out.includes('kambedla: samhengi, as it was') && out.includes('oglir: samhengi -> not chosen'), JSON.stringify(out));
  for (const wrong of [{ egill: 'nope' }, { mosi: 'ipa' }, { egill: 'ipa', thorsedla: 'stafsetning' }]) {
    const before = fs.readFileSync(lexiconFile, 'utf8');
    fs.writeFileSync(picks, JSON.stringify(wrong));
    await assert.rejects(main(['--pick', picks], { env: {}, root, fetch, log() {} }), /not a recipe|not a word/, JSON.stringify(wrong));
    assert.equal(fs.readFileSync(lexiconFile, 'utf8'), before, 'nothing written');
  }
  assert.equal(calls.length, 0);
});

test("takes are shared with the repo's other checkouts only from the real repo: a test's root sees no cache but its own", t => {
  assert.deepEqual(siblingCaches(makeRoot(t)), []);
  const own = path.join(REAL.repo, '.tools/elevenlabs-remake');
  for (const dir of siblingCaches(REAL.repo)) {
    assert.notEqual(path.resolve(dir), path.resolve(own));
    assert.equal(path.dirname(path.dirname(path.dirname(dir))), path.dirname(REAL.repo), `${dir} is a checkout beside this one`);
  }
});

// ---------------------------------------------------------------------------------------------
// The record, the plan and the A/B pages

const tones = new Map();
/** A take of its own: a tone at `freq` Hz for `seconds`, as ElevenLabs's raw answers come (128 kbps). */
function tone(freq, seconds = 1.4) {
  const name = `${freq}/${seconds}`;
  if (!tones.has(name)) {
    tones.set(name, execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`, '-af', 'tremolo=f=3:d=0.9',
      '-ar', '44100', '-ac', '1', '-b:a', '128k', '-f', 'mp3', '-'], { maxBuffer: 1 << 24 }));
  }
  return tones.get(name);
}
const masteredTakes = new Map();
/** A raw take mastered as the tool masters it (the same filter and encoder): its length is the take's plus a quarter second. */
function mastered(raw) {
  const name = createHash('sha256').update(raw).digest('hex');
  if (!masteredTakes.has(name)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mastered-'));
    fs.writeFileSync(path.join(dir, 'raw.mp3'), raw);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, 'raw.mp3'), '-map_metadata', '-1', '-af', 'loudnorm=I=-18:TP=-2:LRA=7,apad=pad_dur=0.25', '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', path.join(dir, 'out.mp3')]);
    masteredTakes.set(name, fs.readFileSync(path.join(dir, 'out.mp3')));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return masteredTakes.get(name);
}
const recordOf = root => readJson(path.join(root, 'remake/assets/audio/voices-made.json')).lines;

/** A chapter whose lines were made in every way the plan must tell apart, with the raw takes in the cache as the old tools left them (a 330 Hz voice: the fake ElevenLabs answers at 220 Hz). */
function planRoot(t) {
  const lines = [
    { id: 'k1_mosi_old', speaker: 'mosi', text: 'Halló!' }, // an eleven_v3 take
    { id: 'k1_mosi_new', speaker: 'mosi', text: 'Tvö!' }, // an eleven_v4 take, as it should be
    { id: 'k1_mosi_greet', speaker: 'mosi', text: 'Kambeðla! Halló!' }, // v4, but Kambeðla's recipe is chosen since
    { id: 'k1_egill_go', speaker: 'egill', text: 'Áfram, Egill!' }, // v4, Egill not picked yet
    { id: 'k1_mosi_lost', speaker: 'mosi', text: 'Þrjú!' }, // no cached take anywhere: chapter 1 was v3 before 2026-10-18
    { id: 'k1_mosi_missing', speaker: 'mosi', text: 'Fjögur!' }, // never made
    { id: 'k1_mosi_worry', speaker: 'mosi', text: 'Egill er bestur!', kept: 'the owner\'s reference take, the Eleven v3 take (seed 1)' },
  ];
  const root = makeRoot(t, { lines, lexicon: BOOK_LEXICON });
  const cache = path.join(root, '.tools/elevenlabs-remake');
  fs.mkdirSync(cache, { recursive: true });
  const raw = (line, model) => fs.writeFileSync(path.join(cache, `${cacheKey({ text: line.text, voiceId: VOICES[line.speaker], model })}.mp3`), tone(330));
  raw(lines[0], 'eleven_v3');
  for (const line of lines.slice(1, 4)) raw(line, MODEL);
  for (const line of [...lines.slice(0, 5), lines[6]]) fs.writeFileSync(path.join(root, `remake/assets/audio/kafli1/${line.id}.mp3`), mastered(tone(330)));
  return root;
}

test('madeFrom keeps a cached take only when its length is the MP3\'s, also when it is the only one cached', needsFfmpeg, t => {
  const root = makeRoot(t);
  const cache = path.join(root, 'cache');
  fs.mkdirSync(cache);
  fs.writeFileSync(path.join(cache, 'a.mp3'), tone(330));
  fs.writeFileSync(path.join(cache, 'b.mp3'), tone(330, 2.4));
  const mp3 = path.join(root, 'line.mp3');
  fs.writeFileSync(mp3, mastered(tone(330)));
  assert.equal(madeFrom(mp3, ['a'], [cache]), 'a', 'the one cached take, of the right length');
  assert.equal(madeFrom(mp3, ['b'], [cache]), null, 'the one cached take, a second longer: not this MP3\'s');
  assert.equal(madeFrom(mp3, ['b', 'a'], [cache]), 'a', 'the one that fits');
  assert.equal(madeFrom(mp3, ['c'], [cache]), null, 'none cached');
});

test('--plan lists, per set, the lines whose MP3 is an eleven_v3 take or not of the request the lexicon makes now, the stale entries, and the --only to run; nothing is asked for or written', needsFfmpeg, async t => {
  const root = planRoot(t);
  const plan = regenerationPlan(root, { junior: {} }).kafli1;
  assert.deepEqual(plan.make.map(item => [item.id, item.reasons]), [
    ['k1_mosi_old', ['an eleven_v3 take']],
    ['k1_mosi_greet', ['the lexicon changes its request (kambedla: samhengi)']],
    ['k1_mosi_lost', ['no record and no cached take: eleven_v3, made before the switch to v4 on 2026-10-18']],
    ['k1_mosi_missing', ['no MP3 yet']],
  ]);
  assert.deepEqual(plan.unknown, [], 'chapter 1 has no unknown: its lines without a take are v3 by date');
  assert.deepEqual(plan.waiting, [{ id: 'k1_egill_go', words: ['egill'] }], 'a line whose only hard word is not picked waits: it would be sent as it was');
  assert.deepEqual(plan.kept.map(item => [item.id, item.why]), [['k1_mosi_worry', 'a kept eleven_v3 take']]);
  assert.equal(plan.current, 1, 'k1_mosi_new is as it should be');
  assert.deepEqual(plan.stale.map(item => [item.id, item.why]), ['k1_mosi_old', 'k1_mosi_new', 'k1_mosi_greet', 'k1_egill_go', 'k1_mosi_lost', 'k1_mosi_worry'].map(id => [id, 'no entry']), 'MP3s lines.json does not know');
  assert.equal(plan.make.find(item => item.id === 'k1_mosi_greet').sent.context, VISIT);

  const before = filesUnder(root);
  const { fetch, calls } = fakeApi();
  const out = [];
  await main(['--plan'], { env: {}, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  assert.equal(calls.length, 0);
  assert.deepEqual(filesUnder(root), before, 'nothing written');
  assert.ok(out.includes('kafli1: 4 to make, 0 unknown, 1 waiting for a pick, 1 kept to know about, 6 stale entries, 1 as they should be'), out.join('\n'));
  assert.ok(out.includes('  node remake/tools/voice-lines.mjs --ab kafli1'));
  assert.ok(out.includes('  node remake/tools/voice-lines.mjs --set kafli1 --only k1_mosi_old,k1_mosi_greet,k1_mosi_lost,k1_mosi_missing'));
  assert.ok(out.includes('  kept, never made again: k1_mosi_worry (a kept eleven_v3 take)'));
  assert.ok(out.includes('  stale entry: k1_mosi_new (no entry): node remake/tools/audio-lines.mjs'));
});

test('outside chapter 1, a line that neither the record nor a cached take of its length accounts for is unknown: listed to listen to, never in an --only', needsFfmpeg, async t => {
  const root = makeRoot(t, { lines: [], book: [{ id: 'book_find_me', speaker: 'narrator', text: 'Finndu mig í skóginum!' }], voices: { ...VOICES, narrator: 'NarratorVoice0000004' } });
  fs.writeFileSync(path.join(root, 'remake/assets/audio/book/book_find_me.mp3'), mastered(tone(330)));
  const cache = path.join(root, '.tools/elevenlabs-remake');
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, `${cacheKey({ text: 'Finndu mig í skóginum!', voiceId: 'NarratorVoice0000004', model: 'eleven_v3' })}.mp3`), tone(330, 2.4)); // a v3 take of the line, but not this MP3
  const plan = regenerationPlan(root, { junior: {} }).book;
  assert.deepEqual(plan.make, []);
  assert.deepEqual(plan.unknown, [{ id: 'book_find_me', why: 'no record, and no cached take matches its length' }]);
  const out = [];
  await main(['--plan'], { env: {}, root, fetch: fakeApi().fetch, log: (...parts) => out.push(parts.join(' ')) });
  assert.ok(out.includes('  unknown, listen before making it again: book_find_me (no record, and no cached take matches its length)'), out.join('\n'));
  assert.ok(!out.some(line => line.includes('--set book --only')), 'not made blindly');
});

test('the tool records which request made each MP3 in remake/assets/audio/voices-made.json, and --plan reads it there: with no cache at all, nothing to make', needsFfmpeg, async t => {
  const lines = [{ id: 'k1_mosi_greet', speaker: 'mosi', text: 'Kambeðla! Halló!' }, { id: 'k1_mosi_two', speaker: 'mosi', text: 'Tvö!' }];
  const root = makeRoot(t, { lines, lexicon: BOOK_LEXICON });
  await main([], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch: fakeApi().fetch, log() {} });
  const record = recordOf(root);
  const mp3 = id => path.join(root, `remake/assets/audio/kafli1/${id}.mp3`);
  assert.deepEqual(Object.keys(record), ['kafli1/k1_mosi_greet', 'kafli1/k1_mosi_two'], 'keys sorted');
  assert.deepEqual(record['kafli1/k1_mosi_greet'], {
    key: cacheKey({ text: 'Kambeðla! Halló!', voiceId: VOICES.mosi, seed: 1, context: VISIT }),
    mp3: createHash('sha256').update(fs.readFileSync(mp3('k1_mosi_greet'))).digest('hex'),
    duration: readJson(path.join(root, 'remake/assets/audio/lines.json')).k1_mosi_greet.duration,
    model: MODEL,
  });
  assert.ok(!JSON.stringify(readJson(path.join(root, 'remake/assets/audio/voices-made.json'))).includes(KEY), 'hashes and lengths only');
  fs.rmSync(path.join(root, '.tools'), { recursive: true, force: true }); // a fresh checkout: no cache, no local record
  const plan = regenerationPlan(root, { junior: {} }).kafli1;
  assert.deepEqual([plan.make, plan.unknown, plan.stale, plan.current], [[], [], [], 2]);
});

test("the committed record accounts for every MP3 in the repo: --plan with an empty .tools/ lists nothing to make, nothing unknown and no stale entry", needsFfmpeg, () => {
  const plan = regenerationPlan(REAL.repo, { caches: [] });
  for (const [set, found] of Object.entries(plan)) {
    const hint = 'run node remake/tools/voice-lines.mjs --plan and make these lines again (or node remake/tools/audio-lines.mjs for stale entries)';
    assert.deepEqual(found.make.map(item => `${item.id}: ${item.reasons.join('; ')}`), [], `${set}: ${hint}`);
    assert.deepEqual(found.unknown.map(item => item.id), [], `${set}: ${hint}`);
    assert.deepEqual(found.stale.map(item => item.id), [], `${set}: ${hint}`);
    assert.ok(found.current > 0, `${set}: lines as they should be`);
  }
});

test('a run that stops half-way leaves lines.json and the record with the lines it made', needsFfmpeg, async t => {
  const lines = [{ id: 'k1_mosi_one', speaker: 'mosi', text: 'Tvö!' }, { id: 'k1_mosi_two', speaker: 'mosi', text: 'Þrjú!' }];
  const root = makeRoot(t, { lines });
  let asked = 0;
  const { fetch } = fakeApi(() => (++asked === 1 ? new Response(fakeSpeech(), { status: 200, headers: { 'content-type': 'audio/mpeg' } }) : new Response('{"detail":"busy"}', { status: 500 })));
  await assert.rejects(main([], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} }), /500/);
  const recorded = readJson(path.join(root, 'remake/assets/audio/lines.json'));
  assert.deepEqual(Object.keys(recorded), ['welcome', 'k1_mosi_one'], 'the line made before the failure has its entry');
  assert.deepEqual(Object.keys(recordOf(root)), ['kafli1/k1_mosi_one']);
});

test('--ab snapshots the old takes before they are made again into a round of their own, never over a round, and its page puts each old take beside the new', needsFfmpeg, async t => {
  const root = planRoot(t);
  const env = { ELEVENLABS_API_KEY: KEY };
  const { fetch, calls } = fakeApi();
  await main(['--ab', 'kafli1'], { env: {}, root, fetch, log() {} });
  const ab = path.join(root, 'qa/remake/voices/ab/kafli1');
  assert.deepEqual(filesUnder(ab), ['old-1/k1_mosi_greet.mp3', 'old-1/k1_mosi_lost.mp3', 'old-1/k1_mosi_old.mp3'], "round 1: the plan's lines that have an MP3");
  assert.equal(calls.length, 0, '--ab asks nothing');
  const ids = ['k1_mosi_old', 'k1_mosi_greet', 'k1_mosi_lost', 'k1_mosi_missing'];
  await main(['--set', 'kafli1', '--only', ids.join(',')], { env, root, fetch, log() {} });
  assert.equal(calls.length, 4);
  assert.ok(!fs.readFileSync(path.join(root, 'remake/assets/audio/kafli1/k1_mosi_old.mp3')).equals(mastered(tone(330))), 'made again');
  assert.ok(fs.readFileSync(path.join(ab, 'old-1/k1_mosi_old.mp3')).equals(mastered(tone(330))), 'the old take kept for the page');

  // Made with the lexicon, the lines are as they should be; --ab again copies nothing and still shows round 1.
  const plan = regenerationPlan(root, { junior: {} }).kafli1;
  assert.deepEqual(plan.make, [], 'the tool recorded which request made each MP3');
  assert.equal(plan.current, 5);
  const out = [];
  await main(['--ab', 'kafli1'], { env: {}, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  assert.match(out[0], /^nothing new to copy \(round 1 stands\)/);
  let page = fs.readFileSync(path.join(root, 'qa/remake/voices/ab/kafli1.html'), 'utf8');
  for (const id of ['k1_mosi_old', 'k1_mosi_greet', 'k1_mosi_lost']) {
    assert.ok(page.includes(`src="kafli1/old-1/${id}.mp3"`) && page.includes(`src="../../../../remake/assets/audio/kafli1/${id}.mp3"`), `${id}: old and new`);
  }
  assert.ok(page.includes('samhengi (ekki talað): Fyrst heimsækjum'), 'what the new take was sent with');
  assert.match(page, /umferð 1/);
  assert.match(page, /id="save">Vista val</);

  // A changed recipe puts Kambeðla's line in the plan again: its take now is not round 1's copy, so --ab opens round 2 for it.
  const lexicon = structuredClone(BOOK_LEXICON);
  lexicon.words.kambedla.chosen = 'samhengi-42';
  fs.writeFileSync(path.join(root, 'remake/assets/audio/pronunciation.json'), JSON.stringify(lexicon));
  await main(['--ab', 'kafli1'], { env: {}, root, fetch, log() {} });
  assert.deepEqual(filesUnder(path.join(ab, 'old-2')), ['k1_mosi_greet.mp3']);
  assert.ok(fs.readFileSync(path.join(ab, 'old-2/k1_mosi_greet.mp3')).equals(fs.readFileSync(path.join(root, 'remake/assets/audio/kafli1/k1_mosi_greet.mp3'))), 'the take round 2 replaces');
  page = fs.readFileSync(path.join(root, 'qa/remake/voices/ab/kafli1.html'), 'utf8');
  assert.ok(page.includes('src="kafli1/old-2/k1_mosi_greet.mp3"') && !page.includes('old-1/k1_mosi_old'), 'the page shows the round being replaced');
  assert.match(page, /Fyrri umferðir: umferð 1/);
  // --only names the lines itself; a changed MP3 puts a line back in the plan.
  await assert.rejects(main(['--ab', 'kafli1', '--only', 'k1_nope'], { env: {}, root, fetch, log() {} }), /k1_nope/);
  fs.writeFileSync(path.join(root, 'remake/assets/audio/kafli1/k1_mosi_old.mp3'), fakeSpeech());
  assert.deepEqual(regenerationPlan(root, { junior: {} }).kafli1.make.map(item => [item.id, item.reasons]), [
    ['k1_mosi_old', ['its MP3 was changed after the tool made it']],
    ['k1_mosi_greet', ['the lexicon changed its request (kambedla: samhengi-42)']],
  ]);
});

test('--remake-kept makes the takes of kept lines under a new rule beside the game, never in it; --ab-apply installs those the owner did not mark old', needsFfmpeg, async t => {
  const lines = [
    { id: 'k1_mosi_greet', speaker: 'mosi', text: 'Kambeðla! Halló!', kept: "the owner's pick, an Eleven v4 take with the visit line as context (seed 42)" },
    { id: 'k1_mosi_one', speaker: 'mosi', text: 'Eitt!', kept: "the owner's pick, from the spelling Eiht (seed 42)" },
    { id: 'k1_mosi_two', speaker: 'mosi', text: 'Tvö!', kept: "the owner's pick" }, // no hard word: stays as it is
    { id: 'k1_egill_go', speaker: 'egill', text: 'Áfram, Egill!', kept: "the owner's pick" }, // Egill has no rule chosen: stays
    { id: 'k1_mosi_three', speaker: 'mosi', text: 'Þrjú!' },
  ];
  const root = makeRoot(t, { lines, lexicon: fixtureLexicon() });
  const shipped = id => path.join(root, `remake/assets/audio/kafli1/${id}.mp3`);
  for (const line of lines.slice(0, 4)) fs.writeFileSync(shipped(line.id), mastered(tone(330)));
  const source = path.join(root, 'remake/assets/audio/kafli1/lines-source.json');
  const sourceBefore = fs.readFileSync(source, 'utf8');
  const linesJsonBefore = fs.readFileSync(path.join(root, 'remake/assets/audio/lines.json'), 'utf8');
  const { fetch, calls } = fakeApi();
  const out = [];
  await main(['--remake-kept', 'kafli1'], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  assert.deepEqual(calls.map(call => [call.body.text, call.body.previous_text, call.body.seed]), [['Kambeðla! Halló!', VISIT, 1], ['Eiht!', undefined, 42]], 'the request each would send if it were not kept');
  const keptNew = path.join(root, 'qa/remake/voices/ab/kafli1/kept-new');
  assert.deepEqual(filesUnder(keptNew), ['k1_mosi_greet.mp3', 'k1_mosi_one.mp3', 'made.json']);
  for (const line of lines.slice(0, 4)) assert.ok(fs.readFileSync(shipped(line.id)).equals(mastered(tone(330))), `${line.id}: the game's take is untouched`);
  assert.equal(fs.readFileSync(source, 'utf8'), sourceBefore, 'lines-source.json untouched');
  assert.equal(fs.readFileSync(path.join(root, 'remake/assets/audio/lines.json'), 'utf8'), linesJsonBefore, 'lines.json untouched');
  assert.ok(!fs.existsSync(path.join(root, 'remake/assets/audio/voices-made.json')), 'nothing recorded');
  let page = fs.readFileSync(path.join(root, 'qa/remake/voices/ab/kafli1.html'), 'utf8');
  for (const line of lines.slice(0, 2)) {
    assert.ok(page.includes(`data-id="${line.id}" data-kind="kept"`), `${line.id} is a kept row`);
    assert.ok(page.includes(`src="../../../../remake/assets/audio/kafli1/${line.id}.mp3"`) && page.includes(`src="kafli1/kept-new/${line.id}.mp3"`), `${line.id}: the shipped take beside the new`);
    assert.ok(page.includes(line.kept.replaceAll("'", '&#39;')), `${line.id}: its kept note`);
  }
  assert.ok(!page.includes('data-id="k1_mosi_two"') && !page.includes('data-id="k1_egill_go"'));
  assert.ok(out.at(-1).includes('--ab-apply kafli1 ab-kafli1.json'));

  // The owner keeps the old "Eitt!" and leaves Kambeðla's line unmarked: that one goes in.
  const choices = path.join(root, 'ab-kafli1.json');
  const before = filesUnder(root);
  for (const wrong of [{ set: 'book', choices: {} }, { choices: {} }]) {
    fs.writeFileSync(choices, JSON.stringify(wrong));
    await assert.rejects(main(['--ab-apply', 'kafli1', choices], { env: {}, root, fetch, log() {} }), /Nothing was changed/);
  }
  fs.writeFileSync(path.join(keptNew, 'k1_mosi_greet.mp3'), fakeSpeech()); // a take swapped by hand is refused
  fs.writeFileSync(choices, JSON.stringify({ set: 'kafli1', choices: { k1_mosi_one: 'gamla' } }));
  await assert.rejects(main(['--ab-apply', 'kafli1', choices], { env: {}, root, fetch, log() {} }), /not the take --remake-kept made.*Nothing was changed/);
  assert.deepEqual(filesUnder(root).filter(name => !name.endsWith('ab-kafli1.json')), before.filter(name => !name.endsWith('ab-kafli1.json')));
  await main(['--remake-kept', 'kafli1', '--only', 'k1_mosi_greet'], { env: { ELEVENLABS_API_KEY: KEY }, root, fetch, log() {} });
  assert.equal(calls.length, 2, 'made again from the cache');

  const applied = [];
  await main(['--ab-apply', 'kafli1', choices], { env: {}, root, fetch, log: (...parts) => applied.push(parts.join(' ')) });
  assert.equal(calls.length, 2, '--ab-apply asks nothing');
  assert.ok(fs.readFileSync(shipped('k1_mosi_greet')).equals(fs.readFileSync(path.join(keptNew, 'k1_mosi_greet.mp3'))), 'the new take is in the game');
  assert.ok(fs.readFileSync(shipped('k1_mosi_one')).equals(mastered(tone(330))), 'the take marked old stays');
  const after = readJson(source);
  assert.deepEqual(after, [{ id: 'k1_mosi_greet', speaker: 'mosi', text: 'Kambeðla! Halló!' }, ...lines.slice(1)], 'only the installed line loses its kept');
  assert.equal(fs.readFileSync(source, 'utf8'), `[\n${after.map(line => ` ${JSON.stringify(line).replace(/^\{/, '{ ').replace(/\}$/, ' }').replace(/","/g, '", "').replace(/":"/g, '": "')}`).join(',\n')}\n]\n`, 'in the form of the real files: one line per line');
  assert.deepEqual(recordOf(root)['kafli1/k1_mosi_greet'].key, cacheKey({ text: 'Kambeðla! Halló!', voiceId: VOICES.mosi, seed: 1, context: VISIT }), 'its request recorded');
  assert.ok(readJson(path.join(root, 'remake/assets/audio/lines.json')).k1_mosi_greet, 'lines.json knows it');
  assert.ok(applied[0].startsWith('1 new takes installed in remake/assets/audio/kafli1/ (no longer kept): k1_mosi_greet; 1 kept as they were: k1_mosi_one.'), applied.join('\n'));
  page = fs.readFileSync(path.join(root, 'qa/remake/voices/ab/kafli1.html'), 'utf8');
  assert.ok(!page.includes('data-kind="kept"'), 'the page no longer offers what was decided');
  assert.deepEqual(regenerationPlan(root, { junior: {} }).kafli1.make.map(item => item.id), ['k1_mosi_three'], 'the installed line is as it should be (only the line never made is to make)');
  await assert.rejects(main(['--ab-apply', 'kafli1', choices], { env: {}, root, fetch, log() {} }), /No new takes of kept lines wait/);
});

test('the book marks a row whose MP3 plays an older request than it would send now, and says which word to render again', needsFfmpeg, async t => {
  const lexicon = structuredClone(BOOK_LEXICON);
  lexicon.words.egill.audition = { mosi: 'Kambeðla og Egill!' }; // Egill's row for Mosi says Kambeðla too, with her chosen recipe
  const root = makeRoot(t, { lines: BOOK_SOURCE, lexicon });
  const env = { ELEVENLABS_API_KEY: KEY };
  const { fetch } = fakeApi();
  await main(['--book', 'all'], { env, root, fetch, log() {} });
  const book = path.join(root, 'qa/remake/voices/framburdarbok');
  assert.ok(readJson(path.join(book, 'book.json')).rows.every(row => row.rendered === row.key && !row.stale), 'all as rendered');
  lexicon.words.kambedla.chosen = 'samhengi-42';
  fs.writeFileSync(path.join(root, 'remake/assets/audio/pronunciation.json'), JSON.stringify(lexicon));
  const out = [];
  await main(['--book', 'all', '--dry'], { env: {}, root, fetch, log: (...parts) => out.push(parts.join(' ')) });
  assert.equal(out.at(-1), '1 word of the book play an older take than they would send now (another choice changed): node remake/tools/voice-lines.mjs --book egill');
  await main(['--book', 'kambedla'], { env, root, fetch, log() {} });
  const rows = readJson(path.join(book, 'book.json')).rows;
  assert.deepEqual([...new Set(rows.filter(row => row.stale).map(row => `${row.word}/${row.speaker}`))], ['egill/mosi'], "only the rows whose sentence says Kambeðla, in another word's section");
  const page = fs.readFileSync(path.join(book, 'index.html'), 'utf8');
  assert.equal((page.match(/class="row stale"/g) ?? []).length, 4, "Egill's four recipes for Mosi");
  assert.match(page, /Eldri taka/);
  await main(['--book', 'egill'], { env, root, fetch, log() {} });
  assert.ok(readJson(path.join(book, 'book.json')).rows.every(row => !row.stale), 'rendered again: none stale');
});
