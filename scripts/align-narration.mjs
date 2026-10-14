// Offline repair aid. Sends only explicitly selected, already generated narration
// to the same voice provider for word timings. Never changes production audio.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const transcript=JSON.parse(await fs.readFile(path.join(root,'dist/assets/audio/narration-is.json'),'utf8'));
const selected=process.argv.slice(2);
if(!selected.length||selected.some(id=>id!=='approvedG'&&!Object.hasOwn(transcript,id)))throw Error('Specify known narration IDs or approvedG.');
const key=process.env.ELEVENLABS_API_KEY;if(!key)throw Error('Local ELEVENLABS_API_KEY required.');
const dir=path.join(root,'qa/pronunciation/egill-repair');await fs.mkdir(dir,{recursive:true});
for(const id of selected){
 const file=id==='approvedG'?path.join(root,'qa/pronunciation/egill-v4/G-v4-canonical.mp3'):path.join(root,'dist/assets/audio',`${id}.mp3`);
 const text=id==='approvedG'?'Komdu með, Egill, við skulum skoða skóginn saman.':transcript[id];
 const audio=await fs.readFile(file),audioHash=createHash('sha256').update(audio).digest('hex');
 const target=path.join(dir,`${id}-alignment.json`);
 let cached;try{cached=JSON.parse(await fs.readFile(target,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(cached?.audioHash===audioHash&&cached.text===text){console.log(JSON.stringify({id,cached:true,words:cached.alignment.words}));continue;}
 const body=new FormData();body.append('file',new Blob([audio],{type:'audio/mpeg'}),path.basename(file));body.append('text',text);
 const response=await fetch('https://api.elevenlabs.io/v1/forced-alignment',{method:'POST',headers:{'xi-api-key':key},body,signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error(`Alignment ${response.status}: ${(await response.text()).replaceAll(key,'[redacted]').slice(0,400)}`);
 const alignment=await response.json();
 if(!Array.isArray(alignment.words)||!alignment.words.length||alignment.words.some(w=>typeof w.text!=='string'||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<w.start))throw Error('Invalid word alignment.');
 await fs.writeFile(target,JSON.stringify({id,audioHash,text,createdAt:new Date().toISOString(),alignment},null,2)+'\n');
 console.log(JSON.stringify({id,audioHash,words:alignment.words}));
}
