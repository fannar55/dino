// Far trees as cards: past FOREST.lod.cardFrom a tree is drawn as one camera-facing quad (4 vertices, 2 triangles) with a picture
// of its own coarse shape, not as its few hundred triangles. The pictures are made once, when the place is built, from the very
// models the meshes draw (createCardAtlas: every variant of the CARDED species, seen from the side, in one atlas), so a card and
// its tree have the same outline, size and colours. The batcher (batch.js) bakes each section's cards into one mesh and
// cullBatches draws a tree's card or its mesh by the same distance, never both.
import * as THREE from 'three';
import { patchLambert, LIGHT_GLOBALS } from './materials.js';

/** The species drawn as cards when far: the trees and tall plants that fill the land to the horizon. */
export const CARDED = ['broadleaf', 'araucaria', 'treeFern', 'swampConifer'];

const CELL = 128; // pixels a cell: a far tree is under 110 px tall at 16:10 (a 20 m tree at 150 m with the vista's 55°)
const COLUMNS = 8;
const MARGIN = 0.04; // of a cell on each side, so mip levels do not bleed between cells
const BAKE_LIGHT = new THREE.Vector3(-0.4, 0.8, 0.45).normalize(); // the picture's own soft form light (the card's lighting adds the sun)

/** The outline of a model: its widest reach round its foot (seen from above), its lowest and highest points, its mean colour. */
function extentOf(model) {
  let reach = 0, bottom = Infinity, top = -Infinity, r = 0, g = 0, b = 0, n = 0;
  for (const part of [model.solid, model.thin]) {
    if (!part?.count) continue;
    for (let i = 0; i < part.count; i++) {
      reach = Math.max(reach, Math.hypot(part.pos[i * 3], part.pos[i * 3 + 2]));
      bottom = Math.min(bottom, part.pos[i * 3 + 1]);
      top = Math.max(top, part.pos[i * 3 + 1]);
      r += part.col[i * 3]; g += part.col[i * 3 + 1]; b += part.col[i * 3 + 2]; n++;
    }
  }
  return { reach, bottom, top, colour: n ? [r / n, g / n, b / n] : [0.3, 0.4, 0.2] };
}

const BAKE_VERTEX = /* glsl */`
attribute vec3 aColour;
attribute float aExposure;
varying vec3 vColour;
varying float vExposure;
varying vec3 vNormal;
void main() {
  vColour = aColour;
  vExposure = aExposure;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;
const BAKE_FRAGMENT = /* glsl */`
uniform vec3 uLight;
varying vec3 vColour;
varying float vExposure;
varying vec3 vNormal;
vec3 toLinear( vec3 c ) { return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) ); }
void main() {
  // the inside of a crown is darker, as the meshes' sky share has it (look of the far level: gAmb 0.62 to 1)
  float shade = ( 0.62 + 0.38 * vExposure ) * ( 0.8 + 0.2 * dot( normalize( vNormal ), uLight ) );
  gl_FragColor = vec4( toLinear( min( vColour, vec3( 1.0 ) ) ) * shade, 1.0 );
}`;

/** A model's parts as one geometry for the bake: its own positions, normals, colours and sky exposure, moved and scaled into its cell. */
export function bakeGeometry(model, scale, dx, dy) {
  const parts = [model.solid, model.thin].filter(p => p?.count);
  const count = parts.reduce((n, p) => n + p.count, 0);
  const indices = parts.reduce((n, p) => n + p.idx.length, 0);
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3), exp = new Float32Array(count);
  const idx = new Uint32Array(indices);
  let v = 0, k = 0;
  for (const p of parts) {
    const base = v;
    for (let i = 0; i < p.count; i++, v++) {
      pos[v * 3] = p.pos[i * 3] * scale + dx;
      pos[v * 3 + 1] = p.pos[i * 3 + 1] * scale + dy;
      pos[v * 3 + 2] = p.pos[i * 3 + 2] * scale;
      for (let c = 0; c < 3; c++) {
        nrm[v * 3 + c] = p.nrm[i * 3 + c];
        col[v * 3 + c] = p.col[i * 3 + c];
      }
      exp[v] = p.exp[i];
    }
    for (let j = 0; j < p.idx.length; j++) idx[k++] = base + p.idx[j];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aColour', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aExposure', new THREE.BufferAttribute(exp, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/**
 * The pictures of the far trees. `entries` are { name, variant, model }: the model the meshes draw far off (the species library's
 * coarse level). With a WebGL renderer each is drawn once from the side into its cell of one sRGB atlas (with mip levels); without
 * one (the tests) each cell is its model's mean colour. Returns { texture, card(name, variant), dispose() }: card gives the cell's
 * picture { uv: [u0, v0, u1, v1], width, height, bottom } at scale 1, the width twice the model's reach round its foot (so the foot
 * stands in the middle of the card) and bottom the model's lowest point, or null for a model without a card.
 */
export function createCardAtlas(renderer, entries) {
  const rows = Math.max(1, Math.ceil(entries.length / COLUMNS));
  const cells = new Map();
  const inner = 1 - 2 * MARGIN;
  entries.forEach(({ name, variant, model }, i) => {
    const e = extentOf(model);
    const width = 2 * e.reach, height = e.top - e.bottom;
    const fit = inner / Math.max(width, height, 1e-3); // cell units a metre
    const cx = (i % COLUMNS) + 0.5, cy = Math.floor(i / COLUMNS) + MARGIN;
    const uv = [(cx - e.reach * fit) / COLUMNS, cy / rows, (cx + e.reach * fit) / COLUMNS, (cy + height * fit) / rows];
    cells.set(`${name}:${variant}`, { i, model, e, fit, cx, cy, card: { uv, width, height, bottom: e.bottom } });
  });
  let texture, target = null;
  if (renderer && typeof renderer.setRenderTarget === 'function') {
    target = new THREE.WebGLRenderTarget(COLUMNS * CELL, rows * CELL, {
      colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
    });
    const scene = new THREE.Scene();
    const material = new THREE.ShaderMaterial({ vertexShader: BAKE_VERTEX, fragmentShader: BAKE_FRAGMENT, uniforms: { uLight: { value: BAKE_LIGHT } }, side: THREE.DoubleSide });
    const mean = [0, 0, 0];
    for (const { model, e, fit, cx, cy } of cells.values()) {
      scene.add(new THREE.Mesh(bakeGeometry(model, fit, cx, cy - e.bottom * fit), material));
      e.colour.forEach((c, k) => { mean[k] += c / cells.size; });
    }
    // seen from the side (+z toward -z), one cell a unit; the clear colour is the trees' mean, so mip levels fade to green, not black
    const camera = new THREE.OrthographicCamera(0, COLUMNS, rows, 0, -100, 100);
    camera.position.z = 50;
    const was = { target: renderer.getRenderTarget(), colour: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
    renderer.setRenderTarget(target);
    renderer.setClearColor(new THREE.Color().setRGB(...mean, THREE.SRGBColorSpace), 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(was.target);
    renderer.setClearColor(was.colour, was.alpha);
    scene.traverse(o => o.geometry?.dispose());
    material.dispose();
    texture = target.texture;
  } else {
    const data = new Uint8Array(COLUMNS * rows * 4);
    for (const { i, e } of cells.values()) {
      e.colour.forEach((c, k) => { data[i * 4 + k] = Math.round(Math.min(1, c) * 255); });
      data[i * 4 + 3] = 255;
    }
    texture = new THREE.DataTexture(data, COLUMNS, rows);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }
  texture.name = 'Far tree cards';
  return {
    texture,
    card: (name, variant) => cells.get(`${name}:${variant}`)?.card ?? null,
    dispose() { if (target) target.dispose(); else texture.dispose(); },
  };
}

/**
 * The cards' material: the game's Lambert with the forest's own light (materials.js), the atlas as its map, cut out where the
 * picture is clear. Each card turns about its upright axis to face the camera (aCentre is its foot, aCorner the corner, -0.5 to
 * 0.5 across and 0 to 1 up, aSize its width and height in metres) and its normal leans up from the camera's side, so the sun lights
 * it as it lights a crown seen from the side. Fog as everything else.
 */
export function createCardMaterial(atlas, { up = 0.9 } = {}) {
  const material = new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.4 });
  material.name = 'far-tree-cards';
  return patchLambert(material, 'far-tree-cards', { uTranslucency: { value: 0.55 } }, {
    vertexHead: 'attribute vec2 aCorner;\nattribute vec2 aSize;',
    vertexAfter: [
      ['#include <beginnormal_vertex>', `
  vec3 cardToCamera = cameraPosition - position;
  cardToCamera.y = 0.0;
  float cardAway = length( cardToCamera );
  vec3 cardFace = cardAway > 1e-4 ? cardToCamera / cardAway : vec3( 0.0, 0.0, 1.0 );
  vec3 cardSide = vec3( cardFace.z, 0.0, -cardFace.x );
  objectNormal = normalize( cardFace + vec3( 0.0, ${up.toFixed(3)}, 0.0 ) );`],
      ['#include <begin_vertex>', `
  transformed = position + cardSide * ( aCorner.x * aSize.x ) + vec3( 0.0, aCorner.y * aSize.y, 0.0 );`],
    ],
    fragmentHead: LIGHT_GLOBALS,
  });
}
