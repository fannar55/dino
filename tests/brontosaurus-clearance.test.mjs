import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {populateEnvironment} from '../dist/environment-assets.js';
import {firstForestSweeps,brontosaurusSweeps,protectFirstForestPassage,forestEntryVegetation,forestFloorVegetation,createArrivalTrack} from '../dist/arrival-staging.js';
import {canopyBoardingOffset} from '../dist/cinematic-rides.js';
import {applyViewportFraming} from '../dist/camera-framing.js';
import {FIRST_FOREST_LAYOUT} from '../dist/arrival-staging.js';
import {createDinosaur,preloadDinosaurAssets} from '../dist/dinosaurs.js';

const source=await readFile(new URL('../dist/world.js',import.meta.url),'utf8');
function helper(name,keys){
  const start=source.indexOf(`  function ${name}(`),body=source.indexOf('{',start);assert.ok(start>=0);
  let depth=1,end=body+1;for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
  return new Function('THREE','fixture','args',`const {${keys.join(',')}}=fixture;${source.slice(start,end)}return ${name}(...args)`);
}
const seedRandom=seed=>helper('seedRandom',[])(THREE,{},[seed]);
const route=new Function(`return (${source.match(/const route = (\{[^}]+\})/)[1]})`)();
const pathZ=x=>4.8+Math.sin(x*.073)*1.7,lakeShape=(x,z)=>Math.hypot((x-64)/17,(z+10)/11);
const ground=helper('groundHeight',['smooth','mix','lakeShape','pathZ']);
const groundHeight=(x,z)=>ground(THREE,{smooth:(a,b,t)=>THREE.MathUtils.smoothstep(t,a,b),mix:THREE.MathUtils.lerp,lakeShape,pathZ},[x,z]);
const clearing=helper('isClearing',['route']),isClearing=(x,z)=>clearing(THREE,{route},[x,z]);
const manifest=JSON.parse(await readFile(new URL('../dist/assets/environment/manifest.json',import.meta.url),'utf8'));
const models=new Map(),loader=new GLTFLoader();
globalThis.ProgressEvent??=class{constructor(type,options){Object.assign(this,options)}};
for(const entry of manifest.models){
  const bytes=await readFile(new URL(`../dist/assets/environment/${entry.file}`,import.meta.url));
  const jsonSize=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonSize).toString('utf8'));
  const offset=20+jsonSize,bin=bytes.subarray(offset+8,offset+8+bytes.readUInt32LE(offset));
  json.buffers[0].uri=`data:application/octet-stream;base64,${bin.toString('base64')}`;
  for(const material of json.materials||[]){
    for(const key of Object.keys(material))if(/Texture$/.test(key))delete material[key];
    for(const key of Object.keys(material.pbrMetallicRoughness||{}))if(/Texture$/.test(key))delete material.pbrMetallicRoughness[key];
    delete material.extensions;
  }
  delete json.images;delete json.textures;delete json.samplers;
  const gltf=await loader.parseAsync(JSON.stringify(json),'');gltf.scene.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const normalization=new THREE.Matrix4().makeScale(1/size.y,1/size.y,1/size.y).multiply(new THREE.Matrix4().makeTranslation(-center.x,-box.min.y,-center.z));
  const parts=[];gltf.scene.traverse(object=>{if(object.isMesh)parts.push({geometry:object.geometry.clone().applyMatrix4(normalization.clone().multiply(object.matrixWorld)),material:object.material});});
  models.set(entry.id,{...entry,parts});
}
const nativeFetch=globalThis.fetch;
globalThis.fetch=async input=>{const url=typeof input==='string'?input:input.url;if(!url.startsWith('file:'))return nativeFetch(input);const bytes=await readFile(fileURLToPath(url));return new Response(bytes,{headers:{'content-length':String(bytes.length)}});};
try{assert.deepEqual((await preloadDinosaurAssets()).missing,[]);}finally{globalThis.fetch=nativeFetch;}
const scene=new THREE.Scene(),dummy=new THREE.Object3D();
populateEnvironment(scene,{models},{rng:seedRandom(219),groundHeight,lakeShape,pathZ,isClearing,streamedBatches:[],windUniform:{value:0}});
function instances(geometry,material,transforms){
  const mesh=new THREE.InstancedMesh(geometry,material,transforms.length);
  transforms.forEach((t,i)=>{dummy.position.set(...t.p);dummy.rotation.set(...(t.r||[0,0,0]));dummy.scale.set(...t.s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});scene.add(mesh);return mesh;
}
const entryTrees=[...models.values()].find(model=>model.kind==='tree'),entryBush=[...models.values()].find(model=>model.kind==='bush');
function add(model,transforms,name){for(const part of model.parts){const mesh=instances(part.geometry,part.material,transforms);mesh.name=name;mesh.userData.forestModel=model.id;}}
const vegetation=forestEntryVegetation(groundHeight);
add(entryTrees,vegetation.trees,'authored-forest-entries');add(entryTrees,vegetation.canopy,'authored-canopy-stand');add(entryBush,vegetation.bushes,'authored-forest-bushes');
add(models.get('fern'),[12,25,37].flatMap(x=>[0,1.7,3.5].map(offset=>{const z=x===37?-9.8:-3.2;return{p:[x-12+offset,groundHeight(x-12+offset,z),z],s:[1.2,1.2,1.2],r:[0,offset,0]};})),'authored-entry-ferns');
for(const[id,transforms]of Object.entries(forestFloorVegetation(groundHeight)))add(models.get(id),transforms,`authored-forest-floor:${id}`);
// Execute the authored distant stand placement with geometry-only instances,
// keeping its exact seeded transforms in step with the rendered environment.
const standStart=source.indexOf('    const flightForestRandom='),standEnd=source.indexOf('    const bushes=forestVegetation.bushes;',standStart);
assert.ok(standStart>0&&standEnd>standStart);
new Function('THREE','seedRandom','environmentAssets','entryTrees','lakeShape','pathZ','isClearing','groundHeight','instances',source.slice(standStart,standEnd))(THREE,seedRandom,{models},entryTrees,lakeShape,pathZ,isClearing,groundHeight,instances);
const stego=createDinosaur('stegosaurus'),mosi=createDinosaur('triceratops',{rider:true}),bronto=createDinosaur('brachiosaurus');
const firstSweeps=firstForestSweeps({stegoBounds:stego.bounds,mosiBounds:mosi.bounds,terrainHeight:groundHeight});
protectFirstForestPassage(scene,models,firstSweeps,groundHeight);
const sweeps=brontosaurusSweeps({bounds:bronto.bounds,terrainHeight:groundHeight,boardingOffset:canopyBoardingOffset});
const start=performance.now();
const clearance=protectFirstForestPassage(scene,models,sweeps,groundHeight,{includeCrowns:true,keepClear:firstSweeps,area:[-140,46,-38,14]});
const elapsed=performance.now()-start;

test('enlarged sauropod arrival, boarding and raised neck clear the actual imported trees, crowns and rocks',()=>{
  assert.equal(clearance.overlaps,0,'No conservative whole-crown/solid overlap may remain');
  assert.ok(clearance.moved.length>0,'The enlarged long tail needs actual scenery clearance');
  // Independently recompute geometry bounds from the final matrices instead
  // of trusting the movement helper\'s returned bounds or collision count.
  const matrix=new THREE.Matrix4(),point=new THREE.Vector3(),failures=[];
  scene.updateMatrixWorld(true);
  scene.traverse(mesh=>{
    const model=models.get(mesh.userData.forestModel||mesh.name.match(/^environment:([^:]+):/)?.[1]);
    // Short grass and tiny mushrooms are floor cover; unlike a trunk, rock or
    // broad plant, they are deliberately allowed beneath a walking animal.
    if(!mesh.isInstancedMesh||!model||['grass','mushroom'].includes(model.kind))return;
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);
      const box=new THREE.Box3(),position=mesh.geometry.getAttribute('position');
      for(let p=0;p<position.count;p++)box.expandByPoint(point.fromBufferAttribute(position,p).applyMatrix4(matrix));
      if(sweeps.some(sweep=>sweep.intersectsBox(box)))failures.push(`${mesh.name}:${i}`);
    }
  });
  assert.deepEqual(failures,[],'All full geometry, including trees outside the initial center selection, clears the reserved volume');
  console.log(JSON.stringify({brontoClearance:{moved:clearance.moved.length,solids:clearance.solids.length,sweeps:sweeps.length,elapsedMs:Math.round(elapsed),maxMove:Math.max(...clearance.moved.map(move=>Math.hypot(move.to[0]-move.from[0],move.to[1]-move.from[1])))}}));
});

test('each material part of a moved tree retains an identical instance transform',()=>{
  const seen=new Map(),matrix=new THREE.Matrix4();
  scene.traverse(mesh=>{if(!mesh.isInstancedMesh)return;for(let i=0;i<mesh.count;i++){
    const key=`${mesh.name}:${i}`;if(!mesh.name)continue;mesh.getMatrixAt(i,matrix);
    const previous=seen.get(key);if(previous)assert.deepEqual(matrix.elements,previous,`${key} has no detached crown`);else seen.set(key,[...matrix.elements]);
  }});
});

test('enlarged sauropod walking skin remains inside the cleared arrival envelopes',()=>{
  const matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  for(const[portrait,scale]of [[true,2.175],[false,2.2475]]){
    const goal=new THREE.Vector3(portrait?22.1:22.8,0,portrait?-1.5:-.6),yaw=portrait?-.32:-.08;
    const track=createArrivalTrack({species:'brachiosaurus',goal,finalYaw:yaw,bounds:bronto.bounds,scale,cameras:[],terrainHeight:groundHeight});
    for(let frame=0;frame<=24;frame++){
      const sample=track.sample(track.duration*frame/24);bronto.group.position.copy(sample.position);bronto.group.rotation.y=sample.heading;bronto.group.scale.setScalar(scale);
      bronto.update(frame*.7,{walking:sample.walking});bronto.group.updateMatrixWorld(true);
      const envelope=bronto.bounds.clone().applyMatrix4(bronto.group.matrixWorld).expandByScalar(.35);
      bronto.group.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){
        mesh.getVertexPosition(i,point);mesh.localToWorld(point);assert.ok(envelope.containsPoint(point),'Animated skin fits the protected model envelope');
      }});
    }
  }
});

test('real travel and question camera entrances stay inside the cleared responsive approach envelope',()=>{
  const cameraPlan=helper('cameraPlan',['viewport','view','mosi','station','actorTarget','cameraDesired','cameraTarget','arrival','camera','smooth','applyViewportFraming','FIRST_FOREST_LAYOUT','groundHeight']);
  for(const[width,height]of [[320,568],[390,844],[844,390],[1075,803],[1536,864]]){
    const portrait=width/height<.85,scale=portrait?2.175:2.2475,yaw=portrait?-.32:-.08;
    const goal=new THREE.Vector3(portrait?22.1:22.8,0,portrait?-1.5:-.6);
    mosi.group.position.set(portrait?29.1:31.2,0,portrait?1.4:2);
    const camera=new THREE.PerspectiveCamera(43,width/height,.2,170);
    const fixture={viewport:{width,height,portrait},view:{mode:'travel',species:'brachiosaurus',biome:'forest'},mosi,station:25,actorTarget:new THREE.Vector3(),cameraDesired:new THREE.Vector3(),cameraTarget:new THREE.Vector3(),arrival:null,camera,smooth:(a,b,t)=>THREE.MathUtils.smoothstep(t,a,b),applyViewportFraming,FIRST_FOREST_LAYOUT,groundHeight};
    const cameras=[];
    for(const mode of ['travel','arrival']){fixture.view.mode=mode;cameraPlan(THREE,fixture,[]);camera.position.copy(fixture.cameraDesired);camera.lookAt(fixture.cameraTarget);camera.updateMatrixWorld(true);cameras.push(camera.clone());}
    const actual=createArrivalTrack({species:'brachiosaurus',goal,finalYaw:yaw,bounds:bronto.bounds,scale,cameras,terrainHeight:groundHeight});
    assert.equal(actual.startsOutsideView,true);
    for(let frame=0;frame<=64;frame++){
      const sample=actual.sample(actual.duration*frame/64);
      const matrix=new THREE.Matrix4().compose(sample.position,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sample.heading),new THREE.Vector3(scale,scale,scale));
      const body=bronto.bounds.clone().applyMatrix4(matrix).expandByScalar(.349);
      assert.ok(sweeps.some(box=>box.containsBox(body)),`${width}×${height} actual frame${frame} must stay within a protected route`);
    }
  }
});
