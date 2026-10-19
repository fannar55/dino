import * as THREE from 'three';
import { createActor } from '../actor.js';
import { BOARD } from './rules.js';
import { BLOCK_BACK } from './places.js';
import { STONE } from './board.js';
import { createThorsedlaLod } from './thorsedla-lod.js';

// The Þórseðlas of the board (spec section 4): the chapter's own Þórseðla (brontosaurus.glb, engine/actor.js: her idle
// breathing, her blinking eyelids, her voice on her jaw), six of her, each in a colour of her own, at her natural proportions
// (places.js: four behind the two front tiers, two big elder giants at the board's ends). Her neck is a ladder and her tail a
// slide, as Codex's are, but alive:
//
//  - At rest her neck rises from her chest in a soft S in front of the tier above (which stands further back: rules.js
//    BOARD.recess) and curls over its front edge: her head rests over the neck's last square with her chin level, looking
//    along the board and a little toward the child. Burkni's rises beside the board's right end, past the stairs. She
//    breathes, her head bobs, she looks at the piece whose turn it is, blinks, and now and then nods, swishes her tail,
//    glances at the camera or stretches.
//  - bow(): like a crane lowering, her head comes forward off the square above and down in one smooth arc onto the neck's
//    first square; lift() carries a piece on the top of her neck back up along the same arc to rest, and it hops off onto
//    the square at her head. The neck is posed afresh every frame: a smooth curve from her chest to where her head is, through
//    the points it passes, as long as her neck, with the neck's bones laid along it.
//  - Her tail hangs from her hips behind her tier, past the tail's first square (where a piece hops onto it), and down onto
//    the square it slides to on the tier below, its tip on that block's top. Lyng's hangs beside the board's left end, two
//    tiers down. swish() sends a wave along it, flick() tosses its tip.
//  - cheer(): her happy clip, her neck and tail waving (a win, a ride).
//
// No neck or tail is drawn out by more than about a quarter (the owner's word, 2026-10-19), a giant's by half: a stretch
// moves the chain's joints apart along the bones, the skin, whose weights blend smoothly along the chain
// (tools/bake/skin.js chainWeighting), follows, and the chain keeps its thickness and taper.
//
//   const thorsedlas = await createThorsedlas(world, board, places)
//   thorsedlas.list, thorsedlas.neckAt(from), thorsedlas.tailAt(from)
//   thorsedlas.lookAt(point)           every Þórseðla near it looks (a Vector3, or null: they look about by themselves)
//   thorsedlas.update(dt)
//   one Þórseðla: { place, actor, root, ridePoint(out), bow({ duration }), lift({ duration, onProgress }), slideCurve(),
//                  swish(), flick(), cheer(seconds), talk(line), rest(), calm, stretch, skeleton() }

const URL_MODEL = new URL('../../assets/characters/brontosaurus.glb', import.meta.url).href;
const NECK = ['Neck', 'Neck2', 'Neck3', 'Neck4', 'Neck5', 'Head'];
const TAIL = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7', 'Tail8'];
const RIDE_JOINT = 4; // a piece rides on the top of the neck at Neck5, just behind the head
const TURN = 6; // degrees each turns toward the camera from side-on
const MAX_STRETCH = 1.26; // the most a neck or a tail is drawn out (the owner: about 1.26 at most); a giant's (place.maxStretch) 1.5
// Her head at rest: over the neck's last square, `chin` metres over its block (over a piece standing there), its skull `reach` (of
// her size) from the head joint, a little before the block's middle, looking along the board the way she faces, `yaw` degrees
// toward the camera and `pitch` down.
const HEAD = { reach: 0.6, half: 0.42, chin: 1.35, z: 0.35, yaw: 28, pitch: -10 };
// Her bowed head: down over the neck's first square, a little to her side of its middle, chin over the block, looking down
// at the piece and toward the camera.
const BOWED = { aside: 0.2, chin: 0.55, z: 0.05, way: [0.25, -0.72, 0.62] };
const FRONT = 0.3; // metres clear of a tier's front face where a neck rises in front of it
const STAIRS_OUT = 1.7; // how far past the board's last block the stairs and their rail reach, beside which a giant's neck or tail passes
const NECK_LEAN = 50; // degrees over the level her neck leaves her shoulders
const TAIL_Z = -3.25; // z where a tail hangs behind a front tier: clear of its blocks and of the tier below's, further back
const LOOK = { near: 14, share: 0.45, down: -0.3, up: 0.2 }; // metres within which she looks at a piece, how far her head turns to it, and the most it pitches (radians) as she looks
const rad = THREE.MathUtils.degToRad;

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
  const uniform = { value: new THREE.Vector3(rad(tint.hue), tint.sat, tint.bright) };
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
const qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
const va = new V3(), vb = new V3(), vc = new V3();
const X = new V3(1, 0, 0);
const findBone = (model, name) => model.getObjectByName(name) ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

/** A polyline sampled from points, with its arc length: pointAt(s, out) by metres along it. */
function sampled(points) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const samples = curve.getSpacedPoints(160);
  return lengthed(samples);
}
function lengthed(samples) {
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

/** The cubic Bézier from p0 to p3 with handles p1, p2, sampled in `n` steps into `out` (Vector3s), and its length. */
function bezier(p0, p1, p2, p3, n, out) {
  let length = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, m = 1 - t;
    const p = out[i] ?? (out[i] = new V3());
    p.set(0, 0, 0).addScaledVector(p0, m * m * m).addScaledVector(p1, 3 * m * m * t).addScaledVector(p2, 3 * m * t * t).addScaledVector(p3, t * t * t);
    if (i) length += p.distanceTo(out[i - 1]);
  }
  return length;
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
  const k = place.size, f = place.facing;
  const ground = place.tier === 0 ? world.heightAt(place.x, place.z) : board.tierY(place.tier) - 0.3 - (place.drop ?? 0);
  const own = Object.create(world);
  own.heightAt = () => ground;
  const heading = f > 0 ? (place.turn ?? TURN) : 180 - (place.turn ?? TURN);
  const actor = await createActor(own, { name: `thorsedla-${place.id}`, url: URL_MODEL, position: [place.x, ground, place.z], heading });
  const { root, model } = actor;
  root.scale.setScalar(k);
  // out of step: each starts her idle somewhere else in its six seconds, a little faster or slower
  const idle = actor.mixer.existingAction(actor.clips.get('idle'));
  if (idle) { idle.time = Math.random() * 6; idle.setEffectiveTimeScale(0.88 + Math.random() * 0.2); }
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
  // a chain only thins toward its end (the measure catches stray skin near a tail's tip)
  const thinning = list => list.map((r, i) => Math.min(r, ...list.slice(0, i)));
  const neckRadius = thinning(chainRadii(skin, root, neckBind)), tailRadius = thinning(chainRadii(skin, root, tailBind));
  const neckO = bindQ(neckBones), tailO = bindQ(tailBones);
  const restDir = joints => joints.slice(0, -1).map((p, i) => new V3().subVectors(joints[i + 1], p).normalize());
  const neckRest = restDir(neckBind), tailRest = restDir(tailBind);
  const tipLength = 0.99; // the tail's tip past its last joint (model metres)
  /** Draw a chain's joints apart by `s` (its bones' offsets from their parents). */
  const stretch = (bones, s) => { for (let i = 1; i < bones.length; i++) bones[i].position.multiplyScalar(s); };
  const lengthsOf = joints => joints.slice(0, -1).map((p, i) => p.distanceTo(joints[i + 1]));
  let neckLengths = lengthsOf(neckBind), tailLengths = lengthsOf(tailBind);
  const sum = list => list.reduce((a, b) => a + b, 0);

  const square = (n, out = new V3()) => board.square(n, out);
  const tierOf = n => Math.floor((n - 1) / BOARD.columns);
  const unit = (x, y, z) => new V3(x, y, z).normalize();
  // the way her head points at rest: along the board the way she faces, turned toward the camera, a little down
  const restWay = unit(f * Math.cos(rad(HEAD.yaw)) * Math.cos(rad(HEAD.pitch)), Math.sin(rad(HEAD.pitch)), Math.sin(rad(HEAD.yaw)) * Math.cos(rad(HEAD.pitch)));
  /** Her head joint where her skull rests over square n (and the way it points). */
  function restOver(n, z = HEAD.z) {
    const p = square(n);
    const skull = new V3(p.x, p.y + HEAD.chin + HEAD.half * k, p.z + z);
    return { at: skull.addScaledVector(restWay, -HEAD.reach * k), way: restWay.clone() };
  }
  /** Her head joint where she bows to square n (beside it, `aside` metres toward her, when a giant's neck comes in from beside the end). */
  function bowOver(n, aside = -f * BOWED.aside, chin = BOWED.chin) {
    const p = square(n);
    const way = unit(f * BOWED.way[0], BOWED.way[1], BOWED.way[2]);
    const skull = new V3(p.x + aside, p.y + chin + HEAD.half * k, p.z + BOWED.z);
    return { at: skull.addScaledVector(way, -HEAD.reach * k), way };
  }
  const tiersOf = route => Math.round((square(route.to).y - square(route.from).y) / BOARD.rowHeight);
  const endSide = x => Math.sign(x) || 1; // the board's end a giant stands at (1 the right)
  const pastEnd = side => side * (BOARD.columns / 2 * BOARD.spacing - BOARD.spacing / 2 + STONE.width / 2 + STAIRS_OUT);

  // ---- the neck: rising in front of the tier above to rest over its last square; a length that reaches it ----------------
  let rest = null, bowed = null, neckS = 1, vias = null, bowVias = null;
  const neckChain = sum(neckLengths.slice(0, RIDE_JOINT + 1));
  const neckR = i => neckRadius[i] * k;
  if (place.neck) {
    const S = square(place.neck.from), Xs = square(place.neck.to);
    const up = tierOf(place.neck.to);
    if (tiersOf(place.neck) === 1) {
      // in front of the tier above, in the gap before its square (on her side), and over its front edge
      rest = restOver(place.neck.to);
      bowed = bowOver(place.neck.from);
      const face = board.tierZ(up) + STONE.depth / 2;
      vias = [
        new V3(Xs.x - f * BOARD.spacing / 2, board.tierY(up) - 0.6, face + neckR(3) + 0.6),
        new V3(Xs.x - f * 0.95, board.tierY(up) + neckR(4) + 0.45, face + 0.75),
      ];
      // bowing: up over her own tier's back edge and down onto the first square
      // bowing: like a crane, up from her shoulders, over her own tier's back edge and down onto the first square
      bowVias = [new V3(S.x - f * 0.8, S.y + 5.4, S.z - BLOCK_BACK - 1.6), new V3(S.x - f * 0.45, S.y + 3.6, S.z - BLOCK_BACK + 0.2)];
    } else {
      // Burkni, beside the board's right end: her neck rises past the stairs and curls in over the square two tiers up; she
      // bows to the first square from beside it
      // between the tiers' ends, where no stairs are (the stairs at this end join the first tier to the second and the third to
      // the fourth), it comes in close past the logs' ends; it crosses over the end square of the tier above onto its square
      const side = endSide(Xs.x), logEnd = side * (BOARD.columns / 2 * BOARD.spacing + 0.3);
      rest = restOver(place.neck.to, -0.55); // over the block's back half, behind the stairs that leave the end square's front
      bowed = bowOver(place.neck.from, side * 0.35, 0.9);
      const base = root.localToWorld(neckBind[0].clone());
      const endSquare = square(place.neck.to + (tierOf(place.neck.to) % 2 ? -1 : 1));
      vias = [
        new V3(logEnd + side * (neckR(2) + 0.6), board.tierY(up) - 0.6, (base.z + rest.at.z) / 2),
        new V3(endSquare.x, endSquare.y + 2.5, rest.at.z + 0.05),
      ];
      // bowing: down past the end of the tier between, out beside the stairs, and over the end square onto the first
      const firstEnd = square(place.neck.from + (tierOf(place.neck.from) % 2 ? -1 : 1));
      bowVias = [new V3(logEnd + side * (neckR(2) + 0.9), firstEnd.y + 6.0, firstEnd.z - 0.6), new V3(logEnd + side * (neckR(2) * 0.6 + 0.3), firstEnd.y + 3.4, firstEnd.z - 0.4)];
    }
    const base = root.localToWorld(neckBind[0].clone());
    const length = new THREE.CatmullRomCurve3([base, ...vias, rest.at], false, 'centripetal').getLength();
    const want = (length * 1.02) / k;
    const most = place.maxStretch ?? MAX_STRETCH;
    neckS = Math.min(most, Math.max(1, want / neckChain));
    if (want / neckChain > most + 1e-3) console.warn(`[thorsedla] ${place.name}'s neck would need ${(want / neckChain).toFixed(2)}x: she should stand nearer or be bigger`);
    if (neckS > 1.001) { stretch(neckBones, neckS); neckLengths = neckLengths.map(l => l * neckS); }
  }

  // ---- the tail: hanging from her hips behind her tier, past its first square and down onto its last ------------------------
  const rump = root.localToWorld(tailBind[0].clone());
  let tailCurve, tailS = 1, tailEnd = null, boardAt = null;
  if (place.tail) {
    const a = square(place.tail.from), b = square(place.tail.to);
    const thickness = s => {
      const u = THREE.MathUtils.clamp(s / (sum(tailLengths) * k), 0, 1) * (tailRadius.length - 1);
      const i = Math.min(tailRadius.length - 2, Math.floor(u));
      return (tailRadius[i] + (tailRadius[i + 1] - tailRadius[i]) * (u - i)) * k;
    };
    // the last square: its tip on the block's top, a little to the side the tail comes from and toward the front (a tier
    // further back than hers), or the back (Lyng's, beside the stairs that come up to its front)
    let points, side, endAt;
    if (tiersOf(place.tail) === -1) {
      // straight down from her hips, past the end of her shelf, behind her tier and onto the tier below
      side = Math.abs(b.x - a.x) < 0.01 ? f : Math.sign(b.x - a.x);
      const hind = root.localToWorld(new V3(-2.18, 0, 0)).x; // her hind legs, along the board
      const hang = f > 0 ? Math.min(a.x - 0.2, rump.x - 0.15, hind - 1.0) : Math.max(a.x + 0.2, rump.x + 0.15, hind + 1.0);
      points = [
        rump.clone(),
        new V3(rump.x + (hang - rump.x) * 0.6, rump.y - (rump.y - a.y) * 0.45, rump.z + (TAIL_Z - rump.z) * 0.6),
        new V3(hang, a.y + 0.55, TAIL_Z),
        new V3(hang + side * 0.1, a.y - 2.7, TAIL_Z),
      ];
      endAt = r => new V3(b.x - side * 0.1, b.y + 0.1 + r, b.z + 0.55);
      points.push(new V3(b.x - side * 0.2, b.y + 1.8, (TAIL_Z + b.z + 0.55) / 2));
      boardAt = new V3(hang, a.y + 0.5, TAIL_Z + 0.4);
    } else {
      // Lyng: out past the board's left end behind her tier, down beside the stairs, and onto the square two tiers down
      // behind the end square of her tier (where a piece hops on), out past its log's end, then in close beside the stairs
      // (which are further forward) where no log is, and onto the square's top from beside the end
      const end = endSide(b.x), logEnd = end * (BOARD.columns / 2 * BOARD.spacing + 0.3), r = i => tailRadius[i] * k;
      side = -end;
      const behind = a.z - BLOCK_BACK - r(2) - 0.3;
      points = [
        rump.clone(),
        new V3(a.x + end * 2.6, a.y + 0.9, behind),
        new V3(logEnd + end * (r(3) + 0.3), a.y - 1.2, behind + 0.5),
        new V3(logEnd + end * (r(4) - 0.6), a.y - BOARD.rowHeight - 1.0, a.z - BLOCK_BACK - 0.8),
        new V3(logEnd + end * (r(5) - 0.8), b.y + 2.4, b.z - 0.9),
      ];
      endAt = rr => new V3(b.x - side * 0.45, b.y + 0.1 + rr, b.z - 0.45);
      points.push(new V3(b.x + end * 1.0, b.y + 1.6, b.z - 0.55));
      boardAt = new V3(a.x + end * 2.6, a.y + 1.2, behind + 0.4);
    }
    let end = endAt(0.15 * k);
    let main = sampled([...points, end]);
    end = endAt(thickness(main.total));
    points.push(end);
    main = sampled(points);
    // what is left of a long tail lies on back over the block's top and droops down behind it
    tailCurve = sampled([...points, end.clone().add(new V3(0, -0.04, -1.3)), end.clone().add(new V3(side * 0.2, -1.1, -2.3))]);
    tailEnd = { at: end, s: main.total };
    const have = sum(tailLengths);
    const want = main.total / k - tipLength * 0.3;
    const most = place.maxStretch ?? MAX_STRETCH;
    tailS = Math.min(most, Math.max(1, want / have));
    if (want / have > most + 1e-3) console.warn(`[thorsedla] ${place.name}'s tail would need ${(want / have).toFixed(2)}x: she should be bigger`);
    if (tailS > 1.001) { stretch(tailBones, tailS); tailLengths = tailLengths.map(l => l * tailS); }
  } else {
    // an ordinary tail: down behind her and along the ground, curling away from the board
    const g = ground;
    tailCurve = sampled([
      rump.clone(),
      new V3(rump.x - f * 1.6 * k, g + 2.4 * k, rump.z - 0.6 * k),
      new V3(rump.x - f * 2.6 * k, g + 0.7 * k, rump.z - 2.6 * k),
      new V3(rump.x - f * 2.2 * k, g + 0.35, rump.z - 5.0 * k),
      new V3(rump.x - f * 0.8 * k, g + 0.3, rump.z - 6.8 * k),
    ]);
  }
  // Lyng carries no neck route: her neck rests low and forward, her head turned to the board, as she watches the game
  if (!place.neck) {
    // ahead of her chest along the way she faces, low, her head turned round to the board and the child
    const chestAt = root.localToWorld(neckBind[0].clone());
    const ahead = new V3(1, 0, 0).applyQuaternion(rootQ).setY(0).normalize();
    const way = new V3(f * 0.55, -0.18, 0.82).normalize();
    rest = { at: chestAt.clone().addScaledVector(ahead, 2.4 * k).setY(Math.max(ground + 2.2 * k, board.tierY(place.tier) + 1.8)), way };
  }

  // ---- state ---------------------------------------------------------------------------------------------------------
  let time = Math.random() * 10;
  let calm = false;
  const target = rest.at.clone(); // where her head joint is now (before the fidgets)
  const way = rest.way.clone(); // the way her head points now
  let moving = false; // while she bows or lifts
  const look = { point: new V3(), weight: 0, goal: 0 };
  let swishT = -1, flickT = -1, cheerT = -1, cheerFor = 0;
  let nodT = -1, glanceT = -1, stretchT = -1;
  let nextFidget = 4 + Math.random() * 8;
  const nudge = new V3();
  let glance = 0;

  // ---- posing, after her clips each frame (actor.control's pose) --------------------------------------------------------
  const D = []; // desired root-frame orientations of the chain's bones
  function setChain(bones, restDirs, O, dirs, parentQ) {
    let parent = parentQ;
    for (let i = 0; i < dirs.length; i++) {
      qb.setFromUnitVectors(restDirs[i], dirs[i]).multiply(O[i]);
      bones[i].quaternion.copy(qc.copy(parent).invert().multiply(qb));
      D[i] = (D[i] ?? new THREE.Quaternion()).copy(qb);
      parent = D[i];
    }
    return parent;
  }
  const rootFrameQ = (bone, out) => out.copy(rootQi).multiply(bone.getWorldQuaternion(qc));
  const neckDirs = NECK.slice(0, -1).map(() => new V3());
  const tailDirs = TAIL.slice(0, -1).map(() => new V3());
  const chestQ = new THREE.Quaternion(), hipsQ = new THREE.Quaternion();
  const curve = [], neckJoints = NECK.map(() => new V3());
  const B = new V3(), T = new V3(), tB = new V3(), tT = new V3(), P1 = new V3(), P2 = new V3(), headDir = new V3();
  const cumul = [];

  const neckRide = sum(neckLengths.slice(0, RIDE_JOINT + 1));
  const giantNeck = Boolean(place.neck) && tiersOf(place.neck) > 1; // the neck's length to her head, drawn out (model metres)
  const curvePoints = [new V3(), ...(vias ?? [null]).map(() => new V3()), new V3()];
  const bowTarget = vias ? vias.map((v, i) => bowVias[Math.min(i, bowVias.length - 1)]) : null; // where each point goes as she bows
  const neckCurve = new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal');
  const viasNow = curvePoints.slice(1, -1).map(() => new V3()), mid = new V3(), bulge = new V3(), lean = new V3(), centre = new V3();
  function poseNeck() {
    model.updateMatrixWorld(true);
    rootFrameQ(chest, chestQ);
    neckBones[0].getWorldPosition(B);
    // where her head goes (with the fidgets and the slow bob while she rests), and the way it points
    T.copy(target);
    if (!moving) T.add(nudge).add(va.set(0, Math.sin(time * 0.9) * 0.05 * (calm ? 0 : 1), Math.sin(time * 0.55 + 1) * 0.04 * (calm ? 0 : 1)));
    const total = neckRide * k; // her neck as long as it is drawn out
    // the via points: where her neck rises in front of the tier above (at rest), or arches over her own tier (bowed); Lyng's: a
    // point up and ahead of her shoulders
    if (vias) {
      // (a giant's neck keeps to beside the board's end until her head is well down past the tier between)
      if (giantNeck) {
        // out beside the end first, then down past the tier between
        const ex = smooth(clamp01(arc / 0.3)), ey = smooth(clamp01((arc - 0.25) / 0.6));
        vias.forEach((v, i) => viasNow[i].set(v.x + (bowTarget[i].x - v.x) * ex, v.y + (bowTarget[i].y - v.y) * ey, v.z + (bowTarget[i].z - v.z) * ey));
      } else {
        const e = smooth(clamp01(arc / 0.65));
        vias.forEach((v, i) => viasNow[i].lerpVectors(v, bowTarget[i], e));
      }
    } else {
      lean.set(Math.cos(rad(NECK_LEAN)), Math.sin(rad(NECK_LEAN)), 0).applyQuaternion(rootQ);
      viasNow[0].copy(B).addScaledVector(lean, total * 0.45);
    }
    let d = B.distanceTo(T);
    if (d > total * 0.98) { T.sub(B).setLength(total * 0.98).add(B); d = total * 0.98; }
    // the curve's length matched to her neck's by moving the via point out from the chord or in toward it
    mid.addVectors(B, T).multiplyScalar(0.5);
    centre.set(0, 0, 0);
    for (const v of viasNow) centre.addScaledVector(v, 1 / viasNow.length);
    bulge.subVectors(centre, mid);
    const span = bulge.length() || 1;
    bulge.divideScalar(span);
    let lo = -0.85 * span, hi = total;
    const last = curvePoints.length - 1;
    curvePoints[0].copy(B); curvePoints[last].copy(T);
    const putVias = b => { viasNow.forEach((v, i) => curvePoints[i + 1].copy(v).addScaledVector(bulge, b)); neckCurve.updateArcLengths(); };
    for (let it = 0; it < 14; it++) {
      const b = (lo + hi) / 2;
      putVias(b);
      if (neckCurve.getLength() < total) lo = b; else hi = b;
    }
    putVias(lo);
    // the bones along it, each from where the last one ended to the curve's point its length on
    const length = neckCurve.getLength();
    neckJoints[0].copy(B);
    let s = 0;
    for (let i = 0; i <= RIDE_JOINT; i++) {
      s += neckLengths[i] * k;
      neckCurve.getPointAt(Math.min(1, s / length), vc);
      const dir = vb.subVectors(vc, neckJoints[i]).normalize();
      neckJoints[i + 1].copy(neckJoints[i]).addScaledVector(dir, neckLengths[i] * k);
      neckDirs[i].copy(dir).applyQuaternion(rootQi);
    }
    const headParentQ = setChain(neckBones, neckRest, neckO, neckDirs, chestQ);
    // the head: the way it points, turned part way toward a piece she watches, or to the camera for a glance
    headDir.copy(way);
    if (look.weight > 0.01 || glance > 0.01) {
      vb.copy(look.weight >= glance ? look.point : world.camera.position).sub(neckJoints[RIDE_JOINT + 1]).normalize();
      headDir.lerp(vb, Math.max(look.weight * LOOK.share, glance * 0.7)).normalize();
      // a look turns her head, but tips it only a little from where it points (so her chin stays clear of the blocks)
      const base = Math.asin(THREE.MathUtils.clamp(way.y, -1, 1));
      const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(headDir.y, -1, 1)), base + LOOK.down, base + LOOK.up);
      const flat = Math.hypot(headDir.x, headDir.z) || 1;
      headDir.set(headDir.x / flat * Math.cos(pitch), Math.sin(pitch), headDir.z / flat * Math.cos(pitch));
    }
    headDir.applyQuaternion(rootQi);
    qb.setFromUnitVectors(X, headDir).multiply(neckO[5]);
    neckBones[5].quaternion.copy(qc.copy(headParentQ).invert().multiply(qb));
  }

  const tailOffset = new V3(), tailPoint = new V3(), joint = new V3(), tailJoints = TAIL.map(() => new V3());
  function poseTail() {
    model.updateMatrixWorld(true);
    rootFrameQ(hips, hipsQ);
    joint.copy(tailBones[0].getWorldPosition(va));
    tailJoints[0].copy(joint);
    let s = 0;
    const total = sum(tailLengths) * k;
    for (let i = 0; i < tailDirs.length; i++) {
      s += tailLengths[i] * k;
      tailCurve.pointAt(s, tailPoint);
      const along = s / total;
      // the swish: a wave running down the tail, growing toward the tip; the flick: the tip tossed out
      tailOffset.set(0, 0, 0);
      if (swishT >= 0) {
        const x = swishT / 1.4, env = Math.sin(Math.PI * clamp01(x));
        tailOffset.x += Math.sin(swishT * 9 - along * 5) * 0.45 * along * env;
      } else if (!calm) {
        tailOffset.x += Math.sin(time * 1.1 - along * 3) * 0.05 * along;
      }
      if (flickT >= 0) {
        const x = flickT / 0.7, env = Math.sin(Math.PI * clamp01(x));
        tailOffset.z += 0.25 * along * along * env;
        tailOffset.y += 0.5 * along * along * env;
      }
      if (cheerT >= 0 && !calm) tailOffset.x += Math.sin(cheerT * 8 - along * 4) * 0.3 * along;
      tailPoint.add(tailOffset);
      const dir = vb.subVectors(tailPoint, joint).normalize();
      joint.addScaledVector(dir, tailLengths[i] * k);
      tailJoints[i + 1].copy(joint);
      tailDirs[i].copy(dir).applyQuaternion(rootQi);
    }
    setChain(tailBones, tailRest, tailO, tailDirs, hipsQ);
  }

  actor.control(() => {}, () => {
    poseNeck();
    poseTail();
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
    return out.add(va.set(0, neckRadius[RIDE_JOINT] * k * 0.95, 0));
  }

  // The arc between her rest and her bow: her head comes forward off the square above, over its front edge, down in front of
  // the tier and onto the first square, like a crane lowering, and goes back up along the same way; its way turns from her
  // resting look to the piece.
  function arcPoint(u, out) {
    const a = rest.at, b = bowed.at, m = 1 - u;
    const v = vias[0];
    const giant = tiersOf(place.neck) > 1; // Burkni's head goes out beside the board's end and down past the tier between
    const wide = Math.sign(v.x) * 1.2;
    const c1 = giant ? va.set(v.x + wide, a.y + 3.0, a.z) : va.set(a.x + (v.x - a.x) * 0.4, a.y + 1.4, v.z + 0.6);
    const c2 = giant ? vc.set(v.x + wide, b.y + 3.4, b.z) : vc.set(b.x + (v.x - b.x) * 0.3, b.y + 2.8, b.z + (v.z - b.z) * 0.5 + 0.3);
    return out.set(0, 0, 0).addScaledVector(a, m * m * m).addScaledVector(c1, 3 * m * m * u).addScaledVector(c2, 3 * m * u * u).addScaledVector(b, u * u * u);
  }
  const wayAt = (u, out) => out.copy(rest.way).lerp(bowed.way, smooth(u)).normalize();
  let arc = 0; // 0 at rest, 1 bowed

  /** Her head comes down onto the neck's first square, like a crane lowering. */
  function bow({ duration = 1.6 } = {}) {
    if (!place.neck) return Promise.resolve();
    moving = true;
    const from = arc;
    return tween(calm ? duration * 1.3 : duration, t => {
      arc = from + (1 - from) * smooth(t);
      arcPoint(arc, target);
      wayAt(arc, way);
    });
  }

  /** From the first square back up to rest at the last, along the same arc, carrying a piece on the top of her neck. */
  function lift({ duration = 2.6, onProgress } = {}) {
    if (!place.neck) return Promise.resolve();
    moving = true;
    const from = arc;
    return tween(calm ? duration * 1.3 : duration, t => {
      const e = smooth(t);
      arc = from * (1 - e);
      arcPoint(arc, target);
      wayAt(arc, way);
      onProgress?.(e);
    }).then(() => { moving = false; arc = 0; target.copy(rest.at); way.copy(rest.way); });
  }

  /** Her head goes back to rest at once (a game set up anew). */
  function settle() {
    target.copy(rest.at); way.copy(rest.way);
    arc = 0; moving = false;
    swishT = flickT = cheerT = -1;
  }

  /**
   * The slide: along the top of her tail from where it passes its first square down to its tip on its last square (world),
   * for a piece to ride feet first. Where the tail hangs steeply, its top is its face toward the camera.
   */
  function slideCurve() {
    if (!place.tail) return null;
    model.updateMatrixWorld(true);
    const joints = tailBones.map(b => b.getWorldPosition(new V3()));
    const last = joints[joints.length - 1], before = joints[joints.length - 2];
    joints.push(last.clone().addScaledVector(vb.subVectors(last, before).normalize(), tipLength * k * tailS * 0.8));
    const radius = i => (tailRadius[Math.min(i, tailRadius.length - 1)] ?? 0.1) * k * (i >= joints.length - 1 ? 0.3 : 0.92);
    const dense = [];
    const tangent = new V3(), top = new V3(), up = new V3(0, 1, 0), front = new V3(0, 0, 1);
    for (let i = 0; i < joints.length - 1; i++) {
      tangent.subVectors(joints[i + 1], joints[i]).normalize();
      // the top: world up, less what lies along the tail; where it hangs steeply, toward the camera
      top.copy(up).addScaledVector(tangent, -tangent.y);
      const steep = 1 - top.length();
      top.normalize().lerp(vb.copy(front).addScaledVector(tangent, -tangent.z).normalize(), clamp01(steep * 1.6)).normalize();
      for (let j = 0; j < 4; j++) {
        const u = j / 4;
        dense.push(new V3().lerpVectors(joints[i], joints[i + 1], u).addScaledVector(top, radius(i) * (1 - u) + radius(i + 1) * u));
      }
    }
    dense.push(joints[joints.length - 1].clone().add(va.set(0, radius(joints.length - 1), 0.1)));
    // from the point beside the first square on (the piece hops onto it there)
    const over = boardAt;
    let best = 0, bestD = Infinity;
    dense.forEach((p, i) => { const d = p.distanceTo(over); if (d < bestD) { bestD = d; best = i; } });
    // down to where the tail comes to the last square's block (a long tail's rest lies on along its back edge)
    let stop = dense.length - 1, stopD = Infinity;
    dense.forEach((p, i) => { if (i > best) { const d = p.distanceTo(tailEnd.at); if (d < stopD) { stopD = d; stop = i; } } });
    const used = dense.slice(best, stop + 1).filter((p, i, all) => i === 0 || i === all.length - 1 || i % 2 === 0);
    if (used.length < 2) used.push(tailEnd.at.clone());
    return new THREE.CatmullRomCurve3(used, false, 'centripetal');
  }

  return {
    place, actor, root, k,
    get calm() { return calm; },
    set calm(value) { calm = Boolean(value); },
    get stretch() { return { neck: neckS, tail: tailS }; },
    ridePoint, bow, lift, rest: settle, slideCurve,
    /** Her head at once at `u` along her bow (0 rest, 1 bowed): the lab's clearance check of the arc. */
    holdArc(u) {
      if (!place.neck) return;
      arc = clamp01(u); moving = arc > 0;
      arcPoint(arc, target); wayAt(arc, way);
    },
    /** Her neck's and tail's joints and thickness as she stands now (world), for the lab's clearance check. */
    skeleton() {
      return {
        neck: neckJoints.map((p, i) => ({ p: p.clone(), r: neckRadius[i] * k })),
        tail: tailJoints.map((p, i) => ({ p: p.clone(), r: tailRadius[i] * k })),
        head: neckJoints[RIDE_JOINT + 1].clone().addScaledVector(headDir.clone().applyQuaternion(rootQ), HEAD.reach * k),
      };
    },
    lookAt(point) {
      if (!point) { look.goal = 0; return; }
      const head = actor.headPosition(va);
      look.goal = head.distanceTo(point) < LOOK.near ? 1 : 0;
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
      look.weight += (look.goal - look.weight) * (1 - Math.exp(-dt * 2.5));
      if (swishT >= 0 && (swishT += dt) > 1.4) swishT = -1;
      if (flickT >= 0 && (flickT += dt) > 0.7) flickT = -1;
      if (cheerT >= 0 && (cheerT += dt) > cheerFor) { cheerT = -1; actor.play('idle', { fade: 0.5 }); }
      // the fidgets
      const busy = moving || tweens.size || cheerT >= 0;
      if (!busy && (nextFidget -= dt) <= 0) {
        nextFidget = (calm ? 12 : 6) + Math.random() * (calm ? 14 : 9);
        const pick = Math.random();
        if (pick < 0.3) nodT = 0;
        else if (pick < 0.55) { if (!calm) swishT = 0; else nodT = 0; }
        else if (pick < 0.8) glanceT = 0;
        else stretchT = 0;
        if (Math.random() < 0.5) actor.blink();
      }
      nudge.set(0, 0, 0);
      if (nodT >= 0) {
        // a slow, friendly nod: down, a little up, down again less, and back
        const x = (nodT += dt) / 1.8;
        nudge.y -= Math.sin(Math.PI * Math.min(1, x) * 2) ** 2 * 0.22 * (x < 0.5 ? 1 : 0.6) * (calm ? 0.5 : 1);
        if (x >= 1) nodT = -1;
      }
      if (stretchT >= 0) {
        // her neck up and back a little (behind the blocks, never over them), then down again
        const x = (stretchT += dt) / 2.6;
        nudge.y += Math.sin(Math.PI * Math.min(1, x)) * 0.45 * (calm ? 0.5 : 1);
        nudge.z -= Math.sin(Math.PI * Math.min(1, x)) * 0.3;
        if (x >= 1) stretchT = -1;
      }
      if (cheerT >= 0 && !calm) nudge.y += Math.abs(Math.sin(cheerT * 6)) * 0.25 * Math.min(1, cheerT * 3, (cheerFor - cheerT) * 3);
      // a glance at the child, the camera, for a couple of seconds
      const glancing = (glanceT >= 0 && (glanceT += dt) < 2.4) || cheerT >= 0;
      if (glanceT >= 2.4) glanceT = -1;
      glance += ((glancing ? 1 : 0) - glance) * (1 - Math.exp(-dt * 3));
      actor.update(dt);
    },
  };
}
