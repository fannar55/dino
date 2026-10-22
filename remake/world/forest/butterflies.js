// The clearing's pale butterflies: one mesh and one draw call. Their loops over the clearing are flown by the vertex
// shader alone, from the shared wind clock (flyPath). This file mirrors that formula in code (flyPoint), so each
// butterfly's place is known in code as well, and the shader keeps flying them exactly as before until the code takes
// one over. The code takes a butterfly over (it says where it is, which way it faces and how wide its wings are, through
// the uFlyHold and uFlyFace uniforms, and the shader obeys) for two things, both functions of the wind clock:
//
//   flutter(name)       up and away for 3 s, then back to its loop (a child tapped it)
//   land(spec, options) a flight to a point spec, resolved every frame, and a landing that stays on the moving point
//                       until flutter(name) sends it away (world/forest/atmosphere.js: butterflyLand)
//
// Both return a Handle (engine/handle.js) and run on uWindTime, the clock the shader reads, so they pause with the game,
// seek exactly and land on the same frame in a capture. update() runs every frame the forest is in view (the forest's
// update does it), and, so that a script waiting on a Handle is never left waiting by a forest that is not in view, on
// world.effects too for as long as a Handle is pending. The tap targets, butterfly-1 and so on, hold a point that
// follows each butterfly.
import * as THREE from 'three';
import { Handle } from '../../engine/handle.js';
import { FOREST } from './config.js';
import { clamp, createRng, lerp, smoothstep } from './random.js';

const MAX = 4; // the shader's arrays hold this many butterflies
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const AHEAD = 0.05; // how far down its loop (in the loop's own time) the shader looks to find which way a butterfly faces
const BLEND = 0.35; // seconds over which a butterfly the code takes over turns and beats its wings into the new motion

const clamp01 = k => clamp(k, 0, 1);
const smooth = k => smoothstep(0, 1, k);
/** 0 at both ends of 0..1 with no speed there, 1 in the middle: an excursion that leaves and returns without a jerk. */
const bump = k => Math.sin(Math.PI * clamp01(k)) ** 2;
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

function srgbToLinear(hex) {
  const c = new THREE.Color(hex); // THREE.Color converts sRGB hex to linear
  return [c.r, c.g, c.b];
}

// The loop of the shader, word for word as it was before the butterflies could be tapped (tests/critters.test.mjs runs this
// very text, out of the compiled shader, against flyPoint below).
const FLY_PATH_GLSL = `vec3 flyPath( int id, float t ) {
  vec3 c = uFlyCentre[ id ];
  vec3 l = uFlyLoop[ id ];
  return c + vec3( sin( t ) * l.x + sin( t * 2.3 ) * 0.35, l.z + 0.35 * sin( t * 1.7 ) + 0.12 * sin( t * 5.1 ), sin( t * 0.83 + 1.1 ) * l.y + cos( t * 1.9 ) * 0.3 );
}`;

const VERTEX_HEAD = `#include <common>
attribute vec4 aFly;
uniform float uWindTime;
uniform vec3 uFlyCentre[${MAX}];
uniform vec3 uFlyLoop[${MAX}];
uniform vec4 uFlyHold[${MAX}]; // a butterfly the code holds: xyz where it is, w the angle of its wings
uniform vec2 uFlyFace[${MAX}]; // x which way it faces (radians), y 1 while the code holds it and 0 while the loop above flies it
varying float vFlyNear; // 0 at 1 m from the lens or nearer, 1 from 2.5 m on
${FLY_PATH_GLSL}`;

const VERTEX_BODY = `#include <begin_vertex>
  int flyId = int( aFly.x + 0.5 );
  float flyT = uWindTime * aFly.z + aFly.w;
  vec3 flyP = flyPath( flyId, flyT );
  vec3 flyAhead = flyPath( flyId, flyT + 0.05 ) - flyP;
  float yaw = atan( flyAhead.z, flyAhead.x );
  float flap = 0.25 + 1.05 * ( 0.5 + 0.5 * sin( uWindTime * 17.0 + aFly.w * 7.0 ) );
  vec2 flyFace = uFlyFace[ flyId ];
  if ( flyFace.y > 0.5 ) {
    vec4 flyHold = uFlyHold[ flyId ];
    flyP = flyHold.xyz;
    flap = flyHold.w;
    yaw = flyFace.x;
  }
  vec3 lp = transformed;
  // flap: rotate the wing about the body axis (x)
  lp = vec3( lp.x, lp.y * cos( flap ) + abs( lp.z ) * sin( flap ), lp.z * cos( flap ) );
  lp *= 1.6;
  float cy = cos( yaw ), sy = sin( yaw );
  transformed = flyP + vec3( lp.x * cy - lp.z * sy, lp.y, lp.x * sy + lp.z * cy );
  // a butterfly that flies up to the lens wears away from its edges inward, as the hanging moss does (moss.js), instead of
  // filling the frame as a flat pale card: gone by 1 m, whole from 2.5 m, so further off it is as it always was
  vFlyNear = smoothstep( 1.0, 2.5, -( modelViewMatrix * vec4( transformed, 1.0 ) ).z );`;
// The fragment side of the near fade: before the alpha test, so that alpha to coverage dithers it away where there is multisampling.
const FRAGMENT_HEAD = `#include <common>
varying float vFlyNear;`;
const FRAGMENT_BODY = `#include <color_fragment>
  diffuseColor.a *= vFlyNear;`;

/** Where the shader's loop puts a butterfly when the wind clock reads `time`: flyPath, written out. */
export function flyPoint(flyer, time, out = new THREE.Vector3()) {
  const t = time * flyer.speed + flyer.phase;
  const c = flyer.centre;
  const l = flyer.loop;
  out.x = c.x + Math.sin(t) * l.x + Math.sin(t * 2.3) * 0.35;
  out.y = c.y + l.z + 0.35 * Math.sin(t * 1.7) + 0.12 * Math.sin(t * 5.1);
  out.z = c.z + Math.sin(t * 0.83 + 1.1) * l.y + Math.cos(t * 1.9) * 0.3;
  return out;
}

const loopFacing = new THREE.Vector3();
const loopAhead = new THREE.Vector3();
/** Which way the shader turns a butterfly on its loop, as an angle about the vertical. */
function loopYaw(flyer, time) {
  flyPoint(flyer, time, loopFacing);
  flyPoint(flyer, time + AHEAD / flyer.speed, loopAhead);
  return Math.atan2(loopAhead.z - loopFacing.z, loopAhead.x - loopFacing.x);
}

/** The angle of a butterfly's wings: the shader's own beat between lo and hi, `extra` radians further on in its cycle. */
function wingAngle(flyer, time, extra = 0, lo = 0.25, hi = 1.3) {
  return lo + (hi - lo) * (0.5 + 0.5 * Math.sin(time * 17 + flyer.phase * 7 + extra));
}

/**
 * The clearing's butterflies: the mesh (for the atmosphere's group) and the controller. `clearing` is [x, z] of its centre.
 * Returns { mesh, targets, flutter, land, update, dispose }.
 */
export function createButterflies(world, { seed, clearing: [cx, cz], terrain, shared, q }) {
  const B = FOREST.butterflies;
  const rng = createRng(seed, 'butterflies');
  const count = Math.min(MAX, q.name === 'low' ? 2 : B.count);
  const colours = ['#f6f1e4', '#f2dc94', '#f3b996', '#f6f1e4'];
  const pos = [], col = [], fly = [], idx = [];
  const flyers = []; // where each one loops: centre, loop (x radius, z radius, base height), speed and phase
  // one wing in local space: x forward along the body, z out to the side, y up
  const wing = [[0.0, 0.0], [0.05, 0.035], [0.075, 0.085], [0.03, 0.105], [-0.02, 0.085], [-0.06, 0.06], [-0.055, 0.02]];
  for (let b = 0; b < count; b++) {
    const a = rng.angle(), r = rng.range(3.5, 7.5);
    const centre = [cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r];
    centre[1] = terrain.heightAt(centre[0], centre[2]);
    const loop = [rng.range(1.4, 2.6), rng.range(1.2, 2.2), rng.range(0.7, 1.6)]; // x radius, z radius, base height
    const speed = rng.range(0.55, 0.85), phase = rng.angle();
    const c = srgbToLinear(colours[b % colours.length]);
    const edge = c.map(v => v * 0.55);
    for (const side of [-1, 1]) {
      const base = pos.length / 3;
      wing.forEach(([wx, wz], i) => {
        pos.push(wx, 0, wz * side);
        col.push(...(i === 0 ? edge : i === 2 || i === 3 ? edge : c));
        fly.push(b, side, speed, phase);
      });
      // fan from the root vertex
      for (let i = 1; i < wing.length - 1; i++) idx.push(base, base + i, base + i + 1);
    }
    // body: a thin dark sliver
    const base = pos.length / 3;
    for (const [bx, bz] of [[0.045, 0], [-0.04, -0.006], [-0.04, 0.006]]) {
      pos.push(bx, 0.002, bz); col.push(0.12, 0.1, 0.08); fly.push(b, 0, speed, phase);
    }
    idx.push(base, base + 1, base + 2);
    // the mesh holds a butterfly's speed and phase as 32-bit floats, and the shader flies it on those
    flyers.push({ centre: new THREE.Vector3(...centre), loop: new THREE.Vector3(...loop), speed: Math.fround(speed), phase: Math.fround(phase) });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute('aFly', new THREE.Float32BufferAttribute(fly, 4));
  geometry.setIndex(idx);
  const centres = flyers.map(f => f.centre);
  const loops = flyers.map(f => f.loop);
  while (centres.length < MAX) { centres.push(new THREE.Vector3()); loops.push(new THREE.Vector3(1, 1, 1)); }
  const holds = centres.map(() => new THREE.Vector4());
  const faces = centres.map(() => new THREE.Vector2());
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: Boolean(q.antialias) });
  material.name = 'forest-butterflies';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      uWindTime: shared.uWindTime, uFlyCentre: { value: centres }, uFlyLoop: { value: loops },
      uFlyHold: { value: holds }, uFlyFace: { value: faces },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_HEAD)
      .replace('#include <begin_vertex>', VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAGMENT_HEAD)
      .replace('#include <color_fragment>', FRAGMENT_BODY);
  };
  material.customProgramCacheKey = () => 'forest-butterflies';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Butterflies';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;

  // ---- the code's side: where each butterfly is, and what it is doing -----------------------------------------------
  // mode: 'loop' (the shader flies it), 'leave' (fluttering up and away, then back to its loop), 'land' (flying to a point)
  // or 'landed' (sitting on it).
  const tune = createRng(seed, 'butterfly-flutter'); // its own stream: the loops above are drawn as they were
  const list = flyers.map((flyer, index) => ({
    flyer, name: `butterfly-${index + 1}`,
    mode: 'loop', t0: 0, handle: null,
    pos: new THREE.Vector3(), yaw: 0, flap: 0, // as of the last update
    point: new THREE.Vector3(), // the tap target's point: pos, for good the same vector
    from: new THREE.Vector3(), yaw0: 0, flap0: 0, // where, which way and how wide when the code took over
    away: new THREE.Vector2(), awayTurn: tune.angle(), wobble: tune.angle(), flutters: 0, // the flutter's way out
    to: new THREE.Vector3(), spec: null, duration: 0, reach: 0, side: new THREE.Vector2(), approachYaw: 0, // the landing
    perch: false, // a flutter that starts from a landing, not from the loop
  }));
  const byName = new Map(list.map(b => [b.name, b]));
  const targets = list.map(b => ({ name: b.name, point: b.point, radius: B.radius }));
  const scratch = new THREE.Vector3();
  let disposed = false;

  const now = () => shared.uWindTime.value; // the clock the shader reads
  // While a Handle is pending the butterflies are also updated on world.effects: the forest's own update only runs while it is the
  // one in view, and a script waiting on a landing must not wait for ever because the chapter went to another place.
  let driver = null;
  function drive() {
    if (!world.effects) return;
    if (driver && (world.effects.has?.(driver) ?? true)) return; // still running (a stopped scene clears it away: then a new one)
    driver = world.effects.add({
      update() {
        if (!disposed) update();
        if (!disposed && list.some(b => b.handle && !b.handle.done)) return true;
        driver = null;
        return false;
      },
    });
  }
  function resolve(spec, out) {
    if (world.resolvePoint) return world.resolvePoint(spec, out);
    if (spec?.isVector3) return out.copy(spec);
    if (Array.isArray(spec)) return out.fromArray(spec);
    throw new Error('A butterfly flies to a point spec, so it needs world.resolvePoint (engine/points.js)');
  }

  /** The handle a mode ended without finishing: a script that waits on it goes on. */
  function release(b) {
    const handle = b.handle;
    b.handle = null;
    if (handle && !handle.done) {
      handle.onCancel = null;
      handle.cancel();
    }
  }

  // The way out of a flutter: horizontally away from the camera, else round a golden angle for each flutter.
  function chooseAway(b) {
    const camera = world.camera?.position;
    let dx = camera ? b.pos.x - camera.x : 0;
    let dz = camera ? b.pos.z - camera.z : 0;
    let length = Math.hypot(dx, dz);
    if (!(length > 0.5)) {
      const turn = b.awayTurn + b.flutters * GOLDEN_ANGLE;
      dx = Math.cos(turn);
      dz = Math.sin(turn);
      length = 1;
    }
    b.away.set(dx / length, dz / length);
  }

  function startLeave(b, perch) {
    b.mode = 'leave';
    b.t0 = now();
    b.perch = perch;
    b.from.copy(b.pos);
    b.yaw0 = b.yaw;
    b.flap0 = b.flap;
    chooseAway(b);
    b.flutters++;
    b.handle = new Handle(`${b.name} flutters`);
    drive();
    return b.handle;
  }

  // ---- positions as functions of the wind clock -------------------------------------------------------------------
  /** A leave: from where it sat (or from its loop) back to the loop, with an excursion up and away that is nothing at both ends. */
  function leavePosition(b, time, out) {
    const F = B.flutter;
    const k = clamp01((time - b.t0) / F.seconds);
    const e = bump(k);
    flyPoint(b.flyer, time, out);
    if (b.perch) out.lerp(b.from, 1 - smooth(k));
    const zig = F.zigzag * e * Math.sin((time - b.t0) * 7 + b.wobble);
    out.x += b.away.x * F.away * e - b.away.y * zig;
    out.y += F.rise * e + 0.4 * zig;
    out.z += b.away.y * F.away * e + b.away.x * zig;
    return out;
  }

  /** A flight to b.to: fast away from where it was, soft onto the point, in an arc with a little weave. */
  function landPosition(b, time, out) {
    const L = B.land;
    const k = clamp01((time - b.t0) / b.duration);
    const arc = Math.sin(Math.PI * k);
    out.lerpVectors(b.from, b.to, 1 - (1 - k) ** 3);
    out.y += L.lift * b.reach * arc;
    const weave = L.weave * b.reach * Math.sin((time - b.t0) * 6.5 + b.wobble) * arc * (1 - k);
    out.x += b.side.x * weave;
    out.z += b.side.y * weave;
    return out;
  }

  const motion = { pos: new THREE.Vector3(), ahead: new THREE.Vector3() };
  function faceOf(b, fn, time) {
    fn(b, time, motion.pos);
    fn(b, time + AHEAD / b.flyer.speed, motion.ahead);
    return Math.atan2(motion.ahead.z - motion.pos.z, motion.ahead.x - motion.pos.x);
  }

  /** Poses butterfly b for `time`: b.pos, b.yaw and b.flap. Returns true while the code holds it. */
  function pose(b, time) {
    const F = B.flutter;
    const L = B.land;
    if (b.mode === 'leave' && time - b.t0 >= F.seconds) {
      b.mode = 'loop';
      const handle = b.handle;
      b.handle = null;
      handle?.finish();
    }
    if (b.mode === 'land' || b.mode === 'landed') {
      try {
        resolve(b.spec, b.to);
      } catch (error) {
        console.error(`[butterfly ${b.name}] its landing point is gone, so it flies off:`, error);
        release(b);
        startLeave(b, true);
      }
    }
    if (b.mode === 'land' && time - b.t0 >= b.duration) {
      b.mode = 'landed';
      const handle = b.handle;
      b.handle = null;
      handle?.finish();
    }
    switch (b.mode) {
      case 'loop':
        flyPoint(b.flyer, time, b.pos);
        b.yaw = loopYaw(b.flyer, time);
        b.flap = wingAngle(b.flyer, time);
        return false;
      case 'leave': {
        const k = clamp01((time - b.t0) / F.seconds);
        const into = smooth((time - b.t0) / BLEND);
        leavePosition(b, time, b.pos);
        b.yaw = lerpAngle(b.yaw0, faceOf(b, leavePosition, time), into);
        // each wing beat quickens as the excursion peaks, and the beats gained add up to whole ones, so the beat is the shader's again at the end
        const extra = 2 * Math.PI * F.beats * k - F.beats * Math.sin(2 * Math.PI * k);
        const startled = bump(k);
        b.flap = lerp(b.flap0, wingAngle(b.flyer, time, extra, lerp(0.25, F.wings[0], startled), lerp(1.3, F.wings[1], startled)), b.perch ? into : 1);
        return true;
      }
      case 'land': {
        const k = clamp01((time - b.t0) / b.duration);
        const into = smooth((time - b.t0) / BLEND);
        landPosition(b, time, b.pos);
        // it faces the way it flies, and the way it came as it touches down (its speed is nothing then, so which way it flies is chance)
        b.yaw = lerpAngle(b.yaw0, lerpAngle(faceOf(b, landPosition, time), b.approachYaw, smooth((k - 0.55) / 0.4)), into);
        b.flap = lerp(b.flap0, wingAngle(b.flyer, time, L.excited * (time - b.t0), L.wings[0], L.wings[1]), into);
        return true;
      }
      default: { // landed: on the point, wings folded up and slowly opening and closing
        const since = time - (b.t0 + b.duration);
        b.pos.copy(b.to);
        b.yaw = b.approachYaw;
        const excited = wingAngle(b.flyer, time, L.excited * (time - b.t0), L.wings[0], L.wings[1]);
        const rest = L.rest[0] + L.rest[1] * Math.sin(L.rest[2] * since + b.wobble);
        b.flap = lerp(excited, rest, smooth(since / L.settle));
        return true;
      }
    }
  }

  function update() {
    if (disposed) return;
    const time = now();
    list.forEach((b, i) => {
      const held = pose(b, time);
      b.point.copy(b.pos);
      holds[i].set(b.pos.x, b.pos.y, b.pos.z, b.flap);
      faces[i].set(b.yaw, held ? 1 : 0);
    });
  }

  const known = () => [...byName.keys()].join(', ');
  function named(name) {
    const b = byName.get(name);
    if (!b) throw new Error(`No butterfly named "${name}" (this forest has ${known()})`);
    return b;
  }

  /** The butterfly flutters up and away for 3 s and returns to its loop. A tap on one that is fluttering joins that flutter. */
  function flutter(name) {
    const b = named(name);
    if (disposed) return new Handle(`${name} flutters`).finish();
    if (b.mode === 'leave') return b.handle;
    const perch = b.mode === 'land' || b.mode === 'landed';
    release(b);
    return startLeave(b, perch);
  }

  /**
   * Fly a butterfly (the one nearest the point, unless `name` says which) to `spec`, a point spec resolved every frame, over
   * `duration` seconds and settle it there. The handle finishes when it has landed. It stays on the point, wherever that goes,
   * until flutter(name) sends it away; cancelling the handle on the way sends it away too.
   */
  function land(spec, { duration = B.land.seconds, name } = {}) {
    if (!(Number.isFinite(duration) && duration > 0)) throw new TypeError(`A butterfly lands over a duration in seconds above 0, not ${duration}`);
    if (spec == null) throw new TypeError('A butterfly lands on a point spec: a position, an actor\'s part, or a function');
    const target = resolve(spec, new THREE.Vector3()); // a point that cannot be found fails here, not a frame later
    let b;
    if (name !== undefined) {
      b = named(name);
    } else {
      // the one nearest the point, from those still looping if there are any, else from those not sitting
      const pick = (...modes) => list.filter(c => modes.includes(c.mode)).sort((p, r) => p.pos.distanceToSquared(target) - r.pos.distanceToSquared(target))[0];
      b = pick('loop') ?? pick('loop', 'leave') ?? pick('loop', 'leave', 'land', 'landed');
    }
    if (disposed) return new Handle(`${b.name} lands`).finish();
    release(b);
    b.mode = 'land';
    b.t0 = now();
    b.duration = duration;
    b.spec = spec;
    b.to.copy(target);
    b.from.copy(b.pos);
    b.yaw0 = b.yaw;
    b.flap0 = b.flap;
    scratch.subVectors(b.to, b.from);
    b.reach = Math.min(1, scratch.length() / 4);
    const across = Math.hypot(scratch.x, scratch.z);
    if (across > 1e-6) b.side.set(-scratch.z / across, scratch.x / across);
    else b.side.set(Math.cos(b.awayTurn), Math.sin(b.awayTurn));
    b.approachYaw = across > 0.05 ? Math.atan2(scratch.z, scratch.x) : b.yaw;
    b.handle = new Handle(`${b.name} lands`, () => {
      // cancelled on the way: it flies off and back to its loop
      b.handle = null;
      if (b.mode === 'land') startLeave(b, true);
    });
    drive();
    return b.handle;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const b of list) release(b); // a script waiting on a butterfly goes on
    geometry.dispose();
    material.dispose();
  }

  update(); // the points are right from the start
  return { mesh, targets, flutter, land, update, dispose };
}
