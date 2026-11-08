#!/usr/bin/env node
// Chapter 5's recorded tones (Task 6): each group of the choir sings with its animal's own call, tuned to its tone, over an instrument
// note, and Slóeðla answers on a recorded horn. The owner picks by ear on the listening page (qa/remake/kafli5/hljod/index.html, which
// saves hljod-val.json); this tool makes the candidates and then masters his picks.
//
//   node remake/tools/kafli5-sounds.mjs --takes [--only id,id] [--force]
//        asks ElevenLabs sound generation for the candidate takes below, into qa/remake/kafli5/hljod/eleven/ (git ignores qa/): each
//        as generated (<id>.raw.mp3), what was asked (<id>.json), and trimmed and levelled for the page (<id>.mp3). A take that is
//        there is never asked for again (that costs credits) unless --force is given.
//   node remake/tools/kafli5-sounds.mjs --list    the takes and what each asks for (asks for nothing)
//
// The key is read from ELEVENLABS_API_KEY and from nowhere else. It goes into one request header; it is never printed, logged,
// written to a file or put in a URL, and without it the tool stops before it asks for anything.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CANDIDATES = 'qa/remake/kafli5/hljod';
const API = 'https://api.elevenlabs.io/v1';
const MODEL = 'eleven_text_to_sound_v2';
const TIMEOUT = 3 * 60 * 1000;
const SHOT_PEAK = -3; // a one-shot's peak (dBFS)

const DRY = 'cute, close and dry. No words, no music, no other animals, no wind or water.';
const POND = 'A gentle duck-billed dinosaur at a still pond in a golden afternoon';
/** The candidate takes: what each group's call or her horn is asked to be. A sung note is asked as one steady pitch, to be tuned. */
export const TAKES = [
  { id: 'grazer-sing-1', need: 'grazers', seconds: 1.6, text: `A gentle friendly plant-eating dinosaur the size of a pony sings one long soft low musical hum-moo, a single steady note held for a moment, warm and round like a calf's moo crossed with a tuba, ${DRY}` },
  { id: 'grazer-sing-2', need: 'grazers', seconds: 1.4, text: `A gentle friendly plant-eating dinosaur gives one soft deep honk held on one steady pitch, like a goose crossed with a cow, warm and friendly, ${DRY}` },
  { id: 'turtle-sing-1', need: 'turtles', seconds: 1.4, text: `A friendly old turtle sings one slow, low, soft hooting grunt on a single steady pitch, round and gentle like a tiny foghorn, ${DRY}` },
  { id: 'turtle-hiss-1', need: 'turtles', seconds: 1.2, text: `A friendly old turtle gives one soft, low, breathy hiss with a gentle hum in it, short and calm, not scary, ${DRY}` },
  { id: 'frog-1', need: 'frogs', seconds: 1.0, text: `A small friendly frog sings one clear musical ribbit, a single bright croak on a steady pitch, at a quiet pond, ${DRY}` },
  { id: 'frog-2', need: 'frogs', seconds: 0.8, text: `A small tree frog gives one clear high peep on a steady musical note, short and sweet, ${DRY}` },
  { id: 'frog-3', need: 'frogs', seconds: 1.0, text: `A plump friendly frog gives one round low croak, a single "brrup" with a clear pitch, funny and kind, ${DRY}` },
  { id: 'lizard-sing-1', need: 'lizards', seconds: 0.8, text: `A tiny friendly lizard sings one clear little chirp on a steady high note, like a small bird's tweet, ${DRY}` },
  { id: 'flyer-sing-1', need: 'flyers', seconds: 1.2, text: `A small friendly flying reptile sings one clear high whistled cry, a single long note that holds steady, soft and sweet like a small seabird, ${DRY}` },
  { id: 'flyer-sing-2', need: 'flyers', seconds: 1.4, text: `A few small friendly flying reptiles answer together with one high, soft, whistled note on the same pitch, sweet and gentle, ${DRY}` },
  { id: 'horn-1', need: 'horn', seconds: 3.0, influence: 0.6, text: `${POND} blows one long, warm, deep note through the long hollow crest on her head, like a soft alphorn heard across the water, one steady held note with a slow swell and a gentle fade, peaceful and kind. No melody, no other instruments, no words, no birds.` },
  { id: 'horn-2', need: 'horn', seconds: 2.5, influence: 0.6, text: `${POND} blows one warm, hollow, hooting note through her head crest, like blowing across a giant conch shell, round and mellow, held steady, gentle. No melody, no other instruments, no words, no birds.` },
  { id: 'horn-3', need: 'horn', seconds: 2.5, influence: 0.6, text: `${POND} plays one soft note through her hollow crest, like a french horn and a low wooden flute together, warm and breathy, one steady held note. No melody, no other instruments, no words, no birds.` },
  { id: 'horn-4', need: 'horn', seconds: 2.5, influence: 0.6, text: `${POND} gives one deep, resonant, musical trumpeting call through a long bony tube on her head, warm and clear, one note held steady, like a gentle tuba. No melody, no other instruments, no words, no birds.` },
  // the first four came out high (1.2-1.4 kHz); these two ask for the low register by name
  { id: 'horn-5', need: 'horn', seconds: 3.0, influence: 0.7, text: `${POND} hums one very low, deep bass note through her long hollow head crest, like a didgeridoo crossed with a tuba, warm and soft, one steady low note held for two seconds. No melody, no high notes, no other instruments, no words, no birds.` },
  { id: 'horn-6', need: 'horn', seconds: 3.0, influence: 0.7, text: `${POND} blows one low, round, mellow note through her hollow crest, like a big bass ocarina or a foghorn far away, deep and gentle, one steady note with a soft start and fade. No melody, no high notes, no other instruments, no words, no birds.` },
  { id: 'horn-false-1', need: 'horn-false', seconds: 2.5, influence: 0.6, text: `A shy duck-billed dinosaur tries to blow a note through the hollow crest on her head, but it comes out wobbly and off-key, the pitch sliding down and cracking, a little sad and a little funny, a warm hollow horn tone, gentle. No melody, no other instruments, no words.` },
];

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

const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
function peakOf(file) {
  const out = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return Number(/max_volume: (-?[\d.]+) dB/.exec(out)?.[1] ?? 0);
}

/** A one-shot for the page: silence off both ends, a 5 ms fade in and 30 ms out, its peak at SHOT_PEAK, mono 44.1 kHz. */
export function trimForPage(raw, out) {
  const temp = `${out}.trim.wav`;
  const quiet = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.01';
  ffmpeg(['-i', raw, '-ac', '1', '-ar', '44100', '-af', `${quiet},areverse,${quiet},areverse`, temp]);
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', temp]).toString());
  const gain = SHOT_PEAK - peakOf(temp);
  const fadeOut = Math.min(0.03, seconds / 4);
  ffmpeg(['-i', temp, '-af', `volume=${gain.toFixed(2)}dB,afade=t=in:d=0.005,afade=t=out:st=${(seconds - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`, '-c:a', 'libmp3lame', '-b:a', '128k', out]);
  fs.rmSync(temp);
  return seconds;
}

async function takes({ only, force }) {
  const key = keyOf();
  const folder = path.join(ROOT, CANDIDATES, 'eleven');
  fs.mkdirSync(folder, { recursive: true });
  for (const take of TAKES.filter(t => !only || only.includes(t.id))) {
    const raw = path.join(folder, `${take.id}.raw.mp3`);
    const page = path.join(folder, `${take.id}.mp3`);
    const body = { text: take.text, duration_seconds: take.seconds, prompt_influence: take.influence ?? 0.5, model_id: MODEL };
    if (fs.existsSync(raw) && !force) {
      if (fs.existsSync(page)) {
        console.log(`${take.id}: there already (--force asks again)`);
        continue;
      }
    } else {
      const answer = await ask(key, `${API}/sound-generation?output_format=mp3_44100_128`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      fs.writeFileSync(raw, Buffer.from(await answer.arrayBuffer()));
    }
    const seconds = trimForPage(raw, page);
    const made = fs.statSync(raw).mtime.toISOString();
    fs.writeFileSync(path.join(folder, `${take.id}.json`), `${JSON.stringify({ need: take.need, take: take.id, model: MODEL, seconds: take.seconds, prompt_influence: body.prompt_influence, text: take.text, made }, null, 2)}\n`);
    console.log(`${take.id}: ${seconds.toFixed(2)} s`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
  if (argv.includes('--list')) for (const t of TAKES) console.log(`${t.id} [${t.need}] (${t.seconds} s): ${t.text}`);
  else if (argv.includes('--takes')) await takes({ only, force: argv.includes('--force') });
  else console.log('node remake/tools/kafli5-sounds.mjs --takes | --list (the mastering of the picks comes with them)');
}
