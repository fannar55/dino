import * as THREE from 'three';

// Six shared face textures from the REMAKE's own character illustrations.
export const DINO_FACES = [
  {name:'Mosi',color:'#868862',image:'eitt/mosi.webp'},
  {name:'Kambeðla',color:'#8f6aa3',image:'book/images/kambedla-render-thumb.webp'},
  {name:'Þórseðla',color:'#dba94c',image:'eitt/brontosaurus.webp'},
  {name:'Grameðla',color:'#b37955',image:'eitt/trex.webp'},
  {name:'Slóeðla',color:'#6793d0',image:'eitt/parasaurolophus.webp'},
  {name:'Flugeðla',color:'#dc8090',image:'eitt/pteranodon.webp'},
];
const FACE_VALUES=[3,4,1,6,2,5]; // +X,-X,+Y,-Y,+Z,-Z; opposite sides sum to seven.
const NORMALS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(v=>new THREE.Vector3(...v));
const HALF=.1357,ROUND=.0413,UP=new THREE.Vector3(0,1,0),TAU=Math.PI*2;
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const layouts=[[-.92,-.25],[-.38,.46],[.34,-.45],[.91,.19],[.32,.86]];
export function faceQuaternion(value,yaw=0){
  if(!Number.isInteger(value)||value<1||value>6)throw new RangeError('A die face is 1–6');
  const face=FACE_VALUES.indexOf(value),q=new THREE.Quaternion().setFromUnitVectors(NORMALS[face],UP);
  const artUp=new THREE.Vector3(...(face===2?[0,0,-1]:face===3?[0,0,1]:[0,1,0])).applyQuaternion(q);
  return new THREE.Quaternion().setFromAxisAngle(UP,yaw+Math.atan2(artUp.x,-artUp.z)).multiply(q);
}
export function upwardFace(quaternion){
  let highest=-Infinity,result=1;
  for(let i=0;i<6;i++){const y=NORMALS[i].clone().applyQuaternion(quaternion).y;if(y>highest){highest=y;result=FACE_VALUES[i];}}
  return result;
}
function roundedCube(){
  const geometry=new THREE.BoxGeometry(HALF*2,HALF*2,HALF*2,6,6,6),p=geometry.attributes.position,v=new THREE.Vector3(),core=new THREE.Vector3();
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);core.copy(v).clampScalar(-HALF+ROUND,HALF-ROUND);v.sub(core).normalize().multiplyScalar(ROUND).add(core);p.setXYZ(i,v.x,v.y,v.z);}
  geometry.computeVertexNormals();return geometry;
}
async function faceTexture(face,value){
  const img=new Image();img.src=new URL(`../../assets/${face.image}`,import.meta.url).href;await img.decode();
  const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');
  ctx.fillStyle='#fff9e9';ctx.fillRect(0,0,512,512);
  ctx.fillStyle=face.color+'22';ctx.beginPath();ctx.roundRect(32,32,448,448,62);ctx.fill();
  ctx.strokeStyle=face.color+'66';ctx.lineWidth=5;ctx.stroke();
  ctx.fillStyle='#21392f';ctx.font='900 164px Nunito, sans-serif';ctx.textAlign='left';ctx.fillText(String(value),57,174);
  // Numeral and pips remain legible independently of the smaller picture.
  const pips={1:[[1,1]],2:[[0,0],[2,2]],3:[[0,0],[1,1],[2,2]],4:[[0,0],[2,0],[0,2],[2,2]],5:[[0,0],[2,0],[1,1],[0,2],[2,2]],6:[[0,0],[2,0],[0,1],[2,1],[0,2],[2,2]]}[value];
  for(const [x,y]of pips){ctx.beginPath();ctx.arc(355+x*31,68+y*31,10,0,TAU);ctx.fill();}
  const scale=Math.min(380/img.width,292/img.height),w=img.width*scale,h=img.height*scale;
  ctx.drawImage(img,(512-w)/2,474-h,w,h);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

const CORE=HALF-ROUND,GRAVITY=9.8,LOAD_END=.62,RETURN_END=2.78,ROLL_DURATION=3.4,CUP_FULL_SCALE=.82,CUP_PARK_SCALE=.42;
const smoother=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
function variation(value){
  let x=value>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return((x^(x>>>16))>>>0)/4294967296;
}
function cupGrain(){
  const size=64,data=new Uint8Array(size*size*4);
  for(let i=0;i<size*size;i++){const shade=190+Math.floor(variation(i+931)*58);data[i*4]=data[i*4+1]=data[i*4+2]=shade;data[i*4+3]=255;}
  const texture=new THREE.DataTexture(data,size,size);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(5,4);texture.needsUpdate=true;return texture;
}

export async function createDiceAndCup(world,{onEvent=()=>{}}={}){
  const {scene,table}=world,root=new THREE.Group();root.name='Yatzy dice and black cup';scene.add(root);
  const textures=await Promise.all(DINO_FACES.map((face,i)=>faceTexture(face,i+1)));
  const faceMaterials=textures.map(map=>new THREE.MeshStandardMaterial({map,roughness:.36,metalness:0}));
  const geometry=roundedCube(),dice=[],rings=[],ringGeo=new THREE.RingGeometry(.225,.248,40);
  const ringMat=new THREE.MeshBasicMaterial({color:'#ffcf64',transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide});
  const starts=[],targets=[],fromQ=[],targetQ=[],offsets=[],yaws=[],plans=[];
  for(let i=0;i<5;i++){
    const mesh=new THREE.Mesh(geometry,FACE_VALUES.map(n=>faceMaterials[n-1]));mesh.name='Die '+(i+1);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.die=i;root.add(mesh);dice.push(mesh);
    const ring=new THREE.Mesh(ringGeo,ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=table.y+.012;root.add(ring);rings.push(ring);
    starts.push(new THREE.Vector3());targets.push(new THREE.Vector3());fromQ.push(new THREE.Quaternion());targetQ.push(new THREE.Quaternion());offsets.push(new THREE.Vector2());yaws.push(0);
    plans.push({index:i,rank:i,gather:false,release:0,launched:false,settled:false,launch:new THREE.Vector3(),launchQ:new THREE.Quaternion(),brakeQ:new THREE.Quaternion(),localQ:new THREE.Quaternion(),axis:new THREE.Vector3(),mouth:new THREE.Vector3(),packed:new THREE.Vector3(),contacts:[],seed:0,flightTime:0,height:0,vy:0,airTime:0,travel:1,omega:0,drag:0,bow:0});
  }
  // Closed, opaque outer wall and base; the centre of the top is genuinely open.
  // One repeated grain map supplies the black leather/plastic surface and its fine bump.
  const cup=new THREE.Group();cup.name='Black open Yatzy cup';cup.scale.setScalar(CUP_FULL_SCALE);root.add(cup);
  const profile=[[0,0],[.31,0],[.344,.035],[.386,.94],[.384,.98],[.351,.98],[.34,.93],[.309,.10],[0,.10]].map(v=>new THREE.Vector2(...v));
  const wallGeo=new THREE.LatheGeometry(profile,40),grain=cupGrain(),colors=[];
  for(let i=0;i<wallGeo.attributes.position.count;i++){
    const inner=i%profile.length>=5,c=new THREE.Color(inner?'#101210':'#272a27');colors.push(c.r,c.g,c.b);
  }
  wallGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const wallMat=new THREE.MeshStandardMaterial({vertexColors:true,map:grain,bumpMap:grain,bumpScale:.007,roughness:.83,metalness:0});
  const wall=new THREE.Mesh(wallGeo,wallMat);wall.name='Opaque textured cup wall';wall.userData.cupPart='wall';wall.castShadow=wall.receiveShadow=true;cup.add(wall);
  const rimMat=new THREE.MeshStandardMaterial({color:'#1c201c',roughness:.57,metalness:0});
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.367,.027,10,48),rimMat);rim.name='Thick rolled black rim';rim.userData.cupPart='rim';rim.rotation.x=Math.PI/2;rim.position.y=.974;rim.castShadow=true;cup.add(rim);
  const base=new THREE.Mesh(new THREE.TorusGeometry(.328,.019,8,40),rimMat);base.userData.cupPart='base';base.rotation.x=Math.PI/2;base.position.y=.035;cup.add(base);
  const felt=new THREE.Mesh(new THREE.CircleGeometry(.308,40),new THREE.MeshStandardMaterial({color:'#080c09',map:grain,roughness:1,metalness:0}));
  felt.name='Dark felt cup interior';felt.userData.cupPart='felt';felt.rotation.x=-Math.PI/2;felt.position.y=.103;felt.receiveShadow=true;cup.add(felt);
  // The cup acts on its own: no hand, arm or off-screen grip geometry.
  let values=[1,2,3,4,5],held=[false,false,false,false,false],player=0,elapsed=0,rolling=false,reduced=false,serial=0,disposed=false,holdTime=0,ready=false,idleTime=0,readyWeight=0,returnTime=0,gathering=false,homeScale=CUP_FULL_SCALE,cupFromScale=CUP_FULL_SCALE,returnFromScale=CUP_FULL_SCALE;
  const holdStarts=dice.map(()=>new THREE.Vector3()),framingPoints=dice.map(()=>new THREE.Vector3());
  const home=new THREE.Vector3(),pourHome=new THREE.Vector3(),cupFrom=new THREE.Vector3(),returnFrom=new THREE.Vector3(),tmp=new THREE.Vector3(),point=new THREE.Vector3(),direction=new THREE.Vector3(),focus=new THREE.Vector3();
  const euler=new THREE.Euler(),spin=new THREE.Quaternion(),poseQ=new THREE.Quaternion(),cupStartQ=new THREE.Quaternion(),returnQ=new THREE.Quaternion(),matrix=new THREE.Matrix4(),cupScreenMatrix=new THREE.Matrix4();
  const restCupQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,-.035));
  const screenDice=dice.map((die,index)=>({x:0,y:0,left:0,right:0,top:0,bottom:0,visible:false,index,value:0,held:false})),screenCup={x:0,y:0,left:0,right:0,top:0,bottom:0,radius:0,width:0,height:0,visible:false,ready:false};
  // Cup parts are rigid. Cache their real vertices once in cup-local space,
  // then one combined matrix gives a tight live hitbox without frame allocations.
  const cupScreenVertices=new Float64Array(cup.children.reduce((count,part)=>count+part.geometry.attributes.position.count*3,0));
  let cupVertexOffset=0;
  for(const part of cup.children){
    part.updateMatrix();const positions=part.geometry.attributes.position;
    for(let vertex=0;vertex<positions.count;vertex++){
      point.fromBufferAttribute(positions,vertex).applyMatrix4(part.matrix).toArray(cupScreenVertices,cupVertexOffset);cupVertexOffset+=3;
    }
  }
  let duration=0,events=new Set();
  function setHome(who){
    const result=values.some(value=>value>0);
    home.set(result?-1.45:-.15,table.y+(result?.06:.20),result?.80:.05);homeScale=result?CUP_PARK_SCALE:CUP_FULL_SCALE;
    pourHome.set(-.20,table.y+.30,who?-.52:.52);
  }
  function placeTargets(){
    for(let i=0;i<5;i++){
      if(held[i])targets[i].set((i-2)*.6,table.y+HALF,player?-.75:1.43);
      else targets[i].set(layouts[i][0]+offsets[i].x,table.y+HALF,(player?.35-layouts[i][1]*.65:layouts[i][1])+offsets[i].y);
      targetQ[i].copy(faceQuaternion(values[i]||i+1,(i%2?1:-1)*.08+yaws[i]));
    }
  }
  function sync(nextValues,nextHeld,who=0,options={}){
    if(disposed)return;
    returnFrom.copy(cup.position);returnQ.copy(cup.quaternion);returnFromScale=cup.scale.x;
    if(who!==player||nextValues.every(value=>value===0)){for(let i=0;i<5;i++){offsets[i].set(0,0);yaws[i]=0;}}
    rolling=false;holdTime=0;idleTime=0;values=[...nextValues];held=[...nextHeld];player=who;setHome(who);placeTargets();returnTime=options?.animate===true?.55:0;
    if(returnTime===0){cup.position.copy(home);cup.quaternion.copy(restCupQ);cup.scale.setScalar(homeScale);}
    for(let i=0;i<5;i++){dice[i].visible=values[i]>0;dice[i].position.copy(targets[i]);dice[i].quaternion.copy(targetQ[i]);rings[i].position.set(targets[i].x,table.y+.012,targets[i].z);rings[i].visible=held[i]&&values[i]>0;}
  }
  function startRoll(nextValues,nextHeld,who=0,calm=false){
    if(disposed)return 0;
    if(holdTime>0)for(let i=0;i<5;i++)dice[i].position.copy(targets[i]);
    serial++;elapsed=0;holdTime=0;returnTime=0;gathering=false;events.clear();player=who;reduced=calm;duration=calm?.45:ROLL_DURATION;cupFrom.copy(cup.position);cupStartQ.copy(cup.quaternion);cupFromScale=cup.scale.x;
    for(let i=0;i<5;i++){starts[i].copy(dice[i].position);fromQ[i].copy(dice[i].quaternion);}
    values=[...nextValues];held=[...nextHeld];setHome(who);
    // Pure visual variation: never touch Math.random, crypto, or the rules' RNG state.
    const seed=(Math.imul(serial,0x9e3779b1)^Math.imul(player+1,0x85ebca6b)^values.reduce((n,v)=>n*7+v,19))>>>0;
    let rank=0;
    for(let i=0;i<5;i++){
      const p=plans[i],n=salt=>variation(seed+Math.imul(i+1,7919)+salt*104729);
      p.seed=seed;p.rank=rank;p.gather=dice[i].visible&&!held[i];gathering=gathering||p.gather;p.release=1.36+rank*.086+n(1)*.012;p.launched=false;p.settled=false;p.flightTime=0;p.contacts.length=0;
      p.axis.set(.5+n(2),n(3)*.65-.325,.5+n(4)).normalize();p.localQ.setFromEuler(euler.set(n(5)*TAU,n(6)*TAU,n(7)*TAU));
      p.mouth.set((n(8)-.5)*.075,1.115,(n(9)-.5)*.055);
      p.packed.set(rank%2?.028:-.028,.40+Math.floor(rank/2)*.15,(rank%3-1)*.02);
      p.omega=11+n(10)*5;p.drag=1.2+n(11)*.6;p.bow=(n(12)-.5)*.07;p.vy=.08+n(13)*.19;p.restitution=.26+n(14)*.085;
      if(!held[i]){offsets[i].set((n(15)-.5)*.095,(n(16)-.5)*.085);yaws[i]=(n(17)-.5)*.42;rank++;}
    }
    placeTargets();rolling=true;
    cup.updateMatrixWorld(true);
    for(let i=0;i<5;i++){
      if(!held[i]&&!plans[i].gather){
        dice[i].position.copy(plans[i].packed).applyMatrix4(cup.matrixWorld);internalPose(plans[i],0,dice[i].quaternion);
        starts[i].copy(dice[i].position);fromQ[i].copy(dice[i].quaternion);
      }
      // A new turn can be cast before its compact cup has finished growing.
      // Keep its loaded dice concealed until the full cup can contain them.
      dice[i].visible=held[i]||plans[i].gather||cup.scale.x>=CUP_FULL_SCALE-1e-9;rings[i].visible=held[i];
    }
    return duration;
  }
  function event(key,kind,position,strength=1,die){
    if(events.has(key))return;events.add(key);onEvent(kind,{position:position.clone(),strength,player,...(die===undefined?{}:{die})});
  }
  function supportHeight(q){
    matrix.makeRotationFromQuaternion(q);const e=matrix.elements;
    // Support of the rounded cube's core plus rounded corner, avoiding both penetration
    // and the visibly floating corners produced by an unrounded bounding-box support.
    return CORE*(Math.abs(e[1])+Math.abs(e[5])+Math.abs(e[9]))+ROUND;
  }
  function cupPose(t){
    const lift=smoother((t-.12)/.52)*(1-smoother((t-2.02)/.76));
    const shakeEnvelope=smoother((t-.58)/.15)*(1-smoother((t-1.13)/.2));
    const shake=(Math.sin(t*29)+.37*Math.sin(t*43+.6))*shakeEnvelope;
    const tilt=smoother((t-1.05)/.34)*(1-smoother((t-2.01)/.63)),side=player?1:-1;
    cup.position.lerpVectors(cupFrom,pourHome,smoother(t/.55)).lerp(home,smoother((t-2.02)/.76));
    cup.position.y+=lift*.22;cup.position.x+=shake*.027;cup.position.z+=Math.sin(t*24)*shakeEnvelope*.018;
    poseQ.setFromEuler(euler.set(side*(tilt*1.61+shake*.035),tilt*(player?-.14:.14),-.035+shake*.055));
    cup.quaternion.slerpQuaternions(cupStartQ,poseQ,smoother(t/.18));
    const castingScale=THREE.MathUtils.lerp(cupFromScale,CUP_FULL_SCALE,smoother(t/.28));
    cup.scale.setScalar(THREE.MathUtils.lerp(castingScale,homeScale,smoother((t-2.02)/.76)));
    cup.updateMatrixWorld(true);
  }
  function internalPose(p,t,out){
    const slide=smoother((t-(p.release-.25))/.25);
    spin.setFromAxisAngle(p.axis,Math.sin(t*23+p.rank)*.055*(1-slide)+slide*.42);
    return out.copy(cup.quaternion).multiply(p.localQ).multiply(spin);
  }
  function launch(p,currentTime){
    // Sample the exact release pose, so low frame rates never spawn a die at a later cup pose.
    cupPose(p.release);p.launch.copy(p.mouth).applyMatrix4(cup.matrixWorld);internalPose(p,p.release,p.launchQ);
    p.height=Math.max(0,p.launch.y-table.y-supportHeight(p.launchQ));
    p.launch.y=table.y+supportHeight(p.launchQ)+p.height;
    const first=(p.vy+Math.sqrt(p.vy*p.vy+2*GRAVITY*p.height))/GRAVITY;
    const speed=GRAVITY*first-p.vy,rebound=speed*p.restitution,next=2*rebound/GRAVITY,last=next*.28;
    p.contacts.push({time:first,speed},{time:first+next,speed:rebound},{time:first+next+last,speed:rebound*.28});
    p.first=first;p.next=next;p.last=last;p.rebound=rebound;p.airTime=first+next+last;
    spin.setFromAxisAngle(p.axis,p.omega*(1-Math.exp(-p.drag*first))/p.drag);p.brakeQ.copy(p.launchQ).multiply(spin);
    const distance=Math.hypot(targets[p.index].x-p.launch.x,targets[p.index].z-p.launch.z);
    p.travel=Math.max(p.airTime+.34,Math.min(1.32,.84+distance*.12));p.launched=true;
    cupPose(currentTime);
  }
  function flight(p,t,mesh){
    const age=Math.max(0,t-p.release),u=THREE.MathUtils.clamp(age/p.travel,0,1),progress=u*(2-u);
    p.flightTime=age;
    if(age<p.first){spin.setFromAxisAngle(p.axis,p.omega*(1-Math.exp(-p.drag*age))/p.drag);mesh.quaternion.copy(p.launchQ).multiply(spin);}
    else{
      // The first impact changes angular momentum. Brake from this fixed contact pose;
      // blending a still-spinning quaternion can flip its shortest arc at 180 degrees.
      const brake=THREE.MathUtils.clamp((age-p.first)/(p.travel-p.first),0,1);
      mesh.quaternion.slerpQuaternions(p.brakeQ,targetQ[p.index],brake*(2-brake));
    }
    mesh.position.lerpVectors(p.launch,targets[p.index],progress);
    direction.subVectors(targets[p.index],p.launch);const horizontal=Math.hypot(direction.x,direction.z)||1;
    const bow=Math.sin(Math.PI*u)*(1-u)*p.bow;mesh.position.x+=direction.z/horizontal*bow;mesh.position.z-=direction.x/horizontal*bow;
    let height=0;
    if(age<p.first)height=p.height+p.vy*age-.5*GRAVITY*age*age;
    else if(age<p.first+p.next){const s=age-p.first;height=p.rebound*s-.5*GRAVITY*s*s;}
    else if(age<p.airTime){const s=age-p.first-p.next;height=p.rebound*.28*s-.5*GRAVITY*s*s;}
    mesh.position.y=table.y+supportHeight(mesh.quaternion)+Math.max(0,height);
    for(let k=0;k<p.contacts.length;k++)if(age>=p.contacts[k].time){
      point.copy(mesh.position);point.y=table.y+.006;
      event('hit'+p.index+'-'+k,'impact',point,Math.min(.9,Math.max(.07,p.contacts[k].speed/4)),p.index);
    }
    if(u>=1&&!p.settled){p.settled=true;mesh.position.copy(targets[p.index]);mesh.quaternion.copy(targetQ[p.index]);point.copy(mesh.position);point.y=table.y+.006;event('settle'+p.index,'settle',point,.22,p.index);}
  }
  function update(dt){
    if(disposed||!Number.isFinite(dt)||dt<=0)return false;
    if(!rolling){
      if(holdTime>0){holdTime=Math.max(0,holdTime-dt);const t=smooth(1-holdTime/.34);for(let i=0;i<5;i++){dice[i].position.lerpVectors(holdStarts[i],targets[i],t);if(holdStarts[i].distanceToSquared(targets[i])>.0001)dice[i].position.y+=Math.sin(t*Math.PI)*.13;}}
      if(returnTime>0){
        returnTime=Math.max(0,returnTime-dt);const progress=smoother(1-returnTime/.55);
        cup.position.lerpVectors(returnFrom,home,progress);cup.quaternion.slerpQuaternions(returnQ,restCupQ,progress);cup.scale.setScalar(THREE.MathUtils.lerp(returnFromScale,homeScale,progress));
      }else if(!reduced){
        idleTime+=dt;readyWeight+=(Number(ready)-readyWeight)*(1-Math.exp(-dt*7));
        const wake=1-Math.exp(-idleTime*5),bob=Math.sin(idleTime*2.1)*(.007+.014*readyWeight)*wake;
        cup.position.copy(home);cup.position.y+=bob;
        cup.rotation.set(Math.sin(idleTime*1.25)*.012*readyWeight*wake,Math.sin(idleTime*.8)*.025*readyWeight*wake,-.035+Math.sin(idleTime*1.7)*.016*readyWeight*wake);
      }
      return false;
    }
    elapsed=Math.min(duration,elapsed+dt);
    if(reduced){
      const calm=smoother(elapsed/duration);cup.position.lerpVectors(cupFrom,home,calm);cup.quaternion.slerpQuaternions(cupStartQ,restCupQ,calm);cup.scale.setScalar(THREE.MathUtils.lerp(cupFromScale,homeScale,calm));
      for(let i=0;i<5;i++)if(!held[i]){
        dice[i].position.lerpVectors(starts[i],targets[i],smoother(elapsed/duration));dice[i].quaternion.slerpQuaternions(fromQ[i],targetQ[i],smoother(elapsed/duration));
        dice[i].position.y=Math.max(dice[i].position.y,table.y+supportHeight(dice[i].quaternion));
      }
    }else{
      const t=elapsed;cupPose(t);
      if(t>=.12&&gathering)event('sweep','sweep',cup.position,.28);
      for(let k=0;k<6;k++)if(t>=.64+k*.092)event('rattle'+k,'rattle',cup.position,.5+(k%2)*.13);
      for(let i=0;i<5;i++){
        if(held[i])continue;const p=plans[i],mesh=dice[i],loadEnd=.34+p.rank*.026,insideEnd=LOAD_END+p.rank*.012;
        if(p.gather&&t<loadEnd){
          const u=smoother(t/loadEnd);point.copy(p.mouth).addScaledVector(UP,.12).applyMatrix4(cup.matrixWorld);
          mesh.position.lerpVectors(starts[i],point,u);mesh.position.y+=Math.sin(u*Math.PI)*.12;
          internalPose(p,t,poseQ);mesh.quaternion.slerpQuaternions(fromQ[i],poseQ,u);
        }else if(t<p.release){
          if(p.gather&&t<insideEnd){point.copy(p.mouth).addScaledVector(UP,.12).lerp(p.packed,smoother((t-loadEnd)/(insideEnd-loadEnd)));}
          else point.copy(p.packed).lerp(p.mouth,smoother((t-(p.release-.25))/.25));
          mesh.position.copy(point).applyMatrix4(cup.matrixWorld);internalPose(p,t,mesh.quaternion);
        }else{
          if(!p.launched){launch(p,t);event('release'+i,'release',p.launch,.35,i);}
          flight(p,t,mesh);
        }
        mesh.visible=p.gather||p.launched||cup.scale.x>=CUP_FULL_SCALE-1e-9;
        mesh.position.y=Math.max(mesh.position.y,table.y+supportHeight(mesh.quaternion));
      }
      if(t>=RETURN_END)event('cup','cup',cup.position,.32);
    }
    if(elapsed>=duration){rolling=false;sync(values,held,player);return true;}return false;
  }
  function setHeld(nextHeld){
    if(disposed)return;for(let i=0;i<5;i++)holdStarts[i].copy(dice[i].position);held=[...nextHeld];placeTargets();holdTime=.34;
    for(let i=0;i<5;i++){rings[i].position.set(targets[i].x,table.y+.012,targets[i].z);rings[i].visible=held[i];}
  }
  function setReducedMotion(value){
    if(disposed)return;
    if(!rolling){reduced=Boolean(value);return;}
    if(!value||reduced)return;
    for(let i=0;i<5;i++){starts[i].copy(dice[i].position);fromQ[i].copy(dice[i].quaternion);}
    cupFrom.copy(cup.position);cupStartQ.copy(cup.quaternion);cupFromScale=cup.scale.x;elapsed=0;duration=.2;reduced=true;
  }
  function setReady(value){if(!disposed)ready=Boolean(value);}
  function getGripTarget(){return null;}
  function setGripResolver(){/* Compatibility: the autonomous cup never asks a paw to carry it. */}
  function getFocusTarget(out=focus){cup.updateMatrixWorld(true);return out.set(0,.52,0).applyMatrix4(cup.matrixWorld);}
  function getFramingPoints(){
    root.updateWorldMatrix(true,false);
    for(let i=0;i<5;i++)framingPoints[i].copy(targets[i]).applyMatrix4(root.matrixWorld);
    return framingPoints;
  }
  function screenPositions(){
    root.updateWorldMatrix(true,true);
    for(let i=0;i<5;i++){
      const target=screenDice[i],die=dice[i];tmp.setFromMatrixPosition(die.matrixWorld).project(world.camera);
      target.x=tmp.x*.5+.5;target.y=-tmp.y*.5+.5;target.visible=!disposed&&die.visible;target.value=values[i];target.held=held[i];
      target.left=target.top=Infinity;target.right=target.bottom=-Infinity;
      // Eight corners conservatively contain the rounded mesh, including during
      // a hold arc or tumble; shared scratch vectors keep UI projection allocation-free.
      for(let corner=0;corner<8;corner++){
        point.set(corner&1?HALF:-HALF,corner&2?HALF:-HALF,corner&4?HALF:-HALF).applyMatrix4(die.matrixWorld).project(world.camera);
        const x=point.x*.5+.5,y=-point.y*.5+.5;
        target.left=Math.min(target.left,x);target.right=Math.max(target.right,x);
        target.top=Math.min(target.top,y);target.bottom=Math.max(target.bottom,y);
      }
    }
    return screenDice;
  }
  function screenCupPosition(){
    getFocusTarget(focus);tmp.copy(focus).project(world.camera);
    direction.setFromMatrixColumn(world.camera.matrixWorld,0).multiplyScalar(.35);
    point.copy(focus).add(direction).project(world.camera);
    screenCup.x=tmp.x*.5+.5;screenCup.y=-tmp.y*.5+.5;screenCup.radius=Math.abs(point.x-tmp.x)*.5;
    // Project a padded local silhouette around the unchanged focus anchor. The
    // full normalized dimensions cover its asymmetric perspective and tilt.
    screenCup.width=0;screenCup.height=0;
    for(let corner=0;corner<8;corner++){
      point.set(corner&1?.415:-.415,corner&2?1.01:0,corner&4?.415:-.415).applyMatrix4(cup.matrixWorld).project(world.camera);
      screenCup.width=Math.max(screenCup.width,Math.abs(point.x-tmp.x));
      screenCup.height=Math.max(screenCup.height,Math.abs(point.y-tmp.y));
    }
    screenCup.left=screenCup.top=Infinity;screenCup.right=screenCup.bottom=-Infinity;
    cupScreenMatrix.multiplyMatrices(world.camera.projectionMatrix,world.camera.matrixWorldInverse).multiply(cup.matrixWorld);
    for(let vertex=0;vertex<cupScreenVertices.length;vertex+=3){
      point.fromArray(cupScreenVertices,vertex).applyMatrix4(cupScreenMatrix);
      const x=point.x*.5+.5,y=-point.y*.5+.5;
      screenCup.left=Math.min(screenCup.left,x);screenCup.right=Math.max(screenCup.right,x);
      screenCup.top=Math.min(screenCup.top,y);screenCup.bottom=Math.max(screenCup.bottom,y);
    }
    screenCup.visible=!disposed&&cup.visible&&tmp.z>=-1&&tmp.z<=1;screenCup.ready=ready&&!rolling&&!disposed;
    return screenCup;
  }
  sync([0,0,0,0,0],held);
  return{root,dice,cup,startRoll,update,sync,setHeld,setReducedMotion,setReady,screenCupPosition,getFocusTarget,getFramingPoints,getGripTarget,setGripResolver,screenPositions,get rolling(){return rolling;},
    getDebugState:()=>({rolling,elapsed,duration,reduced,ready,returning:returnTime>0,values:[...values],held:[...held],up:dice.map(d=>upwardFace(d.quaternion)),positions:dice.map(d=>d.position.toArray()),cup:cup.position.toArray(),cupRotation:cup.rotation.toArray().slice(0,3),cupScale:cup.scale.x,serial,flights:plans.map(p=>({gather:p.gather,release:p.release,launched:p.launched,settled:p.settled,age:p.flightTime,airTime:p.airTime,travel:p.travel,contacts:p.contacts.map(c=>c.time)}))}),
    dispose(){
      if(disposed)return;disposed=true;rolling=false;holdTime=0;returnTime=0;ready=false;root.removeFromParent();
      const geos=new Set(),mats=new Set(),maps=new Set(textures);maps.add(grain);
      root.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m){mats.add(m);for(const field of['map','bumpMap','roughnessMap','normalMap'])if(m[field])maps.add(m[field]);}});
      geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());maps.forEach(t=>t.dispose());
    }};
}
