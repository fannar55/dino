import * as THREE from './vendor/three.module.js';
import { createDinosaur, preloadDinosaurAssets } from './dinosaurs.js';
import { preloadEnvironmentAssets, populateEnvironment } from './environment-assets.js';
import { createArrivalTrack, FIRST_FOREST_LAYOUT, forestEntryVegetation, forestFloorVegetation, firstForestSweeps, brontosaurusSweeps, protectFirstForestPassage } from './arrival-staging.js';
import { applyViewportFraming } from './camera-framing.js';
import { createWorldDiscoveries } from './world-discoveries.js';
import { createCinematicRides, rideAttentionTarget, explorationViewTarget, canopyBoardingOffset } from './cinematic-rides.js';
import { createWorldTouchFeedback } from './world-touch-feedback.js';

/** A continuous forest expedition with locally hosted, optimized nature assets. */
export async function createWorld(canvas, { onInteract = () => {}, onDiscovery = () => {}, onActivityEvent = () => {}, onWorldTouch = () => {}, onReady = () => {}, onProgress = () => {}, onArrivalEvent = () => {} } = {}) {
  let loaded = 0;
  const report = () => onProgress({ loaded: ++loaded, total: 2 });
  const [dinosaurAssets, environmentAssets] = await Promise.all([
    preloadDinosaurAssets().then(value => { report(); return value; }),
    preloadEnvironmentAssets().then(value => { report(); return value; }),
  ]);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#99b9af');
  // Keep the nearby explorers clear while the distant forest dissolves into mist.
  // Three's fog shader uses smoothstep between these view-space distances.
  scene.fog = new THREE.Fog('#99b9af', 10, 80);
  const camera = new THREE.PerspectiveCamera(43, 1, .2, 170);
  const timer = new THREE.Clock();
  const dummy = new THREE.Object3D();
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const cameraTarget = new THREE.Vector3();
  const cameraDesired = new THREE.Vector3();
  const look = new THREE.Vector3();
  const actorTarget = new THREE.Vector3();
  let elapsed = 0, lastElapsed = 0, paused = false, disposed = false, frame = 0;
  let viewport = { width: 1, height: 1, portrait: false };
  let view = { biome: 'forest', species: null, mode: 'intro' };
  let station = 0, activeCreature = null, celebrationAge = 100;
  let currentWalking = 0, focusBlend = 0, skyBlend = 0, pointerDown = null;
  let arrival = null, lastArrival = null, arrivalSequence = 0, flightStartTime = 0;
  let inspection = null, inspectionResolve = null;
  let activityOptions = null, rideContext = null, rideAttentionAge = null;
  const explorationPan = new THREE.Vector2(), explorationPanTarget = new THREE.Vector2();
  const explorationPanLimits = { yaw: .25, pitch: .13 };
  const leavingCreatures = new Set();
  const creatures = new Map(), interactive = [], materialCache = new Map(), streamedBatches = [], frameDurations = [];
  const rng = seedRandom(219);
  const route = { triceratops: 0, stegosaurus: 12, brachiosaurus: 25, trex: 37, spinosaurus: 57, parasaurolophus: 67, pteranodon: 79 };
  const adultScale = { triceratops: 1.68, stegosaurus: 1.90, brachiosaurus: 2.175, trex: 1.85, spinosaurus: 1.56, parasaurolophus: 1.85, pteranodon: 1.45 };
  const landscapeScale = { triceratops: 2.6, stegosaurus: 2.55, brachiosaurus: 2.2475, trex: 2.8, spinosaurus: 2.4, parasaurolophus: 2.65, pteranodon: 2.3 };
  const modelYOffset = { pteranodon: 8.8 };

  function seedRandom(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function material(color, options = {}) {
    const key = `${color}:${JSON.stringify(options)}`;
    if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: .86, ...options }));
    return materialCache.get(key);
  }
  function mesh(geometry, mat, parent = scene, position = [0, 0, 0], scale = [1, 1, 1]) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(...position); object.scale.set(...scale); parent.add(object); return object;
  }
  function instances(geometry, mat, transforms, { cast = false, receive = false, chunked = false } = {}) {
    // Route sections can leave both the colour and shadow passes while behind us.
    // A single world-sized InstancedMesh would otherwise submit every distant leaf.
    if (!chunked && transforms.length > 60) {
      const chunks = new Map();
      for (const t of transforms) { const key = Math.floor(t.p[0] / 18); if (!chunks.has(key)) chunks.set(key, []); chunks.get(key).push(t); }
      if (chunks.size > 2) {
        const group = new THREE.Group(); scene.add(group);
        for (const [key, batch] of chunks) {
          const object = instances(geometry, mat, batch, { cast, receive, chunked: true }); group.add(object);
          streamedBatches.push({ object, x: key * 18 + 9 });
        }
        return group;
      }
    }
    const object = new THREE.InstancedMesh(geometry, mat, transforms.length);
    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];
      dummy.position.set(...t.p); dummy.scale.set(...(t.s || [1, 1, 1])); dummy.rotation.set(...(t.r || [0, 0, 0]));
      if (t.q) dummy.quaternion.copy(t.q);
      dummy.updateMatrix(); object.setMatrixAt(i, dummy.matrix);
      if (t.c) object.setColorAt(i, new THREE.Color(t.c));
    }
    object.castShadow = cast; object.receiveShadow = receive;
    object.instanceMatrix.needsUpdate = true; scene.add(object); return object;
  }
  function segment(a, b, radius, color) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    return { p: start.add(end).multiplyScalar(.5).toArray(), s: [radius, delta.length(), radius], q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()), c: color };
  }
  const clamp = THREE.MathUtils.clamp;
  const mix = THREE.MathUtils.lerp;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lakeShape = (x, z) => Math.hypot((x - 64) / 17, (z + 10) / 11);
  const pathZ = x => 4.8 + Math.sin(x * .073) * 1.7;
  function groundHeight(x, z) {
    const broad = Math.sin(x * .071 + .7) * Math.cos(z * .089) * .5;
    const fine = Math.sin(x * .42 + z * .21) * Math.sin(z * .33 - x * .13) * .16;
    const forest = (broad + fine) * smooth(4, 12, Math.abs(z - pathZ(x)));
    const lake = (1 - smooth(.65, 1.1, lakeShape(x, z))) * 1.8;
    // A gently scalloped, solid grassy bank supports the two lake encounters.
    // Its raised surface also prevents feet hovering over the shader water.
    const bank = smooth(47, 51, x) * (1 - smooth(73, 78, x))
      * smooth(-3.7 + Math.sin(x * .31) * .4, -2.2 + Math.sin(x * .31) * .4, z);
    return mix(forest - lake - .045, Math.max(forest, .08), bank);
  }
  function isPath(x, z) { return Math.abs(z - pathZ(x)) < 3.5; }
  function isClearing(x, z) {
    return Object.values(route).some(anchor =>
      (z > -7.7 && z < 3.2 && Math.abs(x - anchor + 2.2) < 6.5)
      || Math.hypot(x - anchor - 6.2, z - 2) < 3.1
      || Math.hypot(x - anchor - 3.1, z - 2.8) < 2.8);
  }

  // Light is kept warm on characters and cool in the deep forest.
  const hemi = new THREE.HemisphereLight('#d9edcd', '#485e54', 1.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffdda1', 3.1);
  sun.position.set(-12, 25, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 85 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .045; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#b5ece1', 1.2); rim.position.set(3, 8, -15); scene.add(rim, rim.target);
  const warmBounce = new THREE.DirectionalLight('#fff0c4', .42); warmBounce.position.set(4, 3, 14); scene.add(warmBounce, warmBounce.target);

  const sky = mesh(new THREE.SphereGeometry(155, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { zenith: { value: new THREE.Color('#7fa7bc') }, horizon: { value: new THREE.Color('#b9d5cf') } },
    vertexShader: 'varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 vP;uniform vec3 zenith;uniform vec3 horizon;void main(){float h=smoothstep(-.04,.75,normalize(vP).y);gl_FragColor=vec4(mix(horizon,zenith,h),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
  }));
  sky.position.set(30, 0, 0);

  // Vertex-coloured earth: a worn winding trail, green banks, and a real lake hollow.
  const groundGeometry = new THREE.PlaneGeometry(190, 110, 128, 74);
  groundGeometry.rotateX(-Math.PI / 2); groundGeometry.translate(25, 0, -7);
  const groundPositions = groundGeometry.attributes.position, groundColors = [];
  const trailColor = new THREE.Color('#ba9b6b'), mossColor = new THREE.Color('#657b4b');
  const groundColor = new THREE.Color(), shadeColor = new THREE.Color('#3e674f');
  for (let i = 0; i < groundPositions.count; i++) {
    const x = groundPositions.getX(i), z = groundPositions.getZ(i);
    groundPositions.setY(i, groundHeight(x, z));
    const trail = 1 - smooth(1.8, 4.5, Math.abs(z - pathZ(x)) + Math.sin(x * .8 + z * .4) * .3);
    groundColor.copy(mossColor).lerp(shadeColor, (Math.sin(x * .17 + z * .22) + 1) * .19).lerp(trailColor, trail);
    groundColor.multiplyScalar(.92 + Math.sin(x * 1.33 + z * .78) * .045 + Math.cos(x * .77 - z) * .055);
    groundColors.push(groundColor.r, groundColor.g, groundColor.b);
  }
  groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3)); groundGeometry.computeVertexNormals();
  const groundMaterial = material('#ffffff', { vertexColors: true });
  if (environmentAssets.groundColor) {
    groundMaterial.map = environmentAssets.groundColor;
    groundMaterial.normalMap = environmentAssets.groundNormal;
    groundMaterial.normalScale = new THREE.Vector2(.42, .42);
    // Preserve the readable sandy route and the warm storybook palette while
    // adding real leaf litter and soil grain rather than a flat colour carpet.
    groundMaterial.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        float forestDetail = dot(sampledDiffuseColor.rgb, vec3(.299,.587,.114));
        diffuseColor.rgb *= mix(vec3(.86), sampledDiffuseColor.rgb * 1.55 + vec3(.18), .52);
        diffuseColor.rgb *= .91 + forestDetail * .19;
        #endif`);
    };
    groundMaterial.customProgramCacheKey = () => 'forest-floor-v1';
  }
  const ground = mesh(groundGeometry, groundMaterial); ground.receiveShadow = true;
  // The flight can look in every direction. Extend the real earth beyond the
  // walking corridor so a high viewpoint never exposes its rectangular edge.
  for(const [width,depth,x,z,sx,sz]of [[190,188,25,-156,128,18],[190,202,25,149,128,18],[180,500,-160,0,18,92],[180,500,210,0,18,92]]){
    const geometry=new THREE.PlaneGeometry(width,depth,sx,sz);geometry.rotateX(-Math.PI/2);geometry.translate(x,0,z);
    const positions=geometry.attributes.position,uv=geometry.attributes.uv,colors=[];
    for(let i=0;i<positions.count;i++){
      const px=positions.getX(i),pz=positions.getZ(i);positions.setY(i,groundHeight(px,pz)-.025);
      uv.setXY(i,(px+70)/190,(48-pz)/110);
      groundColor.copy(mossColor).lerp(shadeColor,(Math.sin(px*.17+pz*.22)+1)*.19);
      groundColor.multiplyScalar(.92+Math.sin(px*1.33+pz*.78)*.045+Math.cos(px*.77-pz)*.055);colors.push(groundColor.r,groundColor.g,groundColor.b);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();mesh(geometry,groundMaterial).receiveShadow=true;
  }
  // Three irregular wooded ridges conceal the finite terrain edge and soften the horizon.
  for (let layer = 0; layer < 3; layer++) {
    const positions = [], indices = [];
    for (let i = 0; i <= 180; i++) {
      const x = -76 + i * 1.25, z = -43 - layer * 17;
      const h = 4.5 + layer * 2.8 + Math.sin(x * .087 + layer * 1.7) * (2 + layer) + Math.sin(x * .37) * .68 + Math.sin(x * 1.6) * .16;
      positions.push(x, -7, z, x, h, z);
      if (i < 180) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
    mesh(g, new THREE.MeshBasicMaterial({ color: ['#638d81', '#7caaa0', '#9abbac'][layer], side: THREE.DoubleSide, fog: true }));
  }

  const windUniform = { value: 0 };
  const bark = material('#ffffff', { roughness: .98 });
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  let environmentSummary = { selectedModels: 0, placedInstances: 0, batches: 0 };
  let forestClearance = null;
  if (environmentAssets.models.size) {
    environmentSummary = populateEnvironment(scene, environmentAssets, { rng, groundHeight, lakeShape, pathZ, isClearing, streamedBatches, windUniform });
    // Real foliage at the entrances gives each animal something to emerge from.
    // Keep these clusters to the left of the final silhouette and away from Mosi.
    const entryTrees = [...environmentAssets.models.values()].find(model => model.kind === 'tree');
    const entryBush = [...environmentAssets.models.values()].find(model => model.kind === 'bush');
    const entryFern = environmentAssets.models.get('fern');
    const forestVegetation=forestEntryVegetation(groundHeight),forestEntries=forestVegetation.trees;
    for (const part of entryTrees?.parts ?? []) {const object=instances(part.geometry, part.material, forestEntries, { cast: true, receive: true });object.name='authored-forest-entries';object.userData.forestModel=entryTrees.id;}
    // Young crowns immediately below the long-neck lookout make its height
    // legible; the existing tall forest continues behind them.
    const canopyStand=forestVegetation.canopy;
    for (const part of entryTrees?.parts ?? []) {const object=instances(part.geometry,part.material,canopyStand,{cast:true,receive:true});object.name='authored-canopy-stand';object.userData.forestModel=entryTrees.id;}
    // The closed flight also looks east and south, beyond the walking-camera
    // corridor. Two shared instance pools fill those views with real crowns.
    // They sit behind every ground camera or beyond the eastern clearings;
    // no additional shadow pass is spent on this distant woodland.
    const flightForestRandom=seedRandom(7713),flightForest=[],flightTree=environmentAssets.models.get('tree-common-5')||entryTrees;
    for(const [startX,startZ,columns,rows,spacing]of [[67,34,8,4,10],[114,-34,4,6,9],[-66,-8,5,4,10]]){
      const stand=[];
      for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
        const x=startX+column*spacing+(flightForestRandom()-.5)*3,z=startZ+row*spacing+(flightForestRandom()-.5)*3;
        if(lakeShape(x,z)<1.4||Math.abs(z-pathZ(x))<7||isClearing(x,z))continue;
        const height=11+flightForestRandom()*7;stand.push({p:[x,groundHeight(x,z),z],s:[height,height,height],r:[0,flightForestRandom()*Math.PI*2,0],c:new THREE.Color().setScalar(.92+flightForestRandom()*.13)});
      }
      for(const part of flightTree?.parts??[]){const object=instances(part.geometry,part.material,stand);object.name=`authored-depth:${startX}:${startZ}`;object.userData.forestModel=flightTree.id;}
      flightForest.push(...stand);
    }
    const bushes=forestVegetation.bushes;
    for (const part of entryBush?.parts ?? []) {const object=instances(part.geometry, part.material, bushes, { receive: true });object.name='authored-forest-bushes';object.userData.forestModel=entryBush.id;}
    const ferns = [12, 25, 37].flatMap(x => [0, 1.7, 3.5].map(offset => {
      const z = x===37?-9.8:-3.2;
      return { p: [x - 12 + offset, groundHeight(x - 12 + offset, z), z], s: [1.2, 1.2, 1.2], r: [0, offset, 0] };
    }));
    for (const part of entryFern?.parts ?? []) {const object=instances(part.geometry, part.material, ferns, { receive: true });object.name='authored-entry-ferns';object.userData.forestModel='fern';}
    for(const [id,transforms]of Object.entries(forestFloorVegetation(groundHeight))){
      const model=environmentAssets.models.get(id);if(!model)continue;
      for(const part of model.parts){const object=instances(part.geometry,part.material,transforms,{receive:true});object.name=`authored-forest-floor:${id}`;object.userData.forestModel=id;}
      environmentSummary.placedInstances+=transforms.length;environmentSummary.batches+=model.parts.length;
    }
    environmentSummary.placedInstances += (entryTrees ? forestEntries.length+canopyStand.length+flightForest.length : 0) + (entryBush ? bushes.length : 0) + (entryFern ? ferns.length : 0);
    environmentSummary.batches += [entryTrees, entryBush, entryFern].filter(Boolean).length;
    // Small rounded trail pebbles are cheaper as a single shared primitive.
    const pebbles = [];
    for (let i = 0; i < 100; i++) {
      const x = rng() * 122 - 27, z = pathZ(x) + (rng() - .5) * 7;
      pebbles.push({ p: [x, groundHeight(x, z), z], s: [.06 + rng() * .10, .05, .07 + rng() * .11], r: [0, rng() * 6, 0], c: i % 2 ? '#acaa8d' : '#8a9077' });
    }
    instances(rockGeo, material('#ffffff'), pebbles, { receive: true });
    const stegoProbe=createDinosaur('stegosaurus'),riderProbe=createDinosaur('triceratops',{rider:true});
    const sweeps=firstForestSweeps({stegoBounds:stegoProbe.bounds,mosiBounds:riderProbe.bounds,terrainHeight:groundHeight});
    const clearanceStarted=performance.now();
    forestClearance=protectFirstForestPassage(scene,environmentAssets.models,sweeps,groundHeight);
    const sauropodProbe=createDinosaur('brachiosaurus');
    const sauropodSweeps=brontosaurusSweeps({bounds:sauropodProbe.bounds,scales:[adultScale.brachiosaurus,landscapeScale.brachiosaurus],terrainHeight:groundHeight,boardingOffset:canopyBoardingOffset});
    forestClearance.brontosaurus=protectFirstForestPassage(scene,environmentAssets.models,sauropodSweeps,groundHeight,{includeCrowns:true,keepClear:sweeps,area:[-140,46,-38,14]});
    sauropodProbe.dispose();
    forestClearance.elapsedMs=Math.round((performance.now()-clearanceStarted)*10)/10;
    stegoProbe.dispose();riderProbe.dispose();
  } else {
    // A failed offline download still leaves a playable forest.
  // Bark is sculpted into tapered, gently crooked trunks, rather than painted cylinders.
  function trunkGeometry() {
    const p = [], indices = [], count = 24, rings = 12;
    for (let j = 0; j <= rings; j++) {
      const y = j / rings;
      for (let k = 0; k <= count; k++) {
        const a = k / count * Math.PI * 2;
        const taper = (.92 - y * .53) + .55 * Math.exp(-y * 18);
        const ridge = 1 + Math.sin(a * 7 + y * .4) * .08 + Math.cos(a * 13 - y * 1.4) * .035;
        p.push(Math.cos(a) * taper * ridge + Math.sin(y * 3) * .12, y, Math.sin(a) * taper * ridge + Math.sin(y * 2) * .08);
        if (j < rings && k < count) { const v = j * (count + 1) + k; indices.push(v, v + count + 1, v + 1, v + 1, v + count + 1, v + count + 2); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
  }
  function leafGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .32, .10, -.20, .68, .13, -.16, 1, .055, 0, .68, .13, .16, .32, .10, .20, .48, .17, 0], 3));
    g.setIndex([0, 1, 6, 1, 2, 6, 2, 3, 6, 3, 4, 6, 4, 5, 6, 5, 0, 6]); g.computeVertexNormals(); return g;
  }
  const branchGeometry = new THREE.CylinderGeometry(.5, 1, 1, 7);
  const trunks = [], branches = [], barkStrips = [], leaves = [], rootSegments = [];
  const treeColors = ['#70634b', '#756247', '#5c5947', '#716949'];
  const leafColors = ['#3b664b', '#527c50', '#678e54', '#83a564', '#9eac6b'];
  const treePositions = [];
  for (let i = 0; i < 224; i++) {
    const x = rng() * 154 - 46, z = rng() * 83 - 56;
    // The whole camera corridor stays clear: no trunk can eclipse a featured animal.
    if (z > -8) continue;
    if (lakeShape(x, z) < 1.24) continue;
    const h = 11 + rng() * 12, radius = .38 + rng() * .56, y = groundHeight(x, z), angle = rng() * 6.28;
    treePositions.push({ x, y, z, h, radius });
    trunks.push({ p: [x, y, z], s: [radius, h, radius], r: [0, angle, (rng() - .5) * .035], c: treeColors[i % treeColors.length] });
    // Fine bark ridges catch the grazing sunlight along the nearer trunks.
    if (z > -25) for (let j = 0; j < 5; j++) {
      const a = j / 5 * 6.28 + angle, r = radius * .79;
      barkStrips.push({ p: [x + Math.cos(a) * r, y + h * .23, z + Math.sin(a) * r], s: [.025 + radius * .027, h * .48, .033], r: [.015 * Math.cos(a), a, .013 * Math.sin(a)], c: j % 2 ? '#917654' : '#494d3c' });
    }
    for (let j = 0; j < 5; j++) {
      const a = angle + j * Math.PI * .4, y0 = y + h * (.62 + j * .045), reach = 2.3 + rng() * 2.2;
      const a0 = [x, y0, z], a1 = [x + Math.cos(a) * reach * .6, y0 + h * .11, z + Math.sin(a) * reach * .6];
      const a2 = [x + Math.cos(a) * reach, y0 + h * .12, z + Math.sin(a) * reach];
      branches.push(segment(a0, a1, radius * .40, '#6c6649'), segment(a1, a2, radius * .22, '#6f7050'));
      for (let k = 0; k < 19; k++) {
        const la = a + (rng() - .5) * 3.3, spread = rng() * 2.3;
        leaves.push({ p: [a2[0] + Math.cos(la) * spread, a2[1] + (rng() - .5) * 1.15, a2[2] + Math.sin(la) * spread], s: [1.4 + rng() * 1.6, 1.2, 1.6 + rng()], r: [(rng() - .5) * .5, la, (rng() - .5) * .35], c: leafColors[(j + k) % leafColors.length] });
      }
    }
    if (z > -25) for (let j = 0; j < 5; j++) {
      const a = angle + j * 1.256, r = radius * (2.5 + rng() * 1.8);
      const a0 = [x, y + radius, z], a1 = [x + Math.cos(a) * r * .55, y + .13, z + Math.sin(a) * r * .55];
      const a2 = [x + Math.cos(a) * r, groundHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) + .05, z + Math.sin(a) * r];
      rootSegments.push(segment(a0, a1, radius * .31, '#645d43'), segment(a1, a2, radius * .19, '#726747'));
    }
  }
  instances(trunkGeometry(), bark, trunks, { cast: true, receive: true });
  instances(branchGeometry, bark, branches, { cast: true });
  instances(new THREE.CylinderGeometry(.55, 1, 1, 5), bark, rootSegments, { cast: true, receive: true });
  instances(new THREE.CylinderGeometry(.5, 1, 1, 4), bark, barkStrips);
  const canopyMaterial = material('#ffffff', { side: THREE.DoubleSide, roughness: .91 });
  // One inexpensive vertex shader makes the many thousands of leaves breathe together.
  canopyMaterial.onBeforeCompile = shader => {
    shader.uniforms.uWind = windUniform;
    shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += sin(uWind*.8 + instanceMatrix[3].x*.23 + instanceMatrix[3].z*.19) * .085 * position.x; transformed.y += sin(uWind*.65 + instanceMatrix[3].z*.3) * .05 * position.x;');
  };
  instances(leafGeometry(), canopyMaterial, leaves, { cast: true });
  const understoryLeaves = [];
  for (let i = 0; i < 76; i++) {
    const x = rng() * 140 - 32, z = -13 - rng() * 23;
    if (lakeShape(x, z) < 1.2) continue;
    const height = .7 + rng() * 2.4;
    for (let j = 0; j < 34; j++) {
      const a = rng() * Math.PI * 2, reach = rng() * 2.2;
      understoryLeaves.push({ p: [x + Math.cos(a) * reach, groundHeight(x, z) + height * (.35 + rng() * .65), z + Math.sin(a) * reach], s: [1.2 + rng() * 1.5, 1.4, 1.7], r: [(rng() - .5) * .6, a, (rng() - .5) * .65], c: ['#32624d', '#477752', '#648b57', '#7e9c66'][j % 4] });
    }
  }
  instances(leafGeometry(), canopyMaterial, understoryLeaves, { cast: true });

  // Giant tree ferns and feathery undergrowth. Each plant is one sculpted mesh instance.
  function fernGeometry() {
    const p = [];
    const add = (a, b, c) => p.push(...a, ...b, ...c);
    for (let frond = 0; frond < 8; frond++) {
      const angle = frond * Math.PI / 4, forward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const side = new THREE.Vector3(-forward.z, 0, forward.x);
      const point = t => new THREE.Vector3(forward.x * t * 1.6, Math.sin(t * Math.PI * .85) * 1.04 + .06, forward.z * t * 1.6);
      for (let j = 1; j < 10; j++) {
        const t = j / 10, base = point(t), next = point(t + .09), width = (.28 - t * .18);
        for (const sign of [-1, 1]) {
          const outer = base.clone().addScaledVector(side, width * sign).addScaledVector(forward, .10);
          outer.y += .025;
          const tip = base.clone().addScaledVector(side, width * sign * 1.35).addScaledVector(forward, .27 - .14 * t);
          tip.y -= .035;
          add(base.toArray(), outer.toArray(), tip.toArray()); add(base.toArray(), tip.toArray(), next.toArray());
        }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
  }
  const fernGeo = fernGeometry(), fernTransforms = [], tallFerns = [], tallFernTrunks = [];
  for (let i = 0; i < 860; i++) {
    const x = rng() * 148 - 40, z = rng() * 59 - 33;
    if (isPath(x, z) || isClearing(x, z) || lakeShape(x, z) < 1.06) continue;
    const s = .33 + rng() * .55;
    fernTransforms.push({ p: [x, groundHeight(x, z), z], s: [s, s, s], r: [0, rng() * 6.28, 0], c: ['#588658', '#81a264', '#47754f', '#90af6d'][i % 4] });
  }
  for (let i = 0; i < 32; i++) {
    const x = rng() * 120 - 24, z = -8 - rng() * 18;
    if (lakeShape(x, z) < 1.2) continue;
    const h = 2.3 + rng() * 2.3;
    tallFerns.push({ p: [x, h, z], s: [1.6, .8, 1.6], r: [0, rng() * 6, 0], c: '#68975f' });
    tallFernTrunks.push({ p: [x, groundHeight(x, z), z], s: [.16, h, .16], c: '#686443' });
  }
  const fernMat = material('#ffffff', { side: THREE.DoubleSide });
  instances(fernGeo, fernMat, fernTransforms, { receive: true });
  instances(fernGeo, fernMat, tallFerns);
  instances(trunkGeometry(), bark, tallFernTrunks, { cast: true });
  const broadLeaves = [];
  for (let i = 0; i < 110; i++) {
    const x = rng() * 127 - 27, z = rng() * 40 - 16;
    if (isPath(x, z) || isClearing(x, z) || lakeShape(x, z) < 1.12) continue;
    for (let j = 0; j < 7; j++) broadLeaves.push({ p: [x, groundHeight(x, z) + .15, z], s: [1 + rng() * .75, 2, 1.6], r: [0, j * .897 + i, .3 + rng() * .4], c: j % 2 ? '#44785b' : '#6d9b67' });
  }
  instances(leafGeometry(), fernMat, broadLeaves, { receive: true });

  // Broken stone, fallen timber, mushrooms, and little things close to the trail.
  const rockPositions = rockGeo.attributes.position;
  for (let i = 0; i < rockPositions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(rockPositions, i), factor = .94 + Math.sin(v.x * 8 + v.y * 5 - v.z * 3) * .075;
    rockPositions.setXYZ(i, v.x * factor, v.y * factor * .7, v.z * factor);
  }
  rockGeo.computeVertexNormals();
  const rocks = [], pebbles = [], capTransforms = [], stems = [], capDots = [], logs = [];
  const capGeo = new THREE.LatheGeometry([new THREE.Vector2(.05, .26), new THREE.Vector2(.20, .22), new THREE.Vector2(.38, .11), new THREE.Vector2(.43, .035), new THREE.Vector2(.4, -.01), new THREE.Vector2(.1, .05)], 14);
  for (let i = 0; i < 132; i++) {
    const x = rng() * 126 - 27, z = rng() * 42 - 19;
    if (isPath(x, z) || isClearing(x, z) || lakeShape(x, z) < .94) continue;
    const s = .4 + rng() * 1.1;
    rocks.push({ p: [x, groundHeight(x, z) + .17, z], s: [s * 1.3, s, s], r: [.1, rng() * 6, rng() * .2], c: ['#87978a', '#697d70', '#9da58c'][i % 3] });
    if (i % 3 === 0) for (let j = 0; j < 3; j++) {
      const mx = x + .5 + rng() * .6, mz = z + rng() * .7, h = .3 + rng() * .22, g = groundHeight(mx, mz), r = .65 + rng() * .7;
      stems.push({ p: [mx, g + h / 2, mz], s: [.055 * r, h, .055 * r] });
      capTransforms.push({ p: [mx, g + h, mz], s: [r, r, r], c: j % 2 ? '#ddac78' : '#c28659' });
      for (let k = 0; k < 3; k++) { const a = k * 2.1; capDots.push({ p: [mx + Math.cos(a) * r * .22, g + h + r * .18, mz + Math.sin(a) * r * .22], s: [.035 * r, .025, .035 * r] }); }
    }
  }
  for (let i = 0; i < 140; i++) {
    const x = rng() * 122 - 27, z = pathZ(x) + (rng() - .5) * 8;
    pebbles.push({ p: [x, groundHeight(x, z), z], s: [.06 + rng() * .11, .06, .07 + rng() * .12], r: [0, rng() * 6, 0], c: i % 2 ? '#a49b74' : '#8a896b' });
  }
  for (const [x, z, len, a] of [[-8, -7, 4, .7], [18, -8, 5, 1.4], [32, 11, 3.8, .2], [74, 7, 4, 1.8]]) {
    logs.push({ p: [x, groundHeight(x, z) + .4, z], s: [.46, len, .46], r: [Math.PI / 2, a, 0], c: '#74634a' });
  }
  instances(rockGeo, material('#ffffff'), rocks, { cast: true, receive: true });
  instances(rockGeo, material('#ffffff'), pebbles, { receive: true });
  instances(new THREE.CylinderGeometry(1, 1.1, 1, 7), material('#e7d7ad'), stems);
  instances(capGeo, material('#ffffff'), capTransforms);
  instances(new THREE.SphereGeometry(1, 5, 4), material('#f3ddac'), capDots);
  instances(new THREE.CylinderGeometry(.83, 1, 1, 12), bark, logs, { cast: true, receive: true });

  }

  // Shallow oval lake with animated reflection bands and a bright, irregular shoreline.
  const lake = new THREE.Group(); lake.position.set(64, -.045, -10); scene.add(lake);
  const waterPositions = [], waterUvs = [], waterIndices = [], rings = 16, segments = 112;
  for (let r = 0; r <= rings; r++) for (let k = 0; k <= segments; k++) {
    const a = k / segments * Math.PI * 2, radius = r / rings, edge = 1 + Math.sin(a * 5) * .018 + Math.sin(a * 9 + .6) * .009;
    waterPositions.push(Math.cos(a) * radius * 17 * edge, 0, Math.sin(a) * radius * 11 * edge); waterUvs.push((Math.cos(a) * radius + 1) / 2, (Math.sin(a) * radius + 1) / 2);
    if (r < rings && k < segments) { const i = r * (segments + 1) + k; waterIndices.push(i, i + 1, i + segments + 1, i + 1, i + segments + 2, i + segments + 1); }
  }
  const waterGeo = new THREE.BufferGeometry(); waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3)); waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(waterUvs, 2)); waterGeo.setIndex(waterIndices); waterGeo.computeVertexNormals();
  const waterTime = { value: 0 }, waterFeet = { value: new THREE.Vector3(0, 0, 0) };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { time: waterTime, feet: waterFeet, fogColor: { value: scene.fog.color }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far } }, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    vertexShader: 'uniform float time; varying vec2 vUv; varying vec3 vWorld; varying float vDepth; void main(){vUv=uv;vec3 p=position;float shore=1.-smoothstep(.88,1.,length((uv-.5)*2.));p.y+=(sin(p.x*.8+time*.75)*cos(p.z*.6-time*.35)*.035)*shore;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;vec4 mv=viewMatrix*world;vDepth=-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader: `uniform float time;uniform vec3 feet;uniform vec3 fogColor;uniform float fogNear;uniform float fogFar;varying vec2 vUv;varying vec3 vWorld;varying float vDepth;
      float hash(float x){return fract(sin(x*127.1)*43758.5453);}
      float waterNoise(vec2 p){vec2 cell=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);float n=dot(cell,vec2(1.,157.));return mix(mix(hash(n),hash(n+1.),f.x),mix(hash(n+157.),hash(n+158.),f.x),f.y);}
      void main(){vec2 p=vUv-.5;float r=length(p*2.);float shore=smoothstep(.52,1.,r);
      float drift=waterNoise(vWorld.xz*.33+vec2(time*.025,-time*.035));
      float detail=waterNoise(vWorld.xz*.85+vec2(-time*.05,time*.02));
      float wave=sin(vWorld.x*1.65+vWorld.z*3.7+(drift-.5)*7.5-time*.85);
      float little=sin(vWorld.x*6.3-vWorld.z*7.4+detail*5.+time*.45);
      vec3 normal=normalize(vec3(wave*.035+little*.018,1.,cos(vWorld.z*2.2+drift*3.-time*.5)*.04));
      vec3 viewDirection=normalize(cameraPosition-vWorld);float fresnel=pow(1.-max(0.,dot(normal,viewDirection)),3.);
      vec3 col=mix(vec3(.045,.26,.34),vec3(.22,.47,.39),shore*.88);col=mix(col,vec3(.53,.70,.72),fresnel*.68);
      float reflection=step(.55,hash(floor(vUv.x*34.+wave*.16)))*(1.-smoothstep(.24,.66,vUv.y))*.24;col-=vec3(.10,.17,.13)*reflection;
      float shimmer=pow(max(0.,wave*.62+little*.18+detail*.2),6.)*(.12+smoothstep(.42,.76,drift)*.88);
      float sunPath=exp(-pow((vUv.x-.47-sin(vUv.y*8.+time*.2)*.025)*7.,2.));
      float sunGlint=pow(max(0.,dot(reflect(normalize(vec3(.42,-.82,-.38)),normal),viewDirection)),42.);
      col+=vec3(.69,.79,.69)*(shimmer*(.12+sunPath*.30)+sunGlint*.38);
      float shoreBreak=sin(vWorld.x*3.1+sin(vWorld.z*4.7)+time*.38)*.006;
      float foamEdge=1.-smoothstep(.005,.023,abs(r-.985-shoreBreak));
      float foamRibbon=1.-smoothstep(.003,.012,abs(r-.946-sin(time*.35+vWorld.x)*.005));
      float foamGaps=.42+.58*smoothstep(-.5,.65,sin(vWorld.x*2.5+vWorld.z*2.8));
      col=mix(col,vec3(.52,.64,.49),foamEdge*.36*foamGaps);
      col+=vec3(.30,.43,.35)*foamRibbon*.12;
      col+=vec3(.31,.28,.14)*smoothstep(.987,1.,r)*.28;
      vec2 contact=vWorld.xz-feet.xy;float nearFeet=exp(-dot(contact/vec2(3.3,1.35),contact/vec2(3.3,1.35))*1.5)*feet.z;
      col*=1.-nearFeet*.58;
      for(int side=-1;side<=1;side+=2){vec2 fp=contact-vec2(-.45,float(side)*.63);float d=length(fp/vec2(1.35,1.));float wake=pow(max(0.,sin(d*13.-time*2.4)),14.)*exp(-d*1.1)*smoothstep(.12,.35,d)*feet.z;col+=vec3(.37,.58,.48)*wake*.55;}
      float fog=smoothstep(fogNear,fogFar,vDepth);float alpha=mix(.39,.24,shore)+fresnel*.22+shimmer*.045+sunGlint*.06+foamEdge*.12;gl_FragColor=vec4(mix(col,fogColor,fog),clamp(alpha,.22,.60));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
  });
  const waterSurface = mesh(waterGeo, waterMat, lake); waterSurface.name='Clear lake surface'; waterSurface.userData.touchKind='water';waterSurface.renderOrder=2;
  // A single light pattern conforms to the real bed, below the swimming fish.
  // It adds depth cues without screen-space refraction, extra textures or a
  // fullscreen postprocessing pass on phones.
  const causticGeo=waterGeo.clone(),causticPositions=causticGeo.attributes.position;
  for(let i=0;i<causticPositions.count;i++){const x=causticPositions.getX(i)+64,z=causticPositions.getZ(i)-10;causticPositions.setY(i,groundHeight(x,z)+.025-lake.position.y);}
  const causticMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    uniforms:{time:waterTime,fogNear:{value:scene.fog.near},fogFar:{value:scene.fog.far}},
    vertexShader:'varying vec3 vWorld;varying float vDepth;void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vec4 mv=viewMatrix*world;vDepth=-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader:`uniform float time;uniform float fogNear;uniform float fogFar;varying vec3 vWorld;varying float vDepth;
      void main(){float submerged=1.-smoothstep(-.18,-.055,vWorld.y);float a=sin(vWorld.x*2.1+sin(vWorld.z*1.7+time*.39));float b=sin(vWorld.z*2.4+cos(vWorld.x*1.6-time*.31));float caustic=pow(max(0.,1.-abs(a+b)*1.65),7.);float fade=1.-smoothstep(fogNear,fogFar,vDepth);gl_FragColor=vec4(.42,.65,.48,caustic*submerged*fade*.15);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const bedLight=mesh(causticGeo,causticMat,lake);bedLight.name='Light ripples on the lake bed';bedLight.userData.noWorldTouch=true;bedLight.renderOrder=1;
  const reeds = [], reedHeads = [], shoreRocks = [];
  for (let i = 0; i < 180; i++) {
    const a = rng() * Math.PI * 2, r = .97 + rng() * .1, x = 64 + Math.cos(a) * 17 * r, z = -10 + Math.sin(a) * 11 * r;
    if (z > -1 && x > 50 && x < 76) continue;
    const y = groundHeight(x, z), h = .65 + rng() * .8;
    reeds.push({ p: [x, y + h / 2, z], s: [.018, h, .018], r: [(rng() - .5) * .2, 0, (rng() - .5) * .2], c: '#82945c' });
    reedHeads.push({ p: [x, y + h, z], s: [.035, .17, .035] });
    if (i % 4 === 0) shoreRocks.push({ p: [x, y + .12, z], s: [.4 + rng() * .4, .3, .4], r: [0, a, .1], c: '#859b8e' });
  }
  instances(new THREE.CylinderGeometry(.5, 1, 1, 4), material('#ffffff'), reeds);
  instances(new THREE.CapsuleGeometry(1, 1, 2, 5), material('#8b7350'), reedHeads);
  instances(rockGeo, material('#ffffff'), shoreRocks, { cast: true });
  const rippleRings = [];
  for (let i = 0; i < 6; i++) {
    const object = mesh(new THREE.TorusGeometry(.8 + i % 3 * .35, .009, 3, 52), new THREE.MeshBasicMaterial({ color: '#b8d2b7', transparent: true, opacity: .19, depthWrite: false }), scene, [55 + rng() * 16, -.006, -14 + rng() * 13]);
    object.rotation.x = -Math.PI / 2; rippleRings.push(object);
  }

  // Dust lit by the shafts of sun, small birds above the canopy, and layered mist.
  const pollenPositions = new Float32Array(150 * 3), pollenSeeds = [];
  for (let i = 0; i < 150; i++) pollenSeeds.push({ x: rng() * 40 - 20, y: .6 + rng() * 13, z: rng() * 28 - 16, phase: rng() * 6 });
  const pollenGeo = new THREE.BufferGeometry(); pollenGeo.setAttribute('position', new THREE.BufferAttribute(pollenPositions, 3));
  const pollenMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { opacity: { value: .68 } },
    vertexShader: 'varying float vFade;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vFade=clamp(1.+mv.z/65.,0.,1.);gl_PointSize=clamp(55./-mv.z,1.,4.);gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'varying float vFade;uniform float opacity;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(1.,.89,.53,a*vFade*opacity);}' });
  const pollen = new THREE.Points(pollenGeo, pollenMat); scene.add(pollen);
  const sunShafts = new THREE.Group(); scene.add(sunShafts);
  const shaftMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;void main(){float fade=pow(max(0.,1.-abs(vUv.x-.5)*2.),2.)*sin(vUv.y*3.14159);gl_FragColor=vec4(.78,.68,.37,fade*.033);}' });
  for (let i = 0; i < 7; i++) { const shaft = mesh(new THREE.PlaneGeometry(.8 + i * .3, 17), shaftMat, sunShafts, [-12 + i * 5.4, 9, -9 - i % 3 * 4]); shaft.rotation.z = -.25; shaft.rotation.y = .2; }
  const birdGeometry = new THREE.BufferGeometry(); birdGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.6, .2, 0, 0, 0, 0, .6, .2, 0], 3));
  const birds = [];
  for (let i = 0; i < 9; i++) { const bird = new THREE.Line(birdGeometry, new THREE.LineBasicMaterial({ color: '#526f70', transparent: true, opacity: .55 })); bird.position.set(45 + i * 3, 18 + rng() * 8, -35 - rng() * 9); bird.scale.setScalar(.45 + rng() * .35); scene.add(bird); birds.push(bird); }

  const worldTouchTargets=[];scene.traverse(object=>{if(object.isMesh&&object!==sky&&object.parent!==sunShafts&&!object.userData.noWorldTouch)worldTouchTargets.push(object);});
  const touchFeedback=createWorldTouchFeedback({scene,groundHeight,waterY:-.045});
  // Models are shared with the species illustrations and are articulated by their factory.
  const mosi = createDinosaur('triceratops', { rider: true });
  scene.add(mosi.group); mosi.group.position.set(2.6, 0, 3.6); mosi.group.rotation.y = -.15;
  mosi.group.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  function addInteraction(model, id) {
    // Model bounds are local: using a rotated world box would turn the wing hitbox sideways.
    const box = model.bounds.clone(), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(center); hit.scale.set(Math.max(2, size.x * 1.08), Math.max(2, size.y * 1.15), Math.max(1.4, size.z * 1.08)); hit.userData.id = id;
    model.group.add(hit); interactive.push(hit); return hit;
  }
  addInteraction(mosi, 'mosi');
  const rides=createCinematicRides({scene,mosi,onEvent:event=>{if(event.type==='landed'&&event.kind==='flight')flightStartTime=elapsed;if(!disposed)onActivityEvent(event);}});
  function createHabitatTree({height=8}={}){
    const model=environmentAssets.models.get('tree-common-3')||[...environmentAssets.models.values()].find(entry=>entry.kind==='tree'&&!/pine/i.test(entry.id));
    if(!model)return null;
    const tree=new THREE.Group();tree.name='Imported living discovery tree';tree.scale.setScalar(height);
    for(const part of model.parts){const object=new THREE.Mesh(part.geometry,part.material);object.name=`habitat:${model.id}`;object.castShadow=true;object.receiveShadow=true;object.userData.touchKind='tree';object.userData.habitatTree=tree;tree.add(object);worldTouchTargets.push(object);}
    return tree;
  }
  function createHabitatAsset({kind,height=1,variant=0}={}){
    const candidates=kind==='rock'?[...environmentAssets.models.values()].filter(model=>model.kind==='rock').sort((a,b)=>a.id.localeCompare(b.id)):[environmentAssets.models.get(kind)].filter(Boolean);
    if(!candidates.length)return null;
    const index=((Math.trunc(Number(variant)||0)%candidates.length)+candidates.length)%candidates.length,model=candidates[index];
    const asset=new THREE.Group();asset.name=`Imported discovery ${kind}`;asset.scale.setScalar(Math.max(.05,Number.isFinite(height)?height:1));asset.userData.sharedHabitatAsset=true;
    const touchKind=kind==='rock'?'rock':'grass';
    for(const part of model.parts){const object=new THREE.Mesh(part.geometry,part.material);object.name=`habitat:${model.id}`;object.castShadow=kind==='rock';object.receiveShadow=true;object.userData.touchKind=touchKind;object.userData.habitatGroup=asset;asset.add(object);worldTouchTargets.push(object);}
    return asset;
  }
  const discoveries = createWorldDiscoveries({ scene, groundHeight, createHabitatTree, createHabitatAsset, onDiscovery: event => {
    if (!paused && !document.hidden && !arrival) onDiscovery(event);
  } });
  function cancelInspection() {
    inspection = null;
    if (inspectionResolve) { inspectionResolve({ completed: false, cancelled: true }); inspectionResolve = null; }
  }
  function setActivity(options) {
    if (disposed || arrival || !options || options.species !== view.species) return Promise.resolve({ completed: false, cancelled: true });
    cancelInspection(); activityOptions={...options};
    const discoveryReady=discoveries.setActivity(options);
    const rideReady=rides.start({species:options.species,animal:activeCreature,completed:options.completed||options.foundTargets?.length===3,restingPose:activeCreature?encounterPose(options.species,activeCreature):null});
    if(!['brachiosaurus','pteranodon'].includes(options.species))return discoveryReady;
    return Promise.all([discoveryReady,rideReady]).then(results=>results.every(result=>result.completed)?{completed:true,cancelled:false}:{completed:false,cancelled:true});
  }
  function updateActivityProgress(options={}){if(!activityOptions)return;activityOptions={...activityOptions,...options};discoveries.setActivity(activityOptions);}
  function clearActivity() { activityOptions=null;rideContext=null;rideAttentionAge=null;rides.cancel();discoveries.clearActivity();explorationPan.set(0,0);explorationPanTarget.set(0,0); }
  function finishActivityRide(){
    // A treetop side look must not become the ground shot after reseating.
    // Damping recenters during the descent; the active ride camera never jumps.
    explorationPanTarget.set(0,0);rideAttentionAge=null;
    return rides.finish();
  }
  function replayActivityRide(){if(!activityOptions||!activeCreature)return Promise.resolve({completed:false,cancelled:true});explorationPanTarget.set(0,0);return rides.start({species:activityOptions.species,animal:activeCreature,replay:true,restingPose:encounterPose(activityOptions.species,activeCreature)});}
  function getActivityState(){return rides.getState();}
  function panExploration(dx,dy){if(disposed||paused||document.hidden||!discoveries.isActive()||rides.getState().busy)return false;const gain=explorationPanLimits.yaw>.6?1.1:.8,verticalGain=explorationPanLimits.pitch>.25?.8:.5;rideAttentionAge=null;explorationPanTarget.x=clamp(explorationPanTarget.x-dx/Math.max(320,viewport.width)*gain,-explorationPanLimits.yaw,explorationPanLimits.yaw);explorationPanTarget.y=clamp(explorationPanTarget.y+dy/Math.max(320,viewport.height)*verticalGain,-explorationPanLimits.pitch,explorationPanLimits.pitch);return true;}
  function focusDiscovery(id) {
    if (disposed || paused || arrival) return Promise.resolve({ completed: false, cancelled: true });
    explorationPanTarget.set(0,0);
    if(rides.getState().phase==='exploring'){rideAttentionAge=0;explorationPanTarget.set(0,0);}
    return discoveries.focusDiscovery(id);
  }
  function activateDiscovery(id) { return !disposed && !paused && !document.hidden && !arrival && discoveries.activateDiscovery(id); }
  function getDiscoveryScreenPositions() { return discoveries.getScreenPositions(); }
  function inspectAnimal(species = view.species) {
    if (disposed || paused || arrival || discoveries.isActive()) return Promise.resolve({ completed: false, cancelled: true });
    const animal = species === 'mosi' || species === 'triceratops' ? mosi : species === view.species ? activeCreature : null;
    if (!animal?.group.visible) return Promise.resolve({ completed: false, cancelled: true });
    cancelInspection(); inspection = { animal, age: 0 };
    return new Promise(resolve => { inspectionResolve = resolve; });
  }
  function creatureFor(species) {
    if (!creatures.has(species)) {
      const model = createDinosaur(species, { rider: false });
      const anchor = route[species];
      model.group.position.set(anchor - 2.2, modelYOffset[species] || 0, species === 'pteranodon' ? -6 : -3.7);
      model.group.rotation.y = species === 'pteranodon' ? -Math.PI / 2 : -.08;
      scene.add(model.group);
      addInteraction(model, species);
      model.group.traverse(o => { if (o.isMesh) { if (species === 'pteranodon') o.castShadow = false; o.receiveShadow = true; } });
      model.group.scale.setScalar(adultScale[species]); model.group.visible = false;
      creatures.set(species, model);
    }
    return creatures.get(species);
  }
  const celebrationPositions = new Float32Array(90 * 3), celebrationSeeds = [];
  for (let i = 0; i < 90; i++) celebrationSeeds.push({ x: (rng() - .5) * 14, y: rng() * 7, z: rng() * 4, speed: .8 + rng(), phase: rng() * 6 });
  const celebrationGeo = new THREE.BufferGeometry(); celebrationGeo.setAttribute('position', new THREE.BufferAttribute(celebrationPositions, 3));
  const celebrationMat = new THREE.PointsMaterial({ color: '#ffe296', size: .065, transparent: true, depthWrite: false });
  const celebration = new THREE.Points(celebrationGeo, celebrationMat); celebration.visible = false; scene.add(celebration);

  function encounterPose(species, model) {
    if(species==='stegosaurus')return{position:new THREE.Vector3(FIRST_FOREST_LAYOUT.animal[0],groundHeight(...FIRST_FOREST_LAYOUT.animal),FIRST_FOREST_LAYOUT.animal[1]),yaw:FIRST_FOREST_LAYOUT.animalYaw,scale:viewport.portrait?adultScale[species]:landscapeScale[species]};
    const flying = species === 'pteranodon';
    const portraitOffset = species === 'brachiosaurus' ? 2.9 : species === 'spinosaurus' ? 2.1 : model.group.userData.assetSource ? 2.3 : 1.2;
    return {
      position: new THREE.Vector3(route[species] - (flying ? (viewport.portrait ? .2 : -.2) : viewport.portrait ? portraitOffset : 2.2),
        flying ? (viewport.portrait ? 7.7 : 6.4) : ['spinosaurus', 'parasaurolophus'].includes(species) ? .08 : 0,
        flying ? -6 : viewport.portrait ? -1.5 : -.6),
      yaw: flying ? -Math.PI / 3 : viewport.portrait ? -.32 : -.08,
      scale: viewport.portrait ? adultScale[species] : landscapeScale[species],
    };
  }
  function arrivalEvent(type, state = arrival) {
    if (!state) return;
    // A missing sound must never interrupt the physical scene progression.
    const screen = activeCreature?.group.position.clone().project(camera);
    try { onArrivalEvent({ type, species: state.track.species, progress: clamp(state.age / state.track.duration, 0, 1), pan: clamp(screen?.x ?? 0, -1, 1) }); } catch { /* optional consumer */ }
  }
  function cancelArrival(reason = 'scene-change') {
    if (!arrival) return;
    const cancelled = arrival; arrival = null;
    lastArrival = { id: cancelled.id, species: cancelled.track.species, phase: 'cancelled', reason, progress: cancelled.age / cancelled.track.duration };
    cancelled.resolve({ completed: false, cancelled: true });
  }
  function beginArrival() {
    if (!activeCreature) return;
    const pose = encounterPose(view.species, activeCreature);
    const startCamera = camera.clone();
    cameraPlan();
    const endCamera = camera.clone(); endCamera.position.copy(cameraDesired); endCamera.lookAt(cameraTarget); endCamera.updateMatrixWorld(true);
    const track = createArrivalTrack({ species: view.species, goal: pose.position, finalYaw: pose.yaw,
      bounds: activeCreature.bounds, scale: pose.scale, cameras: [startCamera, endCamera],
      terrainHeight: groundHeight,
    });
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    arrival = { id: ++arrivalSequence, track, age: 0, promise, resolve,
      nextStep: track.cueDuration + .15, nextWing: track.cueDuration + .8, sample: track.sample(0), lastWalkPhase: null, lastWingPhase: null };
    // Set the full-size model outside both camera frustums before revealing it.
    activeCreature.group.position.copy(arrival.sample.position);
    activeCreature.group.scale.setScalar(pose.scale);
    activeCreature.group.rotation.set(0, arrival.sample.heading, 0);
    activeCreature.group.visible = true;
    arrivalEvent('foreshadow');
  }
  function arrive(next = {}) {
    setView({ ...next, mode: 'arrival' });
    return arrival?.promise ?? Promise.resolve({ completed: false, cancelled: true });
  }
  function motionEvents(state, model, sample) {
    const motion = model.getMotionState?.();
    const crossed = (previous, current, marker) => previous !== null && (current >= previous
      ? marker > previous && marker <= current
      : marker > previous || marker <= current);
    if (!state.track.flying && sample.walking > .25) {
      if (Number.isFinite(motion?.walkPhase)) {
        const markers = motion.footfallPhases ?? (state.track.species === 'brachiosaurus' ? [0, .22, .5, .72] : [0, .5]);
        for (const marker of markers) if (crossed(state.lastWalkPhase, motion.walkPhase, marker)) arrivalEvent('step', state);
        state.lastWalkPhase = motion.walkPhase;
      } else if (state.age >= state.nextStep) {
        arrivalEvent('step', state); state.nextStep = state.age + .55;
      }
    } else state.lastWalkPhase = motion?.walkPhase ?? null;
    if (state.track.flying && sample.glide < .72 && state.age >= state.track.cueDuration) {
      if (Number.isFinite(motion?.wingPhase)) {
        if (crossed(state.lastWingPhase, motion.wingPhase, .5)) arrivalEvent('wing', state);
        state.lastWingPhase = motion.wingPhase;
      } else if (state.age >= state.nextWing) {
        arrivalEvent('wing', state); state.nextWing = state.age + 1.15;
      }
    }
  }

  function setView(next = {}) {
    const previous = view;
    const previousCreature = activeCreature;
    cancelArrival();
    view = { ...view, ...next };
    if (!['forest', 'lake', 'sky'].includes(view.biome)) view.biome = 'forest';
    if (!['intro', 'travel', 'arrival', 'encounter', 'complete'].includes(view.mode)) view.mode = 'encounter';
    if (view.species && !(view.species in route)) view.species = null;
    if (previous.species !== view.species || previous.biome !== view.biome || previous.mode !== view.mode) {
      cancelInspection(); clearActivity();
    }
    station = view.species ? route[view.species] : view.biome === 'forest' ? 0 : 64;
    activeCreature = view.species ? creatureFor(view.species) : null;
    if (previousCreature && previousCreature !== activeCreature) {
      if (previousCreature.group.visible && view.mode !== 'intro') leavingCreatures.add(previousCreature);
      else previousCreature.group.visible = false;
    }
    if (activeCreature) leavingCreatures.delete(activeCreature);
    if (activeCreature) activeCreature.group.visible = ['encounter', 'complete'].includes(view.mode);
    if (view.mode === 'intro') {
      station = 0;
      for (const model of leavingCreatures) model.group.visible = false;
      leavingCreatures.clear();
    }
    if (view.mode === 'arrival') beginArrival();
    // Travel follows the same trail; camera and rider ease into the next clearing.
    if (previous.mode === 'intro' && view.mode === 'travel') currentWalking = .65;
  }
  function cameraPlan() {
    const portrait = viewport.portrait, isSky = view.biome === 'sky' || view.species === 'pteranodon';
    const encounter = ['arrival', 'encounter', 'complete'].includes(view.mode);
    const riderOffset = portrait ? (view.species==='brachiosaurus'?4.1:1.1) : 6.2;
    const anchor = mosi.group.position.x - riderOffset;
    const tall = view.species === 'brachiosaurus' && encounter;
    actorTarget.set(station + riderOffset, 0, portrait ? 1.4 : 2);
    const firstForest=view.species==='stegosaurus';
    if(firstForest)actorTarget.set(FIRST_FOREST_LAYOUT.mosi[0],groundHeight(...FIRST_FOREST_LAYOUT.mosi),FIRST_FOREST_LAYOUT.mosi[1]);
    if (view.mode === 'intro') {
      actorTarget.set(2.4, 0, 3.6);
      cameraDesired.set(portrait ? 4.3 : 8.8, portrait ? 5.5 : 4.9, portrait ? 20 : 15.2);
      cameraTarget.set(portrait ? 1.9 : 1, portrait ? 2.1 : 2.15, .5);
    } else {
      const distance = portrait ? 21 : 19.8;
      cameraDesired.set(anchor + (portrait ? 3.5 : 4.5), portrait ? 5.8 : 6.4, distance);
      cameraTarget.set(anchor - (encounter ? (portrait ? 2.1 : .4) : -.4), portrait ? 2.6 : 2.3, encounter ? (portrait ? -1.6 : 0) : 1.7);
      if (view.mode === 'travel') {
        // Side-on tracking lets the child see Mosi carrying them along the path.
        cameraDesired.set(anchor + (portrait ? 1.8 : 6.8), portrait ? 4.6 : 4.4, portrait ? 19.5 : 16.8);
        cameraTarget.set(anchor + (portrait ? 1.1 : 6.2), 1.6, 1.5);
        if(firstForest){const along=smooth(9,15.5,mosi.group.position.x);cameraDesired.lerp(new THREE.Vector3(mosi.group.position.x-6.5,3.9,mosi.group.position.z+6.5),along);cameraTarget.lerp(new THREE.Vector3(mosi.group.position.x+3.5,1.6,mosi.group.position.z),along);}
      }
      if (isSky) {
        cameraDesired.set(anchor + (portrait ? 1.8 : 6.5), portrait ? 3.7 : 3.4, portrait ? 25 : 21);
        cameraTarget.set(anchor - .3, portrait ? 4.6 : 6.3, -5);
      }
      if(tall){
        // Look up from the child's world. A three-quarter view keeps the full
        // long tail in frame while the enlarged torso and head retain their size.
        const distance=portrait?Math.max(21,viewport.height/viewport.width*12.5):24;
        const angle=portrait?.85:.62;
        cameraDesired.set(anchor+Math.sin(angle)*distance,2.4,-1+Math.cos(angle)*distance);
        cameraTarget.set(anchor-1.6,1.2+(portrait&&viewport.height<650?.18:0),-1);
      }
      if (arrival && !arrival.track.flying) {
        // Mosi reacts first. The animal covers the distant approach outside this
        // close view, then we gently open the clearing onto its slow last steps.
        const reveal = smooth(arrival.track.cueDuration + 4.5, arrival.track.cueDuration + 6.5, arrival.age);
        const reactionPosition = new THREE.Vector3(mosi.group.position.x - 1.8, portrait ? 2.7 : 3.0, mosi.group.position.z + 9);
        const reactionTarget = new THREE.Vector3(mosi.group.position.x, portrait ? .95 : 1.45, mosi.group.position.z);
        cameraDesired.lerp(reactionPosition, 1 - reveal);
        cameraTarget.lerp(reactionTarget, 1 - reveal);
        // Turn into the clearing and follow the slow, visible final approach.
        // The original encounter composition returns before the quiz appears.
        const track=smooth(4.6,6.6,arrival.age)*(1-smooth(.76,.99,arrival.sample.progress));
        if(view.species==='brachiosaurus'){
          // Keep the giant's oblique, child-height composition as it walks.
          // The generic frontal follow shot would crop its long head and tail.
          const movement=arrival.sample.position.clone().sub(arrival.track.goal);
          cameraDesired.addScaledVector(movement,track*.85);cameraTarget.addScaledVector(movement,track*.85);
        }else{
          const animalFocus=arrival.sample.position.clone().add(new THREE.Vector3(0,2.1,0));
          const trackedCamera=animalFocus.clone().add(new THREE.Vector3(portrait?4.5:7,portrait?1.8:2.8,portrait?19:17));
          cameraDesired.lerp(trackedCamera,track*.85);cameraTarget.lerp(animalFocus,track*.85);
        }
      }
      if(firstForest&&encounter){
        // Stop on the path, then turn almost a quarter-circle toward the sound.
        // The dinosaur stays between the trees; it never walks into our trail.
        const forestTarget=new THREE.Vector3(14,-.4,-3.7),forestPosition=new THREE.Vector3(24,6.3,25);
        if(portrait){
          // A narrow phone follows our gaze into the trees for the question.
          // Mosi stays on the path behind this closer view of the whole animal.
          const distance=24*(viewport.height/viewport.width)/(568/320);
          forestTarget.set(12,1.7,-11);forestPosition.set(12+distance*.24,1.7+distance*.18,-11+distance*.955);
        }
        if(arrival){const turn=smooth(4.5,7.2,arrival.age);cameraDesired.copy(new THREE.Vector3(mosi.group.position.x-6.5,3.9,mosi.group.position.z+6.5)).lerp(forestPosition,turn);cameraTarget.copy(new THREE.Vector3(mosi.group.position.x+3.5,1.6,mosi.group.position.z)).lerp(forestTarget,turn);}
        else{cameraDesired.copy(forestPosition);cameraTarget.copy(forestTarget);}
      }
    }
    applyViewportFraming(camera, viewport, {
      baseFov: portrait ? (view.mode === 'intro' ? 45 : 47) : (view.mode === 'intro' ? 43 : 40), sky: isSky,
    });
    return { encounter, isSky, tall };
  }
  function resize() {
    viewport = { width: canvas.clientWidth || innerWidth, height: canvas.clientHeight || innerHeight, portrait: (canvas.clientWidth || innerWidth) / (canvas.clientHeight || innerHeight) < .85 };
    camera.aspect = viewport.width / viewport.height;
    renderer.setSize(viewport.width, viewport.height, false);
    cameraPlan();
  }
  function setPaused(value) { paused = Boolean(value); if (paused) pointerDown = null; }
  function celebrate() { celebrationAge = 0; celebration.visible = true; }
  function down(event) {
    if (paused || document.hidden || event.isPrimary === false || event.button > 0) return;
    pointerDown = [event.clientX, event.clientY, event.pointerId,event.clientX,event.clientY,false];
    canvas.setPointerCapture?.(event.pointerId);
  }
  function move(event){if(!pointerDown||event.pointerId!==pointerDown[2])return;const distance=Math.hypot(event.clientX-pointerDown[0],event.clientY-pointerDown[1]);if(distance>10)pointerDown[5]=true;if(pointerDown[5])panExploration(event.clientX-pointerDown[3],event.clientY-pointerDown[4]);pointerDown[3]=event.clientX;pointerDown[4]=event.clientY;}
  function cancelPointer() { pointerDown = null; }
  function up(event) {
    if (!pointerDown || paused || document.hidden || event.pointerId !== pointerDown[2] || pointerDown[5] || Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]) > 16) { pointerDown = null; return; }
    pointerDown = null;
    const rect = canvas.getBoundingClientRect(); mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    if (discoveries.isActive()) {
      if(rides.getState().busy)return;
      if(discoveries.pick(raycaster, { x: event.clientX - rect.left, y: event.clientY - rect.top }, camera, viewport))return;
    }
    if (arrival) return;
    const enabled = interactive.filter(hit => hit.userData.id === 'mosi' || (hit.userData.id === view.species && activeCreature?.group.visible));
    const hits = raycaster.intersectObjects(enabled, false);
    if (hits.length){onInteract(hits[0].object.userData.id);return;}
    const visibleInScene=object=>{if(object.material?.visible===false)return false;for(let parent=object;parent;parent=parent.parent){if(!parent.visible)return false;if(parent===scene)return true;}return false;};
    const terrainHits=raycaster.intersectObjects(worldTouchTargets.filter(visibleInScene),false);
    if(terrainHits.length){
      const hit=terrainHits[0],name=(hit.object.name||'').toLowerCase();
      const kind=hit.object.userData.touchKind||(/tree|pine|palm|trunk/.test(name)?'tree':/grass|fern|flower|bush|plant/.test(name)?'grass':/rock|stone/.test(name)?'rock':'path');
      const habitat=hit.object.userData.habitatGroup||hit.object.userData.habitatTree;
      const targets=habitat?habitat.children.filter(object=>object.isMesh).map(object=>({object})):hit.object.isInstancedMesh&&kind==='tree'?worldTouchTargets.filter(object=>object.name===hit.object.name&&object.isInstancedMesh&&hit.instanceId<object.count).map(object=>({object,instanceId:hit.instanceId})):[{object:hit.object,instanceId:hit.instanceId}];
      touchFeedback.touch({kind,position:hit.point,targets});onWorldTouch({kind,position:hit.point.clone(),pan:mouse.x});
    }
  }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancelPointer); canvas.addEventListener('lostpointercapture', cancelPointer); canvas.style.touchAction = 'none';
  window.addEventListener('resize', resize);
  function tick() {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const clockTime = timer.getElapsedTime(), rawDelta = clockTime - lastElapsed, dt = Math.min(.05, rawDelta); lastElapsed = clockTime;
    if (document.hidden || paused) return;
    if (rawDelta > 0 && rawDelta < 1) { frameDurations.push(rawDelta); if (frameDurations.length > 120) frameDurations.shift(); }
    elapsed += dt;
    const { encounter, isSky } = cameraPlan();
    const activityContext=rides.getContext();
    const activityCamera = discoveries.cameraPlan(camera, viewport, station,activityContext);
    explorationPanLimits.yaw=activityCamera?.maxYaw??activityContext?.panLimits?.yaw??.25;explorationPanLimits.pitch=activityCamera?.maxPitch??activityContext?.panLimits?.pitch??.13;
    if (activityCamera && !arrival && !rides.isActive()) {
      cameraDesired.lerp(activityCamera.position, activityCamera.blend); cameraTarget.lerp(activityCamera.target, activityCamera.blend);
    }
    if (inspection && !arrival) {
      inspection.age += dt;
      const weight = smooth(0, .9, inspection.age) * (1 - smooth(3.1, 4.3, inspection.age));
      const head = inspection.animal.bone?.('Head');
      inspection.animal.group.updateMatrixWorld(true);
      const point = head ? head.getWorldPosition(new THREE.Vector3()) : inspection.animal.bounds.getCenter(new THREE.Vector3()).applyMatrix4(inspection.animal.group.matrixWorld);
      cameraTarget.lerp(point, weight * .42);
      const offset = cameraDesired.clone().sub(cameraTarget).multiplyScalar(1 - weight * .14);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(inspection.age / 4.3 * Math.PI) * .065);
      cameraDesired.copy(cameraTarget).add(offset);
      if (inspection.age >= 4.3) {
        inspection = null; if (inspectionResolve) { inspectionResolve({ completed: true, cancelled: false }); inspectionResolve = null; }
      }
    }
    const movement = Math.abs(actorTarget.x - mosi.group.position.x);
    const visitor = encounter && activeCreature ? encounterPose(view.species, activeCreature).position : null;
    const greetingYaw = visitor ? Math.atan2(-(visitor.z - mosi.group.position.z), visitor.x - mosi.group.position.x) : -.08;
    const turnRemaining = Math.atan2(Math.sin(greetingYaw - mosi.group.rotation.y), Math.cos(greetingYaw - mosi.group.rotation.y));
    const walking = view.mode === 'travel' ? 1 : movement > .2 ? .8 : Math.abs(turnRemaining) > .15 ? .3 : 0;
    currentWalking = mix(currentWalking, walking, 1 - Math.exp(-dt * 3));
    mosi.group.position.lerp(actorTarget, 1 - Math.exp(-dt * (view.mode === 'travel' ? .9 : 1.5)));
    mosi.group.rotation.y += turnRemaining * (1 - Math.exp(-dt * 1.35));
    const mosiScale = viewport.portrait ? (view.mode === 'intro' ? 1.20 : isSky ? .65 : .50) : (view.mode === 'intro' ? 1.6 : .85);
    mosi.group.scale.lerp(new THREE.Vector3(mosiScale, mosiScale, mosiScale), 1 - Math.exp(-dt * 2.5));
    mosi.update(elapsed, { walking: currentWalking, happy: celebrationAge < 3 ? 1 : 0,
      look: encounter ? -.12 : 0, gazeHeight: isSky ? .65 : view.species === 'brachiosaurus' ? .45 : .12 });
    if (activeCreature?.group.visible) {
      const pose = encounterPose(view.species, activeCreature);
      if (arrival) {
        const state = arrival;
        state.age += dt; state.sample = state.track.sample(state.age);
        const sample = state.sample;
        // A device rotation may change the final framing; adjust continuously.
        const responsiveShift = pose.position.clone().sub(state.track.goal).multiplyScalar(smooth(0, 1, sample.progress));
        activeCreature.group.position.copy(sample.position).add(responsiveShift);
        activeCreature.group.scale.lerp(new THREE.Vector3(pose.scale, pose.scale, pose.scale), 1 - Math.exp(-dt * 2.5));
        activeCreature.group.rotation.set(sample.bank * .28,
          sample.heading + (pose.yaw - state.track.finalYaw) * smooth(.7, 1, sample.progress), 0);
        const gait = activeCreature.getMotionState?.();
        const walkSpeed = gait?.strideLength ? sample.speed / activeCreature.group.scale.x / gait.strideLength * gait.baseWalkDuration : 1;
        activeCreature.update(elapsed, { walking: sample.walking, walkSpeed, happy: 0, look: sample.look,
          gazeHeight: -.15, flying: sample.flying, glide: sample.glide, bank: sample.bank });
        motionEvents(state, activeCreature, sample);
        if (sample.completed) {
          activeCreature.group.position.copy(pose.position); activeCreature.group.rotation.set(0, pose.yaw, 0);
          flightStartTime = elapsed;
          lastArrival = { id: state.id, species: state.track.species, phase: 'complete', progress: 1, startsOutsideView: state.track.startsOutsideView };
          arrival = null; view = { ...view, mode: 'encounter' };
          arrivalEvent('settled', state); state.resolve({ completed: true, cancelled: false });
        }
      } else {
        if(rides.isActive())activeCreature.group.scale.lerp(new THREE.Vector3(pose.scale,pose.scale,pose.scale),1-Math.exp(-dt*2.5));
        else activeCreature.group.scale.setScalar(pose.scale);
        activeCreature.group.position.copy(pose.position);
        activeCreature.group.rotation.set(0, pose.yaw, 0);
        const flightAge = elapsed - flightStartTime;
        if (view.species === 'pteranodon') {
          activeCreature.group.position.x += Math.sin(flightAge * .35) * (viewport.portrait ? .48 : .9);
          activeCreature.group.position.y += Math.sin(flightAge * .7) * .27;
          activeCreature.group.position.z += (Math.cos(flightAge * .35) - 1) * .5;
          activeCreature.group.rotation.y += Math.sin(flightAge * .35) * .14;
          activeCreature.group.rotation.x = Math.sin(flightAge * .35) * .09;
        }
        activeCreature.update(elapsed, { walking: 0, happy: celebrationAge < 3 ? .6 : 0,
          look: .5, gazeHeight: -.15, flying: isSky ? 1 : 0,
          glide: isSky ? .84 + Math.sin(flightAge * .25) * .13 : 0, bank: isSky ? Math.sin(flightAge * .35) * .18 : 0, ...rides.animationState() });
      }
    }
    focusBlend = mix(focusBlend, encounter ? 1 : 0, 1 - Math.exp(-dt * 1.8));
    skyBlend = mix(skyBlend, isSky ? 1 : 0, 1 - Math.exp(-dt * 1.5));
    const rideFrame=rides.update(elapsed,dt,{viewport,baselineCamera:cameraDesired,baselineTarget:cameraTarget,baseFov:camera.fov,restingPose:activeCreature?encounterPose(view.species,activeCreature):null});rideContext=rideFrame?.context||null;
    if(rideFrame?.camera){cameraDesired.copy(rideFrame.camera.position);cameraTarget.copy(rideFrame.camera.target);camera.clearViewOffset();camera.fov=rideFrame.camera.fov;camera.updateProjectionMatrix();}
    if(rideAttentionAge!==null&&rideContext?.interactive){
      rideAttentionAge+=dt;const point=discoveries.getFocusTarget();
      if(point){const weight=smooth(0,.8,rideAttentionAge)*(1-smooth(12,13,rideAttentionAge));cameraTarget.lerp(rideAttentionTarget(cameraDesired,cameraTarget,point,rideContext.kind),weight);}
      if(rideAttentionAge>=13)rideAttentionAge=null;
    }
    explorationPan.lerp(explorationPanTarget,1-Math.exp(-dt*6));
    if(discoveries.isActive()&&!rides.getState().busy){
      cameraTarget.copy(explorationViewTarget(cameraDesired,cameraTarget,explorationPan.x,explorationPan.y));
    }
    const cameraRate=rides.isActive()?(rides.getState().phase==='exploring'?24:5):1.8;
    camera.position.lerp(cameraDesired, 1 - Math.exp(-dt * cameraRate)); look.lerp(cameraTarget, 1 - Math.exp(-dt * (rides.isActive()?cameraRate:2))); camera.lookAt(look);
    camera.updateMatrixWorld(true); discoveries.update(elapsed, dt, camera, viewport,rideContext);touchFeedback.update(elapsed,dt);
    // Previously met animals remain in the world until the moving camera leaves
    // them behind. They never blink out at the instant the child chooses Next.
    if (leavingCreatures.size) {
      camera.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const model of leavingCreatures) {
        model.group.updateMatrixWorld(true);
        if (!frustum.intersectsBox(model.bounds.clone().applyMatrix4(model.group.matrixWorld))) {
          model.group.visible = false; leavingCreatures.delete(model);
        } else model.update(elapsed, { walking: 0, look: .4 });
      }
    }
    const anchor = mosi.group.position.x - (viewport.portrait ? (view.species==='brachiosaurus'?4.1:1.1) : 6.2);
    for (const batch of streamedBatches) batch.object.visible = Math.abs(batch.x - anchor) < 35;
    sun.position.set(anchor - 12, 25, 12); sun.target.position.set(anchor, 0, -1);
    rim.position.x = anchor + 3; rim.target.position.x = anchor; warmBounce.position.x = anchor + 4; warmBounce.target.position.x = anchor;
    windUniform.value = waterTime.value = elapsed;
    const lakeAnimal = activeCreature?.group.visible && ['spinosaurus', 'parasaurolophus'].includes(view.species);
    waterFeet.value.set(lakeAnimal ? activeCreature.group.position.x : 0, lakeAnimal ? activeCreature.group.position.z : 0, lakeAnimal ? 1 : 0);
    sunShafts.position.x = anchor;
    for (let i = 0; i < pollenSeeds.length; i++) { const s = pollenSeeds[i]; pollenPositions[i * 3] = anchor + s.x + Math.sin(elapsed * .12 + s.phase) * .8; pollenPositions[i * 3 + 1] = s.y + Math.sin(elapsed * .25 + s.phase) * .4; pollenPositions[i * 3 + 2] = s.z + Math.cos(elapsed * .16 + s.phase) * .5; }
    pollenGeo.attributes.position.needsUpdate = true;
    rippleRings.forEach((ring, i) => { const a = (elapsed * .16 + i / 6) % 1; ring.scale.setScalar(.45 + a * 1.9); ring.material.opacity = Math.sin(a * Math.PI) * .18; });
    birds.forEach((bird, i) => { bird.position.x = 48 + ((elapsed * .55 + i * 4) % 44); bird.rotation.z = Math.sin(elapsed * 3 + i) * .08; });
    // Keep the sky wholly inside the far plane from every point on the route;
    // a fixed sphere would be sliced into a giant circular patch in flight.
    sky.position.copy(camera.position);
    if (celebration.visible) {
      celebrationAge += dt;
      if (celebrationAge > 3.8) celebration.visible = false;
      celebrationMat.opacity = Math.min(1, 3.8 - celebrationAge);
      for (let i = 0; i < celebrationSeeds.length; i++) { const s = celebrationSeeds[i]; celebrationPositions[i * 3] = anchor + s.x + Math.sin(celebrationAge + s.phase) * .3; celebrationPositions[i * 3 + 1] = s.y + 3 - celebrationAge * s.speed; celebrationPositions[i * 3 + 2] = s.z + 2; }
      celebrationGeo.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }
  function getDebugInfo() {
    const averageFps = frameDurations.length ? frameDurations.length / frameDurations.reduce((sum, dt) => sum + dt, 0) : null;
    return { view: { ...view }, sceneObjects: scene.children.length, visibleCreature: activeCreature?.group.visible ? view.species : null, camera: camera.position.toArray(), target: look.toArray(), mosi: mosi.group.position.toArray(), viewport: { ...viewport }, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, averageFps: averageFps === null ? null : Math.round(averageFps * 10) / 10, frameSamples: frameDurations.length, activeTerrainSections: streamedBatches.filter(batch => batch.object.visible).length, arrival: arrival ? { id: arrival.id, species: arrival.track.species, phase: arrival.sample.phase, progress: arrival.sample.progress, age: arrival.age, duration: arrival.track.duration, startsOutsideView: arrival.track.startsOutsideView, position: activeCreature.group.position.toArray(), walking: arrival.sample.walking, bank: arrival.sample.bank } : lastArrival, assets: { environment: { ...environmentSummary, failed: environmentAssets.failed, groundTexture: Boolean(environmentAssets.groundColor) }, dinosaurs: dinosaurAssets } };
  }
  function dispose() {
    cancelArrival('disposed');
    cancelInspection(); rides.dispose();discoveries.dispose();touchFeedback.dispose();
    disposed = true; cancelAnimationFrame(frame); window.removeEventListener('resize', resize); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancelPointer); canvas.removeEventListener('lostpointercapture', cancelPointer);
    const geometries = new Set(), mats = new Set(), textures = new Set();
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) { mats.add(mat); Object.values(mat).forEach(value => { if (value?.isTexture) textures.add(value); }); } });
    geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose();
  }
  resize(); cameraPlan(); camera.position.copy(cameraDesired); look.copy(cameraTarget); camera.lookAt(look); tick(); onReady();
  return { setView, arrive, celebrate, setPaused, resize, dispose, setActivity, clearActivity, focusDiscovery, activateDiscovery,
    updateActivityProgress,finishActivityRide,replayActivityRide,getActivityState,panExploration,
    getDiscoveryScreenPositions, inspectAnimal, getDebugInfo: () => ({ ...getDebugInfo(), activity: discoveries.getDebugInfo(), ride:rides.getState(),touch:touchFeedback.getDebugInfo(), inspecting: Boolean(inspection) }) };
}
