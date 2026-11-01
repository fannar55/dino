import test from 'node:test';
import assert from 'node:assert/strict';
import './setup.mjs';
const THREE=await import('three');
const {objectBox,boxClearance,boxFromCorners,measureActor,actorCollisionSnapshot,assessActorClearances}=await import('../engine/memory/memory-clearance.js');
const {createBridgeAdventure}=await import('../engine/memory/levels/berjalundur/adventure.js');
const {createBuildProps}=await import('../engine/memory/levels/berjalundur/build-props.js');

test('oriented clearance catches a long tail cutting across another body',()=>{
  const a=objectBox('tail',[0,.8,0],[1.4,.08,.08],Math.PI/4),b=objectBox('body',[.6,.8,-.6],[.35,.3,.35]);
  assert.ok(boxClearance(a,b)<-.1);
  b.center[1]=1.6;assert.ok(boxClearance(a,b)>.4,'raised neck is separated in3D even though plan views overlap');
});

test('actual cargo corner order preserves a ninety degree turn and thickness',()=>{
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(2,.64,-4),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.8),new THREE.Vector3(1,1,1));
  const corners=[];for(const x of[-1.6,1.6])for(const y of[-.175,.035])for(const z of[-.78,.78])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(matrix).toArray());
  const box=boxFromCorners(corners);assert.ok(Math.abs(box.half[0]-1.6)<1e-9);assert.ok(Math.abs(box.half[1]-.105)<1e-9);assert.ok(Math.abs(box.center[1]-.57)<1e-9);
  assert.ok(boxClearance(box,objectBox('leg',[2,.57,-4],[.1,.3,.1]))<0);
});

test('the irregular bark underside meets both measured mouths through turns and uneven head heights',()=>{
  const props=createBuildProps({scene:new THREE.Scene(),heightAt:()=>0});let panel;
  props.root.traverse(o=>{if(o.isInstancedMesh&&o.geometry.type==='ExtrudeGeometry')panel=o});assert.ok(panel);
  props.takePanel(0);
  try{for(const yaw of[0,.7,Math.PI/2]){
    const mouths=[new THREE.Vector3(-1.3,.61,0),new THREE.Vector3(1.3,.68,.025)].map(p=>p.applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(4.5,0,-17)));
    const pose=props.carryPose(mouths);props.setCargo(pose.point,pose.quaternion);const supports=props.getDebug().cargo.supports;
    supports.forEach((point,i)=>{
      assert.ok(new THREE.Vector3(...point).distanceTo(mouths[i])<.001,'each mouth touches its own support point');
      const local=props.cargo.worldToLocal(new THREE.Vector3(...point)),position=panel.geometry.attributes.position;let distance=Infinity;
      for(let j=0;j<position.count;j+=3){const triangle=new THREE.Triangle(...[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(position,j+k)));distance=Math.min(distance,triangle.closestPointToPoint(local,new THREE.Vector3()).distanceTo(local))}
      assert.ok(distance<1e-5,'the support point lies on rendered wood, not just its bounding box');
    });
    assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(pose.quaternion).y>.98,'the carried panel stays upright');
  }
  props.setCargo(new THREE.Vector3(),0);const cargo=props.getDebug().cargo,slices=cargo.slices.map(corners=>boxFromCorners(corners));
  const emptyCorner=objectBox('air',[1.3,-.1,.795],[.005,.005,.005]),wood=objectBox('wood',[1.3,-.1,.65],[.005,.005,.005]);
  assert.ok(slices.every(box=>boxClearance(box,emptyCorner)>.02),'irregular rear-edge air is not treated as a solid rectangle');
  assert.ok(slices.some(box=>boxClearance(box,wood)<0),'actual wood remains solid');
  }finally{props.dispose()}
});

test('measured skin envelopes follow actual animated bone and root transforms',()=>{
  const root=new THREE.Group(),model=new THREE.Group();root.add(model);
  const bone=new THREE.Bone();bone.name='Tail1';model.add(bone);
  const geometry=new THREE.BoxGeometry(2,.2,.2,10,2,2),count=geometry.attributes.position.count;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
  const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());model.add(mesh);mesh.bind(new THREE.Skeleton([bone]));
  const actor={root,model,species:'test'},measure=measureActor(actor);assert.equal(measure.length,2);assert.ok(Math.abs(measure.halfWidth-.1)<1e-7);
  root.position.set(3,0,4);root.rotation.y=Math.PI/2;bone.position.y=1;
  const snapshot=actorCollisionSnapshot(actor,'a');assert.ok(snapshot.parts.every(p=>Math.abs(p.center[0]-3)<1e-6&&Math.abs(p.center[1]-1)<1e-6));
  const other={id:'b',position:[3,1,4],parts:[objectBox('body',[3,1,4],[.2,.2,.2])]};assert.ok(assessActorClearances([snapshot,other]).violations.length>0);
});

for(const mode of ['rejected','pending'])test(`a ${mode} approach cannot walk through obstacles or leave the game busy`,()=>{
  const scene=new THREE.Scene(),nest={species:'brontosaurus',root:new THREE.Group(),restOffsets:[new THREE.Vector3(-1,0,0),new THREE.Vector3(1,0,0)],restYaw:0};
  let calls=0;const adventure=createBridgeAdventure({scene,heightAt:()=>0,nests:[nest],planWalk(){calls++;return mode==='pending'?undefined:null;}});
  const actors=[-1,1].map(x=>{const root=new THREE.Group(),model=new THREE.Group();root.add(model);root.position.set(x,0,2);scene.add(root);return{species:'brontosaurus',root,model,supportLocal:new THREE.Vector3(.9,1,0),getSupportPosition(){return root.position.clone().add(new THREE.Vector3(.9,1,0))},walk(){}}});
  adventure.bindPair('brontosaurus',actors);adventure.setState({selected:'brontosaurus',unlocked:['brontosaurus']});assert.equal(adventure.start('lift'),true);
  const origins=actors.map(a=>a.root.position.toArray());adventure.update(0,0);assert.equal(calls,0,'pause does not advance a pending route');
  for(let i=0;i<130&&adventure.isBusy();i++)adventure.update(.1,i/10);
  assert.equal(adventure.isBusy(),false);assert.deepEqual(actors.map(a=>a.root.position.toArray()),origins);
  assert.equal(adventure.getDebug().branch.held,false);assert.deepEqual(adventure.pollEvents().map(e=>e.type),['bridge-blocked']);
  adventure.reset();assert.equal(adventure.ownsPair('brontosaurus'),false);adventure.dispose();
});

test('lowering first withdraws both necks before planning the nearer return',()=>{
  const scene=new THREE.Scene(),nest={species:'brontosaurus',root:new THREE.Group(),restOffsets:[new THREE.Vector3(-1,0,0),new THREE.Vector3(1,0,0)],restYaw:0},plans=[];
  const actors=[-1,1].map((x,member)=>{const root=new THREE.Group(),model=new THREE.Group();root.add(model);root.position.set(x,0,2);scene.add(root);return{species:'brontosaurus',root,model,member,supportLocal:new THREE.Vector3(.9,1,0),getSupportPosition(){return root.localToWorld(new THREE.Vector3(.9,1,0))},walk(){},setMotion(){}}});
  const adventure=createBridgeAdventure({scene,heightAt:()=>0,nests:[nest],planWalk(actor,end){plans.push({member:actor.member,start:actor.root.position.clone()});return[actor.root.position.clone(),end.clone()]}});
  const tick=()=>{adventure.update(.025,0);adventure.afterActors(.025)};
  adventure.bindPair('brontosaurus',actors);adventure.setState({selected:'brontosaurus',unlocked:['brontosaurus']});adventure.start('lift');
  for(let i=0;i<1000&&adventure.isBusy();i++)tick();assert.equal(adventure.isBusy(),false);
  const contact=actors.map(a=>a.root.position.clone());plans.length=0;assert.equal(adventure.start('lower'),true);
  let withdrawing=false;
  for(let i=0;i<1000&&adventure.isBusy();i++){
    if(adventure.getDebug().action.phase==='withdraw'){
      withdrawing=true;const before=actors.map(a=>a.root.position.toArray());adventure.update(0,0);adventure.afterActors(0);assert.deepEqual(actors.map(a=>a.root.position.toArray()),before);
    }
    tick();
  }
  assert.equal(withdrawing,true);assert.deepEqual(plans.map(p=>p.member),[1,0]);
  for(const p of plans){const delta=p.start.clone().sub(contact[p.member]);assert.ok(Math.abs(delta.x+.55*Math.cos(.6))<1e-6);assert.ok(Math.abs(delta.z-.55*Math.sin(.6))<1e-6)}
  assert.equal(adventure.isBusy(),false);assert.equal(adventure.getDebug().branch.held,false);adventure.dispose();
});

test('retrying a partially blocked river crossing leaves arrived helpers on the far bank',()=>{
  const scene=new THREE.Scene(),species=['triceratops','brontosaurus','stegosaurus'];
  const nests=species.map((name,index)=>{const root=new THREE.Group();root.position.set(index*3,0,1);return{species:name,root,restOffsets:[new THREE.Vector3(-1,0,0),new THREE.Vector3(1,0,0)],restYaw:0}});
  const pairs=Object.fromEntries(species.map((name,index)=>[name,[-1,1].map((x,member)=>{
    const root=new THREE.Group(),model=new THREE.Group();root.add(model);root.position.set(index*3+x,0,1);scene.add(root);
    const noseLocal=new THREE.Vector3(1,.8,0),supportLocal=new THREE.Vector3(.9,1,0);
    return{species:name,member,root,model,noseLocal,supportLocal,walk(){},setMotion(){},
      getNosePosition(){return root.localToWorld(noseLocal.clone())},getSupportPosition(){return root.localToWorld(supportLocal.clone())}};
  })]));
  const crossingPlans=new Map();let injected=false,adventure;
  adventure=createBridgeAdventure({scene,heightAt:()=>0,nests,planWalk(actor,end){
    const active=adventure.getDebug().action;
    if(active?.id==='cross'){
      crossingPlans.set(actor,(crossingPlans.get(actor)||0)+1);
      if(actor===pairs.triceratops[1]&&!injected){
        injected=true;return null;
      }
    }
    return[actor.root.position.clone(),end.clone()];
  }});
  const tick=()=>{adventure.update(.05,0);adventure.afterActors(.05)};
  const finish=()=>{for(let i=0;i<10000&&adventure.isBusy();i++)tick();assert.equal(adventure.isBusy(),false)};
  try{
    for(const name of species)adventure.bindPair(name,pairs[name]);
    adventure.setState({selected:'brontosaurus',unlocked:species});assert.equal(adventure.start('lift'),true);finish();
    adventure.setState({selected:'triceratops',unlocked:species});assert.equal(adventure.start('roll'),true);finish();
    assert.equal(adventure.getDebug().bridge.built,true);adventure.pollEvents();
    adventure.setState({selected:null,unlocked:species});assert.equal(adventure.start('cross'),true);finish();
    assert.equal(injected,true);assert.equal(adventure.getDebug().staging.arrived,false);
    assert.ok(adventure.pollEvents().some(event=>event.type==='bridge-blocked'&&event.id==='cross'));
    const arrived=pairs.triceratops[0],farPosition=arrived.root.position.toArray(),plansBefore=crossingPlans.get(arrived);
    assert.ok(farPosition[2]<-10,'the committed first crossing reaches staging before reporting the blocked follower');
    assert.equal(adventure.start('cross'),true);
    for(let i=0;i<10000&&adventure.isBusy();i++){tick();assert.deepEqual(arrived.root.position.toArray(),farPosition,'retry never sends an arrived helper back across the river')}
    assert.equal(adventure.isBusy(),false);assert.equal(adventure.getDebug().staging.arrived,true);
    assert.equal(crossingPlans.get(arrived),plansBefore,'retry does not ask the near-bank planner to route an already-arrived helper');
    const events=adventure.pollEvents();assert.equal(events.filter(event=>event.type==='bridge-complete'&&event.id==='cross').length,1);assert.equal(events.some(event=>event.type==='bridge-blocked'),false);
  }finally{adventure.dispose()}
});

test('a gorge wall piece is measured against the rests by its rock: what reaches in is caught, what is sunk or over the heads is not', async () => {
  const { restGap } = await import('../engine/memory/levels/steinagljufur/props.js');
  // a ring of rock points 1 m round its middle, from the ground to 2 m up, one point sunk 1 m and one 4 m up
  const points = [];
  for (let k = 0; k < 16; k++) for (const y of [0, 1, 2]) points.push(Math.cos(k * Math.PI / 8), y, Math.sin(k * Math.PI / 8));
  points.push(-1.4, -1, 0, -1.4, 4, 0);
  const rock = new Float32Array(points), at = x => new THREE.Matrix4().makeTranslation(x, 0, 0), rests = [{ x: 0, y: 0, z: 0, radius: 3.75, height: 3 }];
  assert.ok(Math.abs(restGap(rock, at(5.5), rests) - .75) < 1e-6, 'its near side at 4.5 m is 0.75 m clear of the rest');
  assert.ok(restGap(rock, at(4), rests) < 0, 'its near side at 3 m is inside the 3.75 m rest');
  assert.ok(restGap(rock, at(5.1), rests) > 0, 'the sunk point and the point over the heads (both at 3.7 m) do not count');
  assert.ok(restGap(rock, new THREE.Matrix4().makeTranslation(3, 5, 0), rests) === Infinity, 'a rock wholly over the heads does not count');
});

test('every place of the upper gorge stands on flat ground: the ground under no friend\'s feet or tail rises there (veggir)', async () => {
  const { FORMATIONS } = await import('../engine/memory/levels/steinagljufur/upper-mover.js');
  const { groundAt } = await import('../engine/memory/levels/steinagljufur/upper-ground.js');
  // the ground as it is drawn: upper.js lays a grid over groundAt (0.9 m cells, finer across the ledge's riser), two triangles a cell, so a slope starts up to a cell
  // before groundAt's does
  const xs = [], zs = [];
  for (let x = -40; x <= 52; x += x > 2 && x < 4.4 ? .1 : x > 1.4 && x < 5 ? .3 : .9) xs.push(+x.toFixed(2));
  for (let z = -16; z <= 31; z += .9) zs.push(+z.toFixed(2));
  const cell = (list, v) => { let k = 0; while (k < list.length - 2 && list[k + 1] <= v) k++; return k; };
  const drawn = (x, z) => {
    const i = cell(xs, x), j = cell(zs, z), u = (x - xs[i]) / (xs[i + 1] - xs[i]), v = (z - zs[j]) / (zs[j + 1] - zs[j]);
    const a = groundAt(xs[i], zs[j]), b = groundAt(xs[i + 1], zs[j]), c = groundAt(xs[i], zs[j + 1]), d = groundAt(xs[i + 1], zs[j + 1]);
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  };
  // where its feet and tail are on the ground as it stands facing forward (+x): metres behind, ahead and to either side of its place (and 0.1 m wider: the stride sways)
  const FOOT = { mosi: [.8, .8, .4], triceratops: [1.0, .9, .45], stegosaurus: [1.3, 1.0, .45], brontosaurus: [2.3, 1.4, .5], pteranodon: [1.0, 1.0, .5] };
  for (const [formation, places] of Object.entries(FORMATIONS)) for (const [who, list] of Object.entries(places)) {
    (who === 'mosi' ? [list] : list).forEach(([x, z], i) => {
      const [back, front, side] = FOOT[who], g = groundAt(x, z);
      for (let a = -back; a <= front + 1e-9; a += .1) for (let c = -side - .1; c <= side + .1 + 1e-9; c += .1) {
        const rise = drawn(x + a, z + c) - g;
        assert.ok(rise < .06, `${formation}: ${who} ${i} at (${x}, ${z}): the ground ${a.toFixed(1)} m along and ${c.toFixed(1)} m across rises ${rise.toFixed(2)} m`);
      }
    });
  }
});
