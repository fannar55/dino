import * as THREE from 'three';

// A small kinematic clearance layer, not a physics simulation. The envelopes
// come from the original skin-position/weight buffers (also retained by LODs).
// Each dominant-bone cloud is split into short longitudinal slices. This keeps
// the long neck and tapered tail from becoming one enormous body rectangle.
// Boxes follow the live skeleton; .015m padding covers blended skin boundaries.
const cache = new WeakMap();
const partKind = name => /Tail/i.test(name) ? 'tail' : /Head|Jaw/i.test(name) ? 'head' : /Neck/i.test(name) ? 'neck' : /Leg|Foot|Toe/i.test(name) ? 'leg' : 'body';

export function measureActor(actor) {
  if (cache.has(actor)) return cache.get(actor);
  actor.root.updateMatrixWorld(true);
  const inverseRoot = actor.root.matrixWorld.clone().invert(), bounds = new THREE.Box3(), parts = [];let nose=null,noseX=-Infinity;
  const point = new THREE.Vector3();
  actor.model.traverse(mesh => {
    if (!mesh.isSkinnedMesh || / shadow$/.test(mesh.name)) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (!position || !skinIndex || !skinWeight) return;
    const rootMatrix = inverseRoot.clone().multiply(mesh.matrixWorld), clouds = new Map();
    const sourceLength = new THREE.Box3().setFromBufferAttribute(position).getSize(new THREE.Vector3()).x;
    const step = sourceLength / 10;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i); bounds.expandByPoint(point.clone().applyMatrix4(rootMatrix));
      let joint = 0, weight = -1;
      for (let n = 0; n < 4; n++) { const w = skinWeight.getComponent(i, n); if (w > weight) { weight = w; joint = skinIndex.getComponent(i, n); } }
      const bone=mesh.skeleton.bones[joint],rootX=point.clone().applyMatrix4(rootMatrix).x;
      if(partKind(bone.name)==='head'&&rootX>noseX){noseX=rootX;nose={bone,point:point.clone().applyMatrix4(mesh.skeleton.boneInverses[joint].clone().multiply(mesh.bindMatrix))};}
      // A broad frill and a narrow beak share Head. Separate that curved surface
      // in all three axes so empty bounding-box corners do not become obstacles.
      const key = partKind(bone.name)==='head'?`${joint}:${Math.floor(point.x/step)}:${Math.floor(point.y/step)}:${Math.floor(point.z/step)}`:`${joint}:${Math.floor(point.x / step)}`;
      if (!clouds.has(key)) clouds.set(key, { joint, box: new THREE.Box3(), count: 0 });
      const cloud = clouds.get(key); cloud.box.expandByPoint(point); cloud.count++;
    }
    for (const { joint, box, count } of clouds.values()) {
      if (!count || box.isEmpty()) continue;
      const bone = mesh.skeleton.bones[joint], bind = mesh.skeleton.boneInverses[joint].clone().multiply(mesh.bindMatrix);
      parts.push({ bone, bind, center: box.getCenter(new THREE.Vector3()), half: box.getSize(new THREE.Vector3()).multiplyScalar(.5), kind: partKind(bone.name), name: bone.name, count });
    }
  });
  const size = bounds.getSize(new THREE.Vector3());
  const result = { front: bounds.max.x, rear: -bounds.min.x, halfWidth: Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)), height: size.y, length: size.x, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, parts,nose };
  cache.set(actor, result); return result;
}

function boxFromMatrix(center, half, matrix, padding = 0) {
  const e = matrix.elements, axes = [[e[0],e[1],e[2]],[e[4],e[5],e[6]],[e[8],e[9],e[10]]];
  const lengths = axes.map(axis => Math.hypot(...axis));
  axes.forEach((axis,i) => axis.forEach((_,n) => { axis[n] /= lengths[i] || 1; }));
  return { center: center.clone().applyMatrix4(matrix).toArray(), axes, half: half.toArray().map((v,i) => v * lengths[i] + padding) };
}

export function actorCollisionSnapshot(actor, id = actor.root.name) {
  const envelope = measureActor(actor); actor.root.updateMatrixWorld(true);
  const parts = envelope.parts.map(part => ({ ...boxFromMatrix(part.center, part.half, part.bone.matrixWorld.clone().multiply(part.bind), .015), kind: part.kind, name: part.name }));
  const pose=actor.getDebugState?.();
  return { id, species: actor.species, position: actor.root.position.toArray(), yaw: actor.root.rotation.y, scale: actor.root.scale.toArray(), motion:pose?.motion,gesture:pose?.gesture,nose:envelope.nose?.point.clone().applyMatrix4(envelope.nose.bone.matrixWorld).toArray(),crown:actor.getSupportPosition?.().toArray(),hull: { front: envelope.front, rear: envelope.rear, halfWidth: envelope.halfWidth, height: envelope.height }, parts };
}

const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const subtract = (a,b) => a.map((v,i)=>v-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

// Signed separating-axis clearance. Positive means disjoint; negative is the
// minimum translation needed to separate these measured oriented envelopes.
export function boxClearance(a,b) {
  const sphereGap=Math.hypot(...subtract(b.center,a.center))-Math.hypot(...a.half)-Math.hypot(...b.half);
  if(sphereGap>.15)return sphereGap;
  const delta = subtract(b.center,a.center), axes = [...a.axes,...b.axes];
  for (const u of a.axes) for (const v of b.axes) { const axis = cross(u,v), length = Math.hypot(...axis); if (length > 1e-6) axes.push(axis.map(x=>x/length)); }
  let separation = -Infinity;
  for (const axis of axes) {
    const radius = box => box.half.reduce((sum,r,i)=>sum+r*Math.abs(dot(axis,box.axes[i])),0);
    separation = Math.max(separation,Math.abs(dot(delta,axis))-radius(a)-radius(b));
  }
  return separation;
}

export function boxFromCorners(corners, id='object') {
  // Corners use the common nested x/y/z loop order emitted by cargoCorners.
  const origin=corners[0],vectors=[subtract(corners[4],origin),subtract(corners[2],origin),subtract(corners[1],origin)];
  const lengths=vectors.map(v=>Math.hypot(...v));
  return { id,kind:'object',center:origin.map((v,i)=>v+vectors.reduce((s,e)=>s+e[i]/2,0)),axes:vectors.map((v,i)=>v.map(n=>n/lengths[i])),half:lengths.map(n=>n/2) };
}

export function assessActorClearances(actors,{objects=[],allowContact=()=>false,tolerance=.045}={}) {
  const pairs=[],violations=[];
  function assess(a,b,partsB) {
    let clearance=Infinity,closest=null;
    for (const ap of a.parts) for (const bp of partsB) {
      const distance=boxClearance(ap,bp);
      if (allowContact(a,ap,b,bp,distance)) continue;
      if (distance<clearance) { clearance=distance;closest={partA:ap.name??ap.kind,partB:bp.name??bp.kind,kindA:ap.kind,kindB:bp.kind,centerA:ap.center,centerB:bp.center}; }
    }
    const result={a:a.id,b:b.id,clearance,...closest};pairs.push(result);
    if(clearance < -tolerance) violations.push(result);
  }
  for(let i=0;i<actors.length;i++) {
    for(let j=i+1;j<actors.length;j++) {
      const a=actors[i],b=actors[j];
      if(Math.hypot(a.position[0]-b.position[0],a.position[2]-b.position[2])>6) continue;
      assess(a,b,b.parts);
    }
    for(const object of objects) assess(actors[i],object,object.parts??[object]);
  }
  return {method:'dominant-bone longitudinal oriented envelopes',tolerance,minimum:pairs.length?Math.min(...pairs.map(p=>p.clearance)):null,pairs,violations};
}

export function objectBox(id,center,half,yaw=0,kind='object') {
  return {...boxFromMatrix(new THREE.Vector3(),new THREE.Vector3(...half),new THREE.Matrix4().compose(new THREE.Vector3(...center),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(1,1,1))),id,kind};
}

/** Repose a measured current skeleton for deterministic route planning. */
export function reposedSnapshot(snapshot,position,yaw) {
  const angle=yaw-snapshot.yaw,c=Math.cos(angle),s=Math.sin(angle),rotate=v=>[c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]];
  return {...snapshot,position:[...position],yaw,parts:snapshot.parts.map(part=>({...part,center:rotate(subtract(part.center,snapshot.position)).map((v,i)=>v+position[i]),axes:part.axes.map(rotate)}))};
}

function tubeBoxes(id,points,radius) {
  const parts=[];
  for(let i=1;i<points.length;i++) {
    const a=new THREE.Vector3(...points[i-1]),b=new THREE.Vector3(...points[i]),axis=b.clone().sub(a),length=axis.length();
    const matrix=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),axis.normalize()),new THREE.Vector3(1,1,1));
    parts.push({...boxFromMatrix(new THREE.Vector3(),new THREE.Vector3(length/2,radius,radius),matrix),kind:id,name:`${id}-${i}`});
  }
  return {id,parts};
}

/** Build object envelopes from actual rendered transforms/cargo corners. */
export function bridgeCollisionObjects(bridge) {
  const objects=[];if(!bridge)return objects;
  if(bridge.collision?.logMatrix) {
    const matrix=new THREE.Matrix4().fromArray(bridge.collision.logMatrix),parts=[];
    // Twelve flat-sided sectors closely bound the hollow bark; the open centre
    // is deliberately not filled by a solid box or an invisible cylinder.
    const length=bridge.collision.logLength,radius=bridge.collision.logRadius;
    for(let i=0;i<16;i++) {
      const angle=(i+.5)/16*Math.PI*2;
      if(Math.cos(angle)*radius>.82)continue;
      const local=new THREE.Matrix4().makeRotationX(angle);local.setPosition(0,Math.cos(angle)*(radius-.18),Math.sin(angle)*(radius-.18));
      parts.push({...boxFromMatrix(new THREE.Vector3(),new THREE.Vector3(length/2,.19,radius*Math.sin(Math.PI/16)),matrix.clone().multiply(local)),kind:'log',name:`bark-${i}`});
    }
    parts.push({...boxFromMatrix(new THREE.Vector3(0,.74,0),new THREE.Vector3(length/2,.14,.62),matrix),kind:'log',name:'bark-walking-top'});
    objects.push({id:'main-log',parts});
  }
  for(const tube of bridge.collision?.tubes??[])objects.push(tubeBoxes(tube.id,tube.points,tube.radius));
  const cargo=bridge.boardwalk?.cargo;
  if(cargo?.visible&&cargo.corners.length===8)objects.push(cargo.slices?.length?{id:'carried-bark',parts:cargo.slices.map((corners,i)=>({...boxFromCorners(corners),name:`bark-slice-${i}`}))}:boxFromCorners(cargo.corners,'carried-bark'));
  return objects;
}

export function assessSceneClearances(stats) {
  const actors=stats.collisionActors??[],bridge=stats.bridge,objects=[...(stats.collisionObjects??[]),...bridgeCollisionObjects(stats.bridge)];
  if(!bridge)return assessActorClearances(actors);
  const permitted=[];
  function allowContact(a,ap,b,bp,distance) {
    const phase=bridge.action?.phase,id=bridge.action?.id;
    let allowed=false;
    const near=(point,radius)=>point&&Math.hypot(...subtract(ap.center,point))<radius;
    if(b.species)allowed=ap.kind==='head'&&bp.kind==='head'&&(a.gesture==='nuzzle'||b.gesture==='nuzzle')&&near(a.nose,.4)&&distance>=-.08;
    if(b.id==='branch')allowed=a.species==='brontosaurus'&&ap.kind==='head'&&(bridge.branch.held||id==='lift'||phase==='release')&&near(a.crown,.4)&&distance>=-.10;
    // Initial withdrawal retains the same working contact. Its measured skin
    // is already clear, while the padded head/bark boxes still touch briefly.
    const pushing=['brace','roll'].includes(phase)||phase==='settle'&&bridge.action.progress<=.25;
    if(b.id==='main-log')allowed=a.species==='triceratops'&&ap.kind==='head'&&id==='roll'&&pushing&&near(a.nose,.42)&&distance>=-.10||bridge.bridge.built&&ap.kind==='leg'&&bp.name==='bark-walking-top'&&ap.center[1]>bridge.bridge.walkable.deckY-.2&&distance>=-.12;
    if(b.id==='carried-bark')allowed=a.species==='stegosaurus'&&ap.kind==='head'&&id==='lay'&&['pickup','carry','straighten','place'].includes(phase)&&near(a.nose,.4)&&distance>=-.1;
    if(allowed&&distance<0)permitted.push({actor:a.id,part:ap.name,object:b.id,clearance:distance});
    return allowed;
  }
  const result=assessActorClearances(actors,{objects,allowContact});
  return {...result,actors:actors.length,parts:actors.reduce((sum,a)=>sum+a.parts.length,0),permittedContacts:permitted};
}

