import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createAerialRules,aerialRoute,aerialChallenge,canopyBasketExtent,canopyFallerLane} from '../dist/mini-rides.js';

function advance(rules,seconds,steer){for(let t=0;t<seconds;t+=1/60){if(steer)rules.steer(steer(rules.getState()));rules.update(1/60);}}

function nextFall(state){return state.fallers.filter(item=>!item.resolved).sort((a,b)=>b.progress-a.progress)[0];}
function basketStrategy(state){const item=nextFall(state);return item?.kind==='cone'?-Math.sign(item.endLane)*.8:item?.endLane||0;}
function flightStrategy(state){return state.winds.filter(wind=>!state.found.includes(wind.id)).sort((a,b)=>(a.phase-state.phase+1)%1-(b.phase-state.phase+1)%1)[0]?.lane||0;}

test('ten unique leaves require active basket movement; unattended or fixed-lane play never wins',()=>{
 const progress=[],wins=[],rules=createAerialRules('brachiosaurus',{onProgress:(...p)=>progress.push(p),onWin:()=>wins.push(true)});
 advance(rules,150);const unattended=rules.getState();assert.equal(unattended.count,0);assert.equal(wins.length,0);assert.ok(unattended.misses>0);
 advance(rules,150,()=>.75);assert.ok(rules.getState().count<=5);assert.equal(wins.length,0);
 advance(rules,75,basketStrategy);const final=rules.getState();assert.equal(final.count,10);assert.equal(final.won,true);assert.equal(wins.length,1);assert.equal(new Set(final.found).size,10);
 assert.deepEqual(progress.map(p=>p[0]),[1,2,3,4,5,6,7,8,9,10]);assert.ok(progress.every(p=>p[1]===10));
 advance(rules,120,()=>1);assert.equal(wins.length,1);assert.equal(rules.getState().count,10);
});

test('five alternating winds require narrower physical lane crossings and remain available over loops',()=>{
 const wins=[],rules=createAerialRules('pteranodon',{onWin:()=>wins.push(true)});
 rules.steer(-.78);rules.hint();assert.equal(rules.getState().count,0);
 advance(rules,125,()=>0);assert.equal(rules.getState().count,0);assert.ok(rules.getState().misses>=10);
 advance(rules,60,()=>-.75);assert.deepEqual(rules.getState().found.sort(),[0,2,4]);assert.equal(wins.length,0);
 advance(rules,60,flightStrategy);assert.equal(rules.getState().count,5);assert.equal(wins.length,1);
 advance(rules,150);assert.equal(wins.length,1);
 for(const offset of [.215,.245]){const trial=createAerialRules('pteranodon'),lane=trial.getState().winds[0].lane;advance(trial,6.1,()=>lane+offset);assert.equal(trial.getState().count,offset<.23?1:0);}
});

test('brown pinecones briefly stun the basket without removing leaves and the game remains recoverable',()=>{
 const rules=createAerialRules('brachiosaurus');let before,after;
 for(let i=0;i<1500;i++){before=rules.getState();rules.steer(nextFall(before)?.endLane||0);rules.update(1/60);after=rules.getState();if(after.bonks>0)break;}
 assert.equal(after.bonks,1);assert.equal(after.count,before.count);assert.ok(after.count>0);assert.ok(after.stun>.7);assert.ok(rules.takeEvents().some(event=>event.type==='bonk'));
 const position=after.position;advance(rules,.5,()=>-Math.sign(position));assert.equal(rules.getState().position,position);assert.equal(rules.getState().count,after.count);
 rules.setPaused(true);const paused=rules.getState();advance(rules,20);assert.deepEqual(rules.getState(),paused);rules.setPaused(false);
 advance(rules,90,basketStrategy);assert.equal(rules.getState().count,10);assert.equal(rules.getState().won,true);
});

test('help slows a challenge, never catches a leaf or steers into a current',()=>{
 for(const species of ['brachiosaurus','pteranodon']){
  const ordinary=createAerialRules(species),helped=createAerialRules(species);helped.hint();advance(ordinary,3);advance(helped,3);
  assert.ok(helped.getState().time<ordinary.getState().time*.6);assert.equal(helped.getState().target,0);assert.equal(helped.getState().count,0);
 }
});

test('pause freezes time, position and scoring and disposal makes late input inert',()=>{
 for(const species of ['brachiosaurus','pteranodon']){
  const rules=createAerialRules(species);rules.steer(.8);advance(rules,1);rules.setPaused(true);const paused=rules.getState();
  advance(rules,30,()=>-.8);rules.hint();assert.deepEqual(rules.getState(),paused);
  rules.setPaused(false);advance(rules,.5);assert.ok(rules.getState().time>paused.time);rules.dispose();const before=rules.getState();advance(rules,100,()=>-1);assert.deepEqual(rules.getState(),before);
 }
});

test('varied flight routes close continuously and keep finite bounded steering',()=>{
 for(let round=0;round<7;round++){
 const start=aerialRoute(0,round),end=aerialRoute(1,round);assert.ok(start.position.distanceTo(end.position)<1e-10);assert.ok(start.forward.distanceTo(end.forward)<1e-10);
 for(let i=0;i<=720;i++){const route=aerialRoute(i/720,round);assert.ok([...route.position,...route.forward,...route.right].every(Number.isFinite));assert.ok(Math.abs(route.forward.dot(route.right))<1e-12);assert.ok(route.position.y>12);}}
 const rules=createAerialRules('pteranodon');rules.steer(Infinity);rules.update(NaN);assert.equal(rules.getState().target,0);rules.steer(200);advance(rules,3);assert.ok(rules.getState().position<=1);assert.throws(()=>createAerialRules('constructor'));
});

test('replays vary the paths and lanes while all ten leaves and five winds remain attainable',()=>{
 const starts=new Set(),windPlans=new Set();
 for(let round=0;round<7;round++){
  const rules=createAerialRules('brachiosaurus',{round});starts.add(JSON.stringify(rules.getState().fallers[0]));advance(rules,70,basketStrategy);assert.equal(rules.getState().count,10);assert.equal(rules.getState().won,true);
  const flight=createAerialRules('pteranodon',{round});windPlans.add(JSON.stringify(aerialChallenge(round).winds));advance(flight,55,flightStrategy);assert.equal(flight.getState().count,5);
 }
 assert.equal(starts.size,7);assert.equal(windPlans.size,7);
});

test('staggered fallers stay pooled, visibly follow their catch lane, and collisions match the basket mouth',()=>{
 const rules=createAerialRules('brachiosaurus');let overlap=false,hazard=false;
 for(let frame=0;frame<900;frame++){
  rules.update(1/60);const state=rules.getState();overlap||=state.fallers.length>1;hazard||=state.fallers.some(item=>item.kind==='cone');assert.ok(state.fallers.length<=3);
  for(const item of state.fallers){assert.ok(Math.abs(canopyFallerLane(item))<1);assert.equal(canopyFallerLane({...item,progress:1}),item.endLane);assert.equal(item.serial%3===2,item.kind==='cone');}
 }
 assert.ok(overlap&&hazard);
 for(const aspect of[320/480,390/640,844/270,1024/600])for(const offset of[.58,.62]){
  const trial=createAerialRules('brachiosaurus'),extent=canopyBasketExtent(aspect),leaf=trial.getState().fallers[0];trial.setCatchExtent(extent);
  advance(trial,3.9,()=>leaf.endLane+offset/extent);assert.equal(trial.getState().count,offset<.60?1:0);
 }
});

test('a tap at the projected leaf destination recovers the same basket lane on phone and landscape',()=>{
 for(const[width,height]of [[320,480],[390,640],[844,270],[1024,600]]){
  const aspect=width/height,camera=new THREE.PerspectiveCamera(50,aspect,.1,160);camera.position.set(0,10.65,13);camera.lookAt(0,10.65,0);camera.updateMatrixWorld(true);
  const extent=canopyBasketExtent(aspect),plane=new THREE.Plane(new THREE.Vector3(0,0,1),-.7),ray=new THREE.Raycaster();
  for(const lane of [-1,-.72,0,.62,1]){
    const destination=new THREE.Vector3(lane*extent,7.15,.7),screen=destination.clone().project(camera);assert.ok(Math.abs(screen.x)<.9);assert.ok(Math.abs(screen.y)<.9);
    ray.setFromCamera(new THREE.Vector2(screen.x,screen.y),camera);const hit=ray.ray.intersectPlane(plane,new THREE.Vector3());assert.ok(Math.abs(hit.x/extent-lane)<1e-12);
  }
 }
});

test('positive flight steering is screen-right with the actual +X-forward rider camera convention',()=>{
 for(let i=0;i<32;i++){
  const route=aerialRoute(i/32),model=new THREE.Object3D();model.position.copy(route.position);model.rotation.y=Math.atan2(-route.forward.z,route.forward.x);model.scale.setScalar(1.45);model.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera(108,390/844,.1,160);camera.position.copy(model.localToWorld(new THREE.Vector3(-2,2.25,0)));camera.lookAt(model.localToWorld(new THREE.Vector3(5,2.6,0)));camera.updateMatrixWorld(true);
  const right=route.position.clone().addScaledVector(route.right,3.12).add(new THREE.Vector3(0,1.45*2.25,0)).project(camera),left=route.position.clone().addScaledVector(route.right,-3.12).add(new THREE.Vector3(0,1.45*2.25,0)).project(camera);
  assert.ok(right.x>0&&left.x<0,'The drawn current and steering rule must agree');
 }
});
