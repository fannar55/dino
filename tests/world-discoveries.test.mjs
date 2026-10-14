import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createWorldDiscoveries} from '../dist/world-discoveries.js';
import {ADVENTURES} from '../dist/adventure-content.js';
import {applyViewportFraming} from '../dist/camera-framing.js';
import {FIRST_FOREST_LAYOUT} from '../dist/arrival-staging.js';
import {CANOPY_HUNT,GROUND_HUNTS,WIND_HUNT} from '../dist/hunt-layouts.js';
const STATIONS={stegosaurus:12,brachiosaurus:25,trex:37,spinosaurus:57,parasaurolophus:67,pteranodon:79};
const SIZES=[[320,568],[375,667],[390,740],[390,800],[390,844],[568,320],[844,390],[1024,768]];
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function fixture(width=390,height=844){
 const scene=new THREE.Scene(),events=[];
 const world=createWorldDiscoveries({scene,groundHeight:(x,z)=>x>47&&z<-3?-1.8:0,onDiscovery:event=>events.push(event)});
 const viewport={width,height,portrait:width/height<.85},camera=new THREE.PerspectiveCamera(43,width/height,.2,170);
 let time=0,species='stegosaurus',context=null;const panOffset=new THREE.Vector2();
 function select(id,options={}){species=id;context=null;panOffset.set(0,0);return world.setActivity({species:id,...options});}
 function frame(dt=1/60){
  time+=dt;if(!context)applyViewportFraming(camera,viewport,{baseFov:viewport.portrait?47:40,sky:species==='pteranodon'});
  const plan=world.cameraPlan(camera,viewport,STATIONS[species],context);
  if(plan){camera.position.copy(plan.position);const direction=plan.target.clone().sub(plan.position),right=direction.clone().cross(v(0,1,0)).normalize();direction.applyAxisAngle(v(0,1,0),panOffset.x).applyAxisAngle(right,panOffset.y);camera.lookAt(plan.position.clone().add(direction));}
  camera.updateMatrixWorld(true);world.update(time,dt,camera,viewport,context);
 }
 function advance(seconds){for(let remaining=seconds;remaining>1e-8;remaining-=1/60)frame(Math.min(1/60,remaining));}
 function resize(w,h){viewport.width=w;viewport.height=h;viewport.portrait=w/h<.85;camera.aspect=w/h;camera.updateProjectionMatrix();}
 function ride(value){context=value;camera.clearViewOffset();camera.fov=value?.kind==='flight'?96:67;camera.updateProjectionMatrix();}
 function object(id){return scene.children[0].children.find(o=>o.children.some(child=>child.userData.discovery===id));}
 return{scene,events,world,camera,viewport,select,frame,advance,resize,ride,object,pan:(yaw,pitch=0)=>panOffset.set(yaw,pitch)};
}
function safeHits(f,label=''){
 const points=f.world.getScreenPositions().filter(p=>p.visible),{width,height}=f.viewport;
 for(const p of points){const x=p.screen.x*width,y=p.screen.y*height,r=p.radius;assert.ok(r*2>=48&&r*2<=112);assert.ok(Number.isFinite(x)&&Number.isFinite(y));assert.ok(x>=r&&x<=width-r&&y>=r&&y<=height-r,`${label}/${p.id}: complete hit area onscreen`);}
 for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++){const p=points[a],q=points[b],separation=Math.max(Math.abs(p.screen.x-q.screen.x)*width,Math.abs(p.screen.y-q.screen.y)*height);assert.ok(separation>=p.radius+q.radius,`${label}/${p.id}/${q.id}: rectangular hit areas do not overlap`);}
}
async function focus(f,id){const promise=f.world.focusDiscovery(id);f.advance(1);assert.deepEqual(await promise,{completed:true,cancelled:false});return f.world.getScreenPositions().find(p=>p.id===id);}

test('readiness and focus cancel safely; zero simulation time freezes pending work',async()=>{
 const f=fixture();try{
  let ready=false;const first=f.select('stegosaurus');first.then(()=>ready=true);f.advance(.8);await Promise.resolve();assert.equal(ready,false);f.advance(.8);assert.deepEqual(await first,{completed:true,cancelled:false});
  let focused=false;const pending=f.world.focusDiscovery('fossil-1');pending.then(()=>focused=true);for(let i=0;i<60;i++)f.frame(0);await Promise.resolve();assert.equal(focused,false);f.advance(.9);assert.deepEqual(await pending,{completed:true,cancelled:false});
  const cancelled=f.world.focusDiscovery('fossil-2'),next=f.select('brachiosaurus');assert.deepEqual(await cancelled,{completed:false,cancelled:true});f.world.clearActivity();assert.deepEqual(await next,{completed:false,cancelled:true});assert.equal(f.world.isActive(),false);
  const last=f.select('spinosaurus'),lastFocus=f.world.focusDiscovery('fish-1');f.world.dispose();assert.deepEqual(await last,{completed:false,cancelled:true});assert.deepEqual(await lastFocus,{completed:false,cancelled:true});assert.deepEqual(await f.select('trex'),{completed:false,cancelled:true});assert.equal(f.scene.children.length,0);
 }finally{f.world.dispose();}
});

test('saved discovery IDs preserve repeats and restored state without leaking mutable positions',async()=>{
 const f=fixture();try{
  const ready=f.select('stegosaurus');assert.equal(f.world.activateDiscovery('fossil-1'),false);f.advance(1.7);await ready;assert.deepEqual(f.world.getScreenPositions().map(p=>p.id),[...ADVENTURES.stegosaurus.targets.map(t=>t.id),ADVENTURES.stegosaurus.secret.id]);
  for(const id of ['fossil-1','snail']){assert.ok((await focus(f,id)).visible);assert.equal(f.world.activateDiscovery(id),true);assert.equal(f.events.at(-1).repeat,false);assert.equal(f.world.activateDiscovery(id),true);assert.equal(f.events.at(-1).repeat,true);assert.ok(Math.abs(f.events.at(-1).pan)<=1);}
  assert.equal(f.events.at(-1).secret,true);const copy=f.world.getScreenPositions();copy[0].screen.x=999;f.events.at(-1).screen.x=999;assert.ok(f.world.getScreenPositions().every(p=>p.screen.x<999));
  for(const id of ['leaf-1','fossil-4','constructor','__proto__',null])assert.equal(f.world.activateDiscovery(id),false);
  await f.select('stegosaurus',{foundTargets:['fossil-1','unknown'],secretFound:true});assert.deepEqual(f.world.getScreenPositions().map(p=>p.found),[true,false,false,true]);
 }finally{f.world.dispose();}
});

test('every ground discovery is reachable by its hint on phone and tablet, with safe hit areas',async()=>{
 for(const[width,height]of SIZES){const f=fixture(width,height);try{for(const species of Object.keys(ADVENTURES)){
  const ready=f.select(species);f.advance(1.7);await ready;safeHits(f,`${width}x${height}/${species}`);
  for(const p of f.world.getScreenPositions().filter(p=>!['leaf','windring'].includes(p.kind))){const target=await focus(f,p.id);assert.ok(target.visible,`${width}x${height}/${species}/${p.id} reachable after hint: ${JSON.stringify(target.screen)}`);safeHits(f);assert.equal(f.world.activateDiscovery(p.id),true);}
 }}finally{f.world.dispose();}}
});

test('natural world positions and scales stay fixed across orientation changes',async()=>{
 const f=fixture();try{for(const species of ['stegosaurus','trex','spinosaurus','parasaurolophus']){
  const ready=f.select(species);f.advance(1.7);await ready;const originals=f.world.getScreenPositions().map(p=>({id:p.id,position:f.object(p.id).position.clone(),scale:f.object(p.id).scale.clone()}));
  for(const size of SIZES){f.resize(...size);f.frame(0);for(const o of originals){assert.ok(f.object(o.id).position.distanceTo(o.position)<1e-10);assert.ok(f.object(o.id).scale.distanceTo(o.scale)<1e-10);}safeHits(f);}
 }}finally{f.world.dispose();}
});

test('actual fish body vertices remain underwater while swimming and during collection',async()=>{
 const f=fixture(1024,768);try{const ready=f.select('spinosaurus');f.advance(1.7);await ready;
  for(let step=0;step<45;step++){f.advance(.23);if(step===3){await focus(f,'fish-1');f.world.activateDiscovery('fish-1');}
   for(const id of ['fish-1','fish-2','fish-3']){const body=f.object(id).getObjectByName('Fish beneath the lake surface');body.updateWorldMatrix(true,true);body.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i++){const point=v().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);assert.ok(Number.isFinite(point.y)&&point.y<-.045,`${id} above surface at ${point.y}`);}});}
  }
 }finally{f.world.dispose();}
});

test('canopy leaves stay on fixed branches, reuse habitat, and leave beetle collectible after landing',async()=>{
 const f=fixture();try{const ready=f.select('brachiosaurus');f.advance(1.7);await ready;
  const context={kind:'canopy',interactive:false,anchor:v(25,10,-2),forward:v(0,0,-1),right:v(1,0,0),up:v(0,1,0)};
  context.canopyAnchor=context.anchor.clone();f.ride(context);f.camera.position.copy(context.anchor);f.camera.lookAt(context.anchor.clone().add(v(0,-2.4,-9)));f.frame(0);assert.ok(f.world.getScreenPositions().every(p=>!p.visible));
  assert.ok(f.object('leaf-2').visible,'Fixed branch leaves render during ascent, before becoming clickable');
  context.interactive=true;f.frame(0);const positions=['leaf-1','leaf-2','leaf-3'].map(id=>f.object(id).position.clone());assert.deepEqual(f.world.getScreenPositions().filter(p=>p.kind==='leaf'&&p.visible).map(p=>p.id),['leaf-1']);
  for(const id of ['leaf-2','leaf-3','beetle']){f.camera.lookAt(f.object(id).position.clone().add(v(0,.2,0)));f.frame(0);assert.ok(f.world.getScreenPositions().find(p=>p.id===id).visible,`${id} reachable by looking to its separate branch`);}
  context.anchor.add(v(.2,.1,.1));context.forward.copy(v(.03,0,-1).normalize());f.frame(0);positions.forEach((p,i)=>assert.ok(p.distanceTo(f.object(`leaf-${i+1}`).position)<1e-9));
  const branch=f.scene.getObjectByName('Living branches in the canopy');assert.ok(branch);f.ride(null);f.frame(0);assert.ok(f.world.getScreenPositions().filter(p=>!p.secret).every(p=>!p.visible));assert.ok((await focus(f,'beetle')).visible);
  f.world.clearActivity();f.select('brachiosaurus');f.advance(1.7);f.ride({...context,interactive:true});f.frame(0);assert.equal(f.scene.getObjectByName('Living branches in the canopy'),branch);let branches=0;f.scene.traverse(o=>{if(o.name==='Living branches in the canopy')branches++;});assert.equal(branches,1);
 }finally{f.world.dispose();}
});

test('flight winds remain fixed across loop seams and preserve progress; butterfly stays on ground',async()=>{
 const f=fixture();try{const ready=f.select('pteranodon');f.advance(1.7);await ready;
  const sampleRoute=phase=>{const a=phase*Math.PI*2;return{position:v(82+Math.cos(a)*18,17+Math.sin(2*a)*.35,-11+Math.sin(a)*12),forward:v(-Math.sin(a)*18,Math.cos(2*a)*.7,Math.cos(a)*12).normalize(),up:v(0,1,0)};};
  const context={kind:'flight',interactive:true,loopPhase:0,sampleRoute,routeEyeHeight:4};f.ride(context);f.frame(0);const originals=['windring-1','windring-2','windring-3'].map(id=>f.object(id).position.clone());
  for(const[i,phase]of [.18,.48,.78].entries()){const sample=sampleRoute(phase-.045);f.camera.position.copy(sample.position).add(v(0,4,0));f.camera.lookAt(sample.position.clone().addScaledVector(sample.forward,9).add(v(0,4.4,0)));context.loopPhase=phase-.045;f.frame(0);const target=f.world.getScreenPositions().find(p=>p.id===`windring-${i+1}`);assert.ok(target.visible,`${target.id} touchable from recurring route`);safeHits(f);assert.equal(f.world.activateDiscovery(target.id),true);}
  for(const phase of [.999,.001,.50]){context.loopPhase=phase;f.frame(0);originals.forEach((p,i)=>assert.ok(p.distanceTo(f.object(`windring-${i+1}`).position)<1e-9));assert.ok(f.world.getScreenPositions().filter(p=>!p.secret).every(p=>p.found));}
  assert.equal(f.world.getScreenPositions().find(p=>p.secret).visible,false);f.ride(null);f.frame(0);assert.ok((await focus(f,'butterfly')).visible);assert.equal(f.world.activateDiscovery('butterfly'),true);
 }finally{f.world.dispose();}
});

test('picking rejects remote geometry hits and invalid prototype IDs safely',async()=>{
 const f=fixture();try{const ready=f.select('stegosaurus');f.advance(1.7);await ready;const p=await focus(f,'fossil-1');assert.equal(f.world.pick({intersectObjects:()=>[]},{x:p.screen.x*f.viewport.width,y:p.screen.y*f.viewport.height},f.camera,f.viewport),true);assert.equal(f.events.at(-1).id,'fossil-1');const count=f.events.length;
  assert.equal(f.world.pick({intersectObjects:objects=>objects.map(object=>({object}))},{x:-1000,y:-1000},f.camera,f.viewport),false);assert.equal(f.events.length,count);
  for(const species of ['sun','constructor','__proto__','toString',null]){assert.deepEqual(await f.world.setActivity({species}),{completed:false,cancelled:true});assert.equal(f.world.getDebugInfo().species,'stegosaurus');}
  assert.deepEqual(await f.world.focusDiscovery('unknown'),{completed:false,cancelled:true});f.world.clearActivity();assert.equal(f.world.activateDiscovery('fossil-1'),false);
 }finally{f.world.dispose();}
});

test('revisits reuse complete habitats and disposal releases resources from inactive areas',async()=>{
 const f=fixture(),objects=new Map(),resources=new Map();try{
  for(const species of Object.keys(ADVENTURES)){const ready=f.select(species);f.advance(1.7);await ready;const root=f.scene.children[0];assert.equal(root.children.length,5);objects.set(species,[...root.children]);root.traverse(o=>{if(!o.isMesh)return;for(const resource of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])])if(!resources.has(resource)){resources.set(resource,false);resource.addEventListener('dispose',()=>resources.set(resource,true));}});}
  for(const species of Object.keys(ADVENTURES)){const ready=f.select(species,{foundTargets:ADVENTURES[species].targets.map(t=>t.id),secretFound:true});f.advance(1.7);await ready;assert.deepEqual(f.scene.children[0].children,objects.get(species));assert.ok(f.world.getScreenPositions().every(p=>p.found));}
  f.world.dispose();assert.ok(resources.size>40);assert.ok([...resources.values()].every(Boolean));
 }finally{f.world.dispose();}
});

test('imported habitat trees preserve shared resources and live mesh identity for touch feedback',()=>{
 const scene=new THREE.Scene(),geometry=new THREE.CylinderGeometry(.1,.6,1,8),material=new THREE.MeshBasicMaterial(),trees=[];let sharedDisposed=false;
 geometry.addEventListener('dispose',()=>sharedDisposed=true);material.addEventListener('dispose',()=>sharedDisposed=true);
 const world=createWorldDiscoveries({scene,createHabitatTree:({height})=>{const tree=new THREE.Group();tree.scale.setScalar(height);const trunk=new THREE.Mesh(geometry,material);tree.add(trunk);trees.push({tree,trunk});return tree;}});
 const camera=new THREE.PerspectiveCamera(67,390/844,.2,170),viewport={width:390,height:844,portrait:true},context={kind:'canopy',interactive:true,anchor:v(25,8,-2),forward:v(0,0,-1),right:v(1,0,0)};
 try{
  world.setActivity({species:'brachiosaurus'});world.cameraPlan(camera,viewport,25,context);assert.equal(trees.length,4);
  for(const{tree,trunk}of trees){assert.equal(trunk.parent,tree);assert.equal(scene.getObjectById(trunk.id),trunk,'Registered touch mesh remains in the rendered scene');}
  world.clearActivity();for(const{trunk}of trees)assert.equal(scene.getObjectById(trunk.id),undefined);
  world.setActivity({species:'brachiosaurus'});world.cameraPlan(camera,viewport,25,context);assert.equal(trees.length,4,'Revisits reuse the imported trees');
  world.dispose();assert.equal(sharedDisposed,false,'Discovery disposal must not release globally shared tree assets');
 }finally{world.dispose();geometry.dispose();material.dispose();}
});

test('ground hints remain findable after six seconds of narration and release when tapped',async()=>{
 const f=fixture(320,568);try{
  const ready=f.select('parasaurolophus',{foundTargets:['reed-1','reed-2']});f.advance(1.7);await ready;
  const focused=f.world.focusDiscovery('reed-3');f.advance(6);assert.deepEqual(await focused,{completed:true,cancelled:false});
  const point=f.world.getScreenPositions().find(p=>p.id==='reed-3');assert.equal(point.visible,true);assert.equal(f.world.getDebugInfo().focus,'reed-3');safeHits(f);
  f.advance(5.5);assert.equal(f.world.getScreenPositions().find(p=>p.id==='reed-3').visible,true,'Child has time after a long spoken instruction');
  assert.equal(f.world.activateDiscovery('reed-3'),true);assert.equal(f.world.getDebugInfo().focus,null);
  const immediate=f.world.focusDiscovery('reed-3');assert.equal(f.world.activateDiscovery('reed-3'),true);assert.deepEqual(await immediate,{completed:true,cancelled:false},'Early tap settles focus promise without waiting for a cancelled animation');
 }finally{f.world.dispose();}
});

test('fossil engraving conforms to sloping shared rocks and shared habitat assets survive disposal',()=>{
 const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(3,.2,2),material=new THREE.MeshBasicMaterial({color:'#777777'}),assets=[];
 let disposed=0;geometry.addEventListener('dispose',()=>disposed++);material.addEventListener('dispose',()=>disposed++);
 const world=createWorldDiscoveries({scene,createHabitatAsset:({kind,height})=>{
  const g=new THREE.Group();g.scale.setScalar(height);const rock=new THREE.Mesh(geometry,material);rock.rotation.z=.27;rock.position.y=.35;g.add(rock);assets.push({g,rock,kind});return g;
 }});
 try{
  world.setActivity({species:'stegosaurus'});const camera=new THREE.PerspectiveCamera(47,390/844,.2,170),viewport={width:390,height:844,portrait:true};world.cameraPlan(camera,viewport,12);
  const targets=scene.children[0].children.filter(o=>o.children.some(c=>c.userData.discovery?.startsWith('fossil-')));
  assert.equal(targets.length,3);
  for(const target of targets){
   target.updateWorldMatrix(true,true);const rock=target.children.find(o=>o.userData.sharedHabitatAsset).children[0],inverse=rock.matrixWorld.clone().invert();let min=Infinity,max=-Infinity,count=0;
   target.traverse(o=>{if(!o.isMesh||o.material.color?.getHexString()!=='a69879')return;const positions=o.geometry.attributes.position;for(let i=0;i<positions.count;i++){
    const point=v().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld),local=point.clone().applyMatrix4(inverse);
    assert.ok(Math.abs(local.y-.1)<.045,`engraving remains within surface relief, rather than floating at a flat height: ${local.y}`);min=Math.min(min,point.y);max=Math.max(max,point.y);count++;
   }});
   assert.ok(count>100);assert.ok(max-min>.05,'Engraving visibly follows the tilted surface');
  }
  assert.ok(assets.filter(a=>a.kind==='rock').length>10,'Unmarked rocks continue the seam');
  for(const {g,rock} of assets){assert.equal(rock.parent,g);assert.equal(scene.getObjectById(rock.id),rock);}
  world.dispose();assert.equal(disposed,0,'Shared rocks/plants remain owned by the environment loader');
 }finally{world.dispose();geometry.dispose();material.dispose();}
});

test('muddy footprint surfaces face the overhead search camera instead of being back-face culled',async()=>{
 const f=fixture(1024,768);try{
  const ready=f.select('trex');f.advance(1.7);await ready;
  for(const id of ['footprint-1','footprint-2','footprint-3']){
   const object=f.object(id),surfaces=[];object.traverse(o=>{if(o.isMesh&&o.material.color?.getHexString()==='403c2e')surfaces.push(o);});assert.equal(surfaces.length,1);
   const geo=surfaces[0].geometry,normal=geo.attributes.normal;let upward=0;for(let i=0;i<normal.count;i++)if(normal.getY(i)>.2)upward++;
   assert.equal(upward,normal.count,'All impression triangles face upward');
   geo.computeBoundingBox();assert.ok(geo.boundingBox.max.y-geo.boundingBox.min.y<.06,'Print remains a shallow soil depression');
  }
 }finally{f.world.dispose();}
});


test('woodland hunt starts with one fossil and both outer pockets require real camera search',async()=>{
 for(const[width,height]of [...SIZES,[1075,707]]){
  const f=fixture(width,height);try{
   const ready=f.select('stegosaurus');f.advance(2);await ready;
   const visible=f.world.getScreenPositions().filter(p=>p.kind==='fossil'&&p.visible);
   assert.deepEqual(visible.map(p=>p.id),['fossil-1'],`${width}x${height}: one clear starting find`);
   const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(f.camera.projectionMatrix,f.camera.matrixWorldInverse));
   for(const id of ['fossil-2','fossil-3']){
    const bounds=new THREE.Box3().setFromObject(f.object(id));assert.equal(frustum.intersectsBox(bounds),false,`${width}x${height}/${id}: entire outer object starts outside view, not only its hotspot`);
   }
   for(const id of ['fossil-2','fossil-3']){
    let reachable=false;
    for(let yaw=-FIRST_FOREST_LAYOUT.maxYaw;yaw<=FIRST_FOREST_LAYOUT.maxYaw+.001;yaw+=.025){
     f.pan(yaw);f.frame(0);const point=f.world.getScreenPositions().find(p=>p.id===id);
     if(point.visible){reachable=true;assert.ok(Math.abs(yaw)>.25,`${id} needs a genuine turn into woodland`);safeHits(f);assert.equal(f.world.activateDiscovery(id),true);break;}
    }
    assert.equal(reachable,true,`${width}x${height}/${id} reachable with bounded yaw and no hint`);
   }
   f.pan(0);assert.ok((await focus(f,'fossil-3')).visible,'Explicit hint also reaches the far pocket');
  }finally{f.world.dispose();}
 }
});

test('first woodland habitats stay away from Mosi and hints turn a fixed safe camera',async()=>{
 const f=fixture(1075,707);try{
  const ready=f.select('stegosaurus');f.advance(2);await ready;
  const position=f.camera.position.clone(),mosi=new THREE.Box3(v(FIRST_FOREST_LAYOUT.mosi[0]-2.8,-.2,FIRST_FOREST_LAYOUT.mosi[1]-1.2),v(FIRST_FOREST_LAYOUT.mosi[0]+2.8,4,FIRST_FOREST_LAYOUT.mosi[1]+1.2));
  for(const object of f.scene.children[0].children){const bounds=new THREE.Box3().setFromObject(object);assert.ok(bounds.max.z<-3,'All first-discovery props stay in woodland, outside the player trail');assert.equal(bounds.intersectsBox(mosi),false);}
  for(const id of ['fossil-2','fossil-3','snail']){await focus(f,id);assert.ok(f.camera.position.distanceTo(position)<1e-10,'Hint may rotate, but never slides through trunks');assert.equal(f.world.getScreenPositions().find(p=>p.id===id).visible,true);}
 }finally{f.world.dispose();}
});

test('short-landscape side pockets and long hints keep whole targets below the count HUD',async()=>{
 for(const[width,height]of [[568,320],[844,390]]){
  const f=fixture(width,height);try{
   const ready=f.select('stegosaurus');f.advance(2);await ready;
   const initial=f.world.getScreenPositions().find(p=>p.id==='fossil-1');
   assert.ok(initial.visible);assert.ok(initial.screen.y*height+initial.radius<height-74,'Starting fossil stays above the bottom controls');
   for(const[id,yaw]of [['fossil-2',.97],['fossil-3',-.94]]){
    f.pan(yaw);f.advance(.6);const p=f.world.getScreenPositions().find(p=>p.id===id);
    assert.ok(p.visible);assert.ok(p.screen.y*height-p.radius>114,`${width}x${height}/${id}: rock and hit area clear count HUD`);
    assert.ok(p.screen.y*height+p.radius<height-74,`${id}: stays above bottom controls`);
   }
   f.pan(0);await focus(f,'snail');f.advance(5);
   const snail=f.world.getScreenPositions().find(p=>p.id==='snail');
   assert.ok(snail.visible);assert.ok(snail.screen.y*height-snail.radius>114,'Secret body stays below HUD throughout narrated hint');
   assert.ok(f.camera.position.distanceTo(v(...FIRST_FOREST_LAYOUT.searchCamera))<1e-10,'Framing never moves camera into geometry');
  }finally{f.world.dispose();}
 }
});

test('remaining ground hunts start with one main find and require substantial bounded turns for the others',async()=>{
 for(const[width,height]of [...SIZES,[1075,707]])for(const species of ['trex','spinosaurus','parasaurolophus']){
  const f=fixture(width,height);try{
   const ready=f.select(species);f.advance(2);await ready;const points=f.world.getScreenPositions(),main=points.filter(p=>!p.secret);
   assert.deepEqual(main.filter(p=>p.visible).map(p=>p.id),[main[0].id],`${width}x${height}/${species}: exactly one initial find`);
   const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(f.camera.projectionMatrix,f.camera.matrixWorldInverse));
   for(const p of main.slice(1))assert.equal(frustum.intersectsBox(new THREE.Box3().setFromObject(f.object(p.id))),false,`${width}x${height}/${p.id} starts physically outside view`);
   const cameraHome=f.camera.position.clone();
   for(const point of main.slice(1)){
    let found=false;
    for(let yaw=-GROUND_HUNTS[species].maxYaw;yaw<=GROUND_HUNTS[species].maxYaw+.001;yaw+=.035){
     f.pan(yaw);f.advance(.035);const p=f.world.getScreenPositions().find(p=>p.id===point.id);
     if(p.visible){assert.ok(Math.abs(yaw)>.25,`${species}/${p.id} requires a real turn`);safeHits(f);found=true;break;}
    }
    assert.ok(found,`${width}x${height}/${point.id} reachable by bounded manual pan`);
   }
   assert.ok(f.camera.position.distanceTo(cameraHome)<1e-9,'Looking around never moves the camera through habitat');
  }finally{f.world.dispose();}
 }
});

test('canopy has one starting leaf across viewports and a smaller beetle can be collected among its branches',async()=>{
 for(const[width,height]of [[320,568],[390,844],[844,390],[1024,768],[1075,707]]){
  const f=fixture(width,height);try{
   const ready=f.select('brachiosaurus');f.advance(1.7);await ready;
   const context={kind:'canopy',interactive:false,anchor:v(25,8,-2),canopyAnchor:v(25,8,-2),forward:v(0,0,-1),right:v(1,0,0),up:v(0,1,0)};
   f.ride(context);f.camera.fov=f.viewport.portrait?67:62;f.camera.updateProjectionMatrix();f.camera.position.copy(context.anchor);f.camera.lookAt(context.anchor.clone().add(v(0,-2.4,-9)));f.frame(0);
   const fixed=f.object('leaf-2').position.clone();assert.ok(f.object('leaf-2').visible);assert.ok(f.world.getScreenPositions().every(p=>!p.visible),'Ascent shows habitat but disables tapping');
   context.anchor.add(v(0,-2,1));f.frame(0);assert.ok(f.object('leaf-2').position.distanceTo(fixed)<1e-9,'Moving ascent eye cannot drag trees or leaves');
   context.anchor.copy(context.canopyAnchor);context.interactive=true;f.frame(0);
   assert.deepEqual(f.world.getScreenPositions().filter(p=>p.kind==='leaf'&&p.visible).map(p=>p.id),['leaf-1']);
   for(const[index,yaw]of [[1,CANOPY_HUNT.maxYaw],[2,-CANOPY_HUNT.maxYaw]]){
    const direction=v(0,-2.4,-9).applyAxisAngle(v(0,1,0),yaw);f.camera.lookAt(context.anchor.clone().add(direction));f.frame(0);
    const p=f.world.getScreenPositions().find(p=>p.id===`leaf-${index+1}`);assert.ok(p.visible,`${width}x${height}/${p.id} reachable within ride turn limit`);safeHits(f);
   }
   const beetle=f.object('beetle');assert.equal(beetle.scale.x,CANOPY_HUNT.beetle.scale);assert.ok(beetle.scale.x<.5,'Beetle is a small animal in the tree');
   const request=f.world.focusDiscovery('beetle');f.camera.lookAt(beetle.position.clone().add(v(0,.18,0)));f.advance(1);await request;assert.ok(f.world.activateDiscovery('beetle'));assert.equal(f.events.at(-1).secret,true);
  }finally{f.world.dispose();}
 }
});
