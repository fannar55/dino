import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,readdir} from 'node:fs/promises';
import {NARRATION,SPECIES,ENCOUNTERS} from '../dist/story.js';
import {ADVENTURES,DISCOVERY_CARDS,DISCOVERY_FACT_SOURCES} from '../dist/adventure-content.js';
import {createPronunciationResolver} from '../scripts/pronunciation-rules.mjs';
import {createNarrationModelResolver} from '../scripts/narration-models.mjs';
const dist=new URL('../dist/',import.meta.url);
test('every spoken story line has a packaged Icelandic recording',async()=>{
  const manifest=JSON.parse(await readFile(new URL('assets/audio/narration-manifest.json',dist),'utf8'));
  const transcript=JSON.parse(await readFile(new URL('assets/audio/narration-is.json',dist),'utf8'));
  const ids=Object.keys(NARRATION);
  assert.equal(manifest.language,'is-IS');assert.ok(ids.length>=41);
  assert.deepEqual(transcript,NARRATION,'Recorded text must match the actual story source');
  assert.deepEqual(Object.keys(manifest.clips).sort(),ids.slice().sort(),'No missing or obsolete chapter recordings');
  const pronunciation=createPronunciationResolver(transcript,JSON.parse(await readFile(new URL('../scripts/pronunciation-overrides.json',import.meta.url),'utf8')));
  const models=createNarrationModelResolver(transcript,JSON.parse(await readFile(new URL('../scripts/narration-models.json',import.meta.url),'utf8')),{voiceId:'osSKuDKznhXBktjJ9Z9F',pronunciation}).manifestMetadata();
  assert.equal(manifest.provider,'ElevenLabs');assert.equal(manifest.model,models.model);
  assert.deepEqual(manifest.modelByClip,models.modelByClip,'Every installed clip must identify the configured synthesis model');
  assert.deepEqual(manifest.profileByClip,models.profileByClip);assert.deepEqual(manifest.generationProfiles,models.generationProfiles);
  for(const id of ids){assert.equal(manifest.clips[id],`${id}.mp3`);assert.ok(manifest.durations[id]>.7&&manifest.durations[id]<55,`duration ${id}`);assert.ok((await stat(new URL('assets/audio/'+manifest.clips[id],dist))).size>1000);}
  for(const encounter of ENCOUNTERS){
    assert.ok(SPECIES[encounter.species]);
    for(const key of ['travel','arrival','question','hint','correct'])assert.ok(NARRATION[encounter[key]],`${encounter.species} missing ${key}`);
    for(const id of encounter.choices)assert.ok(SPECIES[id]&&NARRATION['name_'+id],`choice needs a spoken name: ${id}`);
  }
  for(const [species,adventure]of Object.entries(ADVENTURES)){
    assert.ok(SPECIES[species]);assert.equal(adventure.targets.length,3);
    for(const field of ['title','instruction','complete','secretHint','secretFound','bonusQuestion','bonusHint','bonusCorrect'])assert.ok(NARRATION[adventure[field]],`${species}: missing spoken ${field}`);
    for(const choice of adventure.bonus.choices)assert.ok(NARRATION[choice.narration],`${species}: choice needs spoken access`);
    assert.ok(adventure.bonus.choices.some(choice=>choice.id===adventure.bonus.answer));
    assert.ok(DISCOVERY_CARDS[adventure.secret.kind],`${species}: hidden friend needs a learning card`);
  }
  for(const [kind,card] of Object.entries(DISCOVERY_CARDS)){
    assert.ok(card.title&&card.subtitle&&card.art,`${kind}: card needs display text and art`);
    assert.ok(NARRATION[card.narration],`${kind}: card needs a packaged spoken story`);
    assert.match(DISCOVERY_FACT_SOURCES[kind],/^https:\/\//,`${kind}: factual story needs an editorial source`);
  }
  for(const id of ['rideBrachioInvite','rideBrachioAscent','rideBrachioTop','rideBrachioReturn','ridePteraInvite','ridePteraTakeoff','ridePteraLanding','explorationDragHelp','dinosaurCalls'])assert.ok(manifest.clips[id],`${id}: ride or world help must remain accessible through recorded Icelandic speech`);
  assert.ok(JSON.stringify(transcript).includes('Tríseratops'));
});
test('all entrypoint scripts, styles and icons are local and present',async()=>{
  const html=await readFile(new URL('index.html',dist),'utf8');
  assert.match(html,/<html lang="is">/);assert.doesNotMatch(html,/<(?:script|link)[^>]+(?:src|href)="https?:/);
  for(const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))assert.ok((await stat(new URL(match[1],dist))).isFile(),match[1]);
  for(const filename of ['world.js','dinosaurs.js','story.js','audio.js','progress.js','vendor/three.module.js','vendor/three.core.js'])assert.ok((await stat(new URL(filename,dist))).size>100);
  const css=await readFile(new URL('style.css',dist),'utf8');assert.doesNotMatch(css,/@import/);
});

test('self-hosted release contains no generation tools or API credentials',async()=>{
  const configuredKey=process.env.ELEVENLABS_API_KEY;
  async function inspect(directory){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const file=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
      assert.ok(!['.tools','scripts','.env'].includes(entry.name),`Development-only file in release: ${entry.name}`);
      if(entry.isDirectory()){await inspect(file);continue;}
      const bytes=await readFile(file);
      if(configuredKey)assert.ok(!bytes.includes(Buffer.from(configuredKey)),'Configured API credential must never be in release files');
      if(/\.(?:js|json|html|txt|css|webmanifest|md)$/.test(entry.name)){
        const text=bytes.toString('utf8');
        assert.doesNotMatch(text,/ELEVENLABS_API_KEY|xi-api-key|api\.elevenlabs\.io|\bsk_[A-Za-z0-9]{24,}\b/,`Server-side credential or generation request in ${entry.name}`);
      }
    }
  }
  await inspect(dist);
});
test('credits preserve required source and license attribution',async()=>{
  const credits=await readFile(new URL('CREDITS.txt',dist),'utf8');
  assert.match(credits,/Kevin MacLeod/);assert.match(credits,/Kenney/i);assert.match(credits,/ElevenLabs/);assert.match(credits,/creativecommons.org/);
});
