/**
 * Reproducible presentation regression: node scripts/inspect-arrival-camera.mjs
 *
 * Loads the shipped GLBs with the game's Three.js loader, evaluates their real
 * skin vertices at 60 Hz, and checks the actual world camera/entrance functions.
 * Fast transport must be outside the viewport; first visible motion must be a
 * deliberate walk. No foliage is counted as hiding an animal.
 *
 * Limits: starts from a settled travel camera with Mosi at his route station;
 * checks 320x568, 390x844, 844x390 and wide 1536x864 viewports, no mid-shot rotation;
 * includes GLB skins but not runtime eye accessories; uses the smooth terrain
 * height function rather than the tessellated ground mesh. It complements,
 * rather than replaces, actual browser captures and device performance checks.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
import { createArrivalTrack, FIRST_FOREST_LAYOUT } from '../dist/arrival-staging.js';
import { applyViewportFraming } from '../dist/camera-framing.js';

const source = await readFile(new URL('../dist/world.js', import.meta.url), 'utf8');
const loaderSource = await readFile(new URL('../dist/dinosaur-assets.js', import.meta.url), 'utf8');
const speciesList = ['stegosaurus', 'brachiosaurus', 'trex', 'spinosaurus', 'parasaurolophus'];
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

// Evaluate only named, checked-in pure helpers, with explicit scene fixtures.
// A changed helper dependency fails loudly rather than silently testing a stale
// copy of camera math. The reviewed source is local repository code.
function helper(name, dependencies) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `Missing world helper ${name}; update this fixture explicitly`);
  const body = source.indexOf('{', start); let depth = 1, end = body + 1;
  for (; end < source.length && depth; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0, `Unbalanced ${name} helper`);
  return new Function('THREE', 'fixture', 'args', `const {${dependencies.join(',')}}=fixture; ${source.slice(start,end)} return ${name}(...args);`);
}
function objectConstant(text, name) {
  const value = text.match(new RegExp(`const ${name} = (\\{[^}]+\\})`))?.[1];
  assert.ok(value, `Missing ${name}; update the fixture explicitly`);
  return new Function(`return (${value});`)();
}
const route = objectConstant(source, 'route');
const adultScale = objectConstant(source, 'adultScale');
const landscapeScale = objectConstant(source, 'landscapeScale');
const strides = objectConstant(loaderSource, 'strideLength');
const cameraPlan = helper('cameraPlan', ['viewport','view','mosi','station','actorTarget','cameraDesired','cameraTarget','arrival','camera','smooth','applyViewportFraming','FIRST_FOREST_LAYOUT','groundHeight']);
const encounterPose = helper('encounterPose', ['route','viewport','adultScale','landscapeScale','FIRST_FOREST_LAYOUT','groundHeight']);
const ground = helper('groundHeight', ['smooth','mix','lakeShape','pathZ']);
const groundFixture = { smooth, mix: THREE.MathUtils.lerp,
  lakeShape: (x,z) => Math.hypot((x-64)/17,(z+10)/11),
  pathZ: x => 4.8+Math.sin(x*.073)*1.7 };
const terrainHeight = (x,z) => Math.max(ground(THREE,groundFixture,[x,z]),-.05);

const results = [];
for (const species of speciesList) for (const [width,height] of [[320,568],[390,844],[844,390],[1536,864]]) {
  const portrait=width/height<.85, viewport={width,height,portrait};
  const bytes = await readFile(new URL(`../dist/assets/dinosaurs/${species}.glb`, import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const root = new THREE.Group(); root.add(asset.scene);
  const meshes = []; root.traverse(object => { if(object.isSkinnedMesh) meshes.push(object); });
  const mixer = new THREE.AnimationMixer(asset.scene);
  const idle = mixer.clipAction(asset.animations.find(clip=>clip.name==='idle')).play();
  const walkClip = asset.animations.find(clip=>clip.name==='walk'); assert.ok(walkClip, `${species} needs its walk clip`);
  const walk = mixer.clipAction(walkClip).play().setEffectiveWeight(0);
  mixer.update(0); root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root,true);
  const camera = new THREE.PerspectiveCamera(portrait?47:40,width/height,.2,170);
  const station = route[species], mosi = {group:{position:new THREE.Vector3(station+(portrait?1.1:6.2),0,portrait?1.4:2)}};
  if(species==='stegosaurus')mosi.group.position.set(FIRST_FOREST_LAYOUT.mosi[0],terrainHeight(...FIRST_FOREST_LAYOUT.mosi),FIRST_FOREST_LAYOUT.mosi[1]);
  const fixture = {viewport,view:{mode:'travel',species,biome:['spinosaurus','parasaurolophus'].includes(species)?'lake':'forest'},
    mosi,station,actorTarget:new THREE.Vector3(),cameraDesired:new THREE.Vector3(),cameraTarget:new THREE.Vector3(),arrival:null,camera,smooth,applyViewportFraming,FIRST_FOREST_LAYOUT,groundHeight:terrainHeight};
  cameraPlan(THREE,fixture,[]); camera.position.copy(fixture.cameraDesired);
  const cameraLook = fixture.cameraTarget.clone(); camera.lookAt(cameraLook); camera.updateMatrixWorld(true);
  const startCamera = camera.clone(); fixture.view.mode='arrival'; cameraPlan(THREE,fixture,[]);
  const endCamera = camera.clone(); endCamera.position.copy(fixture.cameraDesired); endCamera.lookAt(fixture.cameraTarget); endCamera.updateMatrixWorld(true);
  const pose = encounterPose(THREE,{route,viewport:{portrait},adultScale,landscapeScale,FIRST_FOREST_LAYOUT,groundHeight:terrainHeight},[species,{group:{userData:{assetSource:true}}}]);
  const track = createArrivalTrack({species,goal:pose.position,finalYaw:pose.yaw,bounds,scale:pose.scale,cameras:[startCamera,endCamera],terrainHeight});
  fixture.arrival={track,age:0,sample:track.sample(0)};
  let walkingWeight=0, firstVisible=null, maxVisibleSpeed=0;
  const history=[], point=new THREE.Vector3(), matrix=new THREE.Matrix4();
  const dt=1/60, speedLimit=species==='brachiosaurus'?1.2:2.0;
  for(let frame=0;frame<=Math.ceil(track.duration*60);frame++) {
    const age=frame*dt; fixture.arrival.age=Math.max(0,age-dt); fixture.arrival.sample=track.sample(fixture.arrival.age); cameraPlan(THREE,fixture,[]);
    const sample=track.sample(age);
    root.position.copy(sample.position); root.rotation.set(0,sample.heading,0); root.scale.setScalar(pose.scale);
    walkingWeight=THREE.MathUtils.damp(walkingWeight,sample.walking,8,dt);
    idle.setEffectiveWeight(1-walkingWeight); walk.setEffectiveWeight(walkingWeight);
    walk.setEffectiveTimeScale(THREE.MathUtils.clamp(sample.speed/pose.scale/strides[species]*walkClip.duration,.05,12));
    mixer.update(dt); root.updateMatrixWorld(true); meshes.forEach(mesh=>mesh.skeleton.update());
    camera.position.lerp(fixture.cameraDesired,1-Math.exp(-dt*1.8));
    cameraLook.lerp(fixture.cameraTarget,1-Math.exp(-dt*2)); camera.lookAt(cameraLook); camera.updateMatrixWorld(true);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let visible=false;
    // Check deformed geometry, not only a generous rest-pose bounding box.
    find: for(const mesh of meshes) for(let vertex=0;vertex<mesh.geometry.getAttribute('position').count;vertex++) {
      mesh.getVertexPosition(vertex,point); mesh.localToWorld(point);
      if(frustum.containsPoint(point)){visible=true;break find;}
    }
    if(visible) {
      firstVisible??={age,speed:sample.speed,position:sample.position.toArray()};
      maxVisibleSpeed=Math.max(maxVisibleSpeed,sample.speed);
    }
    if(frame%30===0)history.push({age,speed:sample.speed,visible});
  }
  assert.ok(firstVisible, `${species} never entered the ${portrait?'phone':'landscape'} shot`);
  const result={species,portrait,viewport:{width,height},firstVisible,maxVisibleSpeed,speedLimit,passed:maxVisibleSpeed<=speedLimit,history};
  results.push(result);
  console.log(`${result.passed?'PASS':'FAIL'} ${species} ${width}x${height}: first visible ${firstVisible.age.toFixed(2)}s, maximum visible speed ${maxVisibleSpeed.toFixed(2)}m/s`);
}
await mkdir(new URL('../qa/',import.meta.url),{recursive:true});
await writeFile(new URL('../qa/arrival-camera-review.json',import.meta.url),JSON.stringify({
  method:'60 Hz actual GLB skinned vertices; live world camera/encounter helpers; no foliage assumed',results},null,2));
assert.ok(results.every(result=>result.passed),'Fast transport was visible; inspect qa/arrival-camera-review.json');
