import * as THREE from 'three';
import { createActor } from '../actor.js';
import { whenReady as characterLodsReady } from '../character-lod.js';

// The pawns of "Háls og hali" and the host (spec section 5), on the valley (valley.js):
//   child       Egill on Mosi's back: Mosi hops from stone to stone, Egill sits on him and bounces along
//   thorsedla   Þórseðla's pawn: a little golden statue of her on a round foot, which hops too
//   host        the big Þórseðla herself, walking round the edge of the valley to stay near the pawn she watches
//
//   const pieces = await createPieces(valley)
//   pawn.place(n, { side })              stands on square n at once (side -1 / 0 / 1: shares the stone, to the left or right)
//   pawn.hopTo(n, { side, duration })     one hop onto square n; a Promise that resolves as it lands (pawn.onLand(n) too)
//   pawn.hopAlong([n, ...], options)      hop by hop along squares (options.onStep(n) as each lands)
//   pawn.flyTo(point, { duration, height, square })  a big arc through the air to a point (or a square), landing there
//   pawn.ride(fn)                         its foot follows fn(out) every frame (on a Þórseðla's head); ride(null) stops
//   pawn.slide(curve, { duration })       down a curve (a tail's slideCurve, or a function giving the curve as it is now), faster
//                                         and faster; a Promise that resolves at its end
//   pawn.face(heading), faceToward(point) which way it looks (degrees, actor.js's)
//   pawn.cheer()                          a happy bounce
//   pawn.root                             an Object3D at its foot (the camera follows it), pawn.square, pawn.position
//   host.watch(pawn)                      walks round the edge toward that pawn and looks at it; host.cheer(); host.actor
// pieces.update runs in the valley's frame (valley.addUpdater); pieces.dispose() takes them away.

const MOSI_URL = new URL('../../assets/characters/mosi.glb', import.meta.url).href;
const EGILL_URL = new URL('../../assets/characters/egill.glb', import.meta.url).href;
const THORSEDLA_URL = new URL('../../assets/characters/brontosaurus.glb', import.meta.url).href;

export const PIECES = {
  mosiLength: 2.4, // metres: Mosi as a pawn (8.5 m long in the chapter)
  egillBigger: 1.5, // Egill on his back, this many times his size beside Mosi in the chapter, so a child sees him
  figureLength: 2.1, // the statue, nose to tail
  host: { scale: 0.62, ring: 22.5, speed: 0.7 }, // the host: her size against the real Þórseðla, the circle she walks on, m/s
  side: 0.5, // metres aside when two pawns share a stone
  hop: { duration: 0.5, height: 0.75 },
};

const V3 = THREE.Vector3;
const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));
const UP = new V3(0, 1, 0);

// Egill's seat on Mosi's back, in Mosi's own frame at his real size (engine/riding.js: hips 1.18 m along Mosi from his origin, on
// the top of his back, which is 3.23 m up there; the sit clip's thighs are 0.32 m over Egill's root).
const SEAT = new V3(1.18, 3.23 - 0.32 + 0.04, 0);
const MOSI_REAL_LENGTH = 8.5;
const THORSEDLA_REAL_LENGTH = 22;

/** A pawn's motion: where its foot is and how it moves; `body` gets the hop's squash and tilt. */
function createPawn(valley, { name, root, body, actor = null, onHop = () => {}, onRest = () => {} }) {
  const position = root.position;
  let heading = 0, headingGoal = 0;
  let move = null; // { kind: 'hop' | 'fly', from, to, t, duration, height, resolve, square }
  let riding = null; // fn(out)
  let bounce = 0; // a cheer's bounce, seconds left
  const queue = [];
  const tmp = new V3();

  function squarePoint(n, side, out = new V3()) {
    valley.squarePosition(n, out);
    if (side) {
      const h = rad(valley.squareHeading(n));
      out.x += -Math.sin(h) * side * PIECES.side;
      out.z += Math.cos(h) * side * PIECES.side;
    }
    return out;
  }

  const pawn = {
    name, root, actor,
    square: 0,
    side: 0,
    onLand: null,
    get position() { return position; },
    get moving() { return Boolean(move || riding); },
    place(n, { side = 0 } = {}) {
      move = null;
      riding = null;
      pawn.square = n;
      pawn.side = side;
      squarePoint(n, side, position);
      heading = headingGoal = valley.squareHeading(Math.max(1, n));
      root.rotation.y = -rad(heading);
      return pawn;
    },
    hopTo(n, { side = pawn.side, duration = PIECES.hop.duration, height = PIECES.hop.height } = {}) {
      const to = squarePoint(n, side);
      const p = new Promise(resolve => queue.push({ kind: 'hop', to, duration, height, resolve, square: n, side }));
      return p;
    },
    async hopAlong(squares, { onStep, ...options } = {}) {
      for (const n of squares) {
        await pawn.hopTo(n, options);
        onStep?.(n);
      }
    },
    flyTo(point, { duration = 1.4, height = 3, square = null, side = pawn.side } = {}) {
      const to = square ? squarePoint(square, side) : (point.isVector3 ? point.clone() : new V3(...point));
      return new Promise(resolve => queue.push({ kind: 'fly', to, duration, height, resolve, square, side }));
    },
    ride(fn) {
      riding = fn ?? null;
      if (!riding) return pawn;
      move = null;
      queue.length = 0;
      return pawn;
    },
    slide(curve, { duration = 1.6 } = {}) {
      const getCurve = typeof curve === 'function' ? curve : () => curve;
      riding = null;
      return new Promise(resolve => queue.push({ kind: 'slide', getCurve, duration, resolve, to: getCurve().getPointAt(1) }));
    },
    face(h) { headingGoal = h; return pawn; },
    faceToward(point) { headingGoal = deg(Math.atan2(point.z - position.z, point.x - position.x)); return pawn; },
    cheer() { bounce = 1.6; },
    update(dt) {
      if (riding) {
        riding(tmp);
        position.copy(tmp);
      } else if (!move && queue.length) {
        const next = queue.shift();
        move = { ...next, from: position.clone(), t: 0 };
        const dx = move.to.x - move.from.x, dz = move.to.z - move.from.z;
        if (Math.hypot(dx, dz) > 0.05) headingGoal = deg(Math.atan2(dz, dx));
        onHop(move);
      }
      let squash = 1, tilt = 0, lift = 0;
      if (move?.kind === 'slide') {
        move.t += dt;
        const u = clamp01(move.t / move.duration);
        const curve = move.getCurve();
        const along = u * u * (1.6 - 0.6 * u); // gathering speed
        curve.getPointAt(along, position);
        curve.getTangentAt(Math.min(0.999, along), tmp);
        headingGoal = deg(Math.atan2(tmp.z, tmp.x));
        tilt = Math.asin(Math.max(-1, Math.min(1, tmp.y))) * 0.6;
        if (u >= 1) {
          const done = move;
          move = null;
          done.resolve();
        }
      } else if (move) {
        move.t += dt;
        const u = clamp01(move.t / move.duration);
        // a crouch, the leap and a landing squash: the leap is 0.15 to 0.85 of the hop
        const crouch = move.kind === 'hop' ? 0.15 : 0.08, land = move.kind === 'hop' ? 0.85 : 0.94;
        const f = clamp01((u - crouch) / (land - crouch));
        const k = smooth(f);
        position.lerpVectors(move.from, move.to, k);
        position.y += Math.sin(Math.PI * f) * move.height;
        if (u < crouch) squash = 1 - 0.14 * Math.sin((Math.PI * u) / crouch);
        else if (u > land) squash = 1 - 0.16 * Math.sin((Math.PI * (u - land)) / (1 - land));
        else squash = 1 + 0.08 * Math.cos(Math.PI * f);
        tilt = u > crouch && u < land ? -0.22 * Math.cos(Math.PI * f) : 0;
        if (u >= 1) {
          const done = move;
          move = null;
          position.copy(done.to);
          if (done.square != null) { pawn.square = done.square; pawn.side = done.side ?? pawn.side; }
          pawn.onLand?.(done.square);
          done.resolve();
          if (!queue.length) onRest();
        }
      }
      if (bounce > 0) {
        bounce = Math.max(0, bounce - dt);
        const b = Math.abs(Math.sin((1.6 - bounce) * Math.PI * 2.5));
        lift = b * 0.35 * (bounce / 1.6);
        squash *= 1 + 0.06 * b;
      }
      heading += Math.atan2(Math.sin(rad(headingGoal - heading)), Math.cos(rad(headingGoal - heading))) * (180 / Math.PI) * (1 - Math.exp(-dt / 0.12));
      root.rotation.y = -rad(heading);
      body.position.y = lift;
      body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      body.rotation.z = tilt;
    },
  };
  return pawn;
}

/** The statue for Þórseðla's pawn: her model in its rest pose (the light level's welded skin), in gold, on a round foot. */
async function buildFigure(valley) {
  const board = valley.thorsedlas[0];
  let mesh = null;
  board.actor.model.traverse(o => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
  const levels = await valley.thorsedlaLevels();
  const source = levels[levels.length - 2]; // the 3,200-triangle welded skin
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', source.attributes.position);
  geometry.setAttribute('normal', source.attributes.normal);
  geometry.setIndex(source.index);
  const statue = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#f2c25a', metalness: 0.65, roughness: 0.3, envMapIntensity: 1.2 }));
  const k = PIECES.figureLength / THORSEDLA_REAL_LENGTH;
  statue.scale.setScalar(k);
  statue.position.set(2.6 * k, 0.1, 0); // the real model's middle is 2.6 m behind her root: centre her on the foot
  statue.castShadow = true;
  statue.receiveShadow = true;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.12, 24), new THREE.MeshStandardMaterial({ color: '#8b5e3c', roughness: 0.55 }));
  foot.position.y = 0.06;
  foot.castShadow = true;
  foot.receiveShadow = true;
  const group = new THREE.Group();
  group.add(foot, statue);
  return group;
}

export async function createPieces(valley) {
  const world = valley.world;
  const scene = valley.scene;

  // ---- Egill on Mosi -----------------------------------------------------------------------------------------------------
  const pawnScale = PIECES.mosiLength / MOSI_REAL_LENGTH;
  const mosi = await createActor(world, { name: 'mosi-pawn', url: MOSI_URL });
  const egill = await createActor(world, { name: 'egill-pawn', url: EGILL_URL });
  const childRoot = new THREE.Group();
  childRoot.name = 'Pawn: Egill on Mosi';
  const childBody = new THREE.Group();
  childRoot.add(childBody);
  scene.add(childRoot);
  // Mosi's root follows the pawn's body (its hop and squash); Egill's sits on Mosi's back, on his Body bone as it moves
  childBody.add(mosi.root);
  mosi.root.position.set(0, 0, 0);
  mosi.root.rotation.set(0, 0, 0);
  mosi.root.scale.setScalar(pawnScale);
  mosi.control(() => {}); // the pawn moves him: no walking, no footing
  mosi.lookYawLimit = 40; // as riding.js caps him with a rider on his back
  mosi.lookUpLimit = 30;
  const bodyBone = mosi.model.getObjectByName('Body');
  childRoot.updateMatrixWorld(true);
  const seatLocal = bodyBone.worldToLocal(mosi.root.localToWorld(SEAT.clone()));
  egill.root.scale.setScalar(pawnScale * PIECES.egillBigger);
  const seatQ = new THREE.Quaternion();
  egill.control(() => {
    bodyBone.updateWorldMatrix(true, false);
    egill.root.position.copy(bodyBone.localToWorld(seatLocal.clone()));
    mosi.root.getWorldQuaternion(seatQ);
    egill.root.quaternion.copy(seatQ);
  });
  egill.play('sit', { fade: 0 });
  // Mosi and Egill are updated with the pawn (below), not as the valley's actors: Mosi's root is the pawn's, not the world's.
  const child = createPawn(valley, {
    name: 'child', root: childRoot, body: childBody, actor: mosi,
    onHop: () => mosi.play('walk', { fade: 0.15, timeScale: 2.2 }),
    onRest: () => mosi.play('idle', { fade: 0.3 }),
  });
  child.egill = egill;

  // ---- Þórseðla's statue -------------------------------------------------------------------------------------------------
  const figureRoot = new THREE.Group();
  figureRoot.name = "Pawn: Þórseðla's statue";
  const figureBody = new THREE.Group();
  figureRoot.add(figureBody);
  figureBody.add(await buildFigure(valley));
  scene.add(figureRoot);
  const thorsedla = createPawn(valley, { name: 'thorsedla', root: figureRoot, body: figureBody });

  valley.pawns.push(childRoot, figureRoot);

  // ---- the host ----------------------------------------------------------------------------------------------------------
  // She walks on a circle round the board, just inside the trees, to the point of it nearest the pawn she watches, then turns to it.
  const hostActor = await createActor(world, { name: 'thorsedla-host', url: THORSEDLA_URL });
  hostActor.root.scale.setScalar(PIECES.host.scale);
  valley.registerThorsedla(hostActor);
  world.actors.set('thorsedla-host', hostActor);
  const ring = PIECES.host.ring;
  const startAngle = rad(110); // at the front, a little to the left of the camera's line
  hostActor.place(Math.cos(startAngle) * ring, Math.sin(startAngle) * ring, deg(startAngle) - 90);
  hostActor.footprintScale = 2.4; // the grass lies down under her
  let watched = null;
  let hostAngle = startAngle;
  let walking = null; // { handle, goal }
  let rethink = 0;
  let cheerFor = 0;
  const lookAt = new V3();
  const host = {
    actor: hostActor,
    watch(pawn) {
      watched = pawn;
      rethink = 0;
      hostActor.lookAt(pawn ? () => lookAt.copy(pawn.root.position).add(new V3(0, 0.8, 0)) : null, { weight: 0.7, maxAngle: 80, maxPitch: 35 });
      return host;
    },
    cheer() {
      if (walking) { walking.handle.cancel(); walking = null; }
      hostActor.play('happy', { fade: 0.25 });
      cheerFor = 2.4;
    },
    update(dt) {
      if (cheerFor > 0) {
        cheerFor -= dt;
        if (cheerFor <= 0) hostActor.play('idle', { fade: 0.5 });
        return;
      }
      if (walking) {
        if (!walking.handle.done) return;
        hostAngle = walking.goal;
        walking = null;
        if (watched) hostActor.turnTo([watched.root.position.x, watched.root.position.z], { rate: 20 });
        rethink = 2;
        return;
      }
      rethink -= dt;
      if (!watched || rethink > 0) return;
      rethink = 1.5;
      const p = watched.root.position;
      const want = Math.atan2(p.z, p.x);
      let d = Math.atan2(Math.sin(want - hostAngle), Math.cos(want - hostAngle));
      if (Math.abs(d) < rad(28)) return;
      d -= Math.sign(d) * rad(12); // stop a little short of straight beside the pawn
      const steps = Math.max(2, Math.ceil(Math.abs(d) / rad(10)));
      const points = [];
      for (let i = 1; i <= steps; i++) {
        const a = hostAngle + (d * i) / steps;
        points.push([Math.cos(a) * ring, Math.sin(a) * ring]);
      }
      walking = { handle: hostActor.walkTo(points, { speed: PIECES.host.speed, turnRate: 40 }), goal: hostAngle + d };
    },
  };

  child.place(0, { side: -1 });
  thorsedla.place(0, { side: 1 });
  mosi.play('idle', { fade: 0 });

  const remove = valley.addUpdater(dt => {
    child.update(dt);
    thorsedla.update(dt);
    host.update(dt);
    childRoot.updateMatrixWorld(true);
    mosi.update(dt); // Mosi first: Egill sits on him as he is in this frame
    egill.update(dt);
  });

  return {
    child, thorsedla, host,
    pawns: [child, thorsedla],
    /** Resolves once Mosi's, Egill's and the host's lighter levels are ready (captures wait for it). */
    ready: characterLodsReady().then(() => valley.ready),
    dispose() {
      remove();
      mosi.dispose();
      egill.dispose();
      hostActor.dispose();
      world.actors.delete('thorsedla-host');
      scene.remove(childRoot, figureRoot);
      valley.pawns.splice(0, valley.pawns.length, ...valley.pawns.filter(p => p !== childRoot && p !== figureRoot));
    },
  };
}
