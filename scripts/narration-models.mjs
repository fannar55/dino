import {createHash} from 'node:crypto';

const ID=/^[A-Za-z][A-Za-z0-9_]*$/;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const DEFAULT=Object.freeze({modelId:'eleven_v3',settings:Object.freeze({stability:.5,similarity_boost:.75,speed:.95})});
function fields(value,allowed,label){
 if(!record(value))throw new TypeError(`${label} must be an object.`);
 for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`Unknown ${label} field: ${key}.`);
}
function profile(value,label){
 fields(value,['modelId','settings','seed'],label);
 if(!['eleven_v3','eleven_v4'].includes(value.modelId))throw new Error(`Unsupported narration model in ${label}.`);
 const v4=value.modelId==='eleven_v4';
 fields(value.settings,v4?['stability','similarity_boost']:['stability','similarity_boost','speed'],`${label} settings`);
 for(const key of ['stability','similarity_boost'])if(!Number.isFinite(value.settings[key])||value.settings[key]<0||value.settings[key]>1)throw new Error(`Invalid ${label} ${key}.`);
 if(v4){if(!Number.isInteger(value.seed)||value.seed<0||value.seed>4294967295)throw new Error(`Invalid ${label} seed.`);}
 else if(Object.hasOwn(value,'seed')||!Number.isFinite(value.settings.speed)||value.settings.speed<.7||value.settings.speed>1.2)throw new Error(`Invalid ${label} legacy settings or seed.`);
 // Canonical property order keeps equivalent profile JSON order from changing caches.
 return Object.freeze({modelId:value.modelId,settings:Object.freeze({stability:value.settings.stability,similarity_boost:value.settings.similarity_boost,...(v4?{}:{speed:value.settings.speed})}),...(v4?{seed:value.seed}:{})});
}

/** Validate all scoped profiles before any API call. Unlisted clips retain the exact legacy v3 hash. */
export function createNarrationModelResolver(transcript,configuration,{voiceId,pronunciation}={}){
 if(!record(transcript)||!Object.keys(transcript).length||Object.entries(transcript).some(([id,text])=>!ID.test(id)||!nonempty(text)))throw new Error('Invalid narration transcript.');
 if(!nonempty(voiceId)||typeof pronunciation?.textFor!=='function'||typeof pronunciation?.hashFor!=='function')throw new Error('Narration models require a voice and validated pronunciation resolver.');
 fields(configuration,['version','profiles','clips'],'narration model configuration');
 if(configuration.version!==1)throw new Error('Unsupported narration model configuration version.');
 if(!record(configuration.profiles)||!record(configuration.clips))throw new Error('Narration model profiles and clips must be objects.');
 const profiles=Object.create(null),options=Object.create(null),profileByClip=Object.create(null);
 for(const [name,value]of Object.entries(configuration.profiles)){
  if(!ID.test(name)||name==='legacy_v3')throw new Error(`Invalid or reserved narration profile: ${name}.`);
  profiles[name]=profile(value,`profile ${name}`);
 }
 for(const [id,name]of Object.entries(configuration.clips)){
  if(!Object.hasOwn(transcript,id))throw new Error(`Unknown narration ID in model profiles: ${id}.`);
  if(typeof name!=='string'||!Object.hasOwn(profiles,name))throw new Error(`Unknown narration profile for ${id}.`);
 }
 for(const id of Object.keys(transcript)){
  const name=Object.hasOwn(configuration.clips,id)?configuration.clips[id]:'legacy_v3',chosen=name==='legacy_v3'?DEFAULT:profiles[name];
  pronunciation.textFor(id);
  options[id]=Object.freeze({voiceId,...chosen});profileByClip[id]=name;
 }
 function optionsFor(id){if(typeof id!=='string'||!Object.hasOwn(options,id))throw new Error(`Unknown narration ID: ${String(id)}.`);return options[id];}
 function hashFor(id){
  const {voiceId,modelId,settings,seed}=optionsFor(id);
  if(seed===undefined)return pronunciation.hashFor(id,{voiceId,modelId,settings});
  return createHash('sha256').update(JSON.stringify({text:pronunciation.textFor(id),voiceId,modelId,settings,seed})).digest('hex');
 }
 function manifestMetadata(){
  const modelByClip=Object.fromEntries(Object.entries(options).map(([id,value])=>[id,value.modelId]));
  const unique=[...new Set(Object.values(modelByClip))];
  return {model:unique.length===1?unique[0]:'mixed',modelByClip,profileByClip:{...profileByClip},generationProfiles:{legacy_v3:DEFAULT,...profiles}};
 }
 return Object.freeze({optionsFor,hashFor,manifestMetadata});
}
