import * as THREE from 'three';
import { DONE, Handle } from './handle.js';

// Kambeðla's plates lighting up row by row (scene 9: a glow flower for each row, first at the head and
// then back along her body). The bake marks every plate vertex with its row in the glTF attribute
// _PLATEROW, which three's loader names `_platerow`: 0 off the plates, 1 to N on the back plates counted
// from the head. Each plate has vertices of its own, so a triangle is all of one row (at every character
// LOD level too: they share the full skin's attributes) and the edge of a lit plate is a crisp line.
//
// addPlateGlow(actor) gives the actor's skin its own copy of the material (actors made from one file
// share theirs) and patches that in onBeforeCompile: no draw call and no texture are added. Only a
// plate's own fragments change (its row is 1 or more; the rest of the body never does). A row has a
// level from 0 to 1. At 0 its plates are dull and grey, `dull` of the way to a darker grey; at 1 they have
// their own colour back and the lilac glow is added to their emissive light, which reads in daylight
// without bloom.
//
// Levels ease on the game clock in update(dt), so a scene pauses and seeks with them. Register the glow
// with world.effects (engine/effects.js) and main.js's frame loop calls it, after the actors. setRow and
// setAll return a Handle (handle.js) that finishes when the ease ends.

const ATTRIBUTE = '_platerow';
export const MAX_ROWS = 8;
const DURATION = 0.8; // seconds a row takes to light
const GREY = 0.6; // an unlit plate heads for a grey this share of its own brightness
const KEY = 'plate-glow';

const VERTEX_HEAD = `attribute float ${ATTRIBUTE};
flat varying float vPlateRow;
`;
const FRAGMENT_HEAD = `uniform float uRowLevel[ ${MAX_ROWS} ];
uniform vec3 uPlateGlow;
uniform float uPlateDull;
flat varying float vPlateRow;
`;
// After the maps have made the colour and before the lights read it. Shader source stays ASCII.
const FRAGMENT_PLATES = `
	// The plates (plate-glow.js): only a plate's own fragments change.
	if ( vPlateRow > 0.5 ) {
		float plateLevel = uRowLevel[ int( clamp( vPlateRow + 0.5, 1.0, ${MAX_ROWS}.0 ) ) - 1 ];
		float plateGrey = ${GREY.toFixed(2)} * dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
		diffuseColor.rgb = mix( diffuseColor.rgb, vec3( plateGrey ), uPlateDull * ( 1.0 - plateLevel ) );
		totalEmissiveRadiance += uPlateGlow * plateLevel;
	}
`;

// Where the patch goes in three's standard shader. A three that has renamed one would leave the plates grey (or not compile), so
// the patch checks them first, as the glow flowers do (world/props/glow-flower.js), and says so instead.
const ANCHORS = { vertex: ['void main() {'], fragment: ['void main() {', '#include <emissivemap_fragment>'] };

function patch(shader, uniforms) {
  const missing = [
    ...ANCHORS.vertex.filter(anchor => !shader.vertexShader.includes(anchor)).map(anchor => `"${anchor}" in the vertex shader`),
    ...ANCHORS.fragment.filter(anchor => !shader.fragmentShader.includes(anchor)).map(anchor => `"${anchor}" in the fragment shader`),
  ];
  if (missing.length) {
    console.warn(`[plate-glow] three's standard shader has changed: the plates cannot light (no ${missing.join(', no ')})`);
    return;
  }
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', () => `${VERTEX_HEAD}void main() {\n\tvPlateRow = ${ATTRIBUTE};`);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', () => `${FRAGMENT_HEAD}void main() {`)
    .replace('#include <emissivemap_fragment>', chunk => `${chunk}${FRAGMENT_PLATES}`);
}

// A copy of `source` that glows. clone() leaves the callbacks out, so the copy carries over what
// patched `source` before: its onBeforeCompile runs first, and its program cache key (the source of its
// onBeforeCompile, unless it set one) leads ours, so programs only match when every patch does.
function glowing(source, uniforms) {
  const material = source.clone();
  const earlier = source.onBeforeCompile;
  const earlierKey = source.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey
    ? () => earlier.toString()
    : () => source.customProgramCacheKey.call(material);
  material.onBeforeCompile = (shader, renderer) => {
    earlier.call(material, shader, renderer);
    patch(shader, uniforms);
  };
  material.customProgramCacheKey = () => `${earlierKey()}|${KEY}`;
  return material;
}

const skinsBefore = new WeakMap(); // skin mesh -> the material it had before it glowed

const unit = (what, value) => {
  if (!Number.isFinite(value)) throw new TypeError(`The plates' ${what} is a number from 0 to 1, not ${String(value)}`);
  return Math.min(1, Math.max(0, value));
};
const seconds = value => {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`A plate glow lasts a number of seconds, not ${String(value)}`);
  return value;
};

/**
 * Make `actor`'s plates glow: { rows, setRow(index, level, { duration }), setAll(level, { duration }), update(dt) }.
 * Rows are counted from the head, from 0. Before any row is set the plates are dull and grey. `colour` is
 * the glow's; `dull` (0 to 1) is how far an unlit plate's own colour goes toward a darker grey.
 * Adding the glow to an actor that has one starts over from the skin's own material.
 */
export function addPlateGlow(actor, { colour = '#ab85c1', dull = 0.85 } = {}) {
  // The skin: the meshes with the attribute that are drawn with a standard material (a shadow caster
  // sharing the geometry, say, has another).
  const skins = [];
  actor.model.traverse(o => {
    if (o.isMesh && o.geometry.attributes[ATTRIBUTE] && o.material.isMeshStandardMaterial) skins.push(o);
  });
  let rows = 0;
  for (const { geometry } of skins) {
    const attribute = geometry.attributes[ATTRIBUTE];
    for (let i = 0; i < attribute.count; i++) rows = Math.max(rows, Math.round(attribute.getX(i)));
  }
  if (rows < 1) throw new Error(`${actor.name} has no plates to light: no skin carries a ${ATTRIBUTE} attribute with a row of 1 or more`);
  if (rows > MAX_ROWS) throw new RangeError(`${actor.name} has ${rows} plate rows; at most ${MAX_ROWS} can glow`);

  const levels = new Float32Array(MAX_ROWS); // what the shader reads: one level per row
  const uniforms = {
    uRowLevel: { value: levels },
    uPlateGlow: { value: new THREE.Color(colour) },
    uPlateDull: { value: unit('dullness', dull) },
  };
  for (const skin of skins) {
    const earlier = skinsBefore.get(skin);
    const own = earlier ?? skin.material;
    if (earlier) skin.material.dispose(); // the copy an earlier glow made
    skinsBefore.set(skin, own);
    skin.material = glowing(own, uniforms);
  }

  // Each ease moves some rows together, from where they were to their targets, over one duration. A row
  // is in one ease at a time: a new target takes it over, and an ease left with no rows is cancelled.
  const eases = new Set();

  function release(index) {
    for (const ease of eases) if (ease.rows.delete(index) && !ease.rows.size) ease.handle.cancel();
  }

  function move(targets, duration, label) {
    const rowsMoving = new Map();
    for (const [index, to] of targets) {
      release(index);
      if (duration > 0 && levels[index] !== Math.fround(to)) rowsMoving.set(index, { from: levels[index], to });
      else levels[index] = to;
    }
    if (!rowsMoving.size) return DONE;
    const ease = { rows: rowsMoving, time: 0, duration, handle: null };
    ease.handle = new Handle(label, () => eases.delete(ease));
    eases.add(ease);
    return ease.handle;
  }

  return {
    rows,
    /** The glow's colour, a THREE.Color the shader reads: set it to light the plates in another colour (the game's card colours). */
    colour: uniforms.uPlateGlow.value,
    /** Ease row `index` (0 is the row nearest the head) to `level` (0 dull and grey, 1 lit) over `duration` seconds. */
    setRow(index, level, { duration = DURATION } = {}) {
      if (!Number.isInteger(index) || index < 0 || index >= rows) throw new RangeError(`${actor.name} has plate rows 0 to ${rows - 1}, not ${String(index)}`);
      return move([[index, unit('level', level)]], seconds(duration), `${actor.name} plate row ${index + 1}`);
    },
    /** Ease every row to `level` together. */
    setAll(level, { duration = DURATION } = {}) {
      const to = unit('level', level);
      return move(Array.from({ length: rows }, (_, index) => [index, to]), seconds(duration), `${actor.name} plates`);
    },
    /** Advance the eases by dt game seconds. Returns true, as an effect does that goes on while the actor does. */
    update(dt) {
      if (!(dt > 0)) return true; // paused or frozen
      for (const ease of [...eases]) {
        ease.time += dt;
        const x = Math.min(1, ease.time / ease.duration);
        const eased = x * x * (3 - 2 * x);
        for (const [index, { from, to }] of ease.rows) levels[index] = x < 1 ? from + (to - from) * eased : to;
        if (x >= 1) {
          eases.delete(ease);
          ease.handle.finish();
        }
      }
      return true;
    },
  };
}
