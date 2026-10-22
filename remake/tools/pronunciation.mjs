// The remake's pronunciation standard, remake/assets/audio/pronunciation.json: the hard words, each with every form the lines say,
// the recipes that can be sent in their place and the one the owner chose by ear. voice-lines.mjs and yatzy-junior-voices.mjs send
// every line through requestFor -> applyLexicon; nothing here asks ElevenLabs or knows a key.
//
// The file is written as JSON.stringify(lexicon, null, 2) plus a newline (lexiconText), and --pick rewrites it that way, so a choice
// changes one line of it. Edit it, or add candidates, with node (read, change, writeLexicon or lexiconText), not with Python's
// json.dumps, whose escapes and spacing differ: tests/pronunciation.test.mjs holds the file to that form.
import fs from 'node:fs';
import path from 'node:path';

export const LEXICON = 'remake/assets/audio/pronunciation.json';

const LETTER = '\\p{L}\\p{N}';
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isSeed = seed => Number.isInteger(seed) && seed >= 0 && seed <= 4294967295;
export const isText = value => typeof value === 'string' && value.trim().length > 0;
/** A pattern that finds these forms as whole words (case-sensitive; a letter or digit on either side is another word). */
export const formsPattern = (forms, flags = 'u') => new RegExp(`(?<![${LETTER}])(?:${[...forms].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})(?![${LETTER}])`, flags);

/** Checks a lexicon before a credit is spent: a wrong entry stops the run. Returns it. */
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

/** The lexicon of a repo root, checked. Without it the tools send nothing. */
export function readLexicon(root) {
  const file = path.join(root, LEXICON);
  if (!fs.existsSync(file)) throw new Error(`${LEXICON} is missing: no line is sent without the pronunciation standard. No request was made.`);
  return checkLexicon(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** The lexicon as its file holds it: two-space JSON and a newline. */
export const lexiconText = lexicon => `${JSON.stringify(lexicon, null, 2)}\n`;

/** Writes a checked lexicon in its form, through a .part file renamed into place, so a failed write never leaves half a file. */
export function writeLexicon(root, lexicon) {
  checkLexicon(lexicon);
  const file = path.join(root, LEXICON);
  fs.writeFileSync(`${file}.part`, lexiconText(lexicon));
  fs.renameSync(`${file}.part`, file);
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

/**
 * A word of the lexicon by what the owner or a picks.json calls it, in three steps; the first step that fits any word decides:
 *   1. its id ("kambedla"): ids are unique, and picks.json names words by id, so an id always wins, also when it is another
 *      word's form too ("ein" is the id of Ein and a form of ein-inni: ein-inni is named by its id);
 *   2. its name as written ("Kambeðla") or one of its forms ("Kambeðlu");
 *   3. its name in any case ("kambeðla").
 * A step that fits more than one word is refused, with the ids to use instead: a name is preferred to nothing only when it is
 * unambiguous.
 */
export function resolveWord(lexicon, name) {
  const entries = Object.entries(lexicon.words);
  const steps = [
    ([id]) => id === name,
    ([, entry]) => entry.word === name || entry.forms.includes(name),
    ([, entry]) => entry.word.toLowerCase() === String(name).toLowerCase(),
  ];
  for (const step of steps) {
    const fits = entries.filter(step).map(([id]) => id);
    if (fits.length === 1) return fits[0];
    if (fits.length > 1) throw new Error(`${name} could mean ${fits.join(' or ')}: name the word by its id.`);
  }
  throw new Error(`${name} is not a word of ${LEXICON}; the words are ${entries.map(([id]) => id).join(', ')} (or all).`);
}

/** The lexicon with one word's recipe chosen, for an audition: every other word keeps the owner's choice. */
export const withChoice = (lexicon, id, recipe) => ({ ...lexicon, words: { ...lexicon.words, [id]: { ...lexicon.words[id], chosen: recipe } } });
