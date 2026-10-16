import * as THREE from 'three';
import { DONE, Handle } from '../../engine/handle.js';
import { seededRandom } from '../../engine/random.js';

// Glow flowers (glóblóm): the three that Kambeðla has lost, which the child hunts for in scene 8 (by the
// big stone, under the ferns, up in a small tree). A flower is five cupped lilac-white petals round a gold
// centre on a bowed stem, built in code as one vertex-coloured mesh, and a soft glow behind it that
// pulses at 1.2 Hz. That glimmer is what a five-year-old looks for in a shady glade, so it is bright,
// lilac (a colour the green forest has none of) and pointed with rays, and it needs no bloom pass. It is
// a camera-facing square drawn additively and depth tested, so ferns or the stone in front of a flower
// cut into it and the glimmer shows through the gaps; it fades out toward the ground, so the ground
// does not cut it in a line; it backs off as the camera comes near, so the flower itself reads up close,
// and swells a little from far off. Each flower is at most 300 triangles and two draw calls (the
// flower, the glow; one while the glow is out) and uses no texture.
//
//   const flower = createGlowFlower(world, { name: 'stone', position: [x, y, z] });  // where it stands
//   s.target('stone', { point: flower.point, radius: 0.5 });                         // what a tap aims at
//   yield flower.pick({ actor: 'egill', part: 'head' });                             // Egill picks it
//
// The flower puts its group in world.scene and runs on world.effects (engine/effects.js, which main.js
// updates every frame), so a chapter need not drive it. Its glimmer reads the game clock's own time
// (world.clock.time): a pure function of it, so it pauses with the game, seeks exactly and lands on the
// same frame in a capture. update(t) does the same by hand, for a world with no effects. pick() lifts
// the flower toward a point and shrinks it over 0.6 s, resolving the point every frame because Egill
// may be walking, then hides it and finishes its Handle. A picked flower is gone for good; dispose()
// takes one out of the scene and its effect off world.effects.

const GLIMMER_HZ = 1.2; // throbs a second
const LEVEL_FLOOR = 0.55; // the dimmest the glow gets, as a share of the brightest: it never goes quite out
const PICK_SECONDS = 0.6;
const PICK_LIFT = 0.35; // metres the flower rises above the straight way to the hand, half way there
const PICK_SMALLEST = 0.1; // the share of its size it has left in the hand

// The flower is built at the size below and then drawn SCALE times as big: bigger than the wild flowers
// (0.2 to 0.4 m tall), so that a child finds it and a tap lands on it, and as tall as a hand-held posy.
const SCALE = 1.4;
const STEM = 0.34; // metres from where it stands to the hub of the bloom, before SCALE
const BLOOM = (STEM + 0.035) * SCALE; // metres up to the middle of the cup: where the glow sits and a tap is aimed
const GLOW_SIZE = 3; // metres across the glow's square, rays included
const GLOW_FAR = 1.5; // how much bigger it is drawn from 12 m off, so it still reads across a glade
const EMISSIVE_REST = 0.14; // how much each part gives out of its own colour, with the glow out
const EMISSIVE_GLOW = 0.2; // and how much more at the brightest of the glimmer

// STYLE.md section 4 and 10. The petals and centre match the tray's icon (ui.js).
const PETAL_BASE = '#a97fd0'; // deeper lilac where a petal meets the middle
const PETAL_MID = '#d3b8ee';
const PETAL_TIP = '#f3e8fc';
const GOLD = '#f2c443'; // buttercup
const GOLD_PALE = '#fff1cf';
const STEM_LOW = '#6f9a4a'; // horsetail
const STEM_HIGH = '#9cc25a'; // backlit fern
const LEAF = '#7fa046'; // clover
const GLOW = '#c08cf5'; // lilac, a little pink
const GLOW_CORE = '#fff4ff';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const colour = hex => new THREE.Color(hex);

// The flower in its own frame: the stem stands on the origin and the hub of the bloom is at (0, STEM * SCALE, 0).
// One mesh of triangles with a colour per vertex, wound so that lighting reads them (the material draws
// both sides, so a petal is lit from either).
function buildBody(random) {
  const positions = [];
  const colours = [];
  const indices = [];
  const vertex = (p, c) => {
    positions.push(p.x, p.y, p.z);
    colours.push(c.r, c.g, c.b);
    return positions.length / 3 - 1;
  };
  const at = i => new THREE.Vector3(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]);
  const triangle = (i, j, k, facing) => {
    const normal = at(j).sub(at(i)).cross(at(k).sub(at(i)));
    if (normal.dot(facing) < 0) [j, k] = [k, j];
    indices.push(i, j, k);
  };
  // Two rows of the same number of vertices, joined into quads.
  const strip = (lower, upper, facing) => {
    for (let i = 0; i + 1 < lower.length; i++) {
      const toward = typeof facing === 'function' ? facing(i) : facing;
      triangle(lower[i], lower[i + 1], upper[i], toward);
      triangle(lower[i + 1], upper[i + 1], upper[i], toward);
    }
  };
  // A rounded blade, a petal or a leaf: out from an apex through rows of three vertices (left, middle,
  // right) to a tip.
  const blade = (apex, rows, tip, facing) => {
    triangle(apex, rows[0][0], rows[0][1], facing);
    triangle(apex, rows[0][1], rows[0][2], facing);
    for (let i = 0; i + 1 < rows.length; i++) strip(rows[i], rows[i + 1], facing);
    const last = rows.at(-1);
    triangle(last[0], tip, last[1], facing);
    triangle(last[1], tip, last[2], facing);
  };

  // The stem, five-sided, with a bow in it that comes back to the axis at the hub.
  const bowTurn = random() * TAU;
  const bow = 0.012 + 0.02 * random();
  const axis = u => new THREE.Vector3(Math.cos(bowTurn) * bow * Math.sin(Math.PI * u), STEM * u, Math.sin(bowTurn) * bow * Math.sin(Math.PI * u));
  const rings = [];
  for (let r = 0; r <= 4; r++) {
    const u = r / 4;
    const radius = 0.014 - 0.005 * u;
    const c = colour(STEM_LOW).lerp(colour(STEM_HIGH), u);
    const ring = [];
    for (let s = 0; s < 5; s++) {
      const turn = (s / 5) * TAU;
      ring.push(vertex(axis(u).add(new THREE.Vector3(Math.cos(turn) * radius, 0, Math.sin(turn) * radius)), c));
    }
    ring.push(ring[0]);
    rings.push({ ring, centre: axis(u) });
  }
  for (let r = 0; r < 4; r++) strip(rings[r].ring, rings[r + 1].ring, i => at(rings[r].ring[i]).sub(rings[r].centre));

  // Two basal leaves, arching out and a little down.
  const leafTurn = random() * TAU;
  for (const [turn, length] of [[leafTurn, 0.15 + 0.04 * random()], [leafTurn + Math.PI * (0.8 + 0.4 * random()), 0.13 + 0.04 * random()]]) {
    const out = new THREE.Vector3(Math.cos(turn), 0, Math.sin(turn));
    const side = new THREE.Vector3(-Math.sin(turn), 0, Math.cos(turn));
    const spine = v => out.clone().multiplyScalar(length * v).setY(0.06 + length * (0.55 * v - 0.65 * v * v));
    const leafShade = v => colour(LEAF).lerp(colour(STEM_HIGH), v * 0.6);
    const rows = [[0.26, 0.7], [0.5, 1], [0.74, 0.82], [0.92, 0.45]].map(([v, share]) => {
      const middle = spine(v);
      const half = 0.034 * share;
      const edge = sign => middle.clone().addScaledVector(side, sign * half).addScaledVector(UP, 0.006);
      return [vertex(edge(-1), leafShade(v)), vertex(middle, leafShade(v)), vertex(edge(1), leafShade(v))];
    });
    blade(vertex(spine(0), colour(STEM_LOW)), rows, vertex(spine(1), leafShade(1)), UP);
  }

  // Five petals, cupped: each curls up from the hub like a spoon. A petal is no wider than where its
  // neighbours would touch, and ends in a round tip.
  const hubAt = new THREE.Vector3(0, STEM, 0);
  const hub = vertex(hubAt, colour(PETAL_BASE));
  const PETAL = 0.115; // metres along the surface
  const lean = [THREE.MathUtils.degToRad(15), THREE.MathUtils.degToRad(55)]; // above the horizontal, at the hub and at the tip
  const turned = random() * TAU;
  const share = u => (u < 0.62 ? 0.5 + (0.5 * u) / 0.62 : Math.sqrt(Math.max(0, 1 - ((u - 0.62) / 0.38) ** 2)));
  const petalShade = u => (u < 0.5 ? colour(PETAL_BASE).lerp(colour(PETAL_MID), u / 0.5) : colour(PETAL_MID).lerp(colour(PETAL_TIP), (u - 0.5) / 0.5));
  for (let p = 0; p < 5; p++) {
    const turn = turned + (p / 5) * TAU;
    const out = new THREE.Vector3(Math.cos(turn), 0, Math.sin(turn));
    const side = new THREE.Vector3(-Math.sin(turn), 0, Math.cos(turn));
    const curl = lean[1] - lean[0];
    const along = u => {
      const angle = lean[0] + curl * u;
      const reach = (PETAL / curl) * (Math.sin(angle) - Math.sin(lean[0]));
      const rise = (PETAL / curl) * (Math.cos(lean[0]) - Math.cos(angle));
      return { angle, reach, middle: hubAt.clone().addScaledVector(out, reach).addScaledVector(UP, rise) };
    };
    const rows = [0.18, 0.4, 0.62, 0.78, 0.9, 0.97].map(u => {
      const { angle, reach, middle } = along(u);
      const half = share(u) * 0.55 * reach;
      const inward = out.clone().multiplyScalar(-Math.sin(angle)).addScaledVector(UP, Math.cos(angle)); // into the cup
      const edge = sign => middle.clone().addScaledVector(side, sign * half).addScaledVector(inward, 0.3 * half);
      return [vertex(edge(-1), petalShade(u)), vertex(middle, petalShade(u)), vertex(edge(1), petalShade(u))];
    });
    blade(hub, rows, vertex(along(1).middle, petalShade(1)), UP);
  }

  // The gold centre, a low dome standing in the cup.
  const domeRings = [[0.04, 0.012], [0.028, 0.032]].map(([radius, rise], r) => {
    const ring = [];
    for (let s = 0; s < 8; s++) {
      const turn = (s / 8) * TAU;
      ring.push(vertex(hubAt.clone().add(new THREE.Vector3(Math.cos(turn) * radius, rise, Math.sin(turn) * radius)), colour(GOLD).lerp(colour(GOLD_PALE), r * 0.4)));
    }
    ring.push(ring[0]);
    return ring;
  });
  const outward = i => at(i).sub(hubAt);
  strip(domeRings[0], domeRings[1], i => outward(domeRings[0][i]));
  const top = vertex(hubAt.clone().add(new THREE.Vector3(0, 0.048, 0)), colour(GOLD_PALE));
  for (let i = 0; i < 8; i++) triangle(domeRings[1][i], domeRings[1][i + 1], top, outward(domeRings[1][i]));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.scale(SCALE, SCALE, SCALE);
  geometry.computeVertexNormals();
  return geometry;
}

// Each part of the flower gives out light of its own colour, so the petals glow lilac-white, the centre
// gold and the leaves green, instead of all of it going grey-white. The anchor is the line after which
// the standard shader has the emissive colour; it is the same in every three material.
const EMISSIVE_ANCHOR = '#include <emissivemap_fragment>';
function giveOutOwnColour(shader) {
  if (!shader.fragmentShader.includes(EMISSIVE_ANCHOR)) {
    console.warn('[glow-flower] three\'s standard shader has changed: the flowers will not glow in their own colours');
    return;
  }
  shader.fragmentShader = shader.fragmentShader.replace(EMISSIVE_ANCHOR, chunk => `${chunk}\n\ttotalEmissiveRadiance *= vColor.rgb;`);
}

// The glow: a square that always faces the camera, with a soft round halo, a hot core and eight rays (four
// long, four short) whose length throbs. Additive, like the sparkles and the forest's motes, so nothing
// needs sorting. Shader source stays ASCII.
const GLOW_VERT = /* glsl */`
uniform float uSize; // metres across the square
uniform float uPulse; // 0 to 1, once in each throb: the glow swells a little with it
varying vec2 vQuad; // -1 to 1 across it
varying float vNear; // 1 from 7 m off, less the nearer the camera comes: the flower itself must read up close
varying float vHeight; // metres above the world's zero, of this point of the square
#include <common>
#include <fog_pars_vertex>
void main() {
  vQuad = position.xy * 2.0;
  float scale = length( modelMatrix[ 0 ].xyz ); // a flower shrinking into a hand takes its glow with it
  vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  float away = -mvPosition.z; // metres from the camera
  // Not a wall of light right in the lens, and a little bigger the further off it is.
  float taper = mix( 0.2, 1.0, smoothstep( 0.8, 5.0, away ) ) * mix( 1.0, ${GLOW_FAR.toFixed(2)}, smoothstep( 6.0, 12.0, away ) );
  vNear = mix( 0.15, 1.0, smoothstep( 1.5, 7.0, away ) );
  mvPosition.xy += position.xy * uSize * scale * taper * ( 0.88 + 0.12 * uPulse );
  gl_Position = projectionMatrix * mvPosition;
  vHeight = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).y + cameraPosition.y;
  #include <fog_vertex>
}`;

const GLOW_FRAG = /* glsl */`
uniform vec3 uGlow;
uniform vec3 uCore;
uniform float uLevel; // 0 to 1: how bright the glow is now
uniform float uPulse; // 0 to 1, once in each throb: how long the rays are
uniform float uFloor; // the ground under the flower: the glow fades out toward it, so the ground does not cut it in a line
varying vec2 vQuad;
varying float vNear;
varying float vHeight;
#include <common>
#include <fog_pars_fragment>
// A thin ray along x: out to len, no wider than a few centimetres.
float ray( vec2 p, float len ) {
  return pow( max( 0.0, 1.0 - abs( p.x ) / len ), 2.0 ) * exp( -abs( p.y ) * 30.0 );
}
void main() {
  float r = length( vQuad );
  float halo = exp( -r * r * 12.0 ) * ( 1.0 - smoothstep( 0.4, 0.75, r ) );
  float core = exp( -r * r * 90.0 );
  float len = 0.4 + 0.55 * uPulse;
  vec2 d = vec2( vQuad.x + vQuad.y, vQuad.x - vQuad.y ) * 0.70711;
  float rays = ray( vQuad, len ) + ray( vQuad.yx, len ) + 0.6 * ( ray( d, len * 0.55 ) + ray( d.yx, len * 0.55 ) );
  float a = clamp( 1.6 * halo + 0.8 * core + 0.9 * rays, 0.0, 1.0 ) * uLevel * vNear * smoothstep( uFloor - 0.05, uFloor + 0.4, vHeight );
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( mix( uGlow, uCore, clamp( core + 0.7 * rays, 0.0, 1.0 ) ), a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function buildGlow() {
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uSize: { value: GLOW_SIZE },
    uGlow: { value: colour(GLOW) },
    uCore: { value: colour(GLOW_CORE) },
    uLevel: { value: 0 },
    uPulse: { value: 0 },
    uFloor: { value: -1000 },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms,
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  material.name = 'glow flower glow';
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), (GLOW_SIZE * GLOW_FAR) / 2); // the square is drawn bigger than its plane
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Glimmer';
  mesh.renderOrder = 11; // after the forest, before the sparkles
  return mesh;
}

/**
 * A glow flower standing at `position` ([x, y, z] metres, the foot of its stem), in world.scene and, if the
 * world has effects, on them. Returns
 *   group        the THREE.Group, in world.scene (a chapter may move or re-parent it)
 *   point        the middle of the bloom, a live THREE.Vector3: use it as a search target's point
 *   glow         how bright the glimmer is now, 0 to 1 (0 with the glimmer out or the flower picked)
 *   glimmer(on)  put the glimmer on or out (it is on at first); returns DONE
 *   pick(to)     lift the flower to `to` (a point spec, default Egill's middle) and shrink it over 0.6 s,
 *                resolving the point every frame, then hide it for good; returns a Handle
 *   update(t)    pose it for game time t, in seconds (the registered effect does this every frame)
 *   dispose()
 */
export function createGlowFlower(world, { name, position } = {}) {
  if (typeof name !== 'string' || !name) throw new TypeError('A glow flower needs a name, the one its search target has ("stone", "ferns", "tree")');
  if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
    throw new TypeError(`A glow flower stands at a position [x, y, z] in metres, not ${JSON.stringify(position)}`);
  }
  if (world.effects && !world.clock) throw new Error('A glow flower runs on world.effects, so it needs world.clock (engine/clock.js) to read the game time from');

  const random = seededRandom(name);
  const phase = seededRandom(`${name} glimmer`)(); // flowers do not throb in step, and a name always throbs the same way
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: EMISSIVE_REST,
  });
  material.name = 'glow flower';
  material.onBeforeCompile = giveOutOwnColour;
  material.customProgramCacheKey = () => 'glow-flower';
  const body = new THREE.Mesh(buildBody(random), material);
  body.name = 'Flower';
  body.receiveShadow = true;
  const halo = buildGlow();
  halo.position.y = BLOOM;
  // The glow fades out toward the ground under the flower (not toward a branch it stands on), so the ground
  // does not cut it off in a straight line.
  halo.material.uniforms.uFloor.value = Math.min(position[1], world.heightAt?.(position[0], position[2]) ?? position[1]);
  const group = new THREE.Group();
  group.name = `Glow flower ${name}`;
  group.position.fromArray(position);
  group.add(body, halo);
  world.scene?.add(group);

  const point = new THREE.Vector3();
  const hand = new THREE.Vector3(); // where the point it is picked toward is this frame
  const bloom = new THREE.Vector3();
  let time = 0; // the last time update() was given
  let glimmering = true;
  let fade = 1; // 1 until it is picked, then down to 0 (and 0 for good once it is picked)
  let level = 0;
  let picked = false;
  let disposed = false;
  let picking = null; // { handle, to, from, start }

  const syncPoint = () => point.set(group.position.x, group.position.y + BLOOM * group.scale.y, group.position.z);

  function shine() {
    const wave = 0.5 + 0.5 * Math.sin(TAU * (GLIMMER_HZ * time + phase));
    level = glimmering && !disposed ? (LEVEL_FLOOR + (1 - LEVEL_FLOOR) * wave) * fade : 0;
    halo.visible = level > 0.002;
    halo.material.uniforms.uLevel.value = level;
    halo.material.uniforms.uPulse.value = wave;
    material.emissiveIntensity = EMISSIVE_REST + EMISSIVE_GLOW * level;
  }

  // The pick is over, by arriving or by being cut short: the flower is gone, wherever it got to.
  function finishPick() {
    picked = true;
    fade = 0;
    group.visible = false;
    shine();
    picking?.handle.finish();
    picking = null;
  }

  function fly() {
    const k = THREE.MathUtils.clamp((time - (picking.start ??= time)) / PICK_SECONDS, 0, 1);
    const eased = k * k * (3 - 2 * k);
    world.resolvePoint(picking.to, hand);
    bloom.lerpVectors(picking.from, hand, eased);
    bloom.y += PICK_LIFT * Math.sin(Math.PI * eased);
    const size = 1 + (PICK_SMALLEST - 1) * eased;
    group.scale.setScalar(size);
    group.position.set(bloom.x, bloom.y - BLOOM * size, bloom.z); // it shrinks about the middle of the bloom
    fade = 1 - eased * eased; // it keeps glowing on the way and goes out as it arrives
    if (k >= 1) finishPick();
  }

  function update(t) {
    if (disposed) return;
    time = t;
    if (picking) fly();
    shine();
    syncPoint();
  }

  function pick(to = 'egill') {
    if (picking) return picking.handle;
    if (picked || disposed) return DONE;
    if (!world.resolvePoint) throw new Error('A glow flower is picked toward a point, so it needs world.resolvePoint (engine/points.js)');
    world.resolvePoint(to, hand); // a point that cannot be found fails here, not a frame later
    syncPoint();
    picking = { handle: new Handle(`glow flower ${name} picked`, finishPick), to, from: point.clone(), start: null };
    return picking.handle;
  }

  function glimmer(on) {
    glimmering = Boolean(on);
    shine();
    return DONE;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    picking?.handle.cancel(); // a script waiting on it goes on
    group.removeFromParent();
    for (const mesh of [body, halo]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    shine();
  }

  world.effects?.add({
    update() {
      if (disposed || picked) return false;
      update(world.clock.time);
      return !(disposed || picked);
    },
  });
  update(world.clock?.time ?? 0);

  return {
    group, point, glimmer, pick, update, dispose,
    get glow() { return level; },
  };
}
