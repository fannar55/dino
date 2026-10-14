import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createPronunciationResolver,sourceTextHash} from '../scripts/pronunciation-rules.mjs';
import {createNarrationModelResolver} from '../scripts/narration-models.mjs';
import {ENCYCLOPEDIA_NARRATION} from '../dist/encyclopedia-content.js';

const voiceId='osSKuDKznhXBktjJ9Z9F';
const legacy={voiceId,modelId:'eleven_v3',settings:{stability:.5,similarity_boost:.75,speed:.95}};
const transcript={welcome:'Halló, Egill!',mini_trex_invite:'Grameðlan vill spila myllu!',other:'Gaman að sjá þig!'};
const overrides={version:1,overrides:{mini_trex_invite:{sourceHash:sourceTextHash(transcript.mini_trex_invite),text:'Grameðlan vill spila mil-lu!',approved:true,note:'Approved test fixture.'}}};
const config=()=>({version:1,profiles:{egill_v4:{modelId:'eleven_v4',settings:{stability:.5,similarity_boost:.75},seed:42}},clips:{welcome:'egill_v4'}});
const pronunciation=createPronunciationResolver(transcript,overrides);
const resolver=(configuration=config(),source=transcript,pron=pronunciation)=>createNarrationModelResolver(source,configuration,{voiceId,pronunciation:pron});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('scoped v4 options match approved G while all unlisted legacy hashes and pronunciation text stay exact',()=>{
 const models=resolver();
 assert.deepEqual(models.optionsFor('welcome'),{voiceId,modelId:'eleven_v4',settings:{stability:.5,similarity_boost:.75},seed:42});
 assert.equal(models.hashFor('welcome'),digest({text:transcript.welcome,voiceId,modelId:'eleven_v4',settings:{stability:.5,similarity_boost:.75},seed:42}));
 for(const id of ['mini_trex_invite','other']){
  assert.deepEqual(models.optionsFor(id),legacy);
  assert.equal(models.hashFor(id),pronunciation.hashFor(id,legacy));
  assert.equal(models.hashFor(id),digest({text:pronunciation.textFor(id),...legacy}));
 }
 assert.equal(pronunciation.textFor('mini_trex_invite'),'Grameðlan vill spila mil-lu!');
 assert.equal(transcript.mini_trex_invite,'Grameðlan vill spila myllu!');
});

test('seed, effective text and settings invalidate only the selected clip; equivalent JSON property ordering does not',()=>{
 const before=resolver(),changed=config();changed.profiles.egill_v4.seed=43;
 const after=resolver(changed);
 assert.notEqual(before.hashFor('welcome'),after.hashFor('welcome'));
 for(const id of ['other','mini_trex_invite'])assert.equal(before.hashFor(id),after.hashFor(id));
 const reordered=config();reordered.profiles.egill_v4.settings={similarity_boost:.75,stability:.5};assert.equal(resolver(reordered).hashFor('welcome'),before.hashFor('welcome'));
 const settings=config();settings.profiles.egill_v4.settings.stability=.6;assert.notEqual(resolver(settings).hashFor('welcome'),before.hashFor('welcome'));
 const source={...transcript,welcome:'Halló aftur, Egill!'},pron=createPronunciationResolver(source,overrides);assert.notEqual(resolver(config(),source,pron).hashFor('welcome'),before.hashFor('welcome'));
});

test('every malformed or unknown configured profile fails before any clip can resolve',()=>{
 const cases=[null,[],{version:2,profiles:{},clips:{}},{version:1,profiles:{},clips:[]},{...config(),defaultModel:'eleven_v4'}];
 for(const change of [c=>c.clips.missing='egill_v4',c=>c.clips.welcome='missing',c=>c.profiles.egill_v4.modelId='eleven_v999',c=>c.profiles.egill_v4.seed=-1,c=>c.profiles.egill_v4.seed=42.2,c=>delete c.profiles.egill_v4.seed,c=>c.profiles.egill_v4.settings.speed=.95,c=>c.profiles.egill_v4.settings.stability=NaN,c=>c.profiles.egill_v4.settings.similarity_boost=1.1,c=>c.profiles.egill_v4.typo=true,c=>c.profiles.unused={modelId:'bad'},c=>c.profiles.legacy_v3=c.profiles.egill_v4]){const c=config();change(c);cases.push(c);}
 for(const c of cases)assert.throws(()=>resolver(c));
 const models=resolver();for(const id of ['missing','toString',undefined]){assert.throws(()=>models.optionsFor(id),/Unknown narration ID/);assert.throws(()=>models.hashFor(id),/Unknown narration ID/);}
});

test('validated options are immutable snapshots and mixed manifest metadata identifies actual per-clip models',()=>{
 const c=config(),models=resolver(c),before=models.hashFor('welcome');
 c.profiles.egill_v4.seed=99;c.profiles.egill_v4.settings.stability=0;c.clips.other='egill_v4';
 assert.equal(models.hashFor('welcome'),before);assert.equal(models.optionsFor('other').modelId,'eleven_v3');
 assert.throws(()=>models.optionsFor('welcome').settings.stability=0,TypeError);
 const meta=models.manifestMetadata();assert.equal(meta.model,'mixed');assert.deepEqual(meta.modelByClip,{welcome:'eleven_v4',mini_trex_invite:'eleven_v3',other:'eleven_v3'});assert.equal(meta.profileByClip.welcome,'egill_v4');assert.equal(meta.generationProfiles.egill_v4.seed,42);
 meta.modelByClip.welcome='fake';assert.equal(models.manifestMetadata().modelByClip.welcome,'eleven_v4');
 assert.equal(resolver({version:1,profiles:{},clips:{}}).manifestMetadata().model,'eleven_v3');
});

test('checked-in scope keeps 26 approved profiles and 176 legacy clips unchanged while museum clips use the default',async()=>{
 const read=async file=>JSON.parse(await readFile(new URL(file,import.meta.url),'utf8'));
 const source=await read('../dist/assets/audio/narration-is.json'),c=await read('../scripts/narration-models.json'),approved=await read('./fixtures/egill-changed-clips.json'),p=await read('../scripts/pronunciation-overrides.json');
 const museumIds=Object.keys(ENCYCLOPEDIA_NARRATION);
 assert.equal(museumIds.length,98);assert.equal(Object.keys(source).length,202+museumIds.length);assert.equal(approved.length,26);assert.deepEqual(Object.keys(c.clips).sort(),approved.slice().sort());
 for(const id of museumIds){assert.equal(source[id],ENCYCLOPEDIA_NARRATION[id]);assert.ok(!approved.includes(id),'New museum narration must not silently receive an approved Egill model profile');}
 const pron=createPronunciationResolver(source,p),models=resolver(c,source,pron);
 let unchanged=0,newMuseum=0;
 for(const id of Object.keys(source)){
  if(approved.includes(id)){assert.equal(models.optionsFor(id).modelId,'eleven_v4');assert.notEqual(models.hashFor(id),pron.hashFor(id,legacy));}
  else{if(museumIds.includes(id))newMuseum++;else unchanged++;assert.deepEqual(models.optionsFor(id),legacy);assert.equal(models.hashFor(id),pron.hashFor(id,legacy));}
 }
 assert.equal(unchanged,176);
 assert.equal(newMuseum,museumIds.length);
 assert.equal(sourceTextHash(source.mini_trex_invite),'695a1d8dbe9904c4d322caafb5452ec23c7e0bc46935d5269da86aa27a62ef48');
 assert.equal(pron.textFor('mini_trex_invite'),'Grameðlan vill spila mil-lu! Hún er stór, en leikborðið er lítið. Eigum við að prófa?');
});
