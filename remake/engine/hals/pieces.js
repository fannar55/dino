import * as THREE from 'three';
import { createActor } from '../actor.js';
import { createSaddle, ride } from '../riding.js';
import { BOARD } from './rules.js';

// The pieces of "Háls og hali" (spec section 4): the chapter's own characters, small enough to stand on a block, each in a
// lane of its own across the block so two or four share a square side by side. Egill rides Mosi in his saddle (riding.js);
// the friends of a game of two to four are Kambeðla, Slóeðla and Grameðla; against the computer the other piece is a little
// Þórseðla. They hop square by square (a crouch, a hop with a stretch, a squash on landing), climb the stairs at the ends of
// the tiers with small quick hops, ride a Þórseðla's neck where it carries them and slide down her tail.
//
//   const pieces = await createPieces(world, board, { roster: ['egill', 'kambedla'] })
//   pieces.list[i]: { id, name, colour, actor, square, position, place(n), hopTo(n), hopOnto(point), follow(fn), slide(curve),
//                    float(to), wobbleTo(n), cheer(), face(dir), lookAt(point) }
//   pieces.update(dt), pieces.ready, pieces.dispose()
// Every move returns a Promise that settles on the world's clock (the world's tweens), so a paused world holds them.

const CHARACTERS = {
  egill: { name: 'Egill', model: 'mosi', rider: 'egill', length: 8.5, colour: '#79c7a1' },
  kambedla: { name: 'Kambeðla', model: 'stegosaurus', length: 7.0, colour: '#ab85c1' },
  sloedla: { name: 'Slóeðla', model: 'parasaurolophus', length: 7.5, colour: '#6793d0' },
  gramedla: { name: 'Grameðla', model: 'trex', length: 12, colour: '#d69a6e' },
  thorsedla: { name: 'Þórseðla', model: 'brontosaurus', length: 22, colour: '#e9b14d' },
};
export { CHARACTERS as PIECE_CHARACTERS };
const LENGTH = 2.25; // a piece's length nose to tail (m): about a block
const LANES = [[-0.15, 0.55], [0.3, -0.25], [-0.45, 0.05], [0.4, -0.75]]; // x and z on a block, by player
const HOP = { seconds: 0.44, height: 0.62, calm: { seconds: 0.62, height: 0.22 } };
const TOWARD_CAMERA = 24; // degrees a piece turns toward the camera from the way it goes
const url = name => new URL(`../../assets/characters/${name}.glb`, import.meta.url).href;
const V3 = THREE.Vector3;
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));

export async function createPieces(world, board, { roster = ['egill', 'kambedla'] } = {}) {
  const tweens = new Set();
  const tween = (duration, step) => new Promise(resolve => tweens.add({ t: 0, duration: Math.max(0.001, duration), step, resolve }));
  let calm = false;
  const list = await Promise.all(roster.map((id, index) => createPiece(world, board, id, index, { tween, get calm() { return calm; } })));
  return {
    list,
    get calm() { return calm; },
    set calm(value) { calm = Boolean(value); },
    update(dt) {
      for (const tw of [...tweens]) {
        tw.t += dt;
        const t = clamp01(tw.t / tw.duration);
        tw.step(t, dt);
        if (t >= 1) { tweens.delete(tw); tw.resolve(); }
      }
      for (const p of list) p.update(dt);
    },
    dispose() { for (const p of list) p.dispose(); },
  };
}

async function createPiece(world, board, id, index, host) {
  const spec = CHARACTERS[id] ?? CHARACTERS.kambedla;
  const own = Object.create(world);
  own.heightAt = () => 0;
  const scale = LENGTH / spec.length;
  const actor = await createActor(own, { name: `piece-${index}-${id}`, url: url(spec.model), position: [0, 0, 0], heading: 0 });
  actor.root.scale.setScalar(scale);
  let rider = null, saddle = null, riding = null;
  if (spec.rider) {
    rider = await createActor(own, { name: `piece-${index}-${spec.rider}`, url: url(spec.rider), position: [0, 0, 0], heading: 0 });
    rider.root.scale.setScalar(scale);
  }
  const lane = LANES[index % LANES.length];
  const position = new V3();
  const squash = { y: 1, xz: 1 }; // a hop's crouch, stretch and landing squash
  let heading = 0, square = 0, clip = 'idle', lean = 0, roll = 0;
  let follow = null; // a function(out) the piece stands on each frame (a neck it rides)

  const spot = (n, out = new V3()) => board.square(n, out).add(new V3(lane[0], 0, lane[1]));
  const onward = n => (n === 0 ? 1 : Math.floor((n - 1) / BOARD.columns) % 2 ? -1 : 1); // the way the path runs at square n
  const headingFor = dir => (dir >= 0 ? TOWARD_CAMERA : 180 - TOWARD_CAMERA);

  actor.control(() => {
    if (follow) follow(position);
    actor.root.position.copy(position);
    actor.root.rotation.set(0, 0, 0);
    actor.root.rotateY(-THREE.MathUtils.degToRad(heading));
    actor.root.rotateZ(lean);
    actor.root.rotateX(roll);
    actor.root.scale.set(scale * squash.xz, scale * squash.y, scale * squash.xz);
  });
  function play(name, options) {
    if (clip === name) return;
    clip = name;
    actor.play(name, options);
  }

  function place(n) {
    square = n;
    spot(n, position);
    heading = headingFor(onward(n));
    lean = roll = 0;
    follow = null;
    play('idle', { fade: 0.2 });
  }
  place(0);

  // Egill in Mosi's saddle, from the first frame on
  if (rider) {
    actor.update(0);
    saddle = createSaddle(actor);
    saddle.object.visible = true;
    riding = ride(rider, saddle, { settle: 0 });
  }

  /** One hop from where the piece stands to `to` (a Vector3), with `height` metres of arc. */
  function hopArc(to, { seconds, height, turn = true } = {}) {
    const calm = host.calm;
    const s = seconds ?? (calm ? HOP.calm.seconds : HOP.seconds);
    const h = height ?? (calm ? HOP.calm.height : HOP.height);
    const from = position.clone();
    const dx = to.x - from.x;
    if (turn && Math.abs(dx) > 0.05) heading = headingFor(Math.sign(dx));
    play('walk', { fade: 0.12, timeScale: 1.7 });
    const crouch = calm ? 0 : 0.08, air = 0.84;
    return host.tween(s, t => {
      // a crouch (the first 16 %), the arc, a squash on landing (the last 16 %)
      const u = clamp01((t - 0.16) / 0.68);
      const e = smooth(u);
      position.lerpVectors(from, to, e);
      position.y += Math.sin(Math.PI * u) * h + (to.y - from.y) * 0 ;
      if (calm) { squash.y = squash.xz = 1; return; }
      if (t < 0.16) { const c = Math.sin((t / 0.16) * Math.PI / 2); squash.y = 1 - crouch * c; squash.xz = 1 + crouch * 0.5 * c; }
      else if (t < air) { const c = Math.sin(Math.PI * u); squash.y = 1 + 0.06 * c; squash.xz = 1 - 0.03 * c; }
      else { const c = Math.sin(((t - air) / (1 - air)) * Math.PI); squash.y = 1 - 0.1 * c; squash.xz = 1 + 0.05 * c; }
    }).then(() => { squash.y = squash.xz = 1; position.copy(to); });
  }

  /** On to square n: one hop along the tier, or quick little hops up the stairs at a tier's end. */
  async function hopTo(n) {
    const stairs = board.stairs(square) ?? null;
    const goingUp = stairs && stairs.to === n;
    if (goingUp) {
      const steps = 5;
      const out = new V3();
      for (let i = 1; i <= steps; i++) {
        stairs.point(i / steps, out).add(new V3(lane[0] * (1 - Math.sin(Math.PI * i / steps)), 0, lane[1] * 0.6));
        if (i === steps) spot(n, out);
        await hopArc(out.clone(), { seconds: host.calm ? 0.42 : 0.3, height: host.calm ? 0.15 : 0.34 });
      }
    } else {
      await hopArc(spot(n));
    }
    square = n;
    heading = headingFor(onward(n));
  }

  /** A hop onto a point (a neck's top, a tail's start). */
  function hopOnto(point, options = {}) {
    follow = null;
    return hopArc(point, { seconds: host.calm ? 0.8 : 0.6, height: 0.9, ...options });
  }

  /** Stand on a moving point (fn(out) fills it) each frame, until follow(null). */
  function followPoint(fn) {
    follow = fn ? out => fn(out) : null;
    play('idle', { fade: 0.3 });
  }

  /** Slide down a curve (a tail), quicker and quicker, leaning along it. */
  function slide(curve, { seconds = 2.0 } = {}) {
    follow = null;
    play('idle', { fade: 0.2 });
    const tangent = new V3();
    const s = host.calm ? seconds * 1.4 : seconds;
    return host.tween(s, t => {
      const u = t * t * (1.6 - 0.6 * t); // eases in, speeds up, settles just at the end
      curve.getPointAt(Math.min(1, u), position);
      curve.getTangentAt(Math.min(0.999, u), tangent);
      if (Math.abs(tangent.x) > 0.15) heading = headingFor(Math.sign(tangent.x));
      const pitch = Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z));
      lean = host.calm ? 0 : THREE.MathUtils.clamp(pitch, -0.7, 0.7) * Math.sign(Math.cos(THREE.MathUtils.degToRad(heading))) * 0.8;
      roll = host.calm ? 0 : Math.sin(t * 18) * 0.05;
    }).then(() => { lean = roll = 0; });
  }

  /** Carried by fireflies over to square n (floats up, drifts, sets down). */
  function float(n) {
    const from = position.clone(), to = spot(n);
    play('idle', { fade: 0.3 });
    heading = headingFor(Math.sign(to.x - from.x) || 1);
    return host.tween(host.calm ? 2.2 : 1.8, t => {
      const e = smooth(t);
      position.lerpVectors(from, to, e);
      position.y += Math.sin(Math.PI * t) * (host.calm ? 0.6 : 1.6);
      roll = host.calm ? 0 : Math.sin(t * 9) * 0.06;
    }).then(() => { square = n; roll = 0; position.copy(to); heading = headingFor(onward(n)); });
  }

  /** Slipping back through the mud to square n, wobbling. */
  async function wobbleTo(n) {
    const from = position.clone(), to = spot(n);
    play('walk', { fade: 0.2, timeScale: 0.7 });
    await host.tween(host.calm ? 2.0 : 1.6, t => {
      position.lerpVectors(from, to, smooth(t));
      lean = host.calm ? 0 : Math.sin(t * 14) * 0.12;
    });
    lean = 0;
    square = n;
    heading = headingFor(onward(n));
    play('idle', { fade: 0.3 });
  }

  /** A happy bounce on the spot (a win, a ride). */
  async function cheer(times = 3) {
    play('idle', { fade: 0.2 });
    const here = position.clone();
    heading = 90 - 0; // to the camera
    for (let i = 0; i < times; i++) await hopArc(here, { turn: false, height: host.calm ? 0.15 : 0.7, seconds: 0.48 });
    heading = headingFor(onward(square));
  }

  return {
    id, index, name: spec.name, colour: spec.colour, actor, rider,
    get square() { return square; },
    set square(n) { square = n; },
    get position() { return position; },
    spot, place, hopTo, hopOnto, follow: followPoint, slide, float, wobbleTo, cheer,
    face(dir) { heading = headingFor(dir); },
    rest() { play('idle', { fade: 0.3 }); },
    lookAt(point) { actor.lookAt(point, { weight: 0.6, maxAngle: 50, maxPitch: 30 }); },
    update(dt) {
      actor.update(dt);
      rider?.update(dt);
    },
    dispose() { riding?.stop(); actor.dispose(); rider?.dispose(); },
  };
}
