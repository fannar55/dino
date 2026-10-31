#!/usr/bin/env node
// Designs a new character voice with ElevenLabs Voice Design and writes a listening page the owner picks from by ear
// (made for Uggeðla, chapter 2; generic: any character). Nothing is kept in the ElevenLabs account until --keep.
//
//   node remake/tools/design-voice.mjs --name uggedla --description "<English description>" --preview "<Icelandic text>" \
//        [--count 6] [--out qa/remake/kafli-uggedla/rodd] [--model eleven_ttv_v3]
//        POST /v1/text-to-voice/design, three previews per request, until --count previews are made (a round). Each preview is saved as
//        <out>/<name>-<n>.mp3 (levelled to -16 LUFS) with <out>/<name>-<n>.json beside it (its generated_voice_id, the description and text
//        sent, the round), and heard back by speech-to-text (scribe_v2, Icelandic): the share of the preview text's words heard in order.
//        <out>/previews.json lists them all and <out>/index.html is the page: a player, the score and a "Velja þessa" button per preview,
//        which saves the choice as <name>-val.json. Run it again with another --description for another round: the new previews are
//        numbered on from the last and join the same page (--out is where the page and the previews of the character live).
//   node remake/tools/design-voice.mjs --name uggedla --out <dir> --page-only     scores and writes the page again from previews.json (what scribe heard is kept there); asks for nothing
//   node remake/tools/design-voice.mjs --name uggedla --out <dir> --keep <generated_voice_id> [--voice-name "<name>"]
//        keeps the picked preview as a voice in the account (POST /v1/text-to-voice) and writes its id into remake/assets/audio/voices.json
//        under --name. Only after the owner's pick; it makes no previews.
//   --dry   prints what would be sent (no key is needed, nothing is asked of ElevenLabs)
//
// The previews and the page go under qa/, which git ignores. The key is read from ELEVENLABS_API_KEY and from nowhere else. It goes
// into one request header; it is never printed, logged, written to a file or put in a URL, and without it the tool stops before it
// asks for anything. ffmpeg must be on the PATH.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './voice-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API = 'https://api.elevenlabs.io/v1';
const VOICES = 'remake/assets/audio/voices.json';
const MODEL = 'eleven_ttv_v3';
const PER_REQUEST = 3; // previews one design request answers with
const TIMEOUT = 3 * 60 * 1000;

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
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${hide(await response.text(), key).slice(0, 600)}`);
  return response;
}

const wordsOf = s => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
/**
 * What scribe wrote with its sound tags read as words: a laugh, "[hlær]" (or "[laughs]"), is the "ha ha ha" the text asks for (a
 * performed laugh is heard right when scribe hears a laugh); any other tag, a breath or a pause, is not a word.
 */
const spoken = heard => String(heard ?? '').replace(/\[[^\]]*\]/g, tag => (/hl[æa]|laugh|giggl/i.test(tag) ? ' ha ha ha ' : ' '));
/** The words of `text` in order, each with whether `heard` has it in order (longest common subsequence), and the share heard (0 to 1). */
export function compare(text, heard) {
  const want = wordsOf(text), got = wordsOf(spoken(heard));
  const dp = Array.from({ length: want.length + 1 }, () => new Array(got.length + 1).fill(0));
  for (let i = 1; i <= want.length; i++) for (let j = 1; j <= got.length; j++) dp[i][j] = want[i - 1] === got[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const right = new Array(want.length).fill(false);
  for (let i = want.length, j = got.length; i > 0 && j > 0;) {
    if (want[i - 1] === got[j - 1]) { right[i - 1] = true; i--; j--; } else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
  }
  return { words: want.map((word, i) => ({ word, right: right[i] })), heard: dp[want.length][got.length], of: want.length, share: want.length ? dp[want.length][got.length] / want.length : 1 };
}

const run = (command, args) => execFileSync(command, args, { maxBuffer: 1 << 28 }).toString();
const seconds = file => Math.round(Number(JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', file])).format.duration) * 100) / 100;

/** Three previews of `description` speaking `text`, and any cost the answer's headers name. */
async function designBatch(key, { description, text, model }) {
  const response = await ask(key, `${API}/text-to-voice/design?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_description: description, text, model_id: model }),
  });
  const costs = Object.fromEntries([...response.headers].filter(([name]) => /cost|credit|character/i.test(name)));
  return { previews: (await response.json()).previews ?? [], costs };
}

async function hear(key, file) {
  const form = new FormData();
  form.set('model_id', 'scribe_v2');
  form.set('language_code', 'is');
  form.set('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), path.basename(file));
  const response = await ask(key, `${API}/speech-to-text`, { method: 'POST', body: form });
  return ((await response.json()).text ?? '').trim();
}

/** The characters used so far this period, or null where the account will not say (a best-effort look, to report the cost of a round). */
async function usedCharacters(key) {
  try {
    const subscription = await (await ask(key, `${API}/user/subscription`, { method: 'GET' })).json();
    return typeof subscription.character_count === 'number' ? subscription.character_count : null;
  } catch {
    return null;
  }
}

/** The score of what scribe `heard` (null: it did not listen) against `text`: the share in per cent, the words heard right, of how many, and the missed ones. */
export function scored(text, heard) {
  if (heard === null || heard === undefined) return { score: null, heardWords: 0, wordCount: wordsOf(text).length, missed: [] };
  const c = compare(text, heard);
  return { score: Math.round(c.share * 100), heardWords: c.heard, wordCount: c.of, missed: c.words.filter(w => !w.right).map(w => w.word) };
}

/** The page: one card per preview with its player, its score and "Velja þessa", which saves the choice as <name>-val.json. */
export function pageHtml({ name, title, rounds, previews }) {
  const cards = previews.map(p => {
    const marked = compare(p.text, p.heard).words.map(w => (w.right ? escapeHtml(w.word) : `<mark>${escapeHtml(w.word)}</mark>`)).join(' ');
    return `  <section class="voice" data-n="${p.n}">
    <div class="head"><h2>Rödd ${p.n}</h2>${rounds.length > 1 ? `<span class="muted">umferð ${p.round}</span>` : ''}<span class="score">${p.score === null ? 'ekki prófuð' : `${p.score} % skilið`}</span></div>
    <audio controls preload="none" src="${escapeHtml(p.file)}"></audio>
    <p class="heard">${p.score === null ? 'Talgreinirinn náði ekki að hlusta á þessa.' : `${p.heardWords === p.wordCount ? `Talgreinirinn skildi öll ${p.wordCount} orðin.` : `Talgreinirinn skildi ${p.heardWords} af ${p.wordCount} orðum (undirstrikuð eru þau sem hann missti af):<br>${marked}`}<br><span class="raw">Hann skrifaði: „${escapeHtml(p.heard)}“</span>`}</p>
    <button type="button" class="pick">Velja þessa</button>
  </section>`;
  }).join('\n');
  const roundNotes = rounds.map(r => `<details><summary>Umferð ${r.round}: lýsingin sem var send</summary><p class="sent">${escapeHtml(r.description)}</p><p class="sent">Textinn: ${escapeHtml(r.text)}</p></details>`).join('\n  ');
  const data = previews.map(p => ({ n: p.n, file: p.file, generated_voice_id: p.generated_voice_id, score: p.score, round: p.round }));
  return `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { --paper: #fbf3e2; --ink: #3b2a1a; --muted: #7a6650; --line: #e3d3b4; --mark: #f3e2bd; --warn: #a5482a; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.45 Nunito, system-ui, sans-serif; }
  main { max-width: 820px; margin: 0 auto; padding: 24px 16px 96px; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  h2 { margin: 0; font-size: 22px; }
  p { margin: 0 0 8px; }
  .note, .muted { color: var(--muted); }
  .say { margin: 12px 0; padding: 10px 14px; border-left: 4px solid var(--line); font-size: 19px; }
  .sent { font: 13px ui-monospace, monospace; color: var(--muted); word-break: break-word; }
  details { margin: 6px 0; color: var(--muted); }
  .voice { margin: 18px 0; padding: 12px 14px; border: 2px solid var(--line); border-radius: 14px; }
  .voice.picked { background: var(--mark); border-color: var(--ink); }
  .head { display: flex; gap: 14px; align-items: baseline; flex-wrap: wrap; }
  .score { margin-left: auto; font-weight: 800; }
  audio { width: 100%; height: 40px; margin: 8px 0; }
  .heard { font-size: 15px; color: var(--muted); }
  .raw { font-size: 14px; font-style: italic; }
  mark { background: none; color: var(--warn); font-weight: 700; text-decoration: underline wavy; }
  button { font: inherit; font-weight: 800; padding: 8px 18px; border-radius: 999px; border: 2px solid var(--ink); background: #fff8ea; color: var(--ink); cursor: pointer; }
  .voice.picked button { background: var(--ink); color: var(--paper); }
  .bar { position: sticky; bottom: 0; background: var(--paper); border-top: 2px solid var(--line); padding: 10px 0; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p class="note">${previews.length} raddir. Hlustaðu á hverja og ýttu á „Velja þessa“ við þá sem þér þykir best. Valið vistast sem skráin <b>${escapeHtml(name)}-val.json</b>: sendu mér hana, eða segðu mér bara númerið. Prósentan segir aðeins hvort vél skilur framburðinn; það ert þú sem heyrir hvort röddin er rétt.</p>
  <p class="say">${escapeHtml(rounds[rounds.length - 1].text)}</p>
  ${roundNotes}
${cards}
  <div class="bar"><span id="status" class="muted">Ekkert valið enn.</span></div>
</main>
<script>
  const NAME = ${JSON.stringify(name)};
  const VOICES = ${JSON.stringify(data).replace(/</g, '\\u003c')};
  const status = document.getElementById('status');
  document.addEventListener('play', event => { for (const audio of document.querySelectorAll('audio')) if (audio !== event.target) audio.pause(); }, true);
  for (const card of document.querySelectorAll('.voice')) {
    card.querySelector('.pick').addEventListener('click', () => {
      const voice = VOICES.find(v => v.n === Number(card.dataset.n));
      for (const other of document.querySelectorAll('.voice')) { other.classList.toggle('picked', other === card); other.querySelector('.pick').textContent = other === card ? 'Valið' : 'Velja þessa'; }
      const blob = new Blob([JSON.stringify({ name: NAME, pick: voice.n, file: voice.file, generated_voice_id: voice.generated_voice_id, score: voice.score, round: voice.round, picked: new Date().toISOString() }, null, 2) + '\\n'], { type: 'application/json' });
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: NAME + '-val.json' });
      document.body.append(link);
      link.click();
      link.remove();
      status.textContent = 'Valið: rödd ' + voice.n + '. Skráin ' + NAME + '-val.json var vistuð.';
    });
  }
</script>
</body>
</html>
`;
}

const fileOfState = out => path.join(out, 'previews.json');
const readState = (out, name) => (fs.existsSync(fileOfState(out)) ? JSON.parse(fs.readFileSync(fileOfState(out), 'utf8')) : { name, rounds: [], previews: [] });
function writeAll(out, state, title) {
  fs.writeFileSync(fileOfState(out), `${JSON.stringify(state, null, 1)}\n`);
  fs.writeFileSync(path.join(out, 'index.html'), pageHtml({ name: state.name, title, rounds: state.rounds, previews: state.previews }));
}

async function makeRound({ name, description, text, count, out, model, title, dry }) {
  if (text.length < 100) throw new Error(`The preview text is ${text.length} characters; Voice Design wants at least 100. No request was made.`);
  if (description.length < 20 || description.length > 1000) throw new Error(`The description is ${description.length} characters; Voice Design wants 20 to 1000. No request was made.`);
  if (dry) {
    console.log(`would POST ${API}/text-to-voice/design ${Math.ceil(count / PER_REQUEST)} time(s): model ${model}, ${count} previews into ${out}\ndescription: ${description}\ntext: ${text}`);
    return;
  }
  const key = keyOf();
  fs.mkdirSync(out, { recursive: true });
  const state = readState(out, name);
  const round = state.rounds.length + 1;
  state.rounds.push({ round, description, text, model, made: new Date().toISOString() });
  const before = await usedCharacters(key);
  let n = state.previews.reduce((most, p) => Math.max(most, p.n), 0);
  let made = 0;
  const costs = [];
  while (made < count) {
    const batch = await designBatch(key, { description, text, model });
    costs.push(batch.costs);
    if (!batch.previews.length) throw new Error('ElevenLabs answered with no previews.');
    for (const preview of batch.previews.slice(0, count - made)) {
      n++; made++;
      const id = `${name}-${n}`;
      const raw = path.join(out, `${id}.raw.mp3`), file = path.join(out, `${id}.mp3`);
      fs.writeFileSync(raw, Buffer.from(preview.audio_base_64, 'base64'));
      run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', file]);
      fs.rmSync(raw);
      let heard = null, error = null;
      try { heard = await hear(key, file); } catch (e) { error = hide(e.message, key); }
      const entry = {
        n, round, file: `${id}.mp3`, generated_voice_id: preview.generated_voice_id, seconds: seconds(file), language: preview.language ?? null,
        ...scored(text, heard), heard, ...(error ? { error } : {}), description, text,
      };
      state.previews.push(entry);
      fs.writeFileSync(path.join(out, `${id}.json`), `${JSON.stringify(entry, null, 1)}\n`);
      writeAll(out, state, title); // after every preview: a stopped run keeps what it made
      console.log(`${id}: ${entry.score === null ? 'not heard' : `${entry.score}% (${entry.heardWords}/${entry.wordCount} words)`}  ${preview.generated_voice_id}  "${heard ?? ''}"`);
    }
  }
  const after = await usedCharacters(key);
  state.rounds[round - 1].costs = costs;
  if (before !== null && after !== null) state.rounds[round - 1].charactersUsed = after - before;
  writeAll(out, state, title);
  console.log(`round ${round} done: ${made} previews in ${out}${before !== null && after !== null ? `; the account's character count rose by ${after - before}` : ''}${costs.some(c => Object.keys(c).length) ? `; answers' cost headers: ${JSON.stringify(costs)}` : ''}`);
}

/** Writes `id` under `name` in voices.json, in the file's own format (one space of indent, LF, a newline at the end). */
export function setVoice(file, name, id) {
  const voices = JSON.parse(fs.readFileSync(file, 'utf8'));
  voices[name] = id;
  fs.writeFileSync(file, `${JSON.stringify(voices, null, 1)}\n`);
}

async function keep({ name, generated, out, voiceName, description, dry }) {
  const state = readState(out, name);
  const preview = state.previews.find(p => p.generated_voice_id === generated);
  const said = description ?? preview?.description;
  if (!said) throw new Error(`No preview with that generated_voice_id in ${fileOfState(out)}: give --description. No request was made.`);
  const body = { voice_name: voiceName ?? name, voice_description: said, generated_voice_id: generated };
  if (dry) { console.log(`would POST ${API}/text-to-voice with ${JSON.stringify({ ...body, generated_voice_id: '(the preview)' })} and write the answer's voice_id into ${VOICES} as "${name}"`); return; }
  const key = keyOf();
  const response = await ask(key, `${API}/text-to-voice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const voice = await response.json();
  if (!voice.voice_id) throw new Error('ElevenLabs answered without a voice_id.');
  setVoice(path.join(ROOT, VOICES), name, voice.voice_id);
  console.log(`kept the preview as ${voice.voice_id} and wrote it into ${VOICES} as "${name}"`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  try {
    const name = value('--name');
    if (!name) throw new Error('Give --name (the character, such as uggedla). No request was made.');
    const out = path.resolve(ROOT, value('--out') ?? `qa/remake/voice-design/${name}`);
    const title = value('--title') ?? `Rödd ${name}`;
    if (args.includes('--page-only')) {
      const state = readState(out, name);
      for (const p of state.previews) { // scored again from what scribe wrote (the rule for sound tags may have changed); no request
        Object.assign(p, scored(p.text, p.heard));
        delete p.words;
        fs.writeFileSync(path.join(out, `${name}-${p.n}.json`), `${JSON.stringify(p, null, 1)}\n`);
      }
      writeAll(out, state, title);
      console.log(`wrote ${path.join(out, 'index.html')}`);
    } else if (value('--keep')) {
      await keep({ name, generated: value('--keep'), out, voiceName: value('--voice-name'), description: value('--description'), dry: args.includes('--dry') });
    } else {
      const description = value('--description'), text = value('--preview');
      if (!description || !text) throw new Error('Give --description and --preview. No request was made.');
      const count = Number(value('--count') ?? 6);
      if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error('--count is a whole number from 1 to 30. No request was made.');
      await makeRound({ name, description, text, count, out, model: value('--model') ?? MODEL, title, dry: args.includes('--dry') });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
