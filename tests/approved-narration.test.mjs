import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rename,symlink,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {sourceTextHash,createPronunciationResolver} from '../scripts/pronunciation-rules.mjs';
import {createNarrationModelResolver} from '../scripts/narration-models.mjs';
import {loadApprovedNarration} from '../scripts/approved-narration.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const transcript={welcome:'Halló, Egill!',other:'Skoðum skóginn.'};
const voiceId='osSKuDKznhXBktjJ9Z9F';
const pronunciation=createPronunciationResolver(transcript,{version:1,overrides:{}});
const modelConfig={version:1,profiles:{},clips:{}};
const models=createNarrationModelResolver(transcript,modelConfig,{voiceId,pronunciation});
async function fixture(t){
 // Workspace-local fixtures avoid Windows sandbox Temp realpath restrictions.
 const base=fileURLToPath(new URL('../.tools/',import.meta.url));await mkdir(base,{recursive:true});
 const root=await mkdtemp(path.join(base,'approved-narration-test-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const scriptsDir=path.join(root,'scripts');await mkdir(path.join(scriptsDir,'approved-audio'),{recursive:true});
 const bytes=Buffer.alloc(2000,17),file=path.join(scriptsDir,'approved-audio/welcome.mp3');await writeFile(file,bytes);
 const entry={sourceTextHash:sourceTextHash(transcript.welcome),inputHash:models.hashFor('welcome'),sha256:digest(bytes),duration:2.5,file:'approved-audio/welcome.mp3',note:'Exact approved edit.',provenance:'Approved source audition G; assembled locally.'};
 const configuration={version:1,clips:{welcome:entry}};
 return {root,scriptsDir,bytes,file,entry,configuration,load:overrides=>loadApprovedNarration({transcript,models,configuration,scriptsDir,...overrides})};
}

test('approved masters bind canonical text and model input, retaining exact immutable byte snapshots and provenance',async t=>{
 const f=await fixture(t),approved=await f.load();
 assert.deepEqual(approved.ids,['welcome']);assert.equal(approved.has('other'),false);assert.deepEqual(approved.bytesFor('welcome'),f.bytes);
 f.entry.note='Unreviewed later edit';await writeFile(f.file,Buffer.alloc(2000,99));
 const returned=approved.bytesFor('welcome');returned.fill(0);
 assert.deepEqual(approved.bytesFor('welcome'),f.bytes);assert.equal(approved.entryFor('welcome').note,'Exact approved edit.');
 assert.throws(()=>approved.entryFor('welcome').duration=9,TypeError);
 assert.throws(()=>approved.bytesFor('other'),/Unknown approved narration ID/);
 const meta=approved.manifestMetadata();assert.equal(meta.welcome.sha256,digest(f.bytes));assert.equal(meta.welcome.file,undefined);assert.match(meta.welcome.provenance,/audition G/);
});

test('unknown IDs, stale source/model hashes, unsafe paths and malformed approvals fail closed',async t=>{
 const f=await fixture(t);
 for(const patch of [{sourceTextHash:'0'.repeat(64)},{inputHash:'0'.repeat(64)},{sha256:'bad'},{duration:NaN},{duration:60},{duration:0},{note:''},{provenance:' '},{file:'../welcome.mp3'},{file:'approved-audio/../welcome.mp3'},{file:'approved-audio/other.mp3'},{file:'C:/welcome.mp3'},{extra:true}]){
  const configuration=structuredClone(f.configuration);Object.assign(configuration.clips.welcome,patch);await assert.rejects(f.load({configuration}));
 }
 for(const configuration of [null,[],{version:2,clips:{}},{version:1,clips:[]},{version:1,clips:{unknown:f.entry}},{...f.configuration,ignoreHash:true}])await assert.rejects(f.load({configuration}));
 await assert.rejects(f.load({transcript:{...transcript,welcome:'Halló aftur, Egill!'}}),/Stale approved narration source/);
 const changedModels={hashFor:id=>id==='welcome'?'1'.repeat(64):models.hashFor(id)};await assert.rejects(f.load({models:changedModels}),/Stale approved narration generation input/);
});

test('missing, tampered and symlink-escaped masters cannot be loaded',async t=>{
 const f=await fixture(t);await writeFile(f.file,Buffer.alloc(2000,1));await assert.rejects(f.load(),/audio hash mismatch/);
 await rm(f.file);await assert.rejects(f.load(),/ENOENT/);
 await writeFile(f.file,f.bytes);
 const outside=path.join(f.root,'elsewhere');await rename(path.join(f.scriptsDir,'approved-audio'),outside);
 try{await symlink(outside,path.join(f.scriptsDir,'approved-audio'),process.platform==='win32'?'junction':'dir');}
 catch(error){if(error.code==='EPERM'){t.diagnostic('Symlink containment subcase unavailable on this host.');return;}throw error;}
 await assert.rejects(f.load(),/escapes its owned location/);
});

test('empty configuration needs no approved-audio directory and changes no narration inputs',async()=>{
 const approved=await loadApprovedNarration({transcript,models,configuration:{version:1,clips:{}},scriptsDir:path.join(tmpdir(),'nonexistent-approved-audio-fixture')});
 assert.deepEqual(approved.ids,[]);assert.deepEqual(approved.manifestMetadata(),{});assert.equal(approved.has('welcome'),false);
});

// The isolated generator gets fake local codec tools and a fetch that always
// throws. These tests verify orchestration and exact bytes, not audio decoding.
async function generatorFixture(t){
 const f=await fixture(t),audioDir=path.join(f.root,'dist/assets/audio'),workDir=path.join(f.root,'.tools/elevenlabs');
 await mkdir(audioDir,{recursive:true});await mkdir(workDir,{recursive:true});
 const json=(file,value)=>writeFile(file,JSON.stringify(value));
 for(const name of ['generate-narration.mjs','approved-narration.mjs','pronunciation-rules.mjs','narration-models.mjs'])await copyFile(new URL('../scripts/'+name,import.meta.url),path.join(f.scriptsDir,name));
 await json(path.join(f.scriptsDir,'pronunciation-overrides.json'),{version:1,overrides:{}});
 await json(path.join(f.scriptsDir,'narration-models.json'),modelConfig);
 await json(path.join(f.scriptsDir,'approved-narration.json'),f.configuration);
 await json(path.join(audioDir,'narration-is.json'),transcript);
 await json(path.join(audioDir,'narration-manifest.json'),{clips:{}});
 await json(path.join(workDir,'records.json'),{welcome:{inputHash:'stale',duration:9},other:{inputHash:models.hashFor('other'),duration:2.5}});
 await writeFile(path.join(workDir,'welcome.mp3'),Buffer.alloc(2000,44));
 await writeFile(path.join(workDir,'other.mp3'),Buffer.alloc(2000,55));
 await writeFile(path.join(workDir,'other.raw.mp3'),Buffer.alloc(2000,66));
 await writeFile(path.join(audioDir,'welcome.mp3'),Buffer.alloc(2000,77));
 const preload=path.join(f.root,'mock-codecs.mjs');
 await writeFile(preload,`import child from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';\nchild.spawnSync=(command,args)=>({status:0,stdout:command==='ffprobe'&&args.includes('-show_entries')?(process.env.FAKE_DURATION||'2.5'):'',stderr:''});\nsyncBuiltinESMExports();\nglobalThis.fetch=()=>{throw new Error('PAID_API_ATTEMPT_FORBIDDEN');};\n`);
 return {...f,audioDir,workDir,json,run:(selected='other',env={})=>spawnSync(process.execPath,['--import',pathToFileURL(preload).href,path.join(f.scriptsDir,'generate-narration.mjs'),...(Array.isArray(selected)?selected:[selected])],{cwd:f.root,encoding:'utf8',env:{...process.env,ELEVENLABS_API_KEY:'unit-test-fake-key',...env}})};
}

test('generator installs unselected approved master exactly and repairs stale records without API or normalization',async t=>{
 const f=await generatorFixture(t),result=f.run('other');assert.equal(result.status,0,result.stderr);
 assert.deepEqual(await readFile(path.join(f.audioDir,'welcome.mp3')),f.bytes);
 assert.deepEqual(await readFile(path.join(f.workDir,'welcome.mp3')),f.bytes);
 const manifest=JSON.parse(await readFile(path.join(f.audioDir,'narration-manifest.json'),'utf8'));
 assert.equal(manifest.durations.welcome,2.5);assert.equal(manifest.approvedAudio.welcome.sha256,digest(f.bytes));
 const records=JSON.parse(await readFile(path.join(f.workDir,'records.json'),'utf8'));assert.equal(records.welcome.inputHash,models.hashFor('welcome'));assert.equal(records.welcome.approvedAudioSha256,digest(f.bytes));
 // Selecting a locked clip with no raw cache also bypasses synthesis.
 const again=f.run('welcome');assert.equal(again.status,0,again.stderr);assert.match(again.stdout,/approved master/);assert.deepEqual(await readFile(path.join(f.audioDir,'welcome.mp3')),f.bytes);
});

test('generator rejects an unselected bad master or wrong measured duration before any API call or deployed write',async t=>{
 const f=await generatorFixture(t),before=await readFile(path.join(f.audioDir,'welcome.mp3'));
 await f.json(path.join(f.workDir,'records.json'),{}); // An ordinary selected clip would otherwise need synthesis.
 await writeFile(f.file,Buffer.alloc(2000,88));
 const hashFailure=f.run('other');assert.notEqual(hashFailure.status,0);assert.match(hashFailure.stderr,/audio hash mismatch/);assert.doesNotMatch(hashFailure.stderr,/PAID_API_ATTEMPT/);
 assert.deepEqual(await readFile(path.join(f.audioDir,'welcome.mp3')),before);
 await writeFile(f.file,f.bytes);
 const durationFailure=f.run('other',{FAKE_DURATION:'3.7'});assert.notEqual(durationFailure.status,0);assert.match(durationFailure.stderr,/duration mismatch/);assert.doesNotMatch(durationFailure.stderr,/PAID_API_ATTEMPT/);
 assert.deepEqual(await readFile(path.join(f.audioDir,'welcome.mp3')),before);
});

test('offline installs selected approved and cached clips without a key, while a missing cache cannot fetch or deploy',async t=>{
 const f=await generatorFixture(t);
 const ready=f.run(['--offline','welcome','other'],{ELEVENLABS_API_KEY:''});
 assert.equal(ready.status,0,ready.stderr);assert.match(ready.stdout,/Installed all 2/);assert.deepEqual(await readFile(path.join(f.audioDir,'welcome.mp3')),f.bytes);
 const before=await readFile(path.join(f.audioDir,'narration-manifest.json'));
 await f.json(path.join(f.workDir,'records.json'),{});
 const offline=f.run(['--offline','other'],{ELEVENLABS_API_KEY:''});assert.notEqual(offline.status,0);assert.match(offline.stderr,/Offline generation requires/);assert.doesNotMatch(offline.stderr,/PAID_API_ATTEMPT/);
 assert.deepEqual(await readFile(path.join(f.audioDir,'narration-manifest.json')),before);
 const noKey=f.run('other',{ELEVENLABS_API_KEY:''});assert.notEqual(noKey.status,0);assert.match(noKey.stderr,/Set ELEVENLABS_API_KEY/);assert.doesNotMatch(noKey.stderr,/PAID_API_ATTEMPT/);
});
