#!/usr/bin/env node
// THE OWNER'S EAR, in the repo. The owner listens to a set's recordings on the yes/no page (voice-lines.mjs --yesno <set>) and saves
// jano-<set>.json: { "set", "choices": { "<id>": "ja" | "nei" }, "notes": { "<id>": "..." } }. That file stays his (in his
// Downloads); this tool imports it into remake/assets/audio/heard/<YYYY-MM-DD>-<set>.json (-2, -3 when the name is taken), one
// file per import so branches never meet in one file:
//   { "set", "date", "source": "<the file's own name>", "verdicts": { "<set>/<id>": { "verdict", "key", "mp3", "speaker", "text", "note"? } } }
// Each verdict is bound to the request he heard: "key" is the cache key of that take's request (voice-lines.mjs cacheKey) and "mp3"
// the sha256 of the MP3 the page played, both read from the record, voices-made.json (this checkout's, or --made another
// checkout's, for lines made on another branch). A line the record does not know is refused: no request, no verdict.
//
// THE GUARD. assertNotRejected(heard, key, label) throws when the latest verdict on exactly that request is "nei". The voice tools
// call it for every game line before anything is asked for or installed (voice-lines.mjs making lines, --remake-kept and
// --ab-apply; yatzy-junior-voices.mjs; sloedla-dj.mjs), so a take the owner rejected never comes back by cache or by chance. There is
// no flag to pass it: change the line's recipe or seed (in pronunciation.json, or the line's own fields) and the request is
// another. --audition and --book try recipes on purpose and are not guarded. voice-lines.mjs --plan lists the lines whose shipped
// take he rejected; tests/heard.test.mjs fails on one unless tests/waiting-for-new-take.mjs names it.
//
// THE EVIDENCE. A line that carries its own say or context names what it fixes in "fixes" (a book word id or a list of them,
// "punctuation" or "line"). fixesByWord gathers them per word, and evidenceFor tells voice-lines.mjs --dry, line by line, where
// each of its words was fixed on a line of its own and whether this exact request was rejected: the recipe that already won is
// tried first.
//
//   node remake/tools/heard.mjs <jano.json> [--made <voices-made.json>] [--date YYYY-MM-DD]
// Asks ElevenLabs nothing and knows no key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MULTI_LINES, VOICE_LINES } from '../engine/yatzy-junior/voice-lines.js';
import { formsPattern } from './pronunciation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Where the imports are kept, relative to the repo root: one file per import. */
export const HEARD = 'remake/assets/audio/heard';
const AUDIO = 'remake/assets/audio';
const MADE = `${AUDIO}/voices-made.json`;
const JUNIOR = 'yatzy-junior';

const HEX = /^[0-9a-f]{64}$/;
const SET = /^[a-z][a-z0-9-]*$/;
const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
const FILE_NAME = /^(\d{4}-\d{2}-\d{2})-([a-z][a-z0-9-]*?)(?:-(\d+))?\.json$/;
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value);
};
const VERDICT_FIELDS = ['verdict', 'key', 'mp3', 'speaker', 'text', 'note'];

/** Checks one heard file (its name and what it holds); throws with what is wrong. Returns its date, set and number (1, 2, ...). */
export function checkHeardFile(name, data) {
  const fail = why => { throw new Error(`${HEARD}/${name}: ${why}`); };
  const match = FILE_NAME.exec(name);
  if (!match) fail('is not named <YYYY-MM-DD>-<set>.json (or -2, -3, ... when the name was taken).');
  const [, date, set, n] = match;
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('is an object: { set, date, source, verdicts }.');
  const unknown = Object.keys(data).filter(key => !['set', 'date', 'source', 'verdicts'].includes(key));
  if (unknown.length) fail(`has ${unknown.join(', ')}; a heard file holds set, date, source and verdicts only.`);
  if (typeof data.set !== 'string' || !SET.test(data.set) || data.set !== set) fail(`"set" is the set its name says (${set}).`);
  if (!isDate(data.date) || data.date !== date) fail(`"date" is the date its name says (${date}).`);
  if (!isText(data.source)) fail('"source" is the name of the file the owner saved.');
  if (!data.verdicts || typeof data.verdicts !== 'object' || Array.isArray(data.verdicts) || !Object.keys(data.verdicts).length) fail('"verdicts" is "<set>/<id>" -> a verdict, at least one.');
  for (const [id, verdict] of Object.entries(data.verdicts)) {
    const [lineSet, lineId, extra] = id.split('/');
    if (lineSet !== data.set || !ID.test(lineId ?? '') || extra !== undefined) fail(`${JSON.stringify(id)} is not "${data.set}/<id>".`);
    const odd = Object.keys(verdict ?? {}).filter(key => !VERDICT_FIELDS.includes(key));
    if (odd.length) fail(`${id} has ${odd.join(', ')}; a verdict holds ${VERDICT_FIELDS.join(', ')} only.`);
    if (!['ja', 'nei'].includes(verdict.verdict)) fail(`${id}: "verdict" is "ja" or "nei".`);
    if (!HEX.test(verdict.key ?? '')) fail(`${id}: "key" is the 64-hex cache key of the request heard.`);
    if (!HEX.test(verdict.mp3 ?? '')) fail(`${id}: "mp3" is the 64-hex sha256 of the MP3 heard.`);
    if (!isText(verdict.speaker) || !isText(verdict.text)) fail(`${id}: "speaker" and "text" say who said what.`);
    if (verdict.note !== undefined && !isText(verdict.note)) fail(`${id}: "note" is what the owner wrote, or left out.`);
  }
  return { date, set, n: n ? Number(n) : 1 };
}

/**
 * Every verdict of a repo root, oldest first: by date, then by import (a name's -2 after it), then by set. Returns
 * { files, verdicts, byKey }: `verdicts` [{ id: "<set>/<id>", verdict, key, mp3, speaker, text, note?, date, file }] and `byKey`,
 * request key -> its verdicts in date order. A root with no heard folder has none.
 */
export function readHeard(root) {
  const dir = path.join(root, HEARD);
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.json')) : [];
  const files = names.map(name => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    return { name, data, ...checkHeardFile(name, data) };
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.n - b.n || (a.set < b.set ? -1 : a.set > b.set ? 1 : 0)));
  const verdicts = files.flatMap(({ name, data }) => Object.entries(data.verdicts).map(([id, verdict]) => ({ id, ...verdict, date: data.date, file: `${HEARD}/${name}` })));
  const byKey = new Map();
  for (const verdict of verdicts) {
    if (!byKey.has(verdict.key)) byKey.set(verdict.key, []);
    byKey.get(verdict.key).push(verdict);
  }
  return { files: files.map(({ name, data }) => ({ file: `${HEARD}/${name}`, ...data })), verdicts, byKey };
}

/** The latest verdict on a request key when it is "nei" (the owner rejected exactly that request), else null. */
export function rejection(heard, key) {
  const latest = heard.byKey.get(key)?.at(-1);
  return latest?.verdict === 'nei' ? latest : null;
}

/** Throws when the owner rejected exactly this request; `label` names the line about to be sent or installed. There is no way past it but another request. */
export function assertNotRejected(heard, key, label) {
  const no = rejection(heard, key);
  if (no) throw new Error(`${label ? `${label}: ` : ''}The owner rejected exactly this request (${no.id}, ${no.date}): choose another recipe or seed.`);
}

/** The entries of a record ("<set>/<id>" -> { key, mp3, ... }) whose request the owner rejected: [{ id, key, by }], by the verdict that rejected it. */
export function rejectedIn(heard, record) {
  return Object.entries(record).flatMap(([id, entry]) => {
    const by = rejection(heard, entry.key);
    return by ? [{ id, key: entry.key, by }] : [];
  });
}

/** A record file's entries ({} when it has none). */
const readRecord = file => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).lines ?? {} : {});

/** The speaker and text of each line of a set, from the lines-source.json beside a record (Litla Yatzy's from its script: Mosi). */
function linesBeside(audioDir, set) {
  if (set === JUNIOR) return new Map(Object.entries({ ...VOICE_LINES, ...MULTI_LINES }).map(([id, line]) => [id, { speaker: 'mosi', text: line.text }]));
  const file = path.join(audioDir, set, 'lines-source.json');
  if (!fs.existsSync(file)) return new Map();
  return new Map(JSON.parse(fs.readFileSync(file, 'utf8')).map(line => [line.id, { speaker: line.speaker, text: line.text }]));
}

/** Today in the local calendar, YYYY-MM-DD. */
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

/**
 * Imports the owner's yes/no file (jano-<set>.json) into remake/assets/audio/heard/<date>-<set>.json: each line's verdict with the
 * request key and MP3 hash of the take he heard, read from `made` (another checkout's voices-made.json, whose lines-source.json files
 * beside it give speaker and text) or this checkout's record. His file is only read. Everything is checked before the file is
 * written: an id the record does not know is refused. Returns { file, set, date, verdicts, ja, nei }.
 */
export function importJano(root, file, { made = null, date = today() } = {}) {
  const fail = why => { throw new Error(`${file}: ${why} Nothing was written.`); };
  const saved = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!saved || typeof saved !== 'object' || !SET.test(saved.set ?? '')) fail('is not a yes/no page\'s file: { "set": "<set>", "choices": { "<id>": "ja" | "nei" }, "notes": { ... } }.');
  const { set } = saved;
  if (!saved.choices || typeof saved.choices !== 'object' || Array.isArray(saved.choices) || !Object.keys(saved.choices).length) fail('has no "choices".');
  if (saved.notes !== undefined && (typeof saved.notes !== 'object' || saved.notes === null || Array.isArray(saved.notes))) fail('"notes" is id -> what the owner wrote.');
  if (!isDate(date)) fail(`${JSON.stringify(date)} is not a date (YYYY-MM-DD).`);
  const recordFile = made ? path.resolve(made) : path.join(root, MADE);
  if (!fs.existsSync(recordFile)) fail(`the record ${recordFile} is not there.`);
  const record = readRecord(recordFile);
  const lines = linesBeside(path.dirname(recordFile), set);
  const verdicts = {};
  const unknown = [];
  for (const [id, choice] of Object.entries(saved.choices)) {
    if (!ID.test(id)) fail(`${JSON.stringify(id)} is not a line id.`);
    if (!['ja', 'nei'].includes(choice)) fail(`${id}: ${JSON.stringify(choice)} is not "ja" or "nei".`);
    const entry = record[`${set}/${id}`];
    const line = lines.get(id);
    if (!entry || !line) { unknown.push(id); continue; }
    const note = saved.notes?.[id];
    verdicts[`${set}/${id}`] = { verdict: choice, key: entry.key, mp3: entry.mp3, speaker: line.speaker, text: line.text, ...(isText(note) ? { note: note.trim() } : {}) };
  }
  if (unknown.length) fail(`${unknown.map(id => `${set}/${id}`).join(', ')} ${unknown.length > 1 ? 'are' : 'is'} not in the record ${recordFile} (or ${unknown.length > 1 ? 'their lines are' : 'its line is'} not beside it): no request is known, so no verdict can be kept. For lines made on another branch, give --made <that checkout>/remake/assets/audio/voices-made.json, as it was when the owner listened.`);
  const data = { set, date, source: path.basename(file), verdicts };
  const dir = path.join(root, HEARD);
  const taken = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  for (const name of taken.filter(name => name.endsWith('.json'))) {
    const other = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (other.set === set && other.source === data.source && JSON.stringify(other.verdicts) === JSON.stringify(verdicts)) fail(`it is already imported, as ${HEARD}/${name}.`);
  }
  let name = `${date}-${set}.json`;
  for (let n = 2; taken.includes(name); n++) name = `${date}-${set}-${n}.json`;
  checkHeardFile(name, data);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.part`), `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(path.join(dir, `${name}.part`), path.join(dir, name));
  const all = Object.values(verdicts);
  return { file: `${HEARD}/${name}`, set, date, verdicts, ja: all.filter(item => item.verdict === 'ja').length, nei: all.filter(item => item.verdict === 'nei').length };
}

// ---------------------------------------------------------------------------------------------
// The evidence: where each book word was fixed on a line of its own

/** A text with its punctuation and spaces taken away: two texts alike but for those are the same words. */
const bare = text => text.replace(/[^\p{L}\p{N}]/gu, '');

/**
 * What is wrong with a line's `fixes` ([] when nothing): a line that carries its own say or context names what it fixes, either a
 * book word id or a list of them (each in the book and said in the line), "punctuation" (its say differs from its text in
 * punctuation and spaces alone, and it has no context) or "line" (a fix of the whole line's tone, and its note says "whole line").
 * A line with only a seed or kept needs none. `line` carries `set` and `id` (voice-lines.mjs allLines).
 */
export function fixesProblems(line, lexicon) {
  const where = `${line.set}/${line.id}`;
  const own = line.say !== undefined || line.context !== undefined;
  if (!own) return line.fixes === undefined ? [] : [`${where}: "fixes" without a say or context of its own; take it away.`];
  const { fixes } = line;
  if (fixes === undefined) return [`${where}: carries its own ${['say', 'context'].filter(field => line[field] !== undefined).join(' and ')} but no "fixes": name the book word it fixes (add the word to pronunciation.json with "chosen": null and a "hratt" recipe if it has no entry), or "punctuation", or "line" with a note that says it fixes the whole line.`];
  if (fixes === 'punctuation') {
    if (line.context !== undefined) return [`${where}: "punctuation" fixes have no context; name the word it fixes, or "line".`];
    if (line.say === line.text || bare(line.say) !== bare(line.text)) return [`${where}: "punctuation", but its say differs from its text in more than punctuation and spaces (or not at all).`];
    return [];
  }
  if (fixes === 'line') return /whole line/i.test(line.note ?? '') ? [] : [`${where}: "line" fixes say so in the note ("... fixes the whole line ...").`];
  const ids = [fixes].flat();
  if (!ids.length || !ids.every(id => typeof id === 'string' && id.trim())) return [`${where}: "fixes" is a book word id, a list of them, "punctuation" or "line".`];
  const problems = [];
  if (new Set(ids).size !== ids.length) problems.push(`${where}: a word twice in "fixes".`);
  for (const id of ids) {
    const entry = lexicon.words[id];
    if (!entry) problems.push(`${where}: ${JSON.stringify(id)} is not a word of pronunciation.json (add it with "chosen": null and a "hratt" recipe, its stem and forms passing pronunciation.test).`);
    else if (!formsPattern(entry.forms).test(line.text)) problems.push(`${where}: fixes ${id}, but the line does not say ${entry.forms.join(' or ')}.`);
  }
  return problems;
}

/** A line's `fixes` as a list: the book word ids it names ("punctuation" and "line" name none). */
export const fixedWords = line => (line.fixes === undefined || line.fixes === 'punctuation' || line.fixes === 'line' ? [] : [line.fixes].flat());

/** Every line-level fix, by the book word it names: word id -> [{ where: "<set>/<id>", say?, context?, seed? }]. */
export function fixesByWord(lines) {
  const out = new Map();
  for (const line of lines) {
    for (const id of fixedWords(line)) {
      if (!out.has(id)) out.set(id, []);
      out.get(id).push({ where: `${line.set}/${line.id}`, ...Object.fromEntries(['say', 'context', 'seed'].filter(field => line[field] !== undefined).map(field => [field, line[field]])) });
    }
  }
  return out;
}

/** How a recipe or a line's own fields read in a note: say, context, seed. */
const fields = ({ say, context, seed }) => [say === undefined ? null : `say ${JSON.stringify(typeof say === 'string' ? say : Object.values(say).join(' | '))}`, context === undefined ? null : `context ${JSON.stringify(typeof context === 'string' ? context : Object.values(context).join(' | '))}`, seed === undefined ? null : `seed ${seed}`].filter(Boolean).join(', ');

/** The book's default for a word: its chosen recipe and what it sends. */
function bookDefault(entry) {
  if (!entry.chosen) return 'not chosen, sent as written';
  const how = fields(entry.recipes[entry.chosen]);
  return `${entry.chosen}${how ? ` (${how})` : ', sent as written'}`;
}

/**
 * What a session should know before it records a line: for each book word in it, the lines elsewhere that fixed that word on their
 * own ("Einn: fixed on its own line in yatzy-junior/smallStraight (context ..., seed 7); the book's default is hratt-frae7 (seed 7).")
 * and, first, whether the owner rejected exactly this request. `words` are requestFor's words, `key` the request's cache key (or
 * null), `fixes` fixesByWord of every line. Returns the notes, [] when there is nothing to know.
 */
export function evidenceFor({ where, words, key, lexicon, fixes, heard }) {
  const notes = [];
  const no = key ? rejection(heard, key) : null;
  if (no) notes.push(`REJECTED: the owner rejected exactly this request (${no.id}, ${no.date}${no.note ? `: ${JSON.stringify(no.note)}` : ''}): choose another recipe or seed.`);
  for (const word of words) {
    const elsewhere = (fixes.get(word.id) ?? []).filter(fix => fix.where !== where);
    if (!elsewhere.length) continue;
    const entry = lexicon.words[word.id];
    notes.push(`${entry.word}: fixed on its own line in ${elsewhere.map(fix => `${fix.where} (${fields(fix)})`).join('; ')}; the book's default is ${bookDefault(entry)}.`);
  }
  return notes;
}

// ---------------------------------------------------------------------------------------------

/** The command line: the jano file, --made and --date. */
export function parseArgs(argv) {
  const args = { file: null, made: null, date: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--made' || arg === '--date') {
      const next = argv[++i];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs ${arg === '--made' ? 'a voices-made.json' : 'a date, YYYY-MM-DD'}.`);
      args[arg.slice(2)] = next;
    } else if (!arg.startsWith('--') && args.file === null) {
      args.file = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}\nUsage: heard.mjs <jano.json> [--made <voices-made.json>] [--date YYYY-MM-DD]`);
    }
  }
  if (!args.file) throw new Error('Usage: heard.mjs <jano.json> [--made <voices-made.json>] [--date YYYY-MM-DD]');
  return args;
}

export function main(argv, { root = ROOT, log = console.log } = {}) {
  const args = parseArgs(argv);
  const done = importJano(root, args.file, { made: args.made, ...(args.date ? { date: args.date } : {}) });
  log(`${done.file}: ${done.ja + done.nei} verdicts of ${done.set}, ${done.ja} ja and ${done.nei} nei (from ${path.basename(args.file)}, left where it is).`);
  for (const [id, verdict] of Object.entries(done.verdicts)) if (verdict.verdict === 'nei') log(`  nei: ${id} ${JSON.stringify(verdict.text)}${verdict.note ? ` (${verdict.note})` : ''}`);
  const shipped = rejectedIn(readHeard(root), readRecord(path.join(root, MADE)));
  log(shipped.length ? `This checkout ships ${shipped.length} rejected request${shipped.length > 1 ? 's' : ''}: ${shipped.map(item => `${item.id} (as ${item.by.id})`).join(', ')}. Make ${shipped.length > 1 ? 'them' : 'it'} again with another recipe or seed (node remake/tools/voice-lines.mjs --plan).` : 'This checkout ships no rejected request.');
  log(`Commit ${done.file}.`);
  return done;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`heard: ${error.message}`);
    process.exitCode = 1;
  }
}
