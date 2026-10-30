import * as THREE from 'three';
import { RIVER, MARSH, BRIDGE, riverDistance } from './bridge-props.js';

const random = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/** A shared breeze for planted scenery. Roots stay fixed and only the soft
 * tips move. This remains in the existing material/draw, without a shadow pass. */
export function installStoryBreeze(material, geometries, heightAt) {
  for (const geometry of [geometries].flat()) {
    const p = geometry.attributes.position, weights = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) weights[i] = Math.min(1, Math.max(0, (p.getY(i) - heightAt(p.getX(i), p.getZ(i)) - .075) / .65)) ** 1.4;
    geometry.setAttribute('aStoryBend', new THREE.BufferAttribute(weights, 1));
  }
  const time = { value: 0 }, compile = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer); shader.uniforms.uStoryBreezeTime = time;
    shader.vertexShader = `uniform float uStoryBreezeTime; attribute float aStoryBend;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      float breezePhase=position.x*.53+position.z*.31;
      float breeze=sin(uStoryBreezeTime*1.35+breezePhase)*.075+sin(uStoryBreezeTime*2.3+breezePhase*1.7)*.025;
      transformed.x+=breeze*aStoryBend;
      transformed.z+=breeze*aStoryBend*.55;`);
  };
  material.customProgramCacheKey = () => `${key()}-story-breeze-v1`; material.needsUpdate = true;
  return { update(timeValue, reduced) { time.value = reduced ? 0 : timeValue; } };
}

/** Planted detail is kept on the outer shoulders of all three play spaces.
 * It never becomes an unregistered obstacle in an animal's walking corridor.
 * Everything botanical shares one draw; the six butterflies share another. */
/** `avoid(x, z)` says where nothing may be planted (the leaves' ground and a margin round it). */
export function createLivingForest(world, { avoid = () => false } = {}) {
  const root = new THREE.Group(); root.name = 'Lifandi skógarjaðar'; world.scene.add(root);
  // The planted detail is cut in three by where it lies (the glade, the place after the log, the grove): a camera draws only what it sees.
  const zones = [0, 1, 2].map(() => ({ positions: [], colours: [], weights: [] })), tint = new THREE.Color();
  const height = (x, z) => world.heightAt(x, z);
  function tri(a, b, c, colour, bends = [0, 0, 0]) {
    tint.set(colour);
    const { positions, colours, weights } = zones[a[2] > -8 ? 0 : a[2] > -20 ? 1 : 2];
    for (const [i, point] of [a,b,c].entries()) { positions.push(...point); colours.push(tint.r, tint.g, tint.b); weights.push(bends[i]); }
  }
  function blade(x, z, angle, length, width, colour, seed) {
    const y = height(x,z)+.055, dx = Math.cos(angle), dz = Math.sin(angle), sway = .16 + random(seed) * .16;
    const a = [x-dz*width,y,z+dx*width], b = [x+dz*width,y,z-dx*width];
    const cx=x+dx*sway, cz=z+dz*sway, cy=y+length*.58;
    const c=[cx-dz*width*.62,cy,cz+dx*width*.62], d=[cx+dz*width*.62,cy,cz-dx*width*.62], top=[x+dx*sway*1.8,y+length,z+dz*sway*1.8];
    tri(a,b,c,colour,[0,0,.45]); tri(b,d,c,colour,[0,.45,.45]);
    tri(c,d,top,colour,[.45,.45,1]);
  }
  function leaf(x,y,z,angle,length,width,colour,raised=.055) {
    const dx=Math.cos(angle),dz=Math.sin(angle),a=[x,y,z],tip=[x+dx*length,y+raised,z+dz*length];
    const left=[x+dx*length*.48-dz*width,y+raised*.85,z+dz*length*.48+dx*width];
    const right=[x+dx*length*.48+dz*width,y+raised*.85,z+dz*length*.48-dx*width];
    const mid=[x+dx*length*.48,y+raised+.025,z+dz*length*.48];
    tri(a,left,mid,colour,[0,.4,.6]);tri(left,tip,mid,colour,[.4,1,.6]);
    tint.set(colour).multiplyScalar(.82);const shadow=tint.getHex();
    tri(a,mid,right,shadow,[0,.6,.4]);tri(right,mid,tip,shadow,[.4,.6,1]);
  }
  function broadLeaf(x,y,z,angle,length,width,colour) {
    // A folded, rounded silhouette catches sunlight along its curved spine.
    const dx=Math.cos(angle),dz=Math.sin(angle),ridge=[x+dx*length*.47,y+length*.37,z+dz*length*.47];
    const rim=[[0,0],[.16,.6],[.48,1],[.8,.72],[1,0],[.8,-.72],[.48,-1],[.16,-.6]];
    const points=rim.map(([along,wide])=>[x+dx*length*along-dz*width*wide,y+Math.sin(along*Math.PI*.85)*length*.32,z+dz*length*along+dx*width*wide]);
    tint.set(colour).multiplyScalar(.8);const shadow=tint.getHex();
    for(let i=0;i<points.length;i++)tri(points[i],points[(i+1)%points.length],ridge,i<4?colour:shadow,[.7,.7,.65]);
  }
  function fern(x,y,z,angle,length,colour) {
    const dx=Math.cos(angle),dz=Math.sin(angle);
    for(let i=1;i<=6;i++) {
      const t=i/7,px=x+dx*length*t,pz=z+dz*length*t,py=y+Math.sin(t*Math.PI*.82)*length*.44;
      const spread=(.12+Math.sin(t*Math.PI)*.14)*length;
      for(const side of[-1,1])leaf(px,py,pz,angle+side*1.12,spread,spread*.29,colour,.018);
    }
    leaf(x+dx*length*.78,y+length*.27,z+dz*length*.78,angle,length*.24,length*.055,colour,.025);
  }
  function safe(x,z) {
    if (avoid(x,z)) return false;
    // The first clearing's centre and its leaf aisles remain open.
    if (x>-9.4&&x<5.9&&z>-5.7&&z<10.3) return false;
    if (x>-1.9&&x<10.6&&z>-17.4&&z<-9.8) return false;
    if (x>-1.3&&x<10.4&&z>-30.3&&z<-22.1) return false;
    if (Math.hypot(x+8.8,z-9.7)<1.8) return false;
    if (Math.min(Math.hypot(x-BRIDGE.near[0],z-BRIDGE.near[1]),Math.hypot(x-BRIDGE.far[0],z-BRIDGE.far[1]))<3.3) return false;
    if (riverDistance(x,z).distance<2.0) return false;
    const marsh=Math.hypot((x-MARSH.center[0])/MARSH.halfWidth,(z-MARSH.center[1])/MARSH.halfDepth);
    return marsh>1.15;
  }
  const anchors=[[-10.4,1.5],[-10.6,4.6],[-10.5,7.8],[-7.2,11.5],[-4.8,11.4],[-1.8,11.7],[1.1,11.4],[4.2,10.8],[6.3,9.1],[-10.5,-3.4],[-11.3,-5.9],[-7.4,-13.2],[-4.1,-14.6],[-2.7,-17.4],[11.4,-12.9],[11.7,-15.7],[-2.6,-23.8],[-2.7,-27.3],[.3,-31],[4.3,-31.3],[8.2,-31],[11.6,-27.4],[11.4,-24],[-2.6,-20],[11.6,-20]];
  for(let i=2;i<RIVER.points.length-2;i+=3){const a=RIVER.points[i-1],p=RIVER.points[i],b=RIVER.points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);for(const side of[-1,1])anchors.push([p[0]-dz/l*2.35*side,p[1]+dx/l*2.35*side]);}
  let planted=0;
  for(const [index,[cx,cz]]of anchors.entries()) {
    const density=3+Math.floor(random(index*19+8)*4),clusterAngle=random(index*13)*Math.PI*2;
    for(let clump=0;clump<density;clump++) {
      const seed=index*43+clump*7,angle=clusterAngle+clump*2.4,radius=clump===0?.05:.3+random(seed)*.7;
      const x=cx+Math.cos(angle)*radius,z=cz+Math.sin(angle)*radius*.8;
      if(!safe(x,z))continue;planted++;
      const size=(clump===0?1.1:.5+random(seed+20)*.48),kind=clump===0?index%3:random(seed+32)>.7?1:2,y=height(x,z)+.06;
      if(kind===0)for(let k=0;k<4;k++)fern(x,y,z,clusterAngle+k*2.1,(.8+random(seed+k)*.35)*size,['#54844b','#699b55','#8aab60'][k%3]);
      if(kind===1)for(let k=0;k<5;k++)broadLeaf(x,y,z,clusterAngle+k*2.4,(.48+random(seed+k)*.33)*size,(.15+random(seed+k+8)*.07)*size,['#4e854b','#709b50','#8bac60'][k%3]);
      // Small grasses bind the bigger leaves into planted beds instead of
      // repeating one starburst plant evenly along the edge of the clearing.
      for(let k=0;k<(kind===2?6:2);k++)blade(x+(random(seed+k+2)-.5)*.22,z+(random(seed+k+9)-.5)*.22,k*2.4+index,(.18+random(seed+k+3)*.36)*size,(.013+random(seed+k+4)*.017)*size,['#688841','#8eaa55','#b0bb75'][k%3],seed+k);
      if(index%3===0&&clump<2){const y=height(x,z)+.38;blade(x,z,0,.34,.013,'#5e8143',seed);for(let p=0;p<5;p++)leaf(x,y,z,p*Math.PI*.4,.11,.055,index%2?'#f4ce72':'#e7dbae',.035);}
    }
  }
  // Flat fallen leaves and small seed fragments add scale to the bare soil.
  // Their top is below a sole; they do not change physical navigation.
  for(let i=0;i<100;i++) {
    const zone=i%3,cx=zone?-2+zone*3.25:-2,cz=zone===0?4:zone===1?-13.7:-26.5;
    const x=cx+(random(i*7)-.5)*(zone?8.7:14),z=cz+(random(i*7+1)-.5)*(zone?5.6:10.3);
    if(riverDistance(x,z).distance<2.4||avoid(x,z))continue;
    const y=height(x,z)+.083,a=random(i+14)*Math.PI*2,l=.06+random(i+19)*.13;
    leaf(x,y,z,a,l,l*.31,['#9c9159','#9d7844','#b5a168','#7a8c4c'][i%4],-.015);
  }
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93,side:THREE.DoubleSide}), geometries=[];
  for(const [index,{positions,colours,weights}]of zones.entries()) {
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geometry.setAttribute('aStoryBend',new THREE.Float32BufferAttribute(weights,1));geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const foliage=new THREE.Mesh(geometry,material);foliage.name=`Trjágróður, starir og skógarbotn ${index+1}`;foliage.receiveShadow=true;root.add(foliage);geometries.push(geometry);
  }
  const breeze=installStoryBreeze(material,geometries,height);

  const butterflyPos=[],butterflyColours=[];
  function wingTri(a,b,c,col){const colour=new THREE.Color(col);butterflyPos.push(...a,...b,...c);for(let i=0;i<3;i++)butterflyColours.push(colour.r,colour.g,colour.b);}
  for(const side of[-1,1]) {
    const rim=[[0,0,0],[side*.16,0,-.15],[side*.28,0,-.10],[side*.26,0,.03],[side*.14,0,.13],[side*.03,0,.08]];
    for(let i=1;i<rim.length-1;i++)wingTri(rim[0],rim[i],rim[i+1],i%2?'#eebd5e':'#f6d88a');
    wingTri([side*.13,.002,-.08],[side*.21,.002,-.065],[side*.17,.002,-.005],'#fff0ba');
  }
  wingTri([-.015,.005,-.1],[.015,.005,-.1],[.015,.005,.1],'#6d593a');wingTri([-.015,.005,-.1],[.015,.005,.1],[-.015,.005,.1],'#6d593a');
  const butterflyGeometry=new THREE.BufferGeometry();butterflyGeometry.setAttribute('position',new THREE.Float32BufferAttribute(butterflyPos,3));butterflyGeometry.setAttribute('color',new THREE.Float32BufferAttribute(butterflyColours,3));
  const phases=new THREE.InstancedBufferAttribute(new Float32Array([.1,1.4,2.7,4,5.3,6.6]),1);butterflyGeometry.setAttribute('aButterflyPhase',phases);
  const butterflyTime={value:0},butterflyMaterial=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
  butterflyMaterial.onBeforeCompile=shader=>{shader.uniforms.uButterflyTime=butterflyTime;shader.vertexShader=`uniform float uButterflyTime;attribute float aButterflyPhase;\n${shader.vertexShader}`.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y+=abs(position.x)*sin(uButterflyTime*13.0+aButterflyPhase)*.95;');};
  butterflyMaterial.customProgramCacheKey=()=> 'storybook-butterflies-v1';
  const butterflies=new THREE.InstancedMesh(butterflyGeometry,butterflyMaterial,6);butterflies.name='Fiðrildi við blómin';butterflies.frustumCulled=false;root.add(butterflies);
  const flutterPlaces=[[-7.2,10.5],[4.1,9.7],[-2,-14.5],[11,-14.7],[-1.5,-27.8],[10.7,-25.5]],dummy=new THREE.Object3D();
  function update(time,reduced){
    breeze.update(time,reduced);butterflyTime.value=reduced?0:time;butterflies.visible=!reduced;
    for(let i=0;i<6;i++){const [x,z]=flutterPlaces[i],phase=time*.32+i*2.1,dx=Math.cos(phase)*.65,dz=Math.sin(phase*1.7)*.42;dummy.position.set(x+dx,height(x,z)+.8+Math.sin(time*.85+i)*.2,z+dz);dummy.rotation.set(.12,Math.atan2(Math.sin(phase),-Math.cos(phase*1.7))+.7,Math.sin(time*.7+i)*.15);dummy.scale.setScalar(.65+(i%3)*.12);dummy.updateMatrix();butterflies.setMatrixAt(i,dummy.matrix);}butterflies.instanceMatrix.needsUpdate=true;
  }
  update(0,false);
  return{root,update,getDebug:()=>({plantedClumps:planted,triangles:zones.reduce((sum,zone)=>sum+zone.positions.length/9,0)+butterflyPos.length/9*6,drawCalls:2,butterflies:6}),dispose(){root.removeFromParent();geometries.forEach(geometry=>geometry.dispose());material.dispose();butterflyGeometry.dispose();butterflyMaterial.dispose();}};
}
