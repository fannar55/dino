// Author an infant Triceratops from the owner's textured Mosi mesh. UVs, texture maps,
// triangle topology and skin weights are retained. Geometry, bind skeleton, facial
// metadata and translation tracks pass through the same smooth anatomical map.
// This is a stylised game character, not a reconstruction of a real hatchling.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'remake/assets/characters/mosi.glb');
const outDir = path.join(ROOT, 'remake/assets/memory');
const source = fs.readFileSync(src);
const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString('utf8'));
const bin = Buffer.from(source.subarray(28 + jsonLength));
const V = THREE.Vector3;
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function values(id) {
  const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView];
  const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
  if (!C || (view.byteStride && view.byteStride !== components[a.type] * C.BYTES_PER_ELEMENT)) throw new Error(`Unsupported packed accessor ${id}`);
  return new C(bin.buffer, bin.byteOffset + (view.byteOffset || 0) + (a.byteOffset || 0), a.count * components[a.type]);
}
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const meshNode = gltf.nodes.find(n => n.mesh !== undefined);
const originalEyes = structuredClone(meshNode.extras.face.eyes);
const origin = new V(1.24, 1.1, 0);
const ground = gltf.accessors[0].min[1];

// The bake preserves source-part vertex ranges: Mesh_10 is the nose horn,
// Mesh_8 and Mesh_9 are the brow horns. Tag welded seam copies by position too,
// so each entire horn is shortened evenly without a spatial mask missing its tip.
const hornParts=[
  {start:8050,count:114,base:new V(1.965,1.11,-.345),axis:new V(.33,.94,-.06).normalize(),scale:.33},
  {start:13659,count:200,base:new V(1.82,1.38,.07),axis:new V(.49,.86,-.17).normalize(),scale:.24},
  {start:13859,count:171,base:new V(1.60,1.43,-.40),axis:new V(.48,.87,-.12).normalize(),scale:.24},
];
const key=p=>p.toArray().map(n=>n.toFixed(6)).join(',');
const hornPoints=new Map(), sourcePositions=values(0);
for(let h=0;h<hornParts.length;h++){const part=hornParts[h];for(let i=part.start;i<part.start+part.count;i++)hornPoints.set(key(new V().fromArray(sourcePositions,i*3)),h);}
function deform(p,hornId=-1) {
  let x = p.x, y = p.y - ground, z = p.z;
  if(hornId>=0){const h=hornParts[hornId],d=new V(x,y,z).sub(h.base),along=d.dot(h.axis);const q=new V(x,y,z).addScaledVector(h.axis,-along*(1-h.scale));x=q.x;y=q.y;z=q.z;}
  // Slightly larger eye sockets, preserving the original painted eyes.
  for (const eye of originalEyes) {
    const c = new V(...eye.centre); c.y -= ground;
    const d = new V(x,y,z).sub(c);
    const gain = .30 * (1 - smooth(.085,.245,d.length()));
    x += d.x*gain; y += d.y*gain; z += d.z*gain;
  }
  // The infant's frill is lower and rounder than the adult shield, while its face
  // is proportionally larger. The soft mask keeps the skin and seams continuous.
  y -= Math.max(0,y-1.40)*.48*(1-smooth(1.38,1.67,x));
  x -= Math.max(0,x-1.53)*.12*smooth(.72,.94,y);
  const w = smooth(.57,1.23,x) * smooth(.20,1.02,y);
  const body = new V(.66*x,.65*y,1.12*z);
  if (x < -.42) body.x = -.42*.66 + (x+.42)*.39;
  const head = new V(.66*origin.x+(x-origin.x)*1.28,.65*origin.y+(y-origin.y)*1.28,z*1.28);
  return body.lerp(head,w);
}
function jacobian(p,hornId=-1) {
  const e=.0001, cols=[];
  for(let i=0;i<3;i++) { const a=p.clone(), b=p.clone(); a.setComponent(i,a.getComponent(i)+e); b.setComponent(i,b.getComponent(i)-e); cols.push(deform(a,hornId).sub(deform(b,hornId)).multiplyScalar(.5/e)); }
  return new THREE.Matrix3().set(cols[0].x,cols[1].x,cols[2].x,cols[0].y,cols[1].y,cols[2].y,cols[0].z,cols[1].z,cols[2].z);
}
const pos=values(0), normals=values(1), before = new Float32Array(pos);
const box=new THREE.Box3();
let minJacobian=Infinity, minJacobianPoint=null;
for(let i=0;i<pos.length;i+=3) {
  const p=new V().fromArray(before,i),hornId=hornPoints.get(key(p))??-1,q=deform(p,hornId);
  const derivative=jacobian(p,hornId);if(derivative.determinant()<minJacobian){minJacobian=derivative.determinant();minJacobianPoint=p.toArray();}
  const n=new V().fromArray(normals,i).applyMatrix3(derivative.invert().transpose()).normalize();
  if(![...q,...n].every(Number.isFinite))throw new Error(`Non-finite baby vertex ${i/3}`);
  q.toArray(pos,i); n.toArray(normals,i); box.expandByPoint(q);
}
if(minJacobian<=0)throw new Error(`Baby deformation folds the surface at ${minJacobianPoint}`);
gltf.accessors[0].min=box.min.toArray(); gltf.accessors[0].max=box.max.toArray();

// Compute bind transforms in the mesh's unscaled authored space.
const parents=new Map(); gltf.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
const local = n => new THREE.Matrix4().compose(new V(...(n.translation||[0,0,0])),new THREE.Quaternion(...(n.rotation||[0,0,0,1])),new V(...(n.scale||[1,1,1])));
const oldWorld = new Map();
function world(i) {
  if(oldWorld.has(i)) return oldWorld.get(i);
  const m=i===0?new THREE.Matrix4():local(gltf.nodes[i]);
  const p=parents.get(i); if(p!==undefined) m.premultiply(world(p));
  oldWorld.set(i,m);return m;
}
gltf.nodes.forEach((_,i)=>world(i));
const newWorld=new Map();
gltf.nodes.forEach((n,i)=>{
  const p=new V(),q=new THREE.Quaternion(),s=new V();oldWorld.get(i).decompose(p,q,s);
  newWorld.set(i,(i===0||n.mesh!==undefined)?new THREE.Matrix4():new THREE.Matrix4().compose(deform(p),q,s));
});
const bones=new Set(gltf.skins[0].joints);
for(const i of bones) {
  const parent=parents.get(i);
  const m=new THREE.Matrix4().copy(newWorld.get(parent)||new THREE.Matrix4()).invert().multiply(newWorld.get(i));
  const p=new V(),q=new THREE.Quaternion(),s=new V();m.decompose(p,q,s);
  gltf.nodes[i].translation=p.toArray(); gltf.nodes[i].rotation=q.toArray();
}
const inverse=values(gltf.skins[0].inverseBindMatrices);
gltf.skins[0].joints.forEach((id,k)=>new THREE.Matrix4().copy(newWorld.get(id)).invert().toArray(inverse,k*16));
for(const animation of gltf.animations) for(const channel of animation.channels) {
  if(channel.target.path!=='translation') continue;
  const accessorId=animation.samplers[channel.sampler].output,data=values(accessorId),parent=parents.get(channel.target.node);
  const oldP=oldWorld.get(parent)||new THREE.Matrix4(),newP=new THREE.Matrix4().copy(newWorld.get(parent)||new THREE.Matrix4()).invert();
  for(let i=0;i<data.length;i+=3) deform(new V().fromArray(data,i).applyMatrix4(oldP)).applyMatrix4(newP).toArray(data,i);
  const accessor=gltf.accessors[accessorId];
  if(accessor.min||accessor.max){const bounds=new THREE.Box3();for(let i=0;i<data.length;i+=3)bounds.expandByPoint(new V().fromArray(data,i));accessor.min=bounds.min.toArray();accessor.max=bounds.max.toArray();}
}
// Eyelid shells are generated over the enlarged painted eye triangles at runtime.
meshNode.extras.face.eyes=originalEyes.map(eye=>{
  const c=new V(...eye.centre),j=jacobian(c),right=new V(...eye.right).applyMatrix3(j),down=new V(...eye.down).applyMatrix3(j);
  return {...eye,centre:deform(c).toArray(),right:right.clone().normalize().toArray(),down:down.clone().normalize().toArray(),normal:new V(...eye.normal).applyMatrix3(j.clone().invert().transpose()).normalize().toArray(),halfWidth:eye.halfWidth*right.length(),top:eye.top*down.length(),bottom:eye.bottom*down.length()};
});
let noseVertex=13481;
for(let i=13481;i<13659;i++)if(before[3*i]>before[3*noseVertex])noseVertex=i;
meshNode.extras.memoryLandmarks={nose:deform(new V().fromArray(before,noseVertex*3)).toArray(),bone:'Head'};
const length=box.max.x-box.min.x;
gltf.nodes[0].name='Mosi family baby Triceratops';
gltf.nodes[0].scale=[1/length,1/length,1/length]; // One metre nose to tail; runtime may choose its display length.
meshNode.name='Baby Triceratops skin';
gltf.asset.extras={...(gltf.asset.extras||{}),memoryBaby:{version:1,source:'remake/assets/characters/mosi.glb',design:'short torso and tail; short legs; large head and eyes; rounded horn buds; original Mosi painted skin'}};
const json=Buffer.from(JSON.stringify(gltf));
const padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded);
const binary=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(binary);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+padded.length+8+binary.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'triceratops-baby.glb'),Buffer.concat([header,padded,bh,binary]));
const report={source:'../characters/mosi.glb',asset:'triceratops-baby.glb',provenance:'Derived from the owner’s textured Tripo Mosi, with existing rig and author-authored baby deformation; retains parent asset rights.',newPaidGeneration:false,triangles:values(5).length/3,vertices:pos.length/3,bones:bones.size,clips:gltf.animations.map(a=>a.name),normalizedLength:1,normalizedHeight:(box.max.y-box.min.y)/length,normalizedWidth:(box.max.z-box.min.z)/length,minDeformationJacobian:minJacobian,design:gltf.asset.extras.memoryBaby.design,bake:'node scripts/memory-baby-bake.mjs',status:'First playable art review, requires visual approval'};
fs.writeFileSync(path.join(outDir,'triceratops-baby-source.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
