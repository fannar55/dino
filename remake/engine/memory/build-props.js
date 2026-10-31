import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { installWaterFlow } from './world-surface-fx.js';

/** The grove's berries: a small faceted ball in one of two reds. The berries a surprise leaf hides (surprise-items.js) are the same. */
export const GROVE_BERRY = Object.freeze({ radius: .12, reds: Object.freeze(['#b8474f', '#cf6a61']) });
export const MARSH = Object.freeze({ center: [4.5, -19.5], halfWidth: 5.6, halfDepth: 1.5, waterY: -.32, bedY: -.65, bankBlend: .8, bounds: { minX: -1.1, maxX: 10.1, minZ: -21, maxZ: -18 } });
export const WALKWAY = Object.freeze({ start: [4.5, -17.25], end: [4.5, -21.75], width: 3.5, halfWidth: 1.75, panelLength: 1.5, count: 3, supply: [7, -15.6] });
export const STAGING = Object.freeze({ center: [4.5, -13.8], bounds: { minX: -1.5, maxX: 10.5, minZ: -17.3, maxZ: -10.5 } });
export const DESTINATION = Object.freeze({ center: [4.5, -26], bounds: { minX: -1, maxX: 10, minZ: -29, maxZ: -23 } });

export function marshValley(x, z) {
  const r = Math.hypot((x - MARSH.center[0]) / MARSH.halfWidth, (z - MARSH.center[1]) / MARSH.halfDepth);
  return MARSH.bedY * (1 - THREE.MathUtils.smoothstep(r, .65, 1 + MARSH.bankBlend / MARSH.halfDepth));
}

/** Broad grain and knots baked once, shared by each piece of weathered bark. */
export function createBarkTexture() {
  const size = 256, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const bend = Math.sin(x * .019) * 4 + Math.sin(x * .043 + 1) * 1.5;
    const grain = Math.sin((y + bend) * .22) * 8 + Math.sin((y + bend) * .63) * 2;
    const knot = Math.exp(-((x - 164) ** 2 / 650 + (y - 107) ** 2 / 170));
    const ring = Math.sin(Math.hypot((x - 164) * .42, y - 107) * .63) * knot * 15;
    const crack = Math.max(0, Math.sin((y + bend) * .27)) ** 15 * 38;
    const fine = (Math.sin(x * 71.3 + y * 97.1) * 43758.5 % 1) * 2, v = grain + ring - crack + fine;
    const i = (y * size + x) * 4;
    pixels[i] = 178 + v; pixels[i + 1] = 138 + v * .78; pixels[i + 2] = 92 + v * .5; pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

export function createBuildProps({ scene, heightAt }) {
  const root = new THREE.Group(); root.name = 'Barkarbrú og berjalundur'; scene.add(root);
  const geometries = new Set(), materials = new Set(), textures = new Set(), dummy = new THREE.Object3D();
  const geo = g => (geometries.add(g), g);
  const mat = options => { const m = new THREE.MeshStandardMaterial({ roughness: .94, ...options }); materials.add(m); return m; };
  const mesh = (g, m, parent = root, shadow = true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o; };
  const random = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const colourPart = (g, colour, parts) => { const q = g.index ? g.toNonIndexed() : g.clone(), c = new THREE.Color(colour), a = new Float32Array(q.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) c.toArray(a, i); q.setAttribute('color', new THREE.BufferAttribute(a, 3)); q.deleteAttribute('uv'); parts.push(q); g.dispose(); };
  const merge = parts => { const g = geo(mergeGeometries(parts)); parts.forEach(p => p.dispose()); return mesh(g, mat({ vertexColors: true })); };
  const deckY = Math.max(heightAt(...WALKWAY.start), heightAt(...WALKWAY.end)) + .18;

  // The marsh has the same elliptical boundary used by navigation and QA.
  const waterPos = [], waterColour = [], waterIndex = [], flowUv = [], rings = [0, .5, .85, .97, 1.015], segments = 64;
  for (let r = 0; r < rings.length; r++) for (let j = 0; j <= segments; j++) {
    const a = j / segments * Math.PI * 2, f = rings[r];
    waterPos.push(MARSH.center[0] + Math.cos(a) * MARSH.halfWidth * f, MARSH.waterY, MARSH.center[1] + Math.sin(a) * MARSH.halfDepth * f);
    flowUv.push(Math.sin(a)*f,Math.cos(a)*MARSH.halfWidth*f);
    const c = new THREE.Color('#86703c'); waterColour.push(c.r, c.g, c.b, r === rings.length - 1 ? 0 : .86);
    if (r < rings.length - 1 && j < segments) { const n = r * (segments + 1) + j; waterIndex.push(n, n + 1, n + segments + 1, n + 1, n + segments + 2, n + segments + 1); }
  }
  const waterGeometry = geo(new THREE.BufferGeometry()); waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPos, 3)); waterGeometry.setAttribute('color', new THREE.Float32BufferAttribute(waterColour, 4)); waterGeometry.setIndex(waterIndex); waterGeometry.computeVertexNormals();
  waterGeometry.setAttribute('aFlowUv',new THREE.Float32BufferAttribute(flowUv,2));
  const water = mesh(waterGeometry, mat({ vertexColors: true, transparent: true, depthWrite: true, alphaTest: .01, side: THREE.DoubleSide, roughness: .6 }), root, false); water.receiveShadow = false; water.renderOrder = 7.5;
  const waterFlow=installWaterFlow(water.material,{speed:.62,marsh:true});

  const barkTexture = createBarkTexture(); textures.add(barkTexture);
  const barkMaterial = mat({ color: '#fff2d6', map: barkTexture, bumpMap: barkTexture, bumpScale: .05 });
  const shape = new THREE.Shape();
  shape.moveTo(-1.51, -.73); shape.lineTo(-.6, -.77); shape.lineTo(.58, -.73); shape.lineTo(1.52, -.68); shape.lineTo(1.6, -.3); shape.lineTo(1.55, .64); shape.lineTo(.62, .76); shape.lineTo(-.65, .7); shape.lineTo(-1.6, .62); shape.closePath();
  const panelGeometry = geo(new THREE.ExtrudeGeometry(shape, { depth: .14, steps: 1, bevelEnabled: true, bevelSize: .035, bevelThickness: .035, bevelSegments: 1, curveSegments: 2 }));
  panelGeometry.rotateX(-Math.PI / 2); panelGeometry.translate(0, -.14, 0);panelGeometry.scale(WALKWAY.width/3.2,1,1);
  panelGeometry.computeBoundingBox();
  const bottomY=panelGeometry.boundingBox.min.y,bottomTriangles=[],positions=panelGeometry.attributes.position;
  for(let i=0;i<positions.count;i+=3){const triangle=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,i+j));if(triangle.every(p=>Math.abs(p.y-bottomY)<1e-6))bottomTriangles.push(triangle)}
  const cargoSlices=[];
  for(let slice=0;slice<16;slice++){
    const lo=THREE.MathUtils.lerp(panelGeometry.boundingBox.min.x,panelGeometry.boundingBox.max.x,slice/16),hi=THREE.MathUtils.lerp(panelGeometry.boundingBox.min.x,panelGeometry.boundingBox.max.x,(slice+1)/16),box=new THREE.Box3();
    for(let i=0;i<positions.count;i+=3){const triangle=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,i+j));for(let j=0;j<3;j++){const a=triangle[j],b=triangle[(j+1)%3];if(a.x>=lo&&a.x<=hi)box.expandByPoint(a);if(Math.abs(b.x-a.x)>1e-8)for(const x of[lo,hi]){const t=(x-a.x)/(b.x-a.x);if(t>=0&&t<=1)box.expandByPoint(a.clone().lerp(b,t))}}}
    if(!box.isEmpty())cargoSlices.push(box);
  }
  const transformedCorners=box=>{const points=[];for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])points.push(cargo.localToWorld(new THREE.Vector3(x,y,z)).toArray());return points};
  function rearSupport(x){let rear=-Infinity;for(const triangle of bottomTriangles)for(let i=0;i<3;i++){const a=triangle[i],b=triangle[(i+1)%3],dx=b.x-a.x;if(Math.abs(dx)<1e-8){if(Math.abs(x-a.x)<1e-6)rear=Math.max(rear,a.z,b.z)}else{const t=(x-a.x)/dx;if(t>=0&&t<=1)rear=Math.max(rear,THREE.MathUtils.lerp(a.z,b.z,t))}}return new THREE.Vector3(x,bottomY,rear-.012)}
  let supportLocal=[];
  function carryPose(mouths){
    const direction=mouths[1].clone().sub(mouths[0]),length=direction.length(),reach=panelGeometry.boundingBox.max.x-.03;let half=Math.min(reach,length/2);
    // Fit two real points just inside the irregular underside edge to the two
    // measured mouths. This also permits the slight tilt between their heads (and never reaches past the panel's own width).
    for(let i=0;i<2;i++){const a=rearSupport(-half),b=rearSupport(half);half=Math.min(reach,half*length/a.distanceTo(b))}
    supportLocal=[rearSupport(-half),rearSupport(half)];
    const localDirection=supportLocal[1].clone().sub(supportLocal[0]),quaternion=new THREE.Quaternion().setFromUnitVectors(localDirection.normalize(),direction.normalize());
    const middle=supportLocal[0].clone().add(supportLocal[1]).multiplyScalar(.5).applyQuaternion(quaternion);
    return{point:mouths[0].clone().add(mouths[1]).multiplyScalar(.5).sub(middle),quaternion};
  }
  // Placed slabs, the supply stack and the moving slab share one render batch.
  const panels = new THREE.InstancedMesh(panelGeometry, barkMaterial, 3); panels.castShadow = true; panels.receiveShadow = true; panels.frustumCulled = false; root.add(panels);
  const cargo = new THREE.Object3D(); cargo.name = 'Börkur borinn lágt milli kambeðlna'; cargo.visible = false; root.add(cargo);
  const placed = [false, false, false], taken = [false, false, false]; let cargoPanel = -1;
  const panelCenter = i => new THREE.Vector3(4.5, deckY, -18 - i * 1.5);
  // The supply stack waiting to be carried rocks on its base (the next obstacle, as the branch and the log do): a tilt
  // across the stack and a small lift, set by sway(); it never touches the panels placed or carried.
  const stackBase = new THREE.Vector3(7, heightAt(7, -15.6), -15.6), stackRock = new THREE.Matrix4(), stackPart = new THREE.Matrix4();
  let swayTilt = 0, swayLift = 0;
  function refreshPanels() {
    stackRock.makeTranslation(stackBase.x, stackBase.y + swayLift, stackBase.z).multiply(stackPart.makeRotationX(swayTilt)).multiply(stackPart.makeTranslation(-stackBase.x, -stackBase.y, -stackBase.z));
    for (let i = 0; i < 3; i++) {
      if (placed[i]) { dummy.position.copy(panelCenter(i)); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); }
      else {
        dummy.position.set(7, heightAt(7, -15.6) + .23 + (2 - i) * .19, -15.6); dummy.rotation.set(0, Math.PI / 2 + (i - 1) * .035, 0); dummy.scale.setScalar(taken[i] ? 0 : 1); dummy.updateMatrix();
        if (swayTilt || swayLift) dummy.matrix.premultiply(stackRock);
      }
      panels.setMatrixAt(i, dummy.matrix);
    }
    refreshCargo();
  }
  function refreshCargo() { if (cargo.visible && cargoPanel >= 0) { cargo.updateMatrix(); panels.setMatrixAt(cargoPanel, cargo.matrix); } panels.instanceMatrix.needsUpdate = true; }
  refreshPanels();
  // Short, low access banks keep feet flush with the finished panels.
  const rampParts = [];
  for (const [z0, z1, rising] of [[-16.65, -17.25, true], [-21.75, -22.35, false]]) {
    const positions = [], indices = [];
    for (let row = 0; row <= 4; row++) for (let col = 0; col <= 6; col++) {
      const t = row / 4, x = 4.5 + (col / 6 * 2 - 1) * 1.9, z = THREE.MathUtils.lerp(z0, z1, t), edge = 1 - THREE.MathUtils.smoothstep(Math.abs(x - 4.5), 1.55, 1.9), ground = heightAt(x, z) + .025;
      positions.push(x, THREE.MathUtils.lerp(ground, deckY - .005, edge * (rising ? t : 1 - t)), z);
      if (row < 4 && col < 6) { const n = row * 7 + col; indices.push(n, n + 1, n + 7, n + 1, n + 8, n + 7); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); colourPart(g, '#d9b479', rampParts);
  }
  const access = merge(rampParts); access.visible = false; access.castShadow = false;
  const nearRampVertices = access.geometry.attributes.position.count / 2;
  access.geometry.setDrawRange(0, nearRampVertices);

  // Individual curved leaves and branching stems replace uniform green globes.
  const groveBands = [[], [], []], groveBand = x => groveBands[x < 2.5 ? 0 : x < 7 ? 1 : 2], leafGeometry = new THREE.BufferGeometry();
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -.16, .03, .27, 0, .08, .34, .16, .03, .27, 0, .02, .69], 3));
  leafGeometry.setIndex([0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 3, 4]); leafGeometry.computeVertexNormals();
  // Berry shrubs: the three the friends eat from, and bigger ones beside and behind the grove, each [x, z, size].
  const shrubSpots = [], shrubs = [[.6, -28.1, 1.1], [4.25, -29, 1.25], [8.1, -28.2, 1.1], [-2.7, -26.6, 1.3], [11.7, -26.8, 1.3], [-1.8, -31.2, 1.55], [2.6, -32, 1.6], [6.6, -31.6, 1.55], [10.4, -31, 1.45]];
  for (const [cluster, [cx, cz, size]] of shrubs.entries()) for (let branch = 0; branch < 8; branch++) {
    const x = cx + (random(branch + cluster * 9) - .5) * 1.7 * size, z = cz + (random(branch + 60 + cluster) - .5) * 1.2 * size, y = heightAt(x, z), h = (.55 + random(branch + cluster * 7) * .55) * size * 1.2;
    shrubSpots.push([x, y, z, h]);
    const stem = new THREE.CylinderGeometry(.025 * size, .065 * size, h, 5); stem.translate(x, y + h / 2, z); colourPart(stem, '#725e37', groveBand(x));
    for (let leaf = 0; leaf < 8; leaf++) {
      const g = leafGeometry.clone(), a = leaf * 2.4 + cluster, scale = (.65 + random(leaf + branch * 8) * .65) * size;
      g.scale(scale, scale, scale); g.rotateX(-.2 + (leaf % 3) * .22); g.rotateY(a); g.translate(x, y + .2 + leaf / 8 * h, z);
      colourPart(g, ['#3d6e3f', '#5f8742', '#8ca454'][leaf % 3], groveBand(x));
    }
  }
  leafGeometry.dispose();
  // Heavy with berries, and some that fell on the ground under them.
  for (let i = 0; i < 230; i++) { const [x, y, z, h] = shrubSpots[i % shrubSpots.length], a = i * 2.4, g = new THREE.IcosahedronGeometry(GROVE_BERRY.radius * (.7 + random(i + 4) * .5), 0); g.translate(x + Math.cos(a) * .3, y + h * (.45 + random(i) * .5), z + Math.sin(a) * .3); colourPart(g, GROVE_BERRY.reds[i % 3 ? 0 : 1], groveBand(x)); }
  for (let i = 0; i < 70; i++) { const [x, y, z] = shrubSpots[(i * 5) % shrubSpots.length], a = i * 2.1, d = .5 + random(i + 70) * 1.1, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, g = new THREE.IcosahedronGeometry(GROVE_BERRY.radius * (.6 + random(i + 8) * .4), 0); g.translate(px, heightAt(px, pz) + .06, pz); colourPart(g, GROVE_BERRY.reds[i % 2], groveBand(px)); }
  // One mesh for each third of the grove's width, so a camera that sees one of them draws only that one.
  for (const parts of groveBands) merge(parts).material.side = THREE.DoubleSide;

  // All bursts and ripples run on the same game clock as the animals.
  const particleGeometry = geo(new THREE.PlaneGeometry(.12, .07)), particleMaterial = mat({ color: '#d0af63', side: THREE.DoubleSide });
  const particles = new THREE.InstancedMesh(particleGeometry, particleMaterial, 64); particles.frustumCulled = false; root.add(particles);
  const rippleGeometry = geo(new THREE.RingGeometry(.92, 1, 28)); rippleGeometry.rotateX(-Math.PI / 2);
  const rippleMaterial = new THREE.MeshBasicMaterial({ color: '#a5d1b2', transparent: true, opacity: .42, depthWrite: false, side: THREE.DoubleSide }); materials.add(rippleMaterial);
  const ripples = new THREE.InstancedMesh(rippleGeometry, rippleMaterial, 8); ripples.frustumCulled = false; ripples.renderOrder = 9; root.add(ripples);
  let time = 0, reduced = false, burstSerial = 0, open = false; const bursts = [];
  function burst(type, point) { if (reduced) return; bursts.push({ type, point: point.clone(), started: time, serial: burstSerial++ }); while (bursts.length > 5) bursts.shift(); }
  function update(now, reducedMotion) {
    time = now; reduced = reducedMotion;
    waterFlow.update(time,reduced);
    while (bursts.length && time - bursts[0].started > 2.1) bursts.shift();
    for (let i = 0; i < 64; i++) {
      const b = bursts[Math.floor(i / 16)], age = b ? time - b.started : 9, alive = b && age < 1.65 && b.type !== 'ripple' && !reduced;
      if (alive) { const n = i + b.serial * 67, angle = random(n) * Math.PI * 2, speed = .25 + random(n + 10) * .8; dummy.position.copy(b.point).add(new THREE.Vector3(Math.cos(angle) * speed * age, (.5 + random(n + 30) * .7) * age - age * age * .65, Math.sin(angle) * speed * age)); dummy.rotation.set(age * 2 + n, age + n, n); dummy.scale.setScalar(Math.max(0, 1 - age / 1.65)); particles.setColorAt(i, new THREE.Color(b.type === 'leaves' ? '#a0ac55' : b.type === 'arrival' ? '#ebc85b' : '#b59762')); }
      else dummy.scale.setScalar(0);
      dummy.updateMatrix(); particles.setMatrixAt(i, dummy.matrix);
    }
    particles.instanceMatrix.needsUpdate = true; if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    for (let i = 0; i < 8; i++) { const b = bursts.filter(b => b.type === 'ripple')[Math.floor(i / 2)], age = b ? time - b.started - (i % 2) * .3 : 9, alive = b && age >= 0 && age < 1.8 && !reduced; if (alive) { dummy.position.copy(b.point); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.15 + age * .8); } else dummy.scale.setScalar(0); dummy.updateMatrix(); ripples.setMatrixAt(i, dummy.matrix); } ripples.instanceMatrix.needsUpdate = true;
    particles.visible = !reduced && bursts.some(b => b.type !== 'ripple'); ripples.visible = !reduced && bursts.some(b => b.type === 'ripple');
  }
  update(0, true);
  function deckPoint(z, out = new THREE.Vector3()) {
    out.set(4.5, deckY + .04, z);
    if (z > -17.25) { const t = THREE.MathUtils.clamp((-16.65 - z) / .6, 0, 1); out.y = THREE.MathUtils.lerp(heightAt(out.x, z) + .04, deckY + .04, t); }
    if (z < -21.75) { const t = THREE.MathUtils.clamp((z + 22.35) / .6, 0, 1); out.y = THREE.MathUtils.lerp(heightAt(out.x, z) + .04, deckY + .04, t); }
    return out;
  }
  function cargoCorners() { panels.updateMatrixWorld(true); const matrix = new THREE.Matrix4(); panels.getMatrixAt(cargoPanel, matrix); const result = [], box = panelGeometry.boundingBox; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) result.push(new THREE.Vector3(x, y, z).applyMatrix4(matrix).applyMatrix4(panels.matrixWorld).toArray()); return result; }
  function reset() { placed.fill(false); taken.fill(false); cargoPanel = -1; cargo.visible = access.visible = false; access.geometry.setDrawRange(0, nearRampVertices); bursts.length = 0; open = false; refreshPanels(); update(time, reduced); }
  return {
    root, cargo, deckY, panelCenter, deckPoint, carryPose, update, burst, reset,
    walkingHeight(x,z) { if(Math.abs(x-4.5)>WALKWAY.halfWidth)return null;for(let i=0;i<3;i++)if(placed[i]&&z<=-17.25-i*1.5&&z>=-18.75-i*1.5)return deckY;return null; },
    takePanel(i) { cargoPanel = i; taken[i] = true; cargo.position.set(7, heightAt(7, -15.6) + .23 + (2 - i) * .19, -15.6); cargo.rotation.set(0, Math.PI / 2, 0); cargo.visible = true; refreshPanels(); },
    placePanel(i) { placed[i] = true; cargoPanel = -1; cargo.visible = false; access.visible = placed[0]; access.geometry.setDrawRange(0, placed[2] ? Infinity : nearRampVertices); refreshPanels(); },
    setCargo(position, orientation) { cargo.position.copy(position);if(orientation?.isQuaternion)cargo.quaternion.copy(orientation);else cargo.rotation.set(0, orientation, 0); cargo.visible = true; refreshCargo(); },
    placedCount: () => placed.filter(Boolean).length,
    /** The waiting stack rocks (tilt in radians, lift in metres) and its wood warms to a glow (0..1) while it is the next obstacle. */
    sway(tilt = 0, lift = 0) { if (tilt === swayTilt && lift === swayLift) return; swayTilt = tilt; swayLift = lift; refreshPanels(); },
    setGlow(amount = 0) { barkMaterial.emissive.set('#ffc65c'); barkMaterial.emissiveIntensity = Math.max(0, amount) * .32; },
    openDestination() { open = true; burst('arrival', new THREE.Vector3(4.5, heightAt(4.5, -26) + .4, -26)); },
    getDebug() { return { built: placed.every(Boolean), panels: placed.map((isPlaced, i) => ({ placed: isPlaced, start: [4.5, deckY, -17.25 - i * 1.5], end: [4.5, deckY, -18.75 - i * 1.5], halfWidth: WALKWAY.halfWidth, deckY })), access: { drawnVertices: access.visible ? Math.min(access.geometry.drawRange.count, access.geometry.attributes.position.count) : 0, nearRampVertices }, cargo: { visible: cargo.visible, position: cargo.position.toArray(), rotation: cargo.rotation.y, supports: cargo.visible? supportLocal.map(p=>cargo.localToWorld(p.clone()).toArray()):[], slices:cargo.visible?cargoSlices.map(transformedCorners):[], corners: cargo.visible ? cargoCorners() : [] } }; },
    dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); },
  };
}
