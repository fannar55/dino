// Grameðla kemur!'s other players and its particles (chapters/gramedla3d.js): the pale butterfly, the flock, Flugeðla with Egill
// in her saddle, the code-made specks (motes, pollen, her breath, leaf flecks) and the trees' bend. Each is set from a key frame's
// row (keys.js) and does nothing by itself but its idle life (wings, twinkle), so a measured depth stays where it was put.
// No new art: the game's models (butterfly.glb, fugl.glb, pteranodon.glb with its saddle, egill.glb) and its glints; a leaf fleck is a
// flat oval in the forest's leaf colours (as engine/hals/life.js draws its falling leaves).
import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { HERO } from '../../world/forest/butterflies.js';
import { BIRD_MODEL, birdMaterial } from '../../world/critters/critters.js';
import { crowdModelFrom } from '../../world/critters/crowd-models.js';
import { glints, run, SPARKLE_LOOK } from '../../world/props/sparkles.js';
import { rideFlier } from '../../engine/flier.js';
import { createFlierSaddle } from '../../engine/flier-saddle.js';
import { reachTwoBones } from '../../engine/ik.js';
import { rotateBoneWorld } from '../../engine/actor.js';
import { BODY_HEIGHT } from '../kafli4-route.js';
import { GROUPS, groupPoints } from './keys.js';

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

let loader = null;
const loadModel = (world, url) => (world.loadModel ? world.loadModel(url) : (loader ??= new GLTFLoader()).loadAsync(url));

export function createCast(world, { stage, D, flugedla, egill, gram, snout }) {
  const { stageCam, framePoint, camPos } = stage;
  const at = (u, v, k, out = new THREE.Vector3()) => framePoint(u, v, k, out, stageCam, D);
  const butterflies = world.forest?.butterflies ?? null;

  // ---- the pale butterfly: the hero (butterfly.glb); the clearing's own pale ones are sent under the ground for the show ----
  if (butterflies) {
    for (const t of butterflies.targets) if (t.name !== HERO) butterflies.follow(t.name, out => out.set(0, -200, 0), { snap: true });
    butterflies.hero.group.scale.setScalar(HERO_SCALE);
  }
  const fly = { mode: null, spot: new THREE.Vector3() };
  function setButterfly(spec) {
    if (!butterflies) return;
    if (!spec) {
      fly.mode = null;
      butterflies.follow(HERO, out => out.set(0, -200, 0), { snap: true });
    } else if (spec.on === 'snout') {
      fly.mode = 'snout';
      // sitting on her snout tip: the landing stays on the point as it moves (it does not, held)
      butterflies.follow(HERO, out => snout(out).add(new THREE.Vector3(0, 0.02, 0)), { snap: true });
      butterflies.land(() => snout(new THREE.Vector3()), { name: HERO, duration: 0.25 });
    } else {
      fly.mode = 'at';
      at(...spec.at, fly.spot);
      butterflies.follow(HERO, out => out.copy(fly.spot), { snap: true });
    }
  }
  const butterflyAt = (out = new THREE.Vector3()) => butterflies?.hero.group.getWorldPosition(out) ?? null;

  // ---- the flock: fugl.glb, each bird its own mesh with its wings posed by a uniform (critters.js birdMaterial) ----
  const flock = new THREE.Group();
  flock.name = 'gramedla flock';
  world.scene.add(flock);
  const birdModel = loadModel(world, BIRD_MODEL).then(gltf => {
    const baked = crowdModelFrom(gltf);
    const geometry = baked.lods[0].geometry;
    geometry.computeBoundingSphere();
    return { geometry, map: baked.material.map ?? null, wing: baked.wing, scale: BIRD_REACH / geometry.boundingSphere.radius, colour: baked.material.color };
  }).catch(error => { console.warn('[gramedla3d] fugl could not be loaded:', error?.message ?? error); return null; });
  let birdRows = null;
  async function setBirds(rows) {
    birdRows = rows ?? null;
    flock.clear();
    if (!rows) return;
    const model = await birdModel;
    if (!model || birdRows !== rows) return;
    for (const [u, v, k, yaw, wing] of rows) {
      const flight = { value: new THREE.Vector2(-0.85 + 1.5 * wing, 1) };
      const mesh = new THREE.Mesh(model.geometry, birdMaterial('bird', { map: model.map, vertexColors: false, wing: model.wing, flight }));
      mesh.scale.setScalar(model.scale);
      at(u, v, k, mesh.position);
      mesh.rotation.set(0, -rad(yaw), 0);
      mesh.userData.row = [u, v, k];
      flock.add(mesh);
    }
  }

  // ---- Flugeðla with Egill in her saddle: her root held where her beak tip is at its place; Egill rides her (engine/flier.js) ----
  const her = flugedla, boy = egill;
  const herRoot = { position: new THREE.Vector3(0, -50, 0), quaternion: new THREE.Quaternion() };
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
  let pointing = false;
  let pointAim = [0.5, 0.6, -1]; // the way his arm points (world: +x our right, +y up, -z up the lane)
  let leanOut = 0;
  const pointer = (() => {
    const find = n => { let b = null; boy.model.traverse(o => { if (!b && o.isBone && o.name.endsWith(n)) b = o; }); return b; };
    const upper = find('LeftUpperArm'), lower = find('LeftLowerArm'), hand = find('LeftHand'), head = find('Head'), neck = find('Neck'), spine = find('Spine');
    const shoulder = new THREE.Vector3(), target = new THREE.Vector3(), aim = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    return () => {
      if (!pointing || !upper) return;
      boy.root.updateMatrixWorld(true);
      // leaning out to the side, so he shows beside her neck (about the line from her to us)
      if (spine && leanOut) {
        rotateBoneWorld(spine, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -rad(leanOut)));
        boy.root.updateMatrixWorld(true);
      }
      // back over his left shoulder: up the lane (away from us), up, and out to his left (our right: the side he leans out to)
      upper.getWorldPosition(shoulder);
      target.copy(shoulder).add(aim.set(...pointAim).normalize().multiplyScalar(1.2));
      reachTwoBones(upper, lower, hand, target);
      // and he looks a little that way, still mostly at us
      if (neck) rotateBoneWorld(neck, new THREE.Quaternion().setFromAxisAngle(UP, rad(22)));
      if (head) rotateBoneWorld(head, new THREE.Quaternion().setFromAxisAngle(UP, rad(18)));
    };
  })();
  boy.setOverlay(() => pointer());
  // her neck stretched forward and down by its spec.neck degrees in all, shared by its three bones (so her head comes down in front of
  // Egill, who sits behind it), about her own right
  let neckDown = 0;
  const necks = ['Neck', 'Neck2', 'Neck3'].map(n => her.model.getObjectByName(n)).filter(Boolean);
  const herRight = new THREE.Vector3(), nq = new THREE.Quaternion();
  // the clip's own neck, put back before each bend (a held clip does not set a bone again when its value does not change)
  const neckRest = necks.map(b => b.quaternion.clone());
  const bowNeck = () => {
    if (!neckDown) return;
    necks.forEach((b, i) => b.quaternion.copy(neckRest[i]));
    her.root.updateMatrixWorld(true);
    herRight.set(0, 0, 1).applyQuaternion(her.root.quaternion);
    for (const b of necks) rotateBoneWorld(b, nq.setFromAxisAngle(herRight, -rad(neckDown) / necks.length));
  };
  // each frame, once her clip and neck have posed her, her root moved so the beak tip is where its row puts it (a rigid move: in a
  // capture the first placement can come before her clip has posed her)
  let beakWant = null;
  const dv = new THREE.Vector3();
  her.setOverlay(() => {
    bowNeck();
    if (!beakWant || !beakLocal) return;
    her.root.updateMatrixWorld(true);
    dv.copy(beakWant).sub(beak());
    if (dv.lengthSq() < 1e-8) return;
    herRoot.position.add(dv);
    her.root.position.copy(herRoot.position);
    her.root.updateMatrixWorld(true);
    body.copy(herRoot.position).add(new THREE.Vector3(0.06, BODY_HEIGHT, 0).applyQuaternion(herRoot.quaternion));
  });
  async function setFlugedla(spec) {
    if (!spec) {
      herRoot.position.set(0, -50, 0);
      her.root.visible = false;
      boy.root.visible = false;
      pointing = false;
      neckDown = 0;
      beakWant = null;
      return;
    }
    await ready;
    her.root.visible = true;
    boy.root.visible = true;
    if (neckDown) necks.forEach((b, i) => b.quaternion.copy(neckRest[i])); // unbent, so the clip's pose below is the clip's
    const clip = her.clips.get(spec.clip) ?? her.clips.get('glide');
    const action = her.play(clip.name, { fade: 0, timeScale: 0 });
    action.time = spec.at * (spec.of ? clip.duration : 1);
    her.mixer.update(0);
    necks.forEach((b, i) => neckRest[i].copy(b.quaternion));
    // facing us (her +X toward +Z), her nose up `pitch` degrees about her own right (+Z)
    herRoot.quaternion.setFromEuler(new THREE.Euler(0, -rad(90 + (spec.yaw ?? 0)), 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rad(spec.pitch ?? 0)));
    her.root.quaternion.copy(herRoot.quaternion);
    if (!beakLocal) { her.root.position.set(0, 3, -10); beakLocal = findBeak(); }
    const want = at(...spec.beak);
    beakWant = want.clone();
    herRoot.position.set(want.x, want.y - 1, want.z - 3);
    neckDown = spec.neck ?? 0;
    for (let i = 0; i < 4; i++) {
      her.root.position.copy(herRoot.position);
      bowNeck(); // the neck as the overlay bends it
      her.root.updateMatrixWorld(true);
      herRoot.position.add(want.clone().sub(beak()));
    }
    her.root.position.copy(herRoot.position);
    body.copy(herRoot.position).add(new THREE.Vector3(0.06, BODY_HEIGHT, 0).applyQuaternion(herRoot.quaternion));
    pointing = Boolean(spec.egill?.point);
    leanOut = spec.egill?.lean ?? 0;
    pointAim = spec.egill?.aim ?? [0.5, 0.6, -1];
  }

  // ---- the specks: each group one set of glints (or one mesh of leaf flecks), placed once, switched on and off by the frames ----
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
    const p = new THREE.Vector3();
    if (spec.kind === 'leaves') {
      const front = points.some(q => q[2] < 1);
      const mesh = new THREE.InstancedMesh(leafShape, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), points.length);
      mesh.name = `gramedla ${name}`;
      let seed = 11;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const m = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), c = new THREE.Color();
      points.forEach(([u, v, k], i) => {
        at(u, v, k, p);
        e.set((rnd() - 0.5) * 2.2, rnd() * Math.PI * 2, (rnd() - 0.5) * 1.6);
        sc.setScalar(spec.size * (0.7 + 0.6 * rnd()));
        mesh.setMatrixAt(i, m.compose(p, qq.setFromEuler(e), sc));
        const list = front || k < 1.2 ? LEAF_FRONT : LEAF_BEHIND;
        mesh.setColorAt(i, c.set(list[Math.floor(rnd() * list.length)]));
      });
      mesh.frustumCulled = false;
      world.scene.add(mesh);
      return { name, spec, points, object: mesh };
    }
    const how = LOOKS[spec.kind];
    const set = glints(world, { count: points.length, life: 1e5, spread: 0, fall: 0, size: spec.size, colour: how.colour, seed: spec.seed, look: { ...how.look, rise: 0, drift: [0, 0], vary: 0 } });
    points.forEach(([u, v, k], i) => {
      at(u, v, k, p);
      set.position.set([p.x, p.y, p.z], i * 3);
      // born long ago: a glint fades in over the first tenth of its life (sparkles.js), so these are lit from the first frame
      set.birth[i] = -0.12 * 1e5;
    });
    run(world, set, 1e9, `gramedla ${name}`);
    return { name, spec, points, object: set.points };
  }
  function setParticles(names = []) {
    for (const name of names) if (!groups.has(name)) groups.set(name, makeGroup(name));
    for (const [name, g] of groups) g.object.visible = names.includes(name);
  }

  // ---- the trees' bend: the far lane's crowns thrown sideways (a shake), or bent away from the lane's middle (the blast) ----
  const bent = new Map(); // geometry -> Map(vertex -> [x, y, z] as built)
  const plants = [];
  let bentCount = 0;
  function bendTrees(spec, placements) {
    // back as built
    for (const [geo, saved] of bent) {
      const pos = geo.attributes.position;
      for (const [i, [x, y, z]] of saved) pos.setXYZ(i, x, y, z);
      pos.needsUpdate = true;
    }
    bentCount = 0;
    if (!spec) return;
    if (!plants.length) for (const p of placements) if (p.height > 2.5) plants.push(p);
    const amount = spec.shake ?? spec.away ?? 0;
    const [d0, d1] = spec.depth;
    const nearest = (x, z) => {
      let best = null, bd = 3;
      for (const p of plants) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    world.forest.group.traverse(o => {
      const cull = o.userData?.cull;
      if (!o.isMesh || !cull?.ranges || !o.geometry?.attributes?.position) return;
      const pos = o.geometry.attributes.position;
      let saved = bent.get(o.geometry);
      if (!saved) bent.set(o.geometry, saved = new Map());
      const done = new Set();
      for (const r of cull.ranges) {
        const c = r.sphere.center;
        const depth = camPos.z - c.z;
        if (depth < d0 - 4 || depth > d1 + 6 || Math.abs(c.x) > 18) continue;
        const plant = nearest(c.x, c.z);
        if (!plant) continue;
        const pd = camPos.z - plant.z;
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
          const [x, y, z] = saved.get(vi);
          const f = Math.min(1, Math.max(0, (y - base) / h)) ** 1.6;
          bentCount++;
          pos.setXYZ(vi, x + side * strength * f, y - 0.25 * strength * f * f, z);
        }
      }
      pos.needsUpdate = true;
    });
  }

  return { setButterfly, butterflyAt, setBirds, flock, setFlugedla, beak: () => (beakLocal ? beak() : null), her, herBody, boy, get riding() { return riding; }, ready, setParticles, groups, bendTrees, get bentCount() { return bentCount; }, fly };
}
