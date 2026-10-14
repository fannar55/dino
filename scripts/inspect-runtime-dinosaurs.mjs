// Exercise the shipped preload, skeleton cloning, accessories and motion API.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
globalThis.ProgressEvent=class ProgressEvent{constructor(type,options){this.type=type;Object.assign(this,options)}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const url=typeof input==='string'?input:input.url;
 if(!url.startsWith('file:'))return originalFetch(input);
 const bytes=await readFile(fileURLToPath(url));
 return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
};
const {preloadDinosaurAssets,createDinosaur}=await import('../dist/dinosaurs.js');
const status=await preloadDinosaurAssets();
if(status.missing.length)throw Error(`Missing assets: ${status.missing.join(', ')}`);
for(const type of status.loaded){
 const animal=createDinosaur(type,{rider:type==='triceratops'});
 for(let frame=0;frame<160;frame++){
  animal.update(frame/30,{walking:.9,walkSpeed:1.7,look:Math.sin(frame*.05),gazeHeight:.5,
   flying:1,glide:frame>80?.9:0,bank:.25,happy:.5});
  animal.group.updateMatrixWorld(true);
 }
 const box=new THREE.Box3().setFromObject(animal.group,true),motion=animal.getMotionState();
 if([...box.min,...box.max].some(v=>!Number.isFinite(v)))throw Error(`${type}: invalid runtime bounds`);
 if(!Number.isFinite(motion.walkPhase)||!Number.isFinite(motion.wingPhase))throw Error(`${type}: invalid motion phase`);
 console.log(JSON.stringify({type,source:animal.group.userData.assetSource,bounds:[box.min.toArray(),box.max.toArray()],motion}));
 animal.dispose();animal.dispose();
}
