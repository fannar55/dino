import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../../../dist/vendor/SkeletonUtils.js';
import { createEyelids } from '../eyelids.js';
import { createFooting, QUADRUPED } from '../footing.js';
import { measureWalkGait, gaitFoot } from './walk-gait.js';
import { GESTURES, GESTURE_ALIASES } from './gestures.js';

// The three friends are babies baked from the owner's adult models (scripts/memory-baby-bake.mjs).
// lengthFactor is each species' nose-to-tail size against the `length` asked for: the Þórseðla baby
// is shown larger so she stands tallest, her head top 1.25 times the Þríhyrna baby's (1.88 m against
// 1.50 m at the game's 2.6), while the Kambeðla baby stays at 1.23 m. reach is how far into lowerHead her
// reach pose goes: .53 brings the taller baby's crown down to 1.07 m, under the resting branch, as .34 did the
// adult's (1.04 m).
export const MEMORY_CHARACTER_ART = Object.freeze({
  triceratops: { name: 'Þríhyrna', url: new URL('../../assets/memory/triceratops-baby.glb', import.meta.url).href, isBaby: true, lengthFactor: 1 },
  stegosaurus: { name: 'Kambeðla', url: new URL('../../assets/memory/stegosaurus-baby.glb', import.meta.url).href, isBaby: true, lengthFactor: 1 },
  brontosaurus: { name: 'Þórseðla', url: new URL('../../assets/memory/brontosaurus-baby.glb', import.meta.url).href, isBaby: true, lengthFactor: 1.62, reach: .53 },
});

/**
 * Six rigged characters (two of each species by default), all facing local +X.
 * World owns root position/rotation/visibility. This controller only animates
 * the model below root. Call update(dt) on the game clock, never during pause.
 */
export async function createBabyActors({ scene, length = 1.55, instancesPerSpecies = 2, species = Object.keys(MEMORY_CHARACTER_ART), loader = new GLTFLoader() } = {}) {
  if (!scene?.add) throw new TypeError('createBabyActors needs a THREE.Scene or Group');
  const templates = await Promise.all(species.map(id => {
    if (!MEMORY_CHARACTER_ART[id]) throw new Error(`Unknown memory character: ${id}`);
    return loader.loadAsync(MEMORY_CHARACTER_ART[id].url);
  }));
  const actors = [];
  const walkGaits = new Map();
  for (let s = 0; s < species.length; s++) {
    const id = species[s], art = MEMORY_CHARACTER_ART[id], gltf = templates[s], size = art.lengthFactor ?? 1, L = length * size;
    for (let instance = 0; instance < instancesPerSpecies; instance++) {
      const root = new THREE.Group(); root.name = `Memory ${id} ${instance}`;
      root.userData.memoryArt = { species: id, isBaby: art.isBaby, lengthFactor: size, review: art.isBaby ? 'baby-proportions-v1' : 'temporary-adult-art' };
      const pose = new THREE.Group(); root.add(pose);
      const model = cloneSkinned(gltf.scene); pose.add(model);
      const materials = new Set();
      model.traverse(o => {
        if (!o.isMesh) return;
        const copy = material => { const m=material.clone();m.shadowSide=THREE.FrontSide;materials.add(m);return m; };
        o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      });
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model, true);
      model.scale.multiplyScalar(L / bounds.getSize(new THREE.Vector3()).x);
      model.updateMatrixWorld(true); bounds.setFromObject(model, true);
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -bounds.min.y, -center.z);
      const mixer = new THREE.AnimationMixer(model);
      const clips = new Map(gltf.animations.map(c => [c.name.toLowerCase(), c]));
      const bone = name => model.getObjectByName(name) || model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
      const head = bone('Head'), jaw = bone('Jaw'), body = bone('Body'), shoulders = bone('Shoulders'), tail = bone('Tail1');
      // The gesture rig: the long-necked adult rigs have Hips/Chest where the baby rig has Body/Shoulders.
      const neck = bone('Neck'), rigBody = body || bone('Hips'), rigShoulders = shoulders || bone('Chest');
      const legs = ['FrontLeg.L','FrontLeg.R','BackLeg.L','BackLeg.R'].map(name=>({leg:bone(name),foot:bone(name.replace('Leg','Foot')),front:name.startsWith('Front')})).filter(pair=>pair.leg&&pair.foot);
      const supportBones=id==='brontosaurus' ? ['Hips','Spine','Chest','Neck','Neck2','Neck3','Neck4','Neck5','Head'].map(bone).filter(Boolean) : [];
      const copyPose=bones=>new Map(bones.map(b=>[b,{position:b.position.clone(),quaternion:b.quaternion.clone()}]));
      const supportRest=copyPose(supportBones);
      function sampleSupport(name,time){
        const sampled=new Map([...supportRest].map(([b,p])=>[b,{position:p.position.clone(),quaternion:p.quaternion.clone()}]));
        for(const track of clips.get(name)?.tracks||[]){
          const binding=THREE.PropertyBinding.parseTrackName(track.name),b=bone(binding.nodeName),p=sampled.get(b);
          if(p&&(binding.propertyName==='position'||binding.propertyName==='quaternion'))p[binding.propertyName].fromArray(track.createInterpolant().evaluate(time));
        }
        return sampled;
      }
      // These are the existing authored S-curve poses, measured against the actual
      // Neck..Neck5 rig (+X forward, +Y up), with no stretching or guessed axes.
      const reachPose=sampleSupport('lowerhead',(clips.get('lowerhead')?.duration||0)*(art.reach??.34));
      const liftedPose=sampleSupport('liftup',clips.get('liftup')?.duration||0);
      const jawRest = jaw?.quaternion.clone();
      root.updateMatrixWorld(true);
      let landmarkMesh=null,characterMesh=null,carryVertex=null;
      model.traverse(o=>{if(o.userData.memoryLandmarks?.nose)landmarkMesh=o;if(o.isSkinnedMesh&&!characterMesh)characterMesh=o;});
      const nose=new THREE.Object3D();nose.name='Memory nose contact';
      const landmarks=landmarkMesh?.userData.memoryLandmarks;
      if(landmarks&&head){
        // The baked baby's own landmarks (the Þórseðla baby: snout tip and skull crown),
        // attached to Head so they follow the complete neck chain.
        const p=landmarkMesh.localToWorld(new THREE.Vector3(...landmarks.nose));
        nose.position.copy(head.worldToLocal(p));head.add(nose);
      }else if(id==='stegosaurus'&&characterMesh&&head){
        const {position,skinIndex,skinWeight}=characterMesh.geometry.attributes;let tip=null,tipBone=head,front=-Infinity;const snout=[];
        for(let i=0;i<position.count;i++){
          let strongest=0;for(let j=1;j<4;j++)if(skinWeight.getComponent(i,j)>skinWeight.getComponent(i,strongest))strongest=j;
          const b=characterMesh.skeleton.bones[skinIndex.getComponent(i,strongest)];if(!/Head|Jaw/.test(b.name))continue;
          const p=characterMesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position,i)),local=root.worldToLocal(p.clone()),x=local.x;snout.push({index:i,x,y:local.y});
          if(x>front){front=x;tip=p;tipBone=b}
        }
        nose.position.copy(tipBone.worldToLocal(tip));tipBone.add(nose);
        // The front tip sits below the upper beak. Wood rests on this measured
        // upper-snout vertex, not through the face at the lower nose-tip height.
        carryVertex=snout.filter(p=>p.x>=front-L*.02).reduce((a,b)=>b.y>a.y?b:a).index;
      }else{nose.position.set(L*.48,bounds.getSize(new THREE.Vector3()).y*.65,0);pose.add(nose);}
      const supportPoint=new THREE.Object3D();supportPoint.name='Memory branch support';
      if(landmarks?.support&&head){
        const p=landmarkMesh.localToWorld(new THREE.Vector3(...landmarks.support));
        supportPoint.position.copy(head.worldToLocal(p));head.add(supportPoint);
      }else{supportPoint.position.copy(nose.position);nose.parent.add(supportPoint);}
      root.updateMatrixWorld(true);
      const noseLocal=root.worldToLocal(nose.getWorldPosition(new THREE.Vector3()));
      const supportLocal=root.worldToLocal(supportPoint.getWorldPosition(new THREE.Vector3()));
      if(!walkGaits.has(id))walkGaits.set(id,measureWalkGait(model,root,clips.get('walk'),legs.map(pair=>pair.foot),L*(id==='brontosaurus'?.45:.42)));
      const gait=walkGaits.get(id),pivotHeight=legs.reduce((sum,pair)=>sum+root.worldToLocal(pair.leg.getWorldPosition(new THREE.Vector3())).y,0)/Math.max(1,legs.length);
      const footing=createFooting({root,rootFrame:true,legs:legs.map(pair=>({foot:pair.foot,girdle:pair.front?0:1})),pivotHeight,tuning:{...QUADRUPED,strideReach:.8,joinTime:[.05,.1,.12]}});
      const lids = createEyelids(model, { seed: `memory-${id}-${instance}` });
      let action = null, motion = 'idle', elapsed = 0, gesture = null, disposed = false;
      let gestureFrom = 0;
      let clipLeft=0, clipName=null, motionAge=0, stance=0, pushYaw=0, reducedMotion=false, lookEnabled=false, lookWeight=0, lookWanted=.65, lookMaxAngle=18;
      let support=null;
      const lastPosition=root.position.clone();let travelSpeed=0,walkRate=0,walkDistance=0,footingMode=false;
      const lookTarget=new THREE.Vector3(), rootQ=new THREE.Quaternion(), parentQ=new THREE.Quaternion(), offsetQ=new THREE.Quaternion();
      const axisX=new THREE.Vector3(1,0,0),axisY=new THREE.Vector3(0,1,0),axisZ=new THREE.Vector3(0,0,1);
      // Restore the mixer's exact base pose before the next animation step.
      // Otherwise unkeyed legs and constant head tracks accumulate additives.
      const additiveBones=[...new Set([head,jaw,body,shoulders,tail,neck,rigBody,rigShoulders,...supportBones,...legs.flatMap(p=>[p.leg,p.foot])].filter(Boolean))];
      const basePose=new Map(additiveBones.map(b=>[b,{position:b.position.clone(),quaternion:b.quaternion.clone()}]));
      let basePoseActive=false;
      function restoreBasePose(){if(!basePoseActive)return;for(const [b,p]of basePose){b.position.copy(p.position);b.quaternion.copy(p.quaternion);}basePoseActive=false;}
      function captureBasePose(){for(const [b,p]of basePose){p.position.copy(b.position);p.quaternion.copy(b.quaternion);}basePoseActive=true;}
      function rotateInRoot(b,axis,angle){
        if(!b||Math.abs(angle)<1e-8)return;
        root.getWorldQuaternion(rootQ);b.parent.getWorldQuaternion(parentQ);
        offsetQ.setFromAxisAngle(axis.clone().applyQuaternion(rootQ),angle);
        offsetQ.premultiply(parentQ.clone().invert()).multiply(parentQ);
        b.quaternion.premultiply(offsetQ);b.updateMatrixWorld(true);
      }
      function offsetInRoot(b,x,y,z=0){
        if(!b)return;
        const delta=root.localToWorld(new THREE.Vector3(x,y,z)).sub(root.getWorldPosition(new THREE.Vector3()));
        const p=b.getWorldPosition(new THREE.Vector3()).add(delta);
        b.position.copy(b.parent.worldToLocal(p));b.updateMatrixWorld(true);
      }
      function applyStance(amount){
        if(amount<1e-5)return;
        // Lower the face and shoulder gently. The beak remains the contact point;
        // there is no charging or horn-first thrust.
        rotateInRoot(body,axisZ,-.025*amount);
        offsetInRoot(shoulders,.008*L*amount,-.009*L*amount);
        rotateInRoot(head,axisZ,-.115*amount);
        for(const pair of legs){
          const planted=pair.foot.getWorldPosition(new THREE.Vector3());
          offsetInRoot(pair.leg,(pair.front ? .012 : -.008)*L*amount,-.009*L*amount);
          pair.foot.position.copy(pair.foot.parent.worldToLocal(planted));pair.foot.updateMatrixWorld(true);
        }
      }
      const blendPose=(a,b,t)=>new Map([...b].map(([bone,p])=>{const from=a.get(bone)??p;return[bone,{position:from.position.clone().lerp(p.position,t),quaternion:from.quaternion.clone().slerp(p.quaternion,t)}]}));
      function beginSupport(name,{duration,walking=false,amount}={}){
        if(!supportBones.length)return;
        // Repeated hold calls never restart a lift or recapture a moving pose.
        if(name==='hold'&&support&&support.mode!=='release'){support.mode='hold';return;}
        if(name==='release'&&!support)return;
        const share=amount==null?1:THREE.MathUtils.clamp(amount,0,1),span=Math.max(.01,duration??(name==='lift'?.9:name==='hold'?.25:.45));
        // A lift in steps (one per tap of the child): each step starts where the last one is now and goes
        // `amount` of the whole way from the pose the lift began in to the lifted pose.
        if(name==='lift'&&amount!=null&&support?.mode==='lift'){
          const t=support.age/support.duration;support.from=blendPose(support.from,support.target,t*t*(3-2*t));
          support.target=blendPose(support.base,liftedPose,share);support.age=0;support.duration=span;return;
        }
        const planted=walking?null:support?.planted||copyPose(legs.flatMap(p=>[p.leg,p.foot])),from=copyPose(supportBones);
        support={mode:name,age:0,duration:span,from,base:from,planted,target:name==='reach'?reachPose:share<1?blendPose(from,liftedPose,share):liftedPose};
        lookEnabled=false;lookWeight=0;
      }
      function applySupport(dt){
        if(!support)return;
        support.age=Math.min(support.duration,support.age+dt);
        const t=support.age/support.duration,ease=t*t*(3-2*t),release=support.mode==='release';
        for(const b of supportBones){
          const from=support.from.get(b),to=release?basePose.get(b):support.target.get(b);
          b.position.lerpVectors(from.position,to.position,ease);b.quaternion.slerpQuaternions(from.quaternion,to.quaternion,ease);
        }
        // Legs hang directly from the rig root. Preserve their arrival stance;
        // neither the neck lift nor idle breathing may unplant the feet.
        for(const [b,p]of support.planted??[]){
          const to=release?basePose.get(b):p;
          b.position.lerpVectors(p.position,to.position,ease);b.quaternion.slerpQuaternions(p.quaternion,to.quaternion,ease);
        }
        if(release&&t===1){support=null;if(motion==='release')motion='idle';}
        root.updateMatrixWorld(true);
      }
      function play(name) {
        const clip=clips.get(name) || clips.get('idle') || gltf.animations[0];
        if(!clip) return;
        const next=mixer.clipAction(clip);
        if(next===action) return;
        next.reset().setEffectiveTimeScale(name==='walk' ? 0 : 1).setEffectiveWeight(1).play();
        if(action) action.crossFadeTo(next,.16,false);
        action=next;
      }
      // A gesture is laid over the current motion (idle or walk), so a friend can hop while it runs.
      function startGesture(name){
        const id=GESTURE_ALIASES[name]??name;
        if(disposed||!GESTURES[id])return false;
        gesture={name:id,t:0,duration:GESTURES[id].duration};gestureFrom=0;return true;
      }
      // One of the model's own clips (the Kambeðla's eat, the Kambeðla's and the Þórseðla's happy) played over the stance for
      // `loops` rounds, then back to idle. False when this friend has no such clip or it is walking; in reduced motion the clips
      // stay shut (they are whole-body moves) and the caller uses a gesture.
      function playClip(name,{loops=1,fade=.2}={}){
        const clip=clips.get(String(name).toLowerCase());
        if(disposed||!clip||reducedMotion||motion==='walk'||motion==='reach-walk'||support)return false;
        const next=mixer.clipAction(clip);
        next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        if(action&&action!==next)action.crossFadeTo(next,fade,false);
        action=next;clipLeft=clip.duration*Math.max(.1,loops);clipName=name;return true;
      }
      // Gestures keep the friends' common size (length): the big Þórseðla baby hops and leans as far as the others
      // do, not 1.62 times as far (a 0.8 m hop lifted her tail into the branch behind her rest).
      const rig={pose,head,neck,jaw,body:rigBody,shoulders:rigShoulders,tail,legs,lids,rotateInRoot,offsetInRoot,length,species:id,crossed:at=>gestureFrom<at&&gesture.t>=at};
      function setMotion(name,options={}) {
        if(disposed) return;
        // The older gesture names start the matching gesture over a still stance.
        if(GESTURE_ALIASES[name]){setMotion('idle',options);startGesture(name);return;}
        if(name===motion)return;
        if(name==='reach-walk')beginSupport('reach',{...options,walking:true});
        else if(['reach','lift','hold','release'].includes(name))beginSupport(name,options);
        else if(support&&support.mode!=='release')beginSupport('release',{duration:name==='walk'?.18:.45});
        motion=name;motionAge=0;clipLeft=0;clipName=null;
        const walking=name==='walk'||name==='reach-walk';
        if(walking){lastPosition.copy(root.position);footing.restore();footing.reset();footingMode=true;}
        else if(footingMode){footing.restore();footing.stand();footingMode=false;}
        if(name==='brace'||name==='push')lookEnabled=false;
        if(['brace','push','reach','lift','hold','release','sleep'].includes(name))gesture=null;
        play(name==='walk'||name==='reach-walk'?'walk':'idle');
        if(walking)footing.walk(gait?{foot:(k,out)=>gaitFoot(gait,action.time/gait.cycle,k,out),stance:()=>gait.duty*gait.cycle/Math.max(.15,Math.abs(walkRate))}:null);
        if(name==='sleep') lids?.blink.rest(.55,.35); else lids?.blink.rest(0,.2);
      }
      play('idle');
      const actor = {
        root, model, species: id, name: art.name, isBaby: art.isBaby, lengthFactor: size, noseLocal, supportLocal,
        setMotion,
        reveal() { root.visible=true;clipLeft=0;clipName=null;support=null;stance=0;lookEnabled=false;lookWeight=0;restoreBasePose();footing.restore();footing.reset();lastPosition.copy(root.position);setMotion('reveal');lids?.blink.blink(); },
        gesture(name) { return startGesture(name); },
        /** One of the model's own clips for `loops` rounds ('eat', 'happy'), then idle; false when this friend has none. */
        playClip(name,options) { return playClip(name,options); },
        /** Drop a running gesture and open the eyes (a restart or a cancelled script). */
        stopGesture() { gesture=null;if(clipLeft>0){clipLeft=0;clipName=null;play(motion==='walk'||motion==='reach-walk'?'walk':'idle');}lids?.blink.rest(0,.2); },
        conceal() { root.visible=false; gesture=null; clipLeft=0; clipName=null; support=null; stance=0; lookEnabled=false;lookWeight=0;restoreBasePose();pose.position.y=0;pose.rotation.set(0,0,0);setMotion('idle'); },
        walk(active=true) { setMotion(active?'walk':'idle'); },
        greet() { setMotion('greet'); },
        nuzzle() { setMotion('nuzzle'); },
        brace() { setMotion('brace'); },
        push(active=true) { setMotion(active?'push':'idle'); },
        setPushYaw(angle=0) { pushYaw=THREE.MathUtils.clamp(angle,-.72,.72); },
        reach(options) { setMotion('reach',options); },
        reachWalk(options) { setMotion('reach-walk',options); },
        /** The branch lift; `amount` (0..1) lifts part of the way, and a later call with a larger amount goes on from there. */
        lift(options={}) { if(options.amount!=null&&motion==='lift'&&support?.mode==='lift'){beginSupport('lift',options);return;} setMotion('lift',options); },
        hold() { setMotion('hold'); },
        release(options) { setMotion('release',options); },
        clearSupport() { support=null;restoreBasePose();if(['reach','lift','hold','release'].includes(motion))setMotion('idle'); },
        delight() { setMotion('delight'); },
        lookAt(target,{weight=.65,maxAngle=18}={}) {
          if(!target){lookEnabled=false;return;}
          lookTarget.copy(target);lookEnabled=true;lookWanted=THREE.MathUtils.clamp(weight,0,1);lookMaxAngle=THREE.MathUtils.clamp(maxAngle,0,24);
        },
        clearLook() { lookEnabled=false; },
        setReducedMotion(value) { reducedMotion=Boolean(value); },
        getNosePosition(out=new THREE.Vector3()) { root.updateMatrixWorld(true);return nose.getWorldPosition(out); },
        getCarrySupportPosition(out=new THREE.Vector3()) { root.updateMatrixWorld(true);if(carryVertex===null)return nose.getWorldPosition(out);out.fromBufferAttribute(characterMesh.geometry.attributes.position,carryVertex);characterMesh.applyBoneTransform(carryVertex,out);return out.applyMatrix4(characterMesh.matrixWorld); },
        getSupportPosition(out=new THREE.Vector3()) { root.updateMatrixWorld(true);return supportPoint.getWorldPosition(out); },
        mismatch() { setMotion('mismatch'); },
        blink() { lids?.blink.blink(); },
        update(dt) {
          if(disposed || !root.visible) return;
          // A paused frame must preserve the exact skeleton pose. Mixer.update(0)
          // can leave unchanged tracks untouched, so applying the gesture again
          // would accumulate its additive head rotation while time is stopped.
          if(!Number.isFinite(dt) || dt<=0) return;
          dt=Math.min(.1,dt); elapsed+=dt;motionAge+=dt;
          restoreBasePose();
          footing.restore();
          const dx=root.position.x-lastPosition.x,dz=root.position.z-lastPosition.z,distance=Math.hypot(dx,dz),walking=motion==='walk'||motion==='reach-walk';
          const signed=dx*Math.cos(root.rotation.y)-dz*Math.sin(root.rotation.y)<-.15*distance?-1:1;
          travelSpeed=distance/dt;lastPosition.copy(root.position);
          if(walking&&gait){walkRate=signed*travelSpeed/(gait.naturalSpeed*root.scale.x);action?.setEffectiveTimeScale(walkRate);walkDistance+=distance;}
          else walkRate=0;
          mixer.update(dt); lids?.update(dt);
          if(clipLeft>0){clipLeft-=dt;if(clipLeft<=0){clipLeft=0;clipName=null;play(motion==='walk'||motion==='reach-walk'?'walk':'idle');}}
          pose.position.y=0; pose.rotation.set(0,0,0);
          if(jaw) jaw.quaternion.copy(jawRest);
          captureBasePose();root.updateMatrixWorld(true);
          const bracing=motion==='brace'||motion==='push';
          const wanted=bracing?1:0;
          stance+=THREE.MathUtils.clamp(wanted-stance,-dt/.22,dt/.35);
          const effort=motion==='push'&&!reducedMotion ? .84+.16*Math.sin(motionAge/.85*Math.PI*2) : 1;
          applyStance(stance*effort);
          rotateInRoot(head,axisY,pushYaw);
          lookWeight+=( (lookEnabled?lookWanted:0)-lookWeight)*(1-Math.exp(-dt/.22));
          if(head&&lookWeight>.001){
            root.updateMatrixWorld(true);
            const origin=head.getWorldPosition(new THREE.Vector3());
            const forward=nose.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
            const desired=lookTarget.clone().sub(origin);
            if(desired.lengthSq()>1e-6){
              desired.normalize();const delta=new THREE.Quaternion().setFromUnitVectors(forward,desired);
              const angle=2*Math.acos(THREE.MathUtils.clamp(delta.w,-1,1));
              const max=THREE.MathUtils.degToRad(lookMaxAngle)*(reducedMotion ? .5 : 1);
              delta.slerp(new THREE.Quaternion(),1-Math.min(1,max/Math.max(angle,1e-6))*lookWeight);
              head.parent.getWorldQuaternion(parentQ);delta.premultiply(parentQ.clone().invert()).multiply(parentQ);
              head.quaternion.premultiply(delta);head.updateMatrixWorld(true);
            }
          }
          applySupport(dt);
          // Work contacts keep their authored planted pose. Ordinary locomotion
          // uses the same planted-foot solver as Mosi, including bends and stops.
          if(walking){footing.update(dt);}
          // Gestures go last, over the look and the planted feet: a hop lifts the whole friend, feet too.
          if(gesture){
            gestureFrom=gesture.t;gesture.t=Math.min(1,gesture.t+dt/gesture.duration);
            const current=gesture;GESTURES[current.name].apply(rig,current.t,reducedMotion?.3:1);
            if(gesture===current&&current.t>=1)gesture=null;
            root.updateMatrixWorld(true);
          }
        },
        getDebugState() { return {species:id,isBaby:art.isBaby,motion,elapsed,gesture:gesture?.name || null,clip:clipLeft>0?clipName:null,stance,support:support?{mode:support.mode,progress:support.age/support.duration}:null,gait:gait?{naturalSpeed:gait.naturalSpeed*root.scale.x,cycle:gait.cycle,rate:walkRate,speed:travelSpeed,distance:walkDistance}:null,reducedMotion,looking:lookEnabled,clips:[...clips.keys()],eyelids:Boolean(lids),visible:root.visible}; },
        dispose() {
          if(disposed)return;disposed=true;lids?.dispose();mixer.stopAllAction();mixer.uncacheRoot(model);
          materials.forEach(m=>m.dispose());root.removeFromParent();
        },
      };
      scene.add(root); actors.push(actor);
    }
  }
  return actors;
}
