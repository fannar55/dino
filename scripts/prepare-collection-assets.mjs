// Exact Commons photographs reviewed against their individual file pages.
// Re-encodes photographs for the small-screen gallery without cropping or retouching.
// Pass one or more internal species IDs to update only those photographs.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {STATUE_FACTS,STATUE_SOURCES} from '../dist/mini-content.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'dist/assets/collection'),cache=path.join(root,'.tools/collection');
await mkdir(output,{recursive:true});await mkdir(cache,{recursive:true});
const sources={
 stegosaurus:['https://upload.wikimedia.org/wikipedia/commons/7/72/Stegosaurus_ungulatus.jpg','Perry Quan','CC-BY-SA-2.0','Stegosaurus ungulatus mount at the Carnegie Museum. Source version was cropped on Commons by FunkMonk/Cropbot; game adds no further crop. Flickr licence verified 20 August 2013.'],
 brachiosaurus:['https://upload.wikimedia.org/wikipedia/commons/e/e1/Brontosaurus_Yale_Peabody.jpg','Ad Meskens','CC-BY-SA-3.0','Brontosaurus excelsus type specimen YPM 1980 at Yale Peabody Museum, photographed 2 April 2012. Historical mount with reconstructed parts, before the later neck/tail remount. Commons source cropped by FunkMonk/Cropbot in 2014; the game adds no crop. Internal brachiosaurus slot retained for save compatibility.'],
 trex:['https://upload.wikimedia.org/wikipedia/commons/e/eb/Sue_side_full_%28Field_museum%29.png','Dallas Krentzel','CC-BY-2.0','Sue (FMNH PR2081) museum mount at the Field Museum. Photograph licence verified against Flickr by Commons reviewer 3 June 2013.'],
 spinosaurus:['https://upload.wikimedia.org/wikipedia/commons/f/f2/Field_Spinosaurus.jpg','3blindMies','CC-BY-SA-4.0','2023 cast of FSAC-KK-11888 in swimming posture. Includes modern broad tail reconstruction; the precise swimming/foraging behaviour remains debated.'],
 parasaurolophus:['https://upload.wikimedia.org/wikipedia/commons/c/c5/Parasaurolophus_at_FMNH.jpg','Jonathan Chen','CC-BY-SA-4.0','Type specimen of Parasaurolophus cyrtocristatus mounted at the Field Museum, photographed 2018. Its shorter curved crest differs from the game reconstruction of a longer-crested Parasaurolophus.'],
 pteranodon:['https://upload.wikimedia.org/wikipedia/commons/f/f4/Pteranodon_longiceps_skeleton.jpg','Mira Mechtley','CC-BY-SA-2.0','Pteranodon museum mount, photographed 12 January 2010. Flickr attribution/share-alike licence confirmed by Commons reviewer 28 May 2020.'],
};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(command,args)=>{const r=spawnSync(command,args,{encoding:'utf8',windowsHide:true});if(r.error||r.status!==0)throw Error(r.error?.message||r.stderr);return r.stdout;};
async function download(url,destination){
 try{await access(destination);return await readFile(destination);}catch{}
 await delay(2200);
 let response;
 for(let attempt=0;attempt<3;attempt++){
  response=await fetch(url,{headers:{'User-Agent':'MosiEducationalGame/1.0 (local asset preparation)'},signal:AbortSignal.timeout(120000)});
  if(response.status!==429)break;
  const seconds=Number(response.headers.get('retry-after'))||30;
  console.log(`Commons rate limit; waiting ${Math.min(60,Math.max(15,seconds))} seconds`);
  await response.arrayBuffer();await delay(Math.min(60,Math.max(15,seconds))*1000);
 }
 if(!response.ok)throw Error(`Download ${response.status}: ${url}`);
 const bytes=Buffer.from(await response.arrayBuffer());await writeFile(destination,bytes);return bytes;
}
const selected=process.argv.slice(2);
if(selected.some(id=>!Object.hasOwn(sources,id)))throw Error('Unknown collection species ID.');
const previous=selected.length?JSON.parse(await readFile(path.join(output,'collection-assets.json'),'utf8')):null;
const assets=previous?previous.assets.slice():[];
if(previous&&Object.keys(sources).some(id=>!assets.some(asset=>asset.species===id)))throw Error('Selective collection update requires an existing complete manifest.');
for(const[species,[url,creator,license,note]]of Object.entries(sources)){
 if(selected.length&&!selected.includes(species))continue;
 const data=STATUE_FACTS[species],revision={stegosaurus:'-perry',brachiosaurus:'-bronto-yale',trex:'-sue'}[species]||'',original=path.join(cache,`${species}${revision}.jpg`),dest=path.join(output,`${species}.webp`);
 console.log(`Preparing ${species}`);
 const bytes=await download(url,original);
 // Public HTML is retained as provenance evidence, never executed or deployed.
 await download(data.source,path.join(cache,`${species}${revision}-source.html`));
 run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',original,'-vf',"scale='min(1600,iw)':-2",'-frames:v','1','-c:v','libwebp','-quality','87',dest]);
 const dimensions=JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',dest])).streams[0];
 const converted=await readFile(dest);
 const asset={species,files:[`assets/collection/${species}.webp`],creator,title:decodeURIComponent(data.source.split('File:')[1]).replaceAll('_',' '),source:data.source,downloadUrl:url,license,licenseUrl:data.licenseUrl,modifications:'Resized proportionally to at most 1600 px wide and converted to WebP quality 87. No crop, compositing, retouching or generated content.',credit:data.credit,note,bytes:converted.length,width:dimensions.width,height:dimensions.height,sha256:hash(converted),originalSha256:hash(bytes),verifiedAt:new Date().toISOString()};
 const existing=assets.findIndex(item=>item.species===species);if(existing<0)assets.push(asset);else assets[existing]=asset;
}
const manifest={version:1,assets,scienceSources:STATUE_SOURCES,rightsNote:'Each converted image retains its source licence. CC BY-SA conversions are offered under the exact same licence shown. Other game files are separate works, not sublicensed by this image manifest.'};
await writeFile(path.join(output,'collection-assets.json'),JSON.stringify(manifest,null,2)+'\n');
const licenseText=['COLLECTION PHOTOGRAPHS — attribution and reuse','',manifest.rightsNote,''];
for(const a of assets)licenseText.push(`${a.species}: ${a.title}`,`Photographer: ${a.creator}`,`Source: ${a.source}`,`Licence: ${a.license} — ${a.licenseUrl}`,`Changes: ${a.modifications}`,`Image note: ${a.note}`,'');
await writeFile(path.join(output,'LICENSES.txt'),licenseText.join('\n'));
console.log(JSON.stringify({prepared:selected.length||assets.length,assets:assets.length,bytes:assets.reduce((n,a)=>n+a.bytes,0)}));
