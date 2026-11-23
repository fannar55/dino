// The batcher bakes placed models into merged static meshes, one per (band, sector, material).
// Merging keeps draw calls low. Wind phase and canopy shade are written per vertex here, because
// they depend on where the plant stands, and so is the tree's share of each vertex's sway (aTree,
// one byte: 1 rides the trees' wave of the beat, 0 the plants', materials.js: forestWind), which
// the shadow casters carry too, so the shadows sway with the plants.
//
// Each merged mesh remembers where every plant (and every detail level of it) sits in its index
// buffer. When the camera moves, cullBatches() rebuilds the index buffer from the plants in view, at
// the detail level their distance calls for, so a mesh only submits what can be seen, in one draw
// call. Shadows come from separate caster meshes built from each plant's coarsest shape and culled
// by whether its shadow can land in the shadow focus (cullCasters). The main meshes cast nothing,
// so the shadow pass never draws plants the camera cannot see and the main pass never draws plants
// that are only there for their shadow.
//
// A placement with a card (cards.js: placement.card, its picture at scale 1) also gets a quad in one
// card mesh (buildSteps' `cards`), and cullBatches draws past `cardFrom` the card and not the tree, and in a band round it both: the
// tree's mesh then from a twin of its merged mesh that leaves out the pixels the card takes (CARD_BAND, below).
import * as THREE from 'three';
import { runSync } from './slices.js';
import { FOREST, PIVOT } from './config.js';

const SWAY = FOREST.wind.swayScale;
// Small things vanish into the grass and mist long before this distance (metres to the camera). A place may give a placement a cut of
// its own (placement.cut: the valley's far plants that have no card, world/ardalur/banks.js FAR_CUT); its species' comes first.
export const CULL_DISTANCE = { flowers: 20, mushrooms: 18, horsetail: 30, fern: 40, rockSmall: 36, waterLily: 45, horsetailReed: 64, horsetailTall: 55, mossHummock: 45 };
// ...and they never appear or vanish whole there: the vegetation shader (materials.js forestGrown) grows each from nothing at its cut to
// its full size at `from` of it, about its foot, by the camera's distance to that foot, so a plant the cull takes in or leaves out
// (cullBatches, by its sphere's near edge, nearer than its foot) is nothing then. Each vertex of such a plant carries aGrow (four signed
// shorts): the way from it to its plant's foot in `reach` m (xyz) and its cut in `far` m (w); 0 there for a plant that never shrinks,
// and for a tree with a card the way to its mid-height and -1 (CARD_BAND).
export const GROW = { from: 0.8, reach: 32, far: 256 };
/** How much of its size a plant whose cut is `cut` m has with its foot `d` m from the camera (the shader's forestGrown). */
export function growAt(d, cut) {
  const t = Math.min(1, Math.max(0, (d - GROW.from * cut) / ((1 - GROW.from) * cut)));
  return 1 - t * t * (3 - 2 * t);
}
const short = v => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
/** A placement's cut (CULL_DISTANCE, or its own), 0 for one drawn at any distance. */
const cutOf = p => CULL_DISTANCE[p.name] || p.cut || 0;
const LOD_SWITCH = FOREST.lod.switch;
// small understory plants drop to their far shape sooner than the trees
const UNDERSTORY = new Set(['bush', 'fern', 'cycad', 'treeFern', 'horsetail', 'horsetailReed', 'horsetailTall', 'mossHummock', 'waterLily']);
const LOD_SWITCH_SMALL = FOREST.lod.switchSmall || LOD_SWITCH;
// Trees whose crown is its own cull piece pick the crown's level by its projected size, not by
// the distance to the tree's mid-height: a big crown right overhead counts as near.
const CROWN_LOD = new Set(['broadleaf', 'araucaria', 'swampConifer']);
const [CROWN_T0, CROWN_T1] = FOREST.lod.crownSize;
const CROWN_FINE = FOREST.lod.crownFine ?? 4;
const CARD_FROM = FOREST.lod.cardFrom ?? Infinity;
// A far tree goes from its mesh to its card over a band round cardFrom, CARD_BAND of it on either side, and never in one frame: in the
// band both are drawn, and each pixel shows one of them by a screen-door threshold (materials.js forestDither), the card taking
// cardFadeAt of them, by the camera's distance to the tree's mid-height (as cardFrom counts it); with MSAA each pixel's samples are
// shared out instead (the card comes in behind the whole mesh, then the mesh goes out in front of the whole card). The mesh is drawn
// there by its merged mesh's twin (makeMeshes), whose material leaves pixels or samples out: the plain one never does, so the GPU
// still tests depth before shading it. Every vertex of a carded tree carries aGrow too, the way to that mid-height and -1 for its w (GROW), which the shader reads.
// Past either end what was drawn stays CARD_HOLD more (invisible there: all card, or all mesh), so one standing at an end is not
// rewritten into the index each frame: the hysteresis of the switch it replaces.
export const CARD_BAND = 0.08;
const CARD_HOLD = 0.02;
/** The band round `cardFrom` over which a tree fades into its card: [all mesh, all card], metres to its mid-height. */
export function cardBand(cardFrom) {
  return [cardFrom * (1 - CARD_BAND), cardFrom * (1 + CARD_BAND)];
}
/** Metres to its mid-height past which a tree with a card is never its mesh, whatever it was drawn as last (the band's end and its hold). */
export function cardReach(cardFrom) {
  return cardBand(cardFrom)[1] * (1 + CARD_HOLD);
}
/** How much of a tree its card shows with its mid-height `d` m from the camera (the shaders' forestCardShare): 0 to 1 over the band. */
export function cardFadeAt(d, cardFrom) {
  if (!Number.isFinite(cardFrom)) return 0;
  const [from, to] = cardBand(cardFrom);
  const t = Math.min(1, Math.max(0, (d - from) / Math.max(to - from, 1e-3)));
  return t * t * (3 - 2 * t);
}
// A plant's level, its crown's and its fade-out distance go finer (nearer, or drawn again) at their switch, as before, and
// coarser only HYSTERESIS past it, so one standing at a switch does not flicker between the two and its mesh's index is not rewritten
// each time it does; nothing is ever coarser than it was without this. A plant seen for the first time takes the switch as it is.
const HYSTERESIS = 0.08;
// A camera that moved more than CUT m since the last view has cut to another shot: what was drawn before says nothing, and each plant
// takes its switches as they are again (so a still at a time looks as it did before the hysteresis, whatever was drawn before it).
const CUT = 12;
const _batchStates = new WeakMap();
let _epoch = 0;
function epochFor(meshes, cam) {
  let state = _batchStates.get(meshes);
  if (!state) {
    state = { epoch: 0, lastEye: new THREE.Vector3(Infinity, 0, 0) };
    _batchStates.set(meshes, state);
  }
  if (cam.distanceTo(state.lastEye) > CUT) state.epoch++;
  state.lastEye.copy(cam);
  return state.epoch;
}

/** One record per tree: crown centre and half-extent, and the level chosen for this view. */
function crownLod(placement, first) {
  const cr = placement.model.crown;
  if (!cr || !CROWN_LOD.has(placement.name)) return null;
  const c = Math.cos(placement.rot), s = Math.sin(placement.rot), sc = placement.scale;
  const centre = new THREE.Vector3(
    placement.x + (cr.c[0] * c - cr.c[2] * s) * sc,
    placement.y + cr.c[1] * sc,
    placement.z + (cr.c[0] * s + cr.c[2] * c) * sc,
  );
  const size = Math.max(cr.r, cr.ry) * sc;
  return { centre, size, reach: size, first, level: 2, frame: -1, proj: 0 };
}

const TAU = Math.PI * 2;
const unit = v => Math.max(-1, Math.min(1, v));
/** Which of the PIVOT.nodSteps ways round the compass an angle (radians) is: 0 for +x, counting toward +z. */
const compassStep = angle => Math.round(((((angle / TAU) % 1) + 1) % 1) * PIVOT.nodSteps) % PIVOT.nodSteps;

/**
 * aPivot for one placed model (materials.js reads it, in forestPivot): the last byte says what moves (PIVOT in config.js) and the
 * others where about. A fern's lean has the vertex's height above the plant's foot in the first byte. A flower head's nod and a
 * mushroom's hop have the vertex's offset from the pivot, in metres in the world (x, y and z; 127 is none and a step is
 * FOREST.pivot.reach / 127), and the nod the way the head faces, round the compass, in the last. Flowers and mushrooms only dance
 * in the bands FOREST.dance names; ferns lean wherever they stand. `c` and `s` are the cosine and sine of the placement's turn.
 */
function bakePivots(out, base, m, p, c, s) {
  const sc = p.scale;
  const dances = FOREST.dance.bands.includes(p.band);
  const { reach, height } = FOREST.pivot;
  for (const run of m.pivots) {
    if (run.kind !== 'lean' && !dances) continue;
    let code = PIVOT.lean;
    if (run.kind === 'hop') code = PIVOT.hop;
    else if (run.kind === 'nod') code = PIVOT.nod + compassStep(run.facing + p.rot); // the placement's turn turns the way a head faces too
    const [ax, ay, az] = run.at;
    for (let i = run.from; i < run.to; i++) {
      const o = (base + i) * 4;
      if (run.kind === 'lean') {
        out[o] = Math.round(unit(Math.max(0, (m.pos[i * 3 + 1] * sc) / height)) * 255);
      } else {
        const dx = m.pos[i * 3] - ax, dy = m.pos[i * 3 + 1] - ay, dz = m.pos[i * 3 + 2] - az;
        out[o] = 127 + Math.round(unit(((dx * c - dz * s) * sc) / reach) * 127);
        out[o + 1] = 127 + Math.round(unit((dy * sc) / reach) * 127);
        out[o + 2] = 127 + Math.round(unit(((dx * s + dz * c) * sc) / reach) * 127);
      }
      out[o + 3] = code;
    }
  }
}

function createBuckets() {
  const buckets = new Map();
  return {
    buckets,
    push(key, info, item, builder) {
      if (!buckets.has(key)) buckets.set(key, { key, ...info, items: [], verts: 0, indices: 0 });
      const b = buckets.get(key);
      b.items.push(item);
      b.verts += builder.count;
      b.indices += builder.idx.length;
    },
  };
}

export function createBatcher() {
  const main = createBuckets();
  const casters = createBuckets();
  const cards = [];

  function add(placement) {
    const { band, sector } = placement;
    const levels = placement.models || [{ level: placement.lod, model: placement.model }];
    const h = (placement.model.height || 1) * placement.scale;
    const ref = new THREE.Vector3(placement.x, placement.y + h * 0.5, placement.z);
    const sw = UNDERSTORY.has(placement.name) ? LOD_SWITCH_SMALL : LOD_SWITCH;
    const crown = crownLod(placement, levels[0].level);
    const carded = !!placement.card;
    // a tree only ever its card (placement.cardOnly: a place's trees far past all its cameras) has no mesh at all, at any distance
    if (carded && placement.cardOnly) {
      cards.push({ placement, ref, plant: null, only: true });
      return;
    }
    // what the plant was drawn as last (its level's place in `bands`, its card), shared by all its ranges, for the hysteresis
    const plant = { bands: [], li: -1, levelView: -1, state: null, cardView: -1 };
    if (carded) cards.push({ placement, ref, plant });
    levels.forEach(({ level, model }, i) => {
      // distance band of this level: [switch before it, switch after it)
      const minD = i === 0 ? 0 : sw[Math.min(level, sw.length) - 1];
      const maxD = i === levels.length - 1 ? Infinity : sw[Math.min(level, sw.length - 1)];
      plant.bands.push([minD, maxD]);
      for (const kind of ['solid', 'thin']) {
        const builder = model[kind];
        if (!builder || !builder.count) continue;
        // thin parts (fronds, petals) are small: they share wider sectors, which saves draw calls
        const s = kind === 'thin' ? Math.floor(sector / 2) * 2 : sector;
        main.push(`${band}:${s}:${kind}`, { band, sector: s, kind }, { builder, placement, minD, maxD, ref, level, crown, carded, plant, li: i }, builder);
      }
    });
  }

  /** A shadow caster from the plant's coarsest shape (shrunk a little, see buildGeometry). */
  function addCaster(placement) {
    const { band, sector } = placement;
    const levels = placement.models || [{ level: placement.lod, model: placement.model }];
    const { model } = levels[levels.length - 1];
    const group = Math.floor(sector / 4);
    for (const kind of ['solid', 'thin']) {
      const builder = model[kind];
      if (!builder || !builder.count) continue;
      casters.push(`${band}:${group}:${kind}`, { band, sector: group, kind }, { builder, placement, minD: 0, maxD: Infinity, ref: null }, builder);
    }
  }

  function* buildGeometry(bucket, { caster = false } = {}) {
    const n = bucket.verts;
    const pos = new Float32Array(n * 3);
    const nrm = caster ? null : new Float32Array(n * 3);
    const col = caster ? null : new Uint8Array(n * 4);
    const wind = new Uint8Array(n * 4);
    const tree = new Uint8Array(n);
    const pivot = caster ? null : new Uint8Array(n * 4);
    // the plants that grow in and shrink out at their cut (GROW), and the trees that fade into their cards (CARD_BAND), if it has any
    const grow = !caster && bucket.items.some(({ placement: p, carded }) => cutOf(p) || carded) ? new Int16Array(n * 4) : null;
    let cardedIndices = 0; // what of it a twin may draw fading (makeMeshes)
    const IndexArray = n > 65535 ? Uint32Array : Uint16Array;
    const master = new IndexArray(bucket.indices);
    const ranges = [];
    let v = 0, k = 0;
    const tmp = new THREE.Vector3();
    for (const { builder: m, placement: p, minD, maxD, ref, level, crown, carded = false, plant = null, li = -1 } of bucket.items) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot), sc = p.scale;
      const phase = Math.round((p.phase % 1) * 255);
      const sky = p.sky;
      const base = v;
      const cut = grow ? cutOf(p) : 0;
      for (let i = 0; i < m.count; i++, v++) {
        let lx = m.pos[i * 3], ly = m.pos[i * 3 + 1], lz = m.pos[i * 3 + 2];
        const nx = m.nrm[i * 3], ny = m.nrm[i * 3 + 1], nz = m.nrm[i * 3 + 2];
        if (caster) {
          // casters are the coarse shape pulled inside the fine one, so a crown never shadows
          // its own lit surface where the coarse and fine outlines differ
          const pull = bucket.kind !== 'solid' ? 0 : m.wind[i * 3 + 2] > 0.5 ? 0.32 : 0.03;
          lx -= nx * pull; ly -= ny * pull; lz -= nz * pull;
        }
        const x = p.x + (lx * c - lz * s) * sc, y = p.y + ly * sc, z = p.z + (lx * s + lz * c) * sc;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        if (!caster) {
          nrm[v * 3] = nx * c - nz * s;
          nrm[v * 3 + 1] = ny;
          nrm[v * 3 + 2] = nx * s + nz * c;
          col[v * 4] = Math.round(Math.min(1, m.col[i * 3]) * 255);
          col[v * 4 + 1] = Math.round(Math.min(1, m.col[i * 3 + 1]) * 255);
          col[v * 4 + 2] = Math.round(Math.min(1, m.col[i * 3 + 2]) * 255);
          const exposure = m.exp[i];
          col[v * 4 + 3] = Math.round(Math.min(1, Math.max(0, sky + (1 - sky) * exposure)) * 255);
        }
        if (cut) {
          grow[v * 4] = short((p.x - x) / GROW.reach);
          grow[v * 4 + 1] = short((p.y - y) / GROW.reach);
          grow[v * 4 + 2] = short((p.z - z) / GROW.reach);
          grow[v * 4 + 3] = short(cut / GROW.far);
        } else if (grow && carded) {
          grow[v * 4] = short((ref.x - x) / GROW.reach);
          grow[v * 4 + 1] = short((ref.y - y) / GROW.reach);
          grow[v * 4 + 2] = short((ref.z - z) / GROW.reach);
          grow[v * 4 + 3] = short(-1);
        }
        wind[v * 4] = phase;
        wind[v * 4 + 1] = Math.round(Math.min(1, (m.wind[i * 3] * sc) / SWAY) * 255);
        wind[v * 4 + 2] = Math.round(Math.min(1, m.wind[i * 3 + 1]) * 255);
        wind[v * 4 + 3] = Math.round(Math.min(1, m.wind[i * 3 + 2]) * 255);
        tree[v] = Math.round(m.treeShare(m.wind[i * 3]) * 255);
      }
      if (pivot && m.pivots.length) bakePivots(pivot, base, m, p, c, s);
      if (carded) cardedIndices += m.idx.length;
      // one range per cull piece (trunk, crown); each gets the bounding sphere of its own triangles
      const cuts = [0, ...(m.marks || []), m.idx.length];
      for (let c2 = 0; c2 < cuts.length - 1; c2++) {
        if (cuts[c2 + 1] <= cuts[c2]) continue;
        const start = k;
        const pbox = new THREE.Box3();
        for (let j = cuts[c2]; j < cuts[c2 + 1]; j++) {
          const vi = base + m.idx[j];
          master[k++] = vi;
          pbox.expandByPoint(tmp.set(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]));
        }
        const sphere = pbox.getBoundingSphere(new THREE.Sphere());
        sphere.radius += 0.8; // sway
        // pieces after the first mark are the crown: cullBatches picks their level per view, by a sphere that holds every level's
        // piece (one on screen at the frame's edge is ranked, so it never drops to coarse while it shows)
        const own = c2 > 0 && crown ? crown : null;
        if (own) own.reach = Math.max(own.reach, sphere.center.distanceTo(own.centre) + sphere.radius);
        ranges.push({
          start, count: k - start, sphere, cull: cutOf(p) || Infinity, minD, maxD, ref: ref || sphere.center,
          name: p.name, lod: level ?? p.lod, crown: own, carded, plant, li, near: null,
          foot: cutOf(p) ? new THREE.Vector3(p.x, p.y, p.z) : null,
        });
      }
      yield; // a plant at a time
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (!caster) {
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
    }
    g.setAttribute('aWind', new THREE.BufferAttribute(wind, 4, true));
    g.setAttribute('aTree', new THREE.BufferAttribute(tree, 1, true));
    if (pivot) g.setAttribute('aPivot', new THREE.BufferAttribute(pivot, 4, true));
    if (grow) g.setAttribute('aGrow', new THREE.BufferAttribute(grow, 4, true));
    const dynamic = new THREE.BufferAttribute(new IndexArray(master.length), 1);
    dynamic.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(dynamic);
    g.setDrawRange(0, 0);
    g.computeBoundingBox();
    g.boundingBox.expandByScalar(0.8); // room for sway
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    return { g, master, ranges, cardedIndices };
  }

  /**
   * The twin of a merged mesh that has trees with cards: its very attributes and ranges, its own index (room for its carded trees)
   * and the fading material, so cullBatches can draw from it the trees in the band round cardFrom (CARD_BAND) and from the mesh the rest.
   */
  function twinOf(mesh, master, cardedIndices, material) {
    const g = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) g.setAttribute(name, attribute);
    const index = new THREE.BufferAttribute(new master.constructor(cardedIndices), 1);
    index.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(index);
    g.setDrawRange(0, 0);
    g.boundingBox = mesh.geometry.boundingBox;
    g.boundingSphere = mesh.geometry.boundingSphere;
    const twin = new THREE.Mesh(g, material);
    twin.name = `${mesh.name} (fading)`;
    twin.castShadow = false;
    twin.receiveShadow = mesh.receiveShadow;
    twin.renderOrder = mesh.renderOrder;
    twin.visible = false;
    const { band, sector, kind } = mesh.userData;
    twin.userData = { band, sector, kind, triangles: 0, caster: false, twinOf: mesh, cull: { master, ranges: [], crownRanges: [], kept: [], signature: -1, submitted: 0 }, hidden: false };
    mesh.userData.twin = twin;
    return twin;
  }

  function* makeMeshes(store, setup, { order, caster = false } = {}) {
    const meshes = [];
    for (const bucket of [...store.buckets.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      // draw near-to-far inside each merged mesh, so early depth testing rejects hidden foliage
      if (order) bucket.items.sort((a, b) => order(a.placement) - order(b.placement));
      const { g, master, ranges, cardedIndices } = yield* buildGeometry(bucket, { caster });
      const o = setup(bucket);
      const mesh = new THREE.Mesh(g, o.material);
      mesh.name = `${caster ? 'Forest caster' : 'Forest'} ${bucket.key}`;
      mesh.castShadow = caster;
      mesh.receiveShadow = !caster && o.receiveShadow;
      mesh.renderOrder = o.renderOrder ?? 2;
      if (o.depthMaterial) mesh.customDepthMaterial = o.depthMaterial;
      mesh.visible = false; // until the first cull
      mesh.userData = {
        band: bucket.band, sector: bucket.sector, kind: bucket.kind, triangles: bucket.indices / 3, caster,
        cull: { master, ranges, crownRanges: ranges.filter(r => r.crown), kept: [], signature: -1, submitted: 0 }, hidden: false,
      };
      meshes.push(mesh);
      // its trees with cards fade into them from a twin (a setup with a fading material: see CARD_BAND)
      if (!caster && o.fadeMaterial && cardedIndices) meshes.push(twinOf(mesh, master, cardedIndices, o.fadeMaterial));
    }
    return meshes;
  }

  /**
   * The cards of the placements that have one, in one mesh: a quad a tree, standing on its foot (aCentre, which is the position
   * too), its corners (aCorner) and size in metres (aSize) for cards.js's material to turn it to the camera, its picture's cell as
   * uv (mirrored for half the trees, by their turn), and what its material lights and fades it by (aCard: the height of its tree's
   * mid-height over its foot, the tree's sky share, -1 where the picture is mirrored; 0 for the first of a tree only ever its card,
   * which is all there at any distance). Each card is a range (card: true; `only` for such a tree) with its tree's ref and sector; the
   * mesh is of the far band, whatever band its trees are of (a card is never near). With `wind` each corner carries the wind's weights
   * as the meshes' vertices do (aWind: the tree's phase and, at the card's top, the sway of its tree's top; aTree: its tree's share),
   * for a material that bends the card's top as the trees bend (cards.js createCardMaterial `wind`).
   */
  function* makeCards({ material, renderOrder = 3, wind = false }) {
    const n = cards.length * 4;
    const centre = new Float32Array(n * 3), corner = new Float32Array(n * 2), size = new Float32Array(n * 2), uv = new Float32Array(n * 2);
    const own = new Float32Array(n * 3); // aCard: the tree's mid-height over the card's foot, its sky share, and -1 for a mirrored picture
    const sway = wind ? new Uint8Array(n * 4) : null, share = wind ? new Uint8Array(n) : null;
    const IndexArray = n > 65535 ? Uint32Array : Uint16Array;
    const master = new IndexArray(cards.length * 6);
    const ranges = [];
    const box = new THREE.Box3();
    let biggest = 0;
    cards.forEach(({ placement: p, ref, plant, only = false }, t) => {
      const { uv: [u0, v0, u1, v1], width, height, bottom } = p.card;
      const w = width * p.scale, h = height * p.scale, y = p.y + bottom * p.scale;
      const flip = Math.sin(p.rot) < 0;
      const top = sway ? topSwayOf(p) : null;
      [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]].forEach(([cx, cy], k) => {
        const v = t * 4 + k;
        centre.set([p.x, y, p.z], v * 3);
        corner.set([cx, cy], v * 2);
        size.set([w, h], v * 2);
        uv.set([(cx < 0) !== flip ? u0 : u1, cy ? v1 : v0], v * 2);
        own.set([only ? 0 : Math.max(1e-3, ref.y - y), p.sky ?? 1, flip ? -1 : 1], v * 3);
        if (sway) {
          sway.set([Math.round((p.phase % 1) * 255), cy ? top.sway : 0, 0, 0], v * 4);
          share[v] = cy ? top.tree : 0;
        }
      });
      const b = t * 4;
      master.set([b, b + 1, b + 2, b, b + 2, b + 3], t * 6);
      const sphere = new THREE.Sphere(new THREE.Vector3(p.x, y + h / 2, p.z), Math.hypot(w, h) / 2 + (sway ? 0.8 : 0)); // (and its sway)
      ranges.push({
        start: t * 6, count: 6, sphere, cull: Infinity, minD: 0, maxD: Infinity, ref, name: p.name, lod: 3, crown: null,
        card: true, only, sector: p.sector, plant,
      });
      box.expandByPoint(sphere.center);
      biggest = Math.max(biggest, sphere.radius);
    });
    yield; // the cards at once: a few floats a tree
    const g = new THREE.BufferGeometry();
    const at = new THREE.BufferAttribute(centre, 3);
    g.setAttribute('position', at);
    g.setAttribute('aCentre', at);
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 2));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aCard', new THREE.BufferAttribute(own, 3));
    if (sway) {
      g.setAttribute('aWind', new THREE.BufferAttribute(sway, 4, true));
      g.setAttribute('aTree', new THREE.BufferAttribute(share, 1, true));
    }
    const dynamic = new THREE.BufferAttribute(new IndexArray(master.length), 1);
    dynamic.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(dynamic);
    g.setDrawRange(0, 0);
    g.boundingBox = box.expandByScalar(biggest);
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'Forest cards';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = renderOrder;
    mesh.visible = false; // until the first cull
    mesh.userData = {
      band: 'far', sector: 0, kind: 'card', cards: true, triangles: cards.length * 2, caster: false,
      cull: { master, ranges, crownRanges: [], kept: [], signature: -1, submitted: 0 }, hidden: false,
    };
    return mesh;
  }

  /**
   * Build the main meshes and the caster meshes. `setup(bucket)` returns { material,
   * depthMaterial, receiveShadow, renderOrder, fadeMaterial }; `casterSetup(bucket)` the same for casters.
   * `cards` ({ material, renderOrder }) adds the card mesh (makeCards) to the main meshes, if any placement has a card; and a merged
   * mesh with trees that have one gets its twin right after it (twinOf), drawn with `fadeMaterial`, if the setup gives one.
   */
  function* buildSteps(setup, { order, casterSetup, cards: cardSetup } = {}) {
    const meshes = yield* makeMeshes(main, setup, { order });
    if (cardSetup && cards.length) meshes.push(yield* makeCards(cardSetup));
    const casterMeshes = casterSetup ? yield* makeMeshes(casters, casterSetup, { caster: true }) : [];
    return { meshes, casterMeshes };
  }
  /** build as steps (slices.js): a plant at a time. */
  const build = (setup, options) => runSync(buildSteps(setup, options));
  return { add, addCaster, build, buildSteps };
}

/**
 * The sway of a tree's top as its mesh bakes it (buildGeometry: aWind.y, 0 to 1 of SWAY, and aTree, its tree's share, 0 to 255): its
 * coarsest level's highest sway weight, at its scale. A card of it bends its top that much (makeCards `wind`).
 */
function topSwayOf(p) {
  const { model } = (p.models || [{ model: p.model }]).at(-1);
  let most = 0, tree = 1;
  for (const part of [model.solid, model.thin]) {
    if (!part?.count) continue;
    for (let i = 0; i < part.count; i++) {
      if (part.wind[i * 3] <= most) continue;
      most = part.wind[i * 3];
      tree = part.treeShare ? part.treeShare(most) : 1;
    }
  }
  return { sway: Math.round(Math.min(1, (most * p.scale) / SWAY) * 255), tree: Math.round(tree * 255) };
}

function rebuildIndex(mesh, keep, signature) {
  const data = mesh.userData.cull;
  if (signature === data.signature) return data.submitted;
  const index = mesh.geometry.index;
  let offset = 0;
  for (const r of keep) {
    index.array.set(data.master.subarray(r.start, r.start + r.count), offset);
    offset += r.count;
  }
  mesh.geometry.setDrawRange(0, offset);
  if (offset > 0) {
    index.clearUpdateRanges();
    index.addUpdateRange(0, offset);
    index.needsUpdate = true;
  }
  data.signature = signature;
  data.submitted = offset / 3;
  return data.submitted;
}

/**
 * One mesh of the cards of many card meshes (the batcher's, makeCards): a place's far layer, which draws the cards of the parts that
 * are not drawn (cullLayer), in one draw call. `parts` are { mesh, part }; its ranges are theirs (the same tree: its ref, sphere,
 * plant and sector) with `part` the one each came with. `into`, a layer made before: its geometry is replaced, so it stays the
 * same object. Returns the mesh, or `into` (null) when the parts have no cards.
 */
export function mergeCardMeshes(parts, { material, renderOrder = 3, into = null } = {}) {
  const NAMES = ['aCentre', 'aCorner', 'aSize', 'uv', 'aCard'];
  let verts = 0, indices = 0;
  for (const { mesh } of parts) {
    verts += mesh.geometry.getAttribute('aCentre').count;
    indices += mesh.userData.cull.master.length;
  }
  if (!verts) return into;
  const arrays = Object.fromEntries(NAMES.map(n => [n, new Float32Array(verts * parts[0].mesh.geometry.getAttribute(n).itemSize)]));
  const IndexArray = verts > 65535 ? Uint32Array : Uint16Array;
  const master = new IndexArray(indices);
  const ranges = [];
  const box = new THREE.Box3();
  let v = 0, k = 0;
  for (const { mesh, part } of parts) {
    const g = mesh.geometry;
    for (const n of NAMES) {
      const a = g.getAttribute(n);
      arrays[n].set(a.array.subarray(0, a.count * a.itemSize), v * a.itemSize);
    }
    const own = mesh.userData.cull.master;
    for (let j = 0; j < own.length; j++) master[k + j] = own[j] + v;
    for (const r of mesh.userData.cull.ranges) ranges.push({ ...r, start: r.start + k, part });
    box.union(g.boundingBox);
    v += g.getAttribute('aCentre').count;
    k += own.length;
  }
  const g = new THREE.BufferGeometry();
  const at = new THREE.BufferAttribute(arrays.aCentre, 3);
  g.setAttribute('position', at);
  g.setAttribute('aCentre', at);
  for (const n of NAMES.slice(1)) g.setAttribute(n, new THREE.BufferAttribute(arrays[n], parts[0].mesh.geometry.getAttribute(n).itemSize));
  const dynamic = new THREE.BufferAttribute(new IndexArray(master.length), 1);
  dynamic.setUsage(THREE.DynamicDrawUsage);
  g.setIndex(dynamic);
  g.setDrawRange(0, 0);
  g.boundingBox = box;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const mesh = into ?? new THREE.Mesh(g, material);
  if (into) {
    into.geometry.dispose();
    into.geometry = g;
  }
  mesh.name = 'Far cards';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = renderOrder;
  mesh.visible = false; // until the first cull
  mesh.userData = {
    band: 'far', sector: 0, kind: 'card', cards: true, layer: true, triangles: indices / 3, caster: false,
    cull: { master, ranges, crownRanges: [], kept: [], signature: -1, submitted: 0 }, hidden: false,
  };
  return mesh;
}

const _frustum = new THREE.Frustum();
const _m4 = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _cam = new THREE.Vector3();
const _rel = new THREE.Vector3();

let _view = 0;
const _crowns = [];
const _casterKeep = [];

/**
 * Main pass: a plant is drawn when its sphere is in the camera frustum (with a margin, so small
 * moves need no rebuild, and for a caller that culls again only after the camera has turned `turn`
 * radians, as much more as that turn moves a thing as far off as it is: so nothing at the frame's edge
 * is missing in between), at the level of detail its distance calls for; a plant with a card
 * (makeCards) as its card past the band round `cardFrom` (cardBand), as itself nearer, and as both in the band, its mesh from the
 * merged mesh's twin (twinOf), which fades it (a twin in `meshes` is skipped: its mesh draws it). Crowns are ranked by
 * projected size first: the few largest in view get the fine level (a capped number, so the cost
 * stays bounded; those on screen before those only in the margin), the rest the middle or far level. A crown counts as in view
 * while any of its mesh can be (its sphere holds all its pieces). An empty mesh is hidden, so it costs no draw
 * call. `hide(range, mesh)`, if given, true leaves out more (a place that knows what its ground hides:
 * world/ardalur/sight.js). Returns the number of triangles now submitted.
 */
const MESH = 0, BOTH = 1, CARD = 2;
/**
 * What of a tree with a card `d` m away is drawn: MESH nearer than its band (cardBand), BOTH in it, CARD past it; what was drawn last
 * view stays CARD_HOLD past the band's end (it shows nothing there), so one at an end is not dropped and drawn by turns.
 */
function cardState(plant, d, cardFrom) {
  const [from, to] = cardBand(cardFrom);
  if (!plant) return d >= to ? CARD : d > from ? BOTH : MESH;
  if (plant.cardView === _view) return plant.state;
  plant.cardView = _view;
  const was = plant.epoch === _epoch ? plant.state : null;
  plant.epoch = _epoch;
  const mesh = d < to * (was === MESH || was === BOTH ? 1 + CARD_HOLD : 1);
  const card = d > from / (was === BOTH || was === CARD ? 1 + CARD_HOLD : 1);
  plant.state = !mesh ? CARD : card ? BOTH : MESH;
  return plant.state;
}

/** The place in plant.bands (finer first) of the level a plant `d` m away is drawn at; a finer one is kept to HYSTERESIS past its band. */
function bandOf(plant, d) {
  if (plant.levelView === _view) return plant.li;
  plant.levelView = _view;
  if (plant.levelEpoch !== _epoch) { plant.levelEpoch = _epoch; plant.li = -1; }
  let li = plant.bands.findIndex(([lo, hi]) => d >= lo && d < hi);
  if (plant.li >= 0 && li > plant.li && d < plant.bands[plant.li][1] * (1 + HYSTERESIS)) li = plant.li;
  plant.li = li;
  return li;
}

export function cullBatches(meshes, camera, margin = 1.5, hide = null, cardFrom = CARD_FROM, turn = 0) {
  const lean = Math.sin(Math.min(turn, Math.PI / 2)); // metres of slack a metre away
  _m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_m4);
  _cam.setFromMatrixPosition(camera.matrixWorld);
  _epoch = epochFor(meshes, _cam);
  // crowns in view, largest on screen first (one that was fine a little ahead of the others, so two of a size do not take turns)
  _view++;
  _crowns.length = 0;
  for (const mesh of meshes) {
    const data = mesh.userData.cull;
    const crownRanges = data.crownRanges ?? (data.crownRanges = data.ranges.filter(r => r.crown));
    for (let i = 0; i < crownRanges.length; i++) {
      const r = crownRanges[i];
      const c = r.crown;
      if (c.frame === _view) continue;
      if (r.carded && cardState(r.plant, _cam.distanceTo(r.ref), cardFrom) === CARD) continue; // a card alone this view
      c.prev = c.frame < 0 || c.epoch !== _epoch ? null : c.level;
      c.epoch = _epoch;
      c.frame = _view;
      const dist = _cam.distanceTo(c.centre);
      c.proj = c.size / Math.max(0.5, dist);
      c.rank = c.prev === 0 ? c.proj * (1 + HYSTERESIS) : c.proj;
      c.level = 2;
      c.shown = false;
      _sphere.set(c.centre, c.reach + margin + (lean ? lean * dist : 0));
      if (_frustum.intersectsSphere(_sphere)) _crowns.push(c);
    }
  }
  // which of them are on screen (one of their pieces in the frame itself, not only in the margin round it): those take the fine turns
  // first, so a crown just off screen never takes one from a crown the child sees
  if (_crowns.length) {
    for (const mesh of meshes) {
      const crownRanges = mesh.userData.cull.crownRanges;
      for (let i = 0; i < crownRanges.length; i++) {
        const r = crownRanges[i];
        const c = r.crown;
        if (c.frame === _view && !c.shown && _frustum.intersectsSphere(r.sphere)) c.shown = true;
      }
    }
    _crowns.sort((a, b) => b.shown - a.shown || b.rank - a.rank);
    const past = (prev, finer) => (prev !== null && prev <= finer ? 1 - HYSTERESIS : 1); // finer at the threshold, coarser past it
    for (let i = 0; i < _crowns.length; i++) {
      const c = _crowns[i];
      const want = i < CROWN_FINE && c.proj > CROWN_T0 * past(c.prev, 0) ? 0 : c.proj > CROWN_T1 * past(c.prev, 1) ? 1 : 2;
      c.level = Math.max(want, c.first);
    }
  }
  let total = 0;
  for (const mesh of meshes) {
    if (mesh.userData.twinOf) continue; // drawn with its mesh, below
    const data = mesh.userData.cull;
    const twin = mesh.userData.twin ?? null;
    let signature = 7, fading = 13;
    const keep = (data.kept ??= []);
    keep.length = 0;
    const fade = twin ? (twin.userData.cull.kept ??= []) : null;
    if (fade) fade.length = 0;
    const ranges = data.ranges;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      let both = false;
      if ((r.card || r.carded) && !r.only) { // (a tree only ever its card is its card at any distance)
        const state = cardState(r.plant, _cam.distanceTo(r.ref), cardFrom);
        if (r.card ? state === MESH : state === CARD) continue;
        both = state === BOTH;
      }
      if (r.crown) {
        if (r.lod !== r.crown.level) continue;
      } else if (r.plant && r.li >= 0) {
        if (bandOf(r.plant, _cam.distanceTo(r.ref)) !== r.li) continue;
      } else {
        const d = _cam.distanceTo(r.ref);
        if (d < r.minD || d >= r.maxD) continue;
      }
      if (r.cull !== Infinity) {
        // small plants fade out of the grass and mist at their own distance, HYSTERESIS past it once drawn, and come back at it
        const by = r.near === true && r.nearEpoch === _epoch ? 1 + HYSTERESIS : 1;
        r.near = _cam.distanceTo(r.sphere.center) - r.sphere.radius <= r.cull * by;
        r.nearEpoch = _epoch;
        if (!r.near) continue;
      }
      _sphere.copy(r.sphere);
      _sphere.radius += margin + (lean ? lean * _cam.distanceTo(r.sphere.center) : 0);
      if (!_frustum.intersectsSphere(_sphere)) continue;
      if (hide && hide(r, mesh)) continue;
      if (both && twin && r.carded) {
        // in the band its mesh leaves out the pixels its card takes: from the twin, whose material does (the plain one never does)
        fade.push(r);
        fading = (Math.imul(fading, 31) + i + 1) | 0;
        continue;
      }
      keep.push(r);
      signature = (Math.imul(signature, 31) + i + 1) | 0;
    }
    const n = rebuildIndex(mesh, keep, signature);
    mesh.visible = n > 0 && !mesh.userData.hidden;
    total += n;
    if (twin) {
      const m = rebuildIndex(twin, fade, fading);
      twin.visible = m > 0 && !mesh.userData.hidden;
      total += m;
    }
  }
  return total;
}

/**
 * The far layer's cull (mergeCardMeshes): the cards `keep(range)` lets in (those of the parts not drawn), in the frustum (grown by
 * `margin`), but those `hide(range, mesh)` leaves out. A part is drawn whenever a tree of it could be nearer than its band's end
 * (world/ardalur/index.js), so a card here is always whole, and no tree's state (cardState) is read or changed. Returns the
 * triangles now submitted.
 */
export function cullLayer(mesh, camera, { margin = 1.5, keep = () => true, hide = null } = {}) {
  _m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_m4);
  const data = mesh.userData.cull;
  const kept = (data.kept ??= []);
  kept.length = 0;
  let signature = 17;
  const ranges = data.ranges;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (!keep(r)) continue;
    _sphere.copy(r.sphere);
    _sphere.radius += margin;
    if (!_frustum.intersectsSphere(_sphere)) continue;
    if (hide && hide(r, mesh)) continue;
    kept.push(r);
    signature = (Math.imul(signature, 31) + i + 1) | 0;
  }
  const n = rebuildIndex(mesh, kept, signature);
  mesh.visible = n > 0 && !mesh.userData.hidden;
  return n;
}

/**
 * Shadow casters: a plant is kept when its shadow can land in the focus sphere, that is when it
 * stands within the focus radius of the sun ray through the focus centre, up-sun of the focus (or
 * inside it). Returns the triangles kept. The caller shows the casters only for the shadow pass.
 */
export function cullCasters(meshes, centre, radius, sunDir) {
  let total = 0;
  for (const mesh of meshes) {
    const data = mesh.userData.cull;
    let signature = 11;
    _casterKeep.length = 0;
    const ranges = data.ranges;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      _rel.copy(r.sphere.center).sub(centre);
      const t = _rel.dot(sunDir);
      const reach = radius + r.sphere.radius;
      if (t < -reach || t > radius * 4 + r.sphere.radius) continue;
      const lateral2 = _rel.lengthSq() - t * t;
      if (lateral2 > reach * reach) continue;
      _casterKeep.push(r);
      signature = (Math.imul(signature, 31) + i + 1) | 0;
    }
    total += rebuildIndex(mesh, _casterKeep, signature);
  }
  return total;
}
