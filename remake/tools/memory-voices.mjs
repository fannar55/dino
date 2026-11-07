#!/usr/bin/env node
// Voices the memory game's Mosi lines (remake/engine/memory/voice-lines.js) with ElevenLabs Eleven v4, in his approved voice at
// speed .95, into remake/assets/audio/memory/; never changes other games.
//   node remake/tools/memory-voices.mjs --only id,id              make these lines and install them
//   node remake/tools/memory-voices.mjs --all                     make every line and install it (said explicitly: never a plain run)
//   node remake/tools/memory-voices.mjs --dry [--only id,id]      what each line sends, the notes on it (REJECTED, fixes elsewhere),
//                                                                 and whether that is what made its MP3; asks nothing (--dry-run too)
//   node remake/tools/memory-voices.mjs --plan                    the lines whose MP3 is not of the request the tool sends now; asks nothing
//   node remake/tools/memory-voices.mjs --ab --only id,id | --all [--out dir]   new takes of these lines (--all: the lines --plan lists)
//                                                                 beside the shipped ones, NOT installed, on a yes/no page (<out>/ab.html) whose save heard.mjs imports
//   node remake/tools/memory-voices.mjs --try <file.json> [--out dir]     candidates for one line (a rejected one), NOT installed
//   node remake/tools/memory-voices.mjs --verify                  the shipped MP3s, their manifest and the requests that made them
// (making lines, --ab and --try need ffmpeg/ffprobe, and ELEVENLABS_API_KEY in the environment for a take no cache has yet)
// A flag it does not know, a stray word, two modes, or no mode at all: it prints this usage and makes nothing (exit 1).
//
// THE PRONUNCIATION STANDARD. Every line goes through remake/assets/audio/pronunciation.json with the functions voice-lines.mjs
// and yatzy-junior-voices.mjs use (pronunciation.mjs requestFor -> applyLexicon): each form of a word the owner chose a recipe for
// is sent as its recipe says (IPA or a respelling in the text, a context as previous_text, never spoken); the caption stays the
// line's text. A line's own `say` is its text with this game's own word fixes (Hver and Steinagljúfrið in IPA), so the lexicon is
// applied to the say as well: a hard word elsewhere in the sentence still gets its recipe. A line's own `context` and `seed` win over
// the lexicon's, as in a lines-source.json line; --dry-run and --plan say when an own context hides a word's chosen context.
// A word that a lexicon stem matches but that is none of its forms (a new inflection, "Kambeðlurnar") would go out as written:
// the tool makes and auditions nothing until it is a form (or an "except") of its word in pronunciation.json.
//
// NÝ 3: THE LINE ITSELF AS CONTEXT, SEED 7. Every Mosi line the owner has not approved is sent with its own caption as context:
// the request the book makes for it (above) keeps its text (the say, with the book's forms), its context becomes that request's
// context (the book's, or the line's own) followed by the line's `text` (the caption, not its say), joined with one space, and
// its seed becomes 7. It is sent as previous_text, never spoken. Why: plain takes (a seed of their own, no context) came out
// sounding Norwegian or Danish to him, and in chapter 4 (2026-11-04, commit a86be9b in dino-kafli4-flugedla, its
// .superpowers/sdd/kafli4/mosi-tokur.mjs) he picked this take, "Ný 3" (c7), for 11 of the 11 lines it was offered on; it had
// only been put on single lines, so new lines came out plain again (2026-11-05, his "Já, gerðu það"). THE EXCEPTION: a line is
// approved when the latest verdict in remake/assets/audio/heard/ on the cache key of the book's request for it is "ja"; an
// approved line keeps that request exactly (his yes is on that take), and a kept line (below) is never touched. The rule is
// decided on that key alone, so it stays put after an A/B: if he picks the old take, its key gets "ja" and the line keeps its
// request; if he picks the new one, the old key gets "nei" and the line stays on Ný 3, whose key has his "ja". A Ný 3 request he
// rejected is stopped by the guard (below) like any other: give the line another recipe, context or seed (--try). --try's
// candidates are sent as they are written (the book, and their own fields), not by this rule. --dry names the rule on each line
// it changes; --plan lists the lines whose MP3 is of the book's request it replaces (waiting for him, as --verify says).
// THE OWNER'S VERDICTS are read once a run (heard.mjs readHeard) and passed through: memoryRequest needs them.
//
// KEPT LINES. A line whose take the owner chose by ear has a `kept`: one sentence naming his pick. It is sent as its own fields
// say, without the lexicon, so its request and cache key stay the ones he heard; the tool never asks for it again or masters over
// it. --ab --only <id> still makes the take the tool would send were it not kept (the book's, and Ný 3 unless that one is
// approved), for him to compare. After an A/B (its page saves jano-minnisspil.json, imported with heard.mjs --made
// <out>/voices-made.json: the take he picks gets "ja", the other "nei", "Báðar rangar" both "nei"): a line whose old take he
// keeps is approved by that "ja" (or, for a kept line, keeps its `kept`); for a line whose new take he picks, run --only <id>:
// the take he heard is in the cache under its key, so it is the one installed.
//
// FIXES. A line that carries its own `say` or `context` names what it fixes in `fixes` (a book word id or a list of them,
// "punctuation", or "line" with a `note` that says it fixes the whole line), as main's lines do (heard.mjs fixesProblems); the tool
// makes nothing while a line's fixes are wrong, and --dry shows, line by line, where each of its words was fixed on a line of its own.
//
// THE OWNER'S EAR (heard.mjs). His yes/no verdicts are in remake/assets/audio/heard/, the memory game's as set "minnisspil"
// (`node remake/tools/heard.mjs jano-minnisspil.json --made <page>/voices-made.json`). Before anything is asked for or installed,
// every line (and every candidate) about to be sent goes through assertNotRejected: a request he said no to is never made again,
// by cache or by chance; change its recipe or seed. --dry marks such a line REJECTED; --plan and --verify list the shipped lines
// whose take he rejected.
//
// CANDIDATES (--try). When he rejects a line, --try <file.json> makes 3-4 candidates for him to pick by ear:
//   { "line": "<id>", "variants": { "<name>": { "how": "<Icelandic, for the page>", "say"?, "context"?, "seed"?, "choose"?: { "<book word id>": "<recipe>" | null } } } }
// A variant's say, context and seed take the place of the line's own; `choose` picks a recipe of a book word for this take
// (pronunciation.mjs withChoice), so a candidate recipe is a recipe of its word in the book. Each goes through the book and the
// guard like any line, into <out>/try/<id>-<name>.mp3, with try.json (what each sent) and, for the yes/no page, a record heard.mjs
// imports: <out>/voices-made.json and <out>/minnisspil/lines-source.json. Nothing is installed: the take he picks goes in as the
// line's own fields, `kept`, with its `fixes`.
//
// THE RECORD of which request made each MP3 is the `key` of its entry in remake/assets/audio/memory/manifest.json (the cache key of
// the request, voice-lines.mjs cacheKey; a kept line's is the key of its kept request), tracked, so that every checkout reads the
// same; the tool writes it with the entry, as voice-lines.mjs writes voices-made.json as it masters a line. A line whose entry has no
// key yet falls back to this checkout's .tools/elevenlabs-remake/memory-index.json (where the record was kept before 2026-11-06).
// --verify passes a line whose MP3 is of its own request but which the lexicon would now send otherwise, or of the book's request
// that Ný 3 now sends otherwise, and lists it under "waitingForOwner" (see --plan and --ab); any other mismatch fails, and so does a
// shipped take the owner said "nei" to.
//
// ELEVENLABS_API_KEY is read only from the process environment and sent only in the ElevenLabs API header; never printed, logged
// or written. Raw takes are kept in .tools/elevenlabs-remake/<cache key>.mp3 (voice-lines.mjs cacheKey: the text sent, context,
// voice, model, settings and seed); a take another checkout of the repo already has is copied from its cache, not asked for again.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {VOICE_LINES} from '../engine/memory/voice-lines.js';
import {allLines,cacheKey,MODEL,SETTINGS,sha256,siblingCaches} from './voice-lines.mjs';
import {readLexicon,requestFor,withChoice} from './pronunciation.mjs';
import {assertNotRejected,evidenceFor,fixesByWord,fixesProblems,readHeard,rejection} from './heard.mjs';
import {escapeHtml} from './voice-pages.mjs';
import {lineEntry} from './audio-lines.mjs';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const FOLDER=path.join(ROOT,'remake/assets/audio/memory');
const CACHE=path.join(ROOT,'.tools/elevenlabs-remake');
const INDEX=path.join(CACHE,'memory-index.json');
const AB_OUT='qa/memory/tal';
const TRY_OUT='qa/memory/tal2';
const MASTER='loudnorm=I=-18:TP=-2:LRA=7,apad=pad_dur=0.25';
export const SPEAKER='mosi';
/** The memory game's name in the owner's verdicts (remake/assets/audio/heard/<date>-minnisspil.json, "minnisspil/<id>"). */
export const SET='minnisspil';
const readJson=(file,fallback)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;
export const VOICE_ID=readJson(path.join(ROOT,'remake/assets/audio/voices.json'),{}).mosi;
if(VOICE_ID!=='osSKuDKznhXBktjJ9Z9F')throw new Error('The established Mosi voice changed; review before generating memory audio.');
if(MODEL!=='eleven_v4'||SETTINGS.speed!==.95)throw new Error('Memory audio requires the approved Eleven v4 model at speed .95.');
export const LINES=Object.entries(VOICE_LINES);
const isText=value=>typeof value==='string'&&value.trim().length>0;
for(const[id,line]of LINES){
  if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)||!isText(line.text)||['say','context','kept','note'].some(field=>line[field]!==undefined&&!isText(line[field]))
    ||(line.fixes!==undefined&&!isText(line.fixes)&&!(Array.isArray(line.fixes)&&line.fixes.length&&line.fixes.every(isText)))
    ||(line.seed!==undefined&&!(Number.isInteger(line.seed)&&line.seed>=0&&line.seed<=4294967295)))throw new Error(`Invalid voice script entry: ${id}.`);
}
/** The lines as heard.mjs reads a set's: { set, id, speaker, ... }. */
export const heardLines=(lines=LINES)=>lines.map(([id,line])=>({set:SET,id,speaker:SPEAKER,...line}));
/** What is wrong with the lines' `fixes` ([] when nothing): heard.mjs fixesProblems, as main's lines are held to it. */
export const fixesFindings=(lexicon,lines=LINES)=>heardLines(lines).flatMap(line=>fixesProblems(line,lexicon));
const stopIfFixes=lexicon=>{const found=fixesFindings(lexicon);if(found.length)throw new Error(`${found.join('\n')}\nNo request was made.`);};
/** Stops before anything is asked for or installed when the owner rejected exactly one of these requests ([{ label, key }]). */
export function guard(items,heard=readHeard(ROOT)){for(const{label,key}of items)assertNotRejected(heard,key,label);}
const OWN=['say','context','seed'];
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(`${file}.part`,`${JSON.stringify(value,null,2)}\n`);fs.renameSync(`${file}.part`,file);};
/** This checkout's old local record (id -> cache key), read only where the manifest has no key for a line. */
export const readIndex=()=>readJson(INDEX,{});
export const MANIFEST=path.join(FOLDER,'manifest.json');
/** The shipped lines' manifest: id -> { src, duration, mouth, key }. */
export const readManifest=()=>readJson(MANIFEST,{});
/** THE RECORD: id -> the cache key of the request that made its MP3: its manifest entry's `key`, else the local index's. */
export function recordOf(manifest=readManifest(),index=readIndex()){
  const record={...index};
  for(const[id,entry]of Object.entries(manifest))if(typeof entry?.key==='string')record[id]=entry.key;
  return record;
}
/** A manifest entry for a line's MP3 (audio-lines.mjs lineEntry: src, duration, mouth) and the key of the request that made it. */
const entryOf=(file,id,key)=>({...lineEntry(file,`assets/audio/memory/${id}.mp3`),key});

// ---------------------------------------------------------------------------------------------
// What is sent

/** What a line sent before the lexicon, and what a kept line still sends: its own say (or its text), context and seed. */
export function ownRequest(line){
  return{text:line.say??line.text,context:line.context,seed:line.seed,words:[],own:OWN.filter(field=>line[field]!==undefined),hidden:[]};
}

/** A word's chosen context for Mosi (undefined when its chosen recipe has none). */
const chosenContext=(lexicon,word)=>{
  const context=word.recipe?lexicon.words[word.id].recipes[word.recipe].context:undefined;
  return typeof context==='object'&&context!==null?context[SPEAKER]??context['*']:context;
};

/**
 * The book's request for a line, kept or not, before Ný 3: through requestFor, with its say (or its text) as the text the lexicon is
 * applied to, and its own context and seed winning. `words` are the lexicon's words found ({ id, word, forms, recipe }), `own` the
 * line's own fields, `hidden` the words whose chosen context the line's own context hides. --try's candidates are sent this way.
 */
export function bookRequest(line,lexicon){
  const sent=requestFor({speaker:SPEAKER,text:line.say??line.text,...(line.context===undefined?{}:{context:line.context}),...(line.seed===undefined?{}:{seed:line.seed})},lexicon);
  const hidden=line.context===undefined?[]:sent.words.filter(word=>{const context=chosenContext(lexicon,word);return context&&!line.context.includes(context);}).map(word=>word.id);
  return{...sent,own:OWN.filter(field=>line[field]!==undefined),hidden};
}

/** Ný 3's seed (kafli4 a86be9b, "c7"). */
export const NY3_SEED=7;
/** How --dry and the page name the rule on a line it changes. */
export const NY3_NAME='Ný 3: línan sjálf sem samhengi, fræ 7';

/** Ný 3 on a request: its context (the book's or the line's own) and then the line's caption, joined with one space, and seed 7; the text sent stays. */
export function ny3Request(sent,line){
  return{...sent,context:[sent.context,line.text].filter(Boolean).join(' '),seed:NY3_SEED,own:sent.own.filter(field=>field!=='seed'),ny3:true};
}

/** The owner's "ja" when it is his latest verdict on exactly this request (heard.mjs readHeard), else null: the take he approved. */
export function approval(heard,key){
  const latest=heard.byKey.get(key)?.at(-1);
  return latest?.verdict==='ja'?latest:null;
}

/**
 * What is sent for a line: a kept line's own fields (unless `ignoreKept`, for --ab); an approved line's book request exactly
 * (`approved`: his "ja" on it); any other line's book request under Ný 3 (`ny3`: true). `heard` is the owner's verdicts, read
 * once a run and passed through.
 */
export function memoryRequest(line,lexicon,{ignoreKept=false,heard}={}){
  if(line.kept!==undefined&&!ignoreKept)return{...ownRequest(line),kept:line.kept};
  if(!heard?.byKey)throw new Error('memoryRequest needs the owner\'s verdicts (heard.mjs readHeard, read once and passed through): whether a line is approved decides what it sends. No request was made.');
  const sent=bookRequest(line,lexicon),yes=approval(heard,fingerprintOf(sent));
  return yes?{...sent,approved:{id:yes.id,date:yes.date}}:ny3Request(sent,line);
}

/** The cache key of what is sent (voice-lines.mjs cacheKey, in Mosi's voice). */
export const fingerprintOf=sent=>cacheKey({text:sent.text,voiceId:VOICE_ID,seed:sent.seed,context:sent.context});

/** Words of a text that a lexicon stem matches but that are none of its word's forms or excepts: they would be sent as written. */
export function uncovered(text,lexicon){
  const found=[];
  for(const[id,entry]of Object.entries(lexicon.words)){
    const stem=new RegExp(`^(?:${entry.stem})`,'u'),known=new Set([...entry.forms,...(entry.except??[])]);
    for(const token of text.match(/\p{L}+/gu)??[])if(stem.test(token)&&!known.has(token))found.push(`${token} (${id})`);
  }
  return found;
}

/**
 * Each line's state: `sent` and `key` (what the tool sends now), `ownKey` (its own request: what the tool sent before it applied
 * the lexicon), `bookKey` (the book's request, before Ný 3; a kept line's own), `shipped` (the key that made its MP3, from the
 * record: recordOf), and `state`: "same" (the MP3 is of the request sent now), "ny3" (it is of the book's request, which Ný 3 now sends
 * otherwise: the owner has not approved it), "lexicon" (it is of the line's own request; the lexicon would send it otherwise) or
 * "stale" (of none of them, or not made). `heard` is the owner's verdicts, read once and passed through.
 */
export function statesOf(lexicon,record=recordOf(),lines=LINES,heard=readHeard(ROOT)){
  return lines.map(([id,line])=>{
    const sent=memoryRequest(line,lexicon,{heard}),key=fingerprintOf(sent),ownKey=fingerprintOf(ownRequest(line)),shipped=record[id]??null;
    const bookKey=line.kept===undefined?fingerprintOf(bookRequest(line,lexicon)):ownKey;
    const state=shipped===key?'same':shipped===bookKey?'ny3':shipped===ownKey?'lexicon':'stale';
    return{id,line,sent,key,ownKey,bookKey,shipped,state,uncovered:uncovered(line.text,lexicon)};
  });
}

const describeWords=sent=>sent.words.map(word=>`${word.forms.join('/')}: ${word.recipe??'not chosen, sent as written'}`).join('; ');
const stopIfUncovered=states=>{
  const found=states.flatMap(item=>item.uncovered.map(word=>`${item.id}: ${word}`));
  if(found.length)throw new Error(`These words are none of their word's forms in remake/assets/audio/pronunciation.json, so they would be sent as written: ${found.join(', ')}. Add each to its word's "forms" (and a say for it in each recipe that has one per form) or to its "except". No request was made.`);
};

// ---------------------------------------------------------------------------------------------
// Takes

let modelChecked=false;
/** Once a run, before the first request: the model is there and speaks Icelandic. */
async function checkModel(apiKey){
  if(modelChecked)return;
  const models=await fetch('https://api.elevenlabs.io/v1/models',{headers:{'xi-api-key':apiKey},signal:AbortSignal.timeout(30000)});
  if(!models.ok)throw new Error(`ElevenLabs model verification returned HTTP ${models.status}.`);
  const model=(await models.json()).find(m=>m.model_id===MODEL);
  if(!model?.can_do_text_to_speech||!model.languages?.some(l=>l.language_id==='is'))throw new Error('The requested model/Icelandic combination is not currently available.');
  modelChecked=true;
}

/**
 * The raw take of a request: from this checkout's cache, copied from another checkout's, or asked for once (Mosi's voice, Eleven v4,
 * Icelandic, the approved settings) and kept under its cache key. Returns { raw, asked }.
 */
export async function takeOf(sent,{apiKey=process.env.ELEVENLABS_API_KEY,label='take'}={}){
  const key=fingerprintOf(sent),raw=path.join(CACHE,`${key}.mp3`);
  fs.mkdirSync(CACHE,{recursive:true});
  if(fs.existsSync(raw))return{raw,key,asked:false};
  const elsewhere=siblingCaches(ROOT).map(dir=>path.join(dir,`${key}.mp3`)).find(file=>fs.existsSync(file));
  if(elsewhere){fs.copyFileSync(elsewhere,`${raw}.part`);fs.renameSync(`${raw}.part`,raw);return{raw,key,asked:false};}
  if(!apiKey)throw new Error(`${label}: no cached take, and ELEVENLABS_API_KEY must be available in the environment.`);
  await checkModel(apiKey);
  let response;
  for(let attempt=0;attempt<3;attempt++){
    response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({text:sent.text,model_id:MODEL,language_code:'is',voice_settings:SETTINGS,...(sent.seed===undefined?{}:{seed:sent.seed}),...(sent.context===undefined?{}:{previous_text:sent.context})}),signal:AbortSignal.timeout(120000)});
    if(response.status!==429)break;
    await response.arrayBuffer();await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));
  }
  if(!response.ok)throw new Error(`ElevenLabs ${label}: HTTP ${response.status}; no response body or credentials logged.`);
  if(!response.headers.get('content-type')?.startsWith('audio/'))throw new Error(`ElevenLabs ${label}: response was not audio.`);
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<1000)throw new Error(`ElevenLabs ${label}: audio was empty.`);
  fs.writeFileSync(`${raw}.part`,bytes);fs.renameSync(`${raw}.part`,raw);
  return{raw,key,asked:true};
}

/**
 * A raw take mastered like the game's lines (about -18 LUFS, a quarter second after the voice, mono 44.1 kHz, 96 kbps), into a
 * part file that `check(part)` looks at first (it throws to keep what is there: the part file goes, the target is untouched), then
 * renamed over the target.
 */
export function master(raw,target,check=null){
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const part=target.replace(/\.mp3$/,'.part.mp3');
  run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-map_metadata','-1','-af',MASTER,'-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','96k',part]);
  try{check?.(part);}catch(error){fs.rmSync(part,{force:true});throw error;}
  fs.renameSync(part,target);
}

// ---------------------------------------------------------------------------------------------
// The listening page: rows of takes side by side, the words in question marked, a radio per take and "Vista val"

/** How a word's chosen recipe changes what is sent, in Icelandic for the owner. */
export function recipeSentence(lexicon,word){
  const recipe=lexicon.words[word.id].recipes[word.recipe],forms=word.forms.map(form=>`„${form}“`).join(' og '),many=word.forms.length>1;
  if(recipe.say!==undefined){
    const says=[...new Set(word.forms.map(form=>typeof recipe.say==='string'?recipe.say:recipe.say[form]))].map(say=>say.replaceAll('"',''));
    return `${forms} ${many?'eru send':'er sent'} sem ${says.some(say=>say.startsWith('/'))?'IPA':'stafsetningin'} ${says.join(', ')}`;
  }
  const context=chosenContext(lexicon,word);
  if(context)return `${forms} ${many?'fá':'fær'} samhengið „${context}“ á undan (sent, ekki talað)`;
  return `${forms} ${many?'eru send':'er sent'} eins og ${many?'þau eru skrifuð':'það er skrifað'}`;
}

/** The sentences for a line's chosen words, words that share a context in one ("„Vel“ og „gert“ fá samhengið ..."). */
export function changeSentences(lexicon,words){
  const groups=new Map();
  for(const word of words){const context=chosenContext(lexicon,word),key=context?`context:${context}`:`word:${word.id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(word);}
  return [...groups.values()].map(group=>recipeSentence(lexicon,{...group[0],forms:group.flatMap(word=>word.forms)})).join('; ');
}

/** The text with these words marked. */
export const markWords=(text,words)=>{
  let html=escapeHtml(text);
  for(const word of [...new Set(words)].sort((a,b)=>b.length-a.length))html=html.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeHtml(word).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}\\p{N}])`,'gu'),match=>`<mark>${match}</mark>`);
  return html;
};

/** The pages' look (the tal pages): paper, ink and a card per line, light and dark. */
const PAGE_STYLE=`<style>
:root { --paper: #fbf3e2; --ink: #3b2a1a; --muted: #7a6650; --line: #e3d3b4; --mark: #f6d27a; --card: #fffaf0; }
@media (prefers-color-scheme: dark) { :root { --paper: #231a12; --ink: #f3e6d0; --muted: #c2ad90; --line: #4a3a2a; --mark: #7a5a12; --card: #2d2218; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.5 system-ui, sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 16px; }
h1 { font-size: 1.6rem; margin: .4rem 0; }
h2 { font-size: 1.2rem; margin: 2rem 0 .3rem; border-bottom: 2px solid var(--line); padding-bottom: .2rem; }
.note, .intro { color: var(--muted); }
.line { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 12px 0; }
.text { font-size: 1.15rem; margin: 0 0 .3rem; }
.text code { font-size: .75rem; color: var(--muted); }
mark { background: var(--mark); color: inherit; border-radius: 3px; padding: 0 2px; }
.why { margin: 0 0 .5rem; }
.takes { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.take { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--line); border-radius: 8px; padding: 8px; cursor: pointer; }
.take audio { width: 100%; }
.take small { color: var(--muted); font-size: .8rem; overflow-wrap: anywhere; }
.bar { position: sticky; bottom: 0; background: var(--paper); border-top: 1px solid var(--line); padding: 10px 16px; display: flex; gap: 12px; align-items: center; justify-content: center; }
button { font: inherit; padding: .4rem 1rem; border-radius: 8px; border: 1px solid var(--ink); background: var(--card); color: var(--ink); cursor: pointer; }
</style>`;

/**
 * The yes/no page whose save heard.mjs imports: `sections` of { title, note, rows }; a row { id, text (HTML), why, takes: [{ id,
 * label, src, how, checked? }] }, each take's id one of the page record's (addToPageRecord). A row of several takes is a pick: the
 * one he picks is "ja" and the others "nei", or the none choice (`none`: its label and line, "Engin" by default) makes them all
 * "nei"; a take with `checked` is picked when the page opens. A row of one take asks "Já" or "Nei". Each row has a note.
 * "Vista val" saves jano-minnisspil.json: { "set": "minnisspil", "choices": { "<take id>": "ja" | "nei" }, "notes": { "<take id>": "..." } }.
 */
export function janoPage({title,intro,sections,none={label:'Engin',how:'Engin takan segir línuna rétt.'}}){
  const takeHow=take=>take.how?`<small>${escapeHtml(take.how)}</small>`:'';
  const row=item=>`<div class="line" data-id="${escapeHtml(item.id)}" data-takes="${escapeHtml(item.takes.map(take=>take.id).join(' '))}">
  <p class="text">${item.text} <code>${escapeHtml(item.id)}</code></p>${item.why?`\n  <p class="why">${escapeHtml(item.why)}</p>`:''}
  <div class="takes">${item.takes.length>1?`${item.takes.map(take=>`
    <label class="take"><span><input type="radio" name="${escapeHtml(item.id)}" value="${escapeHtml(take.id)}"${take.checked?' checked':''}> ${escapeHtml(take.label)}</span>
      <audio controls preload="none" src="${escapeHtml(take.src)}"></audio>${takeHow(take)}</label>`).join('')}
    <label class="take none"><span><input type="radio" name="${escapeHtml(item.id)}" value=""> ${escapeHtml(none.label)}</span><small>${escapeHtml(none.how)}</small></label>`:`
    <div class="take"><span>${escapeHtml(item.takes[0].label)}</span><audio controls preload="none" src="${escapeHtml(item.takes[0].src)}"></audio>${takeHow(item.takes[0])}
      <span class="janei"><label><input type="radio" name="${escapeHtml(item.id)}" value="ja"> Já, rétt</label> <label><input type="radio" name="${escapeHtml(item.id)}" value="nei"> Nei</label></span></div>`}
  </div>
  <input class="athugasemd" type="text" aria-label="Athugasemd" placeholder="Athugasemd (má sleppa)">
</div>`;
  return `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${PAGE_STYLE}
<style>
.take.none { justify-content: center; }
.janei { display: flex; gap: 18px; margin-top: 4px; }
.janei label { cursor: pointer; }
.athugasemd { font: inherit; width: 100%; margin-top: 8px; padding: .3rem .5rem; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p class="intro">${escapeHtml(intro)}</p>
${sections.map(section=>`<h2>${escapeHtml(section.title)}</h2>${section.note?`\n<p class="note">${escapeHtml(section.note)}</p>`:''}\n${section.rows.map(row).join('\n')}`).join('\n')}
</main>
<div class="bar"><span id="count"></span><button id="save" type="button">Vista val</button></div>
<script>
  const lines = [...document.querySelectorAll('.line')];
  const answer = line => { const input = line.querySelector('input[type=radio]:checked'); return input ? input.value : null; };
  const jano = () => {
    const choices = {}, notes = {};
    for (const line of lines) {
      const value = answer(line), takes = line.dataset.takes.split(' '), note = line.querySelector('.athugasemd').value.trim();
      if (value === null) continue;
      if (takes.length > 1) for (const id of takes) choices[id] = id === value ? 'ja' : 'nei';
      else choices[takes[0]] = value;
      if (note) for (const id of takes) notes[id] = note;
    }
    return { set: ${JSON.stringify(SET)}, choices, notes };
  };
  const count = () => { document.getElementById('count').textContent = lines.filter(line => answer(line) !== null).length + ' af ' + lines.length + ' svarað'; };
  document.addEventListener('change', count);
  count();
  document.getElementById('save').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(jano(), null, 2) + '\\n'], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: ${JSON.stringify(`jano-${SET}.json`)} });
    document.body.append(link); link.click(); link.remove();
  });
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// The modes

/** --plan's findings: `make` (lines whose MP3 is not of the request sent now), `kept` (kept lines the lexicon would send otherwise), `hidden`, `uncovered`. */
export function planOf(lexicon,record=recordOf(),heard=readHeard(ROOT)){
  const states=statesOf(lexicon,record,LINES,heard);
  return{
    states,
    make:states.filter(item=>item.state!=='same'),
    // the shipped take (by the record, or by the MP3 he heard) is one he said no to; and lines whose request sent now he rejected
    rejected:states.filter(item=>(item.shipped&&rejection(heard,item.shipped))||rejectedMp3(heard,item.id)),
    refused:states.filter(item=>rejection(heard,item.key)),
    // the request sent now is a take he said yes to (his latest verdict on it), and its MP3 is not in yet
    picked:states.filter(item=>item.state!=='same'&&approval(heard,item.key)),
    kept:states.filter(item=>item.line.kept!==undefined&&fingerprintOf(bookRequest(item.line,lexicon))!==item.ownKey),
    hidden:states.filter(item=>item.sent.hidden.length),
    uncovered:states.filter(item=>item.uncovered.length),
  };
}

/** --dry's notes for each line (heard.mjs evidenceFor): REJECTED when the owner said no to exactly the request sent now, and where each of its words was fixed on a line of its own (main's lines and this game's). */
export function notesOf(lexicon,states,heard=readHeard(ROOT)){
  const fixes=fixesByWord([...allLines(ROOT),...heardLines()]);
  return new Map(states.map(item=>[item.id,evidenceFor({where:`${SET}/${item.id}`,words:item.sent.words,key:item.key,lexicon,fixes,heard})]));
}

function dryRun(only){
  const lexicon=readLexicon(ROOT),heard=readHeard(ROOT);
  const states=statesOf(lexicon,recordOf(),LINES,heard).filter(item=>!only||only.includes(item.id));
  const cached=item=>fs.existsSync(path.join(CACHE,`${item.key}.mp3`))||siblingCaches(ROOT).some(dir=>fs.existsSync(path.join(dir,`${item.key}.mp3`)));
  const changed=states.filter(item=>item.key!==item.ownKey),notes=notesOf(lexicon,states,heard),rejected=states.filter(item=>rejection(heard,item.key));
  const approved=states.filter(item=>item.sent.approved),ny3=states.filter(item=>item.sent.ny3);
  console.log(`memory: ${states.length} lines; ${changed.length} sent otherwise than their own fields (the lexicon or Ný 3), ${states.length-changed.length} as before (${states.filter(item=>item.line.kept!==undefined).length} kept); ${approved.length} approved by the owner's "ja", ${ny3.length} under Ný 3 (no "ja" yet); ${states.filter(item=>item.state==='same').length} MP3s of the request sent now; ${states.filter(cached).length} cached${rejected.length?`; ${rejected.length} REJECTED by the owner`:''}`);
  for(const problem of fixesFindings(lexicon))console.log(`  FIXES: ${problem}`);
  for(const item of states){
    const mark=item.line.kept!==undefined?'kept':item.key!==item.ownKey?'CHANGED':'same';
    console.log(`  ${item.id}: ${mark}  ${JSON.stringify(item.sent.text)}${item.sent.seed===undefined?'':`  seed ${item.sent.seed}`}${item.sent.words.length?`  [${describeWords(item.sent)}]`:''}${item.sent.own.length?`  (own ${item.sent.own.join(', ')})`:''}${item.sent.ny3?`  (${NY3_NAME})`:''}  ${cached(item)?'cached':'to ask'}`);
    if(item.sent.context!==undefined)console.log(`      context (not spoken): ${JSON.stringify(item.sent.context)}`);
    if(item.key!==item.ownKey)console.log(`      cache key ${item.key.slice(0,12)}, was ${item.ownKey.slice(0,12)}`);
    if(item.sent.ny3)console.log(`      Ný 3: the owner has no "ja" on the book's request (${item.bookKey.slice(0,12)})${item.state==='ny3'?', which made its MP3: waiting for him (--plan, --ab)':''}`);
    if(item.sent.approved)console.log(`      approved: the owner's "ja" on exactly this request (${item.sent.approved.id}, ${item.sent.approved.date}); it is sent as it is`);
    if(item.line.kept!==undefined)console.log(`      kept: ${item.line.kept}`);
    if(item.sent.hidden.length)console.log(`      its own context hides the chosen context of ${item.sent.hidden.join(', ')}`);
    if(item.uncovered.length)console.log(`      NOT IN THE LEXICON'S FORMS (sent as written): ${item.uncovered.join(', ')}`);
    for(const note of notes.get(item.id))console.log(`      ${note}`);
  }
  console.log(JSON.stringify({clips:states.length,characters:states.reduce((n,item)=>n+item.sent.text.length,0),cached:states.filter(cached).length,model:MODEL,voiceId:VOICE_ID,language:'is',settings:SETTINGS,
    changed:changed.map(item=>item.id),same:states.length-changed.length,kept:states.filter(item=>item.line.kept!==undefined).map(item=>item.id),approved:approved.map(item=>item.id),ny3:ny3.map(item=>item.id),rejected:rejected.map(item=>item.id),
    stateOfShipped:Object.fromEntries(['same','ny3','lexicon','stale'].map(state=>[state,states.filter(item=>item.state===state).length])),uncovered:states.flatMap(item=>item.uncovered.map(word=>`${item.id}: ${word}`))},null,2));
}

function printPlan(){
  const lexicon=readLexicon(ROOT),plan=planOf(lexicon);
  console.log('Lines whose MP3 is not of the request the tool sends now (kept lines are never made again):');
  const why=item=>item.state==='ny3'?`(${NY3_NAME}) its MP3 is of the book's request, which the owner has not approved`:item.state==='lexicon'?`the lexicon changes its request (${describeWords(item.sent)})`:item.shipped?'made from another request (its text, say, context or seed changed since)':'no MP3 recorded yet';
  for(const item of plan.make)console.log(`  ${item.id}: ${why(item)}`);
  if(!plan.make.length)console.log('  none');
  for(const item of plan.kept)console.log(`  kept, never made again: ${item.id} says ${describeWords(bookRequest(item.line,lexicon))} (${item.line.kept}); --ab --only ${item.id} makes the take it would send were it not kept, to compare`);
  for(const item of plan.hidden)console.log(`  ${item.id}: its own context hides the chosen context of ${item.sent.hidden.join(', ')}`);
  for(const item of plan.uncovered)console.log(`  ${item.id}: not in the lexicon's forms, sent as written: ${item.uncovered.join(', ')}`);
  const refused=new Set(plan.refused.map(item=>item.id)),picked=new Set(plan.picked.map(item=>item.id));
  for(const item of plan.rejected)console.log(`  ${item.id}: ships a take the owner rejected; ${refused.has(item.id)?'he rejected the request it sends now too: make 3-4 candidates with --try <candidates.json>':picked.has(item.id)?'the request it sends now is a take he picked':'the request it sends now is another'}`);
  for(const item of plan.refused.filter(item=>!plan.rejected.includes(item)))console.log(`  ${item.id}: the owner rejected exactly the request it sends now; the guard refuses it until its recipe or seed changes (--try)`);
  const ready=plan.make.filter(item=>picked.has(item.id)),compare=plan.make.filter(item=>!picked.has(item.id)&&!refused.has(item.id));
  if(ready.length)console.log(`His picks, ready: node remake/tools/memory-voices.mjs --only ${ready.map(item=>item.id).join(',')}   (the take he heard is in the cache under its key, so it is the one installed)`);
  if(compare.length){
    console.log(`Then: node remake/tools/memory-voices.mjs --ab --only ${compare.map(item=>item.id).join(',')}`);
    console.log('      (the owner listens on the page) and node remake/tools/memory-voices.mjs --only <the lines whose new take he picks>');
  }
  return plan;
}

/** What a request sends, for the page's small print: the text sent when it is not the caption, its context and its seed. */
const howSent=(sent,line)=>[sent.text!==line.text?`sent: ${sent.text}`:'',sent.context?`samhengi: ${sent.context}`:'',sent.seed===undefined?'':`fræ ${sent.seed}`].filter(Boolean).join(' · ');

/**
 * The rows of an A/B page for these lines (janoPage's): the shipped take, "<id>_gamla", beside the take the tool would send were the
 * line not kept, "<id>_nyja", picked when the page opens. Writes the MP3s under `out`, ab.json (what each new take sent, and the
 * old take's key) and the page record with both takes (addToPageRecord: key and MP3 sha256 of each), so that heard.mjs --made
 * <out>/voices-made.json imports his save. The old take is on the page when its MP3 is there and the record (recordOf: the
 * manifest's key) says which request made it, and that request is not the new one.
 */
export async function abTakes({ids,out=path.join(ROOT,AB_OUT),log=console.log,heard=readHeard(ROOT)}){
  const lexicon=readLexicon(ROOT);
  const states=statesOf(lexicon,recordOf(),LINES.filter(([id])=>ids.includes(id)),heard);
  stopIfUncovered(states);
  stopIfFixes(lexicon);
  const sentOf=line=>memoryRequest(line,lexicon,{ignoreKept:true,heard});
  guard(states.map(({id,line})=>({label:`${SET}/${id}`,key:fingerprintOf(sentOf(line))})),heard);
  run('ffmpeg',['-version']);
  const record=readJson(path.join(out,'ab.json'),{}),rows=[],takes=[];
  for(const{id,line,shipped:shippedKey,state}of states){
    const sent=sentOf(line),{raw,key,asked}=await takeOf(sent,{label:id}),newMp3=path.join(out,'ab','new',`${id}.mp3`);
    master(raw,newMp3);
    const shipped=path.join(FOLDER,`${id}.mp3`),oldMp3=path.join(out,'ab','old',`${id}.mp3`),old=Boolean(shippedKey)&&shippedKey!==key&&fs.existsSync(shipped);
    if(old){fs.mkdirSync(path.dirname(oldMp3),{recursive:true});fs.copyFileSync(shipped,oldMp3);}
    const chosenWords=sent.words.filter(word=>word.recipe);
    record[id]={key,text:line.text,sent:{text:sent.text,context:sent.context,seed:sent.seed},words:chosenWords.map(word=>({id:word.id,recipe:word.recipe,forms:word.forms})),...(sent.ny3?{rule:NY3_NAME}:{}),...(old?{old:{key:shippedKey}}:{}),...(line.kept===undefined?{}:{kept:line.kept})};
    const why=[chosenWords.length?`Nú: ${changeSentences(lexicon,chosenWords)}.`:'',sent.ny3?'Nýja takan: línan sjálf er send á undan sem samhengi (ekki sögð), fræ 7, eins og „Ný 3“ sem þú valdir í kafla 4.':''].filter(Boolean).join(' ');
    const before=state==='ny3'?bookRequest(line,lexicon):state==='lexicon'?ownRequest(line):null;
    rows.push({id,ny3:Boolean(sent.ny3),text:markWords(line.text,chosenWords.flatMap(word=>word.forms)),why,takes:[
      ...(old?[{id:`${id}_gamla`,label:`Gamla (í leiknum${line.kept===undefined?'':', þitt val'})`,src:`ab/old/${id}.mp3`,how:before?howSent(before,line):''}]:[]),
      {id:`${id}_nyja`,label:`Nýja (${sent.ny3?'Ný 3':'eftir framburðarreglunum'}, ekki komin inn)`,src:`ab/new/${id}.mp3`,how:howSent(sent,line),checked:true},
    ]});
    takes.push(...(old?[{id:`${id}_gamla`,key:shippedKey,mp3:oldMp3,text:line.text}]:[]),{id:`${id}_nyja`,key,mp3:newMp3,text:line.text});
    log(`${id}: ${asked?'asked':'cached'} (${key.slice(0,12)})${old?`, beside the shipped take (${shippedKey.slice(0,12)})`:''}`);
  }
  writeJson(path.join(out,'ab.json'),record);
  addToPageRecord(out,takes);
  return rows;
}

/**
 * The record a yes/no page's save is imported with (heard.mjs --made <out>/voices-made.json): "minnisspil/<id>" -> { key, mp3 }, the
 * request and the sha256 of the MP3 the page plays, and <out>/minnisspil/lines-source.json, who says what. Entries are added or renewed.
 */
export function addToPageRecord(out,rows){
  const file=path.join(out,'voices-made.json'),record=readJson(file,{about:'',lines:{}});
  const sourceFile=path.join(out,SET,'lines-source.json'),source=new Map(readJson(sourceFile,[]).map(line=>[line.id,line]));
  for(const{id,key,mp3,text}of rows){record.lines[`${SET}/${id}`]={key,mp3:sha256(mp3),model:MODEL};source.set(id,{id,speaker:SPEAKER,text});}
  record.about=`The takes this page plays, for heard.mjs: node remake/tools/heard.mjs <jano-${SET}.json> --made ${path.relative(ROOT,file).replaceAll('\\','/')}. "${SET}/<id>" -> the cache key of the request (voice-lines.mjs cacheKey) and the sha256 of the MP3. Written by tools/memory-voices.mjs.`;
  record.lines=Object.fromEntries(Object.entries(record.lines).sort(([a],[b])=>(a<b?-1:a>b?1:0)));
  writeJson(file,record);writeJson(sourceFile,[...source.values()].sort((a,b)=>(a.id<b.id?-1:a.id>b.id?1:0)));
}

/** A --try file's variants as requests: [{ name, id ("<line>_<name>"), how, sent, key }], each through the book (with its `choose`) like a line. */
export function variantsOf(spec,lexicon){
  const fail=why=>{throw new Error(`--try: ${why} No request was made.`);};
  if(!spec||typeof spec!=='object'||!Object.hasOwn(VOICE_LINES,spec.line??'')||!spec.variants||typeof spec.variants!=='object'||!Object.keys(spec.variants).length)fail('the file is { "line": "<a memory line id>", "variants": { "<name>": { "how", "say"?, "context"?, "seed"?, "choose"? } } }.');
  const{kept,fixes,note,...line}=VOICE_LINES[spec.line];
  const items=Object.entries(spec.variants).map(([name,variant])=>{
    if(!/^[a-z][a-z0-9]*$/.test(name))fail(`${JSON.stringify(name)} is not a variant name (a-z, 0-9).`);
    const odd=Object.keys(variant??{}).filter(key=>!['how','say','context','seed','choose'].includes(key));
    if(odd.length||!isText(variant.how))fail(`${name}: a variant has "how" (Icelandic, for the page) and only say, context, seed and choose.`);
    if(['say','context'].some(field=>variant[field]!==undefined&&!isText(variant[field]))||(variant.seed!==undefined&&!(Number.isInteger(variant.seed)&&variant.seed>=0&&variant.seed<=4294967295)))fail(`${name}: say and context are texts, seed a whole number.`);
    let book=lexicon;
    for(const[word,recipe]of Object.entries(variant.choose??{})){
      if(!lexicon.words[word]||(recipe!==null&&!Object.hasOwn(lexicon.words[word].recipes,recipe)))fail(`${name} chooses ${word}.${recipe}, which pronunciation.json does not have: add the recipe to its word first (with writeLexicon).`);
      book=withChoice(book,word,recipe);
    }
    // a candidate is sent as it is written (the book, and its own fields): not by Ný 3, which would replace its context and seed
    const sent=bookRequest({...line,...Object.fromEntries(OWN.filter(field=>variant[field]!==undefined).map(field=>[field,variant[field]]))},book);
    return{name,id:`${spec.line}_${name}`,how:variant.how,choose:variant.choose,sent,key:fingerprintOf(sent)};
  });
  const twice=items.filter((item,i)=>items.findIndex(other=>other.key===item.key)!==i);
  if(twice.length)fail(`${twice.map(item=>item.name).join(', ')} send${twice.length>1?'':'s'} the same request as another variant.`);
  return items;
}

/** --try: the candidates of one line, made and mastered into <out>/try/, with try.json and the page record. Installs nothing. */
export async function tryTakes({file,out=path.join(ROOT,TRY_OUT),log=console.log}){
  const spec=readJson(path.resolve(file),null),lexicon=readLexicon(ROOT),heard=readHeard(ROOT);
  const items=variantsOf(spec,lexicon);
  stopIfUncovered(statesOf(lexicon,recordOf(),[[spec.line,VOICE_LINES[spec.line]]],heard));
  guard(items.map(item=>({label:`${SET}/${spec.line} (${item.name})`,key:item.key})),heard);
  run('ffmpeg',['-version']);
  const variants={};
  for(const item of items){
    const{raw,asked}=await takeOf(item.sent,{label:`${spec.line} ${item.name}`}),mp3=`try/${spec.line}-${item.name}.mp3`;
    master(raw,path.join(out,mp3));
    variants[item.name]={id:item.id,key:item.key,how:item.how,...(item.choose?{choose:item.choose}:{}),sent:{text:item.sent.text,context:item.sent.context,seed:item.sent.seed},words:item.sent.words.filter(word=>word.recipe).map(word=>({id:word.id,recipe:word.recipe,forms:word.forms})),mp3};
    log(`${spec.line} ${item.name}: ${asked?'asked':'cached'} (${item.key.slice(0,12)})  ${JSON.stringify(item.sent.text)}${item.sent.context?`  context ${JSON.stringify(item.sent.context)}`:''}  seed ${item.sent.seed}`);
  }
  const record=readJson(path.join(out,'try.json'),{});
  record[spec.line]={text:VOICE_LINES[spec.line].text,variants};
  writeJson(path.join(out,'try.json'),record);
  addToPageRecord(out,items.map(item=>({id:item.id,key:item.key,mp3:path.join(out,variants[item.name].mp3),text:VOICE_LINES[spec.line].text})));
  return record[spec.line];
}

/** The A/B page's words to the owner: the new take is picked on every line; he changes a line only if the old take is better. */
export function abIntro(rows){
  return [
    'Hér er hver lína tvisvar: takan sem er í leiknum núna (gamla) og ný taka (nýja).',
    rows.some(row=>row.ny3)?'Nýju tökurnar eru gerðar eins og „Ný 3“ sem þú valdir í kafla 4: línan sjálf er send á undan sem samhengi, en ekki sögð.':'',
    'Nýja takan er valin í hverri línu. Hlustaðu á báðar.',
    'Breyttu aðeins ef gamla takan er betri. Merktu „Báðar rangar“ ef hvorug er rétt.',
    'Ýttu svo einu sinni á „Vista val“ og sendu mér skrána.',
  ].filter(Boolean).join(' ');
}

async function abMode(only,out){
  const lexicon=readLexicon(ROOT),heard=readHeard(ROOT);
  // (--ab --all: the lines --plan lists; parseArgs has made sure one of the two was said)
  const ids=only??planOf(lexicon,recordOf(),heard).make.map(item=>item.id);
  if(!ids.length){console.log('Nothing to compare: every MP3 is of the request the tool sends now.');return;}
  const rows=await abTakes({ids,out,heard});
  fs.writeFileSync(path.join(out,'ab.html'),janoPage({title:'Mosi: gamla takan eða sú nýja',intro:abIntro(rows),sections:[{title:'Línur',rows}],none:{label:'Báðar rangar',how:'Hvorug takan segir línuna rétt.'}}));
  const record=path.relative(ROOT,path.join(out,'voices-made.json')).replaceAll('\\','/');
  console.log(`${rows.length} lines: ${path.relative(ROOT,path.join(out,'ab.html')).replaceAll('\\','/')}; his save: node remake/tools/heard.mjs <jano-${SET}.json> --made ${record}`);
}

/** The verdict "nei" on the very MP3 a line ships (by its sha256), or null: a rejected take is found without the local record. */
export function rejectedMp3(heard,id){
  const file=path.join(FOLDER,`${id}.mp3`);
  if(!fs.existsSync(file))return null;
  const mp3=sha256(file);
  const latest=heard.verdicts.filter(verdict=>verdict.mp3===mp3).at(-1);
  return latest?.verdict==='nei'?latest:null;
}

/**
 * --verify's findings ({ issues, waitingForOwner, rejectedByOwner }) for the lines' states and the manifest, without the files' own
 * checks: a line waiting for the owner passes (state "ny3" or "lexicon"), a stale one fails, and so does one whose shipped take he said
 * "nei" to (by the record's key, or by its MP3's sha256: `rejectedMp3(id)`).
 */
export function verdictIssues(states,heard,rejectedMp3Of=id=>rejectedMp3(heard,id)){
  const issues=[],waitingForOwner=[],rejectedByOwner=[];
  for(const item of states){
    if(item.state==='lexicon'||item.state==='ny3')waitingForOwner.push(item.id);
    else if(item.state==='stale')issues.push(`${item.id}: stale script/model/settings fingerprint`);
    if((item.shipped&&rejection(heard,item.shipped))||rejectedMp3Of(item.id)){rejectedByOwner.push(item.id);issues.push(`${item.id}: ships a take the owner said "nei" to: make it again (--plan)`);}
  }
  return{issues,waitingForOwner,rejectedByOwner};
}

function verify(){
  const lexicon=readLexicon(ROOT),manifest=readManifest(),heard=readHeard(ROOT),states=statesOf(lexicon,recordOf(manifest),LINES,heard);
  const{issues,waitingForOwner,rejectedByOwner}=verdictIssues(states,heard);let duration=0,bytes=0;
  for(const item of states){
    const{id}=item,entry=manifest[id],file=path.join(FOLDER,`${id}.mp3`);
    if(!entry||!fs.existsSync(file)){issues.push(`${id}: missing audio/manifest`);continue;}
    if(entry.src!==`assets/audio/memory/${id}.mp3`||!(entry.duration>.3&&entry.duration<40)||!/^[0-9a-f]+$/.test(entry.mouth))issues.push(`${id}: invalid manifest entry`);
    if(!/[1-9a-f]/.test(entry.mouth)||!entry.mouth.endsWith('000'))issues.push(`${id}: silent voice or missing closing silence`);
    if(Math.abs(entry.mouth.length-entry.duration*20)>3)issues.push(`${id}: mouth duration mismatch`);
    const probe=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',file]));
    if(probe.streams[0]?.codec_name!=='mp3'||probe.streams[0]?.channels!==1||probe.streams[0]?.sample_rate!=='44100'||Math.abs(Number(probe.format.duration)-entry.duration)>.002)issues.push(`${id}: audio format/duration mismatch`);
    duration+=entry.duration;bytes+=fs.statSync(file).size;
  }
  if(issues.length)throw new Error(issues.join('\n'));
  return{clips:LINES.length,spokenLines:LINES.length,kept:LINES.filter(([,line])=>line.kept!==undefined).length,waitingForOwner,rejectedByOwner,durationSeconds:Math.round(duration*1000)/1000,bytes,model:MODEL,voiceId:VOICE_ID,language:'is',mouthRate:20};
}

/**
 * What a run that makes lines would do (generate), before anything is asked for or installed: the selected states, each with
 * `install` (false for a kept line: never asked for, never mastered over, only its manifest entry renewed from the MP3 that is there)
 * and `master` (a line to install whose shipped MP3 is not of its request: mastered from its take; the generate also masters one whose
 * MP3 is missing). Throws, making nothing, when the lines are not named (`only`, the ids of --only) nor all asked for (`all`, --all),
 * when a named line is not one, when a word is none of its word's forms, and when the owner said "nei" to exactly the request of a
 * selected line (the guard; a kept line's too: a take he later said no to is not kept). Pure but for the guard's reading of `heard`.
 */
export function installPlan(states,{only=null,all=false,heard}){
  if(!all&&!only?.length)throw new Error(`Name the lines to make with --only <ids>, or say --all. Nothing was made.\n${USAGE}`);
  if(all&&only)throw new Error(`--only and --all do not go together. Nothing was made.\n${USAGE}`);
  const unknown=(only??[]).filter(id=>!states.some(item=>item.id===id));
  if(unknown.length)throw new Error(`Not a memory line: ${unknown.join(', ')}. Nothing was made.`);
  const selected=states.filter(item=>all||only.includes(item.id));
  stopIfUncovered(selected);
  guard(selected.map(item=>({label:`${SET}/${item.id}`,key:item.key})),heard);
  return selected.map(item=>({...item,install:item.line.kept===undefined,master:item.line.kept===undefined&&item.shipped!==item.key}));
}

async function generate({only=null,all=false}){
  const lexicon=readLexicon(ROOT),heard=readHeard(ROOT),manifest=readManifest(),record=recordOf(manifest);
  const selected=installPlan(statesOf(lexicon,record,LINES,heard),{only,all,heard});
  stopIfFixes(lexicon);
  const missingKept=selected.filter(item=>!item.install&&!fs.existsSync(path.join(FOLDER,`${item.id}.mp3`))).map(item=>item.id);
  if(missingKept.length)throw new Error(`Kept lines without their MP3: ${missingKept.join(', ')}. No request was made.`);
  fs.mkdirSync(FOLDER,{recursive:true});
  // (each entry is written with the key of the request that made its MP3: the record, tracked; a kept line's is its kept request's)
  const install=(item,file)=>{manifest[item.id]=entryOf(file,item.id,item.key);writeJson(MANIFEST,manifest);};
  const length=(id,file)=>{const{duration}=lineEntry(file,`assets/audio/memory/${id}.mp3`);if(!(duration>.3&&duration<40))throw new Error(`${id}: unexpected clip duration (${duration} s); the shipped MP3 was not replaced.`);};
  let next=0,generated=0,cached=0,stop=false;
  const worker=async()=>{
    // (the first failure stops both: the other one makes no further request and installs nothing more)
    while(!stop&&next<selected.length){
      const item=selected[next++],target=path.join(FOLDER,`${item.id}.mp3`);
      try{
        if(!item.install){install(item,target);console.log(`Kept ${item.id}: ${item.line.kept}`);continue;}
        const{raw,asked}=await takeOf(item.sent,{label:item.id});
        if(asked)generated++;else cached++;
        if(stop)return;
        // (mastered into a part file whose length is checked before it goes over the shipped MP3)
        if(item.master||!fs.existsSync(target))master(raw,target,part=>length(item.id,part));
        else length(item.id,target);
        install(item,target);
        console.log(`${item.id}: ${manifest[item.id].duration}s`);
      }catch(error){stop=true;throw error;}
    }
  };
  // Two requests at a time; retries only follow explicit rate-limit rejection.
  const results=await Promise.allSettled([worker(),worker()]);
  const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  console.log(JSON.stringify({generated,cached,...verify()},null,2));
}

export const USAGE=`Usage: memory-voices.mjs --only id,id | --all      make the lines and install them
       memory-voices.mjs --dry [--only id,id]      what each line sends (asks nothing; --dry-run too)
       memory-voices.mjs --plan                    the lines whose MP3 is not of the request sent now
       memory-voices.mjs --ab --only id,id | --all [--out dir]   new takes beside the shipped ones, not installed (--all: the --plan lines)
       memory-voices.mjs --try <file.json> [--out dir]           candidates for one line, not installed
       memory-voices.mjs --verify                  the shipped MP3s, their manifest and the requests that made them`;

/**
 * The command line, strictly (as heard.mjs and voice-lines.mjs read theirs): { mode: 'make' | 'dry' | 'plan' | 'verify' | 'ab' | 'try',
 * only, all, out, file }. An unknown flag, a stray word, a flag given twice, two modes, a flag that does not go with the mode, or no mode
 * (a plain run, or one with only --out) throws with the usage: nothing is made.
 */
export function parseArgs(argv){
  const fail=why=>{throw new Error(`${why}\n${USAGE}`);};
  const args={mode:null,only:null,all:false,out:null,file:null},seen=new Set(),modes=[];
  const valueOf=(i,flag,what)=>{const next=argv[i];if(next===undefined||next.startsWith('--')||!next.trim())fail(`${flag} needs ${what}.`);return next;};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i],flag=arg==='--dry-run'?'--dry':arg;
    if(seen.has(flag))fail(`${arg} is given twice.`);
    if(flag==='--only'){args.only=valueOf(++i,'--only','line ids, separated by commas').split(',').map(id=>id.trim()).filter(Boolean);if(!args.only.length)fail('--only needs line ids, separated by commas.');}
    else if(flag==='--all')args.all=true;
    else if(flag==='--out')args.out=valueOf(++i,'--out','a folder');
    else if(flag==='--try'){args.file=valueOf(++i,'--try','a candidates file');modes.push('try');}
    else if(['--dry','--plan','--verify','--ab'].includes(flag))modes.push(flag.slice(2));
    else fail(`Unknown argument: ${arg}`);
    seen.add(flag);
  }
  for(const id of args.only??[])if(!Object.hasOwn(VOICE_LINES,id))fail(`Unknown memory line: ${id}`);
  if(modes.length>1)fail(`${modes.map(mode=>`--${mode}`).join(' and ')} do not go together.`);
  args.mode=modes[0]??(args.only||args.all?'make':null);
  if(!args.mode)fail('Say what to do: name the lines to make with --only <ids> (or say --all), or give --dry, --plan, --ab, --try or --verify. Nothing was made.');
  if(args.only&&args.all)fail('--only and --all do not go together.');
  if(['plan','verify','try'].includes(args.mode)&&(args.only||args.all))fail(`--${args.mode} does not take --only or --all.`);
  if(args.mode==='dry'&&args.all)fail('--dry reads every line already; --only picks some.');
  if(args.mode==='ab'&&!args.only&&!args.all)fail('--ab makes takes: name the lines with --only <ids>, or say --all (the lines --plan lists).');
  if(args.out!==null&&!['ab','try'].includes(args.mode))fail('--out goes with --ab and --try.');
  return args;
}

async function main(argv){
  const args=parseArgs(argv),out=args.out===null?null:path.resolve(ROOT,args.out);
  if(args.mode==='plan'){printPlan();return;}
  if(args.mode==='dry'){dryRun(args.only);return;}
  run('ffmpeg',['-version']);run('ffprobe',['-version']);
  if(args.mode==='verify'){console.log(JSON.stringify({verified:true,...verify()},null,2));return;}
  if(args.mode==='try'){const made=await tryTakes({file:args.file,...(out?{out}:{})});console.log(`${Object.keys(made.variants).length} candidates in ${path.relative(ROOT,out??path.join(ROOT,TRY_OUT))}/try/ (try.json, voices-made.json)`);return;}
  if(args.mode==='ab'){await abMode(args.only,out??path.join(ROOT,AB_OUT));return;}
  await generate({only:args.only,all:args.all});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).catch(error=>{const key=process.env.ELEVENLABS_API_KEY;console.error(key?String(error.message).replaceAll(key,'[redacted]'):error.message);process.exitCode=1;});
}
