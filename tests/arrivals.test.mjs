import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createArrivalTrack} from '../dist/arrival-staging.js';

test('every entrance starts outside both cameras, approaches continuously and settles at its destination',()=>{
 for(const aspect of [390/844,1024/768])for(const species of ['stegosaurus','brachiosaurus','trex','spinosaurus','parasaurolophus','pteranodon']){
  const tall=species==='brachiosaurus',flying=species==='pteranodon';
  const goal=new THREE.Vector3(25,flying?7:0,-4);
  const bounds=new THREE.Box3(new THREE.Vector3(-3,0,-2),new THREE.Vector3(3,tall?8:3,2));
  const cameras=[new THREE.PerspectiveCamera(47,aspect,.1,150),new THREE.PerspectiveCamera(47,aspect,.1,150)];
  cameras[0].position.set(35,5,21);cameras[0].lookAt(28,2,1);
  cameras[1].position.set(29,6,21);cameras[1].lookAt(24,3,-2);
  for(const camera of cameras)camera.updateMatrixWorld(true);
  const track=createArrivalTrack({species,goal,finalYaw:-.4,bounds,scale:1,cameras});
  assert.equal(track.startsOutsideView,true,`${species}: full-size animal must start out of view`);
  const initial=track.sample(0);
  const matrix=new THREE.Matrix4().compose(initial.position,new THREE.Quaternion().setFromEuler(new THREE.Euler(0,initial.heading,0)),new THREE.Vector3(1,1,1));
  const placed=bounds.clone().applyMatrix4(matrix);
  for(const camera of cameras){const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));assert.equal(frustum.intersectsBox(placed),false,`${species}: actual starting rotation is also out of view`);}
  let prior=initial;
  for(let age=.016;age<track.duration;age+=.016){
   const sample=track.sample(age);
   assert.ok([...sample.position.toArray(),sample.heading,sample.walking,sample.bank].every(Number.isFinite));
   assert.ok(sample.position.distanceTo(prior.position)<1,`${species}: no discontinuous position jumps`);
   assert.ok(sample.progress>=prior.progress);assert.equal(sample.completed,false);
   if(!flying)assert.ok(Math.abs(sample.position.y)<.0001,'Feet follow the flat ground');
   prior=sample;
  }
  const settled=track.sample(track.duration),later=track.sample(track.duration+10);
  assert.equal(settled.completed,true);assert.ok(settled.position.distanceTo(goal)<.0001);assert.equal(settled.walking,0);
  assert.ok(later.position.distanceTo(settled.position)<.0001,'The arrival cannot drift after completion');
 }
});
