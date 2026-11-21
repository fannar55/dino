// Uggeðla í tjörninni, step 2: plays the timeline (show.js) on the pond's cast (chapters/tjorn3d.js makes the stage and hands it
// over). apply(t) puts everything where the timeline says at that second of the show: her (through chapter 2's rig), the small
// fish, the leaping fish and the one in her jaws, the butterfly, the rings and bubbles on the water's own clock, and the drops
// (the game's own glints, as the spray off her tail in chapter 2: world/props/sparkles.js). late() is called when her bones are
// posed for the frame: what rides on her (the butterfly on her snout, the water that lets go of her skin) is put there.
//
// Nothing here depends on how the second was reached but the look's easing and the drops that let go of her skin (each is put
// where her skin is at the frame it is born), so a capture at a second (main.js steps the scene there) shows what playing shows.
import * as THREE from 'three';
import { glints } from '../../world/props/sparkles.js';
import { seededRandom } from '../../engine/random.js';
import { MOUTH, THROAT } from '../kafli2-uggedla.js';
import { BUTTERFLY, FROG, LILIES, under } from './keys.js';
import {
  LENGTH, GRAVITY, JUMP, FISH, BUBBLE, BUBBLES, RINGS, SPLASHES, RUNOFF, DROPS, FLIGHT, BUTTERFLY_TIMES,
  herAt, jumperAt, fishAt, butterflyAt, smooth,
} from './show.js';

const RING_LIFE = 2.6; // s (world/props/water.js)
const RING_SLOTS = 6; // of the water's eight: the first two are its own faint ones
const DROP = { size: 0.2, life: 1.7, colour: '#eefbfd' }; // metres across at the game's size (its glow: the bright heart is a third of it, a millimetre on the table)
const DROP_LOOK = { glow: 1, falloff: 3.2, star: 0, twinkle: 0, rim: 1, vary: 1, core: '#ffffff', blending: THREE.AdditiveBlending }; // chapter 2's spray
const FLAP = { mid: 0.85, swing: 0.3, pace: 1.2 }; // the butterfly's wings at rest: radians up from flat, opening and closing
const AHEAD = [0, 4.2, 26]; // where she looks while the butterfly sits on her snout: at the viewer and level, so her snout lies in full view
const SLIDE = 0.14; // s: the fish from where her jaws shut on it into them (chapter 2's catch: 0.12)
const GULP = 0.35; // s: the fish down her throat, before JUMP.gulp (chapter 2's)
// Splash drops stay on the page: none is thrown where its picture (either eye's) would leave these bounds (cm from the page's
// middle: a 10 inch page's 4 % margins in its narrower shape each way, less a drop's own reach)
const DROP_PAGE = { x: 9.1, z: 5.95 };
const rad = d => (d * Math.PI) / 180;
const Y = new THREE.Vector3(0, 1, 0);

export function createShow({ S, LEVEL, V, world, her, rig, tip, cast, snout, flowerTop, frogSeat, stage, ripples, clock, bubbles, mostBubbles, eyePoint, strikePoint, skin, part, view }) {
  const state = { t: 0, part: null, look: null, heldFish: false, jumper: false, onSnout: false, flying: false, drops: 0 };
  const lookPoint = new THREE.Vector3();
  const looks = Object.fromEntries(['eye', 'butterfly'].map(name => [name, out => out.copy(lookPoint)])); // one a kind: a new one comes with a blink (engine/actor.js)
  const lily = flowerTop(LILIES[BUTTERFLY.lily]);
  const jumperPoint = new THREE.Vector3(), butterflyPoint = new THREE.Vector3().copy(lily);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), seat = new THREE.Vector3(), seatUp = new THREE.Vector3(), up = new THREE.Vector3();
  const left = { known: false, seat: new THREE.Vector3(), up: new THREE.Vector3() }; // her snout as it was when the butterfly lifted off it
  const LIMITS = { eye: { maxAngle: 60, maxPitch: 40 }, butterfly: { maxAngle: 60, maxPitch: 70 } }; // (her look is counted from her body's own way, tipped nose up)
  // the fish as it is the moment her jaws shut on it (its holder's place in the world), and as it lies in her jaws and at her throat
  // (in her Head bone's frame): it goes from the one into the other, and down
  const head = rig.bones.Head;
  const taken = new THREE.Matrix4(), toHead = new THREE.Matrix4();
  {
    const j = jumperAt(JUMP.take - 1e-6);
    cast.jumper.show(V(...j.at), j.heading, JUMP.size * S, { pitch: j.pitch, beat: j.beat });
    cast.jumper.group.updateWorldMatrix(true, false);
    taken.copy(cast.jumper.group.matrixWorld);
    cast.jumper.hide();
  }
  // Chapter 2 holds a fish along her snout, its nose in her mouth (she is seen from the side there). Here she faces the viewer, and
  // a fish along her snout would show him its tail's end only: she holds it ACROSS her jaws, just inside the tip of her snout, its
  // nose to her right, the way it flew, so it shows its side; her jaws stay open by its height (show.js JAW). It turns nose in as
  // it goes down.
  rig.fish.hold(JUMP.size * S);
  const along = { q: rig.fish.group.quaternion.clone(), s: rig.fish.group.scale.clone() };
  const fishMesh = rig.fish.group.children[0];
  fishMesh.geometry.computeBoundingBox();
  const fishMiddle = ((fishMesh.geometry.boundingBox.min.y + fishMesh.geometry.boundingBox.max.y) / 2) * along.s.y; // its middle over its origin
  const jaws = { p: new THREE.Vector3(MOUTH.x + 0.08, MOUTH.y - 0.1 - fishMiddle, 0), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), s: along.s };
  const wag = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0);
  rig.fish.hide();
  const from = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };

  // ---- the drops: one set for the whole show; each drop is a thrown thing, where it is at a second worked out from its start ----
  const set = glints(world, { count: DROPS, life: DROP.life, spread: 0, fall: 0, size: DROP.size, colour: DROP.colour, seed: 'tjorn drops', look: DROP_LOOK });
  set.points.name = 'Tjörn drops';
  set.birth.fill(1e6);
  {
    const size = new THREE.Vector2();
    set.points.onBeforeRender = (renderer, _scene, cam) => { // at the table's size whatever camera draws them (the eyes' are not ordinary ones)
      renderer.getDrawingBufferSize(size);
      set.uniforms.uPixelScale.value = (size.y * cam.projectionMatrix.elements[5]) / 2;
    };
  }
  const random = seededRandom('tjorn splashes');
  const drops = []; // { born, from: [x, y, z] cm or null (her skin's, taken when it is born), v: [x, y, z] cm/s, vertex }
  const eyesCm = [stage.eyes.left, stage.eyes.right].map(e => ({ x: e.x / S, y: e.y / S, z: e.z / S }));
  /** Whether a thrown drop's picture stays on the page all its way, for both eyes. */
  const staysOnPage = (p, v) => {
    const lands = (v[1] + Math.sqrt(v[1] * v[1] + 2 * GRAVITY * p[1])) / GRAVITY;
    for (let k = 0; k <= 10; k++) {
      const age = (lands * k) / 10;
      const x = p[0] + v[0] * age, y = Math.max(0, p[1] + v[1] * age - 0.5 * GRAVITY * age * age), z = p[2] + v[2] * age;
      for (const e of eyesCm) {
        const u = e.y / (e.y - y);
        if (Math.abs(e.x + (x - e.x) * u) > DROP_PAGE.x || Math.abs(e.z + (z - e.z) * u) > DROP_PAGE.z) return false;
      }
    }
    return true;
  };
  for (const [t, x, z, count, [slow, fast], [least, most], round] of SPLASHES) {
    for (let i = 0; i < count; i++) {
      let p = null, v = null;
      for (let tries = 0; tries < 60; tries++) { // (each try draws anew; the same drops every time)
        const turn = random() * 2 * Math.PI, far = round * Math.sqrt(random()), out = least + (most - least) * random();
        p = [x + far * Math.cos(turn), 0, z + far * Math.sin(turn) * 0.8];
        v = [out * Math.cos(turn), slow + (fast - slow) * random() ** 1.4, out * Math.sin(turn)];
        if (staysOnPage(p, v)) break;
        p = null;
      }
      drops.push({ born: p ? t + 0.12 * random() : Infinity, from: p ?? [x, 0, z], v: v ?? [0, 0, 0] });
    }
  }
  // her skin's points that water lets go of: her head, her neck and her chest
  const wet = [];
  for (let i = 0; i < part.length; i++) if (part[i] > 0) wet.push(i);
  for (let i = 0; i < RUNOFF.drops; i++) {
    const turn = random() * 2 * Math.PI;
    drops.push({ born: RUNOFF.from + (RUNOFF.to - RUNOFF.from) * random() ** 1.8, from: null, vertex: wet[Math.floor(random() * wet.length)], v: [0.5 * Math.cos(turn), -0.4 * random(), 0.5 * Math.sin(turn)] });
  }
  const live = []; // the drops in the air: [x, y, z] in the world, for the measure
  function placeDrops(t) {
    live.length = 0;
    drops.forEach((drop, i) => {
      const age = t - drop.born;
      let alive = age >= 0 && age < DROP.life && Boolean(drop.from);
      if (alive) {
        const x = drop.from[0] + drop.v[0] * age, y = drop.from[1] + drop.v[1] * age - 0.5 * GRAVITY * age * age, z = drop.from[2] + drop.v[2] * age;
        if (y < 0) alive = false;
        else {
          V(x, y, z, a);
          set.position.set([a.x, a.y, a.z], i * 3);
          live.push(a.x, a.y, a.z);
        }
      }
      set.birth[i] = alive ? drop.born : 1e6;
    });
    set.uniforms.uTime.value = t;
    set.points.geometry.attributes.position.needsUpdate = true;
    set.points.geometry.attributes.birth.needsUpdate = true;
    state.drops = live.length / 3;
  }
  /** The drops that let go of her skin this frame start where her skin is now (those under the water never start). */
  function wetDrops(t) {
    for (const drop of drops) {
      if (drop.vertex === undefined) continue;
      if (t < drop.born) { drop.from = null; drop.tried = false; continue; }
      if (drop.tried) continue;
      drop.tried = true;
      skin.getVertexPosition(drop.vertex, a).applyMatrix4(skin.matrixWorld);
      const y = (a.y - LEVEL) / S;
      drop.from = her.root.visible && y > 0.15 && t - drop.born < 0.2 ? [a.x / S, y, a.z / S] : null;
    }
  }

  // ---- the butterfly in the air: from its lily's flower to her snout (0 to 1) along a curve that lifts off straight up and comes
  // down on her snout along her skin's own way out there, fluttering; its feet's place and its back's way ----
  function flight(u, since, back) {
    // on its way over it comes down where her snout is now; on its way back it left from where her snout was (she sinks away under it)
    if (back && left.known) { seat.copy(left.seat); seatUp.copy(left.up); } else snout.seat(seat, seatUp);
    const k = smooth(u);
    b.copy(lily).addScaledVector(Y, 2.2 * S).lerp(seat, 0.2).setY(lily.y + 2.2 * S);
    c.copy(seat).addScaledVector(seatUp, 1.6 * S).addScaledVector(Y, 0.5 * S);
    const k1 = 1 - k;
    butterflyPoint.set(0, 0, 0).addScaledVector(lily, k1 * k1 * k1).addScaledVector(b, 3 * k1 * k1 * k).addScaledVector(c, 3 * k1 * k * k).addScaledVector(seat, k * k * k);
    const calm = smooth(u / 0.2) * smooth((1 - u) / 0.35) ** 2; // none of the bobbing where it lifts off and sits down: it must not dip into her skin
    d.set(seat.z - lily.z, 0, lily.x - seat.x).normalize(); // sideways to its way
    butterflyPoint.addScaledVector(d, FLIGHT.sway * S * calm * Math.sin(2 * Math.PI * 1.3 * since + 1)).addScaledVector(Y, FLIGHT.flutter * S * calm * Math.sin(2 * Math.PI * 2.3 * since));
    butterflyPoint.y = Math.min(butterflyPoint.y, LEVEL + FLIGHT.high * S);
    return butterflyPoint;
  }
  const turnTo = (from, to, k) => from + ((((to - from) % 360) + 540) % 360 - 180) * k;

  function reset() {
    Object.assign(state, { t: 0, look: null, lookWeight: 0, heldFish: false, jumper: false, onSnout: false, flying: false });
    left.known = false;
    her.lookAt(null);
    rig.fish.hide();
    for (const drop of drops) if (drop.vertex !== undefined) { drop.from = null; drop.tried = false; }
  }

  /** Everything at second `t` of the show (before the actors are moved for the frame). */
  function apply(t) {
    if (t < state.t - 1e-6) reset();
    state.t = t;
    const eye = { x: stage.eyes.mid.x / S, y: stage.eyes.mid.y / S, z: stage.eyes.mid.z / S };

    // the small fish
    view.fish = FISH.map((_, i) => {
      const f = fishAt(i, t);
      const at = under(f.seen, f.depth, eye);
      cast.fish[i]?.show(V(...at), f.heading, f.size * S, { beat: f.beat });
      return { ...f, at };
    });
    if (cast.frog.loaded && !cast.frog.group.visible) cast.frog.show(frogSeat.point, FROG.heading, FROG.length * S);

    // the leaping fish, and the one in her jaws
    const j = jumperAt(t);
    state.jumper = Boolean(j);
    state.air = Boolean(j?.air);
    if (j) {
      V(...j.at, jumperPoint);
      cast.jumper.show(jumperPoint, j.heading, JUMP.size * S, { pitch: j.pitch, beat: j.beat });
    } else cast.jumper.hide();
    // (its tail flexes, less and less; where it is in her jaws, how it gets there and down her throat: late())
    const held = t >= JUMP.take && t < JUMP.gulp;
    if (held) { rig.fish.hold(JUMP.size * S); rig.fish.wriggle(3, 1 - 0.8 * smooth((t - JUMP.take - 0.7) / 0.6)); }
    else if (state.heldFish) rig.fish.hide();
    state.heldFish = held;

    // Uggeðla
    const h = herAt(t);
    her.root.visible = h.there;
    rig.tweens.length = 0;
    Object.assign(rig.v, { sink: h.sink * S, tuck: h.tuck, shiver: 0, yaw: 0, lunge: 0, jaw: h.jaw, strike: h.strike, toss: h.toss, swim: h.swim, curl: 0, life: 0 });
    Object.assign(rig.station, { x: h.at[0] * S, z: h.at[1] * S, heading: h.heading });
    rig.beat = 3.2 * t;
    tip.pitch = h.pitch;
    // where the tip of her snout is put while it leads her head (round the catch)
    if (h.snout) V(...h.snout, strikePoint);
    rig.target = h.snout ? strikePoint : null;
    // what she looks at
    const bf = butterflyAt(t);
    if (h.look === 'eye') lookPoint.copy(eyePoint);
    else if (h.look === 'butterfly') {
      // she watches it come, and as it nears her snout she looks straight ahead, level, and holds still for it; when it has lifted
      // off she looks ahead a moment more (her snout must not swing after it while it is near), then after it
      const near = bf.on === 'over' ? smooth((bf.u - 0.45) / 0.4) : bf.on === 'snout' ? 1 : bf.on === 'back' ? 1 - smooth((bf.u - 0.3) / 0.4) : 0;
      lookPoint.copy(butterflyPoint).lerp(V(...AHEAD, a), near);
    }
    if (h.look !== state.look || h.lookWeight !== state.lookWeight) {
      her.lookAt(h.look ? looks[h.look] : null, { weight: h.lookWeight, ...(LIMITS[h.look] ?? {}) });
      state.look = h.look;
      state.lookWeight = h.lookWeight;
    }

    // the butterfly on its lily (on her snout and in the air it is put when her bones are: late())
    state.onSnout = bf.on === 'snout';
    state.flying = bf.on === 'over' || bf.on === 'back';
    if (cast.butterfly.loaded && bf.on === 'lily') {
      butterflyPoint.copy(lily);
      cast.butterfly.show(lily, BUTTERFLY.heading, BUTTERFLY.span * S, FLAP.mid + FLAP.swing * Math.sin(t * FLAP.pace));
    }

    // the water: the six newest rings that still spread (the timeline's, and one where each burst of bubbles comes up), and the
    // bubbles of the newest bursts, all on the water's own clock
    const now = clock.value;
    const rings = [];
    for (const [at, x, z, strength] of RINGS) if (t >= at && t - at < RING_LIFE) rings.push([at, x, z, strength]);
    for (const [at, x, z] of BUBBLES) { const up = at + BUBBLE.seconds; if (t >= up && t - up < RING_LIFE) rings.push([up, x, z, 0.5]); }
    rings.sort((p, q) => q[0] - p[0]);
    for (let i = 0; i < RING_SLOTS; i++) {
      const ring = rings[i];
      if (ring) ripples[2 + i].set(ring[1] * S, ring[2] * S, now - (t - ring[0]), ring[3]);
      else ripples[2 + i].set(0, 0, -99, 0);
    }
    const { position, aBubble } = bubbles.geometry.attributes;
    const span = BUBBLE.seconds * 1.1 + BUBBLE.each * BUBBLE.apart;
    let n = 0;
    for (let i = BUBBLES.length - 1; i >= 0 && n + BUBBLE.each <= mostBubbles; i--) {
      const [at, x, z, depth] = BUBBLES[i];
      if (t < at || t - at > span) continue;
      for (let k = 0; k < BUBBLE.each; k++, n++) {
        const start = at + k * BUBBLE.apart;
        const odd = Math.abs((Math.sin((i * BUBBLE.each + k) * 12.9898) * 43758.5453) % 1); // each its own, the same every time
        position.setXYZ(n, x * S + 0.3 * Math.sin((i * 7 + k) * 2.4), LEVEL - depth * S, z * S + 0.3 * Math.cos((i * 5 + k) * 1.7));
        aBubble.setXYZW(n, t < start ? 1e9 : now - (t - start), BUBBLE.seconds * (0.9 + 0.2 * odd), depth * S, BUBBLE.size * (0.7 + 0.6 * odd));
      }
    }
    for (; n < mostBubbles; n++) aBubble.setXYZW(n, 1e9, 1, 0, 0);
    position.needsUpdate = true;
    aBubble.needsUpdate = true;

    placeDrops(t);
  }

  /** What rides on her, once her bones are where this frame has them. */
  function late() {
    const t = state.t;
    wetDrops(t);
    if (state.heldFish) {
      const { group } = rig.fish;
      // across her jaws, its ends flapping up and down a little, less and less
      const calms = 1 - 0.8 * smooth((t - JUMP.take - 0.7) / 0.6);
      wag.setFromAxisAngle(X, 0.16 * calms * Math.sin(2 * Math.PI * 3 * t)).multiply(jaws.q);
      if (t < JUMP.take + SLIDE) {
        // from where it was the moment her jaws shut (as her head is now) into them
        head.updateWorldMatrix(true, false);
        toHead.copy(head.matrixWorld).invert().multiply(taken).decompose(from.p, from.q, from.s);
        const k = smooth((t - JUMP.take) / SLIDE);
        group.position.lerpVectors(from.p, jaws.p, k);
        group.quaternion.slerpQuaternions(from.q, wag, k);
        group.scale.lerpVectors(from.s, jaws.s, k);
      } else if (t > JUMP.gulp - GULP) {
        // down her throat: it turns nose in and is gone
        const k = smooth((t - (JUMP.gulp - GULP)) / GULP);
        group.position.lerpVectors(jaws.p, THROAT, k);
        group.quaternion.slerpQuaternions(wag, along.q, smooth(k * 1.6));
        group.scale.copy(jaws.s).multiplyScalar(1 - k);
      } else {
        group.position.copy(jaws.p);
        group.quaternion.copy(wag);
        group.scale.copy(jaws.s);
      }
    }
    if (!cast.butterfly.loaded) return;
    const bf = butterflyAt(t);
    if (bf.on === 'snout') {
      snout.place(FLAP.mid + FLAP.swing * Math.sin(t * FLAP.pace));
      snout.seat(butterflyPoint, seatUp);
      left.seat.copy(butterflyPoint);
      left.up.copy(seatUp);
      left.known = true;
      return;
    }
    if (bf.on !== 'over' && bf.on !== 'back') return;
    const u = bf.on === 'over' ? bf.u : 1 - bf.u; // 0 at the lily, 1 on her snout
    const since = bf.on === 'over' ? t - BUTTERFLY_TIMES.up : t - BUTTERFLY_TIMES.off;
    const point = flight(u, since, bf.on === 'back');
    // its nose along its way, turning to how it sits at either end; its back up, leaning to her skin's way out as it comes down
    const way = (Math.atan2(seat.z - lily.z, seat.x - lily.x) * 180) / Math.PI + (bf.on === 'over' ? 0 : 180);
    const sits = her.heading + 180 + BUTTERFLY.heading;
    const heading = turnTo(turnTo(way, BUTTERFLY.heading, 1 - smooth(u / 0.15)), sits, smooth((u - 0.8) / 0.2));
    up.copy(Y).lerp(seatUp, smooth((u - 0.75) / 0.25)).normalize();
    // its wings go from their slow opening and closing at rest into the beat of flight, and back as it sits down
    const beats = smooth(u / 0.1) * smooth((1 - u) / 0.2);
    const rest = FLAP.mid + FLAP.swing * Math.sin(t * FLAP.pace);
    const flap = rest + beats * (FLAP.mid + (FLAP.swing + 0.3) * Math.sin(2 * Math.PI * FLIGHT.wings * since) - rest);
    cast.butterfly.show(point, heading, BUTTERFLY.span * S, flap, up);
  }

  return { apply, late, reset, state, length: LENGTH, drops: live, butterflyPoint };
}
