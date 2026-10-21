import * as THREE from 'three';

// The table's point-cloud effects for "Litla Yatzy við Mosa" (the owner's round of 2026-10-21: "more effects, more animation"),
// in the manner of "Háls og hali" (engine/hals/sparks.js) but sized for a table of 5.8 m and dice of 27 cm: dust puffed up where a die
// lands, a ring of dust on the felt, gold stars round a die that is kept, glitter left behind a die that moves, a gold burst for a
// Yatzy, confetti tumbling over the table, fireworks over it, leaves drifting down behind Mosi and soft motes in the light.
//
// Two point clouds, two draw calls whatever is going on (none while both are empty): a soft one (dust, rings, leaves, confetti) and a
// bright one (stars, glitter, motes, fireworks). Each point is a disc, a four-pointed star, a leaf, a flat ring, a round halo or a strip
// of confetti, drawn in the fragment shader and turned by its own angle. Points are sized in metres, so they shrink with distance.
// Everything runs on the clock it is given (update(dt)): it holds while the game is paused, and a capture lands on the same frame.
//
//   const sparks = createTableSparks(scene, camera, renderer)
//   sparks.dust(p, strength) / ring(p, size) / stars(p, options) / glitter(p, count) / burst(p) / gold(p)
//   sparks.confetti(centre, options) / firework(p, options) / leaf(p) / mote(p)
//   sparks.later(seconds, fn)    something to do a little later on the same clock (a second volley of fireworks)
//   sparks.update(dt), sparks.clear(), sparks.dispose(), sparks.getStats()

const SOFT = 420, GLOW = 640;
export const KIND = Object.freeze({ disc: 0, star: 1, leaf: 2, ring: 3, halo: 4, strip: 5 });

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
  // A point sprite has its centre's depth all over, so one lying on the felt would sink under the nearer felt below its centre:
  // drawn a little nearer the camera (half its size, at most 35 cm), it lies on the felt whole.
  mv.z += min(aSize * 0.5, 0.35);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 1.0, 220.0);
  vColor = aColor;
  vKind = aKind;
  vTurn = vec2(cos(aAngle), sin(aAngle));
}`;
// The colours are what the screen shows: the material skips tone mapping and the output colour space, as a sprite of paint would.
const FRAGMENT = `
varying vec4 vColor;
varying float vKind;
varying vec2 vTurn;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p = vec2(p.x * vTurn.x - p.y * vTurn.y, p.x * vTurn.y + p.y * vTurn.x);
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
    float e = length(vec2(p.x, p.y * 2.2)); // a ring lying on the felt, seen from above at a slant
    a = smoothstep(0.6, 0.8, e) * smoothstep(1.0, 0.86, e);
  } else if (vKind < 4.5) {
    a = smoothstep(0.55, 0.75, d) * smoothstep(1.0, 0.85, d);
  } else {
    a = step(abs(p.x), 0.8) * step(abs(p.y), 0.38) * smoothstep(0.8, 0.7, abs(p.x));
  }
  a *= vColor.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

function createCloud(size, name) {
  const geometry = new THREE.BufferGeometry();
  const attribute = (n, k) => new THREE.BufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute(size, 3));
  geometry.setAttribute('aColor', attribute(size, 4));
  geometry.setAttribute('aSize', attribute(size, 1));
  geometry.setAttribute('aKind', attribute(size, 1));
  geometry.setAttribute('aAngle', attribute(size, 1));
  geometry.setDrawRange(0, 0);
  // Normal blending: added light over the bright felt and sky would wash every colour out to white.
  const material = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.name = name; points.frustumCulled = false; points.renderOrder = 5; points.visible = false;
  return { points, geometry, material, size, live: [] };
}

export function createTableSparks(scene, camera, renderer) {
  const soft = createCloud(SOFT, 'Yatzy table: dust, leaves and confetti');
  const glow = createCloud(GLOW, 'Yatzy table: stars, glitter and fireworks');
  scene.add(soft.points, glow.points);
  const timers = [], buffer = new THREE.Vector2();
  let seed = 9187, disposed = false;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rand = (a, b) => a + random() * (b - a);
  const colour = hex => new THREE.Color(hex);
  const pick = list => list[Math.floor(random() * list.length)];
  const DUST = ['#d9d0a8', '#c9c094', '#e6dfbd'].map(colour);
  const FELT = ['#9fb98a', '#b5c99c'].map(colour);
  const GOLD = ['#ffe9a0', '#fff6d0', '#ffd25a', '#ffc93a'].map(colour);
  const BRIGHT = ['#ffffff', '#fff6d0', '#ffe9a0'].map(colour); // stars that show over the held frame's gold glow
  const LEAVES = ['#7fb04e', '#a8c95a', '#e0b84a', '#c98f3a', '#6f9a3f'].map(colour);
  const HAPPY = ['#ff6b5a', '#ffc93a', '#5fd36a', '#4fa8ff', '#c58cff', '#ff8fc8'].map(colour);
  const FIREWORK = [['#ff5a4a', '#ffc2b5'], ['#ffb800', '#ffe9a0'], ['#45c845', '#c2f5ac'], ['#3a92ff', '#b4dbff'], ['#b864ff', '#ead0ff']].map(pair => pair.map(colour));
  const MOTE = colour('#fff4c4'), RING = colour('#f3edd2');

  /** One point: where it starts, how it flies and how it looks over its life. */
  function add(cloud, p, o) {
    if (disposed) return;
    if (cloud.live.length >= cloud.size) cloud.live.shift(); // the oldest gives way
    cloud.live.push({
      x: p.x + (o.dx ?? 0), y: p.y + (o.dy ?? 0), z: p.z + (o.dz ?? 0), vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0,
      gravity: o.gravity ?? 0, drag: o.drag ?? 0, swirl: o.swirl ?? 0, phase: random() * 6.28, floor: o.floor ?? -Infinity,
      age: -(o.delay ?? 0), life: o.life ?? 1, size: o.size ?? .05, grow: o.grow ?? 1, colour: o.colour, alpha: o.alpha ?? 1,
      fadeIn: o.fadeIn ?? .04, hold: o.hold ?? .6, kind: o.kind ?? KIND.disc, then: o.then ?? null,
      angle: o.angle ?? (o.kind === KIND.leaf || o.kind === KIND.strip ? random() * 6.28 : 0), spin: o.spin ?? 0,
    });
  }

  const api = {
    KIND,
    /** A puff of dust where a die lands (strength 0 to 1), low over the felt, and a few flecks of felt. */
    dust(p, strength = .5) {
      const n = Math.max(2, Math.round(3 + strength * 7));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-.4, .4), s = rand(.25, .6) * (.6 + strength);
        add(soft, p, { dx: Math.cos(a) * .07, dy: .03, dz: Math.sin(a) * .06, vx: Math.cos(a) * s, vy: rand(.15, .4) * (.5 + strength), vz: Math.sin(a) * s * .8,
          gravity: -.25, drag: 3, life: rand(.5, .85), size: rand(.09, .14) * (.75 + strength * .6), grow: 2.2, colour: pick(DUST), alpha: .72, kind: KIND.disc, hold: .35 });
      }
      if (strength > .3) for (let i = 0; i < 2; i++) add(soft, p, { dy: .03, vx: rand(-.5, .5), vy: rand(.5, .9), vz: rand(-.4, .4), gravity: -3.2, drag: 1, life: rand(.35, .55), size: rand(.025, .035), colour: pick(FELT), kind: KIND.strip, spin: rand(-14, 14), floor: p.y + .01 });
    },
    /** A ring of dust spreading on the felt. */
    ring(p, size = .18, { colour: c = RING, alpha = .6, life = .45, delay = 0 } = {}) {
      add(soft, p, { dy: .008, life, size, grow: 3.2, colour: c, alpha, kind: KIND.ring, hold: .2, delay });
    },
    /** Gold stars rising round a point (a die kept, a die flying into a card), and a soft halo. */
    stars(p, { count = 7, radius = .17, rise = .55, halo = true, size = .07 } = {}) {
      if (halo) add(glow, p, { dy: .14, life: .42, size: .22, grow: 2.4, colour: GOLD[1], alpha: .75, kind: KIND.halo, hold: .1 });
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand(-.25, .25);
        add(glow, p, { dx: Math.cos(a) * radius, dy: rand(.04, .2), dz: Math.sin(a) * radius * .8, vx: Math.cos(a) * rand(.08, .22), vy: rise * rand(.7, 1.2), vz: Math.sin(a) * .1,
          gravity: -.2, drag: 1.6, life: rand(.6, .95), size: rand(.8, 1.2) * size, grow: .35, colour: pick(GOLD), kind: KIND.star, spin: rand(-3, 3), delay: i * .025 });
      }
    },
    /** A few little stars that hang and fade where something passed (the trail of a die moving to the kept row), round its edge. */
    glitter(p, count = 2, reach = .17) {
      for (let i = 0; i < count; i++) { const a = rand(0, Math.PI * 2), r = reach * rand(.75, 1.1); add(glow, p, { dx: Math.cos(a) * r, dy: rand(0, .12), dz: Math.sin(a) * r, vy: rand(.05, .25), drag: 1.8, life: rand(.45, .7), size: rand(.06, .09), grow: .25, colour: pick(BRIGHT), kind: KIND.star, spin: rand(-4, 4) }); }
    },
    /** A die is kept: a ring of light swelling out on the felt round it and gold stars bursting out past its frame. */
    keep(p) {
      add(glow, p, { dy: .01, life: .6, size: .4, grow: 3.2, colour: GOLD[1], alpha: .95, kind: KIND.halo, hold: .15 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + rand(-.2, .2), s = rand(.95, 1.35);
        add(glow, p, { dx: Math.cos(a) * .17, dy: rand(.05, .18), dz: Math.sin(a) * .17, vx: Math.cos(a) * s, vy: rand(.25, .55), vz: Math.sin(a) * s, gravity: -.6, drag: 3, life: rand(.65, .9),
          size: rand(.1, .14), grow: .3, colour: pick(BRIGHT), kind: KIND.star, spin: rand(-5, 5), delay: i * .01 });
      }
    },
    /** A happy burst over the felt: a ring of light, stars and a little confetti (a good roll, a good score). */
    burst(p, { scale = 1 } = {}) {
      add(glow, p, { dy: .25, life: .5, size: .3 * scale, grow: 4, colour: GOLD[1], alpha: .7, kind: KIND.halo, hold: .1 });
      const n = Math.round(18 * scale);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, s = rand(.7, 1.3) * scale;
        add(i % 3 ? glow : soft, p, { dy: .2, vx: Math.cos(a) * s, vy: rand(1.1, 1.9) * Math.sqrt(scale), vz: Math.sin(a) * s * .7, gravity: -3.4, drag: 1.3, swirl: i % 3 ? 0 : 2,
          life: rand(.7, 1.1), size: rand(.05, .08), grow: .7, colour: i % 3 ? pick(GOLD) : pick(HAPPY), kind: i % 3 ? KIND.star : KIND.strip, spin: rand(-10, 10), floor: p.y + .01 });
      }
    },
    /** A Yatzy: a big gold sparkle burst, two rings of light and stars fountaining up and raining down. */
    gold(p) {
      add(glow, p, { dy: .3, life: .7, size: .5, grow: 5, colour: GOLD[1], alpha: .85, kind: KIND.halo, hold: .1 });
      add(glow, p, { dy: .3, life: .9, size: .35, grow: 7, colour: GOLD[2], alpha: .6, kind: KIND.halo, delay: .15, hold: .1 });
      api.ring(p, .4, { colour: GOLD[0], alpha: .8, life: .8 });
      for (let i = 0; i < 64; i++) {
        const a = rand(0, Math.PI * 2), s = rand(.4, 1.5);
        add(glow, p, { dy: .2, vx: Math.cos(a) * s, vy: rand(1.8, 3.2), vz: Math.sin(a) * s * .7, gravity: -3.2, drag: .9, life: rand(1.1, 1.8), size: rand(.06, .11), grow: .4,
          colour: pick(GOLD), kind: i % 4 ? KIND.star : KIND.disc, spin: rand(-6, 6), delay: rand(0, .35), floor: p.y + .01 });
      }
    },
    /** Confetti tumbling down over the table: strips of every colour, fluttering (`width`, `depth` of the patch it falls on). */
    confetti(centre, { count = 90, width = 4.6, depth = 2.6, height = [1.6, 2.8], spread = 1.4 } = {}) {
      for (let i = 0; i < count; i++) {
        add(soft, centre, { dx: rand(-width / 2, width / 2), dy: rand(height[0], height[1]), dz: rand(-depth / 2, depth / 2), vx: rand(-.2, .2), vy: rand(-.5, -.15), vz: rand(-.15, .15),
          gravity: -.32, drag: .7, swirl: rand(1.6, 3), life: rand(3.2, 4.4), size: rand(.06, .09), colour: pick(HAPPY), kind: KIND.strip, spin: rand(-8, 8), delay: rand(0, spread), floor: centre.y + .012, hold: .8 });
      }
    },
    /** One firework: a spark climbs from `p` and bursts in a ball of colour `height` m above it. */
    firework(p, { height = 1.8, palette = pick(FIREWORK), delay = 0 } = {}) {
      const [bright, pale] = palette, climb = rand(.5, .7);
      add(glow, p, { vx: rand(-.15, .15), vy: height / climb, life: climb, size: .07, grow: .6, colour: pale, kind: KIND.star, delay,
        then: at => {
          api.onBoom?.(at);
          add(glow, at, { life: .45, size: .5, grow: 3.5, colour: pale, alpha: .6, kind: KIND.halo, hold: .1 });
          for (let i = 0; i < 44; i++) {
            const u = rand(-1, 1), a = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u), s = rand(1.3, 1.7);
            add(glow, at, { vx: r * Math.cos(a) * s, vy: u * s, vz: r * Math.sin(a) * s * .6, gravity: -.9, drag: 1.5, life: rand(1.1, 1.6), size: rand(.08, .12), grow: .3,
              colour: i % 3 ? bright : pale, kind: i % 4 ? KIND.disc : KIND.star });
          }
        } });
    },
    /** A leaf let go high up, drifting and see-sawing down. */
    leaf(p) {
      add(soft, p, { vx: rand(-.12, .12), vy: rand(-.32, -.22), vz: rand(-.05, .08), drag: .2, swirl: rand(1.1, 1.8), life: rand(5.5, 7.5), size: rand(.09, .13), colour: pick(LEAVES), alpha: .95,
        kind: KIND.leaf, spin: rand(-2.2, 2.2), fadeIn: .8, hold: .8 });
    },
    /** A soft mote drifting in the light over the table. */
    mote(p) {
      add(glow, p, { vx: rand(-.04, .04), vy: rand(.01, .05), vz: rand(-.03, .03), swirl: rand(.4, .8), life: rand(4, 6), size: rand(.025, .04), colour: MOTE, alpha: .55, kind: KIND.disc, fadeIn: 1.2, hold: .55 });
    },
    /** Something to do `seconds` from now, on this clock. */
    later(seconds, fn) { if (!disposed) timers.push({ t: seconds, fn }); },
    onBoom: null,
    update(dt) {
      if (disposed || !(dt > 0)) return;
      for (let i = timers.length - 1; i >= 0; i--) { const timer = timers[i]; timer.t -= dt; if (timer.t <= 0) { timers.splice(i, 1); timer.fn(); } }
      const height = renderer?.getDrawingBufferSize?.(buffer).y || 800;
      const scale = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      const bursts = [];
      for (const cloud of [soft, glow]) {
        cloud.material.uniforms.uScale.value = scale;
        const attributes = cloud.geometry.attributes, pos = attributes.position.array, col = attributes.aColor.array, siz = attributes.aSize.array, kin = attributes.aKind.array, ang = attributes.aAngle.array;
        let n = 0, keep = 0;
        for (const q of cloud.live) {
          q.age += dt;
          if (q.age < 0) { cloud.live[keep++] = q; continue; } // waiting for its moment
          if (q.age >= q.life) { if (q.then) bursts.push([q.then, new THREE.Vector3(q.x, q.y, q.z)]); continue; }
          const k = Math.exp(-q.drag * dt);
          q.vx *= k; q.vy *= k; q.vz *= k; q.vy += q.gravity * dt;
          if (q.swirl) { q.phase += dt * q.swirl; q.vx += Math.cos(q.phase) * q.swirl * .12 * dt; q.vz += Math.sin(q.phase) * q.swirl * .06 * dt; }
          q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.angle += q.spin * dt;
          if (q.y < q.floor) { q.y = q.floor; q.vy = 0; q.vx *= .5; q.vz *= .5; q.spin *= .3; q.swirl = 0; } // it lies on the felt
          const t = q.age / q.life, fade = Math.min(1, q.age / Math.max(.001, q.fadeIn)) * (t < q.hold ? 1 : 1 - (t - q.hold) / (1 - q.hold));
          pos[n * 3] = q.x; pos[n * 3 + 1] = q.y; pos[n * 3 + 2] = q.z;
          col[n * 4] = q.colour.r; col[n * 4 + 1] = q.colour.g; col[n * 4 + 2] = q.colour.b; col[n * 4 + 3] = q.alpha * fade;
          siz[n] = q.size * (1 + (q.grow - 1) * t); kin[n] = q.kind; ang[n] = q.angle; n++;
          cloud.live[keep++] = q;
        }
        cloud.live.length = keep;
        cloud.geometry.setDrawRange(0, n);
        cloud.points.visible = n > 0;
        if (n) for (const name of ['position', 'aColor', 'aSize', 'aKind', 'aAngle']) attributes[name].needsUpdate = true;
      }
      for (const [then, at] of bursts) then(at);
    },
    clear() { soft.live.length = glow.live.length = timers.length = 0; for (const cloud of [soft, glow]) { cloud.geometry.setDrawRange(0, 0); cloud.points.visible = false; } },
    getStats: () => ({ soft: soft.live.length, glow: glow.live.length, timers: timers.length }),
    dispose() {
      if (disposed) return;
      api.clear(); disposed = true;
      for (const cloud of [soft, glow]) { cloud.points.removeFromParent(); cloud.geometry.dispose(); cloud.material.dispose(); }
    },
  };
  return api;
}
