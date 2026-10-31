import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import './setup.mjs';
const THREE=await import('three');
const {createHomeNavigation}=await import('../engine/memory/world-home-nav.js');
const {bridgeCollisionObjects,reposedSnapshot}=await import('../engine/memory/memory-clearance.js');
const {riverDistance,bridgeValley}=await import('../engine/memory/bridge-props.js');
const {createTerrain}=await import('../world/forest/terrain.js');
const fixture=JSON.parse(await readFile(new URL('./fixtures/memory-roll-partial-board.json',import.meta.url)));

function replay(){
  const layout={clearing:{center:[-1.5,-1.5],radius:14},forestEdge:20,path:[[-20,11],[-8,8],[-6,4],[-3.4,.4],[-1,-3],[4,-9],[4.5,-15],[4.5,-23],[4.5,-27]],lift:bridgeValley};
  const heightAt=createTerrain({},layout,251017).heightAt;
  const actors=fixture.actors.map(pose=>{
    const root=new THREE.Group();root.position.fromArray(pose.position);root.rotation.y=pose.yaw;root.scale.fromArray(pose.scale);root.updateMatrixWorld(true);
    const inverse=root.matrixWorld.clone().invert(),record=fixture.feet.find(c=>c.species===pose.species&&c.position.every((v,i)=>Math.abs(v-pose.position[i])<1e-5));
    const feet=(record?.feet??[]).map(f=>({name:f.name,local:new THREE.Vector3(...f.position).applyMatrix4(inverse)}));
    return{species:pose.species,root,pose,model:{traverse(fn){for(const f of feet)fn({isBone:true,name:f.name,getWorldPosition(out){root.updateMatrixWorld(true);return out.copy(f.local).applyMatrix4(root.matrixWorld)}})}}};
  });
  const collision=fixture.collision,measured=bridgeCollisionObjects({collision}),matrix=new THREE.Matrix4().fromArray(collision.logMatrix);
  const objects=[{id:'main-log',a:new THREE.Vector3(-collision.logLength/2,0,0).applyMatrix4(matrix),b:new THREE.Vector3(collision.logLength/2,0,0).applyMatrix4(matrix),radius:collision.logRadius,parts:measured.find(o=>o.id==='main-log').parts}];
  for(const tube of collision.tubes)for(let i=1;i<tube.points.length;i++)objects.push({id:tube.id,a:new THREE.Vector3(...tube.points[i-1]),b:new THREE.Vector3(...tube.points[i]),radius:tube.radius,parts:[measured.find(o=>o.id===tube.id).parts[i-1]]});
  for(const object of fixture.scenery){const part=object.parts[0],center=new THREE.Vector3(...part.center),radius=Math.hypot(...part.half.map((v,i)=>v*Math.hypot(part.axes[i][0],part.axes[i][2])));objects.push({id:object.id,a:center,b:center,radius,parts:object.parts})}
  const actor=actors.find(a=>a.pose.id===fixture.movingActor);
  function plan(slots,end){
    const nav=createHomeNavigation({heightAt,riverDistance,actors:()=>actors,objects:()=>objects,leaves:()=>slots.map(i=>({x:fixture.leaves[i][0],z:fixture.leaves[i][1]})),actorGeometry:{measure:a=>a.pose.hull,snapshot:a=>reposedSnapshot(a.pose,a.root.position.toArray(),a.root.rotation.y)}});
    const route=nav.plan(actor,new THREE.Vector3(...end),fixture.yaw,{allowEndContact:true});return{route,debug:nav.getDebug()};
  }
  return{actor,plan};
}

test('captured partial-board idle pose exposes the old branch pinch',()=>{
  const {plan}=replay(),result=plan(fixture.closedSlots,fixture.originalEnd);
  assert.equal(result.route,null);assert.equal(result.debug.lastPlan.startValid,true);
  assert.equal(result.debug.lastPlan.endReason,'branch','the later recorded idle head reaches the branch at the former stand-off');
});

test('glade-side roll stand-off is reachable with every remaining cover pair and nearby head heights',()=>{
  const {actor,plan}=replay();
  for(let a=0;a<6;a++)for(let b=a+1;b<6;b++){
    const {route,debug}=plan([a,b],fixture.clearEnd);
    assert.ok(route,`remaining covers ${a}/${b}`);assert.equal(debug.lastPlan.startValid,true);assert.equal(debug.lastPlan.endValid,true);assert.equal(debug.failures,0);
    assert.ok(route.points.length>1);assert.ok(route.total>new THREE.Vector3(...fixture.originalEnd).distanceTo(actor.root.position),'the planner takes a measured detour around the parked partner and covers');
  }
  const original=actor.pose;
  for(const dy of[-.035,-.02,.02,.035]){
    actor.pose={...original,parts:original.parts.map(p=>p.kind==='head'?{...p,center:[p.center[0],p.center[1]+dy,p.center[2]]}:p)};
    const {route,debug}=plan(fixture.closedSlots,fixture.clearEnd);assert.ok(route,`head envelope height ${dy}`);assert.equal(debug.lastPlan.endValid,true);
  }
  actor.pose=original;
});
