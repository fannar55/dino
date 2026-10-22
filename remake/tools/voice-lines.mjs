#!/usr/bin/env node
// Voices the remake's chapters and book with ElevenLabs Eleven v3, the way scripts/generate-narration.mjs voices the game:
//   node remake/tools/voice-lines.mjs [--set book|eitt|hals|kafli2] [--only id,id]   make the lines of assets/audio/<set>/lines-source.json (all, or just these)
//   node remake/tools/voice-lines.mjs --audition kambedla    one sample line per candidate voice, in qa/remake/voices/, to choose from
//   node remake/tools/voice-lines.mjs --audition egill
//   node remake/tools/voice-lines.mjs --audition narrator
// (needs ffmpeg and ffprobe on the PATH, and ELEVENLABS_API_KEY in the environment)
//
// The lines come in sets (audio-lines.mjs SETS), each with a lines-source.json in a folder of its own: kafli1, the chapter's, which
// is made unless --set says otherwise, book, the narrator's reading of the education cards, eitt, Kambeðla's and Mosi's lines at
// her card game "Eitt!" (with her invitation to it, k1_kambedla_play, which the chapter reads at its end), hals, the lines of Háls og
// hali, and kafli2, chapter 2's (Mosi's, Egill's, Þórseðla's and Kambeðla's goodbye). Everything below holds for
// the lines of any set, and --only names lines of the set that is made. A candidate for --audition speaks a line of the set it names
// (the narrator's is in book); --set may be given with --audition only to repeat that set.
//
// lines-source.json is a list of { "id": "k1_mosi_waving", "speaker": "mosi", "text": "..." } (and optional "seed", "kept", below): in
// kafli1 the id is k1_<speaker>_<short>, in book book_<card>_<page> or book_<what>, in eitt eitt_<short> or eitt_mosi_<short>, in hals hals_<speaker>_<short> or hals_fossil_<kind>,
// in kafli2 k2_<speaker>_<short>. A line becomes <set>/<id>.mp3, mastered like the game's narration (mono, 44.1 kHz, 96 kbps, about
// -18 LUFS, a quarter second of silence after the voice), and lines.json learns its src, exact duration and mouth (audio-lines.mjs
// makes the same entries for the game's own lines). Lines are approved before they are made: voices.json names a voice for each speaker, null until the owner has chosen it
// (the narrator has no entry until then), and a speaker without a voice stops the run before any request.
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
import { VOICE_LINES } from '../engine/yatzy-junior/voice-lines.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Where the lines to speak of a set (the chapter's unless told another) are written, relative to the repo root. */
const sourceOf = set => `${setFolder(set)}/lines-source.json`;
const VOICES = 'remake/assets/audio/voices.json';
export const LEXICON = 'remake/assets/audio/pronunciation.json';
const CACHE = '.tools/elevenlabs-remake';
const AUDITIONS = 'qa/remake/voices';
/** Litla Yatzy's Mosi lines: made by tools/yatzy-junior-voices.mjs, from engine/yatzy-junior/voice-lines.js, with the same lexicon. */
export const JUNIOR = 'yatzy-junior';
const JUNIOR_FOLDER = 'remake/assets/audio/yatzy-junior';

const API = 'https://api.elevenlabs.io/v1/text-to-speech';
const OUTPUT_FORMAT = 'mp3_44100_128';
const TIMEOUT = 120000; // ms for one request
export const MODEL = 'eleven_v4'; // the owner's choice (2026-10-18): v4 reads Icelandic best; chapter 1's lines were made with v3
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

/**
 * Everything that decides how a take sounds, hashed: the same request never costs credits twice, and any change asks again.
 * `text` is the text sent (the lexicon's `say`, not the caption) and `context` the previous_text sent with it, so a changed
 * recipe is a new key. A request without context or seed hashes as it always did, so the takes made before the lexicon still count.
 */
export function cacheKey({ text, voiceId, model = MODEL, settings = SETTINGS, seed, context }) {
  const decides = { text, voiceId, model, language: LANGUAGE, settings, ...(seed === undefined ? {} : { seed }), ...(context === undefined ? {} : { previous_text: context }) };
  return createHash('sha256').update(JSON.stringify(decides)).digest('hex');
}

// ---------------------------------------------------------------------------------------------
// The pronunciation standard

const LETTER = '\\p{L}\\p{N}';
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isSeed = seed => Number.isInteger(seed) && seed >= 0 && seed <= 4294967295;
const isText = value => typeof value === 'string' && value.trim().length > 0;
/** A pattern that finds these forms as whole words (case-sensitive; a letter or digit on either side is another word). */
export const formsPattern = (forms, flags = 'u') => new RegExp(`(?<![${LETTER}])(?:${[...forms].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})(?![${LETTER}])`, flags);

/** Checks the lexicon before a credit is spent (see the header): a wrong entry stops the run. Returns it. */
export function checkLexicon(lexicon) {
  const fail = why => { throw new Error(`${LEXICON}: ${why} No request was made.`); };
  const words = lexicon?.words;
  if (!words || typeof words !== 'object' || Array.isArray(words)) fail('needs "words", one entry per hard word.');
  const owner = new Map();
  for (const [id, entry] of Object.entries(words)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(`${JSON.stringify(id)} is not a word id (a-z, 0-9 and -).`);
    if (!isText(entry?.word)) fail(`${id} needs a "word".`);
    if (!isText(entry.stem)) fail(`${id} needs a "stem".`);
    const stem = new RegExp(`^(?:${entry.stem})`, 'u');
    if (!Array.isArray(entry.forms) || !entry.forms.length) fail(`${id} needs its "forms".`);
    for (const form of entry.forms) {
      if (typeof form !== 'string' || !/^\p{L}+$/u.test(form)) fail(`${id}: ${JSON.stringify(form)} is not one word.`);
      if (!stem.test(form)) fail(`${id}: ${form} does not fit the stem ${entry.stem}.`);
      if (owner.has(form)) fail(`${form} is a form of both ${owner.get(form)} and ${id}.`);
      owner.set(form, id);
    }
    if (entry.except !== undefined && !(Array.isArray(entry.except) && entry.except.every(isText))) fail(`${id}: "except" is a list of words.`);
    if (!entry.recipes || typeof entry.recipes !== 'object' || !Object.keys(entry.recipes).length) fail(`${id} needs "recipes".`);
    for (const [name, recipe] of Object.entries(entry.recipes)) {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) fail(`${id}: ${JSON.stringify(name)} is not a recipe name (a-z, 0-9 and -).`);
      const unknown = Object.keys(recipe ?? {}).filter(key => !['say', 'context', 'seed', 'note'].includes(key));
      if (unknown.length) fail(`${id}.${name}: unknown ${unknown.join(', ')}.`);
      if (!isText(recipe.note)) fail(`${id}.${name} needs a "note" for the owner.`);
      if (recipe.say !== undefined) {
        if (typeof recipe.say === 'object' && recipe.say !== null) {
          const keys = Object.keys(recipe.say);
          if (keys.length !== entry.forms.length || !entry.forms.every(form => isText(recipe.say[form]))) fail(`${id}.${name}: "say" gives a text for every form (${entry.forms.join(', ')}).`);
        } else if (!isText(recipe.say)) fail(`${id}.${name}: "say" is a text, or one per form.`);
      }
      if (recipe.context !== undefined && !isText(recipe.context)
        && !(typeof recipe.context === 'object' && recipe.context !== null && Object.entries(recipe.context).every(([who, text]) => /^([a-z]+|\*)$/.test(who) && isText(text)))) {
        fail(`${id}.${name}: "context" is a sentence, or one per speaker ("*" for the rest).`);
      }
      if (recipe.seed !== undefined && !isSeed(recipe.seed)) fail(`${id}.${name}: seed is a whole number from 0 to 4294967295.`);
    }
    if (entry.chosen !== null && !Object.hasOwn(entry.recipes, entry.chosen ?? '')) fail(`${id}: "chosen" is one of its recipes, or null.`);
    if (entry.audition !== undefined) {
      const pattern = formsPattern(entry.forms);
      for (const [who, sentence] of Object.entries(entry.audition)) {
        if (!/^[a-z]+$/.test(who) || !isText(sentence) || !pattern.test(sentence)) fail(`${id}: an "audition" is speaker -> a sentence with the word.`);
      }
    }
  }
  return lexicon;
}

/** The lexicon of a repo root, checked. Without it the tool sends nothing. */
export function readLexicon(root) {
  const file = path.join(root, LEXICON);
  if (!fs.existsSync(file)) throw new Error(`${LEXICON} is missing: no line is sent without the pronunciation standard. No request was made.`);
  return checkLexicon(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** A recipe's context for a speaker: its sentence, the speaker's own, or the one for the rest ("*"). */
const contextOf = (recipe, speaker) => (typeof recipe.context === 'object' ? recipe.context[speaker] ?? recipe.context['*'] : recipe.context);

/**
 * The lexicon applied to a text a speaker says: `say` is the text to send, each form of a word with a chosen recipe replaced by
 * the recipe's `say` (a context-only recipe leaves it as it is), `context` the previous_text to send with it (the chosen contexts
 * of the words in the order they occur, joined into one), `seed` the first seed a chosen recipe fixes, and `words` what was found
 * ({ id, word, forms, recipe }: recipe null when the owner has not picked yet, and the word is sent as written). Pure: the text
 * itself, which the child sees, is never changed.
 */
export function applyLexicon(text, { speaker, lexicon }) {
  const words = lexicon?.words ?? {};
  const owner = new Map();
  for (const [id, entry] of Object.entries(words)) for (const form of entry.forms) owner.set(form, id);
  const found = [];
  if (!owner.size) return { say: text, context: undefined, seed: undefined, words: found };
  const say = text.replace(formsPattern(owner.keys(), 'gu'), form => {
    const id = owner.get(form);
    const entry = words[id];
    const recipe = entry.chosen == null ? null : entry.recipes[entry.chosen] ?? null;
    let seen = found.find(item => item.id === id);
    if (!seen) found.push(seen = { id, word: entry.word, forms: [], recipe: recipe ? entry.chosen : null });
    if (!seen.forms.includes(form)) seen.forms.push(form);
    if (!recipe || recipe.say === undefined) return form;
    return typeof recipe.say === 'string' ? recipe.say : recipe.say[form] ?? form;
  });
  const contexts = [];
  let seed;
  for (const { id, recipe: name } of found) {
    if (!name) continue;
    const recipe = words[id].recipes[name];
    const context = recipe.context === undefined ? undefined : contextOf(recipe, speaker);
    if (context && !contexts.includes(context)) contexts.push(context);
    if (seed === undefined && recipe.seed !== undefined) seed = recipe.seed;
  }
  return { say, context: contexts.length ? contexts.join(' ') : undefined, seed, words: found };
}

/** What is sent for a line: the lexicon applied to its text, unless the line carries its own `say`, `context` or `seed`. */
export function requestFor(line, lexicon) {
  const applied = applyLexicon(line.text, { speaker: line.speaker, lexicon });
  return {
    text: line.say ?? applied.say,
    context: line.context ?? applied.context,
    seed: line.seed ?? applied.seed,
    words: applied.words,
    own: ['say', 'context', 'seed'].filter(field => line[field] !== undefined),
  };
}

const USAGE = `Usage: voice-lines.mjs [--set ${Object.keys(SETS).join('|')}] [--only id,id] [--dry]
       voice-lines.mjs --dry --set all|${JUNIOR}
       voice-lines.mjs --audition ${Object.keys(CANDIDATES).join('|')}
       voice-lines.mjs --book <word|all> [--dry]  |  --pick picks.json  |  --plan  |  --ab <set|${JUNIOR}> [--only id,id]`;

/**
 * The command line: { only, audition, set }, and, when given, `dry` (true), `book` (a word or "all"), `pick` (a file), `plan`
 * (true) or `ab` (a set). `set` is the line set that is made (the chapter's unless told another); with --dry it may also be "all"
 * or yatzy-junior.
 */
export function parseArgs(argv) {
  const args = { only: null, audition: null, set: 'kafli1' };
  let named = false; // whether --set was given
  const value = (i, flag, what) => {
    const next = argv[i];
    if (next === undefined || next.startsWith('--') || !next.trim()) throw new Error(`${flag} needs ${what}.`);
    return next;
  };
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
      if (!Object.hasOwn(SETS, args.set ?? '') && !['all', JUNIOR].includes(args.set)) throw new Error(`--set needs ${Object.keys(SETS).join(' or ')} (or, with --dry, all or ${JUNIOR}).`);
    } else if (arg === '--dry') {
      args.dry = true;
    } else if (arg === '--book') {
      args.book = value(++i, '--book', 'a word of the lexicon, or all');
    } else if (arg === '--pick') {
      args.pick = value(++i, '--pick', 'the picks.json the pronunciation book saved');
    } else if (arg === '--plan') {
      args.plan = true;
    } else if (arg === '--ab') {
      args.ab = value(++i, '--ab', `a line set (${Object.keys(SETS).join(', ')} or ${JUNIOR})`);
      if (!Object.hasOwn(SETS, args.ab) && args.ab !== JUNIOR) throw new Error(`--ab needs ${Object.keys(SETS).join(' or ')} or ${JUNIOR}.`);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
    }
  }
  const commands = ['audition', 'book', 'pick', 'plan', 'ab'].filter(name => args[name]);
  if (commands.length > 1) throw new Error(`--${commands.join(' and --')} do not go together.`);
  if (args.audition && args.only) throw new Error('--audition and --only do not go together.');
  if (args.audition && named && args.set !== setOf(args.audition)) throw new Error(`--audition ${args.audition} speaks a line of the ${setOf(args.audition)} set, so --set can only repeat that.`);
  if (args.dry && (args.audition || args.pick || args.plan || args.ab)) throw new Error('--dry goes with making lines or the book; --audition, --pick, --plan and --ab say what they do without it.');
  if ((args.book || args.pick || args.plan || args.ab) && named) throw new Error('--book, --pick, --plan and --ab cover every set: --set does not go with them.');
  if ((args.book || args.pick || args.plan) && args.only) throw new Error('--only goes with making lines, --dry and --ab.');
  if (['all', JUNIOR].includes(args.set) && !args.dry) throw new Error(`--set ${args.set} only goes with --dry: Litla Yatzy's lines are made by remake/tools/yatzy-junior-voices.mjs.`);
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
    for (const field of ['say', 'context']) {
      if (line[field] !== undefined && !isText(line[field])) throw new Error(`${line.id}: ${field} is the text to send in place of the lexicon's.`);
    }
  }
  return lines;
}

/** The lines of a set as { set, id, speaker, text, ... }; yatzy-junior's from Litla Yatzy's script (Mosi speaks them all). */
export function linesOf(root, set, junior = VOICE_LINES) {
  if (set === JUNIOR) return Object.entries(junior).map(([id, line]) => ({ set, id, speaker: 'mosi', text: line.text, ...(line.seed === undefined ? {} : { seed: line.seed }) }));
  return readLines(root, set).map(line => ({ set, ...line }));
}

/** Every line any voice says: the five sets, then Litla Yatzy's (or `junior`, for a test). */
export function allLines(root, junior = VOICE_LINES) {
  return [...Object.keys(SETS).filter(set => fs.existsSync(path.join(root, sourceOf(set)))).flatMap(set => linesOf(root, set)), ...linesOf(root, JUNIOR, junior)];
}

/** Where a set's MP3s are: its folder, or Litla Yatzy's. */
const folderOf = set => (set === JUNIOR ? JUNIOR_FOLDER : setFolder(set));

function readVoices(root) {
  return JSON.parse(fs.readFileSync(path.join(root, VOICES), 'utf8'));
}

// ---------------------------------------------------------------------------------------------
// ElevenLabs

/** Hides the key wherever a server or the network might have repeated it. */
const hide = (text, key) => String(text).replaceAll(key, '[redacted]');

/** One text-to-speech request: the MP3 bytes. The key travels in a header only, and no message of an error carries it. */
async function request({ key, fetch, text, voiceId, seed, context }) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(voiceId)) throw new Error(`Not a voice id: ${JSON.stringify(voiceId)}`);
  let response;
  try {
    response = await fetch(`${API}/${voiceId}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, language_code: LANGUAGE, voice_settings: SETTINGS, ...(seed === undefined ? {} : { seed }), ...(context === undefined ? {} : { previous_text: context }) }),
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

/**
 * The caches of the repo's other checkouts beside this one (C:/Risaeðla/<worktree>/.tools/elevenlabs-remake), read only: a take
 * another checkout paid for is the same request, so it is copied rather than asked for again. Only for the real repo root (a
 * test's root has none).
 */
export function siblingCaches(root) {
  if (path.resolve(root) !== ROOT) return [];
  const parent = path.dirname(ROOT);
  return fs.readdirSync(parent, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && path.join(parent, entry.name) !== ROOT)
    .map(entry => path.join(parent, entry.name, CACHE))
    .filter(dir => fs.existsSync(dir));
}

/** The raw answer for a request: from the cache (this checkout's, or copied from another's), or asked for once and kept. */
async function take({ root, key, fetch, text, voiceId, seed, context, log }) {
  const name = `${cacheKey({ text, voiceId, seed, context })}.mp3`;
  const file = path.join(root, CACHE, name);
  if (fs.existsSync(file)) return file;
  const elsewhere = siblingCaches(root).map(dir => path.join(dir, name)).find(candidate => fs.existsSync(candidate));
  if (elsewhere) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(elsewhere, `${file}.part`);
    fs.renameSync(`${file}.part`, file);
    log(`From ${path.relative(path.dirname(ROOT), elsewhere).split(path.sep)[0]}'s cache: ${name}`);
    return file;
  }
  log(`Asking for ${text.length} characters...`);
  const bytes = await request({ key, fetch, text, voiceId, seed, context });
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
  const lexicon = readLexicon(root);
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
    const sent = requestFor(line, lexicon); // the caption stays line.text; only the request carries the recipes
    const voiceId = voices[line.speaker];
    const raw = await take({ root, key, fetch, text: sent.text, voiceId, seed: sent.seed, context: sent.context, log });
    const target = path.join(root, folder, `${line.id}.mp3`);
    const seconds = master(raw, target);
    recordMade(root, set, line.id, { key: cacheKey({ text: sent.text, voiceId, seed: sent.seed, context: sent.context }), mp3: sha256(target) });
    const recipes = sent.words.filter(word => word.recipe).map(word => `${word.id}: ${word.recipe}`);
    log(`Ready ${line.id}: ${seconds} s${recipes.length ? ` (${recipes.join(', ')})` : ''}`);
  }
  updateLines(root, chosen.map(line => line.id), set);
  return chosen.map(line => line.id);
}

/** Which request made each MP3 the tool mastered, and the MP3's hash, so --plan can tell a line that is up to date. Local, like the cache. */
const MADE = '.tools/voice-lines-made.json';
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export const readMade = root => (fs.existsSync(path.join(root, MADE)) ? JSON.parse(fs.readFileSync(path.join(root, MADE), 'utf8')) : {});
function recordMade(root, set, id, entry) {
  const file = path.join(root, MADE);
  const made = readMade(root);
  made[`${set}/${id}`] = { ...entry, model: MODEL };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.part`, `${JSON.stringify(made, null, 1)}\n`);
  fs.renameSync(`${file}.part`, file);
}

/** A file-name word for a voice: "Sanna Hartfield - Calm and Soothing" is "sanna-hartfield". */
const slug = name => name.split(' - ')[0].normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** One sample per candidate voice of a character, and an index of them, in qa/remake/voices/. The sample line is read from the set the candidate names. Returns the index's rows. */
export async function audition({ root, key, fetch, character, log }) {
  const { line: lineId, voices } = CANDIDATES[character];
  const line = readLines(root, setOf(character)).find(entry => entry.id === lineId);
  if (!line) throw new Error(`${lineId}, the sample line for ${character}, is not in ${sourceOf(setOf(character))}.`);
  const sent = requestFor({ speaker: line.speaker, text: line.text }, readLexicon(root)); // the sample's own seed is not used, as before
  needAudioTools();
  const folder = path.join(root, AUDITIONS);
  fs.mkdirSync(folder, { recursive: true });
  for (const name of fs.readdirSync(folder)) { // the folder holds the samples of this round only
    if (name.startsWith(`${character}-`) && /\.(mp3|md)$/.test(name)) fs.rmSync(path.join(folder, name));
  }
  const rows = [];
  for (const [i, voice] of voices.entries()) {
    const raw = await take({ root, key, fetch, text: sent.text, voiceId: voice.id, seed: sent.seed, context: sent.context, log });
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

/** Whether a take is in this checkout's cache or another's: then it costs nothing. */
const isCached = (root, key) => [path.join(root, CACHE), ...siblingCaches(root)].some(dir => fs.existsSync(path.join(dir, `${key}.mp3`)));

/** How a request reads in a listing: the words found with the recipe each was sent with ("unchosen": sent as written). */
const describeWords = sent => sent.words.map(word => `${word.id}: ${word.recipe ?? 'unchosen, sent as written'}`).join('; ');

/**
 * --dry: what would be sent for each line of a set (or every set and Litla Yatzy with "all"), and whether ElevenLabs would be
 * asked (no cached take) or not. Asks nothing, needs no key and writes nothing. Returns the rows.
 */
export function dry({ root, set = 'kafli1', only = null, log }) {
  const lexicon = readLexicon(root);
  const voices = readVoices(root);
  const sets = set === 'all' ? [...Object.keys(SETS).filter(name => fs.existsSync(path.join(root, sourceOf(name)))), JUNIOR] : [set];
  const rows = [];
  for (const name of sets) {
    const lines = linesOf(root, name);
    if (only) {
      const unknown = only.filter(id => !lines.some(line => line.id === id));
      if (unknown.length && sets.length === 1) throw new Error(`Not in ${name === JUNIOR ? 'Litla Yatzy' : sourceOf(name)}: ${unknown.join(', ')}`);
    }
    const chosen = only ? lines.filter(line => only.includes(line.id)) : lines;
    const out = [];
    for (const line of chosen) {
      if (line.kept !== undefined) {
        rows.push({ set: name, id: line.id, kept: line.kept });
        out.push(`  ${line.id}: kept, never sent (${line.kept})`);
        continue;
      }
      const sent = requestFor(line, lexicon);
      const voiceId = voices[line.speaker];
      const cached = typeof voiceId === 'string' && isCached(root, cacheKey({ text: sent.text, voiceId, seed: sent.seed, context: sent.context }));
      const unchosen = sent.words.some(word => !word.recipe);
      rows.push({ set: name, id: line.id, speaker: line.speaker, text: line.text, sent, cached, unchosen });
      out.push(`  ${line.id}: ${JSON.stringify(sent.text)}${sent.seed === undefined ? '' : `  seed ${sent.seed}`}${sent.words.length ? `  [${describeWords(sent)}]` : ''}${sent.own.length ? `  (the line's own ${sent.own.join(', ')})` : ''}  ${cached ? 'cached' : 'to ask'}`);
      if (sent.context !== undefined) out.push(`      context (not spoken): ${JSON.stringify(sent.context)}`);
    }
    const mine = rows.filter(row => row.set === name && !row.kept);
    const changed = mine.filter(row => row.sent.text !== row.text || row.sent.context !== undefined).length;
    log(`${name}: ${chosen.length} lines, ${changed} sent with a recipe, ${mine.filter(row => row.unchosen).length} with a word not chosen yet, ${chosen.length - mine.length} kept, ${mine.filter(row => !row.cached).length} to ask`);
    for (const text of out) log(text);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// The pronunciation book: one audition per word, speaker and recipe, for the owner to pick a recipe per word

const BOOK = 'qa/remake/voices/framburdarbok';
/** The speakers by the names the owner knows them by, in the order the book shows them. */
export const SPEAKER_NAMES = { mosi: 'Mosi', egill: 'Egill', kambedla: 'Kambeðla', thorsedla: 'Þórseðla', narrator: 'Sögumaður' };
const bySpeaker = (a, b) => {
  const order = Object.keys(SPEAKER_NAMES);
  const rank = who => (order.includes(who) ? order.indexOf(who) : order.length);
  return rank(a) - rank(b) || a.localeCompare(b);
};

/** A word of the lexicon by its id, its name or one of its forms ("Kambeðla", "kambedla" and "Kambeðlu" are one word). */
export function resolveWord(lexicon, name) {
  if (Object.hasOwn(lexicon.words, name)) return name;
  const found = Object.entries(lexicon.words).find(([, entry]) => entry.word.toLowerCase() === String(name).toLowerCase() || entry.forms.includes(name));
  if (!found) throw new Error(`${name} is not a word of ${LEXICON}; the words are ${Object.keys(lexicon.words).join(', ')} (or all).`);
  return found[0];
}

/** The lexicon with one word's recipe chosen, for an audition: every other word keeps the owner's choice. */
const withChoice = (lexicon, id, recipe) => ({ ...lexicon, words: { ...lexicon.words, [id]: { ...lexicon.words[id], chosen: recipe } } });

/**
 * What a speaker says in the book for a word: the entry's own audition sentence for that speaker, or the shortest line of theirs
 * with the word, a line that is not kept first (that line will be made again with the recipe picked, and its audition is the very
 * request, so the take heard is the take that goes into the game).
 */
function sampleFor(entry, speaker, says) {
  const mine = says.filter(line => line.speaker === speaker);
  if (entry.audition?.[speaker]) { // a sentence of the entry's own, or one of the speaker's lines named by its text
    const line = mine.find(candidate => candidate.text === entry.audition[speaker]);
    return line ? { text: line.text, seed: line.seed, from: `${line.set}/${line.id}` } : { text: entry.audition[speaker], from: null };
  }
  const pool = mine.some(line => line.kept === undefined) ? mine.filter(line => line.kept === undefined) : mine;
  const line = pool.reduce((best, next) => (next.text.length < best.text.length ? next : best));
  return { text: line.text, seed: line.seed, from: `${line.set}/${line.id}` };
}

/**
 * The book's rows: for each word (all, or the one named), each speaker who says it anywhere (or has an audition sentence), each
 * recipe (raw among them): the sentence, what would be sent and the file it goes in. Pure.
 */
export function bookPlan(lexicon, lines, which = 'all') {
  const ids = which === 'all' ? Object.keys(lexicon.words) : [resolveWord(lexicon, which)];
  const rows = [];
  for (const id of ids) {
    const entry = lexicon.words[id];
    const pattern = formsPattern(entry.forms);
    const says = lines.filter(line => pattern.test(line.text));
    const speakers = [...new Set([...says.map(line => line.speaker), ...Object.keys(entry.audition ?? {})])].sort(bySpeaker);
    for (const speaker of speakers) {
      const sample = sampleFor(entry, speaker, says);
      for (const [recipe, { note }] of Object.entries(entry.recipes)) {
        const sent = requestFor({ speaker, text: sample.text, ...(sample.seed === undefined ? {} : { seed: sample.seed }) }, withChoice(lexicon, id, recipe));
        rows.push({ word: id, speaker, recipe, note, text: sample.text, from: sample.from, sent: { text: sent.text, context: sent.context, seed: sent.seed }, file: `${id}/${speaker}-${recipe}.mp3` });
      }
    }
  }
  return rows;
}

const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const PAGE_STYLE = `:root { --paper: #fbf3e2; --ink: #3b2a1a; --muted: #7a6650; --line: #e3d3b4; --mark: #f3e2bd; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.45 Nunito, system-ui, sans-serif; }
  main { max-width: 920px; margin: 0 auto; padding: 24px 16px 96px; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  h2 { margin: 36px 0 4px; font-size: 23px; border-bottom: 2px solid var(--line); padding-bottom: 4px; }
  p.note, .muted { color: var(--muted); }
  p.note { margin: 0 0 8px; }
  code, .sent { font: 13px ui-monospace, monospace; color: var(--muted); word-break: break-word; }
  .recipe { margin: 14px 0 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; }
  .recipe:has(input:checked) { background: var(--mark); }
  .recipe label { font-weight: 800; cursor: pointer; }
  .row { display: grid; grid-template-columns: 120px 1fr; gap: 2px 14px; align-items: center; padding: 6px 0; border-top: 1px solid var(--line); }
  .row .who { font-weight: 700; }
  .row audio { grid-column: 1 / -1; width: 100%; height: 36px; }
  .missing { grid-column: 1 / -1; color: var(--muted); font-style: italic; }
  .bar { position: sticky; bottom: 0; background: var(--paper); border-top: 2px solid var(--line); padding: 10px 0; display: flex; gap: 12px; align-items: center; }
  button { font: inherit; font-weight: 800; padding: 8px 18px; border-radius: 999px; border: 2px solid var(--ink); background: #fff8ea; color: var(--ink); cursor: pointer; }
  @media (max-width: 600px) { .row { grid-template-columns: 1fr; } }`;

/** The book's page (qa/remake/voices/framburdarbok/index.html): a section per word, a radio per recipe, a row per speaker. */
export function bookHtml(lexicon, rows, { exists = () => true } = {}) {
  const sections = [];
  for (const [id, entry] of Object.entries(lexicon.words)) {
    const mine = rows.filter(row => row.word === id);
    if (!mine.length) continue;
    const recipes = Object.entries(entry.recipes).map(([recipe, { note }]) => {
      const rowsHtml = mine.filter(row => row.recipe === recipe).map(row => {
        const sent = [`sent: ${row.sent.text}`, row.sent.context ? `samhengi (ekki talað): ${row.sent.context}` : '', row.sent.seed === undefined ? '' : `fræ ${row.sent.seed}`].filter(Boolean).join(' · ');
        const audio = exists(row) ? `<audio controls preload="none" src="${escapeHtml(row.file)}"></audio>` : '<span class="missing">Ekki gert enn (node remake/tools/voice-lines.mjs --book ' + escapeHtml(id) + ')</span>';
        return `<div class="row" data-row="${escapeHtml(`${id}|${row.speaker}|${recipe}`)}"><span class="who">${escapeHtml(SPEAKER_NAMES[row.speaker] ?? row.speaker)}</span><span>${escapeHtml(row.text)}${row.from ? ` <code>${escapeHtml(row.from)}</code>` : ''}<br><span class="sent">${escapeHtml(sent)}</span></span>${audio}</div>`;
      }).join('\n');
      const checked = entry.chosen === recipe ? ' checked' : '';
      return `<div class="recipe"><label><input type="radio" name="${escapeHtml(id)}" value="${escapeHtml(recipe)}"${checked}> ${escapeHtml(recipe)}${entry.chosen === recipe ? ' <span class="muted">(valið núna)</span>' : ''}</label><p class="note">${escapeHtml(note)}</p>\n${rowsHtml}</div>`;
    }).join('\n');
    const undecided = `<div class="recipe"><label><input type="radio" name="${escapeHtml(id)}" value=""${entry.chosen === null ? ' checked' : ''}> ekki ákveðið</label><p class="note">Orðið er sent eins og það er skrifað þar til þú velur.</p></div>`;
    sections.push(`<section data-word="${escapeHtml(id)}"><h2>${escapeHtml(entry.word)}</h2><p class="note">Myndir: ${entry.forms.map(escapeHtml).join(', ')}. ${entry.chosen ? `Valið núna: <b>${escapeHtml(entry.chosen)}</b>.` : 'Ekkert valið enn.'}</p>\n${recipes}\n${undecided}</section>`);
  }
  return `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Framburðarbók</title>
<style>
  ${PAGE_STYLE}
</style>
</head>
<body>
<main>
  <h1>Framburðarbók</h1>
  <p class="note">Eitt erfitt orð í einu. Undir hverri uppskrift segir hver persóna sem notar orðið sömu setninguna; uppskriftin breytir aðeins því sem er sent til ElevenLabs (Eleven v4), aldrei textanum sem barnið sér. Veldu uppskrift fyrir orðið: hún gildir um allar línur með orðinu, í öllum köflum og Litlu Yatzy. Ýttu svo á „Vista val“ og sendu mér picks.json.</p>
${sections.join('\n')}
  <div class="bar"><button type="button" id="save">Vista val</button><span class="muted" id="count"></span></div>
</main>
<script>
  const words = [...document.querySelectorAll('section[data-word]')].map(section => section.dataset.word);
  const picks = () => Object.fromEntries(words.flatMap(word => {
    const input = document.querySelector('input[name="' + word + '"]:checked');
    return input ? [[word, input.value || null]] : [];
  }));
  const count = () => { document.getElementById('count').textContent = Object.values(picks()).filter(Boolean).length + ' af ' + words.length + ' orðum með valda uppskrift'; };
  document.addEventListener('change', count);
  count();
  document.getElementById('save').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(picks(), null, 2) + '\\n'], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'picks.json' });
    document.body.append(link);
    link.click();
    link.remove();
  });
</script>
</body>
</html>
`;
}

/** Writes the book's page and book.json (every row, with what was sent) for every word of the lexicon. */
function writeBook(root, lexicon) {
  const rows = bookPlan(lexicon, allLines(root), 'all');
  const folder = path.join(root, BOOK);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'index.html'), bookHtml(lexicon, rows, { exists: row => fs.existsSync(path.join(folder, row.file)) }));
  fs.writeFileSync(path.join(folder, 'book.json'), `${JSON.stringify(rows, null, 1)}\n`);
  return rows;
}

/** --book: renders the auditions of a word (or all) into the book's folder, mastered like the game's lines, and writes its page. Returns the rows made. */
export async function book({ root, key, fetch, which, log }) {
  const lexicon = readLexicon(root);
  const voices = readVoices(root);
  const rows = bookPlan(lexicon, allLines(root), which);
  const missing = [...new Set(rows.map(row => row.speaker))].filter(speaker => typeof voices[speaker] !== 'string' || !voices[speaker]);
  if (missing.length) throw new Error(`No voice is chosen for ${missing.join(' and ')} in ${VOICES}. No request was made.`);
  needAudioTools();
  for (const row of rows) {
    const raw = await take({ root, key, fetch, ...row.sent, voiceId: voices[row.speaker], log });
    const seconds = master(raw, path.join(root, BOOK, row.file));
    log(`Ready ${row.file}: ${seconds} s`);
  }
  writeBook(root, lexicon);
  return rows;
}

/** --book --dry: the auditions that --book would make, what each sends, and which would cost credits. Asks nothing. */
export function bookDry({ root, which, log }) {
  const lexicon = readLexicon(root);
  const voices = readVoices(root);
  const rows = bookPlan(lexicon, allLines(root), which);
  let ask = 0;
  let characters = 0;
  for (const row of rows) {
    const cached = typeof voices[row.speaker] === 'string' && isCached(root, cacheKey({ ...row.sent, voiceId: voices[row.speaker] }));
    if (!cached) { ask++; characters += row.sent.text.length; }
    log(`  ${row.file}: ${JSON.stringify(row.sent.text)}${row.sent.seed === undefined ? '' : `  seed ${row.sent.seed}`}  ${cached ? 'cached' : 'to ask'}${row.from ? `  (${row.from})` : ''}`);
    if (row.sent.context !== undefined) log(`      context (not spoken): ${JSON.stringify(row.sent.context)}`);
  }
  log(`${rows.length} auditions of ${new Set(rows.map(row => row.word)).size} words; ${ask} to ask (${characters} characters), the rest cached.`);
  return rows;
}

/** --pick: writes the owner's picks (word -> recipe, or null) into the lexicon's "chosen". Everything is checked before the file is written. */
export function pick({ root, file, log }) {
  const lexicon = readLexicon(root);
  const picks = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!picks || typeof picks !== 'object' || Array.isArray(picks)) throw new Error(`${file}: the book saves word -> recipe.`);
  const changes = [];
  for (const [name, recipe] of Object.entries(picks)) {
    const id = resolveWord(lexicon, name);
    if (recipe !== null && !Object.hasOwn(lexicon.words[id].recipes, recipe)) throw new Error(`${file}: ${recipe} is not a recipe of ${id} (${Object.keys(lexicon.words[id].recipes).join(', ')}). Nothing was written.`);
    changes.push([id, recipe]);
  }
  for (const [id, recipe] of changes) {
    const before = lexicon.words[id].chosen;
    lexicon.words[id].chosen = recipe;
    log(before === recipe ? `${id}: ${recipe ?? 'not chosen'}, as it was` : `${id}: ${before ?? 'not chosen'} -> ${recipe ?? 'not chosen'}`);
  }
  checkLexicon(lexicon);
  fs.writeFileSync(path.join(root, LEXICON), `${JSON.stringify(lexicon, null, 2)}\n`);
  log(`${LEXICON} written. Next: node remake/tools/voice-lines.mjs --plan`);
  return changes;
}

// ---------------------------------------------------------------------------------------------
// The plan: which lines to make again, and the A/B pages

const JUNIOR_INDEX = `${CACHE}/yatzy-junior-index.json`;
/** The fingerprints Litla Yatzy's tool keeps of the takes it mastered: this checkout's, or another's. */
function juniorIndexOf(root) {
  const dirs = [path.join(root, CACHE), ...siblingCaches(root)];
  const file = dirs.map(dir => path.join(dir, path.basename(JUNIOR_INDEX))).find(candidate => fs.existsSync(candidate));
  return file ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/**
 * Which cached take an MP3 was mastered from, among the keys given: the one there is, or, when several are cached, the one whose
 * length plus the quarter second of quiet is the MP3's (a take of v3 and one of v4 differ by more than the encoder's few ms).
 */
function madeFrom(mp3, keys, caches) {
  const found = keys.map(key => ({ key, file: caches.map(dir => path.join(dir, `${key}.mp3`)).find(candidate => fs.existsSync(candidate)) })).filter(item => item.file);
  if (found.length <= 1) return found[0]?.key ?? null;
  const length = durationOf(mp3) - 0.25;
  const scored = found.map(item => ({ ...item, off: Math.abs(durationOf(item.file) - length) })).sort((a, b) => a.off - b.off);
  return scored[0].off < 0.08 ? scored[0].key : null;
}

/**
 * --plan's findings, per set (and Litla Yatzy): `make`, the lines whose MP3 is not what the tool would send now (an eleven_v3
 * take, a take of another request, a recipe chosen since, no MP3), each with its reasons; `waiting`, lines with a word the owner
 * has not picked (sent as written meanwhile); `kept`, kept lines worth knowing about (an eleven_v3 take, or a chosen word); and
 * `current`, the count of lines that are as the tool would make them. Which take made an MP3 is read from the record the tool
 * keeps since the lexicon (.tools/voice-lines-made.json; Litla Yatzy's index), else from the caches here and in the other
 * checkouts (the analysis's method: a line's raw text hashed for eleven_v3 and eleven_v4). Asks nothing and writes nothing.
 */
export function regenerationPlan(root, { caches = [path.join(root, CACHE), ...siblingCaches(root)], junior = VOICE_LINES, juniorIndex = juniorIndexOf(root) } = {}) {
  const lexicon = readLexicon(root);
  const voices = readVoices(root);
  const made = readMade(root);
  const sets = [...Object.keys(SETS).filter(set => fs.existsSync(path.join(root, sourceOf(set)))), JUNIOR];
  const plan = {};
  for (const set of sets) {
    const found = { make: [], waiting: [], kept: [], current: 0 };
    for (const line of linesOf(root, set, junior)) {
      const sent = requestFor(line, lexicon);
      const chosen = sent.words.filter(word => word.recipe);
      const unchosen = sent.words.filter(word => !word.recipe).map(word => word.id);
      const recipes = chosen.map(word => `${word.id}: ${word.recipe}`).join(', ');
      if (line.kept !== undefined) {
        const why = [/\bv3\b/.test(line.kept) ? 'a kept eleven_v3 take' : null, chosen.length ? `says ${chosen.map(word => word.id).join(', ')}` : null].filter(Boolean);
        if (why.length) found.kept.push({ id: line.id, why: why.join('; '), kept: line.kept });
        continue;
      }
      const voiceId = voices[line.speaker];
      const key = cacheKey({ text: sent.text, voiceId, seed: sent.seed, context: sent.context });
      const changed = sent.text !== line.text || sent.context !== undefined || sent.seed !== line.seed;
      const mp3 = path.join(root, folderOf(set), `${line.id}.mp3`);
      const reasons = [];
      const record = set === JUNIOR ? (juniorIndex?.[line.id] === undefined ? null : { key: juniorIndex[line.id] }) : made[`${set}/${line.id}`] ?? null;
      if (!fs.existsSync(mp3)) {
        reasons.push('no MP3 yet');
      } else if (record) {
        if (record.key !== key) reasons.push(changed ? `the lexicon changed its request (${recipes})` : 'made from another request (a recipe, seed or voice changed since)');
        else if (record.mp3 && record.mp3 !== sha256(mp3)) reasons.push('its MP3 was changed after the tool made it');
      } else {
        const raw = { text: line.text, voiceId, seed: line.seed };
        const v3 = cacheKey({ ...raw, model: 'eleven_v3' });
        const v4 = cacheKey(raw);
        const from = madeFrom(mp3, [...new Set([key, v4, v3])], caches);
        if (from === v3) reasons.push('an eleven_v3 take');
        else if (from === null) reasons.push(set === 'kafli1' ? 'no cached take: eleven_v3, made before the switch to v4 on 2026-10-18' : 'no cached take of it found');
        if (from !== key && changed) reasons.push(`the lexicon changes its request (${recipes})`);
      }
      if (reasons.length) found.make.push({ id: line.id, speaker: line.speaker, reasons, sent: { text: sent.text, context: sent.context, seed: sent.seed }, cached: caches.some(dir => fs.existsSync(path.join(dir, `${key}.mp3`))), unchosen });
      else if (unchosen.length) found.waiting.push({ id: line.id, words: unchosen });
      else found.current++;
    }
    plan[set] = found;
  }
  return plan;
}

/** The commands that make a set's planned lines again: the A/B snapshot first, then the lines. */
export const planCommands = (set, ids) => [
  `node remake/tools/voice-lines.mjs --ab ${set}`,
  set === JUNIOR ? `node remake/tools/yatzy-junior-voices.mjs --only ${ids.join(',')}` : `node remake/tools/voice-lines.mjs --set ${set} --only ${ids.join(',')}`,
];

/** --plan: prints regenerationPlan, set by set, with the commands to run. */
export function printPlan({ root, log }) {
  const plan = regenerationPlan(root);
  let lines = 0;
  let characters = 0;
  log('Lines to make again: the MP3 is an eleven_v3 take, or not of the request the lexicon makes now. Kept lines are never made again.');
  for (const [set, found] of Object.entries(plan)) {
    log('');
    log(`${set}: ${found.make.length} to make, ${found.waiting.length} waiting for a pick, ${found.kept.length} kept to know about, ${found.current} as they should be`);
    for (const item of found.make) {
      log(`  ${item.id}: ${item.reasons.join('; ')}${item.cached ? ' (cached)' : ''}`);
      if (!item.cached) { lines++; characters += item.sent.text.length; }
    }
    if (found.waiting.length) log(`  waiting (sent as written until the owner picks): ${found.waiting.map(item => `${item.id} (${item.words.join(', ')})`).join(', ')}`);
    for (const item of found.kept) log(`  kept, never made again: ${item.id} (${item.why})`);
    if (found.make.length) for (const command of planCommands(set, found.make.map(item => item.id))) log(`  ${command}`);
  }
  log('');
  log(`In all: ${Object.values(plan).reduce((n, found) => n + found.make.length, 0)} lines to make, ${lines} of them to ask ElevenLabs for (${characters} characters).`);
  return plan;
}

const AB = 'qa/remake/voices/ab';

/**
 * --ab <set>: copies the MP3s of the lines about to be made again (the plan's, or --only's) into qa/remake/voices/ab/<set>/old/
 * (never over a copy already there, so run it BEFORE making them) and writes qa/remake/voices/ab/<set>.html, the old take beside
 * the new for each, for the owner to approve the change set by set. Asks nothing.
 */
export function abPage({ root, set, only = null, log }) {
  const lexicon = readLexicon(root);
  const lines = linesOf(root, set);
  if (only) {
    const unknown = only.filter(id => !lines.some(line => line.id === id));
    if (unknown.length) throw new Error(`Not in ${set}: ${unknown.join(', ')}`);
  }
  const planned = only ?? regenerationPlan(root)[set]?.make.map(item => item.id) ?? [];
  const oldFolder = path.join(root, AB, set, 'old');
  fs.mkdirSync(oldFolder, { recursive: true });
  let copied = 0;
  for (const id of planned) {
    const from = path.join(root, folderOf(set), `${id}.mp3`);
    const to = path.join(oldFolder, `${id}.mp3`);
    if (fs.existsSync(from) && !fs.existsSync(to)) { fs.copyFileSync(from, to); copied++; }
  }
  const snapped = new Set(fs.readdirSync(oldFolder).filter(name => name.endsWith('.mp3')).map(name => name.slice(0, -4)));
  const shown = lines.filter(line => snapped.has(line.id));
  const newSrc = id => `../../../../${folderOf(set)}/${id}.mp3`;
  const rows = shown.map(line => {
    const sent = requestFor(line, lexicon);
    const how = [sent.text !== line.text ? `sent: ${sent.text}` : '', sent.context ? `samhengi (ekki talað): ${sent.context}` : '', sent.seed === undefined ? '' : `fræ ${sent.seed}`].filter(Boolean).join(' · ');
    return `<div class="line" data-id="${escapeHtml(line.id)}">
  <p><b>${escapeHtml(SPEAKER_NAMES[line.speaker] ?? line.speaker)}</b>: ${escapeHtml(line.text)} <code>${escapeHtml(line.id)}</code>${how ? `<br><span class="sent">${escapeHtml(how)}</span>` : ''}</p>
  <div class="pair"><label><input type="radio" name="${escapeHtml(line.id)}" value="gamla"> Gamla</label><audio controls preload="none" src="${escapeHtml(`${set}/old/${line.id}.mp3`)}"></audio>
  <label><input type="radio" name="${escapeHtml(line.id)}" value="nyja"> Nýja (v4)</label><audio controls preload="none" src="${escapeHtml(newSrc(line.id))}"></audio></div>
</div>`;
  });
  const html = `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>A/B: ${escapeHtml(set)}</title>
<style>
  ${PAGE_STYLE}
  .line { padding: 10px 0; border-top: 1px solid var(--line); }
  .line p { margin: 0 0 6px; }
  .pair { display: grid; grid-template-columns: 130px 1fr; gap: 4px 12px; align-items: center; }
  .pair audio { width: 100%; height: 36px; }
  @media (max-width: 600px) { .pair { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <h1>A/B: ${escapeHtml(set)}</h1>
  <p class="note">${shown.length} línur, hver með gömlu tökunni og þeirri nýju (Eleven v4 með framburðarreglunum). Nýja takan heyrist hér eftir að línurnar hafa verið gerðar aftur. Merktu „Gamla“ við línu sem á að halda gömlu tökunni, ýttu svo á „Vista val“ og sendu mér skrána.</p>
${rows.join('\n')}
  <div class="bar"><button type="button" id="save">Vista val</button><span class="muted" id="count"></span></div>
</main>
<script>
  const ids = [...document.querySelectorAll('.line')].map(line => line.dataset.id);
  const choices = () => Object.fromEntries(ids.flatMap(id => { const input = document.querySelector('input[name="' + id + '"]:checked'); return input ? [[id, input.value]] : []; }));
  const count = () => { const all = Object.values(choices()); document.getElementById('count').textContent = all.filter(v => v === 'nyja').length + ' nýjar, ' + all.filter(v => v === 'gamla').length + ' gamlar, ' + (ids.length - all.length) + ' ómerktar'; };
  document.addEventListener('change', count);
  count();
  document.getElementById('save').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ set: ${JSON.stringify(set)}, choices: choices() }, null, 2) + '\\n'], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: ${JSON.stringify(`ab-${set}.json`)} });
    document.body.append(link);
    link.click();
    link.remove();
  });
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(root, AB, `${set}.html`), html);
  log(`${copied} old takes copied into ${AB}/${set}/old/ (${snapped.size} there in all); ${AB}/${set}.html lists ${shown.length} lines.`);
  return { planned, copied, shown: shown.map(line => line.id) };
}

export async function main(argv, { env = process.env, root = ROOT, fetch = globalThis.fetch, log = console.log } = {}) {
  const args = parseArgs(argv);
  // What asks ElevenLabs nothing needs no key.
  if (args.dry) {
    if (args.book) bookDry({ root, which: args.book, log });
    else dry({ root, set: args.set, only: args.only, log });
    return;
  }
  if (args.pick) {
    pick({ root, file: args.pick, log });
    return;
  }
  if (args.plan) {
    printPlan({ root, log });
    return;
  }
  if (args.ab) {
    abPage({ root, set: args.ab, only: args.only, log });
    return;
  }
  const key = env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('Set ELEVENLABS_API_KEY in the local environment to make voices. No request was made.');
  try {
    if (args.book) {
      const rows = await book({ root, key, fetch, which: args.book, log });
      log(`${rows.length} auditions and the page are in ${BOOK}/ (index.html)`);
    } else if (args.audition) {
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
