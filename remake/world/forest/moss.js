// Hanging moss: pale strands under the lower tiers of the Fen's swamp conifers (species.js gives each conifer the points its
// strands hang from). Each strand is two crossed cards, alpha-tested against a small drawn texture of ragged strands, with
// alpha-to-coverage where the canvas has MSAA (STYLE.md 7). They sway with the forest's wind (materials.js: forestWind, the
// tree's own sway where they hang) and swing a little below that, at most FEN.mossCards.swingDeg degrees, with the plants'
// wave of the beat. Lit like foliage, so they glow when the sun is behind them. All of a forest's strands are one mesh, one
// draw call.
//
//   createHangingMoss(world, placements, shared, { antialias }) -> { mesh, cards, triangles, dispose() } | null (no conifers)
import * as THREE from 'three';
import { FOREST, FEN } from './config.js';
import { createRng } from './random.js';
import { patchLambert, WIND_GLSL, LIGHT_GLOBALS } from './materials.js';

const SEGMENTS = 3; // rows down a card
const SWAY = FOREST.wind.swayScale;

/** A drawn texture of hanging strands: ragged at the foot, a little lighter toward the tips (alpha in A). */
function strandTexture(seed) {
  const W = 64, H = 128;
  const rng = createRng(seed, 'moss-texture');
  const data = new Uint8Array(W * H * 4);
  // most strands hang from near the middle, so a strand of moss is a ragged beard and never shows the card's edges
  const strands = Array.from({ length: 18 }, () => {
    const x = Math.max(4, Math.min(W - 4, W / 2 + rng.normal() * W * 0.13));
    const middle = 1 - Math.abs(x - W / 2) / (W / 2);
    return { x, w: rng.range(1.6, 3.6), end: rng.range(0.45, 0.75) + 0.25 * middle * rng.next(), drift: rng.range(-4, 4), tone: rng.range(0.8, 1.1) };
  });
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1); // 0 at the top (where it hangs from), 1 at the foot
    for (let x = 0; x < W; x++) {
      let a = 0, tone = 1;
      for (const s of strands) {
        if (v > s.end) continue;
        const cx = s.x + s.drift * v * v + Math.sin(v * 9 + s.x) * 1.2;
        const w = s.w * (1 - 0.6 * (v / s.end));
        const d = Math.abs(x - cx) / Math.max(0.6, w);
        const k = Math.max(0, 1 - d) * (1 - Math.pow(v / s.end, 2));
        if (k > a) { a = k; tone = s.tone; }
      }
      const i = (y * W + x) * 4;
      const light = 0.85 + 0.25 * v;
      data[i] = Math.round(255 * Math.min(1, tone * light));
      data[i + 1] = Math.round(255 * Math.min(1, tone * light));
      data[i + 2] = Math.round(255 * Math.min(1, tone * light));
      data[i + 3] = Math.round(255 * Math.min(1, a * 1.6));
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createHangingMoss(world, placements, shared, { antialias = true, seed = 1 } = {}) {
  const pos = [], nrm = [], uv = [], col = [], wind = [], tree = [], idx = [];
  const base = new THREE.Color(FEN.hangingMoss);
  const swing = THREE.MathUtils.degToRad(FEN.mossCards.swingDeg);
  let cards = 0;
  for (const p of placements) {
    const strands = p.model.moss;
    if (!strands?.length) continue;
    const c = Math.cos(p.rot), s = Math.sin(p.rot), sc = p.scale;
    const H = p.model.height * sc;
    const phase = Math.round((p.phase % 1) * 255);
    strands.forEach((st, k) => {
      const ax = p.x + (st.p[0] * c - st.p[2] * s) * sc, ay = p.y + st.p[1] * sc, az = p.z + (st.p[0] * s + st.p[2] * c) * sc;
      const length = st.length * sc, width = st.width * sc;
      // the tree's sway where the strand hangs (species.js: bendAt), and the strand's own swing below it
      const carried = (FOREST.wind.maxSwayDeg * Math.PI / 180) * 0.85 * (st.p[1] * sc) ** 2 / Math.max(H, 0.5);
      const tint = 0.9 + 0.2 * ((k * 0.37 + p.phase) % 1);
      for (const turn of [0, Math.PI / 2]) {
        const yaw = st.yaw + p.rot + turn;
        const dx = Math.cos(yaw) * width * 0.5, dz = Math.sin(yaw) * width * 0.5;
        const n = [-Math.sin(yaw), 0.35, Math.cos(yaw)];
        const first = pos.length / 3;
        for (let r = 0; r <= SEGMENTS; r++) {
          const v = r / SEGMENTS;
          const sway = carried + swing * length * v * v;
          const narrow = 1 - 0.25 * v;
          for (const side of [-1, 1]) {
            pos.push(ax + dx * side * narrow, ay - length * v, az + dz * side * narrow);
            nrm.push(...n);
            uv.push((side + 1) / 2, v); // the texture's first row is where the strand hangs from
            col.push(base.r * tint, base.g * tint, base.b * tint);
            wind.push(phase, Math.round(Math.min(1, sway / SWAY) * 255), Math.round(Math.min(1, 0.25 * v) * 255), 204);
            tree.push(Math.round(Math.min(1, carried / Math.max(sway, 1e-6)) * 255));
          }
        }
        for (let r = 0; r < SEGMENTS; r++) {
          const a = first + r * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        cards++;
      }
    });
  }
  if (!cards) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute('aWind', new THREE.BufferAttribute(new Uint8Array(wind), 4, true));
  geometry.setAttribute('aTree', new THREE.BufferAttribute(new Uint8Array(tree), 1, true));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 1;
  const map = strandTexture(seed);
  const material = new THREE.MeshLambertMaterial({
    map, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: Boolean(antialias),
  });
  material.name = 'forest-moss';
  patchLambert(material, 'forest-moss', { ...shared }, {
    vertexHead: `attribute vec4 aWind;\nattribute float aTree;\n${WIND_GLSL}`,
    vertexAfter: [['#include <begin_vertex>', `
  vec3 mossRest = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  transformed += forestWind( mossRest, aWind, aTree );`]],
    fragmentHead: LIGHT_GLOBALS,
    fragmentAfter: [['#include <color_fragment>', `
  gLeaf = 0.8;
  gAmb = 0.9;`]],
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Hanging moss';
  mesh.renderOrder = 3;
  return {
    mesh, cards, triangles: idx.length / 3,
    dispose() { geometry.dispose(); material.dispose(); map.dispose(); },
  };
}
