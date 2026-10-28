#!/usr/bin/env node
// Voices the remake's chapters and book with ElevenLabs Eleven v4 (MODEL), the way scripts/generate-narration.mjs voices the game:
//   node remake/tools/voice-lines.mjs [--set book|eitt|hals|kafli2] [--only id,id]   make the lines of assets/audio/<set>/lines-source.json (all, or just these)
//   node remake/tools/voice-lines.mjs --audition kambedla    one sample line per candidate voice, in qa/remake/voices/, to choose from
//   node remake/tools/voice-lines.mjs --audition egill
//   node remake/tools/voice-lines.mjs --audition narrator
//   node remake/tools/voice-lines.mjs --dry [--set <set>|all|yatzy-junior] [--only id,id]   what each line would send; asks nothing
//   node remake/tools/voice-lines.mjs --book <word|all> [--dry]   the pronunciation book: auditions in qa/remake/voices/framburdarbok/
//   node remake/tools/voice-lines.mjs --pick picks.json           the owner's picks from the book into pronunciation.json
//   node remake/tools/voice-lines.mjs --plan                      the lines to make again, set by set, with the commands
//   node remake/tools/voice-lines.mjs --ab <set|yatzy-junior> [--only id,id]   snapshot the old takes, then an old-beside-new page
//   node remake/tools/voice-lines.mjs --remake-kept <set> [--only id,id]   new takes of kept lines whose words have rules now, beside the page
//   node remake/tools/voice-lines.mjs --ab-apply <set> ab-<set>.json      install those new takes, but for the lines the owner marked old
// (making lines, --audition, --book and --remake-kept need ffmpeg and ffprobe on the PATH and ELEVENLABS_API_KEY in the environment;
// --dry, --pick, --plan, --ab and --ab-apply ask ElevenLabs nothing and need no key; --plan and --ab-apply need ffprobe/ffmpeg)
//
// THE PRONUNCIATION STANDARD (tools/pronunciation.mjs). remake/assets/audio/pronunciation.json lists the hard words (Kambeðla, Snigill,
// Eitt, Egill, ...), each with every form the lines say, candidate recipes and the one the owner chose by ear ("chosen", null until
// then). A recipe is what is sent instead of the plain word: "say" (a respelling such as Eiht, or IPA in double quotes and slashes,
// "/ˈstniːjɪtl̥/", which Eleven v4 reads), "context" (a sentence sent as previous_text, never spoken: what won Kambeðla), and a "seed".
// Every request goes through requestFor -> applyLexicon: each form of a chosen word is replaced by its recipe's say, the chosen
// contexts are joined in the order the words are said, and the first recipe seed is used; a word with no recipe chosen is sent as
// written. A line may still carry its own "say", "context" or "seed", which win. The text the child sees (lines-source.json's text,
// the captions, lines.json) never changes: only the request does. tools/yatzy-junior-voices.mjs sends Litla Yatzy's Mosi lines
// through the same functions. The file is JSON.stringify(lexicon, null, 2) plus a newline: add candidates or edit it with node (see
// tools/pronunciation.mjs), not with Python's json.dumps, so --pick rewrites it byte for byte.
//
// THE BOOK, ONCE PER WORD. --book renders, for each hard word, each speaker who says it anywhere and each recipe (raw, "hratt",
// among them), one audition: the speaker's shortest line with the word (one that is not kept first) or the entry's "audition"
// sentence, sent with that recipe for the word and the chosen recipes for the others, mastered like the game's lines into
// qa/remake/voices/framburdarbok/<word>/<speaker>-<recipe>.mp3, and writes index.html there: a section per word, a radio per recipe,
// and "Vista val", which saves picks.json (word -> recipe). --pick writes those into "chosen"; every line with the word then sends that
// recipe. A real line's audition is the very request it is made with, so the take the owner heard is the take that goes in.
// book.json there remembers which request each MP3 was made from; a row whose request has changed since (another word's choice
// changed) is marked on the page as an older take, and --book --dry and --plan say which words to render again.
//
// THE RECORD. remake/assets/audio/voices-made.json, committed, holds for every MP3 the tools mastered ("<set>/<id>", Litla Yatzy's as
// "yatzy-junior/<id>") the cache key of the request it was made from, the MP3's sha256 and its length. Hashes and lengths only, no
// secret. Both tools write it as they master a line; --plan reads it, so any checkout knows what each MP3 is without its caches.
//
// THE PLAN AND THE A/B PAGES. --plan lists the lines whose MP3 is not what the tool would send now: a take of another request (a
// recipe chosen or changed since), a changed MP3, none, or, for a line the record does not know, an eleven_v3 take found in the
// caches of the checkouts beside this one (the line's text hashed for eleven_v3 and eleven_v4, the take kept only if its length plus
// the quarter second is the MP3's). A line outside chapter 1 that neither the record nor a cached take accounts for is "unknown":
// listed to listen to, never put in an --only. It also lists lines.json entries whose length is not the MP3's ("stale entry": run
// node remake/tools/audio-lines.mjs), and kept lines worth knowing about. Per set it prints --ab <set>, then the --only to run. --ab
// copies the MP3s about to be made again into qa/remake/voices/ab/<set>/old-<n>/, a new round n only when they differ from the last
// round's copies (run it BEFORE --only; the first round of 2026-10-22 is old/), and writes qa/remake/voices/ab/<set>.html: the last
// round's old take beside the one now in the game.
//
// KEPT LINES UNDER A NEW RULE. --remake-kept <set> makes, for every kept line whose words now have a chosen recipe (or whose kept
// note is an eleven_v3 take or names a recipe), the request the tool would send if it were not kept, mastered into
// qa/remake/voices/ab/<set>/kept-new/<id>.mp3 (with kept-new/made.json), and adds those lines to the set's A/B page, the shipped take
// beside the new one. Nothing in the game changes. --ab-apply <set> ab-<set>.json, with the choices the owner saved there, installs
// the new take of every such line he did not mark "Gamla": copies it into the set's folder, takes "kept" away in lines-source.json,
// renews lines.json and records the request. The lines marked "Gamla" keep their take and their "kept".
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
// makes the same entries for the game's own lines), line by line as they are made, also when a run stops half-way. Lines are approved
// before they are made: voices.json names a voice for each speaker, null until the owner has chosen it (the narrator has no entry
// until then), and a speaker without a voice stops the run before any request.
//
// Eleven gives another take every time it is asked, so what ElevenLabs answers is kept in .tools/elevenlabs-remake/, named by a
// hash of everything that decides the sound: the text sent (after the lexicon), the context, the voice, the model, the settings and
// the seed. A line costs credits once: both tools copy a take another checkout of the repo already has from its cache instead of
// asking for it. For another take of a line, change its "seed" in lines-source.json. Lines that say the same thing (the three
// "Mmm!") have seeds of their own, or they would share one take.
//
// A line whose recording the owner chose by ear among takes made some other way has a "kept" in lines-source.json: one sentence that
// names the take, such as "the owner's pick, an Eleven v4 take (seed 2), 2026-10-16". The tool never asks for a kept line, masters it
// or writes over its MP3, also when --only names it; it says "Kept <id>: ..." and renews the line's entry in lines.json from the MP3
// that is there. A kept line needs no voice in voices.json, but its MP3 must be there: without it the tool stops before any
// request. To have the tool make a kept line again, take its "kept" away (or let --ab-apply do it for the owner's choices).
//
// The key is read from ELEVENLABS_API_KEY and from nowhere else. It goes into one request header; it is never printed, logged,
// written to a file or put in a URL, and without it the tool stops before it does anything.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES_FILE, SETS, durationOf, setFolder, updateLines } from './audio-lines.mjs';
import { MULTI_LINES, VOICE_LINES } from '../engine/yatzy-junior/voice-lines.js';
import { LEXICON, checkLexicon, formsPattern, isText, readLexicon, requestFor, resolveWord, withChoice, writeLexicon } from './pronunciation.mjs';
import { SPEAKER_NAMES, abHtml, bookHtml } from './voice-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Where the lines to speak of a set (the chapter's unless told another) are written, relative to the repo root. */
const sourceOf = set => `${setFolder(set)}/lines-source.json`;
const VOICES = 'remake/assets/audio/voices.json';
const CACHE = '.tools/elevenlabs-remake';
const AUDITIONS = 'qa/remake/voices';
/** Litla Yatzy's Mosi lines: made by tools/yatzy-junior-voices.mjs, from engine/yatzy-junior/voice-lines.js, with the same lexicon. */
export const JUNIOR = 'yatzy-junior';
/**
 * Litla Yatzy's whole script: the solo game's lines, then Fjölspil's (MULTI_LINES, optional: the page plays them as captions until
 * the owner records them). Both tools make, plan and audition them all alike; a line carries its `optional` flag along.
 */
export const JUNIOR_LINES = Object.freeze({ ...VOICE_LINES, ...MULTI_LINES });
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
// The pronunciation standard lives in tools/pronunciation.mjs; the listening pages in tools/voice-pages.mjs. Both are re-exported
// here, the tool's one door, for the other tools and the tests.

export { LEXICON, applyLexicon, checkLexicon, formsPattern, lexiconText, readLexicon, requestFor, resolveWord, writeLexicon } from './pronunciation.mjs';
export { SPEAKER_NAMES, abHtml, bookHtml } from './voice-pages.mjs';

const USAGE = `Usage: voice-lines.mjs [--set ${Object.keys(SETS).join('|')}] [--only id,id] [--dry]
       voice-lines.mjs --dry --set all|${JUNIOR}
       voice-lines.mjs --audition ${Object.keys(CANDIDATES).join('|')}
       voice-lines.mjs --book <word|all> [--dry]  |  --pick picks.json  |  --plan  |  --ab <set|${JUNIOR}> [--only id,id]
       voice-lines.mjs --remake-kept <set> [--only id,id]  |  --ab-apply <set> ab-<set>.json`;

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
    } else if (arg === '--remake-kept') {
      args.remakeKept = value(++i, '--remake-kept', `a line set (${Object.keys(SETS).join(', ')})`);
      if (!Object.hasOwn(SETS, args.remakeKept)) throw new Error(`--remake-kept needs ${Object.keys(SETS).join(' or ')}.`);
    } else if (arg === '--ab-apply') {
      const set = value(++i, '--ab-apply', 'a line set and the file the A/B page saved');
      if (!Object.hasOwn(SETS, set)) throw new Error(`--ab-apply needs ${Object.keys(SETS).join(' or ')}, then the file the A/B page saved.`);
      args.abApply = { set, file: value(++i, '--ab-apply', `the file the A/B page saved (ab-${set}.json)`) };
    } else if (arg === '--ab') {
      args.ab = value(++i, '--ab', `a line set (${Object.keys(SETS).join(', ')} or ${JUNIOR})`);
      if (!Object.hasOwn(SETS, args.ab) && args.ab !== JUNIOR) throw new Error(`--ab needs ${Object.keys(SETS).join(' or ')} or ${JUNIOR}.`);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
    }
  }
  const commands = ['audition', 'book', 'pick', 'plan', 'ab', 'remakeKept', 'abApply'].filter(name => args[name]);
  const flag = name => `--${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
  if (commands.length > 1) throw new Error(`${commands.map(flag).join(' and ')} do not go together.`);
  if (args.audition && args.only) throw new Error('--audition and --only do not go together.');
  if (args.audition && named && args.set !== setOf(args.audition)) throw new Error(`--audition ${args.audition} speaks a line of the ${setOf(args.audition)} set, so --set can only repeat that.`);
  if (args.dry && (args.audition || args.pick || args.plan || args.ab || args.remakeKept || args.abApply)) throw new Error('--dry goes with making lines or the book; --audition, --pick, --plan, --ab, --remake-kept and --ab-apply say what they do without it.');
  if ((args.book || args.pick || args.plan || args.ab || args.remakeKept || args.abApply) && named) throw new Error('--book, --pick, --plan, --ab, --remake-kept and --ab-apply name their set themselves: --set does not go with them.');
  if ((args.book || args.pick || args.plan || args.abApply) && args.only) throw new Error('--only goes with making lines, --dry, --ab and --remake-kept.');
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

/**
 * Litla Yatzy's lines live in its script, not in a lines-source.json, so this file beside its MP3s carries what such a line may
 * carry of its own: { "<id>": { say?, context?, seed?, note? } }, which win over the lexicon just as in a lines-source.json line.
 * The script stays the caption. Both tools read it, so --plan, --ab and the fingerprints agree.
 */
export const JUNIOR_OVERRIDES = 'remake/assets/audio/yatzy-junior/lines-overrides.json';
export function juniorOverrides(root, junior = JUNIOR_LINES) {
  const file = path.join(root, JUNIOR_OVERRIDES);
  if (!fs.existsSync(file)) return {};
  const overrides = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error(`${JUNIOR_OVERRIDES} is an object: line id -> { say, context, seed, note }.`);
  for (const [id, fields] of Object.entries(overrides)) {
    if (!Object.hasOwn(junior, id)) throw new Error(`${JUNIOR_OVERRIDES}: ${id} is not a line of Litla Yatzy.`);
    const unknown = Object.keys(fields ?? {}).filter(key => !['say', 'context', 'seed', 'note'].includes(key));
    if (unknown.length) throw new Error(`${JUNIOR_OVERRIDES}: ${id} has ${unknown.join(', ')}; a line carries say, context, seed and note only.`);
    for (const field of ['say', 'context', 'note']) {
      if (fields[field] !== undefined && !isText(fields[field])) throw new Error(`${JUNIOR_OVERRIDES}: ${id}.${field} is text.`);
    }
    if (fields.seed !== undefined && !(Number.isInteger(fields.seed) && fields.seed >= 0 && fields.seed <= 4294967295)) throw new Error(`${JUNIOR_OVERRIDES}: ${id}.seed is a whole number from 0 to 4294967295.`);
  }
  return overrides;
}

/** The lines of a set as { set, id, speaker, text, ... }; yatzy-junior's from Litla Yatzy's script (Mosi speaks them all), with its overrides. */
export function linesOf(root, set, junior = JUNIOR_LINES) {
  if (set === JUNIOR) {
    const overrides = juniorOverrides(root, junior);
    return Object.entries(junior).map(([id, line]) => ({ set, id, speaker: 'mosi', text: line.text, ...(line.seed === undefined ? {} : { seed: line.seed }), ...(line.optional ? { optional: true } : {}), ...(overrides[id] ?? {}) }));
  }
  return readLines(root, set).map(line => ({ set, ...line }));
}

/** Every line any voice says: the five sets, then Litla Yatzy's (or `junior`, for a test). */
export function allLines(root, junior = JUNIOR_LINES) {
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

/** Makes the lines of a set (the chapter's unless told another; all of them, or those in `only`): an MP3 each in the set's folder but for a kept line, which keeps the one it has; and their entries in lines.json, as they are made. Returns their ids. */
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
  const done = [];
  try {
    for (const line of chosen) {
      if (line.kept !== undefined) { // chosen by ear: not asked for, not mastered, not written over; only its entry in lines.json is renewed
        log(`Kept ${line.id}: ${line.kept}`);
        done.push(line.id);
        continue;
      }
      const sent = requestFor(line, lexicon); // the caption stays line.text; only the request carries the recipes
      const voiceId = voices[line.speaker];
      const raw = await take({ root, key, fetch, text: sent.text, voiceId, seed: sent.seed, context: sent.context, log });
      const target = path.join(root, folder, `${line.id}.mp3`);
      const seconds = master(raw, target);
      done.push(line.id);
      recordMade(root, { [`${set}/${line.id}`]: madeEntry(cacheKey({ text: sent.text, voiceId, seed: sent.seed, context: sent.context }), target, seconds) });
      const recipes = sent.words.filter(word => word.recipe).map(word => `${word.id}: ${word.recipe}`);
      log(`Ready ${line.id}: ${seconds} s${recipes.length ? ` (${recipes.join(', ')})` : ''}`);
    }
  } finally {
    if (done.length) updateLines(root, done, set); // what was made has its entry, also when a later line fails
  }
  return chosen.map(line => line.id);
}

/**
 * THE RECORD: which request made each MP3 the tools mastered, committed beside the lines: "<set>/<id>" (Litla Yatzy's as
 * "yatzy-junior/<id>") -> { key, mp3, duration, model }, the cache key of the request, the MP3's sha256 and its length. Hashes and
 * lengths only. Written as each line is mastered, keys sorted, so a run changes the lines it made and nothing else.
 */
export const MADE = 'remake/assets/audio/voices-made.json';
const MADE_ABOUT = 'Which request made each MP3 of the remake\'s voices: "<set>/<id>" -> the cache key of the request (tools/voice-lines.mjs cacheKey), the MP3\'s sha256 and its length. Written by tools/voice-lines.mjs and tools/yatzy-junior-voices.mjs as they master a line; read by voice-lines.mjs --plan.';
export const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
/** The record of a repo root: "<set>/<id>" -> { key, mp3, duration, model } ({} when there is none yet). */
export function readMade(root) {
  const file = path.join(root, MADE);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).lines ?? {} : {};
}
/** A record entry for an MP3 just mastered from the take of `key`. */
export const madeEntry = (key, mp3, duration) => ({ key, mp3: sha256(mp3), duration, model: MODEL });
/** Adds (or renews) entries of the record, through a .part file renamed into place. */
export function recordMade(root, entries) {
  const file = path.join(root, MADE);
  const all = { ...readMade(root), ...entries };
  const lines = Object.fromEntries(Object.keys(all).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map(id => [id, all[id]]));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.part`, `${JSON.stringify({ about: MADE_ABOUT, lines }, null, 1)}\n`);
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
    `${MODEL}, Icelandic, stability ${SETTINGS.stability}, similarity ${SETTINGS.similarity_boost}, speed ${SETTINGS.speed}; mastered to the loudness of the game's narration, so the files compare fairly.`,
    'Each file is one take. Eleven gives another take every time it is asked, with its own pace, so judge the voice rather than one reading.',
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
const bySpeaker = (a, b) => {
  const order = Object.keys(SPEAKER_NAMES);
  const rank = who => (order.includes(who) ? order.indexOf(who) : order.length);
  return rank(a) - rank(b) || a.localeCompare(b);
};

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

/** The caches a take may be found in: this checkout's, then the other checkouts' beside it (only for the real repo root). */
const cachesOf = root => [path.join(root, CACHE), ...siblingCaches(root)];

/**
 * Which cached take an MP3 was mastered from, among the keys given: the one whose length plus the quarter second of quiet the
 * mastering adds is the MP3's, within 80 ms (the encoder moves it by a few ms; two takes of a line differ by more). null when no
 * cached take fits, also when only one is cached: a take of the request that is not this MP3's is no proof.
 */
export function madeFrom(mp3, keys, caches) {
  const found = keys.map(key => ({ key, file: caches.map(dir => path.join(dir, `${key}.mp3`)).find(candidate => fs.existsSync(candidate)) })).filter(item => item.file);
  if (!found.length) return null;
  const length = durationOf(mp3) - 0.25;
  const best = found.map(item => ({ ...item, off: Math.abs(durationOf(item.file) - length) })).sort((a, b) => a.off - b.off)[0];
  return best.off < 0.08 ? best.key : null;
}

/**
 * The book's rows as they stand: each with `key` (the request it would send now), `made` (its MP3 is there), `rendered` (the request
 * its MP3 was made from, as book.json remembers it) and `stale` (made from another request than it would send now: a choice of
 * another word in its sentence changed since). book.json's first form, a list of rows written with the lexicon of the run's end,
 * may claim a request a row was not made from, so for it the MP3 is matched by length to the cached take of that request or of
 * today's (madeFrom).
 */
export function bookStatus(root, lexicon, voices, { lines = allLines(root), caches = cachesOf(root) } = {}) {
  const folder = path.join(root, BOOK);
  const file = path.join(folder, 'book.json');
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const legacy = Array.isArray(saved) ? new Map(saved.map(row => [row.file, row])) : null;
  const known = !legacy && saved?.rows ? new Map(saved.rows.map(row => [row.file, row.rendered ?? null])) : new Map();
  return bookPlan(lexicon, lines).map(row => {
    const key = cacheKey({ ...row.sent, voiceId: voices[row.speaker] });
    const mp3 = path.join(folder, row.file);
    if (!fs.existsSync(mp3)) return { ...row, key, made: false, rendered: null, stale: false };
    let rendered = known.get(row.file) ?? null;
    if (legacy) {
      const old = legacy.get(row.file);
      const keys = [key, ...(old?.sent ? [cacheKey({ ...old.sent, voiceId: voices[row.speaker] })] : [])];
      rendered = madeFrom(mp3, [...new Set(keys)], caches);
    }
    return { ...row, key, made: true, rendered, stale: rendered !== key };
  });
}

/** The words of the book with rows that play an older request than they would send now, and the command for each. */
const staleBookWords = rows => [...new Set(rows.filter(row => row.stale).map(row => row.word))];
const bookHint = words => `${words.length} word${words.length === 1 ? '' : 's'} of the book play an older take than they would send now (another choice changed): ${words.map(word => `node remake/tools/voice-lines.mjs --book ${word}`).join('; ')}`;

/** Writes the book's page and book.json (every row: what it sends, and the request its MP3 was made from) for every word; --book calls it, and it brings an older book.json to this form. */
export function writeBook(root, lexicon, voices, renderedNow = new Map()) {
  const rows = bookStatus(root, lexicon, voices).map(row => {
    const rendered = renderedNow.get(row.file) ?? row.rendered;
    return { ...row, rendered, stale: row.made && rendered !== row.key };
  });
  const folder = path.join(root, BOOK);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'index.html'), bookHtml(lexicon, rows, { exists: row => row.made }));
  const about = 'The pronunciation book\'s rows: what each sends now (sent, key) and the request its MP3 was made from (rendered); written by tools/voice-lines.mjs --book.';
  fs.writeFileSync(path.join(folder, 'book.json'), `${JSON.stringify({ about, rows }, null, 1)}\n`);
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
  const rendered = new Map();
  try {
    for (const row of rows) {
      const raw = await take({ root, key, fetch, ...row.sent, voiceId: voices[row.speaker], log });
      const seconds = master(raw, path.join(root, BOOK, row.file));
      rendered.set(row.file, cacheKey({ ...row.sent, voiceId: voices[row.speaker] }));
      log(`Ready ${row.file}: ${seconds} s`);
    }
  } finally {
    const all = writeBook(root, lexicon, voices, rendered);
    const stale = staleBookWords(all);
    if (stale.length) log(bookHint(stale));
  }
  return rows;
}

/** --book --dry: the auditions that --book would make, what each sends, which would cost credits, and the rows gone stale. Asks nothing. */
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
  if (fs.existsSync(path.join(root, BOOK))) {
    const stale = staleBookWords(bookStatus(root, lexicon, voices));
    if (stale.length) log(bookHint(stale));
  }
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
  writeLexicon(root, lexicon);
  log(`${LEXICON} written. Next: node remake/tools/voice-lines.mjs --plan`);
  return changes;
}

// ---------------------------------------------------------------------------------------------
// The plan: which lines to make again

/** Why a kept line is worth knowing about: a kept eleven_v3 take, words with a chosen rule now, a kept note that names a recipe. */
function keptWhy(line, sent) {
  const chosen = sent.words.filter(word => word.recipe).map(word => word.id);
  return [
    /\bv3\b/.test(line.kept) ? 'a kept eleven_v3 take' : null,
    chosen.length ? `says ${chosen.join(', ')}` : null,
    /\b(IPA|spelling|context)\b/i.test(line.kept) && !chosen.length ? 'its kept note names a recipe' : null,
  ].filter(Boolean);
}

/** A set's lines.json-like durations: lines.json for the sets, Litla Yatzy's manifest for its lines. */
function entriesOf(root, set) {
  const file = set === JUNIOR ? path.join(root, JUNIOR_FOLDER, 'manifest.json') : path.join(root, LINES_FILE);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

/**
 * --plan's findings, per set (and Litla Yatzy): `make`, the lines whose MP3 is not what the tool would send now (a take of another
 * request, a recipe chosen since, a changed MP3, no MP3, an eleven_v3 take), each with its reasons (and `optional` for Fjölspil's
 * lines, which the page plays as captions until they are made); `unknown`, lines outside chapter 1 that neither the record nor a
 * cached take accounts for (to listen to, never made blindly); `waiting`, lines with a word the owner has not picked (sent as
 * written meanwhile); `kept`, kept lines worth knowing about; `stale`, lines whose entry in lines.json (or Litla Yatzy's manifest)
 * is not their MP3's length; and `current`, the count of lines as the tool would make them. Which take made an MP3 is read from the
 * committed record (voices-made.json); only a line it does not know is looked for in the caches. Asks nothing and writes nothing.
 */
export function regenerationPlan(root, { caches = cachesOf(root), junior = JUNIOR_LINES } = {}) {
  const lexicon = readLexicon(root);
  const voices = readVoices(root);
  const made = readMade(root);
  const sets = [...Object.keys(SETS).filter(set => fs.existsSync(path.join(root, sourceOf(set)))), JUNIOR];
  const plan = {};
  for (const set of sets) {
    const found = { make: [], unknown: [], waiting: [], kept: [], stale: [], current: 0 };
    const entries = entriesOf(root, set);
    for (const line of linesOf(root, set, junior)) {
      const sent = requestFor(line, lexicon);
      const chosen = sent.words.filter(word => word.recipe);
      const unchosen = sent.words.filter(word => !word.recipe).map(word => word.id);
      const recipes = chosen.map(word => `${word.id}: ${word.recipe}`).join(', ');
      const mp3 = path.join(root, folderOf(set), `${line.id}.mp3`);
      const record = made[`${set}/${line.id}`] ?? null;
      const sha = fs.existsSync(mp3) ? sha256(mp3) : null;
      if (sha) { // lines.json must hold the length of the MP3 that is there
        const length = record?.mp3 === sha && record.duration !== undefined ? record.duration : durationOf(mp3);
        const entry = entries[line.id];
        if (!entry || Math.abs(entry.duration - length) > 0.002) found.stale.push({ id: line.id, why: entry ? `its entry says ${entry.duration} s, the MP3 is ${length} s` : 'no entry' });
      }
      if (line.kept !== undefined) {
        const why = keptWhy(line, sent);
        if (why.length) found.kept.push({ id: line.id, why: why.join('; '), kept: line.kept });
        continue;
      }
      const voiceId = voices[line.speaker];
      const key = cacheKey({ text: sent.text, voiceId, seed: sent.seed, context: sent.context });
      const changed = sent.text !== line.text || sent.context !== undefined || sent.seed !== line.seed;
      const reasons = [];
      if (!sha) {
        reasons.push('no MP3 yet');
      } else if (record) {
        if (record.key !== key) reasons.push(changed ? `the lexicon changed its request (${recipes})` : 'made from another request (a recipe, seed or voice changed since)');
        else if (record.mp3 !== sha) reasons.push('its MP3 was changed after the tool made it');
      } else {
        const raw = { text: line.text, voiceId, seed: line.seed };
        const v3 = cacheKey({ ...raw, model: 'eleven_v3' });
        const from = madeFrom(mp3, [...new Set([key, cacheKey(raw), v3])], caches);
        if (from === null && set !== 'kafli1') {
          found.unknown.push({ id: line.id, why: `no record, and no cached take matches its length${changed ? `; the lexicon would send it otherwise (${recipes})` : ''}` });
          continue;
        }
        if (from === v3) reasons.push('an eleven_v3 take');
        else if (from === null) reasons.push('no record and no cached take: eleven_v3, made before the switch to v4 on 2026-10-18');
        if (from !== key && changed) reasons.push(`the lexicon changes its request (${recipes})`);
      }
      if (reasons.length) found.make.push({ id: line.id, speaker: line.speaker, reasons, sent: { text: sent.text, context: sent.context, seed: sent.seed }, cached: caches.some(dir => fs.existsSync(path.join(dir, `${key}.mp3`))), unchosen, ...(line.optional ? { optional: true } : {}) });
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

/** --plan: prints regenerationPlan, set by set, with the commands to run, and the book's stale words. */
export function printPlan({ root, log }) {
  const plan = regenerationPlan(root);
  let lines = 0;
  let characters = 0;
  log('Lines to make again: the MP3 is not of the request the lexicon makes now (or an eleven_v3 take). Kept lines are never made again.');
  for (const [set, found] of Object.entries(plan)) {
    log('');
    log(`${set}: ${found.make.length} to make, ${found.unknown.length} unknown, ${found.waiting.length} waiting for a pick, ${found.kept.length} kept to know about, ${found.stale.length} stale entries, ${found.current} as they should be`);
    for (const item of found.make) {
      log(`  ${item.id}: ${item.reasons.join('; ')}${item.optional ? ' (optional: its caption alone until made)' : ''}${item.cached ? ' (cached)' : ''}`);
      if (!item.cached) { lines++; characters += item.sent.text.length; }
    }
    for (const item of found.unknown) log(`  unknown, listen before making it again: ${item.id} (${item.why})`);
    if (found.waiting.length) log(`  waiting (sent as written until the owner picks): ${found.waiting.map(item => `${item.id} (${item.words.join(', ')})`).join(', ')}`);
    for (const item of found.kept) log(`  kept, never made again: ${item.id} (${item.why})`);
    for (const item of found.stale) log(`  stale entry: ${item.id} (${item.why}): node remake/tools/audio-lines.mjs`);
    if (found.make.length) for (const command of planCommands(set, found.make.map(item => item.id))) log(`  ${command}`);
  }
  log('');
  log(`In all: ${Object.values(plan).reduce((n, found) => n + found.make.length, 0)} lines to make, ${lines} of them to ask ElevenLabs for (${characters} characters).`);
  if (fs.existsSync(path.join(root, BOOK))) {
    const stale = staleBookWords(bookStatus(root, readLexicon(root), readVoices(root)));
    if (stale.length) log(bookHint(stale));
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------
// The A/B pages, and kept lines under a new rule

const AB = 'qa/remake/voices/ab';

/** A set's A/B rounds, oldest first: old-<n>/ (old/, the first round's folder before rounds were numbered, is round 1). */
function roundsOf(root, set) {
  const dir = path.join(root, AB, set);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => { const match = /^old(?:-(\d+))?$/.exec(entry.name); return match ? { n: match[1] ? Number(match[1]) : 1, dir: entry.name } : null; })
    .filter(Boolean).sort((a, b) => a.n - b.n);
}

/** kept-new/made.json: the new takes --remake-kept made of a set's kept lines, id -> { key, mp3, duration, sent, kept, applied? }. */
const keptNewFolder = (root, set) => path.join(root, AB, set, 'kept-new');
function readKeptNew(root, set) {
  const file = path.join(keptNewFolder(root, set), 'made.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}
function writeKeptNew(root, set, record) {
  const file = path.join(keptNewFolder(root, set), 'made.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.part`, `${JSON.stringify(record, null, 1)}\n`);
  fs.renameSync(`${file}.part`, file);
}

/** What a request sends, in a line for the page (when it differs from the text). */
const howSent = (line, sent) => [sent.text !== line.text ? `sent: ${sent.text}` : '', sent.context ? `samhengi (ekki talað): ${sent.context}` : '', sent.seed === undefined ? '' : `fræ ${sent.seed}`].filter(Boolean).join(' · ');

/** Writes a set's A/B page: the last round's lines, and the kept lines whose new take waits for the owner. Returns what it shows. */
function writeAbPage(root, set) {
  const lexicon = readLexicon(root);
  const lines = linesOf(root, set);
  const rounds = roundsOf(root, set);
  const latest = rounds.at(-1);
  const live = id => `../../../../${folderOf(set)}/${id}.mp3`;
  const inRound = latest ? new Set(fs.readdirSync(path.join(root, AB, set, latest.dir)).filter(name => name.endsWith('.mp3')).map(name => name.slice(0, -4))) : new Set();
  const made = lines.filter(line => inRound.has(line.id)).map(line => ({
    id: line.id, speaker: line.speaker, text: line.text, how: howSent(line, requestFor(line, lexicon)), oldSrc: `${set}/${latest.dir}/${line.id}.mp3`, newSrc: live(line.id),
  }));
  const pending = readKeptNew(root, set);
  const kept = lines.filter(line => pending[line.id] && !pending[line.id].applied).map(line => ({
    id: line.id, speaker: line.speaker, text: line.text, how: howSent(line, pending[line.id].sent), kept: pending[line.id].kept, oldSrc: live(line.id), newSrc: `${set}/kept-new/${line.id}.mp3`,
  }));
  fs.mkdirSync(path.join(root, AB), { recursive: true });
  fs.writeFileSync(path.join(root, AB, `${set}.html`), abHtml({ set, round: latest?.n ?? null, earlier: rounds.slice(0, -1).map(round => round.n), made, kept }));
  return { round: latest?.n ?? null, made: made.map(item => item.id), kept: kept.map(item => item.id) };
}

/**
 * --ab <set>: snapshots the MP3s of the lines about to be made again (the plan's, or --only's) into a new round,
 * qa/remake/voices/ab/<set>/old-<n>/, when any of them differs from its copy in the last round (so run it BEFORE making them; run
 * again before they are made, it copies nothing), and writes qa/remake/voices/ab/<set>.html. Asks nothing.
 */
export function abPage({ root, set, only = null, log }) {
  const lines = linesOf(root, set);
  if (only) {
    const unknown = only.filter(id => !lines.some(line => line.id === id));
    if (unknown.length) throw new Error(`Not in ${set}: ${unknown.join(', ')}`);
  }
  const planned = only ?? regenerationPlan(root)[set]?.make.map(item => item.id) ?? [];
  const live = id => path.join(root, folderOf(set), `${id}.mp3`);
  const latest = roundsOf(root, set).at(-1);
  const copyOf = id => (latest ? path.join(root, AB, set, latest.dir, `${id}.mp3`) : null);
  const changed = planned.filter(id => fs.existsSync(live(id)) && !(copyOf(id) && fs.existsSync(copyOf(id)) && sha256(copyOf(id)) === sha256(live(id))));
  let copied = 0;
  let round = latest?.n ?? null;
  if (changed.length) {
    round = (latest?.n ?? 0) + 1;
    const folder = path.join(root, AB, set, `old-${round}`);
    fs.mkdirSync(folder, { recursive: true });
    for (const id of planned) if (fs.existsSync(live(id))) { fs.copyFileSync(live(id), path.join(folder, `${id}.mp3`)); copied++; }
  }
  const shown = writeAbPage(root, set);
  log(`${copied ? `${copied} takes copied into ${AB}/${set}/old-${round}/ (round ${round})` : `nothing new to copy${round ? ` (round ${round} stands)` : ''}`}; ${AB}/${set}.html shows ${shown.made.length} lines of the round and ${shown.kept.length} kept lines with a new take.`);
  return { planned, copied, round, shown: shown.made };
}

/**
 * --remake-kept <set>: for each kept line of the set whose words now have a chosen rule (or whose kept note is a v3 take or names a
 * recipe), makes the take the tool would make if the line were not kept, mastered into qa/remake/voices/ab/<set>/kept-new/<id>.mp3,
 * remembers its request in kept-new/made.json and adds the line to the set's A/B page. The game's MP3, lines-source.json, lines.json
 * and the record are not touched. Returns the ids made.
 */
export async function remakeKept({ root, key, fetch, set, only = null, log }) {
  const lexicon = readLexicon(root);
  const voices = readVoices(root);
  const lines = readLines(root, set);
  if (only) {
    const unknown = only.filter(id => !lines.some(line => line.id === id && line.kept !== undefined));
    if (unknown.length) throw new Error(`Not kept lines of ${sourceOf(set)}: ${unknown.join(', ')}`);
  }
  const chosen = lines.filter(line => line.kept !== undefined && (only ? only.includes(line.id) : keptWhy(line, requestFor(line, lexicon)).length));
  const missing = [...new Set(chosen.map(line => line.speaker))].filter(speaker => typeof voices[speaker] !== 'string' || !voices[speaker]);
  if (missing.length) throw new Error(`No voice is chosen for ${missing.join(' and ')} in ${VOICES}. No request was made.`);
  needAudioTools();
  const record = readKeptNew(root, set);
  for (const line of chosen) {
    const { kept, ...plain } = line;
    const sent = requestFor(plain, lexicon); // what generate would send if the line were not kept
    const voiceId = voices[line.speaker];
    const raw = await take({ root, key, fetch, text: sent.text, voiceId, seed: sent.seed, context: sent.context, log });
    const target = path.join(keptNewFolder(root, set), `${line.id}.mp3`);
    const seconds = master(raw, target);
    record[line.id] = { key: cacheKey({ text: sent.text, voiceId, seed: sent.seed, context: sent.context }), mp3: sha256(target), duration: seconds, sent: { text: sent.text, context: sent.context, seed: sent.seed }, kept };
    writeKeptNew(root, set, record);
    log(`Ready kept-new/${line.id}.mp3: ${seconds} s (the game keeps its take until --ab-apply)`);
  }
  const shown = writeAbPage(root, set);
  log(`${chosen.length} new takes of kept lines in ${AB}/${set}/kept-new/; ${AB}/${set}.html shows ${shown.kept.length} kept lines with a new take. After the owner's choices: node remake/tools/voice-lines.mjs --ab-apply ${set} ab-${set}.json`);
  return chosen.map(line => line.id);
}

/** lines-source.json as its files are written: one line per line of the set, its fields in their order. */
const linesSourceText = lines => `[\n${lines.map(line => ` { ${Object.entries(line).map(([field, value]) => `${JSON.stringify(field)}: ${JSON.stringify(value)}`).join(', ')} }`).join(',\n')}\n]\n`;

/**
 * --ab-apply <set> <ab-set.json>: installs the new take of every kept line --remake-kept made for the set that the owner did not mark
 * "Gamla" in the file his A/B page saved: copies it into the set's folder, takes "kept" away in lines-source.json, renews its entry in
 * lines.json and records its request in voices-made.json. A line marked "Gamla" keeps its take and its "kept". Everything is checked
 * before anything changes. Asks nothing. Returns { installed, keptOld }.
 */
export function abApply({ root, set, file, log }) {
  const saved = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (saved?.set !== set || !saved.choices || typeof saved.choices !== 'object') throw new Error(`${file} is not the A/B page's choices for ${set} ({ "set": "${set}", "choices": { ... } }). Nothing was changed.`);
  const record = readKeptNew(root, set);
  const pending = Object.entries(record).filter(([, item]) => !item.applied);
  if (!pending.length) throw new Error(`No new takes of kept lines wait in ${AB}/${set}/kept-new/: run --remake-kept ${set} first. Nothing was changed.`);
  const source = path.join(root, sourceOf(set));
  const lines = JSON.parse(fs.readFileSync(source, 'utf8'));
  readLines(root, set); // checked as the tool checks it
  const install = [];
  const keptOld = [];
  for (const [id, item] of pending) {
    const line = lines.find(entry => entry.id === id);
    if (!line) throw new Error(`${id} is no longer in ${sourceOf(set)}. Nothing was changed.`);
    if (saved.choices[id] === 'gamla') { keptOld.push(id); continue; }
    if (line.kept === undefined) throw new Error(`${id} is not kept any more in ${sourceOf(set)}: its new take was made for a kept line. Nothing was changed.`);
    const take_ = path.join(keptNewFolder(root, set), `${id}.mp3`);
    if (!fs.existsSync(take_) || sha256(take_) !== item.mp3) throw new Error(`${AB}/${set}/kept-new/${id}.mp3 is not the take --remake-kept made (missing or changed). Nothing was changed.`);
    install.push([id, line, item, take_]);
  }
  const others = Object.entries(saved.choices).filter(([id, choice]) => choice === 'gamla' && !record[id]).map(([id]) => id);
  if (install.length) needAudioTools();
  for (const [id, line, item, take_] of install) {
    fs.copyFileSync(take_, path.join(root, folderOf(set), `${id}.mp3`));
    delete line.kept;
    recordMade(root, { [`${set}/${id}`]: { key: item.key, mp3: item.mp3, duration: item.duration, model: MODEL } });
  }
  if (install.length) {
    fs.writeFileSync(`${source}.part`, linesSourceText(lines));
    fs.renameSync(`${source}.part`, source);
    updateLines(root, install.map(([id]) => id), set);
  }
  const at = new Date().toISOString().slice(0, 10);
  for (const [id] of install) record[id].applied = `installed ${at}`;
  for (const id of keptOld) record[id].applied = `kept old ${at}`;
  writeKeptNew(root, set, record);
  writeAbPage(root, set);
  log(`${install.length} new takes installed in ${folderOf(set)}/ (no longer kept): ${install.map(([id]) => id).join(', ') || 'none'}; ${keptOld.length} kept as they were: ${keptOld.join(', ') || 'none'}.`);
  if (others.length) log(`Marked "Gamla" but made again earlier (not kept lines): ${others.join(', ')}. Their old takes are in ${AB}/${set}/old-<n>/; put one back by hand and mark it kept.`);
  return { installed: install.map(([id]) => id), keptOld };
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
  if (args.abApply) {
    abApply({ root, set: args.abApply.set, file: args.abApply.file, log });
    return;
  }
  const key = env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('Set ELEVENLABS_API_KEY in the local environment to make voices. No request was made.');
  try {
    if (args.book) {
      const rows = await book({ root, key, fetch, which: args.book, log });
      log(`${rows.length} auditions and the page are in ${BOOK}/ (index.html)`);
    } else if (args.remakeKept) {
      await remakeKept({ root, key, fetch, set: args.remakeKept, only: args.only, log });
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
