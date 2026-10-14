import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { FIRST_FOREST_LAYOUT } from './arrival-staging.js';
import { CANOPY_HUNT, WIND_HUNT, GROUND_HUNTS, shorelineZ, trailZ } from './hunt-layouts.js';

// Original discoveries belong to the forest, shore and ride route. Their world
// positions never turn into a row of screen-space pedestals on another device.
const AREAS = {
  stegosaurus: ['fossil', 'snail'], brachiosaurus: ['leaf', 'beetle'],
  trex: ['footprint', 'lizard'], spinosaurus: ['fish', 'frog'],
  parasaurolophus: ['reed', 'dragonfly'], pteranodon: ['windring', 'butterfly'],
};
const clamp = THREE.MathUtils.clamp;
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const CANOPY_LEAVES=CANOPY_HUNT.leaves;
const PLACES = {
 brachiosaurus:[[-2,-7],[0,-7],[2,-7],[4.8,-4.16]],
 trex:[[-4,7.8],[-.4,5.8],[3.4,3.8],[-4.9,2.8]],
 spinosaurus:[[-3.5,-5],[.6,-8.8],[4.3,-5.6],[-4.2,-.9]],
 parasaurolophus:[[-4,-1.2],[0,-2.6],[4,-.7],[2.7,-6]],
 pteranodon:[[-3,-5],[0,-5],[3,-5],[-2,-2.4]],
};

export function createWorldDiscoveries({ scene, groundHeight = () => 0, waterY = -.045, createHabitatTree = null, createHabitatAsset = null, onDiscovery = () => {} }) {
  const root = new THREE.Group(); root.name = 'Mosi discovery clearings'; scene.add(root);
  const materials = new Map(), geometries = new Set(), areaCache = new Map(), sceneryCache = new Map();
  let state = null, disposed = false, elapsed = 0, readyResolve = null, readyPromise = Promise.resolve({ completed: false, cancelled: true });
  let focus = null, focusResolve = null, lastContext = null, activeScenery = null;
  const screenPoint = new THREE.Vector3();
  const reference = new THREE.PerspectiveCamera();
  const sphere = own(new THREE.SphereGeometry(1, 18, 12));
  const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 12));
  function own(geometry) { geometries.add(geometry); return geometry; }
  function material(color, options = {}) {
    const key = color + JSON.stringify(options);
    if (!materials.has(key)) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: .77, metalness: 0, ...options });
      mat.userData.baseOpacity = options.opacity ?? 1; materials.set(key, mat);
    }
    return materials.get(key);
  }
  const M = {
    soil: material('#76614a'), edge: material('#d2b887'), stone: material('#787e6e'), fossil: material('#a69879'), sand: material('#8d7654'),
    green: material('#55955c'), light: material('#93bd6b'), darkGreen: material('#356747'), wood: material('#816145'), mud: material('#725846'),
    orange: material('#ec9e4f'), cream: material('#f9e6ad'), dark: material('#283e37'), white: material('#fff4d6'), blue: material('#61b6b9'),
    water: material('#529f9e', { roughness: .26, transparent: true, opacity: .76 }),
    wing: material('#bbdcd3', { side: THREE.DoubleSide, transparent: true, opacity: .68, roughness: .35 }),
    glow: material('#f5d582', { emissive: '#d49c35', emissiveIntensity: .3, roughness: .5 }),
    purple: material('#ab88c4'), shell: material('#bc805b'), red: material('#ce7950'),
    fern: material('#477448',{side:THREE.DoubleSide}),fernLight:material('#638d4e',{side:THREE.DoubleSide}),
    leaf:material('#658443',{side:THREE.DoubleSide,emissive:'#273d22',emissiveIntensity:.15}),leafSun:material('#839b59',{side:THREE.DoubleSide,emissive:'#30482b',emissiveIntensity:.12}),
    wetMud:material('#65533e',{roughness:.96}),print:material('#403c2e',{roughness:.93}),
    aquatic:material('#53785a',{side:THREE.DoubleSide,emissive:'#1c392d',emissiveIntensity:.08}),
    air:material('#62a99c',{transparent:true,opacity:.80,depthWrite:false,roughness:1,emissive:'#3b8079',emissiveIntensity:.18,side:THREE.DoubleSide}),
    airCore:material('#edfff1',{transparent:true,opacity:.72,depthWrite:false,roughness:1,emissive:'#dcffe7',emissiveIntensity:.2,side:THREE.DoubleSide}),
  };
  const shared=object=>object.userData.sharedHabitatTree||object.userData.sharedHabitatAsset;
  function habitatAsset(kind,height,variant=0){const object=createHabitatAsset?.({kind,height,variant});if(object)object.userData.sharedHabitatAsset=true;return object;}
  function group(parent, name, position = [0, 0, 0]) { const g = new THREE.Group(); g.name = name; g.position.set(...position); parent.add(g); return g; }
  function mesh(parent, geometry, mat, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) {
    const m = new THREE.Mesh(geometry, mat); m.position.set(...p); m.scale.set(...s); m.rotation.set(...r); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function oval(parent, mat, p, s, r) { return mesh(parent, sphere, mat, p, s, r); }
  function tube(parent, points, radius, mat, segments = 20) {
    return mesh(parent, own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 6, false)), mat);
  }
  function stick(parent, a, b, radius, mat) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), d = end.clone().sub(start);
    const m = mesh(parent, cylinder, mat, start.add(end).multiplyScalar(.5).toArray(), [radius, d.length(), radius]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
  }
  function leaf(parent, mat, p, size = 1, angle = 0) {
    const shape = new THREE.Shape(); shape.moveTo(0, -.65); shape.bezierCurveTo(-.68, -.2, -.57, .5, 0, 1); shape.bezierCurveTo(.56, .51, .66, -.2, 0, -.65);
    const g = group(parent, 'Curved leaf', p); g.rotation.set(-.5, 0, angle); g.scale.setScalar(size);
    mesh(g, own(new THREE.ExtrudeGeometry(shape, { depth: .028, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .035, bevelThickness: .025, curveSegments: 8 })), mat);
    tube(g, [[0, -.57, .07], [.015, .15, .095], [0, .91, .07]], .018, M.light, 10);
    return g;
  }
  function eyes(parent, p, span, size = .105) {
    for (const side of [-1, 1]) {
      oval(parent, M.white, [p[0] + side * span, p[1], p[2]], [size, size * 1.06, size * .7]);
      oval(parent, M.dark, [p[0] + side * span, p[1] - .006, p[2] + size * .59], [size * .46, size * .6, size * .28]);
      oval(parent, M.white, [p[0] + side * span - size * .12, p[1] + size * .25, p[2] + size * .82], [size * .17, size * .2, size * .10]);
    }
  }
  function blade(parent,points,width,mat,axis=[1,0,0]){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),vertices=[],uv=[],indices=[],count=12;
    for(let i=0;i<=count;i++){
      const t=i/count,p=curve.getPoint(t),side=new THREE.Vector3(...axis);
      const w=Math.sin(t*Math.PI)**.7*width;
      vertices.push(...p.clone().addScaledVector(side,-w).toArray(),...p.clone().addScaledVector(side,w).toArray());uv.push(0,t,1,t);
      if(i<count){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const geo=own(new THREE.BufferGeometry());geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();return mesh(parent,geo,mat);
  }
  function naturalLeaf(parent,position,length=.7,angle=0,mat=M.leaf){
    const g=group(parent,'Curved living leaf',position);g.rotation.set(-.25,angle,.1*Math.sin(angle*2));
    const points=[[0,0,0],[.015,length*.35,.055],[.025,length*.78,.02],[0,length,-.10]];
    blade(g,points,length*.24,mat);tube(g,points,.008,M.darkGreen,12);return g;
  }
  function reedPlant(parent,x,y,z,h,seed=0,flower=true){
    const plant=group(parent,'Shore reed',[x,y,z]),bend=Math.sin(seed*2.7)*.13;
    tube(plant,[[0,0,0],[bend*.25,h*.4,.025],[bend*.7,h*.77,.04],[bend,h,.05]],.017,M.darkGreen,12);
    if(flower)oval(plant,M.wood,[bend,h-.08,.05],[.052,h*.12,.045],[0,0,-bend*.3]);
    for(let j=0;j<3;j++){const side=j%2?1:-1,yy=h*(.14+j*.17);blade(plant,[[0,yy,0],[side*.08,yy+h*.27,.03],[side*(.25+j*.04),yy+h*.34,.1],[side*.40,yy+h*.23,.16]],.024,M.leaf);}
    return plant;
  }
  function bankZ(anchor,x){
    return shorelineZ(anchor+x,groundHeight,waterY);
  }
  function batch(parent) {
    if(shared(parent))return;
    for (const child of [...parent.children]) if (child.isGroup&&!shared(child)) batch(child);
    const batches = new Map();
    for (const child of [...parent.children]) if (child.isMesh && !child.userData.keep && !Array.isArray(child.material)) {
      const key = child.material.uuid; if (!batches.has(key)) batches.set(key, []); batches.get(key).push(child);
    }
    for (const children of batches.values()) if (children.length > 1) {
      const copies = children.map(child => {
        child.updateMatrix(); const copy = child.geometry.clone().applyMatrix4(child.matrix);
        if (!copy.index) return copy;
        const flat = copy.toNonIndexed(); copy.dispose(); return flat;
      });
      const merged = mergeGeometries(copies); copies.forEach(g => g.dispose());
      if (!merged) continue;
      mesh(parent, own(merged), children[0].material).name = 'Batched discovery detail'; children.forEach(child => parent.remove(child));
    }
  }
  function batchStatic(parent) {
    // Habitat foliage has no independent animation. Merge across its nested
    // leaf groups, retaining only a few material batches on mobile GPUs.
    parent.updateWorldMatrix(true,true);
    const inverse=parent.matrixWorld.clone().invert(),batches=new Map(),preserved=parent.children.filter(shared);
    parent.traverse(child=>{
      if(!child.isMesh||Array.isArray(child.material))return;
      for(let node=child;node&&node!==parent;node=node.parent)if(shared(node))return;
      const copy=child.geometry.clone().applyMatrix4(inverse.clone().multiply(child.matrixWorld));
      const flat=copy.index?copy.toNonIndexed():copy;if(flat!==copy)copy.dispose();
      if(!batches.has(child.material))batches.set(child.material,[]);batches.get(child.material).push(flat);
    });
    parent.clear();preserved.forEach(child=>parent.add(child));
    for(const[mat,copies]of batches){const merged=mergeGeometries(copies);copies.forEach(g=>g.dispose());if(merged)mesh(parent,own(merged),mat).name='Batched habitat detail';}
  }
  function roughStone(seed=0){
    const points=[],indices=[],count=9;
    for(let ring=0;ring<3;ring++)for(let i=0;i<count;i++){
      const angle=i/count*TAU+seed*.19,irregular=.86+Math.sin(i*3.7+seed*2.1)*.12+Math.cos(i*1.8+seed)*.08;
      const radius=irregular*[.86,1,.76][ring];points.push(Math.cos(angle)*radius,[-.06,.17,.43][ring],Math.sin(angle)*radius*.79);
    }
    points.push(0,.43,0);
    for(let ring=0;ring<2;ring++)for(let i=0;i<count;i++){const a=ring*count+i,b=ring*count+(i+1)%count,c=a+count,d=b+count;indices.push(a,c,b,b,c,d);}
    for(let i=0;i<count;i++)indices.push(27,18+(i+1)%count,18+i);
    const g=own(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(points.length/3*2),2));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  function buildTarget(kind, index) {
    const g = new THREE.Group(); g.name = `${kind} ${index + 1}`; const parts = {};
    if (kind === 'fossil') {
      // Sample each engraved line against the same real rocks as the forest.
      const height=[.54,.68,.48][index],stone=habitatAsset('rock',height,index);
      if(stone){stone.rotation.y=[.32,-.6,1.2][index];g.add(stone);}
      else mesh(g,roughStone(index),M.stone,[0,0,0],[1,height/.43,.75]);
      g.updateMatrixWorld(true);
      const surfaces=[];g.traverse(o=>{if(o.isMesh)surfaces.push(o);});
      const ray=new THREE.Raycaster(),sample=(x,z)=>{
        ray.set(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0));
        const hit=ray.intersectObjects(surfaces,false)[0];return [x,hit?hit.point.y+.007:height+.007,z];
      };
      const engrave=(points,radius,segments)=>{const line=tube(g,points,radius,M.fossil,segments),positions=line.geometry.attributes.position;for(let j=0;j<positions.count;j++)positions.setY(j,sample(positions.getX(j),positions.getZ(j))[1]);positions.needsUpdate=true;line.geometry.computeVertexNormals();return line;};
      const radius=[.22,.27,.20][index],spiral=[];
      for(let i=0;i<=76;i++){const a=i/76*TAU*2.25,r=.013+i/76*radius;spiral.push(sample(Math.cos(a)*r,Math.sin(a)*r*.83));}
      const impression=engrave(spiral,.010,86);impression.name='Fossil impression follows stone';impression.userData.surfaceSamples=spiral;
      for(let i=0;i<10;i++){const a=i/10*TAU; engrave([sample(Math.cos(a)*radius*.77,Math.sin(a)*radius*.64),sample(Math.cos(a+.05)*radius,Math.sin(a+.05)*radius*.83)],.006,3);}
      parts.dust=group(g,'Sand in the fossil grooves');const grain=own(new THREE.IcosahedronGeometry(1,0));
      for(let i=0;i<8;i++){const a=i*2.4,r=radius*(.55+(i%3)*.17);mesh(parts.dust,grain,M.sand,sample(Math.cos(a)*r,Math.sin(a)*r*.8),[.014,.008,.025]);}
      parts.surfaceY=sample(0,0)[1];
    } else if (kind === 'leaf') {
      parts.leaves=group(g,'One living leaf among its neighbours');
      const targetLeaf=naturalLeaf(parts.leaves,[0,0,0],.86+(index===1?.08:0),[-.25,.3,-.5][index],M.leafSun);targetLeaf.rotation.z=[-.34,.12,.40][index];
      // This farther, shaded left branch carries a broader leaf variety. Its
      // face remains legible when viewed across the canopy, without a giant icon.
      if(index===1){targetLeaf.scale.x=1.55;targetLeaf.rotation.y=-.08;}
    } else if (kind === 'footprint') {
      // A dark concave centre and sloping earth rim, not a raised token.
      const outline=[[-.18,-.50],[-.34,-.30],[-.33,-.04],[-.63,.31],[-.57,.50],[-.38,.38],[-.17,.19],[-.12,.65],[0,.81],[.12,.65],[.17,.19],[.38,.38],[.57,.50],[.63,.31],[.33,-.04],[.34,-.30],[.18,-.50]];
      const vertices=[0,.012,0],indices=[],n=outline.length;
      outline.forEach(([x,z])=>vertices.push(x*.89,.016,z*.89));outline.forEach(([x,z])=>vertices.push(x,.040,z));
      for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(0,1+i,1+j,1+i,1+n+i,1+j,1+j,1+n+i,1+n+j);}
      const geo=own(new THREE.BufferGeometry());geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));geo.setIndex(indices);geo.computeVertexNormals();mesh(g,geo,M.print);
      parts.toes=group(g,'Three toe glimmers');for(const[x,z]of[[-.4,.31],[0,.66],[.4,.31]])oval(parts.toes,M.glow,[x,.030,z],[.018,.006,.025]);
    } else if (kind === 'fish') {
      parts.fish=group(g,'Fish beneath the lake surface');
      const skin=material(['#b29a55','#6d9990','#ad8059'][index]),fin=material(['#8b8151','#5c8985','#927150'][index],{side:THREE.DoubleSide});
      oval(parts.fish,skin,[0,0,0],[.58,.20,.17]);oval(parts.fish,material('#adbca0'),[.14,-.08,0],[.38,.07,.145]);
      parts.tail=group(parts.fish,'Swimming tail',[-.49,0,0]);const tail=new THREE.Shape();tail.moveTo(0,0);tail.lineTo(-.36,.25);tail.quadraticCurveTo(-.22,0,-.36,-.25);tail.closePath();mesh(parts.tail,own(new THREE.ShapeGeometry(tail)),fin);
      blade(parts.fish,[[-.10,.15,0],[-.16,.31,0],[.16,.20,0]],.08,fin);
      for(const side of[-1,1]){
        oval(parts.fish,M.dark,[.34,.05,side*.143],[.04,.041,.019]);oval(parts.fish,M.cream,[.346,.064,side*.159],[.012,.012,.006]);
        const flipper=group(parts.fish,'Pectoral fin',[.16,-.07,side*.13]);flipper.rotation.set(side*.3,side*.7,-.4);blade(flipper,[[0,0,0],[-.08,-.07,side*.08],[-.18,-.12,side*.10]],.052,fin);
        tube(parts.fish,[[.25,.12,side*.12],[.19,.04,side*.16],[.21,-.08,side*.14]],.009,fin,8);
      }
      parts.splash=group(g,'Tiny submerged bubbles');for(let i=0;i<4;i++)oval(parts.splash,M.wing,[.2+Math.cos(i*2.4)*.3,.28+i*.06,Math.sin(i*2.4)*.25],[.018,.018,.018]);
    } else if (kind === 'reed') {
      parts.reeds=group(g,'A reed growing in the bank thicket');reedPlant(parts.reeds,0,0,0,[1.27,1.55,1.38][index],index+.3,true);
      parts.note=group(g,'Visible echo',[.19,1.14,.04]);oval(parts.note,M.glow,[0,0,0],[.07,.045,.025],[0,0,.25]);stick(parts.note,[.05,0,0],[.05,.24,0],.015,M.glow);stick(parts.note,[.05,.24,0],[.18,.20,0],.016,M.glow);
    } else {
      parts.ring=group(g,'Soft moving air along the flight route');
      // Air has no solid closed rim: wisps narrow at both ends.
      for(let i=0;i<3;i++){
        const trail=group(parts.ring,'A translucent breeze strand',[0,(i-1)*.30,(i-1)*.16]);
        const pts=[[-.91,-.08,0],[-.45,.04,.12],[.08,.05,.18],[.54,.15,.10],[.72,.32,.02],[.51,.40,-.04]];
        const edge=blade(trail,pts,.047+(i===1?.022:0),M.air,[0,1,0]);edge.renderOrder=2;edge.castShadow=false;
        const core=blade(trail,pts,.012+(i===1?.006:0),M.airCore,[0,1,0]);core.renderOrder=3;core.castShadow=false;trail.rotation.z=(i-1)*.13;
      }
      for(let i=0;i<5;i++)oval(parts.ring,M.air,[-.8+i*.34,Math.sin(i*1.8)*.3,Math.cos(i)*.15],[.012,.012,.012]);
    }
    batch(g); return { group:g, parts, canonical:2.1, anchorY: kind==='reed'? .88 : kind==='windring'||kind==='fish'?0:kind==='footprint'?.03:kind==='leaf'?.38:(parts.surfaceY??.36) };
  }
  function buildAnimal(kind) {
    const g = new THREE.Group(),body = group(g, `Little ${kind}`),parts={body};
    if(kind==='snail'){
      oval(body,M.light,[0,.19,.12],[.56,.16,.31]);oval(body,M.shell,[-.12,.51,-.04],[.43,.40,.27]);
      const spiral=[];for(let i=0;i<=55;i++){const a=i/55*TAU*2,r=.02+i/55*.29;spiral.push([-.12+Math.cos(a)*r,.51+Math.sin(a)*r,.235]);}tube(body,spiral,.027,M.cream,55);
      for(const side of[-1,1])stick(body,[.30+side*.12,.27,.23],[.30+side*.16,.65,.25],.024,M.light);
      eyes(body,[.30,.65,.27],.16,.06);
    }else if(kind==='beetle'){
      oval(body,M.dark,[0,.29,0],[.36,.24,.45]);oval(body,M.red,[-.15,.38,-.06],[.20,.22,.34]);oval(body,M.orange,[.15,.38,-.06],[.20,.22,.34]);
      oval(body,M.dark,[0,.29,.35],[.25,.19,.21]);eyes(body,[0,.35,.49],.11,.075);
      for(const side of[-1,1])for(let i=0;i<3;i++)tube(body,[[side*.22,.25,(i-1)*.26],[side*.46,.19,(i-1)*.32],[side*.58,.07,(i-1)*.38]],.025,M.dark,8);
      for(const side of[-1,1])tube(body,[[side*.13,.4,.45],[side*.20,.53,.5],[side*.27,.55,.55]],.021,M.dark,8);
    }else if(kind==='lizard'){
      oval(body,M.green,[0,.22,0],[.23,.18,.45]);oval(body,M.light,[0,.24,.37],[.29,.20,.28]);eyes(body,[0,.33,.53],.16,.085);
      tube(body,[[0,.21,-.28],[.15,.20,-.58],[.42,.15,-.75],[.61,.12,-.78]],.09,M.green,24);
      for(const side of[-1,1])for(const z of[-.24,.22]){tube(body,[[side*.13,.22,z],[side*.35,.12,z-.06],[side*.43,.05,z+.08]],.045,M.green,10);for(let toe=0;toe<3;toe++)stick(body,[side*.40,.05,z+.07],[side*(.44+toe*.045),.04,z+.13+(toe-1)*.06],.016,M.light);}
    }else if(kind==='frog'){
      oval(body,M.green,[0,.26,0],[.42,.31,.36]);oval(body,M.cream,[0,.21,.27],[.28,.18,.12]);
      for(const side of[-1,1]){oval(body,M.light,[side*.25,.51,.17],[.16,.15,.15]);oval(body,M.green,[side*.38,.15,-.12],[.23,.15,.25]);stick(body,[side*.22,.22,.22],[side*.35,.04,.41],.055,M.green);for(let toe=0;toe<3;toe++)oval(body,M.light,[side*(.27+toe*.07),.035,.44+toe%2*.05],[.065,.025,.055]);}
      eyes(body,[0,.52,.28],.25,.095);tube(body,[[-.19,.32,.34],[0,.27,.38],[.19,.32,.34]],.018,M.dark,12);
    }else if(kind==='dragonfly'){
      oval(body,M.blue,[0,.33,0],[.075,.08,.48]);oval(body,M.blue,[0,.35,.44],[.16,.13,.14]);eyes(body,[0,.37,.54],.10,.075);
      parts.wings=[];for(const side of[-1,1]){const wing=group(body,'Transparent dragonfly wings',[0,.36,.08]);for(const z of[-.18,.12]){oval(wing,M.wing,[side*.42,0,z],[.48,.018,.14],[0,side*.18,0]);stick(wing,[0,0,z],[side*.80,0,z],.010,M.cream);}parts.wings.push(wing);}
      for(let i=0;i<5;i++)oval(body,M.dark,[0,.33,-.1-i*.085],[.076,.025,.025]);
      for(const side of[-1,1])for(let i=0;i<3;i++)tube(body,[[side*.04,.29,.14+i*.07],[side*.16,.20,.10+i*.08],[side*.21,.16,.15+i*.09]],.012,M.dark,6);
    }else{
      oval(body,M.dark,[0,.41,0],[.065,.23,.06]);eyes(body,[0,.64,.05],.06,.045);parts.wings=[];
      for(const side of[-1,1]){const wing=group(body,'Butterfly wing',[0,.40,0]);oval(wing,side<0?M.orange:M.blue,[side*.28,.17,0],[.30,.29,.035],[0,0,-side*.35]);oval(wing,M.orange,[side*.22,-.15,.005],[.23,.20,.035],[0,0,side*.3]);oval(wing,M.cream,[side*.33,.20,.036],[.10,.13,.014]);oval(wing,M.dark,[side*.23,-.16,.041],[.075,.075,.012]);parts.wings.push(wing);}
      for(const side of[-1,1])tube(body,[[side*.02,.59,0],[side*.07,.77,0],[side*.13,.8,0]],.014,M.dark,8);
      for(const side of[-1,1])for(let i=0;i<3;i++)tube(body,[[side*.035,.35+i*.065,.045],[side*.12,.29+i*.065,.10],[side*.16,.24+i*.065,.12]],.011,M.dark,6);
    }
    // Keep its shell/face visible beside the cover: a small thing to notice,
    // never an invisible target behind an opaque leaf.
    parts.cover=group(g,'A leaf to peek around',[-.40,0,.23]);leaf(parts.cover,M.green,[0,.1,0],.40,-.8);
    batch(g);return{group:g,parts,canonical:1.45,anchorY:.43};
  }
  function makeItem(id,kind,secret,index){
    const built=secret?buildAnimal(kind):buildTarget(kind,index);root.add(built.group);
    const hitMaterial=new THREE.MeshBasicMaterial({visible:false});materials.set(`hit-${id}`,hitMaterial);
    const hit=new THREE.Mesh(own(new THREE.SphereGeometry(1,10,8)),hitMaterial);
    hit.userData.discovery=id;built.group.add(hit);hit.position.y=built.anchorY;hit.scale.setScalar(secret?.6:1.15);
    const ringMat=new THREE.MeshBasicMaterial({color:secret?'#fff4bd':'#ffe4a1',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});materials.set(`glint-${id}`,ringMat);ringMat.userData.baseOpacity=0;
    const sparkle=new THREE.Shape();for(let i=0;i<8;i++){const a=i*TAU/8,r=i%2?.025:.12;i?sparkle.lineTo(Math.cos(a)*r,Math.sin(a)*r):sparkle.moveTo(Math.cos(a)*r,Math.sin(a)*r);}sparkle.closePath();
    const ring=mesh(built.group,own(new THREE.ShapeGeometry(sparkle)),ringMat,[0,built.anchorY+.32,.02]);ring.castShadow=false;
    return{id,kind,secret,index,...built,hit,ring,found:false,baseScale:1,pulseAt:-100,angle:index*.19,home:new THREE.Vector3(),screen:{x:0,y:0},radius:secret?30:38};
  }
  function makeScenery(species,anchor){
    const g=new THREE.Group();g.name='Roots, plants and shore habitat';g.position.x=anchor;
    const y=(x,z)=>groundHeight(anchor+x,z);
    function rock(x,z,size=.5,variant=0,buried=.06){
      const asset=habitatAsset('rock',size,variant);
      if(asset){asset.position.set(x,y(x,z)-buried,z);asset.rotation.y=variant*1.17;g.add(asset);return asset;}
      return mesh(g,roughStone(variant),M.stone,[x,y(x,z)-buried,z],[size*1.65,size/.43,size*1.2],[0,variant*1.17,0]);
    }
    function grass(x,z,size=.45,variant=0){
      const asset=habitatAsset('grass',size,variant);if(asset){asset.position.set(x,y(x,z),z);asset.rotation.y=variant*2.4;g.add(asset);}
      else for(let i=0;i<5;i++)blade(g,[[x,y(x,z),z],[x+(i-2)*.07,y(x,z)+size*.75,z+.07],[x+(i-2)*.12,y(x,z)+size,z+.16]],.018,M.leaf);
    }
    function patch(x,z,rx,rz,seed){
      // Translucent damp soil overlays the textured ground. The outer two rings
      // dissolve completely instead of leaving a hard polygon boundary.
      const vertices=[x,y(x,z)+.012,z],indices=[],colors=[1,1,1,.42],n=40,alphas=[.40,.30,.10,0],radii=[.38,.68,.86,1.1];
      for(let ring=0;ring<4;ring++)for(let i=0;i<n;i++){
        const a=i/n*TAU,r=radii[ring]*(1+Math.sin(i*.9+seed)*.08+Math.sin(i*2.1+seed)*.06),xx=x+Math.cos(a)*rx*r,zz=z+Math.sin(a)*rz*r;
        vertices.push(xx,y(xx,zz)+.012,zz);colors.push(1,1,1,alphas[ring]);
      }
      for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(0,1+j,1+i);for(let ring=0;ring<3;ring++){const a=1+ring*n+i,b=1+ring*n+j;indices.push(a,b,a+n,b,b+n,a+n);}}
      const geo=own(new THREE.BufferGeometry());geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:vertices.length},(_,i)=>i%3===1?1:0),3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));geo.setIndex(indices);
      const mat=material('#645841',{transparent:true,opacity:1,depthWrite:false,vertexColors:true,polygonOffset:true,polygonOffsetFactor:-1});const m=mesh(g,geo,mat);m.castShadow=false;
    }
    function fern(x,z,size=.7){
      const asset=habitatAsset('fern',size);if(asset){asset.position.set(x,y(x,z),z);asset.rotation.y=x*1.37+z;g.add(asset);return;}
      const fern=group(g,'Feathered fern growing from the soil',[x,y(x,z),z]);
      for(let i=0;i<7;i++){
        const a=i*TAU/7,l=size*(.8+i%3*.13),direction=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),side=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
        const point=t=>direction.clone().multiplyScalar(l*t).add(new THREE.Vector3(0,.03+Math.sin(t*Math.PI*.86)*size*.65,0));
        tube(fern,[point(0),point(.3),point(.65),point(1)].map(p=>p.toArray()),.009,M.darkGreen,10);
        const vertices=[];
        for(let j=1;j<7;j++)for(const sign of[-1,1]){
          const t=j/7,base=point(t),tip=base.clone().addScaledVector(side,sign*l*.25*(1-t*.7)).addScaledVector(direction,l*.12),end=point(Math.min(1,t+.13));
          vertices.push(...base.toArray(),...tip.toArray(),...end.toArray());
        }
        const geo=own(new THREE.BufferGeometry());geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));geo.computeVertexNormals();mesh(fern,geo,i%2?M.fern:M.fernLight);
      }
    }
    function rootline(points,radius=.11){
      const p=points.map(([x,z,h=0])=>new THREE.Vector3(x,y(x,z)+.018+h,z));
      for(let i=0;i<p.length-1;i++){
        const delta=p[i+1].clone().sub(p[i]),start=radius*(1-i/p.length*.8),end=radius*(1-(i+1)/p.length*.8);
        const root=mesh(g,own(new THREE.CylinderGeometry(end,start,delta.length(),7)),M.wood,p[i].clone().add(p[i+1]).multiplyScalar(.5).toArray());root.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
      }
    }
    if(species==='stegosaurus'){
      // Separate woodland pockets are discovered by looking around. Their
      // scenery stays north of the trail and south of the animal's entrance.
      // There is no long prop row or stump beside Mosi's riding position.
      FIRST_FOREST_LAYOUT.fossils.forEach(([worldX,z],index)=>{
        const x=worldX-anchor;
        const rubble=index===0?[[-.9,-.1,.30],[.75,-.45,.33],[1.15,.35,.20],[-.55,.70,.19]]
          :index===1?[[-.85,.42,.37],[.58,-.55,.29],[1.14,.1,.42],[-1.24,-.35,.18],[.42,.77,.15]]
          :[[-.92,-.18,.23],[.65,.40,.40],[1.28,-.15,.27],[-.6,.75,.32]];
        rubble.forEach(([dx,dz,size],j)=>rock(x+dx,Math.max(-7.65,z+dz),size,index*5+j));
        const vegetation=index===0?[[-.82,.14,.83],[.66,-.40,.72]]
          :index===1?[[-1.02,-.45,1.1],[.50,.55,.85],[1.35,.36,.67]]
          :[[.80,-.25,1.04],[-.90,.4,.85]];
        vegetation.forEach(([dx,dz,size])=>fern(x+dx,Math.max(-7.6,z+dz),size));
        for(let j=0;j<5;j++){const a=j*2.4+index*.7;grass(x+Math.cos(a)*1.65,Math.max(-7.55,z+Math.sin(a)*1.08),.27+(j%3)*.09,j+index*5);}
      });
      // The secret snail rests on a low rock in the left pocket, far from the
      // player and the Stegosaurus body/swept path. No decorative log can clip Mosi.
      const [snailX,snailZ]=FIRST_FOREST_LAYOUT.snail;
      rock(snailX-anchor,snailZ,.33,3,.06);fern(snailX-anchor-.68,snailZ-.2,.6);
    }else if(species==='brachiosaurus'){
      // A young tree supports the ground perch below the raised search view;
      // its crown must not mask the separate beetle branch in the canopy.
      const tree=createHabitatTree?.({height:4.6});
      if(tree){tree.userData.sharedHabitatTree=true;tree.position.set(4.8,y(4.8,-4.7),-4.7);g.add(tree);}
      else{
        mesh(g,own(new THREE.CylinderGeometry(.09,.36,4.6,9,5)),M.wood,[4.8,y(4.8,-4.7)+2.3,-4.7]);
        for(let i=0;i<6;i++){const a=i*2.4;mesh(g,own(new THREE.IcosahedronGeometry(1,1)),i%2?M.green:M.darkGreen,[4.8+Math.cos(a)*.72,3.5+i%3*.35,-4.7+Math.sin(a)*.55],[.95,.7,.85]);}
      }
      // The small ground fallback also has a real bark perch, rather than a
      // beetle floating in front of a trunk. Its six feet rest on this limb.
      const perch=new THREE.Vector3(4.8,y(4.8,-4.16)+1.0,-4.16),socket=new THREE.Vector3(4.8,perch.y,-4.7);
      if(tree){g.updateWorldMatrix(true,true);const inverse=g.matrixWorld.clone().invert(),wanted=socket.clone();let nearest=Infinity;tree.traverse(child=>{if(!child.isMesh||!/bark/i.test(child.material?.name||''))return;const matrix=inverse.clone().multiply(child.matrixWorld),positions=child.geometry.attributes.position;for(let i=0;i<positions.count;i++){const point=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix),d=point.distanceToSquared(wanted);if(d<nearest){nearest=d;socket.copy(point);}}});}
      tube(g,[socket.toArray(),socket.clone().lerp(perch,.5).add(new THREE.Vector3(0,-.07,0)).toArray(),perch.toArray()],.06,M.wood,14);
      naturalLeaf(g,perch.clone().add(new THREE.Vector3(-.17,-.04,.04)).toArray(),.35,-.6,M.leaf);
      for(const side of[-1,1])rootline([[4.8,-4.7],[4.8+side,-4.3],[4.8+side*1.7,-4.1]],.13);
      fern(3.7,-4.7);fern(6,-5.3,.6);
    }else if(species==='trex'){
      // One winding strip of damp trail continues through three separated
      // looking directions. The marks lie in this soil, not on display slabs.
      for(let i=0;i<20;i++){const x=22.8+i*1.47,z=trailZ(x);patch(x-anchor,z,1.18,1.0,i);}
      for(let i=0;i<25;i++){const x=23+i*1.16,z=trailZ(x)+(i%2?1.75:-1.65);grass(x-anchor,z,.20+(i%4)*.055,i);if(i%5===0)rock(x-anchor,z,.14+(i%3)*.04,i);}
      const[lx,lz]=GROUND_HUNTS.trex.secret,x=lx-anchor;
      mesh(g,own(new THREE.CylinderGeometry(.24,.48,.62,9,3)),M.wood,[x-.20,y(x-.20,lz-.62)+.24,lz-.62],[1,1,1],[.12,0,-.14]);
      rootline([[x-.2,lz-.6,.12],[x,lz,.06],[x+.7,lz+.3]],.14);
      fern(x-.85,lz-.45,.82);fern(x+.62,lz-.22,.63);grass(x+.42,lz+.58,.25,4);
    }else if(species==='spinosaurus'){
      // Each fish patrols a different shallow-water pocket with its own bed
      // stones and ribbons, connected by the real unbroken lake surface.
      GROUND_HUNTS.spinosaurus.points.forEach(([worldX,z],pocket)=>{
        const x=worldX-anchor;
        for(let i=0;i<5;i++){const a=i*2.4+pocket*.5;rock(x+Math.cos(a)*(1.1+i%2*.6),z+Math.sin(a)*1.3,.16+(i%3)*.09,pocket*5+i,.06);}
        for(let i=0;i<8;i++){
          const a=i*2.4+pocket*.7,xx=x+Math.cos(a)*(1.2+i%3*.42),zz=z+Math.sin(a)*(1.0+i%2*.5),base=y(xx,zz),h=.40+(i%4)*.14;
          for(let j=0;j<3;j++)blade(g,[[xx+j*.07,base,zz],[xx+j*.10+.1,base+h*.50,zz+.04],[xx+j*.12-.05,base+h*.9,zz+.15],[xx+j*.13-.15,base+h,zz+.23]],.044,M.aquatic);
        }
      });
      const[fx]=GROUND_HUNTS.spinosaurus.secret,x=fx-anchor,z=bankZ(anchor,x)+.26;
      rock(x,z,.23,3,.055);rock(x-.43,z-.06,.15,1);fern(x-.75,z+.12,.56);grass(x+.35,z+.25,.35,2);
    }else if(species==='parasaurolophus'){
      // Separate little inlets, not three stems along a single row. The normal
      // neighbouring reeds make each musical stem part of a bank thicket.
      GROUND_HUNTS.parasaurolophus.points.forEach(([worldX],pocket)=>{
        const center=worldX-anchor;
        for(let i=0;i<22;i++){
          const x=center+Math.sin(i*2.399+pocket)*(.45+(i%6)*.27),z=bankZ(anchor,x)+.12+(i%3)*.24;
          if(Math.abs(x-center)<.28)continue;
          reedPlant(g,x,y(x,z),z,.71+(i%7)*.095,i+pocket*7,i%3!==0);
        }
        for(let j=0;j<5;j++){const x=center+(j-2)*.72,z=bankZ(anchor,x)+.55;grass(x,z,.28+(j%3)*.08,j+pocket);}
        rock(center-1.5,bankZ(anchor,center-1.5)+.16,.19,pocket);rock(center+1.25,bankZ(anchor,center+1.25)+.18,.23,pocket+1);
      });
      const[dx]=GROUND_HUNTS.parasaurolophus.secret,x=dx-anchor,z=bankZ(anchor,x)+.26;
      reedPlant(g,x,y(x,z),z,1.06,8,true);
    }else{
      const[bx,bz]=GROUND_HUNTS.pteranodon.secret,x=bx-anchor;
      const shrub=habitatAsset('bush',1.2);if(shrub){shrub.position.set(x+.7,y(x+.7,bz-.7),bz-.7);g.add(shrub);}
      fern(x-.8,bz-.4,.8);grass(x+.45,bz+.35,.3,2);rock(x-.45,bz-.1,.22,1);
      const perch=new THREE.Vector3(x,y(x,bz)+.78,bz);
      tube(g,[[x+.55,y(x+.55,bz-.3),bz-.3],[x+.3,perch.y-.2,bz-.1],perch.toArray()],.035,M.wood,16);
      for(let i=0;i<4;i++){const point=perch.clone().add(new THREE.Vector3((i-1.5)*.17,-.04+(i%2)*.05,i*.07));const blade=naturalLeaf(g,point.toArray(),.45+(i%2)*.10,i*.6,M.leaf);blade.rotation.x=-1.0;}
    }
    batchStatic(g);return g;
  }
  function placeGround(anchor){
    for(const item of state.items){
      const forestPosition=state.species==='stegosaurus'?(item.secret?FIRST_FOREST_LAYOUT.snail:FIRST_FOREST_LAYOUT.fossils[item.index]):null;
      const hunt=GROUND_HUNTS[state.species],huntPosition=item.secret?hunt?.secret:hunt?.points?.[item.index],fixed=forestPosition||huntPosition;
      const[x,fixedZ]=fixed?[fixed[0]-anchor,fixed[1]]:PLACES[state.species][item.index];
      const shoreCreature=item.kind==='frog'||item.kind==='dragonfly';
      const z=item.kind==='reed'?bankZ(anchor,x)+.10:shoreCreature?bankZ(anchor,x)+.26:fixedZ,height=groundHeight(anchor+x,z);
      const smallScales={snail:.62,beetle:.42,lizard:.58,frog:.62,dragonfly:.55,butterfly:.55};
      item.baseScale=item.secret?smallScales[item.kind]:item.kind==='footprint'?.9:item.kind==='fish'?.95:1;
      item.home.set(anchor+x,item.kind==='fish'?waterY-.62:height+.015,z);
      if(item.kind==='snail')item.home.y+=.26;
      if(item.kind==='beetle')item.home.y+=1.02;
      if(item.kind==='lizard')item.home.y+=.09;
      if(item.kind==='frog')item.home.y+=.18;
      if(item.kind==='dragonfly')item.home.y=Math.max(waterY,height)+1.03;
      if(item.kind==='butterfly')item.home.y+=.78;
      item.groundHome=item.home.clone();item.groundScale=item.baseScale;
      item.group.position.copy(item.home);item.group.rotation.set(0,item.kind==='footprint'?-.9+item.index*.14:item.angle,0);item.group.scale.setScalar(item.baseScale);
      if(item.kind==='frog'){
        const eye=GROUND_HUNTS.spinosaurus.camera;
        item.group.rotation.y=Math.atan2(eye[0]-item.home.x,eye[2]-item.home.z);
      }
    }
  }
  function settlePending(cancelled=true){if(readyResolve){readyResolve({completed:!cancelled,cancelled});readyResolve=null;}if(focusResolve){focusResolve({completed:!cancelled,cancelled});focusResolve=null;}}
  function clearActivity(){
    settlePending();focus=null;lastContext=null;
    if(state){for(const item of state.items)root.remove(item.group);state=null;}
    if(activeScenery)root.remove(activeScenery);activeScenery=null;
    root.visible=false;
  }
  function setActivity({species,foundTargets=[],secretFound=false}={}){
    if(disposed||!Object.hasOwn(AREAS,species))return Promise.resolve({completed:false,cancelled:true});
    if(!state||state.species!==species){
      clearActivity();const[kind,secret]=AREAS[species];
      if(!areaCache.has(species))areaCache.set(species,[...Array.from({length:3},(_,i)=>makeItem(`${kind}-${i+1}`,kind,false,i)),makeItem(secret,secret,true,3)]);
      const items=areaCache.get(species);for(const item of items){root.add(item.group);item.visible=false;item.pulseAt=-100;}
      state={species,kind,age:0,blend:0,items,anchor:null,canopyOrigin:null,flightEyeHeight:null};
      root.visible=true;readyPromise=new Promise(resolve=>{readyResolve=resolve;});
    }
    const found=new Set(foundTargets);for(const item of state.items)item.found=item.secret?Boolean(secretFound):found.has(item.id);
    return readyPromise;
  }
  function focusDiscovery(id){
    if(!state||disposed)return Promise.resolve({completed:false,cancelled:true});
    if(focusResolve)focusResolve({completed:false,cancelled:true});
    if(id!==null&&!state.items.some(item=>item.id===id))return Promise.resolve({completed:false,cancelled:true});
    focus={id,started:elapsed,duration:13};if(id){const item=state.items.find(item=>item.id===id);item.pulseAt=elapsed;}
    return new Promise(resolve=>{focusResolve=resolve;});
  }
  function layout(anchor,context){
    if(!state)return;
    if(state.anchor!==anchor){
      state.anchor=anchor;placeGround(anchor);
      if(activeScenery)root.remove(activeScenery);
      const key=state.species+'/'+anchor;
      if(!sceneryCache.has(key))sceneryCache.set(key,makeScenery(state.species,anchor));
      activeScenery=sceneryCache.get(key);root.add(activeScenery);
    }
    if(!context&&state.canopyOrigin){const beetle=state.items.find(item=>item.kind==='beetle');if(beetle){beetle.home.copy(beetle.groundHome);beetle.baseScale=beetle.groundScale;beetle.group.rotation.set(0,beetle.angle,0);}}
    if(context?.kind==='canopy'&&state.kind==='leaf'){
      if(!state.canopyOrigin&&(context.canopyAnchor||(context.interactive&&context.anchor))){
        state.canopyOrigin=(context.canopyAnchor||context.anchor).clone();state.canopyForward=context.forward.clone().normalize();state.canopyRight=context.right.clone().normalize();
        let branch=activeScenery.getObjectByName('Living branches in the canopy');
        if(!branch){
          branch=group(activeScenery,'Living branches in the canopy');
          // Each find belongs to a different living limb. The outer trees are
          // genuinely beside us and cannot be seen until the child turns.
          CANOPY_LEAVES.forEach((target,i)=>{
            const tip=new THREE.Vector3(-target.x,target.y,target.z);
            const treePosition=new THREE.Vector3(tip.x+(i===1?1.2:i===2?-1.1:-1.8),-state.canopyOrigin.y-.2,tip.z+3.5);
            const treeHeight=state.canopyOrigin.y+4.2+(i%2)*1.2;
            const canopyTree=createHabitatTree?.({height:treeHeight});
            let socket=new THREE.Vector3(treePosition.x,target.y-.85,treePosition.z);
            if(canopyTree){
              canopyTree.userData.sharedHabitatTree=true;canopyTree.position.copy(treePosition);branch.add(canopyTree);
              branch.updateWorldMatrix(true,true);const inverse=branch.matrixWorld.clone().invert(),wanted=socket.clone();let nearest=Infinity;
              canopyTree.traverse(child=>{
                if(!child.isMesh||!/bark/i.test(child.material?.name||''))return;
                const matrix=inverse.clone().multiply(child.matrixWorld),positions=child.geometry.attributes.position;
                for(let j=0;j<positions.count;j++){const point=new THREE.Vector3().fromBufferAttribute(positions,j).applyMatrix4(matrix),distance=point.distanceToSquared(wanted);if(distance<nearest){nearest=distance;socket.copy(point);}}
              });
            }else{
              mesh(branch,own(new THREE.CylinderGeometry(.13,.52,treeHeight,9,5)),M.wood,treePosition.clone().add(new THREE.Vector3(0,treeHeight/2,0)).toArray());
              for(let j=0;j<5;j++){const a=j*2.4;mesh(branch,own(new THREE.IcosahedronGeometry(1,1)),j%2?M.green:M.darkGreen,[treePosition.x+Math.cos(a)*1.2,2.7+j%2*.8,treePosition.z+Math.sin(a)*.9],[1.6,1.3,1.5]);}
            }
            const elbow=socket.clone().lerp(tip,.48).add(new THREE.Vector3((i-1)*.45,-.32,.12));
            tube(branch,[socket.toArray(),elbow.toArray(),tip.toArray()],.075,M.wood,22);
            const curve=new THREE.CatmullRomCurve3([socket,elbow,tip]);
            for(let j=0;j<11;j++){
              const t=.2+j*.063,point=curve.getPoint(t),side=j%2?1:-1;
              const twig=point.clone().add(new THREE.Vector3(side*(.23+j%3*.13),.12+j%3*.11,-.12));
              stick(branch,point.toArray(),twig.toArray(),.012,M.wood);
              const neighbour=naturalLeaf(branch,twig.toArray(),.32+(j%4)*.075,side*.3,j%4===1?M.leafSun:M.leaf);
              neighbour.rotation.z=side*(.35+j%3*.22);neighbour.rotation.x=-.3+(j%3)*.12;
            }
            if(i===1){
              const perch=new THREE.Vector3(-CANOPY_HUNT.beetle.x,CANOPY_HUNT.beetle.y-.07,CANOPY_HUNT.beetle.z);
              tube(branch,[socket.toArray(),socket.clone().lerp(perch,.52).add(new THREE.Vector3(0,-.2,0)).toArray(),perch.toArray()],.085,M.wood,20);
              for(let j=0;j<3;j++)naturalLeaf(branch,perch.clone().add(new THREE.Vector3(.3+j*.15,-.02,.25)).toArray(),.3+j*.045,.5,M.leaf);
            }
          });
          batchStatic(branch);
        }
        branch.position.copy(state.canopyOrigin).sub(activeScenery.position);
        // Right/up/back is a proper rotation basis; the local branch uses +Z
        // toward the leaves, so reverse local X rather than reflecting meshes.
        const up=new THREE.Vector3().crossVectors(state.canopyRight,state.canopyForward).normalize();
        branch.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(state.canopyRight.clone().negate(),up,state.canopyForward));
      }
      const origin=state.canopyOrigin||context.anchor,forward=state.canopyForward||context.forward,right=state.canopyRight||context.right;
      if(origin&&forward&&right)for(const item of state.items){
        const placement=item.secret?CANOPY_HUNT.beetle:CANOPY_LEAVES[item.index];item.home.copy(origin).addScaledVector(forward,placement.z).addScaledVector(right,placement.x);item.home.y+=placement.y;
        item.baseScale=placement.scale;item.group.position.copy(item.home);
        if(item.secret){item.group.rotation.set(0,Math.atan2(origin.x-item.home.x,origin.z-item.home.z),0);}
        else item.group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),origin.clone().sub(item.home).normalize());
      }
    }else if(context?.kind==='flight'&&state.kind==='windring'){
      if(state.flightEyeHeight===null&&context.interactive)state.flightEyeHeight=context.routeEyeHeight??4;
      for(const item of state.items.filter(item=>!item.secret)){
        const phase=WIND_HUNT.phases[item.index];let sample=context.sampleRoute?.(phase);
        if(!sample&&context.flightCenter){const angle=phase*TAU,r=context.routeRadius||15;sample={position:context.flightCenter.clone().add(new THREE.Vector3(Math.cos(angle)*r,0,Math.sin(angle)*r)),forward:new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle))};}
        if(sample){item.home.copy(sample.position).add(new THREE.Vector3(0,state.flightEyeHeight??context.routeEyeHeight??4,0));item.group.position.copy(item.home);item.group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),sample.forward.clone().normalize());item.baseScale=2.5;}
      }
    }
  }
  function getFocusTarget(){
    const item=state?.items.find(item=>item.id===focus?.id);if(!item)return null;
    return item.group.position.clone().add(new THREE.Vector3(0,item.anchorY*item.baseScale,0));
  }
  function cameraPlan(camera,viewport,anchor,context=null){
    if(!state)return null;lastContext=context;layout(anchor,context);
    if(context?.kind==='canopy'||context?.kind==='flight')return null;
    if(state.species==='stegosaurus'){
      const position=new THREE.Vector3(...FIRST_FOREST_LAYOUT.searchCamera),target=new THREE.Vector3(...FIRST_FOREST_LAYOUT.searchTarget),point=getFocusTarget();
      const shortLandscape=!viewport.portrait&&viewport.height<500;
      if(shortLandscape){
        // Side pockets are farther away, so their ground rises toward the HUD
        // when we turn. Lift only the lateral view's aim; the nearer starting
        // fossil keeps its existing position above the bottom controls.
        const direction=camera.getWorldDirection(new THREE.Vector3());
        const turn=Math.abs(Math.atan2(direction.x,-direction.z));
        target.y+=1.45*THREE.MathUtils.smoothstep(turn,.25,.85);
      }
      // Looking around reveals fixed objects. A hint turns the same safe camera
      // toward a pocket; it never slides the child through trees or auto-fits all finds.
      if(point){if(shortLandscape)point.y+=.35;const age=elapsed-focus.started,strength=ease(age/1.05)*(1-ease((age-12)/1));target.lerp(point,strength);}
      return{position,target,blend:ease(state.age/1.8),maxYaw:FIRST_FOREST_LAYOUT.maxYaw,maxPitch:FIRST_FOREST_LAYOUT.maxPitch};
    }
    const hunt=GROUND_HUNTS[state.species];
    if(!hunt)return null;
    const position=new THREE.Vector3(...hunt.camera),target=new THREE.Vector3(...hunt.target);
    if(state.species==='parasaurolophus')target.z=shorelineZ(hunt.target[0],groundHeight,waterY);
    const baseDirection=target.clone().sub(position),shortLandscape=!viewport.portrait&&viewport.height<500;
    const direction=camera.getWorldDirection(new THREE.Vector3());
    const turn=Math.abs(Math.atan2(direction.x*baseDirection.z-direction.z*baseDirection.x,direction.x*baseDirection.x+direction.z*baseDirection.z));
    if(state.kind==='fish'){
      // Side pools are farther away than the near pool. As the child turns,
      // follow the same water surface instead of staring steeply into the
      // foreground and pushing distant fish above a small phone's screen.
      target.y=position.y-(position.y-target.y)*Math.max(.2,Math.cos(turn));
    }else if(shortLandscape){
      target.y+=1.25*THREE.MathUtils.smoothstep(turn,.25,.85);
    }
    const point=getFocusTarget();
    if(point){if(shortLandscape)point.y+=.35;const age=elapsed-focus.started,strength=ease(age/1.05)*(1-ease((age-12)/1));target.lerp(point,strength);}
    return{position,target,blend:ease(state.age/1.8),maxYaw:hunt.maxYaw,maxPitch:hunt.maxPitch};
  }
  function update(time,dt,camera,viewport,context=lastContext){
    elapsed=time;if(!state||disposed)return;lastContext=context;layout(state.anchor??0,context);state.age+=dt;state.blend=ease(state.age/1.45);
    if(state.age>1.5&&readyResolve){readyResolve({completed:true,cancelled:false});readyResolve=null;}
    if(focus&&elapsed-focus.started>.8&&focusResolve){focusResolve({completed:true,cancelled:false});focusResolve=null;}
    if(focus&&elapsed-focus.started>focus.duration)focus=null;
    for(const item of state.items){
      const age=elapsed-item.pulseAt,burst=age>=0&&age<1.1?Math.sin(age/1.1*Math.PI):0,idle=Math.sin(elapsed*1.3+item.angle);
      const onRide=context?.kind==='canopy'||context?.kind==='flight',rideTarget=item.kind==='leaf'||item.kind==='windring';
      item.group.visible=onRide?(context.kind==='canopy'?Boolean(state.canopyOrigin):!item.secret):!rideTarget;
      item.group.position.copy(item.home);
      if(item.kind==='fish'){
        item.group.position.x+=Math.sin(elapsed*.24+item.index*2.1)*.72;
        item.group.position.z+=Math.cos(elapsed*.24+item.index*2.1)*.50;
        item.group.position.y+=Math.sin(elapsed*.5+item.index)*.055;
      }
      if(item.kind==='butterfly'){
        const flight=Math.min((elapsed%14)/8,1),flying=flight<1;
        if(flying){item.group.position.x+=Math.sin(flight*TAU)*.85;item.group.position.z+=(1-Math.cos(flight*TAU))*.28;item.group.position.y+=Math.sin(flight*Math.PI)*.95;}
      }
      item.group.scale.setScalar(item.baseScale*(1+burst*(item.secret?.06:.025)));
      const cycle=(elapsed+item.index*1.7)%6.8,glint=cycle<.7?Math.sin(cycle/.7*Math.PI):0;
      item.ring.material.opacity=state.blend*(focus?.id===item.id ? .8 : Math.max(burst*.65,item.found ? .12 : glint*.54));
      item.ring.scale.setScalar(1+burst*.25);item.ring.lookAt(camera.position);
      if(item.kind==='fish')item.ring.position.y=(waterY-item.group.position.y)/item.baseScale+.035;
      if(item.parts.dust){const amount=item.found?1:0;item.parts.dust.scale.setScalar(THREE.MathUtils.damp(item.parts.dust.scale.x,1-amount*.94,6,dt));}
      if(item.parts.leaves){item.parts.leaves.rotation.z=idle*.06+burst*.22;item.parts.leaves.scale.setScalar(item.found?1:.88);}
      if(item.parts.toes)item.parts.toes.visible=item.found||burst>0;
      if(item.parts.fish){const a=elapsed*.24+item.index*2.1;item.parts.fish.rotation.y=Math.atan2(Math.sin(a)*.50,Math.cos(a)*.72)-item.angle;item.parts.fish.rotation.z=Math.sin(elapsed*.6+item.index)*.025;}
      if(item.parts.tail)item.parts.tail.rotation.y=Math.sin(elapsed*5.5+item.index)*.32;
      if(item.parts.splash){item.parts.splash.visible=burst>.2;item.parts.splash.scale.setScalar(.7+burst*.6);}
      if(item.parts.reeds)item.parts.reeds.rotation.z=idle*.04+Math.sin(age*15)*burst*.13;
      if(item.parts.note){item.parts.note.visible=burst>.1;item.parts.note.position.y=1.14+burst*.3;}
      if(item.parts.ring){item.parts.ring.rotation.z=Math.sin(elapsed*.35+item.angle)*.05;item.parts.ring.position.y=idle*.045;}
      if(item.parts.body){item.parts.body.position.y=(item.kind==='frog'?burst*.30:Math.max(0,idle)*.025)+burst*.06;item.parts.body.rotation.y=idle*.08;}
      if(item.parts.cover)item.parts.cover.rotation.z=THREE.MathUtils.damp(item.parts.cover.rotation.z,item.found?-.95:-.06,5,dt);
      if(item.parts.wings)item.parts.wings.forEach((wing,i)=>{const rate=item.kind==='dragonfly'?22:elapsed%14<8?5.5:.65;wing.rotation.y=(i?1:-1)*(.15+Math.sin(elapsed*rate)*(item.kind==='dragonfly'?.20:.42));});
      item.group.updateMatrixWorld(true);screenPoint.set(0,item.anchorY,0).applyMatrix4(item.group.matrixWorld).project(camera);
      item.screen={x:(screenPoint.x+1)/2,y:(1-screenPoint.y)/2};item.radius=item.secret?30:item.kind==='windring'?50:item.kind==='leaf'&&!viewport.portrait&&viewport.height<500?28:40;
      const x=item.screen.x*viewport.width,y=item.screen.y*viewport.height;
      item.visible=item.group.visible&&(!onRide||Boolean(context.interactive))&&(item.kind!=='windring'||camera.position.distanceTo(item.group.position)<WIND_HUNT.maxInteractDistance)&&state.age>1.15&&screenPoint.z>-1&&screenPoint.z<1&&x>item.radius+3&&x<viewport.width-item.radius-3&&y>item.radius+3&&y<viewport.height-item.radius-3;
    }
    // Natural depth can project two objects together while looking around. Keep
    // their generous HTML targets from stealing each other's taps. A requested
    // hint and an undiscovered object take precedence over a collected one.
    const accepted=[];
    const candidates=state.items.filter(item=>item.visible).sort((a,b)=>Number(b.id===focus?.id)-Number(a.id===focus?.id)||Number(a.found)-Number(b.found)||a.index-b.index);
    for(const item of candidates){
      if(accepted.some(other=>Math.abs(other.screen.x-item.screen.x)*viewport.width<other.radius+item.radius+4&&Math.abs(other.screen.y-item.screen.y)*viewport.height<other.radius+item.radius+4))item.visible=false;
      else accepted.push(item);
    }
  }
  function activateDiscovery(id){
    if(!state||state.age<1.15||disposed)return false;
    const item=state.items.find(item=>item.id===id);if(!item||!item.visible)return false;
    const repeat=item.found;item.found=true;item.pulseAt=elapsed;
    if(focus?.id===id){focus=null;if(focusResolve){focusResolve({completed:true,cancelled:false});focusResolve=null;}}
    onDiscovery({id:item.id,kind:item.kind,secret:item.secret,repeat,screen:{...item.screen},pan:clamp(item.screen.x*2-1,-1,1)});return true;
  }
  function pick(raycaster,pixel,camera,viewport){
    if(!state||state.age<1.15)return false;
    const hits=raycaster.intersectObjects(state.items.filter(item=>item.visible).map(item=>item.hit),false);
    const direct=new Set(hits.map(hit=>hit.object.userData.discovery));
    const eligible=state.items.filter(item=>item.visible).map(item=>({item,distance:Math.hypot(pixel.x-item.screen.x*viewport.width,pixel.y-item.screen.y*viewport.height)}))
      .filter(({item,distance})=>distance<=item.radius||(direct.has(item.id)&&distance<=item.radius*1.4)).sort((a,b)=>a.distance/a.item.radius-b.distance/b.item.radius);
    return eligible.length?activateDiscovery(eligible[0].item.id):false;
  }
  function getScreenPositions(){return state?state.items.map(item=>({id:item.id,kind:item.kind,secret:item.secret,found:item.found,screen:{...item.screen},radius:item.radius,visible:Boolean(item.visible)})):[];}
  function dispose(){if(disposed)return;clearActivity();disposed=true;root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());areaCache.clear();sceneryCache.clear();}
  return{setActivity,clearActivity,focusDiscovery,cameraPlan,update,pick,activateDiscovery,getScreenPositions,getFocusTarget,dispose,
    isActive:()=>Boolean(state),getDebugInfo:()=>state?{species:state.species,ready:state.age>1.5,context:lastContext?.kind||'ground',targets:getScreenPositions(),focus:focus?.id||null}:null};
}
