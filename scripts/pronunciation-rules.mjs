import {createHash} from 'node:crypto';

const ID=/^[A-Za-z][A-Za-z0-9_]*$/;
const SHA256=/^[a-f0-9]{64}$/;
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
function requireFields(value,allowed,label){
 if(!isRecord(value))throw new TypeError(`${label} must be an object.`);
 for(const field of Object.keys(value))if(!allowed.includes(field))throw new Error(`Unknown ${label} field: ${field}.`);
}

/** Hash the exact canonical text, without trimming or Unicode normalization. */
export function sourceTextHash(text){
 if(!nonempty(text))throw new TypeError('Source narration text must be a nonempty string.');
 return createHash('sha256').update(text).digest('hex');
}

/** Byte-compatible with the existing narration generator's input digest. */
export function synthesisInputHash(text,options){
 if(!nonempty(text))throw new TypeError('Synthesis text must be a nonempty string.');
 requireFields(options,['voiceId','modelId','settings'],'synthesis options');
 const{voiceId,modelId,settings}=options;
 if(!nonempty(voiceId)||!nonempty(modelId)||!isRecord(settings))throw new TypeError('Synthesis options require voiceId, modelId and settings.');
 return createHash('sha256').update(JSON.stringify({text,voiceId,modelId,settings})).digest('hex');
}

/**
 * Validate every configured override before resolving any clip. The returned
 * resolver snapshots its inputs; later edits cannot bypass this validation.
 * No replacement patterns, global word rules or on-screen mutations are used.
 *
 * Configuration: {version:1, overrides:{clipId:{
 *   sourceHash: sourceTextHash(canonicalText),
 *   text: approvedSynthesisText, approved:true, note: reviewReason
 * }}}.
 */
export function createPronunciationResolver(transcript,configuration){
 if(!isRecord(transcript)||!Object.keys(transcript).length)throw new TypeError('Narration transcript must be a nonempty object.');
 const source=Object.create(null),effective=Object.create(null);
 for(const[id,text]of Object.entries(transcript)){
  if(!ID.test(id)||!nonempty(text))throw new Error(`Invalid narration entry: ${id}.`);
  source[id]=text;effective[id]=text;
 }
 requireFields(configuration,['version','overrides'],'pronunciation configuration');
 if(configuration.version!==1)throw new Error('Unsupported pronunciation configuration version.');
 if(!isRecord(configuration.overrides))throw new TypeError('Pronunciation overrides must be an object.');
 for(const[id,override]of Object.entries(configuration.overrides)){
  if(!Object.hasOwn(source,id))throw new Error(`Unknown narration ID in pronunciation overrides: ${id}.`);
  requireFields(override,['sourceHash','text','approved','note'],`pronunciation override ${id}`);
  if(override.approved!==true)throw new Error(`Pronunciation override ${id} is not approved.`);
  if(typeof override.sourceHash!=='string'||!SHA256.test(override.sourceHash))throw new Error(`Invalid source SHA256 for pronunciation override ${id}.`);
  if(override.sourceHash!==sourceTextHash(source[id]))throw new Error(`Stale source text for pronunciation override ${id}. Review and approve it again.`);
  if(!nonempty(override.text))throw new Error(`Pronunciation override ${id} needs nonempty synthesis text.`);
  if(!nonempty(override.note))throw new Error(`Pronunciation override ${id} needs a review note.`);
  effective[id]=override.text;
 }
 Object.freeze(source);Object.freeze(effective);
 function textFor(id){
  if(typeof id!=='string'||!Object.hasOwn(effective,id))throw new Error(`Unknown narration ID: ${String(id)}.`);
  return effective[id];
 }
 return Object.freeze({textFor,hashFor:(id,options)=>synthesisInputHash(textFor(id),options)});
}
