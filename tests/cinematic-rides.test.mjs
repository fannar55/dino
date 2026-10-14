import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import {createDinosaur,preloadDinosaurAssets} from '../dist/dinosaurs.js';
import {createCinematicRides,rideAttentionTarget,ridePanLimits,explorationViewTarget,canopyBoardingOffset,EXPLORER_CARRY_GRIP} from '../dist/cinematic-rides.js';
const fetchBefore=globalThis.fetch,progressBefore=globalThis.ProgressEvent;
globalThis.ProgressEvent=class{constructor(type,options){Object.assign(this,options)}};
globalThis.fetch=async input=>{const url=typeof input==='string'?input:input.url;if(!url.startsWith('file:'))return fetchBefore(input);const bytes=await readFile(fileURLToPath(url));return new Response(bytes,{headers:{'content-length':String(bytes.length)}});};
assert.deepEqual((await preloadDinosaurAssets()).missing,[]);globalThis.fetch=fetchBefore;globalThis.ProgressEvent=progressBefore;

function fixture(species,width=390,height=844){
 const scene=new THREE.Scene(),mosi=createDinosaur('triceratops',{rider:true}),animal=createDinosaur(species),events=[];
 const portrait=width/height<.85;
 mosi.group.position.set(species==='pteranodon'?1.1:portrait?4.1:6.2,0,species==='pteranodon'||portrait?1.4:2);mosi.group.scale.setScalar(species==='pteranodon'?.65:portrait?.5:.85);mosi.group.rotation.y=-2.6;
 animal.group.position.set(species==='pteranodon'?-.2:portrait?-2.9:-2.2,species==='pteranodon'?7.7:0,species==='pteranodon'?-6:portrait?-1.5:-.6);animal.group.scale.setScalar(species==='pteranodon'?1.45:portrait?2.175:2.2475);animal.group.rotation.y=species==='pteranodon'?-Math.PI/3:portrait?-.32:-.08;
 if(species==='brachiosaurus')mosi.group.rotation.y=Math.atan2(-(animal.group.position.z-mosi.group.position.z),animal.group.position.x-mosi.group.position.x);
 scene.add(mosi.group,animal.group);scene.updateMatrixWorld(true);
 const original={position:animal.group.position.clone(),quaternion:animal.group.quaternion.clone()};
 const rider=mosi.group.getObjectByName('Little Icelandic explorer'),parent=rider.parent,local=rider.position.clone();
 const rides=createCinematicRides({scene,mosi,onEvent:event=>events.push(event)});let time=0,lastFrame=null,restingPose=null;
 const viewport={width,height,portrait:width/height<.85};
 function frame(dt=1/60){time+=dt;animal.group.position.copy(original.position);animal.group.quaternion.copy(original.quaternion);mosi.update(time,{walking:0});animal.update(time,{walking:0,flying:species==='pteranodon'?1:0,glide:.84,...rides.animationState()});lastFrame=rides.update(time,dt,{viewport,baselineCamera:new THREE.Vector3(4.6,5.8,21),baselineTarget:new THREE.Vector3(-2,2.6,-1.6),baseFov:47,restingPose});scene.updateMatrixWorld(true);return lastFrame;}
 function advance(seconds,check=()=>{}){for(let t=0;t<seconds-1e-8;t+=1/60){frame(Math.min(1/60,seconds-t));check();}}
 return{scene,mosi,animal,rider,parent,local,events,rides,frame,advance,viewport,setRestingPose(pose){restingPose=pose;original.position.copy(pose.position);original.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),pose.yaw);},get lastFrame(){return lastFrame;},dispose(){rides.dispose();animal.dispose();mosi.dispose();}};
}

test('returning from a side pocket recenters exploration before the child is reseated',async()=>{
 const source=await readFile(new URL('../dist/world.js',import.meta.url),'utf8');
 const start=source.indexOf('  function finishActivityRide('),body=source.indexOf('{',start);let depth=1,end=body+1;
 for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
 assert.ok(start>=0);
 const f=fixture('brachiosaurus');try{
  f.rides.start({species:'brachiosaurus',animal:f.animal});f.advance(25);
  const pan=new THREE.Vector2(.9,-.3),target=pan.clone();
  const wrapper=new Function('rides','explorationPanTarget',`let rideAttentionAge=5;${source.slice(start,end)}return {finishActivityRide,getAttention:()=>rideAttentionAge}`)(f.rides,target);
  const complete=wrapper.finishActivityRide();assert.equal(wrapper.getAttention(),null);assert.equal(target.length(),0);assert.ok(pan.length()>.8,'The current viewpoint eases instead of snapping');
  f.advance(20,()=>pan.lerp(target,1-Math.exp(-6/60)));
  assert.deepEqual(await complete,{completed:true,cancelled:false});assert.equal(f.rides.getState().phase,'complete');assert.ok(pan.length()<1e-6);assert.equal(f.rider.parent,f.parent);
 }finally{f.dispose();}
});

test('real rider pickup, indefinite exploration and return remain continuous and restore the original saddle',async()=>{
 for(const species of ['brachiosaurus','pteranodon']){
  const f=fixture(species);try{
   const ready=f.rides.start({species,animal:f.animal});let last=f.rider.getWorldPosition(new THREE.Vector3()),maximum=0,at='';
   const continuity=()=>{const p=f.rider.getWorldPosition(new THREE.Vector3());assert.ok(p.toArray().every(Number.isFinite));if(p.distanceTo(last)>maximum){maximum=p.distanceTo(last);at=JSON.stringify(f.rides.getState())+JSON.stringify([last.toArray(),p.toArray()]);}last.copy(p);};
   f.advance(25,continuity);assert.deepEqual(await ready,{completed:true,cancelled:false});assert.equal(f.rides.getState().phase,'exploring');
   f.advance(100,continuity);assert.equal(f.rides.getState().phase,'exploring','Exploration must not time out');
   const returning=f.rides.finish();f.advance(20,continuity);assert.deepEqual(await returning,{completed:true,cancelled:false});
   assert.equal(f.rides.getState().phase,'complete');assert.equal(f.rider.parent,f.parent);assert.ok(f.rider.position.distanceTo(f.local)<.025);assert.ok(maximum<.25,`${species} rider moved ${maximum.toFixed(3)}m in one 60Hz frame at ${at}`);
   assert.deepEqual(f.events.filter(e=>!['wing','step'].includes(e.type)).map(e=>e.type),['invite','pickup','ready','return','landed']);
  }finally{f.dispose();}
 }
});

test('pause, cancellation and already-complete replay do not strand or duplicate the child',async()=>{
 const f=fixture('brachiosaurus');try{
  const pending=f.rides.start({species:'brachiosaurus',animal:f.animal});f.advance(11);
  const age=f.rides.getState().age,position=f.rider.getWorldPosition(new THREE.Vector3());for(let i=0;i<30;i++)f.frame(0);
  assert.equal(f.rides.getState().age,age);assert.ok(f.rider.getWorldPosition(new THREE.Vector3()).distanceTo(position)<1e-7);
  f.rides.cancel();assert.deepEqual(await pending,{completed:false,cancelled:true});assert.equal(f.rider.parent,f.parent);
  assert.deepEqual(await f.rides.start({species:'brachiosaurus',animal:f.animal,completed:true}),{completed:true,cancelled:false});assert.equal(f.rides.getState().phase,'idle');
  const replay=f.rides.start({species:'brachiosaurus',animal:f.animal,completed:true,replay:true});f.advance(20);assert.deepEqual(await replay,{completed:true,cancelled:false});
  const finish=f.rides.finish();f.rides.cancel();assert.deepEqual(await finish,{completed:false,cancelled:true});assert.equal(f.rider.parent,f.parent);
 }finally{f.dispose();}
});

test('enlarged Brontosaurus picks up and reseats the same child continuously at both responsive scales',async()=>{
 for(const [width,height,scale] of [[390,844,2.175],[1024,768,2.2475]]){
  const f=fixture('brachiosaurus',width,height);try{
   const childScale=f.rider.getWorldScale(new THREE.Vector3());
   const ready=f.rides.start({species:'brachiosaurus',animal:f.animal});
   let previous=f.rider.getWorldPosition(new THREE.Vector3()),maximumStep=0,maximumHandleGap=0,maximumAt='';
   const inspect=()=>{
    const current=f.rider.getWorldPosition(new THREE.Vector3());if(current.distanceTo(previous)>maximumStep){maximumStep=current.distanceTo(previous);maximumAt=JSON.stringify({state:f.rides.getState(),from:previous.toArray(),to:current.toArray()});}previous=current;
    assert.ok(f.rider.getWorldScale(new THREE.Vector3()).distanceTo(childScale)<1e-7,'Only the dinosaur grows, not the child');
    const phase=f.rides.getState().phase;
    if(['ascending','exploring','returning'].includes(phase)&&f.rider.parent!==f.parent){
     const handle=f.rider.localToWorld(new THREE.Vector3(...EXPLORER_CARRY_GRIP));
     const mouth=f.animal.group.getObjectByName('Gentle backpack grip').getWorldPosition(new THREE.Vector3());
     maximumHandleGap=Math.max(maximumHandleGap,mouth.distanceTo(handle));
    }
   };
   f.advance(25,inspect);assert.deepEqual(await ready,{completed:true,cancelled:false});
   const expected=f.mosi.group.position.clone().add(canopyBoardingOffset(scale));
   assert.ok(f.animal.group.position.distanceTo(expected)<1e-7);
   assert.ok(f.lastFrame.camera.position.y>8.7,`The larger animal carries the child into the taller canopy: ${f.lastFrame.camera.position.y}`);
   const returning=f.rides.finish();f.advance(15,inspect);assert.deepEqual(await returning,{completed:true,cancelled:false});
   assert.ok(maximumHandleGap<1e-6,`The mouth must stay on the backpack handle: ${maximumHandleGap}`);
   assert.ok(maximumStep<.25,`No pickup/return snap at scale${scale}: ${maximumStep} ${maximumAt}`);
   assert.equal(f.rider.parent,f.parent);assert.ok(f.rider.position.distanceTo(f.local)<1e-7);
  }finally{f.dispose();}
 }
});

test('the enlarged carrier never encloses the child’s head or torso in its real deformed skin',()=>{
 const direction=new THREE.Vector3(.842,.203,.50).normalize(),ray=new THREE.Ray(),hit=new THREE.Vector3();
 for(const [width,height]of [[390,844],[1024,768]]){
  const f=fixture('brachiosaurus',width,height);try{
   f.rides.start({species:'brachiosaurus',animal:f.animal});
   const inspect=()=>{
    const surfaces=[];
    f.animal.group.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const points=[];for(let i=0;i<mesh.geometry.attributes.position.count;i++)points.push(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));surfaces.push({points,index:mesh.geometry.index});});
    for(const [label,local]of [['head',[.04,.84,0]],['torso',[-.035,.4,0]]]){
     const point=f.rider.localToWorld(new THREE.Vector3(...local)),distances=[];ray.set(point,direction);
     for(const{points,index}of surfaces)for(let i=0;i<(index?.count||points.length);i+=3){
      const a=points[index?index.getX(i):i],b=points[index?index.getX(i+1):i+1],c=points[index?index.getX(i+2):i+2];
      if(ray.intersectTriangle(a,b,c,false,hit))distances.push(hit.distanceTo(point));
     }
     distances.sort((a,b)=>a-b);const distinct=distances.filter((distance,i)=>i===0||distance-distances[i-1]>1e-5);
     assert.equal(distinct.length%2,0,`${width}×${height}: child's ${label} lies inside carrier skin: ${JSON.stringify({state:f.rides.getState(),point:point.toArray(),mouth:f.animal.group.getObjectByName('Gentle backpack grip').getWorldPosition(new THREE.Vector3()).toArray(),handle:f.rider.localToWorld(new THREE.Vector3(...EXPLORER_CARRY_GRIP)).toArray(),hits:distinct})}`);
    }
   };
   for(const seconds of[11.4,.2,2.4,3,8]){f.advance(seconds);inspect();}
   f.rides.finish();for(const seconds of[3,4.9,4.2]){f.advance(seconds);inspect();}
  }finally{f.dispose();}
 }
});

test('the closed flight route has matching position and tangent at every loop boundary',()=>{
 const f=fixture('pteranodon');try{
  f.rides.start({species:'pteranodon',animal:f.animal});f.advance(24);const {sampleRoute}=f.rides.getContext();
  for(const boundary of [0,1,2,10]){const before=sampleRoute(boundary-1e-6),after=sampleRoute(boundary+1e-6);assert.ok(before.position.distanceTo(after.position)<.001);assert.ok(before.forward.angleTo(after.forward)<.001);}
 }finally{f.dispose();}
});

test('raised canopy camera looks into the forest from above young crowns and deformed skin remains finite',()=>{
 const f=fixture('brachiosaurus');try{
  f.rides.start({species:'brachiosaurus',animal:f.animal});
  for(let sample=0;sample<24;sample++){
   f.advance(1);
   f.animal.group.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i+=31){const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);f.animal.group.worldToLocal(p);assert.ok(p.toArray().every(Number.isFinite),'Bent neck skin must stay finite');assert.ok(p.length()<10,'Bent neck skin must stay anatomically bounded');}});
  }
  const pose=f.lastFrame.camera,direction=pose.target.clone().sub(pose.position).normalize();
  assert.ok(pose.position.y>6.8,`The child is genuinely raised above the young tree crowns: ${pose.position.y.toFixed(3)}m`);
  assert.ok(direction.z<-.8&&direction.y<-.15,'Look into the forest and down at its crowns, not along the ground path');
 }finally{f.dispose();}
});

test('ride hint attention centers reachable leaves and bounds distant or backwards glances',()=>{
 const position=new THREE.Vector3(0,8,0),target=new THREE.Vector3(0,5.6,-9);
 for(const x of [-1.1,0,1.1]){
  const focus=new THREE.Vector3(x,8+(x===0?.55:-.8),-5.4),aim=rideAttentionTarget(position,target,focus);
  assert.ok(aim.clone().sub(position).normalize().angleTo(focus.clone().sub(position).normalize())<.025,'An ordinary treetop leaf can be centered by the hint');
 }
 const backwards=new THREE.Vector3(10,40,20),aim=rideAttentionTarget(position,target,backwards,'flight').sub(position).normalize(),base=target.clone().sub(position).normalize();
 assert.ok(aim.toArray().every(Number.isFinite));assert.ok(aim.angleTo(base)<.8,'The hint must never spin the camera around');
 assert.deepEqual(rideAttentionTarget(position,target,position).toArray(),target.toArray());
});

test('wide canopy search reveals separate branch pockets by turning and hints keep each within touchable bounds',()=>{
 for(const [width,height]of [[320,568],[390,844],[844,390],[1024,768]]){
  const f=fixture('brachiosaurus',width,height);try{
   f.rides.start({species:'brachiosaurus',animal:f.animal});f.advance(24);
   const pose=f.lastFrame.camera,context=f.rides.getContext(),limits=ridePanLimits('canopy');
   assert.deepEqual(context.panLimits,limits);assert.ok(context.eye.distanceTo(pose.position)<1e-8);
   const pockets=[[.2,-.9,6.5],[-8.5,-.35,4.1],[8.2,-1,4]].map(([x,y,z])=>context.anchor.clone().addScaledVector(context.right,x).addScaledVector(context.up,y).addScaledVector(context.forward,z));
   const camera=new THREE.PerspectiveCamera(pose.fov,width/height,.2,170);camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld(true);
   const initiallyVisible=pockets.filter(point=>{const projected=point.clone().project(camera);return Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&Math.abs(projected.z)<1;});
   assert.equal(initiallyVisible.length,1,`${width}×${height}: only the near branch begins visible`);
   for(const point of pockets){
    camera.lookAt(rideAttentionTarget(pose.position,pose.target,point,'canopy'));camera.updateMatrixWorld(true);
    const projected=point.clone().project(camera),x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
    assert.ok(x>42&&x<width-42&&y>122&&y<height-100,`${width}×${height}: hinted branch leaves80px touch clearance at ${x.toFixed(1)},${y.toFixed(1)}`);
   }
   for(const yaw of [-limits.yaw,limits.yaw]){
    const target=explorationViewTarget(pose.position,pose.target,yaw,limits.pitch),direction=target.sub(pose.position).normalize();
    assert.ok(direction.toArray().every(Number.isFinite));
    const basePitch=Math.asin(pose.target.clone().sub(pose.position).normalize().y);
    assert.ok(Math.abs(Math.asin(direction.y)-(basePitch+limits.pitch))<1e-6,'Vertical drag remains consistent at both side pockets');
   }
  }finally{f.dispose();}
 }
});

test('treetop scenery can be placed before ascent at one stable final eye anchor',()=>{
 const f=fixture('brachiosaurus');try{
  f.rides.start({species:'brachiosaurus',animal:f.animal});f.frame();
  const anchor=f.rides.getContext().canopyAnchor.clone();
  assert.ok(anchor.toArray().every(Number.isFinite));assert.ok(anchor.y>6.8);
  f.advance(24,()=>assert.ok(f.rides.getContext().canopyAnchor.distanceTo(anchor)<1e-9,'No scenery drift during pickup or ascent'));
  assert.ok(f.lastFrame.camera.position.distanceTo(anchor)<.35,`Predicted treetop eye agrees with the real rider at ${f.lastFrame.camera.position.distanceTo(anchor).toFixed(3)}m`);
 }finally{f.dispose();}
});

test('first-person flight keeps the real head and both wing roots visible above bottom controls',()=>{
 for(const [width,height]of [[320,568],[390,844],[844,390],[1024,768]]){
  const f=fixture('pteranodon',width,height);try{
   f.rides.start({species:'pteranodon',animal:f.animal});f.advance(24);
   for(let sample=0;sample<8;sample++){
    f.advance(.4);const pose=f.lastFrame.camera,camera=new THREE.PerspectiveCamera(pose.fov,width/height,.2,170);camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld(true);
    const visible={head:0,left:0,right:0};let headTop=1,headBottom=0;
    f.animal.group.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
     for(let i=0;i<indices.count;i+=7){let bone='',weight=0;for(let k=0;k<4;k++)if(weights.getComponent(i,k)>weight){weight=weights.getComponent(i,k);bone=mesh.skeleton.bones[indices.getComponent(i,k)].name;}
      const part=bone==='Head'?'head':/Wing|Hand/.test(bone)&&bone.endsWith('L')?'left':/Wing|Hand/.test(bone)&&bone.endsWith('R')?'right':null;if(!part)continue;
      const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).project(camera),y=(1-p.y)/2;
      if(Math.abs(p.x)<1&&p.z>-1&&p.z<1&&y>0&&y<.82){visible[part]++;if(part==='head'){headTop=Math.min(headTop,y);headBottom=Math.max(headBottom,y);}}
     }
    });
    assert.ok(visible.head>100&&visible.left>12&&visible.right>12,`${width}×${height}: head and two wing roots must remain visible above controls: ${JSON.stringify(visible)}`);
    assert.ok(headTop>.45&&headBottom<.76,'The head leaves the forward search view clear');
   }
  }finally{f.dispose();}
 }
});

test('rotating a tablet mid-return preserves rider scale and lands at the current responsive pose',async()=>{
 for(const species of ['brachiosaurus','pteranodon']){
  const f=fixture(species);try{
   f.rides.start({species,animal:f.animal});f.advance(25);const finish=f.rides.finish();f.advance(3);
   f.viewport.width=1024;f.viewport.height=768;f.viewport.portrait=false;
   const destination={position:new THREE.Vector3(2.4,species==='pteranodon'?8.8:0,-2.8),yaw:-.65};f.setRestingPose(destination);
   let lastScale=f.rider.getWorldScale(new THREE.Vector3()),lastAnimal=f.animal.group.position.clone(),maximumScaleStep=0,sawCompletion=false;
   for(let frame=0;frame<1200&&!sawCompletion;frame++){
    f.mosi.group.scale.lerp(new THREE.Vector3(.85,.85,.85),1-Math.exp(-1/60*2.5));
    const targetScale=species==='pteranodon'?2.3:2.2475;f.animal.group.scale.lerp(new THREE.Vector3(targetScale,targetScale,targetScale),1-Math.exp(-1/60*2.5));f.frame();
    const scale=f.rider.getWorldScale(new THREE.Vector3());maximumScaleStep=Math.max(maximumScaleStep,scale.distanceTo(lastScale));lastScale=scale;
    if(f.rides.getState().phase==='complete'){
     sawCompletion=true;assert.ok(f.animal.group.position.distanceTo(destination.position)<1e-7,'The exact completion frame must use the current viewport destination');
     assert.ok(f.animal.group.position.distanceTo(lastAnimal)<.035,'The final rejoin frame must not jump from an obsolete destination');
     assert.ok(f.animal.group.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),destination.yaw))<1e-7);
     assert.equal(f.rider.parent,f.parent);
    }
    lastAnimal.copy(f.animal.group.position);
   }
   assert.ok(sawCompletion);assert.ok(maximumScaleStep<.04,`No rider size snap during rotation or saddle return: ${maximumScaleStep}`);assert.deepEqual(await finish,{completed:true,cancelled:false});
  }finally{f.dispose();}
 }
});
