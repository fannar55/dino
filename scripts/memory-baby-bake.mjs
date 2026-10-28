// Author the infant memory-game friends from the owner's textured adult meshes: the Triceratops
// from Mosi, the Brontosaurus (Þórseðla) and the Stegosaurus (Kambeðla) from their game models.
// UVs, texture maps, triangle topology and skin weights are retained. Geometry, bind skeleton,
// facial metadata and translation tracks pass through the same smooth anatomical map, one per
// species. These are stylised game characters, not reconstructions of real hatchlings.
//
//   node scripts/memory-baby-bake.mjs [--species triceratops|brontosaurus|stegosaurus]
//
// The default is the Triceratops, whose map and output are unchanged from the first bake.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), flag = argv.findIndex(a => a === '--species' || a.startsWith('--species='));
const speciesId = flag < 0 ? 'triceratops' : argv[flag].includes('=') ? argv[flag].slice(10) : argv[flag + 1];

// Brontosaurus and Stegosaurus: the owner's starting values (task brief, 2026-10-28), as factors
// on the size of each source part. The GLB is normalized to one unit nose to tail afterwards, so
// only their ratios show (the head grows 1.4/0.85 = 1.65 times against the torso, the legs
// 0.75/0.85, the tail 0.8/0.85). The legs and tail change length only; their girth follows the
// torso. Plates and tail spikes shrink toward their own base on top of the body's factor.
// Head and band values are measured on each rig: the plane between the Head/Jaw-weighted skin and
// the neck skin (angle from +X in the side view) and the band across it (metres along its normal
// from the Head joint) where the head's growth fades in. Eye radii are in eye sizes (the eye's
// mean half width and height), as Mosi's.
const QUADRUPED_EYE = { gain: .30, inner: 1, outer: 2.8 };
const SPECIES = {
  triceratops: {
    source: 'mosi.glb', asset: 'triceratops-baby.glb', map: triceratopsMap,
    rootName: 'Mosi family baby Triceratops', skinName: 'Baby Triceratops skin',
    design: 'short torso and tail; short legs; large head and eyes; rounded horn buds; original Mosi painted skin',
    provenance: 'Derived from the owner’s textured Tripo Mosi, with existing rig and author-authored baby deformation; retains parent asset rights.',
    // The first bake turns over 22 small body triangles at the feet of the three horns: their
    // seam copies take the horn's shortening, the body vertices beside them do not. Kept as it is
    // until the owner's review of this baby; the other species have none.
    knownFlips: 22,
  },
  brontosaurus: {
    source: 'brontosaurus.glb', asset: 'brontosaurus-baby.glb', name: 'Þórseðla', rootName: 'Baby Þórseðla (Brontosaurus)', skinName: 'Baby Þórseðla skin',
    design: 'large head and eyes; short legs; slightly shorter torso and tail; the long neck kept to reach the branch; original Þórseðla painted skin',
    map: babyQuadruped({
      factors: { head: 1.4, neck: .85, torso: .85, tail: .8, legs: .75 },
      eye: QUADRUPED_EYE,
      head: { angle: 30, band: [-1.2, -.15], centre: -.15 }, // the top metre of the neck widens into the head; growing about the band's end keeps the neck from lengthening
      neck: { bone: 'Neck', band: 1 },
      tail: { bone: 'Tail1', band: 1 },
      legs: { band: [1.4, 2.6] }, // the visible legs below the belly, which is lowest at 1.6 m
      landmarks: ({ positions }) => ({ nose: extreme(positions, 0), support: extreme(positions, 1), bone: 'Head' }), // snout tip; skull crown under the branch
    }),
  },
  stegosaurus: {
    source: 'stegosaurus.glb', asset: 'stegosaurus-baby.glb', name: 'Kambeðla', rootName: 'Baby Kambeðla (Stegosaurus)', skinName: 'Baby Kambeðla skin',
    design: 'large head and eyes; short legs; slightly shorter torso and tail; smaller plates and tail spikes; original Kambeðla painted skin',
    map: babyQuadruped({
      factors: { head: 1.4, neck: .85, torso: .85, tail: .8, legs: .75, plates: .8, spikes: .8 }, // spikes: not in the brief, set as the plates
      eye: QUADRUPED_EYE,
      head: { angle: 0, band: [-.075, .25] }, // the neck plates stand just behind it, at -0.08 and lower
      neck: { bone: 'Neck', band: .4 },
      tail: { bone: 'Tail1', band: .6 },
      legs: { band: [.6, 1.3] }, // the belly is lowest at 0.78 m, the chin at 1.54 m
      // The eleven plates are the _PLATEROW components; the two tail-spike parts of this bake of
      // Kambeðla ride Tail5 rigidly (checked below) and must be reviewed if her source mesh changes.
      parts: ({ components, plateRow }) => [
        ...components(i => plateRow[i] > 0).map(vertices => ({ vertices, scale: 'plates' })),
        { start: 21155, count: 345, bone: 'Tail5', scale: 'spikes' }, { start: 22154, count: 363, bone: 'Tail5', scale: 'spikes' },
      ],
    }),
  },
};
const spec = SPECIES[speciesId];
if (!spec) throw new Error(`Unknown --species ${speciesId}; use ${Object.keys(SPECIES).join('|')}`);

const src = path.join(ROOT, 'remake/assets/characters', spec.source);
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
const primitive = gltf.meshes[meshNode.mesh].primitives[0], attributes = primitive.attributes;
const originalEyes = structuredClone(meshNode.extras.face.eyes);
const ground = gltf.accessors[attributes.POSITION].min[1];
const key=p=>p.toArray().map(n=>n.toFixed(6)).join(',');
function extreme(positions,axis){let best=0;for(let i=axis;i<positions.length;i+=3)if(positions[i]>positions[best*3+axis])best=(i-axis)/3;return Array.from(positions.subarray(best*3,best*3+3));}

// Bind transforms in the mesh's unscaled authored space (root node identity).
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
const bonePosition=name=>{const i=gltf.nodes.findIndex(n=>n.name===name);if(i<0)throw new Error(`No bone ${name} in ${spec.source}`);return new V().setFromMatrixPosition(oldWorld.get(i));};

const pos=values(attributes.POSITION), normals=values(attributes.NORMAL), before = new Float32Array(pos);
const map=spec.map({values,before,bonePosition,indices:values(primitive.indices),attributes});
const {deform}=map;
function jacobian(p,hornId=-1) {
  const e=.0001, cols=[];
  for(let i=0;i<3;i++) { const a=p.clone(), b=p.clone(); a.setComponent(i,a.getComponent(i)+e); b.setComponent(i,b.getComponent(i)-e); cols.push(deform(a,hornId).sub(deform(b,hornId)).multiplyScalar(.5/e)); }
  return new THREE.Matrix3().set(cols[0].x,cols[1].x,cols[2].x,cols[0].y,cols[1].y,cols[2].y,cols[0].z,cols[1].z,cols[2].z);
}
const box=new THREE.Box3();
let minJacobian=Infinity, minJacobianPoint=null;
for(let i=0;i<pos.length;i+=3) {
  const p=new V().fromArray(before,i),hornId=map.partOf(p,i/3),q=deform(p,hornId);
  const derivative=jacobian(p,hornId);if(derivative.determinant()<minJacobian){minJacobian=derivative.determinant();minJacobianPoint=p.toArray();}
  const n=new V().fromArray(normals,i).applyMatrix3(derivative.invert().transpose()).normalize();
  if(![...q,...n].every(Number.isFinite))throw new Error(`Non-finite baby vertex ${i/3}`);
  q.toArray(pos,i); n.toArray(normals,i); box.expandByPoint(q);
}
if(minJacobian<=0)throw new Error(`Baby deformation folds the surface at ${minJacobianPoint}`);
// A second, discrete fold check: no triangle may turn over (its area normal against the source's).
// Slivers (narrower than 0.02 % of the body's length, under 1.4 mm on Kambeðla) are only counted:
// they have no area to show, and any curvature at all turns some of them.
const tri=values(primitive.indices);let flipped=0,flippedSlivers=0;
{const a=new V(),b=new V(),c=new V(),n0=new V(),n1=new V(),sliver=2e-4*(gltf.accessors[attributes.POSITION].max[0]-gltf.accessors[attributes.POSITION].min[0]);
for(let t=0;t<tri.length;t+=3){
  a.fromArray(before,tri[t]*3);b.fromArray(before,tri[t+1]*3).sub(a);c.fromArray(before,tri[t+2]*3).sub(a);n0.crossVectors(b,c);
  const longest=Math.max(b.length(),c.length(),b.distanceTo(c));
  a.fromArray(pos,tri[t]*3);b.fromArray(pos,tri[t+1]*3).sub(a);c.fromArray(pos,tri[t+2]*3).sub(a);n1.crossVectors(b,c);
  if(n0.lengthSq()>1e-20&&n1.dot(n0)<=0){if(n0.length()/longest<sliver)flippedSlivers++;else flipped++;}
}}
if(flipped>(spec.knownFlips??0))throw new Error(`Baby deformation turns over ${flipped} triangles`);
if(flipped||flippedSlivers)console.error(`Turned over: ${flipped} triangles (${spec.knownFlips??0} known), ${flippedSlivers} slivers`);
gltf.accessors[attributes.POSITION].min=box.min.toArray(); gltf.accessors[attributes.POSITION].max=box.max.toArray();

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
const landmarks=map.landmarks({positions:pos});
if(landmarks)meshNode.extras.memoryLandmarks=landmarks;
const length=box.max.x-box.min.x;
gltf.nodes[0].name=spec.rootName;
gltf.nodes[0].scale=[1/length,1/length,1/length]; // One metre nose to tail; runtime may choose its display length.
meshNode.name=spec.skinName;
gltf.asset.extras={...(gltf.asset.extras||{}),memoryBaby:{version:1,source:`remake/assets/characters/${spec.source}`,design:spec.design}};
const json=Buffer.from(JSON.stringify(gltf));
const padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded);
const binary=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(binary);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+padded.length+8+binary.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,spec.asset),Buffer.concat([header,padded,bh,binary]));
const measured={triangles:values(primitive.indices).length/3,vertices:pos.length/3,bones:bones.size,clips:gltf.animations.map(a=>a.name),normalizedLength:1,normalizedHeight:(box.max.y-box.min.y)/length,normalizedWidth:(box.max.z-box.min.z)/length,minDeformationJacobian:minJacobian};
let report;
if(speciesId==='triceratops')report={source:'../characters/mosi.glb',asset:spec.asset,provenance:spec.provenance,newPaidGeneration:false,...measured,design:spec.design,bake:'node scripts/memory-baby-bake.mjs',status:'First playable art review, requires visual approval'};
else{
  const parentSource=JSON.parse(fs.readFileSync(src.replace(/\.glb$/,'-source.json'),'utf8'));
  report={source:`../characters/${spec.source}`,parentSource:`../characters/${spec.source.replace(/\.glb$/,'-source.json')}`,asset:spec.asset,
    provenance:`Derived from the owner’s textured Tripo ${spec.name} (${spec.source}: its rig, clips, face and mouth data), with an author-authored baby deformation computed from that model; no drawing, sculpting or new modelling; retains parent asset rights.`,
    author:parentSource.author,license:parentSource.license,licenseUrl:parentSource.licenseUrl,rightsNote:parentSource.rightsNote,newPaidGeneration:false,
    ...measured,flippedTriangles:flipped,flippedSlivers,map:map.values,parts:map.partSummary,design:spec.design,bake:`node scripts/memory-baby-bake.mjs --species ${speciesId}`,
    status:'Review candidate for the owner; not in the game until he approves it (MEMORY_CHARACTER_ART still loads the adult)'};
}
fs.writeFileSync(path.join(outDir,spec.asset.replace(/\.glb$/,'-source.json')),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

// Mosi's map, as first authored for the memory game.
function triceratopsMap({values,before}) {
  const origin = new V(1.24, 1.1, 0);
  // The bake preserves source-part vertex ranges: Mesh_10 is the nose horn,
  // Mesh_8 and Mesh_9 are the brow horns. Tag welded seam copies by position too,
  // so each entire horn is shortened evenly without a spatial mask missing its tip.
  const hornParts=[
    {start:8050,count:114,base:new V(1.965,1.11,-.345),axis:new V(.33,.94,-.06).normalize(),scale:.33},
    {start:13659,count:200,base:new V(1.82,1.38,.07),axis:new V(.49,.86,-.17).normalize(),scale:.24},
    {start:13859,count:171,base:new V(1.60,1.43,-.40),axis:new V(.48,.87,-.12).normalize(),scale:.24},
  ];
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
  return {
    deform, partOf: p => hornPoints.get(key(p)) ?? -1,
    landmarks() {
      let noseVertex=13481;
      for(let i=13481;i<13659;i++)if(before[3*i]>before[3*noseVertex])noseVertex=i;
      return {nose:deform(new V().fromArray(before,noseVertex*3)).toArray(),bone:'Head'};
    },
  };
}

// The quadruped map. In order: plates and spikes shrink toward their base (a ramp keeps their
// foot, and so the seam with the body, where it is); the eye sockets grow around the painted eyes;
// the tail shortens behind its first joint, the legs below the belly and the neck past its base
// (one-dimensional warps whose rate never drops below the factor, so they cannot fold); the head
// grows about the middle of its band, fading in across it; then the whole baby takes the torso
// factor. Every step is smooth and keeps a positive Jacobian; the bake checks it on every vertex.
function babyQuadruped(P) {
  return ({ before, bonePosition, indices, attributes }) => {
    const f = P.factors, rel = { head: f.head / f.torso, neck: f.neck / f.torso, tail: f.tail / f.torso, legs: f.legs / f.torso };
    // The integral of smoothstep over [a, b]: a coordinate's rate goes from 1 to k across the band.
    const ramp = (a, b, u) => { if (u <= a) return 0; if (u >= b) return (b - a) / 2 + u - b; const t = (u - a) / (b - a); return (b - a) * (t ** 3 - t ** 4 / 2); };
    const eyes = originalEyes.map(e => { const size = (e.halfWidth + (e.top + e.bottom) / 2) / 2; return { c: new V(...e.centre).setY(e.centre[1] - ground), inner: P.eye.inner * size, outer: P.eye.outer * size }; });
    const tailX = bonePosition(P.tail.bone).x, neckBase = bonePosition(P.neck.bone), headJoint = bonePosition('Head');
    const neckDir = headJoint.clone().sub(neckBase).normalize(), headN = new V(Math.cos(P.head.angle * Math.PI / 180), Math.sin(P.head.angle * Math.PI / 180), 0);
    function body(q) {
      if (rel.tail !== 1) { const u = tailX - q.x; q.x = tailX - (u - (1 - rel.tail) * ramp(-P.tail.band / 2, P.tail.band / 2, u)); }
      if (rel.legs !== 1) q.y = rel.legs * q.y + (1 - rel.legs) * ramp(P.legs.band[0], P.legs.band[1], q.y);
      if (rel.neck !== 1) { const t = q.clone().sub(neckBase).dot(neckDir); q.addScaledVector(neckDir, -(1 - rel.neck) * ramp(-P.neck.band / 2, P.neck.band / 2, t)); }
      return q;
    }
    // The head grows about a point on the band's normal (its middle unless the map names one).
    const at = P.head.centre ?? (P.head.band[0] + P.head.band[1]) / 2, band = P.head.band.map(t => t - at);
    const headCentre = body(headJoint.clone().setY(headJoint.y - ground).addScaledVector(headN, at));

    // Rigid parts (plates, spikes): their vertices, foot (the seam they share with the body), axis.
    const count = before.length / 3, partIndex = new Int16Array(count).fill(-1), parts = [];
    const posKey = i => key(new V().fromArray(before, i * 3));
    const rows = attributes._PLATEROW === undefined ? null : values(attributes._PLATEROW);
    const componentsOf = selected => {
      const parent = new Int32Array(count).map((_, i) => i), find = a => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
      for (let t = 0; t < indices.length; t += 3) { const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]; if (selected(a) && selected(b) && selected(c)) { parent[find(a)] = find(b); parent[find(b)] = find(c); } }
      const seen = new Map(); for (let i = 0; i < count; i++) if (selected(i)) { const k = posKey(i); if (seen.has(k)) parent[find(i)] = find(seen.get(k)); else seen.set(k, i); }
      const groups = new Map(); for (let i = 0; i < count; i++) if (selected(i)) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
      return [...groups.values()];
    };
    const joints = values(attributes.JOINTS_0), weights = values(attributes.WEIGHTS_0), boneNames = gltf.skins[0].joints.map(j => gltf.nodes[j].name);
    for (const part of P.parts?.({ components: componentsOf, plateRow: rows }) ?? []) {
      const vertices = part.vertices ?? Array.from({ length: part.count }, (_, k) => part.start + k);
      if (part.bone) for (const i of vertices) { let rigid = false; for (let k = 0; k < 4; k++) if (weights[i * 4 + k] >= .999 && boneNames[joints[i * 4 + k]] === part.bone) rigid = true; if (!rigid || rows?.[i]) throw new Error(`Vertex ${i} is not on the ${part.bone} part this map expects; review the part ranges`); }
      const inside = new Set(vertices), keys = new Set(); for (let i = 0; i < count; i++) if (!inside.has(i)) keys.add(posKey(i));
      const seam = vertices.filter(i => keys.has(posKey(i)));
      if (!seam.length) throw new Error(`A ${part.scale} part has no seam with the body`);
      const base = seam.reduce((s, i) => s.add(new V().fromArray(before, i * 3)), new V()).divideScalar(seam.length);
      const centroid = vertices.reduce((s, i) => s.add(new V().fromArray(before, i * 3)), new V()).divideScalar(vertices.length);
      const axis = centroid.sub(base).normalize(), along = i => new V().fromArray(before, i * 3).sub(base).dot(axis);
      const foot = Math.max(...seam.map(along)), top = Math.max(...vertices.map(along));
      base.y -= ground;
      const id = parts.push({ base, axis, from: foot, to: top, scale: f[part.scale], kind: part.scale, vertices: vertices.length, height: top }) - 1;
      for (const i of vertices) partIndex[i] = id;
    }

    function deform(p, partId = -1) {
      const q = p.clone(); q.y -= ground;
      if (partId >= 0) { const part = parts[partId], d = q.clone().sub(part.base); q.copy(part.base).addScaledVector(d, 1 - (1 - part.scale) * smooth(part.from, part.to, d.dot(part.axis))); }
      for (const e of eyes) { const d = q.clone().sub(e.c); q.addScaledVector(d, P.eye.gain * (1 - smooth(e.inner, e.outer, d.length()))); }
      body(q);
      const d = q.clone().sub(headCentre);
      q.addScaledVector(d, (rel.head - 1) * smooth(band[0], band[1], d.dot(headN)));
      return q.multiplyScalar(f.torso);
    }
    const r3 = v => +v.toFixed(3);
    return {
      deform, partOf: (p, i) => partIndex[i],
      landmarks: P.landmarks ?? (() => null),
      values: { factors: f, relativeToTorso: Object.fromEntries(Object.entries(rel).map(([k, v]) => [k, r3(v)])), eye: P.eye, head: { ...P.head, centrePoint: headJoint.clone().addScaledVector(headN, at).toArray().map(r3) }, neck: P.neck, tail: { ...P.tail, x: r3(tailX) }, legs: P.legs },
      partSummary: parts.length ? parts.map(p => ({ kind: p.kind, vertices: p.vertices, scale: p.scale, base: p.base.toArray().map(r3), height: r3(p.height) })) : undefined,
    };
  };
}
