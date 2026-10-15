import * as THREE from 'three';

// Clips for a four-legged character rigged by quadruped-rig.js. Rest rotations are identity, so
// every bone turns about the character's own axes: X forward, Y up, Z its right side. Angles are in
// radians. Each clip loops.
//
//   idle  4.0 s   breathing, a slow look about, the tail swaying
//   walk  (WALK)  a calm four-beat walk in lateral sequence on planted feet (below)
//   kink  2.4 s   a friendly nod: the chin lifts a little, the head dips twice, the second time
//                 less, and comes back up
//
// Every clip keys every bone of the spine, neck and tail chains (Hips with its position), so a bone
// one clip turns never keeps that turn when the next takes over. Only the walk keys the legs: idle
// and kink leave them at rest, so footing (engine/footing.js) keeps the feet where they stand.

const TAU = Math.PI * 2;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const q = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
// A turn about the vertical, a tilt toward the right side and a pitch nose-up, applied in that order
// (yaw outermost).
const turn = (yaw = 0, roll = 0, pitch = 0) => q(Y, yaw).multiply(q(X, roll)).multiply(q(Z, pitch));
// A smooth bump from 0 up to 1 and back over [a, b], with no speed at either end.
const bump = (u, a, b) => (u <= a || u >= b ? 0 : Math.sin((Math.PI * (u - a)) / (b - a)) ** 2);

/**
 * The walk. A foot that is down stays flat and sweeps back at exactly the body's speed, `stride` per
 * cycle, so nothing slides when the body moves at stride / cycle; the actor reads that speed off the
 * feet (engine/actor.js, measureGait). A foot lifts off and sets down straight up and down, and in
 * between swings forward in an arc with the heel peeled up. Four beats in lateral sequence: left
 * hind, left fore (`lag` later), right hind, right fore.
 * Each rigid leg reaches its foot from its pivot, which the hips or the chest carry, and slides along
 * its own axis where the pivot and the foot are nearer or further apart than at rest (the skin between
 * the top of the leg and the pivot takes that up). To keep that small, a planted foot sweeps past
 * under its pivot (Tripo stands a hind foot behind the hip, `centre` of that offset is taken out),
 * and each girdle rides as high as its planted legs reach at their rest length, smoothed: it rises
 * over a leg at mid-stance and settles as the feet spread, a step apart for the hips and shoulders,
 * which also pitches the body.
 */
export const WALK = {
  duty: 0.55, // share of the cycle a foot is down (two or three feet always are)
  lag: 0.25, // how long after a hind foot the fore foot on the same side comes down (share of the cycle)
  keys: 120, // keys per cycle: every lift-off and set-down falls on one (duty and lag snap to them)
  edge: 4, // keys for the straight lift-off, and again for the set-down
  lift: 0.008, // height after the straight lift, as a share of the height
  arc: 0.04, // top of the swing arc, as a share of the height
  peel: 0.3, // radians of heel peel at its most, early in the swing
  centre: 0.85, // how much of a foot's rest offset from under its pivot the stance takes out
  blur: 0.04, // how much the girdles' paths are smoothed (a share of the cycle)
  crouch: 0.005, // how much lower than its legs allow the body walks, as a share of the height
  // A calm walk for legs whose pivots stand h metres above the ground: a stride of 1.18 h at a
  // Froude number of 0.045 (speed squared over g h): about 0.9 m/s on a 7 m stegosaurus.
  defaults: h => {
    const stride = 1.18 * h;
    return { stride, cycle: stride / Math.sqrt(0.045 * 9.81 * h) };
  },
};

export function authorClips(rig, options = {}) {
  const { bones, legs, joints, H, chains } = rig;
  const walk = { ...WALK, ...WALK.defaults(legs[0].pivot.y), ...options };
  const snap = v => Math.round(v * walk.keys) / walk.keys;
  walk.duty = snap(walk.duty);
  walk.lag = snap(walk.lag);
  const chainBones = [...chains.spine, ...chains.neck, ...chains.tail];
  const legBones = legs.flatMap(l => [l.name, l.foot]);
  const rest = Object.fromEntries(Object.entries(bones).map(([n, b]) => [n, b.position.clone()]));
  const reset = () => { for (const [n, b] of Object.entries(bones)) { b.position.copy(rest[n]); b.quaternion.identity(); } };

  // Sample `pose(u)` (u from 0 to 1 over the clip) into tracks for the chain bones (and the legs).
  function sample(name, duration, pose, keys, withLegs = false) {
    const times = [];
    const tracks = new Map();
    const animated = [...chainBones, ...(withLegs ? legBones : [])];
    for (let f = 0; f <= keys; f++) {
      const u = f / keys;
      times.push(u * duration);
      reset();
      pose(u);
      for (const n of animated) {
        const b = bones[n];
        if (!tracks.has(n)) tracks.set(n, { q: [], p: [] });
        tracks.get(n).q.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        tracks.get(n).p.push(b.position.x, b.position.y, b.position.z);
      }
    }
    reset();
    const out = [];
    for (const [n, tr] of tracks) {
      out.push(new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, tr.q));
      const moves = tr.p.some((v, i) => Math.abs(v - tr.p[i % 3]) > 1e-6);
      if (n === 'Hips' || moves) out.push(new THREE.VectorKeyframeTrack(`${n}.position`, times, tr.p));
    }
    return new THREE.AnimationClip(name, duration, out);
  }

  // The tail sways in a wave running back from the hips, more toward the tip.
  const sway = (u, amplitude, lag) => chains.tail.forEach((n, i) => {
    bones[n].quaternion.premultiply(q(Y, amplitude * (0.6 + 0.25 * i) * Math.sin(TAU * u - lag * i)));
  });

  // --- idle ------------------------------------------------------------------------------------------
  const idle = u => {
    const breath = Math.sin(TAU * u);
    bones.Hips.position.y += 0.004 * H * breath;
    bones.Spine.quaternion.copy(turn(0, 0, 0.004 * breath));
    bones.Chest.quaternion.copy(turn(0, 0, -0.008 * Math.sin(TAU * u + 0.3)));
    bones.Neck.quaternion.copy(turn(0.03 * Math.sin(TAU * u + 0.8), 0, -0.012 * Math.sin(TAU * u + 0.5)));
    bones.Neck2?.quaternion.copy(turn(0.02 * Math.sin(TAU * u + 1.1), 0, 0));
    bones.Head.quaternion.copy(turn(0.025 * Math.sin(TAU * u + 1.4), 0.015 * Math.sin(2 * TAU * u), 0.02 * Math.sin(TAU * u + 1.2)));
    sway(u, 0.025, 0.55);
  };

  // --- walk --------------------------------------------------------------------------------------------
  const { stride, cycle, duty, lag } = walk;
  const sweep = stride * duty; // backward travel while a foot is down
  const edge = walk.edge / walk.keys;
  const swingT = 1 - duty - 2 * edge;
  const reach = sweep / 2 + edge * stride; // the swing runs from -reach to +reach about the stance centre
  const hEdge = walk.lift * H, hTop = walk.arc * H;
  const phase = { 'BackLeg.L': 0, 'FrontLeg.L': lag, 'BackLeg.R': 0.5, 'FrontLeg.R': 0.5 + lag };
  // A foot at share p of its own cycle from touch-down: x from the middle of its stance, y above its
  // rest height, and the foot's pitch (negative: heel up).
  function footPath(p) {
    if (p < duty) return { x: sweep / 2 - p * stride, y: 0, a: 0, down: true };
    const k = p - duty;
    if (k < edge) return { x: -sweep / 2 - k * stride, y: hEdge * (k / edge) ** 2, a: 0 };
    const back = k - edge - swingT;
    if (back >= 0) return { x: sweep / 2 + (edge - back) * stride, y: hEdge * ((edge - back) / edge) ** 2, a: 0 };
    const s = (k - edge) / swingT;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h11 = s ** 3 - s ** 2;
    const m = reach; // leaves and arrives moving forward at half the swing's mean speed
    return {
      x: -reach * h00 + m * h10 + reach * (1 - h00) + m * h11,
      y: hEdge + (hTop - hEdge) * Math.sin(Math.PI * s),
      a: -walk.peel * Math.sin(Math.PI * Math.min(1, s / 0.75)) ** 2,
    };
  }
  const length = new Map(legs.map(l => [l, l.pivot.distanceTo(l.rest)])); // pivot to foot at rest
  const stance = new Map(legs.map(l => [l, walk.centre * (l.pivot.x - l.rest.x)])); // its middle, from the rest spot
  const footAt = (l, u) => {
    const path = footPath((((u - phase[l.name]) % 1) + 1) % 1);
    return { ...path, target: l.rest.clone().add(new THREE.Vector3(stance.get(l) + path.x, path.y, 0)) };
  };
  // Each girdle's height (from its rest height): the highest its planted legs reach at their rest
  // length, then that path blurred over the loop (a Gaussian, so no wiggles) and lowered until no
  // planted leg is longer than at rest, and by `crouch` more.
  const SAMPLES = 360;
  const girdlePath = front => {
    const pair = legs.filter(l => l.front === front);
    const allowed = Array.from({ length: SAMPLES }, (_, i) => {
      let most = Infinity;
      for (const l of pair) {
        const { target, down } = footAt(l, i / SAMPLES);
        if (!down) continue;
        const r2 = (target.x - l.pivot.x) ** 2 + (target.z - l.pivot.z) ** 2;
        most = Math.min(most, target.y + Math.sqrt(Math.max(0, length.get(l) ** 2 - r2)) - l.pivot.y);
      }
      return most;
    });
    const finite = allowed.map((v, i) => (Number.isFinite(v) ? v : null));
    // A girdle with no foot down (a short moment between steps) keeps the neighbours' height.
    for (let i = 0; i < SAMPLES; i++) {
      if (finite[i] !== null) continue;
      let a = i, b = i;
      while (finite[(a + SAMPLES) % SAMPLES] === null) a--;
      while (finite[b % SAMPLES] === null) b++;
      finite[i] = Math.min(finite[(a + SAMPLES) % SAMPLES], finite[b % SAMPLES]);
    }
    const sigma = walk.blur * SAMPLES;
    const half = Math.ceil(3 * sigma);
    const kernel = Array.from({ length: 2 * half + 1 }, (_, j) => Math.exp(-0.5 * ((j - half) / sigma) ** 2));
    const total = kernel.reduce((s, v) => s + v, 0);
    const blurred = finite.map((_, i) => kernel.reduce((s, v, j) => s + v * finite[(i + j - half + SAMPLES) % SAMPLES], 0) / total);
    const fit = Math.max(...blurred.map((h, i) => h - finite[i]));
    const curve = blurred.map(h => h - fit - walk.crouch * H);
    return u => {
      const f = (((u % 1) + 1) % 1) * SAMPLES;
      const i = Math.floor(f);
      return THREE.MathUtils.lerp(curve[i % SAMPLES], curve[(i + 1) % SAMPLES], f - i);
    };
  };
  const hindY = girdlePath(false), foreY = girdlePath(true);
  // The hips and the shoulders each turn a little with their own legs, the spine bending between
  // them, and the body rolls a little over the side whose feet are down. The neck takes out most of
  // the pitch and turn, so the head stays calm; the tail sways behind.
  const pivotX = front => legs.filter(l => l.front === front).reduce((s, l) => s + l.pivot.x, 0) / 2;
  const span = pivotX(true) - pivotX(false);
  const girdle = new Map(legs.map(l => [l.name, l.front ? bones.Chest : bones.Hips]));
  const restDir = new THREE.Vector3();
  const stats = Object.fromEntries(legs.map(l => [l.name, { angle: [Infinity, -Infinity], stretch: [Infinity, -Infinity], down: [Infinity, -Infinity] }]));
  const girdles = { hind: [Infinity, -Infinity], fore: [Infinity, -Infinity] };
  const walkPose = u => {
    const hind = hindY(u), fore = foreY(u);
    girdles.hind = [Math.min(girdles.hind[0], hind), Math.max(girdles.hind[1], hind)];
    girdles.fore = [Math.min(girdles.fore[0], fore), Math.max(girdles.fore[1], fore)];
    const pitch = (fore - hind) / span;
    const roll = -0.015 * Math.cos(TAU * (u - (lag + duty) / 2));
    const hipsYaw = -0.02 * Math.cos(TAU * u);
    const chestYaw = -0.02 * Math.cos(TAU * (u - lag));
    // The hips' joint stands near the hind pivots: pitching about it leaves the hind girdle at `hind`.
    bones.Hips.position.y += hind - pitch * (pivotX(false) - joints.Hips.x);
    bones.Hips.quaternion.copy(turn(hipsYaw, roll, pitch));
    bones.Spine.quaternion.copy(turn((chestYaw - hipsYaw) / 2, -roll / 2, 0));
    bones.Chest.quaternion.copy(turn((chestYaw - hipsYaw) / 2, 0, 0));
    const nod = 0.01 * Math.sin(2 * TAU * (u - lag) + 0.6);
    bones.Neck.quaternion.copy(turn(-0.6 * chestYaw, -0.4 * roll, -0.6 * pitch + nod));
    bones.Neck2?.quaternion.copy(turn(-0.3 * chestYaw, 0, -0.2 * pitch));
    bones.Head.quaternion.copy(turn(0, 0, -0.012 * Math.sin(2 * TAU * (u - lag) + 0.9)));
    sway(u, 0.035, 0.7);
    bones.Tail1.quaternion.premultiply(q(Z, -0.5 * pitch));
    bones.root.updateMatrixWorld(true);
    for (const l of legs) {
      const { target, a, down } = footAt(l, u);
      // The pivot as the girdle carries it (bones have identity rest rotations).
      const g = girdle.get(l.name);
      const pivot = g.localToWorld(l.pivot.clone().sub(joints[g.name]));
      restDir.subVectors(l.rest, l.pivot).normalize();
      const dir = target.clone().sub(pivot);
      const distance = dir.length();
      dir.divideScalar(distance);
      const legQ = new THREE.Quaternion().setFromUnitVectors(restDir, dir);
      bones[l.name].quaternion.copy(legQ);
      bones[l.name].position.copy(target).sub(rest[l.foot].clone().applyQuaternion(legQ));
      bones[l.foot].quaternion.copy(legQ).invert().multiply(q(Z, a));
      const st = stats[l.name];
      const angle = Math.atan2(dir.x, -dir.y);
      st.angle = [Math.min(st.angle[0], angle), Math.max(st.angle[1], angle)];
      const stretch = distance - length.get(l);
      st.stretch = [Math.min(st.stretch[0], stretch), Math.max(st.stretch[1], stretch)];
      if (down) {
        const off = target.x - l.rest.x;
        st.down = [Math.min(st.down[0], off), Math.max(st.down[1], off)];
      }
    }
  };

  // --- kink: a friendly nod ------------------------------------------------------------------------------
  // A small lift of the chin first, then two nods, the second smaller, and back to rest. The neck
  // takes part of each nod, the back dips with it, and the tail gives a happy wag.
  const kink = u => {
    const lift = 0.05 * bump(u, 0, 0.2);
    const nod = 0.42 * bump(u, 0.12, 0.5) + 0.26 * bump(u, 0.45, 0.8);
    const wag = bump(u, 0.1, 0.95);
    bones.Hips.position.y += 0.003 * H * Math.sin(TAU * u);
    bones.Spine.quaternion.copy(turn(0, 0, -0.012 * (bump(u, 0.12, 0.5) + 0.6 * bump(u, 0.45, 0.8))));
    bones.Chest.quaternion.copy(turn(0, 0, -0.006 * Math.sin(TAU * u)));
    bones.Neck.quaternion.copy(turn(0, 0, 0.4 * lift - 0.25 * nod));
    bones.Neck2?.quaternion.copy(turn(0, 0, 0.3 * lift - 0.15 * nod));
    bones.Head.quaternion.copy(turn(0, 0.06 * bump(u, 0.05, 0.9), lift - 0.6 * nod));
    sway(u, 0.03, 0.55);
    chains.tail.forEach((n, i) => bones[n].quaternion.premultiply(q(Y, 0.05 * wag * (0.5 + 0.2 * i) * Math.sin(2 * TAU * u - 0.6 * i))));
  };

  const clips = [
    sample('idle', 4.0, idle, 120),
    sample('walk', cycle, walkPose, walk.keys, true),
    sample('kink', 2.4, kink, 72),
  ];
  const deg = THREE.MathUtils.radToDeg;
  const r3 = v => +v.toFixed(3);
  const report = {
    walk: {
      cycle: r3(cycle), stride: r3(stride), speed: r3(stride / cycle), duty, lag,
      girdles: { hind: girdles.hind.map(r3), fore: girdles.fore.map(r3) },
      legs: Object.fromEntries(Object.entries(stats).map(([n, s]) => [n, {
        angleDeg: s.angle.map(a => +deg(a).toFixed(1)), stretch: s.stretch.map(r3), plantedFromRest: s.down.map(r3),
      }])),
    },
  };
  return { clips, report, walk: { ...walk, stride, cycle } };
}
