// Far trees as cards: past FOREST.lod.cardFrom a tree is drawn as one camera-facing quad (4 vertices, 2 triangles) with a picture
// of its own coarse shape, not as its few hundred triangles. The pictures are made once, when the place is built, from the very
// models the meshes draw (createCardAtlas: every variant of the CARDED species, seen from the side, in one atlas), so a card and
// its tree have the same outline, size and colours; and they are lit as the tree is: a second atlas keeps, for every pixel of the
// picture, the normal, the sky share and the leaves of what the tree shows there, and the card's material lights it with the forest's
// own light from those (createCardMaterial). The batcher (batch.js) bakes each section's cards into one mesh and cullBatches draws a
// tree's card or its mesh by the same distance, and in a band round cardFrom both, each pixel showing one of them (CARD_BAND there).
import * as THREE from 'three';
import { patchLambert, LIGHT_GLOBALS, CARD_FADE_GLSL, DITHER_GLSL, WIND_GLSL, createCardFade } from './materials.js';

/**
 * The species drawn as cards when far: the trees and tall plants that fill the land to the horizon, and the bushes, cycads and snags
 * under and among them (with no card they would be drawn whole as far as their section is, and come and go with it).
 */
export const CARDED = ['broadleaf', 'araucaria', 'treeFern', 'swampConifer', 'bush', 'cycad', 'deadSnag'];

const CELL = 128; // pixels a cell: a far tree is under 110 px tall at 16:10 (a 20 m tree at 150 m with the vista's 55°)
const DEFAULT_COLUMNS = 8;
const MARGIN = 0.04; // of a cell on each side, so mip levels do not bleed between cells

/** The outline of a model: its widest reach round its foot (seen from above), its lowest and highest points, its mean colour and sky share. */
function extentOf(model) {
  let reach = 0, bottom = Infinity, top = -Infinity, r = 0, g = 0, b = 0, e = 0, n = 0;
  for (const part of [model.solid, model.thin]) {
    if (!part?.count) continue;
    for (let i = 0; i < part.count; i++) {
      reach = Math.max(reach, Math.hypot(part.pos[i * 3], part.pos[i * 3 + 2]));
      bottom = Math.min(bottom, part.pos[i * 3 + 1]);
      top = Math.max(top, part.pos[i * 3 + 1]);
      r += part.col[i * 3]; g += part.col[i * 3 + 1]; b += part.col[i * 3 + 2]; e += part.exp[i]; n++;
    }
  }
  return { reach, bottom, top, colour: n ? [r / n, g / n, b / n] : [0.3, 0.4, 0.2], exposure: n ? e / n : 0.7 };
}

const BAKE_VERTEX = /* glsl */`
attribute vec3 aColour;
attribute float aExposure;
attribute float aLeaf;
attribute float aSolid;
varying vec3 vColour;
varying float vExposure;
varying float vLeaf;
varying float vSolid;
varying vec3 vNormal;
void main() {
  vColour = aColour;
  vExposure = aExposure;
  vLeaf = aLeaf;
  vSolid = aSolid;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;
// the tree's own colour, unlit, as the vegetation material reads it (materials.js: its vertex colour from sRGB, and the painted
// leaves' far tone on the closed parts' leaves, uLeafTone), into an sRGB target
const BAKE_COLOUR = /* glsl */`
uniform float uLeafTone;
varying vec3 vColour;
varying float vLeaf;
varying float vSolid;
vec3 toLinear( vec3 c ) { return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) ); }
void main() {
  float tone = vSolid > 0.5 && vLeaf > 0.5 ? uLeafTone : 1.0;
  gl_FragColor = vec4( toLinear( min( vColour, vec3( 1.0 ) ) ) * tone, 1.0 );
}`;
// what the light needs: the normal toward the viewer (x right, y up; a thin part's back turned to face it, as the mesh's two-sided
// material does), the sky share and the leaves, into a linear target
const BAKE_DATA = /* glsl */`
varying float vExposure;
varying float vLeaf;
varying vec3 vNormal;
void main() {
  vec3 n = normalize( vNormal ) * ( gl_FrontFacing ? 1.0 : -1.0 );
  gl_FragColor = vec4( n.xy * 0.5 + 0.5, vExposure, vLeaf );
}`;

/**
 * A model's parts as one geometry for the bake: its own positions, normals, colours, sky exposure and leaves (the wind's leaf weight,
 * as the meshes' aWind.w), which part each vertex is of, moved and scaled into its cell.
 */
export function bakeGeometry(model, scale, dx, dy) {
  const parts = [model.solid, model.thin].filter(p => p?.count);
  const count = parts.reduce((n, p) => n + p.count, 0);
  const indices = parts.reduce((n, p) => n + p.idx.length, 0);
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3), exp = new Float32Array(count);
  const leaf = new Float32Array(count), solid = new Float32Array(count);
  const idx = new Uint32Array(indices);
  let v = 0, k = 0;
  for (const p of parts) {
    const base = v;
    const closed = p === model.solid ? 1 : 0;
    for (let i = 0; i < p.count; i++, v++) {
      pos[v * 3] = p.pos[i * 3] * scale + dx;
      pos[v * 3 + 1] = p.pos[i * 3 + 1] * scale + dy;
      pos[v * 3 + 2] = p.pos[i * 3 + 2] * scale;
      for (let c = 0; c < 3; c++) {
        nrm[v * 3 + c] = p.nrm[i * 3 + c];
        col[v * 3 + c] = p.col[i * 3 + c];
      }
      exp[v] = p.exp[i];
      leaf[v] = p.wind ? Math.min(1, p.wind[i * 3 + 2]) : 0;
      solid[v] = closed;
    }
    for (let j = 0; j < p.idx.length; j++) idx[k++] = base + p.idx[j];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aColour', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aExposure', new THREE.BufferAttribute(exp, 1));
  g.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 1));
  g.setAttribute('aSolid', new THREE.BufferAttribute(solid, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/**
 * The pictures of the far trees. `entries` are { name, variant, model }: the model the meshes draw far off (the species library's
 * coarse level). With a WebGL renderer each is drawn once from the side into its cell of two atlases (with mip levels): `texture`
 * (sRGB) its colour, unlit, and its outline in alpha; `data` (linear) for each pixel the normal toward the viewer (x, y in red and
 * green, as 0.5 + 0.5 n), the sky share (blue) and the leaves (alpha). Without one (the tests) each cell is its model's mean colour,
 * a normal toward the viewer, its mean sky share and leaves. `leafTone`: the painted leaves' far tone (materials.js leafMeanOf), by
 * which the closed parts' leaves are darker far off, as the plants' material draws them (1 where it has no leaf texture: the low
 * preset). Returns { texture, data, card(name, variant), cardOf(model), dispose() }: card gives the cell's picture { uv: [u0, v0, u1,
 * v1], width, height, bottom } at scale 1, the width twice the model's reach round its foot (so the foot stands in the middle of the
 * card) and bottom the model's lowest point, or null for a model without a card; cardOf the same for the very model of an entry (a
 * chapter's own tree or a prop, whose shape is not the variant's own). The first entry of a name and variant is the one card() gives.
 * `cell`: pixels a cell (CELL, for trees 150 m off and more; a place whose cards stand nearer has bigger ones), `columns` across.
 */
export function createCardAtlas(renderer, entries, { leafTone = 1, cell: CELL_PX = CELL, columns: COLUMNS = DEFAULT_COLUMNS } = {}) {
  const rows = Math.max(1, Math.ceil(entries.length / COLUMNS));
  const cells = new Map();
  const named = new Map(), byModel = new Map();
  const inner = 1 - 2 * MARGIN;
  entries.forEach(({ name, variant, model }, i) => {
    const e = extentOf(model);
    const width = 2 * e.reach, height = e.top - e.bottom;
    const fit = inner / Math.max(width, height, 1e-3); // cell units a metre
    const cx = (i % COLUMNS) + 0.5, cy = Math.floor(i / COLUMNS) + MARGIN;
    const uv = [(cx - e.reach * fit) / COLUMNS, cy / rows, (cx + e.reach * fit) / COLUMNS, (cy + height * fit) / rows];
    const cell = { i, model, e, fit, cx, cy, card: { uv, width, height, bottom: e.bottom } };
    cells.set(`${name}:${variant}:${i}`, cell);
    if (!named.has(`${name}:${variant}`)) named.set(`${name}:${variant}`, cell);
    byModel.set(model, cell);
  });
  const exposure = [...cells.values()].reduce((sum, { e }) => sum + e.exposure / cells.size, 0);
  let texture, data, targets = [];
  if (renderer && typeof renderer.setRenderTarget === 'function') {
    const target = colorSpace => new THREE.WebGLRenderTarget(COLUMNS * CELL_PX, rows * CELL_PX, {
      colorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
    });
    targets = [target(THREE.SRGBColorSpace), target(THREE.NoColorSpace)];
    const scene = new THREE.Scene();
    const colour = new THREE.ShaderMaterial({ vertexShader: BAKE_VERTEX, fragmentShader: BAKE_COLOUR, uniforms: { uLeafTone: { value: leafTone } }, side: THREE.DoubleSide });
    const light = new THREE.ShaderMaterial({ vertexShader: BAKE_VERTEX, fragmentShader: BAKE_DATA, side: THREE.DoubleSide });
    const mean = [0, 0, 0];
    for (const { model, e, fit, cx, cy } of cells.values()) {
      scene.add(new THREE.Mesh(bakeGeometry(model, fit, cx, cy - e.bottom * fit), colour));
      e.colour.forEach((c, k) => { mean[k] += c / cells.size; });
    }
    // seen from the side (+z toward -z), one cell a unit; the clear colour is the trees' mean, so mip levels fade to green, not black,
    // and the light's clear is a normal toward the viewer with the mean sky share and leaves, so they fade to that
    const camera = new THREE.OrthographicCamera(0, COLUMNS, rows, 0, -100, 100);
    camera.position.z = 50;
    const was = { target: renderer.getRenderTarget(), colour: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
    renderer.setRenderTarget(targets[0]);
    renderer.setClearColor(new THREE.Color().setRGB(...mean, THREE.SRGBColorSpace), 0);
    renderer.clear();
    renderer.render(scene, camera);
    scene.traverse(o => { if (o.isMesh) o.material = light; });
    renderer.setRenderTarget(targets[1]);
    renderer.setClearColor(new THREE.Color().setRGB(0.5, 0.5, exposure, THREE.LinearSRGBColorSpace), 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(was.target);
    renderer.setClearColor(was.colour, was.alpha);
    scene.traverse(o => o.geometry?.dispose());
    colour.dispose();
    light.dispose();
    [texture, data] = targets.map(t => t.texture);
  } else {
    const pixels = new Uint8Array(COLUMNS * rows * 4), light = new Uint8Array(COLUMNS * rows * 4);
    for (const { i, e, model } of cells.values()) {
      e.colour.forEach((c, k) => { pixels[i * 4 + k] = Math.round(Math.min(1, c) * 255); });
      pixels[i * 4 + 3] = 255;
      let leaves = 0, n = 0;
      for (const part of [model.solid, model.thin]) {
        if (!part?.count || !part.wind) continue;
        for (let v = 0; v < part.count; v++, n++) leaves += Math.min(1, part.wind[v * 3 + 2]);
      }
      light.set([128, 128, Math.round(e.exposure * 255), Math.round((n ? leaves / n : 1) * 255)], i * 4);
    }
    texture = new THREE.DataTexture(pixels, COLUMNS, rows);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    data = new THREE.DataTexture(light, COLUMNS, rows);
    data.needsUpdate = true;
  }
  texture.name = 'Far tree cards';
  data.name = 'Far tree cards: light';
  return {
    texture, data,
    card: (name, variant) => named.get(`${name}:${variant}`)?.card ?? null,
    cardOf: model => byModel.get(model)?.card ?? null,
    dispose() {
      if (targets.length) targets.forEach(t => t.dispose());
      else { texture.dispose(); data.dispose(); }
    },
  };
}

/**
 * The cards' material: the game's Lambert with the forest's own light (materials.js), the atlas as its map, cut out where the
 * picture is clear. Each card turns about its upright axis to face the camera (aCentre is its foot, aCorner the corner, -0.5 to
 * 0.5 across and 0 to 1 up, aSize its width and height in metres) and each of its pixels is lit as the tree's own surface there is:
 * its normal from the light atlas, turned into the view of the tree's middle (the picture's right is the card's right, or its left for
 * a card whose picture is mirrored: aCard.z; its toward-the-viewer the way to the camera, so from above a crown shows its top), its sky share (the atlas's, with the tree's own: aCard.y, as the batcher bakes the meshes' vertex alpha)
 * and its leaves (wrap and the glow through them). Fog as everything else. In the band round cardFrom it shows the pixels its tree's
 * mesh leaves out, or with `coverage` (MSAA) 2 share of each pixel's samples, clamped (aCard.x, the height of the tree's mid-height
 * over the card's foot; 0 for a card that is always all there, as the
 * horizon's): `fade` is the band's uniform the place shares with its plants (materials.js createCardFade). `haze`: what the place adds
 * after the fog, and far off the fog as at its foot ({ uniforms, head, glsl, vertex, key }; Árdalur's far land's haze,
 * world/ardalur/far-land.js createFarHaze), none by default. `wind`: a forest's shared uniforms (materials.js createSharedUniforms),
 * by whose wind each card's top bends as its tree's top does (forestWind, from the weights its mesh bakes: batch.js makeCards `wind`),
 * for cards that stand near enough for a sway to show; none by default (the valley's, 150 m off and more, stand still).
 */
export function createCardMaterial(atlas, { coverage = false, fade = createCardFade(), haze = null, wind = null } = {}) {
  // `coverage`: with MSAA (the tablet's preset) the cut-out's edge is alpha to coverage, soft and steady as the card moves, not a
  // hard edge that shimmers; without it (no samples to cover) it stays the plain cut-out
  const material = new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.4, alphaToCoverage: coverage });
  material.name = 'far-tree-cards';
  material.userData.cardFade = fade;
  const key = `far-tree-cards-lit${coverage ? '-a2c' : ''}${haze ? `-${haze.key}` : ''}${wind ? '-wind' : ''}`;
  const windUniforms = wind ? { uWindTime: wind.uWindTime, uWindStrength: wind.uWindStrength, uWindDirection: wind.uWindDirection, uBeats: wind.uBeats } : {};
  return patchLambert(material, key, { uTranslucency: { value: 0.55 }, uCardFade: fade, uCardData: { value: atlas.data }, ...haze?.uniforms, ...windUniforms }, {
    vertexHead: `${haze ? `${haze.head}\n` : ''}${wind ? `attribute vec4 aWind;\nattribute float aTree;\n${WIND_GLSL}\n` : ''}attribute vec2 aCorner;\nattribute vec2 aSize;\nattribute vec3 aCard;\nvarying vec3 vCardSide;\nvarying vec3 vCardUp;\nvarying vec3 vCardFace;\nvarying float vCardSky;\nvarying float vCardFade;\n${CARD_FADE_GLSL}`,
    vertexAfter: [
      ['#include <beginnormal_vertex>', `
  vec3 cardFoot = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
  vec3 cardToCamera = cameraPosition - cardFoot;
  cardToCamera.y = 0.0;
  float cardAway = length( cardToCamera );
  vec3 cardFace = cardAway > 1e-4 ? cardToCamera / cardAway : vec3( 0.0, 0.0, 1.0 );
  vec3 cardSide = vec3( cardFace.z, 0.0, -cardFace.x );
  // the light's frame is the view's own, from the tree's middle: seen from above, a crown shows the camera its top, whose normals lean up
  vec3 cardMiddle = cardFoot + vec3( 0.0, aCard.x > 0.0 ? aCard.x : 0.5 * aSize.y, 0.0 );
  vec3 cardView = normalize( cameraPosition - cardMiddle );
  vCardFace = cardView;
  vCardUp = cross( cardView, cardSide );
  vCardSide = cardSide * ( aCard.z < 0.0 ? -1.0 : 1.0 );
  vCardSky = aCard.y;
  vCardFade = aCard.x > 0.0 ? forestCardShare( distance( cardFoot + vec3( 0.0, aCard.x, 0.0 ), cameraPosition ) ) : 1.0;
  objectNormal = cardFace;`],
      ['#include <begin_vertex>', `
  transformed = position + cardSide * ( aCorner.x * aSize.x ) + vec3( 0.0, aCorner.y * aSize.y, 0.0 );${wind ? '\n  transformed += forestWind( cardFoot, aWind, aTree );' : ''}`],
      ...(haze?.vertex ? [['#include <fog_vertex>', haze.vertex('cardFoot', 'cardAway')]] : []),
    ],
    fragmentHead: `${LIGHT_GLOBALS}\n${haze ? `${haze.head}\n` : ''}uniform sampler2D uCardData;\nvarying vec3 vCardSide;\nvarying vec3 vCardUp;\nvarying vec3 vCardFace;\nvarying float vCardSky;\nvarying float vCardFade;\n${DITHER_GLSL}`,
    fragmentAfter: [
      // in the band: without MSAA the pixels its tree's mesh leaves out (materials.js); with it 2 share of each pixel's samples, so
      // over the band's first half it comes in behind the whole mesh and over the second the mesh goes out in front of it, whole
      coverage ? ['#include <alphatest_fragment>', '  diffuseColor.a *= clamp( 2.0 * vCardFade, 0.0, 1.0 );'] : ['#include <clipping_planes_fragment>', '  if ( forestDither() >= vCardFade ) discard;'],
      ['#include <map_fragment>', `
  vec4 cardLight = texture2D( uCardData, vMapUv );
  vec2 cardN = cardLight.xy * 2.0 - 1.0;
  vec3 cardNormal = normalize( vCardSide * cardN.x + vCardUp * cardN.y + vCardFace * sqrt( max( 0.0, 1.0 - dot( cardN, cardN ) ) ) );
  float cardSun = clamp( vCardSky + ( 1.0 - vCardSky ) * cardLight.z, 0.0, 1.0 );
  gSun = cardSun;
  gAmb = mix( 0.62, 1.0, cardSun );
  gLeaf = cardLight.w;`],
      ['#include <normal_fragment_maps>', '  normal = normalize( ( viewMatrix * vec4( cardNormal, 0.0 ) ).xyz );'],
      ...(haze ? [['#include <fog_fragment>', haze.glsl]] : []),
    ],
  });
}
