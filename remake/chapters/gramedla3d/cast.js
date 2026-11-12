// Grameðla kemur!'s other players and its particles (chapters/gramedla3d.js): the pale butterfly, the flock, Flugeðla with Egill
// in her saddle, the code-made specks (motes, pollen, her breath, leaf flecks) and the trees' bend. Each is put where the timeline
// says (timeline.js, through director.js) every frame and does nothing by itself but its idle life (wings, twinkle), so a seek lands
// on the frame and a key's second is the key's row.
// No new art: the game's models (butterfly.glb, fugl.glb, pteranodon.glb with its saddle, egill.glb) and its glints; a leaf fleck is a
// flat oval in the forest's leaf colours (as engine/hals/life.js draws its falling leaves).
import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { HERO } from '../../world/forest/butterflies.js';
import { BIRD_MODEL, birdMaterial } from '../../world/critters/critters.js';
import { crowdModelFrom } from '../../world/critters/crowd-models.js';
import { glints, SPARKLE_LOOK } from '../../world/props/sparkles.js';
import { rideFlier } from '../../engine/flier.js';
import { createFlierSaddle } from '../../engine/flier-saddle.js';
import { reachTwoBones } from '../../engine/ik.js';
import { rotateBoneWorld } from '../../engine/actor.js';
import { BODY_HEIGHT } from '../kafli4-route.js';
import { GROUPS, groupPoints } from './keys.js';
import { speckAt, PUFF, TREE_SPECS } from './timeline.js';
import { guardBones } from './pose.js';
import { createHaze } from './haze.js';

const rad = d => (d * Math.PI) / 180;
const HERO_SCALE = 1.5; // as in Fiðrildadansinn: it reads at the middle of the frame
const BIRD_REACH = 0.24; // m: a bird's model scaled so its bounding sphere is this big (a songbird's wings spread)
// The colours: pale or yellow-green in front of the screen (spec rule 7); behind it the forest's own leaf colours.
// rim: 1 on each: with these gentle falloffs the glow has not died out at the point's edge, and a big speck (a puff of her breath
// is a third of a metre across, two metres from the lens) would show as a square.
const LOOKS = {
  motes: { colour: '#fff6d6', look: { ...SPARKLE_LOOK, star: 0, glow: 0.95, falloff: 2.4, twinkle: 1, rim: 1 } },
  pollen: { colour: '#e9ec7a', look: { ...SPARKLE_LOOK, star: 0, glow: 0.8, falloff: 2.2, twinkle: 0, rim: 1 } },
  puffs: { colour: '#eef2ea', look: { ...SPARKLE_LOOK, star: 0, glow: 0.42, falloff: 1.25, twinkle: 0, rim: 1 } },
};
const LEAF_BEHIND = ['#8fbf4e', '#c9c24a', '#e8a33a', '#a8c95a', '#7fae45'];
const LEAF_FRONT = ['#cfdc7e', '#dfe39a', '#bcd46e'];
const LONG_AGO = -0.12 * 1e5; // a glint fades in over the first tenth of its life (sparkles.js): born this long ago, lit at once

let loader = null;
const loadModel = (world, url) => (world.loadModel ? world.loadModel(url) : (loader ??= new GLTFLoader()).loadAsync(url));

export function createCast(world, { stage, D, flugedla, egill }) {
  const { stageCam, framePoint } = stage;
  const at = (u, v, k, out = new THREE.Vector3()) => framePoint(u, v, k, out, stageCam, D);
  const butterflies = world.forest?.butterflies ?? null;

  // ---- the pale butterfly: the hero (butterfly.glb); the clearing's own pale ones are sent under the ground for the show ----
  if (butterflies) {
    for (const t of butterflies.targets) if (t.name !== HERO) butterflies.follow(t.name, out => out.set(0, -200, 0), { snap: true });
    butterflies.hero.group.scale.setScalar(HERO_SCALE);
  }
  const butterflyAt = (out = new THREE.Vector3()) => butterflies?.hero.group.getWorldPosition(out) ?? null;

  // ---- the flock: fugl.glb, each bird its own mesh with its wings posed by a uniform (critters.js birdMaterial) ----
  const flock = new THREE.Group();
  flock.name = 'gramedla flock';
  world.scene.add(flock);
  const birds = [];
  const birdsReady = loadModel(world, BIRD_MODEL).then(gltf => {
    const baked = crowdModelFrom(gltf);
    const geometry = baked.lods[0].geometry;
    geometry.computeBoundingSphere();
    const scale = BIRD_REACH / geometry.boundingSphere.radius;
    for (let i = 0; i < 7; i++) {
      const flight = { value: new THREE.Vector2(0, 1) };
      const mesh = new THREE.Mesh(geometry, birdMaterial('bird', { map: baked.material.map ?? null, vertexColors: false, wing: baked.wing, flight }));
      mesh.scale.setScalar(scale);
      mesh.userData.flight = flight;
      mesh.visible = false;
      flock.add(mesh);
      birds.push(mesh);
    }
  }).catch(error => { console.warn('[gramedla3d] fugl could not be loaded:', error?.message ?? error); });
  /** The flock as rows [u, v, k, yaw (degrees: 0 across to the right, 90 toward us), wings (0 up .. 1 down)], or null. */
  function poseBirds(rows) {
    birds.forEach((mesh, i) => {
      const row = rows?.[i];
      mesh.visible = Boolean(row);
      if (!row) return;
      const [u, v, k, yaw, wing] = row;
      at(u, v, k, mesh.position);
      mesh.rotation.set(0, -rad(yaw), 0);
      mesh.userData.flight.value.set(-0.85 + 1.5 * wing, 1);
      mesh.userData.row = [u, v, k];
    });
  }

  // ---- Flugeðla with Egill in her saddle: her root moved each frame so her beak tip is at its place; Egill rides her ----
  const her = flugedla, boy = egill;
  const herRoot = { position: new THREE.Vector3(0, -50, 0), quaternion: new THREE.Quaternion() };
  const necks = ['Neck', 'Neck2', 'Neck3'].map(n => her.model.getObjectByName(n)).filter(Boolean);
  const neckGuard = guardBones(necks);
  her.control(() => { her.root.position.copy(herRoot.position); her.root.quaternion.copy(herRoot.quaternion); });
  const body = herRoot.position.clone();
  const flier = { actor: her, root: herRoot, route: { waterAt: () => null }, heading: 90, bank: 0, t: 30, pose: { position: body, quaternion: herRoot.quaternion } };
  const saddle = createFlierSaddle(her);
  saddle.show();
  let riding = null;
  const ready = saddle.loaded.then(() => { riding = rideFlier(boy, flier, { saddle }); });
  // her beak tip: the forward-most vertex of her body skinned to her Head or Jaw (in the Head bone's frame, from her first pose)
  let beakLocal = null;
  const herHead = her.model.getObjectByName('Head');
  // her body: her largest skinned mesh but the saddle (which is skinned to her bones too, and at some qualities has more vertices)
  const herBody = () => {
    let best = null;
    her.model.traverse(o => { if (o.isSkinnedMesh && o !== saddle.mesh && (!best || o.geometry.attributes.position.count > best.geometry.attributes.position.count)) best = o; });
    return best;
  };
  function findBeak() {
    her.root.updateMatrixWorld(true);
    const mesh = herBody();
    mesh.skeleton.update();
    const list = mesh.skeleton.bones;
    const ofHead = new Set();
    herHead.traverse(o => { const j = list.indexOf(o); if (j >= 0) ofHead.add(j); });
    const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(her.root.quaternion);
    let best = -Infinity, tip = null;
    const p = new THREE.Vector3();
    for (let i = 0; i < si.count; i++) {
      let top = 0, w = -1;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); top = si.getComponent(i, k); }
      if (!ofHead.has(top)) continue;
      mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld);
      if (p.dot(fwd) > best) { best = p.dot(fwd); tip = p.clone(); }
    }
    return herHead.worldToLocal(tip);
  }
  const beak = (out = new THREE.Vector3()) => out.copy(beakLocal).applyMatrix4(herHead.matrixWorld);

  // Egill: leaning out to the side and pointing back over his left shoulder, `point` of the way (0 sitting as he rides, 1 all of it)
  const point = { weight: 0, lean: 0, aim: [0.5, 0.6, -1] };
  const pointer = (() => {
    const find = n => { let b = null; boy.model.traverse(o => { if (!b && o.isBone && o.name.endsWith(n)) b = o; }); return b; };
    const upper = find('LeftUpperArm'), lower = find('LeftLowerArm'), hand = find('LeftHand'), head = find('Head'), neck = find('Neck'), spine = find('Spine');
    const guard = guardBones([spine, upper, lower, hand, neck, head].filter(Boolean));
    const shoulder = new THREE.Vector3(), target = new THREE.Vector3(), rest = new THREE.Vector3(), aim = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    const TOWARD_US = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion();
    return () => {
      guard.begin();
      const w = point.weight;
      if (w > 0 && upper) {
        boy.root.updateMatrixWorld(true);
        // leaning out to the side, so he shows beside her neck (about the line from her to us)
        if (spine && point.lean) {
          rotateBoneWorld(spine, q.setFromAxisAngle(TOWARD_US, -rad(point.lean) * w));
          boy.root.updateMatrixWorld(true);
        }
        // back over his left shoulder: up the lane (away from us), up, and out to his left (our right: the side he leans out to)
        upper.getWorldPosition(shoulder);
        hand.getWorldPosition(rest);
        target.copy(shoulder).add(aim.set(...point.aim).normalize().multiplyScalar(1.2));
        reachTwoBones(upper, lower, hand, target.lerpVectors(rest, target, w));
        // and he looks a little that way, still mostly at us
        if (neck) rotateBoneWorld(neck, q.setFromAxisAngle(UP, rad(22) * w));
        if (head) rotateBoneWorld(head, q.setFromAxisAngle(UP, rad(18) * w));
      }
      guard.end();
    };
  })();
  boy.setOverlay(() => pointer());

  // her neck stretched forward and down by `neck` degrees in all, shared by its three bones, about her own right; then her root
  // moved so the beak tip is where its row puts it (a rigid move, after her clip and neck have posed her this frame)
  let neckDown = 0;
  let beakWant = null;
  const herRight = new THREE.Vector3(), nq = new THREE.Quaternion(), dv = new THREE.Vector3();
  her.setOverlay(() => {
    neckGuard.begin();
    if (neckDown) {
      her.root.updateMatrixWorld(true);
      herRight.set(0, 0, 1).applyQuaternion(her.root.quaternion);
      for (const b of necks) rotateBoneWorld(b, nq.setFromAxisAngle(herRight, -rad(neckDown) / necks.length));
    }
    neckGuard.end();
    if (!beakWant || !beakLocal) return;
    her.root.updateMatrixWorld(true);
    dv.copy(beakWant).sub(beak());
    if (dv.lengthSq() < 1e-10) return;
    herRoot.position.add(dv);
    her.root.position.copy(herRoot.position);
    her.root.updateMatrixWorld(true);
    body.copy(herRoot.position).add(new THREE.Vector3(0.06, BODY_HEIGHT, 0).applyQuaternion(herRoot.quaternion));
  });
  let herAction = null;
  let flugHaze = null;
  const herEuler = new THREE.Euler(), herPitch = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
  /**
   * Flugeðla this frame: { beak: [u, v, k], clip, at (its second), pitch, yaw (degrees: 0 facing us), neck (degrees), egill: { weight,
   * lean, aim } }, or null (hidden). Before her saddle has loaded she is hidden.
   */
  function poseFlugedla(spec) {
    if (!spec || !riding) {
      herRoot.position.set(0, -50, 0);
      her.root.visible = false;
      boy.root.visible = false;
      point.weight = 0;
      neckDown = 0;
      beakWant = null;
      return;
    }
    const shown = her.root.visible;
    her.root.visible = true;
    boy.root.visible = true;
    flugHaze ??= createHaze(her.model, boy.model); // (her saddle is in by now: she is not posed before it)
    flugHaze.set(spec.haze ?? 0, spec.seen ?? 1);
    const clip = her.clips.get(spec.clip) ?? her.clips.get('glide');
    if (!herAction || herAction.getClip() !== clip) herAction = her.play(clip.name, { fade: 0, timeScale: 0 });
    herAction.time = spec.at;
    // facing us (her +X toward +Z) turned `yaw`, her nose up `pitch` degrees about her own right (+Z)
    herRoot.quaternion.setFromEuler(herEuler.set(0, -rad(90 + (spec.yaw ?? 0)), 0)).multiply(herPitch.setFromAxisAngle(Z, rad(spec.pitch ?? 0)));
    her.root.quaternion.copy(herRoot.quaternion);
    if (!beakLocal) { her.root.position.set(0, 3, -10); her.mixer.update(0); beakLocal = findBeak(); }
    beakWant = at(...spec.beak, beakWant ?? new THREE.Vector3());
    if (!shown) herRoot.position.set(beakWant.x, beakWant.y - 1, beakWant.z - 3); // the overlay puts the beak exactly, this frame
    neckDown = spec.neck ?? 0;
    point.weight = spec.egill?.weight ?? (spec.egill?.point ? 1 : 0);
    point.lean = spec.egill?.lean ?? 0;
    point.aim = spec.egill?.aim ?? [0.5, 0.6, -1];
  }

  // ---- the specks: each group one set of glints (or one mesh of leaf flecks), moved where the timeline says each frame ----
  const groups = new Map();
  const leafShape = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0);
    s.quadraticCurveTo(-0.1, 0.32, 0.5, 0);
    s.quadraticCurveTo(-0.1, -0.32, -0.5, 0);
    return new THREE.ShapeGeometry(s, 4).rotateX(-Math.PI / 2);
  })();
  function makeGroup(name) {
    const spec = GROUPS[name];
    const points = groupPoints(spec);
    if (spec.kind === 'leaves') {
      const front = points.some(q => q[2] < 1);
      const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, transparent: true });
      const mesh = new THREE.InstancedMesh(leafShape, material, points.length);
      mesh.name = `gramedla ${name}`;
      let seed = 11;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const turns = [], sizes = [];
      const e = new THREE.Euler(), c = new THREE.Color();
      points.forEach(([, , k], i) => {
        e.set((rnd() - 0.5) * 2.2, rnd() * Math.PI * 2, (rnd() - 0.5) * 1.6);
        turns.push(new THREE.Quaternion().setFromEuler(e));
        sizes.push(new THREE.Vector3().setScalar(spec.size * (0.7 + 0.6 * rnd())));
        const list = front || k < 1.2 ? LEAF_FRONT : LEAF_BEHIND;
        mesh.setColorAt(i, c.set(list[Math.floor(rnd() * list.length)]));
      });
      mesh.frustumCulled = false;
      world.scene.add(mesh);
      return { name, spec, points, object: mesh, turns, sizes, now: points.map(() => new THREE.Vector3()) };
    }
    const how = LOOKS[spec.kind];
    const puffs = spec.kind === 'puffs';
    const set = glints(world, { count: points.length, life: puffs ? PUFF.cycle : 1e5, spread: 0, fall: 0, size: spec.size, colour: how.colour, seed: spec.seed, look: { ...how.look, rise: 0, drift: [0, 0], vary: 0 } });
    set.points.name = `gramedla ${name}`;
    set.birth.fill(LONG_AGO);
    set.points.geometry.attributes.birth.needsUpdate = true;
    return { name, spec, points, object: set.points, set, glow: how.look.glow, now: points.map(() => new THREE.Vector3()) };
  }
  const m4 = new THREE.Matrix4();
  /** The specks at show second t: `on` is the timeline's { name: { alpha } } (the groups not named are not drawn). */
  function poseSpecks(on, t) {
    for (const name of Object.keys(on)) if (!groups.has(name)) groups.set(name, makeGroup(name));
    for (const [name, g] of groups) {
      const state = on[name];
      g.object.visible = Boolean(state && state.alpha > 0);
      if (!g.object.visible) continue;
      g.points.forEach((p, i) => {
        const s = speckAt(name, i, p, t);
        at(...s.at, g.now[i]);
        if (s.dx) g.now[i].x += s.dx;
        if (s.dy) g.now[i].y += s.dy;
        if (g.set) {
          g.set.position[i * 3] = g.now[i].x; g.set.position[i * 3 + 1] = g.now[i].y; g.set.position[i * 3 + 2] = g.now[i].z;
          if (s.age !== undefined) g.set.birth[i] = t - s.age;
        } else g.object.setMatrixAt(i, m4.compose(g.now[i], g.turns[i], g.sizes[i]));
      });
      if (g.set) {
        g.set.points.geometry.attributes.position.needsUpdate = true;
        if (g.spec.kind === 'puffs') g.set.points.geometry.attributes.birth.needsUpdate = true;
        g.set.uniforms.uTime.value = t;
        g.set.uniforms.uGlow.value = g.glow * state.alpha;
      } else {
        g.object.instanceMatrix.needsUpdate = true;
        g.object.material.opacity = state.alpha;
      }
    }
  }

  // ---- the trees' bend: each spec's bend (a shake of the far lane's crowns, or bent away from the lane's middle) worked out once at
  // full strength, then laid over the trees as built at each frame's amplitudes ----
  const plants = [];
  const bends = new Map(); // spec name -> [{ geometry, index: Int32Array, dx: Float32Array, dy: Float32Array }]
  const built = new Map(); // geometry -> { index -> [x, y, z] as built }
  const touched = new Set();
  let bentCount = 0;
  function bendOf(name, placements) {
    if (bends.has(name)) return bends.get(name);
    const spec = TREE_SPECS[name];
    if (!plants.length) for (const p of placements) if (p.height > 2.5) plants.push(p);
    const amount = spec.shake ?? spec.away ?? 0;
    const [d0, d1] = spec.depth;
    const nearest = (x, z) => {
      let best = null, bd = 3;
      for (const p of plants) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    const out = [];
    world.forest.group.traverse(o => {
      const cull = o.userData?.cull;
      if (!o.isMesh || !cull?.ranges || !o.geometry?.attributes?.position) return;
      const pos = o.geometry.attributes.position;
      let saved = built.get(o.geometry);
      if (!saved) built.set(o.geometry, saved = new Map());
      const done = new Set();
      const index = [], dx = [], dy = [];
      for (const r of cull.ranges) {
        const c = r.sphere.center;
        const depth = stage.camPos.z - c.z;
        if (depth < d0 - 4 || depth > d1 + 6 || Math.abs(c.x) > 18) continue;
        const plant = nearest(c.x, c.z);
        if (!plant) continue;
        const pd = stage.camPos.z - plant.z;
        if (pd < d0 || pd > d1) continue;
        const h = Math.max(4, plant.height ?? 10);
        const base = plant.y ?? world.heightAt(plant.x, plant.z);
        // the shake: each tree its own way (by where it stands); the blast: outward from the lane, those nearer her the most
        const hash = Math.sin(plant.x * 12.9898 + plant.z * 78.233) * 43758.5453;
        const side = spec.shake ? ((hash - Math.floor(hash)) < 0.5 ? -1 : 1) : Math.sign(plant.x || 1);
        const strength = amount * (spec.shake ? 0.6 + 0.4 * (hash - Math.floor(hash)) : 1 - 0.5 * (pd - d0) / (d1 - d0));
        for (let j = r.start; j < r.start + r.count; j++) {
          const vi = cull.master[j];
          if (done.has(vi)) continue;
          done.add(vi);
          if (!saved.has(vi)) saved.set(vi, [pos.getX(vi), pos.getY(vi), pos.getZ(vi)]);
          const y = saved.get(vi)[1];
          const f = Math.min(1, Math.max(0, (y - base) / h)) ** 1.6;
          index.push(vi); dx.push(side * strength * f); dy.push(-0.25 * strength * f * f);
        }
      }
      if (index.length) out.push({ geometry: o.geometry, index: Int32Array.from(index), dx: Float32Array.from(dx), dy: Float32Array.from(dy) });
    });
    bends.set(name, out);
    return out;
  }
  /** Works out every bend the show has at once (a few hundred ms), so none is worked out in the middle of it. */
  const prepareTrees = placements => { for (const name of Object.keys(TREE_SPECS)) bendOf(name, placements); };
  let lastKey = '';
  /** The trees at this frame's bends: [{ name (timeline.js TREE_SPECS), amp }] (none: as built). */
  function poseTrees(list, placements) {
    const keyNow = list.map(b => `${b.name}:${b.amp.toFixed(4)}`).join(',');
    if (keyNow === lastKey) return;
    lastKey = keyNow;
    // back as built where anything was bent
    const dirty = new Set(touched);
    for (const geo of touched) {
      const pos = geo.attributes.position, saved = built.get(geo);
      for (const [i, [x, y, z]] of saved) pos.setXYZ(i, x, y, z);
    }
    touched.clear();
    bentCount = 0;
    for (const { name, amp } of list) {
      for (const b of bendOf(name, placements)) {
        const pos = b.geometry.attributes.position;
        const a = Math.abs(amp);
        for (let j = 0; j < b.index.length; j++) {
          const vi = b.index[j];
          pos.setX(vi, pos.getX(vi) + b.dx[j] * amp);
          pos.setY(vi, pos.getY(vi) + b.dy[j] * a);
        }
        bentCount += b.index.length;
        touched.add(b.geometry);
        dirty.add(b.geometry);
      }
    }
    // only the stretch of each buffer the bends reach goes to the GPU (the forest's batches hold every plant of a kind)
    for (const geo of dirty) {
      const pos = geo.attributes.position;
      let range = ranges.get(geo);
      if (!range) {
        range = [Infinity, -Infinity];
        for (const i of built.get(geo).keys()) { range[0] = Math.min(range[0], i); range[1] = Math.max(range[1], i); }
        ranges.set(geo, range);
      }
      pos.clearUpdateRanges();
      pos.addUpdateRange(range[0] * pos.itemSize, (range[1] - range[0] + 1) * pos.itemSize);
      pos.needsUpdate = true;
    }
  }
  const ranges = new Map(); // geometry -> [first, last] vertex any bend moves

  return { butterflies, butterflyAt, birds, flock, poseBirds, birdsReady, poseFlugedla, beak: () => (beakLocal && her.root.visible ? beak() : null), her, herBody, boy, get riding() { return riding; }, ready, poseSpecks, groups, poseTrees, prepareTrees, get bentCount() { return bentCount; } };
}
