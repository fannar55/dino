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
//   node remake/tools/kafli5-sounds.mjs --fetch   fetches the Freesound previews he ticked (FREESOUND) into qa/remake/kafli5/hljod/
//        freesound/<id>/, each only after its page is read and shows its licence and no other
//   node remake/tools/kafli5-sounds.mjs [--only grazers-1.mp3,horn-1.mp3]
//        masters his picks (PICKS: cut, faded, peak at -3 dBFS, mono 44.1 kHz 96 kbps) into remake/assets/audio/kafli5/hljod/,
//        measures each one's pitch (tools/pitch.mjs) and writes hljod/sounds.json and kafli5/CREDITS.md from the same list
//
// The key is read from ELEVENLABS_API_KEY and from nowhere else. It goes into one request header; it is never printed, logged,
// written to a file or put in a URL, and without it the tool stops before it asks for anything.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pitchOf } from './pitch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CANDIDATES = 'qa/remake/kafli5/hljod';
const API = 'https://api.elevenlabs.io/v1';
const MODEL = 'eleven_text_to_sound_v2';
const TIMEOUT = 3 * 60 * 1000;
const SHOT_PEAK = -3; // a one-shot's peak (dBFS)
const CLEAR = 0.3; // a take is tuned when at least this share of its loud frames has a clear pitch (else it plays as it is)

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

// ---- The owner's picks of 2026-11-08 (qa/remake/kafli5/hljod/hljod-val.json) ----

export const OUT = 'remake/assets/audio/kafli5/hljod';
const ELEVEN = 'ElevenLabs sound generation, made for this game';
/** The Freesound recordings he ticked, as their pages give them (the HQ preview is what is fetched and cut). */
export const FREESOUND = {
  59245: { name: 'z-moo01.wav', author: 'Zozzy', licence: 'CC0 1.0', page: 'https://freesound.org/people/Zozzy/sounds/59245/', preview: 'https://cdn.freesound.org/previews/59/59245_91975-hq.mp3' },
  721978: { name: 'Low Toad Groan', author: 'Metris', licence: 'CC BY 4.0', page: 'https://freesound.org/people/Metris/sounds/721978/', preview: 'https://cdn.freesound.org/previews/721/721978_14696146-hq.mp3' },
  191524: { name: 'Coqui.aif', author: 'dashatron', licence: 'CC0 1.0', page: 'https://freesound.org/people/dashatron/sounds/191524/', preview: 'https://cdn.freesound.org/previews/191/191524_3565052-hq.mp3' },
  536759: { name: 'Frog.ogg', author: 'egomassive', licence: 'CC0 1.0', page: 'https://freesound.org/people/egomassive/sounds/536759/', preview: 'https://cdn.freesound.org/previews/536/536759_1415754-hq.mp3' },
  400573: { name: 'ThằngLằng.wav', author: 'SieuAmThanh', licence: 'CC0 1.0', page: 'https://freesound.org/people/SieuAmThanh/sounds/400573/', preview: 'https://cdn.freesound.org/previews/400/400573_7554526-hq.mp3' },
  69357: { name: 'Common Buzzard .wav', author: 'Benboncan', licence: 'CC BY 4.0', page: 'https://freesound.org/people/Benboncan/sounds/69357/', preview: 'https://cdn.freesound.org/previews/69/69357_634166-hq.mp3' },
  72892: { name: 'Curlew .wav', author: 'Benboncan', licence: 'CC BY 4.0', page: 'https://freesound.org/people/Benboncan/sounds/72892/', preview: 'https://cdn.freesound.org/previews/72/72892_634166-hq.mp3' },
  373580: { name: 'Marimba - C5 (Marimba_hit_Outrigger_C4_loud_01.wav)', author: 'sgossner', licence: 'CC0 1.0', page: 'https://freesound.org/people/sgossner/sounds/373580/', preview: 'https://cdn.freesound.org/previews/373/373580_2475994-hq.mp3' },
  507468: { name: 'Alpenhorn.aiff', author: 'Danjocross', licence: 'CC0 1.0', page: 'https://freesound.org/people/Danjocross/sounds/507468/', preview: 'https://cdn.freesound.org/previews/507/507468_2977885-hq.mp3' },
  726861: { name: 'Didgeridoo Long Drone', author: 'Robo9418', licence: 'CC0 1.0', page: 'https://freesound.org/people/Robo9418/sounds/726861/', preview: 'https://cdn.freesound.org/previews/726/726861_15176424-hq.mp3' },
};
const LICENCE_URL = {
  'CC0 1.0': 'creativecommons.org/publicdomain/zero/1.0',
  'CC BY 4.0': 'creativecommons.org/licenses/by/4.0',
  'CC BY 3.0': 'creativecommons.org/licenses/by/3.0',
};
const k4 = (file, take) => ({ from: `remake/assets/audio/kafli4/hljod/${file}`, source: { kind: 'ElevenLabs', licence: ELEVEN, take, note: `chapter 4's hljod/${file}` } });
const eleven = take => ({ from: `${CANDIDATES}/eleven/${take}.raw.mp3`, source: { kind: 'ElevenLabs', licence: ELEVEN, take, prompt: `${CANDIDATES}/eleven/${take}.json` } });
const free = (id, cut) => ({ from: `${CANDIDATES}/freesound/${id}/${id}.mp3`, cut, source: { kind: 'Freesound', id, ...FREESOUND[id] } });
const animal = (group, what) => ({ role: 'animal', group, what });
/** Each shipped file: its role in the choir, its source and, for a Freesound recording, the cut ([from, to] s of the preview). */
export const PICKS = {
  'grazers-1.mp3': { ...animal('grazers', 'a grazer sings do'), ...k4('grazer-3.mp3', 'grazer-3') },
  'grazers-2.mp3': { ...animal('grazers', 'a grazer sings do'), ...eleven('grazer-sing-1') },
  'grazers-3.mp3': { ...animal('grazers', 'a grazer sings do (a cow\'s moo)'), ...free(59245, [0.2, 1.7]) },
  'turtles-1.mp3': { ...animal('turtles', 'a turtle sings re (a low hiss)'), ...eleven('turtle-hiss-1') },
  'turtles-2.mp3': { ...animal('turtles', 'a turtle sings re'), ...eleven('turtle-sing-1') },
  'turtles-3.mp3': { ...animal('turtles', 'a turtle sings re (a low groan)'), ...free(721978, [0, 0.5]) },
  'frogs-1.mp3': { ...animal('frogs', 'a frog sings mi'), ...eleven('frog-1') },
  'frogs-2.mp3': { ...animal('frogs', 'a frog sings mi'), ...eleven('frog-2') },
  'frogs-3.mp3': { ...animal('frogs', 'a frog sings mi'), ...eleven('frog-3') },
  'frogs-4.mp3': { ...animal('frogs', 'a frog sings mi (a coqui tree frog)'), ...free(191524, [0.35, 1.0]) },
  'frogs-5.mp3': { ...animal('frogs', 'a frog sings mi (a ribbit)'), ...free(536759, [0.08, 0.5]) },
  'lizards-1.mp3': { ...animal('lizards', 'a small lizard sings sol'), ...k4('smalldino-2.mp3', 'smalldino-2') },
  'lizards-2.mp3': { ...animal('lizards', 'a small lizard sings sol'), ...eleven('lizard-sing-1') },
  'lizards-3.mp3': { ...animal('lizards', 'a small lizard sings sol (one gecko chirp)'), ...free(400573, [0.3, 0.57]) },
  'flyers-1.mp3': { ...animal('flyers', 'the small flyers sing la'), ...eleven('flyer-sing-2') },
  'flyers-2.mp3': { ...animal('flyers', 'a small flyer sings la (a buzzard\'s mew)'), ...free(69357, [0.4, 1.55]) },
  'flyers-3.mp3': { ...animal('flyers', 'a small flyer sings la (a curlew\'s whistle)'), ...free(72892, [0.35, 1.1]) },
  'marimba.mp3': { role: 'instrument', what: 'the marimba note under every animal, moved to its tone', ...free(373580, [0, 2.5]), fadeOut: 0.3 },
  'horn-1.mp3': { roles: ['horn', 'hornFalse'], wobble: true, what: 'her horn (an alphorn-like pipe), true at each tone, and made false', ...free(507468, [0.15, 2.9]), fadeIn: 0.04, fadeOut: 0.25 },
  'horn-2.mp3': { roles: ['horn', 'hornFalse'], wobble: true, what: 'her horn (a didgeridoo drone), true at each tone, and made false', ...free(726861, [1.0, 4.0]), fadeIn: 0.04, fadeOut: 0.25 },
};
/** The levels of each part (his mix on the page: the instrument at 0.6 of the animal). */
export const LEVELS = { animal: 1, instrument: 0.6, horn: 1, hornFalse: 1 };
/** Made sounds he ticked among the recordings: chapter 4's false horn stays one of her false horns. */
export const MADE_TOO = { hornFalse: true };

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

/**
 * A one-shot: its `cut` ([from, to] s), or with no cut the silence off both ends; faded in over `fadeIn` and out over `fadeOut` s;
 * its peak at SHOT_PEAK; mono 44.1 kHz mp3 at `bitrate`. Its length (s).
 */
export function trimForPage(raw, out, { cut = null, fadeIn = 0.005, fadeOut = 0.03, bitrate = '128k' } = {}) {
  const temp = `${out}.trim.wav`;
  const quiet = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.01';
  const shape = cut ? `atrim=${cut[0]}:${cut[1]},asetpts=PTS-STARTPTS` : `${quiet},areverse,${quiet},areverse`;
  ffmpeg(['-i', raw, '-ac', '1', '-ar', '44100', '-af', shape, temp]);
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', temp]).toString());
  const gain = SHOT_PEAK - peakOf(temp);
  const tail = Math.min(fadeOut, seconds / 4);
  ffmpeg(['-i', temp, '-af', `volume=${gain.toFixed(2)}dB,afade=t=in:d=${Math.min(fadeIn, seconds / 4).toFixed(3)},afade=t=out:st=${(seconds - tail).toFixed(3)}:d=${tail.toFixed(3)}`, '-c:a', 'libmp3lame', '-b:a', bitrate, out]);
  fs.rmSync(temp);
  return seconds;
}

/** The pitch of a mastered file (tools/pitch.mjs), as sounds.json keeps it. */
function measure(file) {
  const bytes = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  const { hz, clarity, voiced } = pitchOf(samples, 44100);
  return { hz, clarity, voiced, clear: Boolean(hz) && voiced >= CLEAR };
}

/**
 * Fetches the Freesound previews he ticked into qa/remake/kafli5/hljod/freesound/<id>/ (with source.json), each only after its page
 * is read and shows the licence named above; a page that shows another stops the tool before that file is fetched.
 */
async function fetchPicks() {
  for (const [id, sound] of Object.entries(FREESOUND)) {
    const folder = path.join(ROOT, CANDIDATES, 'freesound', id);
    const file = path.join(folder, `${id}.mp3`);
    if (fs.existsSync(file)) {
      console.log(`${id}: there already`);
      continue;
    }
    const html = await (await fetch(sound.page, { signal: AbortSignal.timeout(TIMEOUT) })).text();
    const shown = [...new Set([...html.matchAll(/creativecommons\.org\/(?:publicdomain\/zero|licenses\/[a-z-]+)\/[\d.]+/g)].map(m => m[0]))];
    if (!shown.includes(LICENCE_URL[sound.licence]) || shown.length !== 1) throw new Error(`${id} (${sound.name}): its page shows ${shown.join(', ') || 'no licence'}, not only ${sound.licence}; nothing of it was fetched`);
    const answer = await fetch(sound.preview, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!answer.ok) throw new Error(`${id}: the preview answered ${answer.status}`);
    const bytes = Buffer.from(await answer.arrayBuffer());
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(file, bytes);
    fs.writeFileSync(path.join(folder, 'source.json'), `${JSON.stringify({ id, ...sound, licenceUrl: `https://${LICENCE_URL[sound.licence]}/`, fetched: new Date().toISOString() }, null, 2)}\n`);
    console.log(`${id}: ${sound.name}, ${sound.author}, ${sound.licence}, ${(bytes.length / 1024).toFixed(0)} KB`);
  }
}

/** Masters each pick into OUT, writes sounds.json (role, pitch, source and cut of each) and kafli5/CREDITS.md from the same list. */
function masterPicks({ only = null } = {}) {
  const folder = path.join(ROOT, OUT);
  fs.mkdirSync(folder, { recursive: true });
  const listFile = path.join(folder, 'sounds.json');
  const old = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')).files ?? {} : {};
  const files = {};
  for (const [name, pick] of Object.entries(PICKS)) {
    const out = path.join(folder, name);
    if (only && !only.includes(name) && old[name] && fs.existsSync(out)) {
      files[name] = old[name];
      continue;
    }
    const seconds = trimForPage(path.join(ROOT, pick.from), out, { cut: pick.cut ?? null, fadeIn: pick.fadeIn, fadeOut: pick.fadeOut, bitrate: '96k' });
    const { from, cut, fadeIn, fadeOut, ...kept } = pick;
    files[name] = { ...kept, ...measure(out), seconds: Number(seconds.toFixed(3)), ...(cut ? { cut } : {}) };
    const p = files[name];
    console.log(`${name}: ${seconds.toFixed(2)} s, ${p.hz ? `${p.hz} Hz` : 'no pitch'} (clarity ${p.clarity}, voiced ${p.voiced}${p.clear ? ', tuned' : ', as it is'})`);
  }
  const about = 'Chapter 5\'s recorded tones (tools/kafli5-sounds.mjs): the owner\'s picks of 2026-11-08, each with its role in the choir (engine/audio/choir-sounds.js), its measured pitch and its source.';
  fs.writeFileSync(listFile, `${JSON.stringify({ about, levels: LEVELS, madeToo: MADE_TOO, files }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, 'remake/assets/audio/kafli5/CREDITS.md'), credits(files));
}

function credits(files) {
  const attributed = Object.values(FREESOUND).filter(s => /CC BY/.test(s.licence));
  const byUrl = { 'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/', 'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/' };
  const sourceOf = entry => (entry.source.kind === 'Freesound'
    ? `"${entry.source.name}" by ${entry.source.author}, ${entry.source.page} (${entry.cut[0]}–${entry.cut[1]} s)`
    : `ElevenLabs take ${entry.source.take}${entry.source.note ? ` (${entry.source.note})` : ''}`);
  const lines = [
    '# Recorded sounds in chapter 5',
    '',
    'The choir\'s tones at the far pool (engine/audio/choir-sounds.js): each group of animals sings its tone of Slóeðla\'s song with its own',
    'call, moved to the tone, over a marimba note on the tone, and she answers on her horn, as the owner picked them by ear on 2026-11-08',
    '(qa/remake/kafli5/hljod/hljod-val.json). `node remake/tools/kafli5-sounds.mjs` cuts and levels them; each cut and measured pitch is in',
    '`hljod/sounds.json`. The ElevenLabs takes were generated for this game with its sound generation. The Freesound recordings are under',
    'the licences named here. Those that ask for credit:',
    '',
    ...attributed.map(s => `- "${s.name}" by ${s.author} (${s.page}), licensed under ${s.licence} (${byUrl[s.licence]}); cut and levelled.`),
    '',
    '| File | In the game | Source | Licence |',
    '|---|---|---|---|',
    ...Object.entries(files).map(([name, entry]) => `| \`hljod/${name}\` | ${entry.what} | ${sourceOf(entry)} | ${entry.source.licence} |`),
    '',
  ];
  return lines.join('\n');
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
  else if (argv.includes('--fetch')) await fetchPicks();
  else masterPicks({ only });
}
