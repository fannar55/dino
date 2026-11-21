// Uggeðla í tjörninni (?chapter=tjorn3d): a show for a screen LYING FLAT on a table, watched through the red/cyan glasses from one
// seat (the plan: docs/superpowers/specs/2026-11-19-uggedla-i-tjorninni-bordmynd-design.md). The screen is the surface of a pond:
// what is over it stands up out of the screen, what is under it is seen through it as through a window. This is step 1 of the
// plan: the key frames as stills that live (she breathes and blinks, the fish idle, rings spread), one at a time, with the real
// numbers in a label, for the owner to judge on his tablet. No sound, no speech, no end, no tile in the book.
//
//   ?chapter=tjorn3d&lykill=1              the glasses start, then key 1; ‹ › (or the arrow keys): 1, 2, 3, 4a, 4b, 4c, 5, 6
//   &lykill=4b                             that key at once
//   &skjar=  &fjarlaegd=  &horn=  &augu=  &gler=0  &sjon=1    the table's own knobs (engine/table-stage.js); the screen's size is
//                                          remembered on the device, for this page and Mosi's (chapters/bord3d.js)
//   &grugg=0.16  &tint=0.34                the murk's density per metre under the water, and how much of the water's colour lies on its surface
//
// The stage (tjorn3d/keys.js has every number): the pond is the Fen's own water in a pool far wider than the page, 15 cm deep on
// the table; one cm of the table is SCALE metres of the game. The water is the game's surface with most of its colour taken off, so
// what is under it shows, and a murk under it (tjorn3d/murk.js): a thing is dimmer the deeper it lies and fades into the water's
// mid tone, so the deep is a place of dark shapes and the bed is never seen. Of the forest only the pool's bed, the water and the
// lilies stay. She is chapter 2's Uggeðla, on its rig (chapters/kafli2-uggedla.js: her sink, her neck, her strike, her jaw), with
// her whole body tipped nose up where a key says so: at this size she is 23 cm long and her sail 12 cm tall, so she can only ever
// show a part of herself over the table, and her sail must stay under the water (or low) wherever her head is the tall thing: a
// tall thing's picture stretches away from the viewer, and the sail is behind her head. What is under the water is put by where
// its picture is to lie (keys.js: under). world.tjorn.measure() gives the numbers (tools/tjorn3d-probe.mjs asks it).
import * as THREE from 'three';
import { endCard, glassesStart } from '../engine/book/show-cards.js';
import { leaveShow } from '../engine/book/show-player.js';
import { onTable, parallaxAt, outlineBox, marginsOf, placeEye } from '../engine/table3d.js';
import { MARGIN, tableKnobs, screenSize, tablePage, createTableStage } from '../engine/table-stage.js';
import { tableUi, tableStart, tala } from '../engine/table-ui.js';
import { FEN } from '../world/forest/config.js';
import { lieLow } from './kafli2-uggedla.js';
import { SCALE, POND, LILIES, FROG, BUTTERFLY, KEYS, keyIndex, under } from './tjorn3d/keys.js';
import { installMurk, through } from './tjorn3d/murk.js';
import { createCast, verticesOf } from './tjorn3d/cast.js';
import { createShow } from './tjorn3d/play.js';
import { createShowMeasure } from './tjorn3d/measure.js';
import { LENGTH, FADE, WARM, partAt } from './tjorn3d/show.js';
import { createPondSound } from './tjorn3d/sound.js';

const CHARS = '../assets/characters/';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const SHOW = params.get('lykill') === null; // the show itself (step 2); with lykill= the page of its key frames (step 1)
const { knob, seat: SEAT, sjon: SJON, mono: MONO, mode: MODE } = tableKnobs(params);
const LEVEL = FEN.waterLevel; // the surface's height in the place: the screen's plane
const S = SCALE;
const MURK = knob('grugg', POND.murk.density, 0, 2);
const CLEAR = knob('tint', POND.clear, 0, 1);
const PHASES = 4; // moments of her breathing her picture is bounded over
const ROUNDS = 9; // at most so many times her place is worked out from what the last one showed over the surface
const REACH_ROUNDS = 4; // of them, the first so many put her where her snout reaches the fish (key 5)
const NEAR = 0.006; // m: near enough (a tenth of a millimetre on the table)
const SWAY = 1 / 0.43; // s: one round of the rig's slow sway of her body (chapters/kafli2-uggedla.js)
const BUBBLE_SIZE = 7; // the water's own bubbles (3 to 7 cm in the game) drawn this many times larger: half a centimetre on the table
const BUBBLE = { each: 6, apart: 0.22, seconds: 1.8, size: 0.05 }; // a burst: so many, s apart, s to rise, metres at the game's size
const RING_LIFE = 2.6; // s (world/props/water.js)
const SHOWS = 0.05; // a thing under the water counts as seen while the murk lets this share of it through
// A lily at the plant's own size (world/forest/species.js): its pads within 1.05 m of its middle, their rims at most 2.7 cm over the
// water, its flower's petals from 5 cm up. A triangle reaching over LILY_STANDS (times the lily's scale) is of a flower.
const LILY_REACH = 1.1;
const FISH_THICK = 0.14; // half the fish's width across its back and belly, as a share of its length
const FLAP = { mid: 0.85, swing: 0.3, pace: 1.2 }; // the butterfly's wings: radians up from flat, and how fast they open and close
const PERCH_OVER = 0.05; // cm: the butterfly's feet this far over her skin, so that no point of it is ever in her
const LILY_STANDS = 0.04;
const rad = d => (d * Math.PI) / 180;
const r3 = x => Math.round(x * 1000) / 1000;

export { KEYS };

export const chapter = {
  id: 'tjorn3d',
  title: 'Uggeðla í tjörninni',
  look: 'morning',
  gler: { panel: false },
  startButton: doc => tableStart(doc, glassesStart(doc, { more: 'Leggðu skjáinn flatan á borð og horfðu skáhallt niður á hann.' })),
  // one pool, far wider than the page at any size, its bank and the fen round it never in the window. The place's clearing is on
  // dry ground north of it, off the page: the ground's heights are counted from the clearing's middle (world/forest/terrain.js), so
  // it must not lie in the pool, or the water's one level would be under its bed. The path is farther off still.
  layout: {
    seed: 23,
    clearing: { center: [0, -110], radius: 16 },
    forestEdge: 22,
    path: [[-120, -150], [-60, -144], [0, -142], [60, -144], [120, -150]],
    biome: 'fen',
    water: { pools: [{ center: [0, 0], radius: POND.radius, depth: POND.bed * S }] },
    plants: LILIES.map(l => ({ name: 'waterLily', position: [l.at[0] * S, l.at[1] * S], variant: l.variant, scale: l.scale })),
  },
  actors: {
    uggedla: { url: CHARS + 'spinosaurus.glb', position: [0, 0, 0], heading: 90 },
  },
  startShot: 'table',
  shots: { table: { position: [0, 3, -96], target: [0, 2, -110], fov: 40 } }, // over the dry clearing; the table's own camera takes over at once (engine/table-stage.js)

  *script(s) {
    const uggedla = s.actor('uggedla');
    const her = uggedla.raw;
    const world = her.world;
    const { camera, scene } = world;
    const win = typeof window !== 'undefined' ? window : null;
    const water = world.forest.water;
    const V = (x, y, z, out = new THREE.Vector3()) => out.set(x * S, LEVEL + y * S, z * S); // a point of the table (cm) in the world

    // ---- the pond alone: the ground (its bed), the water, the lilies; no trees' shadows, mist, animals or music ----
    // Of the forest's plants only the lilies stay: each batch of plants (a merged mesh, its points in the world) is taken out and a
    // mesh of its lily triangles alone put in its place, on the same points and material (so they sway on the water as they do in
    // the game). Each lily's triangles are told apart by height: its pads lie on the water, its flower stands up from it.
    const lilyParts = LILIES.map(() => ({ pads: [], flowers: [] })); // triangles on the water, [x, z] three times
    const lilyPoints = []; // the flowers' points, for the measure: x, metres over the surface, z
    const plants = [];
    for (const child of [...world.forest.group.children]) {
      if (child.name === 'Forest ground' || child === water.group) continue;
      world.forest.group.remove(child);
      const at = child.isMesh && /^Forest (?!caster|cards|life)/.test(child.name) && child.geometry.attributes.position;
      const master = child.userData.cull?.master; // all its triangles (its own index holds only what its culling last kept: world/forest/batch.js)
      if (!at || !master) continue;
      const mine = [];
      for (let i = 0; i < master.length; i += 3) {
        const a = master[i], b = master[i + 1], d = master[i + 2];
        const x = at.getX(a), z = at.getZ(a);
        let lily = -1, least = Infinity;
        LILIES.forEach((l, n) => { const far = Math.hypot(x - l.at[0] * S, z - l.at[1] * S); if (far < LILY_REACH * l.scale && far < least) { lily = n; least = far; } });
        if (lily < 0) continue;
        mine.push(a, b, d);
        const triangle = [x, z, at.getX(b), at.getZ(b), at.getX(d), at.getZ(d)];
        if (Math.max(at.getY(a), at.getY(b), at.getY(d)) - LEVEL > LILY_STANDS * LILIES[lily].scale) {
          lilyParts[lily].flowers.push(triangle);
          for (const v of [a, b, d]) lilyPoints.push(at.getX(v), at.getY(v) - LEVEL, at.getZ(v));
        } else lilyParts[lily].pads.push(triangle);
      }
      if (!mine.length) continue;
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(child.geometry.attributes)) geometry.setAttribute(name, attribute);
      geometry.setIndex(mine);
      const lilies = new THREE.Mesh(geometry, child.material);
      lilies.name = `Tjörn lilies (${child.name})`;
      lilies.frustumCulled = false;
      lilies.castShadow = false;
      lilies.receiveShadow = false;
      lilies.renderOrder = child.renderOrder;
      scene.add(lilies);
      plants.push(lilies);
    }
    world.music?.setLevel?.(0, 0);
    const kept = world.forest.group.children.map(child => child.name);
    installMurk(scene, { level: LEVEL, tone: POND.murk.tone, deep: POND.murk.deep, dim: POND.murk.dim, bed: POND.bed * S, density: MURK });
    // the surface: the game's own, with most of its colour taken off so that what is under it shows (its rings stay as they are)
    {
      const material = water.surface.material;
      material.fragmentShader = material.fragmentShader
        .replace('uniform float uFade;', 'uniform float uFade;\nuniform float uClear;')
        .replace('mix( 0.8, 0.95, deep ) + fresnel * 0.3', '( mix( 0.8, 0.95, deep ) + fresnel * 0.3 ) * uClear');
      material.uniforms.uClear = { value: CLEAR };
      material.needsUpdate = true;
    }
    // its rings and its clock: the page writes the rings a key has straight into the water's own (slots 2 to 7; the first two are
    // the water's faint rings at the lilies), each by the clock alone, so a capture at a time shows the same rings as playing does
    const ripples = water.surface.material.uniforms.uRipples.value;
    const clock = water.surface.material.uniforms.uTime;
    // its bubbles: the water's own material on points of this page's own, put by the clock too, at the table's size whatever
    // camera draws them
    const MOST_BUBBLES = 4 * BUBBLE.each;
    const bubbles = new THREE.Points(new THREE.BufferGeometry(), water.group.getObjectByName('Water bubbles').material);
    bubbles.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOST_BUBBLES * 3), 3));
    bubbles.geometry.setAttribute('aBubble', new THREE.BufferAttribute(new Float32Array(MOST_BUBBLES * 4).fill(1e9), 4));
    bubbles.name = 'Tjörn bubbles';
    bubbles.frustumCulled = false;
    bubbles.renderOrder = 9;
    {
      const size = new THREE.Vector2();
      bubbles.onBeforeRender = (renderer, _scene, cam) => {
        renderer.getDrawingBufferSize(size);
        bubbles.material.uniforms.uPixelScale.value = (BUBBLE_SIZE * size.y * cam.projectionMatrix.elements[5]) / 2;
      };
    }
    scene.add(bubbles);

    // ---- Uggeðla: chapter 2's rig, and her whole body tipped nose up as a key says ----
    const c = { uggedla, world, mosi: null, egill: null };
    uggedla.place(0, 0, 90);
    const rig = lieLow(c);
    const tip = { pitch: 0 };
    her.control(dt => { rig.drive(dt); her.root.rotation.z = rad(tip.pitch); }, rig.pose);
    her.model.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); // no hard shadow edges on her over the table
    her.footprintScale = -1000; // nor the ground's soft shade under an actor (world/forest/terrain.js: a capsule this much smaller than nothing), which lay on the bed under her, there or not
    const eyePoint = new THREE.Vector3(0, 20, 20);
    const strikePoint = new THREE.Vector3();
    // her skin at its finest, and which part each vertex is: 1 her head (and jaw), 2 her neck and chest, 0 the rest
    let skin = null;
    her.model.traverse(o => { if (o.isSkinnedMesh && (!skin || o.geometry.attributes.position.count > skin.geometry.attributes.position.count)) skin = o; });
    const part = new Uint8Array(skin.geometry.attributes.position.count);
    {
      const { skinIndex, skinWeight } = skin.geometry.attributes;
      const kind = skin.skeleton.bones.map(b => (/^(Head|Jaw)$/.test(b.name) ? 1 : /^(Neck|Chest)$/.test(b.name) ? 2 : 0));
      for (let i = 0; i < part.length; i++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best)) best = k;
        part[i] = kind[skinIndex.getComponent(i, best)];
      }
    }
    const p = new THREE.Vector3();
    /** Every vertex of her skin where her pose puts it now: x, metres over the surface, z. */
    function cloud() {
      her.root.updateMatrixWorld(true);
      const out = new Float32Array(3 * part.length);
      for (let i = 0, j = 0; i < part.length; i++) {
        skin.getVertexPosition(i, p).applyMatrix4(skin.matrixWorld);
        out[j++] = p.x; out[j++] = p.y - LEVEL; out[j++] = p.z;
      }
      return out;
    }
    /** The points of a cloud that are over the surface (x, metres over it, z), `more` appended. */
    function over(points, more = null) {
      const out = [];
      for (let i = 0; i < points.length; i += 3) if (points[i + 1] > 0) out.push(points[i], points[i + 1], points[i + 2]);
      if (more) for (let i = 0; i < more.length; i += 3) if (more[i + 1] - LEVEL > 0) out.push(more[i], more[i + 1] - LEVEL, more[i + 2]);
      return out;
    }
    const topOf = (points, which = null) => {
      let top = -Infinity;
      for (let i = 0, v = 0; i < points.length; i += 3, v++) if ((which === null || part[v] === which) && points[i + 1] > top) top = points[i + 1];
      return top;
    };

    // ---- the small players ----
    const cast = createCast(world, { fish: 6 });
    // a lily's middle pad's top, and its flower's (world/forest/species.js: the pad lies 1.6 cm over the water at the plant's own size, the flower's heart 5.4)
    const padTop = l => V(l.at[0], 0, l.at[1]).setY(LEVEL + 0.02 * l.scale);
    /**
     * The frog's seat on a lily: the point of its pads farthest from any pad's rim and from its flower (the middle of the widest
     * free one), found on the plants' own triangles as the forest laid them.
     */
    function padSeat(which) {
      const l = LILIES[which], { pads, flowers } = lilyParts[which];
      const cx = l.at[0] * S, cz = l.at[1] * S, reach = LILY_REACH * l.scale, step = 0.06;
      const inside = (t, x, z) => {
        const d1 = (x - t[2]) * (t[1] - t[3]) - (t[0] - t[2]) * (z - t[3]);
        const d2 = (x - t[4]) * (t[3] - t[5]) - (t[2] - t[4]) * (z - t[5]);
        const d3 = (x - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (z - t[1]);
        return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
      };
      const n = Math.ceil(reach / step), on = [], off = [];
      for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
        const x = cx + i * step, z = cz + j * step;
        (pads.some(t => inside(t, x, z)) && !flowers.some(t => inside(t, x, z)) ? on : off).push([x, z]);
      }
      let best = null;
      for (const [x, z] of on) {
        let free = Infinity;
        for (const o of off) { const d = (o[0] - x) ** 2 + (o[1] - z) ** 2; if (d < free) free = d; }
        if (!best || free > best.free) best = { x, z, free };
      }
      return best ? { point: new THREE.Vector3(best.x, LEVEL + 0.02 * l.scale, best.z), radius: Math.sqrt(best.free) } : { point: padTop(l), radius: 0 };
    }
    const frogSeat = padSeat(FROG.lily);
    const flowerTop = l => V(l.at[0], 0, l.at[1]).setY(LEVEL + 0.062 * l.scale);

    // ---- the view: the key and the screen chosen, and what follows from them ----
    const screen = screenSize(params);
    const stage = createTableStage(world, { seat: SEAT, sjon: SJON, mono: MONO, level: LEVEL });
    const view = { index: keyIndex(params.get('lykill')), inches: screen.inches, mode: MODE, dirty: true, solves: 0, key: null, her: null, fish: [], label: '' };
    stage.use(tablePage(win, view.inches), S, [0, 0]); // the eyes are in place before the first frame (the small players are still on their way)

    /** Her pose for a key, with her root at [x, z] (m) and `sink` m under the surface. */
    function poseHer(k, x, z, sink) {
      rig.tweens.length = 0;
      Object.assign(rig.v, { sink, tuck: k.tuck ?? 1, shiver: 0, yaw: 0, lunge: 0, jaw: k.jaw ?? 0, strike: k.strike ? 1 : 0, toss: 0, swim: k.swim ?? 0, curl: 0, life: k.life ?? 0 });
      rig.target = k.strike ? strikePoint : null;
      tip.pitch = k.pitch ?? 0;
      uggedla.place(x, z, k.heading);
    }
    const settle = (steps = 10) => { for (let i = 0; i < steps; i++) her.update(0.1); };
    /** Her clouds at a few moments of one round of her clip and of her rig's slow sway: the same moments every time it is asked. */
    const breath = k => {
      const cycle = her.clips.get(k.clip ?? 'idle').duration / (k.pace ?? 1);
      return Array.from({ length: PHASES }, (_, i) => {
        her.mixer.setTime((i / PHASES) * cycle);
        rig.t = (i / PHASES) * SWAY;
        her.update(1e-3);
        return cloud();
      });
    };

    /**
     * Everything that follows from the key, the screen and the seat. Where a key says how high something stands, her sink is
     * settled so that it does (her pose is first tipped and turned, so a rise is a rise of her whole body); where it says her
     * picture is centred, she is moved along the way to the viewer until the top and the bottom margin of everything of hers
     * over the surface are the same. A few rounds: a new sink changes what is over the surface, her look changes with her place.
     */
    function solve() {
      const key = KEYS[view.index];
      const pg = tablePage(win, view.inches);
      stage.use(pg, S, [0, 0]);
      const { eyes } = stage;
      eyePoint.set(eyes.mid.x, LEVEL + eyes.mid.y, eyes.mid.z);
      Object.assign(view, { ...pg, key, dirty: false, solves: view.solves + 1, her: null });

      // the small players: where this key has them (the butterfly on her snout is put every frame, live())
      const eye = { x: eyes.mid.x / S, y: eyes.mid.y / S, z: eyes.mid.z / S };
      view.fish = key.fish.map(f => ({ ...f, at: under(f.seen, f.depth, eye) }));
      view.fish.forEach((f, i) => cast.fish[i]?.show(V(...f.at), f.heading, f.size * S, { beat: i * 0.37 }));
      for (let i = key.fish.length; i < cast.fish.length; i++) cast.fish[i].hide();
      if (key.jump) cast.jumper.show(V(...key.jump.at), key.jump.heading, key.jump.size * S, { pitch: key.jump.pitch });
      else cast.jumper.hide();
      if (cast.frog.loaded) cast.frog.show(frogSeat.point, FROG.heading, FROG.length * S);

      if (cast.butterfly.loaded && key.butterfly !== 'snout') cast.butterfly.show(flowerTop(LILIES[BUTTERFLY.lily]), BUTTERFLY.heading, BUTTERFLY.span * S, FLAP.mid + FLAP.swing);

      const k = key.her;
      her.root.visible = Boolean(k);
      her.lookAt(k?.look === 'eye' ? out => out.copy(eyePoint) : null, { weight: 1, maxAngle: 60, maxPitch: 40 });
      if (!k) return void label();
      her.play(k.clip ?? 'idle', { fade: 0, timeScale: k.pace ?? 1 });
      let x = k.at[0] * S, z = k.at[1] * S, sink = (k.sink ?? 8) * S;
      let clouds = [];
      for (let round = 0; round < ROUNDS; round++) {
        poseHer(k, x, z, sink);
        if (k.strike === 'fish') {
          // her snout reaches for the fish, which lies crosswise before her, and stops `gap` cm short of its side, a little under
          // its middle. The first rounds she is moved (her neck as her pose has it) until the tip of her snout is under that point;
          // from then on her neck and head reach for it.
          const reaching = round >= REACH_ROUNDS;
          rig.v.strike = reaching ? 1 : 0;
          settle(round ? 4 : 20);
          const short = ((k.gap ?? 0.5) + key.jump.size * FISH_THICK) * S;
          V(...key.jump.at, strikePoint).add(p.set(-short * Math.cos(rad(k.heading)), -(k.under ?? 0.15) * S, -short * Math.sin(rad(k.heading))));
          if (!reaching) { x += strikePoint.x - rig.tip.x; z += strikePoint.z - rig.tip.z; poseHer(k, x, z, sink); rig.v.strike = 0; }
          settle(4);
        } else settle(round ? 4 : 20);
        clouds = breath(k);
        // what is still off: her height, and her picture's place between the page's top and bottom
        let up = 0, back = 0;
        if (k.rise) up = Math.max(...clouds.map(points => topOf(points, k.rise.of === 'head' ? 1 : null))) - k.rise.cm * S;
        if (k.centre) {
          const box = outlineBox(clouds.map(points => over(points)), [eyes.left, eyes.right], [0, 0]);
          if (Number.isFinite(box.z0)) back = (box.z0 + box.z1) / 2;
        }
        if (Math.abs(up) < NEAR && Math.abs(back) < NEAR && !(k.strike && round < REACH_ROUNDS + 1)) break; // she is where the clouds were taken
        if (round === ROUNDS - 1) break; // as near as it gets: the label and the measure say what it is
        sink += up;
        z -= back;
      }
      her.mixer.setTime(s.time); // her clip and her sway go by the scene's clock again
      rig.t = s.time;
      her.update(1e-3);
      // how her picture lies over one breath, for the label (the measure reads the moment)
      const mine = clouds.map(points => over(points, key.jump ? verticesOf(cast.jumper.group) : null));
      const box = outlineBox(mine, [eyes.left, eyes.right], [0, 0]);
      const margins = Number.isFinite(box.x0) ? marginsOf(box, pg.W * S, pg.Hs * S) : null;
      // the middle of where she cuts the surface (her neck, her chest, her sail): rings spread from round there
      const last = clouds[clouds.length - 1];
      const cut = [0, 0, 0];
      for (let i = 0, v = 0; i < last.length; i += 3, v++) if (Math.abs(last[i + 1]) < 0.3) { cut[0] += last[i]; cut[1] += last[i + 2]; cut[2]++; }
      const neck = cut[2] ? [cut[0] / cut[2] / S, cut[1] / cut[2] / S] : [x / S + 4 * Math.cos(rad(k.heading)), z / S + 4 * Math.sin(rad(k.heading))];
      const tip = [rig.tip.x / S, (rig.tip.y - LEVEL) / S, rig.tip.z / S]; // the tip of her snout (cm)
      if (key.butterfly === 'snout' && cast.butterfly.loaded) snout.place(FLAP.mid + FLAP.swing); // it is there, its wings at their highest, when the label is worked out
      view.her = { x, z, sink, neck, tip, top: Math.max(...clouds.map(points => topOf(points))), head: Math.max(...clouds.map(points => topOf(points, 1))), margins };
      label();
    }

    // ---- the page's own things ----
    const ui = !SHOW && typeof document !== 'undefined' ? tableUi(document, {
      step: d => { const to = Math.min(KEYS.length - 1, Math.max(0, view.index + d)); if (to !== view.index) { view.index = to; view.dirty = true; } },
      screen: d => { view.inches = screen.step(d); view.dirty = true; },
      prev: 'Fyrri lykill', next: 'Næsti lykill',
    }) : null;
    if (MONO && typeof document !== 'undefined') document.body.classList.add('bord-mono');
    /** The number a key's label gives, as the page stands now: [words, cm]. */
    function says(key, m) {
      switch (key.says) {
        case 'under': return `${key.name} ${tala(-m.her.solved.topCm)} cm undir`;
        case 'sail': return `${key.name} ${tala(m.her.solved.topCm)} cm`;
        case 'head': return `${key.name} ${tala(m.her.solved.headCm)} cm`;
        case 'fish': return `${key.name} ${tala(m.tops.fish)} cm`;
        case 'butterfly': return `${key.name} ${tala(m.tops.butterfly)} cm`;
        default: return m.top ? `${key.name}, hæst ${tala(m.top.cm)} cm` : key.name;
      }
    }
    function label() {
      const m = measure(false);
      let { least, leastCm } = m.margins;
      const hers = view.her?.margins; // over her whole breath
      if (hers) {
        for (const [edge, share] of Object.entries(hers)) {
          if (least === null || share < least) { least = share; leastCm = share * (edge === 'left' || edge === 'right' ? m.page.W : m.page.Hs); }
        }
      }
      const tight = least === null || least >= MARGIN - 1e-9 ? '' : least < 0 ? ` · kemst ekki fyrir (${tala(-leastCm)} cm út fyrir)` : ` · þröngt (${tala(leastCm)} cm að brún)`;
      view.label = `${view.key.id} · ${says(view.key, m)} · skjár ${tala(view.inches)} tommur${tight}`;
      if (ui) ui.label.textContent = view.label;
    }
    win?.addEventListener('resize', () => { view.dirty = true; });

    /**
     * The numbers, as the page stands now. Everything over the surface (her skin, the fish in the air, the frog, the butterfly,
     * the lilies' flowers) through the two eye cameras the picture is drawn with; lengths in cm, shares of the page's width or depth.
     */
    function measure(drawn = true) {
      const { W, Hs } = view;
      const { eyes } = stage;
      const key = view.key;
      // the cameras the last picture was drawn with, or (for the label, worked out before the next picture is drawn) two put where those will be
      const throughEyes = drawn ? stage.through() : [eyes.left, eyes.right].map(eye => placeEye(new THREE.PerspectiveCamera(), eye, stage.at()));
      const mine = key.her ? cloud() : new Float32Array(0);
      // everything over the surface, by who it is
      const groups = {
        her: over(mine),
        fish: key.jump ? over([], verticesOf(cast.jumper.group)) : [],
        frog: cast.frog.loaded ? over([], verticesOf(cast.frog.group)) : [],
        butterfly: cast.butterfly.loaded && cast.butterfly.group.visible ? over([], verticesOf(cast.butterfly.group)) : [],
        lilies: lilyPoints,
      };
      const ndc = new THREE.Vector3();
      const box = [[Infinity, -Infinity, Infinity, -Infinity], [Infinity, -Infinity, Infinity, -Infinity]];
      const tops = {};
      let top = null;
      for (const [name, points] of Object.entries(groups)) {
        let high = -Infinity;
        for (let i = 0; i < points.length; i += 3) {
          if (points[i + 1] > high) high = points[i + 1];
          if (!top || points[i + 1] > top.y) top = { name, x: points[i], y: points[i + 1], z: points[i + 2] };
          throughEyes.forEach((eye, e) => {
            ndc.set(points[i], points[i + 1] + LEVEL, points[i + 2]).project(eye);
            const b = box[e];
            if (ndc.x < b[0]) b[0] = ndc.x;
            if (ndc.x > b[1]) b[1] = ndc.x;
            if (ndc.y < b[2]) b[2] = ndc.y;
            if (ndc.y > b[3]) b[3] = ndc.y;
          });
        }
        tops[name] = points.length ? r3(high / S) : null;
      }
      const any = Number.isFinite(box[0][0]);
      const share = any ? { left: (Math.min(box[0][0], box[1][0]) + 1) / 2, right: (1 - Math.max(box[0][1], box[1][1])) / 2, top: (1 - Math.max(box[0][3], box[1][3])) / 2, bottom: (Math.min(box[0][2], box[1][2]) + 1) / 2 } : null;
      const least = share ? Math.min(share.left, share.right, share.top, share.bottom) : null;
      const cm = share ? { left: share.left * W, right: share.right * W, top: share.top * Hs, bottom: share.bottom * Hs } : null;
      // the highest point's two pictures on the page
      const pictures = at => throughEyes.map(eye => (ndc.set(at.x, at.y + LEVEL, at.z).project(eye).x * W) / 2);
      const topX = top ? pictures(top) : [0, 0];
      const h = top ? top.y / S : 0;
      // the surface: where both eyes draw three points of it (no parallax), and the deepest things: the bed, her lowest point, the fish
      const surface = [[0, 0, 0], [0.4 * W * S, 0, -0.4 * Hs * S], [-0.3 * W * S, 0, 0.3 * Hs * S]].map(g => { const [l, r] = pictures({ x: g[0], y: 0, z: g[2] }); return l - r; });
      let low = Infinity;
      for (let i = 1; i < mine.length; i += 3) if (mine[i] < low) low = mine[i];
      const fishLow = -Math.max(...key.fish.map(f => f.depth));
      const deep = d => ({ cm: r3(d), parallaxCm: r3(-parallaxAt(-d, eyes.height, SEAT.ipd)), share: r3(-parallaxAt(-d, eyes.height, SEAT.ipd) / W), shows: r3(through(d * S, { density: MURK, dim: POND.murk.dim }, SEAT.a) * (1 - CLEAR) * (1 - THREE.MathUtils.smoothstep(d / POND.bed, 0.82, 1))) });
      // what the viewer sees: points of her seen straight from an eye, against their pictures on the screen seen from that eye (px apart)
      let seen = 0;
      const eyeCam = new THREE.PerspectiveCamera(stage.seatFov, W / Hs, stage.near, stage.far);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), flat = [0, 0];
      for (const eye of [eyes.left, eyes.right]) {
        eyeCam.position.set(eye.x, LEVEL + eye.y, eye.z);
        eyeCam.lookAt(0, LEVEL, 0);
        eyeCam.updateMatrixWorld(true);
        for (let i = 0; i < mine.length; i += 3 * 41) {
          a.set(mine[i], mine[i + 1] + LEVEL, mine[i + 2]).project(eyeCam);
          onTable(eye, mine[i], mine[i + 1], mine[i + 2], flat);
          b.set(flat[0], LEVEL, flat[1]).project(eyeCam);
          seen = Math.max(seen, Math.hypot(((a.x - b.x) * (win?.innerWidth ?? 1280)) / 2, ((a.y - b.y) * (win?.innerHeight ?? 800)) / 2));
        }
      }
      // the deepest thing that can be seen: the lowest of the bed, her and the fish that the murk lets at least a twentieth of through
      const depths = { bed: deep(POND.bed), her: key.her && low < 0 ? deep(-low / S) : null, fish: deep(-fishLow) };
      const seenDeep = Object.entries(depths).filter(([, d]) => d && d.shows >= SHOWS).sort((a, b) => b[1].cm - a[1].cm)[0];
      // nothing passes through another: the least distance from any point of a fish to any point of her skin (the picture's own
      // moment only: it takes a while to work out)
      const apart = points => {
        let least = Infinity;
        for (let i = 0; i < points.length; i += 3) {
          for (let j = 0; j < mine.length; j += 3) {
            const d = (points[i] - mine[j]) ** 2 + (points[i + 1] - LEVEL - mine[j + 1]) ** 2 + (points[i + 2] - mine[j + 2]) ** 2;
            if (d < least) least = d;
          }
        }
        return r3(Math.sqrt(least) / S);
      };
      const clear = drawn && key.her ? {
        fishCm: Math.min(...view.fish.map((f, i) => apart(verticesOf(cast.fish[i].group)))),
        jumperCm: key.jump ? apart(verticesOf(cast.jumper.group)) : null,
      } : null;
      const round = o => (o ? Object.fromEntries(Object.entries(o).map(([n, v]) => [n, r3(v)])) : null);
      return {
        key: key.id, name: key.name, label: view.label, mode: view.mode,
        through: !MONO && world.gler ? 'the glasses\' eye cameras' : 'eye cameras made for the measure',
        page: { px: [win?.innerWidth, win?.innerHeight], screenPx: view.screenPx, inches: view.inches, W: r3(W), Hs: r3(Hs) },
        seat: { ...SEAT, eyeHeight: r3(eyes.height) },
        scale: S,
        top: top ? { of: top.name, cm: r3(h), parallaxCm: r3(topX[0] - topX[1]), formulaCm: r3(parallaxAt(h, eyes.height, SEAT.ipd)), share: r3((topX[0] - topX[1]) / W) } : null,
        tops,
        her: key.her ? { headCm: r3(topOf(mine, 1) / S), topCm: r3(topOf(mine) / S), lowCm: r3(low / S), sinkCm: r3(rig.v.sink / S), at: [r3(her.root.position.x / S), r3(her.root.position.z / S)], pitch: tip.pitch, solved: view.her ? { margins: round(view.her.margins), topCm: r3(view.her.top / S), headCm: r3(view.her.head / S) } : null } : null,
        margins: { share: round(share), cm: round(cm), least: least === null ? null : r3(least), leastCm: cm ? r3(Math.min(cm.left, cm.right, cm.top, cm.bottom)) : null, fits: least === null || least >= MARGIN - 1e-9 },
        deepest: { ...depths, seen: seenDeep ? { of: seenDeep[0], ...seenDeep[1] } : { of: 'nothing', cm: 0, parallaxCm: 0, share: 0, shows: 0 } },
        butterfly: key.butterfly === 'snout' ? snout.report(drawn) : null,
        clear,
        surfaceParallaxCm: surface.map(x => Math.round(x * 1e6) / 1e6),
        seenErrorPx: Math.round(seen * 1000) / 1000,
        murk: { density: MURK, clear: CLEAR },
      };
    }

    // ---- the butterfly on her snout: on the top of it, a little back from its tip, its feet on her skin ----
    const snout = (() => {
      const head = rig.bones.Head;
      let perch = null; // where it stands, in her Head bone's frame
      let slope = null; // her skin's own way out there (a unit vector in that frame)
      let skin = null; // her head's points in that frame: x, y, z (they go with the bone; her jaw is shut in this key)
      const local = new THREE.Vector3(), point = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Quaternion();
      /**
       * The highest point of her snout's top between 2.3 and 2.6 m along the head from its joint (its tip is at 2.8), near its
       * middle line, and the slope of the skin round it (a plane through the top points within 18 cm of it, by least squares).
       */
      function find() {
        const points = cloud();
        head.updateWorldMatrix(true, false);
        const mine = [];
        let best = null;
        for (let i = 0, v = 0; i < points.length; i += 3, v++) {
          if (part[v] !== 1) continue;
          head.worldToLocal(local.set(points[i], points[i + 1] + LEVEL, points[i + 2]));
          mine.push(local.x, local.y, local.z);
          if (local.x < 2.3 || local.x > 2.6 || Math.abs(local.z) > 0.12) continue;
          if (!best || local.y > best.y) best = local.clone();
        }
        skin = Float32Array.from(mine);
        perch = best ?? new THREE.Vector3(2.45, -0.2, 0);
        // y = a x + b z + c over the points near it on the top of her snout
        let n = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
        for (let i = 0; i < skin.length; i += 3) {
          const x = skin[i] - perch.x, y = skin[i + 1] - perch.y, z = skin[i + 2] - perch.z;
          if (Math.hypot(x, z) > 0.18 || y < -0.12) continue;
          n++; sx += x; sz += z; sy += y; sxx += x * x; szz += z * z; sxz += x * z; sxy += x * y; szy += z * y;
        }
        slope = new THREE.Vector3(0, 1, 0);
        if (n >= 6) {
          const m = new THREE.Matrix3().set(sxx, sxz, sx, sxz, szz, sz, sx, sz, n);
          if (Math.abs(m.determinant()) > 1e-12) {
            const fit = new THREE.Vector3(sxy, szy, sy).applyMatrix3(m.invert());
            slope.set(-fit.x, 1, -fit.y).normalize();
          }
        }
      }
      /** Where it stands and the way out of her skin there, in the world, as she is now. */
      function stand() {
        if (!perch) find();
        head.updateWorldMatrix(true, false);
        head.localToWorld(point.copy(perch));
        up.copy(slope).applyQuaternion(head.getWorldQuaternion(q)).normalize();
      }
      return {
        /** Where its feet stand (`out`) and her skin's way out there (`way`), in the world, as she is now. */
        seat(out, way = null) {
          stand();
          way?.copy(up);
          return out.copy(point).addScaledVector(up, PERCH_OVER * S);
        },
        /** Puts the butterfly there, wings at `flap`. */
        place(flap) {
          stand();
          point.addScaledVector(up, PERCH_OVER * S);
          cast.butterfly.show(point, her.heading + 180 + BUTTERFLY.heading, BUTTERFLY.span * S, flap, up);
        },
        /**
         * Its clearance, from its outermost reach (every point of its body, legs and wings): the least height of any of its points
         * over the skin that lies under it (taken in the head's own frame, where the top of her snout is a floor: the highest of
         * her points within 5 cm sideways of it), and its least distance to any point of her head's skin. cm on the table.
         * `whole`: the first too (it takes a while).
         */
        report(whole = true) {
          if (!cast.butterfly.loaded) return null;
          stand();
          const mine = verticesOf(cast.butterfly.group);
          let over = Infinity, least = Infinity, feet = Infinity;
          for (let i = 0; i < mine.length; i += 3) {
            feet = Math.min(feet, (mine[i] - point.x) * up.x + (mine[i + 1] - point.y) * up.y + (mine[i + 2] - point.z) * up.z);
            if (!whole) continue;
            head.worldToLocal(local.set(mine[i], mine[i + 1], mine[i + 2]));
            let floor = -Infinity;
            for (let j = 0; j < skin.length; j += 3) {
              const dx = skin[j] - local.x, dy = skin[j + 1] - local.y, dz = skin[j + 2] - local.z;
              const d = dx * dx + dy * dy + dz * dz;
              if (d < least) least = d;
              if (dx * dx + dz * dz < 0.05 * 0.05 && skin[j + 1] > floor && skin[j + 1] > perch.y - 0.4) floor = skin[j + 1];
            }
            if (floor > -Infinity && local.y - floor < over) over = local.y - floor;
          }
          return {
            feetOverPerchCm: r3(feet / S), spanCm: BUTTERFLY.span,
            ...(whole ? { leastOverSkinCm: r3(over / S), leastToSkinCm: r3(Math.sqrt(least) / S) } : {}),
          };
        },
      };
    })();

    world.tjorn = { view, stage, measure, solve, her, rig, cast, keys: KEYS, kept, frogSeat, lilyParts };

    // ---- alive: the fish idle, the butterfly's wings open and close, rings and bubbles come where the key says ----
    function live() {
      const key = view.key;
      const t = s.time;
      view.fish.forEach((f, i) => {
        const sway = 0.12 * Math.sin(t * 0.5 + i * 1.7); // cm
        const h = rad(f.heading);
        cast.fish[i]?.show(V(f.at[0] + sway * Math.cos(h), f.at[1] + 0.05 * Math.sin(t * 0.7 + i), f.at[2] + sway * Math.sin(h)), f.heading, f.size * S, { beat: t * 0.45 + i * 0.37 });
      });
      if (key.jump) cast.jumper.show(V(...key.jump.at), key.jump.heading, key.jump.size * S, { pitch: key.jump.pitch, beat: t * 1.1 });
      if (cast.butterfly.loaded) {
        const flap = FLAP.mid + FLAP.swing * Math.sin(t * FLAP.pace);
        if (key.butterfly === 'snout' && key.her) snout.place(flap);
        else cast.butterfly.show(flowerTop(LILIES[BUTTERFLY.lily]), BUTTERFLY.heading, BUTTERFLY.span * S, flap);
      }
      if (cast.frog.loaded && !cast.frog.group.visible) cast.frog.show(frogSeat.point, FROG.heading, FROG.length * S);
      // rings where the key says (from where her neck cuts the surface, for a key that has her up), and bubbles: each comes again
      // every so many seconds of the water's clock, so the page at a given time is the same however it got there
      const now = clock.value;
      const neck = view.her?.neck ?? [0, 0];
      const tip = view.her?.tip ?? [0, 0, 0];
      // a burst of bubbles from her snout while it is under the water: [x, z, cm under, every s, first at s]
      const bursts = tip[1] < 0 ? (key.snoutBubbles ?? []).map(row => [tip[0] + row[0], tip[2] + row[1], -tip[1], row[2], row[3]]) : [];
      const rows = [
        ...(key.rings ?? []),
        ...(key.neckRings ?? []).map(row => [neck[0] + row[0], neck[1] + row[1], row[2], row[3], row[4]]),
        ...bursts.map(row => [row[0], row[1], 0.5, row[3], row[4] + BUBBLE.seconds]), // where it comes up
      ];
      for (let i = 0; i < 6; i++) {
        const row = rows[i];
        const n = row ? Math.floor((now - row[4]) / row[3]) : -1;
        if (n < 0) ripples[2 + i].set(0, 0, -99, 0);
        else ripples[2 + i].set(row[0] * S, row[1] * S, row[4] + n * row[3], row[2]);
      }
      const { position, aBubble } = bubbles.geometry.attributes;
      let b = 0;
      for (const [x, z, depth, period, first] of bursts) {
        for (let k = 0; k < BUBBLE.each && b < MOST_BUBBLES; k++, b++) {
          const start = first + k * BUBBLE.apart;
          const n = Math.floor((now - start) / period);
          const odd = (Math.sin(b * 12.9898) * 43758.5453) % 1; // each its own, the same every time
          position.setXYZ(b, x * S + 0.3 * Math.sin(b * 2.4), LEVEL - depth * S, z * S + 0.3 * Math.cos(b * 1.7));
          aBubble.setXYZW(b, n < 0 ? 1e9 : start + n * period, BUBBLE.seconds * (0.9 + 0.2 * Math.abs(odd)), depth * S, BUBBLE.size * (0.7 + 0.6 * Math.abs(odd)));
        }
      }
      for (; b < MOST_BUBBLES; b++) aBubble.setXYZW(b, 1e9, 1, 0, 0);
      position.needsUpdate = true;
      aBubble.needsUpdate = true;
    }

    // ---- the show (step 2): the timeline (tjorn3d/show.js) played on this stage (tjorn3d/play.js), from the glasses to the end card ----
    //   ?chapter=tjorn3d            the glasses' start, the show, the end card ("Aftur" plays it again, "Hætta" leaves)
    //   &t=<s>                      a capture: the show is played up to that second in the scene's fixed steps (main.js) and stands
    //                               there, with no black at its ends; window.__advance(seconds) steps it on (tools/tjorn3d-probe.mjs --show)
    //   &t=<s>&play=1               stands at that second until a tap, then plays on from there to the end card
    function* showScript() {
      const doc = typeof document !== 'undefined' ? document : null;
      if (doc) {
        // the page is the table: nothing on it but the show (rule 8), so no book button either
        const style = doc.createElement('style');
        style.textContent = '#journal-button { display: none !important; }';
        doc.head.append(style);
      }
      her.play('idle', { fade: 0 });
      const fit = () => {
        const pg = tablePage(win, view.inches);
        stage.use(pg, S, [0, 0]);
        eyePoint.set(stage.eyes.mid.x, LEVEL + stage.eyes.mid.y, stage.eyes.mid.z);
        Object.assign(view, { ...pg, dirty: false, her: null });
      };
      fit();
      const show = createShow({ S, LEVEL, V, world, her, rig, tip, cast, snout, flowerTop, frogSeat, stage, ripples, clock, bubbles, mostBubbles: MOST_BUBBLES, eyePoint, strikePoint, skin, part, view });
      // what rides on her is put when all of her is posed for the frame: after her look too (engine/actor.js update)
      const update = her.update;
      her.update = dt => { update.call(her, dt); show.late(); };
      const still = params.get('t') !== null && params.get('play') !== '1';
      let seeks = params.get('t') !== null;
      const time = { from: null, started: false, showing: false, black: -1, warm: null, sounding: false, at: 0, seen: null };
      const now = () => time.warm ?? (time.from === null ? 0 : Math.min(LENGTH, Math.max(0, s.time - time.from)));
      // Its sound (tjorn3d/sound.js): no music (the theme is held at nothing, above), no voices; the cue sheet, each cue played as
      // the show's second passes it, and the pond's bed under it, all held with the game. A still (t= alone) has no audio context,
      // and asks for nothing.
      const sound = createPondSound({ context: still ? null : world.sound?.context ?? null, output: world.sound?.output ?? null });
      if (!still) world.sound?.hold?.(sound);
      const frame = () => {
        if (view.dirty) fit();
        const t = now();
        show.apply(t);
        view.t = t;
        // The sound starts with the show, in the first frame the clock moves in (a page with t= and play=1 is stepped to its
        // second in silence and stands there until the tap): from the second the show stood at, so nothing before it is heard
        // and the bed is at the level it has there.
        if (time.showing && !still && !s.seeking) {
          if (!time.sounding && time.seen !== null && s.time !== time.seen) {
            time.sounding = true;
            sound.start(Math.min(t, time.at));
          }
          if (time.sounding) sound.frame(t);
        }
        if (time.showing) time.at = t;
        time.seen = s.time;
        view.key = { id: 'syning', name: partAt(t)?.name ?? 'Kyrr tjörn', says: null, her: her.root.visible ? {} : null, jump: show.state.jumper ? {} : null, fish: view.fish, butterfly: show.state.onSnout ? 'snout' : null };
        // black for the first moments and over the last (held through the end card); a capture has none
        const b = still ? 0 : !time.showing && time.from !== null ? 1 : +Math.min(1, Math.max(0, 1 - t / FADE.in, (t - (LENGTH - FADE.out)) / FADE.out)).toFixed(3);
        if (time.started && b !== time.black) { time.black = b; s.fade(b, 0); }
      };
      Object.assign(world.tjorn, { show, time, sound, measureShow: createShowMeasure({ S, LEVEL, seat: SEAT, stage, her, rig, skin, part, cloud, cast, show, snout, lilyParts, lilyPoints, strikePoint, view }) });
      frame();
      s.after(0, function* run() {
        for (;;) {
          frame();
          yield;
        }
      });
      yield s.ready();
      // What first shows later in the show (her, the leaping fish, the fish in her jaws, the spray) is drawn once now, under the
      // black the scene opens from: a thing's first draw builds its shaders (engine/warm-up.js), and played without this the pond
      // stood still for 1,2 s at the second her shadow comes and for a tenth of a second as her jaws shut (the laptop's numbers).
      // Two frames for each second: it is put in the next frame's step and drawn in the one after.
      if (!seeks) {
        for (const t of WARM) {
          time.warm = t;
          yield;
          yield;
        }
        time.warm = null;
      }
      for (;;) {
        time.started = true;
        show.reset(); // (played again: nothing is left over from the last time)
        time.from = seeks ? 0 : s.time; // (a page with t= is stepped from the scene's own start: its second is the show's)
        seeks = false;
        time.sounding = false; // (played again, the sound starts clean: frame)
        time.at = 0;
        time.showing = true;
        if (still) for (;;) yield;
        yield s.until(() => s.time - time.from >= LENGTH);
        time.showing = false;
        sound.end(); // (the bed has gone with the picture: nothing hangs over the end card)
        let again = false;
        const { element: end } = endCard(doc, { onAgain: () => { again = true; }, onQuit: () => { sound.end(); leaveShow(win); } });
        doc.body.append(end);
        try {
          yield s.until(() => again);
        } finally {
          end.remove();
        }
      }
    }
    if (SHOW) {
      yield* showScript();
      return;
    }

    cast.ready.then(() => { view.dirty = true; }); // the frog and the butterfly are measured and counted in the label once they are here
    solve();
    live();
    s.after(0, function* keep() {
      for (;;) {
        if (view.dirty) solve();
        live();
        yield;
      }
    });

    yield s.ready();
    if (ui) document.body.append(ui.element);
    yield s.fade(0, 1);
    for (;;) yield;
  },
};
