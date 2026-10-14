import * as THREE from './vendor/three.module.js';
import {createSauropodNeckPose} from './dinosaur-assets.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const part = (age, start, duration) => ease((age - start) / duration);
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const heading = direction => Math.atan2(-direction.z, direction.x);
const yawQuaternion = angle => new THREE.Quaternion().setFromAxisAngle(UP, angle);
// The carrying loop rises above the child's hair, keeping the large muzzle
// clear of his face. Both ends remain sewn to the top of the same backpack.
export const EXPLORER_CARRY_GRIP=Object.freeze([-.255,1.45,0]);

const RIDE_PAN_LIMITS = Object.freeze({
  canopy: Object.freeze({yaw:.95,pitch:.40}),
  flight: Object.freeze({yaw:.55,pitch:.24}),
});
export function ridePanLimits(kind){return RIDE_PAN_LIMITS[kind]||null;}

// Keep the shoulder/body behind Mosi as the adult grows. The original tested
// reach is expressed relative to the model's 1.5-scale boarding pose; the child
// and backpack handle retain their own saddle scale throughout the lift.
export function canopyBoardingOffset(scale){
  const ratio=(Number.isFinite(scale)&&scale>0?scale:1.5)/1.5;
  return v(-5.8*ratio,0,-2.17*ratio);
}

/** Turn around the eye, keeping the horizon level even at a wide sideways look. */
export function explorationViewTarget(position,target,yaw=0,pitch=0){
  const direction=target.clone().sub(position);
  if(direction.lengthSq()<1e-8)return target.clone();
  direction.applyAxisAngle(UP,yaw);
  const right=direction.clone().cross(UP).normalize();
  direction.applyAxisAngle(right,pitch);
  return position.clone().add(direction);
}

/** Turn a seated viewer toward a hint without rotating the horizon or allowing
 * an abrupt backwards glance. The caller eases this bounded target in/out. */
export function rideAttentionTarget(position, target, focus, kind='canopy') {
  const base=target.clone().sub(position), wanted=focus.clone().sub(position);
  if(base.lengthSq()<1e-8||wanted.lengthSq()<1e-8)return target.clone();
  const yaw=Math.atan2(base.x,base.z),wantedYaw=Math.atan2(wanted.x,wanted.z);
  const yawDelta=Math.atan2(Math.sin(wantedYaw-yaw),Math.cos(wantedYaw-yaw));
  const pitch=Math.asin(clamp(base.y/base.length(),-1,1));
  const wantedPitch=Math.asin(clamp(wanted.y/wanted.length(),-1,1));
  const yawLimit=kind==='flight'?.65:.95,pitchLimit=kind==='flight'?.34:.50;
  const finalYaw=yaw+clamp(yawDelta,-yawLimit,yawLimit);
  const finalPitch=pitch+clamp(wantedPitch-pitch,-pitchLimit,pitchLimit),distance=base.length();
  return position.clone().add(v(Math.sin(finalYaw)*Math.cos(finalPitch),Math.sin(finalPitch),Math.cos(finalYaw)*Math.cos(finalPitch)).multiplyScalar(distance));
}

/** A paused-clock story sequence. It moves the existing child and real skeleton;
 * no replacement rider, teleport, wall-clock timer or automatic flight timeout. */
export function createCinematicRides({scene, mosi, onEvent = () => {}}) {
  const rider = mosi.group.getObjectByName('Little Icelandic explorer');
  const home = rider ? {parent:rider.parent, position:rider.position.clone(), quaternion:rider.quaternion.clone(), scale:rider.scale.clone()} : null;
  let state = null, readyResolve = null, finishResolve = null, disposed = false;
  let readyPromise = Promise.resolve({completed:true,cancelled:false});
  let finishPromise = null, wantReturn = false;
  const carrier = new THREE.Group(); carrier.name = 'Continuous explorer ride'; scene.add(carrier);
  const owned = [];
  let carryHandle=null,restingHandle=null;
  // A visible, rounded handle identifies the gentle pickup point on the pack.
  if(rider){
    const loop=new THREE.CatmullRomCurve3([v(-.255,.64,-.105),v(-.27,1.19,-.12),v(...EXPLORER_CARRY_GRIP),v(-.27,1.19,.12),v(-.255,.64,.105)]);
    const handle = new THREE.Mesh(new THREE.TubeGeometry(loop,32,.019,6,false),new THREE.MeshStandardMaterial({color:'#8c593a',roughness:.85}));
    handle.name='Backpack carrying handle';handle.visible=false;rider.add(handle);owned.push(handle);carryHandle=handle;
    const folded=new THREE.Mesh(new THREE.TorusGeometry(.10,.019,8,24),handle.material.clone());
    folded.name='Folded backpack handle';folded.position.set(-.255,.69,0);folded.rotation.y=Math.PI/2;rider.add(folded);owned.push(folded);restingHandle=folded;
  }
  const clouds = new THREE.Group(); clouds.name='Clouds above the discovery flight'; clouds.visible=false; scene.add(clouds);
  const cloudMaterial = new THREE.MeshStandardMaterial({color:'#fff8dd',roughness:1,transparent:true,opacity:.76,depthWrite:false});
  const cloudGeometry = new THREE.SphereGeometry(1,12,8);
  const cloudPuffs = new THREE.InstancedMesh(cloudGeometry,cloudMaterial,42),cloudTransform=new THREE.Object3D();clouds.add(cloudPuffs);
  for(let i=0;i<14;i++){
    const a=i/14*Math.PI*2,center=v(Math.cos(a)*(23+i%3*5),23+i%4*1.1,Math.sin(a)*(19+i%2*8));
    for(let j=0;j<3;j++){
      cloudTransform.position.copy(center).add(v((j-1)*1.55,j===1?.7:0,(j%2)*.35));
      cloudTransform.scale.set(2.0+i%3*.3,j===1?1.6:1.15,1.65+i%2*.4);cloudTransform.updateMatrix();cloudPuffs.setMatrixAt(i*3+j,cloudTransform.matrix);
    }
  }
  function emit(type,extra={}){if(state)onEvent({type,kind:state.kind,species:state.species,phase:state.phase,pan:0,...extra});}
  function homePose(){
    home.parent.updateWorldMatrix(true,false);
    const matrix=new THREE.Matrix4().compose(home.position,home.quaternion,home.scale).premultiply(home.parent.matrixWorld);
    const position=v(),quaternion=new THREE.Quaternion(),scale=v();matrix.decompose(position,quaternion,scale);return{position,quaternion,scale};
  }
  function placeRider(position,quaternion,scale=state?.riderScale){
    if(!rider)return;if(rider.parent!==carrier)carrier.attach(rider);
    rider.position.copy(position);rider.quaternion.copy(quaternion);rider.scale.copy(scale);rider.visible=true;rider.updateMatrixWorld(true);
  }
  function restoreRider(){if(!rider||!home)return;home.parent.add(rider);rider.position.copy(home.position);rider.quaternion.copy(home.quaternion);rider.scale.copy(home.scale);rider.visible=true;if(carryHandle)carryHandle.visible=false;if(restingHandle)restingHandle.visible=true;}
  function restoreNeck(){state?.neckPose?.restore();}
  function settle(cancelled){
    const result={completed:!cancelled,cancelled};
    if(readyResolve){readyResolve(result);readyResolve=null;}if(finishResolve){finishResolve(result);finishResolve=null;}
  }
  function cancel(){
    if(state){
      restoreNeck();
      const {animal,origin}=state;animal.group.position.copy(origin.position);animal.group.quaternion.copy(origin.quaternion);animal.group.scale.copy(origin.scale);
      state.neckPose?.dispose();
    }
    restoreRider();settle(true);state=null;wantReturn=false;finishPromise=null;clouds.visible=false;
  }
  function start({species,animal,completed=false,replay=false,restingPose=null}={}){
    if(disposed||!rider||!animal||!['brachiosaurus','pteranodon'].includes(species))return Promise.resolve({completed:false,cancelled:true});
    if(state?.species===species&&!replay)return readyPromise;
    cancel();
    if(completed&&!replay)return Promise.resolve({completed:true,cancelled:false});
    const kind=species==='brachiosaurus'?'canopy':'flight';
    animal.group.updateMatrixWorld(true);const hp=homePose();
    state={kind,species,animal,phase:'inviting',age:0,phaseAge:0,elapsed:0,
      origin:{position:animal.group.position.clone(),quaternion:animal.group.quaternion.clone(),scale:animal.group.scale.clone()},
      resting:restingPose?{position:restingPose.position.clone(),quaternion:yawQuaternion(restingPose.yaw)}:{position:animal.group.position.clone(),quaternion:animal.group.quaternion.clone()},
      riderScale:hp.scale.clone(),riderStart:hp,boarding:mosi.group.position.clone().add(kind==='canopy'?canopyBoardingOffset(animal.group.scale.x):v(-1.2,0,-1.9)),
      boardingQuaternion:kind==='canopy'?animal.group.quaternion.clone():yawQuaternion(-.35),
      viewerQuaternion:yawQuaternion(Math.PI*.43),
      flightCenter:v(mosi.group.position.x+3,17,-11),loopAge:0,lastWing:null,lastStep:null,
      camera:null,context:null,returnStart:null};
    if(kind==='canopy'){
      if(carryHandle)carryHandle.visible=true;if(restingHandle)restingHandle.visible=false;
      state.neckPose=createSauropodNeckPose(animal);state.mouth=state.neckPose.mouth;
      // Brontosaurus has a lower front. Predict the final *raised* browsing pose
      // once so branches never follow the moving child during the ascent.
      animal.group.position.copy(state.boarding);animal.group.updateMatrixWorld(true);
      // A level carrying muzzle reaches slightly less high than the upward
      // browsing pose. Keep this target within the real two-neck-joint reach.
      state.browseTarget=animal.group.localToWorld(v(2.05,4.25,0));
      state.neckPose.aim(state.browseTarget,1,{levelMuzzle:true});
      state.canopyAnchor=state.mouth.getWorldPosition(v())
        .add(v(.34-EXPLORER_CARRY_GRIP[0],1-EXPLORER_CARRY_GRIP[1],0).multiply(state.riderScale).applyQuaternion(state.viewerQuaternion));
      restoreNeck();animal.group.position.copy(state.origin.position);animal.group.updateMatrixWorld(true);
    }
    clouds.position.set(state.flightCenter.x,0,state.flightCenter.z);clouds.visible=kind==='flight';
    readyPromise=new Promise(resolve=>{readyResolve=resolve;});emit('invite');return readyPromise;
  }
  function phase(name){if(state.phase===name)return;state.phase=name;state.phaseAge=0;}
  function beginReturn(){
    if(!state||state.phase==='returning'||state.phase==='complete')return;
    phase('returning');state.returnStart={position:state.animal.group.position.clone(),quaternion:state.animal.group.quaternion.clone(),camera:state.camera?.position.clone(),target:state.camera?.target.clone(),rider:homePose()};
    emit('return');
  }
  function finish(){
    if(!state||state.phase==='complete')return Promise.resolve({completed:true,cancelled:false});
    if(finishPromise)return finishPromise;finishPromise=new Promise(resolve=>{finishResolve=resolve;});wantReturn=true;
    if(state.phase==='exploring')beginReturn();return finishPromise;
  }
  function routeSample(amount){
    if(!state)return null;const angle=amount*Math.PI*2;
    const position=state.flightCenter.clone().add(v(Math.cos(angle)*18,Math.sin(angle*2)*.35,Math.sin(angle)*12));
    const forward=v(-Math.sin(angle)*18,Math.cos(angle*2)*.7,Math.cos(angle)*12).normalize();
    return{position,forward,up:UP.clone()};
  }
  function neckTo(target,weight){
    state.neckPose?.aim(target,weight,{levelMuzzle:true});
  }
  function handleWorld(pose){return v(...EXPLORER_CARRY_GRIP).multiply(pose.scale).applyQuaternion(pose.quaternion).add(pose.position);}
  function attachToMouth(quaternion){const point=state.mouth.getWorldPosition(v()),offset=v(...EXPLORER_CARRY_GRIP).multiply(state.riderScale).applyQuaternion(quaternion);placeRider(point.sub(offset),quaternion);}
  function seatPose(){
    const model=state.animal.group;model.updateMatrixWorld(true);
    return{position:model.localToWorld(v(-.58,1.35,0)),quaternion:model.getWorldQuaternion(new THREE.Quaternion())};
  }
  function sideCamera(focus,viewport,distance=11){
    return{position:focus.clone().add(v(viewport.portrait?5:7,3.4,distance)),target:focus.clone().add(v(0,.7,0)),fov:viewport.portrait?53:47};
  }
  function firstPerson(viewport){
    const model=state.animal.group;model.updateMatrixWorld(true);
    if(state.kind==='flight')return{position:model.localToWorld(v(-2.0,2.25,0)),target:model.localToWorld(v(5.0,2.60,0)),fov:108};
    const position=rider.localToWorld(v(.34,1.0,0));const forward=v(1,0,0).applyQuaternion(state.viewerQuaternion);
    return{position,target:position.clone().addScaledVector(forward,9).add(v(0,-2.4,0)),fov:viewport.portrait?67:62};
  }
  function mixCamera(a,b,t){return{position:a.position.clone().lerp(b.position,t),target:a.target.clone().lerp(b.target,t),fov:THREE.MathUtils.lerp(a.fov,b.fov,t)};}
  function complete(){
    restoreNeck();state.animal.group.position.copy(state.resting.position);state.animal.group.quaternion.copy(state.resting.quaternion);restoreRider();phase('complete');clouds.visible=false;state.context=null;emit('landed');settle(false);
  }
  function animationState(){
    // Called immediately before the model mixer. Some authored idle clips omit
    // stationary neck tracks, so a previous procedural bend must be removed.
    restoreNeck();
    if(!state||state.phase==='complete')return null;
    const a=state.phaseAge;
    if(state.kind==='canopy')return{walking:state.phase==='pickup'&&a<3?1:state.phase==='returning'&&a>8?.7:0,flying:0,glide:0,look:0,gazeHeight:0};
    let flying=1,glide=.86;
    if(state.phase==='pickup'){flying=1-part(a,2,4);glide=.3;}
    if(state.phase==='ascending'){flying=part(a,2.5,1.5);glide=.25+part(a,5,4)*.6;}
    if(state.phase==='returning'){flying=a<9?1-part(a,5.5,3):a<12?0:part(a,12,2);glide=.5;}
    return{walking:0,flying,glide,look:0,gazeHeight:0,bank:0};
  }
  function update(time,dt,{viewport,baselineCamera,baselineTarget,baseFov=47,restingPose=null}={}){
    if(!state||disposed||state.phase==='complete')return null;
    state.age+=dt;state.phaseAge+=dt;state.elapsed=time;
    const a=state.phaseAge,animal=state.animal,base={position:baselineCamera.clone(),target:baselineTarget.clone(),fov:baseFov},hp=homePose();
    // Responsive scene scale is already eased by world.js. Carry the same
    // current child scale so rotating a tablet cannot resize it at reattachment.
    state.riderScale.copy(hp.scale);
    if(restingPose){state.resting.position.copy(restingPose.position);state.resting.quaternion.copy(yawQuaternion(restingPose.yaw));}
    if(state.phase==='inviting'){
      state.camera=base;
      if(a>=5){phase('pickup');emit('pickup');}
    }else if(state.kind==='canopy'){
      const board=state.boarding;
      if(state.phase==='pickup'){
        animal.group.position.copy(state.origin.position).lerp(board,part(a,0,3));animal.group.quaternion.copy(state.origin.quaternion);
        neckTo(handleWorld(hp),part(a,1.2,5.1));
        state.camera=mixCamera(base,sideCamera(hp.position,viewport,viewport.portrait?10:9),part(a,0,2));
        if(a>=6.5){state.riderStart=hp;phase('ascending');}
      }else if(state.phase==='ascending'){
        animal.group.position.copy(board);animal.group.quaternion.copy(state.boardingQuaternion);
        const rise=part(a,0,7);neckTo(handleWorld(hp).lerp(state.browseTarget,rise),1);
        const facing=hp.quaternion.clone().slerp(state.viewerQuaternion,rise);attachToMouth(facing);
        const focus=rider.getWorldPosition(v());state.camera=mixCamera(sideCamera(focus,viewport,10),firstPerson(viewport),part(a,4.8,3));
        if(a>=8){phase('exploring');emit('ready');if(readyResolve){readyResolve({completed:true,cancelled:false});readyResolve=null;}if(wantReturn)beginReturn();}
      }else if(state.phase==='exploring'){
        animal.group.position.copy(board);animal.group.quaternion.copy(state.boardingQuaternion);neckTo(state.browseTarget,1);animal.group.updateMatrixWorld(true);attachToMouth(state.viewerQuaternion);state.camera=firstPerson(viewport);
      }else if(state.phase==='returning'){
        const lower=part(a,0,7.5);animal.group.position.copy(board).lerp(state.resting.position,part(a,8,4));animal.group.quaternion.copy(state.boardingQuaternion).slerp(state.resting.quaternion,part(a,8,4));
        neckTo(state.browseTarget.clone().lerp(handleWorld(hp),lower),1-part(a,8,3.5));
        if(a<8){const facing=state.viewerQuaternion.clone().slerp(hp.quaternion,lower);attachToMouth(facing);}else restoreRider();
        const focus=a<8?rider.getWorldPosition(v()):hp.position;
        state.camera=mixCamera(firstPerson(viewport),sideCamera(focus,viewport,10),part(a,0,2));
        state.camera=mixCamera(state.camera,base,part(a,8,4));
        if(a>=12)complete();
      }
    }else{
      if(state.phase==='pickup'){
        const t=part(a,0,6);animal.group.position.copy(state.origin.position).lerp(state.boarding,t);animal.group.position.y+=Math.sin(t*Math.PI)*1.8;animal.group.quaternion.copy(state.origin.quaternion).slerp(state.boardingQuaternion,t);
        state.camera=mixCamera(base,sideCamera(hp.position.clone().add(v(-.5,0,-.5)),viewport,11),part(a,0,3));
        if(a>=6){phase('ascending');state.riderStart=hp;}
      }else if(state.phase==='ascending'){
        const takeoff=part(a,3.5,8),start=routeSample(0),t=takeoff;
        animal.group.position.copy(state.boarding).lerp(start.position,t);animal.group.position.y+=Math.sin(t*Math.PI)*1.8;animal.group.quaternion.copy(state.boardingQuaternion).slerp(yawQuaternion(heading(start.forward)),t);
        animal.group.updateMatrixWorld(true);const seat=seatPose(),board=part(a,0,3.5);
        const position=state.riderStart.position.clone().lerp(seat.position,board);position.y+=Math.sin(board*Math.PI)*.24;placeRider(position,state.riderStart.quaternion.clone().slerp(seat.quaternion,board));
        const external=sideCamera(animal.group.position.clone().add(v(0,2,0)),viewport,13);state.camera=mixCamera(external,firstPerson(viewport),part(a,7.5,4));
        if(a>=11.5){phase('exploring');state.loopAge=0;emit('ready');if(readyResolve){readyResolve({completed:true,cancelled:false});readyResolve=null;}if(wantReturn)beginReturn();}
      }else if(state.phase==='exploring'){
        state.loopAge+=dt;const sample=routeSample(state.loopAge/48);
        animal.group.position.copy(sample.position);animal.group.quaternion.copy(yawQuaternion(heading(sample.forward)));animal.group.updateMatrixWorld(true);const seat=seatPose();placeRider(seat.position,seat.quaternion);state.camera=firstPerson(viewport);
      }else if(state.phase==='returning'){
        const t=part(a,0,9),source=state.returnStart;
        if(a<12){
          animal.group.position.copy(source.position).lerp(state.boarding,t);animal.group.position.y+=Math.sin(t*Math.PI)*2;animal.group.quaternion.copy(source.quaternion).slerp(state.boardingQuaternion,t);
        }else{const rejoin=part(a,12,5);animal.group.position.copy(state.boarding).lerp(state.resting.position,rejoin);animal.group.quaternion.copy(state.boardingQuaternion).slerp(state.resting.quaternion,rejoin);}
        animal.group.updateMatrixWorld(true);const seat=seatPose();
        if(a<9)placeRider(seat.position,seat.quaternion);else if(a<12){const transfer=part(a,9,3),position=seat.position.clone().lerp(hp.position,transfer);position.y+=Math.sin(transfer*Math.PI)*.2;placeRider(position,seat.quaternion.clone().slerp(hp.quaternion,transfer));}else restoreRider();
        const external=sideCamera(animal.group.position.clone().add(v(0,2,0)),viewport,13);state.camera=mixCamera(firstPerson(viewport),external,part(a,0,3));state.camera=mixCamera(state.camera,base,part(a,12,5));
        if(a>=17)complete();
      }
    }
    if(state.phase==='complete')return null;
    // Once the eye view has taken over, the seated avatar is behind the virtual
    // viewer; showing its hat/backpack in front would create a second rider.
    if(state.kind==='flight')rider.visible=!(state.phase==='exploring'||state.phase==='ascending'&&state.phaseAge>10.7||state.phase==='returning'&&state.phaseAge<.7);
    const forward=state.kind==='flight'?v(1,0,0).applyQuaternion(animal.group.quaternion):v(1,0,0).applyQuaternion(state.viewerQuaternion);
    const anchor=state.kind==='flight'?animal.group.position.clone():state.camera.position.clone();
    state.context={kind:state.kind,phase:state.phase,interactive:state.phase==='exploring',anchor,canopyAnchor:state.canopyAnchor?.clone()||null,eye:state.camera.position.clone(),forward,right:forward.clone().cross(UP).normalize(),up:UP.clone(),panLimits:ridePanLimits(state.kind),
      flightCenter:state.flightCenter.clone(),loopPhase:(state.loopAge/48)%1,routeRadius:18,routeEyeHeight:2.25*animal.group.scale.y,sampleRoute:routeSample};
    const motion=animal.getMotionState?.();
    const crossed=(previous,current,marker)=>previous!==null&&(current>=previous?marker>previous&&marker<=current:marker>previous||marker<=current);
    if(state.kind==='flight'&&motion?.flying>.35){const current=((motion.wingPhase%1)+1)%1;if(crossed(state.lastWing,current,.5))emit('wing',{progress:1});state.lastWing=current;}else state.lastWing=null;
    if(state.kind==='canopy'&&motion?.walking>.35){const current=((motion.walkPhase%1)+1)%1;for(const marker of motion.footfallPhases||[0,.5])if(crossed(state.lastStep,current,marker))emit('step',{progress:1});state.lastStep=current;}else state.lastStep=null;
    return{camera:state.camera,context:state.context};
  }
  function getState(){return state?{kind:state.kind,phase:state.phase,busy:!['exploring','complete'].includes(state.phase),canReturn:state.phase==='exploring',age:state.age}:{kind:null,phase:'idle',busy:false,canReturn:false};}
  function dispose(){if(disposed)return;cancel();disposed=true;carrier.removeFromParent();clouds.removeFromParent();cloudGeometry.dispose();cloudMaterial.dispose();for(const object of owned){object.removeFromParent();object.geometry.dispose();object.material.dispose();}}
  return{start,finish,cancel,update,animationState,getState,getContext:()=>state?.context||null,isActive:()=>Boolean(state&&state.phase!=='complete'),dispose};
}
