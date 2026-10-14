/** Offline geometry review; complements actual browser frames, never replaces them.
 * Run: node scripts/inspect-search-world.mjs
 * Texture images are omitted, so leaf ray hits are conservative alpha-card hits.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {populateEnvironment} from '../dist/environment-assets.js';
import {FIRST_FOREST_LAYOUT,forestEntryVegetation,forestFloorVegetation,firstForestSweeps,protectFirstForestPassage,createArrivalTrack} from '../dist/arrival-staging.js';
import {createDinosaur,preloadDinosaurAssets} from '../dist/dinosaurs.js';
import {createWorldDiscoveries} from '../dist/world-discoveries.js';
import {createCinematicRides,rideAttentionTarget,explorationViewTarget} from '../dist/cinematic-rides.js';
import {applyViewportFraming} from '../dist/camera-framing.js';
import {CANOPY_HUNT,GROUND_HUNTS} from '../dist/hunt-layouts.js';

const startedAt=performance.now();
const source=await readFile(new URL('../dist/world.js',import.meta.url),'utf8');
const hashes={};for(const file of ['world.js','world-discoveries.js','cinematic-rides.js','hunt-layouts.js'])hashes[file]=createHash('sha256').update(await readFile(new URL(`../dist/${file}`,import.meta.url))).digest('hex');
const v=(...args)=>new THREE.Vector3(...args),smooth=THREE.MathUtils.smoothstep;
function helper(name,keys){
  const start=source.indexOf(`  function ${name}(`);assert.ok(start>=0,`Missing ${name}`);
  const body=source.indexOf('{',start);let depth=1,end=body+1;
  for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
  return new Function('THREE','fixture','args',`const {${keys.join(',')}}=fixture;${source.slice(start,end)}return ${name}(...args)`);
}
const route=Object.fromEntries([...source.matchAll(/const route = (\{[^}]+\})/g)].map(match=>Object.entries(new Function(`return (${match[1]})`)())).flat());
const pathZ=x=>4.8+Math.sin(x*.073)*1.7,lakeShape=(x,z)=>Math.hypot((x-64)/17,(z+10)/11);
const worldSmooth=(a,b,x)=>smooth(x,a,b),ground=helper('groundHeight',['smooth','mix','lakeShape','pathZ']);
const groundHeight=(x,z)=>ground(THREE,{smooth:worldSmooth,mix:THREE.MathUtils.lerp,lakeShape,pathZ},[x,z]);
const clearing=helper('isClearing',['route']),isClearing=(x,z)=>clearing(THREE,{route},[x,z]);
const rng=helper('seedRandom',[])(THREE,{},[219]);
const environmentManifest=JSON.parse(await readFile(new URL('../dist/assets/environment/manifest.json',import.meta.url),'utf8'));
const models=new Map(),loader=new GLTFLoader();
globalThis.ProgressEvent??=class{constructor(type,options){Object.assign(this,options)}};

async function geometryOnlyGLB(file){
  const bytes=await readFile(file),jsonSize=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+jsonSize).toString('utf8'));
  const binOffset=20+jsonSize,bin=bytes.subarray(binOffset+8,binOffset+8+bytes.readUInt32LE(binOffset));
  json.buffers[0].uri=`data:application/octet-stream;base64,${bin.toString('base64')}`;
  for(const material of json.materials||[]){
    for(const key of Object.keys(material))if(/Texture$/.test(key))delete material[key];
    for(const key of Object.keys(material.pbrMetallicRoughness||{}))if(/Texture$/.test(key))delete material.pbrMetallicRoughness[key];
    delete material.extensions;
  }
  delete json.images;delete json.textures;delete json.samplers;
  return loader.parseAsync(JSON.stringify(json),'');
}
for(const entry of environmentManifest.models){
  const gltf=await geometryOnlyGLB(new URL(`../dist/assets/environment/${entry.file}`,import.meta.url));
  gltf.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(v()),center=box.getCenter(v());
  const normalization=new THREE.Matrix4().makeScale(1/size.y,1/size.y,1/size.y).multiply(new THREE.Matrix4().makeTranslation(-center.x,-box.min.y,-center.z));
  const parts=[];gltf.scene.traverse(object=>{if(!object.isMesh)return;const geometry=object.geometry.clone().applyMatrix4(normalization.clone().multiply(object.matrixWorld));const materials=(Array.isArray(object.material)?object.material:[object.material]).map(material=>{material.side=THREE.DoubleSide;return material;});parts.push({geometry,material:materials.length===1?materials[0]:materials});});
  models.set(entry.id,{...entry,parts});
}
const fetchBefore=globalThis.fetch,progressBefore=globalThis.ProgressEvent;
globalThis.ProgressEvent=class{constructor(type,options){Object.assign(this,options)}};
globalThis.fetch=async input=>{const url=typeof input==='string'?input:input.url;if(!url.startsWith('file:'))return fetchBefore(input);const bytes=await readFile(fileURLToPath(url));return new Response(bytes,{headers:{'content-length':String(bytes.length)}});};
assert.deepEqual((await preloadDinosaurAssets()).missing,[]);globalThis.fetch=fetchBefore;globalThis.ProgressEvent=progressBefore;
const stego=createDinosaur('stegosaurus'),mosi=createDinosaur('triceratops',{rider:true});
const assetsLoadedAt=performance.now();
const scene=new THREE.Scene(),dummy=new THREE.Object3D();
const summary=populateEnvironment(scene,{models},{rng,groundHeight,lakeShape,pathZ,isClearing,streamedBatches:[],windUniform:{value:0}});
function instances(model,transforms,name,tagged=true){
  for(const part of model?.parts||[]){const mesh=new THREE.InstancedMesh(part.geometry,part.material,transforms.length);mesh.name=name;if(tagged)mesh.userData.forestModel=model.id;
    transforms.forEach((t,i)=>{dummy.position.set(...t.p);dummy.rotation.set(...(t.r||[0,0,0]));dummy.scale.set(...t.s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});scene.add(mesh);}
}
const vegetation=forestEntryVegetation(groundHeight),entryTree=[...models.values()].find(model=>model.kind==='tree'),entryBush=[...models.values()].find(model=>model.kind==='bush');
instances(entryTree,vegetation.trees,'authored-forest-entries');instances(entryTree,vegetation.canopy,'authored-canopy-stand');instances(entryBush,vegetation.bushes,'authored-forest-bushes');
const ferns=[12,25,37].flatMap(x=>[0,1.7,3.5].map(offset=>{const z=x===37?-9.8:-3.2;return{p:[x-12+offset,groundHeight(x-12+offset,z),z],s:[1.2,1.2,1.2],r:[0,offset,0]};}));
instances(models.get('fern'),ferns,'',false);
const floorVegetation=forestFloorVegetation(groundHeight);
for(const[id,transforms]of Object.entries(floorVegetation))instances(models.get(id),transforms,`authored-forest-floor:${id}`);
const sweeps=firstForestSweeps({stegoBounds:stego.bounds,mosiBounds:mosi.bounds,terrainHeight:groundHeight});
const clearanceStartedAt=performance.now();
const clearance=protectFirstForestPassage(scene,models,sweeps,groundHeight);
const clearanceFinishedAt=performance.now();
clearance.elapsedMs=clearanceFinishedAt-clearanceStartedAt;
const environmentObjects=[];scene.traverse(object=>{if(object.isMesh)environmentObjects.push(object);});

function habitatAsset({kind,height=1,variant=0}){
  const candidates=kind==='rock'?[...models.values()].filter(model=>model.kind==='rock').sort((a,b)=>a.id.localeCompare(b.id)):[models.get(kind)].filter(Boolean);
  if(!candidates.length)return null;const model=candidates[((variant%candidates.length)+candidates.length)%candidates.length];
  const group=new THREE.Group();group.scale.setScalar(height);group.userData.sharedHabitatAsset=true;
  for(const part of model.parts){const mesh=new THREE.Mesh(part.geometry,part.material);mesh.name=`habitat:${model.id}`;group.add(mesh);}return group;
}

function habitatTree({height=8}){const model=models.get('tree-common-3'),group=new THREE.Group();group.name='Imported living discovery tree';group.scale.setScalar(height);for(const part of model.parts){const mesh=new THREE.Mesh(part.geometry,part.material);mesh.name=`habitat:${model.id}`;group.add(mesh);}return group;}
const constants=name=>new Function(`return (${source.match(new RegExp(`const ${name} = (\\{[^}]+\\})`))[1]})`)();
const adultScale=constants('adultScale'),landscapeScale=constants('landscapeScale');
const encounterPose=helper('encounterPose',['route','viewport','adultScale','landscapeScale','FIRST_FOREST_LAYOUT','groundHeight']);
const raycaster=new THREE.Raycaster(),matrix=new THREE.Matrix4();
function isVisible(object){if(object.material?.visible===false)return false;for(let node=object;node;node=node.parent){if(!node.visible)return false;}return true;}
function avatarPart(object){for(let node=object;node;node=node.parent)if(node.name==='Little Icelandic explorer')return true;return false;}
function ancestry(object){const result=[];for(let node=object;node&&node!==scene;node=node.parent)result.push({name:node.name,position:node.getWorldPosition(v()).toArray()});return result;}
function objectBox(object,instance=0){object.geometry.computeBoundingBox();if(object.isInstancedMesh){object.getMatrixAt(instance,matrix);matrix.premultiply(object.matrixWorld);}else matrix.copy(object.matrixWorld);return object.geometry.boundingBox.clone().applyMatrix4(matrix);}
function itemGroup(id){let result=null;scene.traverse(node=>{if(node.children.some(child=>child.userData.discovery===id))result=node;});return result;}
function inGroup(object,group){for(let node=object;node;node=node.parent)if(node===group)return true;return false;}
function rayReport(camera,point,ownGroup){
  const distance=camera.position.distanceTo(point);raycaster.set(camera.position,point.clone().sub(camera.position).normalize());raycaster.far=Math.max(0,distance-.06);
  const candidates=[];scene.traverse(object=>{if(object.isMesh&&isVisible(object)&&!avatarPart(object)&&!object.userData.discovery&&!inGroup(object,ownGroup))candidates.push(object);});
  return raycaster.intersectObjects(candidates,false).slice(0,8).map(hit=>({name:hit.object.name,instance:hit.instanceId??null,distance:hit.distance,material:(Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material)?.name||'',point:hit.point.toArray(),ancestry:ancestry(hit.object)}));
}
function eyeReport(camera){
  const envelope=new THREE.Box3().setFromCenterAndSize(camera.position,v(.36,.36,.36)),hits=[];
  scene.traverse(object=>{if(!object.isMesh||!isVisible(object)||avatarPart(object)||object.userData.discovery||object.isSkinnedMesh)return;for(let i=0;i<(object.isInstancedMesh?object.count:1);i++){const box=objectBox(object,i);if(box.intersectsBox(envelope))hits.push({name:object.name,instance:object.isInstancedMesh?i:null,material:(Array.isArray(object.material)?object.material[0]:object.material)?.name||'',min:box.min.toArray(),max:box.max.toArray(),ancestry:ancestry(object)});}});return hits;
}
const rows=[],flightLoops=[],fishPanViews=[];
for(const species of ['trex','spinosaurus','parasaurolophus','brachiosaurus','pteranodon'])for(const[width,height]of [[320,568],[844,390],[1024,768]]){
  const viewport={width,height,portrait:width/height<.85},animal=createDinosaur(species),rideKind=species==='brachiosaurus'?'canopy':species==='pteranodon'?'flight':null;
  const pose=encounterPose(THREE,{route,viewport,adultScale,landscapeScale,FIRST_FOREST_LAYOUT,groundHeight},[species,animal]);
  animal.group.position.copy(pose.position);animal.group.rotation.y=pose.yaw;animal.group.scale.setScalar(pose.scale);scene.add(animal.group);
  mosi.group.position.set(route[species]+(viewport.portrait?1.1:6.2),0,viewport.portrait?1.4:2);mosi.group.scale.setScalar(viewport.portrait?(rideKind==='flight'?.65:.5):.85);mosi.group.rotation.y=Math.atan2(-(pose.position.z-mosi.group.position.z),pose.position.x-mosi.group.position.x);scene.add(mosi.group);scene.updateMatrixWorld(true);
  const rides=createCinematicRides({scene,mosi}),discoveries=createWorldDiscoveries({scene,groundHeight,createHabitatTree:habitatTree,createHabitatAsset:habitatAsset});
  discoveries.setActivity({species});if(rideKind)rides.start({species,animal,restingPose:pose});
  const camera=new THREE.PerspectiveCamera(viewport.portrait?47:40,width/height,.2,170);applyViewportFraming(camera,viewport,{baseFov:viewport.portrait?47:40});
  let frameState=null,context=null,groundPlan=null,frameNumber=0;
  function advance(count){for(let frame=0;frame<count;frame++){
    const time=frameNumber++/60;animal.group.position.copy(pose.position);animal.group.rotation.y=pose.yaw;
    animal.group.scale.lerp(v(pose.scale,pose.scale,pose.scale),1-Math.exp(-2.5/60));
    const mosiScale=viewport.portrait?(rideKind==='flight'?.65:.5):.85;mosi.group.scale.lerp(v(mosiScale,mosiScale,mosiScale),1-Math.exp(-2.5/60));
    mosi.update(time,{});animal.update(time,{look:.5,gazeHeight:-.15,...rides.animationState()});
    applyViewportFraming(camera,viewport,{baseFov:viewport.portrait?47:40});
    groundPlan=discoveries.cameraPlan(camera,viewport,route[species],rides.getContext());
    frameState=rides.update(time,1/60,{viewport,baselineCamera:v(20,8,20),baselineTarget:pose.position.clone(),baseFov:camera.fov,restingPose:pose});context=frameState?.context||null;
    if(frameState?.camera){camera.clearViewOffset();camera.fov=frameState.camera.fov;camera.updateProjectionMatrix();camera.position.copy(frameState.camera.position);camera.lookAt(frameState.camera.target);}else if(groundPlan){camera.position.copy(groundPlan.position);camera.lookAt(groundPlan.target);}
    camera.updateMatrixWorld(true);discoveries.update(time,1/60,camera,viewport,context);
  }}
  advance(rideKind?1440:120);
  function record(stage){
  scene.updateMatrixWorld(true);
  const items=discoveries.getScreenPositions(),sightlines=items.map(item=>{
    const group=itemGroup(item.id);if(!group)return{id:item.id,missing:true};
    const box=new THREE.Box3();group.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.visible!==false&&!mesh.userData.discovery)box.union(new THREE.Box3().setFromObject(mesh));});
    const center=box.getCenter(v());let leafSurface=null;
    if(item.kind==='leaf'&&context?.kind==='canopy'){
      const leaf=group.getObjectByName('One living leaf among its neighbours'),points=[];
      leaf?.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i++)points.push(v().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld));});
      const aimed=camera.clone();aimed.lookAt(rideAttentionTarget(camera.position,frameState.camera.target,center,'canopy'));aimed.updateMatrixWorld(true);
      const pixelBox=new THREE.Box2();for(const point of points){const p=point.clone().project(aimed);pixelBox.expandByPoint(new THREE.Vector2((p.x+1)*width/2,(1-p.y)*height/2));}
      const sampled=points.filter((_,i)=>i%Math.max(1,Math.floor(points.length/20))===0).slice(0,20),blocked=sampled.filter(point=>rayReport(camera,point,group).length);
      leafSurface={hintedPixelBounds:{min:pixelBox.min.toArray(),max:pixelBox.max.toArray()},sampledRays:sampled.length,blockedRays:blocked.length};
    }
    return{id:item.id,visible:item.visible,center:center.toArray(),min:box.min.toArray(),max:box.max.toArray(),lakeShape:lakeShape(center.x,center.z),groundY:groundHeight(center.x,center.z),hits:rayReport(camera,center,group),leafSurface};
  });
  rows.push({species,viewport:{...viewport},stage,phase:rides.getState().phase,camera:camera.position.toArray(),canopyAnchor:context?.canopyAnchor?.toArray(),eyeCandidates:eyeReport(camera),items,sightlines});
  }
  record('search');
  if(species==='spinosaurus'){
    const head=animal.bone('Head'),headPoints=[];
    animal.group.traverse(mesh=>{
      if(!mesh.isMesh||!isVisible(mesh))return;
      if(mesh.isSkinnedMesh)mesh.skeleton.update();
      const positions=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
      for(let i=0;i<positions.count;i++){
        let belongs=inGroup(mesh,head);
        if(indices&&weights){let influence=0;for(let j=0;j<4;j++)if(inGroup(mesh.skeleton.bones[indices.array[i*4+j]],head))influence+=weights.array[i*4+j];belongs=influence>.4;}
        if(belongs){const point=v();mesh.getVertexPosition(i,point);headPoints.push(point.applyMatrix4(mesh.matrixWorld));}
      }
    });
    for(const yaw of [-GROUND_HUNTS.spinosaurus.maxYaw,0,GROUND_HUNTS.spinosaurus.maxYaw]){
      for(let i=0;i<30;i++){const plan=discoveries.cameraPlan(camera,viewport,route[species],null);camera.position.copy(plan.position);camera.lookAt(explorationViewTarget(plan.position,plan.target,yaw,0));camera.updateMatrixWorld(true);}
      const visible=headPoints.filter(point=>{const clip=point.clone().project(camera);return Math.abs(clip.x)<=1&&Math.abs(clip.y)<=1&&Math.abs(clip.z)<=1;});
      fishPanViews.push({viewport,yaw,headVertices:headPoints.length,headVerticesInFrustum:visible.length});
    }
  }
  function sampleFlightLoop(scenario='fresh start'){
    const samples=[];
    for(let step=0;step<96;step++){
      advance(30);scene.updateMatrixWorld(true);
      const winds=discoveries.getScreenPositions().filter(item=>!item.secret);
      samples.push({phase:context.loopPhase,eligible:winds.filter(item=>item.visible).map(item=>item.id),readable:winds.filter(item=>item.visible&&item.screen.y*viewport.height>125&&item.screen.y*viewport.height<viewport.height-100).map(item=>item.id),targets:winds.map(item=>({id:item.id,x:item.screen.x*viewport.width,y:item.screen.y*viewport.height,visible:item.visible}))});
    }
    const eligibleMax=Math.max(...samples.map(sample=>sample.eligible.length)),windows={};
    for(const id of ['windring-1','windring-2','windring-3'])windows[id]={eligibleSeconds:samples.filter(sample=>sample.eligible.includes(id)).length*.5,clearUiSeconds:samples.filter(sample=>sample.readable.includes(id)).length*.5};
    flightLoops.push({viewport:{...viewport},scenario,sampledSeconds:48,sampleIntervalSeconds:.5,eligibleMax,windows,samples});
    assert.ok(eligibleMax<=1,`Winds cluster at ${width}x${height}`);
    for(const[id,window]of Object.entries(windows))assert.ok(window.clearUiSeconds>=2,`${id} has no readable pass at ${width}x${height}`);
  }
  if(rideKind==='flight'){
    sampleFlightLoop();
    if(width===1024){
      Object.assign(viewport,{width:390,height:844,portrait:true});camera.aspect=390/844;camera.updateProjectionMatrix();
      Object.assign(pose,encounterPose(THREE,{route,viewport,adultScale,landscapeScale,FIRST_FOREST_LAYOUT,groundHeight},[species,animal]));
      sampleFlightLoop('tablet-started ride rotated to390x844');
    }
  }
  if(rideKind){rides.finish();advance(1260);record('returned-ground');}
  rides.dispose();discoveries.dispose();animal.group.removeFromParent();animal.dispose();mosi.group.removeFromParent();
}
const report={generated:new Date().toISOString(),hashes,rows,flightLoops,limits:['Geometry only: leaf alpha cards are treated as solid for rays.','Bounds around camera are conservative candidates, not proven camera/triangle contact.','Flight eligibility is sampled every half second through a complete 48-second loop; visibility of very distant translucent wisps requires actual browser review.','Ground heights use the shipped smooth helper; tessellation and water transparency require browser review.','Target-center rays are necessary visibility checks, not full-silhouette guarantees.']};
report.fishPanViews=fishPanViews;
await writeFile(new URL('../qa/search-world-geometry.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(rows.map(row=>({species:row.species,size:`${row.viewport.width}x${row.viewport.height}`,eyeCandidates:row.eyeCandidates.length,initialMain:row.items.filter(item=>item.visible&&!item.secret).map(item=>item.id),blocked:row.sightlines.filter(item=>item.hits?.length).map(item=>({id:item.id,hits:item.hits.slice(0,2)}))})),null,2));
stego.dispose();mosi.dispose();

