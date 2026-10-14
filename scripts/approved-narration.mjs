import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {sourceTextHash} from './pronunciation-rules.mjs';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z][A-Za-z0-9_]*$/;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
function fields(value,allowed,label){
 if(!record(value))throw new TypeError(`${label} must be an object.`);
 for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`Unknown ${label} field: ${key}.`);
}

/**
 * Load and validate all reviewed masters before any paid generation. Private
 * byte snapshots prevent later file edits from changing what gets installed.
 * file is always approved-audio/<clipId>.mp3, relative to scriptsDir.
 */
export async function loadApprovedNarration({transcript,models,configuration,scriptsDir}){
 if(!record(transcript)||!Object.keys(transcript).length||Object.entries(transcript).some(([id,text])=>!ID.test(id)||!nonempty(text)))throw new Error('Invalid approved narration transcript.');
 if(typeof models?.hashFor!=='function'||!nonempty(scriptsDir))throw new Error('Approved narration requires model hashes and a scripts directory.');
 fields(configuration,['version','clips'],'approved narration configuration');
 if(configuration.version!==1||!record(configuration.clips))throw new Error('Invalid approved narration configuration version or clips.');
 const entries=Object.create(null),buffers=Object.create(null);
 // Validate every ID and source binding before reading any audio file.
 for(const [id,value]of Object.entries(configuration.clips)){
  if(!Object.hasOwn(transcript,id))throw new Error(`Unknown approved narration ID: ${id}.`);
  fields(value,['sourceTextHash','inputHash','sha256','duration','file','note','provenance'],`approved narration ${id}`);
  for(const key of ['sourceTextHash','inputHash','sha256'])if(typeof value[key]!=='string'||!SHA.test(value[key]))throw new Error(`Invalid approved narration ${id} ${key}.`);
  if(value.sourceTextHash!==sourceTextHash(transcript[id]))throw new Error(`Stale approved narration source text: ${id}.`);
  if(value.inputHash!==models.hashFor(id))throw new Error(`Stale approved narration generation input: ${id}.`);
  if(value.file!==`approved-audio/${id}.mp3`)throw new Error(`Unsafe approved narration file: ${id}.`);
  if(!Number.isFinite(value.duration)||value.duration<=.7||value.duration>=55)throw new Error(`Invalid approved narration duration: ${id}.`);
  if(!nonempty(value.note)||!nonempty(value.provenance))throw new Error(`Approved narration ${id} needs a review note and provenance.`);
  entries[id]=Object.freeze({...value});
 }
 if(Object.keys(entries).length){
  const scriptsBase=path.resolve(scriptsDir),audioBase=path.join(scriptsBase,'approved-audio');
  // Reject link/junction redirects explicitly. This also works in Windows
  // sandboxes whose realpath operation cannot traverse the drive root.
  for(const directory of [scriptsBase,audioBase]){
   const info=await lstat(directory);
   if(info.isSymbolicLink()||!info.isDirectory())throw new Error('Approved narration file escapes its owned location.');
  }
  for(const [id,entry]of Object.entries(entries)){
   const target=path.resolve(scriptsBase,entry.file),info=await lstat(target);
   if(path.dirname(target)!==audioBase||path.basename(target)!==`${id}.mp3`||info.isSymbolicLink()||!info.isFile())throw new Error(`Approved narration file escapes its owned location: ${id}.`);
   const bytes=await readFile(target);
   if(bytes.length<1000||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error(`Approved narration audio hash mismatch: ${id}.`);
   buffers[id]=bytes;
  }
 }
 const ids=Object.freeze(Object.keys(entries));
 function entryFor(id){if(!Object.hasOwn(entries,id))throw new Error(`Unknown approved narration ID: ${String(id)}.`);return entries[id];}
 return Object.freeze({
  ids,has:id=>Object.hasOwn(entries,id),entryFor,
  bytesFor(id){entryFor(id);return Buffer.from(buffers[id]);},
  manifestMetadata(){return Object.fromEntries(ids.map(id=>{const {file,...metadata}=entries[id];return [id,{...metadata}];}));},
 });
}
