#!/usr/bin/env node
// Chapter 6's recorded sounds (Task 12): hooves on stone, a stone rocking, a frog's splash, a step in wet earth, the wind in the
// cloud, and Mosi's little roar. The owner picks by ear on the listening page (qa/remake/kafli6/hljod/index.html, which saves
// hljod-val.json); this tool fetches the candidates he allows, makes the page, and then masters his picks.
//
//   node remake/tools/kafli6-sounds.mjs --list
//        the Freesound candidates and the ElevenLabs takes, and what each asks for (asks for nothing)
//   node remake/tools/kafli6-sounds.mjs --fetch [--only need|id,...]
//        fetches the HQ previews of the candidates below (FREESOUND; --only: those of a need, or by id) into qa/remake/kafli6/hljod/
//        freesound/<id>/, each only after its page is read and shows its licence and no other (git ignores qa/)
//   node remake/tools/kafli6-sounds.mjs --takes [--only id,id] [--force]
//        asks ElevenLabs sound generation for the candidate takes of Mosi's little roar (TAKES) into qa/remake/kafli6/hljod/eleven/:
//        each as generated (<id>.raw.mp3), what was asked (<id>.json), and trimmed and levelled for the page (<id>.mp3). A take that is
//        there is never asked for again (that costs credits) unless --force is given.
//   node remake/tools/kafli6-sounds.mjs --page
//        builds the listening page from whatever candidate files are on disk
//   node remake/tools/kafli6-sounds.mjs [--only hoofStone-1.mp3,...]
//        masters his picks (PICKS: cut, faded, peak at -3 dBFS, mono 44.1 kHz 96 kbps; the wind cut into a seamless loop) into
//        remake/assets/audio/kafli6/hljod/, writes hljod/sounds.json and kafli6/CREDITS.md from the same list, and prints the
//        KAFLI6_PICKED entries for engine/audio/sfx.js. With no picks it does nothing and says so.
//
// The key is read from ELEVENLABS_API_KEY and from nowhere else. It goes into one request header; it is never printed, logged,
// written to a file or put in a URL, and without it the tool stops before it asks for anything.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trimForPage } from './kafli5-sounds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CANDIDATES = 'qa/remake/kafli6/hljod';
export const OUT = 'remake/assets/audio/kafli6/hljod';
const CREDITS = 'remake/assets/audio/kafli6/CREDITS.md';
const API = 'https://api.elevenlabs.io/v1';
const MODEL = 'eleven_text_to_sound_v2';
const TIMEOUT = 3 * 60 * 1000;
const SHOT_PEAK = -3; // a one-shot's (and the loop's) peak (dBFS)
const AGENT = 'sound-candidates/1.0'; // a plain User-Agent: no name, address or project in it
const BETWEEN = 1500; // ms between two requests to freesound.org

/** The sounds, in the page's order: each its sample in engine/audio/sfx.js and its heading on the page. */
export const NEEDS = {
  hoofStone: 'Hófar á steini',
  stoneRock: 'Steinn sem ruggar',
  frogSplash: 'Froskaskvamp',
  wetStep: 'Skref í blautri mold',
  mountainWind: 'Fjallavindur',
  mosiRoar: 'Litla öskrið hans Mosa',
};
/** What each is in the game, for the page (Icelandic) and CREDITS.md (English). */
const IN_GAME = {
  hoofStone: ['Mosi lendir á steini í vaðinu.', 'his front hooves come down on a stone of the ford'],
  stoneRock: ['Lítill steinn vaggar þegar rangur steinn er valinn.', 'a small stone rocks under a wrong tap'],
  frogSplash: ['Froskurinn á steininum stekkur út í vatnið.', 'the frog on it lands in the water'],
  wetStep: ['Mosi stígur ofan í spor Grameðlu.', 'Mosi steps into one of her prints'],
  mountainWind: ['Vindurinn í skýinu, lágt undir öllu, þar til öskrið hennar feykir því burt. Hljómar aftur og aftur.', 'the wind in the belt of cloud, a soft loop under the scene'],
  mosiRoar: ['Mosi kallar á Grameðlu með litla öskrinu sínu, þrisvar.', "Mosi's little roar in the call"],
};

/**
 * The Freesound candidates, five for each sound, as their pages give them (read 2026-11-22, .tools/kafli6/hljod-kandidatar.json):
 * the HQ preview is what is fetched and cut; `where` is where in it the sound is, when its page says.
 */
export const FREESOUND = {
  // hoofStone
  521590: { need: 'hoofStone', name: 'Hiking Boot Footsteps on Stone', author: 'Fission9', licence: 'CC0 1.0', page: 'https://freesound.org/people/Fission9/sounds/521590/', seconds: 3.549, previewKB: 57, preview: 'https://cdn.freesound.org/previews/521/521590_9395330-hq.mp3', where: 'six separate steps across 3.5 s, each followed by about 250 ms of silence (per description); cut any one' },
  733166: { need: 'hoofStone', name: 'Foot stomp 4', author: 'locky_Y', licence: 'CC0 1.0', page: 'https://freesound.org/people/locky_Y/sounds/733166/', seconds: 0.452, previewKB: 7, preview: 'https://cdn.freesound.org/previews/733/733166_13889437-hq.mp3', where: 'whole file (one stomp, 0.45 s)' },
  558477: { need: 'hoofStone', name: 'Footsteps_Mountain_Boots_Rock_Jump_Sequence_Mono.wav', author: 'Nox_Sound', licence: 'CC0 1.0', page: 'https://freesound.org/people/Nox_Sound/sounds/558477/', seconds: 9, previewKB: 144, preview: 'https://cdn.freesound.org/previews/558/558477_9250976-hq.mp3', where: 'six jump-and-land hits spread over 9 s (per description); cut one landing' },
  479689: { need: 'hoofStone', name: 'R13-17-Horse on Stone.wav', author: 'craigsmith', licence: 'CC0 1.0', page: 'https://freesound.org/people/craigsmith/sounds/479689/', seconds: 14.311, previewKB: 229, preview: 'https://cdn.freesound.org/previews/479/479689_2524442-hq.mp3', where: null },
  816801: { need: 'hoofStone', name: 'horse steps on concrete 2 edit', author: 'Luisa_Sanchez', licence: 'CC0 1.0', page: 'https://freesound.org/people/Luisa_Sanchez/sounds/816801/', seconds: 9.146, previewKB: 146, preview: 'https://cdn.freesound.org/previews/816/816801_17552599-hq.mp3', where: null },
  // stoneRock
  700535: { need: 'stoneRock', name: 'stone_slab1.wav', author: 'NistuGgner', licence: 'CC0 1.0', page: 'https://freesound.org/people/NistuGgner/sounds/700535/', seconds: 1.493, previewKB: 24, preview: 'https://cdn.freesound.org/previews/700/700535_13373037-hq.mp3', where: 'whole file (1.5 s)' },
  88496: { need: 'stoneRock', name: 'DéplacementRoche.wav', author: 'davidou', licence: 'CC0 1.0', page: 'https://freesound.org/people/davidou/sounds/88496/', seconds: 11.569, previewKB: 185, preview: 'https://cdn.freesound.org/previews/88/88496_1254234-hq.mp3', where: null },
  572754: { need: 'stoneRock', name: 'Scraping and Clunking Large Stone 1.wav', author: 'F.M.Audio', licence: 'CC BY 4.0', page: 'https://freesound.org/people/F.M.Audio/sounds/572754/', seconds: 0.705, previewKB: 11, preview: 'https://cdn.freesound.org/previews/572/572754_7805242-hq.mp3', where: 'whole file (0.7 s)' },
  574450: { need: 'stoneRock', name: 'Pushing Large Stones Down Shoreline on Stony Beach 1.wav', author: 'F.M.Audio', licence: 'CC BY 4.0', page: 'https://freesound.org/people/F.M.Audio/sounds/574450/', seconds: 0.623, previewKB: 10, preview: 'https://cdn.freesound.org/previews/574/574450_7805242-hq.mp3', where: 'whole file (0.6 s)' },
  258004: { need: 'stoneRock', name: 'Walking down the mountain river (steps stones)', author: 'DallasBass', licence: 'CC0 1.0', page: 'https://freesound.org/people/DallasBass/sounds/258004/', seconds: 10, previewKB: 160, preview: 'https://cdn.freesound.org/previews/258/258004_3968009-hq.mp3', where: null },
  // frogSplash
  499004: { need: 'frogSplash', name: '15. Frog jumping into water.wav', author: '16G_Panska_Sand_Nikolas', licence: 'CC0 1.0', page: 'https://freesound.org/people/16G_Panska_Sand_Nikolas/sounds/499004/', seconds: 3.799, previewKB: 61, preview: 'https://cdn.freesound.org/previews/499/499004_10821817-hq.mp3', where: null },
  160119: { need: 'frogSplash', name: 'Dropping tiny pebble in still water surface', author: 'jorickhoofd', licence: 'CC BY 4.0', page: 'https://freesound.org/people/jorickhoofd/sounds/160119/', seconds: 1.165, previewKB: 19, preview: 'https://cdn.freesound.org/previews/160/160119_2888453-hq.mp3', where: 'whole file (1.2 s)' },
  420227: { need: 'frogSplash', name: '37 - 2 Water drop - stone.WAV', author: '14FPanska_Nemec_Petr', licence: 'CC0 1.0', page: 'https://freesound.org/people/14FPanska_Nemec_Petr/sounds/420227/', seconds: 1.456, previewKB: 23, preview: 'https://cdn.freesound.org/previews/420/420227_8375530-hq.mp3', where: 'whole file (1.5 s)' },
  321490: { need: 'frogSplash', name: 'Tiny Splash', author: 'dslrguide', licence: 'CC0 1.0', page: 'https://freesound.org/people/dslrguide/sounds/321490/', seconds: 1.625, previewKB: 26, preview: 'https://cdn.freesound.org/previews/321/321490_5485024-hq.mp3', where: 'whole file (1.6 s)' },
  53685: { need: 'frogSplash', name: 'Ploppy_2.wav', author: 'digifishmusic', licence: 'CC BY 4.0', page: 'https://freesound.org/people/digifishmusic/sounds/53685/', seconds: 1.29, previewKB: 21, preview: 'https://cdn.freesound.org/previews/53/53685_29541-hq.mp3', where: 'whole file (1.3 s)' },
  // wetStep
  488082: { need: 'wetStep', name: 'Footsteps_Mud_Single_03.wav', author: 'BenDrain', licence: 'CC0 1.0', page: 'https://freesound.org/people/BenDrain/sounds/488082/', seconds: 0.666, previewKB: 11, preview: 'https://cdn.freesound.org/previews/488/488082_4763661-hq.mp3', where: 'whole file (0.7 s)' },
  488077: { need: 'wetStep', name: 'Footsteps_Mud_Single_01.wav', author: 'BenDrain', licence: 'CC0 1.0', page: 'https://freesound.org/people/BenDrain/sounds/488077/', seconds: 0.583, previewKB: 9, preview: 'https://cdn.freesound.org/previews/488/488077_4763661-hq.mp3', where: 'whole file (0.6 s)' },
  447928: { need: 'wetStep', name: 'Muddy Boots', author: 'Breviceps', licence: 'CC0 1.0', page: 'https://freesound.org/people/Breviceps/sounds/447928/', seconds: 0.694, previewKB: 11, preview: 'https://cdn.freesound.org/previews/447/447928_9159316-hq.mp3', where: 'whole file (0.7 s)' },
  837687: { need: 'wetStep', name: 'Single step in wet gravel and mud', author: 'Valerie-Vivegnis', licence: 'CC BY 4.0', page: 'https://freesound.org/people/Valerie-Vivegnis/sounds/837687/', seconds: 0.944, previewKB: 15, preview: 'https://cdn.freesound.org/previews/837/837687_15375955-hq.mp3', where: 'whole file (0.9 s)' },
  369579: { need: 'wetStep', name: 'Squelching Footsteps', author: 'Adielees9', licence: 'CC0 1.0', page: 'https://freesound.org/people/Adielees9/sounds/369579/', seconds: 11.5, previewKB: 184, preview: 'https://cdn.freesound.org/previews/369/369579_4800355-hq.mp3', where: null },
  // mountainWind
  459977: { need: 'mountainWind', name: 'Soft Wind', author: 'florianreichelt', licence: 'CC0 1.0', page: 'https://freesound.org/people/florianreichelt/sounds/459977/', seconds: 35.671, previewKB: 571, preview: 'https://cdn.freesound.org/previews/459/459977_6253486-hq.mp3', where: null },
  697217: { need: 'mountainWind', name: 'Looping Gentle Wind Ambience on an Open Desert Plain.wav', author: 'dhallcomposer', licence: 'CC0 1.0', page: 'https://freesound.org/people/dhallcomposer/sounds/697217/', seconds: 41.142, previewKB: 658, preview: 'https://cdn.freesound.org/previews/697/697217_7678208-hq.mp3', where: 'whole file is built as a loop (41 s)' },
  816725: { need: 'mountainWind', name: 'Wind on top of Saleve mountains Switzerland, MS', author: 'YannSauvin', licence: 'CC0 1.0', page: 'https://freesound.org/people/YannSauvin/sounds/816725/', seconds: 89.5, previewKB: 1432, preview: 'https://cdn.freesound.org/previews/816/816725_6921828-hq.mp3', where: null },
  718973: { need: 'mountainWind', name: 'Chergui wind in Agadir', author: 'clement.bernardeau', licence: 'CC0 1.0', page: 'https://freesound.org/people/clement.bernardeau/sounds/718973/', seconds: 145.43, previewKB: 2327, preview: 'https://cdn.freesound.org/previews/718/718973_10386277-hq.mp3', where: null },
  454360: { need: 'mountainWind', name: 'wind light calm soft breeze deep big gusty.flac', author: 'kyles', licence: 'CC0 1.0', page: 'https://freesound.org/people/kyles/sounds/454360/', seconds: 75.557, previewKB: 1209, preview: 'https://cdn.freesound.org/previews/454/454360_612689-hq.mp3', where: null },
  // mosiRoar
  860984: { need: 'mosiRoar', name: 'Bovines - Cattle; Calf Bawling, Single', author: 'TheKingOfGeeks360', licence: 'CC0 1.0', page: 'https://freesound.org/people/TheKingOfGeeks360/sounds/860984/', seconds: 1.672, previewKB: 27, preview: 'https://cdn.freesound.org/previews/860/860984_15895934-hq.mp3', where: 'whole file (1.7 s)' },
  707955: { need: 'mosiRoar', name: 'Short Moo from a Calf', author: 'OpenWindow_2023_Group_14', licence: 'CC BY 4.0', page: 'https://freesound.org/people/OpenWindow_2023_Group_14/sounds/707955/', seconds: 1.6, previewKB: 26, preview: 'https://cdn.freesound.org/previews/707/707955_15362740-hq.mp3', where: 'whole file (1.6 s)' },
  876918: { need: 'mosiRoar', name: 'Cute Angry Dog Sound', author: 'qubodup', licence: 'CC0 1.0', page: 'https://freesound.org/people/qubodup/sounds/876918/', seconds: 1.377, previewKB: 22, preview: 'https://cdn.freesound.org/previews/876/876918_71257-hq.mp3', where: 'whole file (1.4 s)' },
  372537: { need: 'mosiRoar', name: 'Dog Shih Tzu Growling 03.wav', author: 'Glitchedtones', licence: 'CC0 1.0', page: 'https://freesound.org/people/Glitchedtones/sounds/372537/', seconds: 1.254, previewKB: 20, preview: 'https://cdn.freesound.org/previews/372/372537_3294528-hq.mp3', where: 'whole file (1.3 s)' },
  677220: { need: 'mosiRoar', name: 'Nigerian Dwarf Buck Goat', author: 'satoristudios3', licence: 'CC0 1.0', page: 'https://freesound.org/people/satoristudios3/sounds/677220/', seconds: 1.428, previewKB: 23, preview: 'https://cdn.freesound.org/previews/677/677220_14166079-hq.mp3', where: 'whole file (1.4 s)' },
};
const LICENCE_URL = {
  'CC0 1.0': 'creativecommons.org/publicdomain/zero/1.0',
  'CC BY 4.0': 'creativecommons.org/licenses/by/4.0',
  'CC BY 3.0': 'creativecommons.org/licenses/by/3.0',
};

const ROAR = 'close and dry, one short call. No music, no words, no other animals, no echo, no wind.';
/**
 * The candidate takes of Mosi's little roar (a character's sound, not a physical one): a small, friendly young triceratops trying to
 * roar, thin, squeaky and funny, never fierce.
 */
export const TAKES = [
  { id: 'mosi-roar-1', need: 'mosiRoar', seconds: 1.4, influence: 0.6, text: `A small friendly baby triceratops tries its very best to roar: a thin, squeaky little "rraah" that cracks upward at the end, funny and harmless, ${ROAR}` },
  { id: 'mosi-roar-2', need: 'mosiRoar', seconds: 1.3, influence: 0.6, text: `A tiny young horned dinosaur gives a brave but squeaky little roar, like a puppy trying to growl like a lion: high, thin, a little wobbly and cute, ${ROAR}` },
  { id: 'mosi-roar-3', need: 'mosiRoar', seconds: 1.5, influence: 0.6, text: `A little plant-eating dinosaur with a beak calls out as loud as it can, but it comes out as a small honking squeak with a gravelly start, funny and kind, not scary, ${ROAR}` },
];

// ---- The owner's picks (qa/remake/kafli6/hljod/hljod-val.json), once he has made them ----

const ELEVEN = 'ElevenLabs sound generation, made for this game';
const eleven = take => ({ from: `${CANDIDATES}/eleven/${take}.raw.mp3`, source: { kind: 'ElevenLabs', licence: ELEVEN, take, prompt: `${CANDIDATES}/eleven/${take}.json` } });
const free = (id, cut) => ({ from: `${CANDIDATES}/freesound/${id}/${id}.mp3`, cut, source: { kind: 'Freesound', id: Number(id), ...withoutNotes(FREESOUND[id]) } });
const withoutNotes = ({ need, where, previewKB, seconds, ...source }) => source;
/**
 * Each shipped file (named <sample>-<n>.mp3): its sample, what it is in the game, its source and, for a Freesound recording, the cut
 * ([from, to] s of the preview); `loop: true` for the wind (cut into a seamless loop over `cross` s). For example:
 *   'hoofStone-1.mp3': { sample: 'hoofStone', ...free(521590, [0.12, 0.42]) },
 *   'mountainWind-1.mp3': { sample: 'mountainWind', loop: true, cross: 1.5, ...free(697217, [2, 32]) },
 *   'mosiRoar-1.mp3': { sample: 'mosiRoar', ...eleven('mosi-roar-2') },
 */
export const PICKS = {};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
const lengthOf = file => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
function peakOf(file) {
  const out = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return Number(/max_volume: (-?[\d.]+) dB/.exec(out)?.[1] ?? 0);
}

/**
 * A seamless loop from `raw`: its `cut` ([from, to] s), the last `cross` s laid over the first with equal-power fades (so its end runs
 * on into its start), its peak at SHOT_PEAK, mono 44.1 kHz mp3 at 96 kbps. Its length (s): to - from - cross.
 */
export function loopForGame(raw, out, { cut, cross = 1.5 }) {
  const [from, to] = cut;
  const length = to - from;
  if (length <= cross * 2) throw new Error(`a loop of ${length} s cannot cross over ${cross} s`);
  const temp = `${out}.loop.wav`;
  const graph = [
    `[0]atrim=${from}:${to},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,asplit=3[a][b][c]`,
    `[a]atrim=0:${cross},asetpts=PTS-STARTPTS,afade=t=in:d=${cross}:curve=qsin[head]`,
    `[b]atrim=${length - cross}:${length},asetpts=PTS-STARTPTS,afade=t=out:d=${cross}:curve=qsin[end]`,
    `[head][end]amix=inputs=2:normalize=0[joined]`,
    `[c]atrim=${cross}:${length - cross},asetpts=PTS-STARTPTS[body]`,
    `[joined][body]concat=n=2:v=0:a=1[out]`,
  ].join(';');
  ffmpeg(['-i', raw, '-filter_complex', graph, '-map', '[out]', '-ar', '44100', temp]);
  const gain = SHOT_PEAK - peakOf(temp);
  ffmpeg(['-i', temp, '-af', `volume=${gain.toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', out]);
  fs.rmSync(temp);
  return lengthOf(out);
}

/** The candidates `only` names (a need, or ids), or all of them. */
function chosen(only) {
  const all = Object.entries(FREESOUND);
  if (!only) return all;
  return all.filter(([id, sound]) => only.includes(id) || only.includes(sound.need));
}

/**
 * Fetches the HQ previews of the candidates into qa/remake/kafli6/hljod/freesound/<id>/ (with source.json), each only after its page
 * is read and shows the licence named above and no other; a page that shows another stops the tool before that file is fetched.
 */
async function fetchCandidates(only) {
  const headers = { 'user-agent': AGENT };
  const list = chosen(only);
  if (!list.length) throw new Error(`--only ${only}: no candidate is a need or an id of these`);
  let first = true;
  for (const [id, sound] of list) {
    const folder = path.join(ROOT, CANDIDATES, 'freesound', id);
    const file = path.join(folder, `${id}.mp3`);
    if (fs.existsSync(file)) {
      console.log(`${id}: there already`);
      continue;
    }
    if (!first) await sleep(BETWEEN);
    first = false;
    const html = await (await fetch(sound.page, { headers, signal: AbortSignal.timeout(TIMEOUT) })).text();
    const shown = [...new Set([...html.matchAll(/creativecommons\.org\/(?:publicdomain\/zero|licenses\/[a-z-]+)\/[\d.]+/g)].map(m => m[0]))];
    if (!shown.includes(LICENCE_URL[sound.licence]) || shown.length !== 1) throw new Error(`${id} (${sound.name}): its page shows ${shown.join(', ') || 'no licence'}, not only ${sound.licence}; nothing of it was fetched`);
    await sleep(BETWEEN);
    const answer = await fetch(sound.preview, { headers, signal: AbortSignal.timeout(TIMEOUT) });
    if (!answer.ok) throw new Error(`${id}: the preview answered ${answer.status}`);
    const bytes = Buffer.from(await answer.arrayBuffer());
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(file, bytes);
    fs.writeFileSync(path.join(folder, 'source.json'), `${JSON.stringify({ id: Number(id), ...sound, licenceUrl: `https://${LICENCE_URL[sound.licence]}/`, fetched: new Date().toISOString() }, null, 2)}\n`);
    console.log(`${id} [${sound.need}]: ${sound.name}, ${sound.author}, ${sound.licence}, ${(bytes.length / 1024).toFixed(0)} KB`);
  }
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

// ---- The listening page ----

const safe = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const comma = (n, digits = 1) => Number(n).toFixed(digits).replace('.', ',');

/** The candidates whose files are on disk, by need: { need: [{ id, kind, label, src, meta }] }. */
export function candidatesOnDisk(root = ROOT) {
  const found = Object.fromEntries(Object.keys(NEEDS).map(need => [need, []]));
  for (const [id, sound] of Object.entries(FREESOUND)) {
    const rel = `freesound/${id}/${id}.mp3`;
    if (!fs.existsSync(path.join(root, CANDIDATES, rel))) continue;
    const kb = fs.statSync(path.join(root, CANDIDATES, rel)).size / 1024;
    found[sound.need].push({
      id: `fs-${id}`, kind: 'freesound', label: sound.name, src: rel,
      meta: `Eftir ${safe(sound.author)}, ${safe(sound.licence)}, ${comma(sound.seconds)} s, ${kb.toFixed(0)} KB. <a href="${safe(sound.page)}" target="_blank" rel="noopener">Síðan á Freesound</a>.`,
    });
  }
  for (const take of TAKES) {
    const rel = `eleven/${take.id}.mp3`;
    if (!fs.existsSync(path.join(root, CANDIDATES, rel))) continue;
    found[take.need].push({ id: `eleven-${take.id}`, kind: 'eleven', label: `Búið til: ${take.id}`, src: rel, meta: 'Búið til hér með ElevenLabs, fyrir leikinn.' });
  }
  return found;
}

/** The page: each sound its heading, its candidates (a play button, the name, author and licence, a radio), "none", and a note. */
export function pageHtml(found) {
  const total = Object.values(found).reduce((n, list) => n + list.length, 0);
  const sections = Object.entries(NEEDS).map(([need, heading], k) => {
    const list = found[need];
    const rows = list.map(c => `
    <div class="row">
      <button data-src="${safe(c.src)}">▶ Spila</button>
      <label><input type="radio" name="${need}" value="${safe(c.id)}">${safe(c.label)}</label>
      <div class="meta">${c.meta}</div>
    </div>`).join('');
    return `
<section data-need="${need}"><h2>${k + 1}. ${safe(heading)}</h2>
  <p class="hint">${safe(IN_GAME[need][0])}</p>
  ${list.length ? '' : '<p class="empty">Engin sýnishorn komin enn.</p>'}${rows}
  <div class="row"><span class="none"></span><label><input type="radio" name="${need}" value="ekkert">Ekkert af þessum</label></div>
  <textarea data-need="${need}" placeholder="Athugasemd (má sleppa)"></textarea>
</section>`;
  }).join('');
  return `<!doctype html><html lang="is"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hljóð kafla 6</title>
<style>
  :root { --ink: #2b2a26; --soft: #6b665a; --line: #e3dccb; --paper: #fbf8f1; --card: #fff; --accent: #355774; }
  body { font: 16px/1.45 system-ui, sans-serif; margin: 0 auto; max-width: 900px; padding: 16px; background: var(--paper); color: var(--ink); }
  h1 { font-size: 1.5em; margin: 8px 0; } h2 { font-size: 1.15em; margin: 0 0 4px; }
  ol { padding-left: 1.3em; } li { margin: 2px 0; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 12px 0; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 7px 0; border-top: 1px solid #f0ebe0; }
  .row label { flex: 1 1 270px; } .row label input { margin-right: 6px; }
  .none { width: 72px; }
  .meta { color: var(--soft); font-size: .88em; flex-basis: 100%; padding-left: 84px; }
  .meta a { color: var(--accent); }
  .hint { color: var(--soft); font-size: .92em; margin: 2px 0 6px; } .empty { color: var(--soft); font-style: italic; }
  .notice { background: #fff4d6; border: 1px solid #e8d49a; border-radius: 10px; padding: 10px 14px; }
  button { font: inherit; padding: 5px 12px; border-radius: 7px; border: 1px solid #c9c0aa; background: #f6f1e4; color: var(--ink); cursor: pointer; }
  button:hover { background: #efe6d1; }
  button.big { font-size: 1.1em; padding: 10px 22px; border: 0; background: var(--accent); color: #fff; }
  button.big:hover { background: #2b4860; }
  textarea { width: 100%; box-sizing: border-box; margin-top: 8px; min-height: 2.4em; font: inherit; }
  #saved { margin-left: 12px; color: var(--accent); }
  .sticky { position: sticky; bottom: 0; background: var(--paper); padding: 10px 0; border-top: 1px solid var(--line); }
  @media (max-width: 600px) { .row label { flex-basis: 60%; } .meta { padding-left: 0; } }
</style></head><body>
<h1>Hljóðin í kafla 6</h1>
<p>Sex hljóð í ferðinni upp á fjallið til Grameðlu. Hvert þeirra er nú búið til með kóða í leiknum; þau sem þú velur hér koma í
staðinn, tekin upp í alvöru.</p>
<ol>
  <li>Ýttu á „▶ Spila“ til að heyra hvert hljóð.</li>
  <li>Veldu eitt við hvert hljóð, eða „Ekkert af þessum“ ef ekkert passar. Skrifaðu athugasemd ef þú vilt, til dæmis hvaða bút.</li>
  <li>Ýttu á „Vista val“ neðst. Þá vistast skráin <b>hljod-val.json</b> í niðurhalsmöppunni þinni. Segðu mér bara þegar hún er komin.</li>
</ol>
${total ? '' : '<p class="notice">Engin hljóð eru komin á diskinn enn: síðan sýnir þau um leið og þau hafa verið sótt.</p>'}
${sections}
<p class="sticky"><button id="save" class="big">Vista val</button> <button id="stop">■ Stöðva</button><span id="saved"></span></p>
<script>
let playing = null;
const stop = () => { if (playing) { playing.pause(); playing = null; } };
for (const button of document.querySelectorAll('button[data-src]')) {
  button.onclick = () => {
    stop();
    playing = new Audio(button.dataset.src);
    playing.play().catch(error => { document.getElementById('saved').textContent = 'Villa: ' + error.message; });
  };
}
document.getElementById('stop').onclick = stop;
document.getElementById('save').onclick = () => {
  const picks = [...document.querySelectorAll('input[type=radio]:checked')].map(input => input.name + ':' + input.value);
  const notes = Object.fromEntries([...document.querySelectorAll('textarea')].filter(t => t.value.trim()).map(t => [t.dataset.need, t.value.trim()]));
  const choice = { picks, notes, saved: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(choice, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'hljod-val.json' });
  a.click();
  const none = picks.filter(p => p.endsWith(':ekkert')).length;
  document.getElementById('saved').textContent = (picks.length - none) + ' hljóð valin' + (none ? ', ' + none + ' án vals' : '') + '; hljod-val.json var vistuð.';
};
</script></body></html>
`;
}

function buildPage() {
  const found = candidatesOnDisk();
  const folder = path.join(ROOT, CANDIDATES);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'index.html'), pageHtml(found));
  for (const [need, list] of Object.entries(found)) console.log(`${need}: ${list.length} on the page`);
  console.log(`${CANDIDATES}/index.html (http://localhost:4340/${CANDIDATES}/index.html)`);
}

// ---- Mastering the picks ----

/** Masters each pick into OUT, writes sounds.json and kafli6/CREDITS.md from the same list, and prints sfx.js's KAFLI6_PICKED. */
function masterPicks({ only = null } = {}) {
  if (!Object.keys(PICKS).length) {
    console.log('No picks yet (PICKS is empty): nothing was mastered and CREDITS.md is as it was.');
    return;
  }
  const folder = path.join(ROOT, OUT);
  fs.mkdirSync(folder, { recursive: true });
  const listFile = path.join(folder, 'sounds.json');
  const old = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')).files ?? {} : {};
  const files = {};
  for (const [name, pick] of Object.entries(PICKS)) {
    if (!Object.hasOwn(NEEDS, pick.sample)) throw new Error(`${name}: ${pick.sample} is not one of ${Object.keys(NEEDS).join(', ')}`);
    const out = path.join(folder, name);
    if (only && !only.includes(name) && old[name] && fs.existsSync(out)) {
      files[name] = old[name];
      continue;
    }
    const raw = path.join(ROOT, pick.from);
    const seconds = pick.loop
      ? loopForGame(raw, out, { cut: pick.cut, cross: pick.cross })
      : trimForPage(raw, out, { cut: pick.cut ?? null, fadeIn: pick.fadeIn, fadeOut: pick.fadeOut, bitrate: '96k' });
    const { from, cut, fadeIn, fadeOut, cross, ...kept } = pick;
    files[name] = { ...kept, what: pick.what ?? IN_GAME[pick.sample][1], seconds: Number(seconds.toFixed(3)), ...(cut ? { cut } : {}) };
    console.log(`${name}: ${seconds.toFixed(2)} s${pick.loop ? ' (a loop)' : ''}`);
  }
  const about = 'Chapter 6\'s recorded sounds (tools/kafli6-sounds.mjs): the owner\'s picks, each with its sample in engine/audio/sfx.js, its source and its cut.';
  fs.writeFileSync(listFile, `${JSON.stringify({ about, files }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, CREDITS), credits(files));
  const wired = {};
  for (const [name, entry] of Object.entries(files)) (wired[entry.sample] ??= []).push(name);
  console.log('\nengine/audio/sfx.js, KAFLI6_PICKED:');
  console.log(`export const KAFLI6_PICKED = ${JSON.stringify(wired, null, 2).replace(/"(\w+)":/g, '$1:').replaceAll('"', "'")};`);
}

export function credits(files) {
  const attributed = [...new Set(Object.values(files).filter(e => e.source.kind === 'Freesound' && /CC BY/.test(e.source.licence)).map(e => e.source.id))].map(id => FREESOUND[id]);
  const byUrl = id => `https://${LICENCE_URL[id]}/`;
  const sourceOf = entry => (entry.source.kind === 'Freesound'
    ? `"${entry.source.name}" by ${entry.source.author}, ${entry.source.page}${entry.cut ? ` (${entry.cut[0]}–${entry.cut[1]} s of its preview)` : ''}`
    : `ElevenLabs take ${entry.source.take}, generated by ElevenLabs sound generation for this game`);
  const lines = [
    '# Recorded sounds in chapter 6',
    '',
    'The sounds of Boð til Grameðlu (engine/audio/sfx.js `SAMPLES`). Physical sounds are real recordings from Freesound under CC0 or CC BY,',
    'picked by the owner by ear on the listening page (qa/remake/kafli6/hljod/index.html, which saves hljod-val.json);',
    '`node remake/tools/kafli6-sounds.mjs` cuts and levels them into `hljod/` and writes this file from the same list. Until a sound is',
    'picked, its made sound plays in its place (engine/audio/sfx.js).',
    '',
    '## Her footfall',
    '',
    '`gramedlaThump` is "Grameðla kemur!"\'s footfall (`assets/audio/gramedla3d/hljod/thump.mp3`, credited in',
    '`assets/audio/gramedla3d/CREDITS.md`), played at her distance in the call and as she steps out and tramps up:',
    '',
    '| File | In the game | Source | Licence |',
    '|---|---|---|---|',
    '| `../gramedla3d/hljod/thump.mp3` | her footfall: far in the call, near as she steps out of the cloud and tramps up | "giant footsteps.mp3" by Beefmaster69, https://freesound.org/s/531725/ (1.31–2.07 s of its preview) | CC0 1.0 |',
    '',
    'CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/): no credit is asked; it is given here all the same.',
    '',
    'Her roar and her breath are chapter 2\'s recordings (`assets/audio/kafli2/CREDITS.md`).',
    '',
    '## The owner\'s picks',
    '',
    ...(attributed.length ? ['Those that ask for credit:', '', ...attributed.map(s => `- "${s.name}" by ${s.author} (${s.page}), licensed under ${s.licence} (${byUrl(s.licence)}); cut and levelled.`), ''] : []),
    '| File | In the game | Source | Licence |',
    '|---|---|---|---|',
    ...Object.entries(files).map(([name, entry]) => `| \`hljod/${name}\` | ${entry.what} | ${sourceOf(entry)} | ${entry.source.licence} |`),
    '',
  ];
  return lines.join('\n');
}

function list() {
  let need = null;
  for (const [id, s] of Object.entries(FREESOUND).sort((a, b) => Object.keys(NEEDS).indexOf(a[1].need) - Object.keys(NEEDS).indexOf(b[1].need))) {
    if (s.need !== need) console.log(`\n${(need = s.need)} (${NEEDS[need]})`);
    console.log(`  ${id}: "${s.name}" by ${s.author}, ${s.licence}, ${s.seconds} s, preview ${s.previewKB} KB${s.where ? `; ${s.where}` : ''}\n    ${s.page}`);
  }
  const kb = Object.values(FREESOUND).reduce((n, s) => n + s.previewKB, 0);
  console.log(`\n${Object.keys(FREESOUND).length} previews, ${(kb / 1024).toFixed(1)} MB in all`);
  console.log('\nElevenLabs takes (--takes):');
  for (const t of TAKES) console.log(`  ${t.id} [${t.need}] (${t.seconds} s, influence ${t.influence}): ${t.text}`);
  console.log(`\nPICKS: ${Object.keys(PICKS).length ? Object.keys(PICKS).join(', ') : 'none yet'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
  if (argv.includes('--list')) list();
  else if (argv.includes('--takes')) await takes({ only, force: argv.includes('--force') });
  else if (argv.includes('--fetch')) await fetchCandidates(only);
  else if (argv.includes('--page')) buildPage();
  else masterPicks({ only });
}
