import * as THREE from 'three';
import { createActor } from '../actor.js';
import { BOARD, tilePosition } from './rules.js';
import { THORSEDLA_MODEL } from './places.js';
import { createThorsedlaLod } from './thorsedla-lod.js';

// The Þórseðlas of the board (spec section 4): the chapter's own Þórseðla (brontosaurus.glb, engine/actor.js: her idle
// breathing, her blinking eyelids, her voice on her jaw), six of her, each in a colour of her own, standing on the shelves
// behind the tiers (places.js). Her neck is a ladder and her tail a slide, as Codex's are, but alive:
//
//  - At rest her neck rises from her chest to the tier above and her head rests behind its square, the neck's last square,
//    so the child sees where it goes; she breathes, her head bobs, she looks at the piece whose turn it is and blinks.
//  - bow(): her neck bends down and her head comes down onto the neck's first square, in front of her chest.
//  - lift(): with a piece on the top of her neck she lifts it up and over the tier above, back to rest, and the piece hops off
//    onto the square at her head. Her neck is posed afresh every frame (an arc through its bones toward where the top of the
//    neck should be), so it bends smoothly whatever the two squares are.
//  - Her tail lies from her rump over the tail's first square, over the tier's edge and down onto the square it slides to.
//    swish() sends a wave along it, flick() a little toss of its tip (a piece shoots off it at the bottom).
//  - cheer(): her happy clip, her neck and tail waving (a win, a ride).
//
// The model's neck and tail are too short for some routes (Burkni's neck climbs two tiers and Lyng's tail drops two), so their
// bones are drawn out to the length the route needs: the joints of the chain move apart along the bones, and the skin, whose
// weights blend smoothly along the chain (tools/bake/skin.js chainWeighting), stretches with them.
//
//   const thorsedlas = await createThorsedlas(world, board, places)
//   thorsedlas.list, thorsedlas.neckAt(from), thorsedlas.tailAt(from)
//   thorsedlas.lookAt(point)           every Þórseðla near it looks (a Vector3, or null: they look about by themselves)
//   thorsedlas.update(dt)
//   one Þórseðla: { place, actor, root, ridePoint(out), bow({ duration }), lift({ duration, onProgress }), slideCurve(),
//                  swish(), flick(), cheer(seconds), talk(line), calm }

const URL_MODEL = new URL('../../assets/characters/brontosaurus.glb', import.meta.url).href;
const NECK = ['Neck', 'Neck2', 'Neck3', 'Neck4', 'Neck5', 'Head'];
const TAIL = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7', 'Tail8'];
const RIDE_JOINT = 4; // the piece rides on the top of the neck at Neck5, just behind the head
const TURN = 12; // degrees each turns toward the camera from side-on, so her face shows
const BEHIND = -1.9; // z of the top of her neck at a square: just behind the blocks, clear of the tier's log
const LOOK = { yaw: 40, pitch: 22, near: 14 }; // degrees her head turns toward a piece at most; metres within which she looks

// Each one's colour: a turn of the model's own hue (the painted skin and its spots keep their pattern), its saturation and
// brightness. The model's skin is a warm apricot; Codex's six colours are green, gold, sage, coral, birch and lilac.
const TINTS = {
  fern: { hue: -95, sat: 0.72, bright: 0.92 },
  amber: { hue: -6, sat: 1.25, bright: 1.03 },
  sage: { hue: -125, sat: 0.42, bright: 1.0 },
  coral: { hue: 24, sat: 1.15, bright: 1.0 },
  birch: { hue: -2, sat: 0.6, bright: 1.08 },
  plum: { hue: 95, sat: 0.6, bright: 1.02 },
};

const HUE_GLSL = `
uniform vec3 uTint;
vec3 tintColour(vec3 c) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c;
  float ch = cos(uTint.x), sh = sin(uTint.x);
  yiq.yz = mat2(ch, sh, -sh, ch) * yiq.yz * uTint.y;
  return max(toRGB * yiq, 0.0) * uTint.z;
}`;

/** Give a material (a clone) the tint: after its colour map, the hue turned, the saturation and brightness scaled. */
function tinted(material, tint, after = '#include <map_fragment>', key = 'thorsedla-tint') {
  const m = material.clone();
  const uniform = { value: new THREE.Vector3(THREE.MathUtils.degToRad(tint.hue), tint.sat, tint.bright) };
  const before = material.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.uniforms.uTint = uniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HUE_GLSL}`)
      .replace(after, `${after}\ndiffuseColor.rgb = tintColour(diffuseColor.rgb);`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

const V3 = THREE.Vector3;
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
const va = new V3(), vb = new V3(), vc = new V3();
const X = new V3(1, 0, 0), UP = new V3(0, 1, 0);
const findBone = (model, name) => model.getObjectByName(name) ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

/** Find θ0 and δ so that segments of `lengths`, the i-th at angle θ0 + iδ, end at (u, v). Warm-started; δ bends forward-down. */
function solveArc(lengths, u, v, guess) {
  let [a, d] = guess;
  const end = (a, d, out) => {
    let x = 0, y = 0;
    for (let i = 0; i < lengths.length; i++) { x += lengths[i] * Math.cos(a + i * d); y += lengths[i] * Math.sin(a + i * d); }
    out[0] = x; out[1] = y;
    return out;
  };
  const e = [0, 0], ea = [0, 0], ed = [0, 0];
  for (let it = 0; it < 16; it++) {
    end(a, d, e);
    const ex = e[0] - u, ey = e[1] - v;
    if (ex * ex + ey * ey < 1e-7) break;
    const h = 1e-4;
    end(a + h, d, ea); end(a, d + h, ed);
    const j00 = (ea[0] - e[0]) / h, j01 = (ed[0] - e[0]) / h, j10 = (ea[1] - e[1]) / h, j11 = (ed[1] - e[1]) / h;
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-9) { d -= 0.05; continue; }
    const da = (j11 * ex - j01 * ey) / det, dd = (-j10 * ex + j00 * ey) / det;
    const step = Math.min(1, 0.35 / Math.max(Math.abs(da), Math.abs(dd), 1e-9));
    a -= da * step;
    d = Math.min(0.18, Math.max(-0.8, d - dd * step));
  }
  guess[0] = a; guess[1] = d;
  return guess;
}

/** A polyline sampled from points, with its arc length: pointAt(s, out) by metres along it. */
function sampled(points) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const samples = curve.getSpacedPoints(160);
  const lengths = [0];
  for (let i = 1; i < samples.length; i++) lengths.push(lengths[i - 1] + samples[i].distanceTo(samples[i - 1]));
  const total = lengths[lengths.length - 1];
  return {
    samples, total,
    pointAt(s, out = new V3()) {
      if (s <= 0) return out.copy(samples[0]);
      if (s >= total) return out.copy(samples[samples.length - 1]).addScaledVector(vc.subVectors(samples[samples.length - 1], samples[samples.length - 2]).normalize(), s - total);
      let lo = 0, hi = lengths.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lengths[mid] < s) lo = mid; else hi = mid; }
      return out.lerpVectors(samples[lo], samples[hi], (s - lengths[lo]) / Math.max(1e-6, lengths[hi] - lengths[lo]));
    },
  };
}

/** Average distance of the skin from a joint, across the chain there: the chain's thickness at each joint (root frame). */
function chainRadii(skin, root, joints) {
  const position = skin.geometry.attributes.position;
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(skin.matrixWorld);
  const sums = joints.map(() => [0, 0]);
  const p = new V3();
  for (let i = 0; i < position.count; i += 3) {
    p.fromBufferAttribute(position, i).applyMatrix4(toRoot);
    for (let j = 0; j < joints.length; j++) {
      const a = joints[j], b = joints[Math.min(joints.length - 1, j + 1)], c = joints[Math.max(0, j - 1)];
      const dir = va.subVectors(b, c).normalize();
      const along = vb.subVectors(p, a).dot(dir);
      if (Math.abs(along) > 0.18) continue;
      const across = vb.subVectors(p, a).addScaledVector(dir, -along).length();
      if (across > 2.6) continue;
      sums[j][0] += across; sums[j][1]++;
    }
  }
  return sums.map(([s, n]) => (n ? s / n : 0.4));
}

export async function createThorsedlas(world, board, places) {
  // their own levels of detail (thorsedla-lod.js), not character-lod.js's: an actor world without a renderer skips those
  const own = Object.create(world);
  own.renderer = null;
  const lod = createThorsedlaLod(world.lighting?.sun);
  const list = await Promise.all(places.map(place => createThorsedla(own, board, place, lod)));
  const necks = new Map(list.filter(t => t.place.neck).map(t => [t.place.neck.from, t]));
  const tails = new Map(list.filter(t => t.place.tail).map(t => [t.place.tail.from, t]));
  return {
    list,
    neckAt: from => necks.get(from) ?? null,
    tailAt: from => tails.get(from) ?? null,
    lookAt(point) { for (const t of list) t.lookAt(point); },
    set calm(value) { for (const t of list) t.calm = value; },
    update(dt) { for (const t of list) t.update(dt); },
    updateLevels(camera, height) { lod.update(camera, height); },
    ready: () => lod.ready(),
    levels: () => lod.info(),
    dispose() { for (const t of list) t.actor.dispose(); },
  };
}

async function createThorsedla(world, board, place, lod) {
  const k = place.size;
  const ground = place.tier === 0 ? world.heightAt(place.x, place.z) : board.tierY(place.tier) - 0.3;
  const own = Object.create(world);
  own.heightAt = () => ground;
  const heading = place.facing > 0 ? TURN : 180 - TURN;
  const actor = await createActor(own, { name: `thorsedla-${place.id}`, url: URL_MODEL, position: [place.x, ground, place.z], heading });
  const { root, model } = actor;
  root.scale.setScalar(k);
  root.updateMatrixWorld(true);
  let skin = null;
  model.traverse(o => { if (o.isSkinnedMesh && (!skin || o.geometry.attributes.position.count > skin.geometry.attributes.position.count)) skin = o; });

  // her colour (the eyelids too, so a blink does not show the model's own apricot)
  const tint = TINTS[place.id] ?? { hue: 0, sat: 1, bright: 1 };
  model.traverse(o => {
    if (!o.isMesh || !o.material || o.material.name === 'eyelids') return;
    o.material = tinted(o.material, tint);
  });
  if (actor.eyelids?.mesh) actor.eyelids.mesh.material = tinted(actor.eyelids.mesh.material, tint, '#include <color_fragment>', 'eyelids-tint');
  lod?.add(actor, { tint: (material, hook, key) => tinted(material, tint, hook, key) });

  // ---- the chains, measured in the bind pose in the root's frame ------------------------------------------------------
  const neckBones = NECK.map(n => findBone(model, n));
  const tailBones = TAIL.map(n => findBone(model, n));
  const chest = neckBones[0].parent, hips = tailBones[0].parent;
  const rootQ = root.quaternion.clone(), rootQi = rootQ.clone().invert();
  const bindPos = bones => bones.map(b => root.worldToLocal(b.getWorldPosition(new V3())));
  const bindQ = bones => bones.map(b => rootQi.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())));
  const neckBind = bindPos(neckBones), tailBind = bindPos(tailBones);
  const neckRadius = chainRadii(skin, root, neckBind), tailRadius = chainRadii(skin, root, tailBind);
  const neckO = bindQ(neckBones), tailO = bindQ(tailBones);
  const restDir = joints => joints.slice(0, -1).map((p, i) => new V3().subVectors(joints[i + 1], p).normalize());
  const neckRest = restDir(neckBind), tailRest = restDir(tailBind);
  const tipLength = 0.99; // the tail's tip past its last joint (model metres)

  /** Draw a chain's joints apart by `s` (its bones' offsets from their parents). */
  const stretch = (bones, s) => { for (let i = 1; i < bones.length; i++) bones[i].position.multiplyScalar(s); };
  const lengthsOf = joints => joints.slice(0, -1).map((p, i) => p.distanceTo(joints[i + 1]));
  let neckLengths = lengthsOf(neckBind), tailLengths = lengthsOf(tailBind);

  const square = (n, out = new V3()) => board.square(n, out);
  const neckTop = (n, out = new V3()) => square(n, out).add(va.set(place.facing * 0.15, neckRadius[RIDE_JOINT] * k * 0.9 + 0.12, 0)).setZ(BEHIND);

  // ---- the neck: where its top rests (at the neck's last square) and where it comes down (its first) ------------------------
  let neckRestPoint = null, neckDownPoint = null, neckS = 1;
  const arcGuess = [1.2, -0.3];
  if (place.neck) {
    neckRestPoint = neckTop(place.neck.to);
    neckDownPoint = neckTop(place.neck.from);
    // long enough to reach the higher of the two, with a little bend left
    const base = root.localToWorld(neckBind[0].clone());
    const reach = Math.max(base.distanceTo(neckRestPoint), base.distanceTo(neckDownPoint)) / k;
    const have = neckLengths.slice(0, RIDE_JOINT).reduce((a, b) => a + b, 0);
    neckS = Math.max(1, (reach * 1.12) / have);
    if (neckS > 1.001) {
      stretch(neckBones, neckS);
      neckLengths = neckLengths.map(l => l * neckS);
    }
  }

  // ---- the tail: its rest curve, from the rump over the first square and down onto the last ---------------------------------
  const rump = root.localToWorld(tailBind[0].clone());
  let tailCurve;
  const f = place.facing;
  if (place.tail) {
    const a = square(place.tail.from), b = square(place.tail.to);
    const top = tailRadius[3] * k * 0.8;
    // Over the tier's edge between two plaques (the first square's and its neighbour's toward the last square), so no number
    // is hidden, and down in front of the tiers between, each passed between two plaques too.
    const side = Math.sign(b.x - a.x) || -f;
    const gap = a.x + side * BOARD.spacing / 2;
    const points = [
      rump.clone(),
      new V3(rump.x - f * 1.4, rump.y - 1.0, rump.z + 0.6),
      new V3(a.x + side * 0.35, a.y + top + 0.15, -0.35),
      new V3(gap, a.y - 0.2, 1.55),
      new V3(gap, a.y - 1.3, 1.95),
    ];
    for (let y = a.y - BOARD.rowHeight; y > b.y + 1; y -= BOARD.rowHeight) points.push(new V3(gap, y - 0.4, 1.95)); // past a tier between
    points.push(new V3((gap + b.x) / 2, b.y + 1.1, 1.45), new V3(b.x + side * 0.2, b.y + 0.24, 0.2));
    tailCurve = sampled(points);
    const have = tailLengths.reduce((s, l) => s + l, 0);
    const want = tailCurve.total / k - tipLength;
    const s = Math.max(1, want / have);
    if (s > 1.001) { stretch(tailBones, s); tailLengths = tailLengths.map(l => l * s); }
  } else {
    // an ordinary tail: down behind her and along the ground, curling away from the board
    const g = place.tier === 0 ? ground : board.tierY(place.tier) - 0.3;
    tailCurve = sampled([
      rump.clone(),
      new V3(rump.x - f * 2.4, g + 2.0, rump.z - 0.4),
      new V3(rump.x - f * 4.6, g + 0.6, rump.z - 1.6),
      new V3(rump.x - f * 6.2, g + 0.35, rump.z - 3.4),
      new V3(rump.x - f * 7.0, g + 0.3, rump.z - 5.6),
    ]);
  }

  // ---- state ---------------------------------------------------------------------------------------------------------
  let time = Math.random() * 10;
  let calm = false;
  const neckTarget = new V3().copy(neckRestPoint ?? root.localToWorld(neckBind[RIDE_JOINT].clone()));
  let neckGoal = null; // a function(t) -> Vector3 while she bows or lifts
  let headPitch = -8, headPitchGoal = -8; // degrees
  const look = { point: new V3(), weight: 0, goal: 0, yaw: 0, pitch: 0 };
  let swishT = -1, flickT = -1, cheerT = -1, cheerFor = 0;
  const jointsNow = { neck: neckBind.map(p => p.clone()), tail: tailBind.map(p => p.clone()) };

  // ---- posing, after her clips each frame (actor.control's pose) --------------------------------------------------------
  const D = []; // desired root-frame orientations of the chain's bones
  function setChain(bones, rest, O, dirs, parentQ) {
    let parent = parentQ;
    for (let i = 0; i < dirs.length; i++) {
      qb.setFromUnitVectors(rest[i], dirs[i]).multiply(O[i]);
      bones[i].quaternion.copy(qc.copy(parent).invert().multiply(qb));
      D[i] = (D[i] ?? new THREE.Quaternion()).copy(qb);
      parent = D[i];
    }
    return parent;
  }
  const rootFrameQ = (bone, out) => out.copy(rootQi).multiply(bone.getWorldQuaternion(qa));
  const neckDirs = NECK.slice(0, -1).map(() => new V3());
  const tailDirs = TAIL.slice(0, -1).map(() => new V3());
  const chestQ = new THREE.Quaternion(), hipsQ = new THREE.Quaternion();
  const local = new V3(), base = new V3(), headDir = new V3();

  function poseNeck(dt) {
    model.updateMatrixWorld(true);
    rootFrameQ(chest, chestQ);
    base.copy(root.worldToLocal(neckBones[0].getWorldPosition(va)));
    // where the top of her neck goes, with a slow bob while she rests
    const bob = calm ? 0 : 1;
    local.copy(neckTarget);
    if (!neckGoal) local.add(vb.set(0, Math.sin(time * 0.9) * 0.06 * bob, Math.sin(time * 0.55 + 1) * 0.08 * bob));
    root.worldToLocal(local).sub(base);
    const yaw = Math.atan2(local.z, local.x);
    const u = Math.hypot(local.x, local.z), v = local.y;
    const [a, d] = solveArc(neckLengths.slice(0, RIDE_JOINT), u, v, arcGuess);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let i = 0; i < RIDE_JOINT + 1; i++) {
      const th = a + (i < RIDE_JOINT ? i * d : RIDE_JOINT * d + d * 0.2);
      neckDirs[i].set(Math.cos(th) * cy, Math.sin(th), Math.cos(th) * sy);
    }
    const headParentQ = setChain(neckBones, neckRest, neckO, neckDirs, chestQ);
    // the head: level along her neck's way, pitched, and turned toward what she looks at
    const pitch = THREE.MathUtils.degToRad(headPitch + look.pitch * look.weight);
    const turn = yaw + look.yaw * look.weight;
    headDir.set(Math.cos(pitch) * Math.cos(turn), Math.sin(pitch), Math.cos(pitch) * Math.sin(turn));
    qb.setFromUnitVectors(X, headDir).multiply(neckO[5]);
    neckBones[5].quaternion.copy(qc.copy(headParentQ).invert().multiply(qb));
  }

  const tailOffset = new V3(), tailPoint = new V3(), joint = new V3();
  function poseTail(dt) {
    model.updateMatrixWorld(true);
    rootFrameQ(hips, hipsQ);
    joint.copy(tailBones[0].getWorldPosition(va));
    let s = 0;
    const total = tailLengths.reduce((x, l) => x + l, 0) * k;
    for (let i = 0; i < tailDirs.length; i++) {
      s += tailLengths[i] * k;
      tailCurve.pointAt(s, tailPoint);
      const along = s / total;
      // the swish: a wave running down the tail, growing toward the tip; the flick: the tip tossed up
      tailOffset.set(0, 0, 0);
      if (swishT >= 0) {
        const x = swishT / 1.4, env = Math.sin(Math.PI * clamp01(x));
        tailOffset.x += Math.sin(swishT * 9 - along * 5) * 0.55 * along * env;
      } else if (!calm) {
        tailOffset.x += Math.sin(time * 1.1 - along * 3) * 0.06 * along;
      }
      if (flickT >= 0) {
        const x = flickT / 0.7, env = Math.sin(Math.PI * clamp01(x));
        tailOffset.y += 1.1 * along * along * env;
      }
      if (cheerT >= 0 && !calm) tailOffset.x += Math.sin(cheerT * 8 - along * 4) * 0.4 * along;
      tailPoint.add(tailOffset);
      const dir = vb.subVectors(tailPoint, joint).normalize();
      joint.addScaledVector(dir, tailLengths[i] * k);
      tailDirs[i].copy(dir).applyQuaternion(rootQi);
    }
    setChain(tailBones, tailRest, tailO, tailDirs, hipsQ);
  }

  // A Þórseðla without a neck route (Lyng) keeps her clip's own neck, looking about; every tail is posed (Kvisti's out of the way).
  actor.control(() => {}, dt => {
    if (place.neck) poseNeck(dt);
    poseTail(dt);
  });

  // ---- behaviour --------------------------------------------------------------------------------------------------------
  const tweens = new Set();
  function tween(duration, step) {
    return new Promise(resolve => tweens.add({ t: 0, duration: Math.max(0.001, duration), step, resolve }));
  }

  /** The point on the top of her neck where a piece rides (world). */
  function ridePoint(out = new V3()) {
    model.updateMatrixWorld(true);
    neckBones[RIDE_JOINT].getWorldPosition(out);
    return out.add(va.set(0, neckRadius[RIDE_JOINT] * k * 0.92, 0));
  }

  /** Her head comes down onto the neck's first square. */
  function bow({ duration = 1.6 } = {}) {
    if (!place.neck) return Promise.resolve();
    const from = neckTarget.clone();
    const to = neckDownPoint;
    const mid = from.clone().lerp(to, 0.5).add(va.set(0, 1.2, -1.2));
    neckGoal = true;
    headPitchGoal = -26;
    return tween(calm ? duration * 1.3 : duration, t => {
      const e = smooth(t);
      // over the tier's log, not through it: up and back first, then down to the square
      neckTarget.copy(from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(mid, 2 * e * (1 - e)).addScaledVector(to, e * e);
    });
  }

  /** From the first square back up to rest at the last, carrying a piece on the top of her neck (onProgress(e) each frame). */
  function lift({ duration = 2.6, onProgress } = {}) {
    if (!place.neck) return Promise.resolve();
    const from = neckTarget.clone(), to = neckRestPoint;
    // up behind the tier above (well clear of its log), then forward over it to the square
    const c1 = new V3(from.x, from.y + (to.y - from.y) * 0.55, from.z - 1.2);
    const c2 = new V3(to.x, to.y + 1.3, to.z - 1.0);
    neckGoal = true;
    headPitchGoal = 4;
    return tween(calm ? duration * 1.3 : duration, t => {
      const e = smooth(t), m = 1 - e;
      neckTarget.copy(from).multiplyScalar(m * m * m).addScaledVector(c1, 3 * m * m * e).addScaledVector(c2, 3 * m * e * e).addScaledVector(to, e * e * e);
      onProgress?.(e);
    }).then(() => { neckGoal = null; headPitchGoal = -8; });
  }

  /** Her head goes back to rest at once (a game set up anew). */
  function rest() {
    if (neckRestPoint) neckTarget.copy(neckRestPoint);
    neckGoal = null; headPitch = headPitchGoal = -8;
    swishT = flickT = cheerT = -1;
  }

  /** The slide: the top of her tail from its first square down to its last (world), for a piece to ride. */
  function slideCurve() {
    if (!place.tail) return null;
    model.updateMatrixWorld(true);
    const joints = tailBones.map(b => b.getWorldPosition(new V3()));
    const last = joints[joints.length - 1], before = joints[joints.length - 2];
    joints.push(last.clone().addScaledVector(vb.subVectors(last, before).normalize(), tipLength * k * 0.8));
    const radius = i => (tailRadius[Math.min(i, tailRadius.length - 1)] ?? 0.1) * k * (i >= joints.length - 1 ? 0.35 : 0.85);
    // the top of the tail, densely: a few points between each two joints
    const dense = [];
    for (let i = 0; i < joints.length - 1; i++) {
      for (let j = 0; j < 6; j++) {
        const u = j / 6;
        dense.push(new V3().lerpVectors(joints[i], joints[i + 1], u).add(va.set(0, radius(i) * (1 - u) + radius(i + 1) * u, 0)));
      }
    }
    dense.push(joints[joints.length - 1].clone().add(va.set(0, radius(joints.length - 1), 0)));
    // from the point over the first square on
    const over = square(place.tail.from).add(va.set(0, 0.45, -0.3));
    let best = 0, bestD = Infinity;
    dense.forEach((p, i) => { const d = p.distanceTo(over); if (d < bestD) { bestD = d; best = i; } });
    const used = dense.slice(best).filter((p, i, all) => i === 0 || i === all.length - 1 || i % 2 === 0);
    used.push(square(place.tail.to).add(va.set(0, 0.02, 0.1)));
    return new THREE.CatmullRomCurve3(used, false, 'centripetal');
  }

  return {
    place, actor, root, k,
    get calm() { return calm; },
    set calm(value) { calm = Boolean(value); },
    get stretch() { return { neck: neckS, tail: tailLengths.reduce((a, b) => a + b, 0) / lengthsOf(tailBind).reduce((a, b) => a + b, 0) }; },
    ridePoint, bow, lift, rest, slideCurve,
    neckTopAt: n => neckTop(n),
    lookAt(point) {
      if (!point) { look.goal = 0; return; }
      const head = actor.headPosition(va);
      look.goal = head.distanceTo(point) < LOOK.near * (k / 0.75) ? 1 : 0;
      look.point.copy(point);
    },
    swish() { if (!calm) swishT = 0; },
    flick() { if (!calm) flickT = 0; },
    cheer(seconds = 2.4) {
      cheerT = 0; cheerFor = seconds;
      if (!calm) actor.play('happy', { fade: 0.25 });
    },
    talk(line) { return actor.talk(line); },
    update(dt) {
      time += dt;
      for (const tw of [...tweens]) {
        tw.t += dt;
        const t = clamp01(tw.t / tw.duration);
        tw.step(t);
        if (t >= 1) { tweens.delete(tw); tw.resolve(); }
      }
      headPitch += (headPitchGoal - headPitch) * (1 - Math.exp(-dt * 3));
      // the look: toward the piece, within her neck's comfortable turn
      look.weight += (look.goal - look.weight) * (1 - Math.exp(-dt * 2.5));
      if (look.weight > 0.01) {
        const head = actor.headPosition(va);
        const to = vb.subVectors(look.point, head).applyQuaternion(rootQi);
        const wantYaw = THREE.MathUtils.clamp(Math.atan2(to.z, to.x), -THREE.MathUtils.degToRad(LOOK.yaw), THREE.MathUtils.degToRad(LOOK.yaw));
        const wantPitch = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.atan2(to.y, Math.hypot(to.x, to.z))) - headPitch, -LOOK.pitch, LOOK.pitch);
        look.yaw += (wantYaw - look.yaw) * (1 - Math.exp(-dt * 3));
        look.pitch += (wantPitch - look.pitch) * (1 - Math.exp(-dt * 3));
      }
      if (swishT >= 0 && (swishT += dt) > 1.4) swishT = -1;
      if (flickT >= 0 && (flickT += dt) > 0.7) flickT = -1;
      if (cheerT >= 0 && (cheerT += dt) > cheerFor) { cheerT = -1; actor.play('idle', { fade: 0.5 }); }
      actor.update(dt);
    },
  };
}
