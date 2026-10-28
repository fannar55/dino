#!/usr/bin/env node
// Generate the junior game's approved Mosi lines; never changes other games.
// ELEVENLABS_API_KEY is read only from the process environment and sent only to
// the ElevenLabs API header. Raw takes use the established content-hash cache.
// Every line goes through the remake's pronunciation standard (remake/assets/audio/pronunciation.json) with the
// same functions as voice-lines.mjs (requestFor -> applyLexicon): the caption stays the script's text, the request
// carries the chosen recipes (a respelling or IPA as the text, a context as previous_text, a seed), and the
// fingerprint hashes what is sent, so a changed recipe makes the line again. voice-lines.mjs --plan lists them.
// Which request made each MP3 is kept in the committed record, remake/assets/audio/voices-made.json ("yatzy-junior/<id>"),
// with voice-lines.mjs's lines; a take another checkout of the repo has in its cache is copied, not asked for again.
// A line may carry its own say, context or seed in remake/assets/audio/yatzy-junior/lines-overrides.json (voice-lines.mjs
// juniorOverrides), which win over the lexicon as in a lines-source.json line; the script stays the caption.
// The script is the solo game's lines and Fjölspil's (voice-lines.mjs JUNIOR_LINES). Fjölspil's are optional: the page plays them
// as captions until they are made, so --verify passes them by (as "unrecorded") until then, and --dry-run lists what is to make.
// The owner makes them himself (his decision of 2026-10-24), with his key in the environment:
//   node remake/tools/yatzy-junior-voices.mjs --only multiWelcome,multiTurn,multiScored,multiZero,multiWait,multiOver
// node remake/tools/yatzy-junior-voices.mjs [--only id,id] [--dry-run|--verify]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {JUNIOR_LINES,cacheKey,MODEL,SETTINGS,juniorOverrides,madeEntry,readMade,recordMade,siblingCaches} from './voice-lines.mjs';
import {readLexicon,requestFor} from './pronunciation.mjs';
import {lineEntry} from './audio-lines.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const FOLDER=path.join(ROOT,'remake/assets/audio/yatzy-junior');
const CACHE=path.join(ROOT,'.tools/elevenlabs-remake');
const MASTER='loudnorm=I=-18:TP=-2:LRA=7,apad=pad_dur=0.25';
export const SPEAKER='mosi';
const readJson=(file,fallback)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;

/** What is sent for a junior line: voice-lines.mjs's requestFor (the lexicon applied; the line's own say, context or seed win), in Mosi's voice. */
export const juniorRequest=(line,lexicon)=>requestFor({speaker:SPEAKER,text:line.text,...Object.fromEntries(['say','context','seed'].filter(field=>line[field]!==undefined).map(field=>[field,line[field]]))},lexicon);
/** The cache key of what is sent: the same as voice-lines.mjs's for the same request (no context, no seed: as it always was). */
export const juniorFingerprint=(line,{voiceId,lexicon})=>{const sent=juniorRequest(line,lexicon);return cacheKey({text:sent.text,voiceId,seed:sent.seed,context:sent.context});};

async function main(argv){
  const voiceId=readJson(path.join(ROOT,'remake/assets/audio/voices.json'),{}).mosi;
  if(voiceId!=='osSKuDKznhXBktjJ9Z9F')throw new Error('The established Mosi voice changed; review before generating junior audio.');
  if(MODEL!=='eleven_v4'||SETTINGS.speed!==.95)throw new Error('Junior audio requires the approved Eleven v4 model at speed .95.');
  const lexicon=readLexicon(ROOT);
  const overrides=juniorOverrides(ROOT,JUNIOR_LINES);
  const all=Object.entries(JUNIOR_LINES).map(([id,line])=>[id,{...line,...(overrides[id]??{})}]);
  for(const[id,line]of all)if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)||typeof line.text!=='string'||!line.text.trim())throw new Error('Invalid voice script entry.');
  const onlyAt=argv.indexOf('--only'),only=onlyAt>=0?(argv[onlyAt+1]||'').split(','):null;
  for(const id of only||[])if(!Object.hasOwn(JUNIOR_LINES,id))throw new Error(`Unknown junior line: ${id}`);
  const selected=only?all.filter(([id])=>only.includes(id)):all;
  const fingerprint=line=>juniorFingerprint(line,{voiceId,lexicon});
  const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
  const writeJson=(file,value)=>{fs.writeFileSync(`${file}.part`,`${JSON.stringify(value,null,2)}\n`);fs.renameSync(`${file}.part`,file);};
  const manifestFile=path.join(FOLDER,'manifest.json');
  const manifest=readJson(manifestFile,{});
  const recorded=id=>readMade(ROOT)[`yatzy-junior/${id}`]?.key;
  // What a run would make: a line with no MP3 or manifest entry yet, or one made from another request than it would send now.
  const toMake=([id,line])=>!manifest[id]?.src||!fs.existsSync(path.join(FOLDER,`${id}.mp3`))||recorded(id)!==fingerprint(line);

  function verify(){
    const issues=[],unrecorded=[];let duration=0,bytes=0;
    for(const[id,line]of all){
      const entry=manifest[id],file=path.join(FOLDER,`${id}.mp3`);
      if(!entry&&!fs.existsSync(file)&&line.optional){unrecorded.push(id);continue;} // Fjölspil's, until the owner makes them
      if(!entry||!fs.existsSync(file)){issues.push(`${id}: missing audio/manifest`);continue;}
      if(entry.src!==`assets/audio/yatzy-junior/${id}.mp3`||!(entry.duration>.3&&entry.duration<40)||!/^[0-9a-f]+$/.test(entry.mouth))issues.push(`${id}: invalid manifest entry`);
      if(!/[1-9a-f]/.test(entry.mouth)||!entry.mouth.endsWith('000'))issues.push(`${id}: silent voice or missing closing silence`);
      if(Math.abs(entry.mouth.length-entry.duration*20)>3)issues.push(`${id}: mouth duration mismatch`);
      if(recorded(id)!==fingerprint(line))issues.push(`${id}: stale script/model/settings/pronunciation fingerprint`);
      const probe=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',file]));
      if(probe.streams[0]?.codec_name!=='mp3'||probe.streams[0]?.channels!==1||probe.streams[0]?.sample_rate!=='44100'||Math.abs(Number(probe.format.duration)-entry.duration)>.002)issues.push(`${id}: audio format/duration mismatch`);
      duration+=entry.duration;bytes+=fs.statSync(file).size;
    }
    if(issues.length)throw new Error(issues.join('\n'));
    const made=all.filter(([id])=>!unrecorded.includes(id));
    return{clips:made.length,spokenLines:made.filter(([id])=>!id.startsWith('points_')).length,pointLines:made.filter(([id])=>id.startsWith('points_')).length,unrecorded,durationSeconds:Math.round(duration*1000)/1000,bytes,model:MODEL,voiceId,language:'is',mouthRate:20};
  }

  run('ffmpeg',['-version']);run('ffprobe',['-version']);
  if(argv.includes('--verify')){console.log(JSON.stringify({verified:true,...verify()},null,2));return;}
  if(argv.includes('--dry-run')){
    const sent=selected.map(([id,line])=>({id,...juniorRequest(line,lexicon),caption:line.text}));
    console.log(JSON.stringify({clips:selected.length,characters:sent.reduce((n,line)=>n+line.text.length,0),cached:selected.filter(([,line])=>fs.existsSync(path.join(CACHE,`${fingerprint(line)}.mp3`))).length,model:MODEL,voiceId,language:'is',settings:SETTINGS,
      withRecipe:sent.filter(line=>line.text!==line.caption||line.context!==undefined).map(line=>({id:line.id,text:line.text,...(line.context===undefined?{}:{context:line.context}),...(line.seed===undefined?{}:{seed:line.seed})})),
      unchosen:sent.filter(line=>line.words.some(word=>!word.recipe)).map(line=>line.id),toMake:selected.filter(toMake).map(([id])=>id)},null,2));
    return;
  }
  const key=process.env.ELEVENLABS_API_KEY;if(!key)throw new Error('ELEVENLABS_API_KEY must be available in the environment.');
  const models=await fetch('https://api.elevenlabs.io/v1/models',{headers:{'xi-api-key':key},signal:AbortSignal.timeout(30000)});
  if(!models.ok)throw new Error(`ElevenLabs model verification returned HTTP ${models.status}.`);
  const model=(await models.json()).find(m=>m.model_id===MODEL);
  if(!model?.can_do_text_to_speech||!model.languages?.some(l=>l.language_id==='is'))throw new Error('The requested model/Icelandic combination is not currently available.');
  fs.mkdirSync(FOLDER,{recursive:true});fs.mkdirSync(CACHE,{recursive:true});
  let next=0,generated=0,cached=0;
  const worker=async()=>{
    while(next<selected.length){
      const[id,line]=selected[next++],sent=juniorRequest(line,lexicon),hash=fingerprint(line),raw=path.join(CACHE,`${hash}.mp3`),target=path.join(FOLDER,`${id}.mp3`);
      const elsewhere=fs.existsSync(raw)?null:siblingCaches(ROOT).map(dir=>path.join(dir,`${hash}.mp3`)).find(file=>fs.existsSync(file));
      if(elsewhere){fs.copyFileSync(elsewhere,`${raw}.part`);fs.renameSync(`${raw}.part`,raw);cached++;}
      else if(!fs.existsSync(raw)){
        let response;
        for(let attempt=0;attempt<3;attempt++){
          response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({text:sent.text,model_id:MODEL,language_code:'is',voice_settings:SETTINGS,...(sent.seed===undefined?{}:{seed:sent.seed}),...(sent.context===undefined?{}:{previous_text:sent.context})}),signal:AbortSignal.timeout(120000)});
          if(response.status!==429)break;
          await response.arrayBuffer();await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));
        }
        if(!response.ok)throw new Error(`ElevenLabs ${id}: HTTP ${response.status}; no response body or credentials logged.`);
        if(!response.headers.get('content-type')?.startsWith('audio/'))throw new Error(`ElevenLabs ${id}: response was not audio.`);
        const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<1000)throw new Error(`ElevenLabs ${id}: audio was empty.`);
        fs.writeFileSync(`${raw}.part`,bytes);fs.renameSync(`${raw}.part`,raw);generated++;
      }else cached++;
      if(recorded(id)!==hash||!fs.existsSync(target)){
        const part=path.join(FOLDER,`${id}.part.mp3`);
        run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-map_metadata','-1','-af',MASTER,'-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','96k',part]);
        fs.renameSync(part,target);
      }
      manifest[id]=lineEntry(target,`assets/audio/yatzy-junior/${id}.mp3`);
      if(!(manifest[id].duration>.3&&manifest[id].duration<40))throw new Error(`${id}: unexpected clip duration.`);
      writeJson(manifestFile,manifest);recordMade(ROOT,{[`yatzy-junior/${id}`]:madeEntry(hash,target,manifest[id].duration)});
      console.log(`${id}: ${manifest[id].duration}s`);
    }
  };
  // Two requests at a time; retries only follow explicit rate-limit rejection.
  const results=await Promise.allSettled([worker(),worker()]);
  const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  console.log(JSON.stringify({generated,cached,...verify()},null,2));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).catch(error=>{const key=process.env.ELEVENLABS_API_KEY;console.error(key?String(error.message).replaceAll(key,'[redacted]'):error.message);process.exitCode=1;});
}
