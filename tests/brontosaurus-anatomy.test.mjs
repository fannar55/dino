import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import {preloadDinosaurAssets,createDinosaur} from '../dist/dinosaurs.js';
import {SAUROPOD_ANATOMY,createSauropodNeckPose} from '../dist/dinosaur-assets.js';

const previousFetch=globalThis.fetch,previousProgress=globalThis.ProgressEvent;
globalThis.ProgressEvent=class{};
globalThis.fetch=async input=>new Response(await readFile(fileURLToPath(typeof input==='string'?input:input.url)));
assert.deepEqual((await preloadDinosaurAssets()).missing,[]);
globalThis.fetch=previousFetch;globalThis.ProgressEvent=previousProgress;
const point=(animal,name)=>animal.bone(name).getWorldPosition(new THREE.Vector3());
function realSkinBounds(animal){
  const box=new THREE.Box3();animal.group.updateMatrixWorld(true);
  animal.group.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++)box.expandByPoint(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));});
  return box;
}

test('saved sauropod key now has lower forequarters and a genuinely long raised tail',()=>{
  const animal=createDinosaur('brachiosaurus');try{
    animal.update(0);animal.group.updateMatrixWorld(true);const box=realSkinBounds(animal);
    assert.ok(point(animal,'FrontUpLegL').y<point(animal,'BackUpLegL').y*.9,'Forelegs must not retain the tall Brachiosaurus shoulder anatomy');
    assert.ok(point(animal,'Shoulders').y<point(animal,'Hips').y,'The back slopes down toward the shoulders');
    const root=point(animal,'Tail1'),tip=point(animal,'Tail5');
    assert.ok(root.x-tip.x>2.8,'The tail keeps substantial length beyond the body');
    assert.ok(tip.y>.6,'The long tail is carried above the floor');
    assert.ok(box.max.x-box.min.x>8.4&&box.max.y<2.8,'Actual rest silhouette is long and low, not giraffe shaped');
    assert.ok(box.max.z-box.min.z>1.0,'The body remains substantial');
  }finally{animal.dispose();}
});

test('the real long-necked gait stays finite and grounded throughout a full walk',()=>{
  const animal=createDinosaur('brachiosaurus');try{
    for(let frame=0;frame<=48;frame++){
      animal.update(frame*.075,{walking:1});const box=realSkinBounds(animal);
      assert.ok([...box.min,...box.max].every(Number.isFinite));
      assert.ok(box.min.y>-.025&&box.min.y<.06,`At frame ${frame} at least one sole meets the soil without sinking: ${box.min.y}`);
      assert.ok(box.max.y<2.9&&box.max.x-box.min.x<9.3,'No gait explosion or stretched body');
    }
  }finally{animal.dispose();}
});

test('browsing lifts the actual head while keeping all foot anchors planted and restores the rest pose',()=>{
  const animal=createDinosaur('brachiosaurus');animal.update(0);animal.group.updateMatrixWorld(true);
  const pose=createSauropodNeckPose(animal),feet=['FrontFootL','FrontFootR','BackFootL','BackFootR'];
  const before=feet.map(name=>point(animal,name)),head=point(animal,'Head');
  try{
    const target=new THREE.Vector3(...SAUROPOD_ANATOMY.browse);pose.aim(target);
    assert.ok(point(animal,'Head').y>head.y+1.4,'The actual skull base rises substantially while the feet stay planted');
    assert.ok(pose.mouth.getWorldPosition(new THREE.Vector3()).distanceTo(target)<.08,'The grip reaches the intended treetop');
    feet.forEach((name,i)=>assert.ok(point(animal,name).distanceTo(before[i])<1e-7,'Neck posing must not move a supporting foot'));
    const box=realSkinBounds(animal);assert.ok(box.min.y>-.025&&box.max.y<5.5);assert.ok([...box.min,...box.max].every(Number.isFinite));
    pose.restore();animal.group.updateMatrixWorld(true);assert.ok(point(animal,'Head').distanceTo(head)<1e-7);
  }finally{pose.dispose();animal.dispose();}
});

test('provenance identifies Brontosaurus and retains the existing CC0 source and save key',async()=>{
  const meta=JSON.parse(await readFile(new URL('../dist/assets/dinosaurs/brachiosaurus-source.json',import.meta.url),'utf8'));
  assert.equal(meta.displaySpecies,'Brontosaurus');assert.equal(meta.internalKey,'brachiosaurus');assert.equal(meta.source,'Blends/Apatosaurus.blend');assert.equal(meta.sourceLicense,'CC0-1.0');
  assert.equal(meta.bones,29);assert.ok(meta.triangles<=23000);assert.deepEqual(meta.clips,['idle','walk']);
});
