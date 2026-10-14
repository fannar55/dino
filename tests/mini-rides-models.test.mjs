import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import {createDinosaur,preloadDinosaurAssets} from '../dist/dinosaurs.js';
import {SAUROPOD_ANATOMY,createSauropodNeckPose} from '../dist/dinosaur-assets.js';
import {statueFraming} from '../dist/statue-viewer.js';
import {CANOPY_MINI_ANIMAL} from '../dist/mini-rides.js';
const nativeFetch=globalThis.fetch,nativeProgress=globalThis.ProgressEvent;
globalThis.ProgressEvent=class{};
globalThis.fetch=async input=>new Response(await readFile(fileURLToPath(typeof input==='string'?input:input.url)));
assert.deepEqual((await preloadDinosaurAssets()).missing,[]);globalThis.fetch=nativeFetch;globalThis.ProgressEvent=nativeProgress;

test('actual animated canopy head and first-person head/wing roots remain visible at phone and landscape aspect ratios',()=>{
 for(const species of ['brachiosaurus','pteranodon']){
  const animal=createDinosaur(species),flying=species==='pteranodon';
  if(flying)animal.group.scale.setScalar(1.45);else{animal.group.position.set(...CANOPY_MINI_ANIMAL.position);animal.group.scale.setScalar(CANOPY_MINI_ANIMAL.scale);}
  const neckPose=flying?null:createSauropodNeckPose(animal);
  try{for(let frame=0;frame<120;frame++){
   neckPose?.restore();animal.update(frame/30,{flying:1,glide:.76});animal.group.updateMatrixWorld(true);
   neckPose?.aim(animal.group.localToWorld(new THREE.Vector3(...SAUROPOD_ANATOMY.browse)));
   for(const aspect of[320/480,390/640,844/270,1024/600]){
    const camera=new THREE.PerspectiveCamera(flying?108:50,aspect,.1,160);
    if(flying){camera.position.copy(animal.group.localToWorld(new THREE.Vector3(-2,2.25,0)));camera.lookAt(animal.group.localToWorld(new THREE.Vector3(5,2.6,0)));}
    else{camera.position.set(0,10.65,13);camera.lookAt(0,10.65,0);}camera.updateMatrixWorld(true);
    for(const bone of(flying?['Head','WingL','WingR']:['Head'])){
     const point=animal.bone(bone).getWorldPosition(new THREE.Vector3()).project(camera);assert.ok(point.toArray().every(Number.isFinite));assert.ok(Math.abs(point.x)<.8);assert.ok(point.y>-.75&&point.y<.7,`${species} ${bone} must stay above the bottom controls`);assert.ok(point.z>-1&&point.z<1);
    }
   }
  }}finally{neckPose?.dispose();animal.dispose();}
 }
});

test('all seven real statues and their pedestal fit above the controls at default zoom while rotating',()=>{
 for(const species of['triceratops','stegosaurus','brachiosaurus','trex','spinosaurus','parasaurolophus','pteranodon']){
  const animal=createDinosaur(species);animal.update(0,{flying:0});animal.group.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(animal.group,true),size=box.getSize(new THREE.Vector3()),scale=Math.min(3.75/size.y,4.8/Math.max(size.x,size.z));
  const dimensions={x:size.x*scale,y:size.y*scale,z:size.z*scale};
  for(const[width,height]of[[478,365],[290,260],[620,230],[340,370]])for(const elevation of[.15,.38,.65])for(let step=0;step<24;step++){
   const frame=statueFraming(dimensions,{width,height,elevation,yaw:step*Math.PI/12}),camera=new THREE.PerspectiveCamera(38,width/height,.1,160);
   camera.setViewOffset(width,height,0,frame.offsetY,width,height);camera.position.set(0,frame.targetY+Math.sin(elevation)*frame.distance,Math.cos(elevation)*frame.distance);camera.lookAt(0,frame.targetY,0);camera.updateMatrixWorld(true);
   for(const point of frame.points){const p=new THREE.Vector3(point.x,point.y,point.z).project(camera),x=(p.x+1)*width/2,y=(1-p.y)*height/2;assert.ok(x>=12&&x<=width-12,`${species} clipped horizontally`);assert.ok(y>=11&&y<=height-Math.min(72,height*.32)+1,`${species} must clear the bottom controls: y=${y}`);}
  }
  animal.dispose();
 }
});
