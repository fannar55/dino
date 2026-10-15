import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { createPointResolver } from '../engine/points.js';

// The remake's baked characters, read without their textures (no DOM in Node), for tests that need
// more than one of them. The GLB's own JSON comes along for checks on what the file holds.
export const CHARACTERS = {
  mosi: 'mosi.glb',
  egill: 'egill.glb',
  gramedla: 'trex.glb',
  kambedla: 'stegosaurus.glb',
};

export function readGlb(name) {
  const glb = fs.readFileSync(new URL(`../assets/characters/${CHARACTERS[name]}`, import.meta.url));
  const jsonLength = glb.readUInt32LE(12);
  return { glb, jsonLength, json: JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) };
}

/** A fresh copy of a character (tests pose and move it). */
export function loadCharacter(name) {
  const { glb, jsonLength, json } = readGlb(name);
  const stripped = JSON.parse(JSON.stringify(json));
  delete stripped.images;
  delete stripped.textures;
  delete stripped.samplers;
  for (const material of stripped.materials ?? []) {
    delete material.normalTexture;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  let text = Buffer.from(JSON.stringify(stripped), 'utf8');
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const rest = glb.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + text.length + rest.length, 8);
  header.writeUInt32LE(text.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([header, text, rest]);
  return new Promise((resolve, reject) => new GLTFLoader().parse(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength), '', resolve, reject));
}

/** A world with nothing in it but flat ground, a camera and the point resolver. */
export function emptyWorld() {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  return world;
}

export const skinnedMeshOf = object => {
  let mesh = null;
  object.traverse(o => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  return mesh;
};
