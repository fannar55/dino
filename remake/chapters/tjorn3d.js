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
//   &grugg=0.115  &tint=0.34               the murk's density per metre under the water, and how much of the water's colour lies on its surface
//
// The stage (tjorn3d/keys.js has every number): the pond is the Fen's own water in a pool far wider than the page, 15 cm deep on
// the table; one cm of the table is SCALE metres of the game. The water is the game's surface with most of its colour taken off, so
// what is under it shows, and a murk under it (tjorn3d/murk.js) that dims things by how far the eye's ray runs under the water. She
// is chapter 2's Uggeðla, on its rig (chapters/kafli2-uggedla.js: her sink, her neck, her strike, her jaw), with her whole body
// tipped nose up where a key says so: at this size she is 23 cm long and her sail 12 cm tall, so she can only ever show a part of
// herself over the table. world.tjorn.measure() gives the numbers (tools/tjorn3d-probe.mjs asks it).
import * as THREE from 'three';
import { glassesStart } from '../engine/book/show-cards.js';
import { onTable, parallaxAt, outlineBox, marginsOf } from '../engine/table3d.js';
import { MARGIN, tableKnobs, screenSize, tablePage, createTableStage } from '../engine/table-stage.js';
import { tableUi, tala } from '../engine/table-ui.js';
import { FEN } from '../world/forest/config.js';
import { lieLow } from './kafli2-uggedla.js';
import { SCALE, POND, LILIES, FROG, BUTTERFLY, KEYS, keyIndex } from './tjorn3d/keys.js';
import { installMurk, through } from './tjorn3d/murk.js';
import { createCast, verticesOf } from './tjorn3d/cast.js';

const CHARS = '../assets/characters/';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const { knob, seat: SEAT, sjon: SJON, mono: MONO, mode: MODE } = tableKnobs(params);
const LEVEL = FEN.waterLevel; // the surface's height in the place: the screen's plane
const S = SCALE;
const MURK = knob('grugg', POND.murk.density, 0, 2);
const CLEAR = knob('tint', POND.clear, 0, 1);
const PHASES = 4; // moments of her breathing her picture is bounded over
const BREATH = 4; // seconds: her idle
const BUBBLE_SIZE = 7; // the water's own bubbles (3 to 7 cm in the game) drawn this many times larger: half a centimetre on the table
const BUBBLE = { each: 6, apart: 0.22, seconds: 1.8, size: 0.05 }; // a burst: so many, s apart, s to rise, metres at the game's size
const RING_LIFE = 2.6; // s (world/props/water.js)
const LILY_STANDS = 0.05; // m: a lily's points higher than this over the water stand up out of the screen (its flower); its pads lie on it
const rad = d => (d * Math.PI) / 180;
const r3 = x => Math.round(x * 1000) / 1000;

export { KEYS };

export const chapter = {
  id: 'tjorn3d',
  title: 'Uggeðla í tjörninni',
  look: 'morning',
  gler: { panel: false },
  startButton: doc => glassesStart(doc, { more: 'Leggðu skjáinn flatan á borð og horfðu skáhallt niður á hann.' }),
  // one pool, far wider than the page at any size, its bank and the fen round it never in the window; the path far off
  layout: {
    seed: 23,
    clearing: { center: [0, 0], radius: 34 },
    forestEdge: 40,
    path: [[-120, 96], [-60, 90], [0, 88], [60, 90], [120, 96]],
    biome: 'fen',
    water: { pools: [{ center: [0, 0], radius: POND.radius, depth: POND.bed * S }] },
    plants: LILIES.map(l => ({ name: 'waterLily', position: [l.at[0] * S, l.at[1] * S], variant: l.variant, scale: l.scale })),
  },
  actors: {
    uggedla: { url: CHARS + 'spinosaurus.glb', position: [0, 0, 0], heading: 90 },
  },
  startShot: 'table',
  shots: { table: { position: [0, 12, 12], target: [0, 0, 0], fov: 40 } },

  *script(s) {
    const uggedla = s.actor('uggedla');
    const her = uggedla.raw;
    const world = her.world;
    const { camera, scene } = world;
    const win = typeof window !== 'undefined' ? window : null;
    const water = world.forest.water;
    const V = (x, y, z, out = new THREE.Vector3()) => out.set(x * S, LEVEL + y * S, z * S); // a point of the table (cm) in the world

    // ---- the pond alone: the ground (its bed), the water, the lilies; no trees' shadows, mist, animals or music ----
    const plants = [];
    for (const child of [...world.forest.group.children]) {
      if (child.name === 'Forest ground' || child === water.group) continue;
      if (/^Forest (?!caster|cards|life)/.test(child.name) && child.isMesh) { child.receiveShadow = false; plants.push(child); continue; }
      world.forest.group.remove(child);
    }
    world.music?.setLevel?.(0, 0);
    const kept = world.forest.group.children.map(child => child.name);
    installMurk(scene, { level: LEVEL, tone: POND.murk.tone, deep: POND.murk.deep, bed: POND.bed * S, density: MURK });
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
    // the lilies' own points over the surface (their flowers and the pads' rims), for the measure: they do not move but for the wind
    const lilyPoints = [];
    for (const mesh of plants) {
      const at = mesh.geometry.attributes.position;
      for (let i = 0; i < at.count; i++) {
        const x = at.getX(i), y = at.getY(i), z = at.getZ(i);
        if (Math.abs(x) < 16 * S && Math.abs(z) < 12 * S && y - LEVEL > LILY_STANDS) lilyPoints.push(x, y - LEVEL, z);
      }
    }

    // ---- Uggeðla: chapter 2's rig, and her whole body tipped nose up as a key says ----
    const c = { uggedla, world, mosi: null, egill: null };
    uggedla.place(0, 0, 90);
    const rig = lieLow(c);
    const tip = { pitch: 0 };
    her.control(dt => { rig.drive(dt); her.root.rotation.z = rad(tip.pitch); }, rig.pose);
    her.model.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); // no hard shadow edges on her over the table
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
    const flowerTop = l => V(l.at[0], 0, l.at[1]).setY(LEVEL + 0.062 * l.scale);

    // ---- the view: the key and the screen chosen, and what follows from them ----
    const screen = screenSize(params);
    const stage = createTableStage(world, { seat: SEAT, sjon: SJON, mono: MONO, level: LEVEL });
    const view = { index: keyIndex(params.get('lykill')), inches: screen.inches, mode: MODE, dirty: true, solves: 0, key: null, her: null, label: '' };

    /** Her pose for a key, with her root at [x, z] (m) and `sink` m under the surface. */
    function poseHer(k, x, z, sink) {
      rig.tweens.length = 0;
      Object.assign(rig.v, { sink, tuck: k.tuck ?? 1, shiver: 0, yaw: 0, lunge: 0, jaw: k.jaw ?? 0, strike: k.strike ? 1 : 0, toss: 0, swim: k.swim ?? 0, curl: 0, life: k.life ?? 0.5 });
      rig.target = k.strike ? strikePoint : null;
      tip.pitch = k.pitch ?? 0;
      uggedla.place(x, z, k.heading);
    }
    const settle = (steps = 10) => { for (let i = 0; i < steps; i++) her.update(0.1); };
    /** Her clouds over one breath; she is left at the moment of it she was at. */
    const breath = () => Array.from({ length: PHASES }, () => { her.update(BREATH / PHASES); return cloud(); });

    /**
     * Everything that follows from the key, the screen and the seat. Where a key says how high something stands, her sink is
     * settled so that it does (her pose is first tipped and turned, so a rise is a rise of her whole body); where it says her
     * picture is centred, she is moved along the way to the viewer until the top and the bottom margin of everything of hers
     * over the surface are the same. Four rounds: a new sink changes what is over the surface, her look changes with her place.
     */
    function solve() {
      const key = KEYS[view.index];
      const pg = tablePage(win, view.inches);
      stage.use(pg, S, [0, 0]);
      const { eyes } = stage;
      eyePoint.set(eyes.mid.x, LEVEL + eyes.mid.y, eyes.mid.z);
      Object.assign(view, { ...pg, key, dirty: false, solves: view.solves + 1, her: null });

      // the small players: where this key has them (the butterfly on her snout is put every frame, live())
      key.fish.forEach((f, i) => cast.fish[i]?.show(V(...f.at), f.heading, f.size * S, { beat: i * 0.37 }));
      for (let i = key.fish.length; i < cast.fish.length; i++) cast.fish[i].hide();
      if (key.jump) cast.jumper.show(V(...key.jump.at), key.jump.heading, key.jump.size * S, { pitch: key.jump.pitch });
      else cast.jumper.hide();
      if (cast.frog.loaded) cast.frog.show(padTop(LILIES[FROG.lily]), FROG.heading, FROG.length * S);

      const k = key.her;
      her.root.visible = Boolean(k);
      her.lookAt(k?.look === 'eye' ? out => out.copy(eyePoint) : null, { weight: 1, maxAngle: 60, maxPitch: 40 });
      if (!k) return void label();
      her.play(k.clip ?? 'idle', { fade: 0, timeScale: k.pace ?? 1 });
      let x = k.at[0] * S, z = k.at[1] * S, sink = (k.sink ?? 8) * S;
      let clouds = [];
      for (let round = 0; round < 4; round++) {
        poseHer(k, x, z, sink);
        settle();
        if (k.strike === 'fish') {
          // her snout reaches for the fish and stops `gap` cm short of it, on the line from her chest
          const fish = V(...key.jump.at), chest = rig.bones.Chest.getWorldPosition(new THREE.Vector3());
          strikePoint.copy(fish).add(chest.sub(fish).normalize().multiplyScalar(((k.gap ?? 0.5) + key.jump.size / 2) * S));
          settle(4);
        }
        clouds = breath();
        if (k.rise) sink += Math.max(...clouds.map(points => topOf(points, k.rise.of === 'head' ? 1 : null))) - k.rise.cm * S;
        if (k.centre) {
          const box = outlineBox(clouds.map(points => over(points)), [eyes.left, eyes.right], [0, 0]);
          if (Number.isFinite(box.z0)) z -= (box.z0 + box.z1) / 2;
        }
      }
      poseHer(k, x, z, sink);
      settle(4);
      // how her picture lies over one breath, for the label (the measure reads the moment)
      const mine = clouds.map(points => over(points, key.jump ? verticesOf(cast.jumper.group) : null));
      const box = outlineBox(mine, [eyes.left, eyes.right], [0, 0]);
      const margins = Number.isFinite(box.x0) ? marginsOf(box, pg.W * S, pg.Hs * S) : null;
      // where her neck (or whatever of her front is there) cuts the surface: rings spread from there
      const last = clouds[clouds.length - 1];
      const cut = [0, 0, 0];
      for (let i = 0, v = 0; i < last.length; i += 3, v++) if (part[v] && Math.abs(last[i + 1]) < 0.3) { cut[0] += last[i]; cut[1] += last[i + 2]; cut[2]++; }
      const neck = cut[2] ? [cut[0] / cut[2] / S, cut[1] / cut[2] / S] : [x / S + 4 * Math.cos(rad(k.heading)), z / S + 4 * Math.sin(rad(k.heading))];
      view.her = { x, z, sink, neck, top: Math.max(...clouds.map(points => topOf(points))), head: Math.max(...clouds.map(points => topOf(points, 1))), margins };
      label();
    }

    // ---- the page's own things ----
    const ui = typeof document !== 'undefined' ? tableUi(document, {
      step: d => { const to = Math.min(KEYS.length - 1, Math.max(0, view.index + d)); if (to !== view.index) { view.index = to; view.dirty = true; } },
      screen: d => { view.inches = screen.step(d); view.dirty = true; },
      prev: 'Fyrri lykill', next: 'Næsti lykill',
    }) : null;
    if (MONO && typeof document !== 'undefined') document.body.classList.add('bord-mono');
    /** The number a key's label gives, as the page stands now: [words, cm]. */
    function says(key, m) {
      switch (key.says) {
        case 'under': return `${key.name} ${tala(-m.her.topCm)} cm undir`;
        case 'sail': return `${key.name} ${tala(m.her.topCm)} cm`;
        case 'head': return `${key.name} ${tala(m.her.headCm)} cm`;
        case 'fish': return `${key.name} ${tala(m.tops.fish)} cm`;
        case 'butterfly': return `${key.name} ${tala(m.tops.butterfly)} cm`;
        default: return `${key.name}, hæst ${tala(m.top.cm)} cm`;
      }
    }
    function label() {
      const m = measure();
      const { least, leastCm } = m.margins;
      const tight = least === null || least >= MARGIN - 1e-9 ? '' : least < 0 ? ` · kemst ekki fyrir (${tala(-leastCm)} cm út fyrir)` : ` · þröngt (${tala(leastCm)} cm að brún)`;
      view.label = `${view.key.id} · ${says(view.key, m)} · skjár ${tala(view.inches)} tommur${tight}`;
      if (ui) ui.label.textContent = view.label;
    }
    win?.addEventListener('resize', () => { view.dirty = true; });

    /**
     * The numbers, as the page stands now. Everything over the surface (her skin, the fish in the air, the frog, the butterfly,
     * the lilies' flowers) through the two eye cameras the picture is drawn with; lengths in cm, shares of the page's width or depth.
     */
    function measure() {
      const { W, Hs } = view;
      const { eyes } = stage;
      const key = view.key;
      const throughEyes = stage.through();
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
      const fishLow = Math.min(...key.fish.map(f => f.at[1]));
      const deep = d => ({ cm: r3(d), parallaxCm: r3(-parallaxAt(-d, eyes.height, SEAT.ipd)), share: r3(-parallaxAt(-d, eyes.height, SEAT.ipd) / W), shows: r3(through(d * S, MURK, SEAT.a) * (1 - CLEAR)) });
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
        deepest: { bed: deep(POND.bed), her: key.her ? deep(-low / S) : null, fish: deep(-fishLow) },
        butterfly: key.butterfly === 'snout' ? snout.report() : null,
        surfaceParallaxCm: surface.map(x => Math.round(x * 1e6) / 1e6),
        seenErrorPx: Math.round(seen * 1000) / 1000,
        murk: { density: MURK, clear: CLEAR },
      };
    }

    // ---- the butterfly on her snout: on the top of it, a third of the way back from its tip, its feet on her skin ----
    const snout = (() => {
      const head = rig.bones.Head;
      let perch = null; // in her Head bone's frame
      const local = new THREE.Vector3(), point = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Quaternion();
      /** The highest point of her snout's top between 1.9 and 2.3 m along the head from its joint, near its middle line. */
      function find() {
        const points = cloud();
        head.updateWorldMatrix(true, false);
        let best = null;
        for (let i = 0, v = 0; i < points.length; i += 3, v++) {
          if (part[v] !== 1) continue;
          head.worldToLocal(local.set(points[i], points[i + 1] + LEVEL, points[i + 2]));
          if (local.x < 1.9 || local.x > 2.3 || Math.abs(local.z) > 0.12) continue;
          if (!best || local.y > best.y) best = local.clone();
        }
        perch = best ?? new THREE.Vector3(2.1, -0.2, 0);
      }
      return {
        /** Puts the butterfly there, wings at `flap`. */
        place(flap) {
          if (!perch) find();
          head.updateWorldMatrix(true, false);
          head.localToWorld(point.copy(perch));
          up.set(0, 1, 0).applyQuaternion(head.getWorldQuaternion(q)).normalize();
          point.addScaledVector(up, 0.02); // a hair over her skin
          cast.butterfly.show(point, her.heading + 180 + BUTTERFLY.heading, BUTTERFLY.span * S, flap, up);
        },
        /** Its clearance: how far its lowest point is over her snout where it stands, and its least distance to any point of her skin (cm). */
        report() {
          if (!cast.butterfly.loaded || !perch) return null;
          const mine = verticesOf(cast.butterfly.group);
          const all = cloud();
          const hers = [];
          for (let j = 0, v = 0; j < all.length; j += 3, v++) if (part[v] === 1) hers.push(all[j], all[j + 1] + LEVEL, all[j + 2]);
          head.updateWorldMatrix(true, false);
          head.localToWorld(point.copy(perch));
          up.set(0, 1, 0).applyQuaternion(head.getWorldQuaternion(q)).normalize();
          let feet = Infinity, least = Infinity;
          for (let i = 0; i < mine.length; i += 3) {
            feet = Math.min(feet, (mine[i] - point.x) * up.x + (mine[i + 1] - point.y) * up.y + (mine[i + 2] - point.z) * up.z);
            for (let j = 0; j < hers.length; j += 3) {
              const d = (mine[i] - hers[j]) ** 2 + (mine[i + 1] - hers[j + 1]) ** 2 + (mine[i + 2] - hers[j + 2]) ** 2;
              if (d < least) least = d;
            }
          }
          return { feetOverSkinCm: r3(feet / S), leastToSkinCm: r3(Math.sqrt(least) / S), spanCm: BUTTERFLY.span };
        },
      };
    })();

    world.tjorn = { view, stage, measure, solve, her, rig, cast, keys: KEYS, kept };

    // ---- alive: the fish idle, the butterfly's wings open and close, rings and bubbles come where the key says ----
    function live() {
      const key = view.key;
      const t = s.time;
      key.fish.forEach((f, i) => {
        const sway = 0.12 * Math.sin(t * 0.5 + i * 1.7); // cm
        const h = rad(f.heading);
        cast.fish[i]?.show(V(f.at[0] + sway * Math.cos(h), f.at[1] + 0.05 * Math.sin(t * 0.7 + i), f.at[2] + sway * Math.sin(h)), f.heading, f.size * S, { beat: t * 0.45 + i * 0.37 });
      });
      if (key.jump) cast.jumper.show(V(...key.jump.at), key.jump.heading, key.jump.size * S, { pitch: key.jump.pitch, beat: t * 1.1 });
      if (cast.butterfly.loaded) {
        const flap = 0.85 + 0.3 * Math.sin(t * 1.2);
        if (key.butterfly === 'snout' && key.her) snout.place(flap);
        else cast.butterfly.show(flowerTop(LILIES[BUTTERFLY.lily]), BUTTERFLY.heading, BUTTERFLY.span * S, flap);
      }
      if (cast.frog.loaded && !cast.frog.group.visible) cast.frog.show(padTop(LILIES[FROG.lily]), FROG.heading, FROG.length * S);
      // rings where the key says (from where her neck cuts the surface, for a key that has her up), and bubbles: each comes again
      // every so many seconds of the water's clock, so the page at a given time is the same however it got there
      const now = clock.value;
      const anchor = key.ringsOn === 'neck' && view.her ? view.her.neck : [0, 0];
      for (let i = 0; i < 6; i++) {
        const row = key.rings?.[i];
        const n = row ? Math.floor((now - row[4]) / row[3]) : -1;
        if (n < 0) ripples[2 + i].set(0, 0, -99, 0);
        else ripples[2 + i].set((anchor[0] + row[0]) * S, (anchor[1] + row[1]) * S, row[4] + n * row[3], row[2]);
      }
      const { position, aBubble } = bubbles.geometry.attributes;
      let b = 0;
      for (const [x, z, depth, period, first] of key.bubbles ?? []) {
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

    yield s.until(() => cast.settled);
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
