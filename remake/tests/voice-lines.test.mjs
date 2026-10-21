import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MOUTH_RATE, REMAKE_AUDIO, SETS, buildLines, remakeLines, updateLines } from '../tools/audio-lines.mjs';
import { CANDIDATES, MODEL, SETTINGS, cacheKey, main, parseArgs, readLines } from '../tools/voice-lines.mjs';

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

/** A repo root of its own in the temp folder, with the lines to speak, the voices and the lines.json the game has; the book's lines (a set of their own) only when `book` gives them. */
function makeRoot(t, { lines = readJson(REAL.source), book = null, voices = VOICES } = {}) {
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
    assert.ok(Math.abs(recorded[line.id].duration - length) < 0.002, `${line.id}: lines.json says ${recorded[line.id].duration} s, the file is ${length} s: run node remake/tools/audio-lines.mjs (not voice-lines.mjs, which makes a line that is not "kept" over from its v3 take)`);
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
