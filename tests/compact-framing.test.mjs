import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import {createDinosaur,preloadDinosaurAssets} from '../dist/dinosaurs.js';
import {applyViewportFraming} from '../dist/camera-framing.js';
import {FIRST_FOREST_LAYOUT,createArrivalTrack} from '../dist/arrival-staging.js';

const nativeFetch=globalThis.fetch,nativeProgress=globalThis.ProgressEvent;
globalThis.ProgressEvent=class{constructor(type,options){Object.assign(this,options)}};
globalThis.fetch=async input=>{
  const url=typeof input==='string'?input:input.url;
  if(!url.startsWith('file:'))return nativeFetch(input);
  const bytes=await readFile(fileURLToPath(url));
  return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
};
assert.deepEqual((await preloadDinosaurAssets()).missing,[]);
globalThis.fetch=nativeFetch;globalThis.ProgressEvent=nativeProgress;
const source=await readFile(new URL('../dist/world.js',import.meta.url),'utf8');
function helper(name,keys){
  const start=source.indexOf(`  function ${name}(`),body=source.indexOf('{',start);assert.ok(start>=0);
  let depth=1,end=body+1;for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
  return new Function('THREE','fixture','args',`const {${keys.join(',')}}=fixture;${source.slice(start,end)}return ${name}(...args)`);
}
function constant(name){return new Function(`return (${source.match(new RegExp(`const ${name} = (\\{[^}]+\\})`))[1]})`)()}
const route=constant('route'),adultScale=constant('adultScale'),landscapeScale=constant('landscapeScale');
const cameraPlan=helper('cameraPlan',['viewport','view','mosi','station','actorTarget','cameraDesired','cameraTarget','arrival','camera','smooth','applyViewportFraming','FIRST_FOREST_LAYOUT','groundHeight']);
const encounterPose=helper('encounterPose',['route','viewport','adultScale','landscapeScale','FIRST_FOREST_LAYOUT','groundHeight']);
const ground=helper('groundHeight',['smooth','mix','lakeShape','pathZ']);
const groundHeight=(x,z)=>ground(THREE,{smooth:(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b),mix:THREE.MathUtils.lerp,lakeShape:(x,z)=>Math.hypot((x-64)/17,(z+10)/11),pathZ:x=>4.8+Math.sin(x*.073)*1.7},[x,z]);

function projectedBounds(animal,camera,width,height){
  const bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
  const vertex=new THREE.Vector3(),instance=new THREE.Matrix4();animal.group.updateMatrixWorld(true);
  animal.group.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.visible)return;
    if(mesh.isSkinnedMesh)mesh.skeleton.update();
    for(let instanceIndex=0;instanceIndex<(mesh.isInstancedMesh?mesh.count:1);instanceIndex++){
      if(mesh.isInstancedMesh)mesh.getMatrixAt(instanceIndex,instance);
      for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){
        mesh.getVertexPosition(i,vertex);if(mesh.isInstancedMesh)vertex.applyMatrix4(instance);
        mesh.localToWorld(vertex);vertex.project(camera);
        const x=(vertex.x+1)*width/2,y=(1-vertex.y)*height/2;
        assert.ok(Number.isFinite(x)&&Number.isFinite(y),'Projected skin vertices must remain finite');
        bounds.left=Math.min(bounds.left,x);bounds.top=Math.min(bounds.top,y);
        bounds.right=Math.max(bounds.right,x);bounds.bottom=Math.max(bounds.bottom,y);
      }
    }
  });return bounds;
}
function sceneFor(species,width=320,height=568){
  const portrait=width/height<.85,sky=species==='pteranodon',viewport={width,height,portrait};
  const mosi=createDinosaur('triceratops',{rider:true}),animal=createDinosaur(species);
  mosi.group.position.set(route[species]+(portrait?(species==='brachiosaurus'?4.1:1.1):6.2),0,portrait?1.4:2);
  if(species==='stegosaurus')mosi.group.position.set(FIRST_FOREST_LAYOUT.mosi[0],groundHeight(...FIRST_FOREST_LAYOUT.mosi),FIRST_FOREST_LAYOUT.mosi[1]);
  mosi.group.scale.setScalar(portrait?(sky?.65:.5):.85);
  const pose=encounterPose(THREE,{route,viewport,adultScale,landscapeScale,FIRST_FOREST_LAYOUT,groundHeight},[species,animal]);
  animal.group.position.copy(pose.position);animal.group.rotation.y=pose.yaw;animal.group.scale.setScalar(pose.scale);
  mosi.group.rotation.y=Math.atan2(-(pose.position.z-mosi.group.position.z),pose.position.x-mosi.group.position.x);
  const camera=new THREE.PerspectiveCamera(43,width/height,.2,170);
  const fixture={viewport,view:{mode:'encounter',species,biome:sky?'sky':['spinosaurus','parasaurolophus'].includes(species)?'lake':'forest'},
    mosi,station:route[species],actorTarget:new THREE.Vector3(),cameraDesired:new THREE.Vector3(),cameraTarget:new THREE.Vector3(),arrival:null,camera,smooth:(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b),applyViewportFraming,FIRST_FOREST_LAYOUT,groundHeight};
  cameraPlan(THREE,fixture,[]);camera.position.copy(fixture.cameraDesired);camera.lookAt(fixture.cameraTarget);camera.updateMatrixWorld(true);
  return {mosi,animal,pose,camera,fixture,viewport};
}

test('all land visitors and the seated explorer remain above compact-phone question controls',()=>{
  for(const species of ['stegosaurus','brachiosaurus','trex','spinosaurus','parasaurolophus']){
    const scene=sceneFor(species),{animal,mosi,camera}=scene;
    for(let frame=0;frame<12;frame++){
      const time=frame*.5;
      animal.update(time,{walking:0,look:.5,gazeHeight:-.15});
      mosi.update(time,{walking:0,look:-.12,gazeHeight:species==='brachiosaurus'?.45:.12});
      for(const [label,model]of (species==='stegosaurus'?[[species,animal]]:[[species,animal],['mosi',mosi]])){
        const b=projectedBounds(model,camera,320,568);
        assert.ok(b.top>68,`${species}/${label} needs clearance below the 64px HUD, got ${b.top}`);
        assert.ok(b.bottom<316,`${species}/${label} must clear the long-hint panel at y320, got ${b.bottom}`);
        assert.ok(b.left>8&&b.right<312,`${species}/${label} must remain horizontally framed`);
      }
    }
    animal.dispose();mosi.dispose();
  }
});

test('the long Brontosaurus silhouette and explorer fit tall phones and wide tablets without cropping the tail',()=>{
  for(const [width,height,panelTop]of [[320,568,320],[390,844,616],[844,390,287],[1075,803,567]]){
    const {animal,mosi,camera}=sceneFor('brachiosaurus',width,height);
    try{for(let frame=0;frame<4;frame++){
      animal.update(frame*.9,{look:.5,gazeHeight:-.15});mosi.update(frame*.9,{look:-.12,gazeHeight:.45});
      for(const [name,model]of [['Þórseðla',animal],['Mosi',mosi]]){
        const bounds=projectedBounds(model,camera,width,height);
        assert.ok(bounds.left>8&&bounds.right<width-8,`${width}×${height} ${name}: head and full tail fit ${JSON.stringify(bounds)}`);
        assert.ok(bounds.top>64&&bounds.bottom<panelTop-4,`${width}×${height} ${name}: actual skin clears the HUD and questions ${JSON.stringify(bounds)}`);
      }
    }}finally{animal.dispose();mosi.dispose();}
  }
});

test('portrait Mosi and Egill remain visibly beside the giant rather than merging with its front legs',()=>{
  for(const[width,height]of [[320,568],[390,844],[375,667]]){
    const{animal,mosi,camera}=sceneFor('brachiosaurus',width,height);
    try{for(let frame=0;frame<4;frame++){
      animal.update(frame*.9,{look:.5,gazeHeight:-.15});mosi.update(frame*.9,{look:-.12,gazeHeight:.45});
      animal.group.updateMatrixWorld(true);mosi.group.updateMatrixWorld(true);
      const head=mosi.group.getObjectByName('Egill smiling explorer face');assert.ok(head);
      const explorer=head.getWorldPosition(new THREE.Vector3()).project(camera),explorerX=(explorer.x+1)*width/2;
      const vertex=new THREE.Vector3();let legRight=-Infinity,samples=0;
      animal.group.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();
        const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
        for(let i=0;i<indices.count;i++){
          let legWeight=0;for(let channel=0;channel<4;channel++)if(/^Front(?:UpLeg|LowLeg|Foot)/.test(mesh.skeleton.bones[indices.getComponent(i,channel)]?.name||''))legWeight+=weights.getComponent(i,channel);
          if(legWeight<.7)continue;mesh.getVertexPosition(i,vertex);mesh.localToWorld(vertex);vertex.project(camera);legRight=Math.max(legRight,(vertex.x+1)*width/2);samples++;
        }
      });
      assert.ok(samples>100,'The real front-leg skin was measured');
      assert.ok(explorerX>legRight+8,`${width}×${height} child at${explorerX.toFixed(1)} needs separation from the front legs ending at${legRight.toFixed(1)}`);
    }}finally{animal.dispose();mosi.dispose();}
  }
});

test('the giant approaching the clearing keeps its whole head and tail framed during the slow greeting',()=>{
  for(const[width,height]of [[320,568],[390,844],[844,390],[1075,803]]){
    const{animal,mosi,camera,fixture,pose}=sceneFor('brachiosaurus',width,height);
    try{
      const endCamera=camera.clone();fixture.view.mode='travel';cameraPlan(THREE,fixture,[]);
      camera.position.copy(fixture.cameraDesired);camera.lookAt(fixture.cameraTarget);camera.updateMatrixWorld(true);
      const track=createArrivalTrack({species:'brachiosaurus',goal:pose.position,finalYaw:pose.yaw,bounds:animal.bounds,scale:pose.scale,cameras:[camera.clone(),endCamera],terrainHeight:groundHeight});
      const look=fixture.cameraTarget.clone();fixture.view.mode='arrival';
      for(let frame=0;frame<=Math.ceil(track.duration*30);frame++){
        const age=frame/30,sample=track.sample(age);fixture.arrival={track,age,sample};
        animal.group.position.copy(sample.position);animal.group.rotation.y=sample.heading;animal.update(age,{walking:sample.walking,look:.5,gazeHeight:-.15});
        cameraPlan(THREE,fixture,[]);camera.position.lerp(fixture.cameraDesired,1-Math.exp(-1.8/30));look.lerp(fixture.cameraTarget,1-Math.exp(-2/30));camera.lookAt(look);camera.updateMatrixWorld(true);
        if(age<9||frame%15)continue;
        const bounds=projectedBounds(animal,camera,width,height);
        assert.ok(bounds.left>4&&bounds.right<width-4,`${width}×${height} age${age}: the slow greeting must retain both extremities ${JSON.stringify(bounds)}`);
        assert.ok(bounds.top>42&&bounds.bottom<height*.84,`${width}×${height} age${age}: visible greeting fits vertically ${JSON.stringify(bounds)}`);
      }
    }finally{animal.dispose();mosi.dispose();}
  }
});

test('compact sky framing keeps actual flapping skin and Mosi clear through the nearby glide cycle',()=>{
  const {animal,mosi,camera,pose}=sceneFor('pteranodon');
  for(let frame=0;frame<48;frame++){
    const time=frame*.35;
    animal.group.position.copy(pose.position);
    animal.group.position.x+=Math.sin(time*.35)*.48;animal.group.position.y+=Math.sin(time*.7)*.27;
    animal.group.position.z+=(Math.cos(time*.35)-1)*.5;
    animal.group.rotation.set(Math.sin(time*.35)*.09,pose.yaw+Math.sin(time*.35)*.14,0);
    animal.update(time,{look:.5,gazeHeight:-.15,flying:1,glide:.84+Math.sin(time*.25)*.13,bank:Math.sin(time*.35)*.18});
    mosi.update(time,{look:-.12,gazeHeight:.65});
    const wings=projectedBounds(animal,camera,320,568),rider=projectedBounds(mosi,camera,320,568);
    assert.ok(wings.top>60&&wings.bottom<316,`Wing frame ${frame} stays in scene: ${JSON.stringify(wings)}`);
    assert.ok(wings.left>8&&wings.right<312,`Wing frame ${frame} needs side clearance`);
    assert.ok(rider.bottom<316,`Mosi must remain above the sky question, got ${rider.bottom}`);
  }
  animal.dispose();mosi.dispose();
});

test('the woodland question frames the whole animal closely on phones and both explorers on tablets',()=>{
  for(const [width,height,panelTop]of [[320,568,320],[390,844,616],[844,390,287],[1075,707,469],[1024,768,532]]){
    const {animal,mosi,camera}=sceneFor('stegosaurus',width,height);
    for(let frame=0;frame<8;frame++){
      const time=frame*.47;animal.update(time,{look:.5,gazeHeight:-.15});mosi.update(time,{look:-.12,gazeHeight:.12});
      const portrait=width/height<.85;
      for(const [name,model]of (portrait?[['Stegosaurus',animal]]:[['Stegosaurus',animal],['Mosi and explorer',mosi]])){
        const bounds=projectedBounds(model,camera,width,height);
        assert.ok(bounds.top>68&&bounds.bottom<panelTop-4,`${width}x${height} ${name} clears HUD and controls: ${JSON.stringify(bounds)}`);
        assert.ok(bounds.left>8&&bounds.right<width-8,`${width}x${height} ${name} remains wholly framed`);
        if(portrait)assert.ok(bounds.right-bounds.left>width*.6,`${width}x${height} dinosaur is large enough to recognize`);
      }
    }
    animal.dispose();mosi.dispose();
  }
});

test('intermediate portrait phones keep the tallest visitor and explorer above measured compact hint panels',()=>{
  // These are conservative four-line/three-line panel tops from browser QA,
  // including the 108px answer controls. Checking between endpoints catches
  // a camera/CSS breakpoint gap that a 320px and 390x844-only review missed.
  for(const [width,height,panelTop]of [[375,667,419],[390,740,512],[390,800,572]])for(const species of ['brachiosaurus','pteranodon']){
    const {animal,mosi,camera}=sceneFor(species,width,height),sky=species==='pteranodon';
    for(let frame=0;frame<8;frame++){
      const time=frame*.65;
      animal.update(time,{look:.5,gazeHeight:-.15,flying:sky?1:0,glide:sky?.85:0});mosi.update(time,{look:-.12,gazeHeight:sky?.65:.45});
      for(const [label,model]of [[species,animal],['mosi',mosi]]){
        const b=projectedBounds(model,camera,width,height);
        assert.ok(b.top>68,`${width}x${height}/${label} clears the HUD`);
        assert.ok(b.bottom<panelTop-4,`${width}x${height}/${label} clears the long hint at ${panelTop}, got ${b.bottom}`);
        assert.ok(b.left>4&&b.right<width-4,`${width}x${height}/${label} keeps the head and tail onscreen: ${JSON.stringify(b)}`);
      }
    }
    animal.dispose();mosi.dispose();
  }
});

test('short landscape sky keeps the full nearby flight envelope and explorer above the controls',()=>{
  const {animal,mosi,camera,pose}=sceneFor('pteranodon',844,390);
  let minWingTop=Infinity,maxRiderBottom=-Infinity;
  for(let frame=0;frame<128;frame++){
    const time=frame*.35;
    animal.group.position.copy(pose.position);
    animal.group.position.x+=Math.sin(time*.35)*.9;animal.group.position.y+=Math.sin(time*.7)*.27;
    animal.group.position.z+=(Math.cos(time*.35)-1)*.5;
    animal.group.rotation.set(Math.sin(time*.35)*.09,pose.yaw+Math.sin(time*.35)*.14,0);
    animal.update(time,{look:.5,gazeHeight:-.15,flying:1,glide:.84+Math.sin(time*.25)*.13,bank:Math.sin(time*.35)*.18});
    mosi.update(time,{look:-.12,gazeHeight:.65});
    const wings=projectedBounds(animal,camera,844,390),rider=projectedBounds(mosi,camera,844,390);
    minWingTop=Math.min(minWingTop,wings.top);maxRiderBottom=Math.max(maxRiderBottom,rider.bottom);
    assert.ok(wings.top>60&&wings.bottom<279,`Landscape wing frame ${frame} clears HUD/panels: ${JSON.stringify(wings)}`);
    assert.ok(wings.left>16&&wings.right<828,`Landscape wing frame ${frame} keeps the full wingspan`);
    assert.ok(rider.bottom<279,`Landscape Mosi clears the panel at287, got ${rider.bottom}`);
  }
  console.log(`Landscape sky envelope: highest wing/crest ${minWingTop.toFixed(1)}px; lowest rider foot ${maxRiderBottom.toFixed(1)}px`);
  animal.dispose();mosi.dispose();
});

test('tall-phone and landscape projection is unchanged and a rotation clears the compact lens shift',()=>{
  for(const [width,height]of [[390,844],[844,390],[1024,768]]){
    const camera=new THREE.PerspectiveCamera(40,width/height,.2,170);
    applyViewportFraming(camera,{width:320,height:568,portrait:true},{baseFov:47});
    camera.aspect=width/height;
    applyViewportFraming(camera,{width,height,portrait:width/height<.85},{baseFov:40});
    const expected=new THREE.PerspectiveCamera(40,width/height,.2,170);
    assert.deepEqual(camera.projectionMatrix.elements,expected.projectionMatrix.elements,'No stale view offset after resize');
    if(height>640){
      applyViewportFraming(camera,{width,height,portrait:width/height<.85},{baseFov:40,sky:true});
      assert.deepEqual(camera.projectionMatrix.elements,expected.projectionMatrix.elements,'Tall-phone/tablet sky remains unchanged');
    }
  }
});
