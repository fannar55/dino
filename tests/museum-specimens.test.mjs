import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {createMuseumOrbit,specimenFraming,validateSpecimenBytes} from '../dist/statue-viewer.js';

// Keep every source vertex and node transform; omit only image/material loading
// for this real-geometry test, which does not need a browser image decoder.
async function specimen(name){
  const file=await readFile(new URL(`../dist/assets/encyclopedia/${name}.glb`,import.meta.url));
  const bytes=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),view=new DataView(bytes),json=validateSpecimenBytes(bytes);
  json.images=[];json.textures=[];json.samplers=[];json.materials=[];
  for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  const text=JSON.stringify(json),encoded=new TextEncoder().encode(text.padEnd(Math.ceil(text.length/4)*4,' '));
  // All JSON is ASCII in these exported assets, but align actual UTF-8 bytes.
  const size=Math.ceil(encoded.length/4)*4,tail=new Uint8Array(bytes,20+view.getUint32(12,true)),replacement=new ArrayBuffer(20+size+tail.length),out=new DataView(replacement);
  out.setUint32(0,0x46546c67,true);out.setUint32(4,2,true);out.setUint32(8,replacement.byteLength,true);out.setUint32(12,size,true);out.setUint32(16,0x4e4f534a,true);
  new Uint8Array(replacement,20,size).fill(32);new Uint8Array(replacement,20,encoded.length).set(encoded);new Uint8Array(replacement,20+size).set(tail);
  const {scene}=await new GLTFLoader().parseAsync(replacement,'');scene.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(scene,true),dimensions=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const scale=Math.min(3.75/Math.max(.1,dimensions.y),4.8/Math.max(dimensions.x,dimensions.z)),points=[];
  scene.traverse(node=>{if(!node.isMesh)return;const positions=node.geometry.attributes.position;for(let i=0;i<positions.count;i++){const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);p.set((p.x-center.x)*scale,(p.y-box.min.y)*scale,(p.z-center.z)*scale);points.push(p);}});
  const geometries=new Set(),materials=new Set();scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of(Array.isArray(node.material)?node.material:[node.material]).filter(Boolean))materials.add(material);});
  for(const resource of [...geometries,...materials])resource.dispose();
  return{box,points,vertices:Float32Array.from(points.flatMap(p=>p.toArray())),dimensions:dimensions.multiplyScalar(scale)};
}

function cameraFor(dimensions,size,yaw,elevation,vertices){
  const frame=specimenFraming(dimensions,{...size,yaw,elevation,vertices}),camera=new THREE.PerspectiveCamera(38,size.width/size.height,.1,160);
  camera.setViewOffset(size.width,size.height,0,frame.offsetY,size.width,size.height);camera.position.set(frame.targetX,frame.targetY+Math.sin(elevation)*frame.distance,Math.cos(elevation)*frame.distance);camera.lookAt(frame.targetX,frame.targetY,0);camera.updateMatrixWorld(true);
  return{frame,camera};
}

test('both real museum scans fit without a phantom pedestal and remain grounded and readable',async(t)=>{
  for(const name of ['triceratops-skeleton','parasaurolophus-juvenile-skull']){
    const model=await specimen(name);assert.ok(Math.abs(model.box.min.y)<.001,`${name} source is grounded`);
    for(const [width,height]of[[1280,570],[1024,600],[390,620],[320,420],[568,220]]){
      const size={width,height},yaw=-.15,elevation=.18,{camera}=cameraFor(model.dimensions,size,yaw,elevation,model.vertices),rotation=new THREE.Matrix4().makeRotationY(yaw);
      let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
      for(const source of model.points){const p=source.clone().applyMatrix4(rotation).project(camera),x=(p.x+1)*width/2,y=(1-p.y)*height/2;assert.ok(p.z>-1&&p.z<1);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      assert.ok(left>=17&&right<=width-17,`${name} ${width} horizontal bounds`);
      assert.ok(top>=Math.min(48,height*.15)-1&&bottom<=height-Math.min(74,height*.32)+1,`${name} ${width} clears label and controls`);
      const usableHeight=height-Math.min(48,height*.15)-Math.min(74,height*.32);
      const occupied=Math.max((right-left)/(width-36),(bottom-top)/usableHeight);
      assert.ok(occupied>.80,`${name} ${width} should fill its limiting dimension, not fit empty pedestal space (${occupied.toFixed(3)})`);
      t.diagnostic(`${name} ${width}x${height}: actual pixels ${Math.round(right-left)}x${Math.round(bottom-top)}, ${(occupied*100).toFixed(1)}% of limiting usable dimension`);
    }
    for(const [width,height]of[[390,620],[568,220]])for(const elevation of[.15,.38,.65])for(let step=0;step<24;step++){
      const yaw=step*Math.PI/12,{camera}=cameraFor(model.dimensions,{width,height},yaw,elevation,model.vertices),rotation=new THREE.Matrix4().makeRotationY(yaw);
      for(const p of model.points){const q=p.clone().applyMatrix4(rotation).project(camera),x=(q.x+1)*width/2,y=(1-q.y)*height/2;assert.ok(x>=17&&x<=width-17,`${name} rotating x`);assert.ok(y>=Math.min(48,height*.15)-1&&y<=height-Math.min(74,height*.32)+1,`${name} rotating y`);}
    }
  }
});

test('reset preserves a specimen-specific bone-facing pose without changing statue defaults',()=>{
  const scan=createMuseumOrbit({yaw:0,elevation:.15});scan.focus({yaw:2,elevation:.5});scan.zoomBy(-3);scan.reset();assert.deepEqual(scan.state,{yaw:0,elevation:.15,zoom:8});assert.deepEqual(createMuseumOrbit().state,{yaw:-.4,elevation:.38,zoom:8});
});

