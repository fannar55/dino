import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
const loader=new GLTFLoader();
for(const [species,x,y] of [['triceratops',1.67,1.31],['stegosaurus',1.85,.777],['trex',1.65,2.12],['parasaurolophus',1.70,1.83],['brachiosaurus',2.76,4.89],['spinosaurus',1.66,1.335]]){
 const bytes=await readFile(new URL(`../dist/assets/dinosaurs/${species}.glb`,import.meta.url));
 const asset=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const mixer=new THREE.AnimationMixer(asset.scene);mixer.clipAction(asset.animations.find(a=>a.name==='idle')).play();mixer.update(0);asset.scene.updateMatrixWorld(true);
 const skin=[];asset.scene.traverse(o=>{if(o.isSkinnedMesh)skin.push(o)});
 console.log(species);
 for(const side of [-1,1]) for(const dy of [0,-.01,-.02,-.03,-.04,-.06,-.08]){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,y+dy,side*5),new THREE.Vector3(0,0,-side));
  const hit=ray.intersectObjects(skin,false)[0];console.log(side,dy,hit?.point.toArray()??null);
 }
}
