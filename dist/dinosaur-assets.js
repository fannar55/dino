import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/SkeletonUtils.js';

// Geometry, skin and authored clips are packaged locally. The last two land
// animals have substantially rebuilt anatomy and fresh animation, from CC0 bases.
const files = {
  triceratops: 'dinosaurs/triceratops.glb', stegosaurus: 'dinosaurs/stegosaurus.glb',
  trex: 'dinosaurs/trex.glb', parasaurolophus: 'dinosaurs/parasaurolophus.glb',
  brachiosaurus: 'dinosaurs/brachiosaurus.glb', spinosaurus: 'dinosaurs/spinosaurus.glb',
  pteranodon: 'pteranodon/pteranodon.glb',
};
const templates = new Map();
let pending;

// The internal save key is retained; these are measured Brontosaurus anchors.
export const SAUROPOD_ANATOMY = Object.freeze({
  mouth: Object.freeze([4.31, 2.245, 0]),
  browse: Object.freeze([1.85, 4.65, 0]),
  eye: Object.freeze([3.90, 2.40, .12, .068]),
});

/** Bend the real weighted neck while keeping the four legs on their ground.
 * Restore before the next animation update so additive poses never accumulate. */
export function createSauropodNeckPose(animal) {
  const head=animal.bone?.('Head'),chain=['Head','Neck','Shoulders'].map(name=>animal.bone?.(name)).filter(Boolean);
  if(!head||chain.length!==3)return null;
  animal.group.updateMatrixWorld(true);
  const mouth=new THREE.Object3D();mouth.name='Gentle backpack grip';
  mouth.position.copy(head.worldToLocal(animal.group.localToWorld(new THREE.Vector3(...SAUROPOD_ANATOMY.mouth))));head.add(mouth);
  let original=null;
  function restore(){if(original){chain.forEach((bone,i)=>bone.quaternion.copy(original[i]));original=null;}}
  function aim(target,weight=1,{levelMuzzle=false}={}){
    restore();if(weight<=0)return;
    original=chain.map(bone=>bone.quaternion.clone());
    const carryDirection=levelMuzzle?new THREE.Vector3(1,-.07,0).applyQuaternion(animal.group.getWorldQuaternion(new THREE.Quaternion())).normalize():null;
    for(let iteration=0;iteration<(levelMuzzle?48:18);iteration++)for(const[i,bone]of chain.entries()){
      // getWorldPosition updates the necessary parent chain. Avoid traversing
      // every mesh/accessory on all 54 solver steps, especially on tablets.
      const origin=bone.getWorldPosition(new THREE.Vector3()),end=mouth.getWorldPosition(new THREE.Vector3()).sub(origin),goal=i===0&&carryDirection?carryDirection.clone():target.clone().sub(origin);
      if(end.lengthSq()<1e-8||goal.lengthSq()<1e-8)continue;
      const delta=new THREE.Quaternion().setFromUnitVectors(end.normalize(),goal.normalize());
      const angle=2*Math.acos(THREE.MathUtils.clamp(delta.w,-1,1));if(angle>.22)delta.slerp(new THREE.Quaternion(),1-.22/angle);
      const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));
      // Carrying uses the neck for reach and counter-rotates the head so its
      // muzzle does not point upward through the child hanging from the loop.
      // Browsing/ordinary anatomy retains the previous limits and solver.
      const limit=i===0?(levelMuzzle?1.7:.60):i===1?1.35:1.45,offset=original[i].angleTo(bone.quaternion);
      if(offset>limit){const solved=bone.quaternion.clone();bone.quaternion.copy(original[i]).slerp(solved,limit/offset);}
    }
    chain.forEach((bone,i)=>bone.quaternion.copy(original[i].clone().slerp(bone.quaternion,weight)));
    animal.group.updateMatrixWorld(true);
  }
  return{mouth,aim,restore,dispose(){restore();mouth.removeFromParent();}};
}

// A rising happy state triggers one grounded greeting, then settles fully even
// while the success card stays visible. Time comes from the paused game clock.
export function createCelebrationMotion() {
  let start = -Infinity, wasHappy = false;
  const pose = { age: Infinity, active: false, lift: 0, wave: 0, nod: 0, tail: 0 };
  const smooth = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b);
  return (time, happy = 0) => {
    const strength = THREE.MathUtils.clamp(happy, 0, 1), enabled = strength > .01;
    if (enabled && !wasHappy) start = time;
    wasHappy = enabled;
    const age = time - start;
    pose.age = age; pose.active = enabled && age >= 0 && age < 2.2;
    pose.lift = pose.wave = pose.nod = pose.tail = 0;
    if (!pose.active) return pose;
    pose.lift = smooth(0, .38, age) * (1 - smooth(1.72, 2.18, age)) * strength;
    pose.wave = Math.sin((age - .45) / 1.2 * Math.PI * 4) *
      smooth(.42, .52, age) * (1 - smooth(1.62, 1.72, age)) * strength;
    pose.nod = age < 1.1 ? -Math.sin(age / 1.1 * Math.PI) * strength : 0;
    pose.tail = Math.sin(age / .95 * Math.PI * 2) * Math.sin(age / 2.2 * Math.PI) ** 2 * strength;
    return pose;
  };
}

export function preloadDinosaurAssets() {
  if (!pending) {
    const loader = new GLTFLoader();
    pending = Promise.allSettled(Object.entries(files).map(async ([type, file]) => {
      const asset = await loader.loadAsync(new URL(`./assets/${file}`, import.meta.url).href);
      const motion = type === 'pteranodon' ? 'fly' : 'walk';
      if (!asset.animations.some(clip => clip.name === motion) || !asset.animations.some(clip => clip.name === 'idle')) throw new Error('Incomplete dinosaur animation');
      templates.set(type, asset);
    })).then(() => ({ loaded: [...templates.keys()], missing: Object.keys(files).filter(type => !templates.has(type)) }));
  }
  return pending;
}

export function createImportedDinosaur(type) {
  const template = templates.get(type);
  if (!template) return null;
  const group = new THREE.Group();
  group.name = `Animated ${type}`;
  group.userData.assetSource = type === 'pteranodon' ? 'Stjörnufar / original model' : 'Quaternius CC0 base + Stjörnufar';
  const animal = cloneSkeleton(template.scene);
  group.add(animal);
  animal.traverse(object => {
    if (object.isMesh) {
      object.castShadow = true; object.receiveShadow = true;
      // Authored tail and head motion can leave a rest-pose sphere.
      object.frustumCulled = false;
    }
  });
  const mixer = new THREE.AnimationMixer(animal);
  const idle = mixer.clipAction(template.animations.find(clip => clip.name === 'idle')).play();
  const flyingAnimal = type === 'pteranodon';
  const motionClip = template.animations.find(clip => clip.name === (flyingAnimal ? 'fly' : 'walk'));
  const walk = mixer.clipAction(motionClip).play();
  walk.setEffectiveWeight(0);
  const glideClip = template.animations.find(clip => clip.name === 'glide');
  const glideAction = glideClip ? mixer.clipAction(glideClip).play().setEffectiveWeight(0) : null;
  mixer.update(0);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group, true);
  let lastTime = null, walkingWeight = 0, glideWeight = 0, disposed = false;
  const head = animal.getObjectByName('Head'), baseHead = head?.quaternion.clone();
  const tails = ['Tail1', 'Tail2'].map(name => animal.getObjectByName(name)).filter(Boolean)
    .map(bone => ({ bone, base: bone.quaternion.clone() }));
  const updateCelebration = createCelebrationMotion();
  let celebration = updateCelebration(0, 0);
  let lookWeight = 0, gazeWeight = 0;
  const strideLength = { triceratops: .92, stegosaurus: .92, trex: 1.15, parasaurolophus: .88,
    brachiosaurus: .790, spinosaurus: .873 }[type] || 1;
  return {
    group, type, bounds, height: bounds.max.y,
    bone(name) { return animal.getObjectByName(name); },
    getCelebrationState() { return celebration; },
    // Preserve a root-space accessory placement when binding to an animated bone.
    attach(accessory, boneName) {
      group.updateMatrixWorld(true);
      const bone = animal.getObjectByName(boneName);
      if (bone) bone.attach(accessory);
    },
    getMotionState() {
      return { walkPhase: flyingAnimal ? 0 : walk.time / motionClip.duration,
        walkDuration: motionClip.duration / walk.getEffectiveTimeScale(),
        baseWalkDuration: motionClip.duration, strideLength,
        footfallPhases: type === 'brachiosaurus' ? [0, .22, .5, .72] : [0, .5],
        walking: flyingAnimal ? 0 : walkingWeight,
        wingPhase: flyingAnimal ? walk.time / motionClip.duration : 0,
        wingDuration: flyingAnimal ? motionClip.duration / walk.getEffectiveTimeScale() : 0,
        flying: flyingAnimal ? walkingWeight : 0, glide: glideWeight };
    },
    update(time, { walking = 0, walkSpeed, flying = 1, glide = 0, bank = 0, look = 0, gazeHeight = 0, happy = 0 } = {}) {
      if (disposed) return;
      const delta = lastTime === null ? 0 : Math.min(.08, Math.max(0, time - lastTime)); lastTime = time;
      walkingWeight = THREE.MathUtils.damp(walkingWeight, THREE.MathUtils.clamp(flyingAnimal ? flying : walking, 0, 1), 8, delta);
      glideWeight = THREE.MathUtils.damp(glideWeight, flyingAnimal ? THREE.MathUtils.clamp(glide, 0, 1) : 0, 5, delta);
      idle.setEffectiveWeight(1 - walkingWeight); walk.setEffectiveWeight(walkingWeight * (1 - glideWeight));
      if (glideAction) glideAction.setEffectiveWeight(walkingWeight * glideWeight);
      const defaultSpeed = flyingAnimal || ['brachiosaurus', 'spinosaurus'].includes(type) ? 1 : 1.12;
      walk.setEffectiveTimeScale(Number.isFinite(walkSpeed) && !flyingAnimal ? THREE.MathUtils.clamp(walkSpeed, .05, 12) : defaultSpeed);
      if (head) head.quaternion.copy(baseHead);
      for (const tail of tails) tail.bone.quaternion.copy(tail.base);
      mixer.update(delta);
      celebration = updateCelebration(time, happy);
      if (head) {
        baseHead.copy(head.quaternion);
        lookWeight = THREE.MathUtils.damp(lookWeight, THREE.MathUtils.clamp(look, -1, 1), 4, delta);
        gazeWeight = THREE.MathUtils.damp(gazeWeight, THREE.MathUtils.clamp(gazeHeight, -1, 1), 4, delta);
        // Bone-local axes retain the rig's authored animation underneath.
        head.rotateZ(lookWeight * .14);
        head.rotateX(gazeWeight * .09 + celebration.nod * (type === 'triceratops' ? .14 : .075));
        if (flyingAnimal) head.rotateY(-THREE.MathUtils.clamp(bank, -1, 1) * .07);
      }
      for (let i = 0; i < tails.length; i++) {
        const tail = tails[i]; tail.base.copy(tail.bone.quaternion);
        if (type === 'triceratops') tail.bone.rotateZ(celebration.tail * (i === 0 ? .09 : .06));
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      mixer.stopAllAction(); mixer.uncacheRoot(animal);
      // Template geometry/materials stay cached and are shared by safe skeleton clones.
      animal.traverse(object => { if (object.isSkinnedMesh) object.skeleton.dispose(); });
      group.removeFromParent();
    },
  };
}
