#!/usr/bin/env node
// Söngur Slóeðlu: the DJ's lines (engine/sloedla/dj.js DJ_LINES), spoken by a voice made for the game with ElevenLabs Voice Design
// ("DJ 1", picked by the owner on 2026-10-29 from twelve designs: qa/remake/sloedla/dj-hannad/).
//   node remake/tools/sloedla-dj.mjs --keep <generated_voice_id>   keeps a designed voice in the account (POST /v1/text-to-voice) and
//                                                                  writes its id into dj.json; asks once
//   node remake/tools/sloedla-dj.mjs --list                        the lines and what is sent for each (asks for nothing)
//   node remake/tools/sloedla-dj.mjs [--only id,id] [--force]      makes remake/assets/audio/sloedla/dj/<id>.mp3 and dj.json
// A line is spoken with eleven_v4 in Icelandic, the pronunciation lexicon applied (remake/assets/audio/pronunciation.json: the
// friends' names), heard back by speech-to-text (scribe_v2); a take that is not heard as written is tried again with the next seed
// (three at most) and the best kept. Each is trimmed of silence, levelled to -16 LUFS (peaks under -1.5 dB) and given a breath of
// quiet at the end. A line that exists is never made again unless --force is given (that costs credits).
//
// The key is read from ELEVENLABS_API_KEY and from nowhere else. It goes into one request header; it is never printed, logged,
// written to a file or put in a URL, and without it the tool stops before it asks for anything.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DJ_LINES } from '../engine/sloedla/dj.js';
import { readLexicon, requestFor } from './pronunciation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FOLDER = 'remake/assets/audio/sloedla/dj';
const API = 'https://api.elevenlabs.io/v1';
const MODEL = 'eleven_v4';
const SETTINGS = Object.freeze({ stability: 0.3, similarity_boost: 0.8, speed: 1.0 });
const SEEDS = [1, 2, 3];
const TIMEOUT = 2 * 60 * 1000;
// sent as previous_text with every line but the first (never spoken): it sets the hype of a DJ at the festival
const MOOD = 'Jæja krakkar, nú byrjar fjörið!';
const DESIGN = 'A fun, high-energy male radio DJ and party host, a native Icelandic speaker from Reykjavík with perfect Icelandic pronunciation. A big smile in the voice, hyping up children at a summer festival with short, punchy, excited shouts. Warm and friendly, never scary. Clear studio quality.';

const hide = (text, key) => String(text).replaceAll(key, '[redacted]');
function keyOf(env = process.env) {
  const key = env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('Set ELEVENLABS_API_KEY in the local environment. No request was made.');
  return key;
}
async function ask(key, url, init) {
  let response;
  try {
    response = await fetch(url, { ...init, headers: { 'xi-api-key': key, ...init.headers }, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (error) {
    throw new Error(`ElevenLabs could not be reached: ${hide(error.message, key)}`);
  }
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${hide(await response.text(), key).slice(0, 2000)}`);
  return response;
}

const run = (command, args) => execFileSync(command, args, { maxBuffer: 1 << 28 }).toString();
const fileOf = id => path.join(ROOT, FOLDER, `${id}.mp3`);
const MANIFEST = path.join(ROOT, FOLDER, 'dj.json');
const readManifest = () => (fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { about: 'Söngur Slóeðlu: the DJ (tools/sloedla-dj.mjs)', voice: null, lines: {} });
const writeManifest = data => { fs.mkdirSync(path.dirname(MANIFEST), { recursive: true }); fs.writeFileSync(MANIFEST, `${JSON.stringify(data, null, 2)}\n`); };
const seconds = file => Number(JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', file])).format.duration);

const wordsOf = s => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
/** The share of the words of `text` heard in order in `heard` (0 to 1). */
export function heardShare(text, heard) {
  const want = wordsOf(text), got = wordsOf(heard ?? '');
  const dp = Array.from({ length: want.length + 1 }, () => new Array(got.length + 1).fill(0));
  for (let i = 1; i <= want.length; i++) for (let j = 1; j <= got.length; j++) dp[i][j] = want[i - 1] === got[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return want.length ? dp[want.length][got.length] / want.length : 1;
}

/**
 * What is sent for line `id`: the lexicon's say, its context alone when it has one (a hard word's context works best undiluted:
 * Kambeðla), else the mood; and the seeds to try, the lexicon's own first.
 */
function requestOf(id, lexicon) {
  const sent = requestFor({ text: DJ_LINES[id], speaker: 'dj' }, lexicon);
  const context = sent.context ?? (id === 'byrjun' ? undefined : MOOD);
  const seeds = [...new Set([sent.seed, ...(sent.context ? [42] : []), ...SEEDS].filter(seed => seed !== undefined))].slice(0, 4);
  return { text: sent.text, context, seeds };
}

/** How alike two texts are letter by letter (0 to 1): a tie between takes heard alike in words goes to the closer spelling. */
function likeness(a, b) {
  const x = wordsOf(a).join(' '), y = wordsOf(b ?? '').join(' ');
  const row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const up = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (x[i - 1] === y[j - 1] ? 0 : 1));
      diagonal = up;
    }
  }
  return 1 - row[y.length] / Math.max(1, x.length, y.length);
}

async function keep(generated) {
  const key = keyOf();
  const manifest = readManifest();
  const response = await ask(key, `${API}/text-to-voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_name: 'Stjörnuhátíðar-DJ (Söngur Slóeðlu)', voice_description: DESIGN, generated_voice_id: generated }),
  });
  const voice = await response.json();
  manifest.voice = { id: voice.voice_id, name: 'Stjörnuhátíðar-DJ', design: DESIGN, preview: generated, kept: new Date().toISOString() };
  writeManifest(manifest);
  console.log(`kept the designed voice as ${voice.voice_id}`);
}

async function hear(key, file) {
  const form = new FormData();
  form.set('model_id', 'scribe_v2');
  form.set('language_code', 'is');
  form.set('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), path.basename(file));
  const response = await ask(key, `${API}/speech-to-text`, { method: 'POST', body: form });
  return ((await response.json()).text ?? '').trim();
}

async function make({ only, force }) {
  const manifest = readManifest();
  if (!manifest.voice?.id) throw new Error('No voice is kept yet: --keep <generated_voice_id> first. No request was made.');
  const ids = only ?? Object.keys(DJ_LINES);
  for (const id of ids) if (!DJ_LINES[id]) throw new Error(`No line called ${id}. No request was made.`);
  const todo = ids.filter(id => force || !fs.existsSync(fileOf(id)));
  if (!todo.length) { console.log('every line is there (--force to make them again)'); return; }
  const key = keyOf();
  const lexicon = readLexicon(ROOT);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sloedla-dj-'));
  fs.mkdirSync(path.join(ROOT, FOLDER), { recursive: true });
  try {
    for (const id of todo) {
      const { text, context, seeds } = requestOf(id, lexicon);
      let best = null;
      for (const seed of seeds) {
        const response = await ask(key, `${API}/text-to-speech/${manifest.voice.id}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, model_id: MODEL, language_code: 'is', voice_settings: SETTINGS, seed, ...(context ? { previous_text: context } : {}) }),
        });
        const raw = path.join(temp, `${id}-${seed}.mp3`);
        const done = path.join(temp, `${id}-${seed}.done.mp3`);
        fs.writeFileSync(raw, Buffer.from(await response.arrayBuffer()));
        run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5,apad=pad_dur=0.15', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', done]);
        const heard = await hear(key, done);
        const share = heardShare(DJ_LINES[id], heard);
        const close = likeness(DJ_LINES[id], heard);
        console.log(`${id} seed ${seed}: ${Math.round(share * 100)}% (letters ${Math.round(close * 100)}%) "${heard}"`);
        if (!best || share > best.share || (share === best.share && close > best.close)) best = { seed, heard, share, close, done };
        if (share >= 1) break;
      }
      fs.copyFileSync(best.done, fileOf(id));
      manifest.lines[id] = { text: DJ_LINES[id], sent: text, ...(context ? { context } : {}), file: `${id}.mp3`, seed: best.seed, heard: best.heard, share: Math.round(best.share * 100) / 100, seconds: Math.round(seconds(fileOf(id)) * 100) / 100, made: new Date().toISOString() };
      writeManifest(manifest);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function list() {
  const lexicon = readLexicon(ROOT);
  for (const id of Object.keys(DJ_LINES)) {
    const { text, context } = requestOf(id, lexicon);
    console.log(`${id.padEnd(15)} ${DJ_LINES[id]}${text !== DJ_LINES[id] ? `  (sent: ${text})` : ''}${context ? `  [context: ${context}]` : ''}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  try {
    if (args.includes('--list')) list();
    else if (args.includes('--keep')) await keep(value('--keep'));
    else await make({ only: value('--only')?.split(','), force: args.includes('--force') });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
