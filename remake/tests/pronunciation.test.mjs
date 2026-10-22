import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SETS } from '../tools/audio-lines.mjs';
import { VOICE_LINES } from '../engine/yatzy-junior/voice-lines.js';
import { SPEAKER_NAMES, applyLexicon, bookHtml, bookPlan, cacheKey, checkLexicon, formsPattern, requestFor, resolveWord } from '../tools/voice-lines.mjs';
import { VISIT, fixtureLexicon } from './lexicon-fixture.mjs';

// The pronunciation standard (remake/assets/audio/pronunciation.json): one entry per hard word, which the voice tools apply to
// every line they send. One test holds the shipped lexicon to what never changes with the owner's picks (every inflection the
// lines say is a form, a choice is a recipe or null, the winning recipes are still there, the child's text carries no recipe).
// Every other test uses a lexicon of its own (lexicon-fixture.mjs), so the owner's picks never move a test.

const file = relative => fileURLToPath(new URL(relative, import.meta.url));
const readJson = path_ => JSON.parse(fs.readFileSync(path_, 'utf8'));
/** The tests' own lexicon, with choices that do not change. */
const LEXICON = fixtureLexicon();
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

test('the shipped lexicon, whatever the owner picked: valid, every choice a recipe or null, every inflection in the lines covered, the winning recipes still offered, and no recipe in the text the child sees', () => {
  const shipped = readJson(file('../assets/audio/pronunciation.json'));
  checkLexicon(shipped); // the tool's own check: forms, stems, recipes, chosen
  const entries = Object.entries(shipped.words);
  for (const id of ['kambedla', 'snigill', 'eitt', 'ein', 'mundu', 'flugedla', 'thorsedla', 'uggedla', 'sloedla', 'gramedla', 'egill', 'oglir', 'stjornuhatid', 'thribroti']) {
    assert.ok(Object.hasOwn(shipped.words, id), `${id}, a word the analysis names, is in the lexicon`);
  }
  for (const [id, entry] of entries) assert.ok(entry.chosen === null || Object.hasOwn(entry.recipes, entry.chosen), `${id}: chosen is one of its recipes, or null`);

  // Every inflection of every hard word that a line of the five sets or Litla Yatzy says is one of its forms.
  const lines = corpus();
  assert.ok(lines.length > 400, `${lines.length} lines read`);
  const uncovered = [];
  for (const [id, entry] of entries) {
    const stem = new RegExp(`^(?:${entry.stem})`, 'u');
    const known = new Set([...entry.forms, ...(entry.except ?? [])]);
    for (const line of lines) {
      for (const token of tokens(line.text)) if (stem.test(token) && !known.has(token)) uncovered.push(`${token} (${id}) in ${line.set}/${line.id}`);
    }
  }
  assert.deepEqual(uncovered, [], 'add each to the forms of its word in remake/assets/audio/pronunciation.json (and a say for it in each recipe that has one)');

  // The six recipes that won the owner's ear before the book are still candidates, exactly as they were sent.
  const offers = (id, test_) => Object.values(shipped.words[id].recipes).some(test_);
  assert.ok(offers('kambedla', recipe => recipe.context === VISIT && [1, 42].includes(recipe.seed)), 'Kambeðla: the visit line as context');
  assert.ok(offers('snigill', recipe => recipe.say?.Snigill === '"/ˈstniːjɪtl̥/"'), 'Snigill: its IPA');
  assert.ok(offers('eitt', recipe => recipe.say?.Eitt === 'Eiht'), 'Eitt: Eiht');
  assert.ok(offers('ein', recipe => recipe.say?.Ein === 'Eyn'), 'Ein: Eyn');
  assert.ok(offers('mundu', recipe => recipe.context === 'Mundu að ýta á Eitt!'), 'Mundu: its line as context');
  assert.ok(offers('flugedla', recipe => recipe.say?.Flugeðlan === '"/ˈflʏːɣˌɛðlan/"'), 'Flugeðlan: its IPA');

  // No IPA and no respelling of any recipe in any line's text, which the captions show.
  const said = new Set();
  for (const [, entry] of entries) {
    for (const recipe of Object.values(entry.recipes)) {
      const says = recipe.say === undefined ? [] : typeof recipe.say === 'string' ? [recipe.say] : Object.values(recipe.say);
      for (const value of says) if (!entry.forms.includes(value)) said.add(value);
    }
  }
  for (const line of lines) {
    assert.doesNotMatch(line.text, /"\/|\/"|\/[^\s/]+\//, `${line.set}/${line.id}: IPA in the text`);
    for (const value of said) assert.doesNotMatch(line.text, formsPattern([value]), `${line.set}/${line.id}: "${value}" is a recipe, not the text`);
  }
});

// ---------------------------------------------------------------------------------------------
// applyLexicon: what is sent

const TOY = {
  words: {
    kambedla: { word: 'Kambeðla', stem: '[Kk]ambeðl', forms: ['Kambeðla', 'Kambeðlu', 'kambeðlan'], recipes: { hratt: { note: 'as written' }, samhengi: { context: VISIT, seed: 1, note: 'context' } }, chosen: 'samhengi' },
    eitt: { word: 'Eitt', stem: 'Eitt$', forms: ['Eitt'], recipes: { hratt: { note: 'as written' }, stafsetning: { say: { Eitt: 'Eiht' }, seed: 42, note: 'respelt' } }, chosen: 'stafsetning' },
    mundu: { word: 'Mundu', stem: '[Mm]und', forms: ['Mundu'], recipes: { hratt: { note: 'as written' }, samhengi: { context: { mosi: 'Mundu að ýta á Eitt!', '*': 'Mundu þetta.' }, note: 'context' } }, chosen: 'samhengi' },
    snigill: { word: 'Snigill', stem: '[Ss]nig', forms: ['Snigill', 'snigilinn'], recipes: { hratt: { note: 'as written' }, ipa: { say: { Snigill: '"/ˈstniːjɪtl̥/"', snigilinn: '"/ˈstniːjɪlɪn/"' }, note: 'ipa' } }, chosen: 'ipa' },
    egill: { word: 'Egill', stem: 'Egil', forms: ['Egill'], recipes: { hratt: { note: 'as written' }, ipa: { say: '"/ˈeiːjɪtl̥/"', note: 'ipa' } }, chosen: null },
  },
};
const pick = ({ text, context, seed }) => ({ text, context, seed });

test('applyLexicon replaces each form of a chosen word as a whole word, case-sensitively, and leaves the text it was given as it was', () => {
  const text = 'Snigill. Eitt! Eitthvað glitrar, eitt spil, Egill og snigilinn.';
  const copy = structuredClone(TOY);
  const sent = applyLexicon(text, { speaker: 'mosi', lexicon: TOY });
  assert.equal(sent.say, '"/ˈstniːjɪtl̥/". Eiht! Eitthvað glitrar, eitt spil, Egill og "/ˈstniːjɪlɪn/".', '"Eitthvað" and lower-case "eitt" are other words; Egill is not chosen yet');
  assert.equal(sent.seed, 42, "the seed Eitt's recipe fixes");
  assert.equal(sent.context, undefined, 'no chosen word here wants a context');
  assert.deepEqual(sent.words.map(word => [word.id, word.recipe, word.forms]), [['snigill', 'ipa', ['Snigill', 'snigilinn']], ['eitt', 'stafsetning', ['Eitt']], ['egill', null, ['Egill']]]);
  assert.deepEqual(TOY, copy, 'the lexicon is not changed');
  assert.deepEqual(applyLexicon('Hæ! Ég er Mosi.', { speaker: 'mosi', lexicon: TOY }), { say: 'Hæ! Ég er Mosi.', context: undefined, seed: undefined, words: [] });
  assert.equal(applyLexicon('Kambeðlurnar', { speaker: 'mosi', lexicon: TOY }).words.length, 0, 'a longer word is not a form');
});

test("a context-only recipe leaves the word and sends the context; two words with contexts send both, in the order they are said; a context may be the speaker's own", () => {
  const one = applyLexicon('Kambeðla! Halló!', { speaker: 'mosi', lexicon: TOY });
  assert.deepEqual([one.say, one.context, one.seed], ['Kambeðla! Halló!', VISIT, 1]);
  const two = applyLexicon('Mundu: kambeðlan á leik.', { speaker: 'mosi', lexicon: TOY });
  assert.equal(two.say, 'Mundu: kambeðlan á leik.');
  assert.equal(two.context, `Mundu að ýta á Eitt! ${VISIT}`, 'joined into one, Mundu first because it is said first');
  assert.equal(two.seed, 1, 'Mundu fixes no seed, Kambeðla does');
  assert.equal(applyLexicon('Mundu: kambeðlan á leik.', { speaker: 'narrator', lexicon: TOY }).context, `Mundu þetta. ${VISIT}`, '"*" for a speaker with no context of their own');
  assert.equal(applyLexicon('Kambeðla og Kambeðlu.', { speaker: 'mosi', lexicon: TOY }).context, VISIT, 'the same context once');
});

test("requestFor: a line's own say, context and seed win over the lexicon", () => {
  const line = { id: 'x', speaker: 'mosi', text: 'Eitt!' };
  assert.deepEqual(pick(requestFor(line, TOY)), { text: 'Eiht!', context: undefined, seed: 42 });
  assert.deepEqual(pick(requestFor({ ...line, seed: 3 }, TOY)), { text: 'Eiht!', context: undefined, seed: 3 });
  assert.deepEqual(pick(requestFor({ ...line, say: 'Eytt!', context: 'Teljum!' }, TOY)), { text: 'Eytt!', context: 'Teljum!', seed: 42 });
  assert.deepEqual(requestFor({ ...line, say: 'Eytt!' }, TOY).own, ['say']);
});

test('every line of every set and Litla Yatzy that says a chosen word is sent with its recipe, and no other line is changed', () => {
  let changed = 0;
  for (const line of corpus()) {
    const sent = requestFor(line, LEXICON);
    const chosen = sent.words.filter(word => word.recipe);
    if (!chosen.length) {
      assert.deepEqual([sent.text, sent.context], [line.text, undefined], `${line.set}/${line.id} says no chosen word, so it is sent as written`);
      continue;
    }
    changed++;
    for (const word of chosen) {
      const recipe = LEXICON.words[word.id].recipes[word.recipe];
      if (recipe.say !== undefined) {
        for (const form of word.forms) {
          const say = typeof recipe.say === 'string' ? recipe.say : recipe.say[form];
          if (say !== form) assert.ok(sent.text.includes(say) && !formsPattern([form]).test(sent.text), `${line.set}/${line.id}: ${form} is sent as ${say}`);
        }
      }
      if (recipe.context !== undefined) {
        const context = typeof recipe.context === 'string' ? recipe.context : recipe.context[line.speaker] ?? recipe.context['*'];
        assert.ok(sent.context?.includes(context), `${line.set}/${line.id}: ${word.id}'s context is sent`);
      }
    }
  }
  const chosenForms = ENTRIES.filter(([, entry]) => entry.chosen).flatMap(([, entry]) => entry.forms);
  const saying = corpus().filter(line => formsPattern(chosenForms).test(line.text)).length;
  assert.equal(changed, saying, 'each line that says a chosen form, and only those');
  assert.ok(changed >= 18, `${changed} lines carry a recipe (Kambeðla alone is in 18)`);
});

test('the cache key is of what is sent: a changed recipe, context or seed is a new take; a line with no hard word keeps the key it had before the lexicon', () => {
  const voiceId = 'osSKuDKznhXBktjJ9Z9F';
  const keyOf = (line, lexicon) => { const sent = requestFor(line, lexicon); return cacheKey({ text: sent.text, voiceId, seed: sent.seed, context: sent.context }); };
  assert.equal(keyOf({ speaker: 'mosi', text: 'Tvö!' }, LEXICON), cacheKey({ text: 'Tvö!', voiceId }), 'the takes made before still count');
  const line = { speaker: 'mosi', text: 'Kambeðla! Halló!' };
  const before = keyOf(line, TOY);
  const other = structuredClone(TOY);
  other.words.kambedla.recipes.samhengi.seed = 42;
  assert.notEqual(keyOf(line, other), before, 'another seed');
  const seeded = keyOf(line, other);
  other.words.kambedla.recipes.samhengi.context = 'Kambeðla er vinkona mín.';
  assert.notEqual(keyOf(line, other), seeded, 'another context');
  other.words.kambedla.chosen = 'hratt';
  assert.equal(keyOf(line, other), cacheKey({ text: 'Kambeðla! Halló!', voiceId }), 'raw again: the raw take');
  const ipa = structuredClone(TOY);
  ipa.words.snigill.recipes.ipa.say.Snigill = '"/ˈsnɪːjɪtl̥/"';
  assert.notEqual(keyOf({ speaker: 'mosi', text: 'Snigill.' }, ipa), keyOf({ speaker: 'mosi', text: 'Snigill.' }, TOY), 'another IPA');
  assert.notEqual(cacheKey({ text: 'a', voiceId, context: 'b' }), cacheKey({ text: 'a', voiceId }));
});

test('checkLexicon refuses an entry the tool could not apply, before any request', () => {
  const broken = mutate => { const copy = structuredClone(TOY); mutate(copy.words); return () => checkLexicon(copy); };
  assert.equal(checkLexicon(structuredClone(TOY)).words.eitt.chosen, 'stafsetning');
  for (const [why, mutate] of [
    ['a form in two words', words => words.egill.forms.push('Eitt')],
    ['a form that misses its stem', words => words.eitt.forms.push('Ein')],
    ['a say that misses a form', words => { words.snigill.recipes.ipa.say = { Snigill: 'x' }; }],
    ['a chosen recipe that is not there', words => { words.egill.chosen = 'samhengi'; }],
    ['a recipe without a note', words => { delete words.eitt.recipes.stafsetning.note; }],
    ['a seed that is not a whole number', words => { words.eitt.recipes.stafsetning.seed = 1.5; }],
    ['an unknown field', words => { words.eitt.recipes.stafsetning.voice = 'x'; }],
    ['an id that is not a file name', words => { words['Eitt!'] = words.eitt; }],
  ]) assert.throws(broken(mutate), /pronunciation\.json.*No request was made/s, why);
});

test("Litla Yatzy's tool sends its lines through the same function", async () => {
  const junior = await import('../tools/yatzy-junior-voices.mjs');
  const source = fs.readFileSync(file('../tools/yatzy-junior-voices.mjs'), 'utf8');
  assert.match(source, /import \{[^}]*requestFor[^}]*\} from '\.\/voice-lines\.mjs'/, 'requestFor (applyLexicon) comes from voice-lines.mjs');
  assert.match(source, /previous_text:sent\.context/, 'the context goes into the request');
  const sent = junior.juniorRequest(VOICE_LINES.yatzyRoll, LEXICON);
  assert.deepEqual(pick(sent), pick(requestFor({ speaker: 'mosi', text: VOICE_LINES.yatzyRoll.text }, LEXICON)));
  assert.equal(sent.text, 'Eiht markmið eftir. Kastaðu!');
  assert.equal(VOICE_LINES.yatzyRoll.text, 'Eitt markmið eftir. Kastaðu!', 'the caption stays as written');
  const voiceId = 'osSKuDKznhXBktjJ9Z9F';
  assert.equal(junior.juniorFingerprint(VOICE_LINES.welcome, { voiceId, lexicon: LEXICON }), cacheKey({ text: VOICE_LINES.welcome.text, voiceId }), 'a line with no hard word keeps its old fingerprint');
});

// ---------------------------------------------------------------------------------------------
// The pronunciation book

test('the book has a row for every word x every speaker who says it x every recipe, each in a file of its own', () => {
  const lines = corpus();
  const rows = bookPlan(LEXICON, lines);
  const key = row => `${row.word}|${row.speaker}|${row.recipe}`;
  assert.equal(new Set(rows.map(key)).size, rows.length, 'each combination once');
  assert.equal(new Set(rows.map(row => row.file)).size, rows.length, 'each in a file of its own');
  for (const [id, entry] of ENTRIES) {
    const pattern = formsPattern(entry.forms);
    const speakers = new Set([...lines.filter(line => pattern.test(line.text)).map(line => line.speaker), ...Object.keys(entry.audition ?? {})]);
    assert.ok(speakers.size, `${id}: someone says it in the book`);
    for (const speaker of speakers) {
      for (const recipe of Object.keys(entry.recipes)) assert.ok(rows.some(row => key(row) === `${id}|${speaker}|${recipe}`), `${id}: ${speaker} reads ${recipe}`);
    }
    assert.deepEqual(new Set(rows.filter(row => row.word === id).map(row => row.speaker)), speakers, `${id}: only those who say it`);
  }
  for (const row of rows) {
    assert.match(row.file, /^[a-z0-9-]+\/[a-z]+-[a-z0-9-]+\.mp3$/);
    assert.ok(formsPattern(LEXICON.words[row.word].forms).test(row.text), `${row.file}: the sentence has the word`);
    assert.ok(SPEAKER_NAMES[row.speaker], `${row.speaker} has a name on the page`);
  }
  assert.deepEqual([...new Set(rows.filter(row => row.word === 'egill').map(row => row.speaker))], ['mosi', 'egill', 'thorsedla']);
  assert.deepEqual([...new Set(rows.filter(row => row.word === 'gramedla').map(row => row.speaker))], ['mosi'], 'Grameðla, said by no line yet, by her audition sentence');
});

test("a book row tries one word's recipe and keeps the others' choices, and reads a line that will be made again, so the take heard is the request that goes in", () => {
  const rows = bookPlan(LEXICON, corpus());
  const row = (word, speaker, recipe) => rows.find(item => item.word === word && item.speaker === speaker && item.recipe === recipe);
  const map = row('kambedla', 'mosi', 'samhengi');
  assert.equal(map.from, 'kafli2/k2_mosi_map_kambedla', "Kambeðla's own map line, the one line of hers not kept");
  const line = corpus().find(item => item.id === 'k2_mosi_map_kambedla');
  assert.deepEqual(map.sent, pick(requestFor(line, LEXICON)), 'the same request the line is made with');
  assert.equal(row('kambedla', 'mosi', 'hratt').sent.context, undefined, 'raw: no context');
  assert.equal(row('mundu', 'mosi', 'hratt').sent.text, 'Mundu að ýta á Eiht!', 'Eitt keeps its chosen respelling while Mundu is tried raw');
  assert.equal(row('snigill', 'narrator', 'ipa').from, 'book/book_snail_1', "an audition sentence that is one of the speaker's lines is that line");
  assert.equal(row('egill', 'thorsedla', 'ipa').sent.text, '"/ˈeiːjɪtl̥/". Takk fyrir berin.');
  assert.equal(resolveWord(LEXICON, 'Kambeðlu'), 'kambedla');
  assert.equal(resolveWord(LEXICON, 'Þórseðla'), 'thorsedla');
  assert.throws(() => resolveWord(LEXICON, 'Mosi'), /not a word/);
  assert.deepEqual([...new Set(bookPlan(LEXICON, corpus(), 'Egill').map(item => item.word))], ['egill'], 'one word');
});

test('the book page lists every row with a player and the note, a radio per recipe per word (the chosen one checked), and saves picks.json', () => {
  const rows = bookPlan(LEXICON, corpus());
  const html = bookHtml(LEXICON, rows);
  for (const row of rows) {
    assert.ok(html.includes(`data-row="${row.word}|${row.speaker}|${row.recipe}"`), `${row.file} has a row`);
    assert.ok(html.includes(`src="${row.file}"`), `${row.file} plays`);
  }
  for (const [id, entry] of ENTRIES) {
    assert.ok(html.includes(`<section data-word="${id}">`), `${id} has a section`);
    for (const recipe of Object.keys(entry.recipes)) {
      const radio = `<input type="radio" name="${id}" value="${recipe}"${entry.chosen === recipe ? ' checked' : ''}>`;
      assert.ok(html.includes(radio), `${id}: ${radio}`);
      const note = entry.recipes[recipe].note.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
      assert.ok(html.includes(note), `${id}.${recipe}: its note`);
    }
  }
  assert.match(html, /<title>Framburðarbók<\/title>/);
  assert.match(html, /Nunito/);
  assert.match(html, /id="save">Vista val</);
  assert.match(html, /download: 'picks\.json'/);
  const missing = bookHtml(LEXICON, rows, { exists: () => false });
  assert.ok(!missing.includes('<audio') && missing.includes('Ekki gert enn'), 'a row not made yet says so');
});
