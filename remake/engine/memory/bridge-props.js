import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { MARSH, marshValley } from './build-props.js';
import { installWaterFlow, createFoamTexture, installFoamFade, createStoryBarkTexture } from './world-surface-fx.js';
export { MARSH, WALKWAY, STAGING, DESTINATION } from './build-props.js';

const near = [-1, -3], far = [4, -9], length = Math.hypot(far[0] - near[0], far[1] - near[1]);
export const BRIDGE = Object.freeze({ near, far, pivot: near, length, radius: 1.1, halfWidth: .72, axis: [(far[0]-near[0])/length,(far[1]-near[1])/length], nearZ:near[1],farZ:far[1],x:near[0],grove:[5.4,-12.1] });
const riverControl=[[-14,-17],[-5,-11.4],[1.5,-6],[7,1.5],[11,8]];
const riverCurve=new THREE.CatmullRomCurve3(riverControl.map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
export const RIVER = Object.freeze({ points:riverCurve.getPoints(32).map(p=>[p.x,p.z]),controlPoints:riverControl,halfWidth:1.7,bankBlend:.8,waterY:-.65,bedY:-1.05 });
export function riverDistance(x,z) {
  let best=Infinity,point=[0,0],tangent=[1,0],signed=0;
  for(let i=1;i<RIVER.points.length;i++){
    const a=RIVER.points[i-1],b=RIVER.points[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz),t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(l*l),0,1),px=a[0]+dx*t,pz=a[1]+dz*t,d=Math.hypot(x-px,z-pz);
    if(d<best){best=d;point=[px,pz];tangent=[dx/l,dz/l];signed=((x-px)*-dz+(z-pz)*dx)/l;}
  }
  return {distance:best,signed,point,tangent};
}
export function bridgeValley(x,z) { return RIVER.bedY*(1-THREE.MathUtils.smoothstep(riverDistance(x,z).distance,1.1,RIVER.halfWidth+RIVER.bankBlend)) + marshValley(x,z); }

/** Retessellate only the visible stream corridor; the original radial ground is too coarse for banks. */
export function refineBridgeGround(forest,heightAt){
  const mesh=forest.group.getObjectByName('Forest ground');if(!mesh)return;
  const old=mesh.geometry,p=old.attributes.position,index=old.index,positions=[],normals=[];
  const write=(x,z)=>{const e=.06,n=new THREE.Vector3(heightAt(x-e,z)-heightAt(x+e,z),2*e,heightAt(x,z-e)-heightAt(x,z+e)).normalize();positions.push(x,heightAt(x,z),z);normals.push(n.x,n.y,n.z);};
  function triangle(a,b,c,depth=0){
    const span=Math.max(Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(b[0]-c[0],b[1]-c[1]),Math.hypot(c[0]-a[0],c[1]-a[1])),x=(a[0]+b[0]+c[0])/3,z=(a[1]+b[1]+c[1])/3;
    const marshLocal=x>-3&&x<12&&z>-23.5&&z<-15.5;
    const local=marshLocal||x>-13&&x<13&&z>-18&&z<11&&riverDistance(x,z).distance<RIVER.halfWidth+RIVER.bankBlend+span;
    const landingDistance=Math.min(Math.hypot(x-near[0],z-near[1]),Math.hypot(x-far[0],z-far[1])),precision=marshLocal?(Math.abs(x-4.5)<2.4?.48:.92):THREE.MathUtils.lerp(.48,.92,THREE.MathUtils.smoothstep(landingDistance,4.5,6.5));
    if(local&&span>precision&&depth<6){const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2],bc=[(b[0]+c[0])/2,(b[1]+c[1])/2],ca=[(c[0]+a[0])/2,(c[1]+a[1])/2];triangle(a,ab,ca,depth+1);triangle(ab,b,bc,depth+1);triangle(ca,bc,c,depth+1);triangle(ab,bc,ca,depth+1);}else{write(...a);write(...b);write(...c);}
  }
  for(let i=0;i<index.count;i+=3)triangle(...[index.getX(i),index.getX(i+1),index.getX(i+2)].map(n=>[p.getX(n),p.getZ(n)]));
  const next=new THREE.BufferGeometry();next.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));next.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));next.computeBoundingSphere();mesh.geometry=next;old.dispose();
}

export function createBridgeProps({scene,heightAt}){
  const root=new THREE.Group();root.name='Áin, stóri bolurinn og berjalundurinn';scene.add(root);
  const geometries=new Set(),materials=new Set(),textures=new Set();
  const geo=g=>{geometries.add(g);return g},mat=o=>{const m=new THREE.MeshStandardMaterial({roughness:.94,...o});materials.add(m);return m};
  const make=(g,m,parent=root,shadow=true)=>{const o=new THREE.Mesh(g,m);o.castShadow=shadow;o.receiveShadow=true;parent.add(o);return o};
  const colourPart=(g,colour,parts)=>{const q=g.index?g.toNonIndexed():g.clone(),c=new THREE.Color(colour),v=new Float32Array(q.attributes.position.count*3);for(let i=0;i<v.length;i+=3)c.toArray(v,i);q.setAttribute('color',new THREE.BufferAttribute(v,3));q.deleteAttribute('uv');parts.push(q);g.dispose();};
  const merge=(parts,parent=root,shadow=true)=>{if(!parts.length)return null;const g=geo(mergeGeometries(parts));parts.forEach(p=>p.dispose());return make(g,mat({vertexColors:true}),parent,shadow)};
  const dummy=new THREE.Object3D(),Y=new THREE.Vector3(0,1,0),axis=new THREE.Vector3(BRIDGE.axis[0],0,BRIDGE.axis[1]),side=new THREE.Vector3(-axis.z,0,axis.x);
  const finalYaw=-Math.atan2(axis.z,axis.x),initialYaw=finalYaw+Math.PI/2;
  const bankY=Math.max(heightAt(...near),heightAt(...far)),centreY=bankY+.63,deckY=centreY+BRIDGE.radius*.8;
  const pointAlong=(s,lateral=0)=>new THREE.Vector3(near[0],0,near[1]).addScaledVector(axis,s).addScaledVector(side,lateral);

  // A continuous stream surface, with quiet moving highlights and irregular bank stones.
  const samples=[];
  RIVER.points.slice(1).forEach((b,i)=>{const a=RIVER.points[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz),count=Math.ceil(l/.48);for(let j=0;j<count;j++)samples.push({x:a[0]+dx*j/count,z:a[1]+dz*j/count,tx:dx/l,tz:dz/l});});
  const last=RIVER.points.at(-1),prev=RIVER.points.at(-2),lastLength=Math.hypot(last[0]-prev[0],last[1]-prev[1]);samples.push({x:last[0],z:last[1],tx:(last[0]-prev[0])/lastLength,tz:(last[1]-prev[1])/lastLength});
  const wp=[],wi=[],wc=[],flowUv=[],bankParts=[],rushParts=[],bands=[-1,-.93,-.65,0,.65,.93,1];let riverArc=0;
  samples.forEach((p,i)=>{
    const before=samples[Math.max(0,i-1)],after=samples[Math.min(samples.length-1,i+1)],dx=after.x-before.x,dz=after.z-before.z,l=Math.hypot(dx,dz)||1;
    p.tx=dx/l;p.tz=dz/l;if(i)riverArc+=Math.hypot(p.x-before.x,p.z-before.z);
    for(const fraction of bands){const edge=THREE.MathUtils.smoothstep(1-Math.abs(fraction),0,.13),end=Math.min(1,i/3,(samples.length-1-i)/3);wp.push(p.x-p.tz*1.67*fraction,RIVER.waterY,p.z+p.tx*1.67*fraction);flowUv.push(fraction,riverArc);const c=new THREE.Color('#326b7a').lerp(new THREE.Color('#99bfac'),THREE.MathUtils.smoothstep(Math.abs(fraction),.25,1));c.multiplyScalar(1+Math.sin(i*.17)*.045);wc.push(c.r,c.g,c.b,edge*end*.97);}
    if(i<samples.length-1)for(let j=0;j<bands.length-1;j++){const a=i*bands.length+j,b=a+bands.length;wi.push(a,a+1,b,a+1,b+1,b);}
  });
  const wg=geo(new THREE.BufferGeometry());wg.setAttribute('position',new THREE.Float32BufferAttribute(wp,3));wg.setAttribute('color',new THREE.Float32BufferAttribute(wc,4));wg.setAttribute('aFlowUv',new THREE.Float32BufferAttribute(flowUv,2));wg.setIndex(wi);wg.computeVertexNormals();
  const water=make(wg,mat({vertexColors:true,color:'#b8e1dc',roughness:.36,metalness:.08,side:THREE.DoubleSide,transparent:true,depthWrite:true,alphaTest:.01}),root,false);water.name='Áin';water.renderOrder=7.5;water.receiveShadow=false;
  const waterFlow=installWaterFlow(water.material);
  const ripples=new THREE.Group();root.add(ripples);const foamMap=createFoamTexture();textures.add(foamMap);const rippleMaterial=new THREE.MeshBasicMaterial({map:foamMap,color:'#e2f1de',transparent:true,opacity:.67,depthWrite:false,side:THREE.DoubleSide});materials.add(rippleMaterial);installFoamFade(rippleMaterial);
  const rippleGeometry=geo(new THREE.PlaneGeometry(1,1)),foamAlpha=new THREE.InstancedBufferAttribute(new Float32Array(54),1);rippleGeometry.setAttribute('aFlowAlpha',foamAlpha);const flow=new THREE.InstancedMesh(rippleGeometry,rippleMaterial,54);flow.frustumCulled=false;flow.renderOrder=9;ripples.add(flow);
  function flowAt(time){for(let i=0;i<54;i++){const p=samples[(i*7+5)%samples.length],offset=Math.sin(i*12.3)*1.12,phase=(time*.31+i*.37)%1,travel=(phase-.5)*2.25;dummy.position.set(p.x-p.tz*offset+p.tx*travel,RIVER.waterY+.018,p.z+p.tx*offset+p.tz*travel);dummy.rotation.set(-Math.PI/2,0,-Math.atan2(p.tz,p.tx));dummy.scale.set(.64+(i%4)*.17,.14+(i%3)*.035,1);dummy.updateMatrix();flow.setMatrixAt(i,dummy.matrix);foamAlpha.setX(i,Math.sin(phase*Math.PI)**.65);}flow.instanceMatrix.needsUpdate=true;foamAlpha.needsUpdate=true;}
  flowAt(0);
  // Gaps around both landings leave the walk route visibly unobstructed.
  const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
  for(let cluster=0;cluster<16;cluster++){
    const p=samples[Math.min(samples.length-1,Math.floor((cluster+.2+random(cluster)*.6)/16*samples.length))],sign=random(cluster+35)>.48?1:-1;
    for(let k=0;k<2+cluster%2;k++){
      const d=RIVER.halfWidth+.14+random(cluster*8+k)*.65,along=(k-.5)*.65,x=p.x-p.tz*d*sign+p.tx*along,z=p.z+p.tx*d*sign+p.tz*along;
      if(Math.min(Math.hypot(x-near[0],z-near[1]),Math.hypot(x-far[0],z-far[1]))<1.8)continue;
      const size=.32+random(cluster*7+k+10)*.54,g=new THREE.IcosahedronGeometry(1,size>.60?1:0);g.scale(size,.25+size*.35,size*(.8+random(k+cluster)*.5));g.rotateY(cluster*1.71+k);g.translate(x,heightAt(x,z)+.08,z);colourPart(g,['#7d8171','#979783','#737e70'][cluster%3],bankParts);
      if(k===0){const m=new THREE.IcosahedronGeometry(1,0);m.scale(size*.7,.09,size*.6);m.rotateY(cluster);m.translate(x,heightAt(x,z)+.28+size*.3,z);colourPart(m,'#6d8748',bankParts);}
      if(k===1)for(let n=0;n<5;n++){const h=.4+random(cluster+n)*.55,stem=new THREE.ConeGeometry(.027,h,4);stem.rotateZ((n-2)*.13);stem.translate(x+(n-2)*.10,heightAt(x,z)+h/2,z+.2*Math.sin(n));colourPart(stem,n%2?'#718a48':'#526f3a',rushParts);}
    }
  }
  merge([...bankParts,...rushParts]);

  // The bridge is a hollow, weathered trunk with a broad worn top, not a smooth pipe.
  const pivot=new THREE.Group();pivot.position.set(near[0],centreY,near[1]);root.add(pivot);
  const log=new THREE.Group();log.position.x=BRIDGE.length/2;pivot.add(log);
  const barkMap=createStoryBarkTexture();textures.add(barkMap);
  const bark=mat({map:barkMap,color:'#d0c2a7',bumpMap:barkMap,bumpScale:.045}),inside=mat({color:'#4c3d2b',side:THREE.BackSide});
  function shell(inner=false){const pos=[],uv=[],idx=[],rings=inner?6:12,segments=40;for(let i=0;i<=rings;i++){const u=i/rings;for(let j=0;j<=segments;j++){const a=j/segments*Math.PI*2,r=inner?.69:BRIDGE.radius*(1+.025*Math.sin(j*2.7+i*.5)+.018*Math.sin(i*1.7)),y=Math.min(Math.cos(a)*r,inner?.54:BRIDGE.radius*.8),z=Math.sin(a)*r;pos.push((u-.5)*BRIDGE.length,y,z);uv.push(u,j/segments);if(i<rings&&j<segments){const n=i*(segments+1)+j;idx.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);}}}const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
  make(shell(),bark,log);make(shell(true),inside,log,false);
  const details=[];
  for(const end of [-1,1]){
    const positions=[],indices=[];for(let j=0;j<=40;j++){const a=j/40*Math.PI*2;for(const r of [.69,BRIDGE.radius])positions.push(end*BRIDGE.length/2,Math.min(Math.cos(a)*r,r===.69?.54:BRIDGE.radius*.8),Math.sin(a)*r);}for(let j=0;j<40;j++){const a=j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();colourPart(g,'#c6a16b',details);
    for(const radius of [.79,.91,1.025]){const pts=[];for(let j=0;j<=28;j++){const a=j/28*Math.PI*2;pts.push(new THREE.Vector3(end*(BRIDGE.length/2+.008),Math.min(Math.cos(a)*radius,BRIDGE.radius*.8-.01),Math.sin(a)*radius));}colourPart(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),28,.013,3,false),'#856542',details);}
  }
  for(let patch=0;patch<5;patch++)for(let k=0;k<4;k++){const x=-3.25+patch*1.45+(random(patch*4+k)-.5)*.6,a=.85+random(patch+20)*.8+(k-1.5)*.13,g=new THREE.IcosahedronGeometry(1,1);g.scale(.24+random(k+patch)*.18,.105,.21);g.rotateX(a);g.translate(x,Math.min(Math.cos(a)*1.1,.88),Math.sin(a)*1.11);colourPart(g,['#6c853d','#819245','#526b36'][(patch+k)%3],details);}
  for(const [x,a]of [[-1.8,1.2],[2.3,-.95]]){const g=new THREE.CylinderGeometry(.13,.22,.45,7);g.rotateX(a);g.translate(x,Math.cos(a)*1.15,Math.sin(a)*1.15);colourPart(g,'#80603c',details);}
  const logDetail=merge(details,log);logDetail.material.side=THREE.DoubleSide;
  const ramps=new THREE.Group();root.add(ramps);
  for(const end of [0,BRIDGE.length]){
    const pos=[],idx=[],colours=[];
    for(let i=0;i<=12;i++)for(let j=0;j<=8;j++){
      const u=i/12,s=end===0?-1.7+u*1.7:BRIDGE.length+u*1.7,width=1.25+.30*Math.sin(Math.PI*u),l=(j/8*2-1)*width,p=pointAlong(s,l),t=end===0?u:1-u,edge=1-THREE.MathUtils.smoothstep(Math.abs(l),.66,width),ground=heightAt(p.x,p.z)+.025,top=THREE.MathUtils.lerp(ground,deckY,t*t*(3-2*t)),y=THREE.MathUtils.lerp(ground,top,edge);
      pos.push(p.x,y,p.z);const c=new THREE.Color('#a28a60').lerp(new THREE.Color('#7c694a'),(1-edge)*.25+(Math.sin(i*2+j*3)+1)*.06);colours.push(c.r,c.g,c.b);
      if(i<12&&j<8){const n=i*9+j;idx.push(n,n+1,n+9,n+1,n+10,n+9);}
    }
    const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));g.setIndex(idx);g.computeVertexNormals();make(g,mat({vertexColors:true}),ramps,false);
  }

  // The low living branch bends at the actual crown contacts while its trunk stays rooted.
  const branchAnchor=new THREE.Vector3(-8.0,heightAt(-8,-5.6),-5.6),trunkParts=[];
  const trunkCurve=new THREE.CatmullRomCurve3([branchAnchor.clone().add(new THREE.Vector3(-.25,-.1,.1)),branchAnchor.clone().add(new THREE.Vector3(0,1.8,0)),branchAnchor.clone().add(new THREE.Vector3(.35,3.4,-.2)),branchAnchor.clone().add(new THREE.Vector3(.3,4.2,-.4))]);
  colourPart(new THREE.TubeGeometry(trunkCurve,12,.43,9,false),'#775a3b',trunkParts);for(let i=0;i<4;i++){const a=i*Math.PI/2,line=new THREE.CatmullRomCurve3([branchAnchor.clone().add(new THREE.Vector3(0,.4,0)),branchAnchor.clone().add(new THREE.Vector3(Math.cos(a)*1.1,.03,Math.sin(a)*1.1))]);colourPart(new THREE.TubeGeometry(line,5,.14,6,false),'#6e5539',trunkParts);}
  for(const [x,y,z]of[[-10,4.8,-7],[-7.4,5.6,-8.1],[-8.7,6.2,-8]]){const line=new THREE.CatmullRomCurve3([branchAnchor.clone().add(new THREE.Vector3(.3,3.1,-.2)),new THREE.Vector3((x-7.7)/2,4.1,(z-5.8)/2),new THREE.Vector3(x,y,z)]);colourPart(new THREE.TubeGeometry(line,7,.17,6,false),'#775a3b',trunkParts);}
  for(let i=0;i<7;i++){const g=new THREE.IcosahedronGeometry(1,1),a=i*2.4;g.scale(1.15+(i%3)*.2,.85+(i%2)*.35,1.15);g.rotateY(i);g.translate(-8.6+Math.cos(a)*1.4,5.3+(i%3)*.52,-7.7+Math.sin(a)*1.0);colourPart(g,['#597a3d','#709043','#496c37'][i%3],trunkParts);}merge(trunkParts);
  const branchGroup=new THREE.Group();root.add(branchGroup);let branchMesh=null,lastBranchKey='',branchCurve=null;
  const leafGeometry=geo(new THREE.SphereGeometry(1,8,4));leafGeometry.scale(.47,.065,.20);
  const branchMaterial=mat({vertexColors:true});
  // The bend between the trunk and the first crown rises with that crown, so a branch held high (the tall
  // Þórseðla babies lift it past 2 m) does not dip into her head on its way to the trunk.
  function setBranch(lift,supports=[]){
    const a=supports[0]??new THREE.Vector3(-7.15,1.10,-4.4),b=supports[1]??new THREE.Vector3(-5.35,1.08,-3.3),key=[lift,...a.toArray(),...b.toArray()].map(v=>v.toFixed(4)).join(',');if(key===lastBranchKey)return;lastBranchKey=key;
    branchCurve=new THREE.CatmullRomCurve3([branchAnchor.clone().add(new THREE.Vector3(.35,3.35,-.2)),new THREE.Vector3(-7.8,Math.max(2,a.y+.25),-4.9),a.clone().add(new THREE.Vector3(0,.16,0)),b.clone().add(new THREE.Vector3(0,.15,0)),new THREE.Vector3(-1.7,.9+lift*1.45,-3),new THREE.Vector3(.3,.55+lift*2.0,-2.8)]);
    const parts=[];colourPart(new THREE.TubeGeometry(branchCurve,36,.15,8,false),'#82623d',parts);
    for(let i=0;i<28;i++){
      const p=branchCurve.getPoint(.26+i/28*.73);if(p.distanceTo(a)<.75||p.distanceTo(b)<.75)continue;
      dummy.position.copy(p);dummy.position.z+=i%2?.27:-.27;dummy.rotation.set(.12,(i%2?-1:1)*.65,-.25);dummy.scale.setScalar(.7+i%3*.15);dummy.updateMatrix();
      colourPart(leafGeometry.clone().applyMatrix4(dummy.matrix),['#688a3e','#77974b','#5d7d38'][i%3],parts);
    }
    const g=mergeGeometries(parts);parts.forEach(part=>part.dispose());
    if(!branchMesh){branchMesh=make(g,branchMaterial,branchGroup);branchMesh.name='Lifandi grein og lauf';}else{branchMesh.geometry.dispose();branchMesh.geometry=g;}
  }
  setBranch(0);

  const ringGeometry=geo(new THREE.RingGeometry(.7,.75,40));ringGeometry.rotateX(-Math.PI/2);const markerMaterial=new THREE.MeshBasicMaterial({color:'#f4d88a',transparent:true,opacity:.65,depthWrite:false});materials.add(markerMaterial);
  const markers=Object.fromEntries(['branch','log','staging','bark','grove'].map(id=>{const marker=make(ringGeometry,markerMaterial,root,false);marker.visible=false;return[id,marker]}));
  function setLog(progress){pivot.rotation.y=THREE.MathUtils.lerp(initialYaw,finalYaw,progress);log.rotation.x=Math.sin(progress*Math.PI)*.20;pivot.position.y=centreY+Math.sin(progress*Math.PI)*.10;ramps.visible=progress>.98;}
  function logContact(t,normalOffset=-1.0){return new THREE.Vector3(t,-.1,normalOffset).applyAxisAngle(Y,pivot.rotation.y).add(pivot.position);}
  function deckPoint(s,out=new THREE.Vector3()){out.copy(pointAlong(s));if(s<0){const t=THREE.MathUtils.clamp((s+1.7)/1.7,0,1);out.y=THREE.MathUtils.lerp(heightAt(out.x,out.z)+.04,deckY+.04,t*t*(3-2*t));}else if(s>BRIDGE.length){const t=1-THREE.MathUtils.clamp((s-BRIDGE.length)/1.7,0,1);out.y=THREE.MathUtils.lerp(heightAt(out.x,out.z)+.04,deckY+.04,t*t*(3-2*t));}else out.y=deckY+.04;return out;}
  setLog(0);
  return {root,pivot,log,markers,setLog,setBranch,logContact,deckPoint,deckY,finalYaw,initialYaw,pointAlong,update(time,reduced){flowAt(reduced?0:time);waterFlow.update(time,reduced)},getBranchEnd:lift=>new THREE.Vector3(.3,.55+lift*2,-2.8),getBranchCollision:()=>({branch:{points:branchCurve.getPoints(36).map(p=>p.toArray()),radius:.15},trunk:{points:trunkCurve.getPoints(12).map(p=>p.toArray()),radius:.43}}),dispose(){root.removeFromParent();branchMesh?.geometry.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}





