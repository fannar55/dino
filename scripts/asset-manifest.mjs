import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dinosaurs=JSON.parse(await readFile(new URL('../dist/assets/dinosaurs/source.json',import.meta.url),'utf8'));
const environment=JSON.parse(await readFile(new URL('../dist/assets/environment/manifest.json',import.meta.url),'utf8'));
const adapted=await Promise.all(['brachiosaurus','spinosaurus'].map(async species=>JSON.parse(await readFile(new URL(`../dist/assets/dinosaurs/${species}-source.json`,import.meta.url),'utf8'))));
const pteranodon=JSON.parse(await readFile(new URL('../dist/assets/pteranodon/source.json',import.meta.url),'utf8'));
const mosi=JSON.parse(await readFile(new URL('../dist/assets/dinosaurs/triceratops-source.json',import.meta.url),'utf8'));
const collection=JSON.parse(await readFile(new URL('../dist/assets/collection/collection-assets.json',import.meta.url),'utf8'));
const encyclopedia=JSON.parse(await readFile(new URL('../dist/assets/encyclopedia/media-manifest.json',import.meta.url),'utf8'));
const cc0='https://creativecommons.org/publicdomain/zero/1.0/';
const assets=[
 {category:'dinosaur',animated:true,files:dinosaurs.models.map(m=>'assets/dinosaurs/'+m.file),creator:dinosaurs.author,source:dinosaurs.source,license:dinosaurs.license,licenseUrl:cc0,licenseFile:'assets/dinosaurs/QUATERNIUS-LICENSE.txt',modifications:dinosaurs.changes+' Only idle and walk clips are used in the game.'},
 {category:'dinosaur',animated:true,files:['assets/dinosaurs/'+mosi.file],creator:mosi.author,source:mosi.sourceUrl,license:mosi.license,licenseUrl:mosi.licenseUrl,licenseFile:'assets/dinosaurs/TRIPO-NOTE.txt',rightsNote:mosi.rightsNote,modifications:mosi.modifications,requiredAnimations:['idle','walk']},
 ...adapted.map(model=>({category:'dinosaur',animated:true,files:['assets/dinosaurs/'+model.file],creator:model.author,source:model.sourceUrl,license:model.sourceLicense+' base; project-original modifications',sourceLicense:model.sourceLicense,rightsNote:model.rightsNote,licenseUrl:cc0,licenseFile:'assets/dinosaurs/QUATERNIUS-LICENSE.txt',modifications:model.modifications,requiredAnimations:['idle','walk']})),
 {category:'dinosaur',animated:true,original:true,files:['assets/pteranodon/'+pteranodon.file],creator:'Stjörnufar project — original authored model',source:'assets/pteranodon/PROVENANCE.txt',license:'Project-original',licenseFile:'assets/pteranodon/PROVENANCE.txt',modifications:pteranodon.geometry+' '+pteranodon.appearance,requiredAnimations:['idle','fly','glide','landing']},
 {category:'environment',animated:false,files:[...environment.models.map(m=>m.file),...environment.textures].map(f=>'assets/environment/'+f),creator:environment.creator,source:environment.source,license:environment.license,licenseUrl:cc0,licenseFile:'assets/environment/LICENSE-QUATERNIUS.txt',modifications:'Selected 11 models from the free Standard edition. Converted to local GLB, consolidated shared textures at 512–1024 pixels, adjusted materials and added original instanced wind animation.'},
 {category:'texture',animated:false,files:environment.ground.files.map(f=>'assets/environment/'+f),creator:environment.ground.creator,source:environment.ground.source,license:environment.ground.license,licenseUrl:'https://polyhaven.com/license',modifications:environment.ground.changes+'. Colour adapted and blended with the trail in our terrain shader.'}
];
assets.push(...collection.assets.map(asset=>({category:'museum-photograph',animated:false,...asset})));
// Museum scans are separate static scientific source assets, not game-animal
// reconstructions. Keep their own audited licences in the central model registry.
for (const specimen of encyclopedia.assets.filter(asset=>asset.type==='model')) {
 const file=specimen.src.replace(/^\.\//,'');
 const bytes=await readFile(new URL('../dist/'+file,import.meta.url));
 const sha256=createHash('sha256').update(bytes).digest('hex');
 if(bytes.length!==specimen.bytes||sha256!==specimen.sha256)throw new Error(`Museum specimen checksum/size mismatch: ${file}`);
 assets.push({category:'museum-specimen',animated:false,files:[file],creator:specimen.credit,
  source:specimen.source,license:specimen.license,licenseUrl:specimen.licenseUrl,
  licenseFile:'assets/encyclopedia/ATTRIBUTION.txt',modifications:specimen.modifications,
  species:specimen.species,description:specimen.caption,dimensionsNote:specimen.dimensionsNote,
  triangles:specimen.triangles,bytes:bytes.length,sha256,
  sourceSha256:specimen.processingReport?.sourceSha256,
  sourceArchiveSha256:specimen.processingReport?.sourceArchiveSha256,
  provenanceManifest:'assets/encyclopedia/media-manifest.json'});
}
for (const asset of assets) {
 for (const field of ['creator','source','license','modifications']) {
  if (typeof asset[field] !== 'string' || !asset[field].trim() || asset[field].includes('undefined')) throw new Error(`Missing ${field} for ${asset.files[0]}`);
 }
}
await writeFile(new URL('../dist/assets/visual-assets.json',import.meta.url),JSON.stringify({version:1,assets},null,2)+'\n');
console.log('Visual asset provenance written for '+assets.reduce((n,a)=>n+a.files.length,0)+' local files.');
