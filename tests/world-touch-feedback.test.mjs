import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createWorldTouchFeedback} from '../dist/world-touch-feedback.js';
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function fixture(){const scene=new THREE.Scene(),feedback=createWorldTouchFeedback({scene,groundHeight:()=>0,waterY:-.045});return{scene,feedback,advance(seconds){for(let elapsed=0;elapsed<seconds;elapsed+=.02)feedback.update(elapsed,.02);}};}
function matrices(scene){const values=[];scene.traverse(o=>{if(o.isInstancedMesh)values.push(...o.instanceMatrix.array);});return values;}

test('world touch validates inputs, rate limits rapid taps, and bounds reusable particles',()=>{
 const f=fixture();try{
  for(const kind of ['unknown','constructor','__proto__',null])assert.equal(f.feedback.touch({kind,position:v()}),false);
  for(const position of [null,{x:NaN,y:0,z:0},{x:0,y:Infinity,z:0}])assert.equal(f.feedback.touch({kind:'grass',position}),false);
  assert.equal(f.feedback.touch({kind:'path',position:v()}),true);assert.equal(f.feedback.touch({kind:'path',position:v()}),false);
  assert.equal(f.feedback.getDebugInfo().particles,9);
  for(let i=0;i<200;i++){f.advance(.08);assert.equal(f.feedback.touch({kind:['grass','tree','path','water','rock'][i%5],position:v(i%3,0,-i%7)}),true);const debug=f.feedback.getDebugInfo();assert.ok(debug.particles<=82&&debug.impacts<=24);}
  assert.equal(f.scene.children[0].children.length,3,'All touch reactions share three particle draw calls');assert.ok(matrices(f.scene).every(Number.isFinite));
  f.advance(4);assert.deepEqual(f.feedback.getDebugInfo(),{impacts:0,particles:0,capacity:82});
 }finally{f.feedback.dispose();}
});

test('paused time freezes particles and instance bending; clearing restores original transforms exactly',()=>{
 const f=fixture(),plant=new THREE.InstancedMesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial(),2);
 const original=new THREE.Matrix4().compose(v(3,0,-4),new THREE.Quaternion().setFromAxisAngle(v(0,1,0),.4),v(1.1,2.4,.8));plant.setMatrixAt(1,original);f.scene.add(plant);
 try{
  assert.equal(f.feedback.touch({kind:'grass',position:v(3,0,-4),targets:[{object:plant,instanceId:1}]}),true);f.advance(.18);
  const moved=new THREE.Matrix4();plant.getMatrixAt(1,moved);assert.notDeepEqual(moved.elements,original.elements);
  const before=matrices(f.scene),debug=f.feedback.getDebugInfo();for(let i=0;i<30;i++)f.feedback.update(99999+i,0);
  assert.deepEqual(matrices(f.scene),before);assert.deepEqual(f.feedback.getDebugInfo(),debug);
  f.feedback.clear();plant.getMatrixAt(1,moved);for(let i=0;i<16;i++)assert.ok(Math.abs(moved.elements[i]-original.elements[i])<1e-6);assert.equal(f.feedback.getDebugInfo().particles,0);
  assert.equal(f.feedback.touch({kind:'tree',position:v(),targets:[{object:plant,instanceId:-1},{object:plant,instanceId:4}]}),true);assert.equal(f.feedback.getDebugInfo().impacts,0);
 }finally{f.feedback.dispose();plant.geometry.dispose();plant.material.dispose();}
});

test('repeated bending reuses original object pose, settles naturally, and preserves external resources',()=>{
 const f=fixture(),plant=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());plant.position.set(1,2,3);plant.rotation.set(.1,.2,.3);plant.updateMatrix();const original=plant.matrix.clone();f.scene.add(plant);
 let externalDisposed=false;plant.geometry.addEventListener('dispose',()=>externalDisposed=true);const owned=[];f.scene.children[0].traverse(o=>{if(o.isMesh)for(const resource of [o.geometry,o.material]){const record={disposed:false};resource.addEventListener('dispose',()=>record.disposed=true);owned.push(record);}});
 try{
  for(let i=0;i<8;i++){f.feedback.touch({kind:'tree',position:v(),targets:[{object:plant}]});f.advance(.12);}
  f.advance(3);plant.updateMatrix();for(let i=0;i<16;i++)assert.ok(Math.abs(plant.matrix.elements[i]-original.elements[i])<1e-12);assert.equal(f.feedback.getDebugInfo().impacts,0);
  f.feedback.touch({kind:'tree',position:v(),targets:[{object:plant}]});f.advance(.2);f.feedback.dispose();plant.updateMatrix();for(let i=0;i<16;i++)assert.ok(Math.abs(plant.matrix.elements[i]-original.elements[i])<1e-12);
  assert.equal(externalDisposed,false);assert.ok(owned.every(r=>r.disposed));assert.deepEqual(f.scene.children,[plant]);assert.equal(f.feedback.touch({kind:'path',position:v()}),false);
 }finally{f.feedback.dispose();plant.geometry.dispose();plant.material.dispose();}
});

test('particle shader supplies local alpha and water rings stay on the actual surface',()=>{
 const f=fixture();try{
  f.feedback.touch({kind:'water',position:v(5,-10,7)});f.advance(.3);
  const mesh=f.scene.children[0].children.find(o=>o.geometry.type==='RingGeometry'),matrix=new THREE.Matrix4(),position=v();mesh.getMatrixAt(0,matrix);position.setFromMatrixPosition(matrix);assert.ok(Math.abs(position.y-(-.045+.025))<1e-6);
  const shader={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};mesh.material.onBeforeCompile(shader);assert.match(shader.vertexShader,/vTouchOpacity=aTouchOpacity/);assert.match(shader.fragmentShader,/diffuseColor.a\*=vTouchOpacity/);assert.equal(mesh.material.depthWrite,false);
  assert.ok(mesh.geometry.getAttribute('aTouchOpacity').array.some(a=>a>0));
 }finally{f.feedback.dispose();}
});
