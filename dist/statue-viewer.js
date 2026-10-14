import * as THREE from './vendor/three.module.js';
import {createDinosaur,preloadDinosaurAssets} from './dinosaurs.js';
import {createMiniSurface} from './mini-rides.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

const ALLOWED=new Set(['triceratops','stegosaurus','brachiosaurus','trex','spinosaurus','parasaurolophus','pteranodon']);
export function statueFraming(dimensions,{width,height,yaw=-.4,elevation=.38,zoom=8}){
  const points=[],cos=Math.cos(yaw),sin=Math.sin(yaw),ce=Math.cos(elevation),se=Math.sin(elevation);
  for(const x of[-dimensions.x/2,dimensions.x/2])for(const y of[0,dimensions.y])for(const z of[-dimensions.z/2,dimensions.z/2])points.push({x:x*cos+z*sin,y,z:-x*sin+z*cos});
  for(let i=0;i<24;i++){const a=i*Math.PI/12;points.push({x:Math.cos(a)*2.5,y:-.32,z:Math.sin(a)*2.5});}
  const ys=points.map(p=>p.y*ce-p.z*se),targetY=(Math.min(...ys)+Math.max(...ys))/(2*ce);
  const top=12,bottom=Math.min(72,height*.32),offsetY=(bottom-top)/2,tan=Math.tan(19*Math.PI/180),aspect=width/height;
  const halfY=Math.max(.35,1-(top+bottom)/height),halfX=Math.max(.4,1-26/width);let distance=3;
  for(const p of points){const y=(p.y-targetY)*ce-p.z*se,depth=(p.y-targetY)*se+p.z*ce;distance=Math.max(distance,depth+Math.abs(y)/(tan*halfY),depth+Math.abs(p.x)/(tan*aspect*halfX));}
  return{targetY,distance:(distance+.12)*zoom/8,offsetY,points};
}
// Fossil scans have no turntable pedestal. Fit their own complete bounds so a
// wide skeleton or thin matrix slab does not inherit an empty ring of space.
export function specimenFraming(dimensions,{width,height,yaw=-.15,elevation=.18,zoom=8,vertices=null}){
  const points=[],cos=Math.cos(yaw),sin=Math.sin(yaw),ce=Math.cos(elevation),se=Math.sin(elevation);
  for(const x of[-dimensions.x/2,dimensions.x/2])for(const y of[0,dimensions.y])for(const z of[-dimensions.z/2,dimensions.z/2])points.push({x:x*cos+z*sin,y,z:-x*sin+z*cos});
  const visit=fn=>{if(vertices?.length){for(let i=0;i<vertices.length;i+=3){const x=vertices[i],y=vertices[i+1],z=vertices[i+2];fn(x*cos+z*sin,y,-x*sin+z*cos);}}else for(const p of points)fn(p.x,p.y,p.z);};
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  visit((x,y,z)=>{const projectedY=y*ce-z*se;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,projectedY);maxY=Math.max(maxY,projectedY);});
  const targetX=(minX+maxX)/2,targetY=(minY+maxY)/(2*ce);
  const top=Math.min(48,height*.15),bottom=Math.min(74,height*.32),offsetY=(bottom-top)/2,tan=Math.tan(19*Math.PI/180),aspect=width/height;
  const halfY=Math.max(.25,1-(top+bottom)/height),halfX=Math.max(.35,1-36/width);let distance=.5;
  visit((x,y,z)=>{const projectedY=(y-targetY)*ce-z*se,depth=(y-targetY)*se+z*ce;distance=Math.max(distance,depth+Math.abs(projectedY)/(tan*halfY),depth+Math.abs(x-targetX)/(tan*aspect*halfX));});
  return{targetX,targetY,distance:(distance+.08)*zoom/8,offsetY,points};
}
function specimenVertices(scene,box,scale){
  let count=0;scene.traverse(node=>{if(node.isMesh)count+=node.geometry.attributes.position.count;});
  const vertices=new Float32Array(count*3),center=box.getCenter(new THREE.Vector3()),p=new THREE.Vector3();let offset=0;
  scene.traverse(node=>{if(!node.isMesh)return;const position=node.geometry.attributes.position;for(let i=0;i<position.count;i++){p.fromBufferAttribute(position,i).applyMatrix4(node.matrixWorld);vertices[offset++]=(p.x-center.x)*scale;vertices[offset++]=(p.y-box.min.y)*scale;vertices[offset++]=(p.z-center.z)*scale;}});
  return vertices;
}
// Shared bounded input model: two fingers zoom, one finger turns. Removing a
// finger starts a fresh drag so a pinch never causes a sudden rotation.
export function createMuseumOrbit(initial={}){
  const points=new Map();let distance=0;
  const defaults={yaw:Number.isFinite(initial.yaw)?initial.yaw:-.4,zoom:8,elevation:THREE.MathUtils.clamp(Number.isFinite(initial.elevation)?initial.elevation:.38,.15,.65)};
  const state={...defaults};
  const clamp=THREE.MathUtils.clamp;
  function reset(){Object.assign(state,defaults);clear();}
  function clear(){points.clear();distance=0;}
  function span(){const p=[...points.values()];return p.length===2?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0;}
  function down(id,x,y){if(points.size>=2&&!points.has(id))return;points.set(id,{x,y});distance=span();}
  function move(id,x,y){const previous=points.get(id);if(!previous)return;points.set(id,{x,y});if(points.size===2){const next=span();if(distance>4&&next>4)state.zoom=clamp(state.zoom*distance/next,3.5,14);distance=next;}else{state.yaw+=(x-previous.x)*.012;state.elevation=clamp(state.elevation+(y-previous.y)*.002,.15,.65);}}
  function focus(hotspot){if(!hotspot)return false;if(Number.isFinite(hotspot.yaw))state.yaw+=Math.atan2(Math.sin(hotspot.yaw-state.yaw),Math.cos(hotspot.yaw-state.yaw));if(Number.isFinite(hotspot.elevation))state.elevation=clamp(hotspot.elevation,.15,.65);state.zoom=Number.isFinite(hotspot.zoom)?clamp(hotspot.zoom,3.5,14):6.8;clear();return true;}
  return{state,reset,clear,down,move,up(id){points.delete(id);distance=span();},zoomBy(delta){if(Number.isFinite(delta))state.zoom=clamp(state.zoom+delta,3.5,14);},focus};
}
function bindOrbit(surface,orbit,{onExpand,ready=()=>true}={}){
  const controls=document.createElement('div');controls.className='statue-controls museum-orbit-controls';surface.root.append(controls);
  function button(parent,label,glyph,action){const b=document.createElement('button');b.type='button';b.textContent=glyph;b.setAttribute('aria-label',label);surface.listen(b,'click',()=>{if(!surface.blocked&&ready())action();});parent.append(b);return b;}
  button(controls,'Snúa til vinstri','↶',()=>orbit.state.yaw-=.5);
  button(controls,'Færa nær','+',()=>orbit.zoomBy(-.8));
  button(controls,'Sýna allt dýrið aftur','↺',()=>orbit.reset());
  button(controls,'Færa fjær','−',()=>orbit.zoomBy(.8));
  button(controls,'Snúa til hægri','↷',()=>orbit.state.yaw+=.5);
  if(onExpand){const expand=document.createElement('div');expand.className='museum-model-expand';surface.root.append(expand);button(expand,'Stækka þrívíddarskoðarann','⛶',onExpand);}
  surface.listen(surface.canvas,'pointerdown',event=>{if(surface.blocked||!ready())return;event.preventDefault();orbit.down(event.pointerId,event.clientX,event.clientY);surface.canvas.setPointerCapture?.(event.pointerId);surface.canvas.focus({preventScroll:true});});
  surface.listen(surface.canvas,'pointermove',event=>{if(!surface.blocked)orbit.move(event.pointerId,event.clientX,event.clientY);});
  for(const name of['pointerup','pointercancel','lostpointercapture'])surface.listen(surface.canvas,name,event=>orbit.up(event.pointerId));
  surface.listen(document,'visibilitychange',orbit.clear);
  surface.listen(surface.canvas,'wheel',event=>{if(surface.blocked||!ready())return;event.preventDefault();orbit.zoomBy(THREE.MathUtils.clamp(event.deltaY*.006,-1.5,1.5));},{passive:false});
  surface.listen(surface.canvas,'keydown',event=>{if(surface.blocked||!ready())return;let handled=true;switch(event.key){case'ArrowLeft':orbit.state.yaw-=.22;break;case'ArrowRight':orbit.state.yaw+=.22;break;case'ArrowUp':orbit.state.elevation=THREE.MathUtils.clamp(orbit.state.elevation-.06,.15,.65);break;case'ArrowDown':orbit.state.elevation=THREE.MathUtils.clamp(orbit.state.elevation+.06,.15,.65);break;case'+':case'=':orbit.zoomBy(-.6);break;case'-':orbit.zoomBy(.6);break;case'Home':orbit.reset();break;default:handled=false;}if(handled)event.preventDefault();});
}
export function createStatueViewer(host,{species='triceratops',hotspots=[],onHotspot=()=>{},onExpand}={}){
  let animal=null,version=0,yaw=-.95,zoom=8,modelReady=false;
  const orbit=createMuseumOrbit();
  let dimensions={x:4,y:2,z:2};
  const turntable=new THREE.Group(),surface=createMiniSurface(host,{className:'statue-surface',label:'Snúðu risaeðlustyttunni með fingrinum',onFrame(time,dt,size){
    if(!animal)return;yaw=THREE.MathUtils.damp(yaw,orbit.state.yaw,10,dt);zoom=THREE.MathUtils.damp(zoom,orbit.state.zoom,8,dt);turntable.rotation.y=yaw;const elevation=orbit.state.elevation;
    animal.update(time,{walking:0,flying:0,happy:0});
    const framing=statueFraming(dimensions,{...size,yaw,elevation,zoom});
    surface.camera.fov=38;surface.camera.setViewOffset(size.width,size.height,0,framing.offsetY,size.width,size.height);
    surface.camera.position.set(0,framing.targetY+Math.sin(elevation)*framing.distance,Math.cos(elevation)*framing.distance);surface.camera.lookAt(0,framing.targetY,0);surface.camera.updateProjectionMatrix();
  }});
  surface.scene.background=new THREE.Color('#b8cdbb');surface.scene.add(turntable);
  const pedestalGeometry=surface.own(new THREE.CylinderGeometry(2.35,2.5,.32,40)),pedestalMaterial=surface.own(new THREE.MeshStandardMaterial({color:'#dbb765',roughness:.65,metalness:.08}));
  const pedestal=new THREE.Mesh(pedestalGeometry,pedestalMaterial);pedestal.position.y=-.16;surface.scene.add(pedestal);
  const rim=new THREE.Mesh(surface.own(new THREE.TorusGeometry(2.33,.045,8,48)),surface.own(new THREE.MeshStandardMaterial({color:'#fff0ba',roughness:.55})));rim.rotation.x=-Math.PI/2;rim.position.y=.012;surface.scene.add(rim);
  bindOrbit(surface,orbit,{onExpand,ready:()=>modelReady});
  async function setSpecies(next){
    if(!ALLOWED.has(next)||surface.disposed)return{cancelled:true};const request=++version;surface.status.textContent='Styttan er að koma…';
    await preloadDinosaurAssets();if(surface.disposed||request!==version)return{cancelled:true};
    animal?.group.removeFromParent();animal?.dispose();animal=createDinosaur(next);species=next;animal.update(0,{flying:0});animal.group.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(animal.group,true),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const scale=Math.min(3.75/Math.max(.1,size.y),4.8/Math.max(size.x,size.z));animal.group.scale.setScalar(scale);animal.group.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
    dimensions={x:size.x*scale,y:size.y*scale,z:size.z*scale};
    // Measure in the new model's local scene before attaching to a turntable
    // that may still be rotated from the previous species.
    turntable.add(animal.group);yaw=-.95;orbit.reset();modelReady=true;surface.setReady();return{cancelled:false};
  }
  const ready=setSpecies(species).catch(()=>{if(!surface.disposed)surface.status.textContent='Styttan náði ekki að opnast.';return{cancelled:true};});
  return{ready,setSpecies,resetView:()=>orbit.reset(),focusHotspot(value){if(surface.blocked||!modelReady)return false;const item=typeof value==='number'?hotspots[value]:value;if(!orbit.focus(item))return false;onHotspot(item);return true;},setPaused(value){orbit.clear();surface.setPaused(value);},dispose(){version++;orbit.clear();animal?.dispose();animal=null;surface.dispose();},getDebugInfo(){return{...surface.getDebugInfo(),species,yaw,zoom,modelReady};}};
}

/** A museum scan is a separate static asset, never dressed as a game animal. */
export function validateSpecimenBytes(bytes){
  const view=new DataView(bytes);if(view.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==view.byteLength||view.getUint32(16,true)!==0x4e4f534a)throw Error('Invalid GLB');
  const length=view.getUint32(12,true);if(length>view.byteLength-20)throw Error('Invalid GLB JSON');const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,length)));
  if([...json.buffers||[],...json.images||[]].some(resource=>resource.uri&&!resource.uri.startsWith('data:')))throw Error('Specimen dependencies must be embedded');
  return json;
}
export function createSpecimenViewer(host,{src,label='Steingervingur í þrívídd',credit='',hotspots=[],onHotspot=()=>{},onExpand,initialView={}}={}){
  const orbit=createMuseumOrbit({yaw:-.15,elevation:.18,...initialView});
  let object=null,dimensions={x:4,y:2,z:2},vertices=null,frameKey='',cachedFrame=null,yaw=orbit.state.yaw,zoom=8,readyModel=false,disposed=false;
  const controller=new AbortController(),owned=new Set(),turntable=new THREE.Group();
  const surface=createMiniSurface(host,{className:'statue-surface museum-specimen',label,onFrame(_time,dt,size){
    if(!object)return;yaw=THREE.MathUtils.damp(yaw,orbit.state.yaw,10,dt);zoom=THREE.MathUtils.damp(zoom,orbit.state.zoom,8,dt);turntable.rotation.y=yaw;
    const elevation=orbit.state.elevation,key=`${size.width}:${size.height}:${yaw.toFixed(4)}:${elevation.toFixed(4)}`;
    // Exact surface fit is recomputed only while turning/resizing. A stationary
    // scan and a pinch zoom reuse it instead of traversing all vertices per frame.
    if(key!==frameKey){cachedFrame=specimenFraming(dimensions,{...size,yaw,elevation,vertices});frameKey=key;}
    const frame=cachedFrame,distance=frame.distance*zoom/8;surface.camera.fov=38;surface.camera.setViewOffset(size.width,size.height,0,frame.offsetY,size.width,size.height);
    surface.camera.position.set(frame.targetX,frame.targetY+Math.sin(elevation)*distance,Math.cos(elevation)*distance);surface.camera.lookAt(frame.targetX,frame.targetY,0);surface.camera.updateProjectionMatrix();
  }});
  surface.scene.background=new THREE.Color('#ded7c2');surface.scene.add(turntable);
  const plaque=document.createElement('p');plaque.className='museum-specimen-label';plaque.textContent=label;plaque.title=credit;surface.root.append(plaque);
  bindOrbit(surface,orbit,{onExpand,ready:()=>readyModel});surface.status.textContent='Steingervingurinn er að koma…';
  function collect(scene){scene.traverse(node=>{if(node.geometry)owned.add(node.geometry);for(const material of(Array.isArray(node.material)?node.material:[node.material]).filter(Boolean)){owned.add(material);for(const value of Object.values(material))if(value?.isTexture)owned.add(value);}});}
  function release(){for(const resource of owned){resource.dispose();resource.source?.data?.close?.();}owned.clear();object?.removeFromParent();object=null;vertices=null;cachedFrame=null;frameKey='';}
  const ready=(async()=>{try{const url=new URL(src,import.meta.url),base=new URL(import.meta.url);if(url.origin!==base.origin||!url.pathname.endsWith('.glb'))throw Error('Local GLB required');const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('Missing model');const bytes=await response.arrayBuffer();validateSpecimenBytes(bytes);const gltf=await new GLTFLoader().parseAsync(bytes,new URL('.',url).href);collect(gltf.scene);if(disposed){release();return{cancelled:true};}object=gltf.scene;object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object,true),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());if(!size.toArray().every(Number.isFinite)||Math.max(...size.toArray())<=0)throw Error('Empty model');const scale=Math.min(3.75/Math.max(.1,size.y),4.8/Math.max(size.x,size.z));vertices=specimenVertices(object,box,scale);object.scale.multiplyScalar(scale);object.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);dimensions={x:size.x*scale,y:size.y*scale,z:size.z*scale};turntable.add(object);readyModel=true;surface.setReady();return{cancelled:false};}catch{release();if(!disposed)surface.status.textContent='Þrívíddarsafngripurinn náði ekki að opnast. Þú getur samt skoðað myndirnar.';return{cancelled:true};}})();
  return{ready,resetView:()=>orbit.reset(),focusHotspot(value){if(surface.blocked||!readyModel)return false;const item=typeof value==='number'?hotspots[value]:value;if(!orbit.focus(item))return false;onHotspot(item);return true;},setPaused(value){orbit.clear();surface.setPaused(value);},dispose(){if(disposed)return;disposed=true;controller.abort();orbit.clear();release();surface.dispose();},getDebugInfo(){return{...surface.getDebugInfo(),modelReady:readyModel,kind:'specimen',yaw,zoom};}};
}
