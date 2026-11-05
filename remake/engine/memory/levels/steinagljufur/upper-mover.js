import * as THREE from 'three';
import { GESTURES, FAIL_TRIES } from '../../gestures.js';
import { createWalkers } from '../../walkers.js';
import { BORE } from './props.js';
import { CLIMB, TREE_AT, wayPoints } from './upper-ground.js';

/**
 * The mover of level 2's steps after the rockfall (levels/steinagljufur/mover.js is the first two's, and delegates these to this): who goes where and what each tap of the child does.
 *
 *   through   everyone (the eight friends and Mosi) goes through the lit tunnel: they gather at its mouth and file in (the Kambeðlur lead, their plates still glowing), and come out of
 *             the exit of the tunnel in the upper gorge (scenes/through.js cuts between the two) and gather on the floor in front of the high ledge
 *   reach     the Þórseðlur stand each side of the slab on the ledge; each tap they stretch their long necks and pull, and the slab comes down a step (three steps) until it lies as a
 *             ramp up the ledge; then everyone walks up the ramp to the terrace
 *   fly       the Flugeðlur carry the rope's free end (the rope is tied at the foot of the cliff): each tap is a wingbeat up the cliff (three legs), at the top they fly round the
 *             tree, winding the rope round its trunk, the rope draws taut, and they land
 *   climb     everyone walks up the steep path with the rope beside them as a handrail (nobody climbs the rope) to the rim
 *   pull      (a together step: no pair is picked) the Flugeðlur fly the second rope out over the gap, round the stone on Sólarsyllan and back up to the stub near the dead trunk's
 *             top, and knot it there, while everyone else lines up on it; each tap they all lean back and strain and the trunk tilts a step (three), the third throws it over the
 *             gap, where it lies as a bridge (ledge.js)
 *   walk      everyone goes over the trunk to Sólarsyllan at a calm walk (WALK.deck 3.6 m/s, level 1's crossing pace), one behind the other, each on one way with no step
 *             at its ends: up its side wide of the roots, along its top, down off its top end, each body kept over the bark widened by its width (ledge.js cover; keepOver);
 *             the second rope lies slack on the ground and along the trunk's open side to the stone (slackPath); the Flugeðlur glide over from the start, and the walk ends
 *             when they are down too, inside 14 s (getDebug: walked, times)
 *   a wrong friend's go at the ledge and at the cliff (`startFail`)
 *
 * Positions are in the upper gorge's frame (upper.js: x forward, z to the right, y up) turned into the scene's by `U.world`. Everything runs on the game clock (update(dt)).
 *
 * Events (the page hears them: levels/steinagljufur.js eventSounds and eventCaptions): 'through-start', 'reach-start', 'slab-step' { index }, 'slab-down', 'fly-start', 'wing-beat' { index },
 * 'rope-lift', 'rope-knots', 'rope-taut', 'rope-tied', 'climb-start', 'climb-step', 'footstep', 'bridge-complete' { id }; the pull's 'pull-start', 'trunk-tilt' { index }, 'trunk-fall',
 * 'trunk-dust' and the walk's 'walk-start' and 'footstep' { surface: 'wood' }; the goes: 'fail-bump', 'fail-rope', 'fail-slip', 'fail-done'.
 */
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const wayFrame = wayPoints(1);

// ---- where the group stands (the frame's x forward, z to the right; each spot a place on the ground and the way it faces: radians from forward, positive turning to the right) ----
export const FORMATIONS = Object.freeze({
  // on the floor in front of the ledge, as they come out of the tunnel (the Þórseðlur at the front: their go is next)
  floor: { mosi: [-4.8, 1.8], triceratops: [[-6.6, -3.2], [-7, -.4]], stegosaurus: [[-8.6, -2.5], [-9, .2]], brontosaurus: [[-3.2, -3.0], [-3.4, -.2]], pteranodon: [[-10.2, -1.9], [-10.5, .9]] },
  // on the terrace of the ledge, at the foot of the cliff (the Flugeðlur by the rope)
  // (the Kambeðlur stand on the flat, in a line behind the second Flugeðla, who is 0.6 m nearer the first: the second stood 0.2 m up the hillside's foot as the ground is
  // drawn (a 0.9 m grid over groundAt, so its slope starts up to a cell early) and the first with a foot in the boulder at its edge. The second Kambeðla stands at the
  // flat's far end, out of the close-up of Mosi laughing at a wrong friend's go at the cliff: 0.7 m nearer the first, it came into that shot on a tall screen (820 x 1180)
  // and took it to 267,000 triangles. The first Þórseðla stands out of that close-up too, 1.2 m nearer the open side and 0.4 m back, and the first Þríhyrna 1.0 m nearer
  // the open side, on the far side of the second, to make room: at [4.9, -2.7] its head and front legs came into the close-up at full detail while the Þríhyrnur and
  // the Kambeðlur had their goes, and took it to 277,000 and 285,000 triangles, veggir)
  terrace: { mosi: [8.2, -3.6], triceratops: [[5.5, -5.7], [7.4, -5.2]], stegosaurus: [[4.4, 1.7], [7.7, 1.4]], brontosaurus: [[4.5, -3.9], [4.8, 0]], pteranodon: [[6.5, -1.3], [6.8, .3]] },
  // on the rim, at the end of the climb
  // (the first Flugeðla lands on the tree's flat, north of the tree, just outside where her wrap round it ends: where she stood, on the path's edge, her tail was in the
  // flat's bank, and from the wrap's end her way down to the far side of the tree went through its trunk, veggir)
  rim: { mosi: [27.6, 7], triceratops: [[28.8, 4.6], [29.4, 7.6]], stegosaurus: [[30.6, 4], [31.2, 7]], brontosaurus: [[32.4, 5.2], [33, 8.2]], pteranodon: [[23.9, 14.0], [25.2, 10.7]] },
  // on the clifftop at the second rope (Task 6): two lines either side of it (it runs along z = 5.4), facing the gap, the Þórseðlur at the front and Mosi at its end
  rope: { mosi: [27.6, 4.6], brontosaurus: [[38.6, 4.75], [37.4, 6.05]], triceratops: [[35.1, 4.75], [34.0, 6.05]], stegosaurus: [[32.9, 4.75], [31.8, 6.05]], pteranodon: [[30.4, 4.75], [29.3, 6.05]] },
  // on Sólarsyllan, over the trunk (the stone the rope goes round is at [48.4, 6.0])
  sun: { mosi: [53.0, 6.6], triceratops: [[50.4, 2.8], [51.0, 9.8]], stegosaurus: [[53.6, 3.0], [54.2, 10.0]], brontosaurus: [[57.4, 3.6], [58.0, 8.4]], pteranodon: [[50.0, 11.4], [56.0, 11.6]] },
});
// The second rope (Task 6): its fixed end on the clifftop behind where the line stands, and the free end of its coil (the frame's [x, z])
export const ROPE2 = Object.freeze({ from: Object.freeze([25.4, 5.4]), to: Object.freeze([26.6, 3.9]) });
// the Þórseðlur's places at the ledge: each side of the slab, close under the riser, their long necks over its edges
const REACH_SPOTS = [[.9, -2.7], [.9, 2.7]];
// Where they stand there is no room for a long tail to turn in: the slab on one side, the riser in front, and the second has the hillside at its back. In the cheer the first
// turns toward the camera only as far as its tail stays out of the slab's foot (45 degrees), the second not at all (its tail went 84 cm into the bank), and both look at it;
// then they back out to the slab's foot (BACK_TO) and turn there to walk up it (turning round where they stood, a tail went 51 cm into the riser; the second backs out
// 0.25 m further from the slab's side, where its front foot brushed the slab, veggir).
const CHEER_TURN = [Math.PI / 4, 0], BACK_TO = [[-2.0, -1.6], [-2.0, 1.85]];
// The slab as the friends walk on it: the plane of its ridge, on which U.slab.ramp lays their lanes, this far either side of its middle (their lanes and feet)
const RAMP_HALF = 1.3;
// the slab's steps: angles above the horizontal toward the floor (upper.js slab.steps), and how long each takes
const STEP_SECONDS = 1.05;
// the Flugeðlur's three legs up the cliff (fractions of the way along the path) and the height they fly above it
const LEGS = [.30, .64, 1];

export function createUpperMover({ stage, level, upper: U, rope, rope2 = null, trunk = null, plates, events, members, holding, tunnelPoint, lower, setLower, fx, reduced: reducedNow }) {
  // (the walkers keep to the ground under them: the glade's, and the upper gorge's once the group is through)
  const walkers = createWalkers({ stage, ground: (x, z) => where === 'glade' ? stage.heightAt(x, z) : U.heightAt(x, z) });
  const mosi = () => stage.mosi.actor;
  const friends = () => level.friends.flatMap(species => members(species));
  const everyone = () => [...friends(), mosi()];
  const world = (x, z, rise = 0) => U.onGround(x, z, rise).applyMatrix4(U.group.matrixWorld);
  const forward = (turnRight = 0) => U.yawOf(Math.cos(turnRight), Math.sin(turnRight));
  const facing = (from, to) => { const a = U.world(from[0], 0, from[1]), b = U.world(to[0], 0, to[1]); return Math.atan2(-(b.z - a.z), b.x - a.x); };
  let action = null, where = 'glade', time = 0, goes = null;

  // ---- the places ----
  /** Where the friend of `species` (member `i`) or Mosi stands in a formation: a point on the ground (scene's) and its yaw. */
  function spotOf(formation, who, i = 0) {
    const spot = who === 'mosi' ? FORMATIONS[formation].mosi : FORMATIONS[formation][who][i];
    return { point: world(spot[0], spot[1]), yaw: forward(formation === 'floor' ? 0 : 0), frame: spot };
  }
  const slabPoints = across => U.slab.ramp(across).map(p => U.world(p.x, p.y, p.z));
  /** The way up the steep path as points of the scene, `lane` metres to the right of its middle line (negative: to the left, the open side). */
  function pathRoute(lane) {
    return wayFrame.map(([x, z, y], k) => {
      const prev = wayFrame[Math.max(0, k - 1)], next = wayFrame[Math.min(wayFrame.length - 1, k + 1)], dx = next[0] - prev[0], dz = next[1] - prev[1], len = Math.hypot(dx, dz) || 1;
      // (the frame's z is to the right, so the right-hand normal of the direction (dx, dz) is (-dz, dx))
      return U.world(x - dz / len * lane, y, z + dx / len * lane);
    });
  }

  // ---- through ----
  const ENTER = { first: 2.0, every: .26, run: 6.4, walk: 4.4 };
  const ORDER = ['stegosaurus', 'mosi', 'triceratops', 'brontosaurus', 'pteranodon'];
  // Each pair's two lanes, metres either side of the bore's middle: the narrower pairs walk closer in (the bore is 2.1 to 2.7 m wide at the friends' feet),
  // and a low lip of rock at the left foot of the mouth (x 2.6 to 3.2) leaves 0.81 m on that side, so the left lane comes in 0.3 m to the right of its
  // line and is back on it 1.5 m in. Side by side the Þríhyrnur are 2.84 m wide, wider than the bore (their feet went 17-21 cm into its mouth, veggir): they wait side by
  // side where they did and go in one behind the other in its middle (TRI_IN), the second TRI_IN.wait seconds after it went before and the pairs behind them as much later.
  // The exit is the same tunnel: there they come out one behind the other in its middle (TRI_FILE), the second from further in, which no cut waits for.
  const LANES = { stegosaurus: .6, triceratops: .62, brontosaurus: .56, pteranodon: .62 }, LIP = { shift: .3, to: 3.0, back: 1.5 }, TRI_FILE = { lane: .12, behind: 1.8 };
  const TRI_IN = { lane: .05, wait: .45 };
  function startThrough() {
    walkers.cancelAll(); walkers.resetClock();
    action = { id: 'through', phase: 'gather', age: 0, hidden: 0, total: 9, arrived: 0 };
    events.push({ type: 'through-start' });
    ORDER.forEach((who, g) => {
      const list = who === 'mosi' ? [mosi()] : members(who);
      list.forEach((actor, i) => {
        actor.clearLook?.(); actor.stopGesture?.();
        const file = who === 'triceratops', lane = who === 'mosi' ? BORE.across : BORE.across + (i ? 1 : -1) * (LANES[who] ?? .62), row = who === 'stegosaurus' ? 0 : g;
        const lip = who !== 'mosi' && !file && !i ? LIP.shift : 0, past = lip ? [tunnelPoint(LIP.to, lane + lip), tunnelPoint(LIP.back, lane)] : [], way = file ? BORE.across + TRI_IN.lane : lane;
        const stage1 = tunnelPoint(BORE.mouth + 1.1 + row * .5, lane + lip), enter = tunnelPoint(BORE.mouth - .2, way + lip), inside = tunnelPoint(-1.7, way);
        const at = ENTER.first + g * ENTER.every + i * .12 + (file ? i : g > ORDER.indexOf('triceratops') ? 1 : 0) * TRI_IN.wait;
        walkers.start(actor, [{ to: [stage1], speed: ENTER.run }, { until: at }, { to: [enter, ...past, inside], speed: ENTER.walk }, { hide: true }], { yaw: null, onDone: () => { action.hidden++; } });
      });
    });
  }
  /** The cut: everyone is in the upper gorge, in the dark at the back of the exit; they come out one after the other and gather on the floor. */
  function cutUpper() {
    if (!action || action.id !== 'through' || action.cut) return false;
    action.cut = true; action.phase = 'exit'; action.age = 0; where = 'upper';
    setLower(false); U.show(); walkers.cancelAll(); walkers.resetClock();
    // (`bore(x)`: the frame's x of a place in the exit's tunnel, in the tunnel's own x as the glade's lanes are given: the mouth at BORE.mouth; its middle is the frame's z = 0)
    const t0 = walkers.clock(), mouth = U.anchors.exit.mouth.x, bore = x => mouth - BORE.mouth + x;
    ORDER.forEach((who, g) => {
      const list = who === 'mosi' ? [mosi()] : members(who);
      list.forEach((actor, i) => {
        // (the right-hand Flugeðla walks 0.1 m further in: her right wing's tip brushed the foot of the exit's right wall, veggir)
        const file = who === 'triceratops', lane = who === 'mosi' ? 0 : file ? TRI_FILE.lane : (i ? 1 : -1) * (LANES[who] ?? .62) - (who === 'pteranodon' && i ? .1 : 0), lip = who !== 'mosi' && !file && !i ? LIP.shift : 0;
        const spot = spotOf('floor', who, i), inside = world(mouth - 3.2 - (file && i ? TRI_FILE.behind : 0), lane);
        const out = file ? [world(bore(LIP.back), lane), world(mouth + .3, lane), spot.point] : [world(bore(LIP.back), lane), world(bore(LIP.to), lane + lip), world(mouth + .3, lane + lip), world(mouth + .9, lane * 1.4), spot.point];
        walkers.place(actor, inside, forward(0), false); actor.root.scale.setScalar(.02);
        const delay = g * .3 + i * .1;
        walkers.start(actor, [{ until: t0 + delay }, { pop: .22 }, { to: out, speed: 5.4 }], { yaw: spot.yaw, onDone: () => { action.arrived++; } });
      });
    });
    return true;
  }
  function updateThrough(dt) {
    const a = action; a.age += dt;
    if (a.phase === 'gather' && a.age >= ENTER.first) a.phase = 'enter';
    if ((a.phase === 'gather' || a.phase === 'enter') && a.hidden >= a.total) a.phase = 'inside';
    if (a.phase === 'exit' && a.arrived >= a.total) { a.phase = 'lineup'; a.age = 0; for (const actor of friends()) actor.lookAt?.(U.world(2, 2, 0), { weight: .5, maxAngle: 18 }); }
    if (a.phase === 'lineup' && a.age >= (reduced() ? .1 : .6)) {
      // the Kambeðlur let the light go: their plates dim (they held it until now)
      holding.delete('stegosaurus'); plates.setAll(0, { duration: reduced() ? 0 : 1.1 });
      for (const actor of friends()) actor.clearLook?.();
      const id = a.id; action = null; events.push({ type: 'bridge-complete', id });
    }
  }

  // ---- reach ----
  const upTo = (who, formation) => { const list = who === 'mosi' ? [mosi()] : members(who); return list.map((actor, i) => ({ actor, spot: spotOf(formation, who, i) })); };
  function startReach(beats) {
    walkers.cancelAll(); walkers.resetClock();
    action = { id: 'reach', species: 'brontosaurus', phase: 'approach', age: 0, beats: Math.max(0, Math.floor(beats) || 0), given: 0, queue: 0, done: 0, stepAge: 0, from: U.slab.steps[0], to: U.slab.steps[1] };
    events.push({ type: 'reach-start' });
    members('brontosaurus').forEach((actor, i) => {
      actor.clearLook?.(); const spot = world(...REACH_SPOTS[i]);
      walkers.start(actor, [{ to: [spot], speed: 3.2 }], { yaw: facing(REACH_SPOTS[i], [REACH_SPOTS[i][0] + 3, REACH_SPOTS[i][1] * .35]) });
    });
    return true;
  }
  function reachStep() {
    const a = action, index = a.done; a.queue--; a.phase = 'step'; a.stepAge = 0; a.index = index; a.from = U.slab.steps[index]; a.to = U.slab.steps[index + 1];
    for (const actor of members('brontosaurus')) { actor.gesture?.(`pull-${index + 1}`); }
    events.push({ type: 'slab-step', id: 'reach', index });
  }
  function updateReach(dt) {
    const a = action; a.age += dt;
    if (a.phase === 'approach') { if (!walkers.busy()) { a.phase = 'ready'; a.age = 0; for (const actor of members('brontosaurus')) actor.setMotion?.('idle'); } }
    else if (a.phase === 'ready') { if (a.queue > 0) reachStep(); }
    else if (a.phase === 'step') {
      a.stepAge += dt; const seconds = reduced() ? .3 : STEP_SECONDS, u = clamp(a.stepAge / seconds, 0, 1);
      U.slab.set(lerp(a.from, a.to, smooth((u - .12) / .88)));
      if (u >= 1) {
        a.done++;
        if (a.done >= (a.beats || 3)) {
          // the whole slab is down: a thud, dust at its foot, the camera shakes
          a.phase = 'down'; a.age = 0; U.slab.set(U.slab.steps.at(-1));
          const foot = U.world(...U.slab.under(U.slab.length, 0).toArray()); fx?.emit?.('dust', foot, { count: 14, strength: 1.4 }); fx?.emit?.('poof', foot, { count: 7, ring: .8 }); stage.director?.shake?.(.14, .4);
          events.push({ type: 'slab-down' });
        } else a.phase = 'ready';
      }
    } else if (a.phase === 'down') {
      if (a.age >= (reduced() ? .3 : .9)) {
        a.phase = 'cheer'; a.age = 0; a.cheerFrom = members('brontosaurus').map(actor => actor.root.rotation.y);
        for (const actor of members('brontosaurus')) { actor.gesture?.('cheer'); actor.lookAt?.(stage.camera(), { weight: .8, maxAngle: 24 }); }
      }
    } else if (a.phase === 'cheer') {
      faceCamera('brontosaurus', dt, a.cheerFrom, CHEER_TURN);
      if (a.age >= (reduced() ? .4 : 1.4)) {
        // everyone walks up the ramp to the terrace: two lanes up the slab, then to their places
        a.phase = 'ascend'; a.age = 0; walkers.resetClock();
        const t0 = 0, surface = rampSurface(); let k = 0;
        for (const [who, formation] of [['mosi', 'terrace'], ['brontosaurus', 'terrace'], ['triceratops', 'terrace'], ['stegosaurus', 'terrace'], ['pteranodon', 'terrace']]) {
          const list = who === 'mosi' ? [mosi()] : members(who);
          list.forEach((actor, i) => {
            const lane = who === 'mosi' ? 0 : (i ? .85 : -.85), spot = spotOf(formation, who, i), foot = U.slab.ramp(lane).map(p => U.world(p.x, p.y, p.z));
            // (from where it stands: to the foot of the slab, up it, and on to its place on the terrace; off the slab's top every body lies on the terrace and the slab as it
            // steps down, not pitched along the line (its front feet went 8-15 cm into the terrace, veggir). The Þórseðlur back out to the slab's foot first, and lie on the
            // slab and the floor all the way)
            if (who === 'brontosaurus') {
              actor.clearLook?.();
              walkers.start(actor, [{ to: [world(...BACK_TO[i])], speed: 3.4, ground: false, backward: true }, { to: [...foot, spot.point], speed: 4, ground: false, surface }], { yaw: spot.yaw, pitch: true });
            } else walkers.start(actor, [{ until: t0 + k * .2 }, { to: foot, speed: 4, ground: false }, { to: [spot.point], speed: 4, ground: false, surface }], { yaw: spot.yaw, pitch: true });
          });
          k += who === 'mosi' ? 1 : 2;
        }
      }
    } else if (a.phase === 'ascend') {
      if (!walkers.busy()) { const id = a.id; where = 'terrace'; action = null; rope.hang(); rope.show(); events.push({ type: 'bridge-complete', id }); }
    }
  }
  // (each turns toward the camera; with `from` and `most`, at most most[i] radians from the way it faced at from[i])
  const faceCamera = (species, dt, from = null, most = null) => {
    const cam = stage.camera(), wrap = r => Math.atan2(Math.sin(r), Math.cos(r));
    members(species).forEach((actor, i) => {
      let target = Math.atan2(-(cam.z - actor.root.position.z), cam.x - actor.root.position.x);
      if (from && most) target = from[i] + clamp(wrap(target - from[i]), -most[i], most[i]);
      actor.root.rotation.y += wrap(target - actor.root.rotation.y) * (reduced() ? 1 : 1 - Math.exp(-dt / .14));
    });
  };
  /** The slab lying as a ramp, as the friends walk on it (walkers.js `surface`): the plane of its ridge from its foot to the ledge, RAMP_HALF either side of its middle, and the ground round it. */
  function rampSurface() {
    const angle = U.slab.steps.at(-1), hi = U.slab.top(0, 0, angle), lo = U.slab.top(U.slab.length, 0, angle), v = V(0, 0, 0);
    return (x, z) => {
      const p = U.local(v.set(x, 0, z)), u = (p.x - lo.x) / (hi.x - lo.x), ground = U.heightAt(x, z);
      return u >= 0 && u <= 1 && Math.abs(p.z) <= RAMP_HALF ? Math.max(ground, lo.y + (hi.y - lo.y) * u) : ground;
    };
  }

  // ---- fly ----
  // The rope lies in a coil at the foot of the cliff, tied to its stake. The Flugeðlur take its free end (A, in front, then B a metre behind: the rope runs through B's beak to A's) and
  // fly it up the cliff in three legs, one for each tap; at the top they circle the tree, winding the rope round its trunk; it draws taut, and they land by the tree.
  // (the wrap keeps the Flugeðlur off the wood: the tree forks two metres up and its limbs reach up to 2.15 m out over that, so they circle low, their roots 0.35 m over
  // its foot (not 1.55) and 1.9 m out (not 1.15): their bodies ride a metre over their roots in flight, their wings' tips up to 1.25 m over them as they beat, and
  // higher their legs (at 1.15 and 1.3 m out) and their wings (1.7 m out, 1.05 m up) went into the limbs. `speed` is 3.4 m/s at 1.15 m made as much faster as the
  // circle is longer: the wrap takes as long as it did, veggir)
  const LEG_SPEED = 4.4, WRAP = { radius: 1.9, rise: .35, turns: 1.4, speed: 3.4 * 1.9 / 1.15, behind: 1.15 };
  const frameOf = point => U.local(point);
  const noseFrame = actor => frameOf(actor.getNosePosition());
  const airAt = fraction => { // a point above the path, fraction 0..1 of its length, toward the hillside a little and 2.6 metres up: [x, y, z]
    const k = Math.max(1, Math.min(wayFrame.length - 1, Math.round(fraction * (wayFrame.length - 1)))), [x, z, y] = wayFrame[k];
    return [x, y + 2.7, z + 1.2];
  };
  const circle = angle => { const c = U.tree.base; return [c.x + Math.cos(angle) * WRAP.radius, U.tree.base.y + WRAP.rise, c.z + Math.sin(angle) * WRAP.radius]; };
  // (a phase that waits only on flights would hold the round if a flight never said it was done: it goes on after about twice as long as the flight takes, from where she
  // is along its points at its speed, with two seconds for the take-off and the ease in; the larger of the two Flugeðlur's)
  const flightGuard = (actor, points, speed) => { let length = 0, from = actor.root.position; for (const p of points) { length += from.distanceTo(p); from = p; } return 2 * length / Math.max(.1, speed) + 2; };
  function startFly(beats) {
    walkers.cancelAll(); walkers.resetClock();
    action = { id: 'fly', species: 'pteranodon', phase: 'approach', age: 0, beats: Math.max(0, Math.floor(beats) || 0), given: 0, queue: 0, done: 0, legAge: 0, lift: 0, trail: [], trailAge: 0, b0: null, tight: 0 };
    events.push({ type: 'fly-start' });
    rope.hang(); rope.show();
    members('pteranodon').forEach((actor, i) => {
      actor.clearLook?.(); const spot = [6.7, i ? 1.0 : -1.0];
      walkers.start(actor, [{ to: [world(...spot)], speed: 2.4 }], { yaw: facing(spot, [spot[0] + 3, 0]) });
    });
    return true;
  }
  function ropeFollow() {
    const a = action; if (!a || a.id !== 'fly' || !['ready', 'leg', 'wrap', 'tie'].includes(a.phase)) return;
    const [A, B] = members('pteranodon');
    if (a.phase === 'wrap' || a.phase === 'tie') { rope.carry(a.b0, a.b0, 1); rope.setTrail(a.trail); return; }
    rope.carry(noseFrame(A), noseFrame(B), a.lift);
  }
  function flyLeg(index) {
    const a = action; a.queue--; a.phase = 'leg'; a.leg = index; a.arrived = 0; a.legAge = 0; a.index = index; a.guard = 0;
    events.push({ type: 'wing-beat', id: 'fly', index }); if (index === 0) events.push({ type: 'rope-lift' });
    const last = index === LEGS.length - 1, theta0 = Math.atan2(airAt(.9)[2] - U.tree.base.z, airAt(.9)[0] - U.tree.base.x) + .0;
    members('pteranodon').forEach((actor, i) => {
      const base = last ? circle(theta0 - (i ? WRAP.behind / WRAP.radius : 0)) : (() => { const p = airAt(LEGS[index]); return [p[0] - (i ? 1.1 : 0), p[1] - (i ? .25 : 0), p[2] + (i ? .5 : -.4)]; })();
      a.theta0 = theta0; actor.carry?.(true);
      const target = U.world(...base); a.guard = Math.max(a.guard, flightGuard(actor, [target], LEG_SPEED));
      const ok = actor.fly?.([target], { speed: LEG_SPEED, onDone: () => { a.arrived++; } });
      if (!ok) { actor.root.position.copy(target); a.arrived++; }
    });
  }
  function startWrap() {
    const a = action; a.phase = 'wrap'; a.age = 0; a.trail = []; a.trailAge = 0; a.b0 = noseFrame(members('pteranodon')[1]); a.arrived = 0; a.guard = 0;
    events.push({ type: 'rope-knots' });
    const steps = Math.round(WRAP.turns * 14);
    members('pteranodon').forEach((actor, i) => {
      const lag = i ? WRAP.behind / WRAP.radius : 0, points = [];
      for (let k = 1; k <= steps; k++) points.push(U.world(...circle(a.theta0 - lag + k / steps * WRAP.turns * Math.PI * 2)));
      a.guard = Math.max(a.guard, flightGuard(actor, points, WRAP.speed));
      const ok = actor.fly?.(points, { speed: WRAP.speed, onDone: () => { a.arrived++; } }); if (!ok) a.arrived++;
    });
  }
  function updateFly(dt) {
    const a = action; a.age += dt; a.legAge += dt;
    if (a.phase === 'approach') { if (!walkers.busy()) { a.phase = 'ready'; a.age = 0; for (const actor of members('pteranodon')) actor.setMotion?.('idle'); } }
    else if (a.phase === 'ready') { if (a.queue > 0) flyLeg(a.done); }
    else if (a.phase === 'leg') {
      if (a.leg === 0) a.lift = Math.min(1, a.lift + dt / (reduced() ? .2 : 1.2)); else a.lift = 1;
      if (a.legAge > a.guard) a.arrived = 2;
      if (a.arrived >= 2) { a.done++; if (a.done >= (a.beats || 3)) startWrap(); else { a.phase = 'ready'; } }
    } else if (a.phase === 'wrap') {
      a.trailAge += dt; if (a.trailAge >= .06 || !a.trail.length) { a.trailAge = 0; a.trail.push(noseFrame(members('pteranodon')[0])); }
      if (a.age > a.guard) a.arrived = 2;
      if (a.arrived >= 2) { a.trail.push(noseFrame(members('pteranodon')[0])); a.phase = 'tie'; a.age = 0; a.tight = 0; events.push({ type: 'rope-taut' });
        // they come down by the tree
        a.landed = 0;
        members('pteranodon').forEach((actor, i) => { const spot = FORMATIONS.rim.pteranodon[i], ground = world(spot[0], spot[1]); actor.land?.(ground, { yaw: facing(spot, [spot[0] + 1, spot[1] + 5]), onDone: () => { a.landed = (a.landed ?? 0) + 1; } }) || (a.landed = 2); });
      }
    } else if (a.phase === 'tie') {
      a.tight = Math.min(1, a.age / (reduced() ? .3 : 1.7)); rope.tighten(a.tight);
      if (a.tight >= 1 && (a.landed ?? 0) >= 2) { a.phase = 'cheer'; a.age = 0; events.push({ type: 'rope-tied' }); for (const actor of members('pteranodon')) { actor.carry?.(false); actor.gesture?.('cheer'); } }
      else if (a.age > 7) { a.landed = 2; }
    } else if (a.phase === 'cheer') {
      faceCamera('pteranodon', dt);
      if (a.age >= (reduced() ? .4 : 1.5)) { const id = a.id; where = 'cliff'; action = null; events.push({ type: 'bridge-complete', id }); }
    }
    ropeFollow();
    rope.swing(time, a.phase === 'leg' || a.phase === 'ready' ? .22 * Math.max(0, 1 - (a.legAge > 2.5 && a.phase === 'ready' ? (a.legAge - 2.5) / 2 : 0)) : 0);
  }

  // ---- climb ----
  // Everyone but the Flugeðlur (they are at the tree) walks the steep path, Mosi first, the rope on their right (the hillside's side) as a handrail; two abreast, the body pitched with the slope.
  const CLIMB_SPEED = 4.8, STRIDE = 2.6;
  function startClimb() {
    walkers.cancelAll(); walkers.resetClock();
    action = { id: 'climb', phase: 'walk', age: 0, steps: 0 };
    events.push({ type: 'climb-start' }); events.push({ type: 'climb-step' });
    let k = 0;
    for (const who of ['mosi', 'triceratops', 'stegosaurus', 'brontosaurus']) {
      const list = who === 'mosi' ? [mosi()] : members(who);
      list.forEach((actor, i) => {
        const lane = who === 'mosi' ? .35 : (i ? -.65 : .8), spot = spotOf('rim', who, i), route = pathRoute(lane);
        actor.clearLook?.();
        walkers.start(actor, [{ to: [route[0], ...route, spot.point], speed: CLIMB_SPEED }], { delay: k * .15, yaw: spot.yaw, pitch: true });
        k += 1;
      });
    }
    return true;
  }
  function updateClimb(dt) {
    const a = action; a.age += dt;
    if (a.phase === 'walk') {
      if (a.age >= (a.steps + 1) * STRIDE) { a.steps++; events.push({ type: 'climb-step' }); }
      if (!walkers.busy()) { a.phase = 'cheer'; a.age = 0; for (const actor of friends()) { actor.setMotion?.('idle'); actor.gesture?.('cheer'); } }
    } else if (a.phase === 'cheer' && a.age >= (reduced() ? .4 : 1.3)) { const id = a.id; where = 'rim'; action = null; events.push({ type: 'bridge-complete', id }); }
  }

  // ---- pull (Task 6) ----
  // The second rope lies coiled on the clifftop behind the rim's places, its fixed end on the ground behind where the line will be (ROPE2, world.js). The Flugeðlur take its free
  // end and fly it in three legs, a wingbeat each: out over the gap to the stone on Sólarsyllan, round the stone's far side, and back over the gap up to the stub near the trunk's
  // top, where they hover while it is knotted (ledge.js tie); then they come down in the line. Meanwhile everyone else walks to the line. The rope draws taut from the line round the
  // stone to the stub, so that a pull from the near side draws the trunk's top toward the stone, away from the pullers. Each tap: everyone leans back and strains, and the trunk
  // tilts a step; the third throws it over (faster and faster, about its root plate, as a tree falls): a thud, dust along it, the camera shakes, and the rope goes slack: it lies
  // on the ground under the line and is drawn along the trunk's side over the gap (slackPath), not hanging into the gap in front of the walk.
  const LINE = { z: ROPE2.from[1], y: .5, tail: ROPE2.from[0] + 1 }, LEAN = { step: .25, pitch: .08, seconds: 1.0 }, FALL_SECONDS = 1.15;
  const STONE = { radius: .64, rise: .9, around: 1.6, fly: 1.7 }, WRAP_DEGREES = [-90, -45, 0, 45, 90];
  const PULL_FLIGHT = 5.8; // (out over the gap and back up to the top: faster than the climb's legs, the way is three times as long)
  const PULLERS = ['brontosaurus', 'triceratops', 'stegosaurus', 'pteranodon', 'mosi'];
  const pullers = () => PULLERS.flatMap(who => (who === 'mosi' ? [mosi()] : members(who)).map((actor, i) => ({ who, i, actor })));
  // a point round the stone at `deg` degrees (0 its far side, +x; -90 its open side, -z), `r` metres from its middle and `rise` over its foot (frame)
  const aroundStone = (deg, r = STONE.radius, rise = STONE.rise) => { const c = U.anchors.stone, a = deg * Math.PI / 180; return V(c.x + Math.cos(a) * r, c.y + rise, c.z + Math.sin(a) * r); };
  // the knot at the stub: a small turn round it, ending on it
  const knotAt = degrees => { const s = trunk.tie(degrees); return [s.clone().add(V(.12, .1, -.04)), s.clone().add(V(0, -.09, -.08)), s.clone().add(V(-.11, .05, -.02)), s]; };
  const droop = d => 1.3 * (d / 10) * Math.min(1, .35 + d / 14);
  const ropeStart = V(ROPE2.from[0], U.groundAt(ROPE2.from[0], ROPE2.from[1]), ROPE2.from[1]);
  const droops = points => points.map((p, k) => droop((k ? points[k - 1] : ropeStart).distanceTo(p)));
  // the rope taut: from where the line starts (behind Mosi) at the height of their mouths, round the stone, to the knot (`back`: how far the line has been pulled back)
  const linePath = (back = 0, degrees = trunk.angle) => [V(LINE.tail - back, U.groundAt(LINE.tail, LINE.z) + LINE.y, LINE.z), ...WRAP_DEGREES.map(d => aroundStone(d)), ...knotAt(degrees)];
  // slack, once the trunk lies: on the ground under the line to the gap's near lip, along the lip to the trunk's foot, drawn taut along the trunk's open side over the gap (close
  // along its bark, half way down it: under the feet of those who walk on it), down to the ground at the far lip, over Sólarsyllan to the stone and round it to the knot at the
  // trunk's top. (Hanging into the gap from the line, it hung in front of the walk, Task 6 fix round 1.)
  function slackPath() {
    const y = (x, z) => U.groundAt(x, z) + .12, near = U.gap.near - .14, far = U.gap.far + .14;
    const side = x => { const { z, y: top } = trunk.deck.at(x), r = trunk.deck.radius(x); return V(x, Math.max(U.rim.y + .1, top - r * .9), z - r - .1); };
    const flank = [U.gap.near + .2, (U.gap.near + U.gap.far) / 2, U.gap.far - .2].map(side), foot = flank[0].z, end = flank.at(-1).z;
    const points = [V(LINE.tail, y(LINE.tail, LINE.z), LINE.z), V(near, y(near, LINE.z), LINE.z), V(near, y(near, foot), foot), ...flank, V(far, y(far, end), end), ...WRAP_DEGREES.map(d => aroundStone(d)), ...knotAt(trunk.fallen)];
    return { points, hang: points.map(() => 0) };
  }
  const flightGoal = (leg, i) => {
    // (B flies a little behind and beside A: the rope runs through her beak to A's)
    const s = trunk.tie(0), by = (p, dx, dy, dz) => p.clone().add(V(i ? dx : 0, i ? dy : 0, i ? dz : 0));
    if (leg === 0) return [by(V(36, 12.2, 3.6), -1.2, -.2, -.4), by(aroundStone(-112, STONE.around, STONE.fly), -1.1, -.15, -.3)];
    if (leg === 1) { const out = []; for (let d = -112 + 28; d <= 100; d += 28) out.push(by(aroundStone(d, STONE.around, STONE.fly), 0, -.1, 0)); return i ? out.map(p => p.clone().add(V(-.2, 0, -.5))).slice(0, -1) : out; }
    return [by(V(44.2, 13.4, 7.4), -1.1, -.2, -.5), by(V(s.x + .25, s.y + .35, s.z - 1.15), -.9, -.3, -.6)];
  };
  function startPull(beats) {
    if (!trunk || !rope2) return false;
    walkers.cancelAll(); walkers.resetClock();
    action = { id: 'pull', phase: 'gather', age: 0, beats: Math.max(0, Math.floor(beats) || 0), given: 0, queue: 0, done: 0, leg: -1, arrived: 0, landed: 0, fixed: [], tight: 0, back: 0, stepAge: 0, lift: 0, legAge: 0, guard: 0 };
    events.push({ type: 'pull-start' });
    rope2.hang(); rope2.show(); trunk.set(0);
    for (const { who, i, actor } of pullers()) {
      if (who === 'pteranodon') continue;
      actor.clearLook?.(); actor.stopGesture?.(); const spot = spotOf('rope', who, i);
      walkers.start(actor, [{ to: [spot.point], speed: 3.6 }], { delay: who === 'mosi' ? .2 : .1 * i, yaw: spot.yaw });
    }
    // the Flugeðlur go to the coil's free end and take it
    members('pteranodon').forEach((actor, i) => {
      actor.clearLook?.(); actor.stopGesture?.(); actor.carry?.(true);
      const end = V(ROPE2.to[0] + (i ? -.9 : .2), U.groundAt(...ROPE2.to) + 1.3 - (i ? .2 : 0), ROPE2.to[1] + (i ? .5 : 0));
      // (the first stands beyond the tree from the coil: she flies out low from under its crown, away from its trunk, before she turns for the coil; straight, a wing
      // went through its trunk; up and out, into its crown and the wall behind it)
      const p = U.local(actor.root.position), behindTree = Math.hypot(p.x - TREE_AT[0], p.z - TREE_AT[1]) < 3 && p.z > TREE_AT[1];
      const away = behindTree ? [U.world(p.x + 2.7, U.rim.y + .8, p.z - 1)] : [], points = [...away, U.world(end.x, end.y + .8, end.z), U.world(end.x, end.y, end.z)];
      action.guard = Math.max(action.guard, flightGuard(actor, points, 3.4));
      const ok = actor.fly?.(points, { speed: 3.4, onDone: () => { action.arrived++; } });
      if (!ok) { actor.root.position.copy(U.world(end.x, end.y, end.z)); action.arrived++; }
    });
    return true;
  }
  function pullLeg(leg) {
    const a = action; a.phase = 'leg'; a.leg = leg; a.arrived = 0; a.legAge = 0; a.guard = 0;
    events.push({ type: 'wing-beat', id: 'pull', index: leg }); if (leg === 0) events.push({ type: 'rope-lift' });
    members('pteranodon').forEach((actor, i) => {
      const points = flightGoal(leg, i).map(p => U.world(p.x, p.y, p.z)), speed = leg === 1 ? 4.2 : PULL_FLIGHT; a.guard = Math.max(a.guard, flightGuard(actor, points, speed));
      const ok = actor.fly?.(points, { speed, onDone: () => { a.arrived++; } });
      if (!ok) { actor.root.position.copy(points.at(-1)); a.arrived++; }
    });
  }
  function pullRope() {
    const a = action, [A, B] = members('pteranodon');
    if (a.phase === 'gather' || a.phase === 'leg') {
      // the free end in A's beak and through B's: the part of the line already laid (round the stone), then the two of them
      if (a.leg === 1) { const c = U.anchors.stone, nose = noseFrame(A), deg = Math.atan2(nose.z - c.z, nose.x - c.x) * 180 / Math.PI; for (const d of WRAP_DEGREES) if (deg >= d - 4 && !a.fixed.some(p => p.deg === d)) { const p = aroundStone(d); p.deg = d; a.fixed.push(p); } }
      if (a.leg >= 2 && a.fixed.length < WRAP_DEGREES.length) for (const d of WRAP_DEGREES) if (!a.fixed.some(p => p.deg === d)) { const p = aroundStone(d); p.deg = d; a.fixed.push(p); }
      const points = [...a.fixed, noseFrame(B), noseFrame(A)];
      rope2.through(points, droops(points), a.lift);
    } else if (a.phase === 'knot') {
      const points = [...a.fixed, ...knotAt(0).slice(0, 1 + Math.min(3, Math.floor(a.age / .45)))];
      rope2.through(points, droops(points));
    } else if (a.phase === 'down' || a.phase === 'ready' || a.phase === 'tug' || a.phase === 'fall') {
      const points = linePath(a.back, trunk.angle), taut = smooth(a.tight), d = droops(points);
      rope2.through(points, d.map(h => h * (1 - taut)));
    } else if (a.phase === 'landed' || a.phase === 'cheer') {
      const { points, hang } = slackPath(), k = smooth(Math.min(1, a.age / .6)), line = linePath(a.back, trunk.fallen), held = line.length - 1, laid = points.length - held;
      // (the line goes slack: the part round the stone and up to the knot stays where it is, and the part from the line to the stone falls from where it ran taut, each point
      // of it from its own place along that span, to where it lies)
      const from = j => j >= laid ? line[j - laid + 1] : line[0].clone().lerp(line[1], j / laid);
      rope2.through(k >= 1 ? points : points.map((p, j) => from(j).clone().lerp(p, k)), hang.map(h => h * k));
    }
  }
  function updatePull(dt) {
    const a = action; a.age += dt; a.legAge += dt;
    if (a.phase === 'gather') {
      if (a.age > a.guard) a.arrived = 2;
      if (a.arrived >= 2) pullLeg(0);
    } else if (a.phase === 'leg') {
      if (a.leg === 0) a.lift = Math.min(1, a.lift + dt / (reduced() ? .2 : 1.2)); else a.lift = 1;
      if (a.legAge > a.guard) a.arrived = 2;
      if (a.arrived >= 2) {
        if (a.leg < 2) pullLeg(a.leg + 1);
        else { a.phase = 'knot'; a.age = 0; events.push({ type: 'rope-knots' }); }
      }
    } else if (a.phase === 'knot') {
      // they hover at the stub while it is knotted
      members('pteranodon').forEach((actor, i) => { actor.root.position.y += Math.sin(a.age * 6 + i) * .004; });
      if (a.age >= (reduced() ? .4 : 1.7)) {
        a.phase = 'down'; a.age = 0; a.tight = 0; a.landed = 0; events.push({ type: 'rope-taut' });
        members('pteranodon').forEach((actor, i) => { const spot = spotOf('rope', 'pteranodon', i); actor.land?.(spot.point, { yaw: spot.yaw, onDone: () => { a.landed++; } }) || (a.landed++, walkers.place(actor, spot.point, spot.yaw)); });
      }
    } else if (a.phase === 'down') {
      a.tight = Math.min(1, a.age / (reduced() ? .3 : 1.6));
      if (a.tight >= 1 && a.landed >= 2 && !walkers.busy()) {
        a.phase = 'ready'; a.age = 0; a.base = pullers().map(({ actor }) => actor.root.position.clone());
        for (const { actor, who } of pullers()) { if (who === 'pteranodon') actor.carry?.(false); actor.setMotion?.('idle'); actor.lookAt?.(U.world(trunk.tie(0).x, trunk.tie(0).y, trunk.tie(0).z), { weight: .5, maxAngle: 20 }); }
      } else if (a.age > 7) a.landed = 2;
    } else if (a.phase === 'ready') {
      if (a.queue > 0) {
        a.queue--; a.phase = 'tug'; a.stepAge = 0; a.index = a.done; a.from = trunk.steps[a.done]; a.to = trunk.steps[a.done + 1]; a.backFrom = a.back;
        for (const { actor, who } of pullers()) { if (who === 'mosi') stage.mosi?.gesture?.('cheer'); else actor.gesture?.('strain'); }
        fx?.emit?.('dust', U.world(...trunk.roots().toArray()), { count: 6 + 3 * a.done, strength: 1 + .2 * a.done });
        events.push({ type: 'trunk-tilt', id: 'pull', index: a.done });
      }
    } else if (a.phase === 'tug') {
      a.stepAge += dt; const u = clamp(a.stepAge / (reduced() ? .3 : LEAN.seconds), 0, 1), k = smooth(u);
      trunk.set(lerp(a.from, a.to, k)); a.back = lerp(a.backFrom, a.backFrom + LEAN.step, k);
      // everyone leans back as they pull: a step back and the body pitched up a little, which eases off as the step ends
      pullers().forEach(({ actor, who }, j) => { if (who === 'pteranodon' && !a.base) return; const p = a.base[j]; actor.root.position.x = p.x; actor.root.position.z = p.z; const back = U.direction(-1, 0).multiplyScalar(a.back); actor.root.position.add(back.setY(0)); actor.root.rotation.z = LEAN.pitch * Math.sin(Math.PI * u) * (who === 'mosi' ? .6 : 1); });
      if (u >= 1) {
        a.done++; for (const { actor } of pullers()) actor.root.rotation.z = 0;
        if (a.done >= (a.beats || 3)) { a.phase = 'fall'; a.age = 0; a.fallFrom = trunk.angle; }
        else a.phase = 'ready';
      }
    } else if (a.phase === 'fall') {
      // faster and faster, as a tree falls about its foot
      const T = reduced() ? .35 : FALL_SECONDS, u = clamp(a.age / T, 0, 1);
      trunk.set(lerp(a.fallFrom, trunk.fallen, u * u));
      if (u >= 1) {
        a.phase = 'landed'; a.age = 0; trunk.set(trunk.fallen);
        const along = [.25, .5, .8].map(h => U.world(...trunk.point(h * trunk.height).toArray())), top = U.world(...trunk.top().toArray());
        for (const p of along) fx?.emit?.('dust', p, { count: 10, strength: 1.5 }); fx?.emit?.('dust', top, { count: 14, strength: 1.6 }); fx?.emit?.('poof', top, { count: 8, ring: .9 });
        fx?.emit?.('dust', U.world(U.gap.near, U.rim.y, LINE.z + 2), { count: 8, strength: 1.2 });
        stage.director?.shake?.(.2, .5);
        events.push({ type: 'trunk-fall' }); events.push({ type: 'trunk-dust' });
      }
    } else if (a.phase === 'landed') {
      if (a.age >= (reduced() ? .2 : .5)) {
        a.phase = 'cheer'; a.age = 0;
        for (const { actor, who } of pullers()) { actor.clearLook?.(); if (who === 'mosi') stage.mosi?.gesture?.('cheer'); else actor.gesture?.('cheer'); }
      }
    } else if (a.phase === 'cheer') {
      if (a.age >= (reduced() ? .4 : 1.5)) { const id = a.id; where = 'trunk'; action = null; events.push({ type: 'bridge-complete', id }); return; }
    }
    pullRope();
  }

  // ---- walk (Task 6) ----
  // Over the trunk to Sólarsyllan, one behind the other, at level 1's crossing pace (CROSS.speed 3.6 m/s, the owner's): each walks past the root plate on its open side, steps
  // up the trunk's side slanting in along it (`up`: it is on the bark where the trunk leaves the near rim, and it turns along it only once its hind part is past the roots),
  // walks along its top over the gap, steps down off its top end straight on (`off`: it turns for its place only when its hind part is off the bark too), and goes to its
  // place there. The Þórseðlur go first, Mosi last; each starts when the one before is far enough ahead on the trunk (their lengths: BODY). The Flugeðlur glide over.
  // Footsteps on the wood while anyone is on it. The walk ends when everyone is in place.
  // (The field each walks on is the bark's own top widened by the body's width, see trunkSurface, kept under the body as it turns. With the root plate in it, a body near
  // the roots was lifted 0.4 m off the rim 2 m before the trunk and rose over the deck as its tail passed the roots, a Þórseðla standing up in the air: the plate is left
  // out, and the ways keep every body's hind part wide of it instead. Turning off the trunk sideways lifted the hind part over its end: they walk off straight.)
  const WALK = { ground: 3.8, deck: 3.6, up: [[39.7, 6.75], [40.3, 7.3], [41.2, 8.15], [41.95, 8.85], [42.6, 9.12]], deckFrom: 43.0, deckTo: 45.9, off: [[46.9, 9.2], [48.4, 9.15]],
    via: [51.0, 7.2], margin: .3, slope: 1.0, plate: 39.6, end: .15, bark: 39.7, fly: 5.0 };
  const BODY = { mosi: [.8, .8], triceratops: [1.0, .9], stegosaurus: [1.3, 1.0], brontosaurus: [2.3, 1.4] }; // metres behind and ahead of its root
  // (how far each one's skin reaches either side of its line, in its lowest half metre: measured from the skins as they stand, and a little more)
  const HALF = { mosi: .69, triceratops: .74, stegosaurus: .5, brontosaurus: .6 };
  const WALK_ORDER = [['brontosaurus', 0], ['brontosaurus', 1], ['triceratops', 0], ['triceratops', 1], ['stegosaurus', 0], ['stegosaurus', 1], ['mosi', 0]];
  /** The lying trunk as a friend `reach` wide either side of its line walks on it (walkers.js `surface`, the scene's coordinates): the bark's top widened by that reach, its sides
   * falling away WALK.slope metres a metre down to the ground (ledge.js cover: a body steps up its side toes first, and nothing of it is in the bark; the root plate is left
   * out, WALK.plate), and the ground round it, the gap beside it as level as the rims (a body on its way to the trunk reaches its toes out ahead of it: over the gap they would
   * pitch it nose down and lift it off the rim). Past its top end the bark is widened by WALK.end only, so that a body stepping off walks down off its end, not off a deck
   * that goes on in the air for a body's width. */
  function trunkSurface(reach) {
    const v = V(0, 0, 0), cover = trunk.cover(reach, WALK.slope, WALK.plate), end = trunk.cover(Math.min(reach, WALK.end), WALK.slope, WALK.plate);
    return (x, z) => {
      const p = U.local(v.set(x, 0, z)), ground = p.x > U.gap.near - .2 && p.x < U.gap.far + .2 ? U.rim.y : U.heightAt(x, z), h = (p.x > WALK.deckTo ? end : cover)(p.x, p.z);
      return h === null ? ground : Math.max(ground, h);
    };
  }
  // A walker's body over that field where it is now, along the way it faces (its own walk keeps it over the field along its way: as it turns onto the trunk and off it, the
  // way behind it is not where its hind part is): the root rises as far as that needs too.
  function keepOver(actor, surface) {
    const root = actor.root, yaw = root.rotation.y, fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const body = walkers.bodyOn(actor, d => { const q = V(root.position.x + fx * d, 0, root.position.z + fz * d); q.y = walkers.rootY(actor, surface(q.x, q.z)); return q; });
    walkers.settle(body, root.rotation.z);
  }
  function startWalk() {
    if (!trunk || trunk.angle < trunk.fallen - .5) return false;
    walkers.cancelAll(); walkers.resetClock();
    const surfaces = Object.fromEntries(Object.entries(HALF).map(([who, reach]) => [who, trunkSurface(reach)]));
    action = { id: 'walk', phase: 'walk', age: 0, landed: 0, stepAge: 0, arrived: 0, surfaces, times: [], walked: null };
    events.push({ type: 'walk-start' });
    const deck = trunk.line(WALK.deckFrom, WALK.deckTo, .5).map(p => U.world(p.x, p.y, p.z));
    let hop = -Infinity, before = null;
    for (const [who, i] of WALK_ORDER) {
      const actor = who === 'mosi' ? mosi() : members(who)[i], spot = spotOf('sun', who, i), [back, front] = BODY[who], surface = surfaces[who];
      // (each point of the way up and off as high as this one's field there: the way's own rise is then the walk's, and its length the length walked)
      const onField = ([x, z]) => { const p = world(x, z); p.y = surface(p.x, p.z); return p; }, [on, ...up] = WALK.up.map(onField), off = WALK.off.map(onField);
      actor.clearLook?.(); actor.stopGesture?.();
      const reach = Math.hypot(on.x - actor.root.position.x, on.z - actor.root.position.z) / WALK.deck;
      const at = before ? Math.max(hop + (BODY[before][0] + front + WALK.margin) / WALK.deck, reach) : reach, delay = Math.max(0, at - reach);
      hop = at; before = who; void back;
      const end = spot.frame[1] < 6.5 ? [world(...WALK.via), spot.point] : [spot.point];
      // (when it should be in its place, as the ways are long and the paces set: the report's walk, beside when it was)
      const length = points => points.reduce((sum, p, k) => k ? sum + p.distanceTo(points[k - 1]) : 0, 0), name = who + i;
      const expect = at + length([on, ...up, ...deck, ...off]) / WALK.deck + length([off.at(-1), ...end]) / WALK.ground;
      // (to the trunk, up it, over it and off it in one way: where one way ends and the next starts, the toes are reached out along the last and then along the next, and a
      // body that came to the trunk's side with its toes on the ground had them on its side the moment after, its root up 0.4 m at once)
      walkers.start(actor, [{ to: [on, ...up, ...deck, ...off], speed: WALK.deck, ground: false, surface }, { to: end, speed: WALK.ground }],
        { delay, yaw: spot.yaw, pitch: true, onDone: () => { if (action) { action.arrived++; action.times.push(`${name} ${action.age.toFixed(2)}/${expect.toFixed(2)}`); } } });
    }
    // the Flugeðlur glide over, high over the trunk, and come down at their places (the walk ends when they are down too: at 6.4 and 6.1 m/s, flapping, they were quick
    // beside the walk; gliding at 5 they land as Mosi comes to his place)
    members('pteranodon').forEach((actor, i) => {
      actor.carry?.(false);
      const spot = spotOf('sun', 'pteranodon', i), points = [U.world(33 + i, 12.4, 5.6 + i), U.world(43.5, 13.2, 8 + i * 1.4), U.world(spot.frame[0] - 2, 11.2, spot.frame[1])];
      const landed = () => { if (action) { action.landed++; action.times.push(`pteranodon${i} ${action.age.toFixed(2)}`); } };
      const ok = actor.fly?.(points, { speed: WALK.fly - i * .2, glide: true, onDone: () => { actor.land?.(spot.point, { yaw: spot.yaw, onDone: landed }) || landed(); } });
      if (!ok) { walkers.place(actor, spot.point, spot.yaw); action.landed++; }
    });
    return true;
  }
  function updateWalk(dt) {
    const a = action; a.age += dt; a.stepAge += dt;
    if (a.phase === 'walk') {
      for (const [who, i] of WALK_ORDER) { const actor = who === 'mosi' ? mosi() : members(who)[i]; if (actor && walkers.isWalking(actor)) keepOver(actor, a.surfaces[who]); }
      // the wood under their feet: a step every third of a second while anyone is on the trunk (the nearest to the middle of the gap says where it is heard)
      if (a.stepAge >= .32) {
        const on = [...members('brontosaurus'), ...members('triceratops'), ...members('stegosaurus'), mosi()].map(actor => ({ actor, p: U.local(actor.root.position) })).filter(({ p }) => p.x > WALK.bark && p.x < WALK.deckTo + .3 && p.y > U.rim.y + .4);
        if (on.length) { a.stepAge = 0; events.push({ type: 'footstep', surface: 'wood', pan: 0 }); }
      }
      if (a.arrived >= WALK_ORDER.length && a.landed >= 2) { a.phase = 'cheer'; a.walked = +a.age.toFixed(2); a.age = 0; for (const actor of friends()) { actor.setMotion?.('idle'); actor.gesture?.('cheer'); } stage.mosi?.gesture?.('cheer'); }
      else if (a.age > 20) a.landed = 2;
    } else if (a.phase === 'cheer' && a.age >= (reduced() ? .4 : 1.3)) { const id = a.id; where = 'sun'; action = null; events.push({ type: 'bridge-complete', id }); }
  }

  // ---- the wrong friends' goes at the ledge and at the cliff ----
  // A wrong pair walks from where it stands to the obstacle, has its funny go (gestures.js FAIL_TRIES; the roots' moves and the stars, the dust and the sounds are here), and walks back.
  // `startFail` gives the scene the times it paces its cuts by, like the mover's goes at the tunnel and the rocks.
  const GOES = {
    'ledge:triceratops': { spots: () => [[.55, -1.15], [.55, 1.15]], events: [[.5, 'dust'], [1.05, 'stars']] },
    'ledge:stegosaurus': { spots: () => [[.35, -1.2], [.35, 1.2]], events: [[1.0, 'dust'], [2.25, 'plop']] },
    'ledge:pteranodon': { spots: () => [[.2, -1.0], [.2, 1.0]], flight: true, seconds: 6.6 },
    'cliff:brontosaurus': { spots: () => [[7.0, -.9], [7.1, .9]], events: [[.5, 'throw'], [2.2, 'rope-lands']], rope: true },
    'cliff:triceratops': { spots: () => [routeFrame(.8, 0), routeFrame(-.55, 0)], events: [[1.55, 'dust'], [2.05, 'dust'], [2.75, 'stars']], path: { to: 3.6, up: [0, 1.55], down: [1.9, 2.55] }, rope: true },
    'cliff:stegosaurus': { spots: () => [routeFrame(.8, 0), routeFrame(-.55, 0)], events: [[1.8, 'slip'], [2.85, 'stars']], path: { to: 4.8, up: [0, 1.75], down: [1.8, 2.5] } },
  };
  // a point of the path's middle line `lane` metres to its right, `s` metres from its start, in the frame: [x, z]
  function routeFrame(lane, s) {
    let walked = 0;
    for (let k = 1; k < wayFrame.length; k++) {
      const a = wayFrame[k - 1], b = wayFrame[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (walked + len >= s || k === wayFrame.length - 1) { const t = Math.min(1, Math.max(0, (s - walked) / len)), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len; return [lerp(a[0], b[0], t) - dz * lane, lerp(a[1], b[1], t) + dx * lane]; }
      walked += len;
    }
    return [wayFrame[0][0], wayFrame[0][1]];
  }
  const headsOf = species => members(species).map(actor => actor.getNosePosition());
  // How much lower than when the go `a` began a friend's head and tail are now, in metres in its own frame (its head, jaw and tail bones; the lowest of them that went down).
  const DIPPING = /^(Head|Jaw|Tail\d*)$/, dipAt = new THREE.Vector3();
  function dipOf(a, actor, i) {
    const bones = (a.dipBones ??= [])[i] ??= (() => { const list = []; (actor.model ?? actor.root).traverse(b => { if (b.isBone && DIPPING.test(b.name)) list.push(b); }); return list; })();
    actor.root.updateMatrixWorld(true);
    const ys = bones.map(b => actor.root.worldToLocal(b.getWorldPosition(dipAt)).y * actor.root.scale.y), from = (a.dipFrom ??= [])[i] ??= ys;
    return Math.max(0, ...ys.map((y, k) => from[k] - y));
  }
  function startFail(species, target, { qa = false } = {}) {
    const key = `${target}:${species}`, go = GOES[key];
    if (action || !go || !GESTURES[FAIL_TRIES_OF[key]]) return null;
    walkers.cancelAll(); walkers.resetClock();
    const formation = target === 'ledge' ? 'floor' : 'terrace', spots = go.spots(), list = members(species);
    // (the cliff's goes start at the foot of the path; the others in front of the obstacle)
    const run = Math.max(...list.map((actor, i) => { const p = world(...spots[i]); return Math.hypot(p.x - actor.root.position.x, p.z - actor.root.position.z) / 3.4; })) + .25;
    const duration = go.seconds ?? GESTURES[FAIL_TRIES_OF[key]].duration + .3;
    action = { id: 'fail', species, target, key, go, phase: 'run', age: 0, run, duration, spots, formation, fired: new Set(), qa, flightStep: null };
    stage.idle?.settle?.();
    list.forEach((actor, i) => {
      actor.clearLook?.(); actor.stopGesture?.(); actor.setMotion?.('idle');
      const spot = spots[i], yaw = go.path ? U.yawOf(...pathDirection(spot)) : forward(0);
      walkers.start(actor, [{ to: [world(...spot)], speed: 3.4 }], { yaw, pitch: Boolean(go.path) });
    });
    return { run, attempt: duration, back: run, total: run * 2 + duration, yaw: forward(0) };
  }
  const pathDirection = spot => { const a = routeFrame(0, 0), b = routeFrame(0, 1.2); void spot; return [b[0] - a[0], b[1] - a[1]]; };
  const FAIL_TRIES_OF = FAIL_TRIES;
  function failEvent(a, what) {
    const heads = headsOf(a.species), at = p => p.clone().add(V(0, .45, 0));
    if (what === 'dust') { for (const p of heads) fx?.emit?.('dust', p.clone().setY(p.y - .6), { count: 5 }); events.push({ type: 'footstep', surface: 'soil', pan: 0 }); }
    else if (what === 'stars') for (const p of heads) fx?.emit?.('stars', at(p), { count: 7 });
    else if (what === 'plop') { for (const actor of members(a.species)) { fx?.emit?.('poof', actor.root.position, { count: 7, ring: .7 }); fx?.emit?.('dust', actor.root.position, { count: 6 }); } for (const p of heads) fx?.emit?.('stars', at(p), { count: 6 }); stage.director?.shake?.(.07, .3); events.push({ type: 'fail-bump', species: a.species }); }
    else if (what === 'throw') { a.throwAt = a.age; events.push({ type: 'fail-rope', species: a.species }); }
    else if (what === 'rope-lands') { for (const p of heads) { fx?.emit?.('stars', at(p), { count: 9 }); fx?.emit?.('poof', p, { count: 4, ring: .4 }); } stage.director?.shake?.(.08, .3); events.push({ type: 'fail-bump', species: a.species }); a.landedAt = a.age; }
    else if (what === 'slip') { for (const actor of members(a.species)) fx?.emit?.('dust', actor.root.position, { count: 8, strength: 1.3 }); events.push({ type: 'fail-slip', species: a.species }); }
  }
  function ropeInMouth(lift = 1) { const [A] = members(action.species), tip = noseFrame(A); rope.carry(tip, tip, lift); }
  function updateFail(dt) {
    const a = action; a.age += dt;
    const list = members(a.species);
    if (a.phase === 'run' || a.phase === 'back') {
      if (!walkers.busy()) {
        if (a.phase === 'back') { const { species, target } = a; for (const actor of list) { actor.setMotion?.('idle'); actor.root.rotation.z = 0; } action = null; events.push({ type: 'fail-done', species, target }); return; }
        a.phase = 'try'; a.age = 0; a.base = list.map(actor => actor.root.position.clone());
        if (a.go.flight) { startDangle(a); return; }
        for (const actor of list) actor.gesture?.(FAIL_TRIES_OF[a.key]);
        if (a.go.rope && a.key === 'cliff:brontosaurus') { a.throwAt = null; }
      }
      return;
    }
    // the try
    for (const [at, what] of a.go.events ?? []) if (a.age >= at && !a.fired.has(`${at}:${what}`)) { a.fired.add(`${at}:${what}`); failEvent(a, what); }
    if (a.go.flight) { updateDangle(a, dt); return; }
    // the roots' moves along the path (the Þríhyrna's hops and tumble, the Kambeðla's climb and slide): metres from the start of the path
    if (a.go.path) {
      const { to, up, down } = a.go.path;
      const s = a.age < up[1] ? to * smooth((a.age - up[0]) / (up[1] - up[0])) : to * (1 - smooth((a.age - down[0]) / (down[1] - down[0])));
      // (the body is pitched along the line from the ground under its heels to under its toes, and rises until no part of its underside is within 8 cm of the ground:
      // walkers.js bodyOn and settle. The Þríhyrna's try's leap and slip take its head and tail lower than it stands, so it rises as much more as they are lower than when
      // its go began (dipOf); a fixed 18 cm lifted all of it, the whole go. Pitched from one point 0.6 m ahead (the Þríhyrna's by 80 % of that) and standing on its root,
      // the tails went into the flat behind the path's foot and the Þríhyrna's head into the path ahead, veggir)
      list.forEach((actor, i) => {
        const lane = i ? -.55 : .8, along = Math.max(0, s), [x, z] = routeFrame(lane, along), p = world(x, z);
        const body = walkers.bodyOn(actor, d => { const [bx, bz] = routeFrame(lane, along + d), q = world(bx, bz); q.y = walkers.rootY(actor, q.y); return q; });
        actor.root.position.set(p.x, walkers.rootY(actor, p.y), p.z); actor.root.rotation.z = body.pitch; walkers.settle(body, body.pitch, .08 + (a.species === 'triceratops' ? dipOf(a, actor, i) : 0));
      });
      if (a.key === 'cliff:triceratops') ropeInMouth(Math.min(1, a.age / .4));
    }
    if (a.key === 'cliff:brontosaurus') {
      // the rope: in her mouth, then thrown up (it goes up and a little forward and comes straight down on her head), then it lies there
      const [A] = list;
      if (a.throwAt === null || a.throwAt === undefined) ropeInMouth(Math.min(1, a.age / .4));
      else {
        const t = a.age - a.throwAt, T = 1.65, start = a.throwFrom ??= noseFrame(A), apex = 6.2, u = Math.min(1, t / T);
        const tip = start.clone(); tip.y = start.y + apex * 4 * u * (1 - u); tip.x += 1.6 * Math.sin(Math.PI * u);
        if (u < 1) rope.carry(tip, tip, 1); else if (a.landedAt !== undefined && a.age - a.landedAt > .5) { rope.hang(); }
      }
    }
    if (a.age >= a.duration) { a.phase = 'back'; a.age = 0; rope.hang(); walkers.resetClock(); list.forEach((actor, i) => { actor.root.rotation.z = 0; walkers.start(actor, [{ to: [spotOf(a.formation, a.species, i).point], speed: 3.4 }], { yaw: spotOf(a.formation, a.species, i).yaw }); }); }
  }
  // The Flugeðlur at the ledge: up to the slab's edge, they take hold and hang there (the slab does not move: it is too heavy), kicking; then they let go and drop back to the floor.
  function startDangle(a) {
    a.step = 'up'; a.arrived = 0; a.wait = 0; a.guard = 0;
    members('pteranodon').forEach((actor, i) => {
      // (they hang 1.05 m out from the slab's edge: at 0.6 m a tail and at 0.85 m a head went into its end as she kicked; the second, the farther from the camera, hangs
      // 0.6 m further out and 0.45 m lower, where the first and the slab's end do not hide her, veggir)
      const edge = U.slab.under(U.slab.length - .5, i ? .8 : -.8), hang = U.world(edge.x - 1.05 - (i ? .6 : 0), edge.y - 1.0 - (i ? .45 : 0), edge.z);
      a.hang = a.hang ?? []; a.hang[i] = hang.clone(); a.guard = Math.max(a.guard, flightGuard(actor, [hang], 3.1));
      const ok = actor.fly?.([hang], { speed: 3.1, onDone: () => { a.arrived++; } }); if (!ok) { a.arrived++; actor.root.position.copy(hang); }
    });
  }
  function updateDangle(a, dt) {
    const list = members('pteranodon');
    a.wait += dt;
    if (a.step === 'up' && a.wait > a.guard) a.arrived = 2;
    if (a.step === 'up' && a.arrived >= 2) { a.step = 'dangle'; a.wait = 0; for (const actor of list) actor.gesture?.('fail-ledge-pteranodon'); }
    else if (a.step === 'dangle') {
      list.forEach((actor, i) => { actor.root.position.copy(a.hang[i]); actor.root.position.y += Math.sin(a.wait * 7 + i) * .06 - .05 * smooth(a.wait / 1.2); });
      if (a.wait >= 2.0) { a.step = 'fall'; a.wait = 0; a.v = 0; for (const actor of list) { actor.cancelFlight?.(); actor.setMotion?.('idle'); } }
    } else if (a.step === 'fall') {
      a.v += 9.8 * dt; let down = 0;
      list.forEach((actor, i) => { const ground = U.groundAt(...U.local(actor.root.position).toArray().filter((_, k) => k !== 1)) + .04; actor.root.position.y = Math.max(ground, actor.root.position.y - a.v * dt); if (actor.root.position.y <= ground + 1e-3) down++; });
      if (down >= 2) { a.step = 'oops'; a.wait = 0; for (const actor of list) { fx?.emit?.('poof', actor.root.position, { count: 7, ring: .7 }); fx?.emit?.('dust', actor.root.position, { count: 5 }); actor.gesture?.('oops'); } for (const p of headsOf('pteranodon')) fx?.emit?.('stars', p.clone().add(V(0, .4, 0)), { count: 7 }); events.push({ type: 'fail-bump', species: 'pteranodon' }); }
    } else if (a.step === 'oops' && a.wait >= 1.2) {
      a.phase = 'back'; a.age = 0; walkers.resetClock();
      list.forEach((actor, i) => { const spot = spotOf(a.formation, 'pteranodon', i); walkers.start(actor, [{ to: [spot.point], speed: 3.4 }], { yaw: spot.yaw }); });
    }
  }

  // ---- the API ----
  function update(dt) {
    if (!(dt > 0)) return;
    time += dt; walkers.update(dt, reduced());
    if (!action) return;
    if (action.id === 'through') updateThrough(dt);
    else if (action.id === 'reach') updateReach(dt);
    else if (action.id === 'fly') updateFly(dt);
    else if (action.id === 'climb') updateClimb(dt);
    else if (action.id === 'pull') updatePull(dt);
    else if (action.id === 'walk') updateWalk(dt);
    else if (action.id === 'fail') updateFail(dt);
  }
  return {
    startFail,
    start(id, { beats = 3 } = {}) {
      if (action) return false;
      if (id === 'through') { startThrough(); return true; }
      if (id === 'reach') return startReach(beats);
      if (id === 'fly') return startFly(beats);
      if (id === 'climb') return startClimb();
      if (id === 'pull') return startPull(beats);
      if (id === 'walk') return startWalk();
      return false;
    },
    beat() {
      if (!action || !action.beats || action.given >= action.beats || !['reach', 'fly', 'pull'].includes(action.id)) return false;
      const index = action.given; action.given++; action.queue++; events.push({ type: 'beat', id: action.id, index }); return true;
    },
    waitingBeat: () => action && action.beats && action.phase === 'ready' && action.given < action.beats ? action.given : null,
    phase: () => action?.phase ?? null,
    /** The leg of the pull's flight (0 out over the gap, 1 round the stone, 2 back up to the trunk's top), -1 before it or when no pull runs. */
    leg: () => action?.id === 'pull' ? action.leg : -1,
    busy: () => action !== null,
    id: () => action?.id ?? null,
    cutUpper, where: () => where,
    /** QA only: everyone at the places of a formation ('floor', 'terrace' or 'rim') in the upper gorge, at once. */
    qaPlace(formation = 'floor') {
      setLower(false); U.show(); where = 'upper'; walkers.cancelAll();
      for (const who of ['mosi', ...level.friends]) (who === 'mosi' ? [mosi()] : members(who)).forEach((actor, i) => { const spot = spotOf(formation, who, i); walkers.place(actor, spot.point, spot.yaw, true); actor.walk?.(false); });
      return true;
    }, setWhere(value) { where = value; },
    walkers, update, goes: () => goes,
    spots: formation => ({ mosi: spotOf(formation, 'mosi').point, ...Object.fromEntries(level.friends.map(species => [species, members(species).map((_, i) => spotOf(formation, species, i).point)])) }),
    reset() {
      walkers.cancelAll(); action = null; where = 'glade'; goes = null; time = 0;
      for (const actor of friends()) { actor.root.visible = true; actor.root.rotation.x = actor.root.rotation.z = 0; actor.root.scale.setScalar(1); actor.cancelFlight?.(); actor.carry?.(false); }
      // (a restart while the group is in the tunnel: the through hid Mosi at the end of his way in, and the cut shrank him to pop him out of the exit; the board's reset
      // puts the friends under their leaves, but not Mosi, so he is shown again here at the scale he walked at)
      const m = mosi(); if (m) { m.root.visible = true; m.root.rotation.z = 0; const scale = walkers.baseOf(m); if (scale !== undefined) m.root.scale.setScalar(scale); }
      trunk?.reset();
    },
    debug: () => ({ action: action ? { id: action.id, phase: action.phase, age: +action.age.toFixed(2), given: action.given ?? 0, done: action.done ?? 0, hidden: action.hidden ?? 0, arrived: action.arrived ?? 0, ...(action.id === 'walk' ? { walked: action.walked, times: action.times } : {}) } : null, where, walking: walkers.count() }),
  };
  function reduced() { return reducedNow(); }
}
