import * as THREE from 'three';
import { BORE, REACH } from './props.js';

/**
 * What stands in the tunnel mouth's bore (the models are the owner's approved downloads: the rock pile, a purple and a blue crystal): the dark that the
 * Kambeðlur's plates light, the crystals that glint as they do, and the pile of rocks that blocks the way until the Þríhyrnur butt it down. Everything
 * is placed in the tunnel's own frame (x along the tunnel, the mouth at +x, y up, z across: props.js BORE) as a group that is the tunnel's child, so
 * that it turns and stands with it. Nothing here is drawn or modelled by hand: it places, tints, dims and moves the models.
 *
 *   light(level)      the plates' light, 0 (dark) to 1 (lit): the bore's lining (props.js darkInside, through glow.uLight), the floor and the pile come up with it
 *   pile              the rockfall: hit(i) shoves it a little more loose, fall() brings it down into steps; reset() puts it back
 *   crystals          sparkle() throws stars from them (the light's taps); points() where they are
 *
 * `glow.uLight` is the one number the shaders read; update(dt) eases it toward the level light() was given, on the game clock.
 */
const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const clamp01 = t => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The five rocks of the pile model, cut apart. The file has them side by side as one mesh (the one material); each is a connected shell of triangles, so
 * the shells are found by joining the triangles that share a position (a texture seam splits a vertex, not the rock). Each comes back standing on y = 0
 * and centred on x and z, left to right as the file has them (Rock_4, Rock_1, Rock_2, Rock_3, Rock_5: 2.0, 1.0, 1.1, 1.2 and 1.6 m high).
 */
export function splitRocks(model) {
  const g = model.geometry, position = g.attributes.position, index = g.index.array, parent = new Map(), key = i => `${Math.round(position.getX(i) * 2000)},${Math.round(position.getY(i) * 2000)},${Math.round(position.getZ(i) * 2000)}`;
  const find = a => { let root = a; while (parent.get(root) !== root) root = parent.get(root); while (parent.get(a) !== root) { const next = parent.get(a); parent.set(a, root); a = next; } return root; };
  for (let i = 0; i < position.count; i++) { const k = key(i); if (!parent.has(k)) parent.set(k, k); }
  for (let t = 0; t < index.length; t += 3) { const a = find(key(index[t])), b = find(key(index[t + 1])), c = find(key(index[t + 2])); parent.set(b, a); parent.set(find(c), find(a)); }
  const shells = new Map();
  for (let t = 0; t < index.length; t += 3) { const root = find(key(index[t])); if (!shells.has(root)) shells.set(root, []); shells.get(root).push(t); }
  return [...shells.values()].map(triangles => {
    const used = new Map(), source = [];
    for (const t of triangles) for (let k = 0; k < 3; k++) { const v = index[t + k]; if (!used.has(v)) { used.set(v, source.length); source.push(v); } }
    const out = { position: new Float32Array(source.length * 3), normal: new Float32Array(source.length * 3), uv: new Float32Array(source.length * 2), index: new Uint32Array(triangles.length * 3) };
    source.forEach((v, i) => {
      out.position.set([position.getX(v), position.getY(v), position.getZ(v)], i * 3); out.normal.set([g.attributes.normal.getX(v), g.attributes.normal.getY(v), g.attributes.normal.getZ(v)], i * 3);
      out.uv.set([g.attributes.uv.getX(v), g.attributes.uv.getY(v)], i * 2);
    });
    triangles.forEach((t, i) => { for (let k = 0; k < 3; k++) out.index[i * 3 + k] = used.get(index[t + k]); });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(out.position, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3)); geometry.setAttribute('uv', new THREE.BufferAttribute(out.uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(out.index, 1)); geometry.computeBoundingBox();
    const box = geometry.boundingBox, order = (box.min.x + box.max.x) / 2; geometry.translate(-order, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { geometry, triangles: triangles.length, order, size: geometry.boundingBox.getSize(new THREE.Vector3()) };
  }).sort((a, b) => a.order - b.order);
}

// ---- the pile ----
// The pile's pieces. Each is one of the model's rocks (`kind`: 0 to 10, left to right as the file has them: their sizes are on the shells), placed by its middle as
// [x along the tunnel, y, z across, yaw, tilt about x, tilt about z, size], where it starts (stacked across the bore, its front face at x = 2.2), the low steps
// the two shoves move it toward (on its side or small) and where the third hit throws it (`gone`). A hit shoves every piece a little of the way to its steps (the
// loose ones on top further), the third lets go: the rocks are knocked back into the dark at the far end of the bore, behind its black plane (x = -2.55), each
// to one side of the end's widening (x -2.9 to -3.7), its long side along the wall and its inner face 1.25 m from the bore's middle. The friends that walk through
// reach no further in than x = -3.8, within 1.06 m of the middle (their heads), so the way is clear. (The steps lay across both lanes of the walk through: every
// friend walked through rock there, veggir.)
function pieceDefs(rocks) {
  const size = kind => rocks[kind].size;
  const up = (kind, x, z, yaw, s, base = 0) => [x, base + size(kind).y / 2 * s, z, yaw, 0, 0, s];
  const lie = (kind, x, z, yaw, s, base = 0) => [x, base + size(kind).x / 2 * s, z, yaw, 0, Math.PI / 2, s];
  // the pose by the wall at the end, from the pose on the steps: a rock on its side lies along the tunnel, a standing one turns its narrow side across
  const stow = (kind, step, x, side) => {
    const s = step[6], lying = step[5] !== 0, k = size(kind), half = (lying ? k.z : Math.min(k.x, k.z)) / 2 * s, yaw = lying || k.z <= k.x ? 0 : Math.PI / 2;
    return [x, step[1], BORE.across + side * (1.25 + half), yaw, step[4], step[5], s];
  };
  const P = (kind, start, end, [x, side], extra = {}) => ({ kind, start, end, gone: stow(kind, end, x, side), ...extra });
  return [
    P(9, up(9, 1.75, -.7, .3, 1), up(9, 1.05, -1.0, .6, 1), [-3.0, -1]),
    P(3, up(3, 1.75, .65, 1.2, 1.05), up(3, 1.15, 1.0, 2.0, 1), [-3.05, 1]),
    P(5, up(5, 2.0, -.05, .8, 1.1), lie(5, 2.05, 0, 1.4, 1.1), [-3.45, 1]),
    P(2, up(2, 2.0, -1.1, 2.1, 1.1), lie(2, 2.1, -.85, 2.6, 1.1), [-3.5, -1]),
    P(8, up(8, 1.25, -.35, 2.6, 1.15), lie(8, 1.4, -.3, 3.1, 1.15), [-3.2, -1]),
    P(0, up(0, 1.2, .6, 4.0, 1.05), lie(0, 1.35, .55, 4.6, 1.05), [-3.25, 1]),
    P(1, up(1, .8, 0, 5.1, 1), lie(1, .7, 0, 5.6, 1), [-3.7, -1]),
    P(7, up(7, 1.65, -.55, 1.5, 1.2, .85), up(7, 1.55, .15, 2.4, 1.2), [-2.9, 1], { top: true }),
    P(4, up(4, 1.55, .55, 3.3, 1.3, 1.05), up(4, .9, .55, 3.8, 1.3), [-3.65, 1], { top: true }),
    P(6, up(6, 1.35, 0, .2, 1.4, 1.45), up(6, 1.0, -.4, .9, 1.4), [-2.9, -1], { top: true }),
    P(10, up(10, .85, -.9, 3.6, 1.2), up(10, .3, -.9, 4.1, 1.2), [-3.35, -1]),
  ];
}
const STEP_REST = .04; // metres above the tunnel's floor line (the model stands 5 cm in the ground)
const FALL = { delay: .13, seconds: [.75, 1.25], shiver: .42 };

function pileTints(material, glow, key) {
  // Grey rock with green moss, turned into the gorge's sandstone: the texture's light and dark are kept, its hue is not. `uDim` is how much of the day
  // or of the plates' light reaches the pile.
  material.onBeforeCompile = shader => {
    shader.uniforms.uDim = glow.uDim; shader.uniforms.uTint = glow.uTint;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDim;\nuniform vec3 uTint;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rockGrey = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = vec3(pow(rockGrey, 0.7) * 2.1) * uTint * uDim;`);
  };
  material.customProgramCacheKey = () => key;
}

export function createTunnelInterior({ tunnel, models, fx, glow, reducedMotion = () => false }) {
  const group = new THREE.Group(); group.name = 'Göngin'; tunnel.add(group);
  const disposables = [], dummy = new THREE.Object3D(), world = new THREE.Vector3();
  glow.uDim = { value: 0 }; glow.uTint = { value: new THREE.Color('#e9b98a') };
  const at = (x, y, z) => tunnel.localToWorld(new THREE.Vector3(x, y, z));

  // ---- the floor and the far end ----
  // A black veil laid on the sand of the bore (the ground itself is the forest's): it thins as the day or the plates reach it. The far end is shut by a black plane, so
  // that the lit cliff behind the open back of the model is not seen through the tunnel; the plates' light fades out before it.
  const floorGeometry = new THREE.PlaneGeometry(BORE.mouth - BORE.back + .2, 2 * BORE.half + .5); floorGeometry.rotateX(-Math.PI / 2); floorGeometry.translate((BORE.mouth + BORE.back) / 2 - .1, .085, BORE.across);
  const floor = new THREE.Mesh(floorGeometry, new THREE.ShaderMaterial({
    uniforms: { uLight: glow.uLight }, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: 'varying vec3 vTunnel; void main() { vTunnel = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vTunnel; uniform float uLight;
      void main() {
        float tunnelD = max(0.0, ${BORE.mouth.toFixed(2)} - vTunnel.x), tunnelReach = mix(${REACH.dark.toFixed(2)}, ${REACH.lit.toFixed(2)}, uLight);
        float seen = clamp(max(1.0 - smoothstep(0.1, ${REACH.day.toFixed(2)}, tunnelD), uLight * (1.0 - smoothstep(0.2 * tunnelReach, tunnelReach, tunnelD))), 0.0, 1.0);
        float edge = 1.0 - smoothstep(${(BORE.half - .1).toFixed(2)}, ${(BORE.half + .22).toFixed(2)}, abs(vTunnel.z - (${BORE.across.toFixed(2)})));
        gl_FragColor = vec4(0.02, 0.014, 0.01, (1.0 - mix(${REACH.floor.toFixed(2)}, 1.0, seen) ) * edge * 0.97);
      }`,
  }));
  floor.name = 'Gólf ganganna'; floor.renderOrder = 3; group.add(floor); disposables.push(floor.geometry, floor.material);
  const backGeometry = new THREE.PlaneGeometry(3.4, 3.0); backGeometry.rotateY(Math.PI / 2); backGeometry.translate(-2.55, 1.35, BORE.across);
  const back = new THREE.Mesh(backGeometry, new THREE.MeshBasicMaterial({ color: '#070504', fog: false }));
  back.name = 'Myrkur innst'; group.add(back); disposables.push(back.geometry, back.material);

  // ---- the plates' light on the stone around the mouth ----
  const lamp = new THREE.PointLight('#ffc77a', 0, 13, 1.7); lamp.position.set(BORE.mouth + 1.2, 1.5, BORE.across); group.add(lamp);

  // ---- the pile ----
  const rocks = splitRocks(models.get('gorge-rocks')), PIECES = pieceDefs(rocks), pileMaterial = models.get('gorge-rocks').material.clone(); disposables.push(pileMaterial);
  pileMaterial.side = THREE.FrontSide; pileTints(pileMaterial, glow, 'gorge-pile-v1');
  const meshes = rocks.map((rock, kind) => {
    const list = PIECES.filter(piece => piece.kind === kind); if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(rock.geometry, pileMaterial, list.length);
    mesh.name = `Grjót ${kind + 1}`; mesh.frustumCulled = true; mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh); disposables.push(rock.geometry); return { mesh, list };
  }).filter(Boolean);
  const pieces = PIECES.map(piece => {
    const mesh = meshes.find(entry => entry.list.includes(piece)), slot = mesh.list.indexOf(piece), at1 = piece.top ? .22 : .08, at2 = piece.top ? .5 : .16;
    const mix = t => piece.start.map((value, i) => lerp(value, piece.end[i], t));
    return { ...piece, mesh, slot, keys: [piece.start, mix(at1), mix(at2), piece.gone], cur: [...piece.start], from: null, tween: null, landed: true, drop: 0 };
  });
  let pileStage = 0, pileTime = 0, pileDirty = true, falling = false, fallAge = 0;
  const pileEvents = [];
  function placePiece(piece, extra = [0, 0, 0]) {
    const [x, y, z, yaw, rx, rz, s] = piece.cur;
    dummy.position.set(x + extra[0], y + STEP_REST + extra[1], z + extra[2]); dummy.rotation.set(rx, yaw, rz, 'YXZ'); dummy.scale.setScalar(s); dummy.updateMatrix();
    piece.mesh.mesh.setMatrixAt(piece.slot, dummy.matrix);
  }
  function setPile(stage) { pileStage = stage; for (const piece of pieces) { piece.cur = [...piece.keys[stage]]; piece.tween = null; piece.landed = true; placePiece(piece); } for (const { mesh } of meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.boundingSphere = null; } falling = false; pileDirty = false; }
  setPile(0);

  // ---- the pebbles ----
  // Two loose stones (the pile's smallest rock) that are off until a wrong friend's go at the rocks throws one: from a point of the pile through the air to the point it lands on,
  // a bounce off it and gone. They are the pile's own rock, not another model.
  const pebbleMesh = new THREE.InstancedMesh(rocks[Math.min(6, rocks.length - 1)].geometry, pileMaterial, 2);
  pebbleMesh.name = 'Steinvala'; pebbleMesh.frustumCulled = false; pebbleMesh.visible = false; pebbleMesh.castShadow = true; pebbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(pebbleMesh);
  const pebbles = [null, null], hidden = new THREE.Matrix4().makeScale(1e-4, 1e-4, 1e-4);
  for (let i = 0; i < 2; i++) pebbleMesh.setMatrixAt(i, hidden);
  pebbleMesh.instanceMatrix.needsUpdate = true; let pebblesLive = false;
  function updatePebbles(dt) {
    if (!pebblesLive) return;
    let live = false;
    pebbles.forEach((p, i) => {
      if (!p) return;
      p.age += dt; let u = Math.min(1, p.age / p.seconds), x, y, z, scale = .9;
      if (p.phase === 'fly') { x = lerp(p.from[0], p.to[0], u); z = lerp(p.from[2], p.to[2], u); y = lerp(p.from[1], p.to[1], u) + 4 * p.apex * u * (1 - u); if (u >= 1) { p.phase = 'bounce'; p.age = 0; p.from = p.to; p.to = [p.to[0] + p.side[0], .12, p.to[2] + p.side[1]]; p.seconds = .5; p.apex = .35; u = 0; } }
      if (p.phase === 'bounce') { x = lerp(p.from[0], p.to[0], u); z = lerp(p.from[2], p.to[2], u); y = lerp(p.from[1], p.to[1], u) + 4 * p.apex * u * (1 - u); if (u >= 1) { p.phase = 'rest'; p.age = 0; p.seconds = .3; u = 0; } }
      if (p.phase === 'rest') { x = p.to[0]; y = p.to[1]; z = p.to[2]; scale = .9 * (1 - smooth(u)); if (u >= 1) { pebbles[i] = null; pebbleMesh.setMatrixAt(i, hidden); return; } }
      dummy.position.set(x, y + STEP_REST, z); dummy.rotation.set(p.age * 6 + i, p.age * 9, p.age * 4, 'YXZ'); dummy.scale.setScalar(scale); dummy.updateMatrix(); pebbleMesh.setMatrixAt(i, dummy.matrix); live = true;
    });
    pebbleMesh.instanceMatrix.needsUpdate = true; pebblesLive = live; pebbleMesh.visible = live;
  }

  // ---- the crystals ----
  // [x, z, y, yaw, scale, tilt about x, tilt about z]: inside and just in the mouth, where the plates' light finds them. In the bore they grow out of its walls a metre
  // up, leaning in, above the friends' flanks (the floor is as wide as the friends that walk through it: at its foot they stood in their way, veggir), the two on the
  // left wall set into the rock far enough for a Þríhyrna's frill to pass them; in the mouth's open right side one stands on the floor. With no yaw the tilt about x
  // leans a crystal toward +z (into the bore from its -z wall), a negative one toward -z.
  const CRYSTALS = {
    purple: [[3.05, -1.83, .95, .1, .55, .45, -.1], [2.4, 1.63, .9, -.15, .5, -.45, .12], [.4, -1.96, .95, .2, .65, .45, -.12]],
    blue: [[3.35, 1.88, 0, 1.3, .7, 0, .2], [2.6, -1.67, 1.0, -.1, .55, .4, .1], [.9, 1.38, .95, .15, .6, -.4, -.1]],
  };
  const crystalLook = { purple: { emissive: '#8b5cff', base: .05 }, blue: { emissive: '#4aa9ff', base: .05 } };
  const crystals = Object.entries(CRYSTALS).map(([name, list]) => {
    const model = models.get(`gorge-crystal-${name}`), material = model.material.clone(); disposables.push(material);
    material.side = THREE.FrontSide; material.emissive = new THREE.Color(crystalLook[name].emissive); material.emissiveIntensity = crystalLook[name].base; material.roughness = .32; material.metalness = .1;
    const mesh = new THREE.InstancedMesh(model.geometry, material, list.length); mesh.name = `Kristallar (${name})`; mesh.frustumCulled = true; mesh.castShadow = false; mesh.receiveShadow = true;
    list.forEach(([x, z, y, yaw, s, rx, rz], i) => { dummy.position.set(x, y + STEP_REST - .02, z); dummy.rotation.set(rx, yaw, rz, 'YXZ'); dummy.scale.setScalar(s); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.instanceMatrix.needsUpdate = true; group.add(mesh); disposables.push(model.geometry);
    return { name, list, material, mesh };
  });
  let glint = 0; // 1 right after a tap, then fades

  // ---- the light ----
  let level = 0, wanted = 0, from = 0, easeAge = 1, easeSeconds = .8;
  function light(value, { seconds = .8 } = {}) { wanted = clamp01(value); from = level; easeAge = 0; easeSeconds = reducedMotion() ? 0 : seconds; if (!(easeSeconds > 0)) { level = wanted; easeAge = 1; apply(); } }
  function apply() {
    glow.uLight.value = level;
    // The pile is in the dark inside the bore until the light comes; it is that dim, and then lit.
    glow.uDim.value = lerp(.012, 1, smooth(level * 1.25));
    lamp.intensity = level * 11;
    for (const crystal of crystals) crystal.material.emissiveIntensity = crystalLook[crystal.name].base + level * .55 + glint * 1.6;
    for (const crystal of crystals) crystal.material.color.setScalar(lerp(.45, 1, level));
  }
  apply();

  // ---- every frame ----
  function update(dt) {
    if (!(dt > 0)) return;
    if (easeAge < 1 || level !== wanted) { easeAge = easeSeconds > 0 ? Math.min(1, easeAge + dt / easeSeconds) : 1; level = lerp(from, wanted, smooth(easeAge)); if (easeAge >= 1) level = wanted; }
    if (glint > 0) glint = Math.max(0, glint - dt / .7);
    apply();
    updatePile(dt); updatePebbles(dt);
  }
  function updatePile(dt) {
    if (!pileDirty && !falling) return;
    pileTime += dt; let busy = false;
    for (const piece of pieces) {
      const tween = piece.tween; if (!tween) continue;
      tween.age += dt;
      const u = clamp01((tween.age - tween.delay) / tween.seconds);
      if (tween.age < tween.delay) { busy = true; continue; }
      if (tween.kind === 'shove') {
        const e = smooth(u); piece.cur = tween.from.map((value, i) => lerp(value, tween.to[i], e));
      } else {
        // The fall: the drop speeds up, the sideways and the turning slow down, then a small bounce on landing.
        const gravity = u * u, glide = 1 - (1 - u) * (1 - u);
        piece.cur = tween.from.map((value, i) => i === 1 ? lerp(value, tween.to[i], gravity) : lerp(value, tween.to[i], glide));
        if (u >= 1 && !piece.landed) { piece.landed = true; pileEvents.push({ type: 'rock-land', piece }); fx?.emit?.('dust', at(...piece.cur.slice(0, 3)), { count: 5, strength: .9 }); }
      }
      if (u >= 1) {
        piece.cur = [...tween.to];
        // A small bounce on landing, for a moment.
        const after = tween.age - tween.delay - tween.seconds;
        if (tween.kind === 'fall' && after < .6) { busy = true; placePiece(piece, [0, Math.max(0, tween.drop * .14 * Math.sin(after * 15) * Math.exp(-after * 6)), 0]); continue; }
        piece.tween = null;
      } else busy = true;
      placePiece(piece);
    }
    // The pile's shiver after a hit: a little jitter on every piece for a moment.
    if (pileShake > 0) { pileShake = Math.max(0, pileShake - dt); const k = pileShake / FALL.shiver; for (const piece of pieces) if (!piece.tween) placePiece(piece, [Math.sin(pileTime * 61 + piece.kind) * .025 * k, 0, Math.cos(pileTime * 47 + piece.slot) * .02 * k]); busy = true; }
    for (const { mesh } of meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.boundingSphere = null; }
    pileDirty = busy; falling = pieces.some(piece => piece.tween?.kind === 'fall');
  }
  let pileShake = 0;
  const pile = {
    get stage() { return pileStage; },
    get fallen() { return pileStage >= 3; },
    /** A hit shoves the pile (stage 1 and 2), the third lets the pile go (stage 3: it falls into steps). */
    hit(index) {
      const stage = Math.min(3, index + 1); pileStage = stage;
      if (stage < 3) { pieces.forEach(piece => { piece.tween = { kind: 'shove', from: [...piece.cur], to: piece.keys[stage], age: 0, delay: 0, seconds: .38 }; piece.landed = true; }); pileShake = FALL.shiver; pileDirty = true; return; }
      pieces.forEach((piece, i) => {
        const drop = piece.cur[1] - piece.gone[1] + 1, seconds = lerp(FALL.seconds[0], FALL.seconds[1], clamp01(drop / 2)) * (reducedMotion() ? .4 : 1);
        piece.tween = { kind: 'fall', from: [...piece.cur], to: [...piece.gone], age: 0, delay: reducedMotion() ? 0 : (piece.top ? 0 : (piece.late ?? 0) + FALL.delay * (.5 + .5 * (i % 3))) , seconds, drop };
        piece.landed = false;
      });
      pileDirty = true;
    },
    /** Nothing moves: the pile as it first stood (or as it stands at `stage`, 0 to 3, for a still picture). */
    reset() { setPile(0); pileShake = 0; pileEvents.length = 0; for (let i = 0; i < 2; i++) { pebbles[i] = null; pebbleMesh.setMatrixAt(i, hidden); } pebbleMesh.instanceMatrix.needsUpdate = true; pebblesLive = false; pebbleMesh.visible = false; },
    set(stage) { setPile(Math.max(0, Math.min(3, stage))); },
    /** A shiver without a shove (something bumped into the dark). */
    shiver() { pileShake = FALL.shiver; pileDirty = true; },
    /** How far toward the mouth the pile reaches now (its front face, x in the tunnel's frame). */
    frontX: () => Math.max(...pieces.map(piece => piece.cur[0] + Math.max(rocks[piece.kind].size.x, rocks[piece.kind].size.z) / 2 * piece.cur[6] * .85)),
    /** A pebble from `from` to `to` (points of the tunnel's frame: [x, y, z]) in `seconds`; it bounces off sideways ([x, z] metres) and is gone. */
    pebble(slot, from, to, { seconds = .55, side = [.3, .6], apex = 1.1 } = {}) { pebbles[slot] = { phase: 'fly', from, to, age: 0, seconds, apex, side }; pebblesLive = true; pebbleMesh.visible = true; },
    /** Rocks that have landed since the last call. */
    poll() { return pileEvents.splice(0); },
    /** The pile's front face, its top and its whole body in world space (the shots frame these). */
    front: () => at(1.95 + .2, .9, BORE.across),
    top: () => at(1.2, 1.9, BORE.across),
    centre: () => at(1.2, .9, BORE.across),
    isFalling: () => falling,
    triangles: () => PIECES.reduce((sum, piece) => sum + rocks[piece.kind].triangles, 0),
  };

  return {
    group, pile, light, update, lamp,
    get level() { return level; },
    get lit() { return wanted >= .99; },
    /** A point of the tunnel's frame in world space. */
    local: at,
    crystals: {
      /** Stars from every crystal, and a flash on them (the light's taps). */
      sparkle(count = 6) { glint = 1; for (const point of this.points()) fx?.emit?.('stars', point, { count }); },
      // (up the crystal's own lean: those on the walls lean in)
      points: () => crystals.flatMap(crystal => crystal.list.map(([x, z, y, yaw, s, rx, rz]) => { const lean = new THREE.Vector3(0, .75 * s, 0).applyEuler(new THREE.Euler(rx, yaw, rz, 'YXZ')); return at(x + lean.x, y + lean.y, z + lean.z); })),
    },
    reset() { level = wanted = from = 0; easeAge = 1; glint = 0; pile.reset(); apply(); },
    stats: () => ({ triangles: PIECES.reduce((sum, piece) => sum + rocks[piece.kind].triangles, 0) + crystals.reduce((sum, c) => sum + (models.get(`gorge-crystal-${c.name}`).triangles) * c.list.length, 0), draws: meshes.length + crystals.length + 3, pieces: PIECES.length, crystalsStanding: crystals.reduce((sum, c) => sum + c.list.length, 0) }),
    dispose() { tunnel.remove(group); for (const item of disposables) item.dispose?.(); },
  };
}
