import * as THREE from './vendor/three.module.js';

// Small, original world reactions. Progress, sound and pointer/drag decisions
// belong to the caller; this module never awards stars or advances the story.
export function createWorldTouchFeedback({scene,groundHeight=()=>0,waterY=-.045}={}){
 const root=new THREE.Group();root.name='Local touch reactions';scene.add(root);
 const impacts=new Map(),pools=[],dummy=new THREE.Object3D(),rotation=new THREE.Matrix4();
 let elapsed=0,lastTouch=-Infinity,disposed=false;
 const finitePosition=value=>value&&[value.x,value.y,value.z].every(Number.isFinite);
 function pool(geometry,color,count){
  const alpha=new THREE.InstancedBufferAttribute(new Float32Array(count),1);geometry.setAttribute('aTouchOpacity',alpha);
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.72,depthWrite:false,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float aTouchOpacity; varying float vTouchOpacity;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTouchOpacity=aTouchOpacity;');
   shader.fragmentShader='varying float vTouchOpacity;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vTouchOpacity;');
  };
  material.customProgramCacheKey=()=> 'local-touch-opacity-v1';
  const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.frustumCulled=false;mesh.name='Pooled touch particles';
  const entries=Array(count).fill(null);dummy.scale.setScalar(0);dummy.updateMatrix();
  for(let i=0;i<count;i++){mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(1,1,1));}
  root.add(mesh);const result={mesh,geometry,material,alpha,entries,cursor:0};pools.push(result);return result;
 }
 const dust=pool(new THREE.IcosahedronGeometry(1,0),'#d7c396',48);
 const shape=new THREE.Shape();shape.moveTo(0,-.5);shape.quadraticCurveTo(-.55,.1,0,.65);shape.quadraticCurveTo(.55,.1,0,-.5);
 const leaves=pool(new THREE.ShapeGeometry(shape,6),'#9caf58',24);
 const ripple=pool(new THREE.RingGeometry(.92,1,40),'#c4eee0',10);
 function emit(target,position,life,size,index,kind){
  const slot=target.cursor++%target.entries.length,angle=index*2.399+elapsed*.7;
  target.entries[slot]={start:elapsed,position:position.clone(),life,size,kind,angle,
   velocity:new THREE.Vector3(Math.cos(angle)*.22,kind==='leaf'?-.1:.35+index%3*.07,Math.sin(angle)*.22)};
  return slot;
 }
 function writeTransform(impact,matrix){
  if(impact.object.isInstancedMesh){impact.object.setMatrixAt(impact.instanceId,matrix);impact.object.instanceMatrix.needsUpdate=true;}
  else {matrix.decompose(impact.object.position,impact.object.quaternion,impact.object.scale);impact.object.updateMatrix();}
 }
 function restore(impact){writeTransform(impact,impact.base);}
 function bend(targets,kind){
  for(const target of targets.slice(0,12)){
   const object=target?.object,instanceId=target?.instanceId;
   if(!object||(!object.isObject3D)||object.isInstancedMesh&&(!Number.isInteger(instanceId)||instanceId<0||instanceId>=object.count))continue;
   const key=object.uuid+':'+(object.isInstancedMesh?instanceId:'object');
   let impact=impacts.get(key);
   if(!impact){
    if(impacts.size>=24){const oldest=impacts.keys().next().value;restore(impacts.get(oldest));impacts.delete(oldest);}
    const base=new THREE.Matrix4();if(object.isInstancedMesh)object.getMatrixAt(instanceId,base);else{object.updateMatrix();base.copy(object.matrix);}
    impact={object,instanceId,base};impacts.set(key,impact);
   }
   impact.start=elapsed;impact.kind=kind;impact.life=kind==='tree'?2.2:1.25;
  }
 }
 function touch({kind,position,targets=[]}={}){
  if(disposed||!finitePosition(position)||!['grass','tree','path','water','rock'].includes(kind)||elapsed-lastTouch<.07)return false;
  lastTouch=elapsed;const point=new THREE.Vector3(position.x,position.y,position.z);
  if(kind==='grass'||kind==='tree'){
   bend(Array.isArray(targets)?targets:[],kind);
   const count=kind==='tree'?7:3;
   for(let i=0;i<count;i++){
    const p=point.clone().add(new THREE.Vector3(Math.sin(i*2.4)*.35,kind==='tree'?1.2+(i%3)*.55:.2,Math.cos(i*2.4)*.3));
    emit(leaves,p,kind==='tree'?2.8:1.1,kind==='tree'?.13:.065,i,'leaf');
   }
  }else if(kind==='water'){
   point.y=waterY+.025;for(let i=0;i<2;i++)emit(ripple,point,1.7+i*.25,.8+i*.35,i,'ripple');
   for(let i=0;i<4;i++){const slot=emit(dust,point, .62,.055,i,'drop');dust.mesh.setColorAt(slot,new THREE.Color('#8fcfd0'));}
   dust.mesh.instanceColor.needsUpdate=true;
  }else{
   point.y=Math.max(point.y,groundHeight(point.x,point.z)+.04);
   for(let i=0;i<(kind==='rock'?4:9);i++){
    const slot=emit(dust,point,kind==='rock'?.65:.95,kind==='rock'?.035:.07,i,'dust');
    dust.mesh.setColorAt(slot,new THREE.Color(kind==='rock'?'#d6d2b1':'#d9bf87'));
   }
   dust.mesh.instanceColor.needsUpdate=true;
  }
  return true;
 }
 function update(_time,dt=0){
  if(disposed)return;elapsed+=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  for(const[key,impact]of impacts){
   const age=elapsed-impact.start,u=age/impact.life;
   if(u>=1){restore(impact);impacts.delete(key);continue;}
   const bend=Math.sin(u*Math.PI*3)*Math.sin(Math.PI*u)*(1-u)*(impact.kind==='tree'?.024:.25);
   rotation.makeRotationZ(bend);writeTransform(impact,impact.base.clone().multiply(rotation));
  }
  for(const target of pools){
   for(let i=0;i<target.entries.length;i++){
    const p=target.entries[i];if(!p)continue;
    const age=elapsed-p.start,u=age/p.life;
    if(u>=1){target.entries[i]=null;target.alpha.setX(i,0);dummy.scale.setScalar(0);dummy.updateMatrix();target.mesh.setMatrixAt(i,dummy.matrix);continue;}
    dummy.position.copy(p.position);dummy.rotation.set(0,0,0);
    if(p.kind==='ripple'){
     dummy.rotation.x=-Math.PI/2;dummy.scale.setScalar(.15+u*p.size);target.alpha.setX(i,Math.sin(Math.PI*u)*.55);
    }else{
     dummy.position.addScaledVector(p.velocity,age);
     if(p.kind==='leaf'){
      dummy.position.x+=Math.sin(age*3+p.angle)*.16;dummy.position.y-=age*.28;
      dummy.rotation.set(age*1.9,p.angle+age*.9,Math.sin(age*3)*.7);dummy.scale.setScalar(p.size);
     }else{
      dummy.position.y-=.26*age*age;dummy.scale.setScalar(p.size*(p.kind==='dust'?1+u*1.8:1-u*.6));
     }
     target.alpha.setX(i,Math.sin(Math.min(1,u*5)*Math.PI/2)*(1-u)*.7);
    }
    dummy.updateMatrix();target.mesh.setMatrixAt(i,dummy.matrix);
   }
   target.alpha.needsUpdate=true;target.mesh.instanceMatrix.needsUpdate=true;
  }
 }
 function clear(){
  for(const impact of impacts.values())restore(impact);impacts.clear();
  for(const target of pools){target.entries.fill(null);target.alpha.array.fill(0);target.alpha.needsUpdate=true;dummy.scale.setScalar(0);dummy.updateMatrix();for(let i=0;i<target.entries.length;i++)target.mesh.setMatrixAt(i,dummy.matrix);target.mesh.instanceMatrix.needsUpdate=true;}
 }
 function dispose(){if(disposed)return;clear();disposed=true;root.removeFromParent();for(const target of pools){target.geometry.dispose();target.material.dispose();}}
 return{touch,update,clear,dispose,getDebugInfo:()=>({impacts:impacts.size,particles:pools.reduce((n,p)=>n+p.entries.filter(Boolean).length,0),capacity:82})};
}
