import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../../../dist/vendor/SkeletonUtils.js';
import { createEyelids } from '../eyelids.js';
import { createFooting, QUADRUPED, BIPED } from '../footing.js';
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
  // The fourth friend (level 2) is `winged`: two jointed legs (thigh, shin, foot) in place of four pivot legs, and the model's own
  // flight clips behind fly(), land() and carry(). Her length is measured in the bind pose (beak to crest or tail, her wings spread and
  // her neck upright), and .85 of the game's 2.6 puts her crest, standing, at 1.6 m: level with the Þríhyrna baby's head top (1.56 m).
  pteranodon: { name: 'Flugeðla', url: new URL('../../assets/memory/pteranodon-baby.glb', import.meta.url).href, isBaby: true, lengthFactor: .85, winged: true },
});

// The front of a foot's sole, in the foot's own frame: the furthest-forward point of the vertices the foot bone carries alone that
// touch the ground in the bind pose (a peeling heel turns about it). Null if it has none. As engine/actor.js reads it for a biped.
function toeOf(model, foot) {
  let mesh = null;
  model.traverse(o => { if (o.isSkinnedMesh && o.skeleton.bones.includes(foot)) mesh = o; });
  if (!mesh) return null;
  const bone = mesh.skeleton.bones.indexOf(foot), { position, skinIndex, skinWeight } = mesh.geometry.attributes, p = new THREE.Vector3();
  let toe = null;
  for (let i = 0; i < position.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === bone) w += skinWeight.getComponent(i, k);
    if (w < .999) continue;
    p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    if (p.y < .004 && (!toe || p.x > toe.x)) toe = p.clone();
  }
  return toe && foot.worldToLocal(toe.setZ(foot.getWorldPosition(p).z).setY(0));
}

// Points of a model's skin that a gesture must not take under the ground: every so many vertices of each skinned mesh, and each bone's farthest vertex (the
// horns' tips, the toes, the tail's end, the wings' fingers), each with its bones and weights at the bind pose. Shared by the copies of one model.
const skinProbes = new WeakMap();
function skinProbeOf(mesh, budget) {
  const geometry = mesh.geometry;
  if (skinProbes.has(geometry)) return skinProbes.get(geometry);
  const { position, skinIndex, skinWeight } = geometry.attributes;
  if (!position || !skinIndex || !skinWeight) { skinProbes.set(geometry, null); return null; }
  const n = position.count, chosen = new Set(), stride = Math.max(1, Math.floor(n / budget)), groups = new Map(), v = new THREE.Vector3();
  for (let i = Math.floor(stride / 2); i < n; i += stride) chosen.add(i);
  for (let i = 0; i < n; i++) {
    let bone = 0, most = -1; for (let k = 0; k < 4; k++) { const w = skinWeight.getComponent(i, k); if (w > most) { most = w; bone = skinIndex.getComponent(i, k); } }
    v.fromBufferAttribute(position, i);
    const g = groups.get(bone) ?? { x: 0, y: 0, z: 0, n: 0, list: [] }; g.x += v.x; g.y += v.y; g.z += v.z; g.n++; g.list.push(i); groups.set(bone, g);
  }
  for (const g of groups.values()) {
    let far = -1, at = -1;
    for (const i of g.list) { v.fromBufferAttribute(position, i); const d = (v.x - g.x / g.n) ** 2 + (v.y - g.y / g.n) ** 2 + (v.z - g.z / g.n) ** 2; if (d > far) { far = d; at = i; } }
    if (at >= 0) chosen.add(at);
  }
  const list = [...chosen], probe = { count: list.length, base: new Float32Array(list.length * 3), bones: new Uint16Array(list.length * 4), weights: new Float32Array(list.length * 4) };
  list.forEach((i, j) => {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix); v.toArray(probe.base, j * 3);
    for (let k = 0; k < 4; k++) { probe.bones[j * 4 + k] = skinIndex.getComponent(i, k); probe.weights[j * 4 + k] = skinWeight.getComponent(i, k); }
  });
  skinProbes.set(geometry, probe);
  return probe;
}
/** A model's skin points to measure: [{ mesh, probe, rows, done }] for its skinned meshes. */
function skinOf(model, budget = 160) {
  const meshes = []; model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  const total = meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0) || 1;
  return meshes.map(mesh => ({ mesh, probe: skinProbeOf(mesh, Math.max(12, Math.round(budget * mesh.geometry.attributes.position.count / total))), rows: new Float64Array(mesh.skeleton.bones.length * 4), done: new Uint8Array(mesh.skeleton.bones.length) })).filter(entry => entry.probe);
}
const toFrame = new THREE.Matrix4(), skinPre = new THREE.Matrix4(), skinBone = new THREE.Matrix4();
// The ground in a friend's root frame (the root stands 4 cm over it) less the 2 cm a point of the skin may touch into it (a sniff, a nibble).
const GROUND_FLOOR = -.06;
/** The lowest of a model's skin points as drawn now, in `frame`'s space (its y), skinned as the GPU does. */
function lowestSkin(skin, frame) {
  toFrame.copy(frame.matrixWorld).invert();
  const pre = skinPre, m = skinBone;
  let low = Infinity;
  for (const { mesh, probe, rows, done } of skin) {
    const bones = mesh.skeleton.bones; done.fill(0);
    pre.multiplyMatrices(toFrame, mesh.matrixWorld).multiply(mesh.bindMatrixInverse);
    for (let j = 0; j < probe.count; j++) {
      const x = probe.base[j * 3], y = probe.base[j * 3 + 1], z = probe.base[j * 3 + 2]; let h = 0;
      for (let k = 0; k < 4; k++) {
        const w = probe.weights[j * 4 + k]; if (!w) continue;
        const b = probe.bones[j * 4 + k];
        // (only the frame's y of each bone's skinning matrix is needed: its second row)
        if (!done[b]) { m.multiplyMatrices(pre, bones[b].matrixWorld).multiply(mesh.skeleton.boneInverses[b]); const e = m.elements; rows[b * 4] = e[1]; rows[b * 4 + 1] = e[5]; rows[b * 4 + 2] = e[9]; rows[b * 4 + 3] = e[13]; done[b] = 1; }
        h += w * (rows[b * 4] * x + rows[b * 4 + 1] * y + rows[b * 4 + 2] * z + rows[b * 4 + 3]);
      }
      if (h < low) low = h;
    }
  }
  return low;
}

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
      const skin = skinOf(model);
      const mixer = new THREE.AnimationMixer(model);
      const clips = new Map(gltf.animations.map(c => [c.name.toLowerCase(), c]));
      const bone = name => model.getObjectByName(name) || model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
      const head = bone('Head'), jaw = bone('Jaw'), body = bone('Body'), shoulders = bone('Shoulders'), tail = bone('Tail1');
      // The gesture rig: the long-necked adult rigs have Hips/Chest where the baby rig has Body/Shoulders. A winged friend's legs hang
      // from her Hips, so her crouches lower the Spine (the thighs stay planted).
      const neck = bone('Neck'), rigBody = body || bone(art.winged ? 'Spine' : 'Hips'), rigShoulders = shoulders || bone('Chest');
      const winged=Boolean(art.winged);
      // A winged friend stands on two jointed legs (thigh, shin, foot): the gestures lift the thigh, footing bends all three.
      const legs = winged ? ['LeftFoot','RightFoot'].map(bone).filter(Boolean).map(foot=>({leg:foot.parent.parent,shin:foot.parent,foot,front:false,jointed:true}))
        : ['FrontLeg.L','FrontLeg.R','BackLeg.L','BackLeg.R'].map(name=>({leg:bone(name),foot:bone(name.replace('Leg','Foot')),front:name.startsWith('Front')})).filter(pair=>pair.leg&&pair.foot);
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
      if(!walkGaits.has(id))walkGaits.set(id,measureWalkGait(model,root,clips.get('walk'),legs.map(pair=>pair.foot),winged?L*.3:L*(id==='brontosaurus'?.45:.42)));
      const gait=walkGaits.get(id),pivotHeight=legs.reduce((sum,pair)=>sum+root.worldToLocal(pair.leg.getWorldPosition(new THREE.Vector3())).y,0)/Math.max(1,legs.length);
      const footing=createFooting({root,rootFrame:true,pivotHeight,
        legs:legs.map(pair=>pair.jointed?{foot:pair.foot,girdle:0,jointed:true,toe:toeOf(model,pair.foot)}:{foot:pair.foot,girdle:pair.front?0:1}),
        tuning:winged?BIPED:{...QUADRUPED,strideReach:.8,joinTime:[.05,.1,.12]}});
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
      const additiveBones=[...new Set([head,jaw,body,shoulders,tail,neck,rigBody,rigShoulders,...(winged?['LeftUpperArm','RightUpperArm'].map(bone):[]),...supportBones,...legs.flatMap(p=>[p.leg,p.shin,p.foot])].filter(Boolean))];
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
      // ---- Flight (winged friends): the model's own takeOff, fly, glide, land and carry clips, and the root along a path. ----
      // The clips keep her hips at flying height (the takeOff and land clips lift and lower them), so the root runs along the ground
      // under her, or wherever the scene wants the path to go: fly(points) starts from the root's place, takes off if she is on the
      // ground (the root stays through the crouch and starts to move in the leap) and cruises along the points at `speed` (world
      // metres a second, a smooth curve through them, her nose along it); at the end she hovers, or lands if land() was asked for.
      // land(point) comes down on the point through the land clip (she touches it at 70 % of the clip). carry(on) swaps the
      // cruise clip for the one with a child on her back. Everything runs on the game clock (update), so a pause holds her in the air.
      const canFly=winged&&['takeoff','fly','glide','land','carry'].every(name=>clips.has(name));
      let flight=null,carrying=false;
      const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a)),toVector=p=>p.isVector3?p.clone():new THREE.Vector3(...p),flightRate={takeoff:1.25,land:1.15};
      const cruiseClip=()=>carrying?'carry':(reducedMotion||flight?.glide)?'glide':'fly';
      function flightClip(name,{once=false,fade=.3,rate=1}={}){
        const clip=clips.get(name);if(!clip)return null;
        const next=mixer.clipAction(clip);
        next.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,Infinity);next.clampWhenFinished=once;
        if(next===action&&!once){next.setEffectiveTimeScale(rate);return next;}
        next.reset().setEffectiveTimeScale(rate).setEffectiveWeight(1).play();
        if(action&&action!==next)action.crossFadeTo(next,fade,false);
        action=next;return next;
      }
      function cancelFlight(){flight=null;}
      function beginFlight(points,{speed=2.4,glide=false,onDone=null}={}){
        if(disposed||!canFly||!root.visible||!Array.isArray(points)||!points.length)return false;
        const path=[root.position.clone(),...points.map(toVector)];
        if(path.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))return false;
        const length=path.reduce((sum,p,i)=>i?sum+p.distanceTo(path[i-1]):0,0);
        const aloft=flight&&flight.phase!=='takeoff'&&flight.phase!=='landing';
        if(flight?.phase==='landing')return false;
        const curve=length<1e-3?null:path.length>2?new THREE.CatmullRomCurve3(path,false,'centripetal'):new THREE.LineCurve3(path[0],path[1]);
        flight={phase:aloft?'cruise':flight?.phase??'takeoff',curve,length:curve?curve.getLength():0,s:0,speed:Math.max(.1,speed),glide:Boolean(glide),onDone,age:aloft?0:flight?.age??0,cruiseAge:0,
          landPoint:null,landYaw:null,onLanded:null,landFrom:null,landStart:0,arrived:false};
        if(!aloft&&flight.age===0){
          // Off the ground: the feet and the walk are let go, the gesture and the eyes stay.
          support=null;footing.restore();footingMode=false;clipLeft=0;clipName=null;motion='takeoff';motionAge=0;
          flightClip('takeoff',{once:true,fade:.2,rate:flightRate.takeoff});
        }else if(aloft){motion='fly';flightClip(cruiseClip());}
        return true;
      }
      function beginLanding(){
        const f=flight;f.phase='landing';f.age=0;f.landFrom=root.position.clone();motion='land';motionAge=0;
        flightClip('land',{once:true,fade:.3,rate:flightRate.land});
      }
      function landAt(point,{yaw=null,onDone=null}={}){
        if(disposed||!canFly||!flight||flight.phase==='landing'||!point)return false;
        const p=toVector(point);if(![p.x,p.y,p.z].every(Number.isFinite))return false;
        flight.landPoint=p;flight.landYaw=yaw;flight.onLanded=onDone;
        if(flight.arrived)beginLanding();
        return true;
      }
      function setCarry(on=true){
        carrying=Boolean(on);
        if(flight&&(flight.phase==='cruise'||flight.phase==='hover'))flightClip(cruiseClip());
      }
      function stepFlight(dt){
        const f=flight;f.age+=dt;
        const turn=(target,rate)=>{root.rotation.y+=wrapAngle(target-root.rotation.y)*(1-Math.exp(-dt/rate));};
        if(f.phase==='landing'){
          const duration=clips.get('land').duration/flightRate.land,u=Math.min(1,f.age/duration),ease=THREE.MathUtils.smootherstep(Math.min(1,u/.7),0,1);
          root.position.lerpVectors(f.landFrom,f.landPoint,ease);
          if(f.landYaw!==null)turn(f.landYaw,.35);
          if(u>=1){flight=null;root.position.copy(f.landPoint);setMotion('idle');f.onLanded?.();}
          return;
        }
        const clipAge=f.phase==='takeoff'?f.age*flightRate.takeoff/clips.get('takeoff').duration:1;
        if(f.phase==='takeoff'&&clipAge>=1){f.phase='cruise';f.cruiseAge=0;motion='fly';flightClip(cruiseClip(),{fade:.35});}
        if(f.phase==='cruise'||f.phase==='hover')f.cruiseAge+=dt;
        if(!f.curve){if(f.phase==='cruise'){f.phase='hover';f.arrived=true;f.onDone?.();if(f.landPoint)beginLanding();}return;}
        // The leap starts the move (from half the takeOff clip on); the cruise eases in, and eases out when a landing is next.
        const go=f.phase==='takeoff'?THREE.MathUtils.smoothstep(clipAge,.5,1):f.phase==='cruise'?Math.min(1,.35+.65*f.cruiseAge/.6):0;
        if(go>0){
          const left=f.length-f.s,stop=f.landPoint?Math.min(1,.3+.7*left/Math.max(.5,f.speed)):1;
          f.s=Math.min(f.length,f.s+f.speed*go*stop*dt);
          const u=f.length>0?f.s/f.length:1;
          f.curve.getPointAt(u,root.position);
          const tangent=f.curve.getTangentAt(Math.min(.999,u),new THREE.Vector3());
          if(Math.hypot(tangent.x,tangent.z)>.05)turn(Math.atan2(-tangent.z,tangent.x),.3);
          if(f.s>=f.length-1e-4&&f.phase==='cruise'){f.phase='hover';f.arrived=true;f.onDone?.();if(f.landPoint&&flight===f)beginLanding();}
        }else if(f.phase==='takeoff'){
          const tangent=f.curve.getTangentAt(0,new THREE.Vector3());
          if(Math.hypot(tangent.x,tangent.z)>.05)turn(Math.atan2(-tangent.z,tangent.x),.4);
        }
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
        if(disposed||!clip||reducedMotion||motion==='walk'||motion==='reach-walk'||support||flight)return false;
        const next=mixer.clipAction(clip);
        next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        if(action&&action!==next)action.crossFadeTo(next,fade,false);
        action=next;clipLeft=clip.duration*Math.max(.1,loops);clipName=name;return true;
      }
      // Gestures keep the friends' common size (length): the big Þórseðla baby hops and leans as far as the others
      // do, not 1.62 times as far (a 0.8 m hop lifted her tail into the branch behind her rest).
      const rig={pose,head,neck,jaw,body:rigBody,shoulders:rigShoulders,tail,legs,lids,rotateInRoot,offsetInRoot,length,species:id,crossed:at=>gestureFrom<at&&gesture.t>=at,
        wings:winged?['LeftUpperArm','RightUpperArm'].map(bone).filter(Boolean):[]};
      function setMotion(name,options={}) {
        if(disposed) return;
        // The older gesture names start the matching gesture over a still stance.
        if(GESTURE_ALIASES[name]){setMotion('idle',options);startGesture(name);return;}
        if(flight&&!['takeoff','fly','land'].includes(name))cancelFlight();
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
        reveal() { root.visible=true;cancelFlight();carrying=false;clipLeft=0;clipName=null;support=null;stance=0;lookEnabled=false;lookWeight=0;restoreBasePose();footing.restore();footing.reset();lastPosition.copy(root.position);setMotion('reveal');lids?.blink.blink(); },
        gesture(name) { return startGesture(name); },
        /** One of the model's own clips for `loops` rounds ('eat', 'happy'), then idle; false when this friend has none. */
        playClip(name,options) { return playClip(name,options); },
        /** Drop a running gesture and open the eyes (a restart or a cancelled script). */
        stopGesture() { gesture=null;if(clipLeft>0){clipLeft=0;clipName=null;play(motion==='walk'||motion==='reach-walk'?'walk':'idle');}lids?.blink.rest(0,.2); },
        conceal() { root.visible=false; cancelFlight(); carrying=false; gesture=null; clipLeft=0; clipName=null; support=null; stance=0; lookEnabled=false;lookWeight=0;restoreBasePose();pose.position.set(0,0,0);pose.rotation.set(0,0,0);setMotion('idle'); },
        walk(active=true) { setMotion(active?'walk':'idle'); },
        /** Winged friends: fly the root through `points` (Vector3s or [x, y, z], world metres, from where she is) at `speed` m/s, taking
         *  off first if she is on the ground; she hovers at the last point, or lands if land() follows. `glide` holds her wings out;
         *  `onDone` is called on arrival. False when this friend cannot fly or is landing. */
        fly(points,options) { return beginFlight(points,options); },
        /** Come down on `point` (after the path of fly(), or at once if she hovers); `yaw` turns her to face it (the root's rotation.y). */
        land(point,options) { return landAt(point,options); },
        /** A child on her back: the cruise clip with two slow, steady beats (false: the ordinary flight). */
        carry(on=true) { setCarry(on); },
        /** The flight in progress: { phase: 'takeoff' | 'cruise' | 'hover' | 'landing', progress (0..1 of the path) }, or null. */
        getFlight() { return flight?{phase:flight.phase,progress:flight.length>0?flight.s/flight.length:1,carrying}:null; },
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
        setReducedMotion(value) { reducedMotion=Boolean(value); if(flight&&(flight.phase==='cruise'||flight.phase==='hover'))flightClip(cruiseClip()); },
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
          if(flight)stepFlight(dt);
          const dx=root.position.x-lastPosition.x,dz=root.position.z-lastPosition.z,distance=Math.hypot(dx,dz),walking=motion==='walk'||motion==='reach-walk';
          const signed=dx*Math.cos(root.rotation.y)-dz*Math.sin(root.rotation.y)<-.15*distance?-1:1;
          travelSpeed=distance/dt;lastPosition.copy(root.position);
          if(walking&&gait){walkRate=signed*travelSpeed/(gait.naturalSpeed*root.scale.x);action?.setEffectiveTimeScale(walkRate);walkDistance+=distance;}
          else walkRate=0;
          mixer.update(dt); lids?.update(dt);
          if(clipLeft>0){clipLeft-=dt;if(clipLeft<=0){clipLeft=0;clipName=null;play(motion==='walk'||motion==='reach-walk'?'walk':'idle');}}
          pose.position.set(0,0,0); pose.rotation.set(0,0,0);
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
            // Nothing of the friend goes into the ground: the root stands 4 cm over it, and where the gesture would take a point of the skin more than 2 cm
            // under it (a sit back, a lowered head, a roll), the whole friend is lifted by that much (veggir).
            if(!flight){const low=lowestSkin(skin,root);if(low<GROUND_FLOOR){pose.position.y+=GROUND_FLOOR-low;root.updateMatrixWorld(true);}}
          }
        },
        getDebugState() { return {species:id,isBaby:art.isBaby,flight:flight?{phase:flight.phase,progress:flight.length>0?flight.s/flight.length:1}:null,carrying,motion,elapsed,gesture:gesture?.name || null,clip:clipLeft>0?clipName:null,stance,support:support?{mode:support.mode,progress:support.age/support.duration}:null,gait:gait?{naturalSpeed:gait.naturalSpeed*root.scale.x,cycle:gait.cycle,rate:walkRate,speed:travelSpeed,distance:walkDistance}:null,reducedMotion,looking:lookEnabled,clips:[...clips.keys()],eyelids:Boolean(lids),visible:root.visible}; },
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
