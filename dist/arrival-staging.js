import * as THREE from './vendor/three.module.js';

const clamp = THREE.MathUtils.clamp;
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const angleMix = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// One authored woodland space, shared by the entrance and the discovery hunt.
// Coordinates are absolute world metres; the path is south of every pocket.
export const FIRST_FOREST_LAYOUT = Object.freeze({
  animal: [12, -11], animalYaw: .10, approachStart: [-34, -16],
  mosi: [18.2, 6.45],
  fossils: [[12, -6], [0, -6], [24, -7]], snail: [-1.4, -5.1],
  searchCamera: [12, 4.6, 2], searchTarget: [12, .8, -6.5],
  maxYaw: 1.0, maxPitch: .20,
  trees: [[-4,-8.5,14],[4,-8.5,15],[20,-9,15],[28,-10,14],[7,-20,17],[18,-20,16]],
});

export function forestEntryVegetation(groundHeight=()=>0){
  const trees=[25,37].flatMap(x=>{const nearZ=x===37?-14:-20,farZ=x===37?-17:-23;return[
    {p:[x-10.2,groundHeight(x-10.2,nearZ),nearZ],s:[13,15,13],r:[0,.8,0]},
    {p:[x-14.2,groundHeight(x-14.2,farZ),farZ],s:[12,13,12],r:[0,2.5,0]},
  ];}).concat(FIRST_FOREST_LAYOUT.trees.map(([x,z,height],i)=>({p:[x,groundHeight(x,z),z],s:[height,height,height],r:[0,i*1.71,0]})));
  const bushes=[12,25,37].flatMap(x=>{const z=x===37?-11.5:-18;return[0,2.1,4.4].map((offset,index)=>({p:[x-12.7+offset,groundHeight(x-12.7+offset,z),z],s:[3.4,4,3.4],r:[0,index*1.7,0]}));});
  const canopy=[[28,-10.5,5.8],[33,-12,6.4],[37,-13.5,5.2],[26,-16,6.5],[31,-19,7],[38,-20,6.3]].map(([x,z,h],i)=>({p:[x,groundHeight(x,z),z],s:[h,h,h],r:[0,i*1.37,0]}));
  return{trees,bushes,canopy};
}

// Low, uneven woodland clumps frame the three looking directions. They share
// the imported forest plants, leaving the fossil faces and walking lane open.
export function forestFloorVegetation(groundHeight=()=>0){
  const result={fern:[],grass:[],'rock-1':[]};
  const clusters=[[-3.6,-5.7],[2.8,-5.8],[4.6,-2.9],[7.3,-.9],[8.2,-4.5],
    [10.1,-2.4],[14.5,-2.2],[16.7,-.5],[19,-3.7],[21.2,-5.4],[26.2,-5.7],
    [3.2,.2],[20.8,.8],[1.5,-2.7],[25.7,-2.9],[-3.7,-7.2],[28,-7.3]];
  for(let c=0;c<clusters.length;c++){
    const [cx,cz]=clusters[c];
    for(let i=0;i<6;i++){
      const a=c*1.73+i*2.39996,r=.24+((c*7+i*11)%17)/17*1.05;
      const x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
      if(FIRST_FOREST_LAYOUT.fossils.some(([px,pz])=>Math.hypot(x-px,z-pz)<1.7))continue;
      const kind=i%3===2?'grass':'fern',h=(kind==='fern'?.32:.22)+((c*3+i*7)%11)/11*(kind==='fern'?.42:.29);
      result[kind].push({p:[x,groundHeight(x,z)-.025,z],s:[h,h,h],r:[0,a,0],c:new THREE.Color().setScalar(.82+((c+i)%4)*.045)});
    }
    if(c%2===0){const h=.13+(c%5)*.025;result['rock-1'].push({p:[cx+.6,groundHeight(cx+.6,cz+.3)-.025,cz+.3],s:[h*1.25,h,h],r:[0,c*.71,0]});}
  }
  return result;
}

/** Conservative articulated-body envelopes, including the explorer's turn. */
export function firstForestSweeps({stegoBounds,mosiBounds,terrainHeight=()=>0}) {
  const boxes=[],matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
  const append=(bounds,position,yaw,size,label)=>{matrix.compose(position,q.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),scale.setScalar(size));const box=bounds.clone().applyMatrix4(matrix).expandByScalar(.48);box.userData={label};boxes.push(box);};
  const [x,z]=FIRST_FOREST_LAYOUT.animal,goal=new THREE.Vector3(x,terrainHeight(x,z),z);
  const track=createArrivalTrack({species:'stegosaurus',goal,finalYaw:FIRST_FOREST_LAYOUT.animalYaw,bounds:stegoBounds,scale:2.55,cameras:[],terrainHeight});
  for(let i=0;i<=240;i++){const sample=track.sample(track.duration*i/240);append(stegoBounds,sample.position,sample.heading,2.55,'stegosaurus');}
  const stop=new THREE.Vector3(FIRST_FOREST_LAYOUT.mosi[0],terrainHeight(...FIRST_FOREST_LAYOUT.mosi),FIRST_FOREST_LAYOUT.mosi[1]);
  const start=new THREE.Vector3(2.4,0,3.6),departure=new THREE.Vector3(31.2,0,2);
  for(let i=0;i<=120;i++){const t=i/120;append(mosiBounds,start.clone().lerp(stop,t),-.08,1.6-(.75*Math.min(1,t*3)),'mosi-walk');append(mosiBounds,stop.clone().lerp(departure,t),-.08,.85,'mosi-depart');append(mosiBounds,stop.clone().lerp(new THREE.Vector3(26.1,0,1.4),t),-.08,.85,'mosi-depart-portrait');}
  for(let i=0;i<=60;i++)append(mosiBounds,stop,-.08+(1.99*i/60),.85,'mosi-turn');
  return boxes;
}

/** The larger sauropod needs room for its whole long tail, both responsive
 * approaches, and its planted-foot neck lift at the backpack boarding point. */
export function brontosaurusSweeps({bounds,scales=[2.175,2.2475],terrainHeight=()=>0,
  boardingOffset=size=>new THREE.Vector3(-5.8,0,-2.17).multiplyScalar(size/1.5)}){
  const boxes=[],matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),size=new THREE.Vector3();
  const append=(shape,position,yaw,scale,label)=>{matrix.compose(position,rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),size.setScalar(scale));const box=shape.clone().applyMatrix4(matrix).expandByScalar(.35);box.userData={label};boxes.push(box);};
  const raisedNeck=new THREE.Box3(new THREE.Vector3(.4,0,-.65),new THREE.Vector3(4.6,5.15,.65));
  for(const[mode,scale]of scales.entries()){
    const portrait=mode===0,yaw=portrait?-.32:-.08;
    const goal=new THREE.Vector3(portrait?22.1:22.8,0,portrait?-1.5:-.6);
    // The long tail can make a wide viewport extend the hidden approach by
    // several seven-metre steps. Reserve every possible runtime path, rather
    // than only the default path used by a camera-free geometry fixture.
    for(let step=0;step<=16;step++){
      const track=createArrivalTrack({species:'brachiosaurus',goal,finalYaw:yaw,bounds,scale,cameras:[],terrainHeight,startShift:step*7});
      for(let i=0;i<=64;i++){const sample=track.sample(track.duration*i/64);append(bounds,sample.position,sample.heading,scale,'brontosaurus-approach');}
    }
    const mosi=new THREE.Vector3(portrait?29.1:31.2,0,portrait?1.4:2),boarding=mosi.add(boardingOffset(scale));
    for(let i=0;i<=32;i++)append(bounds,goal.clone().lerp(boarding,i/32),yaw,scale,'brontosaurus-boarding');
    append(raisedNeck,boarding,yaw,scale,'brontosaurus-lift');
  }
  return boxes;
}

/** Move complete imported solid instances out of the reserved physical passage.
 * Leaves remain overhead. All matching material parts retain the same matrix.
 */
export function protectFirstForestPassage(scene,models,sweeps,terrainHeight=()=>0,options={}) {
  const groups=new Map(),matrix=new THREE.Matrix4(),worldMatrix=new THREE.Matrix4(),point=new THREE.Vector3();
  const area=options.area||[-43,35,-25,14],reserved=sweeps.concat(options.keepClear||[]);
  scene.updateMatrixWorld(true);
  scene.traverse(object=>{
    if(!object.isInstancedMesh)return;
    const id=object.userData.forestModel||object.name.match(/^environment:([^:]+):/)?.[1],model=models.get(id);
    if(!model||!['tree','bush','plant','rock','log'].includes(model.kind))return;
    for(let i=0;i<object.count;i++){
      object.getMatrixAt(i,matrix);worldMatrix.multiplyMatrices(object.matrixWorld,matrix);const x=worldMatrix.elements[12],z=worldMatrix.elements[14];
      if(x<area[0]||x>area[1]||z<area[2]||z>area[3])continue;
      const key=`${object.name}:${i}`;
      if(!groups.has(key))groups.set(key,{key,id,kind:model.kind,index:i,parts:[],matrix:matrix.clone(),world:worldMatrix.clone()});
      groups.get(key).parts.push(object);
    }
  });
  function solidBounds(item){
    const box=new THREE.Box3();
    for(const object of item.parts){
      const mats=Array.isArray(object.material)?object.material:[object.material];
      const woody=item.kind==='tree'&&!options.includeCrowns;
      if(woody&&mats.every(mat=>/leaves|grass/i.test(mat.name)))continue;
      const positions=object.geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(item.world);if(!woody||point.y<6.4)box.expandByPoint(point);}
    }return box;
  }
  const moved=[],solids=[];
  for(const item of groups.values()){
    let box=solidBounds(item);if(box.isEmpty())continue;
    const from=[item.world.elements[12],item.world.elements[14]];
    let tries=0;
    const needsMove=sweeps.some(sweep=>sweep.intersectsBox(box));
    while(needsMove&&reserved.some(sweep=>sweep.intersectsBox(box))&&tries++<40){
      const nextZ=item.world.elements[14]-1.8,nextY=terrainHeight(item.world.elements[12],nextZ)-.035;
      item.matrix.elements[14]-=1.8;item.matrix.elements[13]+=nextY-item.world.elements[13];item.world.elements[14]=nextZ;item.world.elements[13]=nextY;box=solidBounds(item);
    }
    if(tries){for(const object of item.parts){object.setMatrixAt(item.index,item.matrix);object.instanceMatrix.needsUpdate=true;object.computeBoundingSphere();}moved.push({id:item.id,from,to:[item.world.elements[12],item.world.elements[14]]});}
    solids.push({id:item.id,kind:item.kind,min:box.min.toArray(),max:box.max.toArray()});
  }
  return{moved,solids,sweepCount:sweeps.length,overlaps:solids.filter(solid=>sweeps.some(sweep=>sweep.intersectsBox(new THREE.Box3(new THREE.Vector3(...solid.min),new THREE.Vector3(...solid.max))))).length};
}

function outsideCameras(position, bounds, scale, cameras, heading) {
  const matrix = new THREE.Matrix4().compose(position,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0)),
    new THREE.Vector3(scale, scale, scale));
  const box = bounds.clone().applyMatrix4(matrix).expandByScalar(.4);
  return cameras.every(camera => {
    camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return !frustum.intersectsBox(box);
  });
}

/** A continuous physical entrance. Its first full model bounds are off-screen. */
export function createArrivalTrack({ species, goal, finalYaw, bounds, scale, cameras, terrainHeight = () => 0, startShift = 0 }) {
  const flying = species === 'pteranodon';
  const woodland = species === 'stegosaurus' && Math.abs(goal.z - FIRST_FOREST_LAYOUT.animal[1]) < .1;
  const shore = ['spinosaurus', 'parasaurolophus'].includes(species);
  const start = woodland ? new THREE.Vector3(FIRST_FOREST_LAYOUT.approachStart[0],goal.y,FIRST_FOREST_LAYOUT.approachStart[1]) : goal.clone().add(new THREE.Vector3(flying ? -34 : -25, flying ? 14 : 0, flying ? -38 : shore ? .5 : -9));
  start.x-=startShift;
  const groundAtGoal = terrainHeight(goal.x, goal.z);
  const groundStart = () => { if (!flying) start.y = goal.y + terrainHeight(start.x, start.z) - groundAtGoal; };
  groundStart();
  let clearanceSteps = 0;
  const makeCurve = () => flying
    ? new THREE.CatmullRomCurve3([
      start,
      goal.clone().add(new THREE.Vector3(-14, 10, -24)),
      goal.clone().add(new THREE.Vector3(7, 4.5, -12)),
      goal.clone().add(new THREE.Vector3(.5, 1, -5)),
      goal.clone(),
    ], false, 'centripetal')
    : woodland ? new THREE.CubicBezierCurve3(start,new THREE.Vector3(-8,goal.y,-16),new THREE.Vector3(6.5,goal.y,-12.2),goal.clone())
    : new THREE.CubicBezierCurve3(start,
      new THREE.Vector3(THREE.MathUtils.lerp(start.x, goal.x, .42), goal.y, goal.z + (shore ? .8 : -8)),
      goal.clone().add(new THREE.Vector3(-5.5, 0, shore ? .4 : -1.8)), goal.clone());
  let curve = makeCurve();
  const firstHeading = () => { const tangent = curve.getTangentAt(.0001); return Math.atan2(-tangent.z, tangent.x); };
  while (!outsideCameras(start, bounds, scale, cameras, firstHeading()) && clearanceSteps < 16) {
    start.x -= 7; clearanceSteps++; groundStart(); curve = makeCurve();
  }
  curve.arcLengthDivisions = 120;
  curve.updateArcLengths();
  const duration = flying ? 9 : species === 'brachiosaurus' ? 18.5 : 14.5;
  const cueDuration = flying ? .45 : .65, settleDuration = flying ? .65 : .8;
  const movementDuration = duration - cueDuration - settleDuration;
  const pathLength = curve.getLength();
  return {
    species, flying, duration, cueDuration, settleDuration, movementDuration, pathLength,
    start, goal: goal.clone(), scale, finalYaw,
    startsOutsideView: outsideCameras(start, bounds, scale, cameras, firstHeading()),
    sample(age) {
      const movement = clamp((age - cueDuration) / movementDuration, 0, 1);
      // Cover the concealed forest section first; reserve most of the shot for
      // the short, deliberate visible advance, with continuous position/speed.
      const approachTime = clamp(age - cueDuration, 0, movementDuration);
      const revealTime = flying ? movementDuration : 4.5;
      const visibleDistance = Math.min(pathLength * .45, species === 'brachiosaurus' ? 5 : 7);
      const finalTime = flying ? movementDuration : movementDuration - revealTime;
      const revealDistance = pathLength - visibleDistance;
      const revealSpeed = visibleDistance * 2 / finalTime;
      let distance, speed;
      if (flying) {
        distance = pathLength * smooth(movement);
        speed = pathLength * 6 * movement * (1 - movement) / movementDuration;
      } else if (approachTime < revealTime) {
        const t = approachTime / revealTime;
        distance = (-2 * t ** 3 + 3 * t ** 2) * revealDistance + (t ** 3 - t ** 2) * revealSpeed * revealTime;
        speed = (-6 * t ** 2 + 6 * t) * revealDistance / revealTime + (3 * t ** 2 - 2 * t) * revealSpeed;
      } else {
        const t = clamp((approachTime - revealTime) / finalTime, 0, 1);
        distance = revealDistance + visibleDistance * (2 * t - t * t);
        speed = revealSpeed * (1 - t);
      }
      const amount = clamp(distance / pathLength, 0, 1);
      const position = curve.getPointAt(amount);
      if (!flying) position.y = goal.y + terrainHeight(position.x, position.z) - groundAtGoal;
      const tangent = curve.getTangentAt(clamp(amount, .0001, .9999));
      const pathHeading = Math.atan2(-tangent.z, tangent.x);
      const turn = smooth((movement - .81) / .19);
      const heading = angleMix(pathHeading, finalYaw, turn);
      const walking = flying ? 0 : smooth(speed / .28);
      const phase = age < cueDuration ? 'foreshadow' : movement < .82 ? 'approaching' : movement < 1 ? 'slowing' : 'settling';
      const bank = flying ? Math.sin(movement * Math.PI * 2 - .25) * Math.sin(movement * Math.PI) * .65 : 0;
      return { position, heading, walking, speed, bank,
        flying: flying ? 1 : 0, glide: flying ? smooth((movement - .55) / .4) * .88 : 0,
        look: smooth((movement - .70) / .30) * .65,
        phase, progress: clamp(age / duration, 0, 1), completed: age >= duration };
    },
  };
}
