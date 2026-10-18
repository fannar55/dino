import * as THREE from 'three';

// The die of "Háls og hali" (spec section 5): a big dinosaur egg in a little nest. A tap rolls it: it wobbles, hops and spins,
// lands, cracks along a zigzag, its top pops off and 1 to 6 golden dots float up out of it, set as a die's face. close() puts the
// top back for the next throw. The number is the game's (rules.js roll()); the egg only shows it.
//
//   const egg = createEggDie()
//   camera.add(egg.object); egg.object.position.set(...)   it is an ordinary Object3D, about 1.3 units tall with its nest
//   await egg.roll(n, { onWobble, onCrack, onDots })        resolves (with n) once all n dots are out
//   await egg.close()                                        the dots sink back, the top comes down
//   egg.hit(raycaster)                                       whether a ray (a tap) meets it
//   egg.invite = true                                        a little wiggle now and then, to say "tap me"
//   egg.update(dt), egg.dispose()
// With `calm` (prefers-reduced-motion) the egg does not hop or spin: it cracks and the dots fade in.

const R = 0.42; // the egg's radius at its widest
const H = 0.56; // half its height
const SEAM = 0.12; // where it cracks, as a share of the half height above the middle
const TEETH = 7; // the zigzag's teeth round the egg
const SPOTS = '#9fcf9a'; // soft green, as the nest's eggs in the valley have
const SHELL = '#f7f0de';
const GOLD = '#ffc93a';

// where the spots sit on the shell (directions from its middle) and how big they are (radians): a golden-angle spiral
const SPOT_CENTRES = Array.from({ length: 16 }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / 16, r = Math.sqrt(1 - y * y), a = i * 2.39996 + 0.6;
  return [new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), 0.2 + 0.09 * ((i * 7) % 3)];
});
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));
const popIn = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const radiusAt = y => Math.sqrt(Math.max(0, 1 - y * y)) * (1 - 0.13 * y); // y in -1..1: narrower toward the top
const seamAt = a => SEAM + 0.09 * (Math.abs(((a / (Math.PI * 2)) * TEETH * 2) % 2 - 1) * 2 - 1);

/** One part of the shell between the bottom pole and the seam (top = false) or the seam and the top pole (top = true). */
function shellPart(top) {
  const I = 72, J = 22;
  const pos = [], nrm = [], col = [], idx = [];
  const shell = new THREE.Color(SHELL), spot = new THREE.Color(SPOTS), c = new THREE.Color();
  for (let j = 0; j <= J; j++) {
    for (let i = 0; i <= I; i++) {
      const a = (i / I) * Math.PI * 2;
      const s = j / J;
      const ys = seamAt(a);
      const y = top ? ys + (1 - ys) * s : -1 + (ys + 1) * s;
      const r = radiusAt(y);
      const x = Math.cos(a) * r * R, z = Math.sin(a) * r * R;
      pos.push(x, y * H, z);
      const n = new THREE.Vector3(x / (R * R), (y * H) / (H * H) + 0.12 / H, z / (R * R)).normalize();
      nrm.push(n.x, n.y, n.z);
      // round soft spots, spread evenly over the shell
      const dir = new THREE.Vector3(x / R, y, z / R).normalize();
      let near = 0;
      for (const [sp, size] of SPOT_CENTRES) near = Math.max(near, 1 - THREE.MathUtils.smoothstep(dir.angleTo(sp), size * 0.7, size));
      c.copy(shell).lerp(spot, near * 0.85);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < J; j++) for (let i = 0; i < I; i++) {
    const a = j * (I + 1) + i, b = a + I + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function nestGeometry() {
  const parts = [];
  let s = 3;
  const random = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + random() * 0.2;
    const g = new THREE.CylinderGeometry(0.022, 0.03, 0.42 + random() * 0.22, 5);
    g.rotateZ(Math.PI / 2 + (random() - 0.5) * 0.5);
    g.rotateY(-a + Math.PI / 2 + (random() - 0.5) * 0.5);
    const r = R * (0.88 + random() * 0.2);
    g.translate(Math.cos(a) * r, -H * 0.78 + (i % 3) * 0.045 + random() * 0.03, Math.sin(a) * r);
    parts.push(g);
  }
  const merged = new THREE.BufferGeometry();
  // merge by hand: positions and normals only
  let count = 0;
  for (const p of parts) count += p.index.count;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
  let k = 0;
  for (const p of parts) {
    const P = p.attributes.position, N = p.attributes.normal;
    for (let i = 0; i < p.index.count; i++) {
      const v = p.index.getX(i);
      pos.set([P.getX(v), P.getY(v), P.getZ(v)], k * 3);
      nrm.set([N.getX(v), N.getY(v), N.getZ(v)], k * 3);
      k++;
    }
    p.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return merged;
}

// The dots of each face, on a 3 x 3 grid (x right, y up): as a die shows them.
const FACES = {
  1: [[0, 0]],
  2: [[-1, 1], [1, -1]],
  3: [[-1, 1], [0, 0], [1, -1]],
  4: [[-1, 1], [1, 1], [-1, -1], [1, -1]],
  5: [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]],
  6: [[-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]],
};

export function createEggDie({ win = globalThis.window } = {}) {
  const calm = () => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const object = new THREE.Group();
  object.name = 'Egg die';
  const egg = new THREE.Group(); // wobbles, hops and spins
  object.add(egg);
  const shellMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  shellMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = vec3(0.98, 0.86, 0.62) * 0.75;');
  };
  const bottom = new THREE.Mesh(shellPart(false), shellMaterial);
  const topPivot = new THREE.Group(); // the top turns about the back of the seam as it pops off
  const top = new THREE.Mesh(shellPart(true), shellMaterial);
  topPivot.position.set(0, SEAM * H, -R * 0.9);
  top.position.set(0, -SEAM * H, R * 0.9);
  topPivot.add(top);
  egg.add(bottom, topPivot);
  const nest = new THREE.Mesh(nestGeometry(), new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.9 }));
  object.add(nest);
  for (const m of [bottom, top, nest]) { m.castShadow = false; m.receiveShadow = false; }

  // the dots and a soft glow behind them
  const dotMaterial = new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.2 });
  const dotGeometry = new THREE.SphereGeometry(0.1, 16, 12);
  const dots = Array.from({ length: 6 }, () => {
    const d = new THREE.Mesh(dotGeometry, dotMaterial);
    d.visible = false;
    object.add(d);
    return d;
  });
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  {
    const c = glowCanvas.getContext('2d');
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255, 236, 170, 0.95)');
    g.addColorStop(0.5, 'rgba(255, 210, 110, 0.4)');
    g.addColorStop(1, 'rgba(255, 200, 90, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(0, H + 0.42, -0.05);
  glow.visible = false;
  object.add(glow);
  const FACE_Y = H + 0.42, GRID = 0.25;

  let t = 0; // seconds into what it is doing
  let state = 'rest'; // rest | rolling | open | closing
  let shown = 0;
  let pending = null; // { n, resolve, callbacks }
  let idle = 0;
  const sphere = new THREE.Sphere();

  function pose(n, k) {
    // dot i of face n at k (0: in the egg, 1: in its place on the face)
    FACES[n].forEach(([x, y], i) => {
      const d = dots[i];
      const appear = clamp01(k * FACES[n].length - i * 0.6);
      d.visible = appear > 0.001;
      d.position.set(x * GRID * appear, (FACE_Y + y * GRID) * smooth(appear) + 0.0 * (1 - appear), 0.05);
      d.scale.setScalar(Math.max(0.001, popIn(appear)));
    });
    for (let i = FACES[n].length; i < 6; i++) dots[i].visible = false;
  }

  const api = {
    object,
    invite: true,
    get rolling() { return state === 'rolling' || state === 'closing'; },
    get open() { return state === 'open'; },
    roll(n, callbacks = {}) {
      if (state !== 'rest') return Promise.reject(new Error(`the egg is ${state}`));
      if (!FACES[n]) return Promise.reject(new Error(`an egg shows 1..6, not ${n}`));
      state = 'rolling';
      t = 0;
      shown = 0;
      return new Promise(resolve => { pending = { n, resolve, callbacks, cracked: false, dotted: false }; callbacks.onWobble?.(); });
    },
    close() {
      if (state !== 'open') return Promise.resolve();
      state = 'closing';
      t = 0;
      return new Promise(resolve => { pending = { resolve, n: shown }; });
    },
    hit(raycaster) {
      object.updateWorldMatrix(true, false);
      sphere.center.setFromMatrixPosition(object.matrixWorld);
      sphere.radius = 0.75 * object.matrixWorld.getMaxScaleOnAxis();
      return raycaster.ray.intersectsSphere(sphere);
    },
    update(dt) {
      t += dt;
      const still = calm();
      egg.position.set(0, 0, 0);
      egg.rotation.set(0, 0, 0);
      if (state === 'rest') {
        topPivot.rotation.x = 0;
        topPivot.position.y = SEAM * H;
        idle += dt;
        if (api.invite && !still) {
          const w = idle % 3.2;
          if (w < 0.7) egg.rotation.z = Math.sin(w * 22) * 0.12 * Math.sin((Math.PI * w) / 0.7);
          egg.scale.setScalar(1 + 0.015 * Math.sin(idle * 2.4));
        }
        return;
      }
      idle = 0;
      egg.scale.setScalar(1);
      if (state === 'rolling') {
        const p = pending;
        if (!still) {
          // 0 to 0.6 a wobble, 0.6 to 1.3 a hop and a spin, 1.3 to 1.6 the landing's wobble
          if (t < 0.6) egg.rotation.z = Math.sin(t * 26) * 0.28 * (t / 0.6);
          else if (t < 1.3) {
            const u = (t - 0.6) / 0.7;
            egg.position.y = Math.sin(Math.PI * u) * 0.5;
            egg.rotation.y = smooth(u) * Math.PI * 2;
            egg.rotation.z = Math.sin(u * Math.PI * 2) * 0.35;
          } else if (t < 1.6) egg.rotation.z = Math.sin((t - 1.3) * 30) * 0.15 * (1 - (t - 1.3) / 0.3);
        }
        const crack = still ? 0.3 : 1.65;
        if (t >= crack && !p.cracked) { p.cracked = true; p.callbacks.onCrack?.(); }
        // the crack opens, then the top pops up and over backward
        const open = clamp01((t - crack) / 0.15);
        const pop = clamp01((t - crack - 0.2) / 0.45);
        topPivot.position.y = SEAM * H + 0.02 * open + 0.55 * Math.sin(Math.PI * 0.5 * pop);
        topPivot.rotation.x = -2.1 * smooth(pop);
        const out = clamp01((t - crack - 0.35) / 0.8);
        shown = p.n;
        pose(p.n, out);
        glow.visible = out > 0;
        glow.material.opacity = smooth(out);
        if (out >= 1 && !p.dotted) {
          p.dotted = true;
          state = 'open';
          p.callbacks.onDots?.(p.n);
          pending = null;
          p.resolve(p.n);
        }
        return;
      }
      if (state === 'open') {
        topPivot.position.y = SEAM * H + 0.57;
        topPivot.rotation.x = -2.1;
        // the dots bob gently
        dots.forEach((d, i) => { if (d.visible) d.position.y += Math.sin(t * 3 + i) * 0.0015; });
        return;
      }
      if (state === 'closing') {
        const u = clamp01(t / 0.6);
        pose(shown, 1 - u);
        glow.material.opacity = 1 - u;
        topPivot.position.y = SEAM * H + 0.57 * (1 - smooth(u));
        topPivot.rotation.x = -2.1 * (1 - smooth(u));
        if (u >= 1) {
          state = 'rest';
          glow.visible = false;
          dots.forEach(d => { d.visible = false; });
          const p = pending;
          pending = null;
          p?.resolve();
        }
      }
    },
    dispose() {
      object.removeFromParent();
      for (const m of [bottom, top, nest, glow]) m.geometry.dispose();
      dotGeometry.dispose();
      for (const m of [shellMaterial, nest.material, dotMaterial, glow.material]) m.dispose();
      glowTexture.dispose();
    },
  };
  return api;
}
