import * as THREE from 'three';

// The board's little effects (spec section 4, "Sjónbrellur"): dust and leaves where a piece lands, glitter along a neck or a tail
// as it is ridden, a splash at a tail's end, fireflies swirling round a piece they carry, a splat of mud, a fossil's sparkle and
// fireworks over the top square at a win. They are cheap on purpose: two point clouds of a few hundred points each (two draw calls
// whatever is going on), one with soft shapes drawn over the scene (dust, leaves, mud) and one that glows (glitter, fireflies,
// sparkles, fireworks), each point a disc, a four-pointed star or a leaf drawn in its fragment shader.
//
//   const sparks = createSparks(world)          world: createHalsWorld's (its scene, camera, renderer and addUpdater)
//   sparks.dust(p) / leaves(p) / glitter(p) / splash(p) / firefly(p) / mud(p) / sparkle(p) / fireworks(p)   p: a Vector3
//   sparks.calm = true                           fewer of them, slower
//   sparks.clear(), sparks.dispose()
// They live on the world's clock (its updaters), so they hold while the world is not updated.

const SOFT = 320; // points in the soft cloud
const GLOW = 560; // and in the glowing one
const KIND = { disc: 0, star: 1, leaf: 2 };

const VERTEX = `
attribute vec4 aColor;
attribute float aSize;
attribute float aKind;
uniform float uScale;
varying vec4 vColor;
varying float vKind;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 1.0, 160.0);
  vColor = aColor;
  vKind = aKind;
}`;
// The colours are what the screen shows (the material skips the renderer's tone mapping and colour space, as a sprite of paint).
const FRAGMENT = `
varying vec4 vColor;
varying float vKind;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  float a;
  if (vKind < 0.5) {
    a = smoothstep(1.0, 0.25, d);
  } else if (vKind < 1.5) {
    float rays = max(0.0, 1.0 - abs(p.x * p.y) * 18.0 - d * 0.95);
    a = max(smoothstep(0.42, 0.0, d), rays);
  } else {
    vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.7071;
    a = smoothstep(1.0, 0.8, length(vec2(q.x * 2.0, q.y * 1.05)));
  }
  a *= vColor.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

const rand = (a, b) => a + Math.random() * (b - a);
const colourOf = hex => new THREE.Color(hex); // the hex as the screen shows it (no conversion: see FRAGMENT)

function createCloud(size, blending, name) {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(size * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const color = new THREE.BufferAttribute(new Float32Array(size * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const sizes = new THREE.BufferAttribute(new Float32Array(size), 1).setUsage(THREE.DynamicDrawUsage);
  const kinds = new THREE.BufferAttribute(new Float32Array(size), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('aColor', color);
  geometry.setAttribute('aSize', sizes);
  geometry.setAttribute('aKind', kinds);
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.frustumCulled = false;
  points.renderOrder = 5;
  return { points, geometry, material, size, live: [] };
}

export function createSparks(world) {
  const soft = createCloud(SOFT, THREE.NormalBlending, 'Háls og hali: dust and leaves');
  const glow = createCloud(GLOW, THREE.AdditiveBlending, 'Háls og hali: glitter and fireworks');
  world.scene.add(soft.points, glow.points);
  let calm = false;
  const scaleOf = () => (calm ? 0.5 : 1);

  /** One point: where, how it flies and how it looks over its life. */
  function add(cloud, p, o) {
    if (cloud.live.length >= cloud.size) cloud.live.shift(); // the oldest gives way
    const speed = calm ? 0.6 : 1;
    cloud.live.push({
      x: p.x + (o.dx ?? 0), y: p.y + (o.dy ?? 0), z: p.z + (o.dz ?? 0),
      vx: (o.vx ?? 0) * speed, vy: (o.vy ?? 0) * speed, vz: (o.vz ?? 0) * speed,
      gravity: (o.gravity ?? 0) * speed, drag: o.drag ?? 0, swirl: o.swirl ?? 0, phase: Math.random() * 6.28,
      age: 0, life: o.life ?? 1, size: o.size ?? 0.2, grow: o.grow ?? 1,
      colour: o.colour, alpha: o.alpha ?? 1, fadeIn: o.fadeIn ?? 0.05, kind: o.kind ?? KIND.disc, then: o.then ?? null,
    });
  }

  const DUST = ['#c9b08a', '#b89e78', '#d8c4a0'].map(colourOf);
  const LEAVES = ['#7fb04e', '#a8c95a', '#e0b84a', '#6f9a3f'].map(colourOf);
  const GOLD = ['#ffe9a0', '#fff6d0', '#ffd25a'].map(colourOf);
  const FIREFLY = ['#fff3a0', '#e8ff9a', '#ffe070'].map(colourOf);
  const MUD = ['#5e4630', '#6f5238', '#4c3826'].map(colourOf);
  const WATER = ['#e9f4ff', '#cfe6f5', '#ffffff'].map(colourOf);
  const FIREWORK = [['#ff8a7a', '#ffd0c4'], ['#ffd25a', '#fff2c0'], ['#8fd96a', '#e2ffcf'], ['#7cc0ff', '#e2f2ff'], ['#d9a8f0', '#f6e6ff']]
    .map(pair => pair.map(colourOf));
  const pick = list => list[Math.floor(Math.random() * list.length)];

  const api = {
    /** A puff of dust round a landing. */
    dust(p, { count = 12 } = {}) {
      const n = Math.round(count * scaleOf());
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), s = rand(0.9, 2.0);
        add(soft, p, {
          dx: Math.cos(a) * 0.3, dy: 0.08, dz: Math.sin(a) * 0.2, vx: Math.cos(a) * s, vy: rand(0.5, 1.3), vz: Math.sin(a) * s * 0.6,
          gravity: -1.5, drag: 2.6, life: rand(0.55, 0.9), size: rand(0.28, 0.42), grow: 2.2, colour: pick(DUST), alpha: 0.55, kind: KIND.disc,
        });
      }
    },
    /** A few leaves flung up, fluttering down. */
    leaves(p, { count = 5 } = {}) {
      const n = Math.max(1, Math.round(count * scaleOf()));
      for (let i = 0; i < n; i++) {
        add(soft, p, {
          dy: 0.2, vx: rand(-1.6, 1.6), vy: rand(2.2, 3.4), vz: rand(-0.3, 0.6), gravity: -4.2, drag: 1.4, swirl: 1.6,
          life: rand(1.1, 1.6), size: rand(0.2, 0.28), grow: 1, colour: pick(LEAVES), alpha: 1, kind: KIND.leaf,
        });
      }
    },
    /** Glitter where a piece is riding: a few little stars that hang and fade. */
    glitter(p, { count = 2 } = {}) {
      for (let i = 0; i < count; i++) {
        add(glow, p, {
          dx: rand(-0.45, 0.45), dy: rand(0.1, 0.8), dz: rand(-0.3, 0.3), vx: rand(-0.3, 0.3), vy: rand(0.1, 0.6), vz: rand(-0.2, 0.2),
          gravity: -0.2, drag: 1.5, life: rand(0.5, 0.9), size: rand(0.18, 0.32), grow: 0.2, colour: pick(GOLD), alpha: 0.95, kind: KIND.star,
        });
      }
    },
    /** A splash where a tail sets a piece down: a ring of dust, leaves and bright droplets. */
    splash(p) {
      api.dust(p, { count: 18 });
      api.leaves(p, { count: 6 });
      const n = Math.round(14 * scaleOf());
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, s = rand(1.6, 2.8);
        add(soft, p, {
          dy: 0.15, vx: Math.cos(a) * s, vy: rand(2.4, 3.6), vz: Math.sin(a) * s * 0.5, gravity: -9, drag: 0.6,
          life: rand(0.5, 0.75), size: rand(0.1, 0.16), grow: 0.6, colour: pick(WATER), alpha: 0.9, kind: KIND.disc,
        });
      }
    },
    /** Fireflies round a piece they carry: a few glowing specks that swirl and wink out (called every few frames). */
    firefly(p, { count = 2 } = {}) {
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2), r = rand(0.5, 1.1);
        add(glow, p, {
          dx: Math.cos(a) * r, dy: rand(0.3, 1.5), dz: Math.sin(a) * r * 0.6, vx: -Math.sin(a) * 1.2, vy: rand(-0.2, 0.4), vz: Math.cos(a) * 0.6,
          drag: 0.8, swirl: 3.2, life: rand(0.9, 1.5), size: rand(0.16, 0.26), grow: 0.7, colour: pick(FIREFLY), alpha: 1, fadeIn: 0.25, kind: KIND.disc,
        });
      }
    },
    /** A splat of mud: dark blobs thrown up and out, falling back. */
    mud(p) {
      const n = Math.round(14 * scaleOf());
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), s = rand(0.8, 2.2);
        add(soft, p, {
          dy: 0.15, vx: Math.cos(a) * s, vy: rand(2.0, 3.6), vz: Math.sin(a) * s * 0.5, gravity: -9.5, drag: 0.5,
          life: rand(0.5, 0.8), size: rand(0.16, 0.3), grow: 0.8, colour: pick(MUD), alpha: 0.95, kind: KIND.disc,
        });
      }
    },
    /** A fossil's sparkle: gold stars rising round the find. */
    sparkle(p) {
      const n = Math.round(18 * scaleOf());
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        add(glow, p, {
          dx: Math.cos(a) * 0.35, dy: rand(0.2, 0.6), dz: Math.sin(a) * 0.25, vx: Math.cos(a) * rand(0.5, 1.3), vy: rand(1.2, 2.4), vz: Math.sin(a) * 0.5,
          gravity: -0.8, drag: 1.4, life: rand(0.9, 1.4), size: rand(0.26, 0.42), grow: 0.3, colour: pick(GOLD), alpha: 1, kind: KIND.star,
        });
      }
    },
    /** One firework: a spark climbs from `p` and bursts high over it in a ball of colour. */
    firework(p, { height = 7, colour = pick(FIREWORK) } = {}) {
      const [bright, pale] = colour;
      const climb = rand(0.55, 0.8);
      add(glow, p, {
        vx: rand(-0.6, 0.6), vy: height / climb, gravity: 0, drag: 0, life: climb, size: 0.3, grow: 0.6, colour: pale, alpha: 1, kind: KIND.star,
        then: at => {
          world.onBoom?.();
          const n = Math.round(46 * scaleOf());
          for (let i = 0; i < n; i++) {
            const u = rand(-1, 1), a = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u), s = rand(4.2, 5.6);
            add(glow, at, {
              vx: r * Math.cos(a) * s, vy: u * s, vz: r * Math.sin(a) * s * 0.5, gravity: -2.6, drag: 1.3,
              life: rand(1.2, 1.8), size: rand(0.3, 0.45), grow: 0.25, colour: i % 3 ? bright : pale, alpha: 1, kind: i % 4 ? KIND.disc : KIND.star,
            });
          }
        },
      });
    },
    /** Fireworks over the top square at a win: a few, one after another. */
    fireworks(p, { count = 5 } = {}) {
      const n = calm ? 2 : count;
      for (let i = 0; i < n; i++) {
        const at = p.clone().add(new THREE.Vector3(rand(-6, 6), rand(0, 1), rand(-1, 0.5)));
        world.wait(i * 0.55 + rand(0, 0.2)).then(() => api.firework(at, { height: rand(5, 8.5) }));
      }
    },
    get calm() { return calm; },
    set calm(value) { calm = Boolean(value); },
    clear() { soft.live.length = 0; glow.live.length = 0; },
    dispose() {
      for (const cloud of [soft, glow]) {
        cloud.points.removeFromParent();
        cloud.geometry.dispose();
        cloud.material.dispose();
      }
    },
  };

  /** Each frame: every point flies, ages and is written out; the dead ones go (and a climbing firework bursts). */
  function update(dt) {
    const height = world.renderer?.getDrawingBufferSize?.(new THREE.Vector2()).y ?? 800;
    const scale = height / (2 * Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2)));
    const bursts = [];
    for (const cloud of [soft, glow]) {
      cloud.material.uniforms.uScale.value = scale;
      const pos = cloud.geometry.attributes.position.array;
      const col = cloud.geometry.attributes.aColor.array;
      const siz = cloud.geometry.attributes.aSize.array;
      const kin = cloud.geometry.attributes.aKind.array;
      let n = 0;
      const keep = [];
      for (const q of cloud.live) {
        q.age += dt;
        if (q.age >= q.life) {
          if (q.then) bursts.push([q.then, new THREE.Vector3(q.x, q.y, q.z)]);
          continue;
        }
        const k = Math.exp(-q.drag * dt);
        q.vx *= k; q.vy *= k; q.vz *= k;
        q.vy += q.gravity * dt;
        if (q.swirl) {
          q.phase += dt * q.swirl;
          q.vx += Math.cos(q.phase) * q.swirl * 0.6 * dt;
          q.vz += Math.sin(q.phase) * q.swirl * 0.3 * dt;
        }
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        const t = q.age / q.life;
        const fade = Math.min(1, q.age / Math.max(0.001, q.fadeIn)) * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
        pos[n * 3] = q.x; pos[n * 3 + 1] = q.y; pos[n * 3 + 2] = q.z;
        col[n * 4] = q.colour.r; col[n * 4 + 1] = q.colour.g; col[n * 4 + 2] = q.colour.b; col[n * 4 + 3] = q.alpha * fade;
        siz[n] = q.size * (1 + (q.grow - 1) * t);
        kin[n] = q.kind;
        n++;
        keep.push(q);
      }
      cloud.live = keep;
      cloud.geometry.setDrawRange(0, n);
      cloud.points.visible = n > 0;
      if (n) for (const name of ['position', 'aColor', 'aSize', 'aKind']) cloud.geometry.attributes[name].needsUpdate = true;
    }
    for (const [then, at] of bursts) then(at);
  }
  world.addUpdater(update);
  return api;
}
