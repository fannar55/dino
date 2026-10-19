import * as THREE from 'three';

// The board's effects (spec section 4, "Sjónbrellur", and the owner's polish round of 2026-10-19: "meira VFX yfir allt"): dust,
// a dust ring and grass bits where a piece hops, a pop of light on each square counted, glitter spiralling up a neck with a light
// rising ahead of the piece and a happy burst at the top, leaves and speed streaks down a tail and a splash with droplets and a
// ring at its end, a swarm of fireflies gathering round a piece they carry, a splat of mud with bubbles and drips, a fossil dug
// up in dust with a glint and rising out of the ground, and fireworks and confetti over the top square at a win.
//
// They are cheap on purpose: two point clouds (two draw calls whatever is going on), one with soft shapes (dust, leaves, mud,
// rings, confetti) and one of bright ones (glitter, fireflies, sparkles, fireworks), both drawn over the scene, each point a
// disc, a four-pointed star, a leaf, a streak, a flat ring, a round ring or a strip of confetti, drawn in its fragment shader and
// turned by its own angle. A find rising out of the ground is one sprite, drawn only while it shows.
//
//   const sparks = createSparks(world)          world: createHalsWorld's (its scene, camera, renderer and addUpdater)
//   sparks.dust(p) / leaves(p) / glitter(p) / splash(p) / firefly(p) / mud(p) / sparkle(p) / fireworks(p)   p: a Vector3
//   sparks.hop(p) / pop(p) / burst(p) / rise(from, to, seconds) / spiral(p, turn) / streak(p, velocity) / swarm(p)
//   sparks.bubbles(p) / drips(fn, seconds) / dig(p) / find(p, svg) / confetti(p)
//   sparks.calm = true                           fewer of them, slower
//   sparks.clear(), sparks.dispose()
// They live on the world's clock (its updaters), so they hold while the world is not updated.

const SOFT = 520; // points in the soft cloud
const GLOW = 760; // and in the glowing one
const KIND = { disc: 0, star: 1, leaf: 2, streak: 3, ring: 4, halo: 5, strip: 6 };

const VERTEX = `
attribute vec4 aColor;
attribute float aSize;
attribute float aKind;
attribute float aAngle;
uniform float uScale;
varying vec4 vColor;
varying float vKind;
varying vec2 vTurn;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 1.0, 260.0);
  vColor = aColor;
  vKind = aKind;
  vTurn = vec2(cos(aAngle), sin(aAngle));
}`;
// The colours are what the screen shows (the material skips the renderer's tone mapping and colour space, as a sprite of paint).
const FRAGMENT = `
varying vec4 vColor;
varying float vKind;
varying vec2 vTurn;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p = vec2(p.x * vTurn.x - p.y * vTurn.y, p.x * vTurn.y + p.y * vTurn.x); // turned by its angle
  float d = length(p);
  float a;
  if (vKind < 0.5) {
    a = smoothstep(1.0, 0.25, d);
  } else if (vKind < 1.5) {
    float rays = max(0.0, 1.0 - abs(p.x * p.y) * 18.0 - d * 0.95);
    a = max(smoothstep(0.42, 0.0, d), rays);
  } else if (vKind < 2.5) {
    vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.7071;
    a = smoothstep(1.0, 0.8, length(vec2(q.x * 2.0, q.y * 1.05)));
  } else if (vKind < 3.5) {
    a = smoothstep(1.0, 0.6, length(vec2(p.x, p.y * 7.0))) * smoothstep(-1.0, 0.4, p.x); // a streak, bright at its head
  } else if (vKind < 4.5) {
    float e = length(vec2(p.x, p.y * 2.6)); // a ring lying flat on the ground, seen from a little above
    a = smoothstep(0.62, 0.8, e) * smoothstep(1.0, 0.86, e);
  } else if (vKind < 5.5) {
    a = smoothstep(0.55, 0.75, d) * smoothstep(1.0, 0.85, d);
  } else {
    a = step(abs(p.x), 0.8) * step(abs(p.y), 0.38) * smoothstep(0.8, 0.7, abs(p.x));
  }
  a *= vColor.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

const rand = (a, b) => a + Math.random() * (b - a);
const colourOf = hex => new THREE.Color(hex); // the hex as the screen shows it (no conversion: see FRAGMENT)

function createCloud(size, blending, name) {
  const geometry = new THREE.BufferGeometry();
  const attribute = (n, k) => new THREE.BufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute(size, 3));
  geometry.setAttribute('aColor', attribute(size, 4));
  geometry.setAttribute('aSize', attribute(size, 1));
  geometry.setAttribute('aKind', attribute(size, 1));
  geometry.setAttribute('aAngle', attribute(size, 1));
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

/** A find's picture for its sprite: the fossil on a round cream sticker with a white rim, as the collection shows it. */
function stickerTexture(svg, hue = '#f2b630') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (!g) return texture;
  const paint = image => {
    g.clearRect(0, 0, 256, 256);
    g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.fillStyle = '#3b2f25'; g.fill();
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    const wash = g.createRadialGradient(128, 110, 10, 128, 128, 100);
    wash.addColorStop(0, '#fffaf0'); wash.addColorStop(1, hue);
    g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.fillStyle = wash; g.fill();
    if (image) g.drawImage(image, 40, 40, 176, 176);
    texture.needsUpdate = true;
  };
  paint(null);
  const markup = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="176" height="176" ');
  const image = new Image();
  image.onload = () => paint(image);
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  return texture;
}

export function createSparks(world) {
  const soft = createCloud(SOFT, THREE.NormalBlending, 'Háls og hali: dust and leaves');
  // Drawn over the scene too, not added to it: the morning sky is bright, and added light would wash every colour out to white.
  const glow = createCloud(GLOW, THREE.NormalBlending, 'Háls og hali: glitter and fireworks');
  world.scene.add(soft.points, glow.points);
  let calm = false;
  const scaleOf = () => (calm ? 0.5 : 1);
  const emitters = new Set(); // things that give off points over a while: a rising light, drips
  const finds = new Set(); // finds rising out of the ground (sprites)

  /** One point: where, how it flies and how it looks over its life. */
  function add(cloud, p, o) {
    if (cloud.live.length >= cloud.size) cloud.live.shift(); // the oldest gives way
    const speed = calm ? 0.6 : 1;
    cloud.live.push({
      x: p.x + (o.dx ?? 0), y: p.y + (o.dy ?? 0), z: p.z + (o.dz ?? 0),
      vx: (o.vx ?? 0) * speed, vy: (o.vy ?? 0) * speed, vz: (o.vz ?? 0) * speed,
      gravity: (o.gravity ?? 0) * speed, drag: o.drag ?? 0, swirl: o.swirl ?? 0, phase: Math.random() * 6.28,
      age: -(o.delay ?? 0), life: o.life ?? 1, size: o.size ?? 0.2, grow: o.grow ?? 1,
      colour: o.colour, alpha: o.alpha ?? 1, fadeIn: o.fadeIn ?? 0.05, kind: o.kind ?? KIND.disc, then: o.then ?? null,
      angle: o.angle ?? (o.kind === KIND.leaf || o.kind === KIND.strip ? Math.random() * 6.28 : 0), spin: o.spin ?? 0,
    });
  }
  /** Something that gives off points: fn(dt, t) every frame for `seconds` (t from 0 to 1). */
  const emit = (seconds, fn) => { emitters.add({ t: 0, seconds, fn }); };

  const DUST = ['#c9b08a', '#b89e78', '#d8c4a0'].map(colourOf);
  const LEAVES = ['#7fb04e', '#a8c95a', '#e0b84a', '#6f9a3f'].map(colourOf);
  const GRASS = ['#6fa83f', '#8fc24e', '#5d9437'].map(colourOf);
  const GOLD = ['#ffe9a0', '#fff6d0', '#ffd25a'].map(colourOf);
  const FIREFLY = ['#fff3a0', '#e8ff9a', '#ffe070'].map(colourOf);
  const FIREFLY_CORE = colourOf('#fffde8');
  const GLOW_WARM = colourOf('#ffe98a');
  const MUD = ['#5e4630', '#6f5238', '#4c3826'].map(colourOf);
  const BUBBLE = ['#b39270', '#9c7c5a', '#c8ab88'].map(colourOf);
  const WATER = ['#e9f4ff', '#cfe6f5', '#ffffff'].map(colourOf);
  const RING = colourOf('#e8f4ff');
  const HAPPY = ['#ff6b5a', '#ffc93a', '#5fd36a', '#4fa8ff', '#c58cff', '#ff8fc8'].map(colourOf);
  const FIREWORK = [['#ff4f3f', '#ffb3a3'], ['#ffb800', '#ffe48a'], ['#3fc23f', '#b8f5a0'], ['#2f8cff', '#a8d4ff'], ['#b45cff', '#e6c2ff']]
    .map(pair => pair.map(colourOf));
  const WHITE = colourOf('#ffffff');
  const WARM = colourOf('#fff2b8');
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const screenAngle = (p, v) => {
    // the angle a velocity at p makes on the screen, for a streak drawn along it
    const a = p.clone().project(world.camera), b = p.clone().addScaledVector(v, 0.1).project(world.camera);
    return -Math.atan2(b.y - a.y, b.x - a.x); // gl_PointCoord's y runs down the screen
  };

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
    leaves(p, { count = 5, up = 1 } = {}) {
      const n = Math.max(1, Math.round(count * scaleOf()));
      for (let i = 0; i < n; i++) {
        add(soft, p, {
          dy: 0.2, vx: rand(-1.6, 1.6), vy: rand(2.2, 3.4) * up, vz: rand(-0.3, 0.6), gravity: -4.2, drag: 1.4, swirl: 1.6,
          life: rand(1.1, 1.6), size: rand(0.2, 0.28), grow: 1, colour: pick(LEAVES), alpha: 1, kind: KIND.leaf, spin: rand(-6, 6),
        });
      }
    },
    /** A hop's landing: a ring of dust spreading over the block, a little puff and a few bits of grass flicked up. */
    hop(p) {
      add(soft, p, { dy: 0.04, life: 0.5, size: 0.7, grow: 3.4, colour: DUST[2], alpha: 0.75, kind: KIND.ring });
      api.dust(p, { count: 6 });
      const n = Math.round(4 * scaleOf());
      for (let i = 0; i < n; i++) {
        add(soft, p, {
          dy: 0.1, vx: rand(-1.4, 1.4), vy: rand(1.6, 2.6), vz: rand(-0.2, 0.6), gravity: -7, drag: 1, life: rand(0.5, 0.8),
          size: rand(0.1, 0.15), colour: pick(GRASS), kind: KIND.strip, spin: rand(-12, 12),
        });
      }
    },
    /** A square counted: a ring of light swelling out of its number and a few twinkles. */
    pop(p) {
      add(glow, p, { life: 0.55, size: 0.6, grow: 3.2, colour: GOLD[0], alpha: 0.9, kind: KIND.halo });
      for (let i = 0; i < 3; i++) {
        const a = rand(0, Math.PI * 2);
        add(glow, p, { dx: Math.cos(a) * 0.5, dy: Math.sin(a) * 0.4, vy: 0.6, drag: 1, life: rand(0.4, 0.7), size: rand(0.2, 0.3), grow: 0.2, colour: pick(GOLD), kind: KIND.star });
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
    /** Glitter spiralling round a piece going up a neck (`turn`: how far round, in radians, it is now). */
    spiral(p, turn) {
      for (let k = 0; k < 2; k++) {
        const a = turn + k * Math.PI;
        add(glow, p, {
          dx: Math.cos(a) * 0.9, dy: 0.6 + k * 0.2, dz: Math.sin(a) * 0.55, vx: -Math.sin(a) * 0.4, vy: 0.5, vz: Math.cos(a) * 0.3,
          drag: 1.2, life: rand(0.6, 0.9), size: rand(0.22, 0.34), grow: 0.3, colour: k ? WARM : pick(GOLD), kind: k ? KIND.disc : KIND.star,
        });
      }
    },
    /** A warm light running up from `from` to `to` over `seconds`, ahead of a piece riding a neck, leaving twinkles. */
    rise(from, to, seconds = 1.4) {
      const at = new THREE.Vector3();
      emit(calm ? seconds * 1.3 : seconds, (dt, t) => {
        const k = 1 - (1 - t) ** 2;
        at.lerpVectors(from, to, k).add(new THREE.Vector3(0, Math.sin(Math.PI * t) * 1.2, 0));
        add(glow, at, { life: 0.12, size: 1.1, grow: 1, colour: WARM, alpha: 0.85, fadeIn: 0.01, kind: KIND.disc });
        if (Math.random() < 0.7) add(glow, at, { dx: rand(-0.3, 0.3), dy: rand(-0.3, 0.3), vy: -0.3, drag: 1, life: rand(0.4, 0.8), size: rand(0.16, 0.26), grow: 0.2, colour: pick(GOLD), kind: KIND.star });
      });
    },
    /** A happy burst: confetti and stars flung out all round, and a ring of light. */
    burst(p) {
      add(glow, p, { dy: 0.8, life: 0.6, size: 1, grow: 5, colour: GOLD[1], alpha: 0.9, kind: KIND.halo });
      const n = Math.round(30 * scaleOf());
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, s = rand(2.5, 4.5);
        add(i % 3 ? soft : glow, p, {
          dy: 0.8, vx: Math.cos(a) * s, vy: rand(2.5, 5), vz: Math.sin(a) * s * 0.4, gravity: -6, drag: 1.2, swirl: i % 3 ? 2 : 0,
          life: rand(0.9, 1.4), size: rand(0.2, 0.32), grow: 0.8, colour: pick(HAPPY), kind: i % 3 ? KIND.strip : KIND.star, spin: rand(-10, 10),
        });
      }
    },
    /** A speed streak beside a piece sliding down a tail (`velocity`: the way it goes), and now and then a leaf left behind. */
    streak(p, velocity) {
      const angle = screenAngle(p, velocity);
      for (let k = 0; k < 2; k++) {
        add(soft, p, {
          dx: rand(-0.5, 0.5), dy: rand(0.2, 1.3), dz: rand(-0.3, 0.3), vx: -velocity.x * 0.3, vy: -velocity.y * 0.3, vz: 0,
          drag: 2, life: rand(0.25, 0.4), size: rand(0.9, 1.4), grow: 1.2, colour: WHITE, alpha: 0.7, kind: KIND.streak, angle,
        });
      }
      if (Math.random() < 0.45) {
        add(soft, p, {
          dy: 0.4, vx: rand(-0.6, 0.6), vy: rand(0.4, 1.2), vz: rand(-0.2, 0.4), gravity: -2.4, drag: 1.4, swirl: 2,
          life: rand(1.2, 1.8), size: rand(0.2, 0.28), colour: pick(LEAVES), kind: KIND.leaf, spin: rand(-6, 6),
        });
      }
    },
    /** A splash where a tail sets a piece down: a ring spreading on the ground, dust, leaves and bright droplets. */
    splash(p) {
      add(soft, p, { dy: 0.05, life: 0.7, size: 1, grow: 4.5, colour: RING, alpha: 0.85, kind: KIND.ring });
      add(soft, p, { dy: 0.05, life: 0.9, size: 0.6, grow: 6, colour: RING, alpha: 0.5, kind: KIND.ring, delay: 0.12 });
      api.dust(p, { count: 18 });
      api.leaves(p, { count: 6 });
      const n = Math.round(22 * scaleOf());
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, s = rand(1.6, 3.2);
        add(soft, p, {
          dy: 0.15, vx: Math.cos(a) * s, vy: rand(2.4, 4.4), vz: Math.sin(a) * s * 0.5, gravity: -9, drag: 0.6,
          life: rand(0.5, 0.85), size: rand(0.1, 0.18), grow: 0.6, colour: pick(WATER), alpha: 0.95, kind: KIND.disc,
        });
      }
    },
    /**
     * Fireflies carrying a piece: a bright swarm under and round it, each a glowing core in a soft halo, and a warm glow under the
     * piece that holds it up (called every few frames while they carry it).
     */
    firefly(p, { count = 4 } = {}) {
      add(glow, p, { dy: 0.2, life: 0.2, size: 3.2, grow: 1, colour: GLOW_WARM, alpha: 0.3, fadeIn: 0.05, kind: KIND.disc });
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2), r = rand(0.4, 1.2), under = Math.random() < 0.6;
        const o = {
          dx: Math.cos(a) * r, dy: under ? rand(-0.15, 0.35) : rand(0.4, 1.6), dz: Math.sin(a) * r * 0.6,
          vx: -Math.sin(a) * 1.3, vy: rand(0, 0.5), vz: Math.cos(a) * 0.6, drag: 0.8, swirl: 3.2, life: rand(0.8, 1.3), fadeIn: 0.2,
        };
        add(glow, p, { ...o, size: rand(0.7, 1.0), grow: 0.8, colour: pick(FIREFLY), alpha: 0.32, kind: KIND.disc });
        add(glow, p, { ...o, size: rand(0.22, 0.32), grow: 0.8, colour: FIREFLY_CORE, alpha: 1, kind: KIND.disc });
      }
    },
    /** Fireflies gathering from all round onto a piece, a bright swarm, before they lift and carry it. */
    swarm(p) {
      const n = Math.round(46 * scaleOf());
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), r = rand(2.5, 5), h = rand(-0.5, 3.5), life = rand(0.7, 1.15);
        const dx = Math.cos(a) * r, dy = h, dz = Math.sin(a) * r * 0.5;
        const o = { dx, dy, dz, vx: -dx / life, vy: (0.4 - dy) / life, vz: -dz / life, life, fadeIn: 0.25, delay: rand(0, 0.35) };
        add(glow, p, { ...o, size: rand(0.8, 1.1), grow: 1.1, colour: pick(FIREFLY), alpha: 0.3, kind: KIND.disc });
        add(glow, p, { ...o, size: rand(0.26, 0.38), grow: 1.1, colour: FIREFLY_CORE, alpha: 1, kind: KIND.disc });
      }
      add(glow, p, { dy: 0.3, life: 1.2, size: 1.5, grow: 2.2, colour: GLOW_WARM, alpha: 0.35, fadeIn: 0.6, kind: KIND.disc, delay: 0.4 });
    },
    /** A big splat of mud: a dark ring slapped out on the block and blobs thrown up and out, falling back. */
    mud(p) {
      add(soft, p, { dy: 0.04, life: 0.8, size: 0.9, grow: 3.6, colour: MUD[0], alpha: 0.85, kind: KIND.ring });
      const n = Math.round(26 * scaleOf());
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), s = rand(0.8, 2.8);
        add(soft, p, {
          dy: 0.15, vx: Math.cos(a) * s, vy: rand(2.2, 4.6), vz: Math.sin(a) * s * 0.5, gravity: -9.5, drag: 0.5,
          life: rand(0.55, 0.9), size: rand(0.2, 0.44), grow: 0.8, colour: pick(MUD), alpha: 1, kind: KIND.disc,
        });
      }
    },
    /** Bubbles in the mud: rings coming up one after another, swelling, and popping. */
    bubbles(p, { count = 8 } = {}) {
      const n = Math.round(count * scaleOf());
      for (let i = 0; i < n; i++) {
        add(soft, p, {
          dx: rand(-0.6, 0.6), dy: 0.05, dz: rand(-0.3, 0.4), vy: rand(0.15, 0.35), life: rand(0.6, 1), size: rand(0.12, 0.2), grow: 2.2,
          colour: pick(BUBBLE), alpha: 0.9, kind: KIND.halo, delay: i * 0.22 + rand(0, 0.15),
        });
      }
    },
    /** Drops of mud falling off a piece for a while: `at(out)` says where it is. */
    drips(at, seconds = 1.6) {
      const p = new THREE.Vector3();
      let wait = 0;
      emit(seconds, dt => {
        if ((wait -= dt) > 0) return;
        wait = rand(0.12, 0.22);
        at(p);
        add(soft, p, { dx: rand(-0.6, 0.6), dy: rand(0.6, 1.2), dz: rand(-0.2, 0.4), vy: -0.2, gravity: -7, life: 0.5, size: rand(0.1, 0.16), grow: 0.7, colour: pick(MUD), kind: KIND.disc });
      });
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
    /** Digging up a find: earth and pebbles thrown up, and one bright glint. */
    dig(p) {
      const n = Math.round(16 * scaleOf());
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), s = rand(0.6, 1.8);
        add(soft, p, {
          dy: 0.1, vx: Math.cos(a) * s, vy: rand(2.4, 4.2), vz: Math.sin(a) * s * 0.5, gravity: -8, drag: 0.8,
          life: rand(0.6, 1), size: i % 3 ? rand(0.3, 0.5) : rand(0.1, 0.16), grow: i % 3 ? 1.8 : 0.8, colour: i % 3 ? pick(DUST) : pick(MUD), alpha: i % 3 ? 0.6 : 1, kind: KIND.disc,
        });
      }
      add(glow, p, { dy: 0.5, life: 0.55, size: 1.6, grow: 0.4, colour: WHITE, alpha: 1, kind: KIND.star, delay: 0.25, spin: 3 });
    },
    /** A find rising out of the ground over its square: its sticker comes up, turns a little, shines, and fades (`svg`: its art). */
    find(p, svg, { hue } = {}) {
      const material = new THREE.SpriteMaterial({ map: stickerTexture(svg, hue), transparent: true, depthWrite: false, toneMapped: false });
      const sprite = new THREE.Sprite(material);
      sprite.name = 'Háls og hali: a find';
      sprite.renderOrder = 6;
      sprite.scale.setScalar(0.01);
      world.scene.add(sprite);
      finds.add({ sprite, material, from: p.clone().add(new THREE.Vector3(0, -0.5, 0)), t: 0, seconds: 3.2 });
      api.dig(p);
    },
    /** One firework: a spark climbs from `p` and bursts high over it in a ball of colour. */
    firework(p, { height = 7, colour = pick(FIREWORK) } = {}) {
      const [bright, pale] = colour;
      const climb = rand(0.55, 0.8);
      add(glow, p, {
        vx: rand(-0.6, 0.6), vy: height / climb, gravity: 0, drag: 0, life: climb, size: 0.3, grow: 0.6, colour: pale, alpha: 1, kind: KIND.star,
        then: at => {
          world.onBoom?.();
          add(glow, at, { life: 0.5, size: 2, grow: 4, colour: pale, alpha: 0.7, kind: KIND.halo });
          const n = Math.round(46 * scaleOf());
          for (let i = 0; i < n; i++) {
            const u = rand(-1, 1), a = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u), s = rand(4.2, 5.6);
            add(glow, at, {
              vx: r * Math.cos(a) * s, vy: u * s, vz: r * Math.sin(a) * s * 0.5, gravity: -2.6, drag: 1.3,
              life: rand(1.2, 1.8), size: rand(0.55, 0.8), grow: 0.3, colour: i % 3 ? bright : pale, alpha: 1, kind: i % 4 ? KIND.disc : KIND.star,
            });
          }
        },
      });
    },
    /** Fireworks over the top square at a win: a few, one after another. */
    fireworks(p, { count = 5 } = {}) {
      const n = calm ? 2 : count;
      for (let i = 0; i < n; i++) {
        const at = p.clone().add(new THREE.Vector3(rand(-7, 7), rand(0, 1), rand(-1, 0.5)));
        world.wait(i * 0.45 + rand(0, 0.2)).then(() => api.firework(at, { height: rand(5, 9) }));
      }
    },
    /** Confetti tumbling down over a place (the win): strips of every colour, fluttering. */
    confetti(p, { count = 70, width = 12 } = {}) {
      const n = Math.round(count * scaleOf());
      for (let i = 0; i < n; i++) {
        add(soft, p, {
          dx: rand(-width / 2, width / 2), dy: rand(4, 9), dz: rand(-1.5, 1.5), vx: rand(-0.4, 0.4), vy: rand(-1.2, -0.4),
          gravity: -0.6, drag: 0.6, swirl: rand(1.5, 3), life: rand(3, 4.5), size: rand(0.26, 0.38), colour: pick(HAPPY), kind: KIND.strip,
          spin: rand(-8, 8), delay: rand(0, 1.6),
        });
      }
    },
    get calm() { return calm; },
    set calm(value) { calm = Boolean(value); },
    clear() {
      soft.live.length = 0; glow.live.length = 0; emitters.clear();
      for (const f of finds) { f.sprite.removeFromParent(); f.material.map?.dispose(); f.material.dispose(); }
      finds.clear();
    },
    dispose() {
      api.clear();
      for (const cloud of [soft, glow]) {
        cloud.points.removeFromParent();
        cloud.geometry.dispose();
        cloud.material.dispose();
      }
    },
  };

  /** Each frame: every point flies, ages and is written out; the dead ones go (and a climbing firework bursts). */
  function update(dt) {
    for (const e of [...emitters]) {
      e.t += dt;
      e.fn(dt, Math.min(1, e.t / e.seconds));
      if (e.t >= e.seconds) emitters.delete(e);
    }
    for (const f of [...finds]) {
      f.t += dt;
      const t = f.t, up = Math.min(1, t / 0.9);
      const back = 1 + 2.4 * (up - 1) ** 3 + 1.4 * (up - 1) ** 2; // up with a little overshoot
      f.sprite.position.copy(f.from).add(new THREE.Vector3(0.5 * back, back * 3.4, 0.4)); // up over the piece, never in front of it
      const out = t > f.seconds - 0.45 ? Math.max(0, (f.seconds - t) / 0.45) : 1;
      f.sprite.scale.setScalar(1.5 * Math.min(1, t / 0.35) * (0.85 + 0.15 * out));
      f.material.rotation = Math.sin(t * 3) * 0.15 * (1 - up * 0.5);
      f.material.opacity = out;
      if (t > 0.9 && Math.random() < 0.3) api.glitter(f.sprite.position.clone().add(new THREE.Vector3(0, -0.6, 0)), { count: 1 });
      if (t >= f.seconds) { f.sprite.removeFromParent(); f.material.map?.dispose(); f.material.dispose(); finds.delete(f); }
    }
    const height = world.renderer?.getDrawingBufferSize?.(new THREE.Vector2()).y ?? 800;
    const scale = height / (2 * Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2)));
    const bursts = [];
    for (const cloud of [soft, glow]) {
      cloud.material.uniforms.uScale.value = scale;
      const pos = cloud.geometry.attributes.position.array;
      const col = cloud.geometry.attributes.aColor.array;
      const siz = cloud.geometry.attributes.aSize.array;
      const kin = cloud.geometry.attributes.aKind.array;
      const ang = cloud.geometry.attributes.aAngle.array;
      let n = 0;
      const keep = [];
      for (const q of cloud.live) {
        q.age += dt;
        if (q.age < 0) { keep.push(q); continue; } // waiting for its moment
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
        q.angle += q.spin * dt;
        const t = q.age / q.life;
        const fade = Math.min(1, q.age / Math.max(0.001, q.fadeIn)) * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
        pos[n * 3] = q.x; pos[n * 3 + 1] = q.y; pos[n * 3 + 2] = q.z;
        col[n * 4] = q.colour.r; col[n * 4 + 1] = q.colour.g; col[n * 4 + 2] = q.colour.b; col[n * 4 + 3] = q.alpha * fade;
        siz[n] = q.size * (1 + (q.grow - 1) * t);
        kin[n] = q.kind;
        ang[n] = q.angle;
        n++;
        keep.push(q);
      }
      cloud.live = keep;
      cloud.geometry.setDrawRange(0, n);
      cloud.points.visible = n > 0;
      if (n) for (const name of ['position', 'aColor', 'aSize', 'aKind', 'aAngle']) cloud.geometry.attributes[name].needsUpdate = true;
    }
    for (const [then, at] of bursts) then(at);
  }
  world.addUpdater(update);
  return api;
}
