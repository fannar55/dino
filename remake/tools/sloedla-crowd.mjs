#!/usr/bin/env node
// Söngur Slóeðlu: the crowd at the festival, heard now and then (never seen): a "vá!" when it goes well, a kind "æææ" when a long
// run breaks, cheering when a section comes in big, and applause at the end. Made with the ElevenLabs sound effects API
// (POST /v1/sound-generation), a few takes of each so the game need not play the same one twice in a row.
//   node remake/tools/sloedla-crowd.mjs --list               the sounds and what is asked for (asks for nothing)
//   node remake/tools/sloedla-crowd.mjs [--only id,id] [--force]
//                                                            makes remake/assets/audio/sloedla/crowd-<id>.mp3 and writes crowd.json
//   node remake/tools/sloedla-crowd.mjs --check [--only id,id]
//                                                            speech-to-text (scribe_v2, audio events tagged) on each, into crowd.json:
//                                                            a check without listening that a "vá" sounds like people and not music
// Each answer is trimmed of silence at the start, levelled (loudnorm to -18 LUFS, peaks under -2 dB) and faded out at the end, so
// the game can play them all at one gain. A sound that exists is never made again (that costs credits) unless --force is given.
//
// The key is read from ELEVENLABS_API_KEY and from nowhere else. It goes into one request header; it is never printed, logged,
// written to a file or put in a URL, and without it the tool stops before it asks for anything.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FOLDER = 'remake/assets/audio/sloedla';
const API = 'https://api.elevenlabs.io/v1';
const MODEL = 'eleven_text_to_sound_v2';
const TIMEOUT = 3 * 60 * 1000;

const PLACE = 'a small, friendly crowd of children and parents at an outdoor evening festival in a forest, close by, no music, no instruments';
const KINDS = {
  va: { seconds: 2.2, takes: 3, text: `${PLACE}: many people's voices say "wow!" together at once, amazed and delighted, like the moment after a magic trick, human voices only` },
  ae: { seconds: 2.0, takes: 3, text: `${PLACE}: everyone goes "ohhhh" together at once, a gentle, warm, sympathetic sigh at a near miss, kind and not mocking, falling in pitch` },
  fagn: { seconds: 3.5, takes: 2, text: `${PLACE}: a happy burst of cheering, whoops and a little clapping, excited children, no words` },
  klapp: { seconds: 5.0, takes: 2, text: `${PLACE}: warm applause and cheering at the end of a song, kids whooping, clapping that fades out at the end, no words` },
  // one clap of the whole crowd at once, cut to its first `cut` s: the game plays it on the beat when the crowd claps along
  takt: { seconds: 0.8, takes: 4, cut: 0.42, text: `${PLACE}: the whole crowd claps their hands exactly once, all together on the beat: one single big clap of many hands at the same moment, then silence, no cheering, no words` },
};
/** Every sound the tool makes: va-1, va-2 … klapp-2. */
export const SOUNDS = Object.entries(KINDS).flatMap(([kind, k]) => Array.from({ length: k.takes }, (_, i) => ({ id: `${kind}-${i + 1}`, kind, ...k })));

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
const fileOf = id => path.join(ROOT, FOLDER, `crowd-${id}.mp3`);
const MANIFEST = path.join(ROOT, FOLDER, 'crowd.json');
const readManifest = () => (fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { about: 'Söngur Slóeðlu: the crowd (tools/sloedla-crowd.mjs)', sounds: {} });
const writeManifest = data => fs.writeFileSync(MANIFEST, `${JSON.stringify(data, null, 2)}\n`);
const seconds = file => Number(JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', file])).format.duration);

async function make({ only, force }) {
  const key = keyOf();
  const manifest = readManifest();
  const cache = path.join(os.tmpdir(), 'sloedla-crowd');
  fs.mkdirSync(cache, { recursive: true });
  for (const sound of SOUNDS.filter(s => !only || only.includes(s.id))) {
    const out = fileOf(sound.id);
    if (fs.existsSync(out) && !force) {
      console.log(`${sound.id}: there already (--force makes it again)`);
      continue;
    }
    const body = { text: sound.text, duration_seconds: sound.seconds, prompt_influence: 0.6, model_id: MODEL };
    const answer = await ask(key, `${API}/sound-generation?output_format=mp3_44100_128`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const raw = path.join(cache, `crowd-${sound.id}-raw.mp3`);
    fs.writeFileSync(raw, Buffer.from(await answer.arrayBuffer()));
    const trimmed = path.join(cache, `crowd-${sound.id}-trim.wav`);
    run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,loudnorm=I=-18:TP=-2:LRA=11', '-ar', '44100', trimmed]);
    if (sound.cut) {
      // a one-shot: its first clap only, the tail faded
      const cut = path.join(cache, `crowd-${sound.id}-cut.wav`);
      run('ffmpeg', ['-y', '-v', 'error', '-i', trimmed, '-af', `atrim=0:${sound.cut},afade=t=out:st=${(sound.cut * 0.55).toFixed(3)}:d=${(sound.cut * 0.45).toFixed(3)}`, cut]);
      fs.renameSync(cut, trimmed);
    }
    const length = seconds(trimmed);
    const fade = sound.cut ? 0.01 : Math.min(0.4, length * 0.2);
    run('ffmpeg', ['-y', '-v', 'error', '-i', trimmed, '-af', `afade=t=out:st=${(length - fade).toFixed(3)}:d=${fade.toFixed(3)}`, '-c:a', 'libmp3lame', '-b:a', '128k', out]);
    manifest.sounds[sound.id] = { kind: sound.kind, file: path.basename(out), seconds: Number(length.toFixed(2)), asked: body, made: new Date().toISOString().slice(0, 10) };
    writeManifest(manifest);
    console.log(`${sound.id}: ${length.toFixed(2)} s`);
  }
}

async function check({ only }) {
  const key = keyOf();
  const manifest = readManifest();
  for (const sound of SOUNDS.filter(s => !only || only.includes(s.id))) {
    const file = fileOf(sound.id);
    if (!fs.existsSync(file)) continue;
    const form = new FormData();
    form.append('model_id', 'scribe_v2');
    form.append('tag_audio_events', 'true');
    form.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), path.basename(file));
    const answer = await (await ask(key, `${API}/speech-to-text`, { method: 'POST', headers: {}, body: form })).json();
    const heard = (answer.words ?? []).filter(w => w.type !== 'spacing').map(w => (w.type === 'audio_event' ? w.text : `"${w.text}"`)).join(' ');
    manifest.sounds[sound.id] = { ...manifest.sounds[sound.id], heard: hide(heard, key).slice(0, 300) };
    console.log(`${sound.id}: ${manifest.sounds[sound.id].heard}`);
  }
  writeManifest(manifest);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
  if (argv.includes('--list')) for (const s of SOUNDS) console.log(`${s.id} (${s.seconds} s): ${s.text}`);
  else if (argv.includes('--check')) await check({ only });
  else await make({ only, force: argv.includes('--force') });
}
