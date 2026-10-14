import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';

// These checks inspect the shipped files, independently of the renderer/loader.
// They catch truncated downloads, hidden network dependencies, broken rigs and
// oversized source textures before a self-hosted mobile release is packaged.
const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const sizes = {5120:1, 5121:1, 5122:2, 5123:2, 5125:4, 5126:4};
const components = {SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT2:4, MAT3:9, MAT4:16};
const readers = {5120:'readInt8', 5121:'readUInt8', 5122:'readInt16LE', 5123:'readUInt16LE', 5125:'readUInt32LE', 5126:'readFloatLE'};
const normalize = (value, type) => type === 5120 ? Math.max(value / 127, -1) : type === 5121 ? value / 255 : type === 5122 ? Math.max(value / 32767, -1) : type === 5123 ? value / 65535 : value;

async function filesIn(directory) {
  const result = [];
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(filename));
    else result.push(filename);
  }
  return result;
}
function relative(filename) { return path.relative(dist, filename).replaceAll('\\', '/'); }
function localPath(uri, base = dist) {
  assert.equal(typeof uri, 'string');
  assert.ok(!/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(uri), `Asset must be a relative local file: ${uri}`);
  const resolved = path.resolve(base, decodeURIComponent(uri));
  assert.ok(resolved.startsWith(dist + path.sep), `Asset escapes the release: ${uri}`);
  return resolved;
}
async function resource(uri, base) {
  if (uri.startsWith('data:')) {
    assert.match(uri, /^data:[^,]+;base64,/);
    return Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  }
  return readFile(localPath(uri, base));
}
function dimensions(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      assert.equal(bytes[offset++], 255, 'Malformed JPEG marker');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      const length = bytes.readUInt16BE(offset);
      assert.ok(length >= 2, 'Malformed JPEG segment');
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
      offset += length;
    }
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
    if (kind === 'VP8L') { const bits = bytes.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
    if (kind === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  }
  throw new Error('Unrecognized embedded texture; add a dimension check before shipping it');
}

async function parseGLB(filename) {
  const bytes = await readFile(filename), label = relative(filename);
  assert.ok(bytes.length < 15 * 1024 * 1024, `${label}: exceeds the 15 MiB per-model mobile budget`);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${label}: GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${label}: GLB version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${label}: truncated or extra bytes`);
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    assert.ok(offset + 8 <= bytes.length, `${label}: truncated chunk header`);
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    assert.equal(length % 4, 0, `${label}: unaligned chunk`);
    assert.ok(offset + 8 + length <= bytes.length, `${label}: truncated chunk`);
    chunks.push({type, bytes:bytes.subarray(offset + 8, offset + 8 + length)});
    offset += length + 8;
  }
  assert.equal(chunks[0]?.type, 0x4e4f534a, `${label}: JSON must be first`);
  assert.equal(chunks.filter(chunk => chunk.type === 0x4e4f534a).length, 1);
  assert.ok(chunks.filter(chunk => chunk.type === 0x004e4942).length <= 1);
  const gltf = JSON.parse(chunks[0].bytes.toString('utf8').trim());
  assert.equal(gltf.asset?.version, '2.0');
  const binary = chunks.find(chunk => chunk.type === 0x004e4942)?.bytes;
  const buffers = await Promise.all((gltf.buffers || []).map(async (buffer, index) => {
    const data = buffer.uri ? await resource(buffer.uri, path.dirname(filename)) : binary;
    assert.ok(data, `${label}: missing buffer ${index}`);
    assert.ok(data.length >= buffer.byteLength, `${label}: short buffer ${index}`);
    return data;
  }));
  const ref = (array, index, what) => { assert.ok(Number.isInteger(index) && index >= 0 && index < (array?.length ?? 0), `${label}: invalid ${what} reference ${index}`); return array[index]; };
  for (const view of gltf.bufferViews || []) {
    const buffer = ref(buffers, view.buffer, 'buffer');
    assert.ok((view.byteOffset || 0) >= 0 && view.byteLength >= 0 && (view.byteOffset || 0) + view.byteLength <= buffer.length, `${label}: bufferView outside buffer`);
  }
  const cache = new Map();
  function accessor(index) {
    if (cache.has(index)) return cache.get(index);
    const spec = ref(gltf.accessors, index, 'accessor');
    const width = components[spec.type], size = sizes[spec.componentType];
    assert.ok(width && size && Number.isInteger(spec.count) && spec.count >= 0, `${label}: invalid accessor layout`);
    const values = new Float64Array(spec.count * width);
    const copy = (viewIndex, byteOffset, count, dest, select = i => i) => {
      const view = ref(gltf.bufferViews, viewIndex, 'bufferView'), buffer = buffers[view.buffer];
      const stride = view.byteStride || size * width;
      assert.ok(stride >= size * width && stride % size === 0, `${label}: invalid accessor stride`);
      assert.ok(byteOffset >= 0 && (count === 0 || byteOffset + (count - 1) * stride + width * size <= view.byteLength), `${label}: accessor outside bufferView`);
      for (let i = 0; i < count; i++) for (let c = 0; c < width; c++) {
        const value = buffer[readers[spec.componentType]]((view.byteOffset || 0) + byteOffset + i * stride + c * size);
        assert.ok(Number.isFinite(value), `${label}: non-finite accessor value`);
        dest[select(i) * width + c] = spec.normalized ? normalize(value, spec.componentType) : value;
      }
    };
    if (spec.bufferView !== undefined) copy(spec.bufferView, spec.byteOffset || 0, spec.count, values);
    if (spec.sparse) {
      const sparse = spec.sparse, indices = sparse.indices, view = ref(gltf.bufferViews, indices.bufferView, 'sparse indices');
      assert.ok([5121,5123,5125].includes(indices.componentType));
      const size = sizes[indices.componentType], offset = indices.byteOffset || 0, destinations = [];
      assert.ok(offset + sparse.count * size <= view.byteLength);
      for (let i = 0; i < sparse.count; i++) {
        const destination = buffers[view.buffer][readers[indices.componentType]]((view.byteOffset || 0) + offset + i * size);
        assert.ok(destination < spec.count && (i === 0 || destination > destinations[i - 1]), `${label}: invalid sparse destination`);
        destinations.push(destination);
      }
      copy(sparse.values.bufferView, sparse.values.byteOffset || 0, sparse.count, values, i => destinations[i]);
    }
    const result = {spec, width, values}; cache.set(index, result); return result;
  }
  return {filename, label, gltf, buffers, ref, accessor};
}
const inventory = (async () => {
  const all = await filesIn(dist), filenames = all.filter(filename => filename.endsWith('.glb'));
  assert.ok(filenames.length > 0, 'The release must contain the imported 3D models');
  const manifest = JSON.parse(await readFile(path.join(dist, 'assets', 'visual-assets.json'), 'utf8'));
  assert.equal(manifest.version, 1); assert.ok(Array.isArray(manifest.assets));
  return {all, manifest, models:await Promise.all(filenames.map(parseGLB))};
})();

test('every imported model is intact, self-contained and covered by explicit asset licensing', async () => {
  const {manifest, models} = await inventory, covered = new Map();
  for (const asset of manifest.assets) {
    for (const field of ['creator','source','license','modifications']) assert.ok(typeof asset[field] === 'string' && asset[field].trim(), `Missing asset provenance: ${field}`);
    if(asset.original===true){assert.equal(asset.license,'Project-original');assert.equal(asset.source,asset.licenseFile,'Original project assets include authored provenance');}
    else for (const field of ['source','licenseUrl']) assert.match(asset[field], /^https:\/\//, `Provenance URL: ${field}`);
    if (asset.licenseFile) assert.ok((await readFile(localPath(asset.licenseFile), 'utf8')).trim().length > 40, `Missing bundled license: ${asset.licenseFile}`);
    assert.ok(asset.files.length > 0);
    for (const file of asset.files) {
      const bytes = await readFile(localPath(file)); covered.set(file, asset);
      if (/\.(png|jpe?g|webp)$/i.test(file)) {
        const [width,height] = dimensions(bytes);
        assert.ok(width > 0 && height > 0 && width <= 2048 && height <= 2048, `${file}: ${width}x${height} texture exceeds the 2048px mobile budget`);
      }
    }
  }
  for (const model of models) {
    assert.ok(covered.has(model.label), `${model.label}: no asset license/provenance entry`);
    for (const linked of [...(model.gltf.buffers || []), ...(model.gltf.images || [])]) {
      if (linked.uri && !linked.uri.startsWith('data:')) {
        const file = relative(localPath(linked.uri, path.dirname(model.filename)));
        assert.ok(covered.has(file), `${file}: external model resource has no license/provenance entry`);
      }
    }
    for (const extension of model.gltf.extensionsRequired || []) assert.ok(['KHR_materials_unlit','KHR_mesh_quantization','KHR_texture_transform','KHR_materials_specular','KHR_materials_ior','KHR_materials_emissive_strength'].includes(extension), `${model.label}: unsupported required extension ${extension}`);
    for (const image of model.gltf.images || []) {
      let bytes;
      if (image.uri) bytes = await resource(image.uri, path.dirname(model.filename));
      else { const view = model.ref(model.gltf.bufferViews, image.bufferView, 'image'); bytes = model.buffers[view.buffer].subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength); }
      const [width, height] = dimensions(bytes);
      assert.ok(width > 0 && height > 0 && width <= 2048 && height <= 2048, `${model.label}: ${width}x${height} texture exceeds the 2048px mobile budget`);
    }
  }
});

test('imported geometry and skeletons contain valid finite data and safe references', async () => {
  const {models} = await inventory;
  for (const {label,gltf,ref,accessor} of models) {
    for (let i = 0; i < (gltf.accessors?.length || 0); i++) accessor(i);
    for (const mesh of gltf.meshes || []) for (const primitive of mesh.primitives) {
      const position = accessor(primitive.attributes.POSITION); assert.equal(position.width, 3); assert.ok(position.spec.count > 0);
      for (const attribute of Object.values(primitive.attributes)) assert.equal(accessor(attribute).spec.count, position.spec.count, `${label}: mismatched vertex attributes`);
      if (primitive.indices !== undefined) {
        const indices = accessor(primitive.indices);
        assert.equal(indices.spec.type, 'SCALAR'); assert.ok([5121,5123,5125].includes(indices.spec.componentType));
        for (const value of indices.values) assert.ok(Number.isInteger(value) && value >= 0 && value < position.spec.count, `${label}: mesh index outside vertices`);
      }
      if (primitive.material !== undefined) ref(gltf.materials, primitive.material, 'material');
    }
    for (const node of gltf.nodes || []) {
      for (const field of ['translation','rotation','scale','matrix']) for (const value of node[field] || []) assert.ok(Number.isFinite(value), `${label}: invalid node transform`);
      for (const child of node.children || []) ref(gltf.nodes, child, 'child');
      if (node.mesh !== undefined) ref(gltf.meshes, node.mesh, 'mesh');
      if (node.skin !== undefined) {
        const skin = ref(gltf.skins, node.skin, 'skin');
        assert.ok(skin.joints.length > 0 && skin.joints.length <= 256, `${label}: unsupported skeleton size`);
        for (const joint of skin.joints) ref(gltf.nodes, joint, 'joint');
        if (skin.inverseBindMatrices !== undefined) { const binds = accessor(skin.inverseBindMatrices); assert.equal(binds.spec.type, 'MAT4'); assert.equal(binds.spec.count, skin.joints.length); }
        for (const primitive of gltf.meshes[node.mesh].primitives) {
          const joints = accessor(primitive.attributes.JOINTS_0), weights = accessor(primitive.attributes.WEIGHTS_0);
          for (const joint of joints.values) assert.ok(Number.isInteger(joint) && joint >= 0 && joint < skin.joints.length, `${label}: vertex references missing joint`);
          for (let i = 0; i < weights.spec.count; i++) {
            let sum = 0; for (let c = 0; c < weights.width; c++) { const weight = weights.values[i * weights.width + c]; assert.ok(weight >= 0 && weight <= 1.001); sum += weight; }
            assert.ok(Math.abs(sum - 1) < .03, `${label}: vertex ${i} has unnormalized skin weights (${sum})`);
          }
        }
      }
    }
    assert.ok(gltf.scenes?.length > 0, `${label}: no renderable scene`);
    if (gltf.scene !== undefined) ref(gltf.scenes, gltf.scene, 'default scene');
    const visitState = new Uint8Array(gltf.nodes?.length || 0);
    function visit(index) {
      ref(gltf.nodes, index, 'scene node');
      assert.notEqual(visitState[index], 1, `${label}: cyclic node hierarchy`);
      if (visitState[index] === 2) return;
      visitState[index] = 1;
      for (const child of gltf.nodes[index].children || []) visit(child);
      visitState[index] = 2;
    }
    for (const scene of gltf.scenes) for (const node of scene.nodes || []) visit(node);
  }
});

test('animated dinosaurs ship real, finite animation tracks bound to their own rigs', async () => {
  const {models,manifest} = await inventory;
  const animatedFiles = new Set(manifest.assets.filter(asset => asset.category === 'dinosaur' && asset.animated === true).flatMap(asset => asset.files));
  assert.ok(animatedFiles.size > 0, 'The imported dinosaurs must include animated models');
  for (const {label,gltf,ref,accessor} of models) {
    if (animatedFiles.has(label)) { assert.ok(gltf.skins?.length > 0, `${label}: dinosaur lacks a skin`); assert.ok(gltf.animations?.length > 0, `${label}: dinosaur lacks animation clips`); }
    let changingChannels = 0;
    for (const animation of gltf.animations || []) {
      assert.ok(animation.channels.length > 0, `${label}: empty animation`);
      for (const channel of animation.channels) {
        ref(gltf.nodes, channel.target.node, 'animation target');
        assert.ok(['translation','rotation','scale','weights'].includes(channel.target.path));
        const sampler = ref(animation.samplers, channel.sampler, 'animation sampler');
        const input = accessor(sampler.input), output = accessor(sampler.output);
        assert.equal(input.spec.type, 'SCALAR'); assert.ok(input.values.length > 0);
        for (let i = 0; i < input.values.length; i++) assert.ok(input.values[i] >= 0 && (i === 0 || input.values[i] > input.values[i - 1]), `${label}: animation times must increase`);
        if (channel.target.path !== 'weights') {
          const expected = channel.target.path === 'rotation' ? 4 : 3;
          assert.equal(output.width, expected); assert.equal(output.spec.count, input.spec.count * (sampler.interpolation === 'CUBICSPLINE' ? 3 : 1));
        }
        if (input.values.at(-1) > 0 && output.values.some((value,index) => Math.abs(value - output.values[index % output.width]) > .00001)) changingChannels++;
      }
    }
    if (animatedFiles.has(label)) assert.ok(changingChannels > 0, `${label}: animation contains no actual motion`);
  }
});

test('authored ground and flight clips deform the actual skinned meshes without broken bounds', async () => {
  const {models,manifest} = await inventory;
  const animatedFiles = new Set(manifest.assets.filter(asset => asset.category === 'dinosaur' && asset.animated === true).flatMap(asset => asset.files));
  const loader = new GLTFLoader();
  // Texture decoding is browser QA. The vertex-coloured dinosaurs can be
  // posed by the real Three.js loader in Node, without mocking any skinning.
  for (const model of models.filter(model => animatedFiles.has(model.label) && !model.gltf.images?.length)) {
    const bytes = await readFile(model.filename);
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const mixer = new THREE.AnimationMixer(gltf.scene), box = new THREE.Box3();
    gltf.scene.updateMatrixWorld(true);
    const baseline = box.setFromObject(gltf.scene, true).getSize(new THREE.Vector3());
    const flying = model.label.includes('pteranodon');
    for (const name of flying ? ['idle','fly','glide','landing'] : ['idle','walk']) {
      const clip = gltf.animations.find(clip => clip.name === name);
      assert.ok(clip, `${model.label}: missing ${name} clip`);
      mixer.stopAllAction(); mixer.clipAction(clip).play();
      let firstBounds, changed = false;
      for (let i = 0; i < 8; i++) {
        mixer.setTime(clip.duration * i / 8); gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse(object => { if (object.isSkinnedMesh) object.skeleton.update(); });
        box.setFromObject(gltf.scene, true);
        const values = [...box.min.toArray(), ...box.max.toArray()], size = box.getSize(new THREE.Vector3());
        assert.ok(values.every(Number.isFinite), `${model.label}: invalid posed bounds in ${name}`);
        assert.ok(size.length() > baseline.length() * (flying ? .2 : .4) && size.length() < baseline.length() * 1.7, `${model.label}: collapsed or exploded ${name} pose`);
        if(!flying||name==='idle')assert.ok(box.min.y >= -baseline.y * .15 && box.min.y <= baseline.y * .25, `${model.label}: ${name} feet leave the ground plane`);
        if (!firstBounds) firstBounds = values;
        else if (values.some((value,index) => Math.abs(value - firstBounds[index]) > .0001)) changed = true;
      }
      assert.ok(changed, `${model.label}: ${name} tracks do not move the skinned mesh`);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
    gltf.scene.traverse(object => { if (object.isSkinnedMesh) object.skeleton.dispose(); });
  }
});
