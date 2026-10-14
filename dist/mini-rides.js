import * as THREE from './vendor/three.module.js';
import {createDinosaur,preloadDinosaurAssets} from './dinosaurs.js';
import {SAUROPOD_ANATOMY,createSauropodNeckPose} from './dinosaur-assets.js';
import {preloadEnvironmentAssets} from './environment-assets.js';

const clamp=THREE.MathUtils.clamp,TAU=Math.PI*2;
const SPECIES=new Set(['brachiosaurus','pteranodon']);
const FALL_SECONDS=3.8,SPAWN_SECONDS=2.05;
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const variation=(seed,index)=>{const value=Math.sin((seed+1)*127.1+(index+1)*311.7)*43758.5453;return value-Math.floor(value);};
const roundSeed=round=>Number.isFinite(round)?Math.max(0,Math.trunc(round)):0;
export function aerialChallenge(round=0){
  const seed=roundSeed(round),flip=seed%2?-1:1;
  return{round:seed,winds:Array.from({length:5},(_,id)=>({id,phase:.12+id*.176,lane:(id%2?1:-1)*flip*(.62+variation(seed,id)*.22)}))};
}
export function canopyFallerLane(item){
  const p=clamp(item.progress,0,1);return THREE.MathUtils.lerp(item.startLane,item.endLane,p)+Math.sin(p*Math.PI)*item.sway;
}

/** Deterministic physical crossings; a button or hint can never award a find. */
export function createAerialRules(species,{round=0,onProgress=()=>{},onWin=()=>{}}={}){
  if(!SPECIES.has(species))throw new Error('Óþekktur aukaleikur');
  const flight=species==='pteranodon',total=flight?5:10,challenge=aerialChallenge(round);
  let time=0,position=0,target=0,paused=false,disposed=false,won=false,count=0,help=0,misses=0,stun=0,bonks=0,catchExtent=3;
  let serial=0,nextSpawn=0,leafIndex=0,lastLeafLane=.7;
  const found=new Set(),events=[],fallers=[];
  const leafLane=id=>(id%2?1:-1)*(challenge.round%2?-1:1)*(.56+variation(challenge.round,id+17)*.29);
  function spawn(){
    const kind=serial%3===2?'cone':'leaf';let id=null,endLane;
    if(kind==='leaf'){
      for(let skip=0;skip<10&&(found.has(leafIndex%10)||fallers.some(item=>item.kind==='leaf'&&item.id===leafIndex%10&&!item.resolved));skip++)leafIndex++;
      if(found.has(leafIndex%10)||fallers.some(item=>item.kind==='leaf'&&item.id===leafIndex%10&&!item.resolved)){serial++;return;}
      id=leafIndex++%10;endLane=leafLane(id);lastLeafLane=endLane;
    }else endLane=clamp(lastLeafLane+(variation(challenge.round,serial+51)-.5)*.12,-.88,.88);
    const startLane=clamp(endLane+(variation(challenge.round,serial+83)-.5)*.48,-.9,.9),sway=(variation(challenge.round,serial+119)-.5)*.22;
    fallers.push({serial:serial++,id,kind,startLane,endLane,sway,age:0,resolved:false,outcome:null});
  }
  if(!flight){spawn();nextSpawn=SPAWN_SECONDS;}
  function earn(id){if(won||found.has(id))return;found.add(id);count++;events.push({type:'catch',id,count});onProgress(count,total);if(count===total){won=true;events.push({type:'win'});onWin();}}
  return{
    steer(value){if(!paused&&!disposed&&!won&&Number.isFinite(value))target=clamp(value,-1,1);},
    setCatchExtent(value){if(!disposed&&Number.isFinite(value)&&value>0)catchExtent=value;},
    setPaused(value){paused=Boolean(value);},
    hint(){if(!disposed&&!paused&&!won){help=12;events.push({type:'hint'});}},
    update(delta){
      if(disposed||paused||won||!Number.isFinite(delta)||delta<=0)return;
      const dt=Math.min(delta,.1),step=dt*(help>0?.55:1);help=Math.max(0,help-dt);
      const wasStunned=stun>0;stun=Math.max(0,stun-dt);if(!wasStunned)position=THREE.MathUtils.damp(position,target,8,dt);
      const previous=time;time+=step;
      if(flight){
        for(const wind of challenge.winds){
          const a=previous/48-wind.phase,b=time/48-wind.phase;
          if(Math.floor(a)!==Math.floor(b)){
            if(Math.abs(position-wind.lane)<.23)earn(wind.id);
            else if(!found.has(wind.id)){misses++;events.push({type:'miss',id:wind.id});}
          }
        }
      }else{
        for(const item of fallers){
          item.age+=step;
          if(item.age>=FALL_SECONDS&&!item.resolved){
            item.resolved=true;const hit=Math.abs(position-item.endLane)<Math.min(.30,.60/catchExtent);
            if(hit&&item.kind==='cone'){stun=.75;bonks++;item.outcome='bonk';events.push({type:'bonk',serial:item.serial});}
            else if(hit&&item.kind==='leaf'){item.outcome='caught';earn(item.id);}
            else{item.outcome='miss';if(item.kind==='leaf'){misses++;events.push({type:'miss',id:item.id});}}
          }
        }
        for(let i=fallers.length-1;i>=0;i--)if(fallers[i].age>FALL_SECONDS+.46)fallers.splice(i,1);
        if(time>=nextSpawn&&!won){spawn();nextSpawn+=SPAWN_SECONDS;}
      }
    },
    getState(){const items=fallers.map(item=>({...item,progress:item.age/FALL_SECONDS}));return{species,total,round:challenge.round,time,phase:(time/48)%1,position,target,count,won,paused,help,misses,bonks,stun,catchTolerance:Math.min(.30,.60/catchExtent),found:[...found],winds:challenge.winds.map(wind=>({...wind})),fallers:items};},
    takeEvents(){return events.splice(0);},
    dispose(){disposed=true;events.length=0;},
  };
}

export function aerialRoute(phase,round=0){
  const seed=roundSeed(round),a=phase*TAU+(seed%7)*.13,rx=21+(seed%3)*.6,rz=16+(seed%4)*.35;
  const position=v(Math.cos(a)*rx+Math.sin(a*2)*.7,13+Math.sin(a*2)*.45,Math.sin(a)*rz);
  const forward=v(-Math.sin(a)*rx+Math.cos(a*2)*1.4,Math.cos(a*2)*.9,Math.cos(a)*rz).normalize();
  return{position,forward,right:forward.clone().cross(v(0,1,0)).normalize()};
}

export const canopyBasketExtent=aspect=>Math.max(.55,Math.min(4.2,5.73*aspect-.8));
// The enlarged adult reaches over the same play lane; basket and leaves keep
// their familiar size. Feet remain on the ground below the treetop viewpoint.
export const CANOPY_MINI_ANIMAL=Object.freeze({scale:2.9,position:Object.freeze([-5.37,.2,-5.5])});

let styleReady=false;
function installStyle(){if(styleReady)return;styleReady=true;const style=document.createElement('style');style.textContent=`
.mini-aerial,.statue-surface{position:relative;isolation:isolate;overflow:hidden;width:100%;height:100%;min-height:180px;background:#a4c7bd;border-radius:22px;touch-action:none}.mini-aerial canvas,.statue-surface canvas{display:block;width:100%;height:100%;touch-action:none;outline-offset:-4px}.mini-aerial-status,.statue-status{position:absolute;top:12px;left:50%;transform:translateX(-50%);max-width:88%;padding:9px 15px;border-radius:20px;background:#fff7dc;color:#254d42;font:800 16px/1.2 system-ui;text-align:center;pointer-events:none;box-shadow:0 3px 10px #173e3520}.mini-aerial-status:empty,.statue-status:empty{display:none}.mini-aerial-controls,.statue-controls{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:12px;align-items:center}.mini-aerial-controls button,.statue-controls button{min-width:56px;min-height:48px;border:0;border-radius:18px;background:#fff3ce;color:#254d42;font:900 25px system-ui;box-shadow:0 4px 0 #749684;touch-action:none;cursor:pointer}.mini-aerial-controls button:active,.statue-controls button:active{transform:translateY(2px)}.mini-aerial-controls button:focus-visible,.statue-controls button:focus-visible{outline:4px solid #eaa441;outline-offset:3px}.mini-aerial-controls{left:12px;right:12px;transform:none;justify-content:space-between;pointer-events:none}.mini-aerial-controls button{pointer-events:auto}.mini-aerial-arrow{position:absolute;top:22%;left:50%;transform:translateX(-50%);font:900 38px system-ui;color:#ffef8a;text-shadow:0 2px 2px #2d594b;pointer-events:none}.mini-aerial-arrow:empty{display:none}.statue-controls{gap:8px}.statue-controls button{min-width:48px;min-height:48px;font-size:22px}@media(max-height:450px){.mini-aerial-controls,.statue-controls{bottom:6px}.mini-aerial-status{top:7px;font-size:14px;padding:5px 12px}.mini-aerial-controls button{min-height:48px}}
`;document.head.append(style);}

/** A renderer owns only its explicitly registered resources, never cached assets. */
export function createMiniSurface(host,{className='mini-aerial',label='Þrívíður leikur',onFrame=()=>{}}={}){
  installStyle();const root=document.createElement('div');root.className=className;
  const canvas=document.createElement('canvas');canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label',label);root.append(canvas);
  const status=document.createElement('div');status.className=className==='mini-aerial'?'mini-aerial-status':'statue-status';status.setAttribute('role','status');status.textContent='Augnablik…';root.append(status);host.append(root);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.1,160),owned=new Set(),cleanups=[];
  let renderer,frame=0,last=null,time=0,paused=false,disposed=false,ready=false,width=1,height=1;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.35));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.16;}
  catch{status.textContent='Þrívíddin náði ekki að vakna. Prófaðu að opna leikinn aftur.';}
  scene.background=new THREE.Color('#accbc2');scene.add(new THREE.HemisphereLight('#fff5d5','#365b49',2.1));const sun=new THREE.DirectionalLight('#fff1c7',2.1);sun.position.set(7,18,8);scene.add(sun);
  function resize(){const box=root.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);camera.aspect=width/height;camera.updateProjectionMatrix();renderer?.setSize(width,height,false);}
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(root);resize();
  function tick(stamp){if(disposed)return;frame=requestAnimationFrame(tick);const dt=last===null?0:Math.min(.05,Math.max(0,(stamp-last)/1000));last=stamp;if(paused||document.hidden||!ready||!renderer)return;time+=dt;onFrame(time,dt,{width,height,aspect:width/height});if(!disposed)renderer.render(scene,camera);}
  frame=requestAnimationFrame(tick);
  const visibility=()=>{last=null;};document.addEventListener('visibilitychange',visibility);
  function own(resource){owned.add(resource);return resource;}
  function listen(target,type,listener,options){target.addEventListener(type,listener,options);cleanups.push(()=>target.removeEventListener(type,listener,options));}
  return{root,canvas,status,scene,camera,own,listen,renderer,
    get disposed(){return disposed;},get blocked(){return disposed||paused||document.hidden;},get size(){return{width,height,aspect:width/height};},
    setReady(value=true){ready=value&&Boolean(renderer);if(!renderer)status.textContent='Þrívíddin náði ekki að vakna. Prófaðu að opna leikinn aftur.';else if(ready)status.textContent='';last=null;},
    setPaused(value){paused=Boolean(value);last=null;},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer?.disconnect();document.removeEventListener('visibilitychange',visibility);cleanups.forEach(fn=>fn());owned.forEach(resource=>resource.dispose());renderer?.dispose();renderer?.forceContextLoss();root.remove();},
    getDebugInfo(){return{ready,paused,disposed,time,width,height,drawCalls:renderer?.info.render.calls||0,triangles:renderer?.info.render.triangles||0,ownedResources:owned.size};},
  };
}

function material(surface,color,extra={}){return surface.own(new THREE.MeshStandardMaterial({color,roughness:.84,...extra}));}
function mesh(parent,geometry,mat,position,scale){const object=new THREE.Mesh(geometry,mat);if(position)object.position.set(...position);if(scale)object.scale.set(...scale);parent.add(object);return object;}
function cylinderBetween(parent,a,b,radius,mat,surface){const delta=b.clone().sub(a),object=mesh(parent,surface.own(new THREE.CylinderGeometry(radius*.75,radius,delta.length(),7)),mat);object.position.copy(a).add(b).multiplyScalar(.5);object.quaternion.setFromUnitVectors(v(0,1,0),delta.normalize());return object;}
function leafGeometry(surface){const shape=new THREE.Shape();shape.moveTo(0,-.55);shape.bezierCurveTo(-.55,-.2,-.42,.4,0,.68);shape.bezierCurveTo(.42,.4,.55,-.2,0,-.55);const geometry=surface.own(new THREE.ShapeGeometry(shape,9));const position=geometry.attributes.position;for(let i=0;i<position.count;i++)position.setZ(i,.12*(1-Math.abs(position.getX(i))/.55));geometry.computeVertexNormals();return geometry;}
export function addForest(surface,assets,flight){
  const {scene}=surface,model=assets.models.get('tree-common-3')||[...assets.models.values()].find(m=>m.kind==='tree');
  const matrices=[],dummy=new THREE.Object3D();
  for(let i=0;i<(flight?104:22);i++){
    const angle=i*2.399963,radius=flight?Math.sqrt((i+.5)/104)*46:7+(i%5)*2.5;
    dummy.position.set(Math.cos(angle)*radius,-.1,Math.sin(angle)*radius-(flight?0:8));
    if(!flight&&dummy.position.z>1)dummy.position.z=-7-Math.abs(dummy.position.z);
    const height=flight?7.2+(i%7)*.39:11+(i%5)*.8;dummy.scale.setScalar(height);dummy.rotation.y=i*.77;dummy.updateMatrix();matrices.push(dummy.matrix.clone());
  }
  if(model)for(const part of model.parts){const batch=new THREE.InstancedMesh(part.geometry,part.material,matrices.length);matrices.forEach((matrix,i)=>batch.setMatrixAt(i,matrix));batch.name='Shared miniature forest';scene.add(batch);}
  const ground=mesh(scene,surface.own(new THREE.CircleGeometry(flight?180:95,64)),material(surface,flight?'#52754c':'#628752'),[0,-.2,0]);ground.rotation.x=-Math.PI/2;
  scene.fog=new THREE.Fog(flight?'#bad3ca':'#accbc2',flight?26:24,flight?71:65);
  if(flight){
    scene.background=new THREE.Color('#bad3ca');
    // A low-cost, continuous crown layer fills the spaces between the detailed
    // trees and fades before the terrain ends. Only one extra pooled draw call.
    const crowns=new THREE.InstancedMesh(surface.own(new THREE.IcosahedronGeometry(1,1)),material(surface,'#719654'),420);
    crowns.name='Distant continuous forest crowns';
    for(let i=0;i<420;i++){
      const angle=i*2.399963,radius=Math.sqrt((i+.5)/420)*87;
      dummy.position.set(Math.cos(angle)*radius,3.6+(i%9)*.19,Math.sin(angle)*radius);
      dummy.scale.set(3.6+(i%5)*.32,2.1+(i%3)*.38,3.3+(i%7)*.19);dummy.rotation.set(.05*(i%3),i*.61,.035*(i%5));dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
      crowns.setColorAt(i,new THREE.Color().setHSL(.24+(i%5)*.012,.28+(i%3)*.025,.65+(i%7)*.025));
    }
    scene.add(crowns);
  }
  const cloudCount=flight?56:36,clouds=new THREE.InstancedMesh(surface.own(new THREE.SphereGeometry(1,flight?16:10,flight?12:7)),material(surface,flight?'#fff9e9':'#f6f0d8',flight?{emissive:'#dce9e2',emissiveIntensity:.3}:{}),cloudCount);
  clouds.name=flight?'Eight rounded cloud clusters':'Canopy clouds';
  const puffs=[[-2.6,0,0,2.4,1.65,2.0],[-.8,.6,.1,2.7,2.0,2.2],[1.4,.2,0,2.4,1.7,2.1],[3.1,-.15,.2,1.7,1.35,1.65],[.1,1.7,-.2,2.15,2.15,2.0],[-1.4,-.45,1,2.3,1.3,1.9],[1.4,-.5,.9,2.1,1.25,1.9]];
  for(let i=0;i<cloudCount;i++){
    if(flight){
      const cluster=Math.floor(i/7),angle=cluster*TAU/8+.24,r=38+(cluster%3)*6,puff=puffs[i%7],scale=.82+(cluster%3)*.12;
      dummy.position.set(Math.cos(angle)*r+puff[0]*Math.cos(angle)*scale,22+(cluster%3)*2.4+puff[1]*scale,Math.sin(angle)*r+puff[0]*Math.sin(angle)*scale+puff[2]*scale);
      dummy.scale.set(puff[3]*scale,puff[4]*scale,puff[5]*scale);dummy.rotation.set(0,angle,0);
    }else{const angle=Math.floor(i/3)*TAU/12,r=35+(i%3)*2;dummy.position.set(Math.cos(angle)*r,20+(i%4)*1.5,Math.sin(angle)*r);dummy.scale.set(3.2+(i%3),1.1,2.2);dummy.rotation.set(0,0,0);}
    dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);
  }
  scene.add(clouds);
}

/** The catch branch starts on the imported tree's actual bark, not in mid-air. */
export function addCanopySupport(surface,assets){
  const model=assets.models.get('tree-common-3')||[...assets.models.values()].find(m=>m.kind==='tree');
  const tree=new THREE.Group();tree.position.set(5.7,-.1,-3.6);tree.scale.setScalar(20);tree.rotation.y=.35;surface.scene.add(tree);tree.updateMatrixWorld(true);
  const desired=v(4.5,13.8,-2.5),socket=v(5.7,11.5,-3.6);let nearest=Infinity;
  if(model)for(const part of model.parts){
    mesh(tree,part.geometry,part.material);
    const materials=Array.isArray(part.material)?part.material:[part.material],geometry=part.geometry,position=geometry.attributes.position;
    for(const group of geometry.groups.length?geometry.groups:[{start:0,count:geometry.index?.count||position.count,materialIndex:0}]){
      if(!/Bark|Trunk|Wood/i.test(materials[group.materialIndex]?.name||''))continue;
      for(let i=group.start;i<group.start+group.count;i++){
        const point=v().fromBufferAttribute(position,geometry.index?geometry.index.getX(i):i).applyMatrix4(tree.matrixWorld),distance=point.distanceToSquared(desired);
        if(distance<nearest){nearest=distance;socket.copy(point);}
      }
    }
  }
  const points=[socket,v(3.7,13.8,-2.4),v(.8,13.55,-2.05),v(-2.0,13.3,-1.8),v(-4.5,13,-1.7)];
  const curve=new THREE.CatmullRomCurve3(points),bark=material(surface,'#795239');
  const branch=mesh(surface.scene,surface.own(new THREE.TubeGeometry(curve,32,.17,7,false)),bark);branch.name='Connected canopy bough';
  const greens=[material(surface,'#79a44f',{side:THREE.DoubleSide}),material(surface,'#aec46b',{side:THREE.DoubleSide})],blade=leafGeometry(surface);
  for(let i=0;i<15;i++){
    const root=curve.getPoint(.10+i*.058),tip=root.clone().add(v((i%2?1:-1)*.28,.5+(i%3)*.10,.16));
    cylinderBetween(surface.scene,root,tip,.025,bark,surface);
    const leaf=mesh(surface.scene,blade,greens[i%2],tip.toArray(),[.54,.68,.54]);leaf.rotation.z=(i%2?1:-1)*.65;
  }
  return{tree,branch,socket,connected:Boolean(model)&&Number.isFinite(nearest)};
}

function createBasket(surface){
  const basket=new THREE.Group(),wicker=material(surface,'#c68a42'),edge=material(surface,'#f0c77b');
  const bowl=mesh(basket,surface.own(new THREE.CylinderGeometry(.65,.43,.48,18,1,true)),wicker,[0,-.2,0]);
  mesh(basket,surface.own(new THREE.CylinderGeometry(.43,.43,.07,18)),wicker,[0,-.45,0]);
  const ring=mesh(basket,surface.own(new THREE.TorusGeometry(.65,.045,6,24)),edge);ring.rotation.x=Math.PI/2;
  for(let i=0;i<3;i++){const hoop=mesh(basket,surface.own(new THREE.TorusGeometry(.48+i*.052,.025,5,24)),edge,[0,-.37+i*.12,0]);hoop.rotation.x=Math.PI/2;}
  bowl.name='Karfan grípur laufin';surface.scene.add(basket);return basket;
}

function createFallingLeaf(surface){
  const group=new THREE.Group();group.scale.setScalar(1.25);surface.scene.add(group);
  const blade=mesh(group,leafGeometry(surface),material(surface,'#d9b955',{side:THREE.DoubleSide}));group.userData.blade=blade;
  const vein=material(surface,'#fff1a2');cylinderBetween(group,v(0,-.68,.14),v(0,.53,.14),.018,vein,surface);
  for(const side of[-1,1])for(const y of[-.15,.13])cylinderBetween(group,v(0,y,.14),v(side*.27,y+.17,.10),.012,vein,surface);
  return group;
}

export function createPinecone(surface){
  const group=new THREE.Group(),bark=material(surface,'#674027'),scales=material(surface,'#a96932');group.name='Brúnn köngull';
  mesh(group,surface.own(new THREE.SphereGeometry(1,12,10)),bark,[0,0,0],[.31,.57,.31]);
  const plates=new THREE.InstancedMesh(surface.own(new THREE.IcosahedronGeometry(1,0)),scales,35),dummy=new THREE.Object3D();
  for(let row=0;row<5;row++)for(let col=0;col<7;col++){
    const angle=(col+(row%2)*.5)*TAU/7,radius=.24+Math.sin((row+1)*Math.PI/6)*.05;
    dummy.position.set(Math.cos(angle)*radius,(row-2)*.22,Math.sin(angle)*radius);dummy.rotation.set(0,-angle,.2);dummy.scale.set(.19,.18,.13);dummy.updateMatrix();plates.setMatrixAt(row*7+col,dummy.matrix);
    plates.setColorAt(row*7+col,new THREE.Color().setScalar(.82+((row+col)%3)*.09));
  }
  group.add(plates);cylinderBetween(group,v(0,.52,0),v(.07,.75,0),.045,bark,surface);group.scale.setScalar(1.1);surface.scene.add(group);return group;
}

function createWind(surface,index){
  const group=new THREE.Group(),mat=material(surface,index===1?'#46b9bd':'#66cba9',{side:THREE.DoubleSide,emissive:'#31676a',emissiveIntensity:.24});
  for(let strand=0;strand<3;strand++){
    const points=[];for(let step=0;step<=20;step++){const t=step/20;points.push(new THREE.Vector3((t-.5)*2.4+strand*.23,Math.sin(t*Math.PI)*1.0+(strand-1)*.4,Math.sin(t*Math.PI*1.6)*.08));}
    const curve=new THREE.CatmullRomCurve3(points);mesh(group,surface.own(new THREE.TubeGeometry(curve,24,.045,5,false)),mat);
  }
  group.scale.setScalar(.85);
  surface.scene.add(group);return group;
}

export function createAerialMiniGame(stage,{species,audio,onWin=()=>{},onProgress=()=>{},round=0}={}){
  if(!SPECIES.has(species))throw new Error('Óþekktur aukaleikur');
  let winDelay=null,winSent=false;
  const flight=species==='pteranodon',rules=createAerialRules(species,{round,onWin:()=>{winDelay=.85;},onProgress});
  let animal=null,neckPose=null,basket=null,falling=[],winds=[],key=0,pointer=null,noticeAge=0,gameReady=false;
  const surface=createMiniSurface(stage,{label:flight?'Fljúgðu til vinstri og hægri í vindinn':'Færðu körfuna undir laufin',onFrame:update});
  const controls=document.createElement('div');controls.className='mini-aerial-controls';surface.root.append(controls);
  const arrow=document.createElement('div');arrow.className='mini-aerial-arrow';arrow.setAttribute('aria-hidden','true');surface.root.append(arrow);
  const buttons=[];
  for(const[direction,label,glyph]of [[-1,'Til vinstri','←'],[1,'Til hægri','→']]){
    const button=document.createElement('button');button.type='button';button.textContent=glyph;button.setAttribute('aria-label',label);controls.append(button);buttons.push(button);
    surface.listen(button,'pointerdown',event=>{event.preventDefault();if(surface.blocked)return;key=direction;button.setPointerCapture?.(event.pointerId);});
    const release=()=>{key=0;};surface.listen(button,'pointerup',release);surface.listen(button,'pointercancel',release);surface.listen(button,'lostpointercapture',release);
    surface.listen(button,'click',event=>{if(event.detail===0&&!surface.blocked)rules.steer(rules.getState().target+direction*.38);});
  }
  const pointerRay=new THREE.Raycaster(),catchPlane=new THREE.Plane(v(0,0,1),-.7),catchPoint=v();
  function steerFromPointer(event){
    const box=surface.canvas.getBoundingClientRect(),x=(event.clientX-box.left)/box.width;
    if(flight)rules.steer(clamp((x-.5)*2.3,-1,1));
    else{pointerRay.setFromCamera(new THREE.Vector2(x*2-1,-((event.clientY-box.top)/box.height)*2+1),surface.camera);if(pointerRay.ray.intersectPlane(catchPlane,catchPoint))rules.steer(catchPoint.x/canopyBasketExtent(surface.size.aspect));}
  }
  surface.listen(surface.canvas,'pointerdown',event=>{if(surface.blocked||!gameReady)return;pointer=event.pointerId;surface.canvas.setPointerCapture?.(pointer);surface.canvas.focus({preventScroll:true});steerFromPointer(event);});
  surface.listen(surface.canvas,'pointermove',event=>{if(event.pointerId===pointer&&!surface.blocked)steerFromPointer(event);});
  const endPointer=()=>{pointer=null;};surface.listen(surface.canvas,'pointerup',endPointer);surface.listen(surface.canvas,'pointercancel',endPointer);
  surface.listen(surface.root,'keydown',event=>{if(surface.blocked)return;if(['ArrowLeft','a','A','ArrowRight','d','D'].includes(event.key)){event.preventDefault();key=['ArrowLeft','a','A'].includes(event.key)?-1:1;}});
  surface.listen(surface.root,'keyup',event=>{if(['ArrowLeft','a','A','ArrowRight','d','D'].includes(event.key))key=0;});
  surface.listen(surface.root,'focusout',()=>{key=0;});
  surface.listen(document,'visibilitychange',()=>{key=0;pointer=null;});
  function update(time,dt,size){
    if(!gameReady)return;if(!flight)rules.setCatchExtent(canopyBasketExtent(size.aspect));if(key)rules.steer(rules.getState().target+key*dt*.95);rules.update(dt);if(surface.disposed)return;const state=rules.getState();
    if(winDelay!==null&&!winSent){winDelay-=dt;if(winDelay<=0){winSent=true;onWin();if(surface.disposed)return;}}
    if(noticeAge>0){noticeAge-=dt;if(noticeAge<=0)surface.status.textContent='';}
    for(const event of rules.takeEvents()){
      if(event.type==='catch'){audio?.effect?.(flight?'breeze':'leaf');surface.status.textContent=flight?'Þarna fannstu vindinn!':'Lauf í körfuna!';noticeAge=1.6;}
      if(event.type==='miss'){surface.status.textContent=flight?'Vindurinn kemur aftur.':'Næsta lauf er á leiðinni.';noticeAge=1.8;}
      if(event.type==='bonk'){if(audio?.worldTouch)audio.worldTouch('tree');else audio?.effect?.('tap');surface.status.textContent='Úps, köngull! Laufin þín eru enn í körfunni.';noticeAge=2.1;}
      if(event.type==='win'){surface.status.textContent=flight?'Fimm vindar fundnir!':'Tíu lauf í körfunni!';noticeAge=1000;}
    }
    if(flight){
      const route=aerialRoute(state.phase,state.round),position=route.position.clone().addScaledVector(route.right,state.position*4);
      animal.group.position.copy(position);animal.group.rotation.set(0,Math.atan2(-route.forward.z,route.forward.x),0);
      animal.update(time,{flying:1,glide:.76,bank:state.target-state.position});animal.group.updateMatrixWorld(true);
      surface.camera.fov=108;surface.camera.position.copy(animal.group.localToWorld(v(-2,2.25,0)));surface.camera.lookAt(animal.group.localToWorld(v(5,2.6,0)));surface.camera.updateProjectionMatrix();
      winds.forEach((wind,index)=>{wind.visible=!state.found.includes(index);wind.rotation.z=Math.sin(time*.7+index)*.04;});
      const next=state.winds.map(wind=>({...wind,a:(wind.phase-state.phase+1)%1})).filter(wind=>!state.found.includes(wind.id)).sort((a,b)=>a.a-b.a)[0];
      arrow.textContent=state.help>0&&next?(next.lane<state.position?'←':'→'):'';
    }else{
      const extent=canopyBasketExtent(size.aspect);
      surface.camera.fov=50;surface.camera.position.set(0,10.65,13);surface.camera.lookAt(0,10.65,0);surface.camera.updateProjectionMatrix();
      basket.position.set(state.position*extent,7.15,.7);basket.rotation.z=state.stun>0?Math.sin(state.stun*38)*.09:0;
      falling.forEach(object=>{object.visible=false;});
      const next=state.fallers.filter(item=>item.kind==='leaf'&&!item.resolved).sort((a,b)=>b.progress-a.progress)[0];
      for(const item of state.fallers){
        const object=falling[item.serial%3],after=Math.max(0,item.progress-1),caught=item.outcome==='caught';object.visible=!state.won;
        object.position.set(canopyFallerLane(item)*extent+(item.outcome==='bonk'?after*8:0),14.4-item.progress*7.25+(item.outcome==='bonk'?Math.sin(after*17)*.5:0),.65);
        object.rotation.set(item.kind==='cone'?.25+time*.55:.16,Math.sin(time*2+item.serial)*.38,Math.sin(time*2.5+item.serial)*.2);object.scale.setScalar((item.kind==='cone'?1.1:1.25)*(caught?Math.max(0,1-after*8):1));
        if(object.userData.blade){object.userData.blade.material.emissive.set(state.help>0&&next?.serial===item.serial?'#bf941d':'#000000');object.userData.blade.material.emissiveIntensity=.5;}
      }
      neckPose?.restore();animal.update(time,{look:.22,gazeHeight:.2,happy:state.won?1:0});
      animal.group.updateMatrixWorld(true);neckPose?.aim(animal.group.localToWorld(v(...SAUROPOD_ANATOMY.browse)));
      arrow.textContent=state.help>0&&next?(next.endLane<state.position?'←':'→'):'';
    }
  }
  const ready=Promise.all([preloadDinosaurAssets(),preloadEnvironmentAssets()]).then(([,assets])=>{
    if(surface.disposed)return{cancelled:true};animal=createDinosaur(species);surface.scene.add(animal.group);addForest(surface,assets,flight);
    if(flight){animal.group.scale.setScalar(1.45);winds=rules.getState().winds.map(({phase,lane,id})=>{const wind=createWind(surface,id),route=aerialRoute(phase,round);wind.position.copy(route.position).addScaledVector(route.right,lane*4).add(v(0,1.45*2.25,0));wind.quaternion.setFromUnitVectors(v(0,0,1),route.forward);return wind;});}
    else{
      animal.group.position.set(...CANOPY_MINI_ANIMAL.position);animal.group.scale.setScalar(CANOPY_MINI_ANIMAL.scale);neckPose=createSauropodNeckPose(animal);basket=createBasket(surface);
      falling=[createFallingLeaf(surface),createFallingLeaf(surface),createPinecone(surface)];falling.forEach(object=>{object.visible=false;});
      addCanopySupport(surface,assets);
    }
    gameReady=true;onProgress(0,flight?5:10);surface.setReady();return{cancelled:false};
  }).catch(()=>{if(!surface.disposed)surface.status.textContent='Ævintýrið náði ekki að opnast. Prófaðu aftur.';return{cancelled:true};});
  return{ready,setPaused(value){key=0;pointer=null;rules.setPaused(value);surface.setPaused(value);},hint(){if(!surface.blocked)rules.hint();},
    dispose(){rules.dispose();neckPose?.dispose();animal?.dispose();surface.dispose();},getDebugInfo(){return{...surface.getDebugInfo(),...rules.getState()};}};
}


