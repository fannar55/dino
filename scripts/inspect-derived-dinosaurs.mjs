import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
const loader=new GLTFLoader();
for(const species of ['brachiosaurus','spinosaurus']){
  const bytes=await readFile(new URL(`../dist/assets/dinosaurs/${species}.glb`,import.meta.url));
  const model=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const mixer=new THREE.AnimationMixer(model.scene);
  const meshes=[];model.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});
  const results=[];
  for(const clip of model.animations){
    mixer.stopAllAction();const action=mixer.clipAction(clip).play();
    for(let i=0;i<16;i++){
      action.time=clip.duration*i/16;mixer.update(0);model.scene.updateMatrixWorld(true);
      for(const mesh of meshes)mesh.skeleton.update();
      const box=new THREE.Box3().setFromObject(model.scene,true);
      if([...box.min,...box.max].some(v=>!Number.isFinite(v)))throw Error(`${species}/${clip.name}: invalid deformation`);
      results.push({clip:clip.name,phase:i/16,min:box.min.toArray(),max:box.max.toArray()});
    }
  }
  mixer.stopAllAction();mixer.clipAction(model.animations.find(c=>c.name==='idle')).play();mixer.update(0);model.scene.updateMatrixWorld(true);
  const head=model.scene.getObjectByName('Head').getWorldPosition(new THREE.Vector3());
  const grid=species==='brachiosaurus'?[[3.80,2.40],[3.90,2.40],[4.00,2.30],[4.15,2.25],[4.31,2.245],[4.20,2.39]]:
    [[1.55,1.38],[1.65,1.35],[1.75,1.34],[2.05,1.30],[2.30,1.28],[2.50,1.28]];
  const face=grid.map(([x,y])=>{const ray=new THREE.Raycaster(new THREE.Vector3(x,y,3),new THREE.Vector3(0,0,-1));
    const hit=ray.intersectObjects(meshes,false)[0];return{x,y,z:hit?.point.z??null}});
  console.log(JSON.stringify({species,head:head.toArray(),face,clips:model.animations.map(c=>({name:c.name,duration:c.duration})),
    lowest:Math.min(...results.map(r=>r.min[1])),highest:Math.max(...results.map(r=>r.max[1])),...(process.argv.includes('--full')?{results}:{})},null,2));
}
