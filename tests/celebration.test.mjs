import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import {preloadDinosaurAssets,createDinosaur} from '../dist/dinosaurs.js';

const nativeFetch=globalThis.fetch,nativeProgress=globalThis.ProgressEvent;
globalThis.ProgressEvent=class {constructor(type,options){this.type=type;Object.assign(this,options)}};
globalThis.fetch=async input=>{
  const url=typeof input==='string'?input:input.url;
  if(!url.startsWith('file:'))return nativeFetch(input);
  const bytes=await readFile(fileURLToPath(url));
  return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
};
const assets=await preloadDinosaurAssets();
globalThis.fetch=nativeFetch;globalThis.ProgressEvent=nativeProgress;
assert.deepEqual(assets.missing,[]);

function position(animal,name){
  let found;animal.group.traverse(o=>{if(o.name.replace(/[._]/g,'')===name.replace(/[._]/g,''))found=o});
  assert.ok(found,`Missing runtime joint ${name}`);return found.getWorldPosition(new THREE.Vector3());
}
function angle(a,b){return a.clone().normalize().angleTo(b.clone().normalize())}
function compareGroundedBones(a,b){
  for(const name of ['Body','BackFoot.R','BackFoot.L','FrontFoot.R','FrontFoot.L'])
    assert.ok(position(a,name).distanceTo(position(b,name))<1e-6,`${name} must not move for a celebration`);
}

test('the seated explorer raises one hand while Mosi nods without moving his supporting bones',()=>{
  const mosi=createDinosaur('triceratops',{rider:true}),neutral=createDinosaur('triceratops',{rider:true});
  let peakHandLift=0,peakNod=0,peakTail=0;const wristRolls=[];
  for(let frame=0;frame<=90;frame++){
    const time=frame/30;
    mosi.update(time,{happy:1});neutral.update(time,{happy:0});
    mosi.group.updateMatrixWorld(true);neutral.group.updateMatrixWorld(true);
    compareGroundedBones(mosi,neutral);
    assert.ok(position(mosi,'Little Icelandic explorer').distanceTo(position(neutral,'Little Icelandic explorer'))<1e-6,'Seat remains fixed to saddle');
    const waving=mosi.group.getObjectByName('Explorer waving shoulder');
    const steady=mosi.group.getObjectByName('Explorer steady shoulder');
    assert.ok(steady.quaternion.angleTo(new THREE.Quaternion())<1e-7,'The other hand stays at the handle');
    peakHandLift=Math.max(peakHandLift,position(mosi,'Explorer waving wrist').y-position(neutral,'Explorer waving wrist').y);
    peakNod=Math.max(peakNod,angle(mosi.bone('Head').quaternion,neutral.bone('Head').quaternion));
    peakTail=Math.max(peakTail,angle(mosi.bone('Tail1').quaternion,neutral.bone('Tail1').quaternion));
    if(time>=.45&&time<=1.65)wristRolls.push(mosi.group.getObjectByName('Explorer waving wrist').rotation.z);
    mosi.group.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite),`${o.name}: finite pose`));
    if(time>=2.2)assert.ok(waving.quaternion.angleTo(new THREE.Quaternion())<1e-7,'Arm settles while success card is still visible');
  }
  assert.ok(peakHandLift>.45,'Wave is visibly raised rather than a tiny hand twitch');
  assert.ok(peakNod>.12&&peakNod<.15,'Clear gentle nod');
  assert.ok(peakTail>.05&&peakTail<.1,'Gentle tail sweep');
  const peaks=wristRolls.filter((v,i,a)=>i>0&&i<a.length-1&&v>.1&&v>a[i-1]&&v>a[i+1]);
  const troughs=wristRolls.filter((v,i,a)=>i>0&&i<a.length-1&&v<-.1&&v<a[i-1]&&v<a[i+1]);
  assert.equal(peaks.length,2,'Two visible outward hand waves');
  assert.equal(troughs.length,2,'Two visible return hand waves');
  mosi.dispose();neutral.dispose();
});

test('a new happy edge can greet again, and clearing happiness restores neutral joints',()=>{
  const animal=createDinosaur('triceratops',{rider:true}),neutral=createDinosaur('triceratops',{rider:true});
  for(let frame=0;frame<150;frame++){
    const time=frame/30,happy=time<2.8||(time>=3.1&&time<4.6)?1:0;
    animal.update(time,{happy});neutral.update(time,{happy:0});
    if(frame===112)assert.ok(animal.getCelebrationState().lift>.9,'Second greeting restarts');
  }
  for(const name of ['Head','Tail1','Tail2'])assert.ok(angle(animal.bone(name).quaternion,neutral.bone(name).quaternion)<1e-7,`${name} returns to authored idle`);
  for(const name of ['Explorer waving shoulder','Explorer waving wrist'])
    assert.ok(animal.group.getObjectByName(name).quaternion.angleTo(new THREE.Quaternion())<1e-7,`${name} returns neutral`);
  animal.dispose();neutral.dispose();
});

test('ground visitors and Pteranodon respond with a small finite head dip',()=>{
  for(const type of ['brachiosaurus','spinosaurus','pteranodon']){
    const animal=createDinosaur(type),neutral=createDinosaur(type);
    for(let frame=0;frame<=17;frame++){
      animal.update(frame/30,{happy:.6});neutral.update(frame/30,{happy:0});
    }
    const dip=angle(animal.bone('Head').quaternion,neutral.bone('Head').quaternion);
    assert.ok(dip>.035&&dip<.05,`${type}: modest head greeting`);
    animal.group.updateMatrixWorld(true);
    animal.group.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite),`${type}/${o.name}`));
    animal.dispose();neutral.dispose();
  }
});
