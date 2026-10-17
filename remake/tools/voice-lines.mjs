#!/usr/bin/env node
// Voices the remake's chapters and book with ElevenLabs Eleven v3, the way scripts/generate-narration.mjs voices the game:
//   node remake/tools/voice-lines.mjs [--set book] [--only id,id]   make the lines of assets/audio/<set>/lines-source.json (all, or just these)
//   node remake/tools/voice-lines.mjs --audition kambedla    one sample line per candidate voice, in qa/remake/voices/, to choose from
//   node remake/tools/voice-lines.mjs --audition egill
//   node remake/tools/voice-lines.mjs --audition narrator
// (needs ffmpeg and ffprobe on the PATH, and ELEVENLABS_API_KEY in the environment)
//
// The lines come in sets (audio-lines.mjs SETS), each with a lines-source.json in a folder of its own: kafli1, the chapter's, which
// is made unless --set says otherwise, and book, the narrator's reading of the education cards. Everything below holds for the lines
// of either set, and --only names lines of the set that is made. A candidate for --audition speaks a line of the set it names (the
// narrator's is in book); --set may be given with --audition only to repeat that set.
//
// lines-source.json is a list of { "id": "k1_mosi_waving", "speaker": "mosi", "text": "..." } (and optional "seed", "kept", below): in
// kafli1 the id is k1_<speaker>_<short>, in book book_<card>_<page> or book_<what>. A line becomes <set>/<id>.mp3, mastered like the
// game's narration (mono, 44.1 kHz, 96 kbps, about -18 LUFS, a quarter second of silence after the voice), and lines.json learns its
// src, exact duration and mouth (audio-lines.mjs makes the same entries for the game's own lines). Lines are approved before they are
// made: voices.json names a voice for each speaker, null until the owner has chosen it (the narrator has no entry until then), and a
// speaker without a voice stops the run before any request.
//
// Eleven v3 gives another take every time it is asked, so what ElevenLabs answers is kept in .tools/elevenlabs-remake/, named by a
// hash of everything that decides the sound: the text, the voice, the model, the settings and the seed. A line costs credits once.
// For another take of a line, change its "seed" in lines-source.json. Lines that say the same thing (the three "Mmm!") have seeds of
// their own, or they would share one take.
//
// A line whose recording the owner chose by ear among takes made some other way has a "kept" in lines-source.json: one sentence that
// names the take, such as "the owner's pick, an Eleven v4 take (seed 2), 2026-10-16". The tool never asks for a kept line, masters it
// or writes over its MP3, also when --only names it; it says "Kept <id>: ..." and renews the line's entry in lines.json from the MP3
// that is there. A kept line needs no voice in voices.json, but its MP3 must be there: without it the tool stops before any
// request. To have the tool make a kept line again, take its "kept" away.
//
// The key is read from ELEVENLABS_API_KEY and from nowhere else. It goes into one request header; it is never printed, logged,
// written to a file or put in a URL, and without it the tool stops before it does anything.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETS, durationOf, setFolder, updateLines } from './audio-lines.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Where the lines to speak of a set (the chapter's unless told another) are written, relative to the repo root. */
const sourceOf = set => `${setFolder(set)}/lines-source.json`;
const VOICES = 'remake/assets/audio/voices.json';
const CACHE = '.tools/elevenlabs-remake';
const AUDITIONS = 'qa/remake/voices';

const API = 'https://api.elevenlabs.io/v1/text-to-speech';
const OUTPUT_FORMAT = 'mp3_44100_128';
const TIMEOUT = 120000; // ms for one request
export const MODEL = 'eleven_v3';
const LANGUAGE = 'is';
/** What scripts/narration-models.mjs gives a game clip that has no profile of its own, so every voice reads at the same pace and steadiness. */
export const SETTINGS = Object.freeze({ stability: 0.5, similarity_boost: 0.75, speed: 0.95 });
/** The game's mastering (scripts/generate-narration.mjs): about -18 LUFS, and a quarter second of quiet for the mouth to close in. */
const MASTER = 'loudnorm=I=-18:TP=-2:LRA=7,apad=pad_dur=0.25';

/**
 * The voices the owner chooses from. Each candidate speaks the character's real line (an id in lines-source.json, in the chapter's
 * set unless the entry names another with `set`), so the owner hears Icelandic from the voice that would speak it. Library voices
 * work by id without being added to the account. The narrator reads the book: a first page of the Kalligrammatid card, in the book set.
 */
export const CANDIDATES = {
  kambedla: {
    line: 'k1_kambedla_lost',
    voices: [
      { name: 'Ingibjorg - Calm, Warm Ad', id: 'EPNZHjyiFUvsaPPq9zRU', note: 'Icelandic voice from the shared library: mellow and calm, a relaxed pace' },
      { name: 'Katrin - Warm, Patient Friend', id: 'rx2Jwpr6lciMIbfYvpOA', note: 'Icelandic voice from the shared library: warm, relaxed and gentle' },
      { name: 'Sigrun - Calm, Direct Narrator', id: 'phADS9h1woMxkLioLz5z', note: 'Icelandic voice from the shared library: steady and warm, a lower pitch' },
      { name: 'Sanna Hartfield - Calm and Soothing', id: 'aSLKtNoVBZlxQEMsnGL2', note: 'Swedish narrator from the shared library: smooth and velvety' },
      { name: 'Lana Weiss - Soft and Sweet', id: 'rAmra0SCIYOxYmRNDSm3', note: 'German meditation voice from the shared library: soft, warm and curious' },
      { name: 'Lily - Velvety Actress', id: 'pFZP5JQG7iQjIQuC4Bku', note: 'British actress, velvety and warm: already in the account' },
    ],
  },
  egill: {
    line: 'k1_egill_wow',
    voices: [
      { name: 'Teddy Twinkle - Cute Cartoon', id: 'XjGYkUkzth8BPs29fmcV', note: 'A sweet, cheerful little cartoon boy (an English-language voice from the shared library)' },
      { name: 'Leo - Curious Character', id: 'ihKwLOjVUMG4lgUI6meZ', note: 'A childlike voice, bright and curious (a Spanish-language voice from the shared library)' },
      { name: 'Axel Jones - Cute little stuffed animal', id: '0bzVcjKKcXOd30njKFbJ', note: 'Soft and warm, childlike joy (a German-language voice from the shared library)' },
      { name: 'Bhola - Soft, Innocent and Cheerful', id: 'd7G4zsIoYxHBAwkKbqs5', note: 'A cheerful young learner, soft and innocent (a Hindi-language voice from the shared library)' },
      { name: 'Kavya - Cute & Engaging Character', id: 'bA58y3FqVI6b6gTNh0oT', note: 'Childlike wonder, wide-eyed (a Hindi-language voice from the shared library)' },
      { name: 'Bholu - Cute, Innocent Kids Character', id: '5krdMTA5HonvWAlY2vSx', note: 'Bubbly and wide-eyed, a little higher (a Hindi-language voice from the shared library)' },
    ],
  },
  narrator: {
    set: 'book',
    line: 'book_kalligrammatid_1',
    voices: [
      { name: 'Ingibjorg - Calm, Warm Ad', id: 'EPNZHjyiFUvsaPPq9zRU', note: 'Icelandic voice from the shared library: mellow and calm, a relaxed pace' },
      { name: 'Katrin - Warm, Patient Friend', id: 'rx2Jwpr6lciMIbfYvpOA', note: 'Icelandic voice from the shared library: warm, relaxed and gentle' },
      { name: 'Sigrun - Calm, Direct Narrator', id: 'phADS9h1woMxkLioLz5z', note: 'Icelandic voice from the shared library: steady and warm, a lower pitch' },
      { name: 'Bjorn - Calm, Serious Narrator', id: '6LR26ZnZ2USBpLHfBBH7', note: 'Icelandic voice from the shared library: low and deep, a measured pace' },
      { name: 'Baldur - Patient Support Agent', id: 'B4dcQDH3p7a2cAn9wzSc', note: 'Icelandic voice from the shared library: light and steady, clear and patient' },
    ],
  },
};

/** The set a candidate's sample line is in: the chapter's unless the entry names another. */
const setOf = character => CANDIDATES[character].set ?? 'kafli1';

// ---------------------------------------------------------------------------------------------
// What is asked for

/** Everything that decides how a take sounds, hashed: the same request never costs credits twice, and any change asks again. */
export function cacheKey({ text, voiceId, model = MODEL, settings = SETTINGS, seed }) {
  const decides = { text, voiceId, model, language: LANGUAGE, settings, ...(seed === undefined ? {} : { seed }) };
  return createHash('sha256').update(JSON.stringify(decides)).digest('hex');
}

/** The command line: { only, audition, set }. `set` is the line set that is made (the chapter's unless told another). */
export function parseArgs(argv) {
  const args = { only: null, audition: null, set: 'kafli1' };
  let named = false; // whether --set was given
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--only') {
      args.only = (argv[++i] ?? '').split(',').map(id => id.trim()).filter(Boolean);
      if (!args.only.length) throw new Error('--only needs line ids, separated by commas.');
    } else if (arg === '--audition') {
      args.audition = argv[++i];
      if (!Object.hasOwn(CANDIDATES, args.audition ?? '')) throw new Error(`--audition needs ${Object.keys(CANDIDATES).join(' or ')}.`);
    } else if (arg === '--set') {
      args.set = argv[++i];
      named = true;
      if (!Object.hasOwn(SETS, args.set ?? '')) throw new Error(`--set needs ${Object.keys(SETS).join(' or ')}.`);
    } else {
      throw new Error(`Unknown argument: ${arg}\nUsage: voice-lines.mjs [--set ${Object.keys(SETS).join('|')}] [--only id,id] | --audition ${Object.keys(CANDIDATES).join('|')}`);
    }
  }
  if (args.audition && args.only) throw new Error('--audition and --only do not go together.');
  if (args.audition && named && args.set !== setOf(args.audition)) throw new Error(`--audition ${args.audition} speaks a line of the ${setOf(args.audition)} set, so --set can only repeat that.`);
  return args;
}

/** The lines to speak of a set (the chapter's unless told another), checked before a credit is spent: ids become file names. */
export function readLines(root, set = 'kafli1') {
  const source = sourceOf(set);
  const lines = JSON.parse(fs.readFileSync(path.join(root, source), 'utf8'));
  if (!Array.isArray(lines)) throw new Error(`${source} must be a list of lines.`);
  const ids = new Set();
  for (const line of lines) {
    if (typeof line?.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(line.id)) throw new Error(`Not a line id: ${JSON.stringify(line?.id)} in ${source}.`);
    if (ids.has(line.id)) throw new Error(`${line.id} is in ${source} twice.`);
    ids.add(line.id);
    if (typeof line.speaker !== 'string' || typeof line.text !== 'string' || !line.text.trim()) throw new Error(`${line.id} needs a speaker and text.`);
    if (line.seed !== undefined && !(Number.isInteger(line.seed) && line.seed >= 0 && line.seed <= 4294967295)) throw new Error(`${line.id}: seed is a whole number from 0 to 4294967295.`);
    if (line.kept !== undefined && (typeof line.kept !== 'string' || !line.kept.trim())) throw new Error(`${line.id}: kept is a sentence that names the take.`);
  }
  return lines;
}

function readVoices(root) {
  return JSON.parse(fs.readFileSync(path.join(root, VOICES), 'utf8'));
}

// ---------------------------------------------------------------------------------------------
// ElevenLabs

/** Hides the key wherever a server or the network might have repeated it. */
const hide = (text, key) => String(text).replaceAll(key, '[redacted]');

/** One text-to-speech request: the MP3 bytes. The key travels in a header only, and no message of an error carries it. */
async function request({ key, fetch, text, voiceId, seed }) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(voiceId)) throw new Error(`Not a voice id: ${JSON.stringify(voiceId)}`);
  let response;
  try {
    response = await fetch(`${API}/${voiceId}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, language_code: LANGUAGE, voice_settings: SETTINGS, ...(seed === undefined ? {} : { seed }) }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (error) {
    throw new Error(`ElevenLabs could not be reached: ${hide(error.message, key)}`);
  }
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${hide(await response.text(), key).slice(0, 500)}`);
  if (!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('ElevenLabs did not answer with audio.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error('ElevenLabs answered with empty audio.');
  return bytes;
}

/** The raw answer for a request: from the cache, or asked for once and kept. */
async function take({ root, key, fetch, text, voiceId, seed, log }) {
  const file = path.join(root, CACHE, `${cacheKey({ text, voiceId, seed })}.mp3`);
  if (fs.existsSync(file)) return file;
  log(`Asking for ${text.length} characters...`);
  const bytes = await request({ key, fetch, text, voiceId, seed });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.part`, bytes);
  fs.renameSync(`${file}.part`, file);
  return file;
}

// ---------------------------------------------------------------------------------------------
// Audio

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error(`${command} failed: ${String(error.stderr || error.message).trim().slice(0, 400)}`);
  }
}

/** Fails before any credit is spent when the audio tools are missing. */
function needAudioTools() {
  run('ffmpeg', ['-version']);
  run('ffprobe', ['-version']);
}

/** The raw take, mastered into `target`; its length in seconds. */
function master(raw, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-map_metadata', '-1', '-af', MASTER, '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', target]);
  const seconds = durationOf(target);
  if (!(seconds > 0.3 && seconds < 40)) throw new Error(`Unexpected length for ${path.basename(target)}: ${seconds} s`);
  return seconds;
}

// ---------------------------------------------------------------------------------------------
// The commands

/** Makes the lines of a set (the chapter's unless told another; all of them, or those in `only`): an MP3 each in the set's folder but for a kept line, which keeps the one it has; and their entries in lines.json. Returns their ids. */
export async function generate({ root, key, fetch, only = null, set = 'kafli1', log }) {
  const folder = setFolder(set);
  const source = sourceOf(set);
  const lines = readLines(root, set);
  const voices = readVoices(root);
  if (only) {
    const unknown = only.filter(id => !lines.some(line => line.id === id));
    if (unknown.length) throw new Error(`Not in ${source}: ${unknown.join(', ')}`);
  }
  const chosen = only ? lines.filter(line => only.includes(line.id)) : lines;
  // All that can stop the run is found before the first request, so it never pays for some lines and then stops. A kept
  // line needs no voice; its MP3 must be there (audio-lines.mjs passes over a missing one, so this tool looks for it).
  const made = chosen.filter(line => line.kept === undefined);
  const missing = [...new Set(made.map(line => line.speaker))].filter(speaker => typeof voices[speaker] !== 'string' || !voices[speaker]);
  if (missing.length) {
    throw new Error(`No voice is chosen for ${missing.join(' and ')} in ${VOICES}; node remake/tools/voice-lines.mjs --audition <name> makes samples to choose from. No request was made.`);
  }
  const lost = chosen.filter(line => line.kept !== undefined && !fs.existsSync(path.join(root, folder, `${line.id}.mp3`)));
  if (lost.length) {
    throw new Error(`${lost.map(line => line.id).join(', ')}: kept in ${source}, but ${lost.length > 1 ? 'their MP3s are' : 'its MP3 is'} not in ${folder}. Put the chosen take back, or take "kept" away to have the tool make the line again. No request was made.`);
  }
  needAudioTools();
  for (const line of chosen) {
    if (line.kept !== undefined) { // chosen by ear: not asked for, not mastered, not written over; only its entry in lines.json is renewed
      log(`Kept ${line.id}: ${line.kept}`);
      continue;
    }
    const raw = await take({ root, key, fetch, text: line.text, voiceId: voices[line.speaker], seed: line.seed, log });
    const seconds = master(raw, path.join(root, folder, `${line.id}.mp3`));
    log(`Ready ${line.id}: ${seconds} s`);
  }
  updateLines(root, chosen.map(line => line.id), set);
  return chosen.map(line => line.id);
}

/** A file-name word for a voice: "Sanna Hartfield - Calm and Soothing" is "sanna-hartfield". */
const slug = name => name.split(' - ')[0].normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** One sample per candidate voice of a character, and an index of them, in qa/remake/voices/. The sample line is read from the set the candidate names. Returns the index's rows. */
export async function audition({ root, key, fetch, character, log }) {
  const { line: lineId, voices } = CANDIDATES[character];
  const line = readLines(root, setOf(character)).find(entry => entry.id === lineId);
  if (!line) throw new Error(`${lineId}, the sample line for ${character}, is not in ${sourceOf(setOf(character))}.`);
  needAudioTools();
  const folder = path.join(root, AUDITIONS);
  fs.mkdirSync(folder, { recursive: true });
  for (const name of fs.readdirSync(folder)) { // the folder holds the samples of this round only
    if (name.startsWith(`${character}-`) && /\.(mp3|md)$/.test(name)) fs.rmSync(path.join(folder, name));
  }
  const rows = [];
  for (const [i, voice] of voices.entries()) {
    const raw = await take({ root, key, fetch, text: line.text, voiceId: voice.id, log });
    const fileName = `${character}-${i + 1}-${slug(voice.name)}.mp3`;
    const seconds = master(raw, path.join(folder, fileName));
    rows.push({ n: i + 1, ...voice, file: fileName, seconds });
    log(`Ready ${fileName}: ${seconds} s`);
  }
  const table = rows.map(row => `| ${row.n} | ${row.name} | ${row.id} | ${row.file} | ${row.note} |`);
  fs.writeFileSync(path.join(folder, `${character}-index.md`), [
    `# ${character}: voices to choose from`,
    '',
    `Every file is the same line, ${line.id}, spoken by one candidate: "${line.text}"`,
    '',
    `Eleven v3, Icelandic, stability ${SETTINGS.stability}, similarity ${SETTINGS.similarity_boost}, speed ${SETTINGS.speed}; mastered to the loudness of the game's narration, so the files compare fairly.`,
    'Each file is one take. Eleven v3 gives another take every time it is asked, with its own pace, so judge the voice rather than one reading.',
    'Choose one, then put its voice id in remake/assets/audio/voices.json.',
    '',
    '| # | Voice | Voice id | File | About |',
    '| --- | --- | --- | --- | --- |',
    ...table,
    '',
  ].join('\n'));
  return rows;
}

export async function main(argv, { env = process.env, root = ROOT, fetch = globalThis.fetch, log = console.log } = {}) {
  const args = parseArgs(argv);
  const key = env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('Set ELEVENLABS_API_KEY in the local environment to make voices. No request was made.');
  try {
    if (args.audition) {
      const rows = await audition({ root, key, fetch, character: args.audition, log });
      log(`${rows.length} samples and ${args.audition}-index.md are in ${AUDITIONS}/`);
    } else {
      const ids = await generate({ root, key, fetch, only: args.only, set: args.set, log });
      log(`${ids.length} lines are in ${setFolder(args.set)}/ and lines.json`);
    }
  } catch (error) {
    throw new Error(hide(error.message, key));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`voice-lines: ${error.message}`);
    process.exitCode = 1;
  });
}
