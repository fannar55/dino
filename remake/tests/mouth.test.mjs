import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { SKIN_ATTRIBUTES, carriedAttributes } from '../tools/bake/attributes.js';
import { CHARACTERS, readGlb } from './characters.mjs';

// The mouth pass (remake/tools/bake/mouth.js) rebuilds a character's skin. Besides the five attributes it always keeps it
// carries only those its command names (attrs=, tools/bake/attributes.js): a bake may write others (Slóeðla's small back
// patch gets a plate row from quadruped-rig.js), and a character's rebake must come out as its record says.

const file = relative => new URL(relative, import.meta.url);
const MOUTH = fs.readFileSync(file('../tools/bake/mouth.js'), 'utf8');

// A skin's attributes as three's loader hands them over, with a plate row and one more of its own.
function skin() {
  const geometry = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['skinIndex', 4], ['skinWeight', 4], ['_platerow', 1], ['_wear', 1]]) {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(3 * size), size));
  }
  return geometry.attributes;
}

test('the mouth pass drops a skin\'s other attributes unless its command names them', () => {
  const attributes = skin();
  assert.deepEqual(SKIN_ATTRIBUTES, ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']);
  // Not asked: nothing beyond the five, whatever the skin has.
  for (const none of [null, undefined, '', ' ', [], ',']) assert.deepEqual(carriedAttributes(attributes, none), [], `attrs=${JSON.stringify(none)}`);
  // Asked: those named, in their order, once each, and nothing else.
  assert.deepEqual(carriedAttributes(attributes, '_platerow'), ['_platerow']);
  assert.deepEqual(carriedAttributes(attributes, '_wear, _platerow,_wear'), ['_wear', '_platerow']);
  assert.deepEqual(carriedAttributes(attributes, ['_platerow']), ['_platerow']);
  // A name the skin does not have stops the pass instead of being dropped without a word, and the five need no naming.
  assert.throws(() => carriedAttributes(attributes, '_PLATEROW'), /no attribute _PLATEROW/);
  assert.throws(() => carriedAttributes(attributes, '_plates'), /no attribute _plates/);
  assert.throws(() => carriedAttributes(attributes, 'uv'), /uv is one of the skin's own/);
  // mouth.js takes its list from there, from the query's attrs, and builds the skin from the five and that list alone.
  assert.match(MOUTH, /import \{ SKIN_ATTRIBUTES, carriedAttributes \} from '\.\/attributes\.js';/);
  assert.match(MOUTH, /const attrs = SKIN_ATTRIBUTES;/);
  assert.match(MOUTH, /const extras = carriedAttributes\(src\.attributes, params\.get\('attrs'\)\);/);
  assert.match(MOUTH, /const all = \[\.\.\.attrs, \.\.\.extras\];/);
  assert.equal(MOUTH.match(/setAttribute\(fileName\(name\)/g)?.length, 2, 'the carried attributes go into the body and the pocket, nothing more');
  assert.match(MOUTH, /for \(const name of extras\) mouthGeometry\.setAttribute\(fileName\(name\)/);
  assert.match(MOUTH, /for \(const name of extras\) body\.setAttribute\(fileName\(name\)/);
});

test('each character\'s mouth command names what its GLB carries beyond the five: Kambeðla her plate rows, the others nothing', () => {
  const extra = json => Object.keys(json.meshes[0].primitives[0].attributes)
    .filter(name => !['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].includes(name)).map(name => name.toLowerCase());
  let cut = 0;
  for (const [name, glb] of Object.entries(CHARACTERS)) {
    const record = JSON.parse(fs.readFileSync(file(`../assets/characters/${glb.replace('.glb', '-source.json')}`), 'utf8'));
    if (!record.mouthCommand) continue;
    cut++;
    const named = (new URLSearchParams(/--query "([^"]*)"/.exec(record.mouthCommand)[1]).get('attrs') ?? '').split(',').filter(Boolean);
    assert.deepEqual(named, name === 'kambedla' ? ['_platerow'] : [], `${name}'s mouth command ${name === 'kambedla' ? 'names her plate rows' : 'names no attribute'}`);
    assert.deepEqual(extra(readGlb(name).json), named, `${name}: the GLB carries what attrs= names, and only that`);
  }
  assert.equal(cut, 6, 'Mosi, Kambeðla, Þórseðla, Flugeðla, Slóeðla and Uggeðla went through the mouth pass');
});
