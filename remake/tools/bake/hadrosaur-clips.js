import * as THREE from 'three';
import { TAU, X, Y, Z, q, turn, bump, ease, spline, WALK, walkSettings, createSampler, createGait } from './quadruped-clips.js';

// Clips for a crested, duck-billed four-legged character (a hadrosaur, Slóeðla the Parasaurolophus)
// rigged by quadruped-rig.js with a raised neck of a few bones (`curve`) and her crest riding the head
// (`crest`). Rest rotations are identity, so every bone turns about the character's own axes: X
// forward, Y up, Z its right side. Angles are in radians.
//
//   idle   5.0 s   breathing, the neck drifting a little, the head looking about, the tail swaying
//   walk   (HADROSAUR_WALK) a calm four-beat walk on planted feet, the head steady
//   kink   2.4 s   a friendly nod: the chin lifts a little, the head dips twice, the second time less
//   happy  2.4 s   she rears up on her hind legs, her front feet off the ground, wiggles her head at
//                  the top, comes down with a soft stamp and wags her tail
//   eat    3.6 s   grazing: the neck curves down until the tip of her bill is at the grass in front of
//                  her feet, she crops twice, comes up chewing
//   call   5.0 s   her horn call: a deep breath fills her chest, she raises her head until the crest
//                  lies back over her neck and blows through it: the bill opens a little and the head
//                  holds high with a gentle tremble while the chest empties; then she settles
//
// The neck is posed by where its stretches point (`neckPose`, as in sauropod-clips.js): each stretch
// from one neck joint to the next turns from where it points at rest, and the head turns on top of the
// last one. The grazing shape is solved so the tip of her bill (the head part's front, `nose`) comes
// down to `graze` metres. The call fills her chest by scaling the Spine bone (the trunk from the hips'
// blend to the shoulders), the Chest scaled back so the neck and head keep their size.
//
// Her jaw is the mouth pass's (mouth.js), cut after this bake: a clip that opens it carries `jaw` in its
// extras, the jaw's opening in degrees at each of the clip's keys, and the mouth pass turns that into
// the jaw's track. Every clip keys every bone of the spine, neck and tail chains; only the walk and
// happy key the legs, so footing keeps the feet where they stand in the others.

const rad = THREE.MathUtils.degToRad;

/** The walk: four beats in lateral sequence, a stride as long as the legs' pivots stand high. */
export const HADROSAUR_WALK = {
  ...WALK,
  duty: 0.58,
  peel: 0.25,
  // A calm walk for legs whose pivots stand h metres above the ground: a stride of h at a Froude
  // number of 0.04, about 1 m/s on a 7.5 m hadrosaur.
  defaults: h => {
    const stride = 1.0 * h;
    return { stride, cycle: stride / Math.sqrt(0.04 * 9.81 * h) };
  },
};

// How much the neck's stretches turn from where they point at rest (degrees, from the chest to the
// head) and the head with them: grazing (the neck curving down in front of her, the bill pointing at
// the ground, the body dipping a little in front: `spine`) and calling (the neck stretched up, the head
// raised so the crest lies back over her neck).
export const GRAZE = { neck: [-26, -62, -88, -100], head: -64, spine: -2 };
export const CALL = { neck: [16, 22, 30, 22], head: 30 };

export function authorHadrosaurClips(rig, options = {}) {
  const { bones, joints, H, chains, mesh, parts } = rig;
  const { graze = 0.12, ...walkOptions } = options;
  const walk = walkSettings(rig, HADROSAUR_WALK, walkOptions);
  const { sample, rest, reset } = createSampler(rig);

  // --- the neck ------------------------------------------------------------------------------------------
  const neckBones = chains.neck.slice(0, -1); // Neck .. NeckN
  const owners = ['Chest', ...neckBones]; // each holds the stretch from its joint to the next
  /**
   * Pose the chest, neck and head so that the stretches turn by `turns` (radians, pitch, from where
   * they point at rest) and the head by `head` (its pitch from rest), the pitch the spine already gives
   * the chest (`under`) taken into account; `yaw` adds a turn about the vertical to each bone (chest
   * first, head last).
   */
  function neckPose(turns, head, under = 0, yaw = null) {
    owners.forEach((n, i) => {
      bones[n].quaternion.copy(turn(yaw?.[i] ?? 0, 0, turns[i] - (i ? turns[i - 1] : under)));
    });
    bones.Head.quaternion.copy(turn(yaw?.[owners.length] ?? 0, 0, head - turns.at(-1)));
  }
  const scaled = (list, k) => list.map(v => k * rad(v));

  // The tip of her bill (the head part's furthest point forward), carried by the head.
  const head = parts.find(p => p.kind === 'head');
  const position = mesh.geometry.attributes.position;
  const nose = new THREE.Vector3(-Infinity, 0, 0);
  for (let i = head.start; i < head.start + head.count; i++) if (position.getX(i) > nose.x) nose.fromBufferAttribute(position, i);
  const noseLocal = nose.clone().sub(joints.Head); // in the Head bone's frame (identity rest rotations)
  const noseNow = () => { bones.root.updateMatrixWorld(true); return bones.Head.localToWorld(noseLocal.clone()); };

  // How far the grazing shape is taken so the tip of the bill comes down to `graze` (bisection; deeper
  // is lower).
  const grazePose = d => {
    const under = d * rad(GRAZE.spine);
    bones.Spine.quaternion.copy(turn(0, 0, under));
    neckPose(scaled(GRAZE.neck, d), d * rad(GRAZE.head), under);
  };
  let depth = 1;
  {
    let lo = 0.3, hi = 1.6;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      reset();
      grazePose(mid);
      if (noseNow().y > graze) lo = mid; else hi = mid;
    }
    depth = (lo + hi) / 2;
    reset();
  }

  // The tail sways in a wave running back from the hips, more toward the tip.
  const tail = chains.tail;
  const sway = (u, amplitude, wave) => tail.forEach((n, i) => {
    const k = i / (tail.length - 1);
    bones[n].quaternion.premultiply(q(Y, amplitude * (0.45 + 0.55 * k) * Math.sin(TAU * u - wave * k)));
  });

  // --- idle --------------------------------------------------------------------------------------------
  // A slow breath, the neck drifting a little in a wave from its base, the head looking about and
  // tilting on top, and the tail swaying.
  const idle = u => {
    const breath = Math.sin(TAU * u);
    bones.Hips.position.y += 0.003 * H * breath;
    bones.Spine.quaternion.copy(turn(0, 0, 0.004 * breath));
    const lift = 0.025 * Math.sin(TAU * u + 0.5);
    const turns = owners.map((_, i) => (i ? lift * (0.4 + 0.2 * i) : -0.006 * Math.sin(TAU * u + 0.3)));
    const yaw = owners.map((_, i) => (i ? 0.022 * Math.sin(TAU * u + 0.8 - 0.3 * i) : 0));
    yaw.push(0.07 * Math.sin(TAU * u + 2.2));
    neckPose(turns, 0.035 * Math.sin(TAU * u + 1.6) + 0.012 * Math.sin(2 * TAU * u), 0.004 * breath, yaw);
    bones.Head.quaternion.multiply(q(X, 0.035 * Math.sin(2 * TAU * u + 0.4)));
    sway(u, 0.035, 1.8);
  };

  // --- walk --------------------------------------------------------------------------------------------
  // The hips and shoulders ride their legs and turn a little with them, the body rolls a little over
  // the side whose feet are down. The neck takes out the body's pitch along its length, so the head
  // travels steadily with a small bob; the tail swings behind.
  const { cycle, lag } = walk;
  const gait = createGait(rig, walk, rest);
  const walkPose = u => {
    const { hind, pitch } = gait.girdles(u);
    const roll = -0.015 * Math.cos(TAU * (u - (lag + walk.duty) / 2));
    const hipsYaw = -0.02 * Math.cos(TAU * u);
    const chestYaw = -0.02 * Math.cos(TAU * (u - lag));
    bones.Hips.position.y += hind - pitch * (gait.pivotX(false) - joints.Hips.x);
    bones.Hips.quaternion.copy(turn(hipsYaw, roll, pitch));
    bones.Spine.quaternion.copy(turn((chestYaw - hipsYaw) / 2, -roll / 2, 0));
    const bob = 0.015 * Math.sin(2 * TAU * (u - lag) + 0.6);
    const turns = owners.map((_, i) => pitch * (1 - 0.85 * i / (owners.length - 1)) + bob * (i / owners.length));
    const yaw = owners.map((_, i) => (i ? -0.3 * chestYaw : (chestYaw - hipsYaw) / 2));
    yaw.push(0);
    neckPose(turns, -0.02 * Math.sin(2 * TAU * (u - lag) + 0.9), pitch, yaw);
    sway(u, 0.045, 2.0);
    bones.Tail1.quaternion.premultiply(q(Z, -0.5 * pitch));
    bones.root.updateMatrixWorld(true);
    gait.plantFeet(u);
  };

  // --- kink: a friendly nod ----------------------------------------------------------------------------
  // The chin lifts a little, then the head nods twice, the second time less, the top of the neck
  // giving with it, and back to rest; the tail wags.
  const kink = u => {
    const lift = rad(6) * bump(u, 0, 0.22);
    const nod = rad(24) * bump(u, 0.14, 0.5) + rad(14) * bump(u, 0.46, 0.8);
    const wag = bump(u, 0.1, 0.95);
    bones.Hips.position.y += 0.002 * H * Math.sin(TAU * u);
    const turns = owners.map((_, i) => (i >= owners.length - 2 ? 0.3 * lift - 0.2 * nod * (i - owners.length + 3) / 2 : 0));
    neckPose(turns, lift - 0.8 * nod);
    bones.Head.quaternion.premultiply(q(X, 0.06 * bump(u, 0.05, 0.9)));
    sway(u, 0.025, 1.8);
    tail.forEach((n, i) => bones[n].quaternion.premultiply(q(Y, 0.05 * wag * (0.5 + 0.5 * i / (tail.length - 1)) * Math.sin(2 * TAU * u - 3 * i / (tail.length - 1)))));
  };

  // --- happy: up on her hind legs ----------------------------------------------------------------------
  // She rocks back onto her hind legs so her front feet leave the ground (by about a tenth of her
  // height), the neck and head swinging up with her and the tail down; at the top she wiggles her head,
  // comes down with a soft stamp, the front feet a moment apart, and wags her tail. The clip keys the
  // legs, so footing hands them to it while it plays.
  const rear = u => rad(15) * spline([[0, 0, 0], [0.12, -0.06, 0], [0.36, 1, 0], [0.5, 0.94, 0], [0.6, 0.06, -2.6], [0.66, -0.05, 0], [0.76, 0, 0], [1, 0, 0]], u);
  const span = gait.span;
  const happy = u => {
    const pitch = rear(u);
    const joy = ease(u, 0.05, 0.35) * (1 - ease(u, 0.85, 1));
    const shake = Math.sin((TAU * 3 * (u - 0.36)) / 0.16) * bump(u, 0.36, 0.52);
    const wiggle = Math.sin((TAU * 2 * (u - 0.62)) / 0.38) * bump(u, 0.62, 1);
    bones.Hips.quaternion.copy(turn(0.02 * wiggle, 0.02 * wiggle, pitch));
    bones.Spine.quaternion.copy(turn(-0.012 * wiggle, 0, 0));
    const turns = owners.map((_, i) => pitch * (1 - 0.5 * i / (owners.length - 1)) + rad(6) * joy * (i / owners.length));
    const yaw = owners.map((_, i) => (i ? 0.05 * wiggle : 0));
    yaw.push(0.1 * shake - 0.08 * wiggle);
    neckPose(turns, rad(10) * joy + 0.3 * pitch, pitch, yaw);
    bones.Head.quaternion.multiply(q(X, 0.1 * shake + 0.06 * Math.sin(TAU * 2 * u) * joy));
    sway(u, 0.1 * joy, 2.4);
    bones.Tail1.quaternion.premultiply(q(Z, -0.3 * pitch));
    bones.root.updateMatrixWorld(true);
    // The hind feet stay where they stand; the front feet hang from the risen shoulders, a little
    // forward, toes down, and land a moment apart.
    for (const l of rig.legs) {
      if (!l.front) { gait.reachFoot(l, l.rest.clone(), 0); continue; }
      const late = l.side === 'R' ? 0.035 : 0;
      const up = Math.max(0, span * Math.sin(rear(u - late)) - 0.004 * H);
      const target = l.rest.clone().add(new THREE.Vector3(0.2 * up, up, 0));
      gait.reachFoot(l, target, -0.7 * up / H);
    }
  };

  // --- eat: grazing ------------------------------------------------------------------------------------
  // The body dips a little in front and the neck curves down until the tip of her bill is at the grass
  // in front of her feet; she crops twice (the bill opens, closes on the grass and tugs), then comes up
  // chewing. The tail rises a little as the head goes down.
  const grazeDown = u => ease(u, 0.04, 0.32) * (1 - ease(u, 0.6, 0.94));
  const tugs = u => bump(u, 0.34, 0.44) + bump(u, 0.46, 0.56);
  const eat = u => {
    const d = depth * grazeDown(u);
    grazePose(d);
    // A tug: the head pulls up and back a little as the bill closes on the grass.
    const tug = tugs(u);
    bones.Head.quaternion.premultiply(q(Z, rad(7) * tug));
    bones[neckBones.at(-1)].quaternion.premultiply(q(Z, rad(4) * tug));
    const chew = Math.sin((TAU * 3 * (u - 0.58)) / 0.36) * bump(u, 0.58, 0.94);
    bones.Head.quaternion.multiply(q(X, 0.03 * chew));
    sway(u, 0.025, 1.8);
    bones.Tail1.quaternion.premultiply(q(Z, 0.05 * grazeDown(u)));
  };
  // The bill opens before each crop and closes on the grass, then chews three times.
  const eatJaw = u => 7 * (bump(u, 0.29, 0.38) + bump(u, 0.41, 0.5)) + 4 * Math.max(0, Math.sin((TAU * 3 * (u - 0.58)) / 0.36)) * bump(u, 0.58, 0.94);

  // --- call: a horn call through her crest ---------------------------------------------------------------
  // A small dip first, then a deep breath: the chest fills (the Spine bone grows, about its joint), the
  // back arches a little, the neck stretches up and the head rises until the crest lies back over her
  // neck. She blows: the bill opens a little, the head holds high with a gentle tremble and sways
  // proudly from side to side while the chest empties, and she settles back with a little nod. The
  // tail lifts with the call.
  const FILL = 0.06;
  const breathIn = u => ease(u, 0.06, 0.3);
  const fillOf = u => breathIn(u) * (1 - ease(u, 0.38, 0.88));
  const raise = u => ease(u, 0.08, 0.36) * (1 - ease(u, 0.82, 0.98));
  const blowing = u => ease(u, 0.37, 0.42) * (1 - ease(u, 0.8, 0.88));
  const call = u => {
    const r = raise(u), fill = fillOf(u), blow = blowing(u);
    const dip = bump(u, 0, 0.12);
    const tremble = Math.sin(TAU * 5 * 5.0 * u) * blow; // five a second over the 5 s clip
    const proud = Math.sin((TAU * (u - 0.4)) / 0.44) * blow;
    const nod = bump(u, 0.86, 1);
    bones.Hips.position.y += 0.004 * H * breathIn(u) * (1 - ease(u, 0.8, 1));
    bones.Spine.quaternion.copy(turn(0, 0, rad(2.5) * fill));
    bones.Spine.scale.setScalar(1 + FILL * fill);
    bones.Chest.scale.setScalar(1 / (1 + FILL * fill));
    const turns = CALL.neck.map((a, i) => rad(a) * r - rad(4) * dip * (i / owners.length));
    const yaw = owners.map((_, i) => (i ? 0.025 * proud : 0));
    yaw.push(0.06 * proud);
    neckPose(turns, rad(CALL.head) * r - rad(5) * dip + rad(1.2) * tremble - rad(10) * nod, rad(2.5) * fill, yaw);
    sway(u, 0.04 + 0.04 * blow, 2.0);
    bones.Tail1.quaternion.premultiply(q(Z, rad(6) * r));
  };
  const callJaw = u => (9 + 1.2 * Math.sin(TAU * 5 * 5.0 * u)) * blowing(u);

  // The jaw's opening in degrees at each key of a clip, for the mouth pass.
  const jawKeys = (open, keys) => Array.from({ length: keys + 1 }, (_, f) => +Math.max(0, open(f / keys)).toFixed(3));
  const withJaw = (clip, open, keys) => { clip.userData.jaw = jawKeys(open, keys); return clip; };
  const clips = [
    sample('idle', 5.0, idle, 150),
    sample('walk', cycle, walkPose, walk.keys, true),
    sample('kink', 2.4, kink, 72),
    sample('happy', 2.4, happy, 72, true),
    withJaw(sample('eat', 3.6, eat, 108), eatJaw, 108),
    withJaw(sample('call', 5.0, call, 150), callJaw, 150),
  ];

  // Where the bill comes down to grazing, and how high the head goes calling.
  const at = (pose, u) => { reset(); pose(u); const n = noseNow(); const h = bones.Head.getWorldPosition(new THREE.Vector3()); reset(); return { nose: n, head: h }; };
  const r2 = v => +v.toFixed(2);
  const low = at(eat, 0.45), high = at(call, 0.5);
  const report = {
    walk: gait.report(),
    eat: { depth: +depth.toFixed(3), nose: low.nose.toArray().map(r2), head: low.head.toArray().map(r2) },
    call: { nose: high.nose.toArray().map(r2), head: high.head.toArray().map(r2), fill: FILL },
  };
  return { clips, report, walk };
}
