import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createPronunciationResolver,sourceTextHash,synthesisInputHash} from '../scripts/pronunciation-rules.mjs';

const options={voiceId:'osSKuDKznhXBktjJ9Z9F',modelId:'eleven_v3',settings:{stability:.5,similarity_boost:.75,speed:.95}};
const transcript={mini_trex_invite:'Grameðlan vill spila myllu! Hún er stór, en leikborðið er lítið. Eigum við að prófa?',welcome:'Halló! Velkomin heim til mín!',beetle:'Bjalla með sex fætur.'};
const empty=()=>({version:1,overrides:{}});
const configured=(id='mini_trex_invite',text='Samþykktur prufutexti.')=>({version:1,overrides:{[id]:{sourceHash:sourceTextHash(transcript[id]),text,approved:true,note:'Explicit local review fixture; not a linguistic recommendation.'}}});
const oldDigest=text=>createHash('sha256').update(JSON.stringify({text,voiceId:options.voiceId,modelId:options.modelId,settings:options.settings})).digest('hex');

test('empty overrides preserve every real transcript and exact legacy cache digest',async()=>{
 const canonical=JSON.parse(await readFile(new URL('../dist/assets/audio/narration-is.json',import.meta.url),'utf8'));
 const config=JSON.parse(await readFile(new URL('../scripts/pronunciation-overrides.json',import.meta.url),'utf8'));
 createPronunciationResolver(canonical,config); // The checked-in configuration must itself pass all review guards.
 const resolver=createPronunciationResolver(canonical,empty());
 for(const[id,text]of Object.entries(canonical)){assert.equal(resolver.textFor(id),text);assert.equal(resolver.hashFor(id,options),oldDigest(text),id);}
 assert.equal(synthesisInputHash(transcript.mini_trex_invite,options),'b972cf19ff82acd93754ac0ea82eb1ad54d9c923149f4833e81d3eb25f79b808');
});

test('a reviewed per-clip override changes only that synthesis input and leaves the canonical text untouched',()=>{
 const before=structuredClone(transcript),config=configured(),resolver=createPronunciationResolver(transcript,config);
 assert.equal(resolver.textFor('mini_trex_invite'),config.overrides.mini_trex_invite.text);
 assert.notEqual(resolver.hashFor('mini_trex_invite',options),oldDigest(transcript.mini_trex_invite));
 for(const id of['welcome','beetle']){assert.equal(resolver.textFor(id),transcript[id]);assert.equal(resolver.hashFor(id,options),oldDigest(transcript[id]));}
 assert.deepEqual(transcript,before);assert.equal(config.overrides.mini_trex_invite.approved,true);
 const same=createPronunciationResolver(transcript,configured('mini_trex_invite',transcript.mini_trex_invite));assert.equal(same.hashFor('mini_trex_invite',options),oldDigest(transcript.mini_trex_invite));
});

test('unknown IDs, malformed or stale hashes and every unapproved override fail before a resolver is returned',()=>{
 const unknown=configured();unknown.overrides.misspelled_id=unknown.overrides.mini_trex_invite;assert.throws(()=>createPronunciationResolver(transcript,unknown),/Unknown narration ID/);
 for(const hash of['',123,'abc','f'.repeat(64)]){const config=configured();config.overrides.mini_trex_invite.sourceHash=hash;assert.throws(()=>createPronunciationResolver(transcript,config),/source SHA256|Stale source text/);}
 for(const approved of[false,undefined,'true',1]){const config=configured();config.overrides.mini_trex_invite.approved=approved;assert.throws(()=>createPronunciationResolver(transcript,config),/not approved/);}
 const changed={...transcript,mini_trex_invite:transcript.mini_trex_invite+' '};assert.throws(()=>createPronunciationResolver(changed,configured()),/Stale source text/);
 const resolver=createPronunciationResolver(transcript,empty());for(const id of['missing','toString',null]){assert.throws(()=>resolver.textFor(id),/Unknown narration ID/);assert.throws(()=>resolver.hashFor(id,options),/Unknown narration ID/);}
});

test('global replacement rules, malformed configurations and empty override text cannot silently change narration',()=>{
 for(const config of[null,[],{}, {version:2,overrides:{}},{version:1,overrides:[]},{version:1,overrides:{},replaceAll:{ll:'tl'}}])assert.throws(()=>createPronunciationResolver(transcript,config));
 for(const patch of[{text:' '},{note:''},{replacement:{ll:'tl'}},{sourceHash:undefined}]){const config=configured();Object.assign(config.overrides.mini_trex_invite,patch);assert.throws(()=>createPronunciationResolver(transcript,config));}
 for(const source of[null,[],{}, {bad_id:15},{'bad-id':'Texti.'}])assert.throws(()=>createPronunciationResolver(source,empty()));
});

test('validation snapshots cannot be bypassed by later mutations and source hashes preserve exact spelling/Unicode',()=>{
 const source={...transcript},config=configured(),resolver=createPronunciationResolver(source,config),approved=config.overrides.mini_trex_invite.text;
 source.welcome='Changed';source.mini_trex_invite='Changed';config.overrides.mini_trex_invite.text='Unreviewed';config.overrides.mini_trex_invite.approved=false;config.overrides.extra={text:'New'};
 assert.equal(resolver.textFor('mini_trex_invite'),approved);assert.equal(resolver.textFor('welcome'),transcript.welcome);assert.throws(()=>resolver.textFor('extra'),/Unknown narration ID/);
 assert.notEqual(sourceTextHash('Halló'),sourceTextHash('Hallo\u0301'));assert.notEqual(sourceTextHash('myllu'),sourceTextHash('myllu '));assert.throws(()=>sourceTextHash(' '));
 assert.notEqual(synthesisInputHash(transcript.welcome,options),synthesisInputHash(transcript.welcome,{...options,voiceId:'another-voice'}));
});
