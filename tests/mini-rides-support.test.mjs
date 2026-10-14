import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {addCanopySupport} from '../dist/mini-rides.js';
globalThis.ProgressEvent??=class{};

test('the canopy bough is connected to actual imported bark and retains shared tree resources',async()=>{
 const bytes=await readFile(new URL('../dist/assets/environment/tree-common-3.glb',import.meta.url)),jsonSize=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonSize).toString());
 const binOffset=20+jsonSize,bin=bytes.subarray(binOffset+8,binOffset+8+bytes.readUInt32LE(binOffset));json.buffers[0].uri=`data:application/octet-stream;base64,${bin.toString('base64')}`;
 for(const material of json.materials){for(const key of Object.keys(material))if(/Texture$/.test(key))delete material[key];for(const key of Object.keys(material.pbrMetallicRoughness||{}))if(/Texture$/.test(key))delete material.pbrMetallicRoughness[key];delete material.extensions;}
 delete json.images;delete json.textures;delete json.samplers;
 const scene=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;scene.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 const normalization=new THREE.Matrix4().makeScale(1/size.y,1/size.y,1/size.y).multiply(new THREE.Matrix4().makeTranslation(-center.x,-box.min.y,-center.z)),parts=[];
 scene.traverse(object=>{if(object.isMesh)parts.push({geometry:object.geometry.clone().applyMatrix4(normalization.clone().multiply(object.matrixWorld)),material:object.material});});
 const owned=new Set(),surface={scene:new THREE.Scene(),own(resource){owned.add(resource);return resource;}},support=addCanopySupport(surface,{models:new Map([['tree-common-3',{parts}]])});
 assert.equal(support.connected,true);assert.ok(support.socket.y>8,'branch must join the treetop rather than the ground');
 assert.ok(support.branch.geometry.parameters.path.getPoint(0).distanceTo(support.socket)<1e-9);
 assert.equal(support.tree.children.length,parts.length);parts.forEach((part,i)=>{assert.equal(support.tree.children[i].geometry,part.geometry);assert.equal(owned.has(part.geometry),false);});
 // The ray is the head's approximate viewing corridor. The support trunk must
 // not become an opaque screen in front of the visiting Brachiosaurus.
 surface.scene.updateMatrixWorld(true);const camera=new THREE.Vector3(0,10.65,13),head=new THREE.Vector3(-.4,11,-5.5),ray=new THREE.Raycaster(camera,head.clone().sub(camera).normalize(),0,camera.distanceTo(head));
 const barkHits=ray.intersectObject(support.tree,true).filter(hit=>/Bark|Trunk|Wood/.test((Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material).name));assert.equal(barkHits.length,0);
 owned.forEach(resource=>resource.dispose());parts.forEach(part=>part.geometry.dispose());
});
