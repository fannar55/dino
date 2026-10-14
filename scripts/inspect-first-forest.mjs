/** Offline geometry review; complements actual browser frames, never replaces them.
 * Run: node scripts/inspect-first-forest.mjs
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

const startedAt=performance.now();
const source=await readFile(new URL('../dist/world.js',import.meta.url),'utf8');
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
const discovery=createWorldDiscoveries({scene,groundHeight,createHabitatAsset:habitatAsset});
discovery.setActivity({species:'stegosaurus'});
const camera=new THREE.PerspectiveCamera(40,1075/707,.2,170),viewport={width:1075,height:707,portrait:false};
for(let frame=0;frame<120;frame++){const plan=discovery.cameraPlan(camera,viewport,12);if(plan){camera.position.copy(plan.position);camera.lookAt(plan.target);}camera.updateMatrixWorld(true);discovery.update(frame/60,1/60,camera,viewport);}
scene.updateMatrixWorld(true);
const constructionFinishedAt=performance.now();
function discoveryGroup(id){let group;scene.traverse(o=>{if(o.children.some(child=>child.userData.discovery===id))group=o;});return group;}
const targets=['fossil-1','fossil-2','fossil-3','snail'].map(id=>{const group=discoveryGroup(id);assert.ok(group,id);const box=new THREE.Box3();group.traverse(mesh=>{if(!mesh.isMesh||mesh.material?.visible===false||mesh.userData.discovery)return;box.union(new THREE.Box3().setFromObject(mesh));});return{id,group,box,center:box.getCenter(v())};});
const raycaster=new THREE.Raycaster();
function visibleMaterial(hit){const mat=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material;return mat?.visible!==false;}
function materialName(hit){const mat=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material;return mat?.name||'';}
const sightlines=[];
for(const target of targets){
  const origin=v(...FIRST_FOREST_LAYOUT.searchCamera),distance=origin.distanceTo(target.center);raycaster.set(origin,target.center.clone().sub(origin).normalize());raycaster.far=distance-.08;
  const hits=raycaster.intersectObjects(environmentObjects,false).filter(visibleMaterial);
  sightlines.push({id:target.id,center:target.center.toArray(),distance,hits:hits.slice(0,8).map(hit=>({name:hit.object.name,instance:hit.instanceId,distance:hit.distance,material:materialName(hit),point:hit.point.toArray()}))});
}
// Independent transformed instance bounds around the fixed search camera. This
// includes whole crowns, unlike the low woody passage reservation.
const cameraEnvelope=new THREE.Box3().setFromCenterAndSize(v(...FIRST_FOREST_LAYOUT.searchCamera),v(.5,.5,.5)),cameraIntersections=[];
const matrix=new THREE.Matrix4(),point=v();
for(const mesh of environmentObjects){
  for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
    if(mesh.isInstancedMesh){mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);}else matrix.copy(mesh.matrixWorld);
    mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
    if(box.intersectsBox(cameraEnvelope))cameraIntersections.push({name:mesh.name,instance:i,min:box.min.toArray(),max:box.max.toArray()});
  }
}
const actualSkinOverlap=[],skinSamples=[];let maxSkinEscape=0;
const track=createArrivalTrack({species:'stegosaurus',goal:v(FIRST_FOREST_LAYOUT.animal[0],groundHeight(...FIRST_FOREST_LAYOUT.animal),FIRST_FOREST_LAYOUT.animal[1]),finalYaw:FIRST_FOREST_LAYOUT.animalYaw,bounds:stego.bounds,scale:2.55,cameras:[],terrainHeight:groundHeight});
for(let frame=0;frame<=180;frame++){
  const time=track.duration*frame/180,sample=track.sample(time);stego.group.position.copy(sample.position);stego.group.rotation.y=sample.heading;stego.group.scale.setScalar(2.55);stego.update(time,{walking:sample.walking,look:sample.look,walkSpeed:1});stego.group.updateMatrixWorld(true);
  const skinBox=new THREE.Box3();stego.group.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;if(mesh.isSkinnedMesh)mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point);mesh.localToWorld(point);skinBox.expandByPoint(point);}});
  const nominal=stego.bounds.clone().applyMatrix4(stego.group.matrixWorld).expandByScalar(.48);
  skinSamples.push({time,box:skinBox.clone()});
  maxSkinEscape=Math.max(maxSkinEscape,...['x','y','z'].map(axis=>Math.max(nominal.min[axis]-skinBox.min[axis],skinBox.max[axis]-nominal.max[axis])));
  for(const solid of clearance.solids)if(skinBox.intersectsBox(new THREE.Box3(v(...solid.min),v(...solid.max))))actualSkinOverlap.push({time,id:solid.id,kind:solid.kind,min:solid.min,max:solid.max});
}
// Crowns are excluded from the protective woody bounds, so independently test
// their actual leaf-card triangles against sampled animated animal bounds.
// These are conservative candidates, not proven skin/leaf intersections.
const crownCandidates=[],triangleBox=new THREE.Box3(),a=v(),b=v(),c=v();
for(const mesh of environmentObjects){
  const id=mesh.userData.forestModel||mesh.name.match(/^environment:([^:]+):/)?.[1];if(models.get(id)?.kind!=='tree')continue;
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(!mats.some(mat=>/leaves|grass/i.test(mat.name)))continue;
  const position=mesh.geometry.attributes.position,index=mesh.geometry.index;
  for(let instance=0;instance<(mesh.isInstancedMesh?mesh.count:1);instance++){
    if(mesh.isInstancedMesh){mesh.getMatrixAt(instance,matrix);matrix.premultiply(mesh.matrixWorld);}else matrix.copy(mesh.matrixWorld);
    mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix),nearSamples=skinSamples.filter(sample=>sample.box.intersectsBox(box));if(!nearSamples.length)continue;
    let touched=0,first=null,last=null,triangleCandidates=0;
    for(const sample of nearSamples){let count=0;
      for(let triangle=0;triangle<(index?index.count:position.count);triangle+=3){
        if(mats.length>1){const group=mesh.geometry.groups.find(group=>triangle>=group.start&&triangle<group.start+group.count);if(group&&!/leaves|grass/i.test(mats[group.materialIndex].name))continue;}
        a.fromBufferAttribute(position,index?index.getX(triangle):triangle).applyMatrix4(matrix);b.fromBufferAttribute(position,index?index.getX(triangle+1):triangle+1).applyMatrix4(matrix);c.fromBufferAttribute(position,index?index.getX(triangle+2):triangle+2).applyMatrix4(matrix);
        triangleBox.setFromPoints([a,b,c]);if(sample.box.intersectsBox(triangleBox))count++;
      }
      if(count){touched++;first??=sample.time;last=sample.time;triangleCandidates+=count;}
    }
    if(touched)crownCandidates.push({name:mesh.name,id,instance,first,last,samples:touched,triangleCandidates,min:box.min.toArray(),max:box.max.toArray()});
  }
}
const discoverySolidOverlaps=[];
for(const target of targets){for(const sweep of sweeps)if(target.box.intersectsBox(sweep)){discoverySolidOverlaps.push({id:target.id,sweep:sweep.userData?.label});break;}}
const discoverySceneryOverlaps=[],discoveryMeshBounds=[];
scene.traverse(mesh=>{
  if(!mesh.isMesh||environmentObjects.includes(mesh)||mesh.material?.visible===false||mesh.userData.discovery)return;
  for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
    if(mesh.isInstancedMesh){mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);}else matrix.copy(mesh.matrixWorld);
    mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
    discoveryMeshBounds.push({name:mesh.name,box:box.clone()});
    const sweep=sweeps.find(s=>s.intersectsBox(box));if(sweep)discoverySceneryOverlaps.push({name:mesh.name,instance:i,sweep:sweep.userData?.label,min:box.min.toArray(),max:box.max.toArray()});
  }
});
const dampedDepartureOverlaps=[],departureMatrix=new THREE.Matrix4(),departureQ=new THREE.Quaternion();
for(const[destination,label]of [[v(31.2,0,2),'landscape'],[v(26.1,0,1.4),'portrait']])for(let frame=0;frame<=120;frame++){
  const time=8*frame/120,position=v(FIRST_FOREST_LAYOUT.mosi[0],groundHeight(...FIRST_FOREST_LAYOUT.mosi),FIRST_FOREST_LAYOUT.mosi[1]).lerp(destination,1-Math.exp(-.9*time));
  const yaw=1.91+(-.08-1.91)*(1-Math.exp(-1.35*time));
  departureMatrix.compose(position,departureQ.setFromAxisAngle(v(0,1,0),yaw),v(.85,.85,.85));
  const unexpanded=mosi.bounds.clone().applyMatrix4(departureMatrix),bounds=unexpanded.clone().expandByScalar(.48);
  const actualScale=label==='portrait'?.5:.85;departureMatrix.compose(position,departureQ,v(actualScale,actualScale,actualScale));const actualScaleBounds=mosi.bounds.clone().applyMatrix4(departureMatrix).expandByScalar(.48);
  for(const solid of clearance.solids){const solidBox=new THREE.Box3(v(...solid.min),v(...solid.max));if(bounds.intersectsBox(solidBox))dampedDepartureOverlaps.push({label,time,kind:solid.kind,id:solid.id,solidMin:solid.min,solidMax:solid.max,unexpandedOverlap:unexpanded.intersectsBox(solidBox),actualScaleWithMarginOverlap:actualScaleBounds.intersectsBox(solidBox)});}
  for(const prop of discoveryMeshBounds)if(bounds.intersectsBox(prop.box))dampedDepartureOverlaps.push({label,time,kind:'discovery',name:prop.name});
}
const sourceHashes={};for(const file of ['world.js','arrival-staging.js','environment-assets.js','world-discoveries.js'])sourceHashes[file]=createHash('sha256').update(await readFile(new URL(`../dist/${file}`,import.meta.url))).digest('hex');
const movedDistribution={count:clearance.moved.length,byModel:{},fromXZ:{min:[Infinity,Infinity],max:[-Infinity,-Infinity]},toXZ:{min:[Infinity,Infinity],max:[-Infinity,-Infinity]},moveDistance:{min:Infinity,max:0,total:0},allReservedSolidBounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}};
for(const item of clearance.moved){movedDistribution.byModel[item.id]=(movedDistribution.byModel[item.id]||0)+1;for(let axis=0;axis<2;axis++){movedDistribution.fromXZ.min[axis]=Math.min(movedDistribution.fromXZ.min[axis],item.from[axis]);movedDistribution.fromXZ.max[axis]=Math.max(movedDistribution.fromXZ.max[axis],item.from[axis]);movedDistribution.toXZ.min[axis]=Math.min(movedDistribution.toXZ.min[axis],item.to[axis]);movedDistribution.toXZ.max[axis]=Math.max(movedDistribution.toXZ.max[axis],item.to[axis]);}const distance=Math.hypot(item.to[0]-item.from[0],item.to[1]-item.from[1]);movedDistribution.moveDistance.min=Math.min(movedDistribution.moveDistance.min,distance);movedDistribution.moveDistance.max=Math.max(movedDistribution.moveDistance.max,distance);movedDistribution.moveDistance.total+=distance;}
for(const item of clearance.solids)for(let axis=0;axis<3;axis++){movedDistribution.allReservedSolidBounds.min[axis]=Math.min(movedDistribution.allReservedSolidBounds.min[axis],item.min[axis]);movedDistribution.allReservedSolidBounds.max[axis]=Math.max(movedDistribution.allReservedSolidBounds.max[axis],item.max[axis]);}
const nearbyMovedDestinations=[];for(let a=0;a<clearance.moved.length;a++)for(let b=a+1;b<clearance.moved.length;b++){const p=clearance.moved[a],q=clearance.moved[b],distance=Math.hypot(p.to[0]-q.to[0],p.to[1]-q.to[1]);if(distance<1.2)nearbyMovedDestinations.push({a:p.id,aXZ:p.to,b:q.id,bXZ:q.to,distance});}movedDistribution.nearbyMovedDestinations=nearbyMovedDestinations;
const timingMs={assetLoad:assetsLoadedAt-startedAt,forestAndDiscoveriesConstruction:constructionFinishedAt-assetsLoadedAt,clearance:clearanceFinishedAt-clearanceStartedAt,totalUntilConstruction:constructionFinishedAt-startedAt,totalIncludingChecks:performance.now()-startedAt};
const report={generated:new Date().toISOString(),sourceHashes,method:'Shipped normalized GLB geometry, seed219, manifest ordering, actual pure world terrain helpers, exported authored vegetation, real articulated Stego clips; no browser or GPU renderer.',timingMs,summary,movedDistribution,layout:FIRST_FOREST_LAYOUT,vegetationKeys:Object.keys(vegetation),floorVegetationCounts:Object.fromEntries(Object.entries(floorVegetation).map(([id,transforms])=>[id,transforms.length])),clearance,actualSkin:{samples:181,maximumEscapeBeyondReservedBounds:maxSkinEscape,overlaps:actualSkinOverlap},crownReview:{method:'Leaf-card triangle AABBs versus actual animated whole-animal bounds; conservative candidates require rendered or exact triangle inspection.',candidates:crownCandidates},dampedMosiDeparture:{samples:242,duration:8,scale:.85,margin:.48,positionDamping:.9,yawDamping:1.35,overlaps:dampedDepartureOverlaps},discoverySolidOverlaps,discoverySceneryOverlaps,cameraIntersections,sightlines,limits:['Timing is desktop Node CPU execution with textures omitted, not browser startup or mobile performance.','Leaf alpha images omitted: foliage-ray hits conservatively include transparent areas of leaf cards.','Ray to center establishes a necessary sightline, not whole-object visibility.','Collision AABBs are conservative; any overlap requires closer triangle/visual investigation.','Mosi movement uses the reserved full model bounds rather than sampled rider/limb animation.','Remote flight forest and tiny procedural trail pebbles are outside this first-forest fixture.','No device performance or animation-camera sweep is measured by this script.','Actual browser frames remain required, especially camera transitions.']};
await mkdir(new URL('../qa/',import.meta.url),{recursive:true});await writeFile(new URL('../qa/first-forest-clearance.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({reservedOverlaps:clearance.overlaps,moved:clearance.moved.length,skinOverlaps:actualSkinOverlap.length,skinEscape:maxSkinEscape,crownCandidates:crownCandidates.length,dampedMosiDepartureOverlaps:dampedDepartureOverlaps.length,discoveryOverlaps:discoverySolidOverlaps.length,sceneryOverlaps:discoverySceneryOverlaps.length,cameraIntersections:cameraIntersections.length,sightlineHits:sightlines.map(row=>[row.id,row.hits.length])},null,2));
discovery.dispose();stego.dispose();mosi.dispose();
