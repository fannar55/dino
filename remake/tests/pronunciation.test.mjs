import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SETS } from '../tools/audio-lines.mjs';
import { VOICE_LINES } from '../engine/yatzy-junior/voice-lines.js';

// The pronunciation standard (remake/assets/audio/pronunciation.json): one entry per hard word, which the voice tools apply to
// every line they send. These tests hold the lexicon to the texts: every inflection of a hard word that any line says is one of
// its forms, the six recipes that won the owner's ear are the chosen ones, and the text the child sees never carries a recipe.

const file = relative => fileURLToPath(new URL(relative, import.meta.url));
const readJson = path_ => JSON.parse(fs.readFileSync(path_, 'utf8'));
const LEXICON = readJson(file('../assets/audio/pronunciation.json'));
const ENTRIES = Object.entries(LEXICON.words);

/** Every line any voice says: the five sets and Litla Yatzy's Mosi lines (its own tool, the same lexicon). */
function corpus() {
  const lines = [];
  for (const set of Object.keys(SETS)) {
    for (const line of readJson(file(`../../${SETS[set]}/lines-source.json`))) lines.push({ set, ...line });
  }
  for (const [id, line] of Object.entries(VOICE_LINES)) lines.push({ set: 'yatzy-junior', id, speaker: 'mosi', text: line.text });
  return lines;
}
const tokens = text => text.match(/\p{L}+/gu) ?? [];

test('the lexicon has the hard words the analysis names, each with forms, a stem, recipes (raw among them) and a chosen recipe or null', () => {
  for (const id of ['kambedla', 'snigill', 'eitt', 'ein', 'mundu', 'flugedla', 'thorsedla', 'uggedla', 'sloedla', 'gramedla', 'egill', 'oglir', 'stjornuhatid', 'thribroti']) {
    assert.ok(Object.hasOwn(LEXICON.words, id), `${id} is in the lexicon`);
  }
  const owners = new Map();
  for (const [id, entry] of ENTRIES) {
    assert.match(id, /^[a-z][a-z0-9-]*$/, `${id}: an ASCII id (it names the book's folder)`);
    assert.ok(typeof entry.word === 'string' && entry.word.length, `${id}: word`);
    const stem = new RegExp(`^(?:${entry.stem})`, 'u');
    assert.ok(Array.isArray(entry.forms) && entry.forms.length, `${id}: forms`);
    for (const form of entry.forms) {
      assert.match(form, /^\p{L}+$/u, `${id}: ${form} is one word`);
      assert.ok(stem.test(form), `${id}: ${form} fits its stem ${entry.stem}`);
      assert.ok(!owners.has(form), `${form} is a form of ${owners.get(form)} and of ${id}`);
      owners.set(form, id);
    }
    assert.ok(entry.recipes.hratt && Object.keys(entry.recipes.hratt).join() === 'note', `${id}: "hratt" sends the word as written`);
    for (const [name, recipe] of Object.entries(entry.recipes)) {
      assert.match(name, /^[a-z][a-z0-9-]*$/, `${id}: recipe ${name} names a file`);
      assert.ok(typeof recipe.note === 'string' && recipe.note.length > 10, `${id}.${name}: a note for the owner`);
      if (recipe.say && typeof recipe.say === 'object') assert.deepEqual(Object.keys(recipe.say).sort(), [...entry.forms].sort(), `${id}.${name}: say gives every form`);
    }
    assert.ok(entry.chosen === null || Object.hasOwn(entry.recipes, entry.chosen), `${id}: chosen is a recipe or null`);
  }
});

test('the lexicon covers every inflection of every hard word in all the sets and Litla Yatzy', () => {
  const lines = corpus();
  assert.ok(lines.length > 400, `${lines.length} lines read`);
  const uncovered = [];
  for (const [id, entry] of ENTRIES) {
    const stem = new RegExp(`^(?:${entry.stem})`, 'u');
    const known = new Set([...entry.forms, ...(entry.except ?? [])]);
    for (const line of lines) {
      for (const token of tokens(line.text)) if (stem.test(token) && !known.has(token)) uncovered.push(`${token} (${id}) in ${line.set}/${line.id}`);
    }
  }
  assert.deepEqual(uncovered, [], 'add each to the forms of its word in remake/assets/audio/pronunciation.json (and a say for it in each recipe that has one)');
});

test('the six recipes that won the owner\'s ear are chosen, exactly as they were sent', () => {
  const visit = 'Fyrst heimsækjum við Kambeðlu vinkonu mína. Plöturnar á bakinu hennar lýsa eins og ljósker!';
  const chosen = id => LEXICON.words[id].recipes[LEXICON.words[id].chosen];
  assert.equal(chosen('kambedla').context, visit);
  assert.ok([1, 42].includes(chosen('kambedla').seed));
  assert.equal(chosen('snigill').say.Snigill, '"/ˈstniːjɪtl̥/"');
  assert.equal(chosen('eitt').say.Eitt, 'Eiht');
  assert.equal(chosen('ein').say.Ein, 'Eyn');
  assert.equal(chosen('mundu').context, 'Mundu að ýta á Eitt!');
  assert.equal(chosen('mundu').seed, 1);
  assert.equal(chosen('flugedla').say.Flugeðlan, '"/ˈflʏːɣˌɛðlan/"');
  for (const id of ['thorsedla', 'uggedla', 'sloedla', 'gramedla', 'egill', 'oglir', 'stjornuhatid', 'thribroti']) {
    assert.equal(LEXICON.words[id].chosen, null, `${id} is unverified: the owner picks it in the book`);
    assert.ok(Object.keys(LEXICON.words[id].recipes).length >= 3, `${id}: candidates besides raw`);
  }
});

test('the text the child sees carries no recipe: no IPA and no respelling in any line or caption source', () => {
  const said = new Set();
  for (const [, entry] of ENTRIES) {
    for (const recipe of Object.values(entry.recipes)) {
      const says = recipe.say === undefined ? [] : typeof recipe.say === 'string' ? [recipe.say] : Object.values(recipe.say);
      for (const value of says) if (!entry.forms.includes(value)) said.add(value);
    }
  }
  assert.ok(said.has('Eiht') && said.has('"/ˈstniːjɪtl̥/"'));
  for (const line of corpus()) {
    assert.doesNotMatch(line.text, /"\/|\/"|\/[^\s/]+\//, `${line.set}/${line.id}: IPA in the text`);
    for (const value of said) {
      const word = new RegExp(`(?<![\\p{L}\\p{N}])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u');
      assert.doesNotMatch(line.text, word, `${line.set}/${line.id}: "${value}" is a recipe, not the text`);
    }
  }
});
