import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { createActor } from '../../engine/actor.js';
import { createThorsedlaLod } from '../../engine/hals/thorsedla-lod.js';
import { Handle } from '../../engine/handle.js';
import { seededRandom } from '../../engine/random.js';
import { sparkleBurst } from './sparkles.js';

// The far friends of chapter 2's lookout (spec scene 6, "Vinirnir í fjarska"): Slóeðla wading in a far pool, Flugeðla on a dead white
// snag standing out of the Fen and Uggeðla lying in the reed with her sail up, each at real size and 80 to 100 m from Þórseðla's
// head, where Egill finds them; and Grameðla, the sixth friend, at the edge of the forest beyond the Fen, seen from there once and
// not found (find: false), as she comes in a later chapter. They are the game's own models drawn only with Háls og hali's light
// levels (engine/hals/thorsedla-lod.js: a welded copy of the skin, 1,400 triangles, coloured from its texture in its vertices), as
// the board's watching friends are: made in a world of their own whose renderer is null, so character-lod.js keeps no full levels
// of them, casting no shadow and without their eyelid shells (a speck at that distance). They show only while the camera is more
// than 6 m up, from her head: in every frame on the ground they are hidden and are not even moved, so they cost nothing there.
//
//   const far = createFarFriends(world, { friends: { sloedla: { position: [x, y, z], heading, clip: 'wade' }, ... }, sun, defer })
//     defer      true: nothing is fetched or made until prefetch() or load() (chapter 2 makes them after the start button shows)
//     position   x and z where the friend stands, and y how far above the ground there its feet are (for Flugeðla, perch:
//                'snag', above the top of the dead snag the forest grew there; for one lying, sink: metres her body goes into the reed)
//     reed       a bed of tall golden reed round her, that she lies in ({ clumps, near, radius: [in, out], height: [low, high],
//                toward }: `near` of the clumps on the side `toward` faces): the prop's own, seen with her from above (the forest's
//                reed is culled 64 m from the camera, and she lies 88 m out)
//     heading    degrees, 0 facing +X and 90 facing +Z, as everywhere
//     clip       what she does while she waits: 'idle', or 'wade' (a few slow steps along her pool now and then, on the walk clip
//                where the model has no wading clip of its own)
//     find       false for one who is only seen, not found (Grameðla): no target for the search; the chapter moves her itself
//                (far.actorOf(name): her clips and walks, on the ground there)
//   far.targets                     [{ name, point, radius: 2.5 }] for s.search: each point is the friend's middle, kept up to date
//   far.show(on)                    puts them out (in the place they belong to, grounded on its ground), or away
//   far.glimmer(name, on)           gold glints round her now and then, while she waits to be found
//   far.react(name) -> Handle       found: Slóeðla steps toward the lookout and calls, Flugeðla spreads her wings (the first half
//                                   of takeOff, then land), Uggeðla lifts her head (kink); done when it is over
//   far.withhold(name, on)          keeps one of them out of sight while the others show (a friend not to be seen yet)
//   far.update(dt, camera, heightPx) every frame (the chapter puts it on world.effects)
//   far.ready() -> Promise          resolves when the models and their light levels are there (or could not be: they stay hidden);
//                                   it starts making them if nobody has
//   far.prefetch() -> Promise       with `defer`: fetches the models' files now, and makes nothing (no long frame); resolves when
//                                   they are all here (at once where the files are read another way: tests)
//   far.load() -> Promise           with `defer`: makes them now (parsing a model and making an actor are long frames: the chapter
//                                   calls this where nobody sees one, behind the start button or under a black fade); a file is let
//                                   go once its model is made
//   far.dispose()                   once they will not be seen again: frees the GPU buffers of the light level each draws with (the
//                                   level stays in thorsedla-lod.js's cache, which Háls og hali shares, and is uploaded again if drawn
//                                   again), disposes the coarse material and the reed, and lets the actors go; the models' own skins
//                                   and maps go with them (made from the fetched files), or stay with actor.js's cache where it loaded
//                                   them (no prefetch)
//   far.actorOf(name), far.group, far.isReady, far.disposed

const MODELS = { sloedla: 'parasaurolophus', flugedla: 'pteranodon', uggedla: 'spinosaurus', gramedla: 'trex' };
const url = model => new URL(`../../assets/characters/${model}.glb`, import.meta.url).href;
export const SHOW_ABOVE = 6; // metres the camera must be above for them to show
const LIGHT_ONLY = [Infinity, Infinity, Infinity, Infinity]; // thorsedla-lod's levels by pixels: always the lightest
const TARGET_RADIUS = 2.5;
const GLIMMER = { every: 1.25, count: 11, size: 1.7, spread: 2.6, duration: 1.3 };
const WADE = { every: [6, 10], reach: 2.6, speed: 0.55 };
const FOUND_BURST = { count: 36, size: 2.2, spread: 4, duration: 1.8 };
const REED = { blades: 11, width: 0.2, colours: ['#7d6d33', '#c9b45a', '#e3d08a'] }; // the Fen's reed and its tips (spec: útlit Fensins)

/**
 * A bed of reed round (x, z) on the ground `heightAt` gives: `clumps` tufts between radius[0] and radius[1] m from it, thickest
 * toward `toward` (a bearing, radians: the lookout's side), each a fan of curved, tapering blades from dark at the foot to pale at the
 * tip, one mesh with its colours in its vertices.
 */
function reedBed({ x, z, heightAt, clumps = 9, near = 0.6, radius = [1.8, 4], height = [2.2, 3.2], toward = 0, seed = 'reed' }) {
  const random = seededRandom(seed);
  const positions = [], colours = [], index = [];
  const tone = REED.colours.map(hex => new THREE.Color(hex));
  const c = new THREE.Color();
  for (let k = 0; k < clumps; k++) {
    // most clumps on the side she is seen from, the rest round her
    const side = k < clumps * near ? toward + (random() - 0.5) * 1.5 : random() * Math.PI * 2;
    const r = radius[0] + random() * (radius[1] - radius[0]);
    const cx = x + Math.cos(side) * r, cz = z + Math.sin(side) * r, cy = heightAt(cx, cz) - 0.1;
    const tall = height[0] + random() * (height[1] - height[0]);
    for (let b = 0; b < REED.blades; b++) {
      const turn = random() * Math.PI * 2, lean = 0.15 + random() * 0.45, h = tall * (0.6 + 0.4 * random());
      const across = new THREE.Vector3(-Math.sin(turn), 0, Math.cos(turn)).multiplyScalar(REED.width * (0.7 + 0.6 * random()));
      const out = new THREE.Vector3(Math.cos(turn), 0, Math.sin(turn));
      const foot = new THREE.Vector3(cx + out.x * 0.25 * random(), cy, cz + out.z * 0.25 * random());
      const first = positions.length / 3;
      const rows = 4;
      for (let i = 0; i <= rows; i++) {
        const t = i / rows;
        const p = foot.clone().addScaledVector(out, lean * t * t * h * 0.5).add(new THREE.Vector3(0, h * t, 0));
        const w = 1 - t * 0.92; // tapering to a point
        positions.push(p.x - across.x * w, p.y, p.z - across.z * w, p.x + across.x * w, p.y, p.z + across.z * w);
        c.copy(tone[0]).lerp(tone[1], Math.min(1, t * 1.6)).lerp(tone[2], Math.max(0, t - 0.6) * 2.5);
        colours.push(c.r, c.g, c.b, c.r, c.g, c.b);
        if (i < rows) {
          const a = first + i * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.name = 'Far friend reed';
  mesh.castShadow = mesh.receiveShadow = false;
  return mesh;
}

// `sun` (the scene's sun) is taken as the board's friends take it, and not used: at this distance they cast no shadow, and
// thorsedla-lod.js would add a caster for a sun that casts.
// eslint-disable-next-line no-unused-vars
export function createFarFriends(world, { friends, sun = null, defer = false } = {}) {
  const group = new THREE.Group();
  group.name = 'Far friends';
  group.visible = false;
  world.scene.add(group);
  // Háls og hali's light levels, without the sun: no shadow casters.
  const lod = createThorsedlaLod(null);
  let shown = false;
  let isReady = false;
  let disposed = false;
  let time = 0;

  const entries = new Map(Object.entries(friends).map(([name, spec], i) => [name, {
    name, spec, actor: null, home: null, glimmering: false, nextGlint: 0.3 * i, glints: 0, wades: 0, timers: [], nextWade: 0, wadeOut: true,
    withheld: false, skins: [], // skins: the meshes' own geometry and material, from the models (the light levels replace them)
    target: { name, point: new THREE.Vector3(spec.position[0], (spec.position[1] ?? 0) + 2, spec.position[2]), radius: TARGET_RADIUS },
  }]));
  const targets = [...entries.values()].filter(entry => entry.spec.find !== false).map(entry => entry.target);

  /** The ground a friend stands on: the place's ground, the top of the snag she perches on, or a little under it for one lying. */
  function groundOf(entry) {
    const [x, , z] = entry.spec.position;
    if (entry.spec.perch === 'snag') {
      const snag = world.forest?.info?.placementList?.find(p => p.name === 'deadSnag' && Math.hypot(p.x - x, p.z - z) < 1.5);
      if (snag) return snag.y + (snag.height ?? 0);
    }
    return world.heightAt(x, z) - (entry.spec.sink ?? 0);
  }

  /** Puts each friend where she belongs, on the ground of the place in view now. */
  function ground() {
    for (const entry of entries.values()) {
      if (!entry.actor) continue;
      const [x, y = 0, z] = entry.spec.position;
      const base = groundOf(entry) + y;
      entry.own.heightAt = entry.spec.perch === 'snag' ? () => base : (px, pz) => world.heightAt(px, pz) - (entry.spec.sink ?? 0) + y;
      entry.actor.place(x, z, entry.spec.heading ?? 0);
      entry.home = entry.actor.root.position.clone();
      entry.actor.centre(entry.target.point);
      if (entry.spec.reed) {
        entry.reed?.geometry.dispose();
        entry.reed?.material.dispose();
        entry.reed?.removeFromParent();
        const toward = entry.spec.reed.toward ?? 0;
        entry.reed = reedBed({ x, z, heightAt: world.heightAt, ...entry.spec.reed, toward, seed: `reed ${entry.name}` });
        group.add(entry.reed);
      }
    }
  }

  async function load(entry) {
    const own = Object.create(world);
    own.renderer = null; // its own light levels (thorsedla-lod.js), not character-lod.js's
    own.scene = { add: object => group.add(object), remove: object => group.remove(object) };
    entry.own = own;
    const address = url(MODELS[entry.name]);
    // tests read the file themselves; a page that fetched it already (prefetch) parses those bytes; else actor.js loads it
    const bytes = files.get(entry.name);
    const gltf = world.loadModel ? await world.loadModel(address) : bytes ? await parse(await bytes, address) : undefined;
    files.delete(entry.name); // the file's 2.2-2.7 MB, let go once its model is made
    const actor = await createActor(own, { name: `far-${entry.name}`, url: address, gltf, position: entry.spec.position, heading: entry.spec.heading ?? 0 });
    // A speck at 80 m: no eyelid shells, no shadow either way.
    const lids = [];
    actor.model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      if (/eyelids/i.test(o.name)) lids.push(o);
    });
    for (const lid of lids) lid.removeFromParent();
    actor.model.traverse(o => { if (o.isMesh) entry.skins.push({ mesh: o, geometry: o.geometry, material: o.material }); });
    entry.actor = actor;
    play(entry, entry.spec.clip === 'wade' && !actor.clips.has('wade') ? 'idle' : entry.spec.clip ?? 'idle');
    await lod.add(actor, { levels: LIGHT_ONLY });
  }

  function play(entry, clip, options = {}) {
    if (!entry.actor?.clips.has(clip)) return null;
    return entry.actor.play(clip, { fade: 0.4, ...options });
  }

  /** Something to do `delay` seconds from now, on the friends' own clock (it runs while they show). */
  function after(entry, delay, fn) {
    entry.timers.push({ at: time + delay, fn });
  }

  // the models' files, fetched ahead of making them (prefetch): name -> promise of an ArrayBuffer
  const files = new Map();
  function prefetch() {
    if (world.loadModel || typeof fetch !== 'function' || loading) return Promise.resolve();
    for (const entry of entries.values()) {
      if (files.has(entry.name)) continue;
      const address = url(MODELS[entry.name]);
      files.set(entry.name, fetch(address).then(response => {
        if (!response.ok) throw new Error(`${address}: ${response.status}`);
        return response.arrayBuffer();
      }));
    }
    return Promise.all([...files.values()].map(file => file.catch(() => null))).then(() => {}); // a file that fails: load says so
  }
  const parse = (bytes, address) => new GLTFLoader().parseAsync(bytes, new URL('./', address).href);

  let loading = null;
  function loadAll() {
    loading ??= Promise.all([...entries.values()].map(entry => load(entry).catch(error => {
      console.warn(`[far-friends] ${entry.name} could not be made:`, error?.message ?? error);
    }))).then(() => {
      isReady = [...entries.values()].every(entry => entry.actor);
      if (shown) ground();
    });
    return loading;
  }
  if (!defer) loadAll();

  function show(on = true) {
    shown = Boolean(on);
    if (shown && isReady) ground();
  }

  function withhold(name, on = true) {
    const entry = entries.get(name);
    if (entry) entry.withheld = Boolean(on);
  }

  function glimmer(name, on = true) {
    const entry = entries.get(name);
    if (!entry) return;
    entry.glimmering = Boolean(on);
    entry.nextGlint = time;
  }

  /** Slóeðla's slow wading: a few steps one way along her pool, and later back. */
  function wade(entry) {
    if (!entry.home || entry.actor.walking || entry.reacting) return;
    const h = THREE.MathUtils.degToRad(entry.spec.heading ?? 0);
    const out = entry.wadeOut ? WADE.reach : 0;
    entry.wadeOut = !entry.wadeOut;
    const to = [entry.home.x + Math.cos(h) * out, entry.home.z + Math.sin(h) * out];
    const back = entry.wadeOut; // she comes back facing the other way, and turns to her heading again
    entry.actor.walkTo([to], { speed: WADE.speed, clip: entry.actor.clips.has('wade') ? 'wade' : 'walk' });
    if (back) after(entry, 7, () => { if (!entry.actor.walking) entry.actor.turnTo(entry.spec.heading ?? 0, { rate: 40 }); });
  }

  function react(name) {
    const entry = entries.get(name);
    const handle = new Handle(`far ${name}`);
    if (!entry?.actor) return handle.finish();
    entry.reacting = true;
    entry.glimmering = false;
    sparkleBurst(world, entry.target.point.clone(), { ...FOUND_BURST, seed: `found ${name}` });
    const done = seconds => after(entry, seconds, () => {
      entry.reacting = false;
      handle.finish();
    });
    const { actor } = entry;
    if (name === 'sloedla') {
      // a few steps toward the lookout, and she calls
      const h = THREE.MathUtils.degToRad(entry.spec.heading ?? 0);
      const from = actor.root.position;
      actor.walkTo([[from.x + Math.cos(h) * 1.8, from.z + Math.sin(h) * 1.8]], { speed: 0.8 });
      after(entry, 2.4, () => play(entry, 'call', { fade: 0.35 }));
      after(entry, 2.4 + (actor.clips.get('call')?.duration ?? 4), () => play(entry, 'idle', { fade: 0.6 }));
      done(3.6);
    } else if (name === 'flugedla') {
      // she spreads her wings: the first half of her take-off, then she settles again
      const takeOff = actor.clips.get('takeOff');
      play(entry, 'takeOff', { fade: 0.25, once: true });
      const half = (takeOff?.duration ?? 3.2) / 2;
      after(entry, half, () => play(entry, 'land', { fade: 0.35, once: true }));
      after(entry, half + (actor.clips.get('land')?.duration ?? 3), () => play(entry, 'idle', { fade: 0.5 }));
      done(half + 1.6);
    } else {
      // she lifts her head out of the reed
      play(entry, 'kink', { fade: 0.3 });
      after(entry, actor.clips.get('kink')?.duration ?? 2.4, () => play(entry, 'idle', { fade: 0.6 }));
      done(2.4);
    }
    return handle;
  }

  const glintAt = new THREE.Vector3();
  function update(dt, camera, heightPx = 800) {
    if (disposed) return;
    time += dt;
    for (const entry of entries.values()) {
      for (const timer of [...entry.timers]) {
        if (time < timer.at) continue;
        entry.timers.splice(entry.timers.indexOf(timer), 1);
        timer.fn();
      }
    }
    const high = shown && isReady && Boolean(camera) && camera.position.y > SHOW_ABOVE;
    group.visible = high;
    if (!high) return; // on the ground they are not seen, and nothing of them is moved or drawn
    for (const entry of entries.values()) {
      entry.actor.root.visible = !entry.withheld;
      if (entry.reed) entry.reed.visible = !entry.withheld;
      if (entry.withheld) continue;
      entry.actor.update(dt);
      if (!entry.reacting) entry.actor.centre(entry.target.point);
      if (entry.spec.clip === 'wade' && time >= entry.nextWade) {
        wade(entry);
        entry.nextWade = time + WADE.every[0] + ((entry.wades++ * 0.618) % 1) * (WADE.every[1] - WADE.every[0]);
      }
      if (entry.glimmering && time >= entry.nextGlint) {
        entry.nextGlint = time + GLIMMER.every;
        glintAt.copy(entry.target.point);
        sparkleBurst(world, glintAt.clone(), { count: GLIMMER.count, size: GLIMMER.size, spread: GLIMMER.spread, duration: GLIMMER.duration, seed: `glimmer ${entry.name} ${entry.glints++ % 6}` });
      }
    }
    lod.update(camera, heightPx);
  }

  return {
    targets, group, show, withhold, glimmer, react, update,
    ready: () => loadAll(),
    prefetch,
    load: () => loadAll(),
    get isReady() { return isReady; },
    get shown() { return shown; },
    get disposed() { return disposed; },
    actorOf: name => entries.get(name)?.actor ?? null,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.visible = false;
      for (const entry of entries.values()) {
        // the GPU buffers of the light level (the geometry stays in thorsedla-lod.js's cache) and the coarse material drawn with
        // it; the model's own skin and map are actor.js's cache's
        for (const { mesh, geometry, material } of entry.skins) {
          if (mesh.geometry !== geometry) mesh.geometry.dispose();
          if (mesh.material !== material) mesh.material.dispose();
        }
        entry.actor?.dispose();
        entry.reed?.geometry.dispose();
        entry.reed?.material.dispose();
        entry.timers.length = 0;
      }
      group.removeFromParent();
    },
  };
}
