// Isolated pronunciation auditions; never writes to dist or production caches.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const round2=process.argv.includes('--round2'),v4=process.argv.includes('--v4');
if(round2&&v4)throw new Error('Choose only one audition round.');
const out=path.join(root,v4?'qa/pronunciation/egill-v4':round2?'qa/pronunciation/egill-round2':'qa/pronunciation/egill'),cache=path.join(root,'.tools/elevenlabs/auditions/egill');
const voiceId='osSKuDKznhXBktjJ9Z9F',modelId=v4?'eleven_v4':'eleven_v3',settings=v4?{stability:.5,similarity_boost:.75}:{stability:.5,similarity_boost:.75,speed:.95};
const text=round2||v4?'Komdu með, Egill, við skulum skoða skóginn saman.':'Halló, Egill! Komdu með, Egill! Ég sé Egil. Ég sýni Agli skóginn. Þetta er safn Egils.';
const canonicalForms={Egill:'Egill',Egil:'Egil',Agli:'Agli',Egils:'Egils'};
// Grammatek iceprondict: egill -> ei j ɪ t l̥; primary stress is on syllable one.
const samples=(v4?[
 {id:'G-v4-canonical',label:'G — v4, rétt stafsetning',forms:canonicalForms},
 {id:'H-v4-ipa',label:'H — v4, staðfest íslensk hljóðritun',forms:{...canonicalForms,Egill:'/ˈeijɪtl̥/'}},
]:round2?[
 {id:'D-egill-context',label:'D — Egill inni í samfelldri setningu',forms:canonicalForms},
 {id:'E-egil-soft',label:'E — mýkri ritháttur aðeins fyrir tal',forms:{...canonicalForms,Egill:'Egil'}},
 {id:'F-egill-stable',label:'F — Egill með stöðugri lestri',forms:canonicalForms,settings:{...settings,stability:1}},
]:[{id:'A-egill',label:'A — rétt stafsetning',forms:canonicalForms},{id:'B-eijitl',label:'B — framburðarritháttur',forms:{Egill:'Eijitl',Egil:'Eijil',Agli:'Agli',Egils:'Eijils'}},{id:'C-ei-jitl',label:'C — framburðarritháttur með bandstriki',forms:{Egill:'Ei-jitl',Egil:'Ei-jil',Agli:'Agli',Egils:'Ei-jils'}}]).map(s=>({...s,text:text.replace(/Egill|Egils|Egil|Agli/g,word=>s.forms[word])}));
console.log(JSON.stringify({text,samples,maxCharacters:samples.reduce((n,s)=>n+s.text.length,0)},null,2));
if(!process.argv.includes('--generate'))process.exit(0);
if(process.argv.slice(2).some(arg=>!['--generate','--round2','--v4'].includes(arg)))throw new Error('Only --generate, --round2 and --v4 are supported.');
const key=process.env.ELEVENLABS_API_KEY;if(!key)throw new Error('Local ELEVENLABS_API_KEY required.');
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8',windowsHide:true});if(r.error||r.status!==0)throw new Error(`${cmd} failed: ${r.error?.message||r.stderr}`);return r.stdout;};
run('ffmpeg',['-version']);run('ffprobe',['-version']);
await fs.mkdir(out,{recursive:true});await fs.mkdir(cache,{recursive:true});
const manifest={createdAt:new Date().toISOString(),canonicalText:text,voice:'default ice',model:modelId,settings,approved:false,generatedCharacters:0,samples:[]};
for(const sample of samples){
 const payload={text:sample.text,model_id:modelId,language_code:'is',voice_settings:sample.settings||settings,...(v4?{seed:42}:{})};
 const hash=createHash('sha256').update(JSON.stringify({voiceId,payload})).digest('hex');
 const raw=path.join(cache,`${sample.id}-${hash}.raw.mp3`),file=`${sample.id}.mp3`,target=path.join(out,file);
 let exists=false;try{await fs.access(raw);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!exists){
  console.log(`Generating ${sample.id}: ${sample.text.length} characters`);
  const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
  if(!r.ok)throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).replaceAll(key,'[redacted]').slice(0,500)}`);
  if(!r.headers.get('content-type')?.startsWith('audio/'))throw new Error('Expected audio.');
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<1000)throw new Error('Empty audio.');await fs.writeFile(raw,bytes);manifest.generatedCharacters+=sample.text.length;
 }
 run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-af','loudnorm=I=-18:TP=-2:LRA=7,apad=pad_dur=0.25','-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','96k',target]);
 run('ffmpeg',['-hide_banner','-v','error','-i',target,'-f','null','-']);
 const duration=Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',target]).trim());
 if(!(duration>2&&duration<25))throw new Error('Unexpected duration.');
 manifest.samples.push({...sample,file,duration,payloadHash:hash});await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(`Ready ${sample.id}: ${duration}s`);
}
console.log(JSON.stringify({output:out,generatedCharacters:manifest.generatedCharacters,samples:manifest.samples.length}));
