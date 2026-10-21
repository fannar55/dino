import * as THREE from 'three';
import { pickQuality } from '../quality.js';
import { pickLook } from '../looks.js';
import { createLighting } from '../lighting.js';
import { installDepthShadows } from '../shadows.js';
import { installFog } from '../fog.js';
import { createSky } from '../sky.js';
import { createWind } from '../wind.js';
import { createPointResolver } from '../points.js';
import { updateCharacterLods } from '../character-lod.js';
import { createForest } from '../../world/forest/forest.js';

export const TABLE = Object.freeze({ y: 1.4, width: 5.8, depth: 3.8, farZ: -1.9, nearZ: 1.9 });
// Sit at the near rail: the table continues beyond the lower frame and Mosi's
// face occupies the upper third. A little look-room at left keeps the cup visible.
const SHOT = { position: [-.4, 3.2, 4.4], target: [-.4, 1.7, -.8], fov: 41 };

/** Shared-clock camera rig, independently constructible without a WebGL context.
 *  `shot` replaces the table shot ({ position, target, fov, pull }): a game laid out differently round the table (the junior game's
 *  full-width table) frames it its own way. `pull` (default .95) is the aspect below which the camera backs away to keep the table's
 *  width in view, as `pull / aspect`. */
export function createYatzyCameraRig(camera, { width = 1000, height = 720, shot = SHOT } = {}) {
  const tableTarget = new THREE.Vector3().fromArray(shot.target);
  const tableOffset = new THREE.Vector3().fromArray(shot.position).sub(tableTarget);
  const pull = shot.pull ?? .95;
  const tablePosition = new THREE.Vector3(), dicePosition = new THREE.Vector3(), diceTarget = new THREE.Vector3();
  const focusStartPosition = new THREE.Vector3(), focusStartTarget = new THREE.Vector3();
  const focusEndPosition = new THREE.Vector3(), focusEndTarget = new THREE.Vector3();
  const focusEnvelopePosition = new THREE.Vector3(), focusEnvelopeTarget = new THREE.Vector3();
  const aim = new THREE.Vector3(), stagedPosition = new THREE.Vector3();
  const elevation = THREE.MathUtils.degToRad(61);
  const backward = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
  const upward = new THREE.Vector3(0, Math.cos(elevation), -Math.sin(elevation));
  const defaults = [[-.92, -.25], [-.38, .46], [.34, -.45], [.91, .19], [.32, .86]];
  const focus = defaults.map(([x, z]) => new THREE.Vector3(x, TABLE.y + .1357, z));
  const previousFocus = focus.map(point => point.clone());
  const focusEnvelope = Array.from({ length: 10 }, () => new THREE.Vector3());
  // Two sets of die corners plus eight compact-cup corners. Refit only on a new
  // layout or resize; a stationary result performs no fitting or allocation.
  const corners = Array.from({ length: 88 }, () => ({ x: 0, v: 0, depth: 0, horizontal: 0 }));
  const safe = { top: 0, bottom: 0, left: 0, right: 0 };
  let mode = 'table', blend = 0, zoom = 0, fromBlend = 0, fromZoom = 0, to = 0;
  let elapsed = 0, duration = 0, focusElapsed = 0, focusDuration = 0, disposed = false;
  let viewportWidth = width, viewportHeight = height;
  const smooth = value => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * t * (10 + t * (-15 + 6 * t)); };

  function apply() {
    // First establish the oblique angle, then dolly a further 28% toward the
    // artwork. The second stage is real perspective travel, not a UI scale.
    stagedPosition.copy(dicePosition).addScaledVector(backward, dicePosition.distanceTo(diceTarget) * .28 * (1 - zoom));
    camera.position.lerpVectors(tablePosition, stagedPosition, blend);
    aim.lerpVectors(tableTarget, diceTarget, blend);
    camera.lookAt(aim); camera.updateMatrixWorld(true);
  }
  function fit(points, position, target, arcHeight = 0) {
    const aspect = viewportWidth / viewportHeight;
    const tan = Math.tan(THREE.MathUtils.degToRad(shot.fov) / 2);
    const top = 1 - 2 * safe.top / viewportHeight, bottom = -1 + 2 * safe.bottom / viewportHeight;
    const horizontal = 1 - 2 * safe.left / viewportWidth, cupHorizontal = 1 - 16 / viewportWidth;
    let count = 0, averageDepth = 0;
    function corner(x, y, z, limit) {
      const point = corners[count++];
      point.x = x; point.v = y * upward.y + z * upward.z;
      point.depth = y * backward.y + z * backward.z; point.horizontal = limit;
    }
    for (let i = 0; i < points.length; i++) {
      const point = points[i]; averageDepth += point.y * backward.y + point.z * backward.z;
      // Cover the rounded die's small settled yaw and its entire top face.
      for (let x = -1; x <= 1; x += 2) for (let y = 0; y <= 1; y++) for (let z = -1; z <= 1; z += 2)
        corner(point.x + x * .157, point.y - .1357 + y * (.305 + arcHeight), point.z + z * .157, horizontal);
    }
    // Match the .42-scale parked cup near the left rail. The small allowance
    // covers its .394-radius rolled rim without reserving its casting size.
    for (let x = -1; x <= 1; x += 2) for (let y = 0; y <= 1; y++) for (let z = -1; z <= 1; z += 2)
      corner(-1.45 + x * .174, TABLE.y + .06 + y * .43, .80 + z * .174, cupHorizontal);
    // Solve the shared view-plane intervals, rather than wasting space on the
    // corners of one large axis-aligned rectangle that contains no dice.
    let left, right, lower, upper;
    function fits(depth) {
      left = lower = -Infinity; right = upper = Infinity;
      for (let i = 0; i < count; i++) {
        const point = corners[i], span = tan * (depth - point.depth);
        if (span <= 0) return false;
        const halfWidth = point.horizontal * span * aspect;
        left = Math.max(left, point.x - halfWidth); right = Math.min(right, point.x + halfWidth);
        lower = Math.max(lower, point.v - top * span); upper = Math.min(upper, point.v - bottom * span);
      }
      return left <= right && lower <= upper;
    }
    let near = 0, far = 64;
    for (let iteration = 0; iteration < 32; iteration++) {
      const depth = (near + far) * .5;
      if (fits(depth)) far = depth; else near = depth;
    }
    fits(far);
    position.set((left + right) * .5, 0, 0).addScaledVector(upward, (lower + upper) * .5).addScaledVector(backward, far);
    target.copy(position).addScaledVector(backward, -(far - averageDepth / points.length));
  }
  function applyFocus() {
    // Open ahead of the .34s held-die arc, then settle closer once it lands.
    // Interpolating only to the final shot can let the fast die outrun the frame.
    if (focusElapsed <= .34) {
      const t = smooth(focusElapsed / .18);
      dicePosition.lerpVectors(focusStartPosition, focusEnvelopePosition, t);
      diceTarget.lerpVectors(focusStartTarget, focusEnvelopeTarget, t);
    } else {
      const t = smooth((focusElapsed - .34) / .24);
      dicePosition.lerpVectors(focusEnvelopePosition, focusEndPosition, t);
      diceTarget.lerpVectors(focusEnvelopeTarget, focusEndTarget, t);
    }
  }
  function setDiceFocus(points, { snap = false } = {}) {
    if (disposed || !points || points.length !== 5) return false;
    for (let i = 0; i < 5; i++) if (!points[i] || !Number.isFinite(points[i].x) || !Number.isFinite(points[i].y) || !Number.isFinite(points[i].z)) return false;
    let changed = false;
    for (let i = 0; i < 5; i++) if (focus[i].distanceToSquared(points[i]) > 1e-10) changed = true;
    if (!changed && !snap) return false;
    for (let i = 0; i < 5; i++) {
      previousFocus[i].copy(focus[i]); focusEnvelope[i].copy(focus[i]);
      focus[i].copy(points[i]); focusEnvelope[i + 5].copy(points[i]);
    }
    focusStartPosition.copy(dicePosition); focusStartTarget.copy(diceTarget);
    fit(focus, focusEndPosition, focusEndTarget);
    fit(focusEnvelope, focusEnvelopePosition, focusEnvelopeTarget, .13);
    focusElapsed = 0; focusDuration = !snap && blend > 0 ? .58 : 0;
    if (!focusDuration) { dicePosition.copy(focusEndPosition); diceTarget.copy(focusEndTarget); }
    apply(); return true;
  }
  function resize(nextWidth, nextHeight) {
    if (disposed) return;
    viewportWidth = Math.max(1, Number(nextWidth) || 1); viewportHeight = Math.max(1, Number(nextHeight) || 1);
    const aspect = viewportWidth / viewportHeight, compact = viewportHeight < 620;
    camera.aspect = aspect; camera.fov = shot.fov; camera.updateProjectionMatrix();
    tablePosition.copy(tableTarget).addScaledVector(tableOffset, Math.max(1, pull / aspect));
    // Mesh bounds reserve another 22–30px for external result/held labels.
    safe.top = Math.min(compact ? 88 : 112, viewportHeight * .22);
    safe.bottom = Math.min(compact ? 114 : 142, viewportHeight * .285);
    safe.left = safe.right = Math.min(16, viewportWidth * .035);
    fit(focus, focusEndPosition, focusEndTarget);
    if (focusDuration) {
      fit(previousFocus, focusStartPosition, focusStartTarget);
      fit(focusEnvelope, focusEnvelopePosition, focusEnvelopeTarget, .13);
      applyFocus();
    } else { dicePosition.copy(focusEndPosition); diceTarget.copy(focusEndTarget); }
    apply();
  }
  function setView(next, { reduced = false } = {}) {
    if (disposed) return;
    if (next !== 'table' && next !== 'dice') throw new RangeError('Yatzy camera view must be table or dice.');
    const target = next === 'dice' ? 1 : 0; mode = next;
    if (reduced) {
      blend = zoom = fromBlend = fromZoom = to = target; elapsed = duration = focusDuration = 0;
      dicePosition.copy(focusEndPosition); diceTarget.copy(focusEndTarget); apply(); return;
    }
    if (to === target) return;
    fromBlend = blend; fromZoom = zoom; to = target; elapsed = 0;
    duration = target ? 1.16 : .86;
  }
  function update(dt) {
    if (disposed || !(dt > 0) || (!duration && !focusDuration)) return false;
    if (duration) {
      elapsed = Math.min(duration, elapsed + dt);
      const angle = smooth(elapsed / (to ? .78 : .86));
      const dolly = smooth((elapsed - (to ? .44 : 0)) / (to ? .72 : .72));
      blend = THREE.MathUtils.lerp(fromBlend, to, angle); zoom = THREE.MathUtils.lerp(fromZoom, to, dolly);
      if (elapsed === duration) { blend = zoom = to; duration = 0; }
    }
    if (focusDuration) {
      focusElapsed = Math.min(focusDuration, focusElapsed + dt);
      applyFocus();
      if (focusElapsed === focusDuration) focusDuration = 0;
    }
    apply(); return true;
  }
  resize(width, height);
  return { setView, setDiceFocus, update, resize,
    isViewTransitioning: () => duration > 0 || focusDuration > 0,
    getState: () => ({ mode, blend, zoom, transitioning: duration > 0 || focusDuration > 0, reframing: focusDuration > 0, width: viewportWidth, height: viewportHeight, safe: { ...safe } }),
    dispose() { disposed = true; duration = focusDuration = 0; },
  };
}

function roundedPath(width, depth, radius, Path = THREE.Shape) {
  const s = new Path(), x = width / 2, z = depth / 2, r = Math.min(radius, x, z);
  s.moveTo(-x + r, -z); s.lineTo(x - r, -z);
  s.quadraticCurveTo(x, -z, x, -z + r); s.lineTo(x, z - r);
  s.quadraticCurveTo(x, z, x - r, z); s.lineTo(-x + r, z);
  s.quadraticCurveTo(-x, z, -x, z - r); s.lineTo(-x, -z + r);
  s.quadraticCurveTo(-x, -z, -x + r, -z); s.closePath();
  return s;
}

function slab(width, depth, height, radius, bevel = .035) {
  const geometry = new THREE.ExtrudeGeometry(roundedPath(width, depth, radius), {
    depth: height, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 3, curveSegments: 7, steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// All static wood sharing one finish becomes one draw, including the rounded
// joinery. Keep the chair separate so a seating pose can adjust its position.
function mergeParts(parts) {
  const arrays = { position: [], normal: [], uv: [] };
  for (const source of parts) {
    const geometry = source.index ? source.toNonIndexed() : source;
    for (const key of Object.keys(arrays)) {
      const attribute = geometry.getAttribute(key);
      for (const value of attribute.array) arrays[key].push(value);
    }
    if (geometry !== source) geometry.dispose();
    source.dispose();
  }
  const result = new THREE.BufferGeometry();
  for (const key of Object.keys(arrays)) result.setAttribute(key, new THREE.Float32BufferAttribute(arrays[key], key === 'uv' ? 2 : 3));
  result.computeBoundingSphere();
  return result;
}

function surfaceTexture(kind, size = 512) {
  const data = new Uint8Array(size * size * 4), tau = Math.PI * 2;
  let seed = kind === 'wood' ? 27411 : 48139;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = seed / 4294967296 - .5, u = x / size, v = y / size;
    let r, g, b;
    if (kind === 'wood') {
      const warp = .32 * Math.sin(u * tau * 2) + .16 * Math.sin(u * tau * 5 + v * tau);
      const rings = Math.sin(v * tau * 9 + warp), fibres = Math.sin(v * tau * 91 + warp * 3);
      const pore = Math.pow(Math.max(0, Math.sin(v * tau * 43 + warp)), 12);
      const value = rings * 8 + fibres * 2.5 - pore * 5 + grain * 4;
      r = 156 + value; g = 109 + value * .76; b = 70 + value * .48;
    } else {
      // Fine crossed fibres, with mipmaps, read as felt rather than a noisy photograph.
      const weave = Math.sin(u * tau * 173) * Math.sin(v * tau * 167) * 1.4;
      const nap = Math.sin(u * tau * 3 + Math.sin(v * tau * 2)) * .45;
      const value = grain * 5 + weave + nap;
      r = 67 + value; g = 114 + value; b = 87 + value * .85;
    }
    const i = (y * size + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `Yatzy ${kind} · authored grain`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 2;
  texture.repeat.setScalar(kind === 'wood' ? .62 : 1.6); texture.needsUpdate = true;
  return texture;
}

/** The physical table is independently constructible for geometry checks. */
export function createYatzyTable() {
  const group = new THREE.Group(); group.name = 'Yatzy · handcrafted woodland table';
  const chair = new THREE.Group(); chair.name = 'Mosi’s chair'; chair.position.z = -3.35;
  const woodTexture = surfaceTexture('wood'), feltTexture = surfaceTexture('felt');
  const wood = new THREE.MeshStandardMaterial({ color: '#fff0d4', map: woodTexture, bumpMap: woodTexture, bumpScale: .016, roughness: .72, metalness: 0 });
  const darkWood = new THREE.MeshStandardMaterial({ color: '#b98c61', map: woodTexture, roughness: .85 });
  const felt = new THREE.MeshStandardMaterial({ color: '#e1e6d3', map: feltTexture, bumpMap: feltTexture, bumpScale: .0035, roughness: .98, metalness: 0 });
  const piping = new THREE.MeshStandardMaterial({ color: '#a7b68d', roughness: .9 });
  const inlay = new THREE.MeshStandardMaterial({ color: '#d5b575', roughness: .66, metalness: 0 });
  const geometries = new Set(), materials = new Set([wood, darkWood, felt, piping, inlay]);
  let disposed = false;
  function add(geometry, material, name, parent = group) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function rail(outerW, outerD, innerW, innerD, radius, y, height, bevel = .02) {
    const shape = roundedPath(outerW, outerD, radius);
    shape.holes.push(roundedPath(innerW, innerD, Math.max(.05, radius - (outerW - innerW) / 2), THREE.Path));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 8, steps: 1 });
    return geometry.rotateX(-Math.PI / 2).translate(0, y, 0);
  }
  const tabletop = [slab(6.34, 4.34, .17, .4, .045).translate(0, 1.13, 0), rail(6.32, 4.32, 5.8, 3.8, .39, 1.32, .16, .035)];
  add(mergeParts(tabletop), wood, 'Rounded oak tabletop and raised rolling rail');
  const under = [];
  for (const x of [-2.55, 2.55]) for (const z of [-1.55, 1.55]) under.push(slab(.25, .29, 1.05, .065).translate(x, .035, z));
  under.push(slab(5.4, .16, .24, .05).translate(0, .84, 1.65), slab(5.4, .16, .24, .05).translate(0, .84, -1.65));
  for (const x of [-2.55, 2.55]) under.push(slab(.18, 3.5, .22, .045).translate(x, .83, 0));
  add(mergeParts(under), darkWood, 'Table aprons and tapered corner supports');
  const cloth = new THREE.ShapeGeometry(roundedPath(5.8, 3.8, .22), 14).rotateX(-Math.PI / 2).translate(0, TABLE.y, 0);
  add(cloth, felt, 'Playable green felt').castShadow = false;
  add(rail(5.79, 3.79, 5.74, 3.74, .22, 1.401, .008, .002), piping, 'Fine stitched felt perimeter').castShadow = false;
  add(rail(6.12, 4.12, 6.085, 4.085, .31, 1.518, .003, 0), inlay, 'Pale timber inlay').castShadow = false;

  const chairParts = [slab(1.74, 1.35, .13, .14).translate(0, .555, 0)];
  for (const x of [-.76, .76]) {
    chairParts.push(slab(.15, .17, 2.8, .045).translate(x, .04, -.58));
    chairParts.push(slab(.16, .17, .65, .045).translate(x, .035, .48));
    chairParts.push(slab(.14, 1.2, .12, .04).translate(x, 1.05, 0));
  }
  chairParts.push(slab(1.8, .18, .22, .065).translate(0, 2.72, -.58));
  chairParts.push(slab(1.6, .13, .16, .04).translate(0, 1.1, -.58));
  for (const x of [-.48, 0, .48]) chairParts.push(slab(.19, .12, 1.45, .04).translate(x, 1.26, -.58));
  add(mergeParts(chairParts), wood, 'Rounded chair joinery', chair);
  group.add(chair);
  return {
    group, chair,
    dispose() {
      if (disposed) return; disposed = true;
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      woodTexture.dispose(); feltTexture.dispose();
    },
  };
}

/** One shared REMAKE scene. The controller owns RAF, actors, dice and game time. */
export async function createYatzyWorld(canvas, { shot = SHOT } = {}) {
  const params = new URLSearchParams(globalThis.location?.search || '');
  const preset = pickQuality(params);
  // This is an intimate table clearing, with less distant vegetation to shade.
  const q = { ...preset, grass: preset.grass * .48, trees: preset.trees * .7, plants: preset.plants * .7 };
  const baseLook = pickLook('morning');
  const look = { ...baseLook, sun: { ...baseLook.sun, azimuth: 135, elevation: 44, intensity: 3.05 }, hemi: { ...baseLook.hemi, intensity: .58 }, fog: { ...baseLook.fog, color: '#bdcec3', density: .0145 }, envIntensity: .62 };
  // Same colour and shadow pipeline as engine/renderer, with an owned resize
  // observer so repeated game mounting leaves no anonymous window listener.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = look.exposure; renderer.shadowMap.enabled = q.shadowSize > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap; renderer.info.autoReset = false;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(shot.fov, 1.5, .1, 700);
  camera.name = 'Yatzy · across the table';
  const lighting = createLighting(scene, look, q);
  const depthShadow = installDepthShadows(renderer, lighting.sun);
  installFog(scene, look, lighting.direction);
  const sky = createSky({ renderer, scene, look, sunDir: lighting.direction });
  const wind = createWind(); wind.uniforms.uWindStrength.value = .65;
  const actors = new Map();
  const layout = {
    seed: 27641, clearing: { center: [0, -1.5], radius: 5.8 }, forestEdge: 12.4,
    path: [[-24, 8], [-10, 5], [0, 2.6], [8, -.2], [20, -7]],
    glade: { ferns: 1.8, shafts: 2 }, leafShadows: true,
    // The clearing overlooks a gently falling wooded hollow. Lower distant
    // crowns replace the flat carpet of ground and repetitive full-height trunks.
    lift(x, z) { return -Math.min(5.5, Math.max(0, -z - 6) * .2) * THREE.MathUtils.smoothstep(Math.hypot(x, z + 1.5), 6, 14); },
    shots: { table: SHOT, narrow: { position: [-.4, 3.7, 6.2], target: SHOT.target, fov: 41 }, ...(shot === SHOT ? {} : { own: shot }) },
    actors: { mosi: { position: [0, 0, -3.4], heading: 90 }, table: { position: [0, 0, 0], heading: 0 } },
  };
  const world = { THREE, scene, camera, renderer, q, params, look, lighting, wind, actors, chapter: { look: 'morning', layout, shots: layout.shots, actors: layout.actors }, heightAt: () => 0 };
  world.resolvePoint = createPointResolver(world); world.points = world.resolvePoint;
  const furniture = createYatzyTable(); scene.add(furniture.group);
  let disposed = false, resolution = 1, frameTime = 0, frameCount = 0, environmentTime = 0, lastAdapt = 0;
  let forest, resizeObserver;
  const focus = new THREE.Vector3(0, 1.3, -1.2); lighting.focus(focus, 5.7);
  const cameraRig = createYatzyCameraRig(camera, { shot });

  function resize() {
    if (disposed) return;
    const width = Math.max(1, canvas.clientWidth || 1000), height = Math.max(1, canvas.clientHeight || 720);
    renderer.setPixelRatio(Math.min(q.pixelRatio * resolution, globalThis.devicePixelRatio || 1, q.maxPixelRatio));
    renderer.setSize(width, height, false); cameraRig.resize(width, height);
    forest?.update(0, environmentTime);
  }
  resize();
  try {
    forest = await createForest(world, layout); world.forest = forest;
    world.heightAt = (x, z) => forest.heightAt(x, z);
    forest.actorWarm = .25;
    resize();
  } catch (error) {
    furniture.dispose(); sky.dispose(); depthShadow?.target.dispose(); lighting.sun.dispose(); renderer.dispose();
    throw error;
  }
  resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(canvas);
  else globalThis.addEventListener?.('resize', resize);

  function update(dt = 0, time) {
    if (disposed) return;
    const delta = Math.min(.1, Math.max(0, Number(dt) || 0));
    if (delta > 0) environmentTime = Number.isFinite(time) ? time : environmentTime + delta;
    cameraRig.update(delta);
    wind.update(environmentTime); sky.update(environmentTime, camera);
    // Actors are advanced by their opponent adapter, exactly once per frame.
    scene.updateMatrixWorld(); forest.update(delta, environmentTime);
    updateCharacterLods(camera, canvas.height);
    if (q.dynamicResolution && delta > 0) {
      frameTime += delta; frameCount++;
      if (frameTime >= 1.1) {
        const average = frameTime / frameCount, before = resolution;
        if (average > .036) resolution = Math.max(.65, resolution - .1);
        else if (average < .025 && environmentTime - lastAdapt > 4) resolution = Math.min(1, resolution + .05);
        frameTime = frameCount = 0;
        if (before !== resolution) { lastAdapt = environmentTime; resize(); }
      }
    }
  }
  function render() {
    if (disposed) return;
    renderer.info.reset(); renderer.render(scene, camera);
  }
  Object.assign(world, {
    table: TABLE, chair: furniture.chair, update, render, resize,
    setView: cameraRig.setView, setDiceFocus: cameraRig.setDiceFocus, isViewTransitioning: cameraRig.isViewTransitioning, getViewState: cameraRig.getState,
    getStats() {
      return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, resolutionScale: resolution, forestTriangles: forest.stats.submitted, forestShadowTriangles: forest.stats.casterTris };
    },
    dispose() {
      if (disposed) return; disposed = true;
      resizeObserver?.disconnect(); globalThis.removeEventListener?.('resize', resize); cameraRig.dispose();
      // Opponent/dice/effect adapters release their own resources first.
      forest.dispose(); furniture.dispose(); sky.dispose();
      scene.environment = null; depthShadow?.target.dispose();
      lighting.sun.shadow.map = null; lighting.sun.dispose();
      scene.clear(); renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss();
    },
  });
  update(0, 0);
  return world;
}
